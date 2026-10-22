/* NOSTALGIA — tests/terrain.cjs  (terrain.js + terrain_data.js: the ground's real rise and fall)
 * Headless Chromium, 2D.
 *  1. the data: loaded, the real order of heights (Jubilee Hills / KBR > Banjara Hills > Ameerpet > Hussain Sagar
 *     (0, the water line) > Koti > the Musi), lakes flat, a sane range
 *  2. the 2D hillshade: built, not flat grey, baked into the ground chunks (a chunk on the ridge differs from the
 *     same chunk painted with the shade off)
 *  3. a cycle on the steepest road near Film Nagar: coasting downhill it gathers speed, coasting uphill it stops
 *     sooner than on the flat; pedalling uphill drains more energy than on the flat
 *  4. on foot: slower up the slope, quicker down it (walkMul), and the player's real walking speed shows it
 *  5. 3D (SwiftShader): the ground mesh, the player, the camera and the city stand on the terrain on the Banjara /
 *     Jubilee ridge: the player's 3D height = the terrain under him; a ray down onto the chunk's ground mesh meets
 *     the terrain; every chunk's buildings start at or above its lowest ground (nothing left floating at the old
 *     flat level or sunk under the hill); the camera above the ground (screenshots up the slopes)
 *  6. zero console errors, page errors and N.err
 *   node nostalgia/tests/terrain.cjs          (SHOTS=0 skips the screenshots)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'terrain');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const SHOTS = process.env.SHOTS !== '0';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
fs.mkdirSync(OUT, { recursive: true });
const failures = [];
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const check = (cond, m, detail) => (cond ? ok(m) : fail(m + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 500) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.addInitScript(GW);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.goto(URL, { timeout: 180000 });
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.mouse.click(2, 2);
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); N.debug.god(true); if (N.dialogue) N.dialogue.skip = true; N.debug.setTime(10, 30); N.player.god = false; });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 30000 });

  console.log('\n== 1. the data');
  const d1 = await page.evaluate(() => {
    const T = N.terrain, P = N.places, at = (id) => (P[id] ? +T.heightAt(P[id].x, P[id].y).toFixed(1) : null), m = (id) => (P[id] ? +T.metresAt(P[id].x, P[id].y).toFixed(0) : null);
    const hs = N.WORLD_DATA.water.find((w) => w.id === 'hussain_sagar'), c = hs.poly.reduce((a, q) => [a[0] + q[0] / hs.poly.length, a[1] + q[1] / hs.poly.length], [0, 0]);
    return { ready: T.ready, range: T.range(), kbr: at('kbr_park'), jubilee: at('jubilee_hills'), banjara: at('banjara_hills'), ameerpet: at('ameerpet'), koti: at('koti'), charminar: at('charminar'), lake: +T.heightAt(c[0], c[1]).toFixed(2), mKbr: m('kbr_park'), mKoti: m('koti') };
  });
  check(d1.ready && d1.range.hi > 100 && d1.range.lo < -20, `terrain loaded: ${d1.range.lo.toFixed(0)} to ${d1.range.hi.toFixed(0)} 3D units round the water line`, d1);
  check(d1.kbr > d1.banjara && d1.jubilee > d1.banjara && d1.banjara > d1.ameerpet && d1.ameerpet > 0 && d1.koti < 0 && Math.abs(d1.lake) < 0.5, `the real order: KBR ${d1.kbr} (${d1.mKbr} m), Jubilee ${d1.jubilee} > Banjara ${d1.banjara} > Ameerpet ${d1.ameerpet} > Hussain Sagar ${d1.lake} > Koti ${d1.koti} (${d1.mKoti} m)`, d1);

  console.log('\n== 2. the 2D hillshade');
  const d2 = await page.evaluate(async () => {
    const q = N.places.jubilee_hills; N.player.teleport(q.x, q.y); if (N.render.snapCamera) N.render.snapCamera();
    await window.__gw(1.0);
    const c = N.terrain.shade; if (!c) return { built: false };
    const g = c.getContext('2d'), w = c.width, h = c.height, d = g.getImageData(0, 0, w, h).data;
    let lo = 255, hi = 0, off = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]); if (Math.abs(d[i] - 128) > 6) off++; n++; }
    return { built: true, w, h, lo, hi, offFrac: off / n };
  });
  check(d2.built && d2.hi - d2.lo > 60 && d2.offFrac > 0.05, `hillshade ${d2.w} x ${d2.h}: shades ${d2.lo}-${d2.hi}, ${(d2.offFrac * 100).toFixed(0)}% of the ground on a visible slope`, d2);
  if (SHOTS) {
    for (const [id, dx, dy] of [['jubilee_hills', 0, 0], ['banjara_hills', 0, 0], ['birla_mandir', 0, 120], ['golconda_fort', 0, 0]]) {
      await page.evaluate(([id, dx, dy]) => { const q = N.places[id]; if (!q) return; N.player.teleport(q.x + dx, q.y + dy); N.render.cam.zoom = 0.55; if (N.render.snapCamera) N.render.snapCamera(); }, [id, dx, dy]);
      await sleep(2500);
      await page.screenshot({ path: path.join(OUT, `hillshade_${id}.png`) });
    }
    await page.evaluate(() => { N.render.cam.zoom = 1; });
  }

  console.log('\n== 3. a cycle on the steep bits');
  const d3 = await page.evaluate(async () => {
    const T = N.terrain;
    // a long straight stretch of road (a world-data segment of 100+ u), the steepest near Film Nagar / Jubilee
    // Hills, and a level one (|grade| < 1%) for reference: the runs stay on the road, clear of buildings
    const c0 = N.places.film_nagar || N.places.jubilee_hills;
    let best = null, flat = null;
    for (const r of N.WORLD_DATA.roads) {
      if (!r.pts || r.kind === 'path') continue;
      for (let k = 1; k < r.pts.length; k++) {
        const [ax, ay] = r.pts[k - 1], [bx, by] = r.pts[k], L = Math.hypot(bx - ax, by - ay);
        if (L < 100) continue;
        const g = (T.heightAt(bx, by) - T.heightAt(ax, ay)) / L, near = Math.hypot((ax + bx) / 2 - c0.x, (ay + by) / 2 - c0.y) < 1400;
        // the run's start: 12 u in from the high end, heading down (and back up from 12 u in from the low end)
        const hi = g < 0 ? [ax, ay, bx, by] : [bx, by, ax, ay], a = Math.atan2(hi[3] - hi[1], hi[2] - hi[0]);
        const seg = { g: Math.abs(g), L, down: a, top: [hi[0] + Math.cos(a) * 12, hi[1] + Math.sin(a) * 12], bot: [hi[2] - Math.cos(a) * 12, hi[3] - Math.sin(a) * 12], id: r.id };
        if (near && (!best || seg.g > best.g)) best = seg;
        if (seg.g < 0.01 && L > 160 && (!flat || L > flat.L)) flat = seg;
      }
    }
    if (!best || !flat) return { found: false, best, flat };
    N.player.teleport(best.top[0], best.top[1]);
    N.debug.enterVehicle('cycle');
    await window.__gw(0.3);
    const v = N.player.vehicle; if (!v) return { found: true, cycle: false };
    const clearTraffic = (x, y) => { for (const q of (N.traffic && N.traffic._T.vehicles) || []) if (q !== v && q.alive && Math.hypot(q.x - x, q.y - y) < 400) { q.alive = false; if (N.entities.remove) N.entities.remove(q); } };
    const run = async (at, angle, sp, secs, throttle) => {
      clearTraffic(at[0], at[1]);
      v.x = at[0]; v.y = at[1]; v.angle = angle; v.vx = Math.cos(angle) * sp; v.vy = Math.sin(angle) * sp; v.speed = sp; v.av = 0;
      // (a full tummy first: energy is capped at the tummy, and that cap would count as drain)
      N.player.tummy = 100; const e0 = N.player.energy = 90; let t = 0, maxSp = sp;
      const x0 = v.x, y0 = v.y;
      while (t < secs) { N.input.setMove(throttle ? Math.cos(angle) : null, throttle ? Math.sin(angle) : null, true); if (throttle) N.input.hold('run', false); await window.__gw(0.1); t += 0.1; maxSp = Math.max(maxSp, v.speed); }
      N.input.setMove(null);
      return { end: +v.speed.toFixed(1), maxSp: +maxSp.toFixed(1), went: +Math.hypot(v.x - x0, v.y - y0).toFixed(0), grade: +T.gradeAt(v.x, v.y, angle).toFixed(3), drain: +(e0 - N.player.energy).toFixed(2) };
    };
    const down = await run(best.top, best.down, 60, 0.9, false), up = await run(best.bot, best.down + Math.PI, 60, 0.9, false);
    const upPedal = await run(best.bot, best.down + Math.PI, 10, 1.4, true);
    const flatR = await run(flat.top, flat.down, 60, 0.9, false), flatPedal = await run(flat.top, flat.down, 10, 1.4, true);
    return { found: true, cycle: true, g: +best.g.toFixed(3), road: best.id, flatRoad: flat.id, down, up, flat: flatR, upPedal, flatPedal };
  });
  check(d3.found && d3.cycle && d3.g > 0.08, `steepest stretch of road near Film Nagar (${d3.road}): a ${(d3.g * 100).toFixed(0)}% game grade (level reference: ${d3.flatRoad})`, d3);
  if (d3.cycle) {
    check(d3.down.end > d3.flat.end + 8, `coasting downhill the cycle keeps rolling (60 -> ${d3.down.end} u/s; on the flat ${d3.flat.end})`, d3);
    check(d3.up.end < d3.flat.end - 8, `coasting uphill it dies sooner (60 -> ${d3.up.end} u/s; on the flat ${d3.flat.end})`, d3);
    check(d3.upPedal.drain > d3.flatPedal.drain * 1.3 && d3.upPedal.end < d3.flatPedal.end, `pedalling uphill: slower (${d3.upPedal.end} vs ${d3.flatPedal.end} u/s) and harder on the legs (energy -${d3.upPedal.drain} vs -${d3.flatPedal.drain})`, d3);
  }
  await page.evaluate(() => { if (N.player.vehicle) N.vehicles.exit(N.player, true); });

  console.log('\n== 4. on foot');
  const d4 = await page.evaluate(async () => {
    // up and down the steepest long straight stretch of road near Film Nagar (on the road: no yard, wall or parked
    // car in the way), the distance walked in a second each way
    const T = N.terrain, c0 = N.places.film_nagar || N.places.jubilee_hills;
    let best = null;
    for (const r of N.WORLD_DATA.roads) {
      if (!r.pts) continue;
      for (let k = 1; k < r.pts.length; k++) {
        const [ax, ay] = r.pts[k - 1], [bx, by] = r.pts[k], L = Math.hypot(bx - ax, by - ay);
        if (L < 100 || Math.hypot((ax + bx) / 2 - c0.x, (ay + by) / 2 - c0.y) > 1400) continue;
        const g = (T.heightAt(bx, by) - T.heightAt(ax, ay)) / L, lo = g > 0 ? [ax, ay, bx, by] : [bx, by, ax, ay], a = Math.atan2(lo[3] - lo[1], lo[2] - lo[0]);
        if (!best || Math.abs(g) > best.g) best = { g: Math.abs(g), up: a, bot: [lo[0] + Math.cos(a) * 12, lo[1] + Math.sin(a) * 12], top: [lo[2] - Math.cos(a) * 12, lo[3] - Math.sin(a) * 12], mid: [(ax + bx) / 2, (ay + by) / 2] };
      }
    }
    const mul = (a) => T.walkMul(best.mid[0], best.mid[1], Math.cos(a), Math.sin(a));
    const walk = async (at, a) => {
      for (const q of (N.traffic && N.traffic._T.vehicles) || []) if (q.alive && Math.hypot(q.x - at[0], q.y - at[1]) < 300) { q.alive = false; if (N.entities.remove) N.entities.remove(q); }
      N.player.teleport(at[0], at[1]); await window.__gw(0.3);
      N.input.setMove(Math.cos(a), Math.sin(a), true); await window.__gw(0.3);
      const x0 = N.player.x, y0 = N.player.y, t = await window.__gw(1.0);
      N.input.setMove(null);
      return Math.hypot(N.player.x - x0, N.player.y - y0) / (t || 1);
    };
    return { g: best.g, upMul: mul(best.up), downMul: mul(best.up + Math.PI), upSp: await walk(best.bot, best.up), downSp: await walk(best.top, best.up + Math.PI) };
  });
  check(d4.upMul < 0.92 && d4.downMul > 1.03 && d4.upSp < d4.downSp * 0.85, `on foot (a ${(d4.g * 100).toFixed(0)}% slope): uphill x${d4.upMul.toFixed(2)} (${d4.upSp.toFixed(0)} u/s), downhill x${d4.downMul.toFixed(2)} (${d4.downSp.toFixed(0)} u/s)`, d4);

  console.log('\n== 5. 3D');
  await page.evaluate(() => { N.view3d.setQuality({ adaptive: false, pixelRatio: 1 }); N.view.set('tps'); });
  await page.waitForFunction(() => N.view.mode === 'tps' && N.view3d.ready, null, { timeout: 300000 });
  const spots3 = [['banjara_hills', 0.3], ['jubilee_hills', 2.2], ['film_nagar', 1.2], ['birla_mandir', 3.6]];
  const r5 = [];
  for (const [id, yaw] of spots3) {
    const ok3 = await page.evaluate(([id, yaw]) => { const q = N.places[id]; if (!q) return false; N.player.teleport(q.x, q.y); N.debug.setTime(16, 40); N.view3d.setCamera({ yaw, pitch: 0.16, snap: true }); N.view3d.settle(30000); return true; }, [id, yaw]);
    if (!ok3) continue;
    // (a software renderer under load can take seconds a frame: wait for the camera to arrive and the chunk under
    // him to be built rather than a fixed time)
    await page.waitForFunction(() => {
      const E = N.view3d.engine, p = N.player, c = E.camera.position;
      if (Math.hypot(c.x - p.x, c.z - p.y) > 90) return false;
      const ray = new THREE.Raycaster(new THREE.Vector3(p.x, N.terrain.heightAt(p.x, p.y) + 400, p.y), new THREE.Vector3(0, -1, 0));
      const grounds = []; E.scene.traverse((o) => { if (o.isMesh && /ground-terrain/.test(o.name)) grounds.push(o); });
      return ray.intersectObjects(grounds, false).length > 0;
    }, null, { timeout: 300000, polling: 1000 }).catch(() => {});
    await sleep(2500);
    const m = await page.evaluate(() => {
      const V = N.view3d, E = V.engine, p = N.player, T = N.terrain, TH = T.heightAt(p.x, p.y);
      // a ray straight down onto the ground meshes of the chunk under him
      const ray = new THREE.Raycaster(new THREE.Vector3(p.x, TH + 400, p.y), new THREE.Vector3(0, -1, 0));
      const grounds = []; E.scene.traverse((o) => { if (o.isMesh && /ground-(prov-)?terrain/.test(o.name)) grounds.push(o); });
      const hit = ray.intersectObjects(grounds, false)[0];
      // every visible chunk's buildings: the lowest vertex against the lowest ground of the chunk
      let worst = 0, n = 0, worstAt = null;
      E.scene.traverse((o) => {
        if (!o.isMesh || o.name !== 'buildings' || !o.geometry.boundingBox) return;
        const ch = o.parent; if (!ch || !ch.visible) return;
        const x0 = ch.position.x, z0 = ch.position.z;
        let lo = Infinity; for (let a = 0; a <= 32; a++) for (let b = 0; b <= 32; b++) lo = Math.min(lo, T.heightAt(x0 + 16 * a, z0 + 16 * b)); // (fine: a small lake's level too)
        const gap = o.geometry.boundingBox.min.y - lo; n++;
        if ((gap < -4 || gap > 40) && Math.abs(gap) > worst) { worst = Math.abs(gap); worstAt = { x: x0, z: z0, min: +o.geometry.boundingBox.min.y.toFixed(1), lo: +lo.toFixed(1) }; }
      });
      return { th: +TH.toFixed(1), elev: +V.elevation(p).toFixed(1), ground: hit ? +hit.point.y.toFixed(1) : null, camY: +E.camera.position.y.toFixed(1), camGround: +T.heightAt(E.camera.position.x, E.camera.position.z).toFixed(1), chunks: n, worst: +worst.toFixed(1), worstAt };
    });
    r5.push([id, m]);
    console.log('  ..   ' + id + ' ' + JSON.stringify(m));
    if (SHOTS) await page.screenshot({ path: path.join(OUT, `slope3d_${id}.png`), timeout: 240000 });
  }
  const a5 = r5.map((r) => r[1]);
  check(a5.length >= 3 && a5.every((m) => Math.abs(m.elev - m.th) < 2), `the player stands on the terrain (${r5.map((r) => r[0] + ' ' + r[1].elev + '/' + r[1].th).join(', ')})`, r5);
  check(a5.every((m) => m.ground != null && Math.abs(m.ground - m.th) < 2), 'the ground mesh under him meets the terrain', r5);
  check(a5.every((m) => m.worst === 0 && m.chunks > 0), "every chunk's buildings stand on its ground (none floating at the old flat level, none sunk)", r5);
  check(a5.every((m) => m.camY > m.camGround + 2), 'the camera stays above the ground', r5);
  check(Math.max(...a5.map((m) => m.th)) - Math.min(...a5.map((m) => m.th)) > 15, `the spots really differ in height (${a5.map((m) => m.th).join(', ')})`, a5);
  await page.evaluate(() => { N.view.set('top'); });

  console.log('\n== 6. errors');
  const nerr = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + String(e.msg).split('\n')[0]));
  check(errors.length === 0 && nerr.length === 0, 'no console / page / N.err errors', errors.concat(nerr).slice(0, 6));
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
