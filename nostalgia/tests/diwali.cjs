/* NOSTALGIA — tests/diwali.cjs (the Diwali world, src/diwali.js)
 *
 * N.calendar.set(2003, 10, 25, 20, 30) (Deepavali night) and the next morning at 08:00, in top-down AND third-person 3D:
 *   colony     the home colony (Lakshmi Nagar): decorated houses (rangoli, diyas, toran, kandil, fairy lights), the
 *              families out with crackers, the home family, rockets overhead, the haze
 *   koti       Sultan Bazaar / Koti: the pataakha stalls lit at night, the busier bazaar
 *   tankbund   Tank Bund: rockets over the city and the lake
 *   morning    08:00 the next morning: the red paper on the roads at all three places (+ the sweep / heaps at 14:00)
 *   wake       a before / after frame pair of the paper blowing and swirling as a car passes (2D and 3D)
 *   stalls     the stalls by day (21 Oct, 11:00) in both views
 *   sky        fireworks sky shots (a dense show) in both views
 *   api        calendar flags, fireOK, the stalls' layout, the cracker box + the lighting rule (Chappal heat), the dogs,
 *              a bomb that only fizzles when someone is near, shows, isNight
 *   perf       Deepavali peak at the home colony at 390x844 (phone) and 1280x720 (desktop) in both views: this module's ms
 *              per frame (update, 2D draw, 3D layer) and the particle budgets (TUNE.budget)
 * Zero console / page errors and zero N.err reports in every context. Screenshots: tests/out/diwali_*.png
 *   node tests/diwali.cjs        ONLY=api,colony,koti,tankbund,morning,wake,stalls,sky,perf   SHOTS=0
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
fs.mkdirSync(OUT, { recursive: true });

const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SHOTS = process.env.SHOTS !== '0';
const failures = [];
const shots = [];
let cur = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { failures.push('[' + cur + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg + (detail ? '  (' + detail + ')' : '')); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const want = (part) => !ONLY || ONLY.includes(part);

async function open(browser, V) {
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.dpr || 1, hasTouch: !!V.touch, isMobile: !!V.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 240000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    N.debug.freezeClock(true);
    if (N.debug.god) N.debug.god(true);
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    // the side activities (src/diwali_missions.js) are someone else's test: keep their givers out of the way
    if (N.missions && N.missions.defs && N.missions.done) for (const id in N.missions.defs) N.missions.done.add(id);
    N.flags.dw_terrace = true;
    window.__dw = { ev: [] };
    for (const e of ['diwali:light', 'diwali:stopped', 'diwali:dog', 'diwali:comfort', 'diwali:box']) N.on(e, (d) => window.__dw.ev.push(e));
  });
  return { context, page, errors };
}
/** wait for `secs` of SIMULATION time (the machine may be very busy), capped in real time */
async function simWait(page, secs, capMs) {
  const t0 = await page.evaluate(() => N.time.now);
  const cap = Date.now() + (capMs || secs * 15000 + 30000);
  while (Date.now() < cap) {
    await sleep(300);
    const t = await page.evaluate(() => N.time.now);
    if (t - t0 >= secs) return true;
  }
  return false;
}
async function shot(page, name) {
  if (!SHOTS) return;
  const f = path.join(OUT, 'diwali_' + name + '.png');
  await page.screenshot({ path: f, timeout: 180000 });
  shots.push(f);
  console.log('  shot ' + path.relative(ROOT, f));
}
const N_ERRS = (page) => page.evaluate(() => (N.errors || []).map((e) => (e.where || e.w || '') + ': ' + String(e.msg || e.message || e.e || e).slice(0, 300)));
// where things are (resolved in the page): the home lane, Sultan Bazaar's stalls, Tank Bund
const SPOTS = {
  home: () => { const h = N.diwali.spots.home; return { x: h.x - 22, y: h.y - 15, fx: h.x + 30, fy: h.y + 10 }; },
  koti: () => { const L = N.diwali.layout.stalls().filter((s) => s.anchor === 'sultan_bazaar'); let x = 0, y = 0; for (const s of L) { x += s.x; y += s.y; } x /= L.length; y /= L.length; const s0 = L.slice().sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]; return { x: s0.x + s0.fx * 16 * 1.25, y: s0.y + s0.fy * 16 * 1.25, fx: s0.x, fy: s0.y, n: L.length }; },
  tankbund: () => { const p = N.places.tank_bund; return { x: p.x, y: p.y, fx: p.x + 300, fy: p.y + 220 }; },
};
/** set the date / time, put Chinnu somewhere, settle the Diwali world round him */
async function stage(page, o) {
  return page.evaluate((o) => {
    if (N.missions && N.missions.active) N.missions.abort();
    N.calendar.set(2003, 10, o.d, o.h, o.m); N.debug.setTime(o.h, o.m);
    if (N.view.mode !== 'top' && !o.keep3d) N.view.set('top');
    const sp = o.at;
    N.debug.teleport(sp.x, sp.y);
    if (N.player.vehicle) N.debug.teleport(sp.x, sp.y);
    N.render.baseZoom = o.zoom || 1; N.render.cam.zoom = o.zoom || 1; N.render.snapCamera();
    if (N.traffic && N.traffic.fill) N.traffic.fill();
    N.diwali.debug.settle();
    return { active: N.diwali.active(), stalls: N.diwali.stalls(), I: +N.diwali.intensity().toFixed(2), L: +N.diwali.litterLevel().toFixed(2), haze: +N.diwali.haze().toFixed(2) };
  }, o);
}
async function where(page, key) { return page.evaluate('(' + SPOTS[key].toString() + ')()'); }
async function to3D(page, look) {
  await page.evaluate(() => N.view.set('tps'));
  await page.waitForFunction(() => N.view3d && N.view3d.active, null, { timeout: 240000 });
  await page.evaluate(() => { N.view3d.settle(9000); N.diwali.debug.settle(6000); });
  await aim(page, look);
}
async function aim(page, look) {
  await page.evaluate((L) => {
    const p = N.player, yaw = L.yaw != null ? L.yaw : Math.atan2(L.fy - p.y, L.fx - p.x);
    // a clean camera: no parked bus / lorry right behind Chinnu
    if (N.traffic && N.traffic.clear) N.traffic.clear((v) => Math.hypot(v.x - p.x, v.y - p.y) < 80);
    p.angle = p.facing = yaw;
    N.view3d.setCamera({ yaw, pitch: L.pitch == null ? 0.05 : L.pitch, snap: true });
  }, look);
}
async function settle3d(page) { await page.evaluate(() => { N.view3d.settle(6000); N.diwali.debug.settle(4000); }); }
const stats = (page) => page.evaluate(() => N.diwali.stats());
async function endCtx(ctx) {
  const ne = await N_ERRS(ctx.page).catch(() => ['(page gone)']);
  check(ctx.errors.length === 0, 'no console / page errors', ctx.errors.slice(0, 4).join(' | '));
  check(ne.length === 0, 'no N.err reports', ne.slice(0, 4).join(' | '));
  await ctx.context.close();
}

/* ================================================================ the API + rules */
async function apiTests(browser) {
  cur = 'api';
  console.log('\n== API + rules');
  const C = await open(browser, { viewport: { width: 1280, height: 720 } });
  const { page } = C;
  const cal = await page.evaluate(() => {
    const at = (d, h) => { N.calendar.set(2003, 10, d, h || 12, 0); return { p: N.seasons.is('pataakha'), d: N.seasons.is('diwali'), r: N.seasons.is('ramzan'), act: N.diwali.active(), st: N.diwali.stallsWeek() }; };
    return { d19: at(19), d20: at(20), d21: at(21), d22: at(22), d25: at(25), d26: at(26), d27: at(27), flags: (at(25), [N.flags.pataakha, N.flags.diwali]) };
  });
  check(!cal.d19.p && !cal.d19.d, 'calendar: 19 Oct nothing', JSON.stringify(cal.d19));
  check(cal.d20.p && !cal.d20.d && cal.d21.p && !cal.d21.d, 'calendar: 20-21 Oct pataakha only (the stalls go up)');
  check(cal.d22.p && cal.d22.d && cal.d25.p && cal.d25.d && cal.d26.d, 'calendar: 22-26 Oct pataakha + diwali');
  check(!cal.d27.p && !cal.d27.d && cal.d27.r, 'calendar: 27 Oct Diwali over, Ramzan begins', JSON.stringify(cal.d27));
  check(cal.flags[0] === true && cal.flags[1] === true, 'mirrored into N.flags');
  const H = await where(page, 'home');
  await stage(page, { d: 25, h: 20, m: 30, at: H, zoom: 1 });
  await simWait(page, 3);
  const a = await page.evaluate(() => {
    const D = N.diwali, P = N.places, h = D.spots.home;
    const mosque = N.respect.zones.find((z) => z.kind === 'mosque' && z.gate);
    const temple = N.respect.zones.find((z) => z.kind === 'temple' && z.gate);
    const hosp = P.osmania_hospital;
    const sb = D.layout.stalls().filter((s) => s.anchor === 'sultan_bazaar');
    const houses = D.layout.houses(h.x, h.y, 200);
    const terr = D.spots.terrace;
    return {
      night: D.isNight(), I: D.intensity(), fireHome: D.fireOK(h.x, h.y + 10), fireMosque: mosque ? D.fireOK(mosque.gate.x, mosque.gate.y + 40) : null, fireTemple: temple ? D.fireOK(temple.gate.x, temple.gate.y) : null,
      fireHosp: D.fireOK(hosp.x + 120, hosp.y), stalls: D.layout.stalls().length, sb: sb.length, sbLabels: sb.map((s) => s.label),
      houses: houses.length, homeIn: houses.some((d) => d.home), withKandil: houses.filter((d) => d.kandil).length, withFairy: houses.filter((d) => d.fairy).length, withRangoli: houses.filter((d) => d.rangoli).length,
      terrace: terr ? terr.parapet.length : 0, spotsList: D.spots.list().length, homeSpot: !!D.spots.near(h.x, h.y, 30), families: D.spots.find(h.x, h.y, 300).length,
      groups: D.debug.groups(),
    };
  });
  check(a.night && a.I > 0.9, 'Deepavali night 20:30: isNight() + peak intensity', 'I ' + a.I);
  check(a.fireHome === true, 'fireOK at the home gate');
  check(a.fireMosque === false, 'no crackers by a mosque (fireOK false 40 u from its gate)');
  check(a.fireTemple === false, 'no crackers in a temple compound');
  check(a.fireHosp === false, 'no crackers within 230 u of a hospital (Osmania)');
  check(a.sb >= 6, 'pataakha stalls along Sultan Bazaar', a.sb + ' stalls: ' + a.sbLabels.slice(0, 4).join(', '));
  check(a.stalls >= 30, 'stalls at the markets + kiranas too', a.stalls + ' in all');
  check(a.houses >= 15 && a.homeIn, 'decorated houses round home (+ the home itself)', a.houses + ' houses, rangoli ' + a.withRangoli + ', kandil ' + a.withKandil + ', fairy ' + a.withFairy);
  check(a.terrace >= 21, 'the home terrace parapet offers >= 21 diya spots', a.terrace);
  check(a.homeSpot && a.spotsList >= 2, 'light spots: the home family + families with buckets', JSON.stringify(a.groups));
  // the cracker box + the lighting rule
  const b = await page.evaluate(() => {
    const D = N.diwali, p = N.player, out = {};
    D.box.clear();
    out.add = D.box.add('phuljhadi', 3); out.add2 = D.box.add('anaar', 1);
    out.use = D.box.use('phuljhadi'); out.left = D.box.count('phuljhadi'); out.none = D.box.use('rocket');
    // far from any adult
    N.debug.teleport(N.places.tank_bund.x, N.places.tank_bund.y);
    out.far = D.canLight(p.x, p.y).why;
    out.farLit = D.lightFromBox('phuljhadi');
    // beside the home family
    const h = D.spots.home, sp = D.spots.list().find((s) => s.kind === 'home');
    N.debug.teleport(sp.x + 6, sp.y);
    for (const a of (N.traffic && N.traffic.animals) || []) if (Math.hypot(a.x - p.x, a.y - p.y) < 60) { N.entities.remove(a); a.alive = false; }
    out.home = D.canLight(p.x, p.y, 'phuljhadi');
    out.homeWhy = out.home.why; out.homeOk = out.home.ok;
    const lit0 = D.stats().lit;
    out.e = !!D.lightFromBox('phuljhadi'); out.lit = D.stats().lit - lit0; out.left2 = D.box.count('phuljhadi');
    // an elder walks up: the adult stops it and the Chappal Meter warms up
    const old = N.traffic.spawnPed('old', { x: p.x + 12, y: p.y + 4 });
    if (old) { old.hold = true; old.role = 'old'; }
    const heat0 = N.wanted ? N.wanted.heat : 0;
    out.elder = D.canLight(p.x + 6, p.y, 'anaar').why;
    out.elderLit = !!D.lightFromBox('anaar', { x: p.x + 6, y: p.y });
    out.heat = (N.wanted ? N.wanted.heat : 0) - heat0;
    if (old) { N.entities.remove(old); old.alive = false; }
    void h;
    return out;
  });
  check(b.add === 3 && b.use === true && b.left === 2 && b.none === false, 'box: add / use / count', JSON.stringify({ add: b.add, use: b.use, left: b.left }));
  check(b.far === 'adult' && !b.farLit, 'away from Amma / Nanna / a bucket: nothing lights (why "adult")');
  check(b.homeOk && b.e && b.lit === 1 && b.left2 === 1, 'beside the home family: a phuljhadi lights from the box', JSON.stringify({ why: b.homeWhy, lit: b.lit }));
  check(b.elder === 'elder' && !b.elderLit && b.heat > 0, 'near an elder: the adult stops it + Chappal Meter heat', JSON.stringify({ why: b.elder, heat: b.heat }));
  // the dogs, a bomb by someone, shows
  const c = await page.evaluate(() => {
    const D = N.diwali, p = N.player, out = {};
    const dogs = (N.traffic.animals || []).filter((a) => a.alive && a.species === 'dog');
    out.dogs = dogs.length;
    const dog = dogs[0];
    if (dog) { out.hide = D.dogs.hide(dog, { x: dog.x - 20, y: dog.y }); out.hiding = D.dogs.hiding.indexOf(dog) >= 0; window.__dwdog = dog; }
    const d0 = D.stats().duds;
    D.bomb(p.x + 2, p.y, { fuse: 0.4 });
    window.__dwd0 = d0;
    const sh = D.show(p.x, p.y, 3, { r0: 40, r1: 120 }); out.show = !!(sh && sh.running);
    return out;
  });
  await simWait(page, 4);
  const c2 = await page.evaluate(() => {
    const D = N.diwali, dog = window.__dwdog, out = { duds: D.stats().duds - window.__dwd0 };
    if (dog) { out.moved = Math.hypot(dog.dwSpot.x - dog.x, dog.dwSpot.y - dog.y); N.debug.teleport(dog.x + 6, dog.y); dog.dwHide = Math.max(dog.dwHide, 20); out.calm = D.dogs.calm(dog); out.calmed = dog.dwCalm === true; }
    out.bursts = D.stats().bursts;
    return out;
  });
  if (c.dogs) check(c.hide && c.hiding && c2.calm && c2.calmed, 'a traffic dog hides from the bang and can be comforted', JSON.stringify({ toSpot: Math.round(c2.moved || 0) }));
  else ok('no traffic dog round home right now (dog rule skipped)');
  check(c2.duds >= 1, 'a bomb with Chinnu beside it only fizzles (nobody is near a bang)');
  check(c.show && c2.bursts > 0, 'show() fills the sky', c2.bursts + ' bursts');
  const q = await page.evaluate(() => { N.debug.setTime(12, 0); return { night: N.diwali.isNight(), I: N.diwali.intensity() }; });
  check(!q.night && q.I < 0.05, 'midday: not night, almost no crackers', JSON.stringify(q));
  await endCtx(C);
}

/* ================================================================ places at night + the next morning */
async function placeTests(browser, key, label) {
  cur = key;
  console.log('\n== ' + label);
  const C = await open(browser, { viewport: { width: 1280, height: 720 } });
  const { page } = C;
  const S = await where(page, key === 'colony' ? 'home' : key);
  const z = key === 'tankbund' ? 1 : key === 'koti' ? 1.25 : 1.3;
  const st0 = await stage(page, { d: 25, h: 20, m: 30, at: S, zoom: z });
  check(st0.active && st0.I > 0.9, 'Deepavali night', JSON.stringify(st0));
  await simWait(page, 7);
  let s = await stats(page);
  check(s.bursts > 2 && s.sparks > 30, 'rockets bursting overhead', s.bursts + ' bursts, ' + s.sparks + ' sparks');
  if (key === 'colony') {
    check(s.houses2d >= 15, 'decorated houses in view', s.houses2d);
    check(s.groups >= 3 && s.persons >= 8, 'families out with crackers (+ the home family)', s.groups + ' groups, ' + s.persons + ' people');
    check(s.sparklers + s.anaars + s.chakris + s.ladis + s.bombs + s.duds > 0, 'phuljhadis / anaars / chakris / ladis going', JSON.stringify({ sp: s.sparklers, an: s.anaars, ch: s.chakris, la: s.ladis, bo: s.bombs }));
  }
  if (key === 'koti') check(s.stalls2d >= 4, 'pataakha stalls lit at night', s.stalls2d + ' in view');
  check(s.bits > 50, 'tonight\'s paper is building up on the roads', s.bits + ' bits, ' + s.decals + ' patches');
  await shot(page, key + '_night_2d');
  // 3D
  await to3D(page, { fx: S.fx, fy: S.fy, pitch: key === 'tankbund' ? -0.18 : -0.06 });
  await simWait(page, 5);
  await settle3d(page);
  s = await stats(page);
  check(s.decor3d > 0 || key !== 'colony', '3D: the decorated houses built', s.decor3d + ' houses');
  if (key === 'koti') check(s.stalls3d >= 4, '3D: the stalls built', s.stalls3d);
  await simWait(page, 2);
  await shot(page, key + '_night_3d');
  const v3 = await page.evaluate(() => { const st = N.view3d.stats(); return { calls: st.calls, js: +st.jsMs.toFixed(2), fog: N.view3d.H && N.view3d.H.scene && N.view3d.H.scene.fog ? Math.round(N.view3d.H.scene.fog.far) : null }; });
  console.log('       3D: ' + JSON.stringify(v3));
  // the next morning
  await page.evaluate(() => N.view.set('top'));
  await stage(page, { d: 26, h: 8, m: 0, at: S, zoom: key === 'tankbund' ? 1.6 : 2 });
  await simWait(page, 3);
  s = await stats(page);
  check(s.bits > 300 && s.decals > 20, '08:00 the next morning: the paper is still on the roads', s.bits + ' bits, ' + s.decals + ' patches');
  const lvl = await page.evaluate(() => N.diwali.litterLevel());
  check(lvl > 0.9, 'litterLevel the morning after Deepavali', lvl.toFixed(2));
  await shot(page, key + '_morning_2d');
  await to3D(page, { fx: S.fx, fy: S.fy, pitch: 0.25 });
  await simWait(page, 3);
  await settle3d(page);
  await shot(page, key + '_morning_3d');
  if (key === 'colony') {
    await page.evaluate(() => N.view.set('top'));
    await stage(page, { d: 26, h: 15, m: 0, at: S, zoom: 2 });
    await simWait(page, 3);
    s = await stats(page);
    const sw = await page.evaluate(() => ({ L: N.diwali.litterLevel(), sw: N.diwali.sweepLevel() }));
    check(sw.L < 0.6 && sw.sw > 0.5 && s.heaps > 0, '15:00: swept into heaps at the kerbs', JSON.stringify({ level: +sw.L.toFixed(2), sweep: +sw.sw.toFixed(2), heaps: s.heaps, bits: s.bits }));
    await shot(page, 'colony_swept_2d');
  }
  await endCtx(C);
}

/* ================================================================ the wake: paper blowing as a car passes */
async function wakeTests(browser) {
  cur = 'wake';
  console.log('\n== paper in a passing car\'s wake');
  const C = await open(browser, { viewport: { width: 1280, height: 720 } });
  const { page } = C;
  for (const view of ['2d', '3d']) {
    const H = await where(page, 'home');
    if (view === '3d') await to3D(page, { yaw: 0, pitch: 0.3 });
    await stage(page, { d: 26, h: 8, m: 30, at: H, zoom: 2.6, keep3d: view === '3d' });
    const setup = await page.evaluate((view) => {
      if (N.traffic) { N.traffic.enabled = false; N.traffic.clear(); }
      const W = N.world, home = N.diwali.spots.home;
      // a straight stretch of the home lane west of the house
      const rp = W.nearestRoadPoint(home.x - 70, home.y - 20);
      const ang = rp.angle, ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
      const px = rp.x, py = rp.y;
      N.diwali.debug.sprinkle(px, py, 9, 160);
      N.diwali.litter.settle();
      // Chinnu at the lane edge, the car coming from 150 u back on the left-hand side of the lane
      const side = 1;
      N.debug.teleport(px + ux * 18 + nx * (rp.road.w / 2 + 6) * side, py + uy * 18 + ny * (rp.road.w / 2 + 6) * side);
      N.player.angle = N.player.facing = Math.atan2(-ny * side, -nx * side);
      const v = N.vehicles.spawn('ambassador', px - ux * 150 - nx * 3, py - uy * 150 - ny * 3, ang, { driver: true, color: '#efe9dc' });
      v.noEnter = true;
      N.time.scale = 0; // hold everything until the camera is ready
      v.controller = (vv) => { vv.ctl.throttle = Math.abs(vv.speed) < 105 ? 1 : 0.2; vv.ctl.steer = 0; };
      window.__wk = { v, px, py, ux, uy, stage: 0 };
      // freeze the world the moment the car's nose is 22 u short of the paper, and again when it is 55 u past it
      const watch = () => {
        const W2 = window.__wk; if (!W2 || !W2.v.alive) return;
        const along = (W2.v.x - W2.px) * W2.ux + (W2.v.y - W2.py) * W2.uy;
        if (W2.stage === 0 && along > -22 - 15) { N.time.scale = 0; W2.stage = 1; }
        else if (W2.stage === 2 && along > 55) { N.time.scale = 0; W2.stage = 3; }
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
      if (view === '3d') { const p = N.player; const yaw = Math.atan2(py - uy * 40 - p.y, px - ux * 40 - p.x); N.view3d.setCamera({ yaw, pitch: 0.32, snap: true }); }
      return { px, py, ang, near: N.diwali.litter.near(px, py, 10) };
    }, view);
    if (view === '3d') { await settle3d(page); await aim(page, { fx: setup.px - Math.cos(setup.ang) * 30, fy: setup.py - Math.sin(setup.ang) * 30, pitch: 0.34 }); await sleep(1500); }
    await page.evaluate(() => { N.time.scale = 1; });
    check(setup.near.resting > 100, view + ': a patch of paper on the lane', JSON.stringify(setup.near));
    await page.waitForFunction(() => window.__wk && window.__wk.stage === 1, null, { timeout: 120000 });
    const before = await page.evaluate(() => { const W2 = window.__wk; return { near: N.diwali.litter.near(W2.px, W2.py, 10), sp: Math.round(Math.abs(W2.v.speed)) }; });
    await shot(page, 'wake_' + view + '_before');
    await page.evaluate(() => { window.__wk.stage = 2; N.time.scale = 1; });
    await page.waitForFunction(() => window.__wk && window.__wk.stage === 3, null, { timeout: 120000 });
    const after = await page.evaluate(() => { const W2 = window.__wk; return { near: N.diwali.litter.near(W2.px, W2.py, 10), wide: N.diwali.litter.near(W2.px, W2.py, 60), sp: Math.round(Math.abs(W2.v.speed)), kicked: N.diwali.stats().flyingBits }; });
    await shot(page, 'wake_' + view + '_after');
    const moved = before.near.n - after.near.n, up = after.wide.flying + after.wide.sliding;
    check(before.near.flying === 0, view + ': before the car: the paper lies still', JSON.stringify(before));
    check(up >= 25 && after.wide.flying >= 8, view + ': after the car passes: paper flying / sliding in its wake', JSON.stringify({ flying: after.wide.flying, sliding: after.wide.sliding, carSpeed: after.sp }));
    check(moved >= 25, view + ': blown out of the patch', moved + ' of ' + before.near.n + ' bits left the 10 u circle');
    // the swirl settles again
    await page.evaluate(() => { N.time.scale = 1; const W2 = window.__wk; if (W2 && W2.v) N.vehicles.remove ? N.vehicles.remove(W2.v) : (W2.v.alive = false); });
    await simWait(page, 5);
    const later = await page.evaluate(() => { const W2 = window.__wk; return N.diwali.litter.near(W2.px, W2.py, 80); });
    check(later.flying <= 3, view + ': a few seconds later the paper has come down', JSON.stringify(later));
    await page.evaluate(() => { if (N.traffic) N.traffic.enabled = true; N.view.set('top'); });
  }
  // a gusty day: the paper drifts and lifts with N.wind (no vehicles needed)
  const H = await where(page, 'home');
  await stage(page, { d: 26, h: 9, m: 0, at: H, zoom: 1.6 });
  const calm = await page.evaluate(() => { if (N.traffic) { N.traffic.enabled = false; N.traffic.clear(); } N.wind.force({ strength: 0.05, gustiness: 0 }); N.diwali.litter.settle(); return N.diwali.litter.count; });
  await simWait(page, 2);
  const still = await page.evaluate(() => N.diwali.litter.awake);
  await page.evaluate(() => N.wind.force({ strength: 0.75, gustiness: 1, dir: 0.4 }));
  await simWait(page, 4);
  const windy = await page.evaluate(() => ({ awake: N.diwali.litter.awake, flying: N.diwali.litter.flying }));
  check(still <= 2 && windy.awake >= 30, 'N.wind: calm air leaves the paper be, a gusty wind drifts and lifts it', JSON.stringify({ bits: calm, calmAwake: still, windy }));
  await shot(page, 'wind_gusts_2d');
  await page.evaluate(() => { N.wind.force(null); if (N.traffic) N.traffic.enabled = true; });
  await endCtx(C);
}

/* ================================================================ stalls by day */
async function stallTests(browser) {
  cur = 'stalls';
  console.log('\n== pataakha stalls by day (21 Oct, 11:00)');
  const C = await open(browser, { viewport: { width: 1280, height: 720 } });
  const { page } = C;
  const S = await where(page, 'koti');
  const st = await stage(page, { d: 21, h: 11, m: 0, at: S, zoom: 1.7 });
  check(st.stalls && !st.active, 'the stalls are open on the 21st (pataakha, no Diwali yet)', JSON.stringify(st));
  await simWait(page, 3);
  const s = await stats(page);
  check(s.stalls2d >= 3, 'stalls in view', s.stalls2d);
  check(s.sparks === 0 && s.bursts === 0, 'no fireworks before Diwali at noon');
  const offer = await page.evaluate(() => { const L = N.diwali.layout.stalls().filter((q) => q.anchor === 'sultan_bazaar'); const s0 = L[0]; N.debug.teleport(s0.x + s0.fx * 10, s0.y + s0.fy * 10); return true; });
  await simWait(page, 0.5);
  const buy = await page.evaluate(() => { const lbl = N.interact && N.interact.current ? N.interact.current.label : null; N.diwali.box.clear(); const m0 = N.player.money; const before = N.diwali.box.count('phuljhadi'); if (N.interact.current && /Phuljhadi/.test(N.interact.current.label)) N.interact.current.use(N.player); return { lbl, got: N.diwali.box.count('phuljhadi') - before, paid: m0 - N.player.money }; });
  check(offer && buy.lbl && /Phuljhadi box/.test(buy.lbl) && buy.got === 10 && buy.paid === 500, 'a ₹5 box of 10 phuljhadis at a stall', JSON.stringify(buy));
  await page.evaluate((S) => { N.debug.teleport(S.x, S.y); }, S);
  await simWait(page, 1);
  await shot(page, 'stalls_day_2d');
  await to3D(page, { fx: S.fx, fy: S.fy, pitch: 0.12 });
  await simWait(page, 3);
  await settle3d(page);
  const s3 = await stats(page);
  check(s3.stalls3d >= 4, '3D: stalls built', s3.stalls3d);
  await shot(page, 'stalls_day_3d');
  await endCtx(C);
}

/* ================================================================ fireworks sky shots */
async function skyTests(browser) {
  cur = 'sky';
  console.log('\n== fireworks sky shots');
  const C = await open(browser, { viewport: { width: 1280, height: 720 } });
  const { page } = C;
  const H = await where(page, 'home');
  await stage(page, { d: 25, h: 21, m: 15, at: H, zoom: 0.9 });
  await page.evaluate(() => { const p = N.player; N.diwali.show(p.x, p.y + 30, 60, { r0: 20, r1: 190, rate: 5 }); });
  await simWait(page, 4);
  let s = await stats(page);
  check(s.shows === 1 && s.bursts >= 10, 'a dense show', s.bursts + ' bursts, ' + s.sparks + ' sparks');
  await shot(page, 'sky_2d');
  await to3D(page, { fx: H.fx, fy: H.fy, pitch: -0.42 });
  await page.evaluate(() => { const p = N.player, yaw = N.view.yaw; N.diwali.show(p.x + Math.cos(yaw) * 380, p.y + Math.sin(yaw) * 380, 60, { r0: 30, r1: 260, rate: 5 }); });
  await simWait(page, 5);
  s = await stats(page);
  check(s.sparks > 200, '3D: the sky full of sparks', s.sparks);
  await shot(page, 'sky_3d');
  await endCtx(C);
}

/* ================================================================ performance */
async function perfTests(browser) {
  for (const V of [{ name: 'phone', viewport: { width: 390, height: 844 }, touch: true, dpr: 2 }, { name: 'desktop', viewport: { width: 1280, height: 720 } }]) {
    cur = 'perf-' + V.name;
    console.log('\n== perf ' + V.name + ' ' + V.viewport.width + 'x' + V.viewport.height);
    const C = await open(browser, V);
    const { page } = C;
    const H = await where(page, 'home');
    await stage(page, { d: 25, h: 21, m: 0, at: H, zoom: 1 });
    await page.evaluate(() => N.diwali.debug.force(1));
    for (const view of ['2d', '3d']) {
      if (view === '3d') await to3D(page, { fx: H.fx, fy: H.fy, pitch: 0 });
      await simWait(page, 4);
      // sample this module's per-frame cost over ~8 s of play
      const samp = await page.evaluate(async () => {
        const out = { upd: [], d2: [], d3: [], frame: [], sparks: 0, bits: 0, smoke: 0, persons: 0 };
        for (let i = 0; i < 16; i++) {
          await new Promise((r) => setTimeout(r, 500));
          const s = N.diwali.stats();
          out.upd.push(s.msAvg); out.d2.push(s.ms2dAvg); out.d3.push(s.ms3dAvg); out.frame.push(N.debug.perf().frameMs);
          out.sparks = Math.max(out.sparks, s.sparks); out.bits = Math.max(out.bits, s.bits); out.smoke = Math.max(out.smoke, s.smoke); out.persons = Math.max(out.persons, s.persons);
          out.budget = s.budget; out.phone = s.phone;
        }
        const avg = (a) => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
        const v3 = N.view3d && N.view3d.active ? N.view3d.stats() : null;
        return { upd: avg(out.upd), d2: avg(out.d2), d3: avg(out.d3), frame: avg(out.frame), sparks: out.sparks, bits: out.bits, smoke: out.smoke, persons: out.persons, budget: out.budget, phone: out.phone, calls: v3 ? v3.calls : null, js3d: v3 ? +v3.jsAvg.toFixed(2) : null };
      });
      console.log('       ' + view + ' ' + JSON.stringify(samp));
      const B = samp.budget;
      check(samp.phone === (V.name === 'phone'), view + ': device tier', samp.phone ? 'phone' : 'desk');
      check(samp.sparks <= B.sparks && samp.bits <= B.litter && samp.smoke <= B.smoke && samp.persons <= B.persons, view + ': within TUNE.budget', 'sparks ' + samp.sparks + '/' + B.sparks + ', paper ' + samp.bits + '/' + B.litter + ', smoke ' + samp.smoke + '/' + B.smoke + ', people ' + samp.persons + '/' + B.persons);
      const lim = V.name === 'phone' ? { upd: 3, d: 6 } : { upd: 3, d: 6 };
      check(samp.upd <= lim.upd, view + ': update ms/frame (this module)', samp.upd + ' ms (limit ' + lim.upd + ')');
      if (view === '2d') check(samp.d2 <= lim.d, '2D draw ms/frame (this module)', samp.d2 + ' ms (limit ' + lim.d + ')');
      else check(samp.d3 <= lim.d, '3D layer ms/frame (this module)', samp.d3 + ' ms (limit ' + lim.d + ')');
      await shot(page, 'perf_' + V.name + '_' + view);
    }
    await endCtx(C);
  }
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (want('api')) await apiTests(browser);
    if (want('colony')) await placeTests(browser, 'colony', 'the home colony (Lakshmi Nagar), Deepavali night + the morning after');
    if (want('koti')) await placeTests(browser, 'koti', 'Sultan Bazaar / Koti, Deepavali night + the morning after');
    if (want('tankbund')) await placeTests(browser, 'tankbund', 'Tank Bund, Deepavali night + the morning after');
    if (want('wake')) await wakeTests(browser);
    if (want('stalls')) await stallTests(browser);
    if (want('sky')) await skyTests(browser);
    if (want('perf')) await perfTests(browser);
  } catch (e) { failures.push('[' + cur + '] crashed: ' + (e.stack || e.message)); console.log(e); }
  await browser.close();
  console.log('\n' + shots.length + ' screenshots; ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  if (failures.length) { console.log('\nFAILURES (' + failures.length + '):\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('ALL DIWALI TESTS PASSED');
})();
