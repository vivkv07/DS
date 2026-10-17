#!/usr/bin/env node
/* NOSTALGIA — tools/validate_map.cjs
 * Loads src/worlddata.js in a sandbox (no browser) and checks the map:
 *  - ids unique (places, landmarks, roads, rails, parks, water, districts)
 *  - every must-have id from design/places_registry.md is present (+ prefix counts)
 *  - everything inside the 8000 x 6000 world
 *  - districts tile the world (no gaps, no overlaps)
 *  - places sit on walkable cells: not in water, landmark/building footprints, rocks
 *  - landmark / building footprints do not sit on roads or water (except noSolid ones)
 *  - roads form one connected network (same T-junction + crossing rules as world.js)
 * Prints stats. Exit code 1 on errors.  Usage: node tools/validate_map.cjs [--quiet]
 * Also exports loadWorldData() for tests/map_preview.cjs.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const W = 8000, H = 6000;

function loadWorldData() {
  const code = fs.readFileSync(path.join(ROOT, 'src/worlddata.js'), 'utf8');
  const sandbox = { window: { N: {} }, console, Math, performance: { now: () => Date.now() } };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  const t0 = Date.now();
  vm.runInContext(code, sandbox, { filename: 'worlddata.js' });
  const D = sandbox.window.N.WORLD_DATA;
  if (!D) throw new Error('worlddata.js did not set N.WORLD_DATA');
  D._loadMs = Date.now() - t0;
  D._hasMarker = /\/\/ MAP_PLAN_FINAL/.test(code.slice(0, 4000));
  return JSON.parse(JSON.stringify(D)); // plain objects (strip sandbox prototypes)
}

// ---- must-have ids (registry). Prefix entries end with '*' and give a minimum count.
const MUST = [
  'koti_bus_stand', 'gokul_chat', 'birla_mandir', 'hussain_sagar', 'buddha_statue', 'prasads_imax', 'ntr_gardens', 'public_gardens',
  'lb_stadium', 'mozamjahi_market', 'nampally_station', 'kachiguda_station', 'imlibun_bus_station', 'assembly',
  'dilsukhnagar_sai_temple', 'rtc_x_roads', 'sandhya_theatre', 'sudarshan_theatre', 'odeon_theatre', 'devi_theatre', 'charminar',
  'nampally_exhibition', 'paradise', 'mecca_masjid', 'osmania_university', 'karachi_bakery', 'lumbini_park', 'necklace_road',
  'tank_bund', 'tank_bund_statues', 'hitec_city', 'cyber_towers', 'golconda_fort', 'golconda_fateh_darwaza', 'golconda_bala_hissar',
  'qutb_shahi_tombs', 'falaknuma_palace', 'salar_jung_museum', 'birla_planetarium', 'nehru_zoo', 'laad_bazaar', 'chowmahalla_palace',
  'gulzar_houz', 'pathergatti', 'purana_pul', 'naya_pul', 'chaderghat_bridge', 'afzalgunj_bridge', 'osmania_hospital', 'high_court',
  'state_central_library', 'abids', 'sultan_bazaar', 'koti_womens_college', 'begum_bazaar', 'secunderabad_clock_tower',
  'secunderabad_station', 'parade_grounds', 'monda_market', 'general_bazaar', 'alpha_hotel', 'ujjaini_mahankali_temple',
  'lal_darwaza_temple', 'khairatabad_ganesh', 'begumpet_airport', 'spanish_mosque', 'sanjeevaiah_park', 'indira_park',
  'lower_tank_bund', 'ravindra_bharathi', 'secretariat', 'raj_bhavan', 'gun_park', 'fateh_maidan', 'nizam_college', 'cafe_bahar',
  'bawarchi', 'ameerpet_coaching', 'kbr_park', 'film_nagar', 'annapurna_studios', 'peddamma_temple', 'shilparamam', 'durgam_cheruvu',
  'gachibowli_stadium', 'gandipet', 'doordarshan_kendra', 'all_india_radio', 'ramoji_film_city', 'nizams_museum', 'taramati_baradari',
  'moula_ali_dargah', 'ramakrishna_theatre', 'shanti_theatre', 'sangeet_theatre', 'liberty_theatre', 'nimrah_cafe', 'shah_ghouse',
  'pista_house', 'shadab_hotel', 'hotel_niagara', 'home', 'playground_home', 'home_terrace', 'friend_home',
  'church_st_josephs', 'church_st_marys', 'church_wesley',
  // round 11b completeness sweep (design/research_all_places.md)
  'blue_sea_cafe', 'secunderabad_ganesh_temple', 'st_johns_church_secunderabad', 'holy_trinity_church_bolarum', 'rashtrapati_nilayam',
  'secunderabad_club', 'gymkhana_ground_secunderabad', 'rathifile_bus_station', 'chenoy_trade_centre', 'anand_theatre', 'shoppers_stop_begumpet',
  'hyderabad_public_school', 'balkampet_yellamma_temple', 'sarathi_studios', 'niloufer_cafe', 'hill_fort_palace', 'khairatabad_mosque',
  'errum_manzil', 'nims_hospital', 'katta_maisamma_temple', 'ramakrishna_math', 'narayanguda_ymca', 'city_central_library',
  'shankar_mutt_nallakunta', 'grand_hotel_abids', 'taj_mahal_hotel_abids', 'chermas_abids', 'st_georges_church_abids', 'st_josephs_cathedral',
  'iskcon_abids', 'subhan_bakery', 'dargah_yousufain', 'jawahar_bal_bhavan', 'famous_ice_cream', 'king_kothi', 'koti_book_bazaar',
  'musi_riverbed', 'city_college', 'gowliguda_hangar', 'gurudwara_gowliguda', 'dhoolpet', 'victory_playground', 'mahboob_chowk_clock_tower',
  'badshahi_ashurkhana', 'jama_masjid_charminar', 'hotel_madina', 'hotel_nayaab', 'akkanna_madanna_temple', 'paigah_tombs', 'barkas',
  'mir_alam_tank', 'sarojini_devi_eye_hospital', 'mehdipatnam_bus_terminus', 'hussain_shah_wali_dargah', 'golconda_jagadamba_temple',
  'bapu_ghat', 'sarvi', 'jubilee_hills_check_post', 'apollo_hospital_jubilee_hills', 'ramanaidu_studios', 'hitex', 'university_of_hyderabad',
  'jntu_kukatpally', 'kphb_colony', 'malakpet_race_course', 'ashtalakshmi_temple', 'saroornagar_lake', 'karmanghat_hanuman_temple',
  'gaddiannaram_fruit_market', 'harina_vanasthali', 'chilkur_balaji', 'mrugavani_park', 'himayat_sagar', 'garden_cafe',
  'ganesh_immersion', 'bonalu',
  'school_*:6', 'kirana_*:12', 'banana_cart_*:8', 'flower_cart_*:8', 'stationery_*:6', 'pindi_girni_*:5', 'playground_*:8',
  'irani_cafe_*:10', 'rythu_bazaar_*:2', 'bus_stop_*:10', 'std_*:10', 'barber_*:6', 'cycle_rent_*:4', 'video_parlour_*:3',
  'bakery_*:3', 'chai_bandi_*:6', 'meat_shop_*:5', 'medical_shop_*:6', 'iyengar_bakery_*:3', 'samosa_bandi_*:5', 'dosa_bandi_*:5',
  'photo_studio_*:4', 'coconut_cart_*:5', 'internet_cafe_*:4', 'mosque_*:5', 'church_*:4', 'temple_*:5', 'giver_*:20', 'hide_*:30',
];

// ---- which art module implements each landmark draw id
// landmarks.js = monuments, heritage and places of worship; everything else = places_art.js
const HERITAGE_DRAWS = ['charminar', 'gulzar_houz', 'kaman', 'mecca_masjid', 'chowmahalla', 'pathergatti_arcade', 'madina_building',
  'mahankali_temple', 'purani_haveli', 'high_court', 'salar_jung_museum', 'puranapul_arches', 'osmania_hospital', 'state_central_library',
  'british_residency', 'church', 'mosque', 'temple', 'sai_temple', 'dargah', 'gurudwara', 'ashurkhana', 'assembly', 'jubilee_hall', 'museum',
  'gun_park', 'nizam_college', 'birla_mandir', 'birla_planetarium', 'secretariat', 'khairatabad_ganesh', 'raj_bhavan', 'palace', 'buddha_statue',
  'ntr_memorial', 'tank_bund_statue', 'kakatiya_arch', 'clock_tower', 'spanish_mosque', 'ou_arts_college', 'fort_wall', 'fort_gate',
  'golconda_bala_hissar', 'qutb_tomb', 'taramati_baradari', 'falaknuma', 'cyber_towers', 'paigah_tombs', 'memorial', 'statue'];
const drawOwner = (draw) => (HERITAGE_DRAWS.includes(draw) ? 'landmarks.js' : 'places_art.js');

// ---------------------------------------------------------------- geometry
const segD2 = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const x = ax + dx * t - px, y = ay + dy * t - py; return x * x + y * y;
};
const polyD2 = (px, py, pts) => { let b = Infinity; for (let i = 0; i < pts.length - 1; i++) b = Math.min(b, segD2(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return b; };
function inPoly(x, y, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function segInter(a, b, c, d) {
  const r1x = b[0] - a[0], r1y = b[1] - a[1], r2x = d[0] - c[0], r2y = d[1] - c[1];
  const den = r1x * r2y - r1y * r2x; if (Math.abs(den) < 1e-9) return false;
  const t = ((c[0] - a[0]) * r2y - (c[1] - a[1]) * r2x) / den, u = ((c[0] - a[0]) * r1y - (c[1] - a[1]) * r1x) / den;
  return t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6;
}
const FOOT = { arterial: 10, street: 7, bund: 9, lane: 0, bridge: 0, path: 0 };

function validate(D, opts) {
  opts = opts || {};
  const errors = [], warns = [];
  const E = (m) => errors.push(m), Wn = (m) => warns.push(m);

  if (!D._hasMarker) E('missing "// MAP_PLAN_FINAL" marker near the top of worlddata.js');

  // ---- unique ids
  const seen = new Map();
  const uniq = (kind, list) => { for (const o of list || []) { if (!o.id) continue; const k = kind + ':' + o.id; if (seen.has(k)) E(`duplicate ${kind} id "${o.id}"`); seen.set(k, o); } };
  uniq('place', D.places); uniq('landmark', D.landmarks); uniq('road', D.roads); uniq('rail', D.rails); uniq('park', D.parks);
  uniq('water', D.water); uniq('district', D.districts); uniq('building', D.buildings);
  const placeIds = new Set((D.places || []).map((p) => p.id));

  // ---- must-haves
  const counts = {};
  for (const m of MUST) {
    if (m.includes('*')) {
      const [pre, n] = m.split('*:'); const c = [...placeIds].filter((id) => id.startsWith(pre)).length;
      counts[pre + '*'] = c; if (c < +n) E(`need >= ${n} places "${pre}*", have ${c}`);
    } else if (!placeIds.has(m)) E(`missing must-have place "${m}"`);
  }

  // ---- bounds
  const inB = (x, y, m) => x >= -(m || 0) && y >= -(m || 0) && x <= W + (m || 0) && y <= H + (m || 0);
  for (const p of D.places) { if (!inB(p.x, p.y)) E(`place ${p.id} out of bounds`); if (!p.district) E(`place ${p.id} has no district`); if (!p.kind) E(`place ${p.id} has no kind`); if (!p.name) E(`place ${p.id} has no name`); }
  for (const l of D.landmarks) { if (!inB(l.x, l.y)) E(`landmark ${l.id} out of bounds`); if (!l.draw) E(`landmark ${l.id} has no draw id`); if (!(l.w > 0 && l.d > 0 && l.h > 0)) E(`landmark ${l.id} bad size`); }
  for (const r of D.roads) { if (!r.pts || r.pts.length < 2) E(`road ${r.id} has <2 points`); for (const p of r.pts) if (!inB(p[0], p[1], 80)) E(`road ${r.id} point out of bounds ${p}`); if (!(r.w > 0)) E(`road ${r.id} bad width`); }
  for (const b of D.blocks) { const [x, y, w, h] = b.rect; if (!inB(x, y) || !inB(x + w, y + h)) E('block out of bounds ' + b.rect); }

  // ---- districts tile the world
  const DG = 10, dgw = W / DG, dgh = H / DG; const dcount = new Uint8Array(dgw * dgh);
  for (const d of D.districts) { const [x, y, w, h] = d.rect; for (let j = Math.floor(y / DG); j < Math.ceil((y + h) / DG); j++) for (let i = Math.floor(x / DG); i < Math.ceil((x + w) / DG); i++) if (i >= 0 && j >= 0 && i < dgw && j < dgh) dcount[j * dgw + i]++; }
  let gaps = 0, over = 0; for (const c of dcount) { if (c === 0) gaps++; if (c > 1) over++; }
  if (gaps) E(`districts leave ${gaps} gap cells (10u)`); if (over) E(`districts overlap in ${over} cells (10u)`);

  // ---- rasterise solids / water / roads at 4u (like world.js)
  const C = 4, GW = W / C, GH = H / C;
  const g = new Uint8Array(GW * GH); // 0 ground 1 road 2 water 3 solid(landmark/bld) 4 rock
  const fillPoly = (poly, v) => {
    let y0 = Infinity, y1 = -Infinity; for (const p of poly) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let j = Math.max(0, Math.floor(y0 / C)); j <= Math.min(GH - 1, Math.floor(y1 / C)); j++) {
      const y = (j + 0.5) * C, xs = [];
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const ya = poly[a][1], yb = poly[b][1]; if ((ya > y) !== (yb > y)) xs.push(poly[a][0] + ((y - ya) / (yb - ya)) * (poly[b][0] - poly[a][0])); }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil(xs[k] / C - 0.5)); i <= Math.min(GW - 1, Math.floor(xs[k + 1] / C - 0.5)); i++) g[j * GW + i] = v;
    }
  };
  const thick = (pts, w, fn) => {
    const r = w / 2;
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1];
      for (let j = Math.max(0, Math.floor((Math.min(a[1], b[1]) - r) / C)); j <= Math.min(GH - 1, Math.floor((Math.max(a[1], b[1]) + r) / C)); j++)
        for (let i = Math.max(0, Math.floor((Math.min(a[0], b[0]) - r) / C)); i <= Math.min(GW - 1, Math.floor((Math.max(a[0], b[0]) + r) / C)); i++)
          if (segD2((i + 0.5) * C, (j + 0.5) * C, a[0], a[1], b[0], b[1]) <= r * r) fn(j * GW + i);
    }
  };
  const rect = (x, y, w, h, v) => { for (let j = Math.max(0, Math.round(y / C)); j < Math.min(GH, Math.round((y + h) / C)); j++) for (let i = Math.max(0, Math.round(x / C)); i < Math.min(GW, Math.round((x + w) / C)); i++) g[j * GW + i] = v; };
  for (const w of D.water) fillPoly(w.poly, 2);
  const ridx = new Int16Array(GW * GH).fill(-1);
  D.roads.forEach((r, k) => thick(r.pts, r.w, (o) => { g[o] = 1; ridx[o] = k; }));
  const rr = (i) => g[i];
  // landmark / building footprints must not cover roads or water
  for (const l of D.landmarks) {
    const parts = l.solids ? l.solids : l.noSolid ? [] : [[l.x - l.w / 2, l.y - l.d / 2, l.w, l.d]];
    for (const s of parts) {
      let hitRoad = 0, hitWater = 0; const which = new Set();
      for (let j = Math.max(0, Math.round(s[1] / C)); j < Math.min(GH, Math.round((s[1] + s[3]) / C)); j++) for (let i = Math.max(0, Math.round(s[0] / C)); i < Math.min(GW, Math.round((s[0] + s[2]) / C)); i++) { const v = rr(j * GW + i); if (v === 1) { hitRoad++; which.add(D.roads[ridx[j * GW + i]].id); } if (v === 2) hitWater++; }
      if (hitRoad > 2) E(`landmark ${l.id} @${l.x},${l.y} footprint covers ${hitRoad} road cells of ${[...which].join('/')}`);
      if (hitWater > 2 && !l.inWater) E(`landmark ${l.id} footprint covers ${hitWater} water cells`);
    }
  }
  for (const b of D.buildings) {
    let hit = 0; const [x, y, w, h] = b.rect;
    for (let j = Math.round(y / C); j < Math.round((y + h) / C); j++) for (let i = Math.round(x / C); i < Math.round((x + w) / C); i++) if (rr(j * GW + i) === 1 || rr(j * GW + i) === 2) hit++;
    if (hit > 2) E(`building ${b.id || b.rect} covers ${hit} road/water cells`);
  }
  for (const l of D.landmarks) { const parts = l.solids ? l.solids : l.noSolid ? [] : [[l.x - l.w / 2, l.y - l.d / 2, l.w, l.d]]; for (const s of parts) rect(s[0], s[1], s[2], s[3], 3); }
  for (const b of D.buildings) rect(b.rect[0], b.rect[1], b.rect[2], b.rect[3], 3);
  // landmark overlaps (solid vs solid)
  const lms = D.landmarks.filter((l) => !l.noSolid && !l.solids);
  for (let a = 0; a < lms.length; a++) for (let b = a + 1; b < lms.length; b++) {
    const A = lms[a], B = lms[b];
    const ox = Math.min(A.x + A.w / 2, B.x + B.w / 2) - Math.max(A.x - A.w / 2, B.x - B.w / 2), oy = Math.min(A.y + A.d / 2, B.y + B.d / 2) - Math.max(A.y - A.d / 2, B.y - B.d / 2);
    if (ox > 2 && oy > 2 && !(A.over || B.over)) E(`landmarks overlap: ${A.id} / ${B.id}`);
  }
  // places
  for (const p of D.places) {
    if (p.inWater) continue;
    const i = Math.floor(p.x / C), j = Math.floor(p.y / C); const v = g[j * GW + i];
    if (v === 2) E(`place ${p.id} is in water`);
    if (v === 3) E(`place ${p.id} @${p.x},${p.y} is inside a solid footprint`);
    for (const rk of D.rocks) if ((rk.x - p.x) ** 2 + (rk.y - p.y) ** 2 < (rk.r + 4) ** 2) { E(`place ${p.id} is inside rock at ${rk.x},${rk.y}`); break; }
  }
  // rocks on roads
  let rockRoad = 0;
  for (const rk of D.rocks) for (const r of D.roads) { if (polyD2(rk.x, rk.y, r.pts) < (rk.r + r.w / 2 + (FOOT[r.kind] || 0)) ** 2) { rockRoad++; break; } }
  if (rockRoad) Wn(`${rockRoad} rocks touch a road (world.js skips rocks on non-ground cells)`);
  // trees in water / on roads
  const badTrees = [];
  for (const t of D.trees) { const v = g[Math.floor(t.y / C) * GW + Math.floor(t.x / C)]; if (v === 1 || v === 2 || v === 3) badTrees.push(t.x + ',' + t.y + ':' + v); }
  if (badTrees.length) E(`${badTrees.length} data trees sit on a road(1), water(2) or footprint(3): ${badTrees.join(' ')}`);

  // ---- road connectivity (world.js rules: endpoint within w/2+6 of another road = T junction; crossings join)
  const roads = D.roads.filter((r) => r.kind !== 'path');
  const parent = roads.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a, b) => { parent[find(a)] = find(b); };
  const bb = roads.map((r) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of r.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } return [x0 - 40, y0 - 40, x1 + 40, y1 + 40]; });
  const deadEnds = [];
  for (let a = 0; a < roads.length; a++) {
    const A = roads[a];
    for (const e of [A.pts[0], A.pts[A.pts.length - 1]]) {
      let linked = false;
      for (let b = 0; b < roads.length; b++) {
        if (b === a) continue; const B = roads[b], q = bb[b];
        if (e[0] < q[0] || e[0] > q[2] || e[1] < q[1] || e[1] > q[3]) continue;
        const tol = B.w / 2 + 6; if (polyD2(e[0], e[1], B.pts) <= tol * tol) { join(a, b); linked = true; }
      }
      const closed = A.pts.length > 2 && A.pts[0][0] === A.pts[A.pts.length - 1][0] && A.pts[0][1] === A.pts[A.pts.length - 1][1];
      const edge = e[0] <= 10 || e[1] <= 10 || e[0] >= W - 10 || e[1] >= H - 10;
      if (!linked && !closed && !edge && !A.spur) deadEnds.push(A.id + '@' + e.map(Math.round).join(','));
    }
    for (let b = a + 1; b < roads.length; b++) {
      const B = roads[b], p = bb[a], q = bb[b];
      if (p[2] < q[0] || q[2] < p[0] || p[3] < q[1] || q[3] < p[1]) continue;
      outer: for (let s = 0; s < A.pts.length - 1; s++) for (let t = 0; t < B.pts.length - 1; t++) if (segInter(A.pts[s], A.pts[s + 1], B.pts[t], B.pts[t + 1])) { join(a, b); break outer; }
    }
  }
  const comps = new Map(); roads.forEach((r, i) => { const c = find(i); if (!comps.has(c)) comps.set(c, []); comps.get(c).push(r.id); });
  const sorted = [...comps.values()].sort((a, b) => b.length - a.length);
  if (sorted.length > 1) for (const c of sorted.slice(1)) E(`road island not connected to the network: ${c.join(', ')}`);
  if (deadEnds.length) Wn(`${deadEnds.length} dead-end road ends: ${deadEnds.slice(0, 30).join('  ')}`);

  // ---- stats
  const len = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
  const byKind = {}; for (const r of D.roads) byKind[r.kind] = (byKind[r.kind] || 0) + len(r.pts);
  const pk = {}; for (const p of D.places) pk[p.kind] = (pk[p.kind] || 0) + 1;
  const drawIds = {}; for (const l of D.landmarks) drawIds[l.draw] = (drawIds[l.draw] || 0) + 1;
  const stats = {
    loadMs: D._loadMs, districts: D.districts.length, water: D.water.length, roads: D.roads.length, roadKm: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, Math.round(v)])),
    rails: (D.rails || []).length, parks: D.parks.length, rocks: D.rocks.length, blocks: D.blocks.length, blockArea: Math.round(D.blocks.reduce((s, b) => s + b.rect[2] * b.rect[3], 0)),
    buildings: D.buildings.length, landmarks: D.landmarks.length, drawIds: Object.keys(drawIds).length, trees: D.trees.length, places: D.places.length, placeKinds: pk, prefixCounts: counts,
  };
  return { errors, warns, stats, drawIds };
}

// ---- markdown tables for design/map_plan.md
function tables(D) {
  const out = [];
  const esc = (t) => String(t == null ? '' : t).replace(/\|/g, '/');
  const len = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return Math.round(s); };
  out.push('### Districts (' + D.districts.length + ')', '', '| id | name | Telugu | rect [x, y, w, h] | style | ground | block fill |', '|---|---|---|---|---|---|---|');
  for (const d of D.districts) out.push(`| \`${d.id}\` | ${esc(d.name)} | ${esc(d.nameTe)} | ${d.rect.join(', ')} | ${d.style} | ${d.ground} | ${d.fill} |`);
  for (const owner of ['landmarks.js', 'places_art.js']) {
    const L = D.landmarks.filter((l) => drawOwner(l.draw) === owner).sort((a, b) => (a.draw + a.id).localeCompare(b.draw + b.id));
    out.push('', `### Landmarks drawn by src/${owner} (${L.length})`, '', 'x, y = centre; w = east-west, d = north-south, h = suggested art height (1 storey = 10 u).', '',
      '| draw | id | name | x | y | w | d | h | face | notes |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const l of L) {
      const notes = [l.noSolid ? 'walk-through' : '', l.solids ? 'solids:' + l.solids.length : '', l.gated ? 'gated' : '', l.variant ? 'variant ' + l.variant : '', l.sign ? 'sign "' + l.sign + '"' : '', l.films ? 'films: ' + l.films.join(', ') : '', l.era || '', l.seasonal ? 'seasonal ' + l.seasonal : ''].filter(Boolean).join('; ');
      out.push(`| ${l.draw} | \`${l.id}\` | ${esc(l.name)} | ${Math.round(l.x)} | ${Math.round(l.y)} | ${l.w} | ${l.d} | ${l.h} | ${l.face || ''} | ${esc(notes)} |`);
    }
  }
  const kinds = {}; for (const p of D.places) (kinds[p.kind] = kinds[p.kind] || []).push(p);
  out.push('', `### Places (${D.places.length}), grouped by kind`, '', 'Each place is a walkable point next to the thing it names. `alias` = same spot as another id.', '');
  for (const k of Object.keys(kinds).sort()) {
    out.push(`#### ${k} (${kinds[k].length})`, '', '| id | name | district | x | y | r | notes |', '|---|---|---|---|---|---|---|');
    for (const p of kinds[k].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))) {
      const notes = [p.alias ? 'alias of `' + p.alias + '`' : '', p.festival ? 'festival ' + p.festival : '', p.offMap ? 'off-map exit' : '', p.boat ? 'boat' : '', p.final ? 'FINALE' : '', p.era || '', p.season || '', p.minigame ? 'minigame ' + p.minigame : ''].filter(Boolean).join('; ');
      out.push(`| \`${p.id}\` | ${esc(p.name)} | ${p.district} | ${p.x} | ${p.y} | ${p.r} | ${esc(notes)} |`);
    }
    out.push('');
  }
  out.push(`### Roads (${D.roads.length})`, '', '| id | name | kind | width | length (u) |', '|---|---|---|---|---|');
  for (const r of D.roads) out.push(`| \`${r.id}\` | ${esc(r.name)} | ${r.kind} | ${r.w} | ${len(r.pts)} |`);
  out.push('', `### Railways (${(D.rails || []).length})`, '', '| id | name | length (u) |', '|---|---|---|');
  for (const r of D.rails || []) out.push(`| \`${r.id}\` | ${esc(r.name)} | ${len(r.pts)} |`);
  out.push('', `### Water (${D.water.length}) and parks (${D.parks.length})`, '', '| id | name | type |', '|---|---|---|');
  for (const w of D.water) out.push(`| \`${w.id}\` | ${esc(w.name)} | water${w.bank ? ', sand bank ' + w.bank : ''} |`);
  for (const p of D.parks) out.push(`| \`${p.id}\` | ${esc(p.name)} | park: ${p.kind} |`);
  return out.join('\n');
}

module.exports = { loadWorldData, validate, MUST, HERITAGE_DRAWS, drawOwner, tables };

if (require.main === module) {
  const quiet = process.argv.includes('--quiet');
  let D;
  try { D = loadWorldData(); } catch (e) { console.error('LOAD FAILED:', e.stack || e); process.exit(1); }
  if (process.argv.includes('--tables')) { console.log(tables(D)); process.exit(0); }
  const { errors, warns, stats, drawIds } = validate(D);
  if (!quiet) {
    console.log('stats', JSON.stringify(stats, null, 1));
    console.log('draw ids', JSON.stringify(drawIds));
  }
  for (const w of warns) console.log('WARN ', w);
  for (const e of errors) console.log('ERROR', e);
  console.log(errors.length ? `FAIL: ${errors.length} errors, ${warns.length} warnings` : `OK: 0 errors, ${warns.length} warnings`);
  process.exit(errors.length ? 1 : 0);
}
