-- Opt-in automatic continuation while the app is open. When on, the dashboard
-- starts the next batch itself after the cooldown, until no backlog remains.
-- Nothing runs on a schedule or while the app is closed, and every batch still
-- passes the same consent, pause, source, budget and cooldown checks.
--
-- Saved apart from scan_settings_save on purpose: turning this on or off does not
-- change what is processed, so it neither bumps the settings revision nor fences
-- an in-progress scan or its saved continuation.
alter table public.scan_settings add column auto_scan boolean not null default false;

create or replace function private.scan_settings_get() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); settings public.scan_settings;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into settings from public.scan_settings where user_id=uid;
  if settings.user_id is null then
    -- Apply table defaults without creating rows on a read.
    return jsonb_build_object('revision',0,'consent',false,'consent_at',null,'disclosure_version',null,'paused',true,
      'rules','{"allow":{"labels":[],"senders":[],"domains":[],"subjectKeywords":[],"keywords":[]},"block":{"labels":[],"senders":[],"domains":[],"subjectKeywords":[],"keywords":[]}}'::jsonb,
      'semantic_preferences','{"include":[],"exclude":[],"blockedWords":{}}'::jsonb,'requires_review',false,'legacy_phrase_rules',null,
      'context_limits','{"maxMessages":5,"maxAgeDays":90,"maxMessageChars":12000,"maxTotalChars":24000}'::jsonb,
      'auto_scan',false);
  end if;
  return to_jsonb(settings)-'user_id';
end; $$;

create function private.scan_auto_scan_save(p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_enabled is null then raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
  -- Same preference -> settings lock order as scan_settings_save.
  insert into public.storage_preferences(user_id) values(uid) on conflict do nothing;
  perform 1 from public.storage_preferences where user_id=uid for update;
  insert into public.scan_settings(user_id) values(uid) on conflict do nothing;
  update public.scan_settings set auto_scan=p_enabled,updated_at=now() where user_id=uid;
  return private.scan_settings_get();
end; $$;
create function public.scan_auto_scan_save(p_enabled boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.scan_auto_scan_save(p_enabled); $$;
revoke all on function private.scan_auto_scan_save(boolean),public.scan_auto_scan_save(boolean) from public,anon;
grant execute on function private.scan_auto_scan_save(boolean),public.scan_auto_scan_save(boolean) to authenticated;
