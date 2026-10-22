/* NOSTALGIA — tests/night_light.cjs  (night visibility: render.js night mask, view3d.js lamp pools / fill / exposure)
 * Headless Chromium + SwiftShader WebGL (three.js served from vendor/ like tests/graphics_ultra.cjs).
 * Two spots after dark: a colony lane at 23:10 (no street lamp near) and Abids at 21:30 (lamps everywhere).
 *  1. 2D: the player's own pool: the area round him clearly brighter than the frame, in the dark lane too; the lane
 *     not a black screen; how lit his spot is (render.js R.nightLit) tells the lane from the junction
 *  2. 3D: he is never darker than the frame round him (the soft fill light), the dark lane is not black; the lamp
 *     pools (16 lamps beyond the point lights) are fed at Abids; the eye adapts: more exposure in the lane than
 *     under the lamps
 *  3. zero console errors, page errors and N.err
 *   node nostalgia/tests/night_light.cjs          (SHOTS=0 skips the screenshots)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'night_light');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const SHOTS = process.env.SHOTS !== '0';
fs.mkdirSync(OUT, { recursive: true });
const failures = [];
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const check = (cond, m, detail) => (cond ? ok(m) : fail(m + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 500) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SPOTS = [
  { id: 'lane', place: 'home', t: [23, 10], dx: 30, dy: 0 },
  { id: 'abids', place: 'abids', t: [21, 30], dx: 40, dy: 40 },
];
// mean luminance of the whole frame and of the box round the screen centre (where the camera keeps the player)
async function stats(page, buf) {
  return page.evaluate(async (b64) => {
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    const lum = (x0, y0, x1, y1) => { let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; } return s / n; };
    return { all: +lum(0, 0, W, H).toFixed(1), me: +lum(W / 2 - 40 | 0, H / 2 - 70 | 0, W / 2 + 40 | 0, H / 2 + 40 | 0).toFixed(1) };
  }, buf.toString('base64'));
}

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL, { timeout: 180000 });
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.mouse.click(2, 2);
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); N.debug.god(true); N.view.noPointerLock = true; if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    const st = document.createElement('style'); st.textContent = '#prompt,#hud,.hud,#toasts{display:none!important}'; document.head.appendChild(st);
  });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 30000 });
  const R = {};
  for (const view of ['top', 'tps']) {
    console.log(`\n== ${view === 'top' ? '1. 2D' : '2. 3D'}`);
    if (view === 'tps') { await page.evaluate(() => { N.view3d.setQuality({ adaptive: false, pixelRatio: 1 }); N.view.set('tps'); }); await page.waitForFunction(() => N.view.mode === 'tps' && N.view3d.ready, null, { timeout: 300000 }); }
    for (const s of SPOTS) {
      await page.evaluate((s) => { const q = N.places[s.place]; N.player.teleport(q.x + s.dx, q.y + s.dy); N.debug.setTime(s.t[0], s.t[1]); if (N.render.snapCamera) N.render.snapCamera(); }, s);
      if (view === 'tps') await page.evaluate(() => { N.view3d.setCamera({ yaw: 0.6, pitch: 0.28, snap: true }); N.view3d.settle(30000); });
      await sleep(view === 'tps' ? 6000 : 2500);
      const buf = await page.screenshot({ timeout: 240000 });
      if (SHOTS) fs.writeFileSync(path.join(OUT, `${view}_${s.id}.png`), buf);
      const st = await stats(page, buf);
      const ns = await page.evaluate(() => {
        const s3 = N.view3d && N.view3d.ready ? N.view3d.nightState : null;
        return { lit2d: +(N.render.nightLit || 0).toFixed(2), night: N.render.night, s3: s3 ? { lit: s3.lit, expo: s3.expo } : null, pools: s3 ? s3.pools : 0 };
      });
      R[view + '_' + s.id] = Object.assign(st, ns);
      console.log('  ..   ' + view + ' ' + s.id + ' ' + JSON.stringify(R[view + '_' + s.id]));
    }
    if (view === 'top') {
      const a = R.top_lane, b = R.top_abids;
      check(a.me > a.all * 1.3 && a.me > 85, `2D dark lane: the area round him (${a.me}) well above the frame (${a.all}): he has a pool of his own`, a);
      check(a.all > 55, `2D dark lane: not a black screen (frame ${a.all})`, a);
      check(b.me > b.all, `2D Abids: he stands out among the lamps (${b.me} vs frame ${b.all})`, b);
      check(b.lit2d > a.lit2d + 0.3, `his spot's light tells the lane (${a.lit2d}) from the junction (${b.lit2d})`, { a, b });
    } else {
      const a = R.tps_lane, b = R.tps_abids;
      check(a.me >= a.all * 0.95 && a.me > 40, `3D dark lane: he is not darker than the frame round him (${a.me} vs ${a.all}): the soft fill`, a);
      check(a.all > 30 && a.all < 85, `3D dark lane: not a black screen, still night (frame ${a.all})`, a);
      check(b.me > 55, `3D Abids: he is lit among the lamps (the area round him ${b.me}; frame ${b.all})`, b);
      check(b.pools >= 4 && a.pools <= b.pools, `3D Abids: the lamp pools fed (${b.pools} lamps beyond the point lights lighting the ground, walls and people; ${a.pools} in the lane)`, { a, b });
      check(a.s3 && b.s3 && a.s3.expo > b.s3.expo + 0.05, `the eye adapts: exposure ${a.s3 && a.s3.expo.toFixed(2)} in the lane, ${b.s3 && b.s3.expo.toFixed(2)} under the lamps`, { a: a.s3, b: b.s3 });
    }
  }
  console.log('\n== 3. errors');
  const nerr = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + String(e.msg).split('\n')[0]));
  check(errors.length === 0 && nerr.length === 0, 'no console / page / N.err errors', errors.concat(nerr).slice(0, 6));
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
