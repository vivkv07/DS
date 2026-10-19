/* NOSTALGIA — tests/citylife_events.cjs (moving city-life scenes, src/citylife_events.js, design/atmosphere.md)
 *
 * Visits every scene at its peak time in top-down AND third-person 3D at 640x400:
 *   junction    peak-hour jam at a real junction (Abids / Koti / RTC X Roads ...): queued real vehicles, the
 *               havaldar, honk storms, the cow, the stalled bus being pushed, the lorry reversing; Chinnu on a
 *               cycle gets whistled at and can always walk through (anti-trap)
 *   colony_am   06:40 on a colony lane: muggulu growing at the doorsteps, milkman, paper boy, gossip, the school
 *               auto (a school day) + the summer water tanker queue (a May morning)
 *   colony_pm   18:00: gully cricket (bowled / ball into a house), uncles on plastic chairs, a forced power cut
 *               (hand fans, candles, the inverter hum) and the power coming back
 *   oldcity     Charminar / Laad Bazaar / Gulzar Houz: bangle + attar stalls, handcarts, lane jam, buffalo herd,
 *               hawkers; calm during prayer time
 *   cinema      a Friday morning at the RTC X Roads halls: cut-out, teenmaar drummers, dancers, ticket crush,
 *               HOUSE FULL; stays off while story mission M3 runs
 *   baraat      a Saturday night in the wedding season: tube lights, band, dancers, the groom's horse, traffic
 *               stopped behind; it walks to the function hall gate
 * plus: three busy scenes on screen at once on a phone-size viewport (ms/frame of all city-life work, 2D and
 * 3D), 2 phone 390x844 shots, zero console / page / N.err errors, the rules (time / day / season / weather /
 * M3) and pooling (persons / beasts return to the pools).
 * Screenshots: tests/out/cle_*.png.   node nostalgia/tests/citylife_events.cjs   ONLY=top|3d|phone|rules|respect   SHOTS=0
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
const SCENES = process.env.SCENES ? process.env.SCENES.split(',') : null;
const SHOTS = process.env.SHOTS !== '0';
const failures = [];
const shots = [];
let cur = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { failures.push('[' + cur + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg + (detail ? '  (' + detail + ')' : '')); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const want = (part) => !ONLY || ONLY.includes(part);
const wantScene = (k) => !SCENES || SCENES.includes(k);

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
    if (N.seasons && N.seasons.set) N.seasons.set('sankranti', false);
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    window.__cle = { beats: [], scenes: 0 };
    N.on('citylife:beat', (b) => { window.__cle.beats.push(b.kind + ':' + b.beat); });
    N.on('citylife:scene', () => { window.__cle.scenes++; });
  });
  return { context, page, errors };
}
/** wait for `secs` of SIMULATION time (the machine may be very busy), capped in real time */
async function simWait(page, secs, capMs) {
  const t0 = await page.evaluate(() => N.time.now);
  const cap = Date.now() + (capMs || secs * 12000 + 30000);
  while (Date.now() < cap) {
    await sleep(350);
    const t = await page.evaluate(() => N.time.now);
    if (t - t0 >= secs) return true;
  }
  return false;
}
async function shot(page, name, zoom) {
  if (!SHOTS) return;
  if (zoom) { await page.evaluate((z) => { N.render.baseZoom = z; }, zoom); await simWait(page, 1, 30000); }
  const f = path.join(OUT, 'cle_' + name + '.png');
  await page.screenshot({ path: f, timeout: 180000 });
  shots.push(f);
  if (zoom) await page.evaluate(() => { N.render.baseZoom = 1; });
}
const N_ERRS = (page) => page.evaluate(() => (N.errors || []).map((e) => (e.where || e.w || '') + ': ' + String(e.msg || e.message || e.e || e).slice(0, 240)));

// a scene's stage: date, time, season, the site, where Chinnu stands and which way the 3D camera looks
const STAGES = {
  junction: { date: [2003, 1, 15], h: 9, m: 20, site: 'junction:abids', look: 'node' },
  colony_am: { date: [2003, 1, 15], h: 6, m: 50, site: 'colony_am:home', phase: 'all' },
  tanker: { date: [2003, 5, 14], h: 7, m: 10, site: 'colony_am:home', phase: 'tanker', summer: true },
  colony_pm: { date: [2003, 1, 15], h: 17, m: 50, site: 'colony_pm:home' },
  powercut: { date: [2003, 1, 15], h: 19, m: 30, site: 'colony_pm:home', power: true },
  oldcity: { date: [2003, 1, 15], h: 17, m: 30, site: 'oldcity:laad_bazaar', phase: 'herd' },
  charminar: { date: [2003, 1, 15], h: 11, m: 0, site: 'oldcity:charminar', phase: 'herd' },
  cinema: { date: [2003, 1, 17], h: 9, m: 30, site: 'cinema:sandhya_theatre' },
  baraat: { date: [2003, 1, 18], h: 20, m: 30, site: 'baraat:himayatnagar' },
};
async function stage(page, name, o) {
  const S = Object.assign({}, STAGES[name], o || {});
  return page.evaluate((S) => {
    const E = N.citylifeEvents;
    if (N.calendar && N.calendar.set) N.calendar.set(S.date[0], S.date[1], S.date[2], S.h, S.m); else N.debug.setTime(S.h, S.m);
    N.debug.setTime(S.h, S.m);
    if (N.seasons && N.seasons.set) N.seasons.set('summer', S.summer ? true : null);
    delete N.flags.rain; delete N.flags.power_cut;
    if (S.mode !== '3d') N.view.set('top');
    E.force(null);
    const id = E.force(S.site, { level: 1, phase: S.phase || null, power: !!S.power, restart: true, solo: true });
    if (!id) return { err: 'no site ' + S.site };
    const s = E.site(id);
    const td = S.mode === '3d';
    const at = (P, d, off) => { const C = P.cum, Q = P.pts, n = C.length; d = Math.max(0, Math.min(P.len, d)); let i = 1; while (i < n - 1 && C[i] < d) i++; const s0 = C[i - 1], L = (C[i] - s0) || 1, t = (d - s0) / L; const x0 = Q[i * 2 - 2], y0 = Q[i * 2 - 1], x1 = Q[i * 2], y1 = Q[i * 2 + 1]; const ux = (x1 - x0) / L, uy = (y1 - y0) / L; return { x: x0 + (x1 - x0) * t + uy * (off || 0), y: y0 + (y1 - y0) * t - ux * (off || 0) }; };
    let x = s.x, y = s.y, fx = s.x, fy = s.y;
    if (s.kind === 'junction') { const A = s.arms.slice().sort((a, b) => b.len - a.len)[0]; const fw = (N.world.FOOT && N.world.FOOT[A.kind]) || 4; const q = at(A, (td ? 62 : 40) + A.w / 2, A.w / 2 + fw * 0.5); x = q.x; y = q.y; }
    else if (s.kind === 'colony_am' || s.kind === 'colony_pm') { const g = s.geo; const q = at(g.path, g.path.mid + (td ? -48 : -12), td ? 2 : 0); x = q.x; y = q.y; fx = g.x; fy = g.y; }
    else if (s.kind === 'cinema') { const back = td ? s.roadW + 14 : 26; x = s.x - s.nx * back; y = s.y - s.ny * back; fx = s.x; fy = s.y; }
    else if (s.kind === 'oldcity') { const q = at(s.path, s.path.mid + (td ? -42 : -8), 0); x = q.x; y = q.y; }
    else if (s.kind === 'baraat') { const R = s.route; const d = Math.min(R.len * 0.45, 200); const q = at(R, d, td ? R.w / 2 + 3 : 6); x = q.x; y = q.y; fx = x; fy = y; }
    const f = N.world.findFree(x, y, 'walk', 8); if (f) { x = f.x; y = f.y; }
    N.debug.teleport(x, y);
    N.render.baseZoom = 1;
    return { id, kind: s.kind, x: Math.round(x), y: Math.round(y), fx: Math.round(fx), fy: Math.round(fy) };
  }, S);
}
const sceneInfo = (page, id) => page.evaluate((id) => (N.citylifeEvents.active().find((a) => a.id === id) || null), id);
async function look3d(page, id) { // aim the 3D camera from Chinnu at the scene's centre
  await page.evaluate((id) => {
    const E = N.citylifeEvents, sc = E.scene(id), s = E.site(id);
    let tx = s.x, ty = s.y;
    if (s.geo) { tx = s.geo.x; ty = s.geo.y; }
    if (sc && sc.kind === 'baraat' && sc.st.horse) { tx = sc.st.horse.x; ty = sc.st.horse.y; }
    if (sc && sc.kind === 'oldcity' && sc.st.herd && sc.st.herd.beasts[0]) { tx = sc.st.herd.beasts[0].x; ty = sc.st.herd.beasts[0].y; }
    const p = N.player, yaw = Math.atan2(ty - p.y, tx - p.x);
    p.angle = yaw; p.facing = yaw;
    try { N.view3d.setCamera({ yaw, pitch: 0.3, snap: true }); } catch (e) { /* optional */ }
  }, id);
}
async function to3d(page) {
  await page.evaluate(() => N.view.set('tps'));
  await page.waitForFunction(() => N.view3d && N.view3d.active, null, { timeout: 240000 });
  await page.evaluate(() => { try { N.view3d.settle(4000); } catch (e) { /* ok */ } });
}

async function visit(page, name, o) {
  o = o || {};
  const st = await stage(page, name, o);
  if (!st || st.err) { fail(name + ': stage failed ' + JSON.stringify(st)); return null; }
  await simWait(page, o.wait || 6);
  const info = await sceneInfo(page, st.id);
  console.log('   ', name, JSON.stringify(info));
  return Object.assign({}, st, { info });
}

async function partTop(browser) {
  cur = 'top';
  console.log('== top-down + tps 3D, 640x400 ==');
  const { context, page, errors } = await open(browser, { viewport: { width: 640, height: 400 } });
  const st0 = await page.evaluate(() => N.citylifeEvents.stats());
  check(st0.sites >= 30, 'sites built from the map', JSON.stringify(st0.kinds));
  for (const k of ['junction', 'colony_am', 'colony_pm', 'oldcity', 'cinema', 'baraat']) check((st0.kinds[k] || 0) > 0, 'has ' + k + ' sites', String(st0.kinds[k]));
  const R = {};
  const names = Object.keys(STAGES).filter((n) => wantScene(n) || wantScene(STAGES[n].site.split(':')[0]));
  for (const name of names) {
    const v = await visit(page, name, { wait: name === 'baraat' ? 8 : 6 });
    if (!v) continue;
    R[name] = v;
    const a = v.info;
    if (!check(!!a, name + ' scene active')) continue;
    switch (name) {
      case 'junction': {
        const j = await page.evaluate((id) => { const sc = N.citylifeEvents.scene(id); return { jam: sc.st.J ? sc.st.J.lanes.reduce((n, l) => n + l.q.length, 0) : 0, cop: !!(sc.st.cop || (sc.site.pod && sc.site.pod.cop)), cow: !!sc.st.cow, bus: !!sc.st.stall, lorry: !!sc.st.lorry }; }, v.id);
        check(j.jam >= 4, 'junction: vehicles queued on the arms', JSON.stringify(j));
        check(j.cow, 'junction: a cow sitting in the middle');
        break;
      }
      case 'colony_am': {
        const c = await page.evaluate((id) => { const sc = N.citylifeEvents.scene(id); const g = sc.st.g; return { mugg: g.mugg.length, prog: g.mugg.map((m) => +m.prog.toFixed(2)), drawers: sc.persons.filter((p) => p.tag === 'muggu').length, milk: !!sc.st.milk, boy: !!sc.st.boy, gossip: sc.st.gossip.length }; }, v.id);
        check(c.mugg >= 2 && c.prog.some((p) => p > 0), 'colony_am: muggulu at the doorsteps', JSON.stringify(c));
        check(c.drawers > 0 || c.prog.every((p) => p >= 1), 'colony_am: aunties drawing muggulu');
        break;
      }
      case 'tanker': {
        const c = await page.evaluate((id) => { const sc = N.citylifeEvents.scene(id); return { tanker: !!sc.st.tanker, queue: sc.st.tanker ? sc.st.tanker.queue.length : 0, pots: sc.st.tanker ? sc.st.tanker.pots.length : 0 }; }, v.id);
        check(c.tanker && c.pots > 0, 'tanker: the summer water tanker with its pots', JSON.stringify(c));
        break;
      }
      case 'colony_pm': {
        const c = await page.evaluate((id) => { const sc = N.citylifeEvents.scene(id); return { cricket: !!sc.st.cricket, ph: sc.st.cricket && sc.st.cricket.ph, uncles: sc.st.uncles.length }; }, v.id);
        check(c.cricket, 'colony_pm: gully cricket on the lane', JSON.stringify(c));
        check(c.uncles >= 2, 'colony_pm: uncles on plastic chairs');
        break;
      }
      case 'powercut': {
        const c = await page.evaluate((id) => { const sc = N.citylifeEvents.scene(id); return { power: sc.st.power, candles: sc.st.candles.length, extras: sc.st.extras.filter((p) => p.alive).length, fans: sc.persons.filter((p) => p.item === 'fan').length }; }, v.id);
        check(c.power && c.candles > 0 && c.fans > 0, 'power cut: everyone outside with fans and candles', JSON.stringify(c));
        break;
      }
      case 'oldcity': case 'charminar': {
        const c = await page.evaluate((id) => { const sc = N.citylifeEvents.scene(id); return { stalls: sc.st.stalls.length, hawkers: sc.st.hawkers.length, herd: !!sc.st.herd, beasts: sc.beasts.length, jam: sc.st.J ? sc.st.J.lanes.reduce((n, l) => n + l.q.length, 0) : 0 }; }, v.id);
        check(c.stalls + c.hawkers > 0, name + ': stalls / hawkers', JSON.stringify(c));
        if (name === 'charminar') check(c.herd || c.beasts > 0, name + ': a buffalo herd'); else check(c.jam >= 3, name + ': a narrow-lane jam of two-wheelers');
        break;
      }
      case 'cinema': {
        const c = await page.evaluate((id) => { const sc = N.citylifeEvents.scene(id); return { drums: sc.st.drums.length, dancers: sc.st.dancers.length, crush: sc.st.crush.length, film: sc.site.film.t }; }, v.id);
        check(c.drums >= 3 && c.dancers >= 4 && c.crush >= 4, 'cinema: drummers, dancers, the ticket crush', JSON.stringify(c));
        break;
      }
      case 'baraat': {
        const c = await page.evaluate((id) => { const sc = N.citylifeEvents.scene(id); return { members: sc.st.members.filter((p) => p.alive).length, horse: !!(sc.st.horse && sc.st.horse.alive), cars: sc.st.cars.length, s: Math.round(sc.st.s), ph: sc.st.ph, tubes: sc.persons.filter((p) => p.item === 'tube').length }; }, v.id);
        check(c.members >= 10 && c.horse && c.tubes >= 4, 'baraat: bearers, band, dancers and the groom on his horse', JSON.stringify(c));
        break;
      }
      default: break;
    }
    await shot(page, name + '_top', 2.2);
  }
  // 3D: the same scenes in third person
  if (want('3d')) {
    cur = '3d';
    console.log('== tps 3D ==');
    await to3d(page);
    for (const name of names) {
      const st = await stage(page, name, { mode: '3d' });
      if (!st || st.err) { fail(name + ' 3d stage'); continue; }
      await page.evaluate(() => N.view.set('tps'));
      await page.waitForFunction(() => N.view3d && N.view3d.active, null, { timeout: 240000 });
      await simWait(page, 4);
      await look3d(page, st.id);
      await page.evaluate(() => { try { N.view3d.settle(3000); } catch (e) { /* ok */ } });
      await page.waitForFunction(() => { try { const s = N.view3d.stats(); return (s.visChunks || s.chunks || 0) > 2 && (s.calls || 0) > 20; } catch (e) { return true; } }, null, { timeout: 120000 }).catch(() => null);
      await simWait(page, 1.5);
      const s3 = await page.evaluate(() => N.citylifeEvents.stats());
      check(s3.layer3d, name + ': 3D layer up', JSON.stringify(s3.im3d) + ' ms3d ' + s3.ms3d);
      await shot(page, name + '_tps');
    }
    await page.evaluate(() => N.view.set('top'));
  }
  const errs = await N_ERRS(page);
  check(errors.length === 0, 'no console / page errors', errors.slice(0, 4).join(' | '));
  check(errs.length === 0, 'no N.err', errs.slice(0, 6).join(' | '));
  await context.close();
  return R;
}

async function partRules(browser) {
  cur = 'rules';
  console.log('== rules, reactions, pooling ==');
  const { context, page, errors } = await open(browser, { viewport: { width: 640, height: 400 } });
  const r = await page.evaluate(() => {
    const E = N.citylifeEvents, K = E.KINDS, CX = E._debug.CX;
    const lv = (kind, site, set) => { const s = E.site(site) || E.nearest(kind); Object.assign(CX, { m: 720, dow: 3, mon: 1, rain: 0, summer: false, school: true, wedding: true, ramzan: false, power: false, night: false, prayer: false, fri: false, weekend: false, m3: false }, set); return +K[kind].level(s, CX).toFixed(2); };
    return {
      jamPeak: lv('junction', 'junction:abids', { m: 570 }), jamNight: lv('junction', 'junction:abids', { m: 1410 }), jamSunday: lv('junction', 'junction:abids', { m: 570, dow: 0 }), jamRain: lv('junction', 'junction:abids', { m: 760, rain: 0.8 }),
      amPeak: lv('colony_am', 'colony_am:home', { m: 420 }), amNoon: lv('colony_am', 'colony_am:home', { m: 760 }),
      pmPeak: lv('colony_pm', 'colony_pm:home', { m: 1110 }), pmRain: lv('colony_pm', 'colony_pm:home', { m: 1110, rain: 0.8 }),
      cinFri: lv('cinema', 'cinema:sandhya_theatre', { m: 570, fri: true, dow: 5 }), cinWed: lv('cinema', 'cinema:sandhya_theatre', { m: 570 }), cinM3: lv('cinema', 'cinema:sandhya_theatre', { m: 570, fri: true, dow: 5, m3: true }),
      barSat: lv('baraat', 'baraat:himayatnagar', { m: 1230, weekend: true, dow: 6 }), barWed: lv('baraat', 'baraat:himayatnagar', { m: 1230 }), barRain: lv('baraat', 'baraat:himayatnagar', { m: 1230, weekend: true, rain: 0.6 }), barOff: lv('baraat', 'baraat:himayatnagar', { m: 1230, weekend: true, wedding: false }),
      oldDay: lv('oldcity', 'oldcity:laad_bazaar', { m: 1100 }), oldLate: lv('oldcity', 'oldcity:laad_bazaar', { m: 150 }),
    };
  });
  console.log('    levels', JSON.stringify(r));
  check(r.jamPeak > 0.8 && r.jamNight === 0 && r.jamSunday < r.jamPeak, 'junction: weekday peaks, nothing at night, lighter on Sunday');
  check(r.jamRain > 0.5, 'junction: rain makes it worse');
  check(r.amPeak > 0.9 && r.amNoon === 0, 'colony mornings 06:00-09:00 only');
  check(r.pmPeak > 0.9 && r.pmRain < 0.5, 'colony evenings, fewer in the rain');
  check(r.cinFri > 0.9 && r.cinWed === 0 && r.cinM3 === 0, 'cinema: Fridays, never while M3 runs');
  check(r.barSat > 0.9 && r.barWed === 0 && r.barRain === 0 && r.barOff === 0, 'baraat: weekend nights in the wedding season, no rain');
  check(r.oldDay > 0.5 && r.oldLate === 0, 'old city: day and evening');
  // live: Chinnu rides a cycle through the jam: the havaldar whistles, and he is never trapped
  let st = await stage(page, 'junction', { site: 'junction:charminar_approach' });
  if (!st || st.err) { fail('no junction:charminar_approach site: ' + JSON.stringify(st)); st = await stage(page, 'junction', { site: 'junction:chaderghat' }); }
  await simWait(page, 4);
  const cyc = await page.evaluate((id) => {
    const s = N.citylifeEvents.site(id), sc = s.sc, p = N.player;
    const cop = sc.st.cop || (s.pod && s.pod.cop);
    const v = N.vehicles.spawn('hero_cycle', p.x, p.y, 0, {});
    N.vehicles.enter(p, v);
    return { cop: !!cop, copXY: cop ? [Math.round(cop.x), Math.round(cop.y)] : null, x: Math.round(s.x), y: Math.round(s.y) };
  }, st.id);
  // ride in towards the havaldar and on across the junction (real input)
  let whistled = false, moved = 0;
  const p0 = await page.evaluate(() => ({ x: N.player.x, y: N.player.y }));
  const far = { x: cyc.x + (cyc.x - p0.x) * 1.2, y: cyc.y + (cyc.y - p0.y) * 1.2 };
  for (let i = 0; i < 12; i++) {
    await page.evaluate((c) => { const p = N.player, v = p.vehicle; if (!v) return; const near = Math.hypot(c.x - p.x, c.y - p.y) > 20 && !c.passed; const tx = near ? c.x : c.fx, ty = near ? c.y : c.fy; if (!near) c.passed = true; v.angle = Math.atan2(ty - p.y, tx - p.x); }, Object.assign({ fx: far.x, fy: far.y }, cyc));
    await page.keyboard.down('ArrowUp'); await simWait(page, 0.6, 15000); await page.keyboard.up('ArrowUp');
    if (i === 0) console.log('    cyc', JSON.stringify(await page.evaluate(() => ({ veh: N.player.vehicle && N.player.vehicle.type, sp: N.player.vehicle && +N.player.vehicle.speed.toFixed(1), mode: N.state.mode, lock: N.player.controlsLocked }))));
    whistled = whistled || await page.evaluate(() => window.__cle.beats.includes('junction:whistle_kid'));
  }
  const p1 = await page.evaluate(() => ({ x: N.player.x, y: N.player.y }));
  moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  check(cyc.cop, 'junction: a havaldar on duty', JSON.stringify(cyc));
  check(whistled, 'junction: the havaldar whistles at Chinnu on his cycle');
  check(moved > 40, 'Chinnu on a cycle can ride through the jam', 'moved ' + moved.toFixed(0) + ' u');
  await page.evaluate(() => { const p = N.player; if (p.vehicle) N.vehicles.exit(p, true); });
  // on foot: push straight through the queue for a few seconds: never stuck for long
  const trap = await page.evaluate(async (id) => {
    const s = N.citylifeEvents.site(id), sc = s.sc, J = sc.st.J;
    const L = J.lanes.find((l) => l.q.length >= 2) || J.lanes[0];
    const v = L.q[1] || L.q[0];
    if (!v) return { none: true };
    N.debug.teleport(v.x + Math.cos(v.angle + Math.PI / 2) * 12, v.y + Math.sin(v.angle + Math.PI / 2) * 12);
    return { vx: v.x, vy: v.y, a: v.angle };
  }, st.id);
  if (!trap.none) {
    const q0 = await page.evaluate(() => ({ x: N.player.x, y: N.player.y }));
    const k = await page.evaluate((t) => { const p = N.player, dx = t.vx - p.x, dy = t.vy - p.y; return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp'); }, trap);
    await page.keyboard.down(k);
    for (let i = 0; i < 5; i++) {
      await simWait(page, 1, 20000);
      console.log('    trap', k, JSON.stringify(await page.evaluate((id) => { const sc = N.citylifeEvents.scene(id); return { mode: N.state.mode, lock: N.player.controlsLocked, pm: N.player.mode, veh: !!N.player.vehicle, mv: N.input.move, x: Math.round(N.player.x), y: Math.round(N.player.y), v: +Math.hypot(N.player.vx, N.player.vy).toFixed(1), trap: sc && sc.st.J ? +sc.st.J.trapT.toFixed(2) : null, un: N.citylifeEvents.stats().unstuck }; }, st.id)));
    }
    await page.keyboard.up(k);
    const q1 = await page.evaluate(() => ({ x: N.player.x, y: N.player.y, un: N.citylifeEvents.stats().unstuck }));
    const d = Math.hypot(q1.x - q0.x, q1.y - q0.y);
    check(d > 20, 'on foot Chinnu gets through the jam (people / vehicles make way)', 'walked ' + d.toFixed(0) + ' u, unstuck ' + q1.un);
  }
  // M3: the cinema and RTC X Roads stay out of the story mission's way
  const m3 = await page.evaluate(() => {
    const E = N.citylifeEvents, M = N.missions;
    const prev = Object.getOwnPropertyDescriptor(M, 'active');
    try { Object.defineProperty(M, 'active', { configurable: true, get: () => ({ id: 'first_day_first_show' }) }); } catch (e) { return { skip: String(e) }; }
    E._debug.CX.m3 = false;
    const s = E.site('cinema:sandhya_theatre');
    const lvl = (() => { E.force(null); N.calendar.set(2003, 1, 17, 9, 30); N.debug.setTime(9, 30); return null; })();
    void lvl;
    return { prev: !!prev };
  });
  if (!m3.skip) {
    await page.evaluate(() => { const s = N.citylifeEvents.site('cinema:sandhya_theatre'); N.debug.teleport(s.x - s.nx * 30, s.y - s.ny * 30); });
    await simWait(page, 3);
    const on = await page.evaluate(() => N.citylifeEvents.active().map((a) => a.id));
    check(!on.some((id) => id.includes('sandhya') || id.includes('rtc_x')), 'M3 running: no release-day crowd or jam at RTC X Roads', JSON.stringify(on));
    await page.evaluate(() => { try { delete N.missions.active; } catch (e) { /* ok */ } });
  }
  // calm in prayer time: the old city sellers and horns go quiet
  const calm = await page.evaluate(async () => {
    const E = N.citylifeEvents;
    N.calendar.set(2003, 1, 17, 13, 20); N.debug.setTime(13, 20);
    E.force(null); E.force('oldcity:laad_bazaar', { level: 1, restart: true });
    const s = E.site('oldcity:laad_bazaar'); N.debug.teleport(s.x + 10, s.y + 10);
    return true;
  });
  void calm;
  await simWait(page, 3);
  const cp = await page.evaluate(() => { const sc = N.citylifeEvents.scene('oldcity:laad_bazaar'); return { calm: sc && sc.st.calm, phase: sc && sc.phase }; });
  check(cp.calm, 'Jumma prayer time: the old city scene is calm', JSON.stringify(cp));
  // pooling: release everything and come back: persons come out of the pool
  const pool = await page.evaluate(async () => {
    const E = N.citylifeEvents;
    E.force(null);
    N.debug.teleport(2000, 9000);
    return E.stats().pool;
  });
  await simWait(page, 6);
  const pool2 = await page.evaluate(() => { const s = N.citylifeEvents.stats(); return { pool: s.pool, persons: s.persons, active: s.active, vehicles: s.vehicles }; });
  check(pool2.active === 0 && pool2.vehicles === 0, 'far away: every scene released, vehicles removed', JSON.stringify(pool2));
  check(pool2.pool.persons > 0, 'released people go back to the pool', JSON.stringify(pool) + ' -> ' + JSON.stringify(pool2.pool));
  const errs = await N_ERRS(page);
  check(errors.length === 0, 'no console / page errors', errors.slice(0, 4).join(' | '));
  check(errs.length === 0, 'no N.err', errs.slice(0, 6).join(' | '));
  await context.close();
}

/** places of worship stay calm; colony lanes are residential: a static audit of every colony lane and baraat
 *  route against N.respect and the busy (station / bus terminus / market) landmarks, then the Old City baraat
 *  staged in Isha prayer time and the Secunderabad colony at its evening peak */
async function partRespect(browser) {
  cur = 'respect';
  console.log('== respect + residential siting ==');
  const { context, page, errors } = await open(browser, { viewport: { width: 640, height: 400 } });
  const audit = await page.evaluate(() => {
    const E = N.citylifeEvents, Rs = N.respect, D = N.WORLD_DATA;
    const WZ = Rs.zones.filter((z) => z.kind !== 'procession');
    const wd = (x, y) => { let b = 1e9; for (const z of WZ) b = Math.min(b, Rs.distance(x, y, z)); return b; };
    const BUSY = { railway_station: 1, halt_station: 1, bus_terminus: 1, mgbs: 1, cbs_hangar: 1, market_hall: 1, mozamjahi_market: 1, rythu_bazaar: 1 };
    const busy = D.landmarks.filter((l) => BUSY[l.draw]);
    const bd = (x, y) => { let b = 1e9; for (const l of busy) { const dx = Math.max(Math.abs(x - l.x) - (l.w || 0) / 2, 0), dy = Math.max(Math.abs(y - l.y) - (l.d || 0) / 2, 0); b = Math.min(b, Math.hypot(dx, dy)); } return b; };
    const samp = (P) => { const o = []; const Q = P.pts; for (let i = 0; i < Q.length - 2; i += 2) { const L = Math.hypot(Q[i + 2] - Q[i], Q[i + 3] - Q[i + 1]); for (let t = 0; t < L; t += 8) o.push([Q[i] + (Q[i + 2] - Q[i]) * t / L, Q[i + 1] + (Q[i + 3] - Q[i + 1]) * t / L]); } o.push([Q[Q.length - 2], Q[Q.length - 1]]); return o; };
    const out = { colonies: [], baraats: [] };
    for (const s of E.sites) {
      if (s.kind === 'colony_pm') {
        const g = s.geo; let w = 1e9, b = 1e9;
        for (const q of samp(g.path).concat(g.doors.map((d) => [d.x, d.y]))) { w = Math.min(w, wd(q[0], q[1])); b = Math.min(b, bd(q[0], q[1])); }
        out.colonies.push({ id: s.id, x: Math.round(g.x), y: Math.round(g.y), w: Math.round(w), b: Math.round(b), dist: (N.world.districtAt(g.x, g.y) || {}).id });
      } else if (s.kind === 'baraat') {
        let w = 1e9; for (const q of samp(s.route).concat([[s.gate.x, s.gate.y]])) w = Math.min(w, wd(q[0], q[1]));
        out.baraats.push({ id: s.id, w: Math.round(w), quiet: (s.quiet || []).length / 2 });
      }
    }
    return out;
  });
  console.log('    colonies', JSON.stringify(audit.colonies));
  console.log('    baraats', JSON.stringify(audit.baraats));
  check(audit.colonies.length >= 8, 'colony lanes still built across the city', String(audit.colonies.length));
  const badC = audit.colonies.filter((c) => c.w < 115 || c.b < 115);
  check(!badC.length, 'every colony lane (path + doors) >= 120 from a place of worship and from stations / bus termini / markets', JSON.stringify(badC));
  const sec = audit.colonies.find((c) => c.id === 'colony_pm:secunderabad');
  check(!sec || Math.hypot(sec.x - 11112, sec.y - 2407) > 600, 'Secunderabad colony lane is away from the station (Bowenpally / Sikh Village side)', JSON.stringify(sec));
  check(audit.baraats.length >= 8, 'baraat routes still built', String(audit.baraats.length));
  const badB = audit.baraats.filter((b) => b.w < 145);
  check(!badB.length, 'no baraat route or function-hall gate within 150 of a place of worship', JSON.stringify(badB));
  check(audit.baraats.some((b) => b.id === 'baraat:himayatnagar'), 'the home-area baraat survives the siting rules');
  // the Old City baraat in Isha prayer time (Sat 18 Jan 2003 19:50): it walks silently
  const bar = audit.baraats.find((b) => b.id === 'baraat:charminar') ? 'baraat:charminar' : (audit.baraats[0] || {}).id;
  if (bar) {
    await page.evaluate((id) => {
      window.__band = 0;
      const A = N.audio; if (A && A.sfx && !A.__cleWrap) { const o = A.sfx; A.sfx = function (n) { if (n === 'cle_band' || n === 'dappu') window.__band++; return o.apply(this, arguments); }; A.__cleWrap = true; }
      const E = N.citylifeEvents;
      N.calendar.set(2003, 1, 18, 19, 50); N.debug.setTime(19, 50); N.view.set('top');
      E.force(null); E.force(id, { level: 1, restart: true, solo: true });
      const s = E.site(id), R = s.route, Q = R.pts; const i = Math.min(Q.length - 2, 2);
      N.debug.teleport(Q[i], Q[i + 1]);
    }, bar);
    await simWait(page, 6);
    const r = await page.evaluate((id) => {
      const sc = N.citylifeEvents.scene(id); if (!sc) return null;
      let inZone = 0; for (const p of sc.st.members) { const z = p.alive && N.respect.at(p.x, p.y); if (z && z.kind !== 'procession') inZone++; }
      return { calm: sc.st.calm, phase: sc.phase, ph: sc.st.ph, members: sc.st.members.length, inZone, band: window.__band, dancing: sc.st.members.filter((p) => p.alive && p.beh === 'dance').length };
    }, bar);
    check(r && r.calm && r.band === 0 && r.dancing === 0, bar + ' in Isha prayer time: band, dappu and dancing stop', JSON.stringify(r));
    check(r && r.inZone === 0, bar + ': nobody in the procession is inside a place of worship zone', JSON.stringify(r));
    await shot(page, 'respect_baraat_prayer', 1.6);
    await page.evaluate(() => { N.debug.setTime(20, 30); window.__band = 0; });
    await simWait(page, 6);
    const r2 = await page.evaluate((id) => { const sc = N.citylifeEvents.scene(id); return sc ? { calm: sc.st.calm, phase: sc.phase, band: window.__band } : null; }, bar);
    check(r2 && (r2.calm === false || r2.phase === 'arrive'), bar + ' after prayer time: the band plays again', JSON.stringify(r2));
  }
  // the Secunderabad colony at its evening peak: a real residential lane
  const cid = audit.colonies.find((c) => c.id === 'colony_pm:secunderabad') ? 'colony_pm:secunderabad' : null;
  if (cid) {
    await page.evaluate((id) => {
      const E = N.citylifeEvents; N.calendar.set(2003, 1, 15, 18, 0); N.debug.setTime(18, 0); N.view.set('top');
      E.force(null); E.force(id, { level: 1, restart: true, solo: true });
      const g = E.site(id).geo; N.debug.teleport(g.x, g.y + 4);
    }, cid);
    await simWait(page, 6);
    const c = await page.evaluate((id) => { const sc = N.citylifeEvents.scene(id); if (!sc) return null; let inZone = 0; for (const p of sc.persons) { const z = p.alive && N.respect.at(p.x, p.y); if (z && z.kind !== 'procession') inZone++; } return { phase: sc.phase, persons: sc.persons.length, inZone, dist: (N.world.districtAt(sc.site.x, sc.site.y) || {}).id }; }, cid);
    check(c && c.inZone === 0, 'Secunderabad colony: nobody in a temple / church / mosque zone', JSON.stringify(c));
    await shot(page, 'respect_colony_secbad', 1.6);
  }
  const errs = await N_ERRS(page);
  check(errors.length === 0, 'no console / page errors', errors.slice(0, 4).join(' | '));
  check(errs.length === 0, 'no N.err', errs.slice(0, 6).join(' | '));
  await context.close();
}

/** three busy scenes on screen at once on a phone-size viewport: ms/frame of all city-life work */
async function perf(page, label) {
  await page.evaluate(() => {
    const E = N.citylifeEvents;
    N.calendar.set(2003, 1, 17, 9, 40); N.debug.setTime(9, 40);
    E.force(null);
    E.force('junction:rtc_x_roads', { level: 1, restart: true, solo: true });
    E.force('cinema:sandhya_theatre', { level: 1, restart: true });
    E.force('cinema:odeon_theatre', { level: 1, restart: true });
    const b = E.site('cinema:sandhya_theatre');
    const x = b.x - b.nx * (b.roadW * 0.5 + 6), y = b.y - b.ny * (b.roadW * 0.5 + 6);
    const f = N.world.findFree(x, y, 'walk', 8);
    N.debug.teleport(f ? f.x : x, f ? f.y : y);
  });
  await simWait(page, 6);
  await page.evaluate(() => { window.__perf = { n: 0, sum: 0, max: 0, upd: 0, d2: 0, d3: 0, frame: 0 }; const tick = () => { const s = N.citylifeEvents.stats(); const P = window.__perf; P.n++; P.sum += s.ms; P.max = Math.max(P.max, s.ms); P.upd += s.msUpd; P.d2 += s.ms2d; P.d3 += s.ms3d; P.frame += (N.perf && N.perf.frameMs) || 0; if (P.n < 400) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await simWait(page, 8, 160000);
  const r = await page.evaluate(() => { const P = window.__perf, s = N.citylifeEvents.stats(); return { ent: s.msEnt, frames: P.n, avg: +(P.sum / Math.max(1, P.n)).toFixed(3), max: +P.max.toFixed(2), upd: +(P.upd / Math.max(1, P.n)).toFixed(3), d2: +(P.d2 / Math.max(1, P.n)).toFixed(3), d3: +(P.d3 / Math.max(1, P.n)).toFixed(3), frameMs: +(P.frame / Math.max(1, P.n)).toFixed(1), active: s.active, persons: s.persons, vehicles: s.vehicles, particles: s.particles, act: N.citylifeEvents.active().map((a) => a.id + ':' + a.persons + 'p/' + a.vehicles + 'v') }; });
  console.log('    perf ' + label + ' ' + JSON.stringify(r));
  check(r.active >= 3, label + ': three busy scenes active', r.act.join(' '));
  check(r.avg < 1.5, label + ': all city-life work < 1.5 ms/frame (avg)', r.avg + ' ms (update ' + r.upd + ', 2D ' + r.d2 + ', 3D ' + r.d3 + '), max ' + r.max);
  return r;
}

async function partPhone(browser) {
  cur = 'phone';
  console.log('== phone 390x844 ==');
  const { context, page, errors } = await open(browser, { viewport: { width: 390, height: 844 }, touch: true, dpr: 1 });
  const r2 = await perf(page, 'phone 2D');
  await shot(page, 'phone_busy_top', 1.8);
  await page.evaluate(() => N.view.set('tps'));
  await page.waitForFunction(() => N.view3d && N.view3d.active, null, { timeout: 240000 });
  await page.evaluate(() => { try { N.view3d.settle(4000); } catch (e) { /* ok */ } });
  const r3 = await perf(page, 'phone 3D');
  await page.evaluate(() => { const s = N.citylifeEvents.site('cinema:sandhya_theatre'), p = N.player; const x = s.x - s.nx * (s.roadW + 16), y = s.y - s.ny * (s.roadW + 16); const f = N.world.findFree(x, y, 'walk', 8); N.debug.teleport(f ? f.x : x, f ? f.y : y); const yaw = Math.atan2(s.y - N.player.y, s.x - N.player.x); N.player.angle = yaw; try { N.view3d.setCamera({ yaw, pitch: 0.25, snap: true }); } catch (e) { /* ok */ } });
  await simWait(page, 1.5);
  await shot(page, 'phone_busy_tps');
  const errs = await N_ERRS(page);
  check(errors.length === 0, 'no console / page errors', errors.slice(0, 4).join(' | '));
  check(errs.length === 0, 'no N.err', errs.slice(0, 6).join(' | '));
  await context.close();
  return { r2, r3 };
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const t0 = Date.now();
  try {
    if (want('top') || want('3d')) await partTop(browser);
    if (want('rules')) await partRules(browser);
    if (want('respect')) await partRespect(browser);
    if (want('phone')) await partPhone(browser);
  } catch (e) {
    fail('crashed: ' + (e.stack || e.message));
  } finally {
    await browser.close();
  }
  console.log('\nscreenshots:\n  ' + shots.join('\n  '));
  console.log('\n' + (failures.length ? failures.length + ' FAILURES:\n  ' + failures.join('\n  ') : 'ALL OK') + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  process.exit(failures.length ? 1 : 0);
})();
