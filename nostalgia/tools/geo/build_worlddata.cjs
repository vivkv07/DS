#!/usr/bin/env node
/* NOSTALGIA — tools/geo/build_worlddata.cjs   (map builder v2; node >= 22, no npm deps)
 *
 * Generates src/worlddata.js (N.WORLD_DATA, Map v2: the real Hyderabad, amendment A1) from
 *   design/geo/worlddata_v1.js   the old hand-made map: source of every id, kind, name, sign, draw id,
 *                                variant, roof, plank, respect zone, podium, hide spot, bus stop and
 *                                every landmark size (v1 positions are only used for local layouts)
 *   design/geo/places.json       real lat/lon of every place / landmark / roof id (+ confidence, source)
 *   design/geo/districts.json    districts as unions of real GHMC wards (DataMeet, CC BY 4.0)
 *   design/geo/roads.json        real road alignments (OSM via Overture, ODbL) + the Himayatnagar grid
 *   design/geo/water.json        lakes, tanks, the Musi and its riverbed, nalas (OSM, ODbL)
 *   design/geo/rail.json         railway centrelines and stations (OSM, datameet/railways CC0)
 *   design/geo/terrain.json      hills, rock fields (SRTM via AWS Terrain Tiles, OSM)
 *   design/geo/osm_streets.json  every OSM street (residential infill for the built-up districts)
 *   design/geo/osm_landuse.json  real park / ground shapes (Public Gardens, Lumbini, NTR Gardens, ...)
 *   tools/geo/project.cjs        lat/lon -> world units (15000 x 11250 u, smooth monotonic warp)
 *
 * Usage:
 *   node tools/geo/build_worlddata.cjs                 build to src/.worlddata.next.js, validate, and swap it
 *                                                      into src/worlddata.js atomically (rename) if the
 *                                                      map validator and the registry check pass
 *   node tools/geo/build_worlddata.cjs --out FILE      build to FILE only (no validation, no swap)
 *   node tools/geo/build_worlddata.cjs --no-swap       build + validate the temp file, keep the live map
 * Same input -> same output (no Math.random). Run time ~20-40 s.
 *
 * Method (design/map_plan.md §1 has the long version):
 *  1. Every real thing is projected (districts, water, roads, rails, parks, hills).
 *  2. Hand-tuned local layouts are moved as RIGID groups (translation only, by whole 4 u cells):
 *     the Lakshmi Nagar colony (home, terraces, planks, stairs, lanes), the Ashok Nagar terraces,
 *     the Charminar plaza, the Gulzar Houz square with the Char Kaman and Patang Chacha's roof,
 *     the Numaish grounds, LB Stadium, the Qutb Shahi Tombs, the airport apron, bus bays, ...
 *  3. Roads: the curated real alignments; residential infill from OSM in districts that were built
 *     up by 2003 (spacing by district, duplicates and flyovers dropped, never across the Musi);
 *     approach roads are re-joined to the clusters through "ports".
 *  4. Landmarks at their projected real centres (v1 size), shops snapped to their real street on
 *     the side the real point lies, then everything is pushed off roads / water / each other.
 *  5. Places beside their buildings, on walkable cells; aliases copy their target.
 *  6. Respect zones, compounds, avenue trees, boulders and building blocks are regenerated.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const G = require('./geom.cjs');
const GEO = require('./project.cjs');

const T0 = Date.now();
const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const argVal = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const OUT_FILE = argVal('--out');
const VERBOSE = argv.includes('--verbose');
const log = (...a) => console.log(...a);
const vlog = (...a) => { if (VERBOSE) console.log(...a); };
const warnings = [];
const warn = (m) => { warnings.push(m); if (VERBOSE) console.log('WARN', m); };

GEO.init();
const W = GEO.WORLD_W, H = GEO.WORLD_H;
const readJ = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'design/geo', f), 'utf8'));
const DIST = readJ('districts.json'), PLJ = readJ('places.json'), ROADS = readJ('roads.json'), WATER = readJ('water.json');
const RAIL = readJ('rail.json'), TERR = readJ('terrain.json'), OSMST = readJ('osm_streets.json'), OSMLU = readJ('osm_landuse.json');
const PLACES = PLJ.places;

/* ===================================================================== v1 map */
function loadV1() {
  const code = fs.readFileSync(path.join(ROOT, 'design/geo/worlddata_v1.js'), 'utf8');
  const sb = { window: { N: {} }, console, Math, performance: { now: () => 0 } };
  sb.window.window = sb.window;
  vm.createContext(sb);
  vm.runInContext(code, sb, { filename: 'worlddata_v1.js' });
  return JSON.parse(JSON.stringify(sb.window.N.WORLD_DATA));
}
const V1 = loadV1();
const V1P = new Map(V1.places.map((p) => [p.id, p]));
const V1L = new Map(V1.landmarks.map((l) => [l.id, l]));
const V1R = new Map(V1.roads.map((r) => [r.id, r]));
const V1K = new Map(V1.parks.map((p) => [p.id, p]));
const V1D = new Map(V1.districts.map((d) => [d.id, d]));
const V1RF = new Map(V1.roofs.map((r) => [r.id, r]));

/* ===================================================================== helpers */
const RD = (v) => Math.round(v);
const R1 = (v) => Math.round(v * 10) / 10;
const ptR = (p) => [RD(p[0]), RD(p[1])];
const clampX = (x) => Math.max(0, Math.min(W, x)), clampY = (y) => Math.max(0, Math.min(H, y));
const proj = (lat, lon) => GEO.project(lat, lon);
const projLine = (ll, tol) => G.thin(G.dp(GEO.projectLine(ll, { maxSegM: 25 }), tol == null ? 1.5 : tol), 4);
function projRing(ll, tol) {
  let r = GEO.projectRing(ll, { maxSegM: 30 }).map((p) => [clampX(p[0]), clampY(p[1])]);
  if (r.length > 2 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
  r = G.dp(r.concat([r[0]]), tol == null ? 2 : tol); r.pop();
  // snap near-edge vertices onto the world edge (no slivers along the frame)
  return r.map((p) => [p[0] < 12 ? 0 : p[0] > W - 12 ? W : p[0], p[1] < 12 ? 0 : p[1] > H - 12 ? H : p[1]]);
}
// world units per metre at a world point (cached on a 250 u grid)
const UPM = new Map();
function upmAt(x, y) {
  const i = Math.round(clampX(x) / 250), j = Math.round(clampY(y) / 250), k = j * 1000 + i;
  if (!UPM.has(k)) { const ll = GEO.unproject(i * 250, j * 250); UPM.set(k, GEO.scaleAt(ll[0], ll[1]).upm); }
  return UPM.get(k);
}
const CONF = { high: 'high', medium: 'medium', low: 'low' };
function realOf(id) {
  const e = PLACES[id]; if (!e) return null;
  const p = GEO.placeWorld(e);
  return { x: p[0], y: p[1], conf: CONF[e.confidence] || 'low', ll: [e.lat, e.lon], e, inFrame: GEO.inFrame(e.lat, e.lon) || !!e.anchor_latlon };
}
const FOOT = { arterial: 10, street: 7, bund: 9, lane: 0, bridge: 0, path: 0 };
const KRANK = { bund: 6, arterial: 5, bridge: 4, street: 3, lane: 2, path: 1 };
const FACE = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const faceOfNormal = (nx, ny) => (Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'w' : 'e') : (ny > 0 ? 'n' : 's'));
const snap4 = (v) => Math.round(v / 4) * 4;

/* ===================================================================== D (output) */
const D = {
  version: 2,
  size: [W, H],
  districts: [], water: [], roads: [], rails: [], parks: [], rocks: [], blocks: [], buildings: [], landmarks: [], trees: [],
  places: [], noFill: [], roofs: [], planks: [], respect: [], spawns: {}, terrain: { hills: [] }, clusters: {},
};

/* ===================================================================== 1. districts */
const STYLE_DEFAULT = { ground: '#ab9670', fill: 0.5, lot: [40, 120] };
const TE = { balanagar: 'బాలానగర్' };
const districtParts = new Map(); // id -> [{outer, holes}]
for (const d of DIST.districts) {
  const parts = d.polys.map((p) => ({ outer: projRing(p.outer, 3), holes: (p.holes || []).map((h) => projRing(h, 3)) }))
    .filter((p) => p.outer.length >= 3).sort((a, b) => Math.abs(G.polyArea(b.outer)) - Math.abs(G.polyArea(a.outer)));
  districtParts.set(d.id, parts);
  const v1 = V1D.get(d.id) || {};
  const all = parts.flatMap((p) => p.outer);
  const bb = G.bbox(all);
  const o = {
    id: d.id, name: v1.name || d.name.replace(/\s*\(.*\)$/, ''), nameTe: v1.nameTe || TE[d.id] || '',
    rect: [RD(bb[0]), RD(bb[1]), RD(bb[2] - bb[0]), RD(bb[3] - bb[1])],
    poly: parts[0].outer.map(ptR),
    ground: v1.ground || STYLE_DEFAULT.ground, style: v1.style || d.style || 'colony', fill: v1.fill != null ? v1.fill : STYLE_DEFAULT.fill, lot: v1.lot || STYLE_DEFAULT.lot,
    wards: d.wards.map((w) => w.ward), conf: d.confidence,
  };
  if (parts.length > 1) o.polys = parts.map((p) => p.outer.map(ptR));
  const holes = parts.flatMap((p) => p.holes);
  if (holes.length) o.holes = holes.map((h) => h.map(ptR));
  D.districts.push(o);
}
// rect consumers that let "later win" get the smallest districts last
D.districts.sort((a, b) => b.rect[2] * b.rect[3] - a.rect[2] * a.rect[3]);
const DISTRICT = new Map(D.districts.map((d) => [d.id, d]));
// district raster (16 u): owner index + 1; gaps filled with the nearest owner
const DR = new G.Raster(W, H, 16);
{
  D.districts.forEach((d, k) => {
    const parts = districtParts.get(d.id);
    for (const p of parts) {
      const tmp = new Set();
      DR.fillPoly(p.outer, (o) => tmp.add(o));
      for (const h of p.holes) DR.fillPoly(h, (o) => tmp.delete(o));
      for (const o of tmp) if (!DR.a[o]) DR.a[o] = k + 1;
    }
  });
  // nearest-owner fill of the gaps (BFS)
  let q = [];
  for (let o = 0; o < DR.a.length; o++) if (DR.a[o]) q.push(o);
  let gaps = 0;
  while (q.length) {
    const nq = [];
    for (const o of q) {
      const i = o % DR.w, j = (o - i) / DR.w;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= DR.w || jj >= DR.h) continue;
        const n = jj * DR.w + ii; if (!DR.a[n]) { DR.a[n] = DR.a[o]; nq.push(n); gaps++; }
      }
    }
    q = nq;
  }
  vlog('district raster gaps filled:', gaps, 'cells of 16 u');
}
const districtAt = (x, y) => { const v = DR.get(clampX(x - 0.01), clampY(y - 0.01)); return v && v !== 255 ? D.districts[v - 1] : null; };
// compact grid for the engine: 32 u cells, run-length encoded district indices (into D.districts)
{
  const C = 32, gw = Math.ceil(W / C), gh = Math.ceil(H / C), rle = [];
  let cur = -1, run = 0;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const v = DR.get(Math.min(W - 1, i * C + C / 2), Math.min(H - 1, j * C + C / 2)) - 1;
    if (v === cur) run++; else { if (run) rle.push(cur, run); cur = v; run = 1; }
  }
  rle.push(cur, run);
  D.districtGrid = { cell: C, w: gw, h: gh, rle };
}

/* ===================================================================== 2. water */
const WATERPOLYS = []; // [{id, poly}] for checks (channel only for the Musi)
function addWater(id, name, poly, o) { const w = Object.assign({ id, name, poly: poly.map(ptR) }, o || {}); D.water.push(w); WATERPOLYS.push(w); return w; }
const V1WATER = new Map(V1.water.map((w) => [w.id, w]));
let BUDDHA = null;
for (const l of WATER.lakes.concat(WATER.small_tanks)) {
  const outer = projRing(l.poly, 2);
  if (Math.abs(G.polyArea(outer)) < 300) continue;
  let holes = (l.holes || []).map((h) => projRing(h, 1)).filter((h) => h.length >= 3);
  const v1 = V1WATER.get(l.id);
  const o = { conf: l.confidence };
  if (l.id === 'hussain_sagar') {
    // the Buddha's Gibraltar Rock: an island hole of radius 34 (landmark island: 34) at the real rock
    const hc = holes.length ? G.centroid(holes[0]) : null;
    const be = realOf('buddha_statue');
    BUDDHA = hc && be && Math.hypot(hc[0] - be.x, hc[1] - be.y) < 80 ? hc : be ? [be.x, be.y] : hc;
    holes = [G.circle(BUDDHA[0], BUDDHA[1], 34, 20, true).slice(0, -1)];
    Object.assign(o, { bank: 0, color: '#2f7f86' });
  } else if (v1) Object.assign(o, { bank: v1.bank }, v1.color ? { color: v1.color } : {});
  else o.bank = l.kind === 'lake' ? 4 : 3;
  if (l.partly_off_map) o.offMapPart = true;
  addWater(l.id, l.name.replace(/^unnamed tank.*/, 'Tank'), G.keyhole(outer, holes), o);
}
// the Musi: a 2003 dry-season channel in its sandy riverbed (both traced from a raster of discs, so
// tight meanders never self-intersect), the Esi tributary and the nalas
function traceRibbon(pts, hwFn, cell, tol) {
  const bb = G.bbox(pts); let m = 0; for (let i = 0; i < pts.length; i++) m = Math.max(m, hwFn(i));
  const x0 = Math.floor((bb[0] - m - cell * 2) / cell) * cell, y0 = Math.floor((bb[1] - m - cell * 2) / cell) * cell;
  const gw = Math.ceil((bb[2] - x0 + m + cell * 2) / cell) + 1, gh = Math.ceil((bb[3] - y0 + m + cell * 2) / cell) + 1;
  const a = new Uint8Array(gw * gh);
  const dense = G.resample(pts, cell);
  const cw = G.cum(pts), cd = G.cum(dense);
  for (let k = 0; k < dense.length; k++) {
    // half width at this sample: interpolate over the source vertices
    const along = cd[k] * (cw[cw.length - 1] / (cd[cd.length - 1] || 1));
    let i = 1; while (i < cw.length - 1 && cw[i] < along) i++;
    const t = (along - cw[i - 1]) / ((cw[i] - cw[i - 1]) || 1), hw = hwFn(i - 1) * (1 - t) + hwFn(i) * t;
    const [cx, cy] = dense[k];
    for (let j = Math.floor((cy - hw - y0) / cell); j <= Math.ceil((cy + hw - y0) / cell); j++) for (let ii = Math.floor((cx - hw - x0) / cell); ii <= Math.ceil((cx + hw - x0) / cell); ii++) {
      if (ii < 0 || j < 0 || ii >= gw || j >= gh) continue;
      const dx = x0 + (ii + 0.5) * cell - cx, dy = y0 + (j + 0.5) * cell - cy; if (dx * dx + dy * dy <= hw * hw) a[j * gw + ii] = 1;
    }
  }
  return traceMask(a, gw, gh, x0, y0, cell, tol);
}
// outer boundaries of the 1-regions of a mask -> [poly] (largest first). Every cell side between a
// 1-cell and a 0-cell becomes a directed edge (region on the left); edges are chained into loops;
// loops with positive area (screen coords) are outer rings, the others holes (dropped).
function traceMask(a, gw, gh, x0, y0, cell, tol) {
  const at = (i, j) => (i >= 0 && j >= 0 && i < gw && j < gh ? a[j * gw + i] : 0);
  const K = (i, j) => j * (gw + 2) + i;
  const out = new Map(); // start corner -> [end corners]
  const add = (ai, aj, bi, bj) => { const k = K(ai, aj); if (!out.has(k)) out.set(k, []); out.get(k).push([bi, bj, ai, aj]); };
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    if (!at(i, j)) continue;
    if (!at(i, j - 1)) add(i + 1, j, i, j);         // top: right -> left
    if (!at(i - 1, j)) add(i, j, i, j + 1);         // left: top -> bottom
    if (!at(i, j + 1)) add(i, j + 1, i + 1, j + 1); // bottom: left -> right
    if (!at(i + 1, j)) add(i + 1, j + 1, i + 1, j); // right: bottom -> top
  }
  const loops = [];
  for (const [k0, list0] of out) {
    while (list0.length) {
      let e = list0.pop(); const ring = [[e[2], e[3]]];
      let guard = 0, pdx = e[0] - e[2], pdy = e[1] - e[3];
      for (;;) {
        ring.push([e[0], e[1]]);
        const l = out.get(K(e[0], e[1]));
        if (!l || !l.length) break;
        // at a pinch corner prefer the left turn (keeps diagonal cells apart)
        let bi = 0;
        if (l.length > 1) { let best = -9; l.forEach((c, n) => { const dx = c[0] - c[2], dy = c[1] - c[3]; const cr = pdx * dy - pdy * dx; const sc = cr < 0 ? 2 : cr === 0 ? 1 : 0; if (sc > best) { best = sc; bi = n; } }); }
        const nx = l.splice(bi, 1)[0];
        pdx = nx[0] - nx[2]; pdy = nx[1] - nx[3]; e = nx;
        if (++guard > 4 * gw * gh) break;
        if (e[0] === ring[0][0] && e[1] === ring[0][1]) { ring.push([e[0], e[1]]); break; }
      }
      if (ring.length > 4) loops.push(ring);
    }
  }
  const polys = [];
  for (const ring of loops) {
    let poly = ring.map(([cx, cy]) => [x0 + cx * cell, y0 + cy * cell]);
    const A = -G.polyArea(poly); // outer rings run clockwise on screen (negative signed area)
    if (A <= 0) continue; // hole
    poly = G.dp(poly, tol || cell * 0.75); poly.pop();
    if (poly.length >= 3) polys.push({ poly, A });
  }
  return polys.sort((p, q) => q.A - p.A).map((p) => p.poly);
}
const MUSI = WATER.rivers.find((r) => r.id === 'musi');
let MUSI_LINE = null, MUSI_CHANNEL = null, MUSI_BED = null;
{
  const samples = MUSI.centreline; // [lat, lon, bank-to-bank m]
  // extend both ends beyond the frame so the river leaves the world at its edges
  const ll = samples.map((s) => [s[0], s[1]]);
  let line = GEO.projectLine(ll, { maxSegM: 30 });
  const ext = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1; return [a[0] + (dx / l) * 120, a[1] + (dy / l) * 120]; };
  line = [ext(line[0], line[3])].concat(line, [ext(line[line.length - 1], line[line.length - 4])]);
  line = G.dp(line, 1.5);
  MUSI_LINE = line;
  // per-vertex widths from the samples (nearest sample along the river)
  const sw = samples.map((s) => { const p = proj(s[0], s[1]); return { x: p[0], y: p[1], m: s[2] }; });
  const widthAt = (p) => { let b = sw[0], bd = Infinity; for (const s of sw) { const d = (s.x - p[0]) ** 2 + (s.y - p[1]) ** 2; if (d < bd) { bd = d; b = s; } } return b.m; };
  const CH = 16; // channel half width (u): the 2003 channel was 10-40 m wide; boats need room
  const hwBed = line.map((p) => { const m = widthAt(p); const u = upmAt(p[0], p[1]); return m > 0 ? Math.max(CH + 18, Math.min(150, (m / 2) * u * 1.15)) : CH + 10; });
  // smooth the bed widths
  const sm = hwBed.map((_, i) => { let s = 0, n = 0; for (let k = -3; k <= 3; k++) { const v = hwBed[i + k]; if (v != null) { s += v; n++; } } return s / n; });
  MUSI_BED = traceRibbon(line, (i) => sm[Math.max(0, Math.min(sm.length - 1, i))], 6, 4)[0];
  MUSI_CHANNEL = traceRibbon(line, () => CH, 4, 5)[0];
  addWater('musi', 'Musi River', MUSI_CHANNEL.map((p) => [clampX(p[0]), clampY(p[1])]), { bank: 6, color: '#3d7a72', river: true, conf: 'high' });
}
for (const r of WATER.rivers.filter((r) => r.id !== 'musi')) {
  const line = GEO.projectLine(r.centreline.map((s) => [s[0], s[1]]), { maxSegM: 30 });
  const poly = traceRibbon(G.dp(line, 1.5), () => 8, 4, 5)[0];
  if (poly) addWater(r.id + '_river', r.name, poly.map((p) => [clampX(p[0]), clampY(p[1])]), { bank: 4, conf: r.confidence, river: true });
}
{
  const byId = {};
  for (const n of WATER.nalas) (byId[n.id] = byId[n.id] || []).push(n);
  for (const [id, parts] of Object.entries(byId)) parts.forEach((n, k) => {
    const line = G.dp(GEO.projectLine(n.pts, { maxSegM: 25 }), 1.5);
    if (G.len(line) < 60) return;
    const poly = traceRibbon(line, () => 5, 2, 3)[0];
    if (poly) addWater(id + (parts.length > 1 ? '_' + (k + 1) : ''), n.name, poly, { bank: 2, nala: true, conf: n.confidence, color: '#4f6e5c' });
  });
}

/* ===================================================================== 3. terrain */
const HILL_PARK = { naubat_pahad: 'naubat_pahad', golconda_hill: 'golconda_hill', falaknuma_hill: 'falaknuma_hill', moula_ali_hill: 'moula_ali_hill' };
const HILL_EXTRA = new Set(['jalal_pahad', 'fakhruddin_gutta']);
const HILLS = new Map();
for (const h of TERR.hills) {
  const outline = projRing(h.outline, 2);
  const pk = proj(h.peak[0], h.peak[1]);
  HILLS.set(h.id, { outline, peak: pk });
  D.terrain.hills.push({ id: h.id, name: h.name, peak: ptR(pk), relM: h.rel_height_m, conf: h.confidence, outline: outline.map(ptR) });
}
const ROCKFIELDS = TERR.rock_fields.map((rf) => ({ id: rf.id, polys: rf.polys.map((p) => projRing(p, 3)), conf: rf.confidence }));


/* ===================================================================== 4. real-shaped parks (OSM landuse) */
const LU = (re, cls) => OSMLU.items.filter((i) => re.test(i.n) && (!cls || cls.includes(i.c))).sort((a, b) => b.ha - a.ha)[0];
const REAL_PARKS = {
  public_gardens: LU(/^Public Garden Park$/), lumbini_park: LU(/^Lumbini Park$/), ntr_gardens: LU(/^NTR Gardens$/),
  sanjeevaiah_park: LU(/^Sanjeevaiah Park$/), indira_park: LU(/^Indira Park$/), kbr_park: LU(/Kasu Brahmananda Reddy/),
  parade_grounds: LU(/Parade Ground/), gymkhana_ground_secunderabad: LU(/^Gymkhana Grounds$/), gun_park: LU(/^Gun Park$/),
  victory_playground: LU(/^Victoria Play Ground$/),
};
const REALPARK = new Map(); // id -> world poly
for (const [id, it] of Object.entries(REAL_PARKS)) if (it) REALPARK.set(id, projRing(it.outer, 1.5));

/* ===================================================================== 5. roads */
const ROADS_OUT = new Map(); // id -> road
const roadList = () => [...ROADS_OUT.values()];
function widthFor(kind, lanes, divided) {
  if (kind === 'arterial') return divided ? 56 : 52;
  if (kind === 'street') return lanes >= 4 ? 40 : 36;
  if (kind === 'lane') return lanes >= 2 ? 24 : 22;
  if (kind === 'bridge') return lanes >= 4 ? 44 : 36;
  if (kind === 'bund') return 60;
  return 12;
}
function addRoad(r) { ROADS_OUT.set(r.id, r); return r; }
// 5.1 curated real alignments (every v1 road id + the researcher's added real roads)
for (const r of ROADS.roads) {
  const v1 = V1R.get(r.id);
  const kind = v1 ? v1.kind : r.kind;
  const o = { id: r.id, name: v1 ? v1.name : r.name, kind, w: v1 ? v1.w : widthFor(kind, r.lanes, r.divided), pts: projLine(r.pts, kind === 'path' ? 1 : 1.5) };
  if (kind === 'arterial' || kind === 'bund') o.median = !!r.divided;
  if (v1) { for (const k of ['spur', 'trees', 'oneway']) if (v1[k] != null) o[k] = v1[k]; }
  o.pothole = r.pothole_hint != null ? r.pothole_hint : 0.4;
  o.conf = r.confidence; o.src = 'roads';
  if (r.real_name && r.real_name !== o.name) o.realName = r.real_name;
  addRoad(o);
}
// the Lower Tank Bund is a street at the foot of the bund (39 m from the Tank Bund in reality)
{ const ltb = ROADS_OUT.get('lower_tank_bund'); ltb.kind = 'street'; ltb.w = 34; delete ltb.median; }

// 5.2 near-duplicate curated lines (two ids routed on one street): trim the lesser one's shared run
const segIndex = (roads, cell) => { const h = new G.SegHash(cell || 64); for (const r of roads) h.add(r.pts, r); return h; };
function dedupeCurated() {
  const roads = roadList().filter((r) => r.kind !== 'path');
  const H0 = segIndex(roads);
  const rank = (r) => KRANK[r.kind] * 1e6 + G.len(r.pts);
  let trimmed = 0;
  for (const B of roads.slice().sort((a, b) => rank(a) - rank(b))) {
    const pts = G.resample(B.pts, 8), dup = new Uint8Array(pts.length);
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / dl, uy = (b[1] - a[1]) / dl;
      for (const { it, q } of H0.near(p[0], p[1], B.w / 2 + 34, (ref) => ref !== B && rank(ref) > rank(B))) {
        const A = it.ref, sx = it.b[0] - it.a[0], sy = it.b[1] - it.a[1], sl = Math.hypot(sx, sy) || 1;
        const cos = Math.abs((ux * sx + uy * sy) / sl);
        if (Math.sqrt(q.d2) < (A.w + B.w) / 4 + 2 && cos > 0.9) { dup[k] = 1; break; }
      }
    }
    // runs of >= 80 u of shared corridor
    const keep = []; let k = 0;
    while (k < pts.length) {
      let e = k; while (e < pts.length && dup[e] === dup[k]) e++;
      keep.push({ dup: !!dup[k] && (e - k) * 8 >= 80, a: k, b: e - 1 });
      k = e;
    }
    if (!keep.some((r) => r.dup)) continue;
    // merge short non-dup runs into neighbours, then collect the kept pieces
    const pieces = []; let cur = null;
    for (const r of keep) { if (r.dup) { if (cur) pieces.push(cur); cur = null; } else { if (!cur) cur = { a: r.a, b: r.b }; else cur.b = r.b; } }
    if (cur) pieces.push(cur);
    const good = pieces.map((pc) => pts.slice(Math.max(0, pc.a - 1), Math.min(pts.length, pc.b + 2))).filter((q) => G.len(q) >= 50);
    if (!good.length) { warn(`road ${B.id} runs on another road for its whole length; kept as is`); continue; }
    good.sort((p, q) => G.len(q) - G.len(p));
    B.pts = G.thin(G.dp(good[0], 1.5), 4);
    good.slice(1).forEach((q, n) => addRoad(Object.assign({}, B, { id: B.id + '_' + (n + 2), pts: G.thin(G.dp(q, 1.5), 4), spur: true })));
    trimmed++;
    vlog('dedupe: trimmed', B.id, 'pieces', good.length);
  }
  return trimmed;
}
const nTrim = dedupeCurated();

// 5.3 push a road away from another one it runs beside (Lower Tank Bund off the Tank Bund)
function separate(bid, aid, minD, fade) {
  const B = ROADS_OUT.get(bid), A = ROADS_OUT.get(aid);
  const pts = G.resample(B.pts, 10), c = G.cum(pts), L = c[c.length - 1];
  const out = pts.map((p, k) => {
    const q = G.nearestOnLine(A.pts, p[0], p[1]);
    if (!q || q.d >= minD) return p;
    const wEnd = Math.min(1, Math.min(c[k], L - c[k]) / fade);
    const nx = (p[0] - q.x) / (q.d || 1), ny = (p[1] - q.y) / (q.d || 1);
    const push = (minD - q.d) * (wEnd * wEnd * (3 - 2 * wEnd));
    return [p[0] + nx * push, p[1] + ny * push];
  });
  // smooth a little
  const sm = out.map((p, k) => k === 0 || k === out.length - 1 ? p : [(out[k - 1][0] + 2 * p[0] + out[k + 1][0]) / 4, (out[k - 1][1] + 2 * p[1] + out[k + 1][1]) / 4]);
  B.pts = G.thin(G.dp(sm, 1.5), 4);
}
separate('lower_tank_bund', 'tank_bund', 30 + 9 + 17 + 7 + 6, 140);

/* ===================================================================== 6. clusters (rigid local layouts) */
// curated road corridor raster (4 u): roads + footpaths + 2 u
const CR = new G.Raster(W, H, 4);
function paintRoadsInto(R, roads, val, extra) { for (const r of roads) R.fillThick(r.pts, r.w / 2 + (FOOT[r.kind] || 0) + (extra || 0), (o) => { R.a[o] = val; }); }
const WR = new G.Raster(W, H, 4); // water mask: 1 water, 2 riverbed / bank band
for (const w of D.water) WR.fillPoly(w.poly, (o) => { WR.a[o] = 1; });
if (MUSI_BED) WR.fillPoly(MUSI_BED, (o) => { if (!WR.a[o]) WR.a[o] = 2; });
const CLUSTERS = [];
const CLID = {};
const LOCK = new Map(); // landmark / place / roof id -> true when a cluster placed it
function cluster(id, v1Anchor, real, o) {
  const c = Object.assign({ id, v1Anchor, real, T: [snap4(real[0] - v1Anchor[0]), snap4(real[1] - v1Anchor[1])], lms: [], places: [], roofs: [], parks: [], roads: [], water: [], trees: [], search: 0 }, o || {});
  CLUSTERS.push(c); CLID[id] = c; return c;
}
const rp = (id) => { const r = realOf(id); if (!r) throw new Error('no real position for ' + id); return [r.x, r.y]; };
const v1p = (id) => { const p = V1L.get(id) || V1P.get(id); return [p.x, p.y]; }; // landmark centre first
{
  const colonyAnchor = PLACES.home.anchor_latlon ? proj(PLACES.home.anchor_latlon[0], PLACES.home.anchor_latlon[1]) : rp('home');
  cluster('lakshmi_nagar_colony', [4580, 2619], colonyAnchor, {
    lms: ['home', 'friend_home', 'playground_kit_home', 'water_tank_1', 'temple_1', 'flower_cart_1', 'kirana_1', 'pindi_girni_1', 'chai_bandi_1', 'medical_shop_8', 'barber_7', 'cycle_rent_5'],
    places: ['home', 'home_terrace', 'playground_home', 'friend_home', 'temple_1', 'flower_cart_1', 'kirana_1', 'pindi_girni_1', 'chai_bandi_1', 'medical_shop_8', 'barber_7', 'cycle_rent_5', 'hide_home_lane', 'hide_home_colony_ground'],
    roofs: ['home_terrace', 'lakshmi_t2', 'lakshmi_t3', 'lakshmi_t4', 'lakshmi_t5', 'lakshmi_t6', 'friend_terrace'],
    parks: ['playground_home'], roads: ['ln_lakshmi_v1', 'ln_lakshmi_v2', 'ln_lakshmi_h1'], trees: [[4500, 2500, 4900, 2760]],
    core: [4500, 2500, 4840, 2730], search: 200, conf: 'low', note: 'fictional colony anchored in a real residential pocket of GHMC ward 79 (places.json)',
  });
  const an = PLACES.ashok_t1.anchor_latlon;
  cluster('ashok_nagar_terraces', [4736, 2276], proj(an[0], an[1]), { roofs: ['ashok_t1', 'ashok_t2', 'ashok_t3'], core: [4690, 2236, 4772, 2312], search: 160, conf: 'low', reach: true });
  cluster('charminar', v1p('charminar'), rp('charminar'), {
    lms: ['charminar'], places: ['charminar', 'charminar_gallery', 'charminar_plaza', 'hide_charminar_corner'], parks: ['charminar_plaza'], roads: ['charminar_circle'],
    zone: { r: 128, sq: true }, conf: 'high',
  });
  const gz = PLACES.patang_chacha_roof.anchor_latlon;
  cluster('gulzar_houz', v1p('gulzar_houz'), gz ? proj(gz[0], gz[1]) : rp('gulzar_houz'), {
    lms: ['gulzar_houz', 'kaman_machli', 'kaman_charminar', 'kaman_kali', 'kaman_sher_e_batil'],
    places: ['gulzar_houz', 'patang_bazaar', 'patang_chacha_roof', 'hide_gulzar_houz_ledge'], roofs: ['patang_chacha_roof'], parks: ['gulzar_houz_sq'], roads: ['gulzar_houz_loop'],
    zone: { r: 76 }, conf: 'high',
  });
  cluster('mecca_masjid', v1p('mecca_masjid'), rp('mecca_masjid'), {
    lms: ['mecca_masjid'], places: ['mecca_masjid', 'hide_mecca_masjid_pigeons'], parks: ['mecca_masjid_courtyard', 'mecca_masjid_pigeons'], water: ['mecca_masjid_houz'], conf: rp && PLACES.mecca_masjid.confidence,
  });
  cluster('numaish', v1p('nampally_exhibition'), rp('nampally_exhibition'), {
    lms: ['numaish_gate', 'giant_wheel', 'maut_ka_kuan', 'numaish_stalls_1', 'numaish_stalls_2'], places: ['nampally_exhibition', 'hide_numaish_corner'], parks: ['exhibition_grounds'],
    core: [3495, 2985, 3690, 3190], search: 160, conf: 'low', clipRoads: true,
  });
  const lbc = PLACES.lb_stadium.stadium_centre;
  cluster('lb_stadium', v1p('lb_stadium'), proj(lbc[0], lbc[1]), {
    lms: ['lb_stadium', 'electronics_shop_1'], places: ['lb_stadium', 'fateh_maidan', 'hide_lb_stand', 'electronics_shop_1'], parks: ['lb_stadium_field'],
    core: [3862, 2470, 4060, 2702], search: 120, conf: 'medium', clipRoads: true,
  });
  cluster('qutb_shahi_tombs', v1p('qutb_shahi_tombs'), rp('qutb_shahi_tombs'), {
    lms: ['qutb_tomb_1', 'qutb_tomb_2', 'qutb_tomb_3', 'qutb_tomb_4', 'qutb_tomb_5', 'qutb_tomb_6'], places: ['qutb_shahi_tombs', 'hide_tombs_garden'], parks: ['qutb_shahi_gardens'],
    core: [760, 2660, 1090, 2960], search: 160, conf: 'high', clipRoads: true,
  });
  cluster('begumpet_airport', v1p('begumpet_airport'), rp('begumpet_airport'), {
    lms: ['begumpet_airport', 'atc_tower', 'aeroplane_1'], places: ['begumpet_airport', 'hide_airport_fence'], parks: ['begumpet_apron'],
    core: [3270, 400, 3660, 520], search: 120, conf: 'medium',
  });
  cluster('cyber_towers', v1p('cyber_towers'), rp('cyber_towers'), { lms: ['cyber_towers'], places: ['cyber_towers', 'hide_cyber_fountain'], parks: ['cyber_towers_plaza'], core: [366, 436, 516, 598], search: 120, conf: 'high' });
}
// clusters avoid the curated roads (and water): search a translation near the ideal one
paintRoadsInto(CR, roadList().filter((r) => r.kind !== 'path'), 1, 2);
function clusterFootprints(c) {
  const rects = [];
  for (const id of c.lms) { const l = V1L.get(id); if (!l || l.noSolid) continue; rects.push([l.x - l.w / 2 - 2, l.y - l.d / 2 - 2, l.w + 4, l.d + 4]); }
  for (const id of c.roofs) { const r = V1RF.get(id); rects.push([r.rect[0] - 4, r.rect[1] - 4, r.rect[2] + 8, r.rect[3] + 8]); }
  for (const id of c.parks) { const p = V1K.get(id); if (!p) continue; const b = G.bbox(p.poly); rects.push([b[0], b[1], b[2] - b[0], b[3] - b[1]]); }
  return rects;
}
const ownRoadIds = new Set(CLUSTERS.flatMap((c) => c.roads));
for (const c of CLUSTERS) {
  if (!c.search) continue;
  const rects = clusterFootprints(c);
  const ideal = c.T.slice();
  const hits = (T) => {
    let hit = 0;
    for (const r of rects) CR.fillRect(r[0] + T[0], r[1] + T[1], r[2], r[3], (o) => { if (CR.a[o]) hit++; if (WR.a[o] === 1) hit += 4; });
    return hit;
  };
  // the cluster's own (real) streets are replaced by its layout: do not count them
  const own = c.roads.map((id) => ROADS_OUT.get(id)).filter(Boolean);
  for (const r of own) CR.fillThick(r.pts, r.w / 2 + 2, (o) => { CR.a[o] = 0; });
  let best = ideal, bh = hits(ideal), bd = 0;
  for (let rr = 8; rr <= c.search && bh > 0; rr += 8) for (let dx = -rr; dx <= rr; dx += 8) for (let dy = -rr; dy <= rr; dy += 8) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
    const T = [ideal[0] + dx, ideal[1] + dy], h = hits(T), d = Math.hypot(dx, dy);
    if (h < bh || (h === bh && d < bd)) { bh = h; bd = d; best = T; }
  }
  if (bh > 0) warn(`cluster ${c.id}: still touches a road or water after the search (${bh} cells)`);
  if (best !== ideal) vlog(`cluster ${c.id}: moved ${Math.round(bd)} u from its anchor to clear the streets`);
  c.T = best; c.moved = Math.round(Math.hypot(best[0] - ideal[0], best[1] - ideal[1]));
  paintRoadsInto(CR, own, 1, 2);
}
const tr = (c, p) => [p[0] + c.T[0], p[1] + c.T[1]];
for (const c of CLUSTERS) { for (const id of c.lms.concat(c.places, c.roofs)) LOCK.set(id, c.id); }

// 6.1 cluster-owned roads: v1 geometry, translated (charminar_circle is redrawn as a ring around the plaza)
const CH = CLID.charminar, GZ = CLID.gulzar_houz;
const CHC = tr(CH, CH.v1Anchor), GZC = tr(GZ, GZ.v1Anchor);
const RING = 84;
{
  const ring = []; for (let k = 0; k <= 16; k++) { const a = -Math.PI / 2 + (k / 16) * Math.PI * 2; ring.push([CHC[0] + Math.cos(a) * RING, CHC[1] + Math.sin(a) * RING]); }
  ring[16] = ring[0].slice();
  const cc = ROADS_OUT.get('charminar_circle');
  Object.assign(cc, { pts: ring, w: 30, kind: 'street', conf: 'medium', src: 'cluster', note: 'ring of radius 84 u around the plaza (the real 34 m circle is inside the game footprint)' });
  const gl = ROADS_OUT.get('gulzar_houz_loop');
  Object.assign(gl, { pts: V1R.get('gulzar_houz_loop').pts.map((p) => tr(GZ, p)), w: V1R.get('gulzar_houz_loop').w, src: 'cluster' });
}
// colony lanes: the v1 lanes translated, then each end trimmed at / extended to the first real street
function fitLane(id, c) {
  const r = ROADS_OUT.get(id), v = V1R.get(id);
  const a = tr(c, v.pts[0]), b = tr(c, v.pts[v.pts.length - 1]);
  const core = c.core, cmin = tr(c, [core[0], core[1]]), cmax = tr(c, [core[2], core[3]]);
  const ux = (b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]), uy = (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
  // core interval along the lane (projection of the core box)
  const proj1 = (p) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
  const corners = [[cmin[0], cmin[1]], [cmax[0], cmin[1]], [cmin[0], cmax[1]], [cmax[0], cmax[1]]].map(proj1);
  const t0 = Math.max(proj1(a), Math.min(...corners)), t1 = Math.min(proj1(b), Math.max(...corners));
  const others = roadList().filter((q) => q.kind !== 'path' && !c.roads.includes(q.id) && q.src !== 'cluster');
  const hitAlong = (from, dir, maxT) => {
    let best = null;
    const P0 = [a[0] + ux * from, a[1] + uy * from], P1 = [a[0] + ux * (from + dir * maxT), a[1] + uy * (from + dir * maxT)];
    for (const q of others) for (let s = 0; s < q.pts.length - 1; s++) {
      const I = G.segInter(P0, P1, q.pts[s], q.pts[s + 1]); if (I && (!best || I.t < best.t)) best = { t: I.t, x: I.x, y: I.y, road: q.id };
    }
    return best;
  };
  const L0 = proj1(b);
  const hs = hitAlong(t0, -1, Math.max(250, t0 + 250)), he = hitAlong(t1, 1, Math.max(250, L0 - t1 + 250));
  const pa = hs ? [hs.x, hs.y] : a, pb = he ? [he.x, he.y] : b;
  r.pts = [pa, pb]; r.src = 'cluster'; r.w = v.w; r.kind = v.kind; r.conf = 'low';
  vlog(`lane ${id}: ends at ${hs ? hs.road : '(open)'} / ${he ? he.road : '(open)'}`);
}
for (const id of CLID.lakshmi_nagar_colony.roads) fitLane(id, CLID.lakshmi_nagar_colony);

// 6.2 ports: approach roads join a cluster along its axes
function attachPort(roadId, C, inner, outer, Rcut, opts) {
  const r = ROADS_OUT.get(roadId); if (!r) return;
  let pts = r.pts.slice();
  const dA = Math.hypot(pts[0][0] - C[0], pts[0][1] - C[1]), dB = Math.hypot(pts[pts.length - 1][0] - C[0], pts[pts.length - 1][1] - C[1]);
  const rev = dB < dA; if (rev) pts.reverse();
  // first point at distance >= Rcut walking away from the cluster
  const dense = G.resample(pts, 4);
  let k = 0; while (k < dense.length && Math.hypot(dense[k][0] - C[0], dense[k][1] - C[1]) < Rcut) k++;
  const rest = k < dense.length ? G.dp(dense.slice(k), 1.5) : [dense[dense.length - 1]];
  let np = [inner, outer].concat(rest);
  if (opts && opts.only) np = [inner, outer];
  np = G.thin(np, 4);
  if (rev) np.reverse();
  r.pts = np; r.port = r.port || []; r.port.push(opts && opts.cluster);
}
const add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];
// Charminar: four axis ports on the ring; Pathergatti Road runs ring -> Charminar Kaman -> Gulzar Houz loop
attachPort('laad_bazaar', CHC, add2(CHC, [-RING, 0]), add2(CHC, [-140, 0]), 150, { cluster: 'charminar' });
attachPort('sardar_mahal_rd', CHC, add2(CHC, [RING, 0]), add2(CHC, [140, 0]), 150, { cluster: 'charminar' });
attachPort('shah_ali_banda_rd', CHC, add2(CHC, [0, RING]), add2(CHC, [0, 140]), 150, { cluster: 'charminar' });
{
  const r = ROADS_OUT.get('pathergatti_rd');
  r.pts = [add2(CHC, [0, -RING]), add2(GZC, [0, 112]), add2(GZC, [0, 36])]; r.src = 'cluster'; r.conf = 'medium';
}
attachPort('pathergatti_n', GZC, add2(GZC, [0, -36]), add2(GZC, [0, -112]), 124, { cluster: 'gulzar_houz' });
attachPort('gulzar_houz_w', GZC, add2(GZC, [-36, 0]), add2(GZC, [-112, 0]), 124, { cluster: 'gulzar_houz' });
attachPort('gulzar_houz_e', GZC, add2(GZC, [36, 0]), add2(GZC, [144, 0]), 156, { cluster: 'gulzar_houz' });


/* ===================================================================== 7. rails */
{
  const sec = (id) => { const s = RAIL.sections.find((q) => q.id === id); return projLine(s.pts, 1.5); };
  const join = (...parts) => { const out = []; for (const p of parts) { for (const q of p) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 3) out.push(q); } } return out; };
  const rev = (p) => p.slice().reverse();
  const RL = (id, name, pts) => D.rails.push({ id, name, pts: pts.map(ptR), w: 16 });
  const j1 = sec('sec_j1'), jh = sec('j1_hyderabad'), jl = sec('j1_lingampally'), sf = sec('sec_falaknuma'), s2 = sec('sec_j2'), mo = sec('j2_moula_ali'), bo = sec('j2_bolarum');
  RL('rail_hyd_sec', 'Hyderabad–Secunderabad line', join(rev(jh), rev(j1)));
  RL('rail_wadi', 'Secunderabad–Wadi line (Begumpet, Lingampally)', jl);
  RL('rail_kachiguda', 'Secunderabad–Kachiguda–Falaknuma line', sf);
  RL('rail_bolarum', 'Bolarum line (Malkajgiri, Safilguda)', join(s2, bo));
  RL('rail_kazipet', 'Kazipet line (Moula Ali)', mo);
  // Secunderabad station loop: a second track beside the main line through the station
  const sc = proj(RAIL.stations.find((q) => q.id === 'secunderabad_station').latlon[0], RAIL.stations.find((q) => q.id === 'secunderabad_station').latlon[1]);
  const main = D.rails[0].pts, q = G.nearestOnLine(main, sc[0], sc[1]);
  const c = G.cum(main), a = Math.max(0, q.along - 260), b = Math.min(c[c.length - 1], q.along + 60);
  const piece = []; for (let d = a; d <= b; d += 20) { const p = G.atDist(main, d, c); piece.push([p.x, p.y]); }
  RL('rail_sec_yard', 'Secunderabad station loop', G.offsetLine(piece, -q.side * 24));
}
const RAILS_W = new G.Raster(W, H, 4);
for (const r of D.rails) RAILS_W.fillThick(r.pts, 12, (o) => { RAILS_W.a[o] = 1; });

/* ===================================================================== 8. occupancy raster for placement */
// codes: 1 road+footpath, 2 water, 3 solid footprint, 4 rail, 6 roof, 7 riverbed sand, 8 path
const OCC = new G.Raster(W, H, 4);
function paintRoadsOcc() {
  for (const r of roadList()) {
    if (r.kind === 'path') { OCC.fillThick(r.pts, r.w / 2 + 1, (o) => { if (!OCC.a[o]) OCC.a[o] = 8; }); continue; }
    OCC.fillThick(r.pts, r.w / 2 + (FOOT[r.kind] || 0) + 2, (o) => { if (OCC.a[o] !== 2) OCC.a[o] = 1; });
  }
}
for (const w of D.water) OCC.fillPoly(w.poly, (o) => { OCC.a[o] = 2; });
if (MUSI_BED) OCC.fillPoly(MUSI_BED, (o) => { if (!OCC.a[o]) OCC.a[o] = 7; });
for (let k = 0; k < OCC.a.length; k++) if (RAILS_W.a[k] && !OCC.a[k]) OCC.a[k] = 4;
paintRoadsOcc();
const markRect = (x, y, w, h, v) => OCC.fillRect(x, y, w, h, (o) => { OCC.a[o] = v; });

/* ===================================================================== 9. landmarks */
const LM = new Map(); // id -> output landmark
const PL = new Map(); // id -> output place
const lmRect = (l) => [l.x - l.w / 2, l.y - l.d / 2, l.w, l.d];
const partsOf = (l) => (l.solids ? l.solids : l.noSolid ? [] : [lmRect(l)]);
function markLandmark(l) { for (const s of partsOf(l)) markRect(s[0], s[1], s[2], s[3], 3); }
function cloneLm(id) { const v = V1L.get(id); const o = JSON.parse(JSON.stringify(v)); o.v1 = [v.x, v.y]; return o; }
function moveLm(l, x, y) {
  const dx = x - l.x, dy = y - l.y;
  l.x = RD(x); l.y = RD(y);
  if (l.solids) l.solids = l.solids.map((s) => [RD(s[0] + dx), RD(s[1] + dy), s[2], s[3]]);
}
// a landmark footprint is clear of roads, water, rails, roofs, riverbed and other solids
const BLOCKING = new Set([1, 2, 3, 4, 6, 7, 8]);
function clearAt(l, x, y, opt) {
  const pad = opt && opt.pad != null ? opt.pad : 2, dx = x - l.x, dy = y - l.y;
  const parts = l.noSolid && !l.solids ? [] : partsOf(l);
  const allow = (opt && opt.allow) || null;
  const bad = (v) => BLOCKING.has(v) && !(allow && allow.has(v));
  for (const s of parts) if (OCC.anyRect(s[0] + dx - pad, s[1] + dy - pad, s[2] + pad * 2, s[3] + pad * 2, bad)) return false;
  // walk-through landmarks still keep out of water / solids with their whole footprint
  if (l.noSolid || l.solids) { if (OCC.anyRect(x - l.w / 2, y - l.d / 2, l.w, l.d, (v) => v === 2 || v === 3 || v === 6)) return false; }
  if (x - l.w / 2 < 8 || y - l.d / 2 < 8 || x + l.w / 2 > W - 8 || y + l.d / 2 > H - 8) return false;
  return true;
}
// smallest move to a clear spot; prefer the direction `pref` (radians) when given
function settle(l, x0, y0, opt) {
  opt = opt || {};
  const maxR = opt.maxR || 480;
  if (clearAt(l, x0, y0, opt)) return { x: x0, y: y0, moved: 0 };
  for (let r = 4; r <= maxR; r += 4) {
    const n = Math.max(12, Math.min(72, Math.round((2 * Math.PI * r) / 6)));
    const order = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; let da = opt.pref == null ? 0 : Math.abs(((a - opt.pref + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); order.push([da, a]); }
    order.sort((p, q) => p[0] - q[0]);
    for (const [, a] of order) {
      const x = x0 + Math.cos(a) * r, y = y0 + Math.sin(a) * r;
      if (opt.line) { const q = G.nearestOnLine(opt.line, x, y); if (q && q.d > opt.lineMax) continue; }
      if (clearAt(l, x, y, opt)) return { x, y, moved: r };
    }
  }
  return null;
}
// nearest road to a point (optional predicate) using a segment hash of the final network
let RH = null;
const buildRH = () => { RH = segIndex(roadList().filter((r) => r.kind !== 'path'), 64); };
buildRH();
const nearestRoad = (x, y, rmax, pred) => { const e = RH.nearest(x, y, rmax || 400, pred); if (!e) return null; const r = e.it.ref; const q = G.nearestOnLine(r.pts, x, y); return Object.assign(q, { road: r }); };

// 9.1 v1 relations: shop frontage (which road, which side, how far), givers
const FOOTK = { arterial: 10, street: 7, bund: 9, lane: 0, bridge: 0, path: 0 };
const V1RH = segIndex(V1.roads.filter((r) => r.kind !== 'path'), 64);
const v1Frontage = new Map(); // id -> {road, gap, fd, fw}
for (const l of V1.landmarks) {
  const p = V1P.get(l.id); if (!p || !l.face) continue;
  const f = FACE[l.face];
  const e = V1RH.nearest(p.x, p.y, 80); if (!e) continue;
  const r = e.it.ref, d = Math.sqrt(e.q.d2);
  const g = d - r.w / 2;
  const okGap = [FOOTK[r.kind] + 3, 2, 3].some((gg) => Math.abs(g - gg) < 1.6);
  const ns = l.face === 'n' || l.face === 's';
  const fd = ns ? l.d : l.w, fw = ns ? l.w : l.d;
  const back = Math.hypot(l.x - p.x, l.y - p.y);
  if (okGap && Math.abs(back - (5 + fd / 2)) < 2.5 && l.w * l.d <= 3600) v1Frontage.set(l.id, { road: r.id, gap: g, fd, fw });
}
const v1Giver = new Map();
for (const p of V1.places) if (p.kind === 'giver') { const e = V1RH.nearest(p.x, p.y, 80); if (e) v1Giver.set(p.id, e.it.ref.id); }
vlog('v1 frontage shops:', v1Frontage.size, 'givers:', v1Giver.size);

// 9.2 cluster members (locked, translated)
for (const c of CLUSTERS) for (const id of c.lms) {
  const l = cloneLm(id); moveLm(l, l.x + c.T[0], l.y + c.T[1]); l.conf = c.conf || 'low'; l.cluster = c.id; LM.set(id, l);
}
// roofs + planks + stairs (colony houses under the roofs are built by world.js)
const roofCluster = new Map(); for (const c of CLUSTERS) for (const id of c.roofs) roofCluster.set(id, c);
for (const r1 of V1.roofs) {
  const c = roofCluster.get(r1.id); if (!c) throw new Error('roof outside a cluster: ' + r1.id);
  const r = JSON.parse(JSON.stringify(r1)), [dx, dy] = c.T;
  r.rect = [r.rect[0] + dx, r.rect[1] + dy, r.rect[2], r.rect[3]];
  r.solids = (r.solids || []).map((s) => [s[0] + dx, s[1] + dy, s[2], s[3]]);
  r.stairs = (r.stairs || []).map((s) => Object.assign({}, s, { x: s.x + dx, y: s.y + dy, tx: s.tx + dx, ty: s.ty + dy }));
  r.v1 = r1.rect.slice(0, 2);
  D.roofs.push(r);
  if (!r.building) markRect(r.rect[0] - 2, r.rect[1] - 2, r.rect[2] + 4, r.rect[3] + 4, 6);
}
for (const pk of V1.planks) { const c = roofCluster.get(pk.a); D.planks.push({ id: pk.id, a: pk.a, b: pk.b, rect: [pk.rect[0] + c.T[0], pk.rect[1] + c.T[1], pk.rect[2], pk.rect[3]] }); }
for (const l of LM.values()) markLandmark(l);

// 9.3 Tank Bund statues 1..12 from the Lumbini end, and the two Kakatiya arches
{
  const tb = ROADS_OUT.get('tank_bund'), pts = tb.pts, c = G.cum(pts);
  // which side is the lake? (left of travel = (dy, -dx))
  let lake = 0; for (let t = 0.2; t <= 0.8; t += 0.1) { const p = G.atFrac(pts, t, c); const lx = p.x + p.dy * 50, ly = p.y - p.dx * 50; lake += WR.get(lx, ly) === 1 ? 1 : -1; }
  const side = lake >= 0 ? 1 : -1;
  for (let k = 0; k < 12; k++) {
    const p = G.atFrac(pts, 0.16 + k * 0.064, c), nx = p.dy * side, ny = -p.dx * side;
    const l = cloneLm('tank_bund_statue_' + (k + 1));
    moveLm(l, p.x + nx * (tb.w / 2 + 4), p.y + ny * (tb.w / 2 + 4)); l.faceAngle = Math.round(Math.atan2(-ny, -nx) * 1000) / 1000; l.conf = 'low'; l.proc = 'tank_bund';
    LM.set(l.id, l);
  }
  const arch = (id, t) => { const p = G.atFrac(pts, t, c), nx = -p.dy * side, ny = p.dx * side; const l = cloneLm(id); moveLm(l, p.x + nx * (tb.w / 2 + 16), p.y + ny * (tb.w / 2 + 16)); l.conf = 'low'; l.proc = 'tank_bund'; LM.set(id, l); markLandmark(l); };
  arch('kakatiya_arch_s', 0.07); arch('kakatiya_arch_n', 0.9);
  D._tankBundLakeSide = side;
}
// 9.4 railway stations beside the real track
{
  const ST = { nampally_station: 'nampally_station', secunderabad_station: 'secunderabad_station', kachiguda_station: 'kachiguda_station', james_street_station: 'james_street_station',
    begumpet_station: 'begumpet_station', sanjeevaiah_park_station: 'sanjeevaiah_park_station', necklace_road_station: 'necklace_road_station', khairatabad_station: 'khairatabad_station' };
  const railPts = D.rails.filter((r) => r.id !== 'rail_sec_yard').map((r) => r.pts);
  for (const [lid, sid] of Object.entries(ST)) {
    const st = RAIL.stations.find((q) => q.id === sid);
    const ll = st ? st.latlon : [PLACES[lid].lat, PLACES[lid].lon];
    const sp = proj(ll[0], ll[1]);
    let best = null; for (const rp2 of railPts) { const q = G.nearestOnLine(rp2, sp[0], sp[1]); if (q && (!best || q.d < best.d)) best = q; }
    const l = cloneLm(lid);
    // long side along the track
    const ew = Math.abs(best.dx) >= Math.abs(best.dy), long = Math.max(l.w, l.d), short = Math.min(l.w, l.d);
    if (lid !== 'kachiguda_station') { l.w = ew ? long : short; l.d = ew ? short : long; }
    // station side = the side of the real station point (else the left)
    let nx = sp[0] - best.x, ny = sp[1] - best.y; const nl = Math.hypot(nx, ny);
    if (nl < 4) { nx = best.dy; ny = -best.dx; } else { nx /= nl; ny /= nl; }
    const half = Math.abs(nx) * l.w / 2 + Math.abs(ny) * l.d / 2;
    const cx = best.x + nx * (14 + half), cy = best.y + ny * (14 + half);
    l.face = faceOfNormal(-nx, -ny); // entrance away from the track
    l.face = { n: 's', s: 'n', e: 'w', w: 'e' }[l.face];
    const st2 = settle(l, cx, cy, { maxR: 160, pref: Math.atan2(ny, nx) });
    moveLm(l, st2 ? st2.x : cx, st2 ? st2.y : cy);
    l.conf = st ? st.confidence : PLACES[lid].confidence; l.track = [RD(best.x), RD(best.y)];
    LM.set(lid, l); markLandmark(l);
  }
}
// 9.5 Buddha on his rock, Purana Pul arches, Lumbini jetty
{
  const b = cloneLm('buddha_statue'); moveLm(b, BUDDHA[0], BUDDHA[1]); b.conf = 'high'; LM.set(b.id, b); markLandmark(b);
  const br = ROADS_OUT.get('puranapul');
  let I = null; for (let s2 = 0; s2 < br.pts.length - 1 && !I; s2++) for (let m = 0; m < MUSI_LINE.length - 1 && !I; m++) I = G.segInter(br.pts[s2], br.pts[s2 + 1], MUSI_LINE[m], MUSI_LINE[m + 1]);
  const pa = cloneLm('puranapul_arches');
  const q = G.nearestOnLine(br.pts, I ? I.x : br.pts[0][0], I ? I.y : br.pts[0][1]);
  if (Math.abs(q.dx) > Math.abs(q.dy)) { const t = pa.w; pa.w = pa.d; pa.d = t; }
  moveLm(pa, I ? I.x : q.x, I ? I.y : q.y); pa.conf = 'medium'; LM.set(pa.id, pa);
  // the jetty: from the Lumbini shore into the lake
  const lp = realOf('lumbini_jetty') || realOf('lumbini_park');
  const hs = D.water.find((w) => w.id === 'hussain_sagar');
  let bestP = null, bd = Infinity; for (const v of hs.poly) { const d = (v[0] - lp.x) ** 2 + (v[1] - lp.y) ** 2; if (d < bd) { bd = d; bestP = v; } }
  const j = cloneLm('lumbini_jetty');
  const dxl = BUDDHA[0] - bestP[0], dyl = BUDDHA[1] - bestP[1], dl = Math.hypot(dxl, dyl) || 1;
  if (Math.abs(dxl) > Math.abs(dyl)) { const t = j.w; j.w = j.d; j.d = t; }
  moveLm(j, bestP[0] + (dxl / dl) * 10, bestP[1] + (dyl / dl) * 10); j.conf = 'medium'; j.shore = ptR(bestP); LM.set(j.id, j);
}

// 9.6 Golconda: the citadel wall follows the real hill (DEM outline) 30 u out, as a chain of wall
// blocks, with Fateh Darwaza (east) and Banjara Darwaza (north) as gaps where the roads come in
const GOLCONDA = {};
{
  const hill = HILLS.get('golconda_hill');
  const bb = G.bbox(hill.outline), cell = 6, pad = 60;
  const x0 = bb[0] - pad, y0 = bb[1] - pad, gw = Math.ceil((bb[2] - bb[0] + 2 * pad) / cell), gh = Math.ceil((bb[3] - bb[1] + 2 * pad) / cell);
  const m = new Uint8Array(gw * gh);
  const RAD = 30;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = x0 + (i + 0.5) * cell, y = y0 + (j + 0.5) * cell;
    if (G.inPoly(x, y, hill.outline) || G.polyEdgeDist(x, y, hill.outline) < RAD) m[j * gw + i] = 1;
  }
  let ring = traceMask(m, gw, gh, x0, y0, cell, 3)[0];
  ring = G.dp(ring.concat([ring[0]]), 22); ring.pop();
  GOLCONDA.ring = ring;
  const onRing = (x, y) => { let best = null; for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length]; const q = G.closestOnSeg(x, y, a[0], a[1], b[0], b[1]); if (!best || q.d2 < best.d2) best = Object.assign(q, { k }); } return best; };
  const gates = [];
  for (const id of ['golconda_fateh_darwaza', 'banjara_darwaza']) {
    const R = realOf(id), q = onRing(R.x, R.y), l = cloneLm(id);
    moveLm(l, q.x, q.y); l.conf = R.conf; LM.set(id, l); gates.push({ id, x: q.x, y: q.y, half: Math.max(l.w, l.d) / 2 + 2 });
    GOLCONDA[id] = [q.x, q.y];
  }
  // wall blocks along the ring (axis-aligned steps), skipping the gate gaps
  const blocks = [];
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], b = ring[(k + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    const horiz = Math.abs(dx) >= Math.abs(dy);
    const n = Math.max(1, Math.min(Math.ceil((horiz ? Math.abs(dy) : Math.abs(dx)) / 10), Math.floor(L / 18)));
    for (let s2 = 0; s2 < n; s2++) {
      const p0 = [a[0] + (dx * s2) / n, a[1] + (dy * s2) / n], p1 = [a[0] + (dx * (s2 + 1)) / n, a[1] + (dy * (s2 + 1)) / n];
      const cx = (p0[0] + p1[0]) / 2, cy = (p0[1] + p1[1]) / 2;
      if (gates.some((g) => Math.hypot(g.x - cx, g.y - cy) < g.half + Math.max(Math.abs(p1[0] - p0[0]), Math.abs(p1[1] - p0[1])) / 2)) continue;
      const w = horiz ? Math.abs(p1[0] - p0[0]) + 8 : 16, d = horiz ? 16 : Math.abs(p1[1] - p0[1]) + 8;
      blocks.push({ x: cx, y: cy, w: Math.max(16, RD(w)), d: Math.max(16, RD(d)), k });
    }
  }
  // the five v1 ids go to the north-most, south-most, west-most and the two east-most blocks (north / south of the gate)
  const pick = (f) => blocks.reduce((b, q) => (f(q) < f(b) ? q : b));
  const fd = GOLCONDA.golconda_fateh_darwaza;
  const named = new Map();
  named.set(pick((q) => q.y), 'golconda_wall_n'); named.set(pick((q) => -q.y), 'golconda_wall_s'); named.set(pick((q) => q.x), 'golconda_wall_w');
  const east = blocks.filter((q) => !named.has(q)).sort((p2, q) => q.x - p2.x);
  const e1 = east.find((q) => q.y < fd[1]), e2 = east.find((q) => q.y >= fd[1]);
  if (e1) named.set(e1, 'golconda_wall_e1'); if (e2) named.set(e2, 'golconda_wall_e2');
  let n = 1;
  for (const b of blocks) {
    const id = named.get(b) || 'golconda_wall_' + (n++);
    const l = Object.assign({}, V1L.get('golconda_wall_n'), { id, x: RD(b.x), y: RD(b.y), w: b.w, d: b.d, conf: 'medium', note: 'citadel wall along the real hill outline (DEM), 30 u out' });
    l.v1 = V1L.has(id) ? [V1L.get(id).x, V1L.get(id).y] : null; if (!l.v1) delete l.v1;
    LM.set(id, l);
  }
  for (const id of ['golconda_wall_n', 'golconda_wall_s', 'golconda_wall_w', 'golconda_wall_e1', 'golconda_wall_e2']) if (!LM.has(id)) throw new Error('golconda wall id not assigned: ' + id);
  for (const id of LM.keys()) if (/^golconda_wall|darwaza/.test(id)) markLandmark(LM.get(id));
  // the fort road runs in through Fateh Darwaza
  const gr = ROADS_OUT.get('golconda_rd');
  if (gr) {
    const e0 = gr.pts[0], e1p = gr.pts[gr.pts.length - 1];
    const toGate = (p) => Math.hypot(p[0] - fd[0], p[1] - fd[1]);
    const endAtGate = toGate(e1p) <= toGate(e0);
    const pts = endAtGate ? gr.pts.slice() : gr.pts.slice().reverse();
    // drop the last points inside the ring, then go through the gate centre to 40 u inside
    while (pts.length > 2 && G.inPoly(pts[pts.length - 1][0], pts[pts.length - 1][1], ring)) pts.pop();
    const hp = hill.peak, vx = hp[0] - fd[0], vy = hp[1] - fd[1], vl = Math.hypot(vx, vy) || 1;
    const before = [fd[0] - (vx / vl) * 40, fd[1] - (vy / vl) * 40];
    if (toGate(pts[pts.length - 1]) > 60) pts.push(before);
    pts.push([fd[0], fd[1]], [fd[0] + (vx / vl) * 36, fd[1] + (vy / vl) * 36]);
    gr.pts = G.thin(endAtGate ? pts : pts.reverse(), 4);
    GOLCONDA.inside = [fd[0] + (vx / vl) * 36, fd[1] + (vy / vl) * 36];
  }
}
// keep a point inside the Golconda ring (pull it towards the summit)
function insideGolconda(x, y) {
  const ring = GOLCONDA.ring, pk = HILLS.get('golconda_hill').peak;
  let k = 0; while (!G.inPoly(x, y, ring) && k++ < 40) { x += (pk[0] - x) * 0.08; y += (pk[1] - y) * 0.08; }
  if (G.polyEdgeDist(x, y, ring) < 40) { x += (pk[0] - x) * 0.15; y += (pk[1] - y) * 0.15; }
  return [x, y];
}
const GOLCONDA_IN = new Set(['golconda_bala_hissar', 'golconda_jagadamba_temple', 'golconda_sound_light', 'hide_golconda_bastion', 'hide_golconda_court', 'golconda_fort']);

// 9.7 every other landmark: shops snap to their real street; sites sit at their real centre;
// both are then pushed to the nearest clear spot (off roads, water, rails and other buildings)
const MUSTSET = new Set(require(path.join(ROOT, 'tools/validate_map.cjs')).MUST.filter((m) => !m.includes('*')));
const HER = new Set(require(path.join(ROOT, 'tools/validate_map.cjs')).HERITAGE_DRAWS);
const REFACE_OK = new Set(['cinema', 'school', 'temple', 'mosque', 'church', 'irani_cafe', 'restaurant', 'bakery', 'hospital', 'college', 'library', 'film_studio',
  'market_hall', 'museum', 'department_store', 'auditorium', 'radio_station', 'club_house', 'ashram', 'dargah', 'gurudwara', 'mahankali_temple', 'gpo', 'bal_bhavan',
  'clothes_store', 'tiffin_centre', 'kirana', 'stationery', 'photo_studio', 'medical_shop', 'internet_cafe', 'video_parlour', 'barber', 'sweet_shop', 'iyengar_bakery', 'meat_shop', 'pindi_girni']);
const moves = [];
function landmarkCentre(id) {
  const e = PLACES[id]; if (!e) return null;
  if (e.stadium_centre) return proj(e.stadium_centre[0], e.stadium_centre[1]);
  if (e.palace_centroid) return proj(e.palace_centroid[0], e.palace_centroid[1]);
  let p = GEO.placeWorld(e);
  if (!GEO.inFrame(e.lat, e.lon) && !e.anchor_latlon) p = [Math.max(80, Math.min(W - 80, p[0])), Math.max(80, Math.min(H - 80, p[1]))];
  if (GOLCONDA_IN.has(id)) p = insideGolconda(p[0], p[1]);
  return p;
}
function roadSideFrame(q) { const nx = -q.dy * q.side, ny = q.dx * q.side; return [nx, ny]; }
function snapShop(l, fr) {
  const c0 = landmarkCentre(l.id);
  // the v1 street if the real point is near it, else the nearest street that is not a bridge or the bund
  let road = ROADS_OUT.get(fr.road), q = road ? G.nearestOnLine(road.pts, c0[0], c0[1]) : null;
  if (!q || q.d > 200) { const nr = nearestRoad(c0[0], c0[1], 600, (r) => r.kind !== 'bridge' && r.kind !== 'bund'); if (nr) { q = nr; road = nr.road; } }
  if (!q) return false;
  const [nx, ny] = roadSideFrame(q);
  const g = fr.gap > 3.6 ? (FOOTK[road.kind] || 0) + 3 : fr.gap;
  const sx = q.x + nx * (road.w / 2 + g), sy = q.y + ny * (road.w / 2 + g);
  const face = faceOfNormal(nx, ny), ns = face === 'n' || face === 's';
  l.face = face; l.w = ns ? fr.fw : fr.fd; l.d = ns ? fr.fd : fr.fw;
  const e = Math.abs(nx) * l.w / 2 + Math.abs(ny) * l.d / 2;
  const cx = sx + nx * (5 + e), cy = sy + ny * (5 + e);
  let st = settle(l, cx, cy, { maxR: 200, line: road.pts, lineMax: road.w / 2 + g + 5 + 2 * e + 6, pref: Math.atan2(ny, nx) });
  if (!st) st = settle(l, cx, cy, { maxR: 480, pref: Math.atan2(ny, nx) });
  if (!st) { warn('no room for shop ' + l.id); st = { x: cx, y: cy, moved: -1 }; }
  moveLm(l, st.x, st.y);
  // the shop's footpath spot: back towards its road from the final position
  const q2 = G.nearestOnLine(road.pts, l.x, l.y), [mx, my] = roadSideFrame(q2);
  const fe = Math.abs(mx) * l.w / 2 + Math.abs(my) * l.d / 2;
  const face2 = faceOfNormal(mx, my); if (face2 !== l.face) { const ns2 = face2 === 'n' || face2 === 's'; if (ns2 !== ns) { const t = l.w; l.w = l.d; l.d = t; } l.face = face2; }
  l._spot = [l.x - mx * (fe + 5), l.y - my * (fe + 5)];
  l._road = road.id; l.street = road.id;
  moves.push({ id: l.id, kind: 'shop', moved: Math.round(Math.hypot(st.x - cx, st.y - cy)), from: c0 });
  return true;
}
function placeSite(l) {
  const c0 = landmarkCentre(l.id) || (() => { warn('no real position for landmark ' + l.id); return [l.x, l.y]; })();
  // turn generic buildings to face their street when the v1 face side has no street
  if (l.face && REFACE_OK.has(l.draw) && !l.solids && !l.noSolid) {
    const sideHas = (f) => { const v = FACE[f], e = (v[0] ? l.w : l.d) / 2; for (let d = e + 6; d <= e + 70; d += 8) { const x = c0[0] + v[0] * d, y = c0[1] + v[1] * d; if (OCC.get(x, y) === 1) return d - e; } return Infinity; };
    const cur = sideHas(l.face);
    if (cur === Infinity) {
      let best = null; for (const f of ['n', 's', 'e', 'w']) { const d = sideHas(f); if (d < Infinity && (!best || d < best.d)) best = { f, d }; }
      if (best) { const ns0 = l.face === 'n' || l.face === 's', ns1 = best.f === 'n' || best.f === 's'; l._rot = [l.face, best.f]; if (ns0 !== ns1) { const t = l.w; l.w = l.d; l.d = t; } l.face = best.f; }
    }
  }
  const nr = nearestRoad(c0[0], c0[1], 200);
  const pref = nr ? Math.atan2(c0[1] - nr.y, c0[0] - nr.x) : null;
  let st = settle(l, c0[0], c0[1], { maxR: 520, pref, allow: l.inWater ? new Set([2, 7]) : null });
  if (!st) { warn('no room for landmark ' + l.id); st = { x: c0[0], y: c0[1], moved: -1 }; }
  moveLm(l, st.x, st.y);
  moves.push({ id: l.id, kind: 'site', moved: Math.round(st.moved), from: c0 });
}
function placeAll(list) {
  const prio = (l) => (MUSTSET.has(l.id) ? 2e7 : 0) + (HER.has(l.draw) ? 1e7 : 0) + l.w * l.d;
  list.sort((a, b) => prio(b) - prio(a));
  for (const v of list) {
    const l = cloneLm(v.id);
    const e = PLACES[v.id]; l.conf = e ? e.confidence : 'low';
    if (e) l.ll = [e.lat, e.lon];
    const fr = v1Frontage.get(v.id);
    if (fr) snapShop(l, fr); else placeSite(l);
    LM.set(l.id, l); markLandmark(l);
  }
}
// sites first (against the curated streets), then the infill is laid around them, then the shops
placeAll(V1.landmarks.filter((l) => !LM.has(l.id) && !/^golconda_wall/.test(l.id) && !v1Frontage.has(l.id)));

// 6.3 zones the infill keeps out of (cluster layouts, real parks, the airfield, big landmark sites)
const NOINFILL = []; // {poly}
const sqPoly = (c, h) => [[c[0] - h, c[1] - h], [c[0] + h, c[1] - h], [c[0] + h, c[1] + h], [c[0] - h, c[1] + h]];
NOINFILL.push({ id: 'charminar', poly: sqPoly(CHC, 132) }, { id: 'gulzar_houz', poly: sqPoly(GZC, 80) });
for (const c of CLUSTERS) if (c.core) { const a = tr(c, [c.core[0], c.core[1]]), b = tr(c, [c.core[2], c.core[3]]); NOINFILL.push({ id: c.id, poly: [[a[0] - 14, a[1] - 14], [b[0] + 14, a[1] - 14], [b[0] + 14, b[1] + 14], [a[0] - 14, b[1] + 14]] }); }
for (const id of ['public_gardens', 'lumbini_park', 'ntr_gardens', 'sanjeevaiah_park', 'indira_park', 'parade_grounds', 'gymkhana_ground_secunderabad']) if (REALPARK.has(id)) NOINFILL.push({ id, poly: REALPARK.get(id) });
// Begumpet runway (09/27, 3290 m, airfield reference point 17.4531 N 78.4676 E; heading ~089 true): medium confidence
const RUNWAY = (() => {
  const c = [17.4531, 78.4676], half = 1645, brg = 89 * Math.PI / 180;
  const dLat = (Math.cos(brg) * half) / 110700, dLon = (Math.sin(brg) * half) / 106260;
  const a = proj(c[0] - dLat, c[1] - dLon), b = proj(c[0] + dLat, c[1] + dLon);
  return { a, b, line: [a, b], hw: 28 };
})();
NOINFILL.push({ id: 'begumpet_runway', poly: G.ribbon(RUNWAY.line, 150) });
const NI = new G.Raster(W, H, 8);
for (const z of NOINFILL) NI.fillPoly(z.poly, (o) => { NI.a[o] = 1; });
// lanes never run through a landmark compound or a roof zone (they are placed before the infill)
for (const l of LM.values()) for (const s2 of (l.noSolid && !l.solids ? [lmRect(l)] : partsOf(l))) NI.fillRect(s2[0] - 10, s2[1] - 10, s2[2] + 20, s2[3] + 20, (o) => { NI.a[o] = 1; });
for (const r of D.roofs) NI.fillRect(r.rect[0] - 12, r.rect[1] - 12, r.rect[2] + 24, r.rect[3] + 24, (o) => { NI.a[o] = 1; });

// 6.4 OSM residential infill for the districts that were built up by 2003
const INFILL = {
  // spacing between parallel streets (u), shortest piece kept (u), lowest OSM rank (1 living street .. 6 primary)
  charminar: [28, 60, 1], bahadurpura: [30, 70, 1], dabeerpura: [30, 70, 1], puranapul: [30, 70, 1], falaknuma: [40, 100, 2],
  abids: [30, 60, 1], koti: [30, 60, 1], nampally: [32, 70, 1], chaderghat: [32, 70, 1], rtc_x: [34, 80, 1], afzalgunj: [32, 70, 1],
  basheerbagh: [36, 80, 1], himayatnagar: [34, 70, 1], kachiguda: [38, 90, 2], musheerabad: [38, 90, 2], khairatabad: [40, 90, 2],
  masab_tank: [40, 100, 2], malakpet: [42, 100, 2], amberpet: [50, 130, 2], saidabad: [50, 130, 2], dilsukhnagar: [50, 130, 2],
  ameerpet: [46, 120, 2], erragadda: [52, 140, 2], secunderabad: [46, 110, 2], marredpally: [52, 140, 2], hussain_sagar: [56, 150, 2],
  begumpet: [60, 160, 2], banjara: [64, 170, 2], tolichowki: [60, 160, 2], langar_houz: [70, 200, 2], chandrayangutta: [64, 180, 2],
  saroornagar: [64, 180, 2], lb_nagar: [70, 220, 2], osmania: [80, 240, 2], jubilee: [80, 240, 2], balanagar: [90, 260, 3],
  hitec: [110, 320, 4], golconda: [110, 320, 4], zoo: [100, 300, 3], rajendranagar: [120, 360, 4],
};
const POTHOLE = { oldcity: 0.75, market: 0.6, colonial: 0.45, colony: 0.6, cantonment: 0.35, posh: 0.3, rocky: 0.55, hitec: 0.5 };
const OSMKIND = (c) => (c === 'primary' || c === 'trunk' ? ['street', 40] : c === 'secondary' ? ['street', 36] : c === 'tertiary' ? ['street', 32] : c === 'living_street' || c === 'pedestrian' ? ['lane', 18] : ['lane', 22]);
let infillStats = { candidates: 0, kept: 0, pieces: 0, dropped: {} };
{
  const drop = (why) => { infillStats.dropped[why] = (infillStats.dropped[why] || 0) + 1; };
  const curated = roadList().filter((r) => r.kind !== 'path');
  const HC = segIndex(curated, 64);   // curated (for duplicates)
  const HA = segIndex(curated, 64);   // everything accepted so far (for spacing)
  // the Himayatnagar grid (curated OSM lanes >= 80 m) goes in first, then the raw strokes
  const cands = [];
  for (const l of ROADS.himayatnagar_grid.lanes) cands.push({ id: l.id, c: 'residential', n: l.name, rank: 3, p: l.pts, conf: l.confidence, grid: true });
  for (const s of OSMST.strokes) cands.push({ id: 'o' + s.id, c: s.c, n: s.n, rank: s.rank, p: s.p, b: s.b });
  cands.sort((a, b) => (b.grid ? 1 : 0) - (a.grid ? 1 : 0) || b.rank - a.rank || G.len(b.p) - G.len(a.p));
  const usedIds = new Set();
  for (const s of cands) {
    infillStats.candidates++;
    if (s.b) { drop('bridge'); continue; } // OSM bridges: the Musi crossings are curated
    const pts0 = GEO.projectLine(s.p, { maxSegM: 25 });
    if (pts0.some((p) => p[0] < -4 || p[1] < -4 || p[0] > W + 4 || p[1] > H + 4)) { drop('outside'); continue; }
    const mid = G.atFrac(pts0, 0.5), dist = districtAt(mid.x, mid.y);
    const P = dist && INFILL[dist.id]; if (!P) { drop('district'); continue; }
    const [S, minLen, minRank] = P;
    if (s.rank < minRank) { drop('rank'); continue; }
    const [kind, w0] = OSMKIND(s.c);
    const w = dist.style === 'oldcity' && kind === 'lane' ? Math.min(w0, 20) : w0;
    const pts = G.resample(pts0, 6), n = pts.length;
    const bad = new Uint8Array(n);
    const c = G.cum(pts), L = c[n - 1];
    for (let k = 0; k < n; k++) {
      const p = pts[k];
      // water / riverbed / no-infill zones
      const wv = WR.get(p[0], p[1]); if (wv === 1 || wv === 2) { bad[k] = 2; continue; }
      if (NI.get(p[0], p[1])) { bad[k] = 3; continue; }
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
      const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / dl, uy = (b[1] - a[1]) / dl;
      const nearEnd = Math.min(c[k], L - c[k]) < S * 0.9;
      const test = (Hh, rad, pred) => {
        for (const { it, q } of Hh.near(p[0], p[1], rad)) {
          const r = it.ref, sx = it.b[0] - it.a[0], sy = it.b[1] - it.a[1], sl = Math.hypot(sx, sy) || 1;
          const cos = Math.abs((ux * sx + uy * sy) / sl), d = Math.sqrt(q.d2);
          if (pred(r, d, cos)) return true;
        }
        return false;
      };
      // a duplicate of a curated road (runs along it inside its corridor)
      if (test(HC, 60, (r, d, cos) => cos > 0.8 && d < r.w / 2 + (FOOT[r.kind] || 0) + w / 2 + 4)) { bad[k] = 4; continue; }
      // too close to (and parallel with) a street already drawn
      if (!nearEnd && test(HA, S + 30, (r, d, cos) => cos > 0.75 && d < Math.max(S, (r.w + w) / 2 + 6))) { bad[k] = 5; continue; }
      // never run through the core of another street (crossing at a shallow angle)
      if (test(HA, 30, (r, d, cos) => cos > 0.93 && d < (r.w + w) / 4)) { bad[k] = 5; continue; }
    }
    // keep the good runs
    let k = 0, piece = 0;
    while (k < n) {
      if (bad[k]) { k++; continue; }
      let e = k; while (e < n && !bad[e]) e++;
      // extend one sample into a 'too close' run so the piece meets the street it ends at
      const a0 = k > 0 && bad[k - 1] >= 4 ? k - 1 : k, e0 = e < n && bad[e] >= 4 ? e + 1 : e;
      const run = pts.slice(a0, e0);
      k = e;
      if (G.len(run) < minLen) { drop('short'); continue; }
      let id = 'ln_' + s.id + (piece ? '_' + piece : ''); piece++;
      while (usedIds.has(id)) id += 'x';
      usedIds.add(id);
      const rr = { id, name: s.n || (dist.name.split(/ [&(]/)[0] + (kind === 'lane' ? ' gully' : ' road')), kind, w, pts: G.thin(G.dp(run, 1.5), 4), pothole: POTHOLE[dist.style] || 0.5, conf: s.conf || 'high', src: s.grid ? 'grid' : 'osm', osm: s.id };
      addRoad(rr); HA.add(rr.pts, rr);
      infillStats.pieces++;
    }
    infillStats.kept++;
  }
  vlog('infill', JSON.stringify(infillStats));
}



// 9.8 shops on their streets (now that the infill lanes exist)
paintRoadsOcc(); buildRH();
placeAll(V1.landmarks.filter((l) => !LM.has(l.id) && !/^golconda_wall/.test(l.id)));
{
  const big = moves.filter((m) => m.moved > 80).sort((a, b) => b.moved - a.moved);
  vlog('landmarks moved > 80 u to clear space:', big.length, big.slice(0, 30).map((m) => m.id + ':' + m.moved).join(' '));
}
module.exports = { D, V1, G, GEO, W, H, ROADS_OUT, CLUSTERS, CLID, warnings, infillStats, LM, moves, OCC }; // (debug)
