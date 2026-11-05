create function private.storage_activity() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); day date:=(now() at time zone 'UTC')::date;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  return jsonb_build_object('requestsToday',coalesce((select requests from private.storage_usage where user_id=uid and usage_day=day),0),
    'chargedOrReservedTokens',coalesce((select charged_or_reserved_tokens from private.storage_usage where user_id=uid and usage_day=day),0),
    'dailyRequests',(select daily_requests from public.storage_preferences where user_id=uid),
    'dailyTokens',(select daily_tokens from public.storage_preferences where user_id=uid),
    'processing',(select count(*) from private.storage_jobs where user_id=uid and state='processing' and lease_until>now()),
    'failed',(select count(*) from private.storage_jobs where user_id=uid and state='failed'),
    'saved',(select count(*) from public.storage_extractions where user_id=uid),
    'resetAt',(day+1)::timestamp at time zone 'UTC');
end; $$;
create function public.storage_activity() returns jsonb language sql security invoker set search_path='' as $$ select private.storage_activity(); $$;
revoke all on function public.storage_activity(),private.storage_activity() from public,anon;
grant execute on function public.storage_activity(),private.storage_activity() to authenticated;
