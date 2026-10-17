#!/usr/bin/env node
/* NOSTALGIA — tools/geo/apply_place_fixes.cjs
 * Applies the verified corrections in design/geo/places_fixes.json to design/geo/places.json (idempotent).
 * Each fix replaces lat / lon / confidence / source of the entry and records the replaced values in entry.fix.prev;
 * aliases of a fixed id (entry.alias) take its new position. tools/geo/merge_places.cjs calls applyFixes() as its last
 * step, so a re-merge keeps the corrections. Usage: node tools/geo/apply_place_fixes.cjs [--dry]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const GEO = path.join(ROOT, 'design/geo');

function applyFixes(places, fixes) {
  fixes = fixes || JSON.parse(fs.readFileSync(path.join(GEO, 'places_fixes.json'), 'utf8')).fixes;
  const changed = [];
  for (const id of Object.keys(fixes)) {
    const e = places[id], f = fixes[id];
    if (!e) { console.warn('places_fixes: no entry ' + id); continue; }
    if (e.lat === f.lat && e.lon === f.lon && e.confidence === f.confidence && e.source === f.source) continue;
    const prev = e.fix && e.fix.prev ? e.fix.prev : { lat: e.lat, lon: e.lon, confidence: e.confidence, source: e.source };
    Object.assign(e, { lat: f.lat, lon: f.lon, confidence: f.confidence, source: f.source });
    e.fix = { by: 'geography verification (design/geo/places_fixes.json)', reason: f.reason, prev };
    changed.push(id);
  }
  for (const id of Object.keys(places)) {
    const e = places[id], t = e.alias && places[e.alias];
    if (!t || !fixes[e.alias]) continue;
    if (e.lat !== t.lat || e.lon !== t.lon || e.confidence !== t.confidence) {
      e.lat = t.lat; e.lon = t.lon; e.confidence = t.confidence;
      e.fix = { by: 'geography verification', reason: `alias of ${e.alias}, which was corrected` };
      changed.push(id);
    }
  }
  return changed;
}

if (require.main === module) {
  const file = path.join(GEO, 'places.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const changed = applyFixes(doc.places);
  if (changed.length && !process.argv.includes('--dry')) {
    doc.meta.fixes = 'design/geo/places_fixes.json applied by tools/geo/apply_place_fixes.cjs (entry.fix keeps the replaced values)';
    const byConf = { high: 0, medium: 0, low: 0 };
    for (const id in doc.places) byConf[doc.places[id].confidence]++;
    if (doc.meta.counts) doc.meta.counts.by_confidence = byConf;
    fs.writeFileSync(file, JSON.stringify(doc, null, 1) + '\n');
  }
  console.log(`places_fixes: ${changed.length ? changed.join(', ') : 'nothing to change'}${process.argv.includes('--dry') ? ' (dry run)' : ''}`);
}
module.exports = { applyFixes };
