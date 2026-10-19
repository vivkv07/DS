/* NOSTALGIA — tests/atmos_weather3d.cjs (weather in the 3D view, src/weather3d.js)
 * Headless Chromium with SwiftShader WebGL (software GL: judge perf by JS ms and draw calls, not fps).
 *
 *   checks: the layer is registered and builds, the ground road / terrain materials are wrapped,
 *     wetness follows N.weather.wet (and N.view3d.ground.setWet still forces it), rain / splashes /
 *     clouds / halos show in a storm and hide when dry, fog closes in with rain and mist, lightning
 *     shows the bolt, autos get their side covers in the rain, the dry look is unchanged (no extra
 *     draw calls, fog untouched), perf numbers (draw calls + JS ms) dry vs storm on desktop and on the
 *     phone tier (setQuality({tier: 'low'})), zero console / page errors and no N.err.
 *   screenshots -> tests/out/atmos/w3d_<scene>.png: Abids arterial tps + fps day / dusk / night x
 *     dry / rain / storm, Old City by Charminar (night rain, day rain), Tank Bund (lake ripples, night
 *     rain), winter mist at dawn, a lightning frame.
 *   node nostalgia/tests/atmos_weather3d.cjs     SHOTS=0 (checks + perf only)   ONLY=<scene substring>
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
const VW = 960, VH = 540;
const SHOTS = process.env.SHOTS !== '0';
const ONLY = process.env.ONLY || '';
const FAST = process.env.FAST === '1'; // screenshots only (iteration)
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);

const WX = { dry: null, rain: { rain: 0.7, storm: 0 }, storm: { rain: 1, storm: 1 } };
const ABIDS = { at: 'abids', look: 'road', kind: ['arterial'], snap: true, side: -14 };
const SCENES = [];
for (const [tn, h, m] of [['day', 11, 0], ['dusk', 18, 35], ['night', 21, 15]]) {
  for (const wx of ['dry', 'rain', 'storm']) {
    SCENES.push(Object.assign({ name: `abids_${tn}_${wx}_tps`, h, m, wx, mode: 'tps', pitch: 0.2 }, ABIDS));
    SCENES.push(Object.assign({ name: `abids_${tn}_${wx}_fps`, h, m, wx, mode: 'fps', pitch: 0.04 }, ABIDS));
  }
}
SCENES.push(
  { name: 'oldcity_night_rain_tps', at: 'charminar_plaza', h: 21, m: 0, wx: 'rain', mode: 'tps', lookAt: 'charminar', pitch: 0.18 },
  { name: 'oldcity_night_rain_fps', at: 'charminar_plaza', h: 21, m: 0, wx: 'rain', mode: 'fps', lookAt: 'charminar', pitch: 0.02 },
  { name: 'oldcity_day_rain_tps', at: 'charminar_plaza', h: 15, m: 0, wx: 'rain', mode: 'tps', lookAt: 'charminar', pitch: 0.2 },
  { name: 'tankbund_night_rain_tps', at: 'giver_hussain_sagar', h: 20, m: 30, wx: 'storm', mode: 'tps', look: 'road', kind: ['bund'], turn: -1.4, pitch: 0.16 },
  { name: 'tankbund_night_rain_fps', at: 'giver_hussain_sagar', h: 20, m: 30, wx: 'rain', mode: 'fps', look: 'road', kind: ['bund'], turn: -1.2, pitch: 0.03 },
  { name: 'tankbund_day_rain_tps', at: 'giver_hussain_sagar', h: 16, m: 0, wx: 'rain', mode: 'tps', look: 'road', kind: ['bund'], turn: -1.4, pitch: 0.2 },
  { name: 'mist_dawn_tps', at: 'giver_hussain_sagar', h: 6, m: 10, wx: 'mist', mode: 'tps', look: 'road', kind: ['bund'], pitch: 0.12 },
  { name: 'mist_dawn_fps', at: 'abids', h: 6, m: 20, wx: 'mist', mode: 'fps', look: 'road', kind: ['arterial'], snap: true, side: -14, pitch: 0.03 },
  { name: 'lightning_night_tps', at: 'abids', h: 22, m: 0, wx: 'storm', mode: 'tps', look: 'road', kind: ['arterial'], snap: true, side: -14, pitch: -0.06, bolt: true },
);

async function openPage(browser, quality) {
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 120000 });
  await page.evaluate((q) => {
    N.debug.newGame({ skipIntro: true });
    if (N.world.potholes && N.world.potholes.ensure) N.world.potholes.ensure();
    N.debug.freezeClock(true);
    N.debug.god(true);
    N.view.noPointerLock = true;
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    N.view3d.setQuality(Object.assign({ adaptive: false }, q || {}));
    N.debug.teleport('abids');
    N.view.set('tps');
  }, quality || null);
  const ready = await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 240000 }).then(() => true, () => false);
  return { context, page, errors, ready };
}

async function setScene(page, S) {
  return page.evaluate((S) => {
    if (N.player.vehicle && N.vehicles.alight) { try { N.vehicles.alight(N.player, true); } catch (e) { /* ignore */ } }
    N.weather3d.pinFlash(false);
    N.debug.teleport(S.at);
    if (S.h != null) N.debug.setTime(S.h, S.m || 0);
    const W = { dry: { rain: 0, storm: 0, mist: 0, cloud: 0, wet: 0 }, rain: { rain: 0.7, storm: 0, wet: 1 }, storm: { rain: 1, storm: 1, wet: 1 }, mist: { rain: 0, storm: 0, mist: 0.9, cloud: 0.2, wet: 0.15 } }[S.wx];
    N.weather.force(W);
    const p = N.player;
    let yaw = N.view.yaw;
    if (S.look === 'road') {
      const q = N.world.nearestRoadPoint(p.x, p.y, (r) => !S.kind || S.kind.indexOf(r.kind) >= 0);
      if (q) {
        if (S.snap) N.debug.teleport(q.x + Math.sin(q.angle) * (S.side || 0), q.y - Math.cos(q.angle) * (S.side || 0));
        yaw = q.angle + (S.turn || 0);
      }
    }
    if (S.lookAt) { const pl = N.WORLD_DATA.places.find((x) => x.id === S.lookAt) || N.WORLD_DATA.landmarks.find((x) => x.id === S.lookAt); if (pl) yaw = Math.atan2(pl.y - p.y, pl.x - p.x); }
    N.view.set(S.mode);
    N.view3d.setCamera({ yaw, pitch: S.pitch != null ? S.pitch : 0.2, snap: true });
    const settled = N.view3d.settle(40000);
    if (S.bolt) {
      const a = yaw + 0.25;
      N.weather.strike(p.x + Math.cos(a) * 900, p.y + Math.sin(a) * 900, 1);
      N.weather3d.pinFlash(true);
    }
    return { x: Math.round(p.x), y: Math.round(p.y), settled };
  }, S);
}
async function shoot(page, file) {
  await page.evaluate(() => N.view3d.settle(20000));
  await frames(page, 3);
  await page.evaluate(() => N.view3d.settle(5000));
  await page.screenshot({ path: file, timeout: 300000 });
}
/** average JS ms + draw calls over n frames */
async function perf(page, n) {
  // warm up: the first frames after a scene change compile shaders / stream chunks (software GL)
  await page.evaluate(() => N.view3d.settle(20000));
  await frames(page, 12);
  return page.evaluate((n) => new Promise((res) => {
    const js = [], calls = [], wx = [], own = [];
    let k = 0;
    const f = () => {
      const s = N.view3d.stats(), w = N.weather3d.stats(); js.push(s.jsMs); calls.push(s.calls); wx.push(w.ms); own.push(w.calls);
      if (++k >= n) {
        js.sort((a, b) => a - b); wx.sort((a, b) => a - b);
        const med = (a) => a[Math.floor(a.length / 2)];
        res({ jsMed: +med(js).toFixed(2), wxMed: +med(wx).toFixed(3), calls: Math.round(calls.reduce((a, b) => a + b, 0) / calls.length), callsMax: Math.max.apply(null, calls), layerCalls: Math.max.apply(null, own) });
      } else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }), n || 20);
}
async function perfSuite(page, label) {
  const out = {};
  const S = Object.assign({ name: 'perf', h: 21, m: 15, mode: 'tps', pitch: 0.2 }, ABIDS);
  for (const wx of ['dry', 'storm']) {
    await setScene(page, Object.assign({}, S, { wx }));
    out[wx] = await perf(page, 24);
    if (wx === 'storm') {
      await page.evaluate(() => N.weather3d.setEnabled(false));
      out.stormOff = await perf(page, 24);
      await page.evaluate(() => N.weather3d.setEnabled(true));
    }
  }
  console.log(`  perf ${label}: dry ${JSON.stringify(out.dry)} | storm ${JSON.stringify(out.storm)} | storm, layer off ${JSON.stringify(out.stormOff)}`);
  return out;
}

async function main() {
  const browser = await chromium.launch({ args: ARGS });
  console.log('\n== weather3d: desktop');
  const { page, errors, ready } = await openPage(browser);
  check(ready, '3D third person ready');
  await page.evaluate(() => N.view3d.settle(40000));
  await frames(page, 3);
  const api = await page.evaluate(() => ({ has: !!N.weather3d, st: N.weather3d && N.weather3d.stats() }));
  check(api.has && api.st.patched >= 2, 'layer built and ground materials wrapped', JSON.stringify(api.st));

  if (FAST) {
    for (const S of SCENES) {
      if (ONLY && !ONLY.split(',').some((o) => S.name.indexOf(o) >= 0)) continue;
      const r = await setScene(page, S);
      await shoot(page, path.join(OUT, 'w3d_' + S.name + '.png'));
      console.log('  shot ' + S.name + ' @' + r.x + ',' + r.y + ' ' + JSON.stringify(await page.evaluate(() => N.weather3d.stats())));
    }
    console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'no errors');
    await browser.close();
    return;
  }
  // dry: nothing extra
  await setScene(page, Object.assign({ name: 'dry', h: 21, m: 15, wx: 'dry', mode: 'tps', pitch: 0.2 }, ABIDS));
  await frames(page, 3);
  const dry = await page.evaluate(() => { const s = N.weather3d.stats(); return { s, fogFar: N.view3d.engine.scene.fog.far, drawDist: N.view3d.quality.drawDist }; });
  check(!dry.s.rain && !dry.s.splashes && !dry.s.clouds && !dry.s.halos && !dry.s.bolt && dry.s.covers === 0, 'dry: no rain / splashes / clouds / halos / covers', JSON.stringify(dry.s));
  check(Math.abs(dry.fogFar - dry.drawDist) < 1 && dry.s.wet === 0, 'dry: fog and wetness untouched', JSON.stringify(dry));

  // storm
  await setScene(page, Object.assign({ name: 'storm', h: 21, m: 15, wx: 'storm', mode: 'tps', pitch: 0.2 }, ABIDS));
  await frames(page, 3);
  const st = await page.evaluate(() => ({ s: N.weather3d.stats(), lights: N.weather3d.lights(), wetG: N.view3d.ground.stats().wet }));
  check(st.s.rain && st.s.splashes && st.s.clouds && st.s.halos, 'storm: rain, splashes, clouds, halos on', JSON.stringify(st.s));
  check(st.s.fogFar < 1000, 'storm: fog closes in', 'fogFar ' + st.s.fogFar);
  check(st.wetG > 0.85, 'storm: roads wet (follow N.weather.wet)', 'wet ' + st.wetG);
  check(st.lights.length > 0, 'storm at night: lights chosen for the reflections', JSON.stringify(st.lights.slice(0, 3)));
  const forced = await page.evaluate(() => { N.view3d.ground.setWet(0.3); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => { const w = N.view3d.ground.stats().wet; N.view3d.ground.setWet(null); r(w); }))); });
  check(Math.abs(forced - 0.3) < 0.01, 'N.view3d.ground.setWet still forces the wetness', 'wet ' + forced);
  // autos: covers in the rain
  const cov = await page.evaluate(async () => {
    const p = N.player;
    let v = null;
    try { v = N.debug.spawnVehicle('auto'); } catch (e) { v = null; }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { spawned: !!v, covers: N.weather3d.stats().covers, autos: N.entities.query(p.x, p.y, 380, (e) => e.kind === 'vehicle' && (e.type === 'auto' || e.type === 'yadagiri_auto')).length };
  });
  if (cov.autos > 0) check(cov.covers > 0, 'rain: autos near the camera have their side covers down', JSON.stringify(cov));
  else console.log('  (no autos near the camera to check covers: ' + JSON.stringify(cov) + ')');
  // mist
  await setScene(page, { name: 'mist', at: 'giver_hussain_sagar', h: 6, m: 10, wx: 'mist', mode: 'tps', pitch: 0.12 });
  await frames(page, 2);
  const mist = await page.evaluate(() => N.weather3d.stats());
  check(mist.fogFar < 600 && !mist.rain, 'winter mist: thick fog, no rain', JSON.stringify(mist));
  // lightning
  await setScene(page, SCENES.find((s) => s.bolt));
  await frames(page, 2);
  const bolt = await page.evaluate(() => N.weather3d.stats());
  check(bolt.bolt, 'lightning: bolt visible', JSON.stringify(bolt));
  await page.evaluate(() => N.weather3d.pinFlash(false));

  const P = await perfSuite(page, 'desktop');
  check(P.storm.calls - P.dry.calls <= 8, 'desktop storm: <= +6 layer draw calls (+ slack for traffic)', `dry ${P.dry.calls} storm ${P.storm.calls} storm-off ${P.stormOff.calls}`);
  check(P.storm.layerCalls <= 6, 'desktop storm: layer adds <= 6 draw calls', `layer objects ${P.storm.layerCalls}; scene storm ${P.storm.calls} dry ${P.dry.calls} layer-off ${P.stormOff.calls}`);
  check(P.storm.wxMed <= 0.7, 'desktop storm: layer JS <= 0.7 ms', 'median ' + P.storm.wxMed + ' ms');

  if (SHOTS) {
    console.log('\n== screenshots -> tests/out/atmos/');
    for (const S of SCENES) {
      if (ONLY && !ONLY.split(',').some((o) => S.name.indexOf(o) >= 0)) continue;
      const r = await setScene(page, S);
      await shoot(page, path.join(OUT, 'w3d_' + S.name + '.png'));
      console.log('  shot ' + S.name + ' @' + r.x + ',' + r.y + (r.settled ? '' : ' (not settled)'));
    }
    await page.evaluate(() => N.weather3d.pinFlash(false));
  }
  const nerrs = await page.evaluate(() => (N.errors || []).map((e) => e.where + ': ' + e.msg)).catch(() => []);
  const nerr = nerrs.length;
  check(errors.length === 0, 'desktop: zero console / page errors', errors.slice(0, 5).join(' | '));
  check(!nerr, 'desktop: no N.err', nerrs.slice(0, 4).join(' | '));
  await page.context().close();

  console.log('\n== weather3d: phone tier');
  const ph = await openPage(browser, { tier: 'low' });
  check(ph.ready, 'phone tier 3D ready');
  await ph.page.evaluate(() => N.view3d.settle(40000));
  const tier = await ph.page.evaluate(() => ({ tier: N.view3d.stats().tier, wxN: N.weather3d.stats().wxN }));
  check(tier.tier === 'low' && tier.wxN === 4, 'phone tier: 4 reflection lights', JSON.stringify(tier));
  const PP = await perfSuite(ph.page, 'phone');
  check(PP.storm.layerCalls <= 6, 'phone storm: layer adds <= 6 draw calls', `layer objects ${PP.storm.layerCalls}; scene storm ${PP.storm.calls} dry ${PP.dry.calls} layer-off ${PP.stormOff.calls}`);
  if (SHOTS && (!ONLY || 'phone'.indexOf(ONLY) >= 0)) {
    await setScene(ph.page, Object.assign({ name: 'phone', h: 21, m: 15, wx: 'storm', mode: 'tps', pitch: 0.2 }, ABIDS));
    await shoot(ph.page, path.join(OUT, 'w3d_phone_abids_night_storm_tps.png'));
    console.log('  shot phone_abids_night_storm_tps');
  }
  check(ph.errors.length === 0, 'phone: zero console / page errors', ph.errors.slice(0, 5).join(' | '));
  await ph.context.close();
  await browser.close();

  console.log('\nPERF  desktop dry ' + JSON.stringify(P.dry) + '  storm ' + JSON.stringify(P.storm) + '  (layer off ' + JSON.stringify(P.stormOff) + ')');
  console.log('PERF  phone   dry ' + JSON.stringify(PP.dry) + '  storm ' + JSON.stringify(PP.storm) + '  (layer off ' + JSON.stringify(PP.stormOff) + ')');
  if (failures.length) { console.log('\n' + failures.length + ' FAILURE(S)'); process.exit(1); }
  console.log('\nall weather3d checks passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
