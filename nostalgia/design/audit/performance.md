# NOSTALGIA — performance, 3D quality, loading, memory and build audit

Lane: performance / 3D quality / loading / memory / build + deploy reliability. Audited 2026-10-21 on the working
tree (66 scripts, `dist/web.html` 8.36 MB before this pass). Harness: **`tests/qa_perf.cjs`** (new; sections
`boot idle2d frames2d switch3d frames3d walk3d soak ctxloss storage build`), delivery runs with
`tools/perf/measure.cjs` (throttled network + 4x CPU, HTTPS/HTTP2 + brotli), CPU / heap / allocation probes over CDP.

**How to read the numbers.** The host is a shared 4-core VM (load average 15–41 during this audit: other agents'
headless browsers) and renders WebGL with **SwiftShader** (software GL). So:

- 3D fps and GPU time here mean nothing. 3D is judged by **in-page JS time per phase**, draw calls, triangles,
  programs, textures, geometries and memory.
- Every timing is in-page (`performance.now()` around the code, CDP main-thread `ThreadTime`), repeated, medians
  quoted; single maxima are noisy (a descheduled process inflates them) and are quoted as "worst seen".
- "phone" = 412×892 @ 2.625, touch, **CDP CPU throttling 4x** (Lighthouse mid-tier); view3d picks its `low` tier.
- 2D runs use `--disable-gpu` (software canvas: raster lands on the main thread — an upper bound; a phone rasterises
  canvas on its GPU), so 2D *draw* numbers are pessimistic; *update* numbers are real.

---

## 0. Summary

| | Before | After this pass |
|---|---|---|
| First download (`index.html` on the site, gzip -9 / brotli -11) | 2.52 MB / 1.88 MB | **2.16 MB / 1.61 MB** (−14.5 %) |
| Phone, Slow 4G, cold: HTML downloaded → title usable (2 runs each) | 11.6–11.7 s → 15.0–15.6 s | **9.6–9.8 s → 12.6–13.7 s** |
| Phone, Fast 4G, cold: title usable | 5.3–6.6 s | **5.1–5.3 s** |
| 3D-ground road analysis for a player who never uses 3D | runs on the title + every 2D frame (5–10 ms slices, items up to ~30–100 ms), keeps **+36 MB** JS heap | **not run in frame time**; idle callbacks only (none on a busy phone) |
| Longest single uninterruptible analysis items (dedupe / cluster / trims / one footpath strip) | 29–60 / 19–55 / 13–69 / 76–342 ms | **0.5–5 / 11–24 / sliced (256 per check) / sliced (32 samples per check)** |
| First play frame after START (`citylife_events` site build) | one 100–250 ms update (desktop), ~1 s at 4x | built a step at a time in title-screen idle time |
| Shop signboards in 3D after a long trip | atlas full after ~5 market areas: **every new board dropped for the rest of the session** | cells recycled (466 over a 24-stop trip, 0 dropped, 0 stale; phone tier 0 dropped after the four busy spots) |
| Diwali particle buffers, all year | ~230 KB of `bufferSubData` **every 3D frame** for empty buffers | 0 when empty, only the used range otherwise |
| CPU copies of chunk geometry (desktop 3D, Abids) | ArrayBuffer backing 118 MB | **98 MB** (−20 MB right after settling; more as chunks are seen) |
| WebGL context lost during a program compile | `TypeError` in three's `WebGLProgram` (→ after 3 such errors 3D turns itself off) | guarded |
| Lazy files after a redeploy (GitHub Pages caches 10 min) | page could pair with a stale cached pack / loader | `?v=<content hash>` (`N.BUILD`) |
| `document.fonts.check` per signboard | ~1 ms each (~90 ms of a 3D switch) | once |
| Core model pack on a slow link | 20 s script timeout: a 3 MB (gzip) pack still downloading on Slow 4G / 3G was abandoned, the fallback URL 404'd and the session ran **without Blender models** | 180 s (a missing file still fails at once); local three.js 6 → 60 s |
| DOM work per 3D frame | 5 overlay style writes every frame; bark size reads interleaved with writes (one forced layout per bark) | writes only on change; all bark reads before any write |
| 30-min soak (23 cycles: 4 busy spots, tps / fps / top, rain / storm, party race) | – | heap 226 → 238 MB (0.48 MB/min, flat from minute 6), textures 77 → 90, programs 81 → 89 (plateau after the first round), 0 game errors |

Big items that remain (details §2, next steps §5): **3D on phones is CPU-bound** (~40–55 ms of view3d JS per frame
at 4x = 8–12 fps before the simulation), the **2D fixed-step spiral** on slow phones (5–6 sub-steps per frame),
`world.build` (2.3–3.7 s of boot), no service worker (offline fails), the first-3D-frame shader compile (54
programs), per-frame forced layouts from DOM barks, and the camera clipping into buses / festival stalls.

---

## 1. Findings

Severity: **P0** broken for many players · **P1** serious cost or visible degradation · **P2** worth fixing ·
**P3** minor. Status: **fixed** (this pass, in my lane) · **cross-lane** (reported, owner named) · **rec.**
(recommendation, §5).

| id | sev | where | measurement | status |
|---|---|---|---|---|
| PERF-01 | P1 | `src/view3d_ground.js` idle precompute (system `view3d_ground`) | The whole road-network analysis ran for **every** player, 3D or not: 10 ms slices every title frame, 5 ms every 2D play frame (+ item overshoots) until done — desktop 1.6 s on the title + 1.65 s in the first 20 s of play, phone(4x) 0.5 s + 2.1 s, and it then **keeps +35.7 MB of JS heap** (97 → 132 MB, measured after GC). | **fixed**: frame-time slices only on a device that has run 3D (`nostalgia.view3d.used`, set by view3d.js) or while 3D is loading; otherwise idle callbacks only. After (`idle2d`, same scenario): desktop 1 ms on the title / 11 ms in play (worst 3 ms), phone 3 / 25 ms (worst 4 ms), heap not taken. First switch on a new device runs it inside the warm-up (provisional ground meanwhile; cost moves to the first 3D drive: PERF-29). |
| PERF-02 | P1 | `src/view3d_ground.js` analysis steps | Uninterruptible items made slices overshoot their 5–14 ms budgets: `dedupePieces` 29–60 ms, `clusterGroups` 19–55 ms, `finishPieces` 13–69 ms, one long piece's footpath clearance 76–342 ms (worst seen, wall clock under load). | **fixed**: dedupe per group, cluster with path compression, trims sliced, `clearPieceStep` resumable mid-strip. Results identical (130 corners / 966 gaps / 14174 u gap length / 19 dups before and after; ground suite junction sweeps unchanged). Still long: one `piecesOfRoad` (longest road, 33–113 ms) and one `junctionPoly` (18–88 ms) → §5. |
| PERF-03 | P1 | `src/view3d.js` sign atlas (`signSlot`) | 6 pages × 64 boards; nothing was ever freed, so after ~5 market areas (`abids_book_market` on the probe trip) **every new shop board was silently dropped** for the session. | **fixed**: ref-counted cells (chunks hold theirs from `addSigns` to `clearChunkGeom`, landmarks while the model exists in scene or LRU, `H.releaseSigns`); full pages recycle unused cells. 24-stop trip: 466 recycled, 0 dropped, 0 stale (`N.view3d.signCheck()`). Phone tier (3 pages of 64 half-size cells) after the four busy spots still dropped 20 boards (the landmark LRU held cells of off-scene models): a full atlas now asks `H.onSignsFull` reclaimers (view3d_landmarks evicts its oldest cached off-scene model with boards) → 1 dropped; and the low tier gets 4 pages (+2.7 MB GPU) → **0 dropped**, 86 recycled, 0 stale (`qa_perf frames3d`, phone). |
| PERF-04 | P1 | `src/citylife_events.js` `buildSites` | All five site builders ran in the first `update` after START: one 100–250 ms update on desktop, ~1.0 s on a 4x phone (`citylife_events` worst update 1036 ms in `idle2d`). | **fixed**: built one step per idle callback while the title is up (`idleBuild`); remaining steps still complete on first use. Also `registerAudio` now runs even when the sites were built early (it was only called on the not-ready → ready transition). |
| PERF-05 | P1 | `tools/build.mjs` → `dist/web.html` | 66 inline scripts, comments and indentation shipped: 8.36 MB raw, 2.52 MB gzip (GitHub Pages serves gzip). The page grew 66 % since the 2026-10-17 delivery study (1.16 → 1.93 MB brotli). | **fixed (partly)**: `stripJs` tokenizer (strings, templates, regex literals, line breaks kept; every result compiled with `node:vm`, original kept on failure; `qa_perf build` proves all 66 parse to the same program as their sources with TypeScript's parser + printer): 7.18 MB / **2.16 MB gzip / 1.61 MB brotli**. Bigger wins (lazy 3D / activity chunks, minification) → §5. |
| PERF-06 | P1 | 3D on phones (`frames3d`, low tier, 4x) | view3d JS per frame 38–54 ms (three.js `renderer.render` 26–40 ms for 111–171 calls, streaming 2–10 ms, actors 1.4–6.5, parity 0.9–5.5) + systems 9–16 ms per step → **~8–12 fps CPU-bound on a mid-range phone**, before any GPU cost. | rec. (§5: phone preset, actor / landmark ranges, draw-call merging) |
| PERF-07 | P1 | `src/main.js` fixed step (cross-lane: engine / gameplay) | dt clamp 0.1 s split into ≤1/60 s sub-steps: on the 4x phone 2D runs **5.4–5.9 sub-steps per frame**, desktop-under-load 3.4–4.3 — the classic spiral (slow frame → more simulation → slower frame). | cross-lane: cap sub-steps (2–3 on the low tier; let game time slow down instead). |
| PERF-08 | P1 | `world.build` at boot (cross-lane: world lane) | 3.0 s (desktop, loaded host) / 3.7 s (phone 4x) of the 5.1 / 7.0 s to the title; the 10-17 study measured 2.3–2.5 s at 4x on a quiet host. | cross-lane: cache / precompute the grids (deterministic from worlddata) or build progressively behind the title. |
| PERF-09 | P2 | `src/diwali.js` `ptCommit` + cracker instances | Sparks / glows / smoke `Points` uploaded their **whole** Float32Arrays (22 200 + 22 200 + 14 800 floats ≈ 230 KB) every 3D frame, every day of the year (layer runs when Diwali is off); cones / cylinders re-sent with count 0; a `updateRange.count` of 0 would upload the whole array in WebGL2. | **fixed**: used range only, nothing (and hidden) when empty. |
| PERF-10 | P2 | `src/view3d.js` / `view3d_ground.js` chunk geometry | three keeps every attribute array in JS memory after upload: 3D desktop at Abids = 114 MB JS heap + **118 MB ArrayBuffers** (roads 16 MB, buildings 6 MB, landmarks 8 MB of the scene's 35 MB; the rest: models3d buffers, 256² ground maps per chunk ≈ 11 MB, the 10.5 MB camera height grid, analysis). | **fixed (partly)**: core-built `buildings` / `signs` / `glows` and the ground's road meshes drop their arrays after the first upload (`freeOnUpload`; bounds computed first; chunks are rebuilt on LOD change / context restore anyway): 118 → 98 MB right after settling, more as unseen chunks get drawn. `Q.keepArrays` for A/B. Those objects are ray-transparent (`raycast` no-op): three's raycast would read the dropped arrays — a scene-wide ray cast in `tests/view3d_ground.cjs` (lane contrast) threw a `TypeError` on the first cut; the game itself ray-casts landmarks only. `qa_perf frames3d` now ray-casts the whole scene at every spot. |
| PERF-11 | P2 | `src/view3d.js` `render` | The `webglcontextlost` event comes a task after the loss; a frame in between compiled programs on a lost context → three read a `null` info log → `TypeError` (`qa_perf ctxloss`, second loss). `onRenderError` turns 3D off after 3 errors. | **fixed**: `gl.isContextLost()` guard. Restore at Diwali night redraws fully (245 calls / 535k tris vs 254 / 555k before; screenshot). |
| PERF-12 | P2 | lazy files on the site | The pack / GLTFLoader / three fallback were fetched by fixed URL; GitHub Pages sends `max-age=600`, so for 10 minutes after a deploy a returning player could get the new page with an old pack (the index lists ids the pack may not have after a repack). | **fixed**: build writes `N.BUILD = {pack, loader, three, supabase}` (content hashes) into web.html; models3d.js / view3d.js append `?v=` over http(s). Deterministic (two builds byte-identical). supabase-js fallback → cross-lane (online.js). |
| PERF-27 | P1 | `src/models3d.js` `loadPack` / `src/view3d.js` `loadThree` | The core pack (7.5 MB, ~3 MB gzip: 17+ s on Slow 4G, ~60 s on 3G) loaded with a 20 s script timeout: on timeout the loop tried the next URL (`../src/…`, a 404 on the site), `loadPack` failed and models3d stayed `missing` for the session (the script then arrived for nothing). Reproduced under load on file://: the 7.5 MB script outlived 20 s → `file:///home/user/DS/src/assets3d_pack.js` 404 + console error (the one error of the 30-min soak). The local three.js fallback had 6 s (149 KB gzip on 3G ≈ 5 s + latency). | **fixed**: pack 180 s, local GLTFLoader / three.js 60 s; missing files still fail immediately (onerror). |
| PERF-28 | P2 | `src/view3d.js` `updateFx`, `src/view3d_actors.js` `updateBarks` | Five inline-style writes per 3D frame on the fx overlay even when unchanged; bark positioning read `offsetWidth/Height` right after the previous bark's style writes (a forced style + layout per bark per frame). | **fixed**: writes only on change; reads batched before writes. |
| PERF-29 | P2 | `src/view3d_ground.js` first 3D drive on a device that never used 3D | With the analysis now deferred to the first switch, the first 3D drive (phone 4x, 150 u/s) shows analysis steps up to 391 ms and road-emission steps up to 377 ms (worst seen); 42 of 126 frames > 100 ms JS, worst 1.56 s. | rec. (§5 items 1 and 9: finish splitting `piecesOfRoad` / `junctionPoly` / per-piece road emission; or Worker) |
| PERF-30 | P2 | 3D draw calls (`tests/view3d.cjs` dense Old City) | 375–382 calls walking in Laad Bazaar at 19:30 vs the ≤ 300 budget of ARCHITECTURE §20 — **fails on the HEAD sources too** (checked on a copy). Composition at a similar view: actor pools + procedural actors ~77, buildings 32, tree trunks / canopies / crowns 76 (3 instanced meshes per chunk, ×2 with the shadow pass), landmarks 24, ground 36, wires 12. | rec. (merge tree instancing per 2×2 chunks, cap shadow casters to near chunks, fewer actor pools) |
| PERF-31 | P2 | `src/view3d.js` 3D camera vs foliage (gameplay audit X5 #2) | Tree canopies (and trunks) between the chase camera and Chinnu hid him completely (`qa_perf_foliage_off.png`, Indira Park). | **fixed**: foliage see-through cone round the camera → head line: fragments inside it are screen-door dithered down to 25 % (radius 5.5 u at the player, 8 u in a vehicle; third person only, not in cutscenes / title). Core canopies / crowns / trunks (`nearFade`) and the Blender trees (`models3d_props.windMaterial`, via `H.occFade`); shadows unaffected; `quality.seeThrough` toggles it. `qa_perf_foliage_seethrough.png`: Chinnu visible through the trunk. |
| PERF-32 | P2 | `src/view3d.js` three.js load order (X5 #3, J16) | jsDelivr was tried first: offline / blocked / from file:// it logged `ERR_TUNNEL_CONNECTION_FAILED` / `Failed to load resource` before falling back, and cost a DNS + TLS handshake to a third origin online. | **fixed**: vendored same-origin copy first (pages under dist/ try `../` first), CDN last; `tests/view3d.cjs` and ARCHITECTURE §20 updated. |
| PERF-33 | P3 | `src/view3d.js` view pill (X5 #1) | The touch pill read "FPS" for first person (reads as frames per second). | **fixed**: "1st" (2D / 3D / 1st). |
| PERF-34 | P2 | 3D mission markers on roofs (journey audit J16) | 2D marker lights (missions `draw` → `R.lights`, no height) became 3D point lights 8 u above the **street** under a terrace goal (the M1 kite spot glowed at street level at dusk); markers whose target names its roof (`level`, a terrace place's `roof`, `{h, roof}`) only used the roof cell under the spot. | **fixed**: height-less 2D lights on a roof cell are lifted to roof + 8 u; `view3d_actors` places the marker at the roof its target names (story.js' own rule), else the roof under the spot (`markerBase`; checked: home terrace marker at y = 33 = roof). Suggestion to journey lane: pass `h: rg.h` in `rings3d` (story.js ~2645) — `markerBase` honours it. |
| PERF-13 | P3 | `src/view3d.js` sign atlas upload | Each new board marks its 2048×1024 page dirty → the whole page (+ mipmaps) is re-uploaded (cheap from a GPU-backed canvas, costly where the canvas is CPU-backed: 1.2–1.5 ms of `texSubImage2D` per frame averaged here); 6 pages ≈ 64 MB of GPU memory on desktop (phones 4 × 1024×512 ≈ 11 MB). | rec. (sub-rectangle upload via `copyTextureToTexture`, 4 pages now that cells recycle) |
| PERF-14 | P2 | first 3D frame (`switch3d`) | 54 shader programs desktop (27 Lambert variants, 12 shadow-depth), 36 phone, compiled synchronously in the first 3D frames (three r149, no `KHR_parallel_shader_compile`): 1.2 s of JS in `WebGLProgram` on SwiftShader; first-time switch 23 s wall / 3.3 s main-thread CPU desktop (load 25), 17.7 s / 12.8 s CPU phone. | rec. (compile during warm-up in slices; program dedupe; three ≥ r158 `compileAsync`) |
| PERF-15 | P2 | `src/dialogue.js` `placeBarks` (cross-lane: gameplay), `src/hud.js` `dodgeBarks` / `collectKeepOut` | `getBoundingClientRect` every frame after DOM writes = a forced synchronous layout: 0.1–0.4 ms/frame typical, **2.7–6.6 ms/frame** in two 3D profiles (Charminar night). | cross-lane: read rects once per frame before any writes (or cache them, invalidate on resize). |
| PERF-16 | P2 | GC churn (cross-lane: entities / traffic / vehicles) | 2D Koti peak: **36 MB/s** allocated (3.8 MB per frame at ~4 steps); top: `entities.query` 430 KB/frame, `resolveOverlaps` 260, `trafficCtl` 250, iterator objects 240, `collidePeople` / `collideVehicles` 150 each. 3D adds little (`view3d_actors.personEntity` ~100 KB/frame, `birds.restBird` ~50). | cross-lane: reusable result arrays in `entities.query` / collision passes, index loops instead of `for…of` on Maps in hot paths. |
| PERF-17 | P2 | 3D camera (`src/view3d.js` `camCollide`) | The camera ray tests the height grid + landmark meshes only: it ends up **inside parked buses** (Koti bus stand, `qa_perf_3d_koti_peak.png`) and **inside Numaish stall canopies** (`qa_perf_3d_numaish_evening.png`: half the screen is a canopy). Near glow points render as big flat octagons. | rec. (camera collision / near-fade for vehicles and festival layers) |
| PERF-18 | P2 | delivery | No service worker: offline load fails; repeat visits revalidate and re-run the whole boot (title 3.6–5.6 s at 4x, CPU-bound). Fonts: render-blocking Google css2 (index.html, shared). | rec. (§5; earlier study measured repeat 0 B / offline title 2.5–4.4 s with a SW) |
| PERF-19 | P2 | `src/assets3d_pack.js` | Core models ship as base64 in JS: 7.5 MB raw / 3.0 MB gzip, +33 % string memory and an `atob` copy before parsing; binary GLB measured 14–25 % smaller after compression. | rec. |
| PERF-20 | P2 | 3D quality presets | Tier is automatic (coarse pointer + small screen or ≤ 4 cores → low); a desktop with a weak iGPU gets high (2048² PCF shadows, 1500 u) and only adaptive pixel ratio / draw distance; no user-facing 3D quality setting; shadows never drop adaptively. | rec. |
| PERF-21 | P3 | `src/view3d.js` `signFont` | `document.fonts.check` per board, ~1 ms each (~90 ms inclusive of a chunk-heavy switch). | **fixed** (cached once Yatra One is in; else re-asked at most once a second) |
| PERF-22 | P3 | `src/core.js` window `error` / `unhandledrejection` | pushed into `N.errors` without the 50-entry cap `N.err` has: a handler throwing every frame grows it all session. | **fixed** |
| PERF-23 | P3 | `src/models3d.js` env map | The PMREM environment (chrome reflections) is a render target: after a context restore it was not re-rendered (metal reads dark), and a PMREM pass on a lost context threw in `prepare`. | **fixed**: skipped while the context is lost, re-rendered on `view3d:contextrestored`. |
| PERF-24 | P3 | storage | localStorage after play: 4 keys, 4.6 K chars (two save slots 2.3 K each); no IndexedDB, Cache Storage or service worker anywhere. Full quota (every `setItem` throws `QuotaExceededError`): save returns false, view / weather settings carry on, no errors. | ok |
| PERF-25 | P3 | build / deploy | `tools/build.mjs` byte-reproducible (two builds identical incl. `dist/lazy3d`); `deploy_site.sh --dry-run` carries the pack, three.js + GLTFLoader, supabase-js fallback and all 30 lazy GLBs; every relative file URL in the page exists in `dist/site`. | ok (checked by `qa_perf build`) |
| PERF-26 | P3 | measurement hooks | No way to see per-system or per-3D-phase cost in the page. | **fixed**: `N.systems.profile()`, `N.view3d.profile()`, `N.view3d.ground.stats().itemMax`, `N.view3d.signCheck()`, `N.view3d.ground.precompute(ms)` |

---

## 2. Measurements

### 2.1 Loading (mid-range phone emulation, 4x CPU, `tools/perf/measure.cjs`, brotli server, n = 2 per cell, NICE=0)

Same working tree; `before` = `node tools/build.mjs --no-strip`, `after` = the stripped page. Fonts stubbed.

| network | variant | bytes | HTML downloaded | FCP (boot splash) | title usable | main-thread CPU to title |
|---|---|---|---|---|---|---|
| Slow 4G | before | 1925 KB | 11.6 / 11.7 s | 1.38 / 1.43 s | **15.0 / 15.6 s** | 12.6 / 11.9 s |
| Slow 4G | after | 1574 KB | 9.6 / 9.8 s | 1.34 / 1.57 s | **12.6 / 13.7 s** | 10.1 / 9.8 s |
| Fast 4G | before | 1925 KB | 2.6 / 3.0 s | 0.65 / 0.64 s | 5.3 / 6.6 s | 5.1 / 5.8 s |
| Fast 4G | after | 1574 KB | 2.3 / 2.1 s | 0.57 / 0.53 s | 5.1 / 5.3 s | 5.2 / 5.7 s |

Repeat visits (HTTP cache, 304): title 3.6–5.6 s in both — pure boot CPU. PLAY → name card 0.8–1.6 s, START →
first game frame 0.4–0.9 s, SKIP → free roam 0.3–0.8 s (4x).

Bytes on the site (raw / gzip -9): `index.html` 7.18 MB / 2.16 MB (was 8.37 / 2.52); `src/assets3d_pack.js` 7.5 MB /
3.0 MB (loaded on the first 3D switch); three.min.js 594 KB / 149 KB (same-origin copy first since PERF-32; was
jsDelivr first); 30 lazy GLBs 1.05 MB (fetched per landmark in range). Boot (file://, `qa_perf boot`), two final
runs on a quieter host: desktop title at 1.02–1.65 s (DCL 0.25–0.56 s), main-thread CPU 1.29–1.33 s, `world.build`
0.54–0.88 s, heap after GC 87.2–87.4 MB, longest task 0.77–1.09 s, title → first controllable move 0.65–0.67 s;
phone 4x 3.5–3.6 s / 4.3–5.3 s CPU / `world.build` 2.0–2.1 s / 87–88 MB / longest task 2.8–3.0 s / first move
0.84–1.05 s. Earlier runs at load ~30: desktop 5.05 s / 1.66 s CPU / `world.build` 3.0 s, phone 7.0 s / 4.0 s CPU /
3.7 s (the CPU numbers are the stable ones).

### 2.2 2D frames (`frames2d`, per-system profiler; frame JS includes software raster)

| spot | desktop frame JS median (steps/frame) | update ms / 60 Hz step | top systems (ms/step) | phone 4x frame median (steps) | update / step |
|---|---|---|---|---|---|
| Charminar 21:00 | 33.7 ms (4.0) | 3.8 | entities 1.1, vehicles 1.0 | 89 ms (5.7) | 7.6 |
| Numaish 19:30 (20 Jan) | 24.2 ms (3.7) | 3.2 | entities 1.0, vehicles 0.9 | 118 ms (5.8) | 10.1 |
| Diwali night (home colony) | 24.3 ms (3.4) | 3.0 | entities 0.85, **diwali 0.51** | 69 ms (5.4) | 5.2 |
| Koti 18:10 (jam) | 39.2 ms (4.3) | 6.9 | entities 2.8, hud 0.9, vehicles 1.2 | 95 ms (5.9) | 9.1 |

My-lane systems in 2D are small: `diwali` 0.5–0.7 ms/step on Diwali night, `wires` draw 0.2–0.6 ms/frame,
`citylife_events` 0.25 ms/step, `birds` ≤ 0.4, `weather2d` draw up to 2 ms/frame at 4x (rain off).

### 2.3 3D frames (`frames3d`, `N.view3d.profile`, pixel ratio 0.35, walking)

| spot | tier | calls | tris | view3d JS / frame | renderer.render | streaming | actors | parity layer | programs / textures / geometries |
|---|---|---|---|---|---|---|---|---|---|
| Charminar night | desktop | 233 | 796k | 45.7 ms | 29.2 | 1.5 | 4.2 | 2.6 | 59 / 80 / 222 |
| Numaish | desktop | 247 | 1082k | 25.5 ms | 19.1 | 0.9 | 1.9 | 1.6 | 68 / 105 / 310 |
| Diwali night | desktop | 258 | 560k | 42.8 ms | 34.4 | 1.0 | 3.6 | 1.1 | 76 / 119 / 307 |
| Koti peak | desktop | 334 | 882k | 22.5 ms | – | – | – | – | 75 / 125 / 354 |
| Charminar night | phone 4x | 111 | 384k | 50.0 ms | 25.8 | **10.5** | 3.9 | 3.4 | 43 / 46 / 133 |
| Numaish | phone 4x | 129 | 362k | 50.2 ms | 39.8 | 2.3 | 1.4 | 1.8 | 50 / 58 / 147 |
| Diwali night | phone 4x | 123 | 282k | 38.6 ms | 27.1 | 1.7 | 4.6 | 0.9 | 54 / 61 / 121 |
| Koti peak | phone 4x | 171 | 455k | 53.7 ms | 27.4 | **9.4** | 6.5 | 5.5 | 58 / 63 / 155 |

(`renderer.render` includes GL command issue that SwiftShader can block; the rest is pure JS.) LOD / culling as
built: whole 512 u chunks are frustum-culled (instanced trees / rocks / glow points are not culled per instance in
r149; chunks inside the shadow range stay visible to cast), chunk geometry has two detail levels and the ground two
LODs with hysteresis, batched small landmarks and mid-size models are `THREE.LOD`s hidden beyond 430–1700 u, people
have near / far LODs; on the phone tier the draw distance is 950 u, actors 400 u, landmarks 1100 u. Desktop is inside
the ≤ 300-call budget except Koti (334); phones need a lighter preset (PERF-06). CPU-profile (sample counts) of
Charminar night desktop: view3d `render` 10.3 ms/frame, of which three.js 6–7; `syncActors` 1.1; parity 1.0;
streaming 0.75; `dialogue.placeBarks` 2.75 (forced layout); birds 0.3, citylife_events 0.35, wind 0.2, wires 0.1,
weather3d 0.1.

### 2.4 Switching to 3D (`switch3d`, first time on the device)

Desktop: ready in 23.1 s wall / **3.3 s main-thread CPU** (load 25); warm-up 14 frames, worst 4.8 s (engine init:
renderer, materials, facade atlas, 10.5 M-cell camera height grid); first 3D frames 374 / 466 / 63 ms JS (program
compiles). Phone 4x: 17.7 s / 12.8 s CPU, first frames 287 / 127 / 156 ms; the road analysis was not done
(provisional ground until it is). Programs: 54 desktop {Lambert 27, depth 12, Basic 5, Shader 5, Points 2, Phong,
Line, Sprite}, 36 phone.

### 2.5 Memory

| state (desktop) | JS heap (V8) | ArrayBuffer backing | notes |
|---|---|---|---|
| top-down after boot | 87–97 MB | 22 MB | 16 MB external strings (inline script source), 11 MB code |
| + road analysis (old default) | +35.7 MB | – | now only on 3D devices |
| 3D, Abids, settled | 114 MB | 118 → **98 MB** | scene arrays: roads 16.4, buildings 6.0, landmarks 8.3 MB (before freeing) |

Soak and GPU resources: see §3.

### 2.6 Hitches (long tasks)

- 2D, first 20 s of play, worst single system updates seen: `citylife_events` 245 ms → moved to title idle (PERF-04),
  `entities` 509 ms and `hud` 335 ms once at Koti (cross-lane), `vehicles` 61–163 ms, `collectibles` 126 ms (4x).
- 3D streaming (`walk3d`): see §3.
- Title screen: `potholes` (progressive generation, cross-lane) 827 ms total with a 277 ms slice; `birds`
  `buildStatic` one 188 ms update (title only).

---

## 3. Long runs: soak, streaming, context loss

**Soak** (`ONLY=soak SOAK_MIN=30`, desktop, 3D at pixel ratio 0.25 / draw distance 900): 23 cycles in 30.9 min,
each cycle = one of the four busy spots (Charminar night, Numaish, Diwali night, Koti peak) in tps or fps, rain /
storm / clear, walking, back to top-down; a solo party race (chai run) every 5th cycle.

| t (min) | 0 | 6 | 11.6 | 16.4 | 21.3 | 26.8 | 30.9 (end, Charminar 3D) |
|---|---|---|---|---|---|---|---|
| JS heap after GC (MB, `performance.memory`) | 226.3 | 222.2 | 228.2 | 229.3 | 226.4 | 231.6 | 237.6 |
| geometries / textures | 317 / 77 | 317 / 77 | 315 / 84 | 324 / 90 | 337 / 94 | 319 / 96 | 214 / 90 |
| programs | 81 | 81 | 87 | 88 | 88 | 88 | 89 |
| scene objects / DOM nodes / entities | – | 1257 / 383 / 234 | 1266 / 403 / 233 | 1275 / 409 / 234 | 1261 / 403 / 235 | 1260 / 403 / 242 | – |

Linear fit 0.48 MB/min (budget 1.5) — flat within the sample noise from minute 6 on; GPU resources plateau
(the landmark LRU of 40 and the lazy-model LRU of 12 fill in the first rounds); `N.errors` stayed empty and
localStorage at 116 chars of non-save keys. The only console error was the pack-timeout 404 (PERF-27, fixed).

**Streaming** (`walk3d`, player carried along `chandrayangutta_rd` at 150 u/s of game time): phone 4x, first 3D
session on the device: 1875 u in 126 frames, frame JS median 86 ms, p95 305 ms, worst 1.56 s; streaming phase avg
7.9 ms, worst 70 ms; `renderer.render` worst 843 ms (new programs / uploads as new content enters); ground steps
worst [analysis 391, aux 50, roads 377, build 18, upload 61] ms → PERF-29. (The desktop run drew only 15 frames
in 60 s under SwiftShader at load 30: not quoted.)

**Context loss** (`ctxloss`, Diwali night 3D): lost → top-down at once; restored → 3D again, 245 calls / 542k tris
vs 257 / 581k before; a second loss right after the restore also recovers; no errors after the two fixes (PERF-11,
and the models3d env-map pass now skipped while the context is gone and re-rendered on `view3d:contextrestored`).
Screenshot `tests/out/qa_perf_ctx_restored.png` (the Diwali lane, rangoli, diyas, kandil: correct).

---

## 4. What changed (files) and how it was verified

| file | change |
|---|---|
| `src/view3d.js` | `N.view3d.profile()` (per-phase JS: camera / sky / work / actors (+ per kind) / lmUpdate / layer:<id> / cull / render); ref-counted, recyclable sign-atlas cells (a chunk's boards kept on few pages; `H.onSignsFull` reclaimers; 4 pages on the low tier, was 3) + `releaseSigns` / `signCheck()` / `signsRecycled`, `signsDropped`, `signsPinned` in `stats()`; `freeOnUpload` for core chunk geometry (`Q.keepArrays`); `isContextLost()` guard in `render` + `view3d:contextrestored` event; `nostalgia.view3d.used` flag; cached `signFont`; fx overlay styles written only on change; three.js vendored-first (`?v=` content hash, 60 s local timeout, CDN last); foliage see-through cone (`quality.seeThrough`, `H.occFade`); height-less 2D lights lifted to roof level; pill label "1st". |
| `src/view3d_ground.js` | frame-time precompute only when 3D is likely; resumable dedupe / cluster (path compression) / trims / footpath clearance (`clearPieceStep`); per-item maxima `stats().itemMax`; `precompute(ms)`; road meshes free their arrays after upload (and are skipped by ray casts). |
| `src/view3d_landmarks.js` | landmark signboards hold their atlas cells (`signSlots`) while the model exists (scene or LRU), release on dispose / eviction / decor clear / `measure`; a full atlas evicts the oldest cached off-scene model with boards (`reclaimSigns` via `H.onSignsFull`). |
| `src/diwali.js` | particle `Points` and cracker instances upload only the used range; nothing while empty. |
| `src/citylife_events.js` | sites built in title idle time a step at a time; `registerAudio` decoupled from the ready transition. |
| `src/models3d.js` | `?v=` content hash on the pack / GLTFLoader URLs (website build); pack timeout 20 → 180 s, local loader 8 → 60 s; no PMREM pass on a lost context, env map re-rendered after a restore. |
| `src/view3d_actors.js` | bark sizes read in one pass before any style write; mission markers at the roof their target names (`markerBase`). |
| `src/models3d_props.js` | Blender tree materials get the foliage see-through cone (`H.occFade`). |
| `tests/view3d.cjs` | expects three.js from the vendored copy first (was: CDN first); the missing-three.js fallback holds the key up to 45 s (the GPU-rastered 2D canvas draws a frame every few seconds under SwiftShader + load: it failed on the HEAD sources too, 0 u moved in 6 s with no frame drawn); the long-trip texture budget counts the new ground's per-chunk surface maps separately (≤ 1 per chunk) from the rest (< 160, the old total budget predates them). |
| `tests/view3d_landmarks.cjs` | the city-walk check no longer expects view3d_landmarks.js to build landmarks that models3d draws with Blender models (`#<id>` overrides / `m3d-lm:` objects, collected along the walk). |
| `tests/view3d_actors.cjs` | "pigeons at Charminar" counts src/birds.js' 3D pigeons (it took the flocks over from traffic / landmarks on 10-19, so the legacy actor pass draws none). |
| `src/core.js` | `N.systems.profile()`; window error log capped at 50. |
| `tools/build.mjs` | `stripJs` for `dist/web.html` (+ `--no-strip`), `N.BUILD` content hashes, deterministic. |
| `tests/qa_perf.cjs` | new audit / regression harness with budgets (draw calls, triangles, programs, heap, sign atlas integrity, scene-wide ray casts, soak growth, streaming slice, background slice, bytes, reproducible build, deploy completeness, stripped-script AST equivalence, context loss, full quota). |
| `tests/view3d_ground.cjs` | the precompute check runs as a returning-3D device and finishes with explicit top-down slices (the headless page draws ~1 frame/s, so it failed before this pass too: verified on a copy with the HEAD sources); the provisional-build timing is load-gated like its neighbours. |

**Test results** (final tree; most suites at host load 12–25; "pre-existing" = also fails on a same-time copy of the tree
with the HEAD versions of my files, run side by side):

| suite | result | notes |
|---|---|---|
| `tests/qa_perf.cjs` (default: `boot idle2d switch3d frames3d ctxloss storage build`), final tree, quiet host | **50 ok / 0** | desktop title 1.02 s / boot CPU 1.33 s / heap 87.2 MB; phone 3.6 s / 5.3 s CPU; 3D ready 10.7 s (2.7 s CPU) desktop, 52 / 35 programs; Charminar night 230 calls, Koti 249 (phone 104 / 123); scene-wide ray casts ok; sign atlas 0 dropped / 0 stale |
| `tests/qa_perf.cjs` (`ONLY=boot,idle2d,switch3d,frames3d,ctxloss,storage`, all four spots, loaded host) | 47 ok / 1 fail → fixed | the fail: phone sign atlas dropped 20 boards after the four spots → LRU reclaim + 4 low-tier pages; `ONLY=frames3d` both profiles, four spots: **22 ok / 0** (0 dropped) |
| `tests/qa_perf.cjs` (`ONLY=build`) | **11 ok / 0** | reproducible build, deploy dry run (34 lazy files incl. 30 GLBs), byte budgets, 66 stripped scripts AST-identical, `N.BUILD` |
| `tests/qa_perf.cjs` soak (30 min) / walk3d / ctxloss | ok (§3) | soak ran before the last sign-atlas / ray-cast changes; ctxloss also passes in the final default run |
| `tests/smoke.cjs` | **45 ok / 0** | |
| `tests/lazy3d.cjs` | **22 ok / 0** | the stripped site page + `?v=` URLs load the lazy GLBs |
| `tests/citylife_events.cjs` | **76 ok / 0** | |
| `tests/core_systems.cjs` | 87 ok / 2 → rerun **89 ok / 0** | the two (dialogue ACTION → choice line) were timing under load |
| `tests/citylife.cjs` | 124 ok / 2 → rerun of the two scenes **32 ok / 0** | saloon sitter / roadwork flow: timing under load |
| `tests/view3d.cjs` | 51 ok / 3 → after the test fixes 41 ok / 2 (+ landscape rerun **11 ok / 0**) | 3 failed on the HEAD sources too: dense Old City 376–380 calls > 300 (**still failing**: PERF-30, real), long-trip textures 196 > 160 (budget predated the new ground's per-chunk surface maps: now judged apart, passes: ground 48 ≤ 1 per chunk + 150 others < 160), "top-down play continues" (test window too short for the GPU-rastered 2D canvas here: passes with a longer hold). The second full run's landscape section hit a 30 s `page.tap` timeout while three suites shared the host (3D frames of 2–13 s); alone it passes |
| `tests/view3d_landmarks.cjs` | 9 ok / 1 → city walk after the test fix **4 ok / 0** | the walk check expected view3d_landmarks.js to build landmarks models3d draws (51 such); failed on the HEAD sources too |
| `tests/view3d_ground.cjs` | **55 ok / 0** | first run after `freeOnUpload` reached the roads: the lane-contrast probe's scene-wide ray cast threw (fixed: PERF-10) |
| `tests/view3d_actors.cjs` | 111 ok / 2 → desktop part after the test fix **51 ok / 0** | "pigeons at Charminar" (0 → 111 birds counted: birds.js draws them since 10-19); still failing, pre-existing (same on the HEAD copy): "getting on: the hips bend … seated" (Chinnu's cycle: hips end at 0.43–0.66 rad, test wants > 0.9) |
| `tests/models3d.cjs` | 48 ok / 4 | **pre-existing** (same on the HEAD copy): the four `riders` checks (NPC / Chinnu on Blender cycles: `key null`) |
| `tests/diwali.cjs` | 88 ok / 11 | **all 11 pre-existing** (elder heat; colony houses / families / paper / 3D houses; Koti stalls lit / paper / 3D stalls; stall phuljhadi box / 3D stalls; Tank Bund paper) |
| `tests/engine_qa.cjs` | 61 ok / 2 | 2D night-drive JS budgets 8.5 / 12.5 ms vs 54 / 36 ms here; the HEAD-version copy measured 139 / 104 ms at the same time (host-bound) |

---

## 5. Recommended next steps (in order of value per effort)

1. **Phone 3D preset** (PERF-06): on the low tier cap actors (~40 nearest), actor range 400 → 300 u, landmark range
   1100 → 800 u, skip the parity extras beyond 150 u, one shared material for far chunks; offer "3D quality: Lite /
   Full" in Settings; keep 3D opt-in on phones until a device run (`tools/perf/measure.cjs` steps `3d,frames3d` on a
   real phone over remote debugging) shows ≥ 30 fps.
2. **Cap fixed-step sub-steps** (PERF-07, main.js owner): 2 on the low tier, 3 elsewhere; let game time slow down.
3. **Lazy chunks for the website build** (PERF-05 continued): ship `view3d*` / `models3d*` / `festivals3d` /
   `weather3d` (~1 MB raw, ~230 KB gzip) and the activities (minigames, cricket, playground games, funfair, party
   races, latehome: ~1.7 MB raw) as separate content-hashed files loaded on demand (three ordered chunks, not 66
   files: the 10-17 study measured +9 % bytes and a starved stylesheet with 36 parallel requests). Then minify
   (identifier mangling) with a vendored minifier at build time only.
4. **Service worker** (PERF-18): precache the page + hashed lazy files, network-first for `index.html`; offline
   play and 0-byte repeat visits (measured in the 10-17 study).
5. **`world.build` off the critical path** (PERF-08, world lane): serialise the grids at build time or build behind
   the title in slices.
6. **First 3D frame** (PERF-14): compile programs during the warm-up a few materials per frame (`renderer.compile`
   on a scene holding one mesh per material) while the 2D view is still up; dedupe Lambert variants (fog / vertex
   colour / flat combinations); a later three.js upgrade brings `compileAsync` with `KHR_parallel_shader_compile`.
7. **Sign atlas uploads** (PERF-13): paint a board into a 512×64 scratch canvas and `copyTextureToTexture` it into
   its cell (128 KB instead of 8 MB + mipmaps per board); on desktop 4–5 pages may do now that cells recycle (the
   four busy spots held ~384 distinct boards: measure with `signCheck()` before cutting).
8. **Camera** (PERF-17): include parked vehicles and festival layer meshes in the camera ray (or give them the
   near-fade the facade / trunk shaders have); clamp glow point size near the camera.
9. **Remaining analysis items** (PERF-02): split `piecesOfRoad` by edge for the few very long roads and
   triangulate big merged junctions in a second pass; or move the analysis to a Worker (it needs no THREE).
10. **Memory** (PERF-10): free the ground's 256² surface maps on the high tier (only the low tier re-bakes them),
    drop the models3d GLB source buffers after parse, binary GLB for the core pack (PERF-19).
11. **Forced layouts / GC** (PERF-15 / 16, gameplay owners): one rect read per frame for the barks; reusable arrays
    in `entities.query` and the collision passes.
12. **Quality fallbacks** (PERF-20): drop the shadow map when frames stay slow at the minimum pixel ratio; treat
    `WEBGL_debug_renderer_info` = SwiftShader / llvmpipe as "3D unavailable (software GL)".

Cross-lane items (owner, file:line, suggestion):

- engine / main loop — `src/main.js:120-125` (`frame`): cap `n` sub-steps (PERF-07).
- world — `src/world.js` `W.build` (~line 1391-1678): cache / slice the grid build (PERF-08).
- gameplay (dialogue) — `src/dialogue.js:999-1003` `placeBarks`: `getBoundingClientRect` per bark per frame after
  DOM writes; read once per frame before writing (PERF-15).
- gameplay (hud) — `src/hud.js:616-638` `collectKeepOut` / `dodgeBarks`: same pattern (PERF-15).
- gameplay (entities / traffic / vehicles) — `src/entities.js:69` `query` (returns a new array per call),
  `:130` `resolveOverlaps`, `src/traffic.js:756` `trafficCtl`, `src/vehicles.js:533/588` collisions: allocation
  hot spots (PERF-16).
- online — `src/online.js:215` vendored `supabase.js` fallback: append `'?v=' + N.BUILD.supabase` when present
  (PERF-12).
- shared `index.html` — Google Fonts css2 is render-blocking; self-host subset fonts (the 10-17 study:
  ~45 KB, splash 1.6 s sooner on 3G) (PERF-18).
- world (potholes) — progressive pothole generation runs 277 ms slices on the title screen.
- journey (story) — `src/story.js` ~2645 `rings3d`: pass `h: rg.h` so roof goals need no inference (PERF-34).

Failing tests that also fail on the HEAD sources (not caused by this pass; for their owners):

- Diwali (festival lane, functional) — `tests/diwali.cjs` 11: home-colony decorated houses / families / paper / 3D
  houses, Koti stalls lit / paper / 3D stalls, the ₹5 phuljhadi box, Tank Bund paper, elder + Chappal Meter heat:
  houses, stalls and families never appear at the test spots (0 in view), so the paper / purchase checks fail after them.
- Blender riders (models / vehicles lanes) — `tests/models3d.cjs` `riders` (4: NPC man and Chinnu on Blender cycles
  route as `null`) and `tests/view3d_actors.cjs` "getting on … seated" (Chinnu's own cycle: hips end at 0.43–0.66 rad,
  > 0.9 expected): `src/models3d.js` `riderModel` / `route` (~742-990) vs the `chinnu_cycle` / `hero_cycle` set-up.
- 3D draw calls (this lane, PERF-30) — `tests/view3d.cjs` dense Old City 376–380 > 300.
- engine QA budgets — `tests/engine_qa.cjs` 2D night drive 8.5 / 12.5 ms JS per frame cannot be judged on a
  SwiftShader host under load (it measured 54–139 ms with or without this pass); gate it on load like view3d.cjs.
