/* NOSTALGIA — tests/smoke.cjs
 * End-to-end smoke test in headless Chromium (Playwright, globally installed):
 *   desktop 1280x720 (keyboard), phone portrait 390x844 and landscape 844x390 (touch).
 * For each: boot index.html#debug, start a game from the title, move with REAL input
 * (keyboard / CDP touch on the joystick), check N.debug.state(), teleport around, take
 * screenshots (tests/out/), check night + pause, and measure frame time in-page over 3 s.
 * Fails on any console error / page error / N.err.
 *
 *   node nostalgia/tests/smoke.cjs            (Google Fonts stubbed: hermetic)
 *   REAL_FONTS=1 node nostalgia/tests/smoke.cjs   (fetch fonts through $HTTPS_PROXY)
 *   ONLY=desktop node nostalgia/tests/smoke.cjs   (one viewport: desktop|portrait|landscape)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, touch: false },
  { name: 'portrait', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, touch: true },
  { name: 'landscape', viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, touch: true },
];

const failures = [];
const fail = (vp, msg) => { failures.push('[' + vp + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(browser, V) {
  console.log('\n== ' + V.name + ' ' + V.viewport.width + 'x' + V.viewport.height + (V.touch ? ' (touch)' : ''));
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.deviceScaleFactor, hasTouch: V.touch, isMobile: V.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  if (!process.env.REAL_FONTS) {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed in tests */' }));
  }
  const shot = (n) => page.screenshot({ path: path.join(OUT, V.name + '_' + n + '.png') });
  const state = () => page.evaluate(() => N.debug.state());

  // ---- boot + title
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 20000 });
  const bootInfo = await page.evaluate(() => ({ buildMs: N.world.buildMs, structures: N.world.structures.length, W: N.render.W, H: N.render.H, scale: N.render.scale, places: Object.keys(N.places).length }));
  ok('booted in ' + (Date.now() - t0) + ' ms (world build ' + bootInfo.buildMs + ' ms, ' + bootInfo.structures + ' structures, ' + bootInfo.places + ' places), canvas ' + bootInfo.W + 'x' + bootInfo.H + ' x' + bootInfo.scale);
  await sleep(400);
  await shot('title');

  // no page scroll at phone widths
  const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
  if (scroll.sw > scroll.iw || scroll.sh > scroll.ih) fail(V.name, 'page scrolls: ' + JSON.stringify(scroll)); else ok('no page scroll');

  // ---- start a game from the title (real click / tap)
  if (V.touch) await page.tap('#title-start'); else await page.click('#title-start');
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 5000 }).catch(() => fail(V.name, 'did not enter play mode after START'));
  await page.evaluate(() => { N.debug.setTime(16, 30); });
  await sleep(500);
  let s = await state();
  if (s.mode !== 'play') fail(V.name, 'mode is ' + s.mode); else ok('playing at ' + s.player.x + ',' + s.player.y + ' (' + s.district + ', ' + s.surface + ')');
  const start = s.player;

  // ---- move with real input
  if (!V.touch) {
    const press = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await sleep(ms); for (const k of keys.slice().reverse()) await page.keyboard.up(k); };
    await press(['KeyD'], 900);
    await press(['KeyS'], 700);
    await press(['ShiftLeft', 'KeyA'], 900);
    await press(['ArrowUp'], 700);
  } else {
    const touchUI = await page.evaluate(() => ({ shown: getComputedStyle(document.getElementById('touch')).display !== 'none', action: !!document.querySelector('#touch .t-action') }));
    if (!touchUI.shown || !touchUI.action) fail(V.name, 'touch controls not visible: ' + JSON.stringify(touchUI)); else ok('touch controls visible');
    const cdp = await context.newCDPSession(page);
    const H = V.viewport.height, x0 = 90, y0 = H - 140;
    const drag = async (dx, dy, ms) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
      for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 6, y: y0 + (dy * i) / 6, id: 1 }] }); await sleep(16); }
      await sleep(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await drag(60, 0, 900);
    await drag(0, 60, 700);
    await drag(-60, 0, 700);
    await drag(0, -60, 700);
    // ACTION button: a tap must register as a pressed action without errors
    await page.tap('#touch .t-action');
  }
  await sleep(200);
  s = await state();
  const moved = Math.hypot(s.player.x - start.x, s.player.y - start.y);
  const travelled = await page.evaluate(() => N.player.anim.phase);
  if (moved < 15 && travelled < 3) fail(V.name, 'player did not move (moved ' + moved.toFixed(1) + ')'); else ok('player moved ' + moved.toFixed(1) + 'u (walk phase ' + travelled.toFixed(1) + ')');
  await shot('moved');

  // ---- pause / resume with the keyboard (desktop) or the PAUSE button (touch)
  if (!V.touch) { await page.keyboard.press('Escape'); } else { await page.tap('#touch .t-pause'); }
  await sleep(150);
  s = await state();
  if (s.mode !== 'paused') fail(V.name, 'pause did not open (mode ' + s.mode + ')'); else ok('paused');
  await shot('paused');
  if (!V.touch) await page.keyboard.press('Escape'); else await page.click('.pause-screen [data-act=resume]');
  await sleep(150);
  s = await state();
  if (s.mode !== 'play') fail(V.name, 'resume failed (mode ' + s.mode + ')'); else ok('resumed');

  // ---- teleport around
  const count = V.touch ? 3 : 6;
  const list = await page.evaluate((count) => {
    const all = Object.values(N.places);
    const pref = ['charminar', 'tank_bund', 'buddha_statue', 'golconda', 'koti_bus_stand', 'birla_mandir', 'cyber_towers', 'clock_tower', 'public_gardens'];
    const pick = pref.filter((id) => N.places[id]);
    for (const p of all) if (pick.length < count && pick.indexOf(p.id) < 0) pick.push(p.id);
    return pick.slice(0, count);
  }, count);
  for (const id of list) {
    const r = await page.evaluate((id) => N.debug.teleport(id), id);
    await sleep(450);
    s = await state();
    if (!r) fail(V.name, 'teleport(' + id + ') returned null');
    else if (!/GROUND|ROAD|FOOTPATH|GRASS|PLAZA|SAND|BRIDGE/.test(s.surface)) fail(V.name, 'teleport(' + id + ') landed on ' + s.surface);
    else ok('teleport ' + id + ' -> ' + Math.round(s.player.x) + ',' + Math.round(s.player.y) + ' ' + s.surface + ' in ' + s.district);
    await shot('place_' + id);
  }

  // ---- night mode
  await page.evaluate(() => { N.debug.teleport(N.places.home ? 'home' : Object.keys(N.places)[0]); N.debug.setTime(21, 0); });
  await sleep(700);
  await shot('night');
  const night = await page.evaluate(() => N.render.night);
  if (!(night > 0.5)) fail(V.name, 'night overlay not active at 21:00 (night=' + night + ')'); else ok('night overlay ' + night.toFixed(2));

  // ---- frame time over 3 s (walking in a circle, golden hour)
  await page.evaluate(() => { N.debug.setTime(17, 0); N.input.setMove(0.7, 0.7); });
  await sleep(600);
  const perf = await page.evaluate(() => new Promise((res) => {
    const t0 = performance.now(); let n = 0, last = t0; const gaps = []; let a = 0;
    const work0 = N.perf.frames;
    function tick(t) {
      n++; gaps.push(t - last); last = t; a += 0.05; N.input.setMove(Math.cos(a), Math.sin(a));
      if (t - t0 < 3000) requestAnimationFrame(tick);
      else {
        N.input.setMove(null);
        gaps.sort((x, y) => x - y);
        res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), avgFrameMs: +((t - t0) / n).toFixed(2), p95FrameMs: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1), jsWorkMs: N.perf.frameMs, updateMs: N.perf.updateMs, drawMs: N.perf.drawMs, frames: N.perf.frames - work0 });
      }
    }
    requestAnimationFrame(tick);
  }));
  console.log('  perf ' + JSON.stringify(perf));

  // ---- errors
  s = await state();
  const all = errors.concat(s.errors.map((e) => 'N.err ' + e));
  if (all.length) fail(V.name, all.length + ' error(s):\n    ' + all.slice(0, 8).join('\n    '));
  else ok('no console/page errors');
  await context.close();
  return perf;
}

(async () => {
  const opts = {};
  if (process.env.REAL_FONTS && process.env.HTTPS_PROXY) opts.proxy = { server: process.env.HTTPS_PROXY };
  const browser = await chromium.launch(opts);
  const results = {};
  try {
    for (const V of VIEWPORTS) {
      if (process.env.ONLY && process.env.ONLY !== V.name) continue;
      try { results[V.name] = await run(browser, V); } catch (e) { fail(V.name, 'exception: ' + (e.stack || e.message)); }
    }
  } finally { await browser.close(); }
  console.log('\nScreenshots: ' + OUT);
  console.log('Frame time (avg ms per rAF frame / in-page JS work ms): ' + Object.entries(results).map(([k, v]) => k + ' ' + v.avgFrameMs + ' / ' + v.jsWorkMs).join(', '));
  if (failures.length) { console.log('\nSMOKE FAILED (' + failures.length + '):\n' + failures.join('\n')); process.exit(1); }
  console.log('\nSMOKE PASSED');
})();
