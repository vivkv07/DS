/* NOSTALGIA — tests/vehicles_v2.cjs  (vehicles agent: amendments A2 potholes + A3 age-appropriate vehicles)
 * Headless Chromium, index.html#debug, REAL key input for riding / ACTION:
 *   types     the new types exist with their stats, labels, spawn weights, kid rules
 *   ride      ride every allowed type with real keys (W / D / S / E): top speeds, acceleration, steering,
 *             braking, the kid's Scooty wobble, the kid-at-the-wheel auto (slower + autowalas shout);
 *             close-up art screenshots by day and by night
 *   refuse    every disallowed type refuses with a kid line (and debug allowHeavy still drives them)
 *   passenger pillion / passenger / bus / fare rides with an NPC driver, "Ask to stop", Bunty-anna's RX100
 *   potholes  stubbed N.world.potholeAt when world.js has none: slowdown, jolt, shake, sound, wet splash,
 *             traffic, walking stumble, puncture / fall probabilities over many trials, missing API = none
 *   ladder    30 finds -> Akka's Scooty (unlock_scooty + unlock_chetak), 60 -> Bunty pillion + Hercules gears,
 *             old saves (unlock_chetak) -> unlock_scooty
 *   traffic   trafficMix / patched traffic mix, live traffic uses the new types, parked cycle stands
 *   audio     scooty engine profile, Hero vs Hercules bells, the pothole sound (dry + wet) rendered offline
 *   node nostalgia/tests/vehicles_v2.cjs      ONLY=types,ride,refuse,passenger,potholes,ladder,traffic,audio
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.indexOf(k) >= 0;
const failures = [];
let section = '';
const ok = (msg) => console.log('  ok   ' + msg);
const fail = (msg) => { failures.push('[' + section + '] ' + msg); console.log('  FAIL ' + msg); };
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); return !!cond; };
// Game-clock waits (robust on a loaded machine, where a wall-clock sleep sees fewer game frames):
// window.__gw(secs) resolves after `secs` of GAME time (N.time.now); while the game clock is stopped
// (title, pause menu) it counts frame time (N.time.real) instead. Both advance only as frames run, so a
// slow machine just takes longer. The wall-clock cap (8x + 5 s) only stops a hung page from hanging the suite.
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
const gwait = (pg, secs) => pg.evaluate((s) => window.__gw(s), secs);

async function boot(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.addInitScript(GW);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  // three.js for the 3D view: the vendored copy at the CDN URL (hermetic, as tests/view3d.cjs does)
  const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  // PIN_FILES=src/world.js,...: serve those files as committed (git HEAD), to test this module while other
  // agents have a half-edited copy of theirs on disk
  for (const f of (process.env.PIN_FILES || '').split(',').filter(Boolean)) {
    const body = require('child_process').execSync('git -C "' + ROOT + '" show HEAD:./' + f, { maxBuffer: 64 << 20 }).toString();
    await page.route('**/' + f, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body }));
    console.log('       (pinned ' + f + ' to git HEAD)');
  }
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  await page.click('#title-start').catch(() => {});
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.skipDialogue(true); });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 8000 });
  await page.evaluate(() => {
    window.__ev = [];
    for (const k of ['vehicle:pothole', 'vehicle:refused', 'vehicle:ride', 'vehicle:puncture', 'player:fall', 'player:stumble', 'bus:board', 'vehicle:autoShout', 'player:enterVehicle', 'player:exitVehicle', 'auto:hail']) N.on(k, (d) => window.__ev.push([k, d && d.vehicle ? d.vehicle.type : null, d && d.line ? d.line : d && d.as ? d.as : null, d && d.wet != null ? d.wet : null, d && d.player != null ? d.player : null]));
    // record shakes and sounds (headless has no audio device: record the calls themselves)
    window.__shakes = []; window.__sfx = [];
    const sh = N.render.shake; N.render.shake = function (a, t) { window.__shakes.push([a, t]); return sh.apply(this, arguments); };
    const sf = N.audio.sfx; N.audio.sfx = function (name, o) { window.__sfx.push([name, o ? Object.assign({}, o) : {}]); return sf.apply(this, arguments); };
  });
  return { context, page, errors };
}
// a fresh game, traffic off, noon, god mode, a lot of money
const fresh = (page, o) => page.evaluate((o) => {
  if (N.shops && N.shops.isOpen()) N.shops.close();
  if (N.missions.active) N.missions.abort();
  N.debug.newGame({ skipIntro: true }); N.debug.skipDialogue(true);
  N.player.money = 100000; N.debug.god(true);
  N.debug.setTime(o && o.h != null ? o.h : 12, 0); N.debug.freezeClock(true);
  if (N.traffic && !(o && o.traffic)) { N.traffic.enabled = false; N.traffic.clear(); }
  if (N.wanted && N.wanted.set) N.wanted.set(0);
  window.__ev.length = 0; window.__shakes.length = 0; window.__sfx.length = 0;
  N.vehicles.allowHeavy = false;
  // world.js' real potholes stay off unless asked for (o.pot): the handling numbers must not depend on
  // whether the test road happens to have a pothole on its line this week
  if (!('__worldPot' in window)) window.__worldPot = typeof N.world.potholeAt === 'function' ? N.world.potholeAt : null;
  N.world.potholeAt = o && o.pot && window.__worldPot ? window.__worldPot : () => null;
  return N.state.mode;
}, o || {});
// wait for n simulation steps (a loaded machine can render at a few fps: never trust a fixed sleep for
// "the interact system has caught up")
const frames = (page, n) => page.evaluate((n) => new Promise((res) => { const f0 = N.time.frame, t0 = performance.now(); (function chk() { if (N.time.frame - f0 >= n || performance.now() - t0 > 6000) res(); else requestAnimationFrame(chk); })(); }), n || 4);
const label = async (page) => { await frames(page, 4); return page.evaluate(() => N.input.actionLabel); };
// wait until `secs` of GAME time have passed (key holds measured in game time, not wall-clock time)
const gameWait = (page, secs) => page.evaluate((secs) => new Promise((res) => { const g0 = N.time.now, t0 = performance.now(); (function chk() { if (N.time.now - g0 >= secs || performance.now() - t0 > secs * 1000 * 8 + 4000) res(N.time.now - g0); else requestAnimationFrame(chk); })(); }), secs);
async function checkErrors(page, errors, where) {
  const ne = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + e.msg.split('\n')[0]));
  check(errors.length === 0 && ne.length === 0, 'no console / page / engine errors (' + where + ')', { console: errors.slice(0, 5), engine: ne.slice(0, 5) });
}
// a long straight clear road (the ride section drives up to ~480 u along it)
async function findRoad(page) {
  return page.evaluate(() => {
    const S = N.SURF, roads = N.WORLD_DATA.roads;
    let best = null;
    for (const r of roads) {
      if (!/arterial|bund|street/.test(r.kind)) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 560) continue;
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
        let clear = true;
        for (let d = 40; d < 520 && clear; d += 6) {
          for (const off of [-10, 0, 10]) {
            const s = N.world.surfaceAt(a[0] + ux * d - uy * off, a[1] + uy * d + ux * off);
            if (s !== S.ROAD && s !== S.BRIDGE) { clear = false; break; }
          }
        }
        if (clear && (!best || L > best.L)) best = { x: a[0] + ux * 40, y: a[1] + uy * 40, angle: Math.atan2(uy, ux), L, id: r.id, ux, uy };
      }
    }
    window.__road = best;
    return best;
  });
}
// park a vehicle just ahead-left of the player on the road, pointing down it
const parkAhead = (page, type, opts) => page.evaluate(({ type, opts }) => {
  const r = window.__road;
  N.vehicles.list.slice().forEach((v) => { if (!v.seeded) N.vehicles.remove(v); });
  N.player.teleport(r.x, r.y); N.player.angle = r.angle;
  const T = N.vehicles.TYPES[type];
  const lx = Math.sin(r.angle), ly = -Math.cos(r.angle);
  const o = Object.assign({ seed: 4242 }, opts || {});
  if (o.driver === 'npc') o.driver = { look: N.people.randomLook(null, 'man'), npc: true };
  const v = N.vehicles.spawn(type, r.x + Math.cos(r.angle) * 4 + lx * (T.d / 2 + 6), r.y + Math.sin(r.angle) * 4 + ly * (T.d / 2 + 6), r.angle, o);
  window.__v = v;
  return { d: N.vehicles.distTo(v, N.player.x, N.player.y) };
}, { type, opts });
// close-up camera that follows a vehicle (art screenshots)
const closeCam = (page, on, zoom) => page.evaluate(({ on, zoom }) => {
  const i = N.systems.list.findIndex((q) => q.id === '__closecam');
  if (i >= 0) N.systems.list.splice(i, 1);
  N.render.camOverride = null;
  if (on) N.addSystem({ id: '__closecam', order: 59, runIn: ['*'], update() { const v = window.__v; if (v) N.render.camOverride = { x: v.x, y: v.y, zoom: zoom || 4, snap: true }; } });
}, { on, zoom });

async function main() {
  const browser = await chromium.launch();
  const { page, errors } = await boot(browser);
  const shot = (n) => page.screenshot({ path: path.join(OUT, 'v2_' + n + '.png') });
  const road = await findRoad(page);
  section = 'setup';
  check(!!road, 'found a long straight road to ride on', road && { id: road.id, L: Math.round(road.L) });

  /* ------------------------------------------------------------------ types */
  if (want('types')) {
    section = 'types';
    console.log('\n== A3 vehicle types');
    await fresh(page);
    const t = await page.evaluate(() => {
      const T = N.vehicles.TYPES, V = N.vehicles, o = {};
      for (const k of ['hero_cycle', 'hercules_cycle', 'hercules_gears', 'scooty', 'akka_scooty', 'cycle', 'bsa_cycle', 'ladiescycle', 'kid_cycle', 'auto', 'chinnu_cycle', 'luna', 'chetak', 'family_chetak', 'rx100', 'bunty_rx100', 'ambassador', 'maruti800', 'padmini', 'bus', 'lorry', 'boat', 'rickshaw']) {
        const x = T[k]; if (!x) { o[k] = null; continue; }
        o[k] = { name: x.name, short: x.short, top: x.maxSpeed, accel: x.accel, brake: x.brake, turn: x.turn, mass: x.mass, kid: V.canDrive(k), spawn: x.spawn, sound: x.sound, bell: x.bell, refuse: !!x.refuse };
      }
      return o;
    });
    check(t.hero_cycle && t.hero_cycle.name === 'Hero cycle' && t.hero_cycle.top === 110 && t.hero_cycle.mass > t.cycle.mass && t.hero_cycle.brake < t.cycle.brake, 'hero_cycle: the heavy black roadster, 110 u/s, rod brakes (weaker), heavier', t.hero_cycle);
    check(t.hercules_cycle && t.hercules_cycle.top === 120 && t.hercules_cycle.accel > t.hero_cycle.accel && t.hercules_cycle.mass < t.hero_cycle.mass && t.hercules_cycle.turn > t.hero_cycle.turn, 'hercules_cycle: lighter and quicker, 120 u/s, turns sharper', t.hercules_cycle);
    check(t.scooty && t.scooty.top >= 115 && t.scooty.top <= 125 && t.scooty.mass < t.chetak.mass && t.scooty.sound === 'scooty', 'scooty: 115-125 u/s, light, its own engine voice', t.scooty);
    const allowed = ['hero_cycle', 'hercules_cycle', 'hercules_gears', 'scooty', 'akka_scooty', 'cycle', 'bsa_cycle', 'ladiescycle', 'kid_cycle', 'auto', 'chinnu_cycle'];
    // the cycle-rickshaw (traffic.js, based on 'cycle'): the rickshaw-wala pedals it, never Chinnu (A5)
    const denied = ['luna', 'chetak', 'family_chetak', 'rx100', 'bunty_rx100', 'ambassador', 'maruti800', 'padmini', 'bus', 'lorry', 'boat', 'rickshaw'];
    check(allowed.every((k) => t[k] && t[k].kid), 'A3: Chinnu may drive ' + allowed.join(', '), allowed.filter((k) => !(t[k] && t[k].kid)));
    check(denied.every((k) => t[k] && !t[k].kid && t[k].refuse), 'A3: he may not drive ' + denied.join(', ') + ' (each has kid refusal lines)', denied.filter((k) => !(t[k] && !t[k].kid)));
    check(t.hero_cycle.spawn && t.hero_cycle.spawn.colony > 0 && t.hercules_cycle.spawn.osmania > 0 && t.scooty.spawn.posh > 0, 'spawn weights per district style on TYPES (traffic reads them)', { hero: t.hero_cycle.spawn, herc: t.hercules_cycle.spawn, scooty: t.scooty.spawn });
    check(t.hero_cycle.bell === 'hero' && t.hercules_cycle.bell === 'hercules', 'the Hero bell vs the Hercules bell', [t.hero_cycle.bell, t.hercules_cycle.bell]);
    // labels the HUD shows next to each (parked) type
    const labels = {};
    for (const [type, exp] of [['hero_cycle', 'Ride Hero cycle'], ['hercules_cycle', 'Ride Hercules'], ['scooty', 'Ride Scooty'], ['auto', 'Drive auto']]) {
      await parkAhead(page, type);
      await gwait(page, 0.18);
      labels[type] = await label(page);
      check(labels[type] === exp, type + ': ACTION label "' + labels[type] + '"', exp);
    }
    await checkErrors(page, errors, 'types');
  }

  /* ------------------------------------------------------------------ ride (real keys) */
  const rides = {};
  if (want('ride') && road) {
    section = 'ride';
    console.log('\n== ride every allowed type with real keys');
    for (const type of ['hero_cycle', 'hercules_cycle', 'scooty', 'auto', 'cycle', 'ladiescycle', 'kid_cycle']) {
      await fresh(page);
      const st0 = await parkAhead(page, type);
      await gwait(page, 0.18);
      const lb = await label(page);
      await page.keyboard.press('KeyE');
      await frames(page, 6); await gwait(page, 0.05);
      let st = await page.evaluate(() => ({ veh: N.player.vehicle && N.player.vehicle.type, drv: N.player.vehicle && N.player.vehicle.driver === N.player }));
      check(st.veh === type && st.drv, type + ': "' + lb + '" + E gets him on (d=' + st0.d.toFixed(1) + ')', st);
      // full throttle down the road for 4 s: top speed, time to 80 u/s, max kid wobble
      await page.evaluate(() => {
        const v = window.__v; window.__rec = { t0: N.time.now, max: 0, t80: null, wob: 0, x0: v.x, y0: v.y, a0: v.angle };
        N.addSystem({ id: '__rec', order: 31, runIn: ['play'], update() { const v = window.__v, R = window.__rec; if (!v) return; R.max = Math.max(R.max, v.speed); if (R.t80 == null && v.speed >= 80) R.t80 = N.time.now - R.t0; R.wob = Math.max(R.wob, Math.abs(v.wobble || 0));
          // exact game-time windows from the first step the key registers: 0.2 s of A (yaw), 0.5 s of S (brake)
          if (R.steer && R.sT == null && v.ctl.steer < -0.5) { R.sT = N.time.now; R.sA = v.angle; }
          if (R.sT != null && R.da == null && N.time.now - R.sT >= 0.2) R.da = -N.util.angleDiff(R.sA, v.angle);
          if (R.brake && R.bT == null && v.ctl.throttle < -0.5) { R.bT = N.time.now; R.bS = v.speed; }
          if (R.bT != null && R.bd == null && N.time.now - R.bT >= 0.5) R.bd = R.bS - v.speed;
        } });
      });
      await page.keyboard.down('KeyW');
      await gameWait(page, 4);
      st = await page.evaluate(() => { const v = window.__v, R = window.__rec; return { max: R.max, t80: R.t80, wob: R.wob, top: v.T.maxSpeed, along: (v.x - R.x0) * Math.cos(R.a0) + (v.y - R.y0) * Math.sin(R.a0), shout: window.__ev.filter((e) => e[0] === 'vehicle:autoShout').length }; });
      rides[type] = st;
      // brake on the straight: exactly 0.5 s of game time from the first step S registers
      await page.keyboard.up('KeyW');
      st.s0 = await page.evaluate(() => { window.__rec.brake = true; return window.__v.speed; });
      await page.keyboard.down('KeyS'); await page.waitForFunction(() => window.__rec.bd != null, null, { timeout: 20000 }).catch(() => {});
      st.brake = await page.evaluate(() => window.__rec.bd || 0);
      await page.keyboard.up('KeyS');
      await page.keyboard.down('KeyW'); await gameWait(page, 1.5);
      // steer at speed: yaw over 0.2 s (game time) of A (towards the kerb: sd_rd has lamp posts on its median),
      // then D back; a wall bump in the window would spin the bike, so it is recorded
      await page.evaluate(() => { window.__bumped = 0; window.__bh = (d) => { if (d && d.wall && (d.vehicle === window.__v || d.a === window.__v)) window.__bumped++; }; N.on('bump', window.__bh); window.__rec.steer = true; });
      await page.keyboard.down('KeyA'); await page.waitForFunction(() => window.__rec.da != null, null, { timeout: 20000 }).catch(() => {});
      st.da = await page.evaluate(() => window.__rec.da || 0);
      await page.keyboard.up('KeyA');
      await page.keyboard.down('KeyD'); await gameWait(page, 0.2); await page.keyboard.up('KeyD');
      st.bumped = await page.evaluate(() => { N.off('bump', window.__bh); return window.__bumped; });
      await page.keyboard.up('KeyW');
      // horn (bell / peep / pom-pom), then stop and get off with E
      await page.keyboard.press('Space');
      await page.keyboard.down('KeyS'); await gwait(page, 1.3); await page.keyboard.up('KeyS');
      await page.keyboard.press('KeyE');
      await frames(page, 6); await gwait(page, 0.055);
      const off = await page.evaluate(() => ({ veh: !!N.player.vehicle, mode: N.player.mode, walk: N.world.isWalkable(N.player.x, N.player.y) }));
      await page.evaluate(() => { const i = N.systems.list.findIndex((q) => q.id === '__rec'); if (i >= 0) N.systems.list.splice(i, 1); });
      console.log('       ' + type + ': top ' + st.max.toFixed(1) + '/' + st.top + ', 0-80 ' + (st.t80 == null ? '—' : st.t80.toFixed(2) + ' s') + ', yaw ' + st.da.toFixed(2) + ' rad, brake -' + st.brake.toFixed(0) + ' u/s in 0.5 s' + (st.wob ? ', wobble ' + st.wob.toFixed(2) : ''));
      check(st.along > 150 && st.max > st.top * 0.8 && st.max <= st.top * 1.03, type + ': W rides up to ' + st.max.toFixed(0) + ' u/s (top ' + st.top + ')', st);
      check(st.da > 0.08 && st.brake > 30 && !st.bumped, type + ': A steers (' + st.da.toFixed(2) + ' rad in 0.2 s), S brakes (-' + st.brake.toFixed(0) + '), no wall hit', st);
      check(!off.veh && off.mode === 'foot' && off.walk, type + ': E gets him off', off);
    }
    if (rides.hero_cycle && rides.hercules_cycle) {
      check(rides.hercules_cycle.max > rides.hero_cycle.max + 4, 'Hercules is quicker than the Hero (' + rides.hercules_cycle.max.toFixed(0) + ' vs ' + rides.hero_cycle.max.toFixed(0) + ' u/s)');
      check(rides.hercules_cycle.t80 != null && (rides.hero_cycle.t80 == null || rides.hercules_cycle.t80 < rides.hero_cycle.t80), 'Hercules gets to 80 u/s sooner (' + (rides.hercules_cycle.t80 || 0).toFixed(2) + ' s vs ' + (rides.hero_cycle.t80 || 0).toFixed(2) + ' s): the Hero is heavy');
      check(rides.hercules_cycle.da > rides.hero_cycle.da, 'Hercules turns sharper (' + rides.hercules_cycle.da.toFixed(2) + ' vs ' + rides.hero_cycle.da.toFixed(2) + ' rad): the Hero is steady');
      check(rides.hercules_cycle.brake > rides.hero_cycle.brake, 'Hero rod brakes are weaker (' + rides.hero_cycle.brake.toFixed(0) + ' vs ' + rides.hercules_cycle.brake.toFixed(0) + ')');
    }
    if (rides.scooty) check(rides.scooty.max >= 108 && rides.scooty.wob > 0.05, 'Scooty: ' + rides.scooty.max.toFixed(0) + ' u/s with a kid, wobbly near the top (wobble ' + rides.scooty.wob.toFixed(2) + ')', rides.scooty);
    if (rides.auto) check(rides.auto.max < 135 * 0.85 && rides.auto.max > 70, 'kid at the wheel: the auto tops out slower (' + rides.auto.max.toFixed(0) + ' of 135)', rides.auto);

    // autowalas shout when he drives one
    await fresh(page);
    await parkAhead(page, 'auto');
    const shout = await page.evaluate(async () => {
      const v = window.__v, r = window.__road;
      N.vehicles.enter(N.player, v);
      // an autowala idling alongside
      const o = N.vehicles.spawn('auto', v.x - Math.sin(r.angle) * 18, v.y + Math.cos(r.angle) * 18, r.angle, { driver: { look: N.people.randomLook(null, 'man'), npc: true } });
      o.controller = (q) => { q.ctl.throttle = 0; q.ctl.brake = true; q.ctl.steer = 0; };
      window.__auto2 = o;
      return true;
    });
    void shout;
    let shouted = false;
    for (let i = 0; i < 32 && !shouted; i++) { await gwait(page, 0.5); shouted = await page.evaluate(() => window.__ev.some((e) => e[0] === 'vehicle:autoShout')); }
    const sl = await page.evaluate(() => (window.__ev.find((e) => e[0] === 'vehicle:autoShout') || [])[1]);
    check(shouted, 'an autowala shouts at the kid driving an auto (' + sl + ')');
    await closeCam(page, true, 4.5);
    await gwait(page, 0.25);
    await shot('auto_kid_shout');
    await closeCam(page, false);

    // art: close-ups of every type ridden by Chinnu and parked, by day and by night
    for (const night of [false, true]) {
      await fresh(page, { h: night ? 21 : 10 });
      for (const type of ['hero_cycle', 'hercules_cycle', 'scooty', 'auto']) {
        await parkAhead(page, type);
        await page.evaluate(() => N.vehicles.enter(N.player, window.__v));
        await page.keyboard.down('KeyW'); await gwait(page, 0.9);
        await page.keyboard.down('KeyD'); await gwait(page, 0.14);
        await closeCam(page, true, 4.5);
        await gwait(page, 0.16);
        await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW');
        await shot('ride_' + type + (night ? '_night' : '_day'));
        await closeCam(page, false);
        await page.evaluate(() => { if (N.player.vehicle) N.vehicles.exit(N.player, true); });
      }
      // a parked line-up with NPC riders
      await page.evaluate(() => {
        const r = window.__road, p = N.player;
        N.vehicles.list.slice().forEach((v) => { if (!v.seeded) N.vehicles.remove(v); });
        p.teleport(r.x, r.y);
        const types = ['hero_cycle', 'hercules_cycle', 'scooty', 'cycle', 'ladiescycle', 'kid_cycle', 'hercules_gears', 'akka_scooty'];
        const lx = Math.sin(r.angle), ly = -Math.cos(r.angle);
        window.__line = types.map((t, i) => N.vehicles.spawn(t, r.x + Math.cos(r.angle) * (30 + (i % 4) * 22) + lx * (Math.floor(i / 4) ? 9 : -9), r.y + Math.sin(r.angle) * (30 + (i % 4) * 22) + ly * (Math.floor(i / 4) ? 9 : -9), r.angle, { driver: i % 3 === 1 ? { look: N.people.randomLook(null, i % 2 ? 'woman' : 'man'), npc: true } : null, seed: 300 + i }));
        window.__v = { x: r.x + Math.cos(r.angle) * 63, y: r.y + Math.sin(r.angle) * 63 };
      });
      await closeCam(page, true, 3.2);
      await gwait(page, 0.5);
      await shot('lineup' + (night ? '_night' : '_day'));
      await closeCam(page, false);
    }
    await checkErrors(page, errors, 'ride');
  }

  /* ------------------------------------------------------------------ refusals */
  if (want('refuse') && road) {
    section = 'refuse';
    console.log('\n== refusals: he is 11');
    await fresh(page);
    for (const type of ['luna', 'chetak', 'family_chetak', 'rx100', 'bunty_rx100', 'ambassador', 'maruti800', 'padmini', 'taxi_ambassador', 'bus', 'lorry', 'rickshaw']) {
      await page.evaluate(() => { window.__ev.length = 0; });
      await parkAhead(page, type);
      await gwait(page, 0.17);
      const lb = await label(page);
      await page.keyboard.press('KeyE');
      await frames(page, 6); await gwait(page, 0.055);
      const r = await page.evaluate(() => ({ veh: N.player.vehicle && N.player.vehicle.type, ref: (window.__ev.find((e) => e[0] === 'vehicle:refused') || [])[2], toasts: N.hud.toastQueue() }));
      check(!r.veh && lb === 'Too small to drive' && !!r.ref && r.toasts.some((t) => t === String(r.ref).replace(/\*([^*]+)\*/g, '$1')), type + ': "' + lb + '" -> "' + r.ref + '"', r);
    }
    // the family Chetak line is Nanna's; the VIP car is "Nakko"; a boat on the water refuses too
    const misc = await page.evaluate(() => {
      const V = N.vehicles;
      const fc = { T: V.TYPES.family_chetak, seed: 1 };
      const boat = V.spawn('boat', 10, 10, 0, {}); const ob = V.offerFor(boat); V.remove(boat);
      return { fam: V.REFUSE.family_chetak, famLine: V.refusalFor(Object.assign({ seed: 0 }, fc)), boat: ob };
    });
    check(/Nanna will kill me/.test(misc.fam.join(' ')) && misc.boat && misc.boat.kind === 'refuse', 'kid lines: "' + misc.fam[0] + '"; boats refuse without the boatman', misc);
    await parkAhead(page, 'govt_ambassador');
    await gwait(page, 0.17);
    check((await label(page)) === 'Nakko', 'the VIP Ambassador is still "Nakko"');
    // debug: allowHeavy drives anything, and N.debug.enterVehicle always works
    await page.evaluate(() => { N.vehicles.allowHeavy = true; });
    await parkAhead(page, 'chetak');
    await gwait(page, 0.17);
    const dl = await label(page);
    await page.keyboard.press('KeyE');
    await frames(page, 6); await gwait(page, 0.05);
    const dv = await page.evaluate(() => { const t = N.player.vehicle && N.player.vehicle.type; if (N.player.vehicle) N.vehicles.exit(N.player, true); N.vehicles.allowHeavy = false; const v = N.debug.enterVehicle('lorry'); const t2 = N.player.vehicle === v; N.vehicles.exit(N.player, true); return { t, t2 }; });
    check(dl === 'Ride Chetak' && dv.t === 'chetak' && dv.t2, 'debug: N.vehicles.allowHeavy -> "' + dl + '"; N.debug.enterVehicle(lorry) works', dv);
    await checkErrors(page, errors, 'refuse');
  }

  /* ------------------------------------------------------------------ passenger / pillion */
  if (want('passenger') && road) {
    section = 'passenger';
    console.log('\n== rides with a grown-up at the controls');
    await fresh(page);
    // a stranger's Chetak cruising at ~30 u/s: "Ask for a lift"
    await parkAhead(page, 'chetak', { driver: 'npc' });
    await page.evaluate(() => { window.__v.controller = (v) => { v.ctl.brake = false; v.ctl.steer = 0; v.ctl.throttle = v.speed < 26 ? 0.5 : 0; }; });
    await gwait(page, 0.12);
    const ll = await label(page);
    await page.keyboard.press('KeyE');
    await gwait(page, 0.9);
    let r = await page.evaluate(() => { const p = N.player, v = window.__v; return { on: p.vehicle === v, as: p.passenger, pill: v.pillion === p, drv: !!v.driver && v.driver !== p, d: Math.hypot(p.x - v.x, p.y - v.y), sp: v.speed, isP: N.vehicles.isPassenger() }; });
    check(ll === 'Ask for a lift' && r.on && r.as === 'pillion' && r.pill && r.drv && r.d < 0.5 && r.sp > 15, 'stranger\'s Chetak: "' + ll + '" -> riding pillion behind the uncle (moving ' + r.sp.toFixed(0) + ' u/s)', r);
    await closeCam(page, true, 4.5); await gwait(page, 0.2); await shot('pillion_chetak'); await closeCam(page, false);
    const sl = await label(page);
    await page.keyboard.press('KeyE');
    await gwait(page, 1.6);
    r = await page.evaluate(() => { const p = N.player, v = window.__v; return { on: !!p.vehicle, mode: p.mode, drv: !!v.driver, pill: v.pillion, walk: N.world.isWalkable(p.x, p.y) }; });
    check(sl === 'Ask to stop' && !r.on && r.mode === 'foot' && r.drv && !r.pill && r.walk, '"' + sl + '": the uncle stops, he gets down, the uncle rides on', r);
    // a bus: "Board bus ₹3" (slow) and footboard (fast)
    await parkAhead(page, 'bus', { driver: 'npc' });
    await page.evaluate(() => { window.__v.controller = (v) => { v.ctl.brake = false; v.ctl.steer = 0; v.ctl.throttle = v.speed < 6 ? 0.3 : 0; }; });
    await gwait(page, 0.15);
    const bl = await label(page);
    const m0 = await page.evaluate(() => N.player.money);
    await page.keyboard.press('KeyE');
    await frames(page, 6); await gwait(page, 0.075);
    r = await page.evaluate((m0) => ({ on: N.player.vehicle === window.__v, as: N.player.passenger, paid: m0 - N.player.money, board: (window.__ev.find((e) => e[0] === 'bus:board') || [])[1] }), m0);
    check(bl === 'Board bus ₹3' && r.on && r.as === 'passenger' && r.paid === 300, 'city bus: "' + bl + '" -> a passenger, ₹3 paid', r);
    await page.keyboard.press('KeyE');
    await frames(page, 6); await gwait(page, 0.075);
    check(await page.evaluate(() => !N.player.vehicle), 'E at a crawl: gets down from the bus at once');
    // the family Chetak with Nanna at the controls: "Sit pillion" (rideOk)
    await parkAhead(page, 'family_chetak', { driver: 'npc' });
    await gwait(page, 0.15);
    const fl = await label(page);
    await page.keyboard.press('KeyE');
    await frames(page, 6); await gwait(page, 0.0625);
    r = await page.evaluate(() => ({ on: N.player.vehicle === window.__v, as: N.player.passenger }));
    check(fl === 'Sit pillion' && r.on && r.as === 'pillion', 'Nanna\'s Chetak with Nanna on it: "' + fl + '"', r);
    await page.evaluate(() => N.vehicles.exit(N.player, true));
    // a stranger's car: no lifts from strangers
    await page.evaluate(() => { window.__ev.length = 0; });
    await parkAhead(page, 'ambassador', { driver: 'npc' });
    await gwait(page, 0.15);
    const cl = await label(page);
    await page.keyboard.press('KeyE');
    await frames(page, 6); await gwait(page, 0.0625);
    r = await page.evaluate(() => ({ on: !!N.player.vehicle, line: (window.__ev.find((e) => e[0] === 'vehicle:refused') || [])[2] }));
    check(cl === 'Ask for a lift' && !r.on && /stranger|Small boys/.test(r.line || ''), 'a stranger\'s Ambassador: "' + cl + '" -> "' + r.line + '"', r);
    // a working traffic auto: "Ride auto (fare)" -> the fare card (shops.js)
    await parkAhead(page, 'auto', { driver: 'npc' });
    await page.evaluate(() => { window.__v.trafficOwned = true; });
    await gwait(page, 0.15);
    const al = await label(page);
    await page.keyboard.press('KeyE');
    await frames(page, 6); await gwait(page, 0.1);
    r = await page.evaluate(() => ({ cur: N.shops.current, hail: !!N.shops.autoJob, rows: N.shops.debug.UI.items.map((it) => it.row.id).slice(0, 4) }));
    check(al === 'Ride auto (fare)' && r.cur && r.cur.kind === 'auto_ride' && r.hail, 'a traffic auto with its driver: "' + al + '" -> the fare card (meter + das upar)', r);
    await shot('fare_card');
    await page.keyboard.press('Escape');
    await gwait(page, 0.3);
    // a cycle-rickshaw with its rickshaw-wala: "Ride rickshaw (fare)" -> the same fare card, he is not at the pedals
    await page.evaluate(() => { N.shops.close(); const SS = N.shops.debug.S; if (SS.hail && SS.hail.v) N.vehicles.remove(SS.hail.v); SS.hail = null; });
    await parkAhead(page, 'rickshaw', { driver: 'npc' });
    await page.evaluate(() => { const v = window.__v; v.trafficOwned = true; v.controller = (q) => { q.ctl.brake = true; q.ctl.throttle = 0; }; });
    await gwait(page, 0.15);
    const rl = await label(page);
    await page.keyboard.press('KeyE');
    await frames(page, 6); await gwait(page, 0.1);
    r = await page.evaluate(() => ({ cur: N.shops.current, onVeh: !!N.player.vehicle, drv: !!window.__v.driver && window.__v.driver !== N.player }));
    check(rl === 'Ride rickshaw (fare)' && r.cur && r.cur.kind === 'auto_ride' && !r.onVeh && r.drv, 'a cycle-rickshaw with its rickshaw-wala: "' + rl + '" -> the fare card; the rickshaw-wala keeps the pedals', r);
    await page.keyboard.press('Escape');
    await gwait(page, 0.3);
    // Bunty-anna's RX100 (60 finds): STD call, then pillion
    const bu = await page.evaluate(async () => {
      N.shops.close();
      // the auto from the fare card is still waiting at the kerb: send it away
      const SS = N.shops.debug.S; if (SS.hail && SS.hail.v) N.vehicles.remove(SS.hail.v); SS.hail = null;
      N.flags.unlock_rx100 = true;
      N.calendar.set(2003, 1, 20, 17, 0); N.debug.freezeClock(true);
      const r = window.__road; N.player.teleport(r.x + Math.cos(r.angle) * 200, r.y + Math.sin(r.angle) * 200);
      const row = N.shops.rows('std_1').find((x) => x.id === 'call_bunty');
      const why = N.shops.buntyWhy();
      const called = N.shops.callBunty();
      if (N.shops.debug.S.bunty) N.shops.debug.S.bunty.t = 0.05;
      return { row: !!row, why, called };
    });
    let bj = null;
    for (let i = 0; i < 40; i++) {
      await gwait(page, 0.5);
      bj = await page.evaluate(() => {
        const J = N.shops.buntyJob, v = J && J.vehicle;
        // he pulls up at the kerb: walk over to the bike (the card opens within ~46 u)
        if (J && J.arrived && v && !N.shops.isOpen() && Math.hypot(v.x - N.player.x, v.y - N.player.y) > 40) { const f = N.world.findFree(v.x + 12, v.y, 'walk', 10); if (f) N.player.teleport(f.x, f.y); }
        return { job: J ? { arrived: J.arrived, type: v && v.type } : null, cur: N.shops.current };
      });
      if (bj.cur && bj.cur.kind === 'bunty_ride') break;
    }
    check(bu.row && !bu.why && bu.called && bj && bj.job && bj.job.type === 'bunty_rx100' && bj.cur && bj.cur.kind === 'bunty_ride', 'STD "Call Bunty-anna" (60 finds): his RX100 arrives, the pillion card opens', { bu, bj });
    await shot('bunty_card');
    await page.keyboard.press('Escape');
    await gwait(page, 0.3);
    await page.evaluate(() => { if (N.shops.isOpen()) N.shops.close(); });
    await checkErrors(page, errors, 'passenger');
  }

  /* ------------------------------------------------------------------ potholes */
  if (want('potholes') && road) {
    section = 'potholes';
    console.log('\n== A2 potholes');
    await fresh(page);
    const had = await page.evaluate(() => !!window.__worldPot);
    console.log('       N.world.potholeAt from world.js: ' + (had ? 'present (stubbed over for the test)' : 'missing (stubbed for the test)'));
    // a deterministic stub with potholes placed down the test road
    await page.evaluate(() => {
      window.__realPot = N.world.potholeAt;
      window.__pots = [];
      N.world.potholeAt = (x, y) => { for (const p of window.__pots) if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) < p.r * p.r) return p; return null; };
      const r = window.__road;
      window.__potAt = (d, off, o) => { const p = Object.assign({ x: r.x + Math.cos(r.angle) * d - Math.sin(r.angle) * (off || 0), y: r.y + Math.sin(r.angle) * d + Math.cos(r.angle) * (off || 0), r: 4.5, depth: 1 }, o || {}); window.__pots.push(p); return p; };
    });
    // ride the Hero into one at ~100 u/s with real keys
    await parkAhead(page, 'hero_cycle');
    await page.evaluate(() => {
      const v = window.__v, r = window.__road;
      // he rides from the car-park spot: the pothole lies on his line, 230 u ahead
      const ax = (v.x - r.x) * Math.cos(r.angle) + (v.y - r.y) * Math.sin(r.angle), ay = -(v.x - r.x) * Math.sin(r.angle) + (v.y - r.y) * Math.cos(r.angle);
      window.__potAt(ax + 230, ay);
      N.vehicles.enter(N.player, v);
      window.__trace = [];
      N.addSystem({ id: '__ptrace', order: 31, runIn: ['play'], update() { const v = window.__v; if (v && v.driver === N.player) window.__trace.push([N.time.now, v.speed, v.jolt, v.potF, v.potR]); } });
      window.__ev.length = 0; window.__shakes.length = 0; window.__sfx.length = 0;
    });
    await page.keyboard.down('KeyW');
    let hit = null;
    for (let i = 0; i < 40 && !hit; i++) { await gwait(page, 0.15); hit = await page.evaluate(() => window.__ev.find((e) => e[0] === 'vehicle:pothole') || null); }
    await closeCam(page, true, 4.5);
    await gwait(page, 0.06);
    await shot('pothole_jolt');
    await closeCam(page, false);
    await page.keyboard.up('KeyW');
    let p1 = await page.evaluate(() => {
      const tr = window.__trace, i = tr.findIndex((q) => q[2] > 0.3);
      const before = i > 0 ? tr[i - 1][1] : 0, after = i >= 0 ? tr[i][1] : 0;
      return { i, before, after, ratio: after / Math.max(1, before), jolt: i >= 0 ? tr[i][2] : 0, shakes: window.__shakes.slice(), sfx: window.__sfx.filter((s) => s[0] === 'pothole').map((s) => ({ vol: +(s[1].vol || 0).toFixed(2), variant: s[1].variant || null })), ev: window.__ev.filter((e) => e[0] === 'vehicle:pothole') };
    });
    check(!!hit && p1.ev.length >= 1 && p1.ev[0][4] === true, 'riding into a pothole fires vehicle:pothole for the player\'s Hero', p1.ev);
    check(p1.ratio < 0.92 && p1.ratio > 0.7, 'speed loss: ' + p1.before.toFixed(0) + ' -> ' + p1.after.toFixed(0) + ' u/s (x' + p1.ratio.toFixed(2) + ', A2: x0.82 at full depth and top speed)', p1);
    check(p1.jolt >= 0.55, 'vehicle.jolt = ' + p1.jolt.toFixed(2) + ' (the renderer bobs the body; it decays)', p1.jolt);
    check(p1.shakes.length >= 1 && p1.shakes[0][0] > 0.5 && p1.shakes[0][0] <= 1.5, 'N.render.shake(' + (p1.shakes[0] ? p1.shakes[0][0].toFixed(2) : '?') + ') for the player (max 1.5)', p1.shakes);
    check(p1.sfx.length >= 1 && p1.sfx[0].vol > 0.4 && !p1.sfx[0].variant, 'sfx "pothole" (DHADAK, vol ' + (p1.sfx[0] ? p1.sfx[0].vol : '?') + ' with speed), dry', p1.sfx);
    const jd = await page.evaluate(async () => { await __gw(0.7); return window.__v.jolt; });
    check(jd < 0.05, 'the jolt decays back to 0 (' + jd.toFixed(2) + ')');
    // slower ride: a softer thud
    // wet after rain: a splash variant + muddy drops
    await page.evaluate(() => {
      const i = N.systems.list.findIndex((q) => q.id === '__ptrace'); if (i >= 0) N.systems.list.splice(i, 1);
      N.vehicles.exit(N.player, true);
      N.flags.rain = true;
    });
    await parkAhead(page, 'scooty');
    await page.evaluate(() => {
      const v = window.__v, r = window.__road;
      const ax = (v.x - r.x) * Math.cos(r.angle) + (v.y - r.y) * Math.sin(r.angle), ay = -(v.x - r.x) * Math.sin(r.angle) + (v.y - r.y) * Math.cos(r.angle);
      window.__pots.length = 0; window.__potAt(ax + 120, ay);
      N.vehicles.enter(N.player, v);
      window.__ev.length = 0; window.__sfx.length = 0;
    });
    await page.keyboard.down('KeyW');
    let wet = null;
    for (let i = 0; i < 30 && !wet; i++) { await gwait(page, 0.15); wet = await page.evaluate(() => window.__ev.find((e) => e[0] === 'vehicle:pothole') || null); }
    await closeCam(page, true, 4.5); await gwait(page, 0.04); await shot('pothole_wet'); await closeCam(page, false);
    await page.keyboard.up('KeyW');
    const ws = await page.evaluate(() => ({ sfx: window.__sfx.filter((s) => s[0] === 'pothole').map((s) => s[1].variant || null), drops: N.vehicles.particleCount() }));
    check(!!wet && wet[3] === true && ws.sfx.indexOf('wet') >= 0, 'after rain: a water-filled pothole splashes (sfx variant "wet", ' + ws.drops + ' particles)', { wet, ws });
    // traffic hits potholes too (slowdown + jolt, but no camera shake for the player)
    await page.evaluate(() => {
      N.flags.rain = false;
      N.vehicles.exit(N.player, true);
      const r = window.__road;
      window.__pots.length = 0;
      N.player.teleport(r.x, r.y);
      const t = N.vehicles.spawn('hercules_cycle', r.x + Math.cos(r.angle) * 30, r.y + Math.sin(r.angle) * 30, r.angle, { driver: { look: N.people.randomLook(null, 'student'), npc: true } });
      t.controller = (v) => { v.ctl.throttle = 1; v.ctl.steer = 0; v.ctl.brake = false; };
      window.__potAt(170, 0);
      window.__t = t; window.__ev.length = 0; window.__shakes.length = 0;
    });
    await gwait(page, 2.6);
    const tr = await page.evaluate(() => ({ ev: window.__ev.filter((e) => e[0] === 'vehicle:pothole'), shakes: window.__shakes.length, jolt: window.__t.jolt }));
    check(tr.ev.length >= 1 && tr.ev[0][1] === 'hercules_cycle' && tr.ev[0][4] === false && tr.shakes === 0, 'a traffic Hercules rides through one: jolt + slowdown, no shake for the player', tr);
    // walking: a tiny stumble with real keys
    await page.evaluate(() => {
      N.vehicles.list.slice().forEach((v) => { if (!v.seeded) N.vehicles.remove(v); });
      const r = window.__road;
      window.__pots.length = 0;
      N.player.teleport(r.x, r.y); N.player.angle = r.angle;
      window.__potAt(30, 0, { r: 6 });
      window.__ev.length = 0;
    });
    // walk along the road direction with the arrow keys (pick the key nearest to the road heading)
    const key = await page.evaluate(() => { const a = window.__road.angle, c = Math.cos(a), s = Math.sin(a); return Math.abs(c) > Math.abs(s) ? (c > 0 ? ['ArrowRight'] : ['ArrowLeft']) : (s > 0 ? ['ArrowDown'] : ['ArrowUp']); });
    const along = await page.evaluate(() => { const a = window.__road.angle; return Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? 'x' : 'y'; });
    // put the pothole on the walking line instead (the arrow key walks axis-aligned)
    await page.evaluate((along) => { const r = window.__road, p = N.player; window.__pots.length = 0; const s = along === 'x' ? Math.sign(Math.cos(r.angle)) : Math.sign(Math.sin(r.angle)); window.__pots.push({ x: p.x + (along === 'x' ? 30 * s : 0), y: p.y + (along === 'y' ? 30 * s : 0), r: 6, depth: 0.7, wet: true }); }, along);
    for (const k of key) await page.keyboard.down(k);
    await gwait(page, 1.6);
    for (const k of key) await page.keyboard.up(k);
    const sm = await page.evaluate(() => ({ st: window.__ev.filter((e) => e[0] === 'player:stumble'), splash: window.__sfx.filter((s) => s[0] === 'splash').length }));
    check(sm.st.length >= 1 && sm.splash >= 1, 'walking through a (wet) pothole: a tiny stumble and a splash', sm);
    // probabilities over many trials (the grace periods off): 2.5% punctures on cycles, 2% comic falls above 80% of top speed
    const pr = await page.evaluate(() => {
      const V = N.vehicles, p = N.player, out = {};
      const realFall = p.fall, cd0 = V.TUNE.potholePunctureCD;
      let falls = 0;
      p.fall = () => { falls++; return false; };
      V.TUNE.potholePunctureCD = -1; out.rate = V.TUNE.potholePuncture;
      const trial = (type, frac, n) => {
        const v = N.debug.enterVehicle(type);
        let flats = 0; falls = 0;
        const c0 = window.__ev.length;
        for (let i = 0; i < n; i++) {
          v.flat = false;
          const sp = v.T.maxSpeed * frac;
          v.speed = sp; v.vx = Math.cos(v.angle) * sp; v.vy = Math.sin(v.angle) * sp; v.potCD = 0;
          V.hitPothole(v, { depth: 1, r: 5 });
          if (v.flat) flats++;
        }
        v.flat = false;
        N.vehicles.exit(p, true); N.vehicles.remove(v);
        window.__ev.length = c0;
        return { flats: flats / n, falls: falls / n };
      };
      out.hero = trial('hero_cycle', 0.9, 6000);
      out.heroSlow = trial('hero_cycle', 0.6, 3000);
      out.herc = trial('hercules_cycle', 0.9, 6000);
      out.scooty = trial('scooty', 0.9, 6000);
      out.auto = trial('auto', 0.95, 2000);
      p.fall = realFall; V.TUNE.potholePunctureCD = cd0;
      return out;
    });
    console.log('       trials: ' + JSON.stringify(pr));
    check(Math.abs(pr.hero.flats - pr.rate) < 0.01 && Math.abs(pr.hero.falls - 0.02) < 0.008, 'Hero at 90%: punctures ' + (pr.hero.flats * 100).toFixed(1) + '% (' + (pr.rate * 100).toFixed(1) + '%), falls ' + (pr.hero.falls * 100).toFixed(1) + '% (2%) over 6000 full-depth potholes', pr.hero);
    check(pr.heroSlow.falls === 0 && Math.abs(pr.heroSlow.flats - pr.rate) < 0.012, 'below 80% of top speed: no falls (' + (pr.heroSlow.falls * 100).toFixed(1) + '%)', pr.heroSlow);
    check(pr.herc.flats < pr.hero.flats && pr.herc.flats > 0.003, 'Hercules fat tyres puncture less (' + (pr.herc.flats * 100).toFixed(1) + '%)', pr.herc);
    check(pr.scooty.flats === 0 && Math.abs(pr.scooty.falls - 0.02) < 0.008 && pr.auto.flats === 0 && pr.auto.falls === 0, 'Scooty: no cycle punctures, ' + (pr.scooty.falls * 100).toFixed(1) + '% falls; the auto never throws him', { scooty: pr.scooty, auto: pr.auto });
    // a real fall (never hurt): DHADAAM through the existing falls system
    const realFallR = await page.evaluate(() => {
      const p = N.player; p.god = false;
      const v = N.debug.enterVehicle('hero_cycle');
      const r0 = Math.random; Math.random = () => 0.001; // force the 2% roll
      const sp = v.T.maxSpeed * 0.95; v.speed = sp; v.vx = Math.cos(v.angle) * sp; v.vy = Math.sin(v.angle) * sp; v.potCD = 0;
      N.vehicles.hitPothole(v, { depth: 1, r: 5 });
      Math.random = r0;
      const o = { fallen: !!v.fallen, onFoot: !p.vehicle, energy: p.energy, toasts: N.hud.toastQueue() };
      p.god = true; v.flat = false;
      return o;
    });
    check(realFallR.fallen && realFallR.onFoot && realFallR.toasts.some((t) => /DHADAAM/.test(t)), 'the comic fall: DHADAAM!, the cycle on its side, Chinnu fine', realFallR);
    // missing API: no potholes at all
    await page.evaluate(() => { delete N.world.potholeAt; N.vehicles.list.slice().forEach((v) => { if (!v.seeded) N.vehicles.remove(v); }); window.__ev.length = 0; });
    await parkAhead(page, 'hero_cycle');
    await page.evaluate(() => N.vehicles.enter(N.player, window.__v));
    await page.keyboard.down('KeyW'); await gameWait(page, 2.5); await page.keyboard.up('KeyW');
    const none = await page.evaluate(() => { const n = window.__ev.filter((e) => e[0] === 'vehicle:pothole').length; if (N.player.vehicle) N.vehicles.exit(N.player, true); N.world.potholeAt = () => null; return n; });
    check(none === 0, 'without N.world.potholeAt: potholes do nothing (0 events)');
    // world.js' REAL potholes: ride a Hero with real keys at one of them (straight approach on its road)
    if (had) {
      await fresh(page, { pot: true });
      const rp = await page.evaluate(() => {
        const PH = N.world.potholes, W = N.world, S = N.SURF;
        const list = (PH && PH.list ? PH.list : []).filter((q) => !q.rain && q.depth >= 0.5);
        for (const ph of list) {
          const r = W.nearestRoadPoint(ph.x, ph.y); if (!r || r.dist > 8 || !isFinite(r.angle)) continue;
          const c = Math.cos(r.angle), s = Math.sin(r.angle);
          let ok = true;
          for (let d = -90; d <= 24 && ok; d += 3) for (const off of [-4, 0, 4]) {
            const x = ph.x + c * d - s * off, y = ph.y + s * d + c * off, sf = W.surfaceAt(x, y);
            if ((sf !== S.ROAD) || W.collide(x, y, 3, 'drive').hit || (d < -8 && W.potholeAt(x, y))) { ok = false; break; }
          }
          if (!ok) continue;
          N.vehicles.list.slice().forEach((v) => { if (!v.seeded) N.vehicles.remove(v); });
          N.player.teleport(ph.x - c * 80 + s * 14, ph.y - s * 80 - c * 14);
          const v = N.vehicles.spawn('hero_cycle', ph.x - c * 80, ph.y - s * 80, r.angle, { seed: 7 });
          N.vehicles.enter(N.player, v); window.__v = v;
          window.__realHit = null;
          window.__rh = (d) => { if (d.vehicle === v && !window.__realHit) window.__realHit = { x: d.x, y: d.y, depth: d.depth, sev: d.severity, speed: d.speed, jolt: v.jolt, wheel: d.wheel }; };
          N.on('vehicle:pothole', window.__rh);
          return { id: ph.id, x: ph.x, y: ph.y, r: ph.r, depth: ph.depth, n: list.length };
        }
        return { n: list.length };
      });
      if (rp.id != null) {
        await page.keyboard.down('KeyW');
        await page.waitForFunction(() => !!window.__realHit, null, { timeout: 20000 }).catch(() => {});
        await closeCam(page, true, 4.5); await frames(page, 2); await shot('pothole_real'); await closeCam(page, false);
        await page.keyboard.up('KeyW');
        const rh = await page.evaluate(() => { N.off('vehicle:pothole', window.__rh); if (N.player.vehicle) N.vehicles.exit(N.player, true); return window.__realHit; });
        check(!!rh && Math.hypot(rh.x - rp.x, rh.y - rp.y) < (rp.r || 5) + 5 && rh.jolt >= 0.55 && rh.sev > 0.3, 'a REAL world.js pothole (' + rp.n + ' deep ones on the map; depth ' + (+rp.depth).toFixed(2) + ', r ' + (+rp.r).toFixed(1) + '): the Hero hits it with real keys, jolt ' + (rh ? rh.jolt.toFixed(2) : '?'), { rp, rh });
      } else fail('no real pothole with a clear straight approach found (' + rp.n + ' candidates)');
      await page.evaluate(() => { N.world.potholeAt = () => null; });
    } else ok('world.js has no N.world.potholeAt yet: the real-pothole ride is skipped');
    await checkErrors(page, errors, 'potholes');
  }

  /* ------------------------------------------------------------------ unlock ladder */
  if (want('ladder')) {
    section = 'ladder';
    console.log('\n== unlock ladder: Akka\'s Scooty, Bunty-anna');
    await fresh(page);
    const l = await page.evaluate(() => {
      const C = N.collectibles, out = {};
      const L30 = C.LADDER.find((q) => q.n === 30), L60 = C.LADDER.find((q) => q.n === 60);
      out.names = [L30 && L30.name, L60 && L60.name];
      const ids = C.items.map((it) => it.id);
      for (let i = 0; i < 29; i++) C.found(ids[i], { silent: true });
      out.at29 = { scooty: !!N.flags.unlock_scooty, total: C.total() };
      const home = N.WORLD_DATA.spawns.home;
      const ak = N.vehicles.list.find((v) => v.type === 'akka_scooty');
      out.akka = !!ak;
      if (ak) { N.player.teleport(ak.x, ak.y + 10); }
      out.home = home;
      return out;
    });
    await gwait(page, 0.2);
    const lb29 = await label(page);
    const l30 = await page.evaluate(() => { const C = N.collectibles; C.found(C.items[29].id); return { scooty: !!N.flags.unlock_scooty, chetak: !!N.flags.unlock_chetak, total: C.total(), toasts: N.hud.toastQueue() }; });
    await gwait(page, 0.2);
    const lb30 = await label(page);
    await page.keyboard.press('KeyE');
    await frames(page, 6); await gwait(page, 0.0625);
    const rideAk = await page.evaluate(() => N.player.vehicle && N.player.vehicle.type);
    check(l.names[0] === "Akka's Scooty" && /Bunty/.test(l.names[1] || ''), 'ladder names: 30 "' + l.names[0] + '", 60 "' + l.names[1] + '"', l.names);
    check(l.akka && !l.at29.scooty && lb29 === 'Nakko', '29 finds: Akka\'s Scooty is parked at home and says "' + lb29 + '"', { l, lb29 });
    check(l30.total === 30 && l30.scooty && l30.chetak && l30.toasts.some((t) => /Akka/.test(t)), '30 finds: unlock_scooty (+ unlock_chetak for old code), toast "' + (l30.toasts.find((t) => /Akka/.test(t)) || '') + '"', l30);
    check(lb30 === 'Ride Scooty' && rideAk === 'akka_scooty', '...and Akka\'s Scooty rides: "' + lb30 + '"', { lb30, rideAk });
    await closeCam(page, false);
    const l60 = await page.evaluate(() => {
      const C = N.collectibles;
      if (N.player.vehicle) N.vehicles.exit(N.player, true);
      for (let i = 30; i < 60; i++) C.found(C.items[i].id, { silent: true });
      return { rx: !!N.flags.unlock_rx100, pill: !!N.flags.unlock_bunty_pillion, gears: !!N.flags.unlock_hercules_gears, herc: N.vehicles.list.some((v) => v.type === 'hercules_gears' && v.alive), std: N.shops.rows('std_1').map((r) => r.id).indexOf('call_bunty') >= 0, canRx: N.vehicles.canDrive('bunty_rx100') };
    });
    check(l60.rx && l60.pill && l60.gears && l60.herc && l60.std && !l60.canRx, '60 finds: Bunty-anna pillion (STD row), his Hercules with gears waits at home, the RX100 itself stays pillion-only', l60);
    // an old save: unlock_chetak only -> unlock_scooty too
    const old = await page.evaluate(() => {
      N.debug.newGame({ skipIntro: true });
      N.flags.unlock_chetak = true; delete N.flags.unlock_scooty;
      N.collectibles.deserialize({ found: [], ladder: [30] });
      const ak = N.vehicles.list.find((v) => v.type === 'akka_scooty');
      return { scooty: !!N.flags.unlock_scooty, nakko: ak ? N.vehicles.nakko(ak) : 'none' };
    });
    check(old.scooty && old.nakko === null, 'an old save with unlock_chetak: Akka\'s Scooty is unlocked too', old);
    // an old save with "Bunty's RX100, any day" (unlock_rx100, e.g. from SA6) and fewer than 60 finds
    const oldRx = await page.evaluate(() => {
      N.debug.newGame({ skipIntro: true });
      N.flags.unlock_rx100 = true; delete N.flags.unlock_bunty_pillion; delete N.flags.unlock_hercules_gears;
      N.collectibles.deserialize({ found: [], ladder: [] });
      N.vehicles.seedHome();
      return { pill: !!N.flags.unlock_bunty_pillion, gears: !!N.flags.unlock_hercules_gears, herc: N.vehicles.list.some((v) => v.type === 'hercules_gears' && v.alive), std: N.shops.rows('std_1').map((r) => r.id).indexOf('call_bunty') >= 0, canRx: N.vehicles.canDrive('bunty_rx100') };
    });
    check(oldRx.pill && oldRx.gears && oldRx.herc && oldRx.std && !oldRx.canRx, 'an old save with unlock_rx100: Bunty-anna pillion + his geared Hercules at home, the RX100 itself pillion-only', oldRx);
    await page.evaluate(() => { N.debug.skipDialogue(true); });
    await checkErrors(page, errors, 'ladder');
  }

  /* ------------------------------------------------------------------ traffic + parked */
  if (want('traffic')) {
    section = 'traffic';
    console.log('\n== traffic and parked spawns');
    await fresh(page, { traffic: true });
    const tm = await page.evaluate(() => {
      const V = N.vehicles, M = N.traffic && N.traffic.TUNE && N.traffic.TUNE.mix;
      return { mix: V.trafficMix('colony', { cycle: 20, auto: 18 }), colony: M ? { hero: M.colony.hero_cycle, herc: M.colony.hercules_cycle, scooty: M.colony.scooty, cycle: M.colony.cycle } : null, reads: !!(N.traffic && N.traffic.readsTypeWeights), stands: V.list.filter((v) => v.stand).map((v) => v.type) };
    });
    check(tm.mix.hero_cycle === 9 && tm.mix.hercules_cycle === 5 && tm.mix.cycle === 6 && tm.mix.scooty > 0, 'trafficMix(colony): the cycle share split Hero / Hercules / BSA, plus the Scooty', tm.mix);
    check(tm.reads || (tm.colony && tm.colony.hero > 0 && tm.colony.herc > 0 && tm.colony.scooty > 0), 'live traffic mix includes the new types (' + (tm.reads ? 'traffic.js reads TYPES weights' : 'patched N.traffic.TUNE.mix') + ')', tm.colony);
    const st = {}; for (const t of tm.stands) st[t] = (st[t] || 0) + 1;
    check(tm.stands.length >= 20 && st.hero_cycle > 0 && st.hercules_cycle > 0 && st.scooty > 0, 'parked cycle stands (schools, cinemas, cafés, OU, Ameerpet): ' + JSON.stringify(st));
    // live traffic around a colony: the new types turn up
    await page.evaluate(() => { N.debug.teleport('himayatnagar') || N.debug.teleport(4580, 2619); N.traffic.enabled = true; N.traffic.setDensity(2); N.traffic.fill(); });
    const seen = {};
    for (let i = 0; i < 16; i++) {
      await gwait(page, 0.7);
      const ts = await page.evaluate(() => N.traffic.vehicles.map((v) => v.type));
      for (const t of ts) seen[t] = (seen[t] || 0) + 1;
      if (seen.hero_cycle && seen.scooty && seen.hercules_cycle) break;
    }
    check((seen.hero_cycle || 0) + (seen.hercules_cycle || 0) + (seen.scooty || 0) > 0, 'live traffic rides Heroes / Hercules / Scooties: ' + JSON.stringify(seen));
    await page.evaluate(() => { N.render.baseZoom = 1; });
    await shot('traffic_colony');
    // the riders: Scooties are mostly women and college girls
    const riders = await page.evaluate(() => N.traffic.vehicles.filter((v) => v.type === 'scooty' && v.driver && v.driver.look).map((v) => v.driver.look.kind + (v.driver.look.girl ? '/girl' : '')));
    if (riders.length) ok('Scooty riders: ' + riders.join(', ')); else console.log('       (no Scooty in traffic right now to check its rider)');
    await page.evaluate(() => N.traffic.setDensity(1));
    await checkErrors(page, errors, 'traffic');
  }

  /* ------------------------------------------------------------------ adversarial (review pass) */
  if (want('adv') && road) {
    section = 'adv';
    console.log('\n== adversarial: every other way onto a vehicle he may not drive, rides that end badly, pothole edge cases');
    await fresh(page);
    // 1. thrown off the back of a pillion ride: the uncle's Chetak never lies down, never "Pick up Chetak"
    await parkAhead(page, 'chetak', { driver: 'npc' });
    let r = await page.evaluate(() => {
      const p = N.player, v = window.__v;
      v.controller = (q) => { q.ctl.throttle = 0; q.ctl.brake = true; q.ctl.steer = 0; };
      const rode = N.vehicles.ride(p, v, { as: 'pillion' });
      p.god = false;
      N.emit('bump', { a: v, b: null, speed: 120, wall: true, vehicle: v, x: v.x, y: v.y });
      const o = { rode, fell: !p.vehicle && p.downT > 0, fallen: !!v.fallen, drv: !!v.driver && v.driver !== p };
      p.god = true;
      return o;
    });
    await gwait(page, 2.8);
    await page.evaluate(() => { const p = N.player, v = window.__v; p.downT = 0; p.controlsLocked = false; const f = N.world.findFree(v.x - Math.sin(v.angle) * 9, v.y + Math.cos(v.angle) * 9, 'walk', 8); if (f) { p.x = f.x; p.y = f.y; } });
    let lb = await label(page);
    await page.keyboard.press('KeyE');
    await frames(page, 6);
    const r1 = await page.evaluate(() => ({ veh: N.player.vehicle ? N.player.vehicle.type : null, drv: N.player.vehicle ? N.player.vehicle.driver === N.player : false, fallen: !!window.__v.fallen }));
    check(r.rode && r.fell && !r.fallen && r.drv && !/Pick up/.test(lb) && !r1.drv && !r1.fallen, 'thrown off a pillion ride (DHADAAM): the uncle\'s Chetak stays up, no "Pick up Chetak", he never ends up driving it (label "' + lb + '")', { r, r1 });
    await page.evaluate(() => { if (N.player.vehicle) N.vehicles.exit(N.player, true); });
    // 2. a Chetak he fell off (debug / allowHeavy): "Pick up" stands it back up, but he doesn't ride away on it
    r = await page.evaluate(() => {
      N.vehicles.list.slice().forEach((v) => { if (!v.seeded) N.vehicles.remove(v); });
      const p = N.player, r0 = window.__road; p.teleport(r0.x, r0.y); p.angle = r0.angle;
      const v = N.debug.enterVehicle('chetak'); window.__v = v; p.god = false;
      N.emit('bump', { a: v, b: null, speed: 120, wall: true, vehicle: v, x: v.x, y: v.y });
      p.god = true;
      return { fallen: !!v.fallen, onFoot: !p.vehicle };
    });
    await gwait(page, 2.8);
    await page.evaluate(() => { const p = N.player, v = window.__v; p.downT = 0; p.controlsLocked = false; const f = N.world.findFree(v.x - Math.sin(v.angle) * 9, v.y + Math.cos(v.angle) * 9, 'walk', 8); if (f) { p.x = f.x; p.y = f.y; } });
    lb = await label(page);
    await page.keyboard.press('KeyE');
    await frames(page, 6);
    const r2 = await page.evaluate(() => ({ veh: N.player.vehicle && N.player.vehicle.type, fallen: !!window.__v.fallen }));
    check(r.fallen && r.onFoot && lb === 'Pick up Chetak' && !r2.veh && !r2.fallen, 'a fallen Chetak: "' + lb + '" stands it up, he stays on foot', { r, lb, r2 });
    // 3. a parked Chetak right next to him never hides the Hero cycle a little further on, and "no"
    //    offers sit below side activities (priority -2); mashing E: one line, not a queue
    r = await page.evaluate(() => {
      N.vehicles.list.slice().forEach((v) => { if (!v.seeded) N.vehicles.remove(v); });
      const p = N.player, r0 = window.__road; p.teleport(r0.x, r0.y);
      const c = Math.cos(r0.angle), s = Math.sin(r0.angle);
      N.vehicles.spawn('chetak', r0.x + c * 4, r0.y + s * 4, r0.angle, { seed: 11 });
      window.__v = N.vehicles.spawn('hero_cycle', r0.x - c * 14, r0.y - s * 14, r0.angle, { seed: 12 });
      return true;
    });
    const both = await label(page);
    r = await page.evaluate(() => { const v = window.__v; N.vehicles.remove(v); return true; });
    const alone = await label(page);
    const pri = await page.evaluate(() => { const c = N.interact.current; return c ? c.priority : null; });
    await page.evaluate(() => { window.__ev.length = 0; });
    for (let i = 0; i < 6; i++) { await page.keyboard.press('KeyE'); await gwait(page, 0.06); }
    await frames(page, 3);
    const spam = await page.evaluate(() => { const lines = N.vehicles.REFUSE.chetak.map((t) => t.replace(/\*([^*]+)\*/g, '$1')); return { refused: window.__ev.filter((e) => e[0] === 'vehicle:refused').length, toasts: N.hud.toastQueue().filter((t) => lines.indexOf(t) >= 0).length }; });
    check(both === 'Ride Hero cycle' && alone === 'Too small to drive' && (pri == null || pri < -1) && spam.refused <= 2 && spam.toasts <= 2, 'a Chetak 4 u away + a Hero 14 u away: "' + both + '"; the Chetak alone: "' + alone + '" (priority ' + pri + '); 6 x E -> ' + spam.refused + ' refusal(s), ' + spam.toasts + ' toast(s)', { both, alone, pri, spam });
    // 4. passing traffic: no "Ask for a lift" on a Chetak doing 70 u/s; a bike with an aunty on the back is full
    await parkAhead(page, 'chetak', { driver: 'npc' });
    r = await page.evaluate(() => { const v = window.__v; v.controller = (q) => { q.ctl.brake = false; q.ctl.steer = 0; q.ctl.throttle = q.speed < 70 ? 1 : 0; }; v.speed = 70; v.vx = Math.cos(v.angle) * 70; v.vy = Math.sin(v.angle) * 70; return N.vehicles.offerFor(v); });
    const fullR = await page.evaluate(() => { const v = window.__v; v.controller = (q) => { q.ctl.throttle = 0; q.ctl.brake = true; }; v.vx = v.vy = 0; v.speed = 0; N.vehicles.setPillion(v, N.people.randomLook(null, 'aunty')); const o = N.vehicles.offerFor(v); window.__ev.length = 0; o && N.vehicles.TYPES && 0; return o; });
    check(r === null && fullR && fullR.kind === 'nolift', 'a Chetak passing at 70 u/s offers nothing; one with an aunty pillion: "' + (fullR && fullR.label) + '" -> no room', { r, fullR });
    // 4b. borrowing a stranger's Scooty with an aunty on the back: she gets off too
    r = await page.evaluate(() => {
      N.vehicles.list.slice().forEach((v) => { if (!v.seeded) N.vehicles.remove(v); });
      const p = N.player, r0 = window.__road; p.teleport(r0.x, r0.y);
      const v = N.vehicles.spawn('scooty', r0.x + Math.cos(r0.angle) * 10, r0.y + Math.sin(r0.angle) * 10, r0.angle, { driver: { look: N.people.randomLook(null, 'woman'), npc: true } });
      N.vehicles.setPillion(v, N.people.randomLook(null, 'aunty'));
      const o = N.vehicles.offerFor(v);
      const peds0 = N.entities.all.filter((e) => e.kind === 'ped').length;
      N.vehicles.enter(p, v);
      const out = { o: o && o.label, drv: v.driver === p, pill: v.pillion, peds: N.entities.all.filter((e) => e.kind === 'ped').length - peds0 };
      N.vehicles.exit(p, true); N.vehicles.remove(v);
      return out;
    });
    check(r.o === 'Borrow Scooty' && r.drv && !r.pill && r.peds === 2, 'borrowing a Scooty with an aunty pillion: both get off, shouting (' + r.peds + ' angry peds)', r);
    // 5. a pursuer's Chetak (Nanna + Mummy chasing him) never offers "Sit pillion"
    r = await page.evaluate(() => { N.vehicles.list.slice().forEach((v) => { if (!v.seeded) N.vehicles.remove(v); }); return true; });
    await parkAhead(page, 'family_chetak', { driver: 'npc' });
    await page.evaluate(() => { window.__v.pursuitVehicle = true; window.__v.noEnter = true; });
    lb = await label(page);
    check(!/pillion|Ride/.test(lb || ''), 'a pursuit Chetak (Nanna chasing): no seat offered ("' + lb + '")');
    // 6. the vehicle under a passenger is removed (despawn, mission cleanup): he is put down, not left riding a ghost
    r = await page.evaluate(() => {
      N.vehicles.list.slice().forEach((v) => { if (!v.seeded) N.vehicles.remove(v); });
      const p = N.player, r0 = window.__road; p.teleport(r0.x, r0.y);
      const b = N.vehicles.spawn('bus', r0.x + Math.cos(r0.angle) * 30, r0.y + Math.sin(r0.angle) * 30, r0.angle, { driver: true });
      b.controller = (q) => { q.ctl.throttle = 0.6; q.ctl.steer = 0; q.ctl.brake = false; };
      const rode = N.vehicles.ride(p, b, { as: 'passenger' });
      N.vehicles.remove(b);
      return { rode, veh: !!p.vehicle, mode: p.mode, pas: p.passenger, walk: N.world.isWalkable(p.x, p.y) };
    });
    check(r.rode && !r.veh && r.mode === 'foot' && !r.pas && r.walk, 'the bus he rides is despawned: he is set down on foot', r);
    // 7. a locked ride: the lock lasts as long as the mission that took it (then "Get off" comes back)
    await parkAhead(page, 'scooty', { driver: 'npc' });
    r = await page.evaluate(() => {
      const d0 = Object.getOwnPropertyDescriptor(N.missions, 'active');
      window.__d0 = d0; window.__run = { id: 'fake_ride' };
      Object.defineProperty(N.missions, 'active', { get: () => window.__run, configurable: true, enumerable: true });
      const v = window.__v; v.controller = (q) => { q.ctl.throttle = 0; q.ctl.brake = true; q.ctl.steer = 0; };
      return N.vehicles.ride(N.player, v, { lock: true });
    });
    const lockedLb = await label(page);
    await page.evaluate(() => { window.__run = null; });
    const freeLb = await label(page);
    await page.evaluate(() => { Object.defineProperty(N.missions, 'active', window.__d0); if (N.player.vehicle) N.vehicles.exit(N.player, true); });
    check(r && lockedLb !== 'Get off' && freeLb === 'Get off', 'locked pillion ride: no "Get off" during the mission ("' + lockedLb + '"), "' + freeLb + '" once it ends', { r, lockedLb, freeLb });
    // 8. ticket punch: free bus rides
    await parkAhead(page, 'bus', { driver: 'npc' });
    await page.evaluate(() => { window.__v.controller = (q) => { q.ctl.throttle = 0; q.ctl.brake = true; }; N.player.inventory.add('ticket_punch'); });
    const pl = await label(page);
    const m0 = await page.evaluate(() => N.player.money);
    await page.keyboard.press('KeyE');
    await frames(page, 4);
    r = await page.evaluate((m0) => ({ on: N.player.vehicle === window.__v, paid: m0 - N.player.money }), m0);
    await page.evaluate(() => { N.player.inventory.delete('ticket_punch'); if (N.player.vehicle) N.vehicles.exit(N.player, true); });
    check(/punch/.test(pl) && r.on && r.paid === 0, 'Ticket Thatha\'s punch: "' + pl + '", free', r);
    // 9. the fare card: Escape closes it for good (no instant re-open); ACTION next to the auto reopens it
    await page.evaluate(() => { N.vehicles.list.slice().forEach((v) => { if (!v.seeded) N.vehicles.remove(v); }); });
    await parkAhead(page, 'auto', { driver: 'npc' });
    await page.evaluate(() => { window.__v.trafficOwned = true; });
    await label(page);
    await page.keyboard.press('KeyE');
    await frames(page, 6);
    const open1 = await page.evaluate(() => !!N.shops.isOpen());
    await page.keyboard.press('Escape');
    await frames(page, 10);
    const reopened = await page.evaluate(() => !!N.shops.isOpen());
    const again = await label(page);
    await page.keyboard.press('KeyE');
    await frames(page, 6);
    const open2 = await page.evaluate(() => !!N.shops.isOpen());
    await page.evaluate(() => { if (N.shops.isOpen()) N.shops.close(); const SS = N.shops.debug.S; if (SS.hail && SS.hail.v) N.vehicles.remove(SS.hail.v); SS.hail = null; });
    check(open1 && !reopened && /fare/.test(again || '') && open2, 'fare card: Escape keeps it shut, "' + again + '" + E opens it again', { open1, reopened, again, open2 });
    // 10. potholes: no tunnelling (a 1.3 u pothole at 120 u/s), one hit per pothole per wheel, the rear wheel's
    //     follow-through is a softer thump (no second speed loss or roll), and one comic fall per 45 s at most
    const pt = await page.evaluate(async () => {
      const r0 = window.__road, out = {};
      window.__realPot2 = N.world.potholeAt;
      const pots = [];
      N.world.potholeAt = (x, y) => { for (const q of pots) if ((x - q.x) ** 2 + (y - q.y) ** 2 < q.r * q.r) return q; return null; };
      const runOver = async (type, speed, potR, dist) => {
        N.vehicles.list.slice().forEach((v) => { if (!v.seeded) N.vehicles.remove(v); });
        const c = Math.cos(r0.angle), s = Math.sin(r0.angle);
        const v = N.vehicles.spawn(type, r0.x + c * 20, r0.y + s * 20, r0.angle, { driver: { look: N.people.randomLook(null, 'man'), npc: true } });
        v.vx = c * speed; v.vy = s * speed; v.speed = speed;
        v.controller = (q) => { q.ctl.brake = false; q.ctl.steer = 0; q.ctl.throttle = q.speed < speed ? 1 : 0; };
        pots.length = 0; pots.push({ id: 'p1', x: r0.x + c * (20 + dist), y: r0.y + s * (20 + dist), r: potR, depth: 1 });
        N.player.teleport(r0.x + c * (20 + dist) - s * 30, r0.y + s * (20 + dist) + c * 30);
        const evs = [], sp = [];
        const h = (d) => { if (d.vehicle === v) evs.push({ wheel: d.wheel, follow: !!d.follow, speed: Math.round(d.speed) }); };
        N.on('vehicle:pothole', h); N.on('vehicle:potholeRear', h);
        const t0 = performance.now();
        while (performance.now() - t0 < 2600) { await new Promise((res) => requestAnimationFrame(res)); sp.push(v.speed); }
        if (N.off) { N.off('vehicle:pothole', h); N.off('vehicle:potholeRear', h); }
        N.vehicles.remove(v);
        return { evs, nan: sp.some((x) => !isFinite(x)) };
      };
      out.tiny = await runOver('hero_cycle', 112, 1.3, 120);
      out.car = await runOver('auto', 70, 5, 100);
      out.hero = await runOver('hero_cycle', 45, 5, 60);
      N.world.potholeAt = window.__realPot2; if (!window.__realPot2) delete N.world.potholeAt;
      // fall grace: two forced rolls in a row -> one DHADAAM
      const p = N.player; p.god = false;
      let falls = 0; const f0 = p.fall; p.fall = function () { falls++; return f0.apply(this, arguments); };
      const r1 = Math.random; Math.random = () => 0.001;
      for (let i = 0; i < 2; i++) {
        p.downT = 0; p.controlsLocked = false;
        const v = N.debug.enterVehicle('hero_cycle');
        const s2 = v.T.maxSpeed * 0.95; v.speed = s2; v.vx = Math.cos(v.angle) * s2; v.vy = Math.sin(v.angle) * s2; v.potCD = 0;
        N.vehicles.hitPothole(v, { depth: 1, r: 5 });
        v.flat = false; if (p.vehicle) N.vehicles.exit(p, true); N.vehicles.remove(v);
      }
      Math.random = r1; p.fall = f0; p.god = true; p.downT = 0; p.controlsLocked = false;
      out.falls = falls;
      // NaN-proof: junk depth / a pothole object without fields
      const v = N.debug.enterVehicle('scooty'); v.speed = 80; v.vx = Math.cos(v.angle) * 80; v.vy = Math.sin(v.angle) * 80; v.potCD = 0;
      N.vehicles.hitPothole(v, { depth: NaN, r: 'x' }); v.potCD = 0; N.vehicles.hitPothole(v, {});
      out.nanSafe = isFinite(v.x) && isFinite(v.vx) && isFinite(v.speed) && isFinite(v.jolt);
      N.vehicles.exit(p, true); N.vehicles.remove(v);
      return out;
    });
    const full = (e) => e.evs.filter((q) => !q.follow).length, fol = (e) => e.evs.filter((q) => q.follow).length;
    check(full(pt.tiny) === 1 && !pt.tiny.nan, 'no tunnelling: a 1.3 u pothole at 112 u/s registers once', pt.tiny);
    check(full(pt.car) === 1 && fol(pt.car) === 1 && !pt.car.nan, 'an auto at 70 u/s: front wheel DHADAK, rear wheel follow-through, one speed loss', pt.car);
    check(full(pt.hero) === 1 && fol(pt.hero) <= 1, 'a Hero at 45 u/s: one pothole = one hit (+ the softer rear thump), not two penalties', pt.hero);
    check(pt.falls === 1, 'two forced fall rolls back to back: one DHADAAM (45 s of grace)', pt.falls);
    check(pt.nanSafe, 'junk pothole data (NaN depth, empty object): no NaN in the vehicle');
    // 11. 3D view (V): the same rules (refusal, no driving)
    const has3d = await page.evaluate(() => !!(N.view && N.view.set));
    if (has3d) {
      await page.evaluate(() => { N.vehicles.list.slice().forEach((v) => { if (!v.seeded) N.vehicles.remove(v); }); });
      await parkAhead(page, 'chetak');
      await page.keyboard.press('KeyV');
      await page.waitForFunction(() => N.view.mode !== 'top', null, { timeout: 90000 }).catch(() => {});
      await frames(page, 12);
      const vm = await page.evaluate(() => N.view.mode);
      const l3 = await label(page);
      await page.keyboard.press('KeyE');
      await frames(page, 6);
      const in3 = await page.evaluate(() => N.player.vehicle && N.player.vehicle.type);
      await page.evaluate(() => N.view.set('top'));
      await frames(page, 6);
      check(l3 === 'Too small to drive' && !in3 && vm !== 'top', '3D view (' + vm + '): a parked Chetak still says "' + l3 + '" and E does not drive it', { l3, in3, vm });
    }
    // 12. touch / stick (point-to-steer): the kid's wobbly Scooty and the heavy Hero still hold a line, and turn
    //     to a new stick direction
    for (const type of ['scooty', 'hero_cycle']) {
      await parkAhead(page, type);
      await page.evaluate(() => { N.vehicles.enter(N.player, window.__v); const a = window.__road.angle; N.input.setMove(Math.cos(a), Math.sin(a), true); });
      await gwait(page, 2.6);
      const st1 = await page.evaluate(() => { const v = window.__v; return { sp: v.speed, top: v.T.maxSpeed, err: Math.abs(N.util.angleDiff(v.angle, window.__road.angle)), wob: v.wobble || 0 }; });
      await page.evaluate(() => { const a = window.__road.angle - Math.PI / 2; N.input.setMove(Math.cos(a), Math.sin(a), true); });
      await gwait(page, 1.5);
      const st2 = await page.evaluate(() => { const v = window.__v; return { err: Math.abs(N.util.angleDiff(v.angle, window.__road.angle - Math.PI / 2)) }; });
      await page.evaluate(() => { N.input.setMove(null); if (N.player.vehicle) N.vehicles.exit(N.player, true); });
      check(st1.sp > st1.top * 0.7 && st1.err < 0.3 && st2.err < 0.5, type + ' on the stick: ' + st1.sp.toFixed(0) + ' u/s holding the line (heading error ' + st1.err.toFixed(2) + ' rad), turns to a new stick direction (' + st2.err.toFixed(2) + ' rad off)', { st1, st2 });
    }
    // 13. save + load at the wheel of a car (debug): back on foot, no stray copy; as a bus passenger: a passenger again
    r = await page.evaluate(async () => {
      const p = N.player, r0 = window.__road;
      N.vehicles.list.slice().forEach((v) => { if (!v.seeded) N.vehicles.remove(v); });
      p.teleport(r0.x, r0.y);
      const out = {};
      for (const kind of ['car', 'bus']) {
        let v;
        if (kind === 'car') v = N.debug.enterVehicle('ambassador');
        else { v = N.vehicles.spawn('bus', r0.x + Math.cos(r0.angle) * 30, r0.y + Math.sin(r0.angle) * 30, r0.angle, { driver: true }); v.controller = (q) => { q.ctl.brake = true; q.ctl.throttle = 0; }; N.vehicles.ride(p, v, { as: 'passenger' }); }
        const saved = N.save.save({ reason: 'test', toast: false });
        const loaded = N.save.load();
        await __gw(0.3);
        const near = (t) => N.vehicles.list.filter((q) => q.alive && q.type === t && Math.hypot(q.x - p.x, q.y - p.y) < 120).length;
        const pv = p.vehicle, d = pv && pv.driver;
        out[kind] = { saved, loaded, veh: pv ? pv.type : null, mode: p.mode, stray: near('ambassador') + near('bus'), cars: near('ambassador'), buses: near('bus'), as: p.passenger || null, atWheel: !!(pv && d === p), driver: !pv ? null : d === p ? 'player' : d && d.npc ? 'npc' : d ? 'other' : null };
        if (p.vehicle) N.vehicles.exit(p, true);
      }
      return out;
    });
    // A4: a save made riding along loads him riding along again (vehicles 'ride' section), never at the wheel
    check(r.car.loaded && !r.car.veh && r.car.stray === 0, 'save + load in a debug Ambassador: on foot after the load, no stray copy', r.car);
    check(r.bus.loaded && r.bus.veh === 'bus' && r.bus.as && !r.bus.atWheel && r.bus.driver === 'npc' && r.bus.buses === 1 && r.bus.cars === 0, 'save + load riding a bus: still riding it as a passenger (' + r.bus.as + ') with an NPC driver, exactly one bus nearby, no stray copy', r.bus);
    await fresh(page);
    await checkErrors(page, errors, 'adv');
  }

  /* ------------------------------------------------------------------ audio */
  if (want('audio')) {
    section = 'audio';
    console.log('\n== audio: engines, bells, the pothole');
    const au = await page.evaluate(async () => {
      const A = N.audio, E = A._internal && A._internal.ENGINES;
      // average a few renders: the sounds have random pitch / timing jitter on purpose
      const r = async (name, o) => { let pk = 0, rm = 0, n = 0; for (let i = 0; i < 6; i++) { const x = await A.renderOffline(name, 1.6, o); if (!x) return null; pk = Math.max(pk, x.peak); rm += x.rms; n++; } return { peak: +pk.toFixed(3), rms: +(rm / n).toFixed(4) }; };
      return {
        scooty: E && E.scooty, chetak: E && E.chetak,
        dry: await r('pothole', {}), wet: await r('pothole', { variant: 'wet' }),
        hero: await r('bell', { variant: 'hero' }), herc: await r('bell', { variant: 'hercules' }), plain: await r('bell', {}),
      };
    });
    check(au.scooty && au.scooty.kind === '2t' && au.scooty.idle > au.chetak.idle && au.scooty.max > au.chetak.max && au.scooty.bp > au.chetak.bp, 'Scooty engine: a small 2-stroke buzz, higher than the Chetak (idle ' + (au.scooty && au.scooty.idle) + ' vs ' + au.chetak.idle + ' Hz)', au.scooty);
    if (au.dry) {
      check(au.dry.peak > 0.02 && au.wet.peak > 0.02 && au.wet.rms > au.dry.rms, 'sfx pothole renders (dry rms ' + au.dry.rms + ', wet with the splash ' + au.wet.rms + ')', { dry: au.dry, wet: au.wet });
      check(au.hero.peak > 0.01 && au.herc.peak > 0.01 && Math.abs(au.hero.rms - au.herc.rms) > 0.0005, 'Hero bell (rms ' + au.hero.rms + ') and Hercules bell (rms ' + au.herc.rms + ') ring differently', { hero: au.hero, herc: au.herc, plain: au.plain });
    } else ok('no OfflineAudioContext here: offline renders skipped');
    await checkErrors(page, errors, 'audio');
  }

  await browser.close();
  console.log('\nScreenshots: ' + OUT + '/v2_*.png');
  if (failures.length) { console.log('\n' + failures.length + ' FAILURE(S)'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
  console.log('\nVEHICLES V2 PASSED');
}
main().catch((e) => { console.error(e); process.exit(1); });
