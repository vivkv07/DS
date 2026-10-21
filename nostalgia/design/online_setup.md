# NOSTALGIA online: setup for the owner

*2026-10-19. Code: `src/online.js`, `src/online_config.js`, `supabase/migrations/20261019000000_online.sql`.
Contract: ARCHITECTURE.md §23. Tests: `node nostalgia/tests/online.cjs`.*

## What you need to do: nothing

Online play is switched on and pointed at the Supabase project **gralunajtfapqkpwulyg**
(`https://gralunajtfapqkpwulyg.supabase.co`, region ap-south-1). The database side is already
applied to that project. Deploy the site as usual:

```
nostalgia/tools/deploy_site.sh
```

It now also copies `vendor/supabase/` (the fallback copy of the Supabase library) next to the page.

There are no dashboard steps: no sign-in providers, no redirect URLs, no keys to paste. Players do not
make accounts.

## How players use it

**Playing together (2026-10-20, after the owner's first real game):** Title → **ONLINE** (or Pause → Online)
shows four steps — *Create a room → Share the code → Friends join → You all appear together* — a name field and
two big buttons. **＋ Create a room** shows the code (`CHAI-42`, with a Copy button) for a moment and then drops the
player straight into the city: their saved game continues, or (no save yet) a new game starts without the intro.
A friend types the code under **Got a code?** → **Join ▶** and appears a few steps from the first player. From
the pause menu it is the same: the game simply resumes. Nobody is ever pulled out of a mission or a race: they get
a pink route and a **👫 Go to friends** button for later. Rooms hold **3 players**; the 4th is told the room is
full. In a room the HUD shows what the group can do nearby (races, the pani puri contest, funfair games in
season, the nearest open chai stall …) with a one-tap **Challenge**, and when everybody is at the same spot: "You're
all at Gokul Chat — Pani puri contest? [🏁 Start]".

1. **My player code & cloud save** (folded away in the Online panel): the first time the game goes online it gives
   the player a *player code* such as `CHAI-PATANG-GULLY-4821-K7QXM`: "Write it down! Enter it on another phone to
   continue your journey there."
2. **Nickname** ("Your name in the room"): 3-12 letters or numbers. Rude names are refused, kindly.
3. **Cloud save**: from then on every save (STD booth, MISSION PASSED, pause-menu Save) also goes to the
   cloud. On another phone, **Use my code** (under "My player code & cloud save") brings the nickname and offers
   the cloud save ("A newer save
   is in the cloud: TRACK 03 · ..." → **Use cloud save** / **Keep this one**). A newer save is never
   overwritten, in either direction, and a save from a newer version of the game is never touched by an
   older one.
4. **Rooms**: **＋ Create a room** gives a short code like `CHAI-42`; friends type it under **Got a code?**. Up to
   3 players (`maxPlayers` in `src/online_config.js`); the 4th is told the room is full. A room ends when the last
   player leaves.
5. In a room everyone sees everyone (top-down and 3D) with name tags and minimap dots. **Meet pin**:
   "Meet here" or a place ("Irani café, Abids", Charminar, Tank Bund ...) gives everyone a pink route.
   **Quick chat**: preset phrases only (Aaja! · Chai? · Race to Tank Bund! · Ruko, coming! · I am here! ·
   Bye, see you! · 👋 · 👍). There is no typing to other players.
6. Missions, the story and the Chappal Meter stay single-player; friends are "ghosts" who cannot bump or
   get you caught.
7. Journal → **Journey**: missions passed, Side A tracks, tin items, places visited, the game date.

## What is stored (kid-friendly)

Only: the player code **scrambled** (sha256; the code itself is never stored), the nickname, the save
games and the journey summary. No email, no name, no IP address, no free text. Room positions,
pins and chat are never stored: they pass through Supabase Realtime and are gone.
Separately, every web player (online or not) sends anonymous play stats, which can be turned off in Settings → Privacy.
These hold no codes or names, only sha256(code) as a link: see `design/analytics.md`.

## How it is protected

- The page ships only the *publishable* key (`sb_publishable_...`). With it, a browser can **only**
  call eight database functions: `save_put`, `save_get`, `journey_put`, `journey_get`, `profile_set`,
  `profile_get`, and the race leaderboards `race_put`, `race_top` (party races, see below). The tables live in a private schema (`nostalgia`), have row-level security on with no
  policies, and are not visible through the API at all.
- Each function checks the code's shape, sizes (save ≤ 512 KB, journey ≤ 32 KB), the nickname
  (3-12 characters, letters / digits / inner spaces, plus a rude-word list), and allows 40 calls per
  minute per player code. `save_put` refuses to replace a save written later (`newer_save`) or by a
  newer game version (`newer_build`).
- Someone who learns a player code can continue that journey; that is the point of the code, so tell
  players to keep it to themselves (like a locker number). Guessing one is hopeless (~62 bits).
- Rooms are public Realtime channels: the room code is the invite. The game validates everything it
  receives from other players (positions clamped to the map, preset phrases only, kind nicknames).

## Party races: leaderboards (2026-10-20)

Friends in a room (or a player alone, with the AI friends Immu, Ayesha, Pappu and Bunty-anna) can race: five cycle
routes, pin races, the Birla Mandir steps race and the chai run (ARCHITECTURE §24). Personal bests and a top-10
per route are kept by `supabase/migrations/20261020000000_party.sql`, **already applied** to gralunajtfapqkpwulyg
(migration `nostalgia_party_races`): tables `nostalgia.race_routes` (the 7 routes and the fastest believable time
for each) and `nostalgia.race_times` (best time per player code and route; RLS on, no policies, not in the API),
functions `race_put(code, route, ms, vehicle)` and `race_top(code, route)`. They check the code, the route, the time
(1 s - 1 h, refused as `too_fast` below the route's minimum) and the cycle type, share the 40 calls / minute limit,
and show nicknames from the profiles table (never anything typed by the caller). Nothing to do for the owner.
Without online (or before Go online) times are kept on the phone and sent later.

## Limits to know

- **Realtime quota**: Supabase counts every message delivered. A full room of 3 kids all moving is about
  50 messages a second (8 position updates a second each, nothing while a player stands still), well inside
  the Free plan. Raising `maxPlayers` again (the code supports up to 10) multiplies that; past ~5 players the
  game sends fewer updates per player.
- **Database**: a save is a few KB (2 KB at the start of the game), two per player. The Free plan's 500 MB holds many thousands of players.
- The single-file offline copy (`dist/nostalgia.html`, opened from disk) has online off and says
  "Online play needs the web version".

## Later (not built now)

- **Email or Google sign-in**: `src/online.js` keeps the identity behind one seam (`ID`), and the database
  functions take the identity as their first argument. Adding a sign-in means: enable the provider in
  Supabase → Authentication, set Site URL `https://vivkv07.github.io/DS/` and add it to the redirect
  URLs, add user-id-keyed versions of the six functions granted to `authenticated`, and a "Link this
  code to my account" button.
- **Private rooms** (signed-in players only) would use Realtime Authorization (`ONLINE_CONFIG.privateRooms`).
- **Switching off online**: set `N.ONLINE_CONFIG = null` in `src/online_config.js` and redeploy. The
  game then says "Online play is coming soon" and loads nothing.
- **Moving to another Supabase project**: run `supabase/migrations/20261019000000_online.sql` in its SQL
  editor (safe to re-run) and put its URL + publishable key in `src/online_config.js`.
- If Realtime ever refuses the publishable key (rooms say "Could not open a room"), put the project's
  legacy *anon* key in `realtimeKey` in `src/online_config.js`.

## Verified (2026-10-19)

- On the live project with the Supabase tools, as the `anon` role: `save_put` first write ok; an older
  save refused (`newer_save`); a newer one ok; a v3 save then a v1 save refused (`newer_build`); a bad
  code refused; nickname ok / too short refused; `save_get` with a lower-case code finds the save and
  nickname; journey put / get; the 41st call in a minute refused (`rate`); anon has no access to the
  `nostalgia` schema. Security advisor: the only findings are the intended ones ("anon can execute
  SECURITY DEFINER function" for the six functions, "RLS enabled, no policy" for the private tables)
  and "leaked password protection" (no passwords are used).
- 2026-10-20, party races, on the live project as `anon` (inside a rolled-back transaction, so no rows stayed): a first
  time is stored (rank 1), a slower one keeps the best (runs 2, improved false), a faster one improves it, a second
  player ranks 2nd and sees both in the top 10; refused: 3 s on Tank Bund (`too_fast`), an unknown route
  (`bad_route`), a bad code, a bad vehicle string, 27 hours (`bad_time`); `race_top` returns the board + best + rank.
  anon cannot read the race tables or call the helper `nostalgia.race_board`; `authenticated` cannot call them. Security
  advisor: only the intended findings (as above), now also listing `race_put` / `race_top`.
- In the browser (`tests/online.cjs`), against a local stand-in server that speaks the same protocols,
  because this build machine cannot reach supabase.co: see the test file header.

## Optional clean-up in the SQL editor

The first draft (before player codes) left some unused objects behind; they hold only test data and are
locked away from the API. To remove them:

```sql
drop table if exists public.zz_retired_saves, public.zz_retired_journeys, public.zz_retired_profiles;
drop policy if exists nostalgia_rooms_read on realtime.messages;   -- only needed for private rooms
drop policy if exists nostalgia_rooms_write on realtime.messages;
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from nostalgia.saves where key in (sha256('TEST-TEST-TEST-0000-00000'), sha256('TEST-TEST-TEST-0000-00001'));
delete from nostalgia.journeys where key = sha256('TEST-TEST-TEST-0000-00000');
delete from nostalgia.profiles where key = sha256('TEST-TEST-TEST-0000-00000');
delete from nostalgia.rate where key in (sha256('TEST-TEST-TEST-0000-00000'), sha256('TEST-TEST-TEST-0000-00001'));
```
