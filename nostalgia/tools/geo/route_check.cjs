#!/usr/bin/env node
/* NOSTALGIA — tools/geo/route_check.cjs   (Map v2 QA: road-network connectivity as the game sees it)
 *
 * Builds the real engine world in node (src/core.js + render.js + world.js + world_extras.js, no browser) from a
 * map file and routes over N.world.roads with N.world.roads.route() (walkers' rules: every incident edge, lanes
 * cost x1.15). Reports the detour ratio (route length / straight distance between the end nodes) of
 *   - the story's key trips (home -> Charminar, Koti -> Charminar, Charminar -> Golconda, ...), and
 *   - 400 random pairs of curated-road nodes 1.2-6 ku apart (fixed seed),
 * plus the node / edge / dead-end counts and the A* work (nodes expanded) of the longest trips.
 * The real city's detour ratio is ~1.2-1.4; the first Map v2 build had a median of 1.44 and p90 2.18 because
 * ~2,000 road ends stopped just short of the road they meet (fixed by tools/geo/near_miss.cjs: 1.27 / 1.50).
 *
 * Usage: node tools/geo/route_check.cjs [--file path/to/worlddata.js] [--json]
 * Exit code 1 when: the random-pair median > 1.35, p90 > 1.75, any key trip > 2.0 or unreachable.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const fileArg = argv.indexOf('--file') >= 0 ? path.resolve(argv[argv.indexOf('--file') + 1]) : path.join(ROOT, 'src/worlddata.js');

function buildWorld(dataFile) {
  const fakeCtx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (t[k] = () => ({ addColorStop() {} }))), set: (t, k, v) => { t[k] = v; return true; } });
  const g = global;
  g.window = g; g.performance = require('perf_hooks').performance;
  g.document = {
    createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => fakeCtx(), addEventListener() {} }),
    getElementById: () => null, addEventListener() {},
    body: { classList: { contains: () => false, add() {}, remove() {} }, prepend() {} },
  };
  g.addEventListener = () => {}; g.location = { hash: '' }; g.devicePixelRatio = 1; g.innerWidth = 1280; g.innerHeight = 720;
  g.requestAnimationFrame = () => 0; g.Path2D = function () { return fakeCtx(); }; g.HTMLCanvasElement = function () {};
  const load = (f) => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
  load('src/core.js'); load('src/render.js');
  g.N.render.ctx = fakeCtx();
  vm.runInThisContext(fs.readFileSync(dataFile, 'utf8'), { filename: 'worlddata.js' });
  load('src/world.js'); load('src/world_extras.js');
  g.N.world.build();
  return g.N;
}

const KEY = [
  ['home', 'charminar'], ['home', 'tank_bund'], ['home', 'secunderabad_station'], ['home', 'abids'], ['koti_bus_stand', 'charminar'],
  ['charminar', 'golconda_fort'], ['charminar', 'salar_jung_museum'], ['nampally_station', 'charminar'], ['home', 'cyber_towers'],
  ['home', 'begumpet_airport'], ['abids', 'mehdipatnam_bus_terminus'], ['mehdipatnam_bus_terminus', 'golconda_fort'],
  ['home', 'osmania_university'], ['home', 'dilsukhnagar_sai_temple'], ['charminar', 'falaknuma_palace'], ['home', 'lb_stadium'],
  ['tank_bund', 'secunderabad_station'], ['home', 'khairatabad_ganesh'],
];

function main() {
  const N = buildWorld(fileArg);
  const W = N.world, R = W.roads, D = N.WORLD_DATA, nodes = R.nodes, edges = R.edges;
  if (typeof R.route !== 'function') { console.error('N.world.roads.route() missing (world.js too old)'); process.exit(2); }
  const P = (id) => D.landmarks.find((l) => l.id === id) || D.places.find((p) => p.id === id);
  const lenOf = (path2) => { let L = 0; for (let i = 1; i < path2.length; i++) L += Math.hypot(path2[i].x - path2[i - 1].x, path2[i].y - path2[i - 1].y); return L; };
  const out = { file: path.relative(ROOT, fileArg), nodes: nodes.length, edges: edges.length, deadEnds: nodes.filter((n) => n.inc.length === 1).length, key: [], random: null, fails: [] };
  for (const [a, b] of KEY) {
    const A = P(a), B = P(b);
    if (!A || !B) { out.key.push({ trip: a + ' -> ' + b, missing: true }); continue; }
    const na = R.nearestNode(A.x, A.y), nb = R.nearestNode(B.x, B.y);
    const t0 = Date.now(), p = R.route(na, nb, { walk: true }), ms = Date.now() - t0;
    const st = Math.hypot(na.x - nb.x, na.y - nb.y) || 1;
    const row = { trip: a + ' -> ' + b, straight: Math.round(st), route: p ? Math.round(lenOf(p)) : null, ratio: p ? +(lenOf(p) / st).toFixed(2) : null, expanded: (R.routeStats() || {}).expanded, ms };
    out.key.push(row);
    if (!p) out.fails.push('unreachable: ' + row.trip); else if (row.ratio > 2.0) out.fails.push('detour ' + row.ratio + 'x: ' + row.trip);
  }
  // random pairs of nodes on curated roads (not the OSM infill)
  const cur = nodes.filter((n) => n.inc.some((e) => { const s = edges[e].road.src; return s !== 'osm' && s !== 'grid'; }));
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ratios = [], worst = [];
  for (let k = 0, tries = 0; k < 400 && tries < 20000; tries++) {
    const a = cur[(rnd() * cur.length) | 0], b = cur[(rnd() * cur.length) | 0], st = Math.hypot(a.x - b.x, a.y - b.y);
    if (st < 1200 || st > 6000) continue;
    k++;
    const p = R.route(a, b, { walk: true });
    if (!p) { worst.push([Infinity, [Math.round(a.x), Math.round(a.y)], [Math.round(b.x), Math.round(b.y)]]); continue; }
    const q = lenOf(p) / st; ratios.push(q); worst.push([+q.toFixed(2), [Math.round(a.x), Math.round(a.y)], [Math.round(b.x), Math.round(b.y)]]);
  }
  ratios.sort((x, y) => x - y); worst.sort((x, y) => y[0] - x[0]);
  const pct = (f) => +ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * f))].toFixed(2);
  out.random = { pairs: ratios.length, unreachable: worst.filter((w) => w[0] === Infinity).length, median: pct(0.5), p90: pct(0.9), p99: pct(0.99), over18: ratios.filter((q) => q > 1.8).length, worst: worst.slice(0, 6) };
  if (out.random.median > 1.35) out.fails.push('random-pair median detour ' + out.random.median + ' > 1.35');
  if (out.random.p90 > 1.75) out.fails.push('random-pair p90 detour ' + out.random.p90 + ' > 1.75');
  if (out.random.unreachable) out.fails.push(out.random.unreachable + ' random pairs unreachable');
  if (argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
  else {
    console.log('map ' + out.file + ': ' + out.nodes + ' road nodes, ' + out.edges + ' edges, ' + out.deadEnds + ' dead-end nodes');
    for (const r of out.key) console.log('  ' + r.trip.padEnd(44) + (r.missing ? 'missing' : (r.ratio == null ? 'UNREACHABLE' : r.ratio.toFixed(2) + 'x  (' + r.straight + ' u straight, ' + r.route + ' u by road, ' + r.expanded + ' nodes expanded)')));
    const q = out.random;
    console.log('  random curated pairs (' + q.pairs + ', 1.2-6 ku): median ' + q.median + ', p90 ' + q.p90 + ', p99 ' + q.p99 + ', > 1.8x: ' + q.over18 + ', unreachable ' + q.unreachable);
    console.log(out.fails.length ? 'FAIL: ' + out.fails.join('; ') : 'OK');
  }
  process.exitCode = out.fails.length ? 1 : 0;
}
main();
