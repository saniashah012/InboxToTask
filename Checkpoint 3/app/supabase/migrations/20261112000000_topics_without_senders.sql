-- A permitted sender or domain is no longer required when at least one topic to
-- check is saved. Then any sender that is not blocked is a candidate, and backend
-- code skips every email that uses none of the topics' words before any model call
-- (20261111000000). With neither a permitted source nor a topic to check, nothing
-- is scanned, as before. Blocked senders, domains and skipped-topic words still win.
-- No scans are enabled here.

-- Must match filterMessage(..., anySender) in pipeline/core.mjs.
create function private.scan_sources_ready(rules jsonb,semantic jsonb) returns boolean
language sql immutable set search_path='' as $$
 select jsonb_array_length(rules->'allow'->'senders')+jsonb_array_length(rules->'allow'->'domains')>0
   or jsonb_array_length(coalesce(semantic->'include','[]'))>0
$$;

-- An empty allowlist now means "any sender that is not blocked". Scanning with an
-- empty allowlist needs a topic to check (scan_sources_ready above), and the topic
-- words are enforced in backend code before any model call.
create or replace function private.gmail_permitted(meta jsonb,rules jsonb) returns boolean language sql immutable set search_path='' as $$
 select (jsonb_array_length(rules->'allow'->'senders')+jsonb_array_length(rules->'allow'->'domains')=0
   or rules->'allow'->'senders' ? lower(meta->>'from') or rules->'allow'->'domains' ? split_part(lower(meta->>'from'),'@',2))
 and not(rules->'block'->'senders' ? lower(meta->>'from') or rules->'block'->'domains' ? split_part(lower(meta->>'from'),'@',2))
 and not exists(select 1 from jsonb_array_elements_text(rules->'block'->'subjectKeywords') v where position(lower(v) in lower(meta->>'subject'))>0);
$$;

-- Same as 20261105223000 apart from the source check.
create or replace function public.gmail_scan_service(p_user uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.scan_settings; c private.google_connections; w private.gmail_scan_work; g bigint; storage_enabled boolean;
begin
 -- Consistent preference -> settings -> connection -> work lock order.
 perform 1 from public.storage_preferences where user_id=p_user for update;
 select generation,enabled into g,storage_enabled from public.storage_preferences where user_id=p_user;
 select * into s from public.scan_settings where user_id=p_user for update;
 select * into c from private.google_connections where user_id=p_user for update;
 if s.user_id is null or g is null or storage_enabled is distinct from true or not s.consent or s.paused or s.requires_review
   or s.disclosure_version is distinct from 'gmail-scan-v1'
   or not private.scan_sources_ready(s.rules,s.semantic_preferences)
   or c.state is distinct from 'connected'
   or not(c.scopes ? 'https://www.googleapis.com/auth/gmail.readonly')
   or not exists(select 1 from auth.users where id=p_user and lower(email)=lower(c.email)) then
   raise exception 'SCAN_PERMISSION_REQUIRED' using errcode='PT409';
 end if;
 insert into private.gmail_scan_work(user_id) values(p_user) on conflict do nothing;
 select * into w from private.gmail_scan_work where user_id=p_user for update;
 if p_action='claim' then
   if (w.lease_until>now() and w.settings_revision=s.revision and w.storage_generation=g and w.connection_generation=c.generation) or w.last_started>now()-interval '60 seconds' then
     return jsonb_build_object('state','busy');
   end if;
   if p_data->>'mode'='more' then
     if w.continuation is null or w.settings_revision is distinct from s.revision
       or w.storage_generation is distinct from g or w.connection_generation is distinct from c.generation then
       raise exception 'SCAN_CONTINUATION_STALE' using errcode='PT409';
     end if;
   elsif p_data->>'mode'='initial' then
     w.window_end:=now(); w.window_start:=now()-interval '7 days'; w.continuation:=null;
   else raise exception 'INVALID_SCAN_REQUEST' using errcode='22023'; end if;
   w.lease:=gen_random_uuid();
   update private.gmail_scan_work set lease=w.lease,lease_until=now()+interval '4 minutes',last_started=now(),
     settings_revision=s.revision,storage_generation=g,connection_generation=c.generation,
     window_start=w.window_start,window_end=w.window_end,continuation=w.continuation where user_id=p_user;
   return jsonb_build_object('state','claimed','lease',w.lease,'rules',s.rules,'contextLimits',s.context_limits,
     'semanticPreferences',s.semantic_preferences,'start',w.window_start,'end',w.window_end,'continuation',w.continuation);
 end if;
 if w.lease is null or w.lease is distinct from (p_data->>'lease')::uuid or w.lease_until<=now()
   or w.settings_revision is distinct from s.revision or w.storage_generation is distinct from g
   or w.connection_generation is distinct from c.generation then
   raise exception 'SCAN_STALE' using errcode='PT409';
 end if;
 if p_action='assert' then return jsonb_build_object('state','current');
 elsif p_action='finish' then
   if octet_length(p_data::text)>12000 then raise exception 'INVALID_SCAN_REQUEST' using errcode='22023'; end if;
   update private.gmail_scan_work set lease=null,lease_until=null,
     continuation=nullif(p_data->'continuation','null'::jsonb),last_result=p_data->'result',last_finished_at=now(),
     last_successful_at=case when p_data->'result'->>'executionMode'='GMAIL_PERSISTENT_MANUAL' and p_data->'result'->>'error' is null then now() else last_successful_at end where user_id=p_user;
   return jsonb_build_object('state','finished');
 end if;
 raise exception 'INVALID_SCAN_REQUEST' using errcode='22023';
end; $$;

revoke all on function private.scan_sources_ready(jsonb,jsonb) from public,anon,authenticated;

-- A save made the previous scan's unfinished work stale, but nothing cleared it:
-- the dashboard kept asking to continue it and every Scan now was refused with
-- SCAN_CONTINUATION_STALE. A save now clears it (same as 20261111000000 otherwise).
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
    consent=p_consent,paused=p_paused,
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

-- Clear unfinished work that is already stale.
update private.gmail_scan_work w set continuation=null from public.scan_settings s
 where s.user_id=w.user_id and w.continuation is not null and w.settings_revision is distinct from s.revision;
