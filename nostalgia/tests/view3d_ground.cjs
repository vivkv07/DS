/* NOSTALGIA — tests/view3d_ground.cjs (3D ground renderer, src/view3d_ground.js, ARCHITECTURE §20)
 * Headless Chromium with SwiftShader WebGL (software GL: judge perf by JS ms and draw calls, not fps).
 * three.js is served from the vendored copy by routing the jsDelivr URL (hermetic, no network).
 *
 *   checks: the road analysis + soil map are precomputed in top-down slices on a device that used 3D before (no 3D needed),
 *     clustered junctions merge into one polygon and no footpath / kerb top lies on another road's
 *     carriageway (Abids, Tank Bund, and CITY-WIDE: every other junction + every merged cluster, no
 *     junction over 50 u^2; the round-2 review sites by name), and - graded from the raw emitted triangles, not the
 *     module's own predicates - no raised top on its OWN junction's zebras / carriageway (every junction swept),
 *     the street stays readable at night vs the old painted ground,
 *     the focus chunk has ground (full or provisional) on the first 3D frame and right after a
 *     rebuild, job slices end near their deadline, kerbed junction corners have no overlapping kerb /
 *     paver tops, lanes stay darker than the soil at 11:00 / 16:40 / 18:15 (screen luma ratio < 0.8),
 *     the provider owns every chunk's ground (no painter textures), the road network analysis
 *     (pieces, junction polygons, zebras), N.view3d.groundHeightAt (raised footpath, flat road, pothole
 *     dip) and the elevation(e) hook, rain wetness, before/after toggles without leaks, perf numbers
 *     (draw calls, triangles, JS ms, chunk build ms) before vs after in dense Abids, zero errors.
 *   screenshots: side-by-side BEFORE (old painted ground) | AFTER (this renderer) at first-person eye
 *     height, third person and zoomed out (bus chase camera): Himayatnagar colony lanes, Abids
 *     arterial (kerbs + zebras), Basheerbagh, Tank Bund at golden hour, the Charminar plaza, Lumbini
 *     park, the Musi riverbank at Puranapul, Abids at night, Himayatnagar in the rain.
 *     -> tests/out/ground/ground_<view>.png (+ _before / _after singles)
 * Fails on any console error / page error / N.err.
 *   node nostalgia/tests/view3d_ground.cjs        SHOTS=0 (checks only)   ONLY=<view-name substring>
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'ground');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const VW = 960, VH = 540;
const SHOTS = process.env.SHOTS !== '0';
const ONLY = process.env.ONLY || '';
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);

// views: place ids (stable across map rebuilds); look 'road' = along the nearest road (kind filter),
// snap = stand on that road (side = offset across it); vehicle = chase camera (zoomed out)
const VIEWS = [
  { name: 'himayatnagar_lanes_fps', at: 'giver_himayatnagar', h: 16, m: 30, mode: 'fps', look: 'road', pitch: 0.07 },
  { name: 'himayatnagar_lanes_tps', at: 'giver_himayatnagar', h: 16, m: 30, mode: 'tps', look: 'road', pitch: 0.32 },
  { name: 'abids_arterial_fps', at: 'abids', h: 11, mode: 'fps', look: 'road', kind: ['arterial'], snap: true, side: -14, pitch: 0.05 },
  { name: 'abids_arterial_tps', at: 'abids', h: 11, mode: 'tps', look: 'road', kind: ['arterial'], snap: true, side: -14, pitch: 0.28 },
  { name: 'basheerbagh_zoomed_out', at: 'basheerbagh', h: 10, m: 30, mode: 'tps', look: 'road', kind: ['arterial', 'street'], snap: true, vehicle: 'bus', pitch: 0.5 },
  { name: 'tank_bund_golden_tps', at: 'giver_hussain_sagar', h: 17, m: 40, mode: 'tps', look: 'road', kind: ['bund'], pitch: 0.22 },
  { name: 'tank_bund_golden_fps', at: 'giver_hussain_sagar', h: 17, m: 40, mode: 'fps', look: 'road', kind: ['bund'], pitch: 0.03 },
  { name: 'charminar_plaza_tps', at: 'charminar_plaza', h: 11, mode: 'tps', lookAt: 'charminar', pitch: 0.3 },
  { name: 'charminar_plaza_fps', at: 'charminar_plaza', h: 11, mode: 'fps', lookAt: 'charminar', pitch: 0.02 },
  { name: 'park_lumbini_tps', at: 'lumbini_park', h: 10, mode: 'tps', look: 'road', turn: 1.2, pitch: 0.32 },
  { name: 'riverbank_puranapul_tps', at: 'hide_puranapul_sand', h: 10, mode: 'tps', lookAt: 'purana_pul', pitch: 0.3 },
  { name: 'abids_night_tps', at: 'abids', h: 21, m: 15, mode: 'tps', look: 'road', kind: ['arterial'], snap: true, side: -14, pitch: 0.25 },
  { name: 'himayatnagar_rain_tps', at: 'giver_himayatnagar', h: 15, mode: 'tps', rain: true, look: 'road', pitch: 0.36 },
];

async function openPage(browser) {
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 120000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    // potholes are generated progressively off the boot path: finish them now (deterministic checks)
    if (N.world.potholes && N.world.potholes.ensure) N.world.potholes.ensure();
    N.debug.freezeClock(true);
    N.debug.god(true);
    N.view.noPointerLock = true;
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
  });
  return { context, page, errors };
}

/** place the player + camera for a view (in the page) */
async function setView(page, S) {
  return page.evaluate((S) => {
    if (N.player.vehicle && N.vehicles.alight) { try { N.vehicles.alight(N.player, true); } catch (e) { /* ignore */ } }
    N.flags.rain = S.rain ? true : undefined;
    if (!S.rain) delete N.flags.rain;
    if (S.at) N.debug.teleport(S.at); else if (S.x != null) N.debug.teleport(S.x, S.y);
    if (S.h != null) N.debug.setTime(S.h, S.m || 0);
    const p = N.player;
    let yaw = N.view.yaw;
    if (S.look === 'road') {
      const q = N.world.nearestRoadPoint(p.x, p.y, (r) => !S.kind || S.kind.indexOf(r.kind) >= 0);
      if (q) {
        if (S.snap) N.debug.teleport(q.x + Math.sin(q.angle) * (S.side || 0), q.y - Math.cos(q.angle) * (S.side || 0));
        yaw = q.angle + (S.turn || 0);
      }
    }
    if (S.lookAt) { const pl = N.WORLD_DATA.places.find((x) => x.id === S.lookAt) || N.WORLD_DATA.landmarks.find((x) => x.id === S.lookAt); if (pl) yaw = Math.atan2(pl.y - p.y, pl.x - p.x); }
    if (S.vehicle) { const v = N.debug.enterVehicle(S.vehicle) || N.debug.enterVehicle('ambassador'); if (v) v.angle = yaw; }
    N.view.set(S.mode);
    N.view3d.setCamera({ yaw, pitch: S.pitch != null ? S.pitch : 0.3, snap: true });
    return { x: Math.round(p.x), y: Math.round(p.y), settled: N.view3d.settle(40000) };
  }, S);
}
async function shoot(page, file) {
  // SwiftShader frames are slow on a loaded machine: settle the streaming, then one frame, then shoot
  await page.evaluate(() => N.view3d.settle(20000));
  await frames(page, 1);
  await page.evaluate(() => N.view3d.settle(5000));
  await page.screenshot({ path: file, timeout: 300000 });
}
/** mean sRGB luma (5x5 patches) of 'road' vs 'ground' screen points of a screenshot */
async function lumaOf(browser, file, pts) {
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  const r = await page.evaluate(async (a) => {
    const i = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = a.src; });
    const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, out = { road: [], ground: [] };
    for (const p of a.pts) {
      let s = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const X = Math.round(p.sx) + dx, Y = Math.round(p.sy) + dy;
        if (X < 0 || Y < 0 || X >= c.width || Y >= c.height) continue;
        const o = (Y * c.width + X) * 4; s += 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]; n++;
      }
      if (n) out[p.k].push(s / n);
    }
    return out;
  }, { src: 'data:image/png;base64,' + fs.readFileSync(file).toString('base64'), pts });
  await page.close();
  const m = (l) => (l.length ? l.reduce((x, y) => x + y, 0) / l.length : NaN);
  return { road: +m(r.road).toFixed(1), ground: +m(r.ground).toFixed(1), nRoad: r.road.length, nGround: r.ground.length, ratio: +(m(r.road) / m(r.ground)).toFixed(3) };
}
/** BEFORE | AFTER side by side with labels, drawn in a blank page */
async function compose(browser, before, after, out, title) {
  const page = await browser.newPage();
  const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  await page.setContent('<html><body style="margin:0;background:#111"></body></html>');
  const data = await page.evaluate(async (a) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const [ib, ia] = await Promise.all([load(a.b), load(a.a)]);
    const c = document.createElement('canvas'); c.width = ib.width + ia.width + 12; c.height = Math.max(ib.height, ia.height) + 34;
    const g = c.getContext('2d');
    g.fillStyle = '#16121a'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(ib, 0, 34); g.drawImage(ia, ib.width + 12, 34);
    g.font = 'bold 20px sans-serif'; g.fillStyle = '#e8c02c'; g.fillText('BEFORE  (painted 2D ground)', 10, 24);
    g.fillStyle = '#7fe08a'; g.fillText('AFTER  (view3d_ground.js)', ib.width + 22, 24);
    g.fillStyle = '#ccc'; g.font = '16px sans-serif'; g.textAlign = 'right'; g.fillText(a.t, c.width - 10, 24);
    return c.toDataURL('image/png').split(',')[1];
  }, { b: b64(before), a: b64(after), t: title });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  await page.close();
}

async function main() {
  const browser = await chromium.launch({ args: ARGS });
  const { page, errors } = await openPage(browser);
  // ---- D1: the global road analysis + soil colours run in small slices while still top-down (the
  // headless page only runs its rAF loop while frames are requested: pump it like a browser would)
  console.log('\n== top-down precompute (before any 3D)');
  const pre = await page.evaluate(async () => {
    // a device that has used 3D before keeps the analysis warm in frame-time slices (a top-down-only one only
    // in idle callbacks: design/audit/performance.md); this checks the returning-3D-player path
    try { localStorage.setItem('nostalgia.view3d.used', '1'); } catch (e) { /* storage off */ }
    const t0 = performance.now(), f0 = N.perf.frames;
    const work = () => (N.view3d.ground.stats().anaMs || []).reduce((a, b) => a + b, 0) + (N.view3d.ground.stats().soilMs || 0);
    while (!N.view3d.ground.stats().precomputed && performance.now() - t0 < 30000) await new Promise((r) => requestAnimationFrame(r));
    const auto = Math.round(work()), frames = N.perf.frames - f0;
    // this headless page draws ~1 frame a second (SwiftShader compositing) and its slices are bounded (no long
    // overshoots any more): finish with explicit top-down slices, still without the 3D engine
    while (!N.view3d.ground.stats().precomputed && performance.now() - t0 < 150000) { N.view3d.ground.precompute(40); await new Promise((r) => setTimeout(r, 0)); }
    const s = N.view3d.ground.stats();
    return { done: s.precomputed, auto, wallMs: Math.round(performance.now() - t0), frames, analyzeMs: s.analyzeMs, soilMs: s.soilMs, engine: !!(N.view3d.engine && N.view3d.engine.ready) };
  });
  check(pre.done && !pre.engine && pre.auto > 0, 'road network analysis + soil map precomputed in top-down slices before the first 3D switch (a device that used 3D before: ' + pre.auto + ' ms of it in its own per-frame / idle slices over ' + pre.frames + ' frames; ' + pre.analyzeMs + ' ms analysis in all)', JSON.stringify(pre));

  console.log('\n== 3D ground: switch to third person');
  await page.evaluate(() => { N.view3d.setQuality({ adaptive: false }); N.debug.teleport('abids'); N.view.set('tps'); });
  check(await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 240000 }).then(() => true, () => false), '3D third person ready');
  const first = await page.evaluate(() => N.view3d.ground.stats());
  check(first.focusCovered, 'the chunk under the player has ground (full or provisional) on the first 3D frame', JSON.stringify({ ready: first.focusReady, prov: first.provChunks }));
  const api = await page.evaluate(() => ({ ground: !!N.view3d.ground, gh: typeof N.view3d.groundHeightAt, enabled: N.view3d.ground && N.view3d.ground.enabled }));
  check(api.ground && api.gh === 'function' && api.enabled, 'N.view3d.ground + N.view3d.groundHeightAt present, enabled', JSON.stringify(api));
  await page.evaluate(() => N.view3d.settle(40000));
  const st0 = await page.evaluate(() => ({ g: N.view3d.ground.stats(), v: N.view3d.stats() }));
  console.log('  ground stats ' + JSON.stringify(st0.g));
  check(st0.g.analyzed && st0.g.pieces > 50 && st0.g.junctions > 20, 'road network analysed (' + st0.g.pieces + ' pieces, ' + st0.g.junctions + ' junction polygons, ' + st0.g.zebras + ' zebras, ' + st0.g.bays + ' bus bays, ' + st0.g.analyzeMs + ' ms)');
  check(st0.g.zebras > 0, 'zebra crossings on junction approaches');
  check(st0.g.chunks >= 4 && st0.v.groundTextures === 0, 'every chunk ground built by the provider (' + st0.g.chunks + ' chunks), no painter textures (' + st0.v.groundTextures + ')');

  // ---- D1: provisional ground (flat ribbons from N.world.data.roads + a soil-tinted terrain plane)
  // covers a chunk within a frame while its full job runs, so the bare 'outer' plane never shows
  const prov = await page.evaluate(async () => {
    N.view3d.ground.rebuild();
    for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
    const s = N.view3d.ground.stats();
    N.view3d.settle(60000);
    const s2 = N.view3d.ground.stats();
    return { covered: s.focusCovered, ready: s.focusReady, provChunks: s.provChunks, provAvgMs: s.provAvgMs, after: s2.provChunks, chunks: s2.chunks };
  });
  check(prov.covered, 'after a rebuild the focus chunk is covered within 2 frames (provisional ' + prov.provChunks + ' chunks, ' + prov.provAvgMs + ' ms each)', JSON.stringify(prov));
  { // (wall-clock: judged only when other agents' browsers are not swamping the host)
    const load = require('os').loadavg()[0], cores = require('os').cpus().length;
    if (prov.provAvgMs < 25 || load < cores * 2) check(prov.provAvgMs < 25, 'provisional chunk build is cheap (' + prov.provAvgMs + ' ms avg; target < 5 ms on an idle desktop)');
    else ok('provisional chunk build ' + prov.provAvgMs + ' ms avg — not judged: machine load ' + load.toFixed(1) + ' on ' + cores + ' cores');
  }
  check(prov.after <= 2 && prov.chunks >= 4, 'full chunks replace the provisional layer (' + prov.after + ' provisional left of ' + prov.chunks + ')');

  // ---- D6: job slices stay near their deadline (no long hitches); SwiftShader on a loaded box is noisy
  const ov = await page.evaluate(() => N.view3d.ground.stats().overMs);
  console.log('  slice overrun past deadline ' + JSON.stringify(ov) + '; longest slice per step ' + JSON.stringify(await page.evaluate(() => { const s = N.view3d.ground.stats(); return { step: s.stepMax, analysis: s.anaMax, prov: s.provMaxMs }; })));
  // (like tests/view3d.cjs: wall-clock slice timing is not judged on a heavily loaded machine, where
  // the OS deschedules the page mid-slice; the per-step maxima are printed for review instead)
  const load = require('os').loadavg()[0], cores = require('os').cpus().length;
  const ovMsg = 'ground job slices end near their deadline (overrun p50 ' + ov.p50 + ' ms, p95 ' + ov.p95 + ' ms, max ' + ov.max + ' ms)';
  if (load / cores > 2) ok(ovMsg + ' — not judged: machine load ' + load.toFixed(1) + ' on ' + cores + ' cores');
  else check(ov.p95 < 30, ovMsg);

  // ---- D5: kerbed junction corners: one footpath polygon per corner, no overlapping kerb / paver tops
  const ko = await page.evaluate(() => {
    const G = N.view3d.ground, x = N.player.x, y = N.player.y;
    return { all: G.kerbOverlaps(x, y, 2500, 80), corners: G.kerbOverlaps(x, y, 2500, 80, 'junction'), strips: G.kerbOverlaps(x, y, 2500, 80, 'pieces') };
  });
  // corner-caused overlaps = all - strips-only (strips of curved / kinked pieces overlap among themselves;
  // that is the road data, not the corners). Before this round: ~4.7 per kerbed corner here (old fans).
  const cornerPairs = ko.all.pairs - ko.strips.pairs, perCorner = +(cornerPairs / Math.max(1, ko.all.corners)).toFixed(2);
  console.log('  kerb overlaps ' + JSON.stringify({ junctions: ko.all.junctions, corners: ko.all.corners, all: ko.all.pairs, cornersOnly: ko.corners.pairs, stripsOnly: ko.strips.pairs, worst: ko.all.worst.slice(0, 3) }));
  check(ko.all.junctions > 5 && perCorner <= 2, 'kerbed junction corners: one footpath polygon per corner, few overlapping kerb / paver tops (' + cornerPairs + ' corner-caused pairs over ' + ko.all.corners + ' corners = ' + perCorner + ' per corner, <= 2)');

  // ---- r1-2 / r1-5: clustered junctions (Abids: abids_rd / gunfoundry_rd / bank_st meet at three nodes
  // ~50 u apart) are merged into ONE junction polygon; r1-3: a road that ends inside the crossing road
  // (lower_tank_bund at Tank Bund) must not hook back, so its footpaths never cross the bund carriageway.
  // footOnRoad counts raised footpath / kerb tops lying on ANOTHER road's carriageway or junction box.
  const jx = await page.evaluate(() => {
    const G = N.view3d.ground, NET = G.net();
    const near = (x, y, r) => NET.juncs.filter((J) => Math.hypot(J.x - x, J.y - y) < r);
    const ab = near(8995, 5792, 3)[0];
    const lt = NET.pieces.find((P) => P.r.id === 'lower_tank_bund' && P.ends[1].j && Math.hypot(P.ends[1].j.x - 9543, P.ends[1].j.y - 3389) < 3);
    let ltDir = null;
    if (lt) { const n = lt.pts.length, a = lt.pts[n - 1], b = lt.pts[Math.max(0, n - 4)]; ltDir = +Math.atan2(b[1] - a[1], b[0] - a[0]).toFixed(2); }
    const fo = (x, y, r) => { const o = G.footOnRoad(x, y, r); return { tris: o.tris, hits: o.hits, area: o.area, worst: o.worst.slice(0, 3) }; };
    return { merged: NET.merged, abMerged: !!(ab && ab.merged && ab.merged.poly), abMembers: ab && ab.merged ? ab.merged.members.length : 0, ltDir,
      abids: fo(9010, 5790, 120), bund: fo(9520, 3410, 90), ko: G.kerbOverlaps() };
  });
  console.log('  clusters ' + JSON.stringify({ merged: jx.merged, abids: jx.abids, bund: jx.bund, ltDir: jx.ltDir }));
  check(jx.merged > 0 && jx.abMerged && jx.abMembers >= 3, 'clustered junctions merged into one polygon (' + jx.merged + ' clusters; Abids abids_rd / gunfoundry_rd / bank_st: ' + jx.abMembers + ' nodes in one junction)');
  check(jx.abids.tris > 100 && jx.abids.area < 5, 'Abids junction: no footpath / kerb tops on another carriageway (' + jx.abids.area + ' u^2 over ' + jx.abids.hits + ' of ' + jx.abids.tris + ' raised tops; round 1: 225 u^2)', JSON.stringify(jx.abids.worst));
  check(jx.ltDir !== null && Math.abs(jx.ltDir - 1.6) < 0.45, 'lower_tank_bund approaches Tank Bund from the south, no hook at its end (arm direction ' + jx.ltDir + ' rad; round 1: 0.76)');
  check(jx.bund.tris > 50 && jx.bund.area < 40, 'Tank Bund / lower_tank_bund junction: no footpath slab across the bund carriageway (' + jx.bund.area + ' u^2 over ' + jx.bund.hits + ' raised tops; round 1: ~1780 u^2)', JSON.stringify(jx.bund.worst));
  check(jx.ko && jx.ko.junctions > 5, 'kerbOverlaps() with no arguments measures around the player (' + (jx.ko && jx.ko.junctions) + ' junctions, ' + (jx.ko && jx.ko.corners) + ' corners, ' + (jx.ko && jx.ko.pairs) + ' pairs)');

  // ---- r2-1 / r2-2 (round 3): CITY-WIDE, not just the two measured sites. footOnRoad around every
  // other plain junction (R = 60) and around every merged cluster (R = 90): no junction may have more
  // than 50 u^2 of footpath / kerb tops on another carriageway (round 2: 65 junctions over 20 u^2 on
  // every 5th one, worst 2286 u^2). Named review sites: Afzalgunj J1374-J1378 (r2-1 regression: a paver
  // island over the zebra), Masab Tank mehdipatnam_rd / asif_nagar_rd (duplicate alignment), Kachiguda,
  // Tolichowki 3720,5261, 10655,4996, the J451 / J5764 cluster.
  const cw = await page.evaluate(() => {
    const G = N.view3d.ground, NET = G.net(), t0 = performance.now();
    const res = { plain: 0, merged: 0, total: 0, over20: 0, worst: [] };
    const one = (x, y, R) => {
      const o = G.footOnRoad(x, y, R);
      res.total += o.area; if (o.area > 20) res.over20++;
      if (o.area > 0) res.worst.push({ x: Math.round(x), y: Math.round(y), area: o.area, w: o.worst.slice(0, 2).map((w) => w.src + '>' + w.on + ' ' + w.area) });
    };
    const plain = NET.juncs.filter((J) => J.poly && !J.members);
    for (let i = 0; i < plain.length; i += 2) { one(plain[i].x, plain[i].y, 60); res.plain++; }
    for (const J of NET.juncs) if (J.members && J.poly) { one(J.x, J.y, 90); res.merged++; }
    res.worst.sort((a, b) => b.area - a.area); res.worst = res.worst.slice(0, 5);
    res.total = Math.round(res.total); res.ms = Math.round(performance.now() - t0);
    const sites = [[9439, 7042], [9460, 7028], [9482, 7016], [9523, 6965], [9536, 6948], [6816, 4965], [10325, 5634], [10312, 5686], [3720, 5261], [10655, 4996], [9408, 7061], [9502, 6339], [10348, 5283]];
    res.sites = sites.map((p) => G.footOnRoad(p[0], p[1], 70).area);
    res.clear = G.stats().clear;
    return res;
  });
  console.log('  city-wide footOnRoad ' + JSON.stringify(cw));
  check(cw.plain > 1000 && cw.merged > 100 && cw.worst.every((w) => w.area <= 50), 'city-wide: no junction has a footpath / kerb slab on another carriageway (' + cw.plain + ' junctions at R 60 + ' + cw.merged + ' merged clusters at R 90: ' + cw.total + ' u^2 in total, ' + cw.over20 + ' over 20 u^2, worst ' + (cw.worst[0] ? cw.worst[0].area : 0) + ' u^2 <= 50; round 2: 65 of 915 over 20 u^2, worst 2286)', JSON.stringify(cw.worst));
  check(cw.sites.every((a) => a <= 20), 'review sites (Afzalgunj zebra J1376, Masab Tank, Kachiguda, Tolichowki, J451 / J5764 ...) clear: ' + JSON.stringify(cw.sites) + ' u^2 (each <= 20)');
  check(cw.clear && cw.clear.dups > 0 && cw.clear.corners < 200, 'clearance pass ran: ' + JSON.stringify(cw.clear) + ' (duplicate alignments dropped, kerbed corners on another carriageway left as plain asphalt edges)');

  // ---- r3: SELF overlaps, graded independently of the module's own predicates (clHit / footOnRoad test
  // sampled points against outlines and skipped a junction's own polygon, so a corner slab on its own
  // junction's asphalt or zebra was never seen). Here: for EVERY junction, the raw emitted triangles
  // (topTris) of its kerbed corners and its arms' footpath strips (raised, up-facing FOOT / KERB tops;
  // median kerbs excluded, they stand on the road by design) are clipped exactly against its own zebra /
  // stop-line PAINT triangles (its member nodes' too, for a merged cluster) and its own carriageway
  // triangles (its JUNC polygon tris + its arms' ROAD ribbons). Round 3 before the fix: 195 junctions over
  // 0.5 u^2, 25 571 u^2 of corner slabs on their own junction (worst 1323), 600 u^2 over zebras.
  const so = await page.evaluate(() => {
    const G = N.view3d.ground, NET = G.net(), t0 = performance.now();
    const LYF = 2, LYK = 3, LYR = 0, LYJ = 1, LYP = 5;
    const area2 = (t) => (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]);
    const ccw = (t) => (area2(t) < 0 ? [t[0], t[2], t[1]] : t);
    const clip = (subj, cl) => { // convex polygon clipping (Sutherland-Hodgman) -> overlap area
      let o = subj;
      for (let i = 0; i < cl.length && o.length; i++) {
        const a = cl[i], b = cl[(i + 1) % cl.length], inp = o; o = [];
        const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        for (let k = 0; k < inp.length; k++) {
          const p = inp[k], q = inp[(k + 1) % inp.length], sp = side(p), sq = side(q);
          if (sp >= 0) o.push(p);
          if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); o.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
        }
      }
      let A = 0; for (let i = 0; i < o.length; i++) { const p = o[i], q = o[(i + 1) % o.length]; A += p[0] * q[1] - q[0] * p[1]; }
      return Math.abs(A) / 2;
    };
    const bbOf = (t) => [Math.min(t[0][0], t[1][0], t[2][0]), Math.min(t[0][1], t[1][1], t[2][1]), Math.max(t[0][0], t[1][0], t[2][0]), Math.max(t[0][1], t[1][1], t[2][1])];
    const pieceOf = new Map(NET.pieces.map((P) => ['P' + P.id, P]));
    const vOf = (P, x, y) => { // signed offset from the piece centre line (median classification only)
      let best = null;
      for (let k = 0; k < P.pts.length - 1; k++) {
        const a = P.pts[k], b = P.pts[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (L2 < 1e-12) continue;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)), qx = a[0] + dx * t, qy = a[1] + dy * t, d2 = (x - qx) ** 2 + (y - qy) ** 2;
        if (!best || d2 < best.d2) best = { d2, v: ((x - qx) * -dy + (y - qy) * dx) / Math.sqrt(L2) };
      }
      return best ? best.v : Infinity;
    };
    const out = { n: 0, zebra: 0, carr: 0, over: [], worst: [], named: {} };
    const named = { panjagutta: [7613, 3804], rtc_x_roads: [11012, 5844], n10172_797: [10172, 797], abids_s_9015_5661: [9015, 5661], khairatabad_7665_4013: [7665, 4013], n11630_7606: [11630, 7606] };
    for (const J of NET.juncs) {
      if (!J.poly || J.merged) continue;
      const own = 'J' + J.id, arms = new Set(J.arms.map((a) => 'P' + a.piece.id)), mem = new Set((J.members || []).map((m) => 'J' + m.id));
      const tops = [], paint = [], carr = [];
      for (const t of G.topTris(J.x, J.y, 60 + (J.span || 0))) {
        const isOwn = t.s === own, isArm = arms.has(t.s), isMem = mem.has(t.s);
        if (!isOwn && !isArm && !isMem) continue;
        const tri = t.t.map((p) => [p[0], p[1]]);
        if (Math.abs(area2(tri)) < 2e-3) continue;
        const o = { t: ccw(tri), bb: bbOf(tri), s: t.s };
        if ((t.L === LYF || t.L === LYK) && t.up && t.t.every((p) => p[2] > 0.3)) {
          if (t.L === LYK && isArm) { const P = pieceOf.get(t.s); if (P && P.medHW > 0 && Math.abs(vOf(P, (tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3)) < P.medHW + 1.2) continue; }
          tops.push(o);
        } else if ((isOwn || isMem) && t.L === LYP) paint.push(o);
        else if ((isOwn && t.L === LYJ) || (isArm && t.L === LYR)) carr.push(o);
      }
      let z = 0, c = 0;
      for (const a of tops) for (const [list, k] of [[paint, 0], [carr, 1]]) for (const b of list) {
        if (a.bb[2] < b.bb[0] || b.bb[2] < a.bb[0] || a.bb[3] < b.bb[1] || b.bb[3] < a.bb[1]) continue;
        const ov = clip(a.t, b.t);
        if (k) c += ov; else z += ov;
      }
      out.n++; out.zebra += z; out.carr += c;
      if (z + c > 0.5) out.over.push(J.id);
      if (z > 0.05 || c > 0.05) out.worst.push({ id: J.id, x: Math.round(J.x), y: Math.round(J.y), zebra: +z.toFixed(2), carr: +c.toFixed(2) });
      for (const k in named) if (Math.hypot(J.x - named[k][0], J.y - named[k][1]) < 30) out.named[k] = Math.max(out.named[k] || 0, +(z + c).toFixed(2));
    }
    out.worstZ = out.worst.reduce((m, w) => Math.max(m, w.zebra), 0); out.worstC = out.worst.reduce((m, w) => Math.max(m, w.carr), 0);
    out.worst.sort((a, b) => b.zebra + b.carr - a.zebra - a.carr); out.worst = out.worst.slice(0, 6);
    out.zebra = +out.zebra.toFixed(1); out.carr = +out.carr.toFixed(1); out.over = out.over.length; out.ms = Math.round(performance.now() - t0);
    out.hull = NET.juncs.filter((J) => J.hullFb).length;
    return out;
  });
  console.log('  self overlaps (independent: emitted triangles clipped) ' + JSON.stringify(so));
  check(so.n > 4000, 'swept every junction polygon with the independent triangle check (' + so.n + ' junctions, ' + so.ms + ' ms; ' + so.hull + ' still need the hull stand-in)');
  check(so.worstZ <= 1 && so.zebra <= 10, 'no raised slab / kerb covers its own junction\'s zebra or stop-line paint (' + so.zebra + ' u^2 city-wide, worst junction ' + so.worstZ + ' u^2; round 3 before: ~600 u^2)', JSON.stringify(so.worst));
  check(so.worstC <= 10 && so.carr <= 300, 'no raised slab / kerb on its own junction\'s carriageway or its arms\' ribbons (' + so.carr + ' u^2 city-wide over ' + so.n + ' junctions, ' + so.over + ' over 0.5 u^2, worst ' + so.worstC + ' u^2; round 3 before: 26 300 u^2, worst 1323)', JSON.stringify(so.worst));
  check(Object.keys(so.named).length >= 5 && Object.values(so.named).every((a) => a <= 2), 'review junctions (Panjagutta, RTC X Roads, 10172,797, south of Abids 9015,5661, 7665,4013, 11630,7606) clear of self overlaps: ' + JSON.stringify(so.named) + ' u^2 (each <= 2)');

  // ---- heights: raised footpath, flat road, pothole dip, elevation hook
  const hs = await page.evaluate(() => {
    const NET = N.view3d.ground.net(), p = N.player;
    let best = null;
    for (const P of NET.pieces) {
      if (!(P.fp > 0) || !P.bb || p.x < P.bb[0] - 200 || p.x > P.bb[2] + 200 || p.y < P.bb[1] - 200 || p.y > P.bb[3] + 200) continue;
      const span = P.L - P.ends[0].trim - P.ends[1].trim;
      if (span > 80 && (!best || span > best.span)) best = { P, span };
    }
    if (!best) return null;
    const P = best.P, s = P.ends[0].trim + best.span / 2;
    let k = 0; while (k < P.pts.length - 2 && P.cum[k + 1] < s) k++;
    const a = P.pts[k], b = P.pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = (s - P.cum[k]) / L;
    const cx = a[0] + (b[0] - a[0]) * t, cy = a[1] + (b[1] - a[1]) * t, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    const off = P.hw + P.fp * 0.6, foot = [cx + nx * off, cy + ny * off];
    const pot = (N.world.potholes && N.world.potholes.list || []).find((q) => N.view3d.ground.potholeDip(q.x, q.y) < -0.05);
    return {
      road: P.r.id, kind: P.kind, kerbH: P.kerbH,
      foot: N.view3d.groundHeightAt(foot[0], foot[1]), centre: N.view3d.groundHeightAt(cx + nx * 2, cy + ny * 2),
      elev: N.view3d.elevation({ x: foot[0], y: foot[1] }),
      pot: pot ? N.view3d.groundHeightAt(pot.x, pot.y) : null,
    };
  });
  if (check(!!hs, 'found a kerbed road near Abids for height checks', JSON.stringify(hs))) {
    check(Math.abs(hs.foot - hs.kerbH) < 0.05, 'groundHeightAt on the footpath of ' + hs.road + ' = kerb height ' + hs.foot.toFixed(2));
    check(Math.abs(hs.centre) < 0.02, 'groundHeightAt on the road surface = 0 (' + hs.centre.toFixed(3) + ')');
    check(Math.abs(hs.elev - hs.foot) < 1e-6, 'elevation(e) of an entity on the footpath includes the ground height (' + hs.elev.toFixed(2) + ')');
    check(hs.pot === null || hs.pot < -0.05, 'pothole dip in groundHeightAt (' + (hs.pot === null ? 'none in loaded chunks' : hs.pot.toFixed(2)) + ')');
  }

  // ---- perf: dense Abids, before vs after (tiny pixel ratio: JS cost does not depend on pixels)
  const perf = async (on) => page.evaluate(async (on) => {
    N.view3d.ground.setEnabled(on);
    N.view3d.setQuality({ pixelRatio: 0.25 });
    const t0 = performance.now(); N.view3d.settle(60000); const settleMs = performance.now() - t0;
    // SwiftShader rasterises inside renderer.render(), so judge the JS outside it (jsx = js - render)
    const js = [], rn = [], jsx = [];
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      if (i > 4) { const t = N.view3d.stats(); js.push(t.jsMs); rn.push(t.renderMs); jsx.push(Math.max(0, t.jsMs - t.renderMs)); }
    }
    const med = (a) => +a.slice().sort((x, y) => x - y)[a.length >> 1].toFixed(2);
    const s = N.view3d.stats(), g = N.view3d.ground.stats();
    return { calls: s.calls, tris: s.triangles, jsMed: med(js), renderMed: med(rn), jsxMed: med(jsx), settleMs: Math.round(settleMs), geometries: s.geometries, textures: s.textures, groundTextures: s.groundTextures, chunkMs: g.avgChunkMs, roadTris: g.roadTris };
  }, on);
  await page.evaluate(() => { N.debug.teleport('abids'); N.view3d.setCamera({ yaw: N.view.yaw, pitch: 0.28, snap: true }); });
  const pa = await perf(true);
  const pb = await perf(false);
  const pa2 = await perf(true);
  console.log('  perf AFTER  ' + JSON.stringify(pa));
  console.log('  perf BEFORE ' + JSON.stringify(pb));
  check(pb.groundTextures > 0, 'toggle off: the painted ground is back (' + pb.groundTextures + ' textures)');
  check(pa2.groundTextures === 0, 'toggle on again: provider ground only');
  check(Math.abs(pa2.geometries - pa.geometries) <= Math.max(6, pa.geometries * 0.05) && Math.abs(pa2.textures - pa.textures) <= Math.max(6, pa.textures * 0.05), 'no leaks over off/on toggles (geometries ' + pa.geometries + ' -> ' + pa2.geometries + ', textures ' + pa.textures + ' -> ' + pa2.textures + ')');
  check(pa2.calls <= pb.calls * 1.35 + 30, 'draw calls comparable (' + pb.calls + ' before, ' + pa2.calls + ' after)');
  check(pa2.jsxMed <= Math.max(pb.jsxMed * 1.6, pb.jsxMed + 3), 'JS ms per frame outside renderer.render comparable (median ' + pb.jsxMed + ' before, ' + pa2.jsxMed + ' after; total incl. SwiftShader raster ' + pb.jsMed + ' / ' + pa2.jsMed + ')');
  check(pa2.settleMs <= pb.settleMs * 1.5 + 2000, 'building the ground around the player: ' + pa2.settleMs + ' ms after vs ' + pb.settleMs + ' ms painting before');

  // ---- rain: roads get wet, rain-only potholes appear (roads rebuilt)
  const rain = await page.evaluate(async () => {
    const v0 = N.view3d.ground.stats().potVer;
    N.flags.rain = true;
    for (let i = 0; i < 90; i++) await new Promise((r) => requestAnimationFrame(r));
    const s = N.view3d.ground.stats();
    N.view3d.settle(20000);
    const raining = !!(N.seasons && N.seasons.is && N.seasons.is('rain'));
    delete N.flags.rain;
    N.view3d.ground.setWet(0); // dry at once for the screenshots (roads otherwise dry out over ~a minute)
    return { wet: s.wet, raining, v0, v1: N.view3d.ground.stats().potVer };
  });
  await page.evaluate(() => N.view3d.setQuality({ pixelRatio: 1 }));
  check(rain.wet > 0.05, 'rain wets the roads (uWet ' + rain.wet + ', raining ' + rain.raining + ', pothole version ' + rain.v0 + ' -> ' + rain.v1 + ')');

  // ---- D4: lanes must stay readable against the soil at noon, afternoon and dusk: sample screen
  // pixels of road vs bare ground (classified by the 2D surface grid, unoccluded ground hits only)
  console.log('\n== lane / terrain contrast (Himayatnagar colony lanes, third person)');
  for (const [h, m] of [[11, 0], [16, 40], [18, 15]]) {
    const S = { name: 'contrast', at: 'giver_himayatnagar', h, m, mode: 'tps', look: 'road', kind: ['lane'], snap: true, pitch: 0.34 };
    await setView(page, S);
    const file = path.join(OUT, 'contrast_himayat_lanes_' + String(h).padStart(2, '0') + String(m).padStart(2, '0') + '.png');
    await shoot(page, file);
    const pts = await page.evaluate(() => {
      const T = N.view3d.THREE || window.THREE, E = N.view3d.engine, cam = E.camera, Sf = N.SURF, W = N.world;
      const rc = new T.Raycaster(), out = [], w = innerWidth, hh = innerHeight;
      const cls = (x, y) => { const s = W.surfaceAt(x, y); return s === Sf.ROAD ? 'road' : s === Sf.GROUND ? 'ground' : null; };
      for (let sy = hh * 0.45; sy < hh * 0.95; sy += 10) for (let sx = w * 0.06; sx < w * 0.94; sx += 10) {
        rc.setFromCamera(new T.Vector2(sx / w * 2 - 1, -(sy / hh * 2 - 1)), cam);
        const hit = rc.intersectObjects(E.scene.children, true)[0];
        if (!hit || !/^ground/.test(hit.object.name || '')) continue;
        const x = hit.point.x, y = hit.point.z, d = Math.hypot(x - cam.position.x, y - cam.position.z);
        if (d < 6 || d > 70) continue;
        const k = cls(x, y);
        if (!k || [[3, 0], [-3, 0], [0, 3], [0, -3]].some(([dx, dy]) => cls(x + dx, y + dy) !== k)) continue;
        if (k === 'road') { const q = W.nearestRoadPoint(x, y); if (!q || q.road.kind !== 'lane') continue; }
        out.push({ k, sx, sy });
      }
      return out;
    });
    const lm = await lumaOf(browser, file, pts);
    check(lm.nRoad >= 4 && lm.nGround >= 4 && lm.ratio < 0.8, 'lane / bare-ground luminance at ' + h + ':' + String(m).padStart(2, '0') + ' = ' + lm.road + ' / ' + lm.ground + ' = ' + lm.ratio + ' (< 0.8; ' + lm.nRoad + ' + ' + lm.nGround + ' samples)');
  }

  // ---- r1-6: night readability. Away from the lamp pools the dark asphalt went pure black (kerbs, edges
  // and rail-crossing paint vanished): the ground now keeps a skyglow floor and paint catches it. Mean
  // luma of the lower half of the screen, fps at the Secretariat road rail crossing (19:30) and the Tank
  // Bund edge (22:00), vs the old painted ground at the same camera (round 1: 0.18x and 0.8x)
  console.log('\n== night readability (lower-half screen luma, new ground vs old painted ground)');
  for (const S of [
    { name: 'night_railx', x: 7698.6 - Math.cos(-1.3416 + Math.PI / 2) * 7, y: 3648.4 - Math.sin(-1.3416 + Math.PI / 2) * 7, tx: 7698.6, ty: 3648.4, h: 19, m: 30, mode: 'fps', pitch: 0.35 },
    { name: 'night_bund', at: 'giver_hussain_sagar', h: 22, mode: 'tps', look: 'road', kind: ['bund'], turn: -1.57, pitch: 0.3 },
  ]) {
    const lum = {};
    for (const on of [true, false]) {
      await page.evaluate((on) => N.view3d.ground.setEnabled(on), on);
      await setView(page, S);
      if (S.tx != null) await page.evaluate((S) => { N.view3d.setCamera({ yaw: Math.atan2(S.ty - N.player.y, S.tx - N.player.x), pitch: S.pitch, snap: true }); N.view3d.settle(20000); }, S);
      const file = path.join(OUT, S.name + (on ? '_after' : '_before') + '.png');
      await shoot(page, file);
      const pts = [];
      for (let sy = VH * 0.5 + 4; sy < VH - 4; sy += 12) for (let sx = 6; sx < VW - 6; sx += 12) pts.push({ k: 'road', sx, sy });
      lum[on ? 'after' : 'before'] = (await lumaOf(browser, file, pts)).road;
    }
    await page.evaluate(() => N.view3d.ground.setEnabled(true));
    check(lum.after >= lum.before * 0.45 && lum.after >= 6, S.name + ': the street stays readable at night (lower-half luma ' + lum.after + ' vs ' + lum.before + ' with the old painted ground)');
  }

  // ---- screenshots: AFTER, then BEFORE (old painted ground) for every view
  if (SHOTS) {
    console.log('\n== screenshots (BEFORE | AFTER) -> ' + path.relative(ROOT, OUT));
    for (const S of VIEWS) {
      if (ONLY && S.name.indexOf(ONLY) < 0) continue;
      const t0 = Date.now();
      await page.evaluate(() => N.view3d.ground.setEnabled(true));
      const info = await setView(page, S);
      await page.evaluate((rain) => N.view3d.ground.setWet(rain ? 1 : 0), !!S.rain);
      if (S.rain) await page.evaluate(async () => {
        const raining = () => !!(N.seasons && N.seasons.is && N.seasons.is('rain'));
        for (let i = 0; i < 240 && !raining(); i++) await new Promise((r) => requestAnimationFrame(r));
        for (let i = 0; i < 12; i++) await new Promise((r) => requestAnimationFrame(r)); // potholes fill (polled twice a second)
        N.view3d.settle(20000);
      });
      const fa = path.join(OUT, 'ground_' + S.name + '_after.png'), fb = path.join(OUT, 'ground_' + S.name + '_before.png');
      await shoot(page, fa);
      const sa = await page.evaluate(() => N.view3d.stats());
      await page.evaluate(() => { N.view3d.ground.setEnabled(false); N.view3d.settle(40000); });
      await shoot(page, fb);
      const sb = await page.evaluate(() => N.view3d.stats());
      await compose(browser, fb, fa, path.join(OUT, 'ground_' + S.name + '.png'), S.name + ' @ ' + info.x + ',' + info.y);
      ok('shot ' + S.name + ' (' + info.x + ',' + info.y + '; calls ' + sb.calls + ' -> ' + sa.calls + ', tris ' + sb.triangles + ' -> ' + sa.triangles + ', ' + Math.round((Date.now() - t0) / 1000) + ' s)');
    }
    await page.evaluate(() => { N.view3d.ground.setEnabled(true); N.view3d.ground.setWet(null); delete N.flags.rain; });
  }

  const nerr = await page.evaluate(() => N.debug.state().errors);
  const all = errors.concat(nerr.map((e) => 'N.err: ' + e));
  check(all.length === 0, 'no console / page / N.err errors', all.slice(0, 6).join(' | '));
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAILURE(S):\n  ' + failures.join('\n  ') : 'view3d_ground: all checks passed'));
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
