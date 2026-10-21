# NOSTALGIA play stats: who plays, how far they get, what breaks

*2026-10-21. Code: `src/telemetry.js` (`N.telemetry`), `supabase/migrations/20261021000000_telemetry.sql`.
Contract: ARCHITECTURE.md §25. Tests: `node nostalgia/tests/telemetry.cjs`.*

The owner's ask: *"How can we, the game owners, get to know the information of users playing? … understand the
adoption metrics … eventually Google sign-in … for the beta we don't need it, but make sure we have all the metrics
stored somewhere, and it should not be super expensive."*

The answer: the web game sends **anonymous play stats** to the same Supabase project as online play
(gralunajtfapqkpwulyg). There is no account and no SDK. A batch of small events goes out about once a minute while
someone is playing. The database rolls them up every hour into daily numbers, and you read those with ready-made
views in the Supabase SQL editor.

## What you need to do

1. **Approve the clean-up block (one time).** Everything is live except one function, `nostalgia.prune`, which
   deletes raw events after 90 days (or sooner if the table gets big). The Supabase tools ask a person to confirm
   anything that deletes rows, so it is waiting for you. Paste this into **Dashboard → SQL editor** and run it:
   the last block of `supabase/migrations/20261021000000_telemetry.sql` (the one headed
   `retention: prune (the only part that deletes rows)`, down to the end of the file), then:
   ```sql
   drop function if exists nostalgia.zz_probe();   -- a harmless test function left behind while setting this up
   ```
   Until then nothing breaks: the nightly job skips the prune, and raw events simply stay. At beta scale that is a few
   MB a month.
2. **Deploy as usual** (`nostalgia/tools/deploy_site.sh`). From then on every web player is counted.

## What is collected, and why

Every event is a **name**, plus flat **props** (numbers, yes/no, short fixed words) and **t** (seconds since this play
session started). The server adds the time, a random **install id**, a random **session id**, the **build**, a
**device class**, and, only if the player has an online player code, **sha256(player code)**. That hash is the
same key the cloud saves use, so stats can be joined to the save without ever storing the code.

| Event | Props | Answers |
|---|---|---|
| `session_start` | touch, scr (screen size rounded to 50 px), dpr, lang (`en-IN`), tz (hours), ref (referring site's host only), ret (seen before), days (since first visit), n (visits before), save, online, view, conn (`4g`), pwa, resume | adoption, new vs returning, devices, where players come from |
| `settings` | view, mute, vol, music, diff, text_speed, motion, captions, assist, hc, cb, handed, btn | how people set the game up (once per session) |
| `setting` | key, value | a change (e.g. view = tps: switched to 3D) |
| `heartbeat` | sec, act (seconds with input in the last 30 s), play, idle, menu, v2d, v3d, fps (bucket), room, mode | play time, 2D vs 3D, frame rate; **one per minute, only while someone is actually playing** |
| `perf_boot` / `perf_3d` | b (load time bucket, e.g. `2-3s`), world_b / ok | is the game fast enough to start, does 3D load |
| `title_shown`, `new_game` {skip_intro, online}, `continue`, `intro_skipped`, `first_control` {after, how} | | the start of the funnel |
| `track_start` / `track_pass` / `track_fail` / `track_abort` | id, track (1-12), ch, attempt, dur | where the story is hard, where people quit |
| `chapter` {n} · `ending` {phase: start / end} | | how far people get |
| `side_start` / `side_end` | id, kind, attempt, result, dur, room | side missions and jobs |
| `mg_start` / `mg_end` | id, win, score, stars, quit, dur, world, mission, room | minigames, alone or in a room with friends |
| `party_start` / `party_end` | id, mode (solo / party), humans, ai, place, reason, dur | party games with friends vs with the AI gang |
| `room_create` · `room_join` {size} · `room_leave` {dur, peak} · `party_challenge` {id} · `cloud_save` {slot, ok} · `online_start` {how} | | online use, group sizes |
| `error` | src (module, e.g. `update:traffic`), n (count this minute), msg (first line, 120 characters, URLs / emails / paths / numbers removed) | what breaks, on how many devices |

Names are stable (the views read them). To add an event, call `N.telemetry.track('snake_name', {flat: 'props'})`
from any module or listen to an existing `N.on` event in telemetry.js. The server accepts any `^[a-z][a-z0-9_]{1,31}$`
name, so no migration is needed.

## What is NOT collected

No names, nicknames, emails, phone numbers or IP addresses in our tables, no player codes, no room codes, no chat, and
nothing a player types. The server refuses string values that look like a URL or an email, nested objects, more than
24 props and more than 2 KB per event. The client strips them first. There are no cookies and no third-party
scripts. Supabase's own platform logs (not our tables) see request IPs for a short time, as for every web request,
including the save calls.

## The setting and the notice

- **Settings → Privacy → "Share anonymous play stats"**: ON by default, OFF in browsers that send Do-Not-Track or
  Global Privacy Control. Off means nothing is sent and the queue in memory is cleared at once. The choice is kept in
  localStorage `nostalgia.telemetry.v1`, along with the install id.
- A one-time note on the title screen: "📊 Anonymous play stats help us make Nostalgia better. No names, nothing
  you type. [Turn off] [OK]". It goes away for good after OK, Turn off, or starting a game.
- Never sent: from `file://` (the offline single file), inside a frame (the artifact copy), under browser automation
  (the test suites), and when `N.ONLINE_CONFIG` is null.

## Cost (Free plan: 500 MB database, 5 GB egress)

Measured on the live project: one stored event costs **~420 bytes** including its indexes. A 20-minute session
makes ~30 events (20 heartbeats + ~10 others). The figures below assume ~35 events per player per day.

| Players a day | Rows / day | Raw table growth | Raw table held (90 days, capped) | Requests / day | Rollups |
|---|---|---|---|---|---|
| 100 | ~3,500 | ~1.5 MB/day | ~130 MB (all 90 days) | ~2-3 k | < 5 MB a year |
| 1,000 | ~35,000 | ~15 MB/day | ~250 MB (cap 600 k rows ≈ the last 17 days) | ~25 k | ~20 MB a year |

- Raw events are only the working set. Everything the views show lives in `daily_stats` and the per-install
  tables, which stay tiny and are kept for good. `prune` keeps 90 days or 600,000 rows, whichever is less.
- Egress: an answer is ~50 bytes, so even at 1,000 players a day that is ~0.1 GB a month. Request bodies are
  ingress (free).
- Hourly and nightly rollups take well under a second at these sizes.
- **When to spend money:** past ~1,000 players a day, if you want more than ~2-3 weeks of raw events (the rollups
  are kept anyway), move to Pro ($25/month, 8 GB) and run `select nostalgia.prune(90, 5000000);` nightly instead.
  Or raise `TUNE.beatS` in telemetry.js from 60 to 300: one heartbeat per 5 minutes, about 3× fewer rows.
- Abuse ceiling: 12 requests a minute per install and 3,000 a minute in all (≤ 50 events each), so a script cannot
  flood the database.

## How it works

- **Client** (`src/telemetry.js`, loaded right after `online_config.js`):
  - Events queue in memory, and a request goes out at most once a minute while somebody is playing. The batch is
    ≤ 50 events and < 32 KB.
  - When the tab is hidden or the page closes, one more request goes out with `fetch(keepalive)`.
  - It uses no SDK, just `fetch` to `/rest/v1/rpc/track_events` with `apikey` + `Authorization: Bearer
    <publishable key>`, exactly as supabase-js sends them for the save calls.
  - Failures retry twice with backoff (1, then 2 minutes), then the batch is dropped. Offline means nothing is
    tried. Nothing ever throws into the game.
  - With nobody touching the game there are no heartbeats and so no requests.
  - A tab that comes back after 30 minutes starts a new session.
- **Server** (`public.track_events(events jsonb)`, SECURITY DEFINER, `search_path ''`):
  - It is the only new thing the publishable key can call. It checks the whole envelope, then stores each valid
    event and skips invalid ones.
  - Answers: `{ok, n, skipped}` or `{ok: false, reason}` (bad_shape, too_big, bad_version, bad_install, bad_session,
    bad_player, bad_build, bad_device, empty, too_many, rate).
  - The tables live in the private schema `nostalgia` (RLS on, no policies, not in the API):
    - `events` (raw, BRIN on time, btree on install + time)
    - `daily_stats (day, metric, dimension, value)`
    - `installs` (first / last day, active days, sessions, device, player hash)
    - `install_days` (one row per install per active day: retention)
    - `install_steps` (first day each install reached a funnel step)
- **Rollups**: `nostalgia.rollup_day(day)` recomputes one India day (Asia/Kolkata) and is safe to run again. pg_cron
  (now enabled on the project) runs:
  - `nostalgia_rollup_hourly` at :17 every hour (today so far);
  - `nostalgia_nightly` at 00:23 IST (yesterday, then `prune`).

  Without pg_cron, run `select nostalgia.nightly();` once a day by hand. To see today's numbers right away, run
  `select nostalgia.rollup_day((now() at time zone 'Asia/Kolkata')::date);`.

## How to look at it (Dashboard → SQL editor, paste and run)

The views live in schema `nostalgia_admin`, which the API cannot see; the SQL editor can.

```sql
-- right now (raw events today, no rollup needed)
select * from nostalgia_admin.today;

-- adoption: DAU / WAU / MAU, new vs returning, sessions, active hours, average session, % who used 3D, online players
select * from nostalgia_admin.daily limit 30;

-- retention: of the people who first played on a day, how many came back 1, 7 and 30 days later
select * from nostalgia_admin.retention limit 30;

-- the story funnel: title → new game → first control → track 1 … track 12 → ending (% of title, % of the step before)
select * from nostalgia_admin.funnel;

-- every main mission: starts, passes, fails, quits, pass rate, attempts needed, minutes to pass
select * from nostalgia_admin.tracks;

-- minigames, side missions and party games, solo vs with friends (last 30 days)
select * from nostalgia_admin.activities;

-- online: rooms made, joins, group sizes, room minutes, party challenges, cloud saves
-- (group sizes are counted per player leaving a room: two friends in one room show as 2 stays of size 2)
select * from nostalgia_admin.online limit 30;

-- phones vs tablets vs desktops, and how many played in 3D
select * from nostalgia_admin.devices limit 30;

-- what breaks: errors by source (30 days) with a cleaned sample message and how many devices saw it (7 days)
select * from nostalgia_admin.errors_top;

-- how long sessions last (active minutes, last 30 days)
select * from nostalgia_admin.session_lengths;

-- the last hour of raw events (checking a new build)
select * from nostalgia_admin.recent;

-- anything else: one metric over time, e.g. which screen sizes, languages, referrers, builds, load times
select day, dimension, value from nostalgia.daily_stats where metric = 'session_start' and dimension like 'lang=%' order by day desc, value desc;
select day, dimension, value from nostalgia.daily_stats where metric in ('perf_boot', 'perf_3d', 'build', 'fps') order by day desc, metric, value desc;

-- online players joined to their nickname (only players who went online have a player hash)
select p.nick, i.first_day, i.last_day, i.days, i.sessions, i.device
  from nostalgia.installs i join nostalgia.profiles p on encode(p.key, 'hex') = i.player_hash order by i.last_day desc;
```

Sample output, from four test installs on the live project. These came from a test that was rolled back, so the
rows are gone:

```
daily      2026-10-21  dau 4  wau 4  mau 4  new 2  returning 2  sessions 4  avg_session_min 10.7  pct_3d 25  online_players 2
           2026-10-20  dau 1  new 1   ·  2026-10-15  dau 1  returning 1  ·  2026-10-14  dau 1  new 1
retention  cohort 2026-10-14: 1 install, d1 1 (100%), d7 1 (100%), d30 —   ·   cohort 2026-10-20: 1, d1 1 (100%)
funnel     Saw the title 4 (100%) → New game 3 (75%) → First control 3 (75%) → Track 1 passed 1 (25%) → Track 2 1 → Track 3 1 → Ending 0
tracks     bo_kaata: starts 1, passes 1, fails 1, pass_rate 50%, avg_attempt_at_pass 2.0, 5.0 min · lost_and_found 1 pass · first_day_first_show 1 pass
activities party race_tank_bund friends: 2 plays, 1 win, group 2.0 · mg panipuri friends 1/1 · side dw_mithai_run friends · mg kite solo · mg antenna solo 0/1
online     2026-10-21: rooms_created 1, joins 1, avg_room_size 2.00, room_minutes 29.7, party_challenges 1, cloud_saves 1
devices    phone 2 (50%), desktop 1 (25%), tablet 1 (25%); 1 played in 3D
errors     update:traffic: 3 errors on 2 days, 2 devices, "TypeError: Cannot read properties of undefined (reading #)"
sessions   0-1m 1 · 1-5m 4 · 5-15m 1 · 15-30m 1
```

## Google sign-in later: install id → account

Today, people are counted by **install** (one browser on one device), plus the player hash for those who went online.
When Google sign-in arrives (design/online_setup.md "Later"):

1. Add `nostalgia.install_users (install uuid, user_id uuid references auth.users on delete cascade, linked_at
   timestamptz, primary key (install, user_id))`. RLS on, no policies.
2. Add `public.telemetry_link(install uuid)` (SECURITY DEFINER, granted to `authenticated` only). It inserts
   `(install, auth.uid())`. The client calls it once after a sign-in, with `N.telemetry.install`.
3. Grant `track_events` to `authenticated` too. It can then also stamp `auth.uid()` into a new nullable
   `events.user_id` column for signed-in players.
4. "People" metrics then count `coalesce(user_id, install)`: one person on a phone and a laptop counts once. The
   per-install tables stay as they are, so no history is lost. Old installs join through `install_users`.
5. Add a sentence to the notice and the setting text: signed-in players' stats are linked to their account. Delete
   them on account deletion (the cascade above).

## Verified (2026-10-21)

- **Live project, as `anon`, inside a transaction that was rolled back** (nothing stayed; checked afterwards):
  - A real 26-event batch captured from the game was stored (`{ok, n: 26, skipped: 0}`); the server set `ts` and
    added `at`.
  - A mixed batch stored 1 event and skipped 5: a bad name, a nested object, a URL, an email, the reserved `at` key.
  - Refused as expected: `bad_shape`, `bad_version`, `bad_install`, a player code sent as player (`bad_player`),
    `bad_build`, `bad_device`, `empty`, 51 events (`too_many`), > 64 KB (`too_big`).
  - 13 calls from one install in a minute: 12 ok, the 13th `rate`.
  - `anon` cannot read or insert into `nostalgia.events`, cannot read `daily_stats` or `nostalgia_admin.daily`, and
    cannot call `rollup_day`. `authenticated` cannot call `track_events`.
- **Rollups and views**: 4 test installs over 4 days, then `rollup_day` for each day and every view read (the sample
  output above), then `nightly()` (it skips `prune` until that is installed). All rolled back.
- **Security advisor** after the change shows only the intended findings, the same ones save_put has: "RLS enabled,
  no policy" (INFO) for the five new private tables, and "anon can execute SECURITY DEFINER function" for
  `track_events`. Performance advisor: only "unused index" on the new, empty BRIN index.
- **Browser** (`tests/telemetry.cjs`, 120 checks, all passing): the page runs on a local server and every
  `track_events` POST is caught and checked against the same rules. It covers:
  - the batch cadence and the boot batch;
  - real play: name card, prologue SKIP, keys, a minigame, a track pass, a side mission, a party game, room events,
    an error, a settings change;
  - headers, sizes, flush on hide (once, at once), new session after a long absence;
  - Settings → OFF (real click) and the notice's Turn off / OK;
  - 503 retry, network-down drop, offline skip;
  - nothing sent from file:// or with a null config;
  - prop and message cleaning, no PII (only sha256(code); never the code, nickname or room code), the phone layout.

  `tests/smoke.cjs` still passes.
