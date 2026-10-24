/* NOSTALGIA — tests/minimap.cjs  (hud.js: the minimap you can drive by)
 * Headless Chromium + SwiftShader WebGL (three.js served from vendor/ like tests/breakers.cjs).
 *  1. the setting: Settings > Screen > Minimap (Auto / North up / Turns with you), remembered in localStorage
 *  2. orientation: top-down + Auto = north up; 'turn' in top-down = his facing up; 3D + Auto = the camera's heading up
 *     (a blip straight ahead of the camera is drawn straight above the centre of the minimap canvas, and where the
 *     north-up map puts it in North up); the N badge rides the edge where north lies
 *  3. look ahead: moving, the map's centre runs ahead along the motion (the player sits back from the centre)
 *  4. the route: on foot a walker's; in a car the roads' own rules (every step a legal link, never a footpath), from the
 *     junction the car is heading for (not the nearer one behind it), keeping to the bigger roads; a cycle on roads
 *  5. the next-turn chip: a turn with its distance along a car's route; "turn round" when the route is behind it
 *  6. screenshots: 3D in the Ambassador, heading-up with the chip, and the same moment north-up (tests/out/minimap)
 *  7. zero console errors, page errors and N.err
 *   node nostalgia/tests/minimap.cjs        (SHOTS=0 skips the screenshots)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'minimap');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const SHOTS = process.env.SHOTS !== '0';
fs.mkdirSync(OUT, { recursive: true });
const failures = [];
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const check = (cond, m, detail) => (cond ? ok(m) : fail(m + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 600) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

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
    N.debug.setTime(11, 0);
    N.vehicles.ageRules = false; // (he drives the Ambassador)
    window.__errs = []; const e0 = N.err; N.err = function (k, e) { window.__errs.push(k + ': ' + (e && e.message)); return e0.apply(this, arguments); };
    // where a blip of a colour of its own sits on the minimap canvas, relative to its centre (fractions of its size)
    // waits on the game's real clock (N.time.real runs even with N.time.scale 0): a headless top-down frame can take
    // half a second, and the minimap eases per frame of game time
    window.__rw = (secs) => new Promise((res) => { const r0 = N.time.real, t0 = performance.now(); (function chk() { if (N.time.real - r0 >= secs || performance.now() - t0 > 120000) res(N.time.real - r0); else setTimeout(chk, 50); })(); });
    window.__blipAt = (rgb) => {
      const c = document.querySelector('.hud-minimap canvas'), g = c.getContext('2d'), S = c.width, d = g.getImageData(0, 0, S, S).data;
      let n = 0, sx = 0, sy = 0;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4; if (Math.abs(d[i] - rgb[0]) < 40 && Math.abs(d[i + 1] - rgb[1]) < 40 && Math.abs(d[i + 2] - rgb[2]) < 40) { n++; sx += x; sy += y; } }
      return n ? { n, x: +(sx / n / S - 0.5).toFixed(3), y: +(sy / n / S - 0.5).toFixed(3) } : { n: 0 };
    };
  });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 30000 });
  // (the first minimap draw renders the whole map image: the loop stalls a while)
  await page.waitForFunction(() => N.time.real > 1.5, null, { timeout: 240000, polling: 500 });

  console.log('\n== 1. the setting');
  const d1 = await page.evaluate(() => {
    const M = N.hud.minimap, m0 = M.mode;
    M.setMode('north'); const ls1 = localStorage.getItem('nostalgia.minimap.v1');
    M.setMode('nonsense'); const kept = M.mode;
    M.setMode('auto');
    return { m0, ls1, kept, now: M.mode, ls2: localStorage.getItem('nostalgia.minimap.v1') };
  });
  check(d1.m0 === 'auto', 'a new game starts on Auto', d1);
  check(d1.ls1 === 'north' && d1.kept === 'north' && d1.now === 'auto' && d1.ls2 === 'auto', 'setMode() is remembered (localStorage) and ignores a bad value', d1);
  // the settings row (opened through the pause menu like a player would)
  const row = await page.evaluate(async () => {
    N.menus.openSettings();
    await new Promise((r) => setTimeout(r, 500));
    const el = document.querySelector('.st-row[data-id="minimap"]');
    return { text: el ? Array.from(el.querySelectorAll('button')).map((b) => b.textContent.trim()).join(' / ') : null, top: N.menus.debugState().top };
  });
  for (let i = 0; i < 4 && (await page.evaluate(() => N.menus.debugState().top)); i++) { await page.keyboard.press('Escape'); await sleep(300); }
  await page.evaluate(() => { for (const m of ['paused']) while (N.state.has(m)) N.state.remove(m); });
  check(row.text && /Auto/.test(row.text) && /North up/.test(row.text) && /Turns with you/.test(row.text), 'Settings > Screen has the Minimap row (Auto / North up / Turns with you)', row);

  console.log('\n== 2. orientation');
  const d2 = await page.evaluate(async () => {
    const p = N.player, M = N.hud.minimap, wait = (ms) => window.__rw(ms / 1000);
    N.time.scale = 0; p.vx = p.vy = 0;
    M.setMode('auto'); await wait(900);
    const topAuto = M.state().rot;
    p.angle = 0.7; M.setMode('turn'); await wait(1200);
    const topTurn = M.state().rot, nTurned = document.querySelector('.hud-minimap .mm-n').classList.contains('turned');
    M.setMode('auto'); await wait(900);
    return { topAuto, topTurn, nTurned, nBack: document.querySelector('.hud-minimap .mm-n').classList.contains('turned') };
  });
  check(Math.abs(d2.topAuto) < 0.02, 'top-down + Auto: north up', d2);
  check(angDiff(d2.topTurn, -Math.PI / 2 - 0.7) < 0.05 && d2.nTurned, 'top-down + Turns with you: his facing is up, the N badge moves off the top', d2);
  check(!d2.nBack, 'back on Auto (top-down): the N badge is back at the top', d2);

  // 3D: the camera's heading up
  await page.evaluate(() => { N.time.scale = 1; N.view3d.setQuality({ adaptive: false, pixelRatio: 0.5 }); N.view.set('tps'); });
  await page.waitForFunction(() => N.view.mode === 'tps' && N.view3d.ready, null, { timeout: 300000 });
  const d3 = await page.evaluate(async () => {
    const p = N.player, M = N.hud.minimap, wait = (ms) => window.__rw(ms / 1000);
    const YAW = 0.9;
    N.time.scale = 0; p.vx = p.vy = 0;
    N.view3d.setCamera({ yaw: YAW, pitch: 0.25, snap: true });
    // a bright green blip 200 u straight ahead of the camera
    N.hud.blip('t:ahead', { x: p.x + Math.cos(YAW) * 200, y: p.y + Math.sin(YAW) * 200 }, { color: '#00ff00', icon: 'dot', size: 1.6 });
    await wait(1500);
    const st = M.state(), yaw = N.view.yaw, ahead = window.__blipAt([0, 255, 0]);
    const n = document.querySelector('.hud-minimap .mm-n'), mm = document.querySelector('.hud-minimap').getBoundingClientRect(), nb = n.getBoundingClientRect();
    const nPos = { x: +((nb.x + nb.width / 2 - mm.x) / mm.width - 0.5).toFixed(2), y: +((nb.y + nb.height / 2 - mm.y) / mm.height - 0.5).toFixed(2), turned: n.classList.contains('turned') };
    M.setMode('north'); await wait(1500);
    const north = window.__blipAt([0, 255, 0]), stN = M.state();
    M.setMode('auto'); await wait(300);
    N.hud.unblip('t:ahead');
    return { yaw, rot: st.rot, ahead, nPos, north, rotN: stN.rot, scale: 200 / (2 * stN.radius) };
  });
  check(angDiff(d3.rot, -Math.PI / 2 - d3.yaw) < 0.05, `3D + Auto: the map turns with the camera (rot ${d3.rot.toFixed(2)} for yaw ${d3.yaw.toFixed(2)})`, d3);
  check(d3.ahead.n > 4 && d3.ahead.y < -0.15 && Math.abs(d3.ahead.x) < 0.04, 'a blip straight ahead of the camera is drawn straight above the centre', d3.ahead);
  const ex = Math.cos(0.9) * d3.scale, ey = Math.sin(0.9) * d3.scale;
  check(Math.abs(d3.rotN) < 0.02 && d3.north.n > 4 && Math.abs(d3.north.x - ex) < 0.04 && Math.abs(d3.north.y - ey) < 0.04, `North up in 3D: the same blip sits where the north-up map has it (${d3.north.x}, ${d3.north.y} vs ${ex.toFixed(3)}, ${ey.toFixed(3)})`, d3.north);
  // north on screen: (sin rot, -cos rot)
  const nx = Math.sin(d3.rot), ny = -Math.cos(d3.rot);
  check(d3.nPos.turned && d3.nPos.x * nx + d3.nPos.y * ny > 0.3 && Math.max(Math.abs(d3.nPos.x), Math.abs(d3.nPos.y)) > 0.3, `the N badge rides the edge where north lies (${d3.nPos.x}, ${d3.nPos.y}; north (${nx.toFixed(2)}, ${ny.toFixed(2)}))`, d3.nPos);

  console.log('\n== 3. look ahead');
  const d4 = await page.evaluate(async () => {
    const p = N.player, M = N.hud.minimap, wait = (ms) => window.__rw(ms / 1000);
    M.setMode('north');
    N.debug.enterVehicle('ambassador');
    const v = p.vehicle; if (!v) return { err: 'no vehicle' };
    N.time.scale = 0; // (frozen: the car keeps its velocity and stays put; the map eases on real time)
    v.vx = 0; v.vy = -110; v.speed = 110; v.angle = -Math.PI / 2;
    await wait(2500);
    const st = M.state();
    v.vx = v.vy = 0; v.speed = 0;
    await wait(2500);
    const st2 = M.state();
    M.setMode('auto');
    return { look: st.look.map(Math.round), radius: Math.round(st.radius), back: st2.look.map(Math.round) };
  });
  check(!d4.err && d4.look[1] < -0.2 * d4.radius && Math.abs(d4.look[0]) < 10, `riding north at speed, the map looks ${-d4.look[1]} u ahead (radius ${d4.radius})`, d4);
  check(Math.hypot(d4.back[0], d4.back[1]) < 25, 'stopped, it eases back to the player', d4);

  console.log('\n== 4. the route');
  const d5 = await page.evaluate(async () => {
    const R = N.world.roads, p = N.player, wait = (ms) => window.__rw(ms / 1000);
    const walk = { walk: true, paths: true, costs: { path: 1.15 }, maxExpand: 40000 }, drive = { walk: false, paths: false, costs: { lane: 1.35, street: 1.1 }, maxExpand: 40000 };
    const byXY = new Map(); for (const n of R.nodes) byXY.set(n.x + ',' + n.y, n);
    const legal = (pts) => {
      const ns = pts.slice(1, -1).map((q) => byXY.get(q[0] + ',' + q[1]));
      if (ns.some((n) => !n)) return { bad: -1 };
      let bad = 0, path = 0;
      for (let i = 1; i < ns.length; i++) {
        const l = ns[i - 1].links.find((q) => q.to === ns[i].id);
        if (!l) bad++; else if (R.edges[l.edge].kind === 'path') path++;
      }
      return { bad, path, n: ns.length };
    };
    // bigger roads preferred: the share of lane length on 30 trips round home, walker's route vs driver's
    const rng = N.util.rng('minimap-test');
    const cand = R.nodes.filter((n) => n.deg >= 3 && Math.hypot(n.x - 10100, n.y - 5000) < 1400);
    let lw = 0, tw = 0, ld = 0, td = 0, trips = 0;
    const laneLen = (r) => { let l = 0, t = 0; for (let i = 1; i < r.length; i++) { const k = r[i - 1].inc.map((id) => R.edges[id]).find((e) => e.a === r[i].id || e.b === r[i].id); if (!k) continue; t += k.len; if (k.kind === 'lane') l += k.len; } return [l, t]; };
    for (let k = 0; k < 200 && trips < 30; k++) {
      const a = cand[Math.floor(rng.next() * cand.length)], b = cand[Math.floor(rng.next() * cand.length)];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 600) continue;
      const w = R.route(a, b, walk), d = R.route(a, b, drive); if (!w || !d) continue;
      const [a1, b1] = laneLen(w), [a2, b2] = laneLen(d); lw += a1; tw += b1; ld += a2; td += b2; trips++;
    }
    // a car halfway along a road, facing its far junction: the route starts there, not at the junction behind it
    const e = R.edges.find((q) => q.len > 70 && q.kind !== 'path' && R.nodes[q.a].deg >= 3 && R.nodes[q.b].deg >= 3 && Math.hypot(R.nodes[q.a].x - 10100, R.nodes[q.a].y - 5000) < 900);
    const A = R.nodes[e.a], B = R.nodes[e.b];
    const mx = A.x + (B.x - A.x) * 0.4, my = A.y + (B.y - A.y) * 0.4; // nearer A (behind)
    // the target: 700+ u beyond B, away from A
    const ux = (B.x - A.x) / e.len, uy = (B.y - A.y) / e.len;
    const T = R.nearestNode(B.x + ux * 800, B.y + uy * 800);
    if (p.vehicle) N.vehicles.exit(p, true);
    p.x = mx; p.y = my; N.time.scale = 1;
    N.menus.waypoint(T.x, T.y);
    await wait(1500);
    const foot = { how: N.hud.minimap.state().route, pts: (N.hud.route() || []).length };
    N.debug.enterVehicle('ambassador');
    const v = p.vehicle;
    v.x = mx; v.y = my; p.x = mx; p.y = my; v.angle = Math.atan2(B.y - A.y, B.x - A.x); v.vx = v.vy = 0; v.speed = 0;
    N.time.scale = 0;
    await wait(1500);
    const st = N.hud.minimap.state(), pts = N.hud.route() || [];
    const first = pts[1] ? byXY.get(pts[1][0] + ',' + pts[1][1]) : null;
    const car = { how: st.route, n: pts.length, legal: legal(pts), turn: st.turn, firstIsAhead: !!first && first.id === B.id, nearestBehind: R.nearestNode(mx, my).id === A.id };
    v.angle += Math.PI; await wait(600);
    const back = N.hud.minimap.state().turn;
    v.angle -= Math.PI;
    N.vehicles.exit(p, true); N.debug.enterVehicle('hero_cycle'); const cy = p.vehicle; cy.x = mx; cy.y = my; p.x = mx; p.y = my; cy.vx = cy.vy = 0;
    await wait(1200);
    const cyc = { how: N.hud.minimap.state().route, legal: legal(N.hud.route() || []) };
    N.vehicles.exit(p, true);
    N.menus.waypoint(null);
    N.time.scale = 1;
    let routeLen = 0; for (let i = 1; i < pts.length; i++) routeLen += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return { lanes: { trips, walk: +(lw / Math.max(1, tw)).toFixed(3), drive: +(ld / Math.max(1, td)).toFixed(3) }, foot, car, back, cyc, routeLen: Math.round(routeLen) };
  });
  check(d5.foot.how === 'walk' && d5.foot.pts > 2, 'on foot: the walker\'s route', d5.foot);
  check(d5.car.how === 'drive' && d5.car.legal.bad === 0 && d5.car.legal.path === 0 && d5.car.n > 2, `in the Ambassador: the driver's route, every step a road link (one-way rules kept), no footpaths (${d5.car.n} points)`, d5.car);
  check(d5.car.nearestBehind && d5.car.firstIsAhead, 'halfway along a road, the route starts at the junction the car is heading for, not the nearer one behind it', d5.car);
  check(d5.lanes.trips >= 20 && d5.lanes.drive <= d5.lanes.walk, `the driver's routes keep to the bigger roads (lanes ${(d5.lanes.drive * 100).toFixed(0)}% of the way vs a walker's ${(d5.lanes.walk * 100).toFixed(0)}%, ${d5.lanes.trips} trips)`, d5.lanes);
  check(d5.cyc.how === 'cycle' && d5.cyc.legal.path === 0, 'on a cycle: roads only', d5.cyc);
  console.log('\n== 5. the next-turn chip');
  const t = d5.car.turn;
  check(t && ['left', 'right', 'back'].indexOf(t.dir) >= 0 && t.d >= 0 && t.d <= d5.routeLen, `the car's next turn: ${t ? t.dir + ' in ' + Math.round(t.d * 1.6) + ' m' + (t.road ? ' into ' + t.road : '') : 'none'}`, t);
  check(d5.back && d5.back.dir === 'back', 'facing away from the route: "turn round"', d5.back);

  if (SHOTS) {
    console.log('\n== 6. screenshots');
    // the Ambassador on Himayatnagar Main Road, a waypoint across town: heading-up with the chip, then north-up
    const s = await page.evaluate(async () => {
      const p = N.player, R = N.world.roads, wait = (ms) => new Promise((r) => setTimeout(r, ms));
      N.time.scale = 1;
      if (p.vehicle) N.vehicles.exit(p, true);
      N.debug.enterVehicle('ambassador');
      const v = p.vehicle;
      const e = R.edges.find((q) => q.road && q.road.id === 'himayatnagar_rd' && q.len > 30 && Math.hypot(R.nodes[q.a].x - 9700, R.nodes[q.a].y - 4620) < 200) || R.edges.find((q) => q.kind === 'arterial');
      const a = R.nodes[e.a], b = R.nodes[e.b];
      v.x = a.x; v.y = a.y; v.angle = Math.atan2(b.y - a.y, b.x - a.x); v.vx = v.vy = 0; v.speed = 0; p.x = v.x; p.y = v.y;
      N.menus.waypoint(10700, 5900);
      N.hud.minimap.setMode('auto');
      N.view3d.setQuality({ adaptive: false, pixelRatio: 1 });
      N.view3d.setCamera({ yaw: v.angle, pitch: 0.22, snap: true }); N.view3d.settle(20000);
      await wait(3000);
      N.time.scale = 0; v.vx = Math.cos(v.angle) * 70; v.vy = Math.sin(v.angle) * 70; v.speed = 70;
      await wait(4000);
      return { turn: N.hud.minimap.state().turn, rot: N.hud.minimap.state().rot };
    });
    await sleep(8000);
    const mmBox = await page.evaluate(() => { const r = document.querySelector('.hud-minimap').getBoundingClientRect(); return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 20, height: r.height + 20 }; });
    await page.screenshot({ path: path.join(OUT, 'minimap_3d_heading_up.png'), timeout: 300000 });
    await page.screenshot({ path: path.join(OUT, 'minimap_crop_heading_up.png'), clip: mmBox, timeout: 300000 });
    await page.evaluate(() => N.hud.minimap.setMode('north'));
    await sleep(2500);
    await page.screenshot({ path: path.join(OUT, 'minimap_crop_north_up.png'), clip: mmBox, timeout: 300000 });
    await page.evaluate(() => { N.hud.minimap.setMode('auto'); N.menus.waypoint(null); N.time.scale = 1; });
    ok('screenshots in tests/out/minimap (turn: ' + JSON.stringify(s.turn) + ')');
  }

  console.log('\n== 7. errors');
  const errs = await page.evaluate(() => window.__errs);
  check(!errors.length && !errs.length, 'zero console errors, page errors and N.err', { errors: errors.slice(0, 5), errs: errs.slice(0, 5) });
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAIL' : 'all ok'));
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
