-- Lets a user move an added task back to Suggestions or Dismissed (an accidental
-- "Add task"). Same function as 20261105220000 plus the task actions
-- return_to_suggestions and return_to_dismissed. Local only until reviewed.
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
    elsif p_action in ('return_to_suggestions','return_to_dismissed') and t.status in ('approved','completed') then
      -- Undo an accidental "Add task": the suggestion goes back to review with the
      -- task's current values, and the task row is removed. Only tasks created from
      -- a still-unexpired suggestion can return.
      select * into s from public.storage_suggestions
        where id=t.origin_suggestion_id and user_id=uid and state='approved' and approved_task_id=t.id for update;
      if s.id is null or s.expires_at<=now() then raise exception 'INVALID_TRANSITION' using errcode='22023'; end if;
      update public.storage_suggestions set state=case when p_action='return_to_suggestions' then 'pending' else 'dismissed' end,
        review_fields=t.accepted_fields,approved_task_id=null,revision=revision+1 where id=s.id;
      -- Older incoming-update suggestions that point at this task can no longer apply.
      update public.storage_suggestions set state='deleted',target_task_id=null,expected_task_revision=null,revision=revision+1
        where user_id=uid and target_task_id=t.id;
      -- Cascades remove its source links and change proposals; calendar records keep a null task.
      delete from public.tasks where id=t.id and user_id=uid;
      return jsonb_build_object('id',t.id,'removed',true,'suggestionId',s.id,'suggestionRevision',s.revision+1);
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
