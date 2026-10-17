#!/usr/bin/env node
/* NOSTALGIA — tools/geo/check_projection.cjs
 * Measures the lat/lon -> world projection (tools/geo/project.cjs) against the A1 requirements:
 *   1. bijection: every cell of a 40 u base grid keeps a positive orientation (no fold-overs),
 *      plus the local Jacobian field (scale m, anisotropy, rotation, worst bearing change)
 *   2. scale per area (named neighbourhoods and the dense cores)
 *   3. compass bearings between neighbouring places (6 nearest within 1.5 km)
 *   4. order of places along every road (roads.json + the Himayatnagar grid)
 *   5. landmark footprints (worlddata w x d) overlapping each other at their projected centres
 *   6. "room": stretches of projected roads (game widths) that run into a parallel road
 * Writes design/geo/projection_report.md (with --report) and returns the numbers.
 * Usage: node tools/geo/check_projection.cjs [--report] [--quiet]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const GEO = path.join(ROOT, 'design/geo');
const G = require('./project.cjs');

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const RAD = Math.PI / 180;
const ROAD_W = { arterial: 52, street: 36, lane: 22, bridge: 40, path: 12, bund: 60 };

function loadInputs() {
  const { loadWorldData } = require(path.join(ROOT, 'tools/validate_map.cjs'));
  const placesFile = readJSON(path.join(GEO, 'places.json'));
  const roads = readJSON(path.join(GEO, 'roads.json'));
  return {
    D: loadWorldData(),
    places: placesFile.places,
    roads: roads.roads,
    grid: roads.himayatnagar_grid.lanes,
    water: readJSON(path.join(GEO, 'water.json')),
    rail: readJSON(path.join(GEO, 'rail.json')),
    districts: readJSON(path.join(GEO, 'districts.json')).districts,
    terrain: readJSON(path.join(GEO, 'terrain.json')),
    wards: readJSON('/home/user/datameet/municipal_spatial_data/Hyderabad/ghmc-wards.geojson'),
  };
}

// ------------------------------------------------------------------ 1. grid / Jacobian field
function gridCheck(P, step) {
  step = step || 40;
  const W = P.WORLD_W, H = P.WORLD_H, nx = Math.round(W / step), ny = Math.round(H / step);
  const X = new Float64Array((nx + 1) * (ny + 1)), Y = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const w = P.warp(i * step, j * step); X[j * (nx + 1) + i] = w[0]; Y[j * (nx + 1) + i] = w[1];
  }
  let neg = 0, minDet = Infinity, minAniso = Infinity, maxBrg = 0, maxRot = 0, mMin = Infinity, mMax = 0;
  const field = []; // per cell: m, aniso, rot, brg
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * (nx + 1) + i, k10 = k + 1, k01 = k + nx + 1, k11 = k01 + 1;
    const tri = (a, b, c) => (X[b] - X[a]) * (Y[c] - Y[a]) - (Y[b] - Y[a]) * (X[c] - X[a]);
    const t1 = tri(k, k10, k11), t2 = tri(k, k11, k01);
    if (!(t1 > 0) || !(t2 > 0)) neg++;
    const J = [[((X[k10] - X[k]) + (X[k11] - X[k01])) / (2 * step), ((X[k01] - X[k]) + (X[k11] - X[k10])) / (2 * step)],
      [((Y[k10] - Y[k]) + (Y[k11] - Y[k01])) / (2 * step), ((Y[k01] - Y[k]) + (Y[k11] - Y[k10])) / (2 * step)]];
    const r = P.analyse(J);
    field.push(r);
    if (r.det < minDet) minDet = r.det;
    if (r.aniso < minAniso) minAniso = r.aniso;
    if (r.bearingMaxErr > maxBrg) maxBrg = r.bearingMaxErr;
    if (Math.abs(r.rot) > maxRot) maxRot = Math.abs(r.rot);
    if (r.m < mMin) mMin = r.m; if (r.m > mMax) mMax = r.m;
  }
  return { step, nx, ny, cells: nx * ny * 2, negTriangles: neg, minDet, minAniso, maxBearing: maxBrg, maxRot, mMin, mMax, field, X, Y };
}

// ------------------------------------------------------------------ helpers
function realXY(lat, lon) { // metres east / north of the frame centre (for real distances / bearings)
  return [(lon - G.PARAMS.centre.lon) * G.FRAME.mPerDegLon, (lat - G.PARAMS.centre.lat) * G.FRAME.mPerDegLat];
}
function wrapDeg(a) { while (a > 180) a -= 360; while (a < -180) a += 360; return a; }
function pct(arr, q) { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; }
function projPlaces(P, places) {
  const out = {};
  for (const id in places) {
    const e = places[id];
    out[id] = { id, e, w: P.placeWorld(e), r: realXY(e.lat, e.lon) };
  }
  return out;
}

// ------------------------------------------------------------------ 3. bearings between neighbours
function bearingCheck(P, PP, opt) {
  opt = opt || {};
  const K = opt.k || 6, MAXD = opt.maxD || 1500, MIND = opt.minD || 20;
  const list = Object.values(PP).filter((p) => !p.e.alias); // aliases duplicate their target
  const pairs = new Map();
  for (const a of list) {
    const near = [];
    for (const b of list) {
      if (a === b) continue;
      const d = Math.hypot(a.r[0] - b.r[0], a.r[1] - b.r[1]);
      if (d >= MIND && d <= MAXD) near.push([d, b]);
    }
    near.sort((x, y) => x[0] - y[0]);
    for (const [d, b] of near.slice(0, K)) {
      const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
      if (pairs.has(key)) continue;
      // a fictional layout (anchor + game-unit offsets) next to a real point is a layout question, not a
      // warp question; points outside the frame are signposts at the edge
      const kind = (!!a.e.anchor_latlon !== !!b.e.anchor_latlon) ? 'layout' : (!P.inFrame(a.e.lat, a.e.lon) || !P.inFrame(b.e.lat, b.e.lon)) ? 'offmap' : 'warp';
      const br = Math.atan2(b.r[0] - a.r[0], b.r[1] - a.r[1]) / RAD; // compass bearing (0 = N, 90 = E)
      const bw = Math.atan2(b.w[0] - a.w[0], -(b.w[1] - a.w[1])) / RAD;
      const both = !!(a.e.anchor_latlon && b.e.anchor_latlon && a.e.anchor === b.e.anchor);
      pairs.set(key, { a: a.id, b: b.id, d: Math.round(d), err: Math.abs(wrapDeg(bw - br)), ratio: Math.hypot(b.w[0] - a.w[0], b.w[1] - a.w[1]) / d / P.BASE_UPM, colony: both, kind });
    }
  }
  const all = [...pairs.values()];
  const other = all.filter((p) => p.kind !== 'warp').sort((x, y) => y.err - x.err);
  const arr = all.filter((p) => p.kind === 'warp');
  const errs = arr.map((p) => p.err);
  arr.sort((x, y) => y.err - x.err);
  const over15 = arr.filter((p) => p.err > 15);
  return { pairs: arr.length, max: errs.length ? Math.max(...errs) : 0, p99: pct(errs, 0.99), p95: pct(errs, 0.95), p50: pct(errs, 0.5), mean: errs.reduce((s, v) => s + v, 0) / errs.length, over15: over15.length, over10: arr.filter((p) => p.err > 10).length, worst: arr.slice(0, 25), errs,
    layoutPairs: other.filter((p) => p.kind === 'layout'), offmapPairs: other.filter((p) => p.kind === 'offmap') };
}

// ------------------------------------------------------------------ 4. order of places along roads
function nearestOnLine(pt, line) { // -> {d, s (arc length), seg}
  let best = { d: Infinity, s: 0 }, acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    let t = L2 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = a[0] + t * dx, qy = a[1] + t * dy, d = Math.hypot(pt[0] - qx, pt[1] - qy);
    if (d < best.d) best = { d, s: acc + t * L, seg: i - 1 };
    acc += L;
  }
  best.len = acc;
  return best;
}
function roadOrderCheck(P, roads, PP, opt) {
  opt = opt || {};
  const NEAR = opt.near || 35, list = Object.values(PP).filter((p) => !p.e.alias && !p.e.anchor_latlon);
  let checked = 0, onRoads = 0, inversions = 0, pairsCmp = 0;
  const bad = [];
  for (const r of roads) {
    const dense = P.densify(r.pts, 20);
    const realLine = dense.map((q) => realXY(q[0], q[1]));
    const worldLine = dense.map((q) => P.project(q[0], q[1]));
    const on = [];
    for (const p of list) {
      const n = nearestOnLine(p.r, realLine);
      if (n.d > NEAR || n.s < 1 || n.s > n.len - 1) continue;
      const nw = nearestOnLine(p.w, worldLine);
      on.push({ id: p.id, s: n.s, sw: nw.s });
    }
    checked++;
    if (on.length < 2) continue;
    onRoads += on.length;
    on.sort((a, b) => a.s - b.s);
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) {
      if (on[j].s - on[i].s < 3) continue; // the same spot (within 3 m) has no order
      pairsCmp++;
      if (on[j].sw < on[i].sw) { inversions++; if (bad.length < 30) bad.push({ road: r.id, a: on[i].id, b: on[j].id, ds_real: +(on[j].s - on[i].s).toFixed(1), ds_world: +(on[j].sw - on[i].sw).toFixed(1) }); }
    }
  }
  return { roads: checked, placesOnRoads: onRoads, pairs: pairsCmp, inversions, bad };
}

// ------------------------------------------------------------------ 5. landmark footprint overlaps
function overlapCheck(P, D, PP, opt) {
  opt = opt || {};
  const MARGIN = opt.margin == null ? 0 : opt.margin;
  const L = D.landmarks.filter((l) => PP[l.id] && !l.noSolid && l.w && l.d);
  const boxes = L.map((l) => {
    const p = PP[l.id].w;
    return { id: l.id, x0: p[0] - l.w / 2, x1: p[0] + l.w / 2, y0: p[1] - l.d / 2, y1: p[1] + l.d / 2, area: l.w * l.d, conf: PP[l.id].e.confidence, l };
  });
  const out = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + MARGIN, oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + MARGIN;
    if (ox > 0 && oy > 0) {
      if (PP[a.id].e.lat === PP[b.id].e.lat && PP[a.id].e.lon === PP[b.id].e.lon) continue; // the same point twice (alias pair)
      out.push({ a: a.id, b: b.id, push: +Math.min(ox, oy).toFixed(1), areaA: a.area, areaB: b.area, confA: a.conf, confB: b.conf, minor: Math.min(a.area, b.area) < 700 || a.conf === 'low' || b.conf === 'low' });
    }
  }
  out.sort((x, y) => y.push - x.push);
  return { landmarks: boxes.length, overlaps: out, boxes };
}

// ------------------------------------------------------------------ 6. room: roads squeezed by a parallel road
function squeezeCheck(P, roads, zones) {
  const segs = [], samples = [];
  const CELL = 64, hash = new Map();
  const key = (i, j) => i * 100003 + j;
  roads.forEach((r, ri) => {
    const w = ROAD_W[r.kind] || 30, line = P.projectLine(r.pts, { maxSegM: 30 });
    let acc = 0;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], s = { ri, a, b, w };
      segs.push(s);
      const i0 = Math.floor(Math.min(a[0], b[0]) / CELL), i1 = Math.floor(Math.max(a[0], b[0]) / CELL);
      const j0 = Math.floor(Math.min(a[1], b[1]) / CELL), j1 = Math.floor(Math.max(a[1], b[1]) / CELL);
      for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) { const k = key(ii, jj); if (!hash.has(k)) hash.set(k, []); hash.get(k).push(s); }
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 12));
      for (let k = 0; k < n; k++) samples.push({ ri, w, x: a[0] + ((b[0] - a[0]) * (k + 0.5)) / n, y: a[1] + ((b[1] - a[1]) * (k + 0.5)) / n, len: L / n });
      acc += L;
    }
  });
  const dSeg = (x, y, s) => {
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L2 = dx * dx + dy * dy;
    let t = L2 ? ((x - s.a[0]) * dx + (y - s.a[1]) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(x - s.a[0] - t * dx, y - s.a[1] - t * dy);
  };
  const near = (x, y, R, fn) => {
    const i0 = Math.floor((x - R) / CELL), i1 = Math.floor((x + R) / CELL), j0 = Math.floor((y - R) / CELL), j1 = Math.floor((y + R) / CELL);
    const seen = new Set();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const s of hash.get(key(i, j)) || []) if (!seen.has(s)) { seen.add(s); fn(s); }
  };
  // a sample on road A is squeezed by road B when B's edge comes within A's own half width + B's half width,
  // and A and B do not meet (touch < 4 u) anywhere within 2 x (wA + wB) of the sample (i.e. not a junction)
  const res = zones.map((z) => ({ id: z.id, name: z.name, len: 0, squeezed: 0, pairs: {} }));
  let totLen = 0, totSq = 0;
  const pairLen = {};
  for (const smp of samples) {
    let sq = false, culprit = null, cd = 0;
    const R = smp.w / 2 + 34;
    const cand = new Map();
    near(smp.x, smp.y, R, (s) => {
      if (s.ri === smp.ri) return;
      const d = dSeg(smp.x, smp.y, s);
      if (d < (smp.w + s.w) / 2) cand.set(s.ri, Math.min(cand.get(s.ri) == null ? Infinity : cand.get(s.ri), d));
    });
    for (const [rb, d] of cand) {
      // junction test: does road rb touch road smp.ri near here?
      const J = 2 * (smp.w + ROAD_W[roads[rb].kind] || 60);
      let meets = false;
      near(smp.x, smp.y, J, (s) => {
        if (meets || s.ri !== rb) return;
        // distance from this segment of B to any segment of A near the sample
        near(smp.x, smp.y, J, (t) => {
          if (meets || t.ri !== smp.ri) return;
          const dd = Math.min(dSeg(s.a[0], s.a[1], t), dSeg(s.b[0], s.b[1], t), dSeg(t.a[0], t.a[1], s), dSeg(t.b[0], t.b[1], s));
          if (dd < 4 || segX(s, t)) meets = true;
        });
      });
      if (!meets) { sq = true; culprit = rb; cd = d; break; }
    }
    totLen += smp.len;
    let pk = null;
    if (sq) {
      totSq += smp.len;
      pk = [roads[smp.ri].id, roads[culprit].id].sort().join(' ~ ');
      const q = pairLen[pk] || (pairLen[pk] = { len: 0, minGap: Infinity, need: 0 });
      q.len += smp.len; q.minGap = Math.min(q.minGap, cd); q.need = Math.max(q.need, (smp.w + ROAD_W[roads[culprit].kind]) / 2);
    }
    for (let zi = 0; zi < zones.length; zi++) {
      const z = zones[zi];
      if (Math.hypot(smp.x - z.wx, smp.y - z.wy) < z.wr) {
        res[zi].len += smp.len;
        if (sq) { res[zi].squeezed += smp.len; res[zi].pairs[pk] = (res[zi].pairs[pk] || 0) + smp.len; }
      }
    }
  }
  for (const z of res) z.top = Object.entries(z.pairs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ pair: k, len: Math.round(v / 2), minGap: Math.round(pairLen[k].minGap), need: pairLen[k].need }));
  return { totalLen: totLen, squeezed: totSq, zones: res, pairs: pairLen };
}
function segX(s, t) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(s.a, s.b, t.a) * o(s.a, s.b, t.b) < 0 && o(t.a, t.b, s.a) * o(t.a, t.b, s.b) < 0;
}

// ------------------------------------------------------------------ footprint needs per core (absolute u/m)
// For each core: the smallest uniform local scale (u per real metre) at which the worlddata footprints of its
// landmarks stop overlapping at their real positions, with no clearance and with a 12 u clearance. 'structural'
// counts only pairs of sizeable (>= 1500 u^2), non-low-confidence footprints; 'all' counts every pair.
const CORE_SETS = {
  'Old City': ['charminar', 'mecca_masjid', 'chowmahalla_palace', 'madina_building', 'gulzar_houz', 'kaman_machli', 'kaman_charminar', 'kaman_kali', 'kaman_sher_e_batil', 'pathergatti_arcade_w', 'badshahi_ashurkhana', 'jama_masjid_charminar', 'nimrah_cafe', 'mahboob_chowk_clock_tower', 'murgi_chowk', 'pista_house', 'bangle_shop_1', 'bangle_shop_2', 'bangle_shop_3', 'bangle_shop_4', 'irani_cafe_19', 'hotel_nayaab', 'shadab_hotel', 'irani_cafe_15', 'akkanna_madanna_temple', 'lal_darwaza_temple', 'high_court', 'salar_jung_museum', 'city_college', 'purani_haveli', 'recording_centre_1'],
  'Abids / Koti / Nampally': ['imlibun_bus_station', 'cbs_hangar', 'koti_womens_college', 'koti_bus_stand', 'mozamjahi_market', 'king_kothi', 'church_st_josephs', 'ramakrishna_theatre', 'abids_gpo', 'gurudwara_gowliguda', 'st_georges_church_abids', 'grand_hotel', 'taj_mahal_hotel_abids', 'karachi_bakery', 'chermas_abids', 'gokul_chat', 'nampally_station', 'state_central_library', 'osmania_hospital', 'iskcon_abids', 'numaish_stalls_1', 'numaish_stalls_2', 'maut_ka_kuan', 'koti_book_bazaar', 'subhan_bakery', 'assembly', 'lb_stadium', 'state_museum', 'jubilee_hall'],
  'Secunderabad': ['monda_market', 'secunderabad_station', 'rathifile_bus_station', 'church_wesley', 'alpha_hotel', 'garden_cafe', 'secunderabad_clock_tower', 'secunderabad_ganesh_temple', 'blue_sea_cafe', 'chenoy_trade_centre', 'ujjaini_mahankali_temple', 'paradise', 'church_st_marys'],
  'Tank Bund / Lumbini': ['secretariat', 'prasads_imax', 'birla_mandir', 'birla_planetarium', 'hill_fort_palace', 'all_india_radio', 'ntr_memorial', 'lumbini_jetty', 'buddha_statue', 'musical_fountain', 'ravindra_bharathi', 'katta_maisamma_temple', 'khairatabad_ganesh', 'ramakrishna_math', 'liberty_theatre'],
};
function footprintNeeds(inp) {
  const L = {}; for (const l of inp.D.landmarks) L[l.id] = l;
  const out = [];
  for (const [core, ids] of Object.entries(CORE_SETS)) {
    const it = ids.filter((i) => L[i] && inp.places[i] && !L[i].noSolid).map((i) => {
      const r = realXY(inp.places[i].lat, inp.places[i].lon);
      return { id: i, w: L[i].w, d: L[i].d, x: r[0], y: -r[1], low: inp.places[i].confidence === 'low', big: L[i].w * L[i].d >= 1500 };
    });
    const res = { core, structural: [], all: [] };
    for (let i = 0; i < it.length; i++) for (let j = i + 1; j < it.length; j++) {
      const a = it[i], b = it[j], dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
      const need = (gap) => Math.min(dx > 0 ? ((a.w + b.w) / 2 + gap) / dx : Infinity, dy > 0 ? ((a.d + b.d) / 2 + gap) / dy : Infinity);
      const row = { pair: a.id + ' / ' + b.id, a: a.id, b: b.id, upm0: need(0), upm12: need(12) };
      res.all.push(row);
      if (a.big && b.big && !a.low && !b.low) res.structural.push(row);
    }
    res.all.sort((p, q) => q.upm12 - p.upm12); res.structural.sort((p, q) => q.upm12 - p.upm12);
    out.push(res);
  }
  return out;
}

// ------------------------------------------------------------------ named areas
const AREAS = [
  ['Charminar', 'charminar'], ['Mecca Masjid', 'mecca_masjid'], ['Gulzar Houz', 'gulzar_houz'], ['Chowmahalla Palace', 'chowmahalla_palace'],
  ['Madina / Pathergatti', 'madina_building'], ['Laad Bazaar', 'laad_bazaar'], ['Shah Ali Banda', 'shah_ali_banda'], ['Falaknuma Palace', 'falaknuma_palace'],
  ['Afzalgunj / Osmania Hospital', 'osmania_hospital'], ['Puranapul', 'purana_pul'], ['Abids Circle', 'abids'], ['Koti', 'koti_bus_stand'],
  ['Sultan Bazaar', 'sultan_bazaar'], ['Nampally station', 'nampally_station'], ['Himayatnagar colony (home)', 'home'], ['Narayanguda', 'narayanguda_ymca'],
  ['RTC X Roads', 'rtc_x_roads'], ['Kachiguda station', 'kachiguda_station'], ['Tank Bund (mid)', 'tank_bund'], ['Lumbini Park', 'lumbini_park'],
  ['Secretariat', 'secretariat'], ['Birla Mandir', 'birla_mandir'], ['Secunderabad Clock Tower', 'secunderabad_clock_tower'],
  ['Secunderabad station', 'secunderabad_station'], ['Paradise', 'paradise'], ['Begumpet airport', 'begumpet_airport'], ['Ameerpet', 'ameerpet_coaching'],
  ['Panjagutta', 'panjagutta'], ['Banjara Hills (KBR Park)', 'kbr_park'], ['Jubilee Hills check post', 'jubilee_hills_check_post'], ['Film Nagar', 'film_nagar'],
  ['HITEC City (Cyber Towers)', 'cyber_towers'], ['Gachibowli stadium', 'gachibowli_stadium'], ['Golconda Fort', 'golconda_fort'],
  ['Qutb Shahi Tombs', 'qutb_shahi_tombs'], ['Tolichowki', 'tolichowki'], ['Mehdipatnam', 'mehdipatnam_bus_terminus'], ['Masab Tank', 'masab_tank'],
  ['Musheerabad', 'musheerabad'], ['Osmania University', 'osmania_university'], ['Tarnaka', 'tarnaka'], ['Amberpet', 'amberpet'],
  ['Malakpet', 'malakpet_race_course'], ['Dilsukhnagar', 'dilsukhnagar_sai_temple'], ['LB Nagar', 'lb_nagar'], ['Saroornagar lake', 'saroornagar_lake'],
  ['Chandrayangutta', 'chandrayangutta'], ['Nehru Zoo', 'nehru_zoo'], ['Langar Houz / Bapu Ghat', 'bapu_ghat'], ['Rajendranagar edge', 'gandipet'],
  ['Moula Ali', 'moula_ali_dargah'],
];
function areaTable(P, places) {
  const rows = [];
  for (const [label, id] of AREAS) {
    const e = places[id]; if (!e) continue;
    const s = P.scaleAt(e.lat, e.lon), w = P.project(e.lat, e.lon);
    rows.push({ label, id, lat: e.lat, lon: e.lon, x: Math.round(w[0]), y: Math.round(w[1]), m: s.m, upm: s.upm, mpu: s.mpu, aniso: s.aniso, rot: s.rot, brg: s.bearingMaxErr });
  }
  return rows;
}

// core zones (for the squeeze and overlap summaries): centre + radius in metres
const ZONES = [
  { id: 'old_city', name: 'Old City (Charminar)', lat: 17.3620, lon: 78.4740, rm: 700 },
  { id: 'abids_koti', name: 'Abids / Koti / Nampally / Sultan Bazaar', lat: 17.3885, lon: 78.4790, rm: 900 },
  { id: 'himayatnagar', name: 'Himayatnagar colony', lat: 17.4000, lon: 78.4880, rm: 600 },
  { id: 'secunderabad', name: 'Secunderabad (Clock Tower)', lat: 17.4375, lon: 78.4995, rm: 800 },
  { id: 'tank_bund', name: 'Tank Bund / Lumbini', lat: 17.4150, lon: 78.4760, rm: 1100 },
  { id: 'outskirts_w', name: 'HITEC / Madhapur (outskirt)', lat: 17.4450, lon: 78.3830, rm: 2000 },
  { id: 'outskirts_se', name: 'Dilsukhnagar / LB Nagar (outskirt)', lat: 17.3600, lon: 78.5350, rm: 2000 },
];
function zonesWorld(P) {
  return ZONES.map((z) => { const w = P.project(z.lat, z.lon), s = P.scaleAt(z.lat, z.lon); return Object.assign({}, z, { wx: w[0], wy: w[1], wr: z.rm * s.upm }); });
}

// Himayatnagar grid lanes that are the same street as a named road (>= 60 % of the lane within 10 m)
function gridLanesNotDuplicated(P, inp) {
  if (inp._gridKeep) return inp._gridKeep;
  const named = inp.roads.map((r) => P.densify(r.pts, 10).map((q) => realXY(q[0], q[1])));
  inp._gridKeep = inp.grid.filter((g) => {
    const pts = P.densify(g.pts, 10).map((q) => realXY(q[0], q[1]));
    let near = 0;
    for (const p of pts) if (named.some((L) => nearestOnLine(p, L).d < 10)) near++;
    return near / pts.length <= 0.6;
  });
  return inp._gridKeep;
}

function runAll(P, inp, opt) {
  opt = opt || {};
  P.init();
  const t0 = Date.now();
  const PP = projPlaces(P, inp.places);
  const res = { params: P.PARAMS };
  res.grid = gridCheck(P, opt.step || 40);
  res.areas = areaTable(P, inp.places);
  res.bearing = bearingCheck(P, PP);
  if (!opt.fast) {
    const grid = gridLanesNotDuplicated(P, inp);
    res.gridDuplicates = inp.grid.length - grid.length;
    res.order = roadOrderCheck(P, inp.roads.concat(grid), PP);
    res.overlap = overlapCheck(P, inp.D, PP);
    res.squeeze = squeezeCheck(P, inp.roads.concat(grid), zonesWorld(P));
  }
  res.ms = Date.now() - t0;
  res.PP = PP;
  return res;
}

function summary(res) {
  const g = res.grid, b = res.bearing;
  const lines = [];
  lines.push(`grid ${g.nx}x${g.ny}: negative triangles ${g.negTriangles}, min det ${g.minDet.toFixed(3)}, m ${g.mMin.toFixed(2)}..${g.mMax.toFixed(2)}, min aniso ${g.minAniso.toFixed(2)}, max field bearing err ${g.maxBearing.toFixed(1)} deg, max |rot| ${g.maxRot.toFixed(2)} deg`);
  lines.push(`bearings: ${b.pairs} pairs, max ${b.max.toFixed(1)}, p99 ${b.p99.toFixed(1)}, p95 ${b.p95.toFixed(1)}, median ${b.p50.toFixed(1)}, mean ${b.mean.toFixed(2)}, >15deg ${b.over15}, >10deg ${b.over10}  (layout pairs ${b.layoutPairs.length}, off-map pairs ${b.offmapPairs.length})`);
  for (const w of b.worst.slice(0, 8)) lines.push(`   ${w.err.toFixed(1)} deg  ${w.a} - ${w.b} (${w.d} m)`);
  if (res.order) lines.push(`road order: ${res.order.roads} roads, ${res.order.placesOnRoads} place hits, ${res.order.pairs} ordered pairs, inversions ${res.order.inversions}`);
  if (res.overlap) {
    const maj = res.overlap.overlaps.filter((o) => !o.minor);
    lines.push(`overlaps: ${res.overlap.overlaps.length} (major ${maj.length}) among ${res.overlap.landmarks} landmarks`);
    for (const o of maj.slice(0, 12)) lines.push(`   ${o.a} x ${o.b}: ${o.push} u`);
  }
  if (res.squeeze) {
    lines.push(`squeeze: ${(100 * res.squeeze.squeezed / res.squeeze.totalLen).toFixed(1)}% of ${Math.round(res.squeeze.totalLen)} u road length`);
    for (const z of res.squeeze.zones) lines.push(`   ${z.id.padEnd(13)} ${(100 * z.squeezed / Math.max(1, z.len)).toFixed(1)}% of ${Math.round(z.len)} u   ` + z.top.slice(0, 3).map((t) => `${t.pair} ${t.len}u gap ${t.minGap}/${t.need}`).join('; '));
  }
  lines.push('areas:');
  for (const a of res.areas) lines.push(`   ${a.label.padEnd(30)} m ${a.m.toFixed(2)}  ${a.mpu.toFixed(2)} m/u  aniso ${a.aniso.toFixed(2)}  brg ${a.brg.toFixed(1)}`);
  lines.push(`(${res.ms} ms)`);
  return lines.join('\n');
}

module.exports = { loadInputs, runAll, gridLanesNotDuplicated, footprintNeeds, CORE_SETS, summary, gridCheck, bearingCheck, roadOrderCheck, overlapCheck, squeezeCheck, areaTable, projPlaces, realXY, ZONES, zonesWorld, ROAD_W, AREAS, nearestOnLine };

if (require.main === module) {
  const inp = loadInputs();
  const res = runAll(G, inp, { fast: process.argv.includes('--fast') });
  if (!process.argv.includes('--quiet')) console.log(summary(res));
  if (process.argv.includes('--report')) require('./write_report.cjs').write(res, inp);
}
