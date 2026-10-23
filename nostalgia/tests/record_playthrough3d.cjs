/* NOSTALGIA — tests/record_playthrough3d.cjs  (gameplay video recorder, 3D third person, frame-perfect)
 * The whole main story (title → 2026 prologue → Track 01 … Track 10 → Diwali week → interlude → Track 11 → Track 12
 * Chand Raat → ending → 2026 epilogue → credits) played in the 3D third-person view (N.view 'tps', the chase camera
 * behind Chinnu) by the autopilot of tests/record_playthrough.cjs, adapted to 3D: on foot it steers like a gamepad
 * stick (N.input.setMove, the game's analog input path, recomputed every tick against the camera yaw: up = forward)
 * while the camera yaw is eased towards a point ~38 u ahead on the route (no jerky spins); real keys for the rest
 * (Shift = RUN, E, arrows + E in menus / dialogue choices, tank steering on cycles under the game's own chase camera).
 * A few first-person moments (a cycle ride, Charminar). Overlay minigames / cutscene cards / dialogue play as they are.
 *
 * FRAME-PERFECT CAPTURE ON A SOFTWARE RENDERER. The page runs on a virtual clock (installVirtualClock, injected before
 * any game script): requestAnimationFrame, performance.now, Date / Date.now, setTimeout / setInterval,
 * requestIdleCallback and the page's CSS / Web Animations all follow it, so the game only moves when the recorder
 * steps it. One output frame = one tick of 1/30 s (main.js then simulates 2 sub-steps of 1/60 s: the game runs at
 * exactly 1x however long the frame takes to render), then CDP Page.captureScreenshot (the whole page: the WebGL view
 * AND the DOM HUD / dialogue / cards) goes to ffmpeg as frame N of a 30 fps stream. Speed-ups happen at capture time:
 * travel 3x → 4x, waits 2x → 3x, rides 1.5x, long minigames 1.5x: a frame then advances 2-4 ticks and only the last
 * one draws the 3D scene (the others skip renderer.render). Dead time (boot, 3D loading, stuck spots) is not captured
 * at all ('skip'); a jump in the picture that follows is covered by a 0.8 s "▶▶ F.FWD" card in the edit.
 * GPU: there is none here. SwiftShader took 3.2 s per 3D frame, so the browser runs HEADED under Xvfb (started by this
 * script) with ANGLE on desktop GL = Mesa llvmpipe (~0.34 s per 1280x720 frame). REC_GL=swiftshader falls back.
 * Picture: 1280x720 (SCALE=0.75: 960x540 with the same 1280x720 CSS layout). Graphics = the Ultra tier's look (its
 * post-processing: ambient occlusion, bloom, the film grade, FXAA, the richer sky) at render scale 1 with High's 2048
 * shadow map, distances and point lights and no MSAA (MSAA cost +70% on llvmpipe; FXAA smooths the edges);
 * REC_GFX=high = the High tier. Adaptive quality off; the Blender models (N.models3d) and the lazy landmark GLBs
 * loaded (the page is served over a local HTTP server, not file://). Frames under a full-screen opaque overlay (the
 * 2026 art, the credits, the dictionary) skip the 3D draw. The camera in dialogue: over Chinnu's shoulder towards a
 * speaker standing near (eased), else away from a wall it faces.
 * No #debug overlay; src/testing.js's unlimited money is switched off before boot (no "Testing build" toast).
 *
 * Sessions as before (each ends on a game save; a crash or container restart loses at most one session; progress in
 * REC_PROGRESS). Each session starts from the 2D film's save after the previous session (video/saves, REC_SAVES), so
 * the sessions are independent; this run's own saves go to video3d/saves.
 *
 *   node tests/record_playthrough3d.cjs                 record every session not yet done, then edit everything
 *   STAGE=record|edit|full|highlights|frames|qa|all      one stage only (default all)
 *   SESSIONS=s03,s04 / FROM=s05 / TO=s10                 sessions to record (listed explicitly = re-record)
 *   CHAPTERS=03_first_day_first_show                     chapters to (re-)edit
 *   REC_PROGRESS=/path/progress.json  REC_OUT=/path/video3d  REC_SAVES=/path/saves  REC_GL=llvmpipe|swiftshader
 *   SCALE=1 (devicePixelRatio: 1 = 1280x720, 0.75 = 960x540)   REC_GFX=ultra|high   MAXOUT=<s> stop a session after <s> s of output
 * Outputs (git-ignored, video3d/): raw/<session>.mkv + .timeline.json + .log, saves/after_<session>.json,
 *   chapters/NN_name.mp4, nostalgia_3d_full_playthrough.mp4 (chapter markers), nostalgia_3d_highlights.mp4,
 *   frames/<chapter>_sheetNN.jpg (a frame every 20 s) + frames/<chapter>_qa.json (frozen runs, black frames).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const VIDEO = process.env.REC_OUT || path.join(ROOT, 'video3d');
const RAW = path.join(VIDEO, 'raw');
const SAVES = path.join(VIDEO, 'saves');
const SAVES_IN = process.env.REC_SAVES || path.join(ROOT, 'video', 'saves');
const CHAP = path.join(VIDEO, 'chapters');
const WORK = path.join(VIDEO, 'work');
const FRAMES = path.join(VIDEO, 'frames');
const PROGRESS = process.env.REC_PROGRESS || path.join(VIDEO, 'progress.json');
const FONTS = process.env.REC_FONTS || path.join(WORK, 'fonts');
const PORT = +(process.env.REC_PORT || 8790);
const URL = 'http://127.0.0.1:' + PORT + '/index.html';
const SAVE_KEY = 'nostalgia.save.v1';
const VERBOSE = !!process.env.VERBOSE;
const W = 1280, H = 720;                       // CSS layout
const SCALE = +(process.env.SCALE || 1);       // devicePixelRatio (1 = 1280x720 frames, 0.75 = 960x540)
const OW = Math.round(W * SCALE), OH = Math.round(H * SCALE); // output frames
const FPS = 30, FRAME = 1000 / FPS;
const GL = process.env.REC_GL || 'llvmpipe';
// Graphics: the Ultra tier (its post-processing: ambient occlusion, bloom, the film grade, FXAA, the richer sky) at
// render scale 1 with High's shadow map / distances / point lights (Ultra's 4096 shadow map and 1700 u draw distance
// cost 15-25% more on llvmpipe for little on screen); no MSAA (FXAA does it; MSAA cost +70% here). REC_GFX=high: High.
const GFXQ = (process.env.REC_GFX || 'ultra') === 'high'
  ? { tier: 'high', q: { adaptive: false } }
  : { tier: 'ultra', q: { antialias: false, adaptive: false, shadowSize: 2048, shadowRange: 200, pointLights: 4, drawDist: 1500, lmDist: 1650, aniso: 8 } };
for (const d of [VIDEO, RAW, SAVES, CHAP, WORK, FRAMES]) fs.mkdirSync(d, { recursive: true });
fs.mkdirSync(path.dirname(PROGRESS), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
let logFile = null;
function log(s) {
  const line = '[' + ((Date.now() - T0) / 1000).toFixed(0).padStart(5) + 's] ' + s;
  console.log(line);
  if (logFile) { try { fs.appendFileSync(logFile, line + '\n'); } catch (e) { /* ignore */ } }
}
function readJSON(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } }
function writeJSON(f, o) { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(o, null, 1)); fs.renameSync(t, f); }
const progress = readJSON(PROGRESS, { sessions: {}, chapters: {} });
progress.sessions = progress.sessions || {}; progress.chapters = progress.chapters || {};
const dirty = { sessions: new Set(), chapters: new Set() };
const setProgress = (kind, id, v) => { progress[kind][id] = v; dirty[kind].add(id); saveProgress(); };
function saveProgress() {
  const cur = readJSON(PROGRESS, { sessions: {}, chapters: {} });
  for (const kind of ['sessions', 'chapters']) {
    cur[kind] = cur[kind] || {};
    for (const id of dirty[kind]) cur[kind][id] = progress[kind][id];
    for (const id in cur[kind]) if (!dirty[kind].has(id)) progress[kind][id] = cur[kind][id];
  }
  writeJSON(PROGRESS, cur);
}

/* ============================================================================ chapters */
const CHAPTERS = [
  { id: '00_prologue', top: 'SIDE B · 2026', title: 'Prologue: The Courier', sub: 'Wed 14 Jan 2026 · a box from New Jersey' },
  { id: '01_bo_kaata', top: 'TRACK 01', title: 'Bo Kaata!', sub: 'Terrace, Sankranti · Tue 14 Jan 2003' },
  { id: '02_lost_and_found', top: 'TRACK 02', title: 'Lost and Found', sub: 'Numaish · Sat 25 Jan 2003' },
  { id: '03_first_day_first_show', top: 'TRACK 03', title: 'First Day, First Show', sub: 'Sandhya · Sat 8 Feb 2003' },
  { id: '04_last_man_batting', top: 'TRACK 04', title: 'Last Man Batting', sub: 'Howzaat! · Public Gardens · Sun 23 Mar 2003' },
  { id: '05_right_right', top: 'TRACK 05', title: 'Right, Right!', sub: 'Imlibun · Tue 1 Apr 2003' },
  { id: '06_ammammas_thursday', top: 'TRACK 06', title: "Ammamma's Thursday", sub: 'Thump-thump · Hanuman Pindi Girni · Thu 15 May 2003' },
  { id: '07_the_clap', top: 'TRACK 07', title: 'The Clap', sub: 'Golconda heard us · Fateh Darwaza · Sat 7 Jun 2003' },
  { id: '08_drums_for_amma', top: 'TRACK 08', title: 'Drums for Amma', sub: 'Lashkar Bonalu · Sun 20 Jul 2003' },
  { id: '09_opening_day', top: 'TRACK 09', title: 'Opening Day', sub: 'Prasads · Fri 25 Jul 2003' },
  { id: '10_agle_baras', top: 'TRACK 10', title: 'Agle Baras Jaldi Aana', sub: 'Tank Bund · Tue 9 Sep 2003' },
  { id: '11_diwali_week', top: 'DIWALI WEEK', title: 'Mithai Run · Deepon ki Raat', sub: 'Deepavali · Sat 25 Oct 2003' },
  { id: '12_interlude', top: 'INTERLUDE', title: 'The Tickets', sub: 'Side A ■ PAUSED 812 · Sat 1 Nov 2003' },
  { id: '13_last_bell', top: 'TRACK 11', title: 'Last Bell', sub: 'No bells · Naubat Pahad · Fri 21 Nov 2003' },
  { id: '14_chand_raat', top: 'TRACK 12', title: 'Chand Raat', sub: 'Charminar · Tue 25 Nov 2003' },
  { id: '15_ending', top: 'ENDING', title: 'Eid Mubarak', sub: 'Eid morning · Charminar · 26-27 Nov 2003' },
  { id: '16_epilogue', top: 'SIDE B · 2026', title: 'Epilogue: 1-4-0-1', sub: 'Sat 17 Jan 2026' },
  { id: '17_credits', top: 'THE END', title: 'Credits', sub: 'Nostalgia · Side A · Side B' },
];
const CH = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));

/* ============================================================================ the virtual clock (page side) */
/* Installed before any game script. VC.tick(ms) advances the clock by ms: due timers, idle callbacks, the
 * requestAnimationFrame callbacks (timestamp = the exact virtual frame time: main.js's dt is exactly ms), then every
 * CSS / Web Animation is paused and set to the virtual time (finished ones are finish()ed: animationend still fires).
 * performance.now / Date read the virtual clock: a tick starts at its exact time, inside a tick the clock creeps on at
 * 0.2x real time (frame-budget loops still end; it never reaches the next tick), between ticks it barely moves.
 * VC.freeRun(true) lets it run in real time for synchronous settle loops. VC.skipDraw: renderer.render is skipped. */
function installVirtualClock() {
  if (window.__VC) return;
  const P = window.performance;
  const realNow = P.now.bind(P);
  const RealDate = Date;
  const realDateNow = RealDate.now.bind(RealDate);
  const rSetTimeout = window.setTimeout.bind(window);
  const t0 = realNow();
  const VC = (window.__VC = {
    exact: t0, base: t0, last: t0, realAt: t0, inTick: false, free: false, scale: 0.2,
    epoch: realDateNow() - t0, ticks: 0, timers: new Map(), seq: 1, rafs: new Map(), rafSeq: 1, idles: new Map(), idleSeq: 1,
    errors: [], anims: new WeakMap(), animOn: true, fired: 0, skipDraw: false, hooks: [],
  });
  function vnow() {
    let v;
    if (VC.free) v = VC.base + (realNow() - VC.realAt);
    else if (VC.inTick) v = VC.base + (realNow() - VC.realAt) * VC.scale;
    else v = VC.last + 0.0001;
    if (v < VC.last) v = VC.last + 0.0001;
    VC.last = v;
    return v;
  }
  VC.now = vnow;
  P.now = function now() { return vnow(); };
  function VDate(...a) {
    if (!new.target) return new RealDate(VC.epoch + vnow()).toString();
    if (a.length === 0) return new RealDate(VC.epoch + vnow());
    return new RealDate(...a);
  }
  VDate.prototype = RealDate.prototype;
  VDate.now = () => Math.floor(VC.epoch + vnow());
  VDate.parse = RealDate.parse; VDate.UTC = RealDate.UTC;
  window.Date = VDate;
  function addTimer(fn, d, args, rep) {
    const id = VC.seq++;
    d = Math.max(0, +d || 0);
    VC.timers.set(id, { fn, due: vnow() + d, d, args, rep });
    return id;
  }
  window.setTimeout = function setTimeout(fn, d, ...args) { return addTimer(fn, d, args, false); };
  window.setInterval = function setInterval(fn, d, ...args) { return addTimer(fn, Math.max(4, +d || 0), args, true); };
  window.clearTimeout = window.clearInterval = function clearTimeout(id) { VC.timers.delete(id); };
  window.requestAnimationFrame = function requestAnimationFrame(fn) { const id = VC.rafSeq++; VC.rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = function cancelAnimationFrame(id) { VC.rafs.delete(id); };
  window.requestIdleCallback = function requestIdleCallback(fn, o) { const id = VC.idleSeq++; VC.idles.set(id, { fn, due: o && o.timeout ? vnow() + o.timeout : Infinity }); return id; };
  window.cancelIdleCallback = function cancelIdleCallback(id) { VC.idles.delete(id); };
  const report = (where, e) => { if (VC.errors.length < 50) VC.errors.push(where + ': ' + String((e && e.stack) || e).slice(0, 400)); rSetTimeout(() => { throw e; }, 0); };
  function runTimers(limit) {
    let n = 0;
    for (;;) {
      let best = null, bid = 0;
      for (const [id, t] of VC.timers) if (t.due <= VC.base && (!best || t.due < best.due || (t.due === best.due && id < bid))) { best = t; bid = id; }
      if (!best || n >= limit) break;
      n++;
      if (best.rep) best.due += best.d; else VC.timers.delete(bid);
      try { if (typeof best.fn === 'function') best.fn(...(best.args || [])); } catch (e) { report('timer', e); }
    }
    VC.fired += n;
    return n;
  }
  function runIdle(budgetMs) {
    if (!VC.idles.size) return;
    const tS = realNow();
    for (const [id, q] of Array.from(VC.idles)) {
      const timedOut = q.due <= VC.base;
      if (!timedOut && realNow() - tS > budgetMs) continue;
      VC.idles.delete(id);
      const st = realNow(), cap = Math.max(1, budgetMs - (st - tS));
      try { q.fn({ didTimeout: timedOut, timeRemaining: () => Math.max(0, cap - (realNow() - st)) }); } catch (e) { report('idle', e); }
    }
  }
  // (a CSS animation / transition touched by the API is no longer dropped by Blink when its CSS stops applying: it
  // would keep its fill. So: a newer animation of the same name / property on the same element cancels the older
  // one, a CSS animation whose name the element's style no longer lists is cancelled, a finished transition too.)
  const keyOf = (a) => {
    const ef = a.effect;
    if (!ef || !ef.target) return null;
    const n = a.animationName ? 'A:' + a.animationName : a.transitionProperty ? 'T:' + a.transitionProperty : null;
    return n ? { t: ef.target, p: ef.pseudoElement || '', n } : null;
  };
  const kill = (a, st) => { try { a.cancel(); } catch (e) { /* ignore */ } st.dead = true; };
  function syncAnims() {
    if (!VC.animOn || !document.getAnimations) return;
    let list;
    try { list = document.getAnimations(); } catch (e) { return; }
    for (const a of list) {
      if (VC.anims.has(a)) continue;
      const k = keyOf(a);
      if (!k) continue;
      for (const b of list) {
        if (b === a || !VC.anims.has(b)) continue;
        const kb = keyOf(b);
        if (kb && kb.t === k.t && kb.p === k.p && kb.n === k.n) kill(b, VC.anims.get(b));
      }
    }
    for (const a of list) {
      let st = VC.anims.get(a);
      if (st == null) { st = { s: VC.exact, done: false, dead: false }; VC.anims.set(a, st); try { a.pause(); } catch (e) { /* ignore */ } }
      if (st.dead) continue;
      if (a.animationName && a.effect && a.effect.target) {
        let names = '';
        try { names = getComputedStyle(a.effect.target, a.effect.pseudoElement || null).animationName || ''; } catch (e) { /* ignore */ }
        if (names.split(',').map((s) => s.trim()).indexOf(a.animationName) < 0) { kill(a, st); continue; }
      }
      if (st.done) continue;
      const t = (VC.exact - st.s) * (a.playbackRate || 1);
      let end = Infinity;
      try { end = a.effect ? a.effect.getComputedTiming().endTime : Infinity; } catch (e) { /* ignore */ }
      try {
        if (a.playState !== 'paused' && a.playState !== 'finished') a.pause();
        if (isFinite(end) && t >= end) { st.done = true; a.finish(); if (a.transitionProperty) kill(a, st); } else a.currentTime = Math.max(0, t);
      } catch (e) { /* ignore */ }
    }
  }
  VC.tick = function (ms) {
    const r0 = realNow();
    VC.exact += ms;
    VC.base = Math.max(VC.exact, VC.last + 0.001);
    VC.realAt = realNow(); VC.inTick = true; VC.ticks++;
    let nt = 0, nr = 0;
    try {
      for (const h of VC.hooks) { try { h(ms); } catch (e) { report('hook', e); } }
      nt = runTimers(400);
      const cbs = Array.from(VC.rafs.values()); VC.rafs.clear(); nr = cbs.length;
      for (const fn of cbs) { try { fn(VC.exact); } catch (e) { report('raf', e); } }
      runIdle(6);
      syncAnims();
    } finally { VC.inTick = false; }
    return { timers: nt, rafs: nr, ms: realNow() - r0 };
  };
  VC.run = function (n, ms) { let w = 0; for (let i = 0; i < n; i++) w += VC.tick(ms).ms; return w; };
  VC.freeRun = function (on) {
    if (on) { VC.base = vnow(); VC.realAt = realNow(); VC.free = true; } else { vnow(); VC.free = false; }
  };
}

/* ============================================================================ the in-page helper */
function pageHelper() {
  if (window.__R) return;
  const R = (window.__R = { navS: { key: '', pts: null, i: 0, src: '' }, lines: [], passes: {}, fails: [], mgs: [], cam: { on: false, x: 0, y: 0, yaw: null, rate: 1.8, max: 1.7, ahead: 38 } });
  const VC = window.__VC;
  N.on('mission:pass', (d) => { const k = d && d.id; if (k) R.passes[k] = (R.passes[k] || 0) + 1; });
  N.on('mission:fail', (d) => { R.fails.push({ id: d && d.id, reason: d && d.reason, t: N.time.real }); });
  N.on('minigame:start', (d) => { R.mgs.push({ id: d && d.id, t: N.time.real }); });
  N.on('dialogue:line', (d) => { if (d && R.lines.length < 6000) R.lines.push([d.speaker, String(d.text || '').slice(0, 200)]); });
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const vis = (sel) => { const e = document.querySelector(sel); return !!(e && e.offsetParent !== null); };
  const txt = (sel) => { const e = document.querySelector(sel); return e && e.offsetParent !== null ? (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160) : ''; };
  /** the GL draw can be skipped (VC.skipDraw: the speed-up ticks between two captured frames, 'skip' time) */
  R.drawHook = function () {
    const E = N.view3d && N.view3d.engine;
    if (!E || !E.renderer || E.renderer.__rec) return !!(E && E.renderer);
    const r0 = E.renderer.render.bind(E.renderer);
    E.renderer.render = function (s, c) { if (VC.skipDraw) return undefined; return r0(s, c); };
    E.renderer.__rec = true; E.renderer.__r0 = r0;
    return true;
  };
  /** third person on foot: ease the camera yaw towards the route ahead (R.cam {x, y}): GTA-like, no spins */
  R.camHook = function (ms) {
    const C = R.cam;
    if (!N.view || N.view.mode !== 'tps') return;
    const p = N.player;
    // a story ride in an auto / a bus (he is hidden inside it; the game's camera would sit inside it): a tracking shot from
    // beside it, on the side with more room
    if (C.ride && p && p.hidden) {
      let v = null, bd = 12;
      for (const e of N.entities.query(p.x, p.y, 12)) if (e.kind === 'vehicle' && e.alive !== false && e.T && (e.T.w || 0) > 12) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; v = e; } }
      if (!v) return;
      if (C.rideV !== v) { C.rideV = v; const f = R.freeFn(p); C.rideSide = f(v.angle + Math.PI / 2, 40) >= f(v.angle - Math.PI / 2, 40) ? -1 : 1; }
      const want = v.angle + C.rideSide * 1.25, dt = ms / 1000;
      let st = wrapA(want - N.view.yaw) * (1 - Math.exp(-dt * 2.2));
      const mx = 1.4 * dt; if (st > mx) st = mx; if (st < -mx) st = -mx;
      N.view.yaw = wrapA(N.view.yaw + st);
      return;
    }
    if (!C.on) return;
    // (on a vehicle only a fixed yaw, and only while it stands: moving, the game's chase camera owns the yaw)
    if (!p || p.hidden || (p.vehicle && (C.yaw == null || Math.abs(p.vehicle.speed || 0) > 3))) return;
    let want;
    if (C.yaw != null) { if (N.state.mode !== 'play' && N.state.mode !== 'dialogue') return; want = C.yaw; }
    else {
      if (N.state.mode !== 'play') return;
      const dx = C.x - p.x, dy = C.y - p.y;
      if (dx * dx + dy * dy < 14 * 14) return;
      want = Math.atan2(dy, dx);
    }
    const dt = ms / 1000, d = wrapA(want - N.view.yaw);
    let s = d * (1 - Math.exp(-dt * C.rate));
    const mx = C.max * dt; if (s > mx) s = mx; if (s < -mx) s = -mx;
    N.view.yaw = wrapA(N.view.yaw + s);
  };
  VC.hooks.push(R.camHook);
  /** on foot the autopilot steers like a gamepad stick: R.move = {a} (a world direction) is turned into the
   *  screen-relative stick vector against the camera yaw of THIS tick (the yaw eases between captured frames) */
  R.move = null;
  R.moveHook = function () {
    const m = R.move, p = N.player;
    if (!m || !N.input || !N.input.setMove) return;
    if (!p || p.vehicle || N.state.mode !== 'play') { N.input.setMove(null); return; }
    const top = !N.view || N.view.mode === 'top', rel = m.a - (top ? 0 : N.view.yaw);
    if (top) N.input.setMove(Math.cos(m.a) * (m.k || 1), Math.sin(m.a) * (m.k || 1), true);
    else N.input.setMove(Math.sin(rel) * (m.k || 1), -Math.cos(rel) * (m.k || 1), true);
  };
  VC.hooks.push(R.moveHook);
  R.setMoveDir = function (a, k) { if (a == null) { R.move = null; if (N.input.setMove) N.input.setMove(null); } else { R.move = { a, k: k || 1 }; R.moveHook(); } };
  /** free distance from the player along world angle a: up to the first tall static solid (above his roof on a terrace),
   *  festival stall / parked-bus cell (SOLID) or, at street level, unwalkable ground (a proxy for the game's camera
   *  collision, which pulls the camera in front of them) */
  R.freeFn = function (p) {
    const V3 = N.view3d, W = N.world, top = (V3.elevation ? V3.elevation(p) : 0) + 12, SOLID = N.SURF ? N.SURF.SOLID : -1;
    const ground = !p.level;
    return (a, max) => {
      const c = Math.cos(a), s = Math.sin(a);
      let d = 0;
      for (; d < max; d += 3) {
        const x = p.x + c * d, y = p.y + s * d;
        if (V3.heightAt(x, y) > top) break;
        if (d > 4 && ground && W && W.surfaceAt && (W.surfaceAt(x, y) === SOLID || (W.isWalkable && !W.isWalkable(x, y) && !(W.isWater && W.isWater(x, y))))) break;
      }
      return d;
    };
  };
  /** the camera's real distance from the player's head now (after the game's collision pull-in) */
  R.camDist = function () { const E = N.view3d.engine, p = N.player; if (!E || !E.camera || !p) return 0; const c = E.camera.position; const h = N.view3d.elevation ? N.view3d.elevation(p.vehicle ? p : p) : 0; return Math.hypot(c.x - p.x, c.z - p.y, c.y - (h + 7.5)); };
  /** a dialogue with someone standing near: the camera over Chinnu's shoulder looking at the speaker, on the side with
   *  room behind it -> {yaw, d, npc} | null (no such speaker near: keep the camera) */
  R.frameTalk = function (spk) {
    const p = N.player, V3 = N.view3d;
    if (!p || p.hidden || (p.vehicle && Math.abs(p.vehicle.speed || 0) > 3) || !N.view || N.view.mode !== 'tps' || !V3 || !V3.heightAt) return null;
    if (!spk || /^(chinnu|you|srikanth|narrator|immu_tape)$/.test(spk)) return null;
    let e = null, bd = 120;
    for (const q of N.entities.query(p.x, p.y, 120)) {
      if (q === p || q === p.vehicle || q.alive === false) continue;
      if (q.npcId === spk || q.speaker === spk || q.who === spk || q.id === spk) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; e = q; } }
    }
    if (!e || bd < 4) return null;
    const free = R.freeFn(p);
    const a0 = Math.atan2(e.y - p.y, e.x - p.x);
    let best = null, bs = -1e9;
    for (const off of [0.34, -0.34, 0.58, -0.58, 0.16, -0.16, 0.85, -0.85]) {
      const a = a0 + off;
      const sc = Math.min(free(a + Math.PI, 36), 34) * 3 - Math.abs(wrapA(a - N.view.yaw)) * 6 - Math.abs(off) * 10;
      if (sc > bs) { bs = sc; best = a; }
    }
    return { yaw: wrapA(best), d: Math.round(bd), npc: e.npcId || e.id || null };
  };
  /** the most open camera yaw around the player (a view ahead, room behind for the camera): -> {yaw, ahead, cur} */
  R.openYaw = function () {
    const p = N.player, V3 = N.view3d;
    if (!p || !V3 || !V3.heightAt) return null;
    const free = R.freeFn(p);
    let best = null, bs = -1;
    const cur = N.view.yaw;
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      const sc = Math.min(free(a, 160), 160) + 3 * Math.min(free(a + Math.PI, 36), 34) - Math.abs(wrapA(a - cur)) * 6;
      if (sc > bs) { bs = sc; best = a; }
    }
    return { yaw: best, ahead: free(cur, 160), behind: free(cur + Math.PI, 36), cur };
  };
  /** a full-screen opaque overlay hides the 3D view (the 2026 art, credits, the dictionary): no need to draw it */
  R.covered = function () {
    const vw = window.innerWidth, vh = window.innerHeight;
    const full = (e) => { const r = e.getBoundingClientRect(); return r.left <= 1 && r.top <= 1 && r.right >= vw - 1 && r.bottom >= vh - 1; };
    const shown = (e) => { for (let x = e; x && x !== document.documentElement; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.999) return false; } return true; };
    for (const sel of ['.mn-cs.show canvas.st-art.on', '#overlay .mn-credits.show', '#overlay .mn-defs.show']) {
      const e = document.querySelector(sel);
      if (e && full(e) && shown(e)) return true;
    }
    return false;
  };
  /** n ticks of ms each; only the last draws (draw = false: none); -> the probe when asked */
  R.step = function (n, ms, draw, probe) {
    const E = N.view3d && N.view3d.engine;
    R.drawHook();
    for (let i = 0; i < n; i++) { VC.skipDraw = !(draw && i === n - 1) || (draw && !!R.cov); VC.tick(ms); }
    if (draw) {
      const was = !!R.cov;
      R.cov = false;
      try { R.cov = R.covered(); } catch (e) { R.cov = false; }
      // the overlay went away during this tick (its draw was skipped): draw the scene as this tick left it
      if (was && !R.cov && E && E.ready && N.view3d.active && E.renderer && E.renderer.__r0) { try { E.renderer.__r0(E.scene, E.camera); } catch (e) { /* ignore */ } }
      R.covN = (R.covN || 0) + (R.cov ? 1 : 0);
    }
    VC.skipDraw = false;
    return probe ? R.probe() : null;
  };
  R.target = function () {
    const a = N.missions && N.missions.active;
    let t = null, src = '';
    const s2 = N.story2 && N.story2.probe ? N.story2.probe() : null;
    const s2own = !!(s2 && (s2.scene || (a && N.story2.MISSIONS.concat(N.story2.SIDE).indexOf(a.id) >= 0)));
    if (s2own && s2.target) { t = s2.target; src = 's2'; }
    if (!t && a && N.dwMissions && N.dwMissions.IDS.indexOf(a.id) >= 0) {
      const d = N.dwMissions.debug.state();
      const q = (d.acts || []).find((x) => isFinite(x.x));
      if (q) { t = { x: q.x, y: q.y }; src = 'dw'; }
    }
    if (!t && a && N.story && N.story.debug) { try { const q = N.story.debug.target(); if (q) { t = q; src = 's1'; } } catch (e) { /* ignore */ } }
    if (!t && s2 && s2.target) { t = s2.target; src = 's2'; }
    return t ? { x: t.x, y: t.y, h: t.h || 0, src } : null;
  };
  R.probe = function () {
    const p = N.player, a = N.missions.active, v = p.vehicle;
    const cur = N.dialogue && N.dialogue.current;
    const s1 = N.story && N.story.debug ? N.story.debug.state() : null;
    const s2 = N.story2 && N.story2.probe ? N.story2.probe() : null;
    const dw = N.dwMissions && N.dwMissions.debug ? N.dwMissions.debug.state() : null;
    const dws = N.dwMissions && N.dwMissions.story ? N.dwMissions.story.state() : null;
    const tg = R.target();
    return {
      mode: N.state.mode, mission: a ? a.id : null, attempt: a ? a.attempt : 0, ff: !!(a && a.ff), scene: N.story2 ? N.story2.scene : null,
      obj: N.hud.objectiveText || '', date: N.calendar ? N.calendar.label() + ' ' + N.clock.label() : '',
      p: { x: Math.round(p.x), y: Math.round(p.y), lvl: p.level || null, veh: v ? v.type : null, vcls: v && v.T ? v.T.cls : null, pass: !!(v && v.passenger === p), ang: v ? v.angle : p.angle, spd: v ? Math.abs(v.speed || 0) : Math.hypot(p.vx || 0, p.vy || 0), e: Math.round(p.energy || 0), locked: !!p.controlsLocked, hidden: !!p.hidden },
      act: N.input.actionLabel || '',
      storyAct: (() => { const c = N.interact.current; if (!c) return false; if (c.id) return /^(st:|dwm:|s2:)/.test(c.id); return (c.priority || 0) >= 7; })(),
      deck: !!(N.walkman && N.walkman.deck && N.walkman.deck.isOpen),
      ptCard: vis('.pt-card'),
      dlgOpen: !!(N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()),
      dlg: cur ? { s: cur.speaker || null, t: String(cur.text || ''), typing: !!cur.typing, ch: cur.choices ? cur.choices.slice() : null, sel: cur.selected } : null,
      cut: !!(N.menus && N.menus.inCutscene), csPrompt: vis('.mn-cs .cs-card.k-prompt'), csText: txt('.mn-cs'),
      jc: vis('.hud-jcard.show'), jcText: txt('.hud-jcard.show'), prompt: N.missions.prompt, ask: !!N.missions.askOpen || vis('.hud-ask.show'),
      lf: N.missions.lastFailed && N.missions.lastFailed.id,
      rec: N.tape && N.tape.recState ? N.tape.recState.phase : null,
      mg: N.minigames ? N.minigames.active || null : null, mgResult: vis('.mg-card-result'), covering: !!(N.minigames && N.minigames.covering),
      shop: !!(N.shops && N.shops.isOpen && N.shops.isOpen()), journal: N.state.mode === 'journal',
      defs: vis('.mn-defs.show'), credits: vis('.mn-credits.show'), menuTop: N.menus.debugState().top,
      panel: s2 ? s2.panel : null, gallery: s2 ? s2.gallery : null, chase: s2 ? s2.chase : false, lock: s2 ? s2.lock : null, offer: s2 ? s2.offer : null,
      s1: s1 ? { step: s1.step, queue: s1.queue, ride: s1.ride, cargo: s1.cargo, tag: s1.tag } : null,
      dw: dw ? { step: dw.step, panel: dw.panel, terrace: dw.terrace ? { lit: dw.terrace.lit, n: dw.terrace.n } : null, card: dw.card || null } : null,
      dws: dws ? { week: dws.week, card: dws.card ? { x: dws.card.x, y: dws.card.y, kind: dws.card.kind } : null, left: dws.left } : null,
      tgt: tg, wanted: N.wanted ? N.wanted.level | 0 : 0, real: N.time.real, fps: N.perf ? N.perf.fps : 0,
      busy: !!(N.calendar && N.calendar.jumping),
      view: N.view ? N.view.mode : null, yaw: N.view ? +N.view.yaw.toFixed(3) : 0,
    };
  };
  R.feed = function () {
    const pl = N.player;
    if (pl && pl.tummy != null && pl.tummy < 55) { try { if (pl.feed) pl.feed(60, { quiet: true }); else pl.tummy = 80; } catch (e) { pl.tummy = 80; } }
    if (pl && pl.energy < 45 && !(N.story2 && N.story2.state().epilogue)) pl.energy = 85;
  };
  /** Where to steer toward (tx, ty): the minimap's pink route when it leads there, else N.npcs.planPath. Also sets
   *  the camera's look-ahead point (~70 u along the way) unless o.cam === false. */
  R.nav = function (tx, ty, o) {
    o = o || {};
    const S = R.navS, p = N.player, v = p.vehicle || p;
    const d = Math.hypot(tx - v.x, ty - v.y);
    const key = Math.round(tx / 12) + ',' + Math.round(ty / 12);
    let aim = { x: tx, y: ty }, src = 'direct';
    if (o.replan) S.forcePlan = true;
    const rt = N.hud.route ? N.hud.route() : null;
    let hudOk = rt && rt.length > 2 && Math.hypot(rt[rt.length - 1][0] - tx, rt[rt.length - 1][1] - ty) < 30;
    if (hudOk && d < 2000) {
      let L = 0; for (let k = 0; k < rt.length - 1; k++) L += Math.hypot(rt[k + 1][0] - rt[k][0], rt[k + 1][1] - rt[k][1]);
      if (L > Math.max(2.5 * d, d + 700)) hudOk = false;
    }
    let pathPts = null, pathI = 0;
    if (o.direct || d < 30) { S.key = ''; }
    else if (p.level) {
      if (S.key !== key || o.replan || !S.pts) {
        let pts = null;
        try { pts = N.world.roofs.withRoof(() => N.npcs.planPath(v.x, v.y, tx, ty)); } catch (e) { pts = null; }
        S.pts = pts && pts.length ? pts.map((q) => [q.x, q.y]) : [[tx, ty]];
        if (Math.hypot(S.pts[S.pts.length - 1][0] - tx, S.pts[S.pts.length - 1][1] - ty) > 4) S.pts.push([tx, ty]);
        S.i = 0; S.key = key;
      }
      while (S.i < S.pts.length - 1 && Math.hypot(S.pts[S.i][0] - v.x, S.pts[S.i][1] - v.y) < 6) S.i++;
      aim = { x: S.pts[S.i][0], y: S.pts[S.i][1] }; src = 'roof'; pathPts = S.pts; pathI = S.i;
    }
    else if (hudOk && d > 380 && !o.plan && !S.forcePlan) {
      let k = 1; while (k < rt.length - 1 && Math.hypot(rt[k][0] - v.x, rt[k][1] - v.y) < 30) k++;
      aim = { x: rt[k][0], y: rt[k][1] }; src = 'hud'; S.key = ''; pathPts = rt; pathI = k;
    } else {
      // long trips with no pink route follow the road graph (streets, like the minimap's route; in 3D the walk-grid
      // planner's short cuts through alleys and compounds end against walls), the last ~300 u the planner
      if (S.autoRoad && d < 300 && !o.replan) { S.autoRoad = false; S.road = false; S.key = ''; }
      if (S.key !== key && !o.replan && !S.forcePlan && !o.plan && d > 380 && !S.around) { S.road = true; S.autoRoad = true; }
      if (S.key !== key || o.replan || !S.pts) {
        let pts = null;
        if (o.replan) { S.road = !!o.road; S.around = !!o.around; S.autoRoad = false; }
        if (S.road) {
          S.road = true;
          try {
            const RR = N.world.roads, a = RR.nearestNode(v.x, v.y), b = RR.nearestNode(tx, ty);
            const path = a && b ? RR.route(a, b, { walk: !p.vehicle, paths: !p.vehicle, costs: { path: 1.15 }, maxExpand: 60000 }) : null;
            if (path && path.length) pts = path.map((nd) => ({ x: nd.x, y: nd.y }));
          } catch (e) { pts = null; }
        }
        if (!pts && (o.around || S.around)) {
          S.around = true;
          try { const q = R.planAround(tx, ty, o.margin); if (q && q.length) pts = q.map((c) => ({ x: c[0], y: c[1] })); } catch (e) { pts = null; }
        }
        if (!pts) try { pts = N.npcs && N.npcs.planPath ? N.npcs.planPath(v.x, v.y, tx, ty) : null; } catch (e) { pts = null; }
        S.pts = pts && pts.length ? pts.map((q) => [q.x, q.y]) : [[tx, ty]];
        if (Math.hypot(S.pts[S.pts.length - 1][0] - tx, S.pts[S.pts.length - 1][1] - ty) > 4) S.pts.push([tx, ty]);
        S.i = 0; S.key = key; S.forcePlan = !!o.replan || S.forcePlan;
      }
      const near = p.vehicle ? 22 : 9;
      while (S.i < S.pts.length - 1 && Math.hypot(S.pts[S.i][0] - v.x, S.pts[S.i][1] - v.y) < near) S.i++;
      aim = { x: S.pts[S.i][0], y: S.pts[S.i][1] }; src = 'plan'; pathPts = S.pts; pathI = S.i;
    }
    // the camera's look-ahead: ~LA u along the way (the route's corners are cut smoothly, not anticipated far)
    let fx = aim.x, fy = aim.y;
    const LA = R.cam.ahead || 38;
    if (pathPts) {
      let acc = Math.hypot(aim.x - v.x, aim.y - v.y), px = aim.x, py = aim.y;
      for (let k = pathI + 1; k < pathPts.length && acc < LA; k++) {
        const L = Math.hypot(pathPts[k][0] - px, pathPts[k][1] - py);
        if (acc + L >= LA) { const f = (LA - acc) / L; fx = px + (pathPts[k][0] - px) * f; fy = py + (pathPts[k][1] - py) * f; acc = LA; break; }
        acc += L; px = pathPts[k][0]; py = pathPts[k][1]; fx = px; fy = py;
      }
    }
    if (o.cam !== false) { R.cam.on = true; R.cam.yaw = null; R.cam.x = fx; R.cam.y = fy; }
    const calm = /sneak|walk|don.t run|quiet|slow|careful|carry|spill|tiptoe/i.test(N.hud.objectiveText || '') || N.flags.year === 2026 || !!p.noRun;
    let cargo = /tomato|bruise|parcel|flour|atta|spill|carry|cargo|careful|box|cake|egg/i.test(N.hud.objectiveText || '');
    try { if (N.story && N.story.debug && N.story.debug.state().cargo != null) cargo = true; } catch (e) { /* ignore */ }
    let rem = d;
    if (src === 'plan' || src === 'roof') { rem = Math.hypot(aim.x - v.x, aim.y - v.y); for (let k = S.i; k < S.pts.length - 1; k++) rem += Math.hypot(S.pts[k + 1][0] - S.pts[k][0], S.pts[k + 1][1] - S.pts[k][1]); }
    else if (src === 'hud' && rt) { let k = 1; while (k < rt.length - 1 && Math.hypot(rt[k][0] - v.x, rt[k][1] - v.y) < 30) k++; rem = Math.hypot(rt[k][0] - v.x, rt[k][1] - v.y); for (; k < rt.length - 1; k++) rem += Math.hypot(rt[k + 1][0] - rt[k][0], rt[k + 1][1] - rt[k][1]); }
    return { x: v.x, y: v.y, d, rem, ax: aim.x, ay: aim.y, da: Math.hypot(aim.x - v.x, aim.y - v.y), src, calm, cargo, mode: N.state.mode, veh: p.vehicle ? (p.vehicle.T && p.vehicle.T.cls) || p.vehicle.type : null, pass: !!(p.vehicle && p.vehicle.passenger === p), ang: v.angle || 0, spd: p.vehicle ? (p.vehicle.speed || 0) : Math.hypot(p.vx || 0, p.vy || 0), lvl: p.level || null, e: p.energy, dlg: !!(N.dialogue.isOpen && N.dialogue.isOpen()), obj: N.hud.objectiveText || '', locked: !!p.controlsLocked, act: N.input.actionLabel || '', prompt: N.missions.prompt, active: N.missions.active ? N.missions.active.id : null, cut: !!(N.menus && N.menus.inCutscene), yaw: N.view ? N.view.yaw : 0, view: N.view ? N.view.mode : 'top' };
  };
  R.planAround = function (tx, ty, margin) {
    const p = N.player, v = p.vehicle || p, W = N.world, CS = 6, M = margin || 220;
    const bx0 = Math.min(v.x, tx) - M, by0 = Math.min(v.y, ty) - M, bx1 = Math.max(v.x, tx) + M, by1 = Math.max(v.y, ty) + M;
    const w = Math.ceil((bx1 - bx0) / CS), h = Math.ceil((by1 - by0) / CS), n = w * h;
    if (n > 400000) return null;
    const ok = p.vehicle ? (x, y) => W.isDrivable(x, y) : (x, y) => W.isWalkable(x, y);
    const blocked = new Uint8Array(n);
    const discs = [];
    const cx = (v.x + tx) / 2, cy = (v.y + ty) / 2, rr = Math.hypot(tx - v.x, ty - v.y) / 2 + M;
    for (const e of N.entities.query(cx, cy, rr)) {
      if (e === p || e === p.vehicle || !e.alive) continue;
      if (e.kind === 'vehicle') { if (Math.abs(e.speed || 0) > 12) continue; const L = e.T ? Math.max(e.T.w || 0, 16) : 20; discs.push([e.x, e.y, L / 2 + (p.vehicle ? 10 : 5)]); }
      else if ((e.kind === 'ped' || e.kind === 'npc' || e.kind === 'animal') && Math.hypot(e.vx || 0, e.vy || 0) < 8) discs.push([e.x, e.y, (e.r || 4) + 4]);
    }
    const free = (i) => {
      let b = blocked[i];
      if (!b) {
        const x = bx0 + ((i % w) + 0.5) * CS, y = by0 + (Math.floor(i / w) + 0.5) * CS;
        b = ok(x, y) ? 1 : 2;
        if (b === 1) for (const d of discs) { const dx = x - d[0], dy = y - d[1]; if (dx * dx + dy * dy < d[2] * d[2]) { b = 2; break; } }
        blocked[i] = b;
      }
      return b === 1;
    };
    const idx = (x, y) => { const i = Math.floor((x - bx0) / CS), j = Math.floor((y - by0) / CS); return i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i; };
    let s0 = idx(v.x, v.y), g0 = idx(tx, ty);
    if (s0 < 0 || g0 < 0) return null;
    blocked[s0] = 1;
    if (!free(g0)) {
      let best = -1, bd = 1e9; const gi = g0 % w, gj = Math.floor(g0 / w);
      for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) { const i = gi + di, j = gj + dj; if (i < 0 || j < 0 || i >= w || j >= h) continue; const k = j * w + i; if (free(k) && di * di + dj * dj < bd) { bd = di * di + dj * dj; best = k; } }
      if (best < 0) return null; g0 = best;
    }
    const gs = new Float32Array(n).fill(Infinity), came = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const heap = []; const push = (k, f) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const q = (c - 1) >> 1; if (heap[q][0] <= heap[c][0]) break; [heap[q], heap[c]] = [heap[c], heap[q]]; c = q; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const gx = g0 % w, gy = Math.floor(g0 / w);
    const hh = (k) => { const dx = Math.abs((k % w) - gx), dy = Math.abs(Math.floor(k / w) - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    gs[s0] = 0; push(s0, hh(s0));
    let found = false, it = 0;
    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.length && it++ < 250000) {
      const [, k] = pop();
      if (closed[k]) continue; closed[k] = 1;
      if (k === g0) { found = true; break; }
      const i = k % w, j = Math.floor(k / w);
      for (const [di, dj, c] of NB) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const nk = nj * w + ni; if (closed[nk] || !free(nk)) continue;
        if (di && dj && (!free(j * w + ni) || !free(nj * w + i))) continue;
        const g = gs[k] + c; if (g < gs[nk]) { gs[nk] = g; came[nk] = k; push(nk, g + hh(nk)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let k = g0; k >= 0; k = came[k]) { cells.push(k); if (k === s0) break; }
    cells.reverse();
    const P = (k) => [bx0 + ((k % w) + 0.5) * CS, by0 + (Math.floor(k / w) + 0.5) * CS];
    const los = (a, b) => { const [x0, y0] = P(a), [x1, y1] = P(b); const L = Math.hypot(x1 - x0, y1 - y0), st = Math.max(1, Math.ceil(L / 3)); for (let q = 1; q < st; q++) { const k = idx(x0 + (x1 - x0) * q / st, y0 + (y1 - y0) * q / st); if (k < 0 || !free(k)) return false; } return true; };
    const out = []; let a = 0;
    while (a < cells.length - 1) { let b = Math.min(cells.length - 1, a + 40); while (b > a + 1 && !los(cells[a], cells[b])) b--; out.push(P(cells[b])); a = b; }
    out.push([tx, ty]);
    return out;
  };
  R.unplan = function () { R.navS.key = ''; R.navS.pts = null; R.navS.forcePlan = false; R.navS.road = false; R.navS.around = false; R.navS.autoRoad = false; };
  R.levelPlan = function (tx, ty, th) {
    const RF = N.world.roofs, p = N.player;
    if (!RF || !RF.at) return null;
    const at = RF.at(tx, ty);
    let goalRoof = at && at.roof ? at.roof.id || at.roof : null;
    if (!goalRoof && th > 0) {
      let best = null, bd = 40;
      for (const r of RF.list) { const [x, y, w, h] = r.rect; const dx = Math.max(x - tx, 0, tx - (x + w)), dy = Math.max(y - ty, 0, ty - (y + h)); const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = r.id; } }
      goalRoof = best;
    }
    const mine = p.level || null;
    if (mine && goalRoof) {
      const a = RF.get(mine), b = RF.get(goalRoof);
      if (mine === goalRoof || (a && b && a.group && a.group === b.group)) return null;
    }
    if (mine && (!goalRoof || goalRoof !== mine)) {
      const r = RF.get(mine);
      if (!r || !r.stairs || !r.stairs.length) return null;
      let s = r.stairs[0], bd = 1e9;
      for (const q of r.stairs) { const d = Math.hypot(q.tx - p.x, q.ty - p.y); if (d < bd) { bd = d; s = q; } }
      return { kind: 'down', x: s.tx, y: s.ty };
    }
    if (!mine && goalRoof) {
      const r = RF.get(goalRoof);
      if (!r || !r.stairs || !r.stairs.length) return null;
      let s = r.stairs[0], bd = 1e9;
      for (const q of r.stairs) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; s = q; } }
      return { kind: 'up', x: s.x, y: s.y, roof: goalRoof };
    }
    return null;
  };
  R.giver = function (id) {
    const d = N.missions.defs[id];
    if (!d) return null;
    const q = N.missions.giverPos(d);
    return q ? { id, x: q.x, y: q.y, r: (d.giver && d.giver.r) || 16, avail: N.missions.available().some((x) => x.id === id), marker: (N.missions.markers() || []).some((m) => m.kind === 'giver' && m.id === id) } : null;
  };
  R.bike = function () {
    const p = N.player, r = N.missions.active;
    if (p.vehicle || !r) return null;
    const v = (r.spawned || []).map((x) => x.e).find((e) => e && e.kind === 'vehicle' && e.alive && !e.noEnter && !e.locked && e.T && e.T.cls === 'bike');
    return v ? { x: Math.round(v.x), y: Math.round(v.y) } : null;
  };
  R.ready3d = function () {
    return !!(N.view && N.view.mode !== 'top' && N.view3d && N.view3d.ready && N.view3d.active && N.models3d && N.models3d.ready);
  };
}

/* ============================================================================ browser, server, Xvfb */
let browser = null, ctx = null, page = null, CDP = null, TL = null, XVFB = null, SERVER = null;
const pageErrors = [];
const ev = (fn, arg) => page.evaluate(fn, arg);
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
function startServer() {
  if (SERVER) return Promise.resolve(SERVER);
  const srv = http.createServer((req, res) => {
    let p = '/';
    try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { /* ignore */ }
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, path.normalize(p));
    if (!f.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=86400' });
      res.end(data);
    });
  });
  return new Promise((r, j) => { srv.on('error', j); srv.listen(PORT, '127.0.0.1', () => { SERVER = srv; r(srv); }); });
}
async function startXvfb() {
  if (GL === 'swiftshader' || XVFB) return;
  for (let n = 91; n < 120; n++) {
    if (fs.existsSync('/tmp/.X11-unix/X' + n) || fs.existsSync('/tmp/.X' + n + '-lock')) continue;
    const pr = cp.spawn('Xvfb', [':' + n, '-screen', '0', '1600x1000x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
    for (let k = 0; k < 50 && !fs.existsSync('/tmp/.X11-unix/X' + n); k++) await sleep(100);
    if (fs.existsSync('/tmp/.X11-unix/X' + n)) { XVFB = { proc: pr, display: ':' + n }; log('Xvfb on :' + n); return; }
    try { pr.kill(); } catch (e) { /* ignore */ }
  }
  throw new Error('could not start Xvfb');
}
function stopXvfb() { if (XVFB) { try { XVFB.proc.kill(); } catch (e) { /* ignore */ } XVFB = null; } }
process.on('exit', stopXvfb);

/* ============================================================================ capture: the clock, the classes, the frames */
// game time per output frame by activity class (speed-ups at capture time): [start, later, after s of game time]
const SPEED = { read: 1, cut: 1, act: 1, mg: [1, 1.5, 25], show3d: 1, fps: 1, credits: 1.25, ride: 1.5, wait: [2, 3, 8], travel: [3, 4, 12] };
const CAP = { k: 'skip', since: 0, outAt: 0, spd: 1, prevSpd: 1 };
const V = { game: 0, real0: 0 };        // game ms advanced this session, real ms at its start
let REC = null;
let OUTF = 0;                              // output frames this session
const vnow = () => V.game;                 // the recorder's clock = game time (ms)
const outT = () => OUTF / FPS;
function cls(k) {
  if (!TL || CAP.k === k) return;
  CAP.prevSpd = CAP.spd;
  CAP.k = k; CAP.since = V.game; CAP.outAt = OUTF;
  TL.cls.push({ f: OUTF, g: Math.round(V.game), k });
  if (VERBOSE) log('   cls ' + k + ' @' + outT().toFixed(1));
}
function mark(type, data) { if (!TL) return; const m = Object.assign({ f: OUTF, t: +outT().toFixed(2), g: Math.round(V.game), type }, data || {}); TL.marks.push(m); log('   mark ' + type + ' ' + JSON.stringify(data || {}) + ' @' + outT().toFixed(1)); }
/** the speed of the next output frame (game frames per output frame), eased in when a faster class starts */
function curSpeed() {
  const s = SPEED[CAP.k] == null ? 1 : SPEED[CAP.k];
  let tgt = Array.isArray(s) ? ((V.game - CAP.since) / 1000 > s[2] ? s[1] : s[0]) : s;
  if (CAP.k === 'travel' && TL && TL.fpsUntil > V.game) tgt = 1.5;
  // ease towards the target: up over ~0.5 s of output, down at once (the next scene plays at 1x from its first frame)
  if (tgt > CAP.spd) CAP.spd = Math.min(tgt, CAP.spd + Math.max(0.12, (tgt - 1) / 15));
  else CAP.spd = tgt;
  return CAP.spd;
}
class Recorder {
  constructor(file) {
    this.file = file; this.n = 0;
    this.proc = cp.spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
      '-vf', 'scale=' + OW + ':' + OH + ':flags=bicubic,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '15', '-threads', '2', '-g', String(FPS), '-r', String(FPS), file], { stdio: ['pipe', 'ignore', 'pipe'] });
    this.err = '';
    this.proc.stderr.on('data', (d) => { this.err += d; });
    this.done = new Promise((r) => this.proc.on('exit', r));
    this.proc.stdin.on('error', () => {});
  }
  write(buf) {
    this.n++;
    if (!this.proc.stdin.write(buf)) return new Promise((r) => this.proc.stdin.once('drain', r));
    return null;
  }
  async stop() { this.proc.stdin.end(); await this.done; if (this.err) log('recorder ffmpeg: ' + this.err.slice(-400)); return this.n; }
}
const PERF = { frames: 0, tickMs: 0, shotMs: 0, skipTicks: 0, t0: 0 };
/** One output frame (or, in 'skip', a few uncaptured ticks): advances the game; -> game ms advanced */
async function stepFrame(maxMs, probe) {
  if (CAP.k === 'skip' || !REC) {
    const n = Math.max(1, Math.min(15, Math.round((maxMs || FRAME) / FRAME)));
    // never run ahead of the wall clock while things load for real (script / GLB fetches race virtual timeouts)
    const ahead = (V.game + n * FRAME) - (Date.now() - V.real0);
    if (ahead > 0) await sleep(Math.min(ahead, 1000));
    const r = await ev(([n, ms, pr]) => window.__R.step(n, ms, false, pr), [n, FRAME, !!probe]);
    V.game += n * FRAME; PERF.skipTicks += n;
    return { ms: n * FRAME, probe: r };
  }
  const spd = curSpeed();
  const g = spd * FRAME, k = Math.max(1, Math.ceil(spd - 1e-6)), ms = g / k;
  const a = Date.now();
  const r = await ev(([k, ms, pr]) => window.__R.step(k, ms, true, pr), [k, ms, !!probe]);
  const b = Date.now();
  const shot = await CDP.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true });
  const c = Date.now();
  const w = REC.write(Buffer.from(shot.data, 'base64'));
  if (w) await w;
  OUTF++; V.game += g;
  PERF.frames++; PERF.tickMs += b - a; PERF.shotMs += c - b;
  if (PERF.frames % 900 === 0) log('   perf: ' + PERF.frames + ' frames, ' + ((PERF.tickMs + PERF.shotMs) / PERF.frames).toFixed(0) + ' ms/frame (tick ' + (PERF.tickMs / PERF.frames).toFixed(0) + ', shot ' + (PERF.shotMs / PERF.frames).toFixed(0) + '), output ' + outT().toFixed(0) + ' s');
  if (MAXOUT && outT() > MAXOUT) throw new Error('MAXOUT reached');
  return { ms: g, probe: r };
}
const MAXOUT = +(process.env.MAXOUT || 0);
/** let ms of game time pass (captured by the current class) */
async function wait(ms) {
  let left = ms;
  while (left > 0.5) { const r = await stepFrame(left); left -= r.ms; }
}
/** step until pred (an in-page function of arg) is true, at most ms of game time; -> true / false */
async function until(pred, ms, arg) {
  const t0 = vnow();
  for (;;) {
    if (await page.evaluate(pred, arg).catch(() => false)) return true;
    if (vnow() - t0 > ms) return false;
    await stepFrame(FRAME * 2);
  }
}
async function PROBE() { return ev(() => window.__R.probe()); }

/* ============================================================================ session open / close */
async function openSession(sess, saveRaw) {
  const { chromium } = require('/opt/node22/lib/node_modules/playwright');
  await startServer();
  await startXvfb();
  const args = GL === 'swiftshader'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    : ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--no-sandbox', '--window-size=1400,900', '--window-position=0,0'];
  args.push('--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows');
  const env = Object.assign({}, process.env, { DBUS_SESSION_BUS_ADDRESS: 'disabled:' });
  if (XVFB) env.DISPLAY = XVFB.display;
  browser = await chromium.launch({ headless: GL === 'swiftshader', args, env, timeout: 120000 });
  ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  await ctx.addInitScript(installVirtualClock);
  await ctx.addInitScript(({ raw, key, tier }) => {
    try {
      localStorage.setItem('nostalgia.testing.unlimitedMoney', '0');
      localStorage.setItem('nostalgia.view.v1', 'tps');
      localStorage.setItem('nostalgia.graphics', tier);
      localStorage.setItem('nostalgia.view3d.used', '1');
      if (raw) { localStorage.setItem(key, raw); localStorage.removeItem(key + '.bak'); }
      else { localStorage.removeItem(key); localStorage.removeItem(key + '.bak'); localStorage.removeItem(key + '.manual'); }
    } catch (e) { /* ignore */ }
  }, { raw: saveRaw || '', key: SAVE_KEY, tier: GFXQ.tier });
  // engine-creation quality, before the 3D engine exists (after view3d_post.js applied the tier's own values)
  await ctx.addInitScript((q) => {
    document.addEventListener('DOMContentLoaded', () => { try { Object.assign(N.view3d.quality, q); } catch (e) { /* ignore */ } });
  }, GFXQ.q);
  page = await ctx.newPage();
  CDP = await ctx.newCDPSession(page);
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { pageErrors.push('console.error: ' + m.text()); log('   console.error: ' + m.text().slice(0, 200)); } });
  page.on('pageerror', (e) => { pageErrors.push('pageerror: ' + (e.stack || e.message)); log('   pageerror: ' + (e.message || '').slice(0, 300)); });
  TL = { cls: [], marks: [], fpsUntil: 0 };
  CAP.k = 'skip'; CAP.spd = 1; OUTF = 0; V.game = 0; V.real0 = Date.now();
  Object.assign(PERF, { frames: 0, tickMs: 0, shotMs: 0, skipTicks: 0, t0: Date.now() });
  TL.cls.push({ f: 0, g: 0, k: 'skip' });
  await page.goto(URL);
  await page.waitForFunction(() => !!(window.__VC && window.N), null, { timeout: 60000 });
  await ev(() => { try { N.view.noPointerLock = true; N.view3d.setQuality({ adaptive: false }); } catch (e) { /* ignore */ } });
  // boot (virtual time paced to the wall clock: fonts / scripts load for real)
  const t0 = Date.now();
  for (;;) {
    const ok = await ev(() => { window.__VC.tick(1000 / 30); return !!(window.N && document.body.classList.contains('booted') && N.state.mode === 'title'); });
    V.game += FRAME;
    if (ok) break;
    if (Date.now() - t0 > 180000) throw new Error('boot timeout');
    const ahead = V.game - (Date.now() - V.real0); if (ahead > 0) await sleep(ahead);
  }
  await ev(pageHelper);
  await page.mouse.move(W - 4, H - 4);
  REC = new Recorder(path.join(RAW, sess.id + '.mkv'));
  log('booted in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}
async function closeSession() {
  const n = REC ? await REC.stop() : 0;
  REC = null;
  try { await ctx.close(); } catch (e) { log('ctx.close: ' + e.message); }
  try { await browser.close(); } catch (e) { /* ignore */ }
  browser = ctx = page = CDP = null;
  return n;
}
/** after CONTINUE / a new game: the 3D view up, the models and the near city built, quality pinned */
async function ensure3D(label) {
  cls('skip');
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < 300000) {
    const r = await ev(() => { if (N.view.want !== 'tps' && N.view.mode !== 'fps') N.view.set('tps', { noSave: true }); return window.__R.ready3d(); });
    if (r) { ok = true; break; }
    await stepFrame(FRAME * 4);
  }
  if (!ok) throw new Error('3D did not start (' + label + '): ' + JSON.stringify(await ev(() => ({ mode: N.view.mode, want: N.view.want, err: N.view.error, m3d: N.models3d && N.models3d.state }))));
  await ev((s) => { N.view3d.setQuality({ adaptive: false, pixelRatio: s, maxPixelRatio: s, minPixelRatio: s }); window.__R.drawHook(); }, SCALE);
  await settle3D();
  if (label !== 'title') await startCam(label);
  log('3D ready (' + label + ') in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s: ' + JSON.stringify(await ev(() => { const s = N.view3d.stats(); return { tier: s.tier, pr: s.pixelRatio, chunks: s.chunks, lm: s.landmarks, actors: s.actors, dd: s.drawDist, m3d: N.models3d.state }; })));
}
/** finish the streaming around the player now (real time for the synchronous loop), then a few uncaptured frames
 *  (one drawn: shaders compile before the first captured frame) */
async function settle3D() {
  await ev(() => { const VC = window.__VC; VC.freeRun(true); try { N.view3d.settle(15000); } catch (e) { /* ignore */ } VC.freeRun(false); });
  const k = CAP.k; CAP.k = 'skip';
  await ev(() => { window.__VC.skipDraw = false; window.__VC.tick(1000 / 30); });
  V.game += FRAME;
  await stepFrame(FRAME * 6);
  CAP.k = k;
}

/* ============================================================================ input helpers */
let held = new Set();
async function setKeys(want) {
  for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
async function releaseKeys() { await setKeys(new Set()); }
async function press(k, n, gap) { for (let i = 0; i < (n || 1); i++) { await page.keyboard.press(k); await wait(gap || 110); } }
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** on foot: steer towards world angle a (null: let go of the stick) */
async function moveDir(a, k) { await ev(([a, k]) => window.__R.setMoveDir(a, k), [a == null ? null : a, k || 1]); }
async function camOff() { await ev(() => { if (window.__R) { window.__R.cam.on = false; window.__R.cam.yaw = null; } }); }
/** dialogue framing: on a new speaker (not Chinnu) standing near, ease the camera over his shoulder towards them;
 *  the first line with nobody to frame: away from a wall if the camera faces one */
async function talkCam(s, o) {
  const spk = s.dlg && s.dlg.s;
  const first = !o._inDlg;
  o._inDlg = true;
  if (spk === o._dlgSpk || (!first && /^(chinnu|you|srikanth|narrator)$/.test(spk || ''))) return;
  o._dlgSpk = spk;
  if (vnow() - (o._talkT || -1e9) < 4000 && !first) return;
  const r = await ev((spk) => { const R = window.__R, f = R.frameTalk(spk); if (f) { R.cam.on = true; R.cam.yaw = f.yaw; } return f; }, spk);
  if (r) { o._talkT = vnow(); if (VERBOSE) log('   talkCam ' + spk + ' ' + JSON.stringify(r)); return; }
  if (first) await openCam(false, 30);
}
/** (not captured) try 8 camera yaws round the player and keep the one the game's own collision leaves furthest out
 *  (with a view ahead): a scene never starts with the camera crammed against a wall */
async function startCam(label) {
  const k = CAP.k; CAP.k = 'skip';
  const res = [];
  const y0 = await ev(() => N.view.yaw);
  for (let i = 0; i < 8; i++) {
    const yaw = y0 + i * Math.PI / 4;
    await ev((yaw) => { N.view.yaw = yaw; if (N.view3d.snapCamera) N.view3d.snapCamera(); }, yaw);
    await stepFrame(FRAME);
    const r = await ev(() => { const R = window.__R, f = R.freeFn(N.player); return { d: R.camDist(), ahead: f(N.view.yaw, 120) }; });
    res.push({ yaw, d: r.d, ahead: r.ahead, sc: Math.min(r.d, 30) * 4 + Math.min(r.ahead, 120) * 0.5 - i % 4 });
    if (i === 0 && r.d > 26 && r.ahead > 60) break; // the current one is fine
  }
  res.sort((a, b) => b.sc - a.sc);
  await ev((yaw) => { N.view.yaw = yaw; if (N.view3d.snapCamera) N.view3d.snapCamera(); }, res[0].yaw);
  await stepFrame(FRAME);
  CAP.k = k;
  if (VERBOSE) log('   startCam ' + label + ': ' + JSON.stringify(res[0]) + ' of ' + res.length);
}
/** the camera faces the most open way (snap: at once, else eased): used when a scene starts facing a wall */
async function openCam(snap, minAhead) {
  const r = await ev(([snap, minAhead]) => {
    const R = window.__R, o = R.openYaw();
    if (!o || N.view.mode !== 'tps' || (N.player.vehicle && Math.abs(N.player.vehicle.speed || 0) > 3)) return null;
    if (o.ahead >= minAhead && o.behind >= 20) return { keep: true, o };
    if (snap) { N.view.yaw = o.yaw; if (N.view3d.snapCamera) N.view3d.snapCamera(); } else { R.cam.on = true; R.cam.yaw = o.yaw; }
    return { o };
  }, [!!snap, minAhead || 40]);
  if (VERBOSE && r) log('   openCam ' + JSON.stringify(r));
  return r;
}

/** Read the open dialogue line at a readable pace, then E (choices: arrows + E by policy). */
const READ = { base: 0.5, perChar: 0.019, min: 1.15, max: 3.0 };
async function readLine(s, o) {
  cls('read');
  o = o || {};
  const t0 = vnow();
  while (vnow() - t0 < 12000) {
    const d = await ev(() => { const c = N.dialogue.current; return c ? { t: String(c.text || ''), typing: !!c.typing, ch: c.choices ? c.choices.slice() : null, open: N.dialogue.isOpen() } : { open: N.dialogue.isOpen() }; });
    if (!d.open || !d.t) { await wait(120); if (!(await ev(() => N.dialogue.isOpen()))) return; continue; }
    if (!d.typing) { s = { dlg: { t: d.t, ch: d.ch } }; break; }
    await wait(FRAME);
  }
  const text = (s.dlg && s.dlg.t) || '';
  if (/^\W*tape hiss\W*$/i.test(text.trim())) { cls('wait'); await wait(700); await press('KeyE'); await wait(250); return; }
  if (s.dlg && s.dlg.ch && s.dlg.ch.length) {
    await wait(1600);
    const idx = choicePolicy(text, s.dlg.ch, o);
    log('   choice "' + text.slice(0, 70) + '" -> ' + idx + ' ' + JSON.stringify(s.dlg.ch[idx]));
    for (let k = 0; k < idx; k++) { await press('ArrowDown', 1, 260); }
    await wait(500);
    await press('KeyE');
  } else {
    const hold = Math.max(READ.min, Math.min(READ.max, READ.base + text.length * READ.perChar)) * (o.slow || 1);
    await wait(hold * 1000);
    await press('KeyE');
  }
  const t1 = vnow();
  while (vnow() - t1 < 1600) {
    const d = await ev(() => { const c = N.dialogue.current; return { open: N.dialogue.isOpen(), t: c ? String(c.text || '') : '' }; });
    if (!d.open || d.t !== text) return;
    await wait(FRAME);
  }
}
const CHOICES = [
  [/How many faces have no clock/, 1], [/At the gate/, 0], [/oldest garden a princess/, 0], [/Tomatoes are/, 0], [/HITEC City is far/, 0],
  [/^Chappals\?/, 0], [/Puja bananas/, 1], [/Twenty rupees more/, 1], [/drum hill a white temple/, 0],
];
function choicePolicy(text, ch, o) {
  if (o && o.choice) { const r = o.choice(text, ch); if (r != null) return r; }
  for (const [re, i] of CHOICES) if (re.test(text)) return Math.min(i, ch.length - 1);
  return 0;
}

/* ============================================================================ travel: real keys along the route */
/** keys for a world direction a on foot in 3D: relative to the camera (up = forward = N.view.yaw) */
function footKeys(a, yaw, view) {
  const rel = view === 'top' ? a : a - yaw;
  // screen-relative (top-down) or camera-relative: f = forward (up), r = right
  const f = view === 'top' ? -Math.sin(a) : Math.cos(rel), r = view === 'top' ? Math.cos(a) : Math.sin(rel);
  const k = new Set();
  if (f > 0.38) k.add('ArrowUp'); if (f < -0.38) k.add('ArrowDown');
  if (r > 0.38) k.add('ArrowRight'); if (r < -0.38) k.add('ArrowLeft');
  return k;
}
/**
 * Steer to (tx, ty) with the arrow keys: on foot camera-relative 8-way (Shift to run), on a cycle tank steering.
 * Returns {d, why}. A stretch without progress is not captured ('skip') and is covered by a ▶▶ card in the edit.
 */
async function travel(tx, ty, o) {
  o = o || {};
  const r = o.r || 14, t0 = vnow(), lim = o.ms || 120000;
  const myCls = o.cls || 'travel';
  cls(myCls);
  await ev(() => window.__R.unplan());
  let best = 1e9, bestT = vnow(), replans = 0, lastObj = null, st = null, why = 'timeout', revUntil = 0, lastFeedT = vnow();
  let hidden = null; // a stuck stretch not being captured: {x, y, t}
  try {
    for (;;) {
      st = await page.evaluate(([x, y, oo]) => window.__R.nav(x, y, oo), [tx, ty, { direct: !!o.direct, replan: false }]);
      if (lastObj == null) lastObj = st.obj;
      if (st.d <= r) { why = 'arrived'; break; }
      if (st.mode !== 'play') { why = 'mode:' + st.mode; break; }
      if (st.dlg) { why = 'dialogue'; break; }
      if (st.cut) { why = 'cutscene'; break; }
      if (st.pass) { why = 'passenger'; break; }
      if (o.objStop && st.obj !== lastObj) { why = 'objective'; break; }
      if (o.stop && (await o.stop(st))) { why = 'stop'; break; }
      if (vnow() - t0 > lim) break;
      if (vnow() - lastFeedT > 8000) { lastFeedT = vnow(); await ev(() => window.__R.feed()); }
      // moving again after a hidden stuck stretch (clear progress along the way): back on camera, a ▶▶ card covers the jump
      const away = hidden ? Math.hypot(st.x - hidden.x, st.y - hidden.y) : 0;
      if (hidden && (away > 45 || (st.rem < hidden.rem - 30 && away > 15))) { cls(myCls); mark('cut', { why: 'stuck', skipped: Math.round(vnow() - hidden.t) }); hidden = null; }
      if (st.rem < best - 3) {
        best = st.rem; bestT = vnow();
      } else {
        // no progress for 1.6 s: stop capturing until he is moving again
        if (!hidden && vnow() - bestT > 1200 && !o.noHide) { hidden = { x: st.x, y: st.y, t: vnow(), rem: st.rem }; cls('skip'); }
        if (vnow() - bestT > (o.stuckMs || 3500)) {
          replans++;
          if (replans > (o.maxReplans || 5)) { why = 'stuck'; break; }
          log('   (travel: no progress at ' + Math.round(st.x) + ',' + Math.round(st.y) + ' d ' + Math.round(st.d) + ' rem ' + Math.round(st.rem) + ' src ' + st.src + ' aim ' + Math.round(st.ax) + ',' + Math.round(st.ay) + ' keys ' + [...held].join('+') + ' -> replan ' + replans + ')');
          await page.evaluate(([x, y, rd, ar, mg]) => window.__R.nav(x, y, { replan: true, road: rd, around: ar, margin: mg }), [tx, ty, replans === 2, replans === 1 || replans === 3 || replans === 4, replans >= 3 ? 420 : 220]);
          bestT = vnow(); best = 1e9;
          if (st.veh) { revUntil = vnow() + 700; }
          else {
            const a0 = Math.atan2(st.ay - st.y, st.ax - st.x) + (replans % 2 ? Math.PI / 2 : -Math.PI / 2);
            await moveDir(a0); await wait(450);
          }
        }
      }
      let want = new Set();
      const a = Math.atan2(st.ay - st.y, st.ax - st.x);
      if (st.veh) {
        const diff = wrapA(a - st.ang);
        if (vnow() < revUntil) { want.add('ArrowDown'); if (diff > 0) want.add('ArrowLeft'); else want.add('ArrowRight'); }
        else {
          if (diff > 0.12) want.add('ArrowRight'); else if (diff < -0.12) want.add('ArrowLeft');
          const ad = Math.abs(diff);
          if (ad < 1.1 || st.spd < 22) want.add('ArrowUp');
          else if (ad > 1.6 && st.spd > 45) want.add('ArrowDown');
          if (st.d < 60 && st.spd > 70) want.delete('ArrowUp');
          if (st.cargo && st.spd > 32) want.delete('ArrowUp');
          if (st.cargo && ad > 0.6 && st.spd > 24) { want.delete('ArrowUp'); }
        }
        if (o.fpsRide && !hidden) await fpsRideCheck(st);
        if (TL.fpsUntil && V.game > TL.fpsUntil) await fpsEnd();
      } else {
        await moveDir(a);
        if (!o.walk && st.d > 40 && st.e > 18 && !st.lvl && !st.calm) want.add('ShiftLeft');
      }
      if (st.veh) await moveDir(null);
      await setKeys(want);
      await stepFrame(FRAME);
    }
  } finally {
    await releaseKeys(); await moveDir(null); await camOff();
    if (TL && TL.fpsUntil > V.game) await fpsEnd();
    if (hidden) { cls(myCls); mark('cut', { why: 'stuck-end', skipped: Math.round(vnow() - hidden.t) }); }
  }
  return { d: st ? st.d : 1e9, why, x: st && st.x, y: st && st.y };
}
/** first person for a few seconds of a cycle ride (once per chapter where asked) */
async function fpsRideCheck(st) {
  if (TL.fpsDone || st.rem < 450 || st.spd < 30 || st.view !== 'tps') return;
  TL.fpsDone = true;
  TL.fpsUntil = V.game + 7000;
  await ev(() => N.view.set('fps', { noSave: true }));
  mark('hl', { what: 'fps', w: 5 });
  log('   (first person on the cycle)');
}
async function fpsEnd() { TL.fpsUntil = 0; await ev(() => N.view.set('tps', { noSave: true })); }

/* ============================================================================ the autopilot */
const NOT_STORY = /downstairs|2-in-1|Sleep|Eat \(|REWIND|^Get off|^Park|Chitti Chase|^Start |\brace\b|Challenge|Play with|^Click \(|Borrow|Hire|Nakko|Ride auto|fare\)|Sit pillion|Ride as passenger|Ask for a lift/i;
const STORY_OFFER = /^(CLAP|Clap|Set the self|Drag Nanna|Nanna,|Look down|Leave the cake|Send Immu|Get in the boat|Board the bus|Ask about|▶ PLAY|● REC|Climb to the|Go up|Up to|Ride (Hero|Hercules|Scooty|BSA|cycle|Ladies)|Fly the kite|Give|Light the|Talk|Take|Pick|Open|Count the|Ring|Wave|Buy|Empty|Eat|Drink|Hand|Show|Put|Use|Read)/;
async function play(done, o) {
  o = o || {};
  const t0 = vnow();
  let lastKey = '', lastHb = Date.now(), lastFeed = 0, mgResT = 0, nearT = 0, idleT = vnow();
  let s = null;
  for (;;) {
    s = await PROBE();
    if (await done(s)) return s;
    if (vnow() - t0 > (o.timeout || 900000)) throw new Error('play timeout (' + (o.label || '?') + '): ' + JSON.stringify(s).slice(0, 600));
    if (vnow() - lastFeed > 8000) { lastFeed = vnow(); await ev(() => window.__R.feed()); }
    const key = [s.mode, s.mission, s.scene, s.obj, s.act, s.p.x >> 3, s.p.y >> 3, s.dlg && s.dlg.t, s.cut, s.mg].join('|');
    if (key !== lastKey) { lastKey = key; idleT = vnow(); if (VERBOSE) log('   · ' + [s.mode, s.mission || s.scene, s.obj, 'act=' + s.act, JSON.stringify(s.p), s.tgt ? 'tgt ' + Math.round(s.tgt.x) + ',' + Math.round(s.tgt.y) + ' ' + s.tgt.src : '', s.date, s.view].join(' | ')); }
    if (Date.now() - lastHb > 60000) { lastHb = Date.now(); log('   … ' + [s.mode, s.mission || s.scene, s.obj, 'act=' + s.act, JSON.stringify(s.p), s.tgt ? JSON.stringify(s.tgt) : '-', s.date, s.view, 'out ' + outT().toFixed(0) + ' s'].join(' | ')); }
    // (the game itself goes top-down for two story-camera beats drawn with 2D props, story2.js topDownFor(): M12's
    // gallery pan and an ending beat; it comes back to the 3D view by itself)
    // ---- modal things first
    if (s.ask) {
      cls('read');
      const why = await ev(() => window.__R.fails.slice(-1)[0] || null);
      mark('fail', { why });
      await wait(2200);
      if (o.noRetry) return s;
      await press('KeyE'); await wait(900); continue;
    }
    if (s.shop) {
      if (o._shopObj !== s.obj) { o._shopObj = s.obj; o._shopTries = 0; }
      if (/hire|buy|rent|ticket|₹/i.test(s.obj) && o._shopTries < 3) {
        o._shopTries++;
        cls('read');
        await wait(1800);
        const rs = await ev(() => { const rows = Array.from(document.querySelectorAll('.shop-row')); return { first: rows.findIndex((r) => !r.classList.contains('dis')), sel: rows.findIndex((r) => r.classList.contains('sel')), names: rows.slice(0, 5).map((r) => (r.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)) }; });
        log('   (shop for the story: ' + JSON.stringify(rs) + ')');
        if (rs.first >= 0 && rs.sel >= 0) { const k = rs.first - rs.sel; for (let q = 0; q < Math.abs(k); q++) await press(k > 0 ? 'ArrowDown' : 'ArrowUp', 1, 250); }
        await wait(400); await press('KeyE'); await wait(1400);
        if ((await PROBE()).shop) { await press('KeyE'); await wait(1200); }
        continue;
      }
      log('   (a shop card opened: Escape)'); await press('Escape'); await wait(300);
      o._farActOff = vnow() + 8000;
      continue;
    }
    if (s.deck) { log('   (the 2-in-1 opened: Escape)'); await press('Escape'); await wait(300); continue; }
    if (s.ptCard) { log('   (a party start card opened: N, not now)'); await press('KeyN'); await wait(300); o._farActOff = vnow() + 8000; continue; }
    if (s.journal || s.menuTop === 'map' || s.menuTop === 'pause') { await press('Escape'); await wait(300); continue; }
    if (s.mg || s.mode === 'minigame') {
      if (CAP.k !== 'mg') cls('mg');
      if (s.mg && s.mg !== o._mg) { o._mg = s.mg; mark('hl', { what: 'mg', id: s.mg, w: 3 }); }
      if (s.mgResult) { mgResT = mgResT || vnow(); if (vnow() - mgResT > 2600) { await press('Enter'); mgResT = vnow(); } } else mgResT = 0;
      await wait(250); continue;
    }
    mgResT = 0;
    if (o.hook && (await o.hook(s))) { idleT = vnow(); continue; }
    if (s.defs) { cls('read'); await wait(7000); await press('KeyE'); await wait(800); continue; }
    if (s.credits) { cls('credits'); await wait(500); continue; }
    if (s.dlgOpen && s.dlg) { await talkCam(s, o); await readLine(s, o); continue; }
    if (o._inDlg && !s.dlgOpen) { o._inDlg = false; o._dlgSpk = null; await camOff(); }
    if (s.cut) {
      cls('cut');
      if (s.csPrompt) { await wait(1900); await press('KeyE'); await wait(600); continue; }
      await wait(200); continue;
    }
    if (s.panel) {
      cls('read');
      if (o.panel && (await o.panel(s)) !== false) continue;
      if (/s2-lock/.test(s.panel)) { await lockDial([1, 4, 0, 1]); continue; }
      await wait(2000); await press('KeyE'); await wait(500); continue;
    }
    if (s.gallery && s.mode === 'play') { cls('act'); await galleryStep(s.gallery); continue; }
    if (s.mode !== 'play') { await wait(200); continue; }
    if (s.busy) { cls('cut'); await wait(200); continue; }
    if (s.rec === 'prompt') { cls('read'); mark('hl', { what: 'rec', w: 3 }); await wait(1300); await press('KeyE'); await wait(500); continue; }
    if (s.jc) {
      cls('read');
      if (o.jcard === false) { await wait(200); continue; }
      mark('hl', { what: 'jcard', w: 1 });
      await wait(2400); await press('KeyE'); await wait(900); continue;
    }
    if (s.dw && s.dw.panel) { cls('read'); await wait(1500); await press('KeyE'); await wait(500); continue; }
    // ---- in the world
    if (s.s1 && s.s1.queue && !s.s1.queue.done) {
      cls(s.s1.queue.tell ? 'act' : 'wait');
      if (s.s1.queue.tell) { await wait(500); await press('KeyE'); }
      else if (s.s1.queue.gap) { await press('ArrowUp', 1, 180); }
      await wait(150); continue;
    }
    if ((s.s1 && s.s1.ride) || (s.p.hidden && s.p.locked)) { if (CAP.k !== 'ride') { cls('ride'); mark('hl', { what: 'ride', w: 2 }); await ev(() => { window.__R.cam.ride = true; window.__R.cam.rideV = null; }); } await wait(250); continue; }
    if (CAP.k === 'ride') await ev(() => { window.__R.cam.ride = false; });
    if (s.p.pass) {
      // a free seat behind someone (not a story ride: those lock the seat): ask to stop and get off
      if (/^(Ask to stop|Get off)$/.test(s.act)) {
        o._passT = o._passT || vnow();
        if (vnow() - o._passT > 4000) { log('   (a passenger by mistake: ' + s.act + ')'); cls('act'); await press('KeyE'); await wait(600); o._passT = vnow() - 2500; continue; }
      } else o._passT = 0;
      if (CAP.k !== 'ride') { cls('ride'); mark('hl', { what: 'ride', w: 2 }); }
      await wait(250); continue;
    }
    o._passT = 0;
    if (s.p.locked) {
      cls('wait');
      o._lockT = o._lockT || vnow();
      if (vnow() - o._lockT > 25000) { mark('assist', { what: 'controls stayed locked 25 s: unlocked', obj: s.obj }); await ev(() => { N.player.controlsLocked = false; }); o._lockT = 0; }
      await wait(200); continue;
    }
    o._lockT = 0;
    if (!s.p.veh && /get on|cycle|ride|pedal/i.test(s.obj)) {
      const b = await ev(() => window.__R.bike());
      if (b) { if (!(await mount(b))) { o._mf = (o._mf || 0) + 1; if (o._mf > 2) { await stuckAssist(s); o._mf = 0; } } continue; }
    }
    if (s.s1 && s.s1.step === 'press' && s.act) { cls('act'); await wait(600); await press('KeyE'); await wait(500); continue; }
    let tg = s.tgt;
    if (!tg && o.target) tg = await o.target(s);
    if (tg && (await levelStep(tg, s))) continue;
    if (tg) {
      const d = Math.hypot(tg.x - s.p.x, tg.y - s.p.y);
      if (d <= 40 && s.act && s.storyAct && !/downstairs|terrace|Climb|Up to|Go up/i.test(s.act) && vnow() > (o._farActOff || 0)) {
        cls('act'); await press('KeyE'); await wait(500);
        if ((await PROBE()).shop) { o._farActOff = vnow() + 10000; }
        continue;
      }
      if (d > (o.near || 18)) {
        const r = await travel(tg.x, tg.y, { r: o.near ? o.near - 4 : 14, ms: 90000, objStop: true, stop: o.travelStop, fpsRide: o.fpsRide });
        if (r.why === 'stuck') await unstick(tg, s);
        continue;
      }
      nearT = nearT || vnow();
      if (!s.p.veh && !s.storyAct && vnow() - nearT > 3000) { const b = await ev(() => window.__R.bike()); if (b) { log('   (back on the mission cycle)'); await mount(b); nearT = 0; continue; } }
      if (s.act && (s.storyAct || (!NOT_STORY.test(s.act) && (STORY_OFFER.test(s.act) || vnow() - nearT > 6000))) && vnow() > (o._farActOff || 0)) {
        cls('act'); await press('KeyE'); await wait(500);
        if ((await PROBE()).shop) { o._farActOff = vnow() + 10000; }
        continue;
      }
      cls('wait');
      if (vnow() - idleT > 25000) { await stuckAssist(s); idleT = vnow(); }
      await wait(250); continue;
    }
    nearT = 0;
    if (s.act && (s.storyAct || (STORY_OFFER.test(s.act) && !NOT_STORY.test(s.act) && vnow() > (o._farActOff || 0)))) { cls('act'); await press('KeyE'); await wait(500); continue; }
    cls('wait');
    if (vnow() - idleT > 30000) { await stuckAssist(s); idleT = vnow(); }
    await wait(250);
  }
}
async function levelStep(tg, s) {
  const lp = await ev(([x, y, h]) => window.__R.levelPlan(x, y, h), [tg.x, tg.y, tg.h || 0]);
  if (!lp) return false;
  const d = Math.hypot(lp.x - s.p.x, lp.y - s.p.y);
  const want = lp.kind === 'down' ? /downstairs/i : /terrace|Climb|Up to|Go up/i;
  if (want.test(s.act) && d < 16) { cls('act'); await press('KeyE'); await wait(900); return true; }
  if (d > 7) { await travel(lp.x, lp.y, { r: 5, ms: 60000, walk: d < 40 }); }
  else { await travel(lp.x + (Math.random() - 0.5) * 6, lp.y + (Math.random() - 0.5) * 6, { r: 2, ms: 1500, walk: true, direct: true, noHide: true }); }
  const a = await ev(() => N.input.actionLabel || '');
  if (want.test(a)) { cls('act'); await press('KeyE'); await wait(900); }
  return true;
}
async function mount(b) {
  const offered = async () => {
    const lab = await ev(() => N.input.actionLabel || '');
    if (/^(Ride|Get on|Pedal|Drive)\b/i.test(lab)) { cls('act'); await press('KeyE'); await wait(700); return true; }
    return !!(await ev(() => !!N.player.vehicle));
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    await travel(b.x, b.y, { r: 10, ms: 20000, maxReplans: 2 });
    if (await offered()) return true;
    // round the cycle: the side where nothing stands, nearest first
    const spots = await ev(([bx, by]) => {
      const p = N.player, out = [];
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2, x = bx + Math.cos(a) * 7, y = by + Math.sin(a) * 7;
        if (!N.world.isWalkable(x, y)) continue;
        let busy = false;
        for (const e of N.entities.query(x, y, 6)) if (e !== p && e.alive !== false && (e.kind === 'vehicle' || e.kind === 'prop') && Math.hypot(e.x - bx, e.y - by) > 2) { busy = true; break; }
        if (!busy) out.push({ x, y, d: Math.hypot(x - p.x, y - p.y) });
      }
      return out.sort((a, b) => a.d - b.d).slice(0, 4);
    }, [b.x, b.y]);
    for (const q of spots) { await stepTo(q.x, q.y, 2, 2500); if (await offered()) return true; }
    // assist: next to the cycle on its free side (a short hop; a ▶▶ card covers it)
    const q = spots[0];
    if (q) {
      mark('assist', { what: 'next to the mission cycle', at: { x: Math.round(q.x), y: Math.round(q.y) } });
      cls('skip');
      await ev(([x, y, bx, by]) => { const p = N.player; p.teleport(x, y); p.angle = p.facing = Math.atan2(by - y, bx - x); if (N.view3d.snapCamera) N.view3d.snapCamera(); }, [q.x, q.y, b.x, b.y]);
      await wait(300);
      cls('act'); mark('cut', { why: 'mount' });
      if (await offered()) return true;
    }
  }
  return false;
}
async function galleryStep(g) {
  const dx = g.coat.x - g.cam.x, dy = g.coat.y - g.cam.y;
  if (Math.hypot(dx, dy) < 60) { await wait(700); await press('KeyE'); await wait(400); return; }
  const keys = new Set();
  if (dx > 20) keys.add('ArrowRight'); if (dx < -20) keys.add('ArrowLeft'); if (dy > 20) keys.add('ArrowDown'); if (dy < -20) keys.add('ArrowUp');
  await setKeys(keys); await wait(260); await releaseKeys();
}
async function lockDial(code) {
  mark('hl', { what: 'lock', w: 3 });
  await wait(1800);
  for (let i = 0; i < code.length; i++) {
    let st = await ev(() => N.story2.lockState);
    if (!st) return;
    let guard = 0;
    while (st.sel !== i && guard++ < 6) { await press('ArrowRight', 1, 220); st = await ev(() => N.story2.lockState); if (!st) return; }
    const now = st.digits[i];
    for (let k = 0; k < (code[i] - now + 10) % 10; k++) await press('ArrowUp', 1, 260);
    await wait(350);
  }
  await wait(900);
  await press('KeyE');
  await wait(1500);
}
/** Short precise steps (the terrace parapet): camera-relative keys in 3D */
async function stepTo(x, y, r, maxMs) {
  const t0 = vnow();
  let d = Infinity;
  try {
    while (vnow() - t0 < (maxMs || 4000)) {
      const p = await ev(() => ({ x: N.player.x, y: N.player.y, mode: N.state.mode, yaw: N.view.yaw, view: N.view.mode }));
      if (p.mode !== 'play') break;
      const dx = x - p.x, dy = y - p.y; d = Math.hypot(dx, dy);
      if (d <= r) break;
      await moveDir(Math.atan2(dy, dx), d < 6 ? 0.55 : 1);
      await stepFrame(FRAME);
    }
  } finally { await releaseKeys(); await moveDir(null); }
  return d;
}
/** Deepon ki Raat: the 21 diyas on the terrace parapet, each lit with a held E (the match), nearest first. */
async function diyaHook(s) {
  if (!(s.dw && s.dw.terrace && s.p.lvl === 'home_terrace') || s.mode !== 'play' || s.dlgOpen) return false;
  cls('act');
  const T = await ev(() => N.dwMissions.debug.state().terrace);
  if (!T || T.lit >= T.n) { await wait(250); return true; }
  let tgt = null, bd = 1e9;
  for (const d of T.diyas) { if (d.lit) continue; const dd = Math.hypot(d.x - s.p.x, d.y - s.p.y); if (dd < bd) { bd = dd; tgt = d; } }
  if (!tgt) { await wait(150); return true; }
  if (!/Light the diya/.test(s.act) || bd > 6) {
    // face the parapet: the camera looks out over it (the city lights behind the diyas)
    await ev(([x, y]) => { const R = window.__R; R.cam.on = true; R.cam.yaw = null; R.cam.x = x; R.cam.y = y; R.cam.rate = 1.2; }, [tgt.x + tgt.nx * 60, tgt.y + tgt.ny * 60]);
    await stepTo(tgt.x - tgt.nx * 3, tgt.y - tgt.ny * 3, 2.5, 4000);
  }
  if (/Light the diya/.test(await ev(() => N.input.actionLabel || ''))) {
    const n0 = T.lit;
    if (!TL.diyaMarked) { TL.diyaMarked = true; mark('hl', { what: 'diyas', w: 4 }); }
    await page.keyboard.down('KeyE');
    await until((n0) => { const d = N.dwMissions.debug.state(); return !d.terrace || d.terrace.lit > n0; }, 2500, n0);
    await page.keyboard.up('KeyE');
  }
  await ev(() => { window.__R.cam.on = false; window.__R.cam.rate = 1.8; });
  return true;
}
/** A first-person look (fps) for secs: yaw towards (x, y), pitch eased to `pitch` (negative = up), then back to tps */
async function fpsLook(what, x, y, secs, pitch) {
  await releaseKeys();
  cls('fps');
  mark('hl', { what: 'fps', where: what, w: 5 });
  await ev(([x, y]) => { const p = N.player; N.view.set('fps', { noSave: true }); N.view.yaw = Math.atan2(y - p.y, x - p.x); N.view.pitch = 0.05; }, [x, y]);
  const n = Math.round(secs * FPS);
  for (let i = 0; i < n; i++) {
    const u = Math.min(1, i / (n * 0.55));
    const e = u * u * (3 - 2 * u);
    await ev(([pt]) => { N.view.pitch = pt; }, [0.05 + (pitch - 0.05) * e]);
    await stepFrame(FRAME);
  }
  await ev(() => { N.view.set('tps', { noSave: true }); N.view.pitch = 0.3; });
  log('   first-person look "' + what + '" done');
}
async function unstick(tg, s) {
  mark('assist', { what: 'unstick', at: s.p, tgt: { x: Math.round(tg.x), y: Math.round(tg.y) }, obj: s.obj });
  cls('skip');
  const hop = await ev(([x, y]) => {
    const p = N.player, v = p.vehicle, x0 = p.x, y0 = p.y;
    let pts = null;
    try { pts = window.__R.planAround(x, y, 300); } catch (e) { pts = null; }
    if (!pts) { try { const q = N.npcs.planPath(p.x, p.y, x, y); pts = q && q.map((c) => [c.x, c.y]); } catch (e) { pts = null; } }
    let q = { x, y };
    if (pts && pts.length) {
      let acc = 0, px = p.x, py = p.y;
      for (const c of pts) {
        const L = Math.hypot(c[0] - px, c[1] - py);
        if (acc + L >= 160) { const f = (160 - acc) / L; q = { x: px + (c[0] - px) * f, y: py + (c[1] - py) * f }; break; }
        acc += L; px = c[0]; py = c[1]; q = { x: px, y: py };
      }
    }
    const fr = N.world.findFree(q.x, q.y, v ? 'drive' : 'walk', 30); if (fr) q = fr;
    if (N.story2 && N.story2.tp) N.story2.tp(q.x, q.y); else if (v) { v.x = q.x; v.y = q.y; v.vx = v.vy = 0; v.speed = 0; p.x = v.x; p.y = v.y; } else p.teleport(q.x, q.y);
    if (N.render.snapCamera) N.render.snapCamera();
    if (N.view3d.snapCamera) N.view3d.snapCamera();
    return Math.round(Math.hypot(p.x - x0, p.y - y0));
  }, [tg.x, tg.y]);
  log('   (unstick hop ' + hop + ' u)');
  await settle3D();
  await startCam('unstick');
  await wait(600);
  cls('travel');
  mark('cut', { why: 'unstick' });
}
const assistN = {};
async function stuckAssist(s) {
  const key = (s.mission || s.scene || '-') + '|' + s.obj;
  assistN[key] = (assistN[key] || 0) + 1;
  if (assistN[key] > 4) throw new Error('hopeless: the same step was skipped 4 times without progress: ' + key);
  const k = await ev(() => (N.story && N.story.debug && N.story.debug.skip()) || (N.dwMissions && N.dwMissions.debug && N.dwMissions.debug.skip && N.dwMissions.debug.skip()) || null);
  mark('assist', { what: 'step skip', step: k, obj: s.obj, mission: s.mission || s.scene, at: s.p });
}

/* ============================================================================ free roam: to the next giver */
async function autoRide(tx, ty, name) {
  const ok = await ev(([x, y]) => { try { N.menus.waypoint(x, y); return true; } catch (e) { return false; } }, [tx, ty]);
  if (!ok) return false;
  const rp = await ev(() => { const r = N.world.nearestRoadPoint(N.player.x, N.player.y); return r ? { x: r.x, y: r.y, d: r.dist } : null; });
  if (rp && rp.d > 30) await travel(rp.x, rp.y, { r: 20, ms: 30000 });
  const fare = await ev(([x, y]) => { const f = N.shops.autoFare(N.player.x, N.player.y, x, y); return { ask: f.ask, money: N.player.money }; }, [tx, ty]);
  if (fare.money < fare.ask + 500) { await ev((p) => N.debug.give(p), fare.ask + 2000 - fare.money); mark('assist', { what: 'money for the auto', paise: fare.ask + 2000 - fare.money }); }
  cls('act');
  await press('Space'); await wait(200);
  mark('hl', { what: 'auto', w: 1 });
  const t0 = vnow();
  let opened = false;
  while (vnow() - t0 < 30000) {
    const s = await PROBE();
    if (s.shop) { opened = true; break; }
    if (s.dlgOpen) { await readLine(s); continue; }
    cls('wait');
    await wait(250);
  }
  if (!opened) { log('   (auto: no card)'); await ev(() => { try { N.menus.waypoint(null); } catch (e) { /* ignore */ } }); return false; }
  cls('read');
  await wait(1800);
  const rows = await ev(() => Array.from(document.querySelectorAll('.shop-row, [data-row], .sh-row')).map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).slice(0, 8));
  const wi = Math.max(0, rows.findIndex((t) => /waypoint/i.test(t)));
  for (let k = 0; k < wi; k++) await press('ArrowDown', 1, 250);
  await wait(400); await press('KeyE'); await wait(1500);
  await press('KeyE'); await wait(400);
  cls('ride');
  const t1 = vnow();
  while (vnow() - t1 < 60000) { const s = await PROBE(); if (!s.shop && s.mode === 'play' && !s.busy && !s.p.pass && Math.hypot(s.p.x - tx, s.p.y - ty) < 400) break; await wait(200); }
  await wait(1200);
  await ev(() => { try { N.menus.waypoint(null); } catch (e) { /* ignore */ } });
  mark('travel', { mode: 'auto', to: name });
  return true;
}
async function toGiver(id, o) {
  o = o || {};
  const hasId = (id) => !!(N.missions.active && N.missions.active.id === id);
  for (let attempt = 0; attempt < 8; attempt++) {
    const g = await ev((id) => window.__R.giver(id), id);
    if (!g) throw new Error('no giver for ' + id);
    const s = await PROBE();
    log('   toGiver ' + id + ' #' + attempt + ': giver ' + JSON.stringify(g) + ' me ' + JSON.stringify(s.p) + ' mode ' + s.mode + ' prompt ' + s.prompt + ' jc ' + s.jc + ' "' + s.jcText.slice(0, 80) + '" mission ' + s.mission);
    if (s.mission === id) return true;
    if (s.mission && s.mission !== id) {
      log('   (a stray mission started: ' + s.mission + ' -> quit)');
      mark('assist', { what: 'quit stray mission', id: s.mission });
      cls('skip');
      await ev(() => { try { N.missions.abort(); } catch (e) { /* ignore */ } });
      await wait(800); continue;
    }
    if (s.prompt === id && s.jc) {
      cls('read'); mark('hl', { what: 'jcard', w: 2 });
      if (await until(hasId, 3000, id)) return true;
      if (await ev((id) => N.missions.prompt === id, id)) await press('KeyE');
      if (await until(hasId, 8000, id)) return true;
      continue;
    }
    if (s.dlgOpen && s.dlg) { await readLine(s); continue; }
    if (s.mode !== 'play') { await wait(300); continue; }
    const d = Math.hypot(g.x - s.p.x, g.y - s.p.y);
    if (d > (o.autoOver || 5200) && !o.noAuto) {
      const ok = await autoRide(g.x, g.y, o.name || id);
      if (ok) continue;
    }
    if ((d < 60 && attempt > 0) || (!g.avail && d < 140)) {
      const out = await ev(([x, y]) => {
        const p = N.player; let best = null, bs = -1;
        for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, qx = x + Math.cos(a) * 120, qy = y + Math.sin(a) * 120; if (!N.world.isWalkable(qx, qy)) continue; const sc = Math.hypot(qx - p.x, qy - p.y); if (sc > bs) { bs = sc; best = { x: qx, y: qy }; } }
        return best || { x: x + 120, y: y };
      }, [g.x, g.y]);
      log('   (step out to ' + Math.round(out.x) + ',' + Math.round(out.y) + ')');
      await travel(out.x, out.y, { r: 12, ms: 25000, walk: true });
      await wait(600);
    }
    if (await levelStep(g, s)) continue;
    const r = await travel(g.x, g.y, { r: Math.max(5, g.r - 6), ms: 240000, fpsRide: o.fpsRide, stop: async () => (await ev((id) => N.missions.prompt === id || !!N.missions.active, id)) });
    if (r.why === 'stuck') await unstick(g, s);
    await wait(400);
    const ok = await until((id) => N.missions.prompt === id || (N.missions.active && N.missions.active.id === id), 5000, id);
    if (!ok) continue;
    const s2 = await PROBE();
    if (s2.mission === id) return true;
    cls('read'); mark('hl', { what: 'jcard', w: 2 });
    if (await until(hasId, 3000, id)) return true;
    if (!(await ev((id) => N.missions.prompt === id, id))) continue;
    await press('KeyE');
    if (await until(hasId, 8000, id)) return true;
  }
  throw new Error('could not start ' + id + ' from its giver');
}
const passed = (id) => async (s) => !s.mission && !s.scene && !s.ask && (await ev((id) => N.missions.isDone(id), id));
async function afterPass(secs) {
  const t0 = vnow();
  while (vnow() - t0 < (secs || 7) * 1000) {
    const s = await PROBE();
    if (s.dlgOpen && s.dlg) { await readLine(s); continue; }
    cls(s.cut ? 'cut' : 'act');
    await wait(250);
  }
}
async function storyTune() {
  await ev(() => {
    if (N.story && N.story.debug) { N.story.debug.mg = 'win'; N.story.debug.mgTimeScale = 1; N.story.debug.fastRides = false; }
    if (N.story2) N.story2.TUNE.mg = { autoplay: 'win', skipHowto: true, timeScale: 1 };
    N.debug.skipDialogue(false);
    try { if (N.settings && N.settings.set) N.settings.set('textSpeed', 'fast'); } catch (e) { /* ignore */ }
  });
}
async function continueGame() {
  cls('skip');
  await wait(1000);
  const has = await ev(() => { const b = document.querySelector('[data-act=continue]'); return !!(b && b.offsetParent !== null); });
  if (!has) throw new Error('no CONTINUE on the title');
  await page.click('[data-act=continue]');
  if (!(await until(() => N.state.mode !== 'title', 30000))) throw new Error('CONTINUE did not start the game');
  await storyTune();
  await ensure3D('continue');
}
async function saveNow() { return ev((key) => { try { return localStorage.getItem(key); } catch (e) { return null; } }, SAVE_KEY); }

/* ============================================================================ sessions */
async function sTitleM1() {
  await ev(() => { N.menus.quickStart = false; });
  // the 3D engine starts at the title (the saved view): wait for it before the first captured frame
  await ensure3D('title');
  mark('chapter', { id: '00_prologue' });
  cls('cut');
  await wait(4500);
  await page.click('#title-start');
  await until(() => N.menus.debugState().top === 'name', 20000);
  cls('read');
  await wait(2500);
  await press('Enter', 1, 900); await press('Enter', 1, 400);
  await until(() => N.state.mode === 'cutscene', 20000);
  await storyTune();
  await play((s) => s.mission === 'bo_kaata' && s.mode === 'play' && !s.cut, { label: 'prologue', timeout: 600000 });
  mark('chapter', { id: '01_bo_kaata' });
  await play(passed('bo_kaata'), { label: 'bo_kaata', timeout: 1200000 });
  mark('hl', { what: 'passed', w: 2 });
  await afterPass(8);
}
function mainSession(id, o) {
  return async () => {
    o = o || {};
    await continueGame();
    if (o.before) await o.before();
    mark('chapter', { id: o.chapter });
    cls('act');
    await wait(1200);
    await toGiver(id, o);
    await play(passed(id), Object.assign({ label: id, timeout: 1800000, fpsRide: o.fpsRide }, o.play || {}));
    mark('hl', { what: 'passed', w: 2 });
    await afterPass(o.after || 8);
  };
}
let walkmanDone = false;
async function walkmanHook(s) {
  if (walkmanDone || s.mode !== 'play' || !/Wait for the current/i.test(s.obj)) return false;
  walkmanDone = true;
  await wait(1200); await press('KeyQ'); mark('hl', { what: 'walkman', w: 2 });
  return true;
}
let shownCharminar = false;
/** Chand Raat: once, a calm moment on foot near Charminar -> a first-person look up at it. */
async function charminarLook(s) {
  if (shownCharminar || s.mode !== 'play' || s.dlgOpen || s.cut || s.chase || s.gallery || s.p.veh || s.p.locked || s.p.lvl) return false;
  const c = await ev(() => { const c = N.places.charminar; return c ? { x: c.x, y: c.y, d: Math.hypot(N.player.x - c.x, N.player.y - c.y) } : null; });
  if (!c || c.d > 260 || c.d < 60) return false;
  shownCharminar = true;
  await fpsLook('charminar chand raat', c.x, c.y, 6, -0.32);
  return true;
}
async function toSwing(re, what) {
  for (let k = 0; k < 4; k++) {
    const c = await ev(() => { const s = N.dwMissions.story.state(); return s.card ? { x: s.card.x, y: s.card.y } : null; });
    if (!c) { log('   (no swing card: ' + what + ')'); return false; }
    const s0 = await PROBE();
    if (Math.hypot(c.x - s0.p.x, c.y - s0.p.y) < 14 && k > 0) {
      const out = await ev(([x, y]) => N.world.findFree(x + 50, y + 40, 'walk', 30) || { x: x + 50, y: y + 40 }, [c.x, c.y]);
      await travel(out.x, out.y, { r: 8, ms: 12000, walk: true });
    }
    if (await levelStep(c, s0)) { k--; continue; }
    await travel(c.x, c.y, { r: 5, ms: 120000 });
    const ok = await until((src) => new RegExp(src).test((document.querySelector('.hud-jcard.show') || {}).innerText || ''), 5000, re.source);
    if (!ok) continue;
    cls('read'); mark('hl', { what: 'swing', w: 1 });
    await wait(3000); await press('KeyE');
    await wait(1200);
    return true;
  }
  return false;
}
async function sDiwali() {
  await continueGame();
  mark('chapter', { id: '11_diwali_week' });
  await play(async (s) => s.mode === 'play' && !s.cut && !s.dlgOpen && !s.scene && !s.busy && s.dws && s.dws.week === 'week' && !!s.dws.card, { label: 'diwali way in', jcard: false, timeout: 240000 });
  await afterPass(2);
  await toSwing(/Wait till/, 'Mon 20 Oct');
  await play(async (s) => /SAT 25 OCT/.test(s.date) && !s.busy && s.mode === 'play' && !s.cut && !s.dlgOpen, { label: 'to Sat', jcard: false, timeout: 120000 });
  await afterPass(2);
  await toGiver('mithai_run', { noAuto: true, fpsRide: true });
  await play(passed('mithai_run'), { label: 'mithai_run', timeout: 1200000 });
  mark('hl', { what: 'passed', w: 2 });
  await afterPass(5);
  await ev(() => { const T = N.dwMissions.TUNE; T.gustFirst = 40; T.gustEvery = [40, 50]; });
  if (await ev(() => N.clock.minutes < 18 * 60 + 30)) {
    await toSwing(/Wait till 18:30/, 'Sat afternoon');
    await play(async (s) => !s.busy && s.mode === 'play' && !s.cut && !s.dlgOpen && (await ev(() => N.clock.minutes >= 18 * 60 + 30)), { label: 'to 18:30', jcard: false, timeout: 60000 });
  }
  mark('assist', { what: 'Deepon ki Raat: gentler gusts (TUNE.gustFirst 40, gustEvery [40, 50], as tests/story_full.cjs)' });
  await toGiver('deepon_ki_raat', { noAuto: true });
  await play(passed('deepon_ki_raat'), { label: 'deepon_ki_raat', timeout: 1200000, hook: diyaHook });
  mark('hl', { what: 'passed', w: 3 });
  await afterPass(6);
  await toSwing(/Sleep/, "Diwali's done");
  await play(async (s) => s.scene === 'interlude', { label: 'outro', timeout: 240000 });
  mark('chapter', { id: '12_interlude' });
  await play(async (s) => !s.scene && !s.cut && s.mode === 'play' && !s.dlgOpen && (await ev(() => !!N.flags.interlude_done)), { label: 'interlude', timeout: 600000 });
  await afterPass(4);
}
async function sEnding() {
  await continueGame();
  mark('chapter', { id: '15_ending' });
  await play(async (s) => s.scene === 'epilogue', { label: 'ending', timeout: 1200000, jcard: false });
  mark('chapter', { id: '16_epilogue' });
  await play(async (s) => s.defs || s.credits, { label: 'epilogue', timeout: 1200000, jcard: false });
  mark('chapter', { id: '17_credits' });
  await play(async (s) => !!(s.panel && /s2-rewind/.test(s.panel)), { label: 'credits', timeout: 1200000, jcard: false });
  cls('read');
  mark('hl', { what: 'rewind', w: 1 });
  await wait(4000);
}
const SESSIONS = [
  { id: 's00', chapters: ['00_prologue', '01_bo_kaata'], fresh: true, run: sTitleM1 },
  { id: 's02', chapters: ['02_lost_and_found'], run: mainSession('lost_and_found', { chapter: '02_lost_and_found', name: 'Mozamjahi Market' }) },
  { id: 's03', chapters: ['03_first_day_first_show'], run: mainSession('first_day_first_show', { chapter: '03_first_day_first_show', name: 'home', fpsRide: true }) },
  { id: 's04', chapters: ['04_last_man_batting'], run: mainSession('last_man_batting', { chapter: '04_last_man_batting', name: 'home' }) },
  { id: 's05', chapters: ['05_right_right'], run: mainSession('right_right', { chapter: '05_right_right', name: 'home', fpsRide: true }) },
  { id: 's06', chapters: ['06_ammammas_thursday'], run: mainSession('ammammas_thursday', { chapter: '06_ammammas_thursday', name: 'home', fpsRide: true, play: { hook: walkmanHook } }) },
  { id: 's07', chapters: ['07_the_clap'], run: mainSession('the_clap', { chapter: '07_the_clap', name: 'home' }) },
  { id: 's08', chapters: ['08_drums_for_amma'], run: mainSession('drums_for_amma', { chapter: '08_drums_for_amma', name: 'home', fpsRide: true }) },
  { id: 's09', chapters: ['09_opening_day'], run: mainSession('opening_day', { chapter: '09_opening_day', name: "Immu's house", fpsRide: true }) },
  { id: 's10', chapters: ['10_agle_baras'], run: mainSession('agle_baras', { chapter: '10_agle_baras', name: 'the colony ground', after: 3.5, fpsRide: true }) },
  { id: 's11', chapters: ['11_diwali_week', '12_interlude'], run: sDiwali, forceSave: true },
  { id: 's13', chapters: ['13_last_bell'], run: mainSession('last_bell', { chapter: '13_last_bell', name: 'school', fpsRide: true }) },
  { id: 's14', chapters: ['14_chand_raat'], run: mainSession('chand_raat', { chapter: '14_chand_raat', name: 'home', after: 3.5, play: { hook: charminarLook } }) },
  { id: 's15', chapters: ['15_ending', '16_epilogue', '17_credits'], run: sEnding },
];

/* ============================================================================ record */
async function recordSession(sess) {
  const prevIdx = SESSIONS.indexOf(sess) - 1;
  let raw = '';
  if (!sess.fresh) {
    const prev = SESSIONS[prevIdx];
    let f = path.join(SAVES_IN, 'after_' + prev.id + '.json');
    if (!fs.existsSync(f)) f = path.join(SAVES, 'after_' + prev.id + '.json');
    if (!fs.existsSync(f)) throw new Error('no save after ' + prev.id);
    raw = readJSON(f).raw;
  }
  logFile = path.join(RAW, sess.id + '.log');
  fs.writeFileSync(logFile, '');
  log('=== session ' + sess.id + ' (' + sess.chapters.join(', ') + ') ' + OW + 'x' + OH + ' gl ' + GL);
  pageErrors.length = 0; held = new Set(); walkmanDone = false; shownCharminar = false;
  for (const k in assistN) delete assistN[k];
  const tStart = Date.now();
  await openSession(sess, raw);
  let ok = false, err = null;
  try {
    await sess.run();
    ok = true;
  } catch (e) { err = e; log('!! session ' + sess.id + ' failed: ' + (e.stack || e.message)); try { await page.screenshot({ path: path.join(RAW, sess.id + '_error.png') }); } catch (e2) { /* ignore */ } }
  mark('end', {});
  let save = null;
  if (ok && sess.forceSave) { try { await ev(() => N.save.save({ reason: 'std', toast: false })); } catch (e) { /* ignore */ } }
  try { save = await saveNow(); } catch (e) { /* ignore */ }
  const stats = await ev(() => ({ passes: window.__R.passes, fails: window.__R.fails, errors: N.debug.state().errors.slice(0, 10), vcErrors: window.__VC.errors.slice(0, 10), date: N.calendar.label(), counter: N.tape.counter, v3d: N.view3d.stats() })).catch(() => null);
  const frames = await closeSession();
  const realS = (Date.now() - tStart) / 1000;
  const perf = { frames, outS: +(frames / FPS).toFixed(1), realS: Math.round(realS), msPerFrame: PERF.frames ? Math.round((PERF.tickMs + PERF.shotMs) / PERF.frames) : 0, tickMs: PERF.frames ? Math.round(PERF.tickMs / PERF.frames) : 0, shotMs: PERF.frames ? Math.round(PERF.shotMs / PERF.frames) : 0, gameS: Math.round(V.game / 1000), skipTicks: PERF.skipTicks };
  writeJSON(path.join(RAW, sess.id + '.timeline.json'), { session: sess.id, chapters: sess.chapters, frames, fps: FPS, size: [OW, OH], cls: TL.cls, marks: TL.marks, stats, perf, errors: pageErrors.slice(0, 20), ok });
  log('session ' + sess.id + ': ' + (ok ? 'OK' : 'FAILED') + ', ' + JSON.stringify(perf) + ' ' + JSON.stringify(stats && { passes: stats.passes, fails: stats.fails, errors: stats.errors, vc: stats.vcErrors }));
  if (ok) {
    if (save) writeJSON(path.join(SAVES, 'after_' + sess.id + '.json'), { raw: save, t: new Date().toISOString() });
    setProgress('sessions', sess.id, Object.assign({ done: true, t: new Date().toISOString(), file: path.join(RAW, sess.id + '.mkv') }, perf));
  } else setProgress('sessions', sess.id, Object.assign({ done: false, failed: String(err && err.message).slice(0, 300), t: new Date().toISOString() }, perf));
  TL = null;
  if (!ok) throw err;
}
function probeDur(f) {
  try { return +cp.execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim() || 0; } catch (e) { return 0; }
}

/* ============================================================================ edit (ffmpeg) */
function ff(args, o) {
  if (process.env.FF_THREADS) { const k = args.indexOf('-c:v'); if (k >= 0) args = args.slice(0, k).concat(['-threads', process.env.FF_THREADS], args.slice(k)); }
  const r = cp.spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y'].concat(args), Object.assign({ encoding: 'utf8', maxBuffer: 1 << 26 }, o || {}));
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + (r.stderr || '').slice(-1500) + '\nargs: ' + args.join(' ').slice(0, 800));
  return r;
}
function ensureFonts() {
  fs.mkdirSync(FONTS, { recursive: true });
  const want = ['YatraOne-latin-400', 'VT323-latin-400', 'Baloo2-latin'];
  if (want.every((n) => fs.existsSync(path.join(FONTS, n + '.ttf')))) return;
  const old = path.join(ROOT, 'video', 'work', 'fonts');
  if (want.every((n) => fs.existsSync(path.join(old, n + '.ttf')))) { for (const n of want) fs.copyFileSync(path.join(old, n + '.ttf'), path.join(FONTS, n + '.ttf')); return; }
  const py = "import sys\nfrom fontTools.ttLib import TTFont\nfor n in sys.argv[2:]:\n  f=TTFont(sys.argv[1]+'/'+n+'.woff2'); f.flavor=None; f.save(n+'.ttf')\n";
  cp.execFileSync('python3', ['-I', '-c', py, path.join(ROOT, 'vendor', 'fonts')].concat(want), { cwd: FONTS });
}
function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '\u2019').replace(/%/g, '\\%'); }
const fsz = (n) => Math.round(n * OW / 1280);
/** 2.6 s title card over a blurred, darkened still of the chapter. */
function titleCard(ch, still, out) {
  ensureFonts();
  const F = (n) => path.join(FONTS, n + '.ttf');
  const D = 2.6;
  const vf = [
    'scale=' + OW + ':' + OH, 'boxblur=10:2', 'eq=brightness=-0.28:saturation=0.7', 'format=yuv420p',
    'drawbox=x=0:y=ih/2-' + fsz(120) + ':w=iw:h=' + fsz(240) + ':color=0x1a1214@0.55:t=fill',
    "drawtext=fontfile='" + F('VT323-latin-400') + "':text='" + esc(ch.top) + "':fontsize=" + fsz(46) + ':fontcolor=0xf2c230:x=(w-text_w)/2:y=h/2-' + fsz(104),
    "drawtext=fontfile='" + F('YatraOne-latin-400') + "':text='" + esc(ch.title) + "':fontsize=" + fsz(72) + ':fontcolor=0xfff4dc:shadowcolor=0x1a1214:shadowx=2:shadowy=2:x=(w-text_w)/2:y=h/2-' + fsz(48),
    "drawtext=fontfile='" + F('Baloo2-latin') + "':text='" + esc(ch.sub) + "':fontsize=" + fsz(30) + ':fontcolor=0xe8d9b5:x=(w-text_w)/2:y=h/2+' + fsz(50),
    "drawtext=fontfile='" + F('VT323-latin-400') + "':text='NOSTALGIA · 3D':fontsize=" + fsz(28) + ':fontcolor=0xff5fb0:x=w-text_w-' + fsz(28) + ':y=h-' + fsz(44),
    'fade=t=in:st=0:d=0.5', 'fade=t=out:st=' + (D - 0.45) + ':d=0.45',
  ].join(',');
  ff(['-loop', '1', '-t', String(D), '-i', still, '-vf', vf, '-r', '30', '-c:v', 'libx264', '-crf', '14', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out]);
  return D;
}
function ffCard(src, at, out) {
  const st = out.replace(/\.mp4$/, '.png');
  ff(['-ss', at.toFixed(3), '-i', src, '-frames:v', '1', st]);
  ff(['-loop', '1', '-t', '0.8', '-i', st, '-vf', 'scale=' + OW + ':' + OH + ",eq=brightness=-0.18:saturation=0.6,noise=alls=18:allf=t,drawtext=fontfile='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf':text='▶▶  F.FWD':fontsize=" + fsz(60) + ':fontcolor=white:shadowcolor=black:shadowx=3:shadowy=3:box=1:boxcolor=black@0.45:boxborderw=' + fsz(18) + ':x=(w-text_w)/2:y=(h-text_h)/2,format=yuv420p', '-r', '30', '-c:v', 'libx264', '-crf', '14', '-preset', 'veryfast', out]);
  return 0.8;
}
function sessionOf(chId) { return SESSIONS.find((s) => s.chapters.indexOf(chId) >= 0); }
/** a chapter's frame range in its session's raw video: [f0, f1) */
function chapterRange(tl, chId) {
  const marks = tl.marks.filter((m) => m.type === 'chapter');
  const i = marks.findIndex((m) => m.id === chId);
  if (i < 0) throw new Error('chapter ' + chId + ' not in ' + tl.session);
  const f0 = marks[i].f;
  const endM = tl.marks.find((m) => m.type === 'end');
  const f1 = i + 1 < marks.length ? marks[i + 1].f : Math.min(tl.frames, endM ? endM.f : tl.frames);
  return [f0, f1];
}
function editChapter(chId) {
  const sess = sessionOf(chId);
  const tl = readJSON(path.join(RAW, sess.id + '.timeline.json'));
  if (!tl) throw new Error('no timeline for ' + sess.id);
  const src = path.join(RAW, sess.id + '.mkv');
  const [f0, f1] = chapterRange(tl, chId);
  const wd = path.join(WORK, chId);
  fs.rmSync(wd, { recursive: true, force: true }); fs.mkdirSync(wd, { recursive: true });
  // the cuts (a ▶▶ card covers each jump in the picture: a stuck stretch not captured, a debug hop)
  const cuts = tl.marks.filter((m) => m.type === 'cut' && m.f > f0 + 3 && m.f < f1 - 3).map((m) => m.f);
  const bounds = [f0].concat(cuts.filter((f, i, a) => i === 0 || f - a[i - 1] > 10)).concat([f1]);
  // a stretch of under 1.5 s between two jumps is dropped: one ▶▶ card covers both
  const drop = new Set();
  for (let i = 1; i < bounds.length - 2; i++) if (bounds[i + 1] - bounds[i] < 45) drop.add(i);
  const still = path.join(wd, 'still.png');
  ff(['-ss', ((Math.min(f1 - 1, f0 + 60)) / FPS).toFixed(3), '-i', src, '-frames:v', '1', still]);
  const list = [];
  const td = titleCard(CH[chId], still, path.join(wd, 'c000.mp4'));
  list.push('c000.mp4');
  let tOut = td;
  const map = [];
  let cards = 0;
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i], b = bounds[i + 1];
    if (b - a < 2 || drop.has(i)) continue;
    if (i > 0) { const cf = 'f' + String(i).padStart(3, '0') + '.mp4'; tOut += ffCard(src, (a + 1) / FPS, path.join(wd, cf)); list.push(cf); cards++; }
    const f = 'c' + String(i + 1).padStart(3, '0') + '.mp4';
    ff(['-ss', (a / FPS).toFixed(4), '-i', src, '-frames:v', String(b - a), '-an', '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'veryfast', path.join(wd, f)]);
    list.push(f);
    map.push({ f0: a, f1: b, o: +tOut.toFixed(3) });
    tOut += (b - a) / FPS;
  }
  fs.writeFileSync(path.join(wd, 'list.txt'), list.map((f) => "file '" + f + "'").join('\n') + '\n');
  const out = path.join(CHAP, chId + '.mp4');
  // crf 26; a chapter over 90 MB is encoded again 2 steps coarser (the 3D picture with Ultra's film grain is busy)
  let crf = +(process.env.CRF || 26), size = 0;
  for (;;) {
    ff(['-f', 'concat', '-safe', '0', '-i', path.join(wd, 'list.txt'), '-c:v', 'libx264', '-crf', String(crf), '-preset', 'slow', '-r', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
    size = fs.statSync(out).size;
    if (size <= 90 * 1048576 || crf >= 30 || process.env.CRF) break;
    log('   ' + chId + ': ' + (size / 1048576).toFixed(1) + ' MB at crf ' + crf + ', again at crf ' + (crf + 2));
    crf += 2;
  }
  const dur = probeDur(out);
  setProgress('chapters', chId, { file: out, dur: +dur.toFixed(1), size, mb: +(size / 1048576).toFixed(1), crf, cards, title: td, map, t: new Date().toISOString() });
  log('chapter ' + chId + ': ' + dur.toFixed(1) + ' s, ' + (size / 1048576).toFixed(1) + ' MB (crf ' + crf + '), ' + cards + ' ▶▶ cards');
  for (const f of list) fs.rmSync(path.join(wd, f), { force: true });
  return out;
}
/** session frame -> chapter video time */
function mapFrame(chId, f) {
  const c = progress.chapters[chId];
  if (!c) return null;
  for (const m of c.map) if (f >= m.f0 && f < m.f1) return m.o + (f - m.f0) / FPS;
  return null;
}
function frames(chId) {
  ensureFonts();
  const f = path.join(CHAP, chId + '.mp4');
  for (const q of fs.readdirSync(FRAMES)) if (q.startsWith(chId + '_sheet')) fs.rmSync(path.join(FRAMES, q));
  ff(['-i', f, '-vf', "fps=1/20,scale=320:180,drawtext=fontfile='" + path.join(FONTS, 'VT323-latin-400.ttf') + "':text='%{pts\\:hms}':fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6:x=4:y=4,tile=4x5", path.join(FRAMES, chId + '_sheet%02d.jpg')]);
  return fs.readdirSync(FRAMES).filter((q) => q.startsWith(chId + '_sheet')).length;
}
/** QA: frame-to-frame differences (frozen runs), black frames */
function qa(chId) {
  const f = path.join(CHAP, chId + '.mp4');
  const r = cp.spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-vf', 'tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG,blackdetect=d=0.3:pix_th=0.06', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const lines = (r.stderr || '').split('\n');
  const diffs = [];
  for (const l of lines) { const m = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(l); if (m) diffs.push(+m[1]); }
  const blacks = lines.filter((l) => /black_start/.test(l)).map((l) => l.replace(/.*black_start/, 'black_start').trim());
  const c = progress.chapters[chId];
  const skip = c ? Math.round((c.title || 2.6) * FPS) : 78;
  const frozen = []; let run = 0, at = 0;
  for (let i = skip; i < diffs.length; i++) {
    if (diffs[i] < 0.02) { if (!run) at = i; run++; } else { if (run >= 15) frozen.push({ at: +(at / FPS).toFixed(1), frames: run }); run = 0; }
  }
  if (run >= 15) frozen.push({ at: +(at / FPS).toFixed(1), frames: run });
  const out = { chapter: chId, frames: diffs.length, meanDiff: +(diffs.reduce((a, b) => a + b, 0) / Math.max(1, diffs.length)).toFixed(2), frozen, blacks };
  writeJSON(path.join(FRAMES, chId + '_qa.json'), out);
  log('qa ' + chId + ': ' + JSON.stringify(out).slice(0, 400));
  return out;
}
function fullFilm(ids) {
  const list = ids.map((id) => "file '" + path.join(CHAP, id + '.mp4') + "'").join('\n') + '\n';
  const lf = path.join(WORK, 'full_list.txt');
  fs.writeFileSync(lf, list);
  let t = 0;
  let meta = ';FFMETADATA1\ntitle=NOSTALGIA - full story playthrough (3D)\n';
  for (const id of ids) {
    const d = probeDur(path.join(CHAP, id + '.mp4'));
    const c = CH[id];
    meta += '[CHAPTER]\nTIMEBASE=1/1000\nSTART=' + Math.round(t * 1000) + '\nEND=' + Math.round((t + d) * 1000) + '\ntitle=' + (c.top + ' - ' + c.title).replace(/[=;#\\\n]/g, ' ') + '\n';
    t += d;
  }
  const mf = path.join(WORK, 'full_meta.txt');
  fs.writeFileSync(mf, meta);
  const out = path.join(VIDEO, 'nostalgia_3d_full_playthrough.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', lf, '-i', mf, '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', '-movflags', '+faststart', out]);
  log('full film: ' + probeDur(out).toFixed(1) + ' s, ' + (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
  return out;
}
/** 3-4 min: the best 3D moments of each chapter (first person, rides, long walks / rides through the city,
 *  minigames, MISSION PASSED), captioned. */
const HL_OFF = { talk: [0, 6], fps: [0.3, 7], ride: [1, 7], travel: [1.5, 7], diyas: [2, 7], mg: [2.5, 6], lock: [0, 7], rec: [-3, 6], jcard: [-0.5, 5], passed: [-2.5, 5], swing: [-0.5, 5], auto: [0, 6], rewind: [-1, 5] };
const HL_FIX = { '00_prologue': [{ frac: 0.32, len: 6 }], '12_interlude': [{ frac: 0.5, len: 5 }], '17_credits': [{ frac: 0.25, len: 6 }] };
function hlCandidates(tl, id) {
  const c = tl.marks.filter((m) => m.type === 'hl').map((m) => ({ what: m.what, f: m.f }));
  // long travel runs: a stretch of city in 3D (a few seconds after the run starts); long dialogues in the world
  for (let i = 0; i < tl.cls.length; i++) {
    const a = tl.cls[i], b = tl.cls[i + 1];
    if (a.k === 'travel' && b && b.f - a.f > 9 * FPS) c.push({ what: 'travel', f: a.f + 2 * FPS });
    if (a.k === 'read' && b && b.f - a.f > 8 * FPS) c.push({ what: 'talk', f: a.f + 1 * FPS });
  }
  return c.map((q) => ({ what: q.what, t: mapFrame(id, q.f) })).filter((q) => q.t != null);
}
function hlPicks(id, cand, dur) {
  if (HL_FIX[id]) return HL_FIX[id].map((q) => ({ t: dur * q.frac, len: q.len, off: 0 }));
  const first = (what) => cand.find((q) => q.what === what);
  const out = [];
  for (const w of ['fps', 'diyas', 'ride', 'travel', 'talk', 'mg', 'lock', 'rec', 'passed']) { const q = first(w); if (q) { out.push({ t: q.t, off: HL_OFF[w][0], len: HL_OFF[w][1], what: w }); break; } }
  for (const w of ['travel', 'talk', 'ride', 'mg', 'passed']) { const q = cand.filter((x) => x.what === w).find((x) => !out.some((o) => Math.abs(o.t - x.t) < 15)); if (q && !out.some((o) => o.what === w && w !== 'travel')) { out.push({ t: q.t, off: HL_OFF[w][0], len: Math.min(6, HL_OFF[w][1]), what: w }); break; } }
  if (!out.length) out.push({ t: dur * 0.5, off: 0, len: 7 });
  return out.sort((a, b) => a.t - b.t);
}
function highlights(ids) {
  ensureFonts();
  const wd = path.join(WORK, 'hl');
  fs.rmSync(wd, { recursive: true, force: true }); fs.mkdirSync(wd, { recursive: true });
  const F = (n) => path.join(FONTS, n + '.ttf');
  const list = [];
  let n = 0, total = 0;
  for (const id of ids) {
    const sess = sessionOf(id);
    const tl = readJSON(path.join(RAW, sess.id + '.timeline.json'));
    const c = progress.chapters[id];
    if (!tl || !c) continue;
    const dur = c.dur;
    const chosen = hlPicks(id, hlCandidates(tl, id), dur);
    for (const q of chosen) {
      const a = Math.max(c.title + 0.2, Math.min(dur - q.len - 0.5, q.t + q.off));
      const f = 'h' + String(++n).padStart(3, '0') + '.mp4';
      const cap = esc(CH[id].top + ' · ' + CH[id].title);
      ff(['-ss', a.toFixed(2), '-i', path.join(CHAP, id + '.mp4'), '-t', String(q.len), '-an', '-vf',
        'drawbox=x=0:y=ih-' + fsz(54) + ':w=iw:h=' + fsz(54) + ":color=0x1a1214@0.7:t=fill:enable='lt(t,2.6)',drawtext=fontfile='" + F('YatraOne-latin-400') + "':text='" + cap + "':fontsize=" + fsz(30) + ':fontcolor=0xfff4dc:x=' + fsz(24) + ':y=h-' + fsz(44) + ":enable='lt(t,2.6)'," +
        'fade=t=in:st=0:d=0.3,fade=t=out:st=' + (q.len - 0.3) + ':d=0.3,fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'veryfast', path.join(wd, f)]);
      list.push(f); total += q.len;
    }
  }
  const still = path.join(wd, 'still.png');
  ff(['-ss', '3', '-i', path.join(CHAP, ids[Math.min(1, ids.length - 1)] + '.mp4'), '-frames:v', '1', still]);
  titleCard({ top: 'HIGHLIGHTS · 3D', title: 'Nostalgia', sub: 'Hyderabad 2003 · the whole story in a few minutes' }, still, path.join(wd, 'h000.mp4'));
  list.unshift('h000.mp4');
  fs.writeFileSync(path.join(wd, 'list.txt'), list.map((f) => "file '" + f + "'").join('\n') + '\n');
  const out = path.join(VIDEO, 'nostalgia_3d_highlights.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', path.join(wd, 'list.txt'), '-c:v', 'libx264', '-crf', process.env.CRF || '24', '-preset', 'slow', '-r', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  log('highlights: ' + probeDur(out).toFixed(1) + ' s, ' + (fs.statSync(out).size / 1048576).toFixed(1) + ' MB (' + list.length + ' clips)');
  return out;
}

/* ============================================================================ main */
module.exports = { installVirtualClock, pageHelper, CHAPTERS, SESSIONS };
if (require.main === module) (async () => {
  const STAGE = process.env.STAGE || 'all';
  const pickS = () => {
    if (process.env.SESSIONS) return process.env.SESSIONS.split(',').map((id) => SESSIONS.find((s) => s.id === id)).filter(Boolean);
    let L = SESSIONS.slice();
    if (process.env.FROM) L = L.slice(L.findIndex((s) => s.id === process.env.FROM));
    if (process.env.TO) L = L.slice(0, L.findIndex((s) => s.id === process.env.TO) + 1);
    return L.filter((s) => !(progress.sessions[s.id] && progress.sessions[s.id].done));
  };
  if (STAGE === 'record' || STAGE === 'all') {
    for (const s of pickS()) {
      try { await recordSession(s); } catch (e) { log('session ' + s.id + ' failed: ' + e.message); if (process.env.STOP_ON_FAIL) throw e; }
    }
  }
  const doneCh = SESSIONS.filter((s) => progress.sessions[s.id] && progress.sessions[s.id].done).flatMap((s) => s.chapters);
  const chs = process.env.CHAPTERS ? process.env.CHAPTERS.split(',') : doneCh;
  if (STAGE === 'edit' || STAGE === 'all') for (const id of chs) editChapter(id);
  if (STAGE === 'frames' || STAGE === 'edit' || STAGE === 'all') for (const id of chs) log('frames ' + id + ': ' + frames(id) + ' sheets');
  if (STAGE === 'qa' || STAGE === 'edit' || STAGE === 'all') for (const id of chs) qa(id);
  const order = CHAPTERS.map((c) => c.id).filter((id) => progress.chapters[id] && fs.existsSync(path.join(CHAP, id + '.mp4')));
  if (STAGE === 'full' || (STAGE === 'all' && order.length === CHAPTERS.length)) fullFilm(order);
  if (STAGE === 'highlights' || (STAGE === 'all' && order.length === CHAPTERS.length)) highlights(order);
  if (SERVER) SERVER.close();
  stopXvfb();
  log('done');
})().catch((e) => { console.error(e); stopXvfb(); process.exit(1); });
