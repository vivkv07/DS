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
 *   design/geo/landmarks_added.json  landmarks with no v1 record (HITEC office block, Indira / Sanjeevaiah Park
 *                                gates): placed exactly as given, locked, after the v1 sites
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
const ADDED_LM = (fs.existsSync(path.join(ROOT, 'design/geo/landmarks_added.json')) ? readJ('landmarks_added.json').landmarks : []) || [];

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
  const sw = MUSI.width_samples.filter((s) => s[2] > 0).map((s) => { const p = proj(s[0], s[1]); return { x: p[0], y: p[1], m: s[2] }; });
  const firstW = proj(MUSI.width_samples.find((s) => s[2] > 0)[0], MUSI.width_samples.find((s) => s[2] > 0)[1]);
  const widthAt = (p) => { let b = sw[0], bd = Infinity; for (const s of sw) { const d = (s.x - p[0]) ** 2 + (s.y - p[1]) ** 2; if (d < bd) { bd = d; b = s; } } return b.m; };
  const CH = 16; // channel half width (u): the 2003 channel was 10-40 m wide; boats need room
  // upstream of the first sample (above Bapu Ghat) the Musi is a small stream without a wide bed
  const hwBed = line.map((p) => { const u = upmAt(p[0], p[1]); if (p[0] < firstW[0] - 200) return CH + 10; return Math.max(CH + 22, Math.min(150, (widthAt(p) / 2) * u * 1.15)); });
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

const landmarkCentreEarly = (id) => { const e = PLACES[id]; return GEO.placeWorld(e); };
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
// clip every line to the world rectangle: a road that leaves the map ends exactly on its edge
function clipToWorld(pts) {
  const inside = (p2) => p2[0] >= 0 && p2[1] >= 0 && p2[0] <= W && p2[1] <= H;
  const edgeHit = (a2, b2) => { // point where segment a->b crosses the rectangle boundary
    let t = 1; const dx = b2[0] - a2[0], dy = b2[1] - a2[1];
    if (b2[0] < 0) t = Math.min(t, -a2[0] / dx); if (b2[0] > W) t = Math.min(t, (W - a2[0]) / dx);
    if (b2[1] < 0) t = Math.min(t, -a2[1] / dy); if (b2[1] > H) t = Math.min(t, (H - a2[1]) / dy);
    return [a2[0] + dx * t, a2[1] + dy * t];
  };
  const runs = []; let cur = [];
  for (let k = 0; k < pts.length; k++) {
    const p2 = pts[k];
    if (inside(p2)) { if (!cur.length && k > 0) cur.push(edgeHit(p2, pts[k - 1])); cur.push(p2); }
    else if (cur.length) { cur.push(edgeHit(pts[k - 1], p2)); runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  runs.sort((a2, b2) => G.len(b2) - G.len(a2));
  return runs[0] && runs[0].length > 1 ? runs[0] : null;
}
for (const r of roadList()) { const c = clipToWorld(r.pts); if (c) r.pts = c; else warn('road ' + r.id + ' lies outside the world'); }
// the Old Mumbai Highway beyond Gachibowli (Gachibowli stadium, University of Hyderabad) is not in the road
// file: a low-confidence continuation from the end of old_mumbai_rd to the west edge, east of the stadium
{
  const om = ROADS_OUT.get('old_mumbai_rd'), e = om.pts[0][0] < om.pts[om.pts.length - 1][0] ? om.pts[0] : om.pts[om.pts.length - 1];
  const gs = landmarkCentreEarly('gachibowli_stadium');
  const pts = [e.slice(), [gs[0] + 330, gs[1] + 150], [gs[0] + 180, gs[1] - 120], [gs[0] - 140, gs[1] - 400], [0, gs[1] - 640]];
  addRoad({ id: 'gachibowli_rd', name: 'Old Mumbai Highway (Gachibowli)', kind: 'arterial', w: 48, pts: G.thin(G.dp(G.resample(pts, 40), 2), 4), median: false, pothole: 0.5, conf: 'low', src: 'roads', note: 'estimated continuation to Lingampally past the stadium and the University (no alignment in the data)' });
}
// the Gandipet road to Osman Sagar leaves the frame where water.json's off-map arrow points (low confidence west of
// the alignment's end)
{
  // The straight line to the off-map arrow (17.379 N, north of the river) crossed the meandering Musi three times;
  // the estimate now keeps to the south bank, as the real alignment does west of Langar Houz, and leaves the frame
  // 480 m south of the river (17.3705 N; the river is at 17.3749 N on the west edge, Osman Sagar's dam beyond it).
  const gr = ROADS_OUT.get('gandipet_rd');
  const tgt = proj(17.3705, GEO.FRAME ? GEO.FRAME.lonW : 78.33507); tgt[0] = 0;
  const atStart = gr.pts[0][0] < gr.pts[gr.pts.length - 1][0];
  const e = atStart ? gr.pts[0] : gr.pts[gr.pts.length - 1];
  if (e[0] > 40) {
    const ext = G.resample([e.slice(), tgt], 60);
    if (atStart) gr.pts = ext.slice(1).reverse().concat(gr.pts); else gr.pts = gr.pts.concat(ext.slice(1));
    gr.note = 'west of Langar Houz the line to the frame edge (towards Osman Sagar) is estimated';
  }
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
// cluster water (the Mecca Masjid houz)
for (const c of CLUSTERS) for (const id of c.water) {
  const v = V1WATER.get(id); const w = addWater(id, v.name, v.poly.map((q) => tr(c, q)), Object.assign({ bank: v.bank || 0, conf: 'medium' }, v.color ? { color: v.color } : {}));
  WR.fillPoly(w.poly, (o) => { WR.a[o] = 1; });
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


const NOINFILL_EXTRA = [];
// 6.3 a curated road that crosses the Musi channel gets an explicit bridge piece there (the 2003 crossing)
{
  const ch = MUSI_CHANNEL;
  for (const r of roadList()) {
    if (r.kind === 'bridge' || r.kind === 'path') continue;
    const dense = G.resample(r.pts, 4), inW = dense.map((p2) => G.inPoly(p2[0], p2[1], ch));
    if (!inW.some(Boolean)) continue;
    if (inW[0] || inW[inW.length - 1]) { warn(`road ${r.id} ends in the Musi channel`); continue; }
    // runs of samples in the channel, each padded by 5 samples (20 u); runs that touch after padding merge
    const runs = [];
    for (let k = 0; k < inW.length; k++) {
      if (!inW[k]) continue;
      let e2 = k; while (e2 + 1 < inW.length && inW[e2 + 1]) e2++;
      const a3 = Math.max(0, k - 5), b3 = Math.min(dense.length - 1, e2 + 5);
      if (runs.length && a3 <= runs[runs.length - 1][1]) runs[runs.length - 1][1] = b3; else runs.push([a3, b3]);
      k = e2;
    }
    const base = Object.assign({}, r);
    r.pts = G.thin(G.dp(dense.slice(0, runs[0][0] + 1), 1.5), 4);
    runs.forEach(([a3, b3], i) => {
      const sfx = i ? String(i + 1) : '';
      addRoad({ id: r.id + '_bridge' + sfx, name: r.name + ' (bridge)', kind: 'bridge', w: Math.max(30, r.w - 8), pts: G.thin(G.dp(dense.slice(a3, b3 + 1), 1), 4), conf: 'low', src: 'roads', pothole: 0.3, note: 'Musi crossing on the real alignment; 2003 bridge not verified' });
      const nextA = i + 1 < runs.length ? runs[i + 1][0] : dense.length - 1;
      addRoad(Object.assign({}, base, { id: r.id + '_' + (i + 2), pts: G.thin(G.dp(dense.slice(b3, nextA + 1), 1.5), 4) }));
    });
    warn(`road ${r.id} crosses the Musi ${runs.length}x: split with bridge piece(s) ${r.id}_bridge..`);
  }
}
/* ===================================================================== 7. rails */
{
  const sec = (id) => { const s = RAIL.sections.find((q) => q.id === id); return projLine(s.pts, 1.5); };
  const join = (...parts) => { const out = []; for (const p of parts) { for (const q of p) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 3) out.push(q); } } return out; };
  const rev = (p) => p.slice().reverse();
  const RL = (id, name, pts) => D.rails.push({ id, name, pts: (clipToWorld(pts) || pts).map(ptR), w: 16 });
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
const allRoadsRH = () => { const h = new G.SegHash(64); for (const r of roadList()) h.add(r.pts, r); return h; };

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
// the Laad Bazaar bangle shops (v1 stood them in a row with no street in front): front the real lane,
// each on the side its real point lies, spread along it by settle() so none stands behind another
for (const id of ['bangle_shop_1', 'bangle_shop_2', 'bangle_shop_3', 'bangle_shop_4']) {
  const l = V1.landmarks.find((x) => x.id === id);
  if (l) v1Frontage.set(id, { road: 'laad_bazaar', gap: 2, fd: l.d, fw: l.w });
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
  const arch = (id, t) => { const p = G.atFrac(pts, t, c), nx = -p.dy * side, ny = p.dx * side; const l = cloneLm(id); const x = p.x + nx * (tb.w / 2 + 16), y = p.y + ny * (tb.w / 2 + 16); const st = settle(l, x, y, { maxR: 120, pref: Math.atan2(ny, nx) }); moveLm(l, st ? st.x : x, st ? st.y : y); l.conf = 'low'; l.proc = 'tank_bund'; LM.set(id, l); markLandmark(l); };
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
  // the arches follow the bridge's own axis (the real span is ~17 deg off north-south): w x d stay the v1
  // across x along sizes and faceAngle (the direction along the span) turns the 2D and 3D models onto the road
  if (Math.abs(q.dx) > Math.abs(q.dy) && pa.w > pa.d) { const t = pa.w; pa.w = pa.d; pa.d = t; }
  const ang = Math.atan2(q.dy, q.dx);
  pa.faceAngle = Math.round((ang < 0 ? ang + Math.PI : ang) * 1000) / 1000;
  delete pa.face;
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

// 9.6 Golconda: the outer fort wall runs through the researchers' five wall points (N, E1, E2, S, W; ~1.2 km
// across) as a smooth closed curve, built from non-overlapping wall blocks; gaps where roads come in, the two
// gates (Fateh Darwaza, Banjara Darwaza) on the curve nearest their real positions
const GOLCONDA = {};
{
  const ids = ['golconda_wall_n', 'golconda_wall_e1', 'golconda_wall_e2', 'golconda_wall_s', 'golconda_wall_w'];
  const P0 = ids.map((id) => { const r = realOf(id); return [r.x, r.y]; });
  const cx = P0.reduce((s2, p2) => s2 + p2[0], 0) / P0.length, cy = P0.reduce((s2, p2) => s2 + p2[1], 0) / P0.length;
  const ord = P0.map((p2, i) => ({ p: p2, a: Math.atan2(p2[1] - cy, p2[0] - cx), id: ids[i] })).sort((p2, q) => p2.a - q.a);
  const n = ord.length, ring = [];
  for (let k = 0; k < n; k++) {
    const p0 = ord[(k - 1 + n) % n].p, p1 = ord[k].p, p2 = ord[(k + 1) % n].p, p3 = ord[(k + 2) % n].p;
    for (let t = 0; t < 1; t += 1 / 30) {
      const t2 = t * t, t3 = t2 * t;
      const f = (a0, a1, a2, a3) => 0.5 * (2 * a1 + (-a0 + a2) * t + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t2 + (-a0 + 3 * a1 - 3 * a2 + a3) * t3);
      ring.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  GOLCONDA.ring = ring; GOLCONDA.centre = [cx, cy];
  const onRing = (x, y) => { let best = null; for (let k = 0; k < ring.length; k++) { const a2 = ring[k], b2 = ring[(k + 1) % ring.length]; const q = G.closestOnSeg(x, y, a2[0], a2[1], b2[0], b2[1]); if (!best || q.d2 < best.d2) best = Object.assign(q, { k }); } return best; };
  // gates
  const gates = [];
  for (const id of ['golconda_fateh_darwaza', 'banjara_darwaza']) {
    const R = realOf(id), q = onRing(R.x, R.y), l = cloneLm(id);
    moveLm(l, q.x, q.y); l.conf = R.conf; LM.set(id, l); gates.push({ id, x: q.x, y: q.y, r: Math.max(l.w, l.d) / 2 + 6 });
    GOLCONDA[id] = [q.x, q.y];
  }
  // gate passages run across the wall (along the outward normal): turn a gate whose v1 passage runs the other way
  for (const g of gates) {
    const l = LM.get(g.id), nx = g.x - cx, ny = g.y - cy;
    const passEW = Math.abs(nx) >= Math.abs(ny);
    const v1EW = l.d > l.w; // posts north/south -> passage east-west
    if (passEW !== v1EW) {
      const t = l.w; l.w = l.d; l.d = t;
      l.solids = (l.solids || []).map((s2) => { const ox = s2[0] + s2[2] / 2 - l.x, oy = s2[1] + s2[3] / 2 - l.y; return [RD(l.x + oy - s2[3] / 2), RD(l.y + ox - s2[2] / 2), s2[3], s2[2]]; });
      l.face = { n: 'e', e: 's', s: 'w', w: 'n' }[l.face] || l.face; l.axis = passEW ? 'ew' : 'ns';
    }
    g.out = passEW ? [Math.sign(nx), 0] : [0, Math.sign(ny)];
  }
  // the fort road runs in through Fateh Darwaza
  const fd = GOLCONDA.golconda_fateh_darwaza, fg = gates[0];
  const gr = ROADS_OUT.get('golconda_rd');
  if (gr) {
    const dEnd = (p2) => Math.hypot(p2[0] - fd[0], p2[1] - fd[1]);
    const atEnd = dEnd(gr.pts[gr.pts.length - 1]) <= dEnd(gr.pts[0]);
    let pts = atEnd ? gr.pts.slice() : gr.pts.slice().reverse();
    const A = [fd[0] + fg.out[0] * 80, fd[1] + fg.out[1] * 80];
    while (pts.length > 2 && (G.inPoly(pts[pts.length - 1][0], pts[pts.length - 1][1], ring) || dEnd(pts[pts.length - 1]) < 150)) pts.pop();
    const E = pts[pts.length - 1];
    const C = fg.out[0] ? [A[0], E[1]] : [E[0], A[1]]; // come round to the approach line first
    if (Math.hypot(C[0] - E[0], C[1] - E[1]) > 8 && Math.hypot(C[0] - A[0], C[1] - A[1]) > 8) pts.push(C);
    pts.push(A, [fd[0], fd[1]], [fd[0] - fg.out[0] * 50, fd[1] - fg.out[1] * 50]);
    gr.pts = G.thin(atEnd ? pts : pts.reverse(), 4);
    GOLCONDA.inside = [fd[0] - fg.out[0] * 50, fd[1] - fg.out[1] * 50];
  }
  // wall band on a 12 u raster, minus gates and road crossings
  const cell = 12, bb = G.bbox(ring), x0 = Math.floor((bb[0] - 30) / cell) * cell, y0 = Math.floor((bb[1] - 30) / cell) * cell;
  const gw = Math.ceil((bb[2] - x0 + 30) / cell), gh = Math.ceil((bb[3] - y0 + 30) / cell), m = new Uint8Array(gw * gh);
  const near = roadList().filter((r) => { const b2 = G.bbox(r.pts); return b2[2] > bb[0] - 60 && b2[0] < bb[2] + 60 && b2[3] > bb[1] - 60 && b2[1] < bb[3] + 60; });
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = x0 + (i + 0.5) * cell, y = y0 + (j + 0.5) * cell;
    if (G.polyEdgeDist(x, y, ring) > 9) continue;
    if (gates.some((g) => Math.hypot(g.x - x, g.y - y) < g.r)) continue;
    if (near.some((r) => { const q = G.nearestOnLine(r.pts, x, y); return q && q.d < r.w / 2 + (FOOT[r.kind] || 0) + 10; })) continue;
    m[j * gw + i] = 1;
  }
  // merge into rectangles: horizontal runs, then stack identical runs
  const boxes = [], open = new Map();
  for (let j = 0; j <= gh; j++) {
    const runs = [];
    if (j < gh) { let i = 0; while (i < gw) { if (!m[j * gw + i]) { i++; continue; } let e = i; while (e < gw && m[j * gw + e]) e++; runs.push([i, e]); i = e; } }
    const next = new Map();
    for (const [i, e] of runs) { const k = i + ',' + e; if (open.has(k)) { next.set(k, open.get(k)); open.delete(k); } else next.set(k, { i, e, j0: j }); }
    for (const b2 of open.values()) boxes.push({ x: x0 + b2.i * cell, y: y0 + b2.j0 * cell, w: (b2.e - b2.i) * cell, d: (j - b2.j0) * cell });
    open.clear(); for (const [k, v] of next) open.set(k, v);
  }
  const named = new Map();
  for (const id of ids) { const r = realOf(id); let best = null, bd = Infinity; for (const b2 of boxes) { if (named.has(b2)) continue; const d = Math.hypot(b2.x + b2.w / 2 - r.x, b2.y + b2.d / 2 - r.y); if (d < bd) { bd = d; best = b2; } } named.set(best, id); }
  let k = 1;
  const tmpl = V1L.get('golconda_wall_n');
  for (const b2 of boxes) {
    const id = named.get(b2) || 'golconda_wall_' + (k++);
    const l = Object.assign({}, tmpl, { id, x: RD(b2.x + b2.w / 2), y: RD(b2.y + b2.d / 2), w: b2.w, d: b2.d, conf: 'low', note: 'outer fort wall through the estimated wall points (researchers, ~1.2 km across)' });
    if (V1L.has(id)) l.v1 = [V1L.get(id).x, V1L.get(id).y];
    LM.set(id, l); markLandmark(l);
  }
  for (const g of gates) markLandmark(LM.get(g.id));
  NOINFILL_EXTRA.push({ id: 'golconda', poly: ring });
}
// keep a point inside the Golconda ring (pull it towards the summit)
function insideGolconda(x, y) {
  const ring = GOLCONDA.ring, pk = realOf('golconda_bala_hissar') ? [realOf('golconda_bala_hissar').x, realOf('golconda_bala_hissar').y] : GOLCONDA.centre;
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
// things beyond the frame stand at the world edge where their road leaves the map
const EDGE = { jntu_kukatpally: 'mumbai_hwy', kphb_colony: 'mumbai_hwy', playground_16: 'mumbai_hwy', rashtrapati_nilayam: 'trimulgherry_rd', holy_trinity_church_bolarum: 'trimulgherry_rd',
  harina_vanasthali: 'malakpet_rd', ramoji_film_city: 'malakpet_rd', vijayawada_highway: 'malakpet_rd', university_of_hyderabad: 'gachibowli_rd',
  gandipet: 'gandipet_rd', chilkur_balaji: 'gandipet_rd', mrugavani_park: 'gandipet_rd', himayat_sagar: 'gandipet_rd' };
const EDGE_SIDE = { jntu_kukatpally: 1, kphb_colony: -1, playground_16: -1, rashtrapati_nilayam: 1, holy_trinity_church_bolarum: -1, harina_vanasthali: 1, ramoji_film_city: -1, vijayawada_highway: 0, university_of_hyderabad: 1,
  gandipet: 0, chilkur_balaji: 1, mrugavani_park: -1, himayat_sagar: 1 };
function edgeExit(roadId) {
  // the road, or the piece of it that reaches the frame (roads split at the Musi keep the id on the first piece only)
  const dEdge = (p2) => Math.min(p2[0], p2[1], W - p2[0], H - p2[1]);
  const pieces = roadList().filter((q) => (q.id === roadId || q.id.startsWith(roadId + '_')) && q.kind !== 'bridge' && q.pts.length > 1);
  let r = ROADS_OUT.get(roadId), bestD = Infinity;
  for (const q of pieces) { const d = Math.min(dEdge(q.pts[0]), dEdge(q.pts[q.pts.length - 1])); if (d < bestD) { bestD = d; r = q; } }
  const a2 = r.pts[0], b2 = r.pts[r.pts.length - 1];
  const end = dEdge(a2) <= dEdge(b2) ? 0 : 1, E = end ? b2 : a2, P2 = end ? r.pts[r.pts.length - 2] : r.pts[1];
  const ux = P2[0] - E[0], uy = P2[1] - E[1], ul = Math.hypot(ux, uy) || 1; // inward along the road
  return { E, ux: ux / ul, uy: uy / ul, road: r };
}
function edgePos(id, w, d) {
  const X = edgeExit(EDGE[id]), sd = EDGE_SIDE[id] || 0, nx = -X.uy, ny = X.ux;
  const along = 60 + Math.max(w, d), off = sd ? X.road.w / 2 + 16 + Math.max(w, d) / 2 : 0;
  return [X.E[0] + X.ux * along + nx * off * sd, X.E[1] + X.uy * along + ny * off * sd];
}
// the four Laad Bazaar bangle shops: steered to [arc length from Charminar circle (u), side] on the lane, so
// they face each other across it in two pairs (snapShop then fronts them onto it)
const LAAD_SHOPS = { bangle_shop_1: [34, -1], bangle_shop_2: [40, 1], bangle_shop_3: [138, -1], bangle_shop_4: [146, 1] };
function laadShopPoint(id) {
  const r = ROADS_OUT.get('laad_bazaar'); if (!r) return null;
  const [s0, sd] = LAAD_SHOPS[id];
  let acc = 0;
  for (let k = 0; k < r.pts.length - 1; k++) {
    const a2 = r.pts[k], b2 = r.pts[k + 1], L = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
    if (acc + L >= s0 || k === r.pts.length - 2) {
      const t = Math.min(1, (s0 - acc) / (L || 1)), ux = (b2[0] - a2[0]) / (L || 1), uy = (b2[1] - a2[1]) / (L || 1);
      return [a2[0] + ux * L * t - uy * sd * 20, a2[1] + uy * L * t + ux * sd * 20];
    }
    acc += L;
  }
  return null;
}
function landmarkCentre(id) {
  if (LAAD_SHOPS[id]) { const q = laadShopPoint(id); if (q) return q; }
  const e = PLACES[id]; if (!e) return null;
  if (EDGE[id]) { const v = V1L.get(id); return edgePos(id, v ? v.w : 30, v ? v.d : 30); }
  if (id === 'playground_kit_16') { const q = edgePos('playground_16', 20, 20); return [q[0] + 52, q[1] - 20]; }
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
// explicit fronts where the automatic turn picks the wrong street: Sandhya and Odeon at RTC X Roads would face
// each other across a ~4 u gap (Sandhya fronts Chikkadpally Road to its east, Odeon the lane to its west)
const FACE_FIX = { sandhya_theatre: 'e', odeon_theatre: 'w' };
function placeSite(l) {
  const c0 = landmarkCentre(l.id) || (() => { warn('no real position for landmark ' + l.id); return [l.x, l.y]; })();
  if (FACE_FIX[l.id] && l.face) {
    const f = FACE_FIX[l.id], ns0 = l.face === 'n' || l.face === 's', ns1 = f === 'n' || f === 's';
    if (ns0 !== ns1) { const t = l.w; l.w = l.d; l.d = t; }
    l.face = f;
  } else if (l.face && REFACE_OK.has(l.draw) && !l.solids && !l.noSolid) {
    // turn generic buildings to face their street when the v1 face side has no street
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
const ADDED_GATES = [];
// 9.7b landmarks with no v1 record (design/geo/landmarks_added.json): exactly where given, locked like the clusters
for (const a of ADDED_LM) {
  if (LM.has(a.id) || V1L.has(a.id)) throw new Error('landmarks_added.json: ' + a.id + ' already exists');
  const l = JSON.parse(JSON.stringify(a));
  // (footpath margins are allowed: tools/validate_map.cjs checks the road cells themselves)
  if (!clearAt(l, l.x, l.y, { pad: 0, allow: new Set([1, 8]) })) warn('added landmark ' + l.id + ' overlaps water / a rail / a solid / a roof at its given spot');
  LM.set(l.id, l); LOCK.set(l.id, true);
  // walk-through gates mark their piers only after the access spurs (a park's spur may run through its gate)
  if (l.noSolid) ADDED_GATES.push(l); else markLandmark(l);
}

// 6.3 zones the infill keeps out of (cluster layouts, real parks, the airfield, big landmark sites)
const NOINFILL = []; // {poly}
const sqPoly = (c, h) => [[c[0] - h, c[1] - h], [c[0] + h, c[1] - h], [c[0] + h, c[1] + h], [c[0] - h, c[1] + h]];
NOINFILL.push({ id: 'charminar', poly: sqPoly(CHC, 132) }, { id: 'gulzar_houz', poly: sqPoly(GZC, 80) }, ...NOINFILL_EXTRA);
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
for (const l of LM.values()) for (const s2 of (l.noSolid && !l.solids ? [lmRect(l)] : partsOf(l))) NI.fillRect(s2[0] - 24, s2[1] - 24, s2[2] + 48, s2[3] + 48, (o) => { NI.a[o] = 1; });
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



// 9.75 one connected network (validate_map rules): islands reach out to the network or are dropped
function components() {
  for (const r of roadList()) r.pts = r.pts.map(ptR);
  const roads = roadList().filter((r) => r.kind !== 'path');
  const H0 = segIndex(roads, 64);
  const idx = new Map(roads.map((r, i) => [r, i]));
  const parent = roads.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a2, b2) => { parent[find(a2)] = find(b2); };
  roads.forEach((A, a2) => {
    for (const e of [A.pts[0], A.pts[A.pts.length - 1]]) for (const { it, q } of H0.near(e[0], e[1], 40)) { const B = it.ref; if (B !== A && q.d2 <= (B.w / 2 + 5) ** 2) join(a2, idx.get(B)); }
    for (let s2 = 0; s2 < A.pts.length - 1; s2++) {
      const a0 = A.pts[s2], a1 = A.pts[s2 + 1], mx = (a0[0] + a1[0]) / 2, my = (a0[1] + a1[1]) / 2, rr = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) / 2 + 2;
      for (const { it } of H0.near(mx, my, rr)) { const B = it.ref; if (B !== A && G.segInter(a0, a1, it.a, it.b)) join(a2, idx.get(B)); }
    }
  });
  const comps = new Map(); roads.forEach((r, i) => { const c = find(i); if (!comps.has(c)) comps.set(c, []); comps.get(c).push(r); });
  return [...comps.values()].sort((a2, b2) => b2.length - a2.length);
}
{
  let comps = components(), fixed = 0, dropped = 0, kept = 0;
  const main = new Set(comps[0]);
  const HM = segIndex(comps[0], 64);
  for (const comp of comps.slice(1)) {
    let linked = false;
    for (const r of comp) {
      for (const end of [0, 1]) {
        const pts = r.pts, e = end ? pts[pts.length - 1] : pts[0], pr = end ? pts[pts.length - 2] : pts[1];
        const dx = e[0] - pr[0], dy = e[1] - pr[1], dl = Math.hypot(dx, dy) || 1;
        // straight on up to 48 u, else the nearest main road within 36 u
        let hit = null;
        for (let t = 4; t <= 48 && !hit; t += 4) { const x = e[0] + (dx / dl) * t, y = e[1] + (dy / dl) * t; const n2 = HM.nearest(x, y, 20); if (n2 && Math.sqrt(n2.q.d2) < n2.it.ref.w / 2) hit = [n2.q.x, n2.q.y]; }
        if (!hit) { const n2 = HM.nearest(e[0], e[1], 36); if (n2) hit = [n2.q.x, n2.q.y]; }
        const blocked = (a2, b2) => { const L = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) || 1, nx = -(b2[1] - a2[1]) / L, ny = (b2[0] - a2[0]) / L; for (let t = 0; t <= L; t += 3) for (const o of [-(r.w / 2 + 2), 0, r.w / 2 + 2]) { const v = OCC.get(a2[0] + ((b2[0] - a2[0]) * t) / L + nx * o, a2[1] + ((b2[1] - a2[1]) * t) / L + ny * o); if (v === 2 || v === 3 || v === 6) return true; } return false; };
        if (hit && !blocked(e, hit)) { if (end) pts.push(hit); else pts.unshift(hit); linked = true; break; }
      }
      if (linked) break;
    }
    if (linked) { fixed++; continue; }
    if (comp.every((r) => r.src === 'osm' || r.src === 'grid')) { for (const r of comp) ROADS_OUT.delete(r.id); dropped += comp.length; continue; }
    // a curated island gets a connector lane from its closest end to the network (up to 400 u, never over water)
    let best = null;
    for (const r of comp) for (const e of [r.pts[0], r.pts[r.pts.length - 1]]) { const n2 = HM.nearest(e[0], e[1], 400); if (n2 && (!best || n2.q.d2 < best.d2)) best = { d2: n2.q.d2, e, q: [n2.q.x, n2.q.y], r }; }
    if (best) {
      const mid = [(best.e[0] + best.q[0]) / 2, (best.e[1] + best.q[1]) / 2];
      if (WR.get(mid[0], mid[1]) === 1) warn('connector over water for ' + best.r.id);
      addRoad({ id: best.r.id + '_link', name: best.r.name, kind: 'street', w: 32, pts: [best.e.slice(), best.q], conf: 'low', src: 'roads', pothole: 0.5, note: 'connector added by the builder' });
      kept++; vlog('connector for island ' + comp.map((r) => r.id).join(', ') + ': ' + Math.round(Math.sqrt(best.d2)) + ' u');
    } else warn('road island kept (curated): ' + comp.map((r) => r.id).join(', '));
  }
  // a second round catches islands that were linked to other islands
  comps = components();
  for (const comp of comps.slice(1)) if (comp.every((r) => r.src === 'osm' || r.src === 'grid')) { for (const r of comp) ROADS_OUT.delete(r.id); dropped += comp.length; }
  vlog(`network: ${fixed} islands joined, ${dropped} infill roads dropped, ${kept} curated islands, ${components().length} components left`);
}
// 9.8 shops on their streets (now that the infill lanes exist)
paintRoadsOcc(); buildRH();
placeAll(V1.landmarks.filter((l) => !LM.has(l.id) && !/^golconda_wall/.test(l.id)));
{
  const big = moves.filter((m) => m.moved > 80).sort((a, b) => b.moved - a.moved);
  vlog('landmarks moved > 80 u to clear space:', big.length, big.slice(0, 30).map((m) => m.id + ':' + m.moved).join(' '));
}

// 9.76 near-miss junctions (Map v2 QA regression fix; tools/geo/near_miss.cjs has the rules): road ends that stop
// just short of another road are extended onto it, so the engine's road graph joins them (routes made long detours)
{
  const js = require('./near_miss.cjs').joinNearMisses({ roads: roadList(), segIndex, OCC, WR, NI, W, H, FOOT, ptR });
  buildRH();
  vlog('near-miss junctions: ' + JSON.stringify(Object.assign({}, js, { curated: js.curated.length, left: js.left.length })));
  vlog('  curated joins: ' + js.curated.join(', '));
  vlog('  curated ends left open: ' + js.left.join(', '));
}
// roads that lie wholly outside the frame become a short spur from the network to their edge landmark
{
  const uoh = ROADS_OUT.get('uoh_rd'), l = LM.get('university_of_hyderabad');
  if (uoh && l && uoh.pts.some((p2) => p2[0] < 0 || p2[1] < 0 || p2[0] > W || p2[1] > H)) {
    const fv = FACE[l.face || 'e'], e = (fv[0] ? l.w : l.d) / 2 + 18, front = [l.x + fv[0] * e, l.y + fv[1] * e], out = [front[0] + fv[0] * 40, front[1] + fv[1] * 40];
    const n2 = nearestRoad(out[0], out[1], 4000, (r) => r.id !== 'uoh_rd' && r.kind !== 'path');
    uoh.pts = [[n2.x, n2.y], out, front].map(ptR); uoh.conf = 'low'; uoh.note = 'edge spur (the campus is west of the frame)';
  }
}
/* ===================================================================== 10. places */
const placeCluster = new Map(); for (const c of CLUSTERS) for (const id of c.places) placeCluster.set(id, c);
const ROT = { n: 0, e: Math.PI / 2, s: Math.PI, w: -Math.PI / 2 };
const rotV = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
// (pathergatti = the stone arcades on Pathergatti Road, registry 'stone arcades, shops'; the Madina Building stands
// 300 m further north at Madina circle, so the place pairs with the west arcade row, not with madina_building)
const SITE_PAIR = { gpo: 'abids_gpo', pathergatti: 'pathergatti_arcade_w', nizams_museum: 'purani_haveli', golconda_fort: 'golconda_fateh_darwaza' };
const NOT_OK = new Set([2, 3, 6]);
function okAt(x, y, offRoad) {
  if (x < 6 || y < 6 || x > W - 6 || y > H - 6) return false;
  for (const [dx, dy] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) { const v = OCC.get(x + dx, y + dy); if (NOT_OK.has(v) || (offRoad && (v === 1 || v === 8 || v === 4))) return false; }
  return true;
}
function validSpot(x, y, offRoad, maxR) {
  if (okAt(x, y, offRoad)) return [x, y, 0];
  for (let r = 4; r <= (maxR || 200); r += 4) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / 5));
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, xx = x + Math.cos(a) * r, yy = y + Math.sin(a) * r; if (okAt(xx, yy, offRoad)) return [xx, yy, r]; }
  }
  if (offRoad) return validSpot(x, y, false, maxR);
  return [x, y, -1];
}
const pmoves = [];
function setPlace(v, x, y, how) {
  const p = JSON.parse(JSON.stringify(v));
  p.x = RD(x); p.y = RD(y);
  const e = PLACES[v.id];
  if (e) { p.conf = e.confidence; p.ll = [e.lat, e.lon]; }
  if (how) p.how = how;
  PL.set(p.id, p); return p;
}
function onRoad(roadId, R, along) {
  const r = ROADS_OUT.get(roadId); if (!r) return null;
  const q = G.nearestOnLine(r.pts, R[0], R[1]); return q;
}
const roofStairs = new Map(); for (const r of D.roofs) for (const s2 of r.stairs) roofStairs.set(s2.place, s2);
{
  // offsets of v1 places from their landmark, in the landmark's face frame
  for (const v of V1.places) {
    if (v.alias) continue;
    const c = placeCluster.get(v.id);
    if (c) {
      let x = v.x + c.T[0], y = v.y + c.T[1];
      if (v.id === 'hide_charminar_corner') { x = CHC[0] + 108; y = CHC[1] + 108; }
      setPlace(v, x, y, 'cluster:' + c.id); continue;
    }
    if (roofStairs.has(v.id)) { const s2 = roofStairs.get(v.id); setPlace(v, s2.x, s2.y, 'stairs'); continue; }
    if (v.level) { const r = D.roofs.find((q) => q.id === v.level); const r1 = V1RF.get(v.level); setPlace(v, v.x + r.rect[0] - r1.rect[0], v.y + r.rect[1] - r1.rect[1], 'roof'); continue; }
    const lid = LM.has(v.id) ? v.id : SITE_PAIR[v.id];
    if (lid && LM.has(lid)) {
      const l = LM.get(lid), l1 = V1L.get(lid);
      if (l._spot && lid === v.id) { const sp = validSpot(l._spot[0], l._spot[1], false, 60); setPlace(v, sp[0], sp[1], 'shop'); continue; }
      let off = [v.x - l1.x, v.y - l1.y];
      if (l._rot) off = rotV(off, ROT[l._rot[1]] - ROT[l._rot[0]]);
      if (v.virtual) { setPlace(v, l.x, l.y, 'virtual'); continue; }
      if (v.id === 'lumbini_jetty') { const dxl = BUDDHA[0] - l.shore[0], dyl = BUDDHA[1] - l.shore[1], dl = Math.hypot(dxl, dyl); const sp = validSpot(l.shore[0] - (dxl / dl) * 10, l.shore[1] - (dyl / dl) * 10, false, 60); setPlace(v, sp[0], sp[1], 'jetty'); continue; }
      if (v.id === 'buddha_statue') { setPlace(v, BUDDHA[0], BUDDHA[1] + 22, 'island'); continue; }
      const sp = validSpot(l.x + off[0], l.y + off[1], false, 120);
      if (sp[2]) pmoves.push({ id: v.id, moved: sp[2] });
      setPlace(v, sp[0], sp[1], 'entrance'); continue;
    }
    // pure places
    const R = realOf(v.id);
    if (!R) { warn('no real position for place ' + v.id); setPlace(v, v.x, v.y, 'v1'); continue; }
    let x = R.x, y = R.y, how = 'real';
    if (EDGE[v.id]) { [x, y] = edgePos(v.id, 20, 20); how = 'edge'; if (!EDGE_SIDE[v.id]) { const X = edgeExit(EDGE[v.id]); x = X.E[0] + X.ux * 40; y = X.E[1] + X.uy * 40; } else if (!LM.has(v.id)) { const X = edgeExit(EDGE[v.id]); const k = { chilkur_balaji: 70, mrugavani_park: 100, himayat_sagar: 130, kphb_colony: 90, ramoji_film_city: 90 }[v.id] || 60; x = X.E[0] + X.ux * k - X.uy * (X.road.w / 2 + 6) * EDGE_SIDE[v.id]; y = X.E[1] + X.uy * k + X.ux * (X.road.w / 2 + 6) * EDGE_SIDE[v.id]; } }
    else if (!R.inFrame || x < 0 || y < 0 || x > W || y > H) { x = Math.max(30, Math.min(W - 30, x)); y = Math.max(30, Math.min(H - 30, y)); how = 'edge'; const nr = nearestRoad(x, y, 500); if (nr) { x = nr.x; y = nr.y; } }
    if (GOLCONDA_IN.has(v.id)) { [x, y] = insideGolconda(x, y); }
    if (v.kind === 'junction') { const nr = nearestRoad(x, y, 180, (r) => r.src === 'roads' && r.kind !== 'path' && r.kind !== 'lane'); if (nr) { x = nr.x; y = nr.y; how = 'junction'; } }
    else if (v.kind === 'giver') {
      const rid = v1Giver.get(v.id); let q = rid ? onRoad(rid, [x, y]) : null, road = rid ? ROADS_OUT.get(rid) : null;
      if (!q || q.d > 220) { const nr = nearestRoad(x, y, 400, (r) => r.kind !== 'bridge' && r.kind !== 'bund'); if (nr) { q = nr; road = nr.road; } }
      if (q) { const [nx, ny] = roadSideFrame(q), off = road.w / 2 + Math.max(3, (FOOTK[road.kind] || 0) / 2); x = q.x + nx * off; y = q.y + ny * off; how = 'giver:' + road.id; }
    } else if (v.kind === 'bridge') {
      // the bridge road of the same name (real OSM alignment), at its crossing of the river; else the nearest bridge
      const br = ROADS_OUT.get({ purana_pul: 'puranapul' }[v.id] || v.id);
      let I = null;
      if (br) for (let s2 = 0; s2 < br.pts.length - 1 && !I; s2++) for (let m = 0; m < MUSI_LINE.length - 1 && !I; m++) I = G.segInter(br.pts[s2], br.pts[s2 + 1], MUSI_LINE[m], MUSI_LINE[m + 1]);
      if (I) { x = I.x; y = I.y; how = 'bridge:' + br.id; }
      else { const nr = br ? G.nearestOnLine(br.pts, x, y) : nearestRoad(x, y, 200, (r) => r.kind === 'bridge'); if (nr) { x = nr.x; y = nr.y; how = 'bridge'; } }
    } else if (['tank_bund', 'tank_bund_statues', 'ganesh_immersion_point'].includes(v.id)) {
      const tb = ROADS_OUT.get('tank_bund'); const t = v.id === 'tank_bund_statues' ? 0.16 + 5.5 * 0.064 : null;
      const q = t != null ? Object.assign(G.atFrac(tb.pts, t), {}) : G.nearestOnLine(tb.pts, x, y);
      const sd = D._tankBundLakeSide, nx = q.dy * sd, ny = -q.dx * sd; x = q.x + nx * (tb.w / 2 - 6); y = q.y + ny * (tb.w / 2 - 6); how = 'bund';
    } else if (v.id === 'necklace_road' || v.id === 'lower_tank_bund') {
      const nr = onRoad(v.id === 'necklace_road' ? 'necklace_rd' : 'lower_tank_bund', [x, y]); if (nr) { x = nr.x; y = nr.y; how = 'road'; }
    } else if (v.id === 'musi_riverbed') {
      // on the sand of the riverbed
      let best = null; for (let r = 0; r <= 400 && !best; r += 6) for (let k = 0; k < 24 && !best; k++) { const a = (k / 24) * Math.PI * 2, xx = x + Math.cos(a) * r, yy = y + Math.sin(a) * r; if (OCC.get(xx, yy) === 7) best = [xx, yy]; }
      if (best) { x = best[0]; y = best[1]; how = 'riverbed'; }
    }
    const offRoad = v.kind === 'hidden' || v.kind === 'park' || v.kind === 'playground';
    const sp = how === 'junction' || how === 'bund' || how.startsWith('bridge') || how === 'road' ? [x, y, 0] : validSpot(x, y, offRoad, 220);
    if (sp[2]) pmoves.push({ id: v.id, moved: sp[2] });
    setPlace(v, sp[0], sp[1], how);
  }
  for (const v of V1.places) if (v.alias) {
    const t = PL.get(v.alias); if (!t) { warn('alias target missing ' + v.id); continue; }
    const p = JSON.parse(JSON.stringify(v)); p.x = t.x; p.y = t.y; const e = PLACES[v.id]; if (e) { p.conf = e.confidence; p.ll = [e.lat, e.lon]; } PL.set(p.id, p);
  }
  for (const p of PL.values()) { const d = districtAt(p.x, p.y); p.district = d ? d.id : null; }
  // podiums: the junction places (v1 flags) stay junctions
  vlog('places moved off solids/water:', pmoves.filter((m) => m.moved > 30).map((m) => m.id + ':' + m.moved).join(' '));
}

// access spurs: every place a player has to reach (not on water / a roof / virtual) is within 150 u of a road
{
  RH = allRoadsRH();
  let n = 0;
  for (const p2 of PL.values()) {
    if (p2.virtual || p2.level || p2.alias || p2.kind === 'hidden' || p2.boat) continue;
    const nrAny = nearestRoad(p2.x, p2.y, 160);
    if (nrAny && nrAny.d <= 150) continue;
    if (GOLCONDA.ring && G.inPoly(p2.x, p2.y, GOLCONDA.ring)) continue; // inside the fort: the steps path and the fort road
    const nr = nearestRoad(p2.x, p2.y, 3000, (r) => r.kind !== 'path');
    if (!nr) continue;
    // straight spur unless it would cross water or a building; then try the next road candidates
    const clear = (a2, b2) => { const L = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) || 1, nx = -(b2[1] - a2[1]) / L, ny = (b2[0] - a2[0]) / L; for (let t = 0; t <= L; t += 4) for (const o of [-14, -7, 0, 7, 14]) { const x = a2[0] + ((b2[0] - a2[0]) * t) / L + nx * o, y = a2[1] + ((b2[1] - a2[1]) * t) / L + ny * o; const v = OCC.get(x, y); if (v === 2 || v === 3 || v === 6) return false; } return true; };
    let done = false;
    for (const cand of [nr].concat(RH.near(p2.x, p2.y, nr.d + 400).map((e) => { const q = G.nearestOnLine(e.it.ref.pts, p2.x, p2.y); return Object.assign(q, { road: e.it.ref }); }).sort((a2, b2) => a2.d - b2.d).slice(0, 12))) {
      // stop 10 u short of the place so the spur never runs under it
      const dx = p2.x - cand.x, dy = p2.y - cand.y, L = Math.hypot(dx, dy) || 1, end = [p2.x - (dx / L) * 10, p2.y - (dy / L) * 10];
      if (!clear([cand.x, cand.y], end)) continue;
      const id = 'spur_' + p2.id;
      addRoad({ id, name: (p2.name || '').replace(/\s*\(.*\)$/, '') + ' road', kind: 'lane', w: 22, pts: [[cand.x, cand.y], end].map(ptR), spur: true, pothole: 0.6, conf: 'low', src: 'roads', note: 'access spur added by the builder' });
      OCC.fillThick([[cand.x, cand.y], end], 13, (o) => { if (!OCC.a[o]) OCC.a[o] = 1; });
      n++; done = true; vlog('access spur', id, Math.round(nr.d)); break;
    }
    if (!done) warn('no access spur possible for ' + p2.id + ' (' + Math.round(nr.d) + ' u from a road)');
  }
  vlog('access spurs:', n);
  for (const l of ADDED_GATES) markLandmark(l);
}
/* ===================================================================== 11. v1 -> v2 warp (moving least squares, affine) */
// control points: v1 positions of places / landmarks whose real position is known (high / medium) -> where they are now
const MLS_CP = [];
for (const [id, e] of Object.entries(PLACES)) {
  if (!(e.confidence === 'high' || e.confidence === 'medium') || e.alias || e.anchor_latlon || !GEO.inFrame(e.lat, e.lon)) continue;
  const v = V1L.get(id) || V1P.get(id); if (!v) continue;
  const now = LM.get(id) || PL.get(id); if (!now) continue;
  MLS_CP.push([v.x, v.y, now.x, now.y]);
}
for (const c of CLUSTERS) MLS_CP.push([c.v1Anchor[0], c.v1Anchor[1], c.v1Anchor[0] + c.T[0], c.v1Anchor[1] + c.T[1]]);
function mls(x, y) {
  let sw = 0, px = 0, py = 0, qx = 0, qy = 0; const ws = [];
  for (const c of MLS_CP) { const d2 = (c[0] - x) ** 2 + (c[1] - y) ** 2; const w = 1 / (d2 + 400); ws.push(w); sw += w; px += w * c[0]; py += w * c[1]; qx += w * c[2]; qy += w * c[3]; }
  px /= sw; py /= sw; qx /= sw; qy /= sw;
  let a = 0, b = 0, d = 0, m00 = 0, m01 = 0, m10 = 0, m11 = 0;
  MLS_CP.forEach((c, i) => { const w = ws[i], hx = c[0] - px, hy = c[1] - py, gx = c[2] - qx, gy = c[3] - qy; a += w * hx * hx; b += w * hx * hy; d += w * hy * hy; m00 += w * hx * gx; m01 += w * hx * gy; m10 += w * hy * gx; m11 += w * hy * gy; });
  const det = a * d - b * b || 1e-9, i00 = d / det, i01 = -b / det, i11 = a / det;
  const M00 = i00 * m00 + i01 * m10, M01 = i00 * m01 + i01 * m11, M10 = i01 * m00 + i11 * m10, M11 = i01 * m01 + i11 * m11;
  const vx = x - px, vy = y - py;
  return [vx * M00 + vy * M10 + qx, vx * M01 + vy * M11 + qy];
}

/* ===================================================================== 12. parks */
const PK = new Map();
const parkClusterOf = new Map(); for (const c of CLUSTERS) for (const id of c.parks) parkClusterOf.set(id, c);
const COMPOUNDS = [ // v1 compound() calls: [landmark id, pad, kind, extra [l, t, r, b]]
  ['dilsukhnagar_sai_temple', 22, 'plaza', [10, 0, 10, 10]], ['ujjaini_mahankali_temple', 16, 'plaza'], ['lal_darwaza_temple', 14, 'plaza'],
  ['temple_1', 10, 'plaza'], ['temple_2', 10, 'plaza'], ['temple_3', 14, 'plaza'], ['temple_4', 12, 'plaza'], ['temple_5', 12, 'plaza'], ['temple_6', 12, 'plaza'],
  ['peddamma_temple', 16, 'plaza'], ['karmanghat_hanuman_temple', 16, 'plaza'], ['ashtalakshmi_temple', 16, 'plaza'],
  ['balkampet_yellamma_temple', 12, 'plaza'], ['akkanna_madanna_temple', 8, 'plaza'], ['katta_maisamma_temple', 8, 'plaza'],
  ['iskcon_abids', 10, 'plaza'], ['secunderabad_ganesh_temple', 8, 'plaza'],
  ['spanish_mosque', 16, 'garden'], ['jama_masjid_charminar', 6, 'plaza'], ['khairatabad_mosque', 10, 'plaza'],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((k) => ['mosque_' + k, 8, 'plaza']),
  ['dargah_yousufain', 10, 'plaza'], ['hussain_shah_wali_dargah', 14, 'plaza'], ['moula_ali_dargah', 12, 'plaza'],
  ['church_st_josephs', 14, 'garden'], ['church_st_marys', 16, 'garden'], ['church_wesley', 12, 'garden'],
  ['church_1', 12, 'garden'], ['church_2', 8, 'garden'], ['st_johns_church_secunderabad', 12, 'garden'],
  ['st_georges_church_abids', 10, 'garden'], ['holy_trinity_church_bolarum', 14, 'garden'],
  ['gurudwara_gowliguda', 10, 'plaza'], ['ramakrishna_math', 14, 'garden'],
  ['purani_haveli', 12, 'garden'], ['king_kothi', 14, 'garden'], ['errum_manzil', 16, 'garden'],
  ['hill_fort_palace', 10, 'garden'], ['rashtrapati_nilayam', 18, 'garden'], ['falaknuma_palace', 16, 'garden'],
  ['chowmahalla_palace', 6, 'garden'], ['high_court', 8, 'garden'], ['salar_jung_museum', 6, 'garden'],
  ['osmania_hospital', 8, 'garden'], ['state_central_library', 8, 'garden'], ['nizam_college', 14, 'grass'],
  ['city_college', 10, 'grass'], ['secretariat', 12, 'garden'], ['kachiguda_station', 10, 'plaza'],
  ['nampally_station', 10, 'plaza'], ['secunderabad_station', 6, 'plaza'],
];
const COMPOUND_IDS = new Set(COMPOUNDS.map((c) => c[0] + '_compound'));
const lmDisp = (id) => { const l = LM.get(id), v = V1L.get(id); return l && v ? [l.x - v.x, l.y - v.y] : null; };
const plDisp = (id) => { const p = PL.get(id), v = V1P.get(id); return p && v ? [p.x - v.x, p.y - v.y] : null; };
const parkHow = {};
const WARP_PARKS = new Set(['nehru_zoo', 'osmania_campus', 'malakpet_race_course']); // big grounds without a real outline: v1 shape, warped to the real scale
for (const v of V1.parks) {
  if (COMPOUND_IDS.has(v.id)) continue; // regenerated below
  let poly = null, how = '';
  const c = parkClusterOf.get(v.id);
  if (v.id === 'charminar_plaza') { poly = sqPoly(CHC, 120); how = 'cluster'; }
  else if (c) { poly = v.poly.map((q) => tr(c, q)); how = 'cluster'; }
  else if (REALPARK.has(v.id)) { poly = REALPARK.get(v.id); how = 'osm'; }
  else if (HILL_PARK[v.id]) { poly = HILLS.get(HILL_PARK[v.id]).outline; how = 'dem'; }
  else if (v.id === 'begumpet_runway') { poly = G.ribbon(RUNWAY.line, RUNWAY.hw); how = 'runway'; }
  else if (/_platforms$/.test(v.id)) {
    const st = LM.get(v.id.replace('_platforms', '_station'));
    const rl = D.rails.filter((r) => r.id !== 'rail_sec_yard');
    let best = null, bp = null; for (const r of rl) { const q = G.nearestOnLine(r.pts, st.x, st.y); if (q && (!best || q.d < best.d)) { best = q; bp = r.pts; } }
    const cc = G.cum(bp), L = Math.max(st.w, st.d) + 60, a = Math.max(0, best.along - L / 2), b = Math.min(cc[cc.length - 1], best.along + L / 2);
    const piece = []; for (let d2 = a; d2 <= b; d2 += 12) { const pp = G.atDist(bp, d2, cc); piece.push([pp.x, pp.y]); }
    poly = G.ribbon(piece, 22); how = 'rail';
  } else if (WARP_PARKS.has(v.id)) {
    poly = v.poly.map((q) => mls(q[0], q[1])); how = 'mls';
  } else {
    // attach rigidly to the landmark it surrounds (most overlap), else to a place inside it, else warp
    const bb = G.bbox(v.poly); let best = null, ba = 0;
    const sg = /^school_(\d+)_ground$/.exec(v.id); if (sg && LM.has('school_' + sg[1])) { best = 'school_' + sg[1]; ba = Infinity; }
    for (const l of V1.landmarks) {
      const ox = Math.min(bb[2], l.x + l.w / 2) - Math.max(bb[0], l.x - l.w / 2), oy = Math.min(bb[3], l.y + l.d / 2) - Math.max(bb[1], l.y - l.d / 2);
      if (ox > 0 && oy > 0 && ox * oy > ba && LM.has(l.id)) { ba = ox * oy; best = l.id; }
    }
    let disp = best ? lmDisp(best) : null; how = best ? 'lm:' + best : '';
    if (!disp) { const pin = V1.places.find((q) => !q.alias && G.inPoly(q.x, q.y, v.poly) && PL.has(q.id)); if (pin) { disp = plDisp(pin.id); how = 'place:' + pin.id; } }
    if (disp) poly = v.poly.map((q) => [q[0] + disp[0], q[1] + disp[1]]);
    else { poly = v.poly.map((q) => mls(q[0], q[1])); how = 'mls'; }
  }
  parkHow[v.id] = how;
  const o = Object.assign({}, v, { poly: poly.map((q) => [RD(clampX(q[0])), RD(clampY(q[1]))]) });
  if (how === 'osm') o.conf = 'high'; else if (how === 'dem') o.conf = 'high'; else if (how === 'mls') o.conf = 'low';
  PK.set(v.id, o);
}
// compounds around places of worship and palaces (v1 rule, from the final footprints)
for (const [id, pad, kind, e0] of COMPOUNDS) {
  const l = LM.get(id); if (!l) continue;
  const e = e0 || [0, 0, 0, 0];
  const r = [l.x - l.w / 2 - pad - e[0], l.y - l.d / 2 - pad - e[1], l.w + pad * 2 + e[0] + e[2], l.d + pad * 2 + e[1] + e[3]].map(RD);
  PK.set(id + '_compound', { id: id + '_compound', name: l.name + ' compound', kind, poly: [[r[0], r[1]], [r[0] + r[2], r[1]], [r[0] + r[2], r[1] + r[3]], [r[0], r[1] + r[3]]] });
}
// Begumpet: a taxiway from the apron (moved with the terminal) north to the runway line
{
  const ap = PK.get('begumpet_apron');
  if (ap) {
    const c = G.centroid(ap.poly), q = G.nearestOnLine(RUNWAY.line, c[0], c[1]);
    if (q && q.d > 40) PK.set('begumpet_taxiway', { id: 'begumpet_taxiway', name: 'Begumpet taxiway', kind: 'plaza', poly: G.ribbon([[c[0], c[1]], [q.x, q.y]], 20).map(ptR), conf: 'low' });
  }
}
// the Musi riverbed (sand) and a few named hills as rock ground
if (MUSI_BED) PK.set('musi_bed', { id: 'musi_bed', name: 'Musi riverbed', kind: 'ground', surface: 'sand', poly: MUSI_BED.map((q) => [RD(clampX(q[0])), RD(clampY(q[1]))]), conf: 'high' });
for (const h of TERR.hills) if (HILL_EXTRA.has(h.id)) PK.set('hill_' + h.id, { id: 'hill_' + h.id, name: h.name, kind: 'rock', poly: HILLS.get(h.id).outline.map(ptR), conf: h.confidence });
// real green spaces the v1 map did not have
for (const [id, re] of [['jalagam_vengal_rao_park', /Jalagam Vengal Rao Park/], ['chacha_nehru_park', /^Chacha Nehru Park$/], ['ntr_stadium_ground', /^NTR Stadium$/]]) {
  const it = LU(re); if (it) PK.set(id, { id, name: it.n, kind: /Stadium/.test(it.n) ? 'ground' : 'garden', poly: projRing(it.outer, 1.5).map(ptR), conf: 'high' });
}
const ORDER_PARKS = ['musi_bed'];
D.parks = ORDER_PARKS.filter((id) => PK.has(id)).map((id) => PK.get(id)).concat([...PK.values()].filter((p) => !ORDER_PARKS.includes(p.id)));

/* ===================================================================== 13. respect zones (v1 rule) */
{
  const PKm = new Map(D.parks.map((p) => [p.id, p]));
  const bbr = (poly) => { const b = G.bbox(poly); return [b[0], b[1], b[2] - b[0], b[3] - b[1]]; };
  const RK = { temple: 'temple', mahankali_temple: 'temple', sai_temple: 'temple', birla_mandir: 'temple', khairatabad_ganesh: 'temple',
    mosque: 'mosque', spanish_mosque: 'mosque', mecca_masjid: 'mosque', dargah: 'dargah', church: 'church', gurudwara: 'gurudwara', ashurkhana: 'ashurkhana' };
  const FC = 30;
  const zone = (id, kind, l, o) => {
    o = o || {};
    const cp = PKm.get(id + '_compound');
    const core = o.rect || (cp ? bbr(cp.poly) : [l.x - l.w / 2 - 6, l.y - l.d / 2 - 6, l.w + 12, l.d + 12]);
    const rects = [core.map(RD)].concat((o.rects || []).map((r) => r.map(RD)));
    const p = PL.get(o.place || id);
    const face = o.face || l.face || null;
    const [x, y, w, h] = core;
    let fc = [], gate = p ? { x: p.x, y: p.y } : { x: l.x, y: l.y };
    if (o.forecourt !== false) {
      if (face === 'n') { fc = [[x - 10, y - FC, w + 20, FC]]; gate = { x: x + w / 2, y }; }
      else if (face === 's') { fc = [[x - 10, y + h, w + 20, FC]]; gate = { x: x + w / 2, y: y + h }; }
      else if (face === 'w') { fc = [[x - FC, y - 10, FC, h + 20]]; gate = { x, y: y + h / 2 }; }
      else if (face === 'e') { fc = [[x + w, y - 10, FC, h + 20]]; gate = { x: x + w, y: y + h / 2 }; }
      else fc = [[x - FC, y - FC, w + FC * 2, FC], [x - FC, y + h, w + FC * 2, FC], [x - FC, y, FC, h], [x + w, y, FC, h]];
    }
    D.respect.push({ id, name: o.name || l.name, kind, place: p ? (p.alias || p.id) : null, rects, polys: (o.polys || []).map((q) => q.map(ptR)), lines: (o.lines || []).map((ln) => ({ pts: ln.pts.map(ptR), r: ln.r })), forecourt: fc.map((r) => r.map(RD)), gate: { x: RD(gate.x), y: RD(gate.y) } });
  };
  for (const l of V1.landmarks) {
    const k = RK[l.draw]; const L = LM.get(l.id);
    if (!k || !L || l.id === 'mecca_masjid' || l.id === 'birla_mandir' || l.id === 'moula_ali_dargah') continue;
    zone(l.id, k, L);
  }
  const mm = LM.get('mecca_masjid'), cy = PKm.get('mecca_masjid_courtyard');
  zone('mecca_masjid', 'mosque', mm, { rects: cy ? [bbr(cy.poly)] : [], face: 'e', rect: [mm.x - mm.w / 2 - 4, mm.y - mm.d / 2 - 4, mm.w + 8 + (cy ? bbr(cy.poly)[2] : 0), mm.d + 8] });
  const bm = LM.get('birla_mandir'), steps = ROADS_OUT.get('birla_mandir_steps');
  zone('birla_mandir', 'temple', bm, { lines: steps ? [{ pts: steps.pts, r: steps.w / 2 + 4 }] : [] });
  const ma = LM.get('moula_ali_dargah'), hill = PKm.get('moula_ali_hill');
  zone('moula_ali_dargah', 'dargah', ma, { polys: hill ? [hill.poly] : [] });
  const ch = LM.get('charminar');
  zone('charminar', 'charminar', ch, { rect: [ch.x - ch.w / 2, ch.y - ch.d / 2, ch.w, ch.d], forecourt: false, name: 'Charminar (interior; the top-floor mosque)' });
  const qs = PKm.get('qutb_shahi_gardens');
  if (qs) { const b = bbr(qs.poly); zone('qutb_shahi_tombs', 'tomb', { x: b[0] + b[2] / 2, y: b[1] + b[3] / 2, w: b[2], d: b[3], name: 'Qutb Shahi Tombs', face: null }, { rect: b, forecourt: false }); }
  if (LM.get('paigah_tombs')) zone('paigah_tombs', 'tomb', LM.get('paigah_tombs'));
}

/* ===================================================================== 14. trees */
const TREE_OUT = [];
{
  const hand = [
    ...[[4556, 2618], [4626, 2614], [4600, 2618], [4784, 2626], [5120, 2585], [5842, 600], [6230, 4160], [6460, 3970], [5000, 4390], [1704, 2918], [2412, 740], [3040, 2652]].map(([x, y]) => [x, y, 'coconut', 9]),
    [3830, 2010, 'palm'], [3935, 2015, 'palm'], [3600, 1960, 'coconut'], [3740, 1995, 'coconut'], [3640, 2690, 'banyan', 20],
    [3790, 2712, 'banyan', 16], [3620, 2530, 'banyan', 18], [4500, 1900, 'banyan', 20], [4560, 2020, 'gulmohar'], [4950, 880, 'banyan', 16],
    [4585, 3360, 'banyan', 18], [4650, 3280, 'gulmohar'], [4662, 2700, 'neem', 12], [4620, 2712, 'neem', 11],
    [6300, 2160, 'banyan', 22], [6150, 1700, 'banyan', 20], [2880, 1812, 'palm'], [2950, 1812, 'palm'],
    [630, 500, 'coconut'], [720, 520, 'coconut'], [2560, 4800, 'banyan', 20], [2700, 4900, 'neem', 14],
  ];
  const colony = CLID.lakshmi_nagar_colony;
  for (const [x, y, k, r] of hand) {
    let nx, ny;
    if (x >= colony.trees[0][0] && x <= colony.trees[0][2] && y >= colony.trees[0][1] && y <= colony.trees[0][3]) { nx = x + colony.T[0]; ny = y + colony.T[1]; }
    else {
      let best = null, bd = 150 * 150;
      for (const l of V1.landmarks) { const d = (l.x - x) ** 2 + (l.y - y) ** 2; if (d < bd && LM.has(l.id)) { bd = d; best = lmDisp(l.id); } }
      for (const q of V1.places) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd && !q.alias && PL.has(q.id)) { bd = d; best = plDisp(q.id); } }
      if (best) { nx = x + best[0]; ny = y + best[1]; } else [nx, ny] = mls(x, y);
    }
    const v = OCC.get(nx, ny); if (v === 1 || v === 2 || v === 3 || v === 6 || v === 4) continue;
    TREE_OUT.push({ x: RD(nx), y: RD(ny), r: r || 9, kind: k });
  }
}
const AVENUES = [
  { road: 'necklace_rd', kind: 'coconut', every: 40, off: 5 },
  { road: 'tank_bund', kind: 'palm', every: 70, off: 6 },
  { road: 'ou_rd', kind: 'banyan', every: 80, off: 10 },
  { road: 'secretariat_rd', kind: 'palm', every: 70, off: 8 },
  { road: 'raj_bhavan_rd', kind: 'gulmohar', every: 70, off: 8 },
  { road: 'sp_rd', kind: 'gulmohar', every: 80, off: 8 },
  { road: 'jubilee_rd36', kind: 'palm', every: 80, off: 8 },
  { road: 'banjara_rd1', kind: 'gulmohar', every: 80, off: 8 },
  { road: 'lower_tank_bund', kind: 'neem', every: 90, off: 8 },
  { road: 'indira_park_rd', kind: 'gulmohar', every: 90, off: 8 },
  { road: 'sd_rd', kind: 'rain_tree', every: 90, off: 8 },
];

/* ===================================================================== 15. blocks, avenue trees, boulders (v1 expansion, polygon districts) */
{
  const GC = 8, GW = Math.ceil(W / GC), GH = Math.ceil(H / GC);
  const occ = new Uint8Array(GW * GH);
  let T = occ;
  const markThick = (pts, hw) => {
    for (let s2 = 0; s2 < pts.length - 1; s2++) {
      const a = pts[s2], b = pts[s2 + 1];
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - hw) / GC)), i1 = Math.min(GW - 1, Math.floor((Math.max(a[0], b[0]) + hw) / GC));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - hw) / GC)), j1 = Math.min(GH - 1, Math.floor((Math.max(a[1], b[1]) + hw) / GC));
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = (i + 0.5) * GC, py = (j + 0.5) * GC;
        let t = ((px - a[0]) * dx + (py - a[1]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = a[0] + dx * t - px, qy = a[1] + dy * t - py;
        if (qx * qx + qy * qy <= hw * hw) T[j * GW + i] = 1;
      }
    }
  };
  const markPoly = (poly, grow) => {
    let y0 = 1e9, y1 = -1e9; for (const p2 of poly) { y0 = Math.min(y0, p2[1]); y1 = Math.max(y1, p2[1]); }
    for (let j = Math.max(0, Math.floor((y0 - grow) / GC)); j <= Math.min(GH - 1, Math.floor((y1 + grow) / GC)); j++) {
      const y = (j + 0.5) * GC, xs = [];
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const ya = poly[a][1], yb = poly[b][1]; if ((ya > y) !== (yb > y)) xs.push(poly[a][0] + ((y - ya) / (yb - ya)) * (poly[b][0] - poly[a][0])); }
      xs.sort((p2, q) => p2 - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.floor((xs[k] - grow) / GC)); i <= Math.min(GW - 1, Math.floor((xs[k + 1] + grow) / GC)); i++) T[j * GW + i] = 1;
    }
    if (grow > 0) markThick(poly.concat([poly[0]]), grow);
  };
  const markRect2 = (x, y, w, h, m) => {
    for (let j = Math.max(0, Math.floor((y - m) / GC)); j <= Math.min(GH - 1, Math.floor((y + h + m - 0.01) / GC)); j++)
      for (let i = Math.max(0, Math.floor((x - m) / GC)); i <= Math.min(GW - 1, Math.floor((x + w + m - 0.01) / GC)); i++) T[j * GW + i] = 1;
  };
  const markCircle = (x, y, r) => markRect2(x - r, y - r, r * 2, r * 2, 0);
  for (const r of roadList()) markThick(r.pts, r.w / 2 + (FOOT[r.kind] || 0) + 2);
  for (const r of D.rails) markThick(r.pts, 16);
  for (const w of D.water) markPoly(w.poly, (w.bank || 0) + 4);
  for (const l of LM.values()) markRect2(l.x - l.w / 2, l.y - l.d / 2, l.w, l.d, l.pad == null ? 4 : l.pad);
  for (const r of D.roofs) if (!r.building) markRect2(r.rect[0], r.rect[1], r.rect[2], r.rect[3], 3);
  for (const p2 of PL.values()) if (['playground', 'park', 'home', 'terrace'].includes(p2.kind)) markCircle(p2.x, p2.y, 12);
  for (const t of TREE_OUT) markCircle(t.x, t.y, 5);
  const occR = occ.slice();
  T = occR;
  for (const l of LM.values()) markRect2(l.x - l.w / 2, l.y - l.d / 2, l.w, l.d, 4);
  for (const p2 of PL.values()) markCircle(p2.x, p2.y, 10);
  // avenue trees check the fine placement raster (OCC) for roads / water / rails, and these coarse ones
  // for places, footprints and other trees
  const occTree = new Uint8Array(GW * GH); T = occTree;
  for (const p2 of PL.values()) markCircle(p2.x, p2.y, 10);
  for (const t of TREE_OUT) markCircle(t.x, t.y, 8);
  const occRoadOnly = new Uint8Array(GW * GH); T = occRoadOnly;
  for (const r of roadList()) markThick(r.pts, r.w / 2 + (FOOT[r.kind] || 0) + 2);
  for (const r of D.rails) markThick(r.pts, 16);
  for (const w of D.water) markPoly(w.poly, (w.bank || 0) + 4);
  T = occR;
  const markBoth = (fn) => { T = occ; fn(); T = occR; fn(); };
  // avenue trees
  const avStats = {};
  for (const a of AVENUES) {
    const r = ROADS_OUT.get(a.road); if (!r) continue;
    r.trees = r.trees || a.kind;
    const off = r.w / 2 + (FOOT[r.kind] || 0) + (a.off || 8);
    for (const sd of [-1, 1]) {
      let acc = a.every * 0.5;
      for (let s2 = 0; s2 < r.pts.length - 1; s2++) {
        const p0 = r.pts[s2], p1 = r.pts[s2 + 1];
        const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, ux = (p1[0] - p0[0]) / L, uy = (p1[1] - p0[1]) / L;
        for (; acc < L; acc += a.every) {
          const x = p0[0] + ux * acc - uy * off * sd, y = p0[1] + uy * acc + ux * off * sd;
          const i = Math.floor(x / GC), j = Math.floor(y / GC);
          if (i < 1 || j < 1 || i >= GW - 1 || j >= GH - 1) continue;
          // a free cell of the placement raster (no road / footpath / water / rail / footprint), clear of places and trees
          let bad = 0;
          for (const [ox, oy] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) { const v = OCC.get(x + ox, y + oy); if (v !== 0 && v !== 7) { bad = v; break; } }
          const why = bad ? 'occ' + bad : occTree[j * GW + i] ? 'tree/place' : occR[j * GW + i] && !occRoadOnly[j * GW + i] ? 'footprint' : '';
          if (why) { avStats[a.road + ':' + why] = (avStats[a.road + ':' + why] || 0) + 1; continue; }
          TREE_OUT.push({ x: RD(x), y: RD(y), r: a.kind === 'banyan' ? 16 : a.kind === 'palm' || a.kind === 'coconut' ? 9 : 11, kind: a.kind === 'rain_tree' ? 'banyan' : a.kind });
          markBoth(() => markCircle(x, y, 6)); T = occTree; markCircle(x, y, a.every * 0.4); T = occR;
        }
        acc -= L;
      }
    }
  }
  vlog('avenue rejects', JSON.stringify(avStats));
  markBoth(() => {
    for (const p2 of D.parks) if (p2.kind !== 'rock') markPoly(p2.poly, 2);
    for (const n of D.noFill) markRect2(n.rect[0], n.rect[1], n.rect[2], n.rect[3], 0);
    const hm = PL.get('home'); markCircle(hm.x, hm.y, 24);
  });
  // boulder fields: the real rocky ground (DEM rock fields, granite hills); density by field
  const FIELD_DENS = { banjara_jubilee_rocks: 1 / 9000, hitec_rocks: 1 / 12000, golconda_tombs_rocks: 1 / 9000, falaknuma_rocks: 1 / 7000, moula_ali_rocks: 1 / 7000, naubat_pahad_rock: 1 / 3500, ou_rocks_field: 1 / 14000 };
  const fields = [];
  for (const rf of ROCKFIELDS) for (const poly of rf.polys) fields.push({ poly, dens: FIELD_DENS[rf.id] || 1 / 10000, seed: G.strHash(rf.id) % 1000 });
  for (const id of ['jalal_pahad', 'fakhruddin_gutta', 'kbr_hill', 'jubilee_hills_summit', 'film_nagar_hill', 'banjara_hills_summit', 'asman_garh', 'malkajgiri_hill']) if (HILLS.has(id)) fields.push({ poly: HILLS.get(id).outline, dens: 1 / 5000, seed: G.strHash(id) % 1000 });
  let rocks = 0;
  for (const f of fields) {
    const bb = G.bbox(f.poly), area = Math.abs(G.polyArea(f.poly)), n = Math.min(260, Math.round(area * f.dens));
    let placed = 0;
    for (let k = 0; k < n * 5 && placed < n; k++) {
      const cx = bb[0] + G.hash(k, f.seed, 11) * (bb[2] - bb[0]), cy = bb[1] + G.hash(k, f.seed, 23) * (bb[3] - bb[1]);
      if (!G.inPoly(cx, cy, f.poly)) continue;
      const r = Math.round(6 + G.hash(k, f.seed, 37) * 15);
      const i0 = Math.floor((cx - r - 6) / GC), i1 = Math.floor((cx + r + 6) / GC), j0 = Math.floor((cy - r - 6) / GC), j1 = Math.floor((cy + r + 6) / GC);
      let free = i0 >= 0 && j0 >= 0 && i1 < GW && j1 < GH;
      for (let j = j0; free && j <= j1; j++) for (let i = i0; i <= i1; i++) if (occR[j * GW + i]) { free = false; break; }
      if (!free) continue;
      D.rocks.push({ x: RD(cx), y: RD(cy), r, h: Math.round(r * 1.1) }); rocks++;
      markBoth(() => markCircle(cx, cy, r + 4)); placed++;
      if (G.hash(k, f.seed, 41) < 0.45) {
        const a = G.hash(k, f.seed, 43) * 6.283, rr = Math.max(5, Math.round(r * 0.6));
        const bx = cx + Math.cos(a) * (r + rr - 2), by = cy + Math.sin(a) * (r + rr - 2);
        const bi = Math.floor(bx / GC), bj = Math.floor(by / GC);
        if (bi > 0 && bj > 0 && bi < GW && bj < GH && !occR[bj * GW + bi]) { D.rocks.push({ x: RD(bx), y: RD(by), r: rr, h: Math.round(rr * 1.1) }); markBoth(() => markCircle(bx, by, rr + 3)); }
      }
    }
  }
  // v1's hand-placed rocks (OU campus, Indira Park rock garden) move with their landmark / park
  const ouD = lmDisp('osmania_university'), ipP = PK.get('indira_park');
  for (const [x, y, r] of [[6000, 1560, 14], [6080, 1640, 10], [6480, 1560, 16], [6510, 2150, 12], [6050, 2260, 14], [6400, 2280, 9], [5980, 2050, 11]]) {
    const [nx, ny] = mls(x, y); const i = Math.floor(nx / GC), j = Math.floor(ny / GC); if (occR[j * GW + i]) continue; D.rocks.push({ x: RD(nx), y: RD(ny), r, h: Math.round(r * 1.1) }); markBoth(() => markCircle(nx, ny, r + 4));
  }
  if (ipP) { const c = G.centroid(ipP.poly); for (const [dx, dy, r] of [[40, -60, 12], [20, -20, 8], [60, 40, 9]]) { const nx = c[0] + dx, ny = c[1] + dy, i = Math.floor(nx / GC), j = Math.floor(ny / GC); if (occR[j * GW + i]) continue; D.rocks.push({ x: RD(nx), y: RD(ny), r, h: Math.round(r * 1.1) }); markBoth(() => markCircle(nx, ny, r + 4)); } }
  T = occ;
  for (const p2 of D.parks) if (p2.kind === 'rock') markPoly(p2.poly, 2);
  vlog('rocks', D.rocks.length);

  // building blocks: greedy square-ish rectangles of free land on a 16 u raster, one district each
  const C2 = 16, W2 = Math.ceil(GW / 2), H2 = Math.ceil(GH / 2);
  const occ2 = new Uint8Array(W2 * H2), near = new Uint8Array(W2 * H2);
  for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) {
    const o = (j * 2) * GW + i * 2;
    occ2[j * W2 + i] = occ[o] | (i * 2 + 1 < GW ? occ[o + 1] : 1) | (j * 2 + 1 < GH ? occ[o + GW] : 1) | (i * 2 + 1 < GW && j * 2 + 1 < GH ? occ[o + GW + 1] : 1);
  }
  // only within reach of a street (dense districts reach further)
  const REACH = { oldcity: 200, market: 200, colonial: 200, colony: 180, cantonment: 170, posh: 170, rocky: 120, hitec: 120 };
  const distIdx = new Int16Array(W2 * H2);
  for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) distIdx[j * W2 + i] = DR.get(Math.min(W - 1, i * C2 + 8), Math.min(H - 1, j * C2 + 8)) - 1;
  for (const r of roadList()) {
    if (r.kind === 'path') continue;
    for (let k = 0; k < r.pts.length - 1; k++) {
      const a = r.pts[k], b = r.pts[k + 1];
      const d0 = districtAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), RCH = d0 ? REACH[d0.style] || 160 : 160;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - RCH) / C2)), i1 = Math.min(W2 - 1, Math.floor((Math.max(a[0], b[0]) + RCH) / C2));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - RCH) / C2)), j1 = Math.min(H2 - 1, Math.floor((Math.max(a[1], b[1]) + RCH) / C2));
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const o = j * W2 + i; if (near[o]) continue;
        const px = (i + 0.5) * C2, py = (j + 0.5) * C2;
        let t = ((px - a[0]) * dx + (py - a[1]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = a[0] + dx * t - px, qy = a[1] + dy * t - py;
        if (qx * qx + qy * qy <= RCH * RCH) near[o] = 1;
      }
    }
  }
  for (let o = 0; o < W2 * H2; o++) if (!near[o]) occ2[o] = 1;
  // forecourts: heritage sites whose 3D models need to be seen from their street keep a clear margin of
  // `pad` u all round and `front` u on their facade side (no filler blocks there)
  const FORECOURT = { mecca_masjid: [20, 60], chowmahalla_palace: [24, 56], falaknuma_palace: [32, 64], purani_haveli: [20, 56], pathergatti_arcade_w: [14, 40] };
  for (const [id, [pad, front]] of Object.entries(FORECOURT)) {
    const l = LM.get(id); if (!l) continue;
    const f = FACE[l.face] || [0, 0];
    const x0 = l.x - l.w / 2 - pad - (f[0] < 0 ? front : 0), x1 = l.x + l.w / 2 + pad + (f[0] > 0 ? front : 0);
    const y0 = l.y - l.d / 2 - pad - (f[1] < 0 ? front : 0), y1 = l.y + l.d / 2 + pad + (f[1] > 0 ? front : 0);
    for (let j = Math.max(0, Math.floor(y0 / C2)); j <= Math.min(H2 - 1, Math.floor(y1 / C2)); j++) for (let i = Math.max(0, Math.floor(x0 / C2)); i <= Math.min(W2 - 1, Math.floor(x1 / C2)); i++) occ2[j * W2 + i] = 1;
  }
  const used = new Uint8Array(W2 * H2);
  const tilesOf = new Map(); // district index -> its cells' bbox
  for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) { const k = distIdx[j * W2 + i]; if (k < 0) continue; const b = tilesOf.get(k) || [1e9, 1e9, -1, -1]; b[0] = Math.min(b[0], i); b[1] = Math.min(b[1], j); b[2] = Math.max(b[2], i); b[3] = Math.max(b[3], j); tilesOf.set(k, b); }
  for (let pass = 0; pass < 2; pass++) for (const [k, bb] of tilesOf) {
    const d = D.districts[k]; if (!d.fill) continue;
    const maxC = Math.max(2, Math.round((d.lot[1] * 1.5) / C2)), minC = Math.max(2, Math.ceil(d.lot[0] / C2));
    const free = (q) => !occ2[q] && !used[q] && distIdx[q] === k;
    const [ia, ja, ib, jb] = bb;
    for (let tj = Math.floor(ja / maxC) * maxC; tj <= jb; tj += maxC) for (let ti = Math.floor(ia / maxC) * maxC; ti <= ib; ti += maxC) {
      const ta = Math.max(ti, ia), tb = pass ? Math.min(ib + 1, W2) : Math.min(ti + maxC, ib + 1), tc = Math.max(tj, ja), td = pass ? Math.min(jb + 1, H2) : Math.min(tj + maxC, jb + 1);
      for (let j = tc; j < td; j++) for (let i = ta; i < tb; i++) {
        const o = j * W2 + i; if (!free(o)) continue;
        let fits = i + minC <= tb && j + minC <= td;
        for (let jj = j; fits && jj < j + minC; jj++) for (let ii = i; ii < i + minC; ii++) if (!free(jj * W2 + ii)) { fits = false; break; }
        if (!fits) continue;
        let w = minC, h = minC;
        const lim = pass ? maxC : Infinity;
        for (;;) {
          let cw = i + w < tb && w < lim, ch = j + h < td && h < lim;
          for (let q = 0; cw && q < h; q++) if (!free((j + q) * W2 + i + w)) cw = false;
          for (let q = 0; ch && q < w; q++) if (!free((j + h) * W2 + i + q)) ch = false;
          if (!cw && !ch) break;
          if (cw && (!ch || w <= h)) w++; else h++;
        }
        for (let jj = j; jj < j + h; jj++) for (let q = 0; q < w; q++) used[jj * W2 + i + q] = 1;
        if (G.hash(i, j, 7 + pass * 2) > d.fill) continue;
        D.blocks.push({ rect: [i * C2, j * C2, w * C2, h * C2], style: d.style, seed: (i * 7349 + j * 131 + pass * 7) % 100000, pass });
      }
    }
  }
  vlog('blocks', D.blocks.length, 'trees', TREE_OUT.length);
}
D.trees = TREE_OUT;

/* ===================================================================== 16. assemble */
{
  const home = PL.get('home');
  D.spawns = { player: [home.x, home.y], home: [home.x, home.y], title: [RD(CHC[0]), RD(CHC[1] - 60)] };
  D.noFill.push({ rect: (() => { const b = G.bbox(G.ribbon(RUNWAY.line, 90)); return [RD(b[0]), RD(b[1]), RD(b[2] - b[0]), RD(b[3] - b[1])]; })(), why: 'Begumpet airfield' });
  // output order: v1 order for places / landmarks (stable diffs), new things after
  const lmOrder = V1.landmarks.map((l) => l.id).filter((id) => LM.has(id)).concat([...LM.keys()].filter((id) => !V1L.has(id)));
  D.landmarks = lmOrder.map((id) => { const l = LM.get(id); delete l._spot; delete l._road; delete l._rot; return l; });
  D.places = V1.places.map((p) => PL.get(p.id));
  for (const p of D.places) delete p.how;
  // roads: the network (curated, then cluster, then infill) with integer points
  D.roads = roadList().map((r) => {
    const o = { id: r.id, name: r.name, kind: r.kind, w: r.w, pts: r.pts.map(ptR) };
    for (const k of ['median', 'spur', 'trees', 'oneway', 'pothole', 'conf', 'src', 'realName']) if (r[k] != null) o[k] = r[k];
    return o;
  });
  // clusters: rigid translations (for modules that kept v1 coordinates near a cluster)
  for (const c of CLUSTERS) D.clusters[c.id] = { dx: c.T[0], dy: c.T[1], v1Anchor: c.v1Anchor, anchor: [RD(c.v1Anchor[0] + c.T[0]), RD(c.v1Anchor[1] + c.T[1])], moved: c.moved || 0, conf: c.conf };
  D.geo = {
    preset: GEO.PRESET, frame: { lonW: +GEO.FRAME.lonW.toFixed(5), lonE: +GEO.FRAME.lonE.toFixed(5), latS: +GEO.FRAME.latS.toFixed(5), latN: +GEO.FRAME.latN.toFixed(5) },
    baseUnitsPerMetre: GEO.BASE_UPM, projection: 'tools/geo/project.cjs (equirectangular about 17.3935 N 78.448 E + smooth monotonic warp)',
    credits: 'Map reference: DataMeet Municipal Spatial Data (CC BY 4.0) and © OpenStreetMap contributors (ODbL)',
    attribution: ['Map reference: DataMeet Municipal Spatial Data (CC BY 4.0) and © OpenStreetMap contributors (ODbL)', 'Roads, water, parks: © OpenStreetMap contributors (ODbL), via Overture Maps Foundation and the Geofabrik-schema Hyderabad extract', 'Railway stations: datameet/railways (CC0)', 'Elevation: Terrain Tiles on AWS Open Data (SRTM, public domain)'],
  };
}
/* ===================================================================== 17. emit */
function emit() {
  const J = (v) => JSON.stringify(v);
  const arr = (list, fmt) => '[\n' + list.map((x) => '    ' + (fmt ? fmt(x) : J(x))).join(',\n') + '\n  ]';
  const counts = { districts: D.districts.length, water: D.water.length, roads: D.roads.length, rails: D.rails.length, parks: D.parks.length, landmarks: D.landmarks.length, places: D.places.length, blocks: D.blocks.length, rocks: D.rocks.length, trees: D.trees.length, roofs: D.roofs.length, respect: D.respect.length };
  const roadsBySrc = {}; for (const r of D.roads) roadsBySrc[r.src || 'roads'] = (roadsBySrc[r.src || 'roads'] || 0) + 1;
  // MLS control points for fromV1 (v1 x, y -> v2 x, y), compact
  const cp = MLS_CP.map((c) => c.map(RD));
  const head = `/* NOSTALGIA — worlddata.js   (GENERATED: do not edit by hand; edit tools/geo/build_worlddata.cjs and run it)
 * MAP_PLAN_FINAL — Map v2: the real Hyderabad + Secunderabad as N.WORLD_DATA (amendment A1).
 * Owner: map builder. Generated ${new Date().toISOString().slice(0, 10)} by tools/geo/build_worlddata.cjs from design/geo/*.json,
 * tools/geo/project.cjs and design/geo/worlddata_v1.js (the hand-made v1 map: every id, kind, name, sign, draw id,
 * variant, roof, plank, respect zone, podium, hide spot, bus stop and landmark size comes from there).
 *
 * World: ${W} x ${H} u (sets N.WORLD_W / N.WORLD_H below; core.js keeps 8000 x 6000 only as a default).
 * Frame: lon ${GEO.FRAME.lonW.toFixed(5)}-${GEO.FRAME.lonE.toFixed(5)} E, lat ${GEO.FRAME.latS.toFixed(5)}-${GEO.FRAME.latN.toFixed(5)} N (24 x 18 km), 1.6 m per u
 * at the base scale; a smooth monotonic warp gives the dense cores more room (Charminar ~1.15 u/m, Abids ~1.0,
 * Tank Bund / Secunderabad ~0.77, outskirts ~0.6). North is up, +y is south; compass bearings are kept (<= 14 deg).
 *
 * ${MAP_CREDITS}
 * Roads, water, rail, parks: (c) OpenStreetMap contributors (ODbL 1.0) via Overture Maps Foundation and the Hyderabad
 * district OSM extract (Geofabrik free-layer schema); stations: datameet/railways (CC0); hills: AWS Terrain Tiles (SRTM,
 * public domain). Every place / landmark carries conf ('high' | 'medium' | 'low') and ll ([lat, lon] used); the
 * sources are in design/geo/places.json. Places in the fictional colony keep game-unit layouts (clusters below).
 *
 * Format: ARCHITECTURE.md §7 plus (v2):
 *  - districts[]: {id, name, nameTe, rect (bounding box, for old consumers), poly [[x,y]...] (main ring, world units),
 *    polys? (every ring when a district has several parts), holes? (rings that belong to other districts),
 *    ground, style, fill, lot, wards (GHMC wards), conf}. The districts tile the world; rect consumers that let
 *    "later win" get the smallest last. districtGrid {cell 32, w, h, rle [index, run, ...]} is the exact
 *    gap-free lookup (index into districts[], row-major).
 *  - roads[]: + pothole (0 smooth .. 1 cratered; amendment A2 hint by road kind / district), conf, src ('roads' =
 *    curated real alignment, 'cluster' = a game layout, 'osm' / 'grid' = residential infill), realName.
 *  - water[]: lakes / tanks keyholed around islands; the Musi is a 2003 dry-season channel ('river') inside the
 *    sandy riverbed park 'musi_bed'; nalas are narrow channels ('nala'); color / bank as in v1.
 *  - landmarks[]: + conf, ll, v1 ([x, y] in the v1 map: modules with hard-coded v1 offsets near a landmark use
 *    l.x + (oldX - l.v1[0])), cluster (id of the rigid layout it belongs to), street (the road a shop fronts).
 *  - places[]: + conf, ll. clusters{id: {dx, dy, v1Anchor, anchor}}: rigid layouts moved by (dx, dy) whole cells.
 *  - terrain.hills[]: {id, name, peak, relM (height above the surrounding ground, m), outline} for the 3D view.
 *  - fromV1(x, y) -> [x, y]: converts a v1 coordinate (exact inside a cluster, else a local fit through ${cp.length}
 *    known places). For module constants that were written against the 8000 x 6000 map.
 *
 * Counts: ${J(counts)}
 * Roads by source: ${J(roadsBySrc)}
 */
// MAP_PLAN_FINAL
(() => {
  'use strict';
  const N = (window.N = window.N || {});
  N.WORLD_W = ${W};
  N.WORLD_H = ${H};
  const D = {
    version: 2,
    size: [${W}, ${H}],
    geo: ${J(D.geo)},
`;
  const parts = [];
  parts.push(`    districts: ${arr(D.districts)},`);
  parts.push(`    districtGrid: ${J(D.districtGrid)},`);
  parts.push(`    water: ${arr(D.water)},`);
  parts.push(`    roads: ${arr(D.roads.filter((r) => r.src !== 'osm' && r.src !== 'grid'))},`);
  parts.push(`    rails: ${arr(D.rails)},`);
  parts.push(`    parks: ${arr(D.parks)},`);
  parts.push(`    landmarks: ${arr(D.landmarks)},`);
  parts.push(`    places: ${arr(D.places)},`);
  parts.push(`    roofs: ${arr(D.roofs)},`);
  parts.push(`    planks: ${arr(D.planks)},`);
  parts.push(`    respect: ${arr(D.respect)},`);
  parts.push(`    buildings: [],`);
  parts.push(`    noFill: ${J(D.noFill)},`);
  parts.push(`    spawns: ${J(D.spawns)},`);
  parts.push(`    clusters: ${J(D.clusters)},`);
  parts.push(`    terrain: ${J(D.terrain)},`);
  const STY = [...new Set(D.blocks.map((b) => b.style))];
  // infill streets (OSM residential lanes): [id, name index, kind index, w, pothole x100, x0, y0, dx1, dy1, ...]
  const inf = D.roads.filter((r) => r.src === 'osm' || r.src === 'grid');
  const RN = [...new Set(inf.map((r) => r.name))], RK = ['lane', 'street', 'arterial', 'path'];
  const enc = (r) => { const f = [r.id, RN.indexOf(r.name), RK.indexOf(r.kind) + (r.src === 'grid' ? 10 : 0), r.w, Math.round((r.pothole || 0) * 100)]; let px = 0, py = 0; r.pts.forEach((q, k) => { f.push(k ? q[0] - px : q[0], k ? q[1] - py : q[1]); px = q[0]; py = q[1]; }); return J(f); };
  const tail = `  };
  // infill streets (residential lanes from OpenStreetMap, ODbL), packed: [id, name, kind, w, pothole%, x0, y0, dx, dy, ...]
  const RN = ${J(RN)}, RK = ${J(RK)};
  const RI = [
${inf.map((r) => '    ' + enc(r)).join(',\n')}
  ];
  for (const f of RI) {
    const pts = []; let x = 0, y = 0;
    for (let k = 5; k < f.length; k += 2) { x = k === 5 ? f[k] : x + f[k]; y = k === 5 ? f[k + 1] : y + f[k + 1]; pts.push([x, y]); }
    D.roads.push({ id: f[0], name: RN[f[1]], kind: RK[f[2] % 10], w: f[3], pts, pothole: f[4] / 100, conf: 'high', src: f[2] >= 10 ? 'grid' : 'osm' });
  }
  // compact lists: blocks [x/16, y/16, w/16, h/16, style index, pass], rocks [x, y, r, h], trees [x, y, r, kind index]
  const STY = ${J(STY)};
  const BLK = ${J(D.blocks.flatMap((b) => [b.rect[0] / 16, b.rect[1] / 16, b.rect[2] / 16, b.rect[3] / 16, STY.indexOf(b.style), b.pass || 0]))};
  D.blocks = [];
  for (let k = 0; k < BLK.length; k += 6) D.blocks.push({ rect: [BLK[k] * 16, BLK[k + 1] * 16, BLK[k + 2] * 16, BLK[k + 3] * 16], style: STY[BLK[k + 4]], seed: (BLK[k] * 7349 + BLK[k + 1] * 131 + BLK[k + 5] * 7) % 100000 });
  D.rocks = ${J(D.rocks.map((r) => [r.x, r.y, r.r, r.h]))}.map((r) => ({ x: r[0], y: r[1], r: r[2], h: r[3] }));
  const TK = ${J([...new Set(D.trees.map((t) => t.kind))])};
  D.trees = ${J(D.trees.map((t) => [t.x, t.y, t.r, [...new Set(D.trees.map((q) => q.kind))].indexOf(t.kind)]))}.map((t) => ({ x: t[0], y: t[1], r: t[2], kind: TK[t[3]] }));
  // v1 (8000 x 6000) coordinates -> this map: exact inside a rigid cluster, else moving-least-squares (affine)
  const CP = ${J(cp)};
  const CLB = ${J(CLUSTERS.map((c) => { const pts = []; for (const id of c.lms) { const l = V1L.get(id); if (l) pts.push([l.x - l.w / 2, l.y - l.d / 2], [l.x + l.w / 2, l.y + l.d / 2]); } for (const id of c.places) { const q = V1P.get(id); if (q) pts.push([q.x, q.y]); } for (const id of c.roofs) { const r = V1RF.get(id); pts.push([r.rect[0], r.rect[1]], [r.rect[0] + r.rect[2], r.rect[1] + r.rect[3]]); } const b = G.bbox(pts); return [RD(b[0] - 20), RD(b[1] - 20), RD(b[2] + 20), RD(b[3] + 20), c.T[0], c.T[1]]; }))};
  D.fromV1 = function (x, y) {
    for (const b of CLB) if (x >= b[0] && y >= b[1] && x <= b[2] && y <= b[3]) return [x + b[4], y + b[5]];
    let sw = 0, px = 0, py = 0, qx = 0, qy = 0; const ws = new Array(CP.length);
    for (let i = 0; i < CP.length; i++) { const c = CP[i], w = 1 / ((c[0] - x) * (c[0] - x) + (c[1] - y) * (c[1] - y) + 400); ws[i] = w; sw += w; px += w * c[0]; py += w * c[1]; qx += w * c[2]; qy += w * c[3]; }
    px /= sw; py /= sw; qx /= sw; qy /= sw;
    let a = 0, b = 0, d = 0, m00 = 0, m01 = 0, m10 = 0, m11 = 0;
    for (let i = 0; i < CP.length; i++) { const c = CP[i], w = ws[i], hx = c[0] - px, hy = c[1] - py, gx = c[2] - qx, gy = c[3] - qy; a += w * hx * hx; b += w * hx * hy; d += w * hy * hy; m00 += w * hx * gx; m01 += w * hx * gy; m10 += w * hy * gx; m11 += w * hy * gy; }
    const det = a * d - b * b || 1e-9, i00 = d / det, i01 = -b / det, i11 = a / det;
    const M00 = i00 * m00 + i01 * m10, M01 = i00 * m01 + i01 * m11, M10 = i01 * m00 + i11 * m10, M11 = i01 * m01 + i11 * m11;
    const vx = x - px, vy = y - py;
    return [Math.round(vx * M00 + vy * M10 + qx), Math.round(vx * M01 + vy * M11 + qy)];
  };
  D.meta = { generator: 'tools/geo/build_worlddata.cjs', blocks: D.blocks.length, rocks: D.rocks.length, trees: D.trees.length, roads: D.roads.length };
  N.WORLD_DATA = D;
})();
`;
  return head + parts.join('\n') + '\n' + tail;
}
const MAP_CREDITS = 'Map reference: DataMeet Municipal Spatial Data (CC BY 4.0) and © OpenStreetMap contributors (ODbL).';
const text = emit();
function writeAtomic(file, txt) { const tmp = file + '.tmp-' + process.pid; fs.writeFileSync(tmp, txt); fs.renameSync(tmp, file); }
if (require.main === module) {
  const live = path.join(ROOT, 'src/worlddata.js');
  if (OUT_FILE) { writeAtomic(path.resolve(OUT_FILE), text); log('wrote', OUT_FILE, (text.length / 1024).toFixed(0) + ' KB'); }
  else {
    const next = path.join(ROOT, 'src/.worlddata.next.js');
    writeAtomic(next, text);
    log('built', path.relative(ROOT, next), (text.length / 1024).toFixed(0) + ' KB in', ((Date.now() - T0) / 1000).toFixed(1) + ' s');
    const VM = require(path.join(ROOT, 'tools/validate_map.cjs'));
    const Dn = VM.loadWorldData(next);
    const res = VM.validate(Dn);
    for (const w of res.warns) log('WARN ', w);
    for (const e of res.errors) log('ERROR', e);
    let regOk = true;
    try { const CR2 = require(path.join(ROOT, 'tools/check_registry.cjs')); const r = CR2.check(Dn); for (const e of r.errors) log('REGISTRY', e); regOk = !r.errors.length; } catch (e) { log('registry check failed to run:', e.message); regOk = false; }
    if (res.errors.length || !regOk) { log(`NOT swapped: ${res.errors.length} map errors${regOk ? '' : ', registry errors'} (the live src/worlddata.js is unchanged; candidate kept in src/.worlddata.next.js)`); process.exitCode = 1; }
    else if (argv.includes('--no-swap')) log('valid; --no-swap: live map unchanged');
    else { fs.renameSync(next, live); log('swapped into src/worlddata.js (atomic rename)'); }
  }
  log(`${warnings.length} builder warnings${VERBOSE ? '' : ' (--verbose lists them)'}`);
}
module.exports = { D, text, warnings };
