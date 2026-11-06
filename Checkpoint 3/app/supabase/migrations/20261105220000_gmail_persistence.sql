-- Versioned real-Gmail persistence. Fixture request/claim restrictions remain intact.
alter table public.storage_sources drop constraint storage_sources_subject_check;
alter table public.storage_sources add constraint storage_sources_subject_check check(length(subject)<=1000);
alter table public.storage_sources add column permission_metadata jsonb;
alter table private.storage_jobs add column gmail_guard jsonb;
alter table public.storage_extractions add column topic_relevance text not null default 'relevant' check(topic_relevance in ('relevant','irrelevant','uncertain'));
alter table public.tasks add column cancelled_at timestamptz;

create table public.gmail_task_changes (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 extraction_id uuid not null,evidence_id uuid not null,target_task_id uuid,expected_revision bigint,
 kind text not null check(kind in ('edit','cancel')),changed_fields jsonb not null,
 baseline jsonb,fields jsonb check(fields is null or private.valid_task_fields(fields)),reason text not null check(length(reason)<=350),
 state text not null default 'pending' check(state in ('pending','approved','dismissed')),
 revision bigint not null default 0,created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '30 days'),
 check((target_task_id is null)=(expected_revision is null)),
 foreign key(user_id,extraction_id) references public.storage_extractions(user_id,id) on delete cascade,
 foreign key(user_id,extraction_id,evidence_id) references public.storage_evidence(user_id,extraction_id,id),
 foreign key(user_id,target_task_id) references public.tasks(user_id,id) on delete cascade
);
alter table public.gmail_task_changes enable row level security;
revoke all on public.gmail_task_changes from public,anon,authenticated,service_role;
grant select on public.gmail_task_changes to authenticated;
create policy gmail_changes_owner_read on public.gmail_task_changes for select to authenticated using(user_id=auth.uid() and expires_at>now());

create table private.gmail_result_cache (
 user_id uuid not null references auth.users(id) on delete cascade,source_id uuid not null references public.storage_sources(id) on delete cascade,
 base_key text not null,extraction_id uuid not null references public.storage_extractions(id) on delete cascade,dependencies jsonb not null,
 primary key(user_id,source_id,base_key)
);
revoke all on private.gmail_result_cache from public,anon,authenticated,service_role;

create function private.gmail_permitted(meta jsonb,rules jsonb) returns boolean language sql immutable set search_path='' as $$
 select (rules->'allow'->'senders' ? lower(meta->>'from') or rules->'allow'->'domains' ? split_part(lower(meta->>'from'),'@',2))
 and not(rules->'block'->'senders' ? lower(meta->>'from') or rules->'block'->'domains' ? split_part(lower(meta->>'from'),'@',2))
 and not exists(select 1 from jsonb_array_elements_text(rules->'block'->'subjectKeywords') v where position(lower(v) in lower(meta->>'subject'))>0);
$$;


create function private.gmail_task_sources_current(p_user uuid,p_task uuid,p_rules jsonb) returns boolean
language sql stable set search_path='' as $$
 select not exists(
  select 1 from (
   select e.source_id from public.storage_task_sources ts join public.storage_suggestions sg on sg.user_id=ts.user_id and sg.id=ts.suggestion_id
    join public.storage_extractions e on e.user_id=sg.user_id and e.id=sg.extraction_id where ts.user_id=p_user and ts.task_id=p_task
   union select e.source_id from public.gmail_task_changes ch join public.storage_extractions e on e.id=ch.extraction_id and e.user_id=ch.user_id
    where ch.user_id=p_user and ch.target_task_id=p_task and ch.state='approved'
  ) links join public.storage_sources src on src.id=links.source_id and src.user_id=p_user
  where src.namespace<>'gmail' or src.deleted_at is not null or src.permission_metadata is null
   or exists(select 1 from private.storage_source_suppressions where user_id=p_user and source_id=src.id)
   or exists(select 1 from jsonb_array_elements(src.permission_metadata) m where private.gmail_permitted(m,p_rules) is distinct from true)
 );
$$;
create function public.gmail_task_context(p_user uuid,p_lease uuid,p_meta jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.gmail_scan_service(p_user,'assert',jsonb_build_object('lease',p_lease));
 select coalesce(jsonb_agg(doc),'[]') into result from (
 select jsonb_build_object('id',t.id,'revision',t.revision,'acceptedFields',t.accepted_fields,
 'userEdited',t.accepted_fields is distinct from original.fields,'sources', provenance.sources) doc
 from public.tasks t left join public.storage_suggestions original on original.user_id=t.user_id and original.id=t.origin_suggestion_id
 cross join lateral (
  select jsonb_agg(distinct m.value) sources,bool_or(src.deleted_at is not null or exists(select 1 from private.storage_source_suppressions ss where ss.user_id=t.user_id and ss.source_id=src.id)) blocked from (
   select e.source_id from public.storage_task_sources ts join public.storage_suggestions sg on sg.user_id=ts.user_id and sg.id=ts.suggestion_id
    join public.storage_extractions e on e.user_id=sg.user_id and e.id=sg.extraction_id where ts.user_id=t.user_id and ts.task_id=t.id
   union select e.source_id from public.gmail_task_changes ch join public.storage_extractions e on e.id=ch.extraction_id and e.user_id=ch.user_id
    where ch.user_id=t.user_id and ch.target_task_id=t.id and ch.state='approved'
  ) links join public.storage_sources src on src.id=links.source_id and src.user_id=t.user_id
  cross join lateral jsonb_array_elements(coalesce(src.permission_metadata,'[]')) m
  where src.namespace='gmail'
 ) provenance
 where t.user_id=p_user and t.status='approved' and t.cancelled_at is null and t.deleted_at is null and t.accepted_fields is not null
 and provenance.blocked is not true
 and exists(select 1 from jsonb_array_elements(provenance.sources) m where m->>'threadId'=p_meta->>'threadId')
 order by t.updated_at desc,t.id limit 21
 ) bounded;
 return result;
end; $$;
create function private.gmail_storage_claim(p_user_id uuid,p_key text,p_config text,p_meta jsonb,p_reserve integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prefs public.storage_preferences; job private.storage_jobs; budget private.storage_usage;
  src uuid; previous uuid; owner_email text; day date := (now() at time zone 'UTC')::date;
  v_window timestamptz:=date_trunc('minute',now()); provider_limit integer; provider_used integer;
begin
  -- Only fixed fixtures are accepted until Gmail's authorization contract exists.
  if p_key !~ '^[0-9a-f]{64}$' or p_config !~ '^[0-9a-f]{64}$'
    or p_meta->>'namespace' <> 'gmail' or p_meta->>'messageId' !~ '^[A-Za-z0-9_-]{1,100}$'
    or p_meta->>'model' !~ '^[a-z0-9.-]{1,100}$'
    or p_reserve not between 1 and 150000 then raise exception 'INVALID_STORAGE_REQUEST' using errcode='22023'; end if;
  select email into owner_email from auth.users where id=p_user_id;
  if owner_email is null then raise exception 'OWNER_UNAVAILABLE' using errcode='42501'; end if;
  insert into public.storage_preferences(user_id) values(p_user_id) on conflict do nothing;
  select * into prefs from public.storage_preferences where user_id=p_user_id for update;
  if not prefs.enabled then return jsonb_build_object('state','paused'); end if;
  if exists(select 1 from private.storage_source_suppressions ss join public.storage_sources src on src.id=ss.source_id and src.user_id=ss.user_id
    where ss.user_id=p_user_id and src.namespace='gmail' and src.connection_key=p_meta->>'connectionKey' and src.message_id=p_meta->>'messageId') then
    return jsonb_build_object('state','suppressed'); end if;
  if exists(select 1 from private.storage_suppressions where user_id=p_user_id and extraction_key=p_key) then
    return jsonb_build_object('state','suppressed'); end if;
  select id into previous from public.storage_extractions where user_id=p_user_id and extraction_key=p_key;
  if previous is not null then return jsonb_build_object('state','cached','receipt',private.storage_receipt(p_user_id,previous)); end if;
  select * into job from private.storage_jobs where user_id=p_user_id and extraction_key=p_key for update;
  if job.id is not null and job.attempts>=3 then return jsonb_build_object('state','attempt_limit'); end if;
  if job.id is not null and job.retry_after>now() then return jsonb_build_object('state','retry_later','retryAt',job.retry_after); end if;
  if exists(select 1 from private.storage_jobs where user_id=p_user_id and state='processing' and lease_until>now()) then
    return jsonb_build_object('state','busy'); end if;
  insert into private.storage_usage(user_id,usage_day) values(p_user_id,day) on conflict do nothing;
  select * into budget from private.storage_usage where user_id=p_user_id and usage_day=day for update;
  if budget.requests>=prefs.daily_requests or budget.charged_or_reserved_tokens+p_reserve>prefs.daily_tokens then
    return jsonb_build_object('state','budget_deferred','resetAt',(day+1)::timestamp at time zone 'UTC'); end if;
  insert into private.storage_provider_limits(model) values(p_meta->>'model') on conflict do nothing;
  select requests_per_minute into provider_limit from private.storage_provider_limits where model=p_meta->>'model' for update;
  select requests into provider_used from private.storage_provider_usage u where u.model=p_meta->>'model' and u.window_start=v_window;
  if coalesce(provider_used,0)>=provider_limit then return jsonb_build_object('state','provider_deferred','retryAt',v_window+interval '1 minute'); end if;
  insert into private.storage_provider_usage(model,window_start,requests) values(p_meta->>'model',v_window,1)
    on conflict(model,window_start) do update set requests=storage_provider_usage.requests+1;
  insert into public.storage_sources(user_id,namespace,connection_key,message_id,thread_id,subject,sender,sent_at)
    values(p_user_id,'gmail',p_meta->>'connectionKey',p_meta->>'messageId',p_meta->>'threadId',p_meta->>'subject',p_meta->>'sender',(p_meta->>'sentAt')::timestamptz)
    on conflict(user_id,namespace,connection_key,message_id) do update set message_id=excluded.message_id returning id into src;
  insert into private.storage_jobs(user_id,source_id,extraction_key,config_key,owner_email,generation,state,reserved_tokens)
    values(p_user_id,src,p_key,p_config,owner_email,prefs.generation,'processing',p_reserve)
    on conflict(user_id,extraction_key) do update set state='processing',generation=prefs.generation,
      owner_email=excluded.owner_email,attempts=storage_jobs.attempts+1,lease_token=gen_random_uuid(),
      lease_until=now()+interval '90 seconds',retry_after=null,reserved_tokens=p_reserve,usage_day=day,safe_error=null,updated_at=now()
    returning * into job;
  update private.storage_attempts set state='unknown',finished_at=now() where job_id=job.id and state='processing';
  insert into private.storage_attempts(job_id,user_id,attempt,lease_token,usage_day,reserved_tokens)
    values(job.id,p_user_id,job.attempts,job.lease_token,day,p_reserve);
  update private.storage_usage set requests=requests+1,charged_or_reserved_tokens=charged_or_reserved_tokens+p_reserve
    where user_id=p_user_id and usage_day=day;
  return jsonb_build_object('state','claimed','jobId',job.id,'leaseToken',job.lease_token);
end; $$;

create or replace function private.storage_finish(p_user_id uuid,p_job_id uuid,p_lease uuid,p_output jsonb,p_meta jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.storage_jobs; prefs public.storage_preferences; result jsonb; item jsonb;
  extraction uuid; eid uuid; wid uuid; i integer; total bigint;
begin
  select * into prefs from public.storage_preferences where user_id=p_user_id for update;
  select * into job from private.storage_jobs where id=p_job_id and user_id=p_user_id for update;
  if job.id is null or job.lease_token is distinct from p_lease then raise exception 'STALE_JOB' using errcode='PT409'; end if;
  if job.state='succeeded' then
    select id into extraction from public.storage_extractions where user_id=p_user_id and extraction_key=job.extraction_key;
    return private.storage_receipt(p_user_id,extraction);
  end if;
  if prefs.user_id is null or not prefs.enabled or prefs.generation<>job.generation
    or job.state<>'processing' or job.lease_until<=now()
    or exists(select 1 from private.storage_source_suppressions where user_id=p_user_id and source_id=job.source_id)
    then raise exception 'STALE_JOB' using errcode='PT409'; end if;
  result:=p_output->'result';
  if octet_length(p_output::text)>100000 or p_output->>'status'<>'extracted'
    or result->>'category' not in ('Actionable','Passive')
    or jsonb_typeof(result->'tasks')<>'array' or jsonb_array_length(result->'tasks')>20
    or jsonb_typeof(result->'waitingFor')<>'array' or jsonb_array_length(result->'waitingFor')>20
    or jsonb_typeof(result->'suggestedFollowUps')<>'array' or jsonb_array_length(result->'suggestedFollowUps')>20
    or (result->>'category'='Passive' and jsonb_array_length(result->'tasks')>0)
    or (result->>'category'='Actionable' and jsonb_array_length(result->'tasks')=0 and p_output->>'contract' is distinct from 'gmail-v1') then
    raise exception 'INVALID_EXTRACTION' using errcode='22023'; end if;
  insert into public.storage_extractions(user_id,source_id,extraction_key,config_key,version,model,returned_model,
    analysis_time,category,classification_confidence,summary,needs_review,warnings)
    values(p_user_id,job.source_id,job.extraction_key,job.config_key,p_meta->>'version',p_meta->>'model',p_output->>'returnedModelVersion',
      (p_meta->>'analysisTime')::timestamptz,result->>'category',(result->>'confidence')::integer,result->>'summary',
      (p_output->>'needsReview')::boolean,coalesce(p_output->'contextWarnings','[]'::jsonb)||coalesce(result->'uncertainties','[]'::jsonb))
    returning id into extraction;
  perform private.storage_evidence_add(p_user_id,extraction,result->'evidence');
  i:=0;
  for item in select value from jsonb_array_elements(result->'tasks') loop
    if lower(item->>'owner') is distinct from lower(job.owner_email) then raise exception 'INVALID_OWNER' using errcode='22023'; end if;
    eid:=private.storage_evidence_add(p_user_id,extraction,item->'evidence');
    insert into public.storage_suggestions(user_id,extraction_id,item_index,fields,evidence_id)
      values(p_user_id,extraction,i,item-'owner'-'evidence',eid);
    i:=i+1;
  end loop;
  i:=0;
  for item in select value from jsonb_array_elements(result->'waitingFor') loop
    if lower(item->>'owner')=lower(job.owner_email) then raise exception 'INVALID_WAITING_OWNER' using errcode='22023'; end if;
    eid:=private.storage_evidence_add(p_user_id,extraction,item->'evidence');
    insert into public.storage_waiting_for(user_id,extraction_id,item_index,action,external_owner,promised_deadline,evidence_id)
      values(p_user_id,extraction,i,item->>'action',item->>'owner',nullif(item->'promisedDeadline','null'::jsonb),eid);
    i:=i+1;
  end loop;
  for item in select value from jsonb_array_elements(result->'suggestedFollowUps') loop
    select id into wid from public.storage_waiting_for where user_id=p_user_id and extraction_id=extraction
      and item_index=(item->>'waitingForIndex')::integer and external_owner=item->>'recipient';
    if wid is null then raise exception 'INVALID_FOLLOWUP' using errcode='22023'; end if;
    eid:=private.storage_evidence_add(p_user_id,extraction,item->'evidence');
    insert into public.storage_followups(user_id,waiting_for_id,action,recipient,rationale,evidence_id)
      values(p_user_id,wid,item->>'action',item->>'recipient',item->>'rationale',eid);
  end loop;
  total:=case when jsonb_typeof(p_output->'usage'->'totalTokens')='number' then (p_output->'usage'->>'totalTokens')::bigint else job.reserved_tokens end;
  if total<0 then raise exception 'INVALID_USAGE' using errcode='22023'; end if;
  update private.storage_usage set charged_or_reserved_tokens=charged_or_reserved_tokens-job.reserved_tokens+total
    where user_id=p_user_id and usage_day=job.usage_day;
  update private.storage_jobs set state='succeeded',updated_at=now() where id=job.id;
  update private.storage_attempts set state='succeeded',finished_at=now(),reported_tokens=
    case when jsonb_typeof(p_output->'usage'->'totalTokens')='number' then total else null end
    where job_id=job.id and lease_token=p_lease;
  return private.storage_receipt(p_user_id,extraction);
end; $$;


create function public.gmail_process_claim(p_user uuid,p_scan uuid,p_key text,p_base text,p_config text,p_meta jsonb,p_reserve integer,p_guard jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare settings public.scan_settings; connection private.google_connections; src public.storage_sources;
 cached private.gmail_result_cache; dep record; current_revision bigint; valid boolean:=true; claimed jsonb;
begin
 perform public.gmail_scan_service(p_user,'assert',jsonb_build_object('lease',p_scan));
 select * into settings from public.scan_settings where user_id=p_user;
 select * into connection from private.google_connections where user_id=p_user;
 if jsonb_typeof(p_guard->'metadata') is distinct from 'array' or jsonb_array_length(p_guard->'metadata') not between 1 and 11
  or exists(select 1 from jsonb_array_elements(p_guard->'metadata') m where private.gmail_permitted(m,settings.rules) is distinct from true)
  or jsonb_typeof(p_guard->'tasks') is distinct from 'array' or jsonb_array_length(p_guard->'tasks')>10
  or p_base !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_GMAIL_GUARD' using errcode='22023'; end if;
 p_meta:=p_meta||jsonb_build_object('connectionKey',connection.subject,'namespace','gmail');
 select * into src from public.storage_sources where user_id=p_user and namespace='gmail' and connection_key=connection.subject and message_id=p_meta->>'messageId';
 if src.deleted_at is not null or exists(select 1 from private.storage_source_suppressions where user_id=p_user and source_id=src.id) then return jsonb_build_object('state','suppressed'); end if;
 -- All dependencies are owned/current before inference, including candidate tasks not ultimately selected.
 for dep in select value from jsonb_array_elements(p_guard->'tasks') loop
  perform 1 from public.tasks where user_id=p_user and id=(dep.value->>'id')::uuid and revision=(dep.value->>'revision')::bigint
   and status='approved' and cancelled_at is null and deleted_at is null and accepted_fields=dep.value->'acceptedFields' and private.gmail_task_sources_current(p_user,id,settings.rules) for update;
  if not found then raise exception 'STALE_TASK_CONTEXT' using errcode='PT409'; end if;
 end loop;
 select * into cached from private.gmail_result_cache where user_id=p_user and source_id=src.id and base_key=p_base;
 if cached.extraction_id is not null then
  if exists(select 1 from jsonb_array_elements(p_guard->'tasks') v where not exists(select 1 from jsonb_array_elements(cached.dependencies) old where old->>'id'=v->>'id')) then valid:=false; end if;
  for dep in select value from jsonb_array_elements(cached.dependencies) loop
   select revision into current_revision from public.tasks where user_id=p_user and id=(dep.value->>'id')::uuid and deleted_at is null;
   if current_revision is distinct from (dep.value->>'revision')::bigint and not exists(
    select 1 from public.gmail_task_changes ch join public.tasks t on t.id=ch.target_task_id and t.user_id=ch.user_id
    where ch.user_id=p_user and ch.extraction_id=cached.extraction_id and ch.target_task_id=(dep.value->>'id')::uuid
    and ch.state='approved' and t.revision=ch.expected_revision+1 and ((ch.kind='edit' and t.accepted_fields=ch.fields) or (ch.kind='cancel' and t.cancelled_at is not null)) and t.deleted_at is null
   ) then valid:=false; end if;
  end loop;
  if valid then return jsonb_build_object('state','cached','receipt',private.storage_receipt(p_user,cached.extraction_id)); end if;
 end if;
 if p_guard->>'allowInference' is distinct from 'true' then return jsonb_build_object('state','inference_deferred'); end if;
 claimed:=private.gmail_storage_claim(p_user,p_key,p_config,p_meta,p_reserve);
 if claimed->>'state'='claimed' then
  update public.storage_sources set permission_metadata=p_guard->'metadata' where user_id=p_user and id=(select source_id from private.storage_jobs where id=(claimed->>'jobId')::uuid);
  update private.storage_jobs set gmail_guard=p_guard||jsonb_build_object('scanLease',p_scan,'baseKey',p_base) where id=(claimed->>'jobId')::uuid and user_id=p_user;
 end if;
 return claimed;
end; $$;


create function public.gmail_process_assert(p_user uuid,p_job uuid,p_lease uuid) returns void
language plpgsql security definer set search_path='' as $$
declare job private.storage_jobs; rules jsonb; dep record; connection_subject text;
begin
 perform 1 from public.storage_preferences where user_id=p_user for update;
 select * into job from private.storage_jobs where user_id=p_user and id=p_job;
 if job.gmail_guard is null or job.lease_token is distinct from p_lease or job.state<>'processing' or job.lease_until<=now() then raise exception 'STALE_GMAIL_JOB' using errcode='PT409'; end if;
 perform public.gmail_scan_service(p_user,'assert',jsonb_build_object('lease',job.gmail_guard->'scanLease'));
 select s.rules into rules from public.scan_settings s where s.user_id=p_user;
 select subject into connection_subject from private.google_connections where user_id=p_user;
 if exists(select 1 from jsonb_array_elements(job.gmail_guard->'metadata') m where private.gmail_permitted(m,rules) is distinct from true
   or exists(select 1 from public.storage_sources src join private.storage_source_suppressions ss on ss.source_id=src.id and ss.user_id=src.user_id
     where src.user_id=p_user and src.namespace='gmail' and src.connection_key=connection_subject and src.message_id=m->>'id'))
 then raise exception 'STALE_GMAIL_PERMISSION' using errcode='PT409'; end if;
 for dep in select value from jsonb_array_elements(job.gmail_guard->'tasks') loop
  perform 1 from public.tasks where user_id=p_user and id=(dep.value->>'id')::uuid and revision=(dep.value->>'revision')::bigint
   and accepted_fields=dep.value->'acceptedFields' and status='approved' and cancelled_at is null and deleted_at is null
   and private.gmail_task_sources_current(p_user,id,rules) for update;
  if not found then raise exception 'STALE_TASK_CONTEXT' using errcode='PT409'; end if;
 end loop;
end; $$;
create function public.gmail_process_finish(p_user uuid,p_job uuid,p_lease uuid,p_output jsonb,p_meta jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.storage_jobs; dep record; ch jsonb; receipt jsonb; ext uuid; eid uuid; target public.tasks; rules jsonb;
begin
 perform 1 from public.storage_preferences where user_id=p_user for update;
 select * into job from private.storage_jobs where id=p_job and user_id=p_user;
 if job.gmail_guard is null or job.lease_token is distinct from p_lease then raise exception 'STALE_GMAIL_JOB' using errcode='PT409'; end if;
 perform public.gmail_scan_service(p_user,'assert',jsonb_build_object('lease',job.gmail_guard->'scanLease'));
 select s.rules into rules from public.scan_settings s where s.user_id=p_user;
 if exists(select 1 from jsonb_array_elements(job.gmail_guard->'metadata') m where private.gmail_permitted(m,rules) is distinct from true) then raise exception 'STALE_GMAIL_PERMISSION' using errcode='PT409'; end if;
 for dep in select value from jsonb_array_elements(job.gmail_guard->'tasks') loop
  perform 1 from public.tasks where user_id=p_user and id=(dep.value->>'id')::uuid and revision=(dep.value->>'revision')::bigint
   and accepted_fields=dep.value->'acceptedFields' and status='approved' and cancelled_at is null and deleted_at is null for update;
  if not found then raise exception 'STALE_TASK_CONTEXT' using errcode='PT409'; end if;
 end loop;
 if job.state<>'succeeded' then perform public.gmail_process_assert(p_user,p_job,p_lease);end if;
 if p_output->>'contract' is distinct from 'gmail-v1' or p_output->'result'->'topicRelevance'->>'decision' not in ('relevant','irrelevant','uncertain') then raise exception 'INVALID_GMAIL_OUTPUT' using errcode='22023'; end if;
 if job.state='succeeded' then return private.storage_receipt(p_user,(select id from public.storage_extractions where user_id=p_user and extraction_key=job.extraction_key)); end if;
 receipt:=private.storage_finish(p_user,p_job,p_lease,p_output,p_meta);ext:=(receipt->>'extractionId')::uuid;
 update public.storage_extractions set topic_relevance=p_output->'result'->'topicRelevance'->>'decision',
 summary=case when p_output->'result'->'topicRelevance'->>'decision'='irrelevant' then null else summary end where id=ext and user_id=p_user;
 for ch in select value from jsonb_array_elements(p_output->'result'->'taskChanges') loop
  if ch->>'targetTaskId' is not null then
   if not exists(select 1 from jsonb_array_elements(job.gmail_guard->'tasks') t where t->>'id'=ch->>'targetTaskId' and t->>'revision'=ch->>'expectedRevision') then raise exception 'INVALID_CHANGE_TARGET' using errcode='22023'; end if;
   select * into target from public.tasks where user_id=p_user and id=(ch->>'targetTaskId')::uuid;
  else target:=null; end if;
  eid:=private.storage_evidence_add(p_user,ext,ch->'evidence');
  insert into public.gmail_task_changes(user_id,extraction_id,evidence_id,target_task_id,expected_revision,kind,changed_fields,baseline,fields,reason)
  values(p_user,ext,eid,(ch->>'targetTaskId')::uuid,(ch->>'expectedRevision')::bigint,ch->>'kind',ch->'changedFields',target.accepted_fields,nullif(ch->'fields','null'::jsonb),ch->>'reason');
 end loop;
 insert into private.gmail_result_cache(user_id,source_id,base_key,extraction_id,dependencies) values(p_user,job.source_id,job.gmail_guard->>'baseKey',ext,job.gmail_guard->'tasks')
 on conflict(user_id,source_id,base_key) do update set extraction_id=excluded.extraction_id,dependencies=excluded.dependencies;
 return receipt;
end; $$;

create function public.gmail_change_review(p_id uuid,p_revision bigint,p_action text,p_task_revision bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); ch public.gmail_task_changes; t public.tasks; field text; proposed jsonb;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.storage_preferences where user_id=uid for update;
 select * into ch from public.gmail_task_changes where user_id=uid and id=p_id for update;
 if ch.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
 if p_revision is null or ch.revision<>p_revision or ch.state<>'pending' or ch.expires_at<=now() then raise exception 'STALE_CHANGE' using errcode='PT409'; end if;
 if p_action='dismiss' then update public.gmail_task_changes set state='dismissed',revision=revision+1 where id=ch.id;return jsonb_build_object('state','dismissed'); end if;
 if not exists(select 1 from public.storage_extractions e join public.storage_sources src on src.user_id=e.user_id and src.id=e.source_id join public.storage_evidence ev on ev.user_id=e.user_id and ev.id=ch.evidence_id where e.user_id=uid and e.id=ch.extraction_id and src.deleted_at is null and ev.quote is not null and ev.expires_at>now()) then raise exception 'SOURCE_REVIEW_UNAVAILABLE' using errcode='PT409';end if;
 select * into t from public.tasks where user_id=uid and id=ch.target_task_id and status='approved' and cancelled_at is null and deleted_at is null for update;
 if t.id is null then raise exception 'TARGET_REVIEW_REQUIRED' using errcode='PT409'; end if;
 if p_action='rebase' then
  if p_task_revision is null or t.revision<>p_task_revision then raise exception 'STALE_TARGET' using errcode='PT409'; end if;
  proposed:=t.accepted_fields;
  if ch.kind='edit' then for field in select jsonb_array_elements_text(ch.changed_fields) loop proposed:=jsonb_set(proposed,array[field],ch.fields->field);end loop; else proposed:=null; end if;
  update public.gmail_task_changes set baseline=t.accepted_fields,fields=proposed,expected_revision=t.revision,revision=revision+1 where id=ch.id;
  return jsonb_build_object('state','pending','requiresRenewedReview',true);
 end if;
 if p_action<>'approve' or t.revision is distinct from ch.expected_revision or t.accepted_fields is distinct from ch.baseline then raise exception 'STALE_TARGET' using errcode='PT409'; end if;
 if ch.kind='edit' then
  update public.tasks set accepted_fields=ch.fields,title=ch.fields->>'action',description=array_to_string(array(select jsonb_array_elements_text(ch.fields->'requirements')),E'\n'),due_at=null,revision=revision+1 where id=t.id;
 else
  -- Preserve accepted values and use an explicit cancellation flag, not deletion.
  update public.tasks set cancelled_at=now(),revision=revision+1 where id=t.id;
 end if;
 update public.gmail_task_changes set state='approved',revision=revision+1 where id=ch.id;
 return jsonb_build_object('state','approved','taskId',t.id);
end; $$;

revoke all on function private.gmail_task_sources_current(uuid,uuid,jsonb),public.gmail_process_assert(uuid,uuid,uuid),private.gmail_permitted(jsonb,jsonb),private.gmail_storage_claim(uuid,text,text,jsonb,integer),public.gmail_task_context(uuid,uuid,jsonb),public.gmail_process_claim(uuid,uuid,text,text,text,jsonb,integer,jsonb),public.gmail_process_finish(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.gmail_process_assert(uuid,uuid,uuid),public.gmail_task_context(uuid,uuid,jsonb),public.gmail_process_claim(uuid,uuid,text,text,text,jsonb,integer,jsonb),public.gmail_process_finish(uuid,uuid,uuid,jsonb,jsonb) to service_role;
revoke all on function public.gmail_change_review(uuid,bigint,text,bigint) from public,anon;
grant execute on function public.gmail_change_review(uuid,bigint,text,bigint) to authenticated;

create or replace function private.storage_action(p_kind text,p_id uuid,p_action text,p_revision bigint,p_fields jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); s public.storage_suggestions; t public.tasks;
  w public.storage_waiting_for; f public.storage_followups; op public.storage_calendar_operations;
  doc jsonb; task_id uuid; source_message text; ext_key text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_kind in ('suggestion','task','waiting','followup','calendar') and (p_revision is null or p_revision<0) then
    raise exception 'STALE_REVISION' using errcode='PT409';
  end if;
  -- Same lock order as inference commits: preferences before child records.
  insert into public.storage_preferences(user_id) values(uid) on conflict do nothing;
  perform 1 from public.storage_preferences where user_id=uid for update;
  if p_kind='processing' and p_action in ('pause','resume') then
    insert into public.storage_preferences(user_id) values(uid) on conflict do nothing;
    update public.storage_preferences set enabled=(p_action='resume'),generation=generation+1,updated_at=now() where user_id=uid;
    update private.storage_jobs set state='cancelled',updated_at=now() where user_id=uid and state='processing';
    update private.storage_attempts set state='unknown',finished_at=now() where user_id=uid and state='processing';
    return jsonb_build_object('enabled',p_action='resume');
  end if;
  if p_kind='suggestion' then
    select * into s from public.storage_suggestions where id=p_id and user_id=uid for update;
    if s.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
    if p_action='approve' and s.state='approved' and p_fields is null then
      return jsonb_build_object('taskId',s.approved_task_id,'reused',true); end if;
    if s.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='PT409'; end if;
    if p_action in ('dismiss','reject') and s.state='pending' then
      update public.storage_suggestions set state=case when p_action='dismiss' then 'dismissed' else 'rejected' end,revision=revision+1 where id=s.id;
    elsif p_action='restore' and s.state in ('dismissed','rejected') and s.expires_at>now() then
      update public.storage_suggestions set state='pending',revision=revision+1 where id=s.id;
    elsif p_action in ('edit','approve') and s.state='pending' and s.expires_at>now() then
      doc:=coalesce(p_fields,s.review_fields,s.fields);
      if not private.valid_task_fields(doc) then raise exception 'INVALID_FIELDS' using errcode='22023'; end if;
      if p_action='edit' then
        update public.storage_suggestions set review_fields=doc,revision=revision+1 where id=s.id;
      else
        if s.target_task_id is not null then
          select * into t from public.tasks where id=s.target_task_id and user_id=uid and deleted_at is null for update;
          if t.id is null or t.revision<>s.expected_task_revision then raise exception 'STALE_TASK_REVISION' using errcode='PT409'; end if;
          update public.tasks set accepted_fields=doc,title=doc->>'action',description=array_to_string(array(select jsonb_array_elements_text(doc->'requirements')),E'\n'),
            due_at=null,revision=revision+1 where id=t.id returning id into task_id;
        else
          select src.message_id into source_message from public.storage_extractions e join public.storage_sources src on src.id=e.source_id and src.user_id=e.user_id where e.id=s.extraction_id and e.user_id=uid;
          insert into public.tasks(user_id,title,description,status,source_email_id,accepted_fields,origin_suggestion_id)
            values(uid,doc->>'action',array_to_string(array(select jsonb_array_elements_text(doc->'requirements')),E'\n'),'approved',source_message,doc,s.id)
            returning id into task_id;
        end if;
        insert into public.storage_task_sources(user_id,task_id,suggestion_id) values(uid,task_id,s.id) on conflict do nothing;
        update public.storage_suggestions set state='approved',review_fields=doc,approved_task_id=task_id,revision=revision+1 where id=s.id;
        return jsonb_build_object('taskId',task_id,'reused',false);
      end if;
    else raise exception 'INVALID_TRANSITION' using errcode='22023'; end if;
    return jsonb_build_object('id',s.id,'revision',s.revision+1);
  elsif p_kind='task' then
    select * into t from public.tasks where id=p_id and user_id=uid and deleted_at is null for update;
    if t.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
    if t.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='PT409'; end if;
    if p_action='edit' then
      if not private.valid_task_fields(p_fields) then raise exception 'INVALID_FIELDS' using errcode='22023'; end if;
      update public.tasks set accepted_fields=p_fields,title=p_fields->>'action',description=array_to_string(array(select jsonb_array_elements_text(p_fields->'requirements')),E'\n'),due_at=null,revision=revision+1 where id=t.id;
    elsif p_action='approve' and t.status='pending' and t.accepted_fields is not null and t.origin_suggestion_id is null then
      update public.tasks set status='approved',revision=revision+1 where id=t.id;
    elsif p_action='complete' and t.status='approved' then
      update public.tasks set status='completed',completed_at=now(),delete_after=now()+interval '30 days',revision=revision+1 where id=t.id;
    elsif p_action='undo' and t.status='completed' then
      update public.tasks set status='approved',completed_at=null,delete_after=null,revision=revision+1 where id=t.id;
    elsif p_action='delete' then
      insert into private.storage_source_suppressions(user_id,source_id)
        select uid,e.source_id from public.storage_task_sources ts join public.storage_suggestions sg on sg.id=ts.suggestion_id and sg.user_id=ts.user_id
          join public.storage_extractions e on e.id=sg.extraction_id and e.user_id=sg.user_id where ts.task_id=t.id and ts.user_id=uid on conflict do nothing;
      insert into private.storage_suppressions(user_id,extraction_key)
        select uid,e.extraction_key from public.storage_task_sources ts join public.storage_suggestions sg on sg.id=ts.suggestion_id and sg.user_id=ts.user_id
          join public.storage_extractions e on e.id=sg.extraction_id and e.user_id=sg.user_id where ts.task_id=t.id and ts.user_id=uid on conflict do nothing;
      update public.tasks set deleted_at=now(),delete_after=now(),revision=revision+1 where id=t.id;
    elsif p_action='preview_calendar' then
      if t.status<>'approved' or private.valid_calendar_preview(p_fields) is not true then raise exception 'INVALID_CALENDAR_PREVIEW' using errcode='22023'; end if;
      insert into public.storage_calendar_operations(user_id,task_id,task_revision,operation_key,preview)
        values(uid,t.id,t.revision,gen_random_uuid(),p_fields) returning id into task_id;
      return jsonb_build_object('operationId',task_id,'state','pending');
    else raise exception 'INVALID_TRANSITION' using errcode='22023'; end if;
    return jsonb_build_object('id',t.id,'revision',t.revision+1);
  elsif p_kind='waiting' then
    select * into w from public.storage_waiting_for where id=p_id and user_id=uid for update;
    if w.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
    if w.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='PT409'; end if;
    if p_action not in ('resolve','reopen') then raise exception 'INVALID_TRANSITION' using errcode='22023'; end if;
    update public.storage_waiting_for set resolved=(p_action='resolve'),revision=revision+1 where id=w.id;
    if p_action='resolve' then update public.storage_followups set confirmed_reminder_at=null,revision=revision+1 where waiting_for_id=w.id; end if;
    return jsonb_build_object('id',w.id,'revision',w.revision+1);
  elsif p_kind='followup' then
    select * into f from public.storage_followups where id=p_id and user_id=uid for update;
    if f.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
    if f.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='PT409'; end if;
    if p_action<>'remind' or (select resolved from public.storage_waiting_for where id=f.waiting_for_id) then raise exception 'INVALID_TRANSITION' using errcode='22023'; end if;
    update public.storage_followups set confirmed_reminder_at=(p_fields->>'reminderAt')::timestamptz,revision=revision+1 where id=f.id;
    return jsonb_build_object('id',f.id,'revision',f.revision+1);
  elsif p_kind='source' and p_action='delete' then
    if not exists(select 1 from public.storage_sources where user_id=uid and id=p_id and deleted_at is null) then raise exception 'NOT_FOUND' using errcode='42501'; end if;
    insert into private.storage_source_suppressions(user_id,source_id) values(uid,p_id) on conflict do nothing;
    update public.storage_sources set deleted_at=now(),subject=null,sender=null where id=p_id and user_id=uid;
    update public.gmail_task_changes set baseline=null,fields=null,reason='Source deleted.' where user_id=uid and extraction_id in(select id from public.storage_extractions where user_id=uid and source_id=p_id);
    update public.storage_extractions set summary=null,warnings='[]'::jsonb where source_id=p_id and user_id=uid;
    update public.storage_evidence set quote=null,expires_at=now() where user_id=uid and extraction_id in (select id from public.storage_extractions where user_id=uid and source_id=p_id);
    update public.storage_suggestions set state='deleted',revision=revision+1 where user_id=uid and state in ('pending','dismissed','rejected') and extraction_id in (select id from public.storage_extractions where user_id=uid and source_id=p_id);
    delete from public.storage_waiting_for where user_id=uid and extraction_id in (select id from public.storage_extractions where user_id=uid and source_id=p_id);
    update private.storage_jobs set state='cancelled',updated_at=now() where user_id=uid and source_id=p_id and state='processing';
    update private.storage_attempts set state='unknown',finished_at=now() where user_id=uid and state='processing' and job_id in(select id from private.storage_jobs where user_id=uid and source_id=p_id);
    return jsonb_build_object('id',p_id,'removed',true);
  elsif p_kind='calendar' then
    select * into op from public.storage_calendar_operations where id=p_id and user_id=uid for update;
    if op.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
    if op.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='PT409'; end if;
    if p_action<>'approve' or op.state<>'pending' or not exists(select 1 from public.tasks where id=op.task_id and user_id=uid and revision=op.task_revision and status='approved' and deleted_at is null) then
      raise exception 'STALE_CALENDAR_PREVIEW' using errcode='PT409'; end if;
    update public.storage_calendar_operations set approved_at=now(),state='approved',revision=revision+1 where id=op.id;
    return jsonb_build_object('id',op.id,'state','approved');
  else raise exception 'INVALID_ACTION' using errcode='22023'; end if;
end; $$;
