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
select ok(not has_column_privilege('authenticated','public.tasks','title','UPDATE'), 'edits use controlled review transactions');
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
select throws_ok($$insert into public.tasks(user_id,title) values ('11111111-1111-4111-8111-111111111111','A new task')$$,'42501',null,'task creation uses controlled transactions');
select throws_ok($$insert into public.tasks(user_id,title) values ('22222222-2222-4222-8222-222222222222','Forged')$$,'42501',null,'cannot insert for another user');
select throws_ok($$update public.tasks set confidence=1 where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'42501',null,'cannot forge model confidence');
select throws_ok($$update public.tasks set user_id='22222222-2222-4222-8222-222222222222' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'42501',null,'cannot transfer ownership');
select throws_ok($$update public.tasks set title='A edited',status='approved' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'42501',null,'direct state changes denied');
select lives_ok($$select public.storage_action('task','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','edit',0,'{"action":"A edited","requirements":[],"condition":null,"deadline":null}'::jsonb)$$,'owner can edit through the transaction');
select lives_ok($$select public.storage_action('task','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approve',1,null)$$,'owner can approve reviewed legacy values');
select results_eq($$select status from public.tasks where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,array['approved']::text[],'approval persisted');
select ok((select updated_at > '2000-01-01'::timestamptz from public.tasks where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'update timestamp refreshed');
select throws_ok($$select public.storage_action('task','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','edit',0,'{"action":"Wrong","requirements":[],"condition":null,"deadline":null}'::jsonb)$$,'42501',null,'cross-owner edit denied');
select throws_ok($$select public.storage_action('task','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','delete',0,null)$$,'42501',null,'cross-owner delete denied');

reset role;
select results_eq($$select title from public.tasks where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,array['B task']::text[],'other owner task was neither changed nor deleted');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select results_eq('select title from public.tasks order by title',array['B task']::text[], 'user B sees only own task');
select lives_ok($$select public.storage_action('task','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','delete',0,null)$$,'owner can soft-delete');
reset role;
select ok((select deleted_at is not null from public.tasks where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'owner deletion persisted');

set local role anon;
select throws_ok('select * from public.tasks','42501',null,'anonymous query denied');
reset role;
select * from finish();
rollback;
