/* NOSTALGIA — tests/view3d_landmarks.cjs (3D landmark models, src/view3d_landmarks.js, ARCHITECTURE §20)
 * Headless Chromium + SwiftShader WebGL; three.js is served from vendor/ by routing the jsDelivr URL.
 *
 *  1. every landmark is visited (teleport + settle): its model must be built by view3d_landmarks.js
 *     (no core fallback), batched small things must belong to a built cell
 *  2. screenshots in third person and first person, by day (11:00 / golden hour) and at night
 *     (21:30) to tests/out/view3d_landmarks/<id>_<mode>_<time>.png: every unique landmark, one
 *     representative per repeated small kind (shops, carts, booths...), plus close-ups of Charminar
 *  3. perf: draw calls / triangles / JS ms at Charminar, RTC X Roads and Koti by night
 *  4. zero console errors / page errors / N.err
 *
 *   node nostalgia/tests/view3d_landmarks.cjs
 *   ONLY=charminar,mecca_masjid (ids or draw ids)  MODES=tps,fps  TIMES=day,night  SHOTS=0  VISIT=0  W=1280 H=720
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'view3d_landmarks');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
fs.mkdirSync(OUT, { recursive: true });

const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const SKIP = (process.env.SKIP || '').split(',').map((s) => s.trim()).filter(Boolean);
const DD = +process.env.DD || 0;
const MODES = (process.env.MODES || 'tps,fps').split(',');
const TIMES = (process.env.TIMES || 'day,night').split(',');
const SHOTS = process.env.SHOTS !== '0';
const VISIT = process.env.VISIT !== '0' && !ONLY.length;
const VW = +process.env.W || 1280, VH = +process.env.H || 720;
const failures = [];
const report = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);

// hand-tuned views (direction the camera looks FROM, as a world angle from the landmark; distance; pitch)
const VIEWS = {
  charminar: [{ name: 'north', from: -Math.PI / 2, dist: 175, fpsDist: 120 }, { name: 'laad_bazaar', at: [3680, 4361], fpsPitch: -0.2 }, { name: 'close', from: -Math.PI / 2 + 0.5, dist: 92, fpsDist: 70, fpsPitch: -0.75 }],
  lb_stadium: [{ name: 'gate', from: Math.PI, dist: 150 }, { name: 'field', at: [3961, 2640], look: [3961, 2470], fpsOnly: true, fpsPitch: -0.05 }],
  birla_mandir: [{ name: 'front', from: Math.PI / 2, dist: 140 }],
  buddha_statue: [{ name: 'bund', at: [4070, 1969], fpsPitch: -0.1 }],
  golconda_bala_hissar: [{ name: 'front', from: Math.PI / 4, dist: 150, fpsPitch: -0.3 }],
  cyber_towers: [{ name: 'front', from: Math.PI / 2, dist: 230 }],
};

async function main() {
  const browser = await chromium.launch({ args: ARGS });
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 60000 });
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
  await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 120000 });
  await page.evaluate((DD) => { N.view3d.setQuality(Object.assign({ adaptive: false, pixelRatio: 1 }, DD ? { drawDist: DD } : {})); if (N.hud && N.hud.hide) N.hud.hide(); }, DD);
  ok('3D view ready');

  // ---------------------------------------------------------------- landmark list + shot plan
  const plan = await page.evaluate((args) => {
    const { ONLY, VIEWS, SKIP } = args;
    const L = N.WORLD_DATA.landmarks;
    const DEFS = N.view3dLandmarks && N.view3dLandmarks.DEFS;
    const small = (lm) => { const d = DEFS && (DEFS.get('#' + lm.id) || DEFS.get(lm.draw)); return !!(d && d.cls); };
    const seen = new Set();
    const out = [];
    for (const lm of L) {
      const sel = (ONLY.length ? (ONLY.includes(lm.id) || ONLY.includes(lm.draw)) : true) && !SKIP.includes(lm.id) && !SKIP.includes(lm.draw);
      if (!sel) continue;
      // repeated small kinds: one representative (the first) unless asked for by id
      if (!ONLY.includes(lm.id) && (small(lm) || ['school', 'temple', 'mosque', 'church', 'cinema', 'mahankali_temple', 'tank_bund_statue', 'qutb_tomb', 'fort_wall', 'water_tank', 'halt_station', 'hospital', 'palace', 'film_studio', 'market_hall', 'rythu_bazaar', 'dargah', 'bus_terminus', 'kaman', 'college', 'coaching_centre', 'idol_workshop', 'numaish_stalls', 'film_hoarding', 'home_house', 'kakatiya_arch', 'fort_gate'].includes(lm.draw))) {
        if (seen.has(lm.draw)) continue;
        seen.add(lm.draw);
      }
      const Ht = (lm.h || 20) * 1.5;
      const views = VIEWS[lm.id] || VIEWS[lm.draw] || [{ name: '' }];
      for (const v of views) {
        const face = { n: -Math.PI / 2, s: Math.PI / 2, e: 0, w: Math.PI }[lm.face] ?? (isFinite(lm.faceAngle) ? lm.faceAngle : Math.PI / 2);
        const from = v.from != null ? v.from : face;
        const size = Math.max(lm.w, lm.d);
        const dist = v.dist || Math.min(330, Math.max(42, size * 0.75 + Ht * 0.9 + 16));
        const fdist = v.fpsDist || Math.min(260, Math.max(30, size * 0.6 + Ht * 0.7 + 10));
        out.push({ id: lm.id, draw: lm.draw, view: v.name || '', x: lm.x, y: lm.y, Ht, at: v.at || null, look: v.look || null, fpsOnly: !!v.fpsOnly,
          tps: [lm.x + Math.cos(from) * dist, lm.y + Math.sin(from) * dist], fps: [lm.x + Math.cos(from) * fdist, lm.y + Math.sin(from) * fdist], fdist, fpsPitch: v.fpsPitch });
      }
    }
    return out;
  }, { ONLY, VIEWS, SKIP });
  console.log('\n== ' + plan.length + ' shot targets (' + MODES.join('/') + ' x ' + TIMES.join('/') + ')');

  // ---------------------------------------------------------------- 1. visit every landmark: model built by view3d_landmarks.js
  if (VISIT) {
    const res = await page.evaluate(() => {
      const L = N.WORLD_DATA.landmarks, E = N.view3d.engine, out = { fallback: [], missing: [], ok: 0, cells: 0 };
      const DEFS = N.view3dLandmarks.DEFS;
      for (const lm of L) {
        if (!DEFS.get('#' + lm.id) && !DEFS.get(lm.draw)) { out.missing.push(lm.id + ':' + lm.draw); continue; }
      }
      // walk the city in a coarse grid of stops so every landmark comes into range once
      const stops = [];
      for (let y = 300; y < 6000; y += 900) for (let x = 300; x < 8000; x += 900) stops.push([x, y]);
      const builtIds = new Set(), fb = new Set();
      const dd = N.view3d.quality.drawDist;
      N.view3d.setQuality({ drawDist: 320 });
      for (const [x, y] of stops) {
        N.player.teleport(x, y); N.view3d.settle(6000);
        for (const o of E.lmGroup.children) {
          if (o.userData.fallback) fb.add(o.name);
          if (/^lm3d:/.test(o.name)) builtIds.add(o.name.slice(5));
          if (o.userData.cell) { out.cells++; for (const m of o.userData.cell.members) builtIds.add(m.id); }
        }
      }
      N.view3d.setQuality({ drawDist: dd });
      for (const lm of L) if (builtIds.has(lm.id)) out.ok++; else if (DEFS.get('#' + lm.id) || DEFS.get(lm.draw)) out.fallback.push(lm.id);
      out.fb = Array.from(fb).slice(0, 20);
      out.total = L.length;
      return out;
    });
    check(res.missing.length === 0, 'every draw id has a 3D model (' + (res.total - res.missing.length) + '/' + res.total + ')', res.missing.slice(0, 20).join(', '));
    check(res.fallback.length === 0 && res.fb.length === 0, 'every landmark was built by view3d_landmarks.js on the city walk (' + res.ok + ' built, ' + res.cells + ' batch cells)', res.fallback.slice(0, 20).join(', ') + ' ' + res.fb.join(', '));
  }

  // ---------------------------------------------------------------- 1b. build cost + triangles of every model (built off-scene)
  if (!ONLY.length || process.env.MEASURE === '1') {
    const m = await page.evaluate(() => N.WORLD_DATA.landmarks.map((l) => N.view3dLandmarks.measure(l.id)).filter(Boolean));
    m.sort((a, b) => b.ms - a.ms);
    const total = m.reduce((a, b) => a + b.ms, 0);
    const big = m.slice().sort((a, b) => b.tris - a.tris).slice(0, 6).map((r) => r.id + ' ' + (r.tris / 1000).toFixed(1) + 'k/' + r.meshes);
    report.push('build cost: ' + m.length + ' models in ' + total.toFixed(0) + ' ms total; slowest ' + m.slice(0, 5).map((r) => r.id + ' ' + r.ms + 'ms').join(', ') + '; most triangles (tris/meshes) ' + big.join(', '));
    check(m[0].ms < 120, 'slowest single model builds in ' + m[0].ms + ' ms (< 120)');
    const maxMeshes = Math.max(...m.filter((r) => !r.batched).map((r) => r.meshes));
    check(maxMeshes <= 6, 'every unbatched model uses <= 6 meshes (max ' + maxMeshes + ')');
  }

  // ---------------------------------------------------------------- 2. screenshots
  let n = 0;
  const T0 = Date.now();
  if (SHOTS) {
    for (const P of plan) {
      for (const time of TIMES) {
        for (const mode of MODES) {
          if (P.fpsOnly && mode !== 'fps') continue;
          const name = P.id + (P.view ? '_' + P.view : '') + '_' + mode + '_' + time;
          const info = await page.evaluate((a) => {
            const { P, mode, time } = a;
            const at = P.at || (mode === 'fps' ? P.fps : P.tps);
            N.player.teleport(at[0], at[1]);
            if (time === 'night') N.debug.setTime(21, 30); else if (time === 'golden') N.debug.setTime(17, 40); else N.debug.setTime(10, 30);
            N.view.set(mode);
            const p = N.player, look = P.look || [P.x, P.y];
            const d = Math.hypot(look[0] - p.x, look[1] - p.y);
            const yaw = Math.atan2(look[1] - p.y, look[0] - p.x);
            let pitch;
            if (mode === 'fps') pitch = P.fpsPitch != null ? P.fpsPitch : -Math.atan2(Math.max(0, P.Ht * 0.48 - 6.3), Math.max(20, d)) * 0.95;
            else pitch = P.Ht > 70 ? -0.12 : 0.02;
            N.view3d.setCamera({ yaw, pitch, snap: true });
            const settled = N.view3d.settle(20000);
            return { settled, d: Math.round(d), x: Math.round(p.x), y: Math.round(p.y) };
          }, { P, mode, time });
          await frames(page, 3);
          await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 240000 });
          const s = await page.evaluate(() => N.view3d.stats());
          n++;
          ok('shot ' + name + ' (d ' + info.d + ', ' + s.calls + ' calls, ' + (s.triangles / 1000).toFixed(0) + 'k tris, settled ' + info.settled + ')');
        }
      }
    }
    report.push(n + ' screenshots in ' + ((Date.now() - T0) / 1000).toFixed(0) + ' s');
  }

  // ---------------------------------------------------------------- 2b. variants: match day, Chand Raat, Prasads open, NTR Gardens
  if (SHOTS && (!ONLY.length || process.env.VARIANTS === '1')) {
    const V = [
      { name: 'lb_stadium_matchday_fps_night', at: [3961, 2640], look: [3961, 2470], mode: 'fps', h: [19, 40], pitch: -0.08, set: () => { N.flags.lb_match = true; } },
      { name: 'lb_stadium_matchday_tps_dusk', at: [3820, 2580], look: [3961, 2580], mode: 'tps', h: [18, 20], pitch: 0.18, set: () => { N.flags.lb_match = true; } },
      { name: 'charminar_chand_raat_tps_night', at: [3900, 4190], look: [3900, 4360], mode: 'tps', h: [22, 0], pitch: -0.12, set: () => { N.flags.chand_raat = true; } },
      { name: 'prasads_open_tps_day', at: [3480, 2010], look: [3480, 1914], mode: 'tps', h: [11, 0], pitch: 0, set: () => { if (N.placesArt) N.placesArt.fx.prasads = 'open'; N.flags.prasads_open = true; } },
      { name: 'prasads_fence_tps_day', at: [3480, 2010], look: [3480, 1914], mode: 'tps', h: [11, 0], pitch: 0, set: () => { if (N.placesArt) N.placesArt.fx.prasads = 'fence'; N.flags.prasads_open = false; } },
      { name: 'ntr_gardens_tps_golden', at: [3672, 2060], look: [3672, 1980], mode: 'tps', h: [17, 40], pitch: 0.1, set: () => {} },
      { name: 'laad_bazaar_fps_night', at: [3690, 4361], look: [3900, 4360], mode: 'fps', h: [21, 0], pitch: -0.12, set: () => {} },
    ];
    for (const v of V) {
      await page.evaluate((a) => {
        const v = a.v;
        N.flags.lb_match = false; N.flags.chand_raat = false;
        // eslint-disable-next-line no-new-func
        (new Function(a.set))();
        N.player.teleport(v.at[0], v.at[1]); N.debug.setTime(v.h[0], v.h[1]); N.view.set(v.mode);
        const p = N.player; N.view3d.setCamera({ yaw: Math.atan2(v.look[1] - p.y, v.look[0] - p.x), pitch: v.pitch, snap: true });
        N.view3d.settle(20000);
      }, { v: { at: v.at, look: v.look, mode: v.mode, h: v.h, pitch: v.pitch }, set: '(' + v.set.toString() + ')()' });
      await frames(page, 4);
      await page.screenshot({ path: path.join(OUT, v.name + '.png'), timeout: 240000 });
      const st2 = await page.evaluate(() => N.view3d.stats());
      ok('variant shot ' + v.name + ' (' + st2.calls + ' calls, ' + (st2.triangles / 1000).toFixed(0) + 'k tris)');
    }
    await page.evaluate(() => { N.flags.lb_match = false; N.flags.chand_raat = false; if (N.placesArt) N.placesArt.fx.prasads = null; });
  }

  // ---------------------------------------------------------------- 3. perf by night in the densest landmark views
  if (!ONLY.length || process.env.PERF === '1') {
    for (const spot of [['charminar', 3900, 4250, -Math.PI / 2 + Math.PI], ['rtc_x_roads', 4900, 2240, -Math.PI / 4], ['koti', 4380, 3240, 0]]) {
      const r = await page.evaluate(async (s) => {
        N.player.teleport(s[1], s[2]); N.debug.setTime(21, 30); N.view.set('tps');
        N.view3d.setCamera({ yaw: s[3], pitch: 0.1, snap: true }); N.view3d.settle(20000);
        const samples = [];
        for (let i = 0; i < 6; i++) { await new Promise((r) => requestAnimationFrame(r)); samples.push(N.view3d.stats()); }
        const avg = (k) => samples.reduce((a, b) => a + b[k], 0) / samples.length;
        const st = samples[samples.length - 1];
        return { calls: Math.round(avg('calls')), tris: Math.round(avg('triangles')), js: +avg('jsMs').toFixed(1), landmarks: st.landmarks, geometries: st.geometries, textures: st.textures, programs: st.programs };
      }, spot);
      report.push('perf night ' + spot[0] + ': ' + r.calls + ' calls, ' + (r.tris / 1000).toFixed(0) + 'k tris, JS ' + r.js + ' ms, ' + r.landmarks + ' landmark records, ' + r.geometries + ' geometries, ' + r.textures + ' textures, ' + r.programs + ' programs');
      check(r.calls <= 360, spot[0] + ' at night: draw calls ' + r.calls + ' <= 360');
    }
  }

  // ---------------------------------------------------------------- 3b. phone (low tier): models + LOD distances, a portrait shot of Charminar
  if (!ONLY.length || process.env.PHONE === '1') {
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p2 = await ctx2.newPage();
    p2.on('console', (m) => { if (m.type() === 'error') errors.push('phone console.error: ' + m.text()); });
    p2.on('pageerror', (e) => errors.push('phone pageerror: ' + (e.stack || e.message)));
    await p2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
    await p2.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
    await p2.goto(URL);
    await p2.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 60000 });
    await p2.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); N.debug.god(true); N.view.noPointerLock = true; if (N.dialogue) N.dialogue.skip = true; const d = document.getElementById('debug'); if (d) d.style.display = 'none'; N.view3d.setQuality({ adaptive: false }); N.view.set('tps'); });
    await p2.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 120000 });
    const r2 = await p2.evaluate(() => {
      N.player.teleport(3900, 4200); N.debug.setTime(21, 0); N.view3d.setCamera({ yaw: Math.PI / 2, pitch: -0.1, snap: true }); N.view3d.settle(20000);
      return { tier: N.view3d.quality.tier, s: N.view3d.stats() };
    });
    await frames(p2, 3);
    if (SHOTS) await p2.screenshot({ path: path.join(OUT, 'phone_charminar_tps_night.png'), timeout: 240000 });
    check(r2.tier === 'low', 'phone uses the low tier (' + r2.tier + '): Charminar by night ' + r2.s.calls + ' calls, ' + (r2.s.triangles / 1000).toFixed(0) + 'k tris');
    report.push('phone (low tier) Charminar night: ' + r2.s.calls + ' calls, ' + (r2.s.triangles / 1000).toFixed(0) + 'k tris, ' + r2.s.landmarks + ' landmark records');
    const e2 = await p2.evaluate(() => N.debug.state().errors);
    for (const e of e2) errors.push('phone N.err: ' + e);
    await ctx2.close();
  }

  // ---------------------------------------------------------------- 4. errors
  const nerr = await page.evaluate(() => N.debug.state().errors);
  const all = errors.concat(nerr.map((e) => 'N.err: ' + e));
  check(all.length === 0, 'no console / page / N.err errors', all.slice(0, 8).join(' | '));
  await browser.close();
  console.log('\n' + report.map((r) => '  * ' + r).join('\n'));
  if (failures.length) { console.log('\nFAILED (' + failures.length + ')\n' + failures.join('\n')); process.exit(1); }
  console.log('\nALL OK');
}
main().catch((e) => { console.error(e); process.exit(1); });
