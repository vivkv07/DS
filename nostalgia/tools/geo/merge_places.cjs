#!/usr/bin/env node
/* NOSTALGIA — tools/geo/merge_places.cjs
 * Merges the two researchers' coordinate files into design/geo/places.json.
 *   in:  design/geo/places_nw.json (+ places_nw_wards.json)   north / west researcher
 *        design/geo/places_se.json (+ places_se_wards.json)   south / east / centre researcher
 *        design/geo/districts.json (district polygons, for the tie-break)
 *        src/worlddata.js (place districts and aliases)
 *   out: design/geo/places.json = {meta, places: {id: entry}}
 * Rules (in order; the rule used is recorded in entry.merge):
 *   1. only one file has the id -> take it.
 *   2. higher confidence wins (high > medium > low).
 *   3. same confidence:
 *      a. group rules: the Tank Bund furniture (statues, arches, carts, bus stop on the bund) follows
 *         the researcher whose tank_bund won (keeps the row of statues on one line); manual picks
 *         listed in MANUAL with a reason.
 *      b. both 'high' and <= 150 m apart -> midpoint (two data sources that agree).
 *      c. the candidate inside its game district's polygon (districts.json) beats one outside it.
 *      d. a candidate whose source cites data (OSM, DataMeet, Wikipedia, listing, address, plus code,
 *         station list) beats a pure estimate.
 *      e. the researcher whose scope owned the place's game district; shared districts -> NW.
 *   4. aliases (worlddata place.alias) get their target's coordinates.
 * The losing candidate is kept in entry.alt {from, lat, lon, confidence, d_m}.
 * Usage: node tools/geo/merge_places.cjs [--quiet]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const GEO = path.join(ROOT, 'design/geo');
const { loadWorldData } = require(path.join(ROOT, 'tools/validate_map.cjs'));

const RANK = { high: 3, medium: 2, low: 1 };
const NW_SCOPE = new Set(['hitec', 'erragadda', 'begumpet', 'secunderabad', 'marredpally', 'ameerpet', 'jubilee', 'banjara',
  'khairatabad', 'golconda', 'tolichowki', 'masab_tank', 'langar_houz', 'rajendranagar']);
const SE_SCOPE = new Set(['abids', 'afzalgunj', 'amberpet', 'bahadurpura', 'basheerbagh', 'chaderghat', 'chandrayangutta', 'charminar',
  'dabeerpura', 'dilsukhnagar', 'falaknuma', 'himayatnagar', 'kachiguda', 'koti', 'lb_nagar', 'malakpet', 'nampally', 'puranapul',
  'rtc_x', 'saidabad', 'saroornagar', 'zoo']);
// shared by both researchers: hussain_sagar, musheerabad, osmania -> NW by rule 3e
const BUND_GROUP = /^(tank_bund_statue_\d+|tank_bund_statues|kakatiya_arch_[ns]|chai_bandi_6|coconut_cart_[47]|bus_stop_14)$/;
const MANUAL = {
  sanjeevaiah_park: ['nw', 'NW traced the park on the OSM lake polygon (north-shore peninsula); SE put it between the lake and the station'],
  hide_sanjeevaiah_bench: ['nw', 'follows sanjeevaiah_park (the bench is at the lake end of the park)'],
};

function readJSON(f) { return JSON.parse(fs.readFileSync(path.join(GEO, f), 'utf8')); }
function distM(a, b) {
  const R = 6371008.8, rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad), y = (b.lat - a.lat) * rad;
  return Math.round(R * Math.hypot(x, y));
}
function inRing(lat, lon, ring) { // ring [[lat, lon], ...]
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function districtOf(lat, lon, districts) {
  for (const d of districts) for (const p of d.polys) {
    if (inRing(lat, lon, p.outer) && !(p.holes || []).some((h) => inRing(lat, lon, h))) return d.id;
  }
  return null;
}
const DATA_RE = /OSM|OpenStreetMap|datameet|DataMeet|Wikipedia|Wikidata|plus ?code|listing|address|station|tripoint|three ward|Sygic|geohack|PIN/i;
const GENERIC_RE = /^(generic\/fictional|estimated: game position mapped)/;
function evidence(e) { return !GENERIC_RE.test(e.source || '') && DATA_RE.test(e.source || '') ? 1 : 0; }

function merge() {
  const nw = readJSON('places_nw.json'), se = readJSON('places_se.json');
  const nww = readJSON('places_nw_wards.json'), sew = readJSON('places_se_wards.json');
  const districts = readJSON('districts.json').districts;
  const D = loadWorldData();
  const pDistrict = {}, alias = {}, pName = {};
  for (const p of D.places) { pDistrict[p.id] = p.district; pName[p.id] = p.name; if (p.alias) alias[p.id] = p.alias; }
  for (const l of D.landmarks) if (!pName[l.id]) pName[l.id] = l.name;
  const ids = [...new Set([...Object.keys(nw), ...Object.keys(se)])].sort();
  const out = {}, stats = { only_nw: 0, only_se: 0, both: 0, rules: {} };
  const bump = (r) => { stats.rules[r] = (stats.rules[r] || 0) + 1; };
  const tankBundFrom = RANK[nw.tank_bund.confidence] >= RANK[se.tank_bund.confidence] ? 'nw' : 'se';
  for (const id of ids) {
    const a = nw[id], b = se[id];
    let win, lose, rule;
    if (a && !b) { win = ['nw', a]; rule = 'only_nw'; stats.only_nw++; }
    else if (b && !a) { win = ['se', b]; rule = 'only_se'; stats.only_se++; }
    else {
      stats.both++;
      const ra = RANK[a.confidence], rb = RANK[b.confidence], d = distM(a, b);
      const dist = pDistrict[id];
      if (ra !== rb) { win = ra > rb ? ['nw', a] : ['se', b]; rule = 'higher_confidence'; }
      else if (BUND_GROUP.test(id)) { win = tankBundFrom === 'nw' ? ['nw', a] : ['se', b]; rule = 'group:tank_bund'; }
      else if (MANUAL[id]) { win = MANUAL[id][0] === 'nw' ? ['nw', a] : ['se', b]; rule = 'manual: ' + MANUAL[id][1]; }
      else if (a.confidence === 'high' && d <= 150) {
        win = ['both', Object.assign({}, b, {
          lat: +((a.lat + b.lat) / 2).toFixed(6), lon: +((a.lon + b.lon) / 2).toFixed(6),
          source: 'midpoint of two high-confidence values ' + d + ' m apart: NW [' + a.source + '] and SE [' + b.source + ']',
        })];
        rule = 'high_tie_midpoint';
      } else {
        const da = dist && districtOf(a.lat, a.lon, districts) === dist, db = dist && districtOf(b.lat, b.lon, districts) === dist;
        const ea = evidence(a), eb = evidence(b);
        if (da !== db) { win = da ? ['nw', a] : ['se', b]; rule = 'district_polygon'; }
        else if (ea !== eb) { win = ea > eb ? ['nw', a] : ['se', b]; rule = 'data_backed_source'; }
        else if (SE_SCOPE.has(dist) && !NW_SCOPE.has(dist)) { win = ['se', b]; rule = 'scope_owner'; }
        else { win = ['nw', a]; rule = 'scope_owner'; }
      }
      const other = win[0] === 'nw' ? ['se', b] : win[0] === 'se' ? ['nw', a] : null;
      if (other) lose = other;
      else lose = null;
      if (win[0] === 'both') lose = null;
    }
    bump(rule.startsWith('manual') ? 'manual' : rule);
    const from = win[0], e = win[1];
    const ward = from === 'nw' ? nww[id] : from === 'se' ? sew[id] : (sew[id] === nww[id] ? sew[id] : sew[id] + ' / ' + nww[id]);
    const entry = Object.assign({ name: e.name || pName[id] || id }, e, { from, ward, merge: rule });
    if (lose) entry.alt = { from: lose[0], lat: lose[1].lat, lon: lose[1].lon, confidence: lose[1].confidence, d_m: distM(e, lose[1]), source: lose[1].source };
    if (from === 'both') entry.alt = { from: 'nw', lat: a.lat, lon: a.lon, confidence: a.confidence, d_m: distM(a, b), note: 'SE value ' + b.lat + ',' + b.lon };
    if (pDistrict[id]) entry.district = pDistrict[id];
    out[id] = entry;
  }
  // 4. aliases share their target's position
  let aliasFixed = 0;
  for (const id in alias) {
    const t = alias[id];
    if (!out[id] || !out[t]) continue;
    if (out[id].lat !== out[t].lat || out[id].lon !== out[t].lon) {
      const d = distM(out[id], out[t]);
      out[id].alias_moved_m = d;
      out[id].lat = out[t].lat; out[id].lon = out[t].lon; out[id].confidence = out[t].confidence;
      aliasFixed++;
    }
    out[id].alias = t;
  }
  stats.alias_synced = aliasFixed;
  const byConf = { high: 0, medium: 0, low: 0 };
  for (const id in out) byConf[out[id].confidence]++;
  const meta = {
    title: 'NOSTALGIA Map v2 - merged real coordinates of every place / landmark / roof id',
    generated: new Date().toISOString().slice(0, 10),
    generator: 'tools/geo/merge_places.cjs (re-run to regenerate)',
    inputs: ['design/geo/places_nw.json', 'design/geo/places_se.json', 'design/geo/places_nw_wards.json', 'design/geo/places_se_wards.json', 'design/geo/districts.json', 'src/worlddata.js'],
    format: '{id: {name, lat, lon, confidence, source, note, from: nw|se|both, ward, merge: rule, alt?: losing candidate, district?: game district, ...researcher extras (id_kind, anchor, anchor_latlon, anchor_game_u, offset_u, fictional, palace_centroid, stadium_centre, real_site)}}',
    rules: ['only one researcher -> theirs', 'higher confidence wins', 'tie: Tank Bund furniture follows tank_bund; manual picks; two highs <= 150 m -> midpoint; inside the game district polygon; data-cited source over estimate; scope owner (shared districts -> NW)', 'aliases copy their target'],
    colony_rule: 'Entries with anchor + offset_u (Lakshmi Nagar colony, Ashok Nagar terraces, Patang Chacha roof) are fictional layouts in game units: place them in the world at project(anchor_latlon) + offset_u (tools/geo/project.cjs placeWorld()), not by projecting their own lat/lon.',
    confidence_rules: { high: 'from map data or several agreeing sources', medium: 'one source or well known', low: 'estimated' },
    attribution: ['Map reference: DataMeet Municipal Spatial Data (CC BY 4.0) and (c) OpenStreetMap contributors (ODbL)', 'Stations: datameet/railways (CC0)', 'Coordinates also read from Wikipedia/Wikidata (CC BY-SA) via search summaries and public listings, named per entry'],
    counts: { ids: ids.length, by_confidence: byConf, merge: stats },
  };
  return { meta, places: out };
}

if (require.main === module) {
  const res = merge();
  fs.writeFileSync(path.join(GEO, 'places.json'), JSON.stringify(res, null, 1) + '\n');
  if (!process.argv.includes('--quiet')) console.log('places.json:', JSON.stringify(res.meta.counts));
}
module.exports = { merge };
