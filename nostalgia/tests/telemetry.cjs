/* NOSTALGIA — tests/telemetry.cjs  (src/telemetry.js, ARCHITECTURE §25, design/analytics.md)
 *
 * The page is served from a local static server (http://127.0.0.1) and every POST to
 * https://gralunajtfapqkpwulyg.supabase.co/rest/v1/rpc/track_events is caught by page.route (a stand-in that checks
 * each body with the same rules as public.track_events in supabase/migrations/20261021000000_telemetry.sql and
 * answers like PostgREST). Nothing leaves this machine (it cannot reach supabase.co anyway). The SQL function itself
 * was exercised on the live project with the Supabase MCP tools (design/analytics.md "Verified").
 * window.NOSTALGIA_TELEMETRY switches telemetry on under automation (navigator.webdriver keeps it off otherwise)
 * with short timings (flush every 3 s, heartbeat window 3 s) so the cadence can be watched.
 *
 * Scenarios (ONLY=a,b,...):
 *   default   no override: under automation nothing is sent, no notice, no Settings row (protects the other suites)
 *   batch     real play: title notice, new game (real click), prologue skipped (real click), real keys -> first_control,
 *             a minigame (autoplay), a main track start + pass, a side mission, a solo party game, room + cloud events,
 *             an N.err; checks the cadence (one request per flush window), sizes, headers, body rules, event names
 *   hide      visibility hidden -> one keepalive flush at once (pagehide right after sends nothing more); a long
 *             absence starts a new session
 *   optout    Settings → Privacy → "Share anonymous play stats" OFF (real click) -> nothing sent, queue cleared;
 *             the notice's "Turn off" (real click) -> nothing sent; OK hides it for good (reload)
 *   offline   503 -> retried later, delivered once; network failure -> retried; still failing -> dropped; offline -> no try
 *   file      file:// page with the override: nothing sent (state 'file')
 *   nullcfg   ONLINE_CONFIG null with the override: nothing sent (state 'noconfig')
 *   units     prop cleaning (nested, URLs, emails, 'at', > 24 keys, > 2 KB), message cleaning, names, device class
 *   pii       a player code + nickname on the device: only sha256(code) is sent; the code, nickname and room code never
 *   phone     the notice on a 390 px phone: fits, no page scroll (screenshot tests/out/telemetry_notice_phone.png)
 * Every scenario fails on console errors / page errors except the ones it causes on purpose.
 *
 *   node nostalgia/tests/telemetry.cjs        ONLY=batch,hide
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const CFG_SRC = fs.readFileSync(path.join(ROOT, 'src/online_config.js'), 'utf8');
const SUPA_URL = (CFG_SRC.match(/url:\s*'([^']+)'/) || [])[1];
const SUPA_KEY = (CFG_SRC.match(/key:\s*'([^']+)'/) || [])[1];
const RPC = SUPA_URL + '/rest/v1/rpc/track_events';

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg) => { if (cond) ok(msg); else fail(msg); return !!cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k);

/* ---------------------------------------------------------------- static server */
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' };
function staticServer() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' })));
}

/* ---------------------------------------------------------------- the server's rules, in JS (mirror of the SQL) */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NAME_RE = /^[a-z][a-z0-9_]{1,31}$/;
const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;
const BAD_STR = /[a-z][a-z0-9+.-]*:\/\/|[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
function propsOk(p) {
  if (p == null) return true;
  if (typeof p !== 'object' || Array.isArray(p)) return false;
  if (Buffer.byteLength(JSON.stringify(p)) > 2048) return false;
  const ks = Object.keys(p);
  if (ks.length > 24) return false;
  for (const k of ks) {
    if (!KEY_RE.test(k) || k === 'at') return false;
    const v = p[k];
    if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) return false;
    if (typeof v === 'string' && (v.length > 120 || BAD_STR.test(v))) return false;
  }
  return true;
}
/** -> {ok, reason?, n, skipped, problems[]} exactly as public.track_events would answer */
function serverCheck(body) {
  const e = body && body.events;
  const bad = (reason) => ({ ok: false, reason, problems: [reason] });
  if (!e || typeof e !== 'object') return bad('bad_shape');
  if (Buffer.byteLength(JSON.stringify(e)) > 65536) return bad('too_big');
  if (e.v !== 1) return bad('bad_version');
  if (typeof e.install !== 'string' || !UUID_RE.test(e.install)) return bad('bad_install');
  if (typeof e.session !== 'string' || !UUID_RE.test(e.session)) return bad('bad_session');
  if (!(e.player == null || (typeof e.player === 'string' && /^[0-9a-f]{64}$/.test(e.player)))) return bad('bad_player');
  if (typeof e.build !== 'string' || !/^[A-Za-z0-9._+-]{1,40}$/.test(e.build)) return bad('bad_build');
  if (!['phone', 'tablet', 'desktop'].includes(e.device)) return bad('bad_device');
  if (!Array.isArray(e.list)) return bad('bad_shape');
  if (!e.list.length) return bad('empty');
  if (e.list.length > 50) return bad('too_many');
  const problems = [];
  let n = 0;
  for (const it of e.list) {
    const good = it && typeof it === 'object' && typeof it.name === 'string' && NAME_RE.test(it.name) && propsOk(it.props) && (it.t == null || typeof it.t === 'number');
    if (good) n++; else problems.push('bad item ' + JSON.stringify(it).slice(0, 120));
  }
  return { ok: true, n, skipped: e.list.length - n, problems };
}

/* ---------------------------------------------------------------- page helpers */
const OVERRIDE = { flushMs: 3000, beatS: 3 };
async function open(browser, base, o) {
  o = o || {};
  const context = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, o.context || {}));
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  const reqs = [];   // every track_events POST: {t, headers, body, check}
  const stray = [];  // any other request to supabase.co
  const mode = { status: 200, abort: false, fn: null };
  await page.route(/supabase\.co/, async (route) => {
    const req = route.request();
    if (req.url() !== RPC || req.method() !== 'POST') { stray.push(req.method() + ' ' + req.url()); return route.abort(); }
    let body = null;
    try { body = JSON.parse(req.postData() || 'null'); } catch (e) { body = null; }
    const rec = { t: Date.now(), headers: req.headers(), body, raw: req.postData() || '', check: serverCheck(body) };
    if (mode.fn) { const r = mode.fn(rec); if (r === 'abort') { rec.result = 'abort'; reqs.push(rec); return route.abort('failed'); } if (r) { rec.result = r.status; reqs.push(rec); return route.fulfill(r); } }
    if (mode.abort) { rec.result = 'abort'; reqs.push(rec); return route.abort('failed'); }
    rec.result = mode.status;
    reqs.push(rec);
    if (mode.status !== 200) return route.fulfill({ status: mode.status, contentType: 'application/json', body: '{"message":"stand-in error"}' });
    const c = rec.check;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(c.ok ? { ok: true, n: c.n, skipped: c.skipped } : { ok: false, reason: c.reason }) });
  });
  if (o.init) await page.addInitScript(o.init.fn, o.init.arg);
  const url = o.url || base + 'index.html';
  await page.goto(url);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  const events = () => reqs.flatMap((r) => (r.body && r.body.events && r.body.events.list) || []);
  return { context, page, errors, reqs, stray, mode, events };
}
const setTm = (o) => ({ fn: (c) => { window.NOSTALGIA_TELEMETRY = c; }, arg: o });
async function waitReqs(R, n, ms) { const t0 = Date.now(); while (R.reqs.length < n && Date.now() - t0 < ms) await sleep(100); return R.reqs.length >= n; }
function noErrors(R, label, allow) {
  const errs = R.errors.filter((e) => !(allow || []).some((a) => a.test(e)));
  check(!errs.length, label + ': no console / page errors' + (errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''));
  check(!R.stray.length, label + ': no other calls to Supabase' + (R.stray.length ? ' — ' + R.stray.slice(0, 2).join(' | ') : ''));
}
async function startGame(page, real) {
  if (real) {
    // the real flow (menus.js / story.js skip the name card and the prologue under automation unless quickStart is off)
    await page.evaluate(() => { N.menus.quickStart = false; });
    await page.click('#title-start');
    await page.waitForFunction(() => N.menus.debugState().top === 'name', null, { timeout: 5000 });
    await page.click('.mn-name [data-act=start]');
    await page.waitForFunction(() => N.state.mode === 'cutscene', null, { timeout: 8000 });
    await page.waitForSelector('.cs-skip', { state: 'visible', timeout: 5000 });
    await page.click('.cs-skip');
    await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 15000 });
    return;
  }
  await page.click('#title-start');
  await page.waitForFunction(() => N.state.mode === 'play' || N.state.mode === 'cutscene', null, { timeout: 8000 });
  if (await page.evaluate(() => N.state.mode === 'cutscene')) await page.click('.cs-skip');
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 10000 });
}
async function hide(page, hidden) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/* ================================================================ scenarios */
async function sDefault(browser, base) {
  console.log('\n== default (automation, no override)');
  const R = await open(browser, base);
  const st = await R.page.evaluate(() => ({ state: N.telemetry.state, active: N.telemetry.active, sys: !!N.systems.get('telemetry'), note: !!document.querySelector('.tm-note:not([hidden])') }));
  check(st.state === 'automation' && !st.active, 'under navigator.webdriver telemetry is off (' + st.state + ')');
  check(!st.sys, 'no per-frame system registered');
  check(!st.note, 'no title notice');
  await R.page.click('[data-act=settings]');
  await R.page.waitForSelector('.mn-settings.show');
  check(!(await R.page.$('.st-row[data-id=telemetry]')), 'no Settings row');
  await R.page.keyboard.press('Escape');
  await startGame(R.page);
  await R.page.keyboard.down('KeyW'); await sleep(800); await R.page.keyboard.up('KeyW');
  await sleep(1500);
  check(R.reqs.length === 0, 'nothing sent (' + R.reqs.length + ' requests)');
  noErrors(R, 'default');
  await R.context.close();
}

async function sBatch(browser, base) {
  console.log('\n== batch (real play, flush every 3 s)');
  const R = await open(browser, base, { init: setTm(Object.assign({ activeMs: 2500 }, OVERRIDE)), context: { locale: 'en-IN', timezoneId: 'Asia/Kolkata' } });
  const { page } = R;
  const t0 = Date.now();
  const st = await page.evaluate(() => ({ state: N.telemetry.state, q: N.telemetry._debug.queue().map((e) => e.name), note: N.telemetry._debug.notice() }));
  check(st.state === 'on', 'override switches it on (' + st.state + ')');
  check(st.q.includes('session_start') && st.q.includes('perf_boot') && st.q.includes('title_shown') && st.q.includes('settings'), 'queued at boot: ' + st.q.join(', '));
  check(st.note.shown, 'the one-time notice is on the title');
  await page.screenshot({ path: path.join(OUT, 'telemetry_notice_desktop.png') });
  const origin = await page.evaluate(() => performance.timeOrigin);
  await waitReqs(R, 1, 6000);
  check(R.reqs.length >= 1 && R.reqs[0].t - origin >= 2900, 'the first request comes one flush window after the page opened (' + (R.reqs.length ? ((R.reqs[0].t - origin) / 1000).toFixed(1) + ' s' : 'none') + '), with the boot events batched (' + (R.reqs[0] ? R.reqs[0].body.events.list.length : 0) + ')');
  // settings row (real click into Settings from the title)
  await page.click('[data-act=settings]');
  await page.waitForSelector('.mn-settings.show');
  const row = await page.$eval('.st-row[data-id=telemetry]', (r) => ({ label: r.querySelector('.st-l').textContent, on: r.querySelector('.st-tog').classList.contains('is-on'), sec: (() => { let e = r.previousElementSibling; while (e && !e.classList.contains('st-sec')) e = e.previousElementSibling; return e && e.textContent; })() })).catch(() => null);
  check(row && /Share anonymous play stats/.test(row.label) && row.on && row.sec === 'Privacy', 'Settings → Privacy → "Share anonymous play stats" is ON by default');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => N.menus.topPanelId() === 'title');
  // play: PLAY -> name card START -> prologue SKIP (real clicks) -> real keys
  await startGame(page, true);
  await page.keyboard.down('KeyD'); await sleep(900); await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyS'); await sleep(600); await page.keyboard.up('KeyS');
  // a minigame (autoplay), a main track, a side mission, a solo party game, room + cloud events, an error
  await page.evaluate(() => N.minigames.play('antenna', { autoplay: 'win', timeScale: 8, skipHowto: true, noRetry: true, instantClose: true }));
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 15000 });
  await page.evaluate(async () => {
    N.missions.start('bo_kaata');
    await new Promise((r) => setTimeout(r, 400));
    N.missions.complete();
    await new Promise((r) => setTimeout(r, 400));
    N.missions.register({ id: 'tm_test_side', kind: 'side', title: 'Telemetry test', autosave: false, script: async () => new Promise(() => {}) });
    N.missions.start('tm_test_side');
    await new Promise((r) => setTimeout(r, 300));
    N.missions.fail('test');
    // party: the real events party.js emits, for a solo run with two AI friends (the activity itself is party.cjs's job)
    N.emit('party:start', { id: 'chai_run', sid: 'tst1', mode: 'solo', players: ['me', 'ai:immu', 'ai:ayesha'] });
    N.emit('party:results', { id: 'chai_run', sid: 'tst1', standings: ['ai:immu', 'me', 'ai:ayesha'] });
    N.emit('party:end', { id: 'chai_run', sid: 'tst1', reason: 'done' });
    N.emit('online:room', { code: 'CHAI-42' });
    await new Promise((r) => setTimeout(r, 50));
    N.emit('online:players', { n: 2 });
    N.emit('party:challenge', { id: 'race_tank_bund', sid: 'tst2' });
    N.emit('online:cloud', { what: 'push', slot: 'main' });
    N.emit('online:room', { code: null });
    N.err('test.telemetry', new Error('Boom at https://example.com/x.js:12:7 for 345 ms'));
    N.settings.set('textSpeed', 'fast');
  });
  await sleep(3500); // the settings debounce + a heartbeat window
  await page.keyboard.down('KeyA'); await sleep(500); await page.keyboard.up('KeyA');
  await waitReqs(R, 3, 12000);
  await sleep(4000);
  const names = R.events().map((e) => e.name);
  for (const n of ['session_start', 'settings', 'perf_boot', 'title_shown', 'new_game', 'intro_skipped', 'first_control', 'heartbeat', 'mg_start', 'mg_end',
    'track_start', 'track_pass', 'chapter', 'side_start', 'side_end', 'party_start', 'party_end', 'room_create', 'room_leave', 'party_challenge', 'cloud_save', 'error', 'setting']) {
    check(names.includes(n), 'sent ' + n);
  }
  // cadence: no two regular requests closer than the flush window
  const gaps = R.reqs.slice(1).map((r, i) => r.t - R.reqs[i].t);
  check(R.reqs.length >= 2 && gaps.every((g) => g >= 2700), 'one request per flush window (' + R.reqs.length + ' requests, gaps ' + gaps.map((g) => (g / 1000).toFixed(1) + ' s').join(', ') + ')');
  check(R.reqs.every((r) => r.check.ok && !r.check.skipped && !r.check.problems.length), 'every body passes the server rules' + (R.reqs.find((r) => !r.check.ok || r.check.problems.length) ? ' — ' + JSON.stringify(R.reqs.find((r) => !r.check.ok || r.check.problems.length).check) : ''));
  check(R.reqs.every((r) => r.raw.length < 32000 && r.body.events.list.length <= 50), 'batches ≤ 50 events and < 32 KB (largest ' + Math.max(...R.reqs.map((r) => r.raw.length)) + ' bytes)');
  check(R.reqs.every((r) => r.headers.apikey === SUPA_KEY && r.headers.authorization === 'Bearer ' + SUPA_KEY && /application\/json/.test(r.headers['content-type'] || '')), 'headers: apikey + Authorization Bearer <publishable key> + JSON (as supabase-js sends them)');
  const ev = (n) => R.events().find((e) => e.name === n) || {};
  const ss = ev('session_start').props || {};
  check(ss.ret === false && ss.n === 0 && ss.touch === false && /^\d+x\d+$/.test(ss.scr) && ss.dpr === 1 && ss.tz === 5.5 && ss.lang === 'en-IN', 'session_start props: ' + JSON.stringify(ss));
  check(R.reqs[0].body.events.device === 'desktop' && /^0\.1\.0/.test(R.reqs[0].body.events.build), 'device desktop, build ' + R.reqs[0].body.events.build);
  const tp = ev('track_pass').props || {};
  check(tp.id === 'bo_kaata' && tp.track === 1 && tp.attempt === 1 && tp.ch === 1, 'track_pass {id, track 1, chapter 1, attempt 1}: ' + JSON.stringify(tp));
  const se = ev('side_end').props || {};
  check(se.id === 'tm_test_side' && se.result === 'fail' && se.kind === 'side', 'side_end ' + JSON.stringify(se));
  const me = ev('mg_end').props || {};
  check(me.id === 'antenna' && me.win === true && typeof me.dur === 'number', 'mg_end ' + JSON.stringify(me));
  const pe = ev('party_end').props || {};
  check(pe.id === 'chai_run' && pe.mode === 'solo' && pe.humans === 1 && pe.ai === 2 && pe.place === 2, 'party_end (solo, 1 human + 2 AI, 2nd place) ' + JSON.stringify(pe));
  const rl = ev('room_leave').props || {};
  check(rl.peak === 2 && typeof rl.dur === 'number', 'room_leave {peak 2} ' + JSON.stringify(rl));
  const er = ev('error').props || {};
  check(er.src === 'test.telemetry' && er.n === 1 && !/https?:|\d/.test(er.msg) && /Boom/.test(er.msg), 'error message cleaned: "' + er.msg + '"');
  const hb = R.events().filter((e) => e.name === 'heartbeat').map((e) => e.props);
  check(hb.length >= 1 && hb.every((h) => h.act >= 1 && h.sec <= 6 && typeof h.fps === 'string'), 'heartbeats (' + hb.length + '): ' + JSON.stringify(hb[0]));
  const fc = ev('first_control').props || {};
  check(fc.how === 'new' && fc.after >= 0, 'first_control ' + JSON.stringify(fc));
  check(ev('setting').props && ev('setting').props.key === 'textspeed' && ev('setting').props.value === 'fast', 'setting {textspeed: fast}');
  check(R.events().every((e) => typeof e.t === 'number' && e.t >= 0), 'every event carries t (s since the session started)');
  // idle: once the "active" window (2.5 s here, 30 s live) has passed with no input, no heartbeat and no request
  await sleep(3000);
  const nBefore = R.reqs.length;
  await sleep(7000);
  const idleQ = await page.evaluate(() => N.telemetry._debug.queue().length);
  check(R.reqs.length === nBefore && idleQ === 0, 'idle (no input): no heartbeat, nothing sent for 7 s (' + (R.reqs.length - nBefore) + ' requests)');
  fs.writeFileSync(path.join(OUT, 'telemetry_bodies.json'), JSON.stringify(R.reqs.map((r) => r.body), null, 1));
  ok('bodies saved: tests/out/telemetry_bodies.json (' + R.reqs.length + ' requests, ' + R.events().length + ' events in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  noErrors(R, 'batch', [/\[N\.err\] test\.telemetry/]);
  await R.context.close();
}

async function sHide(browser, base) {
  console.log('\n== hide (keepalive flush on visibility hidden / pagehide)');
  const R = await open(browser, base, { init: setTm({ flushMs: 60000, beatS: 60 }) });
  const { page } = R;
  await page.evaluate(() => { if (N.telemetry._debug.notice().shown) document.querySelector('.tm-note [data-tm=ok]').click(); });
  await startGame(page);
  await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW');
  check(R.reqs.length === 0, 'nothing sent before the minute is up');
  const tHide = Date.now();
  await hide(page, true);
  await waitReqs(R, 1, 3000);
  check(R.reqs.length === 1 && R.reqs[0].t - tHide < 1500, 'tab hidden: one flush at once (' + (R.reqs.length ? R.reqs[0].t - tHide + ' ms' : 'none') + ')');
  const names = R.events().map((e) => e.name);
  check(names.includes('heartbeat') && names.includes('new_game') && names.includes('first_control'), 'it carries the partial heartbeat + the queue: ' + names.join(', '));
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await sleep(800);
  check(R.reqs.length === 1, 'pagehide right after: nothing more (deduped by the empty queue)');
  // back after > 30 min away: a new session
  const s1 = await page.evaluate(() => N.telemetry.session);
  await page.evaluate(() => { N.telemetry.TUNE.newSessionAfterMs = 200; });
  await sleep(400);
  await hide(page, false);
  const s2 = await page.evaluate(() => ({ s: N.telemetry.session, q: N.telemetry._debug.queue().map((e) => e.name + (e.props.resume ? '(resume)' : '')) }));
  check(s2.s !== s1 && s2.q.includes('session_start(resume)'), 'back after a long absence: new session id, session_start {resume: true}');
  noErrors(R, 'hide');
  await R.context.close();
}

async function sOptout(browser, base) {
  console.log('\n== optout');
  // A: the Settings toggle (real clicks)
  let R = await open(browser, base, { init: setTm(OVERRIDE) });
  let page = R.page;
  await page.click('[data-act=settings]');
  await page.waitForSelector('.mn-settings.show');
  await page.click('.st-row[data-id=telemetry] .st-tog');
  const after = await page.evaluate(() => ({ on: N.telemetry.on, active: N.telemetry.active, q: N.telemetry._debug.queue().length, tog: document.querySelector('.st-row[data-id=telemetry] .st-tog').classList.contains('is-on'), ls: JSON.parse(localStorage.getItem('nostalgia.telemetry.v1')).on }));
  check(!after.on && !after.active && after.q === 0 && !after.tog && after.ls === false, 'toggle OFF: stops, clears the queue, remembered (' + JSON.stringify(after) + ')');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => N.menus.topPanelId() === 'title');
  await startGame(page);
  await page.keyboard.down('KeyW'); await sleep(1000); await page.keyboard.up('KeyW');
  await page.evaluate(() => { N.err('test.optout', new Error('x')); N.minigames.play('antenna', { autoplay: 'win', timeScale: 8, skipHowto: true, noRetry: true, instantClose: true }); });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 15000 });
  await sleep(4000);
  await hide(page, true);
  await sleep(1000);
  check(R.reqs.length === 0, 'opted out: nothing sent while playing or on hide (' + R.reqs.length + ')');
  check(await page.evaluate(() => N.telemetry._debug.queue().length === 0), 'queue stays empty');
  await page.reload();
  await page.waitForFunction(() => window.N && N.state.mode === 'title', null, { timeout: 30000 });
  check(await page.evaluate(() => !N.telemetry.active && !N.telemetry.on && N.telemetry._debug.queue().length === 0), 'still off after a reload');
  await sleep(3500);
  check(R.reqs.length === 0, 'and nothing sent after the reload');
  noErrors(R, 'optout/settings', [/\[N\.err\] test\.optout/]);
  await R.context.close();
  // B: the notice's "Turn off" (real click), before the first flush
  R = await open(browser, base, { init: setTm(OVERRIDE) });
  page = R.page;
  check(await page.isVisible('.tm-note'), 'notice visible on a fresh install');
  await page.click('.tm-note [data-tm=off]');
  const b = await page.evaluate(() => ({ on: N.telemetry.on, q: N.telemetry._debug.queue().length, text: document.querySelector('.tm-note p').textContent }));
  check(!b.on && b.q === 0 && /off/.test(b.text), 'notice "Turn off": off at once, queue cleared ("' + b.text + '")');
  await sleep(4000);
  check(R.reqs.length === 0, 'nothing ever sent');
  await page.reload();
  await page.waitForFunction(() => window.N && N.state.mode === 'title', null, { timeout: 30000 });
  check(!(await page.isVisible('.tm-note')), 'the notice does not come back');
  noErrors(R, 'optout/notice');
  await R.context.close();
  // C: OK hides it for good
  R = await open(browser, base, { init: setTm(OVERRIDE) });
  page = R.page;
  await page.click('.tm-note [data-tm=ok]');
  check(!(await page.isVisible('.tm-note')) && (await page.evaluate(() => N.telemetry.on)), 'notice OK: hidden, stats stay on');
  await page.reload();
  await page.waitForFunction(() => window.N && N.state.mode === 'title', null, { timeout: 30000 });
  await sleep(300);
  check(!(await page.isVisible('.tm-note')), 'one time only (not shown after a reload)');
  noErrors(R, 'optout/ok');
  await R.context.close();
}

async function sOffline(browser, base) {
  console.log('\n== offline / retries');
  const R = await open(browser, base, { init: setTm({ flushMs: 1500, beatS: 60, retries: 2 }) });
  const { page } = R;
  // 1) a 503, then fine: the same events arrive once
  R.mode.status = 503;
  await page.evaluate(() => { N.telemetry.track('continue', {}); N.telemetry._debug.nudge(); });
  await waitReqs(R, 1, 4000);
  R.mode.status = 200;
  await waitReqs(R, 2, 6000);
  const ids = (r) => r.body.events.list.map((e) => e.name + '@' + e.t).join(',');
  check(R.reqs.length === 2 && R.reqs[0].result === 503 && R.reqs[1].result === 200 && ids(R.reqs[0]) === ids(R.reqs[1]), '503 -> the same batch again ' + ((R.reqs[1] ? R.reqs[1].t - R.reqs[0].t : 0) / 1000).toFixed(1) + ' s later, then delivered');
  await sleep(2500);
  check(R.reqs.length === 2, 'delivered once (no duplicate after the success)');
  // 2) network failures until the retries run out: dropped
  R.mode.abort = true;
  await page.evaluate(() => { N.telemetry.track('continue', { x: 1 }); N.telemetry._debug.nudge(); });
  await waitReqs(R, 5, 12000);
  await sleep(4500);
  const st = await page.evaluate(() => ({ q: N.telemetry._debug.queue().length, s: N.telemetry._debug.stats }));
  check(R.reqs.length === 5 && st.q === 0 && st.s.dropped >= 1, 'network down: 1 try + 2 retries with backoff, then dropped (' + (R.reqs.length - 2) + ' tries, dropped ' + st.s.dropped + ')');
  R.mode.abort = false;
  // 3) offline: no attempt at all, sent when back
  await R.context.setOffline(true);
  await page.evaluate(() => { N.telemetry.track('continue', { y: 1 }); N.telemetry._debug.nudge(); });
  await sleep(2500);
  check(R.reqs.length === 5, 'offline (navigator.onLine false): no request tried');
  await R.context.setOffline(false);
  await page.evaluate(() => N.telemetry._debug.nudge());
  await waitReqs(R, 6, 6000);
  check(R.reqs.length === 6 && R.reqs[5].body.events.list.some((e) => e.props.y === 1), 'back online: sent');
  noErrors(R, 'offline', [/status of 503/, /Failed to load resource/, /ERR_FAILED|ERR_INTERNET_DISCONNECTED/]);
  await R.context.close();
}

async function sFile(browser) {
  console.log('\n== file://');
  const R = await open(browser, null, { url: 'file://' + path.join(ROOT, 'index.html'), init: setTm({ flushMs: 500, beatS: 1 }) });
  const st = await R.page.evaluate(() => ({ state: N.telemetry.state, active: N.telemetry.active, note: !!document.querySelector('.tm-note:not([hidden])') }));
  check(st.state === 'file' && !st.active && !st.note, 'file:// page: off, no notice (' + st.state + ')');
  await startGame(R.page);
  await R.page.keyboard.down('KeyW'); await sleep(1500); await R.page.keyboard.up('KeyW');
  await hide(R.page, true);
  await sleep(800);
  check(R.reqs.length === 0 && !R.stray.length, 'nothing sent');
  noErrors(R, 'file');
  await R.context.close();
}

async function sNull(browser, base) {
  console.log('\n== ONLINE_CONFIG = null');
  const R = await open(browser, base, { init: { fn: () => { window.NOSTALGIA_ONLINE_CONFIG = null; window.NOSTALGIA_TELEMETRY = { flushMs: 500, beatS: 1 }; }, arg: null } });
  const st = await R.page.evaluate(() => ({ state: N.telemetry.state, active: N.telemetry.active }));
  check(st.state === 'noconfig' && !st.active, 'null config: off (' + st.state + ')');
  await startGame(R.page);
  await R.page.keyboard.down('KeyW'); await sleep(1500); await R.page.keyboard.up('KeyW');
  await hide(R.page, true);
  await sleep(800);
  check(R.reqs.length === 0, 'nothing sent');
  noErrors(R, 'nullcfg');
  await R.context.close();
}

async function sUnits(browser, base) {
  console.log('\n== units (cleaning)');
  const R = await open(browser, base, { init: setTm({ flushMs: 600000, beatS: 600 }) });
  const u = await R.page.evaluate(() => {
    const D = N.telemetry._debug;
    const big = {}; for (let i = 0; i < 30; i++) big['k' + i] = i;
    const long = { a: 'x'.repeat(119), b: 'y'.repeat(200) };
    const huge = {}; for (let i = 0; i < 20; i++) huge['s' + i] = 'z'.repeat(119);
    return {
      nested: D.cleanProps({ a: 1, o: { x: 1 }, arr: [1], f: () => 1, u: undefined, n: null, b: true, s: 'ok', nan: NaN }),
      url: D.cleanProps({ s: 'see https://evil.example/x', e: 'mail me@x.com', fine: 'Room CHAI' }),
      keys: D.cleanProps({ Bad: 1, '1x': 2, at: 3, good_key: 4, 'with-dash': 5 }),
      big: Object.keys(D.cleanProps(big)).length,
      long: D.cleanProps(long),
      badName: N.telemetry.track('Bad Name', {}), goodName: N.telemetry.track('units_ok', { a: 1 }),
      hugeOk: N.telemetry.track('units_huge', huge),
      msg: D.cleanMsg('TypeError: x is undefined at https://a.b/c.js:10:5\n    at foo (file:///x/y.js:1:1)'),
      msg2: D.cleanMsg('cannot read user@mail.com /home/user/x.js 4521'),
      src: D.cleanSrc('update:traffic <script>12345'),
      buckets: [D.msBucket(400), D.msBucket(2500), D.msBucket(45000), D.fpsBucket(59), D.fpsBucket(25), D.fpsBucket(0)],
      device: N.telemetry.DEVICE,
      q: D.queue().map((e) => e.name),
    };
  });
  check(JSON.stringify(u.nested) === JSON.stringify({ a: 1, n: null, b: true, s: 'ok' }), 'nested / arrays / functions / NaN dropped: ' + JSON.stringify(u.nested));
  check(u.url.s === '' && u.url.e === '' && u.url.fine === 'Room CHAI', 'URLs and emails blanked: ' + JSON.stringify(u.url));
  check(JSON.stringify(u.keys) === JSON.stringify({ good_key: 4 }), 'bad keys and the reserved "at" dropped: ' + JSON.stringify(u.keys));
  check(u.big === 24, '≤ 24 keys (' + u.big + ')');
  check(u.long.a.length === 119 && u.long.b.length === 120, 'strings cut to 120');
  check(!u.badName && u.goodName && !u.hugeOk && u.q.includes('units_ok') && !u.q.includes('units_huge'), 'bad names refused, > 2 KB props refused');
  check(u.msg === 'TypeError: x is undefined at <url>', 'message: first line, no URL ("' + u.msg + '")');
  check(u.msg2 === 'cannot read <email> <path> #', 'message: no email / path / numbers ("' + u.msg2 + '")');
  check(u.src === 'update:trafficscript#', 'source cleaned ("' + u.src + '")');
  check(JSON.stringify(u.buckets) === JSON.stringify(['0-1s', '2-3s', '30s+', '55+', '20-30', null]), 'buckets ' + JSON.stringify(u.buckets));
  check(u.device === 'desktop', 'device class desktop');
  noErrors(R, 'units');
  await R.context.close();
}

async function sPii(browser, base) {
  console.log('\n== pii (player code + nickname on the device)');
  const CODE = 'CHAI-PATANG-GULLY-4821-K7QXM', NICK = 'Ravi Kumar';
  const R = await open(browser, base, { init: setTm(OVERRIDE), context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } });
  const { page } = R;
  // the player went online before: online.js reads the code at load; give N.online the code without opening the network
  await page.evaluate(([c]) => { Object.defineProperty(N.online, 'code', { configurable: true, get: () => c }); }, [CODE]);
  await page.evaluate(() => N.telemetry._debug.playerHash());
  await page.tap('.tm-note [data-tm=ok]');
  await page.tap('#title-start');
  await page.waitForFunction(() => N.state.mode === 'play' || N.state.mode === 'cutscene' || N.menus.debugState().top === 'name', null, { timeout: 8000 });
  if (await page.evaluate(() => N.state.mode === 'cutscene')) await page.tap('.cs-skip');
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 10000 });
  await page.evaluate(([n]) => { try { N.menus.setNames(n, n + ' Sharma'); } catch (e) { /* ignore */ } N.emit('online:room', { code: 'CHAI-42' }); N.emit('online:room', { code: null }); N.telemetry.track('units_ok', { a: 1 }); }, [NICK]);
  await sleep(3800);
  await hide(page, true);
  await waitReqs(R, 1, 4000);
  const raw = R.reqs.map((r) => r.raw).join('\n');
  const want = crypto.createHash('sha256').update(CODE).digest('hex');
  check(R.reqs.length >= 1 && R.reqs.every((r) => r.body.events.player === want), 'player = sha256(code) on every batch');
  check(!raw.includes(CODE) && !raw.includes('PATANG') && !raw.includes('K7QXM'), 'the player code never appears');
  check(!raw.includes('Ravi') && !raw.includes('Sharma') && !raw.includes('CHAI-42'), 'the nickname and the room code never appear');
  const keys = new Set(R.events().flatMap((e) => Object.keys(e.props || {})));
  const BAD = ['name', 'nick', 'nickname', 'email', 'code', 'ip', 'user', 'phone', 'address', 'room_code', 'text', 'msg_text', 'full'];
  check(![...keys].some((k) => BAD.includes(k)), 'no personal fields among the prop keys: ' + [...keys].sort().join(' '));
  const top = Object.keys(R.reqs[0].body.events).sort().join(',');
  check(top === 'build,device,install,list,player,session,v', 'envelope fields only: ' + top);
  check(R.reqs[0].body.events.device === 'phone', 'device phone on a 390 px touch phone');
  noErrors(R, 'pii');
  await R.context.close();
}

async function sPhone(browser, base) {
  console.log('\n== phone (notice layout)');
  const R = await open(browser, base, { init: setTm(OVERRIDE), context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } });
  const { page } = R;
  await sleep(400);
  const box = await page.$eval('.tm-note', (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
  const sc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  check(box.l >= 15 && box.r <= 390 - 15 && box.b <= 844 && box.h < 120, 'notice fits the phone with 16 px gutters: ' + JSON.stringify(box));
  check(sc.sw <= sc.iw, 'no horizontal page scroll');
  await page.screenshot({ path: path.join(OUT, 'telemetry_notice_phone.png') });
  ok('screenshot tests/out/telemetry_notice_phone.png');
  noErrors(R, 'phone');
  await R.context.close();
}

/* ================================================================ main */
(async () => {
  const { srv, url } = await staticServer();
  const browser = await chromium.launch({ args: ['--disable-gpu-compositing'] });
  try {
    if (only('default')) await sDefault(browser, url);
    if (only('batch')) await sBatch(browser, url);
    if (only('hide')) await sHide(browser, url);
    if (only('optout')) await sOptout(browser, url);
    if (only('offline')) await sOffline(browser, url);
    if (only('file')) await sFile(browser);
    if (only('nullcfg')) await sNull(browser, url);
    if (only('units')) await sUnits(browser, url);
    if (only('pii')) await sPii(browser, url);
    if (only('phone')) await sPhone(browser, url);
  } catch (e) {
    fail('crashed: ' + (e.stack || e.message));
  } finally {
    await browser.close();
    srv.close();
  }
  console.log('\n' + (failures.length ? failures.length + ' FAILED:\n  ' + failures.join('\n  ') : 'ALL OK'));
  process.exit(failures.length ? 1 : 0);
})();
