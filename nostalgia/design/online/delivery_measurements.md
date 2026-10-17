# NOSTALGIA online: delivery and performance measurements (single-player launch)

Owner: delivery / performance engineering. Measured 2026-10-17 on build snapshot `745c749` + working tree at 16:44 UTC
(36 scripts, `dist/nostalgia.html` = 5,419,850 bytes). Scope: a **single-player** web launch where 1000+ people
play at the same time, each in their own browser. The shared world is out of scope (short appendix at the end).
Companion docs: `hosting_research.md` (which host, cost, cloud saves). This doc supplies the measured numbers
that hosting model needs, and the build changes that make the first visit fast on a mid-range Android phone on
patchy 4G.

Everything marked **(measured)** comes from the scripts in `tools/perf/` (reproduce: §11). Everything marked
**(est.)** is an estimate, and the line says what it was derived from. Sources are listed in §12.

---

## 0. Summary

**What a first-time player downloads today.** One 5.17 MiB HTML file goes over the wire as **1.16 MB brotli**
(1.53 MB gzip). Fonts add ~65 KB. The total is **1.21–1.27 MB before the title screen** (measured). Everything
in that HTML is on the critical path, including ~0.47 MB (brotli) of code a new player does not need yet:

- the 3D engine, ~179 KB
- minigames, cricket, playground games, shops, side jobs and story part 2, ~295 KB

three.js (125 KB on the wire) and the Blender model pack (370 KB on the wire for the 2 models today) already
load lazily, only after the player presses V (measured).

**How long a mid-range Android phone waits.** The phone is emulated as 4x CPU throttling. Lighthouse's
benchmark index measured *inside the throttled page* had a median of ≈ 530 (range 197–1069; Lighthouse's
"mid-tier mobile" band is 125–800). Medians below are measured:

| Network (DevTools preset) | HTML downloaded | "LOADING" splash painted | Title screen usable | V → 3D usable | Blender models in |
|---|---|---|---|---|---|
| Fast 4G | 1.5 s | 0.8 s | **5.0 s** | 8.0 s | 23 s |
| Slow 4G | 7.5 s | 1.6 s | **12.0 s** | 9.3 s | 27 s |
| 3G | 26.8 s | 4.6–5.7 s | **31.3–32.0 s** | 12.1–13.4 s | 41–43 s |
| none (CPU only) | 0.4 s | 0.7 s | **5.2 s** | – | – |

**The floor is CPU, not network.** Even with an instant network, the title takes **~5 s** on a mid-range
phone (measured: ~0.9–1.2 s to parse and run the inline scripts, then a **3.7 s boot**). Most of that boot is
`world.build` at **2.3–2.5 s**, plus menus.title 0.5 s, warmChunks 0.34 s and systems.init 0.29 s. On Slow 4G
and 3G, the 1.16 MB download comes on top of that floor.

**After the title.** PLAY → name card takes 1.0–1.7 s. START → first game frame takes 1.5–1.9 s. SKIP prologue
→ free roam takes 0.5–0.6 s (measured, 4x CPU).

**Repeat visits.** When the HTML is unchanged (a 304, 58 bytes), the title comes back in **4.3–5.5 s** with V8
compile ≈ 0 ms (measured). This is pure boot CPU. After any deploy, a single-file player re-downloads the whole
1.2 MB.

**Measured wins from the hosting experiments (§5):**

- **Drop the deferrable modules from the first load.** The payload falls from 1.16 MB to **0.75 MB** brotli
  (measured). All first-play scripts have run at **5.2–5.3 s instead of 7.8–7.95 s on Slow 4G** (−2.6 s) and
  at **18.0 s instead of 27.2 s on 3G** (−9.2 s), measured.
- **Service worker.** Repeat visits move **0 bytes**, splash at **0.35–1.0 s**, title at **3.1–4.9 s**, and the
  game **boots offline** in 2.5–4.4 s. Without a service worker, offline load fails (measured).
- **Self-hosted subset fonts.** The title font set falls from ~65 KB on two Google origins to **~45 KB** on our
  own origin (measured). This removes a render-blocking third-party CSS request, which took 0.6–0.7 s on Slow 4G
  and 2.1 s on 3G (measured). The splash then appears **1.6 s sooner on 3G** (4.6 → 3.0 s) and 0.1–0.2 s sooner
  on Slow 4G (measured, `f` vs `e`).
- **Do not split naively into 36 files.** On DevTools throttling, the 36 parallel requests starved `style.css`,
  so the splash appeared at **5.8 s instead of 1.6 s** on Slow 4G, and the title came later. Compression across
  separately compressed files also costs **+9% bytes** (measured). Use a few ordered chunks, inline critical CSS,
  and lazy chunks (§8).

**1000 simultaneous players.** This is a static-hosting non-event. 1000 cold loads × 1.27 MB = **1.27 GB**. Spread
over 10 minutes, that averages ~17 Mbit/s **(est., from measured bytes)**. Once loaded, the game sends nothing
to our servers. Save blobs are **2–6 KB raw / 1.6 KB brotli** (measured), so optional cloud saves are tiny too.

**Top fixes, in order of value per effort (§8):**

1. Content-hashed multi-file hosting build with 3–4 ordered chunks, plus lazy "activities" and "3D" chunks.
2. Service worker.
3. Self-hosted subset fonts and inline critical CSS.
4. Take `world.build` off the critical path (cache it, or build progressively).
5. Ship binary `.glb` models on the web build, not base64.
6. Save on `visibilitychange` (players switch to WhatsApp, and Android kills tabs).
7. Generate the OG card at build time: **103 KB** JPEG (measured), under WhatsApp's ~300 KB ceiling.

---

## 1. Method (read this before quoting numbers)

| Item | Setting |
|---|---|
| Build | `node tools/build.mjs` → snapshot copied to a scratch folder (`tools/perf/campaign.sh snapshot`), so other agents' edits during the runs could not change what was measured. |
| Browser | Chromium 141.0.7390.37 (Playwright 1.56.1 headless shell). |
| Device emulation | 412×892 CSS px @ DPR 2.625 (a 1080×2340 panel), `isMobile`, touch, Android Chrome UA. view3d therefore picks its **low** tier (pointer: coarse + small screen). |
| Network | Chrome DevTools presets via CDP `Network.emulateNetworkConditions`, values from `devtools-frontend/front_end/core/sdk/NetworkManager.ts`: **Fast 4G** = 165 ms latency, 9 Mbps×0.9 down, 1.5 Mbps×0.9 up. **Slow 4G** = 562.5 ms, 1.6 Mbps×0.9, 750 kbps×0.9. **3G** = 2000 ms, 500 kbps×0.8 both ways. DevTools throttling is **request-level** (each response is held ≥ latency), so its latencies are 2.75–5× the target RTT. |
| CPU | CDP `Emulation.setCPUThrottlingRate` **4x** (Lighthouse's default mid-tier-mobile multiplier). Calibration: the Lighthouse benchmarkIndex measured *in the throttled page* was 197–1069, median ≈ 530. Lighthouse's table puts "mid-tier mobile" at 125–800. |
| Server | `tools/perf/serve.cjs`: local HTTPS + HTTP/2, brotli q11 / gzip 9 precompressed, strong ETags + 304s, `Cache-Control` per path. Chromium maps `*.nostalgia.test`, `cdn.jsdelivr.net`, `fonts.googleapis.com` and `fonts.gstatic.com` to it (`--host-resolver-rules`). The CDN copies are byte-identical mirrors (real Google Fonts css2 responses and woff2 files fetched for an Android Chrome UA, and three.js r149 from `vendor/`), so **every** request pays the same throttling. The test certificate is trusted by SPKI pin, not by ignoring errors: Chromium never revalidates pages loaded with a certificate error, which would have faked the repeat-visit numbers. |
| Host | 4-core Xeon 2.1 GHz shared with other agents' headless browsers (load average 29–62 during the runs). The browser tree ran at `nice -20` in an autogroup at `-10`, so wall-clock times reflect the emulated phone rather than the queue. Variance is still visible: n = 1–4 runs per cell, medians shown, ranges where they matter. |
| Rendering | GPU compositing on this host is SwiftShader (≈1 frame per several seconds), so runs use `--disable-gpu`: software compositing and software 2D canvas. Canvas rasterisation therefore runs **on the main thread**, an upper bound for a phone that rasterises canvas on its GPU. WebGL still runs on SwiftShader (software GL), so **3D GPU-side frame times are not representative**. For 3D the doc reports JS time per frame, draw calls and triangles. |
| Timings | In-page: FCP, `DOMContentLoaded`, the `booted` class (title interactive), DOM mutation for the name card, the core `state` event for play/cutscene, and the next rAF for "painted". Main-thread CPU = CDP `Performance.getMetrics` in thread ticks. Memory = CDP JS heap + `/proc` PSS of the renderer and GPU processes. |

---

## 2. Bytes (measured)

### 2.1 The single-file build and what is inside it

`tools/perf/sizes.mjs`: gzip -9 and brotli -11. "Concat" means the group compressed as one stream, in
`index.html` order.

| Piece | Raw | gzip -9 | brotli -11 | Needed for |
|---|---|---|---|---|
| **`dist/nostalgia.html`** (36 inline scripts + CSS) | **5.17 MiB** (5,419,850 B) | **1.53 MB** | **1.16 MB** (1,216,498 B) | everything, before the title |
| `dist/artifact.html` | same | 1.53 MB | 1.16 MB | artifact host |
| — `style.css` | 171.3 KB | 35.5 KB | 28.9 KB | first paint |
| — **boot** group: core, input, audio, render, worlddata, world, world_extras, landmarks, places_art, entities, menus, save, debug, main (+ CSS) | 2.17 MB | 629 KB | 488 KB | title screen |
| — **play** group: seasons, vehicles, traffic, npcs, wanted, hud, dialogue, missions, storycore, story, collectibles | 1.09 MB | 346 KB | 273 KB | first minutes of play |
| — **later** group: story2, shops, sidejobs, minigames, cricket_match, playground_games | 1.20 MB | 371 KB | **295 KB** | only when that activity starts |
| — **3D** group in the page: view3d, view3d_ground, view3d_landmarks, view3d_actors, models3d | 725 KB | 223 KB | **179 KB** | only after V |
| = **first-play payload** (boot + play + CSS, one stream) | 3.34 MB | 974 KB | **747 KB** | – |
| = everything except 3D | 4.57 MB | 1.34 MB | 1.02 MB | – |

The largest single modules (raw / brotli) are:

- `worlddata.js`: 833 KB / 179 KB
- `minigames.js`: 386 KB / 90 KB
- `places_art.js`: 259 KB / 61 KB
- `cricket_match.js`: 231 KB / 60 KB
- `view3d_actors.js`: 222 KB / 57 KB
- `story2.js`: 209 KB / 55 KB
- `world.js`: 213 KB / 53 KB
- `audio.js`: 210 KB / 50 KB

### 2.2 Lazy files (fetched only after the player presses V)

| File | Raw | gzip -9 | brotli -11 | On the wire (measured) |
|---|---|---|---|---|
| `three.min.js` r149 (jsDelivr, `vendor/` fallback) | 594 KB | 149 KB | 121.5 KB | 124.6 KB |
| `vendor/three/GLTFLoader.classic.js` | 129 KB | 28.5 KB | 23.7 KB | 24.4 KB |
| `src/assets3d_pack.js`: 2 models today (kid_chinnu 450 KB + hero_cycle 500 KB GLB) as base64 in JS | 1.24 MB | 406 KB | **361 KB** | 370 KB |
| the same 2 models as **binary `.glb`** (proposal, §8 #6) | 0.95 MB | 364 KB | **302 KB** | – |

Base64 in JS costs **+14% to +25%** over binary GLB after brotli on these geometry-heavy models (measured per
model). It also costs +33% string memory and an `atob` + copy before parsing. **(est.)** For the planned ~8 MB
pack:

- Geometry-heavy content: ~2.5–3 MB brotli as binary, ~3–3.5 MB as base64.
- WebP textures are incompressible: they cost ~1.0× binary size over the wire either way, but still +33% in memory.

Two size caps matter if the pack is inlined:

- **claude.ai artifact: 16 MB per page.** A single-file page with an 8 MB pack inlined as base64 would be
  ≈ 5.2 + 10.7 ≈ **16 MB**, at or over that limit. Keep the pack a supporting file there, as ARCHITECTURE §21
  already says.
- **Cloudflare: 25 MiB per file.**

### 2.3 Fonts

The page asks for two Google Fonts css2 URLs:

- `index.html` (render-blocking): Baloo 2, Noto Sans Telugu, VT323, Yatra One.
- `menus.js` at load (non-blocking): Kalam, for the J-card handwriting.

What is actually downloaded (measured, from the network log):

| Font file | When | Bytes |
|---|---|---|
| css2 (4 families), render-blocking | before first paint | 965 B on the wire |
| css2 Kalam | when `menus.js` runs (6.6 s on Slow 4G, 23 s on 3G) | 524 B |
| VT323 latin | title | 7.3 KB |
| Yatra One latin | title | 10.9 KB |
| Baloo 2 latin (variable, all weights) | title | 33.2 KB |
| Kalam latin 400 + 700 | title / J-card | 13.2 + ~12.8 KB |
| Baloo 2 latin-ext (₹ and similar) | later screens | ~27 KB |
| **Noto Sans Telugu** | **never.** No CSS rule names it; Telugu text falls back to the system font, and Android ships Noto Sans Telugu anyway | 0 (CSS only) |
| Devanagari / Vietnamese subsets | never | 0 |

Self-hosting the same families, subset to the 122 Latin characters + 2–3 extras the game actually uses
(`tools/perf/subset_fonts.mjs`, measured):

| Family | Google latin file | Subset |
|---|---|---|
| Baloo 2 | 32.3 KB | 23.0 KB |
| Yatra One | 10.5 KB | 7.0 KB |
| VT323 | 7.0 KB | 4.2 KB |
| Kalam 400 / 700 | 13.7 / 12.8 KB | 9.0 / 8.8 KB |
| latin-ext subsets | 5–27 KB each | 0.6–1.1 KB each |

The title set is **45 KB on our own origin vs ~65 KB on two Google origins**.

---

## 3. What blocks first play, and what is already lazy

| Stage | On the critical path today | Lazy today |
|---|---|---|
| First paint (boot splash "▶ LOADING…") | The HTML head; the Google Fonts css2 (render-blocking, 0.6–0.7 s on Slow 4G, 2.1 s on 3G, measured); inline `style.css` | – |
| Title screen | **All 36 inline modules** (the whole 1.16 MB brotli); then `main.js` boot: font wait (≤1.5 s timeout; 0.1 s measured on a fast font host), `world.build` 2.3–2.5 s, systems.init 0.29 s, warmChunks 0.34 s, menus.title 0.5 s (4x CPU, measured) | – |
| First play | Nothing more is downloaded. PLAY → name card 1.0–1.7 s, START → first frame 1.5–1.9 s (4x, measured) | – |
| Activities (minigames, cricket, playground games, shops, side jobs, story part 2) | Already downloaded, parsed and run at boot (~0.2 s of the script time at 4x, measured) | – |
| 3D | The 3D JS (179 KB brotli) is downloaded and parsed at boot (~0.1 s at 4x) | three.js (CDN, then `vendor/`), GLTFLoader, model pack: fetched on V |
| Returning player who left in 3D | **three.js + GLTFLoader + pack load during boot.** view3d persists the last view in localStorage, and the run that hit this re-requested three.js and the 370 KB pack on reload (measured) | – |

---

## 4. Real-browser timings, today's single file (variant `a`, 4x CPU)

### 4.1 Cold load → title

| Network | n | Page BI (throttled) | HTML downloaded | FCP (splash) | DCL (all inline JS run) | **Title interactive** | Bytes | Main-thread CPU | V8 compile (main thread) | `world.build` |
|---|---|---|---|---|---|---|---|---|---|---|
| Fast 4G | 2 | 567–867 | 1.5 s | 0.8 s | 1.8 s | **5.0 s** | 1.24 MB | 4.3 s | 312 ms | 1.9 s |
| Slow 4G | 4 | 545–1042 | 7.5 s | 1.6 s | 7.9 s | **12.0 s** (11.7–12.6) | 1.22 MB | 9.5 s | 516 ms | 2.2 s |
| 3G | 1 (+1 from the console log) | 537–700 | 26.8 s | 4.6–5.7 s | 27.2 s | **31.3–32.0 s** | 1.21 MB | 18–20 s | 491 ms | 2.5 s |
| none | 4 | 428–640 | 0.4 s | 0.7 s | 1.2 s | **5.2 s** | 1.22 MB | 5.1 s | 281 ms | 2.3 s |
| none, **1x CPU** (host reference) | 1 | 2362 | 0.1 s | 0.3 s | 0.4 s | 1.6 s | – | 1.5 s | 131 ms | 0.8 s |

Read it as **title ≈ HTML download + ~0.3 s tail of inline scripts + ~3.7–4.1 s boot CPU**. The HTML download
matches `bytes / throughput + latency` within 5%, so the network part is predictable for any link speed
**(est. for other speeds)**. On 3G, a player stares at "LOADING…" with no progress indication for ~26 s.

### 4.2 Where the CPU goes before the title (4x, variant `b`: single file + `performance.mark` per module + boot-phase wrappers)

**Parse + top-level run per module (median of 4 runs; total 0.9–1.2 s):**

| Module | ms | Note |
|---|---|---|
| `worlddata.js` | 143–196 | 833 KB of data literals |
| `audio.js` | 132–257 | top-level synthesis/tables; nothing is audible before the first tap anyway |
| `menus.js` | 67–105 | |
| `render.js` | 9–67 | |
| `minigames.js` + `cricket_match.js` + `playground_games.js` + `shops.js` + `story2.js` + `sidejobs.js` (**later**) | 153–195 | deferrable |
| `view3d*.js` + `models3d.js` (**3D**) | 80–128 | deferrable |
| everything else (26 modules) | ~300 | |

**Boot after DOMContentLoaded (`main.js start()`, 4x):**

| Phase | ms |
|---|---|
| font wait (`document.fonts.load` ×3, timeout 1.5 s) | 106 (fast local font host; up to 1500 on slow links) |
| **`world.build`** | **2,255–2,515** |
| `systems.init` | 285 |
| `render.warmChunks` | 339 |
| `menus.title` | 496 |
| **total DCL → title** | **3,748** |

**V8 sampling profile of the boot** (split variant `c`, 4x, from navigation to title; `tools/perf/profile_boot.cjs`).
Self time by module:

| Module | Share of self time |
|---|---|
| `world.js` | **42%** |
| garbage collector | 14% |
| idle (waiting on network/fonts) | 13% |
| `world_extras.js` | 6% |
| `render.js` | 3% |
| `places_art.js` | 2% |
| `core.js` | 2% |

Top functions, for the world-engine owner:

| Function | Self time |
|---|---|
| `fillThickLine` (world.js:130) | 769 ms |
| `W.build` | 501 ms |
| `nearestRoad` | 417 ms |
| `rectAll` | 389 ms |
| `world_extras` `prepare` + its callback | 365 + 353 ms |
| `paintGround` | 364 ms |
| `makePatterns` | 291 ms |
| `buildRoadGraph` | 231 ms |
| `pointInPoly` (core.js) | 165 ms |
| `surfAt` | 158 ms |
| `clearOf` | 151 ms |

That is grid rasterisation and placement work. It is deterministic from `worlddata`, so it can be cached or
precomputed (§8 #4). The 14% GC share points at allocation churn during the build.

### 4.3 PLAY → playable (taps are real touch events; "painted" = next animation frame)

| Network | n | PLAY tap → name card painted | START tap → first game frame | SKIP prologue → free-roam frame |
|---|---|---|---|---|
| Fast 4G | 1 | 1.7 s | 1.9 s | 0.5 s |
| Slow 4G | 2 | 1.5 s | 1.9 s | 0.6 s |
| 3G | 1 | 1.0 s | 1.5 s | 0.6 s |

No network is involved after the title, so these are CPU (4x). A first-time player waits **~3–4 s of
input-to-response** across the two taps. Owners: menus (name card), main/render (`newGame` + `warmChunks`).

### 4.4 Frame time in play, top-down (6 s walking per scene, 4x CPU, software canvas)

| Scene | rAF p50 | rAF p95 | Frames > 33 ms | Game `update` ms/frame | Game `draw` ms/frame | JS heap |
|---|---|---|---|---|---|---|
| Himayatnagar (spawn) | 108–133 ms | 250–275 ms | 92–100% | 22–34 | 41–42 | 64 MB |
| Old City (Charminar) | 150–167 ms | 400–450 ms | 94–98% | 36–55 | 46–78 | 64 MB |

How to read this:

- **Draw** includes software rasterisation of the 2D canvas on the main thread. On a phone, the GPU does that
  part.
- **Update** is inflated by the fixed-step loop. At ~8 fps each frame runs 6 sub-steps of 1/60 s (dt is clamped
  to 0.1 s), so the per-step simulation cost is ~4–9 ms at 4x.
- **(est.)** On a real mid-range phone with GPU canvas: update ~4–9 ms + draw-call recording ~15–30 ms ≈
  **20–40 ms per frame (25–50 fps)**. That is a band, not a measurement. **Verify on a device** (§10) before
  launch.
- Risk: the sub-step spiral. One slow frame triggers more steps, which makes the next frame slower. Capping
  sub-steps at 2–3 on low-tier devices bounds it (owner: `main.js`).

### 4.5 3D (V pressed in the Old City, low tier, pixel ratio 1.25)

| Network | n | V → 3D usable | Blender models ready | Bytes fetched | Main-thread CPU | view3d JS ms/frame (avg) | Draw calls | Triangles | JS heap | Renderer PSS | GPU proc PSS |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Fast 4G | 1 | **8.0 s** | 23.4 s | 507 KB | 8.9 s | 88 | 38 | 140k | 87 MB | 406 MB | 92 MB |
| Slow 4G | 2 | **9.3 s** | 26.9 s | 507 KB | 9.2 s | 69–73 | 35–48 | 138–152k | 86–121 MB | 389–497 MB | 91–98 MB |
| 3G | 2 | **12.1–13.4 s** | 41–43 s | 507 KB | 10.7 s | – | – | – | – | – | – |

- **3D readiness is CPU-bound.** The network part is ~1 s on Slow 4G (125 KB three.js) and ~4.5 s on 3G. The
  other ~8 s at 4x is three.js init and the near-city warm-up.
- The Blender models arrive 14–30 s after 3D starts: GLTFLoader + 370 KB pack + base64 decode + parse, then
  3 blob textures.
- rAF in 3D was 1.6–1.8 s per frame here. That is SwiftShader software GL, and **not** a phone number. The
  CPU-side 69–88 ms of view3d JS per frame at 4x is real, though, and it alone caps 3D at ~11–14 fps on a
  mid-tier CPU (measured jsAvg; per-frame jsMs ranged 6–47 ms).
- Treat 3D on phones as opt-in until it is profiled on a device (§10).

### 4.6 Memory (renderer process PSS / JS heap; software canvas, so canvas backing stores count in the renderer)

| | At title | In play (2D) | In 3D |
|---|---|---|---|
| Single file, Slow 4G | 223 MB / 54 MB | 380 MB / 64 MB | 389–497 MB / 86–121 MB (+ GPU process 91–98 MB) |

A 3–4 GB Android phone runs this, but Chrome will likely discard the tab when the player switches to WhatsApp
to share. `save.js` only saves on missions/booths today, and nothing saves on `visibilitychange`/`pagehide`. See
§8 #9.

### 4.7 Repeat visits (same browser profile; HTTP cache; HTML unchanged)

| Network | n | Bytes | FCP | Title | Main-thread V8 compile |
|---|---|---|---|---|---|
| Fast 4G | 1 | 58 B (one 304) | 0.6–1.1 s | 4.4–5.5 s | 1–5 ms |
| Slow 4G | 2 | 58 B | 1.4–1.8 s | 4.3–5.5 s | 1–3 ms |

- The V8 code cache works for the inline scripts too, as long as the HTML is byte-identical: V8 attaches the
  cache to the document resource (see the V8 source, §12).
- **Any deploy changes the HTML.** Every returning player then re-downloads 1.2 MB and recompiles everything.
- **Offline: fails** (`ERR_INTERNET_DISCONNECTED`).

---

## 5. Hosting experiments (same snapshot, same throttling)

Variants built by `tools/perf/variants.mjs`. None of them edits the game source.

| Variant | What it is |
|---|---|
| `a` single | `dist/nostalgia.html` as shipped |
| `c` split-36 | `index.html` + each module and `style.css` as its own **content-hashed** file (`assets/<name>.<sha10>.js`), same order, classic scripts. `immutable` 1-year caching for `/assets/*`, `no-cache` + ETag for the HTML |
| `d` pwa | `c` + self-hosted subset fonts (inline `@font-face`, preload of the 3 title faces; `menus.js` skips its Google link because `link[data-mn-font]` exists) + service worker (precache the boot set at install, cache-first for hashed files, network-first with a 3 s timeout for the page) + web manifest + OG tags |
| `e` first-play | `a` **minus** the later + 3D modules: the payload a lazy build would put on the critical path. A measurement stand-in, not a shippable build (those features are absent). It boots and plays with no errors (checked) |
| `f` first-play + fonts | `e` + the self-hosted subset fonts of `d` |

### 5.1 Cold load → title (4x CPU)

| Variant | Network | n | Page BI | Last critical byte | FCP | DCL | **Title** | Bytes | Main-thread CPU | Main-thread compile |
|---|---|---|---|---|---|---|---|---|---|---|
| a single | Slow 4G | 4 | 545–1042 | 7.5 s | 1.6 s | 7.9 s | **12.0 s** | 1.22 MB | 9.5 s | 516 ms |
| c split-36 | Slow 4G | 2 | 420–485 | ~9.0 s | **5.8 s** | 9.2 s | 13.1 s | 1.34 MB | 7.7 s | **3 ms** |
| d pwa | Slow 4G | 2 | 519–534 | ~9.3 s | **6.0 s** | 9.4 s | 13.7 s | 1.33 MB | 10.4 s | 4 ms |
| e first-play | Slow 4G | 2 | 215–398 | **5.0 s** | 1.4–1.5 s | **5.2–5.3 s** | 9.6–10.9 s | **0.80–0.81 MB** | 6.7–8.8 s | 276–438 ms |
| f first-play + fonts | Slow 4G | 2 | 486–653 | **5.0–5.1 s** | **1.2–1.4 s** | **5.1–5.4 s** | 9.5–10.6 s | 0.80 MB | 6.4–7.4 s | 263–291 ms |
| a single | 3G | 2 | 537–700 | 26.8 s | 4.6–5.7 s | 27.2 s | **31.3–32.0 s** | 1.21 MB | 18–20 s | 491 ms |
| c split-36 | 3G | 1 | 1069 | ~31 s | **29.1 s** | 32.9 s | 38.5 s | 1.34 MB | 22.1 s | 3 ms |
| d pwa | 3G | 1 | 434 | ~31 s | **20.6 s** | 32.4 s | 39.1 s | 1.33 MB | 21.6 s | 9 ms |
| e first-play | 3G | 1 | 760 | **17.8 s** | 4.6 s | **18.0 s** | **23.6 s** | 0.80 MB | 15.1 s | 360 ms |
| f first-play + fonts | 3G | 1 | 381 | **17.8 s** | **3.0 s** | **18.0 s** | **23.6 s** | 0.79 MB | 13.2 s | 332 ms |
| a single | Fast 4G | 2 | 567–867 | 1.5 s | 0.8 s | 1.8 s | **5.0 s** | 1.24 MB | 4.3 s | 312 ms |
| c split-36 | Fast 4G | 1 | 1065 | ~1.7 s | 1.3 s | 2.1 s | 5.6 s | 1.36 MB | 4.8 s | 3 ms |
| d pwa | Fast 4G | 1 | 735 | ~1.6 s | 1.4 s | 2.0 s | 6.0 s | 1.33 MB | 5.2 s | 4 ms |
| e first-play | Fast 4G | 1 | 763 | 1.0 s | 0.7 s | 1.6 s | 7.3 s* | 0.83 MB | 5.2 s | 252 ms |
| f first-play + fonts | Fast 4G | 1 | 197 | 1.0 s | 1.4 s* | 1.8 s | 7.1 s* | 0.80 MB | 6.3 s | 433 ms |

\* The host was at its busiest during the `e`/`f` runs: their boot (DCL → title) took 4.4–5.7 s against 3.1–4.8 s
for `a`, with identical boot code. Compare `e`/`f` on the network-bound columns (last critical byte, FCP, DCL).
For the title, use DCL + the ~3.8 s median boot.

What the split-36 runs show:

1. **36 separately compressed files cost +9–10% bytes.** Brotli cannot share context across files: 1.34 MB vs
   1.22 MB.
2. **Under DevTools throttling, bandwidth is shared evenly across concurrent requests.** The render-blocking
   30 KB `style.css` therefore finished last (5.1 s on Slow 4G) and the splash waited for it. A real HTTP/2 CDN
   gives CSS a higher priority, so the real-world penalty is smaller **(est.)**. The lesson stands either way:
   inline the critical CSS and do not spray 36 parallel requests at a 1.4 Mbps link.
3. **External scripts move compilation off the main thread.** Script streaming compiled them in the background
   while they downloaded. Main-thread compile fell from ~0.5 s to 3 ms, and main-thread CPU before the title
   fell ~1.8 s (9.5 → 7.7 s on Slow 4G).
4. The title did not improve because the network is the bottleneck at these speeds. That is what lazy-loading
   fixes (`e`). `e`'s title times are pessimistic because the host was busiest during those runs (page BI
   215–398 vs a median of ~530).

### 5.2 Repeat visits and offline (4x CPU)

| Variant | Network | Bytes on repeat | Repeat FCP | Repeat title | Offline |
|---|---|---|---|---|---|
| a single | Slow 4G | 58 B (304) | 1.4–1.8 s | 4.3–5.5 s | **fails** |
| c split-36 | Slow 4G | 58 B (HTML 304; 44 assets from cache, `immutable`) | 0.9–1.3 s | 3.9–4.5 s | **fails** |
| d pwa | Slow 4G | **0 B** (43 responses from the service worker) | **0.35–1.0 s** | **3.1–4.9 s** | **works**: title in 3.9–4.4 s |
| d pwa | 3G | 0 B | 0.41–0.47 s | 3.6–4.4 s | **works**: 2.5 s |
| c split-36 | 3G | 58 B | 2.2–2.6 s | 5.1–7.3 s | – |

The service worker makes the network irrelevant from the second visit on, and the game works without signal.
Repeat titles are then bounded by boot CPU, which is the `world.build` item in §8.

### 5.3 First-play payload and fonts (`e`, `f`)

The network-bound part of the first visit, measured:

| | Slow 4G: last byte / FCP / DCL | 3G: last byte / FCP / DCL | Fast 4G: last byte / DCL |
|---|---|---|---|
| `a` today | 7.5 / 1.6 / 7.9 s | 26.8 / 4.6–5.7 / 27.2 s | 1.5 / 1.8 s |
| `e` without the later + 3D modules | **5.0** / 1.4–1.5 / **5.3 s** | **17.8** / 4.6 / **18.0 s** | 1.0 / 1.6 s |
| `f` = `e` + self-hosted fonts | 5.0 / **1.2–1.4** / 5.2 s | 17.8 / **3.0** / 18.0 s | 1.0 / 1.8 s |

- **Lazy-loading the activities and 3D** saves **2.6 s on Slow 4G** and **9.2 s on 3G** before the boot can even
  start. On Fast 4G the link is not the bottleneck, so the gain there is in parse time (~0.2–0.3 s at 4x,
  from §4.2), not download.
- **Self-hosted fonts** do not move DCL. They bring the splash forward because nothing third-party blocks
  first paint: **−1.6 s on 3G**, −0.1–0.2 s on Slow 4G. They also stop the Kalam CSS request that otherwise
  waits until `menus.js` has been parsed (6.6 s on Slow 4G, 23 s on 3G).
- **Title (est.)** = DCL + boot. With today's ~3.8 s boot that is ~9.1 s on Slow 4G (vs 12.0) and ~22 s on 3G
  (vs 32). With `world.build` fixed (§8 #4), ~7 s and ~20 s.

---

## 6. Runtime numbers worth carrying into the plan

| Number | Value | Status |
|---|---|---|
| Save blob (`localStorage['nostalgia.save.v1']`), fresh / after progress | 2.0 KB / 5.8 KB raw; 1.6 KB brotli | measured |
| Requests per cold load (single file) | 1 HTML + 2 Google css2 + 4–6 woff2 | measured |
| Requests per cold load (split-36) | 46 | measured |
| Requests when 3D starts | 3: three.js, GLTFLoader, pack (+ blob textures) | measured |
| Bytes per player, first visit, 2D | **1.21–1.27 MB** | measured |
| Bytes per player, 3D on top | **+507 KB today**; ~+2.6–3.5 MB with an ~8 MB pack | measured / **est.** |
| Bytes per returning player per deploy, single file | 1.22 MB (whole HTML) | measured |
| Bytes per returning player per deploy, hashed chunks | only the changed chunks, e.g. a `story.js` edit = 41 KB brotli | **est.** from module sizes |

**Corrections to the estimates in `hosting_research.md` §1** (now measured):

| Item | Was | Now (measured) |
|---|---|---|
| Single file brotli | est. 1.2–1.4 MB | **1.16 MB** |
| three.js | 152 KB gzip | **149 KB gzip / 121.5 KB brotli** (124.6 KB on the wire) |
| Google Fonts | est. 100–300 KB | **~65 KB at the title** (no Telugu or Devanagari files are ever fetched) |
| 2D cold load | ≈ 1.6 MB | **1.21–1.27 MB** |

---

## 7. What the measurements say about the 1000-concurrent goal

- **Static delivery.** 1000 simultaneous cold loads = **1.27 GB** (2D) and +0.5 GB if all of them open 3D
  today (measured bytes). Over a 10-minute WhatsApp wave that is ~17 Mbit/s average **(est.)**, trivial for any
  CDN. After load, the player costs our servers **nothing**: the simulation, audio, rendering and saves are all
  local.
- **The bottleneck is the player's phone and link.** Title in 5 s on Fast 4G, 12 s on Slow 4G, 32 s on 3G, with
  a 5 s CPU floor. Patchy-4G players in a WhatsApp group see the Slow 4G column. The fixes in §8 target that
  column.
- **Cloud saves and leaderboards.** At 2–6 KB per save, 1000 concurrent players saving every 2 minutes is
  ~8 writes/s and ~50 KB/s **(est.)**. Any backend in `hosting_research.md` §8 handles that.

---

## 8. Optimisations, each with its measured or estimated win

Ordered by value per effort for a mid-range Android on Slow 4G. "Owner" is who has to change code. Delivery
changes live in a new build target; the game source owners make the marked changes.

| # | Change | Win | Basis | Effort / owner |
|---|---|---|---|---|
| 1 | **Hosting build `dist/web/`.** Small `index.html` (inline critical CSS for the splash, inline `@font-face`, OG tags, SW registration). **3 ordered, content-hashed critical chunks**: `boot.<h>.js`, `play.<h>.js`, `style.<h>.css` (or inline CSS). **2 lazy chunks**: `activities.<h>.js` (later group), `3d.<h>.js`. `immutable` caching for hashed files, `no-cache` for HTML and `sw.js`. Keep `dist/nostalgia.html` + `artifact.html` exactly as today for offline/artifact use. | First-play bytes **1.16 → 0.75 MB** brotli (−0.41 MB, −35%). All first-play scripts run (DCL) on Slow 4G **7.9 → 5.3 s**, on 3G **27.2 → 18.0 s**, on Fast 4G 1.8 → 1.6 s. Parse/run before the title −0.2–0.3 s at 4x. Off-main-thread compile −0.5 s main-thread CPU. A deploy that touches one module re-downloads only that chunk. | Bytes, DCL and compile measured (`e`, `c`); parse from §4.2 | build: new `tools/build.mjs` target (delivery). Source: stubs so `N.view` and the activity entry points exist before their chunk loads (3D, minigames owners) |
| 2 | **Service worker** (precache the boot set at install; cache-first for hashed files; network-first with a 3 s timeout for the page; update prompt only on the title screen) | Repeat visits: **0 bytes**, splash **0.35–1.0 s**, title **3.1–4.9 s**. **Offline play works** (2.5–4.4 s to title). Scripts precached at install get a full V8 code cache. | measured (`d`); code cache: V8 docs | small / delivery |
| 3 | **Self-host subset fonts and inline critical CSS.** Drop the `fonts.googleapis.com` link and `menus.js`'s Kalam link (or let the build add `link[data-mn-font]`). Drop Noto Sans Telugu. `font-display: swap`; preload Yatra One, VT323 and Kalam. | Title font set **~65 → 45 KB**; 2 third-party origins (DNS + TLS + CSS round trip) removed. Splash **1.6 s earlier on 3G** (4.6 → 3.0 s) and 0.1–0.2 s earlier on Slow 4G. Google stops receiving player IPs. | measured (`f` vs `e`) | small / delivery + one line in menus.js |
| 4 | **Take `world.build` off the critical path.** (a) Cache its output (typed arrays) in IndexedDB keyed by the worlddata digest, so repeat visits skip it. (b) On cold load, build only the spawn district before the title and the rest progressively, or in a Worker. (c) Start building as soon as `worlddata`+`world` have arrived instead of after DCL. | `world.build` is **2.3–2.5 s of the 3.7 s boot** at 4x. **(est.)** Repeat title 4–5 s → ~2–2.5 s; cold title −1–2 s. | phase timing measured; wins est. | medium / world engine |
| 5 | **Defer `audio.js` top-level work to the first tap** (the AudioContext needs a gesture anyway) | **(est.)** −0.1–0.25 s before the title at 4x | per-module cost measured | small / audio |
| 6 | **Blender models on the web build:** binary `.glb` per model, fetched on demand (`fetch → arrayBuffer → GLTFLoader.parse`), meshopt-compressed geometry, `immutable` cache; base64 pack only in the single-file/artifact build | **−16%** bytes on today's 2 models (302 vs 361 KB brotli, measured); no 33% base64 string + copy in memory. **(est.)** Meshopt −30–50% on geometry; loading only models in view cuts the 14–30 s "models ready" wait to the few models near the player. | measured / est. | medium / pipeline + models3d |
| 7 | **three.js from our own origin** under a hashed name, prefetched after the title when `navigator.connection.effectiveType === '4g'` and not `saveData`; jsDelivr only as a fallback | Removes a third origin (DNS + TLS) and lets the SW cache it as a normal (non-opaque) response. Network part of V → 3D on Slow 4G ~1 s → ~0 when prefetched **(est.)**. The remaining ~8 s at 4x is CPU (init + city warm): profile on a device. | network part measured; CPU part measured | small / 3D |
| 8 | **Do not boot into 3D for returning players.** Show the title in 2D, then switch after PLAY or on V. | Avoids three.js + GLTFLoader + pack (~520 KB on the wire) and 3D init on the title path for anyone whose last session ended in 3D (measured: requests appeared on reload) | measured | tiny / 3D |
| 9 | **Save on `visibilitychange` → hidden and on `pagehide`** | Players switching to WhatsApp lose nothing when Android discards the tab (renderer ≈ 380–500 MB in play/3D, measured). The 2–6 KB save is cheap. | memory measured | tiny / save.js or main.js |
| 10 | **Serve brotli or zstd, not just gzip** | Single file **1.53 → 1.16 MB (−24%)** with brotli (measured). zstd (Cloudflare's free-plan default) **(est.)** lands between gzip and brotli at typical levels. | measured / est. | host setting |
| 11 | **Show progress on the splash** (bytes or chunks loaded) | No byte win. 26 s of a frozen "LOADING…" on 3G is where WhatsApp visitors give up **(est.)**. | – | small / boot splash |
| 12 | **Cap simulation sub-steps on the low tier** (2–3 per frame, let game time slow down instead) | Breaks the slow-frame spiral seen at ~8 fps (6 sub-steps per frame) | measured | small / main.js |
| 13 | **OG share card generated at build time** (`tools/perf/og_card.cjs`: boot the game headless at 1200×630, screenshot the title) | **103 KB** JPEG q70 (129 KB q80, 86 KB q60), under WhatsApp's ~300 KB thumbnail ceiling; no binary in git. PNG would be 699 KB, too big. Needs an **absolute** `og:image` URL, `og:url`, `og:title`, `og:description`, plus `twitter:card=summary_large_image`. | measured | small / delivery |
| 14 | **Cache headers** (Cloudflare `_headers`, same as `hosting_research.md` §6.2): `/index.html`, `/sw.js` → `no-cache`; `/assets/*` and the hashed chunks → `public, max-age=31536000, immutable`; `/og.jpg` → `max-age=86400` | Repeat visit = 1 conditional request (58 B) or 0 with the SW (measured) | measured | config |

**Combined first visit (est.).** Adding up #1 + #3 + #4(b) + #5 from the measured components (DCL 5.3 s / 18.0 s
from `e`/`f`, plus a boot cut from ~3.8 s to ~2 s), Slow 4G goes from **12.0 s to ~7 s** and 3G from
**32 s to ~20 s**. Repeat visits with #2 + #4(a) come down to **~2–2.5 s, offline included**. Confirm each step with `campaign.sh` as it lands.

### Preload and priority hints for the hosting build

- `<link rel="preload" as="font" crossorigin>` for the 3 title faces (done in `d`).
- `fetchpriority="high"` on `boot.<h>.js`; the critical chunks in body order (the preload scanner finds them
  immediately in a ~7 KB HTML).
- `rel=prefetch` for `activities.<h>.js` after the title (idle), and for `3d.<h>.js` + three.js only on good
  connections.
- No `preconnect` to Google once fonts are self-hosted.
- 103 Early Hints are optional on Cloudflare **(not measured)**.

---

## 9. What a lazy split needs from the source (so the owners can plan it)

- **3D:** a ~3–5 KB `N.view` stub in the boot chunk (mode, `set`, `cycle`, the VIEW button label, the saved
  preference) that loads `3d.<h>.js` + three.js on first use. `input.js`, `menus.js` and `world.js` already
  guard `N.view`/`N.view3d` with `if (N.view && …)` (checked by grep). `main.js` uses `N.view3d && N.view3d.active`.
- **Activities:** each module registers systems at load. The boot chunk needs the trigger points
  (minigame spots, cricket ground, shops, side-job givers, story-part-2 givers) with a `load(chunk).then(start)`
  wrapper. Variant `e` boots and plays the first minutes with those modules entirely absent, with no errors.
- **Single-file build** stays exactly as today for the claude.ai artifact and offline sharing.

---

## 10. Must verify on a real phone before launch

**(Not possible on this host.)**

1. 2D frame rate with GPU canvas: target ≥ 30 fps in the Old City.
2. 3D frame rate, GPU time and memory at the low tier.
3. Tab survival when switching to WhatsApp and back.
4. Whether WhatsApp on Android opens links in Chrome Custom Tabs (same storage as Chrome, so the SW and saves
   persist) or in a WebView (separate storage). Not confirmed from public sources.

Use Chrome remote debugging (`chrome://inspect`) on a Redmi Note / Galaxy A-series class phone with the same
scripts' in-page instrumentation.

---

## 11. Reproduce

```
WORK=/path/to/scratch PY=/path/to/python-with-fonttools+brotli \
  bash nostalgia/tools/perf/campaign.sh snapshot       # build, freeze, mirror fonts, subset, variants a–f, byte table
WORK=... bash nostalgia/tools/perf/campaign.sh         # all browser runs (~60–90 min on a shared host)
node nostalgia/tools/perf/report.mjs $WORK/results/runs  # the tables in §4–§5
node nostalgia/tools/perf/profile_boot.cjs --sites $WORK/sites --variant c --cpu 4 --fonts $WORK/fonts --tmp $WORK
node nostalgia/tools/perf/og_card.cjs --page nostalgia/dist/nostalgia.html --out $WORK/og --fonts $WORK/fonts
```

| Script (all under `tools/perf/`) | What it does |
|---|---|
| `sizes.mjs` | raw/gzip/brotli per file and group |
| `serve.cjs` | HTTPS/H2 test server with CDN mirrors |
| `variants.mjs` | builds the a–f experiments |
| `measure.cjs` | Playwright + CDP runs |
| `report.mjs` | turns the run JSON into tables |
| `subset_fonts.mjs` | glyph-subset self-hosted fonts |
| `profile_boot.cjs` | V8 sampling profile of the boot |
| `og_card.cjs` | build-time share image |

None of them edits game sources.

---

## Appendix: keep this in mind for a shared world later (not in scope now)

- **Keep static delivery and realtime separate.** Game assets stay on the CDN exactly as above. A future
  realtime service lives on its own origin (`wss://play.<domain>`), so the static path's 0-server-cost profile
  does not change.
- **Version handshake.** The hashed asset manifest gives every build an id. A shared-world client sends it on
  connect, so the server can refuse stale clients and the SW update flow can prompt a reload on the title
  screen.
- **The current sim is fixed-step (1/60 s sub-steps) and local.** A shared world needs authority over shared
  state only (positions, chat/emotes). The per-player story, missions and saves can stay local. Keep the save
  format section-based (it already is) so a server copy is a drop-in.
- **Bandwidth budget for mobile.** At 10 Hz updates of ~20–40 bytes per nearby player, 30 visible players cost
  ~6–12 KB/s down **(est.)**. That is fine on Slow 4G, but RTTs of 150–560 ms mean client-side prediction is
  needed for anything twitchy.
- **Memory headroom.** A shared world adds avatars and network buffers to a tab that already uses ~380–500 MB.
  Budget them against the low tier.

---

## 12. Sources

- Chrome DevTools throttling presets (primary): [devtools-frontend `NetworkManager.ts`](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/core/sdk/NetworkManager.ts)
- Request-level DevTools throttling explained: [DebugBear](https://www.debugbear.com/blog/chrome-devtools-network-throttling)
- CPU slowdown calibration and the benchmarkIndex table: [Lighthouse throttling docs](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md), [benchmarkIndex code](https://github.com/GoogleChrome/lighthouse/blob/main/core/lib/page-functions.js)
- V8 code caching (cold/warm/hot runs; inline scripts cached against the document; service-worker install produces a full code cache): [V8 blog, "Code caching for JavaScript developers"](https://v8.dev/blog/code-caching-for-devs)
- Storage quota (an origin may use up to 60% of disk in Chrome): [web.dev, Storage for the web](https://web.dev/articles/storage-for-the-web)
- Cloudflare Pages limits (25 MiB per file, 20,000 files on Free): [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [2026-01-23 changelog](https://developers.cloudflare.com/changelog/post/2026-01-23-pages-file-limit-increase/)
- Cloudflare `_headers` (default `max-age=0, must-revalidate`; `immutable` for fingerprinted files): [Pages headers](https://developers.cloudflare.com/pages/configuration/headers/)
- Cloudflare compression defaults (Free plan zstd, Pro/Business brotli): [Content compression](https://developers.cloudflare.com/speed/optimization/content/compression/)
- GitHub Pages limits (1 GB site, 100 GB/month soft bandwidth): [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits). No custom headers: [third-party tool notes](https://www.jquery.app/tools/cache-control-header-builder/), **unverified**. Brotli not served: [2019-era report](https://purplesyringa.moe/blog/webp-the-webpage-compression-format/), **old, unverified**.
- WhatsApp thumbnail size (~300 KB, undocumented): [Branch FAQ](https://help.branch.io/faq/docs/why-are-some-quick-link-thumbnails-not-shown-in-whatsapp), [Wix help](https://support.wix.com/en/article/wix-editor-recommended-ogimage-size)
- WhatsApp and Custom Tabs (an undated report of a test; current behaviour unconfirmed): [SmartWorld](https://www.smartworld.it/app/whatsapp-ab-testing-chrome-custom-tabs-488589.html)
- India mobile speeds. Medians are far above Slow 4G, but the WhatsApp audience lives in the tail; the 2026 figure is **unconfirmed**: [laenderdaten (May 2026, citing Ookla)](https://www.laenderdaten.info/Asien/Indien/telekommunikation.php), [tele.net.in (Aug 2024)](https://tele.net.in/india-jumps-eight-spots-in-median-mobile-download-speed-says-ookla-study/)
- Hosting and cost details: `design/online/hosting_research.md` (Cloudflare Pages/Workers pricing, R2, GitHub Pages plans)
