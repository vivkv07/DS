/* NOSTALGIA — tests/party_games.cjs  (playground_games.js + the kite / marbles sections of minigames.js through N.party)
 *
 * "Can they play lingocha, cricket, panipuri challenges and other games together?" — lingocha, maram pitti, goli
 * (marbles) and the kite fight, with friends in an online room (two / three pages in one room against
 * tests/online_mock.cjs: the real supabase-js, never supabase.co) and solo with the AI friends.
 *
 *   solo      one page, no room: every activity is registered (name, icon, 1-3 players), solo through N.party with the
 *             AI friends (the results card lists them), the first win's tin token; alone, the ground still shows the
 *             plain "Join lingocha" (no party prompt on top of it)
 *   goli      two pages: A challenges, B accepts with Y; the same board (seed); turns A, B, A ...: A flicks with real
 *             keys (hold / release Space), B sees the same flick and the same goli where A's page left them; B flicks
 *             with a real mouse drag; the rest by the in-game bots; same scores, same results on both pages
 *   kite      two pages: one sky (the same rooftops), each flies its own kite with real keys and sees the other's; the
 *             host referees a pech between the two lines (BO KAATA / chhoot gaya on both pages); most cuts wins
 *   lingocha  two pages at the colony ground: A and B captain opposite teams (colony kids fill them); the host's game
 *             shows on B (same kids, same stack, same phase); A knocks the stack down with real keys; B, a hitter,
 *             grabs the ball with E and throws at a seeker with E; a ball hitting B is judged on B's page; the match
 *             ends with the same result on both, winners first; screenshots 2D + phone + 3D
 *   maram     three pages, C skips with N: A and B in one ring with the colony kids; an AI throw at B is judged on
 *             B's page (out on both); the last ones standing; places on the results card
 *   three     three pages: lingocha with slots 0 + 2 on one side and 1 on the other; C leaves mid-match and a colony
 *             kid takes his place on A and B
 * Zero console errors / page errors / N.err.    node nostalgia/tests/party_games.cjs   ONLY=solo,goli,kite,lingocha,maram,three
 * Screenshots: tests/out/pgp_*.png
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
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-compositing'];
const SHOT_MS = 180000;
const failures = [];
let cur = '';
const fail = (m) => { failures.push('[' + cur + '] ' + m); console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const info = (m) => console.log('       ' + m);
const check = (c, m, d) => { if (c) ok(m); else fail(m + (d ? ' — ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 700) : '')); return !!c; };
const only = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- pages */
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
// game-clock waits (robust on a loaded machine): resolve after `secs` of game time (frame time while it is stopped)
const GW = () => {
  window.__gw = (secs) => new Promise((res) => { let acc = 0, n0 = N.time.now, r0 = N.time.real; const t0 = performance.now(), cap = secs * 8000 + 5000; (function chk() { const dn = N.time.now - n0, dr = N.time.real - r0; n0 = N.time.now; r0 = N.time.real; acc += dn > 0 ? dn : dr; if (acc >= secs || performance.now() - t0 > cap) res(acc); else requestAnimationFrame(chk); })(); });
};
async function openPage(browser, name, V, url, conf) {
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.dpr || 1, hasTouch: !!V.touch, isMobile: !!V.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(SDK_CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: SDK_JS }));
  await page.route(THREE_CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.addInitScript(GW);
  if (conf) await page.addInitScript((c) => { window.NOSTALGIA_ONLINE_CONFIG = c; }, conf);
  await page.goto(url);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  const P = { name, page, context, errors };
  P.ev = (fn, arg) => page.evaluate(fn, arg);
  P.gw = (s) => page.evaluate((x) => window.__gw(x), s);
  P.shot = async (n) => { if (process.env.SHOTS === '0') return; await page.screenshot({ path: path.join(OUT, 'pgp_' + n + '.png'), timeout: SHOT_MS }).catch((e) => info('shot ' + n + ' failed: ' + e.message)); };
  P.errs = async () => errors.concat(await page.evaluate(() => (N.debug.state().errors || []).map((e) => 'N.err ' + e)).catch(() => []));
  P.until = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 15000, polling: 120 }).then(() => true, () => false);
  return P;
}
async function newGame(P, h, m, where) {
  await P.ev(([h, m]) => {
    N.debug.newGame({ skipIntro: true });
  }, [h, m]);
  await P.until(() => N.state.mode === 'play', null, 60000);
  await P.ev(([h, m, w]) => {
    N.debug.setTime(h, m); N.debug.freezeClock(true); N.debug.skipDialogue(true);
    if (N.wanted && N.wanted.clear) N.wanted.clear('test');
    N.player.energy = 100;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    window.__res = null; window.__ends = [];
    N.on('party:results', (r) => { window.__res = r; });
    N.on('party:end', (r) => { window.__ends.push(r.id + ':' + r.reason); });
    if (w) N.player.teleport(w.x, w.y);
  }, [h, m, where || null]);
}
async function errorsOf(Ps, label) {
  for (const P of Ps) { const e = await P.errs(); check(!e.length, (label || '') + P.name + ': zero console / page / N.err errors', e.slice(0, 4).join(' | ')); }
}
async function roomOf(Ps, nicks) {
  for (let i = 0; i < Ps.length; i++) await Ps[i].ev((n) => N.online.goOnline().then(() => N.online.setNick(n)), nicks[i]);
  const made = await Ps[0].ev(() => N.online.createRoom());
  for (let i = 1; i < Ps.length; i++) await Ps[i].ev((c) => N.online.joinRoom(c), made.code);
  const n = Ps.length;
  const all = await Ps[0].until((k) => N.online.room && N.online.room.n === k, n, 20000);
  // everybody has everybody's ghost (the stand-ins in the playground games follow them)
  for (const P of Ps) await P.until((k) => N.online.players().filter((q) => !q.me && q.x != null).length >= k - 1, n, 20000);
  return all ? made.code : null;
}
const standings = (P) => P.ev(() => (window.__res ? window.__res.standings.map((r) => ({ nick: r.nick, rank: r.rank, score: r.score, note: r.note, dnf: r.dnf, left: r.left })) : null));
const fmtSt = (st) => (st || []).map((r) => (r.rank || '-') + '. ' + r.nick + ' ' + (r.score == null ? '' : r.score) + (r.note ? ' (' + r.note + ')' : '') + (r.left ? ' [left]' : '')).join(' | ');
async function challengeAll(A, others, id, opts, skip) {
  const r = await A.ev(([id, o]) => { N.party.TUNE.lobbyMs = 60000; return N.party.challenge(id, o || {}); }, [id, opts || {}]);
  check(r && r.ok && r.mode === 'party', A.name + ' challenged the room to ' + id, r);
  for (const P of others) {
    const got = await P.until(() => !!N.party.invite, null, 20000);
    if (!got) { fail(P.name + ' got no invite'); continue; }
    await P.gw(0.2);
    await P.page.keyboard.press(skip && skip.indexOf(P) >= 0 ? 'n' : 'y');
  }
  return A.until(() => N.party.active && N.party.active.phase !== 'lobby', null, 60000);
}

/* ================================================================ SOLO (one page, no room) */
async function solo(browser, S) {
  cur = 'solo';
  console.log('\n== solo: the four activities with the AI friends (no room)');
  const Z = await openPage(browser, 'Z', { viewport: { width: 1000, height: 640 } }, S.url + '#debug', null);
  try {
    await newGame(Z, 16, 40);
    const reg = await Z.ev(() => ['lingocha', 'maram_pitti', 'goli', 'patang_pech'].map((id) => { const s = N.party.get(id); return s ? { id, name: s.name, icon: s.icon, min: s.players.min, max: s.players.max, solo: s.solo, kind: s.kind, where: s.where, token: s.token && s.token.id } : { id, missing: true }; }));
    check(reg.every((r) => !r.missing && r.min === 1 && r.max === 3 && r.solo), 'registered with N.party (1-3 players, solo): ' + reg.map((r) => r.icon + ' ' + r.name).join(', '), reg);
    const avail = await Z.ev(() => N.party.available().map((a) => a.id));
    check(['lingocha', 'maram_pitti', 'goli', 'patang_pech'].every((id) => avail.indexOf(id) >= 0), 'the party picker lists them (N.party.available)');
    // alone at the ground: the plain Join offer, no party prompt on top of it
    const f = await Z.ev(() => { const F = N.playgroundGames.fieldFor('playground_1'); const I = N.interact.get('pg:lingocha:' + F.key); N.player.teleport(I.x, I.y + 2); return { x: I.x, y: I.y }; });
    await Z.gw(0.6);
    const lab = await Z.ev(() => { const c = N.interact.current; return c ? (typeof c.label === 'function' ? c.label(N.player) : c.label) : null; });
    check(/Join/.test(lab || '') && /lingocha/.test(lab || ''), 'alone at the colony ground the prompt is still "' + lab + '" (solo game as before)');
    void f;
    // lingocha solo through the party: Immu and Ayesha in Chinnu's team
    await Z.ev(() => { window.__res = null; N.party.stats.firsts = {}; });
    const r1 = await Z.ev(() => N.party.solo('lingocha', {}));
    check(r1.ok && r1.mode === 'solo', 'N.party.solo("lingocha")');
    check(await Z.until(() => { const s = N.playgroundGames.debug.state(); return s && s.phase === 'aim'; }, null, 90000), 'the match starts at the line (after the 3-2-1)');
    const lin = await Z.ev(() => { const s = N.playgroundGames.debug.state(); return { party: s.party, teams: s.lingocha.teams, home: s.parts.filter((p) => p.team === 0).map((p) => p.name + (p.ai ? '*' : '')), away: s.parts.filter((p) => p.team === 1).map((p) => p.name) }; });
    check(lin.party === 'solo' && lin.home.indexOf('Immu*') >= 0 && lin.home.indexOf('Ayesha*') >= 0, 'solo: the AI friends play in your team: ' + lin.home.join(', ') + ' v ' + lin.away.join(', '), lin);
    await Z.shot('solo_lingocha');
    await Z.ev(() => { const D = N.playgroundGames.debug; D.finishRound('home'); });
    await Z.until(() => { const s = N.playgroundGames.debug.state(); return s && s.lingocha && s.lingocha.round === 2 && s.phase !== 'roundEnd'; }, null, 30000);
    await Z.ev(() => N.playgroundGames.debug.finishRound('home'));
    check(await Z.until(() => !!window.__res, null, 30000), 'the match ends: the party results card');
    const s1 = await standings(Z);
    check(s1 && s1.length === 3 && s1.every((r) => /won 2–0/.test(r.note || '')), 'results: you, Immu and Ayesha all "won 2–0": ' + fmtSt(s1), s1);
    check(await Z.ev(() => N.tape.tin.has('pg_lingocha_friends')), 'first win: the "Lingocha stone" tin token');
    await Z.gw(1.4);
    await Z.shot('solo_lingocha_results');
    await Z.ev(() => N.party.closeCards());
    // maram pitti solo: the friends in the ring, places
    await Z.ev(() => { window.__res = null; });
    check((await Z.ev(() => N.party.solo('maram_pitti', {}))).ok, 'N.party.solo("maram_pitti")');
    check(await Z.until(() => { const s = N.playgroundGames.debug.state(); return s && s.id === 'marampitti' && s.phase === 'play'; }, null, 90000), 'the ring is up, the ball bounced');
    await Z.ev(() => { const D = N.playgroundGames.debug, S = D.session(); for (const P of S.parts) if (!P.isPlayer && P.name !== 'Immu') D.out(P.name); });
    await Z.gw(0.5);
    await Z.ev(() => N.playgroundGames.debug.out('Immu'));
    check(await Z.until(() => !!window.__res, null, 30000), 'last one standing: the results card');
    const s2 = await standings(Z);
    check(s2 && s2[0] && s2[0].rank === 1 && /last one standing/.test(s2[0].note || '') && s2.some((r) => r.nick === 'Immu' && /out 2nd/.test(r.note || '')), 'places: ' + fmtSt(s2), s2);
    await Z.ev(() => N.party.closeCards());
    // goli + kite solo (the in-game bots win quickly)
    for (const [id, tok] of [['goli', 'mg_goli_friends'], ['patang_pech', 'mg_kite_friends']]) {
      await Z.ev(() => { window.__res = null; });
      const rr = await Z.ev((i) => N.party.solo(i, { autoplay: 'win' }), id);
      check(rr.ok, 'N.party.solo("' + id + '")');
      const done = await Z.until(() => { const g = N.minigames.game; if (g && g.phase === 'result') g.cardDo('done'); return !!window.__res; }, null, 240000);
      check(done, id + ': results card');
      const st = await standings(Z);
      check(st && st.length === 3 && st[0].rank === 1, id + ' results with the AI friends: ' + fmtSt(st), st);
      check(await Z.ev((t) => N.tape.tin.has(t), tok), id + ': tin token "' + tok + '" for the first win');
      await Z.until(() => !N.minigames.isOpen(), null, 10000);
      await Z.ev(() => N.party.closeCards());
    }
    await errorsOf([Z], 'solo ');
  } finally { await Z.context.close(); }
}

/* ================================================================ GOLI (two pages) */
async function goli(browser, S, CONF) {
  cur = 'goli';
  console.log('\n== goli: two pages, one ring, turn by turn');
  const A = await openPage(browser, 'A', { viewport: { width: 900, height: 600 } }, S.url + '#debug', CONF);
  const B = await openPage(browser, 'B', { viewport: { width: 900, height: 600 } }, S.url + '#debug', CONF);
  try {
    for (const [P, dx] of [[A, 0], [B, 16]]) await newGame(P, 16, 40, await P.ev((d) => { const p = N.places.playground_1; return { x: p.x + 22 + d, y: p.y + 8 }; }, dx));
    const code = await roomOf([A, B], ['Ravi', 'Pooja']);
    check(!!code, 'room ' + code + ' with Ravi and Pooja');
    // in a room the ground's "Play goli" spot offers "Goli with friends" (the party's start card)
    await A.ev(() => { N.minigames.marblesParty.register(); const s = N.party.get('goli'); const sp = s.spots && s.spots[0]; if (sp) N.player.teleport(sp.x, sp.y + 1); });
    await A.gw(0.8);
    const lab = await A.ev(() => { const c = N.interact.current; return c ? (typeof c.label === 'function' ? c.label(N.player) : c.label) : null; });
    check(/Goli with friends/.test(lab || ''), 'with a friend in the room the prompt at the ground reads "' + lab + '"');
    await A.page.keyboard.press('e');
    check(await A.until(() => N.party._debug.cards().card, null, 5000), 'E opens the start card');
    const card = await A.ev(() => document.querySelector('.pt-card').textContent);
    check(/Challenge the room \(1\)/.test(card) && /Play with AI friends/.test(card), 'start card: "Challenge the room (1)" / "Play with AI friends"');
    await A.ev(() => { N.party.TUNE.lobbyMs = 60000; });
    await A.page.keyboard.press('1');
    check(await B.until(() => !!N.party.invite, null, 20000), 'B gets the invite');
    await B.shot('goli_invite_B');
    await B.page.keyboard.press('y');
    const open = await A.until(() => N.minigames.active === 'marbles', null, 40000) && await B.until(() => N.minigames.active === 'marbles', null, 40000);
    check(open, 'B accepted with Y: the goli ring opens on both pages');
    const sync = await Promise.all([A, B].map((P) => P.ev(() => { const S = N.minigames.game.S; return { seed: N.minigames.game.baseSeed, balls: S.balls.map((b) => b.x.toFixed(3) + ',' + b.y.toFixed(3)).join(' '), pl: S.pl.map((q) => q.nick + (q.me ? '*' : '')) }; })));
    check(sync[0].seed === sync[1].seed && sync[0].balls === sync[1].balls, 'the same board on both pages (seed ' + sync[0].seed + ')');
    check(sync[0].pl.join() === 'Ravi*,Pooja' && sync[1].pl.join() === 'Ravi,Pooja*', 'turn order: Ravi (the host) then Pooja: ' + sync[0].pl.join(', '));
    // A's turn: real keys (aim with ←/→, hold Space, let go)
    check(await A.until(() => { const S = N.minigames.game.S; return S.stage === 'aim' && S.turn === 'me'; }, null, 30000), 'A: "TUMHARI BAARI" (aim)');
    await B.until(() => N.minigames.game.S.stage === 'remote', null, 10000);
    await B.shot('goli_waiting_B');
    await A.page.keyboard.down('ArrowLeft'); await A.gw(0.15); await A.page.keyboard.up('ArrowLeft');
    await A.page.keyboard.down('Space'); await A.gw(0.5); await A.page.keyboard.up('Space');
    check(await A.until(() => N.minigames.game.S.pp.n >= 1, null, 30000), 'A flicked with real keys; the roll settled');
    const seenB = await B.until(() => N.minigames.game.S.pp.n >= 1, null, 30000);
    check(seenB, 'B saw the same flick and took A\'s result');
    const after1 = await Promise.all([A, B].map((P) => P.ev(() => { const S = N.minigames.game.S; return { sc: S.pl.map((q) => q.score).join('-'), balls: S.balls.map((b) => b.id + ':' + b.x.toFixed(2) + ',' + b.y.toFixed(2)).join(' '), turn: S.pp.turnI }; })));
    check(after1[0].sc === after1[1].sc && after1[0].balls === after1[1].balls && after1[0].turn === after1[1].turn, 'after the flick: the same goli, scores (' + after1[0].sc + ') and turn on both pages', after1);
    // B's turn (unless A shoots again): a real mouse drag on B's canvas
    await A.until(() => { const S = N.minigames.game.S; return S.pl[S.pp.turnI].nick === 'Pooja' || S.pp.done; }, null, 60000);
    for (let i = 0; i < 6; i++) {
      const st = await A.ev(() => { const S = N.minigames.game.S; return { who: S.pl[S.pp.turnI].nick, stage: S.stage, n: S.pp.n }; });
      if (st.who === 'Pooja') break;
      // A shoots again (it knocked one out and stayed inside): another real Space flick
      await A.until(() => N.minigames.game.S.stage === 'aim', null, 20000);
      await A.page.keyboard.down('Space'); await A.gw(0.3); await A.page.keyboard.up('Space');
      await A.until((n) => N.minigames.game.S.pp.n > n, st.n, 20000);
    }
    check(await B.until(() => { const S = N.minigames.game.S; return S.stage === 'aim' && S.turn === 'me'; }, null, 30000), 'B: its turn (aim)');
    const box = await B.ev(() => { const g = N.minigames.game, S = g.S, L = S.L, r = g.canvas.getBoundingClientRect(); const p = { x: L.cx + S.striker.x * L.s, y: L.cy + S.striker.y * L.s }; return { x: r.left + p.x, y: r.top + p.y, n: S.pp.n }; });
    await B.page.mouse.move(box.x, box.y - 40); await B.page.mouse.down(); await B.page.mouse.move(box.x + 6, box.y + 60, { steps: 6 }); await B.page.mouse.up();
    check(await B.until((n) => N.minigames.game.S.pp.n > n, box.n, 30000), 'B flicked with a mouse drag (slingshot)');
    check(await A.until((n) => N.minigames.game.S.pp.n > n, box.n, 30000), 'A saw B\'s flick and took B\'s result');
    const after2 = await Promise.all([A, B].map((P) => P.ev(() => { const S = N.minigames.game.S; return { sc: S.pl.map((q) => q.score).join('-'), balls: S.balls.map((b) => b.id + ':' + b.x.toFixed(2) + ',' + b.y.toFixed(2)).join(' ') }; })));
    check(after2[0].sc === after2[1].sc && after2[0].balls === after2[1].balls, 'the same board again on both pages (scores ' + after2[0].sc + ')', after2);
    await A.shot('goli_A');
    await B.shot('goli_B');
    // the rest: the in-game bots take the turns (each page only plays its own turns)
    await Promise.all([A, B].map((P) => P.ev(() => { N.minigames.game.auto = 'win'; })));
    const fin = await A.until(() => !!document.querySelector('.mg-card-result'), null, 300000);
    check(fin, 'the ring is cleared / the flicks run out: the game\'s result card');
    await A.gw(0.6);
    await A.shot('goli_card_A');
    for (const P of [A, B]) { await P.until(() => !!document.querySelector('.mg-card-result [data-do="done"]'), null, 60000); await P.gw(0.3); await P.page.click('.mg-card-result [data-do="done"]').catch(() => {}); }
    check(await A.until(() => !!window.__res, null, 60000) && await B.until(() => !!window.__res, null, 60000), 'party results on both pages');
    const sa = await standings(A), sb = await standings(B);
    check(sa && sb && JSON.stringify(sa) === JSON.stringify(sb), 'the same standings on both pages: ' + fmtSt(sa), { sa, sb });
    await A.until(() => !N.minigames.isOpen() && !!document.querySelector('.pt-results'), null, 20000);
    await A.gw(0.5);
    await A.shot('goli_results_A');
    await errorsOf([A, B], 'goli ');
  } finally { await A.context.close(); await B.context.close(); }
}


/* ================================================================ KITE (two pages: desktop + phone) */
async function kite(browser, S, CONF) {
  cur = 'kite';
  console.log('\n== kite fight: one sky, two terraces (A desktop, B a 390x844 phone)');
  const A = await openPage(browser, 'A', { viewport: { width: 1000, height: 620 } }, S.url + '#debug', CONF);
  const B = await openPage(browser, 'B', { viewport: { width: 390, height: 844 }, touch: true, dpr: 2 }, S.url + '#debug', CONF);
  try {
    for (const [P, dx] of [[A, 0], [B, 20]]) await newGame(P, 17, 0, await P.ev((d) => { const p = N.places.home_terrace || N.places.home; return { x: p.x + d, y: p.y + 6 }; }, dx));
    const code = await roomOf([A, B], ['Ravi', 'Pooja']);
    check(!!code, 'room ' + code);
    const ready = await challengeAll(A, [B], 'patang_pech', { secs: 45 });
    check(ready, 'B accepted: the kite fight starts');
    const open = await A.until(() => N.minigames.active === 'kite', null, 40000) && await B.until(() => N.minigames.active === 'kite', null, 40000);
    check(open, 'the terrace sky opens on both pages');
    const sky = await Promise.all([A, B].map((P) => P.ev(() => { const S = N.minigames.game.S; return { multi: S.kp.multi, roofs: S.roofs.slice(0, 6).map((r) => r.x.toFixed(2)).join(','), me: S.me.ax, peers: S.kp.peers.map((k) => k.nick + '@' + k.ax), Wu: S.Wu }; })));
    check(sky[0].multi && sky[1].multi && sky[0].roofs === sky[1].roofs && sky[0].Wu === sky[1].Wu, 'one shared sky: the same rooftops on both pages (' + sky[0].Wu + ' u wide)', sky);
    check(sky[0].me === 50 && sky[1].me === 100 && sky[0].peers[0] === 'Pooja@100' && sky[1].peers[0] === 'Ravi@50', 'side-by-side terraces: Ravi at 50, Pooja at 100', sky);
    await A.until(() => { const S = N.minigames.game.S; return !S.kp.waitGo && S.me.state === 'fly'; }, null, 40000);
    await B.until(() => { const S = N.minigames.game.S; return !S.kp.waitGo && S.me.state === 'fly'; }, null, 40000);
    // A flies with real keys: turn right a little, pull (Space)
    const a0 = await A.ev(() => ({ x: N.minigames.game.S.me.x, y: N.minigames.game.S.me.y }));
    await A.page.keyboard.down('ArrowRight'); await A.gw(0.3); await A.page.keyboard.up('ArrowRight');
    await A.page.keyboard.down('Space'); await A.gw(1.2); await A.page.keyboard.up('Space');
    // B pulls with the KHENCH touch button
    const kb = await B.ev(() => { const b = document.querySelector('.mg-btn[data-a="pull"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    check(!!kb, 'B (phone): the KHENCH touch button');
    if (kb) { const c = await B.context.newCDPSession(B.page); await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: kb.x, y: kb.y, id: 1 }] }); await B.gw(1.0); await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await c.detach(); }
    const a1 = await A.ev(() => ({ x: N.minigames.game.S.me.x, y: N.minigames.game.S.me.y, pulls: 1 }));
    check(Math.hypot(a1.x - a0.x, a1.y - a0.y) > 3, 'A\'s kite moved with real keys (' + a0.x.toFixed(1) + ',' + a0.y.toFixed(1) + ' -> ' + a1.x.toFixed(1) + ',' + a1.y.toFixed(1) + ')');
    await B.gw(0.5);
    const seen = await Promise.all([A.ev(() => { const S = N.minigames.game.S; return { me: [S.me.x, S.me.y], peer: [S.kp.peers[0].x, S.kp.peers[0].y] }; }), B.ev(() => { const S = N.minigames.game.S; return { me: [S.me.x, S.me.y], peer: [S.kp.peers[0].x, S.kp.peers[0].y] }; })]);
    const dAB = Math.hypot(seen[0].me[0] - seen[1].peer[0], seen[0].me[1] - seen[1].peer[1]), dBA = Math.hypot(seen[1].me[0] - seen[0].peer[0], seen[1].me[1] - seen[0].peer[1]);
    check(dAB < 12 && dBA < 12, 'each page sees the other\'s kite where it is (off by ' + dAB.toFixed(1) + ' / ' + dBA.toFixed(1) + ' u, a network trip)');
    await A.shot('kite_A');
    await B.shot('kite_B_phone');
    // the in-game bots go for each other's manja: the host referees the pech
    await Promise.all([A, B].map((P) => P.ev(() => { N.minigames.game.auto = 'win'; })));
    const pech = await A.until(() => (N.minigames.game && N.minigames.game.S.kp.log || []).some((e) => e.k === 's'), null, 60000);
    check(pech, 'the two lines cross: the host calls a PECH');
    if (pech) {
      await B.until(() => (N.minigames.game.S.kp.log || []).some((e) => e.k === 's'), null, 10000);
      await A.gw(0.4);
      await A.shot('kite_pech_A'); await B.shot('kite_pech_B_phone');
      const both = await Promise.all([A, B].map((P) => P.ev(() => (N.minigames.game.S.kp.log || []).filter((e) => e.k === 's').map((e) => e.id + ':' + e.a + '/' + e.b).join(' '))));
      check(both[0].split(' ')[0] === both[1].split(' ')[0], 'the same pech on both pages (' + both[0].split(' ')[0] + ')');
    }
    const ended = await A.until(() => (N.minigames.game && N.minigames.game.S.kp.log || []).some((e) => e.k === 'e'), null, 60000);
    check(ended, 'the pech is called (' + JSON.stringify(await A.ev(() => (N.minigames.game.S.kp.log || []).filter((e) => e.k === 'e').map((e) => e.how)).catch(() => null)) + ')');
    const fin = await A.until(() => !!document.querySelector('.mg-card-result'), null, 120000) && await B.until(() => !!document.querySelector('.mg-card-result'), null, 30000);
    check(fin, 'the time runs out: the result card on both pages');
    await B.gw(0.6); await B.shot('kite_card_B_phone');
    for (const P of [A, B]) { await P.gw(0.3); await P.ev(() => { const g = N.minigames.game; if (g && g.phase === 'result') g.cardDo('done'); }); }
    check(await A.until(() => !!window.__res, null, 60000) && await B.until(() => !!window.__res, null, 60000), 'party results on both pages');
    const sa = await standings(A), sb = await standings(B);
    const cuts = await Promise.all([A, B].map((P) => P.ev(() => window.__res.standings.map((r) => r.score).join('-'))));
    check(sa && sb && JSON.stringify(sa) === JSON.stringify(sb), 'the same standings on both pages: ' + fmtSt(sa), { sa, sb });
    void cuts;
    await B.until(() => !N.minigames.isOpen() && !!document.querySelector('.pt-results'), null, 20000);
    await B.gw(0.4); await B.shot('kite_results_B_phone');
    await errorsOf([A, B], 'kite ');
  } finally { await A.context.close(); await B.context.close(); }
}


/* ================================================================ LINGOCHA (two pages) */
const pgs = (P) => P.ev(() => N.playgroundGames.debug.state());
const pgLabel = (P) => P.ev(() => { const c = N.interact.current; return c ? (typeof c.label === 'function' ? c.label(N.player) : c.label) : null; });
async function lingocha(browser, S, CONF) {
  cur = 'lingocha';
  console.log('\n== lingocha: two pages at the colony ground (Ravi hosts, Pooja\'s team on the other side)');
  const A = await openPage(browser, 'A', { viewport: { width: 1000, height: 620 } }, S.url + '#debug', CONF);
  const B = await openPage(browser, 'B', { viewport: { width: 1000, height: 620 } }, S.url + '#debug', CONF);
  try {
    for (const [P, dx] of [[A, 0], [B, 14]]) await newGame(P, 16, 40, await P.ev((d) => { const F = N.playgroundGames.fieldFor('playground_1'); return { x: F.line.x + d, y: F.line.y + 10 }; }, dx));
    const code = await roomOf([A, B], ['Ravi', 'Pooja']);
    check(!!code, 'room ' + code);
    // in a room the Join offer becomes the party's "Lingocha with friends" (start card)
    await A.ev(() => { N.playgroundGames.debug.party.registerParty(true); const F = N.playgroundGames.fieldFor('playground_1'); const I = N.interact.get('pg:lingocha:' + F.key); N.player.teleport(I.x, I.y + 1); });
    await A.gw(0.8);
    const lab = await pgLabel(A);
    check(/Lingocha with friends/.test(lab || ''), 'with a friend in the room the ground offers "' + lab + '"');
    await A.page.keyboard.press('e');
    check(await A.until(() => N.party._debug.cards().card, null, 5000), 'E: the start card');
    await A.ev(() => { N.party.TUNE.lobbyMs = 60000; });
    await A.page.keyboard.press('1');
    check(await B.until(() => !!N.party.invite, null, 20000), 'B: the invite card');
    await B.page.keyboard.press('y');
    const both = await A.until(() => { const s = N.playgroundGames.debug.state(); return s && s.net && s.net.host; }, null, 60000) && await B.until(() => { const s = N.playgroundGames.debug.state(); return s && s.net && s.net.guest; }, null, 60000);
    check(both, 'GO: the host\'s game on A, the same game shown on B');
    const ra = await pgs(A), rb = await pgs(B);
    const names = (s) => s.parts.map((p) => p.nick || p.name).join(',');
    check(names(ra) === names(rb), 'the same kids on both pages: ' + names(ra), { a: names(ra), b: names(rb) });
    const teamOf = (s, nick) => { const p = s.parts.find((q) => q.nick === nick || (q.me && q.nick === nick)); return p ? p.team : null; };
    check(teamOf(ra, 'Ravi') === 0 && teamOf(ra, 'Pooja') === 1 && teamOf(rb, 'Pooja') === 1, 'Ravi and Pooja captain opposite teams: ' + ra.lingocha.teams.join(' v '), ra.lingocha.teams);
    check(ra.lingocha.teams[0] === 'Ravi XI' && ra.lingocha.teams[1] === 'Pooja XI' && JSON.stringify(rb.lingocha.teams) === JSON.stringify(ra.lingocha.teams), 'team names: ' + ra.lingocha.teams.join(' v '));
    const shown = await B.until(() => { const s = N.playgroundGames.debug.state(); return s.parts.filter((p) => p.mirror && !p.hidden).length >= 6; }, null, 20000);
    check(shown && ra.parts.find((p) => p.remote && p.nick === 'Pooja') && rb.parts.find((p) => p.remote && p.nick === 'Ravi'), 'B shows the colony kids from A\'s snapshots; each friend follows the other\'s ghost');
    // round 1: Ravi's team seeks; Ravi throws at the stack with real keys (the debug aim assist straightens it)
    check(await A.until(() => { const s = N.playgroundGames.debug.state(); return s && s.phase === 'aim' && s.lingocha.thrower === s.parts.find((p) => p.me).name && !s.auto; }, null, 60000), 'A: Ravi at the chalk line');
    check(await B.until(() => { const s = N.playgroundGames.debug.state(); return s && s.phase === 'aim'; }, null, 20000), 'B sees the line throw coming (phase aim)');
    await A.shot('lingocha_aim_A'); await B.shot('lingocha_aim_B');
    await A.ev(() => { const D = N.playgroundGames.debug; D.assist.aim = true; D.assist.power = 0.55; });
    await A.page.keyboard.down('e'); await A.gw(0.45); await A.page.keyboard.up('e');
    check(await A.until(() => N.playgroundGames.debug.log().some((e) => e.type === 'knock'), null, 20000), 'A knocked the stack down (DHAM!)');
    check(await B.until(() => { const s = N.playgroundGames.debug.state(); return s && s.lingocha.stack === 0 && (s.phase === 'scatter' || s.phase === 'live'); }, null, 20000), 'B sees it: the stack is down, stones everywhere');
    const st = await Promise.all([A, B].map((P) => P.ev(() => N.playgroundGames.debug.state().lingocha.stones.map((q) => q.state).join(','))));
    info('stones A: ' + st[0] + ' | B: ' + st[1]);
    await A.ev(() => { const D = N.playgroundGames.debug; D.assist.aim = false; D.assist.power = null; });
    await A.until(() => N.playgroundGames.debug.state().phase === 'live', null, 20000);
    await A.gw(0.6);
    await A.shot('lingocha_live_A'); await B.shot('lingocha_live_B');
    // Pooja (a hitter) grabs the loose ball with E and throws it at a seeker with E
    await A.ev(() => { const D = N.playgroundGames.debug; D.assist.freezeAI = true; D.assist.noDodge = true; });
    const setup = await A.ev(() => {
      const D = N.playgroundGames.debug, S = D.session(), P = S.parts.find((q) => q.remote), b = S.ball;
      if (b.holder) b.holder.hold = false;
      D.ballTo(P.e.x + 3, P.e.y, 0);
      // a seeker (not Ravi) stands 22 u in front of her; the others well away from her aim
      const T = S.parts.find((q) => q.team === S.L.seek && !q.isPlayer && !q.remote && !q.out && !q.dood);
      T.e.x = P.e.x + 22; T.e.y = P.e.y + 1; T.safeT = 0; T.safeCD = 9;
      let k = 0;
      for (const q of S.parts) if (q !== T && q !== P && !q.isPlayer) { q.e.x = P.e.x - 30 - (k % 3) * 9; q.e.y = P.e.y - 18 + Math.floor(k / 3) * 12; k++; }
      N.player.x = P.e.x - 30; N.player.y = P.e.y + 22;
      return { victim: T.name, at: [P.e.x, P.e.y] };
    });
    await B.ev(() => { N.player.angle = N.player.facing = 0; });
    check(await B.until(() => { const c = N.interact.current; const l = c ? (typeof c.label === 'function' ? c.label(N.player) : c.label) : ''; return /Pick up ball/.test(l); }, null, 15000), 'B: "Pick up ball" by her feet');
    await B.page.keyboard.press('e');
    check(await A.until(() => { const s = N.playgroundGames.debug.state(); return s.ball.holder === 'Pooja'; }, null, 10000), 'B pressed E: on A the ball is in Pooja\'s hand');
    check(await B.until(() => N.playgroundGames.debug.state().ball.holderIsMe, null, 10000), '... and in hers on B');
    await B.ev(() => { N.player.angle = N.player.facing = 0; });
    await B.gw(0.3);
    const tgt = await B.ev(() => N.playgroundGames.debug.state().target);
    check(tgt === setup.victim, 'B\'s reticle on ' + tgt + ' (a seeker)');
    await B.shot('lingocha_hold_B');
    await B.page.keyboard.press('e');
    check(await A.until((v) => N.playgroundGames.debug.log().some((e) => e.type === 'out' && e.name === v), setup.victim, 15000), 'B threw with E: ' + setup.victim + ' is OUT (judged by the host\'s game)');
    check(await B.until((v) => N.playgroundGames.debug.state().parts.some((p) => p.name === v && p.out), setup.victim, 10000), '... and out on B too');
    await A.ev(() => { const D = N.playgroundGames.debug; D.assist.freezeAI = false; D.assist.noDodge = false; });
    // round 2: Pooja's team seeks; she throws at the stack on her own page (real keys)
    await A.ev(() => N.playgroundGames.debug.finishRound('home'));
    check(await B.until(() => { const s = N.playgroundGames.debug.state(); return s && s.lingocha.round === 2 && s.phase === 'aim' && s.lingocha.thrower === s.parts.find((p) => p.me).name && !s.auto; }, null, 60000), 'round 2: the sides swap; Pooja at the line on B');
    await B.ev(() => { const D = N.playgroundGames.debug; D.assist.aim = true; D.assist.power = 0.55; });
    await B.gw(0.3);
    await B.page.keyboard.down('e'); await B.gw(0.45); await B.page.keyboard.up('e');
    check(await A.until(() => N.playgroundGames.debug.log().some((e) => e.type === 'player_throw' && e.remote === 'Pooja'), null, 15000), 'B\'s line throw reached the host\'s game');
    const kn = await A.until(() => N.playgroundGames.debug.log().filter((e) => e.type === 'knock').length >= 2, null, 15000);
    check(kn, 'Pooja knocked the stack down');
    await B.ev(() => { const D = N.playgroundGames.debug; D.assist.aim = false; D.assist.power = null; });
    await A.until(() => N.playgroundGames.debug.state().phase === 'live', null, 20000);
    // an AI hitter throws at Pooja: the hit is judged on her page and reported
    await A.ev(() => { const D = N.playgroundGames.debug; D.assist.freezeAI = true; });
    await B.ev(() => { N.player.vx = N.player.vy = 0; });
    await B.gw(0.5);
    const thr = await A.ev(() => {
      const D = N.playgroundGames.debug, S = D.session(), P = S.parts.find((q) => q.remote);
      const K = S.parts.find((q) => q.team !== S.L.seek && !q.isPlayer && !q.remote);
      K.e.x = P.e.x - 24; K.e.y = P.e.y; P.safeT = 0;
      D.throwAt(P.name, K.name, true);
      return K.name;
    });
    check(await B.until(() => N.playgroundGames.debug.log().some((e) => e.type === 'hit_report'), null, 10000), 'the ball reached Pooja on her page: her page reports the hit');
    const outA = await A.until(() => N.playgroundGames.debug.log().some((e) => e.type === 'out' && e.name === 'Pooja'), null, 10000);
    check(outA, 'A: Pooja is OUT (hit by ' + thr + ')', await A.ev(() => N.playgroundGames.debug.log().filter((e) => /remote_hit|out/.test(e.type)).slice(-5)));
    check(await B.until(() => { const s = N.playgroundGames.debug.state(); return s.parts.find((p) => p.me).out; }, null, 10000), 'B: "OUT! Sit at the side"');
    await A.ev(() => { N.playgroundGames.debug.assist.freezeAI = false; });
    await B.gw(1.2);
    await B.shot('lingocha_out_B');
    // round 2 to Pooja's side; round 3 waits for Ravi at the line (nothing moves till he throws): a 3D look on B meanwhile
    await A.ev(() => N.playgroundGames.debug.finishRound('away'));
    check(await A.until(() => { const s = N.playgroundGames.debug.state(); return s && s.lingocha.round === 3 && s.phase === 'aim'; }, null, 60000), 'round 3: Ravi\'s side seeks again (1-1)');
    await B.ev(() => { N.view.set('tps'); });
    if (await B.until(() => N.view3d && N.view3d.active, null, 180000)) {
      await B.ev(() => { N.view3d.setQuality({ pixelRatio: 0.4, adaptive: false }); });
      const f0 = await B.ev(() => N.time.frame);
      await B.until((f) => N.time.frame > f + 8, f0, 240000);
      const V = await B.ev(() => { const V = N.playgroundGames.debug.v3; return { vis: !!(V.grp && V.grp.visible), rings: V.rings.filter((m) => m.visible).length, ball: !!(V.ball && V.ball.visible) }; });
      check(V.vis && V.rings >= 4 && V.ball, 'B in 3D: the ground layer (team rings, ball, stones) from the host\'s game', Object.assign(V, await B.ev(() => { const s = N.playgroundGames.debug.state(); return { cur: !!N.playgroundGames.current, ended: s && s.ended, phase: s && s.phase }; })));
      await B.shot('lingocha_3d_B');
      await B.ev(() => N.view.set('top'));
      await B.until(() => !N.view3d.active, null, 60000);
    } else fail('B: no 3D view');
    // the match: Ravi's team takes round 3 (2-1)
    await A.ev(() => N.playgroundGames.debug.finishRound('home'));
    const fin = await A.until(() => !!window.__res, null, 60000) && await B.until(() => !!window.__res, null, 60000);
    check(fin, 'the match is over: party results on both pages');
    const sa = await standings(A), sb = await standings(B);
    check(sa && sb && JSON.stringify(sa) === JSON.stringify(sb) && sa[0].nick === 'Ravi' && /won/.test(sa[0].note) && /lost/.test(sa[1].note), 'the same standings, the winning side first: ' + fmtSt(sa), { sa, sb });
    check(await A.ev(() => N.tape.tin.has('pg_lingocha_friends')), 'Ravi\'s first win: the tin token');
    await B.gw(1.4);
    await B.shot('lingocha_results_B');
    await errorsOf([A, B], 'lingocha ');
  } finally { await A.context.close(); await B.context.close(); }
}

/* ================================================================ main */
(async () => {
  const t0 = Date.now();
  const S = await staticServer();
  const M = await mock.start({ key: 'test-publishable-key' });
  const CONF = { provider: 'supabase', url: M.url, key: M.key, sdk: [SDK_CDN, 'vendor/supabase/supabase.js'], maxPlayers: 3, stateHz: 8 };
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (only('solo')) await solo(browser, S);
    if (only('goli')) await goli(browser, S, CONF);
    if (only('kite')) await kite(browser, S, CONF);
    if (only('lingocha')) await lingocha(browser, S, CONF);
  } catch (e) { fail('crashed: ' + (e.stack || e.message)); }
  await browser.close();
  try { S.srv.close(); } catch (e) { /* ignore */ }
  try { await M.close(); } catch (e) { /* ignore */ }
  console.log('\n' + (failures.length ? failures.length + ' FAILURE(S):\n  ' + failures.join('\n  ') : 'ALL PARTY-GAMES CHECKS PASSED') + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  process.exit(failures.length ? 1 : 0);
})();
