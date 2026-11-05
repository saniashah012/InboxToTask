-- Source access and semantic preferences are independent. No scans are enabled.
alter table public.scan_settings drop constraint scan_settings_rules_check;
alter table public.scan_settings add column semantic_preferences jsonb not null default '{"include":[],"exclude":[]}';
alter table public.scan_settings add column requires_review boolean not null default false;
alter table public.scan_settings add column legacy_phrase_rules jsonb;
-- Preserve incompatible rules verbatim for review, never reinterpret exclusions.
with changed as (
 update public.scan_settings set legacy_phrase_rules=rules,requires_review=true,
 rules=jsonb_set(jsonb_set(rules,'{allow,keywords}','[]'),'{block,keywords}','[]'),
 consent=false,consent_at=null,disclosure_version=null,paused=true,revision=revision+1,updated_at=now()
 where jsonb_array_length(rules->'allow'->'keywords')>0 or jsonb_array_length(rules->'block'->'keywords')>0 returning user_id
), fenced as (
 update public.storage_preferences set generation=generation+1,updated_at=now() where user_id in (select user_id from changed) returning user_id
), cancelled as (
 update private.storage_jobs set state='cancelled',updated_at=now() where user_id in (select user_id from changed) and state='processing' returning user_id
)
update private.storage_attempts set state='unknown',finished_at=now() where user_id in (select user_id from changed) and state='processing';
create or replace function private.normalize_scan_rules(doc jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare g text; f text; entry jsonb; value text; normalized jsonb; items jsonb; result jsonb := '{}';
begin
  if doc is null or jsonb_typeof(doc) <> 'object'
    or not (doc ?& array['allow','block'])
    or (select count(*) from jsonb_object_keys(doc)) <> 2 then
    raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
  end if;
  foreach g in array array['allow','block'] loop
    if jsonb_typeof(doc->g) is distinct from 'object'
      or not (doc->g ?& array['labels','senders','domains'])
      or exists(select 1 from jsonb_object_keys(doc->g) k where k not in ('labels','senders','domains','subjectKeywords','keywords')) then
      raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
    end if;
    normalized := '{}';
    foreach f in array array['labels','senders','domains','subjectKeywords','keywords'] loop
      -- Compatibility: an absent new subject list is empty; supplied null is invalid.
      items := coalesce(doc->g->f, '[]');
      if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 200 then
        raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
      end if;
      if (f in ('labels','keywords') or (g='allow' and f='subjectKeywords')) and jsonb_array_length(items)>0 then
        raise exception 'OBSOLETE_SCAN_RULES_REVIEW_REQUIRED' using errcode='22023';
      end if;
      normalized := normalized || jsonb_build_object(f,'[]'::jsonb);
      for entry in select * from jsonb_array_elements(items) loop
        if jsonb_typeof(entry) <> 'string' then raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
        value := btrim(entry#>>'{}');
        if length(value) not between 1 and 254 or value ~ '[[:cntrl:]]'
          or (f='labels' and length(value)>100) then
          raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
        end if;
        if f <> 'labels' then value := lower(value); end if;
        if f='senders' and value !~ '^[^[:space:]@<>]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
          or f='domains' and value !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' then
          raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
        end if;
        if not (normalized->f ? value) then
          normalized := jsonb_set(normalized,array[f],(normalized->f)||jsonb_build_array(value));
        end if;
      end loop;
    end loop;
    result := result || jsonb_build_object(g,normalized);
  end loop;
  return result;
end; $$;

create or replace function private.valid_scan_context(doc jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare f text; n numeric;
begin
  if doc is null or jsonb_typeof(doc)<>'object'
    or not(doc ?& array['maxMessages','maxAgeDays','maxMessageChars','maxTotalChars'])
    or (select count(*) from jsonb_object_keys(doc))<>4 then return false; end if;
  foreach f in array array['maxMessages','maxAgeDays','maxMessageChars','maxTotalChars'] loop
    if jsonb_typeof(doc->f)<>'number' then return false; end if;
    n := (doc->>f)::numeric;
    if n<>trunc(n) or n < (case f when 'maxMessages' then 0 when 'maxAgeDays' then 1 else 100 end)
      or n > (case f when 'maxMessages' then 10 when 'maxAgeDays' then 365 when 'maxMessageChars' then 30000 else 60000 end) then return false; end if;
  end loop;
  return (doc->>'maxTotalChars')::integer >= (doc->>'maxMessageChars')::integer;
exception when others then return false;
end; $$;


create function private.normalize_scan_semantic(doc jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare g text; item jsonb; v text; values_json jsonb; result jsonb:='{}';
begin
 if doc is null or jsonb_typeof(doc)<>'object' or not(doc ?& array['include','exclude']) or (select count(*) from jsonb_object_keys(doc))<>2 then raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
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
 return result;
end; $$;
alter table public.scan_settings add constraint scan_settings_rules_check check(rules=private.normalize_scan_rules(rules));
alter table public.scan_settings add constraint scan_settings_semantic_check check(semantic_preferences=private.normalize_scan_semantic(semantic_preferences));
-- Only defaults change; existing users keep their saved context and consent.
alter table public.scan_settings alter column context_limits set default '{"maxMessages":5,"maxAgeDays":90,"maxMessageChars":12000,"maxTotalChars":24000}';
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
      'semantic_preferences','{"include":[],"exclude":[]}'::jsonb,'requires_review',false,'legacy_phrase_rules',null,
      'context_limits','{"maxMessages":5,"maxAgeDays":90,"maxMessageChars":12000,"maxTotalChars":24000}'::jsonb);
  end if;
  return to_jsonb(settings)-'user_id';
end; $$;

drop function public.scan_settings_save(bigint,jsonb,jsonb,boolean,boolean,text);
drop function private.scan_settings_save(bigint,jsonb,jsonb,boolean,boolean,text);
create function private.scan_settings_save(p_revision bigint,p_rules jsonb,p_context jsonb,p_consent boolean,p_paused boolean,p_disclosure text,p_semantic jsonb,p_reviewed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); settings public.scan_settings; normalized jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_revision is null or p_revision<0 or p_consent is null or p_paused is null
    or not private.valid_scan_context(p_context)
    or (p_consent and p_disclosure is distinct from 'gmail-scan-v1') then
    raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
  normalized := private.normalize_scan_rules(p_rules);
  p_semantic := private.normalize_scan_semantic(p_semantic);
  -- Match the existing preference -> child lock order for finishes/deletion.
  insert into public.storage_preferences(user_id) values(uid) on conflict do nothing;
  perform 1 from public.storage_preferences where user_id=uid for update;
  insert into public.scan_settings(user_id) values(uid) on conflict do nothing;
  select * into settings from public.scan_settings where user_id=uid for update;
  if settings.requires_review and p_reviewed is distinct from true then raise exception 'SCAN_RULE_REVIEW_REQUIRED' using errcode='22023'; end if;
  if settings.revision<>p_revision then raise exception 'STALE_SCAN_SETTINGS' using errcode='PT409'; end if;
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


create function public.scan_settings_save(p_revision bigint,p_rules jsonb,p_context jsonb,p_consent boolean,p_paused boolean,p_disclosure text,p_semantic jsonb,p_reviewed boolean default false)
returns jsonb language sql security invoker set search_path='' as $$ select private.scan_settings_save(p_revision,p_rules,p_context,p_consent,p_paused,p_disclosure,p_semantic,p_reviewed); $$;
revoke all on function private.normalize_scan_semantic(jsonb),private.scan_settings_save(bigint,jsonb,jsonb,boolean,boolean,text,jsonb,boolean),public.scan_settings_save(bigint,jsonb,jsonb,boolean,boolean,text,jsonb,boolean) from public,anon;
grant execute on function private.scan_settings_save(bigint,jsonb,jsonb,boolean,boolean,text,jsonb,boolean),public.scan_settings_save(bigint,jsonb,jsonb,boolean,boolean,text,jsonb,boolean) to authenticated;
