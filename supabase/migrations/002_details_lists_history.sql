-- FairShare migration 002: log details (bill name, amount, comment), household currency,
-- shopping + repair lists, and the database side of History.
--
-- Run once, after 001_initial.sql: Supabase dashboard -> SQL Editor -> New query -> paste this file -> Run.
-- Everything is inside one transaction: if any line fails, nothing at all is changed.

begin;

-- ---------------------------------------------------------------------------
-- 1. Details on logged tasks
-- ---------------------------------------------------------------------------

-- "What was it?" (e.g. "Electricity bill"), "How much?" and a free comment. All optional.
-- numeric(12,2) stores money as an exact decimal with 2 places (never a float, see supabase/README.md).
alter table public.logs
  add column if not exists detail text
    constraint logs_detail_length check (detail is null or char_length(detail) between 1 and 80),
  add column if not exists amount numeric(12, 2)
    constraint logs_amount_range check (amount is null or (amount >= 0 and amount < 1000000000)),
  add column if not exists note text
    constraint logs_note_length check (note is null or char_length(note) between 1 and 500);

-- Tasks that should ask "How much?" after logging (bills, groceries).
alter table public.tasks
  add column if not exists asks_amount boolean not null default false;

update public.tasks set asks_amount = true
where name in ('Paid a bill', 'Did the grocery run');

-- ---------------------------------------------------------------------------
-- 2. Household currency and plan
-- ---------------------------------------------------------------------------

alter table public.households
  add column if not exists currency text not null default 'EUR'
    constraint households_currency_allowed check (currency in ('EUR', 'MKD', 'USD', 'GBP', 'CHF'));

-- 'free' households see 2 months of history, 'premium' ones 6 months. Members can NOT change this:
-- it will be set by a server-side payment webhook later (or by hand in the dashboard for testing).
alter table public.households
  add column if not exists plan text not null default 'free'
    constraint households_plan_allowed check (plan in ('free', 'premium'));

-- Any member may change the currency, and nothing else (in particular not `plan`, `name` or `invite_code`).
revoke update on public.households from anon, authenticated;
grant update (currency) on public.households to authenticated;

drop policy if exists "members change currency" on public.households;
create policy "members change currency" on public.households
  for update to authenticated
  using (is_member(id))
  with check (is_member(id));

-- ---------------------------------------------------------------------------
-- 3. Lists: "What we need to buy" (shopping) and "Things to fix" (repair)
-- ---------------------------------------------------------------------------

create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('shopping', 'repair')),
  title text not null check (char_length(title) between 1 and 80),
  note text check (note is null or char_length(note) between 1 and 300),
  -- "2", "1 kg": only for shopping items.
  quantity text check (quantity is null or (kind = 'shopping' and char_length(quantity) between 1 and 20)),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  done_by uuid,
  done_at timestamptz,
  -- Someone can only be named as "done by" when there is a done time.
  check (done_by is null or done_at is not null),
  foreign key (household_id, created_by)
    references public.household_members (household_id, user_id) on delete cascade,
  -- If the person who ticked it leaves, the item stays ticked but without a name.
  foreign key (household_id, done_by)
    references public.household_members (household_id, user_id) on delete set null (done_by)
);

-- The list screen asks for "this household's items", newest first.
create index if not exists list_items_household_created_idx
  on public.list_items (household_id, created_at desc);

-- Who ticked an item is decided by the database, never by the browser:
-- ticking stamps the signed-in person and the server time, unticking clears both.
create or replace function public.list_items_stamp_done()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.done_at is distinct from old.done_at then
    if new.done_at is null then
      new.done_by := null;
    else
      new.done_by := auth.uid();
      new.done_at := now();
    end if;
  elsif new.done_by is not null then
    -- Nobody can rename who did it. (Clearing it is allowed: that is what happens when that person leaves.)
    new.done_by := old.done_by;
  end if;
  return new;
end;
$$;

drop trigger if exists list_items_stamp_done on public.list_items;
create trigger list_items_stamp_done
  before update on public.list_items
  for each row execute function public.list_items_stamp_done();

-- Explicit rights: read and delete rows; insert and update only the columns people may set.
-- (created_by, created_at, done_by come from defaults and the trigger above.)
revoke all on public.list_items from public, anon, authenticated;
grant select, delete on public.list_items to authenticated;
grant insert (id, household_id, kind, title, note, quantity) on public.list_items to authenticated;
grant update (title, note, quantity, done_at) on public.list_items to authenticated;

alter table public.list_items enable row level security;

drop policy if exists "members read list items" on public.list_items;
create policy "members read list items" on public.list_items
  for select to authenticated using (is_member(household_id));

drop policy if exists "add list items as yourself" on public.list_items;
create policy "add list items as yourself" on public.list_items
  for insert to authenticated with check (created_by = auth.uid() and is_member(household_id));

drop policy if exists "members update list items" on public.list_items;
create policy "members update list items" on public.list_items
  for update to authenticated using (is_member(household_id)) with check (is_member(household_id));

drop policy if exists "creator deletes list items" on public.list_items;
create policy "creator deletes list items" on public.list_items
  for delete to authenticated using (created_by = auth.uid() and is_member(household_id));

-- ---------------------------------------------------------------------------
-- 4. History
-- ---------------------------------------------------------------------------

-- How far back a household may see its logs: 6 months on premium, 2 months on free.
-- Older logs are never deleted, only hidden; upgrading makes them visible again.
-- security definer so it can read `plan` whatever the caller's rights; non-members get null (= see nothing).
create or replace function public.history_floor(h uuid)
returns timestamptz
language sql stable security definer set search_path = public
as $$
  select now() - case when plan = 'premium' then interval '6 months' else interval '2 months' end
  from households
  where id = h and is_member(h);
$$;

revoke execute on function public.history_floor(uuid) from public, anon;
grant execute on function public.history_floor(uuid) to authenticated;

-- Reading logs: members only, and only inside the plan's window. This is enforced here in the database,
-- so changing the website's code or calling the API directly can't reach older rows.
drop policy if exists "members read logs" on public.logs;
create policy "members read logs" on public.logs
  for select to authenticated
  using (is_member(household_id) and at >= history_floor(household_id));

-- Editing and deleting your own logs: same window. Logs you can't see stay frozen as they are.
-- Only the three detail columns may change, so nobody can move a log to another day or task.
-- (Revoking first removes any wider UPDATE right, e.g. from Supabase's default grants.)
revoke update on public.logs from anon, authenticated;
grant update (detail, amount, note) on public.logs to authenticated;

drop policy if exists "edit own logs" on public.logs;
create policy "edit own logs" on public.logs
  for update to authenticated
  using (user_id = auth.uid() and is_member(household_id) and at >= history_floor(household_id))
  with check (user_id = auth.uid() and is_member(household_id) and at >= history_floor(household_id));

drop policy if exists "delete own logs" on public.logs;
create policy "delete own logs" on public.logs
  for delete to authenticated
  using (user_id = auth.uid() and at >= history_floor(household_id));

-- History asks for "this household's logs between two dates, newest first".
-- The existing index logs_household_at_idx (household_id, at desc) from 001 already answers exactly that,
-- so no new index is needed. (The member filter runs in the browser on rows already loaded.)

-- ---------------------------------------------------------------------------
-- 5. New households: same starter tasks as before, with "How much?" on bills and groceries.
-- ---------------------------------------------------------------------------

create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  h uuid;
begin
  if me is null then
    raise exception 'You need to be signed in';
  end if;

  insert into households (name, invite_code, created_by)
  values (trim(p_name), new_invite_code(), me)
  returning id into h;

  insert into household_members (household_id, user_id, display_name, style_index, role)
  values (h, me, trim(p_display_name), 0, 'owner');

  insert into tasks (household_id, name, emoji, category, effort, asks_amount) values
    (h, 'Paid a bill', '🧾', 'mental', 3, true),
    (h, 'Booked an appointment', '📅', 'mental', 3, false),
    (h, 'Noticed & restocked supplies', '🧴', 'mental', 2, false),
    (h, 'Planned the week''s meals', '🥗', 'mental', 4, false),
    (h, 'Remembered a birthday / gift', '🎁', 'mental', 3, false),
    (h, 'Sorted out paperwork', '📂', 'mental', 4, false),
    (h, 'Cooked a meal', '🍳', 'physical', 3, false),
    (h, 'Did the dishes', '🍽️', 'physical', 2, false),
    (h, 'Did a load of laundry', '👕', 'physical', 2, false),
    (h, 'Cleaned the bathroom', '🛁', 'physical', 4, false),
    (h, 'Took out the trash', '🗑️', 'physical', 1, false),
    (h, 'Did the grocery run', '🛒', 'physical', 3, true);

  insert into areas (household_id, name, emoji, owner_id, rotate_every_days) values
    (h, 'Bills & payments', '🧾', me, 30),
    (h, 'Groceries & supplies', '🛒', me, 14),
    (h, 'Appointments', '📅', me, 30),
    (h, 'Birthdays & gifts', '🎁', me, 60);

  return h;
end;
$$;

-- "create or replace" keeps the existing rights, but restating them makes this file self-explanatory.
revoke execute on function public.create_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;

commit;
