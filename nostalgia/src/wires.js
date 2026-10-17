/* NOSTALGIA — wires.js (atmosphere layer) — design/atmosphere.md "Electric poles and overhead wires"
 *
 * Street electric poles and overhead wires in both views, derived procedurally from the road data.
 *
 * ------------------------------------------------------------------ layout (deterministic)
 *   Every wired road (lanes w >= 18, streets, arterials; not bridges / paths / the bund) carries one line of
 *   poles on one side (the side, spacing 34-48 u, pole kind mix and wire config come from the road's own
 *   seed 'wire:' + road.id and the district style at its middle). Pole i sits at arclength start + i *
 *   spacing on the footpath's kerb edge (lanes: 1.2 u in from the edge, against the walls), seeded per
 *   road segment ('wire:' + road.id + ':' + seg + ':' + i); it slides +-5 / +-10 u to dodge a street lamp,
 *   a junction mouth / zebra (node half width + 11..25 u), a bridge, water, a building, a plaza or a
 *   respect-zone compound, or is dropped. Pole i is a pure function of its road and the world, so the
 *   same map always has the same poles in both views and editing one road never moves another's.
 *   Spans: pole i -> the next pole of the road (i + 1, or i + 2 across a dropped one, <= 92 u): HT
 *   conductors (3, streets / arterials) on the top crossarm, LT (4) on the lower one, the early-2000s
 *   cable TV / phone cables strapped to the pole (count by district style), service drops to the houses
 *   facing the road, cable loops between tall facing buildings across lanes, and junction "ties" from the
 *   main road's pole to the side roads' poles (with a pole-mounted transformer at some junctions).
 *   Sag: a catenary (cosh) with sag 0.4 + 0.0011 L^2 (long spans sag more), clamped by a clearance
 *   check so that the wire is >= 26 u (2.6 storeys; a bus is 17 / 1.5 = 11.3 u) over any drivable cell
 *   (>= 20 u in a lane's 3 u edge band, >= 13 u over footpaths / yards, a service drop may come down to
 *   its house in the last 2.5 u) and never crosses a building or landmark footprint (spans that would are
 *   dropped). 3D heights are the 2D heights x VS (1.5), so the same checks hold in 3D.
 *   Generated lazily per 256 u cell (owner = the cell of the span's start pole / the junction node),
 *   nearest first within ~1.6 ms a frame ('wires' system), LRU-capped (CELL_CAP cells).
 *   After Sankranti (1 Jan - 25 Feb, full density 13-20 Jan, then thinning) torn kites and manja
 *   strands hang on wires and poles (deterministic subset by date); the odd pair of Hawai chappals is
 *   thrown over a lane's wire (rare, all year).
 *
 * ------------------------------------------------------------------ API  N.wires
 *   perches(x, y, r, out?) -> [{x, y, h, span, t, ang}]   perch points ~3.5 u apart on power / cable wires
 *                          within r (sync-generates the cells it needs; h in 2D u, x VS for 3D)
 *   query(x0, y0, x1, y1, fn)  spans {id, kind:'power'|'cable'|'service', ax, ay, ah, bx, by, bh, sag, len, lo}
 *   poles(x0, y0, x1, y1, fn)  poles {id, x, y, h, kind:'psc'|'rail'|'tube', ang, lamp?, tx?}
 *   heightAt(span, t)      wire height at t (0..1) in 2D u (catenary)
 *   pointAt(span, t, out?) {x, y, h}
 *   stats()                {cells, poles, spans, byKind, genMs, cellMs, ...}
 *   ensure(x0, y0, x1, y1) generate the cells of a rect now (tests / teleports); regen() drop everything
 *   kites(on?)             force the Sankranti kites on / off (null = by date)
 *   enabled, draw2d, draw3d  switches;  MINCLR, CELL
 *
 * Hooks into other files: none (2D draws through a system's draw(), 3D through N.view3d.registerLayer).
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;
  const now = () => performance.now();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  // numeric hash 0..1 of (id, salt): deterministic, allocation-free
  function hn(a, b) {
    let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x632be5ab, 0x85ebca77);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  const SALT = { ph: 11, kite: 23, k: 37, m: 41, chappal: 53, ch: 67, pkite: 71, pk: 83 };
  const rngN = (a, b) => U.rng(((Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77)) >>> 0) || 1);

  const CELL = 256, CELL_CAP = 220, CH3 = 512;
  const MINCLR = 26, CLR_EDGE = 20, CLR_OFF = 13, CLR_END = 12.5;
  const MAX_SPAN = 92, GEN_MS = 1.6;
  const INS = [-3.6, -1.2, 1.2, 3.6];      // insulator offsets across the crossarm (u)
  const HT_IDX = [0, 2, 3];               // HT conductors use three of them
  const LT_IDX = [0, 1, 3];               // LT: three of them (the fourth insulator is spare)
  const LANE_SHIFT = -4.2;                // lane crossarms are L-shaped, reaching over the lane only
  // district profiles: rail = share of old steel-rail poles, tube = steel tubular (HITEC), tangle 0..1,
  // cables [min, max] per span, service = chance a pole feeds houses, lamp = chance of a pole light
  const PROF = {
    oldcity: { rail: 0.55, tube: 0, tangle: 1.0, cables: [1, 3], service: 0.9, lamp: 0.3, sp: [34, 40], skip: 0, tx: 0.4 },
    market: { rail: 0.4, tube: 0, tangle: 0.9, cables: [1, 3], service: 0.85, lamp: 0.28, sp: [34, 41], skip: 0, tx: 0.4 },
    colony: { rail: 0.2, tube: 0, tangle: 0.7, cables: [0, 2], service: 0.75, lamp: 0.25, sp: [36, 44], skip: 0, tx: 0.3 },
    rocky: { rail: 0.15, tube: 0, tangle: 0.35, cables: [0, 2], service: 0.5, lamp: 0.2, sp: [38, 46], skip: 0.15, tx: 0.2 },
    colonial: { rail: 0.35, tube: 0, tangle: 0.28, cables: [0, 2], service: 0.45, lamp: 0.15, sp: [38, 45], skip: 0, tx: 0.25 },
    cantonment: { rail: 0.25, tube: 0, tangle: 0.15, cables: [0, 1], service: 0.35, lamp: 0.15, sp: [40, 47], skip: 0.1, tx: 0.2 },
    posh: { rail: 0.05, tube: 0, tangle: 0.3, cables: [0, 2], service: 0.5, lamp: 0.2, sp: [38, 45], skip: 0, tx: 0.25 },
    hitec: { rail: 0, tube: 1, tangle: 0.03, cables: [0, 0], service: 0.08, lamp: 0.1, sp: [42, 48], skip: 0.7, tx: 0.1 },
  };
  const KITE_COLS = ['#e8336a', '#f2c230', '#2f9d5a', '#f07a26', '#2a6fd0', '#efe6d2', '#9b3fb5', '#d02a2a', '#18a3a0', '#ffffff'];
  const MANJA_COLS = ['#f06aa0', '#f4ece6', '#ffd34a', '#ff5a5a'];
  const POLE_COL = { psc: '#a39d90', rail: '#4f4038', tube: '#7f8884' };
  const POLE_COL3 = { psc: '#b8b2a5', rail: '#5d4a3e', tube: '#808a85' };
  const POLE_W = { psc: 1.6, rail: 1.05, tube: 1.2 };
  const WIRE_COL = { power: '#2f2c29', cable: '#141210', service: '#3b3530' };
  const WIRE_COL3 = { power: '#3a3836', cable: '#121110', service: '#2b2724' };

  // catenary shape: 0 at the ends, 1 mid-span
  const CA = 1.2, CAH = Math.cosh(CA) - 1;
  const shape = (t) => 1 - (Math.cosh(CA * (2 * t - 1)) - 1) / CAH;

  /* ================================================================ state */
  const st = {
    enabled: true, draw2d: true, draw3d: true, kitesForced: null,
    G: null,      // generation state (per world build)
  };
  let G = null;
  function resetGen() {
    G = {
      ready: false, job: null, roads: null, memo: [], segIdx: new Map(), nodeIdx: new Map(), lampIdx: new Map(),
      roadOf: new Map(), nodeRoads: new Map(), roadNodes: new Map(), cells: new Map(), queue: [], queued: new Set(),
      stats: { cellsBuilt: 0, genMs: 0, maxCellMs: 0, indexMs: 0, rejected: {} }, ver: 0,
    };
    st.G = G;
  }
  resetGen();
  const rej = (why) => { G.stats.rejected[why] = (G.stats.rejected[why] || 0) + 1; };

  const wiredKind = (r) => (r.kind === 'lane' && r.w >= 18) || r.kind === 'street' || r.kind === 'arterial';
  const ckey = (i, j) => j * 4096 + i;

  /* ================================================================ index (once per world; resumable, sliced) */
  // phases: 0 roads -> index map, 1 edges -> junction nodes per road, 2 road segments -> 256 u cells,
  // 3 junction nodes -> cells + street lamps -> 32 u hash. ix = progress inside the phase.
  function indexStep(deadline) {
    const W = N.world, D = W.data;
    if (!G.ix) { G.ix = { ph: 0, i: 0, ms: 0 }; G.roads = D.roads; }
    const X = G.ix, t0 = now();
    const nodes = W.roads.nodes, edges = W.roads.edges, roads = G.roads, FOOT = W.FOOT || {};
    while (X.ph < 4) {
      if (X.ph === 0) {
        for (; X.i < roads.length; X.i++) G.roadOf.set(roads[X.i], X.i);
      } else if (X.ph === 1) {
        for (; X.i < edges.length; X.i++) {
          if ((X.i & 1023) === 0 && now() > deadline) break;
          const e = edges[X.i], ri = G.roadOf.get(e.road);
          if (ri == null) continue;
          for (let q = 0; q < 2; q++) {
            const nid = q ? e.b : e.a, n = nodes[nid];
            if (!n || n.deg < 3) continue;
            let l = G.nodeRoads.get(nid);
            if (!l) G.nodeRoads.set(nid, (l = []));
            if (l.indexOf(ri) < 0) l.push(ri);
            let rn = G.roadNodes.get(ri);
            if (!rn) G.roadNodes.set(ri, (rn = []));
            if (rn.indexOf(nid) < 0) rn.push(nid);
          }
        }
      } else if (X.ph === 2) {
        for (; X.i < roads.length; X.i++) {
          if ((X.i & 127) === 0 && now() > deadline) break;
          const r = roads[X.i], ri = X.i;
          if (!wiredKind(r) || !r.pts || r.pts.length < 2) continue;
          const m = r.w / 2 + (FOOT[r.kind] || 0) + 40;
          for (let s = 0; s < r.pts.length - 1; s++) {
            const a = r.pts[s], b = r.pts[s + 1];
            const i0 = Math.floor((Math.min(a[0], b[0]) - m) / CELL), i1 = Math.floor((Math.max(a[0], b[0]) + m) / CELL);
            const j0 = Math.floor((Math.min(a[1], b[1]) - m) / CELL), j1 = Math.floor((Math.max(a[1], b[1]) + m) / CELL);
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
              const k = ckey(i, j);
              let l = G.segIdx.get(k);
              if (!l) G.segIdx.set(k, (l = []));
              if (l[l.length - 1] !== ri) l.push(ri);
            }
          }
        }
      } else {
        for (const nid of G.nodeRoads.keys()) {
          const n = nodes[nid];
          const k = ckey(Math.floor(n.x / CELL), Math.floor(n.y / CELL));
          let l = G.nodeIdx.get(k);
          if (!l) G.nodeIdx.set(k, (l = []));
          l.push(nid);
        }
        for (const l of W.lamps || []) {
          const k = Math.floor(l.y / 32) * 8192 + Math.floor(l.x / 32);
          let a = G.lampIdx.get(k);
          if (!a) G.lampIdx.set(k, (a = []));
          a.push(l);
        }
        X.i = Infinity;
      }
      const len = X.ph === 1 ? edges.length : X.ph === 3 ? 0 : roads.length;
      if (X.i >= len) { X.ph++; X.i = 0; } else break;
    }
    X.ms += now() - t0;
    if (X.ph >= 4) { G.ready = true; G.stats.indexMs = +X.ms.toFixed(2); }
    return G.ready;
  }
  function lampNear(x, y, d) {
    for (let j = Math.floor((y - d) / 32); j <= Math.floor((y + d) / 32); j++) for (let i = Math.floor((x - d) / 32); i <= Math.floor((x + d) / 32); i++) {
      const a = G.lampIdx.get(j * 8192 + i);
      if (a) for (const l of a) if ((l.x - x) * (l.x - x) + (l.y - y) * (l.y - y) < d * d) return l;
    }
    return null;
  }
  const canIndex = () => !!(N.world && N.world.built && N.world.roads);
  const ensureIndex = () => { if (!G.ready && canIndex()) indexStep(Infinity); return G.ready; };

  /* ================================================================ roads -> poles (pure) */
  function memo(ri) {
    let m = G.memo[ri];
    if (m !== undefined) return m;
    const r = G.roads[ri];
    m = null;
    if (r && wiredKind(r) && r.pts && r.pts.length >= 2) {
      const pts = r.pts, cum = new Float64Array(pts.length);
      for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const L = cum[pts.length - 1];
      const mid = pts[pts.length >> 1];
      const d = N.world.districtAt(mid[0], mid[1]);
      const style = d && PROF[d.style] ? d.style : 'colony';
      const P = PROF[style];
      const hr = U.rng('wire:' + r.id);
      const skipRoll = hr.next(), spRoll = hr.next(), stRoll = hr.next(), sideRoll = hr.next(), ltRoll = hr.next();
      const skip = (r.kind === 'arterial' && style === 'hitec') ? skipRoll < 0.85 : skipRoll < P.skip;
      if (L > 30 && !skip) {
        const sp = (P.sp[0] + (P.sp[1] - P.sp[0]) * spRoll) * (r.kind === 'arterial' ? 1.06 : 1);
        const lane = r.kind === 'lane';
        const FOOT = (N.world.FOOT && N.world.FOOT[r.kind]) || 0;
        const cfg = lane ? { ht: false, lt: true, h: 30.5 } : r.kind === 'street' ? { ht: true, lt: ltRoll < 0.4, h: 34 } : { ht: true, lt: ltRoll < 0.25, h: 35 };
        m = {
          ri, r, id: r.id, pts, cum, L, sp, start: sp * (0.25 + 0.5 * stRoll), side: sideRoll < 0.5 ? -1 : 1,
          lane, foot: FOOT, hw: r.w / 2, off: lane ? r.w / 2 - 1.2 : r.w / 2 + 1.6, cfg, style, P, poles: new Map(), junctions: null,
        };
        // junction nodes on this road (arclength + mouth radius)
        const J = [];
        const nodes = N.world.roads.nodes, edges = N.world.roads.edges;
        for (const nid of G.roadNodes.get(ri) || []) {
          const n = nodes[nid];
          if (n.x < r._bb[0] - 10 || n.x > r._bb[2] + 10 || n.y < r._bb[1] - 10 || n.y > r._bb[3] + 10) continue;
          const pr = project(m, n.x, n.y);
          if (pr.d2 > 900) continue;
          // the crossing roads' carriageway + footpath + kerb fillet, and this road's zebra crossings exactly
          // where world.js paints them (arms >= R + 24 long, centred widest / 2 + 6 from the node): +-7 u clear
          let ow = 0, of = 0, widest = null;
          const RK = { lane: 0, path: 0, bund: 1, street: 1, bridge: 2, arterial: 3 };
          for (const eid of n.inc || []) {
            const e = edges[eid]; if (!e) continue;
            if (e.road !== r) { ow = Math.max(ow, e.w); of = Math.max(of, (N.world.FOOT && N.world.FOOT[e.kind]) || 0); }
            if (!widest || (RK[e.kind] - RK[widest.kind]) > 0 || (RK[e.kind] === RK[widest.kind] && e.w >= widest.w)) widest = e;
          }
          const zebras = [];
          if (r.kind !== 'lane') {
            const R = n.w / 2 + 2;
            for (const eid of n.inc || []) {
              const e = edges[eid];
              if (!e || e.road !== r) continue;
              const o = nodes[e.a === n.id ? e.b : e.a];
              if (Math.hypot(o.x - n.x, o.y - n.y) < R + 24) continue;
              const so = project(m, o.x, o.y).s;
              zebras.push(pr.s + Math.sign(so - pr.s) * ((widest ? widest.w / 2 : R) + 6));
            }
          }
          J.push({ n, s: pr.s, mouth: ow / 2 + of + 3, zebras });
        }
        m.junctions = J;
      }
    }
    G.memo[ri] = m;
    return m;
  }
  // nearest point on the road to (x, y) -> {s (arclength), d2}
  function project(m, x, y) {
    let best = { s: 0, d2: Infinity };
    const P = m.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const q = U.closestOnSeg(x, y, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]);
      if (q.d2 < best.d2) best = { s: m.cum[i] + q.t * (m.cum[i + 1] - m.cum[i]), d2: q.d2 };
    }
    return best;
  }
  function segAt(m, s) {
    const c = m.cum;
    let lo = 0, hi = c.length - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (c[mid] <= s) lo = mid; else hi = mid - 1; }
    return lo;
  }
  function inRespect(x, y) {
    try { const z = N.respect && N.respect.at ? N.respect.at(x, y) : null; return !!(z && z.part === 'compound'); } catch (e) { return false; }
  }
  function bldgAt(x, y) {
    let hit = null;
    N.world.queryStructures(x - 0.5, y - 0.5, x + 0.5, y + 0.5, (s) => {
      if (hit) return;
      if (s.t === 'bldg' && x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.d) hit = s;
      else if (s.t === 'landmark' && s.lm && s.lm.solid !== false && x > s.lm.x - s.lm.w / 2 && x < s.lm.x + s.lm.w / 2 && y > s.lm.y - s.lm.d / 2 && y < s.lm.y + s.lm.d / 2) hit = s;
    });
    return hit;
  }
  const SLIDE = [0, 5, -5, 10, -10];
  function poleAt(m, i) {
    if (m.poles.has(i)) return m.poles.get(i);
    let p = null;
    const s0 = m.start + i * m.sp;
    if (i >= 0 && s0 > 8 && s0 < m.L - 8) {
      for (const o of SLIDE) {
        const s = s0 + o;
        if (s < 6 || s > m.L - 6) continue;
        const why = poleCheck(m, s);
        if (typeof why === 'string') { rej(why); continue; }
        p = makePole(m, i, s, why);
        break;
      }
    }
    m.poles.set(i, p);
    return p;
  }
  function polePos(m, s, out) {
    const seg = segAt(m, s), a = m.pts[seg], b = m.pts[seg + 1];
    const L = m.cum[seg + 1] - m.cum[seg] || 1, t = (s - m.cum[seg]) / L;
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    const onx = -uy * m.side, ony = ux * m.side; // outward normal (away from the road centre)
    out.seg = seg; out.ux = ux; out.uy = uy; out.onx = onx; out.ony = ony;
    out.cx = a[0] + (b[0] - a[0]) * t; out.cy = a[1] + (b[1] - a[1]) * t;
    out.x = out.cx + onx * m.off; out.y = out.cy + ony * m.off;
    return out;
  }
  function poleCheck(m, s) {
    const W = N.world, S = N.SURF;
    for (const j of m.junctions) {
      const d = Math.abs(s - j.s);
      if (d < j.mouth) return 'junction';
      for (const z of j.zebras) if (Math.abs(s - z) < 7) return 'zebra';
    }
    const q = polePos(m, s, {});
    const x = q.x, y = q.y;
    const sf = W.surfaceAt(x, y);
    if (m.lane) {
      if (sf !== S.ROAD) return 'surface';
      const so = W.surfaceAt(x + q.onx * 3, y + q.ony * 3);
      if (so === S.ROAD || so === S.BRIDGE || so === S.WATER) return 'notEdge';
    } else if (sf !== S.FOOTPATH) return 'surface';
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2, sx = W.surfaceAt(x + Math.cos(a) * 7, y + Math.sin(a) * 7);
      if (sx === S.BRIDGE || sx === S.WATER) return 'bridge';
    }
    if (W.surfaceAt(x, y) === S.PLAZA) return 'plaza';
    // the crossarm ends must stay outside buildings
    const shift = m.lane ? LANE_SHIFT : 0;
    for (const o of [INS[0] + shift, INS[3] + shift]) if (bldgAt(x + q.onx * o, y + q.ony * o)) return 'armInBuilding';
    if (bldgAt(x, y)) return 'inBuilding';
    if (lampNear(x, y, 8)) return 'lamp';
    if (inRespect(x, y)) return 'respect';
    return q;
  }
  function makePole(m, i, s, q) {
    const rr = U.rng('wire:' + m.id + ':' + q.seg + ':' + i);
    const d = N.world.districtAt(q.x, q.y);
    const style = d && PROF[d.style] ? d.style : m.style;
    const P = PROF[style];
    const kr = rr.next();
    const kind = P.tube ? 'tube' : kr < P.rail ? 'rail' : 'psc';
    const h = m.cfg.h + (rr.next() - 0.5) * 0.8 - (kind === 'rail' ? 0.6 : 0);
    const p = {
      id: m.ri * 4096 + i, ri: m.ri, i, s, seg: q.seg, x: q.x, y: q.y, ux: q.ux, uy: q.uy, onx: q.onx, ony: q.ony,
      ang: Math.atan2(q.uy, q.ux), kind, h, style, P, lane: m.lane,
      hHT: m.cfg.ht ? h - 0.8 : 0, hLT: m.cfg.lt ? (m.cfg.ht ? h - 3.8 : h - 0.9) : 0,
      shift: m.lane ? LANE_SHIFT : 0, lamp: null, tx: null, coil: 0, r1: rr.next(), r2: rr.next(), r3: rr.next(),
    };
    // a pole light where the map put no street lamp nearby
    if (p.r1 < P.lamp && !lampNear(p.x, p.y, 45)) {
      const tube = m.lane ? p.r2 < 0.55 : p.r2 < 0.2;
      const hh = (p.hLT || p.hHT) - 2.8;
      p.lamp = { x: p.x - p.onx * 5.6, y: p.y - p.ony * 5.6, h: hh, tube, col: tube ? '#d8f4ff' : '#ffab40' };
    }
    if (p.r3 < P.tangle * 0.35) p.coil = 1;
    return p;
  }

  /* ================================================================ spans */
  // clearance + building check: returns the largest sag allowed (>= 0) or -1 when the line is blocked
  const QB = { hit: false, ax: 0, ay: 0, bx: 0, by: 0, lo: 0 };
  function segRect(ax, ay, bx, by, x0, y0, x1, y1) {
    // Liang-Barsky: does segment A-B cross the open rect?
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    for (let k = 0; k < 4; k++) {
      const P = k === 0 ? -dx : k === 1 ? dx : k === 2 ? -dy : dy;
      const Q = k === 0 ? ax - x0 : k === 1 ? x1 - ax : k === 2 ? ay - y0 : y1 - ay;
      if (P > -1e-9 && P < 1e-9) { if (Q < 0) return false; continue; }
      const r = Q / P;
      if (P < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t1 - t0 > 1e-6;
  }
  function blocked(ax, ay, bx, by) {
    QB.hit = false; QB.ax = ax; QB.ay = ay; QB.bx = bx; QB.by = by;
    N.world.queryStructures(Math.min(ax, bx) - 1, Math.min(ay, by) - 1, Math.max(ax, bx) + 1, Math.max(ay, by) + 1, blockFn);
    return QB.hit;
  }
  function blockFn(s) {
    if (QB.hit) return;
    let x0, y0, x1, y1;
    if (s.t === 'bldg') { x0 = s.x; y0 = s.y; x1 = s.x + s.w; y1 = s.y + s.d; }
    else if (s.t === 'landmark' && s.lm) { const l = s.lm; x0 = l.x - l.w / 2; y0 = l.y - l.d / 2; x1 = l.x + l.w / 2; y1 = l.y + l.d / 2; }
    else return;
    if (segRect(QB.ax, QB.ay, QB.bx, QB.by, x0 + 0.25, y0 + 0.25, x1 - 0.25, y1 - 0.25)) QB.hit = true;
  }
  function maxSag(ax, ay, ah, bx, by, bh, o) {
    const W = N.world, S = N.SURF;
    if (blocked(ax, ay, bx, by)) return -1;
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(4, Math.ceil(len / 2.2));
    let best = 99;
    const er = o && o.road;
    for (let k = 1; k < n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      const sf = W.surfaceAt(x, y);
      let req = sf === S.ROAD || sf === S.BRIDGE ? MINCLR : CLR_OFF;
      if (req === MINCLR && er) {
        const lat = Math.abs((x - er.cx) * -er.uy + (y - er.cy) * er.ux);
        if (lat > er.hw - 3) req = CLR_EDGE;
      }
      if (o && o.endA && (x - ax) * (x - ax) + (y - ay) * (y - ay) < 6.25) req = Math.min(req, CLR_END);
      if (o && o.endB && (x - bx) * (x - bx) + (y - by) * (y - by) < 6.25) req = Math.min(req, CLR_END);
      const lin = ah + (bh - ah) * t;
      if (lin < req) return -1;
      best = Math.min(best, (lin - req) / shape(t));
    }
    return best;
  }
  let spanSeq = 0;
  function addSpan(cell, kind, ax, ay, ah, bx, by, bh, want, o, idBase) {
    const allow = maxSag(ax, ay, ah, bx, by, bh, o);
    if (allow < 0) { rej(kind + ':blocked'); return null; }
    const sag = Math.min(want, allow);
    if (sag < 0.2 && want > 0.5) { rej(kind + ':taut'); return null; }
    const len = Math.hypot(bx - ax, by - ay);
    const sp = {
      id: idBase, kind, ax, ay, ah, bx, by, bh, sag, len,
      ph: hn(idBase, SALT.ph) * TAU, lo: 0, col: (o && o.col) || null,
      x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by), pts: null,
    };
    // sampled points (static), lowest point
    const ns = len < 14 ? 3 : len < 34 ? 5 : len < 60 ? 7 : 9;
    const pts = new Float32Array((ns + 1) * 3);
    let lo = 99;
    for (let k = 0; k <= ns; k++) {
      const t = k / ns, h = ah + (bh - ah) * t - sag * shape(t);
      pts[k * 3] = ax + (bx - ax) * t; pts[k * 3 + 1] = ay + (by - ay) * t; pts[k * 3 + 2] = h;
      if (h < lo) lo = h;
    }
    sp.pts = pts; sp.lo = lo;
    cell.spans.push(sp);
    spanSeq++;
    return sp;
  }
  const insX = (p, k) => p.x + p.onx * (INS[k] + p.shift), insY = (p, k) => p.y + p.ony * (INS[k] + p.shift);
  const roadOf = (p) => { const m = G.memo[p.ri]; return { cx: p.x - p.onx * m.off, cy: p.y - p.ony * m.off, ux: p.ux, uy: p.uy, hw: m.hw }; };

  function poleSpans(cell, m, p) {
    // next pole of the road (skip one dropped pole)
    let q = poleAt(m, p.i + 1);
    if (!q) { const q2 = poleAt(m, p.i + 2); if (q2 && Math.hypot(q2.x - p.x, q2.y - p.y) <= MAX_SPAN) q = q2; }
    const rr = U.rng('span:' + m.id + ':' + p.i);
    const er = roadOf(p), o = { road: er };
    if (q) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d > 8 && d <= MAX_SPAN) {
        const base = 0.4 + 0.0011 * d * d;
        let k = 0;
        if (p.hHT && q.hHT) for (const c of HT_IDX) addSpan(cell, 'power', insX(p, c), insY(p, c), p.hHT + 0.7, insX(q, c), insY(q, c), q.hHT + 0.7, base * (0.92 + rr.next() * 0.16), o, p.id * 32 + k++);
        if (p.hLT && q.hLT) for (const c of LT_IDX) addSpan(cell, 'power', insX(p, c), insY(p, c), p.hLT + 0.7, insX(q, c), insY(q, c), q.hLT + 0.7, base * (1.05 + rr.next() * 0.2), o, p.id * 32 + 8 + k++);
        // cable TV / phone cables strapped to the poles
        const P = p.P;
        const nC = Math.round(P.cables[0] + (P.cables[1] - P.cables[0]) * rr.next() * P.tangle + (rr.next() < P.tangle * 0.3 ? 1 : 0));
        for (let c = 0; c < nC; c++) {
          const sd = (c & 1 ? 1 : -1) * (0.7 + rr.next() * 0.3) + (m.lane ? -0.6 : 0);
          const h1 = 27.2 + rr.next() * 1.6, h2 = 27.2 + rr.next() * 1.6;
          addSpan(cell, 'cable', p.x + p.onx * sd, p.y + p.ony * sd, h1, q.x + q.onx * sd, q.y + q.ony * sd, h2, 1.2 + rr.next() * 3.4 + d * 0.025, o, p.id * 32 + 16 + c);
        }
      }
    }
    serviceDrops(cell, m, p, rr, o);
  }
  // service wires to the houses facing the road + cable loops across lanes between tall buildings
  function serviceDrops(cell, m, p, rr, o) {
    const P = p.P;
    if (rr.next() > P.service) return;
    const cands = [];
    const R = 30;
    N.world.queryStructures(p.x - R, p.y - R, p.x + R, p.y + R, (s) => {
      if (s.t !== 'bldg') return;
      const qx = clamp(p.x, s.x, s.x + s.w), qy = clamp(p.y, s.y, s.y + s.d);
      const d = Math.hypot(qx - p.x, qy - p.y);
      if (d < 2.5 || d > R) return;
      // facing the road: its nearest point lies within the frontage band of this road
      const lat = Math.abs((qx - (p.x - p.onx * m.off)) * -p.uy + (qy - (p.y - p.ony * m.off)) * p.ux);
      if (lat > m.hw + m.foot + 12) return;
      cands.push({ s, qx, qy, d, far: (qx - p.x) * p.onx + (qy - p.y) * p.ony < -2 });
    });
    if (!cands.length) return;
    cands.sort((a, b) => a.d - b.d || a.s.id - b.s.id);
    const n = Math.min(cands.length, 1 + Math.floor(rr.next() * (1 + 2.6 * P.tangle)));
    let k = 0;
    for (let c = 0; c < cands.length && k < n; c++) {
      const C = cands[c];
      if (rr.next() < 0.3 && c < cands.length - 1) continue;
      const b = C.s;
      // attach point on the facade, pushed 0.4 u out
      let bx = C.qx, by = C.qy;
      const dx = bx - p.x, dy = by - p.y, dl = Math.hypot(dx, dy) || 1;
      bx -= (dx / dl) * 0.4; by -= (dy / dl) * 0.4;
      const ins = C.far ? 0 : 3; // nearest crossarm end
      const ph = p.hLT || p.hHT;
      const ax = p.hLT ? insX(p, ins) : p.x, ay = p.hLT ? insY(p, ins) : p.y, ah = p.hLT ? ph + 0.5 : 27.6;
      let bh = Math.min(b.h - 1.2, 11 + rr.next() * 9);
      if (C.far) bh = b.h - 1.2; // across the road it must stay high
      if (bh < 6) continue;
      const ob = { road: o.road, endB: true, col: null };
      const want = 0.5 + C.d * 0.03;
      let sp = addSpan(cell, 'service', ax, ay, ah, bx, by, bh, want, ob, p.id * 32 + 24 + k);
      if (!sp && !C.far && b.h - 1.2 > bh + 2) sp = addSpan(cell, 'service', ax, ay, ah, bx, by, b.h - 1.2, want, ob, p.id * 32 + 24 + k);
      if (sp) k++;
    }
    // cable loops between tall buildings facing each other across a lane / street (old city tangle)
    if (rr.next() < P.tangle * 0.55) {
      const near = cands.filter((c) => !c.far && c.s.h >= 28), far = cands.filter((c) => c.far && c.s.h >= 28);
      if (near.length && far.length) {
        const A = near[Math.floor(rr.next() * near.length)], B = far[Math.floor(rr.next() * far.length)];
        const ha = A.s.h - 1.5, hb = B.s.h - 1.5;
        const pa = facadePt(A, p), pb = facadePt(B, p);
        addSpan(cell, 'cable', pa[0], pa[1], ha, pb[0], pb[1], hb, 1.5 + rr.next() * 3, { endA: true, endB: true }, p.id * 32 + 30);
        // and one from the pole to the far building
        if (rr.next() < 0.6) addSpan(cell, 'cable', p.x, p.y, 28, pb[0] + (rr.next() - 0.5) * 3, pb[1] + (rr.next() - 0.5) * 3, hb - 2, 1 + rr.next() * 2.5, { road: o.road, endB: true }, p.id * 32 + 31);
      }
    }
  }
  function facadePt(C, p) {
    const dx = C.qx - p.x, dy = C.qy - p.y, dl = Math.hypot(dx, dy) || 1;
    return [C.qx - (dx / dl) * 0.4, C.qy - (dy / dl) * 0.4];
  }
  // junction ties: the main road's pole nearest the node -> the side roads' poles; transformers
  function junctionTies(cell, nid) {
    const n = N.world.roads.nodes[nid], rl = G.nodeRoads.get(nid);
    if (!n || !rl) return;
    const RK = { arterial: 3, street: 2, lane: 1 };
    const near = [];
    for (const ri of rl) {
      const m = memo(ri);
      if (!m) continue;
      const J = m.junctions.find((j) => j.n === n);
      if (!J) continue;
      const i0 = Math.floor((J.s - m.start) / m.sp);
      let best = null, bd = 1e9;
      for (let i = i0 - 1; i <= i0 + 2; i++) {
        const p = poleAt(m, i);
        if (!p) continue;
        const d = Math.hypot(p.x - n.x, p.y - n.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (best && bd < 90) near.push({ m, p: best, d: bd, rank: RK[m.r.kind] || 0 });
    }
    if (near.length < 2) return;
    near.sort((a, b) => b.rank - a.rank || a.m.ri - b.m.ri);
    const hub = near[0], P = hub.p.P;
    const rr = U.rng('tie:' + nid);
    if (rr.next() > 0.35 + 0.6 * P.tangle) return;
    let k = 0;
    for (let i = 1; i < near.length; i++) {
      const a = hub.p, b = near[i].p;
      if (b.ri === a.ri) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < 14 || d > 100) continue;
      const base = 0.4 + 0.0011 * d * d;
      const ha = a.hLT || a.hHT, hb = b.hLT || b.hHT;
      for (const c of [1, 2]) addSpan(cell, 'power', insX(a, c), insY(a, c), ha + 0.7, insX(b, c), insY(b, c), hb + 0.7, base * 1.1, null, 1e9 + nid * 64 + k++);
      const nc = Math.round(P.tangle * 2.2 * rr.next());
      for (let c = 0; c < nc; c++) addSpan(cell, 'cable', a.x, a.y, 27.4 + rr.next() * 1.4, b.x, b.y, 27.4 + rr.next() * 1.4, 1.5 + rr.next() * 3 + d * 0.02, null, 1e9 + nid * 64 + 16 + k++);
    }
    // a pole-mounted transformer (H-frame: a second pole 5.2 u along the road)
    if (rr.next() < P.tx) {
      const a = hub.p, S = N.SURF;
      for (const sg of [1, -1]) {
        const x2 = a.x + a.ux * 5.2 * sg, y2 = a.y + a.uy * 5.2 * sg;
        const sf = N.world.surfaceAt(x2, y2);
        if (!(sf === S.FOOTPATH || (a.lane && sf === S.ROAD))) continue;
        if (bldgAt(x2, y2) || lampNear(x2, y2, 6)) continue;
        cell.tx.push({ pole: a, x: a.x, y: a.y, x2, y2, cx: (a.x + x2) / 2, cy: (a.y + y2) / 2, ang: a.ang, h0: 15.5, h1: 21, hp: 23, id: nid });
        break;
      }
    }
  }

  /* ================================================================ cells */
  // A cell is generated as a resumable job (one road per step) so a dense Old City cell never blows the
  // frame budget; genCell(i, j) runs a whole job synchronously (tests, queries).
  function startCell(i, j) {
    const cell = { i, j, key: ckey(i, j), x0: i * CELL, y0: j * CELL, poles: [], spans: [], tx: [], kites: [], threads: [], chappals: [], ms: 0 };
    return { cell, list: G.segIdx.get(cell.key) || [], li: 0, ph: 0, ms: 0 };
  }
  function stepCell(J, deadline) {
    const cell = J.cell, x0 = cell.x0, y0 = cell.y0, x1 = x0 + CELL, y1 = y0 + CELL;
    const t0 = now();
    while (J.ph === 0 && J.li < J.list.length) {
      const m = memo(J.list[J.li++]);
      if (m) {
        // arclength ranges of the segments that touch the cell
        const P = m.pts;
        let lastI = -1;
        for (let s = 0; s < P.length - 1; s++) {
          const a = P[s], b = P[s + 1];
          const mg = m.off + 12;
          if (Math.max(a[0], b[0]) < x0 - mg || Math.min(a[0], b[0]) > x1 + mg || Math.max(a[1], b[1]) < y0 - mg || Math.min(a[1], b[1]) > y1 + mg) continue;
          const ia = Math.max(0, Math.ceil((m.cum[s] - 10 - m.start) / m.sp)), ib = Math.floor((m.cum[s + 1] + 10 - m.start) / m.sp);
          for (let ii = Math.max(ia, lastI + 1); ii <= ib; ii++) {
            lastI = ii;
            const p = poleAt(m, ii);
            if (!p || p.x < x0 || p.x >= x1 || p.y < y0 || p.y >= y1) continue;
            cell.poles.push(p);
            poleSpans(cell, m, p);
          }
        }
      }
      if (now() > deadline) { J.ms += now() - t0; return false; }
    }
    if (J.ph === 0) {
      for (const nid of G.nodeIdx.get(cell.key) || []) junctionTies(cell, nid);
      for (const t of cell.tx) t.pole.tx = t;
      decorate(cell);
      J.ph = 1;
    }
    J.ms += now() - t0;
    cell.ms = J.ms;
    G.stats.cellsBuilt++; G.stats.genMs += cell.ms; G.stats.maxCellMs = Math.max(G.stats.maxCellMs, cell.ms);
    if (G.cells.size >= CELL_CAP) { const old = G.cells.keys().next().value; G.cells.delete(old); }
    G.cells.set(cell.key, cell);
    G.ver++;
    return true;
  }
  function genCell(i, j) {
    const k = ckey(i, j);
    if (G.job && G.job.cell.key === k) { const J = G.job; G.job = null; stepCell(J, Infinity); return J.cell; }
    const J = startCell(i, j);
    stepCell(J, Infinity);
    return J.cell;
  }
  // kites (candidates with their hash; the date picks a subset), manja threads, chappals
  function decorate(cell) {
    for (const sp of cell.spans) {
      if (sp.kind === 'service' || sp.len < 10) continue;
      const kh = hn(sp.id, SALT.kite);
      const p = PROF[styleAt(sp.ax, sp.ay)] || PROF.colony;
      const dens = 0.025 + 0.11 * p.tangle;
      if (kh < dens) {
        const r = rngN(sp.id, SALT.k);
        const k = { sp, t: 0.15 + 0.7 * r.next(), kh: kh / dens, c1: KITE_COLS[(r.next() * KITE_COLS.length) | 0], c2: KITE_COLS[(r.next() * KITE_COLS.length) | 0], size: 3.6 + r.next() * 2.4, torn: r.next(), tilt: (r.next() - 0.5) * 1.2, flip: r.next() < 0.5 ? -1 : 1, tail: r.next() < 0.7 };
        cell.kites.push(k);
        if (r.next() < 0.75) { // its manja: a loop to a point further along the wire, or a strand hanging down
          const t2 = clamp(k.t + (r.next() < 0.5 ? -1 : 1) * (0.12 + r.next() * 0.25), 0.03, 0.97);
          cell.threads.push({ sp, t: k.t, t2, drop: r.next() < 0.35 ? 3 + r.next() * 6 : 0, sag: 1.5 + r.next() * 4.5, col: MANJA_COLS[(r.next() * MANJA_COLS.length) | 0], kh: k.kh, ph: r.next() * TAU });
        }
      } else if (kh < dens * 1.6) { // a bare manja tangle
        const r = rngN(sp.id, SALT.m), t = 0.1 + 0.8 * r.next();
        cell.threads.push({ sp, t, t2: clamp(t + (r.next() - 0.5) * 0.5, 0.03, 0.97), drop: r.next() < 0.5 ? 2 + r.next() * 7 : 0, sag: 1 + r.next() * 5, col: MANJA_COLS[(r.next() * MANJA_COLS.length) | 0], kh: (kh - dens) / (dens * 0.6), ph: r.next() * TAU });
      }
      // the odd pair of chappals thrown over a wire (lanes in the old city / colonies / markets)
      if (sp.lo > 20 && hn(sp.id, SALT.chappal) < 0.0045) {
        const s = styleAt(sp.ax, sp.ay);
        if (s === 'oldcity' || s === 'colony' || s === 'market') { const r = rngN(sp.id, SALT.ch); cell.chappals.push({ sp, t: 0.3 + 0.4 * r.next(), col: r.next() < 0.7 ? '#2f5fae' : '#3a2a20', drop: 1.8 + r.next() * 1.4 }); }
      }
    }
    for (const p of cell.poles) {
      const kh = hn(p.id, SALT.pkite), dens = 0.03 + 0.07 * p.P.tangle;
      if (kh < dens) { const r = rngN(p.id, SALT.pk); p.kite = { kh: kh / dens, c1: KITE_COLS[(r.next() * KITE_COLS.length) | 0], c2: KITE_COLS[(r.next() * KITE_COLS.length) | 0], size: 3.4 + r.next() * 2, off: INS[(r.next() * 4) | 0] + p.shift, torn: r.next() }; }
    }
  }
  function styleAt(x, y) { const d = N.world.districtAt(x, y); return d && PROF[d.style] ? d.style : 'colony'; }

  // date -> share of the kite candidates shown (Sankranti: kites cut in the weeks of kite flying)
  function kiteShare() {
    if (st.kitesForced != null) return st.kitesForced ? 1 : 0;
    let on = false;
    try { on = !!(N.seasons && N.seasons.is && N.seasons.is('sankranti')); } catch (e) { on = false; }
    if (on) return 1;
    const d = N.atmos && N.atmos.date ? N.atmos.date() : { m: 1, d: 14 };
    const md = d.m * 100 + d.d;
    if (md >= 101 && md < 113) return 0.35 + 0.05 * (d.d - 1);
    if (md >= 113 && md <= 120) return 1;
    if (md > 120 && md <= 131) return 1 - (d.d - 20) * 0.04;
    if (md >= 201 && md <= 225) return Math.max(0.12, 0.55 - (d.d - 1) * 0.018);
    return 0;
  }

  /* ---------------------------------------------------------------- work queue */
  function want(i, j, pri) {
    const k = ckey(i, j);
    const c = G.cells.get(k);
    if (c) { G.cells.delete(k); G.cells.set(k, c); return c; } // LRU touch
    if (!G.queued.has(k)) { G.queued.add(k); G.queue.push({ i, j, k, pri }); }
    else for (const q of G.queue) if (q.k === k && pri < q.pri) q.pri = pri;
    return null;
  }
  function work(budget) {
    const t0 = now();
    if (!G.ready) { if (canIndex()) indexStep(t0 + budget); return; }
    if (!G.queue.length && !G.job) return;
    G.queue.sort((a, b) => a.pri - b.pri);
    const deadline = t0 + budget;
    while (now() < deadline) {
      if (!G.job) {
        if (!G.queue.length) break;
        const q = G.queue.shift();
        G.queued.delete(q.k);
        if (G.cells.has(q.k)) continue;
        G.job = startCell(q.i, q.j);
      }
      let done = true;
      try { done = stepCell(G.job, deadline); } catch (e) { N.err('wires.gen', e); done = true; }
      if (done) G.job = null;
    }
    // stale requests (no longer wanted) are dropped after a while
    if (G.queue.length > 400) { for (const q of G.queue.splice(300)) G.queued.delete(q.k); }
  }
  function ensureRect(x0, y0, x1, y1) {
    if (!ensureIndex()) return [];
    const out = [];
    for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      let c = G.cells.get(ckey(i, j));
      if (!c) { G.queued.delete(ckey(i, j)); c = genCell(i, j); }
      out.push(c);
    }
    return out;
  }

  /* ================================================================ geometry helpers */
  function heightAt(sp, t) { return sp.ah + (sp.bh - sp.ah) * t - sp.sag * shape(t); }
  function pointAt(sp, t, out) {
    out = out || {};
    out.x = sp.ax + (sp.bx - sp.ax) * t; out.y = sp.ay + (sp.by - sp.ay) * t; out.h = heightAt(sp, t);
    return out;
  }
  function threadPts(th, n, out) {
    // a manja loop between two points of the wire, or a strand hanging from it
    const a = pointAt(th.sp, th.t, {}), b = th.drop ? null : pointAt(th.sp, th.t2, {});
    out.length = 0;
    if (b) {
      for (let k = 0; k <= n; k++) { const t = k / n; out.push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.h + (b.h - a.h) * t - th.sag * shape(t)); }
    } else {
      const sw = Math.sin(th.ph) * 1.2, cw = Math.cos(th.ph) * 1.2;
      for (let k = 0; k <= n; k++) { const t = k / n; out.push(a.x + sw * t * t, a.y + cw * t * t, a.h - th.drop * t); }
    }
    return out;
  }

  /* ================================================================ 2D drawing */
  const NB = 18, BAND = 34;
  const bands = [];
  for (let b = 0; b < NB; b++) bands.push({ b, poles: [], spans: [], kites: [], threads: [], chappals: [], tx: [], fn: null });
  const swayT = { x: 0, y: 0 };
  let frameShare = 0, frameNight = 0, frameSun = 1;
  const shadowSpans = [];
  const tmpArr = [];
  const prof2d = { ms: 0, poles: 0, spans: 0, cells: 0 };

  function draw2d() {
    if (!st.enabled || !st.draw2d || !N.world || !N.world.built) return;
    if (N.view3d && N.view3d.active) return;
    const R = N.render, v = R.view;
    if (!v || !isFinite(v.x0)) return;
    const t0 = now();
    if (!G.ready) return;
    const M = 26;
    const vx0 = v.x0 - M, vy0 = v.y0 - M, vx1 = v.x1 + M, vy1 = v.y1 + M;
    const cxw = (v.x0 + v.x1) / 2, cyw = (v.y0 + v.y1) / 2;
    for (const B of bands) { B.poles.length = 0; B.spans.length = 0; B.kites.length = 0; B.threads.length = 0; B.chappals.length = 0; B.tx.length = 0; }
    shadowSpans.length = 0;
    frameShare = kiteShare();
    frameNight = R.night || 0;
    frameSun = R.sun ? R.sun.strength : 1;
    const shadows = frameNight < 0.5 && frameSun > 0.08;
    const D = N.draw;
    const lights = R.lights;
    let nc = 0, np = 0, ns = 0;
    const bandOf = (x, y) => Math.min(NB - 1, (Math.hypot(x - R.camX, y - R.camY) / BAND) | 0);
    for (let j = Math.floor(vy0 / CELL); j <= Math.floor(vy1 / CELL); j++) for (let i = Math.floor(vx0 / CELL); i <= Math.floor(vx1 / CELL); i++) {
      const cx = (i + 0.5) * CELL, cy = (j + 0.5) * CELL;
      const c = want(i, j, Math.hypot(cx - cxw, cy - cyw));
      if (!c) continue;
      nc++;
      for (const p of c.poles) {
        if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue;
        bands[bandOf(p.x, p.y)].poles.push(p); np++;
        if (shadows) D.castPole(p.x, p.y, p.h, POLE_W[p.kind]);
        if (p.lamp && frameNight > 0.05) lights.push({ x: p.lamp.x, y: p.lamp.y, r: p.lamp.tube ? 44 : 58, color: p.lamp.tube ? '#bfe8ff' : '#ffa040', intensity: p.lamp.tube ? 0.72 : 0.9, h: p.lamp.h });
      }
      for (const sp of c.spans) {
        if (sp.x1 < vx0 || sp.x0 > vx1 || sp.y1 < vy0 || sp.y0 > vy1) continue;
        bands[bandOf((sp.ax + sp.bx) / 2, (sp.ay + sp.by) / 2)].spans.push(sp); ns++;
        if (shadows) shadowSpans.push(sp);
      }
      for (const t of c.tx) {
        if (t.cx < vx0 || t.cx > vx1 || t.cy < vy0 || t.cy > vy1) continue;
        bands[bandOf(t.cx, t.cy)].tx.push(t);
        if (shadows) { D.castPole(t.x2, t.y2, t.hp, 1.5); D.castCircle(t.cx, t.cy, 2.4, t.h1); }
      }
      if (frameShare > 0) {
        for (const k of c.kites) if (k.kh < frameShare && inV(k.sp, vx0, vy0, vx1, vy1)) bands[bandOf(k.sp.ax, k.sp.ay)].kites.push(k);
        for (const th of c.threads) if (th.kh < frameShare && inV(th.sp, vx0, vy0, vx1, vy1)) bands[bandOf(th.sp.ax, th.sp.ay)].threads.push(th);
      }
      for (const ch of c.chappals) if (inV(ch.sp, vx0, vy0, vx1, vy1)) bands[bandOf(ch.sp.ax, ch.sp.ay)].chappals.push(ch);
    }
    if (shadowSpans.length) R.queue('shadow', 1, drawWireShadows);
    for (const B of bands) {
      if (!B.poles.length && !B.spans.length && !B.tx.length) continue;
      const d = (B.b + 0.5) * BAND;
      R.queue('structures', -d * d, B.fn || (B.fn = (ctx) => drawBand(ctx, B)));
    }
    prof2d.cells = nc; prof2d.poles = np; prof2d.spans = ns;
    prof2d.enq = now() - t0;
  }
  const inV = (sp, x0, y0, x1, y1) => !(sp.x1 < x0 || sp.x0 > x1 || sp.y1 < y0 || sp.y0 > y1);

  function swayOf(sp) {
    const Wd = N.wind;
    if (!Wd || !Wd.sway) { swayT.x = 0; swayT.y = 0; return swayT; }
    Wd.sway((sp.ax + sp.bx) * 0.5, (sp.ay + sp.by) * 0.5, sp.ph, swayT);
    const a = sp.len * (sp.kind === 'cable' ? 0.06 : 0.045);
    swayT.x *= a; swayT.y *= a;
    return swayT;
  }
  function pathSpan(ctx, sp, Rr) {
    const P = sp.pts, n = P.length / 3 - 1, sw = swayOf(sp);
    for (let k = 0; k <= n; k++) {
      const t = k / n, w = 4 * t * (1 - t);
      const x = P[k * 3] + sw.x * w, y = P[k * 3 + 1] + sw.y * w, kk = Rr.k(P[k * 3 + 2]);
      const X = Rr.sx(x, kk), Y = Rr.sy(y, kk);
      if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
    }
  }
  function drawBand(ctx, B) {
    const t0 = now();
    const R = N.render, Z = R.Z;
    const night = frameNight;
    // poles: body (by kind), then the crossarms and fittings
    ctx.lineCap = 'butt';
    for (const kind of ['psc', 'rail', 'tube']) {
      let any = false;
      ctx.beginPath();
      for (const p of B.poles) {
        if (p.kind !== kind) continue;
        any = true;
        const k0 = R.k(0), k1 = R.k(p.h);
        ctx.moveTo(R.sx(p.x, k0), R.sy(p.y, k0)); ctx.lineTo(R.sx(p.x, k1), R.sy(p.y, k1));
      }
      for (const t of B.tx) {
        if (t.pole.kind !== kind) continue;
        any = true;
        const k0 = R.k(0), k1 = R.k(t.hp);
        ctx.moveTo(R.sx(t.x2, k0), R.sy(t.y2, k0)); ctx.lineTo(R.sx(t.x2, k1), R.sy(t.y2, k1));
      }
      if (!any) continue;
      ctx.strokeStyle = night > 0.5 ? U.shade(POLE_COL[kind], 0.55) : POLE_COL[kind];
      ctx.lineWidth = Math.max(1, POLE_W[kind] * Z);
      ctx.stroke();
      // sunlit edge on the concrete poles
      if (kind === 'psc' && night < 0.4) { ctx.strokeStyle = 'rgba(255,250,235,0.35)'; ctx.lineWidth = Math.max(0.6, 0.5 * Z); ctx.stroke(); }
    }
    // transformers: platform + tank (extruded, sun-shaded)
    for (const t of B.tx) drawTx(ctx, t, R);
    // crossarms + lamp arms + cable coils
    ctx.beginPath();
    for (const p of B.poles) {
      for (const h of [p.hHT, p.hLT]) {
        if (!h) continue;
        const k = R.k(h);
        const a0 = INS[0] - 0.6 + p.shift, a1 = INS[3] + 0.6 + p.shift;
        ctx.moveTo(R.sx(p.x + p.onx * a0, k), R.sy(p.y + p.ony * a0, k));
        ctx.lineTo(R.sx(p.x + p.onx * a1, k), R.sy(p.y + p.ony * a1, k));
      }
      if (p.lamp) {
        const k = R.k(p.lamp.h), k2 = R.k(p.lamp.h + 1.2);
        ctx.moveTo(R.sx(p.x, k), R.sy(p.y, k)); ctx.lineTo(R.sx(p.lamp.x, k2), R.sy(p.lamp.y, k2));
      }
    }
    ctx.strokeStyle = night > 0.5 ? '#2a2622' : '#4a443c';
    ctx.lineWidth = Math.max(1, 0.8 * Z);
    ctx.stroke();
    let coils = false;
    ctx.beginPath();
    for (const p of B.poles) {
      if (!p.coil) continue;
      coils = true;
      const k = R.k(24.5), X = R.sx(p.x + p.onx * 0.9, k), Y = R.sy(p.y + p.ony * 0.9, k);
      ctx.moveTo(X + 1.5 * k, Y); ctx.ellipse(X, Y, 1.5 * k, 1.1 * k, p.ang, 0, TAU);
    }
    if (coils) { ctx.strokeStyle = '#121010'; ctx.lineWidth = Math.max(0.8, 0.6 * Z); ctx.stroke(); }
    // wires: one path per colour
    ctx.lineJoin = 'round';
    for (const kind of ['service', 'cable', 'power']) {
      let any = false;
      ctx.beginPath();
      for (const sp of B.spans) { if (sp.kind !== kind) continue; any = true; pathSpan(ctx, sp, R); }
      if (!any) continue;
      ctx.strokeStyle = WIRE_COL[kind];
      ctx.globalAlpha = (night > 0.5 ? 0.8 : 1) * (kind === 'service' ? 0.6 : kind === 'cable' ? 0.85 : 0.75);
      ctx.lineWidth = (kind === 'cable' ? 0.8 : kind === 'power' ? 0.7 : 0.6) * clamp(Z, 0.8, 1.3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // insulators (white porcelain catching the light)
    ctx.fillStyle = night > 0.5 ? '#9c9a94' : '#f6f4ec';
    const isz = Math.max(1, 0.9 * Z);
    for (const p of B.poles) {
      for (const h of [p.hHT, p.hLT]) {
        if (!h) continue;
        const k = R.k(h + 0.6);
        for (let c = 0; c < 4; c++) {
          if (h === p.hHT && c === 1) continue;
          ctx.fillRect(R.sx(insX(p, c), k) - isz / 2, R.sy(insY(p, c), k) - isz / 2, isz, isz);
        }
      }
    }
    // pole lights
    for (const p of B.poles) {
      if (!p.lamp) continue;
      const k = R.k(p.lamp.h + 1.2), X = R.sx(p.lamp.x, k), Y = R.sy(p.lamp.y, k);
      ctx.fillStyle = night > 0.2 ? (p.lamp.tube ? '#f0fbff' : '#ffe0a0') : '#d8d4c8';
      ctx.fillRect(X - 1.4 * k, Y - 0.9 * k, 2.8 * k, 1.8 * k);
    }
    // Sankranti kites + manja, chappals
    if (B.threads.length) {
      for (const th of B.threads) {
        threadPts(th, th.drop ? 3 : 6, tmpArr);
        ctx.beginPath();
        for (let q = 0; q < tmpArr.length; q += 3) { const k = R.k(tmpArr[q + 2]); const X = R.sx(tmpArr[q], k), Y = R.sy(tmpArr[q + 1], k); if (q) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
        ctx.strokeStyle = th.col; ctx.globalAlpha = 0.75; ctx.lineWidth = Math.max(0.5, 0.45 * Z); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    for (const kt of B.kites) drawKite2d(ctx, R, kt);
    for (const p of B.poles) if (p.kite && p.kite.kh < frameShare) drawPoleKite2d(ctx, R, p);
    for (const ch of B.chappals) drawChappal2d(ctx, R, ch);
    prof2d.ms += now() - t0;
  }
  function drawTx(ctx, t, R) {
    const c = Math.cos(t.ang), s = Math.sin(t.ang);
    const nx = t.pole.onx, ny = t.pole.ony;
    const rect = (w, d, ox) => { const cxp = t.cx + nx * ox, cyp = t.cy + ny * ox; return [[cxp - c * w - nx * d, cyp - s * w - ny * d], [cxp + c * w - nx * d, cyp + s * w - ny * d], [cxp + c * w + nx * d, cyp + s * w + ny * d], [cxp - c * w + nx * d, cyp - s * w + ny * d]]; };
    const night = frameNight > 0.5;
    N.draw.poly(rect(3.6, 1.3, 0), t.h0 - 0.7, t.h0, { wall: night ? '#2c2a28' : '#55504a', roof: night ? '#33302c' : '#605a52' });
    N.draw.poly(rect(2.2, 1.7, 0.3), t.h0, t.h1, { wall: night ? '#3a4038' : '#6e7b6a', roof: night ? '#434a40' : '#7f8c7a' });
    // bushings
    const k = R.k(t.h1 + 1.1);
    ctx.fillStyle = night ? '#9c9a94' : '#f2efe6';
    for (const o of [-1.4, 0, 1.4]) ctx.fillRect(R.sx(t.cx + c * o, k) - 0.7, R.sy(t.cy + s * o, k) - 0.7, 1.4, 1.4);
  }
  function kiteCorners(kt, out) {
    const sp = kt.sp, pt = pointAt(sp, kt.t, {});
    const sw = swayOf(sp), w = 4 * kt.t * (1 - kt.t);
    pt.x += sw.x * w; pt.y += sw.y * w;
    const ux = (sp.bx - sp.ax) / (sp.len || 1), uy = (sp.by - sp.ay) / (sp.len || 1);
    const px = -uy * kt.flip, py = ux * kt.flip;
    const s = kt.size, ca = Math.cos(kt.tilt), sa = Math.sin(kt.tilt);
    // kite axes: "a" across (mostly along the wire), "b" down the kite (tilted out of the vertical)
    const ax = (ux * ca + px * sa) * s * 0.5, ay = (uy * ca + py * sa) * s * 0.5;
    const bx = (px * ca - ux * sa) * 0.62 * s, by = (py * ca - uy * sa) * 0.62 * s, bh = -0.78 * s;
    out[0] = pt.x; out[1] = pt.y; out[2] = pt.h;                                                     // top (on the wire)
    out[3] = pt.x + bx * 0.45 - ax; out[4] = pt.y + by * 0.45 - ay; out[5] = pt.h + bh * 0.45;        // left
    out[6] = pt.x + bx * 1.25; out[7] = pt.y + by * 1.25; out[8] = pt.h + bh * 1.25;                 // bottom
    out[9] = pt.x + bx * 0.45 + ax; out[10] = pt.y + by * 0.45 + ay; out[11] = pt.h + bh * 0.45;     // right
    return out;
  }
  const KC = new Float32Array(12);
  function drawKite2d(ctx, R, kt) {
    kiteCorners(kt, KC);
    const P = (q) => { const k = R.k(KC[q + 2]); return [R.sx(KC[q], k), R.sy(KC[q + 1], k)]; };
    const T = P(0), L = P(3), Bm = P(6), Rt = P(9);
    const night = frameNight > 0.5;
    const tri = (a, b, c, col) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fillStyle = night ? U.shade(col, 0.45) : col; ctx.fill(); };
    const cm = [(T[0] + Bm[0]) / 2, (T[1] + Bm[1]) / 2];
    // a torn kite loses a quarter (or the bottom half)
    if (kt.torn > 0.75) { tri(T, L, cm, kt.c1); tri(T, Rt, cm, kt.c2); }
    else if (kt.torn > 0.45) { tri(T, L, Bm, kt.c1); tri(T, Rt, cm, kt.c2); }
    else { tri(T, L, Bm, kt.c1); tri(T, Rt, Bm, kt.c2); }
    ctx.strokeStyle = 'rgba(40,30,20,0.55)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(T[0], T[1]); ctx.lineTo(kt.torn > 0.75 ? cm[0] : Bm[0], kt.torn > 0.75 ? cm[1] : Bm[1]); ctx.moveTo(L[0], L[1]); ctx.lineTo(Rt[0], Rt[1]); ctx.stroke();
    if (kt.tail && kt.torn <= 0.75) {
      const k = R.k(KC[8] - 3.2), sw = Math.sin(N.time.real * 2.2 + kt.t * 20) * 1.2;
      ctx.beginPath(); ctx.moveTo(Bm[0], Bm[1]); ctx.lineTo(R.sx(KC[6] + sw, k), R.sy(KC[7] + sw * 0.5, k));
      ctx.strokeStyle = kt.c2; ctx.lineWidth = Math.max(0.7, 0.6 * R.Z); ctx.stroke();
    }
  }
  function drawPoleKite2d(ctx, R, p) {
    const K = p.kite, h = (p.hLT || p.hHT) + 0.3, s = K.size;
    const x = p.x + p.onx * K.off, y = p.y + p.ony * K.off;
    const P = (dx, dy, dh) => { const k = R.k(h + dh); return [R.sx(x + dx, k), R.sy(y + dy, k)]; };
    const ax = p.ux * s * 0.5, ay = p.uy * s * 0.5, bx = p.onx * s * 0.5, by = p.ony * s * 0.5;
    const T = P(0, 0, 0), L = P(-ax + bx * 0.4, -ay + by * 0.4, -s * 0.35), Bm = P(bx, by, -s * 0.9), Rt = P(ax + bx * 0.4, ay + by * 0.4, -s * 0.35);
    const night = frameNight > 0.5;
    ctx.beginPath(); ctx.moveTo(T[0], T[1]); ctx.lineTo(L[0], L[1]); ctx.lineTo(Bm[0], Bm[1]); ctx.closePath(); ctx.fillStyle = night ? U.shade(K.c1, 0.45) : K.c1; ctx.fill();
    if (K.torn < 0.6) { ctx.beginPath(); ctx.moveTo(T[0], T[1]); ctx.lineTo(Rt[0], Rt[1]); ctx.lineTo(Bm[0], Bm[1]); ctx.closePath(); ctx.fillStyle = night ? U.shade(K.c2, 0.45) : K.c2; ctx.fill(); }
  }
  function drawChappal2d(ctx, R, ch) {
    const sp = ch.sp, pt = pointAt(sp, ch.t, {});
    const ux = (sp.bx - sp.ax) / (sp.len || 1), uy = (sp.by - sp.ay) / (sp.len || 1);
    for (const o of [-0.8, 0.8]) {
      const x = pt.x + ux * o, y = pt.y + uy * o, k0 = R.k(pt.h - 0.4), k1 = R.k(pt.h - ch.drop - 0.4);
      ctx.beginPath(); ctx.moveTo(R.sx(x, k0), R.sy(y, k0)); ctx.lineTo(R.sx(x, k1), R.sy(y, k1));
      ctx.strokeStyle = frameNight > 0.5 ? '#55524c' : '#e6e0d2'; ctx.lineWidth = Math.max(1, 1.2 * R.Z); ctx.stroke();
      ctx.fillStyle = ch.col; ctx.fillRect(R.sx(x, k0) - 0.6, R.sy(y, k0) - 0.6, 1.2, 1.2);
    }
  }
  function drawWireShadows(ctx) {
    const R = N.render, sun = R.sun, Z = R.Z;
    if (!sun) return;
    ctx.beginPath();
    for (const sp of shadowSpans) {
      if (sp.kind === 'service') continue;
      const P = sp.pts, n = P.length / 3 - 1;
      for (let k = 0; k <= n; k++) {
        const h = P[k * 3 + 2], X = R.sx(P[k * 3] + sun.sx * h, Z), Y = R.sy(P[k * 3 + 1] + sun.sy * h, Z);
        if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
    }
    ctx.strokeStyle = '#20142a'; ctx.globalAlpha = 0.04 + 0.05 * frameSun; ctx.lineWidth = 0.8 * clamp(Z, 0.8, 1.3);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* ================================================================ 3D */
  const V = {
    inited: false, H: null, T: null, group: null, chunks: new Map(), sig: '', rebuildAt: 0, dirty: false,
    poleIM: null, headIM: null, lampIM: null, txIM: null, wire: null, extras: null, glows: null,
    caps: { pole: 0, head: 0, lamp: 0, tx: 0, wire: 0 }, counts: {}, lampList: [], buildMs: 0, rebuilds: 0, models: {}, modelVer: 0, kiteShare: -1, lastJs: 0, jsAvg: 0,
  };
  const VSf = () => (N.view3d && N.view3d.VS) || 1.5;
  function radius3() { const Q = N.view3d && N.view3d.quality; return Math.min(600, (Q && Q.nearDist) || 600); }

  function init3d(THREE, H) {
    V.inited = true; V.H = H; V.T = THREE;
    V.group = new THREE.Group(); V.group.name = 'wires';
    H.layer.add(V.group);
    V.sig = ''; V.chunks.clear();
  }
  function dispose3d(H) {
    if (!V.inited) return;
    for (const k of ['poleIM', 'headIM', 'lampIM', 'txIM', 'wire', 'extras', 'glows']) {
      const o = V[k];
      if (!o) continue;
      if (o.parent) o.parent.remove(o);
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      V[k] = null;
    }
    if (V.group && V.group.parent) V.group.parent.remove(V.group);
    V.inited = false; V.chunks.clear(); V.sig = '';
    for (const k in V.caps) V.caps[k] = 0;
  }
  // unit geometries (fallbacks when the Blender pack has no pole models)
  let GEO = null;
  function geos(THREE, H) {
    if (GEO) return GEO;
    GEO = {};
    const vs = VSf();
    // pole: tapered square section 0..1 (scaled to the pole height), a darker base band
    let gb = H.builder();
    gb.color('#8a857c').cyl(0, 0, 0, 0.78, 0.74, 0.04, 4, { top: false });
    gb.color('#ffffff').cyl(0, 0.04, 0, 0.74, 0.44, 0.96, 4, { top: true });
    GEO.pole = gb.build(); GEO.pole.rotateY(Math.PI / 4);
    // head: steel channel crossarm across the road (local z) + 4 porcelain insulators + a top pin
    gb = H.builder();
    gb.color('#4f4a44').box(-0.32, -0.35, INS[0] - 0.6, 0.32, 0.25, INS[3] + 0.6);
    gb.color('#4f4a44').obox(0, -1.4, 0.2, 0.2, -2.6, -0.3, 0); // brace
    for (const z of INS) {
      gb.color('#f4f2ea').cyl(0, 0.25, z, 0.32, 0.26, 0.55, 6, { top: false });
      gb.color('#ffffff').cyl(0, 0.8, z, 0.26, 0.2, 0.25, 6, { top: true });
    }
    GEO.head = gb.build();
    // pole light: a bent pipe over the road (local -z) and a head with an emissive lens (aGlow)
    gb = H.builder();
    gb.color('#55585c').obox(0, -2.8, 0.35, 5.6, 0, 0.45, 0);
    gb.color('#55585c').obox(0, -5.2, 0.4, 0.4, 0.45, 1.8, 0);
    gb.color('#4a4c50').obox(0, -5.6, 1.6, 3.2, 1.4, 2.2, 0);
    const nLamp0 = gb.n;
    gb.color('#ffffff').obox(0, -5.6, 1.2, 2.6, 1.15, 1.42, 0, { top: false });
    GEO.lamp = gb.build();
    const glow = new Float32Array(GEO.lamp.attributes.position.count);
    for (let i = nLamp0; i < glow.length; i++) glow[i] = 1;
    GEO.lamp.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    // transformer (absolute 3D units): second pole at +5.2 along the road, channel platform, tank with fins, bushings
    gb = H.builder();
    const y0 = 15.5 * vs, y1 = 21 * vs;
    gb.color('#b8b2a5').cyl(5.2, 0, 0, 0.75, 0.45, 23 * vs, 4, { top: true });
    gb.color('#4f4a44').box(-0.5, y0 - 1.0, -1.6, 5.7, y0, 1.6);
    gb.color('#6e7b6a').box(0.8, y0, -1.5, 4.4, y1 - 1.0, 1.5);
    gb.color('#7f8c7a').box(0.6, y1 - 1.0, -1.7, 4.6, y1, 1.7);
    gb.color('#5d695a');
    for (let f = 0; f < 5; f++) { const fx = 1.1 + f * 0.75; gb.box(fx - 0.08, y0 + 0.6, -2.1, fx + 0.08, y1 - 2, -1.5); gb.box(fx - 0.08, y0 + 0.6, 1.5, fx + 0.08, y1 - 2, 2.1); }
    gb.color('#f2efe6');
    for (const o of [1.4, 2.6, 3.8]) gb.cyl(o, y1, 0, 0.32, 0.22, 1.6, 6, { top: true });
    gb.color('#4f4a44').box(-0.4, 25.5 * vs, -2.6, 5.6, 25.5 * vs + 0.6, 2.6);
    GEO.tx = gb.build();
    // wire strip: NS segments, aT = (t, side)
    const NS = 12, pos = new Float32Array((NS + 1) * 2 * 3), at = new Float32Array((NS + 1) * 2 * 2), idx = [];
    for (let k = 0; k <= NS; k++) {
      at[k * 4] = k / NS; at[k * 4 + 1] = -1; at[k * 4 + 2] = k / NS; at[k * 4 + 3] = 1;
      if (k < NS) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    GEO.wireBase = { pos, at, idx, NS };
    for (const k of ['pole', 'head', 'lamp', 'tx']) GEO[k].userData.shared = true;
    return GEO;
  }
  // a Blender pole model when the pack has one (geometry + material of its first mesh, scaled to 1 u tall)
  function modelGeo(id) {
    const M = N.models3d;
    if (!M || !M.ready || !M.has || !M.has(id)) return null;
    if (V.models[id] !== undefined) return V.models[id];
    if (!M.loaded(id)) {
      if (!V.models['_p' + id] && M.parse) { V.models['_p' + id] = 1; try { Promise.resolve(M.parse(id)).then(() => { V.modelVer++; V.sig = ''; }, () => {}); } catch (e) { /* optional */ } }
      return null;
    }
    let res = null;
    try {
      const o = M.instance(id);
      const T = V.T, meshes = [];
      o.updateMatrixWorld(true);
      o.traverse((m) => { if (m.isMesh && !(m.name || '').startsWith('COL_')) meshes.push(m); });
      if (meshes.length) {
        const m = meshes[0], g = m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        g.computeBoundingBox();
        const hgt = g.boundingBox.max.y - g.boundingBox.min.y || 1;
        g.scale(1, 1 / hgt, 1);
        g.userData.shared = true;
        res = { geo: g, mat: m.material, h: hgt };
        void T;
      }
    } catch (e) { N.err('wires.model:' + id, e); res = null; }
    V.models[id] = res;
    return res;
  }
  function wireMaterial(THREE) {
    const Wd = N.wind, uw = Wd && Wd.uniforms ? Wd.uniforms(THREE) : null;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: true });
    mat.userData.uni = { uPxK: { value: 0.002 }, uSwayK: { value: 0.035 }, uWireLight: { value: 1 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, mat.userData.uni);
      const hasWind = !!(uw && Wd.GLSL);
      if (hasWind) { sh.uniforms.uWind = uw.uWind; sh.uniforms.uWindWave = uw.uWindWave; }
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', [
          '#include <common>',
          'attribute vec2 aT; attribute vec4 iA; attribute vec4 iB; attribute vec4 iC;',
          'uniform float uPxK; uniform float uSwayK;',
          'varying vec3 vWCol; varying float vWA;',
          hasWind ? Wd.GLSL : 'vec3 windOffset(vec3 wp, float w, float ph) { return vec3(0.0); }',
          'float wch(float x) { return 0.5 * (exp(x) + exp(-x)); }',
          'float wsh(float x) { return 0.5 * (exp(x) - exp(-x)); }',
        ].join('\n'))
        .replace('#include <begin_vertex>', [
          'float wt = aT.x;',
          'vec3 wA = iA.xyz; vec3 wB = iB.xyz;',
          'float cah = wch(1.2) - 1.0;',
          'vec3 transformed = mix(wA, wB, wt);',
          'transformed.y -= iB.w * (1.0 - (wch(1.2 * (2.0 * wt - 1.0)) - 1.0) / cah);',
          'float wl = length((wB - wA).xz);',
          'transformed += windOffset(transformed, 4.0 * wt * (1.0 - wt) * uSwayK * wl, iC.w);',
          'vec3 wTan = (wB - wA) + vec3(0.0, iB.w * 2.4 * wsh(1.2 * (2.0 * wt - 1.0)) / cah, 0.0);',
          'vWCol = iC.rgb;',
        ].join('\n'))
        .replace('#include <project_vertex>', [
          'vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);',
          'vec3 tv = (modelViewMatrix * vec4(wTan, 0.0)).xyz;',
          'vec3 sd = cross(tv, mvPosition.xyz); float sl = length(sd); sd = sl > 1e-5 ? sd / sl : vec3(0.0, 1.0, 0.0);',
          'float pxw = -mvPosition.z * uPxK;',
          'float hw = max(iA.w * 0.5, pxw * 0.6);',
          'mvPosition.xyz += sd * hw * aT.y;',
          'vWA = clamp(iA.w / max(pxw * 1.2, 1e-4), 0.35, 1.0);',
          'gl_Position = projectionMatrix * mvPosition;',
        ].join('\n'));
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWCol; varying float vWA; uniform float uWireLight;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb *= vWCol * uWireLight; diffuseColor.a *= vWA;');
    };
    mat.customProgramCacheKey = () => 'nostalgia-wires';
    return mat;
  }
  function lampMaterial(THREE) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.userData.uni = { uLampNight: { value: 0 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, mat.userData.uni);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vGlow; varying vec3 vLampC;')
        .replace('#include <color_vertex>', [
          'vColor = vec3(1.0);',
          '#ifdef USE_COLOR', 'vColor = color;', '#endif',
          'vLampC = vec3(1.0, 0.65, 0.3);',
          '#ifdef USE_INSTANCING_COLOR', 'vLampC = instanceColor;', '#endif',
          'vGlow = aGlow;',
          'vColor = mix(vColor, vLampC, aGlow);',
        ].join('\n'));
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow; varying vec3 vLampC; uniform float uLampNight;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vLampC * vGlow * (0.15 + 2.2 * uLampNight);');
    };
    mat.customProgramCacheKey = () => 'nostalgia-wire-lamp';
    return mat;
  }

  // per 512 u chunk: instance arrays built once from its four cells
  function chunk3(ci, cj) {
    const key = cj * 4096 + ci;
    let c = V.chunks.get(key);
    if (c && c.ver === V.modelVer && c.share === V.kiteShare) return c;
    const cells = [];
    for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
      const cell = G.cells.get(ckey(ci * 2 + di, cj * 2 + dj));
      if (!cell) return c && c.complete ? c : null;
      cells.push(cell);
    }
    c = build3(key, cells);
    V.chunks.set(key, c);
    return c;
  }
  const _m4 = { m: null, q: null, p: null, s: null, e: null, c: null };
  function build3(key, cells) {
    const THREE = V.T, H = V.H, vs = VSf();
    if (!_m4.m) { _m4.m = new THREE.Matrix4(); _m4.q = new THREE.Quaternion(); _m4.p = new THREE.Vector3(); _m4.s = new THREE.Vector3(); _m4.e = new THREE.Euler(); _m4.c = new THREE.Color(); }
    const { m, q, p, s, e, c: col } = _m4;
    const out = { key, complete: true, ver: V.modelVer, share: V.kiteShare, pole: [], poleC: [], head: [], lamp: [], lampC: [], tx: [], wire: [], glow: [], glowC: [], lamps: [], extras: null };
    const pushM = (arr, x, h, y, ang, sx, sy, sz) => {
      e.set(0, -ang, 0); q.setFromEuler(e); p.set(x, h, y); s.set(sx, sy, sz); m.compose(p, q, s);
      for (let k = 0; k < 16; k++) arr.push(m.elements[k]);
    };
    const pushC = (arr, hex) => { col.set(hex); arr.push(col.r, col.g, col.b); };
    const gb = H.builder();
    let extrasN = 0;
    for (const cell of cells) {
      for (const pl of cell.poles) {
        const sc = pl.kind === 'rail' ? [0.62, 0.72] : pl.kind === 'tube' ? [0.8, 0.8] : [1.05, 0.7];
        pushM(out.pole, pl.x, 0, pl.y, pl.ang, sc[0], pl.h * vs + 0.6, sc[1]);
        pushC(out.poleC, POLE_COL3[pl.kind]);
        for (const hh of [pl.hHT, pl.hLT]) if (hh) pushM(out.head, pl.x + pl.onx * pl.shift, hh * vs, pl.y + pl.ony * pl.shift, pl.ang, 1, 1, 1);
        if (pl.lamp) {
          pushM(out.lamp, pl.x, pl.lamp.h * vs, pl.y, pl.ang + (pl.onx * -pl.uy + pl.ony * pl.ux > 0 ? 0 : Math.PI), 1, 1, 1);
          pushC(out.lampC, pl.lamp.tube ? '#d8f4ff' : '#ffab40');
          const gy = pl.lamp.h * vs + 1.25;
          out.glow.push(pl.lamp.x, gy, pl.lamp.y);
          if (pl.lamp.tube) out.glowC.push(0.75, 0.92, 1.0); else out.glowC.push(1.0, 0.62, 0.25);
          out.lamps.push([pl.lamp.x, gy - 1, pl.lamp.y, pl.lamp.tube ? '#d8f4ff' : '#ffab40']);
        }
        if (pl.coil) { gb.color('#121010'); ring(gb, pl.x + pl.onx * 1.0, 24.5 * vs, pl.y + pl.ony * 1.0, 1.6, 0.25, pl.ang); extrasN++; }
        if (pl.kite && pl.kite.kh < V.kiteShare) { poleKite3(gb, pl, vs); extrasN++; }
      }
      for (const t of cell.tx) {
        // instance at the hub pole, local +x along the road towards the second pole
        const ang = Math.atan2(t.y2 - t.y, t.x2 - t.x);
        pushM(out.tx, t.x, 0, t.y, ang, 1, 1, 1);
      }
      for (const sp of cell.spans) {
        const w = sp.kind === 'cable' ? 0.2 : sp.kind === 'power' ? 0.15 : 0.12;
        col.set(WIRE_COL3[sp.kind]);
        out.wire.push(sp.ax, sp.ah * vs, sp.ay, w, sp.bx, sp.bh * vs, sp.by, sp.sag * vs, col.r, col.g, col.b, sp.ph);
      }
      if (V.kiteShare > 0) {
        for (const th of cell.threads) {
          if (th.kh >= V.kiteShare) continue;
          threadPts(th, th.drop ? 1 : 2, tmpArr);
          col.set(th.col);
          if (th.drop) out.wire.push(tmpArr[0], tmpArr[2] * vs, tmpArr[1], 0.06, tmpArr[3], tmpArr[5] * vs, tmpArr[4], 0.2, col.r, col.g, col.b, th.ph);
          else { const a = pointAt(th.sp, th.t, {}), b = pointAt(th.sp, th.t2, {}); out.wire.push(a.x, a.h * vs, a.y, 0.06, b.x, b.h * vs, b.y, th.sag * vs, col.r, col.g, col.b, th.ph); }
        }
        for (const kt of cell.kites) if (kt.kh < V.kiteShare) { kite3(gb, kt, vs); extrasN++; }
      }
      for (const ch of cell.chappals) { chappal3(gb, ch, vs); extrasN++; }
    }
    if (extrasN) {
      const g = gb.build();
      if (g) out.extras = g;
    }
    return out;
  }
  function ring(gb, x, y, z, r, t, ang) {
    const n = 8;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
      // ring in the vertical plane along the road
      const P = (a, rr) => [x + Math.cos(a) * rr * ca, y + Math.sin(a) * rr, z + Math.cos(a) * rr * sa];
      const A = P(a0, r - t), B = P(a1, r - t), C = P(a1, r + t), D = P(a0, r + t);
      gb.quad(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], D[0], D[1], D[2]);
    }
  }
  function tri3(gb, a, b, c) {
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const l = Math.hypot(nx, ny, nz) || 1;
    gb.grow(3, 3);
    const i = gb.v(a[0], a[1], a[2], nx / l, ny / l, nz / l); gb.v(b[0], b[1], b[2], nx / l, ny / l, nz / l); gb.v(c[0], c[1], c[2], nx / l, ny / l, nz / l);
    gb.tri(i, i + 1, i + 2);
  }
  function kite3(gb, kt, vs) {
    kiteCorners(kt, KC);
    const P = (q) => [KC[q], KC[q + 2] * vs, KC[q + 1]];
    const T = P(0), L = P(3), B = P(6), R = P(9), Cm = [(T[0] + B[0]) / 2, (T[1] + B[1]) / 2, (T[2] + B[2]) / 2];
    gb.color(kt.c1); tri3(gb, T, L, kt.torn > 0.75 ? Cm : B);
    gb.color(kt.c2); tri3(gb, T, R, kt.torn > 0.45 ? Cm : B);
    gb.color('#3a2c20'); tri3(gb, T, [T[0] + 0.12, T[1], T[2]], kt.torn > 0.75 ? Cm : B);
    if (kt.tail && kt.torn <= 0.75) { gb.color(kt.c2); tri3(gb, B, [B[0] + 0.5, B[1] - 4.5, B[2] + 0.3], [B[0] - 0.4, B[1] - 4.2, B[2] - 0.2]); }
  }
  function poleKite3(gb, pl, vs) {
    const K = pl.kite, h = ((pl.hLT || pl.hHT) + 0.3) * vs, s = K.size;
    const x = pl.x + pl.onx * K.off, y = pl.y + pl.ony * K.off;
    const P = (dx, dy, dh) => [x + dx, h + dh * vs, y + dy];
    const ax = pl.ux * s * 0.5, ay = pl.uy * s * 0.5, bx = pl.onx * s * 0.5, by = pl.ony * s * 0.5;
    const T = P(0, 0, 0), L = P(-ax + bx * 0.4, -ay + by * 0.4, -s * 0.35), B = P(bx, by, -s * 0.9), R = P(ax + bx * 0.4, ay + by * 0.4, -s * 0.35);
    gb.color(K.c1); tri3(gb, T, L, B);
    if (K.torn < 0.6) { gb.color(K.c2); tri3(gb, T, R, B); }
  }
  function chappal3(gb, ch, vs) {
    const sp = ch.sp, pt = pointAt(sp, ch.t, {});
    const ux = (sp.bx - sp.ax) / (sp.len || 1), uy = (sp.by - sp.ay) / (sp.len || 1), ang = Math.atan2(uy, ux);
    for (const o of [-0.8, 0.8]) {
      const x = pt.x + ux * o, y = pt.y + uy * o, top = pt.h * vs - 0.3, bot = top - ch.drop * vs;
      gb.color('#e6e0d2').obox(x, y, 0.35, 1.1, bot, top - 0.4, ang + Math.PI / 2);
      gb.color(ch.col).obox(x, y, 0.5, 0.7, top - 1.2, top, ang + Math.PI / 2);
    }
  }

  function ensureIM(name, geo, mat, need, shadow) {
    const THREE = V.T;
    let im = V[name];
    if (im && V.caps[name] >= need && im.geometry === geo) return im;
    if (im) { V.group.remove(im); im.dispose && im.dispose(); }
    const cap = Math.max(64, Math.ceil(need * 1.4));
    im = new THREE.InstancedMesh(geo, mat, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false; im.name = 'wires:' + name;
    im.castShadow = !!(shadow && V.H.quality.shadows); im.receiveShadow = false;
    im.count = 0;
    V.group.add(im);
    V[name] = im; V.caps[name] = cap;
    return im;
  }
  function fillIM(im, mats, cols) {
    const n = mats.length / 16;
    im.instanceMatrix.array.set(mats.length ? mats : [], 0);
    if (cols && cols.length) {
      if (!im.instanceColor || im.instanceColor.count < im.count) im.instanceColor = new V.T.InstancedBufferAttribute(new Float32Array(im.instanceMatrix.count * 3), 3);
      im.instanceColor.array.set(cols, 0);
      im.instanceColor.needsUpdate = true;
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
  }
  function rebuild3(list) {
    const t0 = now();
    const THREE = V.T, H = V.H;
    const g = geos(THREE, H);
    const cat = (k) => { let n = 0; for (const c of list) n += c[k].length; const a = new Float32Array(n); let o = 0; for (const c of list) { a.set(c[k], o); o += c[k].length; } return a; };
    // poles (Blender model for PSC poles when present)
    const pm = modelGeo('pole_psc');
    if (!V.matPole) { V.matPole = new THREE.MeshLambertMaterial({ vertexColors: true }); }
    const poleM = cat('pole'), poleC = cat('poleC');
    fillIM(ensureIM('poleIM', pm ? pm.geo : g.pole, pm ? pm.mat : V.matPole, poleM.length / 16, true), poleM, pm ? null : poleC);
    if (!V.matHead) V.matHead = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x555555 });
    const headM = cat('head');
    fillIM(ensureIM('headIM', g.head, V.matHead, headM.length / 16, true), headM, null);
    if (!V.matLamp) V.matLamp = lampMaterial(THREE);
    const lampM = cat('lamp');
    fillIM(ensureIM('lampIM', g.lamp, V.matLamp, lampM.length / 16, true), lampM, cat('lampC'));
    if (!V.matTx) V.matTx = new THREE.MeshLambertMaterial({ vertexColors: true });
    const txM = cat('tx');
    const tm = modelGeo('pole_transformer');
    fillIM(ensureIM('txIM', tm ? tm.geo : g.tx, tm ? tm.mat : V.matTx, txM.length / 16, true), txM, null);
    // wires: one instanced ribbon draw
    const wd = cat('wire'), nw = wd.length / 12;
    if (!V.wire || V.caps.wire < nw) {
      if (V.wire) { V.group.remove(V.wire); V.wire.geometry.dispose(); }
      const cap = Math.max(256, Math.ceil(nw * 1.4));
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.wireBase.pos, 3));
      geo.setAttribute('aT', new THREE.BufferAttribute(g.wireBase.at, 2));
      geo.setIndex(g.wireBase.idx);
      geo.setAttribute('iA', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('iB', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('iC', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
      if (!V.matWire) V.matWire = wireMaterial(THREE);
      V.wire = new THREE.Mesh(geo, V.matWire);
      V.wire.frustumCulled = false; V.wire.name = 'wires:wire'; V.wire.renderOrder = 1;
      V.wire.castShadow = false; V.wire.receiveShadow = false; V.wire.userData.noShadow = true;
      V.group.add(V.wire);
      V.caps.wire = cap;
    }
    const ga = V.wire.geometry, A = ga.attributes.iA.array, B = ga.attributes.iB.array, C = ga.attributes.iC.array;
    for (let k = 0; k < nw; k++) {
      const o = k * 12, q = k * 4;
      A[q] = wd[o]; A[q + 1] = wd[o + 1]; A[q + 2] = wd[o + 2]; A[q + 3] = wd[o + 3];
      B[q] = wd[o + 4]; B[q + 1] = wd[o + 5]; B[q + 2] = wd[o + 6]; B[q + 3] = wd[o + 7];
      C[q] = wd[o + 8]; C[q + 1] = wd[o + 9]; C[q + 2] = wd[o + 10]; C[q + 3] = wd[o + 11];
    }
    ga.attributes.iA.needsUpdate = true; ga.attributes.iB.needsUpdate = true; ga.attributes.iC.needsUpdate = true;
    ga.instanceCount = nw;
    V.wire.visible = nw > 0;
    // extras (kites, manja coils, chappals): one merged vertex-coloured mesh
    if (V.extras) { V.group.remove(V.extras); V.extras.geometry.dispose(); V.extras = null; }
    const xs = list.map((c) => c.extras).filter(Boolean);
    if (xs.length) {
      const geo = xs.length === 1 ? xs[0].clone() : H.merge(xs);
      if (geo) {
        V.extras = new THREE.Mesh(geo, H.materials.vcDouble);
        V.extras.name = 'wires:extras'; V.extras.frustumCulled = false; V.extras.castShadow = !!H.quality.shadows;
        V.group.add(V.extras);
      }
    }
    // glows at night (the core's shared additive glow points)
    const gp = cat('glow'), gc = cat('glowC');
    if (V.glows) { V.group.remove(V.glows); V.glows.geometry.dispose(); V.glows = null; }
    if (gp.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(gc, 3));
      geo.computeBoundingSphere();
      V.glows = new THREE.Points(geo, H.materials.glow);
      V.glows.name = 'wires:glows'; V.glows.renderOrder = 2; V.glows.frustumCulled = false;
      V.group.add(V.glows);
    }
    V.lampList = [];
    for (const c of list) for (const l of c.lamps) V.lampList.push(l);
    V.counts = { chunks: list.length, poles: poleM.length / 16, heads: headM.length / 16, lamps: lampM.length / 16, tx: txM.length / 16, wires: nw, extras: xs.length };
    V.buildMs = now() - t0; V.rebuilds++;
  }
  function update3d(dt, H) {
    if (!V.inited) return;
    const t0 = now();
    const on = st.enabled && st.draw3d && N.world && N.world.built && G.ready;
    V.group.visible = !!on;
    if (!on) return;
    const f = N.view3d.focus ? N.view3d.focus() : N.atmos.focus();
    const R3 = radius3();
    const share = kiteShare();
    if (Math.abs(share - V.kiteShare) > 0.02) { V.kiteShare = share; V.sig = ''; }
    // wanted 512 u chunks around the focus (and their cells, nearest first)
    const list = [];
    let sig = '';
    for (let cj = Math.floor((f.y - R3) / CH3); cj <= Math.floor((f.y + R3) / CH3); cj++) for (let ci = Math.floor((f.x - R3) / CH3); ci <= Math.floor((f.x + R3) / CH3); ci++) {
      const x0 = ci * CH3, y0 = cj * CH3;
      const dx = Math.max(x0 - f.x, 0, f.x - x0 - CH3), dy = Math.max(y0 - f.y, 0, f.y - y0 - CH3);
      const d = Math.hypot(dx, dy);
      if (d > R3) continue;
      for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
        const i = ci * 2 + di, j = cj * 2 + dj;
        want(i, j, Math.hypot((i + 0.5) * CELL - f.x, (j + 0.5) * CELL - f.y));
      }
      const c = chunk3(ci, cj);
      if (c) { list.push(c); sig += c.key + ','; }
    }
    // drop chunk records far away
    if (V.chunks.size > 40) for (const [k, c] of V.chunks) { if (sig.indexOf(c.key + ',') < 0) V.chunks.delete(k); if (V.chunks.size <= 30) break; }
    if (sig !== V.sig && now() - V.rebuildAt > 120) { V.sig = sig; V.rebuildAt = now(); rebuild3(list); }
    // per frame: uniforms, lamps
    const night = H.night || 0;
    if (V.matWire) {
      const u = V.matWire.userData.uni, cam = H.camera, el = H.renderer && H.renderer.domElement;
      if (cam && el) u.uPxK.value = (2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, el.height);
      u.uWireLight.value = 0.35 + 0.65 * clamp(H.day || 0, 0, 1);
    }
    if (V.matLamp) V.matLamp.userData.uni.uLampNight.value = night;
    if (night > 0.1 && V.lampList.length) {
      let best = null, bd = 230;
      for (const l of V.lampList) { const d = Math.hypot(l[0] - f.x, l[2] - f.y); if (d < bd) { bd = d; best = l; } }
      if (best) H.light({ x: best[0], y: best[2], h: best[1], color: best[3], intensity: 0.8, r: 70 });
    }
    V.lastJs = now() - t0;
    V.jsAvg = V.jsAvg * 0.95 + V.lastJs * 0.05;
  }
  if (N.view3d && N.view3d.registerLayer) {
    N.view3d.registerLayer('wires', { order: 4, init: init3d, update: update3d, dispose: dispose3d });
  }

  /* ================================================================ API */
  function cellsIn(x0, y0, x1, y1, gen) {
    const out = [];
    if (!ensureIndex()) return out;
    for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      let c = G.cells.get(ckey(i, j));
      if (!c && gen) { G.queued.delete(ckey(i, j)); c = genCell(i, j); }
      if (c) out.push(c);
    }
    return out;
  }
  const W = (N.wires = {
    CELL, MINCLR, PROF,
    get enabled() { return st.enabled; }, set enabled(v) { st.enabled = !!v; },
    get draw2d() { return st.draw2d; }, set draw2d(v) { st.draw2d = !!v; },
    get draw3d() { return st.draw3d; }, set draw3d(v) { st.draw3d = !!v; },
    heightAt, pointAt, shape,
    /** spans in a rect (margin = MAX_SPAN so spans owned by neighbouring cells are found) */
    query(x0, y0, x1, y1, fn) {
      const M = MAX_SPAN + 40;
      for (const c of cellsIn(x0 - M, y0 - M, x1 + M, y1 + M, true)) for (const sp of c.spans) if (!(sp.x1 < x0 || sp.x0 > x1 || sp.y1 < y0 || sp.y0 > y1)) fn(sp);
    },
    poles(x0, y0, x1, y1, fn) {
      for (const c of cellsIn(x0, y0, x1, y1, true)) for (const p of c.poles) if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) fn(p);
    },
    perches(x, y, r, out) {
      out = out || [];
      const r2 = r * r;
      W.query(x - r, y - r, x + r, y + r, (sp) => {
        if (sp.kind === 'service' || sp.lo < 15) return;
        const n = Math.max(1, Math.floor(sp.len / 3.5)), ang = Math.atan2(sp.by - sp.ay, sp.bx - sp.ax);
        for (let k = 1; k < n; k++) {
          const t = k / n, px = sp.ax + (sp.bx - sp.ax) * t, py = sp.ay + (sp.by - sp.ay) * t;
          if ((px - x) * (px - x) + (py - y) * (py - y) > r2) continue;
          out.push({ x: px, y: py, h: heightAt(sp, t), span: sp, t, ang });
        }
      });
      return out;
    },
    ensure(x0, y0, x1, y1) { return ensureRect(x0, y0, x1, y1).length; },
    regen() { resetGen(); V.chunks.clear(); V.sig = ''; spanSeq = 0; },
    kites(on) { st.kitesForced = on == null ? null : !!on; V.sig = ''; return kiteShare(); },
    kiteShare,
    stats() {
      let poles = 0, spans = 0, tx = 0, lamps = 0, kites = 0, threads = 0, chappals = 0, roadLen = 0;
      const byKind = {};
      for (const c of G.cells.values()) {
        poles += c.poles.length; spans += c.spans.length; tx += c.tx.length; kites += c.kites.length; threads += c.threads.length; chappals += c.chappals.length;
        for (const p of c.poles) if (p.lamp) lamps++;
        for (const s of c.spans) byKind[s.kind] = (byKind[s.kind] || 0) + 1;
      }
      void roadLen;
      return {
        ready: G.ready, cells: G.cells.size, queued: G.queue.length, poles, spans, byKind, tx, lamps, kites, threads, chappals,
        cellsBuilt: G.stats.cellsBuilt, genMs: +G.stats.genMs.toFixed(1), avgCellMs: G.stats.cellsBuilt ? +(G.stats.genMs / G.stats.cellsBuilt).toFixed(3) : 0,
        maxCellMs: +G.stats.maxCellMs.toFixed(2), indexMs: G.stats.indexMs, rejected: Object.assign({}, G.stats.rejected), kiteShare: kiteShare(),
        draw2d: { ms: +prof2d.last || 0, enq: +(prof2d.enq || 0).toFixed(3), cells: prof2d.cells, poles: prof2d.poles, spans: prof2d.spans },
        draw3d: Object.assign({ buildMs: +V.buildMs.toFixed(2), rebuilds: V.rebuilds, jsMs: +V.lastJs.toFixed(3), jsAvg: +V.jsAvg.toFixed(3) }, V.counts),
      };
    },
    cells: () => G.cells,
    _G: () => G, _V: V, _memo: (ri) => memo(ri),
    _why(ri, i) { const m = memo(ri); if (!m) return 'unwired'; const s0 = m.start + i * m.sp; return SLIDE.map((o) => { const r = poleCheck(m, s0 + o); return typeof r === 'string' ? r : 'ok'; }); },
  });

  N.addSystem({
    id: 'wires', order: 8, runIn: ['*'],
    update() {
      if (!st.enabled || !N.world || !N.world.built) return;
      prof2d.last = prof2d.ms; prof2d.ms = 0;
      const mode = N.state && N.state.mode;
      if (mode === 'boot') return;
      if (G.queue.length || G.job || !G.ready) work(GEN_MS);
    },
    draw() { try { draw2d(); } catch (e) { N.err('wires.draw', e); } },
  });
  N.on('world:built', () => { resetGen(); V.chunks.clear(); V.sig = ''; });
  N.on('calendar:change', () => { V.sig = ''; });
})();
