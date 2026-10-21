/* NOSTALGIA — tests/qa_perf.cjs (performance / 3D quality / loading / memory audit; design/audit/performance.md)
 *
 * Measures in-page JS time (performance.now inside the page, CDP main-thread CPU), never wall time alone: the
 * machine is shared (other agents' browsers) and renders WebGL with SwiftShader (software GL), so 3D GPU time and
 * fps here mean nothing. Every timing judgement is scaled by a calibration loop run in the same page (cal = ms
 * for a fixed JS loop; CAL_REF = the same loop on a quiet host) and skipped when the host is overloaded; structural
 * budgets (draw calls, triangles, programs, textures, geometries, heap growth, errors, bytes) always apply.
 *
 * Sections (ONLY=boot,idle2d,frames2d,switch3d,frames3d,walk3d,soak,ctxloss,storage,build; default: boot, idle2d,
 * switch3d, frames3d (Charminar + Koti only; FULL=1 or any ONLY= for all four spots), ctxloss, storage, build):
 *   boot      desktop 1280x720 and phone 412x892 @2.625 + 4x CPU: navigation -> title usable, main-thread CPU, world
 *             build, long tasks, JS heap after GC; title -> first controllable play frame (newGame, warm chunks)
 *   idle2d    what 3D / atmosphere systems cost a player who stays top-down (title + first 20 s of play): per-system
 *             CPU (N.systems.profile), the longest single update, long tasks
 *   frames2d  per-system update (per 60 Hz step) + draw (per frame) at Charminar night, Numaish, Diwali night (home
 *             colony) and Koti at the evening peak, desktop and phone (4x)
 *   switch3d  top -> 3D: time to the first 3D frame, long tasks while warming, the biggest frame, shader programs
 *   frames3d  3D tps at the same spots: N.view3d.profile phases (camera / work / actors / layers / renderer.render),
 *             draw calls, triangles, textures, geometries (desktop high tier; phone low tier + 4x)
 *   walk3d    a 3D drive across the city at ~150 u/s (chunk / landmark streaming): worst frame, frames > 33 ms JS
 *   soak      SOAK_MIN minutes (default 6; the audit ran 30): enter / leave 3D, teleports, festivals (Diwali night,
 *             Numaish), weather, a party race; heap after GC, GPU resources, scene objects, DOM nodes, errors
 *   ctxloss   WebGL context lost + restored at a busy spot (Diwali night 3D): back to 3D, frames render, no errors,
 *             screenshot tests/out/qa_perf_ctx_restored.png
 *   storage   localStorage keys / sizes after play; a full quota (every write throws) never breaks the game
 *   build     tools/build.mjs twice -> byte-identical dist pages; tools/deploy_site.sh --dry-run -> every file the
 *             page loads by relative URL is in dist/site; byte budgets (gzip) for the pages + lazy files
 * Output: tests/out/qa_perf/results.json (+ PNGs tests/out/qa_perf_*.png). Fails on any page / console error.
 *   node nostalgia/tests/qa_perf.cjs     ONLY=...   SOAK_MIN=30   PROFILES=desktop,phone   SHOTS=0
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const RES = path.join(OUT, 'qa_perf');
fs.mkdirSync(RES, { recursive: true });
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
// default run (also tests/run_all.cjs): the regression sections; frames2d / walk3d / soak are diagnostics (ONLY=...)
const DEFAULT = ['boot', 'idle2d', 'switch3d', 'frames3d', 'ctxloss', 'storage', 'build'];
const ONLY = (process.env.ONLY || DEFAULT.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const FULL = process.env.FULL === '1' || !!process.env.ONLY; // all four busy spots in frames3d (default run: two)
const PROFILES = (process.env.PROFILES || 'desktop,phone').split(',');
const SHOTS = process.env.SHOTS !== '0';
const SOAK_MIN = +process.env.SOAK_MIN || 6;
// the calibration loop on a quiet host (ms); budgets below are for that host and scale with cal / CAL_REF
const CAL_REF = 8;
const want = (s) => ONLY.includes(s);

const failures = [];
const results = { when: new Date().toISOString(), host: { cores: os.cpus().length, load: os.loadavg() }, sections: {} };
let cur = '';
const fail = (msg) => { failures.push('[' + cur + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const info = (msg) => console.log('  ..   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const med = (a) => { a = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const pct = (a, p) => { a = a.filter((x) => isFinite(x)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const overloaded = () => os.loadavg()[0] > os.cpus().length * 2.5;

const PROFILE = {
  desktop: { ctx: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, cpu: 1 },
  phone: { ctx: { viewport: { width: 412, height: 892 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }, cpu: 4 },
};

/* ------------------------------------------------------------------ page helpers */
// software compositing (--disable-gpu: rAF ticks; WebGL still runs on SwiftShader), --expose-gc for heap after GC
const ARGS = ['--disable-gpu', '--enable-precise-memory-info', '--js-flags=--expose-gc', '--autoplay-policy=no-user-gesture-required'];
async function openPage(browser, prof, opts) {
  opts = opts || {};
  const P = PROFILE[prof];
  const context = await browser.newContext(Object.assign({}, P.ctx));
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message).slice(0, 400)));
  page.on('requestfailed', (rq) => { const u = rq.url(); if (!/fonts\.g/.test(u)) errors.push('requestfailed: ' + u.replace(/^file:\/\/\/home\/user\/DS\/nostalgia\//, '') + ' (' + ((rq.failure() && rq.failure().errorText) || '') + ')'); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable', { timeDomain: 'threadTicks' });
  if (P.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: P.cpu });
  await page.addInitScript(() => {
    // long tasks + the main loop's per-frame JS (main.js's rAF callback is a function named "frame")
    window.__lt = []; window.__fr = []; window.__bootAt = null;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* no longtask API */ }
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) => raf((t) => {
      if (fn.name !== 'frame') return fn(t);
      const a = performance.now();
      try { return fn(t); } finally { const fr = window.__fr; fr.push(performance.now() - a); if (fr.length > 4000) fr.splice(0, 2000); }
    });
    new MutationObserver(() => { if (!window.__bootAt && document.body && document.body.classList.contains('booted')) window.__bootAt = performance.now(); })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 600000, polling: 100 });
  const wall = Date.now() - t0;
  if (opts.game !== false) await newGame(page);
  return { context, page, errors, cdp, wall };
}
async function newGame(page, o) {
  await page.evaluate((o) => {
    N.debug.newGame(Object.assign({ skipIntro: true }, o || {})); N.debug.freezeClock(true); N.debug.god(true);
    N.view.noPointerLock = true; if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
  }, o || null);
}
const metrics = async (cdp) => (await cdp.send('Performance.getMetrics')).metrics.reduce((o, x) => (o[x.name] = x.value, o), {});
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);
/** host speed: ms for a fixed JS loop in the page (median of 9, so preemption by other processes counts); the ratio
 *  to CAL_REF (the same loop on a quiet host) scales the timing budgets */
const calibrate = (page) => page.evaluate(async () => { const v = []; for (let k = 0; k < 9; k++) { const t = performance.now(); let x = 2463534242; const a = new Float64Array(4096); for (let i = 0; i < 4e6; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; a[i & 4095] += (x & 1023) * 0.5; } v.push(performance.now() - t); if (a[7] < -1) return 0; await new Promise((r) => setTimeout(r, 30)); } v.sort((p, q) => p - q); return v[4]; });
const heapAfterGC = (page) => page.evaluate(() => { if (window.gc) { window.gc(); window.gc(); } return performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null; });
async function nerrs(page) { return page.evaluate(() => (N.errors || []).map((e) => e.where + ': ' + String(e.msg).split('\n')[0])); }
async function checkErrors(errors, page, what) {
  const all = errors.concat(await nerrs(page));
  check(all.length === 0, (what || 'no console / page / N.err errors'), all.slice(0, 5).join(' | '));
  return all;
}

// busy spots (resolved in the page): position, clock, calendar
const SPOTS = {
  charminar_night: { at: 'charminar', h: 21, m: 0 },
  numaish_evening: { at: 'giant_wheel', cal: [2003, 1, 20, 19, 30] },
  diwali_night: { at: 'diwali_home', cal: [2003, 10, 25, 20, 30] },
  koti_peak: { at: 'koti', h: 18, m: 10 },
};
async function stage(page, spot, view) {
  const S = SPOTS[spot];
  return page.evaluate(([S, view]) => {
    if (N.missions && N.missions.active && N.missions.abort) { try { N.missions.abort(); } catch (e) { /* none */ } }
    if (N.player.vehicle && N.vehicles.exit) N.vehicles.exit(N.player, true);
    if (S.cal) N.calendar.set(S.cal[0], S.cal[1], S.cal[2], S.cal[3], S.cal[4]);
    else N.calendar.set(2003, 1, 14, S.h, S.m); // a plain mid-February weekday (no festival)
    N.debug.setTime(S.cal ? S.cal[3] : S.h, S.cal ? S.cal[4] : S.m);
    let at = null;
    if (S.at === 'diwali_home' && N.diwali && N.diwali.spots && N.diwali.spots.home) { const h = N.diwali.spots.home; at = N.debug.teleport(h.x - 22, h.y - 15); }
    else at = N.debug.teleport(S.at);
    if (view) N.view.set(view);
    if (N.view3d && N.view3d.ready && view !== 'top') { N.view3d.setCamera({ yaw: -Math.PI / 2, pitch: 0.28, snap: true }); N.view3d.settle(30000); }
    return { at, clock: N.clock.label(), date: N.clock.dateLabel(), seasons: N.seasons && N.seasons.active ? N.seasons.active() : null };
  }, [S, view || 'top']);
}
/** run the real main loop for n frames (or ms) with both profilers on; per-frame JS from the rAF wrapper */
async function profileFrames(page, n, maxMs) {
  return page.evaluate(async ([n, maxMs]) => {
    N.systems.profile(true);
    const v3 = N.view3d && N.view3d.ready && N.view3d.active;
    if (v3) N.view3d.profile(true);
    window.__fr.length = 0; window.__lt.length = 0;
    const t0 = performance.now();
    await new Promise((r) => { let k = 0; const f = () => (++k >= n || performance.now() - t0 > maxMs ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const sp = N.systems.profile(false), vp = v3 ? N.view3d.profile(false) : null;
    const fr = window.__fr.slice();
    const st = v3 ? N.view3d.stats() : null;
    const R = N.render.stats;
    return { frames: fr, sys: sp, v3: vp, stats: st, ents: N.entities.count(), lt: window.__lt.slice(), ms: performance.now() - t0, queued: R.queued, r2d: Object.assign({}, R.ms) };
  }, [n, maxMs || 60000]);
}
function summariseFrames(p) {
  const steps = p.sys ? p.sys.steps : 0, draws = p.sys ? p.sys.draws : 0;
  const upd = p.sys ? p.sys.systems.reduce((a, s) => a + s.update, 0) : 0; // ms per 60 Hz step
  const drw = p.sys ? p.sys.systems.reduce((a, s) => a + s.draw, 0) : 0;   // ms per frame (systems' draw)
  return {
    frames: p.frames.length, frameMed: r2(med(p.frames)), frameP95: r2(pct(p.frames, 0.95)), frameMax: r2(Math.max(0, ...p.frames)),
    stepsPerFrame: r2(steps / Math.max(1, draws)), updPerStep: r2(upd), sysDrawPerFrame: r2(drw),
    top: p.sys ? p.sys.systems.slice(0, 12).map((s) => [s.id, r2(s.update), r2(s.draw), s.updateMax]) : [],
    longTasks: p.lt.length, longMax: Math.max(0, ...p.lt.map((x) => x[1])), ents: p.ents,
  };
}

/* ================================================================ boot */
async function boot(browser) {
  cur = 'boot'; console.log('\n== boot (navigation -> title, title -> first controllable frame)');
  const out = {};
  for (const prof of PROFILES) {
    const runs = [];
    for (let i = 0; i < 2; i++) {
      const { context, page, errors, cdp, wall } = await openPage(browser, prof, { game: false });
      const m = await metrics(cdp);
      const b = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        return { bootAt: Math.round(window.__bootAt || performance.now()), dcl: Math.round(nav.domContentLoadedEventEnd), build: N.world.buildMs, lt: window.__lt.slice(), scripts: document.scripts.length };
      });
      const cal = await calibrate(page);
      const heap = await heapAfterGC(page);
      // first control: newGame (warm chunks) -> the next frame -> the player responds to input
      const fc = await page.evaluate(async () => {
        const t0 = performance.now();
        N.debug.newGame({ skipIntro: true }); N.debug.god(true); if (N.dialogue) N.dialogue.skip = true;
        const tNew = performance.now() - t0;
        const p0 = { x: N.player.x, y: N.player.y };
        N.input.setMove(1, 0, false);
        await new Promise((r) => { const f = () => (Math.hypot(N.player.x - p0.x, N.player.y - p0.y) > 2 || performance.now() - t0 > 30000 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
        N.input.setMove(null);
        return { newGameMs: Math.round(tNew), firstMoveMs: Math.round(performance.now() - t0) };
      });
      const lt = b.lt.filter((x) => x[0] <= b.bootAt + 50);
      runs.push({ wall, bootAt: b.bootAt, dcl: b.dcl, build: b.build, cpu: Math.round(m.ThreadTime * 1000), script: Math.round(m.ScriptDuration * 1000), longN: lt.length, longMax: Math.max(0, ...lt.map((x) => x[1])), heap: r1(heap), cal: r1(cal), ...fc });
      if (i === 0) await checkErrors(errors, page, prof + ': no errors through boot + first control');
      await context.close();
    }
    const M = (k) => med(runs.map((r) => r[k]));
    out[prof] = { runs, bootAt: M('bootAt'), cpu: M('cpu'), build: M('build'), dcl: M('dcl'), heap: M('heap'), newGameMs: M('newGameMs'), firstMoveMs: M('firstMoveMs'), longMax: M('longMax'), cal: M('cal') };
    const o = out[prof], f = Math.max(1, o.cal / CAL_REF / PROFILE[prof].cpu);
    info(prof + ': title at ' + o.bootAt + ' ms (DCL ' + o.dcl + ', world.build ' + o.build + ' ms), main-thread CPU ' + o.cpu + ' ms, heap after GC ' + o.heap + ' MB, longest task ' + o.longMax + ' ms; newGame ' + o.newGameMs + ' ms, first move ' + o.firstMoveMs + ' ms (cal ' + o.cal + ' ms, host factor ' + f.toFixed(2) + ')');
    const B = prof === 'desktop' ? { cpu: 2600, heap: 140, fm: 1500 } : { cpu: 9000, heap: 140, fm: 5000 };
    if (overloaded()) info('timing budgets not judged: load ' + os.loadavg()[0].toFixed(1));
    else {
      check(o.cpu <= B.cpu * f, prof + ': boot main-thread CPU ' + o.cpu + ' ms <= ' + Math.round(B.cpu * f));
      check(o.firstMoveMs <= B.fm * f, prof + ': title -> first move ' + o.firstMoveMs + ' ms <= ' + Math.round(B.fm * f));
    }
    check(o.heap <= B.heap, prof + ': JS heap after boot ' + o.heap + ' MB <= ' + B.heap + ' MB');
  }
  results.sections.boot = out;
}

/* ================================================================ idle2d: what 3D costs a top-down player */
async function idle2d(browser) {
  cur = 'idle2d'; console.log('\n== idle2d (3D / atmosphere background work while the game stays top-down)');
  const out = {};
  for (const prof of PROFILES) {
    const { context, page, errors } = await openPage(browser, prof, { game: false });
    const r = await page.evaluate(async () => {
      // title screen for 6 s, then 20 s of top-down play walking
      N.systems.profile(true); window.__lt.length = 0; window.__fr.length = 0;
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, 6000));
      const title = N.systems.profile(); N.systems.profile(true);
      N.debug.newGame({ skipIntro: true }); N.debug.god(true); if (N.dialogue) N.dialogue.skip = true;
      N.input.setMove(1, 0.3, false);
      await new Promise((r) => setTimeout(r, 20000));
      N.input.setMove(null);
      const play = N.systems.profile(false);
      const g = N.view3d && N.view3d.ground ? N.view3d.ground.stats() : {};
      return { title, play, lt: window.__lt.slice(), fr: window.__fr.slice(), g: { analyzed: g.analyzed, precomputed: g.precomputed, analyzeMs: g.analyzeMs, anaMax: g.anaMax, soilMs: g.soilMs, itemMaxMs: g.clear && g.clear.itemMaxMs }, three: !!window.THREE, ms: performance.now() - t0 };
    });
    const row = (P, id) => { const s = P.systems.find((x) => x.id === id); return s ? { perStep: r2(s.update), total: Math.round(s.update * P.steps), max: s.updateMax } : null; };
    const ids = ['view3d_ground', 'view3d', 'wires', 'birds', 'atmosphere', 'weather2d', 'weather3d', 'wind', 'models3d', 'diwali', 'citylife', 'citylife_events'];
    const o = { title: {}, play: {}, ground: r.g, three: r.three, longTasks: r.lt.length, longMax: Math.max(0, ...r.lt.map((x) => x[1])), frameMax: r2(Math.max(0, ...r.fr)) };
    for (const id of ids) { o.title[id] = row(r.title, id); o.play[id] = row(r.play, id); }
    o.titleTop = r.title.systems.slice(0, 6).map((s) => [s.id, Math.round(s.update * r.title.steps), s.updateMax]);
    o.playTop = r.play.systems.slice(0, 8).map((s) => [s.id, r2(s.update), s.updateMax]);
    out[prof] = o;
    const g = o.play.view3d_ground || {}, gt = o.title.view3d_ground || {};
    info(prof + ': view3d_ground on the title ' + (gt.total || 0) + ' ms (max ' + (gt.max || 0) + '), in play ' + (g.total || 0) + ' ms (max ' + (g.max || 0) + ' ms); analysis ' + JSON.stringify(r.g) + '; longest task ' + o.longMax + ' ms; worst frame ' + o.frameMax + ' ms');
    info(prof + ': title top ' + JSON.stringify(o.titleTop) + ' play top (ms/step) ' + JSON.stringify(o.playTop));
    check(!r.three, prof + ': three.js is not loaded while the game stays top-down');
    // a device that never used 3D pays no frame time for the 3D ground analysis (idle callbacks only)
    check((g.total || 0) + (gt.total || 0) < 200, prof + ': 3D-ground analysis took no frame time on a device that never used 3D (' + ((g.total || 0) + (gt.total || 0)) + ' ms in title + 20 s of play; idle callbacks only)');
    const f = Math.max(1, (await calibrate(page)) / CAL_REF / PROFILE[prof].cpu);
    const cap = (prof === 'desktop' ? 30 : 110) * f;
    if (!overloaded()) check((g.max || 0) <= cap && (gt.max || 0) <= cap * 2, prof + ': no single 3D-ground background slice longer than ' + Math.round(cap) + ' ms in play (' + (g.max || 0) + ') / ' + Math.round(cap * 2) + ' ms on the title (' + (gt.max || 0) + ')');
    await checkErrors(errors, page);
    await context.close();
  }
  results.sections.idle2d = out;
}

/* ================================================================ frames2d */
async function frames2d(browser) {
  cur = 'frames2d'; console.log('\n== frames2d (per-system CPU at busy spots, top-down)');
  const out = {};
  for (const prof of PROFILES) {
    const { context, page, errors } = await openPage(browser, prof);
    out[prof] = {};
    for (const spot of Object.keys(SPOTS)) {
      const at = await stage(page, spot, 'top');
      await page.evaluate(() => N.input.setMove(0.6, 0.2, false));
      await frames(page, 30);
      const p = await profileFrames(page, prof === 'phone' ? 40 : 90, 40000);
      await page.evaluate(() => N.input.setMove(null));
      const s = summariseFrames(p);
      s.r2d = Object.fromEntries(Object.entries(p.r2d).map(([k, v]) => [k, r2(v)]));
      s.queued = p.queued; s.at = at;
      out[prof][spot] = s;
      info(prof + ' ' + spot + ' (' + at.date + ' ' + at.clock + '): frame JS median ' + s.frameMed + ' ms (p95 ' + s.frameP95 + ', max ' + s.frameMax + ', ' + s.stepsPerFrame + ' steps/frame), systems update ' + s.updPerStep + ' ms/step + draw ' + s.sysDrawPerFrame + ' ms/frame, ' + s.ents + ' entities, ' + s.queued + ' queued');
      info('   top [id, upd ms/step, draw ms/frame, worst update]: ' + JSON.stringify(s.top.slice(0, 8)));
    }
    await checkErrors(errors, page);
    await context.close();
  }
  results.sections.frames2d = out;
}

/* ================================================================ switch3d */
async function switch3d(browser) {
  cur = 'switch3d'; console.log('\n== switch3d (top -> 3D)');
  const out = {};
  for (const prof of PROFILES) {
    const { context, page, errors, cdp } = await openPage(browser, prof);
    await stage(page, 'charminar_night', 'top');
    await frames(page, 20);
    const m0 = await metrics(cdp);
    const r = await page.evaluate(async () => {
      window.__lt.length = 0; window.__fr.length = 0;
      const t0 = performance.now();
      N.view.set('tps');
      await new Promise((r) => { const f = () => (N.view.mode === 'tps' || performance.now() - t0 > 240000 ? r() : setTimeout(f, 30)); f(); });
      const tReady = performance.now() - t0;
      const nf = window.__fr.length;
      await new Promise((r) => { let k = 0; const f = () => (++k >= 3 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      const first = window.__fr.slice(nf);
      const warm = window.__fr.slice(0, nf);
      const s = N.view3d.stats(), g = N.view3d.ground.stats();
      const progs = (N.view3d.engine.renderer.info.programs || []).map((p) => p.name);
      return { readyMs: Math.round(tReady), warmFrames: warm.length, warmMax: Math.max(0, ...warm), warmOver50: warm.filter((x) => x > 50).length, firstFrames: first.map(Math.round), lt: window.__lt.slice(), stats: s, ground: { analyzeMs: g.analyzeMs, avgChunkMs: g.avgChunkMs, stepMax: g.stepMax, provMaxMs: g.provMaxMs }, programs: progs };
    });
    const m1 = await metrics(cdp);
    r.cpu = Math.round((m1.ThreadTime - m0.ThreadTime) * 1000);
    out[prof] = r;
    const names = {}; for (const n of r.programs) names[n] = (names[n] || 0) + 1;
    info(prof + ': 3D ready in ' + r.readyMs + ' ms (main-thread CPU ' + r.cpu + ' ms); warm-up ' + r.warmFrames + ' frames, worst ' + Math.round(r.warmMax) + ' ms, ' + r.warmOver50 + ' > 50 ms; first 3D frames ' + JSON.stringify(r.firstFrames) + ' ms JS; ' + r.stats.programs + ' shader programs ' + JSON.stringify(names));
    info(prof + ': long tasks ' + JSON.stringify(r.lt.slice(0, 12)) + ' ground ' + JSON.stringify(r.ground));
    check(r.stats.programs <= 64, prof + ': shader programs after the switch ' + r.stats.programs + ' <= 64');
    await checkErrors(errors, page);
    await context.close();
  }
  results.sections.switch3d = out;
}

/* ================================================================ frames3d */
async function frames3d(browser) {
  cur = 'frames3d'; console.log('\n== frames3d (3D tps at busy spots: JS per phase, draw calls, triangles)');
  const out = {};
  for (const prof of PROFILES) {
    const { context, page, errors } = await openPage(browser, prof);
    // a small canvas keeps SwiftShader's GPU-process time down; JS cost does not depend on it
    await page.evaluate(() => { N.view.set('tps'); });
    await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 240000 });
    await page.evaluate(() => N.view3d.setQuality({ adaptive: false, pixelRatio: 0.35 }));
    out[prof] = {};
    for (const spot of FULL ? Object.keys(SPOTS) : ['charminar_night', 'koti_peak']) {
      const at = await stage(page, spot, 'tps');
      await page.evaluate(() => N.input.setMove(0, -0.5, false));
      await frames(page, 6);
      const p = await profileFrames(page, prof === 'phone' ? 14 : 24, 120000);
      await page.evaluate(() => N.input.setMove(null));
      const s = summariseFrames(p);
      const v = p.v3 || { ms: {}, max: {} };
      const phases = Object.entries(v.ms).filter(([k]) => !/^actor:/.test(k)).sort((a, b) => b[1] - a[1]).map(([k, x]) => [k, r2(x), r2(v.max[k])]);
      const actors = Object.entries(v.ms).filter(([k]) => /^actor:/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, x]) => [k, r2(x)]);
      const v3total = Object.entries(v.ms).filter(([k]) => !/^actor:/.test(k)).reduce((a, [, x]) => a + x, 0);
      const o = Object.assign(s, { at, v3ms: r2(v3total), v3frameMax: v.frameMax, phases, actors, calls: p.stats.calls, tris: p.stats.triangles, geometries: p.stats.geometries, textures: p.stats.textures, programs: p.stats.programs, chunks: p.stats.chunks, landmarks: p.stats.landmarks, actorsN: p.stats.actors, tier: p.stats.tier });
      out[prof][spot] = o;
      info(prof + ' ' + spot + ': frame JS median ' + o.frameMed + ' ms (max ' + o.frameMax + '), view3d.render ' + o.v3ms + ' ms/frame, systems update ' + o.updPerStep + ' ms/step x ' + o.stepsPerFrame + '; ' + o.calls + ' calls, ' + Math.round(o.tris / 1000) + 'k tris, ' + o.geometries + ' geo, ' + o.textures + ' tex, ' + o.programs + ' programs, ' + o.landmarks + ' landmarks, ' + o.actorsN + ' actors');
      info('   phases [k, avg, max]: ' + JSON.stringify(phases.slice(0, 10)));
      info('   actors: ' + JSON.stringify(actors) + ' systems: ' + JSON.stringify(s.top.slice(0, 6)));
      if (SHOTS && prof === 'desktop') {
        await page.evaluate(() => N.view3d.setQuality({ pixelRatio: 1 }));
        await frames(page, 2);
        const f = path.join(OUT, 'qa_perf_3d_' + spot + '.png');
        await page.screenshot({ path: f, timeout: 300000 });
        await page.evaluate(() => N.view3d.setQuality({ pixelRatio: 0.35 }));
        info('   shot ' + path.relative(ROOT, f));
      }
      const B = prof === 'desktop' ? { calls: 420, tris: 1500000 } : { calls: 300, tris: 700000 };
      check(o.calls <= B.calls, prof + ' ' + spot + ': draw calls ' + o.calls + ' <= ' + B.calls);
      check(o.tris <= B.tris, prof + ' ' + spot + ': triangles ' + Math.round(o.tris / 1000) + 'k <= ' + B.tris / 1000 + 'k');
    }
    const sc = await page.evaluate(() => N.view3d.signCheck ? N.view3d.signCheck() : null);
    if (sc) check(sc.stale === 0 && sc.negative === 0 && sc.dropped === 0, prof + ': sign atlas intact after the spots (' + sc.held + ' boards held, ' + sc.recycled + ' cells recycled, ' + sc.dropped + ' dropped, ' + sc.stale + ' stale)', JSON.stringify(sc));
    await checkErrors(errors, page);
    await context.close();
  }
  results.sections.frames3d = out;
}

/* ================================================================ walk3d: streaming while moving */
async function walk3d(browser) {
  cur = 'walk3d'; console.log('\n== walk3d (3D drive across the city: chunk / landmark streaming hitches)');
  const out = {};
  for (const prof of PROFILES) {
    const { context, page, errors } = await openPage(browser, prof);
    await page.evaluate(() => { N.debug.setTime(17, 30); N.view.set('tps'); });
    await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 240000 });
    await page.evaluate(() => N.view3d.setQuality({ adaptive: false, pixelRatio: 0.3 }));
    // a long arterial: the player is carried along its polyline at 150 u/s of frame time (dt per frame as the
    // game sees it, so streaming meets the city at a believable speed whatever the host's frame rate)
    const r = await page.evaluate(async ([secs]) => {
      const roads = (N.world.data.roads || []).filter((r) => r.pts && r.pts.length > 3);
      const len = (r) => { let L = 0; for (let i = 1; i < r.pts.length; i++) L += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]); return L; };
      roads.sort((a, b) => len(b) - len(a));
      const road = roads.find((r) => /arterial|highway|main/.test(r.kind || '')) || roads[0];
      const P = road.pts, seg = []; let L = 0;
      for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push([L, d, P[i - 1], P[i]]); L += d; }
      const at = (s) => { for (const g of seg) if (s <= g[0] + g[1]) { const t = (s - g[0]) / g[1]; return [g[2][0] + (g[3][0] - g[2][0]) * t, g[2][1] + (g[3][1] - g[2][1]) * t, Math.atan2(g[3][1] - g[2][1], g[3][0] - g[2][0])]; } return null; };
      const p0 = at(0); N.debug.teleport(p0[0], p0[1]); N.view3d.settle(20000);
      N.view3d.profile(true); N.systems.profile(true); window.__fr.length = 0; window.__lt.length = 0;
      let s = 0, last = performance.now(), dist = 0; const t0 = performance.now();
      await new Promise((res) => {
        const f = () => {
          const t = performance.now(), dt = Math.min(0.1, (t - last) / 1000); last = t;
          s += 150 * Math.max(dt, 1 / 60); const q = at(s);
          if (!q || t - t0 > secs * 1000) return res();
          N.player.x = q[0]; N.player.y = q[1]; N.player.angle = q[2]; N.player.facing = q[2]; dist = s;
          N.view3d.setCamera({ yaw: q[2], pitch: 0.25 });
          requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      });
      const vp = N.view3d.profile(false); N.systems.profile(false);
      return { road: road.id, roadLen: Math.round(L), dist: Math.round(dist), fr: window.__fr.slice(), lt: window.__lt.slice(), vp, stats: N.view3d.stats(), g: N.view3d.ground.stats() };
    }, [prof === 'phone' ? 90 : 60]);
    const o = { road: r.road, dist: r.dist, frames: r.fr.length, frameMed: r2(med(r.fr)), frameP95: r2(pct(r.fr, 0.95)), frameMax: r2(Math.max(0, ...r.fr)), over33: r.fr.filter((x) => x > 33).length, over100: r.fr.filter((x) => x > 100).length, workAvg: r2(r.vp.ms.work), workMax: r.vp.max.work, renderMax: r.vp.max.render, v3frameMax: r.vp.frameMax, chunks: r.stats.chunks, geometries: r.stats.geometries, textures: r.stats.textures, groundAvgChunkMs: r.g.avgChunkMs, groundStepMax: r.g.stepMax, longMax: Math.max(0, ...r.lt.map((x) => x[1])) };
    out[prof] = o;
    info(prof + ': ' + o.dist + ' u along ' + o.road + ' in ' + o.frames + ' frames: frame JS median ' + o.frameMed + ' ms, p95 ' + o.frameP95 + ', max ' + o.frameMax + ' (' + o.over33 + ' > 33 ms, ' + o.over100 + ' > 100 ms); streaming avg ' + o.workAvg + ' ms, worst ' + r2(o.workMax) + ' ms; renderer worst ' + r2(o.renderMax) + ' ms; ground step max ' + JSON.stringify(o.groundStepMax));
    const f = Math.max(1, (await calibrate(page)) / CAL_REF / PROFILE[prof].cpu);
    if (!overloaded()) check(o.workMax <= (prof === 'desktop' ? 40 : 120) * f, prof + ': worst streaming slice ' + r2(o.workMax) + ' ms <= ' + Math.round((prof === 'desktop' ? 40 : 120) * f) + ' ms (budget ' + (prof === 'desktop' ? 3.5 : 2.5) + ' ms + one item)');
    await checkErrors(errors, page);
    await context.close();
  }
  results.sections.walk3d = out;
}

/* ================================================================ soak */
async function soak(browser) {
  cur = 'soak'; console.log('\n== soak (' + SOAK_MIN + ' min: 3D in / out, teleports, festivals, weather, a party race)');
  const { context, page, errors } = await openPage(browser, 'desktop');
  await page.evaluate(() => { N.view.set('tps'); });
  await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 240000 });
  await page.evaluate(() => N.view3d.setQuality({ adaptive: false, pixelRatio: 0.25, drawDist: 900 }));
  const sample = () => page.evaluate(() => {
    if (window.gc) { window.gc(); window.gc(); }
    const s = N.view3d.stats();
    let objs = 0; if (N.view3d.engine.scene) N.view3d.engine.scene.traverse(() => objs++);
    let ls = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls += k.length + (localStorage.getItem(k) || '').length; } } catch (e) { ls = -1; }
    return { heap: performance.memory.usedJSHeapSize / 1048576, geo: s.geometries, tex: s.textures, prog: s.programs, objs, dom: document.getElementsByTagName('*').length, ents: N.entities.count(), errs: N.errors.length, ls, mode: N.view.mode, chunks: s.chunks, landmarks: s.landmarks };
  });
  const cycle = async (i) => {
    const spots = Object.keys(SPOTS);
    const spot = spots[i % spots.length];
    await stage(page, spot, i % 3 === 2 ? 'fps' : 'tps');
    await page.evaluate((i) => { if (N.weather && N.weather.force) N.weather.force(i % 4 === 1 ? { rain: 1 } : i % 4 === 3 ? { storm: 1 } : null); N.input.setMove(Math.cos(i), Math.sin(i), true); }, i);
    await frames(page, 12);
    if (i % 5 === 4 && N_PARTY) await page.evaluate(() => { try { if (N.party && N.party.solo) N.party.solo('chai_run'); } catch (e) { /* not available here */ } });
    await frames(page, 6);
    await page.evaluate(() => { N.input.setMove(null); N.view.set('top'); });
    await frames(page, 10);
    await page.evaluate(() => { try { if (N.party && N.party.active && N.party.end) N.party.end(); else if (N.party && N.party.abort) N.party.abort(); } catch (e) { /* none */ } if (N.minigames && N.minigames.active && N.minigames.exit) { try { N.minigames.exit(); } catch (e) { /* none */ } } });
  };
  const N_PARTY = await page.evaluate(() => !!(N.party && N.party.solo));
  const samples = [];
  const t0 = Date.now();
  let i = 0;
  await cycle(i++); await cycle(i++);
  samples.push(Object.assign({ min: 0, cyc: i }, await sample()));
  while (Date.now() - t0 < SOAK_MIN * 60000) {
    await cycle(i++);
    if (i % 4 === 0) { const s = await sample(); s.min = r1((Date.now() - t0) / 60000); s.cyc = i; samples.push(s); info('t=' + s.min + ' min cycle ' + i + ': heap ' + r1(s.heap) + ' MB, ' + s.geo + ' geo, ' + s.tex + ' tex, ' + s.prog + ' programs, ' + s.objs + ' scene objects, ' + s.dom + ' DOM, ' + s.ents + ' entities, ' + s.errs + ' errors, ls ' + s.ls + ' chars'); }
  }
  await page.evaluate(() => { N.view.set('tps'); N.debug.teleport('charminar'); N.view3d.settle(20000); });
  await frames(page, 4);
  const last = Object.assign({ min: r1((Date.now() - t0) / 60000), cyc: i }, await sample());
  samples.push(last);
  // growth after the first two cycles (warm caches, LRUs filled): linear fit of heap over time
  const base = samples[Math.min(1, samples.length - 1)];
  const xs = samples.slice(1).map((s) => s.min), ys = samples.slice(1).map((s) => s.heap);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((a, x, k) => a + (x - mx) * (ys[k] - my), 0) / Math.max(1e-9, xs.reduce((a, x) => a + (x - mx) * (x - mx), 0));
  const o = { minutes: last.min, cycles: i, samples, heapSlopeMBperMin: r2(slope), heapFirst: r1(samples[0].heap), heapLast: r1(last.heap), geoFirst: base.geo, geoLast: last.geo, texFirst: base.tex, texLast: last.tex, progLast: last.prog };
  results.sections.soak = o;
  info('soak: ' + o.cycles + ' cycles in ' + o.minutes + ' min; heap ' + o.heapFirst + ' -> ' + o.heapLast + ' MB (slope ' + o.heapSlopeMBperMin + ' MB/min), geometries ' + o.geoFirst + ' -> ' + o.geoLast + ', textures ' + o.texFirst + ' -> ' + o.texLast + ', programs ' + o.progLast);
  // a slope needs a few samples over 10+ minutes; a short run is judged on the net change instead
  if (xs.length >= 4 && xs[xs.length - 1] - xs[0] >= 10) check(slope < 1.5, 'soak: heap growth ' + r2(slope) + ' MB/min < 1.5 MB/min (' + xs.length + ' samples over ' + r1(xs[xs.length - 1] - xs[0]) + ' min)');
  else check(last.heap <= base.heap + 40, 'soak (short run): heap ' + r1(base.heap) + ' -> ' + r1(last.heap) + ' MB (<= +40 MB)');
  check(last.tex <= base.tex + 40 && last.geo <= base.geo + 400, 'soak: GPU resources bounded (textures ' + base.tex + ' -> ' + last.tex + ', geometries ' + base.geo + ' -> ' + last.geo + ')');
  // programs accumulate per content type (festivals, models, first person...) until every spot has been seen once:
  // after the first round of spots (sample 2+) they must stay put
  const progRef = (samples[2] || samples[samples.length - 1]).prog;
  check(last.prog <= progRef + 6 && last.prog <= 110, 'soak: shader programs bounded (' + progRef + ' after the first round of spots -> ' + last.prog + ')');
  await checkErrors(errors, page);
  await context.close();
}

/* ================================================================ ctxloss */
async function ctxloss(browser) {
  cur = 'ctxloss'; console.log('\n== ctxloss (WebGL context lost + restored at a busy spot)');
  const { context, page, errors } = await openPage(browser, 'desktop');
  await page.evaluate(() => { N.view.set('tps'); });
  await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 240000 });
  await page.evaluate(() => N.view3d.setQuality({ adaptive: false, pixelRatio: 0.5 }));
  await stage(page, 'diwali_night', 'tps');
  await frames(page, 4);
  const before = await page.evaluate(() => N.view3d.stats());
  await page.evaluate(() => { const gl = N.view3d.engine.renderer.getContext(); window.__lc = gl.getExtension('WEBGL_lose_context'); window.__lc.loseContext(); });
  await page.waitForTimeout(800);
  const lost = await page.evaluate(() => ({ mode: N.view.mode, want: N.view.want }));
  check(lost.mode === 'top' && lost.want === 'tps', 'context lost -> top-down while it is away', JSON.stringify(lost));
  await frames(page, 5);
  await page.evaluate(() => window.__lc.restoreContext());
  let back = false;
  try { await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 240000 }); back = true; } catch (e) { /* checked */ }
  check(back, 'context restored -> back in 3D');
  await page.evaluate(() => N.view3d.settle(30000));
  await frames(page, 6);
  const after = await page.evaluate(() => N.view3d.stats());
  info('before ' + JSON.stringify({ calls: before.calls, tris: before.triangles, tex: before.textures, geo: before.geometries }) + ' after ' + JSON.stringify({ calls: after.calls, tris: after.triangles, tex: after.textures, geo: after.geometries }));
  check(after.calls >= before.calls * 0.6 && after.triangles >= before.triangles * 0.6, 'the restored scene draws again (' + after.calls + ' calls / ' + Math.round(after.triangles / 1000) + 'k tris vs ' + before.calls + ' / ' + Math.round(before.triangles / 1000) + 'k)');
  if (SHOTS) {
    await page.evaluate(() => N.view3d.setQuality({ pixelRatio: 1 }));
    await frames(page, 2);
    await page.screenshot({ path: path.join(OUT, 'qa_perf_ctx_restored.png'), timeout: 300000 });
    info('shot tests/out/qa_perf_ctx_restored.png');
  }
  // a second loss while still warming must not wedge the view either
  await page.evaluate(() => { window.__lc.loseContext(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__lc.restoreContext());
  try { await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 240000 }); ok('second loss + restore -> 3D again'); } catch (e) { fail('second loss + restore did not come back to 3D'); }
  results.sections.ctxloss = { before: { calls: before.calls, tris: before.triangles }, after: { calls: after.calls, tris: after.triangles } };
  await checkErrors(errors, page);
  await context.close();
}

/* ================================================================ storage */
async function storage(browser) {
  cur = 'storage'; console.log('\n== storage (localStorage use; a full quota)');
  const { context, page, errors } = await openPage(browser, 'desktop');
  await stage(page, 'charminar_night', 'top');
  await page.evaluate(async () => { if (N.save && N.save.autosave) N.save.autosave('autosave'); N.view.set('tps'); });
  await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 240000 });
  await page.evaluate(() => { N.view3d.setQuality({ adaptive: false, pixelRatio: 0.3 }); N.view.set('top'); if (N.save && N.save.autosave) N.save.autosave('autosave'); });
  const ls = await page.evaluate(() => { const o = {}; let total = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const n = (localStorage.getItem(k) || '').length; o[k] = n; total += n + k.length; } let idb = null; return { keys: o, total }; });
  info('localStorage ' + Object.keys(ls.keys).length + ' keys, ' + ls.total + ' chars: ' + JSON.stringify(Object.entries(ls.keys).sort((a, b) => b[1] - a[1]).slice(0, 12)));
  check(ls.total < 1024 * 1024, 'localStorage use ' + Math.round(ls.total / 1024) + ' KB (UTF-16: x2 bytes) < 1 MB of the ~5 MB quota');
  // full quota: every setItem throws QuotaExceededError; the game, 3D and saving must carry on
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    window.__lsOrig = orig;
    Storage.prototype.setItem = function () { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; };
  });
  await page.evaluate(() => { N.view.set('tps'); N.debug.teleport('abids'); });
  await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 240000 });
  await frames(page, 4);
  const q = await page.evaluate(() => {
    let saved = null; try { saved = N.save && N.save.autosave ? N.save.autosave('autosave') : null; } catch (e) { saved = 'threw: ' + e.message; }
    try { if (N.weather && N.weather.setSetting) N.weather.setSetting('rain'); } catch (e) { return { threw: 'weather ' + e.message }; }
    N.view.set('fps'); N.view.set('top');
    Storage.prototype.setItem = window.__lsOrig;
    return { saved: String(saved), mode: N.view.mode };
  });
  await frames(page, 4);
  info('full quota: save -> ' + q.saved + ', view ' + q.mode);
  check(!q.threw, 'full quota: settings writes do not throw', q.threw);
  results.sections.storage = { ls, quota: q };
  await checkErrors(errors, page, 'full quota: no console / page / N.err errors');
  await context.close();
}

/* ================================================================ build + deploy (dry run) */
function build() {
  cur = 'build'; console.log('\n== build (reproducible dist, deploy dry run, byte budgets)');
  const files = ['nostalgia.html', 'artifact.html', 'web.html', 'artifact.files.json'];
  const hash = () => Object.fromEntries(files.map((f) => [f, crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, 'dist', f))).digest('hex').slice(0, 12)]));
  const lazyHash = () => { const d = path.join(ROOT, 'dist', 'lazy3d'); return fs.existsSync(d) ? crypto.createHash('sha1').update(fs.readdirSync(d).sort().map((f) => f + crypto.createHash('sha1').update(fs.readFileSync(path.join(d, f))).digest('hex')).join()).digest('hex').slice(0, 12) : null; };
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs')], { stdio: 'pipe' });
  const a = hash(), la = lazyHash();
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs')], { stdio: 'pipe' });
  const b = hash(), lb = lazyHash();
  check(JSON.stringify(a) === JSON.stringify(b) && la === lb, 'tools/build.mjs is reproducible (two builds byte-identical: ' + JSON.stringify(b) + ', lazy3d ' + lb + ')', JSON.stringify(a) + ' vs ' + JSON.stringify(b));
  // deploy dry run: dist/site holds every file the page loads by a relative URL
  const out = execFileSync('bash', [path.join(ROOT, 'tools', 'deploy_site.sh'), '--dry-run', '--from-dist'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  info(out.trim().split('\n').pop());
  const SITE = path.join(ROOT, 'dist', 'site');
  const web = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const need = ['src/assets3d_pack.js', 'vendor/three/three.min.js', 'vendor/three/GLTFLoader.classic.js', 'vendor/supabase/supabase.js'];
  // (the generated index is evaluated: its manifest entries carry nested objects)
  const win = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src', 'assets3d_index.js'), 'utf8'), { window: win, document: {} });
  const man = (win.N && win.N.ASSETS3D_INDEX && win.N.ASSETS3D_INDEX.manifest) || {};
  const lazyIds = Object.keys(man).filter((id) => man[id] && man[id].lazy);
  check(lazyIds.length > 0, 'the generated 3D index lists lazy models (' + lazyIds.length + ')');
  for (const id of lazyIds) need.push('lazy3d/' + id + '.glb');
  const missing = need.filter((f) => !fs.existsSync(path.join(SITE, f)));
  check(missing.length === 0, 'dist/site has every lazily loaded file (' + need.length + ': pack, three.js + GLTFLoader fallback, supabase-js fallback, ' + lazyIds.length + ' lazy GLBs)', missing.join(', '));
  // relative URLs named in the page source that are not in the site
  const rel = new Set();
  for (const m of web.matchAll(/['"`]((?:\.\.\/)?(?:vendor|src|lazy3d|assets3d|dist)\/[A-Za-z0-9_./-]+\.(?:js|glb|json|woff2|css|png|webp))['"`]/g)) rel.add(m[1]);
  const relMissing = Array.from(rel).filter((u) => !u.startsWith('../') && !u.startsWith('dist/') && !fs.existsSync(path.join(SITE, u)));
  check(relMissing.length === 0, 'every relative file URL in the page exists in dist/site (' + rel.size + ' named)', relMissing.join(', '));
  const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
  const sz = (f) => { const b = fs.readFileSync(path.join(SITE, f)); return { raw: b.length, gzip: gz(b) }; };
  const sizes = { 'index.html': sz('index.html'), 'src/assets3d_pack.js': sz('src/assets3d_pack.js'), 'vendor/three/three.min.js': sz('vendor/three/three.min.js'), 'vendor/three/GLTFLoader.classic.js': sz('vendor/three/GLTFLoader.classic.js') };
  let lazyRaw = 0; for (const id of lazyIds) lazyRaw += fs.statSync(path.join(SITE, 'lazy3d', id + '.glb')).size;
  sizes.lazy3d = { raw: lazyRaw, n: lazyIds.length };
  const kb = (x) => Math.round(x / 1024) + ' KB';
  info('site bytes (raw / gzip -9): index.html ' + kb(sizes['index.html'].raw) + ' / ' + kb(sizes['index.html'].gzip) + ', pack ' + kb(sizes['src/assets3d_pack.js'].raw) + ' / ' + kb(sizes['src/assets3d_pack.js'].gzip) + ', three ' + kb(sizes['vendor/three/three.min.js'].gzip) + ' gz, lazy GLBs ' + kb(lazyRaw) + ' (' + lazyIds.length + ')');
  check(sizes['index.html'].gzip <= 2900 * 1024, 'first download (index.html gzip) ' + kb(sizes['index.html'].gzip) + ' <= 2900 KB');
  check(sizes['src/assets3d_pack.js'].gzip <= 3400 * 1024, 'core model pack gzip ' + kb(sizes['src/assets3d_pack.js'].gzip) + ' <= 3400 KB');
  // the website page's scripts are stripped of comments / indentation (tools/build.mjs stripJs): every one must parse to
  // the same program as its source (TypeScript's parser + printer, when TypeScript is installed: it is not a dependency)
  let ts = null; try { ts = require('/opt/node22/lib/node_modules/typescript'); } catch (e) { /* not installed */ }
  if (ts) {
    const pr = ts.createPrinter({ removeComments: true });
    const norm = (name, text) => pr.printFile(ts.createSourceFile(name, text, ts.ScriptTarget.ES2020, false, ts.ScriptKind.JS));
    const bad = []; let n = 0;
    for (const m of web.matchAll(/<script>\/\* ([^*\n]+) \*\/\n([\s\S]*?)\n<\/script>/g)) {
      const src = fs.readFileSync(path.join(ROOT, m[1]), 'utf8').replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
      n++;
      if (norm(m[1], src) !== norm(m[1], m[2])) bad.push(m[1]);
    }
    check(n > 40 && bad.length === 0, 'dist/web.html: all ' + n + ' stripped scripts parse to the same program as their sources (TypeScript AST print)', bad.join(', '));
  } else info('TypeScript not installed: stripped-script AST check skipped');
  // the lazily fetched pack is cache-busted per build content (a redeploy never mixes an old pack with a new page)
  const v = (web.match(/N\.BUILD\s*=\s*(\{[^<]*?\})/) || [])[1];
  check(!!v && /pack/.test(v), 'the page carries per-file content hashes for its lazy files (N.BUILD)', v || 'missing');
  results.sections.build = { hashes: b, lazy: lb, sizes, missing, relMissing, build: v || null };
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (want('boot')) await boot(browser);
    if (want('idle2d')) await idle2d(browser);
    if (want('frames2d')) await frames2d(browser);
    if (want('switch3d')) await switch3d(browser);
    if (want('frames3d')) await frames3d(browser);
    if (want('walk3d')) await walk3d(browser);
    if (want('ctxloss')) await ctxloss(browser);
    if (want('storage')) await storage(browser);
    if (want('soak')) await soak(browser);
  } catch (e) { fail('exception: ' + (e.stack || e.message)); }
  await browser.close();
  try { if (want('build')) build(); } catch (e) { cur = 'build'; fail('exception: ' + (e.stack || e.message)); }
  results.host.loadEnd = os.loadavg();
  results.failures = failures;
  const file = path.join(RES, 'results' + (process.env.TAG ? '_' + process.env.TAG : '') + '.json');
  fs.writeFileSync(file, JSON.stringify(results, null, 1));
  console.log('\nresults: ' + path.relative(process.cwd(), file));
  console.log('\n' + (failures.length ? 'FAILED ' + failures.length + ':\n  ' + failures.join('\n  ') : 'ALL OK') + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  process.exit(failures.length ? 1 : 0);
})();
