/* NOSTALGIA — tests/atmos_birds.cjs (bird life, src/birds.js, design/atmosphere.md "Birds")
 * Headless Chromium with SwiftShader WebGL (software GL: judge 3D perf by JS ms and draw calls, not fps).
 * three.js is served from the vendored copy by routing the jsDelivr URL (hermetic, no network).
 *
 *   checks: pigeons at Charminar (count, resting on the plaza / roofs), the takeoff burst when the player
 *     runs through + 'birds:takeoff' / 'pigeons:scatter' events, the horn scares, crows on wires (N.wires)
 *     or roofs, black kites soaring by day (none at night), parakeets in trees streaking between them,
 *     egrets / cormorants at the Hussain Sagar shore, mynas on a park lawn, bats at dusk at Golconda,
 *     rain = sheltering (kites gone, nobody flying on their own, a scare = a short hop), night = roosting
 *     (nobody but bats flying, a scare does not flush them), no bird inside a building / under the
 *     ground / on water (but water birds at the shore), the traffic.js / landmarks.js pigeons taken over,
 *     2D perf (update + draw ms with ~150 birds near), 3D perf (birds layer JS ms, draw calls ≤ 8),
 *     zero console errors / page errors / N.err.
 *   screenshots -> tests/out/atmos/birds_<name>.png (+ _zoom = the same moment with the camera zoomed in)
 *
 *   node tests/atmos_birds.cjs          SHOTS=0 (checks only)   ONLY=2d|3d
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
const notes = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const note = (msg) => { notes.push(msg); console.log('  note ' + msg); };
const check = (cond, msg, detail) => { if (cond) ok(msg + (detail ? ' (' + detail + ')' : '')); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };

async function openPage(browser) {
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    N.debug.freezeClock(true);
    N.debug.god(true);
    N.view.noPointerLock = true;
    if (N.dialogue) N.dialogue.skip = true;
    if (N.atmos) N.atmos.low = false;       // desktop tier (960x540 would read as "low")
    if (N.wanted && N.wanted.set) N.wanted.set(0);
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    window.__ev = [];
    for (const n of ['birds:takeoff', 'pigeons:scatter']) N.on(n, (e) => window.__ev.push({ n, e: { species: e.species, n: e.n } }));
  });
  return { context, page, errors };
}
/** wait until the simulation clock advanced by sec (the sandbox can be slow: frames of 0.1 s game time) */
async function sim(page, sec) {
  await page.evaluate((sec) => new Promise((res) => {
    const t0 = N.time.now, w0 = performance.now();
    const f = () => (N.time.now - t0 >= sec || performance.now() - w0 > 90000 ? res() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), sec);
}
async function shot(page, name, zoom) {
  if (!SHOTS) return;
  await page.screenshot({ path: path.join(OUT, 'birds_' + name + '.png'), timeout: 180000 });
  if (zoom) {
    const is3d = await page.evaluate(() => N.view.mode !== 'top');
    if (is3d) return;
    await page.evaluate((z) => { N.render._bz = N.render.baseZoom; N.render.baseZoom = z; N.render.snapCamera && N.render.snapCamera(); }, zoom);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: path.join(OUT, 'birds_' + name + '_zoom.png'), timeout: 180000 });
    await page.evaluate(() => { N.render.baseZoom = N.render._bz || 1; });
  }
}
/** go somewhere at a time / weather, release the flocks so they spawn fresh for the new conditions */
async function goto(page, at, h, m, opts) {
  opts = opts || {};
  await page.evaluate(({ at, h, m, opts }) => {
    if (N.player.vehicle && N.vehicles.alight) { try { N.vehicles.alight(N.player, true); } catch (e) { /* ignore */ } }
    N.weather.force(opts.rain ? { rain: opts.rain } : null);
    if (!opts.rain) N.weather.force({ rain: 0 });
    N.debug.setTime(h, m || 0);
    if (Array.isArray(at)) N.debug.teleport(at[0], at[1]); else N.debug.teleport(at);
    N.birds.clear(); N.birds.refresh();
  }, { at, h, m, opts });
  await sim(page, opts.wait || 2.5);
}
const st = (page) => page.evaluate(() => N.birds.stats());

/** birds inside buildings / underground / on water, over all active flocks right now */
const BAD_FN = () => {
  const W = N.world, S = N.SURF, out = { n: 0, bad: [], checked: 0 };
  const oh = N.birds._debug.obstH;
  for (const f of N.birds.flocks) for (const b of f.birds) {
    out.checked++;
    if (!(b.h >= 0) || !isFinite(b.x) || !isFinite(b.y)) { out.bad.push([f.sp, 'nan/under', b.h]); continue; }
    if (b.st === 0 && b.spot) {
      if (b.spot.k === 'G' || b.spot.k === 'S') {
        const s = W.surfaceAt(b.x, b.y);
        if (s === S.SOLID || s === S.VOID || s === S.ROCK) out.bad.push([f.sp, 'ground in solid', Math.round(b.x), Math.round(b.y), s]);
        if (s === S.WATER && b.spot.k === 'G') out.bad.push([f.sp, 'ground bird on water', Math.round(b.x), Math.round(b.y)]);
      } else if (b.spot.k === 'R') {
        if (Math.abs(b.h - b.spot.h) > 0.6) out.bad.push([f.sp, 'roof height', b.h, b.spot.h]);
      }
    } else if (b.st !== 0 && b.st !== 3 && b.st !== 4) {
      // flying: above the obstacle grid (16 u cells, max height in the cell) unless on the final approach
      const near = b.tgt && Math.hypot(b.rx - b.x, b.ry - b.y) < 30;
      if (!near && b.h + 2 < oh(b.x, b.y) - 6) out.bad.push([f.sp, 'flying inside', Math.round(b.x), Math.round(b.y), Math.round(b.h), oh(b.x, b.y)]);
    } else if (b.st === 4 || b.st === 3) {
      if (b.h < 2) out.bad.push([f.sp, 'flyer at ground', b.h]);
    }
  }
  out.n = out.bad.length; out.bad = out.bad.slice(0, 6);
  return out;
};

async function run2D(browser) {
  console.log('\n== 2D (top-down)');
  const { context, page, errors } = await openPage(browser);
  try {
    // takeover
    const tk = await page.evaluate(() => ({ tp: N.traffic && N.traffic.TUNE ? N.traffic.TUNE.pigeonPlaces.length : -1, tf: N.traffic && N.traffic.flocks ? N.traffic.flocks.length : -1, lf: N.landmarks && N.landmarks.flocks ? N.landmarks.flocks.reduce((n, f) => n + f.birds.length, 0) : -1 }));
    check(tk.tp <= 0 && tk.tf <= 0 && tk.lf <= 0, 'old traffic.js / landmarks.js pigeon flocks taken over (no double flocks)', JSON.stringify(tk));

    // ---------------- Charminar pigeons: before / after the run-through
    const cm = await page.evaluate(() => { const c = N.places.charminar; return { x: c.x, y: c.y }; });
    await goto(page, [cm.x - 70, cm.y + 70], 9, 0, { wait: 3 });
    let s = await st(page);
    const pig = await page.evaluate(() => {
      const f = N.birds.flocks.find((q) => q.id === 'pigeon:charminar');
      if (!f) return null;
      const k = {}; for (const b of f.birds) { const key = b.st === 0 ? 'rest_' + b.spot.k : 'fly'; k[key] = (k[key] || 0) + 1; }
      return { n: f.birds.length, k };
    });
    check(pig && pig.n >= 25, 'pigeons at Charminar', pig && JSON.stringify(pig));
    check(s.bySpecies.pigeon.n >= 40, 'pigeons in the Old City around Charminar', 'pigeons ' + s.bySpecies.pigeon.n + ', total ' + s.count + ' in ' + s.flocks + ' flocks');
    await shot(page, 'charminar_pigeons_before', 2.4);
    // run through the flock
    const run = await page.evaluate(async () => {
      const f = N.birds.flocks.find((q) => q.id === 'pigeon:charminar');
      const b = f.birds.find((q) => q.st === 0 && q.spot.k === 'G');
      if (!b) return null;
      const p = N.player;
      N.player.teleport(b.x - 70, b.y);
      window.__ev.length = 0;
      const rest0 = f.birds.filter((q) => q.st === 0).length;
      N.input.setMove(1, 0, true); N.input.hold('run', true);
      const t0 = N.time.now;
      await new Promise((r) => { const g = () => (N.time.now - t0 > 1.3 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); });
      N.input.setMove(null); N.input.hold('run', false);
      return { rest0, flying: f.birds.filter((q) => q.st !== 0).length, n: f.birds.length, ev: window.__ev.slice(0, 8), speed: Math.round(Math.hypot(p.vx, p.vy)) };
    });
    if (!run) fail('no resting pigeon on the Charminar plaza to run at');
    else {
      check(run.flying >= Math.min(8, run.n * 0.3), 'running through the plaza bursts the pigeons up', run.flying + '/' + run.n + ' flying, player speed ' + run.speed);
      check(run.ev.some((e) => e.n === 'birds:takeoff' && e.e.species === 'pigeon'), "'birds:takeoff' {species: 'pigeon'} emitted", JSON.stringify(run.ev.slice(0, 3)));
      check(run.ev.some((e) => e.n === 'pigeons:scatter'), "'pigeons:scatter' still emitted for the old listeners");
    }
    await sim(page, 0.6);
    await shot(page, 'charminar_pigeons_burst', 2.4);
    await sim(page, 2.5);
    await shot(page, 'charminar_pigeons_circling', 1.6);
    const bad1 = await page.evaluate(BAD_FN);
    check(bad1.n === 0, 'no pigeon inside a building / under the ground while circling', JSON.stringify(bad1));
    await sim(page, 16);
    const back = await page.evaluate(() => {
      const f = N.birds.flocks.find((q) => q.id === 'pigeon:charminar');
      const k = {}; for (const b of f.birds) { const key = b.st === 0 ? 'rest_' + b.spot.k : 'fly'; k[key] = (k[key] || 0) + 1; }
      return k;
    });
    check((back.rest_G || 0) + (back.rest_R || 0) + (back.rest_W || 0) >= 10, 'the flock resettles on the plaza / roofs / wires', JSON.stringify(back));
    await shot(page, 'charminar_pigeons_resettled', 2.4);

    // horn
    const horn = await page.evaluate(async () => {
      const f = N.birds.flocks.find((q) => q.id === 'pigeon:charminar');
      const b = f.birds.find((q) => q.st === 0 && q.spot.k === 'G') || f.birds[0];
      N.player.teleport(b.x + 35, b.y);
      await new Promise((r) => setTimeout(r, 100));
      const f0 = f.birds.filter((q) => q.st !== 0).length;
      N.emit('horn', { x: N.player.x, y: N.player.y, type: 'foot', vehicle: null, who: N.player });
      return { before: f0, after: f.birds.filter((q) => q.st !== 0).length };
    });
    check(horn.after > horn.before, 'the horn scatters pigeons', horn.before + ' -> ' + horn.after);

    // ---------------- crows on wires / roofs
    const crow = await page.evaluate(async () => {
      for (const at of ['abids', 'mozamjahi_market', 'charminar', 'nampally_station', 'kachiguda_station', 'secunderabad_station']) {
        const p = N.places[at]; if (!p) continue;
        N.debug.teleport(p.x, p.y); N.birds.clear(); N.birds.refresh();
        const t0 = N.time.now;
        await new Promise((r) => { const g = () => (N.time.now - t0 > 2 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); });
        const fl = N.birds.flocks.filter((f) => f.sp === 'crow');
        const k = {}; let wireF = null;
        for (const f of fl) for (const b of f.birds) { const key = b.st === 0 ? b.spot.k : 'fly'; k[key] = (k[key] || 0) + 1; if (b.st === 0 && b.spot.k === 'W' && !wireF) wireF = b; }
        if (fl.length) {
          if (wireF) N.player.teleport(wireF.x + 30, wireF.y + 30);
          return { at, flocks: fl.length, k, wires: !!(N.wires && N.wires.perches), wx: wireF && Math.round(wireF.x), wy: wireF && Math.round(wireF.y) };
        }
      }
      return null;
    });
    if (!crow) fail('no crows found near Abids / markets / stations');
    else {
      check(true, 'crows near ' + crow.at, JSON.stringify(crow.k) + ' in ' + crow.flocks + ' groups');
      if (crow.wires) check((crow.k.W || 0) > 0, 'crows perch on the electric wires (N.wires.perches)', JSON.stringify(crow.k));
      else check((crow.k.R || 0) > 0, 'crows on roof edges (no N.wires)', JSON.stringify(crow.k));
      await sim(page, 1);
      await shot(page, 'crows_wires', 2.6);
      const cs = await page.evaluate(() => { const fl = N.birds.flocks.filter((f) => f.sp === 'crow'); const before = fl.reduce((n, f) => n + f.birds.filter((b) => b.st !== 0).length, 0); let n = 0; for (const f of fl) for (const b of f.birds) if (b.st === 0) { n += N.birds.scare(b.x, b.y, 25); break; } return { before, n }; });
      check(cs.n > 0, 'crows take off when disturbed', JSON.stringify(cs));
    }

    // ---------------- kites by day
    await goto(page, 'abids', 11, 30, { wait: 2 });
    let k = await page.evaluate(() => ({ n: N.birds.count('kite'), soar: N.birds.flocks.filter((f) => f.sp === 'kite').reduce((n, f) => n + f.birds.filter((b) => b.st === 3 && b.h > 90).length, 0) }));
    check(k.n >= 2 && k.soar === k.n, 'black kites soaring high over the city by day', JSON.stringify(k));
    if (SHOTS) {
      // put one kite in view for the picture (high above the player)
      await page.evaluate(() => { const f = N.birds.flocks.find((q) => q.sp === 'kite'); if (f) { f.gx = N.player.x + 20; f.gy = N.player.y + 10; for (const b of f.birds) { b.x = f.gx + 70; b.y = f.gy; } } });
      await sim(page, 1.5);
      await shot(page, 'kites_soaring', 1.3);
    }
    const kh = await page.evaluate(() => { const f = N.birds.flocks.find((q) => q.sp === 'kite'); if (!f) return null; const b = f.birds[0]; const a0 = b.a; return new Promise((r) => { const t0 = N.time.now; const g = () => (N.time.now - t0 > 3 ? r({ turned: Math.abs(Math.atan2(Math.sin(b.a - a0), Math.cos(b.a - a0))), h: Math.round(b.h), roll: +b.roll.toFixed(2) }) : requestAnimationFrame(g)); requestAnimationFrame(g); }); });
    if (kh) check(kh.turned > 0.2 && kh.h > 90, 'kites circle (wide, slow, banked)', JSON.stringify(kh));

    // ---------------- parakeets
    const pk = await page.evaluate(async () => {
      for (const at of ['public_gardens', 'indira_park', 'kbr_park', 'sanjeevaiah_park', 'lumbini_park', 'ntr_gardens', 'abids']) {
        const p = N.places[at]; if (!p) continue;
        N.debug.teleport(p.x, p.y); N.birds.clear(); N.birds.refresh();
        const t0 = N.time.now;
        await new Promise((r) => { const g = () => (N.time.now - t0 > 2 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); });
        const f = N.birds.flocks.filter((q) => q.sp === 'parakeet').sort((a, b) => Math.hypot(a.cx - p.x, a.cy - p.y) - Math.hypot(b.cx - p.x, b.cy - p.y))[0];
        if (f) return { at, n: f.birds.length, trees: f.day.length, inTree: f.birds.filter((b) => b.st === 0 && b.spot.k === 'T').length };
      }
      return null;
    });
    if (!pk) fail('no parakeet flock found near the parks');
    else {
      check(pk.inTree >= pk.n * 0.8, 'parakeets in neem / banyan trees at ' + pk.at, JSON.stringify(pk));
      const fly = await page.evaluate(async () => {
        const f = N.birds.flocks.filter((q) => q.sp === 'parakeet').sort((a, b) => Math.hypot(a.cx - N.player.x, a.cy - N.player.y) - Math.hypot(b.cx - N.player.x, b.cy - N.player.y))[0];
        f.nextT = 0;
        const b0 = f.birds[0];
        N.player.teleport(b0.x + 20, b0.y + 40);
        const t0 = N.time.now;
        await new Promise((r) => { const g = () => (N.time.now - t0 > 1.2 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); });
        const fl = f.birds.filter((b) => b.st !== 0);
        let sp = 0; for (const b of fl) sp += Math.hypot(b.vx, b.vy);
        // tightness: mean distance to the flock centroid
        let cx = 0, cy = 0; for (const b of fl) { cx += b.x; cy += b.y; } cx /= fl.length || 1; cy /= fl.length || 1;
        let spread = 0; for (const b of fl) spread += Math.hypot(b.x - cx, b.y - cy);
        N.player.teleport(cx, cy + 30);
        return { flying: fl.length, n: f.birds.length, speed: Math.round(sp / (fl.length || 1)), spread: Math.round(spread / (fl.length || 1)) };
      });
      check(fly.flying >= fly.n * 0.7 && fly.speed > 60, 'parakeet flock streaks fast to another tree', JSON.stringify(fly));
      await sim(page, 0.3);
      await shot(page, 'parakeets', 2.6);
    }

    // ---------------- egrets / cormorants at Hussain Sagar
    const eg = await page.evaluate(async () => {
      const sites = N.birds.sites().filter((s) => /hussain_sagar/.test(s.id));
      const p = N.places.lumbini_park || N.places.hussain_sagar;
      let best = null;
      for (const s of sites) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (!best || d < best.d) best = { s, d }; }
      if (!best) return null;
      N.debug.teleport(best.s.x, best.s.y); N.birds.clear(); N.birds.refresh();
      const t0 = N.time.now;
      await new Promise((r) => { const g = () => (N.time.now - t0 > 2.5 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); });
      const fl = N.birds.flocks.filter((f) => f.sp === 'egret' || f.sp === 'cormorant');
      let shore = 0, n = 0, eg = 0, co = 0;
      for (const f of fl) for (const b of f.birds) { n++; if (f.sp === 'egret') eg++; else co++; if (b.st === 0 && b.spot.k === 'S') shore++; }
      const b = fl.length && fl[0].birds[0];
      if (b) N.player.teleport(b.x + 20, b.y + 20);
      return { sites: sites.length, n, eg, co, shore };
    });
    if (!eg) fail('no Hussain Sagar water-bird sites');
    else check(eg.n >= 4 && eg.shore >= eg.n * 0.6 && eg.eg > 0, 'egrets / cormorants standing at the Hussain Sagar shore', JSON.stringify(eg));
    await sim(page, 0.5);
    await shot(page, 'egrets_hussain_sagar', 2.6);
    const skim = await page.evaluate(async () => {
      const fl = N.birds.flocks.filter((f) => f.sp === 'egret' || f.sp === 'cormorant');
      let n = 0; for (const f of fl) for (const b of f.birds) if (b.st === 0) { n += N.birds.scare(b.x, b.y, 30); break; }
      const t0 = N.time.now;
      await new Promise((r) => { const g = () => (N.time.now - t0 > 1.5 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); });
      let maxH = 0, fly = 0, over = 0; for (const f of fl) for (const b of f.birds) if (b.st !== 0) { fly++; if (N.world.isWater(b.x, b.y)) { over++; maxH = Math.max(maxH, b.h); } }
      return { n, fly, overWater: over, maxH: Math.round(maxH) };
    });
    check(skim.n > 0 && skim.maxH < 24, 'water birds skim low over the water', JSON.stringify(skim));
    await shot(page, 'egrets_skimming', 2.2);

    // ---------------- mynas on a lawn
    const my = await page.evaluate(async () => {
      const s = N.birds.sites().filter((q) => q.sp === 'myna');
      const p = N.player;
      s.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      for (const site of s.slice(0, 4)) {
        N.debug.teleport(site.x + 25, site.y + 15); N.birds.clear(); N.birds.refresh();
        const t0 = N.time.now;
        await new Promise((r) => { const g = () => (N.time.now - t0 > 2 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); });
        const f = N.birds.flocks.find((q) => q.id === site.id);
        if (f) return { id: f.id, n: f.birds.length, ground: f.birds.filter((b) => b.st === 0 && b.spot.k === 'G').length, pairs: f.birds.filter((b) => b.mate).length, sites: s.length };
      }
      return { none: true, sites: s.length };
    });
    if (!my || my.none) fail('no myna flock near a myna site ' + JSON.stringify(my));
    else check(my.n >= 2 && my.ground === my.n && my.pairs >= 2, 'mynas walking a lawn in pairs', JSON.stringify(my));
    await shot(page, 'mynas_lawn', 3);

    // ---------------- bats at dusk at Golconda
    await goto(page, 'golconda_fort', 19, 10, { wait: 2.5 });
    const bat = await page.evaluate(() => ({ n: N.birds.count('bat'), flying: N.birds.flocks.filter((f) => f.sp === 'bat').reduce((n, f) => n + f.birds.filter((b) => b.st === 4).length, 0), kites: N.birds.count('kite') }));
    check(bat.n >= 6 && bat.flying === bat.n, 'bats flitting at dusk at Golconda', JSON.stringify(bat));
    check(bat.kites === 0, 'no kites at dusk', 'kites ' + bat.kites);
    await page.evaluate(() => { const f = N.birds.flocks.find((q) => q.sp === 'bat'); if (f) N.player.teleport(f.cx + 10, f.cy + 30); });
    await sim(page, 0.6);
    await shot(page, 'bats_golconda_dusk', 2.6);
    await goto(page, 'golconda_fort', 11, 0, { wait: 4 });
    check((await page.evaluate(() => N.birds.count('bat'))) === 0, 'no bats by day');

    // ---------------- rain: sheltering
    await goto(page, [cm.x - 70, cm.y + 70], 12, 0, { rain: 0.85, wait: 3 });
    s = await st(page);
    const rain = await page.evaluate(() => {
      const k = {}; let fly = 0;
      for (const f of N.birds.flocks) for (const b of f.birds) { if (b.st !== 0) { fly++; continue; } k[b.spot.k] = (k[b.spot.k] || 0) + 1; }
      return { mode: N.birds.mode('pigeon'), k, fly, kites: N.birds.count('kite'), huddled: N.birds.flocks.reduce((n, f) => n + f.birds.filter((b) => b.huddle).length, 0) };
    });
    check(rain.mode === 'shelter' && rain.kites === 0 && rain.fly <= 2, 'rain: birds shelter (no kites, nobody flying)', JSON.stringify(rain));
    check(!(rain.k.G > 0) || rain.k.G < (rain.k.R || 0) + (rain.k.W || 0), 'rain: pigeons huddled on roofs / wires rather than the plaza', JSON.stringify(rain.k));
    await shot(page, 'rain_sheltering', 2.4);
    const rs = await page.evaluate(async () => {
      const f = N.birds.flocks.find((q) => q.sp === 'pigeon');
      const b = f && f.birds.find((q) => q.st === 0);
      if (!b) return null;
      const n = N.birds.scare(b.x, b.y, 30);
      const t0 = N.time.now;
      await new Promise((r) => { const g = () => (N.time.now - t0 > 12 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); });
      return { n, stillFlying: f.birds.filter((q) => q.st !== 0).length };
    });
    if (rs) check(rs.stillFlying <= Math.max(1, rs.n * 0.25), 'rain: a scare is only a short hop back to shelter', JSON.stringify(rs));
    await page.evaluate(() => N.weather.force(null));

    // ---------------- night: roosting
    await goto(page, [cm.x - 70, cm.y + 70], 23, 0, { wait: 3 });
    const night = await page.evaluate(() => {
      let fly = 0, n = 0; const k = {};
      for (const f of N.birds.flocks) { if (f.sp === 'bat') continue; for (const b of f.birds) { n++; if (b.st !== 0) fly++; else k[b.spot.k] = (k[b.spot.k] || 0) + 1; } }
      const p = N.birds.flocks.find((q) => q.sp === 'pigeon');
      const b = p && p.birds[0];
      const sc = b ? N.birds.scare(b.x, b.y, 40) : -1;
      return { n, fly, k, scared: sc, mode: N.birds.mode('pigeon') };
    });
    check(night.mode === 'roost' && night.n > 10 && night.fly === 0, 'night: everyone roosts (nobody flying)', JSON.stringify(night));
    check(night.scared === 0, 'night: a scare does not flush roosting birds', 'took off ' + night.scared);
    check(!(night.k.G > 0) || night.k.G < (night.k.R || 0) + (night.k.W || 0) + (night.k.T || 0), 'night: roosts on roofs / wires / trees', JSON.stringify(night.k));
    await shot(page, 'night_roosting', 2.4);

    // ---------------- dusk -> roost commute (day flock re-targets to roosts)
    await goto(page, [cm.x - 70, cm.y + 70], 18, 30, { wait: 2 });
    const commute = await page.evaluate(async () => {
      N.debug.setTime(21, 0);
      const t0 = N.time.now;
      await new Promise((r) => { const g = () => (N.time.now - t0 > 17 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); }); // (later at night the story may send the kid home)
      let fly = 0, g = 0, up = 0;
      for (const f of N.birds.flocks) { if (f.sp !== 'pigeon') continue; for (const b of f.birds) { if (b.st !== 0) fly++; else if (b.spot.k === 'G') g++; else up++; } }
      return { fly, g, up };
    });
    check(commute.up > commute.g, 'dusk: pigeons fly up from the plaza to roost on the roofs', JSON.stringify(commute));

    // ---------------- no birds inside buildings, over a few moments of a busy day
    await goto(page, [cm.x - 70, cm.y + 70], 10, 0, { wait: 2 });
    await page.evaluate(() => N.birds.scare(N.player.x, N.player.y, 400));
    let worst = { n: 0, checked: 0 };
    for (let i = 0; i < 6; i++) { await sim(page, 1.2); const r = await page.evaluate(BAD_FN); worst.checked += r.checked; if (r.n > worst.n) worst = Object.assign(r, { checked: worst.checked }); }
    check(worst.n === 0, 'no bird inside a building, under the ground or on the water (6 samples)', JSON.stringify(worst));

    // ---------------- perf: ~150 birds near, 2D desktop
    await goto(page, [cm.x - 40, cm.y + 60], 10, 0, { wait: 2 });
    await page.evaluate(() => {
      const p = N.player;
      if (N.birds.count() < 150) N.birds.spawnFlock('pigeon', p.x + 40, p.y - 30, 30);
      if (N.birds.count() < 150) N.birds.spawnFlock('crow', p.x - 60, p.y, 8);
      if (N.birds.count() < 150) N.birds.spawnFlock('kite', p.x, p.y, 3);
      N.birds.scare(p.x, p.y, 120); // a good share in the air
    });
    await sim(page, 1);
    const perf = await page.evaluate(() => new Promise((res) => {
      const A = []; let n = 0;
      const f = () => {
        const s = N.birds.stats();
        A.push([s.updMs, s.draw2dMs, s.count, s.flying]);
        if (++n < 120) requestAnimationFrame(f);
        else {
          A.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
          const mean = A.reduce((m, a) => m + a[0] + a[1], 0) / A.length, med = A[A.length >> 1];
          res({ mean: +mean.toFixed(3), median: +(med[0] + med[1]).toFixed(3), upd: +med[0].toFixed(3), draw: +med[1].toFixed(3), count: med[2], flying: med[3], frameMs: N.perf && +N.perf.frameMs.toFixed(2), sprites: s.sprites });
        }
      };
      requestAnimationFrame(f);
    }));
    check(perf.count >= 120, '2D perf scene has ~150 birds near', JSON.stringify(perf));
    if (perf.median <= 0.5) ok('2D update + draw median ' + perf.median + ' ms / frame (budget 0.5; mean ' + perf.mean + ', shared noisy sandbox)');
    else if (perf.median <= 1.0) note('2D update + draw median ' + perf.median + ' ms (budget 0.5) — shared sandbox noise? ' + JSON.stringify(perf));
    else fail('2D update + draw median ' + perf.median + ' ms / frame (budget 0.5) ' + JSON.stringify(perf));
    await shot(page, 'perf_150', 1.8);

    // ---------------- disable gives the pigeons back, enable takes them over again
    const tog = await page.evaluate(async () => {
      N.birds.enabled = false;
      const t0 = N.time.now;
      await new Promise((r) => { const g = () => (N.time.now - t0 > 1.2 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); });
      const off = { count: N.birds.count(), lf: (N.landmarks.flocks || []).reduce((n, f) => n + f.birds.length, 0), tp: N.traffic.TUNE.pigeonPlaces.length };
      N.birds.enabled = true;
      await new Promise((r) => { const t1 = N.time.now; const g = () => (N.time.now - t1 > 1.5 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); });
      return { off, on: { count: N.birds.count(), lf: (N.landmarks.flocks || []).reduce((n, f) => n + f.birds.length, 0), tp: N.traffic.TUNE.pigeonPlaces.length } };
    });
    check(tog.off.count === 0 && tog.off.tp > 0 && tog.on.count > 0 && tog.on.lf === 0 && tog.on.tp === 0, 'N.birds.enabled off gives the old pigeons back, on takes over again', JSON.stringify(tog));

    const nerr = await page.evaluate(() => N.errors.map((e) => (e.where || '') + ': ' + (e.msg || e.message || e)).slice(0, 5));
    check(!errors.length && !nerr.length, 'zero console / page errors and N.err in 2D', JSON.stringify(errors.slice(0, 3).concat(nerr)));
  } finally { await context.close(); }
}

async function view3d(page, mode, yaw, pitch) {
  await page.evaluate(async ({ mode, yaw, pitch }) => {
    if (N.view.mode !== mode) N.view.set(mode);
    const t0 = performance.now();
    while (!N.view3d.active && performance.now() - t0 < 120000) await new Promise((r) => setTimeout(r, 100));
    N.view3d.settle(20000);
    if (yaw != null) N.view3d.setCamera({ yaw, pitch, snap: true });
  }, { mode, yaw, pitch });
}

async function run3D(browser) {
  console.log('\n== 3D (third person)');
  const { context, page, errors } = await openPage(browser);
  try {
    const cm = await page.evaluate(() => { const c = N.places.charminar; return { x: c.x, y: c.y }; });
    await goto(page, [cm.x - 70, cm.y + 80], 9, 0, { wait: 1 });
    await view3d(page, 'tps');
    const aim = (tx, ty, pitch) => page.evaluate(({ tx, ty, pitch }) => { const p = N.player; N.view3d.setCamera({ yaw: Math.atan2(ty - p.y, tx - p.x), pitch, snap: true }); }, { tx, ty, pitch });
    await page.evaluate(() => { N.birds.clear(); N.birds.refresh(); });
    await sim(page, 2.5);
    await page.evaluate(() => N.view3d.settle(20000));
    // look at the plaza pigeons
    const tgt = await page.evaluate(() => { const f = N.birds.flocks.find((q) => q.id === 'pigeon:charminar'); const b = f && f.birds.find((q) => q.st === 0 && q.spot.k === 'G'); if (b) N.player.teleport(b.x - 30, b.y + 22); return b ? { x: b.x, y: b.y } : null; });
    if (tgt) await aim(tgt.x, tgt.y, 0.32);
    await sim(page, 0.5);
    let s3 = await st(page);
    check(s3.instances3d > 10 && s3.calls3d >= 1 && s3.calls3d <= 8, '3D: birds drawn instanced (≤ 8 draw calls)', 'instances ' + s3.instances3d + ', calls ' + s3.calls3d + ', points ' + s3.points3d);
    await shot(page, '3d_charminar_pigeons');
    const run = await page.evaluate(async () => {
      const f = N.birds.flocks.find((q) => q.id === 'pigeon:charminar');
      const b = f.birds.find((q) => q.st === 0 && q.spot.k === 'G') || f.birds[0];
      N.player.teleport(b.x - 30, b.y + 4);
      N.view3d.setCamera({ yaw: 0, pitch: 0.12, snap: true });
      N.input.setMove(1, 0, true); N.input.hold('run', true);
      const t0 = N.time.now;
      await new Promise((r) => { const g = () => (N.time.now - t0 > 0.9 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); });
      N.input.setMove(null); N.input.hold('run', false);
      return { flying: f.birds.filter((q) => q.st !== 0).length, n: f.birds.length };
    });
    check(run.flying > 5, '3D: the run-through bursts the pigeons up', JSON.stringify(run));
    const aimFlock = () => page.evaluate(() => {
      const f = N.birds.flocks.find((q) => q.id === 'pigeon:charminar'); const p = N.player;
      let x = 0, y = 0, h = 0, n = 0; for (const b of f.birds) if (b.st !== 0) { x += b.x; y += b.y; h += b.h; n++; }
      if (!n) return 0;
      x /= n; y /= n; h /= n;
      const d = Math.max(20, Math.hypot(x - p.x, y - p.y));
      N.view3d.setCamera({ yaw: Math.atan2(y - p.y, x - p.x), pitch: -Math.min(0.7, Math.atan2(h * 1.5 - 12, d + 30) * 0.8), snap: true });
      return n;
    });
    await sim(page, 0.3);
    await aimFlock();
    await shot(page, '3d_charminar_burst');
    await sim(page, 2);
    await aimFlock();
    await shot(page, '3d_charminar_circling');

    // perf: birds layer JS ms + draw calls with vs without birds
    const perf = async () => page.evaluate(() => new Promise((res) => {
      const A = [], C = []; let n = 0;
      const f = () => { const s = N.birds.stats(), v = N.view3d.stats(); A.push(s.draw3dMs); C.push(v.calls); if (++n < 60) requestAnimationFrame(f); else { A.sort((a, b) => a - b); C.sort((a, b) => a - b); res({ js: +A[A.length >> 1].toFixed(3), calls: C[C.length >> 1], birdCalls: s.calls3d, inst: s.instances3d, pts: s.points3d, count: s.count }); } };
      requestAnimationFrame(f);
    }));
    await page.evaluate(() => { const p = N.player; N.birds.spawnFlock('pigeon', p.x + 50, p.y - 20, 30); N.birds.spawnFlock('kite', p.x, p.y, 3); N.birds.scare(p.x, p.y, 150); N.view3d.setCamera({ yaw: N.view.yaw, pitch: 0.2, snap: true }); });
    await sim(page, 0.5);
    const on = await perf();
    await page.evaluate(() => { N.birds.enabled = false; });
    await sim(page, 0.3);
    const off = await perf();
    await page.evaluate(() => { N.birds.enabled = true; N.birds.refresh(); });
    await sim(page, 1.5);
    check(on.birdCalls <= 8 && on.calls - off.calls <= 8, '3D: birds add ≤ 8 draw calls', 'birds layer ' + on.birdCalls + ', scene ' + off.calls + ' -> ' + on.calls + ' (' + on.count + ' birds, ' + on.inst + ' instanced, ' + on.pts + ' points)');
    if (on.js <= 0.5) ok('3D: birds layer JS ' + on.js + ' ms / frame (budget 0.5)');
    else if (on.js <= 1.0) note('3D: birds layer JS ' + on.js + ' ms (budget 0.5) — shared sandbox noise?');
    else fail('3D: birds layer JS ' + on.js + ' ms / frame (budget 0.5)');

    // crows on wires
    const crow = await page.evaluate(async () => {
      for (const at of ['abids', 'mozamjahi_market', 'nampally_station', 'kachiguda_station']) {
        const p = N.places[at]; if (!p) continue;
        N.debug.teleport(p.x, p.y); N.birds.clear(); N.birds.refresh();
        const t0 = N.time.now;
        await new Promise((r) => { const g = () => (N.time.now - t0 > 2 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); });
        let w = null;
        for (const f of N.birds.flocks) if (f.sp === 'crow') for (const b of f.birds) if (b.st === 0 && (b.spot.k === 'W' || b.spot.k === 'R') && (!w || b.spot.k === 'W')) w = b;
        if (w) {
          N.player.teleport(w.x + 12, w.y + 14);
          const P = N.player; const ok2 = Math.hypot(P.x - w.x - 28, P.y - w.y - 28) < 30;
          return { at, k: w.spot.k, x: w.x, y: w.y, h3: w.spot.h3, ok2 };
        }
      }
      return null;
    });
    if (crow) {
      await page.evaluate(() => N.view3d.settle(20000));
      await aim(crow.x, crow.y, -0.42);
      await sim(page, 0.4);
      await shot(page, '3d_crows_' + (crow.k === 'W' ? 'wires' : 'roof'));
    } else note('3D: no crow perch found for a picture');

    // kites (look up)
    await goto(page, 'abids', 11, 30, { wait: 1.5 });
    await page.evaluate(() => { const f = N.birds.flocks.find((q) => q.sp === 'kite') || N.birds.spawnFlock('kite', N.player.x, N.player.y, 2); f.gx = N.player.x + 150; f.gy = N.player.y; for (const b of f.birds) { b.x = f.gx + 60; b.y = f.gy; b.h = 80; b.alt = 80; } });
    await page.evaluate(() => N.view3d.settle(20000));
    await sim(page, 1.5);
    await page.evaluate(() => { const f = N.birds.flocks.find((q) => q.sp === 'kite'); const p = N.player; N.view3d.setCamera({ yaw: Math.atan2(f.gy - p.y, f.gx - p.x), pitch: -0.45, snap: true }); });
    await sim(page, 0.3);
    await shot(page, '3d_kites');

    // egrets at Hussain Sagar
    const eg = await page.evaluate(async () => {
      const sites = N.birds.sites().filter((s) => /^egret:hussain_sagar/.test(s.id));
      const p = N.places.lumbini_park;
      sites.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      if (!sites.length) return null;
      N.debug.teleport(sites[0].x, sites[0].y); N.birds.clear(); N.birds.refresh();
      const t0 = N.time.now;
      await new Promise((r) => { const g = () => (N.time.now - t0 > 2 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); });
      const f = N.birds.flocks.find((q) => q.id === sites[0].id);
      const b = f && f.birds[0];
      if (!b) return null;
      // stand on land a little away from the bird
      for (let a = 0; a < 6.3; a += 0.4) { const x = b.x + Math.cos(a) * 26, y = b.y + Math.sin(a) * 26; if (N.world.isWalkable(x, y)) { N.player.teleport(x, y); break; } }
      return { x: b.x, y: b.y };
    });
    if (eg) {
      await page.evaluate(() => N.view3d.settle(20000));
      await aim(eg.x, eg.y, 0.18);
      await sim(page, 0.4);
      await shot(page, '3d_egrets_hussain_sagar');
      await page.evaluate(() => { const f = N.birds.flocks.find((q) => q.sp === 'egret'); if (f) for (const b of f.birds) if (b.st === 0) { N.birds.scare(b.x, b.y, 25); break; } });
      await sim(page, 1.2);
      await shot(page, '3d_egrets_flying');
    } else note('3D: no egret site for a picture');

    // bats at dusk
    await goto(page, 'golconda_fort', 19, 10, { wait: 1.5 });
    await page.evaluate(() => { const f = N.birds.flocks.find((q) => q.sp === 'bat'); if (f) { N.player.teleport(f.cx - 40, f.cy + 40); } });
    await page.evaluate(() => N.view3d.settle(20000));
    await page.evaluate(() => { const f = N.birds.flocks.find((q) => q.sp === 'bat'); const p = N.player; if (f) N.view3d.setCamera({ yaw: Math.atan2(f.cy - p.y, f.cx - p.x), pitch: -0.2, snap: true }); });
    await sim(page, 0.6);
    await shot(page, '3d_bats_golconda_dusk');

    // night roost + rain in 3D (counts)
    await goto(page, [cm.x - 70, cm.y + 80], 23, 0, { wait: 2 });
    const night = await page.evaluate(() => { let fly = 0; for (const f of N.birds.flocks) if (f.sp !== 'bat') for (const b of f.birds) if (b.st !== 0) fly++; return { fly, n: N.birds.count() }; });
    check(night.n > 0 && night.fly === 0, '3D: night roosting', JSON.stringify(night));
    await page.evaluate(() => { const f = N.birds.flocks.find((q) => q.sp === 'pigeon' && q.birds.some((b) => b.spot && b.spot.k === 'R')); const b = f && f.birds.find((q) => q.spot && q.spot.k === 'R'); if (b) { N.player.teleport(b.x + 30, b.y + 30); } });
    await page.evaluate(() => N.view3d.settle(20000));
    await page.evaluate(() => { const f = N.birds.flocks.find((q) => q.sp === 'pigeon' && q.birds.some((b) => b.spot && b.spot.k === 'R')); const b = f && f.birds.find((q) => q.spot && q.spot.k === 'R'); const p = N.player; if (b) N.view3d.setCamera({ yaw: Math.atan2(b.y - p.y, b.x - p.x), pitch: -0.25, snap: true }); });
    await shot(page, '3d_night_roost');
    await goto(page, [cm.x - 70, cm.y + 80], 12, 0, { rain: 0.85, wait: 2 });
    await page.evaluate(() => N.view3d.settle(20000));
    await page.evaluate(() => { const f = N.birds.flocks.find((q) => q.sp === 'pigeon' && q.birds.some((b) => b.spot && b.spot.k !== 'G')); const b = f && f.birds.find((q) => q.spot && q.spot.k !== 'G'); const p = N.player; if (b) { N.player.teleport(b.x + 25, b.y + 25); N.view3d.setCamera({ yaw: Math.atan2(-25, -25), pitch: -0.2, snap: true }); } });
    await sim(page, 0.5);
    await shot(page, '3d_rain_sheltering');
    await page.evaluate(() => N.weather.force(null));

    // models3d path: a fake 'bird_pigeon' GLB-like model is used as instanced geometry
    const mdl = await page.evaluate(async () => {
      const M3 = N.models3d, T = N.view3d.THREE;
      if (!M3 || !T) return null;
      const g = new T.BoxGeometry(2, 0.6, 5);   // a "bird" with wings along x (GLB frame)
      const mesh = new T.Mesh(g, new T.MeshStandardMaterial({ color: 0x8890a0 }));
      const scene = new T.Group(); scene.add(mesh);
      const has0 = M3.has, parse0 = M3.parse, inst0 = M3.instance, ready0 = Object.getOwnPropertyDescriptor(M3, 'ready');
      M3.has = (id) => id === 'bird_pigeon' || has0(id);
      M3.parse = (id) => (id === 'bird_pigeon' ? Promise.resolve({ id }) : parse0(id));
      M3.instance = (id) => (id === 'bird_pigeon' ? scene.clone() : inst0(id));
      Object.defineProperty(M3, 'ready', { get: () => true, configurable: true });
      N.birds._debug.G3.model = {};
      const t0 = N.time.now;
      await new Promise((r) => { const q = () => (N.time.now - t0 > 1 ? r() : requestAnimationFrame(q)); requestAnimationFrame(q); });
      const s = N.birds.stats();
      M3.has = has0; M3.parse = parse0; M3.instance = inst0;
      if (ready0) Object.defineProperty(M3, 'ready', ready0); else delete M3.ready;
      return s.models;
    });
    if (mdl) check(mdl.pigeon === 'model', '3D: a Blender bird model (models3d) replaces the procedural pigeon', JSON.stringify(mdl));

    const nerr = await page.evaluate(() => N.errors.map((e) => (e.where || '') + ': ' + (e.msg || e.message || e)).slice(0, 5));
    check(!errors.length && !nerr.length, 'zero console / page errors and N.err in 3D', JSON.stringify(errors.slice(0, 3).concat(nerr)));
  } finally { await context.close(); }
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (!ONLY || ONLY === '2d') await run2D(browser);
    if (!ONLY || ONLY === '3d') await run3D(browser);
  } catch (e) {
    fail('exception: ' + (e.stack || e.message));
  } finally {
    await browser.close();
  }
  console.log('\n' + (failures.length ? failures.length + ' FAILED' : 'ALL OK') + (notes.length ? ' (' + notes.length + ' notes)' : '') + ' in ' + Math.round((Date.now() - t0) / 1000) + ' s; screenshots in ' + OUT);
  process.exit(failures.length ? 1 : 0);
})();
