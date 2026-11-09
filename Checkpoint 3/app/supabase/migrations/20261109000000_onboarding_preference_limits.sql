-- Bound the onboarding preference lists to the same limits as scan_settings rules:
-- at most 200 entries, each 1-254 characters, no null entries.
create function private.valid_onboarding_list(v text[]) returns boolean
language sql immutable set search_path='' as $$
  select v is not null
    and coalesce(array_ndims(v), 1) = 1
    and coalesce(cardinality(v), 0) <= 200
    and not exists (
      select 1 from unnest(v) as e
      where e is null or char_length(e) not between 1 and 254
    );
$$;
revoke all on function private.valid_onboarding_list(text[]) from public, anon;
-- Browser inserts/updates evaluate the CHECK as the calling role.
grant execute on function private.valid_onboarding_list(text[]) to authenticated, service_role;

-- NOT VALID: enforce on new writes without failing on any existing row.
alter table public.user_onboarding_preferences
  add constraint user_onboarding_preferences_included_types_limits
    check (private.valid_onboarding_list(included_types)) not valid,
  add constraint user_onboarding_preferences_selected_sources_limits
    check (private.valid_onboarding_list(selected_sources)) not valid,
  add constraint user_onboarding_preferences_excluded_types_limits
    check (private.valid_onboarding_list(excluded_types)) not valid,
  add constraint user_onboarding_preferences_excluded_sources_limits
    check (private.valid_onboarding_list(excluded_sources)) not valid;
