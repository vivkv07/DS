-- NOSTALGIA online: abuse guard for the anonymous API (design/audit/online.md O-12, O-13; ARCHITECTURE §23).
-- Additive and safe to re-run: one new private table, one helper function replaced (same signature, same result for
-- every code that has been seen before), one race route's min_ms raised. No user data is changed or removed.
--
-- Why: a player code is only checked for its SHAPE, so anybody can make up fresh codes. The per-code limit (40 calls a
-- minute, nostalgia.allow) does nothing against a script that uses a new code for every call, and each new code may
-- store two 512 KB saves + a 32 KB journey. The Free plan's database goes read-only at 500 MB, which would stop cloud
-- saves for everybody. Now a code seen for the FIRST time is also checked against
--   * a global budget of new codes: 60 a minute (a busy evening of real new players is far below that), and
--   * the database size: no new codes once it passes 400 MB (players who already have a code carry on).
-- Refused calls answer {ok: false, reason: 'rate'} like the per-code limit (the game says "try again in a minute").
--
-- Tank Bund sprint: the route is 1.6 k u in a straight line; the fastest cycle (132 u/s) needs 12.2 s even flying
-- straight, so 8 s was not a real floor. 11 s (90% of the straight-line time) like the other routes' min_ms.

create table if not exists nostalgia.newkeys (
  win timestamptz primary key,   -- the minute (date_trunc)
  n   int         not null
);
alter table nostalgia.newkeys enable row level security;
revoke all on nostalgia.newkeys from public, anon, authenticated;

create or replace function nostalgia.allow(k bytea) returns boolean
language plpgsql set search_path = '' as $fn$
declare cur int; nk int; w timestamptz := date_trunc('minute', now());
begin
  -- a code seen for the first time: within the global budget for new codes, and only while the database has room
  if not exists (select 1 from nostalgia.rate r where r.key = k) then
    if pg_catalog.pg_database_size(pg_catalog.current_database()) > 400 * 1024 * 1024 then return false; end if;
    insert into nostalgia.newkeys as x (win, n) values (w, 1)
      on conflict (win) do update set n = x.n + 1
      returning x.n into nk;
    if nk > 60 then return false; end if;
    delete from nostalgia.newkeys x where x.win < w - interval '1 hour';
  end if;
  insert into nostalgia.rate as r (key, win, n) values (k, now(), 1)
  on conflict (key) do update set
    n   = case when r.win < now() - interval '1 minute' then 1 else r.n + 1 end,
    win = case when r.win < now() - interval '1 minute' then now() else r.win end
  returning r.n into cur;
  return cur <= 40;
end
$fn$;
revoke all on function nostalgia.allow(bytea) from public, anon, authenticated;

update nostalgia.race_routes set min_ms = 11000 where id = 'tank_bund' and min_ms < 11000;
