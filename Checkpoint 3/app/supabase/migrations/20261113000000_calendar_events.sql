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
 -- updating: an update of the saved event is in flight or its result was lost.
 -- removing: a removal is in flight or its result was lost. A confirmed removal
 -- deletes the row, so a later create gets a new row and a new event ID.
 state text not null check(state in ('executing','unknown','failed','succeeded','updating','removing')),
 lease uuid,
 lease_until timestamptz,
 generation bigint not null,
 event_id text not null unique,
 event_url text,
 -- The schedule an in-flight update is writing, and the marker written onto the
 -- Google event with it so a retry can tell that the earlier attempt landed.
 pending_draft jsonb,
 update_token uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,task_id,subject),
 foreign key(user_id,task_id) references public.tasks(user_id,id) on delete cascade
);
alter table private.calendar_events enable row level security;
revoke all on private.calendar_events from public,anon,authenticated,service_role;

-- Status reads use stored records only and never contact Google. An event stays
-- listed after Google is disconnected, because it still exists in the user's
-- calendar. While a Google account is connected, only that account's events are
-- listed, so connecting a different account hides the earlier account's events.
create function public.calendar_event_status(p_task uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('state',e.state,'eventUrl',e.event_url,'draft',e.draft)
  from private.calendar_events e left join private.google_connections c on c.user_id=e.user_id
  where e.user_id=auth.uid() and e.task_id=p_task and (c.subject is null or c.subject=e.subject)
  order by e.updated_at desc,e.id limit 1),'{}'::jsonb);
$$;
revoke all on function public.calendar_event_status(uuid) from public,anon;
grant execute on function public.calendar_event_status(uuid) to authenticated;

-- One read for every task card: the caller's own events, one per task. Tasks
-- without an event are absent. It does not need Calendar permission.
create function public.calendar_event_statuses() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('taskId',r.task_id,'state',r.state,'eventUrl',r.event_url,'draft',r.draft) order by r.created_at,r.id),'[]'::jsonb)
  from (select distinct on (e.task_id) e.* from private.calendar_events e left join private.google_connections c on c.user_id=e.user_id
   where e.user_id=auth.uid() and (c.subject is null or c.subject=e.subject)
   order by e.task_id,e.updated_at desc,e.id) r;
$$;
revoke all on function public.calendar_event_statuses() from public,anon;
grant execute on function public.calendar_event_statuses() to authenticated;

-- Only the verified Edge handler can claim/finish. No browser-selected owner,
-- calendar, event ID, provider payload or success receipt is accepted.
-- Create and update need an open task. Read and remove also work on completed,
-- cancelled and deleted tasks, so an event can still be removed from Google.
create function public.calendar_event_service(p_user uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.google_connections; t public.tasks; e private.calendar_events; token uuid; marker uuid;
 open_task boolean; live boolean; held boolean; retried boolean; next_state text;
begin
 select * into c from private.google_connections where user_id=p_user for update;
 if c.state is distinct from 'connected' or not (c.scopes ? 'https://www.googleapis.com/auth/calendar.events.owned') then
  raise exception 'GOOGLE_CALENDAR_SCOPE_REQUIRED' using errcode='P0001'; end if;
 select * into t from public.tasks where user_id=p_user and id=(p_data->>'taskId')::uuid for update;
 if t.id is null then raise exception 'TASK_NOT_FOUND' using errcode='42501'; end if;
 select * into e from private.calendar_events where user_id=p_user and task_id=t.id and subject=c.subject for update;
 open_task:=t.status='approved' and t.accepted_fields is not null and t.cancelled_at is null and t.deleted_at is null;
 -- live: another request holds this event now. held: the caller's own lease is still valid.
 live:=coalesce(e.lease is not null and e.lease_until>now(),false);
 held:=coalesce(e.lease is not null and e.lease=(p_data->>'lease')::uuid and e.generation=c.generation and e.lease_until>now(),false);
 if p_action='claim' then
  if e.state='succeeded' then return jsonb_build_object('state','succeeded','eventUrl',e.event_url); end if;
  if e.state='executing' and e.lease_until>now() then raise exception 'CALENDAR_BUSY' using errcode='PT409'; end if;
  -- An update or removal that has not settled owns the event; never overwrite it with a create.
  if e.state in ('updating','removing') then raise exception 'CALENDAR_BUSY' using errcode='PT409'; end if;
  if not open_task or t.revision is distinct from (p_data->>'taskRevision')::bigint then raise exception 'STALE_CALENDAR_TASK' using errcode='PT409'; end if;
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
  if e.id is null or not held or e.state not in ('executing','updating') or (p_action='finish' and e.state<>'executing') then
   raise exception 'STALE_CALENDAR_OPERATION' using errcode='PT409'; end if;
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
 elsif p_action='read' then
  -- Stored details only, without a lease. The caller reads Google itself.
  if e.id is null then return jsonb_build_object('state','none'); end if;
  return jsonb_build_object('state',e.state,'eventId',e.event_id,'eventUrl',e.event_url,'draft',e.draft);
 elsif p_action='sync' then
  -- Save what Google shows now, so the task card matches. Skipped while another request holds the event.
  if e.id is null then return jsonb_build_object('state','none'); end if;
  if e.state<>'succeeded' or live then return jsonb_build_object('state',e.state); end if;
  if jsonb_typeof(p_data->'draft') is distinct from 'object' or octet_length((p_data->'draft')::text)>4000 then
   raise exception 'INVALID_CALENDAR_DRAFT' using errcode='22023'; end if;
  if p_data->>'eventUrl' is null or p_data->>'eventUrl' !~ '^https://(www\.)?google\.com/calendar/' or length(p_data->>'eventUrl')>2048 then
   raise exception 'INVALID_CALENDAR_URL'; end if;
  update private.calendar_events set draft=p_data->'draft',event_url=p_data->>'eventUrl',updated_at=now() where id=e.id;
  return jsonb_build_object('state','succeeded');
 elsif p_action='gone' then
  -- Google reports the event deleted. Forget it, so the task can be added again as a new event.
  if e.id is null then return jsonb_build_object('state','none'); end if;
  if e.state<>'succeeded' or live then return jsonb_build_object('state',e.state); end if;
  delete from private.calendar_events where id=e.id;
  return jsonb_build_object('state','removed');
 elsif p_action='remove_claim' then
  if e.id is null then raise exception 'CALENDAR_NOT_ADDED' using errcode='PT409'; end if;
  if live then raise exception 'CALENDAR_BUSY' using errcode='PT409'; end if;
  token:=gen_random_uuid();
  update private.calendar_events set state='removing',lease=token,lease_until=now()+interval '90 seconds',generation=c.generation,
   pending_draft=null,update_token=null,updated_at=now() where id=e.id returning * into e;
  return jsonb_build_object('state','claimed','lease',token,'eventId',e.event_id);
 elsif p_action='remove_finish' then
  if e.id is null or not held or e.state<>'removing' then raise exception 'STALE_CALENDAR_OPERATION' using errcode='PT409'; end if;
  if p_data->>'state'='removed' then
   delete from private.calendar_events where id=e.id;
   return jsonb_build_object('state','removed');
  elsif p_data->>'state'='refused' then
   -- Google definitely kept the event. Go back to what was known before the attempt.
   next_state:=case when e.event_url is not null then 'succeeded' else 'unknown' end;
  elsif p_data->>'state'='unknown' then
   next_state:='removing';
  else raise exception 'INVALID_CALENDAR_STATE'; end if;
  update private.calendar_events set state=next_state,lease=null,lease_until=null,updated_at=now() where id=e.id;
  return jsonb_build_object('state',next_state);
 elsif p_action='update_claim' then
  if e.id is null or e.state='failed' then raise exception 'CALENDAR_NOT_ADDED' using errcode='PT409'; end if;
  if live or e.state not in ('succeeded','updating') then raise exception 'CALENDAR_BUSY' using errcode='PT409'; end if;
  if not open_task then raise exception 'STALE_CALENDAR_TASK' using errcode='PT409'; end if;
  if jsonb_typeof(p_data->'draft') is distinct from 'object' or octet_length((p_data->'draft')::text)>4000 then
   raise exception 'INVALID_CALENDAR_DRAFT' using errcode='22023'; end if;
  -- A lost update keeps its approved values until a retry settles it.
  if e.state='updating' and e.pending_draft is distinct from p_data->'draft' then
   raise exception 'CALENDAR_RETRY_ORIGINAL' using errcode='PT409'; end if;
  token:=gen_random_uuid();
  retried:=e.state='updating' and e.update_token is not null;
  marker:=case when retried then e.update_token else gen_random_uuid() end;
  update private.calendar_events set state='updating',lease=token,lease_until=now()+interval '90 seconds',generation=c.generation,
   task_revision=t.revision,pending_draft=p_data->'draft',update_token=marker,updated_at=now() where id=e.id returning * into e;
  return jsonb_build_object('state','claimed','lease',token,'eventId',e.event_id,'draft',e.pending_draft,'updateToken',marker,'retry',retried);
 elsif p_action='update_finish' then
  if e.id is null or not held or e.state<>'updating' then raise exception 'STALE_CALENDAR_OPERATION' using errcode='PT409'; end if;
  if p_data->>'state'='succeeded' then
   if p_data->>'eventUrl' is null or p_data->>'eventUrl' !~ '^https://(www\.)?google\.com/calendar/' or length(p_data->>'eventUrl')>2048 then
    raise exception 'INVALID_CALENDAR_URL'; end if;
   update private.calendar_events set state='succeeded',draft=e.pending_draft,event_url=p_data->>'eventUrl',pending_draft=null,update_token=null,
    lease=null,lease_until=null,updated_at=now() where id=e.id returning * into e;
   return jsonb_build_object('state','succeeded','eventUrl',e.event_url,'draft',e.draft);
  elsif p_data->>'state' in ('failed','changed') then
   -- Google definitely did not apply it. The saved event stands as it was.
   update private.calendar_events set state='succeeded',pending_draft=null,update_token=null,lease=null,lease_until=null,updated_at=now() where id=e.id;
   return jsonb_build_object('state',p_data->>'state');
  elsif p_data->>'state'='unknown' then
   update private.calendar_events set lease=null,lease_until=null,updated_at=now() where id=e.id;
   return jsonb_build_object('state','updating');
  elsif p_data->>'state'='removed' then
   delete from private.calendar_events where id=e.id;
   return jsonb_build_object('state','removed');
  end if;
  raise exception 'INVALID_CALENDAR_STATE';
 end if;
 raise exception 'INVALID_CALENDAR_ACTION' using errcode='22023';
end; $$;
revoke all on function public.calendar_event_service(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.calendar_event_service(uuid,text,jsonb) to service_role;
