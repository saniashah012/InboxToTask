begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select ok(not has_table_privilege('anon','private.google_connections','SELECT'),'anonymous cannot read credentials');
select ok(not has_table_privilege('authenticated','private.google_connections','SELECT'),'browser cannot read credentials');
select ok(not has_table_privilege('authenticated','private.google_oauth_states','SELECT'),'browser cannot read OAuth state');
select ok(not has_function_privilege('authenticated','public.google_connection_service(uuid,text,jsonb)','EXECUTE'),'browser cannot call service state machine');
select ok(not has_function_privilege('anon','public.google_connection_status()','EXECUTE'),'anonymous cannot call status');
select ok(has_function_privilege('service_role','public.google_connection_service(uuid,text,jsonb)','EXECUTE'),'backend can call state machine');
insert into auth.users(id,email) values
 ('33333333-3333-4333-8333-333333333333','google-a@example.test'),
 ('44444444-4444-4444-8444-444444444444','google-b@example.test');
insert into private.google_connections(user_id,state,email,credentials) values
 ('33333333-3333-4333-8333-333333333333','connected','google-a@example.test','synthetic-ciphertext');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select is(public.google_connection_status()->>'email','google-a@example.test','owner sees connected email');
select ok(not (public.google_connection_status() ? 'credentials'),'safe status omits ciphertext');
select is(public.google_connection_status()->>'scanningEnabled','false','connection never enables scanning');
select throws_ok('select * from private.google_connections','42501',null,'private credential reads denied');
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
select is(public.google_connection_status()->>'state','disconnected','other account does not see connection');
select ok(not (public.google_connection_status() ? 'email'),'other account does not see email');
reset role;
select * from finish();
rollback;
