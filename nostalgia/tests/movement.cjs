/* NOSTALGIA — tests/movement.cjs  (owner request 2026-10-22: natural walking, run only on RUN, a pointer over Chinnu,
 * natural movement for everyone)
 *   walk    real keys on open ground, traffic off: a held arrow WALKS at entities.js TUNE.walk (32 u/s, not the old 45),
 *           never runs by itself; it eases in (90 % of the walk in 0.2-0.6 s) and out (stopped within 0.5 s)
 *   run     Shift + arrow eases up to the run (80 u/s in 0.35-1 s); the walk cycle's runK blends in
 *   pace    the city follows the walk: N.player.paceK() = 32/45, traffic pedestrians and city-life walkers slower than
 *           before, escorts / latehome kids scaled
 *   marker  the pointer: on by default while walking (2D: yellow pixels over his head on the canvas, gone with 'off'),
 *           'In crowds' = only after standing still, over the cycle when riding, a "Pointer over you" Settings row
 *   3d      third person (three.js from vendor/): the 3D pointer sprite is up, and the player's leg cycles stay under
 *           the gait caps (walk <= 2.1/s, run <= 2.8/s) instead of the old ~4-5/s; screenshot
 * Zero console errors / page errors / N.err. Screenshots: tests/out/movement_*.png.
 *   node nostalgia/tests/movement.cjs        ONLY=walk,run,pace,marker,3d
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html');
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
// (no --use-angle=swiftshader here: in some containers it starves requestAnimationFrame and the game never steps;
// headless Chromium's default WebGL is enough for the third-person check. ARGS=1 adds the flags back.)
const ARGS = process.env.ARGS ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [];
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = (s) => !ONLY || ONLY.has(s);
const failures = [];
let passes = 0, phase = '-';
const errors = [];
function check(cond, msg, data) {
  if (cond) { passes++; console.log('  ok   ' + msg); }
  else { const t = '[' + phase + '] ' + msg + (data !== undefined ? '  ' + JSON.stringify(data).slice(0, 600) : ''); failures.push(t); console.log('  FAIL ' + t); }
  return !!cond;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const ev = (fn, a) => page.evaluate(fn, a);
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[' + phase + '] console.error: ' + m.text()); });
  page.on('pageerror', (e) => { errors.push('[' + phase + '] pageerror: ' + (e.stack || e.message)); if (process.env.DBG) console.log('PAGEERROR ' + (e.stack || e.message).slice(0, 600)); });
  page.on('console', (m) => { if (process.env.DBG && m.type() === 'error') console.log('CONSOLE ' + m.text().slice(0, 400)); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
  await page.mouse.click(2, 2);
  // open ground at dawn, nobody about: the speed of the walk is the player's own
  const spot = await ev(() => {
    N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); N.debug.setTime(6, 0);
    if (N.traffic) { N.traffic.enabled = false; N.traffic.clear(); }
    N.testing.unlimitedMoney = false;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    const clear = (x, y) => { for (let gx = -40; gx <= 260; gx += 4) for (let gy = -24; gy <= 24; gy += 4) if (!N.world.isWalkable(x + gx, y + gy)) return false; return true; };
    for (const id of ['necklace_road', 'public_gardens', 'lb_stadium', 'tank_bund']) {
      const q = N.places[id]; if (!q) continue;
      for (let r = 0; r < 400; r += 40) for (let k = 0; k < 12; k++) {
        const x = q.x + Math.cos(k / 12 * 6.283) * r, y = q.y + Math.sin(k / 12 * 6.283) * r;
        if (clear(x, y)) { N.player.teleport(x, y); N.render.snapCamera(); return { id, x: Math.round(x), y: Math.round(y) }; }
      }
    }
    return null;
  });
  check(!!spot, 'open ground to walk on', spot);
  // a speed trace (sim time, speed, running) recorded by the game loop itself
  await ev(() => {
    window.__tr = [];
    N.addSystem({ id: '__speedtrace', order: 99, runIn: ['play'], update() { const p = N.player; window.__tr.push([+N.time.now.toFixed(3), +Math.hypot(p.vx, p.vy).toFixed(2), p.running ? 1 : 0, +(p.anim.runK || 0).toFixed(2)]); if (window.__tr.length > 4000) window.__tr.shift(); } });
  });
  const trace = () => ev(() => window.__tr.splice(0));
  const reach = (tr, v) => { const t0 = tr[0][0]; const i = tr.findIndex((s) => s[1] >= v); return i < 0 ? null : +(tr[i][0] - t0).toFixed(2); };
  const steady = (tr, from) => { const t0 = tr[0][0]; const s = tr.filter((q) => q[0] - t0 >= from); return s.length ? +(s.reduce((a, q) => a + q[1], 0) / s.length).toFixed(1) : 0; };
  const W = await ev(() => N.player.TUNE.walk), RUN = await ev(() => N.player.TUNE.run);

  if (want('walk')) {
    phase = 'walk'; console.log('== walk');
    check(W === 32 && RUN === 80, 'walk 32 u/s (was 45), run 80 u/s', { W, RUN });
    await trace();
    await page.keyboard.down('ArrowRight'); await sleep(2200); await page.keyboard.up('ArrowRight');
    if (process.env.DBG) console.log(JSON.stringify(await ev(() => ({ mode: N.state.mode, n: window.__tr.length, t: N.time.now, frames: N.perf.frames, fps: N.perf.fps, sys: N.systems.list.map((q) => q.id).filter((i) => /speed/.test(i)), x: N.player.x }))));
    const tr = await trace();
    const v = steady(tr, 1.0), t90 = reach(tr, W * 0.9);
    check(Math.abs(v - W) < 2.5, `a held arrow walks at ${v} u/s`, v);
    check(tr.every((s) => !s[2]), 'and never runs by itself');
    check(t90 != null && t90 >= 0.2 && t90 <= 0.6, `eases in: 90 % of the walk after ${t90} s`, t90);
    await sleep(500);
    const tr2 = await trace();
    const stopT = (() => { const t0 = tr2[0][0]; const i = tr2.findIndex((s) => s[1] < 3); return i < 0 ? null : +(tr2[i][0] - t0).toFixed(2); })();
    check(stopT != null && stopT <= 0.5, `eases out: stopped ${stopT} s after letting go`, stopT);
    await page.screenshot({ path: path.join(OUT, 'movement_walk.png') });
  }

  if (want('run')) {
    phase = 'run'; console.log('== run');
    await ev(() => { N.player.energy = 100; N.player.exhausted = false; N.player.teleport(N.player.x - 120, N.player.y); N.render.snapCamera(); });
    await sleep(300); await trace();
    await page.keyboard.down('ArrowRight'); await sleep(700);
    await page.keyboard.down('ShiftLeft'); await sleep(1800);
    await page.keyboard.up('ShiftLeft'); await page.keyboard.up('ArrowRight');
    const tr = await trace();
    const iRun = tr.findIndex((s) => s[2]);
    check(iRun > 0, 'Shift starts the run');
    const runPart = tr.slice(iRun), vr = steady(runPart, 1.0), t90 = reach(runPart, RUN * 0.9);
    check(Math.abs(vr - RUN) < 6, `the run settles at ${vr} u/s`, vr);
    check(t90 != null && t90 >= 0.35 && t90 <= 1.0, `eases up to it: 90 % of the run after ${t90} s`, t90);
    const rk = runPart.filter((s) => s[2]).slice(-5).map((s) => s[3]);
    check(rk.every((k) => k > 0.9), 'the walk cycle blends into the run (runK -> 1)', rk);
  }

  if (want('pace')) {
    phase = 'pace'; console.log('== pace');
    const p = await ev(() => {
      const out = { k: +N.player.paceK().toFixed(3) };
      if (N.traffic) { N.traffic.enabled = true; N.debug.teleport('abids'); N.debug.setTime(11, 0); }
      return out;
    });
    check(Math.abs(p.k - 32 / 45) < 0.001, 'N.player.paceK() = 32/45', p);
    await sleep(5000);
    const c = await ev(() => {
      const peds = (N.traffic && N.traffic.peds || []).filter((q) => q.alive && q.spd);
      const avg = peds.reduce((s, q) => s + q.spd, 0) / Math.max(1, peds.length);
      const lh = N.latehome && N.latehome.TUNE ? { kid: N.latehome.TUNE.kidWalk, time: N.latehome.TUNE.timeLimit } : null;
      return { n: peds.length, avg: +avg.toFixed(1), max: Math.max(0, ...peds.map((q) => q.spd)), lh };
    });
    check(c.n > 5 && c.avg > 20 && c.avg < 34, `street walkers average ${c.avg} u/s (${c.n} of them; before: ~40)`, c);
    check(c.lh && c.lh.kid === 30 && c.lh.time === 281, 'Ghar Pahunchna Hai!: the AI kids walk 30 (was 42), the clock 281 s (was 200)', c.lh);
    await ev(() => { if (N.traffic) { N.traffic.enabled = false; N.traffic.clear(); } N.debug.setTime(6, 0); });
  }

  if (want('marker')) {
    phase = 'marker'; console.log('== marker');
    await ev(() => { const q = N.places.necklace_road; N.player.teleport(q.x, q.y); N.render.snapCamera(); N.marker.setMode('always'); });
    await sleep(400);
    // yellow pixels of the pointer over his head on the game canvas (internal pixels; the pointer is drawn on 'sky')
    const yellow = () => ev(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const R = N.render, p = N.player, c = document.getElementById('game'), g = c.getContext('2d');
      const k = R.k(15), X = Math.round(R.sx(p.x, k)), Y = Math.round(R.sy(p.y, k));
      const d = g.getImageData(X - 12, Y - 24, 24, 28).data;
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 150 && d[i + 2] < 110 && d[i] - d[i + 2] > 120) n++;
      res(n);
    }))));
    await page.keyboard.down('ArrowRight'); await sleep(400);
    const on = await yellow(); const st = await ev(() => N.marker.state());
    await page.keyboard.up('ArrowRight');
    check(st.mode === 'always' && st.alpha > 0.9 && on >= 8, `on by default while walking (alpha ${st.alpha}, ${on} yellow pixels over his head)`, { st, on });
    await page.screenshot({ path: path.join(OUT, 'movement_marker_2d.png') });
    await ev(() => N.marker.setMode('off')); const off = await yellow();
    check(off < on / 3 && (await ev(() => N.marker.alpha())) === 0, `'Off' hides it (${off} yellow pixels)`, { on, off });
    await ev(() => N.marker.setMode('crowds'));
    await page.keyboard.down('ArrowLeft'); await sleep(500);
    const moving = await ev(() => N.marker.alpha()); await page.keyboard.up('ArrowLeft');
    await sleep(3800);
    const still = await ev(() => N.marker.alpha());
    check(moving === 0 && still > 0.8, `'In crowds': hidden while walking on an empty road, back after standing still (${still})`, { moving, still });
    await ev(() => N.marker.setMode('always'));
    const ride = await ev(() => { N.debug.enterVehicle('cycle'); return N.marker.state(); });
    check(ride.alpha > 0.9 && ride.h >= 14, 'over the cycle when he rides', ride);
    await ev(() => { const v = N.player.vehicle; if (v && N.vehicles.exit) N.vehicles.exit(N.player, true); });
    const row = await ev(() => { N.game.pause(); N.menus.openSettings(); return new Promise((r) => setTimeout(() => { const el = document.querySelector('.st-card'); const t = el ? el.innerText : ''; r(/Pointer over you/i.test(t) && /In crowds/i.test(t)); }, 400)); });
    check(row, 'Settings > Screen has "Pointer over you" (Always / In crowds / Off)');
    await page.screenshot({ path: path.join(OUT, 'movement_settings.png') });
    await ev(() => { N.menus.hideAll(); N.state.set('play'); });
  }

  if (want('3d')) {
    phase = '3d'; console.log('== 3d');
    // a small window on the low tier: in a software-GL container the 57 Blender models only parse in the frames' spare time
    await page.setViewportSize({ width: 640, height: 360 });
    // the open patch from the start: clear for 260 u to the east, the way the camera (yaw 0) faces
    await ev((sp) => { N.player.teleport(sp.x, sp.y); N.player.angle = 0; N.view.noPointerLock = true; N.view.set('tps'); setTimeout(() => { try { N.view3d.setQuality({ tier: 'low', pixelRatio: 0.75, drawDist: 300 }); } catch (e) { /* older build */ } }, 500); }, spot);
    // the Blender character pack is ~7 MB of base64 and parses slowly in a software-GL container (characters3d.cjs waits 5 min)
    const ok3 = await page.waitForFunction(() => N.view3d && N.view3d.active && N.models3d && N.models3d.people && N.models3d.people.ready, null, { timeout: 360000, polling: 1000 }).then(() => true, () => false);
    check(ok3, 'third-person 3D view with the Blender people');
    if (ok3) {
      await ev(() => { N.view3d.setCamera({ yaw: 0, pitch: 0.35, snap: true }); return N.view3d.settle(15000); });
      await sleep(1500);
      const sp = await ev(() => N.marker.state());
      check(sp.sprite3d, 'the 3D pointer is up over him', sp);
      // leg cycles per second: the player's Blender model phase while walking, then running
      const cyc = async (keys, ms) => {
        await ev((sp) => { N.player.teleport(sp.x - 30, sp.y); N.player.angle = 0; N.view3d.setCamera({ yaw: 0, pitch: 0.35, snap: true }); }, spot);
        await sleep(400);
        for (const k of keys) await page.keyboard.down(k);
        await sleep(600);
        const r = await ev((ms) => new Promise((res) => {
          const P = N.models3d.people.person(N.player);
          if (!P) { res(null); return; }
          let last = P.phase, acc = 0; const t0 = N.time.now;
          const f = () => { const ph = P.phase; acc += (ph - last + 1) % 1; last = ph; if (N.time.now - t0 >= ms / 1000) res(+(acc / (N.time.now - t0)).toFixed(2)); else requestAnimationFrame(f); };
          requestAnimationFrame(f);
        }), ms);
        for (const k of keys.slice().reverse()) await page.keyboard.up(k);
        return r;
      };
      const walkHz = await cyc(['ArrowUp'], 1500);
      await page.screenshot({ path: path.join(OUT, 'movement_3d_walk.png') });
      await ev(() => { N.player.energy = 100; N.player.exhausted = false; });
      const runHz = await cyc(['ArrowUp', 'ShiftLeft'], 1200);
      const G = await ev(() => N.models3d.people.GAIT.cadence);
      check(walkHz != null && walkHz > 1.2 && walkHz <= G.walk + 0.05, `3D walk: ${walkHz} leg cycles a second (cap ${G.walk}; before ~3-4)`, walkHz);
      check(runHz != null && runHz > 1.8 && runHz <= G.run + 0.05, `3D run: ${runHz} leg cycles a second (cap ${G.run}; before ~5)`, runHz);
      await sleep(300);
      await page.screenshot({ path: path.join(OUT, 'movement_3d.png') });
      await ev(() => N.view.set('top'));
    }
  }

  phase = 'end';
  const nerr = await ev(() => N.debug.state().errors).catch(() => []);
  check(!errors.length && !nerr.length, 'no console / page / N.err errors', errors.concat(nerr).slice(0, 6));
  await browser.close();
  console.log('\n' + passes + ' passed, ' + failures.length + ' failed');
  if (failures.length) { console.log('FAILURES:\n' + failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
