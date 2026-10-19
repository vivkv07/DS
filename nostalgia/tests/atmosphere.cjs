/* NOSTALGIA — tests/atmosphere.cjs (the atmosphere layer: design/atmosphere.md, ARCHITECTURE §22)
 * The whole matrix in both views: day / dusk / night x dry / rain / storm (+ winter mist dawn) at the
 * Old City (Charminar) and Abids, plus birds, wires and wind checks and perf numbers per config.
 * Part tests with deeper checks: tests/atmos_weather2d.cjs, atmos_weather3d.cjs, atmos_wind.cjs,
 * atmos_wires.cjs, atmos_birds.cjs, atmos_audio.cjs.
 *   node nostalgia/tests/atmosphere.cjs     ONLY=2d|3d|checks   SHOTS=0 (no screenshots)   PHONE=1 (390x844)
 * Screenshots: tests/out/atmos/matrix_<view>_<place>_<time>_<weather>.png. Fails on any console error,
 * page error or N.err report.
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
const PHONE = process.env.PHONE === '1';
const VW = PHONE ? 390 : 960, VH = PHONE ? 844 : 540;
const SHOTS = process.env.SHOTS !== '0';
const ONLY = process.env.ONLY || '';
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);

const TIMES = [['day', 11, 0], ['dusk', 18, 25], ['night', 21, 30]];
const WEATHER = [['dry', null], ['rain', { rain: 0.75, storm: 0 }], ['storm', { rain: 1, storm: 1 }]];
const PLACES = [['oldcity', 'charminar_plaza', 'charminar'], ['abids', 'abids', null]];

async function openPage(browser) {
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, hasTouch: PHONE, isMobile: PHONE });
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
    if (N.world.potholes && N.world.potholes.ensure) N.world.potholes.ensure();
    N.debug.freezeClock(true);
    N.debug.god(true);
    N.view.noPointerLock = true;
    if (N.dialogue) N.dialogue.skip = true;
    if (N.calendar && N.calendar.set) N.calendar.set(2003, 7, 22, 12, 0); // a monsoon day
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
  });
  return { context, page, errors };
}

async function setScene(page, place, look, h, m, wx) {
  await page.evaluate(({ place, look, h, m, wx }) => {
    N.debug.teleport(place);
    N.debug.setTime(h, m);
    N.weather.force(wx);
    if (!wx) N.weather.wet = 0;
    N.wind.force(null);
    if (N.view3d && N.view3d.active) {
      let yaw = 0;
      const lm = look && N.world.data.landmarks.find((l) => l.id === look);
      if (lm) yaw = Math.atan2(lm.y - N.player.y, lm.x - N.player.x);
      else { const r = N.world.nearestRoadPoint(N.player.x, N.player.y); if (r) yaw = r.angle; }
      N.view3d.setCamera({ yaw, pitch: N.view.mode === 'fps' ? 0.05 : 0.3, snap: true });
    }
  }, { place, look, h, m, wx });
}

/** in-page timing of a few hundred ms of frames -> {fps, frameMs, js3d, calls, ms2d} */
async function perf(page) {
  return page.evaluate(() => new Promise((res) => {
    const t0 = performance.now(); let n = 0; const js = []; const calls = []; const d2 = [];
    const f = () => {
      n++;
      if (N.view3d && N.view3d.active) { const s = N.view3d.stats(); js.push(s.jsMs); calls.push(s.calls); }
      else if (N.perf) d2.push(N.perf.drawMs);
      if (performance.now() - t0 < 1500) requestAnimationFrame(f);
      else {
        const avg = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);
        res({ fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), js3d: avg(js), calls: calls.length ? Math.max.apply(null, calls) : null, draw2d: avg(d2) });
      }
    };
    requestAnimationFrame(f);
  }));
}

async function matrix(page, view, perfOut) {
  for (const [pn, place, look] of PLACES) {
    for (const [tn, h, m] of TIMES) {
      for (const [wn, wx] of WEATHER) {
        await setScene(page, place, look, h, m, wx);
        if (view !== 'top') await page.evaluate(() => N.view3d.settle(4000));
        await frames(page, view === 'top' ? 8 : 12);
        const p = await perf(page);
        perfOut.push(Object.assign({ view, place: pn, time: tn, weather: wn }, p));
        if (SHOTS) await page.screenshot({ path: path.join(OUT, `matrix_${view}_${pn}_${tn}_${wn}${PHONE ? '_phone' : ''}.png`) });
      }
    }
  }
  // winter mist dawn
  await page.evaluate(() => { N.calendar.set(2003, 1, 8, 6, 10); });
  await setScene(page, 'charminar_plaza', 'charminar', 6, 10, { rain: 0, storm: 0, mist: 0.8 });
  if (view !== 'top') await page.evaluate(() => N.view3d.settle(4000));
  await frames(page, 10);
  if (SHOTS) await page.screenshot({ path: path.join(OUT, `matrix_${view}_oldcity_dawn_mist${PHONE ? '_phone' : ''}.png`) });
  await page.evaluate(() => { N.calendar.set(2003, 7, 22, 12, 0); N.weather.force(null); });
}

async function checks(page) {
  console.log('== checks');
  const r = await page.evaluate(() => {
    const out = {};
    // schedule: monsoon evenings are mostly wet, January is dry, deterministic
    let wetEve = 0, n = 0, janRain = 0;
    for (let d = 15; d <= 30; d++) for (const mo of [7, 8]) { n++; const w = N.weather.decide({ y: 2003, m: mo, d }, 0); let any = 0; for (let mi = 17 * 60; mi < 24 * 60; mi += 10) any = Math.max(any, N.weather.decide({ y: 2003, m: mo, d }, mi).rain); if (any > 0.1) wetEve++; void w; }
    for (let d = 1; d <= 31; d++) for (let mi = 0; mi < 1440; mi += 30) if (N.weather.decide({ y: 2003, m: 1, d }, mi).rain > 0) janRain++;
    out.wetEveFrac = wetEve / n; out.janRain = janRain;
    out.det = JSON.stringify(N.weather.decide({ y: 2003, m: 8, d: 3 }, 1250)) === JSON.stringify(N.weather.decide({ y: 2003, m: 8, d: 3 }, 1250));
    out.api = { wind: !!N.wind && typeof N.wind.sway === 'function', weather: !!N.weather, birds: !!N.birds, wires: !!N.wires, windfx: !!N.windfx, audio: !!N.atmosAudio };
    // seasons mirrors the weather
    N.weather.force({ rain: 0.8 });
    if (N.seasons._weatherTick) N.seasons._weatherTick();
    out.seasonsRain = N.seasons.is('rain') && N.flags.raining === true;
    N.weather.force({ rain: 0 });
    if (N.seasons._weatherTick) N.seasons._weatherTick();
    out.seasonsDry = !N.seasons.is('rain');
    N.weather.force(null);
    // wind grows in a storm
    N.weather.force({ rain: 1, storm: 1 });
    return out;
  });
  // wait on the condition (a loaded machine may render only a few frames a second)
  await page.waitForFunction(() => N.wind.strength > 0.6, null, { timeout: 60000 }).catch(() => {});
  const w2 = await page.evaluate(() => { const s = N.wind.strength; N.weather.force(null); return s; });
  check(r.wetEveFrac > 0.55, 'monsoon evenings are mostly rainy', 'frac ' + r.wetEveFrac.toFixed(2));
  check(r.janRain === 0, 'no rain in January', String(r.janRain));
  check(r.det, 'schedule is deterministic');
  check(r.seasonsRain && r.seasonsDry, 'N.seasons.is("rain") / N.flags.raining follow N.weather');
  check(w2 > 0.6, 'wind blows hard in a storm', w2.toFixed(2));
  for (const k in r.api) check(r.api[k], 'API present: ' + k);
  // birds and wires near the Old City
  const life = await page.evaluate(async () => {
    N.debug.teleport('charminar_plaza'); N.debug.setTime(8, 0); N.weather.force({ rain: 0 });
    for (let i = 0; i < 120 && !(N.birds && N.birds.count() > 0); i++) await new Promise((r) => setTimeout(r, 250));
    const o = {};
    if (N.birds && N.birds.count) o.birds = N.birds.count();
    if (N.wires && N.wires.stats) o.wires = N.wires.stats();
    if (N.wires && N.wires.query) { let n = 0; N.wires.query(N.player.x - 300, N.player.y - 300, N.player.x + 300, N.player.y + 300, () => { n++; }); o.spansNear = n; }
    N.weather.force(null);
    return o;
  });
  check(life.birds > 0, 'birds near Charminar in the morning', JSON.stringify(life.birds));
  check(life.spansNear > 10, 'wires strung near Charminar', String(life.spansNear));
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const { context, page, errors } = await openPage(browser);
  const perfRows = [];
  try {
    if (!ONLY || ONLY === 'checks') await checks(page);
    if (!ONLY || ONLY === '2d') { console.log('== top-down matrix'); await page.evaluate(() => N.view.set('top')); await matrix(page, 'top', perfRows); }
    if (!ONLY || ONLY === '3d') {
      console.log('== 3D matrix');
      await page.evaluate(() => N.view.set('tps'));
      await page.waitForFunction(() => N.view3d && N.view3d.active, null, { timeout: 60000 });
      await matrix(page, 'tps', perfRows);
      // a few first-person frames in the rain at night
      await page.evaluate(() => N.view.set('fps'));
      await setScene(page, 'abids', null, 21, 30, { rain: 0.9, storm: 0.6 });
      await page.evaluate(() => N.view3d.settle(4000)); await frames(page, 12);
      if (SHOTS) await page.screenshot({ path: path.join(OUT, `matrix_fps_abids_night_rain${PHONE ? '_phone' : ''}.png`) });
      const lightning = await page.evaluate(() => { N.weather.strike(N.player.x + 400, N.player.y - 300, 1); return N.weather.flash; });
      await frames(page, 1);
      if (SHOTS) await page.screenshot({ path: path.join(OUT, `matrix_fps_abids_lightning${PHONE ? '_phone' : ''}.png`) });
      check(lightning > 0.9, 'lightning flash');
    }
    console.log('== perf (fps is software GL; js3d = 3D JS ms, draw2d = 2D draw ms)');
    for (const r of perfRows) console.log(`  ${r.view.padEnd(4)} ${r.place.padEnd(8)} ${r.time.padEnd(6)} ${r.weather.padEnd(6)} fps ${String(r.fps).padStart(5)}  ` + (r.js3d != null ? `js3d ${r.js3d} ms  calls ${r.calls}` : `draw2d ${r.draw2d} ms`));
    const nerr = await page.evaluate(() => (N.debug.errors || []).map((e) => e.where + ': ' + e.msg));
    for (const e of nerr) errors.push('N.err ' + e);
  } catch (e) {
    fail('exception: ' + (e.stack || e.message));
  }
  check(errors.length === 0, 'zero console / page errors', errors.slice(0, 6).join(' | '));
  await context.close();
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILURE(S)` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
