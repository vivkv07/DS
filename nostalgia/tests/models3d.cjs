/* NOSTALGIA — tests/models3d.cjs (Blender asset pipeline, ARCHITECTURE §21) — src/models3d.js
 * Headless Chromium + SwiftShader (software GL: small viewports, long timeouts). three.js is served
 * from vendor/ by routing the jsDelivr URL. Fails on any console error / page error / N.err.
 *
 *  lazy      the pack and GLTFLoader are not loaded in top-down; 3D loads them (dev page files)
 *  routes    the player renders with kid_chinnu (procedural renderer kept underneath); riding hands the
 *            player back to the procedural rider; parked Hero cycles render with hero_cycle
 *  clips     character clip selection by speed (idle / stroll / walk / run, blends), phase from distance
 *  gait      binding feedback_3d #2: frame sequences while walking (45 u/s) and running (80 u/s):
 *            8 frames at 0.1 s strips (tests/out/models3d_walk.png / _run.png) + dense slow-motion
 *            sampling of the sole anchors: grounded soles must not slide, never sink, run has flight
 *  cycle     hero_cycle parts: wheels spin with distance, steering turns the fork, pedals stay level
 *  proto     N.models3d.useProto swaps the procedural Charminar for charminar_proto (and back)
 *  tint      NPC looks dress the character (shirt / pants / skin ratios), line-up screenshot
 *  fallback  pack missing -> procedural, no errors besides the blocked request; a corrupt model is
 *            skipped while the others still load
 *  dist      dist/nostalgia.html runs the inline (text/plain) loader + pack blocks
 *   node nostalgia/tests/models3d.cjs        ONLY=lazy,gait,...   SHOTS=0 (skip screenshots)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const DIST = 'file://' + path.join(ROOT, 'dist', 'nostalgia.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const SHOTS = process.env.SHOTS !== '0';
const failures = [];
const report = [];
let cur = '';
const fail = (msg) => { failures.push('[' + cur + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const want = (k) => !ONLY || ONLY.has(k);

async function openPage(browser, o) {
  o = o || {};
  const context = await browser.newContext({ viewport: o.viewport || { width: 720, height: 420 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  if (o.routes) for (const [re, fn] of o.routes) await page.route(re, fn);
  await page.goto(o.url || URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    N.debug.freezeClock(true);
    N.debug.god(true);
    N.view.noPointerLock = true;
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
  });
  return { context, page, errors };
}
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);
async function to3D(page, mode) {
  await page.evaluate((m) => { N.view3d.setQuality({ adaptive: false, pixelRatio: 1, drawDist: 420 }); N.view.set(m || 'tps'); }, mode);
  await page.waitForFunction((m) => N.view.mode === (m || 'tps'), mode, { timeout: 180000 });
}
async function waitModels(page) {
  await page.waitForFunction(() => N.models3d && ['ready', 'missing', 'failed'].indexOf(N.models3d.state) >= 0, null, { timeout: 240000 });
  await frames(page, 3);
  return page.evaluate(() => N.models3d.stats());
}
async function checkErrors(page, errors, allow) {
  const nerr = await page.evaluate(() => (N.debug.state().errors || []));
  const all = errors.concat(nerr.map((e) => 'N.err: ' + e)).filter((e) => !(allow && allow.test(e)));
  check(all.length === 0, 'no console / page / N.err errors', all.slice(0, 6).join(' | '));
}
const saveData = (name, data) => { if (!data) return; fs.writeFileSync(path.join(OUT, name), Buffer.from(data.split(',')[1], 'base64')); ok('saved tests/out/' + name); };
async function shot(page, name) {
  if (!SHOTS) return;
  await frames(page, 2);
  await page.screenshot({ path: path.join(OUT, name), timeout: 240000 });
  ok('screenshot tests/out/' + name);
}

/* in-page helpers: capture strips of the 3D canvas around an entity at sim-time steps, sample soles */
const HELPERS = () => {
  window.M3 = {
    charOf(e) { let c = null; N.view3d.engine.actorGroup.traverse((o) => { if (!c && o.userData && o.userData.m3dChar && (!e || o.parent && o.parent.userData)) c = o.userData.m3dChar; }); return c; },
    playerChar() {
      let c = null;
      N.view3d.engine.actorGroup.traverse((o) => { if (o.userData && o.userData.m3dChar && o.userData.m3dChar.id === 'kid_chinnu' && o.userData.m3dState && Math.abs(o.position.x - N.player.x) < 0.5 && Math.abs(o.position.z - N.player.y) < 0.5) c = o.userData.m3dChar; });
      return c;
    },
    soles(c) {
      const out = [], v = new N.view3d.THREE.Vector3();
      for (const k of ['sole_heel_L', 'sole_toe_L', 'sole_heel_R', 'sole_toe_R']) { const a = c.anchors[k]; if (!a) return null; a.getWorldPosition(v); out.push([v.x, v.y, v.z]); }
      return out;
    },
    cap: null,
    raf(n) { return new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }); },
    /** sample every rendered frame (soles + body) and copy canvas cells every `step` s of sim time */
    begin(o) {
      const C = (M3.cap = Object.assign({ frames: [], cells: 0, max: 8, step: 0.1, next: null, cw: 150, ch: 210, strip: null, side: true }, o || {}));
      if (C.max) { C.strip = document.createElement('canvas'); C.strip.width = C.cw * C.max; C.strip.height = C.ch; }
      const cv = N.view3d.engine.renderer.domElement;
      const loop = () => {
        if (M3.cap !== C || C.done) return;
        requestAnimationFrame(loop);
        const p = N.player, c = M3.playerChar();
        if (!c) return;
        const s = M3.soles(c);
        const t = N.time.now;
        C.frames.push({ t, x: p.x, y: p.y, h: N.view3d.elevation(p), soles: s, clip: c.clip, v: c.v, phase: c.phase });
        if (C.strip && C.cells < C.max && (C.next == null || t >= C.next)) {
          if (C.next == null) C.next = t;
          C.next += C.step;
          const sc = cv.width / cv.clientWidth;
          const pr = N.view3d.project(p.x, p.y, 3.6);
          const g = C.strip.getContext('2d');
          if (pr) g.drawImage(cv, Math.round(pr.x * sc - C.cw / 2), Math.round(pr.y * sc - C.ch / 2), C.cw, C.ch, C.cells * C.cw, 0, C.cw, C.ch);
          g.strokeStyle = '#000'; g.strokeRect(C.cells * C.cw + 0.5, 0.5, C.cw - 1, C.ch - 1);
          g.fillStyle = '#fff'; g.font = '11px monospace'; g.fillText((C.cells * C.step).toFixed(1) + 's ' + c.clip, C.cells * C.cw + 4, 13);
          C.cells++;
        }
        if (C.follow) {
          const a = p.facing || 0, sx = -Math.sin(a), sy = Math.cos(a);
          N.view3dActors.debug.camera([p.x + sx * 26, 6.5, p.y + sy * 26], [p.x, 3.4, p.y], 34);
        }
      };
      requestAnimationFrame(loop);
    },
    end() {
      const C = M3.cap; if (!C) return null;
      C.done = true; M3.cap = null;
      if (C.follow) N.view3dActors.debug.camera(null);
      return { frames: C.frames, cells: C.cells, strip: C.strip && C.cells ? C.strip.toDataURL('image/png') : null };
    },
    /** grounded sole points (within 0.12 u of the ground in two successive frames) must not move */
    gait(F) {
      let slip = 0, travel = 0, pairs = 0, minLow = 9, maxLow = -9, air = 0, n = 0;
      for (let i = 1; i < F.length; i++) {
        const a = F[i - 1], c = F[i];
        if (!a.soles || !c.soles) continue;
        n++;
        const d = Math.hypot(c.x - a.x, c.y - a.y);
        const low = Math.min(...c.soles.map((s) => s[1])) - c.h;
        minLow = Math.min(minLow, low); maxLow = Math.max(maxLow, low);
        if (low > 0.25) air++;
        for (let s = 0; s < 4; s += 2) {
          let best = null;
          for (const k of [s, s + 1]) {
            const p0 = a.soles[k], p1 = c.soles[k];
            if (p0[1] - a.h < 0.12 && p1[1] - c.h < 0.12) { const m = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]); best = best == null ? m : Math.min(best, m); }
          }
          if (best != null) { slip += best; travel += d; pairs++; }
        }
      }
      return { n, pairs, slip: +slip.toFixed(3), travel: +travel.toFixed(2), ratio: travel > 0 ? +(slip / travel).toFixed(4) : null, minLow: +minLow.toFixed(3), maxLow: +maxLow.toFixed(3), air };
    },
  };
};

/* ---------------------------------------------------------------- lazy + routes + clips + gait + cycle + tint */
async function main3d(browser) {
  cur = 'lazy';
  console.log('\n== lazy loading, overrides, clips, gait, Hero cycle, tint (720x420)');
  const { context, page, errors } = await openPage(browser);
  await page.evaluate(HELPERS);
  // top-down first: nothing of the pipeline is loaded
  await page.evaluate(() => { N.input.hold('up', true); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { N.input.hold('up', false); });
  const before = await page.evaluate(() => ({ pack: !!N.ASSETS3D, loader: !!(window.THREE && window.THREE.GLTFLoader), tags: Array.from(document.scripts).filter((s) => /assets3d_pack|GLTFLoader/.test(s.src)).length, state: N.models3d.state }));
  check(!before.pack && !before.loader && before.tags === 0 && before.state === 'idle', 'top-down: no pack, no GLTFLoader, no script tags (lazy) — ' + JSON.stringify(before));
  await to3D(page, 'tps');
  const st = await waitModels(page);
  check(st.state === 'ready', 'models3d ready after entering 3D (' + st.state + (st.error ? ': ' + st.error : '') + ')');
  check(st.packFrom === 'src/assets3d_pack.js' && /GLTFLoader/.test(st.loaderFrom || ''), 'loaded lazily from the dev files (' + st.loaderFrom + ', ' + st.packFrom + ')');
  check(st.parsed.indexOf('kid_chinnu') >= 0 && st.parsed.indexOf('hero_cycle') >= 0 && st.parsed.indexOf('charminar_proto') < 0, 'parsed kid_chinnu + hero_cycle, the proto only on demand (' + st.parsed.join(', ') + ')');
  report.push('load: pack ' + st.pack.join(',') + '; script load ' + st.loadMs + ' ms, GLB parse ' + st.parseMs + ' ms (software GL, loaded machine)');
  try { execFileSync('node', [path.join(ROOT, 'tools/pack_assets3d.cjs'), '--check'], { stdio: 'pipe' }); ok('src/assets3d_pack.js is up to date with assets3d/*.glb'); } catch (e) { fail('src/assets3d_pack.js is stale: ' + String(e.stdout || e.message).trim()); }

  // ---- routes: the player renders with the Blender model; the procedural renderer stays underneath
  cur = 'routes';
  const r1 = await page.evaluate(async () => {
    await M3.raf(4);
    const p = N.player;
    const c = M3.playerChar();
    return { key: p.view3d, char: !!c, clip: c && c.clip, procedural: !!(N.view3dActors && N.view3dActors.ready), regs: N.models3d.stats().registered };
  });
  check(r1.key === 'm3d:char:kid_chinnu' && r1.char, 'player routed to the kid_chinnu model (' + r1.key + ', clip ' + r1.clip + ')');
  check(r1.regs.indexOf('m3d:char:kid_chinnu') >= 0 && r1.regs.indexOf('m3d:veh:hero_cycle') >= 0, 'override renderers registered: ' + r1.regs.join(', '));
  // ride: the player is handed back to the procedural renderer (riding pose), then routed again on foot
  const r2 = await page.evaluate(async () => {
    const p = N.player;
    const v = N.vehicles.spawn('hero_cycle', p.x + 8, p.y + 2, p.facing || 0, {});
    await M3.raf(3);
    const parkedKey = v && v.view3d;
    let parkedObj = false;
    N.view3d.engine.actorGroup.traverse((o) => { if (o.name === 'm3d-veh:hero_cycle' && Math.abs(o.position.x - v.x) < 0.5 && Math.abs(o.position.z - v.y) < 0.5) parkedObj = true; });
    N.vehicles.enter(p, v);
    await M3.raf(4);
    const riding = { player: p.view3d || null, vehicle: v.view3d || null, inVeh: !!p.vehicle };
    N.vehicles.exit(p, true);
    await M3.raf(4);
    const after = { player: p.view3d || null, vehicle: v.view3d || null, inVeh: !!p.vehicle };
    return { parkedKey, parkedObj, riding, after, vid: v && v.id };
  });
  check(r2.parkedKey === 'm3d:veh:hero_cycle' && r2.parkedObj, 'a parked Hero cycle renders with the Blender hero_cycle model');
  check(r2.riding.inVeh && !r2.riding.player && !r2.riding.vehicle, 'riding: player and cycle fall back to the procedural renderer (rider IK) — ' + JSON.stringify(r2.riding));
  check(!r2.after.inVeh && r2.after.player === 'm3d:char:kid_chinnu' && r2.after.vehicle === 'm3d:veh:hero_cycle', 'off the cycle again: both back on the Blender models — ' + JSON.stringify(r2.after));

  // ---- clips by speed + phase from distance (a standalone character, not in the scene)
  cur = 'clips';
  const cl = await page.evaluate(() => {
    const c = N.models3d.character('kid_chinnu', N.player.look);
    const out = {};
    for (const v of [0, 8, 14, 30, 45, 62, 80, 110]) { c.setSpeed(v); for (let i = 0; i < 40; i++) c.update(1 / 60); out[v] = { clip: c.clip, w: c.weights() }; }
    const man = N.models3d.manifest('kid_chinnu').clips;
    c.setSpeed(45); c.phase = 0; for (let i = 0; i < 60; i++) c.update(1 / 60, 45 / 60);
    const ph = c.phase;
    c.dispose();
    return { out, ph, stride: man.walk.stride, clips: Object.keys(man) };
  });
  const sumW = (w) => Object.values(w).reduce((s, x) => s + x, 0);
  check(cl.out[0].clip === 'idle' && cl.out[14].clip === 'stroll' && cl.out[45].clip === 'walk' && cl.out[80].clip === 'run' && cl.out[110].clip === 'run', 'clip by speed: 0 idle, 14 stroll, 45 walk, 80 run (' + [0, 8, 14, 30, 45, 62, 80, 110].map((v) => v + ':' + cl.out[v].clip).join(' ') + ')');
  check(cl.out[30].w.stroll > 0.2 && cl.out[30].w.walk > 0.2 && cl.out[62].w.walk > 0.2 && cl.out[62].w.run > 0.2, 'between nominal speeds the locomotion clips blend (30: ' + JSON.stringify(cl.out[30].w) + ', 62: ' + JSON.stringify(cl.out[62].w) + ')');
  check([0, 14, 30, 45, 62, 80].every((v) => Math.abs(sumW(cl.out[v].w) - 1) < 0.02), 'clip weights always sum to 1 (no bind-pose bleed)');
  const expPh = (45 / cl.stride) % 1;
  check(Math.abs(cl.ph - expPh) < 0.02, 'phase advances by distance / stride (1 s at 45 u/s: ' + cl.ph.toFixed(3) + ' vs ' + expPh.toFixed(3) + ', stride ' + cl.stride + ' u)');

  // ---- gait: 8 frames at 0.1 s while walking and running + dense slow-motion sampling
  cur = 'gait';
  await page.evaluate(() => {
    if (N.traffic) { N.traffic.enabled = false; if (N.traffic.clear) N.traffic.clear(); }
    N.debug.teleport('fateh_maidan'); N.debug.setTime(11, 0);
    N.view3d.setQuality({ adaptive: false, drawDist: 320, pixelRatio: 1 });
    N.view3d.settle(20000);
    document.getElementById('ui').style.display = 'none';
  });
  await frames(page, 4);
  const G = {};
  for (const [name, run] of [['walk', false], ['run', true]]) {
    const g = await page.evaluate(async (run) => {
      const p = N.player;
      N.time.scale = 1;
      N.input.hold('up', true); if (run) N.input.hold('run', true);
      await M3.raf(16);
      // the strip: 8 frames at 0.1 s of game time, side camera following Chinnu
      N.time.scale = 0.25;
      M3.begin({ max: 8, step: 0.1, follow: true });
      for (let i = 0; i < 900 && M3.cap.cells < 8; i++) await M3.raf(1);
      const strip = M3.end();
      // dense: slow motion, every rendered frame
      N.time.scale = 0.04;
      M3.begin({ max: 0, follow: true });
      const t0 = N.time.now;
      for (let i = 0; i < 900 && N.time.now - t0 < 0.5; i++) await M3.raf(1);
      const dense = M3.end();
      N.time.scale = 1;
      N.input.hold('run', false); N.input.hold('up', false);
      await M3.raf(10);
      return { strip: strip.strip, cells: strip.cells, stats: M3.gait(dense.frames), clips: Array.from(new Set(dense.frames.map((f) => f.clip))), v: dense.frames.length ? dense.frames[dense.frames.length - 1].v : 0, n: dense.frames.length };
    }, run);
    G[name] = g;
    saveData('models3d_' + name + '.png', g.strip);
    const s = g.stats;
    check(g.cells === 8, name + ': 8-frame strip at 0.1 s (' + g.cells + ' cells, clips ' + g.clips.join('/') + ', ' + g.v.toFixed(0) + ' u/s)');
    check(g.clips.indexOf(name) >= 0, name + ': the ' + name + ' clip plays (' + g.clips.join(', ') + ')');
    check(s.pairs >= 6 && s.ratio != null && s.ratio < 0.08, name + ': planted feet — grounded soles move ' + s.slip + ' u while the body moves ' + s.travel + ' u (sliding ' + ((s.ratio || 0) * 100).toFixed(1) + '% < 8%, ' + s.pairs + ' contact pairs in ' + s.n + ' frames)', JSON.stringify(s));
    check(s.minLow > -0.15, name + ': soles never sink below the ground (lowest ' + s.minLow + ' u)');
    if (run) check(s.air > 0, name + ': flight phases (' + s.air + ' airborne frames, up to ' + s.maxLow + ' u)');
    else check(s.maxLow < 0.75, name + ': walking keeps a foot near the ground (highest lowest-sole ' + s.maxLow + ' u)');
    report.push('gait ' + name + ' at ' + g.v.toFixed(0) + ' u/s: sliding ' + ((s.ratio || 0) * 100).toFixed(2) + '%, ' + s.pairs + ' contact pairs, ' + s.air + '/' + s.n + ' airborne frames, lowest sole ' + s.minLow + ' u');
  }
  // standing still: idle, both feet down
  const idle = await page.evaluate(async () => { await M3.raf(30); const c = M3.playerChar(); const s = M3.soles(c); const h = N.view3d.elevation(N.player); return { clip: c.clip, lows: s.map((q) => +(q[1] - h).toFixed(3)) }; });
  check(idle.clip === 'idle' && idle.lows.every((x) => Math.abs(x) < 0.12), 'standing: idle with both feet on the ground (' + idle.lows.join(', ') + ')');
  await page.evaluate(() => { document.getElementById('ui').style.display = ''; });

  // ---- Hero cycle: parts move with the simulation; screenshot
  cur = 'cycle';
  const cy = await page.evaluate(async () => {
    const T = N.view3d.THREE;
    const P = N.models3d.vehicleParts('hero_cycle');
    const q = (n) => n.node.quaternion.clone();
    const wq0 = q(P.wheels[0]), sq0 = q(P.steer), pw0 = new T.Quaternion(); P.pedals[0].node.getWorldQuaternion(pw0);
    P.set({ dist: 7.5, steer: 0.4 });
    P.object.updateMatrixWorld(true);
    const wq1 = q(P.wheels[0]), sq1 = q(P.steer), pw1 = new T.Quaternion(); P.pedals[0].node.getWorldQuaternion(pw1);
    const ang = (a, b) => +(2 * Math.acos(Math.min(1, Math.abs(a.dot(b))))).toFixed(3);
    const res = { wheel: ang(wq0, wq1), expect: +(7.5 / P.R % (2 * Math.PI)).toFixed(3), steer: ang(sq0, sq1), pedalWorld: ang(pw0, pw1), crank: ang(q(P.crank), P.crank.rest), anchors: Object.keys(P.anchors).sort() };
    P.dispose();
    return res;
  });
  check(Math.abs(cy.wheel - cy.expect) < 0.02, 'wheels spin by distance / radius (' + cy.wheel + ' rad for 7.5 u)');
  check(Math.abs(cy.steer - 0.4) < 0.02, 'steering turns the fork about its axis (' + cy.steer + ' rad)');
  check(cy.crank > 0.5 && cy.pedalWorld < 0.02, 'crank turns with the gear ratio and the pedals stay level (crank ' + cy.crank + ' rad, pedal world change ' + cy.pedalWorld + ')');
  check(['grip_L', 'grip_R', 'handlebar', 'headlight', 'pedal_L', 'pedal_R', 'seat_driver', 'seat_pillion', 'wheel_front', 'wheel_rear'].every((a) => cy.anchors.indexOf(a) >= 0), 'anchors: ' + cy.anchors.join(', '));
  if (SHOTS) {
    await page.evaluate(async () => {
      const p = N.player;
      const v = N.vehicles.spawn('hero_cycle', p.x + 10, p.y + 12, 0.3, {});
      window.__cyc = v;
      await M3.raf(4);
      N.view3dActors.debug.camera([v.x - 9, 7.5, v.y + 16], [v.x, 3.4, v.y], 40);
    });
    await shot(page, 'models3d_cycle.png');
    await page.evaluate(() => N.view3dActors.debug.camera(null));
  }
  // ---- tint: N.people looks dress the kid (line-up next to Chinnu)
  cur = 'tint';
  const ti = await page.evaluate(async () => {
    const H = N.view3d.H, p = N.player;
    const looks = [{ kind: 'kid', skin: '#8d5a3b', hair: '#1a1412', shirt: '#d8402a', stripes: '#f2c230', pants: '#2a3a6a' }, { kind: 'kid', skin: '#d29a6a', hair: '#3a2a1a', shirt: '#3a8a3a', pants: '#5a4a3a' }];
    const R = N.models3d.debug.tintRatios(N.models3d.debug.S.models.get('kid_chinnu'), looks[0]);
    const kids = looks.map((l, i) => { const c = N.models3d.character('kid_chinnu', l); c.object.position.set(p.x + (i ? -6 : 6), N.view3d.elevation(p), p.y); c.object.rotation.y = -(p.facing || 0); c.setSpeed(0).update(0.5); H.layer.add(c.object); return c; });
    window.__kids = kids;
    const mat = kids[0].mesh.material;
    return { shirt: R[3].toArray().map((x) => +x.toFixed(3)), pants: R[5].toArray().map((x) => +x.toFixed(3)), tinted: !!(mat.userData && mat.userData.tinted), key: mat.customProgramCacheKey && mat.customProgramCacheKey() };
  });
  // expected: linear(#d8402a) / linear(#3d6fb0)
  const lin = (h) => [1, 3, 5].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  const e1 = lin('#d8402a').map((x, i) => x / lin('#3d6fb0')[i]);
  check(ti.tinted && ti.key === 'm3d-tint' && ti.shirt.every((x, i) => Math.abs(x - e1[i]) < 0.02), 'tint: look.shirt -> region ratio ' + ti.shirt.join(',') + ' (expected ' + e1.map((x) => x.toFixed(3)).join(',') + '), one shared program');
  if (SHOTS) {
    await page.evaluate(() => { const p = N.player, a = p.facing || 0; N.view3dActors.debug.camera([p.x + Math.cos(a) * 24, 6.5, p.y + Math.sin(a) * 24], [p.x, 3.6, p.y], 40); });
    await shot(page, 'models3d_lineup.png');
    await page.evaluate(() => { N.view3dActors.debug.camera(null); for (const c of window.__kids) c.dispose(); });
  }
  // ---- default game camera screenshot (third person, the Blender kid among the procedural city)
  if (SHOTS) {
    await page.evaluate(() => { N.view3d.setCamera({ yaw: (N.player.facing || 0) + 0.6, pitch: 0.22, snap: true }); });
    await shot(page, 'models3d_tps.png');
  }
  await checkErrors(page, errors);
  const perf = await page.evaluate(() => ({ s: N.view3d.stats(), m: N.models3d.stats() }));
  report.push('3D frame with models: ' + perf.s.calls + ' calls, ' + perf.s.triangles + ' tris, JS ' + perf.s.jsAvg + ' ms avg; instances ' + perf.m.instances + ', routed vehicles ' + perf.m.routedVehicles);
  await context.close();
}

/* ---------------------------------------------------------------- Charminar proto */
async function proto(browser) {
  cur = 'proto';
  console.log('\n== Charminar proto (N.models3d.useProto)');
  const { context, page, errors } = await openPage(browser);
  await to3D(page, 'tps');
  const st = await waitModels(page);
  check(st.state === 'ready', 'models ready');
  const has = await page.evaluate(() => N.models3d.has('charminar_proto'));
  if (!has) { fail('charminar_proto is not in the pack'); await context.close(); return; }
  const lmNames = () => page.evaluate(() => N.view3d.engine.lmGroup.children.map((c) => c.name).filter((n) => /charminar/.test(n)));
  await page.evaluate(() => { N.debug.teleport('charminar_plaza'); N.debug.setTime(10, 30); N.view3d.settle(30000); });
  await frames(page, 3);
  const procBefore = await lmNames();
  check(procBefore.some((n) => /^lm3d:charminar$/.test(n)), 'procedural Charminar by default (' + procBefore.join(', ') + ')');
  await page.evaluate(() => { N.models3d.useProto = true; });
  await page.waitForFunction(() => N.models3d.loaded('charminar_proto'), null, { timeout: 240000 });
  await page.evaluate(() => N.view3d.settle(30000));
  await frames(page, 4);
  const withProto = await lmNames();
  check(withProto.some((n) => /^m3d-lm:charminar_proto:charminar$/.test(n)) && !withProto.some((n) => /^lm3d:charminar$/.test(n)), 'useProto: charminar_proto replaces the procedural model (' + withProto.join(', ') + ')');
  const geo = await page.evaluate(() => {
    const o = N.view3d.engine.lmGroup.children.find((c) => /^m3d-lm:charminar_proto/.test(c.name));
    const b = new N.view3d.THREE.Box3().setFromObject(o);
    let col = 0, vis = 0, ray = 0;
    o.traverse((m) => { if (!m.isMesh) return; if (m.material && m.material.visible === false) col++; else vis++; if (m.raycast && m.raycast.toString().length < 12) ray++; });
    return { min: b.min.toArray().map((x) => +x.toFixed(1)), max: b.max.toArray().map((x) => +x.toFixed(1)), col, vis, ray };
  });
  const lm = await page.evaluate(() => { const l = N.world.data.landmarks.find((x) => x.id === 'charminar'); return { x: l.x, y: l.y, w: l.w, d: l.d, h: l.h }; });
  const wx = geo.max[0] - geo.min[0], wz = geo.max[2] - geo.min[2];
  check(Math.abs(wx - lm.w) < lm.w * 0.12 && Math.abs(wz - lm.d) < lm.d * 0.12 && geo.max[1] > lm.h * 1.5 * 0.9, 'footprint fits the map landmark (' + wx.toFixed(1) + ' x ' + wz.toFixed(1) + ' u vs ' + lm.w + ' x ' + lm.d + ', top ' + geo.max[1] + ' u)');
  check(geo.col > 0 && geo.ray === geo.vis, 'camera-ray proxies (' + geo.col + ' COL_ meshes) and no ray casts on ' + geo.vis + ' detailed meshes');
  if (SHOTS) {
    await page.evaluate(() => { const l = N.world.data.landmarks.find((x) => x.id === 'charminar'); N.view3dActors.debug.camera([l.x - 70, 40, l.y + 125], [l.x, 55, l.y], 50); });
    await shot(page, 'models3d_charminar_day.png');
    await page.evaluate(() => { N.debug.setTime(21, 0); });
    await shot(page, 'models3d_charminar_night.png');
    await page.evaluate(() => { N.debug.setTime(10, 30); N.view3dActors.debug.camera(null); N.view3d.setCamera({ yaw: Math.PI / 2 + 0.3, pitch: 0.12, snap: true }); });
    await shot(page, 'models3d_charminar_tps.png');
  }
  await page.evaluate(() => { N.models3d.useProto = false; N.view3d.settle(30000); });
  await frames(page, 4);
  const after = await lmNames();
  check(!after.some((n) => /^m3d-lm:/.test(n)) && after.some((n) => /^lm3d:charminar$/.test(n)), 'useProto off: the procedural Charminar is back (' + after.join(', ') + ')');
  await checkErrors(page, errors);
  await context.close();
}

/* ---------------------------------------------------------------- fallbacks */
async function fallback(browser) {
  cur = 'fallback';
  console.log('\n== fallback: no pack / a corrupt model');
  {
    const { context, page, errors } = await openPage(browser, { routes: [[/assets3d_pack\.js/, (r) => r.abort()]] });
    await to3D(page, 'tps');
    const st = await waitModels(page);
    const r = await page.evaluate(async () => { await new Promise((res) => setTimeout(res, 300)); return { key: N.player.view3d || null, mode: N.view.mode, people: N.view3dActors && N.view3dActors.stats().people }; });
    check(st.state === 'missing' && !r.key && r.mode === 'tps', 'pack missing: models3d ' + st.state + ' (' + st.error + '), the player stays procedural, 3D keeps running');
    await shot(page, 'models3d_fallback.png');
    await checkErrors(page, errors, /assets3d_pack|ERR_FAILED|Failed to load resource/);
    await context.close();
  }
  {
    // a pack whose kid_chinnu GLB is corrupt: the kid is skipped, the cycle still loads, no errors
    const src = fs.readFileSync(path.join(ROOT, 'src/assets3d_pack.js'), 'utf8').replace(/('kid_chinnu': ')Z2xURgIAAAA/, '$1AAAAAAAAAAAA');
    const { context, page, errors } = await openPage(browser, { routes: [[/assets3d_pack\.js/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: src })]] });
    await to3D(page, 'tps');
    const st = await waitModels(page);
    const key = await page.evaluate(() => N.player.view3d || null);
    check(st.state === 'ready' && st.failed.kid_chinnu && st.parsed.indexOf('hero_cycle') >= 0 && !key, 'corrupt kid_chinnu: skipped (' + st.failed.kid_chinnu + '), hero_cycle still loads, the player stays procedural');
    await checkErrors(page, errors);
    await context.close();
  }
}

/* ---------------------------------------------------------------- dist single file */
async function dist(browser) {
  cur = 'dist';
  console.log('\n== dist/nostalgia.html (inline text/plain loader + pack)');
  const f = path.join(ROOT, 'dist', 'nostalgia.html');
  if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8').indexOf('id="assets3d-pack"') < 0) { console.log('  skip: dist/nostalgia.html has no assets3d-pack block (node tools/build.mjs)'); return; }
  const { context, page, errors } = await openPage(browser, { url: DIST });
  const before = await page.evaluate(() => ({ pack: !!N.ASSETS3D, loader: !!(window.THREE && window.THREE.GLTFLoader) }));
  check(!before.pack && !before.loader, 'inline blocks do not execute at boot');
  await to3D(page, 'tps');
  const st = await waitModels(page);
  check(st.state === 'ready' && st.packFrom === 'inline' && st.loaderFrom === 'inline' && st.parsed.indexOf('kid_chinnu') >= 0, 'models load from the inline blocks (' + st.loaderFrom + ', ' + st.packFrom + ', ' + st.parsed.join(',') + ')');
  await checkErrors(page, errors);
  await context.close();
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (want('lazy') || want('routes') || want('clips') || want('gait') || want('cycle') || want('tint')) await main3d(browser);
    if (want('proto')) await proto(browser);
    if (want('fallback')) await fallback(browser);
    if (want('dist')) await dist(browser);
  } catch (e) {
    fail('exception: ' + (e.stack || e.message));
  }
  await browser.close();
  console.log('\n--- report');
  for (const r of report) console.log('  ' + r);
  console.log('\n' + (failures.length ? failures.length + ' FAILURE(S):\n  ' + failures.join('\n  ') : 'ALL PASSED') + '  (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  process.exit(failures.length ? 1 : 0);
})();
