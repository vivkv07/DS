#!/usr/bin/env node
/* NOSTALGIA — tools/geo/extract_osm.cjs   (map builder v2; node >= 22.5, no npm deps)
 *
 * Reads the Geofabrik-style OpenStreetMap layers of the Hyderabad district extract
 * (github.com/shivakumar-ui-max/hyderabad-gis-map, Hyd_city_HYD_gis.zip; data (c) OpenStreetMap
 * contributors, ODbL 1.0) and writes two compact files for tools/geo/build_worlddata.cjs:
 *
 *   design/geo/osm_streets.json   every street centreline (residential, living_street, unclassified,
 *                                 tertiary, secondary, primary, trunk + their links, pedestrian), ways
 *                                 joined into longer strokes where they meet end to end with the same
 *                                 name and class, simplified (Douglas-Peucker 3 m), clipped to the A1 frame.
 *                                 Flyovers / elevated ways (bridge = T with layer >= 1, layer >= 1) and
 *                                 motorways (PVNR expressway, ORR: post-2003) are left out.
 *   design/geo/osm_landuse.json   named parks, grounds, cemeteries, military land, forests (>= 0.2 ha)
 *
 * The zip is untrusted input: unzip it into its own empty directory and pass that directory:
 *   mkdir -p /tmp/osm && unzip -o Hyd_city_HYD_gis.zip -d /tmp/osm
 *   node tools/geo/extract_osm.cjs /tmp/osm
 * Only the geometry blobs and a few attribute columns are read (no code from the data runs).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = process.argv[2];
if (!DIR) { console.error('usage: node tools/geo/extract_osm.cjs <dir with the unzipped .gpkg files>'); process.exit(2); }
const FRAME = { latS: 17.312, latN: 17.475, lonW: 78.335, lonE: 78.561 };
const RAD = Math.PI / 180, MLAT = 110700, MLON = 106260;

/* ---------------------------------------------------------------- GeoPackage geometry -> rings */
function parseGpkg(blob) {
  const b = Buffer.from(blob);
  if (b[0] !== 0x47 || b[1] !== 0x50) return null;
  const flags = b[3], env = (flags >> 1) & 7;
  const envLen = [0, 32, 48, 48, 64][env] || 0;
  return parseWkb(b, 8 + envLen).geom;
}
function parseWkb(b, o) {
  const le = b[o] === 1; o += 1;
  const u32 = () => { const v = le ? b.readUInt32LE(o) : b.readUInt32BE(o); o += 4; return v; };
  const f64 = () => { const v = le ? b.readDoubleLE(o) : b.readDoubleBE(o); o += 8; return v; };
  let type = u32();
  let dims = 2;
  if (type > 1000 && type < 4000) { dims = type >= 3000 ? 4 : 3; type %= 1000; }
  if (type & 0x80000000) { dims = 3; type &= 0xffff; }
  const pt = () => { const x = f64(), y = f64(); for (let k = 2; k < dims; k++) f64(); return [y, x]; }; // [lat, lon]
  const line = () => { const n = u32(), out = []; for (let i = 0; i < n; i++) out.push(pt()); return out; };
  let geom;
  if (type === 1) geom = { t: 'point', c: pt() };
  else if (type === 2) geom = { t: 'lines', c: [line()] };
  else if (type === 3) { const n = u32(), rings = []; for (let i = 0; i < n; i++) rings.push(line()); geom = { t: 'polys', c: [rings] }; }
  else if (type === 5 || type === 6) {
    const n = u32(), parts = [];
    for (let i = 0; i < n; i++) { const r = parseWkb(b, o); o = r.o; parts.push(r.geom); }
    geom = type === 5 ? { t: 'lines', c: parts.flatMap((p) => p.c) } : { t: 'polys', c: parts.flatMap((p) => p.c) };
  } else geom = null;
  return { geom, o };
}

/* ---------------------------------------------------------------- helpers */
const distM = (a, b) => Math.hypot((b[0] - a[0]) * MLAT, (b[1] - a[1]) * MLON);
function dp(pts, tolM) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, z] = st.pop();
    let best = -1, bi = -1;
    const ax = pts[a][1] * MLON, ay = pts[a][0] * MLAT, zx = pts[z][1] * MLON, zy = pts[z][0] * MLAT;
    const dx = zx - ax, dy = zy - ay, l2 = dx * dx + dy * dy || 1e-9;
    for (let i = a + 1; i < z; i++) {
      const px = pts[i][1] * MLON, py = pts[i][0] * MLAT;
      let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(ax + dx * t - px, ay + dy * t - py);
      if (d > best) { best = d; bi = i; }
    }
    if (best > tolM) { keep[bi] = 1; st.push([a, bi], [bi, z]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const lenM = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += distM(pts[i - 1], pts[i]); return s; };
const inFrame = (p) => p[0] >= FRAME.latS && p[0] <= FRAME.latN && p[1] >= FRAME.lonW && p[1] <= FRAME.lonE;
const r5 = (v) => Math.round(v * 1e5) / 1e5;
// clip a polyline to the frame (keeps the inside runs)
function clipLine(pts) {
  const runs = []; let cur = [];
  for (const p of pts) { if (inFrame(p)) cur.push(p); else { if (cur.length > 1) runs.push(cur); cur = []; } }
  if (cur.length > 1) runs.push(cur);
  return runs;
}
function polyAreaM2(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][1] * MLON) * (r[i][0] * MLAT) - (r[i][1] * MLON) * (r[j][0] * MLAT); return Math.abs(s / 2); }

function table(file) {
  const f = fs.readdirSync(DIR).find((n) => n.includes(file) && n.endsWith('.gpkg'));
  if (!f) throw new Error('missing ' + file + '*.gpkg in ' + DIR);
  const db = new DatabaseSync(path.join(DIR, f), { readOnly: true });
  const t = db.prepare('select table_name from gpkg_contents').get().table_name;
  return { db, t };
}

/* ---------------------------------------------------------------- streets */
const KEEP = new Set(['residential', 'living_street', 'unclassified', 'tertiary', 'tertiary_link', 'secondary', 'secondary_link',
  'primary', 'primary_link', 'trunk', 'trunk_link', 'pedestrian']);
const RANK = { trunk: 6, trunk_link: 4, primary: 6, primary_link: 4, secondary: 5, secondary_link: 3, tertiary: 4, tertiary_link: 3,
  unclassified: 2, residential: 2, living_street: 1, pedestrian: 1 };
{
  const { db, t } = table('osm_roads_free');
  const rows = db.prepare(`select osm_id, fclass, name, oneway, layer, bridge, geom from "${t}"`).all();
  const ways = [];
  let skipped = { class: 0, elevated: 0, outside: 0 };
  for (const r of rows) {
    if (!KEEP.has(r.fclass)) { skipped.class++; continue; }
    if ((r.layer | 0) >= 1 || (r.bridge === 'T' && (r.layer | 0) >= 1)) { skipped.elevated++; continue; }
    const g = parseGpkg(r.geom); if (!g || g.t !== 'lines') continue;
    for (const ln of g.c) for (const run of clipLine(ln)) ways.push({ id: String(r.osm_id), c: r.fclass, n: r.name || '', o: r.oneway === 'F' || r.oneway === 'T', b: r.bridge === 'T', p: run });
    if (!g.c.some((ln) => ln.some(inFrame))) skipped.outside++;
  }
  // join ways end to end (same name and class family) into strokes
  const key = (p) => r5(p[0]) + ',' + r5(p[1]);
  const ends = new Map();
  ways.forEach((w, i) => { for (const e of [key(w.p[0]), key(w.p[w.p.length - 1])]) { if (!ends.has(e)) ends.set(e, []); ends.get(e).push(i); } });
  const used = new Uint8Array(ways.length);
  const fam = (c) => c.replace('_link', '');
  const strokes = [];
  const bearing = (a, b) => Math.atan2((b[0] - a[0]) * MLAT, (b[1] - a[1]) * MLON);
  for (let i = 0; i < ways.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const w = ways[i];
    let pts = w.p.slice(), ids = [w.id];
    for (const dir of [1, 0]) { // extend the tail, then the head
      for (;;) {
        const endP = dir ? pts[pts.length - 1] : pts[0];
        const prevP = dir ? pts[pts.length - 2] : pts[1];
        const cand = (ends.get(key(endP)) || []).filter((j) => !used[j] && fam(ways[j].c) === fam(w.c) && ways[j].n === w.n);
        if (!cand.length) break;
        // pick the straightest continuation
        const hb = bearing(prevP, endP);
        let best = -1, bd = 1e9, bpts = null;
        for (const j of cand) {
          let q = ways[j].p; if (key(q[0]) !== key(endP)) q = q.slice().reverse();
          let d = Math.abs(bearing(q[0], q[1]) - hb); if (d > Math.PI) d = 2 * Math.PI - d;
          if (d < bd) { bd = d; best = j; bpts = q; }
        }
        if (bd > (w.n ? 1.4 : 0.7)) break; // unnamed lanes only join straight on
        used[best] = 1; ids.push(ways[best].id);
        pts = dir ? pts.concat(bpts.slice(1)) : bpts.slice(1).reverse().concat(pts);
      }
    }
    const L = lenM(pts);
    if (L < 25) continue;
    strokes.push({ id: ids[0], c: fam(w.c), n: w.n, rank: RANK[w.c] || 1, len: Math.round(L), ...(w.o ? { o: 1 } : {}), ...(w.b ? { b: 1 } : {}), ways: ids.length, p: dp(pts, 3).map((q) => [r5(q[0]), r5(q[1])]) });
  }
  strokes.sort((a, b) => b.rank - a.rank || b.len - a.len);
  const out = {
    meta: {
      title: 'NOSTALGIA Map v2 - OpenStreetMap street centrelines (Hyderabad district extract)',
      generated: new Date().toISOString().slice(0, 10),
      generator: 'tools/geo/extract_osm.cjs',
      source: 'github.com/shivakumar-ui-max/hyderabad-gis-map Hyd_city_HYD_gis.zip, layer gis_osm_roads_free_1 (Geofabrik free-layer schema), extent lon 78.382-78.556 E, lat 17.293-17.484 N',
      license: 'Data (c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)',
      attribution: ['Map reference: DataMeet Municipal Spatial Data (CC BY 4.0) and (c) OpenStreetMap contributors (ODbL)', 'Street centrelines: (c) OpenStreetMap contributors, ODbL 1.0'],
      format: 'strokes: {id (first OSM way id), c (OSM class), n (name), rank (6 trunk/primary .. 1 living street), len (m), o (oneway), b (bridge), ways (joined OSM ways), p: [[lat, lon], ...] Douglas-Peucker 3 m}',
      era_note: 'OSM is a 2026 snapshot. Flyovers (layer >= 1) and motorways (post-2003 expressways) are dropped here; the builder only draws residential infill in districts that were built up by 2003.',
      confidence: 'high for geometry (OSM data); identity/era of each lane not checked one by one',
      skipped,
      counts: { ways: ways.length, strokes: strokes.length },
    },
    strokes,
  };
  fs.writeFileSync(path.join(ROOT, 'design/geo/osm_streets.json'), JSON.stringify(out));
  console.log('streets: ways', ways.length, 'strokes', strokes.length, 'skipped', JSON.stringify(skipped));
}

/* ---------------------------------------------------------------- landuse */
{
  const { db, t } = table('osm_landuse_a_free');
  const rows = db.prepare(`select osm_id, fclass, name, geom from "${t}"`).all();
  const KEEPL = new Set(['park', 'recreation_ground', 'grass', 'cemetery', 'military', 'forest', 'nature_reserve', 'scrub', 'meadow']);
  const items = [];
  for (const r of rows) {
    if (!KEEPL.has(r.fclass)) continue;
    const g = parseGpkg(r.geom); if (!g || g.t !== 'polys') continue;
    for (const rings of g.c) {
      const outer = rings[0]; if (!outer || outer.length < 4) continue;
      if (!outer.some(inFrame)) continue;
      const a = polyAreaM2(outer);
      if (a < 2000 && !r.name) continue;
      items.push({ id: String(r.osm_id), c: r.fclass, n: r.name || '', ha: Math.round(a / 100) / 100, outer: dp(outer, 2).map((q) => [r5(q[0]), r5(q[1])]), ...(rings.length > 1 ? { holes: rings.slice(1).map((h) => dp(h, 2).map((q) => [r5(q[0]), r5(q[1])])) } : {}) });
    }
  }
  items.sort((a, b) => b.ha - a.ha);
  fs.writeFileSync(path.join(ROOT, 'design/geo/osm_landuse.json'), JSON.stringify({
    meta: {
      title: 'NOSTALGIA Map v2 - OpenStreetMap landuse polygons (parks, grounds, cemeteries, military land)',
      generated: new Date().toISOString().slice(0, 10), generator: 'tools/geo/extract_osm.cjs',
      source: 'github.com/shivakumar-ui-max/hyderabad-gis-map Hyd_city_HYD_gis.zip, layer gis_osm_landuse_a_free_1',
      license: 'Data (c) OpenStreetMap contributors, ODbL 1.0', format: '{id, c (class), n (name), ha, outer [[lat, lon]], holes?}',
      confidence: 'high for geometry (OSM data, 2026 snapshot)',
    },
    items,
  }));
  console.log('landuse:', items.length);
}
