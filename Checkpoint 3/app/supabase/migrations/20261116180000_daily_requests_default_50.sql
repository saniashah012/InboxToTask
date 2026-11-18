-- Per-user daily model requests: default raised from 20 to 50 (decided November 16,
-- 2026) so study and test accounts can explore without reaching the limit. Rows still
-- at the old default move to the new one; a limit someone set by hand is kept. The
-- 1-100 range check, the daily token limit and the per-minute provider limit are
-- unchanged.
alter table public.storage_preferences alter column daily_requests set default 50;
update public.storage_preferences set daily_requests=50 where daily_requests=20;
