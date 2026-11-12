-- Topics to check get literal word lists too: semantic_preferences.includeWords holds
-- one list per topic to check. When any topic to check is saved, backend code skips
-- a permitted email that contains none of their words, before any model call. The
-- lists only narrow what is processed; they never grant access. A topic saved
-- without a list gets its starter list, or its own name for a custom topic.
-- No scans are enabled here.

-- Must match STARTER_TOPIC_WORDS in pipeline/private-topics.mjs (a test compares them).
create function private.starter_topic_words(topic text) returns jsonb
language sql immutable set search_path='' as $$
  select case topic
  when 'school' then '["class","classes","course","courses","homework","assignment","assignments","syllabus","lecture","lectures","exam","exams","midterm","midterms","final exam","quiz","quizzes","professor","instructor","teaching assistant","office hours","canvas","grade","grades","semester","tutoring","registration","advisor"]'::jsonb
  when 'job applications' then '["application","applications","applied","interview","interviews","recruiter","recruiting","resume","cover letter","job offer","offer letter","internship","internships","position","hiring","candidate","background check","career fair","job"]'::jsonb
  when 'research' then '["research","study","paper","papers","manuscript","journal","conference","submission","reviewer","irb","dataset","experiment","experiments","survey","literature review","lab meeting","thesis","dissertation","grant","abstract"]'::jsonb
  when 'meetings' then '["meeting","meetings","meet","zoom","google meet","teams meeting","calendar invite","invitation","agenda","minutes","schedule","reschedule","rescheduled","availability","appointment","call"]'::jsonb
  else jsonb_build_array(topic) end
$$;

-- One word list per topic in `topics`, from `saved` or the starter function.
create function private.normalize_topic_word_lists(topics jsonb, saved jsonb, starter text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare topic text; words jsonb; item jsonb; v text; topic_words jsonb; all_words jsonb:='{}'; total int:=0;
begin
 saved:=coalesce(saved,'{}');
 if jsonb_typeof(saved)<>'object' then raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
 saved:=(select coalesce(jsonb_object_agg(lower(btrim(key)),value),'{}') from jsonb_each(saved));
 -- Lists for topics no longer selected are dropped.
 for topic in select jsonb_array_elements_text(topics) loop
  words:=coalesce(saved->topic,case starter when 'blocked' then private.starter_blocked_words(topic) else private.starter_topic_words(topic) end);
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
 return all_words;
end; $$;

create or replace function private.normalize_scan_semantic(doc jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare g text; item jsonb; v text; values_json jsonb; result jsonb:='{}';
begin
 if doc is null or jsonb_typeof(doc)<>'object' or not(doc ?& array['include','exclude'])
   or exists(select 1 from jsonb_object_keys(doc) k where k not in ('include','exclude','blockedWords','includeWords')) then
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
 return result
   ||jsonb_build_object('blockedWords',private.normalize_topic_word_lists(result->'exclude',doc->'blockedWords','blocked'))
   ||jsonb_build_object('includeWords',private.normalize_topic_word_lists(result->'include',doc->'includeWords','check'));
end; $$;

alter table public.scan_settings drop constraint scan_settings_semantic_check;
update public.scan_settings set semantic_preferences=private.normalize_scan_semantic(semantic_preferences);
alter table public.scan_settings add constraint scan_settings_semantic_check check(semantic_preferences=private.normalize_scan_semantic(semantic_preferences));
alter table public.scan_settings alter column semantic_preferences set default '{"include":[],"exclude":[],"blockedWords":{},"includeWords":{}}';

-- Same contract as before. A save without blockedWords or includeWords (an older
-- client) keeps the saved list of each topic that stays selected.
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
  return private.scan_settings_get();
end; $$;

revoke all on function private.starter_topic_words(text) from public,anon,authenticated;
revoke all on function private.normalize_topic_word_lists(jsonb,jsonb,text) from public,anon,authenticated;
