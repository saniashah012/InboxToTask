-- Scan cooldown drops from 60 to 30 seconds. A batch that stops at a planned
-- per-batch limit (model calls, time, Gmail requests) saved its work and now
-- counts as successful, so "last successful" updates (known issue F6).
-- Same functions as 20261112000000 (gmail_scan_service, with its scan_sources_ready
-- source check) and 20261105223000 (gmail_scan_status) apart from those two changes.
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
   if (w.lease_until>now() and w.settings_revision=s.revision and w.storage_generation=g and w.connection_generation=c.generation) or w.last_started>now()-interval '30 seconds' then
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
     last_successful_at=case when p_data->'result'->>'executionMode'='GMAIL_PERSISTENT_MANUAL' and coalesce(p_data->'result'->>'error' in ('SCAN_INFERENCE_LIMIT','SCAN_TIME_LIMIT','SCAN_RETRIEVAL_LIMIT'),true) then now() else last_successful_at end where user_id=p_user;
   return jsonb_build_object('state','finished');
 end if;
 raise exception 'INVALID_SCAN_REQUEST' using errcode='22023';
end; $$;

create or replace function public.gmail_scan_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid();w private.gmail_scan_work;s public.scan_settings;c private.google_connections;g bigint;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 select * into w from private.gmail_scan_work where user_id=uid;
 select * into s from public.scan_settings where user_id=uid;
 select * into c from private.google_connections where user_id=uid;
 select generation into g from public.storage_preferences where user_id=uid;
 return jsonb_build_object('running',coalesce(w.lease_until>now() and w.settings_revision=s.revision and w.storage_generation=g and w.connection_generation=c.generation and s.consent and not s.paused and c.state='connected',false),
 'lastStarted',w.last_started,'lastFinished',w.last_finished_at,'lastSuccessful',w.last_successful_at,'result',w.last_result,
 'backlog',w.continuation is not null,'cooldownUntil',w.last_started+interval '30 seconds');
end; $$;
