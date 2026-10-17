/* NOSTALGIA — tools/perf/bench.cjs
 * Runtime performance bench of a checkout (file:// index.html, no server, no network): world build,
 * boot, memory, 2D frame time at night in the densest districts, allocation rate. Use it for
 * before/after comparisons of engine changes (run it on two checkouts, a few times each).
 *
 *   node nostalgia/tools/perf/bench.cjs [rootDir ...] [--runs 1] [--only desktop,phone] [--json out.json]
 *   node nostalgia/tools/perf/measure.cjs [rootDir ...] ...  (same thing: measure.cjs without --sites)
 *
 *   rootDir   the nostalgia/ folder(s) to measure (default: the one this script lives in). With two or
 *             more (e.g. a pristine checkout and the working tree) the runs are interleaved (A B A B ...)
 *             so a busy host slows both alike, and the table shows the medians side by side.
 *
 * Per run, a fresh headless Chromium (software raster, --disable-gpu):
 *   desktop  1280x720, unthrottled: boot (navigation -> title screen usable: wall ms, main-thread
 *            task ms and main-thread CPU ms = CDP ThreadTime, which a busy host does not inflate),
 *            N.world.buildMs + buildPhases, JS heap after boot (after a forced GC, precise memory info),
 *            renderer+GPU process PSS (/proc) and the live canvases (count, MB of pixels, the big ones:
 *            the minimap image), then a new game at 21:00 (clock frozen)
 *            and, in each of 3 dense spots (Charminar / Old City, Abids GPO, Secunderabad Clock Tower),
 *            the player is moved along a seeded random road route at 110 u/s for 1 s warm-up + 4 s of
 *            measured frames: frame() CPU ms per frame (update + draw, the game loop's rAF callback)
 *            p50 / p95; allocation rate over the 3 spots (sampling heap profiler incl. objects already
 *            collected) and heap drops seen by a 1-per-frame sampler (~ minor GCs / s); heap + PSS
 *            after play (the minimap image exists by then).
 *   phone    412x892 @ 2.625, touch, CDP CPU throttling 4x: boot, build, and the same 3 spots (3 s each).
 * Output: JSON (all numbers) then a table of the medians over --runs (and the per-run values).
 * Metric names: worldBuildMs (N.world.buildMs), bootMs (wall, nav -> title usable), bootCpuMs (main
 * thread CPU over the same span), heapMB / pssMB / canvasMB (title, play = after the spots),
 * frameP50 / frameP95 (frame() ms per spot), allocMBps (allocated MB per s of play, sampled incl.
 * garbage), heapDropsPerS (~ minor GCs per s).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ROOTS = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--'))).map((a) => path.resolve(a));
if (!ROOTS.length) ROOTS.push(path.resolve(__dirname, '..', '..'));
const RUNS = +arg('--runs', '1');
const ONLY = new Set(arg('--only', 'desktop,phone').split(','));
const JSON_OUT = arg('--json', null);
const urlOf = (root) => 'file://' + path.join(root, 'index.html') + '#debug';
const SPOTS = [['oldcity', 'charminar'], ['abids', 'abids_gpo'], ['secunderabad', 'secunderabad_clock_tower']];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100);

/* renderer + GPU process PSS of the Chromium launched by this node process */
function pssMB() {
  const ppid = {};
  for (const p of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    try { const st = fs.readFileSync('/proc/' + p + '/stat', 'utf8'); ppid[p] = st.slice(st.lastIndexOf(')') + 2).split(' ')[1]; } catch (e) { /* gone */ }
  }
  const desc = new Set([String(process.pid)]);
  for (let grew = true; grew;) { grew = false; for (const p in ppid) if (!desc.has(p) && desc.has(ppid[p])) { desc.add(p); grew = true; } }
  let pss = 0;
  for (const p of desc) {
    try {
      const cmd = fs.readFileSync('/proc/' + p + '/cmdline', 'utf8');
      if (!/--type=(renderer|gpu-process)/.test(cmd)) continue;
      pss += +(fs.readFileSync('/proc/' + p + '/smaps_rollup', 'utf8').match(/^Pss:\s+(\d+)/m) || [])[1] || 0;
    } catch (e) { /* gone */ }
  }
  return r1(pss / 1024);
}

/* in-page: boot marks, the game loop's frame() timed, the dolly, a heap sampler */
function initScript() {
  const P = (window.__bench = { marks: {}, frames: null, dolly: null, heap: null, canvases: [] });
  // every canvas element made (weakly held): live count / pixel memory after a GC
  const ce = Document.prototype.createElement;
  Document.prototype.createElement = function (tag) {
    const el = ce.apply(this, arguments);
    if (typeof tag === 'string' && tag.toLowerCase() === 'canvas' && typeof WeakRef === 'function') P.canvases.push(new WeakRef(el));
    return el;
  };
  P.canvasStats = () => {
    let n = 0, px = 0, big = [];
    for (const r of P.canvases) { const c = r.deref(); if (!c || !c.width || !c.height) continue; n++; px += c.width * c.height; if (c.width * c.height >= 1e6) big.push(c.width + 'x' + c.height); }
    return { n, mb: Math.round(px * 4 / 1048576 * 10) / 10, big };
  };
  const mark = (k) => { if (P.marks[k] == null) P.marks[k] = performance.now(); };
  const check = () => {
    const b = document.body;
    if (b && b.classList.contains('booted') && window.N && N.state && N.state.mode === 'title' && document.getElementById('title-start')) mark('title');
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    if (cb && cb.name === 'frame') {
      return raf((t) => {
        const d = P.dolly;
        if (d) { // move the player along the polyline at d.speed u/s (game time independent)
          const now = performance.now(), dt = Math.min(0.1, (now - (d.last || now)) / 1000); d.last = now;
          d.s += dt * d.speed;
          while (d.i < d.pts.length - 2 && d.s > d.cum[d.i + 1]) d.i++;
          const a = d.pts[d.i], b = d.pts[d.i + 1], L = d.cum[d.i + 1] - d.cum[d.i] || 1, u = Math.min(1, (d.s - d.cum[d.i]) / L);
          N.player.x = a[0] + (b[0] - a[0]) * u; N.player.y = a[1] + (b[1] - a[1]) * u;
          N.player.angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        }
        const s = performance.now();
        cb(t);
        const e = performance.now();
        if (P.frames) P.frames.push(e - s);
        if (P.heap && performance.memory) { const h = performance.memory.usedJSHeapSize; if (h < P.heap.last) P.heap.drops++; P.heap.last = h; }
      });
    }
    return raf(cb);
  };
  P.startDolly = (spot, speed) => {
    const W = N.world, R = W.roads;
    const n = R.nearestNode(N.player.x, N.player.y);
    const route = R.randomRoute(n, 60, { rng: N.util.rng(1234), avoid: ['path'] });
    const pts = route.map((m) => [m.x, m.y]);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    if (pts.length < 2) pts.push([pts[0][0] + 1, pts[0][1]]), cum.push(1);
    P.dolly = { pts, cum, i: 0, s: 0, speed, last: 0 };
    return { nodes: pts.length, len: Math.round(cum[cum.length - 1]) };
  };
}

async function newPage(browser, phone) {
  const ctx = await browser.newContext(phone
    ? { viewport: { width: 412, height: 892 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 720 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (phone) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return { ctx, page, cdp, errors };
}

async function metrics(cdp) {
  const { metrics: list } = await cdp.send('Performance.getMetrics');
  const m = {}; for (const x of list) m[x.name] = x.value; return m;
}

async function boot(P, root) {
  const m0 = await metrics(P.cdp);
  await P.page.goto(urlOf(root), { waitUntil: 'commit' });
  await P.page.waitForFunction(() => window.__bench && __bench.marks.title != null, null, { timeout: 180000, polling: 50 });
  const m = await metrics(P.cdp);
  const r = await P.page.evaluate(() => ({ bootMs: __bench.marks.title, buildMs: N.world.buildMs, phases: N.world.buildPhases }));
  r.bootTaskMs = r1(m.TaskDuration * 1000); r.bootScriptMs = r1(m.ScriptDuration * 1000);
  r.bootCpuMs = r1((m.ThreadTime - (m0.ThreadTime || 0)) * 1000);
  r.bootMs = r1(r.bootMs);
  return r;
}

async function heap(P) {
  await P.cdp.send('HeapProfiler.collectGarbage');
  await sleep(300);
  await P.cdp.send('HeapProfiler.collectGarbage');
  const h = await P.page.evaluate(() => ({ heap: performance.memory.usedJSHeapSize, cv: __bench.canvasStats() }));
  return { heapMB: r1(h.heap / 1048576), pssMB: pssMB(), canvases: h.cv.n, canvasMB: h.cv.mb, bigCanvases: h.cv.big };
}

function allocBytes(profile) {
  let total = 0; const byFn = {};
  const walk = (n) => {
    total += n.selfSize;
    if (n.selfSize) { const cf = n.callFrame, k = (cf.functionName || '(anon)') + ' ' + path.basename(cf.url || '') + ':' + (cf.lineNumber + 1); byFn[k] = (byFn[k] || 0) + n.selfSize; }
    for (const c of n.children || []) walk(c);
  };
  walk(profile.head);
  return { total, top: Object.entries(byFn).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, r1(v / 1048576)]) };
}

async function playSpots(P, secs, alloc) {
  await P.page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.skipDialogue(true); N.debug.god(true); N.debug.setTime(21, 0); N.debug.freezeClock(true); });
  await sleep(1500);
  const out = {};
  if (alloc) await P.cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768, includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true });
  let measuredS = 0, drops = 0;
  for (const [name, id] of SPOTS) {
    const ok = await P.page.evaluate((id) => {
      if (!N.debug.teleport(id)) return null;
      N.debug.setTime(21, 0); N.debug.freezeClock(true);
      return __bench.startDolly(id, 110);
    }, id);
    if (!ok) { out[name] = { error: 'unknown spot ' + id }; continue; }
    await sleep(1000);
    await P.page.evaluate(() => { __bench.frames = []; __bench.heap = { last: Infinity, drops: 0 }; });
    const t0 = Date.now();
    await sleep(secs * 1000);
    const r = await P.page.evaluate(() => { const f = __bench.frames, h = __bench.heap.drops; __bench.frames = null; __bench.heap = null; return { f, h, perf: N.debug.perf(), night: N.render.night }; });
    const dt = (Date.now() - t0) / 1000;
    measuredS += dt; drops += r.h;
    const f = r.f.slice().sort((a, b) => a - b), q = (p) => f[Math.min(f.length - 1, Math.floor(p * f.length))];
    out[name] = { frames: f.length, p50: r2(q(0.5)), p95: r2(q(0.95)), mean: r2(f.reduce((a, b) => a + b, 0) / f.length), fps: r1(f.length / dt), night: r2(r.night), entities: r.perf.entities, ms: r.perf.ms };
  }
  await P.page.evaluate(() => { __bench.dolly = null; });
  if (alloc) {
    const { profile } = await P.cdp.send('HeapProfiler.stopSampling');
    const a = allocBytes(profile);
    out.allocMBps = r2(a.total / 1048576 / measuredS);
    out.heapDropsPerS = r2(drops / measuredS);
    out.allocTop = a.top;
  }
  return out;
}

async function run(i, root) {
  const res = {};
  if (ONLY.has('desktop')) {
    const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
    try {
      const P = await newPage(browser, false);
      const b = await boot(P, root);
      const h = await heap(P);
      const play = await playSpots(P, 4, true);
      const h2 = await heap(P);
      res.desktop = { boot: b, title: h, play, afterPlay: h2, errors: P.errors };
    } finally { await browser.close(); }
  }
  if (ONLY.has('phone')) {
    const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
    try {
      const P = await newPage(browser, true);
      const b = await boot(P, root);
      const play = await playSpots(P, 3, false);
      res.phone = { boot: b, play, errors: P.errors };
    } finally { await browser.close(); }
  }
  process.stderr.write('run ' + (i + 1) + '/' + RUNS + ' done: ' + root + '\n');
  return res;
}

function summary(r) {
  const s = {};
  if (r.desktop) {
    const d = r.desktop;
    s.worldBuildMs_desktop = d.boot.buildMs; s.bootMs_desktop = d.boot.bootMs; s.bootCpuMs_desktop = d.boot.bootCpuMs; s.bootTaskMs_desktop = d.boot.bootTaskMs;
    s.heapMB_title = d.title.heapMB; s.pssMB_title = d.title.pssMB; s.canvasMB_title = d.title.canvasMB;
    s.heapMB_play = d.afterPlay.heapMB; s.pssMB_play = d.afterPlay.pssMB; s.canvasMB_play = d.afterPlay.canvasMB; s.canvases_play = d.afterPlay.canvases;
    s.bigCanvases_play = d.afterPlay.bigCanvases.length;
    for (const [n] of SPOTS) if (d.play[n] && d.play[n].p50 != null) { s['frameP50_desktop_' + n] = d.play[n].p50; s['frameP95_desktop_' + n] = d.play[n].p95; }
    s.allocMBps = d.play.allocMBps; s.heapDropsPerS = d.play.heapDropsPerS;
    s.errors = d.errors.length;
  }
  if (r.phone) {
    const p = r.phone;
    s.worldBuildMs_phone4x = p.boot.buildMs; s.bootMs_phone4x = p.boot.bootMs; s.bootCpuMs_phone4x = p.boot.bootCpuMs; s.bootTaskMs_phone4x = p.boot.bootTaskMs;
    for (const [n] of SPOTS) if (p.play[n] && p.play[n].p50 != null) { s['frameP50_phone4x_' + n] = p.play[n].p50; s['frameP95_phone4x_' + n] = p.play[n].p95; }
    s.errors = (s.errors || 0) + p.errors.length;
  }
  return s;
}

(async () => {
  const per = ROOTS.map(() => []);
  for (let i = 0; i < RUNS; i++) for (let k = 0; k < ROOTS.length; k++) per[k].push(await run(i, ROOTS[k]));
  const sums = per.map((runs) => runs.map(summary));
  const medOf = (list) => {
    const med = {};
    for (const k of Object.keys(list[0])) {
      const v = list.map((s) => s[k]).filter((x) => x != null).sort((a, b) => a - b);
      med[k] = v.length ? v[Math.floor((v.length - 1) / 2)] : null;
    }
    return med;
  };
  const meds = sums.map(medOf);
  const out = ROOTS.map((root, k) => ({ root, runs: RUNS, median: meds[k], perRun: sums[k], detail: per[k] }));
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.map((o) => ({ root: o.root, runs: o.runs, median: o.median, perRun: o.perRun })), null, 1));
  console.log('\nmedians of ' + RUNS + ' run(s)' + (ROOTS.length > 1 ? ', interleaved' : ''));
  ROOTS.forEach((r, k) => console.log('  [' + String.fromCharCode(65 + k) + '] ' + r));
  console.log('metric'.padEnd(36) + ROOTS.map((r, k) => ('[' + String.fromCharCode(65 + k) + ']').padStart(10)).join('') + '   runs');
  for (const key of Object.keys(meds[0])) {
    console.log(key.padEnd(36) + meds.map((m) => String(m[key]).padStart(10)).join('') + '   ' + sums.map((ss) => ss.map((s) => s[key]).join('/')).join('  |  '));
  }
  const errs = per.flat().flatMap((r) => [].concat(r.desktop ? r.desktop.errors : [], r.phone ? r.phone.errors : []));
  if (errs.length) { console.log('\nconsole/page errors:'); for (const e of [...new Set(errs)].slice(0, 20)) console.log('  ' + e); }
})().catch((e) => { console.error(e); process.exit(1); });
