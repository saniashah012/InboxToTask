create table public.user_onboarding_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  included_types text[] not null default '{}'::text[],
  selected_sources text[] not null default '{}'::text[],
  excluded_types text[] not null default '{}'::text[],
  excluded_sources text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_onboarding_preferences enable row level security;
revoke all privileges on table public.user_onboarding_preferences
  from anon, authenticated, service_role;
grant usage on schema public to authenticated, service_role;
grant select, insert, update on table public.user_onboarding_preferences
  to authenticated;

create policy "Users can read own onboarding preferences"
  on public.user_onboarding_preferences for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create own onboarding preferences"
  on public.user_onboarding_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update own onboarding preferences"
  on public.user_onboarding_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.user_onboarding_preferences_set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.user_onboarding_preferences_set_updated_at()
  from public, anon, authenticated;
create trigger user_onboarding_preferences_set_updated_at
  before update on public.user_onboarding_preferences
  for each row execute function public.user_onboarding_preferences_set_updated_at();
