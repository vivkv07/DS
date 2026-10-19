/* NOSTALGIA — tests/vehicles_routing.cjs  (vehicles-routing: long GPS / fare routes, riding along survives
 * a retry and a save, the cycle-rickshaw is a fare ride)
 * Headless Chromium, index.html#debug:
 *   routes    Charminar -> Cyber Towers on the 15000x11250 map: N.world.roads.route, N.vehicles.roadPath /
 *             roadDistance (fare rides: auto / bus / cycle-rickshaw) and the HUD GPS line all find the road
 *             route (not the straight-line fallback); route times (well under 30 ms)
 *   retry     a mission checkpoint taken riding pillion: the retry seats him behind an NPC driver again
 *             (the script's own ride kept, or a fresh copy), never at the wheel
 *   save      a save made riding pillion / on a bus loads him riding along again (not the driver, no stray copy),
 *             "Get off" works and the restored ride drives away
 *   rickshaw  a cycle-rickshaw with its rickshaw-wala: "Ride rickshaw (fare)" -> the fare card, the ride, he never
 *             sits at the pedals; a parked one refuses ("Too small to drive")
 *   node nostalgia/tests/vehicles_routing.cjs      ONLY=routes,retry,save,rickshaw
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.indexOf(k) >= 0;
const failures = [];
let section = '';
const ok = (msg) => console.log('  ok   ' + msg);
const fail = (msg) => { failures.push('[' + section + '] ' + msg); console.log('  FAIL ' + msg); };
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); return !!cond; };

async function boot(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 60000 });
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.skipDialogue(true); });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 15000 });
  return { context, page, errors };
}
// a fresh game: traffic off, noon, god mode, money, no chase, saves allowed
const fresh = (page) => page.evaluate(() => {
  if (N.shops && N.shops.isOpen()) N.shops.close();
  if (N.missions.active) N.missions.abort();
  N.debug.newGame({ skipIntro: true }); N.debug.skipDialogue(true);
  N.player.money = 100000; N.debug.god(true);
  N.debug.setTime(12, 0); N.debug.freezeClock(true);
  if (N.traffic) { N.traffic.enabled = false; N.traffic.clear(); }
  if (N.wanted && N.wanted.set) N.wanted.set(0);
  N.vehicles.allowHeavy = false;
  return N.state.mode;
});
// wait n simulation frames (never a fixed wall-clock sleep: the machine may be loaded)
const frames = (page, n) => page.evaluate((n) => new Promise((res) => { const f0 = N.time.frame, t0 = performance.now(); (function chk() { if (N.time.frame - f0 >= n || performance.now() - t0 > 8000) res(); else requestAnimationFrame(chk); })(); }), n || 4);
// wait until cond() (a page function body) is true or `ms` passes
const until = (page, src, ms) => page.waitForFunction(src, null, { timeout: ms || 15000 }).then(() => true, () => false);
// a road spot near a place, with its heading
const roadNear = (page, id) => page.evaluate((id) => { const P = N.places[id]; const q = N.world.nearestRoadPoint(P.x, P.y); return { x: q.x, y: q.y, angle: q.angle }; }, id);
async function checkErrors(page, errors, where) {
  const ne = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + e.msg.split('\n')[0]));
  check(errors.length === 0 && ne.length === 0, 'no console / page / engine errors (' + where + ')', { console: errors.slice(0, 5), engine: ne.slice(0, 5) });
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let page, errors;
  try {
    ({ page, errors } = await boot(browser));

    /* -------------------------------------------------------------- A3 long routes */
    if (want('routes')) {
      section = 'routes';
      console.log('\n== long routes (Charminar -> Cyber Towers)');
      await fresh(page);
      const r = await page.evaluate(() => {
        const A = N.places.charminar, B = N.places.cyber_towers, R = N.world.roads, V = N.vehicles;
        const direct = Math.hypot(B.x - A.x, B.y - A.y);
        const na = R.nearestNode(A.x, A.y), nb = R.nearestNode(B.x, B.y);
        // the graph search itself (the GPS options: walkers, footpaths allowed at x1.15)
        const times = [];
        let nodes = null, stats = null;
        for (let i = 0; i < 6; i++) { const t0 = performance.now(); nodes = R.route(na, nb, { walk: true, paths: true, costs: { path: 1.15 } }); times.push(performance.now() - t0); stats = R.routeStats(); }
        // NPC drivers / fares: vehicles.js roadPath + roadDistance (auto, bus, cycle-rickshaw fares and bus times)
        const vt = [];
        let pts = null;
        for (let i = 0; i < 6; i++) { const t0 = performance.now(); pts = V.roadPath(A.x, A.y, B.x, B.y); vt.push(performance.now() - t0); }
        const back = V.roadPath(B.x, B.y, A.x, A.y);
        const dist = V.roadDistance(A.x, A.y, B.x, B.y);
        const end = pts[pts.length - 1];
        const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
        return { direct, nodes: nodes ? nodes.length : 0, stats, routeMs: med(times), routeMax: Math.max(...times.slice(1)), pts: pts.length, back: back.length, dist, pathMs: med(vt), pathMax: Math.max(...vt.slice(1)), end, B: { x: B.x, y: B.y }, graph: R.nodes.length };
      });
      console.log('       graph ' + r.graph + ' nodes; direct ' + r.direct.toFixed(0) + ' u; route ' + r.nodes + ' nodes (' + (r.stats && r.stats.expanded) + ' expanded) in ' + r.routeMs.toFixed(2) + ' ms (max ' + r.routeMax.toFixed(2) + '); roadPath ' + r.pts + ' pts in ' + r.pathMs.toFixed(2) + ' ms (max ' + r.pathMax.toFixed(2) + ')');
      check(r.nodes > 20 && r.stats && isFinite(r.stats.len), 'N.world.roads.route finds Charminar -> Cyber Towers (' + r.nodes + ' nodes)', r);
      check(r.pts > 20 && r.back > 20 && r.dist > r.direct * 1.02 && r.dist < r.direct * 2.5, 'N.vehicles.roadPath / roadDistance (NPC drivers, fares): a road route both ways, ' + (r.dist / r.direct).toFixed(2) + 'x the straight line', { pts: r.pts, back: r.back, dist: r.dist, direct: r.direct });
      check(Math.hypot(r.end[0] - r.B.x, r.end[1] - r.B.y) < 1, 'the route ends at Cyber Towers', r.end);
      check(r.routeMs < 30 && r.pathMs < 30, 'route times well under 30 ms (route ' + r.routeMs.toFixed(2) + ' ms, roadPath ' + r.pathMs.toFixed(2) + ' ms, median of 6)', r);
      // the HUD GPS line to a routed blip far away
      const g = await page.evaluate(() => { const A = N.places.charminar, B = N.places.cyber_towers; N.player.teleport(A.x, A.y + 30); N.hud.blip('vr_gps', { x: B.x, y: B.y }, { route: true }); return { x: B.x, y: B.y }; });
      await frames(page, 6);
      const gr = await page.evaluate((B) => { const pts = N.hud.route(); const out = pts ? { n: pts.length, last: pts[pts.length - 1] } : null; N.hud.unblip('vr_gps'); return out && { n: out.n, endD: Math.hypot(out.last[0] - B.x, out.last[1] - B.y) }; }, g);
      check(gr && gr.n > 20 && gr.endD < 1, 'HUD GPS: the pink route Charminar -> Cyber Towers follows the roads (' + (gr && gr.n) + ' points)', gr);
      // a long fare in an auto: the fare card prices it by road (not the straight line)
      const fare = await page.evaluate(() => {
        const A = N.places.charminar, B = N.places.cyber_towers, S = N.shops;
        const pts = N.vehicles.roadPath(A.x, A.y, B.x, B.y);
        return { km: N.vehicles.pathLength(pts) / ((S && S.TUNE && S.TUNE.mapKm) || 430) };
      });
      check(fare.km > 10, 'a long auto / rickshaw fare is priced on the road distance (' + fare.km.toFixed(1) + ' map-km)', fare);
      // a scripted NPC drive across the city (driveTo with road: true): the vehicle gets a long road path
      const dr = await page.evaluate(() => {
        const A = N.places.charminar, B = N.places.cyber_towers;
        const q = N.world.nearestRoadPoint(A.x, A.y);
        const v = N.vehicles.spawn('auto', q.x, q.y, q.angle, { driver: true });
        N.vehicles.driveTo(v, { x: B.x, y: B.y }, { timeout: 2 });
        const D = v.drive || v._drive || null;
        const n = D && D.pts ? D.pts.length : null;
        N.vehicles.stopDriving(v); N.vehicles.remove(v);
        return { n };
      });
      if (dr.n != null) check(dr.n > 20, 'driveTo (an NPC auto across the city) follows a ' + dr.n + '-point road path', dr);
      await checkErrors(page, errors, 'routes');
    }

    /* ---------------------------------------------------- A4: checkpoint retry as a passenger */
    if (want('retry')) {
      section = 'retry';
      console.log('\n== checkpoint retry riding pillion');
      for (const variant of ['script', 'spawn']) {
        await fresh(page);
        const sp = await roadNear(page, 'charminar');
        await page.evaluate(({ sp, variant }) => {
          N.player.teleport(sp.x, sp.y);
          window.__cpAt = null;
          N.missions.register({
            id: 'vr_ride_' + variant, kind: 'side', title: 'Ride test', autosave: false,
            script: async (m) => {
              // 'script': the replayed script seats him again; 'spawn': only the first attempt does
              if (variant === 'script' || !m.retrying) {
                const v = m.vehicle('family_chetak', sp.x + Math.cos(sp.angle) * 30, sp.y + Math.sin(sp.angle) * 30, sp.angle, { driver: true });
                v.controller = (q) => { q.ctl.brake = true; q.ctl.throttle = 0; };
                N.vehicles.ride(N.player, v, { as: 'pillion' });
              }
              m.checkpoint('on_the_chetak');
              if (!m.retrying) window.__cpAt = { x: N.player.x, y: N.player.y };
              await m.wait(600);
            },
          });
          N.missions.start('vr_ride_' + variant);
        }, { sp, variant });
        await frames(page, 4);
        const first = await page.evaluate(() => ({ as: N.player.passenger, drv: N.player.vehicle && N.player.vehicle.driver === N.player }));
        await page.evaluate((variant) => {
          N.missions.fail('test');
          // 'spawn': he got down meanwhile (the old ride is gone)
          if (variant === 'spawn' && N.player.vehicle) { const v = N.player.vehicle; N.vehicles.exit(N.player, true); N.vehicles.remove(v); }
          N.player.teleport(N.player.x + 200, N.player.y);
        }, variant);
        await until(page, () => !N.missions.active && N.missions.lastFailed, 5000);
        await page.evaluate(() => N.missions.retry());
        await frames(page, 6);
        const r = await page.evaluate(() => {
          const p = N.player, v = p.vehicle, c = window.__cpAt;
          const cps = N.vehicles.list.filter((q) => q.alive && q.type === 'family_chetak' && Math.hypot(q.x - p.x, q.y - p.y) < 150).length;
          return { active: !!N.missions.active, veh: v ? v.type : null, as: p.passenger, atWheel: !!v && v.driver === p, npc: !!v && !!v.driver && v.driver !== p, d: c ? Math.hypot(p.x - c.x, p.y - c.y) : null, cps, label: N.input.actionLabel };
        });
        check(first.as === 'pillion' && !first.drv, variant + ': first attempt rides pillion behind Nanna', first);
        check(r.active && r.veh === 'family_chetak' && r.as === 'pillion' && !r.atWheel && r.npc && r.d != null && r.d < 40 && r.cps === 1, variant + ': the retry resumes at the checkpoint riding pillion behind an NPC driver, never at the wheel', r);
        await page.evaluate(() => { if (N.missions.active) N.missions.abort(); });
      }
      await checkErrors(page, errors, 'retry');
    }

    /* ---------------------------------------------------- A4: save while riding along -> load */
    if (want('save')) {
      section = 'save';
      console.log('\n== save while riding along -> load');
      for (const kind of ['chetak', 'bus']) {
        await fresh(page);
        const sp = await roadNear(page, 'charminar');
        const r = await page.evaluate(async ({ sp, kind }) => {
          const p = N.player;
          p.teleport(sp.x, sp.y);
          const type = kind === 'bus' ? 'bus' : 'chetak';
          const v = N.vehicles.spawn(type, sp.x + Math.cos(sp.angle) * 30, sp.y + Math.sin(sp.angle) * 30, sp.angle, { driver: true });
          v.controller = (q) => { q.ctl.brake = true; q.ctl.throttle = 0; };
          const look = v.driver.look;
          const rode = N.vehicles.ride(p, v, { as: kind === 'bus' ? 'passenger' : 'pillion' });
          const saved = N.save.save({ reason: 'test', toast: false });
          const loaded = N.save.load();
          await new Promise((res) => setTimeout(res, 400));
          const w = p.vehicle;
          const near = N.vehicles.list.filter((q) => q.alive && q.type === type && Math.hypot(q.x - p.x, q.y - p.y) < 150).length;
          return { rode, saved, loaded, veh: w ? w.type : null, as: p.passenger, atWheel: !!w && w.driver === p, npc: !!w && !!w.driver && w.driver !== p && !!w.driver.npc, sameLook: !!w && !!w.driver && JSON.stringify(w.driver.look) === JSON.stringify(look), near, mode: p.mode, isP: N.vehicles.isPassenger() };
        }, { sp, kind });
        check(r.rode && r.saved && r.loaded && r.veh === (kind === 'bus' ? 'bus' : 'chetak') && r.as === (kind === 'bus' ? 'passenger' : 'pillion') && !r.atWheel && r.npc && r.near === 1, kind + ': saved riding along -> loads riding along (' + r.as + '), not the driver, no stray copy', r);
        check(r.sameLook, kind + ': the same driver after the load', r);
        // "Get off": down at once (stopped), the restored ride drives away
        await frames(page, 6);
        const lab = await page.evaluate(() => N.input.actionLabel);
        await page.keyboard.press('KeyE');
        await frames(page, 8);
        const off = await page.evaluate(() => { const p = N.player; const v = N.vehicles.list.find((q) => q.alive && q.rideRestored === false && q.driver && q.driver.npc); return { on: !!p.vehicle, mode: p.mode, leaving: !!v && !!v.controller }; });
        check(lab === 'Get off' && !off.on && off.mode === 'foot', kind + ': "' + lab + '" gets him down', { lab, off });
        check(off.leaving, kind + ': the restored ride drives away afterwards', off);
      }
      // a save with no ride: nothing restored, the section is null
      await fresh(page);
      const n = await page.evaluate(() => { N.save.save({ reason: 'test', toast: false }); const o = JSON.parse(N.save._raw()); N.save.load(); return { ride: o.data.ride, veh: !!N.player.vehicle }; });
      check(n.ride === null && !n.veh, 'a save on foot: ride section null, on foot after the load', n);
      // a save at the wheel of his own cycle: still the driver after the load
      const c = await page.evaluate(async () => {
        const v = N.debug.enterVehicle('hero_cycle');
        N.save.save({ reason: 'test', toast: false }); N.save.load();
        await new Promise((res) => setTimeout(res, 300));
        const w = N.player.vehicle;
        return { veh: w ? w.type : null, atWheel: !!w && w.driver === N.player, as: N.player.passenger || null, ok: !!v };
      });
      check(c.veh === 'hero_cycle' && c.atWheel && !c.as, 'a save riding his own Hero cycle: still riding it after the load', c);
      await page.evaluate(() => { if (N.player.vehicle) N.vehicles.exit(N.player, true); });
      await checkErrors(page, errors, 'save');
    }

    /* ---------------------------------------------------- A5: the cycle-rickshaw is a fare ride */
    if (want('rickshaw')) {
      section = 'rickshaw';
      console.log('\n== the cycle-rickshaw: a fare ride, the rickshaw-wala pedals');
      await fresh(page);
      const sp = await roadNear(page, 'charminar');
      const t = await page.evaluate(() => { const T = N.vehicles.TYPES.rickshaw; return T && { kid: N.vehicles.canDrive('rickshaw'), fare: !!T.fare, refuse: !!T.refuse, pedal: !!T.pedal }; });
      check(t && !t.kid && t.fare && t.refuse && t.pedal, 'TYPES.rickshaw: not kidOk (Chinnu may not pedal it), a fare type, refusal lines', t);
      // a parked rickshaw with nobody on it: a refusal, never "Pedal rickshaw"
      const pk = await page.evaluate((sp) => {
        const p = N.player; p.teleport(sp.x, sp.y);
        const v = N.vehicles.spawn('rickshaw', sp.x + Math.cos(sp.angle) * 22, sp.y + Math.sin(sp.angle) * 22, sp.angle, {});
        window.__rk = v;
        return N.vehicles.offerFor(v);
      }, sp);
      check(pk && pk.kind === 'refuse', 'a parked cycle-rickshaw: "' + (pk && pk.label) + '" (he does not pedal it)', pk);
      await page.evaluate(() => N.vehicles.remove(window.__rk));
      // a working rickshaw with its rickshaw-wala: "Ride rickshaw (fare)" via ACTION -> the fare card
      await page.evaluate((sp) => {
        const v = N.vehicles.spawn('rickshaw', sp.x + Math.cos(sp.angle) * 20, sp.y + Math.sin(sp.angle) * 20, sp.angle, { driver: true });
        v.trafficOwned = true; v.controller = (q) => { q.ctl.brake = true; q.ctl.throttle = 0; };
        window.__rk = v;
        window.__travel = null; N.on('travel', (d) => { window.__travel = d; });
      }, sp);
      await frames(page, 6);
      const lab = await page.evaluate(() => ({ label: N.input.actionLabel, offer: N.vehicles.offerFor(window.__rk) }));
      check(lab.offer && lab.offer.kind === 'fare' && lab.offer.label === 'Ride rickshaw (fare)' && lab.label === 'Ride rickshaw (fare)', 'a rickshaw with its rickshaw-wala: "' + lab.label + '"', lab);
      await page.keyboard.press('KeyE');
      await until(page, () => N.shops.isOpen(), 5000);
      const card = await page.evaluate(() => ({ cur: N.shops.current, onVeh: !!N.player.vehicle, drv: !!window.__rk.driver && window.__rk.driver !== N.player, rows: N.shops.debug.UI.items.map((it) => it.row.id) }));
      check(card.cur && card.cur.kind === 'auto_ride' && card.cur.name === 'Cycle-rickshaw' && !card.onVeh && card.drv, 'ACTION -> the "Cycle-rickshaw" fare card; Chinnu is not at the pedals, the rickshaw-wala is', card);
      // ride home: pick the destination, pay, the ride passes (VHS ▶▶) and drops him there
      const go = await page.evaluate(() => {
        const UI = N.shops.debug.UI;
        const i = UI.items.findIndex((it) => it.row.id === 'to_home');
        if (i < 0) return { i };
        N.shops.debug.activate(i);
        const j = UI.items.findIndex((it) => it.row.id === 'pay');
        if (j >= 0) N.shops.debug.activate(j);
        if (N.shops.debug.S.ff) N.shops.debug.S.ff.ms = 400; // the VHS ▶▶ in 0.4 s of game time (a loaded machine runs slow)
        return { i, j, onVeh: !!N.player.vehicle };
      });
      check(go.i >= 0 && go.j >= 0 && !go.onVeh, 'fare card: "home" -> pay -> the ride starts (he is a passenger, not at the pedals)', go);
      const arrived = await until(page, () => !!window.__travel, 40000);
      const end = await page.evaluate(() => { const h = N.places.home, p = N.player, v = window.__rk; const F = N.shops.debug.S.ff; return { ff: F && { t: F.t, ms: F.ms, applied: F.applied }, st: N.state.mode, travel: window.__travel, d: Math.hypot(h.x - p.x, h.y - p.y), onVeh: !!p.vehicle, mode: p.mode, rkDriver: !!v.driver && v.driver !== p, pedalling: v.driver === p }; });
      check(arrived && end.travel && end.travel.mode === 'rickshaw' && end.d < 220 && !end.onVeh && end.mode === 'foot' && end.rkDriver && !end.pedalling, 'the rickshaw ride ends at home: on foot, the rickshaw-wala still pedals it, never Chinnu', end);
      // debug allowHeavy still lets him pedal one (debug only)
      const dbg = await page.evaluate(() => { N.vehicles.allowHeavy = true; const k = N.vehicles.canDrive('rickshaw'); N.vehicles.allowHeavy = false; return k; });
      check(dbg === true, 'debug allowHeavy still lifts the rule');
      await checkErrors(page, errors, 'rickshaw');
    }
  } catch (e) {
    fail('test crashed: ' + (e.stack || e.message));
  } finally {
    await browser.close();
  }
  console.log('\n' + (failures.length ? failures.length + ' FAILED:\n  ' + failures.join('\n  ') : 'ALL PASSED'));
  process.exit(failures.length ? 1 : 0);
})();
