-- Additive Calendar contract, after PR #22 hardening and the separately owned
-- 20261106010000_gmail_manual_resolution.sql. Never rename the Gmail migration.
-- No provider calls, schedules, or feature enablement occur in this migration.
alter table private.google_oauth_states add column calendar boolean not null default false;
alter table private.google_connections add column oauth_callback_until timestamptz;
alter function public.google_connection_service(uuid,text,jsonb) rename to google_connection_service_base;
revoke all on function public.google_connection_service_base(uuid,text,jsonb) from public,anon,authenticated,service_role;

create function public.google_connection_service(p_user uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; pending private.google_oauth_states; c private.google_connections;
begin
 if p_action='oauth_release' then
  update private.google_connections set oauth_callback_until=null where user_id=p_user
   and generation=(p_data->>'generation')::bigint;
  return jsonb_build_object('state','released');
 end if;
 if p_action='refresh_claim' then
  select * into c from private.google_connections where user_id=p_user for update;
  if c.oauth_callback_until>now() then return jsonb_build_object('state','busy'); end if;
 end if;
 if p_action='refresh_claim' and p_data->>'requiredScope'='https://www.googleapis.com/auth/calendar.events.owned' then
  select * into c from private.google_connections where user_id=p_user for update;
  if c.state='connected' and not (c.scopes ? 'https://www.googleapis.com/auth/calendar.events.owned') then
   return jsonb_build_object('state','scope_required');
  end if;
 end if;
 if p_action='consume' then
  select * into pending from private.google_oauth_states where state_hash=p_data->>'hash';
  select * into c from private.google_connections where user_id=pending.user_id for update;
  -- Never snapshot an old refresh token while a rotating refresh is in flight.
  if c.refresh_lease is not null and c.refresh_until>now() then return jsonb_build_object('state','busy'); end if;
 end if;
 result:=public.google_connection_service_base(p_user,p_action,p_data);
 if p_action='start' and result->>'state'='started' then
  update private.google_connections set oauth_callback_until=null where user_id=p_user;
  update private.google_oauth_states set calendar=coalesce((p_data->>'calendar')::boolean,false) where user_id=p_user and state_hash=p_data->>'hash';
 elsif p_action='consume' and result->>'state'='consumed' then
  update private.google_connections set oauth_callback_until=now()+interval '45 seconds' where user_id=(result->>'userId')::uuid;
  select * into c from private.google_connections where user_id=(result->>'userId')::uuid;
  result:=result||jsonb_build_object('calendar',pending.calendar,'scopes',c.scopes,'credentials',c.credentials,'connectionState',c.state);
 elsif p_action='refresh_claim' and result->>'state' in ('ready','refresh') then
  select * into c from private.google_connections where user_id=p_user;
  result:=result||jsonb_build_object('scopes',c.scopes);
 elsif p_action='refresh_finish' and result->>'state'='ready' and jsonb_typeof(p_data->'scopes')='array' then
  -- An omitted scope list preserves grants. An explicit changed list must not
  -- leave Calendar marked usable when the refreshed token is Gmail-only.
  update private.google_connections set scopes=p_data->'scopes' where user_id=p_user;
 end if;
 return result;
end; $$;
revoke all on function public.google_connection_service(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.google_connection_service(uuid,text,jsonb) to service_role;

create table private.calendar_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid not null,
 subject text not null,
 task_revision bigint not null,
 draft jsonb not null,
 state text not null check(state in ('executing','unknown','failed','succeeded')),
 lease uuid,
 lease_until timestamptz,
 generation bigint not null,
 event_id text not null unique,
 event_url text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,task_id,subject),
 foreign key(user_id,task_id) references public.tasks(user_id,id) on delete cascade
);
alter table private.calendar_events enable row level security;
revoke all on private.calendar_events from public,anon,authenticated,service_role;

create function public.calendar_event_status(p_task uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('state',e.state,'eventUrl',e.event_url,'draft',e.draft)
  from private.calendar_events e join private.google_connections c on c.user_id=e.user_id and c.subject=e.subject
  where e.user_id=auth.uid() and e.task_id=p_task),'{}'::jsonb);
$$;
revoke all on function public.calendar_event_status(uuid) from public,anon;
grant execute on function public.calendar_event_status(uuid) to authenticated;

-- Only the verified Edge handler can claim/finish. No browser-selected owner,
-- calendar, event ID, provider payload or success receipt is accepted.
create function public.calendar_event_service(p_user uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.google_connections; t public.tasks; e private.calendar_events; token uuid;
begin
 select * into c from private.google_connections where user_id=p_user for update;
 if c.state is distinct from 'connected' or not (c.scopes ? 'https://www.googleapis.com/auth/calendar.events.owned') then
  raise exception 'GOOGLE_CALENDAR_SCOPE_REQUIRED' using errcode='P0001'; end if;
 select * into t from public.tasks where user_id=p_user and id=(p_data->>'taskId')::uuid for update;
 if t.id is null then raise exception 'TASK_NOT_FOUND' using errcode='42501'; end if;
 select * into e from private.calendar_events where user_id=p_user and task_id=t.id and subject=c.subject for update;
 if p_action='claim' then
  if e.state='succeeded' then return jsonb_build_object('state','succeeded','eventUrl',e.event_url); end if;
  if e.state='executing' and e.lease_until>now() then raise exception 'CALENDAR_BUSY' using errcode='PT409'; end if;
  if t.status<>'approved' or t.accepted_fields is null or t.cancelled_at is not null or t.deleted_at is not null
   or t.revision is distinct from (p_data->>'taskRevision')::bigint then raise exception 'STALE_CALENDAR_TASK' using errcode='PT409'; end if;
  if e.id is not null and e.state in ('executing','unknown') and e.draft is distinct from p_data->'draft' then
   raise exception 'CALENDAR_RETRY_ORIGINAL' using errcode='PT409'; end if;
  if jsonb_typeof(p_data->'draft') is distinct from 'object' or octet_length((p_data->'draft')::text)>4000 then
   raise exception 'INVALID_CALENDAR_DRAFT' using errcode='22023'; end if;
  token:=gen_random_uuid();
  if e.id is null then
   insert into private.calendar_events(user_id,task_id,subject,task_revision,draft,state,lease,lease_until,generation,event_id)
    values(p_user,t.id,c.subject,t.revision,p_data->'draft','executing',token,now()+interval '90 seconds',c.generation,
     'itt'||replace(gen_random_uuid()::text,'-','')) returning * into e;
  else
   update private.calendar_events set state='executing',lease=token,lease_until=now()+interval '90 seconds',generation=c.generation,
    task_revision=t.revision,draft=p_data->'draft',updated_at=now() where id=e.id returning * into e;
  end if;
  return jsonb_build_object('state','claimed','lease',token,'eventId',e.event_id,'draft',e.draft,'generation',c.generation);
 elsif p_action in ('assert','finish') then
  if e.id is null or e.state<>'executing' or e.lease is null or e.lease is distinct from (p_data->>'lease')::uuid
   or e.generation is distinct from c.generation or e.lease_until<=now() then raise exception 'STALE_CALENDAR_OPERATION' using errcode='PT409'; end if;
  if p_action='assert' then
   if t.status<>'approved' or t.deleted_at is not null or t.cancelled_at is not null or t.revision<>e.task_revision then
    raise exception 'STALE_CALENDAR_TASK' using errcode='PT409'; end if;
   return jsonb_build_object('state','ready');
  end if;
  if p_data->>'state' not in ('succeeded','failed','unknown') or p_data->>'state' is null then raise exception 'INVALID_CALENDAR_STATE'; end if;
  if p_data->>'state'='succeeded' and (p_data->>'eventUrl' is null or p_data->>'eventUrl' !~ '^https://(www\.)?google\.com/calendar/' or length(p_data->>'eventUrl')>2048) then
   raise exception 'INVALID_CALENDAR_URL'; end if;
  update private.calendar_events set state=p_data->>'state',event_url=case when p_data->>'state'='succeeded' then p_data->>'eventUrl' else null end,
   lease=null,lease_until=null,updated_at=now() where id=e.id;
  return jsonb_build_object('state',p_data->>'state','eventUrl',case when p_data->>'state'='succeeded' then p_data->>'eventUrl' else null end);
 end if;
 raise exception 'INVALID_CALENDAR_ACTION' using errcode='22023';
end; $$;
revoke all on function public.calendar_event_service(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.calendar_event_service(uuid,text,jsonb) to service_role;
