-- Local baseline matching the table inspected on November 3, 2026.
-- IF NOT EXISTS preserves an existing table and all of its rows.
-- Do not push against an existing project until migration history is reconciled.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  source_email_id text,
  confidence double precision check (confidence >= 0 and confidence <= 1),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
