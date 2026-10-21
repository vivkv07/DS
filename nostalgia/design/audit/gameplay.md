# NOSTALGIA — gameplay & UX audit (controls, camera, HUD, menus, map, traffic, touch, accessibility)

Auditor lane: core controls and feel, camera, HUD and UI clarity, menus, map and waypoints, traffic and
driving, collisions, touch controls, accessibility. Played in headless Chromium (Playwright) with real
keyboard and mouse, CDP touch, a fake standard gamepad (`navigator.getGamepads`), at 1280x720,
1920x1080, 390x844, 360x740, 375x667, 320x640 portrait and 844x390, 667x375, 640x360 landscape, in 2D
and in 3D (third and first person). Unlimited money (testing build) stayed ON throughout.

Regression suite for everything fixed here: `node nostalgia/tests/ux_audit.cjs`
(`ONLY=hud,cb,touch,prompt,map,keys,pad,access`). Before / after screenshots are in
[`design/audit/gameplay/`](gameplay/).

## Findings

Severity: **P0** breaks the game · **P1** a kid will hit it and be confused or blocked · **P2** clear
UX / feel problem · **P3** polish. Status: **Fixed** (with a regression check), **Open** (a design call or
too big for this pass), **X-lane** (another lane owns the file: reported below with a suggestion).

| id | sev | where | repro | status |
|----|-----|-------|-------|--------|
| G01 | P1 | style.css `#barks` (z-index 3, above the HUD at z 1–2); dialogue.js `placeBarks` clamps bubbles to the screen edge | Any speaker above the view (busy bazaar) puts a cream bubble over the OSD clock, the money tin, the objective, the mission timer, toasts, MAP / PAUSE. Seen at every size (`01`–`03` before shots) | **Fixed**: the HUD stacks above `#barks`; hud.js `dodgeBarks()` fades any bubble that overlaps a HUD read-out (`.bark.under-hud`, opacity 0.22). `N.hud.keepOutRects()` for dialogue.js to clamp properly (X4) |
| G02 | P1 | menus.js Settings "Colour-blind blips" | Switch it to Deutan / Protan / Tritan: nothing changes. `body.cb-*` classes were set but used nowhere | **Fixed**: hud.js `blipColor()` sorts every blip colour into a hue family and draws it from an Okabe-Ito based palette per mode; minimap blips, edge arrows, the route line, and the full map's mission markers / blips / waypoint pin / route all use it (`06` shots). Pixel-checked in `ux_audit cb` |
| G03 | P2 | wanted.js `size: 4` pursuer blips (also online `size: 5`, party AI `3`, latehome hint `4`) | Get the Chappal Meter to 2+: red diamonds ~40 px across on a 156 px minimap, hiding the route and the mission star | **Fixed**: wanted.js asks for 1.6 / 1.1; hud.js clamps every blip at `N.hud.BLIP_MAX` = 2.2 (full map too) |
| G04 | P2 | menus.js Settings, input.js | No controls reference anywhere (pause, settings, title only says ↑↓ Enter) and no key remapping; left-handed / one-handed / AZERTY players are stuck with WASD+E | **Fixed**: Settings > Controls: a keyboard / touch / gamepad reference card and 12 rebindable keys (click, press a key; Esc cancels; Esc / Tab / F-keys stay fixed; a key belongs to one action; Reset; saved in `nostalgia.keys.v1`). Keyboard rows hide on touch-only devices (`08` shots) |
| G05 | P2 | hud.js money tin, shops.js purse | Unlimited money shows `₹ 999999.00` — the widest thing on the portrait HUD, boxes within 6 px of the OSD with fallback fonts (no actual glyph overlap reproduced with the real fonts at 320–390 px) | **Fixed**: `N.hud.fmtMoney`: `₹ 12.50` below ₹1,000, `₹ 9,99,999` above (Indian grouping, no paise); the shop purse uses it. Checked at 390x844, 320x640, 667x375 |
| G06 | P2 | input.js touch ACTION button | Long context labels clip to two lines: "Start a Chitti…", "Start Tank…", "Chai (hold…" | **Fixed**: `.lbl-long` / `.lbl-xlong` shrink to three lines (S / M / L button sizes) — `07` shot |
| G07 | P2 | vehicles.js exit offer, input.js prompt | "E Get off" sits mid-screen for the whole ride on desktop (`05` before) | **Fixed**: offers can be `quiet`; "Get off / Get out" goes quiet above 25 u/s (no desktop prompt, no glow) and comes back as you slow; ACTION still gets off at any speed |
| G08 | P2 | menus.js full map | Clicking / tapping bare map does nothing; a waypoint needs right-click or a 0.56 s long-press (undiscoverable for kids) | **Fixed**: a tap on bare map opens a spot card ("Near Odeon" / district) with ◎ Route here and 🛺 Auto here; a second tap closes it; hint text updated (`04` shots) |
| G09 | P2 | menus.js full map | The map shows the waypoint pin but not the GPS route the minimap follows | **Fixed**: the road route is drawn on the full map (`04_map_route_after`) |
| G10 | P2 | menus.js `padNav` | Gamepad B (horn) zoomed the map out and did nothing in the pause deck / journal / settings; only Start went back | **Fixed**: B = back everywhere (shop cards already did this), Y = map zoom out |
| G11 | P2 | input.js prompt, hud.js J-card | The prompt's and the mission J-card's key cap always read "E", also on a gamepad and after remapping | **Fixed**: `N.input.glyph('action')`: "A" on a pad, the player's key otherwise |
| G12 | P2 | menus.js Settings | No text-size option (only text speed); the objective and toasts are 14–17 px on phones | **Fixed**: Settings > Text > Text size (Normal / Large / Larger = 1 / 1.15 / 1.3): objective, toasts, timer, ask card, J-card, prompt, dialogue box (zoom), speech bubbles and captions (font) — `10` shot |
| G13 | P2 | style.css HUD | At 1920x1080 / 2560x1440 the HUD keeps laptop pixel sizes: a 156 px minimap is 14% of the screen height, the tin and OSD look like footnotes (`11` before) | **Fixed**: CSS `--hudz` 1.25 at ≥ 1600x860, 1.6 at ≥ 2300x1250 for the OSD, stats, minimap, quick item, district card, banner and the text boxes |
| G14 | P2 | render.js camera | Settings promises "No shake, no VHS roll, gentler camera" for Reduced motion, but collisions still shook the camera (×0.3) and the look-ahead / speed zoom swung exactly as before | **Fixed**: reduced motion = no shake at all, half the look-ahead (60 u), slower swing, speed zoom 1 → 0.9 instead of 0.78 |
| G15 | P2 | style.css landscape `.hud-top` | 667x375: symmetric 250 px gutters leave the objective a 167 px column, a 5-line strip over the play view | **Fixed**: asymmetric gutters (244 / 158 px): 3 lines (`01` shots) |
| G16 | P2 | style.css `.hud-chappal` | The empty Chappal Meter is five faint outlines that vanish on a bright street (`09` before) | **Fixed**: a dark slot behind the slippers, stronger empty outlines, `aria-label` "Chappal Meter N of 5" |
| G17 | P2 | entities.js `player.fall` + bump rule, vehicles.js pothole falls | Full-throttle cycling Charminar → Abids (route-following bot, traffic on): 3–4 DHADAAM falls in ~60 s of riding (head-on wall ≥ 75 u/s = 68% of a Hero's top speed, or closing speed ≥ 75 with traffic); each costs ~3 s, 15 energy and a knee status | **Fixed for Aaram Se** (relaxed): traffic bumps never throw him, walls only at ≥ 1.35× the threshold (~92% of a Hero's top speed); the difficulty blurb says "fewer falls". Normal unchanged — **Open** as a design call (head-on ≥ 85% of top speed?) |
| G18 | P3 | shops.js auto ride card | The waypoint row read "Your map waypoint" — a kid can't tell where the auto goes | **Fixed**: "Charminar · your waypoint" (nearest named place) |
| G19 | P3 | menus.js map hint | The desktop hint was clipped at 1280 px ("right-click:…") | **Fixed** (shortened) |
| G20 | P3 | entities.js interact | Two offers competing for one ACTION press: rare (2 of 90 sampled places: kirana vs banana cart, same priority, nearest wins) | **Open**; `N.interact.runnerUp` now exposes the runner-up for tests / the debug overlay |
| G21 | P3 | traffic.js | Vehicles wait behind a player standing in the road (2 vehicles still ≥ 12 s at Charminar) instead of going round | **Open** (kid-friendly; they honk) |
| G22 | P3 | traffic.js pedestrians | 30–47% of old-city pedestrians spend most of their time on ROAD cells (bazaar crowds, no footpaths): realistic, but the main source of accidental knockdowns (2–4 per cross-town ride, ~50 heat, meter stays 0) | **Open** |
| G23 | P3 | audio_ambience.js `coo` / `koel` / `cheel` / `vendor_call` | Offline render: RMS −12 … −15 dB, as loud as the lorry horn (median SFX −30 dB). Fine at ambient distances (110–420 u, vol 0.75), but birds.js plays `coo` at the bird | **Open** (re-balance with the atmosphere lane) |
| G24 | P3 | entities.js player chevron | In dense Old City crowds the 2x-scale Chinnu is hard to find; the yellow chevron only appears after 2.5 s standing still | **Fixed**: the chevron also shows (75%) whenever `N.traffic.inCrowd()` (polled twice a second); no bob under reduced motion. Recommendation 3 goes further |
| G25 | P3 | view3d.js `shortLabel()` | The touch VIEW pill reads "FPS" for first person — kids read frames-per-second (or a shooter) | **X-lane** (performance): "EYES" or "1ST" |
| G26 | P3 | view3d.js third-person camera | Low tree canopies fill half the frame behind the rider (no fade / camera collision for foliage) | **X-lane** (performance) |
| G27 | P3 | dialogue.js `placeBarks` | Two speakers close together stack their bubbles on each other | **X-lane, done by the journey lane during this pass**: `placeBarks` now reads `N.hud.keepOutRects()`, puts a bubble below / above a HUD strip and stacks overlapping bubbles; the HUD fade stays as the safety net |
| G28 | P3 | party.js start prompts | On a hub place's start spot (abids, charminar, tank_bund) "Start a Chitti Chase / Tank Bund sprint" beats the cycle one step away; auto / bus drops land near those spots | **X-lane** (online) |

Measured and fine (no finding): on foot 90% of walk speed in 0.22 s, of run speed in 0.15 s, stop in
0.23 s; cycles 0 → 90% top speed in ~2.0 s (Hercules gears 2.0, Hero 2.2), Scooty 1.65 s, kid auto 1.9 s
(capped at 108 of 135 u/s), brake to stop in 0.55–0.75 s, turning radius at speed 44–67 u on two-wheelers
(roads are 40 u wide); analog point-to-steer turns a standing cycle 90° in 0.8 s while pulling away;
wall sliding on foot: 2 of 94 diagonal pushes into building corners stuck (one concave corner); traffic:
0 vehicles stuck ≥ 12 s at Abids / Secunderabad / Ameerpet in 45 s; auto fast travel: map "Auto here" →
auto at the kerb in ~14 s game time, ride card opens itself, ▶▶ to the waypoint; shop cards (desktop
and phone) are clear, with keys / tap / ✕; pause, settings, save and the title deck work with keys,
touch and a pad.

## Cross-lane reports (not edited)

- **X1 — party strip vs minimap on small landscape phones** (online lane, `style.css` `.pt-strip`,
  `body.touch-on .pt-strip { bottom: calc(150px + …) }`). On 844x390 a four-row board's top lands at
  ~124 px, on the minimap (78–174 px). Suggest inside `@media (max-height: 500px) and (orientation:
  landscape)`: `.pt-strip, body.touch-on .pt-strip { top: calc(182px + var(--safe-t)); bottom: auto;
  max-height: calc(100% - 300px); overflow: hidden; }` (or `left: calc(120px + var(--safe-l)); top:
  calc(78px + var(--safe-t))`, beside the minimap).
- **X2 — friend edge arrows under the 💬 button** (online lane, `src/online.js` ~L953–968): `ol-edge`
  tags are clamped to the screen rectangle with only a 64 px top band, so they slide under `.ol-hud` (💬 +
  badge at right 8 px, top 30–38%) and the touch buttons. Suggest nudging X / Y out of
  `N.hud.keepOutRects()` + the `.ol-hud` rect + `#touch .t-btn` rects (slide along the edge).
- **X3 — blip sizes** (online `size: 5`, party_races AI `size: 3`, latehome hint `size: 4`): the HUD now
  clamps them at 2.2; the owners may want ≤ 2.
- **X4 — speech bubbles** (journey lane, `src/dialogue.js` `placeBarks` ~L999): clamp under
  `N.hud.keepOutRects()` rather than 6 px from the screen edge, and stack bubbles that overlap (G27).
  Picked up by the journey lane while this audit ran; `ux_audit hud` now accepts "clamped clear or faded".
  The HUD-side fade (G01) is the safety net.
- **X5 — 3D** (performance lane, `src/view3d.js`): G25 (FPS label), G26 (canopy occlusion); and the 3D
  switch first fetches three.js from jsDelivr (`LIB[0]`, L50) — offline / from `file://` that logs a
  console error (`net::ERR_TUNNEL_CONNECTION_FAILED`) before the vendor copy loads: try `vendor/` first
  when `location.protocol === 'file:'`.

## Top recommended improvements (what would make it feel like a great GTA-style game for kids)

1. **A GPS that kids can follow without looking at the minimap.** Draw the route's next 150 u as a soft
   pink dotted line on the street in 2D (and a floating arrow at junctions in 3D), plus "300 m · turn left"
   on the edge arrow. The minimap route is good; a 9-year-old looks at the road, not the corner.
2. **Forgiving falls** (G17). Keep DHADAAM — it is funny. Aaram Se is now forgiving; on Normal consider a
   head-on component ≥ 85% of top speed, and a 3 s "wobble" warning before the second fall in a minute.
3. **Always find Chinnu.** The marker now shows in crowds (G24); add it while the camera is zoomed out at
   speed, and a brief "you are here" pulse after every teleport / ride / VHS fast-forward.
4. **Telegraph chases.** The first time the meter fills a slipper, a one-line card ("Chappal Meter! Stay
   out of sight for 12 s or get a haircut") and, at level 3+, a short grace with a "POCHAIAH IS COMING — RUN!"
   banner before anyone can grab. Standing still at level 2 is a catch in ~18 s; level 3 can be ~3 s when the
   havaldar spawns close.
5. **One button, one meaning, where it matters.** ACTION is overloaded (talk, shop, ride, get off, start
   an activity). Rare in practice (G20), but on hub spots (G28) consider "hold ACTION" for activities and a
   separate get-in key (F / Y) as an option in Settings > Controls.
6. **Phone HUD density.** Portrait shows OSD + minimap + stats + objective + timer + toast + quick item at
   once. Collapse the OSD date to the clock while a mission runs, and let the objective shrink to one line
   after 4 s (tap to expand) — the play view on a 390 px phone is precious.
7. **Big-screen and text options as one "HUD size" slider** (S / M / L / auto) built on the new `--hudz` /
   `--txtz` variables, so parents can set it once.
8. **Make fast travel discoverable.** When the waypoint is > 2 km away and Chinnu is on foot near a road, a
   one-time hint: "Far! Press HORN near a road for an AUTO!" (the auto ride itself is already lovely).
9. **Juice for small wins.** A tiny "+₹" pop and a bell when a cycle errand finishes; a horn-honk "pom pom"
   when an auto stops for you; a camera nudge (not shake) on DHADAAM — reduced-motion safe.
10. **Gamepad parity.** Pad remapping (only keys are remappable now) and pad glyphs on the ask cards and
    shop footers (the callers pass `key: 'E'` / `<kbd>E</kbd>`; the J-card and the prompt now use
    `N.input.glyph('action')`).

## Notes for the next pass

- `N.interact.runnerUp`, `N.hud.keepOutRects()`, `N.hud.blipColor()`, `N.input.glyph()` and the key
  remapping API are documented in ARCHITECTURE.md §8–§10.
- Test status at the end of this pass (shared 4-core machine, load average 20–50 from other lanes' suites):
  `ux_audit` 64/64; `menus` 216/216; `smoke` 45/45 (one overloaded run lost 2 position / wall-clock checks);
  `shops` 49/49; `core_systems` 89/89 by section (desktop 70, portrait 8, landscape 8, no-storage 3 — the
  phone HUD check now freezes the chase it sets up: at load 45 an uncle caught Chinnu before the layout
  check, the scolding dialogue hid the touch controls); `traffic` 43/43;
  `vehicles_v2` 130/130; `vehicles_routing` 32/32; `storycore ONLY=hud` 24/24. Load-sensitive checks
  that flip with the load: `settings` autoadvance (6/6 alone, 1 timing FAIL in two of three runs),
  `engine_qa` perf budgets (JS 80–150 ms per frame at load 30+: not measurable here, the 61 functional
  checks pass), `storycore` / `collectibles` / `save` / `traffic_rules` / `telemetry` wall-clock checks
  under load 35–45 (none touch the code changed here except through timing).
- `N.time.real` (frame time) now ages the pending district card instead of `performance.now()`: a slow
  device used to drop it after 6 s of wall clock.
