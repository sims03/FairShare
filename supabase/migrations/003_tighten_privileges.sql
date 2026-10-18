-- FairShare migration 003: tighten table rights (least privilege) and let the server decide when a task was logged.
--
-- Run once, after 002_details_lists_history.sql: Supabase dashboard -> SQL Editor -> New query -> paste this file -> Run.
-- Everything is inside one transaction: if any line fails, nothing at all is changed.
-- Running it a second time is harmless (it only re-applies the same rights and replaces the same trigger).

begin;

-- ---------------------------------------------------------------------------
-- 1. Table rights: give each role only what the app needs
-- ---------------------------------------------------------------------------
--
-- The problem: Supabase automatically gives the `anon` (signed out) and `authenticated` (signed in) roles
-- EVERY right on new tables: select, insert, update, delete, truncate, references, trigger. These are called
-- "default privileges". Migration 001 added narrower grants on top, like `grant update (display_name)`, but a
-- grant can only ADD rights, it never takes the automatic ones away. So a member could still change their own
-- `role`, `style_index`, `joined_at` and even `household_id` (moving themselves into another household without
-- an invite code and past the 12-person limit).
--
-- The fix, per table: `revoke all` first (this also removes every column-level right), then grant back exactly
-- the operations and columns the app uses. Row-level security policies still decide WHICH rows; these grants
-- decide WHICH OPERATIONS and WHICH COLUMNS. Both have to say yes.
--
-- `anon` gets nothing at all: every screen that touches data needs you to be signed in.
-- TRUNCATE (empty the whole table), REFERENCES (build foreign keys onto it) and TRIGGER (attach triggers to it)
-- are never needed by app users, and TRUNCATE even ignores row-level security, so nobody keeps those.
-- Functions marked `security definer` (create_household, join_household, history_floor, is_member) run with the
-- table owner's rights, so they keep working without any of these grants.

-- households: read; change only the currency (002). Creating one goes through create_household().
revoke all on table public.households from public, anon, authenticated;
grant select on table public.households to authenticated;
grant update (currency) on table public.households to authenticated;

-- household_members: read; change only your own display name (the "edit own member row" policy).
-- Joining goes through join_household(), which checks the invite code and the 12-person limit.
revoke all on table public.household_members from public, anon, authenticated;
grant select on table public.household_members to authenticated;
grant update (display_name) on table public.household_members to authenticated;

-- tasks: members manage their household's task list (001's intent, used by the upcoming "edit tasks" screen).
-- `household_id` and `id` can't be changed afterwards, so a task can't be moved into another household.
-- `created_at` comes from its default (server time).
revoke all on table public.tasks from public, anon, authenticated;
grant select, delete on table public.tasks to authenticated;
grant insert (id, household_id, name, emoji, category, effort, asks_amount) on table public.tasks to authenticated;
grant update (name, emoji, category, effort, asks_amount) on table public.tasks to authenticated;

-- areas: same idea. Handing an area over changes `owner_id` and `since` (handOver in src/lib/data.ts).
revoke all on table public.areas from public, anon, authenticated;
grant select, delete on table public.areas to authenticated;
grant insert (id, household_id, name, emoji, owner_id, rotate_every_days) on table public.areas to authenticated;
grant update (name, emoji, owner_id, rotate_every_days, since) on table public.areas to authenticated;

-- logs: read, add, edit the three details (002), delete your own.
-- `user_id` comes from its default (auth.uid()), so it is not insertable at all.
-- `at` stays insertable only so the current app (which still sends it) keeps working: the trigger in section 2
-- throws the value away and writes the server's time instead.
revoke all on table public.logs from public, anon, authenticated;
grant select, delete on table public.logs to authenticated;
grant insert (id, household_id, task_id, at, detail, amount, note) on table public.logs to authenticated;
grant update (detail, amount, note) on table public.logs to authenticated;

-- list_items: already locked down exactly like this in 002 (`revoke all` + column grants). Nothing to change.

-- ---------------------------------------------------------------------------
-- 2. The server decides when a task was logged
-- ---------------------------------------------------------------------------
--
-- The problem: the browser sent its own `at` time with each new log, and the database stored it. Anyone calling
-- the API directly could log "Cleaned the bathroom" three months ago or a year in the future, which skews the
-- weekly balance and History. (A device with a wrong clock does the same thing by accident.)
--
-- The fix: a trigger that runs before every new log is saved and overwrites `at` with the database's own clock.
-- Whatever time the browser sends is ignored. now() is the time the request reached the database.
-- (A plain trigger function is enough: it only sets a value on the new row and reads no tables.)

create or replace function public.logs_stamp_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.at := now();
  return new;
end;
$$;

drop trigger if exists logs_stamp_at on public.logs;
create trigger logs_stamp_at
  before insert on public.logs
  for each row execute function public.logs_stamp_at();

commit;
