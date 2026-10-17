/* NOSTALGIA — tests/vehicles3d.cjs (vehicles artist, ARCHITECTURE §21) — the Blender vehicles in 3D
 * (tools/blender/vehicles.py -> assets3d/*.glb, runtime src/models3d_vehicles.js).
 * Headless Chromium + SwiftShader (software GL: small viewport, long timeouts); three.js served from
 * vendor/ by routing the jsDelivr URL. Fails on any console error / page error / N.err.
 *
 *  pack     a test pack of every vehicle model + the people (characters + clip libraries) made with the
 *           real packer code (quantized) into tests/out/vehicles3d_pack.js (the shared pack is capped
 *           at 8 MB until per-model lazy loading lands); REALPACK=1 uses src/assets3d_pack.js instead
 *  lineup   one parked vehicle of every type (+ story variants) replaces the procedural model
 *           (e.view3d = 'm3d:veh:<id>'), sits on the ground, matches its collision footprint
 *           (length ~ TYPES.w, width <= TYPES.d), takes the vehicle's paint (tint), shows the right
 *           option bones (taxi carrier, govt beacon, route board, tarpaulin / marigolds, gears)
 *  parts    wheels spin with distance on every wheel bone, steering turns forks / car wheels /
 *           steering wheels the right way (right turn = clockwise from above), props spin on boats
 *  riders   traffic drivers / pillions / passengers are Blender characters posed onto the anchors:
 *           hands on the grips (or the steering wheel), hips on the seat, feet on the floor / pegs /
 *           pedals through a crank turn; the player rides his Scooty / auto as kid_chinnu and is
 *           hidden in first person
 *  shots    day and night line-ups (tps), riders close up, first person on the Scooty and in the
 *           Ambassador -> tests/out/vehicles3d_*.png; perf: draw calls / JS ms with the line-up
 *   node nostalgia/tests/vehicles3d.cjs      ONLY=lineup,parts,riders,shots   SHOTS=0
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const SHOTS = process.env.SHOTS !== '0';
const REALPACK = process.env.REALPACK === '1';
const failures = [];
let cur = '';
const fail = (msg) => { failures.push('[' + cur + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const want = (k) => !ONLY || ONLY.has(k);
const TEST_PACK = path.join(OUT, 'vehicles3d_pack.js');

/* ---------------------------------------------------------------- the test pack (real packer code, another output) */
function buildPack() {
  cur = 'pack';
  console.log('\n== test pack (vehicles + people)');
  const ids = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'assets3d'))) {
    if (!f.endsWith('.json')) continue;
    let m; try { m = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets3d', f), 'utf8')); } catch (e) { continue; }
    if (!fs.existsSync(path.join(ROOT, 'assets3d', m.id + '.glb'))) continue;
    if (m.family === 'vehicle' || m.family === 'character') ids.push(m.id);
  }
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'pack_assets3d.cjs'), 'utf8')
    .replace("const ROOT = path.resolve(__dirname, '..');", 'const ROOT = ' + JSON.stringify(ROOT) + ';')
    .replace("const OUT = path.join(ROOT, 'src', 'assets3d_pack.js');", 'const OUT = ' + JSON.stringify(TEST_PACK) + ';');
  const tool = path.join(OUT, '_vehicles3d_packer.cjs');
  fs.writeFileSync(tool, src);
  let out = '';
  try { out = execFileSync('node', [tool, '--allow-over'], { env: Object.assign({}, process.env, { PACK_ONLY: ids.join(',') }), encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
  const tot = /total ([\d.]+) KB/.exec(out);
  console.log(out.split('\n').filter((l) => /vehicle|total/.test(l)).join('\n'));
  check(fs.existsSync(TEST_PACK) && tot, 'test pack written: ' + ids.length + ' models, ' + (tot ? tot[1] : '?') + ' KB');
  return ids;
}

async function openPage(browser, o) {
  o = o || {};
  const context = await browser.newContext({ viewport: o.viewport || { width: 720, height: 420 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
  await page.evaluate((pack) => {
    if (pack) N.models3d.packUrls = [pack];
    N.debug.newGame({ skipIntro: true });
    N.debug.freezeClock(true);
    N.debug.god(true);
    N.view.noPointerLock = true;
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
  }, REALPACK ? null : 'file://' + TEST_PACK);
  return { context, page, errors };
}
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);
async function shot(page, name) {
  if (!SHOTS) return;
  await frames(page, 3);
  await page.screenshot({ path: path.join(OUT, name), timeout: 240000 });
  ok('screenshot tests/out/' + name);
}
async function checkErrors(page, errors) {
  const nerr = await page.evaluate(() => (N.debug.state().errors || []));
  const all = errors.concat(nerr.map((e) => 'N.err: ' + e));
  check(all.length === 0, 'no console / page / N.err errors', all.slice(0, 6).join(' | '));
}

/* in-page helpers */
const HELPERS = () => {
  window.VT = {
    raf(n) { return new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }); },
    partsOf(v) { let P = null; N.view3d.engine.actorGroup.traverse((o) => { if (!P && o.userData && o.userData.m3dParts && Math.abs(o.position.x - v.x) < 0.6 && Math.abs(o.position.z - v.y) < 0.6) P = o.userData.m3dParts; }); return P; },
    /** world AABB of the vehicle body (rest geometry of its meshes; riders excluded) */
    box(P) {
      const T = N.view3d.THREE, b = new T.Box3();
      P.object.updateMatrixWorld(true);
      P.pivot.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        let q = o, rider = false;
        while (q && q !== P.pivot) { if (/^m3dv-rider/.test(q.name || '')) rider = true; q = q.parent; }
        if (rider || o.geometry.attributes.position.count < 3) return;
        o.geometry.computeBoundingBox();
        b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
      });
      return b;
    },
    /** a clear spot near the player: a row of n slots spaced `gap` along the player's facing-normal */
    clearRow(n, gap) {
      const p = N.player, out = [];
      for (let i = 0; i < n; i++) out.push({ x: p.x + 40 + (i % 6) * gap, y: p.y - 70 + Math.floor(i / 6) * 80 });
      return out;
    },
    dist(a, b) { return a.distanceTo(b); },
  };
};

/* ---------------------------------------------------------------- line-up, parts, riders, shots */
const LINEUP = [
  ['hero_cycle', {}], ['hercules_gears', {}], ['cycle', {}], ['ladiescycle', {}], ['kid_cycle', {}], ['scooty', {}], ['luna', {}], ['pochaiah_luna', {}], ['chetak', {}], ['rx100', {}],
  ['auto', {}], ['yadagiri_auto', {}], ['rickshaw', {}], ['ambassador', {}], ['govt_ambassador', {}], ['taxi_ambassador', {}], ['maruti800', {}], ['padmini', {}],
  ['bus', { route: '49M' }], ['safari_bus', {}], ['lorry', {}], ['peacock_lorry', {}],
];
async function run3d(browser) {
  cur = 'lineup';
  console.log('\n== line-up, footprints, tint, options (720x420)');
  const { context, page, errors } = await openPage(browser);
  await page.evaluate(HELPERS);
  await page.evaluate(() => {
    N.debug.teleport('parade_grounds'); N.debug.setTime(11, 0);
    if (N.traffic) { N.traffic.enabled = false; if (N.traffic.clear) N.traffic.clear(); }
    N.view3d.setQuality({ adaptive: false, pixelRatio: 1, drawDist: 420 });
    N.view.set('tps');
  });
  await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 180000 });
  await page.waitForFunction(() => N.models3d && ['ready', 'missing', 'failed'].indexOf(N.models3d.state) >= 0, null, { timeout: 300000 });
  await page.waitForFunction(() => N.models3dVehicles && N.models3dVehicles.ready, null, { timeout: 60000 });
  const st = await page.evaluate(() => ({ m3d: N.models3d.stats(), mv: N.models3dVehicles.stats() }));
  check(st.m3d.state === 'ready', 'models3d ready (' + st.m3d.parsed.length + ' parsed, ' + st.m3d.loadMs + ' ms load, ' + st.m3d.parseMs + ' ms parse)');
  check(st.mv.installed && st.mv.models.length >= 18, 'vehicle runtime installed: ' + st.mv.models.join(', '));
  // ---- line-up: parked vehicles of every type
  const lu = await page.evaluate(async (LINEUP) => {
    const p = N.player, out = [];
    window.__lineup = [];
    const slots = VT.clearRow(LINEUP.length, 30);
    LINEUP.forEach(([t, o], i) => {
      const s = slots[i];
      const v = N.vehicles.spawn(t, s.x, s.y, Math.PI / 2, Object.assign({ seed: 1000 + i }, o));
      v.update = function () {};
      window.__lineup.push(v);
    });
    await VT.raf(6);
    for (const v of window.__lineup) {
      const P = VT.partsOf(v);
      const T = v.T || {};
      const r = { type: v.type, key: v.view3d || null, model: P ? P.id : null, w: T.w, d: T.d };
      if (P) {
        const b = VT.box(P);
        // vehicle faces +y (angle pi/2): its length runs along world z
        r.len = +(b.max.z - b.min.z).toFixed(2); r.wid = +(b.max.x - b.min.x).toFixed(2); r.minY = +(b.min.y - N.view3d.H.elev(v)).toFixed(2); r.h = +(b.max.y - b.min.y).toFixed(2);
        r.tint = P.mat ? P.mat.userData.vU.uTint.value.slice(1, 3).map((x) => [+x.x.toFixed(2), +x.y.toFixed(2), +x.z.toFixed(2)]) : null;
        r.opts = {}; for (const o of P.opts) r.opts[o.bone] = P.bones[o.bone].scale.x;
        r.boat = !!P.meta.boat;
      }
      out.push(r);
    }
    return out;
  }, LINEUP);
  for (const r of lu) {
    const fit = r.model && r.len > r.w * 0.86 && r.len < r.w * 1.12 && r.wid <= r.d * 1.2 + 0.6;
    check(!!r.key && !!r.model, r.type + ' renders with the Blender model ' + r.model + ' (' + r.key + ')');
    if (r.model) check(fit, r.type + ': footprint ' + r.len + ' x ' + r.wid + ' u vs collision ' + r.w + ' x ' + r.d, JSON.stringify(r));
    if (r.model && !r.boat) check(Math.abs(r.minY) < 0.35, r.type + ': sits on the ground (lowest point ' + r.minY + ' u)');
  }
  const by = (t) => lu.find((r) => r.type === t) || {};
  check(by('govt_ambassador').opts && by('govt_ambassador').opts.opt_beacon === 1 && by('ambassador').opts.opt_beacon === 0, 'government Ambassador shows its beacon, the plain one does not');
  check(by('taxi_ambassador').opts && by('taxi_ambassador').opts.opt_carrier === 1 && by('ambassador').opts.opt_carrier === 0, 'the taxi carries its roof carrier');
  const tx = by('taxi_ambassador').tint;
  check(tx && tx[1][0] > 0.9 && tx[1][2] < 0.5, 'taxi livery: the cabin (paint2) is tinted yellow (' + JSON.stringify(tx) + ')');
  const bus = by('bus').opts || {};
  check(bus.opt_route2 === 1 && bus.opt_route0 === 0 && bus.opt_city === 1 && bus.opt_safari === 0, 'city bus shows the 49M route board and CITY BUS (' + JSON.stringify(bus) + ')');
  check((by('safari_bus').opts || {}).opt_safari === 1 && (by('safari_bus').opts || {}).opt_city === 0, 'the zoo safari bus shows its mesh and lettering');
  check((by('lorry').opts || {}).opt_tarp === 1 && (by('peacock_lorry').opts || {}).opt_marigold === 1 && (by('peacock_lorry').opts || {}).opt_tarp === 0, 'lorry: tarpaulin; the peacock lorry: open with marigolds');
  check((by('hercules_gears').opts || {}).opt_gears === 1, 'Hercules with gears shows the derailleur');
  check((by('pochaiah_luna').opts || {}).opt_beacon === 1 && (by('luna').opts || {}).opt_beacon === 0, "the havaldar's Luna has its light bar");
  if (SHOTS) {
    // rows of six, the vehicles facing +y (south): look at each row from the south-west, a little above
    const cams = [['vehicles3d_lineup_a.png', 0, 6, 0.5], ['vehicles3d_lineup_b.png', 6, 12, 0.6], ['vehicles3d_lineup_c.png', 12, 18, 0.75], ['vehicles3d_lineup_d.png', 18, 22, 1.0]];
    for (const [name, a, b, z] of cams) {
      await page.evaluate(([a, b, z]) => {
        const L = window.__lineup.slice(a, b);
        const cx = L.reduce((s, v) => s + v.x, 0) / L.length, cy = L.reduce((s, v) => s + v.y, 0) / L.length;
        const span = Math.max(...L.map((v) => v.x)) - Math.min(...L.map((v) => v.x)) + 30;
        N.view3dActors.debug.camera([cx - span * 0.35, 10 + span * 0.18 * z, cy + 22 + span * 0.62 * z], [cx + 4, 4, cy + 4], 42);
      }, [a, b, z]);
      await shot(page, name);
    }
  }
  // ---- parts: wheels, steering, props
  cur = 'parts';
  const pt = await page.evaluate(async () => {
    const T = N.view3d.THREE, out = {};
    const ang = (a, b) => +(2 * Math.acos(Math.min(1, Math.abs(a.dot(b))))).toFixed(3);
    for (const v of window.__lineup) {
      const P = VT.partsOf(v);
      if (!P) continue;
      P.set({ dist: 0, steer: 0 });
      const w0 = P.wheels.map((w) => w.node.quaternion.clone()), s0 = P.steers.map((s) => s.node.quaternion.clone());
      P.set({ dist: 6.0, steer: 0.4 });
      const spins = P.wheels.map((w, i) => Math.abs(ang(w0[i], w.node.quaternion) - (6.0 / w.R) % (2 * Math.PI)));
      // a right turn: the front wheels / fork point to the right (world: vehicle faces +z, its right is -x)
      let right = null;
      const fw = P.steers.find((s) => s.name !== 'steer_wheel');
      if (fw) {
        P.object.updateMatrixWorld(true);
        const q = new T.Quaternion(); fw.node.getWorldQuaternion(q);
        const qr = new T.Quaternion(); P.pivot.getWorldQuaternion(qr);
        const rel = qr.clone().invert().multiply(q);
        const restRel = qr.clone().invert().multiply(new T.Quaternion().copy(fw.node.parent.getWorldQuaternion(new T.Quaternion())).multiply(fw.rest));
        const f0 = new T.Vector3(0, 0, 1).applyQuaternion(restRel.clone().invert()).applyQuaternion(rel);
        right = f0.x;      // GLB frame: +X is the vehicle's left
      }
      const sw = P.steers.find((s) => s.name === 'steer_wheel');
      out[v.type] = { maxSpinErr: +Math.max(0, ...spins).toFixed(3), wheels: P.wheels.length, steers: P.steers.map((s, i) => ang(s0[i], s.node.quaternion)), right: right == null ? null : +right.toFixed(3), wheel: sw ? ang(s0[P.steers.indexOf(sw)], sw.node.quaternion) : null };
      P.set({ dist: 0, steer: 0 });
    }
    return out;
  });
  for (const [t, r] of Object.entries(pt)) {
    check(r.wheels >= 2 && r.maxSpinErr < 0.02, t + ': ' + r.wheels + ' wheels spin by distance / radius (worst error ' + r.maxSpinErr + ' rad)');
    check(r.steers.length && r.steers.every((a) => a > 0.25), t + ': steering bones turn (' + r.steers.join(', ') + ' rad)');
    if (r.right != null) check(r.right < -0.1, t + ': a right turn points the front wheel to the right (' + r.right + ')');
  }
  // ---- riders: traffic drivers, pillions, passengers; the player
  cur = 'riders';
  const rd = await page.evaluate(async () => {
    const T = N.view3d.THREE, p = N.player, out = [];
    for (const v of window.__lineup) { try { N.vehicles.remove(v); } catch (e) { v.alive = false; } }
    window.__lineup = [];
    await VT.raf(3);
    const types = ['scooty', 'chetak', 'rx100', 'luna', 'auto', 'ambassador', 'maruti800', 'padmini', 'bus', 'lorry', 'rickshaw', 'hercules_cycle', 'cycle', 'hero_cycle'];
    const slots = VT.clearRow(types.length, 30);
    const looks = ['man', 'uncle', 'lungi', 'man'];
    window.__riders = [];
    types.forEach((t, i) => {
      const s = slots[i];
      const drv = { look: N.people.randomLook(N.util.rng(77 + i), looks[i % looks.length]), npc: true };
      const v = N.vehicles.spawn(t, s.x, s.y, Math.PI / 2, { seed: 3 + i * 3, driver: drv });
      v.update = function () {};
      window.__riders.push(v);
    });
    // a pillion on the Chetak (a man) and on the Scooty (an aunty: side-saddle)
    const ch = window.__riders[1], sc = window.__riders[0];
    ch.pillion = { look: N.people.randomLook(N.util.rng(5), 'man'), npc: true };
    sc.pillion = { look: N.people.randomLook(N.util.rng(9), 'aunty'), npc: true };
    for (let k = 0; k < 40 && N.models3dVehicles.stats().riders < 10; k++) await VT.raf(3);
    await VT.raf(4);
    const a = new T.Vector3(), b = new T.Vector3();
    for (const v of window.__riders) {
      const P = VT.partsOf(v);
      const r = { type: v.type, key: v.view3d || null, riders: P ? P.riders.map((x) => x.id + ':' + x.slot + ':' + x.clip) : [] };
      if (P && P.rider) {
        P.object.updateMatrixWorld(true);
        const R = P.rider, ss = (P.meta.riders || {}).driver || {};
        const g = [];
        if (ss.grips && ss.grips[0] !== 'tiller') for (const s of ['L', 'R']) { const h = R.bones['hand_' + s], an = P.anchors[ss.grips[s === 'L' ? 0 : 1]]; if (h && an) { h.getWorldPosition(a); an.getWorldPosition(b); g.push(+a.distanceTo(b).toFixed(2)); } }
        r.hand = g;
        const ft = [];
        if (Array.isArray(ss.feet)) for (const s of ['L', 'R']) { const t = R.bones['toe_' + s], an = P.anchors[ss.feet[s === 'L' ? 0 : 1]]; if (t && an) { t.getWorldPosition(a); an.getWorldPosition(b); ft.push(+a.distanceTo(b).toFixed(2)); } }
        r.foot = ft;
        const hip = R.bones.hips, seat = P.anchors[ss.seat || 'seat_driver'];
        if (hip && seat) { hip.getWorldPosition(a); seat.getWorldPosition(b); r.hipUp = +(a.y - b.y).toFixed(2); r.hipXZ = +Math.hypot(a.x - b.x, a.z - b.z).toFixed(2); }
      }
      out.push(r);
    }
    return out;
  });
  for (const r of rd) {
    check(!!r.key && r.riders.length > 0, r.type + ' with a driver renders with Blender riders: ' + r.riders.join(', '), JSON.stringify(r));
    if (r.hand && r.hand.length) check(Math.max(...r.hand) < 0.75, r.type + ': hands on the grips / wheel (' + r.hand.join(', ') + ' u)');
    if (r.foot && r.foot.length) check(Math.max(...r.foot) < 0.6, r.type + ': feet on the floor / pegs / pedals (' + r.foot.join(', ') + ' u)');
    if (r.hipUp != null) check(r.hipUp > 0.1 && r.hipUp < 1.6 && r.hipXZ < 1.2, r.type + ': hips sit on the seat (' + r.hipUp + ' up, ' + r.hipXZ + ' off)');
  }
  // pedalling: feet stay on the rickshaw's / BSA's pedals through a crank turn
  const ped = await page.evaluate(async () => {
    const T = N.view3d.THREE, out = {};
    for (const t of ['rickshaw', 'cycle', 'hercules_cycle']) {
      const v = window.__riders.find((x) => x.type === t);
      const P = v && VT.partsOf(v);
      if (!P || !P.rider) { out[t] = null; continue; }
      let worst = 0;
      const a = new T.Vector3(), b = new T.Vector3(), w0 = v.wheelPhase || 0;
      for (let k = 0; k <= 12; k++) {
        v.wheelPhase = w0 + (k / 12) * Math.PI * P.R * P.gear;
        await VT.raf(1);
        for (const s of ['L', 'R']) { P.rider.bones['toe_' + s].getWorldPosition(a); P.anchors['pedal_' + s].getWorldPosition(b); worst = Math.max(worst, a.distanceTo(b)); }
      }
      v.wheelPhase = w0;
      out[t] = { worst: +worst.toFixed(3), clip: P.rider.clip };
    }
    return out;
  });
  for (const [t, r] of Object.entries(ped)) if (r) check(r.worst < 0.45, t + ': the rider pedals with the feet on the pedals through a crank turn (worst ' + r.worst + ' u, ' + r.clip + ')');
  if (SHOTS) {
    await page.evaluate(() => { const v = window.__riders[0]; N.view3dActors.debug.camera([v.x - 18, 9, v.y + 22], [v.x + 8, 4, v.y], 38); });
    await shot(page, 'vehicles3d_riders_a.png');
    await page.evaluate(() => { const v = window.__riders[4]; N.view3dActors.debug.camera([v.x - 16, 12, v.y + 30], [v.x + 14, 5, v.y], 40); });
    await shot(page, 'vehicles3d_riders_b.png');
    await page.evaluate(() => { const v = window.__riders[10]; N.view3dActors.debug.camera([v.x - 20, 10, v.y + 26], [v.x + 6, 5, v.y], 40); });
    await shot(page, 'vehicles3d_riders_c.png');
    // night: lamps on while driven
    await page.evaluate(() => { N.debug.setTime(21, 0); const v = window.__riders[5]; N.view3dActors.debug.camera([v.x - 24, 10, v.y - 30], [v.x, 4, v.y + 6], 42); });
    await page.waitForTimeout(800);
    await shot(page, 'vehicles3d_night_a.png');
    await page.evaluate(() => { const v = window.__riders[8]; N.view3dActors.debug.camera([v.x + 30, 14, v.y + 60], [v.x, 6, v.y], 42); });
    await shot(page, 'vehicles3d_night_b.png');
    await page.evaluate(() => { N.debug.setTime(11, 0); N.view3dActors.debug.camera(null); });
  }
  // ---- perf with the riders' line-up in view
  const perf = await page.evaluate(async () => {
    const v = window.__riders[6];
    N.view3dActors.debug.camera([v.x - 30, 30, v.y + 90], [v.x + 40, 3, v.y], 50);
    await VT.raf(20);
    return { s: N.view3d.stats(), mv: N.models3dVehicles.stats() };
  });
  console.log('  perf: ' + perf.s.calls + ' calls, ' + perf.s.triangles + ' tris, JS ' + perf.s.jsAvg + ' ms avg; vehicles ' + perf.mv.vehicles + ', riders ' + perf.mv.riders + ', IK ' + perf.mv.ikAvg + ' ms');
  check(perf.mv.ikAvg < 4, 'rider IK stays cheap (' + perf.mv.ikAvg + ' ms / frame for ' + perf.mv.riders + ' riders)');
  // ---- the player: Scooty (tps + fps), then the auto
  const pl = await page.evaluate(async () => {
    const p = N.player, out = {};
    N.view3dActors.debug.camera(null);
    const sc = N.vehicles.spawn('scooty', p.x + 6, p.y + 6, 0, { color: '#2e9ad8' });
    N.vehicles.enter(p, sc, { quiet: true });
    for (let k = 0; k < 30; k++) { await VT.raf(2); const P = VT.partsOf(sc); if (P && P.rider) break; }
    const P = VT.partsOf(sc);
    out.scooty = { key: sc.view3d || null, rider: P && P.rider ? P.rider.id : null, visible: P && P.rider ? P.rider.object.visible : null };
    window.__mine = sc;
    return out;
  });
  check(pl.scooty.key === 'm3d:veh:scooty' && pl.scooty.rider && pl.scooty.visible, 'the player rides the Blender Scooty as ' + pl.scooty.rider + ' (' + JSON.stringify(pl.scooty) + ')');
  if (SHOTS) {
    await page.evaluate(() => { N.view3d.setCamera({ yaw: N.player.vehicle.angle + 0.6, pitch: 0.25, snap: true }); });
    await shot(page, 'vehicles3d_player_scooty.png');
  }
  await page.evaluate(() => N.view.set('fps'));
  await page.waitForFunction(() => N.view.mode === 'fps', null, { timeout: 60000 });
  await frames(page, 4);
  const fp = await page.evaluate(() => { const P = VT.partsOf(window.__mine); return { visible: P && P.rider ? P.rider.object.visible : null, body: P ? P.object.visible : null }; });
  check(fp.visible === false, 'first person: the player\'s own body is hidden on the Scooty (bars stay)');
  if (SHOTS) await shot(page, 'vehicles3d_fps_scooty.png');
  // first person in an Ambassador (a test drive: kids may not drive cars, the test lets him)
  await page.evaluate(async () => {
    const p = N.player;
    N.vehicles.exit(p);
    await VT.raf(2);
    const c = N.vehicles.spawn('ambassador', p.x + 10, p.y, 0, {});
    N.vehicles.enter(p, c, { quiet: true });
    window.__amb = c;
    await VT.raf(10);
  });
  const ca = await page.evaluate(() => { const c = window.__amb, P = VT.partsOf(c); return { inside: N.player.vehicle === c, key: c.view3d || null, rider: P && P.rider ? P.rider.id : null }; });
  if (ca.inside) {
    check(ca.key === 'm3d:veh:ambassador', 'first person in the Ambassador uses the Blender model (dash, wheel, glass): ' + JSON.stringify(ca));
    if (SHOTS) await shot(page, 'vehicles3d_fps_ambassador.png');
  } else console.log('  (skip: the player could not be put in the Ambassador)');
  await page.evaluate(() => N.view.set('tps'));
  await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 60000 });
  await frames(page, 3);
  cur = 'errors';
  await checkErrors(page, errors);
  await context.close();
}

/* ---------------------------------------------------------------- boats on Hussain Sagar */
async function runBoats(browser) {
  cur = 'boats';
  console.log('\n== boats on Hussain Sagar');
  const { context, page, errors } = await openPage(browser);
  await page.evaluate(HELPERS);
  const pos = await page.evaluate(() => {
    const ids = ['lumbini_park', 'hussain_sagar', 'buddha_statue', 'tank_bund', 'necklace_road'];
    for (const id of ids) { try { if (N.debug.teleport(id)) break; } catch (e) { /* next */ } }
    N.debug.setTime(16, 30);
    if (N.traffic) { N.traffic.enabled = false; if (N.traffic.clear) N.traffic.clear(); }
    const p = N.player;
    // nearest open water
    let best = null;
    for (let r = 20; r < 900 && !best; r += 20) for (let a = 0; a < 6.28 && !best; a += 0.2) { const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r; if (N.world.isWater(x, y) && N.world.isWater(x + 40, y) && N.world.isWater(x - 40, y) && N.world.isWater(x, y + 30)) best = { x, y }; }
    N.view3d.setQuality({ adaptive: false, pixelRatio: 1, drawDist: 420 });
    N.view.set('tps');
    return best;
  });
  await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 180000 });
  await page.waitForFunction(() => N.models3dVehicles && N.models3dVehicles.ready, null, { timeout: 300000 });
  if (!pos) { console.log('  (skip: no open water found)'); await context.close(); return; }
  const r = await page.evaluate(async (pos) => {
    const out = {};
    const b = N.vehicles.spawn('boat', pos.x, pos.y, 0.3, { seed: 12, driver: { look: N.people.randomLook(N.util.rng(4), 'lungi'), npc: true } });
    b.update = function () {};
    window.__boat = b;
    let pb = null;
    if (N.vehicles.TYPES.pedal_boat) { pb = N.vehicles.spawn('pedal_boat', pos.x + 30, pos.y + 6, 2.2, { seed: 4 }); pb.update = function () {}; }
    for (let k = 0; k < 30; k++) { await VT.raf(2); const P = VT.partsOf(b); if (P && P.riders.length) break; }
    const P = VT.partsOf(b);
    out.boat = { key: b.view3d || null, riders: P ? P.riders.map((x) => x.id + ':' + x.slot) : [], props: P ? P.props.length : 0 };
    if (P && P.props.length) { const q0 = P.props[0].node.quaternion.clone(); b.speed = 40; await VT.raf(6); out.boat.prop = +(2 * Math.acos(Math.min(1, Math.abs(q0.dot(P.props[0].node.quaternion))))).toFixed(3); }
    N.view3dActors.debug.camera([b.x - 30, 12, b.y + 34], [b.x, 2, b.y], 40);
    return out;
  }, pos);
  check(r.boat.key === 'm3d:veh:motor_boat' && r.boat.riders.length >= 1, 'a Hussain Sagar boat renders with the Blender motor boat and its boatman: ' + JSON.stringify(r.boat));
  check(r.boat.prop > 0.05, 'the outboard propeller spins (' + r.boat.prop + ' rad)');
  if (SHOTS) await shot(page, 'vehicles3d_boat.png');
  await checkErrors(page, errors);
  await context.close();
}

(async () => {
  const t0 = Date.now();
  if (!REALPACK) buildPack();
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (want('lineup') || want('parts') || want('riders') || want('shots')) await run3d(browser);
    if (want('boats')) await runBoats(browser);
  } catch (e) {
    fail('exception: ' + (e.stack || e.message));
  } finally {
    await browser.close();
  }
  console.log('\n' + (failures.length ? failures.length + ' FAILURE(S)' : 'ALL PASSED') + ' in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  for (const f of failures) console.log('  ' + f);
  process.exit(failures.length ? 1 : 0);
})();
