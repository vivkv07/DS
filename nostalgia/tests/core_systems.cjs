/* NOSTALGIA — tests/core_systems.cjs
 * Headless Chromium (Playwright) tests for vehicles, HUD, dialogue, missions and save:
 *   desktop 1280x720 (keyboard): enter/exit + drive several vehicle types with real keys
 *     (speed, steering, braking, camera zoom-out), wall collisions, boat stays on water,
 *     people can't walk through cars, borrowing an occupied auto (+1 Chappal Meter), horn,
 *     dialogue flow with key presses, a test mission (registered by this suite: the old DEMO
 *     "Chai Before Sunset" script) to completion (real input + debug hooks), mission fail ->
 *     retry from the checkpoint, save -> reload page -> load,
 *     corrupted / partial saves, minimap renders;
 *   phone portrait 390x844 + landscape 844x390 (touch): HUD visible, inside the screen and
 *     not overlapping itself or the touch controls; touch-joystick driving (point-to-steer);
 *   no-localStorage context: the game boots and saves to memory.
 * Fails on any console error / page error / N.errors entry. Screenshots -> tests/out/core_*.
 *
 *   node nostalgia/tests/core_systems.cjs        ONLY=desktop|portrait|landscape|nostorage
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
let section = '';
const ok = (msg) => console.log('  ok   ' + msg);
const fail = (msg) => { failures.push('[' + section + '] ' + msg); console.log('  FAIL ' + msg); };
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); return !!cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(browser, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 720 }, deviceScaleFactor: opts.dpr || 1, hasTouch: !!opts.touch, isMobile: !!opts.touch });
  if (opts.noStorage) {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('SecurityError: storage disabled'); } });
    });
  }
  // src/testing.js tops pocket money up (play-test builds); the money checks below need the real economy
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => { if (window.N && N.testing) N.testing.unlimitedMoney = false; });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 20000 });
  const shot = (n) => page.screenshot({ path: path.join(OUT, 'core_' + n + '.png') });
  return { context, page, errors, shot };
}

async function checkErrors(page, errors, where) {
  const ne = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + e.msg.split('\n')[0]));
  check(errors.length === 0 && ne.length === 0, 'no console/page/engine errors (' + where + ')', { console: errors.slice(0, 5), engine: ne.slice(0, 5) });
}

// Press E until the dialogue box closes; `choose` picks that option index on choice lines.
async function advanceDialogue(page, choose, maxSteps) {
  for (let i = 0; i < (maxSteps || 40); i++) {
    const st = await page.evaluate(() => ({ open: N.dialogue.isOpen(), cur: N.dialogue.current }));
    if (!st.open && !st.cur) return true;
    if (st.cur && st.cur.choices && !st.cur.typing) {
      const want = choose || 0;
      for (let k = 0; k < ((want - st.cur.selected + st.cur.choices.length) % st.cur.choices.length); k++) { await page.keyboard.press('ArrowDown'); await sleep(60); }
    }
    await page.keyboard.press('KeyE');
    await sleep(140);
  }
  return false;
}

// ▶ PLAY on the title starts a new game, which opens on the story's prologue cutscene (menus.quickStart
// skips the name card under automation); skip it with the real SKIP pill, then start a clean free-roam
// game (the prologue hands over to M1, which these system tests don't want running).
async function playFromTitle(page, touch) {
  const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
  // menus.js (name card) and story.js (prologue) skip ahead under automation (N.menus.quickStart =
  // navigator.webdriver): turn it off to drive the real flow, ▶ PLAY -> [record over?] -> name card -> START
  const quick = await page.evaluate(() => { const q = N.menus.quickStart; N.menus.quickStart = false; return q; });
  await tap('#title-start');
  await page.waitForFunction(() => N.menus.debugState().top === 'name' || !document.querySelector('.jc-confirm').hidden, null, { timeout: 10000 });
  if (await page.evaluate(() => !document.querySelector('.jc-confirm').hidden)) await tap('.jc-confirm [data-act=overwrite]');
  await page.waitForFunction(() => N.menus.debugState().top === 'name', null, { timeout: 10000 });
  await tap('.mn-name [data-act=start]');
  await page.waitForFunction(() => N.state.mode === 'play' || N.state.mode === 'cutscene', null, { timeout: 10000 });
  if (await page.evaluate(() => N.state.mode === 'cutscene')) { if (touch) await page.tap('.cs-skip'); else await page.click('.cs-skip'); }
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 10000 });
  check(await page.evaluate(() => N.flags.year === 2003 && !!N.flags.prologue_seen), 'PLAY -> prologue -> SKIP lands in 2003');
  await page.evaluate((q) => { N.menus.quickStart = q; N.debug.newGame({ skipIntro: true }); }, quick);
}
// Wait until `sec` seconds of game time have passed (robust under CPU load, unlike a wall-clock sleep).
async function gameWait(page, sec, timeout) {
  const t0 = await page.evaluate(() => N.time.now);
  await page.waitForFunction(([a, b]) => N.time.now >= a + b, [t0, sec], { timeout: timeout || 30000 });
}

// The suite's own test mission: the old DEMO "Chai Before Sunset" (removed from story.js when the real story
// landed), registered through N.missions.register so the runner (giver J-card, goto, talk, choice, spawned
// vehicle, until, checkpoint + timer race, give/money/flag, rewards, autosave, fail + retry) is driven end to end.
// It is a 'side' mission with no time window so its giver shows next to the story's main giver; autosave on.
async function registerTestMission(page) {
  await page.evaluate(() => {
    if (N.missions.defs && N.missions.defs.demo_chai_run) return;
    N.dialogue.define('saleem', { name: 'Saleem bhai', color: '#2a8c82', voice: 0.9,
      look: { skin: '#9a6040', hair: '#1a1412', hairStyle: 'oiled', moustache: 'thick', cap: 'skull', shirt: '#efe9dc', bg: '#1e3a36' } });
    N.dialogue.define('cafe', { name: 'Café uncle', color: '#f2c230', voice: 0.8,
      look: { skin: '#d29a6a', hair: '#e8e4dc', hairStyle: 'bald', moustache: 'thick', specs: 'round', cap: 'topi', shirt: '#efe9dc', age: 'old', bg: '#3a2a1a' } });
    N.missions.register({
      id: 'demo_chai_run', kind: 'side', autosave: true, help: false,
      chapter: 'Test', title: 'Chai Before Sunset',
      giver: { place: 'giver_himayatnagar', r: 16 },
      reward: { money: 500 },
      passText: 'Respect + Osmania biscuits',
      script: async (m) => {
        await m.goto('cycle_rent_5', { label: 'Saleem bhai rents cycles at the stand. Go see him.', r: 26, onFoot: true });
        await m.talk([
          { s: 'saleem', t: 'Arre, *pilla*! Your Ammamma wants her *Irani chai*, and the café closes its kettle at sunset.', mood: 'happy' },
          { s: 'you', t: 'I need wheels, Saleem bhai. Fast ones.' },
        ]);
        const pick = await m.choice('saleem', 'Hero cycle, two rupees an hour. *Lena*?', ['Haan, *pakka*! (₹ 2.00)', 'Nakko, I will run there.']);
        if (pick === 0) { m.money(-200); await m.say('saleem', 'Ekdum mast choice. Bring it back without a scratch!', { mood: 'happy' }); }
        else await m.say('saleem', 'Running? In this heat? *Baigan*! Take it — first hour free.', { mood: 'surprised' });
        const stand = N.places.cycle_rent_5;
        const f = N.world.findFree(stand.x + 14, stand.y + 18, 'drive', 16) || stand;
        const cycle = m.vehicle('cycle', f.x, f.y, 0, { color: '#2f6a3a' });
        if (cycle) cycle.__qaHire = true; // traffic rides plain 'cycle's too: the checks below find this one by tag
        m.objective('Get on the cycle.');
        const b = m.blip(cycle, { color: '#6fbf5a', icon: 'dot', pulse: true });
        await m.until(() => N.player.vehicle === cycle);
        m.unblip(b);
        m.checkpoint('race');
        m.timer(45, 'CHAI RUN');
        await m.goto('irani_cafe_3', { label: 'Race to the Irani café before the chai goes cold!', r: 26, inVehicle: true });
        m.timer(null);
        await m.say('cafe', 'Do pauna, ekdum garam! Your Ammamma will be proud.', { mood: 'happy' });
        m.give('osmania_biscuits', { name: 'Osmania biscuits' });
        m.money(300);
        m.flag('demo_chai_done');
        await m.wait(0.3);
      },
    });
  });
}

/* ===================================================================== desktop */
async function desktop(browser) {
  section = 'desktop';
  console.log('\n== desktop 1280x720 (keyboard)');
  const { page, errors, shot } = await newPage(browser);
  await playFromTitle(page);
  await page.evaluate(() => {
    N.debug.setTime(12, 0); N.debug.freezeClock(true);
    window.__ev = { bump: [], horn: [], borrowed: 0, enter: 0, exit: 0, fail: 0, pass: 0 };
    N.on('bump', (e) => window.__ev.bump.push({ speed: e.speed, wall: !!e.wall, ped: !!e.ped, a: e.a && e.a.type }));
    N.on('horn', (e) => window.__ev.horn.push(e.type));
    N.on('vehicle:borrowed', () => window.__ev.borrowed++);
    N.on('player:enterVehicle', () => window.__ev.enter++);
    N.on('player:exitVehicle', () => window.__ev.exit++);
    N.on('mission:fail', () => window.__ev.fail++);
    N.on('mission:complete', () => window.__ev.pass++);
    // a long straight, clear road to drive on
    const S = N.SURF, roads = N.WORLD_DATA.roads;
    let best = null;
    for (const r of roads) {
      if (!/arterial|bund|street/.test(r.kind)) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 520) continue;
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
        let clear = true;
        for (let d = 40; d < 480; d += 6) {
          for (const off of [-9, 0, 9]) {
            const s = N.world.surfaceAt(a[0] + ux * d - uy * off, a[1] + uy * d + ux * off);
            if (s !== S.ROAD && s !== S.BRIDGE) { clear = false; break; }
          }
          if (!clear) break;
        }
        if (clear && (!best || L > best.L)) best = { x: a[0] + ux * 40, y: a[1] + uy * 40, angle: Math.atan2(uy, ux), L, id: r.id };
      }
    }
    window.__road = best;
  });
  const road = await page.evaluate(() => window.__road);
  check(!!road, 'found a long straight road for driving tests', road);

  // ---- A3 (Chinnu is 11): ACTION on a parked Ambassador does not put him at the wheel
  const a3 = await page.evaluate(() => {
    const r = window.__road;
    N.vehicles.list.slice().forEach((v) => N.vehicles.remove(v));
    N.vehicles.allowHeavy = false;
    N.player.teleport(r.x, r.y);
    const T = N.vehicles.TYPES.ambassador, lx = Math.sin(r.angle), ly = -Math.cos(r.angle);
    window.__v = N.vehicles.spawn('ambassador', r.x + Math.cos(r.angle) * 4 + lx * (T.d / 2 + 6), r.y + Math.sin(r.angle) * 4 + ly * (T.d / 2 + 6), r.angle, {});
    return { canDrive: N.vehicles.canDrive(window.__v), kidOk: ['cycle', 'auto', 'chetak', 'ambassador', 'bus'].filter((t) => N.vehicles.TYPES[t].kidOk) };
  });
  await gameWait(page, 0.2);
  await page.keyboard.press('KeyE');
  await gameWait(page, 0.3);
  const a3r = await page.evaluate(() => ({ veh: N.player.vehicle && N.player.vehicle.type, label: N.input.actionLabel }));
  check(!a3.canDrive && !a3r.veh && a3.kidOk.join() === 'cycle,auto', 'A3: a kid may drive the cycle and the auto; ACTION at a parked Ambassador does not seat him at the wheel', { a3, a3r });

  // ---- enter / drive / steer / brake / exit for several types, with real keys
  // (Chetak, Ambassador and the bus are not kid vehicles: N.vehicles.allowHeavy lifts A3 for those
  //  iterations only, so their handling, camera zoom and horn are still exercised)
  for (const type of ['cycle', 'chetak', 'auto', 'ambassador', 'bus']) {
    const setup = await page.evaluate(({ type }) => {
      const r = window.__road;
      N.vehicles.allowHeavy = !N.vehicles.TYPES[type].kidOk;
      N.vehicles.list.slice().forEach((v) => N.vehicles.remove(v));
      N.player.teleport(r.x, r.y);
      const T = N.vehicles.TYPES[type];
      // park it just ahead-left of the player, pointing down the road
      const lx = Math.sin(r.angle), ly = -Math.cos(r.angle);
      const v = N.vehicles.spawn(type, r.x + Math.cos(r.angle) * 4 + lx * (T.d / 2 + 6), r.y + Math.sin(r.angle) * 4 + ly * (T.d / 2 + 6), r.angle, {});
      window.__v = v;
      return { d: N.vehicles.distTo(v, N.player.x, N.player.y), x: v.x, y: v.y };
    }, { type });
    await sleep(200);
    const label = await page.evaluate(() => N.input.actionLabel);
    await page.keyboard.press('KeyE');
    await sleep(200);
    let st = await page.evaluate(() => ({ veh: N.player.vehicle && N.player.vehicle.type, mode: N.player.mode, state: N.debug.state().player.vehicle }));
    check(st.veh === type && st.state === type, type + ': ACTION ("' + label + '") gets in (d=' + setup.d.toFixed(1) + ')', st);
    // accelerate
    await page.evaluate(() => { const v = window.__v; window.__p0 = { x: v.x, y: v.y, a: v.angle }; });
    await page.keyboard.down('KeyW');
    await gameWait(page, type === 'bus' ? 2.2 : 1.6); // game time: held keys act per game step, not per wall-clock ms
    st = await page.evaluate(() => { const v = window.__v, p = window.__p0; return { speed: v.speed, max: v.T.maxSpeed, along: (v.x - p.x) * Math.cos(p.a) + (v.y - p.y) * Math.sin(p.a), zoom: N.render.cam.zoom, x: v.x, y: v.y, px: N.player.x, py: N.player.y }; });
    check(st.speed > st.max * 0.33 && st.along > 40, type + ': W accelerates (speed ' + st.speed.toFixed(0) + '/' + st.max + ', moved ' + st.along.toFixed(0) + 'u)', st);
    check(Math.hypot(st.px - st.x, st.py - st.y) < 1, type + ': player rides along with the vehicle');
    if (type === 'ambassador') {
      // the follow camera eases towards a speed-dependent zoom: let the car pick up real speed first (game condition)
      await page.waitForFunction(() => window.__v.speed > window.__v.T.maxSpeed * 0.65, null, { timeout: 20000 }).catch(() => {});
      await gameWait(page, 0.5);
      st.zoom = await page.evaluate(() => N.render.cam.zoom);
    }
    if (type === 'ambassador') check(st.zoom < 0.97, 'ambassador: camera zooms out with speed (zoom ' + st.zoom.toFixed(3) + ')');
    // steer
    await page.keyboard.down('KeyD');
    await gameWait(page, 0.5);
    await page.keyboard.up('KeyD');
    st = await page.evaluate(() => ({ da: N.util.angleDiff(window.__p0.a, window.__v.angle) }));
    check(st.da > 0.15, type + ': D steers right (turned ' + st.da.toFixed(2) + ' rad)');
    await page.keyboard.up('KeyW');
    // brake
    const s0 = await page.evaluate(() => window.__v.speed);
    await page.keyboard.down('KeyS');
    await gameWait(page, 0.45);
    const s1 = await page.evaluate(() => window.__v.speed);
    await page.keyboard.up('KeyS');
    check(s1 < s0 - 20, type + ': S brakes (' + s0.toFixed(0) + ' -> ' + s1.toFixed(0) + ')');
    // horn
    await page.keyboard.press('Space');
    await sleep(100);
    // stop, exit
    await page.keyboard.down('KeyS'); await gameWait(page, 0.9); await page.keyboard.up('KeyS');
    await page.keyboard.press('KeyE');
    await sleep(200);
    st = await page.evaluate(() => ({ veh: N.player.vehicle, mode: N.player.mode, walk: N.world.isWalkable(N.player.x, N.player.y), d: N.vehicles.distTo(window.__v, N.player.x, N.player.y), alive: window.__v.alive }));
    check(!st.veh && st.mode === 'foot' && st.walk && st.d > 0 && st.alive, type + ': ACTION gets out beside it (' + st.d.toFixed(1) + 'u from the body)', st);
    if (type === 'auto') await shot('drive_' + type);
  }
  await page.evaluate(() => { N.vehicles.allowHeavy = false; });
  const horns = await page.evaluate(() => window.__ev.horn);
  check(horns.length >= 5 && horns.indexOf('bus') >= 0, 'horn events emitted per vehicle type', horns);

  // ---- wall collision: drive a car straight at a building
  const wall = await page.evaluate(() => {
    const S = N.SURF;
    const blocked = (x, y) => !N.world.isDrivable(x, y);
    // search road points for a building within 60..140u to the side, with clear tarmac/path in between
    for (let tries = 0; tries < 400; tries++) {
      const rp = N.world.randomRoadPoint(Math.random, ['street', 'arterial']);
      if (!rp) continue;
      for (const side of [1, -1]) {
        const a = rp.angle + side * Math.PI / 2, ux = Math.cos(a), uy = Math.sin(a);
        let hit = -1;
        for (let d = 0; d < 160; d += 1) { if (blocked(rp.x + ux * d, rp.y + uy * d)) { hit = d; break; } }
        if (hit < 70) continue;
        if (N.world.surfaceAt(rp.x + ux * (hit + 2), rp.y + uy * (hit + 2)) !== S.SOLID) continue;
        // a flat face met head-on across the car's width (a diagonal approach glances off a
        // corner and slides along the wall, which is correct physics but not this check)
        let flat = true;
        for (const o of [-9, -4.5, 4.5, 9]) {
          let h2 = -1;
          for (let d = 0; d < hit + 12; d += 1) { if (blocked(rp.x + ux * d - uy * o, rp.y + uy * d + ux * o)) { h2 = d; break; } }
          if (h2 < 0 || Math.abs(h2 - hit) > 1.5) { flat = false; break; }
        }
        if (!flat) continue;
        // corridor wide enough for a car
        let wide = true;
        for (let d = 0; d < hit - 4 && wide; d += 3) for (const o of [-8, 8]) if (blocked(rp.x + ux * d - uy * o, rp.y + uy * d + ux * o)) wide = false;
        if (!wide) continue;
        return { x: rp.x, y: rp.y, angle: a, hit };
      }
    }
    return null;
  });
  if (check(!!wall, 'found a building to crash into', wall)) {
    await page.evaluate((w) => {
      N.vehicles.list.slice().forEach((v) => N.vehicles.remove(v));
      N.player.teleport(w.x, w.y);
      const v = N.vehicles.spawn('ambassador', w.x, w.y, w.angle, {});
      N.vehicles.enter(N.player, v);
      window.__v = v; window.__ev.bump.length = 0;
      window.__inside = 0;
      N.addSystem({ id: '__wallprobe', order: 31, runIn: ['play'], update() { const v = window.__v; if (!v || !v.alive) return; const c = Math.cos(v.angle), s = Math.sin(v.angle); for (const o of v.T.co) if (!N.world.isDrivable(v.x + c * o, v.y + s * o)) window.__inside++; } });
    }, wall);
    await page.keyboard.down('KeyW');
    await gameWait(page, 2.6);
    await shot('wall');
    await page.keyboard.up('KeyW');
    const r = await page.evaluate((w) => { const v = window.__v; const along = (v.x - w.x) * Math.cos(w.angle) + (v.y - w.y) * Math.sin(w.angle); N.systems.list.splice(N.systems.list.findIndex((s) => s.id === '__wallprobe'), 1); return { along, front: along + v.T.w / 2, inside: window.__inside, speed: v.speed, bumps: window.__ev.bump.filter((b) => b.wall).map((b) => Math.round(b.speed)) }; }, wall);
    check(r.front <= wall.hit + 3 && r.inside === 0, 'car stops at the wall (front at ' + r.front.toFixed(1) + 'u, wall at ' + wall.hit + 'u, frames inside: ' + r.inside + ')', r);
    check(r.bumps.length > 0 && Math.max.apply(null, r.bumps) > 30, 'wall impact emits a bump event (' + r.bumps.join(',') + ')');
    await page.evaluate(() => N.player.teleport(N.player.x, N.player.y));
  }

  // ---- people can't walk through a parked car
  const ped = await page.evaluate(() => {
    const r = window.__road;
    N.vehicles.list.slice().forEach((v) => N.vehicles.remove(v));
    N.player.teleport(r.x, r.y);
    const v = N.vehicles.spawn('padmini', r.x + Math.cos(r.angle) * 30, r.y + Math.sin(r.angle) * 30, r.angle + Math.PI / 2, {});
    window.__v = v; window.__minD = 99;
    N.addSystem({ id: '__pedprobe', order: 32, runIn: ['play'], update() { window.__minD = Math.min(window.__minD, N.vehicles.distTo(window.__v, N.player.x, N.player.y)); } });
    // walk straight at it: which key?
    const a = r.angle; const keys = [];
    if (Math.cos(a) > 0.38) keys.push('KeyD'); if (Math.cos(a) < -0.38) keys.push('KeyA');
    if (Math.sin(a) > 0.38) keys.push('KeyS'); if (Math.sin(a) < -0.38) keys.push('KeyW');
    return { keys };
  });
  for (const k of ped.keys) await page.keyboard.down(k);
  await gameWait(page, 1.5);
  for (const k of ped.keys) await page.keyboard.up(k);
  const pedR = await page.evaluate(() => { const i = N.systems.list.findIndex((s) => s.id === '__pedprobe'); N.systems.list.splice(i, 1); return { minD: window.__minD, d: N.vehicles.distTo(window.__v, N.player.x, N.player.y) }; });
  check(pedR.minD > -0.01 && pedR.d < 8, 'walking into a parked car is blocked at its body (closest ' + pedR.minD.toFixed(2) + 'u)', pedR);

  // ---- borrow an occupied auto: driver steps out, Chappal Meter +1
  const bor = await page.evaluate(() => {
    const r = window.__road;
    N.vehicles.list.slice().forEach((v) => N.vehicles.remove(v));
    N.wanted.set(0);
    N.player.teleport(r.x, r.y);
    const lx = Math.sin(r.angle), ly = -Math.cos(r.angle);
    window.__v = N.vehicles.spawn('auto', r.x + lx * 13, r.y + ly * 13, r.angle, { driver: true });
    return 1;
  });
  void bor;
  await sleep(200);
  const bl = await page.evaluate(() => N.input.actionLabel);
  await page.keyboard.press('KeyE');
  await sleep(300);
  const br = await page.evaluate(() => ({ veh: N.player.vehicle && N.player.vehicle.type, wanted: N.wanted.level, borrowed: window.__ev.borrowed, peds: N.entities.byKind('ped').filter((e) => e !== N.player).length }));
  check(bl === 'Borrow auto' && br.veh === 'auto' && br.wanted === 1 && br.borrowed === 1 && br.peds >= 1, 'borrowing an occupied auto: driver gets out, Chappal Meter +1 ("' + bl + '")', br);
  await sleep(600);
  await shot('borrow');
  await page.evaluate(() => { N.player.teleport(N.player.x, N.player.y); N.wanted.set(0); });

  // ---- boat stays on the water
  const boat = await page.evaluate(() => {
    const boats = N.vehicles.list.filter((v) => v.type === 'boat');
    N.vehicles.list.slice().forEach((v) => { if (v.type !== 'boat') N.vehicles.remove(v); });
    let b = boats[0];
    if (!b) { N.vehicles.seedParked(); b = N.vehicles.list.filter((v) => v.type === 'boat')[0]; }
    if (!b) return null;
    N.player.teleport(b.x, b.y + 20);
    N.vehicles.enter(N.player, b);
    window.__v = b; window.__dry = 0; window.__p0 = { x: b.x, y: b.y };
    N.addSystem({ id: '__boatprobe', order: 31, runIn: ['play'], update() { const v = window.__v; if (v && v.alive && !N.world.isWater(v.x, v.y) && N.world.surfaceAt(v.x, v.y) !== N.SURF.BRIDGE) window.__dry++; } });
    return { x: b.x, y: b.y };
  });
  if (check(!!boat, 'a boat is moored at the Lumbini jetty')) {
    await page.keyboard.down('KeyW');
    await gameWait(page, 1.8);
    await page.keyboard.down('KeyA'); await gameWait(page, 0.9); await page.keyboard.up('KeyA');
    await gameWait(page, 1.6);
    await shot('boat');
    await page.keyboard.up('KeyW');
    const r = await page.evaluate(() => { const i = N.systems.list.findIndex((s) => s.id === '__boatprobe'); N.systems.list.splice(i, 1); const v = window.__v; return { dry: window.__dry, moved: Math.hypot(v.x - window.__p0.x, v.y - window.__p0.y), speed: v.speed }; });
    check(r.dry === 0 && r.moved > 30, 'boat sails ' + r.moved.toFixed(0) + 'u and never leaves the water', r);
    await page.evaluate(() => N.player.teleport(N.places.lumbini_park.x, N.places.lumbini_park.y));
  }

  // ---- dialogue flow with key presses
  await page.evaluate(() => {
    N.debug.teleport('home');
    window.__dlg = 'pending';
    N.dialogue.play([
      { s: 'you', t: 'Testing the *dialogue* box, over.' },
      { s: 'saleem', t: 'Pick one, *pilla*!', choices: ['First', 'Second', 'Third'] },
    ]).then((r) => { window.__dlg = r; });
  });
  await sleep(150);
  let d = await page.evaluate(() => ({ mode: N.state.mode, cur: N.dialogue.current }));
  check(d.mode === 'dialogue' && d.cur && d.cur.typing, 'dialogue opens in dialogue mode and types out', d);
  await page.keyboard.press('KeyE'); // complete typing
  await sleep(150);
  d = await page.evaluate(() => N.dialogue.current);
  check(d && !d.typing && d.speaker === 'you', 'ACTION completes the typewriter line', d);
  await page.keyboard.press('KeyE'); // next line
  await sleep(1400);
  d = await page.evaluate(() => N.dialogue.current);
  check(d && d.choices && d.choices.length === 3, 'ACTION advances to the choice line', d);
  await page.keyboard.press('ArrowDown');
  await sleep(80);
  await shot('dialogue_choice');
  await page.keyboard.press('KeyE');
  await sleep(250);
  d = await page.evaluate(() => ({ r: window.__dlg, mode: N.state.mode, open: N.dialogue.isOpen() }));
  check(d.r === 1 && d.mode === 'play' && !d.open, 'arrow + ACTION picks option 2 and the game resumes', d);

  // ---- test mission end to end
  await registerTestMission(page);
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.setTime(16, 50); N.debug.freezeClock(true); N.save.clear(); window.__ev.pass = 0; window.__ev.fail = 0; });
  await gameWait(page, 0.5);
  const giver = await page.evaluate(() => { const g = N.places.giver_himayatnagar; N.player.teleport(g.x + 34, g.y); window.__money0 = N.player.money; return { avail: N.missions.available().map((m) => m.id), x: g.x, y: g.y, money: N.player.money }; });
  await page.waitForFunction(() => N.hud.blips.has('giver:demo_chai_run') && N.missions.markers().length > 0, null, { timeout: 10000 }).catch(() => {});
  const gm = await page.evaluate(() => ({ markers: N.missions.markers().length, blip: N.hud.blips.has('giver:demo_chai_run') }));
  check(giver.avail.indexOf('demo_chai_run') >= 0 && gm.markers > 0 && gm.blip && giver.money === 1000, 'test mission is available with a giver marker + minimap blip (new game starts with ₹10)', Object.assign(giver, gm));
  await gameWait(page, 0.3);
  await shot('giver');
  // walking into the giver opens the J-card prompt; ACTION (▶ PLAY) starts the mission
  await page.keyboard.down('KeyA');
  await page.waitForFunction(() => N.input.actionLabel === '▶ PLAY' || N.missions.active, null, { timeout: 8000 }).catch(() => {});
  await page.keyboard.up('KeyA');
  const jcard = await page.evaluate(() => ({ label: N.input.actionLabel, title: (document.querySelector('.hud-jcard .jc-title') || {}).textContent, active: !!N.missions.active }));
  check(jcard.active || (jcard.label === '▶ PLAY' && String(jcard.title).toUpperCase() === 'CHAI BEFORE SUNSET'), 'walking into the giver opens its J-card ("▶ PLAY")', jcard);
  if (!jcard.active) await page.keyboard.press('KeyE');
  await page.waitForFunction(() => N.missions.active, null, { timeout: 8000 }).catch(() => {});
  let ms = await page.evaluate(() => N.debug.state());
  check(ms.mission === 'demo_chai_run' && /cycle/i.test(ms.objective || ''), 'ACTION on the J-card starts the mission', ms);
  await sleep(400);
  await shot('mission_start');
  await page.evaluate(() => N.debug.teleport('cycle_rent_5'));
  await page.waitForFunction(() => N.dialogue.isOpen(), null, { timeout: 4000 }).catch(() => {});
  check(await page.evaluate(() => N.dialogue.isOpen()), 'reaching the cycle stand starts the talk');
  await sleep(300);
  await shot('mission_talk');
  await advanceDialogue(page, 0);
  ms = await page.evaluate(() => ({ obj: N.hud.objectiveText, money: N.player.money, money0: window.__money0, cyc: N.vehicles.list.filter((v) => v.__qaHire && v.alive).length }));
  check(/Get on the cycle/.test(ms.obj || '') && ms.money === ms.money0 - 200 && ms.cyc === 1, 'choice "pakka" pays ₹ 2 and the hire cycle appears', ms);
  await page.evaluate(() => { const v = N.vehicles.list.filter((x) => x.__qaHire && x.alive)[0]; N.player.teleport(v.x, v.y + 9); window.__v = v; });
  await sleep(200);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => N.hud.timerValue() !== null, null, { timeout: 3000 }).catch(() => {});
  ms = await page.evaluate(() => ({ veh: N.player.vehicle === window.__v, timer: N.hud.timerValue(), obj: N.hud.objectiveText, cp: N.missions.active && N.missions.active.checkpointData && N.missions.active.checkpointData.name, timerShown: document.querySelector('.hud-timer').classList.contains('show') }));
  check(ms.veh && ms.timer > 40 && ms.timerShown && ms.cp === 'race', 'on the cycle: checkpoint "race" + 45 s HUD timer', ms);
  await page.keyboard.down('KeyW'); await gameWait(page, 1.0); await page.keyboard.up('KeyW');
  const t2 = await page.evaluate(() => N.hud.timerValue());
  check(t2 < ms.timer - 0.5, 'race timer counts down (' + ms.timer + ' -> ' + t2 + ')');
  await shot('mission_race');
  // (test shortcut) put the cycle at the café
  await page.evaluate(() => { const c = N.places.irani_cafe_3, v = window.__v, f = N.world.findFree(c.x, c.y, 'drive', 12) || c; v.x = f.x; v.y = f.y; v.vx = v.vy = 0; });
  await page.waitForFunction(() => N.dialogue.isOpen(), null, { timeout: 5000 }).catch(() => {});
  ms = await page.evaluate(() => ({ open: N.dialogue.isOpen(), timer: N.hud.timerValue(), cur: N.dialogue.current }));
  check(ms.open && ms.timer === null, 'arriving at the café stops the timer and the café uncle talks', ms);
  await advanceDialogue(page, 0);
  await page.waitForFunction(() => !N.missions.active, null, { timeout: 4000 }).catch(() => {});
  await sleep(500);
  await shot('mission_passed');
  ms = await page.evaluate(() => ({ done: N.missions.done.has('demo_chai_run'), money: N.player.money, money0: window.__money0, inv: N.player.inventory.has('osmania_biscuits'), flag: !!N.flags.demo_chai_done, saved: N.save.has(), banner: document.querySelector('.hud-banner .b-title').textContent, show: document.querySelector('.hud-banner').classList.contains('show'), passEv: window.__ev.pass, avail: N.missions.available().length }));
  check(ms.done && ms.money === ms.money0 - 200 + 500 + 300 && ms.inv && ms.flag && ms.passEv === 1, 'MISSION PASSED: rewards, item, flag (money ' + ms.money + ')', ms);
  check(ms.banner === 'MISSION PASSED' && ms.show, 'MISSION PASSED banner is shown', ms);
  check(ms.saved, 'mission pass autosaves');

  // ---- mission fail -> retry from the checkpoint
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.setTime(16, 50); N.debug.skipDialogue(true); window.__ev.fail = 0; window.__ev.pass = 0; });
  await sleep(300);
  await page.evaluate(() => { N.debug.startMission('demo_chai_run'); N.debug.teleport('cycle_rent_5'); });
  // (generous timeouts: these wait on the mission script, which runs in game time)
  await page.waitForFunction(() => /Get on the cycle/.test(N.hud.objectiveText || '') && N.vehicles.list.some((v) => v.__qaHire && v.alive), null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => { const v = N.vehicles.list.filter((x) => x.__qaHire && x.alive).pop(); N.vehicles.enter(N.player, v); });
  await page.waitForFunction(() => N.hud.timerValue() !== null, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => { const a = N.missions.active; if (a && a.timer) a.timer.left = 0.3; });
  await page.waitForFunction(() => !N.missions.active, null, { timeout: 15000 }).catch(() => {});
  await sleep(400);
  await shot('mission_failed');
  ms = await page.evaluate(() => ({ active: !!N.missions.active, ev: window.__ev.fail, title: document.querySelector('.hud-banner .b-title').textContent, kind: document.querySelector('.hud-banner').className, mode: N.state.mode, timer: N.hud.timerValue() }));
  check(!ms.active && ms.ev === 1 && ms.title === 'MISSION FAILED' && /kind-fail/.test(ms.kind) && ms.timer === null, 'timer expiry fails the mission with a MISSION FAILED banner', ms);
  await page.waitForFunction(() => document.querySelector('.hud-ask.show'), null, { timeout: 3000 }).catch(() => {});
  await sleep(100);
  ms = await page.evaluate(() => ({ ask: !!document.querySelector('.hud-ask.show'), label: N.input.actionLabel }));
  check(ms.ask && ms.label === 'Retry mission', 'retry prompt appears (ACTION = "Retry mission")', ms);
  await shot('mission_retry_prompt');
  await page.keyboard.press('KeyE');
  await sleep(500);
  ms = await page.evaluate(() => ({ id: N.missions.active && N.missions.active.id, attempt: N.missions.active && N.missions.active.attempt, veh: N.player.vehicle && N.player.vehicle.type, timer: N.hud.timerValue(), obj: N.hud.objectiveText }));
  check(ms.id === 'demo_chai_run' && ms.attempt === 2 && ms.veh === 'cycle' && ms.timer > 40, 'retry resumes at the "race" checkpoint on a cycle with a fresh timer', ms);
  await page.evaluate(() => N.debug.completeMission());
  await page.waitForFunction(() => !N.missions.active, null, { timeout: 3000 }).catch(() => {});
  ms = await page.evaluate(() => ({ done: N.missions.done.has('demo_chai_run'), pass: window.__ev.pass }));
  check(ms.done && ms.pass === 1, 'N.debug.completeMission() passes the retried mission', ms);
  await page.evaluate(() => N.debug.skipDialogue(false));

  // ---- save -> reload page -> load
  const saved = await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    N.player.money = 12345; N.flags.test_flag = 'yes'; N.clock.set(20, 15); N.clock.day = 2;
    N.missions.done.add('demo_chai_run');
    N.debug.teleport('charminar');
    N.debug.enterVehicle('cycle'); // a kid's vehicle: A3 never restores him at the wheel of a heavy one
    const ok = N.save.save({ reason: 'test' });
    return { ok, x: N.player.x, y: N.player.y, raw: (N.save._raw() || '').length };
  });
  check(saved.ok && saved.raw > 50, 'N.save.save() writes the game (' + saved.raw + ' bytes)');
  await page.reload();
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 20000 });
  const has = await page.evaluate(() => ({ has: N.save.has(), info: N.save.info() }));
  check(has.has && has.info && has.info.money === 12345, 'after reload: a save exists (' + (has.info && has.info.district) + ', ' + (has.info && has.info.clock) + ')', has);
  const loaded = await page.evaluate(() => { N.game.continueGame(); const p = N.player; return { mode: N.state.mode, money: p.money, flag: N.flags.test_flag, clock: N.clock.label(), day: N.clock.day, done: N.missions.done.has('demo_chai_run'), veh: p.vehicle && p.vehicle.type, x: p.x, y: p.y }; });
  check(loaded.mode === 'play' && loaded.money === 12345 && loaded.flag === 'yes' && loaded.clock === '20:15' && loaded.day === 2 && loaded.done && loaded.veh === 'cycle' && Math.hypot(loaded.x - saved.x, loaded.y - saved.y) < 30,
    'continue restores money, flags, clock, day, missions, position and the cycle', loaded);
  await sleep(500);
  await shot('loaded_night');

  // ---- corrupted / partial saves never throw
  const corrupt = await page.evaluate(() => {
    const out = {};
    N.save.clear(); N.save.save({ toast: false }); N.save.save({ toast: false }); // second save keeps a .bak
    localStorage.setItem(N.save.KEY, '{"game":"nostalgia","v":1,"data":{"player":'); // truncated
    out.hasWithBackup = N.save.has(); out.fromBackup = (N.save.info() || {}).from;
    out.loadBackup = N.save.load();
    N.save.clear();
    localStorage.setItem(N.save.KEY, 'not json at all');
    out.hasGarbage = N.save.has();
    out.loadGarbage = N.save.load();
    localStorage.setItem(N.save.KEY, JSON.stringify({ game: 'nostalgia', v: 1, t: 1, data: { player: 'garbage', clock: { minutes: 'x' }, flags: [1, 2], missions: { done: 'nope' }, mystery: { a: 1 } } }));
    out.loadPartial = N.save.load();
    out.partialDone = N.missions.done.size; out.px = N.player.x;
    // the garbage flags ([1, 2]) are dropped; what is left are only the flags the calendar/seasons derive on load
    // (year, festival flags, no_save...), i.e. exactly what loading an empty flags section gives
    const got = Object.keys(N.flags).sort();
    localStorage.setItem(N.save.KEY, JSON.stringify({ game: 'nostalgia', v: 1, t: 1, data: { flags: {} } }));
    N.save.load();
    const derived = Object.keys(N.flags).sort();
    out.flags = got.filter((k) => derived.indexOf(k) < 0); out.derived = derived.length;
    localStorage.setItem(N.save.KEY, JSON.stringify({ game: 'nostalgia', v: 99, data: {} }));
    out.futureVersion = N.save.has();
    N.save.clear();
    return out;
  });
  check(corrupt.hasWithBackup && corrupt.fromBackup === 'backup' && corrupt.loadBackup, 'truncated save falls back to the backup copy', corrupt);
  check(!corrupt.hasGarbage && corrupt.loadGarbage === false, 'garbage save is ignored (has() false, load() false)', corrupt);
  check(corrupt.loadPartial && corrupt.partialDone === 0 && corrupt.flags.length === 0, 'partial / wrong-typed sections load without throwing', corrupt);
  check(!corrupt.futureVersion, 'saves from a newer version are not loaded');
  await page.evaluate(() => { N.game.newGame({ skipIntro: true }); });

  // ---- minimap renders
  await sleep(400);
  const mm = await page.evaluate(() => {
    const c = document.querySelector('.hud-minimap canvas');
    const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data;
    const set = new Set();
    for (let i = 0; i < d.length; i += 4 * 7) set.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, colors: set.size, vis: r.width > 50 && getComputedStyle(c.parentNode).opacity !== '0' };
  });
  check(mm.w > 100 && mm.colors > 40 && mm.vis, 'minimap renders the city (' + mm.colors + ' colours at ' + mm.w + 'px)', mm);

  // ---- night drive look
  await page.evaluate(() => { N.debug.teleport('tank_bund'); N.debug.setTime(21, 0); const v = N.debug.enterVehicle('ambassador'); window.__v = v; });
  await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW');
  await shot('night_drive');
  await checkErrors(page, errors, 'desktop');
  await page.context().close();
}

/* =================================================================== phones */
async function phone(browser, name, viewport) {
  section = name;
  console.log('\n== ' + name + ' ' + viewport.width + 'x' + viewport.height + ' (touch)');
  const { context, page, errors, shot } = await newPage(browser, { viewport, dpr: 2, touch: true });
  await playFromTitle(page, true);
  await page.evaluate(() => {
    N.debug.setTime(17, 0); N.debug.freezeClock(true);
    N.hud.objective('Race to the Irani café before the chai goes cold!');
    N.hud.timer('CHAI RUN', 42);
    N.hud.toast('Tip: the minimap line shows the way.', 8000);
    N.wanted.set(2);
    // the meter shows two slippers but nobody chases: on a loaded machine an uncle used to catch Chinnu before
    // the layout check (PAKDA GAYA -> scolding dialogue hides the touch controls and holds the toast)
    N.wanted.freeze(true, 'script');
    N.hud.blip('t', 'irani_cafe_3', { route: true, icon: 'star', color: '#ff5fb0' });
  });
  await sleep(1200);
  const rects = await page.evaluate(() => {
    const R = (s) => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const b = e.getBoundingClientRect(); return b.width && b.height ? { s, l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
    return ['.hud-osd', '.hud-stats', '.hud-obj', '.hud-timer', '.hud-toast', '.hud-minimap', '#touch .t-action', '#touch .t-run', '#touch .t-horn', '#touch .t-map', '#touch .t-pause'].map(R);
  });
  const vis = rects.filter(Boolean);
  check(vis.length === 11, 'all HUD parts + touch controls visible', rects.map((r) => r && r.s));
  const inside = vis.filter((r) => r.l < 0 || r.t < 0 || r.r > viewport.width || r.b > viewport.height);
  check(inside.length === 0, 'everything inside the screen', inside);
  const over = [];
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const a = vis[i], b = vis[j];
    if (a.s.startsWith('#touch') && b.s.startsWith('#touch')) continue;
    if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) over.push(a.s + ' x ' + b.s);
  }
  check(over.length === 0, 'no HUD overlaps (with itself or the touch controls)', over);
  await shot(name + '_hud');
  // touch driving: ACTION on a Scooty (a kid may ride one: A3), then the joystick steers towards the stick.
  // A new game starts on the home terrace (whose ACTION is "Fly a patang"): go down to Tank Bund first.
  await page.evaluate(() => { N.hud.objective(null); N.hud.timer(null); N.debug.teleport('tank_bund'); const v = N.debug.spawnVehicle('scooty'); window.__v = v; N.player.teleport(v.x, v.y + 10); });
  await sleep(250);
  const lbl = await page.evaluate(() => document.querySelector('#touch .t-action .t-txt').textContent);
  await page.tap('#touch .t-action');
  await sleep(250);
  const inV = await page.evaluate(() => N.player.vehicle === window.__v);
  check(inV, 'tapping ACTION ("' + lbl + '") rides the Scooty');
  const cdp = await context.newCDPSession(page);
  const x0 = 90, y0 = viewport.height - 120;
  const p0 = await page.evaluate(() => ({ x: window.__v.x, y: window.__v.y }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + 9 * i, y: y0, id: 1 }] }); await sleep(16); }
  await sleep(1500);
  const mid = await page.evaluate(() => ({ a: window.__v.angle, speed: window.__v.speed, analog: N.input.analog }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const p1 = await page.evaluate(() => ({ x: window.__v.x, y: window.__v.y }));
  check(mid.analog && Math.abs(N_angleDiff(mid.a, 0)) < 0.5 && Math.hypot(p1.x - p0.x, p1.y - p0.y) > 40, 'joystick right: the scooter turns east and drives (' + Math.hypot(p1.x - p0.x, p1.y - p0.y).toFixed(0) + 'u)', mid);
  await shot(name + '_drive');
  // dialogue on the phone (tap to advance)
  await page.evaluate(() => { window.__r = 'x'; N.dialogue.choice('saleem', 'Tap test: which one?', ['Chai', 'Coffee']).then((r) => { window.__r = r; }); });
  await sleep(1600);
  await shot(name + '_dialogue');
  await page.tap('.dlg-choice:nth-child(2)');
  await sleep(200);
  check(await page.evaluate(() => window.__r === 1 && N.state.mode === 'play'), 'tapping a choice answers it');
  await checkErrors(page, errors, name);
  await context.close();
}
function N_angleDiff(a, b) { let d = (b - a + Math.PI) % (Math.PI * 2); if (d < 0) d += Math.PI * 2; return d - Math.PI; }

/* ================================================================ no storage */
async function noStorage(browser) {
  section = 'nostorage';
  console.log('\n== no localStorage');
  const { context, page, errors } = await newPage(browser, { noStorage: true });
  await playFromTitle(page);
  const r = await page.evaluate(() => {
    N.player.money = 4242;
    const saved = N.save.save({ toast: false });
    N.player.money = 1;
    const loaded = N.save.load();
    return { available: N.save.available, saved, has: N.save.has(), loaded, money: N.player.money };
  });
  check(!r.available && r.saved && r.has && r.loaded && r.money === 4242, 'without localStorage the game saves to memory for the session', r);
  await checkErrors(page, errors, 'nostorage');
  await context.close();
}

(async () => {
  const browser = await chromium.launch(process.env.REAL_FONTS && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  const only = process.env.ONLY;
  try {
    if (!only || only === 'desktop') await desktop(browser);
    if (!only || only === 'portrait') await phone(browser, 'portrait', { width: 390, height: 844 });
    if (!only || only === 'landscape') await phone(browser, 'landscape', { width: 844, height: 390 });
    if (!only || only === 'nostorage') await noStorage(browser);
  } catch (e) {
    fail('exception: ' + (e.stack || e.message));
  }
  await browser.close();
  console.log('\n' + (failures.length ? 'CORE SYSTEMS FAILED (' + failures.length + '):\n  ' + failures.join('\n  ') : 'CORE SYSTEMS PASSED'));
  process.exit(failures.length ? 1 : 0);
})();
