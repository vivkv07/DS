# Follow-ups collected from agent reports (for the final integration/QA wave)

Vehicles v2 (done):
- traffic.js should read `N.vehicles.TYPES[t].spawn` (or call `N.vehicles.trafficMix`) and set
  `N.traffic.readsTypeWeights = true`; the night rule should halve the new cycle types too;
  driverLook() cases for hero_cycle / hercules_cycle / scooty.
- The cycle-rickshaw inherits kidOk from 'cycle' ("Borrow rickshaw"): should be a fare ride.
- missions.js checkpoint retry can seat Chinnu at the wheel of a vehicle he only rode in.
- A save made while riding along loads him as driver (healAge drops him off); make passenger
  state survive save/load.
- view3d_actors.js: 3D models for hero_cycle, hercules_cycle, hercules_gears, scooty,
  akka_scooty; use `vehicle.jolt` and `vehicle.wobble`; kid posture on Scooty/auto.

Tests drifted from the game (fix the tests, never weaken them):
- core_systems.cjs: expects ₹25 start money, bus driving, empty flags after garbage load, and
  #title-start going straight to play (now plays the prologue).
- engine_qa: base date 1999 / midnight wrap expectations; camera-glide timing.
- storycore.cjs: J-card '.jc-head' null intermittently.
- Load-sensitive timing in shops.cjs, traffic.cjs, vehicles_v2.cjs: replace wall-clock sleeps
  with game-time waits.

Other:
- Pursuers/traffic should respect `N.player.level` (on a roof) and `N.respect.at`.
- recording_centre_1 / electronics_shop_1 need their own places_art variants ('recording', 'tv_radio').
- Free chai at Café Gulistan (`N.flags.unlock_free_chai`), framed print, golden bell: shops/places_art should read the flags.
- Cassette pickup 2 s song preview (systems §7.1).
- Menus settings that other modules must act on: assist (minigames). (autoAdvance -> dialogue.js and body.high-contrast -> style.css are done; tests/settings.cjs.)
- whole-frame cost is rising as modules land (smoke desktop ~29 ms/frame on a loaded machine): a performance pass is needed.

Map v2 (done; 98.8% of 1,340 real-geography relations pass):
- World build time regressed: cold build ~1.5 s CPU (v1 0.5 s), 2.9 s in browser with heavy GC; target < 1.0 s. (Perf pass: ~0.6 s desktop, byte-identical world; 2.0-2.1 s at 4x CPU. Measure with tools/perf/measure.cjs <root> [<root2>].)
- (done) Memory: minimap image (3000x2250, 27 MB) was held twice; hud.js now grades a renderMap(0.2, {fresh:true}) canvas in place.
- GPS/pathfinding limits too low for the bigger city: vehicles.js (8,000 expansions, linear open list) and wanted.js (6,000) fail long trips (Charminar→Cyber Towers); use the new N.world.roads.route(a, b, {...}) A* instead.
- Centre stretched E-W (ratio 1.18-1.30); optional local projection fix.
- Tests with v1 coordinates: menus.cjs (Charminar camera/icon/waypoint), engine_qa.cjs (8000x6000 assertion, 2 boat tests), collectibles C10/C13/G24/F07, Bala Hissar viewpoint.
- story_part1 got stuck in M6 ammammas_thursday at the walkman step after a retry (check in QA).
- design/map_plan.md still lists old positions for pathergatti, hotel_madina, madina_building and west-edge signposts.
- The machine ran at load 25-65 on 4 cores: timing-based checks are flaky; re-run QA on a quieter machine (fewer parallel workflows) and replace wall-clock waits with game-time waits.

Launch plan (design/online_plan.md) found:
- BUG save.js: a save written by a newer version is ignored, the game falls back to the backup, and the next save overwrites the newer progress. Must refuse to overwrite a newer save.
- BUG main.js (~line 195): pausing on visibilitychange does not save; Android killing the tab loses progress. Save (when allowed) on hide/pagehide.
- dist/nostalgia.html now inlines the 3D model pack (8.3 MB raw); add the --web split build per plan §2.1 so 2D players don't download 3D.
- Noto Sans Telugu is requested but unused by CSS (the district subtitle font-family must reference it); Kalam is injected at runtime by menus.js.
- Boot CPU 3.7 s on a mid-range phone (world.build 2.3-2.5 s): target ≤ 2.0 s. (Perf pass: ~3.2 s wall at 4x CPU, world.build ~2.0 s of it; the rest is script parse/run ~0.6 s, world:built handlers, menus.title ~0.15 s. Reaching 2 s needs the build time-sliced behind the title or precomputed, see the perf report.)
