/* NOSTALGIA — tests/online.cjs  (src/online.js, ARCHITECTURE §23)
 *
 * IMPORTANT: this machine cannot reach *.supabase.co or the CDNs (egress policy), so the game talks to
 * tests/online_mock.cjs: a local stand-in that speaks the real Supabase wire protocols (PostgREST RPC +
 * Realtime Phoenix websockets) with the same rules as supabase/migrations/*_online.sql. The game runs its
 * REAL code path: the vendored @supabase/supabase-js 2.118.0 (served for the jsDelivr URL), createClient,
 * rpc(), channel presence + broadcast. The SQL functions themselves were checked on the live project with
 * the Supabase MCP tools (see design/online_setup.md "Verified").
 *
 * Covers: config = null ("coming soon", nothing loaded, zero errors); file:// ("needs the web version");
 * player code + nickname (+ kid filter); THE ROOM FLOW (flow): Create from the title -> in the city with no extra
 * click (no save: a new game, intro skipped; a double press opens one room and starts once); Join from the title on a
 * phone with a save -> the save continues and the joiner stands a few metres from the friend; Join from the pause
 * deck mid-mission -> not moved, a pink route + 👫 Go to friends (works after the mission); the 4th player refused
 * (rooms of 3); the "Nearby" card (desktop card, phone chip) and its one-tap Challenge -> party invites; the arrival
 * toast "You're all at Gokul Chat — Pani puri contest? [🏁 Start]"; three pages (separate phones) in one room seeing
 * each other move in 2D and 3D (swiftshader, three.js from vendor/); meet pin -> waypoint + toast for everyone;
 * quick-chat bubbles; a closed page disappearing for the others; cloud save round trip with "Use my code" on a new
 * phone and the newer-save guard both ways; the journey + Journal page.
 *
 *   node nostalgia/tests/online.cjs            ONLY=basic|flow|room|dist|cloud   SHOTS=0 (skip screenshots)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const mock = require('./online_mock.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const SDK_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
const SDK_JS = fs.readFileSync(path.join(ROOT, 'vendor/supabase/supabase.js'), 'utf8');
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
// --disable-gpu-compositing: without it the software-GL compositor stalls rAF on a loaded machine
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-compositing'];
const SHOT_MS = 180000;

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg) => { if (cond) ok(msg); else fail(msg); return !!cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k);

/* ---------------------------------------------------------------- static server for the game */
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' };
function staticServer() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' })));
}

/* ---------------------------------------------------------------- page helpers */
async function newPhone(browser, name, conf, o) {
  o = o || {};
  const context = await browser.newContext({ viewport: o.viewport || { width: 960, height: 600 }, deviceScaleFactor: 1, hasTouch: !!o.touch, isMobile: !!o.touch });
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('request', (r) => requests.push(r.url()));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(SDK_CDN, (r) => (o.cdnDown ? r.abort() : r.fulfill({ status: 200, contentType: 'application/javascript', body: SDK_JS })));
  await page.route(THREE_CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  if (conf !== undefined) await page.addInitScript((c) => { window.NOSTALGIA_ONLINE_CONFIG = c; }, conf);
  await page.goto(o.url + '#debug');
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 60000 });
  const P = { name, page, context, errors, requests };
  P.ev = (fn, arg) => page.evaluate(fn, arg);
  P.shot = async (n) => { if (process.env.SHOTS === '0') return; await page.screenshot({ path: path.join(OUT, 'online_' + n + '.png'), timeout: SHOT_MS }); };
  P.errs = async () => errors.concat(await page.evaluate(() => (N.debug.state().errors || []).map((e) => 'N.err ' + e)).catch(() => []));
  return P;
}
async function play(P, place, dx, dy) {
  await P.ev(() => { N.debug.newGame({ skipIntro: true }); });
  await P.page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 15000 });
  await P.ev(([pl, x, y]) => { N.debug.setTime(11, 0); N.debug.freezeClock && N.debug.freezeClock(true); const q = N.debug.teleport(pl); if (q) N.player.teleport(q.x + x, q.y + y); }, [place, dx || 0, dy || 0]);
}
const until = async (P, fn, arg, ms) => P.page.waitForFunction(fn, arg, { timeout: ms || 8000, polling: 100 }).then(() => true, () => false);
// game-time wait: n rendered frames on that page (not a fixed sleep: this machine is shared and frames can be slow)
const frames = async (P, n) => { const f0 = await P.ev(() => N.time.frame); return until(P, ([a, k]) => N.time.frame >= a + k, [f0, n], 60000); };

(async () => {
  const S = await staticServer();
  const M = await mock.start({ key: 'test-publishable-key' });
  const CONF = { provider: 'supabase', url: M.url, key: M.key, sdk: [SDK_CDN, 'vendor/supabase/supabase.js'], maxPlayers: 3, stateHz: 8 };
  const browser = await chromium.launch({ args: ARGS });
  const phones = [];
  try {
    /* ============================================================ basic: config null, file://, code + nick */
    if (only('basic')) {
      console.log('\n== config = null: "coming soon"');
      const Z = await newPhone(browser, 'null', null, { url: S.url });
      phones.push(Z);
      await Z.page.click('.trk-online button');
      await until(Z, () => N.menus.topPanelId() === 'online');
      const txt = await Z.ev(() => document.querySelector('.mn-online .ol-body').textContent);
      check(/Online play is coming soon/.test(txt), 'Online panel says "Online play is coming soon"');
      check(await Z.ev(() => document.querySelector('.trk-online .online-sub').textContent) === 'coming soon', 'title ONLINE track subtitle "coming soon"');
      await Z.shot('null_coming_soon');
      await Z.page.keyboard.press('Escape');
      await Z.ev(() => N.debug.newGame({ skipIntro: true }));
      await sleep(600);
      await Z.ev(() => N.game.pause());
      await sleep(300);
      check(await Z.ev(() => !document.querySelector('.k-online').hidden && /coming soon/.test(document.querySelector('.k-online .why').textContent)), 'pause deck Online key says "coming soon"');
      await Z.shot('null_pause');
      await Z.ev(() => N.game.resume());
      const net = Z.requests.filter((u) => /supabase|jsdelivr|127\.0\.0\.1:\d+\/(rest|realtime)/.test(u) || u.startsWith(M.url));
      check(!net.length, 'config null: nothing online loaded (' + net.length + ' requests)');
      check(await Z.ev(() => !window.supabase), 'config null: no SDK on the page');
      const ze = await Z.errs();
      check(!ze.length, 'config null: zero errors' + (ze.length ? ': ' + ze.slice(0, 3).join(' | ') : ''));
      await Z.context.close();

      console.log('\n== file:// (offline copy): "needs the web version"');
      const F = await newPhone(browser, 'file', undefined, { url: 'file://' + path.join(ROOT, 'index.html') });
      phones.push(F);
      await F.ev(() => N.online.open({ from: 'title' }));
      await sleep(200);
      check(/needs the web version/.test(await F.ev(() => document.querySelector('.mn-online .ol-body').textContent)), 'file:// Online panel says it needs the web version');
      check(F.requests.every((u) => u.startsWith('file:') || /fonts/.test(u)), 'file://: no network requests');
      const fe = await F.errs();
      check(!fe.length, 'file://: zero errors' + (fe.length ? ': ' + fe.slice(0, 3).join(' | ') : ''));
      await F.context.close();

      console.log('\n== player code + nickname');
      const A = await newPhone(browser, 'code', CONF, { url: S.url });
      phones.push(A);
      const u = await A.ev(() => ({ bits: N.online.CODE_BITS, words: N.online.WORDS_N, codes: Array.from({ length: 200 }, () => N.online.newCode()) }));
      check(u.bits >= 60, 'player code entropy ' + u.bits.toFixed(1) + ' bits (>= 60), ' + u.words + ' words');
      check(u.codes.every((c) => /^[A-Z]{3,8}-[A-Z]{3,8}-[A-Z]{3,8}-[0-9]{4}-[0-9A-HJKMNP-TV-Z]{5}$/.test(c)) && new Set(u.codes).size === 200, 'codes look like ' + u.codes[0] + ' and never repeat (200)');
      const nk = await A.ev(() => ['Ravi', 'Chinnu 7', 'ab', 'f u c k', 'Fuuuck', 'sh1t', 'Pooja!!', 'kutta boy', 'x'.repeat(20)].map((s) => [s, N.online.nickOk(s).ok]));
      check(JSON.stringify(nk.map((x) => x[1])) === JSON.stringify([true, true, false, false, false, false, true, false, true]), 'nickname filter: ' + nk.map((x) => x[0] + '=' + x[1]).join(', '));
      check(await A.ev(() => N.online.normCode(' chai patang gully 4821 k7qxo ') === 'CHAI-PATANG-GULLY-4821-K7QX0'), 'typed codes are tidied (case, spaces, O->0)');
      await A.ev(() => N.online.open({ from: 'title' }));
      await A.page.click('.mn-online [data-act=more]');
      await A.page.click('.mn-online [data-act=start]');
      const online = await until(A, () => !!N.online.code && N.online.ready, null, 15000);
      check(online, 'Go online: SDK loaded (CDN url, vendored file) and a code made: ' + await A.ev(() => N.online.code));
      check(A.requests.some((r) => r === SDK_CDN), 'SDK requested from jsDelivr first');
      await A.page.fill('.mn-online input[data-k=nick]', 'Ravi');
      await A.page.click('.mn-online [data-act=nick]');
      await until(A, () => /Name saved/.test(document.querySelector('.mn-online .ol-msg') && document.querySelector('.mn-online .ol-msg').textContent));
      const prof = [...M.db.profiles.values()].map((p) => p.nick);
      check(prof.includes('Ravi'), 'nickname stored in the cloud (profile_set): ' + prof.join(','));
      await A.page.fill('.mn-online input[data-k=nick]', 'Kutta');
      await A.page.click('.mn-online [data-act=nick]');
      await sleep(300);
      check(await A.ev(() => /kinder/.test(document.querySelector('.mn-online .ol-msg').textContent) && N.online.nick === 'Ravi'), 'unkind nickname refused in the panel');
      await A.shot('panel_code');
      const ae = await A.errs();
      check(!ae.length, 'code/nick: zero errors' + (ae.length ? ': ' + ae.slice(0, 3).join(' | ') : ''));
      await A.context.close();
    }

    /* ============================================================ flow: title -> room -> straight into the city, next to friends */
    if (only('flow')) {
      console.log('\n== flow: Create on the title -> in the city with no extra click; Join -> next to the friend');
      const gameStarts = (P) => P.ev(() => { window.__starts = 0; N.on('game:new', () => { window.__starts++; }); N.on('game:continue', () => { window.__starts++; }); });
      const where = (P) => P.ev(() => ({ x: N.player.x, y: N.player.y }));
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      // A: a first-timer (no save) on a laptop
      const A = await newPhone(browser, 'flowA', CONF, { url: S.url });
      phones.push(A);
      await gameStarts(A);
      await A.ev(() => { N.online.TUNE.flowMs = 3000; }); // time for the screenshot of the code (default 1.4 s)
      await A.page.click('.trk-online button');
      await until(A, () => N.menus.topPanelId() === 'online');
      const lobby = await A.ev(() => ({ steps: Array.from(document.querySelectorAll('.mn-online .ol-steps li')).map((l) => l.textContent), create: !!document.querySelector('.mn-online [data-act=create]'), join: !!document.querySelector('.mn-online [data-act=join]'), code: !!document.querySelector('.mn-online [data-code]'), focus: document.activeElement && document.activeElement.dataset.act }));
      check(lobby.steps.length === 4 && /Create/.test(lobby.steps[0]) && /Share/.test(lobby.steps[1]) && /together/.test(lobby.steps[3]) && lobby.create && lobby.join && !lobby.code, 'first-timer panel: ' + lobby.steps.join(' → ') + '; big Create / Join; the player code folded away');
      check(lobby.focus === 'create', 'keyboard: "Create a room" has the focus');
      await A.shot('flow_panel_title');
      await A.page.fill('.mn-online input[data-k=nick]', 'Ravi');
      await A.page.press('.mn-online input[data-k=nick]', 'Enter');
      await until(A, () => N.online.nick === 'Ravi');
      // Enter on "Create a room", twice (a double press): one room, one game start, no PLAY step
      await A.ev(() => document.querySelector('.mn-online [data-act=create]').focus());
      await A.page.keyboard.press('Enter');
      await A.page.keyboard.press('Enter');
      check(await until(A, () => !!document.querySelector('.mn-online [data-room]'), null, 15000), 'the panel shows the room code to share: ' + await A.ev(() => (document.querySelector('.mn-online [data-room]') || {}).textContent));
      await A.shot('flow_panel_room_code');
      const aIn = await until(A, () => N.state.mode === 'play' && !!N.online.room && !N.menus.isPanelShown('online') && !N.menus.isPanelShown('title'), null, 20000);
      const code = await A.ev(() => N.online.room && N.online.room.code);
      await until(A, () => window.__starts >= 1, null, 2000);
      const a0 = await A.ev(() => ({ how: N.online.flow.how, starts: window.__starts, cut: N.state.has('cutscene'), mission: !!N.missions.active, prologue: !!N.flags.prologue_seen, badge: document.querySelector('.ol-badge').textContent, hint: getComputedStyle(document.querySelector('.ol-badge-hint')).display !== 'none' }));
      check(aIn && a0.how === 'new' && !a0.cut && !a0.mission, 'Create on the title -> in the city with no extra click: no save, so a new game with the intro skipped, free roam ' + JSON.stringify({ how: a0.how, cutscene: a0.cut, mission: a0.mission }));
      check(a0.starts === 1 && M.rooms.size === 1, 'the double press opened one room and started the game once (' + a0.starts + ' start, ' + M.rooms.size + ' room)');
      check(a0.prologue, 'the story can still begin later (prologue_seen: M1 waits on the home terrace)');
      check(new RegExp(code + '.*1/3').test(a0.badge) && a0.hint, 'HUD badge "' + a0.badge + '" (the code + "tell friends this code")');
      await frames(A, 30);
      await A.shot('flow_A_in_city');

      // B: a phone with a save at Abids joins from the title -> the save continues, next to Ravi
      const B = await newPhone(browser, 'flowB', CONF, { url: S.url, viewport: { width: 390, height: 844 }, touch: true });
      phones.push(B);
      await B.ev(() => N.debug.newGame({ skipIntro: true }));
      await until(B, () => N.state.mode === 'play');
      await B.ev(() => { N.debug.teleport('abids'); N.flags.__flow_save = 'pooja'; N.save.save({ reason: 'test' }); window.__saveT = N.save.info().t; N.game.quitToTitle(); });
      await until(B, () => N.state.mode === 'title');
      await gameStarts(B);
      await B.page.tap('.trk-online button');
      await until(B, () => N.menus.topPanelId() === 'online');
      await B.shot('flow_panel_title_phone');
      await B.page.fill('.mn-online input[data-k=nick]', 'Pooja');
      await B.page.tap('.mn-online [data-act=nick]');
      await until(B, () => N.online.nick === 'Pooja');
      await B.page.fill('.mn-online input[data-k=room]', code.toLowerCase().replace('-', ' '));
      await B.page.tap('.mn-online [data-act=join]');
      const bIn = await until(B, () => N.state.mode === 'play' && !N.menus.isPanelShown('online') && !!N.online.room && !N.online.flow.place, null, 30000);
      const aPos = await where(A);
      const b1 = await B.ev(() => ({ how: N.online.flow.how, flag: N.flags.__flow_save, starts: window.__starts, x: N.player.x, y: N.player.y, walk: N.world.isWalkable(N.player.x, N.player.y), surface: N.debug.state().surface }));
      check(bIn && b1.how === 'continue' && b1.flag === 'pooja' && b1.starts === 1, 'B (a save) joined on the title: the saved game continues by itself (' + b1.how + ', ' + b1.starts + ' start)');
      const dAB = dist(b1, aPos);
      check(dAB > 6 && dAB < 40 && b1.walk, 'B appears next to Ravi: ' + dAB.toFixed(0) + ' u (~' + Math.round(dAB * 1.6) + ' m) away, on ' + b1.surface);
      check(await until(A, () => { const g = N.online._debug.ghosts().find((q) => q.nick === 'Pooja'); return g && !g.hidden && Math.hypot(g.x - N.player.x, g.y - N.player.y) < 40; }, null, 8000), 'Ravi sees Pooja right beside him');
      await frames(B, 30);
      await B.shot('flow_B_next_to_A_phone');

      // C: mid-mission, joins from the pause deck -> the game resumes, C is NOT moved: a pink route + 👫 instead
      const C = await newPhone(browser, 'flowC', CONF, { url: S.url });
      phones.push(C);
      await C.ev(() => N.debug.newGame({ skipIntro: true }));
      await until(C, () => N.state.mode === 'play');
      await C.ev(() => { N.debug.teleport('charminar_plaza'); N.missions.register({ id: '__ol_errand', kind: 'job', title: 'Test errand', script: async (m) => { await m.wait(900); } }); N.missions.start('__ol_errand'); });
      await until(C, () => !!N.missions.active && N.state.mode === 'play');
      const c0 = await where(C);
      await C.ev(() => N.game.pause());
      await until(C, () => N.state.mode === 'paused');
      await C.page.click('.k-online');
      await until(C, () => N.menus.topPanelId() === 'online');
      await C.page.fill('.mn-online input[data-k=nick]', 'Imran');
      await C.page.click('.mn-online [data-act=nick]');
      await until(C, () => N.online.nick === 'Imran');
      await C.page.fill('.mn-online input[data-k=room]', code);
      await C.page.press('.mn-online input[data-k=room]', 'Enter');
      check(await until(C, () => N.state.mode === 'play' && !!N.online.room && !N.menus.isPanelShown('online') && !N.menus.isPanelShown('pause'), null, 20000), 'C joined from the pause deck (Enter in the code field): the panel closed and the game resumed by itself');
      const cOffer = await until(C, () => N.online.flow.offer && !document.querySelector('.ol-go').hidden && !!N.menus.waypointPos, null, 20000);
      const c1 = await C.ev(() => ({ x: N.player.x, y: N.player.y, mission: !!N.missions.active, near: document.querySelector('.ol-near').hidden, pulse: document.querySelector('.ol-go').classList.contains('pulse'), go: document.querySelector('.ol-go').textContent }));
      check(cOffer && dist(c0, c1) < 4 && c1.mission && c1.pulse, 'C is on a mission: not moved (' + dist(c0, c1).toFixed(1) + ' u), a pink route + the 👫 button "' + c1.go + '" instead');
      check(c1.near, 'the Nearby card stays out of the way during a mission');
      await C.shot('flow_C_mission_offer');
      await C.ev(() => N.missions.abort());
      await until(C, () => !N.missions.active);
      await C.page.click('.ol-go');
      const c2 = await where(C);
      const aNow = await where(A);
      check(dist(c2, aNow) < 40 && await C.ev(() => N.world.isWalkable(N.player.x, N.player.y) && !N.online.flow.offer), 'after the mission 👫 Go to friends takes C next to Ravi (' + dist(c2, aNow).toFixed(0) + ' u)');

      // D: the 4th player is refused (rooms of 3) and stays on the title
      const D = await newPhone(browser, 'flowD', CONF, { url: S.url });
      phones.push(D);
      await D.page.click('.trk-online button');
      await until(D, () => N.menus.topPanelId() === 'online');
      await D.page.fill('.mn-online input[data-k=room]', code);
      await D.page.click('.mn-online [data-act=join]');
      const full = await until(D, () => /full \(3\/3\)/.test((document.querySelector('.mn-online .ol-msg') || {}).textContent || ''), null, 15000);
      check(full && await D.ev(() => !N.online.room && N.state.mode === 'title') && await A.ev(() => N.online.room.n === 3), '4th player refused: "' + await D.ev(() => (document.querySelector('.mn-online .ol-msg') || {}).textContent) + '" (stays on the title)');
      await D.shot('flow_room_full_D');
      await D.context.close();

      // Nearby + the arrival toast: everybody at Gokul Chat
      console.log('  -- nearby for the group + the arrival toast');
      const nearA = await A.ev(() => ({ list: N.online.nearby(4).map((a) => a.id + ':' + a.kind), card: !document.querySelector('.ol-near').hidden && document.querySelector('.ol-near').classList.contains('open') }));
      check(nearA.list.length >= 3 && nearA.list.length <= 4 && nearA.card, 'desktop: the Nearby card is open with ' + nearA.list.join(', '));
      await A.ev(() => N.debug.teleport('gokul_chat'));
      // C: the panel's 👫 Go to friends (from the pause deck); B: the HUD's 👫 button (a tap)
      await until(C, () => N.online.nearby(1).length && Math.hypot(N.online._debug.ghosts().find((g) => g.nick === 'Ravi').x - N.player.x, N.online._debug.ghosts().find((g) => g.nick === 'Ravi').y - N.player.y) > 200, null, 8000);
      await C.ev(() => N.game.pause());
      await C.page.click('.k-online');
      await until(C, () => !!document.querySelector('.mn-online [data-act=gofriends]'));
      await C.page.click('.mn-online [data-act=gofriends]');
      check(await until(C, () => N.state.mode === 'play' && Math.hypot(N.online._debug.ghosts().find((g) => g.nick === 'Ravi').x - N.player.x, N.online._debug.ghosts().find((g) => g.nick === 'Ravi').y - N.player.y) < 40, null, 8000), 'panel "👫 Go to friends": C is back in the city next to Ravi');
      check(await until(B, () => !document.querySelector('.ol-go').hidden, null, 8000), 'B: the 👫 button shows (Ravi is ' + await B.ev(() => document.querySelector('.ol-go-d').textContent) + ' away)');
      await B.page.tap('.ol-go');
      const arrived = await Promise.all([A, B, C].map((P) => until(P, () => { const e = document.querySelector('.ol-arrive.show'); return !!e && /Gokul Chat/.test(e.textContent) && /Pani puri/i.test(e.textContent); }, null, 12000)));
      const arrTxt = await A.ev(() => (document.querySelector('.ol-arrive') || {}).textContent);
      check(arrived.every(Boolean), 'all three at Gokul Chat: the toast on every phone: "' + arrTxt + '"');
      await A.shot('flow_A_arrive_nearby');
      await B.shot('flow_B_arrive_phone');
      // phone: the Nearby card is a chip that opens
      const chip = await B.ev(() => { const n = document.querySelector('.ol-near'); return { hidden: n.hidden, open: n.classList.contains('open'), chip: getComputedStyle(n.querySelector('.ol-near-tg')).display !== 'none' }; });
      check(!chip.hidden && !chip.open && chip.chip, 'phone: Nearby is a small chip ' + JSON.stringify(chip));
      // [🏁 Start] on B's toast -> the party flow (B hosts, A and C get the invite)
      await B.page.tap('.ol-arrive [data-arr=go]');
      const inv = await Promise.all([A, C].map((P) => until(P, () => N.party._debug.cards().invite && /Pooja challenges you to Pani puri contest/.test(document.querySelector('.pt-invite').textContent), null, 8000)));
      check(inv.every(Boolean) && await B.ev(() => N.party.active && N.party.active.id === 'panipuri_contest' && N.party.active.phase === 'lobby'), 'toast [🏁 Start] on B: Ravi and Imran get "Pooja challenges you to Pani puri contest"');
      check(await A.ev(() => !document.querySelector('.ol-arrive.show') && document.querySelector('.ol-near').hidden), 'the toast and the Nearby card step aside for the invite');
      await A.shot('flow_A_invite');
      await B.ev(() => N.party.cancel());
      await Promise.all([A, C].map((P) => until(P, () => !N.party._debug.cards().invite, null, 8000)));
      await until(B, () => !N.party.uiBusy, null, 4000);
      // phone chip -> list -> Challenge
      await until(B, () => !document.querySelector('.ol-near').hidden, null, 6000);
      await B.page.tap('.ol-near-tg');
      check(await until(B, () => document.querySelector('.ol-near').classList.contains('open') && document.querySelectorAll('.ol-near [data-near]').length >= 2, null, 4000), 'phone: the chip opens the list');
      await B.shot('flow_B_nearby_open_phone');
      const pick = await B.ev(() => { const b = document.querySelector('.ol-near [data-near]'); return b ? b.dataset.near : null; });
      await B.page.tap('.ol-near [data-near="' + pick + '"]');
      const inv2 = await Promise.all([A, C].map((P) => until(P, (id) => N.party._debug.cards().invite && N.party.invite && N.party.invite.id === id, pick, 8000)));
      check(pick && inv2.every(Boolean), 'Nearby "🏁 Challenge" (' + pick + ') opens the party flow: invites on the other two phones');
      await B.ev(() => N.party.cancel());
      await Promise.all([A, C].map((P) => until(P, () => !N.party._debug.cards().invite, null, 8000)));
      await B.page.tap('.ol-near-x').catch(() => {});
      // the panel in a room (desktop): code, players, Nearby, Go to friends
      await A.ev(() => N.game.pause());
      await A.page.click('.k-online');
      await until(A, () => N.menus.topPanelId() === 'online');
      const pr = await A.ev(() => ({ code: document.querySelector('.mn-online [data-room]').textContent, players: document.querySelectorAll('.mn-online .ol-players li').length, near: document.querySelectorAll('.mn-online [data-act=near]').length, h: Array.from(document.querySelectorAll('.mn-online h3')).map((h) => h.textContent) }));
      check(pr.code === code && pr.players === 3 && pr.near >= 2 && pr.h.includes('Nearby for the group'), 'panel in the room: ' + JSON.stringify(pr));
      await A.shot('flow_panel_in_room');
      await A.page.click('.mn-online [data-act=near]');
      check(await until(B, () => N.party._debug.cards().invite, null, 8000) && await A.ev(() => N.state.mode === 'play' && !N.menus.isPanelShown('online')), 'panel "🏁 Challenge": back to the city and the invite goes out');
      await A.ev(() => N.party.cancel());
      await B.ev(() => N.game.pause());
      await B.page.tap('.k-online');
      await until(B, () => N.menus.topPanelId() === 'online');
      await B.shot('flow_panel_in_room_phone');
      await B.ev(() => { N.online.close(); N.menus.resume(); });
      for (const P of [A, B, C]) { const er = await P.errs(); check(!er.length, P.name + ': zero errors' + (er.length ? ': ' + er.slice(0, 4).join(' | ') : '')); }
      for (const P of [A, B, C]) { await P.ev(() => N.online.leaveRoom()).catch(() => {}); await P.context.close(); }
    }

    /* ============================================================ room: 3 phones, 2D + 3D, pin, chat, drop, cap */
    if (only('room')) {
      console.log('\n== room: three phones');
      const A = await newPhone(browser, 'A', CONF, { url: S.url });
      const B = await newPhone(browser, 'B', CONF, { url: S.url });
      const C = await newPhone(browser, 'C', CONF, { url: S.url, viewport: { width: 390, height: 780 }, touch: true });
      phones.push(A, B, C);
      for (const [P, nick, dx] of [[A, 'Ravi', 0], [B, 'Pooja', 26], [C, 'Imran', -26]]) {
        await play(P, 'charminar_plaza', dx, 30);
        await P.ev((n) => N.online.goOnline().then(() => N.online.setNick(n)), nick);
      }
      const made = await A.ev(() => N.online.createRoom());
      check(made.ok && /^[A-Z]{3,8}-[0-9]{2}$/.test(made.code), 'A created room ' + made.code);
      const code = made.code;
      const jb = await B.ev((c) => N.online.joinRoom(c.toLowerCase().replace('-', ' ')), code);
      check(jb.ok, 'B joined with "' + code.toLowerCase().replace('-', ' ') + '"');
      const jc = await C.ev((c) => N.online.joinRoom(c), code);
      check(jc.ok, 'C joined');
      const all3 = await until(A, () => N.online.room && N.online.room.n === 3 && N.online._debug.ghosts().length === 2, null, 8000);
      check(all3, 'A sees 3 players and 2 ghosts');
      const second = await B.ev(() => N.online.joinRoom('ZZZZ-99'));
      check(!second.ok && await B.ev(() => N.online.room && N.online.room.code) === code, 'joining a second room is refused while in one ("' + second.why + '")');
      const near = await Promise.all([B, C].map((P) => P.ev(() => N.online._debug.ghosts().filter((g) => g.nick === 'Ravi').map((g) => Math.round(Math.hypot(g.x - N.player.x, g.y - N.player.y)))[0])));
      check(near.every((d) => d > 5 && d < 40), 'B and C (joined in play) stand next to Ravi: ' + near.join(' / ') + ' u');
      // the cap: rooms of 3 (the owner's choice): the 4th phone is refused, in the API and in the panel
      const E = await newPhone(browser, 'E', CONF, { url: S.url });
      phones.push(E);
      await play(E, 'charminar_plaza', 40, 40);
      await E.ev(() => N.online.goOnline());
      const je = await E.ev((c) => N.online.joinRoom(c), code);
      check(!je.ok && /full \(3\/3\)/.test(je.why), '4th player refused: "' + je.why + '"');
      check(await E.ev(() => !N.online.room), '4th player is not in the room');
      await E.ev(() => N.online.open({ from: 'title' }));
      await E.page.fill('.mn-online input[data-k=room]', code);
      await E.page.click('.mn-online [data-act=join]');
      await until(E, () => /full/.test((document.querySelector('.mn-online .ol-msg') || {}).textContent || ''), null, 8000);
      await E.shot('room_full_E');
      await E.ev(() => N.online.close());

      // moving: A walks east for 1.5 s; B sees the ghost follow
      await sleep(800);
      const a0 = await A.ev(() => ({ x: N.player.x, y: N.player.y }));
      await A.ev(() => N.input.setMove(1, 0));
      await sleep(1500);
      await A.ev(() => N.input.setMove(0, 0));
      await sleep(900);
      const a1 = await A.ev(() => ({ x: N.player.x, y: N.player.y, mode: N.state.mode, stack: (N.state.stack || []).join('>') }));
      if (a1.x - a0.x <= 30) console.log('  (A state: ' + JSON.stringify(a1) + ')');
      const gA = await B.ev(() => N.online._debug.ghosts().find((g) => g.nick === 'Ravi'));
      check(a1.x - a0.x > 30, 'A walked ' + (a1.x - a0.x).toFixed(0) + ' u');
      check(gA && Math.hypot(gA.x - a1.x, gA.y - a1.y) < 6, 'B sees A where A is (ghost ' + (gA ? gA.x.toFixed(1) + ',' + gA.y.toFixed(1) : '?') + ' vs ' + a1.x.toFixed(1) + ',' + a1.y.toFixed(1) + ')');
      check(gA && gA.inEntities && gA.blip, 'ghost is a world entity with a minimap dot');
      // smooth: sample the ghost while A moves, every frame step must be small (interpolation, no teleport jumps)
      await A.ev(() => N.input.setMove(0, 1));
      await B.ev(() => N.online._debug.trace(true));
      await sleep(1600);
      const tr = await B.ev(() => { const k = N.online._debug.ghosts().find((q) => q.nick === 'Ravi').key; return N.online._debug.trace(false).filter((r) => r.k === k); });
      const steps = [];
      for (let i = 1; i < tr.length; i++) steps.push({ d: Math.hypot(tr[i].x - tr[i - 1].x, tr[i].y - tr[i - 1].y), dt: (tr[i].t - tr[i - 1].t) / 1000 });
      await A.ev(() => N.input.setMove(0, 0));
      const moved = steps.reduce((s, v) => s + v.d, 0), maxV = Math.max(...steps.filter((v) => v.dt > 0.008).map((v) => v.d / v.dt));
      check(moved > 20 && maxV < 110, 'ghost motion is smooth (moved ' + moved.toFixed(0) + ' u in ' + steps.length + ' frames, top speed between frames ' + maxV.toFixed(0) + ' u/s; walking is 45)');
      // no collision with traffic / no effect on the Chappal Meter: the ghost is never a solid
      const ghostFlags = await B.ev(() => { const e = N.entities.all.find((q) => q.kind === 'ghost'); return { solid: e.solid, noCollide: e.noCollide, kind: e.kind, wanted: N.wanted ? N.wanted.level | 0 : 0, pedQ: N.entities.query(e.x, e.y, 5, (q) => q.kind === 'ped' || q.kind === 'vehicle' || q.kind === 'npc').includes(e) }; });
      check(!ghostFlags.solid && ghostFlags.noCollide && !ghostFlags.pedQ && ghostFlags.wanted === 0, 'ghosts are not solid, not people/vehicles to the AI, Chappal Meter ' + ghostFlags.wanted);
      // A takes a cycle: B sees a ghost on a vehicle
      await A.ev(() => N.debug.enterVehicle('cycle'));
      await A.ev(() => N.input.setMove(1, 0));
      await sleep(1200);
      await A.ev(() => N.input.setMove(0, 0));
      const onCycle = await until(B, () => { const g = N.online._debug.ghosts().find((q) => q.nick === 'Ravi'); return g && g.mode === 'vehicle' && g.type === 'cycle'; }, null, 4000);
      check(onCycle, 'B sees A riding a cycle');
      await sleep(900);
      // 2D screenshot from B (nameplates + minimap dots)
      await B.ev(() => { N.render.camOverride = null; });
      const tags = await B.ev(() => Array.from(document.querySelectorAll('#ol-tags .ol-tag')).filter((t) => t.style.visibility !== 'hidden' && !t.classList.contains('ol-me')).map((t) => t.querySelector('.ol-nm').textContent));
      check(tags.includes('Ravi') && tags.includes('Imran'), 'B shows nameplates: ' + tags.join(', '));
      await B.shot('room_2d_B');
      // FIFA-style markers: one colour per player, the same on every screen, and my own triangle in my colour
      const colsOn = (P) => P.ev(() => { const o = {}; document.querySelectorAll('#ol-tags .ol-tag').forEach((t) => { o[t.classList.contains('ol-me') ? '@me' : t.querySelector('.ol-nm').textContent] = t.style.getPropertyValue('--pc'); }); return o; });
      const colB = await colsOn(B), colC = await colsOn(C), colA = await colsOn(A);
      check(colB.Ravi && colB.Imran && colB.Ravi !== colB.Imran && colB['@me'] && colB['@me'] !== colB.Ravi && colB['@me'] !== colB.Imran, 'each player has their own marker colour on B: ' + JSON.stringify(colB));
      check(colB.Ravi === colC.Ravi && colA['@me'] === colB.Ravi && colC['@me'] === colB.Imran, 'a player has the same colour on every screen: ' + JSON.stringify({ colA, colC }));
      const meVis = await B.ev(() => { const t = document.querySelector('#ol-tags .ol-me'); return !!t && t.style.visibility !== 'hidden'; });
      check(meVis, 'B sees its own triangle over its head');
      // a friend far away: an arrow on the screen edge, pointing at them, with the distance
      await A.ev(() => N.debug.teleport('charminar'));
      const edge = await until(B, () => { const t = Array.from(document.querySelectorAll('#ol-tags .ol-tag')).find((q) => q.querySelector('.ol-nm').textContent === 'Ravi'); return !!t && t.classList.contains('ol-edge') && t.style.visibility !== 'hidden' && /\d.*(m|km)$/.test(t.querySelector('.ol-dist').textContent); }, null, 6000);
      const edgeInfo = await B.ev(() => { const t = Array.from(document.querySelectorAll('#ol-tags .ol-tag')).find((q) => q.querySelector('.ol-nm').textContent === 'Ravi'); const r = t.getBoundingClientRect(); return { d: t.querySelector('.ol-dist').textContent, ang: t.style.getPropertyValue('--ang'), x: Math.round(r.left), y: Math.round(r.top), W: innerWidth, H: innerHeight }; });
      check(edge && edgeInfo.x >= 0 && edgeInfo.y >= 0 && edgeInfo.x < edgeInfo.W && edgeInfo.y < edgeInfo.H, 'far-away Ravi shows as an edge arrow on B: ' + JSON.stringify(edgeInfo));
      await B.shot('room_edge_arrow_B');
      await A.ev((p) => N.debug.teleport(p.x, p.y), await B.ev(() => ({ x: N.player.x + 30, y: N.player.y })));
      await until(B, () => { const t = Array.from(document.querySelectorAll('#ol-tags .ol-tag')).find((q) => q.querySelector('.ol-nm').textContent === 'Ravi'); return !!t && !t.classList.contains('ol-edge') && t.style.visibility !== 'hidden'; }, null, 6000);
      const cg = await C.ev(() => N.online._debug.ghosts().map((g) => g.nick + (g.hidden ? '(hidden)' : '') + '@' + Math.round(g.x) + ',' + Math.round(g.y)));
      check(cg.length === 2 && cg.every((g) => !/hidden/.test(g)), 'C (phone) sees both others: ' + cg.join(' '));
      await C.shot('room_2d_C_phone');

      // quick-chat
      const said = await A.ev(() => N.online.say('chai'));
      const heard = await until(B, () => Array.from(document.querySelectorAll('#barks .bark')).some((b) => /Chai\?/.test(b.textContent)), null, 4000);
      check(said && heard, 'quick-chat "Chai?" shows as a bubble on B');
      check(await A.ev(() => N.online.say('not-a-phrase')) === false, 'only preset phrases can be sent');
      await sleep(1100);
      await C.page.tap('.ol-chat-tg');
      await C.page.tap('.ol-chat [data-say=wave]');
      const waved = await until(A, () => Array.from(document.querySelectorAll('#barks .bark')).some((b) => /👋/.test(b.textContent)), null, 4000);
      check(waved, 'C taps the HUD wave (touch): A sees 👋');
      await B.shot('room_chat_B');

      // meet pin
      await A.ev(() => N.online.dropPin('irani_cafe_2'));
      const pinned = await until(B, () => N.online.room && N.online.room.pin && N.online.room.pin.place === 'irani_cafe_2' && N.menus.waypointPos && Math.abs(N.menus.waypointPos.x - N.places.irani_cafe_2.x) < 2 && N.hud.blips.has('ol:pin'), null, 5000);
      check(pinned, 'meet pin "Irani café, Abids": B gets a waypoint + star blip');
      check(await until(C, () => /Meet at Irani café, Abids/.test(document.body.textContent), null, 3000), 'C sees the toast "Meet at Irani café, Abids"');
      await B.shot('room_pin_B');

      // 3D on B: ghosts are drawn by the 3D actor renderers
      console.log('  -- 3D');
      await B.ev(() => N.view.set('tps'));
      const in3d = await until(B, () => N.view3d && N.view3d.active && N.view.mode === 'tps', null, 90000);
      check(in3d, 'B switched to 3D');
      if (in3d) {
        await B.ev(() => { try { N.view3d.settle(4000); } catch (e) { /* ignore */ } });
        await A.ev(() => { N.vehicles.exit && N.player.vehicle && N.vehicles.exit(N.player, true); });
        await sleep(1500);
        const g3 = await B.ev(() => new Promise((res) => {
          const e = N.entities.all.find((q) => q.kind === 'ghost' && q.online && N.online._debug.ghosts().find((g) => g.key === q.online && g.nick === 'Imran'));
          N.view3dActors.debug.track(e);
          setTimeout(() => res({ rec: N.view3dActors.debug.rec, x: e.x, y: e.y, actors: N.view3d.stats().actors }), 800);
        }));
        check(g3.rec && g3.rec.kind === 'person' && Math.hypot(g3.rec.x - g3.x, g3.rec.y - g3.y) < 3, '3D: Imran is drawn as a person at the ghost position (' + JSON.stringify(g3.rec && { kind: g3.rec.kind, x: +g3.rec.x.toFixed(1), y: +g3.rec.y.toFixed(1) }) + ')');
        const av = await A.ev(() => { const v = N.debug.enterVehicle('rx100'); return { v: !!v, ride: N.player.vehicle && N.player.vehicle.type }; });
        await until(B, () => N.entities.all.some((q) => q.kind === 'ghost' && q.view3d === 'vehicle'), null, 10000);
        const gl = await B.ev(() => N.online._debug.ghosts());
        if (!av.ride) console.log('  (A vehicle ' + JSON.stringify(av) + ', B ghosts ' + JSON.stringify(gl) + ')');
        const g4 = await B.ev(() => new Promise((res) => {
          const e = N.entities.all.find((q) => q.kind === 'ghost' && q.view3d === 'vehicle');
          N.view3dActors.debug.track(e || null);
          setTimeout(() => res({ rec: N.view3dActors.debug.rec, type: e && e.type }), 1500);
        }));
        check(g4.rec && g4.rec.kind === 'vehicle', '3D: Ravi on a ' + g4.type + ' is drawn as a vehicle (' + (g4.rec && g4.rec.model) + ')');
        await B.ev(() => N.view3dActors.debug.track(null));
        // look at the ghosts (between Imran and Ravi)
        await B.ev(() => { const gs = N.online._debug.ghosts(); const p = N.player; const g = gs.find((q) => q.nick === 'Imran') || gs[0]; try { N.view3d.setCamera({ yaw: Math.atan2(g.y - p.y, g.x - p.x), pitch: 0.25, snap: true }); } catch (e) { /* ignore */ } });
        await until(B, () => Array.from(document.querySelectorAll('#ol-tags .ol-tag')).some((t) => t.querySelector('.ol-nm').textContent === 'Imran' && t.style.visibility !== 'hidden'), null, 6000);
        await sleep(300);
        const tags3 = await B.ev(() => Array.from(document.querySelectorAll('#ol-tags .ol-tag')).filter((t) => t.style.visibility !== 'hidden' && !t.classList.contains('ol-me')).map((t) => t.querySelector('.ol-nm').textContent));
        check(tags3.includes('Imran'), '3D nameplates visible: ' + tags3.join(', '));
        await B.shot('room_3d_B');
        await B.ev(() => N.view.set('top'));
      }

      // the panel on the phone (touch): pause -> Online, quick-chat from the panel
      await C.ev(() => N.game.pause());
      await sleep(300);
      await C.page.tap('.k-online');
      await until(C, () => N.menus.topPanelId() === 'online');
      await C.page.tap('.mn-online [data-act=say][data-say=aaja]');
      check(await until(A, () => Array.from(document.querySelectorAll('#barks .bark')).some((b) => /Imran: Aaja!/.test(b.textContent)), null, 4000), 'C (phone) taps "Aaja!" in the panel: A sees "Imran: Aaja!"');
      await C.shot('panel_room_C_phone');
      await C.page.evaluate(() => { const b = document.querySelector('.mn-online .ol-body'); b.scrollTop = b.scrollHeight; });
      await C.shot('panel_room_C_phone_bottom');
      // disconnect: C closes the page -> gone for A
      await C.context.close();
      const gone = await until(A, () => N.online.room && N.online.room.n === 2 && !N.online._debug.ghosts().some((g) => g.nick === 'Imran') && !Array.from(N.hud.blips.keys()).some((k) => /^ol:p/.test(k) && !N.online._debug.ghosts().some((g) => 'ol:' + g.key === k)), null, 8000);
      check(gone, 'C closed the page: A no longer has Imran (ghost, entity, dot)');
      check(!(await A.ev(() => N.entities.all.some((e) => e.kind === 'ghost' && e.alive && !N.online._debug.ghosts().some((g) => g.key === e.online)))), 'no leftover ghost entities');

      // a place is free again: a late joiner (at Abids) gets the current pin and appears next to Ravi
      const lateD = await newPhone(browser, 'D', CONF, { url: S.url });
      phones.push(lateD);
      await play(lateD, 'abids', 0, 0);
      await lateD.ev(() => N.online.goOnline().then(() => N.online.setNick('Deepu')));
      const jd = await lateD.ev((c) => N.online.joinRoom(c), code);
      check(jd.ok && await until(lateD, () => N.online.room && N.online.room.pin && N.online.room.pin.place === 'irani_cafe_2', null, 4000), 'a late joiner gets the current pin too');
      check(await until(lateD, () => { const g = N.online._debug.ghosts().find((q) => q.nick === 'Ravi'); return g && !N.online.flow.place && Math.hypot(g.x - N.player.x, g.y - N.player.y) < 40; }, null, 15000), 'and appears next to Ravi');
      await B.ev(() => N.online.clearPin());
      check(await until(A, () => N.online.room && !N.online.room.pin && !N.hud.blips.has('ol:pin'), null, 4000), 'any member can clear the pin');

      // a race overfills the room (a stand-in that joined earlier): the latest joiner steps out
      const topic = 'realtime:room:' + code;
      const release = M.addFakes(topic, 1);
      check(await until(lateD, () => !N.online.room, null, 6000) && await until(A, () => N.online.room && N.online.room.n === 3, null, 4000), 'overfilled by a race: the latest joiner (Deepu) leaves, the room stays at 3/3');
      release();
      // empty room = closed: everyone leaves, a join finds nobody
      await A.ev(() => N.online.leaveRoom()); await B.ev(() => N.online.leaveRoom());
      await until(A, () => !N.online.room, null, 2000);
      const late = await E.ev((c) => N.online.joinRoom(c), code);
      // joining a room nobody is in yet is allowed (a friend may still be connecting): E waits there alone
      check(late.ok && (await E.ev(() => N.online.room && N.online.room.n)) === 1, 'joining an empty room opens it and waits for friends: ' + JSON.stringify(late));
      await E.ev(() => N.online.leaveRoom());
      const empty = await (async () => { for (let i = 0; i < 40; i++) { if (!M.rooms.has(topic)) return true; await E.ev(() => new Promise((r) => requestAnimationFrame(() => r()))); } return !M.rooms.has(topic); })();
      check(empty, 'server holds nothing for the room once everyone left');
      // the panel UI on A (create from the pause deck): the code shows, then the panel closes and play resumes by itself
      await A.ev(() => { N.online.TUNE.flowMs = 4000; N.game.pause(); });
      await until(A, () => N.state.mode === 'paused');
      await A.page.click('.k-online');
      await A.page.click('.mn-online [data-act=create]');
      await until(A, () => !!N.online.room && !!document.querySelector('.mn-online [data-room]'), null, 8000);
      await A.shot('panel_room_A');
      check(await until(A, () => N.state.mode === 'play' && !N.menus.isPanelShown('online') && !N.menus.isPanelShown('pause'), null, 15000), 'create from the pause deck: the panel shows the code, then the game resumes by itself');
      await A.ev(() => N.online.leaveRoom());
      for (const P of [A, B, lateD, E]) { const er = await P.errs(); check(!er.length, P.name + ': zero errors' + (er.length ? ': ' + er.slice(0, 4).join(' | ') : '')); }
      for (const P of [A, B, lateD, E]) await P.context.close();
    }

    /* ============================================================ built pages (run tools/build.mjs + deploy_site.sh --dry-run first) */
    if (only('dist')) {
      console.log('\n== built pages');
      const single = path.join(ROOT, 'dist/nostalgia.html');
      if (fs.existsSync(single)) {
        const F = await newPhone(browser, 'dist-file', undefined, { url: 'file://' + single });
        phones.push(F);
        await F.ev(() => N.debug.newGame({ skipIntro: true }));
        await sleep(800);
        const st = await F.ev(() => ({ av: N.online.available, mode: N.state.mode }));
        check(st.av === 'web' && st.mode === 'play', 'dist/nostalgia.html (file://) plays with online off (' + st.av + ')');
        check(F.requests.every((u) => u.startsWith('file:') || u.startsWith('data:') || /fonts/.test(u)), 'dist/nostalgia.html: no network requests');
        const fe = await F.errs();
        check(!fe.length, 'dist/nostalgia.html: zero errors' + (fe.length ? ': ' + fe.slice(0, 3).join(' | ') : ''));
        await F.context.close();
      } else console.log('  (skipped dist/nostalgia.html: run tools/build.mjs)');
      const site = path.join(ROOT, 'dist/site/index.html');
      if (fs.existsSync(site)) {
        // the CDN is down: the site falls back to its vendored SDK copy
        const W = await newPhone(browser, 'site', CONF, { url: S.url + 'dist/site/index.html', cdnDown: true });
        phones.push(W);
        const r = await W.ev(() => N.online.goOnline().then(() => ({ ready: N.online.ready, code: N.online.code })));
        check(r.ready && !!r.code, 'site build: CDN down -> vendor/supabase fallback loads, online works');
        check(W.requests.some((u) => /dist\/site\/vendor\/supabase\/supabase\.js$/.test(u)), 'site build fetched dist/site/vendor/supabase/supabase.js');
        const we = (await W.errs()).filter((e) => !/ERR_FAILED|net::|Failed to load resource/.test(e));
        check(!we.length, 'site build: no errors beyond the blocked CDN' + (we.length ? ': ' + we.slice(0, 3).join(' | ') : ''));
        await W.context.close();
      } else console.log('  (skipped dist/site: run tools/deploy_site.sh --dry-run)');
    }

    /* ============================================================ cloud saves */
    if (only('cloud')) {
      console.log('\n== cloud saves + newer-save guard + journey');
      const A = await newPhone(browser, 'cloudA', CONF, { url: S.url });
      phones.push(A);
      await play(A, 'abids', 0, 0);
      await A.ev(() => N.online.goOnline().then(() => N.online.setNick('Ravi')));
      await A.ev(() => { N.player.money = 4242; N.flags.visited = Object.assign(N.flags.visited || {}, { abids: 1, charminar: 1 }); N.save.save({ reason: 'test' }); });
      const up = await until(A, () => { const c = N.online.cloud.state.cloud.main; const b = N.save.slotBlob('main'); return c && b && c.t === b.t; }, null, 8000);
      const aT = await A.ev(() => N.save.slotBlob('main').t);
      const key = [...M.db.saves.keys()].find((k) => k.endsWith(':0'));
      check(up && key && M.db.saves.get(key).t === aT, 'a save mirrors to the cloud (slot 0, t ' + aT + ')');
      const jUp = await until(A, () => true, null, 5000) && await (async () => { for (let i = 0; i < 60; i++) { if ([...M.db.journeys.values()].some((j) => j.data && j.data.places && j.data.places.includes('abids'))) return true; await sleep(100); } return false; })();
      check(jUp, 'journey mirrored (places include abids)');
      const aCode = await A.ev(() => N.online.code);

      // a new phone: "Use my code" -> the newer cloud save is offered -> take it
      const B = await newPhone(browser, 'cloudB', CONF, { url: S.url });
      phones.push(B);
      await B.ev(() => N.online.open({ from: 'title' }));
      await B.page.click('.mn-online [data-act=more]');
      await B.page.click('.mn-online [data-act=restore]');
      await B.page.fill('.mn-online input[data-k=code]', aCode.toLowerCase().replace(/-/g, ' '));
      await B.page.click('.mn-online [data-act=usecode]');
      const offered = await until(B, () => N.online.code && N.online.cloud.state.offer && document.querySelector('.mn-online [data-act=take]'), null, 10000);
      check(offered, 'B used A\'s code (typed in lower case with spaces): the cloud save is offered');
      check(await B.ev(() => N.online.nick) === 'Ravi', 'nickname came along with the code');
      await B.shot('cloud_offer_B');
      // closing the panel leaves the offer card on the title; "Use cloud save" there
      await B.page.keyboard.press('Escape');
      check(await until(B, () => !document.querySelector('.ol-offer').hidden, null, 3000), 'the offer stays on screen after the panel closes');
      await B.shot('cloud_offer_title_B');
      await B.page.click('.ol-offer [data-ol=take]');
      const got = await B.ev(() => ({ has: N.save.has(), t: N.save.info() && N.save.info().t, money: N.save.info() && N.save.info().money }));
      check(got.has && got.t === aT && got.money === 4242, 'B has A\'s save (t ' + got.t + ', ₹' + Math.floor(got.money / 100) + ')');
      await B.ev(() => N.menus.refreshTitle());
      check(await B.ev(() => !document.querySelector('.trk-cont').hidden), 'title shows CONTINUE for the cloud save');
      // B continues and saves later: newer in the cloud
      await B.ev(() => { N.online.close(); N.game.continueGame(); });
      await until(B, () => N.state.mode === 'play', null, 8000);
      await sleep(50);
      await B.ev(() => { N.player.money = 9900; N.save.save({ reason: 'test' }); });
      const bT = await B.ev(() => N.save.slotBlob('main').t);
      await until(B, () => { const c = N.online.cloud.state.cloud.main; return c && c.t === N.save.slotBlob('main').t; }, null, 8000);
      check(M.db.saves.get(key).t === bT && bT > aT, 'B\'s newer save is in the cloud');
      // A (older) tries to push its old save: refused by the server, the cloud keeps B's
      check((await A.ev(() => N.online.cloud.push('main', false))).ok && M.db.saves.get(key).t === bT, 'A does not push: it knows nothing newer was saved here');
      const push = await A.ev(() => { N.online._debug.forgetCloud(); return N.online.cloud.push('main', false); });
      check(!push.ok && push.why === 'newer_save' && M.db.saves.get(key).t === bT, 'A\'s older save does not overwrite the cloud (server: ' + push.why + ')');
      // and the other way: the cloud never overwrites a newer local save
      const guard = await A.ev(([bt]) => {
        const old = JSON.parse(JSON.stringify(N.save.slotBlob('main')));
        old.t = old.t - 60000;
        const r1 = N.save.canReplace('main', old);
        const nb = Object.assign({}, old, { v: N.save.VERSION + 1, t: bt + 1 });
        const r2 = N.save.importBlob('main', nb);
        return { r1: r1.why, r2: r2.why };
      }, [bT]);
      check(guard.r1 === 'local_newer' && guard.r2 === 'newer_build', 'local guard: older cloud blob -> ' + guard.r1 + ', newer-build blob -> ' + guard.r2);
      // A pulls: the newer cloud save is offered (A keeps its own when it says so)
      await A.ev(() => N.online.cloud.pull());
      check(await A.ev(() => !!N.online.cloud.state.offer), 'A is offered B\'s newer save on pull');
      await A.ev(() => N.online.cloud.keep());
      check(await A.ev(() => !N.online.cloud.state.offer && N.save.info().money === 4242), '"Keep this one" keeps A\'s local save');
      // a cloud save from a newer build is never pulled, never overwritten
      M.db.saves.set(key, Object.assign({}, M.db.saves.get(key), { version: 2, t: bT + 5000, data: Object.assign({}, M.db.saves.get(key).data, { v: 2, t: bT + 5000 }) }));
      await B.ev(() => { N.player.money = 1234; N.save.save({ reason: 'test2' }); });
      await sleep(2500);
      check(M.db.saves.get(key).version === 2, 'a newer-build cloud save is not overwritten by an older build');
      const nbPull = await B.ev(() => N.online.cloud.pull().then(() => ({ offer: !!N.online.cloud.state.offer, note: N.online.cloud.state.note })));
      check(!nbPull.offer && /newer version/.test(nbPull.note), 'and it is not offered: "' + nbPull.note + '"');
      // journey page in the Journal
      await A.ev(() => N.menus.openJournal('journey'));
      await sleep(400);
      const jtxt = await A.ev(() => document.querySelector('.jr-page').textContent);
      check(/My Journey/.test(jtxt) && /Abids/.test(jtxt) && /player code/.test(jtxt), 'Journal "Journey" page lists the journey');
      await A.shot('journal_journey');
      await A.ev(() => N.menus.closeJournal());
      const rateCalls = M.calls.filter((c) => c.kind === 'rpc' && c.reason === 'rate').length;
      check(rateCalls === 0, 'no call hit the rate limit in normal play');
      for (const P of [A, B]) { const er = await P.errs(); check(!er.length, P.name + ': zero errors' + (er.length ? ': ' + er.slice(0, 4).join(' | ') : '')); }
    }
  } catch (e) {
    fail('exception: ' + (e.stack || e.message));
  } finally {
    for (const P of phones) { try { await P.context.close(); } catch (e) { /* ignore */ } }
    await browser.close();
    await M.close();
    S.srv.close();
  }
  console.log('\nScreenshots: ' + OUT + '/online_*.png');
  if (failures.length) { console.log('\nONLINE FAILED (' + failures.length + '):\n' + failures.join('\n')); process.exit(1); }
  console.log('\nONLINE PASSED');
})();
