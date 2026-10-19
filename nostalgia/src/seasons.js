/* NOSTALGIA — seasons.js  (owner: world-reconcile + seasons agent)
 *
 * The city's calendar moods (story_bible §1.4 + §8.6, systems_design §10.5, §11.5, ARCHITECTURE §19)
 * and the respect zones (bible §1.5 rule 3, systems §4.8). Safe before boot, without a calendar,
 * and while every other story module is a stub.
 *
 * ------------------------------------------------------------------ N.seasons
 *   NAMES   sankranti numaish summer bonalu ganesh ganesh_immersion ramzan chand_raat christmas
 *           prasads_open year2026  (+ extras world_cup monsoon eid, read by places_art / landmarks)
 *   is(name) -> bool                    state {name: bool}            active() -> [names]
 *                                       (is('rain') / is('mist') report the weather below)
 *   set(name, on)                       override the calendar (true / false); set(name, null) drops the
 *                                       override. Overrides set while a mission runs end with that mission.
 *   autoFor(date)                       apply the calendar of `date` ({y, m (1-12), d} | Date | 'YYYY-MM-DD'
 *                                       | nothing = today from N.calendar / N.clock). Called by N.calendar on
 *                                       every date change; manual overrides stay on top.
 *   calendarFor(date) -> {name: bool}   the bible §1.4 table (no side effects)
 *   refresh()   clear()   date() -> {y, m, d}
 *   raining / mist (bool, read only)    monsoon showers (40% of monsoon days, one 2 h shower starting
 *                                       14:00-18:00, deterministic per date) and winter-morning mist.
 *   overlays {name: bool}               switch one overlay off (tests / perf); quality 0..1 (crowd caps)
 *   scene(cx, cy, r) -> {kites, people, props}  what the overlays show there, as data (3D view parity)
 *   layout.{numaish(), numaishState(), christmas(), bonalu(), xmasHouse(s), xmasStarAt(s), trainAt, along}
 *                                       the festival layouts as data, shared with the 3D decor (src/festivals3d.js)
 *   Every name is mirrored into N.flags[name] (true/false); N.flags.year === 2026 forces year2026.
 *   Events: 'season:change' {name, on, prev, source}, 'weather' {rain, mist}.
 *   Draws flag-driven world overlays (all culled to the view, sprite-cached, capped):
 *     sankranti   kites over every colony (strings to rooftop kids), cut kites drifting, Patang Bazaar
 *                 crowd, muggulu at gates; Bhogi (13 Jan, 04:30-08:30) bonfires, smoke and ash
 *     numaish     the fair on the Exhibition Grounds (layout(): rows of stalls - bangles, toys, Delhi papad,
 *                 Kashmiri shawls... - the food court, the toy train, a carousel, the loudspeaker mast with bulb
 *                 strings, the bulb canopy over the main lane), searchlights, crowds, loudspeaker announcements (toasts)
 *     summer      midday heat wash, chalivendram water sheds by bus stops, mango heaps at markets
 *     bonalu      processions to ujjaini_mahankali_temple, lal_darwaza_temple (+ smaller ones): women
 *                 with bonam pots, Pothuraju dancers, dappu drums, neem festoons, a thottelu tower
 *     ganesh      bulb strings by the pandals (places_art draws the pandals, landmarks the giant)
 *     ganesh_immersion  idols on lorries / tractors along Tank Bund, the giant Khairatabad idol on its
 *                 trailer, cranes lowering idols into the lake, gulal, teenmaar dancers, floodlights
 *     ramzan      green and white lights round Charminar and the bazaars, crescent cut-outs, street
 *                 haleem bhattis, the night bazaar after 20:00
 *     chand_raat  the huge joyful crowd at Charminar: bangles, mehendi, balloons, sparklers, the moon
 *     christmas   paper stars on houses (Secunderabad, Marredpally, Abids...), every church lit up with its crib and
 *                 tree just inside the gate (beside the path, never on it), carol singers at the gates in the evening
 *     prasads_open  (places_art.js swaps the fence for the cinema)
 *     year2026    the epilogue at Charminar only: wooden barricades ("closed to traffic this evening")
 *     monsoon     rain streaks and splashes while it rains; winter mist at dawn (Dec-Jan)
 *
 * ------------------------------------------------------------------ N.respect
 *   at(x, y) -> {id, name, kind, place, part: 'compound'|'forecourt', gate: {x, y}, zone} | null
 *       kind: temple | mosque | church | dargah | gurudwara | ashurkhana | tomb | charminar | procession
 *       'compound' = inside the walls (walk only, no vehicles: an invisible wall for them, no horn /
 *       radio / peels / borrowing / camera / jobs / minigames); 'forecourt' = the 30 u in front of the gate
 *       (footwear stand; the Chappal Meter is frozen, pursuers stop 40 u away and wait). Charminar's
 *       interior and processions are 'compound'. Collectibles avoid 'compound'.
 *   inside(x, y) -> bool        near(x, y, r) -> {zone, d} | null (nearest zone edge within r: the
 *                               pursuers' 40 u buffer)        distance(x, y, zone) -> u (0 inside)
 *   zones (static, from WORLD_DATA.respect) + add(zone) / remove(id) for dynamic ones
 *   procession(id, pts, r, {name}) / endProcession(id): a walk-only path (seasons.js adds the Bonalu
 *       and Ganesh immersion ones while those flags are on). Events 'respect:change'.
 * Owned files: src/worlddata.js, src/world.js, src/render.js (roof zones), src/seasons.js.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;

  /* ================================================================ calendar */
  const NAMES = ['sankranti', 'numaish', 'summer', 'bonalu', 'ganesh', 'ganesh_immersion', 'ramzan', 'chand_raat', 'christmas', 'prasads_open', 'year2026'];
  const EXTRA = ['world_cup', 'monsoon', 'eid'];
  const ALL = NAMES.concat(EXTRA);
  const ymd = (y, m, d) => y * 10000 + m * 100 + d;
  function toDate(d) {
    if (d == null) {
      try { if (N.calendar && N.calendar.date) { const c = N.calendar.date; return { y: c.y, m: c.m, d: c.d }; } } catch (e) { /* ignore */ }
      const b = (N.clock && N.clock.baseDate) || [2003, 0, 14];
      const t = new Date(Date.UTC(b[0], b[1], b[2]) + Math.round((N.clock && N.clock.day) || 0) * 86400000);
      return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
    }
    if (d instanceof Date) return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
    if (typeof d === 'string') { const r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(d.trim()); return r ? { y: +r[1], m: +r[2], d: +r[3] } : toDate(null); }
    if (Array.isArray(d)) return { y: +d[0], m: +d[1], d: +d[2] };
    if (typeof d === 'object' && isFinite(d.y) && isFinite(d.m) && isFinite(d.d)) return { y: +d.y, m: +d.m, d: +d.d };
    return toDate(null);
  }
  // 3rd Sunday of July (Lashkar Bonalu falls on a mid-Ashada Sunday; 2003: Sun 20 Jul, bible §1.4)
  function bonaluDay(y) {
    if (y === 2003) return 20;
    const first = new Date(Date.UTC(y, 6, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + 14;
  }
  /** The bible §1.4 calendar for a date: {name: bool} */
  function calendarFor(date) {
    const t = toDate(date), md = t.m * 100 + t.d, k = ymd(t.y, t.m, t.d);
    const o = {};
    o.numaish = md >= 101 && md <= 215;
    o.sankranti = md >= 113 && md <= 115;
    o.world_cup = t.y === 2003 && md >= 209 && md <= 323;
    o.summer = md >= 424 && md <= 611;
    o.monsoon = md >= 612 && md <= 930;
    o.bonalu = t.m === 7 && t.d === bonaluDay(t.y);
    o.prasads_open = k >= 20030725;
    o.ganesh = md >= 831 && md <= 909;
    o.ganesh_immersion = md === 909;
    o.ramzan = md >= 1027 && md <= 1125;
    o.chand_raat = md === 1125;
    o.eid = md === 1126;
    o.christmas = t.m === 12;
    o.year2026 = t.y >= 2026 || (N.flags && N.flags.year === 2026);
    if (o.year2026) { o.world_cup = false; } // the 2026 epilogue: nothing of 2003's seasons but the date's own
    return o;
  }

  const state = {}; for (const n of ALL) state[n] = false;
  let overrides = {}; // name -> {on, mission}
  let lastDate = null;
  const S = (N.seasons = {
    NAMES, EXTRA, ALL, state,
    get overrides() { const o = {}; for (const k in overrides) o[k] = overrides[k].on; return o; },
    overlays: {}, quality: 1, profile: false, prof: {},
    raining: false, mist: false,
    is(name) { if (name === 'rain' || name === 'raining') return !!S.raining; if (name === 'mist') return !!S.mist; return !!state[name]; },
    active() { return ALL.filter((n) => state[n]); },
    calendarFor,
    date() { return toDate(lastDate); },
    set(name, on) {
      if (ALL.indexOf(name) < 0) { N.err('seasons.set', new Error('unknown season ' + name)); return false; }
      if (on == null) delete overrides[name];
      else overrides[name] = { on: !!on, mission: (N.missions && N.missions.active && N.missions.active.id) || null };
      apply('set');
      return true;
    },
    autoFor(date) { lastDate = date == null ? null : toDate(date); apply('auto'); return S.active(); },
    refresh() { apply('refresh'); return S.active(); },
    clear(name) { if (name) delete overrides[name]; else overrides = {}; apply('clear'); },
  });
  function apply(source) {
    const cal = calendarFor(lastDate == null ? null : lastDate);
    if (N.flags && N.flags.year === 2026) cal.year2026 = true;
    for (const n in overrides) cal[n] = overrides[n].on;
    for (const n of ALL) {
      const on = !!cal[n], prev = !!state[n];
      state[n] = on;
      if (N.flags) N.flags[n] = on;
      if (on !== prev) {
        N.emit('season:change', { name: n, on, prev, source });
        try { onChange(n, on); } catch (e) { N.err('seasons.change', e); }
      }
    }
  }
  // overrides set by a mission end with it
  const endMission = () => {
    let ch = false;
    for (const n in overrides) if (overrides[n].mission) { delete overrides[n]; ch = true; }
    if (ch) apply('mission');
  };
  N.on('mission:complete', endMission); N.on('mission:fail', endMission); N.on('mission:abort', endMission);
  N.on('clock:day', () => { if (!N.calendar) { lastDate = null; apply('midnight'); } });

  /* ================================================================ respect zones */
  const RG = 128; // index cell
  const RX = {
    zones: [], dyn: [], grid: null, built: false,
  };
  function zoneBB(z) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const addR = (r) => { x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]); };
    for (const r of z.rects || []) addR(r);
    for (const r of z.forecourt || []) addR(r);
    for (const p of z.polys || []) for (const q of p) addR([q[0], q[1], 0, 0]);
    for (const l of z.lines || []) for (const q of l.pts) addR([q[0] - l.r, q[1] - l.r, l.r * 2, l.r * 2]);
    return [x0, y0, x1, y1];
  }
  function indexZones() {
    const W = N.WORLD_W || 8000, H = N.WORLD_H || 6000;
    const gw = Math.ceil(W / RG), gh = Math.ceil(H / RG);
    RX.gw = gw; RX.gh = gh;
    RX.grid = new Array(gw * gh);
    const all = RX.zones.concat(RX.dyn);
    all.forEach((z) => {
      // hit records (non-enumerable, so zones and hits stay JSON-safe)
      if (!z._hitC) {
        Object.defineProperty(z, '_hitC', { value: { id: z.id, name: z.name, kind: z.kind, place: z.place || null, part: 'compound', gate: z.gate || null }, enumerable: false });
        Object.defineProperty(z, '_hitF', { value: { id: z.id, name: z.name, kind: z.kind, place: z.place || null, part: 'forecourt', gate: z.gate || null }, enumerable: false });
        Object.defineProperty(z._hitC, 'zone', { value: z, enumerable: false });
        Object.defineProperty(z._hitF, 'zone', { value: z, enumerable: false });
      }
      if (!z.bb) Object.defineProperty(z, 'bb', { value: zoneBB(z), enumerable: false, writable: true });
      const i0 = Math.max(0, Math.floor(z.bb[0] / RG)), i1 = Math.min(gw - 1, Math.floor(z.bb[2] / RG));
      const j0 = Math.max(0, Math.floor(z.bb[1] / RG)), j1 = Math.min(gh - 1, Math.floor(z.bb[3] / RG));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const o = j * gw + i; (RX.grid[o] || (RX.grid[o] = [])).push(z); }
    });
    RX.built = true;
  }
  function ensureZones() {
    if (RX.built) return;
    const D = N.WORLD_DATA;
    RX.zones = ((D && D.respect) || []).map((z) => Object.assign({}, z));
    indexZones();
  }
  const inRect = (x, y, r) => x >= r[0] && y >= r[1] && x <= r[0] + r[2] && y <= r[1] + r[3];
  function segD2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - px, qy = ay + dy * t - py; return qx * qx + qy * qy;
  }
  function inCompound(z, x, y) {
    for (const r of z.rects || []) if (inRect(x, y, r)) return true;
    for (const p of z.polys || []) if (U.pointInPoly(x, y, p)) return true;
    for (const l of z.lines || []) for (let i = 0; i < l.pts.length - 1; i++) if (segD2(x, y, l.pts[i][0], l.pts[i][1], l.pts[i + 1][0], l.pts[i + 1][1]) <= l.r * l.r) return true;
    return false;
  }
  function distRect(x, y, r) { const dx = Math.max(r[0] - x, 0, x - r[0] - r[2]), dy = Math.max(r[1] - y, 0, y - r[1] - r[3]); return Math.hypot(dx, dy); }
  function distance(x, y, z) {
    let best = Infinity;
    for (const r of (z.rects || []).concat(z.forecourt || [])) best = Math.min(best, distRect(x, y, r));
    for (const p of z.polys || []) {
      if (U.pointInPoly(x, y, p)) return 0;
      for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; best = Math.min(best, Math.sqrt(segD2(x, y, a[0], a[1], b[0], b[1]))); }
    }
    for (const l of z.lines || []) for (let i = 0; i < l.pts.length - 1; i++) best = Math.min(best, Math.max(0, Math.sqrt(segD2(x, y, l.pts[i][0], l.pts[i][1], l.pts[i + 1][0], l.pts[i + 1][1])) - l.r));
    return best;
  }
  const RESP = (N.respect = {
    get zones() { ensureZones(); return RX.zones.concat(RX.dyn); },
    at(x, y) {
      if (!isFinite(x) || !isFinite(y)) return null;
      ensureZones();
      const i = Math.floor(x / RG), j = Math.floor(y / RG);
      if (i < 0 || j < 0 || i >= RX.gw || j >= RX.gh) return null;
      const list = RX.grid[j * RX.gw + i];
      if (!list) return null;
      let fore = null;
      for (const z of list) {
        if (x < z.bb[0] || y < z.bb[1] || x > z.bb[2] || y > z.bb[3]) continue;
        if (inCompound(z, x, y)) return z._hitC;
        if (!fore) for (const r of z.forecourt || []) if (inRect(x, y, r)) { fore = z._hitF; break; }
      }
      return fore;
    },
    inside(x, y) { return !!RESP.at(x, y); },
    distance,
    near(x, y, r) {
      ensureZones();
      const R = r || 40;
      let best = null, bd = Infinity;
      const i0 = Math.max(0, Math.floor((x - R) / RG)), i1 = Math.min(RX.gw - 1, Math.floor((x + R) / RG));
      const j0 = Math.max(0, Math.floor((y - R) / RG)), j1 = Math.min(RX.gh - 1, Math.floor((y + R) / RG));
      const seen = new Set();
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const z of RX.grid[j * RX.gw + i] || []) {
        if (seen.has(z)) continue; seen.add(z);
        if (x < z.bb[0] - R || y < z.bb[1] - R || x > z.bb[2] + R || y > z.bb[3] + R) continue;
        const d = distance(x, y, z);
        if (d <= R && d < bd) { bd = d; best = z; }
      }
      return best ? { zone: best, d: bd } : null;
    },
    add(zone) {
      if (!zone || !zone.id) return null;
      ensureZones();
      RESP.remove(zone.id, true);
      const z = Object.assign({ kind: 'procession', rects: [], polys: [], lines: [], forecourt: [] }, zone);
      RX.dyn.push(z);
      indexZones();
      N.emit('respect:change', { id: z.id, on: true });
      return z;
    },
    remove(id, silent) {
      const i = RX.dyn.findIndex((z) => z.id === id);
      if (i < 0) return false;
      RX.dyn.splice(i, 1);
      indexZones();
      if (!silent) N.emit('respect:change', { id, on: false });
      return true;
    },
    procession(id, pts, r, o) { return RESP.add(Object.assign({ id, name: (o && o.name) || 'Procession', kind: 'procession', lines: [{ pts, r: r || 14 }], gate: { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] } }, o || {})); },
    endProcession(id) { return RESP.remove(id); },
    rebuild() { RX.built = false; ensureZones(); },
  });

  /* ================================================================ drawing kit */
  let R = null, ctx = null, TIME = 0, NIGHT = 0, Z = 1;
  function frame() { R = N.render; ctx = R.ctx; TIME = (N.time && N.time.real) || 0; NIGHT = R.night || 0; Z = R.Z || 1; }
  const kh = (h) => R.k(h);
  const sxp = (x, k) => R.sx(x, k), syp = (y, k) => R.sy(y, k);
  const inView = (x, y, m) => R.inView(x, y, m || 0);
  const hsh = (a, b) => U.hash2(a * 0.731 + 0.17, b * 1.137 + 0.41);
  const reset = () => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; };
  const sfxOK = (n) => !!(N.audio && N.audio.SFX_NAMES && N.audio.SFX_NAMES.indexOf(n) >= 0);
  const sfx = (n, x, y, o) => { if (!sfxOK(n)) return; try { N.audio.sfx(n, Object.assign({ x, y }, o || {})); } catch (e) { /* audio is optional */ } };
  const toast = (t, ms) => { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 4200); } catch (e) { /* hud optional */ } };
  const quality = () => U.clamp(S.quality == null ? 1 : S.quality, 0.2, 1);
  function placeXY(id) { const p = N.places && N.places[id]; return p ? p : null; }

  // ---- people: cached top-down sprites (8 directions x 5 frames per look)
  const SPR_U = 22, SPR_PX = 2;
  const LOOKS = [];
  const lookIdx = {};
  function defLook(name, look) { lookIdx[name] = LOOKS.length; LOOKS.push(look); return LOOKS.length - 1; }
  let looksReady = false;
  function makeLooks() {
    if (looksReady || !N.people) return;
    looksReady = true;
    const rl = N.people.randomLook;
    for (let i = 0; i < 26; i++) defLook('crowd' + i, rl(U.rng('seasons:crowd:' + i)));
    for (let i = 0; i < 6; i++) defLook('kid' + i, rl(U.rng('seasons:kid:' + i), 'kid'));
    const SAREES = ['#f2c230', '#3a9a3a', '#d8402a', '#e8742a', '#c03a8a', '#2a5cb8'];
    for (let i = 0; i < 6; i++) defLook('bonam' + i, { kind: 'saree', skin: ['#8a5a32', '#a0683f', '#7a4a2a'][i % 3], hair: '#1a1412', shirt: SAREES[(i + 2) % 6], saree: SAREES[i], border: '#f2c230', pants: '#3a2a20' });
    defLook('pothuraju', { kind: 'man', skin: '#d8a028', hair: '#1a1412', shirt: '#d8a028', pants: '#c8202a' });
    defLook('drummer', { kind: 'man', skin: '#8a5a32', hair: '#1a1412', shirt: '#efe9dc', pants: '#2a2a2a', cap: null });
    defLook('dancer', { kind: 'man', skin: '#a0683f', hair: '#1a1412', shirt: '#e83a8a', pants: '#2a3a6a' });
    defLook('dancer2', { kind: 'man', skin: '#8a5a32', hair: '#1a1412', shirt: '#f08a24', pants: '#efe9dc' });
    defLook('topi', { kind: 'man', skin: '#a0683f', hair: '#1a1412', shirt: '#f4f2ea', pants: '#f4f2ea', cap: 'topi' });
    defLook('burqa', { kind: 'burqa', skin: '#a0683f', hair: '#1a1412', shirt: '#141216', pants: '#141216' });
    defLook('caroler', { kind: 'woman', skin: '#8a5a32', hair: '#1a1412', shirt: '#efe9dc', pants: '#b22b2b', dupatta: '#b22b2b' });
    defLook('police', { kind: 'police', skin: '#8a5a32', hair: '#1a1412', shirt: '#efe9dc', pants: '#a08a5a', cap: 'police' });
  }
  const sprCache = new Map();
  function personSprite(li, dir, fr) {
    const key = li * 64 + dir * 8 + fr;
    let c = sprCache.get(key);
    if (c) return c;
    c = N.render.makeCanvas(SPR_U * SPR_PX, SPR_U * SPR_PX);
    const g = c.getContext('2d');
    const a = (dir / 8) * TAU, ca = Math.cos(a) * SPR_PX, sa = Math.sin(a) * SPR_PX;
    g.setTransform(ca, sa, -sa, ca, c.width / 2, c.height / 2);
    try { N.people.draw(g, LOOKS[li], fr === 0 ? { phase: 0, speed: 0 } : { phase: (fr - 1) * (Math.PI / 2) + 0.4, speed: 1 }); } catch (e) { N.err('seasons.sprite', e); }
    sprCache.set(key, c);
    return c;
  }
  /** a crowd person at (x, y), standing on height h (0 = ground) */
  function person(x, y, h, li, angle, fr) {
    if (!looksReady) { makeLooks(); if (!looksReady) return; }
    const k = kh(h + 8);
    const dir = ((Math.round((angle / TAU) * 8) % 8) + 8) % 8;
    const c = personSprite(li % LOOKS.length, dir, fr | 0);
    const s = SPR_U * k;
    ctx.drawImage(c, sxp(x, k) - s / 2, syp(y, k) - s / 2, s, s);
  }
  // a person's simple contact shadow (batched by the callers into one path)
  function shadowDot(x, y, h, r) { const k = kh(h); const X = sxp(x + 0.8, k), Y = syp(y + 1, k), rr = (r || 3.2) * k; ctx.moveTo(X + rr, Y); ctx.ellipse(X, Y, rr, rr * 0.8, 0, 0, TAU); }

  // ---- kites (cached diamond sprites by colour)
  const KCOL = ['#e83a5a', '#2a5cb8', '#f2c230', '#3a9a3a', '#f08a24', '#7a3a8a', '#efe9dc', '#d8202a', '#20a0b0', '#ff7ab0'];
  const kiteCache = new Map();
  function kiteSprite(ci, half) {
    const key = ci * 2 + (half ? 1 : 0);
    let c = kiteCache.get(key);
    if (c) return c;
    c = N.render.makeCanvas(24, 30);
    const g = c.getContext('2d');
    g.translate(12, 12);
    const col = KCOL[ci % KCOL.length], col2 = KCOL[(ci + 3) % KCOL.length];
    g.fillStyle = 'rgba(30,20,20,0.55)';
    g.beginPath(); g.moveTo(0, -11.5); g.lineTo(9.5, 0); g.lineTo(0, 11.5); g.lineTo(-9.5, 0); g.closePath(); g.fill();
    g.fillStyle = col;
    g.beginPath(); g.moveTo(0, -10); g.lineTo(8, 0); g.lineTo(0, 10); g.lineTo(-8, 0); g.closePath(); g.fill();
    if (half) { g.fillStyle = col2; g.beginPath(); g.moveTo(0, -10); g.lineTo(8, 0); g.lineTo(0, 10); g.closePath(); g.fill(); }
    else { g.fillStyle = col2; g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(60,40,20,0.7)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(0, -10); g.lineTo(0, 10); g.moveTo(-7, -1); g.quadraticCurveTo(0, -5, 7, -1); g.stroke();
    g.fillStyle = col2; g.beginPath(); g.moveTo(0, 10); g.lineTo(-3, 17); g.lineTo(3, 17); g.closePath(); g.fill(); // tail
    kiteCache.set(key, c);
    return c;
  }
  function kite(x, y, h, ci, size, tilt, half) {
    const k = kh(h), X = sxp(x, k), Y = syp(y, k), s = size * k;
    const c = kiteSprite(ci, half);
    ctx.setTransform(Math.cos(tilt), Math.sin(tilt), -Math.sin(tilt), Math.cos(tilt), X, Y);
    ctx.drawImage(c, -s * 0.5, -s * 0.5, s, s * 1.25);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---- bulb strings: collected per frame, drawn in one go per colour
  const bulbs = { list: [], n: 0 };
  function bulb(x, y, h, col, glow) {
    let b = bulbs.list[bulbs.n];
    if (!b) { b = bulbs.list[bulbs.n] = { x: 0, y: 0, h: 0, col: '', glow: 0 }; }
    b.x = x; b.y = y; b.h = h; b.col = col; b.glow = glow || 0; bulbs.n++;
  }
  /** a sagging string of n bulbs from (x0, y0, h0) to (x1, y1, h1) */
  function bulbString(x0, y0, h0, x1, y1, h1, n, cols, sag, phase) {
    const lit = NIGHT > 0.15;
    for (let i = 0; i <= n; i++) {
      const t = i / n, s = Math.sin(t * Math.PI) * (sag || 3);
      const col = cols[(i + ((phase || 0) | 0)) % cols.length];
      bulb(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, h0 + (h1 - h0) * t - s, col, lit ? 1 : 0);
    }
  }
  function wire(x0, y0, h0, x1, y1, h1, sag, col) {
    const n = 8;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n, h = h0 + (h1 - h0) * t - Math.sin(t * Math.PI) * (sag || 3), k = kh(h);
      const X = sxp(x0 + (x1 - x0) * t, k), Y = syp(y0 + (y1 - y0) * t, k);
      if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
    }
    ctx.strokeStyle = col || 'rgba(40,36,40,0.55)'; ctx.lineWidth = 0.5; ctx.stroke();
  }
  function flushBulbs() {
    if (!bulbs.n) return;
    const byCol = new Map();
    for (let i = 0; i < bulbs.n; i++) { const b = bulbs.list[i]; let a = byCol.get(b.col); if (!a) byCol.set(b.col, a = []); a.push(b); }
    const lit = NIGHT > 0.15;
    const blink = Math.floor(TIME * 3);
    for (const [col, arr] of byCol) {
      ctx.fillStyle = lit ? col : R.shaded(col, 0.62);
      ctx.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (lit && ((i + blink) % 7 === 0)) continue; // chase twinkle
        const k = kh(b.h), X = sxp(b.x, k), Y = syp(b.y, k), r = Math.max(0.7, 0.6 * k);
        ctx.rect(X - r, Y - r, r * 2, r * 2);
      }
      ctx.fill();
    }
    bulbs.n = 0;
  }
  const glowCache = new Map();
  function glowSprite(col) {
    let c = glowCache.get(col);
    if (c) return c;
    c = N.render.makeCanvas(32, 32);
    const g = c.getContext('2d'), rgb = U.hexToRgb(col);
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(' + rgb.join(',') + ',0.85)'); gr.addColorStop(0.35, 'rgba(' + rgb.join(',') + ',0.32)'); gr.addColorStop(1, 'rgba(' + rgb.join(',') + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    glowCache.set(col, c);
    return c;
  }
  function flushBulbGlow() { // on the light layer: a soft additive bloom per glow point at night
    if (!bulbs.glowN || NIGHT < 0.15) { bulbs.glowN = 0; return; }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(0.85, NIGHT);
    for (let i = 0; i < bulbs.glowN; i++) {
      const b = bulbs.glow[i];
      const k = kh(b.h), X = sxp(b.x, k), Y = syp(b.y, k), r = 7 * k;
      ctx.drawImage(glowSprite(b.col), X - r, Y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    bulbs.glowN = 0;
  }
  bulbs.glow = []; bulbs.glowN = 0;
  function glowAt(x, y, h, col) { if (NIGHT < 0.15 || bulbs.glowN > 260) return; let g = bulbs.glow[bulbs.glowN]; if (!g) g = bulbs.glow[bulbs.glowN] = { x: 0, y: 0, h: 0, col: '' }; g.x = x; g.y = y; g.h = h; g.col = col; bulbs.glowN++; }
  function light(x, y, r, col, inten, h) { if (NIGHT < 0.05) return; if (R.lights.length > 220) return; R.lights.push({ x, y, r, color: col, intensity: inten == null ? 0.9 : inten, h: h || 0 }); }

  // ---- particles (gulal, smoke, ash, sparks, splashes, rain splashes)
  const PMAX = 420;
  const parts = [];
  function puff(x, y, h, vx, vy, vh, life, size, col, kind) {
    if (parts.length >= PMAX) return;
    parts.push({ x, y, h, vx, vy, vh, t: 0, life, size, col, kind: kind || 0 });
  }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.h += p.vh * dt;
      if (p.kind === 1) { p.vh -= 30 * dt; if (p.h < 0) { p.h = 0; p.vh = 0; p.vx *= 0.5; p.vy *= 0.5; } } // sparks / splashes fall
      else { p.vx *= 1 - dt * 0.6; p.vy *= 1 - dt * 0.6; p.size += dt * (p.kind === 2 ? 5 : 2.4); } // smoke / powder grow
    }
  }
  function drawParts() {
    if (!parts.length) return;
    const v = R.view;
    for (const p of parts) {
      if (p.x < v.x0 - 40 || p.x > v.x1 + 40 || p.y < v.y0 - 40 || p.y > v.y1 + 40) continue;
      const k = kh(p.h), X = sxp(p.x, k), Y = syp(p.y, k), a = 1 - p.t / p.life;
      ctx.globalAlpha = p.kind === 1 ? a : a * 0.55;
      ctx.fillStyle = p.col;
      if (p.kind === 1) { const s = Math.max(0.8, p.size * k); ctx.fillRect(X - s / 2, Y - s / 2, s, s); }
      else { ctx.beginPath(); ctx.arc(X, Y, Math.max(0.8, p.size * k), 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  // ---- paths along roads (processions): back along the road network from a temple gate.
  // Walks away from the gate along the nearest road, hopping onto a connected road at each end,
  // until `len` u are collected; returns points from the far end to the gate.
  function roadPathTo(gx, gy, len) {
    const W = N.world, D = N.WORLD_DATA;
    if (!W || !W.nearestRoadPoint || !D) return null;
    const rp = W.nearestRoadPoint(gx, gy, (r) => r.kind !== 'path');
    if (!rp || !rp.road) return null;
    const out = [[gx, gy], [rp.x, rp.y]];
    let acc = Math.hypot(rp.x - gx, rp.y - gy);
    let road = rp.road, pts = road.pts;
    // pick the direction with more road
    let la = 0, lb = 0;
    for (let i = 0; i < rp.seg; i++) la += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    for (let i = rp.seg + 1; i < pts.length - 1; i++) lb += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    let dir = lb >= la ? 1 : -1, i = dir > 0 ? rp.seg + 1 : rp.seg;
    const used = new Set([road.id]);
    for (let hop = 0; hop < 4 && acc < len; hop++) {
      let px = out[out.length - 1][0], py = out[out.length - 1][1];
      for (; i >= 0 && i < pts.length && acc < len; i += dir) {
        const d = Math.hypot(pts[i][0] - px, pts[i][1] - py);
        if (acc + d > len) { const t = (len - acc) / d; out.push([px + (pts[i][0] - px) * t, py + (pts[i][1] - py) * t]); acc = len; break; }
        out.push([pts[i][0], pts[i][1]]); acc += d; px = pts[i][0]; py = pts[i][1];
      }
      if (acc >= len) break;
      // continue on another road touching this end (a street or lane, not a highway if possible)
      let best = null, bd = Infinity;
      for (const r of D.roads) {
        if (used.has(r.id) || r.kind === 'path' || r.kind === 'bridge') continue;
        const q0 = r.pts[0], q1 = r.pts[r.pts.length - 1];
        for (const [q, d0] of [[q0, 1], [q1, -1]]) {
          const dd = Math.hypot(q[0] - px, q[1] - py) - (r.kind === 'arterial' ? 0 : 20);
          if (dd < r.w / 2 + 14 && dd < bd) { bd = dd; best = { r, d0 }; }
        }
      }
      if (!best) break;
      road = best.r; pts = road.pts; used.add(road.id); dir = best.d0; i = dir > 0 ? 1 : pts.length - 2;
    }
    return out.reverse();
  }
  function polyLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
  function along(pts, d, out) {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + l >= d || i === pts.length - 1) {
        const t = l ? U.clamp((d - acc) / l, 0, 1) : 0;
        out.x = a[0] + (b[0] - a[0]) * t; out.y = a[1] + (b[1] - a[1]) * t; out.a = Math.atan2(b[1] - a[1], b[0] - a[0]);
        return out;
      }
      acc += l;
    }
    out.x = pts[0][0]; out.y = pts[0][1]; out.a = 0; return out;
  }
  const tmpP = { x: 0, y: 0, a: 0 };

  /* ================================================================ overlay registry */
  const OV = {}; // name -> {active(), init?(), update?(dt), draw?(), off?()}
  function ov(name, def) { OV[name] = def; }
  function onChange(name, on) {
    const o = OV[name];
    if (o) { if (!on && o.off) o.off(); if (on && o.on) o.on(); }
    if (name === 'ganesh_immersion') immersionLandmark(on);
    if (name === 'chand_raat' || name === 'ramzan') { /* landmarks.js reads the flags itself */ }
  }
  let lmGaneshSet = false;
  function immersionLandmark(on) { // the giant leaves its pandal on immersion day (landmarks.js draws the pandal)
    const L = N.landmarks;
    if (!L || !L.fx) return;
    if (on && L.fx.ganesh == null) { L.fx.ganesh = false; lmGaneshSet = true; }
    else if (!on && lmGaneshSet) { L.fx.ganesh = null; lmGaneshSet = false; }
  }
  const enabled = (n) => state[n] && S.overlays[n] !== false;
  const W = () => N.world;

  /* ---------------------------------------------------------------- SANKRANTI */
  // kites over every colony roof in view (deterministic per building), kids on the roofs holding
  // the strings, high kites everywhere, cut kites drifting down; Bhogi fires at dawn on 13 Jan.
  const KITE_STYLES = { colony: 1, oldcity: 1, market: 1, rocky: 1, cantonment: 0.4, posh: 0.6, colonial: 0.3, hitec: 0 };
  const sank = { anchors: [], free: [], cut: [], cutT: 0, fires: null };
  function collectAnchors(maxN) {
    const v = R.view, out = sank.anchors;
    out.length = 0;
    const wind = Math.sin(TIME * 0.05) * 0.4 - 2.3; // wind from the lake (east-north-east)
    sank.wx = Math.cos(wind); sank.wy = Math.sin(wind);
    W().queryStructures(v.x0 - 160, v.y0 - 160, v.x1 + 160, v.y1 + 160, (s) => {
      if (out.length >= maxN || s.t !== 'bldg' || s.roofType !== 'flat' || s.h < 9) return;
      const p = KITE_STYLES[s.style]; if (!p) return;
      const hv = hsh(s.x, s.y);
      if (hv > 0.5 * p) return;
      out.push(s);
    });
    return out;
  }
  function kitePos(s, out) {
    const hv = hsh(s.y, s.x), L = 26 + hv * 44, ph = hv * 40;
    out.ax = s.x + s.w * (0.3 + 0.4 * hv); out.ay = s.y + s.d * (0.35 + 0.3 * hsh(s.x, 3));
    out.x = out.ax + sank.wx * L + Math.sin(TIME * (0.6 + hv * 0.5) + ph) * (5 + hv * 6);
    out.y = out.ay + sank.wy * L + Math.cos(TIME * (0.45 + hv * 0.4) + ph) * 4;
    out.h = Math.min(78, s.h + 22 + hv * 30) + Math.sin(TIME * 0.8 + ph) * 2;
    out.ci = (hv * 997) | 0; out.half = hv > 0.6; out.tilt = Math.sin(TIME * 1.3 + ph) * 0.35;
    return out;
  }
  const kp = { ax: 0, ay: 0, x: 0, y: 0, h: 0, ci: 0, half: false, tilt: 0 };
  ov('sankranti', {
    update(dt) {
      // cut kites: one every few seconds detaches and drifts down
      sank.cutT -= dt;
      if (sank.cutT <= 0 && sank.anchors.length && sank.cut.length < 4) {
        sank.cutT = 3 + Math.random() * 5;
        const s = sank.anchors[(Math.random() * sank.anchors.length) | 0];
        kitePos(s, kp);
        sank.cut.push({ x: kp.x, y: kp.y, h: kp.h, ci: kp.ci, half: kp.half, vx: sank.wx * 14, vy: sank.wy * 14, t: 0 });
      }
      for (let i = sank.cut.length - 1; i >= 0; i--) {
        const c = sank.cut[i]; c.t += dt;
        c.x += c.vx * dt + Math.sin(c.t * 2.1) * 9 * dt; c.y += c.vy * dt; c.h -= 3.2 * dt;
        if (c.h < 8 || c.t > 40) sank.cut.splice(i, 1);
      }
    },
    draw() {
      const q = quality();
      const anchors = collectAnchors(Math.round(50 * q));
      // kids on the roofs (after their building), the strings and kites in the sky
      let kids = 0;
      for (const s of anchors) {
        if (kids >= 28 * q) break;
        kids++;
        const ss = s;
        R.queue('structures', R.distKey(s.cx, s.cy), () => {
          frame();
          kitePos(ss, kp);
          const hv = hsh(ss.x, ss.y);
          person(kp.ax, kp.ay, ss.h, lookIdx['kid' + ((hv * 6) | 0)] || 0, Math.atan2(kp.y - kp.ay, kp.x - kp.ax), 0);
          if (hv < 0.12) person(kp.ax - 4, kp.ay + 3, ss.h, lookIdx['crowd' + ((hv * 260) | 0) % 26] || 0, Math.atan2(kp.y - kp.ay, kp.x - kp.ax), 0);
        });
      }
      R.queue('sky', 2, () => {
        frame();
        ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(255,250,240,0.7)';
        ctx.beginPath();
        for (const s of anchors) {
          kitePos(s, kp);
          const k0 = kh(s.h + 9), k1 = kh(kp.h);
          const ax = sxp(kp.ax, k0), ay = syp(kp.ay, k0), bx = sxp(kp.x, k1), by = syp(kp.y, k1);
          ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2 + 2, (ay + by) / 2 + 6, bx, by);
        }
        ctx.stroke();
        for (const s of anchors) { kitePos(s, kp); kite(kp.x, kp.y, kp.h, kp.ci, 11, kp.tilt, kp.half); }
        // more kites all over the sky (their flyers are out of sight): a world-anchored grid, so
        // they stay put while the camera moves
        const v = R.view, G = 115;
        const i0 = Math.floor(v.x0 / G) - 1, i1 = Math.floor(v.x1 / G) + 1, j0 = Math.floor(v.y0 / G) - 1, j1 = Math.floor(v.y1 / G) + 1;
        let n = 0;
        for (let j = j0; j <= j1 && n < 70 * q; j++) for (let i = i0; i <= i1; i++) {
          const hv = hsh(i * 3.1, j * 1.7);
          if (hv > 0.72) continue;
          n++;
          const x = i * G + hsh(i, j) * G + Math.sin(TIME * 0.4 + hv * 9) * 6, y = j * G + hsh(j, i) * G + Math.cos(TIME * 0.33 + hv * 7) * 5;
          kite(x, y, 62 + hv * 30, (hv * 991) | 0, 9, Math.sin(TIME * 0.9 + hv * 20) * 0.45, hv > 0.4);
        }
        for (const c of sank.cut) kite(c.x, c.y, c.h, c.ci, 11, Math.sin(c.t * 3) * 0.9, c.half);
        reset();
      });
      // Patang Bazaar crowd
      crowdDraw('patang', 'patang_bazaar', 14, 46, { looks: 'crowd', hours: [7 * 60, 21 * 60] });
      // muggulu at colony gates (ground layer, cheap)
      R.queue('ground', 3, drawMuggulu);
      // Bhogi: 13 Jan, dawn
      const d = S.date();
      if (d.m === 1 && d.d === 13 && N.clock.minutes > 270 && N.clock.minutes < 510) drawBhogi();
    },
    off() { sank.cut.length = 0; },
  });
  function drawMuggulu(c) {
    frame();
    const v = R.view;
    let n = 0;
    ctx.strokeStyle = 'rgba(250,250,245,0.85)'; ctx.lineWidth = Math.max(0.6, 0.4 * Z);
    const k = Z;
    W().queryStructures(v.x0, v.y0, v.x1, v.y1, (s) => {
      if (n > 16 || s.t !== 'bldg' || (s.style !== 'colony' && s.style !== 'rocky') || !s.front) return;
      if (hsh(s.cx, s.cy) > 0.45) return;
      const f = s.front, off = 6;
      const x = f === 'W' ? s.x - off : f === 'E' ? s.x + s.w + off : s.cx;
      const y = f === 'N' ? s.y - off : f === 'S' ? s.y + s.d + off : s.cy;
      if (!N.world.isWalkable(x, y) || N.world.surfaceAt(x, y) === N.SURF.ROAD) return;
      n++;
      const X = sxp(x, k), Y = syp(y, k), r = 3.2 * k;
      ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.785; ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(a) * r, Y + Math.sin(a) * r); }
      ctx.stroke();
      ctx.fillStyle = ['#e83a5a', '#f2c230', '#3a9a3a', '#2a5cb8'][(hsh(s.x, 1) * 4) | 0];
      ctx.beginPath(); ctx.arc(X, Y, 1.1 * k, 0, TAU); ctx.fill();
    });
    reset();
  }
  function drawBhogi() {
    if (!sank.fires) {
      sank.fires = [];
      for (const id of Object.keys(N.places || {})) {
        const p = N.places[id];
        if (p.kind === 'playground' || id === 'home' || p.kind === 'school') sank.fires.push({ x: p.x + 14, y: p.y + 6, ph: hsh(p.x, p.y) * 10 });
      }
    }
    for (const f of sank.fires) {
      if (!inView(f.x, f.y, 60)) continue;
      const ff = f;
      if (Math.random() < 0.25) puff(f.x + (Math.random() - 0.5) * 4, f.y + (Math.random() - 0.5) * 4, 6, -6 + Math.random() * 4, -4 + Math.random() * 3, 9 + Math.random() * 5, 3.5, 2, '#8a8680', 2);
      if (Math.random() < 0.08) puff(f.x, f.y, 4, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 14, 2.4, 0.6, '#ffb040', 1); // ash / sparks
      light(f.x, f.y, 70, '#ff8a30', 0.95, 4);
      R.queue('actors', f.y, () => {
        frame();
        // a ring of people warming their hands
        for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + ff.ph; person(ff.x + Math.cos(a) * 9, ff.y + Math.sin(a) * 9, 0, lookIdx['crowd' + ((i * 5 + (ff.ph | 0)) % 26)] || 0, a + Math.PI, 0); }
        // logs and the flames
        const k = kh(1);
        ctx.strokeStyle = '#5a3a24'; ctx.lineWidth = 1.4 * k; ctx.beginPath();
        for (let i = 0; i < 4; i++) { const a = i * 0.8 + ff.ph; ctx.moveTo(sxp(ff.x - Math.cos(a) * 4, k), syp(ff.y - Math.sin(a) * 4, k)); ctx.lineTo(sxp(ff.x + Math.cos(a) * 4, k), syp(ff.y + Math.sin(a) * 4, k)); }
        ctx.stroke();
        for (let i = 0; i < 5; i++) {
          const fl = Math.sin(TIME * 9 + i * 1.7 + ff.ph) * 0.5 + 0.5, hh = 4 + fl * 6 + i;
          const kk = kh(hh), X = sxp(ff.x + Math.sin(i * 2.1) * 2, kk), Y = syp(ff.y + Math.cos(i * 1.3) * 2, kk);
          ctx.fillStyle = i < 2 ? '#ffd040' : i < 4 ? '#ff8a20' : '#e8401a';
          ctx.beginPath(); ctx.arc(X, Y, (3.2 - i * 0.4) * kk, 0, TAU); ctx.fill();
        }
      });
    }
  }

  /* ---------------------------------------------------------------- crowds */
  // A crowd is a set of people wandering round a centre (a place or a point), with a radius.
  // Built lazily, updated only near the camera, drawn as cached sprites on 'actors'.
  const crowds = {};
  function getCrowd(key, cx, cy, n, rad, o) {
    let c = crowds[key];
    if (c && c.n === n) return c;
    makeLooks();
    c = crowds[key] = { key, cx, cy, n, rad, people: [], o: o || {} };
    const rng = U.rng('crowd:' + key);
    const looks = (o && o.lookList) || null, avoid = o && o.avoid;
    for (let i = 0; i < n; i++) {
      let a = rng.next() * TAU, d = Math.sqrt(rng.next()) * rad;
      for (let tries = 0; avoid && tries < 6 && avoid(cx + Math.cos(a) * d, cy + Math.sin(a) * d); tries++) { a = rng.next() * TAU; d = Math.sqrt(rng.next()) * rad; }
      const li = looks ? looks[i % looks.length] : (lookIdx['crowd' + ((rng.next() * 26) | 0)] || 0);
      const fa = o && o.faceA != null ? o.faceA + (rng.next() - 0.5) * 0.5 : rng.next() * TAU;
      c.people.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, a: fa, li, tx: 0, ty: 0, wait: rng.next() * 4, ph: rng.next() * 10, sp: 8 + rng.next() * 10, stand: rng.next() < (o && o.standP != null ? o.standP : 0.4) });
    }
    return c;
  }
  function updateCrowd(c, dt) {
    if (!inView(c.cx, c.cy, c.rad + 200)) return;
    const W = N.world;
    for (const p of c.people) {
      if (p.stand) { p.ph += dt; continue; }
      if (p.wait > 0) { p.wait -= dt; continue; }
      if (!p.tx) { const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * c.rad; p.tx = c.cx + Math.cos(a) * d; p.ty = c.cy + Math.sin(a) * d; }
      const dx = p.tx - p.x, dy = p.ty - p.y, l = Math.hypot(dx, dy);
      if (l < 3) { p.tx = 0; p.wait = 1 + Math.random() * 5; continue; }
      const nx = p.x + (dx / l) * p.sp * dt, ny = p.y + (dy / l) * p.sp * dt;
      if ((W && W.isWalkable && !W.isWalkable(nx, ny)) || (c.o.avoid && c.o.avoid(nx, ny))) { p.tx = 0; p.wait = 0.5; continue; }
      p.x = nx; p.y = ny; p.a = Math.atan2(dy, dx); p.ph += dt * p.sp * 0.25;
    }
  }
  function drawCrowd(c, count, extra) {
    const v = R.view;
    const n = Math.min(c.people.length, count == null ? c.people.length : count);
    // sort-free: draw back to front by y would cost; crowds are dense and short, draw in y order once in a while
    if (!c._sortT || TIME - c._sortT > 0.5) { c.people.sort((a, b) => a.y - b.y); c._sortT = TIME; }
    ctx.fillStyle = 'rgba(26,16,32,0.25)'; ctx.beginPath();
    for (let i = 0; i < n; i++) { const p = c.people[i]; if (p.x < v.x0 - 10 || p.x > v.x1 + 10 || p.y < v.y0 - 10 || p.y > v.y1 + 10) continue; shadowDot(p.x, p.y, 0, 3); }
    ctx.fill();
    ctx.imageSmoothingEnabled = true;
    for (let i = 0; i < n; i++) {
      const p = c.people[i];
      if (p.x < v.x0 - 10 || p.x > v.x1 + 10 || p.y < v.y0 - 10 || p.y > v.y1 + 10) continue;
      const moving = !p.stand && p.wait <= 0 && p.tx;
      const fr = moving ? 1 + (Math.floor(p.ph) % 4) : 0;
      const ang = p.stand ? p.a + Math.sin(TIME * 0.7 + p.ph) * (c.o.faceA != null ? 0.15 : 0.4) : p.a;
      person(p.x, p.y, 0, p.li, ang, fr);
      if (extra) extra(p, i);
    }
    ctx.imageSmoothingEnabled = false;
  }
  /** helper: a wandering crowd round a place (open hours [from, to] in minutes) */
  function crowdDraw(key, placeId, n, rad, o) {
    const p = o && o.at ? { x: o.at[0], y: o.at[1] } : placeXY(placeId);
    if (!p || !inView(p.x, p.y, rad + 40)) return null;
    const c = getCrowd(key, p.x + ((o && o.dx) || 0), p.y + ((o && o.dy) || 0), n, rad, o);
    let count = n;
    if (o && o.hours) { const m = N.clock.minutes; if (m < o.hours[0] || m > o.hours[1]) count = Math.round(n * 0.25); }
    const cc = c;
    R.queue('actors', cc.cy, () => { frame(); drawCrowd(cc, Math.round(count * quality()), o && o.extra); });
    return c;
  }

  /* ---------------------------------------------------------------- NUMAISH */
  const NUM_LINES = [
    'NUMAISH LOUDSPEAKER: "Attention please! A small boy, red sweater, answers to Pappu, is waiting at the enquiry counter with his ice cream."',
    'NUMAISH LOUDSPEAKER: "Lost and found! One left chappal, size 4, blue strap. The right one is very worried."',
    'NUMAISH LOUDSPEAKER: "Mr. Srinivas from Warangal, your family is waiting at Gate No. 2. They have finished the Delhi papad."',
    'NUMAISH LOUDSPEAKER: "Parents, please hold your children\'s hands near the giant wheel. Children, please hold your parents\' hands also."',
    'NUMAISH LOUDSPEAKER: "Found: one bunch of house keys with a Hanuman key-ring. Please collect at the enquiry counter."',
    'NUMAISH LOUDSPEAKER: "The maut ka kuan show starts in ten minutes. Brave people only. Others, please eat bhel puri."',
    'NUMAISH LOUDSPEAKER: "Little Ayesha from Tolichowki is looking for her Abba. Abba, she says come fast, she is getting bored."',
  ];
  const num = { L: null, ann: 25, annI: 0, train: 0, car: 0, beam: 0, open: false };
  function numaishGrounds() {
    const D = N.WORLD_DATA, pk = D && D.parks && D.parks.find((p) => p.id === 'exhibition_grounds');
    if (!pk) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of pk.poly) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    return [x0, y0, x1, y1];
  }
  // The fair's layout (shared with the 3D view, src/festivals3d.js): rows of stalls round the grounds, the food court,
  // the toy train loop, a carousel, the loudspeaker mast with bulb strings radiating out, searchlights, the enquiry booth.
  // Placed relative to the exhibition_grounds polygon, clear of the landmarks (gate, giant wheel, maut ka kuan, the two
  // numaish_stalls rows) and of the hidden collectible behind the wheel.
  const NUM_KINDS = ['bangles', 'toys', 'papad', 'shawls', 'dryfruit', 'pickles', 'crockery', 'khadi', 'pearls', 'carpets', 'books', 'petha'];
  const NUM_NAMES = { bangles: 'BANGLES', toys: 'TOYS', papad: 'DELHI PAPAD', shawls: 'KASHMIRI SHAWLS', dryfruit: 'DRY FRUITS', pickles: 'PICKLES', crockery: 'CROCKERY', khadi: 'KHADI', pearls: 'PEARLS', carpets: 'CARPETS', books: 'BOOKS', petha: 'AGRA PETHA',
    chaat: 'DILLI CHAAT', pavbhaji: 'PAV BHAJI', kulfi: 'KULFI', bhutta: 'BHUTTA', candy: 'COTTON CANDY' };
  const NUM_COLS = ['#d8302a', '#2a5cb8', '#f2b820', '#1f9a8a', '#c8307a', '#e8641a', '#7a3db8', '#2a9a3a'];
  function numaishLayout() {
    if (num.L) return num.L;
    const g = numaishGrounds(); if (!g) return null;
    const [x0, y0, x1, y1] = g;
    const L = { g, stalls: [], counters: [], tables: [], strings: [], avoid: [], pools: [] };
    // a row of stalls with their backs on the line from (ax, ay) along (dx, dy); fronts face (nx, ny)
    const row = (ax, ay, dx, dy, n, len, dep, nx, ny, k0, list, kinds) => {
      for (let i = 0; i < n; i++) {
        const u0 = i * len, cx = ax + dx * (u0 + len / 2) + nx * dep / 2, cy = ay + dy * (u0 + len / 2) + ny * dep / 2;
        const w = Math.abs(dx) * (len - 0.8) + Math.abs(nx) * dep, d = Math.abs(dy) * (len - 0.8) + Math.abs(ny) * dep;
        const kind = kinds ? kinds[i % kinds.length] : NUM_KINDS[(k0 + i * 5) % NUM_KINDS.length];
        list.push({ x: cx - w / 2, y: cy - d / 2, w, d, cx, cy, nx, ny, kind, name: NUM_NAMES[kind] || kind.toUpperCase(), col: NUM_COLS[(k0 + i * 3) % NUM_COLS.length], len: len - 0.8, dep });
      }
      const ex = ax + dx * n * len + nx * dep, ey = ay + dy * n * len + ny * dep;
      L.avoid.push([Math.min(ax, ex) - 1, Math.min(ay, ey) - 1, Math.abs(ex - ax) + 2, Math.abs(ey - ay) + 2]);
      // a bulb string along the canopy fronts, and the warm spill of the stall lights on the aisle
      const fx0 = ax + nx * (dep + 1.4), fy0 = ay + ny * (dep + 1.4);
      if (n > 4) L.pools.push({ x: fx0 + dx * n * len / 2 + nx * 7, y: fy0 + dy * n * len / 2 + ny * 7, r: Math.max(26, n * len * 0.5), col: '#ffd890', i: 0.7 });
      L.strings.push({ x0: fx0, y0: fy0, h0: 7.6, x1: fx0 + dx * n * len, y1: fy0 + dy * n * len, h1: 7.6, sag: 0.8, n: Math.round(n * len / 2.2) });
    };
    row(x0 + 73, y0 + 3, 1, 0, 6, 10.5, 10, 0, 1, 0, L.stalls);    // north row, facing the food court
    row(x0 + 2, y0 + 36, 0, 1, 8, 11, 10, 1, 0, 3, L.stalls);      // west row, facing the giant wheel
    row(x0 + 12, y1 - 2, 1, 0, 8, 11, 9, 0, -1, 7, L.stalls);      // south row, facing the toy train
    // the food court: counters along its north side, tables with plastic chairs in front
    const fc = { x: x0 + 77, y: y0 + 37, w: 52, d: 44 };
    L.food = fc;
    row(fc.x + 1, fc.y, 1, 0, 4, 12.5, 6, 0, 1, 2, L.counters, ['chaat', 'pavbhaji', 'kulfi', 'candy']);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) L.tables.push({ x: fc.x + 10 + i * 16, y: fc.y + 20 + j * 14, col: NUM_COLS[(i + j * 3 + 1) % NUM_COLS.length] });
    for (const t of L.tables) L.avoid.push([t.x - 3.5, t.y - 3.5, 7, 7]);
    // food court strings (a square round it + a cross) and its glow
    const fx0 = fc.x + 2, fy0 = fc.y + 9, fx1 = fc.x + fc.w - 2, fy1 = fc.y + fc.d - 2;
    for (const q of [[fx0, fy0, fx1, fy0], [fx1, fy0, fx1, fy1], [fx1, fy1, fx0, fy1], [fx0, fy1, fx0, fy0], [fx0, fy0, fx1, fy1], [fx1, fy0, fx0, fy1]]) L.strings.push({ x0: q[0], y0: q[1], h0: 9, x1: q[2], y1: q[3], h1: 9, sag: 1.6, n: Math.round(Math.hypot(q[2] - q[0], q[3] - q[1]) / 2.6) });
    L.poles = [[fx0, fy0, 9], [fx1, fy0, 9], [fx1, fy1, 9], [fx0, fy1, 9]];
    L.pools.push({ x: fc.x + fc.w / 2, y: fc.y + fc.d / 2 + 4, r: 46, col: '#ffcf80', i: 1 });
    // rides: the carousel and the toy train loop
    L.carousel = { x: x1 - 27, y: y0 + 37, r: 8 };
    L.avoid.push([L.carousel.x - 9, L.carousel.y - 9, 18, 18]);
    L.pools.push({ x: L.carousel.x, y: L.carousel.y, r: 26, col: '#ff9ad0', i: 0.8 });
    L.train = { cx: x0 + 60, cy: y1 - 36, rx: 36, ry: 12, cars: 4, gap: 0.27 };
    L.avoid.push([L.train.cx - L.train.rx - 3, L.train.cy - L.train.ry - 3, L.train.rx * 2 + 6, L.train.ry * 2 + 6]);
    L.pools.push({ x: L.train.cx, y: L.train.cy, r: 40, col: '#ffe0a0', i: 0.6 });
    // the loudspeaker mast inside the gate, bulb strings radiating to the stall rows
    L.mast = { x: x1 - 26, y: y0 + 103, h: 26 };
    const ends = [[x0 + 73, y0 + 13], [x0 + 136, y0 + 13], [x0 + 12, y0 + 36], [x0 + 12, y0 + 124], [x0 + 140, y1 - 11], [x0 + 100, y1 - 11], [x1 - 6, y0 + 50], [x1 - 6, y1 - 30], [fc.x + fc.w - 2, fc.y + fc.d - 2]];
    for (const e of ends) L.strings.push({ x0: L.mast.x, y0: L.mast.y, h0: L.mast.h - 1, x1: e[0], y1: e[1], h1: 8, sag: 5, n: Math.round(Math.hypot(e[0] - L.mast.x, e[1] - L.mast.y) / 3.2), radial: true });
    L.pools.push({ x: L.mast.x, y: L.mast.y, r: 52, col: '#ffe8b0', i: 0.8 });
    // a canopy of bulb strings zig-zagging over the main lane between the two big stall rows
    const lane = (N.WORLD_DATA.landmarks || []).filter((l) => l.draw === 'numaish_stalls').sort((a, b) => a.y - b.y);
    if (lane.length >= 2) {
      const a = lane[0], b = lane[1], ya = a.y + a.d / 2, yb = b.y - b.d / 2;
      const ux0 = Math.max(a.x - a.w / 2, b.x - b.w / 2) + 4, ux1 = Math.min(a.x + a.w / 2, b.x + b.w / 2) - 4;
      for (let x = ux0, i = 0; x < ux1 - 6; x += 9, i++) L.strings.push({ x0: x, y0: ya, h0: 10, x1: x + 9, y1: yb, h1: 10, sag: 1.5, n: 9, lane: true });
      L.pools.push({ x: (ux0 + ux1) / 2, y: (ya + yb) / 2, r: 50, col: '#ffd890', i: 0.8 });
    }
    // searchlights at three corners, the enquiry booth (lost and found, the loudspeaker voice) by the gate
    L.search = [[x0 + 5, y0 + 5], [x0 + 5, y1 - 5], [x1 - 5, y1 - 5]];
    L.booth = { x: x1 - 18, y: y0 + 149, w: 9, d: 7 };
    L.avoid.push([L.booth.x - 1, L.booth.y - 1, L.booth.w + 2, L.booth.d + 2]);
    num.L = L;
    return L;
  }
  function numBlocked(x, y) {
    const L = num.L; if (!L) return false;
    for (const r of L.avoid) if (x > r[0] && y > r[1] && x < r[0] + r[2] && y < r[1] + r[3]) return true;
    return false;
  }
  function trainAt(T, t, out) {
    const c = Math.cos(t), s = Math.sin(t);
    out.x = T.cx + T.rx * c; out.y = T.cy + T.ry * s; out.a = Math.atan2(T.ry * c, -T.rx * s);
    return out;
  }
  const NUM_CROWDS = [ // key, dx, dy from the grounds' top-left, n, radius, standing share
    ['numaish', 93, 97, 34, 64, 0.25], ['numaish_lane', 85, 115, 22, 30, 0.3], ['numaish_plaza', 160, 103, 22, 22, 0.35],
    ['numaish_food', 103, 66, 20, 22, 0.6], ['numaish_rides', 115, 150, 16, 26, 0.5],
  ];
  const numOpen = () => { const m = N.clock.minutes; return m > 15.5 * 60 && m < 23 * 60; };
  function goodsCols(kind) {
    switch (kind) {
      case 'bangles': return ['#e8202a', '#2a5cd8', '#30b050', '#f2c230', '#c03a9a', '#f4f0e0'];
      case 'toys': return ['#e83a5a', '#2a5cd8', '#f2c230', '#30b050'];
      case 'papad': case 'khadi': return ['#f2e8c8', '#e8d8a8'];
      case 'shawls': case 'carpets': return ['#8a1a2a', '#c8902a', '#1f6a6a', '#5a2a6a'];
      case 'dryfruit': return ['#a0683a', '#d8b878', '#6a3a1a'];
      case 'pickles': return ['#c8301a', '#e8741a', '#6a8a2a'];
      case 'crockery': return ['#f8f8f8', '#3a6ad8'];
      case 'pearls': return ['#f8f4ea', '#e8e0d0'];
      case 'books': return ['#c8302a', '#2a5cb8', '#2a8a3a', '#e8c040'];
      case 'candy': return ['#ffa0d0', '#ffd0e8'];
      default: return ['#f4e8c8', '#e8742a', '#c8302a'];
    }
  }
  ov('numaish', {
    update(dt) {
      const p = placeXY('nampally_exhibition');
      if (!p || !N.player) return;
      const d = Math.hypot(N.player.x - p.x, N.player.y - p.y), m = N.clock.minutes;
      num.open = numOpen();
      if (d < 900) { num.train += dt * (num.open ? 0.22 : 0); num.car += dt * (num.open ? 0.55 : 0); num.beam += dt; }
      if (d < 420 && m > 15 * 60 && m < 22.5 * 60 && N.state.is('play')) {
        num.ann -= dt;
        if (num.ann <= 0) {
          num.ann = 28 + Math.random() * 20;
          toast(NUM_LINES[num.annI++ % NUM_LINES.length], 5200);
          sfx('announce', p.x, p.y);
        }
      }
    },
    draw() {
      const L = numaishLayout(); if (!L) return;
      const g = L.g;
      if (!R.rectInView(g[0], g[1], g[2] - g[0], g[3] - g[1], 120)) return;
      const open = numOpen(); num.open = open;
      const lit = NIGHT > 0.15;
      for (const c of NUM_CROWDS) {
        crowdDraw(c[0], null, c[3], c[4], { at: [g[0] + c[1], g[1] + c[2]], standP: c[5], avoid: numBlocked, hours: [930, 1380] });
      }
      const tmpT = { x: 0, y: 0, a: 0 };
      R.queue('structures', R.distKey((g[0] + g[2]) / 2, (g[1] + g[3]) / 2) + 1, () => {
        frame();
        const D = N.draw;
        // food court floor (dhurrie-red paving), track bed for the toy train
        const fc = L.food, k0 = kh(0.05);
        ctx.fillStyle = 'rgba(150,70,50,0.35)'; ctx.fillRect(sxp(fc.x, k0), syp(fc.y + 7, k0), fc.w * k0, (fc.d - 7) * k0);
        const T = L.train;
        ctx.strokeStyle = 'rgba(70,60,50,0.8)'; ctx.lineWidth = Math.max(1, 2.4 * k0);
        ctx.beginPath(); ctx.ellipse(sxp(T.cx, k0), syp(T.cy, k0), T.rx * k0, T.ry * k0, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#b8b8c0'; ctx.lineWidth = Math.max(0.5, 0.5 * k0);
        for (const o of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sxp(T.cx, k0), syp(T.cy, k0), (T.rx + o) * k0, (T.ry + o) * k0, 0, 0, TAU); ctx.stroke(); }
        // stalls and food counters (painter order: far to near in y)
        const all = L.stalls.concat(L.counters);
        if (!L._sorted) { all.sort((a, b) => a.y - b.y); L._sorted = all; }
        for (const s2 of L._sorted) {
          const front = open ? '#f4ecd8' : '#a8a8a8';
          D.box(s2.x, s2.y, s2.w, s2.d, 0, 7, { wall: front, roof: false });
          // striped canopy, sloping to the front
          D.box(s2.x - (s2.nx < 0 ? 1.4 : 0), s2.y - (s2.ny < 0 ? 1.4 : 0), s2.w + Math.abs(s2.nx) * 1.4, s2.d + Math.abs(s2.ny) * 1.4, 7, 8.6, { wall: R.shaded(s2.col, 0.8), roof: open ? s2.col : '#9aa0a6' });
          if (open) {
            const k = kh(8.62); ctx.fillStyle = 'rgba(255,250,238,0.85)';
            const along = s2.nx === 0, n = Math.max(2, Math.round((along ? s2.w : s2.d) / 2.4));
            for (let i = 0; i < n; i += 2) {
              if (along) ctx.fillRect(sxp(s2.x + (i / n) * s2.w, k), syp(s2.y - (s2.ny < 0 ? 1.4 : 0), k), (s2.w / n) * k, (s2.d + 1.4) * k);
              else ctx.fillRect(sxp(s2.x - (s2.nx < 0 ? 1.4 : 0), k), syp(s2.y + (i / n) * s2.d, k), (s2.w + 1.4) * k, (s2.d / n) * k);
            }
            // goods out front on the counter
            const gc = goodsCols(s2.kind), k1 = kh(3.2);
            const fxp0 = s2.nx > 0 ? s2.x + s2.w + 1 : s2.nx < 0 ? s2.x - 1 : s2.x + 1, fyp0 = s2.ny > 0 ? s2.y + s2.d + 1 : s2.ny < 0 ? s2.y - 1 : s2.y + 1;
            const m = Math.max(2, Math.round((s2.nx === 0 ? s2.w : s2.d) / 1.6));
            for (let i = 0; i < m; i++) {
              const t = (i + 0.5) / m, gx = s2.nx === 0 ? s2.x + t * s2.w : fxp0, gy = s2.nx === 0 ? fyp0 : s2.y + t * s2.d;
              ctx.fillStyle = gc[i % gc.length]; ctx.fillRect(sxp(gx, k1) - 0.6 * k1, syp(gy, k1) - 0.6 * k1, 1.2 * k1, 1.2 * k1);
            }
            if (lit) { const kk = kh(7); light(s2.cx + s2.nx * 6, s2.cy + s2.ny * 6, 18, '#ffe8b0', 0.5, 6); void kk; }
          }
        }
        // tables + chairs + umbrellas in the food court
        for (const t of L.tables) {
          D.cyl(t.x, t.y, 2.2, 0, 3, { wall: '#d8d0c0', top: true, roof: '#f4f0e8', grad: false });
          const ku = kh(9);
          ctx.fillStyle = t.col; ctx.beginPath(); ctx.arc(sxp(t.x, ku), syp(t.y, ku), 4.2 * ku, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(sxp(t.x, ku), syp(t.y, ku)); ctx.arc(sxp(t.x, ku), syp(t.y, ku), 4.2 * ku, i * TAU / 4, i * TAU / 4 + TAU / 8); ctx.fill(); }
        }
        // the carousel: a striped round canopy turning, a ring of horses under it
        const C = L.carousel, kc = kh(1.2), kt = kh(11);
        ctx.fillStyle = '#c8b898'; ctx.beginPath(); ctx.arc(sxp(C.x, kc), syp(C.y, kc), C.r * kc, 0, TAU); ctx.fill();
        for (let i = 0; i < 8; i++) { const a = num.car + i * TAU / 8, k = kh(4); ctx.fillStyle = ['#f4f0e8', '#f2c230', '#e83a5a', '#40a0e8'][i % 4]; ctx.fillRect(sxp(C.x + Math.cos(a) * C.r * 0.75, k) - 1.2 * k, syp(C.y + Math.sin(a) * C.r * 0.75, k) - 1.2 * k, 2.4 * k, 2.4 * k); }
        for (let i = 0; i < 12; i++) { const a = num.car + i * TAU / 12; ctx.fillStyle = i % 2 ? '#e8303a' : '#f8f0e0'; ctx.beginPath(); ctx.moveTo(sxp(C.x, kt), syp(C.y, kt)); ctx.arc(sxp(C.x, kt), syp(C.y, kt), (C.r + 0.6) * kt * 0.92, a, a + TAU / 12); ctx.fill(); }
        ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.arc(sxp(C.x, kh(13)), syp(C.y, kh(13)), 1.2 * kh(13), 0, TAU); ctx.fill();
        // the toy train: engine + coaches with kids
        for (let i = T.cars - 1; i >= 0; i--) {
          trainAt(T, num.train - i * T.gap, tmpT);
          const k = kh(4.5), X = sxp(tmpT.x, k), Y = syp(tmpT.y, k), ca = Math.cos(tmpT.a), sa = Math.sin(tmpT.a);
          ctx.setTransform(ca * k, sa * k, -sa * k, ca * k, X, Y);
          ctx.fillStyle = i === 0 ? '#c8202a' : ['#2a5cd8', '#f2c230', '#30a050'][i % 3]; ctx.fillRect(-3, -1.7, 6, 3.4);
          if (i === 0) { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(1.6, -0.6, 1.2, 1.2); ctx.fillStyle = '#f2c230'; ctx.fillRect(-3, -1.7, 1.4, 3.4); }
          else { ctx.fillStyle = '#2a1a14'; for (const u of [-1.4, 1.4]) { ctx.beginPath(); ctx.arc(u, 0, 0.8, 0, TAU); ctx.fill(); } }
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          if (i === 0 && lit) { light(tmpT.x + ca * 6, tmpT.y + sa * 6, 16, '#fff0c0', 0.8, 3); glowAt(tmpT.x + ca * 3.4, tmpT.y + sa * 3.4, 4, '#fff4c0'); }
        }
        // the enquiry booth with its loudspeaker
        const B = L.booth;
        D.box(B.x, B.y, B.w, B.d, 0, 8, { wall: '#efe6d2', roof: '#2a5cb8' });
        // the mast and its loudspeaker horns
        const M = L.mast;
        ctx.strokeStyle = '#5a5a62'; ctx.lineWidth = Math.max(1, Z * 0.9); ctx.beginPath(); ctx.moveTo(sxp(M.x, kh(0)), syp(M.y, kh(0))); ctx.lineTo(sxp(M.x, kh(M.h)), syp(M.y, kh(M.h))); ctx.stroke();
        for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.6, k = kh(M.h - 1.5); ctx.fillStyle = '#9aa0a6'; ctx.beginPath(); ctx.arc(sxp(M.x + Math.cos(a) * 1.6, k), syp(M.y + Math.sin(a) * 1.6, k), 0.9 * k, 0, TAU); ctx.fill(); }
        // bulb strings everywhere (wires faint by day)
        const cols = ['#ff5040', '#ffe040', '#40ff80', '#40a0ff', '#ff60e0'];
        const ph = TIME * 4;
        for (let i = 0; i < L.strings.length; i++) {
          const st = L.strings[i];
          if (st.radial || st.lane) wire(st.x0, st.y0, st.h0, st.x1, st.y1, st.h1, st.sag);
          bulbString(st.x0, st.y0, st.h0, st.x1, st.y1, st.h1, st.n, st.lane || st.radial ? cols : ['#ffe070', '#ff9a40', '#fff4d0'], st.sag, ph + i);
          if (lit) for (let j = 1; j < st.n; j += st.radial ? 4 : st.lane ? 3 : 5) { const t = j / st.n; glowAt(st.x0 + (st.x1 - st.x0) * t, st.y0 + (st.y1 - st.y0) * t, st.h0 + (st.h1 - st.h0) * t - Math.sin(t * Math.PI) * st.sag, cols[(i + j) % cols.length]); }
        }
        // carousel rim bulbs
        for (let i = 0; i < 16; i++) { const a = num.car + i * TAU / 16; bulb(C.x + Math.cos(a) * C.r, C.y + Math.sin(a) * C.r, 10, i % 2 ? '#ffe040' : '#ff60e0', lit ? 1 : 0); if (lit && i % 2) glowAt(C.x + Math.cos(a) * C.r, C.y + Math.sin(a) * C.r, 10, '#ff9ad0'); }
        flushBulbs();
        if (open && lit) for (const pl of L.pools) light(pl.x, pl.y, pl.r, pl.col, 0.6 * pl.i, 10);
      });
      // searchlight beams at night
      if (open && NIGHT > 0.3) {
        R.queue('sky', 1, () => {
          frame();
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < L.search.length; i++) {
            const bx = L.search[i][0], by = L.search[i][1];
            const a = Math.sin(TIME * 0.35 + i * 2.2) * 0.9 + Math.atan2((g[1] + g[3]) / 2 - by, (g[0] + g[2]) / 2 - bx);
            const k0 = kh(2), k1 = kh(260), X0 = sxp(bx, k0), Y0 = syp(by, k0);
            const ex = bx + Math.cos(a) * 160, ey = by + Math.sin(a) * 160, X1 = sxp(ex, k1), Y1 = syp(ey, k1);
            const gr = ctx.createLinearGradient(X0, Y0, X1, Y1);
            gr.addColorStop(0, 'rgba(255,250,210,0.36)'); gr.addColorStop(1, 'rgba(255,250,210,0)');
            ctx.fillStyle = gr;
            const nx = -(Y1 - Y0), ny = X1 - X0, nl = Math.hypot(nx, ny) || 1;
            ctx.beginPath(); ctx.moveTo(X0 - (nx / nl) * 2, Y0 - (ny / nl) * 2); ctx.lineTo(X1 - (nx / nl) * 22, Y1 - (ny / nl) * 22); ctx.lineTo(X1 + (nx / nl) * 22, Y1 + (ny / nl) * 22); ctx.lineTo(X0 + (nx / nl) * 2, Y0 + (ny / nl) * 2); ctx.closePath(); ctx.fill();
          }
          reset();
        });
      }
    },
  });

  /* ---------------------------------------------------------------- SUMMER */
  const summ = { sheds: null, mangoes: null };
  function drawChalivendram(x, y, ang) {
    // a thatched water shed: four bamboo poles, a palm-leaf roof, red clay matkas on a plank
    const D = N.draw;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const P = (u, v) => [x + ca * u - sa * v, y + sa * u + ca * v];
    for (const [u, v] of [[-8, -5], [8, -5], [-8, 5], [8, 5]]) { const p = P(u, v); D.cyl(p[0], p[1], 0.6, 0, 10, { wall: '#a07a4a', grad: false, top: false }); }
    const c = [P(-10, -7), P(10, -7), P(10, 7), P(-10, 7)];
    D.poly(c, 10, 11.4, { wall: '#8a6a30', roof: '#c8a65a', wallFlat: true });
    for (const q of [P(-3, -3), P(4, 2)]) { const k = kh(11.5); ctx.strokeStyle = 'rgba(110,80,30,0.7)'; ctx.lineWidth = 0.6 * k; ctx.beginPath(); ctx.moveTo(sxp(q[0] - 4, k), syp(q[1], k)); ctx.lineTo(sxp(q[0] + 4, k), syp(q[1] + 1, k)); ctx.stroke(); }
    D.box(x - 6, y - 2, 12, 4, 2.5, 3.4, { wall: '#7a5a3a', roof: '#9a7a50' });
    for (let i = 0; i < 4; i++) { const p = P(-4.5 + i * 3, 0); D.dome(p[0], p[1], 1.5, 3.4, 6.4, { fill: '#b8502a', steps: 4 }); }
    // the painted board: free drinking water
    const bp = P(0, -7.5);
    D.box(bp[0] - 8, bp[1] - 1, 16, 2, 6, 11, { wall: '#efe9dc', roof: '#d8402a' });
    N.draw.pixelText(bp[0], bp[1] - 1, 11, 'CHALIVENDRAM', '#b22b2b');
  }
  ov('summer', {
    draw() {
      const m = N.clock.minutes;
      if (!summ.sheds) {
        summ.sheds = [];
        for (const id of ['bus_stop_10', 'bus_stop_1', 'bus_stop_13', 'bus_stop_9', 'bus_stop_11', 'bus_stop_6', 'bus_stop_8', 'bus_stop_17']) {
          const p = placeXY(id); if (!p) continue;
          // beside the stop, on walkable ground
          let best = null;
          const ok = (x, y) => N.world.isWalkable(x, y) && N.world.surfaceAt(x, y) !== N.SURF.ROAD;
          for (const [dx, dy] of [[32, 0], [-32, 0], [0, 30], [0, -30], [36, 10], [-36, 10], [10, 36], [10, -36], [44, 0], [-44, 0]]) {
            const x = p.x + dx, y = p.y + dy;
            if (ok(x, y) && ok(x - 10, y - 8) && ok(x + 10, y - 8) && ok(x - 10, y + 8) && ok(x + 10, y + 8)) { best = [x, y]; break; }
          }
          if (best) summ.sheds.push({ x: best[0], y: best[1], a: hsh(p.x, p.y) * 0.4 });
        }
        summ.mangoes = [];
        for (const id of ['rythu_bazaar_mehdipatnam', 'rythu_bazaar_erragadda', 'rythu_bazaar_saroornagar', 'general_bazaar', 'gaddiannaram_fruit_market', 'mozamjahi_market', 'begum_bazaar']) {
          const p = placeXY(id); if (!p) continue;
          for (let i = 0; i < 3; i++) { const x = p.x + (i - 1) * 12, y = p.y + 10 + (i % 2) * 4; if (N.world.isWalkable(x, y)) summ.mangoes.push({ x, y, s: hsh(x, y) }); }
        }
      }
      for (const s of summ.sheds) {
        if (!inView(s.x, s.y, 30)) continue;
        const ss = s;
        R.queue('structures', R.distKey(s.x, s.y), () => { frame(); drawChalivendram(ss.x, ss.y, ss.a); });
      }
      if (summ.mangoes.some((mg) => inView(mg.x, mg.y, 20))) {
        R.queue('actors', 0, () => {
          frame();
          for (const mg of summ.mangoes) {
            if (!inView(mg.x, mg.y, 20)) continue;
            N.draw.box(mg.x - 6, mg.y - 3, 12, 6, 0, 4, { wall: '#7a5a3a', roof: '#8a6a4a' });
            const k = kh(5);
            for (let i = 0; i < 16; i++) {
              const u = (i % 6) - 2.5, v = Math.floor(i / 6) - 1;
              ctx.fillStyle = (i + ((mg.s * 10) | 0)) % 3 ? '#f2b020' : '#9ac030';
              ctx.beginPath(); ctx.arc(sxp(mg.x + u * 1.8, k), syp(mg.y + v * 1.8, k), 0.9 * k, 0, TAU); ctx.fill();
            }
          }
        });
      }
      // midday heat: a warm shimmering wash
      if (m > 11 * 60 && m < 16.5 * 60) {
        const a = Math.sin(((m - 660) / 330) * Math.PI) * 0.09;
        R.queue('fx', 1, () => {
          frame();
          ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = a * 2.5; ctx.fillStyle = '#ffd070'; ctx.fillRect(0, 0, R.W, R.H);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#fff0c0'; ctx.fillRect(0, 0, R.W, R.H);
          reset();
        });
      }
    },
  });

  /* ---------------------------------------------------------------- BONALU */
  // Processions of women carrying bonam pots, Pothuraju dancers, dappu drummers, neem festoons.
  const BONALU = [
    { id: 'ujjaini_mahankali_temple', women: 16, poth: 2, drums: 4, len: 300, thottelu: true },
    { id: 'lal_darwaza_temple', women: 14, poth: 2, drums: 3, len: 280, thottelu: true },
    { id: 'akkanna_madanna_temple', women: 6, poth: 1, drums: 2, len: 160 },
    { id: 'balkampet_yellamma_temple', women: 6, poth: 1, drums: 2, len: 160 },
    { id: 'golconda_jagadamba_temple', women: 5, poth: 1, drums: 1, len: 140 },
    { id: 'katta_maisamma_temple', women: 5, poth: 1, drums: 1, len: 140 },
  ];
  const bon = { procs: null, drumT: 0 };
  function buildBonalu() {
    bon.procs = [];
    for (const b of BONALU) {
      const p = placeXY(b.id);
      if (!p) continue;
      const path = roadPathTo(p.x, p.y, b.len);
      if (!path || path.length < 2) continue;
      const L = polyLen(path);
      const members = [];
      const tot = b.women + b.poth + b.drums;
      // drummers lead, Pothurajus dance ahead of the women, the women walk two abreast
      for (let i = 0; i < tot; i++) {
        const kind = i < b.drums ? 'drum' : i < b.drums + b.poth ? 'poth' : 'bonam';
        const j = i < b.drums + b.poth ? i : b.drums + b.poth + Math.floor((i - b.drums - b.poth) / 2);
        const side = kind === 'bonam' ? ((i - b.drums - b.poth) % 2 ? 4.5 : -4.5) : ((i * 7) % 5 - 2) * 3;
        members.push({ kind, d: L - 26 - j * 11, side, li: kind === 'drum' ? lookIdx.drummer : kind === 'poth' ? lookIdx.pothuraju : lookIdx['bonam' + (i % 6)], ph: i * 1.3 });
      }
      const span = Math.max(L * 0.6, 26 + (b.drums + b.poth + Math.ceil(b.women / 2)) * 11 + 30);
      const pr = { id: b.id, path, L, members, thottelu: b.thottelu, festoons: [], span };
      // neem festoons across the road every ~40 u near the temple
      for (let d = 20; d < Math.min(L, 200); d += 40) { along(path, L - d, tmpP); pr.festoons.push({ x: tmpP.x, y: tmpP.y, a: tmpP.a }); }
      bon.procs.push(pr);
      RESP.procession('procession_bonalu_' + b.id, path, 16, { name: 'Bonalu procession to ' + p.name });
    }
  }
  ov('bonalu', {
    on() { makeLooks(); buildBonalu(); },
    off() { if (bon.procs) for (const pr of bon.procs) RESP.endProcession('procession_bonalu_' + pr.id); bon.procs = null; },
    update(dt) {
      if (!bon.procs) buildBonalu();
      for (const pr of bon.procs) {
        if (!inView(pr.path[pr.path.length - 1][0], pr.path[pr.path.length - 1][1], pr.L + 200)) continue;
        for (const m of pr.members) { m.d += dt * 6; if (m.d > pr.L - 6) m.d -= pr.span; m.ph += dt; }
      }
      bon.drumT -= dt;
      if (bon.drumT <= 0 && N.player) {
        bon.drumT = 1.6;
        for (const pr of bon.procs) { const g = pr.path[pr.path.length - 1]; if (Math.hypot(g[0] - N.player.x, g[1] - N.player.y) < 320) { sfx('dappu', g[0], g[1]); break; } }
      }
    },
    draw() {
      if (!bon.procs) return;
      for (const pr of bon.procs) {
        const g = pr.path[pr.path.length - 1];
        if (!inView(g[0], g[1], pr.L)) continue;
        const prr = pr;
        // festoons (structures, after the buildings)
        for (const f of pr.festoons) {
          if (!inView(f.x, f.y, 40)) continue;
          const ff = f;
          R.queue('structures', R.distKey(f.x, f.y), () => {
            frame();
            const nx = -Math.sin(ff.a) * 18, ny = Math.cos(ff.a) * 18;
            wire(ff.x - nx, ff.y - ny, 13, ff.x + nx, ff.y + ny, 13, 3, '#5a4a30');
            for (let i = 0; i <= 12; i++) { const t = i / 12, h = 13 - Math.sin(t * Math.PI) * 3, k = kh(h - 1); ctx.fillStyle = i % 3 ? '#3f8a2a' : '#5aa83a'; ctx.beginPath(); ctx.ellipse(sxp(ff.x - nx + 2 * nx * t, k), syp(ff.y - ny + 2 * ny * t, k), 1.4 * k, 0.8 * k, ff.a, 0, TAU); ctx.fill(); }
            // marigold balls on the toran and a paper bunting a little lower
            for (let i = 0; i <= 12; i += 2) { const t = i / 12, h = 12.4 - Math.sin(t * Math.PI) * 3, k = kh(h); ctx.fillStyle = i % 4 ? '#ff9a1a' : '#f2c230'; ctx.beginPath(); ctx.arc(sxp(ff.x - nx + 2 * nx * t, k), syp(ff.y - ny + 2 * ny * t, k), 0.9 * k, 0, TAU); ctx.fill(); }
            const FL = ['#e8202a', '#f2c230', '#30a040', '#e85aa8', '#ff8a1a', '#2a5cd8'];
            for (let i = 0; i < 14; i++) { const t = (i + 0.5) / 14, h = 10 - Math.sin(t * Math.PI) * 2.4, k = kh(h), X = sxp(ff.x - nx + 2 * nx * t, k), Y = syp(ff.y - ny + 2 * ny * t, k); ctx.fillStyle = FL[i % FL.length]; ctx.beginPath(); ctx.moveTo(X - 1.2 * k, Y - 0.6 * k); ctx.lineTo(X + 1.2 * k, Y - 0.6 * k); ctx.lineTo(X, Y + 1.4 * k); ctx.closePath(); ctx.fill(); }
            if (NIGHT > 0.2) bulbString(ff.x - nx, ff.y - ny, 14, ff.x + nx, ff.y + ny, 14, 8, ['#ffd040', '#ff6040'], 3, TIME * 3);
            flushBulbs();
          });
        }
        // the decorated temple gate (turmeric posts with kumkum bands, a red beam hung with marigolds and neem)
        // and the offered bonam pots beside it (the same spots as the 3D decor, src/festivals3d.js)
        const g1 = pr.path[pr.path.length - 1], g2 = pr.path[Math.max(0, pr.path.length - 2)];
        if (inView(g1[0], g1[1], 60)) R.queue('structures', R.distKey(g1[0], g1[1]), () => {
          frame();
          const a = Math.atan2(g1[1] - g2[1], g1[0] - g2[0]), nx = -Math.sin(a), ny = Math.cos(a), w = 9, gx = g1[0] - Math.cos(a) * 6, gy = g1[1] - Math.sin(a) * 6;
          for (const sd of [-1, 1]) { const x = gx + nx * sd * w, y = gy + ny * sd * w; N.draw.box(x - 0.8, y - 0.8, 1.6, 1.6, 0, 10, { wall: '#f2c230', roof: '#c8202a' }); }
          const k = kh(10.5);
          ctx.strokeStyle = '#e8402a'; ctx.lineWidth = Math.max(1, 1.2 * k); ctx.beginPath(); ctx.moveTo(sxp(gx - nx * w, k), syp(gy - ny * w, k)); ctx.lineTo(sxp(gx + nx * w, k), syp(gy + ny * w, k)); ctx.stroke();
          for (let i = 0; i <= 12; i++) { const t = i / 12, kk = kh(9.6); ctx.fillStyle = i % 2 ? '#ff9a1a' : '#3f8a2a'; ctx.beginPath(); ctx.arc(sxp(gx + nx * (t - 0.5) * 2 * w, kk), syp(gy + ny * (t - 0.5) * 2 * w, kk), 0.9 * kk, 0, TAU); ctx.fill(); }
          for (let j = 0; j < 7; j++) { const u = w + 3 + j * 2.2, x = gx + nx * u + Math.cos(a) * 2, y = gy + ny * u + Math.sin(a) * 2, kp = kh(2.4); ctx.fillStyle = '#c89a2a'; ctx.beginPath(); ctx.arc(sxp(x, kp), syp(y, kp), 1.1 * kp, 0, TAU); ctx.fill(); ctx.fillStyle = '#3f8a2a'; ctx.beginPath(); ctx.arc(sxp(x, kh(3.2)), syp(y, kh(3.2)), 0.6 * kh(3.2), 0, TAU); ctx.fill(); if (NIGHT > 0.2) glowAt(x, y, 3.2, '#ffb040'); }
          reset();
        });
        R.queue('actors', g[1], () => {
          frame();
          ctx.imageSmoothingEnabled = true;
          for (const m of prr.members) {
            if (m.d < 0) continue;
            along(prr.path, m.d, tmpP);
            const nx = -Math.sin(tmpP.a), ny = Math.cos(tmpP.a);
            let x = tmpP.x + nx * m.side, y = tmpP.y + ny * m.side;
            if (!inView(x, y, 20)) continue;
            let ang = tmpP.a, fr = 1 + (Math.floor(m.ph * 3) % 4);
            if (m.kind === 'poth') { ang += Math.sin(m.ph * 3) * 1.6; x += Math.sin(m.ph * 2.2) * 3; fr = 1 + (Math.floor(m.ph * 6) % 4); }
            person(x, y, 0, m.li, ang, fr);
            if (m.kind === 'bonam') { // the bonam pot on her head: brass pot, neem, turmeric, a little lamp
              const k = kh(15.5), X = sxp(x, k), Y = syp(y, k);
              ctx.fillStyle = '#c89a2a'; ctx.beginPath(); ctx.arc(X, Y, 2.3 * k, 0, TAU); ctx.fill();
              ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.arc(X - 0.5 * k, Y - 0.5 * k, 1.2 * k, 0, TAU); ctx.fill();
              ctx.fillStyle = '#3f8a2a'; for (let j = 0; j < 5; j++) { const a = j * 1.26 + m.ph * 0.2; ctx.beginPath(); ctx.ellipse(X + Math.cos(a) * 2.4 * k, Y + Math.sin(a) * 2.4 * k, 1.1 * k, 0.5 * k, a, 0, TAU); ctx.fill(); }
              const k2 = kh(18.5), fl = 0.7 + Math.sin(TIME * 12 + m.ph) * 0.3;
              ctx.fillStyle = '#ffe080'; ctx.beginPath(); ctx.arc(sxp(x, k2), syp(y, k2), 0.8 * k2 * fl, 0, TAU); ctx.fill();
              if (NIGHT > 0.2) glowAt(x, y, 18.5, '#ffb040');
            } else if (m.kind === 'drum') { // the dappu: a round frame drum held at the side
              const k = kh(10), X = sxp(x + Math.cos(ang) * 3, k), Y = syp(y + Math.sin(ang) * 3, k);
              ctx.fillStyle = '#d8c090'; ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 0.8 * k;
              ctx.beginPath(); ctx.arc(X, Y, 2.8 * k, 0, TAU); ctx.fill(); ctx.stroke();
            } else { // Pothuraju: turmeric, a kumkum mark, ankle bells and a bunch of neem in each hand
              const k = kh(8), X = sxp(x, k), Y = syp(y, k);
              ctx.fillStyle = '#3f8a2a';
              for (const s of [-1, 1]) { const a = ang + s * 1.4 + Math.sin(m.ph * 6) * 0.5; ctx.beginPath(); ctx.arc(X + Math.cos(a) * 4.5 * k, Y + Math.sin(a) * 4.5 * k, 1.5 * k, 0, TAU); ctx.fill(); }
              ctx.fillStyle = '#d8202a'; ctx.fillRect(X - 0.4 * k, Y - 0.4 * k, 0.8 * k, 0.8 * k);
            }
          }
          ctx.imageSmoothingEnabled = false;
          // the thottelu: a tall paper-and-bamboo tower carried at the front
          if (prr.thottelu) {
            along(prr.path, prr.members.length ? (prr.members[prr.members.length - 1].d + 12) % (prr.L - 6) : 10, tmpP);
            const x = tmpP.x, y = tmpP.y, D = N.draw;
            D.box(x - 3, y - 3, 6, 6, 0, 10, { wall: '#e8202a', roof: '#f2c230' });
            D.box(x - 2.4, y - 2.4, 4.8, 4.8, 10, 18, { wall: '#3a9a3a', roof: '#f2c230' });
            D.box(x - 1.6, y - 1.6, 3.2, 3.2, 18, 25, { wall: '#c03a8a', roof: '#ffe040' });
            D.dome(x, y, 1.6, 25, 28, { fill: '#f2c230', finial: 2 });
          }
          reset();
        });
      }
    },
  });

  /* ---------------------------------------------------------------- GANESH (pandal season) */
  ov('ganesh', {
    draw() {
      // serial-light strings across the colony lanes beside the playground pandals (places_art draws them)
      const v = R.view;
      for (const id in N.places) {
        if (id.indexOf('playground_') !== 0) continue;
        const p = N.places[id];
        if (p.x < v.x0 - 60 || p.x > v.x1 + 60 || p.y < v.y0 - 60 || p.y > v.y1 + 60) continue;
        const pp = p;
        R.queue('structures', R.distKey(p.x, p.y) + 2, () => {
          frame();
          const cols = ['#ff5040', '#ffe040', '#40ff80', '#ff60e0'];
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU + 0.4, x1 = pp.x + Math.cos(a) * 26, y1 = pp.y + Math.sin(a) * 22;
            wire(pp.x, pp.y, 16, x1, y1, 9, 2);
            bulbString(pp.x, pp.y, 16, x1, y1, 9, 8, cols, 2, TIME * 4 + i);
          }
          flushBulbs();
          light(pp.x, pp.y, 50, '#ffd890', 0.7, 10);
        });
      }
    },
  });

  /* ---------------------------------------------------------------- GANESH IMMERSION */
  // Lorries and tractors with idols crawl along Tank Bund to the cranes at the immersion point;
  // the cranes lower the idols into the lake; teenmaar dancers, gulal, floodlights, all night.
  const IDOL_COLS = [['#f08a3a', '#f2c230'], ['#e85a8a', '#ffd040'], ['#f2a050', '#3a9a3a'], ['#e8742a', '#2a5cb8'], ['#f4b080', '#d8202a'], ['#ffb0c0', '#f2c230']];
  const imm = { path: null, L: 0, rigs: [], cranes: [], spawnT: 0, ready: false, giant: null };
  function buildImmersion() {
    imm.ready = true;
    const D = N.WORLD_DATA;
    const tb = D && D.roads.find((r) => r.id === 'tank_bund');
    const ip = placeXY('ganesh_immersion_point');
    if (!tb || !ip) return;
    // the procession runs along the bund from its Lower Tank Bund end towards the cranes and on
    const pts = tb.pts.map((q) => [q[0], q[1]]);
    const d0 = Math.hypot(pts[0][0] - ip.x, pts[0][1] - ip.y), d1 = Math.hypot(pts[pts.length - 1][0] - ip.x, pts[pts.length - 1][1] - ip.y);
    imm.path = d0 < d1 ? pts.reverse() : pts; // start far from the cranes
    // left lane (traffic keeps left): offset the path to the lake side a little
    imm.L = polyLen(imm.path);
    // the cranes stand on the lake-side edge near the immersion point
    let best = 0, bd = Infinity;
    for (let d = 0; d < imm.L; d += 8) { along(imm.path, d, tmpP); const dd = (tmpP.x - ip.x) ** 2 + (tmpP.y - ip.y) ** 2; if (dd < bd) { bd = dd; best = d; } }
    imm.craneD = best;
    // which side of the path is the lake? (normal (-sin a, cos a) * lake points at the water)
    along(imm.path, best, tmpP);
    imm.lake = N.world.isWater(tmpP.x - Math.sin(tmpP.a) * 60, tmpP.y + Math.cos(tmpP.a) * 60) ? 1 : -1;
    imm.w = tb.w;
    for (let i = 0; i < 3; i++) {
      bundAt(best + (i - 1) * 48, tb.w / 2 + 7, bp);
      imm.cranes.push({ x: bp.x, y: bp.y, ox: bp.nx, oy: bp.ny, ph: i * 2.3, t: i * 5.3, idol: IDOL_COLS[(i * 2) % IDOL_COLS.length], size: 12 + i * 3 });
    }
    // spectators: two lines along the bund near the cranes (the parapet and the far footpath)
    imm.watch = [];
    makeLooks();
    for (let d = best - 150; d < best + 150; d += 5.5) for (const side of [1, -1]) {
      const lat = side > 0 ? tb.w / 2 + 3 + (hsh(d, 1) * 3) : -(tb.w / 2 + 4 + hsh(d, 2) * 4);
      if (side > 0 && Math.abs(d - best) < 80) continue; // the cranes' working space
      if (hsh(d, side) > 0.78) continue;
      bundAt(d, lat, bp);
      imm.watch.push({ x: bp.x, y: bp.y, a: Math.atan2(-bp.ny * side, -bp.nx * side), li: lookIdx['crowd' + ((hsh(d, side * 3) * 26) | 0)] || 0, ph: hsh(side, d) * 10, sit: hsh(d, 9) < 0.25 });
    }
    RESP.procession('procession_ganesh_tank_bund', imm.path, tb.w / 2 + 2, { name: 'Ganesh immersion procession, Tank Bund' });
    // initial rigs spread along the bund
    // the bund is already full when the day starts: a rig every ~70 u (new ones join at the far end every few seconds)
    const nr = Math.max(9, Math.min(24, Math.floor(imm.L / 70)));
    for (let i = 0; i < nr; i++) spawnRig(i * (imm.L / (nr + 0.5)), i);
  }
  function spawnRig(d, i) {
    const kind = i === 4 ? 'giant' : i % 3 === 1 ? 'tractor' : 'lorry';
    imm.rigs.push({ d, kind, col: ['#e8742a', '#2a5cb8', '#c8202a', '#3a8a3a', '#f2c230'][i % 5], idol: IDOL_COLS[i % IDOL_COLS.length], size: kind === 'giant' ? 34 : kind === 'tractor' ? 13 + (i % 3) : 16 + (i % 4) * 2, has: true, ph: i * 1.7, dancers: 6 + (i % 4) });
  }
  // a point `lat` u to the lake side of the procession path at distance d
  function bundAt(d, lat, out) {
    along(imm.path, d, out);
    const nx = -Math.sin(out.a) * imm.lake, ny = Math.cos(out.a) * imm.lake;
    out.x += nx * lat; out.y += ny * lat; out.nx = nx; out.ny = ny;
    return out;
  }
  function drawIdol(x, y, h, a, size, cols) {
    // a seated Ganesh seen from above: lotus base, body, belly, arms, elephant head with ears, trunk, crown
    const D = N.draw, s = size / 10;
    const ca = Math.cos(a), sa = Math.sin(a);
    D.cyl(x, y, 4.6 * s, h, h + 1.6 * s, { wall: '#e85a8a', roof: '#f29ab2', grad: false });
    D.cyl(x, y, 3.8 * s, h + 1.6 * s, h + 6 * s, { wall: cols[0], roof: false, grad: true });
    D.dome(x + ca * 1.2 * s, y + sa * 1.2 * s, 3.2 * s, h + 4 * s, h + 7.5 * s, { fill: cols[0], steps: 4 }); // belly
    for (const sd of [-1, 1]) { const px = x - sa * sd * 3.6 * s, py = y + ca * sd * 3.6 * s; D.cyl(px, py, 0.9 * s, h + 5 * s, h + 9 * s, { wall: cols[0], grad: false }); }
    D.dome(x, y, 2.8 * s, h + 8 * s, h + 12 * s, { fill: cols[0], steps: 4 }); // head
    for (const sd of [-1, 1]) { const ex = x - sa * sd * 2.8 * s, ey = y + ca * sd * 2.8 * s; D.disc(ex, ey, 1.9 * s, h + 10.5 * s, R.shaded(cols[0], 1.08)); }
    D.cyl(x + ca * 2.4 * s, y + sa * 2.4 * s, 0.7 * s, h + 6 * s, h + 10 * s, { wall: cols[0], grad: false }); // trunk
    D.cyl(x, y, 1.6 * s, h + 12 * s, h + 13.4 * s, { wall: cols[1], grad: false });
    D.dome(x, y, 1.5 * s, h + 13.4 * s, h + 16 * s, { fill: cols[1], steps: 3, finial: 1.5 * s }); // crown
  }
  const bp = { x: 0, y: 0, a: 0, nx: 0, ny: 0 };
  function drawRig(r) {
    bundAt(r.d, 11, bp);
    const x = bp.x, y = bp.y, a = bp.a, ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
    const D = N.draw;
    const box = (u0, v0, u1, v1, h0, h1, st) => { const pts = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => [x + ca * u + nx * v, y + sa * u + ny * v]); D.poly(pts, h0, h1, st); };
    let L = 22;
    if (r.kind === 'tractor') {
      box(6, -5, 18, 5, 0, 8, { wall: '#3a8a3a', roof: '#4aa04a' });            // tractor
      box(-18, -7, 4, 7, 1.5, 5, { wall: '#7a5a3a', roof: '#9a7a50' });           // trolley
      for (const sd of [-1, 1]) { const px = x + ca * 9 + nx * sd * 6, py = y + sa * 9 + ny * sd * 6; D.cyl(px, py, 3, 0, 1.8, { wall: '#2a2a2a', roof: '#3a3a3a', grad: false }); }
      if (r.has) drawIdol(x - ca * 7, y - sa * 7, 5, a, r.size, r.idol);
      L = 20;
    } else if (r.kind === 'giant') {
      box(-30, -11, 26, 11, 0, 5, { wall: '#5a4a3a', roof: '#8a7a6a' });          // the long trailer
      box(26, -8, 38, 8, 0, 10, { wall: '#c8202a', roof: '#e8402a' });            // the puller
      for (const sd of [-1, 1]) for (const u of [-24, -10, 12]) D.cyl(x + ca * u + nx * sd * 11, y + sa * u + ny * sd * 11, 2.6, 0, 2.2, { wall: '#2a2a2a', roof: '#3a3a3a', grad: false });
      if (r.has) drawIdol(x - ca * 2, y - sa * 2, 5, a, r.size, ['#f0a46a', '#f2c230']);
      L = 32;
    } else {
      box(12, -8, 24, 8, 0, 13, { wall: r.col, roof: R.shaded(r.col, 1.1) });        // the lorry's cab
      box(13, -7.4, 15, 7.4, 13, 15, { wall: '#3a3a40', roof: '#4a4a52' });          // carrier rail on the cab
      box(-22, -9, 12, 9, 2, 6, { wall: '#d8c060', roof: '#a08a50' });            // flatbed
      box(-22, -9, 12, -8, 6, 9, { wall: '#e8742a', roof: '#f2a040' }); box(-22, 8, 12, 9, 6, 9, { wall: '#e8742a', roof: '#f2a040' }); // marigold rails
      for (const sd of [-1, 1]) for (const u of [-16, 18]) D.cyl(x + ca * u + nx * sd * 8.4, y + sa * u + ny * sd * 8.4, 2.6, 0, 2.4, { wall: '#2a2a2a', roof: '#3a3a3a', grad: false });
      if (r.has) drawIdol(x - ca * 5, y - sa * 5, 6, a, r.size, r.idol);
      L = 24;
    }
    if (NIGHT > 0.15) { // bulbs round the rig
      for (const sd of [-1, 1]) bulbString(x + ca * L + nx * sd * 9, y + sa * L + ny * sd * 9, 9, x - ca * L + nx * sd * 9, y - sa * L + ny * sd * 9, 9, 12, ['#ffe040', '#ff4040', '#40ff80'], 0.6, TIME * 5);
      light(x, y, 60, '#ffd890', 0.95, 10);
    }
    return [x, y, a, L];
  }
  function drawCrane(c) {
    const D = N.draw, bx = c.x, by = c.y;
    // a tall lattice crane on the bund edge, the boom reaching over the water, cable + hook
    D.box(bx - 6, by - 6, 12, 12, 0, 5, { wall: '#d8a020', roof: '#f2c230' });
    D.box(bx - 2.2, by - 2.2, 4.4, 4.4, 5, 40, { wall: '#e0a828', roof: '#f2c230' });
    D.box(bx - 3.4, by - 3.4, 6.8, 6.8, 40, 45, { wall: '#c8901a', roof: '#e8b030' }); // the cabin
    const reach = 46, tipX = bx + c.ox * reach, tipY = by + c.oy * reach;
    const k0 = kh(43), k1 = kh(38);
    ctx.strokeStyle = '#e8b030'; ctx.lineWidth = Math.max(1.2, 2 * k0);
    ctx.beginPath(); ctx.moveTo(sxp(bx - c.ox * 8, k0), syp(by - c.oy * 8, k0)); ctx.lineTo(sxp(tipX, k1), syp(tipY, k1)); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,80,20,0.85)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); for (let i = 1; i < 10; i++) { const t = i / 10, kk = kh(43 - 5 * t), kd = kh(40 - 5 * t); const px = bx + c.ox * reach * t, py = by + c.oy * reach * t; ctx.moveTo(sxp(px, kk), syp(py, kk)); ctx.lineTo(sxp(px + c.ox * 2.4, kd), syp(py + c.oy * 2.4, kd)); } ctx.stroke();
    // the cycle: lift (0-4 s), swing out (4-7), lower into the water (7-12), back (12-16)
    const T = (c.t % 16);
    const hookH = T < 4 ? 8 + T * 5 : T < 7 ? 28 : T < 12 ? 28 - (T - 7) * 6.4 : 4 + (T - 12) * 6;
    const out = T < 4 ? 0.3 : T < 7 ? 0.3 + ((T - 4) / 3) * 0.65 : T < 12 ? 0.95 : 0.95 - ((T - 12) / 4) * 0.65;
    const hx = bx + c.ox * reach * out, hy = by + c.oy * reach * out;
    const ktip = kh(38 - 5 * out);
    ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = 0.7; ctx.beginPath();
    ctx.moveTo(sxp(hx, ktip), syp(hy, ktip)); const kh2 = kh(Math.max(0, hookH + 2)); ctx.lineTo(sxp(hx, kh2), syp(hy, kh2)); ctx.stroke();
    if (T < 11.4) drawIdol(hx, hy, Math.max(-16, hookH - c.size * 1.4), Math.atan2(c.oy, c.ox), c.size, c.idol);
    if (T > 10.4 && T < 11.8 && Math.random() < 0.7) for (let i = 0; i < 4; i++) puff(hx, hy, 0, (Math.random() - 0.5) * 34, (Math.random() - 0.5) * 34, 22 + Math.random() * 16, 0.9, 1.3, '#d8f4ff', 1);
    if (NIGHT > 0.1) light(bx + c.ox * 26, by + c.oy * 26, 90, '#fff4d0', 1, 30);
  }
  ov('ganesh_immersion', {
    on() { makeLooks(); if (!imm.ready) buildImmersion(); },
    off() { RESP.endProcession('procession_ganesh_tank_bund'); imm.ready = false; imm.rigs.length = 0; imm.cranes.length = 0; imm.path = null; },
    update(dt) {
      if (!imm.ready) buildImmersion();
      if (!imm.path) return;
      const near = N.player && imm.path.some((q, i) => i % 2 === 0 && Math.hypot(q[0] - N.player.x, q[1] - N.player.y) < 900);
      if (!near) return;
      for (const r of imm.rigs) {
        // crawl; stop and wait a while at the cranes, where the idol is handed over
        const atCranes = r.has && r.d > imm.craneD - 50 && r.d < imm.craneD + 20;
        r.wait = (r.wait || 0) + (atCranes ? dt : 0);
        if (atCranes && r.wait > 6) { r.has = false; sfx('splash', imm.cranes[1] ? imm.cranes[1].x : 0, imm.cranes[1] ? imm.cranes[1].y : 0); }
        if (!(atCranes && r.wait < 6)) r.d += dt * (r.kind === 'giant' ? 4 : 7);
        r.ph += dt;
        // gulal puffs over the dancers
        if (Math.random() < dt * 1.2) { along(imm.path, r.d, tmpP); puff(tmpP.x + (Math.random() - 0.5) * 20, tmpP.y + (Math.random() - 0.5) * 20, 10, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 6, 2.6, 2.5, ['#ff3a8a', '#ff6a3a', '#f040c0', '#ffd040'][(Math.random() * 4) | 0], 0); }
      }
      // recycle rigs that have left the bund
      for (let i = imm.rigs.length - 1; i >= 0; i--) if (imm.rigs[i].d > imm.L - 4) imm.rigs.splice(i, 1);
      imm.spawnT -= dt;
      const minD = imm.rigs.reduce((m, r) => Math.min(m, r.d), Infinity);
      if (imm.spawnT <= 0 && minD > 46) { imm.spawnT = 3; spawnRig(0, (Math.random() * 12) | 0); }
      for (const c of imm.cranes) c.t += dt;
    },
    draw() {
      if (!imm.path) return;
      const v = R.view;
      for (const r of imm.rigs) {
        bundAt(r.d, 11, tmpP);
        if (!inView(tmpP.x, tmpP.y, 70)) continue;
        const rr = r;
        // the teenmaar dancers follow behind the rig (actors layer, under the rig's lean)
        R.queue('actors', tmpP.y, () => {
          frame();
          bundAt(rr.d, 11, bp);
          const a = bp.a, ca = Math.cos(a), sa = Math.sin(a), L = rr.kind === 'giant' ? 36 : 26;
          ctx.imageSmoothingEnabled = true;
          for (let i = 0; i < rr.dancers; i++) {
            const t = rr.ph * 2 + i * 1.9;
            const u = -L - 4 - (i % 3) * 7 + Math.sin(t * 0.7) * 2, w = ((i * 5) % 9 - 4) * 3.4 + Math.sin(t) * 1.5;
            const px = bp.x + ca * u - sa * w, py = bp.y + sa * u + ca * w;
            person(px, py, 0, lookIdx[i % 3 ? 'dancer' : 'dancer2'] || 0, a + Math.sin(t * 2) * 2.2, 1 + (Math.floor(t * 4) % 4));
          }
          // drummers walking beside the rig
          for (let i = 0; i < 2; i++) { const u = -6 + i * 12, w = (i ? 1 : -1) * 15; person(bp.x + ca * u - sa * w, bp.y + sa * u + ca * w, 0, lookIdx.drummer || 0, a, 1 + (Math.floor(rr.ph * 3 + i) % 4)); }
          ctx.imageSmoothingEnabled = false;
          reset();
        });
        R.queue('structures', R.distKey(tmpP.x, tmpP.y), () => { frame(); drawRig(rr); flushBulbs(); reset(); });
      }
      for (const c of imm.cranes) {
        if (!inView(c.x, c.y, 90)) continue;
        const cc = c;
        R.queue('structures', R.distKey(c.x, c.y), () => { frame(); drawCrane(cc); reset(); });
      }
      // spectators lining the bund
      if (imm.watch && imm.watch.length && inView(imm.cranes[1].x, imm.cranes[1].y, 400)) {
        R.queue('actors', imm.cranes[1].y, () => {
          frame();
          const vv = R.view;
          ctx.imageSmoothingEnabled = true;
          let n = 0;
          const cap = Math.round(90 * quality());
          for (const w of imm.watch) {
            if (n >= cap) break;
            if (w.x < vv.x0 - 10 || w.x > vv.x1 + 10 || w.y < vv.y0 - 10 || w.y > vv.y1 + 10) continue;
            n++;
            person(w.x, w.y, 0, w.li, w.a + Math.sin(TIME * 0.8 + w.ph) * 0.35, 0);
          }
          ctx.imageSmoothingEnabled = false;
        });
      }
      R.queue('sky', 3, () => { frame(); drawParts(); reset(); });
      void v;
    },
  });

  /* ---------------------------------------------------------------- RAMZAN + CHAND RAAT */
  const ram = { strings: null, stalls: null, bhattis: null, crescents: null, laad: null };
  /** walk the named roads (joined end to end) from d0 to d1 u, calling fn(x, y, angle, width, i) every `step` u */
  function roadSteps(ids, d0, d1, step, fn) {
    const D = N.WORLD_DATA, pts = []; let w = 24;
    for (const id of ids) { const r = D.roads.find((q) => q.id === id); if (!r) continue; w = r.w || w; for (const q of r.pts) { const l = pts[pts.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) pts.push([q[0], q[1]]); } }
    if (pts.length < 2) return;
    const L = polyLen(pts), o = { x: 0, y: 0, a: 0 };
    for (let d = d0, i = 0; d <= Math.min(d1, L - 4); d += step, i++) { along(pts, d, o); fn(o.x, o.y, o.a, w, i); }
  }
  function buildRamzan() {
    const ch = N.WORLD_DATA && N.WORLD_DATA.landmarks.find((l) => l.id === 'charminar');
    if (!ch) return;
    ram.strings = [];
    // from the four minaret tops down to the plaza corners and the four road arms
    const mins = [[ch.x - 30, ch.y - 30], [ch.x + 30, ch.y - 30], [ch.x + 30, ch.y + 30], [ch.x - 30, ch.y + 30]];
    const ends = [[ch.x - 130, ch.y - 120], [ch.x + 130, ch.y - 120], [ch.x + 130, ch.y + 125], [ch.x - 130, ch.y + 125], [ch.x, ch.y - 150], [ch.x + 150, ch.y], [ch.x, ch.y + 150], [ch.x - 150, ch.y]];
    ends.forEach((e, i) => { const m = mins[i < 4 ? i : (i - 4 + (i === 4 ? 0 : i === 5 ? 1 : i === 6 ? 2 : 3)) % 4]; ram.strings.push({ x0: m[0], y0: m[1], h0: 80, x1: e[0], y1: e[1], h1: 14 }); });
    // across Pathergatti Road (north of the monument) and the Laad Bazaar lane (west), following the real roads
    // (these used to be Map v1 coordinates, which put them out in the west of the v2 city)
    ram.crescents = []; ram.laad = [];
    roadSteps(['pathergatti_rd', 'pathergatti_n'], 40, 340, 30, (x, y, a, w, i) => {
      const nx = -Math.sin(a) * (w / 2 + 1), ny = Math.cos(a) * (w / 2 + 1);
      ram.strings.push({ x0: x - nx, y0: y - ny, h0: 16, x1: x + nx, y1: y + ny, h1: 16, own: true });
      if (i % 2 === 0) for (const sd of [-1, 1]) ram.crescents.push({ x: x + sd * nx * 1.12, y: y + sd * ny * 1.12, a });
    });
    // and a ring of them round the Charminar circle, between the road arms, facing out
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * Math.PI / 4;
      for (const r of [108, 116, 100]) {
        const x = ch.x + Math.cos(a) * r, y = ch.y + Math.sin(a) * r;
        if (N.world.isWalkable(x, y) && N.world.surfaceAt(x, y) !== N.SURF.ROAD && !(N.respect.at(x, y) && N.respect.at(x, y).part === 'compound')) { ram.crescents.push({ x, y, a, ring: true }); break; }
      }
    }
    roadSteps(['laad_bazaar'], 30, 260, 28, (x, y, a, w) => {
      const nx = -Math.sin(a) * (w / 2 + 1), ny = Math.cos(a) * (w / 2 + 1);
      ram.strings.push({ x0: x - nx, y0: y - ny, h0: 14, x1: x + nx, y1: y + ny, h1: 14, own: true });
      ram.laad.push({ x0: x - nx, y0: y - ny, x1: x + nx, y1: y + ny, x, y });
    });
    // night-bazaar stalls round the plaza (attar, caps, dates, bangles, clothes, toys)
    ram.stalls = [];
    const KINDS = [['#7a3a8a', 'ATTAR'], ['#efe9dc', 'TOPI'], ['#8a4a2a', 'KHAJOOR'], ['#e83a5a', 'CHUDI'], ['#2a8c82', 'KAPDA'], ['#f2c230', 'KHILONE']];
    const spots = [];
    for (let i = 0; i < 6; i++) spots.push([ch.x - 120 + i * 48, ch.y - 92]);
    for (let i = 0; i < 4; i++) spots.push([ch.x + 104, ch.y - 40 + i * 34]);
    for (let i = 0; i < 4; i++) spots.push([ch.x - 104, ch.y - 30 + i * 34]);
    const okSpot = (x, y) => N.world.isWalkable(x, y) && N.world.surfaceAt(x, y) !== N.SURF.ROAD && !(N.respect.at(x, y) && N.respect.at(x, y).part === 'compound');
    spots.forEach((s, i) => { if (okSpot(s[0], s[1])) ram.stalls.push({ x: s[0], y: s[1], col: KINDS[i % KINDS.length][0], t: KINDS[i % KINDS.length][1], a: i < 6 ? Math.PI / 2 : i < 10 ? Math.PI : 0, lit: i % 2 === 0 }); });
    ram.bhattis = [[ch.x + 70, ch.y - 112], [ch.x - 96, ch.y + 100], [ch.x + 100, ch.y + 104], [ch.x + 36, ch.y - 340]].filter((q) => okSpot(q[0], q[1])).slice(0, 4);
  }
  function drawStall(s) {
    const D = N.draw, vert = Math.abs(Math.cos(s.a)) < 0.5; // long side along x unless the stall faces e/w
    const w = vert ? 10 : 14, d = vert ? 14 : 10, x = s.x - w / 2, y = s.y - d / 2;
    D.box(x, y, w, d, 0, 4, s._st || (s._st = { wall: '#7a5a3a', roof: '#a07a50' }));
    // the goods on the counter
    const k = kh(4.2);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const u = (i % 4) / 3, v = Math.floor(i / 4); const px = x + 2 + u * (w - 4), py = y + 3 + v * (d - 6); ctx.moveTo(sxp(px, k) + 1.1 * k, syp(py, k)); ctx.arc(sxp(px, k), syp(py, k), 1.1 * k, 0, TAU); }
    ctx.fillStyle = s.col; ctx.fill();
    // poles (one stroke) and a striped canopy
    const k0 = kh(0), k1 = kh(10);
    ctx.strokeStyle = '#5a5a62'; ctx.lineWidth = Math.max(0.8, 0.6 * k0); ctx.beginPath();
    for (const [px, py] of [[x - 1, y - 1], [x + w + 1, y - 1], [x - 1, y + d + 1], [x + w + 1, y + d + 1]]) { ctx.moveTo(sxp(px, k0), syp(py, k0)); ctx.lineTo(sxp(px, k1), syp(py, k1)); }
    ctx.stroke();
    D.box(x - 2, y - 2, w + 4, d + 4, 10, 10.6, s._cst || (s._cst = { wall: s.col, roof: s.col, roofFn: (g, kk, bx, by, bw, bd) => { g.fillStyle = '#efe9dc'; const n = 5; for (let i = 0; i < n; i += 2) { if (bw >= bd) g.fillRect(bx + (i * bw) / n, by, bw / n, bd); else g.fillRect(bx, by + (i * bd) / n, bw, bd / n); } } }));
    if (NIGHT > 0.15) { if (s.lit) light(s.x, s.y, 30, '#ffe0a0', 0.75, 9); glowAt(s.x, s.y, 8, '#ffd890'); }
  }
  function drawBhatti(x, y) {
    const D = N.draw;
    D.box(x - 5, y - 5, 10, 10, 0, 5, { wall: '#9a4a2a', roof: '#6a3a2a' });
    D.cyl(x, y, 4, 5, 9, { wall: '#c87a3a', roof: '#3a2a1a' }); // the copper deg
    if (Math.random() < 0.2) puff(x + (Math.random() - 0.5) * 3, y, 10, -2, -2, 6, 2.5, 1.5, '#e8e4dc', 2);
    light(x, y, 40, '#ff9040', 0.9, 5);
    // the cook with the long paddle
    person(x + 7, y + 2, 0, lookIdx.topi || 0, Math.PI, 0);
    const k0 = kh(9), k1 = kh(18);
    ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = Math.max(1, 0.9 * k0);
    const sw = Math.sin(TIME * 3) * 2;
    ctx.beginPath(); ctx.moveTo(sxp(x + sw, k0), syp(y, k0)); ctx.lineTo(sxp(x + 6, k1), syp(y + 1, k1)); ctx.stroke();
  }
  ov('ramzan', {
    on() { makeLooks(); buildRamzan(); },
    draw() {
      if (!ram.strings) buildRamzan();
      const ch = placeXY('charminar');
      if (!ch || !inView(ch.x, ch.y + 60, 380)) return;
      const m = N.clock.minutes, night = m > 17.5 * 60 || m < 60;
      R.queue('structures', R.distKey(ch.x, ch.y + 70) + 3, () => {
        frame();
        const cols = ['#40ff80', '#ffffff', '#40ff80', '#ffe080'];
        for (let i = 0; i < ram.strings.length; i++) { const s = ram.strings[i]; wire(s.x0, s.y0, s.h0, s.x1, s.y1, s.h1, 4); bulbString(s.x0, s.y0, s.h0, s.x1, s.y1, s.h1, Math.round(Math.hypot(s.x1 - s.x0, s.y1 - s.y0) / 7), cols, 4, TIME * 3 + i); if (i % 2 === 0) glowAt(s.x1, s.y1, s.h1, '#60ff90'); }
        flushBulbs();
        // crescent-and-star cut-outs on the poles along Pathergatti
        for (const cr of ram.crescents || []) {
          const x = cr.x, y = cr.y;
          N.draw.cyl(x, y, 0.4, 0, 18, { wall: '#5a5a62', grad: false, top: false });
          const k = kh(19), X = sxp(x, k), Y = syp(y, k);
          ctx.fillStyle = '#1f8a4a'; ctx.beginPath(); ctx.arc(X, Y, 3.2 * k, 0, TAU); ctx.fill();
          ctx.fillStyle = '#f4f2ea'; ctx.beginPath(); ctx.arc(X - 0.4 * k, Y, 2.3 * k, 0, TAU); ctx.fill();
          ctx.fillStyle = '#1f8a4a'; ctx.beginPath(); ctx.arc(X + 0.5 * k, Y - 0.2 * k, 2 * k, 0, TAU); ctx.fill();
          ctx.fillStyle = '#f4f2ea'; ctx.fillRect(X + 1.4 * k, Y - 0.5 * k, 1 * k, 1 * k);
        }
        reset();
      });
      // stalls and haleem bhattis (evening and night)
      if (night) {
        for (const s of ram.stalls || []) { if (!inView(s.x, s.y, 30)) continue; const ss = s; R.queue('structures', R.distKey(s.x, s.y), () => { frame(); drawStall(ss); reset(); }); }
        const bc = ram.bhattis || [];
        for (const b of bc) { if (!inView(b[0], b[1], 30)) continue; const bb = b; R.queue('structures', R.distKey(b[0], b[1]), () => { frame(); ctx.imageSmoothingEnabled = true; drawBhatti(bb[0], bb[1]); ctx.imageSmoothingEnabled = false; reset(); }); }
        if (!state.chand_raat) crowdDraw('ramzan', 'charminar_plaza', m > 20 * 60 || m < 60 ? 40 : 18, 120, { dx: -90, dy: -40 });
        R.queue('sky', 3, () => { frame(); drawParts(); reset(); });
      }
    },
    off() { ram.strings = null; ram.stalls = null; ram.crescents = null; },
  });
  ov('chand_raat', {
    on() { makeLooks(); },
    update(dt) {
      // sparklers in the kids' hands, balloons drifting
      const ch = placeXY('charminar_plaza');
      if (!ch || !inView(ch.x, ch.y, 300) || NIGHT < 0.2) return;
      const c = crowds.chandraat;
      if (c && Math.random() < dt * 8) { const p = c.people[(Math.random() * c.people.length) | 0]; if (p) puff(p.x, p.y, 11, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 10 + Math.random() * 10, 0.6, 0.9, ['#fff4b0', '#ffd040', '#ffffff'][(Math.random() * 3) | 0], 1); }
    },
    draw() {
      const ch = placeXY('charminar');
      if (!ch || !inView(ch.x, ch.y + 60, 360)) return;
      // the huge joyful crowd: families, kids with balloons, mehendi, bangles
      const bal = ['#ff4060', '#40c0ff', '#ffe040', '#60e080', '#ff80e0'];
      const c = crowdDraw('chandraat', 'charminar_plaza', 120, 150, {
        dx: -90, dy: -60, standP: 0.35,
        lookList: Array.from({ length: 30 }, (_, i) => lookIdx[i % 5 === 0 ? 'burqa' : i % 7 === 0 ? 'topi' : i % 4 === 0 ? 'kid' + (i % 6) : 'crowd' + (i % 26)] || 0),
        extra: (p, i) => {
          if (i % 9 === 0) { // a balloon on a string
            const k0 = kh(12), k1 = kh(24 + Math.sin(TIME * 2 + p.ph) * 1.5);
            const X0 = sxp(p.x, k0), Y0 = syp(p.y, k0), X1 = sxp(p.x + 2, k1), Y1 = syp(p.y - 1, k1);
            ctx.strokeStyle = 'rgba(250,250,250,0.7)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); ctx.stroke();
            ctx.fillStyle = bal[i % bal.length]; ctx.beginPath(); ctx.ellipse(X1, Y1, 2.2 * k1, 2.6 * k1, 0, 0, TAU); ctx.fill();
          }
        },
      });
      void c;
      // mehendi artists sitting on mats by the plaza edge with their customers
      R.queue('actors', ch.y + 120, () => {
        frame();
        ctx.imageSmoothingEnabled = true;
        for (let i = 0; i < 5; i++) {
          const x = ch.x - 110 + i * 22, y = ch.y + 118;
          if (!inView(x, y, 20)) continue;
          N.draw.box(x - 5, y - 3, 10, 6, 0, 0.4, { wall: '#c03a3a', roof: i % 2 ? '#d84a4a' : '#2a8c82' });
          person(x - 2, y, 0, lookIdx['crowd' + ((i * 3) % 26)] || 0, 0, 0);
          person(x + 3, y + 1, 0, lookIdx[i % 2 ? 'burqa' : 'bonam' + i] || 0, Math.PI, 0);
        }
        ctx.imageSmoothingEnabled = false;
        if (NIGHT > 0.2) drawParts();
        reset();
      });
      // the new moon over the minarets (screen space, upper sky): a cached crescent sprite
      if (NIGHT > 0.3) {
        R.queue('sky', 4, () => {
          frame();
          const X = R.W * 0.78, Y = R.H * 0.14, r = Math.max(5, Math.round(R.H * 0.022));
          ctx.globalAlpha = Math.min(1, NIGHT);
          ctx.drawImage(moonSprite(), X - r * 3, Y - r * 3, r * 6, r * 6);
          reset();
        });
      }
      // the Laad Bazaar lane glittering all night (extra bulb strings)
      // (along the real lane: these were Map v1 coordinates)
      if (!ram.laad) buildRamzan();
      const ld = ram.laad || [];
      if (ld.length && inView(ld[(ld.length / 2) | 0].x, ld[(ld.length / 2) | 0].y, 200)) R.queue('structures', R.distKey(ld[(ld.length / 2) | 0].x, ld[(ld.length / 2) | 0].y), () => {
        frame();
        const cols = ['#ff4080', '#ffe040', '#40ffff', '#ffffff'];
        for (let i = 0; i < ld.length; i++) { const q = ld[i]; bulbString(q.x0, q.y0, 15, q.x1, q.y1, 15, 6, cols, 3, TIME * 5 + i); }
        flushBulbs();
        for (let i = 0; i < ld.length; i += 2) light(ld[i].x, ld[i].y, 40, '#ffe0c0', 0.9, 12);
      });
    },
  });

  let moonC = null;
  function moonSprite() {
    if (moonC) return moonC;
    moonC = N.render.makeCanvas(60, 60);
    const g = moonC.getContext('2d'), r = 10;
    const gr = g.createRadialGradient(30, 30, 0, 30, 30, 30);
    gr.addColorStop(0, 'rgba(255,250,220,0.30)'); gr.addColorStop(0.4, 'rgba(255,250,220,0.10)'); gr.addColorStop(1, 'rgba(255,250,220,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 60, 60);
    const m = N.render.makeCanvas(60, 60), mg = m.getContext('2d');
    mg.fillStyle = '#fff6d8'; mg.beginPath(); mg.arc(30, 30, r, 0, TAU); mg.fill();
    mg.globalCompositeOperation = 'destination-out';
    mg.beginPath(); mg.arc(30 + r * 0.45, 30 - r * 0.2, r * 0.9, 0, TAU); mg.fill();
    g.drawImage(m, 0, 0);
    return moonC;
  }

  /* ---------------------------------------------------------------- CHRISTMAS */
  const xmas = { L: null };
  const XMAS_DIST = { secunderabad: 1, marredpally: 1, begumpet: 0.3, abids: 0.75, osmania: 0.35, himayatnagar: 0.25 };
  function drawStar(x, y, h, col, s) {
    const k = kh(h), X = sxp(x, k), Y = syp(y, k), r = s * k;
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU, rr = i % 2 ? r * 0.45 : r; if (i) ctx.lineTo(X + Math.cos(a) * rr, Y + Math.sin(a) * rr); else ctx.moveTo(X + Math.cos(a) * rr, Y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.4; ctx.beginPath();
    for (let i = 0; i < 3; i++) { ctx.moveTo(X - r * 0.3 + i * r * 0.3, Y + r * 0.6); ctx.lineTo(X - r * 0.35 + i * r * 0.3, Y + r * 1.6); }
    ctx.stroke();
  }
  const FACE_V = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  // Every church (draw 'church') with its gate (from the respect zone), the outward direction, and where the
  // Christmas things go: the crib and the tree just inside the gate on either side of the path (never on it, so the
  // camera behind someone walking in is never stuck behind them), the carol singers just outside at night.
  // Shared with the 3D view (src/festivals3d.js).
  function xmasLayout() {
    if (xmas.L) return xmas.L;
    const D = N.WORLD_DATA; if (!D || !N.world || !N.world.built) return null;
    const zones = (D.respect || []).filter((z) => z.kind === 'church');
    const L = { churches: [] };
    for (const lm of D.landmarks || []) {
      if (lm.draw !== 'church') continue;
      const z = zones.find((q) => q.place === lm.id || q.id === lm.id);
      const fv = FACE_V[lm.face] || [0, 1];
      let gx, gy, ox = fv[0], oy = fv[1];
      if (z && z.gate && z.rects && z.rects[0]) {
        gx = z.gate.x; gy = z.gate.y;
        const r = z.rects[0], dx = gx - (r[0] + r[2] / 2), dy = gy - (r[1] + r[3] / 2);
        if (Math.abs(dx) > Math.abs(dy)) { ox = Math.sign(dx); oy = 0; } else { ox = 0; oy = Math.sign(dy) || 1; }
      } else {
        const hd = (ox ? lm.w : lm.d) / 2;
        gx = lm.x + ox * (hd + 12); gy = lm.y + oy * (hd + 12);
      }
      const tx = -oy, ty = ox;
      const ch = { id: lm.id, lm, gate: { x: gx, y: gy }, ox, oy, tx, ty, a: Math.atan2(oy, ox) };
      // the crib on one side, the tree on the other, ~7 u inside the gate line (on the church lawn)
      const side = (U.hash2(lm.x * 0.13, lm.y * 0.29) > 0.5) ? 1 : -1;
      ch.crib = { x: gx - ox * 7 + tx * side * 17, y: gy - oy * 7 + ty * side * 17, a: ch.a };
      ch.tree = { x: gx - ox * 7 - tx * side * 17, y: gy - oy * 7 - ty * side * 17 };
      ch.carols = { x: gx + ox * 13 - tx * side * 9, y: gy + oy * 13 - ty * side * 9 };
      L.churches.push(ch);
    }
    xmas.L = L;
    return L;
  }
  function xmasStarAt(s, out) { // where a house hangs its paper star: the middle of its street front, near the first-floor chajja
    const f = s.front, x = f === 'W' ? s.x - 1.2 : f === 'E' ? s.x + s.w + 1.2 : s.cx, y = f === 'N' ? s.y - 1.2 : f === 'S' ? s.y + s.d + 1.2 : s.cy;
    out.x = x; out.y = y; out.h = Math.min(s.h - 2, 13); out.f = f;
    out.col = ['#f2c230', '#e83a5a', '#40c0ff', '#efe9dc', '#ff8a2a'][(hsh(s.x, 9) * 5) | 0];
    return out;
  }
  function xmasHouse(s) { // does this house hang a star? (0..1 share by district)
    if (s.t !== 'bldg' || !s.front || !(s.h > 7)) return false;
    const d = N.world.districtAt(s.cx, s.cy);
    return !!(d && XMAS_DIST[d.id] && hsh(s.cx, s.cy) < 0.62 * XMAS_DIST[d.id]);
  }
  const xsTmp = { x: 0, y: 0, h: 0, f: '', col: '' };
  ov('christmas', {
    draw() {
      const v = R.view;
      // paper stars hung at the fronts of houses (Secunderabad, Marredpally, Abids, ...)
      let n = 0;
      const list = [];
      N.world.queryStructures(v.x0 - 20, v.y0 - 20, v.x1 + 20, v.y1 + 20, (s) => {
        if (n > 60 || !xmasHouse(s)) return;
        n++; list.push(s);
      });
      for (const s of list) {
        const ss = s;
        R.queue('structures', R.distKey(s.cx, s.cy), () => {
          frame();
          const st = xmasStarAt(ss, xsTmp);
          const h = st.h + Math.sin(TIME * 1.5 + ss.x) * 0.4;
          drawStar(st.x, st.y, h, st.col, 5.6);
          if (NIGHT > 0.15) { light(st.x, st.y, 30, st.col, 1, h); glowAt(st.x, st.y, h, st.col); glowAt(st.x, st.y, h - 0.5, '#ffffff'); }
        });
      }
      const L = xmasLayout(); if (!L) return;
      const lit = NIGHT > 0.15;
      for (const ch of L.churches) {
        const lm = ch.lm;
        if (!inView(lm.x, lm.y, Math.max(lm.w, lm.d) + 60)) continue;
        const cc = ch;
        // the church lit up: bulb strings along the roof edges, a big star over the door, floodlight on the front
        R.queue('structures', R.distKey(lm.x, lm.y) + 3, () => {
          frame();
          const hh = (lm.h || 40) * 0.62, x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2, x1 = lm.x + lm.w / 2, y1 = lm.y + lm.d / 2;
          const cols = ['#ffe070', '#ff5050', '#60ff90', '#60b0ff'];
          bulbString(x0, y0, hh, x1, y0, hh, Math.round(lm.w / 2.4), cols, 0.4, TIME * 3);
          bulbString(x1, y0, hh, x1, y1, hh, Math.round(lm.d / 2.4), cols, 0.4, TIME * 3 + 1);
          bulbString(x1, y1, hh, x0, y1, hh, Math.round(lm.w / 2.4), cols, 0.4, TIME * 3 + 2);
          bulbString(x0, y1, hh, x0, y0, hh, Math.round(lm.d / 2.4), cols, 0.4, TIME * 3 + 3);
          const fx = lm.x + cc.ox * (cc.ox ? lm.w / 2 : 0), fy = lm.y + cc.oy * (cc.oy ? lm.d / 2 : 0);
          drawStar(fx + cc.ox * 1.5, fy + cc.oy * 1.5, (lm.h || 40) * 0.55, '#fff0a0', 6.5);
          if (lit) {
            for (let i = 0; i < 8; i++) { const t = i / 8; glowAt(x0 + (x1 - x0) * t, y0, hh, cols[i % 4]); glowAt(x0 + (x1 - x0) * t, y1, hh, cols[(i + 1) % 4]); glowAt(x0, y0 + (y1 - y0) * t, hh, cols[(i + 2) % 4]); glowAt(x1, y0 + (y1 - y0) * t, hh, cols[(i + 3) % 4]); }
            glowAt(fx + cc.ox * 1.5, fy + cc.oy * 1.5, (lm.h || 40) * 0.55, '#fff0a0');
            light(fx + cc.ox * 8, fy + cc.oy * 8, 60, '#ffe8c0', 1, 8);
          }
          flushBulbs();
        });
        // the crib: a thatched shed open to the street, straw, the family and the animals, a star above
        const cb = ch.crib;
        if (inView(cb.x, cb.y, 40)) R.queue('structures', R.distKey(cb.x, cb.y), () => {
          frame();
          const D = N.draw, x = cb.x, y = cb.y, hw = 6, hd = 4.5, ox = cc.ox, oy = cc.oy, tx = cc.tx, ty = cc.ty;
          const P = (u, w) => [x + tx * u + ox * w, y + ty * u + oy * w]; // u across, w towards the street
          D.poly([P(-hw, -hd), P(hw, -hd), P(hw, -hd + 1), P(-hw, -hd + 1)], 0, 6, { wall: '#9a7a4a', roof: '#b8964a', wallFlat: true });
          for (const [u, w] of [[-hw, hd], [hw, hd], [-hw, -hd], [hw, -hd]]) { const q = P(u, w); D.cyl(q[0], q[1], 0.4, 0, 7, { wall: '#7a5a3a', grad: false, top: false }); }
          const kf = kh(0.4); ctx.fillStyle = '#d8bc70'; ctx.beginPath(); for (const [u, w] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) { const q = P(u, w); ctx.lineTo(sxp(q[0], kf), syp(q[1], kf)); } ctx.closePath(); ctx.fill();
          const k = kh(2.6);
          for (const [u, w, col] of [[-2.6, -1, '#2a5cb8'], [2.6, -1, '#8a5a32'], [0, 0.8, '#f4e8c0'], [-4.4, 2.4, '#f4f0e8'], [4.4, 2.2, '#9a6a3a']]) { const q = P(u, w); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sxp(q[0], k), syp(q[1], k), 1.3 * k, 0, TAU); ctx.fill(); }
          const kr = kh(8.5); ctx.fillStyle = 'rgba(184,150,74,0.85)'; ctx.beginPath(); for (const [u, w] of [[-hw - 1, -hd - 1], [hw + 1, -hd - 1], [hw + 1, hd + 0.5], [-hw - 1, hd + 0.5]]) { const q = P(u, w); ctx.lineTo(sxp(q[0], kr), syp(q[1], kr)); } ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(120,90,40,0.6)'; ctx.lineWidth = 0.5; ctx.beginPath(); for (let u = -hw; u <= hw; u += 1.5) { const a1 = P(u, -hd - 1), b1 = P(u, hd + 0.5); ctx.moveTo(sxp(a1[0], kr), syp(a1[1], kr)); ctx.lineTo(sxp(b1[0], kr), syp(b1[1], kr)); } ctx.stroke();
          drawStar(x, y, 13 + Math.sin(TIME * 2) * 0.3, '#ffe060', 3.4);
          if (lit) { light(x + ox * 6, y + oy * 6, 34, '#ffe8a0', 1, 6); glowAt(x, y, 13, '#ffe060'); glowAt(x, y, 5, '#ffd080'); }
          reset();
        });
        // the Christmas tree: tiers of green, coloured balls, a bulb spiral and a star on top
        const tr = ch.tree;
        if (inView(tr.x, tr.y, 30)) R.queue('structures', R.distKey(tr.x, tr.y), () => {
          frame();
          const D = N.draw;
          D.cyl(tr.x, tr.y, 0.7, 0, 3, { wall: '#6a4a2a', grad: false, top: false });
          for (const [r0, h0, h1] of [[6, 3, 7], [4.6, 7, 11], [3.2, 11, 15]]) D.dome(tr.x, tr.y, r0, h0, h1, { fill: '#2a7a3a', steps: 3 });
          for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 5 - i * 0.28, h = 4 + i * 0.8, k = kh(h); ctx.fillStyle = ['#ff3040', '#ffe040', '#40a0ff', '#ff80e0'][i % 4]; ctx.fillRect(sxp(tr.x + Math.cos(a) * r, k) - 0.7 * k, syp(tr.y + Math.sin(a) * r, k) - 0.7 * k, 1.4 * k, 1.4 * k); if (lit && i % 2) glowAt(tr.x + Math.cos(a) * r, tr.y + Math.sin(a) * r, h, ['#ff3040', '#ffe040', '#40a0ff', '#ff80e0'][i % 4]); }
          drawStar(tr.x, tr.y, 16.5, '#ffe060', 2.2);
          if (lit) { glowAt(tr.x, tr.y, 16.5, '#ffe060'); light(tr.x, tr.y, 26, '#ffd8a0', 0.8, 8); }
          reset();
        });
        // carol singers at the gate in the evening (white shirts, red stoles, facing the street)
        const m = N.clock.minutes;
        if (m > 18.5 * 60 && m < 23 * 60) crowdDraw('carols:' + ch.id, null, 7, 5, { at: [ch.carols.x, ch.carols.y], standP: 1, faceA: ch.a, lookList: [lookIdx.caroler, lookIdx.crowd3, lookIdx.caroler, lookIdx.kid2, lookIdx.crowd9, lookIdx.caroler, lookIdx.kid4] });
      }
      R.queue('light', 6, () => { frame(); flushBulbGlow(); });
    },
  });

  /* ---------------------------------------------------------------- YEAR 2026 (epilogue) */
  ov('year2026', {
    draw() {
      const ch = placeXY('charminar');
      if (!ch || !inView(ch.x, ch.y, 300)) return;
      // wooden police barricades: "the plaza is closed to traffic this evening" (nothing modern)
      const spots = [[ch.x, ch.y - 158, 0], [ch.x + 158, ch.y + 10, 1], [ch.x, ch.y + 165, 0], [ch.x - 158, ch.y + 10, 1]];
      for (const s of spots) {
        if (!inView(s[0], s[1], 40)) continue;
        const ss = s;
        R.queue('structures', R.distKey(s[0], s[1]), () => {
          frame();
          for (let i = -1; i <= 1; i++) {
            const x = ss[0] + (ss[2] ? 0 : i * 11), y = ss[1] + (ss[2] ? i * 11 : 0);
            const w = ss[2] ? 2 : 10, d = ss[2] ? 10 : 2;
            N.draw.box(x - w / 2, y - d / 2, w, d, 2.5, 5.5, { wall: '#e8e0d0', roof: i ? '#d8402a' : '#efe9dc' });
            for (const s2 of [-1, 1]) N.draw.cyl(x + (ss[2] ? 0 : s2 * 4), y + (ss[2] ? s2 * 4 : 0), 0.5, 0, 3, { wall: '#5a5a62', grad: false, top: false });
          }
          reset();
        });
      }
      crowdDraw('evening2026', 'charminar_plaza', 14, 110, { dx: -90, dy: -40, standP: 0.3 });
    },
  });

  /* ---------------------------------------------------------------- MONSOON + MIST */
  function weatherTick() {
    const d = S.date(), m = N.clock.minutes;
    let rain = false;
    if (state.monsoon) {
      const h = hsh(d.y * 13 + d.m, d.d * 7);
      if (h < 0.4) { const start = 14 * 60 + Math.floor(hsh(d.d, d.m) * 240); rain = m >= start && m < start + 120; }
    }
    let mist = (d.m === 12 || d.m === 1) && m > 5.5 * 60 && m < 7.5 * 60;
    // [atmosphere hook] the live weather (src/atmosphere.js: schedule, settings, storms) decides when present
    if (N.weather && typeof N.weather.raining === 'boolean') { rain = N.weather.raining; mist = N.weather.mist > 0.05; }
    if (N.flags && N.flags.rain === true) rain = true;
    if (N.flags && N.flags.rain === false) rain = false;
    if (rain !== S.raining || mist !== S.mist) {
      S.raining = rain; S.mist = mist;
      if (N.flags) N.flags.raining = rain;   // read by vehicles.js (wet roads) and audio
      N.emit('weather', { rain, mist });
    }
  }
  const rainDrops = [];
  function drawWeather() {
    if (S.raining) {
      R.queue('fx', 2, () => {
        frame();
        ctx.globalAlpha = 0.16; ctx.fillStyle = '#304a6a'; ctx.fillRect(0, 0, R.W, R.H); ctx.globalAlpha = 1;
        const n = Math.round(150 * quality());
        while (rainDrops.length < n) rainDrops.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.6 });
        ctx.strokeStyle = 'rgba(215,232,255,0.62)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const dr = rainDrops[i];
          dr.y += 0.035 * dr.s; dr.x += 0.006 * dr.s; if (dr.y > 1) { dr.y -= 1; dr.x = Math.random(); }
          const X = dr.x * R.W, Y = dr.y * R.H;
          ctx.moveTo(X, Y); ctx.lineTo(X + 3 * dr.s, Y + 14 * dr.s);
        }
        ctx.stroke();
        // splashes: little rings where drops hit
        ctx.strokeStyle = 'rgba(220,236,255,0.5)'; ctx.beginPath();
        for (let i = 0; i < n / 3; i++) { const X = Math.random() * R.W, Y = Math.random() * R.H, r = 1 + Math.random() * 2; ctx.moveTo(X + r, Y); ctx.ellipse(X, Y, r, r * 0.6, 0, 0, TAU); }
        ctx.stroke();
        reset();
      });
    }
    if (S.mist) {
      const m = N.clock.minutes, a = 0.15 * Math.sin(((m - 330) / 120) * Math.PI);
      if (a > 0.01) R.queue('fx', 1, () => { frame(); ctx.globalAlpha = a; ctx.fillStyle = '#e8eef4'; ctx.fillRect(0, 0, R.W, R.H); reset(); });
    }
  }

  /* ================================================================ system */
  let lastUpdate = 0;
  N.addSystem({
    id: 'seasons', order: 46, runIn: ['play', 'dialogue', 'cutscene', 'title'],
    init() {
      makeLooks();
      try {
        if (N.save && N.save.register) {
          N.save.register('seasons', {
            serialize: () => { const o = {}; for (const k in overrides) o[k] = overrides[k].on; return { overrides: o }; },
            deserialize: (j) => { overrides = {}; if (j && j.overrides && typeof j.overrides === 'object') for (const k in j.overrides) if (ALL.indexOf(k) >= 0) overrides[k] = { on: !!j.overrides[k], mission: null }; apply('load'); },
          });
        }
      } catch (e) { N.err('seasons.save', e); }
      apply('init');
    },
    reset() {
      overrides = {}; lastDate = null;
      for (const k in crowds) delete crowds[k];
      parts.length = 0;
      apply('reset');
    },
    update(dt) {
      if (!N.world || !N.world.built) return;
      lastUpdate += dt;
      frame();
      for (const n of ALL) { const o = OV[n]; if (o && o.update && enabled(n)) { try { o.update(dt); } catch (e) { N.err('seasons.update:' + n, e); } } }
      for (const k in crowds) updateCrowd(crowds[k], dt);
      updateParts(dt);
      weatherTick();
    },
    draw() {
      if (!N.world || !N.world.built || !N.render || !N.render.ctx) return;
      const mode = N.state && N.state.mode;
      if (mode === 'minigame' || mode === 'boot') return;
      frame();
      const q = R.queue;
      if (S.profile) for (const k in S.prof) S.prof[k] = 0;
      for (const n of ALL) {
        const o = OV[n];
        if (!o || !o.draw || !enabled(n)) continue;
        // S.profile = true: time every queued draw per overlay (S.prof[name] = ms, last frame)
        if (S.profile) { const nn = n; S.prof[nn] = 0; R.queue = (layer, key, fn) => q.call(R, layer, key, (c) => { const t = performance.now(); try { fn(c); } finally { S.prof[nn] += performance.now() - t; } }); }
        try { o.draw(); } catch (e) { N.err('seasons.draw:' + n, e); } finally { R.queue = q; }
      }
      if ((state.monsoon || S.mist) && !(N.weather && N.weather.draws2d)) drawWeather(); // [atmosphere hook] weather.js draws the rain
      R.queue('light', 7, () => { frame(); flushBulbGlow(); });
    },
  });
  N.on('boot', () => { try { RESP.rebuild(); apply('boot'); } catch (e) { N.err('seasons.boot', e); } });
  N.on('save:loaded', () => apply('load'));
  N.on('world:built', () => { RX.built = false; num.L = null; xmas.L = null; });
  /** 3D parity (ARCHITECTURE §20): what the overlays show near (cx, cy) within r, as plain data.
   *  -> {kites: [{x, y, h, ax, ay, ah, color}], people: [{x, y, h, a, look, carry?}], props: [{kind, x, y, h?, a?, ...}]} */
  S.scene = function (cx, cy, r) {
    const out = { kites: [], people: [], props: [] };
    if (!N.world || !N.world.built) return out;
    makeLooks();
    const R2 = (r || 400) * (r || 400), near = (x, y) => (x - cx) * (x - cx) + (y - cy) * (y - cy) < R2;
    TIME = (N.time && N.time.real) || 0;
    if (enabled('sankranti')) {
      const wind = Math.sin(TIME * 0.05) * 0.4 - 2.3; sank.wx = Math.cos(wind); sank.wy = Math.sin(wind);
      N.world.queryStructures(cx - r, cy - r, cx + r, cy + r, (st) => {
        if (out.kites.length > 60 || st.t !== 'bldg' || st.roofType !== 'flat' || st.h < 9) return;
        const pp = KITE_STYLES[st.style]; if (!pp || hsh(st.x, st.y) > 0.5 * pp) return;
        kitePos(st, kp);
        out.kites.push({ x: kp.x, y: kp.y, h: kp.h, ax: kp.ax, ay: kp.ay, ah: st.h + 9, color: KCOL[kp.ci % KCOL.length] });
        out.people.push({ x: kp.ax, y: kp.ay, h: st.h, a: Math.atan2(kp.y - kp.ay, kp.x - kp.ax), look: LOOKS[lookIdx['kid' + ((hsh(st.x, st.y) * 6) | 0)] || 0] });
      });
    }
    for (const k in crowds) { const c = crowds[k]; for (const p of c.people) if (near(p.x, p.y)) out.people.push({ x: p.x, y: p.y, h: 0, a: p.a, look: LOOKS[p.li] }); }
    if (enabled('bonalu') && bon.procs) for (const pr of bon.procs) for (const m of pr.members) {
      if (m.d < 0) continue; along(pr.path, m.d, tmpP);
      const x = tmpP.x - Math.sin(tmpP.a) * m.side, y = tmpP.y + Math.cos(tmpP.a) * m.side;
      if (near(x, y)) out.people.push({ x, y, h: 0, a: tmpP.a, look: LOOKS[m.li], carry: m.kind === 'bonam' ? 'bonam' : m.kind === 'drum' ? 'dappu' : m.kind === 'poth' ? 'neem' : null });
    }
    if (enabled('ganesh_immersion') && imm.path) {
      for (const rg of imm.rigs) {
        bundAt(rg.d, 11, bp); if (!near(bp.x, bp.y)) continue;
        out.props.push({ kind: rg.kind, x: bp.x, y: bp.y, a: bp.a, idol: rg.has ? { size: rg.size, colors: rg.idol } : null });
        // the teenmaar dancers behind the rig and the two drummers beside it (as the 2D overlay places them)
        const a = bp.a, ca = Math.cos(a), sa = Math.sin(a), L = rg.kind === 'giant' ? 36 : 26;
        for (let i = 0; i < rg.dancers; i++) {
          const t = rg.ph * 2 + i * 1.9, u = -L - 4 - (i % 3) * 7 + Math.sin(t * 0.7) * 2, w = ((i * 5) % 9 - 4) * 3.4 + Math.sin(t) * 1.5;
          out.people.push({ x: bp.x + ca * u - sa * w, y: bp.y + sa * u + ca * w, h: 0, a: a + Math.sin(t * 2) * 2.2, look: LOOKS[lookIdx[i % 3 ? 'dancer' : 'dancer2'] || 0] });
        }
        for (let i = 0; i < 2; i++) { const u = -6 + i * 12, w = (i ? 1 : -1) * 15; out.people.push({ x: bp.x + ca * u - sa * w, y: bp.y + sa * u + ca * w, h: 0, a, look: LOOKS[lookIdx.drummer || 0], carry: 'dappu' }); }
      }
      for (const c of imm.cranes) if (near(c.x, c.y)) out.props.push({ kind: 'crane', x: c.x, y: c.y, ox: c.ox, oy: c.oy, t: c.t % 16 });
      for (const w of imm.watch || []) if (near(w.x, w.y)) out.people.push({ x: w.x, y: w.y, h: 0, a: w.a, look: LOOKS[w.li] });
    }
    if ((enabled('ramzan') || enabled('chand_raat')) && ram.stalls) {
      for (const st of ram.stalls) if (near(st.x, st.y)) out.props.push({ kind: 'stall', x: st.x, y: st.y, a: st.a, color: st.col });
      for (const b2 of ram.bhattis || []) if (near(b2[0], b2[1])) out.props.push({ kind: 'haleem_bhatti', x: b2[0], y: b2[1] });
      for (const st of ram.strings || []) if (!st.own && (near(st.x0, st.y0) || near(st.x1, st.y1))) out.props.push({ kind: 'bulbs', x: st.x0, y: st.y0, h: st.h0, x1: st.x1, y1: st.y1, h1: st.h1, colors: ['#40ff80', '#ffffff'] });
    }
    if (enabled('summer') && summ.sheds) for (const sh of summ.sheds) if (near(sh.x, sh.y)) out.props.push({ kind: 'chalivendram', x: sh.x, y: sh.y, a: sh.a });
    // christmas: cribs, trees, lit churches and house stars are built by src/festivals3d.js from S.layout.christmas()
    return out;
  };
  S._debug = { crowds, parts, OV, bon, imm, ram, sank, RX, num, xmas };
  /** Festival layouts as data, shared by the 2D overlays and the 3D decor (src/festivals3d.js). */
  S.layout = {
    numaish: () => numaishLayout(),                  // {g, stalls, counters, tables, strings, food, carousel, train, mast, search, booth, pools, avoid}
    numaishState: () => num,                         // {train (ellipse angle of the engine), car (carousel angle), open}
    trainAt: (T, t, out) => trainAt(T, t, out || {}),
    christmas: () => xmasLayout(),                   // {churches: [{id, lm, gate, ox, oy, tx, ty, a, crib, tree, carols}]}
    xmasHouse: (s) => xmasHouse(s), xmasStarAt: (s, out) => xmasStarAt(s, out || {}),
    bonalu: () => bon.procs,                         // [{id, path, L, members: [{kind, d, side}], festoons: [{x, y, a}], thottelu, span}]
    along: (pts, d, out) => along(pts, d, out || {}),
  };
  S._weatherTick = weatherTick; // [atmosphere hook] atmosphere.js re-syncs is('rain') the moment its weather flips
})();
