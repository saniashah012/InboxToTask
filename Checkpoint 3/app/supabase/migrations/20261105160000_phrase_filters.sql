alter table public.scan_settings drop constraint scan_settings_rules_check;
-- Canonical phrase filters; no retrieval, model calls, schedules, or hosted changes.
-- Preserve old subject exclusions at their previous scope. Obsolete source selections
-- require review: remove their permission and revoke consent/pause affected users.
with changed as (
  update public.scan_settings set
    rules=jsonb_set(jsonb_set(jsonb_set(rules,'{allow,labels}','[]'),'{block,labels}','[]'),'{allow,subjectKeywords}','[]'),
    consent=false,consent_at=null,disclosure_version=null,paused=true,revision=revision+1,updated_at=now()
  where jsonb_array_length(rules->'allow'->'labels')>0 or jsonb_array_length(rules->'block'->'labels')>0
    or jsonb_array_length(coalesce(rules->'allow'->'subjectKeywords','[]'))>0
  returning user_id
), fenced as (
  update public.storage_preferences set generation=generation+1,updated_at=now()
  where user_id in (select user_id from changed) returning user_id
), cancelled as (
  update private.storage_jobs set state='cancelled',updated_at=now()
  where user_id in (select user_id from changed) and state='processing' returning user_id
)
update private.storage_attempts set state='unknown',finished_at=now()
where user_id in (select user_id from changed) and state='processing';

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
      if (f='labels' or (g='allow' and f='subjectKeywords')) and jsonb_array_length(items)>0 then
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

update public.scan_settings set rules=private.normalize_scan_rules(rules);
alter table public.scan_settings add constraint scan_settings_rules_check check(rules=private.normalize_scan_rules(rules));
alter table public.scan_settings alter column rules set default '{"allow":{"labels":[],"senders":[],"domains":[],"subjectKeywords":[],"keywords":[]},"block":{"labels":[],"senders":[],"domains":[],"subjectKeywords":[],"keywords":[]}}'::jsonb;
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
      'context_limits','{"maxMessages":0,"maxAgeDays":30,"maxMessageChars":12000,"maxTotalChars":24000}'::jsonb);
  end if;
  return to_jsonb(settings)-'user_id';
end; $$;
