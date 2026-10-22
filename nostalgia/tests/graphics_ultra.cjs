/* NOSTALGIA — tests/graphics_ultra.cjs  (src/view3d_post.js: the Graphics setting and the Ultra tier)
 * Headless Chromium + SwiftShader WebGL (three.js served from vendor/ like tests/ameerpet.cjs).
 *  1. the setting: a Graphics row (Auto / Low / High / Ultra) under Screen; Auto keeps a software GPU on High; the
 *     GPU classifier knows discrete / Apple-silicon (strong), mobile / software (weak) and integrated (unknown)
 *  2. High -> Ultra live: post pipeline on (AO, bloom, sky), 4096 shadow map, 8 point lights, a lit frame
 *  3. with every effect at zero the pipeline draws what a direct render draws (it starts from the High frame:
 *     tone mapping, sRGB, fog and the raw glow shaders all match; the world paused between the two shots)
 *  4. Ultra -> High live restores the core state (no post, core sky, 2048 shadow map, 4 point lights); to Low with
 *     the engine running waits for a reload
 *  5. a stored 'ultra' applies at boot, before the engine exists (engine-creation values)
 *  6. zero console errors, page errors and N.err
 *
 *   node nostalgia/tests/graphics_ultra.cjs          (SHOTS=0 skips the screenshots)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'graphics_ultra');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const SHOTS = process.env.SHOTS !== '0';
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const check = (cond, m, detail) => (cond ? ok(m) : fail(m + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 400) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(page) {
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
}
// mean of the frame's pixels and the mean absolute difference of two frames (PNG buffers), via the page's canvas
async function frameStats(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const load = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + u; });
    const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
    const A = px(await load(a)), B = b ? px(await load(b)) : null;
    let s = 0, d = 0;
    for (let i = 0; i < A.length; i += 4) { s += A[i] + A[i + 1] + A[i + 2]; if (B) d += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); }
    const n = A.length / 4;
    return { mean: s / n / 3, diff: B ? d / n / 3 : null };
  }, [a.toString('base64'), b ? b.toString('base64') : null]);
}

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));

  console.log('\n== 1. the setting');
  await boot(page);
  await page.evaluate(() => { try { localStorage.removeItem('nostalgia.graphics'); localStorage.removeItem('nostalgia.graphics.autoDown'); } catch (e) { /* ignore */ } });
  await boot(page);
  const s1 = await page.evaluate(() => {
    N.menus.openSettings();
    const row = document.querySelector('.st-row[data-id="graphics"]');
    let sec = null;
    for (let e = row && row.previousElementSibling; e; e = e.previousElementSibling) if (!e.classList.contains('st-row')) { sec = e.textContent.trim(); break; }
    const opts = row ? Array.from(row.querySelectorAll('button')).map((b) => b.textContent.trim()) : [];
    N.menus.closePanel && N.menus.closePanel('settings');
    const G = N.graphics;
    return {
      row: !!row, sec, opts, setting: G.setting, auto: G.autoTier(), gpu: G.gpu().renderer,
      cls: ['NVIDIA GeForce RTX 3060/PCIe/SSE2', 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Apple M2', 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Mali-G78', 'Adreno (TM) 650', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'llvmpipe (LLVM 15.0.7, 256 bits)'].map((s) => G.classify(s)),
    };
  });
  check(s1.row && /Ultra/.test(s1.opts.join(' ')) && s1.opts.length >= 4, `settings has a Graphics row (${s1.opts.join(' / ')})${s1.sec ? ' under ' + s1.sec : ''}`, s1);
  check(s1.setting === 'auto' && s1.auto === 'high', `Auto on this software GPU picks High (${(s1.gpu || '').slice(0, 60)})`, s1);
  check(JSON.stringify(s1.cls) === JSON.stringify(['strong', 'strong', 'strong', 'unknown', 'weak', 'weak', 'weak', 'weak']), 'GPU classifier: discrete + Apple silicon strong, integrated unknown, mobile + software weak', s1.cls);

  console.log('\n== 2. High -> Ultra');
  await page.mouse.click(2, 2);
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); N.debug.god(true); N.view.noPointerLock = true; if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    const st = document.createElement('style'); st.textContent = '#prompt{display:none!important}'; document.head.appendChild(st);
    N.player.teleport(N.places.abids.x, N.places.abids.y); N.debug.setTime(17, 40);
    N.view3d.setQuality({ adaptive: false, pixelRatio: 1 }); N.view.set('tps');
  });
  await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 300000 });
  const settle = async () => { await page.evaluate(() => { N.view3d.setCamera({ yaw: 3.1, pitch: 0.05, snap: true }); N.view3d.settle(30000); if (N.hud && N.hud.hide) N.hud.hide(); }); await sleep(3500); await page.evaluate(() => N.view3d.settle(5000)); await sleep(2500); };
  await settle();
  const high0 = await page.evaluate(() => ({ tier: N.graphics.tier, post: N.graphics.stats().post, shadow: N.view3d.engine.sun.shadow.mapSize.x, points: N.view3d.engine.points.length }));
  const shotHigh = await page.screenshot({ timeout: 240000 });
  if (SHOTS) fs.writeFileSync(path.join(OUT, 'abids_high.png'), shotHigh);
  await page.evaluate(() => { N.graphics.set('ultra'); N.view3d.setQuality({ adaptive: false, pixelRatio: 1 }); });
  await settle();
  const ultra = await page.evaluate(() => { const E = N.view3d.engine; return { st: N.graphics.stats(), shadow: E.sun.shadow.mapSize.x, points: E.points.length, calls: E.calls, err: N.errors.length }; });
  const shotUltra = await page.screenshot({ timeout: 240000 });
  if (SHOTS) fs.writeFileSync(path.join(OUT, 'abids_ultra.png'), shotUltra);
  const fu = await frameStats(page, shotUltra);
  check(high0.tier === 'high' && !high0.post && high0.shadow === 2048 && high0.points === 4, 'before: High, no post, 2048 shadow map, 4 point lights', high0);
  check(ultra.st.tier === 'ultra' && ultra.st.post && ultra.st.ao && ultra.st.sky, 'Ultra live: post pipeline with AO, bloom and the Ultra sky', ultra.st);
  check(ultra.shadow === 4096 && ultra.points === 8, 'Ultra: 4096 shadow map, 8 point lights', ultra);
  check(fu.mean > 25 && ultra.st.calls > 20 && ultra.calls >= ultra.st.calls, `Ultra frame drawn (mean ${fu.mean.toFixed(1)}, ${ultra.st.calls} draw calls with the passes)`, { fu, ultra });

  console.log('\n== 3. the pipeline starts from the High frame');
  await page.evaluate(() => {
    const T = N.graphics.TUNE; window.__T = JSON.parse(JSON.stringify(T));
    Object.assign(T, { aoDay: 0, aoNight: 0, bloom: [0, 0], haze: [0, 0], shafts: 0, sat: 1, curve: 0, shadowTint: [0, 0, 0], highTint: [0, 0, 0], vignette: 0, grain: 0, sharpen: 0 });
    window.__mode = N.state.mode; N.state.mode = 'paused'; // (traffic and people hold still; 3D keeps drawing)
  });
  await sleep(3000);
  const viaPost = await page.screenshot({ timeout: 240000 });
  await page.evaluate(() => { window.__post = N.view3d.engine.post; N.view3d.engine.post = null; });
  await sleep(3000);
  const direct = await page.screenshot({ timeout: 240000 });
  await page.evaluate(() => { N.view3d.engine.post = window.__post; N.state.mode = window.__mode; Object.assign(N.graphics.TUNE, window.__T); });
  const fn = await frameStats(page, viaPost, direct);
  check(fn.diff < 1.5, `neutral pipeline = direct render (mean abs diff ${fn.diff.toFixed(2)} / 255)`, fn);

  console.log('\n== 4. Ultra -> High, and Low');
  await page.evaluate(() => { N.graphics.set('high'); });
  await sleep(1500);
  const back = await page.evaluate(() => { const E = N.view3d.engine, st = N.graphics.stats(); return { st, shadow: E.sun.shadow.mapSize.x, points: E.points.length, post: !!E.post }; });
  check(back.st.tier === 'high' && !back.post && !back.st.sky && back.shadow === 2048 && back.points === 4, 'Ultra -> High live: no post, core sky, 2048 shadow map, 4 point lights', back);
  const low = await page.evaluate(() => { N.graphics.set('low'); const a = N.graphics.stats(); N.graphics.set('auto'); const b = N.graphics.stats(); return { a, b }; });
  check(low.a.pending === 'low' && low.a.tier === 'high' && low.b.pending === null, 'Low with the engine running waits for a reload (pending), Auto clears it', low);

  console.log('\n== 5. a stored Ultra applies at boot');
  // (top-down saved, so the title does not start 3D: this checks the values before the engine exists)
  await page.evaluate(() => { localStorage.setItem('nostalgia.graphics', 'ultra'); localStorage.setItem('nostalgia.view.v1', 'top'); });
  await boot(page);
  const st5 = await page.evaluate(() => { const Q = N.view3d.quality; return { setting: N.graphics.setting, tier: Q.tier, shadowSize: Q.shadowSize, pointLights: Q.pointLights, ready: N.view3d.ready }; });
  check(st5.setting === 'ultra' && st5.tier === 'ultra' && st5.shadowSize === 4096 && st5.pointLights === 8 && !st5.ready, 'stored Ultra: engine-creation values set before 3D starts', st5);
  await page.evaluate(() => { localStorage.removeItem('nostalgia.graphics'); });

  console.log('\n== 6. errors');
  const nerr = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + String(e.msg).split('\n')[0]));
  check(errors.length === 0 && nerr.length === 0, 'no console / page / N.err errors', errors.concat(nerr).slice(0, 5));

  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
