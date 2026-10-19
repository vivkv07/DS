-- NOSTALGIA online (ARCHITECTURE §23, design/online_setup.md): cloud saves, journeys and nicknames keyed by
-- a PLAYER CODE (no accounts). Applied to project gralunajtfapqkpwulyg with the Supabase MCP tools; safe to
-- re-run in the SQL editor (everything is "if not exists" / "or replace").
--
-- Model
--   * The client holds a random player code (WORD-WORD-WORD-NNNN-XXXXX, ~62 bits, src/online.js) in
--     localStorage. It is the only secret: whoever knows the code owns that journey.
--   * Rows are keyed by sha256(code); the code itself is never stored.
--   * Tables live in schema "nostalgia", which the Data API does not expose, AND have RLS on with no policies:
--     nobody can select / insert / update them directly. The publishable (anon) key can only EXECUTE the
--     SECURITY DEFINER functions below, which validate everything.
--   * Kid-friendly data rule: nothing personal is stored — a hashed code, a nickname and game saves.
--   * Rooms need no tables: they are public Realtime channels 'room:<CODE>' (presence + broadcast).

create schema if not exists nostalgia;
revoke all on schema nostalgia from public, anon, authenticated;

create table if not exists nostalgia.saves (
  key        bytea       not null,                                   -- sha256(player code)
  slot       int         not null check (slot between 0 and 1),     -- 0 = latest (CONTINUE), 1 = manual copy
  data       jsonb       not null check (jsonb_typeof(data) = 'object'),
  version    int         not null check (version between 1 and 1000),
  saved_at   timestamptz not null,                                   -- the save's own timestamp (blob.t)
  updated_at timestamptz not null default now(),
  primary key (key, slot)
);
create table if not exists nostalgia.journeys (
  key        bytea       primary key,
  data       jsonb       not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
create table if not exists nostalgia.profiles (
  key        bytea       primary key,
  nick       text        not null check (char_length(nick) between 3 and 12 and nick ~ '^[A-Za-z0-9][A-Za-z0-9 ]{1,10}[A-Za-z0-9]$'),
  updated_at timestamptz not null default now()
);
-- simple rate limit: calls per player code per minute (fixed window)
create table if not exists nostalgia.rate (
  key   bytea       primary key,
  win   timestamptz not null,
  n     int         not null
);
alter table nostalgia.saves    enable row level security;
alter table nostalgia.journeys enable row level security;
alter table nostalgia.profiles enable row level security;
alter table nostalgia.rate     enable row level security;
revoke all on all tables in schema nostalgia from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers (not callable by clients)
-- the key for a code, or null when the code is malformed
create or replace function nostalgia.key_of(code text) returns bytea
language sql immutable set search_path = '' as $fn$
  select case when upper(btrim(code)) ~ '^[A-Z]{3,8}-[A-Z]{3,8}-[A-Z]{3,8}-[0-9]{4}-[0-9A-HJKMNP-TV-Z]{5}$'
    then pg_catalog.sha256(pg_catalog.convert_to(upper(btrim(code)), 'UTF8')) else null end
$fn$;

-- true when the code may make another call this minute (max 40 / minute / code)
create or replace function nostalgia.allow(k bytea) returns boolean
language plpgsql set search_path = '' as $fn$
declare cur int;
begin
  insert into nostalgia.rate as r (key, win, n) values (k, now(), 1)
  on conflict (key) do update set
    n   = case when r.win < now() - interval '1 minute' then 1 else r.n + 1 end,
    win = case when r.win < now() - interval '1 minute' then now() else r.win end
  returning r.n into cur;
  return cur <= 40;
end
$fn$;

-- ---------------------------------------------------------------- client API (rpc)
-- save_put: write one save slot. Never replaces a save made later, or one made by a newer build.
-- -> {ok, reason?: bad_code|rate|bad_slot|too_big|bad_data|newer_build|newer_save, cloud_t?, cloud_v?}
create or replace function public.save_put(code text, slot int, data jsonb, version int) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare k bytea := nostalgia.key_of(code); t timestamptz; prev nostalgia.saves;
begin
  if k is null then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
  if not nostalgia.allow(k) then return jsonb_build_object('ok', false, 'reason', 'rate'); end if;
  if slot is null or slot not between 0 and 1 then return jsonb_build_object('ok', false, 'reason', 'bad_slot'); end if;
  if data is null or jsonb_typeof(data) <> 'object' or version is null or version not between 1 and 1000
     or data->>'game' is distinct from 'nostalgia' or jsonb_typeof(data->'t') is distinct from 'number' then
    return jsonb_build_object('ok', false, 'reason', 'bad_data');
  end if;
  if octet_length(data::text) > 524288 then return jsonb_build_object('ok', false, 'reason', 'too_big'); end if;
  t := to_timestamp((data->>'t')::double precision / 1000.0);
  if t > now() + interval '1 day' then return jsonb_build_object('ok', false, 'reason', 'bad_data'); end if;
  select * into prev from nostalgia.saves s where s.key = k and s.slot = save_put.slot for update;
  if found then
    if prev.version > version then
      return jsonb_build_object('ok', false, 'reason', 'newer_build', 'cloud_v', prev.version, 'cloud_t', (extract(epoch from prev.saved_at) * 1000)::bigint);
    end if;
    if prev.saved_at > t then
      return jsonb_build_object('ok', false, 'reason', 'newer_save', 'cloud_v', prev.version, 'cloud_t', (extract(epoch from prev.saved_at) * 1000)::bigint);
    end if;
    update nostalgia.saves s set data = save_put.data, version = save_put.version, saved_at = t, updated_at = now()
      where s.key = k and s.slot = save_put.slot;
  else
    insert into nostalgia.saves (key, slot, data, version, saved_at) values (k, save_put.slot, save_put.data, save_put.version, t);
  end if;
  return jsonb_build_object('ok', true, 'cloud_t', (extract(epoch from t) * 1000)::bigint);
end
$fn$;

-- save_get: every slot of this code -> {ok, saves: [{slot, version, t, data}], nick}
create or replace function public.save_get(code text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare k bytea := nostalgia.key_of(code); res jsonb;
begin
  if k is null then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
  if not nostalgia.allow(k) then return jsonb_build_object('ok', false, 'reason', 'rate'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('slot', s.slot, 'version', s.version,
           't', (extract(epoch from s.saved_at) * 1000)::bigint, 'data', s.data) order by s.slot), '[]'::jsonb)
    into res from nostalgia.saves s where s.key = k;
  return jsonb_build_object('ok', true, 'saves', res, 'nick', (select p.nick from nostalgia.profiles p where p.key = k));
end
$fn$;

-- journey_put: the player's journey summary (missions, tape tracks, tin, places, game date) -> {ok, reason?}
create or replace function public.journey_put(code text, data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare k bytea := nostalgia.key_of(code);
begin
  if k is null then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
  if not nostalgia.allow(k) then return jsonb_build_object('ok', false, 'reason', 'rate'); end if;
  if data is null or jsonb_typeof(data) <> 'object' then return jsonb_build_object('ok', false, 'reason', 'bad_data'); end if;
  if octet_length(data::text) > 32768 then return jsonb_build_object('ok', false, 'reason', 'too_big'); end if;
  insert into nostalgia.journeys as j (key, data) values (k, journey_put.data)
    on conflict (key) do update set data = excluded.data, updated_at = now();
  return jsonb_build_object('ok', true);
end
$fn$;

-- journey_get -> {ok, journey: {...} | null, updated: ms | null}
create or replace function public.journey_get(code text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare k bytea := nostalgia.key_of(code); j nostalgia.journeys;
begin
  if k is null then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
  if not nostalgia.allow(k) then return jsonb_build_object('ok', false, 'reason', 'rate'); end if;
  select * into j from nostalgia.journeys x where x.key = k;
  return jsonb_build_object('ok', true, 'journey', j.data, 'updated', (extract(epoch from j.updated_at) * 1000)::bigint);
end
$fn$;

-- profile_set: the nickname (3-12 letters / digits / inner spaces; the client also runs a kid-friendly filter)
create or replace function public.profile_set(code text, nick text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare k bytea := nostalgia.key_of(code); n text := btrim(regexp_replace(coalesce(nick, ''), '\s+', ' ', 'g'));
begin
  if k is null then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
  if not nostalgia.allow(k) then return jsonb_build_object('ok', false, 'reason', 'rate'); end if;
  if char_length(n) not between 3 and 12 or n !~ '^[A-Za-z0-9][A-Za-z0-9 ]{1,10}[A-Za-z0-9]$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_nick');
  end if;
  if lower(regexp_replace(n, '[^A-Za-z]', '', 'g')) ~ '(fuck|shit|bitch|sex|porn|nazi|dick|cunt|chutiya|madarc|behenc|bhosd|gaand|randi|lund|kutta|saala|haraami|lanja|dengu)' then
    return jsonb_build_object('ok', false, 'reason', 'bad_nick');
  end if;
  insert into nostalgia.profiles as p (key, nick) values (k, n)
    on conflict (key) do update set nick = excluded.nick, updated_at = now();
  return jsonb_build_object('ok', true, 'nick', n);
end
$fn$;

-- profile_get -> {ok, nick | null}  ("Use my code" on another phone restores the nickname)
create or replace function public.profile_get(code text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare k bytea := nostalgia.key_of(code);
begin
  if k is null then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
  if not nostalgia.allow(k) then return jsonb_build_object('ok', false, 'reason', 'rate'); end if;
  return jsonb_build_object('ok', true, 'nick', (select p.nick from nostalgia.profiles p where p.key = k));
end
$fn$;

-- only the client API is callable, and only that
revoke all on all functions in schema nostalgia from public, anon, authenticated;
revoke all on function public.save_put(text, int, jsonb, int), public.save_get(text), public.journey_put(text, jsonb),
  public.journey_get(text), public.profile_set(text, text), public.profile_get(text) from public;
grant execute on function public.save_put(text, int, jsonb, int), public.save_get(text), public.journey_put(text, jsonb),
  public.journey_get(text), public.profile_set(text, text), public.profile_get(text) to anon;
-- No Supabase Auth is used yet, so signed-in users get nothing extra. When email / Google sign-in is added,
-- grant these to "authenticated" as well (or add user_id-keyed variants).
revoke execute on function public.save_put(text, int, jsonb, int), public.save_get(text), public.journey_put(text, jsonb),
  public.journey_get(text), public.profile_set(text, text), public.profile_get(text) from authenticated;
