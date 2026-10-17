/* NOSTALGIA — tests/view3d_landmarks.cjs (3D landmark models, src/view3d_landmarks.js, ARCHITECTURE §20)
 * Headless Chromium + SwiftShader WebGL; three.js is served from vendor/ by routing the jsDelivr URL.
 *
 *  1. every landmark is visited (a coarse walk over the whole map with a short draw distance): each of
 *     the 426 landmarks must be built by view3d_landmarks.js (no core fallback; batched small things
 *     must belong to a built cell); 1b. every model is also built off-scene (build ms, triangles, meshes)
 *  2. screenshots to tests/out/view3d_landmarks/<id>[_view]_<mode>_<time>.png. The viewpoint is
 *     picked around the landmark's front for a clear line of sight (core height grid). Top landmarks
 *     (Charminar x3 views, Mecca Masjid, Char Kaman, Gulzar Houz, Birla Mandir, Buddha, Tank Bund,
 *     LB Stadium, Golconda, Qutb Shahi, Cyber Towers) get tps + fps by day and night; every other named
 *     landmark gets tps by day + fps by night. 2b. variants: LB Stadium match day (crowds, floodlights),
 *     Charminar on Chand Raat, Prasads fence / open, NTR Gardens at golden hour, Laad Bazaar at night.
 *  3. perf by night (Charminar, RTC X Roads, Koti): draw calls, triangles, JS ms; 3b. phone (low tier)
 *  4. zero console errors / page errors / N.err
 *
 *   node nostalgia/tests/view3d_landmarks.cjs
 *   ONLY=charminar,mecca_masjid (ids or draw ids)  ALL=1 (every representative, 4 shots each)
 *   MODES=tps,fps  TIMES=day,night  PAIRS=1 (tps day + fps night only)  SHOTS=0  VISIT=0|1  W=1280 H=720  DD=<draw distance>  SKIP=ids
 *   with ONLY: MEASURE=1 VARIANTS=1 PERF=1 PHONE=1 add those sections
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
const VISIT = process.env.VISIT === '1' || (process.env.VISIT !== '0' && !ONLY.length);
const VW = +process.env.W || 1280, VH = +process.env.H || 720;
const failures = [];
const report = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);

// hand-tuned views (direction the camera looks FROM, as a world angle from the landmark; distance; pitch)
// default screenshot set: TOP = tps + fps by day and night; NAMED = tps by day + fps by night
const TOP = ['charminar', 'mecca_masjid', 'kaman_charminar', 'gulzar_houz', 'birla_mandir', 'buddha_statue', 'tank_bund_statue_1', 'lb_stadium', 'golconda_fateh_darwaza', 'golconda_bala_hissar', 'qutb_tomb_5', 'cyber_towers'];
const NAMED = ['birla_planetarium', 'assembly', 'mozamjahi_market', 'kachiguda_station', 'nampally_station', 'secunderabad_station', 'golconda_wall_2', 'taramati_baradari', 'hitex', 'secunderabad_clock_tower', 'mahboob_chowk_clock_tower', 'begumpet_airport', 'atc_tower', 'aeroplane_1',
  'salar_jung_museum', 'high_court', 'osmania_hospital', 'state_central_library', 'chowmahalla_palace', 'falaknuma_palace', 'prasads_imax', 'ntr_memorial', 'paradise', 'koti_bus_stand', 'imlibun_bus_station', 'cbs_hangar',
  'sandhya_theatre', 'hoarding_rtc_1', 'dilsukhnagar_sai_temple', 'osmania_university', 'church_st_josephs', 'mosque_1', 'temple_1', 'lal_darwaza_temple', 'jama_masjid_charminar', 'gurudwara_gowliguda', 'spanish_mosque', 'paigah_tombs',
  'giant_wheel', 'khairatabad_ganesh', 'doordarshan_kendra', 'nimrah_cafe', 'grand_hotel', 'kirana_3', 'bangle_shop_1', 'banana_cart_1', 'std_1', 'bus_stop_1', 'home', 'water_tank_1', 'purani_haveli', 'madina_building', 'kakatiya_arch_s', 'koti_womens_college', 'school_1'];
// at / look are offsets from the landmark centre (or from another landmark: rel: '<id>')
const VIEWS = {
  charminar: [{ name: 'north', from: -Math.PI / 2, dist: 175, fpsDist: 120 }, { name: 'laad_bazaar', atFn: 'laad', fpsPitch: -0.2 }, { name: 'close', from: -Math.PI / 2 + 0.5, dist: 92, fpsDist: 70, fpsPitch: -0.75 }],
  lb_stadium: [{ name: 'gate', from: Math.PI, dist: 150 }, { name: 'field', at: [0, 60], look: [0, -110], fpsOnly: true, fpsPitch: -0.05 }],
  birla_mandir: [{ name: 'front', from: Math.PI / 2, dist: 140 }],
  buddha_statue: [{ name: 'bund', atFn: 'bund', fpsPitch: -0.1 }],
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
  // viewpoint picker: the first spot (around the wanted one) with a clear line of sight to the landmark
  await page.evaluate(() => {
    window.clearSpot = (P, want, mode) => {
      const W = N.world, hA = (x, y) => N.view3d.heightAt(x, y);
      const lm = N.WORLD_DATA.landmarks.find((l) => l.id === P.id);
      const r0 = Math.max(lm.w, lm.d) / 2;
      const d0 = Math.hypot(want[0] - P.x, want[1] - P.y), a0 = Math.atan2(want[1] - P.y, want[0] - P.x);
      let best = null, bestScore = 1e9;
      for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.57, -1.57, 2.1, -2.1, 2.6, -2.6, Math.PI]) {
        for (const k of [1, 0.8, 1.25, 0.65, 1.5]) {
          const d = Math.max(r0 + 14, d0 * k), a = a0 + da, x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
          if (!W.isWalkable(x, y)) continue;
          let blocked = 0;
          const n = Math.ceil((d - r0) / 4);
          for (let i = 1; i < n; i++) { const t = i / n, px = x + (P.x - x) * t * (d - r0) / d, py = y + (P.y - y) * t * (d - r0) / d; if (hA(px, py) > 9) blocked++; }
          // the third-person camera sits ~30 u behind the player: keep it out of buildings too
          if (mode === 'tps') for (let j = 4; j <= 30; j += 4) { if (hA(x + Math.cos(a) * j, y + Math.sin(a) * j) > 6) blocked += 0.5; }
          const score = blocked * 10 + Math.abs(da) * 2 + Math.abs(k - 1) * 3;
          if (score < bestScore) { bestScore = score; best = [x, y]; }
          if (blocked === 0 && da === 0) return best;
        }
        if (bestScore < 1) break;
      }
      return best || want;
    };
  });

  // ---------------------------------------------------------------- landmark list + shot plan
  const plan = await page.evaluate((args) => {
    // viewpoints derived from the map data (robust to re-surveys): 200 u down Laad Bazaar from the
    // Charminar end; beside the first Tank Bund statue (plinth not in the way of the Buddha)
    const atFn = (kind, lm, L) => {
      if (kind === 'laad') {
        const rd = (N.WORLD_DATA.roads || []).find((r) => r.id === 'laad_bazaar');
        if (!rd) return [lm.x - 220, lm.y];
        let pts = rd.pts.slice();
        if (Math.hypot(pts[0][0] - lm.x, pts[0][1] - lm.y) > Math.hypot(pts[pts.length - 1][0] - lm.x, pts[pts.length - 1][1] - lm.y)) pts.reverse();
        let left = 200;
        for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d >= left) return [a[0] + (b[0] - a[0]) * left / d, a[1] + (b[1] - a[1]) * left / d]; left -= d; }
        return pts[pts.length - 1];
      }
      if (kind === 'bund') {
        const s1 = L.find((l) => l.id === 'tank_bund_statue_1'); if (!s1) return [lm.x, lm.y + 200];
        const dx = s1.x - lm.x, dy = s1.y - lm.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        return [s1.x + ux * 24 - uy * 16, s1.y + uy * 24 + ux * 16];
      }
      return [lm.x, lm.y + 100];
    };
    const { ONLY, VIEWS, SKIP, TOP, NAMED } = args;
    const L = N.WORLD_DATA.landmarks;
    const DEFS = N.view3dLandmarks && N.view3dLandmarks.DEFS;
    const small = (lm) => { const d = DEFS && (DEFS.get('#' + lm.id) || DEFS.get(lm.draw)); return !!(d && d.cls); };
    const seen = new Set();
    const out = [];
    for (const lm of L) {
      const sel = (ONLY.length ? (ONLY.includes(lm.id) || ONLY.includes(lm.draw)) : (args.ALL || TOP.includes(lm.id) || NAMED.includes(lm.id))) && !SKIP.includes(lm.id) && !SKIP.includes(lm.draw);
      if (!sel) continue;
      // repeated small kinds: one representative (the first) unless asked for by id
      if (!ONLY.includes(lm.id) && !TOP.includes(lm.id) && !NAMED.includes(lm.id) && (small(lm) || ['school', 'temple', 'mosque', 'church', 'cinema', 'mahankali_temple', 'tank_bund_statue', 'qutb_tomb', 'fort_wall', 'water_tank', 'halt_station', 'hospital', 'palace', 'film_studio', 'market_hall', 'rythu_bazaar', 'dargah', 'bus_terminus', 'kaman', 'college', 'coaching_centre', 'idol_workshop', 'numaish_stalls', 'film_hoarding', 'home_house', 'kakatiya_arch', 'fort_gate'].includes(lm.draw))) {
        if (seen.has(lm.draw)) continue;
        seen.add(lm.draw);
      }
      const Ht = (lm.h || 20) * 1.5;
      const views = VIEWS[lm.id] || VIEWS[lm.draw] || [{ name: '' }];
      for (const v of views) {
        const face = { n: -Math.PI / 2, s: Math.PI / 2, e: 0, w: Math.PI }[lm.face] ?? (isFinite(lm.faceAngle) ? lm.faceAngle : Math.PI / 2);
        const from = v.from != null ? v.from : face;
        const size = Math.max(lm.w, lm.d);
        const sm = small(lm) || size < 30;
        const dist = v.dist || (sm ? Math.max(24, Math.min(lm.w, lm.d) * 0.5 + 16) : Math.min(330, Math.max(42, size * 0.75 + Ht * 0.9 + 16)));
        const fdist = v.fpsDist || (sm ? Math.max(18, Math.min(lm.w, lm.d) * 0.5 + 12) : Math.min(260, Math.max(30, size * 0.6 + Ht * 0.7 + 10)));
        const base = v.rel ? L.find((l) => l.id === v.rel) || lm : lm;
        let at = v.at ? [base.x + v.at[0], base.y + v.at[1]] : null;
        const look = v.look ? [lm.x + v.look[0], lm.y + v.look[1]] : null;
        if (v.atFn) at = atFn(v.atFn, lm, L);
        out.push({ id: lm.id, draw: lm.draw, view: v.name || '', x: lm.x, y: lm.y, Ht, at, look, fpsOnly: !!v.fpsOnly,
          tps: [lm.x + Math.cos(from) * dist, lm.y + Math.sin(from) * dist], fps: [lm.x + Math.cos(from) * fdist, lm.y + Math.sin(from) * fdist], fdist, fpsPitch: v.fpsPitch, snapRoad: sm && !v.at });
      }
    }
    return out;
  }, { ONLY, VIEWS, SKIP, TOP, NAMED, ALL: process.env.ALL === '1' });
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
      // targeted retry for anything a time-capped settle missed on a loaded machine
      const seen = () => { for (const o of E.lmGroup.children) { if (o.userData.fallback) fb.add(o.name); if (/^lm3d:/.test(o.name)) builtIds.add(o.name.slice(5)); if (o.userData.cell) for (const m of o.userData.cell.members) builtIds.add(m.id); } };
      for (const lm of L) {
        if (builtIds.has(lm.id) || !(DEFS.get('#' + lm.id) || DEFS.get(lm.draw))) continue;
        N.player.teleport(lm.x, lm.y + lm.d / 2 + 30);
        for (let k = 0; k < 4 && !builtIds.has(lm.id); k++) { N.view3d.settle(15000); seen(); }
        out.retried = (out.retried || 0) + 1;
      }
      N.view3d.setQuality({ drawDist: dd });
      for (const lm of L) if (builtIds.has(lm.id)) out.ok++; else if (DEFS.get('#' + lm.id) || DEFS.get(lm.draw)) out.fallback.push(lm.id);
      out.fb = Array.from(fb).slice(0, 20);
      out.total = L.length;
      return out;
    });
    check(res.missing.length === 0, 'every draw id has a 3D model (' + (res.total - res.missing.length) + '/' + res.total + ')', res.missing.slice(0, 20).join(', '));
    check(res.fallback.length === 0 && res.fb.length === 0, 'every landmark was built by view3d_landmarks.js on the city walk (' + res.ok + ' built, ' + res.cells + ' batch cells, ' + (res.retried || 0) + ' targeted retries)', res.fallback.slice(0, 20).join(', ') + ' ' + res.fb.join(', '));
  }

  // ---------------------------------------------------------------- 1b. build cost + triangles of every model (built off-scene)
  if (!ONLY.length || process.env.MEASURE === '1') {
    const m = await page.evaluate(() => {
      const r = N.WORLD_DATA.landmarks.map((l) => N.view3dLandmarks.measure(l.id)).filter(Boolean);
      // the machine is shared and loaded: re-measure the slowest few and keep the best of three
      r.sort((a, b) => b.ms - a.ms);
      for (const x of r.slice(0, 8)) for (let i = 0; i < 2; i++) x.ms = Math.min(x.ms, N.view3dLandmarks.measure(x.id).ms);
      return r;
    });
    m.sort((a, b) => b.ms - a.ms);
    const total = m.reduce((a, b) => a + b.ms, 0);
    const big = m.slice().sort((a, b) => b.tris - a.tris).slice(0, 6).map((r) => r.id + ' ' + (r.tris / 1000).toFixed(1) + 'k/' + r.meshes);
    report.push('build cost: ' + m.length + ' models in ' + total.toFixed(0) + ' ms total; slowest ' + m.slice(0, 5).map((r) => r.id + ' ' + r.ms + 'ms').join(', ') + '; most triangles (tris/meshes) ' + big.join(', '));
    check(m[0].ms < 150, 'slowest single model builds in ' + m[0].ms + ' ms (best of three, < 150 on a loaded headless machine)');
    const maxMeshes = Math.max(...m.filter((r) => !r.batched).map((r) => r.meshes));
    check(maxMeshes <= 6, 'every unbatched model uses <= 6 meshes (max ' + maxMeshes + ')');
  }

  // ---------------------------------------------------------------- 2. screenshots
  let n = 0;
  const T0 = Date.now();
  if (SHOTS) {
    const all4 = process.env.ALL === '1' || (ONLY.length > 0 && process.env.PAIRS !== '1');
    for (const P of plan) {
      for (const time of TIMES) {
        for (const mode of MODES) {
          if (P.fpsOnly && mode !== 'fps') continue;
          if (!all4 && (process.env.PAIRS === '1' || !TOP.includes(P.id)) && !((mode === 'tps' && time === 'day') || (mode === 'fps' && time === 'night'))) continue;
          const name = P.id + (P.view ? '_' + P.view : '') + '_' + mode + '_' + time;
          const info = await page.evaluate((a) => {
            const { P, mode, time } = a;
            let at = P.at || (mode === 'fps' ? P.fps : P.tps);
            if (P.snapRoad && N.world.nearestRoadPoint) { const rp = N.world.nearestRoadPoint(at[0], at[1]); if (rp && rp.dist < 40) at = [rp.x, rp.y]; }
            if (!P.at && !P.fixed) at = clearSpot(P, at, mode);
            N.player.teleport(at[0], at[1]);
            if (time === 'night') N.debug.setTime(21, 30); else if (time === 'golden') N.debug.setTime(17, 40); else N.debug.setTime(10, 30);
            N.view.set(mode);
            const p = N.player, look = P.look || [P.x, P.y];
            const d = Math.hypot(look[0] - p.x, look[1] - p.y);
            const yaw = Math.atan2(look[1] - p.y, look[0] - p.x);
            let pitch;
            if (mode === 'fps') pitch = P.fpsPitch != null ? P.fpsPitch : -Math.atan2(Math.max(0, P.Ht * 0.48 - 6.3), Math.max(20, d)) * 0.95;
            else pitch = P.snapRoad ? 0.32 : P.Ht > 70 ? -0.12 : 0.02;
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
      { name: 'lb_stadium_matchday_fps_night', lm: 'lb_stadium', at: [0, 60], look: [0, -110], mode: 'fps', h: [19, 40], pitch: -0.08, set: () => { N.flags.lb_match = true; } },
      { name: 'lb_stadium_matchday_tps_dusk', lm: 'lb_stadium', at: [-141, 0], look: [0, 0], mode: 'tps', h: [18, 20], pitch: 0.18, set: () => { N.flags.lb_match = true; } },
      { name: 'charminar_chand_raat_tps_night', lm: 'charminar', at: [0, -170], look: [0, 0], mode: 'tps', h: [22, 0], pitch: -0.12, set: () => { N.flags.chand_raat = true; } },
      { name: 'prasads_open_tps_day', lm: 'prasads_imax', at: [0, 96], look: [0, 0], mode: 'tps', h: [11, 0], pitch: 0, set: () => { if (N.placesArt) N.placesArt.fx.prasads = 'open'; N.flags.prasads_open = true; } },
      { name: 'prasads_fence_tps_day', lm: 'prasads_imax', at: [0, 96], look: [0, 0], mode: 'tps', h: [11, 0], pitch: 0, set: () => { if (N.placesArt) N.placesArt.fx.prasads = 'fence'; N.flags.prasads_open = false; } },
      { name: 'ntr_gardens_tps_golden', lm: 'ntr_memorial', at: [0, 80], look: [0, 0], mode: 'tps', h: [17, 40], pitch: 0.1, set: () => {} },
      { name: 'laad_bazaar_fps_night', lm: 'charminar', atFn: 'laad', look: [0, 0], mode: 'fps', h: [21, 0], pitch: -0.12, set: () => {} },
    ];
    for (const v of V) {
      await page.evaluate((a) => {
        const v = a.v;
        N.flags.lb_match = false; N.flags.chand_raat = false;
        // eslint-disable-next-line no-new-func
        (new Function(a.set))();
        const L0 = N.WORLD_DATA.landmarks.find((l) => l.id === v.lm) || { x: 0, y: 0 };
        let at = v.at ? [L0.x + v.at[0], L0.y + v.at[1]] : null;
        if (v.atFn === 'laad') { const rd = (N.WORLD_DATA.roads || []).find((r) => r.id === 'laad_bazaar'); if (rd) { let pts = rd.pts.slice(); if (Math.hypot(pts[0][0] - L0.x, pts[0][1] - L0.y) > Math.hypot(pts[pts.length - 1][0] - L0.x, pts[pts.length - 1][1] - L0.y)) pts.reverse(); let left = 190; at = pts[pts.length - 1]; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d >= left) { at = [a[0] + (b[0] - a[0]) * left / d, a[1] + (b[1] - a[1]) * left / d]; break; } left -= d; } } else at = [L0.x - 210, L0.y]; }
        N.player.teleport(at[0], at[1]); N.debug.setTime(v.h[0], v.h[1]); N.view.set(v.mode);
        const p = N.player; N.view3d.setCamera({ yaw: Math.atan2(L0.y + v.look[1] - p.y, L0.x + v.look[0] - p.x), pitch: v.pitch, snap: true });
        N.view3d.settle(20000);
      }, { v: { lm: v.lm, at: v.at, atFn: v.atFn, look: v.look, mode: v.mode, h: v.h, pitch: v.pitch }, set: '(' + v.set.toString() + ')()' });
      await frames(page, 4);
      await page.screenshot({ path: path.join(OUT, v.name + '.png'), timeout: 240000 });
      const st2 = await page.evaluate(() => N.view3d.stats());
      ok('variant shot ' + v.name + ' (' + st2.calls + ' calls, ' + (st2.triangles / 1000).toFixed(0) + 'k tris)');
    }
    await page.evaluate(() => { N.flags.lb_match = false; N.flags.chand_raat = false; if (N.placesArt) N.placesArt.fx.prasads = null; });
  }

  // ---------------------------------------------------------------- 3. perf by night in the densest landmark views
  if (!ONLY.length || process.env.PERF === '1') {
    for (const spot of [['charminar', 'charminar', 0, -110, Math.PI / 2], ['rtc_x_roads', 'rtc_x_roads', 0, 0, -Math.PI / 4], ['koti', 'koti', 0, 0, 0]]) {
      const r = await page.evaluate(async (s) => {
        const P0 = N.places[s[1]] || N.WORLD_DATA.landmarks.find((l) => l.id === s[1]) || { x: 4000, y: 3000 };
        N.player.teleport(P0.x + s[2], P0.y + s[3]); N.debug.setTime(21, 30); N.view.set('tps');
        N.view3d.setCamera({ yaw: s[4], pitch: 0.1, snap: true }); N.view3d.settle(20000);
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
      const C = N.WORLD_DATA.landmarks.find((l) => l.id === 'charminar'); N.player.teleport(C.x, C.y - 160); N.debug.setTime(21, 0); N.view3d.setCamera({ yaw: Math.PI / 2, pitch: -0.1, snap: true }); N.view3d.settle(20000);
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
