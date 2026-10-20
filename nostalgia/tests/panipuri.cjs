/* NOSTALGIA — tests/panipuri.cjs  (src/panipuri.js: the PANI PURI EATING CONTEST)
 *
 *   desktop  1280x720, keyboard: walk up to Gokul Chat, E opens the card, ↑ to the contest row, E pays ₹5 through shops.js;
 *            the how-to card (Enter), real Space taps + a held Space (rhythm) eat puris, the AI friends' plates fill up,
 *            the teekha meter rises; the result card (Enter); a pani-puri cart's own "Pani puri contest ₹5" prompt (E,
 *            then Esc / Quit); an autoplay win puts the Pani Puri Champion badge in the tin.
 *   phone    390x844 touch (CDP): the how-to card tapped, the KHAAO! button and the dona tapped / held.
 *   party    (when N.party.register exists) two pages in one online room (tests/online_mock.cjs, the real supabase-js):
 *            A challenges B, B accepts with Y, both eat with real keys in the same seeded contest, A sees B's live tally as
 *            a plate stack, both get the party results.
 * Zero console errors / page errors / N.err everywhere. Screenshots: tests/out/panipuri_*.png
 *   node nostalgia/tests/panipuri.cjs        ONLY=desktop|phone|party   SHOTS=0
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const FILE_URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const SHOT_MS = 180000;
const SDK_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
const failures = [];
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const check = (c, m) => { if (c) ok(m); else fail(m); return !!c; };
const only = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openPage(browser, V, url, conf) {
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.dpr || 1, hasTouch: !!V.touch, isMobile: !!V.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  if (conf) {
    const SDK_JS = fs.readFileSync(path.join(ROOT, 'vendor/supabase/supabase.js'), 'utf8');
    await page.route(SDK_CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: SDK_JS }));
    await page.addInitScript((c) => { window.NOSTALGIA_ONLINE_CONFIG = c; }, conf);
  }
  await page.goto(url || FILE_URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.evaluate(() => {
    // game-clock waits: resolve after `secs` of game time (frame time while the clock is stopped)
    window.__gw = (secs) => new Promise((res) => { let acc = 0, n0 = N.time.now, r0 = N.time.real; const t0 = performance.now(), cap = secs * 8000 + 5000; (function chk() { const dn = N.time.now - n0, dr = N.time.real - r0; n0 = N.time.now; r0 = N.time.real; acc += dn > 0 ? dn : dr; if (acc >= secs || performance.now() - t0 > cap) res(acc); else requestAnimationFrame(chk); })(); });
  });
  const P = { page, context, errors };
  P.ev = (fn, arg) => page.evaluate(fn, arg);
  P.gw = (s) => page.evaluate((x) => window.__gw(x), s);
  P.shot = async (n) => { if (process.env.SHOTS === '0') return; await page.screenshot({ path: path.join(OUT, 'panipuri_' + n + '.png'), timeout: SHOT_MS }); };
  P.errs = async () => errors.concat(await page.evaluate(() => (N.debug.state().errors || []).map((e) => 'N.err ' + e)).catch(() => []));
  P.until = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 15000, polling: 100 }).then(() => true, () => false);
  return P;
}
async function newGame(P, h, m) {
  await P.ev(([h, m]) => {
    N.debug.newGame({ skipIntro: true });
    N.calendar.set(2003, 1, 20, h, m);
    N.debug.freezeClock(true);
    if (N.testing && N.testing.setUnlimitedMoney) N.testing.unlimitedMoney = false;
    N.player.money = 5000;
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    window.__buys = []; N.on('shop:buy', (b) => window.__buys.push(b));
    window.__pp = []; N.on('panipuri:contest', (e) => window.__pp.push(e));
  }, [h, m]);
  await P.until(() => N.state.mode === 'play');
}
const S_ = (expr) => `(() => { const g = N.minigames.game; const S = g && g.S; return ${expr}; })()`;

/* ================================================================ desktop: keyboard */
async function desktop(browser) {
  console.log('\n== desktop 1280x720 (keyboard)');
  const P = await openPage(browser, { viewport: { width: 1280, height: 720 } });
  await newGame(P, 19, 0);
  // Gokul Chat: walk in (teleport beside it), E opens the card
  await P.ev(() => { const p = N.places.gokul_chat; N.player.teleport(p.x, p.y + 6); });
  await P.gw(0.6);
  check(await P.ev(() => !!(N.interact.current && /shop:gokul_chat/.test(N.interact.current.id || ''))), 'E prompt at Gokul Chat is the shop card');
  await P.page.keyboard.press('e');
  check(await P.until(() => N.shops.isOpen()), 'E opened the Gokul Chat card');
  const rowInfo = await P.ev(() => { const rows = Array.from(document.querySelectorAll('.shop-row')); const sel = rows.findIndex((r) => r.classList.contains('sel')); const mine = rows.findIndex((r) => /eating contest/i.test(r.textContent)); return { sel, mine, n: rows.length }; });
  check(rowInfo.mine >= 0, 'the card lists "Pani puri eating contest" (row ' + rowInfo.mine + ' of ' + rowInfo.n + ')');
  for (let i = 0; i < Math.abs(rowInfo.sel - rowInfo.mine); i++) { await P.page.keyboard.press(rowInfo.sel > rowInfo.mine ? 'ArrowUp' : 'ArrowDown'); await P.gw(0.05); }
  await P.shot('desktop_card');
  const money0 = await P.ev(() => N.player.money);
  await P.page.keyboard.press('e');
  check(await P.until(() => N.minigames.active === 'pp_contest', null, 8000), 'E on the row paid and opened the contest');
  const money1 = await P.ev(() => N.player.money);
  const buy = await P.ev(() => window.__buys.find((b) => b.item === 'pp_contest'));
  check(buy && buy.place === 'gokul_chat' && buy.price === 500 && money0 - money1 === 500, '₹5 paid through shops.js (shop:buy gokul_chat pp_contest, money ' + money0 + ' -> ' + money1 + ')');
  await P.until(() => document.querySelector('.mg-card-howto'));
  await P.shot('desktop_howto');
  await P.page.keyboard.press('Enter');
  check(await P.until(() => N.minigames.game && N.minigames.game.phase === 'play', null, 10000), 'Enter on the how-to card started the countdown -> play');
  // real input: taps on the beat, then a held Space (steady rhythm)
  for (let i = 0; i < 14; i++) { await P.page.keyboard.press('Space'); await P.gw(0.42); }
  await P.page.keyboard.down('Space'); await P.gw(2.5); await P.page.keyboard.up('Space');
  const mid = await P.ev(S_('({ eaten: S.eaten, heat: S.heat, rivals: S.rivals.map((r) => r.nick + ":" + r.n), t: S.t, coughs: S.coughs, misses: S.misses })'));
  check(mid.eaten >= 4, 'real Space taps + hold ate puris: ' + mid.eaten + ' (t ' + mid.t.toFixed(1) + ' s, misses ' + mid.misses + ', coughs ' + mid.coughs + ')');
  check(mid.rivals.length === 3 && mid.rivals.every((r) => +r.split(':')[1] > 0), 'AI friends eat beside you: ' + mid.rivals.join(', '));
  await P.shot('desktop_play');
  // gobbling: two quick taps while still chewing (with two puris waiting) count as a gobble and heat the meter
  await P.until(S_('S.dona.length >= 2 && S.water <= 0'), null, 15000);
  const g0 = await P.ev(S_('({ g: S.gobbles, h: S.heat })'));
  await P.page.keyboard.press('Space'); await P.gw(0.12); await P.page.keyboard.press('Space');
  await P.gw(0.1);
  const g1 = await P.ev(S_('({ g: S.gobbles, h: S.heat, hm: S.heatMax })'));
  check(g1.g > g0.g && g1.hm > 0, 'rapid taps while chewing = gobbling (' + g0.g + ' -> ' + g1.g + '), the teekha meter rises (' + g1.hm.toFixed(0) + '%)');
  // let the rest run quickly (no input) to the result card
  await P.ev(() => { N.minigames.game.timeScale = 6; });
  check(await P.until(() => !!document.querySelector('.mg-card-result'), null, 60000), 'the contest ends on the clock with a result card');
  const res = await P.ev(() => document.querySelector('.mg-card-result').textContent);
  check(/Immu|Ayesha|Pappu/.test(res) && /puris/.test(res), 'the result card ranks you against the friends');
  await P.gw(0.8);
  await P.shot('desktop_result');
  await P.gw(0.4);
  await P.page.click('.mg-card-result [data-do="done"]');
  check(await P.until(() => !N.minigames.isOpen() && N.state.mode === 'play', null, 8000), 'clicking the result card\'s first button closed it back to the city');
  const ev = await P.ev(() => window.__pp[0]);
  check(ev && ev.place === 'gokul_chat', 'panipuri:contest event (eaten ' + (ev && ev.eaten) + ')');
  // a pani-puri cart: its own contest prompt beside the cart (the cart's "Pani puri ₹5" stays reachable)
  const cart = await P.ev(() => {
    const sp = N.streetfood.spots.find((s) => s.kind === 'panipuri');
    if (!sp) return null;
    N.streetfood.force(sp.id, { level: 0.8, keep: true });
    const it = N.interact.get('pp:' + sp.id);
    N.player.teleport(it.x, it.y + 2);
    return { id: sp.id, x: it.x, y: it.y };
  });
  check(!!cart, 'a pani-puri cart spot with a contest prompt' + (cart ? ' (' + cart.id + ')' : ''));
  if (cart) {
    await P.until(() => N.interact.current && /^pp:/.test(N.interact.current.id || ''), null, 8000);
    const lab = await P.ev(() => (N.interact.current ? (typeof N.interact.current.label === 'function' ? N.interact.current.label(N.player) : N.interact.current.label) : null));
    check(/contest/i.test(lab || ''), 'the prompt at the cart reads "' + lab + '"');
    await P.page.keyboard.press('e');
    check(await P.until(() => N.minigames.active === 'pp_contest', null, 8000), 'E at the cart opened the contest (paid through shops.js: ' + (await P.ev(() => window.__buys.filter((b) => b.item === 'pp_contest').length)) + ' buys)');
    await P.until(() => document.querySelector('.mg-card-howto'));
    await P.shot('desktop_cart_howto');
    await P.page.click('.mg-card-howto [data-do="quit"]');
    check(await P.until(() => !N.minigames.isOpen(), null, 8000), '"Not now" closed it');
    await P.ev(() => N.streetfood.force(null));
  }
  // autoplay win -> the champion badge in the tin
  const win = await P.ev(() => N.panipuri.play({ autoplay: 'win', skipHowto: true, seed: 7 }).then((r) => ({ win: r.win, eaten: r.eaten, rank: r.rank, of: r.of })));
  check(win.win && win.rank === 1, 'autoplay contest won: ' + win.eaten + ' puris, rank ' + win.rank + '/' + win.of);
  check(await P.ev(() => N.tape.tin.has('pp_champion') && /Champion/.test(N.tape.tokens.pp_champion.name)), 'the Pani Puri Champion badge is in the tin');
  check(await P.ev(() => N.panipuri.best > 0 && N.panipuri.champion), 'record kept (best ' + (await P.ev(() => N.panipuri.best)) + ')');
  const e = await P.errs();
  check(!e.length, 'desktop: zero errors' + (e.length ? ': ' + e.slice(0, 3).join(' | ') : ''));
  await P.context.close();
}

/* ================================================================ phone: touch */
async function phone(browser) {
  console.log('\n== phone 390x844 (touch)');
  const P = await openPage(browser, { viewport: { width: 390, height: 844 }, touch: true, dpr: 2 });
  await newGame(P, 18, 30);
  const cdp = await P.context.newCDPSession(P.page);
  const tap = async (x, y, holdS) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await P.gw(holdS || 0.06); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const center = async (sel) => { const b = await P.page.locator(sel).first().boundingBox(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; };
  await P.ev(() => { const p = N.places.gokul_chat; N.player.teleport(p.x, p.y + 6); });
  check(await P.ev(() => N.panipuri.start('gokul_chat')), 'N.panipuri.start paid at Gokul Chat');
  check(await P.until(() => !!document.querySelector('.mg-card-howto'), null, 10000), 'how-to card up');
  await P.shot('phone_howto');
  const st = await center('.mg-card-howto [data-do="start"]');
  await tap(st.x, st.y);
  check(await P.until(() => N.minigames.game && N.minigames.game.phase === 'play', null, 10000), 'tapped "Shuru karo!" -> play');
  const btn = await center('.mg-btn[data-a="eat"]');
  check(!!btn, 'the KHAAO! touch button is shown');
  for (let i = 0; i < 12; i++) { await tap(btn.x, btn.y); await P.gw(0.4); }
  await tap(btn.x, btn.y, 2.2); // hold = steady rhythm
  const dona = await P.ev(S_('S.L && ({ x: S.L.dx, y: S.L.dy })'));
  const rect = await P.ev(() => { const r = document.querySelector('.mg-canvas').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  for (let i = 0; i < 4; i++) { await tap(rect.x + dona.x, rect.y + dona.y); await P.gw(0.45); }
  const mid = await P.ev(S_('({ eaten: S.eaten, rivals: S.rivals.map((r) => r.n) })'));
  check(mid.eaten >= 4, 'touch taps on KHAAO! and the dona ate ' + mid.eaten + ' puris; friends ' + mid.rivals.join('/'));
  await P.shot('phone_play');
  await P.ev(() => { N.minigames.game.timeScale = 6; });
  check(await P.until(() => !!document.querySelector('.mg-card-result'), null, 60000), 'result card');
  await P.gw(0.8);
  await P.shot('phone_result');
  await P.gw(0.4);
  const done = await center('.mg-card-result [data-do="done"]');
  await tap(done.x, done.y);
  check(await P.until(() => !N.minigames.isOpen(), null, 8000), 'tapped the result card closed');
  const e = await P.errs();
  check(!e.length, 'phone: zero errors' + (e.length ? ': ' + e.slice(0, 3).join(' | ') : ''));
  await P.context.close();
}

/* ================================================================ party: two pages, one room */
function staticServer() {
  const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' };
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' })));
}
async function party(browser) {
  console.log('\n== party: two pages in one room (online mock)');
  const mock = require('./online_mock.cjs');
  const S = await staticServer();
  const M = await mock.start({ key: 'test-publishable-key' });
  const CONF = { provider: 'supabase', url: M.url, key: M.key, sdk: [SDK_CDN, 'vendor/supabase/supabase.js'], maxPlayers: 10, stateHz: 8 };
  const A = await openPage(browser, { viewport: { width: 1000, height: 640 } }, S.url + '#debug', CONF);
  const B = await openPage(browser, { viewport: { width: 1000, height: 640 } }, S.url + '#debug', CONF);
  try {
    const has = await A.ev(() => !!(N.party && typeof N.party.register === 'function' && N.party.get && N.party.get('panipuri_contest')));
    if (!check(has, 'N.party is there and panipuri_contest is registered')) return;
    for (const [P, nick, dx] of [[A, 'Ravi', 0], [B, 'Pooja', 14]]) {
      await newGame(P, 19, 0);
      await P.ev(([dx]) => { const p = N.places.gokul_chat; N.player.teleport(p.x + dx, p.y + 20); }, [dx]);
      await P.ev((n) => N.online.goOnline().then(() => N.online.setNick(n)), nick);
    }
    const made = await A.ev(() => N.online.createRoom());
    check(made.ok, 'room ' + made.code);
    const jb = await B.ev((c) => N.online.joinRoom(c), made.code);
    check(jb.ok && await A.until(() => N.online.room && N.online.room.n === 2, null, 15000), 'B joined; A sees 2 players');
    const ch = await A.ev(() => N.party.challenge('panipuri_contest', { secs: 20 }));
    check(ch.ok && ch.mode === 'party', 'A challenged the room to the pani puri contest');
    check(await B.until(() => !!N.party.invite, null, 15000), 'B got the invite card');
    await B.shot('party_invite');
    await B.page.keyboard.press('y');
    check(await A.until(() => N.minigames.active === 'pp_contest', null, 30000) && await B.until(() => N.minigames.active === 'pp_contest', null, 30000), 'B accepted with Y; the contest opened on both pages');
    const seeds = [await A.ev(() => N.minigames.game.baseSeed), await B.ev(() => N.minigames.game.baseSeed)];
    check(seeds[0] === seeds[1], 'same seed on both pages (' + seeds[0] + ')');
    check(await A.until(S_('S && !S.waitParty'), null, 15000), 'GO on the shared clock');
    // both eat with real keys
    for (let i = 0; i < 16; i++) { await Promise.all([A.page.keyboard.press('Space'), B.page.keyboard.press('Space')]); await A.gw(0.45); }
    const aSees = await A.ev(S_('S.rivals.map((r) => ({ nick: r.nick, n: r.n, remote: r.remote }))'));
    const bEat = await B.ev(S_('S.eaten'));
    const rem = aSees.find((r) => r.remote);
    check(rem && rem.n > 0 && Math.abs(rem.n - bEat) <= 3, 'A sees Pooja\'s live tally as a plate stack: ' + (rem && rem.n) + ' (B ate ' + bEat + ')');
    await A.shot('party_A');
    await B.shot('party_B');
    check(await A.until(() => !!document.querySelector('.mg-card-result'), null, 60000), 'the contest ended (20 s)');
    await A.gw(0.5);
    for (const P of [A, B]) { await P.until(() => !!document.querySelector('.mg-card-result [data-do="done"]'), null, 30000); await P.page.click('.mg-card-result [data-do="done"]'); }
    check(await A.until(() => N.party.last && N.party.last.id === 'panipuri_contest', null, 30000) && await B.until(() => N.party.last && N.party.last.id === 'panipuri_contest', null, 30000), 'party results on both pages');
    const st = await A.ev(() => N.party.last.standings.map((r) => r.nick + ':' + r.score + '#' + r.rank));
    check(st.length === 2 && st.every((s) => /#\d/.test(s)), 'standings: ' + st.join(', '));
    await A.gw(1);
    await A.shot('party_results');
    for (const [P, n] of [[A, 'A'], [B, 'B']]) { const e = await P.errs(); check(!e.length, 'party ' + n + ': zero errors' + (e.length ? ': ' + e.slice(0, 3).join(' | ') : '')); }
  } finally {
    await A.context.close(); await B.context.close();
    try { S.srv.close(); } catch (e) { /* ignore */ }
    try { await M.close(); } catch (e) { /* ignore */ }
  }
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-gpu-compositing'] });
  try {
    if (only('desktop')) await desktop(browser);
    if (only('phone')) await phone(browser);
    if (only('party')) await party(browser);
  } catch (e) { fail('crashed: ' + (e.stack || e.message)); }
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAILURE(S):\n  ' + failures.join('\n  ') : 'ALL PANI PURI CHECKS PASSED'));
  process.exit(failures.length ? 1 : 0);
})();
