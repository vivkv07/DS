-- NOSTALGIA party races (ARCHITECTURE §24, src/party_races.js): personal bests and route leaderboards, keyed by
-- sha256(player code) like the rest of §23 (supabase/migrations/20261019000000_online.sql: schema "nostalgia",
-- nostalgia.key_of(), nostalgia.allow() (40 calls / minute / code), nostalgia.profiles for the nickname).
-- Applied to project gralunajtfapqkpwulyg with the Supabase MCP tools; safe to re-run ("if not exists" / "or replace").
--
--   race_put(code, route, ms, vehicle) -> {ok, reason?: bad_code|rate|bad_route|bad_time|too_fast|bad_vehicle,
--                                          best, improved, runs, rank, top: [{nick, ms, me}]}
--   race_top(code, route)              -> {ok, reason?, best | null, rank | null, top: [{nick, ms, me}]}
-- Only routes listed in nostalgia.race_routes are accepted; a time below the route's min_ms (faster than a cycle can go
-- even with every shortcut) is refused as too_fast. Nicknames come from nostalgia.profiles (server-checked), never
-- from the call. Kid-friendly: no free text, nothing personal: a hashed code, a route id, a time and a cycle type.

create table if not exists nostalgia.race_routes (
  id     text primary key check (id ~ '^[a-z][a-z0-9_]{2,31}$'),
  name   text not null check (char_length(name) between 3 and 60),
  min_ms int  not null check (min_ms between 1000 and 3600000)
);
create table if not exists nostalgia.race_times (
  key        bytea       not null,                                        -- sha256(player code)
  route      text        not null references nostalgia.race_routes (id) on delete cascade,
  best_ms    int         not null check (best_ms between 1000 and 3600000),
  runs       int         not null default 1 check (runs >= 1),
  vehicle    text        check (vehicle is null or vehicle ~ '^[a-z][a-z0-9_]{1,23}$'),
  updated_at timestamptz not null default now(),
  primary key (key, route)
);
create index if not exists race_times_route_best on nostalgia.race_times (route, best_ms);
alter table nostalgia.race_routes enable row level security;
alter table nostalgia.race_times  enable row level security;
revoke all on nostalgia.race_routes, nostalgia.race_times from public, anon, authenticated;

insert into nostalgia.race_routes (id, name, min_ms) values
  ('tank_bund',       'Tank Bund sprint',                     8000),
  ('koti_charminar',  'Koti to Charminar',                   16000),
  ('necklace_loop',   'Necklace Road loop',                  30000),
  ('rtc_narayanguda', 'RTC X Roads to Narayanguda',           7000),
  ('golconda_tombs',  'Golconda gate to the Qutb Shahi tombs', 9000),
  ('birla_steps',     'Birla Mandir steps race',              5000),
  ('chai_run',        'The chai run',                         8000)
on conflict (id) do update set name = excluded.name, min_ms = excluded.min_ms;

-- the route's top 10 (+ whether a row is the caller's) as jsonb
create or replace function nostalgia.race_board(r text, k bytea) returns jsonb
language sql stable set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('nick', coalesce(p.nick, 'Player'), 'ms', t.best_ms, 'me', t.key = k) order by t.best_ms, t.updated_at), '[]'::jsonb)
  from (select x.key, x.best_ms, x.updated_at from nostalgia.race_times x where x.route = r order by x.best_ms, x.updated_at limit 10) t
  left join nostalgia.profiles p on p.key = t.key
$fn$;

-- race_put: record a finish; keeps the best time per code and route
create or replace function public.race_put(code text, route text, ms int, vehicle text default null) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare k bytea := nostalgia.key_of(code); rr nostalgia.race_routes; prev nostalgia.race_times; best int; better boolean := false; rk int; n int;
begin
  if k is null then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
  if not nostalgia.allow(k) then return jsonb_build_object('ok', false, 'reason', 'rate'); end if;
  if route is null or octet_length(route) > 32 then return jsonb_build_object('ok', false, 'reason', 'bad_route'); end if;
  select * into rr from nostalgia.race_routes x where x.id = race_put.route;
  if not found then return jsonb_build_object('ok', false, 'reason', 'bad_route'); end if;
  if ms is null or ms not between 1000 and 3600000 then return jsonb_build_object('ok', false, 'reason', 'bad_time'); end if;
  if ms < rr.min_ms then return jsonb_build_object('ok', false, 'reason', 'too_fast'); end if;
  if vehicle is not null and (octet_length(vehicle) > 24 or vehicle !~ '^[a-z][a-z0-9_]{1,23}$') then
    return jsonb_build_object('ok', false, 'reason', 'bad_vehicle');
  end if;
  select * into prev from nostalgia.race_times t where t.key = k and t.route = race_put.route for update;
  if found then
    better := ms < prev.best_ms;
    update nostalgia.race_times t set
      best_ms = least(prev.best_ms, race_put.ms), runs = least(prev.runs + 1, 1000000),
      vehicle = case when race_put.ms < prev.best_ms then race_put.vehicle else prev.vehicle end,
      updated_at = case when race_put.ms < prev.best_ms then now() else prev.updated_at end
      where t.key = k and t.route = race_put.route;
    best := least(prev.best_ms, ms); n := least(prev.runs + 1, 1000000);
  else
    insert into nostalgia.race_times (key, route, best_ms, runs, vehicle) values (k, race_put.route, ms, 1, race_put.vehicle);
    better := true; best := ms; n := 1;
  end if;
  select 1 + count(*) into rk from nostalgia.race_times t where t.route = race_put.route and t.best_ms < best;
  return jsonb_build_object('ok', true, 'best', best, 'improved', better, 'runs', n, 'rank', rk, 'top', nostalgia.race_board(race_put.route, k));
end
$fn$;

-- race_top: a route's top 10 and the caller's best + rank
create or replace function public.race_top(code text, route text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare k bytea := nostalgia.key_of(code); mine int; rk int;
begin
  if k is null then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
  if not nostalgia.allow(k) then return jsonb_build_object('ok', false, 'reason', 'rate'); end if;
  if route is null or octet_length(route) > 32 or not exists (select 1 from nostalgia.race_routes x where x.id = race_top.route) then
    return jsonb_build_object('ok', false, 'reason', 'bad_route');
  end if;
  select t.best_ms into mine from nostalgia.race_times t where t.key = k and t.route = race_top.route;
  if mine is not null then select 1 + count(*) into rk from nostalgia.race_times t where t.route = race_top.route and t.best_ms < mine; end if;
  return jsonb_build_object('ok', true, 'best', mine, 'rank', rk, 'top', nostalgia.race_board(race_top.route, k));
end
$fn$;

-- only the two client calls are callable, by anon only (like the §23 functions)
revoke all on function nostalgia.race_board(text, bytea) from public, anon, authenticated;
revoke all on function public.race_put(text, text, int, text), public.race_top(text, text) from public;
grant execute on function public.race_put(text, text, int, text), public.race_top(text, text) to anon;
revoke execute on function public.race_put(text, text, int, text), public.race_top(text, text) from authenticated;
