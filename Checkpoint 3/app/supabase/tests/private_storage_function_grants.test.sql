begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Service-only storage transaction functions stay unavailable to browser roles.
select ok(not has_function_privilege(r, f, 'EXECUTE'), r || ' cannot execute ' || f)
from unnest(array['anon','authenticated']) as r,
     unnest(array[
       'private.storage_receipt(uuid,uuid)',
       'private.storage_claim(uuid,text,text,jsonb,integer)',
       'private.storage_evidence_add(uuid,uuid,jsonb)',
       'private.storage_finish(uuid,uuid,uuid,jsonb,jsonb)',
       'private.storage_fail(uuid,uuid,uuid,text)'
     ]) as f;

select ok(has_function_privilege('service_role', f, 'EXECUTE'), 'service_role can execute ' || f)
from unnest(array[
  'private.storage_receipt(uuid,uuid)',
  'private.storage_claim(uuid,text,text,jsonb,integer)',
  'private.storage_evidence_add(uuid,uuid,jsonb)',
  'private.storage_finish(uuid,uuid,uuid,jsonb,jsonb)',
  'private.storage_fail(uuid,uuid,uuid,text)'
]) as f;

select * from finish();
rollback;
