begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(not has_table_privilege('anon','public.tasks','SELECT'), 'anon cannot read tasks');
select ok(not has_table_privilege('anon','public.tasks','INSERT'), 'anon cannot insert tasks');
select ok(not has_table_privilege('anon','public.tasks','TRUNCATE'), 'anon cannot truncate');
select ok(not has_table_privilege('authenticated','public.tasks','TRUNCATE'), 'users cannot truncate');
select ok(not has_table_privilege('service_role','public.tasks','TRUNCATE'), 'backend cannot truncate');
select ok(has_table_privilege('service_role','public.tasks','INSERT'), 'backend can insert');
select ok(has_table_privilege('service_role','public.tasks','SELECT'), 'backend can read');
select ok(has_column_privilege('authenticated','public.tasks','title','UPDATE'), 'users can edit titles');
select ok(not has_column_privilege('authenticated','public.tasks','user_id','UPDATE'), 'ownership is immutable');
select ok(not has_column_privilege('authenticated','public.tasks','confidence','UPDATE'), 'confidence is backend controlled');
select ok(not has_column_privilege('authenticated','public.tasks','source_email_id','INSERT'), 'users cannot forge source associations');

insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','a@example.org'),
 ('22222222-2222-4222-8222-222222222222','b@example.org');
insert into public.tasks(id,user_id,title,updated_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','A task','2000-01-01'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','B task','2000-01-01');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select results_eq('select title from public.tasks order by title',array['A task']::text[], 'user A sees only own task');
select lives_ok($$insert into public.tasks(user_id,title) values ('11111111-1111-4111-8111-111111111111','A new task')$$, 'owner can create a pending task');
select throws_ok($$insert into public.tasks(user_id,title) values ('22222222-2222-4222-8222-222222222222','Forged')$$,'42501',null,'cannot insert for another user');
select throws_ok($$update public.tasks set confidence=1 where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'42501',null,'cannot forge model confidence');
select throws_ok($$update public.tasks set user_id='22222222-2222-4222-8222-222222222222' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'42501',null,'cannot transfer ownership');
select lives_ok($$update public.tasks set title='A edited',status='approved' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'owner can edit and approve');
select results_eq($$select status from public.tasks where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,array['approved']::text[],'approval persisted');
select ok((select updated_at > '2000-01-01'::timestamptz from public.tasks where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'update timestamp refreshed');
select lives_ok($$update public.tasks set title='Wrong' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,'cross-owner update silently affects no rows');
select lives_ok($$delete from public.tasks where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,'cross-owner delete silently affects no rows');

reset role;
select results_eq($$select title from public.tasks where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,array['B task']::text[],'other owner task was neither changed nor deleted');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select results_eq('select title from public.tasks order by title',array['B task']::text[], 'user B sees only own task');
select lives_ok($$delete from public.tasks where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,'owner can delete');
reset role;
select is((select count(*) from public.tasks where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),0::bigint,'owner deletion persisted');

set local role anon;
select throws_ok('select * from public.tasks','42501',null,'anonymous query denied');
reset role;
select * from finish();
rollback;
