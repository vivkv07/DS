/* NOSTALGIA — tests/party_cricket.cjs  (cricket with friends: src/cricket_match.js party layer + the gully engine in
 * the 'cricket' section of src/minigames.js, through the src/party.js contract)
 *
 *   solo   desktop 1280x720: the registry ('gully_cricket', 'lb_match', 'lb_match_vs': name, icon, place, 1-3 players),
 *          the "E Start gully cricket with friends" prompt beside the colony ground (real E, then 1 on the start card)
 *          -> gully cricket with Ayesha and Immu: REAL keys as the batter (a timed ↑ as the ball arrives), as the fielder
 *          (Space as the catch ring closes) and as the bowler (← ↑ Q to set line / length / pace, Space with the needle
 *          in the green); the rest by the in-page autopilot; the party results card and the tin token for a win.
 *          Then the LB Stadium co-op match solo (autopilot): two innings, the party results.
 *   phone  390x844 touch (CDP): each role's pad in gully cricket (◀ ▶ ▼ ▲ PACE + BOWL, ◀ PULL ▲ DRIVE CUT ▶, CATCH!),
 *          taps on them; the LB match's batting / bowling / watching pads.
 *   two    two pages in one room (tests/online_mock.cjs + the real supabase-js; never supabase.co): A challenges, B accepts
 *          with Y; gully: B bowls the first ball with real keys while A bats it, then the autopilots; both pages keep
 *          the same scorebook and get the same results; the LB co-op match and the friends-vs-friends match the same way.
 *   three  three pages: gully with bat / bowl / field on three pages at once (a screenshot of each view), then the third
 *          page leaves mid-game: the AI plays for them, the other two finish with identical results ("left" for C).
 * Zero console errors / page errors / N.err everywhere. Screenshots: tests/out/party_cricket_*.png
 * Waits are game-time waits (window.__gw) or page conditions: the machine is shared and pages run slowly.
 *   node nostalgia/tests/party_cricket.cjs        ONLY=solo,phone,two,three   SHOTS=0
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
const SDK_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
const SHOT_MS = 180000;
const failures = [];
let checks = 0;
const fail = (m) => { checks++; failures.push(m); console.log('  FAIL ' + m); };
const ok = (m) => { checks++; console.log('  ok   ' + m); };
const info = (m) => console.log('       ' + m);
const check = (c, m) => { if (c) ok(m); else fail(m); return !!c; };
const only = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k);

async function openPage(browser, name, V, url, conf) {
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
  const P = { name, page, context, errors, V };
  P.ev = (fn, arg) => page.evaluate(fn, arg);
  P.gw = (s) => page.evaluate((x) => window.__gw(x), s);
  P.shot = async (n) => { if (process.env.SHOTS === '0') return; const f = path.join(OUT, 'party_cricket_' + n + '.png'); await page.screenshot({ path: f, timeout: SHOT_MS }); P.shots = (P.shots || []).concat(f); };
  P.errs = async () => errors.concat(await page.evaluate(() => (N.debug.state().errors || []).map((e) => 'N.err ' + e)).catch(() => []));
  P.until = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 15000, polling: 100 }).then(() => true, () => false);
  P.raf = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 15000, polling: 'raf' }).then(() => true, () => false);
  P.gd = () => page.evaluate(() => N.cricketMatch.gully.debug());
  P.md = () => page.evaluate(() => N.cricketMatch.debug.party());
  return P;
}
async function newGame(P, place) {
  await P.ev(() => {
    N.debug.newGame({ skipIntro: true });
    N.debug.setTime(11, 0); // late morning: no story match / Gully League starts on its own at the colony ground
    N.debug.freezeClock(true);
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    N.party._debug.resetStats();
    window.__res = null; window.__ends = [];
    N.on('party:results', (d2) => { window.__res = d2; });
    N.on('party:end', (d2) => { window.__ends.push(d2.id + ':' + d2.reason); });
  });
  await P.until(() => N.state.mode === 'play', null, 20000);
  if (place) await P.ev((pl) => { const p = N.places[pl]; N.player.teleport(p.x + 4, p.y + 4); }, place);
}
const closeCards = (P) => P.ev(() => { N.party.closeCards(); });
const results = (P) => P.ev(() => (window.__res ? window.__res.standings.map((r) => ({ nick: r.nick, rank: r.rank, score: r.score, note: r.note, dnf: r.dnf, left: r.left, isAI: r.isAI })) : null));
const fmtSt = (st) => (st || []).map((r) => (r.rank || '-') + '.' + r.nick + ':' + r.score + (r.left ? '(left)' : r.dnf ? '(dnf)' : '')).join(' ');
const bookG = (d) => d && d.inns.map((x) => x.bat + ' ' + x.runs + '/' + x.wk + ' (' + x.balls + ') ' + x.log.join('')).join(' | ');
const bookM = (d) => d && d.innings.map((i) => i && i.team + ' ' + i.runs + '/' + i.wkts + ' (' + i.balls + ')').join(' | ');

/* ---------------------------------------------------------------- gully helpers (in-page state through the debug hook) */
// wait until it is THIS page's turn in a role (bat / bowl / field) at a given stage
const waitRole = (P, role, stage, ms) => P.until(([r, s]) => { const d = N.cricketMatch.gully.debug(); return !!d && d.role === r && d.stage === s && d.started; }, [role, stage], ms || 60000);
// press a key just as the ball arrives at the bat (the shot's timing is taken at the key press)
async function timedSwing(P, key) {
  if (!(await P.raf(() => { const d = N.cricketMatch.gully.debug(); return d && d.stage === 'flight' && d.tArrive != null; }, null, 30000))) return null;
  const d = await P.gd();
  const rem = d.tArrive - d.clock;
  if (rem > 0.12) await P.gw(rem - 0.1);
  await P.raf(() => { const d2 = N.cricketMatch.gully.debug(); return !d2 || d2.stage !== 'flight' || d2.tArrive - d2.clock < 0.045; }, null, 5000);
  await P.page.keyboard.press(key);
  await P.until(() => { const d2 = N.cricketMatch.gully.debug(); return !d2 || d2.stage !== 'flight' || d2.swings > 0; }, null, 5000);
  return P.gd();
}

/* ================================================================ SOLO: the gang, real keys */
async function solo(browser) {
  console.log('\n== solo (desktop 1280x720): registry, the start prompt, gully cricket with real keys, the LB co-op match');
  const P = await openPage(browser, 'solo', { viewport: { width: 1280, height: 720 } });
  await newGame(P);
  const reg = await P.ev(() => ['gully_cricket', 'lb_match', 'lb_match_vs'].map((id) => { const s = N.party.get(id); return s && { id, name: s.name, icon: s.icon, where: s.where, kind: s.kind, min: s.players.min, max: s.players.max, solo: s.solo, spots: (s.spots || []).length }; }));
  check(reg[0] && reg[0].name === 'Gully cricket' && reg[0].icon === '🏏' && reg[0].where == null && reg[0].min === 1 && reg[0].max === 3 && reg[0].solo, 'registered (alone: anywhere; placed at the grounds once friends are in the room): ' + JSON.stringify(reg[0]));
  check(reg[1] && reg[1].name === 'LB Stadium match' && reg[1].where === 'lb_stadium' && reg[1].min === 1 && reg[1].max === 3 && reg[1].solo, 'registered: ' + JSON.stringify(reg[1]));
  check(reg[2] && reg[2].where === 'lb_stadium' && reg[2].min === 2 && reg[2].max === 3 && !reg[2].solo, 'registered (friends vs friends): ' + JSON.stringify(reg[2]));
  const near = await P.ev(() => { const p = N.places.playground_home; return N.party.available(p.x, p.y).filter((a) => /cricket|lb_/.test(a.id)).map((a) => ({ id: a.id, here: a.here, anywhere: a.anywhere, at: a.atName, d: Math.round(a.d) })); });
  check(near.some((a) => a.id === 'gully_cricket' && a.here && a.anywhere) && near.some((a) => a.id === 'lb_match' && !a.here), 'alone: gully cricket is "anywhere" (the picker), the LB match is placed at the stadium (' + JSON.stringify(near) + ')');
  // alone, the ground keeps its own offers: no party prompt there (the solo "Join gully cricket" stays at the centre)
  const side = await P.ev(() => { const si = N.minigames.SIDE.findIndex((s) => s.id === 'cricket'); const it = N.interact.get('mg:cricket:' + si + ':playground_2'); return it && it.label; });
  check(/Join gully cricket/.test(side || ''), 'the ground\'s own solo game is still offered: "' + side + '"');
  await P.ev(() => { const p = N.places.playground_2; N.player.teleport(p.x - 36, p.y); });
  await P.gw(0.5);
  const lab0 = await P.ev(() => { const c = N.interact.current; return c ? (typeof c.label === 'function' ? c.label(N.player) : c.label) : null; });
  check(!/gully cricket with friends/.test(lab0 || ''), 'alone at the ground: no "with friends" prompt (' + (lab0 || 'nothing') + ')');
  // the 🏁 picker -> gully cricket -> the start card (from the road outside the ground)
  await P.ev(() => { const p = N.places.playground_2; N.player.teleport(p.x, p.y - 90); });
  await P.gw(0.3);
  await P.ev(() => N.party.openPicker());
  check(await P.until(() => N.party._debug.cards().card, null, 5000), 'the 🏁 picker');
  const pick = await P.ev(() => Array.from(document.querySelectorAll('.pt-card .pt-pick')).map((b) => b.dataset.pick));
  const gi = pick.indexOf('gully_cricket');
  check(gi >= 0 && gi < 9, 'the picker lists gully cricket (' + (gi + 1) + ' of ' + pick.length + ': ' + pick.join(', ') + ')');
  await P.shot('solo_picker');
  await P.page.click('.pt-card .pt-pick[data-pick="gully_cricket"]');
  check(await P.until(() => N.party._debug.cards().card && /Play with Immu & gang/.test(document.querySelector('.pt-card').textContent), null, 5000), 'clicked it: the start card');
  const card = await P.ev(() => document.querySelector('.pt-card').textContent);
  check(/Gully cricket/.test(card) && /Play with Immu & gang/.test(card) && /1-3 players/.test(card), 'start card: "' + card.replace(/\s+/g, ' ').slice(0, 160) + '"');
  await P.shot('solo_start_card');
  await P.page.keyboard.press('1');
  check(await P.until(() => N.minigames.active === 'cricket' && !!N.cricketMatch.gully.debug(), null, 15000), '1 = play with the gang: the gully opens in party mode');
  const g0 = await P.gd();
  check(g0 && g0.inns.length === 3 && g0.inns[0].bat !== g0.inns[0].bowl && g0.inns.every((x) => x.field), 'three innings, each friend bats / bowls / fields once: ' + JSON.stringify(g0.inns.map((x) => x.bat + ' b:' + x.bowl + ' f:' + x.field)));
  // ---- innings 1: I bat (Ayesha bowls, Immu fields). A real ↑ as the ball arrives.
  check(await waitRole(P, 'bat', 'runup', 60000), 'innings 1: my turn to bat');
  await P.gw(0.1);
  const sw = await timedSwing(P, 'ArrowUp');
  check(sw && sw.swings >= 1 && sw.lastSw && sw.lastSw.d === 'drive', 'real ↑ as the ball arrived: a drive, timing ' + (sw && sw.lastSw ? sw.lastSw.e + ' s (' + sw.lastSw.q + ')' : '?'));
  await P.gw(0.15);
  await P.shot('solo_bat');
  await P.until(() => { const d = N.cricketMatch.gully.debug(); return d && d.inns[0].log.length >= 1; }, null, 20000);
  let d = await P.gd();
  check(d.inns[0].log.length >= 1, 'the ball counted: ' + bookG(d) + ' ("' + d.msg + '")');
  // the autopilot plays out my innings (it bats exactly on time)
  await P.ev(() => { N.minigames.game.auto = 'win'; });
  // ---- innings 2: Ayesha bats, Immu bowls, I field. Force a skier and take the catch with Space.
  check(await waitRole(P, 'field', 'aim', 120000), 'innings 2: I field');
  await P.ev(() => { N.minigames.game.auto = null; });
  let caught = null;
  for (let tries = 0; tries < 5 && !caught; tries++) {
    await waitRole(P, 'field', 'aim', 60000);
    await P.ev(() => N.cricketMatch.gully.force('edge'));
    await P.shot('solo_field_wait');
    const ring = await P.raf(() => { const x = N.cricketMatch.gully.debug(); return !x || x.role !== 'field' || (x.stage === 'hit' && x.catchAt != null) || x.stage === 'result'; }, null, 30000);
    d = await P.gd();
    if (!ring || !d || d.stage !== 'hit' || d.catchAt == null) { info('no catch chance this ball (' + (d && d.msg) + ')'); await P.until(() => { const x = N.cricketMatch.gully.debug(); return !x || x.stage !== 'hit'; }, null, 15000); continue; }
    const rem = d.catchAt - d.clock;
    if (rem > 0.3) await P.gw(rem - 0.28);
    await P.shot('solo_field_ring');
    await P.page.keyboard.press('Space');
    await P.until(() => { const x = N.cricketMatch.gully.debug(); return !x || x.catchPress != null || x.stage !== 'hit'; }, null, 4000);
    const d2 = await P.gd();
    await P.until(() => { const x = N.cricketMatch.gully.debug(); return !x || x.stage === 'result' || x.stage === 'aim'; }, null, 15000);
    const d3 = await P.gd();
    caught = { press: d2.catchPress, at: d.catchAt, msg: d3 && d3.msg };
  }
  check(caught && caught.press != null, 'Space as the catch ring closed registered the catch (' + (caught ? 'pressed ' + (caught.at - caught.press).toFixed(2) + ' s before the ball arrived: "' + caught.msg + '"' : 'no catch chance came') + ')');
  await P.ev(() => { N.minigames.game.auto = 'win'; });
  // ---- innings 3: Immu bats, I bowl. Real keys: ← (line), ↑ (shorter), Q (pace), Space with the needle in the green.
  check(await waitRole(P, 'bowl', 'aim', 150000), 'innings 3: I bowl');
  await P.ev(() => { N.minigames.game.auto = null; });
  await waitRole(P, 'bowl', 'aim', 30000);
  const a0 = (await P.gd()).aim;
  await P.page.keyboard.press('ArrowLeft'); await P.gw(0.05);
  await P.page.keyboard.press('ArrowUp'); await P.gw(0.05);
  await P.page.keyboard.press('KeyQ'); await P.gw(0.1);
  const a1 = (await P.gd()).aim;
  check(a1.l === Math.max(0, a0.l - 1) && a1.n === Math.min(3, a0.n + 1) && a1.p === (a0.p + 1) % 3, 'line / length / pace keys: ' + JSON.stringify(a0) + ' -> ' + JSON.stringify(a1));
  await P.shot('solo_bowl_aim');
  await P.raf(() => { const x = N.cricketMatch.gully.debug(); return !x || x.stage !== 'aim' || Math.abs(x.meter - 0.5) < 0.035; }, null, 10000);
  await P.page.keyboard.press('Space');
  await P.until(() => { const x = N.cricketMatch.gully.debug(); return !x || x.plan; }, null, 5000);
  d = await P.gd();
  check(d.plan && d.plan.l === a1.l && d.plan.n === a1.n && d.plan.p === a1.p && d.plan.q < 0.2, 'Space bowled my ball: ' + JSON.stringify(d.plan) + ' (release ' + (d.plan && d.plan.q <= 0.07 ? 'perfect' : 'good') + ')');
  await P.gw(0.9);
  await P.shot('solo_bowl_flight');
  await P.ev(() => { N.minigames.game.auto = 'win'; N.minigames.game.timeScale = 2.5; });
  check(await P.until(() => { const x = N.cricketMatch.gully.debug(); return x && x.stage === 'final'; }, null, 180000), 'all three innings played: the final table');
  await P.gw(0.6);
  await P.shot('solo_final');
  d = await P.gd();
  info('book: ' + bookG(d));
  check(await P.until(() => !N.minigames.isOpen() && !!window.__res, null, 30000), 'the game closes itself; the party results card');
  await P.gw(1.5);
  await P.shot('solo_results');
  const st = await results(P);
  check(st && st.length === 3 && st.every((r) => r.rank >= 1 && typeof r.score === 'number'), 'results: ' + fmtSt(st));
  const sum = d.inns.map((x) => x.runs);
  check(st && st.every((r) => sum.indexOf(r.score) >= 0), 'the results card has each innings\' runs');
  const tok = await P.ev(() => ({ won: window.__res.standings[0].uid === 'me', tin: N.tape && N.tape.tin && N.tape.tin.has('party_gully_cricket') }));
  check(!tok.won || tok.tin, tok.won ? 'won it: the "Taped tennis ball" tin token' : 'did not win this time (no token): fine');
  await closeCards(P);

  console.log('  -- the LB Stadium match, co-op with Ayesha (autopilot)');
  await P.ev(() => { const p = N.places.lb_stadium; N.player.teleport(p.x, p.y - 36); window.__res = null; });
  await P.gw(0.5);
  const lab2 = await P.ev(() => { const c = N.interact.current; return c ? (typeof c.label === 'function' ? c.label(N.player) : c.label) : null; });
  check(/LB Stadium match/.test(lab2 || ''), 'at the west gate: "E ' + lab2 + '"');
  const r = await P.ev(() => N.party.solo('lb_match', { autoplay: 'win', overs: 2 }));
  check(r.ok, 'N.party.solo(lb_match)');
  check(await P.until(() => N.minigames.active === 'match' && N.cricketMatch.debug.party(), null, 15000), 'the match opens in party mode (Colony XI)');
  let m = await P.md();
  check(m && m.home === 'Colony XI' && m.slots.length === 2 && m.slots.every((s) => s.team === 'CLNY XI'), 'teams: ' + m.home + ' (friends: ' + m.slots.map((s) => s.name).join(', ') + ') v ' + m.away);
  await P.until(() => { const x = N.cricketMatch.debug.party(); return x && x.role !== 'watch'; }, null, 60000);
  await P.gw(0.6);
  m = await P.md();
  await P.shot('solo_match_' + m.role);
  await P.until(() => { const x = N.cricketMatch.debug.party(); return x && x.innings.length === 2; }, null, 300000);
  await P.until(() => { const x = N.cricketMatch.debug.party(); return x && x.role !== 'watch'; }, null, 120000);
  await P.gw(0.6);
  m = await P.md();
  await P.shot('solo_match_' + m.role);
  check(await P.until(() => !!window.__res, null, 400000), 'the match finished: party results');
  await P.gw(1.2);
  await P.shot('solo_match_results');
  const st2 = await results(P);
  check(st2 && st2.length === 2 && st2.every((x) => x.rank), 'results: ' + fmtSt(st2) + ' · ' + (st2 || []).map((x) => x.note).join(' / '));
  await closeCards(P);
  const e = await P.errs();
  check(!e.length, 'solo: zero errors' + (e.length ? ': ' + e.slice(0, 3).join(' | ') : ''));
  await P.context.close();
}

/* ================================================================ PHONE: the pads per role */
async function phone(browser) {
  console.log('\n== phone 390x844 (touch): each role\'s pad');
  const P = await openPage(browser, 'phone', { viewport: { width: 390, height: 844 }, touch: true, dpr: 2 });
  await newGame(P, 'playground_home');
  const cdp = await P.context.newCDPSession(P.page);
  const tap = async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await P.gw(0.05); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const box = async (a) => { const b = await P.page.locator('.mg-btn[data-a="' + a + '"]').first().boundingBox().catch(() => null); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2, b } : null; };
  const tapBtn = async (a) => { const c = await box(a); if (c) await tap(c.x, c.y); return !!c; };
  const pad = () => P.ev(() => Array.from(document.querySelectorAll('.mg-btn')).map((b) => b.dataset.a + ':' + b.textContent.trim().replace(/\s+/g, ' ')));
  const inView = () => P.ev(() => Array.from(document.querySelectorAll('.mg-btn')).every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.top >= 0 && r.width > 30; }));
  const r = await P.ev(() => N.party.solo('gully_cricket'));
  check(r.ok && await P.until(() => N.minigames.active === 'cricket', null, 15000), 'gully cricket with the gang on a phone');
  check(await waitRole(P, 'bat', 'runup', 60000), 'batting');
  await P.gw(0.2);
  const pb = await pad();
  check(pb.join() === 'pull:◀ PULLLEFT,drive:▲ DRIVESTRAIGHT,cut:CUT ▶RIGHT' && await inView(), 'bat pad: ' + pb.join(' | '));
  await P.raf(() => { const d = N.cricketMatch.gully.debug(); return d && d.stage === 'flight' && d.tArrive - d.clock < 0.07; }, null, 20000);
  await tapBtn('drive');
  await P.until(() => { const d = N.cricketMatch.gully.debug(); return !d || d.swings > 0 || d.stage !== 'flight'; }, null, 5000);
  const s1 = await P.gd();
  check(s1.swings >= 1, 'tapped ▲ DRIVE: a swing (' + JSON.stringify(s1.lastSw) + ')');
  await P.gw(0.2);
  await P.shot('phone_bat');
  await P.ev(() => { N.minigames.game.auto = 'win'; N.minigames.game.timeScale = 2.5; });
  check(await waitRole(P, 'field', 'aim', 120000), 'fielding');
  await P.ev(() => { N.minigames.game.timeScale = 1; });
  await P.gw(0.3);
  const pf = await pad();
  check(pf.length === 1 && /^go:CATCH!/.test(pf[0]) && await inView(), 'field pad: ' + pf.join(' | '));
  await P.shot('phone_field');
  await P.ev(() => { N.minigames.game.timeScale = 2.5; });
  check(await waitRole(P, 'bowl', 'aim', 150000), 'bowling');
  await P.ev(() => { N.minigames.game.auto = null; N.minigames.game.timeScale = 1; });
  await waitRole(P, 'bowl', 'aim', 30000);
  const pw = await pad();
  check(pw.length === 6 && /^pull:◀/.test(pw[0]) && /^go:BOWL/.test(pw[5]) && await inView(), 'bowl pad: ' + pw.join(' | '));
  const a0 = (await P.gd()).aim;
  await tapBtn('cut'); await P.gw(0.1); await tapBtn('back'); await P.gw(0.1); await tapBtn('pace'); await P.gw(0.2);
  const a1 = (await P.gd()).aim;
  check(a1.l === Math.min(4, a0.l + 1) && a1.n === Math.max(0, a0.n - 1) && a1.p === (a0.p + 1) % 3, 'taps on ▶ ▼ PACE: ' + JSON.stringify(a0) + ' -> ' + JSON.stringify(a1));
  await P.shot('phone_bowl');
  await P.raf(() => { const x = N.cricketMatch.gully.debug(); return !x || x.stage !== 'aim' || Math.abs(x.meter - 0.5) < 0.05; }, null, 10000);
  await tapBtn('go');
  check(await P.until(() => { const x = N.cricketMatch.gully.debug(); return x && !!x.plan; }, null, 5000), 'tapped BOWL: ' + JSON.stringify((await P.gd()).plan));
  await P.ev(() => { N.minigames.game.auto = 'win'; N.minigames.game.timeScale = 2.5; });
  check(await P.until(() => { const x = N.cricketMatch.gully.debug(); return x && x.stage === 'final'; }, null, 200000), 'the final table');
  await P.gw(0.6);
  await P.shot('phone_final');
  check(await P.until(() => !!window.__res, null, 30000), 'party results');
  await P.gw(1.4);
  await P.shot('phone_results');
  await closeCards(P);
  // the LB match: batting / bowling / watching pads
  await P.ev(() => { window.__res = null; });
  const r2 = await P.ev(() => N.party.solo('lb_match', { overs: 2 }));
  check(r2.ok && await P.until(() => N.minigames.active === 'match', null, 15000), 'the LB co-op match on a phone');
  const seen = {};
  for (let i = 0; i < 3; i++) {
    const want = await P.until((s) => { const x = N.cricketMatch.debug.party(); return x && x.role !== 'watch' && !s.includes(x.role); }, Object.keys(seen), 240000);
    if (!want) break;
    const m = await P.md();
    await P.gw(0.4);
    seen[m.role] = (await pad()).join(' | ');
    check(await inView(), m.role + ' pad on screen: ' + seen[m.role]);
    await P.shot('phone_match_' + m.role);
    await P.ev(() => { N.minigames.game.auto = 'win'; N.minigames.game.timeScale = 3; });
    if (seen.bat && seen.bowl) break;
  }
  check(seen.bat && seen.bowl, 'saw the batting and the bowling pads');
  await P.until(() => { const x = N.cricketMatch.debug.party(); return x && x.role === 'watch' && x.owner !== x.lock.me; }, null, 120000);
  await P.ev(() => { N.minigames.game.timeScale = 1; });
  await P.gw(0.6);
  const pwatch = await pad();
  check(pwatch.length === 0, 'watching an AI friend\'s over: no pad (the CAM pill stays)');
  await P.shot('phone_match_watch');
  await P.ev(() => { N.minigames.game.timeScale = 3; });
  check(await P.until(() => !!window.__res, null, 400000), 'the match finished: party results');
  await P.gw(1.2);
  await P.shot('phone_match_results');
  const e = await P.errs();
  check(!e.length, 'phone: zero errors' + (e.length ? ': ' + e.slice(0, 3).join(' | ') : ''));
  await P.context.close();
}

/* ================================================================ rooms (the online mock) */
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
async function room(browser, names, views) {
  const mock = require('./online_mock.cjs');
  const S = await staticServer();
  const M = await mock.start({ key: 'test-publishable-key' });
  const CONF = { provider: 'supabase', url: M.url, key: M.key, sdk: [SDK_CDN, 'vendor/supabase/supabase.js'], maxPlayers: 3, stateHz: 8 };
  const pages = [];
  for (let i = 0; i < names.length; i++) pages.push(await openPage(browser, names[i], views[i], S.url + '#debug', CONF));
  for (let i = 0; i < pages.length; i++) {
    await newGame(pages[i], 'playground_home');
    await pages[i].ev(([dx]) => { const p = N.places.playground_home; N.player.teleport(p.x + dx, p.y + 20); }, [i * 10 - 10]);
    await pages[i].ev((n) => N.online.goOnline().then(() => N.online.setNick(n)), names[i]);
  }
  const made = await pages[0].ev(() => N.online.createRoom());
  for (let i = 1; i < pages.length; i++) await pages[i].ev((c) => N.online.joinRoom(c), made.code);
  const all = await pages[0].until((n) => N.online.room && N.online.room.n === n, pages.length, 20000);
  await pages[0].ev(() => { N.party.TUNE.lobbyMs = 60000; });
  return { pages, code: made.code, ok: made.ok && all, close: async () => { for (const p of pages) { try { await p.context.close(); } catch (e) { /* closed */ } } try { S.srv.close(); } catch (e) { /* ignore */ } try { await M.close(); } catch (e) { /* ignore */ } } };
}
// A challenges; the others accept (Y key on the first, a click on the rest)
async function startParty(R, id, opts) {
  const [A, ...rest] = R.pages;
  // the last game's overlay closes itself a few seconds after its final table (an invite meanwhile would find us busy)
  for (const P of R.pages) await P.until(() => !N.minigames.isOpen() && !N.party.active, null, 60000);
  for (const P of R.pages) await P.ev(() => { window.__res = null; N.party.closeCards(); });
  const ch = await A.ev(([i, o]) => N.party.challenge(i, o), [id, opts]);
  if (!ch.ok) return false;
  for (let i = 0; i < rest.length; i++) {
    const P = rest[i];
    if (!(await P.until(() => !!N.party.invite, null, 20000))) return false;
    if (i === 0) await P.page.keyboard.press('y'); else await P.page.click('.pt-invite [data-a=acc]');
  }
  const mgId = /^lb_/.test(id) ? 'match' : 'cricket';
  for (const P of R.pages) if (!(await P.until((m) => N.minigames.active === m, mgId, 40000))) return false;
  return true;
}
const sameAll = (arr) => arr.every((x) => JSON.stringify(x) === JSON.stringify(arr[0]));

/* ================================================================ TWO pages */
async function two(browser) {
  console.log('\n== two pages in one room (online mock): gully, the LB co-op match, friends vs friends');
  const R = await room(browser, ['Ravi', 'Pooja'], [{ viewport: { width: 1000, height: 640 } }, { viewport: { width: 1000, height: 640 } }]);
  const [A, B] = R.pages;
  try {
    if (!check(R.ok, 'room ' + R.code + ' with Ravi and Pooja')) return;
    // with friends in the room: a small prompt beside every ground, clear of the ground's own offers
    await A.until(() => (N.party.get('gully_cricket').spots || []).length > 5, null, 15000);
    check(await A.ev(() => N.party.get('gully_cricket').where) === 'playground_home', 'in a room gully cricket is placed: where playground_home (the colony ground), a prompt at every ground');
    // every ground's Join offers (playground_games.js) and the minigames' side games: none within reach of our prompt
    const sp = await A.ev(() => {
      const s = N.party.get('gully_cricket').spots, p = N.places.playground_home;
      const mine = s.find((q) => Math.hypot(q.x - p.x, q.y - p.y) < 40) || s[0];
      const others = [];
      const F = (N.playgroundGames && N.playgroundGames.fields) ? N.playgroundGames.fields() : [];
      for (const f of F) for (const gid of ['lingocha', 'marampitti']) { const it = N.interact.get('pg:' + gid + ':' + f.key); if (it) others.push({ id: gid, x: it.x, y: it.y, r: it.r || 16 }); }
      N.minigames.SIDE.forEach((sd, si) => { for (const id of Object.keys(N.places)) { const it = N.interact.get('mg:' + sd.id + ':' + si + ':' + id); if (it) others.push({ id: 'mg:' + sd.id, x: it.x, y: it.y, r: it.r || 16 }); } });
      let worst = null;
      for (const q of s) for (const o of others) { const d = Math.hypot(o.x - q.x, o.y - q.y) - o.r - q.r; if (!worst || d < worst.gap) worst = { gap: Math.round(d), id: o.id, at: q.name }; }
      return { mine, n: s.length, offers: others.length, worst };
    });
    check(sp.n > 5 && sp.mine.r <= 8 && sp.offers >= 10 && sp.worst && sp.worst.gap > 6, 'in the room: ' + sp.n + ' ground prompts (r ' + sp.mine.r + '), each clear of the ' + sp.offers + ' Join / side offers (closest gap ' + (sp.worst && sp.worst.gap) + ' u: ' + (sp.worst && sp.worst.id + ' at ' + sp.worst.at) + ')');
    await A.ev((m) => N.player.teleport(m.x, m.y), sp.mine);
    await A.gw(0.5);
    const labA = await A.ev(() => { const c = N.interact.current; return c ? (typeof c.label === 'function' ? c.label(N.player) : c.label) : null; });
    check(/Start gully cricket with friends/.test(labA || ''), 'on the spot: "E ' + labA + '"');
    await A.page.keyboard.press('e');
    const cardA = (await A.until(() => N.party._debug.cards().card, null, 5000)) && await A.ev(() => document.querySelector('.pt-card').textContent);
    check(/Challenge the room \(1\)/.test(cardA || ''), 'E: the start card offers "Challenge the room (1)"');
    await A.shot('two_A_start_card');
    await A.page.keyboard.press('n');
    // ---- gully: A bats innings 1 while B bowls it with real keys
    check(await startParty(R, 'gully_cricket', { autoplay: 'win' }), 'Ravi challenged the room to gully cricket; Pooja accepted with Y; the gully opened on both pages');
    await B.ev(() => { N.minigames.game.auto = null; }); // Pooja bowls the first ball herself
    const seeds = [await A.ev(() => N.minigames.game.baseSeed), await B.ev(() => N.minigames.game.baseSeed)];
    check(seeds[0] === seeds[1], 'same seed on both pages (' + seeds[0] + ')');
    const d0 = [await A.gd(), await B.gd()];
    check(d0[0].inns.length === 2 && JSON.stringify(d0[0].inns.map((x) => [x.bat, x.bowl])) === JSON.stringify([['Ravi', 'Pooja'], ['Pooja', 'Ravi']]) && sameAll(d0.map((d) => d.inns.map((x) => [x.bat, x.bowl]))), 'two innings: Ravi bats while Pooja bowls, then the other way round');
    check(await waitRole(B, 'bowl', 'aim', 60000) && await waitRole(A, 'bat', 'aim', 30000), 'ball 1: Pooja (B) aims, Ravi (A) waits at the crease');
    await B.page.keyboard.press('ArrowRight'); await B.gw(0.05);
    await B.page.keyboard.press('ArrowDown'); await B.gw(0.05);
    await B.page.keyboard.press('KeyE'); await B.gw(0.1);
    const aimB = (await B.gd()).aim;
    await Promise.all([A.shot('two_A_bat_waits'), B.shot('two_B_bowl_aim')]);
    await B.raf(() => { const x = N.cricketMatch.gully.debug(); return !x || x.stage !== 'aim' || Math.abs(x.meter - 0.5) < 0.035; }, null, 10000);
    await B.page.keyboard.press('Space');
    check(await A.until(() => { const x = N.cricketMatch.gully.debug(); return x && x.plan; }, null, 15000), 'Pooja\'s ball reached Ravi\'s page');
    const plans = [(await A.gd()).plan, (await B.gd()).plan];
    check(plans[0] && sameAll(plans) && plans[0].l === aimB.l && plans[0].n === aimB.n && plans[0].p === aimB.p, 'the same delivery on both pages: ' + JSON.stringify(plans[0]) + ' (Pooja set ' + JSON.stringify(aimB) + ')');
    await A.gw(0.5);
    await Promise.all([A.shot('two_A_bat_flight'), B.shot('two_B_watch_flight')]);
    await B.ev(() => { N.minigames.game.auto = 'win'; });
    check(await A.until(() => { const x = N.cricketMatch.gully.debug(); return x && x.inns[0].log.length >= 1; }, null, 30000), 'the first ball is in the book');
    const b1 = [await A.gd(), await B.gd()];
    await B.until((n) => { const x = N.cricketMatch.gully.debug(); return x && x.inns[0].log.length >= n; }, b1[0].inns[0].log.length, 15000);
    const b1b = await B.gd();
    check(JSON.stringify(b1[0].inns[0].log) === JSON.stringify(b1b.inns[0].log.slice(0, b1[0].inns[0].log.length)), 'both pages booked it the same: ' + b1[0].inns[0].log.join(' ') + ' ("' + b1[0].msg + '")');
    check(await A.until(() => { const x = N.cricketMatch.gully.debug(); return x && x.stage === 'final'; }, null, 300000) && await B.until(() => { const x = N.cricketMatch.gully.debug(); return x && x.stage === 'final'; }, null, 60000), 'both innings played on both pages');
    const fin = [await A.gd(), await B.gd()];
    check(sameAll(fin.map((d) => d.inns.map((x) => [x.runs, x.balls, x.wk, x.log.join('')]))), 'identical scorebooks: A ' + bookG(fin[0]) + ' · B ' + bookG(fin[1]));
    await Promise.all([A.shot('two_A_final'), B.shot('two_B_final')]);
    check(await A.until(() => !!window.__res, null, 40000) && await B.until(() => !!window.__res, null, 40000), 'party results on both pages');
    const st = [await results(A), await results(B)];
    check(st[0] && st[0].length === 2 && sameAll(st.map((s) => s.map((r) => [r.nick, r.rank, r.score]))), 'the same results: ' + fmtSt(st[0]));
    await A.gw(1);
    await Promise.all([A.shot('two_A_results'), B.shot('two_B_results')]);
    const lk = await A.ev(() => window.__lk);
    void lk;

    // ---- the LB Stadium co-op match (2 overs a side), autopilots
    console.log('  -- the LB Stadium co-op match');
    for (const P of R.pages) await closeCards(P);
    await A.gw(1);
    check(await startParty(R, 'lb_match', { autoplay: 'win', overs: 2 }), 'Ravi challenged the room to the LB Stadium match; Pooja accepted');
    const m0 = [await A.md(), await B.md()];
    check(m0[0] && m0[1] && m0[0].home === 'Colony XI' && sameAll(m0.map((m) => m.slots.map((s) => s.name + '@' + s.team))), 'both friends on Colony XI: ' + m0[0].slots.map((s) => s.name + '@' + s.team).join(', ') + ' v ' + m0[0].away);
    // a screenshot of each page's role in the same ball (one bats or bowls, the other watches)
    if (await A.until(() => { const x = N.cricketMatch.debug.party(); return x && x.role !== 'watch'; }, null, 120000)) {
      await A.gw(0.4);
      const ra = (await A.md()).role, rb = (await B.md()).role;
      await Promise.all([A.shot('two_match_A_' + ra), B.shot('two_match_B_' + rb)]);
      check(ra !== 'watch' && rb === 'watch', 'over 1: Ravi ' + ra + 's, Pooja watches');
    }
    check(await A.until(() => { const x = N.cricketMatch.debug.party(); return x && x.finished; }, null, 600000) && await B.until(() => { const x = N.cricketMatch.debug.party(); return x && x.finished; }, null, 120000), 'the match finished on both pages');
    const mf = [await A.md(), await B.md()];
    check(sameAll(mf.map((m) => m.innings.map((i) => [i.team, i.runs, i.wkts, i.balls]))) && sameAll(mf.map((m) => m.result)), 'identical scorecards: ' + bookM(mf[0]) + ' · ' + (mf[0].result && mf[0].result.margin));
    info('lockstep A: ' + JSON.stringify(mf[0].lock && { steps: mf[0].lock.steps, sent: mf[0].lock.sent, rx: mf[0].lock.rxN }) + ' B: ' + JSON.stringify(mf[1].lock && { steps: mf[1].lock.steps, sent: mf[1].lock.sent, rx: mf[1].lock.rxN }));
    await A.gw(0.5);
    await Promise.all([A.shot('two_match_A_end'), B.shot('two_match_B_end')]);
    check(await A.until(() => !!window.__res, null, 60000) && await B.until(() => !!window.__res, null, 60000), 'party results on both pages');
    const ms = [await results(A), await results(B)];
    check(ms[0] && ms[0].length === 2 && sameAll(ms.map((s) => s.map((r) => [r.nick, r.rank, r.score]))), 'the same results: ' + fmtSt(ms[0]) + ' · ' + ms[0].map((r) => r.note).join(' / '));

    // ---- friends vs friends (2 overs)
    console.log('  -- friends vs friends at LB Stadium');
    for (const P of R.pages) await closeCards(P);
    await A.gw(1);
    check(await startParty(R, 'lb_match_vs', { autoplay: 'win' }), 'Ravi challenged Pooja to friends vs friends');
    const v0 = await A.md();
    check(!!v0 && v0.mode === 'vs' && v0.overs === 2 && v0.slots[0].team !== v0.slots[1].team, 'rival XIs: ' + v0.slots.map((s) => s.name + '@' + s.team).join(' v '));
    if (await B.until(() => { const x = N.cricketMatch.debug.party(); return x && x.role !== 'watch'; }, null, 120000)) {
      await B.gw(0.3);
      const ra = (await A.md()).role, rb = (await B.md()).role;
      await Promise.all([A.shot('two_vs_A_' + ra), B.shot('two_vs_B_' + rb)]);
      check(ra !== 'watch' && rb !== 'watch' && ra !== rb, 'one bowls at the other: Ravi ' + ra + 's, Pooja ' + rb + 's');
    }
    check(await A.until(() => { const x = N.cricketMatch.debug.party(); return x && x.finished; }, null, 600000) && await B.until(() => { const x = N.cricketMatch.debug.party(); return x && x.finished; }, null, 120000), 'the match finished on both pages');
    const vf = [await A.md(), await B.md()];
    check(sameAll(vf.map((m) => m.innings.map((i) => [i.team, i.runs, i.wkts, i.balls]))) && sameAll(vf.map((m) => m.result)), 'identical scorecards: ' + bookM(vf[0]) + ' · ' + (vf[0].result && vf[0].result.margin));
    check(await A.until(() => !!window.__res, null, 60000) && await B.until(() => !!window.__res, null, 60000), 'party results on both pages');
    const vs = [await results(A), await results(B)];
    const winTeam = vf[0].result && vf[0].result.winner;
    const winnerNick = winTeam ? vf[0].slots.find((s) => s.team === winTeam).nick : null;
    check(vs[0] && sameAll(vs.map((s) => s.map((r) => [r.nick, r.rank]))) && (!winnerNick || vs[0][0].nick === winnerNick), 'the winning XI\'s friend first: ' + fmtSt(vs[0]) + ' (' + (vf[0].result && vf[0].result.margin) + ')');
    await A.gw(1);
    await Promise.all([A.shot('two_vs_A_results'), B.shot('two_vs_B_results')]);
    for (const P of R.pages) { const e = await P.errs(); check(!e.length, P.name + ': zero errors' + (e.length ? ': ' + e.slice(0, 3).join(' | ') : '')); }
  } finally { await R.close(); }
}

/* ================================================================ THREE pages */
async function three(browser) {
  console.log('\n== three pages in one room: gully with bat / bowl / field at once; then one leaves');
  const R = await room(browser, ['Ravi', 'Pooja', 'Imran'], [{ viewport: { width: 900, height: 600 } }, { viewport: { width: 900, height: 600 } }, { viewport: { width: 390, height: 844 }, touch: true, dpr: 1 }]);
  const [A, B, C] = R.pages;
  try {
    if (!check(R.ok, 'room ' + R.code + ' with Ravi, Pooja and Imran')) return;
    check(await startParty(R, 'gully_cricket', { autoplay: 'win' }), 'Ravi challenged the room; Pooja (Y) and Imran (a click) accepted; the gully opened on all three pages');
    for (const P of R.pages) await P.ev(() => { N.minigames.game.auto = null; });
    const d0 = await A.gd();
    check(JSON.stringify(d0.inns.map((x) => [x.bat, x.bowl, x.field])) === JSON.stringify([['Ravi', 'Pooja', 'Imran'], ['Pooja', 'Imran', 'Ravi'], ['Imran', 'Ravi', 'Pooja']]), 'roles rotate: ' + d0.inns.map((x) => x.bat + ' bats, ' + x.bowl + ' bowls, ' + x.field + ' fields').join(' / '));
    check(await waitRole(B, 'bowl', 'aim', 60000) && await waitRole(A, 'bat', 'aim', 20000) && await waitRole(C, 'field', 'aim', 20000), 'ball 1: Ravi bats, Pooja aims, Imran fields — each page shows its own role');
    const pads = await Promise.all(R.pages.map((P) => P.ev(() => ({ hint: (document.querySelector('.mg-hint') || {}).textContent || '', pad: Array.from(document.querySelectorAll('.mg-btn')).map((b) => b.dataset.a) }))));
    check(/pull/.test(pads[0].hint) && /needle/.test(pads[1].hint) && pads[2].pad.join() === 'go', 'controls: A "' + pads[0].hint.slice(0, 40) + '…", B "' + pads[1].hint.slice(0, 40) + '…", C pad [' + pads[2].pad.join() + ']');
    await Promise.all([A.shot('three_A_bat'), B.shot('three_B_bowl'), C.shot('three_C_field')]);
    // Pooja bowls a good-length ball in the green; Ravi plays it with a real key; Imran watches for a catch
    await B.raf(() => { const x = N.cricketMatch.gully.debug(); return !x || x.stage !== 'aim' || Math.abs(x.meter - 0.5) < 0.035; }, null, 10000);
    await B.page.keyboard.press('Space');
    const sw = await timedSwing(A, 'ArrowUp');
    check(sw && sw.swings >= 1, 'Ravi swung with a real key on his page (' + JSON.stringify(sw && sw.lastSw) + ')');
    await C.gw(0.3);
    await Promise.all([A.shot('three_A_shot'), C.shot('three_C_watch_shot')]);
    let booked = true;
    for (const P of R.pages) booked = (await P.until(() => { const x = N.cricketMatch.gully.debug(); return x && x.inns[0].log.length >= 1; }, null, 30000)) && booked;
    check(booked, 'the ball reached the book on all three pages');
    const logs = await Promise.all(R.pages.map((P) => P.gd()));
    check(sameAll(logs.map((d) => d.inns[0].log.slice(0, 1))), 'the same result on the three pages: ' + logs[0].inns[0].log[0]);
    for (const P of R.pages) await P.ev(() => { N.minigames.game.auto = 'win'; });
    // innings 2 starts: Imran leaves the room (closes the page)
    check(await A.until(() => { const x = N.cricketMatch.gully.debug(); return x && x.ii === 1 && x.stage === 'aim'; }, null, 200000), 'innings 2: Pooja bats, Imran bowls');
    await C.shot('three_C_before_leaving');
    const ce = await C.errs();
    check(!ce.length, 'Imran: zero errors before leaving' + (ce.length ? ': ' + ce.slice(0, 3).join(' | ') : ''));
    await C.context.close();
    R.pages.splice(2, 1);
    check(await A.until(() => { const x = N.cricketMatch.gully.debug(); return x && x.lock.gone.some((g) => g[0] && g[1] >= 0); }, null, 30000), 'the host saw Imran leave: the AI bowls his overs from here');
    check(await A.until(() => { const x = N.cricketMatch.gully.debug(); return x && x.stage === 'final'; }, null, 300000) && await B.until(() => { const x = N.cricketMatch.gully.debug(); return x && x.stage === 'final'; }, null, 60000), 'the game went on and finished on both remaining pages');
    const fin = [await A.gd(), await B.gd()];
    check(sameAll(fin.map((d) => d.inns.map((x) => [x.runs, x.balls, x.wk, x.skipped]))), 'identical scorebooks: ' + bookG(fin[0]) + (fin[0].inns[2].skipped ? ' (Imran\'s innings skipped: he left)' : ''));
    check(await A.until(() => !!window.__res, null, 60000) && await B.until(() => !!window.__res, null, 60000), 'party results on both pages');
    const st = [await results(A), await results(B)];
    check(st[0] && st[0].length === 3 && sameAll(st.map((s) => s.map((r) => [r.nick, r.rank, r.left]))) && st[0].find((r) => r.nick === 'Imran').left, 'results: ' + fmtSt(st[0]));
    await A.gw(1);
    await Promise.all([A.shot('three_A_results'), B.shot('three_B_results')]);
    for (const P of R.pages) { const e = await P.errs(); check(!e.length, P.name + ': zero errors' + (e.length ? ': ' + e.slice(0, 3).join(' | ') : '')); }
  } finally { await R.close(); }
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ args: ['--disable-gpu-compositing'] });
  try {
    if (only('solo')) await solo(browser);
    if (only('phone')) await phone(browser);
    if (only('two')) await two(browser);
    if (only('three')) await three(browser);
  } catch (e) { fail('crashed: ' + (e.stack || e.message)); }
  await browser.close();
  console.log('\n' + checks + ' checks, ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  console.log(failures.length ? failures.length + ' FAILURE(S):\n  ' + failures.join('\n  ') : 'ALL PARTY CRICKET CHECKS PASSED');
  process.exit(failures.length ? 1 : 0);
})();
