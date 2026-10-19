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

User feedback (auto travel was undiscoverable): added "🛺 Auto here" on map place cards (menus.js callAutoTo).
Still to do in QA/polish: a one-time tutorial tip "Press HORN near a road: AUTO!", auto-stand icons on the minimap/map legend, preselect "Your map waypoint" in the auto fare card when a waypoint exists, and a clear on-screen marker where the hailed auto stops.

Old City worlddata (reported by the blender-oldcity session with Charminar v3, commit 3bd9be7):
- bangle_shop_1/2/3 face 'n' but the Laad Bazaar lane is to the south, so players see their backs; flip to 's'.
- bangle_shop_2 sits behind bangle_shop_1 (overlapping lots); respace along the lane.
- Mecca Masjid, Chowmahalla, Falaknuma, Purani Haveli and Pathergatti are hemmed in by procedural filler lots; clear a forecourt around each.
- puranapul_arches is axis-aligned but the road there runs ~16.8° off axis; rotate the structure to match.
- Charminar v3: street-level view reads right; the 3/4 overview still looks a little tall for its width. Revisit after the integration pass.

Live site (owner request: "publish with whatever we have, then update on top of it"):
- Public at https://vivkv07.github.io/DS/ (GitHub Pages, gh-pages branch of vivkv07/DS; the repo is public now).
- Deploy: `nostalgia/tools/deploy_site.sh` builds dist/web.html (full page, 3D files lazy) and pushes one new commit to gh-pages. Run it after each verified preview build. `--dry-run` assembles dist/site only.
- Still a testing build (unlimited pocket money). Launch-plan items (save-on-hide, newer-save guard, offline, own domain) remain open above.

Blender landmarks (merged 970f29d; pack now 7493 KB of the 8192 KB cap — per-model lazy loading #70 is next):
- Parked owner must-haves, not built/packed yet: Koti bus stand, Imlibun/MGBS, RTC X Roads cinemas, Secretariat, Ravindra Bharathi, Secunderabad clock tower, Paradise, Gokul Chat, park gates, St Joseph's (partial), St Mary's, Wesley, Sai temple, Ujjaini, Lal Darwaza, temple/mosque/church/dargah kits, NTR memorial, airport terminal/ATC/prop plane, OU Arts College, Spanish Mosque, HITEC office. Builders: NOSTALGIA_PARKED=1 (landmarks_centre.py / landmarks_west.py / _lm_hussain.py).
- Trees are scattered on the lb_stadium_field park and stand on the cricket pitch: exclude it from tree scatter.
- Night LB matches leave the field dark: add field floodlights when lb_match && night.
- Procedural Golconda curtain walls (src/landmarks.js ~2226-2244) still use square merlons: switch to Deccani leaf merlons.
- Bala Hissar at 84x64 doesn't dominate: consider ~140x110 in worlddata.
- `floodlit` glows the whole atlas (Birla Mandir's granite hill glows like the marble at night): add a floodlit mask.
- tests/view3d_landmarks.cjs "every landmark was built by view3d_landmarks.js" must accept models3d overrides.
