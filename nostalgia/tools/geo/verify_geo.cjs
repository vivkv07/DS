#!/usr/bin/env node
/* NOSTALGIA — tools/geo/verify_geo.cjs   (geography verifier for Map v2; node, no deps)
 *
 * Tests the generated map (src/worlddata.js) against the real city: design/geo/places.json (real lat/lon of every
 * place), roads.json, water.json, rail.json and districts.json. It generates checkable relations from the REAL data
 * and tests each one on the positions the map builder actually wrote (after its cluster moves, street snapping and
 * collision nudges), not on the ideal projection:
 *   compass   B lies in compass sector S of A (8 sectors), for neighbouring and city-scale pairs of well-known places;
 *             claims whose real bearing is within AMBIG deg of a sector boundary are not made (a Hyderabadi would
 *             not call 22 deg "NE" either)
 *   closer    A is closer to B than to C (real ratio >= 1.3)
 *   order     the order of places along real roads (Tank Bund statues from the Lumbini end, MG Road, the Old City
 *             spine, Necklace Road, SD / SP / Begumpet roads, ...) and along multi-road corridors
 *   bridges   the order of the Musi crossings from west to east (every road in roads.json that crosses the river)
 *   stations  the order of stations along each railway service, and that the track passes each station
 *   banks     which bank of the Musi a place stands on
 *   district  which (ward-based) district a place lies in
 *   structure the lake, Tank Bund, Necklace Road, the Musi and the city-scale layout
 * plus the displacement of every well-known place from its ideal projected position.
 *
 * Usage: node tools/geo/verify_geo.cjs [--file worlddata.js] [--json out.json] [--report out.md] [--before before.json]
 *   default --report: none (prints a summary); --before adds a before/after column to the report.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const G = require('./geom.cjs');
const GEO = require('./project.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const argVal = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const FILE = argVal('--file') || path.join(ROOT, 'src/worlddata.js');
const JSON_OUT = argVal('--json');
const REPORT = argVal('--report');
const BEFORE = argVal('--before');
const AMBIG = 5; // deg: no compass claim within this of a sector boundary

GEO.init();
const readJ = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'design/geo', f), 'utf8'));
const PLACES_FILE = argVal('--places');
const PJ = (PLACES_FILE ? JSON.parse(fs.readFileSync(PLACES_FILE, 'utf8')) : readJ('places.json')).places, ROADS = readJ('roads.json').roads, WATER = readJ('water.json'), RAIL = readJ('rail.json');
const DISTJ = readJ('districts.json').districts;

function loadWorld(file) {
  const code = fs.readFileSync(file, 'utf8');
  const sb = { window: { N: {} }, console, Math, performance: { now: () => 0 } };
  sb.window.window = sb.window; vm.createContext(sb);
  vm.runInContext(code, sb, { filename: 'worlddata.js' });
  return sb.window.N.WORLD_DATA;
}
const D = loadWorld(FILE);
const LM = new Map(D.landmarks.map((l) => [l.id, l]));
const PL = new Map(D.places.map((p) => [p.id, p]));
const WROAD = new Map(D.roads.map((r) => [r.id, r]));

/* ------------------------------------------------------------------ real + world positions */
const LAT0 = 17.3935, LON0 = 78.448, MLAT = 110673.6, MLON = 106261.1;
const rxy = (lat, lon) => [(lon - LON0) * MLON, -(lat - LAT0) * MLAT]; // metres, +x east, +y south (like the world)
const SECT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const bearing = (a, b) => { const v = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI; return (v + 360) % 360; };
const sector = (b) => SECT[Math.round(b / 45) % 8];
const boundaryGap = (b) => { const m = ((b - 22.5) % 45 + 45) % 45; return Math.min(m, 45 - m); };
const angDiff = (a, b) => { let d = ((b - a) % 360 + 540) % 360 - 180; return d; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const r0 = (v) => Math.round(v), r1 = (v) => Math.round(v * 10) / 10;

const VIRTUAL = {}; // id -> {real:[x,y] m, world:[x,y] u, name}
function realPt(id) {
  if (VIRTUAL[id]) return VIRTUAL[id].real;
  const e = PJ[id]; if (!e || e.anchor_latlon || e.lat == null) return null;
  if (!GEO.inFrame(e.lat, e.lon)) return null;
  return rxy(e.lat, e.lon);
}
function worldPt(id) {
  if (VIRTUAL[id]) return VIRTUAL[id].world;
  const l = LM.get(id); if (l) return [l.x, l.y];
  const p = PL.get(id); if (p) return [p.x, p.y];
  return null;
}
const nameOf = (id) => (VIRTUAL[id] ? VIRTUAL[id].name : (PJ[id] && PJ[id].name) || (LM.get(id) || PL.get(id) || {}).name || id);
const confOf = (id) => (VIRTUAL[id] ? 'high' : (PJ[id] && PJ[id].confidence) || 'low');
// things beyond the frame stand as signposts at the world edge on their road (build_worlddata.cjs EDGE): their
// lat/lon is symbolic, so they take part only in the edge check (structure)
const EDGE_IDS = new Set(['jntu_kukatpally', 'kphb_colony', 'playground_16', 'rashtrapati_nilayam', 'holy_trinity_church_bolarum',
  'harina_vanasthali', 'ramoji_film_city', 'vijayawada_highway', 'university_of_hyderabad', 'gandipet', 'chilkur_balaji', 'mrugavani_park', 'himayat_sagar']);
const ok = (id) => !EDGE_IDS.has(id) && !!(realPt(id) && worldPt(id));

// virtual points: the centroid of Hussain Sagar (real OSM polygon vs the world polygon)
{
  const hs = WATER.lakes.find((l) => l.id === 'hussain_sagar');
  const ring = (hs.poly || hs.outer || hs.pts || (hs.polys && hs.polys[0].outer));
  const rr = ring.map((p) => rxy(p[0], p[1]));
  const ww = D.water.find((w) => w.id === 'hussain_sagar').poly;
  VIRTUAL.hussain_sagar_centre = { name: 'Hussain Sagar (centre of the lake)', real: G.centroid(rr), world: G.centroid(ww) };
}

/* ------------------------------------------------------------------ well-known places */
const WK = `charminar mecca_masjid laad_bazaar gulzar_houz chowmahalla_palace mahboob_chowk_clock_tower purani_haveli
salar_jung_museum high_court osmania_hospital state_central_library city_college naya_pul purana_pul badshahi_ashurkhana
pathergatti dhoolpet begum_bazaar falaknuma_palace shah_ghouse barkas nehru_zoo mir_alam_tank bapu_ghat imlibun_bus_station
koti_womens_college koti abids mozamjahi_market nampally_station public_gardens assembly fateh_maidan basheerbagh liberty
birla_mandir ravindra_bharathi lakdikapul st_josephs_cathedral cafe_bahar secretariat lumbini_park ntr_gardens buddha_statue
tank_bund indira_park khairatabad_ganesh prasads_imax raj_bhavan sanjeevaiah_park necklace_road_station nims_hospital panjagutta
ameerpet begumpet_station begumpet_airport spanish_mosque paradise secunderabad_clock_tower secunderabad_station monda_market
ujjaini_mahankali_temple parade_grounds gymkhana_ground_secunderabad james_street_station hyderabad_public_school
balkampet_yellamma_temple erragadda errum_manzil rtc_x_roads osmania_university tarnaka kachiguda_station malakpet
dilsukhnagar_sai_temple lb_nagar saroornagar_lake karmanghat_hanuman_temple paigah_tombs ashtalakshmi_temple golconda_bala_hissar
qutb_shahi_tombs taramati_baradari tolichowki mehdipatnam masab_tank sarojini_devi_eye_hospital kbr_park jubilee_hills_check_post
film_nagar apollo_hospital_jubilee_hills peddamma_temple durgam_cheruvu cyber_towers shilparamam gachibowli_stadium`.split(/\s+/).filter(Boolean);
const WKOK = WK.filter(ok);

/* ------------------------------------------------------------------ relations */
const REL = [];
function add(cat, key, text, pass, detail, extra) { REL.push(Object.assign({ cat, key, text, pass: !!pass, detail }, extra || {})); }

// 1. compass sectors
const LONG = [
  ['charminar', 'laad_bazaar'], ['charminar', 'mecca_masjid'], ['charminar', 'gulzar_houz'], ['charminar', 'chowmahalla_palace'],
  ['charminar', 'falaknuma_palace'], ['charminar', 'golconda_bala_hissar'], ['charminar', 'secunderabad_station'], ['charminar', 'buddha_statue'],
  ['charminar', 'dilsukhnagar_sai_temple'], ['charminar', 'cyber_towers'], ['charminar', 'abids'], ['charminar', 'salar_jung_museum'],
  ['charminar', 'purana_pul'], ['charminar', 'purani_haveli'], ['charminar', 'nehru_zoo'], ['charminar', 'osmania_university'],
  ['abids', 'koti'], ['abids', 'nampally_station'], ['abids', 'mozamjahi_market'], ['koti', 'nampally_station'], ['abids', 'basheerbagh'],
  ['koti', 'imlibun_bus_station'], ['koti', 'kachiguda_station'], ['abids', 'birla_mandir'],
  ['hussain_sagar_centre', 'secunderabad_clock_tower'], ['hussain_sagar_centre', 'secunderabad_station'], ['hussain_sagar_centre', 'begumpet_airport'],
  ['hussain_sagar_centre', 'golconda_bala_hissar'], ['hussain_sagar_centre', 'cyber_towers'], ['hussain_sagar_centre', 'dilsukhnagar_sai_temple'],
  ['hussain_sagar_centre', 'charminar'], ['hussain_sagar_centre', 'tank_bund'], ['hussain_sagar_centre', 'lumbini_park'],
  ['hussain_sagar_centre', 'sanjeevaiah_park'], ['hussain_sagar_centre', 'necklace_road_station'], ['hussain_sagar_centre', 'buddha_statue'],
  ['hussain_sagar_centre', 'birla_mandir'], ['hussain_sagar_centre', 'osmania_university'], ['hussain_sagar_centre', 'kbr_park'],
  ['hussain_sagar_centre', 'paradise'], ['hussain_sagar_centre', 'abids'], ['hussain_sagar_centre', 'mehdipatnam'],
  ['golconda_bala_hissar', 'qutb_shahi_tombs'], ['golconda_bala_hissar', 'cyber_towers'], ['golconda_bala_hissar', 'mehdipatnam'], ['golconda_bala_hissar', 'bapu_ghat'],
  ['cyber_towers', 'shilparamam'], ['cyber_towers', 'gachibowli_stadium'], ['cyber_towers', 'jubilee_hills_check_post'], ['cyber_towers', 'durgam_cheruvu'],
  ['secunderabad_clock_tower', 'secunderabad_station'], ['secunderabad_clock_tower', 'paradise'], ['paradise', 'begumpet_airport'],
  ['begumpet_airport', 'spanish_mosque'], ['begumpet_station', 'begumpet_airport'], ['ameerpet', 'panjagutta'], ['panjagutta', 'nims_hospital'],
  ['dilsukhnagar_sai_temple', 'lb_nagar'], ['dilsukhnagar_sai_temple', 'saroornagar_lake'], ['kachiguda_station', 'osmania_university'],
  ['rtc_x_roads', 'osmania_university'], ['rtc_x_roads', 'secunderabad_station'], ['tank_bund', 'indira_park'], ['secretariat', 'lumbini_park'],
  ['birla_mandir', 'lumbini_park'], ['birla_mandir', 'khairatabad_ganesh'], ['falaknuma_palace', 'shah_ghouse'], ['masab_tank', 'mehdipatnam'],
  ['mehdipatnam', 'tolichowki'], ['tolichowki', 'golconda_bala_hissar'], ['salar_jung_museum', 'high_court'], ['osmania_hospital', 'high_court'],
  ['nampally_station', 'public_gardens'], ['public_gardens', 'assembly'],
];
{
  const pairs = new Map();
  const addPair = (a, b, why) => { if (a === b || !ok(a) || !ok(b)) return; const k = [a, b].sort().join('|'); if (!pairs.has(k)) pairs.set(k, { a, b, why }); };
  for (const [a, b] of LONG) addPair(a, b, 'city');
  for (const a of WKOK) {
    const ra = realPt(a);
    const near = WKOK.filter((b) => b !== a).map((b) => ({ b, d: dist(ra, realPt(b)) })).filter((o) => o.d >= 400 && o.d <= 8000).sort((p, q) => p.d - q.d);
    for (const o of near.slice(0, 3)) addPair(a, o.b, 'neighbour');
  }
  let skipped = 0;
  for (const { a, b, why } of pairs.values()) {
    const br = bearing(realPt(a), realPt(b)), bw = bearing(worldPt(a), worldPt(b));
    if (boundaryGap(br) < AMBIG) { skipped++; continue; }
    const s = sector(br), sw = sector(bw);
    add('compass', `compass:${a}|${b}`, `${nameOf(b)} is ${s} of ${nameOf(a)}`, s === sw,
      `real ${r0(br)}° (${r1(dist(realPt(a), realPt(b)) / 1000)} km), world ${r0(bw)}° → ${sw} (Δ ${r0(angDiff(br, bw))}°)`, { scope: why, dBearing: angDiff(br, bw) });
  }
  REL.compassSkipped = skipped;
}

// 2. closer-than triples
{
  const CUR = [
    ['charminar', 'mecca_masjid', 'chowmahalla_palace'], ['charminar', 'gulzar_houz', 'mahboob_chowk_clock_tower'], ['abids', 'koti', 'masab_tank'],
    ['abids', 'nampally_station', 'koti_womens_college'], ['koti', 'kachiguda_station', 'lakdikapul'], ['birla_mandir', 'lumbini_park', 'indira_park'],
    ['secunderabad_station', 'secunderabad_clock_tower', 'begumpet_airport'], ['begumpet_airport', 'paradise', 'tarnaka'],
    ['golconda_bala_hissar', 'qutb_shahi_tombs', 'mehdipatnam'], ['cyber_towers', 'shilparamam', 'jubilee_hills_check_post'],
    ['dilsukhnagar_sai_temple', 'saroornagar_lake', 'malakpet'], ['falaknuma_palace', 'shah_ghouse', 'charminar'],
    ['buddha_statue', 'lumbini_park', 'sanjeevaiah_park'], ['tank_bund', 'indira_park', 'raj_bhavan'],
  ];
  const triples = new Map();
  const addT = (a, b, c, why) => { if (!ok(a) || !ok(b) || !ok(c)) return; const k = `${a}|${b}|${c}`; if (!triples.has(k)) triples.set(k, { a, b, c, why }); };
  for (const [a, b, c] of CUR) addT(a, b, c, 'curated');
  for (const a of WKOK) {
    const ra = realPt(a);
    const near = WKOK.filter((b) => b !== a).map((b) => ({ b, d: dist(ra, realPt(b)) })).filter((o) => o.d >= 300).sort((p, q) => p.d - q.d);
    if (near.length < 2) continue;
    const B = near[0], C = near.find((o) => o.d >= 1.3 * B.d);
    if (C) addT(a, B.b, C.b, 'nearest');
  }
  for (const { a, b, c, why } of triples.values()) {
    const rab = dist(realPt(a), realPt(b)), rac = dist(realPt(a), realPt(c));
    if (!(rac >= 1.3 * rab)) continue;
    const wab = dist(worldPt(a), worldPt(b)), wac = dist(worldPt(a), worldPt(c));
    add('closer', `closer:${a}|${b}|${c}`, `${nameOf(a)} is closer to ${nameOf(b)} than to ${nameOf(c)}`, wab < wac,
      `real ${r1(rab / 1000)} vs ${r1(rac / 1000)} km (×${r1(rac / rab)}); world ${r0(wab)} vs ${r0(wac)} u (×${r1(wac / wab)})`, { scope: why });
  }
}

// 3. order of places along real roads
const ROADS_BY = new Map(ROADS.map((r) => [r.id, r]));
const ORDER_ROADS = ['tank_bund', 'necklace_rd', 'lower_tank_bund', 'abids_rd', 'mg_rd', 'pathergatti_rd', 'pathergatti_n', 'laad_bazaar',
  'falaknuma_rd', 'afzalgunj_rd', 'nampally_rd', 'basheerbagh_rd', 'liberty_rd', 'himayatnagar_rd', 'narayanguda_rd', 'chikkadpally_rd',
  'musheerabad_rd', 'sd_rd', 'sp_rd', 'rp_rd', 'begumpet_rd', 'begumpet_ameerpet_rd', 'mumbai_hwy', 'raj_bhavan_rd', 'khairatabad_rd',
  'secretariat_rd', 'mehdipatnam_rd', 'old_mumbai_rd', 'golconda_rd', 'tolichowki_golconda_rd', 'banjara_rd1', 'banjara_rd2', 'banjara_rd12', 'jubilee_rd36',
  'malakpet_rd', 'chaderghat_rd', 'koti_kachiguda_rd', 'king_koti_rd', 'bank_st', 'station_rd', 'ou_rd', 'uppal_rd', 'kothapet_rd',
  'nagole_rd', 'lb_nagar_s_rd', 'hitec_rd', 'film_nagar_rd', 'saifabad_rd', 'chandrayangutta_rd', 'darulshifa_rd', 'gunfoundry_rd',
  'mj_market_rd', 'begum_bazaar_rd', 'sultan_bazaar_ln', 'hanuman_tekdi_rd', 'gowliguda_rd', 'amberpet_rd', 'vidyanagar_rd', 'marredpally_rd',
  'trimulgherry_rd', 'airport_rd', 'gandipet_rd', 'raidurg_rd', 'tombs_rd', 'kavadiguda_rd', 'indira_park_rd', 'lumbini_rd'];
const ALL_REAL = Object.keys(PJ).filter((id) => ok(id));
function orderAlong(roadId, latlonPts, label, ids, opt) {
  opt = opt || {};
  const rl = latlonPts.map((p) => rxy(p[0], p[1]));
  const wl = GEO.projectLine(latlonPts, { maxSegM: 20 });
  const near = [];
  const seen = new Set();
  for (const id of ids) {
    const rp = realPt(id), q = G.nearestOnLine(rl, rp[0], rp[1]);
    if (!q || q.d > (opt.maxD || 40) || q.along < 15 || q.along > q.L - 15) continue;
    const key = (PJ[id] ? `${PJ[id].lat},${PJ[id].lon}` : id); if (seen.has(key)) continue; seen.add(key);
    const wp = worldPt(id), qw = G.nearestOnLine(wl, wp[0], wp[1]);
    near.push({ id, s: q.along, sw: qw.along, dw: qw.d });
  }
  near.sort((a, b) => a.s - b.s);
  const minGap = opt.minGap || 50;
  let prev = null;
  for (const n of near) {
    if (prev && n.s - prev.s >= minGap) {
      add('order', `order:${roadId}:${prev.id}|${n.id}`, `along ${label}: ${nameOf(prev.id)} → ${nameOf(n.id)}`, n.sw > prev.sw,
        `real ${r0(prev.s)} → ${r0(n.s)} m along; world ${r0(prev.sw)} → ${r0(n.sw)} u along`, { road: roadId });
      prev = n;
    } else if (!prev) prev = n;
  }
}
for (const id of ORDER_ROADS) {
  const r = ROADS_BY.get(id); if (!r) continue;
  orderAlong(id, r.pts, `${r.name} (${id})`, ALL_REAL);
}
// Tank Bund statues 1..12 from the Lumbini end (numbering convention in the game)
{
  const st = Array.from({ length: 12 }, (_, i) => `tank_bund_statue_${i + 1}`).filter(ok);
  const tb = ROADS_BY.get('tank_bund').pts;
  const wl = GEO.projectLine(tb, { maxSegM: 20 });
  for (let i = 1; i < st.length; i++) {
    const a = G.nearestOnLine(wl, ...worldPt(st[i - 1])), b = G.nearestOnLine(wl, ...worldPt(st[i]));
    add('order', `statues:${st[i - 1]}|${st[i]}`, `Tank Bund statue ${i} → ${i + 1} going north-east from the Lumbini end`, b.along > a.along,
      `world ${r0(a.along)} → ${r0(b.along)} u along Tank Bund`, { road: 'tank_bund' });
  }
}
// corridors (several roads): a sequence of places in a stated real order; the real order is checked too
const CORRIDORS = [
  ['Old City spine, Afzalgunj → Falaknuma (north → south)', 'S', ['osmania_hospital', 'naya_pul', 'pathergatti', 'gulzar_houz', 'charminar', 'shah_ghouse', 'falaknuma_palace']],
  ['Koti → Chaderghat → Malakpet → Dilsukhnagar → LB Nagar (west → east)', 'E', ['koti', 'chaderghat_bridge', 'malakpet', 'dilsukhnagar_sai_temple', 'lb_nagar']],
  ['Golconda → Tolichowki → Mehdipatnam → Masab Tank → Lakdikapul (west → east)', 'E', ['golconda_bala_hissar', 'tolichowki', 'mehdipatnam', 'masab_tank', 'lakdikapul']],
  ['Ameerpet → Begumpet → Paradise → Clock Tower → Secunderabad station (west → east)', 'E', ['ameerpet', 'begumpet_station', 'spanish_mosque', 'paradise', 'secunderabad_clock_tower', 'secunderabad_station']],
  ['Nampally → Abids → Koti (west → east)', 'E', ['nampally_station', 'abids', 'koti']],
  ['Abids → Basheerbagh → Liberty → Secretariat/Lumbini (south → north)', 'N', ['abids', 'basheerbagh', 'liberty', 'lumbini_park']],
  ['Charminar → Abids → Lakdikapul → Khairatabad → Panjagutta → Ameerpet (south → north)', 'N', ['charminar', 'abids', 'lakdikapul', 'khairatabad_ganesh', 'panjagutta', 'ameerpet']],
  ['HITEC City → Jubilee Hills → Panjagutta → Begumpet / Secunderabad (west → east)', 'E', ['cyber_towers', 'jubilee_hills_check_post', 'panjagutta', 'begumpet_station', 'secunderabad_station']],
  ['Koti → Kachiguda → Osmania University (south-west → north-east)', 'NE', ['koti', 'kachiguda_station', 'osmania_university']],
];
for (const [label, dir, ids0] of CORRIDORS) {
  const ids = ids0.filter(ok);
  const v = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0], NE: [Math.SQRT1_2, -Math.SQRT1_2] }[dir];
  const lab = label;
  for (let i = 1; i < ids.length; i++) {
    const a = ids[i - 1], b = ids[i];
    const ra = realPt(a), rb = realPt(b), wa = worldPt(a), wb = worldPt(b);
    const sr = (rb[0] - ra[0]) * v[0] + (rb[1] - ra[1]) * v[1], sw = (wb[0] - wa[0]) * v[0] + (wb[1] - wa[1]) * v[1];
    add('order', `corridor:${a}|${b}`, `${lab}: ${nameOf(a)} before ${nameOf(b)}`, sr > 0 && sw > 0,
      `real step ${r0(sr)} m ${dir}${sr > 0 ? '' : ' (REAL ORDER DISAGREES)'}; world step ${r0(sw)} u ${dir}`, { road: 'corridor' });
  }
}

// 4. Musi crossings west → east
const MUSI = WATER.rivers.find((r) => r.id === 'musi');
const musiR = MUSI.centreline.map((p) => rxy(p[0], p[1]));
const musiW = GEO.projectLine(MUSI.centreline, { maxSegM: 20 });
const musiWc = G.cum(musiW), musiRc = G.cum(musiR);
function crossings(line, river, rc) {
  const out = [];
  for (let i = 0; i + 1 < line.length; i++) for (let j = 0; j + 1 < river.length; j++) {
    const h = G.segInter(line[i], line[i + 1], river[j], river[j + 1]);
    if (h) out.push({ x: h.x, y: h.y, s: rc[j] + h.u * Math.hypot(river[j + 1][0] - river[j][0], river[j + 1][1] - river[j][1]) });
  }
  return out;
}
{
  const xs = [];
  for (const r of ROADS) {
    const c = crossings(r.pts.map((p) => rxy(p[0], p[1])), musiR, musiRc);
    if (!c.length) continue;
    // world: the road with this id (or its split pieces), crossing the projected river
    const cand = D.roads.filter((w) => w.id === r.id || w.id.startsWith(r.id + '_') || w.kind === 'bridge');
    const ideal = crossings(GEO.projectLine(r.pts, { maxSegM: 20 }), musiW, musiWc);
    let wc = [];
    for (const w of cand) wc = wc.concat(crossings(w.pts, musiW, musiWc).map((h) => Object.assign(h, { piece: w.id, kind: w.kind })));
    for (let k = 0; k < c.length; k++) {
      const id0 = ideal[k] || ideal[0];
      let best = null;
      for (const h of wc) { const d = id0 ? Math.hypot(h.x - id0.x, h.y - id0.y) : 0; if (!best || d < best.d) best = Object.assign({ d }, h); }
      xs.push({ id: r.id + (c.length > 1 ? `#${k + 1}` : ''), name: r.name, s: c[k].s, w: best, conf: r.confidence });
    }
  }
  xs.sort((a, b) => a.s - b.s);
  REL.bridges = xs;
  for (const x of xs) add('bridges', `bridge-exists:${x.id}`, `${x.name} (${x.id}) crosses the Musi in the map`, !!x.w && x.w.d < 120,
    x.w ? `world crossing ${r0(x.w.x)},${r0(x.w.y)} (${r0(x.w.d)} u from the ideal crossing; piece ${x.w.piece}, kind ${x.w.kind})` : 'no world crossing found');
  const have = xs.filter((x) => x.w && x.w.d < 120);
  for (let i = 1; i < have.length; i++) {
    const a = have[i - 1], b = have[i];
    if (b.s - a.s < 40) continue;
    add('bridges', `bridge-order:${a.id}|${b.id}`, `Musi west → east: ${a.name} before ${b.name}`, b.w.s > a.w.s,
      `real ${r1(a.s / 1000)} → ${r1(b.s / 1000)} km down the river; world ${r0(a.w.s)} → ${r0(b.w.s)} u`);
  }
}

// 5. stations along each service; the track passes each station
{
  const byCode = new Map(RAIL.stations.map((s) => [s.code, s]));
  const SEC = new Map(RAIL.sections.map((s) => [s.id, s]));
  for (const sv of RAIL.services) {
    // chain the sections into one line (flip each to join the previous end)
    let line = [];
    for (const sid of sv.sections) {
      let p = SEC.get(sid).pts.slice();
      if (line.length) {
        const e = line[line.length - 1];
        const d0 = Math.hypot(p[0][0] - e[0], p[0][1] - e[1]), d1 = Math.hypot(p[p.length - 1][0] - e[0], p[p.length - 1][1] - e[1]);
        if (d1 < d0) p.reverse();
      } else if (sv.sections.length > 1) {
        const n = SEC.get(sv.sections[1]).pts, a = p[0], b = p[p.length - 1];
        const dA = Math.min(Math.hypot(n[0][0] - a[0], n[0][1] - a[1]), Math.hypot(n[n.length - 1][0] - a[0], n[n.length - 1][1] - a[1]));
        const dB = Math.min(Math.hypot(n[0][0] - b[0], n[0][1] - b[1]), Math.hypot(n[n.length - 1][0] - b[0], n[n.length - 1][1] - b[1]));
        if (dA < dB) p.reverse();
      }
      line = line.concat(p);
    }
    const rl = line.map((p) => rxy(p[0], p[1])), wl = GEO.projectLine(line, { maxSegM: 20 });
    const sts = sv.stations.map((c) => byCode.get(c)).filter(Boolean);
    // orient by the first and last station in reality
    const along = sts.map((s) => ({ s, ra: G.nearestOnLine(rl, ...rxy(s.latlon[0], s.latlon[1])).along }));
    const flip = along.length > 1 && along[along.length - 1].ra < along[0].ra;
    const inWorld = along.filter((o) => ok(o.s.id));
    for (let i = 1; i < inWorld.length; i++) {
      const a = inWorld[i - 1], b = inWorld[i];
      const la = LM.get(a.s.id), lb = LM.get(b.s.id);
      const pa = la && la.track ? la.track : worldPt(a.s.id), pb = lb && lb.track ? lb.track : worldPt(b.s.id);
      const wa = G.nearestOnLine(wl, pa[0], pa[1]).along, wb = G.nearestOnLine(wl, pb[0], pb[1]).along;
      const realOk = flip ? b.ra < a.ra : b.ra > a.ra;
      add('stations', `stations:${sv.id}:${a.s.id}|${b.s.id}`, `${sv.name}: ${a.s.name} → ${b.s.name}`, realOk && (flip ? wb < wa : wb > wa),
        `real ${r1(a.ra / 1000)} → ${r1(b.ra / 1000)} km along the line${realOk ? '' : ' (REAL ORDER DISAGREES)'}; world ${r0(wa)} → ${r0(wb)} u`);
    }
  }
  // the world track passes every in-frame station of rail.json; the station building stands beside it
  const railPts = D.rails.map((r) => r.pts);
  const nearRail = (x, y) => { let b = Infinity; for (const p of railPts) { const q = G.nearestOnLine(p, x, y); if (q && q.d < b) b = q.d; } return b; };
  for (const s of RAIL.stations) {
    if (!GEO.inFrame(s.latlon[0], s.latlon[1])) continue;
    const ip = GEO.project(s.latlon[0], s.latlon[1]);
    const d = nearRail(ip[0], ip[1]);
    const tol = 25 + (s.track_offset_m || 0) * 0.8;
    add('stations', `track:${s.id}`, `the track passes ${s.name} (${s.code})`, d <= tol, `world track ${r0(d)} u from the projected platform (tolerance ${r0(tol)} u)`);
    if (worldPt(s.id)) {
      const l = LM.get(s.id), wp = worldPt(s.id);
      const dd = nearRail(wp[0], wp[1]);
      const lim = l ? Math.max(l.w, l.d) / 2 + 60 : 60;
      add('stations', `beside:${s.id}`, `${s.name} station building stands beside the track`, dd <= lim, `world ${r0(dd)} u from the nearest track (limit ${r0(lim)})`);
    }
  }
}

// 6. Musi banks
{
  for (const id of ALL_REAL) {
    if (PJ[id] && PJ[id].alias) continue;
    const rp = realPt(id), q = G.nearestOnLine(musiR, rp[0], rp[1]);
    if (!q || q.d < 60 || q.d > 1500 || q.along < 50 || q.along > q.L - 50) continue;
    const wp = worldPt(id), qw = G.nearestOnLine(musiW, wp[0], wp[1]);
    // the Musi centreline runs west -> east: side +1 (right of travel, y down) = south bank
    const bankR = q.side > 0 ? 'south' : 'north', bankW = qw.side > 0 ? 'south' : 'north';
    add('banks', `bank:${id}`, `${nameOf(id)} is on the ${bankR} bank of the Musi`, bankR === bankW,
      `real ${r0(q.d)} m from the river; world ${r0(qw.d)} u on the ${bankW} side`, { conf: confOf(id) });
  }
}

// 7. districts
const pip = (x, y, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [yi, xi] = ring[i], [yj, xj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
function realDistrict(lat, lon) {
  for (const d of DISTJ) for (const p of d.polys) {
    if (pip(lon, lat, p.outer) && !(p.holes || []).some((h) => pip(lon, lat, h))) return d.id;
  }
  return null;
}
function edgeDistM(lat, lon, did) {
  const d = DISTJ.find((x) => x.id === did); if (!d) return Infinity;
  const p0 = rxy(lat, lon); let best = Infinity;
  for (const p of d.polys) for (const ring of [p.outer].concat(p.holes || [])) {
    const r = ring.map((q) => rxy(q[0], q[1])); r.push(r[0]);
    const q = G.nearestOnLine(r, p0[0], p0[1]); if (q && q.d < best) best = q.d;
  }
  return best;
}
const DG = (() => { const g = D.districtGrid, arr = new Int16Array(g.w * g.h).fill(-1); let o = 0; for (let k = 0; k + 1 < g.rle.length; k += 2) { arr.fill(g.rle[k], o, o + g.rle[k + 1]); o += g.rle[k + 1]; } return { g, arr }; })();
function worldDistrict(x, y) {
  const i = Math.floor(x / DG.g.cell), j = Math.floor(y / DG.g.cell);
  if (i < 0 || j < 0 || i >= DG.g.w || j >= DG.g.h) return null;
  const v = DG.arr[j * DG.g.w + i]; return v >= 0 ? D.districts[v].id : null;
}
{
  let ambiguous = 0;
  for (const id of ALL_REAL) {
    if (PJ[id].alias) continue;
    const e = PJ[id], rd = realDistrict(e.lat, e.lon); if (!rd) continue;
    if (edgeDistM(e.lat, e.lon, rd) < 60) { ambiguous++; continue; }
    const wp = worldPt(id), wd = worldDistrict(wp[0], wp[1]);
    add('district', `district:${id}`, `${nameOf(id)} lies in district ${rd}`, wd === rd, `world district ${wd}`, { conf: confOf(id), wk: WK.includes(id) });
  }
  REL.districtSkipped = ambiguous;
}

// 8. structure: the lake, Tank Bund, Necklace Road, the Musi, the city layout
{
  // the Golconda Fort place is the visitors' entrance: it stands at a gate of the fort wall
  const gp = PL.get('golconda_fort'), gates = ['golconda_fateh_darwaza', 'golconda_banjara_darwaza', 'golconda_bala_hisar_gate'].filter((g) => LM.get(g));
  if (gp && gates.length) {
    const d = Math.min(...gates.map((g) => dist([gp.x, gp.y], [LM.get(g).x, LM.get(g).y])));
    add('structure', 'golconda-gate', 'the Golconda Fort place (where the player arrives) stands at a gate of the fort', d < 90, `${r0(d)} u from the nearest gate landmark (${gates.join(', ')})`);
  }
  // edge signposts stand at the world edge
  for (const id of EDGE_IDS) {
    const wp = worldPt(id); if (!wp) continue;
    const de = Math.min(wp[0], wp[1], D.size[0] - wp[0], D.size[1] - wp[1]);
    add('structure', `edge:${id}`, `the signpost '${nameOf(id)}' stands at the map edge where its road leaves the city`, de < 450, `${r0(de)} u from the world edge`);
  }
  const ww = D.water.find((w) => w.id === 'hussain_sagar').poly;
  const bw = worldPt('buddha_statue');
  const ring8 = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [bw[0] + 70 * Math.cos(k * Math.PI / 4), bw[1] + 70 * Math.sin(k * Math.PI / 4)]);
  const wet = ring8.filter((p) => G.inPoly(p[0], p[1], ww)).length;
  add('structure', 'buddha-in-lake', 'the Buddha statue stands in Hussain Sagar, on its rock island', wet === 8 || G.inPoly(bw[0], bw[1], ww),
    `world ${bw}; ${wet} of 8 points 70 u around it are lake water`);
  // Buddha's place within the lake's bounding box (real vs world)
  const hs = WATER.lakes.find((l) => l.id === 'hussain_sagar'); const ring = (hs.poly || hs.outer || hs.pts || (hs.polys && hs.polys[0].outer));
  const rr = ring.map((p) => rxy(p[0], p[1])), rb = G.bbox(rr), wb = G.bbox(ww), br = realPt('buddha_statue');
  const fr = [(br[0] - rb[0]) / (rb[2] - rb[0]), (br[1] - rb[1]) / (rb[3] - rb[1])], fw = [(bw[0] - wb[0]) / (wb[2] - wb[0]), (bw[1] - wb[1]) / (wb[3] - wb[1])];
  add('structure', 'buddha-in-lake-pos', 'the Buddha sits in the south-central part of the lake, as in reality', Math.abs(fr[0] - fw[0]) < 0.08 && Math.abs(fr[1] - fw[1]) < 0.08,
    `fraction of the lake box (x from W, y from N): real ${r1(fr[0] * 100)}%, ${r1(fr[1] * 100)}%; world ${r1(fw[0] * 100)}%, ${r1(fw[1] * 100)}%`);
  // lake shape: aspect ratio and area share of bounding box
  const ar = (b) => (b[3] - b[1]) / (b[2] - b[0]);
  const fill = (poly, b) => Math.abs(G.polyArea(poly)) / ((b[2] - b[0]) * (b[3] - b[1]));
  add('structure', 'lake-shape', 'Hussain Sagar keeps its real proportions (height / width of the lake)', Math.abs(ar(rb) / ar(wb) - 1) < 0.12 && Math.abs(fill(rr, rb) - fill(ww, wb)) < 0.06,
    `height/width real ${r1(ar(rb) * 100) / 100}, world ${r1(ar(wb) * 100) / 100}; area/box real ${r1(fill(rr, rb) * 100)}%, world ${r1(fill(ww, wb) * 100)}%`);
  // Tank Bund: orientation and which side the water is on
  const tbR = ROADS_BY.get('tank_bund').pts.map((p) => rxy(p[0], p[1])), tbW = WROAD.get('tank_bund').pts;
  const ch = (l) => bearing(l[0], l[l.length - 1]);
  const bR = (ch(tbR) + 180) % 360 < ch(tbR) ? ch(tbR) : ch(tbR);
  const sR = sector(Math.min(ch(tbR), (ch(tbR) + 180) % 360)), sW = sector(Math.min(ch(tbW), (ch(tbW) + 180) % 360));
  add('structure', 'tank-bund-orientation', `Tank Bund runs ${sR}-${SECT[(SECT.indexOf(sR) + 4) % 8]} (real chord ${r0(bR)}°)`, sR === sW && Math.abs(angDiff(ch(tbR), ch(tbW))) < 10,
    `real chord bearing ${r0(ch(tbR))}°, world ${r0(ch(tbW))}° (Δ ${r0(angDiff(ch(tbR), ch(tbW)))}°)`);
  const sideOf = (line, p) => { const q = G.nearestOnLine(line, p[0], p[1]); return q.side; };
  const hcR = VIRTUAL.hussain_sagar_centre.real, hcW = VIRTUAL.hussain_sagar_centre.world;
  add('structure', 'tank-bund-east-shore', 'Tank Bund is on the east (south-east) shore: the lake lies on its north-west side', sideOf(tbR, hcR) === sideOf(tbW, hcW),
    `lake centre on side ${sideOf(tbR, hcR)} real, ${sideOf(tbW, hcW)} world`);
  // Lower Tank Bund below the bund (east / south-east of it)
  const ltR = ROADS_BY.get('lower_tank_bund').pts.map((p) => rxy(p[0], p[1])), ltW = WROAD.get('lower_tank_bund').pts;
  const midR = ltR[Math.floor(ltR.length / 2)], midW = ltW[Math.floor(ltW.length / 2)];
  add('structure', 'lower-tank-bund-side', 'Lower Tank Bund runs below the bund on the side away from the lake', sideOf(tbR, midR) === sideOf(tbW, midW) && sideOf(tbW, midW) !== sideOf(tbW, hcW),
    `side real ${sideOf(tbR, midR)}, world ${sideOf(tbW, midW)}; lake side ${sideOf(tbW, hcW)}`);
  // Necklace Road: curve, side of the lake
  const nrR = ROADS_BY.get('necklace_rd').pts.map((p) => rxy(p[0], p[1])), nrW = WROAD.get('necklace_rd').pts;
  const turn = (l) => { let t = 0; for (let i = 2; i < l.length; i++) { const a = bearing(l[i - 2], l[i - 1]), b = bearing(l[i - 1], l[i]); if (dist(l[i - 2], l[i - 1]) > 1 && dist(l[i - 1], l[i]) > 1) t += angDiff(a, b); } return t; };
  add('structure', 'necklace-curve', 'Necklace Road curves around the lake (same total turn as the real road)', Math.sign(turn(nrR)) === Math.sign(turn(nrW)) && Math.abs(turn(nrR) - turn(nrW)) < 35,
    `total turn real ${r0(turn(nrR))}°, world ${r0(turn(nrW))}°; chord real ${r0(ch(nrR))}°, world ${r0(ch(nrW))}°`);
  add('structure', 'necklace-side', 'Necklace Road keeps the lake on the same hand as in reality (west and south shore)', sideOf(nrR, hcR) === sideOf(nrW, hcW),
    `lake centre side real ${sideOf(nrR, hcR)}, world ${sideOf(nrW, hcW)}`);
  // the Musi crosses the city west -> east
  const mw = D.water.find((w) => w.id === 'musi').poly, mb = G.bbox(mw);
  add('structure', 'musi-w-e', 'the Musi crosses the whole map from west to east', mb[0] < 300 && mb[2] > D.size[0] - 300, `world river x ${r0(mb[0])}..${r0(mb[2])} of ${D.size[0]}`);
  // the river passes between the Old City and Abids/Koti
  const yAt = (x) => { let best = null; for (let i = 0; i + 1 < musiW.length; i++) { const a = musiW[i], b = musiW[i + 1]; if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) { const y = a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]); if (best == null || y < best) best = y; } } return best; };
  const cw = worldPt('charminar'), aw = worldPt('abids'), kw = worldPt('koti');
  add('structure', 'musi-between', 'the Musi runs between Charminar (south) and Abids / Koti (north)', yAt(cw[0]) < cw[1] && yAt(aw[0]) > aw[1] && yAt(kw[0]) > kw[1],
    `river y at Charminar ${r0(yAt(cw[0]))} (Charminar ${cw[1]}), at Abids ${r0(yAt(aw[0]))} (Abids ${aw[1]}), at Koti ${r0(yAt(kw[0]))} (Koti ${kw[1]})`);
  // Charminar is the heart of the Old City: it sits in its own district, the Old City districts surround it
  const cd = worldDistrict(cw[0], cw[1]);
  add('structure', 'charminar-district', 'Charminar stands in the Charminar (Old City) district', cd === 'charminar', `world district ${cd}`);
  // distances at city scale (relative): Golconda is "far west", HITEC "far north-west"
  const dW = (a, b) => dist(worldPt(a), worldPt(b)), dR = (a, b) => dist(realPt(a), realPt(b));
  const ratioCheck = (a, b, c, d, text) => {
    const rR = dR(a, b) / dR(c, d), rW = dW(a, b) / dW(c, d);
    add('structure', `ratio:${a}|${b}|${c}|${d}`, text, Math.abs(rW / rR - 1) < 0.35, `real ratio ${r1(rR * 100) / 100}, world ${r1(rW * 100) / 100} (${rW > rR ? '+' : ''}${r0((rW / rR - 1) * 100)}%)`);
  };
  ratioCheck('charminar', 'golconda_bala_hissar', 'charminar', 'secunderabad_station', 'Golconda is about as far from Charminar as Secunderabad station is (ratio kept within 35 %)');
  ratioCheck('charminar', 'cyber_towers', 'charminar', 'secunderabad_station', 'Cyber Towers is about twice as far from Charminar as Secunderabad station (ratio kept within 35 %)');
  ratioCheck('charminar', 'dilsukhnagar_sai_temple', 'charminar', 'abids', 'Dilsukhnagar vs Abids distance from Charminar (ratio kept within 35 %)');
  ratioCheck('abids', 'koti', 'abids', 'nampally_station', 'Koti vs Nampally distance from Abids (ratio kept within 35 %)');
  ratioCheck('hussain_sagar_centre', 'begumpet_airport', 'hussain_sagar_centre', 'secunderabad_clock_tower', 'Begumpet airport vs Clock Tower distance from the lake (ratio kept within 35 %)');
}

// 9. road alignments: the map road follows the real (OSM) line, and the real street exists in the map along it
{
  const anchors = Object.values(D.clusters || {}).map((c) => c.anchor).filter(Boolean);
  const nearCluster = (p) => anchors.some((a) => Math.hypot(a[0] - p[0], a[1] - p[1]) < 300);
  const allRoads = D.roads;
  const SH = new G.SegHash(64); for (const r of allRoads) SH.add(r.pts, r);
  const pct = (a, q) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
  const ROADSTAT = [];
  for (const r of ROADS) {
    const piece = new RegExp('^' + r.id + '(_\\d+|_bridge\\d*)?$');
    const own = D.roads.filter((w) => piece.test(w.id));
    if (!own.length) continue;
    const outside = r.pts.filter((p) => !GEO.inFrame(p[0], p[1])).length;
    if (outside * 2 > r.pts.length) continue; // mostly beyond the frame: an edge spur
    if (own.every((w) => w.src === 'cluster')) continue; // hand-made layout moved as a block (by design)
    const ideal = GEO.projectLine(r.pts, { maxSegM: 10 });
    const mid = r.pts[Math.floor(r.pts.length / 2)], upm = GEO.scaleAt(mid[0], mid[1]).upm;
    const ic = G.cum(ideal), L = ic[ic.length - 1];
    const out = [];
    for (const w of own) {
      if (w.src === 'cluster') continue;
      for (const p of G.resample(w.pts, 10)) {
        if (nearCluster(p)) continue;
        const q = G.nearestOnLine(ideal, p[0], p[1], ic);
        if (q.along < 1 || q.along > L - 1) continue; // past the real end: a join to a neighbour or an estimated continuation
        out.push(q.d / upm);
      }
    }
    const inn = [];
    for (const p of G.resample(ideal, 10)) {
      if (p[0] < 5 || p[1] < 5 || p[0] > D.size[0] - 5 || p[1] > D.size[1] - 5 || nearCluster(p)) continue;
      const n = SH.nearest(p[0], p[1], 400); inn.push(n ? Math.sqrt(n.q.d2) / upm : 400 / upm);
    }
    if (!out.length && !inn.length) continue;
    const o95 = pct(out, 0.95), oMax = pct(out, 1), i95 = pct(inn, 0.95), iMax = pct(inn, 1);
    const pass = o95 <= 25 && oMax <= 60 && i95 <= 25 && iMax <= 60;
    ROADSTAT.push({ id: r.id, o95, oMax, i95, iMax });
    add('roads', `road:${r.id}`, `${r.name} (\`${r.id}\`, ${r.kind}, ${r.confidence}) follows its real alignment`, pass,
      `map road off the real line: p95 ${r0(o95)} m, max ${r0(oMax)} m; real line off the map network: p95 ${r0(i95)} m, max ${r0(iMax)} m`);
  }
  REL.roadStat = ROADSTAT;
}

/* ------------------------------------------------------------------ displacement of the well-known places */
const DISP = [];
for (const id of WKOK) {
  if (VIRTUAL[id]) continue;
  const e = PJ[id], ip = GEO.project(e.lat, e.lon), wp = worldPt(id);
  const upm = GEO.scaleAt(e.lat, e.lon).upm, du = dist(ip, wp);
  DISP.push({ id, name: nameOf(id), conf: e.confidence, du: r0(du), dm: r0(du / upm), src: LM.get(id) ? 'landmark' : 'place', cluster: (LM.get(id) || {}).cluster || '' });
}
DISP.sort((a, b) => b.dm - a.dm);

/* ------------------------------------------------------------------ output */
const CATS = ['compass', 'closer', 'order', 'bridges', 'stations', 'banks', 'district', 'roads', 'structure'];
const stat = (rels) => { const o = {}; for (const c of CATS) { const r = rels.filter((x) => x.cat === c); o[c] = { n: r.length, pass: r.filter((x) => x.pass).length }; } const n = rels.length, p = rels.filter((x) => x.pass).length; o.all = { n, pass: p }; return o; };
const S = stat(REL);
const result = { file: path.relative(ROOT, FILE), generated: new Date().toISOString(), stats: S, relations: REL.map((r) => ({ cat: r.cat, key: r.key, text: r.text, pass: r.pass, detail: r.detail })), displacement: DISP };
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 1));
const pct = (o) => (o.n ? `${o.pass}/${o.n} (${r1((o.pass / o.n) * 100)} %)` : '-');
console.log(`verify_geo: ${path.relative(ROOT, FILE)}`);
for (const c of CATS.concat(['all'])) console.log(`  ${c.padEnd(10)} ${pct(S[c])}`);
const fails = REL.filter((r) => !r.pass);
if (argv.includes('--fails')) for (const f of fails) console.log(`FAIL [${f.cat}] ${f.text} — ${f.detail}`);

if (REPORT) {
  const before = BEFORE ? JSON.parse(fs.readFileSync(BEFORE, 'utf8')) : null;
  const bmap = before ? new Map(before.relations.map((r) => [r.key, r])) : null;
  const L = [];
  const mark = (p) => (p ? 'pass' : '**FAIL**');
  L.push('# Map v2 geography verification');
  L.push('');
  L.push(`Generated by \`node tools/geo/verify_geo.cjs\` on ${result.generated.slice(0, 10)} against \`${result.file}\`${before ? ` (before: \`${before.file}\` as of ${before.generated.slice(0, 16).replace('T', ' ')} UTC)` : ''}.`);
  L.push('Every relation is generated from the real data in `design/geo/` (places.json lat/lon, roads.json, water.json, rail.json,');
  L.push('districts.json) and tested on the positions the map builder actually wrote into worlddata.js: landmark centres where the');
  L.push('id is a landmark, otherwise the place point (entrance). Re-run the command after every map build.');
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push(before ? '| category | what is tested | before | after |' : '| category | what is tested | result |');
  L.push(before ? '|---|---|---|---|' : '|---|---|---|');
  const WHAT = {
    compass: `B lies in compass sector S of A (8 sectors); ${REL.compassSkipped} pairs within ${AMBIG}° of a sector boundary make no claim`,
    closer: 'A is closer to B than to C (real ratio at least 1.3)',
    order: 'order of places along real roads, the Tank Bund statues, and multi-road corridors',
    bridges: 'every Musi crossing in roads.json exists in the map, and their order from west to east',
    stations: 'station order along each railway service, the track passes every station, stations stand beside the track',
    banks: 'which bank of the Musi a place is on (places 60-1500 m from the river)',
    district: `which ward-based district a place lies in (${REL.districtSkipped} places within 60 m of a district edge not claimed)`,
    roads: 'each curated road (roads.json, OSM) follows its real alignment both ways: p95 within 25 m (half a game road) and max within 60 m (hand-made cluster layouts excluded)',
    structure: 'lake, Buddha, Tank Bund, Lower Tank Bund, Necklace Road, the Musi, Charminar district, Golconda gate, edge signposts, city-scale distance ratios',
  };
  for (const c of CATS.concat(['all'])) L.push(before ? `| ${c} | ${WHAT[c] || 'all relations'} | ${pct(before.stats[c])} | ${pct(S[c])} |` : `| ${c} | ${WHAT[c] || 'all relations'} | ${pct(S[c])} |`);
  L.push('');
  if (typeof REPORT_PREFACE !== 'undefined') L.push(REPORT_PREFACE);
  const pre = path.join(ROOT, 'design/geo/verify_notes.md');
  if (fs.existsSync(pre)) { L.push(fs.readFileSync(pre, 'utf8').trim()); L.push(''); }
  L.push('## Displacement of well-known places');
  L.push('');
  L.push('Distance between the map position and the ideal projection of the real lat/lon, in world units and in real metres at');
  L.push('the local scale. Clusters are hand-made layouts moved as one block (their anchor is placed, the rest keeps its layout).');
  L.push('');
  L.push('| place | conf | in map as | cluster | off by (u) | off by (m) |');
  L.push('|---|---|---|---|---|---|');
  for (const d of DISP) L.push(`| ${d.name} (\`${d.id}\`) | ${d.conf} | ${d.src} | ${d.cluster} | ${d.du} | ${d.dm} |`);
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  L.push('');
  L.push(`Median ${med(DISP.map((d) => d.dm))} m, worst ${DISP[0] ? DISP[0].dm : 0} m over ${DISP.length} well-known places.`);
  L.push('');
  const TITLES = { compass: 'Compass sectors', closer: 'Which is closer', order: 'Order along roads and corridors', bridges: 'Musi crossings, west to east', stations: 'Railway stations', banks: 'Musi banks', district: 'Districts', roads: 'Road alignments', structure: 'Structure of the city' };
  for (const c of CATS) {
    const rs = REL.filter((r) => r.cat === c);
    L.push(`## ${TITLES[c]} (${pct(S[c])})`);
    L.push('');
    if (c === 'bridges') {
      L.push('Musi crossings found in roads.json, sorted west to east along the real river:');
      L.push('');
      L.push('| # | crossing | road id | real km down the river | map crossing (u) | conf |');
      L.push('|---|---|---|---|---|---|');
      REL.bridges.forEach((x, i) => L.push(`| ${i + 1} | ${x.name} | \`${x.id}\` | ${r1(x.s / 1000)} | ${x.w ? `${r0(x.w.x)}, ${r0(x.w.y)}` : 'none'} | ${x.conf || ''} |`));
      L.push('');
    }
    L.push(before ? '| relation | before | after | detail (after) |' : '| relation | result | detail |');
    L.push(before ? '|---|---|---|---|' : '|---|---|---|');
    const sorted = rs.slice().sort((a, b) => (a.pass === b.pass ? 0 : a.pass ? 1 : -1));
    for (const r of sorted) {
      const b = bmap && bmap.get(r.key);
      L.push(before ? `| ${r.text} | ${b ? mark(b.pass) : 'new'} | ${mark(r.pass)} | ${r.detail} |` : `| ${r.text} | ${mark(r.pass)} | ${r.detail} |`);
    }
    if (before) {
      const gone = before.relations.filter((r) => r.cat === c && !REL.some((x) => x.key === r.key));
      for (const r of gone) L.push(`| ${r.text} | ${mark(r.pass)} | (no longer generated) | ${r.detail} |`);
    }
    L.push('');
  }
  fs.writeFileSync(REPORT, L.join('\n') + '\n');
  console.log(`report: ${path.relative(ROOT, REPORT)}`);
}
