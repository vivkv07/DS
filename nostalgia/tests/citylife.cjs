/* NOSTALGIA — tests/citylife.cjs (place-anchored city-life scenes, src/citylife.js, design/atmosphere.md "City-life scenes")
 *
 *   top    640x400 top-down: the spot catalogue (every Irani cafe / barber / bus stop + roadside saloons, tea stalls,
 *          street trades, roadwork), the schedules (tea peaks 07-09 / 16-19, saloons closed Tuesdays and packed on
 *          Sunday mornings, trades' hours, roadwork crew by day), then every scene at its peak time: people are real
 *          'ped' entities (seated readers with newspapers, the client under the cape, the barber's work loop, the bus
 *          rush + footboard + conductor, labourers with head-loads...), particles, sounds registered; a close-up
 *          screenshot of each.
 *   3d     640x400 third person (three.js from vendor/, SwiftShader): the same scenes, camera aimed at each.
 *   phone  390x844 touch: three busy scenes on screen at once (2D + 3D): ms / frame of this module.
 * Fails on any console error / page error / N.err. Screenshots: tests/out/citylife_*.png.
 *   node nostalgia/tests/citylife.cjs        ONLY=top|3d|phone   SCENES=irani,saloon,...   SHOTS=0
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

const ONLY = process.env.ONLY;
const SHOTS = process.env.SHOTS !== '0';
const FILTER = process.env.SCENES ? process.env.SCENES.split(',') : null;
const failures = [];
const report = [];
const shots = [];
let cur = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { failures.push('[' + cur + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg + (detail ? '  (' + detail + ')' : '')); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };

// scene id -> [kind for force(), peak hour, minute, day-of-week wanted (null = any)]
const SCENES = [
  ['irani', 'irani', 8, 0], ['chai', 'chai', 17, 0], ['saloon', 'saloon', 9, 30], ['cabin', 'saloon:cabin', 10, 0], ['busstop', 'busstop', 8, 45],
  ['cobbler', 'trade:cobbler', 10, 30], ['puncture', 'trade:puncture', 18, 0], ['ironing', 'trade:ironing', 8, 30], ['tailor', 'trade:tailor', 18, 0],
  ['knife', 'trade:knife', 11, 0], ['raddi', 'trade:raddi', 10, 0], ['vegcart', 'trade:vegcart', 8, 0], ['flowers', 'trade:flowers', 7, 30],
  ['cyclerepair', 'trade:cyclerepair', 17, 30], ['keymaker', 'trade:keymaker', 17, 0], ['roadwork', 'roadwork', 11, 0],
].filter((s) => !FILTER || FILTER.indexOf(s[0]) >= 0);

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
    if (N.seasons) { N.seasons.set('sankranti', false); }
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    window.__cl = { bus: [], scene: 0, whistle: 0 };
    N.on('citylife:bus', (e) => window.__cl.bus.push(e.phase));
    N.on('citylife:scene', () => { window.__cl.scene++; });
    N.on('citylife:whistle', () => { window.__cl.whistle++; });
  });
  await page.waitForFunction(() => N.citylife && N.citylife.stats().spots > 0, null, { timeout: 120000 });
  return { context, page, errors };
}
/** wait for `secs` of SIMULATION time (the machine may be busy), capped in real time */
async function simWait(page, secs, capMs) {
  const t0 = await page.evaluate(() => N.time.now);
  const cap = Date.now() + (capMs || secs * 9000 + 30000);
  while (Date.now() < cap) {
    await sleep(300);
    const t = await page.evaluate(() => N.time.now);
    if (t - t0 >= secs) return true;
  }
  return false;
}
/** set the day of week (N.clock.day shifts the calendar), time, force the spot and stand by it */
async function stage(page, kind, h, m, o) {
  o = o || {};
  return page.evaluate(([kind, h, m, o]) => {
    const want = o.dow;
    if (want != null && N.clock) { for (let i = 0; i < 7; i++) { const b = N.clock.baseDate || [2003, 0, 14]; const w = new Date(Date.UTC(b[0], b[1], b[2] + (N.clock.day || 0))).getUTCDay(); if (w === want) break; N.clock.day = (N.clock.day || 0) + 1; } }
    N.debug.setTime(h, m);
    if (o.rain) N.flags.rain = true; else delete N.flags.rain;
    N.citylife.force(null);
    let s = null;
    if (kind === 'saloon:cabin') s = N.citylife.spots.filter((q) => q.kind === 'saloon' && !q.lm).sort((a, b) => Math.hypot(a.x - N.player.x, a.y - N.player.y) - Math.hypot(b.x - N.player.x, b.y - N.player.y))[0];
    else if (kind === 'saloon') s = N.citylife.spots.filter((q) => q.kind === 'saloon' && q.lm && N.shops && N.shops.status && N.shops.status(q.place).open !== false).sort((a, b) => Math.hypot(a.x - N.player.x, a.y - N.player.y) - Math.hypot(b.x - N.player.x, b.y - N.player.y))[0];
    else if (kind === 'irani') s = N.citylife.spots.filter((q) => q.kind === 'irani' && N.citylife._debug.layoutOf(q).seats.length >= 3)[o.pick || 0];
    else { const id = N.citylife.force(kind, { level: o.level == null ? 1 : o.level }); s = N.citylife.spot(id); }
    if (!s) return null;
    N.citylife.force(s.id, o.level === null ? null : { level: o.level == null ? 1 : o.level, bus: !!o.bus });
    const F = s.F, off = { irani: 7, chai: 1, saloon: s.lm ? 4 : -1.5, busstop: 6, trade: 1.5, roadwork: -2 }[s.kind] || 4;
    const fx = F.cx + F.nx * off, fy = F.cy + F.ny * off;
    const pd = o.pdist == null ? 26 : o.pdist;
    N.debug.teleport(fx + F.nx * pd + F.ax * 8, fy + F.ny * pd + F.ay * 8);
    N.player.facing = N.player.angle = Math.atan2(fy - N.player.y, fx - N.player.x);
    window.__focus = { x: fx, y: fy, nx: F.nx, ny: F.ny, ax: F.ax, ay: F.ay, id: s.id };
    return { id: s.id, kind: s.kind, sub: s.sub || null, x: Math.round(s.x), y: Math.round(s.y), district: (N.world.districtAt(s.x, s.y) || {}).id };
  }, [kind, h, m, o]);
}
const sceneInfo = (page, id) => page.evaluate((id) => N.citylife.active().find((a) => a.id === id) || null, id);
async function shot2d(page, name, zoom) {
  if (!SHOTS) return;
  await page.evaluate((z) => { const f = window.__focus; N.render.camOverride = { x: f.x, y: f.y, zoom: z, snap: true }; }, zoom || 2.6);
  await simWait(page, 0.8, 20000);
  const file = path.join(OUT, 'citylife_' + name + '.png');
  await page.screenshot({ path: file, timeout: 180000 });
  shots.push(file);
  await page.evaluate(() => { N.render.camOverride = null; });
}
async function shot3d(page, name, o) {
  if (!SHOTS) return;
  o = o || {};
  await page.evaluate((o) => {
    const f = window.__focus, d = o.dist || 46, side = o.side == null ? 0.45 : o.side;
    const cx = f.x + f.nx * d + f.ax * d * side, cy = f.y + f.ny * d + f.ay * d * side;
    if (N.view3dActors && N.view3dActors.debug && N.view3dActors.debug.camera) N.view3dActors.debug.camera([cx, o.h || 26, cy], [f.x, o.lh || 6, f.y], 55);
  }, o);
  await simWait(page, 1.2, 40000);
  const file = path.join(OUT, 'citylife_' + name + '.png');
  await page.screenshot({ path: file, timeout: 180000 });
  shots.push(file);
}
let EXT_BAD = false;
try { require('child_process').execFileSync(process.execPath, ['--check', path.join(ROOT, 'src/citylife_events.js')], { stdio: 'ignore' }); } catch (e) { EXT_BAD = true; }
const EXT_RE = /Unexpected end of input|Unexpected token|Script error\.|citylife_events/;
async function noErrors(page, errors, label) {
  if (EXT_BAD) { const ext = errors.filter((e) => EXT_RE.test(e)); if (ext.length) console.log('  note ' + ext.length + ' error(s) from src/citylife_events.js (the other builder\'s file does not parse right now; not this module)'); errors = errors.filter((e) => !EXT_RE.test(e)); }
  let ne = await page.evaluate(() => (N.errors || []).map((e) => (e.where || '') + ': ' + String(e.msg || e.message || e.error || JSON.stringify(e)).slice(0, 240)));
  if (EXT_BAD) ne = ne.filter((e) => !EXT_RE.test(e));
  check(errors.length === 0, label + ': no console / page errors', errors.slice(0, 3).join(' | '));
  check(ne.length === 0, label + ': no N.err reports', ne.slice(0, 4).join(' | '));
}
/** per scene kind: what must be seen after a few seconds at the peak */
async function verify(page, name, id) {
  const a = await sceneInfo(page, id);
  if (!check(!!a, name + ': scene active near the player', id)) return null;
  const ent = await page.evaluate((id) => {
    const sc = N.citylife.scene(id); if (!sc) return null;
    const all = N.entities.all;
    return { n: sc.people.length, peds: sc.people.filter((p) => p.kind === 'ped' && all.indexOf(p) >= 0).length, sit: sc.people.filter((p) => p.idle === 'sit').length, work: sc.people.filter((p) => p.idle === 'work').length, tools: sc.people.filter((p) => p.tool).map((p) => p.tool), holds: sc.people.filter((p) => p.hold).map((p) => p.hold), looks: new Set(sc.people.map((p) => p.look && p.look.kind)).size };
  }, id);
  report.push([name, JSON.stringify({ id, level: a.level, people: a.people, jobs: a.jobs, states: a.states, particles: a.particles, bus: a.bus, client: a.client })]);
  check(ent && ent.n > 0 && ent.peds === ent.n, name + ': people are real ped entities', ent && ent.peds + '/' + ent.n + ' ' + JSON.stringify(a.jobs));
  return { a, ent };
}

/* ======================================================================= top-down */
async function partTop(browser) {
  cur = 'top'; console.log('\n== top-down 640x400');
  const { context, page, errors } = await open(browser, { viewport: { width: 640, height: 400 } });
  const cat = await page.evaluate(() => {
    const S = N.citylife.stats();
    const iraniLm = N.WORLD_DATA.landmarks.filter((l) => l.draw === 'irani_cafe').length, barberLm = N.WORLD_DATA.landmarks.filter((l) => l.draw === 'barber').length, busLm = N.WORLD_DATA.landmarks.filter((l) => l.draw === 'bus_stop').length;
    return { kinds: S.kinds, spots: S.spots, iraniLm, barberLm, busLm, sfx: S.sfx, sfx2: N.audio && N.audio.SFX_NAMES ? ['cl_strop', 'cl_clipper', 'cl_sewing', 'cl_grind', 'cl_bubbles', 'cl_radio'].filter((n) => N.audio.SFX_NAMES.indexOf(n) >= 0).length : -1, sfKind: !!(N.streetfood && N.streetfood.KINDS.cl_chai) };
  });
  report.push(['catalogue', JSON.stringify(cat.kinds)]);
  const K = cat.kinds;
  check(K.irani === cat.iraniLm && K.irani >= 15, 'every Irani cafe landmark is a tea-shop scene', K.irani + '/' + cat.iraniLm);
  check((K.saloon || 0) >= cat.barberLm + 4, 'every barber landmark + roadside saloons on commercial streets', K.saloon + ' (barbers ' + cat.barberLm + ')');
  check(K.busstop === cat.busLm, 'every bus stop is a scene', K.busstop + '/' + cat.busLm);
  check((K.chai || 0) >= 4 && cat.sfKind, 'roadside tea stalls (streetfood kind cl_chai registered)', String(K.chai));
  const subs = ['cobbler', 'puncture', 'ironing', 'tailor', 'knife', 'raddi', 'vegcart', 'flowers', 'cyclerepair', 'keymaker'];
  const missing = subs.filter((s) => !K['trade:' + s]);
  check(missing.length === 0, 'all ten street trades are placed', missing.length ? 'missing ' + missing.join(',') : subs.map((s) => s + ':' + K['trade:' + s]).join(' '));
  check((K.roadwork || 0) >= 3, 'roadwork sites on real arterial roads', String(K.roadwork));
  check(cat.sfx2 === 6 || cat.sfx2 === -1, 'city-life sounds registered through N.audio.ext', 'registered ' + cat.sfx2 + '/6');
  // ---- rules
  const lv = await page.evaluate(() => {
    const D = N.citylife._debug, setDow = (w) => { const b = N.clock.baseDate || [2003, 0, 14]; for (let i = 0; i < 7; i++) { const d = new Date(Date.UTC(b[0], b[1], b[2] + (N.clock.day || 0))).getUTCDay(); if (d === w) return; N.clock.day = (N.clock.day || 0) + 1; } };
    const at = (s, h, m, rain) => { N.debug.setTime(h, m); return +D.levelOf({ spot: s, K: s.K, rain: rain || 0, style: 'colony' }).toFixed(2); };
    const ir = N.citylife.spots.find((q) => q.kind === 'irani'), sa = N.citylife.spots.find((q) => q.kind === 'saloon' && !q.lm), rw = N.citylife.spots.find((q) => q.kind === 'roadwork');
    const iron = N.citylife.spots.find((q) => q.sub === 'ironing'), raddi = N.citylife.spots.find((q) => q.sub === 'raddi'), punct = N.citylife.spots.find((q) => q.sub === 'puncture');
    setDow(3);
    const r = { tea0800: at(ir, 8, 0), tea1300: at(ir, 13, 0), tea1730: at(ir, 17, 30), tea0300: at(ir, 3, 0), salWed0930: at(sa, 9, 30), rw1100: at(rw, 11, 0), rw2100: at(rw, 21, 0),
      iron0830: at(iron, 8, 30), iron0830rain: at(iron, 8, 30, 1), raddi1000: at(raddi, 10, 0), raddi1500: at(raddi, 15, 0), punct1800: at(punct, 18, 0), punct1800rain: at(punct, 18, 0, 1) };
    setDow(2); r.salTue0930 = at(sa, 9, 30);
    setDow(0); r.salSun0930 = at(sa, 9, 30); r.rwSun1100 = at(rw, 11, 0);
    setDow(3);
    return r;
  });
  report.push(['levels', JSON.stringify(lv)]);
  check(lv.tea0800 > 0.6 && lv.tea1730 > 0.6 && lv.tea1300 < lv.tea0800 && lv.tea0300 === 0, 'tea shops: peaks 07-09 and 16-19, quieter at noon, shut at 03:00', JSON.stringify([lv.tea0800, lv.tea1300, lv.tea1730, lv.tea0300]));
  check(lv.salTue0930 === 0 && lv.salSun0930 > lv.salWed0930 * 1.5, 'saloons: closed Tuesdays, Sunday mornings packed', JSON.stringify([lv.salTue0930, lv.salWed0930, lv.salSun0930]));
  check(lv.rw1100 > 0.6 && lv.rw2100 === 0 && lv.rwSun1100 < 0.3, 'roadwork crew works weekdays by day only', JSON.stringify([lv.rw1100, lv.rw2100, lv.rwSun1100]));
  check(lv.iron0830rain < lv.iron0830 && lv.punct1800rain > lv.punct1800 * 0.99, 'weather: ironing stops in the rain, puncture shops stay busy', JSON.stringify([lv.iron0830, lv.iron0830rain, lv.punct1800, lv.punct1800rain]));
  check(lv.raddi1000 > 0.5 && lv.raddi1500 === 0, 'raddi-wala: the morning round only', JSON.stringify([lv.raddi1000, lv.raddi1500]));

  for (const [name, kind, h, m] of SCENES) {
    console.log(' -- ' + name + ' ' + h + ':' + String(m).padStart(2, '0'));
    const o = name === 'saloon' || name === 'cabin' ? { dow: 0 } : name === 'roadwork' ? { dow: 3 } : name === 'busstop' ? { dow: 3, bus: true } : { dow: 3 };
    const st = await stage(page, kind, h, m, o);
    if (!check(!!st, name + ': a spot to stage', kind)) continue;
    await simWait(page, name === 'busstop' ? 3 : 6);
    const v = await verify(page, name, st.id);
    if (!v) continue;
    const { a, ent } = v;
    switch (name) {
      case 'irani': case 'chai': {
        check(a.seated >= 2 && a.papers >= 1, name + ': men on the bench, newspapers open', 'seated ' + a.seated + ' papers ' + a.papers);
        if (name === 'chai') { const sf = await page.evaluate((id) => { const s = N.citylife.spot(id); const q = N.streetfood.active().find((x) => x.id === s.sf.id); return q ? { crowd: q.crowd, vendor: q.vendor && q.vendor.work } : null; }, st.id); check(sf && sf.vendor === 'chai', 'chai: the chai-wala + crowd come from the streetfood scene (reused)', JSON.stringify(sf)); }
        if (name === 'irani') {
          const cy = await page.evaluate(async (id) => { const sc = N.citylife.scene(id); sc.st.cycT = 0; sc.level = 1; return true; }, st.id);
          void cy;
          await simWait(page, 8);
          const c2 = await page.evaluate((id) => { const sc = N.citylife.scene(id); return sc ? sc.people.filter((p) => p.job === 'cyclist').map((p) => p.st) : null; }, st.id);
          check(c2 && c2.length > 0, 'irani: a cyclist pushes up for "do chai"', JSON.stringify(c2));
          const sit = await page.evaluate((id) => { const s = N.citylife.scene(id); const L = s.L; N.debug.teleport(L.sit.x + (s.F.nx) * 3, L.sit.y + s.F.ny * 3); return true; }, st.id);
          void sit;
          await simWait(page, 0.6);
          const lab = await page.evaluate(() => (N.interact && N.interact.current ? (typeof N.interact.current.label === 'function' ? N.interact.current.label() : N.interact.current.label) : null));
          check(lab === 'Sit for chai', 'irani: the player can sit for chai (shops.js "sit" row)', String(lab));
          await page.evaluate(() => { const f = window.__focus; N.debug.teleport(f.x + f.nx * 26, f.y + f.ny * 26); });
        }
        break;
      }
      case 'saloon': case 'cabin': {
        let s2 = null;
        const capS = Date.now() + 240000, t0s = await page.evaluate(() => N.time.now);
        for (let i = 0; Date.now() < capS && (await page.evaluate(() => N.time.now)) - t0s < 40; i++) {
          s2 = await page.evaluate((id) => { const sc = N.citylife.scene(id); const c = sc && sc.st.client, b = sc && sc.st.barber; return sc ? { client: c && c.alive && c.st === 'chair' ? { ph: c.ph, cape: c.cape, sit: c.idle } : null, barber: b ? { idle: b.idle, tool: b.tool } : null, waiting: sc.people.filter((p) => p.job === 'waiter').length } : null; }, st.id);
          if (s2 && s2.client && s2.client.cape && s2.barber && s2.barber.idle === 'work') break;
          await sleep(400);
        }
        check(s2 && s2.client && s2.client.cape && s2.client.sit === 'sit', name + ': a man in the chair under the white cloth', JSON.stringify(s2 && s2.client));
        check(s2 && s2.barber && s2.barber.idle === 'work', name + ': the barber works on him', JSON.stringify(s2 && s2.barber));
        check(s2 && s2.waiting >= 2, name + ': men waiting on the bench (Sunday morning)', String(s2 && s2.waiting));
        break;
      }
      case 'busstop': {
        check(a.people >= 3, 'busstop: a waiting crowd', String(a.people));
        // a bus: traffic's own or the scene-owned one; wait up to ~50 s of sim time
        let got = null;
        const cap = Date.now() + 240000;
        let tBus = await page.evaluate(() => N.time.now);
        while (Date.now() < cap) {
          await sleep(500);
          got = await page.evaluate((id) => { const sc = N.citylife.scene(id); return sc ? { bus: sc.st.bus ? (sc.st.departed ? 'departing' : 'stopped') : null, rush: sc.people.filter((p) => p.st === 'rush').length, hang: sc.people.filter((p) => p.st === 'hang').length, sell: sc.people.filter((p) => p.st === 'sell').length, ev: window.__cl.bus.slice() } : null; }, st.id);
          if (got && got.bus === 'stopped' && (got.rush || got.hang)) break;
          if ((await page.evaluate(() => N.time.now)) - tBus > 70) break;
        }
        report.push(['bus', JSON.stringify(got)]);
        check(got && got.bus, 'busstop: a bus stops (traffic.js bus or the scene-owned one)', JSON.stringify(got) + ' gaveUp ' + JSON.stringify(await page.evaluate(() => { const s = N.citylife.stats(); return [s.ownBuses, s.busGaveUp, s.busGaveUpBy]; })));
        check(got && (got.rush > 0 || got.hang > 0), 'busstop: the crowd rushes the door, men on the footboard', got && ('rush ' + got.rush + ' hang ' + got.hang + ' sell ' + got.sell));
        if (got && got.bus) {
          await page.evaluate(() => { const f = window.__focus; });
          await shot2d(page, name + '_rush_top', 2.0);
          const tdep = Date.now() + 120000;
          let dep = null;
          while (Date.now() < tdep) { await sleep(500); dep = await page.evaluate(() => window.__cl.bus.slice()); if (dep.indexOf('depart') >= 0) break; }
          check(dep && dep.indexOf('depart') >= 0, 'busstop: it pulls out ("Right, right!")', JSON.stringify(dep));
          await simWait(page, 1);
          const hang = await page.evaluate((id) => { const sc = N.citylife.scene(id); return sc ? sc.people.filter((p) => p.st === 'hang').map((p) => ({ z: p.z, bus: !!(p.bus && p.bus.alive) })) : []; }, st.id);
          check(hang.length > 0 && hang.every((h) => h.z > 0 && h.bus), 'busstop: footboard hangers ride with the departing bus (z > 0, never the player)', JSON.stringify(hang));
          if (hang.length) await page.evaluate((id) => { const sc = N.citylife.scene(id); const b = sc.st.bus; if (b) window.__focus = Object.assign({}, window.__focus, { x: b.x, y: b.y }); }, st.id);
          await shot2d(page, name + '_depart_top', 2.2);
          await page.evaluate((id) => { const s = N.citylife.spot(id); const F = s.F; window.__focus = Object.assign({}, window.__focus, { x: F.cx + F.nx * 6, y: F.cy + F.ny * 6 }); }, st.id);
        }
        break;
      }
      case 'roadwork': {
        const r2 = await page.evaluate((id) => { const sc = N.citylife.scene(id); return { jobs: sc.people.map((p) => p.job), carry: sc.people.filter((p) => p.job === 'carry' && p.look.prop === 'pot').length, smoke: (() => { let n = 0; const P = N.citylife._debug.P; for (let i = 0; i < P.n; i++) if (P.sc[i] === sc.uid && P.kind[i] === 1) n++; return n; })(), hav: !!sc.st.havaldar }; }, st.id);
        check(r2.jobs.indexOf('digger') >= 0 && r2.jobs.indexOf('shovel') >= 0 && r2.jobs.filter((j) => j === 'carry').length >= 2, 'roadwork: digger, shoveller at the mixer, labourers carrying loads', JSON.stringify(r2.jobs));
        check(r2.smoke >= 3, 'roadwork: the tar drum smokes', 'puffs ' + r2.smoke);
        check(r2.carry >= 1, 'roadwork: head-loads (look.prop pot: view3d head-carry pose)', String(r2.carry));
        // lanes stay open: the strip's road-side edge leaves the carriageway's centre half free
        const lane = await page.evaluate((id) => { const s = N.citylife.spot(id); const r = N.WORLD_DATA.roads.find((q) => q.id === s.road); const q = N.world.nearestRoadPoint(s.x, s.y); return { w: r.w, edgeFromCentre: Math.round(q.dist - s.zw) }; }, st.id);
        check(lane.edgeFromCentre >= lane.w / 2 - 9, 'roadwork: only the kerb strip is used (traffic lanes stay open)', JSON.stringify(lane));
        // the havaldar whistles at a kid racing his cycle past
        const wh = await page.evaluate(async (id) => {
          const sc = N.citylife.scene(id), h = sc.st.havaldar; if (!h) return 'no havaldar';
          const T = N.vehicles.TYPES; const type = T.kid_cycle ? 'kid_cycle' : T.hero_cycle ? 'hero_cycle' : 'cycle';
          const ang = Math.atan2(sc.F.ay, sc.F.ax), x0 = h.x - Math.cos(ang) * 34 - sc.F.nx * 9, y0 = h.y - Math.sin(ang) * 34 - sc.F.ny * 9;
          const v = N.vehicles.spawn(type, x0, y0, ang, {}); if (!v) return 'no cycle';
          N.player.teleport(x0, y0); if (N.vehicles.board) N.vehicles.board(N.player, v); else N.player.vehicle = v;
          window.__whv = v; return type;
        }, st.id);
        let whistled = false;
        for (let i = 0; i < 30 && !whistled; i++) { await page.evaluate(() => { const v = window.__whv; if (v) { v.speed = 50; v.vx = Math.cos(v.angle) * 50; v.vy = Math.sin(v.angle) * 50; if (v.wake) v.wake(); } }); await sleep(150); whistled = await page.evaluate(() => window.__cl.whistle > 0); }
        check(whistled, 'roadwork: the havaldar whistles at a kid racing his cycle', String(wh));
        await page.evaluate(() => { const v = window.__whv; if (v && N.player.vehicle === v && N.vehicles.exit) N.vehicles.exit(N.player, true); if (v) N.vehicles.remove(v); const f = window.__focus; N.debug.teleport(f.x + f.nx * 26, f.y + f.ny * 26); });
        // traffic keeps moving past the crew: traffic.js vehicles on the strip's carriageway (two-wheelers in the
        // kerb lane, an auto) are eased out of the strip; none sits < 3 u/s within 25 u of the crew for > 5 s
        const spawned = await page.evaluate((id) => {
          const sc = N.citylife.scene(id), F = sc.F, T = N.vehicles.TYPES;
          let a = Math.atan2(F.ay, F.ax); if (Math.sin(a) * F.nx - Math.cos(a) * F.ny < 0) a += Math.PI; // strip on the left kerb
          const dir = [Math.cos(a), Math.sin(a)], out = [];
          ['chetak', 'ladiescycle', 'auto', 'hero_cycle'].filter((k) => T[k]).forEach((type, i) => {
            const d = 70 + i * 22, x = F.cx - dir[0] * d - F.nx * 3.5, y = F.cy - dir[1] * d - F.ny * 3.5;
            const v = N.traffic.spawnVehicle(type, { x, y, angle: a }); if (v) out.push(v.id);
          });
          window.__flow = { ids: out, slow: {}, run: {}, n: 0 };
          return out.length;
        }, st.id);
        const tF = await page.evaluate(() => N.time.now);
        const capF = Date.now() + 240000;
        while (Date.now() < capF && (await page.evaluate(() => N.time.now)) - tF < 30) {
          await page.evaluate((id) => {
            const sc = N.citylife.scene(id), f = window.__flow, now = N.time.now; if (!sc) return; f.n++;
            for (const e of N.traffic.vehicles) {
              if (!e.alive || !e.tr) continue;
              let near = false; for (const p of sc.people) if (Math.hypot(e.x - p.x, e.y - p.y) < 25) { near = true; break; }
              const sp = Math.hypot(e.vx || 0, e.vy || 0);
              if (near && sp < 3) { if (f.run[e.id] == null) f.run[e.id] = now; f.slow[e.id] = Math.max(f.slow[e.id] || 0, now - f.run[e.id]); } else f.run[e.id] = null;
            }
          }, st.id);
          await sleep(250);
        }
        const flow = await page.evaluate((id) => { const f = window.__flow, sc = N.citylife.scene(id); const passed = f.ids.filter((vid) => { const v = N.traffic.vehicles.find((q) => q.id === vid); if (!v) return true; const F = sc.F; return Math.abs((v.x - F.cx) * F.ax + (v.y - F.cy) * F.ay) > 40; }).length; return { spawned: f.ids.length, passed, worst: Math.max(0, ...Object.values(f.slow)).toFixed(1), samples: f.n, slow: f.slow }; }, st.id);
        report.push(['roadwork flow', JSON.stringify(flow)]);
        check(spawned >= 2 && +flow.worst <= 5, 'roadwork: traffic flows past the crew (no vehicle held > 5 s within 25 u)', JSON.stringify(flow));
        check(flow.passed >= Math.min(2, flow.spawned), 'roadwork: the spawned kerb-lane vehicles got past the site', JSON.stringify(flow));
        break;
      }
      default: { // trades
        const tr = await page.evaluate((id) => { const sc = N.citylife.scene(id); const w = sc && sc.st.worker; return w ? { idle: w.idle, tool: w.tool, st: w.st, cust: sc.people.filter((p) => p.job === 'cust').length } : null; }, st.id);
        check(tr && (tr.tool || tr.st === 'patrol' || tr.st === 'halt'), name + ': the worker at his trade', JSON.stringify(tr));
        break;
      }
    }
    await shot2d(page, name + '_top', { roadwork: 2.6, busstop: 2.8, irani: 3.6, chai: 4 }[name] || 4.6);
  }
  // ---- rain: umbrellas over the trades, the crew shelters
  console.log(' -- rain');
  const rs = await stage(page, 'trade:cobbler', 10, 30, { dow: 3, rain: true });
  await simWait(page, 3);
  const umb = await page.evaluate((id) => { const sc = N.citylife.scene(id); return sc && sc.st.worker ? sc.st.worker.umb : null; }, rs && rs.id);
  check(!!umb, 'rain: the cobbler works under his umbrella', String(umb));
  await page.evaluate(() => { delete N.flags.rain; N.citylife.force(null); });
  // ---- the scene-owned bus brakes for Chinnu standing in its kerb lane (never shoves him along)
  if (!FILTER || FILTER.indexOf('busstop') >= 0) {
    console.log(' -- own bus vs Chinnu');
    const ob = await page.evaluate(() => {
      N.debug.setTime(9, 0);
      if (N.traffic) { N.traffic.enabled = false; if (N.traffic.clear) N.traffic.clear(); }
      const sps = N.citylife.spots.filter((q) => q.kind === 'busstop'), sp = sps[5] || sps[0];
      N.debug.teleport(sp.x + 200, sp.y + 200);
      return { id: sp.id, x: sp.x, y: sp.y };
    });
    await simWait(page, 1);
    await page.evaluate((s) => N.citylife.force(s.id, { level: 1, bus: true }), ob);
    let info = null;
    for (let i = 0; i < 40 && !info; i++) {
      await simWait(page, 1);
      info = await page.evaluate(() => {
        const v = N.entities.all.find((e) => e.kind === 'vehicle' && e.clBus && e.alive);
        if (!v) return null;
        const P = v.clBus.path, k = Math.min(v.clBus.stopI - 1, v.clBus.i + 5), q = P[k];
        N.player.teleport(q.x, q.y); window.__ob = { v, p0: { x: q.x, y: q.y }, minD: 1e9, maxMove: 0 };
        return { k, stopI: v.clBus.stopI };
      });
      if (!info) await page.evaluate((s) => N.debug.teleport(s.x + 30, s.y + 30), ob);
    }
    check(!!info, 'own bus: the stop sends its own bus when traffic.js has none', JSON.stringify(info));
    if (info) {
      const t0 = await page.evaluate(() => N.time.now), capB = Date.now() + 200000;
      let shotDone = false;
      while (Date.now() < capB && (await page.evaluate(() => N.time.now)) - t0 < 8) {
        await page.evaluate(() => { const o = window.__ob, v = o.v, pl = N.player; o.minD = Math.min(o.minD, Math.hypot(v.x - pl.x, v.y - pl.y)); o.maxMove = Math.max(o.maxMove, Math.hypot(pl.x - o.p0.x, pl.y - o.p0.y)); o.sp = v.speed; o.blocked = o.blocked || !!(v.clBus && v.clBus.blocked); o.sw = Math.max(o.sw || 0, (v.clBus && v.clBus.sw) || 0); o.bumps = (window.__clBumps || 0); });
        if (!shotDone && (await page.evaluate(() => N.time.now)) - t0 > 3) { shotDone = true; await page.evaluate(() => { const p = N.player; window.__focus = Object.assign({}, window.__focus, { x: p.x, y: p.y }); }); await shot2d(page, 'ownbus_brakes_top', 2.4); }
        await sleep(200);
      }
      const r = await page.evaluate(() => { const o = window.__ob; return { minD: Math.round(o.minD), moved: +o.maxMove.toFixed(1), sp: Math.round(o.sp || 0), braked: !!o.blocked, overtook: +(o.sw || 0).toFixed(1), alive: o.v.alive, ph: o.v.clBus && o.v.clBus.ph }; });
      report.push(['own bus vs Chinnu', JSON.stringify(r)]);
      check(r.moved < 4 && r.minD > 14, 'own bus: brakes for Chinnu in its lane, waits or goes round (he is never pushed)', JSON.stringify(r));
      // he steps away: the bus carries on (or, blocked long, gave up and left)
      await page.evaluate((s) => N.debug.teleport(s.x + 60, s.y + 60), ob);
      await simWait(page, 4);
      const r2 = await page.evaluate(() => { const o = window.__ob; return { alive: o.v.alive, ph: o.v.clBus && o.v.clBus.ph, sp: Math.round(o.v.speed || 0) }; });
      check(!r2.alive || r2.ph !== 'in' || r2.sp > 3, 'own bus: moves on once the lane is clear', JSON.stringify(r2));
    }
    await page.evaluate(() => { if (N.traffic) N.traffic.enabled = true; N.citylife.force(null); });
  }
  // pooling: walk away -> scenes release, people recycled
  await page.evaluate(() => N.debug.teleport(2000, 9500));
  await simWait(page, 4);
  const pool = await page.evaluate(() => N.citylife.stats());
  check(pool.active <= 2 && pool.pool > 5, 'far away: scenes released, people back in the pool', 'active ' + pool.active + ' pool ' + pool.pool + ' people ' + pool.people);
  await noErrors(page, errors, 'top-down');
  await context.close();
}

/* ======================================================================= 3D */
async function part3d(browser) {
  cur = '3d'; console.log('\n== third person 640x400');
  const { context, page, errors } = await open(browser, { viewport: { width: 640, height: 400 } });
  await page.evaluate(() => N.view.set('tps'));
  await page.waitForFunction(() => N.view3d && N.view3d.active, null, { timeout: 180000 });
  await simWait(page, 2);
  const L = await page.evaluate(() => ({ layer: N.citylife.stats().layer3d }));
  check(L.layer, 'the citylife 3D layer is registered and initialised');
  // count PNG encodes (a texture reaching view3d's JSON.stringify material key encodes its canvas) and track the
  // worst citylife 3D layer frame
  await page.evaluate(() => {
    const C = window.__c3 = { enc: 0, max: 0, maxId: null };
    const o = HTMLCanvasElement.prototype.toDataURL; HTMLCanvasElement.prototype.toDataURL = function () { C.enc++; return o.apply(this, arguments); };
    const loop = () => { const G = N.citylife._debug.G3; if (G && G.ms > C.max) { C.max = G.ms; C.maxId = (N.citylife.active()[0] || {}).id; } requestAnimationFrame(loop); }; loop();
  });
  for (const [name, kind, h, m] of SCENES) {
    console.log(' -- ' + name);
    const o = name === 'saloon' || name === 'cabin' ? { dow: 0 } : { dow: 3 };
    const st = await stage(page, kind, h, m, Object.assign(o, { pdist: 16 }));
    if (!st) { fail(name + ': no spot'); continue; }
    await page.evaluate(() => { if (N.view3d.settle) N.view3d.settle(2500); });
    await simWait(page, 4, 90000);
    const s3 = await page.evaluate((id) => { const sc = N.citylife.scene(id); const o = sc && N.citylife._debug.G3.scenes.get(sc.spot); return { built: !!o, kids: o ? o.grp.children.length : 0, people: sc ? sc.people.length : 0 }; }, st.id);
    check(s3.built && s3.kids > 0 && s3.people > 0, name + ': 3D props built, people present', JSON.stringify(s3));
    const cam = { roadwork: { dist: 60, h: 34 }, busstop: { dist: 56, h: 30 }, irani: { dist: 40, h: 22 }, saloon: { dist: 26, h: 15, lh: 7 }, cabin: { dist: 26, h: 15, lh: 7 }, chai: { dist: 34, h: 20 } }[name] || { dist: 26, h: 15, lh: 4 };
    await shot3d(page, name + '_tps', cam);
  }
  await page.evaluate(() => { if (N.view3dActors && N.view3dActors.debug) N.view3dActors.debug.camera(null); });
  const c3 = await page.evaluate(() => Object.assign({}, window.__c3, { built: N.citylife._debug.G3.built }));
  report.push(['3d build', JSON.stringify(c3)]);
  check(c3.enc === 0, '3D scene builds never PNG-encode a canvas (no texture through H.mat)', JSON.stringify(c3));
  // walk away and come back: the released scene's 3D group is reused, not rebuilt
  const back = SCENES.length ? await page.evaluate(() => { const id = window.__focus.id; const b0 = N.citylife._debug.G3.built; window.__back = { id, b0 }; N.citylife.force(null); N.debug.teleport(2000, 9500); return id; }) : null;
  if (back) {
    await simWait(page, 3, 90000);
    await page.evaluate(() => { const B = window.__back; N.citylife.force(B.id, { level: 1 }); const s = N.citylife.spot(B.id); N.debug.teleport(s.x + s.F.nx * 16, s.y + s.F.ny * 16); window.__c3.max = 0; });
    await simWait(page, 3, 90000);
    const rb = await page.evaluate(() => { const B = window.__back, sc = N.citylife.scene(B.id), G = N.citylife._debug.G3, o = sc && G.scenes.get(sc.spot); return { id: B.id, rebuilt: G.built - B.b0, shown: !!(o && o.grp.visible), maxMs: +window.__c3.max.toFixed(1) }; });
    report.push(['3d reuse', JSON.stringify(rb)]);
    check(rb.rebuilt === 0 && rb.shown, '3D: re-activating a scene re-shows its cached group (no rebuild)', JSON.stringify(rb));
  }
  await noErrors(page, errors, '3d');
  await context.close();
}

/* ======================================================================= phone: three busy scenes, perf */
async function partPhone(browser) {
  cur = 'phone'; console.log('\n== phone 390x844: three busy scenes');
  const { context, page, errors } = await open(browser, { viewport: { width: 390, height: 844 }, touch: true, dpr: 1 });
  // the densest cluster of spots: three busy scenes on screen at once
  const cl = await page.evaluate(() => {
    const S = N.citylife.spots;
    let best = null, bn = 0;
    for (const s of S) { const near = S.filter((q) => q !== s && Math.hypot(q.x - s.x, q.y - s.y) < 190).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y)); const pick = [s]; for (const q of near) if (pick.length < 3 && pick.every((r) => r.kind !== q.kind)) pick.push(q); for (const q of near) if (pick.length < 3 && pick.indexOf(q) < 0) pick.push(q); const sc = new Set(pick.map((q) => q.kind)).size * 10 + pick.length; if (pick.length >= 3 && sc > bn) { bn = sc; best = pick; } }
    const three = best.slice(0, 3);
    N.debug.setTime(8, 30);
    N.citylife.force(null);
    for (const s of three) N.citylife.force(s.id, { level: 1 });
    const cx = three.reduce((a, s) => a + s.x, 0) / three.length, cy = three.reduce((a, s) => a + s.y, 0) / three.length;
    N.debug.teleport(cx, cy);
    window.__focus = { x: cx, y: cy, nx: 0, ny: 1, ax: 1, ay: 0 };
    return { ids: three.map((s) => s.id), x: Math.round(cx), y: Math.round(cy) };
  });
  report.push(['phone cluster', JSON.stringify(cl)]);
  await simWait(page, 6);
  const measure = async (label) => {
    const smp = [];
    const cap = Date.now() + 60000;
    const t0 = await page.evaluate(() => N.time.now);
    while (Date.now() < cap && (await page.evaluate(() => N.time.now)) - t0 < 6) {
      smp.push(await page.evaluate(() => { const s = N.citylife.stats(); return { ms: s.ms, ms2d: s.ms2d, ms3d: s.ms3d, people: s.people, active: s.active, parts: s.particles, fms: N.render && N.render.stats ? N.render.stats.frameMs || 0 : 0 }; }));
      await sleep(150);
    }
    const avg = (k) => smp.reduce((a, s) => a + s[k], 0) / Math.max(1, smp.length);
    const p90 = (k) => { const a = smp.map((s) => s[k]).sort((x, y) => x - y); return a[Math.floor(a.length * 0.9)] || 0; };
    const r = { n: smp.length, upd: +avg('ms').toFixed(3), d2: +avg('ms2d').toFixed(3), d3: +avg('ms3d').toFixed(3), p90: +(p90('ms') + p90(label === '3d' ? 'ms3d' : 'ms2d')).toFixed(3), people: Math.max(...smp.map((s) => s.people)), active: Math.max(...smp.map((s) => s.active)), parts: Math.max(...smp.map((s) => s.parts)) };
    report.push(['perf ' + label, JSON.stringify(r)]);
    return r;
  };
  const p2 = await measure('2d');
  const busy = await page.evaluate((ids) => ids.map((id) => { const a = N.citylife.active().find((q) => q.id === id); return a ? a.people : 0; }), cl.ids);
  check(busy.filter((n) => n >= 2).length >= 3, 'three busy scenes at once', JSON.stringify(busy));
  check(p2.upd + p2.d2 < 1.5, 'phone 2D: city-life update + draw < 1.5 ms / frame (avg, three busy scenes)', JSON.stringify(p2));
  await shot2d(page, 'phone_three_top', 1.6);
  await page.evaluate(() => N.view.set('tps'));
  await page.waitForFunction(() => N.view3d && N.view3d.active, null, { timeout: 180000 });
  await page.evaluate(() => { if (N.view3d.settle) N.view3d.settle(2500); });
  await simWait(page, 3, 90000);
  const p3 = await measure('3d');
  check(p3.upd + p3.d3 < 1.5, 'phone 3D: city-life update + layer < 1.5 ms / frame (avg)', JSON.stringify(p3));
  if (SHOTS) {
    await page.evaluate((ids) => { const s = N.citylife.spot(ids[0]); const F = s.F; window.__focus = { x: s.x, y: s.y, nx: F.nx, ny: F.ny, ax: F.ax, ay: F.ay }; }, cl.ids);
    await shot3d(page, 'phone_three_tps', { dist: 70, h: 40 });
    await page.evaluate(() => { if (N.view3dActors && N.view3dActors.debug) N.view3dActors.debug.camera(null); });
  }
  await noErrors(page, errors, 'phone');
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const t0 = Date.now();
  try {
    if (!ONLY || ONLY === 'top') await partTop(browser);
    if (!ONLY || ONLY === '3d') await part3d(browser);
    if (!ONLY || ONLY === 'phone') await partPhone(browser);
  } catch (e) {
    failures.push('[' + cur + '] exception: ' + (e.stack || e.message));
    console.log('EXCEPTION', e.stack || e.message);
  } finally { await browser.close(); }
  console.log('\n== report');
  for (const [k, v] of report) console.log('  ' + k + ': ' + v);
  console.log('  screenshots: ' + shots.length + ' in tests/out/citylife_*.png');
  console.log('\n' + (failures.length ? 'FAILED ' + failures.length + ':\n  ' + failures.join('\n  ') : 'ALL PASSED') + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  process.exit(failures.length ? 1 : 0);
})();
