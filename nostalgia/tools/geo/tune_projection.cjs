#!/usr/bin/env node
/* NOSTALGIA — tools/geo/tune_projection.cjs
 * Coordinate-descent search over the warp parameters of tools/geo/project.cjs.
 * Objective (lower is better):
 *   bearing errors between neighbouring places (6 nearest within 1.5 km, warp pairs only):
 *     6 * max(0, maxErr - LIMIT) + 3 * max(0, p99 - P99) + 0.5 * mean
 *   + 40 * sum of room shortfalls below the per-place targets in u/m (TARGETS below), in base-scale units
 *   + 200 * folds (negative cells on a coarse grid)
 * Prints the best parameter set as JSON; paste it into PARAMS in project.cjs.
 * Usage: node tools/geo/tune_projection.cjs [--preset 15000x11250 | --world WxH] [--sweeps 6] [--limit 14] [--p99 10] [--eval]
 *   --preset starts from a preset of project.cjs (default: the chosen one); --world rescales it to another size;
 *   --eval only prints the objective.
 */
'use strict';
const path = require('path');
const G = require('./project.cjs');
const C = require('./check_projection.cjs');

const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const SWEEPS = argv('--sweeps', 6), LIMIT = argv('--limit', 14), P99 = argv('--p99', 10);

// room targets in world units per real metre (u/m) at sample places: [id, target]. They come from the footprint
// test (check_projection.cjs footprintNeeds: e.g. Mecca Masjid / Chowmahalla need 1.02 u/m with a 12 u gap) plus
// margin for plazas, Laad Bazaar's shop row and the real lane spacing; the same targets serve every world size.
const TARGETS = {
  old_city: [['charminar', 1.15], ['mecca_masjid', 1.125], ['gulzar_houz', 1.125], ['chowmahalla_palace', 1.025], ['madina_building', 1.025], ['laad_bazaar', 1.125], ['pathergatti', 1.05]],
  musi: [['salar_jung_museum', 0.85], ['osmania_hospital', 0.85], ['afzalgunj_bridge', 0.85], ['high_court', 0.85]],
  abids_koti: [['abids', 0.9], ['koti_bus_stand', 0.875], ['sultan_bazaar', 0.875], ['nampally_station', 0.75], ['mozamjahi_market', 0.875]],
  himayatnagar: [['home', 0.925], ['narayanguda_ymca', 0.8], ['liberty_theatre', 0.775]],
  tank_bund: [['tank_bund', 0.775], ['lumbini_park', 0.75], ['secretariat', 0.725]],
  secunderabad: [['secunderabad_clock_tower', 0.775], ['secunderabad_station', 0.75], ['monda_market', 0.75]],
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }
const inp = C.loadInputs();
// neighbour pairs are fixed (real positions do not change): precompute once
const P0 = G;
const PPreal = C.projPlaces(P0, inp.places);
const list = Object.values(PPreal).filter((p) => !p.e.alias);
const pairs = [];
{
  const seen = new Set();
  for (const a of list) {
    const near = [];
    for (const b of list) { if (a === b) continue; const d = Math.hypot(a.r[0] - b.r[0], a.r[1] - b.r[1]); if (d >= 20 && d <= 1500) near.push([d, b]); }
    near.sort((x, y) => x[0] - y[0]);
    for (const [, b] of near.slice(0, 6)) {
      const k = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
      if (seen.has(k)) continue; seen.add(k);
      if (!!a.e.anchor_latlon !== !!b.e.anchor_latlon) continue;
      if (!P0.inFrame(a.e.lat, a.e.lon) || !P0.inFrame(b.e.lat, b.e.lon)) continue;
      pairs.push([a, b, Math.atan2(b.r[0] - a.r[0], b.r[1] - a.r[1])]);
    }
  }
}
const ids = [...new Set(pairs.flatMap((p) => [p[0].id, p[1].id]))];

function evaluate(params, verbose) {
  const P = G.create(params);
  P.init();
  const W = {};
  for (const id of ids) W[id] = P.placeWorld(inp.places[id]);
  const errs = [];
  for (const [a, b, br] of pairs) {
    const wa = W[a.id], wb = W[b.id];
    let e = Math.atan2(wb[0] - wa[0], -(wb[1] - wa[1])) - br;
    while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI;
    errs.push(Math.abs(e) * 180 / Math.PI);
  }
  errs.sort((x, y) => x - y);
  const max = errs[errs.length - 1], p99 = errs[Math.floor(0.99 * errs.length)], mean = errs.reduce((s, v) => s + v, 0) / errs.length;
  let short = 0; const ms = {};
  for (const [core, list2] of Object.entries(TARGETS)) for (const [id, t] of list2) {
    const e = inp.places[id]; if (!e) continue;
    const m = P.scaleAt(e.lat, e.lon).m, upm = m * P.BASE_UPM; ms[id] = m;
    short += Math.max(0, t - upm) / P.BASE_UPM; // shortfall in units of the base scale
  }
  // coarse fold check
  let folds = 0;
  const g = C.gridCheck(P, 150); folds = g.negTriangles;
  const f = 6 * Math.max(0, max - LIMIT) + 3 * Math.max(0, p99 - P99) + 0.5 * mean + 40 * short + 200 * folds;
  if (verbose) console.log(`f ${f.toFixed(3)}  max ${max.toFixed(1)} p99 ${p99.toFixed(1)} mean ${mean.toFixed(2)} short ${short.toFixed(3)} folds ${folds} fieldMax ${g.maxBearing.toFixed(1)} minAniso ${g.minAniso.toFixed(2)}\n   ` + Object.entries(ms).map(([k, v]) => k + ' ' + v.toFixed(2)).join(', '));
  return { f, max, p99, mean, short, ms };
}

// parameter vector: [getter/setter, step, min, max]
let stepScale = 1;
function knobs(params) {
  const K = [];
  const add = (obj, key, step, lo, hi, label) => K.push({ obj, key, step: step * stepScale, lo, hi, label });
  const all = params.cores.concat(params.plateau ? [params.plateau] : [], params.sinks || []);
  for (const c of all) {
    const id = c.id || 'plateau';
    if (c.a < 0) add(c, 'a', 0.1, -0.9, -0.01, id + '.a');
    else add(c, 'a', 0.25 * c.a + 0.1, 0.05, 30, id + '.a');
    add(c, 's', 0.15 * c.s, 150, 8000, id + '.s');
    add(c, 'p', 0.1, 0.3, 1.6, id + '.p');
    add(c, 'lat', 0.0015, c.lat - 0.01, c.lat + 0.01, id + '.lat');
    add(c, 'lon', 0.0015, c.lon - 0.01, c.lon + 0.01, id + '.lon');
  }
  add(params, 'gain', 0.05, 0.4, 1.2, 'gain');
  return K;
}

function tune(start) {
  let best = clone(start), bestR = evaluate(best, true);
  for (let sw = 0; sw < SWEEPS; sw++) {
    const K = knobs(best);
    let improved = false;
    for (let ki = 0; ki < K.length; ki++) {
      for (const dir of [1, -1]) {
        const trial = clone(best), Kt = knobs(trial)[ki];
        const v = Kt.obj[Kt.key] + dir * K[ki].step;
        if (v < K[ki].lo || v > K[ki].hi) continue;
        Kt.obj[Kt.key] = v;
        const r = evaluate(trial);
        if (r.f < bestR.f - 1e-4) { best = trial; bestR = r; improved = true; process.stdout.write(`  ${K[ki].label} -> ${v.toFixed(4)}  f ${r.f.toFixed(3)} (max ${r.max.toFixed(1)} p99 ${r.p99.toFixed(1)} short ${r.short.toFixed(3)})\n`); break; }
      }
    }
    console.log(`sweep ${sw + 1}:`); evaluate(best, true);
    if (!improved) { stepScale *= 0.5; console.log('step scale', stepScale); if (stepScale < 0.1) break; }
  }
  return best;
}

// --world WxH: same frame, bigger/smaller world (base scale W / 24000 u/m); the targets keep their
// absolute u/m, so relative targets scale by 12000 / W
function withWorld(params, spec) {
  const [w, h] = spec.split('x').map(Number);
  const p = clone(params);
  p.world = { w, h }; p.baseUnitsPerMetre = w / 24000;
  p.grid = { nx: Math.round((256 * w) / 12000 / 16) * 16, ny: Math.round((192 * w) / 12000 / 16) * 16 };
  const k = 12000 / w;
  for (const c of p.cores.concat([p.plateau])) c.a *= k * k; // rough start: smaller relative magnification
  return p;
}

if (require.main === module) {
  let start = clone(G.PARAMS);
  const pi = args.indexOf('--preset');
  if (pi >= 0) start = clone(G.PRESETS[args[pi + 1]]);
  const wi = args.indexOf('--world');
  if (wi >= 0) start = withWorld(start, args[wi + 1]);
  if (args.includes('--eval')) { evaluate(start, true); process.exit(0); }
  const best = tune(start);
  for (const c of best.cores.concat(best.plateau ? [best.plateau] : [], best.sinks || [])) {
    for (const k of ['a', 's', 'p']) c[k] = +(+c[k]).toFixed(k === 's' ? 0 : 3);
    c.lat = +c.lat.toFixed(4); c.lon = +c.lon.toFixed(4);
  }
  best.gain = +best.gain.toFixed(3);
  console.log(JSON.stringify({ world: best.world, baseUnitsPerMetre: best.baseUnitsPerMetre, grid: best.grid, cores: best.cores, plateau: best.plateau, sinks: best.sinks, gain: best.gain }, null, 1));
}
module.exports = { evaluate, TARGETS };
