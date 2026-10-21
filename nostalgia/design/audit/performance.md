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

**Round 2 (§6)** closed the cross-lane items: sub-steps capped (phone 4x: 6 → 2 per frame), the world built in
~40 ms slices behind the splash (longest boot task 3.0–3.5 s → 0.34–0.38 s at 4x), forced layouts per frame 6–8 → ~1.4
(2D) and ~11 → ~0.6 (3D), ~20 % less allocation per simulated second, the camera kept out of buses and stalls, dense
Old City 373–380 → 286–297 draw calls (≤ 300), self-hosted font subsets (no third origin), and the pre-existing test
failures (diwali, Blender riders, engine_qa budgets, Café Gulistan walk, SA1 grace) with root causes. Still open:
3D on phones (PERF-06), lazy chunks / minification, the service worker, first-3D-frame compiles, glow-point octagons.

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
| PERF-07 | P1 | `src/main.js` fixed step (cross-lane: engine / gameplay) | dt clamp 0.1 s split into ≤1/60 s sub-steps: on the 4x phone 2D runs **5.4–5.9 sub-steps per frame**, desktop-under-load 3.4–4.3 — the classic spiral (slow frame → more simulation → slower frame). | **fixed (round 2, §6.1)**: at most 2 sub-steps per frame on the low tier, 3 elsewhere; the rest of a long frame is dropped (game time slows instead). Phone 4x 2D: 5.4–6 → 2 steps, frame JS median −13…−38 %. |
| PERF-08 | P1 | `world.build` at boot (cross-lane: world lane) | 3.0 s (desktop, loaded host) / 3.7 s (phone 4x) of the 5.1 / 7.0 s to the title; the 10-17 study measured 2.3–2.5 s at 4x on a quiet host. | **fixed (round 2, §6.3)**: `N.world.buildAsync` builds the same world in ~40 ms slices behind the boot splash (identical fingerprint). Longest boot task desktop 683–830 → 78–147 ms, phone 4x 3.0–3.5 s → 0.34–0.38 s; time to title about the same (the work is still done, now interruptible). |
| PERF-09 | P2 | `src/diwali.js` `ptCommit` + cracker instances | Sparks / glows / smoke `Points` uploaded their **whole** Float32Arrays (22 200 + 22 200 + 14 800 floats ≈ 230 KB) every 3D frame, every day of the year (layer runs when Diwali is off); cones / cylinders re-sent with count 0; a `updateRange.count` of 0 would upload the whole array in WebGL2. | **fixed**: used range only, nothing (and hidden) when empty. |
| PERF-10 | P2 | `src/view3d.js` / `view3d_ground.js` chunk geometry | three keeps every attribute array in JS memory after upload: 3D desktop at Abids = 114 MB JS heap + **118 MB ArrayBuffers** (roads 16 MB, buildings 6 MB, landmarks 8 MB of the scene's 35 MB; the rest: models3d buffers, 256² ground maps per chunk ≈ 11 MB, the 10.5 MB camera height grid, analysis). | **fixed (partly)**: core-built `buildings` / `signs` / `glows` and the ground's road meshes drop their arrays after the first upload (`freeOnUpload`; bounds computed first; chunks are rebuilt on LOD change / context restore anyway): 118 → 98 MB right after settling, more as unseen chunks get drawn. `Q.keepArrays` for A/B. Those objects are ray-transparent (`raycast` no-op): three's raycast would read the dropped arrays — a scene-wide ray cast in `tests/view3d_ground.cjs` (lane contrast) threw a `TypeError` on the first cut; the game itself ray-casts landmarks only. `qa_perf frames3d` now ray-casts the whole scene at every spot. |
| PERF-11 | P2 | `src/view3d.js` `render` | The `webglcontextlost` event comes a task after the loss; a frame in between compiled programs on a lost context → three read a `null` info log → `TypeError` (`qa_perf ctxloss`, second loss). `onRenderError` turns 3D off after 3 errors. | **fixed**: `gl.isContextLost()` guard. Restore at Diwali night redraws fully (245 calls / 535k tris vs 254 / 555k before; screenshot). |
| PERF-12 | P2 | lazy files on the site | The pack / GLTFLoader / three fallback were fetched by fixed URL; GitHub Pages sends `max-age=600`, so for 10 minutes after a deploy a returning player could get the new page with an old pack (the index lists ids the pack may not have after a repack). | **fixed**: build writes `N.BUILD = {pack, loader, three, supabase}` (content hashes) into web.html; models3d.js / view3d.js append `?v=` over http(s). Deterministic (two builds byte-identical). supabase-js fallback → cross-lane (online.js). |
| PERF-27 | P1 | `src/models3d.js` `loadPack` / `src/view3d.js` `loadThree` | The core pack (7.5 MB, ~3 MB gzip: 17+ s on Slow 4G, ~60 s on 3G) loaded with a 20 s script timeout: on timeout the loop tried the next URL (`../src/…`, a 404 on the site), `loadPack` failed and models3d stayed `missing` for the session (the script then arrived for nothing). Reproduced under load on file://: the 7.5 MB script outlived 20 s → `file:///home/user/DS/src/assets3d_pack.js` 404 + console error (the one error of the 30-min soak). The local three.js fallback had 6 s (149 KB gzip on 3G ≈ 5 s + latency). | **fixed**: pack 180 s, local GLTFLoader / three.js 60 s; missing files still fail immediately (onerror). |
| PERF-28 | P2 | `src/view3d.js` `updateFx`, `src/view3d_actors.js` `updateBarks` | Five inline-style writes per 3D frame on the fx overlay even when unchanged; bark positioning read `offsetWidth/Height` right after the previous bark's style writes (a forced style + layout per bark per frame). | **fixed**: writes only on change; reads batched before writes. |
| PERF-29 | P2 | `src/view3d_ground.js` first 3D drive on a device that never used 3D | With the analysis now deferred to the first switch, the first 3D drive (phone 4x, 150 u/s) shows analysis steps up to 391 ms and road-emission steps up to 377 ms (worst seen); 42 of 126 frames > 100 ms JS, worst 1.56 s. | rec. (§5 items 1 and 9: finish splitting `piecesOfRoad` / `junctionPoly` / per-piece road emission; or Worker) |
| PERF-30 | P2 | 3D draw calls (`tests/view3d.cjs` dense Old City) | 375–382 calls walking in Laad Bazaar at 19:30 vs the ≤ 300 budget of ARCHITECTURE §20 — **fails on the HEAD sources too** (checked on a copy). Composition at a similar view: actor pools + procedural actors ~77, buildings 32, tree trunks / canopies / crowns 76 (3 instanced meshes per chunk, ×2 with the shadow pass), landmarks 24, ground 36, wires 12. | **fixed (round 2, §6.5)**: models3d batches the members of one landmark model per 768 u cell into InstancedMeshes (Laad Bazaar's 4 bangle shops: 95 + 96 → 24 + 24 calls), chunk glow points frustum-culled: the same view 344–353 → 266–275 calls. |
| PERF-31 | P2 | `src/view3d.js` 3D camera vs foliage (gameplay audit X5 #2) | Tree canopies (and trunks) between the chase camera and Chinnu hid him completely (`qa_perf_foliage_off.png`, Indira Park). | **fixed**: foliage see-through cone round the camera → head line: fragments inside it are screen-door dithered down to 25 % (radius 5.5 u at the player, 8 u in a vehicle; third person only, not in cutscenes / title). Core canopies / crowns / trunks (`nearFade`) and the Blender trees (`models3d_props.windMaterial`, via `H.occFade`); shadows unaffected; `quality.seeThrough` toggles it. `qa_perf_foliage_seethrough.png`: Chinnu visible through the trunk. |
| PERF-32 | P2 | `src/view3d.js` three.js load order (X5 #3, J16) | jsDelivr was tried first: offline / blocked / from file:// it logged `ERR_TUNNEL_CONNECTION_FAILED` / `Failed to load resource` before falling back, and cost a DNS + TLS handshake to a third origin online. | **fixed**: vendored same-origin copy first (pages under dist/ try `../` first), CDN last; `tests/view3d.cjs` and ARCHITECTURE §20 updated. |
| PERF-33 | P3 | `src/view3d.js` view pill (X5 #1) | The touch pill read "FPS" for first person (reads as frames per second). | **fixed**: "1st" (2D / 3D / 1st). |
| PERF-34 | P2 | 3D mission markers on roofs (journey audit J16) | 2D marker lights (missions `draw` → `R.lights`, no height) became 3D point lights 8 u above the **street** under a terrace goal (the M1 kite spot glowed at street level at dusk); markers whose target names its roof (`level`, a terrace place's `roof`, `{h, roof}`) only used the roof cell under the spot. | **fixed**: height-less 2D lights on a roof cell are lifted to roof + 8 u; `view3d_actors` places the marker at the roof its target names (story.js' own rule), else the roof under the spot (`markerBase`; checked: home terrace marker at y = 33 = roof). `rings3d` (story.js) now passes `h: rg.h` (round 2, §6.8). |
| PERF-13 | P3 | `src/view3d.js` sign atlas upload | Each new board marks its 2048×1024 page dirty → the whole page (+ mipmaps) is re-uploaded (cheap from a GPU-backed canvas, costly where the canvas is CPU-backed: 1.2–1.5 ms of `texSubImage2D` per frame averaged here); 6 pages ≈ 64 MB of GPU memory on desktop (phones 4 × 1024×512 ≈ 11 MB). | rec. (sub-rectangle upload via `copyTextureToTexture`, 4 pages now that cells recycle) |
| PERF-14 | P2 | first 3D frame (`switch3d`) | 54 shader programs desktop (27 Lambert variants, 12 shadow-depth), 36 phone, compiled synchronously in the first 3D frames (three r149, no `KHR_parallel_shader_compile`): 1.2 s of JS in `WebGLProgram` on SwiftShader; first-time switch 23 s wall / 3.3 s main-thread CPU desktop (load 25), 17.7 s / 12.8 s CPU phone. | rec. (compile during warm-up in slices; program dedupe; three ≥ r158 `compileAsync`) |
| PERF-15 | P2 | `src/dialogue.js` `placeBarks` (cross-lane: gameplay), `src/hud.js` `dodgeBarks` / `collectKeepOut` | `getBoundingClientRect` every frame after DOM writes = a forced synchronous layout: 0.1–0.4 ms/frame typical, **2.7–6.6 ms/frame** in two 3D profiles (Charminar night). | **fixed (round 2, §6.2)**: a systems `read()` phase at the start of the frame (before any update / draw writes); rects cached (time + frame gated, invalidated on resize / view change). Forced layouts: 2D Koti with 4 barks 5.8–6.4 → 0.2 per frame, 3D Charminar night 11.7 → ≤ 1.1 per frame. |
| PERF-16 | P2 | GC churn (cross-lane: entities / traffic / vehicles) | 2D Koti peak: **36 MB/s** allocated (3.8 MB per frame at ~4 steps); top: `entities.query` 430 KB/frame, `resolveOverlaps` 260, `trafficCtl` 250, iterator objects 240, `collidePeople` / `collideVehicles` 150 each. 3D adds little (`view3d_actors.personEntity` ~100 KB/frame, `birds.restBird` ~50). | **fixed (partly, round 2, §6.2)**: `N.entities.queryN` into caller-owned buffers, index loops, reused bump info / scratch, fields read once (no boxed doubles): 2D Koti 2.30–2.42 → 1.90–1.94 MB per frame. Left: `trafficCtl` ~110 KB/frame, render queue ~270 KB/frame (render.js). |
| PERF-17 | P2 | 3D camera (`src/view3d.js` `camCollide`) | The camera ray tests the height grid + landmark meshes only: it ends up **inside parked buses** (Koti bus stand, `qa_perf_3d_koti_peak.png`) and **inside Numaish stall canopies** (`qa_perf_3d_numaish_evening.png`: half the screen is a canopy). Near glow points render as big flat octagons. | **fixed (round 2, §6.4)**: the camera also collides with cars / autos / buses / lorries (oriented boxes) and with SOLID cells stamped at run time (festivals3d registers Numaish stalls with `camSolids`, kept 3 u away). Koti bus stand: camera inside a bus 9 of 48 spots → 0. Glow points are frustum-culled per chunk (the octagons not addressed). |
| PERF-18 | P2 | delivery | No service worker: offline load fails; repeat visits revalidate and re-run the whole boot (title 3.6–5.6 s at 4x, CPU-bound). Fonts: render-blocking Google css2 (index.html, shared). | fonts **fixed (round 2, §6.7)**: self-hosted OFL subsets in `vendor/fonts/` (217 KB for 19 files vs 766 KB of Google's for the same subsets; only the subsets a page shows download), `font-display: swap`, no third origin. Service worker: rec. (§5; earlier study measured repeat 0 B / offline title 2.5–4.4 s with a SW) |
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
2. ~~**Cap fixed-step sub-steps** (PERF-07, main.js owner): 2 on the low tier, 3 elsewhere; let game time slow down.~~
   Done in round 2 (§6.1).
3. **Lazy chunks for the website build** (PERF-05 continued): ship `view3d*` / `models3d*` / `festivals3d` /
   `weather3d` (~1 MB raw, ~230 KB gzip) and the activities (minigames, cricket, playground games, funfair, party
   races, latehome: ~1.7 MB raw) as separate content-hashed files loaded on demand (three ordered chunks, not 66
   files: the 10-17 study measured +9 % bytes and a starved stylesheet with 36 parallel requests). Then minify
   (identifier mangling) with a vendored minifier at build time only.
4. **Service worker** (PERF-18): precache the page + hashed lazy files, network-first for `index.html`; offline
   play and 0-byte repeat visits (measured in the 10-17 study).
5. ~~**`world.build` off the critical path** (PERF-08, world lane): serialise the grids at build time or build behind
   the title in slices.~~ Done in round 2 (§6.3: sliced behind the boot splash; serialising is still open).
6. **First 3D frame** (PERF-14): compile programs during the warm-up a few materials per frame (`renderer.compile`
   on a scene holding one mesh per material) while the 2D view is still up; dedupe Lambert variants (fog / vertex
   colour / flat combinations); a later three.js upgrade brings `compileAsync` with `KHR_parallel_shader_compile`.
7. **Sign atlas uploads** (PERF-13): paint a board into a 512×64 scratch canvas and `copyTextureToTexture` it into
   its cell (128 KB instead of 8 MB + mipmaps per board); on desktop 4–5 pages may do now that cells recycle (the
   four busy spots held ~384 distinct boards: measure with `signCheck()` before cutting).
8. **Camera** (PERF-17): ~~include parked vehicles and festival layer meshes in the camera ray~~ (round 2, §6.4);
   still open: clamp glow point size near the camera.
9. **Remaining analysis items** (PERF-02): split `piecesOfRoad` by edge for the few very long roads and
   triangulate big merged junctions in a second pass; or move the analysis to a Worker (it needs no THREE).
10. **Memory** (PERF-10): free the ground's 256² surface maps on the high tier (only the low tier re-bakes them),
    drop the models3d GLB source buffers after parse, binary GLB for the core pack (PERF-19).
11. ~~**Forced layouts / GC** (PERF-15 / 16, gameplay owners): one rect read per frame for the barks; reusable arrays
    in `entities.query` and the collision passes.~~ Done in round 2 (§6.2); left: `trafficCtl`, render queue.
12. **Quality fallbacks** (PERF-20): drop the shadow map when frames stay slow at the minimum pixel ratio; treat
    `WEBGL_debug_renderer_info` = SwiftShader / llvmpipe as "3D unavailable (software GL)".

Cross-lane items (owner, file:line, suggestion) — **all eight done in round 2 (§6)** except the online one (another
agent's lane):

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

Failing tests that also fail on the HEAD sources (not caused by this pass; for their owners) — **root causes and
fixes in round 2, §6.6**:

- Diwali (festival lane, functional) — `tests/diwali.cjs` 11: home-colony decorated houses / families / paper / 3D
  houses, Koti stalls lit / paper / 3D stalls, the ₹5 phuljhadi box, Tank Bund paper, elder + Chappal Meter heat:
  houses, stalls and families never appear at the test spots (0 in view), so the paper / purchase checks fail after them.
- Blender riders (models / vehicles lanes) — `tests/models3d.cjs` `riders` (4: NPC man and Chinnu on Blender cycles
  route as `null`) and `tests/view3d_actors.cjs` "getting on … seated" (Chinnu's own cycle: hips end at 0.43–0.66 rad,
  > 0.9 expected): `src/models3d.js` `riderModel` / `route` (~742-990) vs the `chinnu_cycle` / `hero_cycle` set-up.
- 3D draw calls (this lane, PERF-30) — `tests/view3d.cjs` dense Old City 376–380 > 300.
- engine QA budgets — `tests/engine_qa.cjs` 2D night drive 8.5 / 12.5 ms JS per frame cannot be judged on a
  SwiftShader host under load (it measured 54–139 ms with or without this pass); gate it on load like view3d.cjs.

---

## 6. Round 2 — cross-lane and pre-existing items (2026-10-21, later the same day)

The eight items §5 handed to other lanes and the suites that failed on the HEAD sources too, fixed by one engineer
across the lanes (online / party / telemetry files untouched: another agent audits them). Same harness rules as §2:
in-page JS time, repeated runs, A/B against a copy of the HEAD sources (`git archive`) run interleaved on the same
host, game-time waits in tests. Host load 2–27 during this round (other lanes' browsers); SwiftShader GL.

### 6.1 Fixed-step cap (PERF-07, `src/main.js`)

`frame()` simulates at most `maxSub` steps of real time per frame — **2 on the low tier** (view3d's tier, else a
coarse pointer), **3 elsewhere** — and drops the rest of a long frame (`N.perf.slow` = share of wall time not
simulated, `N.perf.steps` = sub-steps per frame; `N.time.maxSub` overrides for tests). The step stays ≤ 1/60 s, so
collision behaves as before; the camera / render effects / `N.time.real` advance by the simulated span (a capped
frame looks like a frame of a slower game, no camera lurch: `engine_qa` "camera: car glides" caught that).

| 2D, phone 4x (`qa_perf frames2d` method) | sub-steps / frame | frame JS median, HEAD → round 2 |
|---|---|---|
| Charminar 21:00 | 6 → **2** | 121.2 → **105.0 ms** |
| Numaish 19:30 | 6 → **2** | 137.7 → **94.4 ms** |
| Diwali night | 6 → **2** | 122.4 → **86.8 ms** |
| Koti 18:10 | 6 → **2** | 142.5 → **88.1 ms** |

Desktop: 2.2–2.5 steps per frame, unchanged (the cap never bites at ≥ 20 fps). Trade-off, by design: on that
4x-throttled phone the game now runs at ~33–37 % of wall-clock speed in the busiest 2D spots (before: full speed at
~7–8 fps with 6 steps a frame, i.e. a jerky 0.1 s per frame); real phones rasterise the 2D canvas on the GPU and sit
well above this emulation. Regression: `engine_qa` check 18 (a 70 ms-per-frame burn system: ≤ 3 steps per frame,
`maxSub = 2` → ≤ 2, game time ≤ 3/60 s per frame).

### 6.2 Forced layouts and allocation (PERF-15 / PERF-16)

- **Read phase.** main.js calls every system's optional `read()` at the start of the frame, before any update or
  draw writes the DOM (ARCHITECTURE §5). dialogue.js measures new bubbles there (created hidden, placed next
  frame), hud.js reads its keep-out rects there (every 350 ms and ≥ 8 frames), view3d.js its canvas / HUD rects
  (every 500 ms and ≥ 15 frames; at once on resize / view change). `placeBarks` / `dodgeBarks` /
  `view3d_actors.updateBarks` only write (sizes come from the read phase, `el._box` from placeBarks). A CSS
  animation leaves style dirty when a frame starts, so even an early read costs a style pass: hence the caching.
- **Allocation.** `N.entities.queryN(x, y, r, pred, buf, kind)` fills a caller-owned buffer and returns the count
  (`query` keeps its API); `resolveOverlaps` / `pushTo` / `nearest` use index loops and scratch objects; the bump
  info object is reused unless the bump is emitted; vehicles.js collisions and traffic.js `trafficCtl` use `queryN`
  and read `v.x` / `v.y` once (a megamorphic double-field load boxes a HeapNumber per read); traffic state fields
  are declared in the initializer (one shape); `W.collide` / `W.raycast` take an optional `out` object.

| measurement (desktop, `measure_frames.cjs`, 240 frames, HEAD / round 2 runs interleaved) | HEAD | round 2 |
|---|---|---|
| 2D Koti 18:10, 4 barks: forced style / layout passes inside the frame callback (quiet host) | 5.8–6.4 per frame | 1.8–1.9 (before the last caching step) |
| same, final tree (host load 9–26) | 5.95–8.44 per frame, 1.6–3.1 ms | **1.32–1.55 per frame, 0.8–1.05 ms** |
| 2D Koti 18:10: allocated per frame, quiet host, ~2.4 steps both (sampling heap profiler) | 2.30–2.42 MB | **1.90–1.94 MB** |
| same, final tree, per simulated second (the loaded host ran HEAD at 3.5–3.7 steps a frame, round 2 at 2.7–2.9) | 55–67 MB | **47–52 MB** |
| 2D Koti: top allocation sites, KB per frame (final runs) | `resolveOverlaps` 387, `query` 339, `collidePeople` 329, `trafficCtl` 226, `collideVehicles` 213 | 145, 33, 67, 129, 38 |
| 2D Koti: GC time | 27–33 ms/s | 19–25 ms/s |
| 3D Charminar night (tps): forced passes, quiet host | 11.7 per frame (1.8 ms) | 1.14 per frame (0.2 ms) before the last caching step |
| same, final tree (load 10–26, 15–34 frames per run: SwiftShader at 4–8 s a frame) | 10.9–11.3 per frame (1.9–3.4 ms) | **0.53–0.6 per frame (0.03–0.04 ms)** |

The ~1.3–1.6 passes per frame left were not attributed this round (candidates: the read phase's own refreshes — a
running CSS animation leaves style dirty when the frame starts, so even an early read costs a style pass — and DOM
reads in systems outside this round's files).

Left (named for their owners): `trafficCtl` ~110 KB/frame (route arrays), the render queue / world draw
~270 KB/frame (render.js `queryStructures` / wall detail: not in this round's files). Regression: `engine_qa` check
19 (4 barks, 30 frames: zero `getBoundingClientRect` / `offsetWidth` / `offsetHeight` reads inside
`systems.draw`).

### 6.3 World build and potholes (PERF-08, `src/world.js`)

`W.build` is now a generator (yields between phases, per park / water body / 64 roads / blocks / 256 trees, the
road graph in 256-road chunks); `W.build()` runs it to the end synchronously (tools, tests), `W.buildAsync(sliceMs,
waitFor)` runs it in slices with a MessageChannel task boundary between them; boot uses `buildAsync(40, fonts)`
while the fonts load and shows `LOADING… nn%` on the splash. Same world: `tests/potholes.cjs` `async` part compares
a fingerprint of the sync and the sliced build (grids, roads, blocks, trees, potholes). Potholes: generation,
index build and publish are separate resumable stages (`stats.sliceMax` / `sliceMaxAt`).

| | HEAD | round 2 |
|---|---|---|
| longest boot task, desktop (CDP trace, 3 runs) | 683–830 ms | **78–147 ms** |
| longest boot task, phone 4x | 3006–3544 ms | **342–383 ms** |
| title usable | desktop ~same; phone 4x ~+5 % (the same work, interleaved) | |
| longest pothole slice on the title, desktop / phone 4x | 17–21 / 50–52 ms | **6.5–8.9 / 20–30 ms** |
| longest pothole step in node (`potholes.cjs`) | 26 ms | 8–9 ms |

(§5's 277 ms pothole slice was a worst case seen during the first audit, host load 15–41; the HEAD code measured
17–52 ms in this round's runs.)

### 6.4 Third-person camera vs vehicles and stalls (PERF-17, `src/view3d.js`)

`camCollide` also tests (a) cars / autos / buses / lorries near the camera segment as oriented boxes at the heights
view3d_actors draws them (not the player's vehicle, not one the camera target sits in), and (b) SOLID cells of
`N.world.grid` that the static camera height grid lacks: cells registered with `N.view3d.camSolids(key, cells, h)`
(festivals3d registers Numaish's stall cells, canopy height 12, and the camera keeps 3 u from them: the drawn stall
reaches ~2.5 u past its stamped cells) and any other run-time SOLID cell (Koti's parked art buses) at 17.5 u.

Probe (`cam_probe.cjs`, world frozen: 8 yaws round the player at spots next to parked buses / traffic / stalls;
"bad" = the test's metric: the camera in a vehicle box, in an unknown SOLID cell (unless pinned at Chinnu's head,
< 2.5 u: a wall right behind him), in a stall footprint + 0.5 u, or a stall footprint − 0.5 u between the camera and
his head):

| spot | HEAD | round 2 |
|---|---|---|
| Koti bus stand (parked art buses + traffic) | **10 bad of 32** (camera inside a bus 29 u out, or in a solid 10 u out); an earlier run 9 of 48 | **0 of 32** (two more runs: 0 of 32, and 2 of 48 only on the stricter "any SOLID cell" metric, both the camera pinned 2 u from his head against an Abids book stall, as on HEAD) |
| Numaish stalls (20 Jan 19:30) | **17 bad of 48** (the camera 29 u out, a stall between it and Chinnu) | **0 of 48** |

A first cut without the 3 u stall margin still clipped a stall's side panel (`cam_live_numaish_0.png`: half the
screen yellow): the stamped cells stop up to ~2.5 u short of the drawn stall.

Regression: `tests/view3d.cjs` "third-person camera never inside a parked bus, a vehicle or a Numaish stall".
Not done: the near glow points still render as flat octagons (PERF-17's last sentence).

### 6.5 Dense Old City draw calls (PERF-30)

models3d.js batches the non-lazy members of one landmark model in one 768 u cell into one InstancedMesh per source
mesh (`options.batch`, `stats().batches`; static variants keep each member's `var_` nodes; skinned / hero / lazy /
dynamic-variant models never batch). The procedural landmarks already batched shops; the Blender bangle shop (24
primitives) drew every primitive per shop, main + shadow pass. Chunk glow `Points` now carry a padded bounding
sphere and are frustum-culled. Per-pass tally at the spot of `tests/view3d.cjs`' budget check (Laad Bazaar 19:30, one
fixed view, `calls_probe.cjs` wrapping `renderBufferDirect`, 4 frames):

| | calls / frame (`stats`) | main pass | shadow pass | bangle shops (main + shadow) |
|---|---|---|---|---|
| HEAD sources | 347–371 | ~366–374 | ~149–156 | 95 + 96 |
| round 2, `options.batch = false` | 344–353 | 359.5 | 148.8 | 95 + 96 |
| **round 2** | **266–275** | 283.3 | 85.5 | 24 + 24 |

The test itself (walking through Laad Bazaar): HEAD 373 avg / 380 max (this round's host; 376–380 in the first audit)
→ **286–288 avg, 287 / 297 max** (two runs;
the margin is thin). Regression: `tests/view3d.cjs` budget (≤ 300) and "shared landmark models drawn as instanced
batches"; `r2shots/bangle_batch.png` vs `bangle_nobatch.png` (same camera): 273 of 921 600 pixels differ by > 24
levels (animated people), the shops identical.

### 6.6 Pre-existing failures (root causes)

- **`tests/diwali.cjs` (11)** — test stale since journey J02: it marks every mission done (to keep the side
  givers away) but not the post-story flags, so story2's `healTick` (J02: resume the story after 3 s of calm free
  roam) started the interlude and then the finale scenes on top of the Diwali streets. The scenes freeze the
  Chappal Meter (`story2:scene`) → "elder heat" 0; they move Chinnu → no decorated houses / families / Koti stalls
  in view → the paper, ₹5 phuljhadi box and the 3D houses / stalls checks fail after them. Fixed in the test: it
  opens a consistent finished game (`interlude_done`, `ending_done`, `epilogue_done`, `credits_seen`,
  `postgame`). Game code unchanged.
- **`tests/models3d.cjs` riders (4)** — the frozen core pack carried a
  stale `hero_cycle` entry without rider seats (`meta.riders`), so every ridden Hero routed to `null`; and
  models3d_vehicles' rider choice asked only the people runtime, which has no archetype for a traffic cyclist.
  Fixed: `tools/pack_assets3d.cjs --repack <ids>` (refresh only those core entries; the full `--repack-core` needs
  `adult_man.glb`, which is not in the checkout) → `hero_cycle` repacked (pack 7311 KB, only that entry changed);
  `models3d_vehicles` falls back to the character made for that vehicle (`meta.role 'rider'`, `riderOf`: adult_man
  on the Hero). With real Hero riders a kid on an adult's Hero (kainchi type) was IK-seated on the adult saddle:
  he now stays procedural unless his model has a clip for that saddle drop (models3d's own rule; the "riding:
  player and cycle fall back" check caught it).
- **`tests/view3d_actors.cjs` "getting on … seated"** — the test was wrong: it read the left hip (`J[0]`) only, and
  on a cycle the feet are on the pedals, so the left hip ends straighter than a seated pose (0.58 rad on HEAD, 0.67
  now: the mount blend itself completes in its 0.4 s). It now reads the more bent hip and the rider's `seated`
  flag. Two more checks there leaned on frame counts and broke with the step cap (§6.1): "player stops into a
  stance" captured 0.5 s of game time and passed only because slowmo's 4 settle frames had already simulated
  ~0.4 s on this slow host (gait weight 0.04 on HEAD, 0.23 with the cap) — now 0.8 s; "pigeons at Charminar" read
  the 3D flock 4 frames after a teleport (birds.js lands them 0.2–0.3 s of game time later) — now it waits on game
  time.
- **`tests/engine_qa.cjs` 2D perf budgets (2)** — wall-clock budgets on a SwiftShader host under load; now gated on
  load (< 0.8 × cores) like view3d.cjs, with ×2.6 for software GL; the per-frame step cap / read-phase checks
  (18, 19) are not timing-based.
- **`tests/npcs.cjs` walk home → Café Gulistan (gameplay X7)** — citylife's Irani-café bench (its 'right' layout:
  a row of seats out from the café's north-west corner, across the walkway along the café front) blocked the
  route's corner waypoint; the walker pushed into a seated reader for 5 s and hopped (a fail: no hops in view;
  intermittent — it needs a reader on the corner seat, as in 2 of 2 probe runs). Fixed in `npcs.js`: a stuck walker
  re-plans with resting bodies (seated / standing solid actors) as soft obstacles (+10 per grid cell, smoothing and
  look-ahead keep clear of them) and, when wedged, first steps to the free spot that opens the way. Probe (4 runs):
  603–613 u walked, 6 unsticks, 1 hop → **452–491 u, 1 unstick, 0 hops**.
- **`tests/story_full.cjs` pSA1 (gameplay X8)** — the test was wrong: the "Tag!" hook teleports Chinnu to the
  raiders, a night can end by the home door, and `pandalGraceTick` ends the grace "at home" (< 45 u) by design. The
  check now accepts no grace within 45 u of home (still requires curfew level 0).

### 6.7 Fonts (PERF-18, `index.html`)

`tools/vendor_fonts.mjs` fetches Google's css2 for the five families, subsets each woff2 to the characters the game
can show (index.html, style.css, src/*.js + printable ASCII, Latin-1, punctuation, ₹; all layout features kept for
Telugu) and writes `vendor/fonts/` (19 woff2, `fonts.css` with Google's unicode-ranges and `font-display: swap`,
the OFL texts, a README). index.html links `vendor/fonts/fonts.css` (no Google preconnect / css2: no third origin,
nothing render-blocking off-site); `tools/build.mjs` inlines it with the URLs rebased; `deploy_site.sh` copies the
fonts; menus.js no longer injects Kalam when the page already declares it. **217.2 KB** for all 19 subsets vs
766.1 KB of Google's files for the same subsets (a page downloads only the subsets it shows: Latin Baloo 2 30.2 KB,
Yatra One 14.4, VT323 16.3; Telugu 64.6 only when Telugu text appears). Checked: index.html and dist/nostalgia.html
from file:// load every face with no request to Google; `deploy_site.sh --dry-run` carries them.

### 6.8 Roof markers (PERF-34 follow-up, `src/story.js`)

`rings3d` passes `h: rg.h`; `tests/view3d_actors.cjs` "a goal marker with an explicit roof height … stands on
that roof".

### 6.9 Final measurements and test results

Final tree, host load 4–26 while these ran (other lanes' suites), SwiftShader GL. Counts are checks printed `ok` /
`FAIL`; "load-gated" checks print ok with "not judged" above 0.8 × cores.

| suite | result | notes |
|---|---|---|
| `tests/smoke.cjs` | **45 / 0** | |
| `tests/core_systems.cjs` | **89 / 0** | |
| `tests/engine_qa.cjs` | **65 / 0** (twice) | incl. new checks 18 (step cap) and 19 (no layout reads while drawing). The 2D perf budgets were judged in the run on a snapshot taken before the last npcs / kainchi / camera-margin edits (load 2.9): 16.7 / 19.0 ms vs 22.1 / 32.5 (software-GL budgets); the final-tree run was at load 27.6, so not judged |
| `tests/potholes.cjs` | **43 / 0** | incl. the new `async` part (sliced build = sync build, fingerprint) |
| `tests/traffic.cjs` | **44 / 0** | |
| `tests/vehicles_v2.cjs` | **131 / 0** | |
| `tests/menus.cjs` | **216 / 0** | menus.js changed (Kalam) |
| `tests/ux_audit.cjs` | **64 / 0** | |
| `tests/models3d.cjs` | **61 / 0** | was 48 / 4 (riders) on HEAD; the kainchi rule caught by "riding: player and cycle fall back" |
| `tests/npcs.cjs` `ONLY=walk` | 8 / 1, rerun **9 / 0** | the one failure: "walkTo after mission abort" at load 8.6 (passes on the rerun and in an earlier run; the walk tests themselves passed both times); Café Gulistan 453 / 452 u, 1 unstick, 0 hops |
| `tests/story_full.cjs` `START=sa1 STOP=sa1` | **25 / 0** | X8 |
| `tests/vehicles3d.cjs` | **219 / 0** | models3d_vehicles changed (rider fallback, kainchi rule) |
| `tests/npcs.cjs` (all parts) | 39 / 1 | the one: "follow ride: the player did not arrive" — journey audit J12, fails on HEAD too (the test's driver vs traffic) |
| `tests/lazy3d.cjs` | **28 / 0** | |
| `tests/view3d_landmarks.cjs` | city walk 62 / 1, then (`ONLY=charminar VISIT=1 SHOTS=0`) **4 / 0** | the walk counted the members of a models3d batch as missing (their builders return nothing of their own): the test now counts `userData.batch.members` as drawn by models3d (458 built + 51 by models3d = 509). The full run was cut by the runner's 40 min limit after the walk (it measures every model) |
| `tests/qa_perf.cjs` `ONLY=boot` | **8 / 0** | desktop: title 1063 ms, world build 580 ms (wall, now interleaved with the font wait), longest task 92 ms; phone 4x: title 4150 ms, longest task 350 ms (load 4; the first audit's quiet-host final: 3.6 s) |
| `tests/journey.cjs` | 78 / 4 and 81 / 1 on the final tree; **82 / 0** four times on a snapshot of it | HEAD, same hour: 79 / 3 four times (M1 retry / kite won / lootna keyboard: they also failed in the first final-tree run and passed after). The round-2-only failure: "the home door takes no other ACTION" — twice of six runs an NPC leaving at the end of its hours (Ammamma at 21:00, Bahadur at 08:00) walked past the terrace stairs the check had just teleported Chinnu to, so "Talk to …" won the ACTION; 0 of 4 on HEAD. A timing race in the check (leaving walks start on the 0.5 s schedule tick), not traced further |
| `tests/diwali.cjs` (`SHOTS=0`, in two parts) | api + colony + Koti: **51 / 0** (round-2 snapshot; the runner's 40 min limit cut it in Tank Bund); Tank Bund, morning, wake, stalls, sky, perf: 51 / 1 on the final tree | was 88 / 11 on HEAD. The one failure: "3d: a few seconds later the paper has come down" (11 bits still flying after 5 s of game time); `ONLY=wake` twice more on the final tree and once on HEAD: 13 / 0 each (random: the paper physics draws random lift and spin, and passing traffic adds wakes; the litter runs in game time, untouched by the step cap) |
| `tests/qa_perf.cjs` `ONLY=build` | **9 / 0** | reproducible build (dist rebuilt), deploy dry run (`deploy_site.sh --dry-run`: the fonts copied), byte budgets (index.html 2126 KB gzip), 66 stripped scripts AST-identical; new check: the page's 19 @font-face files are in dist/site and no Google Fonts `<link>` |
| `tests/view3d_actors.cjs` | **134 / 0** | was 111 / 2 at the first audit, 131 / 3 on the round-2 snapshot before the three test fixes of §6.6; getting on: seated, hips to 1.85 rad; stance gait weight 0.06; 112 pigeons; roof marker y 33 = 22 × VS |
| `tests/view3d.cjs` | 40 / 3, then **70 / 1** | dense Old City **287 / 297** draw calls (≤ 300; HEAD 376–380); batches and camera checks ok. First run: the long trip, "12 view toggles" (textures 317 → 322) and a landscape `page.tap` timeout (load ~20; it passed in the rerun, as in the first audit). The camera section had run before the long trip and the toggles, filling caches with Koti + the Numaish festival layer: moved after them, the toggles pass (262 → 262). Still failing: the long trip, "others" 219 textures (budget < 160) — **fails on the HEAD sources too** (HEAD test on a HEAD copy, same host, same hour: 189 others, and 373–380 draw calls in dense Old City), so the budget is already exceeded by work merged since the first audit. An isolated A/B of the trip (Laad Bazaar
19:30 → the six stops): HEAD 135 others, round 2 132 / 144 (two runs), 137 with Blender riders off, 130 with batching
off — run-to-run noise, nothing this round adds; the test's own sequence (five busy spots first) varies more |

Not run this round: the full `story_full` (only the SA1 phase), `citylife`, `citylife_events`, `seasons`, `shops`,
`atmos_*`, `view3d_ground`, the party / online suites (another agent's lane), and `qa_perf`'s 3D sections
(`idle2d switch3d frames3d ctxloss storage`).

### 6.10 Files (round 2)

`src/main.js` (step cap, `read()` phase, sliced boot build) · `src/world.js` (build generator, `buildAsync`,
sliced pothole index / publish, `collide` / `raycast` `out`) · `src/dialogue.js`, `src/hud.js`, `src/view3d_actors.js`
(layout reads in `read()`, cached) · `src/entities.js` (`queryN`, index loops, reused bump info) · `src/vehicles.js`,
`src/traffic.js` (allocation) · `src/view3d.js` (camera vs vehicles / run-time solids / stall margin, `camSolids`,
`landmarkKeyFor`, cached rects, glow culling) · `src/festivals3d.js` (registers Numaish stalls) · `src/models3d.js`
(landmark batching) · `src/models3d_vehicles.js` (rider fallback, kainchi rule) · `src/assets3d_pack.js` /
`src/assets3d_index.js` (regenerated: `hero_cycle` only) · `tools/pack_assets3d.cjs` (`--repack <ids>`) ·
`src/npcs.js` (soft-obstacle re-plan) · `src/story.js` (`rings3d` `h`) · `src/menus.js` (Kalam only when missing) ·
`index.html`, `vendor/fonts/*` (new), `tools/vendor_fonts.mjs` (new), `tools/build.mjs`, `tools/deploy_site.sh`
(self-hosted fonts) · `dist/*` (rebuilt) · tests: `engine_qa` (checks 18, 19, load-gated budgets), `potholes`
(`async` part), `view3d` (batch + camera checks), `view3d_actors` (roof marker; three stale checks fixed), `view3d_landmarks` (batch members), `diwali`
(finished-game flags), `story_full` (pSA1), `qa_perf` (self-hosted fonts) · `ARCHITECTURE.md` §1–3, 5, 7, 8, 14, 19,
20, 21.
