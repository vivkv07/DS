-- NOSTALGIA telemetry: anonymous play stats (design/analytics.md, ARCHITECTURE §25, src/telemetry.js).
-- Applied to project gralunajtfapqkpwulyg with the Supabase MCP tools (migration "nostalgia_telemetry"); safe to
-- re-run in the SQL editor ("if not exists" / "or replace"; the cron jobs are upserted by name).
--
-- Model
--   * The browser batches events and calls public.track_events(events jsonb) with the publishable key (the same way
--     it calls save_put). That function is the ONLY new thing anon may execute. It lives in "public" because that is
--     the schema the Data API serves (like save_put / race_put); everything it touches lives in the private schema
--     "nostalgia" (not exposed, RLS on, no policies).
--   * Rows: nostalgia.events (raw, kept 90 days or less: see nostalgia.prune), rolled up into nostalgia.daily_stats
--     (day, metric, dimension, value) and three small per-install tables (installs, install_days, install_steps) that
--     are kept for good. The owner reads them through views in schema nostalgia_admin (never exposed to the API).
--   * Nothing personal: a random install id, a random session id, optionally sha256(player code) (the same key the
--     cloud saves use, never the code), the build, a device class and flat props (scalars, no free text, no URLs, no
--     emails). The server sets ts; the client's own time is only a prop ("at": seconds since the session started).
--   * Days are India days (Asia/Kolkata), the players' and the owner's time zone.

create schema if not exists nostalgia;
revoke all on schema nostalgia from public, anon, authenticated;

-- ---------------------------------------------------------------- tables
create table if not exists nostalgia.events (
  id          bigserial   primary key,
  ts          timestamptz not null default now(),
  install     uuid        not null,
  session     uuid        not null,
  player_hash text        null check (player_hash ~ '^[0-9a-f]{64}$'),
  name        text        not null check (name ~ '^[a-z][a-z0-9_]{1,31}$'),
  props       jsonb       not null default '{}'::jsonb check (jsonb_typeof(props) = 'object'),
  build       text        check (char_length(build) <= 40),
  device      text        check (device in ('phone', 'tablet', 'desktop'))
);
-- time: BRIN (the table is append-only, so ts follows the physical order; the index is a few KB at any size)
create index if not exists events_ts_brin on nostalgia.events using brin (ts) with (pages_per_range = 32);
create index if not exists events_install_ts on nostalgia.events (install, ts);

create table if not exists nostalgia.daily_stats (
  day       date    not null,
  metric    text    not null,
  dimension text    not null default '',
  value     numeric not null,
  primary key (day, metric, dimension)
);
create table if not exists nostalgia.installs (
  install     uuid primary key,
  first_day   date not null,
  last_day    date not null,
  days        int  not null default 1,      -- distinct active days
  sessions    int  not null default 0,
  device      text,
  player_hash text,                          -- latest sha256(player code) seen, if the player went online
  first_build text,
  last_build  text,
  updated_at  timestamptz not null default now()
);
create table if not exists nostalgia.install_days (
  install  uuid not null,
  day      date not null,
  sessions int  not null default 0,
  act_s    int  not null default 0,          -- active seconds that day (heartbeats)
  primary key (install, day)
);
create index if not exists install_days_day on nostalgia.install_days (day);
create table if not exists nostalgia.install_steps (  -- the funnel: the first day each install reached a step
  install   uuid not null,
  step      text not null,
  first_day date not null,
  primary key (install, step)
);
create index if not exists install_steps_step on nostalgia.install_steps (step);

alter table nostalgia.events        enable row level security;
alter table nostalgia.daily_stats   enable row level security;
alter table nostalgia.installs      enable row level security;
alter table nostalgia.install_days  enable row level security;
alter table nostalgia.install_steps enable row level security;
revoke all on nostalgia.events, nostalgia.daily_stats, nostalgia.installs, nostalgia.install_days, nostalgia.install_steps
  from public, anon, authenticated;
revoke all on sequence nostalgia.events_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers (not callable by clients)
-- the existing limiter (nostalgia.allow, 40 / minute / key) with the limit as an argument; same table, same window
create or replace function nostalgia.allow_n(k bytea, lim int) returns boolean
language plpgsql set search_path = '' as $fn$
declare cur int;
begin
  insert into nostalgia.rate as r (key, win, n) values (k, now(), 1)
  on conflict (key) do update set
    n   = case when r.win < now() - interval '1 minute' then 1 else r.n + 1 end,
    win = case when r.win < now() - interval '1 minute' then now() else r.win end
  returning r.n into cur;
  return cur <= lim;
end
$fn$;

-- a jsonb number as numeric, anything else as null (rollups never fail on a bad prop)
create or replace function nostalgia.num(j jsonb) returns numeric
language sql immutable set search_path = '' as $fn$
  select case when pg_catalog.jsonb_typeof(j) = 'number' then (j #>> '{}')::numeric else null end
$fn$;

-- event props: a flat object of scalars, <= 24 keys, keys /^[a-z][a-z0-9_]{0,23}$/ ("at" is the server's),
-- strings <= 120 characters with no URL and no email, <= 2 KB in all
create or replace function nostalgia.tm_props_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $fn$
  select p is null or pg_catalog.jsonb_typeof(p) = 'null' or (
    pg_catalog.jsonb_typeof(p) = 'object'
    and pg_catalog.octet_length(p::text) <= 2048
    and (select count(*) from pg_catalog.jsonb_object_keys(p)) <= 24
    and not exists (
      select 1 from pg_catalog.jsonb_each(p) kv
      where kv.key !~ '^[a-z][a-z0-9_]{0,23}$'
         or kv.key = 'at'
         or pg_catalog.jsonb_typeof(kv.value) not in ('string', 'number', 'boolean', 'null')
         or (pg_catalog.jsonb_typeof(kv.value) = 'string'
             and (pg_catalog.char_length(kv.value #>> '{}') > 120
                  or (kv.value #>> '{}') ~* '[a-z][a-z0-9+.-]*://|[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}'))))
$fn$;

-- ---------------------------------------------------------------- client API (rpc)
-- track_events({v: 1, install: uuid, session: uuid, player: sha256 hex | null, build, device,
--               list: [{name, t (s since the session started), props: {...}}, ... <= 50]})
-- -> {ok: true, n (stored), skipped (invalid items dropped)} | {ok: false, reason: bad_shape | too_big | bad_version |
--    bad_install | bad_session | bad_player | bad_build | bad_device | empty | too_many | rate}
-- Rate: 12 calls / minute / install (the client sends about one a minute) and 3000 / minute in all (a cost ceiling
-- if somebody scripts it), in the shared limiter table nostalgia.rate under keys that cannot clash with player codes.
create or replace function public.track_events(events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  inst uuid; sess uuid; ph text; bld text; dev text; lst jsonb; tot int; n int;
begin
  if events is null or jsonb_typeof(events) <> 'object' then return jsonb_build_object('ok', false, 'reason', 'bad_shape'); end if;
  if octet_length(events::text) > 65536 then return jsonb_build_object('ok', false, 'reason', 'too_big'); end if;
  if events->'v' is distinct from '1'::jsonb then return jsonb_build_object('ok', false, 'reason', 'bad_version'); end if;
  if jsonb_typeof(events->'install') is distinct from 'string' or (events->>'install') !~ uuid_re then
    return jsonb_build_object('ok', false, 'reason', 'bad_install');
  end if;
  if jsonb_typeof(events->'session') is distinct from 'string' or (events->>'session') !~ uuid_re then
    return jsonb_build_object('ok', false, 'reason', 'bad_session');
  end if;
  if coalesce(jsonb_typeof(events->'player'), 'null') = 'null' then ph := null;
  elsif jsonb_typeof(events->'player') = 'string' and (events->>'player') ~ '^[0-9a-f]{64}$' then ph := events->>'player';
  else return jsonb_build_object('ok', false, 'reason', 'bad_player');
  end if;
  bld := events->>'build';
  if jsonb_typeof(events->'build') is distinct from 'string' or bld !~ '^[A-Za-z0-9._+-]{1,40}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_build');
  end if;
  dev := events->>'device';
  if jsonb_typeof(events->'device') is distinct from 'string' or dev not in ('phone', 'tablet', 'desktop') then
    return jsonb_build_object('ok', false, 'reason', 'bad_device');
  end if;
  lst := events->'list';
  if jsonb_typeof(lst) is distinct from 'array' then return jsonb_build_object('ok', false, 'reason', 'bad_shape'); end if;
  tot := jsonb_array_length(lst);
  if tot = 0 then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if tot > 50 then return jsonb_build_object('ok', false, 'reason', 'too_many'); end if;
  inst := (events->>'install')::uuid;
  sess := (events->>'session')::uuid;
  if not nostalgia.allow_n(pg_catalog.sha256(pg_catalog.convert_to('nostalgia.telemetry:' || inst::text, 'UTF8')), 12) then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;
  if not nostalgia.allow_n(pg_catalog.sha256(pg_catalog.convert_to('nostalgia.telemetry:*', 'UTF8')), 3000) then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;
  insert into nostalgia.events (install, session, player_hash, name, props, build, device)
  select inst, sess, ph, e->>'name',
         coalesce(case when jsonb_typeof(e->'props') = 'object' then e->'props' end, '{}'::jsonb)
           || case when nostalgia.num(e->'t') between 0 and 604800
                   then jsonb_build_object('at', round(nostalgia.num(e->'t'), 1)) else '{}'::jsonb end,
         bld, dev
    from jsonb_array_elements(lst) as x(e)
   where jsonb_typeof(e) = 'object'
     and jsonb_typeof(e->'name') = 'string' and (e->>'name') ~ '^[a-z][a-z0-9_]{1,31}$'
     and nostalgia.tm_props_ok(e->'props')
     and (e->'t' is null or jsonb_typeof(e->'t') in ('number', 'null'));
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'n', n, 'skipped', tot - n);
end
$fn$;

-- ---------------------------------------------------------------- rollups
-- rollup_day(d): recompute every metric of India day d from the raw events (idempotent; run it as often as you like).
-- Writes nostalgia.daily_stats (day d, plus the D1 / D7 / D30 retention of the cohorts 1, 7 and 30 days earlier) and
-- upserts installs / install_days / install_steps. Returns a small summary.
create or replace function nostalgia.rollup_day(d date) returns jsonb
language plpgsql set search_path = '' as $fn$
declare
  t0 timestamptz := (d::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((d + 1)::timestamp at time zone 'Asia/Kolkata');
  nev bigint; ndau bigint; k int;
begin
  drop table if exists pg_temp.tm_day;
  create temporary table tm_day on commit drop as
    select e.install, e.session, e.player_hash, e.name, e.props, e.build, e.device, e.ts
      from nostalgia.events e where e.ts >= t0 and e.ts < t1;
  select count(*), count(distinct install) into nev, ndau from pg_temp.tm_day;

  -- per install (kept after the raw events are pruned)
  insert into nostalgia.install_days as x (install, day, sessions, act_s)
  select t.install, d, count(distinct t.session),
         coalesce(round(sum(nostalgia.num(t.props->'act')) filter (where t.name = 'heartbeat')), 0)::int
    from pg_temp.tm_day t group by t.install
  on conflict (install, day) do update set sessions = excluded.sessions, act_s = excluded.act_s;

  insert into nostalgia.installs as i (install, first_day, last_day, days, sessions, device, player_hash, first_build, last_build)
  select t.install,
         -- the client also says how many days ago it first ran (session_start.days): an older install counts from then
         least(d, d - coalesce(max(nostalgia.num(t.props->'days')) filter (where t.name = 'session_start'
                                   and nostalgia.num(t.props->'days') between 0 and 3650), 0)::int),
         d, 1, 0, max(t.device), max(t.player_hash), min(t.build), max(t.build)
    from pg_temp.tm_day t group by t.install
  on conflict (install) do update set
    first_day   = least(i.first_day, excluded.first_day),
    last_day    = greatest(i.last_day, excluded.last_day),
    device      = coalesce(excluded.device, i.device),
    player_hash = coalesce(excluded.player_hash, i.player_hash),
    first_build = coalesce(i.first_build, excluded.first_build),
    last_build  = case when excluded.last_day >= i.last_day then excluded.last_build else i.last_build end,
    updated_at  = now();
  update nostalgia.installs i set days = s.days, sessions = s.sessions
    from (select x.install, count(*)::int as days, sum(x.sessions)::int as sessions
            from nostalgia.install_days x
           where x.install in (select distinct t.install from pg_temp.tm_day t)
           group by x.install) s
   where s.install = i.install;

  insert into nostalgia.install_steps as s (install, step, first_day)
  select distinct t.install, st.step, d
    from pg_temp.tm_day t
    cross join lateral (select case
        when t.name in ('title_shown', 'new_game', 'continue', 'intro_skipped', 'first_control') then t.name
        when t.name = 'ending' and t.props->>'phase' = 'start' then 'ending'
        when t.name = 'track_pass' and (t.props->>'track') ~ '^[0-9]{1,2}$' then 'track_' || lpad(t.props->>'track', 2, '0')
        when t.name = 'chapter' and (t.props->>'n') ~ '^[0-9]{1,2}$' then 'chapter_' || (t.props->>'n')
        when t.name in ('room_create', 'room_join') then 'online_room'
        when t.name = 'party_start' and t.props->>'mode' = 'party' then 'party_friends'
      end as step) st
   where st.step is not null
  on conflict (install, step) do update set first_day = least(s.first_day, excluded.first_day);

  -- the day's metrics, upserted (re-running a day only ever raises its counts; the session-length buckets are all
  -- written every time, so a session moving up a bucket leaves no stale count behind)
  insert into nostalgia.daily_stats as s (day, metric, dimension, value)
  select d, m.metric, coalesce(m.dimension, ''), m.value from (
    select 'events' as metric, '' as dimension, nev::numeric as value
    union all select 'dau', '', ndau
    union all select 'sessions', '', count(distinct t.session) from pg_temp.tm_day t
    union all select 'new_installs', '', count(*) from nostalgia.installs i
               where i.first_day = d and i.install in (select t.install from pg_temp.tm_day t)
    union all select 'returning_installs', '', ndau - (select count(*) from nostalgia.installs i
               where i.first_day = d and i.install in (select t.install from pg_temp.tm_day t))
    union all select 'wau', '', count(distinct x.install) from nostalgia.install_days x where x.day between d - 6 and d
    union all select 'mau', '', count(distinct x.install) from nostalgia.install_days x where x.day between d - 29 and d
    union all select 'dau_device', t.device, count(distinct t.install) from pg_temp.tm_day t group by t.device
    union all select 'dau_3d', '', count(distinct t.install) from pg_temp.tm_day t
               where t.name = 'heartbeat' and nostalgia.num(t.props->'v3d') > 0
    union all select 'dau_online', '', count(distinct t.install) from pg_temp.tm_day t where t.name in ('room_create', 'room_join')
    union all select h.metric, '', coalesce(sum(nostalgia.num(t.props->h.k)), 0)
                from pg_temp.tm_day t, (values ('act_s', 'act'), ('play_s', 'play'), ('idle_s', 'idle'), ('menu_s', 'menu'),
                                               ('v2d_s', 'v2d'), ('v3d_s', 'v3d')) h(metric, k)
               where t.name = 'heartbeat' group by h.metric
    union all select 'fps', t.props->>'fps', count(*) from pg_temp.tm_day t
               where t.name = 'heartbeat' and jsonb_typeof(t.props->'fps') = 'string' group by t.props->>'fps'
    union all select 'session_len', bk.bucket, coalesce(c.n, 0)
                from (values ('0-1m'), ('1-5m'), ('5-15m'), ('15-30m'), ('30-60m'), ('60m+')) bk(bucket)
                left join (select b.bucket, count(*) as n from (
                  select case when a < 60 then '0-1m' when a < 300 then '1-5m' when a < 900 then '5-15m'
                              when a < 1800 then '15-30m' when a < 3600 then '30-60m' else '60m+' end as bucket
                    from (select t.session, coalesce(sum(nostalgia.num(t.props->'act')) filter (where t.name = 'heartbeat'), 0) as a
                            from pg_temp.tm_day t group by t.session) q) b group by b.bucket) c on c.bucket = bk.bucket
    union all select 'funnel', t.name, count(distinct t.install) from pg_temp.tm_day t
               where t.name in ('title_shown', 'new_game', 'continue', 'intro_skipped', 'first_control') group by t.name
    union all select 'funnel', 'ending', count(distinct t.install) from pg_temp.tm_day t where t.name = 'ending' and t.props->>'phase' = 'start'
    union all select 'funnel', 'ending_done', count(distinct t.install) from pg_temp.tm_day t where t.name = 'ending' and t.props->>'phase' = 'end'
    union all select 'chapter', t.props->>'n', count(distinct t.install) from pg_temp.tm_day t
               where t.name = 'chapter' and (t.props->>'n') ~ '^[0-9]{1,2}$' group by t.props->>'n'
    -- story tracks (main missions): counts per mission id
    union all select t.name, t.props->>'id', count(*) from pg_temp.tm_day t
               where t.name in ('track_start', 'track_pass', 'track_fail', 'track_abort') and (t.props->>'id') ~ '^[a-z0-9_]{1,40}$'
               group by t.name, t.props->>'id'
    union all select 'track_pass_attempts', t.props->>'id', coalesce(sum(nostalgia.num(t.props->'attempt')), 0) from pg_temp.tm_day t
               where t.name = 'track_pass' and (t.props->>'id') ~ '^[a-z0-9_]{1,40}$' group by t.props->>'id'
    union all select 'track_pass_players', t.props->>'id', count(distinct t.install) from pg_temp.tm_day t
               where t.name = 'track_pass' and (t.props->>'id') ~ '^[a-z0-9_]{1,40}$' group by t.props->>'id'
    union all select 'track_pass_dur_s', t.props->>'id', coalesce(sum(nostalgia.num(t.props->'dur')), 0) from pg_temp.tm_day t
               where t.name = 'track_pass' and (t.props->>'id') ~ '^[a-z0-9_]{1,40}$' group by t.props->>'id'
    -- activities: side missions, minigames, party games; dimension 'kind:id:solo|friends'
    union all select a.metric, a.dim, a.value from (
      select v.metric, act.kind || ':' || act.id || ':' || case when act.grp > 1 then 'friends' else 'solo' end as dim,
             case v.metric when 'act_plays' then count(*)::numeric
                           when 'act_wins' then count(*) filter (where act.won)::numeric
                           when 'act_dur_s' then coalesce(sum(act.dur), 0)
                           when 'act_group' then coalesce(sum(act.grp), 0)
                           when 'act_players' then count(distinct act.install)::numeric end as value
        from (select t.install,
                     case t.name when 'mg_end' then 'mg' when 'side_end' then 'side' else 'party' end as kind,
                     t.props->>'id' as id,
                     greatest(coalesce(nostalgia.num(t.props->'humans'), 0), coalesce(nostalgia.num(t.props->'room'), 0), 1) as grp,
                     nostalgia.num(t.props->'dur') as dur,
                     (t.props->'win' = 'true'::jsonb or t.props->'place' = '1'::jsonb or t.props->>'result' = 'pass') as won
                from pg_temp.tm_day t
               where t.name in ('mg_end', 'side_end', 'party_end') and (t.props->>'id') ~ '^[a-z0-9_]{1,40}$') act
        cross join (values ('act_plays'), ('act_wins'), ('act_dur_s'), ('act_group'), ('act_players')) v(metric)
       group by v.metric, act.kind, act.id, act.grp > 1) a
    -- online
    union all select t.name, '', count(*) from pg_temp.tm_day t
               where t.name in ('room_create', 'room_join', 'room_leave', 'party_challenge', 'online_start') group by t.name
    union all select 'cloud_save', case when t.props->'ok' = 'false'::jsonb then 'refused' else 'ok' end, count(*) from pg_temp.tm_day t
               where t.name = 'cloud_save' group by 2
    union all select 'room_join_size', (nostalgia.num(t.props->'size'))::int::text, count(*) from pg_temp.tm_day t
               where t.name = 'room_join' and nostalgia.num(t.props->'size') between 1 and 10 group by 2
    union all select 'room_peak', (nostalgia.num(t.props->'peak'))::int::text, count(*) from pg_temp.tm_day t
               where t.name = 'room_leave' and nostalgia.num(t.props->'peak') between 1 and 10 group by 2
    union all select 'room_minutes', '', coalesce(round(sum(nostalgia.num(t.props->'dur')) / 60.0, 1), 0) from pg_temp.tm_day t where t.name = 'room_leave'
    -- errors, performance, settings
    union all select 'errors', coalesce(t.props->>'src', '?'), coalesce(sum(nostalgia.num(t.props->'n')), 0) from pg_temp.tm_day t
               where t.name = 'error' group by 2
    union all select 'error_installs', '', count(distinct t.install) from pg_temp.tm_day t where t.name = 'error'
    union all select 'perf_boot', coalesce(t.props->>'b', '?'), count(*) from pg_temp.tm_day t where t.name = 'perf_boot' group by 2
    union all select 'perf_3d', case when t.props->'ok' = 'false'::jsonb then 'failed' else coalesce(t.props->>'b', '?') end, count(*)
                from pg_temp.tm_day t where t.name = 'perf_3d' group by 2
    union all select 'setting', (t.props->>'key') || '=' || (t.props->>'value'), count(distinct t.install) from pg_temp.tm_day t
               where t.name = 'setting' and t.props ? 'key' group by 2
    union all select 'settings', kv.key || '=' || (kv.value #>> '{}'), count(distinct t.install)
                from pg_temp.tm_day t cross join lateral jsonb_each(t.props) kv
               where t.name = 'settings' and kv.key <> 'at' and jsonb_typeof(kv.value) in ('string', 'number', 'boolean') group by 2
    union all select 'session_start', kv.key || '=' || (kv.value #>> '{}'), count(distinct t.install)
                from pg_temp.tm_day t cross join lateral jsonb_each(t.props) kv
               where t.name = 'session_start' and kv.key in ('touch', 'scr', 'dpr', 'lang', 'tz', 'ref', 'conn', 'pwa', 'view', 'online')
                 and jsonb_typeof(kv.value) in ('string', 'number', 'boolean') group by 2
    union all select 'build', coalesce(t.build, '?'), count(distinct t.install) from pg_temp.tm_day t group by 2
  ) m where m.value is not null
  on conflict (day, metric, dimension) do update set value = excluded.value;

  -- retention: of the installs first seen k days before d, how many came back on d
  foreach k in array array[1, 7, 30] loop
    insert into nostalgia.daily_stats as s (day, metric, dimension, value)
    select d - k, 'ret_d' || k, '', count(*) from nostalgia.installs i
     where i.first_day = d - k and exists (select 1 from nostalgia.install_days x where x.install = i.install and x.day = d)
    on conflict (day, metric, dimension) do update set value = excluded.value;
  end loop;

  return jsonb_build_object('day', d, 'events', nev, 'dau', ndau);
end
$fn$;

-- nightly(): finish yesterday (India time), then prune. pg_cron runs it at 00:23 IST; the hourly job keeps today fresh.
create or replace function nostalgia.nightly() returns jsonb
language plpgsql set search_path = '' as $fn$
declare y date := (now() at time zone 'Asia/Kolkata')::date - 1; a jsonb; b jsonb;
begin
  a := nostalgia.rollup_day(y);
  -- prune is the one part that deletes (old raw events): installed separately, see the end of this file
  if to_regprocedure('nostalgia.prune(integer,bigint)') is not null then execute 'select nostalgia.prune()' into b;
  else b := jsonb_build_object('skipped', 'nostalgia.prune is not installed yet'); end if;
  return jsonb_build_object('rollup', a, 'prune', b);
end
$fn$;

revoke all on function nostalgia.allow_n(bytea, int), nostalgia.num(jsonb), nostalgia.tm_props_ok(jsonb),
  nostalgia.rollup_day(date), nostalgia.nightly() from public, anon, authenticated;
revoke all on function public.track_events(jsonb) from public;
grant execute on function public.track_events(jsonb) to anon;
-- as with save_put: no Supabase Auth yet, so "authenticated" gets nothing; grant it when Google sign-in lands
revoke execute on function public.track_events(jsonb) from authenticated;

-- ---------------------------------------------------------------- schedule (pg_cron, when the project allows it)
do $do$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron is not available (%): run select nostalgia.nightly(); once a day by hand', sqlerrm;
    return;
  end;
  begin
    execute 'grant usage on schema cron to postgres';
    execute 'grant all privileges on all tables in schema cron to postgres';
  exception when others then raise notice 'cron grants skipped: %', sqlerrm;
  end;
  -- every hour at :17, today so far (India day); every night at 18:53 UTC = 00:23 IST, yesterday + prune
  perform cron.schedule('nostalgia_rollup_hourly', '17 * * * *',
    $$select nostalgia.rollup_day((now() at time zone 'Asia/Kolkata')::date)$$);
  perform cron.schedule('nostalgia_nightly', '53 18 * * *', $$select nostalgia.nightly()$$);
end
$do$;

-- ---------------------------------------------------------------- owner views (schema nostalgia_admin: not in the API)
-- Read them in the Supabase dashboard → SQL editor (the postgres role). anon / authenticated have no access: the
-- schema is not exposed, usage is revoked, and the views are security_invoker (a caller needs the tables' rights too).
create schema if not exists nostalgia_admin;
revoke all on schema nostalgia_admin from public, anon, authenticated;

-- one row per India day: DAU / WAU / MAU, new vs returning installs, sessions, active hours, 3D share, online players
create or replace view nostalgia_admin.daily with (security_invoker = true) as
select s.day,
       max(s.value) filter (where s.metric = 'dau')                as dau,
       max(s.value) filter (where s.metric = 'wau')                as wau,
       max(s.value) filter (where s.metric = 'mau')                as mau,
       max(s.value) filter (where s.metric = 'new_installs')       as new_installs,
       max(s.value) filter (where s.metric = 'returning_installs') as returning_installs,
       max(s.value) filter (where s.metric = 'sessions')           as sessions,
       round(max(s.value) filter (where s.metric = 'act_s') / 3600.0, 1) as active_hours,
       round(max(s.value) filter (where s.metric = 'act_s') / nullif(max(s.value) filter (where s.metric = 'sessions'), 0) / 60.0, 1) as avg_session_min,
       round(100.0 * max(s.value) filter (where s.metric = 'dau_3d') / nullif(max(s.value) filter (where s.metric = 'dau'), 0), 1) as pct_3d,
       max(s.value) filter (where s.metric = 'dau_online')         as online_players,
       max(s.value) filter (where s.metric = 'error_installs')     as players_with_errors,
       max(s.value) filter (where s.metric = 'events')             as events
  from nostalgia.daily_stats s
 group by s.day
having max(s.value) filter (where s.metric = 'dau') is not null
 order by s.day desc;

-- D1 / D7 / D30: of the installs first seen on a day, how many came back exactly 1, 7, 30 days later (null = not yet)
create or replace view nostalgia_admin.retention with (security_invoker = true) as
with today as (select (now() at time zone 'Asia/Kolkata')::date as d)
select i.first_day as cohort, count(*) as installs,
       case when i.first_day + 1 <= (select d from today) then count(*) filter (where exists (select 1 from nostalgia.install_days x where x.install = i.install and x.day = i.first_day + 1)) end as d1,
       case when i.first_day + 7 <= (select d from today) then count(*) filter (where exists (select 1 from nostalgia.install_days x where x.install = i.install and x.day = i.first_day + 7)) end as d7,
       case when i.first_day + 30 <= (select d from today) then count(*) filter (where exists (select 1 from nostalgia.install_days x where x.install = i.install and x.day = i.first_day + 30)) end as d30,
       round(100.0 * count(*) filter (where exists (select 1 from nostalgia.install_days x where x.install = i.install and x.day = i.first_day + 1)) / count(*), 1) as d1_pct,
       round(100.0 * count(*) filter (where exists (select 1 from nostalgia.install_days x where x.install = i.install and x.day = i.first_day + 7)) / count(*), 1) as d7_pct,
       round(100.0 * count(*) filter (where exists (select 1 from nostalgia.install_days x where x.install = i.install and x.day = i.first_day + 30)) / count(*), 1) as d30_pct
  from nostalgia.installs i
 group by i.first_day
 order by i.first_day desc;

-- the story funnel, all installs ever: title → new game → first control → tracks 1..12 passed → ending
create or replace view nostalgia_admin.funnel with (security_invoker = true) as
with steps(ord, step, label) as (values
  (1, 'title_shown', 'Saw the title screen'), (2, 'new_game', 'Started a new game'), (3, 'first_control', 'Moved / pressed a key in play'),
  (4, 'track_01', 'Track 1 passed: Bo Kaata!'), (5, 'track_02', 'Track 2 passed: Lost and Found'), (6, 'track_03', 'Track 3 passed: First Day, First Show'),
  (7, 'track_04', 'Track 4 passed: Last Man Batting'), (8, 'track_05', 'Track 5 passed: Right, Right!'), (9, 'track_06', 'Track 6 passed: Ammamma''s Thursday'),
  (10, 'track_07', 'Track 7 passed: The Clap'), (11, 'track_08', 'Track 8 passed: Drums for Amma'), (12, 'track_09', 'Track 9 passed: Opening Day'),
  (13, 'track_10', 'Track 10 passed: Agle Baras Jaldi Aana'), (14, 'track_11', 'Track 11 passed: Last Bell'), (15, 'track_12', 'Track 12 passed: Chand Raat'),
  (16, 'ending', 'Reached the ending')),
c as (select s.ord, s.step, s.label, count(f.install) as installs
        from steps s left join nostalgia.install_steps f on f.step = s.step group by s.ord, s.step, s.label)
select c.ord, c.step, c.label, c.installs,
       round(100.0 * c.installs / nullif(first_value(c.installs) over (order by c.ord), 0), 1) as pct_of_title,
       round(100.0 * c.installs / nullif(lag(c.installs) over (order by c.ord), 0), 1) as pct_of_prev
  from c order by c.ord;

-- per main mission: starts, passes, fails, quits, pass rate, attempts at the pass, minutes to pass, players who passed
create or replace view nostalgia_admin.tracks with (security_invoker = true) as
with t(id, track) as (values ('bo_kaata', 1), ('lost_and_found', 2), ('first_day_first_show', 3), ('last_man_batting', 4), ('right_right', 5),
  ('ammammas_thursday', 6), ('the_clap', 7), ('drums_for_amma', 8), ('opening_day', 9), ('agle_baras', 10), ('last_bell', 11), ('chand_raat', 12)),
a as (select s.dimension as id,
             sum(s.value) filter (where s.metric = 'track_start') as starts,
             sum(s.value) filter (where s.metric = 'track_pass')  as passes,
             sum(s.value) filter (where s.metric = 'track_fail')  as fails,
             sum(s.value) filter (where s.metric = 'track_abort') as quits,
             sum(s.value) filter (where s.metric = 'track_pass_attempts') as att,
             sum(s.value) filter (where s.metric = 'track_pass_dur_s') as dur,
             sum(s.value) filter (where s.metric = 'track_pass_players') as players
        from nostalgia.daily_stats s
       where s.metric in ('track_start', 'track_pass', 'track_fail', 'track_abort', 'track_pass_attempts', 'track_pass_dur_s', 'track_pass_players')
       group by s.dimension)
select t.track, a.id, coalesce(a.starts, 0) as starts, coalesce(a.passes, 0) as passes, coalesce(a.fails, 0) as fails, coalesce(a.quits, 0) as quits,
       round(100.0 * a.passes / nullif(coalesce(a.passes, 0) + coalesce(a.fails, 0), 0), 1) as pass_rate,
       round(a.att / nullif(a.passes, 0), 2) as avg_attempt_at_pass,
       round(a.dur / nullif(a.passes, 0) / 60.0, 1) as avg_minutes_to_pass,
       coalesce(a.players, 0) as players_passed
  from a left join t on t.id = a.id
 order by t.track nulls last, a.id;

-- side missions, minigames and party games: solo vs with friends (kind = mg | side | party)
create or replace view nostalgia_admin.activities with (security_invoker = true) as
select split_part(s.dimension, ':', 1) as kind, split_part(s.dimension, ':', 2) as id, split_part(s.dimension, ':', 3) as played,
       sum(s.value) filter (where s.metric = 'act_plays') as plays,
       sum(s.value) filter (where s.metric = 'act_wins') as wins,
       round(100.0 * sum(s.value) filter (where s.metric = 'act_wins') / nullif(sum(s.value) filter (where s.metric = 'act_plays'), 0), 1) as win_pct,
       round(sum(s.value) filter (where s.metric = 'act_dur_s') / nullif(sum(s.value) filter (where s.metric = 'act_plays'), 0) / 60.0, 1) as avg_minutes,
       round(sum(s.value) filter (where s.metric = 'act_group') / nullif(sum(s.value) filter (where s.metric = 'act_plays'), 0), 2) as avg_group,
       max(s.day) as last_played
  from nostalgia.daily_stats s
 where s.metric in ('act_plays', 'act_wins', 'act_dur_s', 'act_group') and s.day >= (now() at time zone 'Asia/Kolkata')::date - 30
 group by 1, 2, 3
 order by plays desc nulls last;

-- online rooms per day: rooms made, joins, group sizes, party challenges, cloud saves
create or replace view nostalgia_admin.online with (security_invoker = true) as
select s.day,
       max(s.value) filter (where s.metric = 'dau_online') as online_players,
       max(s.value) filter (where s.metric = 'room_create') as rooms_created,
       max(s.value) filter (where s.metric = 'room_join') as joins,
       round(sum(s.value * case when s.dimension ~ '^[0-9]{1,2}$' then s.dimension::numeric end) filter (where s.metric = 'room_peak')
             / nullif(sum(s.value) filter (where s.metric = 'room_peak'), 0), 2) as avg_room_size,
       sum(s.value) filter (where s.metric = 'room_peak' and s.dimension = '1') as rooms_alone,
       sum(s.value) filter (where s.metric = 'room_peak' and s.dimension = '2') as rooms_of_2,
       sum(s.value) filter (where s.metric = 'room_peak' and s.dimension ~ '^([3-9]|10)$') as rooms_of_3_plus,
       max(s.value) filter (where s.metric = 'room_minutes') as room_minutes,
       max(s.value) filter (where s.metric = 'party_challenge') as party_challenges,
       sum(s.value) filter (where s.metric = 'cloud_save') as cloud_saves
  from nostalgia.daily_stats s
 where s.metric in ('dau_online', 'room_create', 'room_join', 'room_peak', 'room_minutes', 'party_challenge', 'cloud_save')
 group by s.day
 order by s.day desc;

-- device / 3D split per day (share of the day's players)
create or replace view nostalgia_admin.devices with (security_invoker = true) as
select s.day, s.dimension as device, s.value as players,
       round(100.0 * s.value / nullif(d.value, 0), 1) as pct,
       (select x.value from nostalgia.daily_stats x where x.day = s.day and x.metric = 'dau_3d' and x.dimension = '') as played_3d_all_devices
  from nostalgia.daily_stats s
  join nostalgia.daily_stats d on d.day = s.day and d.metric = 'dau' and d.dimension = ''
 where s.metric = 'dau_device'
 order by s.day desc, s.value desc;

-- errors, last 30 days by source (counts from the rollups) + the latest cleaned message from the last 7 days of raw events
create or replace view nostalgia_admin.errors_top with (security_invoker = true) as
with r as (select s.dimension as src, sum(s.value) as errors, count(distinct s.day) as days, max(s.day) as last_day
             from nostalgia.daily_stats s
            where s.metric = 'errors' and s.day >= (now() at time zone 'Asia/Kolkata')::date - 30
            group by s.dimension),
m as (select e.props->>'src' as src, count(distinct e.install) as players_7d,
             (array_agg(e.props->>'msg' order by e.ts desc))[1] as sample_message
        from nostalgia.events e
       where e.name = 'error' and e.ts > now() - interval '7 days'
       group by e.props->>'src')
select r.src, r.errors, r.days, r.last_day, m.players_7d, m.sample_message
  from r left join m on m.src = r.src
 order by r.errors desc;

-- how long sessions last (active time), last 30 days
create or replace view nostalgia_admin.session_lengths with (security_invoker = true) as
select s.dimension as length, sum(s.value) as sessions,
       round(100.0 * sum(s.value) / nullif(sum(sum(s.value)) over (), 0), 1) as pct
  from nostalgia.daily_stats s
 where s.metric = 'session_len' and s.day >= (now() at time zone 'Asia/Kolkata')::date - 30
 group by s.dimension
 order by case s.dimension when '0-1m' then 1 when '1-5m' then 2 when '5-15m' then 3 when '15-30m' then 4 when '30-60m' then 5 else 6 end;

-- right now (raw events of today, India time; no rollup needed)
create or replace view nostalgia_admin.today with (security_invoker = true) as
select count(distinct e.install) as players, count(distinct e.session) as sessions, count(*) as events,
       count(distinct e.install) filter (where e.ts > now() - interval '15 minutes') as playing_last_15_min,
       round(coalesce(sum(nostalgia.num(e.props->'act')) filter (where e.name = 'heartbeat'), 0) / 3600.0, 1) as active_hours,
       max(e.ts) as last_event
  from nostalgia.events e
 where e.ts >= (((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata');

-- the last hour of raw events (debugging a build)
create or replace view nostalgia_admin.recent with (security_invoker = true) as
select e.ts, e.name, e.device, e.build, left(e.install::text, 8) as install, e.props
  from nostalgia.events e
 where e.ts > now() - interval '1 hour'
 order by e.ts desc
 limit 300;

revoke all on all tables in schema nostalgia_admin from public, anon, authenticated;

-- ---------------------------------------------------------------- retention: prune (the only part that deletes rows)
-- Kept as its own block because it deletes data: the Supabase tools ask the owner to confirm destructive statements,
-- so on gralunajtfapqkpwulyg this block is applied by the owner (SQL editor, or approving the prompt). Until it is,
-- nightly() skips the prune and raw events simply stay (a few MB a month at beta scale).
-- prune(keep_days, max_rows): delete raw events older than keep_days (90), and more when the table would hold over
-- max_rows (~1.5 M rows ≈ 450 MB with indexes would crowd the Free plan's 500 MB; the default 1,000,000 rows keeps
-- it near 300 MB), always keeping the last 7 days. Rollups are untouched, so nothing is lost from the views.
-- Also clears stale rate-limit windows and old pg_cron run logs.
create or replace function nostalgia.prune(keep_days int default 90, max_rows bigint default 1000000) returns jsonb
language plpgsql set search_path = '' as $fn$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  cut date := today - greatest(keep_days, 7); budget date; nd int; n bigint; nr bigint; dd date; rolled int := 0;
begin
  -- the row budget, from the rolled-up daily counts (newest days first)
  select count(*) into nd from nostalgia.daily_stats s where s.metric = 'events' and s.dimension = '';
  if nd > 0 then
    select min(q.day) into budget from (
      select s.day, sum(s.value) over (order by s.day desc) as cum
        from nostalgia.daily_stats s where s.metric = 'events' and s.dimension = '') q
     where q.cum <= max_rows;
    budget := coalesce(budget, today - 7);
    if budget > cut then cut := least(budget, today - 7); end if;
  end if;
  -- never drop a day that was not rolled up yet (cron started late, or it is run by hand): roll it up first
  for dd in select distinct (e.ts at time zone 'Asia/Kolkata')::date from nostalgia.events e
             where e.ts < (cut::timestamp at time zone 'Asia/Kolkata') loop
    if not exists (select 1 from nostalgia.daily_stats s where s.day = dd and s.metric = 'events' and s.dimension = '') then
      perform nostalgia.rollup_day(dd); rolled := rolled + 1;
    end if;
  end loop;
  delete from nostalgia.events e where e.ts < (cut::timestamp at time zone 'Asia/Kolkata');
  get diagnostics n = row_count;
  delete from nostalgia.rate r where r.win < now() - interval '1 day';
  get diagnostics nr = row_count;
  begin
    execute 'delete from cron.job_run_details where end_time < now() - interval ''14 days'''
         || ' and jobid in (select jobid from cron.job where jobname like ''nostalgia_%'')';
  exception when others then null; -- no pg_cron here
  end;
  return jsonb_build_object('kept_from', cut, 'deleted', n, 'rolled_up_first', rolled, 'rate_rows', nr);
end
$fn$;
revoke all on function nostalgia.prune(int, bigint) from public, anon, authenticated;
