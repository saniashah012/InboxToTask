begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('44444444-4444-4444-8444-444444444444','limits@example.org');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',true);

select lives_ok(
  $$insert into public.user_onboarding_preferences(user_id,included_types,selected_sources)
    values ('44444444-4444-4444-8444-444444444444',
            array_fill('School'::text, array[200]),
            array[repeat('a',254)])$$,
  'lists at the size limits are accepted'
);
select lives_ok(
  $$update public.user_onboarding_preferences set excluded_types='{}'
    where user_id='44444444-4444-4444-8444-444444444444'$$,
  'empty lists are accepted'
);
select throws_ok(
  $$update public.user_onboarding_preferences set included_types=array_fill('x'::text, array[201])
    where user_id='44444444-4444-4444-8444-444444444444'$$,
  '23514', null, 'more than 200 entries is rejected'
);
select throws_ok(
  $$update public.user_onboarding_preferences set selected_sources=array[repeat('a',255)]
    where user_id='44444444-4444-4444-8444-444444444444'$$,
  '23514', null, 'entries over 254 characters are rejected'
);
select throws_ok(
  $$update public.user_onboarding_preferences set excluded_sources=array['']
    where user_id='44444444-4444-4444-8444-444444444444'$$,
  '23514', null, 'empty entries are rejected'
);
select throws_ok(
  $$update public.user_onboarding_preferences set excluded_types=array[null]::text[]
    where user_id='44444444-4444-4444-8444-444444444444'$$,
  '23514', null, 'null entries are rejected'
);
select throws_ok(
  $$update public.user_onboarding_preferences set included_types=array[['a','b'],['c','d']]
    where user_id='44444444-4444-4444-8444-444444444444'$$,
  '23514', null, 'multidimensional lists are rejected'
);
reset role;

select * from finish();
rollback;
