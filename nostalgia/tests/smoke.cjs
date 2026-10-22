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
  const shot = (n) => page.screenshot({ path: path.join(OUT, V.name + '_' + n + '.png'), timeout: 180000 });
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

  // ---- start a game from the title (real click / tap): ▶ PLAY -> the name card -> ▶ START
  // (menus.js skips the name card under automation unless quickStart is turned off: drive the real flow)
  await page.evaluate(() => { if (N.menus) N.menus.quickStart = false; });
  if (V.touch) await page.tap('#title-start'); else await page.click('#title-start');
  const named = await page.waitForFunction(() => N.menus.debugState().top === 'name', null, { timeout: 5000 }).then(() => true, () => false);
  if (!named) fail(V.name, 'PLAY did not open the name card'); else ok('PLAY opens the name card');
  if (named) { if (V.touch) await page.tap('.mn-name [data-act=start]'); else await page.click('.mn-name [data-act=start]'); }
  await page.waitForFunction(() => N.state.mode === 'play' || N.state.mode === 'cutscene', null, { timeout: 5000 }).catch(() => fail(V.name, 'did not start a game after START'));
  if (await page.evaluate(() => N.state.mode === 'cutscene')) {
    // the story's prologue: skip it with the real SKIP pill
    if (V.touch) await page.tap('.cs-skip'); else await page.click('.cs-skip');
  }
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 8000 }).catch(() => fail(V.name, 'did not enter play mode after START'));
  await page.evaluate(() => { N.debug.setTime(16, 30); });
  await sleep(500);
  let s = await state();
  if (s.mode !== 'play') fail(V.name, 'mode is ' + s.mode); else ok('playing at ' + s.player.x + ',' + s.player.y + ' (' + s.district + ', ' + s.surface + ')');
  const start = s.player;
  // in-page odometer (distance walked while the input below is applied)
  await page.evaluate(() => {
    window.__odo = 0; let lx = N.player.x, ly = N.player.y;
    N.addSystem({ id: '__odo', order: 99, runIn: ['play'], update() { window.__odo += Math.hypot(N.player.x - lx, N.player.y - ly); lx = N.player.x; ly = N.player.y; } });
  });

  // ---- move with real input
  if (!V.touch) {
    const press = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await sleep(ms); for (const k of keys.slice().reverse()) await page.keyboard.up(k); };
    // (walking keys held 1.4x longer since the walk went 45 -> 32 u/s, so the 60 u odometer check keeps its margin;
    // the run is unchanged)
    await press(['KeyD'], 1260);
    await press(['KeyS'], 980);
    await press(['ShiftLeft', 'KeyA'], 900);
    await press(['ArrowUp'], 980);
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
    // (walking is 32 u/s since the natural-walk change, was 45: the drags are held 1.6x longer so the 60 u odometer
    // check below keeps the margin it had)
    await drag(60, 0, 1440);
    await drag(0, 60, 1120);
    await drag(-60, 0, 1120);
    await drag(0, -60, 1120);
    // (the ACTION button tap is exercised below against a test interactable: a bare tap here
    // would start whatever real content sits near the spawn, e.g. the antenna minigame)
  }
  await sleep(200);
  s = await state();
  const moved = Math.hypot(s.player.x - start.x, s.player.y - start.y);
  const odo = await page.evaluate(() => window.__odo);
  if (odo < 60) fail(V.name, 'player barely moved (walked ' + odo.toFixed(1) + 'u, net ' + moved.toFixed(1) + 'u)');
  else ok('player walked ' + odo.toFixed(1) + 'u (net ' + moved.toFixed(1) + 'u) with real ' + (V.touch ? 'touch' : 'keyboard') + ' input');
  await shot('moved');

  // ---- ACTION context: an interactable next to the player shows its label; ACTION uses it
  await page.evaluate(() => {
    window.__used = 0;
    // priority 99: must beat real content near the spawn (shops, minigame spots, givers)
    N.interact.add('__test', { x: N.player.x, y: N.player.y, r: 20, priority: 99, label: 'Chai pe chalo', use: () => { window.__used++; } });
  });
  await sleep(150);
  const label = await page.evaluate(() => ({ label: N.input.actionLabel, prompt: document.querySelector('#prompt.show span') ? document.querySelector('#prompt.show span').textContent : null, btn: document.querySelector('#touch .t-action .t-txt') ? document.querySelector('#touch .t-action .t-txt').textContent : null }));
  if (V.touch) await page.tap('#touch .t-action'); else await page.keyboard.press('KeyE');
  await sleep(150);
  const used = await page.evaluate(() => { const u = window.__used; N.interact.remove('__test'); return u; });
  if (label.label !== 'Chai pe chalo' || (V.touch ? label.btn !== 'Chai pe chalo' : label.prompt !== 'Chai pe chalo')) fail(V.name, 'action label not shown: ' + JSON.stringify(label));
  else if (used !== 1) fail(V.name, 'interactable use() ran ' + used + ' times');
  else ok('ACTION label "' + label.label + '" shown and used once');

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
  await page.evaluate(() => {
    const sp = N.WORLD_DATA.spawns && N.WORLD_DATA.spawns.player;
    if (N.places.home) N.debug.teleport('home'); else if (sp) N.debug.teleport(sp[0], sp[1]);
    N.debug.setTime(21, 0);
  });
  await sleep(700);
  await shot('night');
  const night = await page.evaluate(() => N.render.night);
  if (!(night > 0.5)) fail(V.name, 'night overlay not active at 21:00 (night=' + night + ')'); else ok('night overlay ' + night.toFixed(2));

  // ---- rotate the phone: the canvas must re-fit the new viewport (integer scale, no scroll)
  if (V.name === 'landscape') {
    await page.setViewportSize({ width: V.viewport.height, height: V.viewport.width });
    await sleep(400);
    const fit = await page.evaluate(() => { const r = N.render.canvas.getBoundingClientRect(); return { W: N.render.W, H: N.render.H, cw: Math.round(r.width), ch: Math.round(r.height), iw: innerWidth, ih: innerHeight }; });
    if (fit.W > fit.H || fit.cw < fit.iw || fit.ch < fit.ih) fail(V.name, 'canvas did not re-fit after rotation: ' + JSON.stringify(fit)); else ok('rotation re-fit ' + JSON.stringify(fit));
    await shot('rotated');
    await page.setViewportSize(V.viewport);
    await sleep(300);
  }

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
