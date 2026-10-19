/* NOSTALGIA — tests/atmos_wires.cjs (electric poles + overhead wires, src/wires.js; design/atmosphere.md)
 * Headless Chromium with SwiftShader WebGL (software GL: judge 3D perf by JS ms and draw calls).
 *
 *   checks: no span crosses a building / landmark footprint; clearance over drivable cells >= bus height
 *     (17 / VS u) everywhere and >= 26 u on the carriageway away from the edges / attachments;
 *     determinism (regenerate = identical); generation cost per 256 u cell; poles / spans per km;
 *     perches / query / heightAt API; Sankranti kites by date; 2D ms (dense Old City) and 3D JS ms +
 *     draw calls of the wires layer; zero console errors from this module (others are listed).
 *   screenshots -> tests/out/atmos/wires_<name>.png (2D + 3D): Old City lanes, Charminar, Abids arterial,
 *     a Himayatnagar colony lane, HITEC, Sankranti kites (20 Jan), night with pole lamps.
 *   SHOTS=0 (checks only)   ONLY=2d|3d|checks
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'atmos');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const SHOTS = process.env.SHOTS !== '0';
const ONLY = process.env.ONLY || '';
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const info = (msg) => console.log('       ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg + (detail ? ' (' + detail + ')' : '')); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);

// x, y: where to stand; h: hour; date: [y, m, d]
const SPOTS = {
  oldcity: { x: 8700, y: 7950, h: 10, date: [2003, 3, 10] },
  charminar: { at: 'charminar', h: 16, m: 30, date: [2003, 3, 10] },
  abids: { x: 8994, y: 5900, h: 11, date: [2003, 3, 10], road: ['arterial'], side: -14 },
  colony: { at: 'giver_himayatnagar', h: 16, date: [2003, 3, 10] },
  hitec: { at: 'giver_hitec', h: 12, date: [2003, 3, 10] },
  sankranti: { x: 8700, y: 7950, h: 11, date: [2003, 1, 20] },
  night: { at: 'giver_himayatnagar', h: 21, m: 15, date: [2003, 3, 10] },
};

async function openPage(browser, vw, vh) {
  const context = await browser.newContext({ viewport: { width: vw || 1280, height: vh || 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    N.debug.freezeClock(true);
    N.debug.god(true);
    N.view.noPointerLock = true;
    if (N.dialogue) N.dialogue.skip = true;
    if (N.weather && N.weather.force) N.weather.force({ rain: 0 });
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
  });
  return { context, page, errors };
}
async function place(page, S) {
  return page.evaluate((S) => {
    if (S.date && N.calendar && N.calendar.set) N.calendar.set(S.date[0], S.date[1], S.date[2], S.h, S.m || 0);
    if (S.at) N.debug.teleport(S.at); else N.debug.teleport(S.x, S.y);
    N.debug.setTime(S.h, S.m || 0);
    const p = N.player;
    const q = N.world.nearestRoadPoint(p.x, p.y, (r) => (S.road ? S.road.indexOf(r.kind) >= 0 : r.kind !== 'path' && r.kind !== 'bridge'));
    if (q && S.side != null) N.debug.teleport(q.x + Math.sin(q.angle) * S.side, q.y - Math.cos(q.angle) * S.side);
    N.wires.ensure(p.x - 700, p.y - 700, p.x + 700, p.y + 700);
    if (N.render.warmChunks) N.render.warmChunks(p.x, p.y, 520);
    return { x: Math.round(p.x), y: Math.round(p.y), yaw: q ? q.angle : 0 };
  }, S);
}

/* ------------------------------------------------------------------ in-page checks */
async function checks(page) {
  console.log('checks');
  const r = await page.evaluate(() => {
    const W = N.wires, S = N.SURF, VS = (N.view3d && N.view3d.VS) || 1.5, BUS = 17 / VS;
    const out = {};
    const areas = [['charminar', N.places.charminar], ['abids', N.places.abids], ['colony', N.places.giver_himayatnagar], ['hitec', N.places.giver_hitec], ['oldcity', { x: 8700, y: 7950 }]];
    // generation cost: fresh cells
    W.regen();
    const t0 = performance.now();
    let cells = 0;
    for (const [, p] of areas) cells += W.ensure(p.x - 512, p.y - 512, p.x + 511, p.y + 511);
    out.genMs = performance.now() - t0; out.cells = cells;
    const st = W.stats();
    out.stats = st;
    // determinism: a fingerprint of the Old City cells, regenerated
    const fp = () => { let s = 0, n = 0; const p = N.places.charminar; W.query(p.x - 500, p.y - 500, p.x + 500, p.y + 500, (sp) => { n++; s = (s + Math.round(sp.ax * 7 + sp.ay * 13 + sp.ah * 17 + sp.bx * 19 + sp.by * 23 + sp.sag * 100) * (n % 97 + 1)) % 1e9; }); W.poles(p.x - 500, p.y - 500, p.x + 500, p.y + 500, (q) => { n++; s = (s + Math.round(q.x * 31 + q.y * 37 + q.h * 41)) % 1e9; }); return s + ':' + n; };
    const f1 = fp();
    W.regen();
    // generate in a different order (far area first) to prove order independence
    for (const [, p] of areas.slice().reverse()) W.ensure(p.x - 512, p.y - 512, p.x + 511, p.y + 511);
    out.fp = [f1, fp()];
    // per km: poles + spans over the wired road length of generated cells
    const G = W._G();
    let roadLen = 0;
    const keys = new Set(G.cells.keys());
    for (const r of N.world.data.roads) {
      if (!((r.kind === 'lane' && r.w >= 18) || r.kind === 'street' || r.kind === 'arterial')) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if (keys.has(Math.floor(my / 256) * 4096 + Math.floor(mx / 256))) roadLen += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
    }
    let poles = 0, spans = 0; const lens = [];
    for (const c of G.cells.values()) { poles += c.poles.length; spans += c.spans.length; for (const s of c.spans) if (s.kind === 'power') lens.push(s.len); }
    lens.sort((a, b) => a - b);
    out.perKm = { roadKm: roadLen * 1.6 / 1000, poles, spans, polesPerKmU: poles / (roadLen / 1000), spansPerKmU: spans / (roadLen / 1000), medianPowerSpan: lens[lens.length >> 1] };
    // buildings + clearance over every generated span
    let bad = 0, worst = 99, lowCarriage = 0, samples = 0; const badList = [], lowList = [];
    for (const c of G.cells.values()) for (const sp of c.spans) {
      N.world.queryStructures(sp.x0 - 1, sp.y0 - 1, sp.x1 + 1, sp.y1 + 1, (s) => {
        let x0, y0, x1, y1, h;
        if (s.t === 'bldg') { x0 = s.x; y0 = s.y; x1 = s.x + s.w; y1 = s.y + s.d; h = s.h; }
        else if (s.t === 'landmark' && s.lm) { const l = s.lm; x0 = l.x - l.w / 2; y0 = l.y - l.d / 2; x1 = l.x + l.w / 2; y1 = l.y + l.d / 2; h = l.h || 30; }
        else return;
        // sample the wire: inside the (shrunk) footprint below the building's height = through it
        const n = Math.ceil(sp.len / 0.5);
        for (let k = 1; k < n; k++) {
          const t = k / n, x = sp.ax + (sp.bx - sp.ax) * t, y = sp.ay + (sp.by - sp.ay) * t;
          if (x > x0 + 0.3 && x < x1 - 0.3 && y > y0 + 0.3 && y < y1 - 0.3 && W.heightAt(sp, t) < h + 10) { bad++; if (badList.length < 5) badList.push([sp.id, sp.kind, Math.round(x), Math.round(y), s.t]); break; }
        }
      });
      const n = Math.ceil(sp.len / 1);
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = sp.ax + (sp.bx - sp.ax) * t, y = sp.ay + (sp.by - sp.ay) * t, sf = N.world.surfaceAt(x, y);
        if (sf !== S.ROAD && sf !== S.BRIDGE) continue;
        const h = W.heightAt(sp, t);
        samples++;
        if (h < worst) worst = h;
        // the carriageway proper: all 8 neighbours at 4 u are road, away from the wire's ends
        const endD = Math.min(Math.hypot(x - sp.ax, y - sp.ay), Math.hypot(x - sp.bx, y - sp.by));
        let inner = endD > 3;
        for (let a = 0; a < 8 && inner; a++) { const s2 = N.world.surfaceAt(x + Math.cos(a * 0.785) * 4, y + Math.sin(a * 0.785) * 4); if (s2 !== S.ROAD && s2 !== S.BRIDGE) inner = false; }
        if (inner && h < 26 - 1e-6) { lowCarriage++; if (lowList.length < 6) lowList.push([sp.kind, sp.id, +t.toFixed(2), +h.toFixed(2), Math.round(x), Math.round(y), +sp.ah.toFixed(1), +sp.bh.toFixed(1), +sp.sag.toFixed(2)]); }
      }
    }
    out.bld = { bad, badList };
    // pole spacing (>= 20 u between any two poles) and no pole on a plaza / in the open carriageway
    const allP = []; for (const c of G.cells.values()) for (const q of c.poles) allP.push(q);
    let close = 0, onPlaza = 0, minGap = 1e9;
    const grid = new Map();
    for (const q of allP) { const k = Math.floor(q.y / 32) * 4096 + Math.floor(q.x / 32); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(q); }
    for (const q of allP) {
      const i0 = Math.floor(q.x / 32), j0 = Math.floor(q.y / 32);
      for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) for (const o of grid.get(j * 4096 + i) || []) {
        if (o.id <= q.id) continue; const d = Math.hypot(o.x - q.x, o.y - q.y); minGap = Math.min(minGap, d); if (d < 20) close++;
      }
      const sf = N.world.surfaceAt(q.x, q.y);
      if (sf === S.PLAZA) onPlaza++;
      if (sf === S.ROAD) { let open = true; for (let a = 0; a < 8 && open; a++) { const s2 = N.world.surfaceAt(q.x + Math.cos(a * 0.785) * 5, q.y + Math.sin(a * 0.785) * 5); if (s2 !== S.ROAD) open = false; } if (open) onPlaza++; }
    }
    out.poleGap = { n: allP.length, close, onPlaza, minGap }; out.clear = { worst, bus: BUS, samples, lowCarriage, lowList };
    // API
    const p = { x: 8700, y: 7950 }, per = W.perches(p.x, p.y, 150); // Old City lanes
    let qn = 0; W.query(p.x - 100, p.y - 100, p.x + 100, p.y + 100, () => qn++);
    let pn = 0; W.poles(p.x - 100, p.y - 100, p.x + 100, p.y + 100, () => pn++);
    out.api = { perches: per.length, perchMinH: per.reduce((a, q) => Math.min(a, q.h), 99), spacing: per.length > 1 ? Math.hypot(per[1].x - per[0].x, per[1].y - per[0].y) : 0, query: qn, poles: pn, sample: per[0] ? Object.keys(per[0]) : [] };
    // kites by date
    N.calendar.set(2003, 1, 20, 11, 0); const k1 = W.kiteShare();
    N.calendar.set(2003, 2, 20, 11, 0); const k2 = W.kiteShare();
    N.calendar.set(2003, 6, 20, 11, 0); const k3 = W.kiteShare();
    out.kites = [k1, k2, k3];
    // N.err reports from this module
    out.errs = (N.errors || []).filter((e) => /wires/.test(String(e.where || e.msg || e))).length;
    return out;
  });
  info('generated ' + r.cells + ' cells in ' + r.genMs.toFixed(1) + ' ms (' + (r.genMs / r.cells).toFixed(2) + ' ms/cell, max ' + r.stats.maxCellMs + ' ms, index ' + r.stats.indexMs + ' ms)');
  info('by kind ' + JSON.stringify(r.stats.byKind) + '  tx ' + r.stats.tx + '  pole lamps ' + r.stats.lamps + '  kites ' + r.stats.kites + '  threads ' + r.stats.threads + '  chappals ' + r.stats.chappals);
  info('per km of road (world u): ' + r.perKm.polesPerKmU.toFixed(1) + ' poles, ' + r.perKm.spansPerKmU.toFixed(0) + ' spans; median power span ' + r.perKm.medianPowerSpan.toFixed(1) + ' u');
  info('rejected ' + JSON.stringify(r.stats.rejected));
  check(r.fp[0] === r.fp[1], 'deterministic: regenerated (other order) = identical', r.fp.join(' vs '));
  check(r.poleGap.close === 0 && r.poleGap.onPlaza === 0, 'poles >= 20 u apart, none on a plaza or in the open carriageway', JSON.stringify(r.poleGap));
  check(r.bld.bad === 0, 'no span passes through a building / landmark footprint', r.bld.bad + ' ' + JSON.stringify(r.bld.badList));
  check(r.clear.worst >= r.clear.bus, 'clearance over drivable cells >= bus height ' + r.clear.bus.toFixed(1) + ' u', 'min ' + r.clear.worst.toFixed(2) + ' u over ' + r.clear.samples + ' samples');
  check(r.clear.lowCarriage === 0, 'wires >= 26 u over the carriageway proper', r.clear.lowCarriage + ' low samples ' + JSON.stringify(r.clear.lowList));
  check(r.api.perches > 20 && r.api.perchMinH > 15 && r.api.spacing > 2 && r.api.spacing < 5, 'perches in the Old City lanes', JSON.stringify(r.api));
  check(r.api.query > 0 && r.api.poles > 0, 'query / poles API');
  check(r.kites[0] === 1 && r.kites[1] > 0 && r.kites[1] < 1 && r.kites[2] === 0, 'Sankranti kites by date (20 Jan full, 20 Feb thinning, June none)', r.kites.join(', '));
  check(r.errs === 0, 'no N.err reports from wires');
}

/* ------------------------------------------------------------------ 2D */
async function run2d(page) {
  console.log('2D top-down');
  for (const [name, S] of Object.entries(SPOTS)) {
    if (ONLY && ONLY !== '2d' && ONLY !== name) continue;
    await place(page, S);
    await frames(page, 6);
    if (SHOTS) await page.screenshot({ path: path.join(OUT, 'wires_' + name + '_2d.png'), timeout: 300000 });
  }
  // perf in dense Old City: the wires' share of the frame (enqueue + band draws), averaged
  await place(page, SPOTS.charminar);
  await frames(page, 10);
  const pf = await page.evaluate(() => new Promise((res) => {
    const acc = []; let n = 0;
    const f = () => {
      const s = N.wires.stats().draw2d;
      acc.push(s.ms + s.enq);
      if (++n < 60) requestAnimationFrame(f); else { acc.sort((a, b) => a - b); res({ med: acc[acc.length >> 1], p90: acc[Math.floor(acc.length * 0.9)], spans: s.spans, poles: s.poles, W: N.render.W, H: N.render.H }); }
    };
    requestAnimationFrame(f);
  }));
  info('2D wires cost in Old City (' + pf.W + 'x' + pf.H + ' internal, ' + pf.poles + ' poles, ' + pf.spans + ' spans in view): median ' + pf.med.toFixed(3) + ' ms, p90 ' + pf.p90.toFixed(3) + ' ms (shared, loaded sandbox)');
  check(pf.med < 1.5, '2D wires median frame cost < 1.5 ms (target 0.6 on an idle desktop)', pf.med.toFixed(3) + ' ms');
}

/* ------------------------------------------------------------------ 3D */
async function run3d(page) {
  console.log('3D');
  const V3 = [
    ['oldcity', 'fps', -0.28], ['abids', 'fps', -0.22], ['colony', 'tps', 0.08],
    ['hitec', 'tps', 0.1], ['sankranti', 'tps', 0.02], ['night', 'tps', 0.05],
  ];
  let first = true;
  for (const [name, mode, pitch] of V3) {
    if (ONLY && ONLY !== '3d' && ONLY !== name) continue;
    if (process.env.V3 && process.env.V3.split(',').indexOf(name) < 0) continue;
    const S = SPOTS[name];
    const r = await place(page, S);
    await page.evaluate(([mode, yaw, pitch]) => { N.view.set(mode); N.view3d.setCamera({ yaw, pitch, snap: true }); }, [mode, r.yaw, pitch]);
    if (first) {
      await page.waitForFunction(() => N.view3d.active, null, { timeout: 180000 });
      // the Blender pole models (pole_psc / pole_rail / pole_streetlight / pole_transformer) when the pack has them
      const m = await page.waitForFunction(() => !(N.models3d && N.models3d.has && N.models3d.has('pole_psc')) || N.wires._V.models.pole_psc !== undefined, null, { timeout: 300000 }).then(() => page.evaluate(() => !!N.wires._V.models.pole_psc), () => false);
      info('Blender pole models in use: ' + m);
      first = false;
    }
    await page.evaluate(() => N.view3d.settle(40000));
    await frames(page, 4);
    await page.evaluate(() => N.view3d.settle(10000));
    if (SHOTS) await page.screenshot({ path: path.join(OUT, 'wires_' + name + '_3d_' + mode + '.png'), timeout: 300000 });
  }
  // perf in dense Old City: the layer's JS per frame and its draw calls
  await place(page, SPOTS.oldcity);
  await page.evaluate(() => { N.view.set('tps'); N.view3d.setCamera({ pitch: 0.15, snap: true }); N.view3d.settle(30000); });
  await frames(page, 30);
  const pf = await page.evaluate(() => new Promise((res) => {
    const acc = []; let n = 0;
    const f = () => {
      acc.push(N.wires.stats().draw3d.jsMs);
      if (++n < 40) requestAnimationFrame(f);
      else {
        acc.sort((a, b) => a - b);
        let calls = 0; const V = N.wires._V;
        V.group.traverse((o) => { if ((o.isMesh || o.isPoints) && o.visible && (o.count == null || o.count > 0) && (!o.geometry.isInstancedBufferGeometry || o.geometry.instanceCount > 0)) calls++; });
        const off = (() => { N.wires.draw3d = false; return true; })();
        res({ med: acc[acc.length >> 1], max: acc[acc.length - 1], calls, d3: N.wires.stats().draw3d, v: N.view3d.stats(), off });
      }
    };
    requestAnimationFrame(f);
  }));
  await frames(page, 6);
  const offCalls = await page.evaluate(() => { const s = N.view3d.stats(); N.wires.draw3d = true; return s.calls; });
  info('3D wires layer in Old City: ' + JSON.stringify(pf.d3));
  info('view3d: calls ' + pf.v.calls + ' (wires off: ' + offCalls + '), tris ' + pf.v.triangles + ', jsAvg ' + pf.v.jsAvg);
  check(pf.med <= 0.5, '3D wires JS per frame <= 0.5 ms (median)', pf.med.toFixed(3) + ' ms, max ' + pf.max.toFixed(2) + ' (rebuilds ' + pf.d3.buildMs + ' ms when the chunk set changes)');
  check(pf.calls <= 8, '3D wires draw calls <= 8', pf.calls + ' (scene delta ' + (pf.v.calls - offCalls) + ')');
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const { page, errors } = await openPage(browser);
  try {
    if (!ONLY || ONLY === 'checks') await checks(page);
    if (!ONLY || ONLY === '2d' || SPOTS[ONLY]) await run2d(page);
    if (!ONLY || ONLY === '3d' || SPOTS[ONLY]) await run3d(page);
  } catch (e) { fail('exception: ' + (e.stack || e.message)); }
  const mine = errors.filter((e) => /wires/i.test(e));
  const other = errors.filter((e) => !/wires/i.test(e));
  check(mine.length === 0, 'zero console errors from wires.js', mine.slice(0, 3).join(' | '));
  if (other.length) info('console errors from other modules (not wires.js): ' + other.length + ' — ' + other.slice(0, 2).map((e) => e.split('\n').slice(0, 6).join(' / ')).join(' | '));
  await browser.close();
  console.log(failures.length ? '\nFAILED: ' + failures.length : '\nall wires checks passed');
  process.exit(failures.length ? 1 : 0);
})();
