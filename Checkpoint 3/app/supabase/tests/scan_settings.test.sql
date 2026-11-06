begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select ok(not has_function_privilege('authenticated','public.gmail_scan_service(uuid,text,jsonb)','EXECUTE'),'browser cannot coordinate privileged Gmail work');
select ok(not has_function_privilege('anon','public.gmail_scan_service(uuid,text,jsonb)','EXECUTE'),'anonymous cannot coordinate Gmail work');
select ok(not has_table_privilege('authenticated','private.gmail_scan_work','SELECT'),'private scan IDs and cursors are hidden');
select ok(not has_table_privilege('anon','public.scan_settings','SELECT'),'anonymous settings reads denied');
select ok(not has_table_privilege('authenticated','public.scan_settings','INSERT'),'browser direct settings inserts denied');
select ok(not has_table_privilege('authenticated','public.scan_settings','UPDATE'),'browser direct settings updates denied');
select ok(not has_function_privilege('anon','public.scan_settings_get()','EXECUTE'),'anonymous settings RPC denied');
insert into auth.users(id,email) values
 ('55555555-5555-4555-8555-555555555555','scan-a@example.test'),
 ('66666666-6666-4666-8666-666666666666','scan-b@example.test');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',true);
select is(public.scan_settings_get()->>'consent','false','new account has no consent');
select is(public.scan_settings_get()->>'paused','true','new account paused');
select is(public.scan_settings_get()->'context_limits'->>'maxMessages','5','earlier context defaults to five');
select is(public.scan_settings_save(0,
 '{"allow":{"labels":[],"keywords":[],"senders":["Teacher@Example.org","teacher@example.org"],"domains":[]},"block":{"labels":[],"senders":[],"domains":[]}}',
 '{"maxMessages":0,"maxAgeDays":30,"maxMessageChars":12000,"maxTotalChars":24000}',false,true,null,'{"include":[" School ","school"],"exclude":[]}')->>'revision','1','owner can save with expected revision');
select is(public.scan_settings_get()->'rules'->'allow'->'senders','["teacher@example.org"]'::jsonb,'server canonicalizes and deduplicates');
select is(public.scan_settings_get()->>'consent','false','saving filters does not imply consent');
select is(public.scan_settings_get()->'semantic_preferences'->'include','["school"]'::jsonb,'topics normalize separately from access');
select throws_ok($q$select public.scan_settings_save(0,
 '{"allow":{"labels":[],"senders":[],"domains":[]},"block":{"labels":[],"senders":[],"domains":[]}}',
 '{"maxMessages":0,"maxAgeDays":30,"maxMessageChars":12000,"maxTotalChars":24000}',false,true,null,'{"include":[" School ","school"],"exclude":[]}')$q$,
 'PT409','STALE_SCAN_SETTINGS','stale saves rejected');
select set_config('request.jwt.claims','{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}',true);
select is((select count(*) from public.scan_settings),0::bigint,'second user cannot read owner settings');
select is(public.scan_settings_get()->>'revision','0','second account receives its own empty defaults');
reset role;
select * from finish();
rollback;
