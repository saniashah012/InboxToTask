begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(not has_table_privilege('anon','public.user_onboarding_preferences','SELECT'), 'anon cannot read preferences');
select ok(not has_table_privilege('anon','public.user_onboarding_preferences','INSERT'), 'anon cannot insert preferences');
select ok(has_table_privilege('authenticated','public.user_onboarding_preferences','SELECT'), 'authenticated users can read preferences');
select ok(has_table_privilege('authenticated','public.user_onboarding_preferences','INSERT'), 'authenticated users can create preferences');
select ok(has_table_privilege('authenticated','public.user_onboarding_preferences','UPDATE'), 'authenticated users can update preferences');
select ok(not has_table_privilege('authenticated','public.user_onboarding_preferences','DELETE'), 'users cannot delete preferences through this client');

insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','a@example.org'),
 ('22222222-2222-4222-8222-222222222222','b@example.org'),
 ('33333333-3333-4333-8333-333333333333','new-preferences@example.org');
insert into public.user_onboarding_preferences(user_id,included_types) values
 ('11111111-1111-4111-8111-111111111111',array['School']),
 ('22222222-2222-4222-8222-222222222222',array['Finance']);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select results_eq(
  'select included_types[1] from public.user_onboarding_preferences',
  array['School']::text[],
  'user A reads only their own preferences'
);
-- The creation check needs an owner without an already-seeded preference row.
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select lives_ok(
  $$insert into public.user_onboarding_preferences(user_id,selected_sources)
    values ('33333333-3333-4333-8333-333333333333',array['professor@example.org'])$$,
  'owner can create preferences'
);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select throws_ok(
  $$insert into public.user_onboarding_preferences(user_id,included_types)
    values ('22222222-2222-4222-8222-222222222222',array['Forged'])$$,
  '42501', null, 'cannot create preferences for another user'
);
select throws_ok(
  $$update public.user_onboarding_preferences
    set user_id='22222222-2222-4222-8222-222222222222'
    where user_id='11111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'cannot transfer preference ownership'
);
select lives_ok(
  $$update public.user_onboarding_preferences set included_types=array['Research']
    where user_id='11111111-1111-4111-8111-111111111111'$$,
  'owner can update preferences'
);
select lives_ok(
  $$update public.user_onboarding_preferences set included_types=array['Wrong']
    where user_id='22222222-2222-4222-8222-222222222222'$$,
  'cross-owner update affects no rows'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select results_eq(
  'select included_types[1] from public.user_onboarding_preferences',
  array['Finance']::text[],
  'user B reads only their own preferences'
);
reset role;

set local role anon;
select throws_ok(
  'select * from public.user_onboarding_preferences',
  '42501', null, 'anonymous preference query denied'
);
reset role;
select * from finish();
rollback;
