-- Naive source access: return what the browser needs to link each task to Gmail.
-- No email body is fetched or stored. Runs as definer because provenance outlives the
-- 30-day read limits on approved changes and expired evidence; ownership comes from
-- auth.uid(), and expired quotes are never returned.
create function public.gmail_task_source_links(p_tasks uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_tasks is null or coalesce(cardinality(p_tasks),0)>200 then raise exception 'INVALID_TASK_LIST' using errcode='22023'; end if;
 with links as (
  select ts.task_id,case when t.origin_suggestion_id=sg.id then 'created' else 'updated' end as role,sg.extraction_id,sg.evidence_id
   from public.storage_task_sources ts
   join public.tasks t on t.user_id=ts.user_id and t.id=ts.task_id
   join public.storage_suggestions sg on sg.user_id=ts.user_id and sg.id=ts.suggestion_id
   where ts.user_id=uid and ts.task_id=any(p_tasks) and t.deleted_at is null
  union all
  select ch.target_task_id,case ch.kind when 'cancel' then 'cancelled' else 'updated' end,ch.extraction_id,ch.evidence_id
   from public.gmail_task_changes ch
   join public.tasks t on t.user_id=ch.user_id and t.id=ch.target_task_id
   where ch.user_id=uid and ch.target_task_id=any(p_tasks) and ch.state='approved' and t.deleted_at is null
 ), resolved as (
  select l.task_id,l.role,src.message_id as source_message,src.thread_id,src.sender,src.subject,src.sent_at,ev.message_id as cited_message,
   case when ev.expires_at>now() then ev.quote end as quote,cited.meta
  from links l
  join public.storage_extractions e on e.user_id=uid and e.id=l.extraction_id
  join public.storage_sources src on src.user_id=uid and src.id=e.source_id and src.namespace='gmail' and src.deleted_at is null
  join public.storage_evidence ev on ev.user_id=uid and ev.id=l.evidence_id
  -- Earlier messages have no source row. Their details exist only in this metadata,
  -- which a re-scan overwrites and deletion purges, so absence falls back to the source.
  left join lateral (
   select m as meta from jsonb_array_elements(case when jsonb_typeof(src.permission_metadata)='array' then src.permission_metadata else '[]'::jsonb end) m
   where m->>'id'=ev.message_id and ev.message_id<>src.message_id limit 1
  ) cited on true
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'taskId',r.task_id,'role',r.role,'threadId',r.thread_id,
   'messageId',case when r.meta is null then r.source_message else r.cited_message end,
   'earlierMessage',r.meta is not null,
   'sender',case when r.meta is null then r.sender else r.meta->>'from' end,
   'subject',case when r.meta is null then r.subject else r.meta->>'subject' end,
   'sentAt',case when r.meta is null then to_jsonb(r.sent_at) else r.meta->'sentAt' end,
   'quote',r.quote
  ) order by r.task_id,r.sent_at),'[]'::jsonb) into result
 from resolved r;
 return result;
end; $$;
revoke all on function public.gmail_task_source_links(uuid[]) from public,anon;
grant execute on function public.gmail_task_source_links(uuid[]) to authenticated;
