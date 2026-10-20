/* NOSTALGIA — view3d_ground.js (3D ground renderer) — ARCHITECTURE §20 "3D ground"
 *
 * The 3D view's ground used to be the top-down pixel-art painter uploaded as a texture ("Roads are not
 * clear in 3D… super pixelated", design/feedback_3d.md #1). This module builds a dedicated ground that
 * stays crisp from a kid's first-person eye height to the zoomed-out chase camera:
 *  - ROADS AS GEOMETRY per 3D chunk (512 u): asphalt ribbons along the road polylines (bends filleted
 *    into smooth arcs), junction polygons with rounded kerb corners, dead-end caps. Junction clusters
 *    (nodes closer than their corners need, e.g. Abids) merge into ONE polygon around their outer arms;
 *    road ends that overshoot into the crossing road's carriageway are cut back to the node (no hooks);
 *    every kerbed corner is one curve tangent to both footpath strips (a rounded nose where they
 *    diverge), or plain strip end faces when no curve fits (never a kerb arc standing in the asphalt).
 *    Duplicate alignments (two roads drawn along one line) draw only the wider carriageway, and a global
 *    CLEARANCE pass tests every raised top against every drawn carriageway: a kerbed corner that would
 *    lie on another road is left as a plain asphalt edge, a footpath strip gets a gap with end faces
 *    there (no paver slab on a carriageway or zebra anywhere in the city, tests sweep every junction). One shared road
 *    shader with WORLD-SPACE procedural detail, so there are never visible texels: multi-octave value
 *    noise grain + aggregate specks (band-limited by the pixel footprint), darker tyre-worn tracks along
 *    each lane, oil drips, hairline cracks on old roads, dusty crumbling edges on old lanes, a wet sheen
 *    with sky reflection in rain. Colour by kind and district age (fresh black arterials, faded grey
 *    colony lanes, sandy-edged Old City lanes).
 *  - VECTOR MARKINGS computed in the shader from (along u, across v) road coordinates, anti-aliased with
 *    fwidth and pre-filtered with distance (never aliased or blurry): dashed centre lines, lane lines and
 *    solid edge lines on arterials, all stopping cleanly at junctions; ZEBRA CROSSINGS + stop lines as
 *    worn paint decals exactly where the 2D map paints them (same rules and stand-off); yellow bus-bay
 *    outlines at bus stops.
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
 *       stats(), rebuild(), heightAt(x, y), potholeDip(x, y), net()}; tests / debug: kerbOverlaps(),
 *       footOnRoad(x, y, R) (raised footpath tops on another carriageway), topTris(x, y, R), cornerInfo()
 * Hooks: view3d.js "[ground hook]" edits (setGroundProvider, dropPainted, elevation). Performance:
 * chunks are built lazily inside the core's frame budget in resumable steps (analyse -> aux -> surface
 * -> roads -> build -> upload; every step checks its deadline, phones bake sun shadows in slices); two
 * draw calls per chunk (terrain, roads); phones get fewer noise octaves.
 * Startup (no bare plain on slow machines): the global road analysis + soil colours run in small
 * per-frame slices while the game is still top-down (no THREE needed: own ear clipping); every chunk
 * gets a provisional ground within a frame (flat ribbons straight from N.world.data.roads over the
 * real terrain shader with a flat ground map, same programs); the chunk under the player gets its own
 * slice (prioritize) during the 3D warm-up and until its full ground is in; the scene's flat 'outer'
 * fallback plane is sunk below the terrain's polygon-offset reach.
 * Night: a small skyglow / moonlight floor (NG_NIGHT_AMB, by albedo) on the terrain and road layers plus
 * paint that catches it (markings, zebras, kerb paint), so unlit streets keep their edges readable.
 * Midday: ground albedos are scaled by uGain (from the sun + sky irradiance on a flat surface) so the
 * noon ground is not on the ACES shoulder; lanes stay >= ~1.4x darker than the soil around them.
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
    lane: { col: '#56534e', age: 0.72, wear: 0.55 },
  };
  const DAGE = { oldcity: 0.22, market: 0.12, colony: 0.08, rocky: 0.1, colonial: 0.0, cantonment: -0.05, posh: -0.1, hitec: -0.25 };
  const FOOTCOL = { arterial: '#9d9586', street: '#a19786', bund: '#aaa08c' };
  const KERBCOL = '#c4bdaf';
  const YARD = '#c2a882';
  const PARKSOIL = { ground: '#b38c62', rock: '#a28468' };

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
    // (cum is monotonic: start at the segment holding s0, stop past s1)
    for (let k = s0 > 0 ? segAt(cum, s0 - 1e-6) : 0; k < pts.length - 1; k++) {
      if (cum[k] > s1 + 1e-6) break;
      const segL = cum[k + 1] - cum[k];
      if (cum[k + 1] < s0 - 1e-6 || segL < 1e-9) continue;
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
  const NET = { built: false, pieces: [], juncs: [], paths: [], rails: [], bays: [], buckets: new Map(), ms: 0, roadPieces: new Map() };
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
    // faded grey with age (Old City / market lanes a little sandy), but never bright: at noon (sun
    // 2.75 + hemi 0.9 through ACES) a pale albedo sits on the curve's shoulder next to the soil and the
    // lanes vanish; old lanes stay <= ~0.16 linear luminance, arterials ~0.04-0.1
    c = mixRGB(c, linRGB(ds === 'oldcity' || ds === 'market' ? '#5e574c' : '#5a5855'), clamp((age - 0.3) * 0.5, 0, 0.25));
    if (ds === 'hitec' && r.kind !== 'lane') c = mixRGB(c, linRGB('#2e2d31'), 0.5);
    return { c, age, wear: st.wear };
  }

  const ANAMS = [], ANAMAX = [];
  // The analysis is resumable (phases sliced by the frame budget) so the first 3D switch never
  // freezes the page: pieces per road (+ duplicate alignments dropped) -> junction geometry + cluster
  // merges -> trims -> junction polygons -> footpath clearance -> zebras -> buckets + paths + rails ->
  // bus bays.
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
      while (AN.phase < 8) {
        const ph = AN.phase, ts = now();
        if (ph === 0) { // pieces
          while (AN.i < AN.roads.length) { const [r, list] = AN.roads[AN.i++]; piecesOfRoad(r, list, G, AN); if (over()) break; }
          if (AN.i >= AN.roads.length) { NET.dups = dedupePieces(); AN.phase = 1; AN.i = 0; }
        } else if (ph === 1) { // junction geometry
          while (!AN.mg && AN.i < NET.juncs.length) { const J = NET.juncs[AN.i++]; try { junctionGeom(J); } catch (e) { N.err('ground.junction', e); J.bad = true; } if (over()) break; }
          if (AN.mg || AN.i >= NET.juncs.length) {
            // junction clusters: found in one cheap pass, merged one per step (each runs junctionGeom)
            if (!AN.mg) { AN.mg = clusterGroups(); AN.mi = 0; NET.merged = 0; }
            while (AN.mi < AN.mg.length) { if (mergeGroup(AN.mg[AN.mi++])) NET.merged++; if ((AN.mi & 7) === 0 && over()) break; }
            if (AN.mi >= AN.mg.length) { AN.mg = null; finishPieces(); AN.phase = 2; AN.i = 0; }
          }
        } else if (ph === 2) { // junction polygons
          while (AN.i < NET.juncs.length) { const J = NET.juncs[AN.i++]; try { junctionPoly(J); } catch (e) { N.err('ground.junctionPoly', e); } if (over()) break; }
          if (AN.i >= NET.juncs.length) { AN.phase = 3; AN.i = 0; AN.cl = null; }
        } else if (ph === 3) { // footpath clearance: no slab / kerb on another carriageway (sliced)
          if (clearStep(AN, over)) { AN.phase = 4; AN.i = 0; }
        } else if (ph === 4) { // zebras (per junction; stripes only on the carriageways in the clearance index)
          const G2 = W.roads, C = AN.cl && AN.cl.C;
          while (AN.i < NET.juncs.length) { zebraJ(NET.juncs[AN.i++], G2, C); if ((AN.i & 7) === 0 && over()) break; }
          if (AN.i >= NET.juncs.length) { AN.phase = 5; AN.i = 0; AN.cl = null; }
        } else if (ph === 5) { // buckets: pieces, then junctions
          const np = NET.pieces.length, nt = np + NET.juncs.length;
          while (AN.i < nt) {
            const k = AN.i++;
            if (k < np) { const P = NET.pieces[k]; const bb = bboxOf(P.pts, P.hw + P.fp + 4); P.bb = bb; bucket('pieces', P, bb[0], bb[1], bb[2], bb[3]); }
            else {
              const J = NET.juncs[k - np];
              if (J.poly || J.decals) {
                const pts = (J.poly || [[J.x, J.y]]).concat(J.extraPts || []);
                if (J.decals) for (const d of J.decals) pts.push([d.x, d.y]);
                const bb = bboxOf(pts, 30); J.bb = bb; bucket('juncs', J, bb[0], bb[1], bb[2], bb[3]);
              }
            }
            if ((AN.i & 15) === 0 && over()) break;
          }
          if (AN.i >= nt) { AN.phase = 6; AN.i = 0; }
        } else if (ph === 6) { // paths + rails
          const RD = D.roads || [], RL = D.rails || [], nt = RD.length + RL.length;
          while (AN.i < nt) {
            const k = AN.i++;
            if (k < RD.length) {
              const r = RD[k];
              if (r.kind === 'path' && r.pts && r.pts.length >= 2) {
                const pts = smoothLine(r.pts, r.w / 2 + 4), P = { pts, cum: cumOf(pts), hw: r.w / 2, r };
                const bb = bboxOf(pts, P.hw + 2); bucket('paths', P, bb[0], bb[1], bb[2], bb[3]); NET.paths.push(P);
              }
            } else {
              const r = RL[k - RD.length];
              if (r.pts && r.pts.length >= 2) {
                const pts = smoothLine(r.pts, 30), P = { pts, cum: cumOf(pts), hw: Math.max(6, (r.w || 14) / 2) };
                const bb = bboxOf(pts, P.hw + 2); bucket('rails', P, bb[0], bb[1], bb[2], bb[3]); NET.rails.push(P);
              }
            }
            if ((AN.i & 3) === 0 && over()) break;
          }
          if (AN.i >= nt) { AN.phase = 7; AN.i = 0; }
        } else if (ph === 7) { // bus bays
          const LM = D.landmarks || [];
          while (AN.i < LM.length) { busBay(LM[AN.i++]); if ((AN.i & 3) === 0 && over()) break; }
          if (AN.i >= LM.length) { AN.phase = 8; AN.i = 0; }
        }
        ANAMS[ph] = (ANAMS[ph] || 0) + now() - ts; if (!(ANAMAX[ph] >= now() - ts)) ANAMAX[ph] = now() - ts;
        if (AN.phase < 8 && over()) break;
      }
    } catch (e) {
      N.err('view3d.ground.analyze', e);
      AN.phase = 8;
    }
    AN.work += now() - t0;
    if (AN.phase < 8) return false;
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
    // extend to the junction centres when the road polyline stops short or overshoots (snapped T ends).
    // Polyline points inside the crossing road's carriageway (within the node's half width) are dropped
    // first: a road that ends a few metres past the centre line would otherwise hook back to the centre,
    // the arm would point the wrong way and its footpaths would run diagonally across the other road
    const inJ = (p, j, n) => Math.hypot(p[0] - j.x, p[1] - j.y) < Math.max(1.5, (n.w || 0) / 2);
    if (ja && na && s0 < 0.5 && Math.hypot(pts[0][0] - ja.x, pts[0][1] - ja.y) > 1.5) {
      while (pts.length > 2 && inJ(pts[0], ja, na)) pts.shift();
      pts.unshift([ja.x, ja.y]);
    }
    if (jb && nb && s1 > rcum[rcum.length - 1] - 0.5 && Math.hypot(pts[pts.length - 1][0] - jb.x, pts[pts.length - 1][1] - jb.y) > 1.5) {
      while (pts.length > 2 && inJ(pts[pts.length - 1], jb, nb)) pts.pop();
      pts.push([jb.x, jb.y]);
    }
    addPieceFromPts(r, pts, ja, jb, ea, eb, FOOT, closed);
  }
  function addPieceFromPts(r, raw, ja, jb, ea, eb, FOOT, closed) {
    const hw = r.w / 2;
    // bends filleted wider than the footpath reaches (hw + fp), so the inner footpath edge never folds over
    const pts = smoothLine(raw, hw + Math.max(6, (FOOT[r.kind] || 0) + 3));
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

  /** duplicate road data: two roads drawn along one alignment between the same two junctions (e.g.
   *  mehdipatnam_rd + asif_nagar_rd at Masab Tank). The narrower carriageway lies inside the wider
   *  one; it is not drawn and is no junction arm (its kerbs, footpaths and lane paint would otherwise
   *  stand on the wider road's asphalt and its corners would fold between the two) */
  function dedupePieces() {
    const byPair = new Map();
    for (const P of NET.pieces) {
      const a = P.ends[0].j, b = P.ends[1].j;
      if (!a || !b || a === b || P.closed) continue;
      const k = a.id < b.id ? a.id * 1e6 + b.id : b.id * 1e6 + a.id;
      let l = byPair.get(k); if (!l) byPair.set(k, (l = [])); l.push(P);
    }
    let n = 0;
    for (const l of byPair.values()) {
      if (l.length < 2) continue;
      l.sort((p, q) => q.hw - p.hw);
      for (let i = 1; i < l.length; i++) {
        const Q = l[i];
        for (let k = 0; k < i; k++) {
          const P = l[k];
          if (P.internal || !covers(P, Q)) continue;
          Q.internal = true; Q.covered = P; n++;
          for (const e of Q.ends) e.j.arms = e.j.arms.filter((a) => a.piece !== Q);
          break;
        }
      }
    }
    return n;
  }
  /** piece Q's carriageway (centre line +- hw, every 4 u) lies inside piece P's */
  function covers(P, Q) {
    const n = Math.max(2, Math.ceil(Q.L / 4));
    for (let i = 0; i <= n; i++) {
      const f = ptAt(Q.pts, Q.cum, Q.L * i / n), q = projectOn(P.pts, P.cum, f[0], f[1], 0, P.L);
      if (!q || Math.abs(q.v) + Q.hw > P.hw + 2) return false;
    }
    return true;
  }

  /** arm frames, corner fillets and the trims they need */
  function junctionGeom(J) {
    const arms = J.arms;
    for (const a of arms) {
      const P = a.piece, pts = P.pts, cum = P.cum;
      // merged clusters: the arm's frame is taken where it leaves the cluster (its first metres inside
      // the cluster often bend towards the member node and would put the kerb lines metres off)
      const s0 = J.members ? Math.min(P.L * 0.45, J.span + 10) : 0;
      const s = a.start ? s0 : P.L - s0, dirS = a.start ? 1 : -1;
      a.s0 = s0;
      const q = ptAt(pts, cum, s);
      const f = ptAt(pts, cum, clamp(s + dirS * Math.min(6, P.L * 0.4), 0, P.L));
      let dx = f[0] - q[0], dy = f[1] - q[1];
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      a.Q = [q[0], q[1]]; a.d = [dx, dy]; a.n = [-dy, dx]; a.hw = P.hw; a.fp = P.fp; a.ang = Math.atan2(dy, dx);
      a.end = P.ends[a.start ? 0 : 1];
      a.need = 1.2;
      a.side = a.start ? 1 : -1; // arm +n side == piece side (v sign) * this
    }
    if (J.members) {
      // a merged cluster: order the arms by where they leave it (polar angle of a point well out along
      // each arm, around the cluster centre), not by their direction alone (the arms start at different
      // member nodes)
      const X = (J.span || 0) + 40;
      for (const a of arms) a.ex = Math.atan2(a.Q[1] + a.d[1] * X - J.y, a.Q[0] + a.d[0] * X - J.x);
      arms.sort((p, q) => p.ex - q.ex);
    } else arms.sort((p, q) => p.ang - q.ang);
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
      if (A.s0 + t < -3 || B.s0 + s < -3) continue;
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
      cn.tA = A.s0 + t + e; cn.tB = B.s0 + s + e;
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

  /** Clustered junctions (D5): when a piece between two junctions is shorter than the trims their
   *  corners need (a short link inside a big crossing, e.g. Abids: abids_rd / gunfoundry_rd / bank_st
   *  meet at three nodes 50 u apart, carriageways 52 u wide), each junction's corners land on the other
   *  junction, its arms and footpaths: overlapping paver layers, stray kerbs, wedges. Merge such
   *  clusters into ONE junction whose arms are the cluster's outer pieces (corners and the junction
   *  polygon computed once around the whole cluster); the short inner pieces are covered by it and not
   *  drawn. Zebras stay with the member nodes (the 2D map's rules). Clusters stay small (<= 6 nodes,
   *  <= 200 u across) or keep the old squeezed geometry. */
  function clusterGroups() {
    const par = new Map();
    const find = (J) => { while (par.has(J) && par.get(J) !== J) J = par.get(J); return J; };
    const inner = [];
    for (const P of NET.pieces) {
      const a = P.ends[0].j, b = P.ends[1].j;
      if (P.closed || P.internal || !a || !b || a === b || a.bad || b.bad || a.merged || b.merged) continue;
      if (P.ends[0].need + P.ends[1].need <= P.L - 2) continue;
      inner.push(P);
      const ra = find(a), rb = find(b);
      if (ra !== rb) par.set(ra, rb);
    }
    const groups = new Map();
    for (const P of inner) for (const e of P.ends) { const r = find(e.j); let g = groups.get(r); if (!g) groups.set(r, (g = { js: new Set(), inner: new Set() })); g.js.add(e.j); g.inner.add(P); }
    return Array.from(groups.values());
  }
  /** merge one cluster (from clusterGroups) -> true when merged */
  function mergeGroup(g) {
    {
      const js = Array.from(g.js);
      if (js.length < 2 || js.length > 6) return false;
      let cx = 0, cy = 0;
      for (const J of js) { cx += J.x; cy += J.y; }
      cx /= js.length; cy /= js.length;
      const span = Math.max.apply(null, js.map((J) => Math.hypot(J.x - cx, J.y - cy)));
      if (span > 100) return false;
      const arms = [];
      for (const J of js) for (const a of J.arms) if (!g.inner.has(a.piece)) arms.push({ piece: a.piece, start: a.start, edge: a.edge });
      if (arms.length < 2) return false;
      const M = { id: NET.juncs.length, node: null, x: cx, y: cy, arms, deg: arms.length, members: js, span };
      for (const a of arms) a.piece.ends[a.start ? 0 : 1].need = 0;
      try { junctionGeom(M); } catch (e) { N.err('ground.merge', e); return false; }
      // each outer arm starts only where its carriageway has left the cluster's inner links (an arm whose
      // corners need little trim would otherwise start its kerbs and footpaths inside the cluster)
      for (const a of M.arms) a.end.need = Math.max(a.end.need, clearOfInner(a, g.inner));
      NET.juncs.push(M);
      for (const J of js) { J.merged = M; J.corners = []; }
      for (const P of g.inner) P.internal = true;
      return true;
    }
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

  /** the junction's asphalt outline (+ its kerbed corners, the arms' footpath starts / end faces).
   *  Built in up to three modes until it triangulates: 0 = every corner curve; 1 = plain (unkerbed)
   *  fillets cut straight (their arcs often fold back behind a long trim: a small loop); 2 = kerbed
   *  corners whose curve crosses the rest of the outline are dropped too (no kerb, end faces). Only
   *  if that still fails does the convex hull stand in (its kerbed corners then lie on the asphalt:
   *  the clearance pass drops them, it tests every corner against its own junction's triangles). */
  function junctionPoly(J) {
    const arms = J.arms;
    if (J.merged) { J.kerbs = []; J.poly = null; J.tris = null; return; } // drawn by its cluster
    if (arms.length < 2) return;
    // dominant style: highest rank, then widest
    let dom = arms[0].piece;
    for (const a of arms) { const P = a.piece; if (RANK[P.kind] > RANK[dom.kind] || (RANK[P.kind] === RANK[dom.kind] && P.hw > dom.hw)) dom = P; }
    J.dom = dom;
    const drop = new Set();
    let pl = null, tris = null, mode = 0;
    for (; mode < 3; mode++) {
      const r = junctionOutline(J, mode, drop);
      pl = r.pl; tris = triangulate(pl);
      if (tris) break;
      if (mode === 1) { const x = crossingCorners(r.raw, r.tag); if (!x.size) { mode = 3; break; } for (const c of x) drop.add(c); }
    }
    J.polyMode = mode; J.hullFb = false; J.rawPoly = null; J.tbb = null;
    J.poly = pl; J.tris = tris;
    if (!tris) { J.rawPoly = pl; J.poly = hull(pl); J.tris = triangulate(J.poly) || []; J.hullFb = true; }
    J.extraPts = [];
    for (const k of J.kerbs) if (k.type === 'arc' && !k.straight) J.extraPts.push(k.cn.O, k.cn.C);
  }
  /** kerbed corners (indices) whose curve segments cross another part of the raw outline */
  function crossingCorners(raw, tag) {
    const out = new Set(), n = raw.length;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const bb = [];
    for (let i = 0; i < n; i++) { const a = raw[i], b = raw[(i + 1) % n]; bb.push([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]); }
    for (let i = 0; i < n; i++) {
      const a = raw[i], b = raw[(i + 1) % n];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-3) continue;
      for (let k = i + 2; k < n; k++) {
        if (i === 0 && k === n - 1) continue;
        if (tag[i] < 0 && tag[k] < 0) continue;
        const c = raw[k], d = raw[(k + 1) % n], p = bb[i], q = bb[k];
        if (p[2] < q[0] || q[2] < p[0] || p[3] < q[1] || q[3] < p[1]) continue;
        const d1 = cr(a, b, c), d2 = cr(a, b, d), d3 = cr(c, d, a), d4 = cr(c, d, b);
        if (Math.abs(d1) < 1e-7 || Math.abs(d2) < 1e-7 || Math.abs(d3) < 1e-7 || Math.abs(d4) < 1e-7) continue;
        if ((d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0)) { if (tag[i] >= 0) out.add(tag[i]); if (tag[k] >= 0) out.add(tag[k]); }
      }
    }
    return out;
  }
  function junctionOutline(J, mode, drop) {
    const arms = J.arms;
    const poly = [], tag = [];
    const put = (p, t) => { poly.push(p); tag.push(t); };
    J.kerbs = [];
    // (rebuilt from scratch in every mode: the footpath starts and end faces this junction sets)
    for (const a of arms) { a.end.fs = [a.end.trim, a.end.trim]; a.end.capSide = [false, false]; }
    for (let i = 0; i < arms.length; i++) {
      const A = arms[i], cn = J.corners[i];
      put(cutCorner(A, -1), -1); put(cutCorner(A, 1), -1);
      if (!cn) continue;
      const B = cn.B;
      if (cn.type === 'fillet') {
        // the piece footpaths start exactly at the tangent points (the kerbed corner covers the arc)
        // (arc length along the real, possibly curved piece: project the tangent points onto it)
        const along = (a, T, t0) => {
          const P = a.piece, q = projectOn(P.pts, P.cum, T[0], T[1], 0, P.L);
          const t = q ? (a.start ? q.s : P.L - q.s) : t0;
          return Math.min(t, P.L * 0.5);
        };
        const tA = along(A, cn.TA, cn.tA), tB = along(B, cn.TB, cn.tB);
        // footpaths along this corner start at the tangent points (piece sides)
        const sideA = 1 * A.side, sideB = -1 * B.side;
        if (A.fp > 0) A.end.fs[sideA > 0 ? 1 : 0] = tA;
        if (B.fp > 0) B.end.fs[sideB > 0 ? 1 : 0] = tB;
        // kerbed corner: the analytic arc is tangent to the arms' straight approximations, but a curved
        // arm's real kerb line can sit metres away; join the two strip starts with a curve tangent to
        // the strips instead (asphalt edge and kerb share it: no gaps, no folds)
        cn.curve = null;
        if (A.fp > 0 && B.fp > 0 && !drop.has(i)) {
          const sA = stripStart(A, 1), sB = stripStart(B, -1);
          // whenever the curve can head from one start to the other (also when the strips converge side
          // by side: a rounded island nose). The analytic ring stays only as a last resort: on a curved
          // arm it sits metres off the strips and leaves stray kerb ends standing in the asphalt
          const cx = sB.k[0] - sA.k[0], cy = sB.k[1] - sA.k[1], ch = Math.hypot(cx, cy);
          if (ch > 0.5 && ch < 150 && -(cx * sA.d[0] + cy * sA.d[1]) > -0.2 * ch && cx * sB.d[0] + cy * sB.d[1] > -0.2 * ch) cn.curve = cornerCurve(sA, sB, Math.max(cn.arc.length - 1, Math.min(16, Math.ceil(ch / 3))));
        }
        if (A.fp > 0 && B.fp > 0 && !cn.curve) {
          // no curve can join the two strips (parallel roads leaving side by side, strips far apart
          // along them), or (mode 2) its curve folds across the outline: no kerbed corner (its analytic
          // arc would stand in the asphalt); the polygon joins the cut corners and both strips end in a
          // plain end face
          A.end.capSide[A.side > 0 ? 1 : 0] = true;
          B.end.capSide[-B.side > 0 ? 1 : 0] = true;
          // (a strip whose slab then lies on the other carriageway is cut back by the clearance pass)
          continue;
        }
        // (mode 1+: a plain fillet without footpaths is cut straight; its arc can fold behind the trim)
        if (cn.curve || mode === 0) for (const p of cn.curve || cn.arc) put(p, cn.curve ? i : -1);
        if (cn.curve || mode === 0) J.kerbs.push({ type: 'arc', cn, A, B, tA, tB });
      } else if (A.fp > 0 && B.fp > 0) {
        // no fillet (a straight side, or two arms that diverge from a blunt island nose): the kerb runs
        // from one strip start to the other along a curve tangent to both strips (straight when they are
        // in line, a rounded nose when they diverge) and ONE paver polygon fills it to the back lines,
        // like a kerbed corner (a separate straight slab overlapped the strips and stuck out into the road)
        const sA = stripStart(A, 1), sB = stripStart(B, -1);
        const cx = sB.k[0] - sA.k[0], cy = sB.k[1] - sA.k[1], ch = Math.hypot(cx, cy);
        if (drop.has(i)) { A.end.capSide[A.side > 0 ? 1 : 0] = true; B.end.capSide[-B.side > 0 ? 1 : 0] = true; continue; }
        if (ch > 0.5 && ch < 150 && -(cx * sA.d[0] + cy * sA.d[1]) > -0.2 * ch && cx * sB.d[0] + cy * sB.d[1] > -0.2 * ch) {
          cn.curve = cornerCurve(sA, sB, Math.max(4, Math.min(16, Math.ceil(ch / 3))));
          // a point well on the plot side (orientation reference for the kerb normals and back faces)
          const mk = [(sA.k[0] + sB.k[0]) / 2, (sA.k[1] + sB.k[1]) / 2], mb = [(sA.b[0] + sB.b[0]) / 2, (sA.b[1] + sB.b[1]) / 2];
          cn.O = [mb[0] + (mb[0] - mk[0]) * 3, mb[1] + (mb[1] - mk[1]) * 3];
          for (const p of cn.curve) put(p, i);
          J.kerbs.push({ type: 'arc', cn, A, B, tA: 0, tB: 0, straight: true });
        } else J.kerbs.push({ type: 'line', A, B, pa: cutCorner(A, 1), pb: cutCorner(B, -1), fp: Math.min(A.fp, B.fp), kh: Math.min(A.piece.kerbH, B.piece.kerbH), paint: Math.max(A.piece.paint, B.piece.paint) });
      }
      // a footpath that meets an arm without one gets an end face
      if (A.fp > 0 && !(B.fp > 0)) A.end.capSide[A.side > 0 ? 1 : 0] = true;
      if (B.fp > 0 && !(A.fp > 0)) B.end.capSide[-B.side > 0 ? 1 : 0] = true;
    }
    const pl = dedupe(poly, 0.03);
    if (pl.length >= 3 && Math.hypot(pl[0][0] - pl[pl.length - 1][0], pl[0][1] - pl[pl.length - 1][1]) < 0.03) pl.pop();
    return { pl, raw: poly, tag };
  }
  /** arc length from arm a's node where both its kerb lines are off every inner link's carriageway */
  function clearOfInner(a, inner) {
    const P = a.piece, lim = P.L * 0.45;
    let t = 0;
    while (t < lim) {
      const f = frameAt(P, a.start ? t : P.L - t);
      let hit = false;
      for (const Q of inner) {
        for (const w of [-P.hw, P.hw]) {
          const q = projectOn(Q.pts, Q.cum, f.x + f.nx * w, f.y + f.ny * w, 0, Q.L);
          if (q && q.s > 0.5 && q.s < Q.L - 0.5 && Math.abs(q.v) < Q.hw - 0.5) { hit = true; break; }
        }
        if (hit) break;
      }
      if (!hit) break;
      t += 2;
    }
    return Math.min(t, lim);
  }
  /* ---- footpath clearance (round 3: r2-1 / r2-2) ------------------------------------------------
   * Root cause of "a paver slab on the carriageway": every raised element (a piece's footpath strips,
   * a kerbed junction corner, a line kerb) is laid out from its OWN road's frame (offsets hw .. hw + fp,
   * the tangent points of its own arms) and nothing checked it against the OTHER carriageways around
   * it. Where the road data puts carriageways close (merged clusters, member nodes a few metres apart,
   * shallow merges, roads that cross without a shared node, parallel service roads, Old City
   * tangles like Afzalgunj) a slab lands on somebody else's asphalt or zebra, and every local
   * heuristic (trims, clusters, strip starts) only moves the problem to the next site. So once every
   * trim and junction polygon is final, ONE global pass tests every raised top against a spatial
   * index of every drawn carriageway (trimmed piece ribbons + junction polygons):
   *  - a kerbed corner / line kerb with tops on another carriageway is not built (the junction keeps
   *    its plain asphalt edge; both footpath strips end in plain end faces),
   *  - a piece's footpath strip gets a gap wherever its slab lies on another carriageway (end faces
   *    at each gap; slivers under CL_MIN between gaps go too).
   * Sliced like the rest of the analysis (top-down idle time, never a 3D frame). */
  const CL_CELL = 64, CL_MIN = 3, CL_STEP = 1, CL_RUN = 48;
  const clKey = (i, j) => j * 4096 + i;
  function clIndexStep(S, over) {
    const np = NET.pieces.length, nt = np + NET.juncs.length;
    const add = (o) => {
      const b = o.bb;
      for (let j = Math.floor(b[1] / CL_CELL); j <= Math.floor(b[3] / CL_CELL); j++) for (let i = Math.floor(b[0] / CL_CELL); i <= Math.floor(b[2] / CL_CELL); i++) {
        const k = clKey(i, j); let c = S.C.get(k); if (!c) S.C.set(k, (c = [])); c.push(o);
      }
    };
    while (S.ii < nt) {
      const k = S.ii++;
      if (k < np) {
        const P = NET.pieces[k];
        if (P.internal) continue;
        const s0 = P.ends[0].trim, s1 = P.L - P.ends[1].trim;
        if (s1 - s0 < 0.6) continue;
        // in runs of <= CL_RUN u (tight boxes, short projections), each searched a little past its ends
        // (e0, e1) so a point by a seam finds its foot in one of the two; t0 / t1: the drawn ribbon
        const n = Math.max(1, Math.ceil((s1 - s0) / CL_RUN)), d = (s1 - s0) / n, ov = P.hw + 2;
        for (let q = 0; q < n; q++) {
          const a = s0 + d * q, b = q === n - 1 ? s1 : a + d;
          const e0 = Math.max(s0, a - ov), e1 = Math.min(s1, b + ov);
          add({ P, s0: e0, s1: e1, t0: s0, t1: s1, bb: bboxOf(subLine(P.pts, P.cum, e0, e1), P.hw) });
        }
      } else {
        const J = NET.juncs[k - np];
        if (J.poly && J.poly.length >= 3 && !J.merged) add({ J, poly: J.poly, bb: bboxOf(J.poly, 0) });
      }
      if ((S.ii & 15) === 0 && over()) return false;
    }
    return true;
  }
  /** is (x, y) on a drawn carriageway other than piece selfP / junction selfJ (with a margin m off its edges)? */
  function clHit(C, x, y, selfP, selfJ, m) {
    const c = C.get(clKey(Math.floor(x / CL_CELL), Math.floor(y / CL_CELL)));
    if (!c) return false;
    for (const o of c) {
      const b = o.bb;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (o.P) {
        if (o.P === selfP) continue;
        const q = projectOn(o.P.pts, o.P.cum, x, y, o.s0, o.s1);
        if (q && q.s > o.t0 + 0.3 && q.s < o.t1 - 0.3 && runFoot(o, q.s) && Math.abs(q.v) < o.P.hw - m) return true;
      } else if (o.J !== selfJ && inPolyM(o.poly, x, y, m)) return true;
    }
    return false;
  }
  /** is (x, y) on junction J's own drawn asphalt (its outline, or the hull standing in for it), at
   *  least m inside? (the clearance pass's self test: a corner's slab must never lie on its own junction) */
  function onOwnJ(J, x, y, m) {
    const pl = J.poly;
    if (!pl || pl.length < 3 || !J.tris || !J.tris.length) return false;
    if (!J.tbb) J.tbb = bboxOf(pl, 0);
    const b = J.tbb;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
    return inPolyM(pl, x, y, m);
  }
  /** a projection onto a run of the index found its foot inside the run (not clamped at a seam) */
  function runFoot(o, s) { return (s > o.s0 + 1e-6 || o.s0 <= o.t0) && (s < o.s1 - 1e-6 || o.s1 >= o.t1); }
  /** point strictly inside polygon pl, at least m from its outline */
  function inPolyM(pl, x, y, m) {
    let c = false;
    for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const a = pl[i], b = pl[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
    if (!c || !(m > 0)) return c;
    for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) {
      const a = pl[j], b = pl[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
      const u = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / L2, 0, 1);
      if (Math.hypot(x - a[0] - dx * u, y - a[1] - dy * u) < m) return false;
    }
    return true;
  }
  /** kerbed corners / line kerbs of junction J: emitted into a scratch builder, raised tops tested */
  function clearJunction(S, J) {
    if (!J.kerbs || !J.kerbs.length) return;
    const B = S.B;
    for (const k of J.kerbs) {
      if (k.type === 'arc' && !(k.A.fp > 0 && k.B.fp > 0)) continue;
      B.reset(J.x - CHS / 2, J.y - CHS / 2);
      if (k.type === 'arc') arcKerb(B, J, k); else lineKerb(B, k);
      let bad = 0;
      for (let i = 0; i < B.ni && bad <= 1; i += 3) {
        const ia = B.I[i], ib = B.I[i + 1], ic = B.I[i + 2];
        if (B.Nn[ia * 3 + 1] < 120 || B.P[ia * 3 + 1] < 0.3) continue; // raised tops only
        const ax = B.P[ia * 3] + B.x0, az = B.P[ia * 3 + 2] + B.z0, bx = B.P[ib * 3] + B.x0, bz = B.P[ib * 3 + 2] + B.z0, cx = B.P[ic * 3] + B.x0, cz = B.P[ic * 3 + 2] + B.z0;
        const ar = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
        if (ar < 0.01) continue;
        // a barycentric grid of interior points, one per ~1.2 u^2 (a big paver fill triangle that
        // reaches over an arm's ribbon start was missed by a few samples): each point stands for an equal
        // share of the area. Hits: another carriageway, or this junction's OWN asphalt (a corner the
        // outline does not follow: the hull stand-in, a curve folded into the junction)
        const g = Math.min(9, Math.max(1, Math.ceil(Math.sqrt(ar * 1.6)))), np = (g * (g + 1)) / 2; // ~1.2 u^2 a point
        for (let u = 0; u < g; u++) for (let v = 0; v < g - u; v++) {
          const wu = (u + 1 / 3) / g, wv = (v + 1 / 3) / g, ww = 1 - wu - wv;
          const px = ax * ww + bx * wu + cx * wv, pz = az * ww + bz * wu + cz * wv;
          if (clHit(S.C, px, pz, null, J, 0.3) || onOwnJ(J, px, pz, 0.3)) bad += ar / np;
        }
      }
      if (bad > 1) {
        k.drop = true; S.drops++;
        k.A.end.capSide[k.A.side > 0 ? 1 : 0] = true;
        k.B.end.capSide[-k.B.side > 0 ? 1 : 0] = true;
      }
    }
  }
  /** footpath strips of piece P: gaps wherever the slab (kerb line .. back line) is on another carriageway */
  function clearPiece(S, P) {
    P.gaps = null;
    if (!(P.fp > 0) || P.internal) return;
    if (!P.nrm) P.nrm = normalsOf(P.pts);
    const ws = [P.hw + 0.35, P.hw + P.fp * 0.5, P.hw + P.fp - 0.35];
    const s0 = P.ends[0].trim, s1 = P.L - P.ends[1].trim; // the drawn ribbon
    for (const side of [-1, 1]) {
      const si = side > 0 ? 1 : 0;
      const a = P.ends[0].fs[si], b = P.L - P.ends[1].fs[si];
      if (b - a < 0.05) continue;
      const n = Math.max(1, Math.ceil((b - a) / CL_STEP)), d = (b - a) / n;
      const hits = new Uint8Array(n + 2), bx = new Float64Array(n + 1), by = new Float64Array(n + 1), cx = new Float64Array(n + 1), cy = new Float64Array(n + 1);
      const wb = P.hw + P.fp;
      for (let k = 0; k <= n; k++) {
        const f = frameAt(P, a + d * k), sk = a + d * k;
        cx[k] = f.x; cy[k] = f.y; bx[k] = f.x + f.nx * wb * side; by[k] = f.y + f.ny * wb * side;
        for (const w of ws) {
          const x = f.x + f.nx * w * side, y = f.y + f.ny * w * side;
          if (clHit(S.C, x, y, P, null, 0.4)) { hits[k] = 1; break; }
          // its OWN carriageway: a hook / U-bend brings the slab over the road it lines (the nearest
          // centre-line point is elsewhere, well within hw: a perpendicular foot, or inside a ribbon quad)
          if (P.pts.length > 2 && turnIn(P, sk - wb * 4, sk + wb * 4) > 0.9) { // (a straight-ish stretch cannot come back)
            const wn = wb * 4, q = projectOn(P.pts, P.cum, x, y, Math.max(s0, sk - wn), Math.min(s1, sk + wn));
            if (q && q.d2 < (P.hw - 0.4) * (P.hw - 0.4) && (q.d2 - q.v * q.v < 0.01 || Math.abs(q.s - sk) > w * 0.5 || onOwnRibbon(P, q.s, x, y, s0, s1, 0.4))) { hits[k] = 1; break; }
          }
        }
      }
      // on the inside of a bend tighter than the footpath (radius < hw + fp) the back edge runs backwards
      // against the centre line: the slab folds over itself and the road (gap there)
      for (let k = 0; k < n; k++) if ((bx[k + 1] - bx[k]) * (cx[k + 1] - cx[k]) + (by[k + 1] - by[k]) * (cy[k + 1] - cy[k]) < 0) { hits[k] = 1; hits[k + 1] = 1; }
      let gaps = null, k0 = -1;
      for (let k = 0; k <= n + 1; k++) {
        const hit = k <= n && hits[k] === 1;
        if (hit && k0 < 0) k0 = k;
        else if (!hit && k0 >= 0) { (gaps || (gaps = [])).push([Math.max(a, a + d * (k0 - 1)), Math.min(b, a + d * (k + 1))]); k0 = -1; } // (a sample of margin each side)
      }
      if (!gaps) continue;
      // no slivers: clear runs shorter than CL_MIN (between gaps or at the strip ends) go too
      const out = [];
      for (const g of gaps) {
        if (g[0] - a < CL_MIN) g[0] = a;
        if (b - g[1] < CL_MIN) g[1] = b;
        const l = out[out.length - 1];
        if (l && g[0] - l[1] < CL_MIN) l[1] = Math.max(l[1], g[1]); else out.push(g);
      }
      if (!P.gaps) P.gaps = [null, null];
      P.gaps[si] = out;
      S.gaps += out.length; for (const g of out) S.gapLen += g[1] - g[0];
    }
  }
  /** total absolute turning (radians) of piece P's centre line between arc lengths sa and sb */
  function turnIn(P, sa, sb) {
    if (!P.turn) { // prefix sums of the turning at each vertex
      const t = new Float64Array(P.pts.length), p = P.pts;
      for (let k = 1; k < p.length - 1; k++) {
        const ax = p[k][0] - p[k - 1][0], ay = p[k][1] - p[k - 1][1], bx = p[k + 1][0] - p[k][0], by = p[k + 1][1] - p[k][1];
        t[k] = t[k - 1] + Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
      }
      if (p.length > 1) t[p.length - 1] = t[Math.max(0, p.length - 2)];
      P.turn = t;
    }
    const ka = segAt(P.cum, Math.max(0, sa)), kb = Math.min(P.pts.length - 1, segAt(P.cum, Math.min(P.L, sb)) + 1);
    return P.turn[kb] - P.turn[ka];
  }
  /** is (x, y) inside the drawn ribbon quads of piece P next to arc length s (the segment there and its
   *  two neighbours, vertex frames with the averaged normals the ribbon uses), at least m inside its
   *  long edges? A strip sample nearer than hw to the centre line of its own road: on the inside of a
   *  hook / tight bend (a fold over its own carriageway) it is in a quad; by the outer corner of a bend
   *  vertex it is not (the strip shares the quad's edge there) */
  function onOwnRibbon(P, s, x, y, s0, s1, m) {
    const k0 = segAt(P.cum, s), hw = P.hw, pts = P.pts, nr = P.nrm;
    const side = (ax, ay, bx, by) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    for (let k = Math.max(0, k0 - 1); k <= Math.min(pts.length - 2, k0 + 1); k++) {
      if (P.cum[k + 1] < s0 || P.cum[k] > s1) continue;
      const a = pts[k], b = pts[k + 1], na = nr[k], nb = nr[k + 1];
      const L = [a[0] + na[0] * hw, a[1] + na[1] * hw, b[0] + nb[0] * hw, b[1] + nb[1] * hw];
      const R = [a[0] - na[0] * hw, a[1] - na[1] * hw, b[0] - nb[0] * hw, b[1] - nb[1] * hw];
      // between the two long edges and between the end frames
      const sl = side(L[0], L[1], L[2], L[3]), sr = side(R[0], R[1], R[2], R[3]);
      if (sl * sr > 0) continue; // outside both edges on one side
      const e0 = side(L[0], L[1], R[0], R[1]), e1 = side(L[2], L[3], R[2], R[3]);
      if (e0 * e1 > 0) continue; // before the start frame or past the end frame
      const dl = Math.abs(sl) / (Math.hypot(L[2] - L[0], L[3] - L[1]) || 1), dr = Math.abs(sr) / (Math.hypot(R[2] - R[0], R[3] - R[1]) || 1);
      if (dl > m && dr > m) return true;
    }
    return false;
  }
  /** clearance phase step (resumable): index, then junction corners (they set end faces), then strips */
  function clearStep(A, over) {
    if (!A.cl) A.cl = { C: new Map(), ii: 0, i: 0, B: new RB(0, 0), drops: 0, gaps: 0, gapLen: 0, maxMs: 0, maxK: '', t0: now() };
    const S = A.cl;
    if (!clIndexStep(S, over)) return false;
    const nj = NET.juncs.length, nt = nj + NET.pieces.length, lod = EMIT_LOD;
    EMIT_LOD = 0;
    try {
      while (S.i < nt) {
        const k = S.i++, t = now();
        try { if (k < nj) clearJunction(S, NET.juncs[k]); else clearPiece(S, NET.pieces[k - nj]); } catch (e) { N.err('ground.clear', e); }
        const dt = now() - t; if (dt > S.maxMs) { S.maxMs = dt; S.maxK = k < nj ? 'J' + k : 'P' + (k - nj); }
        if (k < nj) S.msJ = (S.msJ || 0) + dt; else S.msP = (S.msP || 0) + dt;
        if (over()) break;
      }
    } finally { EMIT_LOD = lod; }
    if (S.i < nt) return false;
    NET.clear = { corners: S.drops, gaps: S.gaps, gapLen: Math.round(S.gapLen), dups: NET.dups || 0, itemMaxMs: +S.maxMs.toFixed(1), itemMax: S.maxK, msJ: Math.round(S.msJ || 0), msP: Math.round(S.msP || 0) };
    return true;
  }
  /** clear runs of piece P's footpath strip on side si ([[s0, s1], ...] along the piece) */
  function stripRuns(P, si) {
    const a = P.ends[0].fs[si], b = P.L - P.ends[1].fs[si];
    if (b - a < 0.02) return [];
    const g = P.gaps && P.gaps[si];
    if (!g) return [[a, b]];
    const out = [];
    let s = a;
    for (const q of g) { if (q[0] - s > 0.02) out.push([s, q[0]]); s = Math.max(s, q[1]); }
    if (b - s > 0.02) out.push([s, b]);
    return out;
  }
  function polyArea(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return a / 2; }
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
    const A = Math.abs(polyArea(pl));
    if (pl.length < 3 || A < 1) return null;
    if (convex(pl)) { const t = []; for (let i = 1; i < pl.length - 1; i++) t.push([pl[0], pl[i], pl[i + 1]]); return t; }
    const tris = earClip(pl);
    if (!tris || !tris.length) return null;
    // a self-intersecting outline triangulates to the wrong area: then the caller falls back to the hull
    let sum = 0;
    const out = tris.map((t) => {
      const a = pl[t[0]], b = pl[t[1]], c = pl[t[2]];
      sum += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
      return [a, b, c];
    });
    return Math.abs(sum - A) > A * 0.02 + 1 ? null : out;
  }
  /** ear clipping for a simple polygon (no THREE needed, so the network analysis can run while the
   *  game is still top-down): [[ia, ib, ic], ...] indices into pl, or null */
  function earClip(pl) {
    const n = pl.length;
    if (n < 3) return null;
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    if (polyArea(pl) < 0) idx.reverse(); // counter-clockwise
    const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const out = [];
    let guard = n * n + 8;
    while (idx.length > 3 && guard-- > 0) {
      let cut = false;
      for (let k = 0; k < idx.length; k++) {
        const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
        const a = pl[ia], b = pl[ib], c = pl[ic];
        if (cr(a, b, c) <= 1e-9) continue; // reflex or degenerate
        let inside = false;
        for (let m = 0; m < idx.length; m++) {
          const iq = idx[m];
          if (iq === ia || iq === ib || iq === ic) continue;
          const q = pl[iq];
          // only a reflex vertex can lie inside an ear
          if (cr(pl[idx[(m + idx.length - 1) % idx.length]], q, pl[idx[(m + 1) % idx.length]]) > 1e-9) continue;
          if (cr(a, b, q) >= -1e-9 && cr(b, c, q) >= -1e-9 && cr(c, a, q) >= -1e-9) { inside = true; break; }
        }
        if (inside) continue;
        out.push([ia, ib, ic]); idx.splice(k, 1); cut = true; break;
      }
      if (!cut) { // numerically stuck (collinear runs): drop the flattest vertex
        let best = 0, bv = Infinity;
        for (let k = 0; k < idx.length; k++) { const v = Math.abs(cr(pl[idx[(k + idx.length - 1) % idx.length]], pl[idx[k]], pl[idx[(k + 1) % idx.length]])); if (v < bv) { bv = v; best = k; } }
        idx.splice(best, 1);
      }
    }
    if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
    return out;
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
  /** (zebra / stop-line paint) is (x, y) on a drawn carriageway: a trimmed piece ribbon or a junction's
   *  asphalt (clearance index S.C; no margins, so a stripe across the ribbon / junction seam stays) */
  function onCarriage(C, x, y) {
    const c = C.get(clKey(Math.floor(x / CL_CELL), Math.floor(y / CL_CELL)));
    if (!c) return false;
    for (const o of c) {
      const b = o.bb;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (o.P) {
        const q = projectOn(o.P.pts, o.P.cum, x, y, o.s0, o.s1);
        if (q && runFoot(o, q.s) && Math.abs(q.v) < o.P.hw && q.d2 - q.v * q.v < 0.0025) return true;
      } else if (inPolyM(o.poly, x, y, 0)) return true;
    }
    return false;
  }
  /** the zebra's stripe offsets (across the road) whose whole stripe lies on a carriageway: the 2D map
   *  paints a zebra across its road's width from the node's direction to the next node, which on a
   *  curved arm or in a merged cluster can run out over the kerbed corners and footpaths; paint never
   *  goes under a raised slab (or onto bare ground), so such stripes are left out */
  const ZS = [[-3.6, -0.8], [3.6, 0.8], [-3.6, 0.8], [3.6, -0.8], [0, 0]]; // stripe corners (inset) + centre
  function zebraStripes(C, d) {
    const nx = -d.uy, ny = d.ux, out = [];
    for (let t = -d.w / 2 + 3; t <= d.w / 2 - 4; t += 4.5) {
      const m = t + 1.2, cx = d.x + nx * m, cy = d.y + ny * m;
      let ok = true;
      for (const [su, sv] of ZS) if (!onCarriage(C, cx + d.ux * su + nx * sv, cy + d.uy * su + ny * sv)) { ok = false; break; }
      if (ok) out.push(m);
    }
    return out;
  }
  /** a stop line shortened to its longest run on the carriageway (w = 0: none) */
  function fitStop(C, d) {
    const nx = -d.uy, ny = d.ux, st = 1, k = Math.max(1, Math.round(d.w / st));
    let best = [0, -1], run = -1;
    for (let i = 0; i <= k + 1; i++) {
      const u = -d.w / 2 + (d.w * i) / k;
      let ok = i <= k;
      if (ok && !onCarriage(C, d.x + nx * u, d.y + ny * u)) ok = false;
      if (ok && run < 0) run = i;
      else if (!ok && run >= 0) { if (i - 1 - run > best[1] - best[0]) best = [run, i - 1]; run = -1; }
    }
    const len = best[1] >= best[0] ? ((best[1] - best[0]) * d.w) / k : 0;
    if (len < 2) { d.w = 0; return; }
    const um = -d.w / 2 + (((best[0] + best[1]) / 2) * d.w) / k;
    d.x += nx * um; d.y += ny * um; d.w = len;
  }
  function zebraJ(J, G, C) {
    {
      const n = J.node;
      if (!n || n.deg < 3 || J.arms.length < 2) return;
      const inc = n.inc.map((id) => G.edges[id]).filter(Boolean).sort((a, b) => (RANK[a.kind] - RANK[b.kind]) || a.w - b.w);
      if (!inc.length || inc.every((e) => e.kind === 'lane')) return;
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
        // the 2D map's zebra: centred widest.w / 2 + 6 from the node along the edge, stripes 8 long x
        // 2.4 wide every 4.5 from -w/2 + 3 while t <= w/2 - 4 (decal quads at exactly that spot)
        const off = widest.w / 2 + 6;
        const zx = n.x + ux * off, zy = n.y + uy * off;
        const zb = { t: 'zebra', x: zx, y: zy, ux, uy, w: e.w };
        if (C) zb.ms = zebraStripes(C, zb);
        (J.decals || (J.decals = [])).push(zb);
        // stop line on the inbound half (traffic keeps left: inbound = left of -u = +n side), behind the zebra
        const sx = zx + ux * 6.6, sy = zy + uy * 6.6, nx = -uy, ny = ux;
        const sl = { t: 'stop', x: sx + nx * (e.w / 4), y: sy + ny * (e.w / 4), ux, uy, w: e.w / 2 - 1.2 };
        if (C) fitStop(C, sl);
        J.decals.push(sl);
        const arm = J.arms.find((a) => a.edge === e) || J.arms.slice().sort((p, q) => (q.d[0] * ux + q.d[1] * uy) - (p.d[0] * ux + p.d[1] * uy))[0];
        if (arm) arm.end.zebra = Math.max(off, 1); // markings (dashes, medians) start behind it
      }
    }
  }

  function busBay(lm) {
    {
      if (!lm || lm.draw !== 'bus_stop') return;
      let best = null;
      const bk = NET.buckets.get(bkey(Math.floor(lm.x / CHS), Math.floor(lm.y / CHS)));
      for (const P of bk ? bk.pieces : []) {
        if ((P.kind !== 'street' && P.kind !== 'arterial' && P.kind !== 'bund') || P.internal) continue;
        const bb = P.bb || bboxOf(P.pts, P.hw + P.fp + 20);
        if (lm.x < bb[0] - 30 || lm.x > bb[2] + 30 || lm.y < bb[1] - 30 || lm.y > bb[3] + 30) continue;
        const q = projectOn(P.pts, P.cum, lm.x, lm.y, 0, P.L);
        if (q && (!best || q.d2 < best.q.d2)) best = { P, q };
      }
      if (!best || Math.sqrt(best.q.d2) > best.P.hw + best.P.fp + 24) return;
      const P = best.P, u = best.q.s, side = best.q.v >= 0 ? 1 : -1;
      if (u - 20 < P.ends[0].trim + 12 || u + 20 > P.L - P.ends[1].trim - 12 || P.hw < 14) return;
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
      // (typed-array conversion, not Uint16Array.from's iterator; bounds from the chunk box, not a
      // pass over every vertex: both were long single slices on big chunks)
      const idx = n > 65535 ? this.I.slice(0, this.ni) : new Uint16Array(this.I.subarray(0, this.ni));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.boundingBox = new THREE.Box3(new THREE.Vector3(-8, -3, -8), new THREE.Vector3(CHS + 8, 6, CHS + 8));
      g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
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

  /** which potholes the 3D road shows (D3): a lane full of 2-9 u craters reads as dirt, so per road
   *  kind / age a deterministic share (by id, so every chunk agrees), no wider than half the road, and
   *  no two within 7 u (the bigger one stays). potholeDip / groundHeightAt follow the same set. */
  const POTKEEP = { arterial: 0.4, bund: 0.4, bridge: 0.25, street: 0.55, lane: 0.6 };
  const POTVIS = new Map();
  const potScore = (q) => q.rx * q.ry * (q.depth || 0.4) + (q.id % 1000) * 1e-7;
  function potShown(p, P, PH) {
    let v = POTVIS.get(p);
    if (v !== undefined) return v;
    const keep = Math.min(0.85, (POTKEEP[P.kind] != null ? POTKEEP[P.kind] : 0.5) + 0.2 * (P.st ? P.st.age : 0.5));
    const pass = (q) => hash1(q.id | 0, 977) < keep && Math.max(q.rx, q.ry) <= Math.max(2.6, P.hw * 0.5);
    v = pass(p);
    if (v && PH && PH.query) {
      let nb = [];
      try { nb = PH.query(p.x - 8, p.y - 8, p.x + 8, p.y + 8, []); } catch (e) { nb = []; }
      const sp = potScore(p);
      for (const q of nb) {
        if (q === p || Math.hypot(q.x - p.x, q.y - p.y) > 7) continue;
        if (pass(q) && potScore(q) > sp) { v = false; break; }
      }
    }
    POTVIS.set(p, v);
    return v;
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
          if (!potShown(p, P, PH)) continue;
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
      if (now() > deadline) { EMIT_LOD = 0; return false; }
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
    if (P.internal) return; // inside a merged junction cluster: its polygon covers it
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
    const runs = P.fp > 0 ? [stripRuns(P, 0), stripRuns(P, 1)] : null; // footpath runs (clearance gaps cut out)
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
      if (runs) for (const side of [-1, 1]) for (const run of runs[side > 0 ? 1 : 0]) {
        const a = Math.max(ua, run[0]), bU = Math.min(ub, run[1]);
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
      const si = side > 0 ? 1 : 0, rs = runs[si];
      const cap = (s, dir) => footCap(B, frameAt(P, clamp(s, 0, P.L)), s, side, hw, P.fp, P.kerbH, dir, P.paint);
      for (const end of [0, 1]) {
        const e = P.ends[end], s = end === 0 ? e.fs[si] : P.L - e.fs[si];
        if (P.closed) continue;
        const open = !e.j || needsFootCap(e, side); // dead end / no corner: the strip's own end face
        const r = end === 0 ? rs[0] : rs[rs.length - 1];
        const reaches = r && Math.abs((end === 0 ? r[0] : r[1]) - s) < 0.02;
        if (open && reaches) cap(s, end === 0 ? -1 : 1);
        // a kerbed corner ends at the strip start but a gap follows: the corner's own end face
        else if (!open && !reaches && !EMIT_LOD) cap(s, end === 0 ? 1 : -1);
      }
      // end faces at each clearance gap
      for (let q = 0; q < rs.length; q++) {
        if (q > 0 || rs[q][0] > eA.fs[si] + 0.02) cap(rs[q][0], -1);
        if (q < rs.length - 1 || rs[q][1] < P.L - eB.fs[si] - 0.02) cap(rs[q][1], 1);
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
  const ZEBRA = [0.80, 0.79, 0.74];
  /** a flat painted rectangle (decal): centre, unit direction along its length, length x width */
  function paintRect(B, c, x, y, ux, uy, len, wid) {
    const hl = len / 2, hw = wid / 2, nx = -uy, ny = ux;
    pv(x - ux * hl - nx * hw, Y_DECAL, y - uy * hl - ny * hw, 0, 1, 0, 0, 0);
    pv(x + ux * hl - nx * hw, Y_DECAL, y + uy * hl - ny * hw, 0, 1, 0, len, 0);
    pv(x + ux * hl + nx * hw, Y_DECAL, y + uy * hl + ny * hw, 0, 1, 0, len, 1);
    pv(x - ux * hl + nx * hw, Y_DECAL, y - uy * hl + ny * hw, 0, 1, 0, 0, 1);
    flush(B, c);
  }
  function emitDecals(B, J) {
    const age = J.dom ? J.dom.st.age : 0.4;
    const c = cst(ZEBRA, LY.PAINT, { age });
    for (const d of J.decals) {
      if (d.t === 'zebra') {
        const nx = -d.uy, ny = d.ux;
        if (d.ms) { for (const m of d.ms) paintRect(B, c, d.x + nx * m, d.y + ny * m, d.ux, d.uy, 8, 2.4); continue; } // (stripes on the carriageway)
        for (let t = -d.w / 2 + 3; t <= d.w / 2 - 4; t += 4.5) {
          const m = t + 1.2; // stripe [t, t + 2.4] across the road
          paintRect(B, c, d.x + nx * m, d.y + ny * m, d.ux, d.uy, 8, 2.4);
        }
      } else if (d.t === 'stop' && d.w > 0.5) paintRect(B, c, d.x, d.y, -d.uy, d.ux, d.w, 1.1);
    }
  }
  function emitJunction(B, J) {
    if (J.decals && !EMIT_LOD) emitDecals(B, J);
    if (!J.tris || !J.dom) return;
    const st = J.dom.st;
    const jc = cst(st.c, LY.JUNC, { p1: st.wear, age: st.age });
    for (const t of J.tris) {
      pv(t[0][0], Y_ROAD, t[0][1], 0, 1, 0, 0, 0); pv(t[1][0], Y_ROAD, t[1][1], 0, 1, 0, 0, 0); pv(t[2][0], Y_ROAD, t[2][1], 0, 1, 0, 0, 0);
      flush(B, jc);
    }
    for (const k of J.kerbs) {
      if (k.drop) continue; // on another carriageway (clearance pass): plain asphalt edge
      if (k.type === 'arc') arcKerb(B, J, k);
      else lineKerb(B, k);
    }
  }
  /** where a piece footpath strip starts at a junction arm (arm side +1: +n): kerb + back points, the
   *  unit direction along the arm away from the junction (the same frame footStrip uses) */
  function stripStart(a, side) {
    const P = a.piece, e = a.end, si = side * a.side > 0 ? 1 : 0;
    const s = clamp(a.start ? e.fs[si] : P.L - e.fs[si], 0, P.L);
    const f = frameAt(P, s), sd = side * a.side;
    const dir = a.start ? 1 : -1;
    return { k: [f.x + f.nx * P.hw * sd, f.y + f.ny * P.hw * sd], b: [f.x + f.nx * (P.hw + P.fp) * sd, f.y + f.ny * (P.hw + P.fp) * sd], d: [f.dx * dir, f.dy * dir] };
  }
  /** cubic Bezier from strip start sA.k (heading toward the junction, -sA.d) to sB.k (leaving, +sB.d) */
  function cornerCurve(sA, sB, k) {
    const P0 = sA.k, P3 = sB.k, d0 = [-sA.d[0], -sA.d[1]], d1 = sB.d;
    const chord = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]);
    const th = Math.acos(clamp(d0[0] * d1[0] + d0[1] * d1[1], -1, 1)); // turning angle
    const R = th > 1e-3 ? chord / (2 * Math.sin(th / 2)) : chord;
    const h = Math.min(chord * 0.9, (4 / 3) * Math.tan(th / 4) * R);
    const C1 = [P0[0] + d0[0] * h, P0[1] + d0[1] * h], C2 = [P3[0] - d1[0] * h, P3[1] - d1[1] * h];
    const n = Math.max(4, k), out = [];
    for (let q = 0; q <= n; q++) {
      const t = q / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push([a * P0[0] + b * C1[0] + c * C2[0] + d * P3[0], a * P0[1] + b * C1[1] + c * C2[1] + d * P3[1]]);
    }
    return out;
  }
  /** a kerbed corner: ONE footpath polygon between the kerb arc and the plot corner where the two piece
   *  footpaths' back lines meet; kerb face + chamfer + band along the arc once; pavers in world (x, z)
   *  so the slabs never fan; the piece strips start exactly at the arc's ends (no overlap) */
  function arcKerb(B, J, k) {
    const cn = k.cn, A = k.A, Bm = k.B;
    if (!(A.fp > 0 && Bm.fp > 0)) return; // only one side has a footpath: open ground (footCap closes it)
    const kh = Math.min(A.piece.kerbH, Bm.piece.kerbH) || 0.6;
    const paint = Math.max(A.piece.paint, Bm.piece.paint);
    const fp = Math.min(A.fp, Bm.fp), O = cn.O;
    const kc = cst(linRGB(KERBCOL), LY.KERB, { p1: paint, age: 0.5 });
    const fc = cst(linRGB(FOOTCOL[A.piece.kind] || FOOTCOL.street), LY.FOOT, { age: 0.5, g1: 1e6 });
    const backC = cst(linRGB('#8f8574'), LY.CONC, { age: 0.6 });
    const kb = Math.min(0.9, fp * 0.2), ch = EMIT_LOD ? 0 : 0.14;
    const sA = stripStart(A, 1), sB = stripStart(Bm, -1);
    // the strips normally start at the tangent points; on curved / very short arms they may not: a
    // short gap is bridged along the kerb line, a long one (clustered junctions) gets a plain ring
    const ring = !cn.curve;
    const arc = ring ? cn.arc.slice() : dedupe(cn.curve, 0.05);
    const n = arc.length - 1;
    const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
    // per kerb point: unit vector toward the road (kerb face normal); plot-ward is its negation
    let rad;
    if (ring) rad = arc.map((p) => unit(p[0] - O[0], p[1] - O[1]));
    else {
      rad = arc.map((p, q) => { // curve normal, on the road side (away from the plot corner side O)
        const a = arc[Math.max(0, q - 1)], b = arc[Math.min(n, q + 1)];
        let nx = -(b[1] - a[1]), ny = b[0] - a[0];
        if ((p[0] - O[0]) * nx + (p[1] - O[1]) * ny < 0) { nx = -nx; ny = -ny; }
        return unit(nx, ny);
      });
      rad[0] = unit(sA.k[0] - sA.b[0], sA.k[1] - sA.b[1]); rad[n] = unit(sB.k[0] - sB.b[0], sB.k[1] - sB.b[1]);
    }
    const off = (q, w) => [arc[q][0] - rad[q][0] * w, arc[q][1] - rad[q][1] * w];
    let u = 0;
    for (let q = 0; q < n; q++) {
      const segL = Math.hypot(arc[q + 1][0] - arc[q][0], arc[q + 1][1] - arc[q][1]);
      const u0 = u, u1 = u + segL; u = u1;
      const a = arc[q], b = arc[q + 1], r0 = rad[q], r1 = rad[q + 1];
      pv(a[0], Y_ROAD - 0.02, a[1], r0[0], 0, r0[1], u0, 0); pv(b[0], Y_ROAD - 0.02, b[1], r1[0], 0, r1[1], u1, 0);
      pv(b[0], kh - ch, b[1], r1[0], 0, r1[1], u1, 0.1); pv(a[0], kh - ch, a[1], r0[0], 0, r0[1], u0, 0.1);
      flush(B, kc);
      const a2 = off(q, ch), b2 = off(q + 1, ch);
      if (ch > 0) {
        pv(a[0], kh - ch, a[1], r0[0], 1, r0[1], u0, 0.1); pv(b[0], kh - ch, b[1], r1[0], 1, r1[1], u1, 0.1);
        pv(b2[0], kh, b2[1], r1[0], 1, r1[1], u1, 0.2); pv(a2[0], kh, a2[1], r0[0], 1, r0[1], u0, 0.2);
        flush(B, kc);
      }
      const a3 = off(q, kb), b3 = off(q + 1, kb);
      pv(a2[0], kh, a2[1], 0, 1, 0, u0, 0.2); pv(b2[0], kh, b2[1], 0, 1, 0, u1, 0.2); pv(b3[0], kh, b3[1], 0, 1, 0, u1, 0.4); pv(a3[0], kh, a3[1], 0, 1, 0, u0, 0.4);
      flush(B, kc);
      B.raise([a, b, b3, a3], kh);
      if (ring) { // pavers as a ring of world-uv quads (never a fan to the centre)
        const w = Math.max(kb + 0.3, Math.min(fp, cn.rc - 0.6));
        const a4 = off(q, w), b4 = off(q + 1, w);
        pv(a3[0], kh, a3[1], 0, 1, 0, a3[0], a3[1]); pv(b3[0], kh, b3[1], 0, 1, 0, b3[0], b3[1]); pv(b4[0], kh, b4[1], 0, 1, 0, b4[0], b4[1]); pv(a4[0], kh, a4[1], 0, 1, 0, a4[0], a4[1]);
        flush(B, fc);
        B.raise([a3, b3, b4, a4], kh);
      }
    }
    if (ring) return;
    // the OUTER side of a bend (the curve bulges toward the plot, its centre of curvature lies in the
    // junction): the footpath is a band of the strip width round the curve. (Closing it through the
    // two back points, as for an inner corner, filled the whole bend with pavers: a D-shaped slab
    // over the junction's own carriageway.)
    {
      const m = n >> 1, cx = (arc[0][0] + arc[n][0]) / 2, cy = (arc[0][1] + arc[n][1]) / 2;
      const bulge = (arc[m][0] - cx) * rad[m][0] + (arc[m][1] - cy) * rad[m][1];
      if (bulge < -0.05) {
        for (let q = 0; q < n; q++) {
          const a3 = off(q, kb), b3 = off(q + 1, kb), a4 = off(q, fp), b4 = off(q + 1, fp);
          pv(a3[0], kh, a3[1], 0, 1, 0, a3[0], a3[1]); pv(b3[0], kh, b3[1], 0, 1, 0, b3[0], b3[1]); pv(b4[0], kh, b4[1], 0, 1, 0, b4[0], b4[1]); pv(a4[0], kh, a4[1], 0, 1, 0, a4[0], a4[1]);
          flush(B, fc);
          B.raise([a3, b3, b4, a4], kh);
          if (!EMIT_LOD) { // back face toward the plot
            const r0 = rad[q], r1 = rad[q + 1];
            pv(a4[0], 0, a4[1], -r0[0], 0, -r0[1], 0, 0); pv(b4[0], 0, b4[1], -r1[0], 0, -r1[1], 1, 0);
            pv(b4[0], kh, b4[1], -r1[0], 0, -r1[1], 1, 0.2); pv(a4[0], kh, a4[1], -r0[0], 0, -r0[1], 0, 0.2);
            flush(B, backC);
          }
        }
        return;
      }
    }
    // plot corner: where the two back lines meet (bA + dA t = bB + dB s, both behind the strip starts)
    const det = sA.d[0] * -sB.d[1] - sA.d[1] * -sB.d[0];
    let K = null;
    if (Math.abs(det) > 1e-4) {
      const rx = sB.b[0] - sA.b[0], ry = sB.b[1] - sA.b[1];
      const t = (rx * -sB.d[1] - ry * -sB.d[0]) / det, s2 = (sA.d[0] * ry - sA.d[1] * rx) / det;
      if (t < 0.05 && s2 < 0.05 && t > -60 && s2 > -60) K = [sA.b[0] + sA.d[0] * t, sA.b[1] + sA.d[1] * t];
    }
    // an acute corner whose plot corner would fall outside the arc: stop at a safe point on the bisector
    const inner = rad.map((r, q) => off(q, kb));
    const rIn = Math.hypot(inner[n >> 1][0] - O[0], inner[n >> 1][1] - O[1]);
    if (K && Math.hypot(K[0] - O[0], K[1] - O[1]) > rIn - 0.3) K = null;
    const poly = inner.slice();
    poly.push(sB.b);
    if (K) poly.push(K);
    poly.push(sA.b);
    const pl = dedupe(poly, 0.02);
    const tris = pl.length >= 3 ? earClip(pl) : null;
    if (tris) for (const t of tris) {
      const a = pl[t[0]], b = pl[t[1]], c = pl[t[2]];
      pv(a[0], kh, a[1], 0, 1, 0, a[0], a[1]); pv(b[0], kh, b[1], 0, 1, 0, b[0], b[1]); pv(c[0], kh, c[1], 0, 1, 0, c[0], c[1]);
      flush(B, fc);
      B.raise([a, b, c], kh);
    }
    // back faces toward the plot (sB.b -> K -> sA.b)
    if (!EMIT_LOD) {
      const back = K ? [sB.b, K, sA.b] : [sB.b, sA.b];
      for (let q = 0; q < back.length - 1; q++) {
        const a = back[q], b = back[q + 1];
        let nx = -(b[1] - a[1]), nz = b[0] - a[0];
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        if ((O[0] - mx) * nx + (O[1] - mz) * nz < 0) { nx = -nx; nz = -nz; }
        pv(a[0], 0, a[1], nx, 0, nz, 0, 0); pv(b[0], 0, b[1], nx, 0, nz, 1, 0);
        pv(b[0], kh, b[1], nx, 0, nz, 1, 0.2); pv(a[0], kh, a[1], nx, 0, nz, 0, 0.2);
        flush(B, backC);
      }
    }
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
    const fa = { x: pa[0] - nx * A.hw, y: pa[1] - nz * A.hw, nx, ny: nz }, fb = { x: pb[0] - nx * A.hw, y: pb[1] - nz * A.hw, nx, ny: nz };
    footStrip(B, fa, fb, 0, L, 1, A.hw, k.fp, k.kh, k.paint, A.piece.kind);
  }

  function emitPath(B, P) {
    if (P.bb2 === undefined) P.bb2 = bboxOf(P.pts, P.hw + 2);
    const bb = P.bb2;
    if (bb[2] < B.x0 || bb[0] > B.x1 || bb[3] < B.z0 || bb[1] > B.z1) return;
    if (!P.nrm) P.nrm = normalsOf(P.pts);
    const L = P.cum[P.cum.length - 1];
    const c = cst(linRGB('#b09c7a'), LY.PATH, { g1: P.hw, age: 0.6 });
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
      job.bake = I && I.Q.baked && I.sunBake && (I.sunBake.sx || I.sunBake.sy) ? { list: [], i: 0, g: null } : null;
      if (job.bake) {
        const M = 240, L = job.bake.list;
        W.queryStructures(ch.x0 - M, ch.y0 - M, ch.x0 + CHS + M, ch.y0 + CHS + M, (sv) => { if (sv.t === 'bldg' || sv.t === 'wall' || sv.t === 'tree') L.push(sv); });
      }
      job.shadow = null;
      return false; // (resume next slice)
    }
    if (job.bake) { // phones: sun shadows rasterised in slices
      if (!bakeShadows(job, ch, m, step, deadline)) return false;
      job.shadow = job.bake.out; job.bake = null;
    }
    if (!job.surf) { job.surf = new Uint8Array(n * n * 4); job.brow = 0; }
    const out = job.surf, yard = job.yard, sh = job.shadow, acc = [0, 0, 0, 0, 0, 0, 0];
    const WT = [1, 2, 1];
    const shK = sh ? 0.22 * I.sunBake.strength + 0.04 : 0; // softer: terrain only (roads ignore the map's alpha)
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
        let ao = 1 - 0.25 * ((acc[5] + acc[6] * 0.5) / 16); // contact AO right next to walls
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
  const SOIL = { tex: null, cell: 32, nx: 0, ny: 0, ms: 0, data: null, row: 0, done: false };
  /** fill the soil colours a few rows per slice (runs during top-down idle time, no THREE needed) */
  function soilStep(deadline) {
    if (SOIL.done) return true;
    const t0 = now(), W = N.world, D = W && W.data, c = SOIL.cell;
    if (!W || !W.built || !D) return false;
    if (!SOIL.data) {
      SOIL.nx = Math.max(2, Math.ceil(N.WORLD_W / c)); SOIL.ny = Math.max(2, Math.ceil(N.WORLD_H / c));
      SOIL.data = new Uint8Array(SOIL.nx * SOIL.ny * 4); SOIL.row = 0; SOIL.ms = 0; SOIL.cache = new Map();
    }
    const nx = SOIL.nx, ny = SOIL.ny, data = SOIL.data, cache = SOIL.cache;
    const put = (o, hex) => { let v = cache.get(hex); if (!v) { v = hexRGB(hex); cache.set(hex, v); } data[o] = v[0] * 255; data[o + 1] = v[1] * 255; data[o + 2] = v[2] * 255; data[o + 3] = 255; };
    while (SOIL.row < ny) {
      const j = SOIL.row++;
      for (let i = 0; i < nx; i++) {
        let d = null; try { d = W.districtAt((i + 0.5) * c, (j + 0.5) * c); } catch (e) { d = null; }
        put((j * nx + i) * 4, (d && d.ground) || '#a98a66');
      }
      if ((SOIL.row & 3) === 0 && now() > deadline) break;
    }
    if (SOIL.row >= ny) {
      for (const pk of D.parks || []) {
        const hex = PARKSOIL[pk.kind];
        if (!hex || !pk.poly) continue;
        scanPoly(pk.poly, c / 2, c / 2, c, ny, (i, j) => put((j * nx + i) * 4, hex), nx);
      }
      SOIL.done = true;
    }
    SOIL.ms = Math.round((SOIL.ms + now() - t0) * 10) / 10;
    return SOIL.done;
  }
  /** the world-wide soil texture (32 u texels) from the precomputed colours (finishes them if needed) */
  function buildSoil() {
    if (!SOIL.done) soilStep(Infinity);
    if (!SOIL.data) return;
    const nx = SOIL.nx, ny = SOIL.ny, c = SOIL.cell;
    if (SOIL.tex) SOIL.tex.dispose();
    const t = new THREE.DataTexture(SOIL.data, nx, ny, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; t.userData.shared = true;
    SOIL.tex = t; SOIL.t.value = t; SOIL.u.value.set(1 / (nx * c), 1 / (ny * c));
  }
  function resetSoil() { if (SOIL.tex) SOIL.tex.dispose(); SOIL.tex = null; if (SOIL.t) SOIL.t.value = null; SOIL.data = null; SOIL.done = false; SOIL.row = 0; }
  /** phones: sun shadows of buildings / walls / trees rasterised on the ground grid (2D paintShadows
   *  rules), a batch of structures per slice on a reused canvas; returns true when done (job.bake.out) */
  let BAKE_CV = null;
  const BAKEMS = { fill: 0, read: 0, n: 0, items: 0 };
  function bakeShadows(job, ch, m, step, deadline) {
    const bk = job.bake, sb = I.sunBake, sx = sb.sx, sy = sb.sy;
    if (!bk.g) {
      if (!BAKE_CV) BAKE_CV = document.createElement('canvas');
      const c = BAKE_CV; if (c.width !== m) { c.width = c.height = m; }
      // willReadFrequently: a CPU canvas (an accelerated one stalls for seconds in getImageData behind
      // the WebGL work on phones / software GL)
      const g = bk.g = c.getContext('2d', { willReadFrequently: true });
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, m, m);
      g.setTransform(1 / step, 0, 0, 1 / step, -(ch.x0 - step) / step + 0.5, -(ch.y0 - step) / step + 0.5);
      g.fillStyle = '#fff';
    }
    const g = bk.g, L = bk.list;
    const tb = now();
    while (bk.i < L.length) {
      g.beginPath();
      const end = Math.min(L.length, bk.i + 48);
      for (; bk.i < end; bk.i++) {
        const s = L[bk.i];
        if (s.t === 'tree') {
          const h = s.h * 0.92, r = s.r * 0.82;
          g.moveTo(s.x + sx * h + r, s.y + sy * h); g.arc(s.x + sx * h, s.y + sy * h, r, 0, TAU); g.closePath();
          continue;
        }
        const h = s.t === 'bldg' && (s.roofType === 'gable' || s.roofType === 'hip') ? s.h + 4 : s.h;
        const ex = sx * h, ey = sy * h, X0 = s.x, Y0 = s.y, X1 = s.x + s.w, Y1 = s.y + s.d;
        g.moveTo(X0, Y0); g.lineTo(X1, Y0); g.lineTo(X1, Y1); g.lineTo(X0, Y1); g.closePath();
        g.moveTo(X0 + ex, Y0 + ey); g.lineTo(X1 + ex, Y0 + ey); g.lineTo(X1 + ex, Y1 + ey); g.lineTo(X0 + ex, Y1 + ey); g.closePath();
        // connecting hull between the footprint and its projection
        g.moveTo(X0, Y0); g.lineTo(X0 + ex, Y0 + ey); g.lineTo(X1 + ex, Y1 + ey); g.lineTo(X1, Y1); g.closePath();
        g.moveTo(X1, Y0); g.lineTo(X1 + ex, Y0 + ey); g.lineTo(X0 + ex, Y1 + ey); g.lineTo(X0, Y1); g.closePath();
      }
      g.fill('nonzero');
      if (now() > deadline) { BAKEMS.fill += now() - tb; return false; }
    }
    BAKEMS.fill += now() - tb;
    const tr = now();
    const d = g.getImageData(0, 0, m, m).data, out = new Float32Array(m * m);
    BAKEMS.read += now() - tr; BAKEMS.n++; BAKEMS.items += L.length;
    for (let i = 0; i < m * m; i++) out[i] = d[i * 4 + 3] / 255;
    bk.out = out;
    return true;
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
// sky seen in a reflection; occ: how much of the low sky is hidden by the city (buildings, trees)
vec3 ngSky(vec3 Rf, float occ){
  vec3 s = mix(uHor, uZen, clamp(Rf.y * 2.4 + 0.32, 0.0, 1.0)) * 0.82;
  return mix(s * (1.0 - 0.72 * occ), s, smoothstep(0.03, 0.34, Rf.y));
}
vec3 ngWaterCol(vec3 lit, vec3 P, vec3 nrm, float t, float deep){
  vec3 Vd = normalize(uCamPos - P);
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(nrm, Vd), 0.0, 1.0), 4.0);
  vec3 Rf = reflect(-Vd, nrm);
  vec3 skyC = ngSky(Rf, 1.0 - deep * 0.6);
  float sd = max(dot(Rf, uSunDir), 0.0);
  float sp = pow(sd, 260.0) * 5.0 + pow(sd, 22.0) * 0.14;
  vec3 base = lit * mix(vec3(0.55, 0.62, 0.6), vec3(0.5, 0.78, 0.82), deep) + vec3(0.004, 0.02, 0.024) * deep;
  return mix(base, skyC, clamp(0.08 + fres * 0.62, 0.0, 0.66)) + sp * uSunCol;
}
`;
  // NB: three r149 uploads cameraPosition only for Phong / Standard / Toon / Shader materials, never for
  // Lambert: these shaders read uCamPos (updated every frame by the 'ground' layer) instead
  const VERT_COMMON = 'varying vec3 vWP;\nuniform vec3 uCamPos;\n';
  function commonUniforms(shader, ud) {
    const U = I.UNI;
    shader.uniforms.uNight = U.uNight; shader.uniforms.uTime = U.uTime; shader.uniforms.uSunDir = U.uSunDir;
    shader.uniforms.uSunCol = U.uSunCol; shader.uniforms.uZen = U.uZen; shader.uniforms.uHor = U.uHor;
    shader.uniforms.uWet = GU.uWet; shader.uniforms.uRain = GU.uRain; shader.uniforms.uCamPos = GU.uCamPos; shader.uniforms.uGain = GU.uGain;
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
uniform float uGain;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uZen;
uniform vec3 uHor;
uniform vec3 uCamPos;
varying vec3 vWP;
float ngWm = 0.0;
float ngShine = 0.0;
float ngGlow = 0.0;
// night readability (r1-6): away from the lamp pools the dark asphalt x dusk / moon light fell to ~1%
// screen luma and kerbs, edges and markings vanished. A small skyglow / moonlight floor on the ground
// (by albedo, so asphalt stays darker than soil and paint) plus paint that catches it (markings, zebras,
// kerb paint: retroreflective road paint under headlights) keeps the street readable at night
#define NG_NIGHT_AMB vec3(0.12, 0.14, 0.19)
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
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * texture2D(auxMap, vec2((vWP.x - uOrigin.x) / 512.0, 1.0 - (vWP.z - uOrigin.y) / 512.0)).rgb * (uNight * 3.0);\n\ttotalEmissiveRadiance += diffuseColor.rgb * uNight * NG_NIGHT_AMB;')
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
// district soil, darkened + clamped so it never sits on the ACES shoulder at noon: roads stay >= ~1.6x
// darker than the ground next to them (D4)
vec3 soil = pow(texture2D(tSoil, P * uSoilK).rgb, vec3(2.2)) * 0.7;
soil *= min(1.0, 0.24 / max(dot(soil, vec3(0.2126, 0.7152, 0.0722)), 1e-3));
soil *= 1.0 + 0.1 * clamp(sw.g * 2.4, 0.0, 1.0) * (1.0 - wPave);   // compacted yards: a little lighter
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
vec3 stone = vec3(0.33, 0.28, 0.215) * (0.68 + 0.56 * th) * (0.88 + 0.24 * n3) * (0.94 + 0.12 * n4);
float gd = min(min(tf.x, 1.0 - tf.x), min(tf.y, 1.0 - tf.y));
float tw = max(tfw.x, tfw.y);
float grout = 1.0 - smoothstep(0.035, 0.035 + tw * 1.2, gd);
grout = mix(grout, 0.17, smoothstep(0.15, 0.45, tw));
stone *= 1.0 - 0.6 * grout;
stone = mix(stone, soil * 0.9, smoothstep(0.7, 0.9, ngN(P * 0.09 + 2.0)) * 0.35);
vec3 sandC = vec3(0.37, 0.3, 0.19) * (0.86 + 0.26 * (n2 - 0.5) + 0.12 * (n4 - 0.5));
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
col *= 1.0 - uWet * 0.4 * (1.0 - wGrass * 0.4);
diffuseColor.rgb = col * uGain;
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
  vec3 Vd = normalize(uCamPos - vWP);
  float fres = pow(1.0 - clamp(Vd.y, 0.0, 1.0), 5.0);
  vec3 Rf = reflect(-Vd, vec3(0.0, 1.0, 0.0));
  outgoingLight = mix(outgoingLight, ngSky(Rf, 0.7) * 0.85, clamp(fres * ngShine, 0.0, 0.45));
}
`;

  function roadCompile(shader) {
    const ud = this.userData;
    commonUniforms(shader, ud);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_COMMON + 'attribute vec2 aRd;\nattribute vec4 aGeo;\nattribute vec4 aMk;\nattribute vec4 aSt;\nvarying vec2 vRd;\nvarying vec4 vGeo;\nvarying vec4 vMk;\nvarying vec4 vSt;\n')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n\tvRd = aRd; vGeo = aGeo; vMk = aMk; vSt = aSt;\n' + POT_DEPTH);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS + 'varying vec2 vRd;\nvarying vec4 vGeo;\nvarying vec4 vMk;\nvarying vec4 vSt;\n' + GLSL_NOISE + GLSL_WATER + ROAD_FUNCS)
      .replace('#include <map_fragment>', ROAD_MAP)
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * texture2D(auxMap, vec2((vWP.x - uOrigin.x) / 512.0, 1.0 - (vWP.z - uOrigin.y) / 512.0)).rgb * (uNight * 3.0);\n\ttotalEmissiveRadiance += diffuseColor.rgb * uNight * (NG_NIGHT_AMB + ngGlow * vec3(0.3, 0.3, 0.27));')
      .replace('#include <envmap_fragment>', ROAD_ENV);
  }
  // Pothole bowls dip below the terrain plane (y = 0): give their vertices the depth of the road plane
  // along the same view ray (screen position unchanged), so they draw above the terrain and below
  // anything standing on the road, while keeping their real shape for shading.
  const POT_DEPTH = `
\tif (aSt.x > 4.5 && aSt.x < 6.5) gl_Position.z -= 3e-6 * gl_Position.w; // decals (paint, tar patches): never z-fight
\tif (aSt.w > 0.001 && uCamPos.y > ${Y_ROAD.toFixed(3)} + 0.05) {
\t\tfloat ngK = (uCamPos.y - ${Y_ROAD.toFixed(3)}) / max(uCamPos.y - vWP.y, 1e-3);
\t\tvec4 ngC = projectionMatrix * viewMatrix * vec4(uCamPos + (vWP - uCamPos) * ngK, 1.0);
\t\tgl_Position.z = ngC.z / ngC.w * gl_Position.w;
\t}
`;
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
ngWm = 0.0; ngShine = 0.0; ngGlow = 0.0;
if (layer < 1.5) {
  col = ngAsphalt(P, base, age, fw);
  float u = vRd.x, v = vRd.y, av = abs(v);
  float L = vGeo.x, hw = vGeo.y;
  float cA = vMk.x, cB = vMk.y, med = vMk.z, bits = vMk.w;
  float uA = u, uB = L - u;
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
    float trK = tr;
    tr *= (0.65 + 0.7 * ngF(vec2(u * 0.045, v * 0.6), fw * 0.05)) * endF * vSt.y;
    col *= 1.0 - 0.2 * tr;
    // oil drips: small (< 0.8 u), rare, only in the wheel tracks / lane centre, at most -15%
    float sh = 0.0;
    float stn = ngBlob(P * 0.9, 0.06, sh) * smoothstep(0.35, 0.75, trK) * endF * (1.0 - smoothstep(0.2, 0.6, fw));
    col *= 1.0 - stn * (0.07 + 0.08 * fract(sh * 7.0));
    // dusty, crumbling edges on old roads
    float sandy = smoothstep(0.42, 0.85, age);
    float en = ngF(P * 0.45, fw * 0.45) * 1.8 + ngF(P * 1.9, fw * 1.9) * 0.9;
    float edge = smoothstep(hw - 0.9 - 0.9 * sandy - en * 0.25, hw - 0.1, av);
    col = mix(col, vec3(0.2, 0.16, 0.1) * (0.8 + 0.4 * en / 2.7), edge * (0.15 + 0.25 * sandy));
    // hairline cracks on older surfaces: block / alligator patterns in patches, wobbly, ~1 px wide
#ifndef NG_LOW
    float cmask = smoothstep(0.62, 0.82, ngN(P * 0.017 + 7.0) * 0.8 + ngN(P * 0.09 + 1.0) * 0.2 + age * 0.22) * (1.0 - smoothstep(0.05, 0.16, fw)) * smoothstep(0.25, 0.55, age);
    if (cmask > 0.001) {
      vec2 cp = P * 0.42 + (vec2(ngN(P * 1.1), ngN(P * 1.1 + 9.0)) - 0.5) * 0.35;
      float e = ngCell2(cp);
      float ew = fwidth(e);
      float crack = 1.0 - smoothstep(0.008, 0.008 + ew * 1.3, e);
      crack *= smoothstep(0.25, 0.6, ngN(P * 0.7 + 3.0)); // broken, not every cell edge
      col *= 1.0 - crack * 0.42 * cmask;
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
    // (zebra crossings + stop lines are decal quads placed exactly where the 2D map paints them)
    float paintWear = mix(1.0, smoothstep(0.2, 0.62, ngF(P * 0.8, fw * 0.8) * 0.7 + ngF(P * 3.1, fw * 3.1) * 0.3), 0.25 + 0.55 * age);
    col = mix(col, vec3(0.80, 0.79, 0.74), m * paintWear * 0.94);
    ngGlow = m * paintWear;
  } else {
    // junction box: worn evenly, a little lighter where traffic polishes it
    col *= 1.0 + 0.05 * (ngF(P * 0.12, fw * 0.12) - 0.5);
  }
  // potholes: broken rim, gravel floor, rainwater
  float pot = vSt.w;
  float wet = step(1.5, pot);
  float pd = pot - 2.0 * wet;
  if (pd > 0.001) {
    // pd: 0..0.72 = the rim slope (outer fifth of the radius), 0.72..1 = the floor. Read as a DIP, not
    // a stain: the floor is the local asphalt x ~0.6 with loose chips, a thin bright broken edge where
    // the asphalt crumbles, a thin dark lip on the steep wall; the bowl normals do the rest
    vec3 asp = col;
    float gr = ngF(P * 3.4, fw * 3.4);
    float rimB = smoothstep(0.02, 0.1, pd) * (1.0 - smoothstep(0.16, 0.3, pd)) * (0.55 + 0.9 * ngF(P * 2.0, fw * 2.0));
    float lip = smoothstep(0.38, 0.5, pd) * (1.0 - smoothstep(0.58, 0.72, pd));
    col *= 1.0 + 0.32 * rimB;
    col *= 1.0 - 0.3 * lip;
    float gh = 0.0;
    float chip = ngBlob(P * 3.6, 0.45, gh) * (1.0 - smoothstep(0.05, 0.15, fw));
    vec3 gravel = asp * vec3(0.66, 0.64, 0.6) * (0.8 + 0.4 * gr) * (1.0 + chip * (0.6 * gh - 0.15));
    col = mix(col, gravel, smoothstep(0.6, 0.76, pd));
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
    ngGlow = y * (1.0 - chip * 0.8);
  } else col = conc;
  col *= 1.0 - 0.12 * smoothstep(0.4, 0.0, vRd.y) * step(vRd.y, 0.15);
  ngShine = uWet * 0.2;
} else if (layer < 4.5) {
  // median top: dusty soil with a few grass tufts
  float g = ngF(P * 0.9, fw * 0.9), g2 = ngF(P * 3.3, fw * 3.3);
  col = mix(base * (0.8 + 0.4 * g), vec3(0.09, 0.15, 0.04) * (0.7 + 0.6 * g2), smoothstep(0.5, 0.75, g * 0.6 + g2 * 0.4));
} else if (layer < 5.5) {
  // road paint decal (zebra, stop line, bus bay): worn in patches, asphalt grain shows through
  float wn = ngF(P * 0.9, fw * 0.9) * 0.7 + ngF(P * 3.3, fw * 3.3) * 0.3;
  vec3 asp = ngAsphalt(P, vec3(0.05, 0.05, 0.055), age, fw);
  float pc = smoothstep(0.18, 0.42, wn + 0.32 - age * 0.32);
  col = mix(asp, base * (0.92 + 0.12 * ngF(P * 2.0, fw * 2.0)), pc);
  ngGlow = pc;
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
col *= mix(1.0, tn.a, layer < 1.5 ? 0.0 : 0.5); // baked shadows / contact AO: terrain only, footpaths half
col *= 1.0 - uWet * (layer < 1.5 ? 0.42 : 0.25);
diffuseColor.rgb = col * uGain;
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
  vec3 Vd = normalize(uCamPos - vWP);
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(Vd.y, 0.0, 1.0), 5.0);
  vec3 Rf = reflect(-Vd, vec3(0.0, 1.0, 0.0));
  float sd = max(dot(Rf, uSunDir), 0.0);
  outgoingLight = mix(outgoingLight, ngSky(Rf, 1.0) * 0.8, clamp(fres * ngShine, 0.0, 0.55)) + uSunCol * pow(sd, 90.0) * 0.6 * ngShine;
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
  const STATS = { built: 0, ms: 0, lastMs: 0, roadsRebuilt: 0 };
  const STEPMAX = []; // longest single step slice per step (ms)
  const OVER = []; // last slices' overrun past their deadline (ms)
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
          case 0: if (!NET.built && !analyzeStep(deadline)) break; if (!SOIL.done && !soilStep(deadline)) break; if (!SOIL.tex) buildSoil(); job.step = 1; break;
          case 1: if (!ch.aux) I.buildAux(ch); job.step = 2; break;
          case 2: if (buildSurf(job, deadline)) job.step = job.what === 'map' ? 4 : 3; break;
          case 3: job.bucket = job.bucket || chunkBucket(ch); if (roadsJob(job, deadline)) job.step = 4; break;
          case 4: prepareFinish(job); job.step = 5; break;
          case 5: finishJob(job); job.step = 6; break;
          default: job.step = 6;
        }
        const dts = now() - ts;
        STEPMS[st0] = (STEPMS[st0] || 0) + dts; if (!(STEPMAX[st0] >= dts)) STEPMAX[st0] = dts;
        if (now() > deadline && job.step < 6) break;
      }
    } catch (e) {
      N.err('view3d.ground.chunk', e);
      job.step = 6; job.failed = true;
      finishJob(job, true);
    }
    const t1 = now();
    job.t += t1 - t0;
    // frame-budget overrun of this slice (tests: no long main-thread hitches)
    OVER.push(Math.max(0, t1 - deadline)); if (OVER.length > 256) OVER.shift();
    return job.step >= 6;
  }
  /** upload step 1 (its own slice): the road geometry + the ground map texture */
  function prepareFinish(job) {
    if (job.what !== 'map') job.geo = job.B.build();
    if (job.surf && job.what !== 'map') job.tex = dataTex(job.surf, job.sn, true);
  }
  function finishJob(job, failed) {
    const ch = job.ch, G = ch.ng || (ch.ng = {});
    if (!failed && job.what !== 'map' && job.geo === undefined) prepareFinish(job);
    if (!failed) {
      // ground map + terrain plane (kept when only the roads are rebuilt; refreshed in place on a re-bake)
      if (job.surf) {
        if (job.what === 'map' && G.surfTex && G.surfTex.image.data.length === job.surf.length) { G.surfTex.image.data.set(job.surf); G.surfTex.needsUpdate = true; }
        else {
          if (G.terrain) { ch.group.remove(G.terrain); G.terrain.material.dispose(); G.terrain = null; }
          if (G.surfTex) G.surfTex.dispose();
          G.surfTex = job.tex || dataTex(job.surf, job.sn, true); G.sn = job.sn; job.tex = null;
          if (!PLANE) { PLANE = new THREE.PlaneGeometry(CHS, CHS, 1, 1); PLANE.rotateX(-Math.PI / 2); PLANE.translate(CHS / 2, 0, CHS / 2); PLANE.userData.shared = true; }
          const tm = new THREE.Mesh(PLANE, newTerrainMat(ch, G));
          tm.name = 'ground-terrain'; tm.receiveShadow = true; tm.matrixAutoUpdate = false; tm.updateMatrix(); tm.renderOrder = 2;
          G.terrain = tm; ch.group.add(tm);
          if (G.road) G.road.material.userData.surf.value = G.surfTex;
          try { I.E.renderer.initTexture(G.surfTex); } catch (e) { /* uploaded on first draw */ }
        }
      }
      if (job.what !== 'map') {
        const geo = job.geo; job.geo = null;
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
    dropProv(ch);
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
    dropProv(ch);
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

  /* ================================================================ provisional ground (D1) */
  // Until a chunk's full job finishes, it shows a cheap provisional layer built straight from
  // N.world.data.roads (flat asphalt ribbons + joint discs per kind, footpaths as a lighter band, no
  // analysis, junction or marking work) over a terrain plane drawn by the real terrain shader with a
  // flat 2x2 ground map (soil, water from the aux texture). Same programs as the final ground: the
  // swap never compiles a shader. Built in a few ms per chunk, so the scene's bare 'outer' plane never
  // shows where the city stands and the roads are there from the first 3D frame.
  const PROV = { bb: null, surf: null, rb: null, built: 0, ms: 0, max: 0 };
  const PROV_Y = { path: Y_PATH, lane: Y_ROAD - 0.03, street: Y_ROAD - 0.02, bund: Y_ROAD - 0.02, bridge: Y_ROAD - 0.01, arterial: Y_ROAD - 0.01 };
  function provRoadBoxes() {
    const R = (N.world && N.world.data && N.world.data.roads) || [];
    const bb = new Float32Array(R.length * 4);
    const FOOT = (N.world && N.world.FOOT) || {};
    R.forEach((r, k) => {
      if (!r || !r.pts || r.pts.length < 2) { bb[k * 4] = Infinity; return; }
      const b = bboxOf(r.pts, (r.w || 8) / 2 + (FOOT[r.kind] || 0) + 2);
      bb[k * 4] = b[0]; bb[k * 4 + 1] = b[1]; bb[k * 4 + 2] = b[2]; bb[k * 4 + 3] = b[3];
    });
    PROV.bb = bb;
  }
  function provSurf() {
    if (!PROV.surf) {
      const d = new Uint8Array(16); for (let i = 3; i < 16; i += 4) d[i] = 255;
      PROV.surf = dataTex(d, 2, false); PROV.surf.userData.shared = true;
    }
    return PROV.surf;
  }
  function buildProv(ch) {
    const t0 = now(), G = ch.ng || (ch.ng = { ready: false });
    if (G.prov || G.ready) return;
    // soil colours not finished yet: a flat placeholder (the shared uniform switches when they are)
    if (!SOIL.tex) { if (SOIL.done) buildSoil(); else if (!SOIL.t.value) { const d = new Uint8Array([169, 138, 102, 255]); const t = dataTex(d, 1, false); t.userData.shared = true; SOIL.t.value = t; } }
    if (!ch.aux) I.buildAux(ch);
    const W = N.world, R = (W && W.data && W.data.roads) || [], FOOT = (W && W.FOOT) || {};
    if (!PROV.bb || PROV.bb.length !== R.length * 4) provRoadBoxes();
    const B = PROV.rb ? PROV.rb.reset(ch.x0, ch.y0) : (PROV.rb = new RB(ch.x0, ch.y0));
    const bb = PROV.bb, x0 = ch.x0, y0 = ch.y0, x1 = x0 + CHS, y1 = y0 + CHS;
    const order = [];
    for (let k = 0; k < R.length; k++) if (!(bb[k * 4] > x1 || bb[k * 4 + 2] < x0 || bb[k * 4 + 1] > y1 || bb[k * 4 + 3] < y0)) order.push(k);
    for (const k of order) {
      const r = R[k], hw = (r.w || 8) / 2, pts = r.pts, path = r.kind === 'path';
      const y = PROV_Y[r.kind] || Y_ROAD - 0.02;
      const st = path ? null : roadStyle(r, pts[0][0], pts[0][1]);
      const c = path ? cst(linRGB('#b09c7a'), LY.PATH, { g1: hw, age: 0.6 })
        : cst(st.c, LY.ROAD, { g0: 1e6, g1: hw, m0: -1e6, m1: -1e6, m3: r.kind === 'lane' ? BIT.LANEKIND : 0, p1: 0, age: st.age });
      const jc = path ? c : cst(st.c, LY.JUNC, { p1: 0, age: st.age });
      const fp = FOOT[r.kind] || 0;
      const fc = fp > 0 ? cst(linRGB(FOOTCOL[r.kind] || FOOTCOL.street), LY.FOOT, { age: 0.5, g1: 1e6 }) : null;
      let u = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1e-3) continue;
        const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
        pv(a[0] - nx * hw, y, a[1] - ny * hw, 0, 1, 0, u, -hw); pv(a[0] + nx * hw, y, a[1] + ny * hw, 0, 1, 0, u, hw);
        pv(b[0] + nx * hw, y, b[1] + ny * hw, 0, 1, 0, u + L, hw); pv(b[0] - nx * hw, y, b[1] - ny * hw, 0, 1, 0, u + L, -hw);
        flush(B, c);
        if (fc) for (const sd of [-1, 1]) { // footpath band (lighter), under every carriageway
          const va = sd * hw, vb = sd * (hw + fp), yf = Y_PATH - 0.015;
          pv(a[0] + nx * va, yf, a[1] + ny * va, 0, 1, 0, u, 0); pv(a[0] + nx * vb, yf, a[1] + ny * vb, 0, 1, 0, u, fp);
          pv(b[0] + nx * vb, yf, b[1] + ny * vb, 0, 1, 0, u + L, fp); pv(b[0] + nx * va, yf, b[1] + ny * va, 0, 1, 0, u + L, 0);
          flush(B, fc);
        }
        u += L;
      }
      for (let i = 0; i < pts.length; i++) { // joint discs: no gaps at bends, round ends at junction nodes
        const b = pts[i], K = 10;
        if (b[0] < x0 - hw || b[0] > x1 + hw || b[1] < y0 - hw || b[1] > y1 + hw) continue;
        for (let q = 0; q < K; q++) { const g = q / K * TAU; pv(b[0] + Math.cos(g) * hw, y - 0.002, b[1] + Math.sin(g) * hw, 0, 1, 0, 0, 0); }
        flush(B, jc);
      }
    }
    const geo = B.build();
    const T = { surfTex: provSurf(), sn: 2 };
    if (!PLANE) { PLANE = new THREE.PlaneGeometry(CHS, CHS, 1, 1); PLANE.rotateX(-Math.PI / 2); PLANE.translate(CHS / 2, 0, CHS / 2); PLANE.userData.shared = true; }
    const tm = new THREE.Mesh(PLANE, newTerrainMat(ch, T));
    tm.name = 'ground-prov-terrain'; tm.receiveShadow = true; tm.matrixAutoUpdate = false; tm.updateMatrix(); tm.renderOrder = 2;
    ch.group.add(tm);
    let rm = null;
    if (geo) {
      rm = new THREE.Mesh(geo, newRoadMat(ch, T));
      rm.name = 'ground-prov-roads'; rm.receiveShadow = true; rm.matrixAutoUpdate = false; rm.updateMatrix(); rm.renderOrder = 1;
      ch.group.add(rm);
    }
    G.prov = { terrain: tm, road: rm };
    PROV.built++; PROV.ms += now() - t0; PROV.max = Math.max(PROV.max, now() - t0);
  }
  function dropProv(ch) {
    const G = ch.ng, P = G && G.prov;
    if (!P) return;
    ch.group.remove(P.terrain); P.terrain.material.dispose();
    if (P.road) { ch.group.remove(P.road); P.road.geometry.dispose(); P.road.material.dispose(); }
    G.prov = null;
  }

  /* ================================================================ priority + idle precompute (D1) */
  function focusXY() {
    const R = N.render, m = N.state && N.state.mode;
    if (R && R.cam && (R.camOverride || m === 'title' || m === 'boot')) return R.cam;
    const p = N.player;
    if (p && isFinite(p.x) && isFinite(p.y)) return p;
    return R && R.cam ? R.cam : null;
  }
  /** the chunk under the focus first: provisional ground for every chunk that has none (cheap), then
   *  the focus chunk's full job gets its own slice (another chunk's job is set aside for it) */
  function prioritize(budget) {
    if (!I || !provider.enabled || !I.chunks.size) return;
    const t0 = now(), deadline = t0 + budget;
    const f = focusXY();
    if (!f) return;
    const fch = I.chunks.get(bkey(Math.floor(f.x / CHS), Math.floor(f.y / CHS))) || null;
    try {
      if (fch && !(fch.ng && (fch.ng.ready || fch.ng.prov))) buildProv(fch);
      // neighbours by distance, while the slice lasts
      const list = [];
      for (const ch of I.chunks.values()) if (!(ch.ng && (ch.ng.ready || ch.ng.prov))) list.push(ch);
      if (list.length) {
        const d = (ch) => Math.hypot(ch.x0 + CHS / 2 - f.x, ch.y0 + CHS / 2 - f.y);
        list.sort((a, b) => d(a) - d(b));
        for (const ch of list) { if (now() > t0 + Math.min(budget * 0.5, 6)) break; buildProv(ch); }
      }
      if (fch && !(fch.ng && fch.ng.ready) && now() < deadline) {
        if (ACTIVE && ACTIVE.ch !== fch) { const A = ACTIVE; if (A.ch.ng && A.ch.ng.job === A) A.ch.ng.job = null; ACTIVE = null; }
        provider.step(fch, 0, deadline);
      }
    } catch (e) { N.err('view3d.ground.priority', e); }
  }
  // the global analysis + soil colours run in idle slices while the game is still top-down, so the
  // first switch to 3D starts with them done (they never need THREE)
  let idleH = 0, lastSlice = 0;
  const precomputed = () => NET.built && !AN && SOIL.done;
  function idleKick() {
    if (idleH || precomputed()) return;
    const ric = window.requestIdleCallback;
    idleH = ric ? ric(idleRun, { timeout: 300 }) : setTimeout(() => idleRun(null), 30);
    if (!ric) idleH = idleH || 1;
  }
  function precomputeSlice(ms) {
    const W = N.world;
    if (!W || !W.built || !W.roads || precomputed()) return false;
    if (ACTIVE && ACTIVE.step === 0) return false; // a chunk job is driving the analysis
    const dead = now() + ms;
    try {
      if (!NET.built) analyzeStep(dead);
      if (NET.built && !SOIL.done && now() < dead) soilStep(dead);
    } catch (e) { N.err('view3d.ground.idle', e); }
    return true;
  }
  function idleRun(dl) {
    idleH = 0;
    const W = N.world;
    if (!W || !W.built || !W.roads) { setTimeout(idleKick, 400); return; }
    if (dl && !dl.didTimeout) precomputeSlice(clamp(dl.timeRemaining() - 1, 1, 10));
    if (!precomputed()) idleKick();
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
      // (the network analysis is kept: it may already be done from the top-down idle time)
      sinkOuter(provider.enabled);
      GU.uWet = { value: 0 }; GU.uRain = { value: 0 }; GU.uGain = { value: 1 }; GU.uCamPos = { value: new THREE.Vector3() };
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
      if (!G.ready && !G.prov) { buildProv(ch); if (now() > deadline) return; }
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

  // The terrain plane is drawn with polygonOffset (factor 1) so the road ribbons 0.08 above always win;
  // at grazing angles 40-300 u out that slope term pushes its depth past the scene's flat 'outer'
  // fallback plane (y = -0.4), which then shows through as a bare orange plain between the roads.
  // With our ground the outer plane only has to fill beyond the draw distance: sink it well below.
  function sinkOuter(on) {
    try {
      const o = I && I.E && I.E.scene && I.E.scene.getObjectByName('outer');
      if (!o) return;
      if (o.userData.ngY == null) o.userData.ngY = o.position.y;
      o.position.y = on ? -25 : o.userData.ngY;
      o.updateMatrix(); o.updateMatrixWorld();
    } catch (e) { /* engine not ready */ }
  }
  function setEnabled(on) {
    on = !!on;
    if (on === provider.enabled) return on;
    provider.enabled = on;
    sinkOuter(on);
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
  let wetT = 0, lastPot = -1, wetForce = null;
  V.registerLayer('ground', {
    order: -10,
    init() { },
    update(dt, H) {
      if (!GU.uWet) return;
      const cam = (H && H.camera) || (I && I.E.camera);
      if (cam) GU.uCamPos.value.copy(cam.position);
      // ground gain (D4): with sun 2.75 + hemi 0.9 through ACES the noon ground sat on the curve's
      // shoulder (soil, lanes, plaza tiles all ~205 sRGB). Scale the ground's albedo down as the
      // irradiance on a flat surface rises, so detail and road / soil contrast survive midday; dusk and
      // night (low irradiance) keep gain 1
      try {
        const E = I && I.E, SUN = I && I.SUN;
        if (E && E.sun && E.hemi) {
          const up = SUN && SUN.lightDir ? Math.max(0, SUN.lightDir.y) : 0.7;
          const L = E.sun.intensity * up + E.hemi.intensity * 0.85;
          const g = clamp(1.6 / Math.max(L, 0.1), 0.5, 1);
          GU.uGain.value = g; // (the time of day moves slowly: no smoothing needed)
        }
      } catch (e) { /* first frames */ }
      // the chunk under the player first (its own slice while it has no finished ground)
      prioritize(I && I.Q.tier === 'low' ? 8 : 10);
      let raining = false;
      try { raining = !!(N.seasons && N.seasons.is && N.seasons.is('rain')) || !!(N.flags && N.flags.rain === true); } catch (e) { raining = false; }
      const target = raining ? 1 : 0;
      // roads darken in a few seconds when the shower starts and dry out slowly (tests may force it)
      if (wetForce != null) wetT = wetForce;
      else wetT += (target - wetT) * Math.min(1, dt * (raining ? 0.5 : 0.06));
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
  N.on('potholes:change', () => { POTVIS.clear(); if (I) I.replan(); });
  // while the 3D view warms up (still drawn top-down) the focus chunk gets the whole warm slice too
  if (N.addSystem) N.addSystem({
    id: 'view3d_ground', order: 62, runIn: ['*'],
    update() {
      if (I && I.E && I.E.warming) { prioritize(16); return; }
      // top-down: a small slice of every frame (idle callbacks alone are too rare while the 2D game
      // renders), so the analysis is done a few seconds after the world is built
      if (!precomputed() && now() - lastSlice > 12) { // once per frame (sub-steps)
        const m = N.state && N.state.mode, loading = !!(N.view && N.view.loading);
        // title screen / 3D library loading: nothing else to do, bigger slices; playing top-down: small
        precomputeSlice(loading ? 14 : m === 'title' || m === 'boot' ? 10 : 5);
        lastSlice = now();
      }
    },
  });
  idleKick();
  // a new world (map rebuild): analyse again and rebuild every chunk's ground from scratch
  N.on('world:built', () => { NET.built = false; AN = null; POTS.clear(); POTVIS.clear(); PROV.bb = null; resetSoil(); idleKick(); if (I) { for (const ch of I.chunks.values()) disposeChunk(ch); I.replan(); } });

  /* ================================================================ API */
  V.groundHeightAt = groundHeightAt;
  V.ground = {
    get enabled() { return provider.enabled; },
    setEnabled,
    heightAt: groundHeightAt,
    potholeDip,
    /** tests / cutscenes: force the road wetness 0..1 (null = follow the weather again) */
    setWet(v) { wetForce = v == null ? null : clamp(+v || 0, 0, 1); if (wetForce != null) { wetT = wetForce; if (GU.uWet) GU.uWet.value = wetT; } return wetT; },
    /** re-analyse the road network and rebuild every chunk's ground */
    rebuild() { NET.built = false; AN = null; POTS.clear(); POTVIS.clear(); if (I) { for (const ch of I.chunks.values()) disposeChunk(ch); I.replan(); } },
    stats() {
      let chunks = 0, tris = 0, tex = 0;
      if (I) for (const ch of I.chunks.values()) if (ch.ng && ch.ng.ready) { chunks++; tris += ch.ng.tris || 0; if (ch.ng.surfTex) tex += 1; }
      return {
        enabled: provider.enabled, analyzed: NET.built, analyzeMs: NET.ms, analyzeWallMs: NET.wallMs, pieces: NET.pieces.length, junctions: NET.juncs.filter((j) => j.poly).length,
        zebras: NET.pieces.reduce((a, P) => a + (P.ends[0].zebra ? 1 : 0) + (P.ends[1].zebra ? 1 : 0), 0), bays: NET.bays.length,
        chunks, roadTris: tris, textures: tex, built: STATS.built, avgChunkMs: STATS.built ? +(STATS.ms / STATS.built).toFixed(2) : 0, lastChunkMs: +STATS.lastMs.toFixed(2),
        wet: +(GU.uWet ? GU.uWet.value : 0).toFixed(2), potVer: curPot(), clear: NET.clear || null,
        stepMs: STEPMS.map((v) => +(v || 0).toFixed(1)), anaMs: ANAMS.map((v) => +(v || 0).toFixed(1)), anaMax: ANAMAX.map((v) => +(v || 0).toFixed(1)), soilMs: SOIL.ms,
        overMs: (() => { if (!OVER.length) return { p50: 0, p95: 0, max: 0, n: 0 }; const a = OVER.slice().sort((x, y) => x - y); return { p50: +a[a.length >> 1].toFixed(1), p95: +a[Math.floor(a.length * 0.95)].toFixed(1), max: +a[a.length - 1].toFixed(1), n: a.length }; })(),
        bake: { fill: Math.round(BAKEMS.fill), read: Math.round(BAKEMS.read), n: BAKEMS.n, items: BAKEMS.items },
        stepMax: STEPMAX.map((v) => +(v || 0).toFixed(1)), provMaxMs: +PROV.max.toFixed(1),
        precomputed: precomputed(), provBuilt: PROV.built, provAvgMs: PROV.built ? +(PROV.ms / PROV.built).toFixed(2) : 0,
        provChunks: I ? Array.from(I.chunks.values()).filter((ch) => ch.ng && ch.ng.prov).length : 0,
        focusReady: (() => { const f = focusXY(), ch = f && chunkAt(f.x, f.y); return !!(ch && ch.ng && ch.ng.ready); })(),
        focusCovered: (() => { const f = focusXY(), ch = f && chunkAt(f.x, f.y); return !!(ch && ch.ng && (ch.ng.ready || ch.ng.prov)); })(),
      };
    },
    /** tests (D5): emit the kerbed junctions (+ their arm pieces) near (x, y) into a scratch builder
     *  and count overlapping raised top polygons (kerb bands + pavers) per junction: should be 0 */
    kerbOverlaps(x, y, radius, maxJ, only) {
      if (!NET.built) return null;
      if (!(isFinite(x) && isFinite(y))) { x = N.player.x; y = N.player.y; } // no args: around the player
      const R = radius || 1500, out = { junctions: 0, corners: 0, pairs: 0, worst: [], detail: maxJ === 1 ? [] : null };
      const js = NET.juncs.filter((J) => J.kerbs && J.kerbs.some((k) => k.type === 'arc' && k.A.fp > 0 && k.B.fp > 0) && Math.hypot(J.x - x, J.y - y) < R)
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, maxJ || 60);
      const B = new RB(0, 0);
      const area = (t) => Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0])) / 2;
      const clipTri = (subj, clip) => { // convex clip (Sutherland-Hodgman), both CCW-normalised
        let o = subj;
        for (let i = 0; i < clip.length && o.length; i++) {
          const a = clip[i], b = clip[(i + 1) % clip.length], inp = o; o = [];
          const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
          for (let k = 0; k < inp.length; k++) {
            const p = inp[k], q = inp[(k + 1) % inp.length], sp = side(p), sq = side(q);
            if (sp >= 0) o.push(p);
            if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); o.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
          }
        }
        let A = 0; for (let i = 0; i < o.length; i++) { const p = o[i], q = o[(i + 1) % o.length]; A += p[0] * q[1] - q[0] * p[1]; }
        return Math.abs(A) / 2;
      };
      const ccw = (t) => ((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]) < 0 ? [t[0], t[2], t[1]] : t);
      for (const J of js) {
        B.reset(J.x - CHS / 2, J.y - CHS / 2);
        EMIT_LOD = 0;
        if (only !== 'pieces') emitJunction(B, J);
        if (only !== 'junction') for (const a of J.arms) emitPiece(B, a.piece, null);
        const tris = [];
        for (let i = 0; i < B.ni; i += 3) {
          const ia = B.I[i], ib = B.I[i + 1], ic = B.I[i + 2], L = B.ST[ia * 4];
          if (!(Math.abs(L - LY.KERB) < 0.5 || Math.abs(L - LY.FOOT) < 0.5)) continue;
          if (B.Nn[ia * 3 + 1] < 120 || B.P[ia * 3 + 1] < 0.3) continue; // raised top surfaces only
          const t = [ia, ib, ic].map((k) => [B.P[k * 3] + B.x0, B.P[k * 3 + 2] + B.z0]);
          if (Math.hypot(t[0][0] - J.x, t[0][1] - J.y) > 45 || area(t) < 1e-3) continue;
          const bb = [Math.min(t[0][0], t[1][0], t[2][0]), Math.min(t[0][1], t[1][1], t[2][1]), Math.max(t[0][0], t[1][0], t[2][0]), Math.max(t[0][1], t[1][1], t[2][1])];
          tris.push({ t: ccw(t), bb, L: Math.round(L), pc: B.P[ia * 3 + 1] });
        }
        let pairs = 0, worst = 0;
        for (let i = 0; i < tris.length; i++) for (let k = i + 1; k < tris.length; k++) {
          const a = tris[i], b = tris[k];
          if (a.bb[2] < b.bb[0] || b.bb[2] < a.bb[0] || a.bb[3] < b.bb[1] || b.bb[3] < a.bb[1]) continue;
          const ov = clipTri(a.t, b.t);
          if (ov > 0.05) { pairs++; worst = Math.max(worst, ov); if (out.detail && out.detail.length < 12) out.detail.push([a.L, b.L, +ov.toFixed(2), a.t.map((p) => p.map((v) => +v.toFixed(1))), b.t.map((p) => p.map((v) => +v.toFixed(1)))]); }
        }
        out.junctions++; out.corners += J.kerbs.filter((k) => k.type === 'arc').length; out.pairs += pairs;
        if (pairs) out.worst.push({ id: J.id, x: Math.round(J.x), y: Math.round(J.y), pairs, area: +worst.toFixed(2) });
      }
      out.worst.sort((a, b) => b.pairs - a.pairs); out.worst = out.worst.slice(0, 8);
      return out;
    },
    /** tests (r1-2 / r1-3): raised footpath + kerb tops (junction corners and piece strips) within R of
     *  (x, y) that lie on a carriageway (another road's trimmed ribbon, or any junction polygon, the
     *  corner's own junction included): a footpath slab across the road, a stray kerb end standing in
     *  the asphalt. Should be ~0. (Point-in-outline predicate; tests/view3d_ground.cjs also grades the
     *  emitted triangles directly, independent of this.)
     *  -> {tris, hits, area (u^2 on carriageways), worst: [{src, on, x, y, area}]} */
    footOnRoad(x, y, R) {
      if (!NET.built) return null;
      if (!(isFinite(x) && isFinite(y))) { x = N.player.x; y = N.player.y; }
      R = R || 300;
      const tris = this.topTris(x, y, R).filter((t) => t.up && (t.L === LY.FOOT || t.L === LY.KERB) && t.t[0][2] > 0.3);
      const inPoly = (pl, px, py) => { let c = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const a = pl[i], b = pl[j]; if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
      const pieces = NET.pieces.filter((P) => !P.internal && P.bb && !(P.bb[2] < x - R - 60 || P.bb[0] > x + R + 60 || P.bb[3] < y - R - 60 || P.bb[1] > y + R + 60));
      const juncs = NET.juncs.filter((J) => J.poly && Math.hypot(J.x - x, J.y - y) < R + 150);
      const out = { tris: tris.length, hits: 0, area: 0, worst: [] };
      for (const t of tris) {
        const cx = (t.t[0][0] + t.t[1][0] + t.t[2][0]) / 3, cy = (t.t[0][1] + t.t[1][1] + t.t[2][1]) / 3;
        const ar = Math.abs((t.t[1][0] - t.t[0][0]) * (t.t[2][1] - t.t[0][1]) - (t.t[1][1] - t.t[0][1]) * (t.t[2][0] - t.t[0][0])) / 2;
        if (ar < 0.02) continue;
        let on = null;
        for (const P of pieces) {
          if ('P' + P.id === t.s || cx < P.bb[0] || cx > P.bb[2] || cy < P.bb[1] || cy > P.bb[3]) continue;
          const q = projectOn(P.pts, P.cum, cx, cy, P.ends[0].trim, P.L - P.ends[1].trim);
          if (q && q.s > P.ends[0].trim + 0.5 && q.s < P.L - P.ends[1].trim - 0.5 && Math.abs(q.v) < P.hw - 0.75) { on = 'P' + P.id; break; }
        }
        if (!on) for (const J of juncs) if (inPoly(J.poly, cx, cy)) { // (its own junction too: a corner slab on its own asphalt)
          // the point must be well inside (not on the kerb line the corner shares with the polygon)
          let dmin = Infinity;
          for (let i = 0, j = J.poly.length - 1; i < J.poly.length; j = i++) { const a = J.poly[j], b = J.poly[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1; const u = clamp(((cx - a[0]) * dx + (cy - a[1]) * dy) / L2, 0, 1); dmin = Math.min(dmin, Math.hypot(cx - a[0] - dx * u, cy - a[1] - dy * u)); }
          if (dmin > 0.75) { on = 'J' + J.id; break; }
        }
        if (on) { out.hits++; out.area += ar; if (out.worst.length < 12) out.worst.push({ src: t.s, L: t.L, on, x: +cx.toFixed(1), y: +cy.toFixed(1), area: +ar.toFixed(2) }); }
      }
      out.area = +out.area.toFixed(1);
      return out;
    },
    /** debug (D5): kerbed corner geometry near (x, y): tangent vs strip-start mismatch, radii */
    cornerInfo(x, y, r) {
      const out = [];
      for (const J of NET.juncs) {
        if (!J.kerbs || Math.hypot(J.x - x, J.y - y) > (r || 300)) continue;
        for (const k of J.kerbs) {
          if (k.type !== 'arc' || k.straight || !(k.A.fp > 0 && k.B.fp > 0)) continue;
          const sA = stripStart(k.A, 1), sB = stripStart(k.B, -1), cn = k.cn;
          out.push({ j: J.id, x: Math.round(J.x), y: Math.round(J.y), rc: +cn.rc.toFixed(1), phi: +cn.phi.toFixed(2), tA: +cn.tA.toFixed(1), tB: +cn.tB.toFixed(1),
            dA: +Math.hypot(sA.k[0] - cn.TA[0], sA.k[1] - cn.TA[1]).toFixed(2), dB: +Math.hypot(sB.k[0] - cn.TB[0], sB.k[1] - cn.TB[1]).toFixed(2) });
        }
      }
      return out;
    },
    /** debug (D5): per kerbed corner of junction id: raised top triangles that overlap inside the corner */
    cornerSelf(jid) {
      const J = NET.juncs[jid]; if (!J || !J.kerbs) return null;
      const B = new RB(J.x - CHS / 2, J.y - CHS / 2), res = [];
      for (const k of J.kerbs) {
        if (k.type !== 'arc' || k.straight) continue;
        B.reset(J.x - CHS / 2, J.y - CHS / 2); arcKerb(B, J, k);
        const tris = [];
        for (let i = 0; i < B.ni; i += 3) {
          const ia = B.I[i]; if (B.Nn[ia * 3 + 1] < 120 || B.P[ia * 3 + 1] < 0.3) continue;
          tris.push({ L: B.ST[ia * 4], t: [B.I[i], B.I[i + 1], B.I[i + 2]].map((q) => [B.P[q * 3] + B.x0, B.P[q * 3 + 2] + B.z0]) });
        }
        const sA = stripStart(k.A, 1), sB = stripStart(k.B, -1);
        res.push({ rc: k.cn.rc, phi: +k.cn.phi.toFixed(2), n: tris.length, kerbTris: tris.filter((t) => t.L === LY.KERB).length, dA: +Math.hypot(sA.k[0] - k.cn.TA[0], sA.k[1] - k.cn.TA[1]).toFixed(2), dB: +Math.hypot(sB.k[0] - k.cn.TB[0], sB.k[1] - k.cn.TB[1]).toFixed(2), tris: tris.slice(0, 60).map((t) => [t.L].concat(t.t.map((p) => [+p[0].toFixed(2), +p[1].toFixed(2)]))) });
      }
      return res;
    },
    /** debug (D6): the slowest junction polygons to rebuild (ms, outline points) */
    slowJunctions(k) {
      const out = [];
      for (const J of NET.juncs) { if (!J.poly) continue; const t = now(); junctionPoly(J); out.push({ id: J.id, ms: +(now() - t).toFixed(2), n: J.poly.length, arms: J.arms.length }); }
      return out.sort((a, b) => b.ms - a.ms).slice(0, k || 6);
    },
    /** debug: every emitted triangle (ground mesh, before chunk upload) within R of (x, y), tagged by
     *  source (J<junction id> / P<piece id>), layer and height: for plotting junction geometry in 2D */
    topTris(x, y, R) {
      if (!NET.built) return null;
      R = R || 60;
      const B = new RB(0, 0), out = [];
      const grab = (tag) => {
        for (let i = 0; i < B.ni; i += 3) {
          const ia = B.I[i], ib = B.I[i + 1], ic = B.I[i + 2];
          const t = [ia, ib, ic].map((k) => [+(B.P[k * 3] + B.x0).toFixed(2), +(B.P[k * 3 + 2] + B.z0).toFixed(2), +B.P[k * 3 + 1].toFixed(2)]);
          if (t.every((p) => Math.hypot(p[0] - x, p[1] - y) > R)) continue;
          out.push({ s: tag, L: Math.round(B.ST[ia * 4]), up: B.Nn[ia * 3 + 1] > 100, t });
        }
      };
      EMIT_LOD = 0;
      for (const J of NET.juncs) {
        if (!(J.poly || J.decals) || Math.hypot(J.x - x, J.y - y) > R + 80) continue;
        B.reset(x - CHS / 2, y - CHS / 2); emitJunction(B, J); grab('J' + J.id);
      }
      for (const P of NET.pieces) {
        if (!P.bb || P.bb[2] < x - R || P.bb[0] > x + R || P.bb[3] < y - R || P.bb[1] > y + R) continue;
        B.reset(x - CHS / 2, y - CHS / 2); emitPiece(B, P, null); grab('P' + P.id);
      }
      return out;
    },
    /** debug: the analysed network (pieces, junctions) */
    net() { return NET; },
  };
})();
