-- FairShare database schema.
-- Run once in your Supabase project: SQL Editor -> New query -> paste this file -> Run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  style_index int not null default 0,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  emoji text not null default '✅',
  category text not null check (category in ('mental', 'physical')),
  effort int not null check (effort between 1 and 5),
  created_at timestamptz not null default now()
);

create table public.logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null default auth.uid(),
  at timestamptz not null default now(),
  foreign key (household_id, user_id)
    references public.household_members (household_id, user_id) on delete cascade
);

create index logs_household_at_idx on public.logs (household_id, at desc);

-- A recurring area of responsibility ("Bills"), owned by one member at a time.
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  emoji text not null default '📌',
  owner_id uuid not null,
  rotate_every_days int not null default 30 check (rotate_every_days between 1 and 365),
  since timestamptz not null default now(),
  foreign key (household_id, owner_id)
    references public.household_members (household_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Row level security: you can only see and change households you belong to.
-- ---------------------------------------------------------------------------

create function public.is_member(h uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from household_members where household_id = h and user_id = auth.uid()
  );
$$;

grant select on public.households, public.household_members to authenticated;
grant update (display_name) on public.household_members to authenticated;
grant select, insert, update, delete on public.tasks, public.areas to authenticated;
grant select, insert, delete on public.logs to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.tasks enable row level security;
alter table public.logs enable row level security;
alter table public.areas enable row level security;

create policy "members read household" on public.households
  for select to authenticated using (is_member(id));

create policy "members read members" on public.household_members
  for select to authenticated using (is_member(household_id));
create policy "edit own member row" on public.household_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members manage tasks" on public.tasks
  for all to authenticated using (is_member(household_id)) with check (is_member(household_id));

create policy "members read logs" on public.logs
  for select to authenticated using (is_member(household_id));
create policy "log as yourself" on public.logs
  for insert to authenticated with check (user_id = auth.uid() and is_member(household_id));
create policy "delete own logs" on public.logs
  for delete to authenticated using (user_id = auth.uid());

create policy "members manage areas" on public.areas
  for all to authenticated using (is_member(household_id)) with check (is_member(household_id));

-- ---------------------------------------------------------------------------
-- Creating and joining households (the only way to add members).
-- ---------------------------------------------------------------------------

-- 8 characters from an unambiguous alphabet (no 0/O, 1/I/L), from a secure random source.
create function public.new_invite_code()
returns text
language plpgsql volatile set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  -- Skip bytes 6 and 8 of the UUID: they hold fixed version/variant bits.
  random_bytes constant int[] := array[0, 1, 2, 3, 4, 5, 10, 11];
  bytes bytea;
  code text;
begin
  loop
    bytes := uuid_send(gen_random_uuid());
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + get_byte(bytes, random_bytes[i]) % length(alphabet), 1);
    end loop;
    exit when not exists (select 1 from households where invite_code = code);
  end loop;
  return code;
end;
$$;

create function public.create_household(p_name text, p_display_name text)
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

  insert into tasks (household_id, name, emoji, category, effort) values
    (h, 'Paid a bill', '🧾', 'mental', 3),
    (h, 'Booked an appointment', '📅', 'mental', 3),
    (h, 'Noticed & restocked supplies', '🧴', 'mental', 2),
    (h, 'Planned the week''s meals', '🥗', 'mental', 4),
    (h, 'Remembered a birthday / gift', '🎁', 'mental', 3),
    (h, 'Sorted out paperwork', '📂', 'mental', 4),
    (h, 'Cooked a meal', '🍳', 'physical', 3),
    (h, 'Did the dishes', '🍽️', 'physical', 2),
    (h, 'Did a load of laundry', '👕', 'physical', 2),
    (h, 'Cleaned the bathroom', '🛁', 'physical', 4),
    (h, 'Took out the trash', '🗑️', 'physical', 1),
    (h, 'Did the grocery run', '🛒', 'physical', 3);

  insert into areas (household_id, name, emoji, owner_id, rotate_every_days) values
    (h, 'Bills & payments', '🧾', me, 30),
    (h, 'Groceries & supplies', '🛒', me, 14),
    (h, 'Appointments', '📅', me, 30),
    (h, 'Birthdays & gifts', '🎁', me, 60);

  return h;
end;
$$;

create function public.join_household(p_code text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  h uuid;
  member_count int;
begin
  if me is null then
    raise exception 'You need to be signed in';
  end if;

  -- Lock the household row so two people joining at once can't exceed the limit.
  select id into h from households where invite_code = upper(trim(p_code)) for update;
  if h is null then
    raise exception 'No household found with that code';
  end if;

  if exists (select 1 from household_members where household_id = h and user_id = me) then
    return h;
  end if;

  select count(*) into member_count from household_members where household_id = h;
  if member_count >= 12 then
    raise exception 'This household is full (12 people max)';
  end if;

  insert into household_members (household_id, user_id, display_name, style_index)
  values (h, me, trim(p_display_name), member_count);

  return h;
end;
$$;

revoke execute on function public.new_invite_code() from public, anon, authenticated;
revoke execute on function public.create_household(text, text) from public, anon;
revoke execute on function public.join_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;
