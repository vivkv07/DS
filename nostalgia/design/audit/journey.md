# Journey audit — first-time experience to post-game

Lane: the player's journey end to end (onboarding → Tracks 01-12 → Diwali week → ending → 2026 epilogue →
credits → post-game REWIND). Owner files: `src/story.js`, `src/story2.js`, `src/storycore.js`,
`src/missions.js`, `src/diwali_missions.js`, `src/save.js`, `src/collectibles.js`, `src/sidejobs.js`,
`src/npcs.js`, `src/dialogue.js` and their tests. Auditor: journey agent, 21 Oct 2026.

## How it was played

- **Real input, real viewports.** Playwright, desktop 1280x720 and phone 390x844 (touch), and the 3D view
  (V → third person). A real-key autopilot (`arrow keys` steering along the minimap's pink route, `E` for talk,
  acts, ● REC and J-cards, `1` for choices; minigames on autoplay because they are not this lane) played:
  the whole first-time flow (title → name card → 2026 prologue → Track 01 to MISSION PASSED), Track 02 from a
  save, Mithai Run at game speed ×1 (a timed delivery), and every chapter boundary by CONTINUE.
- **Existing suites as tools:** `story_full.cjs` (the whole story, 326 checks, before the fixes), `story_part1`,
  `story_part2`, `diwali_missions`, `storycore`, `save`, `npcs`, `collectibles`, `smoke`.
- **Focused probes** for the curfew at home, the Track 10 → Diwali week hand-over race, the Journal tabs,
  the text (glossary, brands, era words) and CONTINUE from 16 chapter snapshots.
- The machine was shared (load 12-39 on 4 cores): every wait is on the game clock; three suites have timing
  flakes under that load (noted below with what was re-run).

Screenshots: `tests/out/journey/` (the probes) and `tests/out/story_full/`.

## Findings

Severity: **P0** blocker · **P1** major · **P2** minor · **P3** polish.

| ID | Sev | Where | Repro | Status |
|---|---|---|---|---|
| J01 | P1 | free roam between missions (`storycore.js` hints; systems §6.1 / §6.5) | Finish Track 01. MISSION PASSED, Immu's chit is read once, then free roam at 18:20 with an **empty objective strip**: the next giver (M2, Mozamjahi Market) is hidden behind the riddle, the Journal is never mentioned, and the 180 s nudge only rewrote an objective nobody had set. The same empty strip after every track. | **Fixed.** A free-roam story line (`roamUpdate`): a riddle that leads to its giver (M2) is the line, in a short form (*"Immu's clue: the clock tower that talks with half its faces. Saturday, 4 pm."*; the whole chit stays on the Clues page) with the 180 s nudge or Ammamma's answer; any other next track reads *"Next on Side A: First Day, First Show (the yellow marker at home)"*. Clues that point inside their mission (M4's "four tall uncles", M10's peacock lorry) are never the line. Nothing during missions, scenes, Diwali week (its own line) or the post-game; it only clears what it wrote. Older saves get the short form too. `before: journey/new_desk_top_zz_end.png + journey/curfew_at_home_terrace.png (free roam after Track 01, empty strip)`, `after: journey/journey_desk_riddle.png, journey_phone_riddle.png, journey_desk_next.png, journey/continue_*.png` |
| J02 | P1 | `story2.js` Track 10 hand-over (`later(4.6)` → `afterTrack10` → `N.dwMissions.story.resume`) | Pass Track 10, then within ~5 s walk into any odd-job / side giver (or anything else starts a mission). The hand-over is refused (`run()`), nothing retries: **no Diwali week, no interlude, no Track 11 giver, no objective** until the page is reloaded and CONTINUE pressed. Reproduced deterministically (`p_heal`). | **Fixed.** `healTick` in story2: after 3 s of calm free roam (no mission, scene, pending `later`, jump or replay) the story resumes exactly as `resumeStory()` does after a load: Diwali week's way in, the interlude (Diwali done but no interlude), or the finale. `startInterlude` / `startFinale` now refuse while a mission runs (they used to start a scene on top of it). |
| J03 | P1 | `wanted.js` `curfewRule` / `homeRule` (gameplay lane) | After Track 01 he is on the home terrace at 18:20. Stay home. At 22:30 (Numaish season; 21:30 otherwise) the Chappal Meter goes to 1 ("Mummy is waiting at the gate"), 2 at 23:00, 3 at 00:30, **while he stands on his own terrace / at the door**. `homeRule` only clears the curfew when he *enters* the home radius (`W.atHome` edge), so being home already when it starts counts as being out. `before: journey/curfew_at_home_terrace.png` | **Not fixed (X-lane).** Suggested: in `curfewRule`, before raising the floor, when `W.atHome` is already true (or he is within `TUNE.homeR` of `homePos()`, or `N.player.level === 'home_terrace'`): `W.curfewHomeDay = nightDay; floor = 0;` — being home when the street lights come on is being home. Mitigated in this lane by J04 (sleep at home clears it). |
| J04 | P1 | home (`storycore.js`; systems §2.2 "Free food", §4.12 "Then 'Sleep?'") | There is no safe house: nowhere to sleep through the night (the only way past the curfew is to stand somewhere until 05:00 while energy drains from 97 to 2), no home meals, although both are designed. | **Fixed.** The home door (`home_door` interact by the gate, mirroring the 2-in-1; a short reach so it never takes the 2-in-1's, Ammamma's or the lootna terraces' stairs' ACTION — checked at meal time and at night; when a track's giver waits at home its J-card wins, and the track's start moves the calendar anyway): *"Eat (Amma's kitchen)"* once per meal window (+60), *"Sleep till 07:00 ▶▶"* 20:00-05:00 (VHS ▶▶ through the calendar's week loop, Chappal Meter cleared, tummy 70 / energy refilled, saved with reason `sleep`, "Good morning! WED 15 JAN 2003. SIDE A saved ●"). Off during missions, scenes, Diwali week (Ammamma's swing has its own card), 2026. `journey/journey_home_sleep_prompt.png`, `journey_home_morning.png` |
| J05 | P1 | post-game (`story2.js` `rewindMenu`; bible §9.5) | The ◀◀ REWIND season menu is offered **once**, after the credits. Pick January and December (SA8 Christmas Stars, Immu's first email, Ayesha's lorry) is ~11 months of real-time days away: practically unreachable. | **Fixed.** In the post-game the home door offers *"◀◀ REWIND: another season"* (outside meal / sleep times); the menu got a *"Not now · Stay in <date>"* row for this use (the credits' menu is unchanged). `journey/journey_home_rewind.png` |
| J06 | P2 | `save.js` meta → title CONTINUE / Load slots / online mirror ("TRACK NN" = `meta.missions + 1`) | After Track 09 with seven side activities and odd jobs done, CONTINUE reads **TRACK 12**; after Track 06 + SA4 it reads TRACK 08. | **Fixed.** `meta.missions` counts Side A tracks only (`missionsAll` keeps the total); `N.save.info()` recounts an older build's blob from its `missions.done` list. Verified on all 16 chapter snapshots (TRACK 02 … 12) and in the title DOM. |
| J07 | P2 | first ten minutes (`story.js` M1) | Nothing ever says how to move or run (desktop: arrows / WASD, Shift; touch: the thumb-pad), and the clue's home (the Journal, J) is never named. The first movement is a 25 s timed rooftop run. | **Fixed.** Device-aware toasts: at the lootna *"Move: arrow keys or WASD. Hold Shift to run."* (touch: *"Drag the left thumb-pad to move. Hold RUN to run."*, pad: left stick / RB); with Immu's chit *"Immu's chit is in the Journal (J ▸ Clues). M opens the map."* (touch: ❚❚ ▸ Journal ▸ Clues). |
| J08 | P2 | story text vs the brief (no real brands / film titles) | Chemist lines "Or Hajmola?" and "Vicks for Ammamma? … the Hajmola …" (M6, SA2), "Fevicol" (SA7), cassette 10's hint "In a stack of old Tinkles", "Hero Ranger" painted on Immu's cycle. | **Fixed in this lane** ("churan goli", "Balm for Ammamma?", "a gum bottle", "old comics", "IMMU"); the two bible lines changed with them (story_full checks the bible line by line) and the bible's glossary row. **X-lane, still there:** `shops.js` L582/585 "Hajmola, one rupee", L811/L1559-1561 "Tinkle", "Chandamama" book stall; *Mango Bite* is a mechanic across `entities.js` L380, `shops.js` L322/324, `wanted.js` L24/38/316/317/1548 and the bible (left as is in `npcs.js` L152/248 so the bark still names what the shop sells: rename all together, e.g. "mango toffee"); vehicle model names RX100 / Chetak / Luna / Ambassador / Scooty (`vehicles.js`) and "walkman" (generic, everywhere) need an owner decision. |
| J09 | P2 | `dialogue.js` glossary | Eight *highlighted* words had no meaning to show: *Dhadak!* (M8), *Wapas jao*, *Happy Deepavali*, *nostalgia* (Diwali), *Kirrr-kshhh*, *Mee abbayi … entha?* (split phrase), *Shabash* (paper round). | **Fixed** (glossary + dictionary entries). A static + in-page check now covers every *span* in story / story2 / diwali / npcs / sidejobs / storycore. |
| J10 | P2 | `vehicles.js` `seedHome` (gameplay lane) | The family Chetak (home −58, +2) and Akka's Scooty (home +26, +4) stand on the footpath line through the home gate. Walkers that go straight (NPCs on `walkTo`, the real-key bot, a kid holding one arrow) jam on them: "Home before the puja bell!" (Mithai Run) and "Meet Bunty-anna at Café Gulistan" (M1) both stuck there; `npcs.cjs` "walkTo home → Café Gulistan" took 782 u for 329 u with 8 unsticks. | **Not fixed (X-lane).** Park them off the footpath line (e.g. y +14, nose-in to the wall) or give `npcs.planPath` the seeded parked vehicles as obstacles (journey lane can do the latter if the gameplay lane prefers to keep the spots). |
| J11 | P2 | free roam after CONTINUE in a giver's ring | (Found while fixing J01) CONTINUE right inside the home giver ring: the giver waits until he steps out, so for a moment the next mission is "not available" and a clue for it (M4's LB Stadium riddle) would have been shown. | **Fixed** within J01 (only riddles that lead to the giver are ever the line); test added. |
| J12 | P2 | `tests/npcs.cjs` (journey lane tests) | Failing at HEAD already: the hint-hook check found "Talk to Immu" (the talk check left Immu standing on the player); "follow on foot" — the test's straight-line driver stopped on two customers at Café Gulistan's door; "follow ride" — the driver did not reach Koti in 45 game s. | **Fixed 2 of 3** (despawn Immu; the driver sidesteps people for 0.5 s after 1.2 s without progress, like a player). "follow ride" still fails, at HEAD too (test driver vs traffic; Immu keeps up: end gap 9-30 u). |
| J13 | P2 | SA1 night watch (`story.js` `nightWatch`) | At the colony ground pandal, nights 2-4: a raider steps out of reach as you press E, and E opens the **medical shop's card** next to the pandal; the card holds the `dialogue` state, so the watch stops until it is closed. Seen as the story_part1 full-run timeout ("mode dialogue, no line") and as story_full's "ACTION meant for the story opened a shop card instead" at `medical_shop_8`, 21:39. | **Fixed**: shops are locked for the run while the watch lasts (`lockShops = 'story:watch'`, released after it); test `journey.cjs` phase watch. The story_part1 autopilot now also closes a stray shop card (Esc, counted) instead of waiting on it. |
| J14 | P3 | M1 kite card "Not now" | Choosing "Not now" on the kite card failed the run with "The Ashok Nagar kite cut yours first." | **Fixed**: its own line ("Not now? The whole colony is on the terraces…"), retry back on the terrace (tested with a real click). |
| J15 | P3 | `dialogue.js` `placeBarks` (gameplay audit X4 / G27) | Speech bubbles sat under the objective strip / OSD and stacked on each other. | **Fixed**: bubbles keep out of `N.hud.keepOutRects()` (below a top strip, above a bottom one) and stack. `journey/journey_barks.png` |
| J16 | P3 | 3D view (performance lane) | M1's kite spot is on the terrace (h 22): the beam and diamond are right, but the pink ground glow is drawn at street level beside the building. `journey/3d_desk_m1_kite_spot.png` | **Fixed (performance lane)**: PERF-34 lifts height-less goal lights on a roof cell to roof + 8 u and `view3d_actors` places markers at the roof their target names; audit round 2: `story.js` `rings3d` passes `h: rg.h` so roof goals need no inference (`tests/view3d_actors.cjs` "a goal marker with an explicit roof height … stands on that roof"). |
| J17 | P3 | 2D top-down (render / entities) | First view of M1 and every crowded street: Chinnu is hard to find among peds (no outline / marker). | **X-lane** (also the gameplay audit's "Always find Chinnu"). |
| J18 | P3 | M1 lootna (systems §2.2) | Holding Shift (what a kid does in a 25 s race) empties energy in ~9 s; the rest of the first movement section is at walk ×0.8. | Not changed (design call): consider no run drain on the lootna terraces, or start M1 at energy 100. |
| J19 | P3 | prologue on phone (menus / style) | The cutscene SKIP pill sits under the dialogue box on 390x844 (faint "SKIP ▶▶" behind the text). `journey/phone_02_prologue_05.png` | **X-lane** (menus.js / style.css): lift the pill above `.dlg` on portrait. |
| J20 | P3 | title on phone (menus) | "SP COUNTER" reads "SP 000"; "NORMAL POSI…" is cut by the cassette. `journey/phone_00_title.png` | **X-lane** (menus). |
| J21 | P3 | ambient barks | Real public figures are named in passing ("Sachin century kodatadu chudu"). ARCHITECTURE allows public figures; flagging for the owner's "no real…" brief. | Owner decision. |

What held up well (no change needed): the J-card flow and the date jump, fail → retry from checkpoints
(story_part1/2 fail and retry every mission and Diwali activity for real), the 4-tier hints, the Diwali week
loop and its "Wait till ▶▶" card, save refusal during missions/scenes, every CONTINUE from 16 snapshots
(resume scenes start by themselves after Track 10, after Diwali week and after Track 12), the Journal's pages,
the ending → epilogue → definitions → credits → REWIND chain, the custom-nickname rule, Mithai Run's timer at
real speed (passed in ~60 s of real play), and Track 01's pacing (≈8-10 min for a first-timer).

## Top improvements recommended next

1. **Curfew at home (J03)** — a one-line guard in `wanted.js`; it is the one rule a kid will break by doing
   the right thing.
2. **Home as a hub.** Now that home has Sleep / Eat / REWIND, put the 2-in-1, the Journal and a "save"
   on the same door card (one ACTION menu) and blip "Home" on the minimap at dusk.
3. **Always find Chinnu (J17)** and **park the family vehicles off the footpath (J10).**
4. **Mango Bite / Tinkle / Hajmola / vehicle names (J08)** — one coordinated rename pass across lanes so
   the bribe item, the shop and the barks keep using the same word.
5. **A first-ride beat.** Track 01 teaches walking, running and passenger rides; the first time the player
   *rides* a cycle is M3's triple ride. A 20-second "own cycle" moment after Track 01 (borrow Bunty's old
   Hercules to the kirana) would teach riding before a chase depends on it.
6. **Post-game guidance.** The free-roam line stays empty after the credits (by design); a gentle
   "◀◀ REWIND at home · 12 kites · 30 golis…" tally line every few minutes would point at what is left.

## Tests

New: `tests/journey.cjs` (phases static, roam, home, meta, heal, m1, barks, watch; desktop + phone; real keys /
clicks where a player would use them). Changed: `tests/storycore.cjs` (the nudge check accepts Ammamma's answer
once she was asked; the J-card / dated-mission / help / timer / district-card checks wait on the game instead of
fixed wall-clock sleeps, which failed at HEAD too under load), `tests/collectibles.cjs` (walks budgeted in game
time; the camera clicks, prints and viewpoint wait on their condition), `tests/npcs.cjs` (J12),
`tests/story_part1.cjs` (closes a stray shop card, J13).

Results on the final code (machine load 15-46 on 4 cores, other agents' browsers running):

| Suite | Result |
|---|---|
| `journey.cjs` (new) | 82 passed, 0 failed |
| `story_full.cjs` (whole game) | 324 passed, 2 failed — both re-run: `START=explore2 STOP=sa1` 26 passed, 0 failed (K12 walk was a load flake; the SA1 grace failure was the J13 shop card, fixed) |
| `story_part1.cjs` | 182 passed, 0 failed (before the J13 fix: 7 SA1 failures, load-dependent) |
| `story_part2.cjs` | 64 passed, 0 failed |
| `diwali_missions.cjs` | 108 passed, 0 failed |
| `storycore.cjs` | 99 passed, 0 failed (after the game-time waits; HEAD's own copy failed 6 under the same load) |
| `collectibles.cjs` | all checks passed after the wait fixes (5 failed under load before, the same with HEAD's waits) |
| `save.cjs` | passed |
| `smoke.cjs` | portrait + landscape passed; desktop's fixed-time walk failed once at load 40 (56 u < 60), re-run passed |
| `npcs.cjs` | 39 passed, 1 failed: "follow ride" (fails at HEAD too: the test's straight-line rider does not reach Koti in 45 game s; Immu keeps up); HEAD had 4 failing |

