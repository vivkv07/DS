/* NOSTALGIA — tests/hills.cjs  (hills.js: Banjara Hills and Jubilee Hills, 2003)
 * Headless Chromium + SwiftShader WebGL (three.js served from vendor/ like tests/graphics_ultra.cjs).
 *  1. the dressing: dozens of bungalows and a strip of shops in the two districts, many kinds of shop, invented
 *     names only; a dressed bungalow is restyled (rich walls, 2-3 floors) with a portico, gold rails, a gate in its
 *     compound wall's gap, palms, bougainvillea and garden lamps
 *  2. cars in the drives: near a bungalow its car is parked in the drive (a foreign car, an SUV or an Ambassador),
 *     gone again when he is far
 *  3. the strip at night (2D): the neon and the garden lamps light the night (render.js lights)
 *  4. screenshots: 2D and 3D, day and night, Road No. 1 and a bungalow gate
 *  5. zero console errors, page errors and N.err
 *   node nostalgia/tests/hills.cjs          (SHOTS=0 skips the screenshots)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'hills');
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
const gwait = (pg, s) => pg.evaluate((s) => window.__gw(s), s);

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  await page.addInitScript(GW);
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
    N.debug.setTime(11, 0);
  });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 30000 });

  console.log('\n== 1. the dressing');
  const d1 = await page.evaluate(() => {
    const H = N.hills, st = H.stats(), names = new Set(H.SHOPS.map((s) => s.n));
    const shops = H.dressed.filter((s) => s.kind === 'shop'), bung = H.dressed.filter((s) => s.kind === 'bungalow');
    const signsOk = shops.every((s) => s.b.sign && names.has(s.b.sign.text));
    const ex = bung.find((s) => s.gate && s.palms.length && s.boug.length && s.lamps.length);
    return { st, signsOk, kinds: Object.keys(st.byKind).length, ex: ex ? { wall: ex.b.wall, h: ex.b.h, rich: H.RICH.walls.indexOf(ex.b.wall) >= 0, rails: ex.rails.length, gate: !!ex.gate, palms: ex.palms.length, boug: ex.boug.length, lamps: ex.lamps.length, car: ex.car && ex.car.type } : null };
  });
  check(d1.st.bungalows >= 30 && d1.st.shops >= 8, `Banjara + Jubilee Hills dressed: ${d1.st.bungalows} bungalows, ${d1.st.shops} shops on the strip`, d1.st);
  check(d1.kinds >= 5 && d1.signsOk, `the strip: ${d1.kinds} kinds of shop (${Object.entries(d1.st.byKind).map((e) => e[0] + ' ' + e[1]).join(', ')}), every board an invented name`, d1);
  check(d1.ex && d1.ex.rich && d1.ex.h >= 22 && d1.ex.gate && d1.ex.palms === 2 && d1.ex.boug > 0 && d1.ex.lamps > 0, `a dressed bungalow: rich walls (${d1.ex && d1.ex.wall}), ${d1.ex && d1.ex.h / 10 | 0} floors, ${d1.ex && d1.ex.rails} rails, a gate, palms, bougainvillea, garden lamps, car: ${d1.ex && d1.ex.car}`, d1.ex);

  console.log('\n== 2. cars in the drives');
  const d2 = await page.evaluate(async () => {
    const s = N.hills.dressed.find((q) => q.car); if (!s) return { found: false };
    N.player.teleport(s.car.x + 60, s.car.y + 60); if (N.render.snapCamera) N.render.snapCamera();
    await window.__gw(1.0);
    const v = s.car.v, near = v && v.alive ? { type: v.type, d: Math.hypot(v.x - s.car.x, v.y - s.car.y), parked: !!v.parked, driver: !!v.driver } : null;
    N.player.teleport(s.car.x + 1200, s.car.y); await window.__gw(1.0);
    const gone = !s.car.v;
    return { found: true, near, gone, want: s.car.type };
  });
  check(d2.found && d2.near && d2.near.d < 3 && d2.near.parked && !d2.near.driver, `near a bungalow its car is in the drive (${d2.near && d2.near.type})`, d2);
  check(d2.gone, 'and it is cleared when he is far', d2);

  console.log('\n== 3. the strip at night');
  const d3 = await page.evaluate(async () => {
    const s = N.hills.dressed.find((q) => q.kind === 'shop'); if (!s) return null;
    N.player.teleport(s.cx, s.cy + 40); N.debug.setTime(21, 30); if (N.render.snapCamera) N.render.snapCamera();
    await window.__gw(0.6);
    // count this frame's night lights near the shop (render.js consumes R.lights each frame: sample in a draw)
    let n = 0; const R = N.render, orig = R.lights.push.bind(R.lights);
    R.lights.push = function (...a) { for (const L of a) if (L && Math.hypot(L.x - s.cx, L.y - s.cy) < 120 && L.color && L.r) n++; return orig(...a); };
    await window.__gw(0.4);
    R.lights.push = orig;
    return { n, night: R.night };
  });
  check(d3 && d3.n > 0 && d3.night > 0.5, `neon and garden lamps light the night (${d3 && d3.n} lights round a strip shop)`, d3);

  console.log('\n== 4. screenshots');
  if (SHOTS) {
    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 240000 }); };
    const goShop = () => page.evaluate(() => { const s = N.hills.dressed.filter((q) => q.kind === 'shop').sort((a, b) => a.cy - b.cy)[3] || N.hills.dressed.find((q) => q.kind === 'shop'); N.player.teleport(s.cx + 20, s.cy + 34); if (N.render.snapCamera) N.render.snapCamera(); return { x: s.cx, y: s.cy }; });
    const goBung = () => page.evaluate(() => { const s = N.hills.dressed.find((q) => q.kind === 'bungalow' && q.gate && q.car) || N.hills.dressed.find((q) => q.kind === 'bungalow' && q.gate); const G = s.gate; N.player.teleport(G.x + G.o[0] * 26, G.y + G.o[1] * 26); if (N.render.snapCamera) N.render.snapCamera(); return { x: G.x, y: G.y, o: G.o }; });
    await page.evaluate(() => { N.render.baseZoom = 2.2; N.render.cam.zoom = 2.2; N.debug.setTime(11, 0); /* (baseZoom: the follow camera eases cam.zoom back) */ });
    await goShop(); await gwait(page, 1.0); await shot('2d_strip_day');
    await goBung(); await gwait(page, 1.0); await shot('2d_bungalow_day');
    await page.evaluate(() => N.debug.setTime(21, 30)); await gwait(page, 0.8); await shot('2d_bungalow_night');
    await goShop(); await gwait(page, 0.8); await shot('2d_strip_night');
    await page.evaluate(() => { N.render.baseZoom = 1; N.debug.setTime(11, 0); N.view3d.setQuality({ adaptive: false, pixelRatio: 1 }); N.view.set('tps'); });
    await page.waitForFunction(() => N.view.mode === 'tps' && N.view3d.ready, null, { timeout: 300000 });
    const set3 = (yaw, pitch) => page.evaluate(([y, p]) => { N.view3d.setCamera({ yaw: y, pitch: p, snap: true }); N.view3d.settle(30000); }, [yaw, pitch]);
    const g = await goBung(); await set3(Math.atan2(-g.o[1], -g.o[0]), 0.16); await sleep(6000); await shot('3d_bungalow_day');
    await goShop(); await set3(-Math.PI / 2, 0.14); await sleep(6000); await shot('3d_strip_day');
    await page.evaluate(() => N.debug.setTime(21, 30)); await sleep(5000); await shot('3d_strip_night');
    const g2 = await goBung(); await set3(Math.atan2(-g2.o[1], -g2.o[0]), 0.16); await sleep(6000); await shot('3d_bungalow_night');
    await page.evaluate(() => { N.view.set('top'); });
    ok('screenshots in tests/out/hills/');
  }

  console.log('\n== 5. errors');
  const nerr = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + String(e.msg).split('\n')[0]));
  check(errors.length === 0 && nerr.length === 0, 'no console / page / N.err errors', errors.concat(nerr).slice(0, 6));
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
