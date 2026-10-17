/* NOSTALGIA — view3d_ground.js (3D ground renderer) — ARCHITECTURE §20 "3D ground"
 *
 * The 3D view's ground used to be the top-down pixel-art painter uploaded as a texture ("Roads are not
 * clear in 3D… super pixelated", design/feedback_3d.md #1). This module builds a dedicated ground that
 * stays crisp from a kid's first-person eye height to the zoomed-out chase camera:
 *  - ROADS AS GEOMETRY per 3D chunk (512 u): asphalt ribbons along the road polylines (bends filleted
 *    into smooth arcs), junction polygons with rounded kerb corners, dead-end caps. One shared road
 *    shader with WORLD-SPACE procedural detail, so there are never visible texels: multi-octave value
 *    noise grain + aggregate specks (band-limited by the pixel footprint), darker tyre-worn tracks along
 *    each lane, oil drips, hairline cracks on old roads, dusty crumbling edges on old lanes, a wet sheen
 *    with sky reflection in rain. Colour by kind and district age (fresh black arterials, faded grey
 *    colony lanes, sandy-edged Old City lanes).
 *  - VECTOR MARKINGS computed in the shader from (along u, across v) road coordinates, anti-aliased with
 *    fwidth and pre-filtered with distance (never aliased or blurry): dashed centre lines, lane lines and
 *    solid edge lines on arterials, ZEBRA CROSSINGS + stop lines at junction approaches (same rules and
 *    stand-off as the 2D map), all stopping cleanly at junctions; yellow bus-bay outlines at bus stops.
 *  - REAL 3D KERBS (chamfered) along arterials / streets / the bund, painted black-and-yellow where the
 *    2D map paints them; raised footpaths with procedural worn paver slabs; raised medians with painted
 *    kerbs and shrubs on divided roads; railway ballast beds with sleepers; dirt paths.
 *  - TERRAIN: a smooth per-chunk surface-weight map (N.world.surfaceAt every ~2 u, blurred: grass /
 *    paving / sand / water) and a soil tint map (district soil, maidans, yards, contact AO; baked sun
 *    shadows on phones), sampled bilinearly and sharpened with world-space noise, plus detail shaders:
 *    dusty red Deccan soil with pebbles, grass with tufts and worn patches, stone-tiled plazas
 *    (Charminar), rippled sand with a wet shoreline, water with sky reflection and foam. Night lamp
 *    pools come from the core's aux texture. Rocks keep their 3D meshes.
 *  - POTHOLES (N.world.potholes): real dips in the road mesh (a fine grid around each one), broken
 *    asphalt rim + gravel, rainwater with sky reflection and rain rings when N.seasons.is('rain');
 *    tar patches as decals. Rebuilt when 'potholes:change' fires (monsoon potholes come and go).
 * Public API (ARCHITECTURE §20):
 *   N.view3d.groundHeightAt(x, y) -> visible ground height in 3D units (raised footpath / median, minus
 *       a pothole dip); the core's elevation(e) / H.elev(e) already adds it for actors on the ground
 *       (vehicles average their front and rear wheels), so people stand on kerbs and wheels dip.
 *   N.view3d.ground = {enabled, setEnabled(on) (false = the old painted ground, for before/after tests),
 *       stats(), rebuild(), heightAt(x, y), potholeDip(x, y), net()}
 * Hooks: view3d.js "[ground hook]" edits (setGroundProvider, dropPainted, elevation). Performance:
 * chunks are built lazily inside the core's frame budget in resumable steps (aux -> surface -> tint ->
 * roads -> upload); two draw calls per chunk (terrain, roads); phones get fewer noise octaves.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.view3d || !N.view3d.setGroundProvider) return;
  const V = N.view3d;
  const TAU = Math.PI * 2;
  const now = () => performance.now();

  /* ================================================================ constants */
  const CHS = 512;                       // 3D chunk size (view3d CHUNK)
  const Y_ROAD = 0.08, Y_PATH = 0.045, Y_RAIL = 0.03, Y_DECAL = 0.125;
  const KERB_H = { arterial: 0.8, bund: 0.8, street: 0.6 };
  const MED_H = 0.95, MED_HW = 2.0;
  const SURF_N = 256;                    // ground map size per chunk (texel centres on the chunk edges; far LOD: half)
  const LY = { ROAD: 0, JUNC: 1, FOOT: 2, KERB: 3, MEDIAN: 4, PAINT: 5, PATCH: 6, RAIL: 7, PATH: 8, CONC: 10, PLANT: 11 };
  const BIT = { CENTRE: 1, LANES: 2, EDGE: 4, LANEKIND: 8 };
  const RANK = { lane: 0, path: 0, bund: 1, street: 1, bridge: 2, arterial: 3 };
  const PAINT = { NONE: 0, BY: 1 };      // kerb paint: plain concrete, black + yellow
  // base asphalt colour per kind (sRGB) + age / track wear; district style shifts the age
  const RSTYLE = {
    arterial: { col: '#38373c', age: 0.22, wear: 0.95 },
    bund: { col: '#3d3c41', age: 0.2, wear: 0.85 },
    bridge: { col: '#4a4847', age: 0.35, wear: 0.85 },
    street: { col: '#46454a', age: 0.42, wear: 0.8 },
    lane: { col: '#5f5b55', age: 0.72, wear: 0.55 },
  };
  const DAGE = { oldcity: 0.22, market: 0.12, colony: 0.08, rocky: 0.1, colonial: 0.0, cantonment: -0.05, posh: -0.1, hitec: -0.25 };
  const FOOTCOL = { arterial: '#a8a090', street: '#ada290', bund: '#b6ab96' };
  const KERBCOL = '#c9c2b4';
  const DUSTCOL = '#9a8564';
  const YARD = '#c2a882';
  const PARKSOIL = { ground: '#b38c62', rock: '#a28468' };

  const Q = () => (I ? I.Q : V.quality);
  let THREE = null, I = null;            // three.js + engine internals (attach)

  /* ================================================================ small math */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function cumOf(pts) {
    const c = new Float64Array(pts.length);
    for (let i = 1; i < pts.length; i++) c[i] = c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return c;
  }
  function segAt(cum, s) {
    let lo = 0, hi = cum.length - 2;
    if (hi <= 0) return 0;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1; }
    return lo;
  }
  /** point + unit tangent at arc length s: [x, y, dx, dy] */
  function ptAt(pts, cum, s) {
    const k = segAt(cum, s), a = pts[k], b = pts[k + 1] || a, L = cum[k + 1] - cum[k] || 1e-9;
    const t = clamp((s - cum[k]) / L, 0, 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / L, (b[1] - a[1]) / L];
  }
  /** nearest point on the polyline with arc length in [s0, s1] -> {s, d2, x, y, v (signed side offset)} */
  function projectOn(pts, cum, x, y, s0, s1) {
    let best = null;
    for (let k = 0; k < pts.length - 1; k++) {
      const segL = cum[k + 1] - cum[k];
      if (cum[k + 1] < s0 - 1e-6 || cum[k] > s1 + 1e-6 || segL < 1e-9) continue;
      const a = pts[k], b = pts[k + 1], dx = b[0] - a[0], dy = b[1] - a[1];
      const tmin = Math.max(0, (s0 - cum[k]) / segL), tmax = Math.min(1, (s1 - cum[k]) / segL);
      let t = ((x - a[0]) * dx + (y - a[1]) * dy) / (segL * segL);
      t = clamp(t, tmin, tmax);
      const qx = a[0] + dx * t, qy = a[1] + dy * t, d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
      if (!best || d2 < best.d2) {
        const ux = dx / segL, uy = dy / segL;
        best = { s: cum[k] + segL * t, d2, x: qx, y: qy, v: (x - qx) * -uy + (y - qy) * ux };
      }
    }
    return best;
  }
  /** project onto the polyline searching forward from segment k0 (s >= sMin): stops a few segments after
   *  the first close hit, so chains of nodes along a long road stay O(n) */
  function forwardProject(pts, cum, x, y, sMin, k0) {
    let bs = sMin, bk = k0, bd = Infinity, hitAt = -1;
    for (let k = k0; k < pts.length - 1; k++) {
      const segL = cum[k + 1] - cum[k];
      if (cum[k + 1] < sMin - 1e-6) continue;
      if (segL < 1e-9) continue;
      const a = pts[k], b = pts[k + 1], dx = b[0] - a[0], dy = b[1] - a[1];
      const tmin = Math.max(0, (sMin - cum[k]) / segL);
      const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (segL * segL), tmin, 1);
      const qx = a[0] + dx * t, qy = a[1] + dy * t, d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
      if (d2 < bd - 1e-9) { bd = d2; bs = cum[k] + segL * t; bk = k; }
      if (bd < 400 && hitAt < 0) hitAt = k;
      if (hitAt >= 0 && k > hitAt + 3) break;
    }
    return { s: bs, k: bk };
  }
  function subLine(pts, cum, s0, s1) {
    const a = ptAt(pts, cum, s0), out = [[a[0], a[1]]];
    for (let k = 0; k < pts.length; k++) if (cum[k] > s0 + 0.05 && cum[k] < s1 - 0.05) out.push([pts[k][0], pts[k][1]]);
    const b = ptAt(pts, cum, s1); out.push([b[0], b[1]]);
    return out;
  }
  function dedupe(pts, eps) {
    const out = [];
    for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > (eps || 0.05)) out.push(p); }
    return out;
  }
  /** fillet the interior vertices of a polyline with arcs of radius R (limited by the segment lengths) */
  function smoothLine(pts, R0) {
    pts = dedupe(pts, 0.05);
    if (pts.length < 3) return pts.map((p) => [p[0], p[1]]);
    const out = [[pts[0][0], pts[0][1]]];
    for (let k = 1; k < pts.length - 1; k++) {
      const p = pts[k], a = pts[k - 1], b = pts[k + 1];
      let ax = p[0] - a[0], ay = p[1] - a[1], bx = b[0] - p[0], by = b[1] - p[1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      ax /= la; ay /= la; bx /= lb; by /= lb;
      const cr = ax * by - ay * bx, th = Math.atan2(Math.abs(cr), ax * bx + ay * by);
      if (th < 0.035) { out.push([p[0], p[1]]); continue; }
      const tn = Math.tan(th / 2);
      const t = Math.min(R0 * tn, 0.45 * Math.min(la, lb)), R = t / tn;
      const sg = cr > 0 ? 1 : -1;
      const s0x = p[0] - ax * t, s0y = p[1] - ay * t;
      const cx = s0x - ay * sg * R, cy = s0y + ax * sg * R;
      const a0 = Math.atan2(s0y - cy, s0x - cx);
      const steps = Math.max(1, Math.ceil(th / 0.13));
      for (let i = 0; i <= steps; i++) { const g = a0 + sg * th * (i / steps); out.push([cx + Math.cos(g) * R, cy + Math.sin(g) * R]); }
    }
    out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
    return dedupe(out, 0.05);
  }
  /** miter normals (scaled so offset edges stay parallel) at each vertex: [[nx, ny], ...] */
  function normalsOf(pts) {
    const n = pts.length, out = new Array(n);
    for (let k = 0; k < n; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)], p = pts[k];
      let d0x = p[0] - a[0], d0y = p[1] - a[1], d1x = b[0] - p[0], d1y = b[1] - p[1];
      const l0 = Math.hypot(d0x, d0y), l1 = Math.hypot(d1x, d1y);
      if (l0 > 1e-9) { d0x /= l0; d0y /= l0; } else { d0x = d1x / (l1 || 1); d0y = d1y / (l1 || 1); }
      if (l1 > 1e-9) { d1x /= l1; d1y /= l1; } else { d1x = d0x; d1y = d0y; }
      let mx = -(d0y + d1y), my = d0x + d1x;
      const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      const k2 = Math.max(0.55, mx * -d0y + my * d0x);
      out[k] = [mx / k2, my / k2];
    }
    return out;
  }
  function hexRGB(hex) { // sRGB 0..1
    const v = parseInt((hex || '#888888').slice(1), 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  function linRGB(hex) { const c = hexRGB(hex); return [lin(c[0]), lin(c[1]), lin(c[2])]; }
  function mixRGB(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function hash1(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  /* ================================================================ road network analysis (global) */
  const NET = { built: false, worldKey: null, pieces: [], juncs: [], paths: [], rails: [], bays: [], buckets: new Map(), ms: 0, roadPieces: new Map() };
  const bkey = (ci, cj) => cj * 64 + ci;
  function bucket(kind, obj, x0, y0, x1, y1) {
    const i0 = Math.max(0, Math.floor(x0 / CHS)), i1 = Math.max(0, Math.floor(x1 / CHS));
    const j0 = Math.max(0, Math.floor(y0 / CHS)), j1 = Math.max(0, Math.floor(y1 / CHS));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = bkey(i, j);
      let b = NET.buckets.get(k);
      if (!b) { b = { pieces: [], juncs: [], paths: [], rails: [], bays: [] }; NET.buckets.set(k, b); }
      b[kind].push(obj);
    }
  }
  function bboxOf(pts, m) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return [x0 - m, y0 - m, x1 + m, y1 + m];
  }
  function districtStyleAt(x, y) {
    try { const d = N.world.districtAt(x, y); return (d && d.style) || 'colony'; } catch (e) { return 'colony'; }
  }
  function roadStyle(r, x, y) {
    const st = RSTYLE[r.kind] || RSTYLE.street;
    const ds = districtStyleAt(x, y);
    const age = clamp(st.age + (DAGE[ds] || 0) + (r.age != null ? +r.age : 0), 0, 1);
    let c = linRGB(st.col);
    // faded grey with age; Old City / market lanes go sandy
    c = mixRGB(c, linRGB(ds === 'oldcity' || ds === 'market' ? '#8a7d68' : '#7c7a76'), clamp((age - 0.3) * 0.75, 0, 0.45));
    if (ds === 'hitec' && r.kind !== 'lane') c = mixRGB(c, linRGB('#2e2d31'), 0.5);
    return { c, age, wear: st.wear };
  }

  const ANAMS = [];
  // The analysis is resumable (phases sliced by the frame budget) so the first 3D switch never
  // freezes the page: pieces per road -> junction geometry -> trims -> junction polygons -> zebras ->
  // buckets + paths + rails -> bus bays.
  let AN = null;
  function analyzeStep(deadline) {
    const W = N.world, D = W && W.data, G = W && W.roads;
    if (!AN) {
      NET.pieces = []; NET.juncs = []; NET.paths = []; NET.rails = []; NET.bays = []; NET.buckets = new Map(); NET.roadPieces = new Map();
      if (!W || !W.built || !D || !G) { NET.built = true; return true; }
      const byRoad = new Map();
      for (const e of G.edges) { let l = byRoad.get(e.road); if (!l) byRoad.set(e.road, (l = [])); l.push(e); }
      AN = { phase: 0, i: 0, roads: Array.from(byRoad.entries()), jmap: new Map(), FOOT: W.FOOT || { arterial: 10, street: 7, bund: 9 }, work: 0, t0: now() };
      ANAMS.length = 0;
    }
    const t0 = now();
    const over = () => now() > deadline;
    try {
      while (AN.phase < 7) {
        const ph = AN.phase, ts = now();
        if (ph === 0) { // pieces
          while (AN.i < AN.roads.length) { const [r, list] = AN.roads[AN.i++]; piecesOfRoad(r, list, G, AN); if ((AN.i & 15) === 0 && over()) break; }
          if (AN.i >= AN.roads.length) { AN.phase = 1; AN.i = 0; }
        } else if (ph === 1) { // junction geometry
          while (AN.i < NET.juncs.length) { const J = NET.juncs[AN.i++]; try { junctionGeom(J); } catch (e) { N.err('ground.junction', e); J.bad = true; } if ((AN.i & 63) === 0 && over()) break; }
          if (AN.i >= NET.juncs.length) { finishPieces(); AN.phase = 2; AN.i = 0; }
        } else if (ph === 2) { // junction polygons
          while (AN.i < NET.juncs.length) { const J = NET.juncs[AN.i++]; try { junctionPoly(J); } catch (e) { N.err('ground.junctionPoly', e); } if ((AN.i & 63) === 0 && over()) break; }
          if (AN.i >= NET.juncs.length) { AN.phase = 3; AN.i = 0; }
        } else if (ph === 3) { zebras(); AN.phase = 4; }
        else if (ph === 4) { // buckets
          for (const P of NET.pieces) { const bb = bboxOf(P.pts, P.hw + P.fp + 4); P.bb = bb; bucket('pieces', P, bb[0], bb[1], bb[2], bb[3]); }
          for (const J of NET.juncs) { if (!J.poly) continue; const bb = bboxOf(J.poly.concat(J.extraPts || []), 14); J.bb = bb; bucket('juncs', J, bb[0], bb[1], bb[2], bb[3]); }
          AN.phase = 5;
        } else if (ph === 5) { // paths + rails
          for (const r of D.roads || []) {
            if (r.kind !== 'path' || !r.pts || r.pts.length < 2) continue;
            const pts = smoothLine(r.pts, r.w / 2 + 4), P = { pts, cum: cumOf(pts), hw: r.w / 2, r };
            const bb = bboxOf(pts, P.hw + 2); bucket('paths', P, bb[0], bb[1], bb[2], bb[3]); NET.paths.push(P);
          }
          for (const r of D.rails || []) {
            if (!r.pts || r.pts.length < 2) continue;
            const pts = smoothLine(r.pts, 30), P = { pts, cum: cumOf(pts), hw: Math.max(6, (r.w || 14) / 2) };
            const bb = bboxOf(pts, P.hw + 2); bucket('rails', P, bb[0], bb[1], bb[2], bb[3]); NET.rails.push(P);
          }
          AN.phase = 6;
        } else if (ph === 6) { busBays(); AN.phase = 7; }
        ANAMS[ph] = (ANAMS[ph] || 0) + now() - ts;
        if (AN.phase < 7 && over()) break;
      }
    } catch (e) {
      N.err('view3d.ground.analyze', e);
      AN.phase = 7;
    }
    AN.work += now() - t0;
    if (AN.phase < 7) return false;
    NET.built = true;
    NET.ms = Math.round(AN.work * 10) / 10; NET.wallMs = Math.round(now() - AN.t0);
    AN = null;
    return true;
  }
  function piecesOfRoad(r, list, G, A) {
    if (!r || !r.pts || r.pts.length < 2 || r.kind === 'path') return;
    const nodes = G.nodes, edges = G.edges, FOOT = A.FOOT;
    const isJ = (n) => {
      if (n.deg !== 2) return true;
      const e0 = edges[n.inc[0]], e1 = edges[n.inc[1]];
      return !e0 || !e1 || e0.road !== e1.road;
    };
    const junc = (n) => {
      let J = A.jmap.get(n.id);
      if (!J) { J = { id: NET.juncs.length, node: n, x: n.x, y: n.y, arms: [], deg: n.deg }; A.jmap.set(n.id, J); NET.juncs.push(J); }
      return J;
    };
    // chains of continuous edges
    const chains = [];
    let cur = null;
    for (const e of list) {
      if (!cur || cur.nodes[cur.nodes.length - 1] !== e.a) { cur = { nodes: [e.a], edges: [] }; chains.push(cur); }
      cur.nodes.push(e.b); cur.edges.push(e);
    }
    const rp = r.pts.map((p) => [p[0], p[1]]);
    const rcum = cumOf(rp);
    const total = rcum[rcum.length - 1];
    for (const ch of chains) {
      const ns = ch.nodes.map((id) => nodes[id]);
      const es = ch.edges;
      const closed = ns.length > 2 && ns[0] === ns[ns.length - 1];
      // arc length of each chain node along the road polyline (monotonic, forward segment cursor)
      const s = [];
      let sMin = 0, kc = 0;
      for (let k = 0; k < ns.length; k++) {
        const last = k === ns.length - 1;
        const lo = last && closed ? Math.max(sMin, total - 1) : sMin;
        if (last && closed) kc = Math.max(kc, segAt(rcum, lo));
        const r2 = forwardProject(rp, rcum, ns[k].x, ns[k].y, lo, kc);
        s.push(r2.s); sMin = r2.s; kc = r2.k;
      }
      // split at junction nodes; a closed loop starts at its first junction
      const cuts = [];
      for (let k = 0; k < ns.length; k++) if (k === 0 || k === ns.length - 1 || isJ(ns[k])) cuts.push(k);
      if (closed && !isJ(ns[0])) {
        const inner = cuts.filter((k) => k > 0 && k < ns.length - 1);
        if (!inner.length) { addPiece(r, rp, rcum, s[0], s[s.length - 1], null, null, null, null, true, FOOT); continue; }
        for (let q = 0; q < inner.length - 1; q++) {
          const a = inner[q], b = inner[q + 1];
          addPiece(r, rp, rcum, s[a], s[b], junc(ns[a]), junc(ns[b]), es[a], es[b - 1], false, FOOT);
        }
        const a = inner[inner.length - 1], b = inner[0];
        const ptsW = subLine(rp, rcum, s[a], total).concat(subLine(rp, rcum, 0, s[b]).slice(1));
        addPieceFromPts(r, ptsW, junc(ns[a]), junc(ns[b]), es[a], es[b - 1], FOOT);
        continue;
      }
      for (let q = 0; q < cuts.length - 1; q++) {
        const a = cuts[q], b = cuts[q + 1];
        const ja = (a === 0 && ns[a].deg === 1) ? null : junc(ns[a]);
        const jb = (b === ns.length - 1 && ns[b].deg === 1) ? null : junc(ns[b]);
        addPiece(r, rp, rcum, s[a], s[b], ja, jb, es[a], es[b - 1], false, FOOT, ns[a], ns[b]);
      }
    }
  }

  function addPiece(r, rp, rcum, s0, s1, ja, jb, ea, eb, closed, FOOT, na, nb) {
    if (s1 - s0 < 0.5 && !closed) return;
    let pts = subLine(rp, rcum, s0, s1);
    // extend to the junction centres when the road polyline stops short (snapped T ends)
    if (ja && Math.hypot(pts[0][0] - ja.x, pts[0][1] - ja.y) > 1.5 && na && s0 < 0.5) pts.unshift([ja.x, ja.y]);
    if (jb && Math.hypot(pts[pts.length - 1][0] - jb.x, pts[pts.length - 1][1] - jb.y) > 1.5 && nb && s1 > rcum[rcum.length - 1] - 0.5) pts.push([jb.x, jb.y]);
    addPieceFromPts(r, pts, ja, jb, ea, eb, FOOT, closed);
  }
  function addPieceFromPts(r, raw, ja, jb, ea, eb, FOOT, closed) {
    const hw = r.w / 2;
    const pts = smoothLine(raw, hw + 6);
    if (pts.length < 2) return;
    const cum = cumOf(pts), L = cum[cum.length - 1];
    if (L < 0.5) return;
    const mid = ptAt(pts, cum, L / 2);
    const st = roadStyle(r, mid[0], mid[1]);
    const fp = FOOT[r.kind] || 0;
    const divided = r.divided != null ? !!r.divided : r.median != null ? !!r.median : r.kind === 'arterial';
    let bits = 0;
    if (r.kind === 'lane') bits |= BIT.LANEKIND;
    else if (r.kind === 'arterial') { if (!divided) bits |= BIT.CENTRE; bits |= BIT.LANES | BIT.EDGE; }
    else if (!divided && (r.kind === 'street' || r.kind === 'bund' || r.kind === 'bridge')) bits |= BIT.CENTRE;
    if (r.kind === 'bund') bits |= BIT.EDGE;
    const P = {
      id: NET.pieces.length, r, kind: r.kind, pts, cum, nrm: normalsOf(pts), L, hw, fp, closed: !!closed,
      kerbH: KERB_H[r.kind] || 0.6, paint: r.kind === 'arterial' || r.kind === 'bund' ? PAINT.BY : PAINT.NONE,
      divided: divided && r.w >= 30, medHW: divided && r.w >= 30 ? MED_HW : 0, bits, st,
      ends: [mkEnd(ja, ea, true), mkEnd(jb, eb, false)],
    };
    if (closed) { P.ends[0].j = null; P.ends[1].j = null; P.ends[0].cap = P.ends[1].cap = false; }
    NET.pieces.push(P);
    let l = NET.roadPieces.get(r.id); if (!l) NET.roadPieces.set(r.id, (l = [])); l.push(P);
    if (ja) ja.arms.push({ piece: P, start: true, edge: ea });
    if (jb) jb.arms.push({ piece: P, start: false, edge: eb });
  }
  function mkEnd(j, e, start) {
    // fs: footpath start distance per side [v<0, v>0] (from this end); cap: dead end
    return { j, edge: e, start, trim: 0, need: 0, zebra: 0, fs: [0, 0], cap: !j, capSide: [false, false] };
  }

  /** arm frames, corner fillets and the trims they need */
  function junctionGeom(J) {
    const arms = J.arms;
    for (const a of arms) {
      const P = a.piece, pts = P.pts, cum = P.cum;
      const s = a.start ? 0 : P.L, dirS = a.start ? 1 : -1;
      const q = ptAt(pts, cum, s);
      const f = ptAt(pts, cum, clamp(s + dirS * Math.min(6, P.L * 0.4), 0, P.L));
      let dx = f[0] - q[0], dy = f[1] - q[1];
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      a.Q = [q[0], q[1]]; a.d = [dx, dy]; a.n = [-dy, dx]; a.hw = P.hw; a.fp = P.fp; a.ang = Math.atan2(dy, dx);
      a.end = P.ends[a.start ? 0 : 1];
      a.need = 1.2;
      a.side = a.start ? 1 : -1; // arm +n side == piece side (v sign) * this
    }
    arms.sort((p, q) => p.ang - q.ang);
    J.corners = [];
    const n = arms.length;
    if (n < 2) return;
    for (let i = 0; i < n; i++) {
      const A = arms[i], B = arms[(i + 1) % n];
      let phi = B.ang - A.ang;
      if (phi <= 1e-6) phi += TAU;
      const cn = { A, B, phi, type: 'straight' };
      J.corners.push(cn);
      if (n === 2 && i === 1 && J.corners[0].type === 'fillet' && phi > Math.PI) continue;
      if (phi >= Math.PI - 0.25) continue;
      const pAx = A.Q[0] + A.n[0] * A.hw, pAy = A.Q[1] + A.n[1] * A.hw;
      const pBx = B.Q[0] - B.n[0] * B.hw, pBy = B.Q[1] - B.n[1] * B.hw;
      const det = -A.d[0] * B.d[1] + B.d[0] * A.d[1];
      if (Math.abs(det) < 1e-6) continue;
      const dx = pBx - pAx, dy = pBy - pAy;
      const t = (-dx * B.d[1] + B.d[0] * dy) / det;
      const s = (A.d[0] * dy - A.d[1] * dx) / det;
      if (t < -3 || s < -3) continue;
      const kerb = A.fp > 0 && B.fp > 0;
      let rc = kerb ? Math.max(A.fp, B.fp) + 2.5 : A.fp > 0 || B.fp > 0 ? 4 : 3;
      const th = Math.tan(phi / 2);
      let e = rc / th;
      if (e > 26) { e = 26; rc = e * th; }
      const Cx = pAx + A.d[0] * t, Cy = pAy + A.d[1] * t;
      let bx = A.d[0] + B.d[0], by = A.d[1] + B.d[1];
      const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
      const od = rc / Math.sin(phi / 2);
      cn.type = 'fillet'; cn.kerb = kerb; cn.rc = rc;
      cn.C = [Cx, Cy]; cn.O = [Cx + bx * od, Cy + by * od];
      cn.tA = t + e; cn.tB = s + e;
      cn.TA = [Cx + A.d[0] * e, Cy + A.d[1] * e]; cn.TB = [Cx + B.d[0] * e, Cy + B.d[1] * e];
      const aA = Math.atan2(cn.TA[1] - cn.O[1], cn.TA[0] - cn.O[0]);
      let aB = Math.atan2(cn.TB[1] - cn.O[1], cn.TB[0] - cn.O[0]);
      let da = aB - aA; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      cn.a0 = aA; cn.da = da;
      const k = Math.max(2, Math.ceil(Math.abs(da) * rc / 1.6));
      cn.arc = [];
      for (let q = 0; q <= k; q++) { const g = aA + da * q / k; cn.arc.push([cn.O[0] + Math.cos(g) * rc, cn.O[1] + Math.sin(g) * rc]); }
      A.need = Math.max(A.need, cn.tA); B.need = Math.max(B.need, cn.tB);
    }
    for (const a of arms) a.end.need = Math.max(a.end.need, a.need);
  }

  function finishPieces() {
    for (const P of NET.pieces) {
      const eA = P.ends[0], eB = P.ends[1];
      let uA = eA.j ? eA.need : 0, uB = eB.j ? eB.need : 0;
      const room = P.L - 2;
      if (uA + uB > room) { const f = Math.max(0, room) / (uA + uB || 1); uA *= f; uB *= f; P.squeezed = true; }
      eA.trim = uA; eB.trim = uB;
      eA.fs = [uA, uA]; eB.fs = [uB, uB];
    }
  }

  function cutCorner(a, side) { // arm side (+1: +n) -> world point on the kerb line at the trim
    const P = a.piece, e = a.end, s = a.start ? e.trim : P.L - e.trim;
    const f = frameAt(P, s);
    const sd = side * a.side; // piece side
    return [f.x + f.nx * P.hw * sd, f.y + f.ny * P.hw * sd];
  }

  function junctionPoly(J) {
    const arms = J.arms;
    if (arms.length < 2) return;
    const poly = [];
    J.kerbs = [];
    for (let i = 0; i < arms.length; i++) {
      const A = arms[i], cn = J.corners[i];
      poly.push(cutCorner(A, -1), cutCorner(A, 1));
      if (!cn) continue;
      const B = cn.B;
      if (cn.type === 'fillet') {
        const tA = Math.min(cn.tA, A.end.trim), tB = Math.min(cn.tB, B.end.trim);
        for (const p of cn.arc) poly.push(p);
        // footpaths along this corner start at the tangent points (piece sides)
        const sideA = 1 * A.side, sideB = -1 * B.side;
        if (A.fp > 0) A.end.fs[sideA > 0 ? 1 : 0] = tA;
        if (B.fp > 0) B.end.fs[sideB > 0 ? 1 : 0] = tB;
        J.kerbs.push({ type: 'arc', cn, A, B, tA, tB });
      } else if (A.fp > 0 && B.fp > 0) {
        J.kerbs.push({ type: 'line', A, B, pa: cutCorner(A, 1), pb: cutCorner(B, -1), fp: Math.min(A.fp, B.fp), kh: Math.min(A.piece.kerbH, B.piece.kerbH), paint: Math.max(A.piece.paint, B.piece.paint) });
      }
      // a footpath that meets an arm without one gets an end face
      if (A.fp > 0 && !(B.fp > 0)) A.end.capSide[A.side > 0 ? 1 : 0] = true;
      if (B.fp > 0 && !(A.fp > 0)) B.end.capSide[-B.side > 0 ? 1 : 0] = true;
    }
    // dominant style: highest rank, then widest
    let dom = arms[0].piece;
    for (const a of arms) { const P = a.piece; if (RANK[P.kind] > RANK[dom.kind] || (RANK[P.kind] === RANK[dom.kind] && P.hw > dom.hw)) dom = P; }
    J.dom = dom;
    const pl = dedupe(poly, 0.03);
    if (pl.length >= 3 && Math.hypot(pl[0][0] - pl[pl.length - 1][0], pl[0][1] - pl[pl.length - 1][1]) < 0.03) pl.pop();
    J.poly = pl;
    J.tris = triangulate(pl);
    if (!J.tris) { J.poly = hull(pl); J.tris = triangulate(J.poly) || []; }
    J.extraPts = [];
    for (const k of J.kerbs) if (k.type === 'arc') J.extraPts.push(k.cn.O, k.cn.C);
  }
  function polyArea(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return a / 2; }
  function selfIntersects(p) {
    const n = p.length;
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const c = p[j], d = p[(j + 1) % n];
        const d1 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]);
        const d2 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
        const d3 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const d4 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
        if (((d1 > 1e-7 && d2 < -1e-7) || (d1 < -1e-7 && d2 > 1e-7)) && ((d3 > 1e-7 && d4 < -1e-7) || (d3 < -1e-7 && d4 > 1e-7))) return true;
      }
    }
    return false;
  }
  function convex(p) {
    let sg = 0;
    for (let i = 0, n = p.length; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n], c = p[(i + 2) % n];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cr) < 1e-7) continue;
      const s = cr > 0 ? 1 : -1;
      if (!sg) sg = s; else if (s !== sg) return false;
    }
    return true;
  }
  function triangulate(pl) {
    if (pl.length < 3 || Math.abs(polyArea(pl)) < 1) return null;
    if (convex(pl)) { const t = []; for (let i = 1; i < pl.length - 1; i++) t.push([pl[0], pl[i], pl[i + 1]]); return t; }
    if (selfIntersects(pl)) return null;
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(pl.map((p) => new THREE.Vector2(p[0], p[1])), []); } catch (e) { return null; }
    if (!tris || !tris.length) return null;
    return tris.map((t) => [pl[t[0]], pl[t[1]], pl[t[2]]]);
  }
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }

  /** zebra crossings on junction approaches: the 2D map's rules (world.js paintGround) */
  function zebras() {
    const W = N.world, G = W.roads;
    for (const J of NET.juncs) {
      const n = J.node;
      if (!n || n.deg < 3 || J.arms.length < 2) continue;
      const inc = n.inc.map((id) => G.edges[id]).filter(Boolean).sort((a, b) => (RANK[a.kind] - RANK[b.kind]) || a.w - b.w);
      if (!inc.length || inc.every((e) => e.kind === 'lane')) continue;
      const widest = inc[inc.length - 1];
      const R = n.w / 2 + 2;
      const seen = [];
      for (const e of inc) {
        if (e.kind === 'lane' || e.kind === 'bridge' || e.kind === 'path') continue;
        const o = G.nodes[e.a === n.id ? e.b : e.a];
        let ux = o.x - n.x, uy = o.y - n.y; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
        if (L < R + 24) continue;
        if (seen.some((d) => d[0] * ux + d[1] * uy > 0.95)) continue;
        seen.push([ux, uy]);
        const arm = J.arms.find((a) => a.edge === e) || J.arms.slice().sort((p, q) => (q.d[0] * ux + q.d[1] * uy) - (p.d[0] * ux + p.d[1] * uy))[0];
        if (!arm) continue;
        const P = arm.piece, end = arm.end, other = P.ends[arm.start ? 1 : 0];
        const z = Math.max(widest.w / 2 + 6, end.trim + 4.6);
        const lim = P.L - (other.zebra ? other.zebra + 12 : other.trim + 2);
        if (z + 10 > lim) continue;
        end.zebra = z;
      }
    }
  }

  function busBays() {
    const D = N.world.data;
    for (const lm of D.landmarks || []) {
      if (!lm || lm.draw !== 'bus_stop') continue;
      let best = null;
      const bk = NET.buckets.get(bkey(Math.floor(lm.x / CHS), Math.floor(lm.y / CHS)));
      for (const P of bk ? bk.pieces : []) {
        if (P.kind !== 'street' && P.kind !== 'arterial' && P.kind !== 'bund') continue;
        const bb = P.bb || bboxOf(P.pts, P.hw + P.fp + 20);
        if (lm.x < bb[0] - 30 || lm.x > bb[2] + 30 || lm.y < bb[1] - 30 || lm.y > bb[3] + 30) continue;
        const q = projectOn(P.pts, P.cum, lm.x, lm.y, 0, P.L);
        if (q && (!best || q.d2 < best.q.d2)) best = { P, q };
      }
      if (!best || Math.sqrt(best.q.d2) > best.P.hw + best.P.fp + 24) continue;
      const P = best.P, u = best.q.s, side = best.q.v >= 0 ? 1 : -1;
      if (u - 20 < P.ends[0].trim + 12 || u + 20 > P.L - P.ends[1].trim - 12 || P.hw < 14) continue;
      const B = { P, u, side };
      NET.bays.push(B);
      const bb = bboxOf([ptAt(P.pts, P.cum, u - 20), ptAt(P.pts, P.cum, u + 20)].map((p) => [p[0], p[1]]), P.hw + 4);
      bucket('bays', B, bb[0], bb[1], bb[2], bb[3]);
    }
  }

  /* ================================================================ geometry builder (clipped to a chunk) */
  // per-vertex floats: x y z nx ny nz u v pot ; constants per polygon: rgb, geo4, mk4, layer, p1, age
  const VF = 9;
  class RB {
    constructor(x0, z0) {
      this.x0 = x0; this.z0 = z0; this.x1 = x0 + CHS; this.z1 = z0 + CHS;
      this.cap = 4096; this.n = 0; this.icap = 8192; this.ni = 0;
      this.P = new Float32Array(this.cap * 3); this.Nn = new Int8Array(this.cap * 3); this.C = new Uint8Array(this.cap * 3);
      this.UV = new Float32Array(this.cap * 2); this.GEO = new Float32Array(this.cap * 4); this.MK = new Float32Array(this.cap * 4); this.ST = new Float32Array(this.cap * 4);
      this.I = new Uint32Array(this.icap);
      this.tmpA = []; this.tmpB = [];
      this.raised = []; // [x0, z0, x1, z1, ... polygon footprints, h] for groundHeightAt
    }
    /** reuse the buffers for another chunk (jobs run one at a time) */
    reset(x0, z0) { this.x0 = x0; this.z0 = z0; this.x1 = x0 + CHS; this.z1 = z0 + CHS; this.n = 0; this.ni = 0; this.raised = []; return this; }
    grow(nv, ni) {
      if (this.n + nv > this.cap) {
        let c = this.cap; while (this.n + nv > c) c *= 2;
        const g = (A, k) => { const B = new A.constructor(c * k); B.set(A); return B; };
        this.P = g(this.P, 3); this.Nn = g(this.Nn, 3); this.C = g(this.C, 3); this.UV = g(this.UV, 2); this.GEO = g(this.GEO, 4); this.MK = g(this.MK, 4); this.ST = g(this.ST, 4);
        this.cap = c;
      }
      if (this.ni + ni > this.icap) { let c = this.icap; while (this.ni + ni > c) c *= 2; const B = new Uint32Array(c); B.set(this.I); this.I = B; this.icap = c; }
    }
    /** emit a convex polygon (flat array of n * VF floats) with constants cst, clipped to the chunk */
    poly(v, n, cst) {
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (let i = 0; i < n; i++) { const x = v[i * VF], z = v[i * VF + 2]; if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (z < mnz) mnz = z; if (z > mxz) mxz = z; }
      if (mxx < this.x0 || mnx > this.x1 || mxz < this.z0 || mnz > this.z1) return;
      if (mnx >= this.x0 && mxx <= this.x1 && mnz >= this.z0 && mxz <= this.z1) { this.write(v, n, cst); return; }
      let a = v, na = n;
      a = this.clip(a, na, 0, this.x0, 1); na = a.length / VF; if (na < 3) return;
      a = this.clip(a, na, 0, this.x1, -1); na = a.length / VF; if (na < 3) return;
      a = this.clip(a, na, 2, this.z0, 1); na = a.length / VF; if (na < 3) return;
      a = this.clip(a, na, 2, this.z1, -1); na = a.length / VF; if (na < 3) return;
      this.write(a, na, cst);
    }
    clip(v, n, ax, lim, sg) {
      const out = [];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ai = i * VF, aj = j * VF;
        const di = (v[ai + ax] - lim) * sg, dj = (v[aj + ax] - lim) * sg;
        if (di >= 0) for (let k = 0; k < VF; k++) out.push(v[ai + k]);
        if ((di >= 0) !== (dj >= 0)) {
          const t = di / (di - dj);
          for (let k = 0; k < VF; k++) out.push(v[ai + k] + (v[aj + k] - v[ai + k]) * t);
          out[out.length - VF + ax] = lim;
        }
      }
      return out;
    }
    write(v, n, c) {
      this.grow(n, (n - 2) * 3);
      // winding: geometric normal (Newell) vs the vertex normals
      let gx = 0, gy = 0, gz = 0, ax = 0, ay = 0, az = 0;
      for (let i = 0; i < n; i++) {
        const a = i * VF, b = ((i + 1) % n) * VF;
        gx += (v[a + 1] - v[b + 1]) * (v[a + 2] + v[b + 2]);
        gy += (v[a + 2] - v[b + 2]) * (v[a] + v[b]);
        gz += (v[a] - v[b]) * (v[a + 1] + v[b + 1]);
        ax += v[a + 3]; ay += v[a + 4]; az += v[a + 5];
      }
      const flip = gx * ax + gy * ay + gz * az < 0;
      const base = this.n;
      for (let i = 0; i < n; i++) {
        const o = i * VF, k = this.n++;
        this.P[k * 3] = v[o] - this.x0; this.P[k * 3 + 1] = v[o + 1]; this.P[k * 3 + 2] = v[o + 2] - this.z0;
        let nx = v[o + 3], ny = v[o + 4], nz = v[o + 5]; const nl = Math.hypot(nx, ny, nz) || 1;
        this.Nn[k * 3] = Math.round(nx / nl * 127); this.Nn[k * 3 + 1] = Math.round(ny / nl * 127); this.Nn[k * 3 + 2] = Math.round(nz / nl * 127);
        this.C[k * 3] = c.r; this.C[k * 3 + 1] = c.g; this.C[k * 3 + 2] = c.b;
        this.UV[k * 2] = v[o + 6]; this.UV[k * 2 + 1] = v[o + 7];
        const g4 = k * 4;
        this.GEO[g4] = c.g0; this.GEO[g4 + 1] = c.g1; this.GEO[g4 + 2] = c.g2; this.GEO[g4 + 3] = c.g3;
        this.MK[g4] = c.m0; this.MK[g4 + 1] = c.m1; this.MK[g4 + 2] = c.m2; this.MK[g4 + 3] = c.m3;
        this.ST[g4] = c.layer; this.ST[g4 + 1] = c.p1; this.ST[g4 + 2] = c.age; this.ST[g4 + 3] = v[o + 8];
      }
      for (let i = 1; i < n - 1; i++) {
        if (flip) { this.I[this.ni++] = base; this.I[this.ni++] = base + i + 1; this.I[this.ni++] = base + i; }
        else { this.I[this.ni++] = base; this.I[this.ni++] = base + i; this.I[this.ni++] = base + i + 1; }
      }
    }
    /** record a raised footprint (convex, world xz) at height h for groundHeightAt */
    raise(pts, h) {
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (const p of pts) { if (p[0] < mnx) mnx = p[0]; if (p[0] > mxx) mxx = p[0]; if (p[1] < mnz) mnz = p[1]; if (p[1] > mxz) mxz = p[1]; }
      if (mxx < this.x0 || mnx > this.x1 || mxz < this.z0 || mnz > this.z1) return;
      this.raised.push({ pts, h, bb: [mnx, mnz, mxx, mxz] });
    }
    build() {
      if (!this.ni) return null;
      const g = new THREE.BufferGeometry(), n = this.n;
      g.setAttribute('position', new THREE.BufferAttribute(this.P.slice(0, n * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(this.Nn.slice(0, n * 3), 3, true));
      g.setAttribute('color', new THREE.BufferAttribute(this.C.slice(0, n * 3), 3, true));
      g.setAttribute('aRd', new THREE.BufferAttribute(this.UV.slice(0, n * 2), 2));
      g.setAttribute('aGeo', new THREE.BufferAttribute(this.GEO.slice(0, n * 4), 4));
      g.setAttribute('aMk', new THREE.BufferAttribute(this.MK.slice(0, n * 4), 4));
      g.setAttribute('aSt', new THREE.BufferAttribute(this.ST.slice(0, n * 4), 4));
      const idx = n > 65535 ? this.I.slice(0, this.ni) : Uint16Array.from(this.I.subarray(0, this.ni));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    }
  }
  // polygon constants
  function cst(rgbLin, layer, o) {
    o = o || {};
    return {
      r: Math.round(clamp(rgbLin[0], 0, 1) * 255), g: Math.round(clamp(rgbLin[1], 0, 1) * 255), b: Math.round(clamp(rgbLin[2], 0, 1) * 255),
      g0: o.g0 || 0, g1: o.g1 || 0, g2: o.g2 || 0, g3: o.g3 || 0, m0: o.m0 || 0, m1: o.m1 || 0, m2: o.m2 || 0, m3: o.m3 || 0,
      layer, p1: o.p1 || 0, age: o.age || 0,
    };
  }
  const PV = new Array(VF * 64).fill(0);
  let pvN = 0;
  function pv(x, y, z, nx, ny, nz, u, v, pot) {
    const o = pvN * VF;
    PV[o] = x; PV[o + 1] = y; PV[o + 2] = z; PV[o + 3] = nx; PV[o + 4] = ny; PV[o + 5] = nz; PV[o + 6] = u; PV[o + 7] = v; PV[o + 8] = pot || 0;
    pvN++;
  }
  function flush(B, c) { if (pvN >= 3) B.poly(PV, pvN, c); pvN = 0; }

  /* ================================================================ potholes (depth profile) */
  const POTS = new Map(); // pothole -> {rho: Float32Array(24)} (ragged outline radius by angle, normalised)
  function potShape(p) {
    let s = POTS.get(p);
    if (s) return s;
    const K = 24, rho = new Float32Array(K);
    const pts = p.pts, n = pts ? pts.length / 2 : 0;
    for (let k = 0; k < K; k++) {
      const g = (k / K) * TAU, dx = Math.cos(g), dy = Math.sin(g);
      let best = 1;
      if (n >= 3) {
        best = 0;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          // outline in the pothole's normalised ellipse frame
          const ax = ((pts[i * 2] - p.x) * p.ca + (pts[i * 2 + 1] - p.y) * p.sa) / p.rx, ay = (-(pts[i * 2] - p.x) * p.sa + (pts[i * 2 + 1] - p.y) * p.ca) / p.ry;
          const bx = ((pts[j * 2] - p.x) * p.ca + (pts[j * 2 + 1] - p.y) * p.sa) / p.rx, by = (-(pts[j * 2] - p.x) * p.sa + (pts[j * 2 + 1] - p.y) * p.ca) / p.ry;
          const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-9) continue;
          const t = (ax * ey - ay * ex) / den, u = (ax * dy - ay * dx) / den;
          if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6 && t > best) best = t;
        }
        if (!best) best = 0.85;
      }
      rho[k] = best;
    }
    s = { rho, dip: Math.min(1.15, 0.35 + (p.depth || 0.4) * 1.0) };
    POTS.set(p, s);
    return s;
  }
  /** depth fraction 0..1 of pothole p at (x, y) */
  function potFrac(p, x, y) {
    const s = potShape(p);
    const dx = x - p.x, dy = y - p.y;
    const lu = (dx * p.ca + dy * p.sa) / p.rx, lv = (-dx * p.sa + dy * p.ca) / p.ry;
    const r = Math.hypot(lu, lv);
    if (r > 1.25) return 0;
    let g = Math.atan2(lv, lu); if (g < 0) g += TAU;
    const f = g / TAU * 24, k = Math.floor(f) % 24, t = f - Math.floor(f);
    const rho = s.rho[k] * (1 - t) + s.rho[(k + 1) % 24] * t;
    const q = r / Math.max(0.2, rho);
    if (q >= 1) return 0;
    if (q > 0.8) { const w = (1 - q) / 0.2; return w * w * (3 - 2 * w) * 0.72; }
    return 0.72 + 0.28 * (1 - (q / 0.8) * (q / 0.8));
  }

  /* ================================================================ chunk road emission */
  let EMIT_LOD = 0; // 1 = far chunk: no pothole dips, chamfers, back faces, shrubs, patches or bays
  function roadsJob(job, deadline) {
    const B = job.B, b = job.bucket;
    if (!b) return true;
    if (!job.items) {
      const W = N.world, PH = W.potholes;
      job.potsByPiece = new Map();
      // potholes in this chunk (only potholes that sit fully on a ribbon are rendered)
      if (PH && PH.query && !job.lod) {
        let list = [];
        try { list = PH.query(B.x0 - 12, B.z0 - 12, B.x1 + 12, B.z1 + 12, []); } catch (e) { list = []; }
        for (const p of list) {
          if (!(p.x >= B.x0 - 12 && p.x <= B.x1 + 12 && p.y >= B.z0 - 12 && p.y <= B.z1 + 12)) continue;
          const cand = NET.roadPieces.get(p.road) || b.pieces;
          let best = null;
          for (const P of cand) {
            if (P.bb && (p.x < P.bb[0] || p.x > P.bb[2] || p.y < P.bb[1] || p.y > P.bb[3])) continue;
            const q = projectOn(P.pts, P.cum, p.x, p.y, 0, P.L);
            if (q && (!best || q.d2 < best.q.d2)) best = { P, q };
          }
          if (!best) continue;
          const P = best.P, u = best.q.s, v = best.q.v, R = Math.max(p.rx, p.ry) * 1.05 + 0.6;
          if (Math.abs(v) + R > P.hw - 0.3 || u - R < P.ends[0].trim + 1 || u + R > P.L - P.ends[1].trim - 1) continue;
          let l = job.potsByPiece.get(P); if (!l) job.potsByPiece.set(P, (l = []));
          l.push({ p, u, v, R });
          job.pots.push(p);
        }
      }
      const it = [];
      for (const J of b.juncs) it.push(0, J);
      for (const P of b.pieces) it.push(1, P);
      for (const P of b.paths) it.push(2, P);
      for (const P of b.rails) it.push(3, P);
      if (!job.lod) {
        for (const bay of b.bays) it.push(4, bay);
        if (PH && PH.queryPatches) { let pl = []; try { pl = PH.queryPatches(B.x0, B.z0, B.x1, B.z1, []); } catch (e) { pl = []; } for (const q of pl) it.push(5, q); }
      }
      job.items = it; job.ii = 0;
    }
    EMIT_LOD = job.lod;
    const it = job.items;
    while (job.ii < it.length) {
      const k = it[job.ii], o = it[job.ii + 1];
      job.ii += 2;
      switch (k) {
        case 0: emitJunction(B, o); break;
        case 1: emitPiece(B, o, job.potsByPiece.get(o) || null); break;
        case 2: emitPath(B, o); break;
        case 3: emitRail(B, o); break;
        case 4: emitBay(B, o); break;
        case 5: emitPatch(B, o, job.pots); break;
        default: break;
      }
      if ((job.ii & 7) === 0 && now() > deadline) { EMIT_LOD = 0; return false; }
    }
    EMIT_LOD = 0;
    return true;
  }

  const UP = [0, 1, 0];
  /** ribbon cross-section helpers: point at arc length s and offset v (piece frame) */
  function frameAt(P, s) {
    const k = segAt(P.cum, s), a = P.pts[k], bb = P.pts[k + 1] || a, L = P.cum[k + 1] - P.cum[k] || 1e-9;
    const t = clamp((s - P.cum[k]) / L, 0, 1);
    const NA = P.nrm[k], NB = P.nrm[k + 1] || NA;
    return { x: a[0] + (bb[0] - a[0]) * t, y: a[1] + (bb[1] - a[1]) * t, nx: NA[0] + (NB[0] - NA[0]) * t, ny: NA[1] + (NB[1] - NA[1]) * t, dx: (bb[0] - a[0]) / L, dy: (bb[1] - a[1]) / L };
  }
  function breaksOf(P, s0, s1, extra) {
    const out = [s0];
    for (let k = 0; k < P.pts.length; k++) if (P.cum[k] > s0 + 0.02 && P.cum[k] < s1 - 0.02) out.push(P.cum[k]);
    if (extra) for (const e of extra) if (e > s0 + 0.02 && e < s1 - 0.02) out.push(e);
    out.push(s1);
    out.sort((a, b) => a - b);
    // long straight segments get intermediate breaks (camber / lighting stays smooth, culling stays tight)
    const res = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1], b = out[i], n = Math.ceil((b - a) / 48);
      for (let q = 1; q < n; q++) res.push(a + (b - a) * q / n);
      if (b - res[res.length - 1] > 0.01) res.push(b);
    }
    return res;
  }

  function emitPiece(B, P, pots) {
    if (!P.nrm) P.nrm = normalsOf(P.pts);
    const eA = P.ends[0], eB = P.ends[1];
    const s0 = eA.trim, s1 = P.L - eB.trim;
    if (s1 - s0 < 0.05) return;
    const hw = P.hw, st = P.st;
    const camber = 0.035;
    const roadC = cst(st.c, LY.ROAD, { g0: P.L, g1: hw, g2: eA.zebra, g3: eB.zebra, m0: eA.trim, m1: eB.trim, m2: P.medHW, m3: P.bits, p1: st.wear, age: st.age });
    const extra = [];
    if (pots) for (const q of pots) extra.push(q.u - q.R, q.u + q.R);
    // quick reject: piece bbox vs chunk
    if (P.bb && (P.bb[2] < B.x0 || P.bb[0] > B.x1 || P.bb[3] < B.z0 || P.bb[1] > B.z1)) return;
    const brk = breaksOf(P, s0, s1, extra);
    const inChunk = (fa, fb, m) => !(Math.max(fa.x, fb.x) + m < B.x0 || Math.min(fa.x, fb.x) - m > B.x1 || Math.max(fa.y, fb.y) + m < B.z0 || Math.min(fa.y, fb.y) - m > B.z1);
    const reach = hw + P.fp + 2;
    for (let i = 0; i < brk.length - 1; i++) {
      const ua = brk[i], ub = brk[i + 1];
      const fa = frameAt(P, ua), fb = frameAt(P, ub);
      if (!inChunk(fa, fb, reach)) continue;
      const um = (ua + ub) / 2;
      const hits = pots ? pots.filter((q) => q.u + q.R > ua + 1e-3 && q.u - q.R < ub - 1e-3) : null;
      // asphalt: two halves (camber normals tilt outward)
      for (const side of [-1, 1]) {
        const va = side < 0 ? -hw : 0, vb = side < 0 ? 0 : hw;
        if (hits && hits.length) { gridQuad(B, P, fa, fb, ua, ub, va, vb, hits, roadC, camber); continue; }
        const nO = [fa.nx * side * camber, 1, fa.ny * side * camber], nOb = [fb.nx * side * camber, 1, fb.ny * side * camber];
        const ta = side < 0 ? nO : UP, tb = side < 0 ? UP : nO, tc = side < 0 ? UP : nOb, td = side < 0 ? nOb : UP;
        pv(fa.x + fa.nx * va, Y_ROAD, fa.y + fa.ny * va, ta[0], ta[1], ta[2], ua, va);
        pv(fa.x + fa.nx * vb, Y_ROAD, fa.y + fa.ny * vb, tb[0], tb[1], tb[2], ua, vb);
        pv(fb.x + fb.nx * vb, Y_ROAD, fb.y + fb.ny * vb, tc[0], tc[1], tc[2], ub, vb);
        pv(fb.x + fb.nx * va, Y_ROAD, fb.y + fb.ny * va, td[0], td[1], td[2], ub, va);
        flush(B, roadC);
      }
      // bridges: concrete edge strips out to the parapets
      if (P.kind === 'bridge') {
        const cc = cst(linRGB('#8d877c'), LY.CONC, { age: 0.5 });
        for (const side of [-1, 1]) {
          const va = side * hw, vb = side * (hw + 3.5);
          pv(fa.x + fa.nx * va, Y_ROAD, fa.y + fa.ny * va, 0, 1, 0, ua, va); pv(fa.x + fa.nx * vb, Y_ROAD, fa.y + fa.ny * vb, 0, 1, 0, ua, vb);
          pv(fb.x + fb.nx * vb, Y_ROAD, fb.y + fb.ny * vb, 0, 1, 0, ub, vb); pv(fb.x + fb.nx * va, Y_ROAD, fb.y + fb.ny * va, 0, 1, 0, ub, va);
          flush(B, cc);
        }
      }
      // footpaths + kerbs
      if (P.fp > 0) for (const side of [-1, 1]) {
        const si = side > 0 ? 1 : 0;
        const fA = eA.fs[si], fB = P.L - eB.fs[si];
        const a = Math.max(ua, fA), bU = Math.min(ub, fB);
        if (bU - a < 0.02) continue;
        const ga = a === ua ? fa : frameAt(P, a), gb = bU === ub ? fb : frameAt(P, bU);
        footStrip(B, ga, gb, a, bU, side, hw, P.fp, P.kerbH, P.paint, P.kind);
      }
      // median
      if (P.medHW > 0) {
        const ma = medianStart(P, 0), mb = P.L - medianStart(P, 1);
        const a = Math.max(ua, ma), bU = Math.min(ub, mb);
        if (bU - a > 0.02) medianStrip(B, P, a === ua ? fa : frameAt(P, a), bU === ub ? fb : frameAt(P, bU), a, bU);
      }
    }
    // footpath end faces + median noses + dead-end caps
    if (P.fp > 0) for (const side of [-1, 1]) {
      const si = side > 0 ? 1 : 0;
      for (const end of [0, 1]) {
        const e = P.ends[end], s = end === 0 ? e.fs[si] : P.L - e.fs[si];
        if (P.closed || (e.j && !needsFootCap(e, side))) continue;
        const f = frameAt(P, clamp(s, 0, P.L));
        footCap(B, f, s, side, hw, P.fp, P.kerbH, end === 0 ? -1 : 1, P.paint);
      }
    }
    if (P.medHW > 0) {
      const ma = medianStart(P, 0), mb = P.L - medianStart(P, 1);
      if (mb - ma > 4) { medianNose(B, P, ma, -1); medianNose(B, P, mb, 1); }
    }
    for (const end of [0, 1]) {
      const e = P.ends[end];
      if (!e.cap || P.closed) continue;
      const s = end === 0 ? 0 : P.L, f = frameAt(P, s), dir = end === 0 ? -1 : 1;
      const jc = cst(st.c, LY.JUNC, { p1: st.wear, age: st.age });
      const K = 10;
      for (let q = 0; q < K; q++) {
        const g0 = Math.PI * q / K, g1 = Math.PI * (q + 1) / K;
        const p0 = [Math.cos(g0) * hw, Math.sin(g0) * hw * dir], p1 = [Math.cos(g1) * hw, Math.sin(g1) * hw * dir];
        pv(f.x, Y_ROAD, f.y, 0, 1, 0, s, 0);
        pv(f.x + f.nx * p0[0] + f.dx * p0[1], Y_ROAD, f.y + f.ny * p0[0] + f.dy * p0[1], 0, 1, 0, s, p0[0]);
        pv(f.x + f.nx * p1[0] + f.dx * p1[1], Y_ROAD, f.y + f.ny * p1[0] + f.dy * p1[1], 0, 1, 0, s, p1[0]);
        flush(B, jc);
      }
    }
  }
  function needsFootCap(e, side) { return !!(e.capSide && e.capSide[side > 0 ? 1 : 0]); }
  function medianStart(P, end) {
    const e = P.ends[end];
    let s = e.trim + 3;
    if (e.zebra) s = Math.max(s, e.zebra + 4 + 3.2 + 2);
    if (!e.j) s = 6;
    return s;
  }

  /** a quad of road split into a fine grid around potholes (real dips) */
  function gridQuad(B, P, fa, fb, ua, ub, va, vb, hits, c, camber) {
    // bilinear patch corners
    const ax = fa.x + fa.nx * va, az = fa.y + fa.ny * va, bx = fa.x + fa.nx * vb, bz = fa.y + fa.ny * vb;
    const cx = fb.x + fb.nx * vb, cz = fb.y + fb.ny * vb, dx = fb.x + fb.nx * va, dz = fb.y + fb.ny * va;
    // v extent of the potholes inside this half (others stay plain quads)
    let vlo = Infinity, vhi = -Infinity, ulo = Infinity, uhi = -Infinity;
    for (const q of hits) { vlo = Math.min(vlo, q.v - q.R); vhi = Math.max(vhi, q.v + q.R); ulo = Math.min(ulo, q.u - q.R); uhi = Math.max(uhi, q.u + q.R); }
    vlo = Math.max(va, vlo); vhi = Math.min(vb, vhi); ulo = Math.max(ua, ulo); uhi = Math.min(ub, uhi);
    const vs = [va]; if (vlo > va + 0.05) vs.push(vlo); if (vhi < vb - 0.05 && vhi > vlo) vs.push(vhi); vs.push(vb);
    const us = [ua]; if (ulo > ua + 0.05) us.push(ulo); if (uhi < ub - 0.05 && uhi > ulo) us.push(uhi); us.push(ub);
    const at = (u, v) => { // bilinear position + camber normal
      const s = (u - ua) / ((ub - ua) || 1), t = (v - va) / ((vb - va) || 1);
      const x0 = ax + (dx - ax) * s, z0 = az + (dz - az) * s, x1 = bx + (cx - bx) * s, z1 = bz + (cz - bz) * s;
      return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
    };
    const nrmAt = (v) => { const w = Math.abs(v) / (P.hw || 1); const sgn = v < 0 ? -1 : 1; return [fa.nx * sgn * camber * w, 1, fa.ny * sgn * camber * w]; };
    for (let iu = 0; iu < us.length - 1; iu++) for (let iv = 0; iv < vs.length - 1; iv++) {
      const u0 = us[iu], u1 = us[iu + 1], v0 = vs[iv], v1 = vs[iv + 1];
      const core = u0 >= ulo - 1e-3 && u1 <= uhi + 1e-3 && v0 >= vlo - 1e-3 && v1 <= vhi + 1e-3;
      if (!core) {
        for (const [u, v] of [[u0, v0], [u0, v1], [u1, v1], [u1, v0]]) { const p = at(u, v), n = nrmAt(v); pv(p[0], Y_ROAD, p[1], n[0], n[1], n[2], u, v); }
        flush(B, c);
        continue;
      }
      const nu = Math.max(2, Math.ceil((u1 - u0) / 0.95)), nv = Math.max(2, Math.ceil((v1 - v0) / 0.95));
      // vertex grid: height + normal from the depth field
      const G = [];
      for (let a = 0; a <= nu; a++) for (let b2 = 0; b2 <= nv; b2++) {
        const u = u0 + (u1 - u0) * a / nu, v = v0 + (v1 - v0) * b2 / nv, p = at(u, v);
        let f = 0, wet = 0, dip = 0;
        for (const q of hits) { const ff = potFrac(q.p, p[0], p[1]); if (ff > f) { f = ff; dip = potShape(q.p).dip; wet = q.p.wet ? 2 : 0; } }
        const h = Y_ROAD - f * dip;
        G.push([p[0], h, p[1], u, v, f > 0.001 ? f + wet : 0]);
      }
      const gi = (a, b2) => G[a * (nv + 1) + b2];
      for (let a = 0; a < nu; a++) for (let b2 = 0; b2 < nv; b2++) {
        const q = [gi(a, b2), gi(a, b2 + 1), gi(a + 1, b2 + 1), gi(a + 1, b2)];
        for (let k = 0; k < 4; k++) {
          const g = q[k];
          // normal from neighbours (central differences on the grid)
          const ia = a + (k === 2 || k === 3 ? 1 : 0), ib = b2 + (k === 1 || k === 2 ? 1 : 0);
          const gl = gi(Math.max(0, ia - 1), ib), gr = gi(Math.min(nu, ia + 1), ib), gd = gi(ia, Math.max(0, ib - 1)), gu = gi(ia, Math.min(nv, ib + 1));
          const e1x = gr[0] - gl[0], e1y = gr[1] - gl[1], e1z = gr[2] - gl[2], e2x = gu[0] - gd[0], e2y = gu[1] - gd[1], e2z = gu[2] - gd[2];
          let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
          if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
          const cb = nrmAt(g[4]);
          const l = Math.hypot(nx, ny, nz) || 1;
          pv(g[0], g[1], g[2], nx / l + cb[0], ny / l, nz / l + cb[2], g[3], g[4], g[5]);
        }
        flush(B, c);
      }
    }
  }

  /** footpath slab along a piece side: kerb face (+chamfer), kerb band (painted), pavers, back face */
  function footStrip(B, fa, fb, ua, ub, side, hw, fp, kh, paint, kind) {
    const kc = cst(linRGB(KERBCOL), LY.KERB, { p1: paint, age: 0.5 });
    const fc = cst(linRGB(FOOTCOL[kind] || FOOTCOL.street), LY.FOOT, { age: 0.5, g1: fp });
    const backC = cst(linRGB('#8f8574'), LY.CONC, { age: 0.6 });
    const ch = EMIT_LOD ? 0 : 0.14; // far chunks: no chamfer
    const o = (f, v) => [f.x + f.nx * v * side, f.y + f.ny * v * side];
    const nx = -fa.nx * side, nz = -fa.ny * side; // kerb face normal points at the road
    // kerb face
    const a = o(fa, hw), b = o(fb, hw);
    pv(a[0], Y_ROAD - 0.02, a[1], nx, 0, nz, ua, 0); pv(b[0], Y_ROAD - 0.02, b[1], nx, 0, nz, ub, 0);
    pv(b[0], kh - ch, b[1], nx, 0, nz, ub, 0.1); pv(a[0], kh - ch, a[1], nx, 0, nz, ua, 0.1);
    flush(B, kc);
    // chamfer (catches the light along the kerb edge)
    const a2 = o(fa, hw + ch), b2 = o(fb, hw + ch);
    if (ch > 0) {
      pv(a[0], kh - ch, a[1], nx, 1, nz, ua, 0.1); pv(b[0], kh - ch, b[1], nx, 1, nz, ub, 0.1);
      pv(b2[0], kh, b2[1], nx, 1, nz, ub, 0.2); pv(a2[0], kh, a2[1], nx, 1, nz, ua, 0.2);
      flush(B, kc);
    }
    // kerb band (top of the kerb stone)
    const kb = Math.min(0.9, fp * 0.2);
    const a3 = o(fa, hw + kb), b3 = o(fb, hw + kb);
    pv(a2[0], kh, a2[1], 0, 1, 0, ua, 0.2); pv(b2[0], kh, b2[1], 0, 1, 0, ub, 0.2);
    pv(b3[0], kh, b3[1], 0, 1, 0, ub, 0.4); pv(a3[0], kh, a3[1], 0, 1, 0, ua, 0.4);
    flush(B, kc);
    // pavers
    const a4 = o(fa, hw + fp), b4 = o(fb, hw + fp);
    pv(a3[0], kh, a3[1], 0, 1, 0, ua, kb); pv(b3[0], kh, b3[1], 0, 1, 0, ub, kb);
    pv(b4[0], kh, b4[1], 0, 1, 0, ub, fp); pv(a4[0], kh, a4[1], 0, 1, 0, ua, fp);
    flush(B, fc);
    // back face (toward the plots)
    if (!EMIT_LOD) {
      pv(b4[0], 0, b4[1], -nx, 0, -nz, ub, 0); pv(a4[0], 0, a4[1], -nx, 0, -nz, ua, 0);
      pv(a4[0], kh, a4[1], -nx, 0, -nz, ua, 0.2); pv(b4[0], kh, b4[1], -nx, 0, -nz, ub, 0.2);
      flush(B, backC);
    }
    B.raise([a, b, b4, a4], kh);
  }
  /** end face of a footpath (dir -1: faces back along the piece, +1: forward) */
  function footCap(B, f, s, side, hw, fp, kh, dir, paint) {
    const kc = cst(linRGB(KERBCOL), LY.KERB, { p1: paint, age: 0.5 });
    const a = [f.x + f.nx * hw * side, f.y + f.ny * hw * side], b = [f.x + f.nx * (hw + fp) * side, f.y + f.ny * (hw + fp) * side];
    const nx = f.dx * dir, nz = f.dy * dir;
    pv(a[0], 0, a[1], nx, 0, nz, s, 0); pv(b[0], 0, b[1], nx, 0, nz, s + fp, 0);
    pv(b[0], kh, b[1], nx, 0, nz, s + fp, 0.2); pv(a[0], kh, a[1], nx, 0, nz, s, 0.2);
    flush(B, kc);
  }
  function medianStrip(B, P, fa, fb, ua, ub) {
    const kc = cst(linRGB(KERBCOL), LY.KERB, { p1: PAINT.BY, age: 0.4 });
    const tc = cst(linRGB('#8a7a5c'), LY.MEDIAN, { age: 0.5 });
    const m = P.medHW, h = MED_H, kb = 0.45;
    for (const side of [-1, 1]) {
      const o = (f, v) => [f.x + f.nx * v * side, f.y + f.ny * v * side];
      const nx = fa.nx * side, nz = fa.ny * side; // faces point away from the median centre
      const a = o(fa, m), b = o(fb, m);
      pv(a[0], Y_ROAD - 0.02, a[1], nx, 0, nz, ua, 0); pv(b[0], Y_ROAD - 0.02, b[1], nx, 0, nz, ub, 0);
      pv(b[0], h, b[1], nx, 0, nz, ub, 0.1); pv(a[0], h, a[1], nx, 0, nz, ua, 0.1);
      flush(B, kc);
      const a2 = o(fa, m - kb), b2 = o(fb, m - kb);
      pv(a[0], h, a[1], 0, 1, 0, ua, 0.1); pv(b[0], h, b[1], 0, 1, 0, ub, 0.1); pv(b2[0], h, b2[1], 0, 1, 0, ub, 0.3); pv(a2[0], h, a2[1], 0, 1, 0, ua, 0.3);
      flush(B, kc);
    }
    const a = [fa.x - fa.nx * (m - kb), fa.y - fa.ny * (m - kb)], b = [fb.x - fb.nx * (m - kb), fb.y - fb.ny * (m - kb)];
    const c = [fb.x + fb.nx * (m - kb), fb.y + fb.ny * (m - kb)], d = [fa.x + fa.nx * (m - kb), fa.y + fa.ny * (m - kb)];
    pv(a[0], h, a[1], 0, 1, 0, ua, -m); pv(b[0], h, b[1], 0, 1, 0, ub, -m); pv(c[0], h, c[1], 0, 1, 0, ub, m); pv(d[0], h, d[1], 0, 1, 0, ua, m);
    flush(B, tc);
    B.raise([[fa.x - fa.nx * m, fa.y - fa.ny * m], [fb.x - fb.nx * m, fb.y - fb.ny * m], [fb.x + fb.nx * m, fb.y + fb.ny * m], [fa.x + fa.nx * m, fa.y + fa.ny * m]], h);
    // shrubs (deterministic per 7 u cell along the piece)
    if (EMIT_LOD) return;
    const s0 = Math.ceil(ua / 7), s1 = Math.floor(ub / 7);
    for (let k = s0; k <= s1; k++) {
      const h1 = hash1(P.id * 131 + 7, k);
      if (h1 < 0.35) continue;
      const f = frameAt(P, k * 7 + (h1 - 0.5) * 2);
      if (f.x < B.x0 - 2 || f.x > B.x1 + 2 || f.y < B.z0 - 2 || f.y > B.z1 + 2) continue;
      shrub(B, f.x, f.y, h, 1.1 + h1 * 0.7, h1);
    }
  }
  function medianNose(B, P, s, dir) {
    const f = frameAt(P, clamp(s, 0, P.L)), m = P.medHW, h = MED_H;
    const kc = cst(linRGB(KERBCOL), LY.KERB, { p1: PAINT.BY, age: 0.4 });
    const K = 8;
    for (let q = 0; q < K; q++) {
      const g0 = Math.PI * q / K, g1 = Math.PI * (q + 1) / K;
      const p0 = [Math.cos(g0) * m, Math.sin(g0) * m * dir], p1 = [Math.cos(g1) * m, Math.sin(g1) * m * dir];
      const x0 = f.x + f.nx * p0[0] + f.dx * p0[1], z0 = f.y + f.ny * p0[0] + f.dy * p0[1];
      const x1 = f.x + f.nx * p1[0] + f.dx * p1[1], z1 = f.y + f.ny * p1[0] + f.dy * p1[1];
      const nx = (x0 + x1) / 2 - f.x, nz = (z0 + z1) / 2 - f.y;
      pv(x0, Y_ROAD - 0.02, z0, nx, 0, nz, s + q, 0); pv(x1, Y_ROAD - 0.02, z1, nx, 0, nz, s + q + 1, 0);
      pv(x1, h, z1, nx, 0, nz, s + q + 1, 0.1); pv(x0, h, z0, nx, 0, nz, s + q, 0.1);
      flush(B, kc);
      pv(f.x, h, f.y, 0, 1, 0, s, 0); pv(x0, h, z0, 0, 1, 0, s, 0); pv(x1, h, z1, 0, 1, 0, s, 0);
      flush(B, kc);
    }
    B.raise([[f.x - f.nx * m, f.y - f.ny * m], [f.x + f.nx * m, f.y + f.ny * m], [f.x + f.nx * m + f.dx * m * dir, f.y + f.ny * m + f.dy * m * dir], [f.x - f.nx * m + f.dx * m * dir, f.y - f.ny * m + f.dy * m * dir]], h);
  }
  const SHRUB = ['#3f6a2a', '#4f7a32', '#5b8a3a', '#6a7f2e'];
  function shrub(B, x, z, y0, r, h1) {
    const c = cst(linRGB(SHRUB[(h1 * 97 | 0) % 4]), LY.PLANT, { age: h1 });
    const K = 6, top = y0 + r * 1.3, mid = y0 + r * 0.7;
    const ring = [];
    for (let q = 0; q < K; q++) { const g = (q / K) * TAU + h1 * 3; ring.push([x + Math.cos(g) * r, z + Math.sin(g) * r]); }
    for (let q = 0; q < K; q++) {
      const a = ring[q], b = ring[(q + 1) % K];
      const mx = (a[0] + b[0]) / 2 - x, mz = (a[1] + b[1]) / 2 - z;
      pv(a[0] * 0.75 + x * 0.25, y0, a[1] * 0.75 + z * 0.25, mx, -0.2, mz, 0, 0); pv(b[0] * 0.75 + x * 0.25, y0, b[1] * 0.75 + z * 0.25, mx, -0.2, mz, 0, 0);
      pv(b[0], mid, b[1], mx, 0.3, mz, 0, 0); pv(a[0], mid, a[1], mx, 0.3, mz, 0, 0);
      flush(B, c);
      pv(a[0], mid, a[1], mx, 0.8, mz, 0, 0); pv(b[0], mid, b[1], mx, 0.8, mz, 0, 0); pv(x, top, z, 0, 1, 0, 0, 0);
      flush(B, c);
    }
  }

  /** junction surface + kerb corners + footpath corners + straight connectors */
  function emitJunction(B, J) {
    if (!J.tris || !J.dom) return;
    const st = J.dom.st;
    const jc = cst(st.c, LY.JUNC, { p1: st.wear, age: st.age });
    for (const t of J.tris) {
      pv(t[0][0], Y_ROAD, t[0][1], 0, 1, 0, 0, 0); pv(t[1][0], Y_ROAD, t[1][1], 0, 1, 0, 0, 0); pv(t[2][0], Y_ROAD, t[2][1], 0, 1, 0, 0, 0);
      flush(B, jc);
    }
    for (const k of J.kerbs) {
      if (k.type === 'arc') arcKerb(B, J, k);
      else lineKerb(B, k);
    }
  }
  function arcKerb(B, J, k) {
    const cn = k.cn, A = k.A, Bm = k.B;
    const kh = Math.min(A.piece.kerbH, Bm.piece.kerbH) || 0.6;
    const paint = Math.max(A.piece.paint, Bm.piece.paint);
    if (!(A.fp > 0 && Bm.fp > 0)) {
      // only one side has a footpath: its kerb wraps a small radius; the other side is open ground
      return;
    }
    const fp = Math.min(A.fp, Bm.fp), rc = cn.rc, O = cn.O;
    const kc = cst(linRGB(KERBCOL), LY.KERB, { p1: paint, age: 0.5 });
    const fc = cst(linRGB(FOOTCOL[A.piece.kind] || FOOTCOL.street), LY.FOOT, { age: 0.5, g1: fp });
    const backC = cst(linRGB('#8f8574'), LY.CONC, { age: 0.6 });
    const n = cn.arc.length - 1;
    const kb = Math.min(0.9, fp * 0.2), ch = 0.14;
    const rIn = Math.max(0, rc - fp);
    const pt = (g, r) => [O[0] + Math.cos(g) * r, O[1] + Math.sin(g) * r];
    let uacc = 0;
    for (let q = 0; q < n; q++) {
      const g0 = cn.a0 + cn.da * q / n, g1 = cn.a0 + cn.da * (q + 1) / n;
      const segL = Math.abs(cn.da / n) * rc;
      const u0 = uacc, u1 = uacc + segL; uacc = u1;
      const nx0 = Math.cos(g0), nz0 = Math.sin(g0), nx1 = Math.cos(g1), nz1 = Math.sin(g1);
      const a = pt(g0, rc), b = pt(g1, rc);
      // kerb face (normal away from O, toward the road)
      pv(a[0], Y_ROAD - 0.02, a[1], nx0, 0, nz0, u0, 0); pv(b[0], Y_ROAD - 0.02, b[1], nx1, 0, nz1, u1, 0);
      pv(b[0], kh - ch, b[1], nx1, 0, nz1, u1, 0.1); pv(a[0], kh - ch, a[1], nx0, 0, nz0, u0, 0.1);
      flush(B, kc);
      const a2 = pt(g0, rc - ch), b2 = pt(g1, rc - ch);
      pv(a[0], kh - ch, a[1], nx0, 1, nz0, u0, 0.1); pv(b[0], kh - ch, b[1], nx1, 1, nz1, u1, 0.1);
      pv(b2[0], kh, b2[1], nx1, 1, nz1, u1, 0.2); pv(a2[0], kh, a2[1], nx0, 1, nz0, u0, 0.2);
      flush(B, kc);
      const a3 = pt(g0, Math.max(rIn, rc - kb)), b3 = pt(g1, Math.max(rIn, rc - kb));
      pv(a2[0], kh, a2[1], 0, 1, 0, u0, 0.2); pv(b2[0], kh, b2[1], 0, 1, 0, u1, 0.2); pv(b3[0], kh, b3[1], 0, 1, 0, u1, 0.4); pv(a3[0], kh, a3[1], 0, 1, 0, u0, 0.4);
      flush(B, kc);
      if (rc - kb > rIn + 0.05) {
        const a4 = pt(g0, rIn), b4 = pt(g1, rIn);
        pv(a3[0], kh, a3[1], 0, 1, 0, u0, kb); pv(b3[0], kh, b3[1], 0, 1, 0, u1, kb);
        if (rIn > 0.05) { pv(b4[0], kh, b4[1], 0, 1, 0, u1, fp); pv(a4[0], kh, a4[1], 0, 1, 0, u0, fp); }
        else pv(O[0], kh, O[1], 0, 1, 0, (u0 + u1) / 2, fp);
        flush(B, fc);
        if (rIn > 0.5) {
          pv(b4[0], 0, b4[1], -nx1, 0, -nz1, u1, 0); pv(a4[0], 0, a4[1], -nx0, 0, -nz0, u0, 0);
          pv(a4[0], kh, a4[1], -nx0, 0, -nz0, u0, 0.2); pv(b4[0], kh, b4[1], -nx1, 0, -nz1, u1, 0.2);
          flush(B, backC);
        }
      }
      B.raise(rIn > 0.05 ? [a, b, pt(g1, rIn), pt(g0, rIn)] : [a, b, O], kh);
    }
    // footpath along the kerb lines between the tangent points and the piece footpaths (trim > tangent)
  }
  function lineKerb(B, k) {
    const pa = k.pa, pb = k.pb;
    let dx = pb[0] - pa[0], dz = pb[1] - pa[1];
    const L = Math.hypot(dx, dz);
    if (L < 0.3) return;
    dx /= L; dz /= L;
    // outward normal: away from both arms' centre lines (toward the plots)
    let nx = -dz, nz = dx;
    const A = k.A, cx = A.Q[0], cz = A.Q[1];
    if ((pa[0] - cx) * nx + (pa[1] - cz) * nz < 0) { nx = -nx; nz = -nz; }
    const fake = { x: 0, y: 0, nx: 0, ny: 0 };
    const fa = { x: pa[0] - nx * A.hw, y: pa[1] - nz * A.hw, nx, ny: nz }, fb = { x: pb[0] - nx * A.hw, y: pb[1] - nz * A.hw, nx, ny: nz };
    void fake;
    footStrip(B, fa, fb, 0, L, 1, A.hw, k.fp, k.kh, k.paint, A.piece.kind);
  }

  function emitPath(B, P) {
    if (P.bb2 === undefined) P.bb2 = bboxOf(P.pts, P.hw + 2);
    const bb = P.bb2;
    if (bb[2] < B.x0 || bb[0] > B.x1 || bb[3] < B.z0 || bb[1] > B.z1) return;
    if (!P.nrm) P.nrm = normalsOf(P.pts);
    const L = P.cum[P.cum.length - 1];
    const c = cst(linRGB('#c4b08c'), LY.PATH, { g1: P.hw, age: 0.6 });
    const brk = breaksOf(P, 0, L, null);
    for (let i = 0; i < brk.length - 1; i++) {
      const fa = frameAt(P, brk[i]), fb = frameAt(P, brk[i + 1]), hw = P.hw;
      pv(fa.x - fa.nx * hw, Y_PATH, fa.y - fa.ny * hw, 0, 1, 0, brk[i], -hw); pv(fa.x + fa.nx * hw, Y_PATH, fa.y + fa.ny * hw, 0, 1, 0, brk[i], hw);
      pv(fb.x + fb.nx * hw, Y_PATH, fb.y + fb.ny * hw, 0, 1, 0, brk[i + 1], hw); pv(fb.x - fb.nx * hw, Y_PATH, fb.y - fb.ny * hw, 0, 1, 0, brk[i + 1], -hw);
      flush(B, c);
    }
    for (const s of [0, L]) {
      const f = frameAt(P, s), dir = s === 0 ? -1 : 1, K = 8;
      for (let q = 0; q < K; q++) {
        const g0 = Math.PI * q / K, g1 = Math.PI * (q + 1) / K;
        pv(f.x, Y_PATH, f.y, 0, 1, 0, s, 0);
        pv(f.x + f.nx * Math.cos(g0) * P.hw + f.dx * Math.sin(g0) * P.hw * dir, Y_PATH, f.y + f.ny * Math.cos(g0) * P.hw + f.dy * Math.sin(g0) * P.hw * dir, 0, 1, 0, s, Math.cos(g0) * P.hw);
        pv(f.x + f.nx * Math.cos(g1) * P.hw + f.dx * Math.sin(g1) * P.hw * dir, Y_PATH, f.y + f.ny * Math.cos(g1) * P.hw + f.dy * Math.sin(g1) * P.hw * dir, 0, 1, 0, s, Math.cos(g1) * P.hw);
        flush(B, c);
      }
    }
  }
  function emitRail(B, P) {
    if (P.bb2 === undefined) P.bb2 = bboxOf(P.pts, P.hw + 2);
    const bb = P.bb2;
    if (bb[2] < B.x0 || bb[0] > B.x1 || bb[3] < B.z0 || bb[1] > B.z1) return;
    if (!P.nrm) P.nrm = normalsOf(P.pts);
    const L = P.cum[P.cum.length - 1];
    const c = cst(linRGB('#857a6c'), LY.RAIL, { g1: P.hw, age: 0.5 });
    const brk = breaksOf(P, 0, L, null);
    for (let i = 0; i < brk.length - 1; i++) {
      const fa = frameAt(P, brk[i]), fb = frameAt(P, brk[i + 1]), hw = P.hw;
      pv(fa.x - fa.nx * hw, Y_RAIL, fa.y - fa.ny * hw, 0, 1, 0, brk[i], -hw); pv(fa.x + fa.nx * hw, Y_RAIL, fa.y + fa.ny * hw, 0, 1, 0, brk[i], hw);
      pv(fb.x + fb.nx * hw, Y_RAIL, fb.y + fb.ny * hw, 0, 1, 0, brk[i + 1], hw); pv(fb.x - fb.nx * hw, Y_RAIL, fb.y - fb.ny * hw, 0, 1, 0, brk[i + 1], -hw);
      flush(B, c);
    }
  }
  function emitBay(B, bay) {
    const P = bay.P, s = bay.side, hw = P.hw, u = bay.u, w = 0.45;
    const yc = cst(linRGB('#e3b52a'), LY.PAINT, { age: P.st.age });
    const line = (u0, v0, u1, v1) => {
      const a = frameAt(P, u0), b = frameAt(P, u1);
      const ax = a.x + a.nx * v0, az = a.y + a.ny * v0, bx = b.x + b.nx * v1, bz = b.y + b.ny * v1;
      let dx = bx - ax, dz = bz - az; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const nx = -dz * w, nz = dx * w;
      pv(ax - nx, Y_DECAL, az - nz, 0, 1, 0, 0, 0); pv(ax + nx, Y_DECAL, az + nz, 0, 1, 0, 0, 1);
      pv(bx + nx, Y_DECAL, bz + nz, 0, 1, 0, L, 1); pv(bx - nx, Y_DECAL, bz - nz, 0, 1, 0, L, 0);
      flush(B, yc);
    };
    const vin = s * (hw - 6.5), vk = s * (hw - 0.8);
    line(u - 19, vk, u - 14, vin);
    for (let q = u - 14; q < u + 14 - 0.1; q += 3.5) line(q, vin, Math.min(u + 14, q + 2), vin);
    line(u + 14, vin, u + 19, vk);
    // "BUS" box: three short bars across the bay as lettering stand-in
    for (const du of [-4, 0, 4]) line(u + du - 1.2, s * (hw - 2), u + du + 1.2, s * (hw - 2));
  }
  function emitPatch(B, q, pots) {
    for (const p of pots) if (Math.hypot(p.x - q.x, p.y - q.y) < q.R + Math.max(p.rx, p.ry) + 1) return;
    const st = RSTYLE[q.kind] || RSTYLE.street;
    const base = mixRGB(linRGB(st.col), linRGB('#232226'), 0.45);
    const c = cst(base, LY.PATCH, { g0: q.len, g1: q.wid, age: q.age || 0.5 });
    for (const pl of q.polys || []) {
      if (!pl || pl.length < 3) continue;
      const ca = Math.cos(q.a), sa = Math.sin(q.a);
      for (const p of pl) {
        const dx = p[0] - q.x, dy = p[1] - q.y;
        pv(p[0], Y_ROAD + 0.03, p[1], 0, 1, 0, dx * ca + dy * sa + q.len / 2, -dx * sa + dy * ca + q.wid / 2);
      }
      flush(B, c);
    }
  }

  /* ================================================================ terrain maps (resumable) */
  // Per chunk ONE ground map (RGBA): R grass, G paving (+ ~0.3 for compacted yards), B sand, A contact
  // AO (x baked sun shadows on phones). Samples sit on a (n + 2)^2 grid with a one-texel border, so the
  // 1-2-1 blur and the texel centres on the chunk edges match the neighbour chunk exactly (no seams).
  // Water comes from the core's aux texture (alpha), soil colour from one world-wide soil texture.
  const SCLS = new Uint8Array(16);
  function initCls() { const S = N.SURF; SCLS.fill(0); SCLS[S.GRASS] = 1; SCLS[S.PLAZA] = 2; SCLS[S.SAND] = 3; SCLS[S.SOLID] = 5; SCLS[S.ROCK] = 6; }
  function buildSurf(job, deadline) {
    const ch = job.ch, n = job.sn, m = n + 2, step = CHS / (n - 1), W = N.world;
    if (!job.cls) { job.cls = scratch('cls', Uint8Array, m * m); job.row = 0; initCls(); }
    const cls = job.cls;
    // read the 4 u surface grid directly (falls back to surfaceAt when the grid is not exposed)
    const grid = W.grid, GW = W.GW, GH = W.GH, C = N.CELL || 4, direct = grid && GW > 0 && grid.length === GW * GH;
    if (direct && !job.gi) { job.gi = new Int32Array(m); for (let i = 0; i < m; i++) { const gi = Math.floor((ch.x0 + (i - 1) * step) / C); job.gi[i] = gi >= 0 && gi < GW ? gi : -1; } }
    while (job.row < m) {
      const j = job.row++, y = ch.y0 + (j - 1) * step, o = j * m;
      if (direct) {
        const gj = Math.floor(y / C), gi = job.gi;
        if (gj < 0 || gj >= GH) cls.fill(0, o, o + m);
        else { const ro = gj * GW; for (let i = 0; i < m; i++) cls[o + i] = gi[i] < 0 ? 0 : SCLS[grid[ro + gi[i]] & 15]; }
      } else for (let i = 0; i < m; i++) cls[o + i] = SCLS[W.surfaceAt(ch.x0 + (i - 1) * step, y) & 15];
      if ((job.row & 31) === 0 && now() > deadline) return false;
    }
    if (!job.yard) {
      // compacted earth yards in front of houses (lawns are GRASS cells already)
      const yard = job.yard = scratch('yard', Uint8Array, m * m); yard.fill(0, 0, m * m);
      const gx0 = ch.x0 - step, gy0 = ch.y0 - step;
      W.queryStructures(gx0, gy0, ch.x0 + CHS + step, ch.y0 + CHS + step, (sv) => {
        if (sv.t !== 'bldg' || !sv.yard || sv.yard.lawn) return;
        const yd = sv.yard;
        const i0 = Math.max(0, Math.ceil((yd.x + 1 - gx0) / step)), i1 = Math.min(m - 1, Math.floor((yd.x + yd.w - 1 - gx0) / step));
        const j0 = Math.max(0, Math.ceil((yd.y + 1 - gy0) / step)), j1 = Math.min(m - 1, Math.floor((yd.y + yd.h - 1 - gy0) / step));
        for (let j = j0; j <= j1; j++) yard.fill(1, j * m + i0, j * m + i1 + 1);
      });
      job.shadow = I && I.Q.baked && I.sunBake ? bakeShadows(ch, m, step) : null;
      return false; // (resume next slice)
    }
    if (!job.surf) { job.surf = new Uint8Array(n * n * 4); job.brow = 0; }
    const out = job.surf, yard = job.yard, sh = job.shadow, acc = [0, 0, 0, 0, 0, 0, 0];
    const WT = [1, 2, 1];
    const shK = sh ? 0.34 * I.sunBake.strength + 0.05 : 0;
    while (job.brow < n) {
      const j = job.brow++;
      for (let i = 0; i < n; i++) {
        acc[0] = acc[1] = acc[2] = acc[3] = acc[4] = acc[5] = acc[6] = 0;
        let yw = 0;
        for (let dj = 0; dj < 3; dj++) {
          const r = (j + dj) * m + i, wj = WT[dj];
          acc[cls[r]] += wj; acc[cls[r + 1]] += wj * 2; acc[cls[r + 2]] += wj;
          yw += (yard[r] + yard[r + 1] * 2 + yard[r + 2]) * wj;
        }
        const o = (j * n + i) * 4;
        out[o] = acc[1] * 16 - (acc[1] >> 4);
        out[o + 1] = Math.max(acc[2] * 16 - (acc[2] >> 4), Math.round(yw * 5));
        out[o + 2] = acc[3] * 16 - (acc[3] >> 4);
        let ao = 1 - 0.42 * ((acc[5] + acc[6] * 0.5) / 16);
        if (sh) ao *= 1 - sh[(j + 1) * m + (i + 1)] * shK;
        out[o + 3] = Math.round(clamp(ao, 0, 1) * 255);
      }
      if ((job.brow & 15) === 0 && now() > deadline) return false;
    }
    return true;
  }
  /** fill a polygon on a grid with a scanline rule; set(i, j) per covered sample (x = gx0 + i * step) */
  function scanPoly(poly, gx0, gy0, step, m, set, mx) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of poly) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const j0 = Math.max(0, Math.ceil((y0 - gy0) / step)), j1 = Math.min(m - 1, Math.floor((y1 - gy0) / step));
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const y = gy0 + j * step;
      xs.length = 0;
      for (let k = 0, q = poly.length - 1; k < poly.length; q = k++) {
        const a = poly[q], b = poly[k];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      if (xs.length < 2) continue;
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] - gx0) / step)), i1 = Math.min((mx || m) - 1, Math.floor((xs[k + 1] - gx0) / step));
        for (let i = i0; i <= i1; i++) set(i, j);
      }
    }
  }
  /** one world-wide soil colour texture (32 u texels): district soil, maidans, rocky parks (shared) */
  const SOIL = { tex: null, cell: 32, nx: 0, ny: 0, ms: 0 };
  function buildSoil() {
    const t0 = now(), W = N.world, D = W.data, c = SOIL.cell;
    const nx = Math.max(2, Math.ceil(N.WORLD_W / c)), ny = Math.max(2, Math.ceil(N.WORLD_H / c));
    const data = new Uint8Array(nx * ny * 4);
    const cache = new Map();
    const put = (o, hex) => { let v = cache.get(hex); if (!v) { v = hexRGB(hex); cache.set(hex, v); } data[o] = v[0] * 255; data[o + 1] = v[1] * 255; data[o + 2] = v[2] * 255; data[o + 3] = 255; };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let d = null; try { d = W.districtAt((i + 0.5) * c, (j + 0.5) * c); } catch (e) { d = null; }
      put((j * nx + i) * 4, (d && d.ground) || '#a98a66');
    }
    for (const p of D.parks || []) {
      const hex = PARKSOIL[p.kind];
      if (!hex || !p.poly) continue;
      scanPoly(p.poly, c / 2, c / 2, c, ny, (i, j) => put((j * nx + i) * 4, hex), nx);
    }
    if (SOIL.tex) SOIL.tex.dispose();
    const t = new THREE.DataTexture(data, nx, ny, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; t.userData.shared = true;
    SOIL.tex = t; SOIL.t.value = t; SOIL.nx = nx; SOIL.ny = ny; SOIL.u.value.set(1 / (nx * c), 1 / (ny * c));
    SOIL.ms = Math.round((now() - t0) * 10) / 10;
  }
  /** phones: sun shadows of buildings / walls / trees rasterised on the tint grid (2D paintShadows rules) */
  function bakeShadows(ch, m, step) {
    const sb = I.sunBake, sx = sb.sx, sy = sb.sy;
    if (!sx && !sy) return null;
    const c = document.createElement('canvas'); c.width = c.height = m;
    const g = c.getContext('2d');
    g.setTransform(1 / step, 0, 0, 1 / step, -(ch.x0 - step) / step + 0.5, -(ch.y0 - step) / step + 0.5);
    g.fillStyle = '#fff'; g.beginPath();
    const M = 240;
    N.world.queryStructures(ch.x0 - M, ch.y0 - M, ch.x0 + CHS + M, ch.y0 + CHS + M, (s) => {
      if (s.t === 'bldg' || s.t === 'wall') {
        const h = s.t === 'bldg' && (s.roofType === 'gable' || s.roofType === 'hip') ? s.h + 4 : s.h;
        const ex = sx * h, ey = sy * h, X0 = s.x, Y0 = s.y, X1 = s.x + s.w, Y1 = s.y + s.d;
        g.moveTo(X0, Y0); g.lineTo(X1, Y0); g.lineTo(X1, Y1); g.lineTo(X0, Y1); g.closePath();
        g.moveTo(X0 + ex, Y0 + ey); g.lineTo(X1 + ex, Y0 + ey); g.lineTo(X1 + ex, Y1 + ey); g.lineTo(X0 + ex, Y1 + ey); g.closePath();
        // connecting hull between the footprint and its projection
        g.moveTo(X0, Y0); g.lineTo(X0 + ex, Y0 + ey); g.lineTo(X1 + ex, Y1 + ey); g.lineTo(X1, Y1); g.closePath();
        g.moveTo(X1, Y0); g.lineTo(X1 + ex, Y0 + ey); g.lineTo(X0 + ex, Y1 + ey); g.lineTo(X0, Y1); g.closePath();
      } else if (s.t === 'tree') {
        const h = s.h * 0.92, r = s.r * 0.82;
        g.moveTo(s.x + sx * h + r, s.y + sy * h); g.arc(s.x + sx * h, s.y + sy * h, r, 0, TAU); g.closePath();
      }
    });
    g.fill('nonzero');
    const d = g.getImageData(0, 0, m, m).data, out = new Float32Array(m * m);
    for (let i = 0; i < m * m; i++) out[i] = d[i * 4 + 3] / 255;
    return out;
  }

  /* ================================================================ shaders */
  const GLSL_NOISE = `
float ngH(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 ngH2(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float ngN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(ngH(i), ngH(i + vec2(1.0, 0.0)), f.x), mix(ngH(i + vec2(0.0, 1.0)), ngH(i + vec2(1.0, 1.0)), f.x), f.y); }
float ngF(vec2 p, float fw){ float k = smoothstep(0.3, 0.85, fw); return k > 0.999 ? 0.5 : mix(ngN(p), 0.5, k); }
float ngBand(float x, float c, float w, float fx){ return clamp((w - abs(x - c)) / max(fx, 1e-4) + 0.5, 0.0, 1.0); }
float ngDash(float u, float P, float on, float fu){
  float x = mod(u, P);
  float c = clamp(min(x, on - x) / max(fu, 1e-4) + 0.5, 0.0, 1.0);
  c = max(c, clamp((x - P) / max(fu, 1e-4) + 0.5, 0.0, 1.0));
  return mix(c, on / P, smoothstep(0.2, 0.55, fu / P));
}
float ngBlob(vec2 p, float prob, out float h){
  vec2 i = floor(p); h = ngH(i + 0.37);
  vec2 o = (ngH2(i + 3.1) - 0.5) * 0.4;
  float r = 0.16 + 0.2 * fract(h * 13.7);
  float d = length(fract(p) - 0.5 - o) / r;
  return h < prob ? 1.0 - smoothstep(0.55, 1.0, d) : 0.0;
}
`;
  // shared after-lighting water: reflection of the sky + sun glint (pothole puddles, rivers, wet roads)
  const GLSL_WATER = `
vec3 ngWaterCol(vec3 lit, vec3 P, vec3 nrm, float t, float deep){
  vec3 Vd = normalize(cameraPosition - P);
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(nrm, Vd), 0.0, 1.0), 4.0);
  vec3 Rf = reflect(-Vd, nrm);
  vec3 skyC = mix(uHor, uZen, clamp(Rf.y * 2.4 + 0.32, 0.0, 1.0)) * 0.82;
  float sd = max(dot(Rf, uSunDir), 0.0);
  float sp = pow(sd, 260.0) * 5.0 + pow(sd, 22.0) * 0.14;
  vec3 base = lit * mix(vec3(0.55, 0.62, 0.6), vec3(0.5, 0.78, 0.82), deep) + vec3(0.004, 0.02, 0.024) * deep;
  return mix(base, skyC, clamp(0.08 + fres * 0.62, 0.0, 0.66)) + sp * uSunCol;
}
`;
  const VERT_COMMON = 'varying vec3 vWP;\n';
  function commonUniforms(shader, ud) {
    const U = I.UNI;
    shader.uniforms.uNight = U.uNight; shader.uniforms.uTime = U.uTime; shader.uniforms.uSunDir = U.uSunDir;
    shader.uniforms.uSunCol = U.uSunCol; shader.uniforms.uZen = U.uZen; shader.uniforms.uHor = U.uHor;
    shader.uniforms.uWet = GU.uWet; shader.uniforms.uRain = GU.uRain;
    shader.uniforms.auxMap = ud.aux; shader.uniforms.tSurf = ud.surf; shader.uniforms.uOrigin = ud.origin; shader.uniforms.uSurfN = ud.surfN;
    shader.uniforms.tSoil = SOIL.t; shader.uniforms.uSoilK = SOIL.u;
  }
  const FRAG_PARS = `
uniform sampler2D auxMap;
uniform sampler2D tSurf;
uniform sampler2D tSoil;
uniform vec2 uSoilK;
uniform float uSurfN;
uniform vec2 uOrigin;
uniform float uNight;
uniform float uTime;
uniform float uWet;
uniform float uRain;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uZen;
uniform vec3 uHor;
varying vec3 vWP;
float ngWm = 0.0;
float ngShine = 0.0;
`;
  const GU = {}; // global uniforms owned here

  function terrainCompile(shader) {
    const ud = this.userData;
    commonUniforms(shader, ud);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_COMMON)
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS + GLSL_NOISE + GLSL_WATER)
      .replace('#include <map_fragment>', TERRAIN_MAP)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * texture2D(auxMap, vec2((vWP.x - uOrigin.x) / 512.0, 1.0 - (vWP.z - uOrigin.y) / 512.0)).rgb * (uNight * 3.0);')
      .replace('#include <envmap_fragment>', TERRAIN_ENV);
  }
  const TERRAIN_MAP = `
vec2 P = vWP.xz;
vec2 lp = (P - uOrigin) / 512.0;
vec2 suv = lp * ((uSurfN - 1.0) / uSurfN) + 0.5 / uSurfN;
vec4 sw = texture2D(tSurf, suv);
vec2 auv = vec2(lp.x, 1.0 - lp.y);
float fw = max(fwidth(P.x), fwidth(P.y)) + 1e-4;
float bn = ngN(P * 0.21) * 0.6 + ngN(P * 0.83) * 0.4 - 0.5;
float wGrass = smoothstep(0.4, 0.6, sw.r + bn * 0.55);
float wPave = smoothstep(0.44, 0.56, sw.g + bn * 0.1);
float wSand = smoothstep(0.38, 0.62, sw.b + bn * 0.5);
ngWm = smoothstep(0.4, 0.6, texture2D(auxMap, auv).a + bn * 0.3);
float shore = (texture2D(auxMap, auv + vec2(0.014, 0.0)).a + texture2D(auxMap, auv - vec2(0.014, 0.0)).a + texture2D(auxMap, auv + vec2(0.0, 0.014)).a + texture2D(auxMap, auv - vec2(0.0, 0.014)).a) * 0.25;
vec3 soil = pow(texture2D(tSoil, P * uSoilK).rgb, vec3(2.2));
soil *= 1.0 + 0.22 * clamp(sw.g * 2.4, 0.0, 1.0) * (1.0 - wPave);   // compacted yards: lighter
float n1 = ngF(P * 0.043, fw * 0.043), n2 = ngF(P * 0.21, fw * 0.21), n3 = ngF(P * 1.07, fw * 1.07);
#ifdef NG_LOW
float n4 = 0.5;
#else
float n4 = ngF(P * 4.3, fw * 4.3);
#endif
vec3 dirt = soil * (0.84 + 0.32 * (n1 - 0.5) + 0.2 * (n2 - 0.5) + 0.16 * (n3 - 0.5) + 0.12 * (n4 - 0.5));
dirt *= mix(vec3(1.0), vec3(1.13, 0.92, 0.82), smoothstep(0.45, 0.85, ngN(P * 0.011 + 3.7)));
float ph = 0.0;
#ifndef NG_LOW
float pb = ngBlob(P * 1.5, 0.2, ph) * (1.0 - smoothstep(0.12, 0.4, fw * 1.5));
dirt = mix(dirt, soil * vec3(0.62, 0.6, 0.58) * (0.55 + 0.9 * ph), pb * 0.8);
#endif
vec3 grassA = vec3(0.075, 0.15, 0.03), grassB = vec3(0.2, 0.21, 0.07);
float g1 = ngF(P * 0.05, fw * 0.05), g2 = ngF(P * 0.33, fw * 0.33), g3 = ngF(P * 2.1, fw * 2.1);
vec3 grass = mix(grassA, grassB, smoothstep(0.3, 0.8, g1)) * (0.8 + 0.4 * g2) * (0.78 + 0.44 * g3) * (0.86 + 0.28 * n4);
float wornG = smoothstep(0.66, 0.8, ngN(P * 0.07 + 11.0) * 0.75 + g2 * 0.25);
grass = mix(grass, dirt * 0.92, wornG * 0.8);
vec2 tq = P / 3.2; float trow = floor(tq.y); tq.x += 0.5 * mod(trow, 2.0);
vec2 tid = floor(tq), tf = fract(tq); vec2 tfw = fwidth(tq);
float th = ngH(tid + vec2(0.37 * trow, 5.1));
vec3 stone = vec3(0.47, 0.40, 0.31) * (0.82 + 0.28 * th) * (0.9 + 0.2 * n3) * (0.94 + 0.12 * n4);
float gd = min(min(tf.x, 1.0 - tf.x), min(tf.y, 1.0 - tf.y));
float tw = max(tfw.x, tfw.y);
float grout = 1.0 - smoothstep(0.03, 0.03 + tw * 1.2, gd);
grout = mix(grout, 0.14, smoothstep(0.15, 0.45, tw));
stone *= 1.0 - 0.42 * grout;
stone = mix(stone, soil * 0.9, smoothstep(0.7, 0.9, ngN(P * 0.09 + 2.0)) * 0.35);
vec3 sandC = vec3(0.46, 0.37, 0.23) * (0.86 + 0.26 * (n2 - 0.5) + 0.12 * (n4 - 0.5));
float rip = sin(dot(P, vec2(0.92, 0.51)) * 1.3 + ngN(P * 0.17) * 6.0);
sandC *= 1.0 + 0.07 * rip * (1.0 - smoothstep(0.15, 0.5, fw));
float wetS = smoothstep(0.04, 0.35, shore);
sandC *= mix(1.0, 0.6, wetS);
dirt *= mix(1.0, 0.72, smoothstep(0.08, 0.4, shore));
vec3 col = dirt;
col = mix(col, grass, wGrass);
col = mix(col, sandC, wSand);
col = mix(col, stone, wPave);
col *= sw.a;
col *= 1.0 - uWet * 0.28 * (1.0 - wGrass * 0.5);
diffuseColor.rgb = col;
ngShine = wetS * wSand * 0.35 + uWet * 0.18 * (1.0 - wGrass);
`;
  const TERRAIN_ENV = `
#include <envmap_fragment>
if (ngWm > 0.003) {
  vec2 p = vWP.xz; float t = uTime;
  vec2 q = p + vec2(ngN(p * 0.021 + t * 0.03), ngN(p * 0.019 - t * 0.025)) * 40.0;
  float n1 = sin(q.x * 0.090 + q.y * 0.050 + t * 1.25) + sin(q.x * -0.060 + q.y * 0.115 + t * 0.95) + (ngN(q * 0.08 + t * 0.2) - 0.5) * 1.6;
  float n2 = sin(q.x * 0.210 - q.y * 0.170 + t * 2.10) + sin(q.x * 0.150 + q.y * 0.260 - t * 1.70) + (ngN(q * 0.23 - t * 0.3) - 0.5) * 1.4;
  vec3 nrm = normalize(vec3(n1 * 0.05 + n2 * 0.03, 1.0, n2 * 0.045 - n1 * 0.025));
  vec3 wc = ngWaterCol(outgoingLight, vWP, nrm, t, 1.0);
  float glint = smoothstep(0.82, 1.0, sin(p.x * 0.7 + t * 2.3) * sin(p.y * 0.63 - t * 1.9)) * 0.25;
  wc += glint * uSunCol * 0.3;
  // foam / wet line where water meets the bank
  float edge = 1.0 - smoothstep(0.0, 0.22, abs(ngWm - 0.5));
  float foam = edge * smoothstep(0.45, 0.75, ngN(p * 0.6 + vec2(t * 0.4, -t * 0.3))) * (1.0 - uNight * 0.7);
  wc = mix(wc, vec3(0.62, 0.64, 0.6) * (0.4 + 0.6 * (1.0 - uNight)), foam * 0.5);
  outgoingLight = mix(outgoingLight, wc, ngWm);
}
if (ngShine > 0.01) {
  vec3 Vd = normalize(cameraPosition - vWP);
  float fres = pow(1.0 - clamp(Vd.y, 0.0, 1.0), 5.0);
  vec3 Rf = reflect(-Vd, vec3(0.0, 1.0, 0.0));
  vec3 skyC = mix(uHor, uZen, clamp(Rf.y * 2.4 + 0.32, 0.0, 1.0)) * 0.7;
  outgoingLight = mix(outgoingLight, skyC, clamp(fres * ngShine, 0.0, 0.5));
}
`;

  function roadCompile(shader) {
    const ud = this.userData;
    commonUniforms(shader, ud);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_COMMON + 'attribute vec2 aRd;\nattribute vec4 aGeo;\nattribute vec4 aMk;\nattribute vec4 aSt;\nvarying vec2 vRd;\nvarying vec4 vGeo;\nvarying vec4 vMk;\nvarying vec4 vSt;\n')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n\tvRd = aRd; vGeo = aGeo; vMk = aMk; vSt = aSt;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS + 'varying vec2 vRd;\nvarying vec4 vGeo;\nvarying vec4 vMk;\nvarying vec4 vSt;\n' + GLSL_NOISE + GLSL_WATER + ROAD_FUNCS)
      .replace('#include <map_fragment>', ROAD_MAP)
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * texture2D(auxMap, vec2((vWP.x - uOrigin.x) / 512.0, 1.0 - (vWP.z - uOrigin.y) / 512.0)).rgb * (uNight * 3.0);')
      .replace('#include <envmap_fragment>', ROAD_ENV);
  }
  const ROAD_FUNCS = `
// distance to the nearest cell border of a jittered grid (0 on the border): block / alligator cracks
float ngCell2(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + ngH2(i + g) * 0.8 + 0.1 - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
float ngBit(float bits, float b){ return mod(floor(floor(bits + 0.5) / b + 0.001), 2.0); } // bits arrive interpolated (7.9999)
vec3 ngAsphalt(vec2 P, vec3 base, float age, float fw){
  float g = 0.0;
  g += (ngF(P * 0.055, fw * 0.055) - 0.5) * (0.22 + 0.3 * age);
  g += (ngF(P * 0.33, fw * 0.33) - 0.5) * 0.16;
  g += (ngF(P * 1.7, fw * 1.7) - 0.5) * 0.15;
#ifndef NG_LOW
  g += (ngF(P * 5.9, fw * 5.9) - 0.5) * 0.2;
  // aggregate stones: small round chips (lighter quartz, darker basalt), gone before they could alias
  float sh = 0.0;
  float sp = ngBlob(P * 2.7, 0.55, sh) * (1.0 - smoothstep(0.035, 0.11, fw));
  g += sp * (sh < 0.2 ? 0.26 : -0.13);
#endif
  return base * (1.0 + g);
}
`;
  const ROAD_MAP = `
vec2 P = vWP.xz;
float fw = max(fwidth(P.x), fwidth(P.y)) + 1e-4;
float layer = floor(vSt.x + 0.5);
float age = vSt.z;
vec3 base = vColor.rgb;
vec3 col = base;
vec4 tn = texture2D(tSurf, (P - uOrigin) / 512.0 * ((uSurfN - 1.0) / uSurfN) + 0.5 / uSurfN);
ngWm = 0.0; ngShine = 0.0;
if (layer < 1.5) {
  col = ngAsphalt(P, base, age, fw);
  float u = vRd.x, v = vRd.y, av = abs(v);
  float L = vGeo.x, hw = vGeo.y;
  float cA = vMk.x, cB = vMk.y, med = vMk.z, bits = vMk.w;
  float uA = u, uB = L - u;
  // oil stains (single-cell blobs, mostly along the lanes)
  float sh = 0.0;
  float stn = ngBlob(P * 0.31, 0.16 + 0.1 * age, sh) * (1.0 - smoothstep(0.5, 1.5, fw));
  col *= 1.0 - stn * (0.25 + 0.25 * fract(sh * 7.0));
  if (layer < 0.5) {
    float fu = max(fwidth(u), 1e-4), fv = max(fwidth(v), 1e-4);
    float endF = smoothstep(cA, cA + 12.0, uA) * smoothstep(cB, cB + 12.0, uB);
    // tyre-worn tracks: two wheel paths per lane (darker, a little polished)
    float tr = 0.0;
    if (ngBit(bits, 8.0) > 0.5) {
      tr = exp(-pow((av - 2.7) / 1.0, 2.0));
    } else {
      float lanes = hw - med > 20.0 ? 2.0 : 1.0;
      float lw = (hw - med) / lanes;
      float lc = (fract((av - med) / lw) - 0.5) * lw;
      float dd = abs(abs(lc) - 2.8);
      tr = exp(-dd * dd / 1.1) + 0.45 * exp(-lc * lc / 0.5);
    }
    tr *= (0.65 + 0.7 * ngF(vec2(u * 0.045, v * 0.6), fw * 0.05)) * endF * vSt.y;
    col *= 1.0 - 0.2 * tr;
    // dusty, crumbling edges on old roads
    float sandy = smoothstep(0.42, 0.85, age);
    float en = ngF(P * 0.45, fw * 0.45) * 1.8 + ngF(P * 1.9, fw * 1.9) * 0.9;
    float edge = smoothstep(hw - 1.2 - 2.4 * sandy - en * (0.4 + sandy), hw - 0.2, av);
    col = mix(col, vec3(0.31, 0.24, 0.15) * (0.8 + 0.4 * en / 2.7), edge * (0.25 + 0.65 * sandy));
    // hairline cracks on older surfaces: block / alligator patterns in patches, wobbly, ~1 px wide
#ifndef NG_LOW
    float cmask = smoothstep(0.52, 0.7, ngN(P * 0.021 + 7.0) + age * 0.25) * (1.0 - smoothstep(0.05, 0.16, fw)) * smoothstep(0.25, 0.55, age);
    if (cmask > 0.001) {
      vec2 cp = P * 0.33 + (vec2(ngN(P * 1.3), ngN(P * 1.3 + 9.0)) - 0.5) * 0.22;
      float e = ngCell2(cp);
      float ew = fwidth(e);
      float crack = 1.0 - smoothstep(0.012, 0.012 + ew * 1.4, e);
      crack *= 0.55 + 0.45 * ngN(P * 0.9 + 3.0);
      col *= 1.0 - crack * 0.55 * cmask;
    }
#endif
    // markings (white paint), all from (u, v) with analytic AA
    float zA = vGeo.z, zB = vGeo.w;
    float clrA = max(cA + 2.0, zA > 0.0 ? zA + 9.0 : 0.0), clrB = max(cB + 2.0, zB > 0.0 ? zB + 9.0 : 0.0);
    float mid = clamp((uA - clrA) / fu + 0.5, 0.0, 1.0) * clamp((uB - clrB) / fu + 0.5, 0.0, 1.0);
    float midE = clamp((uA - cA - 0.6) / fu + 0.5, 0.0, 1.0) * clamp((uB - cB - 0.6) / fu + 0.5, 0.0, 1.0);
    float m = 0.0;
    if (ngBit(bits, 1.0) > 0.5) m = max(m, ngBand(v, 0.0, 0.42, fv) * ngDash(uA - clrA, 17.0, 8.0, fu) * mid);
    if (ngBit(bits, 2.0) > 0.5) m = max(m, ngBand(av, med + (hw - med) * 0.5, 0.36, fv) * ngDash(uA - clrA, 20.0, 9.0, fu) * mid);
    if (ngBit(bits, 4.0) > 0.5) m = max(m, ngBand(av, hw - 1.3, 0.3, fv) * midE);
    // zebra crossings (2D: 8 long, stripes 2.4 wide every 4.5 from -hw + 3) + stop lines (inbound half)
    float zx = v + hw - 3.0;
    float zk = floor(zx / 4.5);
    float zs = ngDash(zx, 4.5, 2.4, fv) * step(0.0, zx) * step(-hw + 3.0 + 4.5 * zk, hw - 4.0 + 0.001);
    if (zA > 0.0) {
      m = max(m, ngBand(uA, zA, 4.0, fu) * zs);
      m = max(m, ngBand(uA, zA + 5.7, 0.6, fu) * clamp((v - max(med, 0.4)) / fv + 0.5, 0.0, 1.0) * clamp((hw - 0.8 - v) / fv + 0.5, 0.0, 1.0));
    }
    if (zB > 0.0) {
      m = max(m, ngBand(uB, zB, 4.0, fu) * zs);
      m = max(m, ngBand(uB, zB + 5.7, 0.6, fu) * clamp((-v - max(med, 0.4)) / fv + 0.5, 0.0, 1.0) * clamp((hw - 0.8 + v) / fv + 0.5, 0.0, 1.0));
    }
    float paintWear = mix(1.0, smoothstep(0.2, 0.62, ngF(P * 0.8, fw * 0.8) * 0.7 + ngF(P * 3.1, fw * 3.1) * 0.3), 0.25 + 0.55 * age);
    col = mix(col, vec3(0.80, 0.79, 0.74), m * paintWear * 0.94);
  } else {
    // junction box: worn evenly, a little lighter where traffic polishes it
    col *= 1.0 + 0.05 * (ngF(P * 0.12, fw * 0.12) - 0.5);
  }
  // potholes: broken rim, gravel floor, rainwater
  float pot = vSt.w;
  float wet = step(1.5, pot);
  float pd = pot - 2.0 * wet;
  if (pd > 0.001) {
    float gr = ngF(P * 3.4, fw * 3.4);
    float rim = smoothstep(0.0, 0.25, pd) * (1.0 - smoothstep(0.45, 0.75, pd));
    col *= 1.0 - 0.45 * rim * (0.6 + 0.6 * ngF(P * 2.0, fw * 2.0));
    vec3 gravel = vec3(0.13, 0.115, 0.1) * (0.55 + 0.9 * gr) + vec3(0.06, 0.04, 0.02) * step(0.8, ngH(floor(P * 6.0)));
    col = mix(col, gravel, smoothstep(0.35, 0.7, pd));
    if (wet > 0.5) ngWm = smoothstep(0.55, 0.7, pd + (ngF(P * 1.3, fw * 1.3) - 0.5) * 0.15);
  }
  ngShine = uWet * (0.45 + 0.4 * smoothstep(0.55, 0.75, ngN(P * 0.09 + 21.0)));
  // rain: standing water in shallow dips and along the gutters (kerbside)
  if (uWet > 0.05) {
    float pud = smoothstep(0.64, 0.72, ngN(P * 0.06 + 5.0) * 0.7 + ngN(P * 0.31 + 2.0) * 0.3);
    if (layer < 0.5) pud = max(pud, smoothstep(vGeo.y - 2.6, vGeo.y - 0.6, abs(vRd.y)) * smoothstep(0.45, 0.6, ngN(P * 0.17 + 8.0)));
    ngWm = max(ngWm, pud * smoothstep(0.3, 0.9, uWet) * 0.9);
  }
} else if (layer < 2.5) {
  // footpath slabs (u along the road, v across)
  vec2 q = vRd / vec2(3.0, 2.4);
  float row = floor(q.y); q.x += 0.5 * mod(row, 2.0);
  vec2 id = floor(q), f = fract(q), fq = fwidth(q);
  float th = ngH(id + vec2(row * 3.7, 1.3));
  col = base * (0.82 + 0.28 * th) * (0.9 + 0.2 * ngF(P * 1.3, fw * 1.3));
#ifndef NG_LOW
  col *= 0.92 + 0.16 * ngF(P * 6.0, fw * 6.0);
#endif
  float gd = min(min(f.x, 1.0 - f.x) / max(fq.x, 1e-4), min(f.y, 1.0 - f.y) / max(fq.y, 1e-4));
  float gw = 0.035 / max(max(fq.x, fq.y), 1e-4);
  float grout = 1.0 - clamp(gd - gw + 0.5, 0.0, 1.0);
  grout = mix(grout, 0.16, smoothstep(0.12, 0.4, max(fq.x, fq.y)));
  col *= 1.0 - 0.38 * grout;
  // broken / missing slabs and dirt along the back edge
  float broken = step(0.94, th);
  col = mix(col, pow(texture2D(tSoil, P * uSoilK).rgb, vec3(2.2)) * vec3(0.8, 0.72, 0.62), broken * 0.7);
  col = mix(col, vec3(0.28, 0.22, 0.15), smoothstep(vGeo.y - 1.6, vGeo.y, vRd.y) * 0.35 * (0.5 + ngF(P * 0.7, fw * 0.7)));
  ngShine = uWet * 0.3;
} else if (layer < 3.5) {
  // kerb stones: concrete, or black + yellow paint in 5 u blocks
  float fu = max(fwidth(vRd.x), 1e-4);
  vec3 conc = base * (0.84 + 0.24 * ngF(P * 1.1, fw * 1.1));
  if (vSt.y > 0.5) {
    float y = ngDash(vRd.x, 10.0, 5.0, fu);
    vec3 paintC = mix(vec3(0.016, 0.016, 0.018), vec3(0.76, 0.5, 0.03), y);
    float chip = smoothstep(0.66, 0.8, ngF(P * 1.7 + vRd.yy * 3.0, fw * 1.7)) * age;
    col = mix(paintC, conc, chip * 0.8);
  } else col = conc;
  col *= 1.0 - 0.12 * smoothstep(0.4, 0.0, vRd.y) * step(vRd.y, 0.15);
  ngShine = uWet * 0.2;
} else if (layer < 4.5) {
  // median top: dusty soil with a few grass tufts
  float g = ngF(P * 0.9, fw * 0.9), g2 = ngF(P * 3.3, fw * 3.3);
  col = mix(base * (0.8 + 0.4 * g), vec3(0.09, 0.15, 0.04) * (0.7 + 0.6 * g2), smoothstep(0.5, 0.75, g * 0.6 + g2 * 0.4));
} else if (layer < 5.5) {
  float wn = ngF(P * 1.2, fw * 1.2);
  col = mix(vec3(0.2, 0.19, 0.18), base, smoothstep(0.25, 0.5, wn + 0.3 - age * 0.3));
} else if (layer < 6.5) {
  // tar patch: fresher, darker asphalt with a seam
  col = ngAsphalt(P, base, 0.1, fw);
  vec2 e2 = min(vRd, vGeo.xy - vRd);
  float ed = min(e2.x, e2.y);
  float seam = 1.0 - clamp((ed - 0.18) / max(fw, 1e-4) + 0.5, 0.0, 1.0);
  col *= 1.0 - 0.22 * seam * (1.0 - smoothstep(0.1, 0.4, fw));
  // older patches weather towards the road colour
  col = mix(col, base * 1.35, age * 0.5);
  ngShine = uWet * 0.6;
} else if (layer < 7.5) {
  // railway ballast + sleepers
  float fu = max(fwidth(vRd.x), 1e-4), fv = max(fwidth(vRd.y), 1e-4);
  float st = ngF(P * 2.4, fw * 2.4), st2 = ngF(P * 6.0, fw * 6.0);
  col = base * (0.6 + 0.55 * st) * (0.85 + 0.3 * st2);
  float sl = ngDash(vRd.x, 5.5, 1.3, fu) * ngBand(vRd.y, 0.0, 6.0, fv);
  col = mix(col, vec3(0.13, 0.1, 0.075) * (0.8 + 0.4 * st), sl);
  col *= 1.0 - 0.25 * smoothstep(vGeo.y - 2.0, vGeo.y, abs(vRd.y));
} else if (layer < 8.5) {
  // dirt / brick path
  float g = ngF(P * 0.7, fw * 0.7), g2 = ngF(P * 3.7, fw * 3.7);
  col = base * (0.82 + 0.3 * g) * (0.9 + 0.2 * g2);
  col = mix(col, base * 0.7, smoothstep(vGeo.y - 2.0, vGeo.y, abs(vRd.y)) * 0.5);
} else if (layer < 10.5) {
  col = base * (0.86 + 0.22 * ngF(P * 1.3, fw * 1.3)) * (0.95 + 0.1 * ngF(P * 5.0, fw * 5.0));
} else {
  col = base * (0.75 + 0.5 * ngF(P * 2.2 + vWP.y, fw * 2.2));
}
col *= mix(1.0, tn.a, layer < 2.5 ? 1.0 : 0.5);
col *= 1.0 - uWet * (layer < 1.5 ? 0.42 : 0.25);
diffuseColor.rgb = col;
`;
  const ROAD_ENV = `
#include <envmap_fragment>
if (ngWm > 0.003) {
  float t = uTime;
  vec2 p = vWP.xz;
  vec3 nrm = vec3(0.0, 1.0, 0.0);
  if (uRain > 0.01) {
    // rain rings on the puddle
    vec2 cell = floor(p * 1.4); vec2 fp = fract(p * 1.4) - 0.5;
    float h = ngH(cell);
    float ph = fract(t * 0.9 + h);
    float d = length(fp - (ngH2(cell) - 0.5) * 0.5);
    float ring = (1.0 - smoothstep(0.0, 0.06, abs(d - ph * 0.45))) * (1.0 - ph) * uRain;
    nrm = normalize(vec3((fp.x) * ring * 2.0, 1.0, (fp.y) * ring * 2.0));
  }
  vec3 wc = ngWaterCol(outgoingLight * 0.6, vWP, nrm, t, 0.3);
  outgoingLight = mix(outgoingLight, wc, ngWm);
}
if (ngShine > 0.01) {
  vec3 Vd = normalize(cameraPosition - vWP);
  float fres = 0.05 + 0.95 * pow(1.0 - clamp(Vd.y, 0.0, 1.0), 5.0);
  vec3 Rf = reflect(-Vd, vec3(0.0, 1.0, 0.0));
  vec3 skyC = mix(uHor, uZen, clamp(Rf.y * 2.4 + 0.32, 0.0, 1.0)) * 0.75;
  float sd = max(dot(Rf, uSunDir), 0.0);
  outgoingLight = mix(outgoingLight, skyC, clamp(fres * ngShine, 0.0, 0.6)) + uSunCol * pow(sd, 90.0) * 0.6 * ngShine;
}
`;

  /* ================================================================ materials */
  function matUD(m, ch, G) {
    m.userData.surf = { value: G.surfTex }; m.userData.aux = { value: ch.aux };
    m.userData.origin = { value: new THREE.Vector2(ch.x0, ch.y0) };
    m.userData.surfN = { value: G.sn || SURF_N };
    m.extensions = { derivatives: true };
    if (lowTier()) m.defines = { NG_LOW: 1 };
  }
  function newTerrainMat(ch, G) {
    const m = new THREE.MeshLambertMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
    matUD(m, ch, G);
    m.onBeforeCompile = terrainCompile;
    m.customProgramCacheKey = () => 'ng-terrain' + (lowTier() ? '-low' : '');
    return m;
  }
  function newRoadMat(ch, G) {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    matUD(m, ch, G);
    m.onBeforeCompile = roadCompile;
    m.customProgramCacheKey = () => 'ng-road' + (lowTier() ? '-low' : '');
    return m;
  }
  const lowTier = () => !!(I && I.Q.tier === 'low');
  function dataTex(data, n, mip) {
    const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.generateMipmaps = !!mip;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  }

  /* ================================================================ chunk jobs (provider) */
  const STATS = { built: 0, ms: 0, lastMs: 0, tris: 0, roadsRebuilt: 0 };
  const STEPMS = []; // cumulative ms per job step: analyse, aux, surface, tint, roads, upload
  const curPot = () => { const PH = N.world && N.world.potholes; return PH && PH.version != null ? PH.version : 0; };
  const SIGBUF = [];
  /** signature of the potholes (+ wetness) in a chunk: roads are rebuilt only when it changes */
  function potSig(ch) {
    const PH = N.world && N.world.potholes;
    if (!PH || !PH.query) return 0;
    SIGBUF.length = 0;
    let l;
    try { l = PH.query(ch.x0 - 12, ch.y0 - 12, ch.x0 + CHS + 12, ch.y0 + CHS + 12, SIGBUF); } catch (e) { return 0; }
    let h = 0;
    for (const p of l) h = (Math.imul(h, 31) + p.id * 2 + (p.wet ? 1 : 0)) | 0;
    return h ^ (l.length << 22);
  }
  function chunkBucket(ch) { return NET.buckets.get(bkey(ch.ci, ch.cj)) || null; }
  let SHARED_RB = null, ACTIVE = null;
  const SCR = new Map();
  /** scratch typed array reused across jobs (jobs are serialised) */
  function scratch(name, Ctor, n) {
    let a = SCR.get(name);
    if (!a || a.length < n) { a = new Ctor(n); SCR.set(name, a); }
    return a;
  }
  /** what: 'all' | 'roads' (pothole / weather changes) | 'map' (phones: the baked sun moved) */
  function startJob(ch, what, lod) {
    const B = SHARED_RB ? SHARED_RB.reset(ch.x0, ch.y0) : (SHARED_RB = new RB(ch.x0, ch.y0));
    return { ch, what, step: what === 'roads' ? 3 : 0, B, bucket: null, pots: [], t: 0, potVer: curPot(), potSig: potSig(ch), lod, sn: lod ? SURF_N / 2 : SURF_N };
  }
  // shared terrain plane (one per chunk size; vUv as the core's ground plane for the aux texture)
  let PLANE = null;
  function stepJob(job, deadline) {
    const ch = job.ch;
    const t0 = now();
    try {
      while (job.step < 6) {
        const ts = now();
        const st0 = job.step;
        switch (job.step) {
          case 0: if (!NET.built && !analyzeStep(deadline)) break; if (!SOIL.tex) buildSoil(); job.step = 1; break;
          case 1: if (!ch.aux) I.buildAux(ch); job.step = 2; break;
          case 2: if (buildSurf(job, deadline)) job.step = job.what === 'map' ? 4 : 3; break;
          case 3: job.bucket = job.bucket || chunkBucket(ch); if (roadsJob(job, deadline)) job.step = 4; break;
          case 4: finishJob(job); job.step = 6; break;
          default: job.step = 6;
        }
        STEPMS[st0] = (STEPMS[st0] || 0) + now() - ts;
        if (now() > deadline && job.step < 6) break;
      }
    } catch (e) {
      N.err('view3d.ground.chunk', e);
      job.step = 6; job.failed = true;
      finishJob(job, true);
    }
    job.t += now() - t0;
    return job.step >= 6;
  }
  function finishJob(job, failed) {
    const ch = job.ch, G = ch.ng || (ch.ng = {});
    if (!failed) {
      // ground map + terrain plane (kept when only the roads are rebuilt; refreshed in place on a re-bake)
      if (job.surf) {
        if (job.what === 'map' && G.surfTex && G.surfTex.image.data.length === job.surf.length) { G.surfTex.image.data.set(job.surf); G.surfTex.needsUpdate = true; }
        else {
          if (G.terrain) { ch.group.remove(G.terrain); G.terrain.material.dispose(); G.terrain = null; }
          if (G.surfTex) G.surfTex.dispose();
          G.surfTex = dataTex(job.surf, job.sn, true); G.sn = job.sn;
          if (!PLANE) { PLANE = new THREE.PlaneGeometry(CHS, CHS, 1, 1); PLANE.rotateX(-Math.PI / 2); PLANE.translate(CHS / 2, 0, CHS / 2); PLANE.userData.shared = true; }
          const tm = new THREE.Mesh(PLANE, newTerrainMat(ch, G));
          tm.name = 'ground-terrain'; tm.receiveShadow = true; tm.matrixAutoUpdate = false; tm.updateMatrix(); tm.renderOrder = 2;
          G.terrain = tm; ch.group.add(tm);
          if (G.road) G.road.material.userData.surf.value = G.surfTex;
          try { I.E.renderer.initTexture(G.surfTex); } catch (e) { /* uploaded on first draw */ }
        }
      }
      if (job.what !== 'map') {
        const geo = job.B.build();
        if (G.road) { ch.group.remove(G.road); G.road.geometry.dispose(); G.road.material.dispose(); G.road = null; }
        if (geo) {
          const rm = new THREE.Mesh(geo, newRoadMat(ch, G));
          rm.name = 'ground-roads'; rm.receiveShadow = true; rm.castShadow = false; rm.matrixAutoUpdate = false; rm.updateMatrix(); rm.renderOrder = 1;
          G.road = rm; ch.group.add(rm);
          G.tris = geo.index.count / 3;
        } else G.tris = 0;
        G.raised = buildRaisedIndex(job.B.raised, ch);
        G.pots = new Set(job.pots);
        G.potVer = job.potVer; G.potSig = job.potSig; G.potDirty = false;
      }
      G.lod = job.lod;
    }
    G.ready = true; G.sunKey = I.sunBake ? I.sunBake.key : ''; G.dirty = false;
    if (failed) { G.potSig = job.potSig; G.potDirty = false; }
    ch.groundRes = Math.max(I.Q.groundHi || 1, 1); ch.groundStale = false;
    STATS.built++; STATS.lastMs = job.t; STATS.ms += job.t;
    G.job = null;
  }
  function disposeChunk(ch) {
    const G = ch.ng;
    if (ACTIVE && ACTIVE.ch === ch) ACTIVE = null;
    if (!G) return;
    if (G.terrain) { ch.group.remove(G.terrain); G.terrain.material.dispose(); }
    if (G.road) { ch.group.remove(G.road); G.road.geometry.dispose(); G.road.material.dispose(); }
    if (G.surfTex) G.surfTex.dispose();
    ch.ng = null;
  }
  /** 32 u cell index of raised footprints for groundHeightAt */
  function buildRaisedIndex(list, ch) {
    if (!list.length) return null;
    const cells = new Array(16 * 16);
    for (const r of list) {
      const i0 = clamp(Math.floor((r.bb[0] - ch.x0) / 32), 0, 15), i1 = clamp(Math.floor((r.bb[2] - ch.x0) / 32), 0, 15);
      const j0 = clamp(Math.floor((r.bb[1] - ch.y0) / 32), 0, 15), j1 = clamp(Math.floor((r.bb[3] - ch.y0) / 32), 0, 15);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (cells[j * 16 + i] || (cells[j * 16 + i] = [])).push(r);
    }
    return cells;
  }
  function inConvex(pts, x, y) {
    let sg = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (Math.abs(c) < 1e-9) continue;
      const s = c > 0 ? 1 : -1;
      if (!sg) sg = s; else if (s !== sg) return false;
    }
    return true;
  }

  /* ================================================================ height queries */
  function chunkAt(x, y) {
    if (!I) return null;
    return I.chunks.get(bkey(Math.floor(x / CHS), Math.floor(y / CHS))) || null;
  }
  function raisedAt(x, y) {
    const ch = chunkAt(x, y);
    const G = ch && ch.ng;
    if (!G || !G.raised) return 0;
    const i = Math.floor((x - ch.x0) / 32), j = Math.floor((y - ch.y0) / 32);
    if (i < 0 || j < 0 || i > 15 || j > 15) return 0;
    const l = G.raised[j * 16 + i];
    if (!l) return 0;
    let h = 0;
    for (const r of l) {
      if (r.h <= h || x < r.bb[0] || x > r.bb[2] || y < r.bb[1] || y > r.bb[3]) continue;
      if (inConvex(r.pts, x, y)) h = r.h;
    }
    return h;
  }
  /** visible pothole dip at (x, y) (negative), only for potholes the 3D road mesh shows */
  function potholeDip(x, y) {
    const W = N.world;
    if (!W || !W.potholeAt) return 0;
    const p = W.potholeAt(x, y);
    if (!p) return 0;
    const ch = chunkAt(p.x, p.y), G = ch && ch.ng;
    if (!G || !G.pots || !G.pots.has(p)) return 0;
    return -potFrac(p, x, y) * potShape(p).dip;
  }
  function groundHeightAt(x, y) {
    if (!provider.enabled || !I || !isFinite(x) || !isFinite(y)) return 0;
    const r = raisedAt(x, y);
    if (r > 0) return r;
    return potholeDip(x, y);
  }
  function entityHeight(x, y, e) {
    if (e && e.kind === 'vehicle' && isFinite(e.angle)) {
      const T = e.T || {}, len = T.w || T.len || (e.r ? e.r * 2.6 : 14); // vehicles.js: w = length along the heading
      const c = Math.cos(e.angle) * len * 0.36, s = Math.sin(e.angle) * len * 0.36;
      return (groundHeightAt(x + c, y + s) + groundHeightAt(x - c, y - s)) * 0.5;
    }
    return groundHeightAt(x, y);
  }

  /* ================================================================ provider (view3d.js hook) */
  // LOD: chunks near the focus get the full ground (2 u surface texels, kerb detail, pothole dips);
  // far chunks a cheaper one (4 u texels, plain kerbs); downgrades wait for hysteresis (core rule)
  function lodFor(G, d) {
    const near = (I.Q.nearDist || 600) + 120;
    if (d == null) return G && G.lod != null ? G.lod : 0;
    if (G && G.ready && G.lod === 0 && d < near * 1.8) return 0;
    return d < near ? 0 : 1;
  }
  const lodChange = (G, d) => G.ready && G.lod !== lodFor(G, d);
  const provider = {
    enabled: true,
    attach(internals) {
      I = internals; THREE = I.THREE;
      NET.built = false;
      GU.uWet = { value: 0 }; GU.uRain = { value: 0 };
      SOIL.u = { value: new THREE.Vector2(1, 1) }; SOIL.t = { value: null };
    },
    need(ch, d, pass) {
      if (ch.ground || ch.groundTex) I.dropPainted(ch);
      const G = ch.ng;
      if (ch.groundStale) {
        ch.groundStale = false;
        // only the low tier's baked sun shadows depend on the painter's inputs
        if (G && G.ready && I.Q.baked && I.sunBake && G.sunKey !== I.sunBake.key) G.resun = true;
      }
      if (!G || !G.ready) return true;
      if (G.job) return true;
      if (G.potDirty || G.resun || G.dirty || lodChange(G, d)) return pass === 1;
      return false;
    },
    pending(ch, d) {
      if (!ch) return true;
      const G = ch.ng;
      return !G || !G.ready || !!G.job || !!G.potDirty || !!G.dirty || (d != null && lodChange(G, d));
    },
    step(ch, d, deadline) {
      // one job at a time (shared scratch buffers): finish the active chunk first
      if (ACTIVE && ACTIVE.ch !== ch) {
        const A = ACTIVE;
        if (I.chunks.get(A.ch.key) === A.ch && A.ch.ng && A.ch.ng.job === A) { stepJob(A, deadline); if (A.step >= 6) ACTIVE = null; return; }
        ACTIVE = null;
      }
      let G = ch.ng;
      if (!G) G = ch.ng = { ready: false };
      if (!G.job) {
        const lod = lodFor(G, d);
        let what = 'all';
        if (G.ready && G.terrain && G.lod === lod && !G.dirty) what = G.potDirty ? (G.resun ? 'all' : 'roads') : G.resun ? 'map' : 'all';
        G.job = startJob(ch, what, lod);
        G.resun = false;
      }
      ACTIVE = G.job;
      stepJob(G.job, deadline);
      if (G.job == null || ACTIVE.step >= 6) ACTIVE = null;
    },
    dispose(ch) { disposeChunk(ch); },
    heightAt: entityHeight,
  };
  V.setGroundProvider(provider);

  function setEnabled(on) {
    on = !!on;
    if (on === provider.enabled) return on;
    provider.enabled = on;
    if (I) {
      for (const ch of I.chunks.values()) {
        if (on) I.dropPainted(ch);
        else { disposeChunk(ch); ch.groundRes = 0; ch.groundStale = false; }
      }
      I.replan();
    }
    return on;
  }

  /* ================================================================ per frame: wetness + rebuild triggers */
  let wetT = 0, lastPot = -1;
  V.registerLayer('ground', {
    order: -10,
    init() { },
    update(dt) {
      if (!GU.uWet) return;
      let raining = false;
      try { raining = !!(N.seasons && N.seasons.is && N.seasons.is('rain')) || !!(N.flags && N.flags.rain === true); } catch (e) { raining = false; }
      const target = raining ? 1 : 0;
      // roads darken in a few seconds when the shower starts and dry out slowly
      wetT += (target - wetT) * Math.min(1, dt * (raining ? 0.5 : 0.06));
      GU.uWet.value = wetT;
      GU.uRain.value += ((raining ? 1 : 0) - GU.uRain.value) * Math.min(1, dt * 2);
      // pothole set / wetness changed (monsoon, rain, progressive generation): rebuild only the
      // chunks whose own potholes changed (signature), never all of them
      const pv2 = curPot();
      if (pv2 !== lastPot && I) {
        lastPot = pv2;
        let n = 0;
        for (const ch of I.chunks.values()) { const G = ch.ng; if (G && G.ready && !G.potDirty && G.potSig !== potSig(ch)) { G.potDirty = true; n++; } }
        if (n) { STATS.roadsRebuilt += n; I.replan(); }
      }
    },
    dispose() { },
  });
  N.on('potholes:change', () => { if (I) I.replan(); });
  // a new world (map rebuild): analyse again and rebuild every chunk's ground from scratch
  N.on('world:built', () => { NET.built = false; AN = null; POTS.clear(); if (SOIL.tex) { SOIL.tex.dispose(); SOIL.tex = null; } if (I) { for (const ch of I.chunks.values()) disposeChunk(ch); I.replan(); } });

  /* ================================================================ API */
  V.groundHeightAt = groundHeightAt;
  V.ground = {
    get enabled() { return provider.enabled; },
    setEnabled,
    heightAt: groundHeightAt,
    potholeDip,
    /** re-analyse the road network and rebuild every chunk's ground */
    rebuild() { NET.built = false; AN = null; POTS.clear(); if (I) { for (const ch of I.chunks.values()) disposeChunk(ch); I.replan(); } },
    stats() {
      let chunks = 0, tris = 0, tex = 0;
      if (I) for (const ch of I.chunks.values()) if (ch.ng && ch.ng.ready) { chunks++; tris += ch.ng.tris || 0; if (ch.ng.surfTex) tex += 1; }
      return {
        enabled: provider.enabled, analyzed: NET.built, analyzeMs: NET.ms, analyzeWallMs: NET.wallMs, pieces: NET.pieces.length, junctions: NET.juncs.filter((j) => j.poly).length,
        zebras: NET.pieces.reduce((a, P) => a + (P.ends[0].zebra ? 1 : 0) + (P.ends[1].zebra ? 1 : 0), 0), bays: NET.bays.length,
        chunks, roadTris: tris, textures: tex, built: STATS.built, avgChunkMs: STATS.built ? +(STATS.ms / STATS.built).toFixed(2) : 0, lastChunkMs: +STATS.lastMs.toFixed(2),
        wet: +(GU.uWet ? GU.uWet.value : 0).toFixed(2), potVer: curPot(),
        stepMs: STEPMS.map((v) => +(v || 0).toFixed(1)), anaMs: ANAMS.map((v) => +(v || 0).toFixed(1)), soilMs: SOIL.ms,
      };
    },
    /** debug: the analysed network (pieces, junctions) */
    net() { return NET; },
  };
})();
