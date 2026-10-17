/* NOSTALGIA — tests/audio.cjs  (owner: audio engineer)
 * Headless-Chromium test of N.audio inside the real game:
 *   boot index.html -> click START (real gesture) -> AudioContext running
 *   every SFX plays live (waiting for free voices), positional culling works
 *   every music track + radio song starts and produces output (live AnalyserNode meter)
 *   stub-compatible API (music('id'), play(), stopMusic(), radio.toggle())
 *   vehicle radio (3 stations + off), DJ text, engine voice, enter/exit
 *   ambient beds + place emitters (Charminar, a pindi girni, Koti bus stand, RTC X Roads film song), night crickets
 *   every hooked event (horn, bump, pickup, mission start/complete/fail, wanted, busted/wasted, dialogue, footstep ...)
 *   Chappal Meter 3+ switches to the chase track; dialogue ducks the music
 *   settings persist across reload (localStorage)
 *   OfflineAudioContext renders of SFX + tracks are non-silent and not clipping
 *   zero console errors / page errors / N.err entries
 *
 *   node nostalgia/tests/audio.cjs
 *   AUDIO_SRC=staging/audio.js node nostalgia/tests/audio.cjs   (serve another audio.js in place of src/audio.js)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, extra) => (cond ? ok(msg) : fail(msg + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Optional static server so src/audio.js can be swapped (route() does not intercept file://)
function serve() {
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    if (p === '/') p = '/index.html';
    let file = path.join(ROOT, p);
    if (process.env.AUDIO_SRC && p === '/src/audio.js') file = path.resolve(ROOT, process.env.AUDIO_SRC);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv)));
}

(async () => {
  let srv = null, URL = 'file://' + path.join(ROOT, 'index.html');
  if (process.env.AUDIO_SRC) { srv = await serve(); URL = 'http://127.0.0.1:' + srv.address().port + '/index.html'; console.log('serving ' + process.env.AUDIO_SRC + ' as src/audio.js'); }
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const stats = () => ev(() => N.audio.stats());
  const meter = async (ms) => { let mx = 0; const t = Date.now(); while (Date.now() - t < (ms || 400)) { mx = Math.max(mx, await ev(() => N.audio._internal.meter())); await sleep(40); } return mx; };

  console.log('\n== boot');
  await page.goto(URL);
  await page.waitForFunction(() => window.N && N.state && N.state.mode === 'title', null, { timeout: 30000 });
  const api = await ev(() => {
    const A = N.audio;
    const fns = ['unlock', 'sfx', 'setVolume', 'getVolume', 'mute', 'toggleMute', 'duck', 'horn', 'engine', 'tape', 'play', 'stopMusic', 'renderOffline', 'renderTrackOffline', 'stats'];
    return { missing: fns.filter((f) => typeof A[f] !== 'function'), music: typeof A.music, radio: typeof (A.radio && A.radio.next), walkman: typeof (A.walkman && A.walkman.play),
      available: A.available, ready: A.ready, sfx: A.SFX_NAMES.length, tracks: A.music.TRACKS.length };
  });
  check(api.missing.length === 0 && api.music === 'function' && api.radio === 'function' && api.walkman === 'function', 'N.audio API surface complete', api);
  check(api.available && !api.ready, 'WebAudio available; not started before a user gesture');
  check(api.sfx >= 80 && api.tracks >= 17, 'SFX library ' + api.sfx + ' sounds, ' + api.tracks + ' music tracks');

  console.log('\n== START (real click) unlocks audio');
  // PLAY starts a new game, which opens on the story's prologue cutscene (menus.quickStart skips the name card under automation)
  await page.click('#title-start');
  await page.waitForFunction(() => N.state.mode === 'cutscene', null, { timeout: 10000 });
  await page.waitForFunction(() => N.audio.stats().music === 'flashback', null, { timeout: 10000 }).catch(() => {});
  let st = await stats();
  check(st.state === 'running' && st.unlocked, 'AudioContext running after START', st.state);
  check(st.music === 'flashback', 'the prologue opens on the tape flashback theme "Purani Cassette"', st.music);
  // skip the prologue with the real SKIP pill: M1 (Bo Kaata) starts in 2003
  await page.click('.cs-skip');
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 10000 });
  check(await ev(() => N.flags.year === 2003 && !!N.missions.active), 'SKIP lands in 2003 with M1 running');
  await ev(() => N.debug.newGame({ skipIntro: true }));
  // the music director picks a free-roam track (wait on the director, not the wall clock)
  await page.waitForFunction(() => ['day', 'night', 'oldcity'].includes(N.audio.stats().music) && !!N.audio.stats().bed, null, { timeout: 15000 }).catch(() => {});
  st = await stats();
  check(['day', 'night', 'oldcity'].includes(st.music), 'free-roam music chosen by the director: ' + st.music);
  const secs = await ev(() => N.audio.music.sections('ending'));
  check(secs.length === 5 && secs[3].name === 'lift', 'ending section timings for the Charminar finale: ' + secs.map((x) => x.name + '@' + x.start.toFixed(1) + 's').join(' '));
  check(!!st.bed, 'ambient bed active: ' + st.bed);
  check((await meter(500)) > 0.002, 'live output is audible (master meter)');

  console.log('\n== every SFX, live');
  const sfxRes = await ev(async () => {
    const A = N.audio, failed = [];
    for (const n of A.SFX_NAMES) {
      let okk = false;
      for (let i = 0; i < 40 && !okk; i++) { okk = A.sfx(n, { force: true }); if (!okk) await new Promise((r) => setTimeout(r, 100)); }
      if (!okk) failed.push(n);
      await new Promise((r) => setTimeout(r, 25));
    }
    const p = N.player;
    for (let i = 0; i < 100 && A.stats().busyStrips > 8; i++) await new Promise((r) => setTimeout(r, 100)); // let the voice pool drain
    const near = A.sfx('bus_horn', { x: p.x + 250, y: p.y, force: true });
    const far = A.sfx('bus_horn', { x: p.x + 6000, y: p.y, force: true });
    const surf = [0, 1, 2, 3, 4, 5, 6, 9, 10, 'grass', 'wood'].map((s) => A.sfx('step', { surface: s, force: true }));
    return { failed, near, far, surf: surf.filter(Boolean).length };
  });
  check(sfxRes.failed.length === 0, 'all ' + api.sfx + ' SFX played', sfxRes.failed);
  check(sfxRes.near && !sfxRes.far, 'positional SFX: near plays, 6000u away is culled');
  check(sfxRes.surf === 11, 'footsteps for every surface');

  console.log('\n== every music track (live)');
  const tracks = await ev(() => N.audio.music.TRACKS);
  for (const id of tracks) {
    await ev((id) => N.audio.music.play(id, { fade: 0.05 }), id);
    await sleep(250);
    const s2 = await stats();
    const lvl = await meter(450);
    check(s2.music === id && lvl > 0.001, 'track ' + id + ' "' + (await ev((id) => N.audio.music.title(id), id)) + '" plays (level ' + lvl.toFixed(3) + ')', s2.music);
  }
  await ev(() => { N.audio.music.stop(0.1); N.audio.music.lock(null); });
  const compat = await ev(async () => {
    const A = N.audio;
    A.music('title');
    const a = A.music.current;
    A.music(null);
    const b = A.music.current;
    const c = A.play('coin', { force: true });
    A.stopMusic();
    A.music.lock(null);
    return { a, b, c };
  });
  check(compat.a === 'title' && compat.b === null && compat.c === true, 'stub-compatible calls: music("title"), music(null), play(), stopMusic()', compat);

  console.log('\n== vehicle: engine + radio');
  const veh = await ev(async () => {
    let v = null, real = false;
    try { if (N.vehicles && N.vehicles.spawn) { v = N.debug.enterVehicle('ambassador'); real = !!v && N.player.vehicle === v; } } catch (e) { v = null; }
    if (!real) { v = { kind: 'vehicle', type: 'ambassador', x: N.player.x, y: N.player.y, vx: 0, vy: 0, alive: true }; N.player.vehicle = v; }
    await new Promise((r) => setTimeout(r, 1500));
    const s1 = N.audio.stats();
    v.vx = 120; v.throttle = 1;
    await new Promise((r) => setTimeout(r, 400));
    const radioOn = N.audio.radio.on, st0 = N.audio.radio.station;
    const seen = [st0];
    for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 150)); N.audio.radio.next(); seen.push(N.audio.radio.station); }
    N.audio.radio.set(2);
    await new Promise((r) => setTimeout(r, 600));
    const s2 = N.audio.stats();
    const text = N.audio.radio.text;
    if (real && N.vehicles.exit) N.vehicles.exit(N.player); else N.player.vehicle = null;
    await new Promise((r) => setTimeout(r, 500));
    const s3 = N.audio.stats();
    return { real, eng: s1.engines, radioOn, seen, s2radio: s2.radio, s2music: s2.music, text, after: { radio: s3.radio, engines: s3.engines } };
  });
  check(veh.eng.includes('ambassador'), 'engine voice for the player vehicle (' + (veh.real ? 'real vehicle' : 'stand-in vehicle') + ')', veh.eng);
  check(veh.radioOn, 'car radio switches on when entering a car');
  check(new Set(veh.seen).size >= 4 && veh.seen.includes(-1), 'radio.next() cycles 3 stations and off', veh.seen);
  check(veh.s2radio === 'Pop Patang 104.8' && veh.s2music === null, 'radio.set(2) tunes Pop Patang and the score yields to it', [veh.s2radio, veh.s2music]);
  check(typeof veh.text === 'string' && veh.text.length > 5, 'station text for the HUD toast: "' + veh.text + '"');
  check(!veh.after.radio && !veh.after.engines.includes('ambassador'), 'exiting the vehicle stops radio and engine', veh.after);

  console.log('\n== ambience + place emitters');
  const places = [['charminar', 'charminar'], ['pindi_girni_1', 'pindi_girni_1'], ['koti_bus_stand', 'koti_bus_stand'], ['gokul_chat', 'gokul_chat'], ['birla_mandir', 'birla_mandir'], ['irani_cafe_1', 'irani_cafe_1']];
  for (const [pl, em] of places) {
    const r = await ev(async (pl) => { const t = N.debug.teleport(pl); await new Promise((r) => setTimeout(r, 1100)); return { t, bed: N.audio.ambient.bed, em: N.audio.ambient.emitters }; }, pl);
    if (!r.t) { ok('(place ' + pl + ' not in this map build; skipped)'); continue; }
    check(r.em.includes(em) && !!r.bed, 'at ' + pl + ': bed ' + r.bed + ', emitter ' + em, r.em.slice(0, 8));
  }
  const rtc = await ev(async () => { if (!N.debug.teleport('rtc_x_roads')) return null; await new Promise((r) => setTimeout(r, 1300)); return N.audio.stats().spatialMusic; });
  if (rtc !== null) check(rtc === 'r_chandni', 'a film song drifts out of the RTC X Roads theatres', rtc);
  // night falls while Chinnu is already home (walking in at 23:00 would rightly start Amma's curfew scolding,
  // which is wanted.js's business, not audio's): reach home in the afternoon, let a few game frames pass, then dusk -> night
  await ev(() => { N.debug.teleport('home'); });
  await page.waitForFunction((t0) => N.time.now > t0 + 0.5, await ev(() => N.time.now), { timeout: 20000 });
  const night = await ev(async () => { N.flags.no_curfew = true; N.debug.setTime(23, 0); await new Promise((r) => setTimeout(r, 1500)); const v = N.audio._internal.amb.lastVals.crickets; N.debug.setTime(16, 40); delete N.flags.no_curfew; return v; });
  check(night > 0, 'night: crickets fade in (' + (night || 0).toFixed(4) + ')');

  console.log('\n== events');
  const evr = await ev(async () => {
    const A = N.audio, p = N.player, out = {};
    const emit = (n, d) => N.emit(n, d);
    emit('horn', { type: 'auto', x: p.x + 40, y: p.y });
    emit('bump', { a: p, b: { kind: 'vehicle', x: p.x + 5, y: p.y }, speed: 90 });
    emit('pickup', { kind: 'goli' }); emit('collectible', { kind: 'cassette' }); emit('money', { delta: 500 });
    emit('mission:start', { id: 't' });
    emit('dialogue:open', {});
    await new Promise((r) => setTimeout(r, 400));
    for (let i = 0; i < 6; i++) { emit('dialogue:char', { speaker: 'nani' }); await new Promise((r) => setTimeout(r, 50)); }
    emit('dialogue:close', {});
    emit('footstep', { x: p.x, y: p.y, surf: 4, run: true, who: p });
    emit('kite:cut', { x: p.x + 60, y: p.y - 40 });
    emit('splash', { x: p.x + 30, y: p.y }); emit('door', { x: p.x, y: p.y, kind: 'wood' }); emit('save', {}); emit('shop:buy', {});
    emit('sfx', { name: 'cooker', x: p.x + 80, y: p.y });
    emit('wanted:change', { level: 1, prev: 0 }); emit('wanted:change', { level: 0, prev: 1 });
    emit('mission:complete', { id: 't' });
    await new Promise((r) => setTimeout(r, 3200));
    out.victory = A.stats().music;
    emit('mission:fail', { id: 't' });
    emit('busted', {}); emit('wasted', {}); emit('player:exhausted', p);
    emit('flashback', { tape: 0.8 });
    await new Promise((r) => setTimeout(r, 300));
    A.tape(0);
    // Chappal Meter 3 -> chase
    A._internal.music.stingUntil = 0;
    if (N.wanted && N.wanted.set) N.wanted.set(3); else emit('wanted', 3);
    await new Promise((r) => setTimeout(r, 900));
    out.chase = A.stats().music;
    if (N.wanted && N.wanted.set) N.wanted.set(0); else emit('wanted', 0);
    emit('music', { mood: 'tension' });
    await new Promise((r) => setTimeout(r, 1000));
    out.hold = A.stats().music;             // chase is held ~4 s after escaping
    await new Promise((r) => setTimeout(r, 3800));
    out.mood = A.stats().music;
    emit('music', { mood: null });
    return out;
  });
  check(evr.victory === 'victory', 'mission:complete -> MISSION PASSED fanfare then the victory track', evr.victory);
  check(evr.chase === 'chase', 'Chappal Meter 3 -> chase music', evr.chase);
  check(evr.hold === 'chase', 'chase music holds for a moment after the meter drops', evr.hold);
  check(evr.mood === 'tension', 'music mood hook (tension)', evr.mood);
  const duck = await ev(async () => {
    const G = N.audio._internal.bus();
    N.emit('dialogue:open', {}); await new Promise((r) => setTimeout(r, 700)); const during = G.musicDuck.gain.value;
    N.emit('dialogue:close', {}); await new Promise((r) => setTimeout(r, 900)); const after = G.musicDuck.gain.value;
    return { during: +during.toFixed(2), after: +after.toFixed(2), mode: N.state.mode, duckFlag: N.audio._duck };
  });
  check(duck.during < 0.5 && duck.after > 0.9, 'dialogue ducks the music (' + duck.during + ') and restores it (' + duck.after + ')', duck);

  console.log('\n== walkman + tape');
  const wm = await ev(async () => { const A = N.audio; A.walkman.unlock('r_neon'); A.walkman.play('r_neon'); await new Promise((r) => setTimeout(r, 700)); const a = A.walkman.playing; const m = A.stats().music; A.walkman.stop(); return { a, m, lib: A.walkman.library }; });
  check(wm.a === 'r_neon' && wm.m === null, 'Walkman plays a cassette song and the score yields', wm);
  const tp = await ev(async () => {
    const A = N.audio, out = {};
    const p = N.player;
    A.beacon({ x: p.x + 200, y: p.y });
    const before = A.stats().sfxPlayed;
    await new Promise((r) => setTimeout(r, 1500));
    out.beacon = A.stats().beacon; out.beeps = A.stats().sfxPlayed - before; out.mode = N.state.mode;
    A.beacon(null);
    out.rec = A.rec('flour_mill');
    const t0 = performance.now();
    out.montage = await A.tapeMontage(['flour_mill', 'howzat', 'bangles', 'pigeons'], { gap: 100 });
    out.montageMs = Math.round(performance.now() - t0);
    A.music.play('title');
    await new Promise((r) => setTimeout(r, 1200));
    out.stopped = await A.tapeStop(1.0);
    await new Promise((r) => setTimeout(r, 300));
    out.after = A.stats().music;
    out.fade = +N.audio._internal.bus().musicFade.gain.value.toFixed(2);
    A.music.lock(null);
    return out;
  });
  check(tp.beacon === 'xy' && tp.beeps >= 3, 'hot/cold beacon beeps (' + tp.beeps + ' in 1.5 s at 200u)', tp);
  check(tp.rec === 'flour_mill' && tp.montage === true && tp.montageMs > 1500, '● REC + cassette montage of city sounds (' + tp.montageMs + ' ms)', tp);
  check(tp.stopped === true && tp.after === null && tp.fade === 1, '■ STOP: the score winds down like a tape deck, bus restored', tp);

  console.log('\n== settings persist');
  await ev(() => { N.audio.setVolume('music', 0.31); N.audio.setVolume('ambient', 0.42); N.audio.mute(true); });
  await page.reload();
  await page.waitForFunction(() => window.N && N.state && N.state.mode === 'title', null, { timeout: 30000 });
  const pers = await ev(() => ({ m: N.audio.getVolume('music'), a: N.audio.getVolume('ambient'), muted: N.audio.muted }));
  check(Math.abs(pers.m - 0.31) < 1e-6 && Math.abs(pers.a - 0.42) < 1e-6 && pers.muted === true, 'volumes + mute persisted across reload', pers);
  await ev(() => { N.audio.mute(false); N.audio.setVolume('music', 0.6); N.audio.setVolume('ambient', 0.65); try { localStorage.removeItem('nostalgia.audio.v1'); } catch (e) { /* ignore */ } });

  console.log('\n== OfflineAudioContext renders (non-silent, no clipping)');
  const off = await ev(async () => {
    const A = N.audio, res = [];
    for (const n of ['bell', 'auto_horn', 'car_horn', 'chetak_start', 'whistle', 'std_ring', 'cooker', 'flour_mill', 'rewind', 'bo_kaata', 'pigeons', 'mission_passed', 'dialup', 'temple_bell']) {
      const r = await A.renderOffline(n, 3); res.push({ id: n, rms: +r.rms.toFixed(4), peak: +r.peak.toFixed(3) });
    }
    for (const id of ['title', 'chase', 'oldcity', 'ending', 'r_neon']) { const r = await A.renderTrackOffline(id, 6, /^r_/.test(id) ? { radio: true } : {}); res.push({ id: 'track:' + id, rms: +r.rms.toFixed(4), peak: +r.peak.toFixed(3) }); }
    return res;
  });
  for (const r of off) check(r.rms > 0.004 && r.peak <= 1.0, 'offline ' + r.id + ' rms ' + r.rms + ' peak ' + r.peak);

  // nothing from audio in N.errors
  const nerr = await ev(() => (N.errors || []).map((e) => e.where + ': ' + String(e.msg).split('\n')[0]));
  check(nerr.length === 0, 'no N.err entries', nerr);
  check(errors.length === 0, 'zero console errors / page errors', errors.slice(0, 10));

  await browser.close();
  if (srv) srv.close();
  console.log('\n' + (failures.length ? failures.length + ' FAILURE(S):\n  ' + failures.join('\n  ') : 'ALL AUDIO CHECKS PASSED'));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
