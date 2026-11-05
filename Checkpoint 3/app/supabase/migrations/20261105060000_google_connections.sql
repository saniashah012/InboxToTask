-- Google credentials are never exposed through the Data API. Encryption occurs
-- in Edge Functions; the keyring is managed separately from this database.
create table private.google_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'disconnected' check (state in ('disconnected','connected','reconnect_required','disconnecting')),
  generation bigint not null default 0,
  subject text,
  email text,
  scopes jsonb not null default '[]' check (jsonb_typeof(scopes)='array'),
  credentials text check (length(credentials) <= 24000),
  expires_at timestamptz,
  refresh_lease uuid,
  refresh_until timestamptz,
  retry_after timestamptz,
  last_started_at timestamptz,
  updated_at timestamptz not null default now()
);
create table private.google_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references private.google_connections(user_id) on delete cascade,
  generation bigint not null,
  expected_email text not null,
  verifier text not null check (length(verifier) <= 2000),
  expires_at timestamptz not null default (now()+interval '10 minutes')
);
alter table private.google_connections enable row level security;
alter table private.google_oauth_states enable row level security;
revoke all on private.google_connections, private.google_oauth_states from public,anon,authenticated,service_role;

-- The authenticated interface returns only safe metadata, never ciphertext.
create function public.google_connection_status() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce((select jsonb_build_object('state',c.state,'email',c.email,
    'scopes',c.scopes,'expiresAt',c.expires_at,'scanningEnabled',false)
    from private.google_connections c where c.user_id=auth.uid()),
    jsonb_build_object('state','disconnected','scanningEnabled',false));
$$;
revoke all on function public.google_connection_status() from public,anon;
grant execute on function public.google_connection_status() to authenticated;

-- Service-only state machine. Every change is serialized per account. NULL
-- generation/lease inputs must fail closed, including stale callback results.
create function public.google_connection_service(p_user uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.google_connections; s private.google_oauth_states; uid uuid:=p_user; lease uuid;
begin
  if p_action='consume' then
    select * into s from private.google_oauth_states where state_hash=p_data->>'hash';
    if s.user_id is null then return jsonb_build_object('state','invalid_state'); end if;
    uid:=s.user_id;
  end if;
  if uid is null then raise exception 'INVALID_GOOGLE_REQUEST' using errcode='22023'; end if;
  if p_action='start' then
    insert into private.google_connections(user_id) values(uid) on conflict do nothing;
  end if;
  select * into c from private.google_connections where user_id=uid for update;
  if c.user_id is null then return jsonb_build_object('state','disconnected'); end if;
  if p_action='start' then
    if c.state='disconnecting' then return jsonb_build_object('state','disconnecting'); end if;
    if c.last_started_at > now()-interval '30 seconds' then return jsonb_build_object('state','busy'); end if;
    if p_data->>'hash' is null or p_data->>'hash' !~ '^[0-9a-f]{64}$'
      or nullif(p_data->>'verifier','') is null or nullif(p_data->>'email','') is null then
      raise exception 'INVALID_GOOGLE_REQUEST' using errcode='22023'; end if;
    update private.google_connections set generation=generation+1,last_started_at=now(),
      refresh_lease=null,refresh_until=null,updated_at=now() where user_id=uid returning * into c;
    delete from private.google_oauth_states where user_id=uid;
    insert into private.google_oauth_states(state_hash,user_id,generation,expected_email,verifier)
      values(p_data->>'hash',uid,c.generation,p_data->>'email',p_data->>'verifier');
    return jsonb_build_object('state','started');
  elsif p_action='consume' then
    delete from private.google_oauth_states where state_hash=p_data->>'hash' returning * into s;
    if s.user_id is null or s.expires_at<=now() or s.generation is distinct from c.generation
      or c.state='disconnecting' then return jsonb_build_object('state','invalid_state'); end if;
    return jsonb_build_object('state','consumed','userId',uid,'generation',s.generation,
      'email',s.expected_email,'verifier',s.verifier,'subject',c.subject);
  elsif p_action='finish' then
    if (p_data->>'generation')::bigint is distinct from c.generation or c.state='disconnecting' then
      return jsonb_build_object('state','stale'); end if;
    -- The account email may have changed while Google consent was open.
    if not exists(select 1 from auth.users where id=uid and lower(email)=lower(p_data->>'email'))
      or (c.subject is not null and c.subject is distinct from p_data->>'subject')
      or nullif(p_data->>'subject','') is null or nullif(p_data->>'credentials','') is null
      or jsonb_typeof(p_data->'scopes') is distinct from 'array'
      or not (p_data->'scopes' ? 'https://www.googleapis.com/auth/gmail.readonly')
      or (p_data->>'expiresAt')::timestamptz is null then
      return jsonb_build_object('state','account_mismatch'); end if;
    update private.google_connections set state='connected',subject=p_data->>'subject',email=p_data->>'email',
      scopes=p_data->'scopes',credentials=p_data->>'credentials',expires_at=(p_data->>'expiresAt')::timestamptz,
      refresh_lease=null,refresh_until=null,retry_after=null,updated_at=now() where user_id=uid;
    return jsonb_build_object('state','connected');
  elsif p_action='refresh_claim' then
    if c.state<>'connected' then return jsonb_build_object('state',c.state); end if;
    if c.retry_after>now() or c.refresh_until>now() then return jsonb_build_object('state','busy'); end if;
    if c.expires_at>now()+interval '60 seconds' then
      return jsonb_build_object('state','ready','generation',c.generation,'credentials',c.credentials); end if;
    lease:=gen_random_uuid();
    update private.google_connections set refresh_lease=lease,refresh_until=now()+interval '45 seconds' where user_id=uid;
    return jsonb_build_object('state','refresh','generation',c.generation,'lease',lease,'credentials',c.credentials);
  elsif p_action in ('refresh_finish','refresh_fail') then
    if c.state<>'connected' or (p_data->>'generation')::bigint is distinct from c.generation
      or (p_data->>'lease')::uuid is distinct from c.refresh_lease or c.refresh_lease is null
      or c.refresh_until<=now() then return jsonb_build_object('state','stale'); end if;
    if p_action='refresh_finish' then
      if nullif(p_data->>'credentials','') is null or (p_data->>'expiresAt')::timestamptz is null then
        raise exception 'INVALID_GOOGLE_REQUEST' using errcode='22023'; end if;
      update private.google_connections set credentials=p_data->>'credentials',expires_at=(p_data->>'expiresAt')::timestamptz,
        refresh_lease=null,refresh_until=null,retry_after=null,updated_at=now() where user_id=uid;
      return jsonb_build_object('state','ready');
    end if;
    update private.google_connections set state=case when p_data->>'reason'='revoked' then 'reconnect_required' else state end,
      refresh_lease=null,refresh_until=null,retry_after=now()+interval '60 seconds',updated_at=now() where user_id=uid;
    return jsonb_build_object('state',case when p_data->>'reason'='revoked' then 'reconnect_required' else 'retry_later' end);
  elsif p_action='disconnect' then
    -- Fence callbacks/refreshes immediately. Retain encrypted credentials only
    -- until provider revocation succeeds, so failed revocation can be retried.
    update private.google_connections set generation=generation+1,state='disconnecting',
      refresh_lease=null,refresh_until=null,updated_at=now() where user_id=uid returning * into c;
    delete from private.google_oauth_states where user_id=uid;
    return jsonb_build_object('state','disconnecting','generation',c.generation,'credentials',c.credentials);
  elsif p_action='disconnect_finish' then
    if c.state<>'disconnecting' or (p_data->>'generation')::bigint is distinct from c.generation then
      return jsonb_build_object('state','stale'); end if;
    update private.google_connections set state='disconnected',credentials=null,subject=null,email=null,scopes='[]',
      expires_at=null,retry_after=null,updated_at=now() where user_id=uid;
    return jsonb_build_object('state','disconnected');
  end if;
  raise exception 'INVALID_GOOGLE_ACTION' using errcode='22023';
end;
$$;
revoke all on function public.google_connection_service(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.google_connection_service(uuid,text,jsonb) to service_role;
