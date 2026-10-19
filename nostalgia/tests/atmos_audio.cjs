/* NOSTALGIA — tests/atmos_audio.cjs  (atmosphere layer: src/atmosphere_audio.js)
 * Headless-Chromium test of N.atmosAudio (rain / thunder / wind / bird sounds) inside the real game:
 *   1. no WebAudio at all (AudioContext + OfflineAudioContext removed): rain, storm, lightning, petrichor,
 *      paper boats and every bird sfx -> no exceptions, sfx() returns false, renderOffline -> null
 *   2. WebAudio present but never unlocked (no gesture): same, nothing is built
 *   3. live (autoplay allowed, real START click):
 *      rain beds rise / fall with N.weather.rain (levels, running beds, live meter of this layer), beds stop after
 *      the rain, Old City tin + gutters, drip-drip while wet after rain, tree beds in a park, tyres + car cover,
 *      wind / storm beds, thunder scheduled at the strike's delay (meter quiet before, loud after),
 *      bird sfx positional (near plays, far culled, cooldowns, delegates to N.audio), volume settings + mute,
 *      CPU of the bed update (<= 0.2 ms / frame average), offline renders non-silent and never clipping
 *   zero console errors / page errors / N.err entries in every phase
 *
 *   node nostalgia/tests/atmos_audio.cjs
 */
'use strict';
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, extra) => (cond ? ok(msg) : fail(msg + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(browser, opts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  if (opts && opts.noAudio) await page.addInitScript(() => { window.AudioContext = undefined; window.webkitAudioContext = undefined; window.OfflineAudioContext = undefined; window.webkitOfflineAudioContext = undefined; });
  await page.goto(URL);
  await page.waitForFunction(() => window.N && N.state && N.state.mode === 'title' && document.body.classList.contains('booted'), null, { timeout: 120000 });
  return { page, context, errors, ev: (fn, arg) => page.evaluate(fn, arg) };
}

// phases 1 + 2: everything must be a silent no-op
async function silentPhase(browser, label, opts) {
  console.log('\n== ' + label);
  const P = await open(browser, opts);
  const r = await P.ev(async () => {
    const out = { api: typeof N.atmosAudio, names: N.atmosAudio.SFX_NAMES.slice() };
    N.debug.newGame({ skipIntro: true });
    N.weather.force({ rain: 1, storm: 1 }); N.wind.force({ strength: 1 });
    for (let i = 0; i < 6; i++) N.weather.strike(N.player.x + 100 + i * 300, N.player.y);
    N.emit('weather:petrichor', {});
    N.emit('paperboat', { x: N.player.x + 10, y: N.player.y });
    out.sfx = N.atmosAudio.SFX_NAMES.map((n) => N.atmosAudio.sfx(n, { x: N.player.x + 30, y: N.player.y, n: 12 }));
    out.bogus = N.atmosAudio.sfx('nope', {});
    await new Promise((res) => setTimeout(res, 1500));
    out.stats = N.atmosAudio.stats();
    out.render = await N.atmosAudio.renderOffline('parakeet', 1);
    out.ctx = !!(N.audio && N.audio.ctx);
    N.atmosAudio.setEnabled(false); N.atmosAudio.setEnabled(true);
    N.weather.force(null); N.wind.force(null);
    out.errs = (N.errors || []).length;
    return out;
  });
  check(r.api === 'object' && r.names.length >= 9, 'N.atmosAudio present (' + r.names.join(', ') + ')');
  check(r.sfx.every((x) => x === false) && r.bogus === false, 'every sfx() returns false without a running context');
  check(!r.stats.ready && r.stats.voices === 0, 'nothing built without a context', r.stats);
  if (opts && opts.noAudio) check(r.render === null && !r.ctx, 'renderOffline -> null without OfflineAudioContext');
  else check(!r.ctx, 'no AudioContext before a user gesture');
  check(P.errors.length === 0 && r.errs === 0, 'zero errors (' + label + ')', P.errors.concat(r.errs ? ['N.errors: ' + r.errs] : []));
  await P.context.close();
}

(async () => {
  const quiet = await chromium.launch();
  await silentPhase(quiet, 'no WebAudio at all', { noAudio: true });
  await silentPhase(quiet, 'WebAudio, but never unlocked', {});
  await quiet.close();

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const P = await open(browser);
  const { page, ev } = P;
  console.log('\n== live: START unlocks');
  await page.click('#title-start');
  await sleep(600);
  await ev(() => { N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); N.debug.god(true); if (N.dialogue) N.dialogue.skip = true; });
  await sleep(800);
  const stats = () => ev(() => N.atmosAudio.stats());
  const meter = async (ms) => { let mx = 0; const t = Date.now(); while (Date.now() - t < (ms || 500)) { mx = Math.max(mx, await ev(() => N.atmosAudio.meter())); await sleep(40); } return mx; };
  const weather = (spec, wind) => ev((a) => { N.weather.force(a[0]); N.wind.force(a[1]); }, [spec, wind]);
  let st = await stats();
  check(st.ready && (await ev(() => N.audio.ready)), 'layer built on the live context', st);
  for (let i = 0; i < 50 && (await stats()).buffers < 25; i++) await sleep(200);
  st = await stats();
  check(st.buffers >= 25, 'pre-rendered buffers built in idle time: ' + st.buffers);

  console.log('\n== rain beds rise and fall (Old City)');
  await ev(() => N.debug.teleport('charminar'));
  await weather({ rain: 0, wet: 0 }, { strength: 0.1, gustiness: 0 });
  await sleep(1500);
  const dry = await stats(), dryM = await meter(400);
  const rainBeds = ['hiss', 'light', 'dense', 'tin', 'sheet', 'leaves', 'gutter'];
  check(rainBeds.every((k) => dry.beds[k] === 0), 'dry: rain beds silent', dry.beds);
  await weather({ rain: 0.3 }, { strength: 0.1, gustiness: 0 });
  await sleep(2200);
  const lightR = await stats(), lightM = await meter(500);
  check(lightR.beds.hiss > 0 && lightR.beds.light > 0 && lightR.on.includes('hiss'), 'light rain: hiss + drops running', lightR.beds);
  check(lightR.env.style === 'oldcity' && lightR.beds.tin > 0.05 && lightR.rates.ping > 0, 'Old City: rain on tin roofs + metallic pings (' + lightR.rates.ping + '/s)', lightR.env);
  check(lightR.beds.gutter > 0, 'gutters gurgle near buildings');
  await weather({ rain: 1 }, { strength: 0.1, gustiness: 0 });
  await sleep(2200);
  const heavy = await stats(), heavyM = await meter(500);
  check(heavy.beds.dense > lightR.beds.dense && heavy.beds.hiss > lightR.beds.hiss && heavy.beds.light < lightR.beds.light, 'heavy rain: dense patter + hiss up, sparse drops crossfade out');
  check(heavyM > lightM && lightM > dryM && heavyM < 0.25, 'live meter rises with rain: dry ' + dryM.toFixed(4) + ' -> light ' + lightM.toFixed(4) + ' -> heavy ' + heavyM.toFixed(4));
  const audioM = await ev(async () => { let m = 0; for (let i = 0; i < 10; i++) { m = Math.max(m, N.audio._internal.meter()); await new Promise((r) => setTimeout(r, 50)); } return m; });
  console.log('       (N.audio music + ambience meter at the same moment: ' + audioM.toFixed(4) + ')');
  await weather({ rain: 0, wet: 0.9 }, { strength: 0.1, gustiness: 0 });
  await sleep(1800);
  const after = await stats();
  check(rainBeds.filter((k) => k !== 'gutter').every((k) => after.beds[k] === 0) && after.rates.drip > 0.5, 'rain stops: beds fade, drip-drip while wet (' + after.rates.drip + '/s), gutters still running: ' + after.beds.gutter);
  await weather({ rain: 0, wet: 0 }, { strength: 0.1, gustiness: 0 });
  await sleep(7000);
  const stopped = await stats();
  check(rainBeds.every((k) => !stopped.on.includes(k)), 'silent beds torn down (running: ' + stopped.on.join(',') + ')');

  console.log('\n== trees, tyres, vehicle cover');
  await ev(() => N.debug.teleport('public_gardens'));
  await weather({ rain: 0.6 }, { strength: 0.6, gustiness: 0.8 });
  await sleep(2200);
  const park = await stats();
  check(park.env.trees > 0.15 && park.beds.leaves > 0 && park.beds.rustle > 0, 'park: rain on leaves + leaf rustle (trees ' + park.env.trees + ', style ' + park.env.style + ')', park.env);
  await ev(() => { N.debug.teleport('abids'); N.debug.enterVehicle('ambassador'); });
  await weather({ rain: 0.6, wet: 1 }, { strength: 0.3, gustiness: 0.5 });
  await sleep(500);
  await page.keyboard.down('ArrowUp');
  await sleep(1600);
  const car = await stats();
  await page.keyboard.up('ArrowUp');
  check(car.cover === 'car' && car.beds.roof > 0, 'inside a car: rain drums on the roof, outside muffled', { cover: car.cover, roof: car.beds.roof });
  check(car.tyres.player > 0 && car.beds.tyreP > 0, 'own tyres hiss on the wet road (' + car.tyres.player + ')', car.tyres);
  const tyreDry = await ev(async () => { N.weather.force({ rain: 0, wet: 0 }); await new Promise((r) => setTimeout(r, 600)); return N.atmosAudio.stats().tyres; });
  check(tyreDry.player === 0 && tyreDry.traffic === 0, 'dry road: no tyre hiss');
  await ev(() => { if (N.player.vehicle && N.vehicles.exit) N.vehicles.exit(N.player); });
  await sleep(300);

  console.log('\n== wind + storm');
  await ev(() => N.debug.teleport('charminar'));
  await weather({ rain: 0, wet: 0 }, { strength: 0.15, gustiness: 0.2 });
  await sleep(1500);
  const calm = await stats();
  await weather({ rain: 0, storm: 1, wet: 0 }, { strength: 1, gustiness: 1 });
  await sleep(2000);
  const storm = await stats();
  check(storm.beds.wind > calm.beds.wind && storm.beds.howl > 0 && storm.on.includes('howl'), 'wind bed follows N.wind.strength; storm howl in a storm', { calm: calm.beds.wind, storm: storm.beds });

  console.log('\n== thunder at the strike delay');
  await weather({ rain: 0, storm: 0, wet: 0 }, { strength: 0, gustiness: 0 });
  await sleep(6500); // let every bed fall silent (and the storm stop striking)
  const quietM = await meter(300);
  const strike = await ev(() => { const s = N.weather.strike(N.player.x + 420, N.player.y, 1); return { delay: s.delay, dist: s.dist, t: N.audio.ctx.currentTime }; });
  const lt = (await stats()).lastThunder;
  check(lt && Math.abs(lt.delay - strike.delay) < 0.01 && Math.abs(lt.startAt - lt.at - strike.delay) < 0.01 && lt.near, 'near strike (' + strike.dist.toFixed(0) + ' u): thunder scheduled at +' + strike.delay.toFixed(2) + ' s', lt);
  const before = await meter(Math.max(200, strike.delay * 1000 - 500));
  await sleep(250);
  const crack = await meter(1500);
  check(before < 0.01 + quietM && crack > Math.max(0.02, before * 4) && crack < 0.98, 'meter quiet before the delay (' + before.toFixed(4) + '), crack + roll after (' + crack.toFixed(4) + ')');
  const far = await ev(() => { const s = N.weather.strike(N.player.x - 2500, N.player.y, 0.5); const t = N.atmosAudio.stats().lastThunder; return { delay: s.delay, t }; });
  check(far.t && !far.t.near && Math.abs(far.t.delay - far.delay) < 0.01 && far.delay > 8, 'far strike: low distant roll scheduled at +' + far.delay.toFixed(2) + ' s');
  const many = await ev(() => { for (let i = 0; i < 6; i++) N.weather.strike(N.player.x + 300, N.player.y); return N.atmosAudio.stats().thunder; });
  check(many <= 3, 'thunder voice cap (' + many + ' <= 3)');

  console.log('\n== bird sounds');
  const birds = await ev(async () => {
    const A = N.atmosAudio, p = N.player, res = {};
    for (const n of A.SFX_NAMES) {
      let r = false;
      for (let i = 0; i < 30 && !r; i++) { r = A.sfx(n, { x: p.x + 60, y: p.y - 20, n: 8, force: true }); if (!r) await new Promise((q) => setTimeout(q, 100)); }
      res[n] = r;
      await new Promise((q) => setTimeout(q, 60));
    }
    await new Promise((q) => setTimeout(q, 2500));
    const far = A.sfx('parakeet', { x: p.x + 6000, y: p.y });
    const a = A.sfx('egret', { x: p.x + 50, y: p.y }), b = A.sfx('egret', { x: p.x + 50, y: p.y });
    const unknown = A.sfx('dragon', { x: p.x, y: p.y });
    return { res, far, a, b, unknown, st: A.stats() };
  });
  check(Object.values(birds.res).every(Boolean), 'every bird sfx plays near the listener', birds.res);
  check(!birds.far && birds.a && !birds.b && !birds.unknown, 'culled beyond 700 u, per-name cooldown, unknown names -> false');
  check(birds.st.strips <= 8, 'bird voice cap (' + birds.st.strips + ' busy strips)');

  console.log('\n== volume settings');
  await weather({ rain: 0.8, wet: 1 }, { strength: 0.3, gustiness: 0.5 });
  await sleep(2500);
  const vNorm = await meter(500);
  const old = await ev(() => { const o = { a: N.audio.getVolume('ambient') }; N.audio.setVolume('ambient', 0); return o; });
  await sleep(500);
  const vZero = await meter(400);
  await ev((o) => { N.audio.setVolume('ambient', o.a); N.audio.mute(true); }, old);
  await sleep(500);
  const vMute = await meter(400);
  await ev(() => N.audio.mute(false));
  check(vNorm > 0.01 && vZero < vNorm * 0.1 && vMute < vNorm * 0.1, 'beds follow the ambient volume and mute (' + vNorm.toFixed(4) + ' -> ' + vZero.toFixed(4) + ' / ' + vMute.toFixed(4) + ')');

  console.log('\n== CPU');
  await weather({ rain: 1, storm: 1, wet: 1 }, { strength: 1, gustiness: 1 });
  await ev(() => N.atmosAudio.resetCpu());
  await sleep(4000);
  const cpu = (await stats()).cpu;
  check(cpu.n > 60 && cpu.avg <= 0.2, 'bed update ' + cpu.avg.toFixed(3) + ' ms / frame average (max ' + cpu.max + ' ms, ' + cpu.n + ' frames)', cpu);
  await weather(null, null);

  console.log('\n== offline renders');
  const renders = await ev(async () => {
    const A = N.atmosAudio, out = {};
    for (const n of A.SFX_NAMES.concat(A.DEMOS)) {
      const r = await A.renderOffline(n, /^thunder/.test(n) ? 9 : n === 'petrichor' ? 8 : 2.5);
      out[n] = r ? [+r.peak.toFixed(3), +r.rms.toFixed(4)] : null;
    }
    let threw = false; try { await A.renderOffline('nope', 1); } catch (e) { threw = true; }
    out._bogus = threw;
    return out;
  });
  const bad = [];
  for (const k in renders) { if (k === '_bogus') continue; const r = renders[k]; if (!r || r[0] < 0.01 || r[1] < 0.0008 || r[0] >= 1) bad.push(k + ':' + JSON.stringify(r)); }
  check(bad.length === 0, 'all ' + (Object.keys(renders).length - 1) + ' offline renders non-silent and below clipping', bad);
  console.log('       ' + Object.entries(renders).filter((e) => e[0] !== '_bogus').map((e) => e[0] + ' ' + e[1][0] + '/' + e[1][1]).join(' · '));
  check(renders._bogus, 'renderOffline rejects unknown names');

  const errs = await ev(() => (N.errors || []).map((e) => String(e.where || '') + ' ' + String(e.msg || e.message || e)).slice(0, 5));
  check(P.errors.length === 0 && errs.length === 0, 'zero errors (live)', P.errors.concat(errs));
  await browser.close();
  console.log(failures.length ? '\n' + failures.length + ' FAILURE(S)' : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
