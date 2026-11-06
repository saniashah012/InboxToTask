-- Ambiguous task updates: the user reads the source, chooses the task and enters the
-- values. Nothing is applied without this explicit, revision-checked action.
create function public.gmail_change_resolve(p_id uuid,p_revision bigint,p_task uuid,p_task_revision bigint,p_fields jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); ch public.gmail_task_changes; t public.tasks; changed jsonb;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.storage_preferences where user_id=uid for update;
 select * into ch from public.gmail_task_changes where user_id=uid and id=p_id for update;
 if ch.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
 if p_revision is null or ch.revision<>p_revision or ch.state<>'pending' or ch.expires_at<=now() or ch.target_task_id is not null then raise exception 'STALE_CHANGE' using errcode='PT409'; end if;
 if not exists(select 1 from public.storage_extractions e join public.storage_sources src on src.user_id=e.user_id and src.id=e.source_id
   where e.user_id=uid and e.id=ch.extraction_id and src.deleted_at is null) then raise exception 'SOURCE_REVIEW_UNAVAILABLE' using errcode='PT409'; end if;
 select * into t from public.tasks where user_id=uid and id=p_task and status='approved' and cancelled_at is null and deleted_at is null for update;
 if t.id is null or p_task_revision is null or t.revision<>p_task_revision then raise exception 'STALE_TARGET' using errcode='PT409'; end if;
 if ch.kind='edit' then
  if not private.valid_task_fields(p_fields) then raise exception 'INVALID_FIELDS' using errcode='22023'; end if;
  select coalesce(jsonb_agg(k),'[]') into changed from unnest(array['action','requirements','condition','deadline']) k where p_fields->k is distinct from t.accepted_fields->k;
  if jsonb_array_length(changed)=0 then raise exception 'NO_CHANGE' using errcode='22023'; end if;
  update public.tasks set accepted_fields=p_fields,title=p_fields->>'action',description=array_to_string(array(select jsonb_array_elements_text(p_fields->'requirements')),E'\n'),due_at=null,revision=revision+1 where id=t.id;
 else
  if p_fields is not null then raise exception 'INVALID_FIELDS' using errcode='22023'; end if;
  changed:='[]';
  update public.tasks set cancelled_at=now(),revision=revision+1 where id=t.id;
 end if;
 -- Recording the target also makes this source part of the task's provenance.
 update public.gmail_task_changes set target_task_id=t.id,expected_revision=t.revision,baseline=t.accepted_fields,fields=p_fields,changed_fields=changed,state='approved',revision=revision+1 where id=ch.id;
 return jsonb_build_object('state','approved','taskId',t.id);
end; $$;
revoke all on function public.gmail_change_resolve(uuid,bigint,uuid,bigint,jsonb) from public,anon;
grant execute on function public.gmail_change_resolve(uuid,bigint,uuid,bigint,jsonb) to authenticated;

-- Once the user has decided an update from this source, re-extraction must not ask again.
create function private.gmail_change_no_repeat() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.target_task_id is null and exists(
   select 1 from public.gmail_task_changes prior
   join public.storage_extractions prior_e on prior_e.user_id=prior.user_id and prior_e.id=prior.extraction_id
   join public.storage_extractions new_e on new_e.user_id=new.user_id and new_e.id=new.extraction_id
   where prior.user_id=new.user_id and prior_e.source_id=new_e.source_id and prior.kind=new.kind and prior.state='approved') then
  return null;
 end if;
 return new;
end; $$;
create trigger gmail_change_no_repeat before insert on public.gmail_task_changes for each row execute function private.gmail_change_no_repeat();
revoke all on function private.gmail_change_no_repeat() from public,anon,authenticated;
