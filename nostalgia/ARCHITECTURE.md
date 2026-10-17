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
  src/landmarks.js  custom pseudo-3D drawing for named landmarks -> N.landmarks
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
Draw happens via the render layer queue (section 6), not via systems directly
(a system may expose `draw()` which main calls each frame to enqueue).

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
  spawns:    {player:[x,y], home:[x,y]}
}
```
`world.js` builds: surface grid; `N.world.surfaceAt(x,y)`, `isWalkable(x,y)`,
`isDrivable(x,y)`, `isWater(x,y)`, `collide(x, y, r, mode)` → `{x, y, hit}` push-out
(mode 'walk'|'drive'|'boat'), `raycast(x0,y0,x1,y1,mode)`, `districtAt(x,y)`,
`nearestRoadPoint(x,y)`; road graph `N.world.roads` (nodes/edges, lanes on the left,
`randomRoute(fromNode)`, `nearestNode(x,y)`); structures list for the `structures` layer
(generic buildings auto-generated inside `blocks`, styled per district, with painted
shop signboards, water tanks on roofs, dish antennas/TV antennas, clotheslines);
trees; street lamps along arterials.

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
Controls in vehicles: keyboard = tank style (up accelerate, down brake/reverse,
left/right steer); touch joystick / gamepad stick = point-to-steer (vehicle turns toward
stick direction, throttle = stick magnitude). RUN button = handbrake in vehicles.

## 9. Input — `N.input`

Actions: `up down left right action run horn map journal pause radio`.
Keys: WASD/arrows; action = E, F, Enter; run = Shift; horn = Space; map = M;
journal = J; pause = Esc/P; radio = Q (or R).
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

## 10. UI (DOM) — HUD, dialogue, menus

DOM overlay `#ui` above the canvas, built with plain DOM APIs. All colours are CSS
tokens defined on `:root` in style.css (single deliberate dark "VHS night" look, explicit
backgrounds, `color-scheme: dark`). Fonts: display "Yatra One" (hand-painted signboard),
body "Baloo 2", OSD/mono "VT323"; each with fallbacks
(`'Yatra One', 'Baloo 2', system-ui, sans-serif` etc.).
- HUD: top-left VHS OSD strip (`▶ PLAY  THU 14 JAN 1999  17:42`) + district name;
  top-right money, energy bar, **Chappal Meter** (5 slipper icons drawn in CSS/SVG);
  top-center objective; bottom-left minimap (canvas, rotates with heading optional, blips);
  toasts; big centre banners ("MISSION PASSED — Respect +", "PAKDA GAYA!", "THAK GAYA!").
- `N.hud.objective(text|null)`, `N.hud.toast(text, ms)`, `N.hud.banner(title, sub, ms)`,
  `N.hud.blip(id, {x, y} | entity, {color, icon, label, pulse, route})`, `N.hud.unblip(id)`,
  `N.hud.districtBanner(name)`, `N.hud.timer(label, seconds|null)`, `N.hud.show/hide()`.
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

## 12. Save — `N.save`

`N.save.register(key, {serialize() → json, deserialize(json)})`; `N.save.save()`,
`N.save.load() → bool`, `N.save.has()`, `N.save.clear()`. Key `nostalgia.save.v1`.
Saving happens at STD/PCO booths, on mission pass, and from the pause menu.

## 13. Debug/test hooks — `N.debug` (always present; overlay only with `#debug`)

```
N.debug.newGame({skipIntro:true}), teleport(placeId | x, y), give(paise), heal(),
setTime(h, m), setWanted(n), spawnVehicle(type), enterVehicle(type),
startMission(id), completeMission(), skipDialogue(bool) (auto-advance instantly),
collectAll(), god(bool), fps(), state() → {mode, mission, objective, player:{x,y,mode}, errors:[]}
N.debug.errors → array of captured errors (window.onerror + N.err)
```

## 14. Testing

Playwright is installed globally:
```js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
```
Use `.cjs` test files under `nostalgia/tests/`. Open `file:///home/user/DS/nostalgia/index.html`
(add `#debug` when needed). Fail on any page error or console error. Screenshots go to
`nostalgia/tests/out/` (git-ignored). Use `page.keyboard` for real input, or
`N.input.press` / `N.input.setMove` for deterministic input. Typical run:
`node nostalgia/tests/smoke.cjs`. Headless Chromium has no audio device; audio code must
not throw when the AudioContext cannot start.

## 15. Visual direction

Golden-hour Deccan city seen from a kite. Palette anchors: Charminar lime-plaster cream
`#e8d9b5`, Golconda sandstone `#b98f5e`, Deccan granite `#8f8a86` / pink granite `#b89a8f`,
Hussain Sagar water `#2f7f86`→`#3f9aa0`, dusty red soil `#b5694a`, neem green `#4f7a3a`,
auto-rickshaw yellow `#f2c230` + black, APSRTC red `#b22b2b`, Irani-cafe teal `#2a8c82`,
whitewash `#efe9dc`, painted-signboard primaries. Night: sodium-vapour orange street lights.
UI: hand-painted tin signboards + VHS on-screen-display. Avoid generic "pixel-font arcade".
