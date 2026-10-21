/* NOSTALGIA — tests/online_net.cjs  (the network side of src/online.js + src/party.js, ARCHITECTURE §23 / §24)
 *
 * Live-service checks against tests/online_mock.cjs (the same Realtime protocol as Supabase; this machine cannot reach
 * supabase.co), with the mock's fault tools: per-client jitter (frames delayed in order), a frozen socket (a phone
 * asleep with its socket still open on the server), a dropped socket (the network goes away), and its Realtime event
 * counter (each broadcast = 1 sent + 1 per receiver, as Supabase bills and rate-limits them: Free plan 100 events/s).
 *
 *   rate    position updates per second: alone in a room, walking straight, zig-zagging, standing, cycling; the
 *           Realtime events a room of 2 generates (the quota)
 *   jitter  a friend's ghost under 40-200 ms jitter: no stalls / jumps, its error against the friend's true path
 *   drop    the friend's socket drops for a moment: no REST broadcast fallback while reconnecting, no "left the room"
 *           for a blip, the friend comes back by himself and moves again
 *   away    a friend's tab goes to the background (visibilitychange) / his phone sleeps (frozen socket): "away"
 *   double  two friends tap Start at the same moment: one lobby, not two hosts and "Nobody accepted"
 *   blip    a party race: the guest's and then the host's socket blips (no "left", no second host); the host really
 *           leaves: the next player takes over after the grace period and the results still come
 *   summary ctx.summary({line}): a team line on the results card on every phone
 *
 *   node nostalgia/tests/online_net.cjs        ONLY=rate,jitter,drop,away,double,blip,summary   SHOTS=0
 * Screenshots: tests/out/net_*.png   Numbers: tests/out/online_net.json
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
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-compositing'];
const TAG = process.env.TAG || '';

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const info = (msg) => console.log('       ' + msg);
const check = (cond, msg) => { if (cond) ok(msg); else fail(msg); return !!cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k);
const NUM = {};

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

/* ---------------------------------------------------------------- page helpers */
async function newPhone(browser, name, conf, o) {
  o = o || {};
  const context = await browser.newContext({ viewport: o.viewport || { width: 760, height: 480 }, deviceScaleFactor: 1, hasTouch: !!o.touch, isMobile: !!o.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); if (m.type() === 'warning' && /falling back to REST/.test(m.text())) errors.push('REST fallback warning: ' + m.text().slice(0, 80)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(SDK_CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: SDK_JS }));
  await page.addInitScript((c) => {
    window.NOSTALGIA_ONLINE_CONFIG = c;
    // every toast the page shows (to tell "left the room" from "reconnecting")
    window.__toasts = [];
    const hook = () => { if (!window.N || !N.hud || !N.hud.toast || N.hud.__tw) return; const t0 = N.hud.toast; N.hud.toast = function (txt) { window.__toasts.push({ t: Date.now(), txt: String(txt) }); return t0.apply(this, arguments); }; N.hud.__tw = true; };
    const iv = setInterval(() => { hook(); if (window.N && N.hud && N.hud.__tw) clearInterval(iv); }, 50);
  }, conf);
  await page.goto(o.url + '#debug');
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
  const P = { name, page, context, errors };
  P.ev = (fn, arg) => page.evaluate(fn, arg);
  P.shot = async (n) => { if (process.env.SHOTS === '0') return; await page.screenshot({ path: path.join(OUT, 'net_' + n + TAG + '.png'), timeout: 180000 }); };
  P.errs = async () => errors.concat(await page.evaluate(() => (N.debug.state().errors || []).map((e) => 'N.err ' + e)).catch(() => []));
  P.key = () => P.ev(() => N.online._debug.key);
  P.toasts = (since) => P.ev((t) => window.__toasts.filter((q) => q.t >= t).map((q) => q.txt), since || 0);
  return P;
}
async function play(P, x, y) {
  await P.ev(() => { N.debug.newGame({ skipIntro: true }); });
  await P.page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 20000 });
  await P.ev(([px, py]) => {
    N.debug.setTime(11, 0); N.debug.freezeClock(true); N.player.teleport(px, py); N.player.energy = 100;
    window.__res = null;
    N.on('party:results', (d) => { window.__res = d; });
  }, [x, y]);
}
const until = async (P, fn, arg, ms) => P.page.waitForFunction(fn, arg, { timeout: ms || 8000, polling: 100 }).then(() => true, () => false);
// game-time wait: `secs` of game time on that page
const gw = async (P, secs) => { const t0 = await P.ev(() => N.time.now); return until(P, ([a, k]) => N.time.now >= a + k, [t0, secs], 180000); };
async function room(phones, nicks) {
  for (let i = 0; i < phones.length; i++) await phones[i].ev((n) => N.online.goOnline().then(() => N.online.setNick(n)), nicks[i]);
  const made = await phones[0].ev(() => N.online.createRoom());
  for (const P of phones.slice(1)) await P.ev((c) => N.online.joinRoom(c), made.code);
  const okAll = await until(phones[0], (n) => N.online.room && N.online.room.n === n && N.online._debug.ghosts().length === n - 1 && N.online._debug.ghosts().every((g) => !g.hidden), phones.length, 15000);
  return { code: made.code, ok: okAll };
}
const ghostOf = (P, nick) => P.ev((n) => N.online._debug.ghosts().find((g) => g.nick === n) || null, nick);
const sentSt = (P) => P.ev(() => N.online._debug.stats().sent);

(async () => {
  const S = await staticServer();
  const M = await mock.start({ key: 'test-publishable-key' });
  const CONF = { provider: 'supabase', url: M.url, key: M.key, sdk: [SDK_CDN, 'vendor/supabase/supabase.js'], maxPlayers: 3, stateHz: 8 };
  const browser = await chromium.launch({ args: ARGS });
  const phones = [];
  const TB = [8919, 4128]; // Tank Bund, the Ambedkar statue end (the sprint's start)
  try {
    /* ============================================================ rate: updates per second + the room's events */
    if (only('rate') || only('jitter') || only('drop') || only('away')) {
      console.log('\n== two phones in a room');
      const A = await newPhone(browser, 'A', CONF, { url: S.url });
      const B = await newPhone(browser, 'B', CONF, { url: S.url });
      phones.push(A, B);
      await play(A, 9300, 3600); await play(B, 9300 + 24, 3600);
      // A alone in its room first
      await A.ev(() => N.online.goOnline().then(() => N.online.setNick('Ravi')));
      const made = await A.ev(() => N.online.createRoom());
      check(made.ok, 'A opened room ' + made.code);
      if (only('rate')) {
        console.log('  -- rate');
        await gw(A, 0.5);
        let s0 = await sentSt(A), t0 = await A.ev(() => N.time.now);
        await A.ev(() => N.input.setMove(1, 0));
        await gw(A, 3);
        await A.ev(() => N.input.setMove(0, 0));
        let s1 = await sentSt(A), t1 = await A.ev(() => N.time.now);
        const alone = (s1 - s0) / (t1 - t0);
        NUM.aloneHz = +alone.toFixed(2);
        check(alone < 0.6, 'alone in a room and walking: ' + alone.toFixed(1) + ' position updates / s (nobody to receive them)');
      }
      await B.ev(() => N.online.goOnline().then(() => N.online.setNick('Pooja')));
      const jb = await B.ev((c) => N.online.joinRoom(c), made.code);
      check(jb.ok && await until(A, () => N.online._debug.ghosts().length === 1 && !N.online._debug.ghosts()[0].hidden, null, 15000), 'B joined; A sees B');
      await until(B, () => N.online._debug.ghosts().length === 1 && !N.online._debug.ghosts()[0].hidden, null, 15000);
      if (only('rate')) {
        const phase = async (label, fn, secs) => {
          M.resetEvents();
          const s0 = await sentSt(A), t0 = await A.ev(() => N.time.now), w0 = Date.now();
          await fn();
          await gw(A, secs);
          const s1 = await sentSt(A), t1 = await A.ev(() => N.time.now), w1 = Date.now();
          await A.ev(() => N.input.setMove(0, 0));
          const hz = (s1 - s0) / (t1 - t0), ev = M.events(), evs = (ev.sent + ev.delivered + ev.presence) / ((w1 - w0) / 1000);
          info(label + ': ' + hz.toFixed(2) + ' updates/s from A; the room: ' + evs.toFixed(1) + ' Realtime events/s (sent ' + ev.sent + ', delivered ' + ev.delivered + ', presence ' + ev.presence + ', REST ' + ev.rest + ')');
          return { hz: +hz.toFixed(2), events: +evs.toFixed(1) };
        };
        const straight = await phase('walking straight', () => A.ev(() => N.input.setMove(1, 0)), 3);
        const zig = await phase('zig-zag walking', () => A.ev(() => { window.__zig = setInterval(() => { const k = Math.floor(Date.now() / 450) % 2; N.input.setMove(1, k ? 0.9 : -0.9); }, 60); }), 3);
        await A.ev(() => clearInterval(window.__zig));
        await A.ev(() => N.input.setMove(0, 0)); await gw(A, 1); // (the stop itself is a change worth sending)
        const stand = await phase('standing still', () => A.ev(() => N.input.setMove(0, 0)), 4);
        await A.ev(() => { N.debug.enterVehicle('cycle'); N.input.setMove(1, 0); });
        await gw(A, 2); // turned east and up to speed (both are changes worth sending), then cruising
        const cyc = await phase('cycling straight', () => A.ev(() => N.input.setMove(1, 0)), 3);
        await A.ev(() => { N.input.setMove(0, 0); if (N.player.vehicle) N.vehicles.exit(N.player, true); });
        Object.assign(NUM, { straight, zig, stand, cyc });
        check(straight.hz <= 3.5, 'walking straight: ' + straight.hz + ' updates/s (dead reckoning; the old fixed rate was 8)');
        check(cyc.hz <= 3.5, 'cycling straight: ' + cyc.hz + ' updates/s');
        check(zig.hz <= 8.5, 'zig-zag: ' + zig.hz + ' updates/s (never above stateHz 8)');
        check(stand.hz <= 0.6, 'standing: ' + stand.hz + ' updates/s (a keepalive)');
      }

      /* ============================================================ jitter: smooth ghosts under 40-200 ms jitter */
      if (only('jitter')) {
        console.log('\n== jitter: B receives with 40-200 ms jitter (in order)');
        const bKey = await B.key();
        M.net(bKey, { lag: { base: 40, rand: 160 } });
        await A.ev(() => { N.player.teleport(9300, 3600); N.input.setMove(0, 0); });
        await gw(A, 1);
        // A's true path (its own clock = B's clock: one machine) and B's ghost of A, every frame
        await A.ev(() => { window.__truth = []; const f = () => { if (!window.__truth) return; window.__truth.push({ t: Date.now(), x: N.player.x, y: N.player.y }); requestAnimationFrame(f); }; requestAnimationFrame(f); });
        await B.ev(() => { window.__gtr = []; const f = () => { if (!window.__gtr) return; const g = N.online._debug.ghosts()[0]; if (g) window.__gtr.push({ t: Date.now(), x: g.x, y: g.y }); requestAnimationFrame(f); }; requestAnimationFrame(f); });
        await A.ev(() => N.input.setMove(1, 0)); await gw(A, 2);
        await A.ev(() => N.input.setMove(0, 1)); await gw(A, 1.6);
        await A.ev(() => N.input.setMove(-1, 0.4)); await gw(A, 1.6);
        await A.ev(() => N.input.setMove(0, 0)); await gw(A, 1.2);
        const truth = await A.ev(() => { const t = window.__truth; window.__truth = null; return t; });
        const gtr = await B.ev(() => { const t = window.__gtr; window.__gtr = null; return t; });
        M.net(bKey, null);
        const at = (t) => { let i = 0; while (i < truth.length - 2 && truth[i + 1].t < t) i++; const a = truth[i], b = truth[i + 1] || a; const f = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; };
        const moving = (t) => { const p = at(t), q = at(t - 100); return Math.hypot(p.x - q.x, p.y - q.y) > 1.5; };
        let best = null;
        for (let L = 0; L <= 700; L += 20) { let e2 = 0, n = 0; for (const g of gtr) { if (g.t - L < truth[0].t) continue; const p = at(g.t - L); e2 += (g.x - p.x) ** 2 + (g.y - p.y) ** 2; n++; } const rms = Math.sqrt(e2 / Math.max(1, n)); if (!best || rms < best.rms) best = { L, rms }; }
        let stalls = 0, movingFrames = 0, maxV = 0, back = 0;
        for (let i = 1; i < gtr.length; i++) {
          const a = gtr[i - 1], b = gtr[i], dt = (b.t - a.t) / 1000;
          if (dt <= 0.008) continue;
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          if (moving(b.t - best.L)) { movingFrames++; if (d < 0.05) stalls++; }
          maxV = Math.max(maxV, d / dt);
          // the true direction of travel back then: a frame that moves the ghost against it is a snap back
          const p = at(b.t - best.L), q = at(b.t - best.L - 80), tx = p.x - q.x, ty = p.y - q.y, tl = Math.hypot(tx, ty);
          if (tl > 2 && ((b.x - a.x) * tx + (b.y - a.y) * ty) / tl < -1.2) back++;
        }
        const stallPct = movingFrames ? (100 * stalls) / movingFrames : 0;
        NUM.jitter = { frames: gtr.length, latencyMs: best.L, rms: +best.rms.toFixed(2), stallPct: +stallPct.toFixed(1), maxV: Math.round(maxV), back };
        info('ghost under jitter: ' + gtr.length + ' frames, best lag ' + best.L + ' ms, RMS error ' + best.rms.toFixed(1) + ' u, stalls ' + stallPct.toFixed(1) + '% of moving frames, top frame speed ' + maxV.toFixed(0) + ' u/s, snap-backs ' + back);
        check(stallPct < 12, 'no stalls while A walks (' + stallPct.toFixed(1) + '% of moving frames frozen)');
        check(maxV < 140, 'no jumps (top frame speed ' + maxV.toFixed(0) + ' u/s; walking is 45, running ~75)');
        check(back <= 2, 'no snap-backs against the direction of travel (' + back + ')');
        check(best.rms < 4, 'the ghost follows A\'s true path within ' + best.rms.toFixed(1) + ' u RMS (at ' + best.L + ' ms behind)');
      }

      /* ============================================================ drop: a short network blip */
      if (only('drop')) {
        console.log('\n== drop: B\'s socket drops');
        const bKey = await B.key();
        M.resetEvents();
        const t0 = Date.now();
        await B.ev(() => { window.__rest = 0; N.input.setMove(1, 0); });
        const n = M.drop(bKey);
        check(n >= 1, 'the mock cut B\'s socket (' + n + ')');
        await sleep(900);
        await A.shot('drop_A_1s');
        const back = await until(B, () => N.online.status === 'room' && N.online.room && N.online.room.n === 2, null, 20000);
        await B.ev(() => N.input.setMove(0, 0));
        const tBack = Date.now() - t0;
        check(back, 'B reconnected by itself (' + tBack + ' ms) and sees the room again');
        check(await until(A, () => { const g = N.online._debug.ghosts().find((q) => q.nick === 'Pooja'); return g && !g.hidden && !g.away; }, null, 15000), 'A sees Pooja again');
        const ev = M.events();
        NUM.drop = { backMs: tBack, rest: ev.rest };
        check(ev.rest === 0, 'no REST broadcast fallback while reconnecting (' + ev.rest + ' HTTP broadcasts)');
        const tA = await A.toasts(t0);
        info('A\'s toasts: ' + JSON.stringify(tA));
        check(!tA.some((x) => /Pooja left the room/.test(x)), 'A was not told "Pooja left the room" for a blip');
        const be = (await B.errs()).filter((e) => /REST fallback/.test(e));
        check(!be.length, 'B: no "falling back to REST" warnings (' + be.length + ')');
        await A.shot('drop_A_back');
      }

      /* ============================================================ away: background tab / sleeping phone */
      if (only('away')) {
        console.log('\n== away: B goes to the background, then B\'s phone sleeps');
        await B.ev(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
        const awayFast = await until(A, () => { const g = N.online._debug.ghosts().find((q) => q.nick === 'Pooja'); return g && g.away; }, null, 4000);
        check(awayFast, 'B hid its tab: A shows Pooja as away at once');
        await A.shot('away_A');
        const tagTxt = await A.ev(() => { const t = Array.from(document.querySelectorAll('#ol-tags .ol-tag')).find((q) => /Pooja/.test(q.textContent)); return t ? t.textContent + '|' + t.className : null; });
        info('A\'s nameplate for B: ' + tagTxt);
        await B.ev(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
        check(await until(A, () => { const g = N.online._debug.ghosts().find((q) => q.nick === 'Pooja'); return g && !g.away; }, null, 6000), 'B is back: not away any more');
        const bKey = await B.key();
        M.net(bKey, { frozen: true });
        const t0 = Date.now();
        const stale = await until(A, () => { const g = N.online._debug.ghosts().find((q) => q.nick === 'Pooja'); return g && g.away; }, null, 15000);
        check(stale, 'B\'s phone sleeps (socket frozen): A marks Pooja away after ' + (Date.now() - t0) + ' ms of silence');
        const groupN = await A.ev(() => N.online._debug.group ? N.online._debug.group().length : -1);
        check(groupN === 1, 'an away friend is left out of the group\'s "nearby" / arrival / 👫 sums (group ' + groupN + ')');
        M.net(bKey, null);
        check(await until(A, () => { const g = N.online._debug.ghosts().find((q) => q.nick === 'Pooja'); return g && !g.away; }, null, 15000), 'B wakes up: back to normal on A');
      }
      for (const P of [A, B]) { const e = (await P.errs()).filter((x) => !/REST fallback/.test(x)); check(!e.length, P.name + ': zero errors' + (e.length ? ': ' + e.slice(0, 3).join(' | ') : '')); }
      await A.context.close(); await B.context.close();
    }

    /* ============================================================ double: both tap Start at once */
    if (only('double') || only('blip') || only('summary')) {
      console.log('\n== party: three phones');
      const A = await newPhone(browser, 'A', CONF, { url: S.url });
      const B = await newPhone(browser, 'B', CONF, { url: S.url });
      const C = await newPhone(browser, 'C', CONF, { url: S.url, viewport: { width: 400, height: 720 } });
      phones.push(A, B, C);
      await play(A, TB[0], TB[1]); await play(B, TB[0] + 30, TB[1]); await play(C, TB[0] - 30, TB[1]);
      const r = await room([A, B, C], ['Ravi', 'Pooja', 'Imran']);
      check(r.ok, 'room ' + r.code + ' with Ravi, Pooja and Imran');
      const tidy = async () => { for (const P of [A, B, C]) await P.ev(() => { if (N.party.active) N.party.cancel(); N.party.closeCards(); window.__res = null; }).catch(() => {}); await sleep(800); };
      if (only('double')) {
        console.log('  -- double: Ravi and Pooja tap Start at the same moment');
        const [ra, rb] = await Promise.all([A.ev(() => N.party.challenge('race_tank_bund')), B.ev(() => N.party.challenge('race_tank_bund'))]);
        check(ra.ok && rb.ok, 'both challenges went out (' + ra.mode + ' / ' + rb.mode + ')');
        await sleep(1500);
        await A.shot('double_A');
        await B.shot('double_B');
        const st = await Promise.all([A, B, C].map((P) => P.ev(() => { const S = N.party._debug.session(); return S ? { sid: S.sid, phase: S.phase, host: S.host, me: N.online.myKey, acc: Array.from(S.acc.keys()).length } : null; })));
        info('sessions: ' + JSON.stringify(st));
        const one = st[0] && st[1] && st[0].sid === st[1].sid;
        check(one, 'one lobby for both (the other host joined it), not two');
        // C accepts the surviving one
        await until(C, () => N.party._debug.cards().invite, null, 6000);
        await C.ev(() => N.party.accept());
        const started = await until(A, () => N.party.active && N.party.active.phase !== 'lobby', null, 25000) && await until(B, () => N.party.active && N.party.active.phase !== 'lobby', null, 10000);
        check(started, 'the race starts for everybody (no "Nobody accepted")');
        const tA = await A.toasts(0), tB = await B.toasts(0);
        check(!tA.concat(tB).some((x) => /Nobody (accepted|could play)/.test(x)), 'nobody was told "Nobody accepted": ' + JSON.stringify(tA.concat(tB).filter((x) => /Nobody|joined|started/.test(x))));
        const sy = await Promise.all([A, B, C].map((P) => P.ev(() => N.party.active && { sid: N.party.active.sid, n: N.party.active.players.length })));
        check(sy.every((s) => s && s.sid === sy[0].sid && s.n === 3), 'the same race with 3 players on all phones: ' + JSON.stringify(sy));
        await sleep(1200);
        await A.shot('double_A_started');
        await tidy();
      }

      /* ============================================================ summary: ctx.summary({line}) */
      if (only('summary')) {
        console.log('  -- summary: a team line on the results card');
        await A.ev(() => N.party.challenge('race_tank_bund'));
        await until(B, () => N.party._debug.cards().invite, null, 8000); await until(C, () => N.party._debug.cards().invite, null, 8000);
        await B.ev(() => N.party.accept()); await C.ev(() => N.party.accept());
        await Promise.all([A, B, C].map((P) => until(P, () => N.party.active && N.party.active.phase === 'running', null, 20000)));
        const has = await B.ev(() => typeof N.party.active.ctx.summary === 'function');
        check(has, 'ctx.summary exists');
        if (has) {
          await B.ev(() => N.party.active.ctx.summary({ line: 'Colony XI beat the Ashok Nagar XI by 12 runs' }));
          await A.ev(() => N.party.active.ctx.summary({ line: 'Colony XI beat the Ashok Nagar XI by 12 runs' }));
          for (const P of [A, B, C]) await P.ev(() => N.party.active.ctx.report({ score: 10 }));
          const all = await Promise.all([A, B, C].map((P) => until(P, () => !!document.querySelector('.pt-results'), null, 15000)));
          const lines = await Promise.all([A, B, C].map((P) => P.ev(() => (document.querySelector('.pt-results') || {}).textContent || '')));
          check(all.every(Boolean) && lines.every((l) => /Colony XI beat the Ashok Nagar XI by 12 runs/.test(l)), 'the team line shows on every phone\'s results card');
          await C.shot('summary_C');
        }
        await tidy();
      }
      /* ============================================================ blip: sockets drop mid-race */
      if (only('blip')) {
        console.log('  -- blip: a party race; sockets drop for a moment');
        await A.ev(() => N.party.challenge('race_tank_bund'));
        await until(B, () => N.party._debug.cards().invite, null, 8000); await until(C, () => N.party._debug.cards().invite, null, 8000);
        await B.ev(() => N.party.accept()); await C.ev(() => N.party.accept());
        check(await Promise.all([A, B, C].map((P) => until(P, () => N.party.active && N.party.active.phase === 'running', null, 20000))).then((x) => x.every(Boolean)), 'race running on all three');
        const [kA, kB] = [await A.key(), await B.key()];
        // the guest's socket blips
        const t0 = Date.now();
        M.drop(kB);
        await sleep(1200);
        await A.shot('blip_guest_A');
        await until(B, () => N.online.status === 'room', null, 20000);
        await sleep(2500);
        const leftA = await A.ev(() => { const S = N.party._debug.session(); return S ? Array.from(S.left) : null; });
        check(leftA && leftA.length === 0, 'a guest\'s 1-2 s blip does not count as leaving the race (left on A: ' + JSON.stringify(leftA) + ')');
        info('A toasts since the blip: ' + JSON.stringify(await A.toasts(t0)));
        // the host's socket blips
        const t1 = Date.now();
        M.drop(kA);
        await sleep(1500);
        const hostsMid = await Promise.all([A, B, C].map((P) => P.ev(() => N.party.active && N.party.active.isHost)));
        await until(A, () => N.online.status === 'room', null, 20000);
        await sleep(2500);
        const hosts = await Promise.all([A, B, C].map((P) => P.ev(() => N.party.active && N.party.active.isHost)));
        check(hosts.filter(Boolean).length === 1 && hosts[0] === true, 'the host\'s blip: still exactly one host, Ravi (during: ' + JSON.stringify(hostsMid) + ', after: ' + JSON.stringify(hosts) + ')');
        info('B toasts since the host blip: ' + JSON.stringify(await B.toasts(t1)));
        // everybody but the host reports; then the host really leaves (closes the page)
        await B.ev(() => N.party.active.ctx.report({ timeMs: 61000 }));
        await C.ev(() => N.party.active.ctx.report({ timeMs: 64000 }));
        await sleep(600);
        const t2 = Date.now();
        await A.context.close();
        const res = await until(B, () => !!window.__res, null, 40000);
        const dt = Date.now() - t2;
        check(res, 'the host left for good: Pooja\'s phone took over and the results came (' + dt + ' ms)');
        const sb = await B.ev(() => window.__res && window.__res.standings.map((q) => q.nick + ':' + (q.rank || '-') + (q.left ? '(left)' : '')));
        const sc = await until(C, () => !!window.__res, null, 10000) && await C.ev(() => window.__res.standings.map((q) => q.nick + ':' + (q.rank || '-') + (q.left ? '(left)' : '')));
        info('B: ' + JSON.stringify(sb) + ' C: ' + JSON.stringify(sc));
        check(sb && sc && JSON.stringify(sb) === JSON.stringify(sc) && /Pooja:1/.test(sb.join()) && /Ravi:-\(left\)/.test(sb.join()), 'the same standings on B and C: Pooja 1st, Imran 2nd, Ravi left');
        await B.shot('blip_host_left_B');
        NUM.blip = { hostLeftToResultsMs: dt };
      }

      for (const P of [B, C]) { const e = (await P.errs()).filter((x) => !/REST fallback/.test(x)); check(!e.length, P.name + ': zero errors' + (e.length ? ': ' + e.slice(0, 3).join(' | ') : '')); }
    }
  } catch (e) {
    fail('crashed: ' + (e.stack || e.message));
  } finally {
    fs.writeFileSync(path.join(OUT, 'online_net' + TAG + '.json'), JSON.stringify(NUM, null, 1));
    await browser.close().catch(() => {});
    await M.close();
    S.srv.close();
  }
  console.log('\nNumbers: ' + JSON.stringify(NUM));
  console.log(failures.length ? '\nONLINE_NET FAILED (' + failures.length + ')' : '\nONLINE_NET PASSED');
  process.exit(failures.length ? 1 : 0);
})();
