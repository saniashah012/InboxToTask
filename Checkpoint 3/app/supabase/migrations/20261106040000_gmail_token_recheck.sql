-- A scan rejected by Gmail cannot tell revocation from a quota 403. Expiring the stored
-- token makes the next refresh ask Google, and only a refused refresh changes the status.
create function public.gmail_token_recheck(p_user uuid) returns void
language sql security definer set search_path='' as $$
 update private.google_connections set expires_at=now(),updated_at=now() where user_id=p_user and state='connected';
$$;
revoke all on function public.gmail_token_recheck(uuid) from public,anon,authenticated;
grant execute on function public.gmail_token_recheck(uuid) to service_role;
