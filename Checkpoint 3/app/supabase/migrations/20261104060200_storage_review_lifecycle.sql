create function private.valid_calendar_preview(doc jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(doc)<>'object' or octet_length(doc::text)>4000
    or jsonb_typeof(doc->'calendarId')<>'string' or length(doc->>'calendarId') not between 1 and 200
    or jsonb_typeof(doc->'title')<>'string' or length(doc->>'title') not between 1 and 350
    or jsonb_typeof(doc->'allDay')<>'boolean' then return false; end if;
  if not private.valid_task_fields(jsonb_build_object('action',doc->>'title','requirements','[]'::jsonb,'condition',null,
    'deadline',jsonb_build_object('date',doc->'date','time',null,'timeZone',doc->'timeZone','wording','User-selected date','boundary','on'))) then return false; end if;
  if (doc->>'allDay')::boolean then return true; end if;
  return jsonb_typeof(doc->'time')='string' and (doc->>'time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and jsonb_typeof(doc->'durationMinutes')='number' and (doc->>'durationMinutes')::integer between 1 and 1440;
exception when others then return false;
end; $$;
revoke all on function private.valid_calendar_preview(jsonb) from public,anon,authenticated;
grant execute on function private.valid_calendar_preview(jsonb) to service_role;

create function private.storage_action(p_kind text,p_id uuid,p_action text,p_revision bigint,p_fields jsonb)
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
create function public.storage_action(p_kind text,p_id uuid,p_action text,p_revision bigint,p_fields jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.storage_action(p_kind,p_id,p_action,p_revision,p_fields); $$;
revoke all on function public.storage_action(text,uuid,text,bigint,jsonb),private.storage_action(text,uuid,text,bigint,jsonb) from public,anon;
grant execute on function public.storage_action(text,uuid,text,bigint,jsonb),private.storage_action(text,uuid,text,bigint,jsonb) to authenticated;

create function private.storage_propose_update(p_user uuid,p_task uuid,p_revision bigint,p_extraction uuid,p_evidence uuid,p_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; existing public.storage_suggestions;
begin
  perform 1 from public.storage_preferences where user_id=p_user for update;
  if not exists(select 1 from public.tasks where user_id=p_user and id=p_task and deleted_at is null and revision=p_revision) then raise exception 'STALE_TASK_REVISION' using errcode='PT409'; end if;
  perform 1 from public.storage_extractions where id=p_extraction and user_id=p_user for update;
  select * into existing from public.storage_suggestions where user_id=p_user and target_task_id=p_task and extraction_id=p_extraction and expected_task_revision=p_revision;
  if existing.id is not null then
    if existing.fields is distinct from p_fields or existing.evidence_id<>p_evidence then raise exception 'PROPOSAL_CONFLICT' using errcode='PT409'; end if;
    return existing.id;
  end if;
  insert into public.storage_suggestions(user_id,extraction_id,item_index,fields,evidence_id,target_task_id,expected_task_revision)
    values(p_user,p_extraction,(select coalesce(max(item_index),-1)+1 from public.storage_suggestions where extraction_id=p_extraction),p_fields,p_evidence,p_task,p_revision)
    returning id into sid;
  return sid;
end; $$;
create function public.storage_propose_update(p_user uuid,p_task uuid,p_revision bigint,p_extraction uuid,p_evidence uuid,p_fields jsonb)
returns uuid language sql security invoker set search_path='' as $$ select private.storage_propose_update(p_user,p_task,p_revision,p_extraction,p_evidence,p_fields); $$;
revoke all on function public.storage_propose_update(uuid,uuid,bigint,uuid,uuid,jsonb),private.storage_propose_update(uuid,uuid,bigint,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.storage_propose_update(uuid,uuid,bigint,uuid,uuid,jsonb),private.storage_propose_update(uuid,uuid,bigint,uuid,uuid,jsonb) to service_role;

create function private.storage_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$
declare expired_evidence integer; deleted_tasks integer;
begin
  -- Coordinate with review/undo transactions. This fixture-scale cleanup is
  -- deliberately simple; schedule bounded per-user batches before public use.
  perform 1 from public.storage_preferences order by user_id for update;
  update public.storage_evidence set quote=null where expires_at<=now() and quote is not null;
  get diagnostics expired_evidence=row_count;
  update public.storage_extractions set summary=null,warnings='[]'::jsonb where digest_expires_at<=now();
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
  update private.storage_jobs set safe_error=null where updated_at<now()-interval '14 days';
  return jsonb_build_object('expiredEvidence',expired_evidence,'deletedTasks',deleted_tasks);
end; $$;
create function public.storage_cleanup() returns jsonb language sql security invoker set search_path='' as $$ select private.storage_cleanup(); $$;
revoke all on function public.storage_cleanup(),private.storage_cleanup() from public,anon,authenticated;
grant execute on function public.storage_cleanup(),private.storage_cleanup() to service_role;
