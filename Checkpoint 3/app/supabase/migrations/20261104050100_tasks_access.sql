-- Normal browser access is owner-scoped. Backend-controlled fields are read-only
-- to browser roles; approval is an intentional owner action through status.
alter table public.tasks enable row level security;
revoke all privileges on table public.tasks from anon, authenticated, service_role;
grant usage on schema public to authenticated, service_role;
grant select, delete on table public.tasks to authenticated;
grant insert (user_id, title, description, due_at) on public.tasks to authenticated;
grant update (title, description, due_at, status) on public.tasks to authenticated;
grant select, insert, update, delete on table public.tasks to service_role;

drop policy if exists "Users can read own tasks" on public.tasks;
create policy "Users can read own tasks" on public.tasks for select
  to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can create own tasks" on public.tasks;
create policy "Users can create own tasks" on public.tasks for insert
  to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own tasks" on public.tasks;
create policy "Users can update own tasks" on public.tasks for update
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own tasks" on public.tasks;
create policy "Users can delete own tasks" on public.tasks for delete
  to authenticated using ((select auth.uid()) = user_id);

create index if not exists tasks_user_id_status_idx on public.tasks(user_id, status);

create or replace function public.tasks_set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.tasks_set_updated_at() from public, anon, authenticated;
drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.tasks_set_updated_at();
