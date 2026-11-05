-- Upgrade already-initialized local trials without resetting their data.
-- 40001 denotes a real serialization failure and PostgREST 14 retries it.
-- Application stale-state failures must return HTTP 409 without retrying.
do $$
declare fn record; definition text;
begin
  for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname in ('storage_finish','storage_action','storage_propose_update')
  loop
    definition:=pg_get_functiondef(fn.oid);
    if position('''40001''' in definition)>0 then
      execute replace(definition,'''40001''','''PT409''');
    end if;
  end loop;
end $$;
