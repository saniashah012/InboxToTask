-- Private topics become literal word lists that backend code checks before any
-- model call. semantic_preferences keeps include and exclude as topic names, so
-- existing readers still work, and adds blockedWords: one list per excluded topic.
-- A topic saved without a list gets its starter list, or its own name for a custom
-- topic, so conversion and older clients err toward blocking more. Word lists only
-- withhold email; they never grant access. No scans are enabled here.

-- Must match STARTER_BLOCKED_WORDS in pipeline/private-topics.mjs (a test compares them).
create function private.starter_blocked_words(topic text) returns jsonb
language sql immutable set search_path='' as $$
 select case topic
  when 'financial' then '["bank statement","bank statements","account number","routing number","credit card","debit card","credit score","credit report","loan","loans","mortgage","tax return","tax returns","w-2","1099","paycheck","pay stub","pay stubs","payroll","wire transfer","overdraft","balance due","billing statement","financial aid","venmo","zelle","paypal"]'::jsonb
  when 'health' then '["diagnosis","diagnoses","diagnosed","prescription","prescriptions","pharmacy","medication","medications","therapist","therapy","counseling","mental health","medical","medical record","medical records","lab results","patient portal","mychart","symptoms","health insurance","insurance claim","clinic","hospital","doctor","doctors","vaccine","vaccination","surgery"]'::jsonb
  when 'promotions' then '["promo code","promo codes","coupon","coupons","discount code","free shipping","limited time offer","flash sale","shop now","order now","special offer","exclusive offer","deal ends"]'::jsonb
  when 'family & friends' then '["mom","dad","mother","father","grandma","grandpa","grandmother","grandfather","aunt","uncle","cousin","sister","brother","family","birthday party","love you","miss you"]'::jsonb
  else jsonb_build_array(topic) end
$$;

create or replace function private.normalize_scan_semantic(doc jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare g text; item jsonb; v text; values_json jsonb; result jsonb:='{}'; saved jsonb; topic text; words jsonb;
  topic_words jsonb; all_words jsonb:='{}'; total int:=0;
begin
 if doc is null or jsonb_typeof(doc)<>'object' or not(doc ?& array['include','exclude'])
   or exists(select 1 from jsonb_object_keys(doc) k where k not in ('include','exclude','blockedWords')) then
  raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
 foreach g in array array['include','exclude'] loop
  if jsonb_typeof(doc->g)<>'array' or jsonb_array_length(doc->g)>200 then raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
  values_json:='[]';
  for item in select * from jsonb_array_elements(doc->g) loop
   v:=lower(btrim(item#>>'{}'));
   if jsonb_typeof(item)<>'string' or length(v) not between 1 and 254 or v ~ '[[:cntrl:]]' then raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
   if not(values_json ? v) then values_json:=values_json||jsonb_build_array(v); end if;
  end loop;
  result:=result||jsonb_build_object(g,values_json);
 end loop;
 saved:=coalesce(doc->'blockedWords','{}');
 if jsonb_typeof(saved)<>'object' then raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
 saved:=(select coalesce(jsonb_object_agg(lower(btrim(key)),value),'{}') from jsonb_each(saved));
 -- Lists for topics no longer excluded are dropped.
 for topic in select jsonb_array_elements_text(result->'exclude') loop
  words:=coalesce(saved->topic,private.starter_blocked_words(topic));
  if jsonb_typeof(words)<>'array' or jsonb_array_length(words) not between 1 and 100 then raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
  topic_words:='[]';
  for item in select * from jsonb_array_elements(words) loop
   if jsonb_typeof(item)<>'string' or (item#>>'{}') ~ '[[:cntrl:]]' then raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
   v:=lower(regexp_replace(regexp_replace(item#>>'{}','^\s+|\s+$','','g'),'\s+',' ','g'));
   if length(v) not between 1 and 100 or v !~ '[[:alnum:]]' then raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
   if not(topic_words ? v) then topic_words:=topic_words||jsonb_build_array(v); end if;
  end loop;
  total:=total+jsonb_array_length(topic_words);
  all_words:=all_words||jsonb_build_object(topic,topic_words);
 end loop;
 if total>1000 then raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
 return result||jsonb_build_object('blockedWords',all_words);
end; $$;

alter table public.scan_settings drop constraint scan_settings_semantic_check;
update public.scan_settings set semantic_preferences=private.normalize_scan_semantic(semantic_preferences);
alter table public.scan_settings add constraint scan_settings_semantic_check check(semantic_preferences=private.normalize_scan_semantic(semantic_preferences));
alter table public.scan_settings alter column semantic_preferences set default '{"include":[],"exclude":[],"blockedWords":{}}';

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
      'context_limits','{"maxMessages":5,"maxAgeDays":90,"maxMessageChars":12000,"maxTotalChars":24000}'::jsonb);
  end if;
  return to_jsonb(settings)-'user_id';
end; $$;

-- Same contract as before. A save without blockedWords (an older client) keeps the
-- saved list of each topic that stays excluded, rather than resetting it.
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
  p_semantic := private.normalize_scan_semantic(p_semantic);
  update public.scan_settings set revision=revision+1,rules=normalized,context_limits=p_context,semantic_preferences=p_semantic,requires_review=false,
    consent=p_consent,paused=p_paused,
    consent_at=case when p_consent then coalesce(consent_at,now()) else null end,
    disclosure_version=case when p_consent then p_disclosure else null end,updated_at=now() where user_id=uid;
  -- Fence all older storage work without changing accepted tasks or fixture enablement.
  update public.storage_preferences set generation=generation+1,updated_at=now() where user_id=uid;
  update private.storage_jobs set state='cancelled',updated_at=now() where user_id=uid and state='processing';
  update private.storage_attempts set state='unknown',finished_at=now() where user_id=uid and state='processing';
  return private.scan_settings_get();
end; $$;

revoke all on function private.starter_blocked_words(text) from public,anon,authenticated;
