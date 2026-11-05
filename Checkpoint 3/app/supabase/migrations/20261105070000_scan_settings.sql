-- Saved privacy settings are separate from legacy onboarding and fixture controls.
-- This migration enables no Gmail retrieval, inference, or schedules.
create function private.normalize_scan_rules(doc jsonb) returns jsonb
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
      or exists(select 1 from jsonb_object_keys(doc->g) k where k not in ('labels','senders','domains','subjectKeywords')) then
      raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
    end if;
    normalized := '{}';
    foreach f in array array['labels','senders','domains','subjectKeywords'] loop
      -- Compatibility: an absent new subject list is empty; supplied null is invalid.
      items := coalesce(doc->g->f, '[]');
      if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 200 then
        raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023';
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

create function private.valid_scan_context(doc jsonb) returns boolean
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
      or n > (case f when 'maxMessages' then 10 when 'maxAgeDays' then 90 when 'maxMessageChars' then 30000 else 60000 end) then return false; end if;
  end loop;
  return (doc->>'maxTotalChars')::integer >= (doc->>'maxMessageChars')::integer;
exception when others then return false;
end; $$;

create table public.scan_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check(revision>=0),
  consent boolean not null default false,
  consent_at timestamptz,
  disclosure_version text,
  paused boolean not null default true,
  rules jsonb not null default '{"allow":{"labels":[],"senders":[],"domains":[],"subjectKeywords":[]},"block":{"labels":[],"senders":[],"domains":[],"subjectKeywords":[]}}',
  -- Conservative default: no earlier-message context until the user selects it.
  context_limits jsonb not null default '{"maxMessages":0,"maxAgeDays":30,"maxMessageChars":12000,"maxTotalChars":24000}',
  updated_at timestamptz not null default now(),
  check (rules=private.normalize_scan_rules(rules)),
  check (private.valid_scan_context(context_limits)),
  check (consent=(consent_at is not null) and (not consent or disclosure_version='gmail-scan-v1'))
);
alter table public.scan_settings enable row level security;
revoke all on public.scan_settings from public,anon,authenticated,service_role;
grant select on public.scan_settings to authenticated;
create policy scan_settings_owner_read on public.scan_settings for select to authenticated using(user_id=auth.uid());

create function private.scan_settings_get() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); settings public.scan_settings;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into settings from public.scan_settings where user_id=uid;
  if settings.user_id is null then
    -- Apply table defaults without creating rows on a read.
    return jsonb_build_object('revision',0,'consent',false,'consent_at',null,'disclosure_version',null,'paused',true,
      'rules','{"allow":{"labels":[],"senders":[],"domains":[],"subjectKeywords":[]},"block":{"labels":[],"senders":[],"domains":[],"subjectKeywords":[]}}'::jsonb,
      'context_limits','{"maxMessages":0,"maxAgeDays":30,"maxMessageChars":12000,"maxTotalChars":24000}'::jsonb);
  end if;
  return to_jsonb(settings)-'user_id';
end; $$;

create function private.scan_settings_save(p_revision bigint,p_rules jsonb,p_context jsonb,p_consent boolean,p_paused boolean,p_disclosure text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); settings public.scan_settings; normalized jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_revision is null or p_revision<0 or p_consent is null or p_paused is null
    or not private.valid_scan_context(p_context)
    or (p_consent and p_disclosure is distinct from 'gmail-scan-v1') then
    raise exception 'INVALID_SCAN_SETTINGS' using errcode='22023'; end if;
  normalized := private.normalize_scan_rules(p_rules);
  -- Match the existing preference -> child lock order for finishes/deletion.
  insert into public.storage_preferences(user_id) values(uid) on conflict do nothing;
  perform 1 from public.storage_preferences where user_id=uid for update;
  insert into public.scan_settings(user_id) values(uid) on conflict do nothing;
  select * into settings from public.scan_settings where user_id=uid for update;
  if settings.revision<>p_revision then raise exception 'STALE_SCAN_SETTINGS' using errcode='PT409'; end if;
  update public.scan_settings set revision=revision+1,rules=normalized,context_limits=p_context,
    consent=p_consent,paused=p_paused,
    consent_at=case when p_consent then coalesce(consent_at,now()) else null end,
    disclosure_version=case when p_consent then p_disclosure else null end,updated_at=now() where user_id=uid;
  -- Fence all older storage work without changing accepted tasks or fixture enablement.
  update public.storage_preferences set generation=generation+1,updated_at=now() where user_id=uid;
  update private.storage_jobs set state='cancelled',updated_at=now() where user_id=uid and state='processing';
  update private.storage_attempts set state='unknown',finished_at=now() where user_id=uid and state='processing';
  return private.scan_settings_get();
end; $$;

create function public.scan_settings_get() returns jsonb language sql security invoker set search_path='' as $$ select private.scan_settings_get(); $$;
create function public.scan_settings_save(p_revision bigint,p_rules jsonb,p_context jsonb,p_consent boolean,p_paused boolean,p_disclosure text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.scan_settings_save(p_revision,p_rules,p_context,p_consent,p_paused,p_disclosure); $$;
revoke all on function private.normalize_scan_rules(jsonb),private.valid_scan_context(jsonb),private.scan_settings_get(),private.scan_settings_save(bigint,jsonb,jsonb,boolean,boolean,text),public.scan_settings_get(),public.scan_settings_save(bigint,jsonb,jsonb,boolean,boolean,text) from public,anon;
grant execute on function private.scan_settings_get(),private.scan_settings_save(bigint,jsonb,jsonb,boolean,boolean,text),public.scan_settings_get(),public.scan_settings_save(bigint,jsonb,jsonb,boolean,boolean,text) to authenticated;
