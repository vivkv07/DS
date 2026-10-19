/* NOSTALGIA — tests/online.cjs  (src/online.js, ARCHITECTURE §23)
 *
 * IMPORTANT: this machine cannot reach *.supabase.co or the CDNs (egress policy), so the game talks to
 * tests/online_mock.cjs: a local stand-in that speaks the real Supabase wire protocols (PostgREST RPC +
 * Realtime Phoenix websockets) with the same rules as supabase/migrations/*_online.sql. The game runs its
 * REAL code path: the vendored @supabase/supabase-js 2.45.4 (served for the jsDelivr URL), createClient,
 * rpc(), channel presence + broadcast. The SQL functions themselves were checked on the live project with
 * the Supabase MCP tools (see design/online_setup.md "Verified").
 *
 * Covers: config = null ("coming soon", nothing loaded, zero errors); file:// ("needs the web version");
 * player code + nickname (+ kid filter); three pages (separate phones) in one room seeing each other move in
 * 2D and 3D (swiftshader, three.js from vendor/); meet pin -> waypoint + toast for everyone; quick-chat
 * bubbles; a closed page disappearing for the others; the 11th player refused; cloud save round trip with
 * "Use my code" on a new phone and the newer-save guard both ways; the journey + Journal page.
 *
 *   node nostalgia/tests/online.cjs            ONLY=basic|room|cloud   SHOTS=0 (skip screenshots)
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
const SDK_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
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
  await page.route(SDK_CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: SDK_JS }));
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

(async () => {
  const S = await staticServer();
  const M = await mock.start({ key: 'test-publishable-key' });
  const CONF = { provider: 'supabase', url: M.url, key: M.key, sdk: [SDK_CDN, 'vendor/supabase/supabase.js'], maxPlayers: 10, stateHz: 8 };
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
      const steps = await B.ev(() => new Promise((res) => {
        const out = []; let last = null; let n = 0;
        // speed between frames (u/s): interpolation keeps it near the walking speed, never a jump
        const f = () => { const g = N.online._debug.ghosts().find((q) => q.nick === 'Ravi'); const t = performance.now(); if (g && last) out.push({ d: Math.hypot(g.x - last.x, g.y - last.y), dt: (t - last.t) / 1000 }); last = g && Object.assign(g, { t }); if (++n < 70) requestAnimationFrame(f); else res(out); };
        requestAnimationFrame(f);
      }));
      await A.ev(() => N.input.setMove(0, 0));
      const moved = steps.reduce((s, v) => s + v.d, 0), maxV = Math.max(...steps.filter((v) => v.dt > 0.004).map((v) => v.d / v.dt));
      check(moved > 20 && maxV < 110, 'ghost motion is smooth (moved ' + moved.toFixed(0) + ' u in 70 frames, top speed between frames ' + maxV.toFixed(0) + ' u/s; walking is 45)');
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
      await sleep(600);
      await B.page.waitForTimeout(300);
      // 2D screenshot from B (nameplates + minimap dots)
      await B.ev(() => { N.render.camOverride = null; });
      const tags = await B.ev(() => Array.from(document.querySelectorAll('#ol-tags .ol-tag')).filter((t) => t.style.visibility !== 'hidden').map((t) => t.textContent));
      check(tags.includes('Ravi') && tags.includes('Imran'), 'B shows nameplates: ' + tags.join(', '));
      await B.shot('room_2d_B');
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
      const lateD = await newPhone(browser, 'D', CONF, { url: S.url });
      phones.push(lateD);
      await play(lateD, 'abids', 0, 0);
      await lateD.ev(() => N.online.goOnline().then(() => N.online.setNick('Deepu')));
      await lateD.ev((c) => N.online.joinRoom(c), code);
      check(await until(lateD, () => N.online.room && N.online.room.pin && N.online.room.pin.place === 'irani_cafe_2', null, 4000), 'a late joiner gets the current pin too');
      await B.shot('room_pin_B');
      await B.ev(() => N.online.clearPin());
      check(await until(A, () => N.online.room && !N.online.room.pin && !N.hud.blips.has('ol:pin'), null, 4000), 'any member can clear the pin');

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
        await A.ev(() => N.debug.enterVehicle('rx100'));
        await sleep(1500);
        const g4 = await B.ev(() => new Promise((res) => {
          const e = N.entities.all.find((q) => q.kind === 'ghost' && q.view3d === 'vehicle');
          N.view3dActors.debug.track(e || null);
          setTimeout(() => res({ rec: N.view3dActors.debug.rec, type: e && e.type }), 800);
        }));
        check(g4.rec && g4.rec.kind === 'vehicle', '3D: Ravi on a ' + g4.type + ' is drawn as a vehicle (' + (g4.rec && g4.rec.model) + ')');
        await B.ev(() => { N.view3dActors.debug.track(null); N.view.setCamera ? 0 : 0; });
        await B.ev(() => { try { N.view3d.setCamera({ yaw: -Math.PI / 2, pitch: 0.35, snap: true }); } catch (e) { /* ignore */ } });
        await sleep(800);
        const tags3 = await B.ev(() => Array.from(document.querySelectorAll('#ol-tags .ol-tag')).filter((t) => t.style.visibility !== 'hidden').map((t) => t.textContent));
        ok('3D nameplates visible: ' + tags3.join(', '));
        await B.shot('room_3d_B');
        await B.ev(() => N.view.set('top'));
      }

      // disconnect: C closes the page -> gone for A
      await C.context.close();
      const gone = await until(A, () => N.online.room && N.online.room.n === 3 && !N.online._debug.ghosts().some((g) => g.nick === 'Imran') && !Array.from(N.hud.blips.keys()).some((k) => /^ol:p/.test(k) && !N.online._debug.ghosts().some((g) => 'ol:' + g.key === k)), null, 8000);
      check(gone, 'C closed the page: A no longer has Imran (ghost, entity, dot)');
      check(!(await A.ev(() => N.entities.all.some((e) => e.kind === 'ghost' && e.alive && !N.online._debug.ghosts().some((g) => g.key === e.online)))), 'no leftover ghost entities');

      // the cap: fill the room to 10 with stand-ins, the 11th phone is refused
      const topic = 'realtime:room:' + code;
      const n0 = await A.ev(() => N.online.room.n);
      const release = M.addFakes(topic, 10 - n0);
      await until(A, () => N.online.room && N.online.room.n === 10, null, 4000);
      check(await A.ev(() => N.online.room.n) === 10, 'room is at 10/10');
      const E = await newPhone(browser, 'E', CONF, { url: S.url });
      phones.push(E);
      await play(E, 'charminar_plaza', 40, 40);
      await E.ev(() => N.online.goOnline());
      const je = await E.ev((c) => N.online.joinRoom(c), code);
      check(!je.ok && /full \(10\/10\)/.test(je.why), '11th player refused: "' + je.why + '"');
      check(await E.ev(() => !N.online.room), '11th player is not in the room');
      await E.ev(() => N.online.open({ from: 'title' }));
      await E.page.fill('.mn-online input[data-k=room]', code);
      await E.page.click('.mn-online [data-act=join]');
      await until(E, () => /full/.test((document.querySelector('.mn-online .ol-msg') || {}).textContent || ''), null, 8000);
      await E.shot('room_full_E');
      release();
      // empty room = closed: everyone leaves, a join finds nobody
      await A.ev(() => N.online.leaveRoom()); await B.ev(() => N.online.leaveRoom()); await lateD.ev(() => N.online.leaveRoom());
      await sleep(500);
      const late = await E.ev((c) => N.online.joinRoom(c), code);
      check(!late.ok && /No one is in room/.test(late.why), 'empty room is closed: "' + late.why + '"');
      await sleep(600);
      check(!M.rooms.has(topic), 'server holds nothing for the empty room');
      // the panel UI on A (create from the panel)
      await A.ev(() => { N.game.pause(); });
      await sleep(300);
      await A.page.click('.k-online');
      await A.page.click('.mn-online [data-act=create]');
      await until(A, () => !!N.online.room, null, 8000);
      await sleep(300);
      await A.shot('panel_room_A');
      await A.ev(() => N.online.leaveRoom());
      for (const P of [A, B, lateD, E]) { const er = await P.errs(); check(!er.length, P.name + ': zero errors' + (er.length ? ': ' + er.slice(0, 4).join(' | ') : '')); }
      for (const P of [A, B, lateD, E]) await P.context.close();
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
      const jUp = await until(A, () => true, null, 100) && await (async () => { for (let i = 0; i < 60; i++) { if ([...M.db.journeys.values()].some((j) => j.data && j.data.places && j.data.places.includes('abids'))) return true; await sleep(100); } return false; })();
      check(jUp, 'journey mirrored (places include abids)');
      const aCode = await A.ev(() => N.online.code);

      // a new phone: "Use my code" -> the newer cloud save is offered -> take it
      const B = await newPhone(browser, 'cloudB', CONF, { url: S.url });
      phones.push(B);
      await B.ev(() => N.online.open({ from: 'title' }));
      await B.page.click('.mn-online [data-act=restore]');
      await B.page.fill('.mn-online input[data-k=code]', aCode.toLowerCase().replace(/-/g, ' '));
      await B.page.click('.mn-online [data-act=usecode]');
      const offered = await until(B, () => N.online.code && N.online.cloud.state.offer && !document.querySelector('.ol-offer').hidden, null, 10000);
      check(offered, 'B used A\'s code (typed in lower case with spaces): the cloud save is offered');
      check(await B.ev(() => N.online.nick) === 'Ravi', 'nickname came along with the code');
      await B.shot('cloud_offer_B');
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
      const push = await A.ev(() => N.online.cloud.push('main', false));
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
      const k1 = key.replace(/:0$/, ':1');
      void k1;
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
