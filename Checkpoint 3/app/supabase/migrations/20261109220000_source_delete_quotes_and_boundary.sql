-- Two defects recorded in docs/hosted-rollout-2-manifest-2026-11-06.md, fixed before
-- hosted Gmail scanning is enabled.

-- 1. Deleting a Gmail source left quotes of that message in other sources' evidence.
-- Source B's evidence can quote an earlier thread message A. Deleting A already purged
-- A's metadata from other sources; it now also clears those quotes, as deleting a source
-- does for its own evidence. Same function as 20261106000000 plus the evidence update.
create or replace function private.gmail_source_purge() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.deleted_at is not null and old.deleted_at is null and new.namespace='gmail' then
  new.permission_metadata:=null;
  update private.storage_jobs set gmail_guard=null where user_id=new.user_id and source_id=new.id;
  delete from private.gmail_result_cache where user_id=new.user_id and source_id=new.id;
  update public.storage_sources s set permission_metadata=(select coalesce(jsonb_agg(m),'[]') from jsonb_array_elements(s.permission_metadata) m where m->>'id'<>new.message_id)
   where s.user_id=new.user_id and s.namespace='gmail' and s.id<>new.id and s.permission_metadata @> jsonb_build_array(jsonb_build_object('id',new.message_id));
  update public.storage_evidence ev set quote=null,expires_at=now()
   where ev.user_id=new.user_id and ev.message_id=new.message_id and ev.quote is not null
     and exists(select 1 from public.storage_extractions e join public.storage_sources src on src.user_id=e.user_id and src.id=e.source_id
       where e.user_id=ev.user_id and e.id=ev.extraction_id and src.namespace='gmail');
 end if;
 return new;
end; $$;
revoke all on function private.gmail_source_purge() from public,anon,authenticated;

-- 2. valid_task_fields accepted "boundary": null, because null not in (...) is not true.
-- Same function as 20261104060000 with an explicit string check on boundary.
create or replace function private.valid_task_fields(doc jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare d jsonb; k text;
begin
  if doc is null or jsonb_typeof(doc) <> 'object' or (select count(*) from jsonb_object_keys(doc)) <> 4
    or not (doc ?& array['action','requirements','condition','deadline'])
    or jsonb_typeof(doc->'action') <> 'string' or length(doc->>'action') not between 1 and 350
    or jsonb_typeof(doc->'requirements') <> 'array' or jsonb_array_length(doc->'requirements') > 12
    or exists(select 1 from jsonb_array_elements(doc->'requirements') v where jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 250)
    or not (doc->'condition' = 'null'::jsonb or (jsonb_typeof(doc->'condition')='string' and length(doc->>'condition') between 1 and 350)) then return false; end if;
  d := doc->'deadline';
  if d = 'null'::jsonb then return true; end if;
  if jsonb_typeof(d)<>'object' or (select count(*) from jsonb_object_keys(d))<>5
    or not(d ?& array['date','time','timeZone','wording','boundary'])
    or (d->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(d->'date')<>'string'
    or to_char((d->>'date')::date,'YYYY-MM-DD') <> d->>'date'
    or not(d->'time'='null'::jsonb or (jsonb_typeof(d->'time')='string' and (d->>'time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
    or jsonb_typeof(d->'timeZone')<>'string' or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=d->>'timeZone')
    or jsonb_typeof(d->'wording')<>'string' or length(d->>'wording') not between 1 and 250
    or jsonb_typeof(d->'boundary')<>'string' or d->>'boundary' not in ('by','before','on','unspecified') then return false; end if;
  return true;
exception when others then return false;
end; $$;
