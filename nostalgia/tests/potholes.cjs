/* NOSTALGIA — tests/potholes.cjs  (world-engine + potholes agent; amendment A2, Map v2 engine)
 *
 * Part 1 (plain node, no browser; canvas stubbed): builds the live map (src/worlddata.js, Map v2) and the
 * v1 map (design/geo/worlddata_v1.js, 8000 x 6000) each in its own process, and checks
 *   - potholes per road kind / district style / district (printed), densities in the A2 order:
 *     Old City and colony lanes worst, arterials fewer, Tank Bund (bund) few, HITEC almost none
 *   - none on bridges or their joints, none on zebra crossings / in junctions, none near level crossings,
 *     every rim sample on plain ROAD, sizes 3-9 u, no two overlapping
 *   - N.world.potholeAt(x, y): agrees with a brute-force scan on 300k points, < 2 us per call
 *   - deterministic (rebuild = the same potholes), rain-only extras only in the monsoon / rain, wet flags
 *   - every grid sized from the data (v1 8000 x 6000, v2 15000 x 11250), the map's exact districtGrid,
 *     polygon districts (a concave one, one with a hole, a multi-part one, gap filling, labels); build CPU
 *     time (load independent) against the 1.0 s target; BIG=1 adds the v1 map stretched to 15000 x 11250
 *     with its districts as rects and then as polygons (same answers)
 * Part 2 (Playwright, the real game): API present, in-page lookup speed, a cycle ridden through a pothole
 *   fires 'vehicle:pothole' (vehicles.js integration), rain toggles wet potholes, screenshots of a colony
 *   lane, the Old City and an arterial at noon and in the rain (tests/out/potholes_*.png), no errors.
 *
 *   node nostalgia/tests/potholes.cjs            (both parts)
 *   ONLY=node | ONLY=browser                      (one part)
 *   BIG=1                                         (also the v1 map stretched to 15000 x 11250: stress)
 *   DATA=path/to/worlddata.js                     (test another map file, e.g. a Map v2 candidate)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY || '';
const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
// Game-clock waits (robust on a loaded machine, where a wall-clock sleep sees fewer game frames):
// window.__gw(secs) resolves after `secs` of GAME time (N.time.now); while the game clock is stopped
// (title, pause menu) it counts frame time (N.time.real) instead. Both advance only as frames run, so a
// slow machine just takes longer. The wall-clock cap (8x + 5 s) only stops a hung page from hanging the suite.
const GW = () => {
  window.__gw = (secs) => new Promise((res) => {
    let acc = 0, n0 = N.time.now, r0 = N.time.real;
    const t0 = performance.now(), cap = secs * 8000 + 5000;
    (function chk() {
      const dn = N.time.now - n0, dr = N.time.real - r0; n0 = N.time.now; r0 = N.time.real;
      acc += dn > 0 ? dn : dr;
      if (acc >= secs || performance.now() - t0 > cap) res(acc); else requestAnimationFrame(chk);
    })();
  });
};
const gwait = (pg, secs) => pg.evaluate((s) => window.__gw(s), secs);
const info = (msg) => console.log('       ' + msg);

/* ------------------------------------------------------------------ node harness */
function fakeCtx() {
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (t[k] = () => ({ addColorStop() {} }))),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
// The world runs in this process's own global context (a vm context makes every global lookup such as
// `Math` go through an interceptor, which would inflate the build CPU time several fold), so each world
// is built in a child process: `node potholes.cjs --child v1|big`.
function makeEnv(dataFile) {
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
  const data = dataFile || process.env.DATA;
  if (data) vm.runInThisContext(fs.readFileSync(path.resolve(ROOT, data), 'utf8'), { filename: 'worlddata.js' });
  else load('src/worlddata.js');
  return { N: g.N, load };
}
// Test-only: the v1 map stretched by s (positions, roads, water, parks, blocks scale; buildings,
// landmarks and roof groups keep their size and move as one piece) = a stand-in for the bigger v2 world.
function scaleWorld(N, s, poly) {
  const D = N.WORLD_DATA;
  const P = (p) => [p[0] * s, p[1] * s];
  const R4 = (r) => [r[0] * s, r[1] * s, r[2] * s, r[3] * s];
  N.WORLD_W = Math.round(N.WORLD_W * s); N.WORLD_H = Math.round(N.WORLD_H * s);
  D.size = [N.WORLD_W, N.WORLD_H];
  for (const d of D.districts) {
    if (d.rect) d.rect = R4(d.rect);
    if (poly && d.rect) { const [x, y, w, h] = d.rect; d.poly = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; delete d.rect; }
  }
  for (const w of D.water) w.poly = w.poly.map(P);
  for (const p of D.parks) p.poly = p.poly.map(P);
  for (const r of D.roads) r.pts = r.pts.map(P);
  for (const r of D.rails || []) r.pts = r.pts.map(P);
  for (const r of D.rocks) { r.x *= s; r.y *= s; }
  for (const b of D.blocks) b.rect = R4(b.rect);
  for (const b of D.noFill || []) b.rect = R4(b.rect);
  for (const b of D.buildings) b.rect = [b.rect[0] * s, b.rect[1] * s, b.rect[2], b.rect[3]];
  const lmD = {};
  for (const l of D.landmarks) { const dx = l.x * (s - 1), dy = l.y * (s - 1); lmD[l.id] = [dx, dy]; l.x += dx; l.y += dy; if (l.solids) l.solids = l.solids.map((q) => [q[0] + dx, q[1] + dy, q[2], q[3]]); }
  for (const t of D.trees) { t.x *= s; t.y *= s; }
  const gD = {}, rD = {}, pD = {};
  for (const r of D.roofs || []) { const g = r.group || r.id; if (!gD[g]) gD[g] = r.building && lmD[r.building] ? lmD[r.building] : [r.rect[0] * (s - 1), r.rect[1] * (s - 1)]; }
  for (const r of D.roofs || []) {
    const d = gD[r.group || r.id]; rD[r.id] = d;
    r.rect = [r.rect[0] + d[0], r.rect[1] + d[1], r.rect[2], r.rect[3]];
    if (r.solids) r.solids = r.solids.map((q) => [q[0] + d[0], q[1] + d[1], q[2], q[3]]);
    for (const st of r.stairs || []) { st.x += d[0]; st.y += d[1]; if (st.tx != null) { st.tx += d[0]; st.ty += d[1]; } if (st.place) pD[st.place] = d; }
  }
  for (const p of D.planks || []) { const d = rD[p.a] || [0, 0]; p.rect = [p.rect[0] + d[0], p.rect[1] + d[1], p.rect[2], p.rect[3]]; }
  for (const p of D.places) { const d = pD[p.id] || (p.level && rD[p.level]) || (p.roof && rD[p.roof]) || [p.x * (s - 1), p.y * (s - 1)]; p.x += d[0]; p.y += d[1]; pD[p.id] = d; }
  for (const z of D.respect || []) {
    const d = pD[z.place] || [0, 0], T = (q) => [q[0] + d[0], q[1] + d[1]].concat(q.slice(2));
    z.rects = (z.rects || []).map(T); z.forecourt = (z.forecourt || []).map(T); z.polys = (z.polys || []).map((pl) => pl.map(T));
    z.lines = (z.lines || []).map((l) => Object.assign({}, l, { pts: l.pts.map(T) }));
    if (z.gate) z.gate = { x: z.gate.x + d[0], y: z.gate.y + d[1] };
  }
  for (const k of Object.keys(D.spawns || {})) { const sp = D.spawns[k]; const d = k === 'title' ? [sp[0] * (s - 1), sp[1] * (s - 1)] : (pD.home_stairs || [sp[0] * (s - 1), sp[1] * (s - 1)]); D.spawns[k] = [sp[0] + d[0], sp[1] + d[1]]; }
}
function buildTimed(env) {
  const c0 = process.cpuUsage(), t0 = Date.now();
  env.N.world.build();
  const c = process.cpuUsage(c0);
  return { cpu: Math.round((c.user + c.system) / 1000), wall: Date.now() - t0 };
}

function checkPotholes(N, label) {
  const W = N.world, S = N.SURF, PH = W.potholes, POT = W.POTHOLE, D = W.data;
  // generation runs after the build (time-sliced in the game): finish it here
  if (PH.ready || PH.list.length) fail(label + ': potholes made inside the world build (they should be time-sliced after it)');
  const tg = Date.now(); PH.ensure(); const genMs = Date.now() - tg;
  const dryOnly = PH.list.length;
  // the rain-only extras are made the first time the monsoon / rain needs them
  N.flags.rain = true; PH.refresh(); PH.ensure(); N.flags.rain = false; PH.refresh();
  const all = PH.list.slice(), dry = all.filter((p) => !p.rain);
  if (dryOnly !== dry.length) fail(label + ': ' + dryOnly + ' potholes before the first rain, ' + dry.length + ' dry ones after');
  else ok(label + ': generated after the build in ' + genMs + ' ms; rain-only extras made on demand (' + (all.length - dry.length) + '); the dry set did not change');
  ok(label + ': ' + dry.length + ' potholes (+' + (all.length - dry.length) + ' rain-only), ' + PH.patches.length + ' tar patches, generated in ' + PH.stats.ms + ' ms');
  // ---- densities
  const st = PH.stats, per = (k) => (100 * (st.byKind[k] || 0)) / Math.max(1, st.roadLen[k] || 0);
  info('per 100 u of road: ' + Object.keys(st.roadLen).map((k) => k + ' ' + per(k).toFixed(2) + ' (' + Math.round(st.roadLen[k]) + ' u)').join(', '));
  info('by district style: ' + JSON.stringify(st.byStyle));
  info('by district: ' + Object.entries(st.byDistrict).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', '));
  // density per district style and road kind (per 100 u), measured on the roads themselves
  const len = {}, cnt = {};
  for (const r of D.roads) {
    if (!POT.KIND[r.kind] || !r.pts) continue;
    for (let s = 0; s < r.pts.length - 1; s++) {
      const a = r.pts[s], b = r.pts[s + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(L / 50));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, d = W.districtAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        const key = r.kind + ':' + ((d && d.style) || 'none');
        len[key] = (len[key] || 0) + L / n;
      }
    }
  }
  for (const p of dry) { const key = p.kind + ':' + (p.style || 'none'); cnt[key] = (cnt[key] || 0) + 1; }
  const dens = (kind, style) => { const k = kind + ':' + style; return len[k] > 300 ? (100 * (cnt[k] || 0)) / len[k] : null; };
  const rows = [];
  for (const k of Object.keys(len).sort()) if (len[k] > 300) rows.push(k + ' ' + ((100 * (cnt[k] || 0)) / len[k]).toFixed(2));
  info('density kind:style per 100 u: ' + rows.join(', '));
  const laneOld = dens('lane', 'oldcity'), laneCol = dens('lane', 'colony'), art = per('arterial'), str = per('street'), lane = per('lane');
  if (!(lane > str && str > art)) fail(label + ': density order lane > street > arterial broken (' + [lane, str, art].map((v) => v.toFixed(2)).join(' / ') + ')');
  else ok(label + ': lanes ' + lane.toFixed(2) + ' > streets ' + str.toFixed(2) + ' > arterials ' + art.toFixed(2) + ' per 100 u');
  for (const [nm, v] of [['Old City lanes', laneOld], ['colony lanes', laneCol]]) {
    if (v == null) continue;
    if (!(v > art * 2.5)) fail(label + ': ' + nm + ' (' + v.toFixed(2) + ') not much worse than arterials (' + art.toFixed(2) + ')');
    else ok(label + ': ' + nm + ' ' + v.toFixed(2) + ' per 100 u (arterials ' + art.toFixed(2) + ')');
  }
  if (st.roadLen.bund) { const b = per('bund'); if (b > art) fail(label + ': Tank Bund has more potholes than arterials (' + b.toFixed(2) + ')'); else ok(label + ': Tank Bund (bund) ' + b.toFixed(2) + ' per 100 u: few'); }
  let hitLen = 0, hitN = 0;
  for (const k of Object.keys(len)) if (k.endsWith(':hitec')) { hitLen += len[k]; hitN += cnt[k] || 0; }
  if (hitLen > 300) { const h = (100 * hitN) / hitLen; if (h > 0.12) fail(label + ': HITEC roads ' + h.toFixed(3) + ' per 100 u (want almost none)'); else ok(label + ': HITEC roads ' + h.toFixed(3) + ' per 100 u (' + hitN + ' over ' + Math.round(hitLen) + ' u): almost none'); }
  // ---- placement rules
  const bridgeEnds = [];
  for (const r of D.roads) if (r.kind === 'bridge' && r.pts && r.pts.length > 1) bridgeEnds.push(r.pts[0], r.pts[r.pts.length - 1]);
  const juncs = W.junctions || [];
  const zebraAt = (n) => n.inc.some((id) => { const k = W.roads.edges[id].kind; return k !== 'lane' && k !== 'path' && k !== 'bridge'; });
  let bad = { surface: 0, bridge: 0, zebra: 0, size: 0, overlap: 0, rail: 0, kind: 0 };
  const railSegs = [];
  for (const r of D.rails || []) for (let k = 0; k < r.pts.length - 1; k++) railSegs.push([r.pts[k], r.pts[k + 1], (r.w || 16) / 2]);
  const segD = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1; let t = ((x - a[0]) * dx + (y - a[1]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y); };
  for (const p of all) {
    const R = Math.max(p.rx, p.ry);
    if (!(p.rx * 2 >= POT.SIZE[0] * 0.44 && p.rx * 2 <= POT.SIZE[1] + 1e-6 && p.ry <= p.rx + 1e-6)) bad.size++;
    if (!POT.KIND[p.kind] || p.kind === 'bridge') bad.kind++;
    for (let k = 0; k < 16; k++) {
      const t = (k / 16) * Math.PI * 2, u = Math.cos(t) * p.rx, v = Math.sin(t) * p.ry;
      if (W.surfaceAt(p.x + u * p.ca - v * p.sa, p.y + u * p.sa + v * p.ca) !== S.ROAD) { bad.surface++; break; }
    }
    if (bridgeEnds.some((q) => Math.hypot(q[0] - p.x, q[1] - p.y) < POT.BRIDGE_PAD + R - 0.01)) bad.bridge++;
    // zebras are painted at (widest crossing road / 2 + 2 .. + 10) from a junction node on its street /
    // arterial / bund approaches; a junction of lanes only has none (only its centre must stay clear)
    if (juncs.some((n) => Math.hypot(n.x - p.x, n.y - p.y) < n.w / 2 + (zebraAt(n) ? 10 : 0) + R)) bad.zebra++;
    if (railSegs.some((s) => segD(p.x, p.y, s[0], s[1]) < s[2] + R + 4)) bad.rail++;
  }
  // overlap (dry ones among themselves, then with the rain extras)
  const grid = new Map();
  for (const p of all) { const k = Math.floor(p.x / 32) + ',' + Math.floor(p.y / 32); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
  for (const p of all) {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      for (const q of grid.get((Math.floor(p.x / 32) + i) + ',' + (Math.floor(p.y / 32) + j)) || []) if (q.id > p.id && Math.hypot(q.x - p.x, q.y - p.y) < (q.r + p.r) * 0.9) bad.overlap++;
    }
  }
  const nb = Object.values(bad).reduce((a, b) => a + b, 0);
  if (nb) fail(label + ': placement rule violations ' + JSON.stringify(bad));
  else ok(label + ': all ' + all.length + ' on plain ROAD (16 rim samples), none on bridges or within ' + POT.BRIDGE_PAD + ' u of a bridge joint, none on zebras / junctions, none at level crossings, 3-9 u, no overlaps');
  // ---- potholeAt: exact against brute force, and speed
  N.flags.rain = true; PH.refresh();
  // brute force (the test's own 64 u buckets of every pothole, independent of world.js's index)
  const tb = new Map();
  for (const p of all) { const k = Math.floor(p.x / 64) * 100000 + Math.floor(p.y / 64); (tb.get(k) || tb.set(k, []).get(k)).push(p); }
  const brute = (x, y) => {
    if (!(isFinite(x) && isFinite(y))) return null;
    const bi = Math.floor(x / 64), bj = Math.floor(y / 64);
    for (let i = bi - 1; i <= bi + 1; i++) for (let j = bj - 1; j <= bj + 1; j++) {
      for (const p of tb.get(i * 100000 + j) || []) {
        const dx = x - p.x, dy = y - p.y, u = dx * p.ca + dy * p.sa, v = dy * p.ca - dx * p.sa;
        if (u * u * p.hx + v * v * p.hy <= 1) return p;
      }
    }
    return null;
  };
  let mism = 0, hits = 0;
  const rnd = (() => { let a = 12345; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  for (let k = 0; k < 300000; k++) {
    let x, y;
    if (k & 1) { const p = all[(rnd() * all.length) | 0]; x = p.x + (rnd() - 0.5) * p.rx * 2.6; y = p.y + (rnd() - 0.5) * p.rx * 2.6; }
    else { x = rnd() * N.WORLD_W; y = rnd() * N.WORLD_H; }
    const a = W.potholeAt(x, y);
    // the grid stops at the first hit: compare membership (a point in two ellipses never happens: no overlaps)
    const b = brute(x, y);
    if ((a && a.id) !== (b && b.id)) mism++;
    if (a) hits++;
  }
  if (mism) fail(label + ': potholeAt disagrees with brute force on ' + mism + ' of 300000 points');
  else ok(label + ': potholeAt matches brute force on 300000 points (' + hits + ' hits)');
  const centre = all.filter((p) => W.potholeAt(p.x, p.y) !== p).length;
  if (centre) fail(label + ': ' + centre + ' potholes not found at their own centre'); else ok(label + ': every pothole found at its centre');
  if (W.potholeAt(NaN, 5) !== null || W.potholeAt(-50, -50) !== null || W.potholeAt(1e9, 3) !== null) fail(label + ': potholeAt(NaN / outside) is not null');
  // speed: 2 M lookups (a quarter of them on potholes)
  const n = 2e6, xs = new Float64Array(n), ys = new Float64Array(n);
  for (let k = 0; k < n; k++) { if (k % 4 === 0) { const p = all[(k * 7919) % all.length]; xs[k] = p.x + (rnd() - 0.5) * 4; ys[k] = p.y + (rnd() - 0.5) * 4; } else { xs[k] = rnd() * N.WORLD_W; ys[k] = rnd() * N.WORLD_H; } }
  let best = Infinity;
  for (let rep = 0; rep < 3; rep++) {
    const t0 = process.hrtime.bigint(); let h = 0;
    for (let k = 0; k < n; k++) if (W.potholeAt(xs[k], ys[k])) h++;
    best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1e3 / n);
    if (h < 0) console.log(h);
  }
  if (!(best < 2)) fail(label + ': potholeAt ' + best.toFixed(3) + ' us per call (budget 2 us)'); else ok(label + ': potholeAt ' + best.toFixed(3) + ' us per call (budget 2 us)');
  // ---- rain: extras only while it rains / in the monsoon; wet flags
  N.flags.rain = false; PH.refresh();
  const dryState = { rain: PH.rain, active: all.filter((p) => PH.active(p)).length, wet: all.filter((p) => p.wet).length, rainHit: all.filter((p) => p.rain && W.potholeAt(p.x, p.y) === p).length };
  N.flags.rain = true; PH.refresh();
  const wetState = { rain: PH.rain, active: all.filter((p) => PH.active(p)).length, wet: all.filter((p) => p.wet).length, rainHit: all.filter((p) => p.rain && W.potholeAt(p.x, p.y) === p).length };
  N.flags.rain = false; PH.refresh();
  if (dryState.rain !== 0 || dryState.wet || dryState.rainHit || dryState.active !== dry.length) fail(label + ': dry weather state wrong ' + JSON.stringify(dryState));
  else if (wetState.rain !== 2 || wetState.active !== all.length || wetState.wet !== all.length || wetState.rainHit !== all.length - dry.length) fail(label + ': rain state wrong ' + JSON.stringify(wetState));
  else ok(label + ': dry ' + dryState.active + ' active / 0 wet; rain ' + wetState.active + ' active (+' + (all.length - dry.length) + ' rain-only) / all wet');
  // per-chunk lists cover every pothole
  let missing = 0;
  for (const p of all) { const l = PH.chunk(Math.floor(p.x / PH.CH), Math.floor(p.y / PH.CH)); if (l.indexOf(p) < 0) missing++; }
  if (missing) fail(label + ': ' + missing + ' potholes missing from their chunk list'); else ok(label + ': per-chunk lists (' + PH.cols + ' x ' + PH.rows + ' chunks of ' + PH.CH + ' u) hold every pothole');
  return dry.length;
}

const V1_FILE = 'design/geo/worlddata_v1.js'; // the hand-made 8000 x 6000 map, kept by the Map v2 builder
function nodePart(dataFile) {
  console.log('\n== node: ' + (dataFile || process.env.DATA || 'the map in src/worlddata.js'));
  const env = makeEnv(dataFile), N = env.N;
  env.load('src/world.js'); env.load('src/world_extras.js');
  const t = buildTimed(env);
  const W = N.world;
  ok('world ' + N.WORLD_W + ' x ' + N.WORLD_H + ' built: ' + t.cpu + ' ms CPU (' + t.wall + ' ms wall), ' + W.structures.length + ' structures, ' + W.data.roads.length + ' roads, ' + W.roads.nodes.length + ' road nodes, grid ' + W.GW + ' x ' + W.GH);
  info('phases (wall ms): ' + JSON.stringify(W.buildPhases));
  if (N.WORLD_W * N.WORLD_H > 8000 * 6000 * 1.5) {
    if (t.cpu > 1600) fail('bigger world build ' + t.cpu + ' ms CPU (target < 1000 ms; fails above 1600 ms to allow for machine load)');
    else if (t.cpu > 1000) info('NOTE: ' + t.cpu + ' ms CPU is above the 1.0 s target on this (loaded) machine');
  }
  if (W.GW !== Math.ceil(N.WORLD_W / N.CELL) || W.GH !== Math.ceil(N.WORLD_H / N.CELL) || W.grid.length !== W.GW * W.GH) fail('grid not sized from the world: ' + [W.GW, W.GH, W.grid.length]);
  checkPotholes(N, N.WORLD_DATA.version === 2 ? 'v2' : 'v1');
  // determinism
  const sig = (L) => L.map((p) => p.road + ':' + p.seg + ':' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ':' + p.rx.toFixed(2)).join('|');
  const before = sig(W.potholes.list);
  // rebuild while it rains (the extras made eagerly at build time) = the dry build + the extras made later
  N.flags.rain = true;
  W.build(); W.potholes.ensure();
  const eager = sig(W.potholes.list);
  N.flags.rain = false; W.potholes.refresh();
  if (eager !== before) fail('potholes differ after a rebuild (built in the rain vs extras made on demand)');
  else ok('deterministic: a rebuild (in the rain) gives the same ' + W.potholes.list.length + ' potholes as dry build + extras on demand');
  // districts: a concave polygon with a hole, gap filling, labels
  const ds = N.WORLD_DATA.districts;
  const saved = ds.slice(), savedGrid = N.WORLD_DATA.districtGrid;
  delete N.WORLD_DATA.districtGrid; // (Map v2's exact raster indexes the real districts)
  ds.length = 0;
  ds.push({ id: 'ring', name: 'Ring', style: 'colony', polys: [{ outer: [[1000, 1000], [3000, 1000], [3000, 3000], [1000, 3000]], holes: [[[1500, 1500], [2500, 1500], [2500, 2500], [1500, 2500]]] }] });
  ds.push({ id: 'ell', name: 'Ell', style: 'oldcity', poly: [[4000, 1000], [6000, 1000], [6000, 1600], [4600, 1600], [4600, 3000], [4000, 3000]] });
  ds.push({ id: 'multi', name: 'Multi', style: 'posh', poly: [[[100, 4000], [600, 4000], [600, 4500], [100, 4500]], [[900, 4000], [1300, 4000], [1300, 4500], [900, 4500]]] });
  ds.push({ id: 'box', name: 'Box', style: 'hitec', rect: [6500, 4000, 800, 800] });
  W.build();
  const at = (x, y) => (W.districtAt(x, y) || {}).id || null;
  const exp = [[1200, 1200, 'ring'], [2000, 2000, null], [2900, 2900, 'ring'], [4100, 2900, 'ell'], [5500, 1300, 'ell'], [5500, 2500, null], [300, 4200, 'multi'], [1000, 4200, 'multi'], [6600, 4100, 'box'], [7600, 5800, null],
    [3050, 2000, 'ring'], [3400, 2000, null]]; // 50 u outside the ring: gap fill (6 cells x 32 u); 400 u outside: nothing
  const wrong = exp.filter(([x, y, id]) => at(x, y) !== id).map(([x, y, id]) => x + ',' + y + ' ' + at(x, y) + ' != ' + id);
  if (wrong.length) fail('polygon districts: ' + wrong.join('; ')); else ok('polygon districts: rings with holes, concave and multi-part polygons, rect fallback, gap fill');
  const lab = W.districtLabel('ell');
  if (!lab || at(lab[0], lab[1]) !== 'ell') fail('districtLabel(ell) not inside it: ' + lab); else ok('districtLabel inside a concave district: ' + lab.map(Math.round));
  ds.length = 0; for (const d of saved) ds.push(d);
  if (savedGrid) N.WORLD_DATA.districtGrid = savedGrid;
  W.build();
  if (savedGrid) { if (W.districtSource !== 'grid') fail('WORLD_DATA.districtGrid not used (' + W.districtSource + ')'); else ok('districts from the map\'s exact districtGrid (' + savedGrid.w + ' x ' + savedGrid.h + ' cells of ' + savedGrid.cell + ' u)'); }

}
function nodePartBig() {
  console.log('\n== node: stress: the v1 map stretched to 15000 x 11250 (rect districts, then the same as polygons)');
  const env2 = makeEnv(V1_FILE), N2 = env2.N;
  env2.load('src/world.js'); env2.load('src/world_extras.js');
  const rectAt = [];
  scaleWorld(N2, 15000 / 8000, false);
  const t2 = buildTimed(env2);
  const W2 = N2.world;
  ok('world ' + N2.WORLD_W + ' x ' + N2.WORLD_H + ' (from WORLD_DATA.size) built: ' + t2.cpu + ' ms CPU (' + t2.wall + ' ms wall; target < 1000 ms), ' + W2.structures.length + ' structures, ' + W2.lots.length + ' lots, ' + W2.trees.length + ' trees, grid ' + W2.GW + ' x ' + W2.GH + ' (' + (W2.grid.length / 1e6).toFixed(1) + ' M cells)');
  info('phases (wall ms): ' + JSON.stringify(W2.buildPhases));
  const heap = process.memoryUsage().heapUsed / 1e6;
  info('node heap after both worlds: ' + heap.toFixed(0) + ' MB');
  if (t2.cpu > 1600) fail('bigger world build ' + t2.cpu + ' ms CPU (target < 1000 ms; fails above 1600 ms to allow for machine load)');
  else if (t2.cpu > 1000) info('NOTE: ' + t2.cpu + ' ms CPU is above the 1.0 s target on this (loaded) machine');
  if (W2.GW !== Math.ceil(15000 / 4) || W2.GH !== Math.ceil(11250 / 4)) fail('bigger world grid ' + W2.GW + ' x ' + W2.GH);
  if (N2.world.surfaceAt(14990, 11240) !== N2.SURF.VOID && N2.world.surfaceAt(14990, 11240) == null) fail('far corner lookup broken');
  // sample points away from district edges (the rect raster takes every cell a rect touches, the polygon
  // raster the cells whose centre is inside: they may differ within one 32 u cell of an edge)
  const nearEdge = (x, y) => N2.WORLD_DATA.districts.some((d) => { const r = d.rect; if (!r) return false; const inX = x > r[0] - 34 && x < r[0] + r[2] + 34, inY = y > r[1] - 34 && y < r[1] + r[3] + 34; return inX && inY && (Math.abs(x - r[0]) < 34 || Math.abs(x - r[0] - r[2]) < 34 || Math.abs(y - r[1]) < 34 || Math.abs(y - r[1] - r[3]) < 34); });
  for (let k = 0; rectAt.length < 4000 && k < 20000; k++) { const x = 20 + ((k * 7919) % 14960), y = 20 + ((k * 104729) % 11210); if (!nearEdge(x, y)) rectAt.push([x, y, (W2.districtAt(x, y) || {}).id || null]); }
  const map = W2.renderMap(0.2);
  if (!map || map.ppu !== 0.2) fail('renderMap(0.2) at 15000 x 11250 not honoured: ' + (map && map.ppu)); else ok('renderMap(0.2) = ' + Math.ceil(15000 * 0.2) + ' x ' + Math.ceil(11250 * 0.2) + ' px (budget ' + 'max side 4096, 12 M px; mapPPU(0.4) = ' + W2.mapPPU(0.4).toFixed(3) + ')');
  checkPotholes(N2, '15000x11250');
  // the same districts as polygons: same answers
  for (const d of N2.WORLD_DATA.districts) { if (!d.rect) continue; const [x, y, w, h] = d.rect; d.poly = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; delete d.rect; }
  N2.world.build();
  const diff = rectAt.filter(([x, y, id]) => ((N2.world.districtAt(x, y) || {}).id || null) !== id);
  // the rect districts tile the map exactly, so polygons agree except where gap filling now covers no-district cells
  const realDiff = diff.filter((d) => d[2] !== null);
  if (realDiff.length) fail('polygon districts disagree with rects at ' + realDiff.length + ' of ' + rectAt.length + ' points, e.g. ' + JSON.stringify(realDiff.slice(0, 3)));
  else ok('districts as polygons agree with the rect version at ' + rectAt.length + ' points off the edges (' + diff.length + ' rect gaps now filled)');
}

/* ------------------------------------------------------------------ browser part */
async function browserPart() {
  const { chromium } = require('/opt/node22/lib/node_modules/playwright');
  console.log('\n== browser: the real game');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.addInitScript(GW);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  if (process.env.DATA) await page.route(/src\/worlddata\.js$/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.resolve(process.env.DATA), 'utf8') }));
  await page.goto('file://' + path.join(ROOT, 'index.html') + '#debug');
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted'), null, { timeout: 60000 });
  const atBoot = await page.evaluate(() => ({ ready: N.world.potholes.ready, n: N.world.potholes.list.length }));
  // potholes are generated after the build, a few ms per frame (title screen)
  const readyOk = await page.waitForFunction(() => N.world.potholes.ready, null, { timeout: 60000 }).then(() => true, () => false);
  if (!readyOk) fail('potholes never became ready after boot');
  const boot = await page.evaluate(() => ({ W: N.WORLD_W, H: N.WORLD_H, buildMs: N.world.buildMs, phases: N.world.buildPhases, n: N.world.potholes.list.length, patches: N.world.potholes.patches.length, gen: N.world.potholes.stats.ms, frames: N.world.potholes.stats.frames, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null }));
  ok('booted ' + boot.W + ' x ' + boot.H + ': world build ' + boot.buildMs + ' ms (wall, ' + (atBoot.ready ? 'potholes inside!' : 'no potholes yet') + '), then ' + boot.n + ' potholes + ' + boot.patches + ' patches over ' + boot.frames + ' frames (' + boot.gen + ' ms of work), JS heap ' + boot.heap + ' MB');
  if (atBoot.ready) fail('potholes were made inside the world build');
  if (!(boot.n > 100)) fail('too few potholes in the game: ' + boot.n);
  const api = await page.evaluate(() => {
    const W = N.world, PH = W.potholes;
    const p = PH.list.find((q) => !q.rain);
    const r = W.potholeAt(p.x, p.y);
    const keys = r ? Object.keys(r) : [];
    // in-page speed
    const n = 1e6; let h = 0; const t0 = performance.now();
    for (let k = 0; k < n; k++) { const q = PH.list[k % PH.list.length]; if (W.potholeAt(q.x + (k % 7) - 3, q.y + (k % 5) - 2)) h++; }
    const us = ((performance.now() - t0) * 1000) / n;
    const v = N.render.view;
    return { ok: r === p, keys, us, h, chunk: PH.chunk(Math.floor(p.x / PH.CH), Math.floor(p.y / PH.CH)).indexOf(p) >= 0, q: PH.query(p.x - 5, p.y - 5, p.x + 5, p.y + 5).indexOf(p) >= 0, viewQ: PH.query(v.x0, v.y0, v.x1, v.y1).length };
  });
  if (!api.ok || ['depth', 'r', 'wet'].some((k) => api.keys.indexOf(k) < 0)) fail('potholeAt API: ' + JSON.stringify(api));
  else ok('potholeAt -> {' + api.keys.filter((k) => !k.startsWith('_')).slice(0, 14).join(', ') + ', ...}; chunk() and query() find it');
  if (!(api.us < 2)) fail('in-page potholeAt ' + api.us.toFixed(3) + ' us per call'); else ok('in-page potholeAt ' + api.us.toFixed(3) + ' us per call (budget 2 us)');

  // vehicles.js integration: ride a cycle straight through a pothole on a quiet street
  await page.evaluate(() => { N.debug.newGame(); N.debug.setTime(12, 0); N.debug.freezeClock(true); });
  const ride = await page.evaluate(async () => {
    const W = N.world, PH = W.potholes;
    const cand = PH.list.filter((p) => !p.rain && p.kind === 'street' && p.depth > 0.5).sort((a, b) => b.r - a.r)[0] || PH.list[0];
    const ang = Math.atan2(W.data.roads.find((r) => r.id === cand.road).pts[cand.seg + 1][1] - W.data.roads.find((r) => r.id === cand.road).pts[cand.seg][1], W.data.roads.find((r) => r.id === cand.road).pts[cand.seg + 1][0] - W.data.roads.find((r) => r.id === cand.road).pts[cand.seg][0]);
    N.player.teleport(cand.x - Math.cos(ang) * 70, cand.y - Math.sin(ang) * 70);
    if (!N.vehicles || !N.vehicles.spawn) return { skipped: 'no vehicles' };
    const v = N.vehicles.spawn('cycle', cand.x - Math.cos(ang) * 60, cand.y - Math.sin(ang) * 60, ang, {});
    if (!v) return { skipped: 'no cycle type' };
    N.vehicles.enter(N.player, v);
    let got = null;
    const on = (d) => { if (!got && d && d.vehicle === v) got = { wheel: d.wheel, depth: d.depth, wet: d.wet, speed: Math.round(d.speed) }; };
    N.on('vehicle:pothole', on);
    // aim it exactly through the pothole at a steady speed (no input: set the motion directly)
    const t0 = performance.now();
    while (performance.now() - t0 < 2500 && !got) {
      const a = Math.atan2(cand.y - v.y, cand.x - v.x);
      v.angle = a; v.vx = Math.cos(a) * 70; v.vy = Math.sin(a) * 70; v.speed = 70;
      N.input.setMove && N.input.setMove(Math.cos(a), Math.sin(a));
      await __gw(0.03);
      if (Math.hypot(v.x - cand.x, v.y - cand.y) > 200) break;
    }
    N.off('vehicle:pothole', on);
    N.input.setMove && N.input.setMove(0, 0);
    return { got, at: [Math.round(cand.x), Math.round(cand.y)], road: cand.road };
  });
  if (ride.skipped) info('vehicle ride skipped: ' + ride.skipped);
  else if (!ride.got) fail('a cycle ridden through the pothole at ' + ride.at + ' (' + ride.road + ') fired no vehicle:pothole');
  else ok('a cycle ridden through a pothole on ' + ride.road + ': vehicle:pothole ' + JSON.stringify(ride.got));
  await page.evaluate(() => { const p = N.player; if (p.vehicle && N.vehicles.exit) N.vehicles.exit(p); });

  // screenshots: colony lane, Old City, arterial; noon and rain
  const spots = await page.evaluate(() => {
    const L = N.world.potholes.list.filter((p) => !p.rain);
    const best = (pred) => {
      let b = null, bn = -1;
      for (const p of L) { if (!pred(p)) continue; let n = 0; for (const q of L) if (pred(q) && Math.abs(q.x - p.x) < 150 && Math.abs(q.y - p.y) < 80) n++; if (n > bn) { bn = n; b = p; } }
      return b && { x: b.x, y: b.y, n: bn, road: b.road, district: b.district };
    };
    return {
      colony_lane: best((p) => p.kind === 'lane' && p.style === 'colony'),
      old_city: best((p) => p.style === 'oldcity' || p.style === 'market'),
      arterial: best((p) => p.kind === 'arterial'),
    };
  });
  await page.evaluate(() => { if (N.hud && N.hud.hide) N.hud.hide(); if (N.traffic && N.traffic.setEnabled) N.traffic.setEnabled(false); });
  const shoot = async (name, s) => {
    await page.evaluate(([x, y]) => { N.player.teleport(x, y + 50); N.render.camOverride = { x, y, zoom: 1, snap: true }; N.render.warmChunks(x, y, 700); }, [s.x, s.y]);
    await gwait(page, 0.9);
    await page.screenshot({ path: path.join(OUT, 'potholes_' + name + '.png') });
    // a 2x crop of the middle (the potholes are 3-9 u = 6-18 device px at this zoom)
    await page.screenshot({ path: path.join(OUT, 'potholes_' + name + '_crop.png'), clip: { x: 440, y: 260, width: 400, height: 200 } });
  };
  for (const [k, s] of Object.entries(spots)) {
    if (!s) { fail('no ' + k + ' potholes for a screenshot'); continue; }
    await shoot(k + '_day', s);
    info(k + ': ' + s.road + ' in ' + s.district + ' (' + s.n + ' potholes in view)');
  }
  await page.evaluate(() => { N.seasons.set('monsoon', true); N.flags.rain = true; });
  await gwait(page, 1.2);
  await page.waitForFunction(() => N.world.potholes.list.some((p) => p.rain), null, { timeout: 30000 }).catch(() => fail('the monsoon extras never appeared'));
  await gwait(page, 0.3);
  const rain = await page.evaluate(() => ({ state: N.world.potholes.rain, raining: N.seasons.is('rain'), wet: N.world.potholes.list.filter((p) => p.wet).length, all: N.world.potholes.list.length }));
  if (rain.state !== 2 || rain.wet !== rain.all) fail('rain did not fill the potholes: ' + JSON.stringify(rain)); else ok('rain: all ' + rain.wet + ' potholes (incl. the monsoon extras) hold water');
  for (const [k, s] of Object.entries(spots)) if (s) await shoot(k + '_rain', s);
  await page.evaluate(() => N.debug.setTime(17, 40));
  await gwait(page, 0.6);
  if (spots.colony_lane) await shoot('colony_lane_rain_dusk', spots.colony_lane);
  const perf = await page.evaluate(() => N.render.stats.ms);
  info('last frame: ground layer ' + (perf.ground || 0).toFixed(2) + ' ms (water glints + wet potholes), chunks ' + (perf.chunks || 0).toFixed(2) + ' ms');
  await page.evaluate(() => { N.flags.rain = false; N.seasons.set('monsoon', null); });
  await gwait(page, 0.8);
  const after = await page.evaluate(() => ({ state: N.world.potholes.rain, wet: N.world.potholes.list.filter((p) => p.wet).length }));
  info('after the rain: state ' + after.state + ', ' + after.wet + ' wet');
  const errs = errors.concat(await page.evaluate(() => (N.errors || []).map((e) => 'N.err ' + (e.where || '') + ': ' + (e.msg || e.message || e))));
  if (errs.length) fail('errors: ' + errs.slice(0, 6).join(' | ')); else ok('no console / page / N.err errors');
  await browser.close();
}

(async () => {
  const ci = process.argv.indexOf('--child');
  if (ci >= 0) { // one node world per process
    const part = process.argv[ci + 1];
    try { if (part === 'big') nodePartBig(); else if (part === 'v1') nodePart(V1_FILE); else nodePart(); } catch (e) { fail('crashed: ' + (e.stack || e)); }
    process.exit(failures.length ? 1 : 0);
  }
  try {
    if (ONLY !== 'browser') {
      const { spawnSync } = require('child_process');
      const parts = ['map'];
      if (!process.env.DATA && fs.existsSync(path.join(ROOT, V1_FILE))) parts.push('v1');
      if (process.env.BIG === '1') parts.push('big');
      for (const part of parts) {
        const r = spawnSync(process.execPath, [__filename, '--child', part], { stdio: 'inherit', env: process.env });
        if (r.status !== 0) failures.push('node part ' + part + ' failed (see above)');
      }
    }
    if (ONLY !== 'node') await browserPart();
  } catch (e) { fail('crashed: ' + (e.stack || e)); }
  console.log(failures.length ? '\nPOTHOLES FAILED (' + failures.length + ')' : '\nPOTHOLES PASSED');
  process.exit(failures.length ? 1 : 0);
})();
