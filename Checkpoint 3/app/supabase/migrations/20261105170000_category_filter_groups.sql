-- Preserve suggested keyword bundles as one editable category chip.
alter table public.scan_settings drop constraint scan_settings_rules_check;

create or replace function private.normalize_scan_rules(doc jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare
  g text;
  f text;
  entry jsonb;
  value text;
  normalized jsonb;
  items jsonb;
  result jsonb := '{}';
  group_entry jsonb;
  group_keywords jsonb;
  group_keyword jsonb;
  group_category text;
  group_value text;
  category_names text[];
  seen_categories text[];
begin
  if doc is null or jsonb_typeof(doc) <> 'object'
    or not (doc ?& array['allow','block'])
    or (select count(*) from jsonb_object_keys(doc)) <> 2 then
    raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
  end if;

  foreach g in array array['allow','block'] loop
    if jsonb_typeof(doc->g) is distinct from 'object'
      or not (doc->g ?& array['labels','senders','domains'])
      or exists(select 1 from jsonb_object_keys(doc->g) k
        where k not in ('labels','senders','domains','subjectKeywords','keywords','customKeywords','keywordGroups')) then
      raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
    end if;

    category_names := case g
      when 'allow' then array['School','Job applications','Research','Meetings']
      else array['Financial','Health','Promotions','Family & friends']
    end;
    normalized := '{}';

    foreach f in array array['labels','senders','domains','subjectKeywords','keywords','customKeywords'] loop
      if f='customKeywords' and not (doc->g ? 'customKeywords') then
        items := coalesce(doc->g->'keywords', '[]');
      else
        items := coalesce(doc->g->f, '[]');
      end if;

      if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 200 then
        raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
      end if;
      if (f='labels' or (g='allow' and f='subjectKeywords')) and jsonb_array_length(items)>0 then
        raise exception 'OBSOLETE_SCAN_RULES_REVIEW_REQUIRED' using errcode='22023';
      end if;

      normalized := normalized || jsonb_build_object(f,'[]'::jsonb);
      for entry in select * from jsonb_array_elements(items) loop
        if jsonb_typeof(entry) <> 'string' then
          raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
        end if;
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

    items := coalesce(doc->g->'keywordGroups', '[]');
    if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > cardinality(category_names) then
      raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
    end if;
    normalized := normalized || jsonb_build_object('keywordGroups','[]'::jsonb);
    seen_categories := array[]::text[];

    for group_entry in select * from jsonb_array_elements(items) loop
      if jsonb_typeof(group_entry) <> 'object'
        or (select count(*) from jsonb_object_keys(group_entry)) <> 2
        or not (group_entry ?& array['category','keywords'])
        or jsonb_typeof(group_entry->'category') <> 'string'
        or jsonb_typeof(group_entry->'keywords') <> 'array' then
        raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
      end if;
      group_category := group_entry->>'category';
      if not (group_category = any(category_names)) or group_category = any(seen_categories) then
        raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
      end if;
      seen_categories := array_append(seen_categories, group_category);
      group_keywords := '[]'::jsonb;
      if jsonb_array_length(group_entry->'keywords') = 0
        or jsonb_array_length(group_entry->'keywords') > 200 then
        raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
      end if;
      for group_keyword in select * from jsonb_array_elements(group_entry->'keywords') loop
        if jsonb_typeof(group_keyword) <> 'string' then
          raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
        end if;
        group_value := lower(btrim(group_keyword#>>'{}'));
        if length(group_value) not between 1 and 254 or group_value ~ '[[:cntrl:]]' then
          raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
        end if;
        if not (group_keywords ? group_value) then
          group_keywords := group_keywords || jsonb_build_array(group_value);
        end if;
      end loop;
      normalized := jsonb_set(
        normalized,
        '{keywordGroups}',
        (normalized->'keywordGroups') || jsonb_build_array(
          jsonb_build_object('category',group_category,'keywords',group_keywords)
        )
      );
    end loop;

    normalized := jsonb_set(normalized,'{keywords}',normalized->'customKeywords');
    for group_entry in select * from jsonb_array_elements(normalized->'keywordGroups') loop
      for group_keyword in select * from jsonb_array_elements(group_entry->'keywords') loop
        group_value := group_keyword#>>'{}';
        if not (normalized->'keywords' ? group_value) then
          normalized := jsonb_set(
            normalized,
            '{keywords}',
            (normalized->'keywords') || jsonb_build_array(group_value)
          );
        end if;
      end loop;
    end loop;
    if jsonb_array_length(normalized->'keywords') > 200 then
      raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
    end if;
    result := result || jsonb_build_object(g,normalized);
  end loop;
  return result;
end; $$;

update public.scan_settings set rules=private.normalize_scan_rules(rules);
alter table public.scan_settings alter column rules set default
  '{"allow":{"labels":[],"senders":[],"domains":[],"subjectKeywords":[],"keywords":[],"customKeywords":[],"keywordGroups":[]},"block":{"labels":[],"senders":[],"domains":[],"subjectKeywords":[],"keywords":[],"customKeywords":[],"keywordGroups":[]}}'::jsonb;

create or replace function private.scan_settings_get() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); settings public.scan_settings;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into settings from public.scan_settings where user_id=uid;
  if settings.user_id is null then
    return jsonb_build_object('revision',0,'consent',false,'consent_at',null,'disclosure_version',null,'paused',true,
      'rules','{"allow":{"labels":[],"senders":[],"domains":[],"subjectKeywords":[],"keywords":[],"customKeywords":[],"keywordGroups":[]},"block":{"labels":[],"senders":[],"domains":[],"subjectKeywords":[],"keywords":[],"customKeywords":[],"keywordGroups":[]}}'::jsonb,
      'context_limits','{"maxMessages":0,"maxAgeDays":30,"maxMessageChars":12000,"maxTotalChars":24000}'::jsonb);
  end if;
  return to_jsonb(settings)-'user_id';
end; $$;

alter table public.scan_settings add constraint scan_settings_rules_check
  check(rules=private.normalize_scan_rules(rules));
