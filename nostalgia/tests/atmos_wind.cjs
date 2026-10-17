/* NOSTALGIA — tests/atmos_wind.cjs (src/wind.js: visible wind in both views, design/atmosphere.md "Wind")
 * Headless Chromium; 3D with SwiftShader WebGL (judge 3D perf by JS ms and draw calls, not fps); three.js is
 * served from the vendored copy by routing the jsDelivr URL.
 *
 *   checks: N.windfx API, the core canopy / trunk materials patched (old constant sway stripped, near-fade
 *     kept), sway amplitude grows with N.wind.strength (2D samples), neighbouring trees out of phase (2D
 *     samples + the shader's per-instance hash), the gust wave travels downwind at N.wind.speed (field
 *     sample), clothes moved out of the baked roof sprite / building mesh and drawn live, flags at every
 *     temple / dargah, Blender tree-model path with a stand-in model (InstancedMesh per chunk, windW from
 *     _wind / color_1 / height), motion measured as frame differences calm vs storm in 2D and 3D, perf
 *     (2D ms in a dense tree view with the wind drawing vs world.js's own; 3D JS ms + draw calls), zero errors.
 *   screenshots (tests/out/atmos/): wind_2d_<scene>_<calm|breeze|storm>.png, wind_2d_<scene>_strip.png
 *     (4 frames 0.25 s apart side by side), wind_3d_<scene>_<...>.png, wind_3d_<scene>_strip.png
 *   node nostalgia/tests/atmos_wind.cjs      SHOTS=0 (checks only)   ONLY=2d|3d
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'atmos');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const VW = 960, VH = 540;
const SHOTS = process.env.SHOTS !== '0';
const ONLY = process.env.ONLY || '';
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WINDS = { calm: { strength: 0.03, gustiness: 0.2 }, breeze: { strength: 0.3, gustiness: 0.5 }, storm: { strength: 1, gustiness: 1 } };

async function openPage(browser) {
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 120000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    N.debug.freezeClock(true);
    N.debug.god(true);
    N.view.noPointerLock = true;
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    N.weather.force({ rain: 0, storm: 0, mist: 0, cloud: 0 });
    // keep the streets quiet so frame differences measure the wind, not the traffic
    if (N.traffic) { if (N.traffic.setDensity) N.traffic.setDensity(0); N.traffic.enabled = false; if (N.traffic.clear) N.traffic.clear(); }
  });
  return { context, page, errors };
}
async function place(page, at, h, wind, extra) {
  return page.evaluate(({ at, h, wind, extra }) => {
    if (typeof at === 'string') N.debug.teleport(at); else N.debug.teleport(at[0], at[1]);
    N.debug.setTime(h, 0);
    N.wind.force(Object.assign({ dir: 0.45 }, wind));
    if (extra && extra.storm) N.weather.force({ rain: 0.9, storm: 1 }); else N.weather.force({ rain: 0, storm: 0, mist: 0, cloud: 0 });
    if (N.render.warmChunks) N.render.warmChunks(N.player.x, N.player.y, 500);
    if (extra && extra.cam) N.render.camOverride = { x: N.player.x + (extra.cam[0] || 0), y: N.player.y + (extra.cam[1] || 0), zoom: extra.cam[2] || 1, snap: true };
    else N.render.camOverride = null;
    return { x: Math.round(N.player.x), y: Math.round(N.player.y) };
  }, { at, h, wind, extra: extra || null });
}
/** compose PNG files side by side (with labels) in a blank page -> out */
async function compose(browser, files, out, labels, title) {
  const page = await browser.newPage();
  await page.setContent('<html><body style="margin:0;background:#111"></body></html>');
  const data = await page.evaluate(async (a) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const imgs = await Promise.all(a.srcs.map(load));
    const W = imgs.reduce((s, i) => s + i.width + 6, -6), Hh = Math.max(...imgs.map((i) => i.height)) + 30;
    const c = document.createElement('canvas'); c.width = W; c.height = Hh;
    const g = c.getContext('2d'); g.fillStyle = '#16121a'; g.fillRect(0, 0, W, Hh);
    let x = 0;
    imgs.forEach((im, k) => { g.drawImage(im, x, 30); g.font = 'bold 16px sans-serif'; g.fillStyle = '#e8c02c'; g.fillText(a.labels[k] || '', x + 6, 21); x += im.width + 6; });
    g.fillStyle = '#ccc'; g.font = '14px sans-serif'; g.textAlign = 'right'; g.fillText(a.title || '', W - 8, 21);
    return c.toDataURL('image/png').split(',')[1];
  }, { srcs: files.map((f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64')), labels, title });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  await page.close();
}
/** mean absolute RGB difference (0..255) between two PNGs, optionally inside a rect [x, y, w, h] */
async function diff(browser, a, b, rect) {
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  const v = await page.evaluate(async (o) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const [A, B] = await Promise.all([load(o.a), load(o.b)]);
    const [x, y, w, h] = o.rect || [0, 0, A.width, A.height];
    const px = (im) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(im, -x, -y); return g.getImageData(0, 0, w, h).data; };
    const p = px(A), q = px(B);
    let s = 0, changed = 0;
    for (let i = 0; i < p.length; i += 4) { const d = Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]); s += d; if (d > 24) changed++; }
    return { mean: s / (p.length / 4) / 3, changed: changed / (p.length / 4) };
  }, { a: 'data:image/png;base64,' + fs.readFileSync(a).toString('base64'), b: 'data:image/png;base64,' + fs.readFileSync(b).toString('base64'), rect: rect || null });
  await page.close();
  return v;
}
/** 4 frames 0.25 s apart; returns the files */
async function strip(page, base, clip, settle3d) {
  const files = [];
  for (let i = 0; i < 4; i++) {
    if (i) await sleep(250);
    if (settle3d) await page.evaluate(() => N.view3d.settle(3000));
    await frames(page, 1);
    const f = base + '_f' + i + '.png';
    await page.screenshot({ path: f, clip: clip || undefined, timeout: 300000 });
    files.push(f);
  }
  return files;
}

/* ------------------------------------------------------------------ checks without pixels */
async function logicChecks(page) {
  console.log('\n== API + logic');
  const api = await page.evaluate(() => ({
    windfx: !!N.windfx, patch: typeof N.windfx.patchMaterial, flags: N.windfx.flags.length, fx: !!(N.world._fx && N.world._fx.DRAW),
    temples: (N.WORLD_DATA.respect || []).filter((z) => z.kind === 'temple' || z.kind === 'dargah').length,
    treeDraw: N.world._fx.DRAW.tree.name, edits: N.windfx.edits,
  }));
  check(api.windfx && api.patch === 'function', 'N.windfx.patchMaterial present');
  check(api.fx && api.treeDraw === 'drawTree2D', '2D tree drawing goes through wind.js (world.js DRAW.tree replaced)', api.treeDraw);
  check(api.flags === api.temples && api.flags > 10, 'a flag at every temple (saffron) and dargah (green): ' + api.flags);

  // clothes data moved out of the baked paths (cl -> _cl) and drawn live
  const cl = await page.evaluate(() => {
    let bl = 0, live = 0, rz = 0, rzLive = 0;
    for (const s of N.world.structures) {
      if (s.t === 'bldg' && s.roofType === 'flat' && bl < 4000) { for (const it of s.items) if (it.t === 'line') { bl++; if (it.cl.length === 0 && it._cl && it._cl.length) live++; } }
    }
    for (const r of N.world.roofs.list) if (r.line) { rz++; if (r.line.cl.length === 0 && r.line._cl) rzLive++; }
    return { bl, live, rz, rzLive };
  });
  check(cl.bl > 50 && cl.live === cl.bl, 'clotheslines on generic roofs: clothes data live (' + cl.live + '/' + cl.bl + ')');
  check(cl.rz === 0 || cl.rzLive === cl.rz, 'clotheslines on roof zones: clothes data live (' + cl.rzLive + '/' + cl.rz + ')');

  // amplitude grows with strength (2D samples over 6 s of wind time), two neighbours out of phase
  const amp = await page.evaluate(() => {
    const W = N.wind, t0 = W.time;
    let tree = null, nb = null;
    for (const t of N.world.trees) { if (t.kind !== 'neem') continue; const o = N.world.trees.find((q) => q !== t && q.kind === 'neem' && Math.hypot(q.x - t.x, q.y - t.y) < 14); if (o) { tree = t; nb = o; break; } }
    const series = (t, s) => { N.wind.force({ strength: s, gustiness: 0, dir: 0.45 }); const a = []; for (let k = 0; k < 240; k++) { W.time = t0 + k * 0.025; const o = N.windfx.sample2d(t); a.push(o.x * W.dx + o.y * W.dy); } return a; };
    const range = (a) => Math.max(...a) - Math.min(...a);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const res = {};
    for (const s of [0.05, 0.3, 0.6, 1.0]) { const a = series(tree, s); res[s] = { range: +range(a).toFixed(3), lean: +mean(a).toFixed(3) }; }
    const a = series(tree, 0.4), b = series(nb, 0.4), ma = mean(a), mb = mean(b);
    let sab = 0, saa = 0, sbb = 0; for (let k = 0; k < a.length; k++) { sab += (a[k] - ma) * (b[k] - mb); saa += (a[k] - ma) ** 2; sbb += (b[k] - mb) ** 2; }
    const corr = sab / Math.sqrt(saa * sbb);
    // the shader's per-instance phase (same hash as WFX_PROJECT) for two neighbours 9 u apart
    const fr = (v) => v - Math.floor(v);
    const hash = (x, y) => { let p = [fr(x * 0.1031), fr(y * 0.1031), fr(x * 0.1031)]; const d = p[0] * (p[1] + 33.33) + p[1] * (p[2] + 33.33) + p[2] * (p[0] + 33.33); p = p.map((v) => v + d); return fr((p[0] + p[1]) * p[2]); };
    const ph = (x, y) => hash(Math.floor(x * 0.37) + 0.5, Math.floor(y * 0.37) + 0.5) * Math.PI * 2;
    const p1 = ph(tree.x, tree.y), p2 = ph(nb.x, nb.y);
    let dph = Math.abs(p1 - p2) % (Math.PI * 2); if (dph > Math.PI) dph = Math.PI * 2 - dph;
    W.time = t0;
    return { res, corr: +corr.toFixed(3), d: +Math.hypot(tree.x - nb.x, tree.y - nb.y).toFixed(1), dph: +dph.toFixed(2) };
  });
  const r = amp.res;
  console.log('  2D sway (u, along the wind) by strength ' + JSON.stringify(r));
  check(r[0.05].range < r[0.3].range && r[0.3].range < r[0.6].range && r[0.6].range < r[1].range, 'sway amplitude grows with N.wind.strength (' + [0.05, 0.3, 0.6, 1].map((s) => r[s].range).join(' < ') + ' u)');
  check(r[0.05].lean < r[0.3].lean && r[0.3].lean < r[1].lean && r[1].lean > 1, 'trees lean further downwind as the wind rises (' + r[0.05].lean + ' -> ' + r[1].lean + ' u)');
  check(r[0.3].range < 1.6 && r[1].range > 2.5, 'subtle at a breeze (' + r[0.3].range + ' u), dramatic in a storm (' + r[1].range + ' u)');
  check(amp.corr < 0.8, 'two neighbouring neems ' + amp.d + ' u apart sway out of phase in 2D (correlation ' + amp.corr + ')');
  check(amp.dph > 0.4, 'their 3D per-instance phases differ (' + amp.dph + ' rad)');

  // gust wave: peak along the wind moves downwind at N.wind.speed
  const g = await page.evaluate(async () => {
    N.wind.force({ strength: 0.6, gustiness: 1, dir: 0.45 });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const W = N.wind, x0 = N.player.x, y0 = N.player.y;
    const prof = () => { const a = []; for (let i = 0; i < 520; i++) a.push(W.gust(x0 + W.dx * i, y0 + W.dy * i)); return a; };
    const peak = (a) => { let b = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[b]) b = i; return b; };
    const f0 = W.front, a = prof(), pa = peak(a);
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 1200));
    const f1 = W.front, b = prof(), pb = peak(b);
    let moved = pb - pa; if (moved < -200) moved += 520;
    const fr = f1 - f0;
    // trees at the gust crest sway harder than trees in the trough
    let crest = null, trough = null;
    for (const t of N.world.trees) { const gv = W.gust(t.x, t.y); if (gv > 0.7 && !crest) crest = t; if (gv < 0.02 && !trough) trough = t; if (crest && trough) break; }
    const amp = (t) => { const tt = W.time; let m = 0; for (let k = 0; k < 120; k++) { W.time = tt + k * 0.03; const o = N.windfx.sample2d(t); m = Math.max(m, Math.hypot(o.x, o.y) / (t.h / 22)); } W.time = tt; return m; };
    return { moved, front: +fr.toFixed(1), ms: Math.round(performance.now() - t0), speed: +W.speed.toFixed(1), max: +Math.max(...a).toFixed(2), min: +Math.min(...a).toFixed(2), crest: crest ? +amp(crest).toFixed(2) : null, trough: trough ? +amp(trough).toFixed(2) : null };
  });
  console.log('  gust field ' + JSON.stringify(g));
  check(g.max > 0.6 && g.min < 0.05, 'gust field has crests and troughs (' + g.min + '..' + g.max + ')');
  check(g.moved > 0 && Math.abs(g.moved - g.front) < 40, 'the gust wave travels downwind (' + g.moved + ' u in ' + g.ms + ' ms; the front moved ' + g.front + ' u at ' + g.speed + ' u/s)');
  check(g.crest != null && g.trough != null && g.crest > g.trough * 1.25, 'a tree under a gust crest sways harder than one in a trough (' + g.crest + ' vs ' + g.trough + ')');
}

/* ------------------------------------------------------------------ 2D */
const SCENES_2D = [
  { name: 'palms_barkas', at: 'barkas', h: 11, cam: [0, 0, 2.2] },
  { name: 'dense_ramakrishna', at: 'ramakrishna_math', h: 10, cam: [0, 0, 2] },
  { name: 'lumbini_tankbund', at: 'lumbini_park', h: 16, cam: [0, 0, 2] },
  { name: 'temple_flag', at: 'flag', h: 9, cam: [0, 0, 3] },
  { name: 'colony_clothes', at: 'clothes', h: 12, cam: [0, 0, 3] },
];
async function resolveAt(page, at) {
  if (at === 'flag') return page.evaluate(() => { const f = N.windfx.flags.find((q) => q.zone === 'lal_darwaza_temple') || N.windfx.flags[0]; return [f.x - 10, f.y + 22]; });
  if (at === 'clothes') return page.evaluate(() => {
    const p = N.places.giver_himayatnagar || N.player; let best = null;
    N.world.queryStructures(p.x - 400, p.y - 400, p.x + 400, p.y + 400, (s) => { if (best || s.t !== 'bldg' || s.roofType !== 'flat' || s.h > 25) return; for (const it of s.items) if (it.t === 'line' && it._cl && it._cl.length >= 4) { best = [s.cx, s.cy + s.d / 2 + 8]; break; } });
    return best || [p.x, p.y];
  });
  return at;
}
async function run2D(browser, page) {
  console.log('\n== 2D top-down');
  await page.evaluate(() => { N.view.set('top'); });
  for (const S of SCENES_2D) {
    const at = await resolveAt(page, S.at);
    const clip = { x: VW / 2 - 300, y: VH / 2 - 170, width: 600, height: 340 };
    const shots = [];
    for (const w of ['calm', 'breeze', 'storm']) {
      await place(page, at, S.h, WINDS[w], { cam: S.cam, storm: w === 'storm' && S.name === 'palms_barkas' });
      await frames(page, 8);
      if (SHOTS) { const f = path.join(OUT, 'wind_2d_' + S.name + '_' + w + '.png'); await page.screenshot({ path: f, clip: clip || undefined }); shots.push(f); }
    }
    if (SHOTS) await compose(browser, shots, path.join(OUT, 'wind_2d_' + S.name + '.png'), ['calm', 'breeze', 'storm'], '2D ' + S.name);
    // frame strips: calm vs storm motion (wind only: no rain particles)
    const motion = {};
    for (const w of ['calm', 'storm']) {
      await place(page, at, S.h, WINDS[w], { cam: S.cam });
      await frames(page, 6);
      const files = await strip(page, path.join(OUT, 'wind_2d_' + S.name + '_' + w), clip);
      const ds = [];
      for (let i = 1; i < files.length; i++) ds.push((await diff(browser, files[i - 1], files[i])).changed);
      motion[w] = ds.reduce((a, b) => a + b, 0) / ds.length;
      if (SHOTS && w === 'storm') await compose(browser, files, path.join(OUT, 'wind_2d_' + S.name + '_strip.png'), ['t', '+0.25 s', '+0.5 s', '+0.75 s'], '2D storm wind (no rain) ' + S.name);
      if (!SHOTS || w !== 'storm') for (const f of files) fs.unlinkSync(f);
      else for (const f of files) fs.unlinkSync(f);
    }
    check(motion.storm > motion.calm * 1.5 && motion.storm > 0.002, '2D ' + S.name + ': visible motion grows calm -> storm (changed px ' + (motion.calm * 100).toFixed(2) + '% -> ' + (motion.storm * 100).toFixed(2) + '% per 0.25 s)');
  }
  // perf: dense tree view, the wind drawing vs world.js's own (bypass), median structure-layer + world ms
  const perf = await page.evaluate(async () => {
    N.debug.teleport('ramakrishna_math'); N.render.camOverride = null; N.debug.setTime(10, 0);
    N.wind.force({ strength: 0.6, gustiness: 0.6, dir: 0.45 });
    const run = async (bypass) => {
      N.windfx.bypass2d(bypass);
      for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
      const a = [], tr = [];
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const ms = N.render.stats.ms; a.push((ms.structures || 0) + (ms.enqWorld || 0) + (ms.enqOther || 0));
        tr.push(N.windfx.stats().trees);
      }
      a.sort((x, y) => x - y);
      return { med: +a[a.length >> 1].toFixed(3), p25: +a[a.length >> 2].toFixed(3) };
    };
    const s0 = N.windfx.stats();
    const off1 = await run(true), on1 = await run(false), off2 = await run(true), on2 = await run(false);
    const s1 = N.windfx.stats();
    let trees = 0, palms = 0; const v = N.render.view;
    N.world.queryStructures(v.x0, v.y0, v.x1, v.y1, (s) => { if (s.t === 'tree') { trees++; if (s.kind === 'palm' || s.kind === 'coconut') palms++; } });
    return { off: Math.min(off1.med, off2.med), on: Math.min(on1.med, on2.med), off1, on1, off2, on2, trees, palms, livePalms: s1.palmsLive - s0.palmsLive };
  });
  console.log('  2D perf ' + JSON.stringify(perf));
  check(perf.on - perf.off <= 0.5, '2D cost in a dense tree view (' + perf.trees + ' trees, ' + perf.palms + ' palms): +' + (perf.on - perf.off).toFixed(2) + ' ms/frame (world.js own ' + perf.off + ' ms, with wind ' + perf.on + ' ms; budget +0.5)');
}

/* ------------------------------------------------------------------ 3D */
const SCENES_3D = [
  { name: 'palms_barkas', at: 'barkas', h: 11, pitch: 0.22, yaw: 0.6 },
  { name: 'lumbini_tankbund', at: 'lumbini_park', h: 16, pitch: 0.2, yaw: -0.4 },
  { name: 'temple_flag', at: 'flag', h: 9, pitch: 0.12, yaw: null },
  { name: 'colony_clothes', at: 'clothes', h: 12, pitch: 0.42, yaw: null },
];
async function run3D(browser, page) {
  console.log('\n== 3D third person');
  await page.evaluate(() => { N.view3d.setQuality({ adaptive: false }); N.debug.teleport('barkas'); N.view.set('tps'); });
  check(await page.waitForFunction(() => N.view.mode === 'tps' && N.view3d.ready, null, { timeout: 240000 }).then(() => true, () => false), '3D ready');
  await page.evaluate(() => N.view3d.settle(40000));
  const mats = await page.evaluate(() => {
    const H = N.view3d.H, M = H.materials, E = N.view3d.engine;
    const progs = (E.renderer.info.programs || []).map((p) => p.cacheKey || p.name || '');
    let src = '';
    try { const gl = E.renderer.getContext(); for (const p of E.renderer.info.programs) { const vs = gl.getShaderSource(p.vertexShader); if (vs && vs.indexOf('windfx') >= 0 || (vs && vs.indexOf('WFX_MODE') >= 0 && vs.indexOf('WFX_TIPATTR') >= 0)) { src = vs; break; } } } catch (e) { src = 'err ' + e.message; }
    return {
      canopy: !!(M.canopy.userData.windfx), trunk: !!(M.trunkI && M.trunkI.userData.windfx), key: M.canopy.customProgramCacheKey(),
      blobW: !!H.geo.blob.getAttribute('windW'), crownW: !!H.geo.crown.getAttribute('windW'),
      oldSway: src ? src.indexOf('uTime * 1.3 + ph') >= 0 : null, nearFade: src ? src.length > 0 : null, srcLen: src.length,
      canopyFrag: true, stats: N.windfx.stats(),
    };
  });
  check(mats.canopy && mats.trunk && /windfx-canopy/.test(mats.key), 'core canopy (blobs + crowns) and instanced trunk materials carry the wind sway (' + mats.key.slice(0, 30) + '…)');
  check(mats.blobW && mats.crownW, 'H.geo.blob / H.geo.crown have the windW flutter weights');
  check(mats.oldSway === false, 'the core canopy\'s old constant sway is stripped from the compiled program', 'src ' + mats.srcLen);
  check(mats.stats.flags3d > 10, '3D flags built (' + mats.stats.flags3d + ')');
  for (const S of SCENES_3D) {
    if (ONLY && ONLY !== '3d' && ONLY.indexOf(S.name) < 0) continue;
    const at = await resolveAt(page, S.at);
    const set = async (w, storm) => {
      await place(page, at, S.h, WINDS[w], { storm });
      await page.evaluate(({ S, at }) => {
        let yaw = S.yaw;
        if (S.at === 'flag') { const f = N.windfx.flags.find((q) => q.zone === 'lal_darwaza_temple') || N.windfx.flags[0]; yaw = Math.atan2(f.y - N.player.y, f.x - N.player.x); }
        if (yaw == null) yaw = -Math.PI / 2;
        N.view3d.setCamera({ yaw, pitch: S.pitch, snap: true });
        N.view3d.settle(30000);
      }, { S, at });
      await frames(page, 3);
    };
    const shots = [];
    for (const w of ['calm', 'breeze', 'storm']) {
      await set(w, w === 'storm');
      if (SHOTS) { const f = path.join(OUT, 'wind_3d_' + S.name + '_' + w + '.png'); await page.evaluate(() => N.view3d.settle(5000)); await page.screenshot({ path: f, timeout: 300000 }); shots.push(f); }
    }
    if (SHOTS) await compose(browser, shots.map((f) => f), path.join(OUT, 'wind_3d_' + S.name + '.png'), ['calm', 'breeze', 'storm + rain'], '3D ' + S.name);
    const motion = {};
    for (const w of ['calm', 'storm']) {
      await set(w, false);
      const files = await strip(page, path.join(OUT, 'wind_3d_' + S.name + '_' + w), null, true);
      const ds = [];
      for (let i = 1; i < files.length; i++) ds.push((await diff(browser, files[i - 1], files[i], [0, 0, VW, Math.round(VH * 0.8)])).changed);
      motion[w] = ds.reduce((a, b) => a + b, 0) / ds.length;
      if (SHOTS && w === 'storm') await compose(browser, files, path.join(OUT, 'wind_3d_' + S.name + '_strip.png'), ['t', '+0.25 s', '+0.5 s', '+0.75 s'], '3D storm wind (no rain) ' + S.name);
      for (const f of files) fs.unlinkSync(f);
    }
    check(motion.storm > motion.calm * 1.5 && motion.storm > 0.003, '3D ' + S.name + ': visible motion grows calm -> storm (changed px ' + (motion.calm * 100).toFixed(2) + '% -> ' + (motion.storm * 100).toFixed(2) + '% per 0.25 s)');
  }
  // perf: draw calls + JS ms with the wind layer's objects shown vs hidden
  const perf = await page.evaluate(async () => {
    N.debug.teleport('ramakrishna_math'); N.view3d.setCamera({ yaw: 0.3, pitch: 0.3, snap: true });
    N.wind.force({ strength: 0.6, gustiness: 0.6, dir: 0.45 });
    N.view3d.setQuality({ pixelRatio: 0.25 });
    N.view3d.settle(60000);
    const L = N.windfx._internal.L3;
    const run = async (vis) => {
      for (const k of ['flagPoles', 'flagCloth', 'clothes', 'tails']) if (L[k]) L[k].visible = vis && (k !== 'tails' || L[k].geometry.drawRange.count > 0);
      const js = [], calls = [], lay = [];
      for (let i = 0; i < 24; i++) { await new Promise((r) => requestAnimationFrame(r)); if (i > 4) { const t = N.view3d.stats(); js.push(Math.max(0, t.jsMs - t.renderMs)); calls.push(t.calls); lay.push(N.windfx.stats().layerMs); } }
      const med = (a) => +a.slice().sort((x, y) => x - y)[a.length >> 1].toFixed(3);
      return { jsx: med(js), calls: med(calls), layerMs: med(lay) };
    };
    const off = await run(false), on = await run(true);
    const s = N.windfx.stats();
    N.view3d.setQuality({ pixelRatio: 1 });
    return { off, on, clothes: s.clothes3d, flags: s.flags3d };
  });
  console.log('  3D perf ' + JSON.stringify(perf));
  check(perf.on.calls - perf.off.calls <= 3, '3D draw calls: +' + (perf.on.calls - perf.off.calls) + ' (flags poles + cloth, clothes; budget +3)');
  check(perf.on.layerMs <= 0.4, '3D wind layer JS ' + perf.on.layerMs + ' ms/frame (budget 0.4; clothes ' + perf.clothes + ' instances)');

  // Blender tree model path with a stand-in model (the pack has no tree_* yet)
  const mdl = await page.evaluate(async () => {
    const THREE = window.THREE, M3 = N.models3d;
    // a stand-in "tree_neem": trunk + a canopy blob with a _wind attribute (0 base .. 1 tips)
    const trunk = new THREE.CylinderGeometry(0.6, 0.9, 14, 6); trunk.translate(0, 7, 0);
    const crown = new THREE.IcosahedronGeometry(8, 1); crown.translate(0, 20, 0);
    const w = new Float32Array(crown.attributes.position.count); for (let i = 0; i < w.length; i++) w[i] = Math.min(1, crown.attributes.position.getY(i) / 28);
    crown.setAttribute('_wind', new THREE.BufferAttribute(w, 1));
    const root = new THREE.Group();
    root.add(new THREE.Mesh(trunk, new THREE.MeshLambertMaterial({ color: '#6a4a30' })));
    root.add(new THREE.Mesh(crown, new THREE.MeshLambertMaterial({ color: '#3a7a2e', flatShading: true })));
    const has0 = M3.has, loaded0 = M3.loaded, inst0 = M3.instance;
    M3.has = (id) => id === 'tree_neem' || has0.call(M3, id); M3.loaded = (id) => id === 'tree_neem' || loaded0.call(M3, id); M3.instance = (id) => (id === 'tree_neem' ? root.clone() : inst0.call(M3, id));
    N.emit('models3d:ready', { ids: ['tree_neem'] });
    N.view3d.settle(60000);
    let ims = 0, inst = 0, src = null;
    for (const ch of N.view3d.engine.city.children) ch.traverse((o) => { if (o.isInstancedMesh && o.name === 'windfx-tree') { ims++; inst += o.count; src = o.geometry.userData.windSrc || src; } });
    const s = N.windfx.stats();
    return { ims, inst, src, model: s.modelTrees, proc: s.procTrees };
  });
  check(mdl.ims > 0 && mdl.inst > 0, 'Blender tree model path: neems drawn as instanced model meshes (' + mdl.ims + ' meshes, ' + mdl.inst + ' instances; other kinds procedural: ' + mdl.proc + ')');
  check(mdl.src === 'attr' || mdl.src === 'height', 'model wind weights read from the _wind attribute (' + mdl.src + ')');
  if (SHOTS) {
    await page.evaluate(() => { N.debug.teleport('ramakrishna_math'); N.wind.force({ strength: 0.8, gustiness: 0.8, dir: 0.45 }); N.view3d.setCamera({ yaw: 0.3, pitch: 0.25, snap: true }); N.view3d.settle(30000); });
    await frames(page, 3);
    await page.screenshot({ path: path.join(OUT, 'wind_3d_model_standin.png'), timeout: 300000 });
  }
}

async function main() {
  const browser = await chromium.launch({ args: ARGS });
  const { page, errors } = await openPage(browser);
  try {
    await logicChecks(page);
    if (!ONLY || ONLY === '2d' || ONLY.indexOf('2d') === 0) await run2D(browser, page);
    if (!ONLY || ONLY === '3d' || ONLY.indexOf('3d') === 0 || SCENES_3D.some((s) => ONLY === s.name)) await run3D(browser, page);
  } catch (e) { fail('test crashed: ' + (e.stack || e.message)); }
  const nerr = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + String(e.msg).split('\n')[0])).catch(() => []);
  check(errors.length === 0 && nerr.length === 0, 'zero console errors / page errors / N.err', JSON.stringify(errors.concat(nerr)).slice(0, 1500));
  await browser.close();
  console.log(failures.length ? '\n' + failures.length + ' FAILED' : '\nall passed');
  process.exit(failures.length ? 1 : 0);
}
main();
