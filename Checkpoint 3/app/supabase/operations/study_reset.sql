-- Between-session reset for the two CP4 study accounts (issue #101).
--
-- Optional deployment operation, NOT a migration and NOT run by setup. A person runs
-- this whole file once in the hosted SQL Editor as `postgres`. Running it again is
-- safe: tables are created only if missing and functions are replaced, so existing
-- snapshots, account rows and the reset log are kept. Remove it after the study with
-- `drop schema study_reset cascade;`.
--
-- This file holds no user ids, addresses or credentials. `study_reset.accounts` is
-- filled by hand at the freeze, from the private study notes:
--
--   insert into study_reset.accounts(user_id,label,email) values
--     ('00000000-0000-4000-8000-000000000000','A','study-a@example.edu');
--
-- The functions never call Google. Calendar events and Gmail messages created in a
-- session are removed by hand before a reset (Checkpoint 4/docs/study_materials/reset.md).
--
-- Usage:
--   select study_reset.take_snapshot('A');                  -- once, right after the freeze
--   select study_reset.take_snapshot('A', p_replace => true); -- deliberate re-freeze only
--   select study_reset.reset('P01', 'A', true);             -- after every session
--   select * from study_reset.log order by id;
--
-- Participant codes: P00-P99, PILOT, or a rehearsal code R0-R9. Nothing else is
-- accepted, so the log cannot hold a name.
--
-- reset() returns {ok, counts, digest} and never raises: a refusal or failure rolls
-- back every data change, writes a `failed` row to study_reset.log and returns
-- {ok:false, error}. take_snapshot() raises on refusal and changes nothing.
--
-- Another account's concurrent activity while a reset runs can make the
-- other-accounts check fail; that failure changes nothing and the reset can be run
-- again.
--
-- TABLE INVENTORY (built from the migrations; restore = deleted for the account and
-- put back from the snapshot, delete = deleted and not put back, leave = never written)
--   restore  public.storage_preferences          20261104060000_storage_schema.sql:6
--   restore  public.scan_settings                20261105070000_scan_settings.sql:65 (+20261105200000:3-5, 20261112002000:9)
--   restore  public.user_onboarding_preferences  20261104100000_user_onboarding_preferences.sql:1
--   restore  public.storage_sources              20261104060000_storage_schema.sql:15 (+20261105220000:4)
--   restore  public.storage_extractions          20261104060000_storage_schema.sql:29 (+20261105220000:6)
--   restore  public.storage_evidence             20261104060000_storage_schema.sql:49
--   restore  public.storage_suggestions          20261104060000_storage_schema.sql:86
--   restore  public.tasks                        20261104050000_tasks_foundation.sql:4 (+20261104060000:109-118, 20261105220000:7)
--   restore  public.storage_task_sources         20261104060000_storage_schema.sql:119
--   restore  public.storage_waiting_for          20261104060000_storage_schema.sql:127
--   restore  public.storage_followups            20261104060000_storage_schema.sql:143
--   restore  public.storage_calendar_operations  20261104060000_storage_schema.sql:225
--   restore  public.gmail_task_changes           20261105220000_gmail_persistence.sql:9
--   restore  private.gmail_result_cache          20261105220000_gmail_persistence.sql:26
--   restore  private.storage_jobs                20261104060000_storage_schema.sql:157 (+20261105220000:5)
--   restore  private.storage_attempts            20261104060000_storage_schema.sql:184
--   restore  private.storage_usage               20261104060000_storage_schema.sql:177 (switch c_restore_usage in reset)
--   restore  private.storage_suppressions        20261104060000_storage_schema.sql:212
--   restore  private.storage_source_suppressions 20261104060000_storage_schema.sql:218
--   restore  private.gmail_scan_work             20261105210000_manual_gmail_retrieval.sql:2 (+20261105223000:2-3, 20261112010000:16)
--   delete   private.calendar_events             20261113000000_calendar_events.sql:55 (only with p_calendar_cleared)
--   leave    private.google_connections          20261105060000_google_connections.sql:3 (+20261113000000:5)
--   leave    private.google_oauth_states         20261105060000_google_connections.sql:18 (+20261113000000:4)
--   leave    private.storage_provider_limits     20261104060000_storage_schema.sql:198 (shared by all users)
--   leave    private.storage_provider_usage      20261104060000_storage_schema.sql:202 (shared by all users)
--   leave    auth.users
--
-- TRIGGERS on those tables, and why a plain delete-then-insert restores exact rows.
-- The restore only deletes and inserts; it never updates a restored row.
--   tasks.tasks_set_updated_at (BEFORE UPDATE, 20261104050100:36)          never fires
--   tasks.gmail_task_guard (BEFORE UPDATE, 20261106000000:169)             never fires
--   storage_sources.gmail_source_purge (BEFORE UPDATE, 20261106000000:190) never fires
--   user_onboarding_preferences..._set_updated_at (BEFORE UPDATE, 20261104100000:38) never fires
--   storage_calendar_operations.storage_calendar_replace_pending (BEFORE INSERT,
--     20261109000100:14) deletes the task's other pending previews; a no-op while the
--     snapshot holds at most one pending preview per task, as the trigger itself keeps it.
--   storage_calendar_operations.gmail_calendar_guard (BEFORE INSERT, 20261106000000:177)
--     refuses a preview for a cancelled task; a frozen preview whose task was cancelled
--     later could not be put back.
--   gmail_task_changes.gmail_change_no_repeat (BEFORE INSERT, 20261106010000:45) drops an
--     untargeted proposal when an approved one from the same source exists; untargeted
--     rows are inserted first, before any approved row exists, so it is a no-op.
-- take_snapshot() proves all of this for the actual frozen rows: it runs the whole
-- restore once and rolls it back, and refuses the freeze unless the result matches.
-- Every reset also compares a digest of the restored rows with the freeze digest, and
-- refuses to start if a table, column or trigger appeared that this file does not know.
-- No generated or identity columns exist on these tables (checked at run time), and no
-- trigger is disabled; session_replication_role is not used.

create schema if not exists study_reset;

create table if not exists study_reset.accounts (
  user_id uuid primary key,
  label text not null unique check (label in ('A','B')),
  email text not null
);

create table if not exists study_reset.snapshot (
  user_id uuid not null,
  tbl text not null,
  seq bigint not null,
  row_data jsonb not null,
  primary key (user_id, tbl, seq)
);

create table if not exists study_reset.freeze_digest (
  user_id uuid primary key,
  label text not null,
  digest text not null,
  digest_without_usage text not null,
  counts jsonb not null,
  schema_signature text not null,
  connection_subject_hash text not null,
  connection_generation bigint not null,
  taken_at timestamptz not null default now()
);

create table if not exists study_reset.log (
  id bigint generated always as identity primary key,
  participant text,
  label text,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  result text not null check (result in ('ok','failed')),
  error text,
  counts jsonb,
  digest text
);

-- The single list of tables. ord is the insert order (parents first); deletes run in
-- reverse. Foreign keys between tasks and storage_suggestions are deferrable
-- (20261104060000:116-118); every other foreign key is checked immediately.
create or replace function study_reset.inventory()
returns table (ord integer, tbl text, action text)
language sql immutable set search_path = '' as $$
  values
    (1,'public.storage_preferences','restore'),
    (2,'public.scan_settings','restore'),
    (3,'public.user_onboarding_preferences','restore'),
    (4,'public.storage_sources','restore'),
    (5,'public.storage_extractions','restore'),
    (6,'public.storage_evidence','restore'),
    (7,'public.storage_suggestions','restore'),
    (8,'public.tasks','restore'),
    (9,'public.storage_task_sources','restore'),
    (10,'public.storage_waiting_for','restore'),
    (11,'public.storage_followups','restore'),
    (12,'public.storage_calendar_operations','restore'),
    (13,'public.gmail_task_changes','restore'),
    (14,'private.gmail_result_cache','restore'),
    (15,'private.storage_jobs','restore'),
    (16,'private.storage_attempts','restore'),
    (17,'private.storage_usage','restore'),
    (18,'private.storage_suppressions','restore'),
    (19,'private.storage_source_suppressions','restore'),
    (20,'private.gmail_scan_work','restore'),
    (21,'private.calendar_events','delete'),
    (30,'private.google_connections','leave'),
    (31,'private.google_oauth_states','leave'),
    (32,'private.storage_provider_limits','leave'),
    (33,'private.storage_provider_usage','leave')
$$;

-- Triggers this file was written against (see the header).
create or replace function study_reset.known_triggers()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'public.tasks.tasks_set_updated_at',
    'public.tasks.gmail_task_guard',
    'public.storage_sources.gmail_source_purge',
    'public.user_onboarding_preferences.user_onboarding_preferences_set_updated_at',
    'public.storage_calendar_operations.storage_calendar_replace_pending',
    'public.storage_calendar_operations.gmail_calendar_guard',
    'public.gmail_task_changes.gmail_change_no_repeat'
  ]
$$;

-- Primary-key column list, qualified with p_alias, for deterministic ordering.
create or replace function study_reset.pk_order(p_tbl text, p_alias text)
returns text language sql stable set search_path = '' as $$
  select string_agg(format('%s.%I', p_alias, a.attname), ', ' order by k.n)
  from pg_catalog.pg_index i
  cross join lateral unnest(i.indkey::int2[]) with ordinality as k(attnum, n)
  join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = to_regclass(p_tbl) and i.indisprimary
$$;

-- Column names and types of every restored table. A change after the freeze means the
-- snapshot no longer fits the tables.
create or replace function study_reset.schema_signature()
returns text language sql stable set search_path = '' as $$
  select md5(string_agg(format('%s.%s:%s', i.tbl, a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod)),
    ';' order by i.ord, a.attnum))
  from study_reset.inventory() i
  join pg_catalog.pg_attribute a on a.attrelid = to_regclass(i.tbl) and a.attnum > 0 and not a.attisdropped
  where i.action = 'restore'
$$;

-- Refuses to run when the schema has drifted from what this file was written for.
create or replace function study_reset.check_schema()
returns void language plpgsql stable set search_path = '' as $$
declare v_bad text;
begin
  select string_agg(i.tbl, ', ') into v_bad from study_reset.inventory() i where to_regclass(i.tbl) is null;
  if v_bad is not null then
    raise exception 'STUDY_RESET_SCHEMA_CHANGED: missing table %', v_bad;
  end if;
  select string_agg(i.tbl, ', ') into v_bad from study_reset.inventory() i
  where i.action in ('restore','delete') and (
    not exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = to_regclass(i.tbl)
      and a.attname = 'user_id' and not a.attisdropped)
    or study_reset.pk_order(i.tbl, 'x') is null
    or exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = to_regclass(i.tbl)
      and a.attnum > 0 and not a.attisdropped and (a.attgenerated <> '' or a.attidentity <> ''))
    or exists (select 1 from pg_catalog.pg_rewrite r where r.ev_class = to_regclass(i.tbl) and r.rulename <> '_RETURN'));
  if v_bad is not null then
    raise exception 'STUDY_RESET_SCHEMA_CHANGED: unsupported table shape in %', v_bad;
  end if;
  -- Any other table that holds per-user rows, or points at a restored table, would be
  -- left out of the reset. Refuse rather than leave it behind.
  select string_agg(format('%s.%s', n.nspname, c.relname), ', ') into v_bad
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public','private') and c.relkind in ('r','p')
    and format('%s.%s', n.nspname, c.relname) not in (select i.tbl from study_reset.inventory() i)
    and (exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped)
      or exists (select 1 from pg_catalog.pg_constraint k where k.conrelid = c.oid and k.contype = 'f'
        and k.confrelid in (select to_regclass(i.tbl) from study_reset.inventory() i where i.action in ('restore','delete'))));
  if v_bad is not null then
    raise exception 'STUDY_RESET_SCHEMA_CHANGED: table not covered by the reset: %', v_bad;
  end if;
  select string_agg(format('%s.%s', i.tbl, t.tgname), ', ') into v_bad
  from study_reset.inventory() i join pg_catalog.pg_trigger t on t.tgrelid = to_regclass(i.tbl)
  where i.action in ('restore','delete') and not t.tgisinternal
    and format('%s.%s', i.tbl, t.tgname) <> all (study_reset.known_triggers());
  if v_bad is not null then
    raise exception 'STUDY_RESET_SCHEMA_CHANGED: unknown trigger %', v_bad;
  end if;
end $$;

-- How a mirrored counter relates to the counter it mirrors.
create or replace function study_reset.relation(p_value jsonb, p_current bigint)
returns text language sql immutable set search_path = '' as $$
  select case when p_value is null or jsonb_typeof(p_value) = 'null' then 'none'
    when (p_value #>> '{}')::bigint = p_current then 'current' else 'stale' end
$$;

-- A row as the digest sees it. The counters that a reset moves forward are removed;
-- their copies in gmail_scan_work are replaced by how they relate to the account's
-- current counters, which is what the scan code compares.
create or replace function study_reset.normalize(p_tbl text, p_row jsonb, p_generation bigint, p_revision bigint)
returns jsonb language sql immutable set search_path = '' as $$
  select case p_tbl
    when 'public.storage_preferences' then p_row - 'generation'
    when 'public.scan_settings' then p_row - 'revision'
    when 'private.gmail_scan_work' then
      (p_row - array['settings_revision','storage_generation','last_complete_revision','last_complete_storage_generation'])
      || jsonb_build_object(
        'settings_revision', study_reset.relation(p_row -> 'settings_revision', p_revision),
        'storage_generation', study_reset.relation(p_row -> 'storage_generation', p_generation),
        'last_complete_revision', study_reset.relation(p_row -> 'last_complete_revision', p_revision),
        'last_complete_storage_generation', study_reset.relation(p_row -> 'last_complete_storage_generation', p_generation))
    else p_row end
$$;

-- Deterministic digest of every restored table's rows for one user, in primary-key
-- order. p_with_usage => false leaves out private.storage_usage (see c_restore_usage).
create or replace function study_reset.digest(p_user uuid, p_with_usage boolean default true)
returns text language plpgsql stable set search_path = '' as $$
declare r record; v_part text; v_parts text := ''; v_generation bigint; v_revision bigint;
begin
  select p.generation into v_generation from public.storage_preferences p where p.user_id = p_user;
  select s.revision into v_revision from public.scan_settings s where s.user_id = p_user;
  for r in select i.tbl from study_reset.inventory() i
    where i.action = 'restore' and (p_with_usage or i.tbl <> 'private.storage_usage') order by i.ord loop
    execute format('select md5(coalesce(string_agg(study_reset.normalize(%L, to_jsonb(x), $2, $3)::text, chr(10) order by %s), %L)) from %s x where x.user_id = $1',
      r.tbl, study_reset.pk_order(r.tbl, 'x'), '', r.tbl)
      into v_part using p_user, v_generation, v_revision;
    v_parts := v_parts || r.tbl || '=' || v_part || ';';
  end loop;
  return md5(v_parts);
end $$;

-- Row counts per restored table for one user.
create or replace function study_reset.user_counts(p_user uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare r record; v_n bigint; v_out jsonb := '{}';
begin
  for r in select i.tbl from study_reset.inventory() i where i.action = 'restore' order by i.ord loop
    execute format('select count(*) from %s x where x.user_id = $1', r.tbl) into v_n using p_user;
    v_out := v_out || jsonb_build_object(r.tbl, v_n);
  end loop;
  return v_out;
end $$;

-- Count and digest of every row NOT belonging to p_user in each table a reset writes.
-- Taken before and after a restore to show no other account was touched.
create or replace function study_reset.others_fingerprint(p_user uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare r record; v jsonb; v_out jsonb := '{}';
begin
  for r in select i.tbl from study_reset.inventory() i where i.action in ('restore','delete') order by i.ord loop
    execute format('select jsonb_build_object(%L, count(*), %L, md5(coalesce(string_agg(to_jsonb(x)::text, chr(10) order by %s), %L))) from %s x where x.user_id is distinct from $1',
      'n', 'md5', study_reset.pk_order(r.tbl, 'x'), '', r.tbl)
      into v using p_user;
    v_out := v_out || jsonb_build_object(r.tbl, v);
  end loop;
  return v_out;
end $$;

-- Error text for the log: SQLSTATE plus message, with anything shaped like an address
-- or an id replaced, and bounded.
create or replace function study_reset.safe_error(p_state text, p_message text)
returns text language sql immutable set search_path = '' as $$
  select left(coalesce(p_state, '?????') || ': ' ||
    regexp_replace(regexp_replace(coalesce(p_message, ''),
      '[^[:space:]@<>"'']+@[^[:space:]@<>"'']+', '[address]', 'g'),
      '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '[id]', 'g'), 500)
$$;

-- Resolves a label to a study account and checks it is still the same account.
create or replace function study_reset.resolve(p_label text)
returns uuid language plpgsql stable set search_path = '' as $$
declare v_user uuid; v_email text;
begin
  if (select count(*) from study_reset.accounts) <> 2 then
    raise exception 'STUDY_RESET_ACCOUNTS_NOT_TWO: study_reset.accounts must hold exactly the two study accounts (A and B)';
  end if;
  select a.user_id, a.email into v_user, v_email from study_reset.accounts a where a.label = p_label;
  if v_user is null then
    raise exception 'STUDY_RESET_UNKNOWN_LABEL: the label must be A or B';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_user
      and lower(btrim(u.email)) = lower(btrim(v_email))) then
    raise exception 'STUDY_RESET_ACCOUNT_CHANGED: the study account no longer matches the account recorded at the freeze';
  end if;
  return v_user;
end $$;

-- Refuses while a scan, storage job or Calendar request holds a lease.
create or replace function study_reset.check_no_live_lease(p_user uuid)
returns void language plpgsql stable set search_path = '' as $$
begin
  if exists (select 1 from private.storage_jobs j where j.user_id = p_user and j.state = 'processing' and j.lease_until > now())
    or exists (select 1 from private.gmail_scan_work w where w.user_id = p_user and w.lease is not null and w.lease_until > now())
    or exists (select 1 from private.calendar_events e where e.user_id = p_user and e.lease is not null and e.lease_until > now()) then
    raise exception 'STUDY_RESET_LIVE_LEASE: a scan, job or Calendar request is in progress; close the app, wait a few minutes and run again';
  end if;
end $$;

-- The restore itself. Runs inside the caller's transaction; any error undoes all of it.
create or replace function study_reset.apply(p_user uuid, p_calendar_cleared boolean, p_restore_usage boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  r record; f study_reset.freeze_digest; w jsonb;
  v_before jsonb; v_after jsonb; v_bad text; v_digest text; v_expected text; v_override jsonb; v_order text;
  v_cur_generation bigint; v_cur_revision bigint; v_snap_generation bigint; v_snap_revision bigint;
  v_generation bigint; v_revision bigint; v_work_override jsonb := '{}';
begin
  select * into f from study_reset.freeze_digest d where d.user_id = p_user;
  if f.user_id is null then
    raise exception 'STUDY_RESET_NO_SNAPSHOT: take_snapshot was not run for this account';
  end if;
  -- Deleting tasks would cascade to Calendar event records, so never without the flag.
  if not coalesce(p_calendar_cleared, false)
    and exists (select 1 from private.calendar_events e where e.user_id = p_user) then
    raise exception 'STUDY_RESET_CALENDAR_NOT_CLEARED: Calendar event records remain; remove the events in the app and in Google Calendar, then run again with p_calendar_cleared = true';
  end if;
  -- Same lock order as the app: preferences, settings, connection, scan work.
  perform 1 from public.storage_preferences p where p.user_id = p_user for update;
  perform 1 from public.scan_settings s where s.user_id = p_user for update;
  perform 1 from private.google_connections c where c.user_id = p_user for share;
  perform 1 from private.gmail_scan_work x where x.user_id = p_user for update;

  v_before := study_reset.others_fingerprint(p_user);

  -- Fencing counters move FORWARD, never back. Edge functions, open browser tabs and
  -- in-flight scans hold the settings revision and storage generation they read, and
  -- the backend refuses their writes once these numbers have moved on. Putting the
  -- frozen (lower) numbers back could let something from before or during the session
  -- match again and write into the restored account, so both become greater than the
  -- current and the frozen value. gmail_scan_work keeps copies of them; each copy that
  -- matched at the freeze is set to the new value and each stale copy stays stale, so
  -- the next scan decides its window exactly as it would have at the freeze. These
  -- columns are the only ones left out of the digest (see normalize). Job rows keep
  -- the generation they were claimed with; their leases have expired, and that
  -- generation is now older than the account's, so they cannot finish.
  select p.generation into v_cur_generation from public.storage_preferences p where p.user_id = p_user;
  select s.revision into v_cur_revision from public.scan_settings s where s.user_id = p_user;
  select (n.row_data ->> 'generation')::bigint into v_snap_generation from study_reset.snapshot n
    where n.user_id = p_user and n.tbl = 'public.storage_preferences';
  select (n.row_data ->> 'revision')::bigint into v_snap_revision from study_reset.snapshot n
    where n.user_id = p_user and n.tbl = 'public.scan_settings';
  if v_snap_generation is null or v_snap_revision is null then
    raise exception 'STUDY_RESET_NO_SNAPSHOT: the snapshot has no settings rows';
  end if;
  v_generation := greatest(coalesce(v_cur_generation, 0), v_snap_generation) + 1;
  v_revision := greatest(coalesce(v_cur_revision, 0), v_snap_revision) + 1;
  select n.row_data into w from study_reset.snapshot n where n.user_id = p_user and n.tbl = 'private.gmail_scan_work';
  if w is not null then
    v_work_override := jsonb_build_object(
      'settings_revision', case when (w ->> 'settings_revision')::bigint = v_snap_revision then to_jsonb(v_revision) else w -> 'settings_revision' end,
      'storage_generation', case when (w ->> 'storage_generation')::bigint = v_snap_generation then to_jsonb(v_generation) else w -> 'storage_generation' end,
      'last_complete_revision', case when (w ->> 'last_complete_revision')::bigint = v_snap_revision then to_jsonb(v_revision) else w -> 'last_complete_revision' end,
      'last_complete_storage_generation', case when (w ->> 'last_complete_storage_generation')::bigint = v_snap_generation then to_jsonb(v_generation) else w -> 'last_complete_storage_generation' end);
  end if;

  -- Delete child to parent. Every statement filters on the resolved user id.
  if coalesce(p_calendar_cleared, false) then
    delete from private.calendar_events e where e.user_id = p_user;
  end if;
  for r in select i.tbl from study_reset.inventory() i
    where i.action = 'restore' and (p_restore_usage or i.tbl <> 'private.storage_usage') order by i.ord desc loop
    execute format('delete from %s x where x.user_id = $1', r.tbl) using p_user;
  end loop;

  -- Insert parent to child, ids and timestamps verbatim. Untargeted change proposals
  -- go first so gmail_change_no_repeat keeps them (see the header).
  for r in select i.tbl from study_reset.inventory() i
    where i.action = 'restore' and (p_restore_usage or i.tbl <> 'private.storage_usage') order by i.ord loop
    v_override := case r.tbl
      when 'public.storage_preferences' then jsonb_build_object('generation', v_generation)
      when 'public.scan_settings' then jsonb_build_object('revision', v_revision)
      when 'private.gmail_scan_work' then v_work_override
      else '{}'::jsonb end;
    v_order := case when r.tbl = 'public.gmail_task_changes'
      then '(s.row_data ->> ''target_task_id'') is not null, s.seq' else 's.seq' end;
    execute format('insert into %1$s select x.* from study_reset.snapshot s cross join lateral jsonb_populate_record(null::%1$s, s.row_data || $2) x where s.user_id = $1 and s.tbl = %2$L order by %3$s',
      r.tbl, r.tbl, v_order) using p_user, v_override;
  end loop;
  -- Check the deferred task/suggestion foreign keys now, inside this block, so a
  -- violation is caught here instead of at commit.
  set constraints all immediate;

  v_after := study_reset.others_fingerprint(p_user);
  if v_after is distinct from v_before then
    select string_agg(k, ', ') into v_bad from jsonb_object_keys(v_before) k where v_before -> k is distinct from v_after -> k;
    raise exception 'STUDY_RESET_OTHER_ACCOUNTS_CHANGED: rows of another account changed during the reset (%)', coalesce(v_bad, 'table list');
  end if;
  v_digest := study_reset.digest(p_user, p_restore_usage);
  v_expected := case when p_restore_usage then f.digest else f.digest_without_usage end;
  if v_digest is distinct from v_expected then
    raise exception 'STUDY_RESET_DIGEST_MISMATCH: the restored data does not match the freeze digest';
  end if;
  return jsonb_build_object('counts', study_reset.user_counts(p_user), 'digest', v_digest);
end $$;

-- Copies the frozen state of one study account. Run once per account right after the
-- freeze scan, before anyone makes a decision in the app.
create or replace function study_reset.take_snapshot(p_label text, p_replace boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare
  r record; v_user uuid; c private.google_connections; v_found boolean;
  v_digest text; v_digest_without_usage text; v_counts jsonb;
begin
  v_user := study_reset.resolve(p_label);
  if exists (select 1 from study_reset.freeze_digest d where d.user_id = v_user) and p_replace is distinct from true then
    raise exception 'STUDY_RESET_SNAPSHOT_EXISTS: this account already has a snapshot; pass p_replace => true only for a deliberate re-freeze';
  end if;
  perform study_reset.check_schema();
  perform 1 from public.storage_preferences p where p.user_id = v_user for update;
  perform 1 from public.scan_settings s where s.user_id = v_user for update;
  select * into c from private.google_connections g where g.user_id = v_user for share;
  perform 1 from private.gmail_scan_work x where x.user_id = v_user for update;
  if not exists (select 1 from public.storage_preferences p where p.user_id = v_user)
    or not exists (select 1 from public.scan_settings s where s.user_id = v_user) then
    raise exception 'STUDY_RESET_NOT_READY: the account has no saved settings yet; finish the setup and the freeze scan first';
  end if;
  perform study_reset.check_no_live_lease(v_user);
  if c.user_id is null or c.state is distinct from 'connected' or c.subject is null then
    raise exception 'STUDY_RESET_CONNECTION_CHANGED: the account has no connected Google account to record';
  end if;
  if exists (select 1 from private.calendar_events e where e.user_id = v_user) then
    raise exception 'STUDY_RESET_CALENDAR_NOT_EMPTY: the frozen state must have no Calendar event records';
  end if;
  -- jsonb keeps no difference between SQL NULL and a JSON null in a jsonb column, so a
  -- JSON null could not be put back exactly. None is expected; refuse if one appears.
  for r in select i.tbl, a.attname from study_reset.inventory() i
    join pg_catalog.pg_attribute a on a.attrelid = to_regclass(i.tbl) and a.attnum > 0 and not a.attisdropped
    where i.action = 'restore' and a.atttypid = 'jsonb'::regtype loop
    execute format('select exists (select 1 from %s x where x.user_id = $1 and jsonb_typeof(x.%I) = %L)', r.tbl, r.attname, 'null')
      into v_found using v_user;
    if v_found then
      raise exception 'STUDY_RESET_SNAPSHOT_NOT_RESTORABLE: %.% holds a JSON null', r.tbl, r.attname;
    end if;
  end loop;

  delete from study_reset.snapshot n where n.user_id = v_user;
  delete from study_reset.freeze_digest d where d.user_id = v_user;
  for r in select i.tbl from study_reset.inventory() i where i.action = 'restore' order by i.ord loop
    execute format('insert into study_reset.snapshot(user_id, tbl, seq, row_data) select $1, %L, row_number() over (order by %s), to_jsonb(x) from %s x where x.user_id = $1',
      r.tbl, study_reset.pk_order(r.tbl, 'x'), r.tbl) using v_user;
  end loop;
  v_digest := study_reset.digest(v_user, true);
  v_digest_without_usage := study_reset.digest(v_user, false);
  v_counts := study_reset.user_counts(v_user);
  insert into study_reset.freeze_digest(user_id, label, digest, digest_without_usage, counts, schema_signature,
      connection_subject_hash, connection_generation)
    values (v_user, p_label, v_digest, v_digest_without_usage, v_counts, study_reset.schema_signature(),
      md5(c.subject), c.generation);

  -- Prove the snapshot can be put back: run the full restore, compare with the digest,
  -- then undo it. Nothing from this dry run is kept.
  begin
    perform study_reset.apply(v_user, false, true);
    raise exception 'STUDY_RESET_DRY_RUN_DONE' using errcode = 'SR000';
  exception
    when sqlstate 'SR000' then null;
    when others then
      raise exception 'STUDY_RESET_SNAPSHOT_NOT_RESTORABLE: %', study_reset.safe_error(sqlstate, sqlerrm);
  end;
  return jsonb_build_object('ok', true, 'label', p_label, 'digest', v_digest,
    'digestWithoutUsage', v_digest_without_usage, 'counts', v_counts);
end $$;

-- Guards that must hold before a reset, then the restore.
create or replace function study_reset.reset_checked(p_label text, p_calendar_cleared boolean, p_restore_usage boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare v_user uuid; f study_reset.freeze_digest; c private.google_connections;
begin
  v_user := study_reset.resolve(p_label);
  select * into f from study_reset.freeze_digest d where d.user_id = v_user;
  if f.user_id is null or not exists (select 1 from study_reset.snapshot n where n.user_id = v_user) then
    raise exception 'STUDY_RESET_NO_SNAPSHOT: take_snapshot was not run for this account';
  end if;
  perform study_reset.check_schema();
  if study_reset.schema_signature() is distinct from f.schema_signature then
    raise exception 'STUDY_RESET_SCHEMA_CHANGED: the tables changed after the freeze; the snapshot no longer fits';
  end if;
  perform 1 from public.storage_preferences p where p.user_id = v_user for update;
  perform 1 from public.scan_settings s where s.user_id = v_user for update;
  select * into c from private.google_connections g where g.user_id = v_user for share;
  perform 1 from private.gmail_scan_work x where x.user_id = v_user for update;
  perform study_reset.check_no_live_lease(v_user);
  if c.user_id is null or c.state is distinct from 'connected'
    or md5(coalesce(c.subject, '')) is distinct from f.connection_subject_hash
    or c.generation is distinct from f.connection_generation then
    raise exception 'STUDY_RESET_CONNECTION_CHANGED: the Google connection is not the one recorded at the freeze (disconnected or reconnected)';
  end if;
  return study_reset.apply(v_user, p_calendar_cleared, p_restore_usage);
end $$;

-- Puts one study account back to its frozen state. Never raises: on refusal or failure
-- every data change is rolled back, a `failed` row is logged and {ok:false} returned.
create or replace function study_reset.reset(p_participant text, p_label text, p_calendar_cleared boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  -- SWITCH: true puts the daily scan allowance (private.storage_usage) back to its frozen
  -- value, so each participant starts with the same allowance; false leaves the usage
  -- rows as they are and leaves them out of the digest. Not decided yet by the owner.
  c_restore_usage constant boolean := true;
  c_participant_pattern constant text := '^(P[0-9]{2}|PILOT|R[0-9])$';
  v_code text := case when p_participant ~ c_participant_pattern then p_participant end;
  v_label text := case when p_label in ('A','B') then p_label end;
  v_started timestamptz := clock_timestamp();
  v_out jsonb; v_error text;
begin
  begin
    if v_code is null then
      raise exception 'STUDY_RESET_BAD_PARTICIPANT_CODE: use a participant code such as P01, PILOT or a rehearsal code such as R1';
    end if;
    v_out := study_reset.reset_checked(p_label, coalesce(p_calendar_cleared, false), c_restore_usage);
  exception when others then
    v_error := study_reset.safe_error(sqlstate, sqlerrm);
    insert into study_reset.log(participant, label, started_at, finished_at, result, error)
      values (v_code, v_label, v_started, clock_timestamp(), 'failed', v_error);
    return jsonb_build_object('ok', false, 'error', v_error);
  end;
  insert into study_reset.log(participant, label, started_at, finished_at, result, counts, digest)
    values (v_code, v_label, v_started, clock_timestamp(), 'ok', v_out -> 'counts', v_out ->> 'digest');
  return jsonb_build_object('ok', true, 'counts', v_out -> 'counts', 'digest', v_out ->> 'digest');
end $$;

-- Only the owner (postgres) can reach any of this. Re-applied on every run.
revoke all on schema study_reset from public, anon, authenticated, service_role;
revoke all on all tables in schema study_reset from public, anon, authenticated, service_role;
revoke all on all sequences in schema study_reset from public, anon, authenticated, service_role;
revoke all on all functions in schema study_reset from public, anon, authenticated, service_role;
