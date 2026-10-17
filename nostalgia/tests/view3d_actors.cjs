/* NOSTALGIA — tests/view3d_actors.cjs (3D actors + parity, ARCHITECTURE §20, src/view3d_actors.js)
 * Headless Chromium with SwiftShader WebGL (software GL: frames take ~0.5-5 s at full size, so the
 * input-driven parts run at a tiny pixel ratio and perf is judged by JS ms + draw calls, not fps).
 * three.js is served from the vendored copy by routing the jsDelivr URL (hermetic, no network).
 *
 *   desktop 1280x720:
 *     every vehicle type of vehicles.js / traffic.js maps to a 3D model that builds; every look kind
 *     resolves to a person spec; crowd + traffic topped up to 40 vehicles + 45 pedestrians: instance
 *     counts, draw calls added by the actors (actors hidden vs shown), actor-pass JS ms, total JS ms;
 *     animation: a walking pedestrian's legs swing, a moving vehicle's wheels spin, riders are seated
 *     (hips bent) with hands on the grips; ride EVERY vehicle type in third person and first person
 *     (the rider is drawn, first person hides the head, cars / bus / lorry swap in their cockpit);
 *     night: head / tail lamps, light pools and glows; a mission goal marker (cylinder of light) at a
 *     test mission + giver markers; pigeons at Charminar; dialogue barks anchored to 3D heads;
 *     collectible glints; Sankranti kites, Ganesh immersion and Christmas season layers;
 *     screenshots (people, vehicles, night traffic, riding tps / fps, cockpits, marker, kites)
 *   gait 720x420 (feedback_3d.md #2, frame sequences in slow motion): scripted walkers / runners
 *     (man, kid, saree, uncle) at constant speeds and the player under real input: soles planted
 *     (no sliding), never sinking, walk grounded vs run with flight, arm swing, run lean + longer
 *     stride; stopping into a stance, idle breathing / looking around; getting on a cycle,
 *     pedalling, getting off; strips of successive frames -> tests/out/view3d_actors_gait_*.png
 *   phone portrait 390x844 (touch, low tier): blob shadows instead of the shadow map, crowd +
 *     traffic, screenshots tps + fps on a Scooty, perf numbers
 * Fails on any console error / page error / N.err.
 *   node nostalgia/tests/view3d_actors.cjs     ONLY=gait|desktop|phone   GAIT=player (skip the scripted walkers)   SHOTS=0 (skip screenshots)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
fs.mkdirSync(OUT, { recursive: true });

const ONLY = process.env.ONLY;
const SHOTS = process.env.SHOTS !== '0';
const failures = [];
const report = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cur = '';
const fail = (msg) => { failures.push('[' + cur + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const loaded = () => os.loadavg()[0] > os.cpus().length * 0.8;

const RIDE = ['cycle', 'ladiescycle', 'hero_cycle', 'hercules_cycle', 'kid_cycle', 'scooty', 'luna', 'chetak', 'rx100', 'auto', 'ambassador', 'maruti800', 'padmini', 'rickshaw', 'bus', 'lorry', 'boat'];

async function openPage(browser, V) {
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.dpr || 1, hasTouch: !!V.touch, isMobile: !!V.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    N.debug.freezeClock(true);
    N.debug.god(true);
    N.view.noPointerLock = true;
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    N.view3d.setQuality({ adaptive: false });
    N.view.set('tps');
  });
  await page.waitForFunction(() => N.view.mode === 'tps' && N.view3dActors && N.view3dActors.ready, null, { timeout: 240000 });
  // this file tests the procedural actors: models3d.js (Blender GLB pipeline, tested by its own
  // suite) would otherwise take over the on-foot player and parked vehicles when its pack has them
  await page.evaluate(() => { if (N.models3d && N.models3d.options) { N.models3d.options.player = false; N.models3d.options.vehicles = false; } });
  return { context, page, errors };
}
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);
async function lowRes(page, on) {
  await page.evaluate((on) => {
    if (window.__dd == null) window.__dd = N.view3d.quality.drawDist;
    N.view3d.setQuality({ adaptive: false, pixelRatio: on ? 0.2 : Math.min(1, window.devicePixelRatio || 1), drawDist: on ? 450 : window.__dd });
    N.view3d.settle(15000);
  }, on);
  await frames(page, 2);
}
async function shot(page, name) {
  if (!SHOTS) return;
  await frames(page, 3);
  await page.screenshot({ path: path.join(OUT, 'view3d_actors_' + cur + '_' + name + '.png'), timeout: 300000 });
  ok('shot ' + name);
}
async function errorsOk(page, errors) {
  const nerr = await page.evaluate(() => N.debug.state().errors);
  const all = errors.concat(nerr.map((e) => 'N.err: ' + e));
  check(all.length === 0, 'no console / page / N.err errors', all.slice(0, 6).join(' | '));
}

/* ---------------------------------------------------------------- in-page helpers */
const HELPERS = () => {
  window.T3 = {
    clearVehicles() { for (const e of N.entities.all.slice()) if (e.kind === 'vehicle' && e !== N.player.vehicle) N.vehicles.remove(e); },
    exit() { const p = N.player; if (p.vehicle) { try { N.vehicles.exit(p, true); } catch (e) { p.vehicle = null; } } p.hidden = false; },
    road(dx, dy) { const p = N.player; const q = N.world.nearestRoadPoint(p.x + (dx || 0), p.y + (dy || 0)); return q ? { x: q.x, y: q.y, angle: q.angle } : { x: p.x, y: p.y, angle: 0 }; },
    water() {
      const p = N.player;
      for (let r = 20; r < 900; r += 12) for (let a = 0; a < 6.28; a += 0.25) {
        const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (N.world.isWater(x, y) && N.world.isWater(x + 22, y) && N.world.isWater(x - 22, y) && N.world.isWater(x, y + 14) && N.world.isWater(x, y - 14)) return { x, y };
      }
      return null;
    },
    /** top up the crowd and traffic around the player to nv vehicles and np pedestrians (in actor range) */
    populate(nv, np) {
      const p = N.player, R = Math.min(380, N.view3d.quality.actorDist - 40);
      const near = (k) => N.entities.all.filter((e) => e.kind === k && e.alive !== false && Math.hypot(e.x - p.x, e.y - p.y) < R).length;
      const types = ['cycle', 'chetak', 'auto', 'ambassador', 'maruti800', 'rx100', 'luna', 'scooty', 'padmini', 'bus', 'lorry', 'rickshaw', 'hero_cycle', 'hercules_cycle'];
      for (let i = 0, g = 0; near('vehicle') < nv && g < 400; g++) {
        const a = Math.random() * 6.28, d = 40 + Math.random() * (R - 60);
        const q = N.world.nearestRoadPoint(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
        if (!q || Math.hypot(q.x - p.x, q.y - p.y) > R - 10) continue;
        const v = N.traffic && N.traffic.spawnVehicle ? N.traffic.spawnVehicle(types[i++ % types.length], { x: q.x, y: q.y }) : null;
        if (!v) N.vehicles.spawn(types[i % types.length], q.x, q.y, q.angle || 0, { driver: true });
      }
      for (let g = 0; near('ped') < np && g < 400; g++) {
        const a = Math.random() * 6.28, d = 20 + Math.random() * (R - 40);
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        const f = N.world.findFree(x, y, 'walk', 10); if (!f) continue;
        if (N.traffic && N.traffic.spawnPed) N.traffic.spawnPed(null, { x: f.x, y: f.y });
      }
      return { vehicles: near('vehicle'), peds: near('ped'), animals: near('animal'), npcs: near('npc') };
    },
    /* frame-sequence capture: runs right after the main loop renders (registered from inside a frame),
     * samples the tracked actor every rendered frame and pastes crops of the canvas into a strip */
    cap: null,
    capInit() {
      if (T3.cap) return;
      const C = T3.cap = { on: false, frames: [], strip: null, lastF: -1 };
      const canvas = () => N.view3d.H.renderer.domElement;
      function cap() {
        requestAnimationFrame(cap);
        if (!C.on) return;
        const A = N.view3dActors.debug, r = A.DBG.rec;
        if (!r || r.frame === C.lastF) return;
        C.lastF = r.frame;
        const rd = r.riders && r.riders[0];
        const smp = r.kind === 'person'
          ? { kind: 'person', x: r.x, y: r.y, h: r.h, J: r.J, cyc: r.cyc, f: r.f, X: r.X, beta: r.beta, v: r.v, run: r.run, gw: r.gw, seated: r.seated, feet: A.feet(r), t: N.time.now }
          : { kind: r.kind, crank: r.crank, spin: r.spin, J: rd ? rd.J : null, seated: rd ? rd.seated : null, t: N.time.now };
        C.frames.push(smp);
        const key = C.key === 'cyc' ? smp.cyc : smp.t;
        if (C.warm > 0) C.warm--; // the follow camera applies from the next frame
        else if (C.strip && C.cells < C.max && key != null && (C.next == null || key >= C.next)) {
          if (C.next == null) C.next = key;
          C.next += C.step;
          const cv = canvas(), g = C.strip.getContext('2d'), cw = C.cw, ch = C.ch;
          g.drawImage(cv, (cv.width - cw) / 2, (cv.height - ch) / 2 + (C.dy || 0), cw, ch, C.cells * cw, 0, cw, ch);
          g.strokeStyle = '#000'; g.strokeRect(C.cells * cw + 0.5, 0.5, cw - 1, ch - 1);
          g.fillStyle = '#fff'; g.font = '11px monospace'; g.fillText(String(C.cells + 1), C.cells * cw + 4, 13);
          C.cells++;
        }
        if (C.follow) { const e = C.follow, o = C.off; A.camera([e.x + o[0], o[1], e.y + o[2]], [e.x, o[3], e.y], C.fov || 40); }
      }
      let started = false;
      N.view3d.registerLayer('test.cap', { order: 2000, update() { if (!started) { started = true; requestAnimationFrame(cap); } } });
    },
    capBegin(o) {
      const C = T3.cap;
      Object.assign(C, { frames: [], lastF: -1, cells: 0, next: null, key: 'cyc', step: 1 / 12, max: 12, cw: 170, ch: 236, dy: 0, follow: null, off: [0, 12, -34, 4.4], fov: 40, warm: 2 }, o || {});
      if (C.follow) { const e = C.follow, q = C.off; N.view3dActors.debug.camera([e.x + q[0], q[1], e.y + q[2]], [e.x, q[3], e.y], C.fov); }
      if (!(o && o.strip === false)) { C.strip = document.createElement('canvas'); C.strip.width = C.cw * C.max; C.strip.height = C.ch; } else C.strip = null;
      C.on = true;
    },
    capEnd() {
      const C = T3.cap; C.on = false;
      const strip = C.strip && C.cells ? C.strip.toDataURL('image/png') : null; C.strip = null;
      if (C.follow) N.view3dActors.debug.camera(null);
      return { strip, frames: C.frames, cells: C.cells };
    },
    raf(n) { return new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }); },
    /** slow motion so that every rendered frame advances the simulation by about simPerFrame s,
     *  whatever the real frame rate (software GL under load: ~0.1 s, a GPU: ~0.016 s) */
    async slowmo(simPerFrame) {
      N.time.scale = 1;
      const t0 = performance.now(); await T3.raf(4);
      const dt = Math.min(0.1, Math.max(0.004, (performance.now() - t0) / 4000));
      N.time.scale = Math.max(0.01, Math.min(1, simPerFrame / dt));
      return N.time.scale;
    },
    /** contact + sliding over sampled person frames: a sole point (heel / toe) within 0.08 u of the
     *  ground in two successive frames must not move; ratio = its travel / the body's travel */
    gaitStats(F) {
      let slip = 0, travel = 0, pairs = 0, minLow = 9, maxLow = -9, hover = 0, air = 0, n = 0;
      for (let i = 1; i < F.length; i++) {
        const a = F[i - 1], c = F[i];
        if (!a.feet || !c.feet) continue;
        n++;
        const d = Math.hypot(c.x - a.x, c.y - a.y);
        const low = Math.min(c.feet[0].low, c.feet[1].low) - c.h;
        minLow = Math.min(minLow, low); maxLow = Math.max(maxLow, low);
        if (low > 0.6) hover++;
        if (low > 0.25) air++;
        for (let s = 0; s < 2; s++) {
          let best = null;
          for (const pt of ['heel', 'toe']) {
            const p0 = a.feet[s][pt], p1 = c.feet[s][pt];
            if (p0.h - a.h < 0.08 && p1.h - c.h < 0.08) { const m = Math.hypot(p1.x - p0.x, p1.y - p0.y); best = best == null ? m : Math.min(best, m); }
          }
          if (best != null) { slip += best; travel += d; pairs++; }
        }
      }
      const L = F[F.length - 1] || {};
      return { n, pairs, slip: +slip.toFixed(3), travel: +travel.toFixed(2), ratio: travel > 0 ? +(slip / travel).toFixed(3) : null, minLow: +minLow.toFixed(3), maxLow: +maxLow.toFixed(3), hover, air,
        f: L.f && +L.f.toFixed(2), stride: L.X && L.beta ? +(2 * L.X / L.beta).toFixed(1) : null, v: L.v && +L.v.toFixed(1), run: L.run };
    },
  };
};
const saveStrip = (name, data) => { if (!data) return; fs.writeFileSync(path.join(OUT, 'view3d_actors_gait_' + name + '.png'), Buffer.from(data.split(',')[1], 'base64')); ok('strip ' + name); };

/* ---------------------------------------------------------------- gait (frame sequences) */
// Binding feedback (design/feedback_3d.md #2): planted feet, walk + distinct run whose stride matches
// the speed (no sliding), arm swing, lean, idle breathing / looking around, smooth turning, riding
// poses with pedalling, getting on / off — verified on frame sequences: every rendered frame is
// sampled (sole positions from the same joint maths as the vertex shader) in slow motion
// (N.time.scale), and strips of successive frames are saved as tests/out/view3d_actors_gait_*.png.
async function gait(browser) {
  cur = 'gait';
  console.log('\n== gait: frame sequences (640x360)');
  const { context, page, errors } = await openPage(browser, { viewport: { width: 640, height: 360 } });
  await page.evaluate(HELPERS);
  await page.evaluate(() => {
    if (N.traffic) { N.traffic.enabled = false; N.traffic.clear(); }
    N.view3d.setQuality({ adaptive: false, drawDist: 240 });
    N.debug.teleport('fateh_maidan'); N.debug.setTime(11, 0);
    N.view3d.settle(20000);
    document.getElementById('ui').style.display = 'none';
    window.__base = { x: N.player.x, y: N.player.y };
    T3.capInit();
  });
  await frames(page, 3);
  // ---- scripted walkers / runners at constant speed, side view
  const CASES = process.env.GAIT === 'player' ? [] : [['man', 45], ['man', 80], ['kid', 45], ['kid', 80], ['saree', 34], ['uncle', 22]];
  const res = {};
  for (const [kind, sp] of CASES) {
    const r = await page.evaluate(async ({ kind, sp }) => {
      for (const e of N.entities.all.slice()) if (e.__gt) N.entities.remove(e);
      const b = window.__base;
      N.player.hidden = true;
      const look = kind === 'kid' ? N.npcs.look('chinnu') : N.people.randomLook(N.util.rng(kind === 'saree' ? 5 : 3), kind);
      const e = new N.Actor({ kind: 'ped', x: b.x - 70, y: b.y, r: 0.01 });
      N.player.x = b.x; N.player.y = b.y - 160; // keep the (hidden) player off the path: no entity pushes
      e.__gt = true; e.look = look; e.angle = 0; e.vx = 0; e.vy = 0; e.anim = { phase: 0, speed: 1, run: sp > 62 };
      e.update = function (dt) { this.x += this.vx * dt; };
      N.entities.add(e);
      N.view3dActors.debug.track(e);
      N.time.scale = 1; e.vx = sp;
      T3.capBegin({ strip: false, follow: e });
      await T3.raf(10);
      T3.capEnd();
      await T3.slowmo(0.018); // slow motion: successive rendered frames sample the cycle finely
      T3.capBegin({ follow: e });
      for (let i = 0; i < 500 && T3.cap.cells < T3.cap.max && (i < 40 || T3.cap.frames.length); i++) await T3.raf(2);
      const out = T3.capEnd();
      N.time.scale = 1; e.vx = 0;
      const st = T3.gaitStats(out.frames);
      const arm = out.frames.map((q) => q.J[4]), lean = out.frames.map((q) => q.J[10]);
      st.arm = +(Math.max(...arm) - Math.min(...arm)).toFixed(2); st.lean = +(lean.reduce((s, x) => s + x, 0) / lean.length).toFixed(3);
      N.view3dActors.debug.track(null); N.entities.remove(e);
      return { st, strip: out.strip };
    }, { kind, sp });
    const tag = kind + sp, st = r.st;
    res[tag] = st;
    saveStrip(tag, r.strip);
    const run = sp > 62;
    check(st.n >= 12 && st.pairs >= 6, tag + ': ' + st.n + ' frames sampled, ' + st.pairs + ' foot-contact pairs');
    check(st.ratio != null && st.ratio < 0.08, tag + ': planted feet — a grounded sole moves ' + st.slip + ' u while the body moves ' + st.travel + ' u (sliding ' + ((st.ratio || 0) * 100).toFixed(1) + '% < 8%)');
    check(st.minLow > -0.15, tag + ': soles never sink below the ground (lowest ' + st.minLow + ' u)');
    if (!run) check(st.hover === 0, tag + ': walking never leaves both feet off the ground by > 0.6 u (highest lowest-sole ' + st.maxLow + ' u)');
    else check(st.air > 0 && st.maxLow < 2.6, tag + ': running has flight phases (' + st.air + ' frames airborne, up to ' + st.maxLow + ' u)');
    check(st.arm > (run ? 0.8 : 0.4), tag + ': arms swing against the legs (range ' + st.arm + ' rad)');
    report.push('gait ' + tag + ': cadence ' + st.f + ' cycles/s, stride ' + st.stride + ' template u, sliding ' + ((st.ratio || 0) * 100).toFixed(1) + '%, lean ' + st.lean + ' rad, ' + st.air + '/' + st.n + ' frames airborne');
  }
  if (CASES.length) check(res.man80.stride > res.man45.stride * 1.3 && res.man80.lean > res.man45.lean + 0.08, 'run is distinct from walk: longer stride (' + res.man80.stride + ' vs ' + res.man45.stride + '), forward lean (' + res.man80.lean + ' vs ' + res.man45.lean + ')');

  // ---- the player: walk, run, stop (real input, the game's tps camera and a side view)
  const pl = await page.evaluate(async () => {
    const p = N.player, out = {};
    // models3d.js (Blender pipeline) may route the on-foot player to its GLB character; this test
    // checks the procedural renderer (always used for NPCs and whenever the player rides / sits)
    if (N.models3d && N.models3d.options) { window.__m3dPlayer = N.models3d.options.player; N.models3d.options.player = false; }
    await T3.raf(3);
    p.hidden = false;
    N.debug.teleport('fateh_maidan');
    N.view.set('tps'); N.view3d.setCamera({ yaw: 0, pitch: 0.2, snap: true });
    N.view3dActors.debug.track(p);
    for (const [name, run] of [['walk', false], ['run', true]]) {
      N.time.scale = 1;
      N.input.hold('up', true); if (run) N.input.hold('run', true);
      await T3.raf(12);
      await T3.slowmo(0.018);
      T3.capBegin({ dy: 30, max: 8 }); // the game's own tps camera (from behind)
      for (let i = 0; i < 400 && T3.cap.cells < 8 && (i < 40 || T3.cap.frames.length); i++) await T3.raf(2);
      T3.cap.max = T3.cap.cells; const a = T3.capEnd();
      const sp = Math.hypot(p.vx || 0, p.vy || 0) || 1, side = [-(p.vy || 0) / sp * 30, 6, (p.vx || 0) / sp * 30, 4.0];
      window.__side = side;
      T3.capBegin({ follow: p, off: side }); // side view
      for (let i = 0; i < 500 && T3.cap.cells < T3.cap.max && (i < 40 || T3.cap.frames.length); i++) await T3.raf(2);
      const b = T3.capEnd();
      out[name] = { st: T3.gaitStats(b.frames), tps: a.strip, side: b.strip, speed: Math.hypot(p.vx || 0, p.vy || 0) };
      N.time.scale = 1;
    }
    // stop: blend to a relaxed stance with both feet down
    N.input.hold('run', false); N.input.hold('up', false);
    await T3.slowmo(0.04);
    T3.capBegin({ key: 't', step: 0.05, max: 10, follow: p, off: window.__side });
    for (let i = 0; i < 400 && T3.cap.cells < T3.cap.max && (i < 40 || T3.cap.frames.length); i++) await T3.raf(2);
    const s = T3.capEnd();
    const last = s.frames[s.frames.length - 1];
    out.stop = last ? { strip: s.strip, gw: last.gw, feet: last.feet.map((f) => +(f.low - last.h).toFixed(3)) } : { strip: null, gw: 1, feet: [9, 9] };
    // idle: breathing + looking around over a few seconds
    N.time.scale = 1;
    T3.capBegin({ strip: false, key: 't' });
    const t0 = N.time.now; for (let i = 0; i < 300 && N.time.now - t0 < 3; i++) await T3.raf(2);
    const id = T3.capEnd().frames;
    const rng = (k) => { const v = id.map((q) => q.J[k]); return v.length ? +(Math.max(...v) - Math.min(...v)).toFixed(3) : 0; };
    out.idle = { breathe: rng(14), headYaw: rng(12), drift: id.length ? +Math.hypot(id[id.length - 1].x - id[0].x, id[id.length - 1].y - id[0].y).toFixed(2) : 9, n: id.length };
    N.time.scale = 1;
    return out;
  });
  for (const k of ['walk', 'run']) {
    const q = pl[k];
    saveStrip('player_' + k + '_tps', q.tps); saveStrip('player_' + k + '_side', q.side);
    check(q.st.ratio != null && q.st.ratio < 0.08 && q.st.minLow > -0.15, 'player ' + k + ' at ' + q.speed.toFixed(0) + ' u/s: feet planted (sliding ' + ((q.st.ratio || 0) * 100).toFixed(1) + '%, lowest sole ' + q.st.minLow + ' u)', JSON.stringify(q.st));
    report.push('player ' + k + ' (' + q.speed.toFixed(0) + ' u/s): cadence ' + q.st.f + ' cycles/s, stride ' + q.st.stride + ' u, sliding ' + ((q.st.ratio || 0) * 100).toFixed(1) + '%');
  }
  check(pl.run.st.air > 0 && pl.walk.st.hover === 0, 'player: walking stays grounded, running shows flight frames');
  saveStrip('player_stop', pl.stop.strip);
  check(pl.stop.gw < 0.1 && pl.stop.feet.every((h) => Math.abs(h) < 0.12), 'player stops into a stance with both feet on the ground (' + pl.stop.feet.join(', ') + ' u)');
  check(pl.idle.breathe > 0.02 && pl.idle.headYaw > 0.05 && pl.idle.drift < 0.01, 'idle: breathing (' + pl.idle.breathe + ') and looking around (head yaw range ' + pl.idle.headYaw + ' rad) while standing still');

  // ---- getting on, pedalling, getting off
  const ride = await page.evaluate(async () => {
    const p = N.player, out = {};
    const v = N.vehicles.spawn('hero_cycle', p.x + 6, p.y, 0, {});
    if (!v) return { skip: 'no spawn' };
    N.view3dActors.debug.track(v);
    await T3.slowmo(0.04);
    T3.capBegin({ key: 't', step: 0.05, max: 9, follow: v, off: [0, 7, -28, 4.5] });
    N.vehicles.enter(p, v);
    for (let i = 0; i < 400 && T3.cap.cells < T3.cap.max && (i < 40 || T3.cap.frames.length); i++) await T3.raf(2);
    const on = T3.capEnd();
    out.on = { strip: on.strip, hips: on.frames.filter((q) => q.J).map((q) => +q.J[0].toFixed(2)) };
    // pedalling
    N.time.scale = 1; N.input.hold('up', true); await T3.raf(16);
    await T3.slowmo(0.025);
    T3.capBegin({ key: 't', step: 0.03, max: 10, follow: v, off: [0, 7, -28, 4.5] });
    for (let i = 0; i < 500 && T3.cap.cells < T3.cap.max && (i < 40 || T3.cap.frames.length); i++) await T3.raf(2);
    const pd = T3.capEnd();
    N.input.hold('up', false); N.time.scale = 1;
    const kn = pd.frames.filter((q) => q.J).map((q) => q.J[2]), cr = pd.frames.map((q) => q.crank || 0);
    out.pedal = { strip: pd.strip, knee: +(Math.max(...kn) - Math.min(...kn)).toFixed(2), crank: +Math.abs(cr[cr.length - 1] - cr[0]).toFixed(2), n: pd.frames.length };
    for (let i = 0; i < 40 && Math.abs(v.speed || 0) > 1; i++) await T3.raf(2);
    // getting off
    N.view3dActors.debug.track(p);
    await T3.slowmo(0.04);
    T3.capBegin({ key: 't', step: 0.05, max: 9, follow: p, off: [0, 7, -28, 4.5] });
    N.vehicles.exit(p);
    for (let i = 0; i < 400 && T3.cap.cells < T3.cap.max && (i < 40 || T3.cap.frames.length); i++) await T3.raf(2);
    const off = T3.capEnd();
    N.time.scale = 1;
    out.off = { strip: off.strip, hips: off.frames.filter((q) => q.J).map((q) => +q.J[0].toFixed(2)), lastLow: off.frames.length ? +(Math.min(off.frames[off.frames.length - 1].feet[0].low, off.frames[off.frames.length - 1].feet[1].low) - off.frames[off.frames.length - 1].h).toFixed(3) : null };
    N.view3dActors.debug.track(null);
    if (N.models3d && N.models3d.options && window.__m3dPlayer != null) N.models3d.options.player = window.__m3dPlayer;
    return out;
  });
  if (ride.skip) fail('ride: ' + ride.skip);
  else {
    saveStrip('mount', ride.on.strip); saveStrip('pedal', ride.pedal.strip); saveStrip('dismount', ride.off.strip);
    const h = ride.on.hips, mid = h.filter((x) => x > 0.35 && x < 1.0).length;
    check(h.length > 4 && h[0] < 0.5 && h[h.length - 1] > 0.9 && mid >= 2, 'getting on: the hips bend from standing to seated over several frames (' + h.slice(0, 14).join(' ') + ')');
    check(ride.pedal.knee > 0.4 && ride.pedal.crank > 1, 'pedalling: knees cycle with the crank (knee range ' + ride.pedal.knee + ' rad, crank ' + ride.pedal.crank + ' rad over ' + ride.pedal.n + ' frames)');
    const o = ride.off.hips, mo = o.filter((x) => x > 0.35 && x < 1.0).length;
    check(o.length > 4 && o[0] > 0.8 && o[o.length - 1] < 0.4 && mo >= 2 && Math.abs(ride.off.lastLow) < 0.12, 'getting off: from seated to standing over several frames, feet back on the ground (' + o.slice(0, 14).join(' ') + '; sole ' + ride.off.lastLow + ')');
  }
  await errorsOk(page, errors);
  await context.close();
}

/* ---------------------------------------------------------------- desktop */
async function desktop(browser) {
  cur = 'desktop';
  console.log('\n== desktop 1280x720');
  const { context, page, errors } = await openPage(browser, { viewport: { width: 1280, height: 720 } });
  await page.evaluate(HELPERS);
  await lowRes(page, true);

  // ---- every vehicle type has a model; every look kind resolves
  const mdl = await page.evaluate(() => {
    const A = N.view3dActors, out = { missing: [], built: {}, bad: [] };
    for (const id in N.vehicles.TYPES) {
      const k = A.modelKeyFor(N.vehicles.TYPES[id]);
      const md = A.model(k);
      if (!md || !(md.verts > 40)) out.bad.push(id + '->' + k); else out.built[id] = k + ':' + md.verts;
    }
    const kinds = ['kid', 'student', 'man', 'uncle', 'lungi', 'aunty', 'saree', 'woman', 'burqa', 'police'];
    out.looks = kinds.map((k) => { const s = A.lookSpec(N.people.randomLook(N.util.rng(3), k), 1); return k + ':' + (s.f[0] + s.f[1] + s.f[2] + s.f[3] > 0 ? 'ok' : 'empty'); });
    out.cast = (N.npcs && N.npcs.ids ? N.npcs.ids() : []).filter((id) => { try { const L = N.npcs.look(id); return L && A.lookSpec(L, 1).f[0] > 0; } catch (e) { return false; } }).length;
    out.verts = A.stats().personVerts;
    return out;
  });
  check(mdl.bad.length === 0 && Object.keys(mdl.built).length >= 25, Object.keys(mdl.built).length + ' vehicle types map to built 3D models', mdl.bad.join(', '));
  check(mdl.looks.every((s) => /ok$/.test(s)), 'every look kind resolves to a person spec (' + mdl.looks.join(' ') + '); ' + mdl.cast + ' cast looks');
  report.push('person template: ' + (mdl.verts || []).join(' / ') + ' vertices (near / far LOD); vehicle models: ' + Object.values(mdl.built).filter((v, i, a) => a.indexOf(v) === i).join(', '));

  // ---- crowd + traffic: 40 vehicles + 45 pedestrians, perf
  const pop = await page.evaluate(() => {
    N.debug.teleport('abids'); N.debug.setTime(17, 30);
    if (N.traffic) { N.traffic.enabled = true; if (N.traffic.setDensity) N.traffic.setDensity(2); if (N.traffic.fill) N.traffic.fill(); }
    N.view3d.settle(15000);
    return T3.populate(40, 45);
  });
  for (let i = 0; i < 6; i++) await frames(page, 3);
  const pop2 = await page.evaluate(() => T3.populate(40, 45));
  check(pop2.vehicles >= 40 && pop2.peds >= 45, 'crowd + traffic in range: ' + pop2.vehicles + ' vehicles, ' + pop2.peds + ' pedestrians, ' + pop2.animals + ' animals, ' + pop2.npcs + ' npcs', JSON.stringify(pop));
  await lowRes(page, false);
  await page.evaluate(() => { N.view3d.setCamera({ yaw: N.view.yaw, pitch: 0.28, snap: true }); });
  await frames(page, 3);
  const perf = await page.evaluate(async () => {
    const fr = () => new Promise((r) => requestAnimationFrame(() => r()));
    const A = N.view3dActors, rows = [];
    for (let i = 0; i < 8; i++) { await fr(); const s = N.view3d.stats(), a = A.stats(); rows.push([s.calls, s.jsMs, a.ms, a.people + a.peopleFar, a.vehicles, a.wheels, s.renderMs, s.triangles]); }
    A.setOptions({ hidden: true }); await fr(); await fr();
    const off = []; for (let i = 0; i < 3; i++) { await fr(); off.push(N.view3d.stats().calls); }
    A.setOptions({ hidden: false }); await fr();
    const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length, max = (k) => Math.max(...rows.map((r) => r[k]));
    return { calls: avg(0), callsMax: max(0), js: avg(1), actorMs: avg(2), actorMsMax: max(2), people: avg(3), veh: avg(4), wheels: avg(5), render: avg(6), tris: avg(7), callsOff: Math.min(...off), counts: A.debug.counts(), st: A.stats(), core: N.view3d.stats() };
  });
  const actorCalls = perf.calls - perf.callsOff;
  report.push('desktop crowd + traffic (' + pop2.vehicles + ' vehicles, ' + pop2.peds + ' peds in range; ' + perf.people.toFixed(0) + ' people / ' + perf.veh.toFixed(0) + ' vehicles / ' + perf.wheels.toFixed(0) + ' wheels drawn after culling): ' + perf.calls.toFixed(0) + ' draw calls total (max ' + perf.callsMax + '), ' + actorCalls.toFixed(0) + ' added by the actors (instanced pools incl. shadow pass), actor pass ' + perf.actorMs.toFixed(2) + ' ms JS avg (max ' + perf.actorMsMax.toFixed(2) + '), whole 3D frame ' + perf.js.toFixed(1) + ' ms JS (renderer.render ' + perf.render.toFixed(1) + ' ms on SwiftShader), ' + (perf.tris / 1000).toFixed(0) + 'k triangles');
  check(actorCalls <= 70, 'actors add <= 70 draw calls for 40 vehicles + 45 pedestrians (' + actorCalls.toFixed(0) + ')', JSON.stringify(perf.counts));
  check(perf.people >= 10 && perf.veh >= 8, 'people and vehicles are drawn (' + perf.people.toFixed(0) + ' / ' + perf.veh.toFixed(0) + ')');
  if (!loaded()) check(perf.actorMs <= 4, 'actor pass JS ' + perf.actorMs.toFixed(2) + ' ms/frame (<= 4 ms)');
  else ok('actor pass JS ' + perf.actorMs.toFixed(2) + ' ms/frame — not judged: machine load ' + os.loadavg()[0].toFixed(1));
  await shot(page, 'crowd_traffic');

  // ---- animation: a walking pedestrian swings its legs; a moving vehicle spins its wheels; riders sit
  await lowRes(page, true);
  const anim = await page.evaluate(async () => {
    const fr = () => new Promise((r) => requestAnimationFrame(() => r()));
    const A = N.view3dActors, p = N.player, out = {};
    const ped = N.entities.all.filter((e) => e.kind === 'ped' && e !== p && !e.down && Math.hypot(e.vx || 0, e.vy || 0) > 15).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (ped) { A.debug.track(ped); const hips = []; for (let i = 0; i < 6; i++) { await fr(); const r = A.debug.rec; if (r) hips.push(r.J[0]); } out.hips = hips; }
    const veh = N.entities.all.filter((e) => e.kind === 'vehicle' && e.driver && Math.abs(e.speed || 0) > 10 && e.T && e.T.cls === 'bike').sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
      || N.entities.all.filter((e) => e.kind === 'vehicle' && e.driver && Math.abs(e.speed || 0) > 10)[0];
    if (veh) { A.debug.track(veh); const spins = []; let rider = null; for (let i = 0; i < 6; i++) { await fr(); const r = A.debug.rec; if (r) { spins.push(r.spin); if (r.riders && r.riders[0]) rider = r.riders[0]; } } out.spins = spins; out.vtype = veh.type; out.rider = rider; }
    A.debug.track(null);
    return out;
  });
  const hr = anim.hips ? Math.max(...anim.hips) - Math.min(...anim.hips) : 0;
  check(hr > 0.05, 'walking pedestrian: leg swing changes frame to frame (hip range ' + hr.toFixed(2) + ' rad)', JSON.stringify(anim.hips));
  const sr = anim.spins ? Math.abs(anim.spins[anim.spins.length - 1] - anim.spins[0]) : 0;
  check(sr > 0.05, 'moving ' + anim.vtype + ': wheels spin (' + sr.toFixed(2) + ' rad over 6 frames)');
  if (anim.rider) check(anim.rider.J[0] > 0.6 && anim.rider.seated, 'its rider sits (hip ' + anim.rider.J[0].toFixed(2) + ' rad, pose ' + anim.rider.pose + ')');

  // ---- ride every vehicle type in third and first person
  await page.evaluate(() => { if (N.traffic) { N.traffic.enabled = false; N.traffic.clear(); } T3.clearVehicles(); N.debug.teleport('fateh_maidan'); N.debug.setTime(11, 0); N.view3d.settle(10000); });
  const rides = [];
  for (const t of RIDE) {
    const r = await page.evaluate(async (t) => {
      const fr = () => new Promise((r) => requestAnimationFrame(() => r()));
      const A = N.view3dActors, p = N.player;
      T3.exit(); T3.clearVehicles();
      if (t === 'boat') { N.debug.teleport('tank_bund'); const w = T3.water(); if (!w) return { t, skip: 'no water' }; p.x = w.x; p.y = w.y; }
      else N.debug.teleport('fateh_maidan');
      const T = N.vehicles.TYPES[t];
      const v = N.vehicles.spawn(t, p.x, p.y, -Math.PI / 2, {});
      if (!v) return { t, skip: 'no spawn' };
      N.vehicles.enter(p, v);
      if (p.vehicle !== v) return { t, skip: 'enter refused' };
      A.debug.track(v);
      N.view.set('tps');
      await fr(); await fr();
      const tps = A.debug.rec;
      N.input.hold('up', true);
      for (let i = 0; i < 20; i++) await fr();
      const moved = A.debug.rec;
      N.input.hold('up', false);
      N.view.set('fps');
      await fr(); await fr(); await fr();
      const fps = A.debug.rec;
      N.view.set('tps');
      A.debug.track(null);
      return { t, model: tps && tps.model, riders: tps && tps.riders ? tps.riders.length : 0, riderPose: tps && tps.riders && tps.riders[0] ? tps.riders[0].pose : null,
        spin: moved && tps ? Math.abs(moved.spin - tps.spin) : 0, speed: Math.abs(v.speed || 0), cockpit: fps && fps.cockpit, fpsHide: !!(fps && fps.riders && fps.riders.some((q) => q.fpsHide)), show: A.model(fps ? fps.model : 'cycle').show, cls: T.cls };
    }, t);
    rides.push(r);
  }
  for (const r of rides) {
    if (r.skip) { fail('ride ' + r.t + ': ' + r.skip); continue; }
    const heavyOrCar = r.cls === 'car' && r.t !== 'rickshaw' || r.cls === 'heavy';
    const okRider = heavyOrCar ? r.cockpit && r.fpsHide : r.riders >= 1 && r.fpsHide;
    check(r.model && okRider && (r.spin > 0.05 || r.cls === 'boat'), 'ride ' + r.t + ' (' + r.model + '): tps rider ' + (r.riders ? r.riderPose : 'hidden in a closed cabin') + ', moving (wheel spin ' + r.spin.toFixed(2) + '), fps ' + (r.cockpit ? 'cockpit interior + hands on the wheel' : 'head hidden, own hands on the grips'), JSON.stringify(r));
  }

  // ---- screenshots: models, people, riding views
  if (SHOTS) {
    await lowRes(page, false);
    await page.evaluate(() => {
      T3.exit(); T3.clearVehicles(); N.debug.teleport('fateh_maidan'); N.debug.setTime(10, 30); N.view3d.settle(15000);
      const p = N.player, b = { x: p.x, y: p.y };
      window.__b = b;
      const looks = ['kid', 'student', 'man', 'uncle', 'aunty', 'saree', 'woman', 'burqa', 'police'].map((k, i) => { const L = N.people.randomLook(N.util.rng(i * 7 + 2), k); if (i === 1) L.girl = true; return L; });
      for (const id of ['chinnu', 'immu', 'amma', 'pochaiah', 'kite_chacha']) if (N.npcs && N.npcs.look) looks.push(N.npcs.look(id));
      window.__peds = looks.map((L, i) => { const e = new N.Actor({ kind: 'ped', x: b.x - 36 + (i % 7) * 12, y: b.y + 10 + Math.floor(i / 7) * 14, r: 3.4 }); e.look = L; e.anim = { phase: i, speed: i % 3 === 1 ? 1 : 0, run: false }; e.angle = -Math.PI / 2; e.update = function (dt) { this.anim.phase += dt * 6 * this.anim.speed; }; N.entities.add(e); return e; });
      p.hidden = true;
      N.view3dActors.debug.camera([b.x, 9.5, b.y - 34], [b.x, 5, b.y + 12], 50);
    });
    await shot(page, 'people');
    await page.evaluate(() => {
      for (const e of window.__peds) N.entities.remove(e);
      const b = window.__b;
      const row = [['chetak', -60], ['scooty', -44], ['rx100', -30], ['hero_cycle', -16], ['auto', 6], ['ambassador', 34], ['rickshaw', -78]];
      for (const [t, dx] of row) N.vehicles.spawn(t, b.x + dx, b.y + 10, -Math.PI / 2 + 0.25, { driver: true, seed: 5 + dx });
      N.vehicles.spawn('bus', b.x - 10, b.y + 60, 0.2, { driver: true }); N.vehicles.spawn('lorry', b.x + 60, b.y + 62, Math.PI - 0.3, { driver: true });
      N.view3dActors.debug.camera([b.x - 18, 16, b.y - 40], [b.x - 12, 4, b.y + 22], 55);
    });
    await shot(page, 'vehicles');
    await page.evaluate(() => { N.view3dActors.debug.camera(null); N.player.hidden = false; T3.clearVehicles(); const v = N.vehicles.spawn('chetak', N.player.x, N.player.y, -Math.PI / 2, {}); N.vehicles.enter(N.player, v); N.view.set('tps'); N.view3d.setCamera({ yaw: -Math.PI / 2 + 0.6, pitch: 0.22, snap: true }); });
    await shot(page, 'ride_chetak_tps');
    await page.evaluate(() => { N.view.set('fps'); N.view3d.setCamera({ pitch: 0.35, snap: true }); });
    await shot(page, 'ride_chetak_fps');
    for (const [t, pitch] of [['hero_cycle', 0.4], ['auto', 0.15], ['ambassador', 0.12], ['bus', 0.15]]) {
      await page.evaluate(([t, pitch]) => { T3.exit(); T3.clearVehicles(); N.debug.teleport('fateh_maidan'); const v = N.vehicles.spawn(t, N.player.x, N.player.y, -Math.PI / 2, {}); N.vehicles.enter(N.player, v); N.view.set('fps'); N.view3d.setCamera({ pitch, snap: true }); }, [t, pitch]);
      await shot(page, 'ride_' + t + '_fps');
    }
    await page.evaluate(() => { N.view.set('tps'); });
  }

  // ---- night: lamps, light pools, glows
  await lowRes(page, !SHOTS);
  const night = await page.evaluate(async () => {
    const fr = () => new Promise((r) => requestAnimationFrame(() => r()));
    T3.exit(); T3.clearVehicles();
    N.debug.teleport('abids'); N.debug.setTime(21, 15);
    if (N.traffic) { N.traffic.enabled = true; N.traffic.fill && N.traffic.fill(); }
    N.view3d.settle(15000);
    T3.populate(24, 20);
    for (let i = 0; i < 6; i++) await fr();
    N.view3d.setCamera({ yaw: N.view.yaw, pitch: 0.2, snap: true });
    await fr(); await fr();
    const c = N.view3dActors.debug.counts();
    const lit = N.entities.all.filter((e) => e.kind === 'vehicle' && e.T && e.T.lights && e.driver).length;
    return { c, lit, night: N.view3d.H.night };
  });
  check(night.night > 0.5 && night.c.glows > 4 && (night.c.lightPools || 0) > 0, 'night: ' + night.lit + ' lit vehicles -> ' + night.c.glows + ' lamp glows, ' + (night.c.lightPools || 0) + ' headlight pools on the road', JSON.stringify(night.c));
  await shot(page, 'night_traffic');

  // ---- mission markers: a goal marker at a test mission, giver markers otherwise
  const mk = await page.evaluate(async () => {
    const fr = () => new Promise((r) => requestAnimationFrame(() => r()));
    if (N.traffic) { N.traffic.enabled = false; N.traffic.clear(); }
    N.debug.teleport('fateh_maidan'); N.debug.setTime(18, 10);
    N.view3d.settle(10000);
    const p = N.player, gx = p.x + 40, gy = p.y - 30;
    N.missions.register({ id: 'TEST_3D_MARKER', title: '3D marker test', kind: 'side', autosave: false, giver: { x: -9999, y: -9999 }, script: async (m) => { m.marker({ x: gx, y: gy }, { r: 18 }); await m.wait(9999); } });
    N.missions.start('TEST_3D_MARKER');
    for (let i = 0; i < 4; i++) await fr();
    N.view3d.setCamera({ yaw: Math.atan2(gy - p.y, gx - p.x), pitch: 0.18, snap: true });
    await fr(); await fr();
    const st = N.view3dActors.stats();
    const g = N.view3dActors.debug.MK.groups.filter((q) => q.visible).map((q) => [Math.round(q.position.x), Math.round(q.position.z)]);
    return { markers: st.markers, groups: g, goal: [Math.round(gx), Math.round(gy)] };
  });
  check(mk.markers >= 1 && mk.groups.some((q) => Math.abs(q[0] - mk.goal[0]) < 3 && Math.abs(q[1] - mk.goal[1]) < 3), 'mission goal marker drawn as a cylinder of light at the objective', JSON.stringify(mk));
  await shot(page, 'mission_marker');
  await page.evaluate(() => { N.missions.abort(); });
  await frames(page, 3);
  const givers = await page.evaluate(() => ({ list: N.missions.markers().length, drawn: N.view3dActors.stats().markers }));
  if (givers.list) check(givers.drawn >= 1, 'mission giver markers drawn when no mission runs (' + givers.drawn + ' of ' + givers.list + ' in range)');

  // ---- pigeons, barks, glints
  await lowRes(page, true);
  const misc = await page.evaluate(async () => {
    const fr = () => new Promise((r) => requestAnimationFrame(() => r()));
    const out = {};
    N.debug.teleport('charminar_plaza'); N.debug.setTime(10, 0); N.view3d.settle(10000);
    for (let i = 0; i < 4; i++) await fr();
    out.birds = N.view3dActors.stats().birds;
    // a bark over a pedestrian's head: re-anchored to the 3D head
    const p = N.player;
    const e = new N.Actor({ kind: 'ped', x: p.x + 12, y: p.y - 30, r: 3.4 }); e.look = N.people.randomLook(N.util.rng(9), 'man'); e.anim = { phase: 0, speed: 0 }; e.update = function () {}; N.entities.add(e);
    N.view3d.setCamera({ yaw: Math.atan2(e.y - p.y, e.x - p.x), pitch: 0.15, snap: true });
    await fr(); await fr();
    N.dialogue.bark(e, 'Arre, kya re!', { secs: 5 });
    await fr(); await fr(); await fr();
    const el = document.querySelector('#barks .bark');
    const head = N.view3d.project(e.x, e.y, 9.4 * N.view3dActors.lookSpec(e.look, e.id).size + 2.4);
    if (el) { const r = el.getBoundingClientRect(); out.bark = { vis: getComputedStyle(el).visibility, bottom: Math.round(r.bottom), cx: Math.round(r.left + r.width / 2), head: [Math.round(head.x), Math.round(head.y)] }; }
    out.tracked = N.view3dActors.stats().bark3d;
    N.entities.remove(e);
    // collectible glints near an item
    const C = N.collectibles;
    const it = C && C.items ? C.items.find((q) => q.series !== 'frames' && !(C.has && C.has(q.id)) && !q.level && isFinite(q.x)) : null;
    if (it) { N.debug.teleport(it.x + 20, it.y); N.view3d.settle(8000); await fr(); await fr(); await fr(); out.glints = N.view3dActors.debug.glints(); out.item = it.id; }
    return out;
  });
  check(misc.birds > 0, 'pigeons at Charminar drawn (' + misc.birds + ' birds)');
  check(misc.bark && misc.bark.vis !== 'hidden' && Math.abs(misc.bark.cx - misc.bark.head[0]) < 60 && misc.bark.bottom < misc.bark.head[1] + 12 && misc.bark.bottom > misc.bark.head[1] - 90, 'dialogue bark anchored over the 3D head', JSON.stringify(misc.bark));
  if (misc.item) check(misc.glints > 0, 'collectible glint drawn near ' + misc.item + ' (' + misc.glints + ')');

  // ---- seasons: Sankranti kites, Ganesh immersion, Christmas stars
  const sea = await page.evaluate(async () => {
    const fr = () => new Promise((r) => requestAnimationFrame(() => r()));
    const S = N.seasons, out = {};
    if (!S || !S.set || !S.scene) return { skip: true };
    S.set('sankranti', true); N.debug.teleport('home'); N.debug.setTime(16, 40); N.view3d.settle(10000);
    for (let i = 0; i < 4; i++) await fr();
    out.kites = N.view3dActors.stats().kites;
    N.view3d.setCamera({ yaw: N.view.yaw, pitch: -0.3, snap: true });
    return out;
  });
  if (!sea.skip) check(sea.kites > 0, 'Sankranti: kites in the sky with strings (' + sea.kites + ')');
  if (!sea.skip && SHOTS) { await lowRes(page, false); await shot(page, 'sankranti_kites'); await lowRes(page, true); }
  const sea2 = await page.evaluate(async () => {
    const fr = () => new Promise((r) => requestAnimationFrame(() => r()));
    const S = N.seasons, out = {};
    if (!S || !S.set) return out;
    S.set('sankranti', false); S.set('ganesh_immersion', true); N.debug.teleport('tank_bund'); N.debug.setTime(19, 30); N.view3d.settle(10000);
    for (let i = 0; i < 6; i++) await fr();
    out.imm = N.view3dActors.debug.counts();
    S.set('ganesh_immersion', false); S.set('christmas', true);
    N.debug.teleport('secunderabad_station'); N.debug.setTime(20, 0); N.view3d.settle(10000);
    for (let i = 0; i < 4; i++) await fr();
    out.xmas = N.view3dActors.debug.counts();
    S.set('christmas', false);
    return out;
  });
  if (sea2.imm) check((sea2.imm['veh:lorry_open'] || 0) + (sea2.imm['veh:idol'] || 0) + (sea2.imm['veh:crane'] || 0) > 0, 'Ganesh immersion: idol lorries / cranes on Tank Bund', JSON.stringify(sea2.imm));
  if (sea2.xmas) check((sea2.xmas['veh:star'] || 0) > 0, 'Christmas: paper stars on Secunderabad houses (' + (sea2.xmas['veh:star'] || 0) + ')');

  await errorsOk(page, errors);
  await context.close();
}

/* ---------------------------------------------------------------- phone */
async function phone(browser) {
  cur = 'portrait';
  console.log('\n== phone portrait 390x844 (touch, low tier)');
  const { context, page, errors } = await openPage(browser, { viewport: { width: 390, height: 844 }, dpr: 2, touch: true });
  await page.evaluate(HELPERS);
  const tier = await page.evaluate(() => ({ tier: N.view3d.quality.tier, shadows: N.view3d.quality.shadows }));
  check(tier.tier === 'low' && !tier.shadows, 'phone runs the low tier without a shadow map', JSON.stringify(tier));
  await lowRes(page, true);
  const pop = await page.evaluate(() => {
    N.debug.teleport('abids'); N.debug.setTime(17, 0);
    if (N.traffic) { N.traffic.enabled = true; N.traffic.fill && N.traffic.fill(); }
    N.view3d.settle(15000);
    return T3.populate(30, 32);
  });
  for (let i = 0; i < 4; i++) await frames(page, 3);
  await lowRes(page, false);
  const perf = await page.evaluate(async () => {
    const fr = () => new Promise((r) => requestAnimationFrame(() => r()));
    const A = N.view3dActors, rows = [];
    for (let i = 0; i < 6; i++) { await fr(); const s = N.view3d.stats(), a = A.stats(); rows.push([s.calls, a.ms, a.people + a.peopleFar, a.vehicles]); }
    A.setOptions({ hidden: true }); await fr(); await fr(); const off = N.view3d.stats().calls; A.setOptions({ hidden: false }); await fr();
    const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
    return { calls: avg(0), ms: avg(1), people: avg(2), veh: avg(3), off, counts: A.debug.counts() };
  });
  check((perf.counts.blobs || 0) > 0, 'blob shadows under actors on the low tier (' + (perf.counts.blobs || 0) + ')');
  report.push('phone portrait crowd + traffic (' + pop.vehicles + ' vehicles, ' + pop.peds + ' peds in range): ' + perf.calls.toFixed(0) + ' draw calls, ' + (perf.calls - perf.off).toFixed(0) + ' added by the actors, actor pass ' + perf.ms.toFixed(2) + ' ms JS, ' + perf.people.toFixed(0) + ' people / ' + perf.veh.toFixed(0) + ' vehicles drawn');
  await page.evaluate(() => N.view3d.setCamera({ yaw: N.view.yaw, pitch: 0.3, snap: true }));
  await shot(page, 'crowd_tps');
  await page.evaluate(() => { if (N.traffic) N.traffic.enabled = false; const p = N.player; const v = N.vehicles.spawn('scooty', p.x, p.y, p.angle || 0, {}); N.vehicles.enter(p, v); N.view.set('fps'); N.view3d.setCamera({ pitch: 0.3, snap: true }); });
  await shot(page, 'scooty_fps');
  await page.evaluate(() => { N.view.set('tps'); N.view3d.setCamera({ pitch: 0.22, snap: true }); });
  await shot(page, 'scooty_tps');
  await errorsOk(page, errors);
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (!ONLY || ONLY === 'gait') await gait(browser);
    if (!ONLY || ONLY === 'desktop') await desktop(browser);
    if (!ONLY || ONLY === 'phone') await phone(browser);
  } catch (e) {
    fail('exception: ' + (e.stack || e.message));
  } finally {
    await browser.close();
  }
  console.log('\n== report');
  for (const r of report) console.log('  ' + r);
  if (failures.length) { console.log('\nFAILED (' + failures.length + ')\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('\nALL OK');
})();
