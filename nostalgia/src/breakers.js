/* NOSTALGIA — breakers.js  (N.breakers: the speed breakers of 2003 Hyderabad)
 *
 * Every school gate had a pair of them, every temple, mosque, church and dargah on a busy street one, the big
 * hospitals rumble strips on the main road, and every colony at least one the residents poured themselves after
 * a scare (plain tar, often with a gap at the kerb that every scooter squeezed through). GHMC painted theirs in
 * black-and-yellow (or black-and-white) stripes that wore off where the tyres ran. This module puts them on the
 * road graph (N.world.roads) and makes them matter:
 *   - placement (deterministic, N.util.rng('breakers')), on 'world:built': a pair flanking each school / college /
 *     hospital gate, one in front of each temple, mosque, church, dargah and market, the home colony's own hump
 *     on Chinnu's lane, and self-made humps along colony lanes and streets by district style. On a main road
 *     (arterial) they are rumble strips. Never inside a junction's mouth (zebras, stop lines), on a bridge deck, a
 *     divided road or a level crossing: the whole strip must lie on plain ROAD.
 *   - 2D: painted into the cached ground chunks (wraps N.render.setGroundPainter): the hump lit on the side facing
 *     the north-west light and shaded on the other, its stripes, the tyre scuffs through the paint, the kerb gap;
 *     rumble strips as thin painted bars.
 *   - 3D: a 'custom' structure per breaker (the core's chunk builder, through the dispatcher ameerpet.js / hills.js
 *     register): the hump's real profile across the road on the terrain, its stripes, the gap.
 *   - riding over (system 'breakers', order 30.5, right after the vehicles move): each wheel's height on the hump
 *     lifts and pitches the body (v.hump in 3D units, v.humpPitch: vehicles.js 2D, view3d_actors.js and
 *     models3d_vehicles.js 3D, the first-person seat in view3d.js); taken faster than the vehicle's comfortable
 *     speed it costs speed, launches the body
 *     (two-wheelers most), lands with a jolt, shakes the camera and goes DHADAK; a cycle or scooter taken over one
 *     flat out may throw him off (never on the relaxed difficulty). Two-wheelers through a kerb gap feel nothing.
 *   - traffic (traffic.js speed planning calls limitAhead): drivers ease off before a breaker to their own idea of
 *     a comfortable speed (some barely at all) and pick up after it.
 * Events: 'vehicle:breaker' {vehicle, breaker, speed, severity (0 = gently .. 2), kind, why, wheel, lead, air,
 * x, y, player} once per wheel over the crest (the cargo meters in story.js / story2.js / sidejobs.js count a hard
 * leading-wheel hit like a pothole).
 *
 * API N.breakers = {TUNE, list, count, at(x, y), near(x, y, r), nearest(x, y, filter?), profile(b, s, l),
 *   limitAhead(v, range), comfyFor(v), stats(), hash(), _build()}
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const clamp = U.clamp;

  const TUNE = {
    // ---- where
    poiReach: 95,         // a place this close to a road gets its breaker(s) there
    pairGap: 30,          // a school's / hospital's two humps: this far each way from the point in front of the gate
    pairTries: [30, 40, 22, 52, 64], // ... or, when that spot will not do, these (outwards only)
    poiPair: { school: 1, hospital: 1 },
    poiOne: { temple: 1, mosque: 1, church: 1, dargah: 1, market: 1 },
    // self-made humps per u of colony road, by district style (x the style factor)
    colony: { lane: 1 / 1400, street: 1 / 2400 },
    styleK: { colony: 1, oldcity: 0.8, market: 0.6, posh: 0.7, cantonment: 0.55, colonial: 0.5, hitec: 0.12, rocky: 0.3 },
    minRoad: 90,          // no self-made hump on a road shorter than this
    span: 0.72,           // a strip reaches at least this much of the road's half width each way from its centre line
    bendMax: 0.3,         // a road turning more than this (rad) at a point is a bend a hump keeps clear of
    junctionPad: 20,      // clear of a junction by its half width + this (zebras, stop lines)
    lanePad: 8,           // ... a crossing of colony lanes only (no zebras there)
    arterialPad: 45,      // ... a junction on a main road (its 3D junction box trims the roads further back than 2D)
    bendPad: 6,           // clear of a bend (a degree-2 node) by half the hump's depth + this
    spacing: 80,          // no two breakers closer than this (a gate's pair aside)
    railPad: 40,
    max: 700,
    // ---- the hump: depth along the road (u), height (3D units), stripes
    depth: { hump: 6.2, tar: 5.4, rumble: 8 },
    h3: { hump: 0.95, tar: 0.8, rumble: 0.2 },
    stripe: 2.4,          // stripe width across the road (u)
    rumbleN: 4,           // bars in a rumble strip
    gap: 3.6,             // the kerb gap two-wheelers squeeze through (u)
    medianHalf: 2.8,      // a road with a median (world.js paints it 4 u wide on the centre line): the strip stops short of it
    // ---- riding over: the comfortable crossing speed (u/s) by class; slower than this the hump is just a lift
    comfy: { pedal: 26, bike: 30, auto: 20, car: 24, heavy: 16 },
    loss0: 0.04, lossK: 0.2, lossMax: 0.38, // speed lost at the leading wheel's crest: loss0 + lossK * severity
    air: { pedal: 0.11, bike: 0.1, auto: 0.06, car: 0.045, heavy: 0.03 }, // launch (3D u/s up) per u/s over comfy
    g: 42,                // the body's fall (3D u/s²)
    shake: 1.4, view: 140,
    fallAt: 0.95, fallP: 0.55, fallCD: 40, // a two-wheeler's fall: severity from fallAt, chance fallP * (sev - 0.6)
    lineEvery: 26,
    // ---- traffic: the speed a driver takes it at = comfy x (0.7 .. 1.25, a few hotheads 1.6)
    aiLook: 140,
  };

  const A = { list: [], grid: new Map(), built: false, stats: null };
  const CG = 48;
  const ckey = (i, j) => j * 4096 + i;

  /* ================================================================ placement */
  function build() {
    const W = N.world, RG = W && W.roads;
    A.list = []; A.grid = new Map(); A.built = false;
    if (!RG || !RG.edges || !W.surfaceAt) return;
    const S = N.SURF, surf = W.surfaceAt, nodes = RG.nodes, edges = RG.edges;
    const rng = U.rng('breakers:v1');
    const stats = { byWhy: {}, byKind: {}, rejected: { junction: 0, surface: 0, near: 0, rail: 0, short: 0 }, pairs: [] };
    // junctions (degree >= 3) on a coarse grid; the zebra crossings and stop lines are painted on a junction's street /
    // arterial / bund arms (world.js), so those keep junctionPad; a crossing of colony lanes only its mouth (lanePad)
    const JG = 64, jg = new Map(), jpad = new Map();
    for (const n of nodes) {
      if (n.deg < 3) continue;
      const k = ckey(Math.floor(n.x / JG), Math.floor(n.y / JG)); (jg.get(k) || jg.set(k, []).get(k)).push(n);
      let zebra = false, main = false;
      for (const id of n.inc) { const kd = edges[id].kind; if (kd !== 'lane' && kd !== 'path' && kd !== 'bridge') zebra = true; if (kd === 'arterial') main = true; }
      jpad.set(n.id, main ? TUNE.arterialPad : zebra ? TUNE.junctionPad : TUNE.lanePad);
    }
    const nearJunction = (x, y, r) => {
      for (let j = Math.floor((y - r - 40) / JG); j <= Math.floor((y + r + 40) / JG); j++) for (let i = Math.floor((x - r - 40) / JG); i <= Math.floor((x + r + 40) / JG); i++) {
        const l = jg.get(ckey(i, j)); if (!l) continue;
        for (const n of l) { const rr = r + n.w / 2 + jpad.get(n.id); if ((n.x - x) * (n.x - x) + (n.y - y) * (n.y - y) < rr * rr) return true; }
      }
      return false;
    };
    // the rails (level crossings)
    const rails = ((N.WORLD_DATA && N.WORLD_DATA.rails) || []).filter((r) => r.pts && r.pts.length > 1);
    const nearRail = (x, y) => {
      for (const r of rails) for (let k = 1; k < r.pts.length; k++) { if (segDist(x, y, r.pts[k - 1], r.pts[k]) < TUNE.railPad) return true; }
      return false;
    };
    // edges of drivable kinds on a grid (the places look up the nearest road)
    const KINDS = { lane: 1, street: 1, arterial: 1 };
    const EG = 96, eg = new Map();
    for (const e of edges) {
      if (!KINDS[e.kind] || !(e.len > 0)) continue;
      const a = nodes[e.a], b = nodes[e.b];
      for (let j = Math.floor((Math.min(a.y, b.y) - 4) / EG); j <= Math.floor((Math.max(a.y, b.y) + 4) / EG); j++) for (let i = Math.floor((Math.min(a.x, b.x) - 4) / EG); i <= Math.floor((Math.max(a.x, b.x) + 4) / EG); i++) {
        const k = ckey(i, j); (eg.get(k) || eg.set(k, []).get(k)).push(e);
      }
    }
    const nearestEdge = (x, y, reach, road) => {
      let best = null, bd = reach;
      for (let j = Math.floor((y - reach) / EG); j <= Math.floor((y + reach) / EG); j++) for (let i = Math.floor((x - reach) / EG); i <= Math.floor((x + reach) / EG); i++) {
        const l = eg.get(ckey(i, j)); if (!l) continue;
        for (const e of l) {
          if (road && e.road !== road) continue;
          const a = nodes[e.a], b = nodes[e.b], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
          const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / L2, 0, 1), px = a.x + dx * t, py = a.y + dy * t;
          const d = Math.hypot(x - px, y - py) - e.w / 2;
          if (d < bd) { bd = d; best = { e, t }; }
        }
      }
      return best;
    };
    const tooNear = (x, y, gap, except) => {
      for (const b of A.list) { if (b === except) continue; const r = gap; if ((b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) < r * r) return true; }
      return false;
    };
    // the road's own edges are short (its every point is a node): a degree-2 node where it bends gently is no bend
    // for a hump; a sharp one (or a junction, or a dead end) keeps it clear
    const sharp = (n) => {
      if (n.deg !== 2) return true;
      if (n._bkSharp != null) return n._bkSharp;
      const e1 = edges[n.inc[0]], e2 = edges[n.inc[1]];
      const d1 = e1.a === n.id ? e1.angle : e1.angle + Math.PI, d2 = e2.a === n.id ? e2.angle : e2.angle + Math.PI;
      return (n._bkSharp = Math.PI - Math.abs(U.angleDiff(d1, d2)) > TUNE.bendMax);
    };
    // move du along edge e (from its a towards b) past degree-2 nodes onto the road's next edges (never through a
    // junction or past a dead end)
    const slide = (e, t, du) => {
      let cur = e, pos = t * e.len + du, guard = 0;
      while ((pos < 0 || pos > cur.len) && guard++ < 10) {
        const at = pos < 0 ? cur.a : cur.b, n = nodes[at];
        if (n.deg !== 2) return null;
        const nx = edges[n.inc[0] === cur.id ? n.inc[1] : n.inc[0]];
        if (!KINDS[nx.kind] || !(nx.len > 0)) return null;
        const over = pos < 0 ? -pos : pos - cur.len;
        pos = nx.a === at ? over : nx.len - over;
        cur = nx;
      }
      return pos >= 0 && pos <= cur.len ? { e: cur, t: pos / cur.len } : null;
    };
    // a candidate spot on edge e at parameter t: the whole strip on plain road, clear of junctions, sharp bends, rails
    const spot = (e, t, look) => {
      const a = nodes[e.a], b = nodes[e.b];
      const ux = (b.x - a.x) / e.len, uy = (b.y - a.y) / e.len, nx = -uy, ny = ux;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const d = TUNE.depth[look] || 6, half = e.w / 2 - 1.2;
      if (half < 5) return null;
      const da = e.len * t, db = e.len * (1 - t);
      const pad = (n) => (n.deg >= 3 ? n.w / 2 + jpad.get(n.id) : sharp(n) ? d / 2 + TUNE.bendPad : 0);
      const padA = pad(a), padB = pad(b);
      if (da < padA || db < padB) { stats.rejected.junction++; return null; }
      if (nearJunction(x, y, half)) { stats.rejected.junction++; return null; }
      // kerb to kerb: out from the centre line each way (0.5 u steps) while the strip's edges, quarters, middle and
      // the road just outside it are all plain ROAD (the surface raster has kerb corners finer than the strip, and a
      // lane is narrower than its nominal width in places); at least SPAN of the road's half width each way
      const SS = [0, -d / 2, d / 2, -d / 4, d / 4, -d / 2 - 1, d / 2 + 1];
      const across = (q) => { for (const s of SS) if (surf(x + ux * s + nx * q, y + uy * s + ny * q) !== S.ROAD) return false; return true; };
      if (!across(0)) { stats.rejected.surface++; return null; }
      const ext = (sg) => { let l = 0; while (l + 0.5 <= half && across(sg * (l + 0.5))) l += 0.5; return l; };
      const lp = ext(1), ln = ext(-1);
      if (lp < half * TUNE.span || ln < half * TUNE.span) { stats.rejected.surface++; return null; }
      if (rails.length && nearRail(x, y)) { stats.rejected.rail++; return null; }
      return { x, y, ux, uy, nx, ny, half: (lp + ln) / 2, l0: -ln + 0.3, l1: lp - 0.3, d };
    };
    const add = (e, sp, look, why, o) => {
      o = o || {};
      const paint = look === 'rumble' ? (o.paint || 'white') : look === 'tar' ? 'tar' : o.paint || 'yb';
      const h = TUNE.h3[look] * (o.hk || 1);
      let l0 = sp.l0, l1 = sp.l1, gap = 0;
      if (o.gap) { gap = o.gap; if (gap > 0) l1 -= TUNE.gap; else l0 += TUNE.gap; }
      // a median down the middle (world.js paints one on an arterial unless road.median === false; view3d_ground.js
      // raises a 2 u kerb on a divided one): the strip stops short of it either side
      const rd = e.road || {}, painted = rd.median != null ? !!rd.median : e.kind === 'arterial';
      const med = painted || (rd.divided != null ? !!rd.divided : painted) ? TUNE.medianHalf : 0;
      const b = {
        id: A.list.length, x: sp.x, y: sp.y, ux: sp.ux, uy: sp.uy, nx: sp.nx, ny: sp.ny, a: Math.atan2(sp.uy, sp.ux), med,
        half: sp.half, l0, l1, gap, d: sp.d, h, kind: look === 'rumble' ? 'rumble' : 'hump', look, paint,
        wear: o.wear != null ? o.wear : 0.15 + rng.next() * 0.5, why, edge: e.id, road: e.road && e.road.id, rkind: e.kind,
        seed: (rng.next() * 1e9) | 0,
      };
      A.list.push(b);
      stats.byWhy[why] = (stats.byWhy[why] || 0) + 1; stats.byKind[look] = (stats.byKind[look] || 0) + 1;
      return b;
    };
    // try t, then nudged along the road (a gate in front of a junction moves the hump down the road)
    const placeNear = (e, t, look, why, o, gapReq) => {
      for (const du of [0, 8, -8, 16, -16, 26, -26, 38, -38, 52, -52]) {
        const at = du ? slide(e, t, du) : { e, t };
        if (!at || at.t <= 0 || at.t >= 1) continue;
        const sp = spot(at.e, at.t, look);
        if (!sp) continue;
        if (tooNear(sp.x, sp.y, gapReq != null ? gapReq : TUNE.spacing)) { stats.rejected.near++; continue; }
        return add(at.e, sp, look, why, o);
      }
      return null;
    };

    // 1. places: schools and hospitals get a pair either side of the gate; temples, mosques, churches, dargahs and
    // markets one; on a main road a rumble strip
    const pois = [];
    for (const p of Object.values(N.places || {})) {
      if (TUNE.poiPair[p.kind] || TUNE.poiOne[p.kind]) pois.push({ x: p.x, y: p.y, why: p.kind, id: p.id });
    }
    for (const lm of (N.WORLD_DATA && N.WORLD_DATA.landmarks) || []) {
      const nm = String(lm.name || '');
      const why = /hospital/i.test(nm) ? 'hospital' : /school|college|convent|vidya/i.test(nm) ? 'school' : null;
      if (why && !pois.some((q) => Math.hypot(q.x - lm.x, q.y - lm.y) < 60)) pois.push({ x: lm.x, y: lm.y, why, id: lm.id, r: Math.max(lm.w || 0, lm.d || 0) / 2 });
    }
    pois.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const q of pois) {
      const ne = nearestEdge(q.x, q.y, TUNE.poiReach + (q.r || 0));
      if (!ne) continue;
      const e = ne.e, main = e.kind === 'arterial', look = main ? 'rumble' : 'hump';
      const paint = main ? (q.why === 'school' || q.why === 'hospital' ? 'yellow' : 'white') : q.why === 'school' || q.why === 'hospital' ? 'yb' : rng.next() < 0.6 ? 'wb' : 'yb';
      if (TUNE.poiPair[q.why]) {
        // one each side of the gate, each moved only outwards (away from the gate) when its first spot will not do
        const pair = [], log = { id: q.id, kind: e.kind, w: e.w, tries: [] };
        for (const sg of [-1, 1]) {
          const o = { paint, wear: 0.1 + rng.next() * 0.35 };
          for (const du of TUNE.pairTries) {
            const at = slide(e, ne.t, sg * du); if (!at || at.t <= 0 || at.t >= 1) { log.tries.push(sg * du + ':end'); continue; }
            const r0 = Object.assign({}, stats.rejected), sp = spot(at.e, at.t, look);
            if (!sp) { log.tries.push(sg * du + ':' + Object.keys(r0).find((k) => stats.rejected[k] !== r0[k])); continue; }
            if (tooNear(sp.x, sp.y, TUNE.pairGap * 1.2)) { stats.rejected.near++; log.tries.push(sg * du + ':near'); continue; }
            pair.push(add(at.e, sp, look, q.why, o)); log.tries.push(sg * du + ':ok'); break;
          }
        }
        stats.pairs.push(log);
        if (!pair.length) placeNear(e, ne.t, look, q.why, { paint }, TUNE.spacing * 0.6);
      } else placeNear(e, ne.t, look, q.why, { paint, wear: 0.2 + rng.next() * 0.5 }, TUNE.spacing * 0.75);
    }
    // 2. home: the colony's own hump on Chinnu's lane (the one the residents' association put in)
    const home = N.places && N.places.home;
    if (home) {
      const ne = nearestEdge(home.x, home.y, 160);
      if (ne && ne.e.kind !== 'arterial') placeNear(ne.e, ne.t, 'tar', 'home', { gap: 1, wear: 0.3 });
    }
    // 3. the colonies' self-made humps along each lane and street, by district style (in road order: deterministic)
    for (const r of (N.WORLD_DATA && N.WORLD_DATA.roads) || []) {
      if (A.list.length >= TUNE.max) break;
      const rate = TUNE.colony[r.kind], pts = r.pts;
      if (!rate || !pts || pts.length < 2) continue;
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      const L = cum[cum.length - 1];
      const mid = pts[(pts.length / 2) | 0], dist = W.districtAt ? W.districtAt(mid[0], mid[1]) : null;
      const k = TUNE.styleK[(dist && dist.style) || 'colony'];
      const exp = L * rate * (k == null ? 0.5 : k);
      let n = Math.floor(exp); if (rng.next() < exp - n) n++;
      if (!n) continue;
      if (L < TUNE.minRoad) { stats.rejected.short++; continue; }
      for (let i = 0; i < n; i++) {
        const sAt = L * (0.15 + 0.7 * ((i + rng.next()) / n)), rr = rng.next();
        let m = 1; while (m < cum.length - 1 && cum[m] < sAt) m++;
        const f = (sAt - cum[m - 1]) / ((cum[m] - cum[m - 1]) || 1), px = pts[m - 1][0] + (pts[m][0] - pts[m - 1][0]) * f, py = pts[m - 1][1] + (pts[m][1] - pts[m - 1][1]) * f;
        const ne = nearestEdge(px, py, 30, r);
        const look = rr < 0.55 ? 'tar' : 'hump';
        const o = look === 'tar' ? { gap: rng.next() < 0.45 ? (rng.next() < 0.5 ? 1 : -1) : 0, wear: 0.3 + rng.next() * 0.5, hk: 0.85 + rng.next() * 0.35 } : { paint: rng.next() < 0.6 ? 'wb' : 'yb', wear: 0.35 + rng.next() * 0.55 };
        if (ne) placeNear(ne.e, ne.t, look, 'colony', o);
      }
    }
    // the lookup grid: every breaker in each 48 u cell its strip (+ 20 u: a wheel moving between frames) touches
    for (const b of A.list) {
      const ex = Math.abs(b.ux) * (b.d / 2 + 20) + Math.abs(b.nx) * (b.half + 20), ey = Math.abs(b.uy) * (b.d / 2 + 20) + Math.abs(b.ny) * (b.half + 20);
      for (let j = Math.floor((b.y - ey) / CG); j <= Math.floor((b.y + ey) / CG); j++) for (let i = Math.floor((b.x - ex) / CG); i <= Math.floor((b.x + ex) / CG); i++) {
        const k = ckey(i, j); (A.grid.get(k) || A.grid.set(k, []).get(k)).push(b);
      }
    }
    stats.count = A.list.length;
    A.stats = stats;
    A.built = true;
    // 3D: one 'custom' structure each (the chunk builder builds the hump)
    if (W.addStructure) for (const b of A.list) {
      const r = Math.max(b.half, b.d) + 2;
      b.s = W.addStructure({ t: 'custom', breaker: true, terrSelf: true, x0: b.x - r, y0: b.y - r, x1: b.x + r, y1: b.y + r, cx: b.x, cy: b.y, b, draw: noop, build3d });
    }
    if (N.render && N.render.invalidateChunks) N.render.invalidateChunks();
    N.emit('breakers:built', { count: A.list.length });
  }
  function noop() {}
  function segDist(x, y, p, q) {
    const dx = q[0] - p[0], dy = q[1] - p[1], L2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - p[0]) * dx + (y - p[1]) * dy) / L2, 0, 1);
    return Math.hypot(x - p[0] - dx * t, y - p[1] - dy * t);
  }

  /* ================================================================ lookups */
  function cell(x, y) { return A.grid.get(ckey(Math.floor(x / CG), Math.floor(y / CG))) || null; }
  /** the hump's height (3D units) at along-offset s and across-offset l (0 off it; the ends taper over 1 u) */
  function profile(b, s, l) {
    const hd = b.d / 2;
    if (!(s > -hd && s < hd)) return 0;
    if (l != null && (!(l > b.l0 && l < b.l1) || (b.med && Math.abs(l) < b.med))) return 0;
    let h;
    if (b.kind === 'rumble') {
      const k = ((s + hd) / b.d) * TUNE.rumbleN, f = k - Math.floor(k);
      h = f > 0.3 && f < 0.7 ? b.h * Math.sin(((f - 0.3) / 0.4) * Math.PI) : 0;
    } else { const c = Math.cos((s / b.d) * Math.PI); h = b.h * c * c; }
    if (l != null) { const e = Math.min(l - b.l0, b.l1 - l, b.med ? Math.abs(l) - b.med : 1e9); if (e < 1) h *= Math.max(0, e); }
    return h;
  }
  /** the strip's stretches across the road: kerb to kerb, or either side of a median */
  function spans(b) {
    if (!b.med) return [[b.l0, b.l1]];
    const out = [];
    if (-b.med - b.l0 > 1) out.push([b.l0, -b.med]);
    if (b.l1 - b.med > 1) out.push([b.med, b.l1]);
    return out;
  }
  function at(x, y) {
    const l = cell(x, y); if (!l) return null;
    for (const b of l) {
      const s = (x - b.x) * b.ux + (y - b.y) * b.uy, q = (x - b.x) * b.nx + (y - b.y) * b.ny;
      if (Math.abs(s) < b.d / 2 && q > b.l0 && q < b.l1 && !(b.med && Math.abs(q) < b.med)) return b;
    }
    return null;
  }
  function near(x, y, r) { return A.list.filter((b) => Math.hypot(b.x - x, b.y - y) < r); }
  function nearest(x, y, f) { let best = null, bd = Infinity; for (const b of A.list) { if (f && !f(b)) continue; const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } } return best; }
  function clsOf(v) { const T = v.T || {}; return T.pedal ? 'pedal' : TUNE.comfy[T.cls] ? T.cls : 'car'; }
  function comfyFor(v) { return TUNE.comfy[clsOf(v)]; }

  /* ================================================================ traffic: ease off before a breaker */
  // For traffic.js: {d: room to the hump's near edge from the vehicle's nose, sp: the speed this driver takes it at}
  // or null. The search runs ~3 times a second per vehicle; between searches the found breaker is re-measured.
  const AHEAD = { d: 0, sp: 0 };
  function limitAhead(v, range) {
    if (!A.list.length || !v) return null;
    range = range || TUNE.aiLook;
    const c = Math.cos(v.angle || 0), s = Math.sin(v.angle || 0), now = N.time.now;
    let st = v._bkA;
    if (!st) st = v._bkA = { b: null, at: -1, k: aiK(v) };
    const T = v.T || {}, hw = (T.w || 12) / 2;
    // how far ahead b's centre is (null: not on this vehicle's way: across its path, beside it, behind it, too far)
    const fits = (b) => {
      if (Math.abs(c * b.ux + s * b.uy) < 0.55) return null;
      const q = (v.x - b.x) * b.nx + (v.y - b.y) * b.ny;
      if (q < b.l0 - 1.5 || q > b.l1 + 1.5) return null;
      const ds = (b.x - v.x) * c + (b.y - v.y) * s;
      return ds > -(b.d / 2 + hw + 1) && ds < range ? ds : null;
    };
    if (now - st.at > 0.3) {
      st.at = now; st.b = null;
      let bd = Infinity, seen = null;
      for (let dd = 0; dd <= range; dd += CG * 0.75) {
        const l = cell(v.x + c * dd, v.y + s * dd); if (!l || l === seen) continue; seen = l;
        for (const b of l) { const ds = fits(b); if (ds != null && ds < bd) { bd = ds; st.b = b; } }
      }
    }
    const b = st.b; if (!b) return null;
    const ds = fits(b); if (ds == null) { st.b = null; return null; }
    AHEAD.d = Math.max(0, ds - b.d / 2 - hw); AHEAD.sp = comfyFor(v) * st.k * (b.kind === 'rumble' ? 2.2 : 1);
    return AHEAD;
  }
  // the driver's own idea of gently: most 0.7 .. 1.25 of comfortable, one in twelve a hothead who barely lifts
  function aiK(v) { const h = U.hash2(v.sid || 1, 77); return h < 0.08 ? 1.6 + h * 4 : 0.7 + h * 0.55; }

  /* ================================================================ riding over */
  const reducedMotion = () => !!(document.body && document.body.classList.contains('reduced-motion'));
  const pref = (k, d) => { const st = N.settings || (N.menus && N.menus.settings) || null; return st && st[k] != null ? st[k] : d; };
  let fallAt = -1e9, lineAt = -1e9, lineK = 0;
  const LINES = {
    drive: ['*DHADAK!* Speed breaker!', 'Arre! Who put a hump here?!', '*Dhadak!* My back... slowly next time.', 'Speed breaker! The whole colony heard that.'],
    ride: ['*Uff!* Bhaiyya, speed breaker! Slowly!', '*Dhadak!* He didn\'t even slow down!', 'My head nearly hit the roof!'],
  };
  function update(dt) {
    if (!A.list.length) return;
    const V = N.vehicles, list = V && V.list; if (!list) return;
    const p = N.player, R = N.render;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.asleep || !v.alive) { if (v.hump) clearV(v); continue; }
      const T = v.T;
      if (!T || T.mode === 'boat' || v.fallen) { if (v.hump || v._bkP) clearV(v); continue; }
      const mine = !!p && (v.driver === p || p.vehicle === v);
      if (!mine && (v.kin || !R.inView(v.x, v.y, TUNE.view))) { if (v.hump || v._bkP) clearV(v); continue; }
      ride(v, T, dt, mine, p);
    }
  }
  function clearV(v) { v.hump = 0; v.humpPitch = 0; v._bkP = null; v._bkZ = 0; v._bkVz = 0; v._bkAir = false; }
  function ride(v, T, dt, mine, p) {
    const c = Math.cos(v.angle), s = Math.sin(v.angle), ax = Math.max(2, T.w / 2 - Math.min(3, T.w * 0.18));
    const fx = v.x + c * ax, fy = v.y + s * ax, rx = v.x - c * ax, ry = v.y - s * ax;
    const P = v._bkP;
    let hF = 0, hR = 0;
    const lF = cell(fx, fy), lR = cell(rx, ry);
    if (lF || lR) {
      const bike = T.cls === 'bike';
      const wheel = (b, wx, wy, px, py, which) => {
        const q = (wx - b.x) * b.nx + (wy - b.y) * b.ny;
        // a two-wheeler through the kerb gap (or past the end of the hump) feels nothing
        if (q <= b.l0 + (bike ? 0.3 : -1) || q >= b.l1 - (bike ? 0.3 : -1)) return 0;
        const s1 = (wx - b.x) * b.ux + (wy - b.y) * b.uy;
        if (P) {
          const s0 = (px - b.x) * b.ux + (py - b.y) * b.uy;
          if (((s0 < 0 && s1 >= 0) || (s0 > 0 && s1 <= 0)) && Math.abs(s1 - s0) < 40) crest(v, T, b, which, mine, p, wx, wy);
        }
        return profile(b, s1, q);
      };
      if (lF) for (const b of lF) hF = Math.max(hF, wheel(b, fx, fy, P ? P[0] : 0, P ? P[1] : 0, 'front'));
      if (lR) for (const b of lR) hR = Math.max(hR, wheel(b, rx, ry, P ? P[2] : 0, P ? P[3] : 0, 'rear'));
    }
    const pp = v._bkP || (v._bkP = [0, 0, 0, 0]);
    pp[0] = fx; pp[1] = fy; pp[2] = rx; pp[3] = ry;
    // the body: on its wheels (their mean height, pitched by their difference), or in the air after a launch
    const ground = (hF + hR) / 2;
    if (v._bkAir) {
      v._bkVz -= TUNE.g * dt; v._bkZ += v._bkVz * dt;
      if (v._bkZ <= ground) land(v, T, mine, p);
    }
    v.hump = v._bkAir ? v._bkZ : ground;
    v.humpPitch = Math.atan2(hF - hR, 2 * ax) + (v._bkAir ? clamp(v._bkVz * 0.012, -0.06, 0.09) : 0);
  }
  function crest(v, T, b, which, mine, p, x, y) {
    const sp = Math.abs(v.speed || 0); if (!(sp > 2)) return;
    const lead = (which === 'front') === ((v.speed || 0) >= 0);
    const cls = clsOf(v), comfy = TUNE.comfy[cls], rumble = b.kind === 'rumble';
    let sev = clamp((sp - comfy) / comfy, 0, 2);
    if (rumble) sev *= 0.3;
    // speed: a little always, a lot when taken fast (the trailing wheel half)
    const keep = 1 - clamp((lead ? 1 : 0.5) * (TUNE.loss0 * (rumble ? 0.4 : 1) + TUNE.lossK * sev), 0, TUNE.lossMax);
    v.vx *= keep; v.vy *= keep; v.speed *= keep;
    // the leading wheel over the crest launches the body; the trailing one settles it
    let air = false;
    if (lead && !rumble && sev > 0.12) {
      const vz = TUNE.air[cls] * (sp - comfy);
      if (vz > 1.2 && (!v._bkAir || vz > v._bkVz)) { v._bkAir = true; v._bkVz = vz; v._bkZ = Math.max(v._bkZ || 0, v.hump || 0); v._bkSev = sev; air = true; }
    } else if (!lead) v.jolt = Math.max(v.jolt || 0, clamp((rumble ? 0.15 : 0.22) + 0.35 * sev, 0, 0.8));
    if (T.cls === 'bike' && sev > 0.3) v.av = (v.av || 0) + (Math.random() - 0.5) * 0.7 * Math.min(1.5, sev);
    // sound: a soft thud taken gently, DHADAK taken fast (the trailing wheel softer), a rattle over a rumble strip
    const A2 = N.audio;
    if (A2 && A2.sfx) {
      const k = mine ? 1 : 0.6, pitch = T.cls === 'heavy' ? 0.7 : T.cls === 'bike' ? 1.15 : 1;
      if (rumble) { for (let q = 0; q < 3; q++) A2.sfx('bump', { x, y, vol: (0.18 + 0.2 * sev) * k, pitch: 1.4, delay: q * (b.d / TUNE.rumbleN) / Math.max(10, sp), key: v.sid }); }
      else if (sev < 0.15 || !lead) A2.sfx('bump', { x, y, vol: (0.3 + 0.4 * sev) * k, pitch, key: v.sid });
      else A2.sfx('pothole', { x, y, vol: clamp(0.4 + 0.6 * sev, 0.4, 1) * k, pitch, key: v.sid });
    }
    N.emit('vehicle:breaker', { vehicle: v, breaker: b, speed: sp, severity: sev, kind: b.kind, why: b.why, wheel: which, lead, air, x, y, player: mine });
    if (!mine) return;
    const R = N.render;
    if (R && R.shake && !reducedMotion() && (lead || sev > 0.2)) R.shake(TUNE.shake * clamp((rumble ? 0.15 : 0.25) + 0.6 * sev, 0.12, 1.5) * (lead ? 1 : 0.5), 0.22);
    if (lead && sev > 0.5 && N.time.now - lineAt > TUNE.lineEvery && N.hud && N.hud.toast) {
      lineAt = N.time.now;
      const arr = v.driver === p ? LINES.drive : LINES.ride;
      N.hud.toast(arr[lineK++ % arr.length], 2200);
    }
    // flat out on a two-wheeler: he may come off when it lands
    if (air && v.driver === p && T.cls === 'bike' && sev >= TUNE.fallAt && pref('difficulty', 'normal') !== 'relaxed' &&
      N.time.now - fallAt > TUNE.fallCD && Math.random() < TUNE.fallP * (sev - 0.6)) v._bkFall = true;
  }
  function land(v, T, mine, p) {
    const vz = Math.abs(v._bkVz || 0), sev = v._bkSev || 0;
    v._bkAir = false; v._bkZ = 0; v._bkVz = 0;
    v.jolt = Math.max(v.jolt || 0, clamp(0.35 + vz / 12, 0.35, 1));
    v.joltSide = Math.random() < 0.5 ? -1 : 1;
    if (N.audio && N.audio.sfx && vz > 3) N.audio.sfx('bump', { x: v.x, y: v.y, vol: clamp(0.3 + vz / 14, 0.3, 1) * (mine ? 1 : 0.6), pitch: T.cls === 'heavy' ? 0.7 : 1, key: v.sid });
    if (!mine) { v._bkFall = false; return; }
    if (N.render && N.render.shake && !reducedMotion()) N.render.shake(TUNE.shake * clamp(0.2 + sev * 0.5, 0.2, 1.2), 0.2);
    if (v._bkFall) {
      v._bkFall = false;
      if (p.vehicle === v && v.driver === p && N.state.mode === 'play' && p.fall && p.fall(v, { speed: Math.abs(v.speed || 0), breaker: true })) fallAt = N.time.now;
    }
  }

  /* ================================================================ 2D: painted into the ground chunks */
  const COL = { tar: '#2c2b2e', tarHump: '#333236', yellow: '#e2b51e', white: '#e6e3d6', black: '#1a1a1c' };
  const LIGHT = [-Math.SQRT1_2, -Math.SQRT1_2]; // towards the light (north-west, as the hillshade)
  function paint2D(ctx, x0, y0, w, h) {
    if (!A.list.length) return;
    const seen = new Set();
    for (let j = Math.floor((y0 - 30) / CG); j <= Math.floor((y0 + h + 30) / CG); j++) for (let i = Math.floor((x0 - 30) / CG); i <= Math.floor((x0 + w + 30) / CG); i++) {
      const l = A.grid.get(ckey(i, j)); if (!l) continue;
      for (const b of l) { if (seen.has(b)) continue; seen.add(b); drawOne(ctx, b); }
    }
  }
  function drawOne(ctx, b) {
    const hd = b.d / 2, rnd = U.rng(b.seed);
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(b.a); // local x along the road, y across it (+y = n)
    // which face of the hump catches the light: the one whose outward normal (along +x or -x) points at it
    const lx = LIGHT[0] * b.ux + LIGHT[1] * b.uy, litX = lx > 0 ? 1 : -1, lk = Math.min(1, Math.abs(lx) + 0.35);
    for (const [y0, y1] of spans(b)) {
      const L = y1 - y0;
      if (b.kind === 'rumble') {
        const n = TUNE.rumbleN, col = b.paint === 'yellow' ? COL.yellow : COL.white;
        for (let k = 0; k < n; k++) {
          const cx = -hd + (k + 0.5) * (b.d / n);
          ctx.globalAlpha = 0.55; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx - 0.5 - litX * 0.35, y0, 1.0, L);
          ctx.globalAlpha = 0.9 - b.wear * 0.4; ctx.fillStyle = col; ctx.fillRect(cx - 0.5, y0, 1.0, L);
        }
        continue;
      }
      // the shadow the hump throws on the road (its far side from the light)
      ctx.globalAlpha = 0.28 * lk; ctx.fillStyle = '#000';
      ctx.fillRect(litX > 0 ? -hd - 0.9 : hd - 0.1, y0 + 0.4, 1.0, L - 0.8);
      // the body: fresh tar (a little lighter than the road)
      ctx.globalAlpha = 1; ctx.fillStyle = b.look === 'tar' ? COL.tarHump : COL.black;
      roundRect(ctx, -hd, y0, b.d, L, Math.min(1.2, hd));
      // stripes (GHMC paint) across the road, worn where the tyres run
      if (b.paint === 'yb' || b.paint === 'wb') {
        const col = b.paint === 'yb' ? COL.yellow : COL.white, sw = TUNE.stripe;
        for (let y = y0, k = 0; y < y1 - 0.2; y += sw, k++) {
          if (k % 2) continue;
          const ye = Math.min(y1, y + sw);
          ctx.globalAlpha = clamp(1 - b.wear * 0.7 - rnd.next() * 0.15, 0.2, 1);
          ctx.fillStyle = col; ctx.fillRect(-hd + 0.25, y, b.d - 0.5, ye - y);
        }
        // tyre scuffs: two dark bands per lane where the wheels run over the paint
        ctx.globalAlpha = 0.35 * (0.4 + b.wear); ctx.fillStyle = COL.tar;
        for (const f of [-0.62, -0.38, 0.38, 0.62]) { const y = f * b.half; if (y > y0 + 1 && y < y1 - 1) ctx.fillRect(-hd, y - 1.0, b.d, 2.0); }
      } else if (rnd.next() < 0.5) {
        // a self-made hump: a faded white band if anyone bothered
        ctx.globalAlpha = 0.25 + (1 - b.wear) * 0.25; ctx.fillStyle = COL.white; ctx.fillRect(-0.35, y0 + 0.6, 0.7, L - 1.2);
      }
      // the light across the hump: bright on the lit slope, dark on the other
      const g = ctx.createLinearGradient(-hd, 0, hd, 0);
      const lit = 'rgba(255,248,230,' + (0.22 * lk).toFixed(3) + ')', dark = 'rgba(0,0,0,' + (0.32 * lk).toFixed(3) + ')';
      g.addColorStop(0, litX < 0 ? lit : dark); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, litX < 0 ? dark : lit);
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(-hd, y0, b.d, L);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.fill();
  }
  const R0 = N.render;
  if (R0 && R0.setGroundPainter) {
    const origSet = R0.setGroundPainter;
    R0.setGroundPainter = function (fn) {
      if (typeof fn !== 'function') return origSet.call(R0, fn);
      const composed = function (ctx, x0, y0, w, h) { fn(ctx, x0, y0, w, h); try { paint2D(ctx, x0, y0, w, h); } catch (e) { if (N.err) N.err('breakers.paint', e); } };
      composed.base = fn;
      return origSet.call(R0, composed);
    };
  }

  /* ================================================================ 3D: the hump on the terrain */
  // (the chunk builder's vertex colours are linear 0..255: view3d.js rgb8 converts a hex string, an array goes as is)
  const lin = (c) => { c /= 255; return Math.round((c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) * 255); };
  function hex3(h) { const v = parseInt(h.slice(1), 16); return [lin((v >> 16) & 255), lin((v >> 8) & 255), lin(v & 255)]; }
  // (the hump's top faces the sun more squarely than the road does: its tar a shade darker than the road's to match)
  const C3 = { tar: hex3('#2a292d'), tarHump: hex3('#2c2b30'), black: hex3('#161618'), yellow: hex3('#e0b41c'), white: hex3('#e4e1d4') };
  const mix3 = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  function build3d(THREE, s, H, gb, J) {
    const b = s.b; if (!b) return null;
    const ox = J.ox, oz = J.oz, T = (x, y) => (H.terrainAt ? H.terrainAt(x, y) || 0 : 0);
    const rnd = U.rng(b.seed);
    gb.plain();
    // an up-facing quad through four ground points (x, y world; h above the terrain), wound so its normal is up
    const pt = (sx, l, hh) => { const x = b.x + b.ux * sx + b.nx * l, y = b.y + b.uy * sx + b.ny * l; return [x - ox, T(x, y) + 0.04 + hh, y - oz]; };
    const up = (p0, p1, p2, p3) => {
      const ny = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]);
      if (ny >= 0) gb.quad(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]);
      else gb.quad(p0[0], p0[1], p0[2], p3[0], p3[1], p3[2], p2[0], p2[1], p2[2], p1[0], p1[1], p1[2]);
    };
    const hd = b.d / 2;
    if (b.kind === 'rumble') {
      const n = TUNE.rumbleN, col = mix3(b.paint === 'yellow' ? C3.yellow : C3.white, C3.tar, b.wear * 0.5);
      for (let k = 0; k < n; k++) {
        const cx = -hd + (k + 0.5) * (b.d / n), w2 = 0.5;
        gb.color(col);
        for (const [y0, y1] of spans(b)) for (let q = 0; q < 2; q++) { // a low ridge: two slopes
          const sa = q ? cx : cx - w2, sb = q ? cx + w2 : cx, ha = q ? b.h : 0, hb = q ? 0 : b.h;
          up(pt(sa, y0, ha), pt(sb, y0, hb), pt(sb, y1, hb), pt(sa, y1, ha));
        }
      }
      return null;
    }
    // the hump: K steps of its profile along the road, segments across it (a stripe each when painted)
    const K = 8, painted = b.paint === 'yb' || b.paint === 'wb', sw = painted ? TUNE.stripe : 3.2;
    const paint = b.paint === 'yb' ? C3.yellow : C3.white, base = b.look === 'tar' ? C3.tarHump : C3.black;
    const hAt = (sx, l) => profile(b, sx, l) || 0;
    for (const [y0, y1] of spans(b)) for (let y = y0, k = 0; y < y1 - 0.05; y += sw, k++) {
      const ya = y, yb = Math.min(y1, y + sw);
      let col = base;
      if (painted && k % 2 === 0) col = mix3(paint, base, clamp(b.wear * 0.45 + rnd.next() * 0.12, 0, 0.6));
      else if (!painted) col = mix3(base, C3.tar, rnd.next() * 0.25);
      gb.color(col);
      // the ends taper over 1 u: sample them where they start
      const ys = [ya]; if (ya < y0 + 1 && yb > y0 + 1) ys.push(y0 + 1); if (yb > y1 - 1 && ya < y1 - 1) ys.push(y1 - 1); ys.push(yb);
      ys.sort((p, q) => p - q);
      for (let m = 1; m < ys.length; m++) {
        const l0 = ys[m - 1], l1 = ys[m], la = l0 === y0 ? l0 + 1e-3 : l0, lb = l1 === y1 ? l1 - 1e-3 : l1;
        for (let i = 0; i < K; i++) {
          const s0 = -hd + (b.d * i) / K, s1 = -hd + (b.d * (i + 1)) / K;
          up(pt(s0, l0, hAt(s0, la)), pt(s1, l0, hAt(s1, la)), pt(s1, l1, hAt(s1, lb)), pt(s0, l1, hAt(s0, lb)));
        }
      }
    }
    return null;
  }
  if (N.view3d && N.view3d.registerStructure && !N.ameerpet && !N.hills) {
    N.view3d.registerStructure('custom', (THREE, s, H, gb, J) => (typeof s.build3d === 'function' ? s.build3d(THREE, s, H, gb, J) : null));
  }

  /* ================================================================ hooks */
  N.on('world:built', () => { try { build(); } catch (e) { N.err('breakers.build', e); } });
  if (N.addSystem) N.addSystem({ id: 'breakers', order: 30.5, runIn: ['play', 'dialogue', 'cutscene'], update(dt) { try { update(dt); } catch (e) { N.err('breakers.update', e); } } });

  N.breakers = {
    TUNE,
    get list() { return A.list; },
    get count() { return A.list.length; },
    get built() { return A.built; },
    at, near, nearest, profile, limitAhead, comfyFor,
    stats() { const st = A.stats || {}; return { count: A.list.length, byWhy: Object.assign({}, st.byWhy), byKind: Object.assign({}, st.byKind), rejected: Object.assign({}, st.rejected), pairs: (st.pairs || []).length }; },
    /** how each school's / hospital's pair was placed: {id, kind, w, tries ['du:ok' | 'du:junction' | 'du:surface' | 'du:near' | 'du:end']} */
    pairLog() { return ((A.stats && A.stats.pairs) || []).slice(); },
    /** a digest of every breaker's place and look (the placement is deterministic) */
    hash() { let h = 2166136261 >>> 0; for (const b of A.list) { const s = Math.round(b.x) + ',' + Math.round(b.y) + ',' + b.look + ',' + b.paint + ',' + b.why; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } } return h >>> 0; },
    _build() { const old = A.list; build(); for (const b of old) if (b.s) b.s.dead = true; return A.list.length; },
  };
})();
