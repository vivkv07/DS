# NOSTALGIA — Technical Architecture (the contract)

Every module of the game follows this document. If you need to deviate, change this
document in the same edit and say why in a comment at the top of your file.

## 1. Product in one paragraph

*Nostalgia* is a top-down, GTA-1/GTA-2-style open-world web game set in 1990s
Hyderabad. The player runs, cycles, scoots and rides autos across a stylised,
compressed Hyderabad (Charminar, Golconda, Hussain Sagar + Buddha, Tank Bund,
Secunderabad, Abids, Nampally Numaish, Begumpet airport, Cyber Towers...), follows a
chain of story clues, and hunts hidden collectibles. It is a single static web page:
no server, no build step required to play, no external assets except Google Fonts.

## 2. Hard constraints

- Plain JavaScript (ES2020), **classic scripts** (no ES modules, no bundler, no npm deps).
  Every file is an IIFE that attaches to the global namespace `window.N`.
  It must run from `file://`, from a static host, and when inlined into one HTML file.
- No external images/audio. All graphics are drawn procedurally on canvas; all audio is
  synthesised with WebAudio. Only Google Fonts may be fetched (with fallbacks).
- No `alert/confirm/prompt`, no `window.open`, no downloads, no query-string reliance
  (`location.hash === '#debug'` is the only URL switch).
- `localStorage` access is always wrapped in try/catch; the game works without it.
- Audio starts only after a user gesture (the title screen's start button).
- Must work with keyboard (desktop) and touch (phones, landscape and portrait), 400px wide.
- Original content only: no copyrighted song audio/lyrics, no logos. Brands, films and TV
  shows of the era may be *mentioned* in text as cultural references. Avoid naming real
  private individuals; public landmarks are fine. Kid-friendly tone (no guns, no gore,
  no killing): "violence" is limited to bumping, slipping and getting scolded.

## 3. Files and load order

```
nostalgia/
  index.html        dev entry; loads style.css + src/*.js in the order below
  style.css         all DOM/UI styling (tokens on :root)
  src/core.js       N namespace, utils, math, seeded RNG, events, systems, state stack, clock
  src/input.js      keyboard + touch + gamepad  -> N.input
  src/audio.js      WebAudio SFX, music sequencer, radio -> N.audio
  src/render.js     canvas, pixel scaling, camera, projection, layer queue, chunk cache, draw helpers -> N.render, N.draw
  src/worlddata.js  pure data: the map (districts, roads, water, parks, blocks, landmarks, places) -> N.WORLD_DATA
  src/world.js      builds collision/surface grid, spatial index, road graph; draws ground + generic buildings -> N.world
  src/world_extras.js (map maker) railways + level crossings: wraps setGroundPainter / renderMap -> N.worldExtras
  src/landmarks.js  custom pseudo-3D drawing for named landmarks -> N.landmarks
  src/places_art.js (street-life artist) civic / transport / market / cinema / everyday art for the
                    places_art draw ids (map_plan §4b) + place-driven decorations (colony playgrounds,
                    NTR Gardens, street-market stalls); registers with N.landmarks.register, system
                    'placesArt' (order 43), wraps setGroundPainter -> N.placesArt {drawProp, queueProp, fx}
  src/entities.js   entity registry, spatial hash, Actor base, people drawing, Player on foot -> N.entities, N.player
  src/vehicles.js   vehicle types, physics, drawing, enter/exit -> N.vehicles
  src/traffic.js    ambient traffic, pedestrians, cows, dogs, pigeons -> N.traffic
  src/npcs.js       named story NPCs, portraits, talk prompts -> N.npcs
  src/wanted.js     the Chappal Meter (wanted level) + pursuers -> N.wanted
  src/hud.js        DOM HUD, minimap, blips, toasts, objective text, district banner -> N.hud
  src/dialogue.js   DOM dialogue box, typewriter, choices, speakers -> N.dialogue
  src/missions.js   coroutine mission runner, markers, checkpoints -> N.missions
  src/story.js      chapter/mission scripts (content) -> N.story
  src/collectibles.js hidden goli/cards/tapes, journal data -> N.collectibles
  src/shops.js      Irani cafe, kirana, STD booth (save), barber (clear meter), video parlour -> N.shops
  src/minigames.js  kite fight, Golconda clap, brick game, etc. -> N.minigames
  src/menus.js      title, pause, full map, journal, settings, credits, cutscenes/VHS FX -> N.menus
  src/save.js       save/load -> N.save
  src/debug.js      test hooks + #debug overlay -> N.debug
  src/main.js       boot + main loop
  tools/build.mjs   inlines everything -> dist/nostalgia.html (full page) + dist/artifact.html (fragment)
  tests/*.mjs       Playwright scripts (see section 14)
  design/*.md       research, story bible, map plan, systems design
```

Every file starts with:

```js
(() => {
  'use strict';
  const N = window.N;
  // ...
})();
```

`core.js` creates `window.N`. Files may reference other modules only lazily (inside
functions called after boot), never at load time, except `N` utilities from core.js.

DOM (index.html, owned by the engine): `canvas#game` (z 0) < `#ui` HUD (z 10,
`pointer-events: none`; give clickable HUD parts the class `interactive`) < `#touch`
touch controls (z 20, built by input.js) < `#overlay` menus/dialogue/cutscenes (z 30; a
full-screen panel is `.screen`, shown with `.show`) < `#debug` (z 40). `#boot` is a
loading splash hidden once `body.booted` is set. `body[data-mode]` mirrors `N.state.mode`.
`tools/build.mjs` inlines everything into `dist/nostalgia.html` (full page) and
`dist/artifact.html` (title, font links, style, body markup, scripts; no html/head/body
wrapper). A new src file must be added to index.html (and this list) or it won't ship.

## 4. Units, coordinates, constants

- World units ("u"). +x = east, +y = south. Angles in radians, 0 = east, +π/2 = south
  (clockwise on screen). `N.WORLD_W = 8000`, `N.WORLD_H = 6000`.
- 1 internal pixel = 1 world unit at camera zoom 1. Scale reference: a person is ~8u
  across, a cycle 15x5u, a Chetak 17x7u, an auto-rickshaw 22x13u, an Ambassador 30x14u,
  a city bus 62x18u. A 2-lane road is ~32u wide, an arterial ~56-70u. One storey ≈ 10u
  of height. Charminar footprint ≈ 60x60u.
- Speeds (u/s): walk 45, run 80, cycle 115, Luna 120, Chetak 150, auto 135, car 165,
  RX100 180, bus 115, boat 60. Traffic drives on the **left**.
- Collision/surface grid: cell size `N.CELL = 4` u → 2000 x 1500 cells (`Uint8Array`).

Surface enum `N.SURF`:
```
VOID 0 (out of map, solid)   GROUND 1 (dirt/open)   ROAD 2   FOOTPATH 3   GRASS 4
PLAZA 5 (paved courtyard)    WATER 6 (boats only)   ROCK 7 (solid boulder)
SOLID 8 (building/wall)      SAND 9 (riverbed/ghat, slow)   BRIDGE 10 (road over water)
```
Walkers: everything except VOID/WATER/ROCK/SOLID. Land vehicles: same, slowed on
GRASS/SAND/GROUND. Boats: WATER only.

## 5. core.js — `N` basics

```
N.VERSION, N.WORLD_W, N.WORLD_H, N.CELL, N.SURF, N.DEBUG (true if location.hash=='#debug')
N.util: clamp, lerp, invLerp, smooth, dist, dist2, angleTo, angleDiff, wrapAngle,
        rand(), randRange(a,b), randInt(a,b), pick(arr), chance(p),
        rng(seed) -> {next(), range(a,b), int(a,b), pick(arr)}  (deterministic, mulberry32)
        hash2(x,y) -> 0..1 deterministic, fmtMoney(paise) -> "₹ 12.50", fmtClock(min) -> "17:42"
N.on(evt, fn) / N.off(evt, fn) / N.emit(evt, data)
N.addSystem({id, order, runIn:['play',...], init(), update(dt), reset()})   // sorted by order
N.state: { mode, push(mode), pop(), is(mode) }   modes: boot,title,play,dialogue,cutscene,minigame,paused,map,journal,gameover
N.time:  { now, dt, frame, scale }        // game seconds (paused time excluded)
N.clock: { minutes (0..1440), day, speed (game-min per real-sec, default 1), frozen,
           set(h,m), isNight(), light() -> 0 (midnight)..1 (noon) for tinting }
N.flags: plain object for story/progress flags (saved)
N.places: { [id]: {id, name, x, y, r, district, kind} }  // filled from WORLD_DATA.places
N.err(where, e): logs once per (where) per 5s; shown in #debug overlay
```
Update order bands: input 0, clock 5, missions 10, player 20, vehicles 30, traffic 40,
npcs 45, wanted 50, collectibles 55, camera 60, audio 70, hud 80, debug 99.
Engine bands added: entities 25 (runs every entity's `update`), interact 58 (ACTION
arbitration, §8), menus 85.
Draw happens via the render layer queue (section 6), not via systems directly
(a system may expose `draw()` which main calls each frame to enqueue).

Implementation notes (core.js / main.js, binding):
- `N.systems = {list, get(id), init(), update(dt), draw(), reset(), started}`; main.js
  drives them. `runIn: ['*']` = every mode (default `['play']`). Re-adding an id replaces
  it. Every call is try/catch-wrapped and reported through `N.err`.
- `N.state.set(mode)` replaces the stack (boot -> title -> play); `push/pop` for overlays.
  `N.state.has(mode)`; `N.state.remove(mode)` drops the topmost `mode` wherever it sits (an
  overlay closing underneath the pause menu); every change emits `'state' {mode, prev, op}`.
- Main loop: semi-fixed step — the frame dt (clamped to 0.1 s) is split into equal
  sub-steps of at most 1/60 s, so motion is smooth at 60/120/144 Hz. `N.time.now` advances
  only in play/dialogue/cutscene/minigame/gameover. `N.perf = {fps, frameMs, updateMs, drawMs}`.
- `N.clock`: also `hour()`, `label()` ("17:42"), `dateLabel()` ("TUE 14 JAN 2003", from
  `baseDate` + `day`), `serialize()/deserialize()`; emits `'clock:day'`. Light curve: night
  ≈ 19:45–05:00, golden hour 16:30–18:30; `isNight()` = `light() < 0.3`.
- `N.util` extras: `TAU, strHash(s), pointInPoly(x,y,poly), closestOnSeg(px,py,ax,ay,bx,by)
  -> {x,y,t,d2}, hexToRgb, rgbToHex, shade(hex, f) (f<1 darker, f>1 towards white),
  mix(hexA, hexB, t)`; `rng(seed)` also takes a string and has `chance(p)`.
- `N.errors` holds captured errors (N.err + window error/unhandledrejection; a rejected
  `MissionAbort` is ignored). `N.loadPlaces(list)` fills `N.places` (world.js calls it).
- `N.game` (main.js): `newGame({skipIntro, hour, minute})` resets flags/clock (16:40),
  calls `N.systems.reset()`, enters play and emits `'game:new'` with the opts — **the story
  module listens to `'game:new'` and runs the intro unless `skipIntro`**. Also
  `continueGame()` (N.save.load, emits `'game:continue'`), `quitToTitle()` (`'game:quit'`),
  `pause()` / `resume()` (push/pop 'paused', `'game:pause'/'game:resume'`, calls
  `N.menus.pause()`), `snapshot()` for hot reload. `'boot'` is emitted once the world is built.
  `pause()` works from `play` **and `dialogue`** (the tab hiding mid-conversation pauses it;
  `resume()` returns to the dialogue); cutscenes and minigames handle their own pausing.
- Robustness (binding): the player, vehicles and camera recover from non-finite state (last
  good position / spawn) and report it through `N.err('player.nan' | 'vehicle.nan')`;
  `N.world.surfaceAt(NaN, ..)` is VOID. Treat any such report as a bug in the caller.

## 6. render.js — canvas, camera, pseudo-3D

- `<canvas id="game">` fills the viewport. Internal resolution: choose integer
  `scale = max(1, round(deviceHeightPx / 400))`; internal `N.render.W/H = ceil(devicePx/scale)`
  (portrait phones: same rule using the *shorter* side ≈ 400). Upscale with
  `imageSmoothingEnabled = false` for a crisp pixel look. `N.render.ctx` = internal context.
- Camera `N.render.cam = {x, y, zoom}` (center in world units). Camera follows the player
  with slight look-ahead in the velocity direction and **zooms out with speed**
  (zoom 1.0 on foot → ~0.78 at top car speed), smoothed.
- Projection (pseudo-3D, GTA2-like):
  `N.render.proj(x, y, h=0)` → `{x: sx, y: sy, k}` with
  `k = zoom * (1 + h * N.render.PERSP)`, `sx = W/2 + (x - cam.x) * k`, `sy = H/2 + (y - cam.y) * k`.
  `N.render.PERSP = 0.0032` (tunable). Things higher up lean away from screen center.
- Layer queue: `N.render.queue(layer, sortKey, fn)` where `fn(ctx)` draws in **internal
  screen space** using `proj`. Layers in order:
  `ground` (dynamic decals) → `shadow` → `actors` (sortKey = y) → `structures`
  (sortKey = -dist² from cam; farthest first) → `sky` (kites, birds) → `light` (night) → `fx`.
  The static ground (terrain, water, roads, markings, parks) is drawn first from the chunk cache.
- Chunk cache: static ground pre-rendered into 256x256u offscreen canvases on demand,
  LRU-capped (~48). `N.render.invalidateChunks(rect?)`. Ground painter is supplied by
  world.js: `N.render.setGroundPainter((ctx, x0, y0, w, h) => ...)` (world coords, 1u = 1px).
- Draw helpers `N.draw` (all take world coords and project internally):
  `box(x, y, w, d, h0, h1, {roof, wallN, wallS, wallE, wallW, outline})` axis-aligned extruded box;
  `poly(points, h0, h1, style)` extruded polygon; `cyl(cx, cy, r, h0, h1, style)` cylinder;
  `dome(cx, cy, r, h0, hTop, style)`; `disc(cx, cy, r, h, fill)`; `flat(fn)` ground-plane draw;
  `sprite(x, y, angle, h, fn)` — sets transform so `fn(ctx)` draws a top-down sprite in
  local units centered at origin facing +x; `text(x, y, h, str, style)`;
  `shadow(x, y, w, d, angle)`.
  Walls are drawn only when facing the camera (back-face culled); roof last.
- Lighting: `N.render.lights.push({x, y, r, color, intensity})` per frame; at night a dark
  tinted overlay with lights punched out (`destination-out` radial gradients) is drawn on
  the `light` layer. Day colour grade via `N.clock.light()` (dawn pink, noon neutral,
  golden hour orange, night blue).
- `N.render.shake(amount, time)`, `N.render.fx = {vhs: 0..1, flash, fade}` screen effects.
- Culling helper: `N.render.inView(x, y, margin)`; view rect in world: `N.render.view`.

Implementation notes (render.js, binding):
- main.js calls `N.render.begin()`, then everything enqueues (world, entities, systems),
  then `N.render.flush(dt)`. The queue runner resets transform, alpha and composite after
  every item; draw helpers leave the identity transform. `N.render.stats.ms` holds the last
  frame's cost per phase (enqWorld, enqOther, chunks, each layer, cast, night, screenfx, flush).
- Sub-pixel camera: the canvas is `N.render.PAD` (1) internal px larger than the viewport on
  every side (`W/H` include it; the visible centre is still `W/2, H/2`) and is shifted by the
  camera's sub-pixel remainder in whole device pixels (CSS translate, `N.render.subpx`) each
  frame. The camera itself stays snapped to the internal pixel grid (crisp cached ground),
  but scrolling and the followed vehicle move at device-pixel precision (no ±1 px wobble).
- Camera: `N.render.follow` (entity, default player/player's vehicle), `camOverride =
  {x, y, zoom, rate?, snap?}` for cutscenes/title, `baseZoom` (multiplier, default 1),
  `snapCamera()`. The camera is snapped to the pixel grid each frame (`N.render.camX/camY/Z`).
- Fast projection for hot loops: `k(h)`, `sx(x, k)`, `sy(y, k)`; `distKey(x, y)` is the
  structures sortKey; `screenToWorld(sx, sy)`, `clientToWorld(clientX, clientY)`, `rectInView`.
- Ground chunks: the painter receives a ctx **pre-translated to world coordinates**.
  `warmChunks(x, y, r)` pre-builds around a point (teleports). Static cast shadows of
  generic structures are **baked into the chunks** (world.js) using a quantised sun;
  `N.render.shadowEpoch` bumps when it changes and stale visible chunks repaint one per
  frame. Missing visible chunks are built nearest-first within a ~2.5 ms budget (at least one
  per frame); otherwise every third frame prefetches one chunk in the view grown by half a
  chunk plus ~1 s of the followed entity's travel. LRU cap 64 chunks.
- Night: the darkness mask is painted at 1/4 resolution and upscaled (it is soft anyway).
- `N.render.sun = {dx, dy (towards the sun), sx, sy (shadow offset per unit height), elev,
  strength}`; `faceShade {N,S,E,W}`, `shadeNormal(nx, ny)`, `shaded(hex, f)` (cached).
  Sun: east at 06:00 -> south -> west at 18:00; long golden-hour shadows.
- Extra `N.draw` helpers: `quadPath(ctx, x0,y0,x1,y1,h0,h1)` (vertical wall rect into the
  current path), `rectPath(ctx, x,y,w,d,h)`, `visibleWalls(x,y,w,d)` -> bits N1 S2 W4 E8,
  `plane(h, fn)` (affine world-coord drawing at height h; `flat` = `plane(0)`),
  `pixelText(x,y,h,str,color,{scale,shadow,rot:±1})` crisp 3x5 pixel font for in-world
  signs (`pixelTextWidth`, `pixelTextCanvas`), and dynamic cast shadows
  `castBox(x,y,w,d,h) / castPoly(pts,h) / castCircle(x,y,r,h) / castPole(x,y,h,w)` that are
  merged into one fill at the start of the `shadow` layer (call them while enqueueing).
- Styles: `box {roof: colour|false, wall, wallN/S/E/W, outline, roofFn(ctx,k,x,y,w,d,h)
  (roof plane, world coords), wallFn(ctx, face, ...)}`; `cyl {wall, roof|top, grad:false,
  bands:[h]}`; `dome {fill, steps, bulb, finial, finialColor}`. Face colours not given
  explicitly are sun-shaded from `wall`.
- Lights: `{x, y, r, color, intensity, h?, glow?: false}`. After flush `N.render.night`
  (0..1) says how dark it is. `fx = {vhs, flash (decays), fade, fadeColor, grade}`.

## 7. World data and world.js

`N.WORLD_DATA` (pure data, authored from `design/map_plan.md`):
```
{
  districts: [{id, name, nameTe?, rect:[x,y,w,h], ground:'#hex', style:'oldcity'|'colonial'|'colony'|'posh'|'rocky'|'cantonment'|'hitec'|'market'}],
  water:     [{id, name, poly:[[x,y],...]}],                 // Hussain Sagar, Musi, ponds
  roads:     [{id, name, pts:[[x,y],...], w, kind:'arterial'|'street'|'lane'|'bund'|'bridge'|'path', oneway?:false}],
  parks:     [{id, name, poly, kind:'grass'|'garden'|'ground'|'plaza'|'rock'}],
  rocks:     [{x, y, r, h}],                                  // Deccan boulders (solid, drawn 3D)
  blocks:    [{rect:[x,y,w,h], style, seed}],                 // procedural building fill areas
  buildings: [{id?, rect:[x,y,w,h], h, style, sign?:{text, color}}],  // hand-placed generic buildings
  landmarks: [{id, name, x, y, w, d, h, draw:'charminar'|...}],      // solid footprint + custom art
  trees:     [{x, y, r, kind:'neem'|'palm'|'banyan'|'gulmohar'|'ashoka'}],  // plus generated ones
  places:    [{id, name, x, y, r, district, kind}],           // story/shop/collectible anchors
                                                              // (+ level, roof, podium, virtual, alias, festival...)
  roofs:     [{id, name, rect, h, building, group, tags, solids, stairs}],   // walkable terraces (see "Roof zones")
  planks:    [{id, a, b, rect}],                              // planked gaps with railings between roofs
  respect:   [{id, name, kind, place, rects, polys, lines, forecourt, gate}],  // §19 N.respect
  spawns:    {player:[x,y], home:[x,y]}
}
```
Data notes: landmark `x, y` is the **centre** (w = east-west, d = north-south); optional
`plaza` (radius of a paved circle), `solids: [[x,y,w,h], ...]` (custom collision rects;
default = whole footprint), `noSolid`. `water[].bank` = width of a sandy bank ring,
`water[].color` overrides the water colour. `buildings[]` may set `color`, `roof`,
`sign: {text, color, fg?}`. Places and spawns are kept clear of generated buildings.
Also honoured: landmark `solid: false` (walk/drive under it), park `surface: 'sand'`,
road `median` (bool; arterials default true) and road `trees` (set when the map plants that
road's avenue itself, so the engine adds none). Tree kinds: neem, banyan, gulmohar,
ashoka, palm, coconut, mango, tamarind, peepal (unknown kinds draw as neem).
`world.js` builds: surface grid; `N.world.surfaceAt(x,y)`, `isWalkable(x,y)`,
`isDrivable(x,y)`, `isWater(x,y)`, `collide(x, y, r, mode)` → `{x, y, hit}` push-out
(mode 'walk'|'drive'|'boat'), `raycast(x0,y0,x1,y1,mode)`, `districtAt(x,y)`,
`nearestRoadPoint(x,y)`; road graph `N.world.roads` (nodes/edges, lanes on the left,
`randomRoute(fromNode)`, `nearestNode(x,y)`); structures list for the `structures` layer
(generic buildings auto-generated inside `blocks`, styled per district, with painted
shop signboards, water tanks on roofs, dish antennas/TV antennas, clotheslines);
trees; street lamps along arterials.

Implementation notes (world.js, binding):
- `N.world.build()` (main.js, at boot; emits `'world:built'`), `built`, `buildMs`, `data`.
- Extra queries: `surfaceSpeed(surf, mode)` (vehicle slow-down on GROUND/GRASS/SAND...),
  `findFree(x, y, mode, maxCells)` (nearest walkable cell centre), `randomRoadPoint(rnd,
  kinds)`; `collide` returns `{x, y, hit, nx, ny}` (non-finite input: `{hit: true, bad: true}`);
  `raycast` -> `{hit, x, y, t, surf}`; every random source (`randomRoadPoint(rnd)`,
  `randomRoute(.., {rng})`) accepts a function (`Math.random`) or an `N.util.rng(seed)` object;
  `districtAt` -> the district object; `nearestRoadPoint(x, y, pred?)` -> `{x, y, dist,
  road, seg, t, angle}`.
- Road graph `N.world.roads`: `nodes [{id, x, y, links:[{to, edge}] (traversable), inc:[edgeId] (all incident), deg, w}]`, `edges
  [{id, a, b, road, kind, w, len, oneway, lanes, angle}]`, `isJunction(n)`,
  `edgeBetween(a, b)`, `neighbors(n)`, `nearestNode(x, y, pred?)`, `randomRoute(from,
  steps, {rng, avoid:[kinds], prev})` -> [node...], `laneOffset(edge, lane)` and
  `lanePoint(a, b, t, lane)` -> `{x, y, angle}` (**left-hand** lanes). Junction nodes are
  shared by every road meeting there (T-junction endpoints are snapped onto the other road).
- Structures: `queryStructures(x0, y0, x1, y1, fn)`; `addStructure({t:'custom', x0, y0,
  x1, y1, cx?, cy?, draw(ctx, s)})` for extra static props. `trees`, `lamps`, `rocks`,
  `lots`, `STYLES`. `renderMap(pxPerUnit)` -> cached canvas of the simplified map (for
  the minimap and full map). Profiling aids: `detail` (switches), `buildPhases`, `stats`
  (running counts / ms of roof, wall and tree sprite-cache misses).
- Landmarks: every frame world.js calls `N.landmarks.enqueue(lm, visible)` for each
  landmark within the view + 140 u (cast dynamic shadows there, queue art on
  `structures` when `visible`), and `N.landmarks.paintGround(ctx, lm)` from the chunk
  painter (world coords) for static ground art.

### Roof zones (walkable terraces) — `N.world.roofs`, `N.player.level`

Bible §1.5 rule 2 + systems §7.3: rooftop routes are walled terraces with stairs and planked
gaps with handrails; no edges, no falls. Data (worlddata.js):
```
roofs:  [{id, name, rect:[x,y,w,d] (footprint), h (floor height), building: '<landmark id>' | null
          (null = world.js builds a colony house under it), group, tags:['colony','lootna','antenna',
          'candles','kites','ending',...], order (route order), solids:[[x,y,w,d]] (blocked spots on
          the roof), stairs:[{place, x, y (ground foot, a walkable 'stairs' place), tx, ty (landing on
          the roof; computed for generated houses), face:'n'|'s'|'e'|'w' (wall with the door)}]}]
planks: [{id, a, b (roof ids), rect:[x,y,w,d]}]   axis-aligned, cell-aligned (4 u), 12 u wide
places: a place ON a roof carries `level: '<roof id>'` (e.g. home_terrace, patang_chacha_roof);
        a stairs foot carries `roof: '<roof id>'` (home_stairs, lakshmi_t6_stairs, ...)
```
Roofs today: the M1 lootna chain `home_terrace` -> `lakshmi_t2` .. `lakshmi_t6` (group
`lakshmi_lootna`, 6 terraces, 5 planks, stairs down at t6 by the street), `friend_terrace` (Immu's),
`ashok_t1..3` (antenna jobs near Cable Babji's kirana_3) and `patang_chacha_roof` (by the Char
Kaman; the ending's kite train). Engine: one extra surface grid (`roofGrid`) holds every roof floor
(PLAZA) and plank (FOOTPATH); off-roof is VOID. While an actor on a roof updates, the world queries
(`collide`, `surfaceAt`, `isWalkable`, `findFree`, `raycast`) run against that grid, so the normal
movement code walks the roof and can never step off it. Such actors are drawn by their roof's own
`structures` item (same sort key as the building under it, queued right after it) at roof height.
```
N.world.roofs = { list, planks, get(id), at(x, y) -> {roof, plank, h} | null, heightAt(x, y),
  byGroup(g), byTag(t), route(group = 'lakshmi_lootna') -> roofs in order, onRoof(actor),
  climb(id, stairIndex?, actor = player, {instant}) (short fade, then on the landing),
  descend(actor = player, {x, y, instant}), place(actor, roofId, x?, y?) (an NPC on a roof: drawn
  at roof height via actor.look / actor.roofDraw(h), noCollide while up there),
  remove(actor, x?, y?), withRoof(fn), actors (Set), stats }
N.player.level   roof id | null (ground). teleport(x, y) to a roof point puts the player on that roof
                 (teleport(x, y, {ground: true}) forces the ground); saved with the player.
events: 'roof:enter' / 'roof:exit' {roof, id, actor}, 'player:level' {level, prev},
        'roof:climb' / 'roof:descend' {roof, id, actor}; a 'door' {kind:'wood'} sound on the stairs.
```
Stairs: ACTION "Go up to the terrace" / "Climb to the terrace" at the foot, "Go downstairs" at the
landing (priority 2). **Interactables have a level**: `spec.level = '<roof id>' | 'roof' | 'ground' | '*'`;
without one, a registered interactable is on the level of its point (a point on a roof cell = that
roof) and per-step offers are ground-only unless they set `level` or have priority >= 5. So shops
are not offered from a roof, and a collectible / minigame on a roof is only offered up there.
Pursuers, traffic and line of sight all work on the ground grid: a player on a roof stands
"inside" the building for them (story code decides what that means).

**Podium junctions** (`N.world.podiums = [{id, place, x, y, home}]`): a painted traffic-police
podium with an umbrella at the road node nearest each place with `podium: true` (19 big
junctions; `rtc_x_roads` is Havaldar Pochaiah's home). The constable is traffic.js / wanted.js's.

**Respect data**: `WORLD_DATA.respect` = one zone per temple / mosque / dargah / church / gurudwara /
ashurkhana / tomb compound (+ Charminar's interior), see §19 `N.respect`.

## 8. Entities, player, vehicles

```
N.entities.add(e) / remove(e) / all / query(x, y, r, pred) / nearest(x, y, r, pred)
Actor fields: id, kind ('ped'|'vehicle'|'animal'|'npc'|'pickup'|'prop'), x, y, angle,
  vx, vy, r, alive, solid, update(dt), draw() (enqueue on a layer), onBump?(other)
N.people.draw(ctx, look, anim)  // shared top-down person painter; look = {skin, hair,
  shirt, pants, kind:'kid'|'man'|'woman'|'uncle'|'aunty'|'burqa'|'saree'|'lungi'|'police'|'student', cap?}
N.player: Actor + { name, energy 0..100, money (integer paise), vehicle|null,
  mode:'foot'|'drive'|'busy', running, facing, inventory:Set, controlsLocked }
N.vehicles.TYPES[type] = {name, w, d, h, maxSpeed, accel, brake, turn, grip, seats,
  surfaces, colors[], radio:boolean, draw(ctx, v)}
  types: cycle, ladiescycle, luna, chetak, rx100, auto, ambassador, maruti800,
         padmini, bus, lorry, boat (+ special story vehicles)
N.vehicles.spawn(type, x, y, angle, opts) → vehicle actor; vehicle.driver (actor|null)
Player enters the nearest vehicle within 18u with ACTION; occupied traffic vehicles can
be "borrowed" (driver gets out shouting) which raises the Chappal Meter by 1.
```

Implementation notes (vehicles.js, binding):
- `TYPES[type]`: **`w` = length along the heading, `d` = width** (local +x forward, +y right).
  Extra fields: `short` ("Chetak"), `verb` (Ride/Drive/Steer), `cls` ('bike'|'car'|'auto'|
  'heavy'|'boat'), `mode` ('drive'|'boat' collision), `reverse` (fraction of top speed),
  `drag`, `turnLow`/`turnHigh` (steering factor at standstill / top speed), `steerResp`,
  `drift` (grip with the handbrake), `bounce`, `mass`, `camZoom` (bus/lorry zoom out),
  `smoke` ('2t'|'diesel'|'light'), `rider`, `door`, `lights`; derived collision circles
  `cr`/`co`. `N.vehicles.define(id, {base:'rx100', ...})` adds story vehicles.
- `spawn(type, x, y, angle, opts)` opts: `{color, color2, seed, driver: true | {look} | Actor,
  controller(v, dt), locked, noEnter (set on v), label, special, route (bus), beacon,
  seeded}`. Vehicle fields: `speed` (signed forward u/s), `slip`, `throttle`, `ctl {throttle
  -1..1, steer -1..1, handbrake, brake}`, `driver`, `controller`, `asleep`, `locked` (player
  can't get out), `noEnter`, `lightsOn`, `taxi`. Vehicles are entities with `selfUpdate` +
  `noCollide`; the `vehicles` system (order 30, play/dialogue/cutscene) moves them.
- **AI hook (traffic.js):** set `v.controller = (v, dt) => { v.ctl.throttle = ..; v.ctl.steer = .. }`;
  vehicles.js does the physics and every collision. Driverless, controller-less vehicles
  brake to a stop and then sleep (cost ~0). Physics: throttle/brake/reverse, speed-dependent
  steering, lateral grip (handbrake = drift + skid marks), surface slow-down
  (`N.world.surfaceSpeed`, bikes keep speed on footpaths), multi-circle wall collisions
  (bounce, scrape sparks, spin), vehicle-vehicle impulses, vehicle-vs-people oriented-box
  pushes (people get `knockT` seconds + a velocity kick). Movement is **swept** (each step is
  split so no collision circle moves more than ~70% of its radius per piece) and every push
  (vehicle-vehicle, a person pinned against a wall, which stops the vehicle instead) goes
  through the same wall collision; a vehicle whose circle centre still ends inside a solid is
  restored to its last good pose. Controller values are sanitised (NaN reads as 0).
- Player controls: keyboard = tank (up/down/left/right via `N.input.down`); `N.input.analog`
  = point-to-steer (stick behind you = brake, then reverse swinging the tail round); RUN =
  handbrake (touch button relabelled BRAKE / H-BRAKE). ACTION offers (priority 0, within 18u
  of the body): "Ride Chetak" / "Drive auto" / "Borrow auto"; while driving "Get off" /
  "Get out" (priority 0); exit spot = left door, then right, rear, front, then a ring around
  the body, always reachable from the vehicle without crossing a wall (boats need a shore).
  A forced exit (`exit(actor, true)`: teleport, despawn) puts the actor on the nearest dry land.
- Borrowing an occupied vehicle: an Actor driver gets `onEvicted(v, by)` (if defined) and is
  placed at the door, otherwise an angry driver ped is spawned (speech bubble); +1 Chappal
  Meter via `N.wanted.add(1)`.
- Events: `bump` {a, b|null, speed, x, y, wall?, ped?, vehicle}, `horn` {x, y, type ('foot' on
  foot), vehicle, who, dur} (held car/bus horns repeat), `vehicle:enter|exit` {vehicle, actor},
  `player:enterVehicle|exitVehicle` {vehicle}, `radio:enter|exit` {vehicle} (types with
  `radio:true`), `vehicle:borrowed` {vehicle, driver, by, x, y}, `vehicle:spawn`, `sfx` {name:
  'skid'}. Night: headlight pools via `N.render.lights` + bulb/tail-lamp glows on `light`.
- `N.vehicles.autoSeed` (default true): on `game:new` / `game:continue` parked cycles appear at
  `cycle_rent` places, boats at jetties and the family Chetak at home (`seeded: true`).
  Helpers: `nearest(x, y, r, pred)`, `distTo(v, x, y)` (0 inside), `exitSpot(v)`, `remove(v)`,
  `clearDecals()`.
Implementation notes (entities.js, binding):
- `N.Actor` (= `N.entities.Actor`) base class. The `entities` system (order 25, runs in
  play/dialogue/cutscene) calls `update(dt)` on every entity except those with
  `selfUpdate` (the player has its own system), removes `alive === false` ones, rebuilds the
  spatial hash and pushes overlapping `solid` actors apart by `mass` (`fixed` = immovable,
  `noCollide`, `ignore: otherEntity`), calling `onBump(other, {a, b, nx, ny, speed})` and
  emitting `'bump'` when the closing speed > 30. Shoves go through
  `N.entities.pushTo(e, x, y)`, which never moves a non-vehicle into or through a wall (actors
  may set `moveMode` (default 'walk') or `noWorld: true` to opt out). main.js calls `N.entities.draw()` each
  frame: every in-view entity's `draw()` enqueues itself. Also `byKind(kind)`,
  `clear(pred)` (never removes the player), `count()`; events `'entity:add'/'entity:remove'`.
- `N.people.draw(ctx, look, {phase, speed 0..1, run})` draws ~1.35x the collision size
  (`N.people.SCALE`) so people read at the internal resolution. Extra look fields: `stripes,
  saree, border, blouse, lungi, dupatta, girl, bag, tie, cap: 'police'|'topi'|'cricket',
  capColor`. `N.people.randomLook(rng, kind?)`.
- `N.player` extras: `look`, `anim`, `exhausted`, `god`, `teleport(x, y)` (clamped into the
  map; a blocked spot falls back to the nearest free cell, else the spawn), `reset()`,
  `serialize()/deserialize()` (junk fields keep the current values; never NaN). Walk 45 / run 80 with acceleration, smooth turning, wall
  sliding; running drains energy (exhausted at 0 until 30). Events `'footstep' {x, y,
  surf, run, who}`, `'player:exhausted'`, `'player:teleport'`. While `player.vehicle` is
  set the player just follows it (vehicles.js moves the vehicle and draws the driver).
- **`N.interact`** decides what ACTION does: `add(id, {x, y | entity, r, label (string or
  fn(player)), priority, enabled?(player), use(player)})`, `remove(id)`, or per update
  step `offer({label, priority, dist, use})` (e.g. "Ride Chetak" near a vehicle, "Get off"
  while driving). The `interact` system (order 58) picks the best (priority, then
  nearest), shows its label via `N.input.setActionLabel`, and on ACTION consumes the press
  and calls `use(player)`. Systems that read ACTION themselves run earlier and must
  `N.input.consume('action')`.

Controls in vehicles: keyboard = tank style (up accelerate, down brake/reverse,
left/right steer); touch joystick / gamepad stick = point-to-steer (vehicle turns toward
stick direction, throttle = stick magnitude). RUN button = handbrake in vehicles.

## 9. Input — `N.input`

Actions: `up down left right action run horn map journal pause radio view`.
Keys: WASD/arrows; action = E, F, Enter; run = Shift; horn = Space; map = M;
journal = J; pause = Esc/P; radio = Q (or R); view = V (cycles top-down / 3D / first person, §20).
```
N.input.move → {x, y} (-1..1, normalised; joystick analog)
N.input.down(a), N.input.pressed(a) (edge this frame), N.input.released(a)
N.input.device → 'keyboard'|'touch'|'gamepad'
N.input.consume(a)   // mark handled so others ignore it this frame
N.input.press(a) / N.input.setMove(x,y)  // synthetic input for tests
```
Touch UI (DOM, shown when a touch is first seen or pointer is coarse): floating
joystick on the left half; right side buttons ACTION (context label: "Talk", "Ride",
"Get off", "Pick up"), RUN/BRAKE, HORN; small top buttons MAP, PAUSE.
`N.input.setActionLabel(text|null)` lets the player/npc systems show the context label
(also shown on desktop as a prompt "E — Ride Chetak").

Implementation notes (input.js, binding): the `input` system runs first in every mode
(order 0, `runIn ['*']`); edges are computed per update step. Also `N.input.analog` (move
came from joystick/stick: use point-to-steer), `hold(a, on)`, `press(a, seconds?)`,
`setMove(x, y, analog = true)` / `setMove(null)`, `clear()`, `anyPressed()`,
`setLabel(action, text|null)` (e.g. RUN -> 'BRAKE' in vehicles), `showTouch(on)`,
`releaseAll()` (drops every physical key / touch / pad input; done automatically on window
blur and when the tab hides — synthetic `hold`/`setMove` input is kept); the joystick also
resets on `lostpointercapture` and on a release anywhere on the page;
`'input:device'` event; body classes `touch-on`, `dev-touch`, `dev-pad`. Touch layout:
joystick zone = left 52% below the top 64 px; ACTION/RUN/HORN bottom-right; MAP and
PAUSE pills at the top-right (keep ~120 x 52 px there free on touch). Touch controls only
show in `play` mode. Gamepad: A action, B horn, X/RB/RT run, Y radio, LB journal, Back
map, Start pause, d-pad/left stick move, R3 view, right stick 3D camera look. Touch scrolling is blocked
except inside `.scroll`. 3D (§20): a VIEW pill above HORN; in 3D views a `.t-look` zone (right 48%,
mirrored with `touch-left`) turns drags into camera look; mouse drag / pointer lock on `canvas#game3d`;
`N.input.look`, `takeLook()`, `addLook(dx, dy)`, `rawMove`; in 3D `play`, `N.input.move` is camera-relative.

## 10. UI (DOM) — HUD, dialogue, menus

DOM overlay `#ui` above the canvas, built with plain DOM APIs. All colours are CSS
tokens defined on `:root` in style.css (single deliberate dark "VHS night" look, explicit
backgrounds, `color-scheme: dark`). Fonts: display "Yatra One" (hand-painted signboard),
body "Baloo 2", OSD/mono "VT323"; each with fallbacks
(`'Yatra One', 'Baloo 2', system-ui, sans-serif` etc.).
- HUD: top-left VHS OSD strip (`▶ PLAY  TUE 14 JAN 2003  17:42`) + district name;
  top-right money, energy bar, **Chappal Meter** (5 slipper icons drawn in CSS/SVG);
  top-center objective; bottom-left minimap (canvas, rotates with heading optional, blips);
  toasts; big centre banners ("MISSION PASSED — Respect +", "PAKDA GAYA!", "THAK GAYA!").
- `N.hud.objective(text|null)`, `N.hud.toast(text, ms)`, `N.hud.banner(title, sub, ms)`,
  `N.hud.blip(id, {x, y} | entity, {color, icon, label, pulse, route})`, `N.hud.unblip(id)`,
  `N.hud.districtBanner(name)`, `N.hud.timer(label, seconds|null)`, `N.hud.show/hide()`.
  The HUD keeps the current objective in `N.hud.objectiveText` (read by `N.debug.state()`);
  `N.world.renderMap(ppu)` gives a ready map image for the minimap.
- Dialogue: `await N.dialogue.say(speakerId, text, {mood})`,
  `await N.dialogue.choice(speakerId, prompt, [opts]) → index`,
  `await N.dialogue.play([{s, t}, ...])`, `N.dialogue.speakers[id] = {name, color, portrait(ctx, w, h)}`.
  Typewriter text, ACTION/tap to advance, `*word*` renders as highlighted slang with a
  glossary tooltip (`N.dialogue.glossary[word] = meaning`).
- Menus: title (Start / Continue / Settings / Credits), pause (Resume, Map, Journal,
  Settings, Save, Quit to title), full-screen map with landmarks and blips, Journal
  (story so far, clues, collectibles, trivia cards, Hyderabadi dictionary), settings
  (volume, music, touch layout, reduced motion, text speed), credits. Cutscenes:
  `await N.menus.cutscene([{type:'card'|'text'|'vhs'|'fade', ...}])`.
  Menus API used by the engine: `N.menus.title()`, `pause()`, `resume()` (calls
  `N.game.resume()`), `hideAll()`, `isOpen()`. Menus own the `pause` action (open/close
  the pause screen) and must unlock audio (`N.audio.unlock()`) inside the START gesture,
  then call `N.game.newGame({skipIntro:false})` / `N.game.continueGame()`.

Implementation notes (hud.js / dialogue.js, binding):
- HUD layout: OSD top-left, tin-sign stats top-right (below MAP/PAUSE on touch), a top-centre
  column `.hud-top` (objective, timer, toasts stack, never overlap), centre banner, district
  card (bottom-right desktop, centred on phones), minimap bottom-left on desktop and under the
  OSD on touch / phone portrait. Hidden in title/boot/cutscene; minimap + toasts fade in
  dialogue; only the top column + banner show in minigame. `N.hud.hide()/show()` for scripts.
- `N.hud.banner(title, sub, ms, {kind})`: kind 'pass' | 'fail' | 'busted' | 'chapter' | 'info'
  (inferred from the title if omitted); pass/fail/busted cut in front of title cards.
- `N.hud.blip(id, target, opts)`: target `{x, y}` | entity | place id; opts `{color, icon:
  'dot'|'star'|'giver'|'shop'|'square'|'ring'|'diamond', label, pulse, route (pink road
  route on the minimap via A* over N.world.roads), size, minimap:false, edge:false (hide when
  off the minimap instead of an edge arrow)}`. `N.hud.blips` (Map), `blipPos(b)`, `route()`
  (current route polyline) and `mapImage()` (the styled minimap base image) are there for
  the full map.
- `N.hud.timer(label, seconds, {countdown})` counts down by itself in play mode (missions
  push the value each step with countdown:false); `timer(null)` hides; `timerValue()`.
- `N.hud.ask(title, [{label, key?, fn}])` -> close(): small interactive card (retry etc.);
  `closeAsk()`. `N.hud.objective()` emits `hud:objective` (text).
- Dialogue: `N.dialogue.define(id, {name, color, look, portrait(ctx, w, h, mood) | false,
  voice})`. Unknown ids get a generated speaker; built in: `narrator` (no portrait) and `you`
  (Chinnu). `look` feeds `paintPortrait(ctx, w, h, look, mood)` (48x48 pixel bust): `{skin,
  hair, hairStyle: short|side|long|bun|braid|bald|spiky|puff|curly|oiled, moustache:
  true|'thick', beard: true|'stubble'|'long', specs: true|'round'|'thick', cap: topi|skull|
  gandhi|police|cricket, capColor, dupatta, burqa, bindi, shirt, stripes, tie, collar,
  earrings, flowers (jasmine), ribbon, age: kid|teen|adult|old, bg, kind (N.people kind)}`;
  moods: neutral | happy | angry | sad | surprised.
- `say(s, t, {mood, auto: seconds})`, `choice(s, prompt, options, {default, mood})` -> index
  (-1 if cancelled), `play([{s, t, mood?, choices?}])` -> last choice, `cancel()`, `advance()`,
  `isOpen()`, `current`, `textSpeed` (settings), `skip` (debug: instant, choices -> default).
  Lines queue; the box stays open between back-to-back lines. It pushes the `dialogue` state
  only when opened in play (in cutscene/minigame it just overlays). It only types and takes
  input in play/dialogue/cutscene/minigame/gameover (never under the pause menu, map or
  journal); `auto` lines count game time. Plainly assigned `speakers[id] = {...}` objects are
  normalised on first use. Keys: ACTION completes
  then advances; arrows/W-S + ACTION or 1-4 choose; tap/click the box or a choice.
  Events: `dialogue:open|close`, `dialogue:line` {speaker, text, choices}, `dialogue:char`
  {speaker, pitch}, `dialogue:choice` {speaker, index, text}.

## 11. Missions — coroutine API (`N.missions`)

```
N.missions.register({ id, chapter, title, giver: {place | npc | x,y}, requires: [ids],
  autoStart?: bool, script: async (m) => {...} })
N.missions.start(id), N.missions.active, N.missions.done (Set), N.missions.available()
m.objective(text)                   m.blip(target, opts) / m.unblip(id)
await m.goto(target, {r, label, onFoot?, inVehicle?, vehicleType?})  // target = placeId | {x,y} | entity
await m.wait(sec)                   await m.until(fn, {timeout, failMsg})
await m.say(speaker, text)          await m.talk([{s,t},...])     await m.choice(s, prompt, opts)
await m.cutscene(steps)             await m.minigame(id, params) → result object
m.spawn(entity) (auto-removed at end unless keep)   m.timer(sec, label) (fails on expiry)
m.give(itemId), m.money(paise), m.flag(name, value)
m.fail(reason)  (throws; runner shows MISSION FAILED, offers retry)
m.checkpoint(name) (retry resumes here)
```
The runner ticks pending conditions each frame; promises resolve on the frame the
condition becomes true; abort (fail/quit/load) rejects everything pending with a
`MissionAbort` that scripts must not catch. On success: banner + reward + save.
Mission givers appear as a pulsing coloured marker on the map/minimap.

Implementation notes (missions.js, binding):
- Def extras: `giver: {place | npc | x, y, r = 14, onFoot}`, `requires`, `autoStart`, `when()`,
  `reward: {money, item, flag}`, `passText`, `color` (giver marker), `autosave` (default
  true), `onPass()`. Walking into an available giver's marker starts it (after a failure the
  player must step out first). `m` extras: `m.toast()`, `m.marker(target, {r, color})` /
  `m.unmarker(id)`, `m.vehicle(type, x, y, angle, opts)` (spawn + track), `m.data`,
  `m.attempt`, `m.retrying`; `goto` opts `{r, label (sets the objective), onFoot, inVehicle:
  true|type, vehicleType, blip, marker, route, color}` (hints if the condition isn't met);
  `until(fn, {timeout, failMsg})` fails the run on timeout even if not awaited;
  `timer(sec, label, {failMsg})` -> `{stop(), add(s), left}`, `timer(null)` stops;
  `give(id, {name})` toasts "Got: name".
- Retry: the failed run's checkpoint is kept; retry re-runs the script in **fast-forward**
  until `m.checkpoint(name)` is reached again (goto/wait/until/say/cutscene resolve at once,
  choices and minigames replay the recorded answers, money/give are skipped, spawns, flags,
  objectives and blips are applied), then teleports the player to the checkpoint position
  and back into a vehicle of the same type. Without a checkpoint the player is put back at
  the mission start.
- When a run ends early (fail / abort / quit / load) the runner also closes what it opened:
  `N.minigames.abort('mission:<result>')` for a minigame started with `m.minigame`, and
  `N.menus.abortCutscene()` (menus agent: please provide it; it must resolve the pending
  `cutscene()` promise) for `m.cutscene`.
- Markers: pulsing cylinder of light (ground glow + rings + projected beam + a screen-space
  shaft and diamond), night light, and an off-screen edge arrow with the distance in metres
  (1u ≈ 0.3 m). Goal markers are pink `#ff5fb0` (matches the minimap route), givers yellow.
- Events: `mission:start` {id, title, attempt}, `mission:checkpoint` {id, name},
  `mission:complete` + `mission:pass` {id}, `mission:fail` {id, reason}, `mission:abort`,
  `item:give`, `flag`, `money`. `N.missions`: `active`, `lastFailed`, `defs`, `available()`,
  `isDone(id)`, `giverPos(def)`, `posOf(target)`, `complete()` (debug), `fail(reason)`,
  `abort()` (silent), `retry()`, `markers()` (for the full map), save section `missions`.

## 12. Save — `N.save`

`N.save.register(key, {serialize() → json, deserialize(json)})`; `N.save.save()`,
`N.save.load() → bool`, `N.save.has()`, `N.save.clear()`. Key `nostalgia.save.v1`.
Saving happens at STD/PCO booths, on mission pass, and from the pause menu.

Implementation notes (save.js, binding): one JSON blob `{game:'nostalgia', v:1, t, meta:{reason,
day, clock, date, money, district, missions}, data:{section: json}}`; the previous good save is
kept under `nostalgia.save.v1.bak` and used when the main blob is corrupt. Without localStorage
saves live in memory for the session (`N.save.available` false). `save({reason, toast:false})`
-> bool (not in title/boot; emits `save` {ok, reason}); `load()` validates first, then aborts
the mission, cancels dialogue, clears flags, calls `N.systems.reset()` and deserializes each
section on its own (errors are reported, never thrown); emits `save:loaded`. `info()` -> meta
for a Continue button. Built-in sections: `player` (incl. the vehicle being ridden), `clock`,
`flags`; missions registers `missions`. Modules register more in their `init()`.

## 13. Debug/test hooks — `N.debug` (always present; overlay only with `#debug`)

```
N.debug.newGame({skipIntro:true}), teleport(placeId | x, y), give(paise), heal(),
setTime(h, m), setWanted(n), spawnVehicle(type), enterVehicle(type),
startMission(id), completeMission(), skipDialogue(bool) (auto-advance instantly),
collectAll(), god(bool), fps(), state() → {mode, mission, objective, player:{x,y,mode}, errors:[]}
N.debug.errors → array of captured errors (window.onerror + N.err)
```
Also `N.debug.perf()` -> `{fps, frameMs, updateMs, drawMs, chunks, entities, queued,
chunkBuilds, buildMs, ms}` (`ms` = last frame per phase, see §6), `freezeClock(on)`; `teleport` also accepts a landmark id and
returns the final `{x, y}` (null if unknown); `state()` also has `clock, day, district,
surface, wanted` and `player.energy/money/vehicle`. Overlay keys (with #debug): backquote
toggles it, Alt+1..4 = 07:00 / 12:00 / 17:30 / 21:00, Alt+G = god mode.

## 14. Testing

Playwright is installed globally:
```js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
```
Use `.cjs` test files under `nostalgia/tests/`. Open `file:///home/user/DS/nostalgia/index.html`
(add `#debug` when needed). Fail on any page error or console error. Screenshots go to
`nostalgia/tests/out/` (git-ignored). Use `page.keyboard` for real input, or
`N.input.press` / `N.input.setMove` for deterministic input. Typical run:
`node nostalgia/tests/smoke.cjs`. Tests stub Google Fonts (route `fonts.googleapis.com` /
`fonts.gstatic.com` to an empty 200 response) so runs are hermetic and offline font
failures never count as console errors (`REAL_FONTS=1` loads them through `$HTTPS_PROXY`).
`tests/smoke.cjs` covers desktop keyboard + portrait/landscape touch (CDP touch drags on
the joystick), pause, teleports, night and in-page frame timing; `ONLY=desktop|portrait|
landscape` runs one viewport. `tests/core_systems.cjs` covers vehicles (real-key
driving of several types, walls, boats, borrowing), dialogue, the mission runner (DEMO mission,
fail + checkpoint retry), save/reload/corruption, the minimap and HUD overlap on phones
(`ONLY=desktop|portrait|landscape|nostorage`). `tests/engine_qa.cjs` is the adversarial engine
review: an in-page checker for every API in §5-§13, tunnelling / wall / exit / NaN / input-loss /
joystick / dialogue / mission-leak / save-garbage probes, a night-drive perf run with a CPU
profile, screenshots and the dist build (`ONLY=contract,bugs,perf,visual,build`).
Build with `node nostalgia/tools/build.mjs`. Headless Chromium has no audio device; audio code must
not throw when the AudioContext cannot start.

## 15. Visual direction

Golden-hour Deccan city seen from a kite. Palette anchors: Charminar lime-plaster cream
`#e8d9b5`, Golconda sandstone `#b98f5e`, Deccan granite `#8f8a86` / pink granite `#b89a8f`,
Hussain Sagar water `#2f7f86`→`#3f9aa0`, dusty red soil `#b5694a`, neem green `#4f7a3a`,
auto-rickshaw yellow `#f2c230` + black, APSRTC red `#b22b2b`, Irani-cafe teal `#2a8c82`,
whitewash `#efe9dc`, painted-signboard primaries. Night: sodium-vapour orange street lights.
UI: hand-painted tin signboards + VHS on-screen-display. Avoid generic "pixel-font arcade".

## 16. Performance budget (engine notes)

Target: 60 fps on mid-range phones. The internal canvas is ~640x360 (desktop) or ~390x844
(portrait), so fill-rate is cheap; JavaScript canvas calls are the real cost. Keep the
per-frame JS draw work under ~6 ms on a desktop CPU in the densest view (~500 buildings).
Rules that keep it there: draw only what is in view; cache anything static as a sprite or
`Path2D` (roof tops, tree canopies and wall window grids are cached per structure in
small LRUs; ground and static shadows live in chunks); batch many shapes into one path
and one fill; avoid per-frame closures/objects in hot loops; never call `getImageData`
on the main canvas (it switches Chrome to CPU rendering).
Measured (headless Chromium, software raster, night, 180 u/s dolly through Old City -> Abids
-> Secunderabad with 40 lit vehicles): desktop ~7 ms JS per frame, phone portrait ~10.5 ms.
Generic buildings cost ~12 µs each (~180 in view); big landmarks cost 0.3-0.6 ms each per
frame plus their night light layers — landmark art should cache its static parts (roof
sprites / Path2D) the way world.js does. Use `N.debug.perf().ms` to see the phase split.


## 17. Audio — `N.audio` (audio.js, system order 70, runs in every mode)

All sound is synthesised (WebAudio only, no samples): ~96 one-shot SFX, engine voices,
district ambience + place emitters, an original step-sequenced score (sitar/santoor/tanpura
via Karplus-Strong, bansuri, shehnai, harmonium, strings, brass band, tabla/dholak/dappu/marfa,
90s synths), a 3-station vehicle radio and the Walkman. It never throws without an
AudioContext; every call before `unlock()` is a safe no-op returning `false`/`null`.

```
N.audio.unlock()                 call inside the START gesture (also auto on the first pointer/key; later
                                 gestures resume a context the OS suspended). available / ready / ctx.
setVolume(bus, 0..1), getVolume(bus)   bus: master | music | sfx | radio | ambient   (persisted)
mute(bool), toggleMute(), muted, settings   localStorage 'nostalgia.audio.v1' (try/catch); emits 'audio:settings'
duck(on, amount=0.32)            manual music duck (dialogue mode / 'dialogue:open' duck automatically)
sfx(name, {x, y, vol, pitch, pan, surface, variant, delay, force, ui}) -> bool
                                 x/y = world position: distance attenuation + pan + air absorption,
                                 culled beyond ~700u; omit for UI sounds. SFX_NAMES lists all names.
horn(vehicle | type, {x, y})     the right horn: cycle bell, auto "pom pom", scooter, car, bus, lorry tune
engine(vehicle | null)           force the player-engine target (default: follows N.player.vehicle)
music.play(id) / music(id)       lock a track (story cues); music.stop(fade) / music(null); music.lock(null)
music.mood(id | null)            soft request (below chase/victory); music.intro(sec|false)
music.current, music.ended       'music:ended' {id} fires when a locked non-looping track (e.g. 'ending') ends
music.sections(id) -> [{name, start}], music.position()   sync cutscenes to the score
music.TRACKS: title, flashback, day, night, chase, oldcity, tension, victory, ending, festival,
              numaish, kites, + radio songs r_chandni, r_barish, r_baraat, r_neon, r_pager
radio.next() / set(i | -1) / off() / toggle(), radio.on, radio.station, radio.text, radio.STATIONS
walkman.play(id?) / stop() / next() / rewind() / unlock(id) / library / playing;  SONGS {id: {title, artist}}
ambient.set(bedId | null), ambient.bed, ambient.emitters, ambient.BEDS
tape(0..1)                       cassette wow/flutter + muffle on music (also follows N.render.fx.vhs)
rec(sfxName) -> name             "● REC" a city sound (REC beep + the sound)
tapeMontage([sfxNames], {gap}) -> Promise   play recorded sounds back "from the cassette" (Side A)
tapeStop(sec) -> Promise         "■ STOP": the score winds down like a tape deck
beacon(target | placeId | null, {sound, max})   hot/cold beeping that speeds up near a hidden thing
renderOffline(name, sec), renderTrackOffline(id, sec) -> Promise<{peak, rms, buffer}>; stats()
```
Music director (automatic unless locked): title screen -> `title`; a new game (not
skipIntro) opens on `title` for ~40 s; free roam -> `day` / `night` (N.clock.isNight) /
`oldcity` (Old City districts), one pass then 25-50 s of ambience-only rest, district
changes switch only after 10 s; Chappal Meter >= 3 -> `chase` (held 4 s after escaping);
`mission:complete` -> fanfare then `victory`; `N.missions.active.music` (a track id) is
honoured; radio or Walkman playing -> score yields. Story calls `N.audio.music.play('ending')`
for the Charminar finale (5 sections: alaap, theme, rise, lift (key change), coda).

Events listened to (all optional): `horn`/`vehicle:horn` {vehicle|type, x, y}, `bump`
{a, b, speed} (only vehicles/the player make noise), `pickup`/`collectible` {kind},
`money` {delta}, `mission:start|complete|fail`, `objective`, `hud:objective`,
`wanted`/`wanted:change` {level, prev}, `busted`, `wasted`, `player:exhausted` (panting),
`dialogue:open|close|char` {speaker}, `player:enterVehicle|exitVehicle`, `footstep`
{x, y, surf, run, who}, `kite:cut`, `radio:next`, `flashback` {tape}, `shop:buy`, `door`
{kind:'wood'}, `splash`, `save`, `game:new|quit`, generic `sfx` {name, x, y, ...} and
`music` {id} | {mood}. Polled as fallbacks: N.player.vehicle (enter/exit, engine), horn and
radio input (only until a module emits horn events), player footsteps (only when no
'footstep' events arrive), N.wanted.level, N.clock, N.world.districtAt/isWater, N.places
(emitters by id/prefix: charminar, koti_bus_stand, gokul_chat, temples, stations, girnis,
irani_cafe_*, school_*, playground_*, std_*, barber_*, ...), N.flags festivals
(`ganesh_immersion`, `bonalu`, `ramzan`, `numaish`, `sankranti`: `N.flags[id]` truthy,
`N.flags.festival === id` or listed in `N.flags.festivals`). Vehicle types may set
`TYPES[type].radio` (default: auto, cars, bus, lorry). Emits `audio:unlocked`,
`radio:station` {station, name}; DJ lines go to `N.hud.toast`.
CPU: pooled channel strips (22 voices) + per-sound cooldowns, k-rate pitch/filter params,
drum strokes and plucked strings pre-rendered to buffers in idle time, 0.18 s lookahead
scheduler; the context is suspended while the tab is hidden. Test: `node nostalgia/tests/audio.cjs`.

## 18. Minigames — `N.minigames` (minigames.js)

Eight full-screen minigames (systems_design §8), each a DOM overlay (`#overlay .mg-screen`,
opaque) with its own canvas, VHS-OSD top bar, big touch buttons (touch) or a key-hint strip
(keyboard), a one-screen how-to card, a 3-2-1 countdown, pause (Esc / ‖ pill: Resume · Restart ·
Quit) and a result card ("Aage chalo" resolves, "Phir se" retries). Keyboard, mouse, touch and
gamepad (A=Space, B=X, X=Z, Y=C, LB/RB=[ ], LT/RT=Shift, Start=Esc, d-pad/stick=arrows) work.
Built from `staging/mg/*.js` by `node staging/build_mg.cjs --install` (one IIFE).
```
N.minigames.play(id, params) -> Promise<result>   (alias start(); never rejects:
  unknown id -> {win:false, error:'unknown'}, already open -> {win:false, error:'busy'})
N.minigames.list() -> [{id, title, sub, place, places, secs}]   has(id), resolve(id) (aliases:
  golconda_clap, kite_fight, pech, brick_game, gully_cricket, pani_puri, gokul_chat, haggle,
  mol_bhaav, goli, kanche ...)
N.minigames.abort(reason)   active (id|null)   isOpen()   stats {best, plays, wins}   covering
N.minigames.TUNE  {assist, offset, assistWindow 1.5, assistDiff 0.15, presetOffset, payCap,
  kite, clap, brickgame, cricket, antenna, panipuri, bargain, marbles, pay}  (all tunables)
N.minigames.SIDE (free-roam table)  side(on)  pay(sideEntry, result, placeId)  ledger
ids: kite clap brickgame cricket antenna panipuri bargain marbles
params (all games): difficulty 0..1 (default 0.4; + the settings preset offset), assist (bool;
  default N.settings.minigameAssist: timing windows x1.5, d -0.15), seed, noRetry, noQuit,
  skipHowto, intro (story line on the how-to card), title, reward (paise, paid on a win),
  autoplay 'win'|'lose' (test bot), timeScale, place
per game:
  kite {target, time, lives, charkhi}          (charkhi also from inventory: +1 life, wider band)
  clap {skin:'golconda'|'drums'|'doorway', rounds, noFail}
  brickgame {mode:'blocks'|'race', target}
  cricket {target, overs, wickets, bowler:'ayesha', trialBall, mali}  (trial ball defaults to
          free play with cricket_ball in the inventory; mali defaults on in public_gardens)
  antenna {time, caller:'amma'|'babji'}
  panipuri {target}
  bargain {who:'auto'|'banana'|'flower'|'kite'|'farmer'|'books' (else 'auto'), start, target,
          floor, meter (auto: start meter+10, target meter), list (farmer: list x1.25 -> list),
          like:'logic'|'charm'|'local'|'filmy', randomType, dest, what}
  marbles {count (default 9), rival:'pappu'|'tiger', rivalName, rajaGoli (default: inventory
          raja_goli: striker mass +25%, aim guide +30%)}
result: {id, win, score, stars 0..3, quit, aborted, attempts, time, difficulty, assist, ...}
  kite {cuts, lost, livesLeft} · clap {rounds, fails, perfects, skin} · brickgame {mode, lines,
  cars} · cricket {runs, balls, wickets, reason} · antenna {crows, timeLeft, best} · panipuri
  {eaten, crunches, bestCombo, reason} · bargain {price, start, target, saved, savedPaise,
  pricePaise, who, like} · marbles {mine, rival, draw, opponent, raja}
```
While open: state `minigame` is pushed (popped on close; `N.input.clear()`), the overlay owns
the keyboard (keydowns don't reach the game), the tab-hidden event pauses it, and
`N.world.draw` / `N.entities.draw` / `N.render.queue|flush` are skipped (wrapped lazily) while
the world is covered. Events: `minigame:start` {id, params}, `minigame:end` {id, result},
`minigame:event` {id, type}. Reduced motion (settings or OS) turns off shakes and flashes.

Free-roam side activities (`MG.SIDE`, registered with `N.interact` at priority -1 so story wins,
on `boot` / `world:built`): kite at home_terrace/gulzar_houz (Sankranti 13-15 Jan, or Jan-Feb
16:30-18:30), antenna at home/friend_home, clap at golconda_fateh_darwaza (09:00-17:30), brick
game at video_parlour_* (₹1), cricket at playground_*/victory_playground/musi_riverbed (16:00-
18:30 school days, 08:00-18:30 otherwise), marbles at playground_* (and *Goli vs Tiger* at
playground_14 once 10 golis are found or `N.flags.marbles_tiger`), pani puri at gokul_chat (₹5),
auto haggling at koti_bus_stand/rtc_x_roads/stations, banana/flower carts, rythu_bazaar_*, plus
any `WORLD_DATA.places[].minigame`. Pay (systems §2.4): cricket ₹2 (₹5 for 3 stars), marbles ₹2
(₹5 vs Tiger), max 3 paid wins per game per game-day; kite ₹2 a cut, max ₹10 a day; brick game
refunds ₹1 on a win; pani puri win = free plate (tummy +15); a lost bargain closes that seller
for 10 game minutes. Turn off with `N.minigames.side(false)` or `N.flags.mg_side_off = true`.
Stats persist in localStorage and `N.save` key `minigames` (with the day ledger).
Test: `node nostalgia/tests/minigames.cjs` (LAB=1 for the staging lab, ONLY=, IDS=, QUICK=1).

## 19. Story layer (integration contract)

The story layer implements `design/story_bible.md` (the story, binding) and
`design/systems_design.md` (numbers and rules, binding), plus `design/places_registry.md`.
New files (already listed in index.html): `src/storycore.js` (after missions.js),
`src/seasons.js` (after places_art.js), `src/sidejobs.js` (after shops.js),
`src/story2.js` (after story.js). Every module registers through these APIs so they can be
built in parallel. All of them are tolerant of the others being stubs.

**`N.calendar`** (storycore.js): `date → {y, m (1-12), d, dow (0=Sun), label:'TUE 14 JAN 2003'}`,
`set(y, m, d, h?, mi?)`, `await jumpTo(y, m, d, h, mi, {fx:'ff'|'rewind'|null})` (VHS ▶▶ 1.5 s),
`year`, midnight rollover + the week-loop rule (systems §10.5). Base date Tue 14 Jan 2003.
Changing the date calls `N.seasons.autoFor(date)`. Emits `calendar:change`.

**`N.seasons`** (seasons.js): `set(name, on)`, `is(name)`, `autoFor(date)`; names:
`sankranti numaish summer bonalu ganesh ganesh_immersion ramzan chand_raat christmas
prasads_open year2026`. Mirrors each into `N.flags[name]`. Draws flag-driven world overlays
(kites in the sky, Numaish lights and giant wheel, Ganesh pandals and the Tank Bund immersion
procession with cranes, Bonalu pots and Pothurajus, Ramzan lights and haleem bhattis, Chand
Raat crowds at Charminar, Christmas stars in Secunderabad, Prasads fence vs open cinema).
Emits `season:change`. Also **`N.respect.at(x, y) → zone|null`** (respect zones: walk only,
meter frozen, pursuers stop at the boundary).
Details (seasons.js header is the reference): `set(name, on|null)` overrides the calendar (an
override set during a mission ends with it), `autoFor(date)` applies the bible §1.4 calendar and
keeps overrides on top, `calendarFor(date)`, `active()`, extras `world_cup monsoon eid`, weather
`raining` / `mist` (`'weather'` event; `N.flags.rain = true|false` forces it; mirrored to `N.flags.raining`, and `is('rain')` / `is('mist')` read it), `overlays[name] =
false` switches one overlay off, `profile` / `prof` time them. The giant Khairatabad idol leaves its
pandal on immersion day (`N.landmarks.fx.ganesh` is set false only while it is null).
`N.respect.at(x, y)` -> `{id, name, kind, place, part: 'compound'|'forecourt', gate, zone}`:
'compound' = inside the walls (walk only; vehicles get an invisible wall; no horn, radio, peels,
borrowing, camera, jobs, minigames; collectibles never go here), 'forecourt' = the 30 u at the gate
(footwear stand; meter frozen, pursuers wait 40 u away). Kinds: temple mosque church dargah
gurudwara ashurkhana tomb charminar procession. Also `inside(x, y)`, `near(x, y, r)` -> `{zone, d}`
(the pursuers' 40 u buffer), `distance(x, y, zone)`, `zones`, `add(zone)` / `remove(id)`,
`procession(id, pts, r, {name})` / `endProcession(id)` (seasons.js adds the Bonalu and Tank Bund
immersion processions while those flags are on), event `respect:change`. Tests:
`node tests/seasons.cjs`, `node tools/check_registry.cjs` (every place id the design docs use).

**`N.tape`** (storycore.js): `counter (0-999)`, `side 'A'|'B'`, `paused`, `tracks[]`,
`await rec(id, {sfx, label, place, to})` (the ● REC moment: UI, sound, counter roll),
`tin` (Set of token ids), `addToken(id, {name, desc})`, `play('sideA'|trackId)`.
HUD shows `SIDE A 000` beside the OSD strip.
**`N.walkman`** (storycore.js): `owned`, `cassettes` (Set), `add(id)`, `play(id)`, `stop()`,
`next()`, `playing`. Cassette metadata from bible §6.3. Uses `N.audio`.
**`N.hints`** (storycore.js): `register(missionId, [tier1..tier4])`, `next(source)` with
source `'std'|'aunty'|'city'|'auto'`, automatic nudges at 3/6/10/15 min (systems §6).

Story-core implementation notes (binding; full API comment at the top of storycore.js):
- `N.clock.baseDate = [2003, 0, 14]`; `N.clock.hold(reason, on)` / `held` freeze the clock (shop menus,
  VHS jumps); `N.clock.loop {from, to, n}` + `setLoop()` / `looping` (the elastic week loop, set by
  N.calendar from the next unfinished main mission); events `clock:day`, `clock:loop`.
- `N.calendar.STORY` holds the 12 missions' bible data (date, end, track, J-card line, scribble, REC sound,
  counter, token); `missions.register` fills those fields for the bible ids. `jumpTo(spec, {fx, ms})`.
  `markStop(day)` after a main mission; `setHorizon(spec)` pins the loop's stop (story beats).
- `N.tape.rec(id?, opts)` defaults come from STORY; `recState` drives the HUD `● REC`; `m.rec()` /
  `m.token()` wrap it in missions (instant while a retry fast-forwards).
- `N.walkman`: `add('cassette_N')` (collectibles), `addSong('ending')`, `deck.open()` (home 2-in-1);
  the RADIO action on foot / bikes = next source, hold 0.6 s = off; vehicle radios stay in audio.js.
- `N.hints.start(missionId, {clue, answer})` when the clue is handed over; `next()` does not charge
  money (the STD booth / auto caller does); `solve()` happens on that mission's `mission:start`.
- `N.player` (entities.js): money starts at 1000; `tummy` (start 80, energy <= tummy), `feed(n, {energy,
  tummy})`, `addStatus/hasStatus/clearStatus/statusLeft` (warm coma knee limp cool gola hair balloon
  goggles sugar), counted `items` + `addItem/itemCount/eat/bestEdible`, `sitting` / `noRun` flags,
  `legsGone` (pedal at energy 0: vehicles.js may scale cycle speed x0.65), `fall(v)` (also automatic from
  `bump` events on bikes); events `player:feed|status|fall|up|starving|eat|items`. THAK GAYA belongs to
  wanted.js (listen to `player:starving`, set `tummy = 40`); entities.js runs a minimal fallback after 4 s.
- `N.missions`: def `kind 'main'|'side'|'job'`, `date`, `end`, `window`, `meter`, `jcard`, `scribble`,
  `rec`, `help`; the J-card prompt (`N.hud.jcard`) replaces walk-in starts; `canSave()`; player-facing
  `N.save.save({reason})` calls are refused during missions (no reason / `force` / 'mission' always save).
- `N.hud`: `toast(text, ms, {key})` (one visible at a time, keyed replace), `caption(text, {x, y, kind})`
  (setting `captions`), `searchCircle(id, c|null)`, `jcard(spec|null)`, `banner(.., {note})`.

**`N.npcs`** (npcs.js): every character in bible §2 is predefined:
`define(id, {name, look, portrait, color, voice})`, `spawn(id, target, {angle, idle, talk})`
→ actor (target = placeId | {x, y}), `despawn(id)`, `get(id)`, `await walkTo(id, target)`,
`follow(id, actor|null)`. Every character is also registered in `N.dialogue.speakers`.
Dialogue text tokens `{nick}`, `{full}`, `{FULL}` are substituted (player name card).
`N.dialogue.glossary` holds bible §10 + systems §17.

**`N.menus`** (menus.js): title (cassette J-card), name card (`await nameEntry()`), pause,
full map, settings, credits, save/load, Journal with
`addJournalTab({id, title, order, render(el)})`, and
`await cutscene(steps)` with step types `card {title, sub, ms}`, `text {lines, ms}`,
`vhs {mode:'rewind'|'ff'|'play'|'stop'|'rec', ms}`, `fade {to:'black'|'clear', ms}`,
`wait {ms}`, `say {s, t}`, `talk {lines}`, `camera {target, zoom, ms}`, `call {fn}`,
`jcard {...}`, `credits {}`; `abortCutscene()`.

Implementation notes (menus.js, binding; full API in the header of src/menus.js):
- Extra step types: `definitions {}` (bible §9.3), `prompt {label}` (waits for ACTION), `sfx {name}`,
  `music {id|null}`, `osd {text, sub, ms}`, `counter {from, to, ms}`, `flash`, `title {sub}`,
  `letterbox {on}`, `vhsfx {amount}`; a bare function is a `call`; `async: true` runs a step alongside
  the next ones; `vhs` also takes `year: [2026, 2003]`, `label`, `hold`, `music` (stop -> tapeStop).
  `cutscene(steps, {id, skippable, letterbox, keepCamera, holdFade})` -> `{skipped, aborted}`; it pushes
  `cutscene` from play/dialogue/minigame, holds under the pause menu, skips on a 1 s ACTION hold or the
  SKIP pill (call steps still run). Events `cutscene:start|step|skip|end`, `cutscene:vhs` (audio rewind).
- Names: `nameEntry()` -> `{nick, full}`; stored on `N.player.name/nick/full/fullName`, saved as section
  `profile`; `names()`, `setNames()`, `subst()`. Under automation (`navigator.webdriver`)
  `N.menus.quickStart` skips the overwrite prompt and the name card; tests set it false for the real flow.
- `N.settings` (menus.js): `get/set/values`, every key also a plain property (`N.settings.captions`),
  `diff(key)` = the systems §14.1 difficulty table, `textCps()`, `vhsScale()`; `settings:change`.
  Other modules add rows with `N.menus.addSettingsRow({id, label, type, opts, get, set, section})`;
  when `N.view` exists the title shows a VIEW track and settings a View row.
- Journal: built-in tabs `story`, `side_a`, `tin`, `lock`, `dictionary` keep their ids unless a caller
  passes `replace: true`; `addDiary()`. Map: `addMapLayer({id, title, points() | draw(ctx, view)})`,
  `waypoint(x, y | null)`; the place card reads `N.shops.hoursText(id)`, `N.flags.visited_<id>`,
  `N.collectibles.triviaFor(id)` when present. Saves: the N.save slot ("latest") + a manual copy
  (`nostalgia.save.v1.manual`); `canSave()` refuses during missions, minigames, cutscenes, dialogue,
  Chappal Meter >= 3 and `N.flags.no_save`. Other: `credits()`, `definitions()`, `jcard()`, `osdCard()`.

**`N.collectibles`** (collectibles.js): series `kite goli cassette ticket frame` (bible §6),
`items`, `has(id)`, `count(series)`, `total()`, emits `collectible {series, id}`, the unlock
ladder (systems §7) sets `N.flags.unlock_*`, trivia cards, viewpoints, Journal tabs.

**`N.shops`** (shops.js) and **`N.sidejobs`** (sidejobs.js): every shop/service kind in
systems §5 (prices in paise, hours), `open(placeId)`, Irani chai + Osmania at every Irani cafe,
STD booth = save + hint calls, barber clears the meter, cycle hire, bus travel, auto fares with
`bargain`, cinemas, Prasads, NTR Gardens train, Numaish rides, weighing-machine fortunes; odd
jobs (systems §9) via `N.sidejobs.register/start`.

**Story** (story.js: prologue + M1-M6 + SA1-SA4; story2.js: M7-M12, interlude, ending,
2026 epilogue, post-credits, SA5-SA8): `N.missions.register(...)` per bible §4, mission ids as
in the bible, listening to `game:new` for the prologue.

## 20. 3D view mode (alternative to top-down) — `N.view`, `N.view3d`

The user asked for a GTA-5-style 3D option. It is an alternative **renderer and camera**
over the same simulation: the world, player, vehicles, traffic, missions, dialogue, HUD and
saves are unchanged. Files: `src/view3d.js` (core: loader, renderer, city streaming, sky,
lights, cameras, registries), `src/view3d_landmarks.js` (3D models of landmarks and places),
`src/view3d_actors.js` (people, vehicles, animals, markers, collectible glints, season
overlays). Loaded in index.html after menus.js. Test: `node tests/view3d.cjs`.

- **Library:** three.js **0.149.0** UMD, loaded lazily the first time 3D is chosen: first
  `https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js`, then the local fallback
  `vendor/three/three.min.js` (then `../vendor/...` for dist/). If both fail or WebGL is missing,
  the game stays top-down and toasts why (`N.view.available = false`, `N.view.error`). The
  single-file build does not inline three.js. Tests serve the CDN URL from the vendored file
  (`page.route`) and launch Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader
  --ignore-gpu-blocklist` (software GL: judge perf by JS ms and draw calls, not fps).
- **`N.view`** (exists at load time, before three.js):
  `mode` ('top' | 'tps' | 'fps', the *effective* view), `want` (requested; differs while loading),
  `set(mode)`, `cycle()` (key **V**, gamepad R3, the touch VIEW pill above HORN), `is3D()`,
  `available` (null untried / true / false), `loading`, `error`, `yaw` (camera forward as a world
  angle), `pitch` (positive = looking down), `label(mode)`, `noPointerLock`. Persisted in
  localStorage `nostalgia.view.v1` (try/catch); a saved 3D view loads at boot. Emits
  `view:change` {mode, prev}, `view:ready`, `view:error` {error}; also follows
  `settings:change` {key:'view'} (menus: "View: Top-down / 3D (third person) / First person").
  Body classes `view-3d`, `view-tps`, `view-fps`, `body[data-view]`. Switching is instant once the
  scene is warm (the first switch keeps the 2D view while the near city builds, ~0.5-2 s); the
  scene is kept when going back to top-down (no leak on repeated toggles), and works inside
  vehicles and during missions. WebGL context loss falls back to top-down and rebuilds on restore.
- **Frame (main.js):** while `N.view3d.active`, main.js calls `R.begin()`,
  `N.view3d.beginFrame(dt)`, `N.systems.draw()` (HUD minimap, dialogue barks, menus) and
  `N.view3d.render(dt)` instead of the 2D world / entity draw and `R.flush()`. Hooks view3d
  installs on render.js (no render.js edits): `R.queue` is dropped while 3D renders;
  `R.proj / screenToWorld / clientToWorld` project through the 3D camera (barks follow actors);
  `R.view` is set each 3D frame to a square around the player sized to the 3D near range, so
  `R.inView` / `R.rectInView` keep "near the player" semantics for despawn / hop logic (in 3D,
  things farther away are visible: spawners should spawn beyond `N.view3d.quality.nearDist`);
  `R.night` is computed, `R.lights` drained (they become point-light candidates), `R.fx.flash`
  decays and `R.fx.fade / flash / vhs` show through the `#fx3d` overlay; `R.shake` offsets the camera.
  Minigames that cover the screen (`N.minigames.covering`) skip the 3D render.
- **Coordinates:** three `(x, y, z)` = world `(x, height, y)`: +x east, +z south, +y up, 1 unit
  = 1 world unit. A model facing world angle `a` (0 = east, +π/2 = south) gets
  `rotation.y = -a` (`H.place(obj, x, y, h, a)`). **Vertical scale `N.view3d.VS = 1.5`**: static
  world heights from the data are multiplied by VS (a data storey of 10u is 15u in 3D,
  `N.view3d.FLOOR_H`), so people (kids ~7u, adults ~9u tall), vehicles (bikes ~7u, autos ~11u,
  cars ~9u, buses ~17u high) and buildings read at believable proportions. Roofs: an actor on a
  roof stands at `roof.h * VS` (`N.view3d.elevation(e)`); landmark builders with a walkable roof
  (WORLD_DATA.roofs `building`) must put the floor at `roof.h * VS`.
- **City streaming:** 512u chunks (2x2 render.js ground chunks) built nearest-first within a
  frame budget (high tier 3.5 ms, low 2.5 ms; 18 ms for a few frames after a teleport), disposed
  beyond the draw distance. Per chunk: **ground** = a plane textured by render.js's own composed
  chunk painter (world.js + places_art + world_extras rails + landmarks.paintGround) at 2 px/u
  near / 0.5 px/u far, plus an aux texture (4u texels: alpha = water mask for an animated
  water shader with sky reflection and sun glint; rgb = sodium / tube-light pools lit at night);
  **buildings** = one merged mesh per chunk (walls with the facade atlas: per district window
  style, shop shutters with lit interiors, doors, arcades, glass; lit windows at night;
  parapets, hip / gable roofs, water tanks, mumtys, antennas, clotheslines, domes, minarets,
  awnings, compound walls, street-lamp poles with emissive heads, bridge parapets, raised
  rails, cranes, podiums, roof-zone terraces and planks); **signboards** = textured quads from a
  shared sign atlas (shop sign text); **trees** (trunks / canopy blobs / palm crowns, wind sway)
  and **Deccan boulders** = instanced; **lamp glows** = additive points. Chunks are frustum-culled
  as a whole. Ground cast shadows: high tier uses the real shadow map (ground painted with
  contact shading only); low tier (phones) bakes shadows from the 3D sun into the ground
  textures (repainted when the quantised sun moves) and has no shadow map.
- **Sky / light:** gradient sky dome with sun disc + halo, moon, stars and drifting clouds; one
  shadow-casting directional light (sun / moon; tight frustum ±190u around the player, texel-
  snapped; the light never drops below ~27° so shadows stay ≤ 2x height like the 2D sun); a
  hemisphere light; fog = horizon colour (draw distance 1500u high / 950u low); ACES tone
  mapping, sRGB output; up to 4 real point lights near the player at night (lamps, `R.lights`,
  `N.view3d.light()`), everything else lit by emissive heads, glow points and ground pools.
- **Cameras:** third person: orbit behind the player (mouse drag, or click for pointer lock on
  desktop — Esc releases; right-half touch drag `.t-look`; gamepad right stick), smoothed,
  collision-aware against a height grid of buildings / walls / rocks / landmarks (pulls in, eases
  out), auto-recentre behind when moving, chase camera in vehicles (swings behind the heading,
  looks ahead with speed, FOV kick at speed, distance by vehicle class), trees and poles right in
  front of the camera dither out; the cinematic orbit follows `R.cam` while `R.camOverride` is set
  (cutscenes) and on the title screen. First person: eye height 6.3u (an 11-year-old), subtle head
  bob (off with reduced motion), cockpit / handlebar view in vehicles (look offset springs back to
  the heading; the player's own avatar and vehicle are hidden unless their renderer sets `fps`).
- **Input:** in 3D (`play` mode only) `N.input.move` is rotated by `N.view.yaw` so up = forward
  (keyboard on foot, joystick, gamepad; `N.input.rawMove` keeps the screen-relative vector).
  Vehicles keep tank controls on the keyboard; stick point-to-steer becomes camera-relative.
  Look input: `N.input.look {dx, dy, stickX, stickY, dragging, locked, source}`,
  `N.input.takeLook()` (consumed by the camera), `N.input.addLook(dx, dy)` (tests).
- **Performance budget:** desktop ≤ ~6 ms JS per frame and ≤ ~300 draw calls in dense Old City;
  phones (tier 'low', auto-detected from a coarse pointer): pixel ratio ≤ 1.25 (adaptive down to
  0.7 when frames are slow), no shadow map, shorter draw distance, no point lights.
  `N.view3d.stats()` -> {calls, triangles, jsMs, jsAvg, renderMs, workMs, chunks, visChunks,
  landmarks, actors, geometries, textures, programs, pixelRatio, tier}.

### `N.view3d` API (for view3d_landmarks.js / view3d_actors.js)

Registrations are plain data at load time (three.js is not loaded yet); builders are called later
with `THREE` and the helper object `H`. Re-registering a key replaces the previous builder (the
core's temporary avatar / vehicle box / footprint landmarks are only defaults).

```
N.view3d.registerLandmark(drawId | '#landmarkId', build(THREE, lm, H) -> Object3D | null | false, opts)
    Called when the landmark comes within the landmark range (~1650u high / 1100u low).
    Build in LOCAL coordinates: origin at the landmark centre (lm.x, lm.y) on the ground,
    +x east, +z south, +y up (the core positions it; set obj.userData.worldSpace = true to
    opt out). Use heights * H.VS. null/undefined -> the generic footprint fallback; false -> draw
    nothing (e.g. it is part of another landmark's model). opts: {castShadow: true,
    update(obj, lm, dt, H) (animated: giant wheel, flags), dispose(obj, lm, H)}.
    Meshes cast / receive shadows automatically (set mesh.userData.noShadow to skip).
N.view3d.registerActorRenderer(key, {create(e, H) -> Object3D, update(obj, e, dt, H), dispose?(obj, e, H),
    fps?: true (keep it visible in first person, e.g. a handlebar model), shadow?: false})
    key resolution per entity: e.view3d, 'player' (N.player), '<kind>:<e.type | e.species |
    e.npcId | e.role | e.sub>', '<kind>' (ped npc vehicle animal pickup prop), '*'.
    Entities within the actor range (~620u high / 400u low) of the focus get an object; update()
    places it in WORLD space every frame: obj.position.set(e.x, H.elev(e), e.y),
    obj.rotation.y = -e.angle (people: e.facing). Keep each actor to 1-2 draw calls (merge with
    H.builder()); use H.blobShadow() under actors when !H.quality.shadows; headlights via
    H.light({x, y, h, color, intensity, r}) each frame.
N.view3d.registerStructure(t, build(THREE, s, H, gb, job) -> Object3D | void)
    For N.world structure types the core does not draw (e.g. 'custom'); add merged geometry to
    the chunk with gb (a facade GeoBuilder in chunk-local coordinates: s.x - job.ox, s.y - job.oz)
    or return an Object3D in chunk-local coordinates. Core types: bldg wall tree lamp rock rail
    roofzone crane podium (registering one of these replaces the core version).
N.view3d.registerLayer(id, {init(THREE, H), update(dt, H), dispose(H), order})
    Per-frame 3D overlays in world space (mission markers from N.missions.markers(), collectible
    glints, season overlays, kites, birds). Add objects to H.layer (a Group in the scene).
```

Helpers `H` (`N.view3d.H`): `THREE, VS, FLOOR_H, CHUNK, STYLE` (facade style ids), `scene, camera,
renderer, layer, quality, night` (0..1), `day` (N.clock.light()), `sunDir` (Vector3 to the
light), `time` (s), `mode` (view), `uniforms` (shared: uTime, uNight, uSunDir, uSunCol, uZen, uHor),
`materials` (shared: facade, vc, vcFlat, vcDouble, canopy, rock, glow...), `geo` (shared unit
geometries: trunk, blob, rock, crown, plane), `pos(x, y, h)`, `place(obj, x, y, h, angle)`,
`yaw(angle)`, `elev(e)`, `heightAt(x, y)`, `builder({facade})` -> GeoBuilder, `merge(geos)`,
`mat(hex, {emissive, emissiveIntensity, flat, double, transparent, opacity, map, basic})` (cached),
`color(hex)` (cached linear THREE.Color), `tex(key, w, h, paint(ctx, w, h), {premult, repeat, linear})`
(cached CanvasTexture, sRGB, anisotropic), `signSlot(text, bg, fg, aspect)` (sign atlas UVs),
`facadeMaterial(), vcMaterial(), blobShadow(w, d), glow(color, size)` (additive sprite),
`light({x, y, h, color, intensity, r})`, `dispose(obj)` (frees non-shared geometry / materials).

GeoBuilder (`H.builder({facade?})`, merged vertex-coloured geometry, one draw call):
`color(hex)`, `quad(a, b, c, d (12 numbers, counter-clockwise from the front), uv?)`,
`wall(ax, az, bx, bz, y0, y1, u0, u1, v0, v1)` (outward normal on the right of A->B seen from
above), `hquad(x0, z0, x1, z1, y, down?)`, `box(x0, y0, z0, x1, y1, z1, {bottom, top, sides})`,
`obox(cx, cz, w, d, y0, y1, angle)`, `cyl(cx, y0, cz, r0, r1, h, seg, {top})`,
`dome(cx, y0, cz, r, h, seg, rings)`, `sphere(cx, cy, cz, rx, ry, rz, seg, rings)`,
`extrude([[x, z]...], y0, y1, {top})`, `addGeometry(geo, matrix4)`, `build()` -> BufferGeometry,
`mesh(material?)` -> Mesh (default `H.materials.vc`, facade builders `H.materials.facade`).
Facade builders also take `facade(upperStyle, groundFloorStyle, lit 0-255, seed, windowRows)` /
`plain()` before walls: u = window bays across the wall, v = height / FLOOR_H (one row per storey);
styles `H.STYLE`: plain rect arch grill glass shop door arcade open colonial posh mosque stone
brick office lamp (lamp = emissive at night in the vertex colour).

Debug / tests: `N.view3d.settle(ms)` (finish pending chunk work now), `setQuality({adaptive,
pixelRatio, drawDist, ...; before the first switch also antialias, shadows, pointLights, tier})`,
`setCamera({yaw, pitch, snap})`, `snapCamera()`, `project(x, y, h)` -> CSS px, `rebuild(rect?)`,
`stats()`, `engine` (internals). Parity hooks still owed by other modules: missions expose active
markers (`N.missions.markers()`), collectibles expose glint positions, seasons expose overlay data;
missing parity degrades gracefully (never blocks progress).
