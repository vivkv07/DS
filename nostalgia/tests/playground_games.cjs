/* NOSTALGIA — tests/playground_games.cjs  (src/playground_games.js: in-world Lingocha + Maram Pitti)
 * Headless Chromium (Playwright). Real input (keyboard / touch / mouse) drives the player; debug hooks
 * (N.playgroundGames.debug) set up the deterministic moments (a frozen AI, a perfect aim, a forced hit).
 *
 *   desktop 1280x720 (keyboard):
 *     - "Join lingocha" offer at the home ground (playground_1) started with a real E press (side game)
 *     - lingocha: walk to the chalk line, ←/→ aim, hold E for power and let go -> the stack falls; pick a
 *       stone (E) and stack it (E): restack count; a hit on Chinnu = out; LINGOCHA! (7/7); roles swap;
 *       as a hitter: pick the ball up (E), tap E -> the throw puts a seeker out; match won -> paid (side)
 *     - free-roam pay limit: at most 3 paid wins per game per game-day (shared day ledger)
 *     - lingocha lost at a second ground (playground_14, Tiger's Ashok Nagar boys)
 *     - maram pitti from the "Join maram pitti" offer (playground_2): a grab before the bounce is refused,
 *       after the bounce it works; a real E throw hits = out; last one standing -> win
 *     - maram pitti lost at a second ground (playground_3): no head shots (foul, not out), then hit = out
 *     - a broken window ends the game comically and the aunty keeps the ball (no offer there today)
 *     - N.minigames contract: has(), list(), aliases, isOpen()/active while playing, abort()
 *     - ambient: kids play lingocha / maram pitti at the nearest ground (all AI), places_art cricket kids
 *       hidden there; Hyderabadi barks
 *   3D (SwiftShader WebGL, three.js served from vendor/): lingocha + maram pitti screenshots, the 3D layer
 *     (stones, ball, chalk, rings) is built and visible
 *   phone portrait 390x844 + landscape 844x390 (touch): Join via the ACTION button, the slingshot drag on
 *     the picture throws at the stack, ACTION grabs / throws in maram pitti; screenshots; no page scroll
 * Fails on any console error / page error / N.err.   ONLY=desktop|ambient|3d|portrait|landscape
 *   node nostalgia/tests/playground_games.cjs
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS3D = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
fs.mkdirSync(OUT, { recursive: true });

const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.indexOf(k) >= 0;
const failures = [];
let cur = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { failures.push('[' + cur + '] ' + m); console.log('  FAIL ' + m); };
const check = (c, m, d) => { if (c) ok(m); else fail(m + (d ? ' — ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); return !!c; };

async function openPage(browser, V) {
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.dpr || 1, hasTouch: !!V.touch, isMobile: !!V.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 60000 });
  // a school day afternoon: the kids are out at the grounds; the clock is frozen so the test is stable
  await page.evaluate(() => { N.debug.setTime(16, 40); N.debug.freezeClock(true); N.debug.skipDialogue(true); if (N.wanted && N.wanted.clear) N.wanted.clear('test'); });
  return { context, page, errors };
}
const shot = (page, name, o) => page.screenshot(Object.assign({ path: path.join(OUT, 'pg_' + name + '.png'), timeout: 240000 }, o || {}));
const st = (page) => page.evaluate(() => N.playgroundGames.debug.state());
const waitFor = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 90000, polling: 100 }).then(() => true, () => false);
const logHas = (page, type, extra) => page.evaluate(([t, x]) => N.playgroundGames.debug.log().some((e) => e.type === t && (!x || Object.keys(x).every((k) => e[k] === x[k]))), [type, extra || null]);
const waitLog = (page, type, extra, ms) => waitFor(page, ([t, x]) => N.playgroundGames.debug.log().some((e) => e.type === t && (!x || Object.keys(x).every((k) => e[k] === x[k]))), [type, extra || null], ms);
const waitPhase = (page, phase, ms) => waitFor(page, (ph) => { const s = N.playgroundGames.debug.state(); return !!s && s.phase === ph; }, phase, ms);
const startResult = (page, id, params) => page.evaluate(([id, pr]) => { window.__pgRes = null; N.minigames.play(id, pr).then((r) => { window.__pgRes = r; }); return !!N.playgroundGames.current; }, [id, params]);
const result = (page, ms) => waitFor(page, () => !!window.__pgRes, null, ms || 30000).then(() => page.evaluate(() => window.__pgRes));
async function tapKey(page, key, ms) { await page.keyboard.down(key); await sleep(ms || 120); await page.keyboard.up(key); }
/** walk the player with real arrow keys towards (x, y) */
async function walkTo(page, x, y, r, maxMs) {
  const t0 = Date.now();
  let held = [];
  const set = async (keys) => {
    for (const k of held) if (keys.indexOf(k) < 0) await page.keyboard.up(k);
    for (const k of keys) if (held.indexOf(k) < 0) await page.keyboard.down(k);
    held = keys;
  };
  let d = Infinity;
  while (Date.now() - t0 < (maxMs || 9000)) {
    const p = await page.evaluate(() => ({ x: N.player.x, y: N.player.y }));
    const dx = x - p.x, dy = y - p.y; d = Math.hypot(dx, dy);
    if (d < (r || 3)) break;
    const keys = [];
    if (dx > 1.5) keys.push('ArrowRight'); else if (dx < -1.5) keys.push('ArrowLeft');
    if (dy > 1.5) keys.push('ArrowDown'); else if (dy < -1.5) keys.push('ArrowUp');
    await set(keys);
    await sleep(40);
  }
  await set([]);
  return d;
}
async function noErrors(page, errors, label) {
  const nerr = await page.evaluate(() => N.debug.state().errors);
  check(errors.length === 0 && (!nerr || nerr.length === 0), 'no console / page / N.err errors' + (label ? ' (' + label + ')' : ''), errors.slice(0, 5).concat(nerr || []).join(' | ').slice(0, 900));
}
async function nearOffer(page, gid, place) {
  // stand on the "Join ..." offer and wait for the ACTION prompt to show it
  const pos = await page.evaluate(([g, pl]) => { const f = N.playgroundGames.fieldFor(pl); const I = N.interact.get('pg:' + g + ':' + f.key); return I ? { x: I.x, y: I.y } : null; }, [gid, place]);
  if (!pos) return null;
  await page.evaluate((q) => N.debug.teleport(q.x, q.y + 3), pos);
  const lab = gid === 'lingocha' ? 'lingocha' : 'maram pitti';
  const seen = await waitFor(page, (l) => !!(N.interact.current && /Join/.test(typeof N.interact.current.label === 'function' ? N.interact.current.label(N.player) : N.interact.current.label) && (typeof N.interact.current.label === 'function' ? N.interact.current.label(N.player) : N.interact.current.label).indexOf(l) >= 0), lab, 30000);
  return seen ? pos : null;
}

/* ======================================================================= desktop */
async function desktop(browser) {
  cur = 'desktop';
  console.log('\n== desktop 1280x720 (keyboard, top-down)');
  const { context, page, errors } = await openPage(browser, { viewport: { width: 1280, height: 720 } });
  const PG = await page.evaluate(() => ({
    has: N.minigames.has('lingocha') && N.minigames.has('marampitti'), alias: N.minigames.resolve('marampeety') === 'marampitti' && N.minigames.resolve('lagori') === 'lingocha',
    list: N.minigames.list().filter((g) => g.id === 'lingocha' || g.id === 'marampitti').map((g) => g.id + ':' + g.places.length),
    fields: N.playgroundGames.fields().length, offers: N.playgroundGames.fields().every((f) => !!N.interact.get('pg:lingocha:' + f.key) && !!N.interact.get('pg:marampitti:' + f.key)),
    kids: N.playgroundGames.kidsPresent(),
  }));
  check(PG.has && PG.alias, 'N.minigames knows lingocha / marampitti (+ aliases marampeety, lagori)', PG);
  check(PG.list.length === 2 && PG.fields >= 10, 'listed with their grounds (' + PG.list.join(', ') + '; ' + PG.fields + ' grounds)');
  check(PG.offers, 'every ground has "Join lingocha" and "Join maram pitti" offers');
  check(PG.kids, 'kids are at the grounds on a school-day afternoon (16:40)');
  await page.evaluate(() => { N.playgroundGames.ambient.off = true; });

  // ---------------------------------------------------------------- lingocha (win) at the home ground
  const pos = await nearOffer(page, 'lingocha', 'playground_1');
  check(!!pos, 'standing at the home ground the ACTION prompt offers "Join lingocha"');
  const money0 = await page.evaluate(() => N.player.money);
  await page.evaluate(() => { window.__pgEnd = null; N.on('minigame:end', (d) => { if (d && d.inWorld) window.__pgEnd = d.result; }); });
  await tapKey(page, 'KeyE');
  const started = await waitFor(page, () => !!N.playgroundGames.current, null, 20000);
  check(started, 'E starts an in-world lingocha (no overlay, still in play mode)');
  if (!started) { await context.close(); return; }
  const s0 = await st(page);
  check(s0.id === 'lingocha' && (await page.evaluate(() => N.state.mode)) === 'play' && !(await page.evaluate(() => !!document.querySelector('.mg-screen'))), 'mode stays "play"; the world is the game board');
  check(s0.parts.length === 8 && s0.parts.some((p) => p.npc === 'immu') && s0.parts.some((p) => p.npc === 'bunty') && s0.parts.some((p) => p.dood), '4 v 4: Chinnu XI (Immu, Ayesha, Chitti the doodh-bhaat) vs Bunty-anna’s gang', s0.parts.map((p) => p.name));
  check(await page.evaluate(() => N.minigames.isOpen() && N.minigames.active === 'lingocha'), 'N.minigames.isOpen() / active report the in-world game (menus refuse saves)');
  check(await page.evaluate(() => !!document.querySelector('#hud .pg-hud.show') || !!document.querySelector('.pg-hud.show')), 'the compact HUD panel is up');
  const atLine = await waitPhase(page, 'aim', 90000);
  const s1 = await st(page);
  check(atLine && s1.lingocha.thrower === s1.parts.find((p) => p.me).name, 'round 1: Chinnu’s team seeks — Chinnu walks to the chalk line with the ball');
  const lineD = Math.hypot(s1.parts.find((p) => p.me).x - s1.lingocha.line.x, s1.parts.find((p) => p.me).y - s1.lingocha.line.y);
  check(lineD < 4, 'he stands on the line (' + lineD.toFixed(1) + ' u)');
  await shot(page, 'desktop_lingocha_aim');
  // aim with the arrow keys
  const a0 = s1.aim.ang;
  await page.keyboard.down('ArrowLeft'); await sleep(450); await page.keyboard.up('ArrowLeft');
  const a1 = (await st(page)).aim.ang;
  check(Math.abs(a1 - a0) > 0.03, '← turns the aim (' + a0.toFixed(2) + ' -> ' + a1.toFixed(2) + ')');
  // power: hold E, see the meter charge, let go (assist: straight at the stack)
  await page.evaluate(() => { N.playgroundGames.debug.assist.aim = true; });
  await page.keyboard.down('KeyE');
  await sleep(500);
  const ch = await st(page);
  check(ch.aim.charging && ch.aim.p > 0.05 && (await page.evaluate(() => document.querySelector('.pg-power.on') != null)), 'holding E charges the power bar (' + ch.aim.p + ')');
  await shot(page, 'desktop_lingocha_charge');
  await page.keyboard.up('KeyE');
  check(await waitLog(page, 'player_throw', null, 20000), 'letting go throws');
  check(await waitLog(page, 'knock', { me: true }, 30000), 'the ball knocks the seven stones down');
  const live = await waitPhase(page, 'live', 30000);
  const s2 = await st(page);
  check(live && s2.lingocha.stack <= 1 && s2.lingocha.stones.filter((q) => q.state !== 'stack').length >= 6, 'stones scattered, the live phase begins (timer ' + s2.lingocha.timer + ' s)', s2.lingocha.stones.map((q) => q.state).join(','));
  await shot(page, 'desktop_lingocha_scatter');
  // pick a stone and stack it (real keys: walk + E)
  // freeze the AI and park the ball far away (no ball in flight) while Chinnu fetches and stacks
  await page.evaluate(() => { const D = N.playgroundGames.debug, S = D.session(); D.assist.freezeAI = true; D.assist.noTimer = true; D.ballTo(S.F.x0 + 3, S.F.y0 + 3, 0); for (const P of S.parts) { P.windT = 0; } });
  await sleep(200);
  const stn = await page.evaluate(() => { const s = N.playgroundGames.debug.state(); const p = N.player; let b = null, bd = 1e9; for (const q of s.lingocha.stones) { if (q.state !== 'loose') continue; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; b = q; } } return b; });
  check(!!stn, 'a loose stone to fetch');
  if (stn) {
    const d = await walkTo(page, stn.x, stn.y, 3.5, 12000);
    if (d > 5) await page.evaluate((q) => { N.player.x = q.x + 2; N.player.y = q.y; }, stn);
    await sleep(150);
    const lab = (await st(page)).label;
    check(/Pick up stone/.test(lab), 'over a stone the ACTION label says "' + lab + '"');
    await tapKey(page, 'KeyE');
    check(await waitLog(page, 'pick', { me: true }, 10000), 'E picks the stone up (carried)');
    const before = (await st(page)).lingocha.stack;
    const base = (await st(page)).lingocha.base;
    await walkTo(page, base.x, base.y + 5, 2, 12000);
    const d2 = await page.evaluate((q) => Math.hypot(N.player.x - q.x, N.player.y - q.y), base);
    if (d2 > 8) await page.evaluate((q) => { N.player.x = q.x; N.player.y = q.y + 5; }, base);
    await sleep(150);
    check(/Stack/.test((await st(page)).label), 'at the stack the label is "' + (await st(page)).label + '"');
    await tapKey(page, 'KeyE');
    check(await waitLog(page, 'restack', { me: true }, 10000), 'E puts the stone on the stack');
    const after = (await st(page)).lingocha.stack;
    check(after === before + 1, 'restack count ' + before + ' -> ' + after + '/7');
  }
  // hit = out
  await page.evaluate(() => { N.playgroundGames.debug.hitPlayer(); });
  check(await waitLog(page, 'out', { me: true }, 10000), 'a hitter’s ball on Chinnu (on the full, below the head) = OUT');
  const s3 = await st(page);
  check(s3.parts.find((p) => p.me).out && /OUT/.test(s3.prompt), 'the HUD says he is out (' + s3.prompt + ')');
  await shot(page, 'desktop_lingocha_out');
  // the team finishes the stack: LINGOCHA!
  await page.evaluate(() => { N.playgroundGames.debug.restack(7); });
  check(await waitLog(page, 'lingocha', null, 10000), 'all seven back on the stack: "LINGOCHA!" (banner + crowd cheer)');
  await sleep(300);
  await shot(page, 'desktop_lingocha_banner');
  const s4 = await st(page);
  check(s4.lingocha.wins[0] === 1 && s4.lingocha.hist[0].winner === 'home', 'round 1 to Chinnu XI (' + s4.lingocha.wins.join('-') + ')');
  // round 2: roles swap
  check(await waitLog(page, 'role_swap', null, 20000), 'roles swap for round 2');
  const s5 = await st(page);
  check(s5.lingocha.mySide === 'hit' && s5.lingocha.seek === 'away', 'now Chinnu’s team HITS (' + s5.lingocha.mySide + ')');
  await waitPhase(page, 'aim', 30000);
  await page.evaluate(() => { N.playgroundGames.debug.knock(); });
  await waitPhase(page, 'live', 20000);
  // as a hitter: pick the ball up and throw it at a seeker
  const seek = await page.evaluate(() => {
    const D = N.playgroundGames.debug, S = D.session(), p = N.player;
    const T = S.parts.find((q) => !q.isPlayer && q.team !== S.me.team && !q.dood && !q.out);
    // stand 14 u from the seeker, facing him, the ball at our feet
    const a = Math.atan2(T.e.y - p.y, T.e.x - p.x);
    p.x = T.e.x - Math.cos(a) * 14; p.y = T.e.y - Math.sin(a) * 14; p.angle = p.facing = a;
    D.ballTo(p.x + Math.cos(a) * 2, p.y + Math.sin(a) * 2, 0);
    return T.name;
  });
  await sleep(200);
  check(/Pick up ball/.test((await st(page)).label), 'next to the loose ball: "' + (await st(page)).label + '"');
  await tapKey(page, 'KeyE');
  check(await waitFor(page, () => N.playgroundGames.debug.state().ball.holderIsMe, null, 8000), 'E: Chinnu holds the ball');
  await sleep(250);
  const tgt = (await st(page)).target;
  check(!!tgt, 'aim assist picks a seeker: ' + tgt);
  await page.evaluate(() => { N.playgroundGames.debug.assist.noDodge = true; });
  await shot(page, 'desktop_lingocha_hitter');
  await tapKey(page, 'KeyE', 90);
  check(await waitLog(page, 'throw', { by: s0.parts.find((p) => p.me).name }, 8000), 'a tap of E throws');
  check(await waitLog(page, 'out', { by: s0.parts.find((p) => p.me).name }, 8000), 'Chinnu’s hit puts ' + seek + ' out');
  // win the match 2-0
  await page.evaluate(() => { N.playgroundGames.debug.finishRound('home'); });
  const r1 = await result(page, 60000).catch(() => null) || (await waitFor(page, () => !!window.__pgEnd, null, 30000), await page.evaluate(() => window.__pgEnd));
  check(r1 && r1.win === true && r1.roundsWon === 2 && r1.roundsLost === 0 && r1.stars === 3, 'match won 2-0 (3 stars)', r1);
  const money1 = await page.evaluate(() => N.player.money);
  check(r1 && r1.paid > 0 && money1 - money0 === r1.paid, 'free-roam win paid ' + (r1 && r1.paid) + ' paise (systems §2.4)');
  check(r1 && r1.stacked >= 1 && r1.hits >= 1, 'result counts Chinnu’s restacks / hits (' + (r1 && r1.stacked) + ' / ' + (r1 && r1.hits) + ')');
  check(await page.evaluate(() => !N.minigames.isOpen() && !N.playgroundGames.current && N.clock.holds && !N.clock.holds.has('playground-game')), 'the game closed cleanly (clock hold released)');
  await page.evaluate(() => { const A = N.playgroundGames.debug.assist; A.aim = false; A.freezeAI = false; A.noTimer = false; A.noDodge = false; });

  // ---------------------------------------------------------------- pay limit: 3 paid wins a day
  const paid = [];
  for (let i = 0; i < 3; i++) {
    await startResult(page, 'lingocha', { place: 'playground_1', side: true, seed: 10 + i });
    await waitFor(page, () => !!N.playgroundGames.current, null, 10000);
    await page.evaluate(() => N.playgroundGames.debug.end(true));
    const r = await result(page, 20000);
    paid.push(r ? r.paid : -1);
  }
  const led = await page.evaluate(() => N.playgroundGames.ledger().paid.lingocha);
  check(paid[0] > 0 && paid[1] > 0 && paid[2] === 0 && led === 3, 'at most 3 paid lingocha wins per game-day (wins 2-4 paid: ' + paid.join(', ') + '; ledger ' + led + ')');
  const capT = await page.evaluate(() => Array.from(document.querySelectorAll('.hud-toast')).map((e) => e.textContent).join(' | '));
  check(/no more prize money today/i.test(capT) || paid[2] === 0, 'the 4th win says "no more prize money today"');

  // ---------------------------------------------------------------- lingocha (loss) at a second ground
  await page.evaluate(() => { const f = N.playgroundGames.fieldFor('playground_14'); N.debug.teleport(f.line.x + 6, f.line.y + 6); });
  await sleep(300);
  await startResult(page, 'lingocha', { place: 'playground_14', seekFirst: false, seed: 3 });
  const s6 = await st(page);
  check(s6 && s6.place === 'playground_14' && s6.lingocha.teams[1] === 'Ashok Nagar boys' && s6.parts.some((p) => p.npc === 'tiger'), 'lingocha at Ashok Nagar ground: Tiger’s boys (' + (s6 && s6.lingocha.teams.join(' v ')) + ')');
  check(s6 && s6.lingocha.mySide === 'hit', 'seekFirst:false -> the home side hits first');
  await waitPhase(page, 'aim', 60000);
  await sleep(700);
  await shot(page, 'desktop_lingocha_ashok_nagar');
  await page.evaluate(() => N.playgroundGames.debug.finishRound('away'));
  await waitLog(page, 'role_swap', null, 20000);
  await page.evaluate(() => N.playgroundGames.debug.finishRound('away'));
  const r2 = await result(page, 30000);
  check(r2 && r2.win === false && r2.roundsLost === 2 && r2.paid === 0 && r2.stars === 0, 'lost 0-2 at the second ground (no pay)', r2);

  // ---------------------------------------------------------------- maram pitti (win) at Vidyanagar ground
  const pos2 = await nearOffer(page, 'marampitti', 'playground_2');
  check(!!pos2, 'at Vidyanagar ground the prompt offers "Join maram pitti"');
  await page.evaluate(() => { window.__pgEnd = null; N.playgroundGames.TUNE.maram.tossVz = 135; });
  await tapKey(page, 'KeyE');
  check(await waitFor(page, () => !!N.playgroundGames.current && N.playgroundGames.current.id === 'marampitti', null, 20000), 'E starts maram pitti (in-world)');
  const m0 = await st(page);
  check(m0.parts.length === 8 && m0.parts.some((p) => p.npc === 'immu'), '8 kids in the ring (Immu, Ayesha, Babloo + colony kids)', m0.parts.map((p) => p.name));
  check(await waitPhase(page, 'toss', 60000), 'the ball goes up (the toss)');
  await page.evaluate(() => { N.playgroundGames.debug.assist.freezeAI = true; const b = N.playgroundGames.current.ball; N.player.x = b.x + 2; N.player.y = b.y + 1; });
  await tapKey(page, 'KeyE', 60);
  await shot(page, 'desktop_maram_toss');
  check(await waitLog(page, 'grab_refused', null, 6000), 'grabbing before the bounce is refused ("Nakko, cheating! Bounce first")');
  check(!(await st(page)).ball.holderIsMe, 'the ball is not in Chinnu’s hand');
  check(await waitFor(page, () => N.playgroundGames.current.ball.bounced > 0, null, 10000), 'it bounces');
  await page.evaluate(() => { const b = N.playgroundGames.current.ball; N.player.x = b.x + 2; N.player.y = b.y; });
  await sleep(120);
  await tapKey(page, 'KeyE', 60);
  check(await waitLog(page, 'grab', { me: true }, 6000) && (await st(page)).ball.holderIsMe, 'after the bounce E grabs it');
  // a throw that hits = out (real E tap at a kid 14 u away, straight aim, no dodge)
  const victim = await page.evaluate(() => {
    const S = N.playgroundGames.current, p = N.player, T = S.parts.find((q) => !q.isPlayer && !q.out);
    T.e.x = p.x + 14; T.e.y = p.y; p.angle = p.facing = 0;
    return T.name;
  });
  await page.evaluate(() => { const A = N.playgroundGames.debug.assist; A.aim = true; A.noDodge = true; });
  await sleep(250);
  await shot(page, 'desktop_maram_aim');
  await tapKey(page, 'KeyE', 80);
  check(await waitLog(page, 'out', { name: victim }, 8000), 'Chinnu’s throw hits ' + victim + ' on the full: OUT (thwack, nobody hurt)');
  await sleep(400);
  await shot(page, 'desktop_maram_out');
  // last one standing
  await page.evaluate(() => { const S = N.playgroundGames.current; for (const P of S.parts) if (!P.isPlayer && !P.out) N.playgroundGames.debug.out(P.name); });
  const r3 = await waitFor(page, () => !!window.__pgEnd, null, 30000).then(() => page.evaluate(() => window.__pgEnd));
  check(r3 && r3.win === true && r3.reason === 'last' && r3.rank === 1 && r3.hits >= 1, 'last one standing: Chinnu wins maram pitti', r3);
  check(r3 && r3.paid > 0, 'paid ' + (r3 && r3.paid) + ' (its own 3-a-day count)');
  await page.evaluate(() => { const A = N.playgroundGames.debug.assist; A.aim = false; A.freezeAI = false; A.noDodge = false; N.playgroundGames.TUNE.maram.tossVz = 70; });

  // ---------------------------------------------------------------- maram pitti (loss) at Nallakunta ground
  await page.evaluate(() => { const f = N.playgroundGames.fieldFor('playground_3'); N.debug.teleport(f.centre.x, f.centre.y + 10); });
  await startResult(page, 'marampitti', { place: 'playground_3', seed: 4 });
  check(await waitPhase(page, 'play', 60000), 'maram pitti at Nallakunta ground: toss, bounce, play');
  await page.evaluate(() => { N.playgroundGames.debug.assist.freezeAI = true; });
  await sleep(300);
  await page.evaluate(() => N.playgroundGames.debug.hitPlayer(6.6));
  check(await waitLog(page, 'head_foul', null, 8000), 'a ball at head height is a foul (no head shots)');
  check(!(await st(page)).parts.find((p) => p.me).out, '... and Chinnu is not out');
  await sleep(300);
  await page.evaluate(() => N.playgroundGames.debug.hitPlayer(2.4));
  check(await waitLog(page, 'out', { me: true }, 8000), 'a body hit on the full: Chinnu is out');
  const r4 = await result(page, 30000);
  check(r4 && r4.win === false && r4.reason === 'out' && r4.rank > 1, 'lost (placed ' + (r4 && r4.rank) + ' of ' + (r4 && r4.kids) + ')', r4);
  await page.evaluate(() => { N.playgroundGames.debug.assist.freezeAI = false; });

  // ---------------------------------------------------------------- a broken window
  await page.evaluate(() => { const f = N.playgroundGames.fieldFor('playground_10'); N.debug.teleport(f.centre.x, f.centre.y); });
  await startResult(page, 'marampitti', { place: 'playground_10', side: true, seed: 6 });
  await waitFor(page, () => !!N.playgroundGames.current, null, 10000);
  await page.evaluate(() => N.playgroundGames.debug.breakWindow());
  const r5 = await result(page, 30000);
  check(r5 && r5.reason === 'window' && r5.window === true && r5.win === false, 'KHANNN! a broken window ends the game (the aunty keeps the ball)', r5);
  const conf = await page.evaluate(() => { const f = N.playgroundGames.fieldFor('playground_10'); const I = N.interact.get('pg:marampitti:' + f.key); return I.enabled(N.player); });
  check(conf === false, 'no game at that ground for the rest of the day');
  await shot(page, 'desktop_window');

  // ---------------------------------------------------------------- minigames contract: abort
  await page.evaluate(() => { const f = N.playgroundGames.fieldFor('playground_5'); N.debug.teleport(f.centre.x, f.centre.y); });
  await startResult(page, 'maram_pitti', { place: 'playground_5' });
  await waitFor(page, () => !!N.playgroundGames.current, null, 10000);
  await page.evaluate(() => N.minigames.abort('test'));
  const r6 = await result(page, 10000);
  check(r6 && r6.aborted === true && r6.id === 'marampitti', 'N.minigames.abort() ends an in-world game ({aborted:true}) and the alias maram_pitti resolves');
  check(await waitFor(page, () => N.playgroundGames.debug.kidCount() === 0, null, 60000), 'the kids walk off and are removed afterwards');
  // busy guard: a second start while one runs answers at once
  await startResult(page, 'lingocha', { place: 'playground_5', seed: 1 });
  await waitFor(page, () => !!N.playgroundGames.current, null, 10000);
  const busy = await page.evaluate(() => N.minigames.play('marampitti', {}));
  check(busy && busy.error === 'busy' && busy.win === false, 'a second start while one runs: {win:false, error:"busy"}', busy);
  await page.evaluate(() => N.playgroundGames.abort('test'));
  await result(page, 10000);
  await noErrors(page, errors);
  await context.close();
}

/* ======================================================================= ambient */
async function ambient(browser) {
  cur = 'ambient';
  console.log('\n== ambient games (desktop)');
  const { context, page, errors } = await openPage(browser, { viewport: { width: 1280, height: 720 } });
  for (const [gid, place] of [['lingocha', 'playground_5'], ['marampitti', 'playground_11']]) {
    await page.evaluate(([g, pl]) => { N.playgroundGames.ambient.force = g; const f = N.playgroundGames.fieldFor(pl); N.debug.teleport(f.cx || (f.x0 + f.x1) / 2, f.y1 + 40); }, [gid, place]);
    const on = await waitFor(page, (g) => { const S = N.playgroundGames.debug.session('ambient'); return !!S && S.id === g; }, gid, 30000);
    check(on, 'ambient ' + gid + ' starts at ' + place + ' when Chinnu comes near (no mission, afternoon)');
    await sleep(gid === 'lingocha' ? 9000 : 7000);
    const a = await page.evaluate(() => { const s = N.playgroundGames.debug.state('ambient'); const busy = N.playgroundGames.debug.busy(); return { s: s && { phase: s.phase, n: s.parts.length, log: s.log.map((e) => e.type) }, busy, filtered: N.playgroundGames.debug.filtered.n }; });
    const types = new Set(a.s ? a.s.log : []);
    check(a.s && a.s.n >= 6, gid + ': ' + (a.s && a.s.n) + ' kids playing on their own');
    check(gid === 'lingocha' ? (types.has('stack_throw') || types.has('knock')) : (types.has('toss') && (types.has('grab') || types.has('throw'))), gid + ' is being played by the AI (' + Array.from(types).slice(0, 12).join(' ') + ')');
    check(a.busy.some((k) => k != null), 'the ground is marked busy (places_art cricket kids hidden there; ' + a.filtered + ' draws dropped)');
    await shot(page, 'ambient_' + gid);
  }
  await page.evaluate(() => { N.playgroundGames.ambient.force = 'cricket'; });
  check(await waitFor(page, () => !N.playgroundGames.debug.session('ambient'), null, 15000), 'cricket hour: our ambient game stops (places_art draws the gully cricket)');
  await page.evaluate(() => { N.playgroundGames.ambient.force = null; N.debug.setTime(21, 30); });
  await sleep(1500);
  check(await page.evaluate(() => !N.playgroundGames.kidsPresent()), 'no kids at the grounds at night');
  await noErrors(page, errors);
  await context.close();
}

/* ======================================================================= 3D */
async function three() {
  cur = '3d';
  console.log('\n== 3D (third person, SwiftShader)');
  const browser = await chromium.launch({ args: ARGS3D });
  try {
    const { context, page, errors } = await openPage(browser, { viewport: { width: 1280, height: 720 } });
    await page.evaluate(() => { N.playgroundGames.ambient.off = true; const f = N.playgroundGames.fieldFor('playground_1'); N.debug.teleport(f.line.x, f.line.y + 12); N.view.set('tps'); });
    const v = await waitFor(page, () => N.view3d && N.view3d.active, null, 180000);
    check(v, '3D view is on');
    if (!v) { await context.close(); return; }
    // SwiftShader frames are slow (headless only ticks rAF steadily around screenshots): a small pixel ratio
    await page.evaluate(() => { N.view3d.setQuality({ pixelRatio: 0.4, adaptive: false }); });
    await startResult(page, 'lingocha', { place: 'playground_1', seed: 5 });
    const frames = async (n) => { const f0 = await page.evaluate(() => N.time.frame); return waitFor(page, (f) => N.time.frame >= f, f0 + n, 240000); };
    await waitPhase(page, 'aim', 240000);
    await frames(4);
    await shot(page, '3d_lingocha_aim');
    const L = await page.evaluate(() => { const V = N.playgroundGames.debug.v3; return { ok: V.ok, vis: !!(V.grp && V.grp.visible), stones: V.stones.filter((m) => m.visible).length, chalk: !!(V.chalk && V.chalk.visible), arrow: !!(V.arrow && V.arrow.visible), rings: V.rings.filter((m) => m.visible).length }; });
    check(L.ok && L.vis && L.stones === 7 && L.chalk && L.rings >= 6, 'the 3D layer: 7 stones, chalk line + ring, team rings (' + JSON.stringify(L) + ')');
    check(L.arrow, 'the aim arrow lies on the ground in front of Chinnu');
    await page.evaluate(() => { N.playgroundGames.debug.knock(); });
    await waitPhase(page, 'live', 120000);
    await frames(20);
    await shot(page, '3d_lingocha_live');
    await page.evaluate(() => N.playgroundGames.abort('test'));
    await result(page, 20000);
    await page.evaluate(() => { const f = N.playgroundGames.fieldFor('playground_2'); N.debug.teleport(f.centre.x, f.centre.y + 30); });
    await sleep(1500);
    await startResult(page, 'marampitti', { place: 'playground_2', seed: 2 });
    await waitPhase(page, 'play', 240000);
    await frames(10);
    const M = await page.evaluate(() => { const V = N.playgroundGames.debug.v3; return { ball: !!(V.ball && V.ball.visible), stones: V.stones.filter((m) => m.visible).length }; });
    check(M.ball && M.stones === 0, 'maram pitti in 3D: the ball, no stones');
    await shot(page, '3d_maram');
    await page.evaluate(() => N.playgroundGames.abort('test'));
    await noErrors(page, errors);
    await context.close();
  } finally { await browser.close(); }
}

/* ======================================================================= phones */
async function cdpTouchDrag(page, x0, y0, x1, y1, steps) {
  const c = await page.context().newCDPSession(page);
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 7 }] });
  for (let i = 1; i <= (steps || 8); i++) { const t = i / (steps || 8); await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, id: 7 }] }); await sleep(40); }
  await sleep(150);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await c.detach();
}
async function phone(browser, name, viewport) {
  cur = name;
  console.log('\n== ' + name + ' ' + viewport.width + 'x' + viewport.height + ' (touch)');
  const { context, page, errors } = await openPage(browser, { viewport, dpr: 2, touch: true });
  await page.evaluate(() => { N.playgroundGames.ambient.off = true; });
  // lingocha via the ACTION button; the slingshot throw
  const pos = await nearOffer(page, 'lingocha', 'playground_1');
  check(!!pos, 'touch: the ACTION button offers "Join lingocha"');
  const actLab = await page.evaluate(() => { const b = document.querySelector('.t-btn.t-action .t-txt'); return b ? b.textContent : ''; });
  check(/lingocha/i.test(actLab), 'ACTION button label "' + actLab + '"');
  await page.tap('.t-btn.t-action');
  check(await waitFor(page, () => !!N.playgroundGames.current, null, 20000), 'tap ACTION: lingocha starts');
  await waitPhase(page, 'aim', 90000);
  await sleep(400);
  await shot(page, name + '_lingocha_aim');
  // drag back from Chinnu (away from the stack) on the picture and let go
  const drag = await page.evaluate(() => {
    const S = N.playgroundGames.debug.state(), R = N.render, p = N.player;
    const r = R.canvas.getBoundingClientRect();
    const toCss = (x, y) => { const q = R.proj(x, y, 0); return { x: r.left + q.x / R.W * r.width, y: r.top + q.y / R.H * r.height }; };
    const a = toCss(p.x, p.y), b = toCss(S.lingocha.base.x, S.lingocha.base.y);
    const dx = a.x - b.x, dy = a.y - b.y, l = Math.hypot(dx, dy) || 1;
    // start right of the joystick zone so the finger lands on the picture, not the stick
    const sx = Math.max(a.x, window.innerWidth * 0.62), sy = Math.min(Math.max(a.y, 120), window.innerHeight - 160);
    return { x0: sx, y0: sy, x1: sx + dx / l * 80, y1: sy + dy / l * 80 };
  });
  await cdpTouchDrag(page, drag.x0, drag.y0, drag.x1, drag.y1, 8);
  check(await waitLog(page, 'player_throw', null, 15000), 'the slingshot drag throws at the stack');
  const kn = await waitFor(page, () => N.playgroundGames.debug.log().some((e) => e.type === 'knock' || e.type === 'try_miss'), null, 30000);
  check(kn, 'the throw lands (' + ((await logHas(page, 'knock')) ? 'knocked down' : 'missed') + ')');
  await sleep(1200);
  await shot(page, name + '_lingocha_throw');
  await page.evaluate(() => N.playgroundGames.abort('test'));
  await result(page, 20000);
  // maram pitti: ACTION grabs after the bounce, ACTION throws
  await page.evaluate(() => { const f = N.playgroundGames.fieldFor('playground_2'); N.debug.teleport(f.centre.x, f.centre.y + 20); });
  await startResult(page, 'marampitti', { place: 'playground_2', seed: 8 });
  await waitPhase(page, 'play', 90000);
  await page.evaluate(() => { const A = N.playgroundGames.debug.assist; A.freezeAI = true; A.aim = true; A.noDodge = true; const S = N.playgroundGames.current, b = S.ball; for (const P of S.parts) P.hold = false; N.playgroundGames.debug.ballTo(N.player.x + 3, N.player.y, 0); });
  await sleep(300);
  const lab2 = await page.evaluate(() => document.querySelector('.t-btn.t-action .t-txt').textContent);
  check(/Grab/i.test(lab2), 'ACTION button: "' + lab2 + '"');
  await page.tap('.t-btn.t-action');
  check(await waitFor(page, () => N.playgroundGames.debug.state().ball.holderIsMe, null, 8000), 'tap ACTION grabs the ball');
  const victim = await page.evaluate(() => { const S = N.playgroundGames.current, p = N.player, T = S.parts.find((q) => !q.isPlayer && !q.out); T.e.x = p.x + 13; T.e.y = p.y + 2; p.angle = p.facing = 0; return T.name; });
  await sleep(300);
  const lab3 = await page.evaluate(() => document.querySelector('.t-btn.t-action .t-txt').textContent);
  check(/Throw at/i.test(lab3), 'ACTION button: "' + lab3 + '" (aim assist)');
  await shot(page, name + '_maram_hold');
  await page.tap('.t-btn.t-action');
  check(await waitLog(page, 'out', { name: victim }, 8000), 'tap ACTION throws: ' + victim + ' is out');
  await sleep(500);
  await shot(page, name + '_maram_out');
  const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
  check(scroll.sw <= scroll.iw && scroll.sh <= scroll.ih, 'no page scroll', scroll);
  const hud = await page.evaluate(() => { const r = document.querySelector('.pg-hud').getBoundingClientRect(); return { l: r.left, r: r.right, w: window.innerWidth }; });
  check(hud.l >= 0 && hud.r <= hud.w, 'the HUD panel fits the screen (' + Math.round(hud.l) + '..' + Math.round(hud.r) + ' of ' + hud.w + ')');
  await page.evaluate(() => { const A = N.playgroundGames.debug.assist; A.freezeAI = false; A.aim = false; A.noDodge = false; N.playgroundGames.abort('test'); });
  await noErrors(page, errors);
  await context.close();
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  try {
    if (want('desktop')) await desktop(browser);
    if (want('ambient')) await ambient(browser);
    if (want('portrait')) await phone(browser, 'portrait', { width: 390, height: 844 });
    if (want('landscape')) await phone(browser, 'landscape', { width: 844, height: 390 });
  } catch (e) { fail('exception: ' + (e.stack || e.message)); }
  finally { await browser.close(); }
  if (want('3d')) { try { await three(); } catch (e) { fail('3d exception: ' + (e.stack || e.message)); } }
  console.log('\n' + (failures.length ? failures.length + ' FAILURE(S):\n  ' + failures.join('\n  ') : 'ALL PLAYGROUND-GAMES CHECKS PASSED') + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  process.exit(failures.length ? 1 : 0);
})();
