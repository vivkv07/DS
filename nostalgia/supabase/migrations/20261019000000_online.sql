-- NOSTALGIA online (ARCHITECTURE §23, design/online_setup.md): cloud saves, journeys, nicknames.
-- Applied to project gralunajtfapqkpwulyg with the Supabase MCP tools; re-run safely in the SQL editor.
-- Kid-friendly data rule: nothing personal is stored here — only the auth user id, a nickname and game saves.
-- Rooms need no tables: they are Realtime channels 'room:<CODE>' (presence + broadcast).

-- ---------------------------------------------------------------- saves (one row per slot)
create table if not exists public.saves (
  user_id  uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  slot     int         not null check (slot between 0 and 1),           -- 0 = latest (CONTINUE), 1 = manual
  data     jsonb       not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 1500000),
  version  int         not null check (version between 1 and 1000),
  saved_at timestamptz not null,
  primary key (user_id, slot)
);

-- The newer-save guard on the server (mirrors src/save.js): an update never replaces a save that was
-- written later, nor one written by a newer build of the game. The client checks first; this makes it stick.
create or replace function public.saves_newer_guard() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  if new.user_id <> old.user_id or new.slot <> old.slot then
    raise exception 'save key is immutable' using errcode = '42501';
  end if;
  if old.version > new.version then
    raise exception 'newer_build: the cloud save was made by a newer version of the game';
  end if;
  if old.saved_at > new.saved_at then
    raise exception 'newer_save: the cloud save is newer than this one';
  end if;
  return new;
end
$fn$;
drop trigger if exists saves_newer_guard on public.saves;
create trigger saves_newer_guard before update on public.saves for each row execute function public.saves_newer_guard();

-- ---------------------------------------------------------------- journeys (one row per player)
create table if not exists public.journeys (
  user_id    uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb       not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 65536),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- profiles (the nickname)
create table if not exists public.profiles (
  user_id    uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  nick       text        not null check (char_length(nick) between 3 and 12 and nick ~ '^[A-Za-z0-9][A-Za-z0-9 ]{1,10}[A-Za-z0-9]$'),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- row level security
alter table public.saves    enable row level security;
alter table public.journeys enable row level security;
alter table public.profiles enable row level security;

drop policy if exists saves_select_own on public.saves;
drop policy if exists saves_insert_own on public.saves;
drop policy if exists saves_update_own on public.saves;
drop policy if exists saves_delete_own on public.saves;
create policy saves_select_own on public.saves for select to authenticated using ((select auth.uid()) = user_id);
create policy saves_insert_own on public.saves for insert to authenticated with check ((select auth.uid()) = user_id);
create policy saves_update_own on public.saves for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy saves_delete_own on public.saves for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists journeys_select_own on public.journeys;
drop policy if exists journeys_insert_own on public.journeys;
drop policy if exists journeys_update_own on public.journeys;
drop policy if exists journeys_delete_own on public.journeys;
create policy journeys_select_own on public.journeys for select to authenticated using ((select auth.uid()) = user_id);
create policy journeys_insert_own on public.journeys for insert to authenticated with check ((select auth.uid()) = user_id);
create policy journeys_update_own on public.journeys for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy journeys_delete_own on public.journeys for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists profiles_select_auth on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_select_auth on public.profiles for select to authenticated using (true);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy profiles_delete_own on public.profiles for delete to authenticated using ((select auth.uid()) = user_id);

-- anon (not signed in) gets nothing; authenticated gets only what the policies allow
revoke all on public.saves, public.journeys, public.profiles from anon;
grant select, insert, update, delete on public.saves, public.journeys, public.profiles to authenticated;
revoke execute on function public.saves_newer_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------- optional: private room channels
-- Rooms use public Realtime channels by default (the code is the invite). Setting ONLINE_CONFIG.privateRooms
-- = true makes the client join private channels, which these policies limit to signed-in players on room
-- topics (Realtime Authorization; also switch off "Allow public access" in Realtime settings to require it).
drop policy if exists nostalgia_rooms_read on realtime.messages;
drop policy if exists nostalgia_rooms_write on realtime.messages;
create policy nostalgia_rooms_read on realtime.messages for select to authenticated
  using (realtime.topic() ~ '^room:[A-Z]{3,8}-[0-9]{2,3}$' and extension in ('broadcast', 'presence'));
create policy nostalgia_rooms_write on realtime.messages for insert to authenticated
  with check (realtime.topic() ~ '^room:[A-Z]{3,8}-[0-9]{2,3}$' and extension in ('broadcast', 'presence'));
