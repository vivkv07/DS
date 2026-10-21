/* NOSTALGIA — core.js
 * Creates window.N: constants, utils, deterministic RNG, events, the systems registry,
 * the state stack, game time, the in-game clock (day/night light curve), flags, places,
 * and N.err (throttled error reporting used by every module).
 * Contract: ARCHITECTURE.md §4, §5.
 */
(() => {
  'use strict';
  const N = (window.N = window.N || {});

  N.VERSION = '0.1.0';
  N.WORLD_W = 8000;
  N.WORLD_H = 6000;
  N.CELL = 4;
  N.SURF = Object.freeze({
    VOID: 0, GROUND: 1, ROAD: 2, FOOTPATH: 3, GRASS: 4, PLAZA: 5,
    WATER: 6, ROCK: 7, SOLID: 8, SAND: 9, BRIDGE: 10,
  });
  N.DEBUG = (() => { try { return location.hash === '#debug'; } catch (e) { return false; } })();

  /* ------------------------------------------------------------------ utils */
  const TAU = Math.PI * 2;

  // mulberry32: tiny, fast, deterministic 32-bit PRNG
  function mulberry32(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const util = {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    invLerp: (a, b, v) => (b === a ? 0 : (v - a) / (b - a)),
    // smoothstep on t in 0..1 (clamped)
    smooth: (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); },
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    dist2: (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
    angleTo: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1),
    wrapAngle: (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; },
    angleDiff: (a, b) => util.wrapAngle(b - a), // signed shortest turn from a to b
    rand: () => Math.random(),
    randRange: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    chance: (p) => Math.random() < p,
    rng(seed) {
      const f = mulberry32(typeof seed === 'string' ? util.strHash(seed) : seed);
      return {
        next: f,
        range: (a, b) => a + f() * (b - a),
        int: (a, b) => a + Math.floor(f() * (b - a + 1)),
        pick: (arr) => arr[Math.floor(f() * arr.length)],
        chance: (p) => f() < p,
      };
    },
    strHash(s) {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    },
    // deterministic 0..1 hash of integer-ish coordinates
    hash2(x, y) {
      let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul((y | 0) + 0x9e3779b9, 0x85ebca6b);
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
      h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
      return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    },
    // paise (integer) -> "₹ 12.50"
    fmtMoney(paise) {
      paise = Math.round(paise || 0);
      const neg = paise < 0; paise = Math.abs(paise);
      const r = Math.floor(paise / 100), p = paise % 100;
      return (neg ? '-' : '') + '₹ ' + r + '.' + (p < 10 ? '0' : '') + p;
    },
    // minutes since midnight -> "17:42"
    fmtClock(min) {
      min = ((Math.floor(min) % 1440) + 1440) % 1440;
      const h = Math.floor(min / 60), m = min % 60;
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    },
    // point in polygon (array of [x,y])
    pointInPoly(x, y, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    },
    // closest point on segment ab to p: returns {x, y, t, d2}
    closestOnSeg(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const x = ax + dx * t, y = ay + dy * t;
      return { x, y, t, d2: (px - x) * (px - x) + (py - y) * (py - y) };
    },
    // "#rrggbb" -> [r,g,b]
    hexToRgb(hex) {
      let h = hex.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },
    rgbToHex(r, g, b) {
      const c = (v) => { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); };
      return '#' + c(r) + c(g) + c(b);
    },
    // multiply a hex colour's brightness by f (>1 lightens towards white smoothly)
    shade(hex, f) {
      const [r, g, b] = util.hexToRgb(hex);
      if (f <= 1) return util.rgbToHex(r * f, g * f, b * f);
      const t = Math.min(1, f - 1);
      return util.rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
    },
    mix(hexA, hexB, t) {
      const a = util.hexToRgb(hexA), b = util.hexToRgb(hexB);
      return util.rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    },
  };
  N.util = util;

  /* ---------------------------------------------------------------- errors */
  // Captured errors (window.onerror + N.err). debug.js exposes these as N.debug.errors.
  N.errors = [];
  const errLast = Object.create(null);
  N.err = function (where, e) {
    const now = performance.now();
    if (errLast[where] && now - errLast[where] < 5000) return;
    errLast[where] = now;
    const msg = (e && (e.stack || e.message)) || String(e);
    N.errors.push({ where, msg: String(msg).slice(0, 600), t: Math.round(now) });
    if (N.errors.length > 50) N.errors.shift();
    try { console.error('[N.err] ' + where + ':', e); } catch (_) { /* ignore */ }
  };

  /* ---------------------------------------------------------------- events */
  const listeners = Object.create(null);
  N.on = function (evt, fn) { (listeners[evt] || (listeners[evt] = [])).push(fn); return fn; };
  N.off = function (evt, fn) {
    const l = listeners[evt]; if (!l) return;
    const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
  };
  N.emit = function (evt, data) {
    const l = listeners[evt]; if (!l) return;
    for (const fn of l.slice()) {
      try { fn(data); } catch (e) { N.err('event:' + evt, e); }
    }
  };

  /* --------------------------------------------------------------- systems */
  // N.addSystem({id, order, runIn:['play',...] | ['*'], init(), update(dt), reset(), draw()})
  // main.js drives N.systems.init/update/draw. Every call is wrapped in try/catch + N.err.
  const systems = [];
  let prof = null; // N.systems.profile(): {t0, steps, draws, s: {id: [updateMs, updateMax, drawMs, drawMax]}}
  function profAdd(id, k, ms) {
    const r = prof.s[id] || (prof.s[id] = [0, 0, 0, 0]);
    r[k * 2] += ms; if (ms > r[k * 2 + 1]) r[k * 2 + 1] = ms;
  }
  N.addSystem = function (sys) {
    if (!sys || !sys.id) throw new Error('addSystem: id required');
    if (sys.order == null) sys.order = 50;
    if (!sys.runIn) sys.runIn = ['play'];
    const i = systems.findIndex((s) => s.id === sys.id);
    if (i >= 0) systems.splice(i, 1);
    systems.push(sys);
    systems.sort((a, b) => a.order - b.order);
    if (N.systems.started && sys.init) {
      try { sys.init(); } catch (e) { N.err('init:' + sys.id, e); }
    }
    return sys;
  };
  N.systems = {
    list: systems,
    started: false,
    get(id) { return systems.find((s) => s.id === id) || null; },
    init() {
      this.started = true;
      for (const s of systems.slice()) {
        if (s.init) { try { s.init(); } catch (e) { N.err('init:' + s.id, e); } }
      }
    },
    update(dt) {
      const mode = N.state.mode, P = prof;
      if (P) P.steps++;
      for (const s of systems) {
        if (!s.update) continue;
        if (s.runIn[0] !== '*' && s.runIn.indexOf(mode) < 0) continue;
        if (P) { const t = performance.now(); try { s.update(dt); } catch (e) { N.err('update:' + s.id, e); } profAdd(s.id, 0, performance.now() - t); continue; }
        try { s.update(dt); } catch (e) { N.err('update:' + s.id, e); }
      }
    },
    // enqueue-phase: systems with draw() put their work on render layers
    draw() {
      const P = prof;
      if (P) P.draws++;
      for (const s of systems) {
        if (!s.draw) continue;
        if (P) { const t = performance.now(); try { s.draw(); } catch (e) { N.err('draw:' + s.id, e); } profAdd(s.id, 1, performance.now() - t); continue; }
        try { s.draw(); } catch (e) { N.err('draw:' + s.id, e); }
      }
    },
    /** Opt-in per-system CPU profiler (tests / perf audit, tests/qa_perf.cjs). profile(true) starts (resets) it,
     *  profile() reads it: {steps, draws, ms, systems: [{id, update (ms per step), draw (ms per draw call),
     *  updateMax, drawMax}] sorted by cost}, profile(false) reads and stops. Off = one null check per call. */
    profile(on) {
      if (on === true) { prof = { t0: performance.now(), steps: 0, draws: 0, s: Object.create(null) }; return true; }
      const P = prof;
      if (on === false) prof = null;
      if (!P) return null;
      const rows = [];
      for (const id in P.s) {
        const r = P.s[id];
        rows.push({ id, update: P.steps ? +(r[0] / P.steps).toFixed(4) : 0, draw: P.draws ? +(r[2] / P.draws).toFixed(4) : 0, updateMax: +r[1].toFixed(2), drawMax: +r[3].toFixed(2) });
      }
      rows.sort((a, b) => (b.update + b.draw) - (a.update + a.draw));
      return { steps: P.steps, draws: P.draws, ms: Math.round(performance.now() - P.t0), systems: rows };
    },
    reset() {
      for (const s of systems.slice()) {
        if (s.reset) { try { s.reset(); } catch (e) { N.err('reset:' + s.id, e); } }
      }
    },
  };

  /* ----------------------------------------------------------- state stack */
  const MODES = ['boot', 'title', 'play', 'dialogue', 'cutscene', 'minigame', 'paused', 'map', 'journal', 'gameover'];
  N.state = {
    MODES,
    mode: 'boot',
    stack: ['boot'],
    push(mode) {
      const prev = this.mode;
      this.stack.push(mode); this.mode = mode;
      N.emit('state', { mode, prev, op: 'push' });
    },
    pop() {
      const prev = this.mode;
      if (this.stack.length > 1) this.stack.pop();
      this.mode = this.stack[this.stack.length - 1];
      N.emit('state', { mode: this.mode, prev, op: 'pop' });
      return prev;
    },
    // replace the whole stack (used for boot -> title -> play transitions)
    set(mode) {
      const prev = this.mode;
      this.stack = [mode]; this.mode = mode;
      N.emit('state', { mode, prev, op: 'set' });
    },
    is(mode) { return this.mode === mode; },
    has(mode) { return this.stack.indexOf(mode) >= 0; },
    /** Remove the topmost `mode` wherever it sits (an overlay that closes while another one,
     *  e.g. the pause menu, is on top of it). Never empties the stack. Returns true if removed. */
    remove(mode) {
      const i = this.stack.lastIndexOf(mode);
      if (i < 0 || this.stack.length <= 1) return false;
      if (i === this.stack.length - 1) { this.pop(); return true; }
      this.stack.splice(i, 1);
      N.emit('state', { mode: this.mode, prev: this.mode, op: 'remove', removed: mode });
      return true;
    },
  };

  /* ------------------------------------------------------------------ time */
  // now: game seconds (advances only while systems update), dt: last step, frame counter.
  N.time = { now: 0, dt: 0, frame: 0, scale: 1, real: 0 };

  /* ----------------------------------------------------------------- clock */
  // Light curve keyframes [minute, light]: 0 midnight .. 1 noon. Night ≈ 19:45-05:00.
  const LIGHT_KEYS = [
    [0, 0], [270, 0.0], [330, 0.12], [375, 0.38], [420, 0.62], [540, 0.86], [720, 1],
    [900, 0.93], [1020, 0.76], [1080, 0.55], [1110, 0.38], [1140, 0.2], [1185, 0.06], [1230, 0], [1440, 0],
  ];
  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  // Story layer (systems §10.1, §10.5; bible §1.4/§12.2): the main story starts on Tue 14 Jan 2003.
  // N.clock.day counts days since baseDate (N.calendar in storycore.js turns it into dates).
  // loop = {from, to, n} is the elastic "week loop": after day `to` comes day `from` again (n counts
  // the wraps); N.calendar sets it between missions. hold(reason, on) freezes the clock while any
  // reason is held (shop menus, a mission step, a VHS date jump); `frozen` stays the manual switch.
  N.clock = {
    minutes: 17 * 60,     // 0..1440
    day: 0,               // days elapsed since the base date
    speed: 1,             // game minutes per real second
    frozen: false,
    holds: new Set(),
    loop: null,           // {from, to, n} elastic week loop (systems §10.5), or null
    baseDate: [2003, 0, 14], // y, m (0-based), d — Tue 14 Jan 2003 (Sankranti, M1)
    set(h, m) { this.minutes = ((h * 60 + (m || 0)) % 1440 + 1440) % 1440; N.emit('clock:set', this.minutes); },
    hold(reason, on) { if (on === false) this.holds.delete(reason); else this.holds.add(reason); return this.holds.size > 0; },
    get held() { return this.frozen || this.holds.size > 0; },
    /** Loop days [from..to] (inclusive) after midnight; null clears it. Returns the loop. */
    setLoop(from, to) {
      if (from == null || to == null || !isFinite(from) || !isFinite(to) || to < from) { this.loop = null; return null; }
      const keep = this.loop && this.loop.from === (from | 0) && this.loop.to === (to | 0) ? this.loop.n : 0;
      this.loop = { from: from | 0, to: to | 0, n: keep };
      return this.loop;
    },
    /** True once the current loop window has wrapped at least once (the OSD shows ↻). */
    get looping() { const L = this.loop; return !!(L && L.n > 0 && this.day >= L.from && this.day <= L.to); },
    hour() { return Math.floor(this.minutes / 60); },
    light() {
      const t = this.minutes;
      for (let i = 1; i < LIGHT_KEYS.length; i++) {
        const k1 = LIGHT_KEYS[i];
        if (t <= k1[0]) {
          const k0 = LIGHT_KEYS[i - 1];
          return util.lerp(k0[1], k1[1], util.smooth((t - k0[0]) / (k1[0] - k0[0])));
        }
      }
      return 0;
    },
    isNight() { return this.light() < 0.3; },
    // "TUE 14 JAN 2003"
    dateLabel() {
      const b = this.baseDate;
      const d = new Date(Date.UTC(b[0], b[1], b[2] + this.day));
      const dd = d.getUTCDate();
      return DAYS[d.getUTCDay()] + ' ' + (dd < 10 ? '0' : '') + dd + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    },
    label() { return util.fmtClock(this.minutes); },
    /** Midnight rollover: next day, or back to loop.from when the week loop is closing. */
    nextDay() {
      this.day++;
      const L = this.loop;
      if (L && this.day > L.to && this.day - 1 >= L.from) { this.day = L.from; L.n++; N.emit('clock:loop', { day: this.day, n: L.n }); }
      N.emit('clock:day', this.day);
    },
    update(dt) {
      if (this.frozen || this.holds.size) return;
      this.minutes += dt * this.speed;
      while (this.minutes >= 1440) { this.minutes -= 1440; this.nextDay(); }
    },
    serialize() { return { minutes: this.minutes, day: this.day, loop: this.loop ? { from: this.loop.from, to: this.loop.to, n: this.loop.n } : null }; },
    deserialize(o) {
      if (!o) return;
      this.minutes = o.minutes || 0; this.day = o.day || 0;
      const L = o.loop;
      this.loop = L && isFinite(L.from) && isFinite(L.to) && L.to >= L.from ? { from: L.from | 0, to: L.to | 0, n: Math.max(0, L.n | 0) } : null;
    },
  };
  N.addSystem({
    id: 'clock', order: 5, runIn: ['play'],
    update(dt) { N.clock.update(dt); },
  });

  /* ----------------------------------------------------------- flags/places */
  N.flags = {};
  N.places = {};
  // Called by world.js after WORLD_DATA is loaded
  N.loadPlaces = function (list) {
    for (const k of Object.keys(N.places)) delete N.places[k];
    for (const p of list || []) {
      N.places[p.id] = { id: p.id, name: p.name || p.id, x: p.x, y: p.y, r: p.r || 30, district: p.district || null, kind: p.kind || 'place' };
    }
  };

  // Global error capture (also surfaced via N.debug.errors)
  // (capped like N.err: a handler that throws every frame must not grow the log for the whole session)
  window.addEventListener('error', (ev) => {
    N.errors.push({ where: 'window', msg: String((ev.error && ev.error.stack) || ev.message).slice(0, 600), t: Math.round(performance.now()) });
    if (N.errors.length > 50) N.errors.shift();
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    if (r && r.name === 'MissionAbort') return; // expected control flow for missions
    N.errors.push({ where: 'promise', msg: String((r && (r.stack || r.message)) || r).slice(0, 600), t: Math.round(performance.now()) });
    if (N.errors.length > 50) N.errors.shift();
  });
})();
