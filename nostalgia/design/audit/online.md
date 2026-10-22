# NOSTALGIA — online + party audit (rooms, ghosts, reconnects, party games, Supabase backend)

Auditor lane: everything multiplayer, end to end, the way a live-service game would be checked: room create / join
from the title, pause and play (desktop + phone), 2 and 3 players, reconnects (a phone asleep, a tab in the
background, the socket dropping), the host leaving mid-activity, simultaneous Start taps, invites during missions /
minigames, stale ghosts, interpolation under jitter, the shared clock, Realtime message rate vs the Supabase quotas,
payload validation and anti-abuse, RLS / advisors / rate limits, cloud-save conflicts, privacy, kid-readable copy,
and the SDK loading (vendored copy + jsDelivr) in the built site.

Files: `src/online.js`, `src/online_config.js`, `src/party.js`, `src/party_races.js` (+ the party / network parts of
`src/latehome.js`, `src/playground_games.js`, `src/cricket_match.js`, `src/minigames.js`), `supabase/migrations/*`,
`tests/online_mock.cjs`, `tests/online_net.cjs` (new). This machine cannot reach `*.supabase.co` or jsDelivr: the
browser tests run the real supabase-js 2.118.0 against `tests/online_mock.cjs`; the server side was checked with
the Supabase tools on project `gralunajtfapqkpwulyg` (read-only, or inside a block that ends in an exception so it
rolls back; nothing of this audit is left in the database).

Regression suite for this audit: `node nostalgia/tests/online_net.cjs`
(`ONLY=rate,jitter,drop,away,double,summary,blip`). It uses three new tools in the mock: per-client **jitter**
(frames delayed in order, like one TCP stream), a **frozen** socket (a phone asleep, socket still open on the
server), a **dropped** socket (the network goes away), plus the **Realtime event counter** (as Supabase bills and
rate-limits: each broadcast = 1 sent + 1 per receiver) and the **REST broadcast endpoint** supabase-js silently falls
back to. Numbers land in `tests/out/online_net_before.json` / `_after.json`; before / after screenshots are in
[`design/audit/online/`](online/).

## Findings

Severity: **P0** breaks the game at scale / for everybody · **P1** a kid will hit it (wrong result, stuck, lost
game) · **P2** clear problem with a workaround · **P3** polish / docs. Status: **Fixed** (regression check in
`tests/online_net.cjs` unless noted), **Open** (a design call, too big for this pass, or needs the owner), **X-lane**.

| id | sev | where | repro | status |
|----|-----|-------|-------|--------|
| O-01 | P0 | online.js `sendState` (fixed 8 Hz on any change) | Supabase counts every broadcast once sent + once per receiver, Free plan **100 events/s per project** (over it, Realtime disconnects the project's sockets: `tenant_events`) and 2 M/month. Measured before: alone in a room and walking **7.1 updates/s** (nobody receives them), walking 7.2/s, cycling ~6-7/s, standing 1.0/s. A room of 3 all moving ≈ 65 events/s: **two busy rooms already pass the Free limit** and knock everybody off | **Fixed**: dead reckoning. The ghost is carried on along the last velocity; a new state goes out only when that guess is off by > 2.2 u (≈ 3 m; a little more at full pedal), the heading turns > 0.2 rad, the way of moving changes, or every 1 s while moving / 3 s standing; looser when every friend is off screen (> 450 u); nothing while alone in the room. After: alone **0/s**, walking straight **1.9/s**, cycling **1.55/s**, standing **0.24/s**, zig-zag 6.2/s (cap 8). Plan limits remain: see the quota section |
| O-02 | P1 | online.js `ch.send` while the channel is not joined | Drop a phone's socket for ~3 s (`M.drop`): supabase-js answers each `send()` with an **HTTP POST** to `/realtime/v1/api/broadcast` + a console warning: **11 HTTP broadcasts** in one 2.7 s reconnect (8/s per moving player, all billed, arriving late and out of order) | **Fixed**: `live()` guard (channel `joined` + socket up) on positions, chat and the party bus; a full state goes out on the rejoin; party messages that must not be lost (acc, skip, go, cancel, res, fin, bye, host) are queued ≤ 8 s and sent in order on the rejoin. After: 0 REST broadcasts, 0 warnings |
| O-03 | P1 | party.js `online:players` → `markLeft` at once | A guest's socket blips for 1-2 s mid-race: marked **left** for good. Before: Pooja finished first (1:01.0) but the card said "— You … left" and **Imran won** (`net_blip_host_left_B_before.png`). Also "Pooja left the room." + "Pooja joined the room!" toasts for every blip | **Fixed**: a leave grace. Out of presence (or "away", O-07) for < 12 s = nothing happened (even "left" is taken back before the results: "Pooja is back!"); longer = left ("got disconnected"); a goodbye (Leave, page closed, quit) counts at once. The room keeps a dropped friend 15 s as "reconnecting…" on his nameplate. After: the right winner on every phone (`…_after.png`) |
| O-04 | P1 | party.js `currentHost` (first player still in presence) | The **host's** socket blips mid-race: during the blip Imran's phone became host; afterwards Ravi's own phone no longer thought it was host and the results came from Imran's phone, with a different "left" list | **Fixed**: host rights move only after the grace (`hostGone`); the phone that takes over says so (`host` message, everyone applies it, the old host too); a host back from a gap / hidden tab longer than the grace steps down by itself (`online:rejoined` / `online:visible`); a host away in the lobby calls it off. After: exactly one host before, during and after the blip |
| O-05 | P1 | party.js `onInvite` (a lobby host skips every other invite as "busy") | Two friends tap Start (or the "You're all at …" card) at the same moment: two lobbies, each skips the other, both get **"Nobody could play right now."** (`net_double_B_before.png`) | **Fixed**: the older lobby (its expiry on its host's clock, then the host key: the same answer on every phone) stays; the other host calls his off with `cancel {why: 'merge', into}` and joins it (same game: straight in, "Pooja started it at the same moment: you are in!"; another game: its invite card); his guests follow, and their "busy" skips are void. Also: challenging a game whose invite is already open joins that invite. After: one lobby, the race starts for all three |
| O-06 | P2 | online.js `onState` / `poseAt` (receive-time samples, 120 ms delay, "pop if < 15 ms apart") | B receives with 40-200 ms jitter (in order): the ghost of A **jumps** (top frame speed **1583 u/s**, walking is 45), **4 snap-backs**, RMS error 6.6 u at 320 ms behind | **Fixed**: samples carry the sender's clock (`ts`) and velocity; the receiver places them on its own clock by the quickest trip seen (jitter no longer moves them), interpolates 150 ms behind, dead-reckons up to 1.5 s past the newest, and eases a correction away over 150 ms instead of popping. After: top frame speed **134 u/s**, **0** snap-backs, RMS **1.2 u** at 220 ms. Older pages (no `ts`/`vx`) still work |
| O-07 | P2 | online.js ghosts | A friend's tab goes to the background or his phone sleeps: his ghost stands there as if present, counts for "You're all at …", Nearby's group centre and 👫 Go to friends | **Fixed**: the page says "away" at once on `visibilitychange` (and back on return); no state for 7 s = away too (asleep). Nameplate dimmed with "away" / "reconnecting…"; left out of the group sums and 👫 (`net_away_A_after.png`) |
| O-08 | P2 | online.js `pagehide` | iOS Safari puts pages into the back-forward cache: `pagehide` unsubscribed the room channel even then, so on return the page said "in a room" with a dead channel | **Fixed** (by reading the SDK; not reproducible in headless Chromium): `persisted` → only "away" (supabase-js reconnects on `pageshow`); a real close → goodbye + unsubscribe |
| O-09 | P2 | party.js invite / lobby cards | The host repeats the invite every 2 s and every repeat rebuilt the card's buttons: a finger on Accept can lose its tap (seen as a flaky test: "element was detached") | **Fixed**: the cards rebuild only when their content changes |
| O-10 | P2 | online_config.js `sdk` | jsDelivr first, no Subresource Integrity, 15 s before the fallback when the CDN hangs (Indian ISPs blocked jsDelivr in 2021) | **Fixed**: the copy deployed next to the page first (same origin), then jsDelivr pinned by `integrity: sha384-TcHR…yvgK`. Checked: `vendor/supabase/supabase.js` is byte-for-byte the npm 2.118.0 `dist/umd/supabase.js` (sha256 `ee3be8de…`), which is what that jsDelivr URL serves; `tests/online.cjs dist` checks the site build's fallback |
| O-11 | P2 | party.js ctx | Team games (cricket) had no way to put "Colony XI beat … by 12 runs" on the shared results card | **Fixed**: `ctx.summary({line})` (any page; the host's goes out with the results, a guest's own is the fallback) + `ctx.host` (who runs the game now); the LB match (co-op / vs) now sets "Colony XI won by 12 runs" from `pmFinish` |
| O-12 | P2 | migrations: `nostalgia.allow` (40 calls / min **per code**) | Codes are only checked for their shape: a script with a fresh code per call is never limited, and each code may store 2 × 512 KB saves + 32 KB. The Free database goes read-only at 500 MB (cloud saves stop for everybody) | **Open (owner)**: `supabase/migrations/20261021120000_online_guard.sql` adds a global budget of 60 new codes a minute and no new codes past 400 MB (existing codes unaffected). Logic checked on the live database inside a rolled-back block (60 accepted, 4 refused, 0.19 s for 64 calls). **Not applied**: the MCP tool waits for a confirmation nobody can give on `CREATE FUNCTION` / `DELETE`, so it timed out (nothing was committed: verified). Apply it in the SQL editor (safe to re-run) |
| O-13 | P3 | `race_put` | Any time ≥ the route's `min_ms` from any made-up code tops a leaderboard; Tank Bund's floor was 8 s while the fastest cycle needs 12.2 s even in a straight line | **Open (owner)**: the same migration raises `tank_bund` to 11 s (client `ROUTES` + mock too). Real fix: a server-issued race ticket (`race_start` → `race_put` checks the wall time) — next steps |
| O-14 | P2 | public Realtime channels | The sender key in `st` / `pt` / `em` is self-reported: anyone who knows a room code (3,600 of them) can subscribe without presence and send states, chat ids or party messages in another player's name (fake `fin` from "the host", fake positions) | **Open**: mitigated (only keys in the room's presence are accepted; every field validated / clamped; a goodbye only counts when that player's presence really drops). A real fix needs Realtime Authorization (private channels) with a per-player JWT, or a tiny relay. Kid-safety impact is low (no free text anywhere) |
| O-15 | P2 | playground_games.js NET (lingocha, maram pitti) | The host's page runs the game; if the host leaves, the game ends for everybody ("The game is over — the host left.") | **Partly fixed**: a host blip under 12 s no longer ends it (the grace). Hand-over to the next player is **Open** (design below) |
| O-16 | P2 | party traffic | Gully cricket lockstep: every page flushes 8×/s even when idle (25×/s with input) ≈ **72 events/s for one room of 3** — most of the Free per-second budget; lingocha host snapshots ~9/s; kite fight `ks` 8/s each | **Open**: numbers + suggestions in the quota section |
| O-17 | P2 | save_put newer-save guard | Ordered by the client's own `data.t` (accepted up to +1 day): a phone with its date set ahead poisons that code's cloud slot for other phones until then | **Open**: suggest ordering by the server's `now()` (or capping `t` at now + 5 min) |
| O-18 | P3 | rooms | Codes are word + 2 digits = 3,600: guessable; whoever guesses one sees nicknames and positions (never codes or saves) | **Open**: 3 digits (36,000) or two words |
| O-19 | P3 | online.js join | A mistyped code (empty room) said "You joined room CHAI-24! Waiting for friends…" forever | **Fixed** (copy): "Nobody is in room CHAI-24 yet. Check the code with your friend, or wait here." |
| O-20 | P3 | online.js `placeTags` | Read `getBoundingClientRect` / `offsetWidth` in draw every frame (forced layout after the frame's DOM writes) | **Fixed**: moved to the system's `read()` phase (ARCHITECTURE §2) |
| O-21 | P3 | docs | ARCHITECTURE §23 said supabase-js 2.45.4 and "~50 messages/s, well inside the Free plan"; online_setup.md too | **Fixed** (online_setup.md, §23 / §24 notes) |
| O-22 | P3 | advisors | Security: only the intended findings (anon may execute the 9 SECURITY DEFINER API functions incl. telemetry's `track_events`; RLS on with no policy on the 11 private tables; leaked-password protection, unused). Leftover `nostalgia.zz_probe()` (PUBLIC execute, harmless: no schema usage) | **X-lane** (telemetry): drop `zz_probe`. No new advisor findings from this audit |
| X1 | P2 | style.css `.pt-strip` | On short landscape phones the live standings strip sat on the minimap (gameplay audit) | **Fixed**: beside the minimap on `max-height: 500px` landscape |
| X2 | P2 | online.js edge arrows | A far friend's edge arrow slid under 💬 / the room badge / the touch buttons (gameplay audit) | **Fixed**: the arrow slides along its edge out of `N.hud.keepOutCached()`, the room HUD column and `#touch .t-btn`, and steps in from an edge that is full (a landscape phone's right side). Checked on 844x390 touch in six directions (`online_net ui`, `net_ui_edge_landscape_after.png`) |
| X3 | P3 | blip sizes | Friend dots `size: 5`, party AI 3, late-home hint 4 (now clamped by the HUD at 2.2) | **Fixed**: 2 / 1.4 / 2 |

Checked and fine: the room cap (the 4th is refused, a race overfill makes the latest joiner leave); invites during
a mission / minigame / chase are answered "busy" with a toast to the invitee; a paused invitee simply does not
answer (the lobby waits its 20 s); the shared clock (ping / pong, minimum-RTT offset, good to RTT/2; the GO instants
agree within 120 ms + RTT/2 in `tests/party.cjs`); after a host change the new host keeps the old host's clock, so
`ctx.now()` does not jump; every received field is validated (positions clamped to the map, looks whitelisted, nicks
re-filtered, preset chat ids only, sizes ≤ 2 KB, 40 messages/s per sender); RLS is on with no policies on every
private table and anon has no usage on schema `nostalgia`; the database stores no PII (sha256 of the code, a
nickname, saves, a journey summary); cloud-save conflicts are offered, never applied silently, both ways.

## Realtime quota and cost (Supabase, 2026-10 pricing)

Plan limits (docs): Free — 200 concurrent connections, **100 events/s**, 2 M events/month, 20 presence msgs/s;
Pro ($25) — 500 connections, **500 events/s**, 5 M/month then **$2.50 per million**; Team — 2,500 events/s. An event
is a WebSocket message sent from or delivered to a client: a broadcast in a room of 3 costs 3 (1 + 2 receivers).

| per player (room of 3) | before | after |
|---|---|---|
| walking straight | 7.2 msg/s → 21.5 events/s | 1.6-1.9 → 5-6 |
| cycling (cruise) | ~6-7 → ~20 | 1.0-1.55 → 3-5 |
| zig-zag / turning | 7.3 → 22 | 5.4-6.2 → 16-19 |
| standing | 1.0 → 3 | 0.24 → 0.7 |
| alone in a room | 7.1 → 7.1 (nobody listening) | 0 |
| typical roaming mix (40% straight, 30% turning, 30% standing) | ≈ 20 events/s | **≈ 7 events/s** |

- **Free plan**: a room of 3 roaming ≈ 21 events/s → ~4-5 busy rooms (~14 players) before `tenant_events`
  disconnects (before: ~1.5 rooms). 2 M/month ≈ **80 player-hours** of roaming (before: ~30).
- **100 concurrent players (34 rooms of 3)**: connections 100 (fine even on Free). Roaming ≈ 700 events/s: over
  Pro's 500/s, so Team or a custom limit from support; party games add more (gully cricket ~72 events/s per room
  as it is, lingocha ~30-40). Volume: ~25 k events per player-hour → 100 CCU × 4 h/day × 30 days = 12,000
  player-hours ≈ **300 M events/month ≈ $740/month** on top of the plan (before the fix ≈ 780 M ≈ $1,950).
- So: today's Free project is right for the owner's group and a few friend groups. For real scale, either
  Supabase Pro/Team with a raised events/s limit, or move only the room transport to a per-room relay billed by
  duration (Cloudflare Durable Objects / PartyKit-style), keeping Supabase for codes, saves, journeys and races.
- Database: saves are a few KB; with the O-12 guard the Free 500 MB cannot be filled by made-up codes.

## Lingocha / Maram Pitti host hand-over (design, not built)

The guest pages already hold nearly the whole game: every participant in the same order (`buildFromInit`), the
ball, the stones and stack, round / wins / tries / thrower / timer (`applySnap`). A hand-over would, on the phone
that `ctx.host` names after the grace: set `S.net.host = true`, turn the snapshot-followers (`P.net`) back into local
AI kids, replace the old host's participant with a colony kid (`replaceWithAI`), register the host listeners
(`pa`, `pc`), and resume `S.G.update`; the remaining guest switches `hostUid` to `ctx.host` and keeps mirroring. The
risky part is the host-only AI state (targets, claims, timers) that snapshots do not carry: it has to be
re-derived from the phase. Test: `tests/party_games.cjs three` with the host's page closed mid-round.

## Top next steps

1. Apply `supabase/migrations/20261021120000_online_guard.sql` in the SQL editor (O-12, O-13).
2. Confirm on real devices (PC + iPhone): lock the iPhone 5 s mid-race (no "left"), background Safari for 30 s
   ("away", then back), switch Wi-Fi ↔ 4G, close the PC tab (instant "left the room").
3. Party traffic (O-16): gully cricket lockstep — non-owner pages flush at 2 Hz unless they have input (keep the
   owner at 8 Hz); lingocha snapshots 9 → 6 Hz with the same interpolation; kite `ks` 8 → 5 Hz.
4. Gully cricket (`gpFinish`-side) could set a line too ("Pooja top-scored with 18").
5. Race tickets (`race_start` / `race_put` checks the wall time) before leaderboards are promoted.
6. Lingocha / maram pitti host hand-over (above).
7. Longer term: private rooms (Realtime Authorization) to stop key spoofing (O-14), longer room codes (O-18),
   server-ordered saves (O-17).

## Test runs (this pass, 2026-10-22, after the fixes; one suite at a time)

| suite | result |
|---|---|
| `tests/online_net.cjs` (new; all sections) | **PASSED**, 39 ok / 0 FAIL (before the fixes the same suite: 21 FAIL). `ONLY=ui` (added after): 5 ok / 0 FAIL |
| `tests/online.cjs` | **PASSED**, 118 ok (baseline before: 118 ok). One earlier run on a loaded machine failed once tapping Accept on an invite card that re-rendered every 2 s: fixed (O-09); the re-run passed |
| `tests/party.cjs ONLY=party,chitti` | **PASSED**, 33 ok |
| `tests/party.cjs ONLY=solo` | **PASSED**, 45 ok |
| `tests/latehome.cjs` | **PASSED**, 128 ok |
| `tests/smoke.cjs` | **PASSED**, 45 ok |
| `tests/party_cricket.cjs ONLY=two` | **PASSED**, 34 checks (new: "the team line on both results cards: Colony XI won by 2 wickets (8 balls left)"); lockstep ≈ 7.7 messages/s per page (O-16) |
| `tests/party_games.cjs ONLY=three` | **PASSED**, 12 ok (lingocha 2 v 1; Imran closes his page: replaced at once) |

Not re-run this pass (unchanged code paths; restarts were happening): `tests/funfair.cjs`, `tests/panipuri.cjs`,
`tests/party.cjs ONLY=custom`, `tests/party_games.cjs` other sections, `tests/party_cricket.cjs ONLY=solo,phone,three`.
`dist/` was built before these changes: rebuild it (tools/build.mjs) to ship them.

Numbers: `design/audit/online/online_net_before.json`, `online_net_after.json`. Screenshots (before → after):
`net_double_B_*` (two lobbies + "Nobody could play" → one lobby), `net_blip_host_left_B_*` (Pooja ranked "left"
after a blip, Imran wins → the right standings), `net_drop_A_1s_*` ("Pooja left the room." for a blip → nothing),
`net_away_A_*` (no sign → "away"), `net_summary_C_after` (team line), `net_ui_edge_landscape_after`,
`net_ui_strip_landscape_after` (X1 / X2 on 844x390).
