/* NOSTALGIA — tests/decker.cjs  (the double-decker: vehicles.js decker_bus, traffic.js spawnAt / routeBias / routeBus,
 * view3d_actors.js bus_decker + the top deck, view3d.js passengerEye)
 * Headless Chromium + SwiftShader WebGL (three.js served from vendor/ like tests/graphics_ultra.cjs).
 *  1. the type: a heavy route bus with a top deck; traffic weights near Charminar, Koti and Necklace Road, none far
 *     off (Hitec City, Secunderabad) or in lanes, thinned at night, nothing once 4 are about
 *  2. the beat: routeBias keeps them on it (every way on, the way back favoured off it)
 *  3. traffic spawns them round the beat; a decker's route stops at the bus stops (a lorry's doesn't)
 *  4. boarding (decker.js): up the stairs onto the top deck; walking up the aisle (never off it), "Sit (the front
 *     seat!)", the 2D cutaway; the bus drives off with him in his seat; standing up and walking back down the moving
 *     bus (he stays aboard); a hard brake throws him forward
 *  5. 3D: third person on the top deck with the roof off, the passengers in their seats; first person in the front
 *     seat (the eye at the front window, the interior round him) and standing in the aisle; down the stairs and off
 *     (the bus stops first)
 *  6. zero console errors, page errors and N.err
 *
 *   node nostalgia/tests/decker.cjs          (SHOTS=0 skips the screenshots)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'decker');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const SHOTS = process.env.SHOTS !== '0';
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const check = (cond, m, detail) => (cond ? ok(m) : fail(m + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 500) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// game-clock waits (see tests/traffic.cjs)
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

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(GW);
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
    N.debug.setTime(10, 30);
    window.__toasts = []; const t0 = N.hud.toast; N.hud.toast = function (t) { window.__toasts.push(String(t)); return t0.apply(this, arguments); };
  });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 30000 });

  console.log('\n== 1. the type and where traffic puts it');
  const t1 = await page.evaluate(() => {
    const T = N.vehicles.TYPES.decker_bus, P = N.places, TR = N.traffic;
    const w = (id, o) => { const q = P[id]; return TR.typeWeights('market', Object.assign({ kind: 'arterial', x: q.x, y: q.y, minutes: 10 * 60 + 30 }, o)).decker_bus || 0; };
    const far = ['hitec_city', 'secunderabad', 'mehdipatnam', 'golconda'].filter((id) => P[id]);
    return {
      type: !!T, cls: T && T.cls, routeBus: !!(T && T.routeBus), topDeck: !!(T && T.topDeck), offer: T ? N.vehicles.offerFor({ T, alive: true, speed: 0, driver: {}, type: 'decker_bus' }) : null,
      near: { charminar: w('charminar'), koti: w('koti'), necklace_road: w('necklace_road') },
      far: far.map((id) => [id, w(id)]),
      lane: w('koti', { kind: 'lane' }), night: w('koti', { minutes: 23 * 60 }),
      noXY: TR.typeWeights('market', { kind: 'arterial' }).decker_bus || 0,
      bus: w('koti', {}) >= 0 ? TR.typeWeights('market', { kind: 'arterial', x: P.koti.x, y: P.koti.y }).bus : null,
    };
  });
  check(t1.type && t1.cls === 'heavy' && t1.routeBus && t1.topDeck, 'decker_bus: a heavy route bus with a top deck', t1);
  check(t1.near.charminar > 4 && t1.near.koti > 4 && t1.near.necklace_road > 4, `spawn weight on the beat (Charminar ${t1.near.charminar}, Koti ${t1.near.koti}, Necklace Road ${t1.near.necklace_road}; city bus ${t1.bus})`, t1.near);
  check(t1.far.length >= 2 && t1.far.every((f) => f[1] === 0) && t1.noXY === 0, `none far off the beat (${t1.far.map((f) => f[0] + ' ' + f[1]).join(', ')})`, t1);
  check(t1.lane === 0 && t1.night > 0 && t1.night < t1.near.koti * 0.3, `none in lanes, thinned at night (${t1.night.toFixed(2)})`, t1);

  console.log('\n== 2. the beat');
  const t2 = await page.evaluate(() => {
    const T = N.vehicles.TYPES.decker_bus, P = N.places;
    const k = P.koti, far = { x: k.x + 2400, y: k.y + 2400 }, nearer = { x: k.x + 1800, y: k.y + 1800 }, further = { x: k.x + 3000, y: k.y + 3000 };
    return { onBeat: T.routeBias({}, k, { x: k.x + 200, y: k.y }), back: T.routeBias({}, far, nearer), away: T.routeBias({}, far, further) };
  });
  check(t2.onBeat === 1 && t2.back > t2.away * 4, `routeBias: anywhere on the beat ${t2.onBeat}; off it, back ${t2.back} vs further away ${t2.away}`, t2);

  console.log('\n== 3. traffic');
  let seen = 0, where = [];
  for (const id of ['charminar', 'koti', 'necklace_road']) {
    await page.evaluate((id) => { const q = N.places[id]; N.player.teleport(q.x, q.y); if (N.render.snapCamera) N.render.snapCamera(); N.traffic.fill(); }, id);
    await gwait(page, 12);
    const n = await page.evaluate(() => N.traffic._T.vehicles.filter((v) => v.alive && v.type === 'decker_bus').length);
    where.push(id + ' ' + n); seen += n;
  }
  const cap = await page.evaluate(() => N.traffic._T.vehicles.filter((v) => v.alive && v.type === 'decker_bus').length);
  check(seen > 0, `traffic runs double-deckers on the beat (${where.join(', ')})`, where);
  check(cap <= 4, `no more than 4 about (${cap})`, cap);
  const t3 = await page.evaluate(() => {
    const RI = N.traffic.index, out = { tried: 0 };
    for (const [eid, list] of RI.stops) {
      const e = RI.edges[eid]; if (!e || e.kind === 'lane' || e.kind === 'path') continue;
      for (const s of list) {
        const A = RI.nodes[s.leftOfAB ? e.a : e.b], B = RI.nodes[s.leftOfAB ? e.b : e.a];
        const len = Math.hypot(B.x - A.x, B.y - A.y), d = (s.leftOfAB ? s.t : 1 - s.t) * len;
        if (d < 50 || len - d < 60) continue;
        out.tried++;
        const dd = N.traffic.spawnVehicle('decker_bus', { x: A.x, y: A.y, to: B.id });
        const lo = N.traffic.spawnVehicle('lorry', { x: A.x, y: A.y, to: B.id });
        const r = { place: s.place.id, decker: dd ? dd.tr.wp.filter((w) => w.place).map((w) => w.place) : null, lorry: lo ? lo.tr.wp.filter((w) => w.place).length : null };
        for (const v of [dd, lo]) if (v) { v.alive = false; N.entities.remove && N.entities.remove(v); }
        if (r.decker && r.lorry != null && r.decker.length) { out.r = r; return out; }
        if (out.tried > 40) return out;
      }
    }
    return out;
  });
  check(!!t3.r && t3.r.decker.indexOf(t3.r.place) >= 0 && t3.r.lorry === 0, `its route stops at the bus stop (${t3.r ? t3.r.place : '?'}), a lorry's on the same road doesn't`, t3);

  console.log('\n== 4. boarding: up to the top deck');
  const t4 = await page.evaluate(async () => {
    const q = N.places.koti; N.player.teleport(q.x, q.y + 40); if (N.render.snapCamera) N.render.snapCamera();
    for (const v of N.traffic._T.vehicles) if (v.type === 'decker_bus' && v.alive) { v.alive = false; N.entities.remove && N.entities.remove(v); }
    const n = N.world.roads.nearestNode(q.x, q.y);
    const v = N.traffic.spawnVehicle('decker_bus', { x: n.x, y: n.y, angle: 0 });
    if (!v) return { spawned: false };
    v.speed = 0; v.vx = v.vy = 0; v.tr.stopT = 600; // held at the stop while he climbs up and looks round
    const c = Math.cos(v.angle), s = Math.sin(v.angle);
    N.player.teleport(v.x + s * (v.T.d / 2 + 6), v.y - c * (v.T.d / 2 + 6)); // beside it, on its left (the platform side)
    window.__dd = v;
    window.__ev = []; for (const e of ['decker:board', 'decker:sit', 'decker:stand', 'decker:sway']) N.on(e, (d) => window.__ev.push(e));
    const offer = N.vehicles.offerFor(v);
    const boarded = N.vehicles.boardBus(N.player, v);
    await window.__gw(3.4);
    const D = N.decker.state;
    return { spawned: true, offer, boarded, veh: N.player.vehicle === v, as: N.vehicles.isPassenger(), toasts: window.__toasts.slice(-4), D: D && { x: D.x, z: D.z, sit: D.sit }, ev: window.__ev.slice() };
  });
  check(t4.spawned && t4.offer && t4.offer.kind === 'bus', `Board bus offer at the double-decker (${t4.offer && t4.offer.label})`, t4);
  check(t4.boarded && t4.veh && t4.as === 'deck' && t4.D && t4.D.x < -15 && t4.D.sit === -1, `up the stairs: on the top deck at the back, standing (deck x ${t4.D && t4.D.x.toFixed(1)})`, t4);
  check(t4.toasts.some((t) => /top deck/i.test(t)), 'the top-deck toast (walk about, the free front seat)', t4.toasts);
  // walking up the aisle to the front (the stick along the bus's heading; 2D: the stick is in world directions)
  const walk = async (dir, secs) => page.evaluate(async ([dir, secs]) => {
    const v = window.__dd, D = N.decker.state; let maxZ = 0, out = 0;
    const t0 = N.time.now;
    while (N.time.now - t0 < secs) {
      N.input.setMove(Math.cos(v.angle) * dir, Math.sin(v.angle) * dir, true);
      await window.__gw(0.1);
      const st = N.decker.state; if (!st) break;
      if (st.x < 22) maxZ = Math.max(maxZ, Math.abs(st.z)); // (in the seat rows: the aisle; the front is open)
      const d = Math.hypot(N.player.x - v.x, N.player.y - v.y); if (d > 33) out++;
    }
    N.input.setMove(null);
    await window.__gw(0.3);
    const st = N.decker.state;
    return st && { x: +st.x.toFixed(2), z: +st.z.toFixed(2), maxZ: +maxZ.toFixed(2), out, sit: st.sit, near: N.interact.current && (typeof N.interact.current.label === 'string' ? N.interact.current.label : '') };
  }, [dir, secs]);
  const w1 = await walk(1, 3.2);
  check(w1 && w1.x > 24 && w1.maxZ < 1.2 && w1.out === 0, `walked up the aisle to the front (deck x ${w1 && w1.x}, never off the aisle: |z| <= ${w1 && w1.maxZ})`, w1);
  check(w1 && /front seat/i.test(w1.near || ''), `at the front: "${w1 && w1.near}"`, w1);
  const t5 = await page.evaluate(async () => {
    const cur = N.interact.current; if (cur && cur.use) cur.use(N.player);
    await window.__gw(0.3);
    const D = N.decker.state; return { sit: D && D.sit, front: N.decker.FRONT, sitting: N.player.sitting, label: N.interact.current && N.interact.current.label, ev: window.__ev.slice() };
  });
  check(t5.sit === t5.front && t5.sitting && /stand/i.test(t5.label || ''), `sat in the front seat (then the offer is "${t5.label}")`, t5);
  if (SHOTS) {
    // close in on the bus (the 2D cutaway: the roof off, the deck from above, him in the front seat)
    await page.evaluate(() => { window.__z = N.render.baseZoom; N.render.baseZoom = 3.2; N.render.cam.zoom = 3.2; if (N.render.snapCamera) N.render.snapCamera(); /* (baseZoom: the follow camera eases cam.zoom back) */ });
    await gwait(page, 0.6);
    await page.screenshot({ path: path.join(OUT, 'decker_2d_frontseat.png'), timeout: 120000 });
  }
  // the bus pulls away: he goes with it, in his seat
  const t6 = await page.evaluate(async () => {
    const v = window.__dd, x0 = v.x, y0 = v.y;
    // (the road ahead cleared: a jam at the junction would hold the bus, which is not what this checks)
    for (const q of N.traffic._T.vehicles) if (q !== v && q.alive && Math.hypot(q.x - v.x, q.y - v.y) < 400) { q.alive = false; if (N.entities.remove) N.entities.remove(q); }
    v.tr.stopT = 0.01;
    let maxOff = 0;
    for (let i = 0; i < 40; i++) { await window.__gw(0.15); const st = N.decker.state; if (!st || st.sit < 0) break; const s = N.decker.SEATS[st.sit], w = N.decker.toWorld(v, s.x, s.z); maxOff = Math.max(maxOff, Math.hypot(N.player.x - w.x, N.player.y - w.y)); }
    return { moved: Math.hypot(v.x - x0, v.y - y0), speed: v.speed, maxOff, on: N.decker.onDeck(), sit: N.decker.state && N.decker.state.sit };
  });
  check(t6.moved > 15 && t6.on && t6.sit === 1 && t6.maxOff < 1, `the bus drives off (${t6.moved.toFixed(0)} u), he rides along in his seat (off it by ${t6.maxOff.toFixed(2)} u)`, t6);
  // standing up and walking back down the moving bus
  await page.evaluate(() => { const c = N.interact.current; if (c && /stand/i.test(c.label)) c.use(N.player); });
  const w2 = await walk(-1, 3.6);
  check(w2 && w2.sit === -1 && w2.x < -14 && w2.out === 0, `stood up and walked back along the moving bus (deck x ${w2 && w2.x}, stayed aboard)`, w2);
  if (SHOTS) { await page.screenshot({ path: path.join(OUT, 'decker_2d_walking.png'), timeout: 120000 }); await page.evaluate(() => { N.render.baseZoom = window.__z || 1; }); }
  // a hard brake throws a standing passenger forward
  const t7 = await page.evaluate(async () => {
    const D = N.decker.state, x0 = D.x, v = window.__dd;
    // the bus braking hard for half a second (its speed dropping 170 u/s each second, seen from the deck: every
    // step of the deck's system, whatever the frame rate)
    const sys = N.systems.get('decker'), upd = sys.update;
    sys.update = function (dt) { if (N.decker.state) N.decker.state.lastSp = (v.speed || 0) + 170 * dt; return upd.apply(this, arguments); };
    try { await window.__gw(0.5); } finally { sys.update = upd; }
    await window.__gw(0.2);
    return { dx: N.decker.state.x - x0, ev: window.__ev.filter((e) => e === 'decker:sway').length, toast: window.__toasts.some((t) => /rail/i.test(t)) };
  });
  check(t7.dx > 0.5 && t7.ev > 0, `a hard brake throws him forward (${t7.dx.toFixed(2)} u, a sway event, the conductor's shout: ${t7.toast})`, t7);
  // a stop: passengers get up and go down the stairs, others come up and find a seat (walking the aisle)
  const t7b = await page.evaluate(async () => {
    const v = window.__dd, D = N.decker.state, before = N.decker.looks(v).map((l) => !!l);
    void D; N.decker.sit(N.decker.FRONT); // (out of the way, in the front seat)
    const ev = []; N.on('decker:walker', (d) => ev.push(d.kind + ':' + d.seat));
    N.decker.stop();
    let maxW = 0, offAisle = 0;
    for (let i = 0; i < 70; i++) {
      await window.__gw(0.2);
      const W = N.decker.walkers(v); maxW = Math.max(maxW, W.length);
      for (const w of W) if (Math.abs(w.z) > 0.6 && w.pi > 0 && w.pi < w.path.length - 1) offAisle++;
      if (i > 15 && !W.length) break;
    }
    const after = N.decker.looks(v).map((l) => !!l);
    return { ev, maxW, offAisle, left: N.decker.walkers(v).length, changed: after.filter((t, i) => t !== before[i]).length };
  });
  check(t7b.ev.some((e) => /^leave/.test(e)) && t7b.ev.some((e) => /^arrive/.test(e)) && t7b.maxW >= 2 && t7b.left === 0 && t7b.changed >= 2, `a stop: ${t7b.ev.join(', ')}; they walk the aisle and are seated / gone (${t7b.changed} seats changed hands)`, t7b);

  await page.evaluate(() => { N.decker.stand(); });

  console.log('\n== 5. 3D');
  await page.evaluate(() => { N.view3d.setQuality({ adaptive: false, pixelRatio: 1 }); N.view.set('tps'); });
  await page.waitForFunction(() => N.view.mode === 'tps' && N.view3d.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const v = window.__dd; v.tr.stopT = 600; v.speed = 0; v.vx = v.vy = 0; N.decker.state.x = 8; N.decker.state.z = 0; });
  await gwait(page, 0.5);
  await page.evaluate(() => { N.state.mode = 'paused'; const v = window.__dd; N.view3dActors.debug.track(v); N.view3d.setCamera({ yaw: (v.angle || 0) + 0.5, pitch: 0.55, snap: true }); N.view3d.settle(30000); if (N.hud && N.hud.hide) N.hud.hide(); });
  await sleep(4000);
  const m5 = await page.evaluate(() => {
    const rec = N.view3dActors.debug.rec, counts = N.view3dActors.debug.counts();
    return { model: rec && rec.model, cockpit: rec && rec.cockpit, riders: rec && rec.riders ? rec.riders.length : 0, pools: Object.keys(counts).filter((k) => /decker/.test(k)) };
  });
  check(m5.model === 'bus_decker_open' && !m5.cockpit, `third person on the top deck: the roof comes off (${m5.model}; ${m5.pools.join(', ')})`, m5);
  check(m5.riders >= 8, `the top deck's passengers in their seats (${m5.riders} seated)`, m5);
  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'decker_3d_topdeck.png'), timeout: 240000 });
  await page.evaluate(() => { const v = window.__dd; N.view3d.setCamera({ yaw: (v.angle || 0) + Math.PI / 2 + 0.3, pitch: 0.32, snap: true }); N.view3d.settle(30000); });
  await sleep(3000);
  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'decker_3d_side.png'), timeout: 240000 });
  // and from outside, not aboard: the closed model, the upper deck's passengers behind the glass
  await page.evaluate(() => { N.state.mode = 'play'; });
  await page.evaluate(() => { N.view.set('fps'); });
  await page.waitForFunction(() => N.view.mode === 'fps', null, { timeout: 60000 });
  // (in play: the first-person eye follows him each step; the bus is held at the stop)
  await page.evaluate(() => { const v = window.__dd; v.tr.stopT = 600; v.speed = 0; N.decker.sit(N.decker.FRONT); N.view3d.setCamera({ yaw: v.angle || 0, pitch: 0.12, snap: true }); N.view3d.settle(30000); });
  await gwait(page, 0.6);
  await sleep(3000);
  const m6 = await page.evaluate(() => {
    const E = N.view3d.engine, cam = E.camera.position, eye = N.decker.eye(), rec = N.view3dActors.debug.rec, counts = N.view3dActors.debug.counts();
    return { cam: [cam.x, cam.y, cam.z], eye, el: N.view3d.elevation(N.player), cockpit: rec && rec.cockpit, model: rec && rec.model, interior: Object.keys(counts).filter((k) => /^int:/.test(k)) };
  });
  const dxy = Math.hypot(m6.cam[0] - m6.eye.x, m6.cam[2] - m6.eye.y);
  check(dxy < 1.2 && Math.abs(m6.cam[1] - m6.el - m6.eye.h) < 1.2 && m6.cam[1] - m6.el > 19, `first person in the front seat: the eye up at the top deck's front window (${dxy.toFixed(2)} u off, ${(m6.cam[1] - m6.el).toFixed(1)} u above the road)`, m6);
  check(m6.cockpit && m6.interior.indexOf('int:bus_decker') >= 0, 'the top deck drawn round him (the interior, no body, no steering wheel)', m6);
  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'decker_fps_frontseat.png'), timeout: 240000 });
  await page.evaluate(() => { N.decker.stand(); N.decker.state.x = 6; N.view3d.setCamera({ yaw: (window.__dd.angle || 0) + Math.PI, pitch: 0.15, snap: true }); });
  await gwait(page, 0.6);
  await sleep(2000);
  const m7 = await page.evaluate(() => { const E = N.view3d.engine, cam = E.camera.position, eye = N.decker.eye(); return { d: Math.hypot(cam.x - eye.x, cam.z - eye.y), h: cam.y - N.view3d.elevation(N.player), eh: eye.h }; });
  check(m7.d < 1.2 && Math.abs(m7.h - m7.eh) < 1.2 && m7.eh > m6.eye.h, `first person standing in the aisle, looking back down the deck (eye ${m7.h.toFixed(1)} u up, higher than seated)`, m7);
  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'decker_fps_aisle_back.png'), timeout: 240000 });
  await page.evaluate(() => { N.state.mode = 'play'; N.view.set('tps'); });
  await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 60000 });

  console.log('\n== 5b. down the stairs and off');
  const t8 = await page.evaluate(async () => {
    const v = window.__dd; v.tr.stopT = 0.01; // moving again: "Go down" asks the conductor to stop first
    await window.__gw(2.5);
    const D = N.decker.state; D.x = -19.6; D.z = -0.2; D.sit = -1;
    await window.__gw(0.3);
    const lab = N.interact.current && N.interact.current.label;
    if (N.interact.current) N.interact.current.use(N.player);
    const asked = v.stopReq;
    let t = 0; while (N.player.vehicle && t < 12) { await window.__gw(0.25); t += 0.25; }
    const D2 = N.decker.state; return { lab, asked, off: !N.player.vehicle, deck: D2 && { x: D2.x, z: D2.z, sit: D2.sit }, d: Math.hypot(N.player.x - v.x, N.player.y - v.y), speed: v.speed, stopT: v.tr && v.tr.stopT, stopReq: v.stopReq, ob: v.tr && v.tr.ob ? { gap: v.tr.ob.gap, kind: v.tr.ob.e && v.tr.ob.e.kind } : null };
  });
  check(/go down/i.test(t8.lab || '') && t8.off && !t8.deck && t8.d < 40, `"${t8.lab}" at the top of the stairs: the bus stops, he gets down beside it (${t8.d.toFixed(0)} u)`, t8);
  await page.evaluate(() => { N.view.set('top'); });

  console.log('\n== 6. errors');
  const nerr = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + String(e.msg).split('\n')[0]));
  check(errors.length === 0 && nerr.length === 0, 'no console / page / N.err errors', errors.concat(nerr).slice(0, 6));
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
