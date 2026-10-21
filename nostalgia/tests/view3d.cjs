/* NOSTALGIA — tests/view3d.cjs (3D view mode, ARCHITECTURE §20)
 * Headless Chromium with SwiftShader WebGL (software GL: frames take ~0.5-5 s at full size, so
 * input-driven parts run at a tiny pixel ratio and perf is judged by JS ms + draw calls).
 * three.js loads from the vendored copy first (the jsDelivr URL, the last resort, is routed to it: hermetic).
 *
 *   desktop 1280x720 (keyboard + mouse):
 *     V cycles top -> tps -> fps -> top -> tps (real key presses; the second 3D switch is instant)
 *     camera-relative walking with real keys (W along the camera yaw, D to its right)
 *     mouse drag look, a Chetak driven with real keys in 3D, view switches inside the vehicle
 *     screenshots (tps + fps): Himayatnagar, Tank Bund at golden hour, Charminar at night,
 *       Old City lanes; perf in dense Old City (renderer.info calls / triangles, JS ms)
 *     repeated toggles do not leak (geometries / textures), WebGL context loss -> top-down ->
 *       restore -> 3D, 2D snaps back (R.view / queue restored)
 *   phone portrait 390x844 + landscape 844x390 (touch): VIEW pill, right-half touch look drag,
 *     joystick walk (camera-relative), screenshots tps + fps
 *   missing library: both three.js URLs blocked -> toast, stays top-down
 * Fails on any console error / page error / N.err (except the blocked-library requests).
 *   node nostalgia/tests/view3d.cjs     ONLY=desktop|portrait|landscape|fallback   SHOTS=0 (skip shots)
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

const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, touch: false },
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, touch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, touch: true },
};
const ONLY = process.env.ONLY;
const SHOTS = process.env.SHOTS !== '0';
const failures = [];
const report = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cur = '';
const fail = (msg) => { failures.push('[' + cur + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };

async function openPage(browser, V, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.deviceScaleFactor, hasTouch: V.touch, isMobile: V.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  if (opts.block) await page.route(/three\.min\.js/, (r) => r.abort());
  else await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    N.debug.freezeClock(true);
    N.debug.god(true);
    N.view.noPointerLock = true;
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
  });
  const cdp = V.touch ? await context.newCDPSession(page) : null;
  return { context, page, errors, cdp };
}
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);
const st = (page) => page.evaluate(() => ({ mode: N.view.mode, want: N.view.want, active: !!(N.view3d && N.view3d.active), x: N.player.x, y: N.player.y, veh: N.player.vehicle ? N.player.vehicle.type : null, yaw: N.view.yaw, state: N.state.mode, stack: N.state.stack.join('>'), fps: N.perf && N.perf.fps }));
async function waitMode(page, m, ms) {
  try { await page.waitForFunction((m) => N.view.mode === m, m, { timeout: ms || 60000 }); return true; } catch (e) { return false; }
}
// input-driven checks run with a tiny canvas and a short draw distance so software-GL frames stay
// short even on a loaded machine; screenshots go back to the tier's full settings
async function setLowRes(page, on) {
  await page.evaluate((on) => {
    if (window.__dd == null) window.__dd = N.view3d.quality.drawDist;
    N.view3d.setQuality({ adaptive: false, pixelRatio: on ? 0.2 : Math.min(1, window.devicePixelRatio || 1), drawDist: on ? 450 : window.__dd });
    N.view3d.settle(10000);
  }, on);
  await frames(page, 2);
}
/** hold real keys until fn(state) is true or ms pass; returns the final state */
async function holdUntil(page, keys, fn, ms) {
  for (const k of keys) await page.keyboard.down(k);
  const t0 = Date.now();
  let s = await st(page);
  while (Date.now() - t0 < ms) { await sleep(120); s = await st(page); if (fn(s)) break; }
  for (const k of keys.slice().reverse()) await page.keyboard.up(k);
  await sleep(100);
  return st(page);
}
async function shot(page, name, S) {
  if (!SHOTS) return;
  const info = await page.evaluate((S) => {
    if (Array.isArray(S.at)) N.debug.teleport(S.at[0], S.at[1]); else if (S.at) N.debug.teleport(S.at);
    if (S.h != null) N.debug.setTime(S.h, S.m || 0);
    if (S.vehicle && !N.player.vehicle) N.debug.enterVehicle(S.vehicle);
    N.view.set(S.mode);
    const p = N.player;
    let yaw = N.view.yaw;
    if (S.look) yaw = Math.atan2(S.look[1] - p.y, S.look[0] - p.x);
    N.view3d.setCamera({ yaw, pitch: S.pitch != null ? S.pitch : (S.mode === 'fps' ? 0.02 : 0.3), snap: true });
    return { settled: N.view3d.settle(20000) };
  }, S);
  await frames(page, 3);
  await page.screenshot({ path: path.join(OUT, 'view3d_' + cur + '_' + name + '.png'), timeout: 240000 });
  const s = await page.evaluate(() => N.view3d.stats());
  ok('shot ' + name + ' (settled ' + info.settled + ', ' + s.calls + ' calls, ' + s.triangles + ' tris, ' + s.visChunks + '/' + s.chunks + ' chunks)');
}
function checkErrors(errors, page, allow) {
  return page.evaluate(() => N.debug.state().errors).then((nerr) => {
    const all = errors.concat(nerr.map((e) => 'N.err: ' + e)).filter((e) => !(allow && allow.test(e)));
    check(all.length === 0, 'no console / page / N.err errors', all.slice(0, 6).join(' | '));
  });
}

/* ---------------------------------------------------------------- desktop */
async function desktop(browser) {
  cur = 'desktop';
  console.log('\n== desktop 1280x720 (keyboard + mouse)');
  const { context, page, errors } = await openPage(browser, VIEWPORTS.desktop);
  check((await st(page)).mode === 'top', 'starts top-down');
  await page.evaluate(() => N.view3d.setQuality({ adaptive: false }));

  // ---- V cycles the views (real key presses)
  let t0 = Date.now();
  await page.keyboard.press('KeyV');
  check(await waitMode(page, 'tps', 90000), 'V -> 3D third person (' + (Date.now() - t0) + ' ms incl. loading three.js + near city)');
  const dom = await page.evaluate(() => ({ body: document.body.classList.contains('view-3d'), c3: getComputedStyle(document.getElementById('game3d')).display, c2: getComputedStyle(document.getElementById('game')).visibility, rev: THREE.REVISION, src: [...document.scripts].map((s) => s.src).filter((s) => /three/.test(s)) }));
  check(dom.body && dom.c3 === 'block' && dom.c2 === 'hidden', '3D canvas shown, 2D canvas hidden', JSON.stringify(dom));
  check(dom.rev === '149' && /vendor\/three\/three\.min\.js/.test(dom.src[0] || '') && !dom.src.some((u) => /jsdelivr/.test(u)), 'three.js r' + dom.rev + ' loaded from the vendored copy first (same origin; jsDelivr only as the last resort)', JSON.stringify(dom.src));
  await setLowRes(page, true);
  await page.keyboard.press('KeyV'); check(await waitMode(page, 'fps', 60000), 'V -> first person', JSON.stringify(await st(page)));
  await page.keyboard.press('KeyV'); check(await waitMode(page, 'top', 60000), 'V -> top-down');
  const back = await page.evaluate(() => ({ c2: getComputedStyle(document.getElementById('game')).visibility, view: N.render.view.x1 - N.render.view.x0, W: N.render.W, Z: N.render.Z }));
  await frames(page, 2);
  check(back.c2 === 'visible', '2D canvas visible again (2D renderer snaps back)');
  const q = await page.evaluate(() => N.render.stats.queued);
  check(q > 0, '2D render queue is drawing again (' + q + ' items)');
  t0 = Date.now();
  await page.keyboard.press('KeyV');
  check(await waitMode(page, 'tps', 60000), 'V -> 3D again, scene kept warm (' + (Date.now() - t0) + ' ms)');

  // ---- camera-relative walking with real keys (open field: Fateh Maidan inside LB Stadium)
  await page.evaluate(() => { N.debug.teleport(3961, 2580); N.debug.setTime(16, 30); N.view3d.settle(8000); });
  const walk = async (yaw, key, dirX, dirY, label) => {
    await page.evaluate((yaw) => { N.debug.teleport(3961, 2580); N.view3d.setCamera({ yaw, pitch: 0.3, snap: true }); }, yaw);
    await frames(page, 2);
    const a = await st(page);
    const b = await holdUntil(page, [key], (s) => Math.hypot(s.x - a.x, s.y - a.y) > 30, 15000);
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    const along = (dx * dirX + dy * dirY) / (d || 1);
    check(d > 12 && along > 0.8, label + ' (moved ' + d.toFixed(0) + 'u, alignment ' + along.toFixed(2) + ')', JSON.stringify(b));
  };
  await walk(0, 'KeyW', 1, 0, 'camera facing east: W walks east');
  await walk(Math.PI / 2, 'KeyW', 0, 1, 'camera facing south: W walks south');
  await walk(Math.PI, 'KeyD', 0, -1, 'camera facing west: D walks north (camera right)');
  const raw = await page.evaluate(() => { N.input.setMove(0, -1, false); N.input.update(0.016); const r = [N.input.rawMove.y, N.input.move.x, N.input.move.y]; N.input.setMove(null); return r; });
  check(raw[0] === -1 && Math.abs(raw[1] + 1) < 0.01, 'N.input.move rotated by N.view.yaw, rawMove kept', JSON.stringify(raw));

  // ---- mouse drag look
  const y0 = (await st(page)).yaw;
  await page.mouse.move(700, 360); await page.mouse.down(); for (let i = 1; i <= 8; i++) { await page.mouse.move(700 + i * 25, 360 + i * 4); await sleep(20); } await page.mouse.up();
  await frames(page, 3);
  const y1 = (await st(page)).yaw;
  check(Math.abs(y1 - y0) > 0.2, 'mouse drag turns the camera (yaw ' + y0.toFixed(2) + ' -> ' + y1.toFixed(2) + ')');

  // ---- vehicle: drive with real keys, switch views inside it
  await page.evaluate(() => { N.debug.teleport(4473, 2671); const v = N.debug.enterVehicle('chetak'); if (v) { v.angle = -Math.PI / 2; } N.view3d.setCamera({ yaw: -Math.PI / 2, snap: true }); });
  await frames(page, 2);
  let a = await st(page);
  check(a.veh === 'chetak', 'riding a Chetak in 3D');
  let b = await holdUntil(page, ['KeyW'], (s) => Math.hypot(s.x - a.x, s.y - a.y) > 50, 15000);
  check(Math.hypot(b.x - a.x, b.y - a.y) > 20 && b.y < a.y, 'W drives the Chetak forward (keyboard tank controls; moved ' + Math.hypot(b.x - a.x, b.y - a.y).toFixed(0) + 'u north)');
  const angA = await page.evaluate(() => N.player.vehicle.angle);
  b = await holdUntil(page, ['KeyW', 'KeyD'], () => false, 2500);
  const angB = await page.evaluate(() => N.player.vehicle.angle);
  check(Math.abs(angB - angA) > 0.05, 'D steers right in 3D (heading ' + angA.toFixed(2) + ' -> ' + angB.toFixed(2) + ')');
  for (const m of ['fps', 'top', 'tps']) {
    await page.keyboard.press('KeyV');
    const okm = await waitMode(page, m, 60000);
    const s = await st(page);
    check(okm && s.veh === 'chetak', 'V inside the vehicle -> ' + m + ' (still riding)');
  }
  await page.evaluate(() => { const p = N.player; if (p.vehicle && N.vehicles.exit) N.vehicles.exit(p, true); });

  // ---- screenshots (full resolution)
  await setLowRes(page, false);
  await page.evaluate(() => { if (N.player.vehicle) N.vehicles.exit(N.player, true); });
  const S = [
    ['himayatnagar_tps', { at: [4473, 2671], h: 16, m: 30, mode: 'tps', look: [4473, 2400], pitch: 0.3 }],
    ['himayatnagar_fps', { at: [4473, 2671], h: 16, m: 30, mode: 'fps', look: [4473, 2400], pitch: 0.02 }],
    ['tankbund_golden_tps', { at: [4060, 1905], h: 17, m: 40, mode: 'tps', look: [3880, 1790], pitch: 0.22 }],
    ['tankbund_golden_fps', { at: [4060, 1905], h: 17, m: 40, mode: 'fps', look: [3880, 1790], pitch: 0.0 }],
    ['charminar_night_tps', { at: [3900, 4520], h: 21, m: 0, mode: 'tps', look: [3900, 4360], pitch: 0.12 }],
    ['charminar_night_fps', { at: [3900, 4470], h: 21, m: 0, mode: 'fps', look: [3900, 4360], pitch: -0.25 }],
    ['oldcity_lanes_tps', { at: 'gulzar_houz', h: 11, m: 0, mode: 'tps', look: [3900, 4360], pitch: 0.3 }],
    ['oldcity_lanes_fps', { at: 'laad_bazaar', h: 11, m: 0, mode: 'fps', look: [3900, 4360], pitch: 0.0 }],
    ['chetak_chase_tps', { at: [4473, 2671], h: 17, m: 10, mode: 'tps', vehicle: 'chetak', look: [4473, 2400], pitch: 0.25 }],
  ];
  for (const [n, sp] of S) await shot(page, n, sp);
  await page.evaluate(() => { if (N.player.vehicle) N.vehicles.exit(N.player, true); });

  // ---- perf in dense Old City (JS ms + draw calls; SwiftShader fps is meaningless)
  await page.evaluate(() => { N.debug.teleport('laad_bazaar'); N.debug.setTime(19, 30); N.view.set('tps'); N.view3d.setCamera({ yaw: 0, pitch: 0.3, snap: true }); N.view3d.settle(20000); });
  await page.evaluate(() => { window.__p = []; N.input.setMove(1, 0, true); });
  for (let i = 0; i < 6; i++) { await frames(page, 1); await page.evaluate(() => { const s = N.view3d.stats(); window.__p.push([s.jsMs, s.calls, s.triangles, s.renderMs, s.workMs, N.perf.updateMs]); }); }
  const perf = await page.evaluate(() => { N.input.setMove(null); const p = window.__p; const avg = (k) => p.reduce((a, r) => a + r[k], 0) / p.length; const max = (k) => Math.max(...p.map((r) => r[k])); return { js: avg(0), jsMax: max(0), calls: avg(1), callsMax: max(1), tris: avg(2), render: avg(3), work: avg(4), upd: avg(5), stats: N.view3d.stats() }; });
  report.push('desktop Old City night (tps, walking): JS ' + perf.js.toFixed(1) + ' ms/frame avg (max ' + perf.jsMax.toFixed(1) + '; renderer.render ' + perf.render.toFixed(1) + ', streaming ' + perf.work.toFixed(1) + '), ' + perf.calls.toFixed(0) + ' draw calls (max ' + perf.callsMax + '), ' + (perf.tris / 1000).toFixed(0) + 'k triangles, ' + perf.stats.programs + ' programs, ' + perf.stats.geometries + ' geometries, ' + perf.stats.textures + ' textures');
  check(perf.callsMax <= 320, 'draw calls in dense Old City <= ~300 (' + perf.callsMax + ')');
  // software GL blocks inside GL calls and other agents' browsers may load the machine: fail only
  // when the machine is not overloaded
  const load = require('os').loadavg()[0], cores = require('os').cpus().length;
  const jsx = perf.js - perf.work;
  if (load < cores * 0.8) check(jsx <= 9, 'JS per frame (excluding streaming) ' + jsx.toFixed(1) + ' ms (SwiftShader GL; ~6 ms budget on hardware)');
  else ok('JS per frame (excluding streaming) ' + jsx.toFixed(1) + ' ms — not judged: machine load ' + load.toFixed(1) + ' on ' + cores + ' cores');
  // models3d batches the landmarks that share a model (Laad Bazaar's bangle shops: 24 primitives each, audit PERF-30)
  const bt = await page.evaluate(() => (N.models3d && N.models3d.stats && N.models3d.ready ? N.models3d.stats().batches : null));
  if (bt) check(bt.built >= 1 && bt.cells.some((c) => /^bangle_shop:/.test(c)), 'shared landmark models drawn as instanced batches (' + bt.cells.join(', ') + ')');

  // ---- a long trip across the city keeps GPU memory bounded (far chunks are freed / downgraded)
  await setLowRes(page, true);
  const trip = await page.evaluate(() => {
    N.view3d.setQuality({ drawDist: window.__dd }); // the real draw distance (synchronous: frames do not matter)
    const out = [];
    for (const [x, y] of [[430, 600], [1100, 3300], [3900, 4500], [5200, 1000], [7400, 3600], [4473, 2671]]) {
      N.debug.teleport(x, y); N.view3d.settle(15000);
      const s = N.view3d.stats(), g = N.view3d.ground && N.view3d.ground.stats ? N.view3d.ground.stats() : null;
      out.push([s.chunks, s.groundTextures + (g ? g.textures || 0 : 0), s.textures, s.geometries]);
    }
    N.view3d.setQuality({ drawDist: 450 }); N.view3d.settle(10000);
    return out;
  });
  // ground surface maps (one 256² texture per ready chunk, view3d_ground) scale with the chunks in range: judged per
  // chunk; everything else (models, atlases, layers) has the fixed budget
  const maxTex = Math.max(...trip.map((r) => r[2])), maxGeo = Math.max(...trip.map((r) => r[3]));
  const maxOther = Math.max(...trip.map((r) => r[2] - r[1])), groundOk = trip.every((r) => r[1] <= r[0]);
  check(maxOther < 160 && groundOk && maxGeo < 700, 'long trip (6 far teleports): GPU memory bounded (max ' + maxTex + ' textures = ground maps ' + trip.map((r) => r[1]).join('/') + ' (<= 1 per chunk) + at most ' + maxOther + ' others (< 160), ' + maxGeo + ' geometries; chunks ' + trip.map((r) => r[0]).join('/') + ')');
  report.push('long trip textures per stop: ' + trip.map((r) => r[2]).join(', ') + '; geometries: ' + trip.map((r) => r[3]).join(', '));

  // ---- repeated toggles do not leak (baseline after one full cycle, then 12 more toggles)
  await setLowRes(page, true);
  const meas = () => page.evaluate(() => { N.view.set('tps'); N.view3d.settle(8000); const s = N.view3d.stats(); return [s.geometries - s.actors * 2, s.textures, s.chunks, s.actors]; });
  for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyV'); await frames(page, 2); }
  await frames(page, 2);
  const m0 = await meas();
  for (let i = 0; i < 12; i++) { await page.keyboard.press('KeyV'); await frames(page, 2); }
  await frames(page, 2);
  const m1 = await meas();
  check(m1[0] <= m0[0] + 8 && m1[1] <= m0[1] + 4, '12 view toggles: no GPU resource growth (static geometries ' + m0[0] + ' -> ' + m1[0] + ', textures ' + m0[1] + ' -> ' + m1[1] + ')');

  // ---- the third-person camera keeps out of buses, cars and festival stalls (audit PERF-17): parked art buses at
  // Koti bus stand (solid cells the static camera grid does not know), traffic beside Chinnu, Numaish's stalls.
  // (after the long trip and the toggle-leak checks: Koti and the Numaish festival layer fill caches their budgets
  // do not expect)
  const camIn = await page.evaluate(async () => {
    const fr = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const W = N.world, C = N.CELL, HT = { heavy: 17, car: 9, auto: 11 }, out = { samples: 0, inside: [], spots: [] };
    const near = (x, y, r) => { const f = W.findFree(x, y, 'walk', 5); return f && Math.hypot(f.x - x, f.y - y) < r ? f : null; };
    // bad: the camera in a vehicle box; in a SOLID cell the camera height grid does not know (unless the camera is
    // pinned at Chinnu's head, < 2.5 u: a wall right behind him, nothing to pull in to); in a stall (footprint + 0.5 u:
    // the near plane would cut its panels); or a stall (footprint - 0.5 u) between the camera and his head
    const inside = () => {
      const cam = N.view3d.engine.camera.position, cx = cam.x, cy = cam.z, ch = cam.y, p = N.player;
      for (const v of N.entities.query(cx, cy, 60, (e) => e.kind === 'vehicle' && e.T && HT[e.T.cls] && e !== N.player.vehicle)) {
        const c = Math.cos(v.angle), s = Math.sin(v.angle), dx = cx - v.x, dy = cy - v.y;
        if (Math.abs(dx * c + dy * s) < v.T.w / 2 && Math.abs(-dx * s + dy * c) < v.T.d / 2 && ch < HT[v.T.cls]) return v.type;
      }
      const dist = Math.hypot(cx - p.x, cy - p.y);
      if (W.surfaceAt(cx, cy) === N.SURF.SOLID && N.view3d.H.heightAt(cx, cy) === 0 && ch < 11 && dist >= 2.5) return 'solid @' + dist.toFixed(1) + ' u';
      const R = N.festivals3d && N.festivals3d.numaishSolids && N.festivals3d.numaishSolids().on ? N.festivals3d.numaishSolids().rects : [];
      const inR = (x, y, h, m) => R.some((r) => x > r[0] - m && x < r[0] + r[2] + m && y > r[1] - m && y < r[1] + r[3] + m && h < 11.5);
      if (inR(cx, cy, ch, 0.5)) return 'stall';
      const ph = (N.view3d.elevation ? N.view3d.elevation(p) : 0) + 6;
      for (let k = 1; k < 20; k++) { const t = k / 20; if (inR(cx + (p.x - cx) * t, cy + (p.y - cy) * t, ch + (ph - ch) * t, -0.5)) return 'stall between camera and Chinnu'; }
      return null;
    };
    const sweep = async (label) => {
      N.view3d.settle(15000);
      for (let k = 0; k < 8; k++) {
        N.view3d.setCamera({ yaw: k * Math.PI / 4, pitch: 0.28, snap: true });
        await fr(3);
        out.samples++;
        const w = inside(); if (w) out.inside.push(label + ' yaw ' + k + ': ' + w);
      }
    };
    N.time.scale = 0;
    // Koti: beside the parked buses' solid cells
    N.calendar.set(2003, 1, 14, 18, 10); N.debug.setTime(18, 10); N.debug.teleport('koti'); N.view3d.settle(20000);
    let p = N.player, n = 0;
    for (let j = Math.floor((p.y - 400) / C); j < (p.y + 400) / C && n < 2; j += 2) for (let i = Math.floor((p.x - 400) / C); i < (p.x + 400) / C && n < 2; i += 2) {
      if (W.grid[j * W.GW + i] !== N.SURF.SOLID || N.view3d.H.heightAt((i + 0.5) * C, (j + 0.5) * C) > 0) continue;
      const f = near((i + 0.5) * C + 10, (j + 0.5) * C, 8) || near((i + 0.5) * C, (j + 0.5) * C + 10, 8);
      if (f && !out.spots.some((q) => Math.hypot(q[0] - f.x, q[1] - f.y) < 80)) { out.spots.push([Math.round(f.x), Math.round(f.y), 'bus']); N.player.teleport(f.x, f.y); await sweep('by a parked bus'); n++; }
    }
    // Numaish (20 Jan, evening): in front of the stalls
    N.calendar.set(2003, 1, 20, 19, 30); N.debug.setTime(19, 30); N.debug.teleport('giant_wheel'); N.view3d.settle(20000);
    p = N.player;
    const R = (N.festivals3d && N.festivals3d.numaishSolids().rects) || [];
    R.sort((a, b) => Math.hypot(a[0] - p.x, a[1] - p.y) - Math.hypot(b[0] - p.x, b[1] - p.y));
    let m = 0;
    for (const [x, y, w, d] of R.slice(0, 30)) {
      if (m >= 3) break;
      for (const [ox, oy] of [[0, d / 2 + 5], [0, -d / 2 - 5], [w / 2 + 5, 0], [-w / 2 - 5, 0]]) { const f = near(x + w / 2 + ox, y + d / 2 + oy, 4); if (f) { out.spots.push([Math.round(f.x), Math.round(f.y), 'stall']); N.player.teleport(f.x, f.y); await sweep('by a stall'); m++; break; } }
    }
    N.calendar.set(2003, 1, 14, 19, 30); N.debug.setTime(19, 30); N.debug.teleport('laad_bazaar'); // (as the sections below expect)
    N.time.scale = 1;
    return out;
  });
  check(camIn.samples >= 24 && camIn.inside.length === 0, 'third-person camera never inside a parked bus, a vehicle or a Numaish stall, nor behind a stall (' + camIn.samples + ' camera spots round ' + camIn.spots.length + ' places)', camIn.inside.slice(0, 6).join('; '));

  // ---- WebGL context loss -> top-down -> restored -> 3D
  await page.evaluate(() => { const gl = N.view3d.engine.renderer.getContext(); window.__lc = gl.getExtension('WEBGL_lose_context'); window.__lc.loseContext(); });
  await sleep(500);
  const lost = await st(page);
  check(lost.mode === 'top' && lost.want === 'tps', 'context lost -> top-down while waiting (' + lost.mode + ')');
  await page.evaluate(() => window.__lc.restoreContext());
  check(await waitMode(page, 'tps', 60000), 'context restored -> back to 3D');
  await frames(page, 3);

  // ---- title screen attract in 3D
  await page.evaluate(() => { N.game.quitToTitle(); });
  await frames(page, 3);
  const tt = await st(page);
  check(tt.state === 'title' && tt.active, 'title screen renders the 3D city');
  await setLowRes(page, false);
  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'view3d_desktop_title.png'), timeout: 240000 });
  await checkErrors(errors, page);
  await context.close();
}

/* ---------------------------------------------------------------- phones */
async function phone(browser, name) {
  cur = name;
  const V = VIEWPORTS[name];
  console.log('\n== ' + name + ' ' + V.viewport.width + 'x' + V.viewport.height + ' (touch)');
  const { context, page, errors, cdp } = await openPage(browser, V);
  const tier = await page.evaluate(() => N.view3d.quality.tier);
  check(tier === 'low', 'phone quality tier: ' + tier);
  await page.evaluate(() => N.view3d.setQuality({ adaptive: false }));
  // the VIEW pill
  const pill = await page.evaluate(() => { const b = document.querySelector('.t-view'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, txt: b.textContent, vis: getComputedStyle(b).display !== 'none' }; });
  check(pill && pill.vis, 'VIEW pill shown (' + (pill && pill.txt) + ')');
  // no overlap with the other touch buttons or the HUD stats
  const ov = await page.evaluate(() => {
    const a = document.querySelector('.t-view').getBoundingClientRect();
    const hit = [];
    for (const s of ['.t-map', '.t-pause', '.t-action', '.t-run', '.t-horn', '.hud-stats']) { const e = document.querySelector(s); if (!e) continue; const b = e.getBoundingClientRect(); if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) hit.push(s); }
    return hit;
  });
  check(ov.length === 0, 'VIEW pill overlaps no other control / HUD stats', ov.join(','));
  await page.tap('.t-view');
  check(await waitMode(page, 'tps', 90000), 'tap VIEW -> 3D third person');
  const pr = await page.evaluate(() => [N.view3d.quality.pixelRatio, N.view3d.engine.renderer.getPixelRatio(), N.view3d.quality.shadows]);
  check(pr[0] <= 1.25 && !pr[2], 'phone: pixel ratio capped at ' + pr[0] + ', no shadow map');
  await setLowRes(page, true);
  await page.evaluate(() => { N.debug.teleport(4473, 2671); N.view3d.settle(8000); N.view3d.setCamera({ yaw: 0, pitch: 0.3, snap: true }); });
  // right-half touch look drag
  const W = V.viewport.width, H = V.viewport.height;
  const touch = async (x0, y0, dx, dy, holdMs) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 8, y: y0 + (dy * i) / 8, id: 1 }] }); await sleep(20); }
    if (holdMs) await sleep(holdMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const yawA = (await st(page)).yaw;
  await touch(W * 0.72, H * 0.45, -90, 10, 0);
  await frames(page, 3);
  const yawB = (await st(page)).yaw;
  check(Math.abs(yawB - yawA) > 0.25, 'right-half touch drag turns the camera (yaw ' + yawA.toFixed(2) + ' -> ' + yawB.toFixed(2) + ')');
  // joystick forward = camera forward
  await page.evaluate(() => N.view3d.setCamera({ yaw: Math.PI / 2, pitch: 0.3, snap: true }));
  const a = await st(page);
  const x0 = 90, y0 = H - 140;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 2 }] });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0, y: y0 - i * 10, id: 2 }] }); await sleep(16); }
  const t0 = Date.now(); let b = a;
  while (Date.now() - t0 < 15000) { await sleep(150); b = await st(page); if (Math.hypot(b.x - a.x, b.y - a.y) > 30) break; }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const d = Math.hypot(b.x - a.x, b.y - a.y), along = (b.y - a.y) / (d || 1);
  check(d > 12 && along > 0.8, 'joystick up walks along the camera (south; moved ' + d.toFixed(0) + 'u, alignment ' + along.toFixed(2) + ')');
  // screenshots
  await setLowRes(page, false);
  await shot(page, 'himayatnagar_tps', { at: [4473, 2671], h: 16, m: 30, mode: 'tps', look: [4473, 2400], pitch: 0.3 });
  await page.tap('.t-view');
  check(await waitMode(page, 'fps', 60000), 'tap VIEW -> first person');
  await shot(page, 'charminar_night_fps', { at: [3900, 4470], h: 21, m: 0, mode: 'fps', look: [3900, 4360], pitch: -0.25 });
  await shot(page, 'oldcity_tps', { at: 'gulzar_houz', h: 11, m: 0, mode: 'tps', look: [3900, 4360], pitch: 0.3 });
  await page.evaluate(() => N.view.set('fps'));
  await page.tap('.t-view');
  check(await waitMode(page, 'top', 60000), 'tap VIEW -> top-down');
  const sc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
  check(sc.sw <= sc.iw && sc.sh <= sc.ih, 'no page scroll');
  await checkErrors(errors, page);
  await context.close();
}

/* ---------------------------------------------------------------- missing library */
async function fallback(browser) {
  cur = 'fallback';
  console.log('\n== missing three.js (both URLs blocked)');
  const { context, page, errors } = await openPage(browser, VIEWPORTS.desktop, { block: true });
  await page.keyboard.press('KeyV');
  try { await page.waitForFunction(() => N.view.available === false, null, { timeout: 60000 }); } catch (e) { /* checked below */ }
  await sleep(300);
  const s = await page.evaluate(() => ({ mode: N.view.mode, want: N.view.want, avail: N.view.available, err: N.view.error, canvas: !!document.getElementById('game3d'), toasts: [...document.querySelectorAll('#ui *')].map((e) => e.textContent).join(' | '), body: document.body.classList.contains('view-3d') }));
  check(s.avail === false && s.mode === 'top' && s.want === 'top' && !s.body, 'stays top-down (' + s.err + ')');
  let toastOk = false;
  for (let i = 0; i < 40 && !toastOk; i++) { toastOk = await page.evaluate(() => /3D view unavailable/.test([...document.querySelectorAll('#ui *')].map((e) => e.textContent).join(' | ') + ' | ' + (N.hud.toastQueue ? N.hud.toastQueue().join(' | ') : ''))); if (!toastOk) await sleep(200); }
  check(toastOk, 'toast says why');
  // the game keeps running in 2D
  const a = await st(page);
  // (the 2D canvas is GPU-rastered here: with SwiftShader on a loaded host the first top-down frames after the failed
  // load can take seconds each, so allow a long hold; it ends as soon as Chinnu has moved)
  await holdUntil(page, ['KeyD'], (x) => Math.hypot(x.x - a.x, x.y - a.y) > 20, 45000);
  const b = await st(page);
  check(Math.hypot(b.x - a.x, b.y - a.y) > 10, 'top-down play continues (' + Math.round(Math.hypot(b.x - a.x, b.y - a.y)) + ' u in ' + b.stack + ', fps ' + b.fps + ')', JSON.stringify({ a, b }));
  await checkErrors(errors, page, /Failed to load resource/);
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const t0 = Date.now();
  try {
    if (!ONLY || ONLY === 'desktop') await desktop(browser);
    if (!ONLY || ONLY === 'portrait') await phone(browser, 'portrait');
    if (!ONLY || ONLY === 'landscape') await phone(browser, 'landscape');
    if (!ONLY || ONLY === 'fallback') await fallback(browser);
  } catch (e) {
    fail('exception: ' + (e.stack || e.message));
  }
  await browser.close();
  if (report.length) { console.log('\nPerformance:'); for (const r of report) console.log('  ' + r); }
  console.log('\n' + (failures.length ? 'FAILED ' + failures.length + ':\n  ' + failures.join('\n  ') : 'ALL OK') + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  process.exit(failures.length ? 1 : 0);
})();
