-- Additive storage contract. OAuth credentials intentionally belong elsewhere.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.storage_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  generation bigint not null default 1,
  -- Controlled fictional-input trial limits, not production consent defaults.
  daily_requests integer not null default 20 check (daily_requests between 1 and 100),
  daily_tokens integer not null default 200000 check (daily_tokens between 1000 and 1000000),
  updated_at timestamptz not null default now()
);
create table public.storage_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  namespace text not null check (namespace in ('fixture', 'gmail')),
  connection_key text not null check (length(connection_key) between 1 and 200),
  message_id text not null check (length(message_id) between 1 and 200),
  thread_id text not null check (length(thread_id) between 1 and 200),
  subject text check (length(subject) <= 500),
  sender text check (length(sender) <= 500),
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(user_id,id), unique(user_id,namespace,connection_key,message_id)
);
create table public.storage_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null,
  extraction_key text not null check (extraction_key ~ '^[0-9a-f]{64}$'),
  config_key text not null check (config_key ~ '^[0-9a-f]{64}$'),
  version text not null,
  model text not null,
  returned_model text,
  analysis_time timestamptz not null,
  category text not null check (category in ('Actionable','Passive')),
  classification_confidence integer not null check (classification_confidence between 0 and 100),
  summary text check (length(summary) <= 500),
  needs_review boolean not null,
  warnings jsonb not null check (jsonb_typeof(warnings) = 'array'),
  created_at timestamptz not null default now(),
  digest_expires_at timestamptz not null default (now()+interval '30 days'),
  unique(user_id,id), unique(user_id,extraction_key),
  foreign key(user_id,source_id) references public.storage_sources(user_id,id) on delete cascade
);
create table public.storage_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  extraction_id uuid not null,
  message_id text not null,
  quote text check (length(quote) between 1 and 600),
  expires_at timestamptz not null default (now()+interval '30 days'),
  unique(user_id,id), unique(user_id,extraction_id,id),
  foreign key(user_id,extraction_id) references public.storage_extractions(user_id,id) on delete cascade
);

-- Validate accepted edits in SQL as well as validating model output in JS.
create function private.valid_task_fields(doc jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare d jsonb; k text;
begin
  if doc is null or jsonb_typeof(doc) <> 'object' or (select count(*) from jsonb_object_keys(doc)) <> 4
    or not (doc ?& array['action','requirements','condition','deadline'])
    or jsonb_typeof(doc->'action') <> 'string' or length(doc->>'action') not between 1 and 350
    or jsonb_typeof(doc->'requirements') <> 'array' or jsonb_array_length(doc->'requirements') > 12
    or exists(select 1 from jsonb_array_elements(doc->'requirements') v where jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 250)
    or not (doc->'condition' = 'null'::jsonb or (jsonb_typeof(doc->'condition')='string' and length(doc->>'condition') between 1 and 350)) then return false; end if;
  d := doc->'deadline';
  if d = 'null'::jsonb then return true; end if;
  if jsonb_typeof(d)<>'object' or (select count(*) from jsonb_object_keys(d))<>5
    or not(d ?& array['date','time','timeZone','wording','boundary'])
    or (d->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(d->'date')<>'string'
    or to_char((d->>'date')::date,'YYYY-MM-DD') <> d->>'date'
    or not(d->'time'='null'::jsonb or (jsonb_typeof(d->'time')='string' and (d->>'time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
    or jsonb_typeof(d->'timeZone')<>'string' or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=d->>'timeZone')
    or jsonb_typeof(d->'wording')<>'string' or length(d->>'wording') not between 1 and 250
    or d->>'boundary' not in ('by','before','on','unspecified') then return false; end if;
  return true;
exception when others then return false;
end; $$;

create table public.storage_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  extraction_id uuid not null,
  item_index integer not null check (item_index >= 0),
  fields jsonb not null check (private.valid_task_fields(fields)),
  review_fields jsonb check (review_fields is null or private.valid_task_fields(review_fields)),
  evidence_id uuid not null,
  state text not null default 'pending' check (state in ('pending','approved','dismissed','rejected','deleted')),
  revision bigint not null default 0,
  target_task_id uuid,
  expected_task_revision bigint,
  approved_task_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 days'),
  unique(user_id,id), unique(extraction_id,item_index),
  foreign key(user_id,extraction_id) references public.storage_extractions(user_id,id) on delete cascade,
  foreign key(user_id,extraction_id,evidence_id) references public.storage_evidence(user_id,extraction_id,id),
  check ((target_task_id is null) = (expected_task_revision is null))
);

-- Leave legacy fields and rows intact. Normalized accepted fields are populated
-- only by an explicit user approval/edit; no backfill invents missing deadlines.
alter table public.tasks add constraint tasks_user_id_id_key unique(user_id,id);
alter table public.tasks add column accepted_fields jsonb check (accepted_fields is null or private.valid_task_fields(accepted_fields));
alter table public.tasks add column revision bigint not null default 0;
alter table public.tasks add column completed_at timestamptz;
alter table public.tasks add column delete_after timestamptz;
alter table public.tasks add column deleted_at timestamptz;
alter table public.tasks add column origin_suggestion_id uuid unique;
alter table public.tasks add constraint tasks_origin_owner_fk foreign key(user_id,origin_suggestion_id) references public.storage_suggestions(user_id,id) deferrable initially deferred;
alter table public.storage_suggestions add constraint suggestion_target_owner_fk foreign key(user_id,target_task_id) references public.tasks(user_id,id) deferrable initially deferred;
alter table public.storage_suggestions add constraint suggestion_approved_owner_fk foreign key(user_id,approved_task_id) references public.tasks(user_id,id) deferrable initially deferred;
create table public.storage_task_sources (
  user_id uuid not null,
  task_id uuid not null,
  suggestion_id uuid not null,
  primary key(task_id,suggestion_id),
  foreign key(user_id,task_id) references public.tasks(user_id,id) on delete cascade,
  foreign key(user_id,suggestion_id) references public.storage_suggestions(user_id,id)
);
create table public.storage_waiting_for (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  extraction_id uuid not null,
  item_index integer not null,
  action text not null,
  external_owner text not null,
  promised_deadline jsonb,
  evidence_id uuid not null,
  resolved boolean not null default false,
  revision bigint not null default 0,
  expires_at timestamptz not null default (now()+interval '30 days'),
  unique(user_id,id), unique(extraction_id,item_index),
  foreign key(user_id,extraction_id) references public.storage_extractions(user_id,id) on delete cascade,
  foreign key(user_id,extraction_id,evidence_id) references public.storage_evidence(user_id,extraction_id,id)
);
create table public.storage_followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  waiting_for_id uuid not null,
  action text not null,
  recipient text not null,
  rationale text not null,
  evidence_id uuid not null,
  confirmed_reminder_at timestamptz,
  revision bigint not null default 0,
  unique(user_id,id),
  foreign key(user_id,waiting_for_id) references public.storage_waiting_for(user_id,id) on delete cascade,
  foreign key(user_id,evidence_id) references public.storage_evidence(user_id,id)
);
create table private.storage_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null,
  extraction_key text not null,
  config_key text not null,
  owner_email text not null,
  generation bigint not null,
  state text not null check (state in ('processing','succeeded','failed','cancelled')),
  attempts integer not null default 1,
  lease_token uuid not null default gen_random_uuid(),
  lease_until timestamptz not null default (now()+interval '90 seconds'),
  retry_after timestamptz,
  reserved_tokens integer not null,
  usage_day date not null default ((now() at time zone 'UTC')::date),
  safe_error text,
  updated_at timestamptz not null default now(),
  unique(user_id,extraction_key),
  foreign key(user_id,source_id) references public.storage_sources(user_id,id) on delete cascade
);
create table private.storage_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  requests integer not null default 0,
  charged_or_reserved_tokens bigint not null default 0,
  primary key(user_id,usage_day)
);
create table private.storage_attempts (
  job_id uuid not null references private.storage_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt integer not null,
  lease_token uuid not null,
  usage_day date not null,
  reserved_tokens integer not null,
  reported_tokens bigint,
  state text not null default 'processing' check(state in ('processing','succeeded','failed','unknown')),
  safe_error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key(job_id,attempt)
);
create table private.storage_provider_limits (
  model text primary key,
  requests_per_minute integer not null default 3 check(requests_per_minute between 1 and 1000)
);
create table private.storage_provider_usage (
  model text not null references private.storage_provider_limits(model),
  window_start timestamptz not null,
  requests integer not null default 0,
  primary key(model,window_start)
);
revoke all on private.storage_provider_limits,private.storage_provider_usage from public,anon,authenticated;
grant select,insert,update,delete on private.storage_provider_limits,private.storage_provider_usage to service_role;
alter table private.storage_provider_limits enable row level security;
alter table private.storage_provider_usage enable row level security;
create table private.storage_suppressions (
  user_id uuid not null references auth.users(id) on delete cascade,
  extraction_key text not null,
  created_at timestamptz not null default now(),
  primary key(user_id,extraction_key)
);
create table private.storage_source_suppressions (
  user_id uuid not null,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(user_id,source_id),
  foreign key(user_id,source_id) references public.storage_sources(user_id,id) on delete cascade
);
create table public.storage_calendar_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  task_id uuid,
  operation_key uuid not null unique,
  task_revision bigint not null,
  revision bigint not null default 0,
  preview jsonb not null,
  approved_at timestamptz,
  state text not null default 'pending' check(state in ('pending','approved','executing','succeeded','failed','unknown','undone')),
  provider_event_id text,
  unique(user_id,id),
  foreign key(user_id,task_id) references public.tasks(user_id,id) on delete set null (task_id)
);

-- Browser writes go through revision-checked transactions instead of arbitrary
-- table updates. Revoking table privileges alone does not revoke column grants.
revoke insert(user_id,title,description,due_at), update(title,description,due_at,status) on public.tasks from authenticated;
revoke insert,update,delete on public.tasks from authenticated;
drop policy "Users can read own tasks" on public.tasks;
create policy "Users can read own tasks" on public.tasks for select to authenticated
  using ((select auth.uid())=user_id and deleted_at is null);

do $$ declare t text; begin
  foreach t in array array['storage_preferences','storage_sources','storage_extractions','storage_evidence',
    'storage_suggestions','storage_task_sources','storage_waiting_for','storage_followups','storage_calendar_operations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
  end loop;
end; $$;
drop policy owner_read on public.storage_evidence;
create policy owner_read on public.storage_evidence for select to authenticated
  using ((select auth.uid())=user_id and expires_at > now() and quote is not null);
drop policy owner_read on public.storage_sources;
create policy owner_read on public.storage_sources for select to authenticated
  using ((select auth.uid())=user_id and deleted_at is null);
drop policy owner_read on public.storage_extractions;
create policy owner_read on public.storage_extractions for select to authenticated using (
  (select auth.uid())=user_id and exists(select 1 from public.storage_sources src where src.id=source_id and src.user_id=storage_extractions.user_id and src.deleted_at is null));
drop policy owner_read on public.storage_suggestions;
create policy owner_read on public.storage_suggestions for select to authenticated using (
  (select auth.uid())=user_id and state<>'deleted' and exists(select 1 from public.storage_extractions e where e.id=extraction_id and e.user_id=storage_suggestions.user_id));
do $$ declare t text; begin
  foreach t in array array['storage_jobs','storage_usage','storage_suppressions','storage_source_suppressions','storage_attempts'] loop
    execute format('alter table private.%I enable row level security',t);
    execute format('revoke all on private.%I from public, anon, authenticated',t);
    execute format('grant select,insert,update,delete on private.%I to service_role',t);
  end loop;
end; $$;
create index storage_suggestions_owner_state on public.storage_suggestions(user_id,state,created_at);
create unique index storage_update_identity on public.storage_suggestions(user_id,target_task_id,extraction_id,expected_task_revision) where target_task_id is not null;
create index storage_extractions_owner_created on public.storage_extractions(user_id,created_at);
create index storage_evidence_expiry on public.storage_evidence(expires_at) where quote is not null;
create index storage_jobs_ready on private.storage_jobs(state,retry_after,lease_until);
create index tasks_retention on public.tasks(delete_after) where delete_after is not null;
