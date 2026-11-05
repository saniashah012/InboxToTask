create function private.storage_receipt(p_user uuid,p_extraction uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('extractionId',e.id,'sourceId',e.source_id,
    'suggestionCount',(select count(*) from public.storage_suggestions s where s.user_id=p_user and s.extraction_id=e.id),
    'waitingForCount',(select count(*) from public.storage_waiting_for w where w.user_id=p_user and w.extraction_id=e.id))
  from public.storage_extractions e where e.user_id=p_user and e.id=p_extraction;
$$;

create function private.storage_claim(p_user_id uuid,p_key text,p_config text,p_meta jsonb,p_reserve integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prefs public.storage_preferences; job private.storage_jobs; budget private.storage_usage;
  src uuid; previous uuid; owner_email text; day date := (now() at time zone 'UTC')::date;
  v_window timestamptz:=date_trunc('minute',now()); provider_limit integer; provider_used integer;
begin
  -- Only fixed fixtures are accepted until Gmail's authorization contract exists.
  if p_key !~ '^[0-9a-f]{64}$' or p_config !~ '^[0-9a-f]{64}$'
    or p_meta->>'namespace' <> 'fixture' or p_meta->>'messageId' !~ '^E(0[1-9]|1[0-9]|20)$'
    or p_meta->>'model' !~ '^[a-z0-9.-]{1,100}$'
    or p_reserve not between 1 and 150000 then raise exception 'INVALID_STORAGE_REQUEST' using errcode='22023'; end if;
  select email into owner_email from auth.users where id=p_user_id;
  if owner_email is null then raise exception 'OWNER_UNAVAILABLE' using errcode='42501'; end if;
  insert into public.storage_preferences(user_id) values(p_user_id) on conflict do nothing;
  select * into prefs from public.storage_preferences where user_id=p_user_id for update;
  if not prefs.enabled then return jsonb_build_object('state','paused'); end if;
  if exists(select 1 from private.storage_source_suppressions ss join public.storage_sources src on src.id=ss.source_id and src.user_id=ss.user_id
    where ss.user_id=p_user_id and src.namespace='fixture' and src.connection_key='cp2-fixture' and src.message_id=p_meta->>'messageId') then
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
    values(p_user_id,'fixture','cp2-fixture',p_meta->>'messageId',p_meta->>'threadId',p_meta->>'subject',p_meta->>'sender',(p_meta->>'sentAt')::timestamptz)
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

create function private.storage_evidence_add(p_user uuid,p_extraction uuid,p_evidence jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
  if jsonb_typeof(p_evidence->'quote') <> 'string' or length(p_evidence->>'quote') not between 1 and 600
    or jsonb_typeof(p_evidence->'messageId') <> 'string' or length(p_evidence->>'messageId') not between 1 and 100 then
    raise exception 'INVALID_EVIDENCE' using errcode='22023'; end if;
  insert into public.storage_evidence(user_id,extraction_id,message_id,quote)
    values(p_user,p_extraction,p_evidence->>'messageId',p_evidence->>'quote') returning id into eid;
  return eid;
end; $$;

create function private.storage_finish(p_user_id uuid,p_job_id uuid,p_lease uuid,p_output jsonb,p_meta jsonb)
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
    or (result->>'category'='Actionable' and jsonb_array_length(result->'tasks')=0) then
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

create function private.storage_fail(p_user_id uuid,p_job_id uuid,p_lease uuid,p_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
  -- Failed/unknown requests retain their reservation; costs may be unknown.
  update private.storage_jobs set state='failed',safe_error=case when p_code in ('rate_limited','unavailable','invalid_output') then p_code else 'failed' end,
    retry_after=now()+interval '60 seconds',updated_at=now()
    where id=p_job_id and user_id=p_user_id and lease_token=p_lease and state='processing';
  if found then
    update private.storage_attempts set state='failed',finished_at=now(),safe_error=
      case when p_code in ('rate_limited','unavailable','invalid_output') then p_code else 'failed' end
      where job_id=p_job_id and user_id=p_user_id and lease_token=p_lease and state='processing';
  end if;
end; $$;

-- Public RPC wrappers are invokers. Privileged implementations stay unexposed.
create function public.storage_claim(p_user_id uuid,p_key text,p_config text,p_meta jsonb,p_reserve integer)
returns jsonb language sql security invoker set search_path='' as $$ select private.storage_claim(p_user_id,p_key,p_config,p_meta,p_reserve); $$;
create function public.storage_finish(p_user_id uuid,p_job_id uuid,p_lease uuid,p_output jsonb,p_meta jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.storage_finish(p_user_id,p_job_id,p_lease,p_output,p_meta); $$;
create function public.storage_fail(p_user_id uuid,p_job_id uuid,p_lease uuid,p_code text)
returns void language sql security invoker set search_path='' as $$ select private.storage_fail(p_user_id,p_job_id,p_lease,p_code); $$;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on all functions in schema private to service_role;
revoke all on function public.storage_claim(uuid,text,text,jsonb,integer),public.storage_finish(uuid,uuid,uuid,jsonb,jsonb),public.storage_fail(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.storage_claim(uuid,text,text,jsonb,integer),public.storage_finish(uuid,uuid,uuid,jsonb,jsonb),public.storage_fail(uuid,uuid,uuid,text) to service_role;
