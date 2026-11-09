-- Keep at most one pending calendar preview per task: a new preview replaces
-- the task's earlier pending preview. Approved and later states are untouched.
create function private.storage_calendar_replace_pending() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.task_id is not null and new.state = 'pending' then
    delete from public.storage_calendar_operations
      where user_id = new.user_id and task_id = new.task_id and state = 'pending';
  end if;
  return new;
end; $$;
revoke all on function private.storage_calendar_replace_pending() from public, anon, authenticated;

create trigger storage_calendar_replace_pending
  before insert on public.storage_calendar_operations
  for each row execute function private.storage_calendar_replace_pending();
