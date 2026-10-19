/* NOSTALGIA — tests/lazy3d.cjs (per-model lazy loading of the Blender models, ARCHITECTURE §21 "Shipping")
 * Headless Chromium + SwiftShader; three.js is served from vendor/ by routing the jsDelivr URL.
 *
 *  site   the website build: dist/site (assembled with `bash tools/deploy_site.sh --dry-run`, run here unless
 *         NOBUILD=1) served over http by python3 -m http.server under a subpath (/DS/, like GitHub Pages).
 *         In 3D (tps) the player is teleported to RTC X Roads, St Joseph's, MGBS, the Spanish Mosque and
 *         Begumpet: each spot's landmarks must end up drawn by their Blender model (m3d-lm:<model>:<landmark>,
 *         swapped in after the procedural stand-in), only GLBs of lazy landmarks within build range of the
 *         visited spots may be fetched (network log, all 200, each at most once), zero console errors.
 *  file   dist/nostalgia.html from file:// (the single-file build: core pack inline, lazy models degrade to
 *         procedural): 3D starts, the models3d core pack loads, no lazy fetch is attempted, the RTC X Roads
 *         cinemas are procedural, zero console errors.
 * Screenshots: tests/out/lazy3d_<spot>.png, tests/out/lazy3d_file_rtc.png.
 *   node nostalgia/tests/lazy3d.cjs        ONLY=site|file   NOBUILD=1   SHOTS=0
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const SITE = path.join(ROOT, 'dist', 'site');
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const SHOTS = process.env.SHOTS !== '0';
const LM_DIST = 650;   // landmark build range for the test (the game: 1650 high tier / 1100 phones)
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
let cur = '';
const fail = (msg) => { failures.push('[' + cur + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const want = (k) => !ONLY || ONLY.has(k);

// spots: the landmarks that must be drawn by their (lazy) Blender model there
const SPOTS = [
  { name: 'rtc_x_roads', look: 'sandhya_theatre', lms: { sandhya_theatre: 'sandhya_theatre', odeon_theatre: 'odeon_theatre', sudarshan_theatre: 'sudarshan_theatre', devi_theatre: 'devi_theatre' } },
  { name: 'st_josephs', look: 'church_st_josephs', lms: { church_st_josephs: 'st_josephs_cathedral' } },
  { name: 'mgbs', look: 'imlibun_bus_station', lms: { imlibun_bus_station: 'imlibun_mgbs' } },
  { name: 'spanish_mosque', look: 'spanish_mosque', lms: { spanish_mosque: 'spanish_mosque' } },
  { name: 'begumpet', look: 'begumpet_airport', lms: { begumpet_airport: 'begumpet_airport', atc_tower: 'atc_tower', aeroplane_1: 'parked_plane' } },
];

function freePort() {
  return new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
}
function get(url) {
  return new Promise((res) => { const r = http.get(url, (x) => { x.resume(); res(x.statusCode); }); r.on('error', () => res(0)); r.setTimeout(2000, () => { r.destroy(); res(0); }); });
}
async function serveSite() {
  // <tmp>/DS -> dist/site, so the game runs at http://127.0.0.1:<port>/DS/ like GitHub Pages
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nostalgia-lazy3d-'));
  fs.symlinkSync(SITE, path.join(dir, 'DS'));
  const port = await freePort();
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', dir], { stdio: 'ignore' });
  const base = 'http://127.0.0.1:' + port + '/DS/';
  for (let i = 0; i < 200; i++) { if ((await get(base)) === 200) break; await new Promise((r) => setTimeout(r, 100)); }
  return { base, stop() { try { proc.kill(); } catch (e) { /* ignore */ } try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ } } };
}

async function openPage(browser, url) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('requestfinished', async (rq) => { if (/lazy3d\//.test(rq.url())) { const r = await rq.response(); requests.push({ url: rq.url(), status: r ? r.status() : 0 }); } });
  page.on('requestfailed', (rq) => { if (/lazy3d\//.test(rq.url())) requests.push({ url: rq.url(), status: -1, failure: rq.failure() && rq.failure().errorText }); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(url);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    N.debug.freezeClock(true);
    N.debug.setTime(11, 0);
    N.debug.god(true);
    N.view.noPointerLock = true;
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
  });
  return { context, page, errors, requests };
}
async function to3D(page) {
  await page.evaluate((lmd) => { N.view3d.setQuality({ adaptive: false, pixelRatio: 1, drawDist: 700 }); N.view3d.quality.lmDist = lmd; N.view.set('tps'); }, LM_DIST);
  await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 180000 });
  await page.waitForFunction(() => N.models3d && ['ready', 'missing', 'failed'].indexOf(N.models3d.state) >= 0, null, { timeout: 240000 });
}
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);
/** stand in front of a landmark (its face side) and look at it; returns the player spot */
function placeAt(page, id) {
  return page.evaluate((id) => {
    const lm = N.WORLD_DATA.landmarks.find((l) => l.id === id);
    const F = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
    const f = isFinite(lm.faceAngle) ? [Math.cos(lm.faceAngle), Math.sin(lm.faceAngle)] : F[lm.face] || F.s;
    const dist = Math.max(lm.w, lm.d) / 2 + 55 + (lm.h || 20) * 0.8;
    const p = N.debug.teleport(lm.x + f[0] * dist, lm.y + f[1] * dist);
    N.view3d.setCamera({ yaw: Math.atan2(lm.y - p.y, lm.x - p.x), pitch: 0.12, snap: true });
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }, id);
}
/** which lazy model draws each landmark (if any): the core's key order '#<id>' then the draw id */
const LAZY_OF = () => {
  const LK = N.models3d.debug.S.landmarkKeys, lazy = new Set(N.models3d.stats().lazy.keys);
  const out = {};
  for (const lm of N.WORLD_DATA.landmarks) {
    const k = LK.has('#' + lm.id) ? '#' + lm.id : LK.has(lm.draw) ? lm.draw : null;
    if (k && lazy.has(k)) out[lm.id] = LK.get(k);
  }
  return out;
};
/** lazy model ids whose landmarks come within (1.2 x) build range of any visited point */
const allowedLazy = ({ pts, lmDist }) => {
  const of = (window.__lazyOf = window.__lazyOf || {});
  const out = new Set();
  for (const lm of N.WORLD_DATA.landmarks) {
    const id = of[lm.id]; if (!id) continue;
    const reach = (lmDist + Math.max(lm.w, lm.d) * 0.5 + (lm.h || 0) * 2) * 1.2;
    for (const p of pts) {
      const dx = Math.max(lm.x - lm.w / 2 - p.x, 0, p.x - lm.x - lm.w / 2), dy = Math.max(lm.y - lm.d / 2 - p.y, 0, p.y - lm.y - lm.d / 2);
      if (Math.hypot(dx, dy) <= reach) { out.add(id); break; }
    }
  }
  return Array.from(out);
};
async function shot(page, name) {
  if (!SHOTS) return;
  await frames(page, 3);
  await page.screenshot({ path: path.join(OUT, name), timeout: 180000 });
  ok('screenshot tests/out/' + name);
}

/* ---------------------------------------------------------------- site (http, subpath) */
async function testSite(browser) {
  cur = 'site';
  console.log('\n== website build over http at /DS/ (dist/site)');
  if (process.env.NOBUILD !== '1') {
    execFileSync('bash', [path.join(ROOT, 'tools', 'deploy_site.sh'), '--dry-run'], { stdio: 'pipe' });
    ok('assembled dist/site (tools/deploy_site.sh --dry-run)');
  }
  check(fs.existsSync(path.join(SITE, 'lazy3d')) && fs.readdirSync(path.join(SITE, 'lazy3d')).filter((f) => f.endsWith('.glb')).length === 30, 'dist/site/lazy3d holds the 30 lazy GLBs next to index.html');
  const srv = await serveSite();
  const { context, page, errors, requests } = await openPage(browser, srv.base + '#debug');
  try {
    const idx = await page.evaluate(() => ({ index: !!N.ASSETS3D_INDEX, n: Object.keys(N.ASSETS3D_INDEX.manifest).length, pack: !!N.ASSETS3D, from: N.ASSETS3D_INDEX.from }));
    check(idx.index && idx.n === 87 && !idx.pack && !idx.from, 'the index is inline and loaded at boot (87 models), the pack is not (top-down)', JSON.stringify(idx));
    await page.waitForTimeout(500);
    check(requests.length === 0, 'no lazy GLB is fetched in top-down', JSON.stringify(requests));
    const start = await page.evaluate(() => ({ x: N.player.x, y: N.player.y }));
    await to3D(page);
    const st = await page.evaluate(() => N.models3d.stats());
    check(st.state === 'ready' && st.lazy.index === 30 && st.lazy.keys.length >= 28 && st.lazy.possible, 'models3d ready from the core pack; the 30 lazy models registered their landmark keys from the index', JSON.stringify({ state: st.state, err: st.error, lazy: st.lazy }));
    const lazyOf = await page.evaluate(LAZY_OF);
    await page.evaluate((m) => { window.__lazyOf = m; }, lazyOf);
    const visited = [start];
    for (const sp of SPOTS) {
      console.log('  -- ' + sp.name);
      const p = await placeAt(page, sp.look);
      visited.push(p);
      // wait on game state: every listed landmark drawn by its Blender model
      const ids = Object.keys(sp.lms);
      let res = null;
      try {
        await page.waitForFunction((lms) => {
          const names = new Set(N.view3d.engine.lmGroup.children.map((c) => c.name));
          return Object.entries(lms).every(([lm, mid]) => names.has('m3d-lm:' + mid + ':' + lm));
        }, sp.lms, { timeout: 180000, polling: 250 });
        res = true;
      } catch (e) { res = false; }
      const have = await page.evaluate((lms) => {
        const by = {};
        for (const c of N.view3d.engine.lmGroup.children) by[c.name.replace(/^m3d-lm:[^:]+:|^lm3d:|^lm:/, '')] = c.name;
        return Object.keys(lms).map((lm) => lm + '=' + (by[lm] || 'none'));
      }, sp.lms);
      check(res, sp.name + ': ' + ids.join(', ') + ' drawn by their Blender models', have.join(' '));
      await page.evaluate(() => N.view3d.snapCamera());
      await shot(page, 'lazy3d_' + sp.name + '.png');
    }
    const after = await page.evaluate(() => N.models3d.stats());
    const allow = new Set(await page.evaluate(allowedLazy, { pts: visited, lmDist: LM_DIST }));
    const fetchedIds = requests.map((r) => (r.url.match(/lazy3d\/([a-z0-9_]+)\.glb/) || [])[1]);
    const extra = fetchedIds.filter((id) => !allow.has(id));
    const dup = fetchedIds.filter((id, i) => fetchedIds.indexOf(id) !== i);
    const bad = requests.filter((r) => r.status !== 200);
    const need = new Set([].concat(...SPOTS.map((s) => Object.values(s.lms))));
    console.log('  fetched (' + fetchedIds.length + '): ' + fetchedIds.join(' '));
    console.log('  allowed by range (' + allow.size + '): ' + Array.from(allow).sort().join(' '));
    check(bad.length === 0, 'every lazy GLB request answered 200 (no 404 fallbacks tried)', JSON.stringify(bad));
    check(requests.every((r) => r.url.indexOf(srv.base + 'lazy3d/') === 0), 'lazy GLBs come from /DS/lazy3d/ next to index.html', requests.slice(0, 2).map((r) => r.url).join(' '));
    check(extra.length === 0, 'only lazy GLBs of landmarks within build range of the visited spots were fetched', 'extra: ' + extra.join(', '));
    check(dup.length === 0, 'each lazy GLB was fetched once', dup.join(', '));
    check(Array.from(need).every((id) => fetchedIds.includes(id)), 'every lazy model the spots need was fetched');
    check(fetchedIds.length < 30 && !fetchedIds.includes('hitec_office') && !fetchedIds.includes('lal_darwaza_temple'), 'far lazy models (HITEC office, Lal Darwaza) were not fetched (' + fetchedIds.length + ' of 30)');
    check(after.lazy.swaps >= need.size && Object.keys(after.failed).length === 0, 'procedural stand-ins were swapped for the models (' + after.lazy.swaps + ' swaps), nothing failed', JSON.stringify(after.failed));
    const nerr = await page.evaluate(() => (N.debug.state().errors || []));
    const all = errors.concat(nerr.map((e) => 'N.err: ' + e));
    check(all.length === 0, 'zero console / page / N.err errors', all.slice(0, 6).join(' | '));
  } finally {
    await context.close();
    srv.stop();
  }
}

/* ---------------------------------------------------------------- file:// single-file build */
async function testFile(browser) {
  cur = 'file';
  console.log('\n== dist/nostalgia.html from file:// (single file: lazy models stay procedural)');
  const url = 'file://' + path.join(ROOT, 'dist', 'nostalgia.html') + '#debug';
  const { context, page, errors, requests } = await openPage(browser, url);
  try {
    await to3D(page);
    const st = await page.evaluate(() => N.models3d.stats());
    check(st.state === 'ready' && st.packFrom === 'inline' && st.lazy.index === 30 && !st.lazy.possible && st.lazy.keys.length === 0, 'core pack from the inline block; lazy models known from the index but not fetchable from file:// (no keys registered)', JSON.stringify({ state: st.state, packFrom: st.packFrom, lazy: st.lazy }));
    await placeAt(page, 'sandhya_theatre');
    let built = false;
    try {
      await page.waitForFunction(() => {
        const names = new Set(N.view3d.engine.lmGroup.children.map((c) => c.name));
        return ['sandhya_theatre', 'odeon_theatre', 'sudarshan_theatre', 'devi_theatre'].every((id) => names.has('lm3d:' + id));
      }, null, { timeout: 180000, polling: 250 });
      built = true;
    } catch (e) { built = false; }
    const names = await page.evaluate(() => N.view3d.engine.lmGroup.children.map((c) => c.name).filter((n) => /theatre/.test(n)));
    check(built && !names.some((n) => /^m3d-lm:/.test(n)), 'the RTC X Roads cinemas are drawn procedurally (view3d_landmarks)', names.join(' '));
    check(requests.length === 0, 'no lazy GLB request was made', JSON.stringify(requests));
    await page.evaluate(() => N.view3d.snapCamera());
    await shot(page, 'lazy3d_file_rtc.png');
    const nerr = await page.evaluate(() => (N.debug.state().errors || []));
    const all = errors.concat(nerr.map((e) => 'N.err: ' + e));
    check(all.length === 0, 'zero console / page / N.err errors', all.slice(0, 6).join(' | '));
  } finally { await context.close(); }
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (want('site')) await testSite(browser);
    if (want('file')) await testFile(browser);
  } catch (e) { fail('exception: ' + (e.stack || e.message)); }
  await browser.close();
  console.log('\n' + (failures.length ? 'FAILED ' + failures.length + ':\n  ' + failures.join('\n  ') : 'ALL OK') + ' (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  process.exit(failures.length ? 1 : 0);
})();
