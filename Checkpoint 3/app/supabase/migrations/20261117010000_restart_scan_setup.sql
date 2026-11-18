-- "Clear settings and run setup again". Puts an account's saved scan settings back
-- to what a brand-new account has, so the next sign-in goes through onboarding and
-- the person enters every required field again. Used between user-study sessions.
--
-- Only scan_settings changes. Tasks, suggestions, Passive emails, Waiting-for items,
-- Calendar records, the Google connection, storage enablement and budgets are left
-- exactly as they are.
--
-- The revision keeps increasing instead of returning to 0: scan work, completed
-- check windows and open browser forms record the revision they used, and a reused
-- number could make old work look current. setup_pending marks "set up again" instead.
-- The restart fences in-flight work the same way a save does.
alter table public.scan_settings add column setup_pending boolean not null default false;

create function private.scan_settings_restart(p_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); settings public.scan_settings;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_revision is null or p_revision<0 then raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
  -- Same preference -> settings lock order as scan_settings_save.
  insert into public.storage_preferences(user_id) values(uid) on conflict do nothing;
  perform 1 from public.storage_preferences where user_id=uid for update;
  insert into public.scan_settings(user_id) values(uid) on conflict do nothing;
  select * into settings from public.scan_settings where user_id=uid for update;
  if settings.revision<>p_revision then raise exception 'STALE_SCAN_SETTINGS' using errcode='PT409'; end if;
  -- Column defaults are what a brand-new account has. No consent, paused, no
  -- sources, so nothing can be scanned until setup is saved again.
  update public.scan_settings set revision=revision+1,consent=false,consent_at=null,disclosure_version=null,paused=true,
    rules=default,context_limits=default,semantic_preferences=default,requires_review=false,legacy_phrase_rules=null,
    auto_scan=false,setup_pending=true,updated_at=now() where user_id=uid;
  -- Same fencing as a save: older storage work and unfinished scan work cannot commit.
  update public.storage_preferences set generation=generation+1,updated_at=now() where user_id=uid;
  update private.storage_jobs set state='cancelled',updated_at=now() where user_id=uid and state='processing';
  update private.storage_attempts set state='unknown',finished_at=now() where user_id=uid and state='processing';
  update private.gmail_scan_work set continuation=null where user_id=uid;
  return private.scan_settings_get();
end; $$;
create function public.scan_settings_restart(p_revision bigint) returns jsonb
language sql security invoker set search_path='' as $$ select private.scan_settings_restart(p_revision); $$;
revoke all on function private.scan_settings_restart(bigint),public.scan_settings_restart(bigint) from public,anon;
grant execute on function private.scan_settings_restart(bigint),public.scan_settings_restart(bigint) to authenticated;

-- A save finishes setup. Same function as 20261112000000 apart from setup_pending=false.
create or replace function private.scan_settings_save(p_revision bigint,p_rules jsonb,p_context jsonb,p_consent boolean,p_paused boolean,p_disclosure text,p_semantic jsonb,p_reviewed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); settings public.scan_settings; normalized jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_revision is null or p_revision<0 or p_consent is null or p_paused is null
    or not private.valid_scan_context(p_context)
    or (p_consent and p_disclosure is distinct from 'gmail-scan-v1') then
    raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
  normalized := private.normalize_scan_rules(p_rules);
  -- Validate before taking locks; the carried-over lists are validated again below.
  perform private.normalize_scan_semantic(p_semantic);
  -- Match the existing preference -> child lock order for finishes/deletion.
  insert into public.storage_preferences(user_id) values(uid) on conflict do nothing;
  perform 1 from public.storage_preferences where user_id=uid for update;
  insert into public.scan_settings(user_id) values(uid) on conflict do nothing;
  select * into settings from public.scan_settings where user_id=uid for update;
  if settings.requires_review and p_reviewed is distinct from true then raise exception 'SCAN_RULE_REVIEW_REQUIRED' using errcode='22023'; end if;
  if settings.revision<>p_revision then raise exception 'STALE_SCAN_SETTINGS' using errcode='PT409'; end if;
  if not(p_semantic ? 'blockedWords') then
    p_semantic := p_semantic||jsonb_build_object('blockedWords',coalesce(settings.semantic_preferences->'blockedWords','{}'));
  end if;
  if not(p_semantic ? 'includeWords') then
    p_semantic := p_semantic||jsonb_build_object('includeWords',coalesce(settings.semantic_preferences->'includeWords','{}'));
  end if;
  p_semantic := private.normalize_scan_semantic(p_semantic);
  update public.scan_settings set revision=revision+1,rules=normalized,context_limits=p_context,semantic_preferences=p_semantic,requires_review=false,
    consent=p_consent,paused=p_paused,setup_pending=false,
    consent_at=case when p_consent then coalesce(consent_at,now()) else null end,
    disclosure_version=case when p_consent then p_disclosure else null end,updated_at=now() where user_id=uid;
  -- Fence all older storage work without changing accepted tasks or fixture enablement.
  update public.storage_preferences set generation=generation+1,updated_at=now() where user_id=uid;
  update private.storage_jobs set state='cancelled',updated_at=now() where user_id=uid and state='processing';
  update private.storage_attempts set state='unknown',finished_at=now() where user_id=uid and state='processing';
  -- Unfinished scan work belongs to the old revision and can never be continued, so
  -- the next Scan now starts a fresh 7-day check instead of being refused.
  update private.gmail_scan_work set continuation=null where user_id=uid;
  return private.scan_settings_get();
end; $$;

-- Reads return setup_pending (a stored row already does, through to_jsonb). Same
-- function as 20261112002000 apart from the key in the never-saved defaults.
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
      'auto_scan',false,'setup_pending',false);
  end if;
  return to_jsonb(settings)-'user_id';
end; $$;
