-- Review fixes for manual Gmail scanning: reuse, duplicate prevention, deletion
-- purges and cancelled-task enforcement. No scan schedule or feature enablement.
alter table public.gmail_task_changes drop constraint gmail_task_changes_state_check;
alter table public.gmail_task_changes add constraint gmail_task_changes_state_check
  check(state in ('pending','approved','dismissed','superseded'));

-- Existing tasks offered to the model. SQL applies current permissions itself, and
-- reports which messages created or changed each task (origins) separately from
-- the wider metadata of every message that was sent to the model (sources).
create or replace function public.gmail_task_context(p_user uuid,p_lease uuid,p_meta jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; v_rules jsonb;
begin
 perform public.gmail_scan_service(p_user,'assert',jsonb_build_object('lease',p_lease));
 select s.rules into v_rules from public.scan_settings s where s.user_id=p_user;
 select coalesce(jsonb_agg(doc),'[]') into result from (
  select jsonb_build_object('id',t.id,'revision',t.revision,'acceptedFields',t.accepted_fields,
    'userEdited',t.accepted_fields is distinct from original.fields,'sources',provenance.sources,'origins',provenance.origins) doc
  from public.tasks t left join public.storage_suggestions original on original.user_id=t.user_id and original.id=t.origin_suggestion_id
  cross join lateral (
   select jsonb_agg(distinct jsonb_build_object('id',src.message_id,'sentAt',src.sent_at)) origins,
    (select jsonb_agg(distinct m.value) from public.storage_sources inner_src
      cross join lateral jsonb_array_elements(coalesce(inner_src.permission_metadata,'[]')) m
      where inner_src.user_id=t.user_id and inner_src.id=any(array_agg(src.id))) sources
   from (
    select e.source_id from public.storage_task_sources ts join public.storage_suggestions sg on sg.user_id=ts.user_id and sg.id=ts.suggestion_id
     join public.storage_extractions e on e.user_id=sg.user_id and e.id=sg.extraction_id where ts.user_id=t.user_id and ts.task_id=t.id
    union select e.source_id from public.gmail_task_changes ch join public.storage_extractions e on e.id=ch.extraction_id and e.user_id=ch.user_id
     where ch.user_id=t.user_id and ch.target_task_id=t.id and ch.state='approved'
   ) links join public.storage_sources src on src.id=links.source_id and src.user_id=t.user_id
  ) provenance
  where t.user_id=p_user and t.status='approved' and t.cancelled_at is null and t.deleted_at is null and t.accepted_fields is not null
   and private.gmail_task_sources_current(p_user,t.id,v_rules)
   and exists(select 1 from jsonb_array_elements(provenance.sources) m where m->>'threadId'=p_meta->>'threadId')
  order by t.updated_at desc,t.id limit 21
 ) bounded;
 return result;
end; $$;

-- A stored result stays valid while every task now offered to the model was offered
-- with the same accepted values. Tasks that stopped being candidates (completed,
-- deleted, cancelled) cannot be targets, so they do not force another model call.
create or replace function public.gmail_process_claim(p_user uuid,p_scan uuid,p_key text,p_base text,p_config text,p_meta jsonb,p_reserve integer,p_guard jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare settings public.scan_settings; connection private.google_connections; src public.storage_sources;
 cached private.gmail_result_cache; dep record; claimed jsonb;
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
 for dep in select value from jsonb_array_elements(p_guard->'tasks') loop
  perform 1 from public.tasks where user_id=p_user and id=(dep.value->>'id')::uuid and revision=(dep.value->>'revision')::bigint
   and status='approved' and cancelled_at is null and deleted_at is null and accepted_fields=dep.value->'acceptedFields' and private.gmail_task_sources_current(p_user,id,settings.rules) for update;
  if not found then raise exception 'STALE_TASK_CONTEXT' using errcode='PT409'; end if;
 end loop;
 select * into cached from private.gmail_result_cache where user_id=p_user and source_id=src.id and base_key=p_base;
 if cached.extraction_id is not null and not exists(
   select 1 from jsonb_array_elements(p_guard->'tasks') v where not exists(
    select 1 from jsonb_array_elements(cached.dependencies) d where d->>'id'=v->>'id' and d->>'fingerprint'=md5((v->'acceptedFields')::text))) then
  return jsonb_build_object('state','cached','receipt',private.storage_receipt(p_user,cached.extraction_id));
 end if;
 if p_guard->>'allowInference' is distinct from 'true' then return jsonb_build_object('state','inference_deferred'); end if;
 claimed:=private.gmail_storage_claim(p_user,p_key,p_config,p_meta,p_reserve);
 if claimed->>'state'='claimed' then
  update public.storage_sources set permission_metadata=p_guard->'metadata' where user_id=p_user and id=(select source_id from private.storage_jobs where id=(claimed->>'jobId')::uuid);
  update private.storage_jobs set gmail_guard=p_guard||jsonb_build_object('scanLease',p_scan,'baseKey',p_base) where id=(claimed->>'jobId')::uuid and user_id=p_user;
 end if;
 return claimed;
end; $$;

-- Re-extraction of a source is possible after a task or settings change. Earlier
-- review decisions win, so it must not repeat a suggestion or a dismissed proposal.
create or replace function public.gmail_process_finish(p_user uuid,p_job uuid,p_lease uuid,p_output jsonb,p_meta jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.storage_jobs; dep record; ch jsonb; receipt jsonb; ext uuid; eid uuid; target public.tasks; v_rules jsonb;
 v_target uuid; v_fields jsonb;
begin
 perform 1 from public.storage_preferences where user_id=p_user for update;
 select * into job from private.storage_jobs where id=p_job and user_id=p_user;
 if job.gmail_guard is null or job.lease_token is distinct from p_lease then raise exception 'STALE_GMAIL_JOB' using errcode='PT409'; end if;
 perform public.gmail_scan_service(p_user,'assert',jsonb_build_object('lease',job.gmail_guard->'scanLease'));
 select s.rules into v_rules from public.scan_settings s where s.user_id=p_user;
 if exists(select 1 from jsonb_array_elements(job.gmail_guard->'metadata') m where private.gmail_permitted(m,v_rules) is distinct from true) then raise exception 'STALE_GMAIL_PERMISSION' using errcode='PT409'; end if;
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

 delete from public.storage_suggestions n where n.user_id=p_user and n.extraction_id=ext and exists(
  select 1 from public.storage_suggestions o join public.storage_extractions e on e.user_id=o.user_id and e.id=o.extraction_id
   left join public.storage_evidence old_ev on old_ev.user_id=o.user_id and old_ev.id=o.evidence_id
   left join public.storage_evidence new_ev on new_ev.user_id=n.user_id and new_ev.id=n.evidence_id
  where o.user_id=p_user and e.source_id=job.source_id and e.id<>ext
   and (lower(btrim(o.fields->>'action'))=lower(btrim(n.fields->>'action'))
    or (old_ev.quote=new_ev.quote and o.fields->'deadline'=n.fields->'deadline')));
 delete from public.storage_waiting_for n where n.user_id=p_user and n.extraction_id=ext and exists(
  select 1 from public.storage_waiting_for o join public.storage_extractions e on e.user_id=o.user_id and e.id=o.extraction_id
  where o.user_id=p_user and e.source_id=job.source_id and e.id<>ext
   and lower(btrim(o.action))=lower(btrim(n.action)) and lower(o.external_owner)=lower(n.external_owner));

 for ch in select value from jsonb_array_elements(p_output->'result'->'taskChanges') loop
  v_target:=(ch->>'targetTaskId')::uuid; v_fields:=nullif(ch->'fields','null'::jsonb);
  if v_target is not null then
   if not exists(select 1 from jsonb_array_elements(job.gmail_guard->'tasks') t where t->>'id'=ch->>'targetTaskId' and t->>'revision'=ch->>'expectedRevision') then raise exception 'INVALID_CHANGE_TARGET' using errcode='22023'; end if;
   select * into target from public.tasks where user_id=p_user and id=v_target;
  else target:=null; end if;
  -- The same proposal already decided, or an untargeted repeat of an open proposal.
  if exists(select 1 from public.gmail_task_changes old join public.storage_extractions e on e.user_id=old.user_id and e.id=old.extraction_id
    where old.user_id=p_user and e.source_id=job.source_id and old.kind=ch->>'kind' and old.target_task_id is not distinct from v_target
     and old.state in ('approved','dismissed') and old.fields is not distinct from v_fields)
   or (v_target is null and exists(select 1 from public.gmail_task_changes old join public.storage_extractions e on e.user_id=old.user_id and e.id=old.extraction_id
    where old.user_id=p_user and e.source_id=job.source_id and old.kind=ch->>'kind' and old.state='pending')) then continue; end if;
  update public.gmail_task_changes old set state='superseded',revision=old.revision+1 from public.storage_extractions e
   where e.user_id=old.user_id and e.id=old.extraction_id and old.user_id=p_user and e.source_id=job.source_id and e.id<>ext
    and old.kind=ch->>'kind' and old.state='pending' and (old.target_task_id is null or old.target_task_id=v_target);
  eid:=private.storage_evidence_add(p_user,ext,ch->'evidence');
  insert into public.gmail_task_changes(user_id,extraction_id,evidence_id,target_task_id,expected_revision,kind,changed_fields,baseline,fields,reason)
  values(p_user,ext,eid,v_target,(ch->>'expectedRevision')::bigint,ch->>'kind',ch->'changedFields',target.accepted_fields,v_fields,ch->>'reason');
 end loop;
 -- Fingerprints only: reuse needs no retained copy of accepted task values.
 insert into private.gmail_result_cache(user_id,source_id,base_key,extraction_id,dependencies)
  values(p_user,job.source_id,job.gmail_guard->>'baseKey',ext,(select coalesce(jsonb_agg(jsonb_build_object('id',t->>'id','fingerprint',md5((t->'acceptedFields')::text))),'[]') from jsonb_array_elements(job.gmail_guard->'tasks') t))
  on conflict(user_id,source_id,base_key) do update set extraction_id=excluded.extraction_id,dependencies=excluded.dependencies;
 update private.storage_jobs set gmail_guard=jsonb_build_object('scanLease',job.gmail_guard->'scanLease','baseKey',job.gmail_guard->'baseKey','metadata','[]'::jsonb,'tasks','[]'::jsonb) where id=job.id;
 return private.storage_receipt(p_user,ext);
end; $$;

-- Lets retrieval skip deleted messages before any body or context fetch.
create function public.gmail_suppressed_messages(p_user uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; v_subject text;
begin
 perform public.gmail_scan_service(p_user,'assert',jsonb_build_object('lease',p_lease));
 select c.subject into v_subject from private.google_connections c where c.user_id=p_user;
 select coalesce(jsonb_agg(bounded.message_id),'[]') into result from (
  select s.message_id from public.storage_sources s join private.storage_source_suppressions ss on ss.source_id=s.id and ss.user_id=s.user_id
  where s.user_id=p_user and s.namespace='gmail' and s.connection_key=v_subject order by s.id limit 5000
 ) bounded;
 return result;
end; $$;
revoke all on function public.gmail_suppressed_messages(uuid,uuid) from public,anon,authenticated;
grant execute on function public.gmail_suppressed_messages(uuid,uuid) to service_role;

-- Triggers cover every path that changes these rows, including earlier RPCs.
create function private.gmail_task_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.cancelled_at is not null and new.deleted_at is null then raise exception 'TASK_CANCELLED' using errcode='PT409'; end if;
 if new.deleted_at is not null and old.deleted_at is null then
  insert into private.storage_source_suppressions(user_id,source_id)
   select new.user_id,e.source_id from public.gmail_task_changes ch join public.storage_extractions e on e.user_id=ch.user_id and e.id=ch.extraction_id
   where ch.user_id=new.user_id and ch.target_task_id=new.id and ch.state='approved' on conflict do nothing;
 end if;
 return new;
end; $$;
create trigger gmail_task_guard before update on public.tasks for each row execute function private.gmail_task_guard();

create function private.gmail_calendar_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.tasks where user_id=new.user_id and id=new.task_id and cancelled_at is not null) then
  raise exception 'TASK_CANCELLED' using errcode='PT409'; end if;
 return new;
end; $$;
create trigger gmail_calendar_guard before insert on public.storage_calendar_operations for each row execute function private.gmail_calendar_guard();

create function private.gmail_source_purge() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.deleted_at is not null and old.deleted_at is null and new.namespace='gmail' then
  new.permission_metadata:=null;
  update private.storage_jobs set gmail_guard=null where user_id=new.user_id and source_id=new.id;
  delete from private.gmail_result_cache where user_id=new.user_id and source_id=new.id;
  update public.storage_sources s set permission_metadata=(select coalesce(jsonb_agg(m),'[]') from jsonb_array_elements(s.permission_metadata) m where m->>'id'<>new.message_id)
   where s.user_id=new.user_id and s.namespace='gmail' and s.id<>new.id and s.permission_metadata @> jsonb_build_array(jsonb_build_object('id',new.message_id));
 end if;
 return new;
end; $$;
create trigger gmail_source_purge before update on public.storage_sources for each row execute function private.gmail_source_purge();
revoke all on function private.gmail_task_guard(),private.gmail_calendar_guard(),private.gmail_source_purge() from public,anon,authenticated;

create or replace function private.storage_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$
declare expired_evidence integer; deleted_tasks integer;
begin
  -- Coordinate with review/undo transactions. This fixture-scale cleanup is
  -- deliberately simple; schedule bounded per-user batches before public use.
  perform 1 from public.storage_preferences order by user_id for update;
  update public.storage_evidence set quote=null where expires_at<=now() and quote is not null;
  get diagnostics expired_evidence=row_count;
  update public.storage_extractions set summary=null,warnings='[]'::jsonb where digest_expires_at<=now();
  -- Expired proposals lose their task text. Approved rows stay as source provenance.
  update public.gmail_task_changes set fields=null,baseline=null,reason='Expired.' where expires_at<=now() and state='approved';
  delete from public.gmail_task_changes where expires_at<=now() and state<>'approved';
  -- Lock and recheck eligibility in the same transaction as deletion/undo.
  with eligible as (select id from public.tasks where delete_after<=now() and (status='completed' or deleted_at is not null) for update)
  update public.storage_suggestions s set approved_task_id=null,state='deleted',revision=revision+1 where approved_task_id in (select id from eligible);
  update public.storage_suggestions set state='deleted',target_task_id=null,expected_task_revision=null where target_task_id in
    (select id from public.tasks where delete_after<=now() and (status='completed' or deleted_at is not null));
  insert into private.storage_source_suppressions(user_id,source_id)
    select t.user_id,e.source_id from public.tasks t join public.storage_task_sources ts on ts.task_id=t.id
      join public.storage_suggestions s on s.id=ts.suggestion_id join public.storage_extractions e on e.id=s.extraction_id
    where t.delete_after<=now() and (t.status='completed' or t.deleted_at is not null) on conflict do nothing;
  insert into private.storage_suppressions(user_id,extraction_key)
    select t.user_id,e.extraction_key from public.tasks t join public.storage_task_sources ts on ts.task_id=t.id
      join public.storage_suggestions s on s.id=ts.suggestion_id join public.storage_extractions e on e.id=s.extraction_id
    where t.delete_after<=now() and (t.status='completed' or t.deleted_at is not null) on conflict do nothing;
  delete from public.tasks where delete_after<=now() and (status='completed' or deleted_at is not null);
  get diagnostics deleted_tasks=row_count;
  -- Keep compact extraction identities for suppression, not old task contents.
  delete from public.storage_suggestions s where expires_at<=now() and state in ('pending','dismissed','rejected','deleted')
    and not exists(select 1 from public.tasks t where t.origin_suggestion_id=s.id)
    and not exists(select 1 from public.storage_task_sources ts where ts.suggestion_id=s.id);
  delete from public.storage_waiting_for where expires_at<=now();
  update private.storage_jobs set state='failed',safe_error='unavailable',updated_at=now() where state='processing' and lease_until<=now();
  update private.storage_attempts a set state='unknown',finished_at=now() from private.storage_jobs j
    where a.job_id=j.id and a.state='processing' and j.lease_until<=now();
  delete from private.storage_attempts where finished_at<now()-interval '14 days';
  -- Usage rows are minimal budget records; provider/error diagnostics expire.
  update private.storage_jobs set safe_error=null,gmail_guard=null where updated_at<now()-interval '14 days' and state<>'processing';
  update private.storage_jobs set safe_error=null where updated_at<now()-interval '14 days';
  return jsonb_build_object('expiredEvidence',expired_evidence,'deletedTasks',deleted_tasks);
end; $$;
