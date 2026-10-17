/* NOSTALGIA — tests/atmos_weather2d.cjs (src/weather.js: 2D weather, rain life, weather gameplay)
 * Headless Chromium (Playwright, globally installed). Hermetic: Google Fonts stubbed, three.js routed to the
 * vendored copy (the 3D view is not used here, the route only keeps the page offline).
 *
 *   screenshots (1280x720, internal 640x360, the real pixel look) -> tests/out/atmos/weather2d_<place>_<time>_<wx>.png
 *     places: Old City (charminar), Abids (abids), a colony lane (giver_himayatnagar)
 *     times:  day 12:00, dusk 18:45, night 21:30   x   weather: dry, rain (0.75), storm (rain 1 + storm 1)
 *     + winter dawn mist (06:10, mist 0.85) at each place, a lightning frame, the paper boat afloat
 *   checks: 2D rain drawing live (drops / splashes / reflections / halos / fog banks counted), umbrellas open
 *     + shelters taken in a downpour, raincoats, autos' covers, traffic cruise slowed; paper boat offer ->
 *     ACTION -> drifts -> reward + 'paperboat' event; braking distance dry vs wet (cycle, Scooty, Chetak, car);
 *     the Chappal Meter drops a level sooner unseen in heavy rain; chai in the rain bonus; perf: the weather's
 *     own 2D draw ms (N.weather2d.stats.ms) vs the whole frame in a dense night downpour at Abids, desktop
 *     960x540 and phone portrait 390x844; zero console errors / page errors / N.err.
 *   node tests/atmos_weather2d.cjs   SHOTS=0 (no png)   ONLY=shots,gameplay,perf   SW=1 (SwiftShader GPU args)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'atmos');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_PATH = path.join(ROOT, 'vendor/three/three.min.js');
const ARGS = process.env.SW ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [];
const SHOTS = process.env.SHOTS !== '0';
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg + (detail ? ' (' + detail + ')' : '')); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);

async function openPage(browser, viewport, opts) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: (opts && opts.dpr) || 1, hasTouch: !!(opts && opts.touch), isMobile: !!(opts && opts.touch) });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  if (fs.existsSync(THREE_PATH)) await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(THREE_PATH, 'utf8') }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    if (N.world.potholes && N.world.potholes.ensure) N.world.potholes.ensure();
    N.debug.freezeClock(true);
    N.debug.god(true);
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
  });
  return { context, page, errors };
}
const nErrs = (page) => page.evaluate(() => (N.errors || []).map((e) => e.where + ': ' + (e.msg || e.message || e)).slice(0, 8));

async function setScene(page, s) {
  await page.evaluate((s) => {
    N.debug.teleport(s.at);
    N.debug.setTime(s.h, s.m || 0);
    N.weather.force(Object.assign({ rain: 0, storm: 0, mist: 0 }, s.wx, s.wx.rain ? {} : { wet: 0 }));
    N.wind.force(s.wind || { strength: s.wx.storm ? 0.9 : s.wx.rain ? 0.45 : 0.25, dir: 0.5 });
  }, s);
  // let traffic fill in, splashes build up, people open umbrellas
  await page.waitForTimeout(s.wait || 2200);
  await frames(page, 3);
}

const PLACES = [['oldcity', 'charminar'], ['abids', 'abids'], ['colony', 'giver_himayatnagar']];
const TIMES = [['day', 12, 0], ['dusk', 18, 45], ['night', 21, 30]];
const WXS = [['dry', {}], ['rain', { rain: 0.75 }], ['storm', { rain: 1, storm: 1 }]];

async function screenshots(browser) {
  console.log('\n== screenshots (1280x720)');
  const { context, page, errors } = await openPage(browser, { width: 1280, height: 720 });
  const counts = [];
  for (const [pn, at] of PLACES) {
    for (const [tn, h, m] of TIMES) {
      for (const [wn, wx] of WXS) {
        await setScene(page, { at, h, m, wx, wait: wn === 'dry' ? 1200 : 2200 });
        const st = await page.evaluate(() => Object.assign({}, N.weather2d.stats));
        counts.push([pn, tn, wn, st]);
        if (SHOTS) await page.screenshot({ path: path.join(OUT, 'weather2d_' + pn + '_' + tn + '_' + wn + '.png') });
      }
    }
    await setScene(page, { at, h: 6, m: 10, wx: { mist: 0.85 }, wind: { strength: 0.12, dir: 0.4 }, wait: 1800 });
    const st = await page.evaluate(() => Object.assign({}, N.weather2d.stats));
    counts.push([pn, 'dawn', 'mist', st]);
    if (SHOTS) await page.screenshot({ path: path.join(OUT, 'weather2d_' + pn + '_dawn_mist.png') });
  }
  const get = (p, t, w) => counts.find((c) => c[0] === p && c[1] === t && c[2] === w)[3];
  check(get('abids', 'day', 'dry').drops === 0 && get('abids', 'day', 'rain').drops > 100, 'rain streaks only while it rains', 'dry ' + get('abids', 'day', 'dry').drops + ', rain ' + get('abids', 'day', 'rain').drops);
  check(get('abids', 'day', 'storm').drops > get('abids', 'day', 'rain').drops, 'a storm rains harder than a shower', get('abids', 'day', 'storm').drops + ' > ' + get('abids', 'day', 'rain').drops);
  check(get('abids', 'night', 'rain').splashes > 40, 'splash rings on the ground', String(get('abids', 'night', 'rain').splashes));
  check(get('abids', 'night', 'rain').refl > 5 && get('abids', 'night', 'dry').refl === 0, 'wet-road reflections at night only when wet', 'rain ' + get('abids', 'night', 'rain').refl + ', dry ' + get('abids', 'night', 'dry').refl);
  check(get('abids', 'night', 'rain').halos > 5, 'misty halos round the lights in the rain', String(get('abids', 'night', 'rain').halos));
  check(counts.filter((c) => c[2] === 'mist').every((c) => c[3].banks > 3), 'drifting fog banks at a misty dawn', counts.filter((c) => c[2] === 'mist').map((c) => c[0] + ' ' + c[3].banks).join(', '));
  check(get('abids', 'day', 'rain').umbrellas > 0, 'umbrellas out in the rain', String(get('abids', 'day', 'rain').umbrellas));

  // lightning: strike right by the player, freeze game time so the frame holds, grab it
  await setScene(page, { at: 'abids', h: 21, m: 30, wx: { rain: 1, storm: 1 }, wait: 1500 });
  const lit = await page.evaluate(async () => {
    const seen = [];
    const on = (s) => seen.push(s);
    N.on('weather:lightning', on);
    N.weather.strike(N.player.x + 60, N.player.y - 40, 1);
    N.time.scale = 0;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    N.off('weather:lightning', on);
    return { seen: seen.length, flash: N.weather.flash };
  });
  check(lit.seen === 1 && lit.flash > 0.8, "a lightning strike fires 'weather:lightning' and flashes", JSON.stringify(lit));
  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'weather2d_lightning.png') });
  await page.evaluate(() => { N.time.scale = 1; });

  // rain life at Abids in a downpour: shelters, raincoats, auto covers, slower cruise
  await setScene(page, { at: 'abids', h: 17, m: 0, wx: { rain: 1 }, wait: 6000 });
  const life = await page.evaluate(() => {
    const T = N.traffic, st = N.weather2d.stats;
    const autos = T.vehicles.filter((v) => v.type === 'auto' && v._wxCov != null);
    const trs = T.vehicles.filter((v) => v.tr && v.tr._wxF != null);
    return { sheltered: st.sheltered, umbrellas: st.umbrellas, coats: st.coats, peds: T.peds.length, autos: autos.length, autoCov: autos.length ? Math.max(...autos.map((v) => v._wxCov)) : -1, trafficMul: N.weather2d.trafficMul, slowed: trs.filter((v) => v.tr._wxF < 0.9).length, traffic: trs.length };
  });
  check(life.sheltered + life.umbrellas > 0, 'in a downpour people shelter or walk under umbrellas', JSON.stringify(life));
  check(life.trafficMul < 0.85 && (life.traffic === 0 || life.slowed > 0), 'traffic slows in heavy rain', 'cruise x' + life.trafficMul.toFixed(2) + ', ' + life.slowed + '/' + life.traffic);
  if (life.autos) check(life.autoCov > 0.3, 'autos roll their side covers down', 'cover ' + life.autoCov.toFixed(2));
  if (SHOTS) {
    // a close look: zoom in on the player
    await page.evaluate(() => { N.render.baseZoom = 2; });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, 'weather2d_rainlife_closeup.png') });
    await page.evaluate(() => { N.render.baseZoom = 1; });
  }
  const errs = await nErrs(page);
  check(!errors.length && !errs.length, 'screenshots: zero errors', errors.concat(errs).slice(0, 4).join(' | '));
  await context.close();
}

async function gameplay(browser) {
  console.log('\n== gameplay (960x540)');
  const { context, page, errors } = await openPage(browser, { width: 960, height: 540 });

  // ---- braking distance: dry vs wet road, same start speed, brakes on (physics stepped directly)
  const brake = await page.evaluate(() => {
    N.traffic.enabled = false; N.traffic.clear();
    const roads = N.world.data.roads.filter((r) => r.kind === 'arterial' || r.kind === 'bund');
    let best = null, bl = 0;
    for (const r of roads) for (let i = 0; i + 1 < r.pts.length; i++) { const a = r.pts[i], b = r.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > bl) { bl = L; best = [a, b]; } }
    const [a, b] = best, ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    N.debug.teleport(a[0] + Math.cos(ang) * 60 + Math.sin(ang) * 40, a[1] + Math.sin(ang) * 60 - Math.cos(ang) * 40);
    const potAt = N.world.potholeAt; N.world.potholeAt = () => null; // keep potholes out of the measurement
    const VS = N.systems.get('vehicles');
    const WS = N.systems.get('weather2d');
    const scale0 = N.time.scale; N.time.scale = 0;
    const measure = (type, v0) => {
      const v = N.vehicles.spawn(type, a[0] + Math.cos(ang) * 80, a[1] + Math.sin(ang) * 80, ang, { driver: true });
      v.controller = (vv) => { vv.ctl.throttle = 0; vv.ctl.steer = 0; vv.ctl.brake = true; };
      v.vx = Math.cos(ang) * v0; v.vy = Math.sin(ang) * v0; v.speed = v0;
      const x0 = v.x, y0 = v.y;
      let t = 0;
      for (let i = 0; i < 2000 && Math.hypot(v.vx, v.vy) > 0.5; i++) { VS.update(1 / 120); t += 1 / 120; }
      const d = Math.hypot(v.x - x0, v.y - y0);
      N.vehicles.remove(v);
      return { d: +d.toFixed(1), t: +t.toFixed(2) };
    };
    const types = ['hero_cycle', 'scooty', 'chetak', 'ambassador'];
    const out = {};
    for (const wx of ['dry', 'wet']) {
      N.weather.force(wx === 'dry' ? { rain: 0, wet: 0 } : { rain: 0.8 });
      WS.update(1 / 60);
      for (const ty of types) { const v0 = Math.min(100, N.vehicles.TYPES[ty].maxSpeed * 0.85); (out[ty] = out[ty] || {})[wx] = measure(ty, v0); out[ty].v0 = v0; out[ty].brakeNow = N.vehicles.TYPES[ty].brake; }
    }
    N.weather.force({ rain: 0, wet: 0 }); WS.update(1 / 60);
    N.world.potholeAt = potAt; N.time.scale = scale0;
    N.traffic.enabled = true;
    return { out, slick: N.weather2d.slick, restored: types.map((ty) => N.vehicles.TYPES[ty].brake === N.weather2d.dryBrake(ty)) };
  });
  for (const ty in brake.out) {
    const o = brake.out[ty], ratio = o.wet.d / o.dry.d;
    const pedalOrScooty = /cycle|scooty/.test(ty);
    check(ratio > (pedalOrScooty ? 1.45 : 1.08) && ratio < 1.8, 'braking distance in the wet: ' + ty, 'from ' + o.v0.toFixed(0) + ' u/s: dry ' + o.dry.d + ' u -> wet ' + o.wet.d + ' u (x' + ratio.toFixed(2) + ')');
  }
  check(brake.restored.every(Boolean), 'brakes back to normal once the road dries');

  // ---- pursuers give up sooner in heavy rain (unseen time until the meter drops a level)
  const pursuit = await page.evaluate(() => {
    const WS = N.systems.get('weather2d'), WA = N.systems.get('wanted');
    N.debug.teleport('giver_himayatnagar');
    const run = (rain) => {
      N.weather.force({ rain, storm: 0 }); WS.update(1 / 60);
      N.wanted.clear && N.wanted.clear('test');
      N.wanted.set(2, 'test');
      N.player.hidden = true;
      let t = 0;
      for (let i = 0; i < 1200 && N.wanted.level >= 2; i++) { WA.update(0.05); t += 0.05; }
      N.player.hidden = false;
      const sight = N.settings && N.settings.diff ? N.settings.diff('sight') : null;
      N.wanted.clear && N.wanted.clear('test');
      return { t: +t.toFixed(2), sight };
    };
    const dry = run(0), wet = run(1);
    N.weather.force({ rain: 0, wet: 0 }); WS.update(1 / 60);
    return { dry, wet, search: N.wanted.TUNE.searchSecs };
  });
  check(pursuit.wet.t < pursuit.dry.t * 0.75, 'the Chappal Meter drops sooner unseen in heavy rain', 'dry ' + pursuit.dry.t + ' s, downpour ' + pursuit.wet.t + ' s; sight x' + pursuit.wet.sight);

  // ---- chai in the rain
  const chai = await page.evaluate(() => {
    const p = N.player;
    const cafe = Object.keys(N.places).find((k) => /^irani_cafe/.test(k));
    const run = (rain) => {
      N.weather.force({ rain, wet: rain ? 1 : 0 });
      p.tummy = 60; p.energy = 20;
      let ev = null; const on = (d) => { ev = d; }; N.on('rain:chai', on);
      const r = N.shops.buy(cafe, 'chai', { force: true, free: true });
      N.off('rain:chai', on);
      return { ok: r.ok, energy: p.energy, ev };
    };
    const dry = run(0), wet = run(0.7);
    N.weather.force({ rain: 0, wet: 0 });
    return { cafe, dry, wet };
  });
  check(chai.wet.ok && chai.wet.ev && chai.wet.energy > chai.dry.energy, 'Irani chai in the rain gives bonus energy', chai.cafe + ': dry energy ' + chai.dry.energy + ', rain ' + chai.wet.energy);

  // ---- paper boat on a quiet lane
  const spot = await page.evaluate(async () => {
    N.weather.force({ rain: 0.5 });
    N.world.potholes.refresh && N.world.potholes.refresh();
    await new Promise((r) => setTimeout(r, 900));
    const p = N.player;
    N.debug.teleport('giver_himayatnagar');
    const lanes = N.world.potholes.list.filter((q) => q.kind === 'lane' && q.wet && q.r > 3.5).sort((a, b) => (b.style === 'colony') - (a.style === 'colony') || Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    for (const q of lanes) {
      for (let a = 0; a < 6.28; a += 0.8) {
        const x = q.x + Math.cos(a) * (q.r + 5), y = q.y + Math.sin(a) * (q.r + 5);
        if (!N.world.isWalkable(x, y)) continue;
        N.debug.teleport(x, y);
        if (Math.hypot(p.x - x, p.y - y) < 1 && N.weather2d.boatSpot()) return { x, y, q: { x: q.x, y: q.y, r: q.r, id: q.id } };
      }
    }
    return null;
  });
  if (check(!!spot, 'found a wet pothole on a quiet lane for a paper boat', spot ? JSON.stringify(spot.q) : '')) {
    await page.waitForTimeout(600);
    const offered = await page.evaluate(() => N.interact.current && (typeof N.interact.current.label === 'function' ? N.interact.current.label(N.player) : N.interact.current.label));
    check(offered === 'Float a paper boat', 'ACTION offers "Float a paper boat"', String(offered));
    const res = await page.evaluate(async () => {
      const p = N.player; p.tummy = 90; p.energy = 40; N.debug.setTime(16, 30);
      const evs = (window.__boatEvs = []); N.on('paperboat', (d) => evs.push(d));
      N.input.press('action');
      await new Promise((r) => setTimeout(r, 400));
      const launched = !!N.weather2d.boat;
      const b0 = launched ? { x: N.weather2d.boat.x, y: N.weather2d.boat.y } : null;
            return { launched, b0, evs: evs.length, e0: p.energy };
    });
    check(res.launched, 'ACTION launches the paper boat');
    if (SHOTS && res.launched) {
      await page.evaluate(() => { N.render.baseZoom = 2; });
      await page.waitForTimeout(2600);
      await page.screenshot({ path: path.join(OUT, 'weather2d_paperboat.png') });
      await page.evaluate(() => { N.render.baseZoom = 1; });
    }
    const done = await page.evaluate(async () => {
      const t0 = performance.now();
      while (N.weather2d.boat && performance.now() - t0 < 40000) await new Promise((r) => setTimeout(r, 200));
      const last = window.__boatEvs[window.__boatEvs.length - 1] || {};
      return { afloat: !!N.weather2d.boat, flags: N.flags.paper_boats | 0, events: window.__boatEvs.length, done: !!last.done, secs: +(last.secs || 0).toFixed(1), dist: +(last.dist || 0).toFixed(1) };
    });
    check(!done.afloat && done.done && done.flags >= 1 && done.dist > 20, "the boat drifts down the gutter: 'paperboat' done, reward, paper_boats flag", JSON.stringify(done));
  }
  await page.evaluate(() => N.weather.force(null));
  const errs = await nErrs(page);
  check(!errors.length && !errs.length, 'gameplay: zero errors', errors.concat(errs).slice(0, 4).join(' | '));
  await context.close();
}

async function perf(browser, name, viewport, opts) {
  console.log('\n== perf ' + name + ' ' + viewport.width + 'x' + viewport.height);
  const { context, page, errors } = await openPage(browser, viewport, opts);
  const r = await page.evaluate(async () => {
    N.debug.teleport('abids'); N.debug.setTime(21, 30);
    N.wind.force({ strength: 0.7, dir: 0.4 });
    const sample = async (wx, secs) => {
      N.weather.force(wx);
      await new Promise((res) => setTimeout(res, 1500));
      const w = [], tot = [], fl = [];
      const t0 = performance.now();
      await new Promise((res) => {
        const f = () => {
          const ms = N.render.stats.ms;
          w.push(N.weather2d.stats.ms); fl.push(ms.flush || 0); tot.push((ms.enqWorld || 0) + (ms.enqOther || 0) + (ms.flush || 0));
          if (performance.now() - t0 > secs * 1000) res(); else requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      });
      const med = (a) => { const s = a.slice().sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(3); };
      const mean = (a) => +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(3);
      return { n: w.length, wxMed: med(w), wxMean: mean(w), frameMed: med(tot), stats: Object.assign({}, N.weather2d.stats) };
    };
    const dry = await sample({ rain: 0, wet: 0 }, 3);
    const storm = await sample({ rain: 1, storm: 1 }, 4);
    N.weather.force(null);
    return { dry, storm, W: N.render.W, H: N.render.H };
  });
  console.log('  internal ' + r.W + 'x' + r.H + ' · dry: weather ' + r.dry.wxMed + ' ms (frame ' + r.dry.frameMed + ' ms) · night storm: weather ' + r.storm.wxMed + ' ms median / ' + r.storm.wxMean + ' mean (frame ' + r.storm.frameMed + ' ms, ' + r.storm.n + ' frames) · ' + JSON.stringify(r.storm.stats));
  const share = r.storm.wxMed / Math.max(0.001, r.storm.frameMed);
  check(r.storm.wxMed < r.storm.frameMed * 0.2, name + ': weather 2D draw is a small share of the frame', (share * 100).toFixed(1) + '%');
  const errs = await nErrs(page);
  check(!errors.length && !errs.length, name + ': zero errors', errors.concat(errs).slice(0, 4).join(' | '));
  await context.close();
  return r;
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    const ONLY = process.env.ONLY || 'shots,gameplay,perf';
    if (/shots/.test(ONLY)) await screenshots(browser);
    if (/gameplay/.test(ONLY)) await gameplay(browser);
    if (/perf/.test(ONLY)) {
      await perf(browser, 'desktop', { width: 960, height: 540 });
      await perf(browser, 'phone', { width: 390, height: 844 }, { touch: true, dpr: 1 });
    }
  } catch (e) {
    fail('exception: ' + (e.stack || e.message));
  } finally {
    await browser.close();
  }
  console.log('\n' + (failures.length ? failures.length + ' FAILED:\n  ' + failures.join('\n  ') : 'all weather2d checks passed'));
  process.exit(failures.length ? 1 : 0);
})();
