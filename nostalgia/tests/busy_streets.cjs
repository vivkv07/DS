/* NOSTALGIA — tests/busy_streets.cjs  (traffic.js: streets as full as 2003 Hyderabad's, by how busy each spot is)
 * Headless Chromium + SwiftShader WebGL (three.js served from vendor/ like tests/breakers.cjs).
 *  1. the busyness grid: Koti / Sultan Bazaar, Charminar and a station busier than a Banjara Hills lane (people and
 *     traffic), every value inside [min, max]
 *  2. the targets follow it: more people and vehicles wanted at Koti at 17:30 than in a Jubilee Hills lane; a busy
 *     spot asks for most of the cap
 *  3. 3D: after filling, nearly everyone is inside the drawing range (none kept alive unseen far beyond it), and the
 *     new arrivals turn up out of the camera's sight (behind / beside it), never in front of it
 *  4. the spawns keep to the busier spots: the people's spots are busier on average than the road graph's round them
 *  5. zero console errors, page errors and N.err
 *   node nostalgia/tests/busy_streets.cjs
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const failures = [];
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const check = (cond, m, detail) => (cond ? ok(m) : fail(m + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 600) : '')));

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL, { timeout: 180000 });
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.mouse.click(2, 2);
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); N.debug.god(true); N.view.noPointerLock = true; if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    N.calendar.set(2003, 10, 20, 17, 30); N.clock.set(17, 30);
    window.__errs = []; const e0 = N.err; N.err = function (k, e) { window.__errs.push(k + ': ' + (e && e.message)); return e0.apply(this, arguments); };
    window.__rw = (secs) => new Promise((res) => { const r0 = N.time.real, t0 = performance.now(); (function chk() { if (N.time.real - r0 >= secs || performance.now() - t0 > 180000) res(N.time.real - r0); else setTimeout(chk, 50); })(); });
  });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 30000 });
  await page.waitForFunction(() => N.time.real > 1.5, null, { timeout: 240000, polling: 500 });

  console.log('\n== 1. the busyness grid');
  const d1 = await page.evaluate(() => {
    const T = N.traffic, B = T.TUNE.busy, P = N.places;
    const at = (id) => { const p = P[id]; return p ? T.busyAt(p.x, p.y) : null; };
    // a quiet lane in Banjara Hills: the bungalow lane node furthest from any busy place there
    const R = N.world.roads, bh = P.banjara_hills || { x: 6200, y: 4700 };
    const lanes = R.nodes.filter((n) => Math.hypot(n.x - bh.x, n.y - bh.y) < 500 && n.inc.every((id) => R.edges[id].kind === 'lane'));
    let quiet = null; for (const n of lanes) { const b = T.busyAt(n.x, n.y); if (!quiet || b.ped < quiet.ped) quiet = { ped: b.ped, veh: b.veh, x: n.x, y: n.y }; }
    const vals = []; for (let k = 0; k < 400; k++) { const b = T.busyAt(Math.random() * N.WORLD_W, Math.random() * N.WORLD_H); vals.push(b.ped, b.veh); }
    return { koti: at('sultan_bazaar') || at('koti'), charminar: at('charminar_plaza') || at('charminar'), station: at('secunderabad_station') || at('nampally_station'), quiet, min: B.min, max: B.max, lo: Math.min(...vals), hi: Math.max(...vals) };
  });
  check(d1.quiet && d1.koti.ped > d1.quiet.ped + 0.4 && d1.koti.veh > d1.quiet.veh, `Koti busier than a Banjara Hills lane (people ${d1.koti.ped.toFixed(2)} vs ${d1.quiet && d1.quiet.ped.toFixed(2)}, traffic ${d1.koti.veh.toFixed(2)} vs ${d1.quiet && d1.quiet.veh.toFixed(2)})`, d1);
  check(d1.charminar.ped > 1.2 && d1.station.ped > 1.0, `Charminar (${d1.charminar.ped.toFixed(2)}) and the station (${d1.station.ped.toFixed(2)}) among the busiest`, d1);
  check(d1.lo >= d1.min - 1e-6 && d1.hi <= d1.max + 1e-6, `every value inside [${d1.min}, ${d1.max}] (${d1.lo.toFixed(2)}..${d1.hi.toFixed(2)})`);

  console.log('\n== 2. the targets follow it');
  const d2 = await page.evaluate(async () => {
    const T = N.traffic, out = {};
    for (const [k, id] of [['koti', 'sultan_bazaar'], ['quiet', 'jubilee_hills']]) {
      const p = N.places[id] || N.places.koti;
      N.player.teleport(p.x, p.y);
      await window.__rw(1.2);
      const st = T.stats();
      out[k] = { targets: st.targets, busy: st.busy };
    }
    out.cap = T.TUNE.caps.desk;
    return out;
  });
  check(d2.koti.targets.ped > d2.quiet.targets.ped && d2.koti.targets.veh > d2.quiet.targets.veh, `more wanted at Koti than in Jubilee Hills (people ${d2.koti.targets.ped} vs ${d2.quiet.targets.ped}, vehicles ${d2.koti.targets.veh} vs ${d2.quiet.targets.veh})`, d2);
  check(d2.koti.targets.ped >= 0.7 * d2.cap.ped, `Koti at 17:30 asks for most of the cap (${d2.koti.targets.ped} of ${d2.cap.ped} people)`, d2);

  console.log('\n== 3. 3D: in the drawing range, arriving out of sight');
  await page.evaluate(() => { N.view3d.setQuality({ adaptive: false, pixelRatio: 0.5 }); N.view.set('tps'); });
  await page.waitForFunction(() => N.view.mode === 'tps' && N.view3d.ready, null, { timeout: 300000 });
  const d3 = await page.evaluate(async () => {
    const T = N.traffic, p = N.places.sultan_bazaar || N.places.koti;
    const n = N.world.roads.nearestNode(p.x, p.y);
    N.player.teleport(n.x + 8, n.y + 8);
    N.view3d.setCamera({ yaw: 0.6, pitch: 0.2, snap: true });
    await window.__rw(20);
    // new arrivals: where they are the first time we see them in the lists (polled every frame-ish)
    const known = new WeakSet(); for (const q of T.peds) known.add(q); for (const v of T.vehicles) known.add(v);
    let fresh = 0, inSight = 0; const where = [];
    const t0 = N.time.real;
    await new Promise((res) => {
      (function poll() {
        for (const q of T.peds.concat(T.vehicles)) {
          if (known.has(q)) continue; known.add(q); fresh++;
          if (!T.unseen(q.x, q.y, -8)) { inSight++; if (where.length < 4) where.push([Math.round(q.x - N.player.x), Math.round(q.y - N.player.y)]); }
        }
        if (N.time.real - t0 > 12) res(); else requestAnimationFrame(poll);
      })();
    });
    const far = N.view3d.quality.actorDist || 620, pl = N.player;
    const inR = (q) => Math.hypot(q.x - pl.x, q.y - pl.y) < far + 60;
    const peds = T.peds.filter((q) => q.alive), veh = T.vehicles.filter((v) => v.alive);
    return { fresh, inSight, where, peds: peds.length, pedsIn: peds.filter(inR).length, veh: veh.length, vehIn: veh.filter(inR).length, ms: T.stats().ms };
  });
  check(d3.peds >= 40 && d3.pedsIn >= 0.9 * d3.peds, `${d3.peds} people round Koti, ${d3.pedsIn} of them inside the drawing range`, d3);
  check(d3.veh >= 15 && d3.vehIn >= 0.85 * d3.veh, `${d3.veh} vehicles, ${d3.vehIn} inside the drawing range`, d3);
  check(d3.fresh >= 3 && d3.inSight <= Math.max(1, d3.fresh * 0.1), `new arrivals out of the camera's sight (${d3.fresh - d3.inSight} of ${d3.fresh})`, d3);

  console.log('\n== 4. the busier spots fill first');
  const d4 = await page.evaluate(() => {
    const T = N.traffic, R = N.world.roads, pl = N.player, far = N.view3d.quality.actorDist || 620;
    const walkers = T.peds.filter((q) => q.alive && !q.zone);
    const avgP = walkers.reduce((s, q) => s + T.busyAt(q.x, q.y).ped, 0) / Math.max(1, walkers.length);
    const nodes = R.nodes.filter((n) => Math.hypot(n.x - pl.x, n.y - pl.y) < far && n.inc.length);
    const avgN = nodes.reduce((s, n) => s + T.busyAt(n.x, n.y).ped, 0) / Math.max(1, nodes.length);
    return { walkers: walkers.length, avgP: +avgP.toFixed(3), avgN: +avgN.toFixed(3) };
  });
  check(d4.walkers >= 10 && d4.avgP >= d4.avgN - 0.02, `the walkers' spots are as busy or busier than the road graph's round them (${d4.avgP} vs ${d4.avgN})`, d4);

  console.log('\n== 5. errors');
  const errs = await page.evaluate(() => window.__errs);
  check(!errors.length && !errs.length, 'zero console errors, page errors and N.err', { errors: errors.slice(0, 5), errs: errs.slice(0, 5) });
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAIL' : 'all ok'));
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
