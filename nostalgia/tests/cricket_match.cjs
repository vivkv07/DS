/* NOSTALGIA — tests/cricket_match.cjs  (owner: cricket developer)
 * The LB Stadium cricket match (src/cricket_match.js, minigame id 'match') in headless Chromium.
 *
 *   A. desktop 1280x720, REAL keyboard + mouse: how-to card (mouse click) -> toss (←) -> bat first (←)
 *      -> a full batting over with real, time-synchronised key presses and RUN calls, plus forced test
 *      deliveries to check the rules live: a WIDE (+1, ball re-bowled), a FOUR, a SIX (with the action
 *      replay announced in text), a RUN-OUT (greedy running) -> innings break -> the bowling innings with
 *      real keys (1-4 type, arrows aim, Space bowl + Space release), the FPV camera (V), ALL OUT ->
 *      result card (wagon wheel + Man of the Match) -> "Aage chalo" -> the promise shape.
 *   B. the pure scoring engine (N.cricketMatch.rules): fours, sixes, wides, no-balls, run-outs, over end
 *      strike swap, all out, target chased.
 *   C. chase mode (target chased -> win, reason 'chased'), all out while batting, pause -> quit, busy
 *      guard, autoplay 'win' / 'lose' (full matches by the built-in bot), the gully skin, registration
 *      and aliases, the 2D world match-day dressing (N.flags.lb_match) and the exhibition interact.
 *   D. phone portrait 390x844 and landscape 844x390 with CDP touch: pad buttons (toss, shots, BOWL),
 *      a swipe shot, drag-to-aim, layout (frame letterboxed inside the viewport, pad buttons on screen
 *      and not overlapping), pause pill -> quit.
 * Zero page errors, console errors and N.err entries in every viewport.
 *
 *   node nostalgia/tests/cricket_match.cjs            everything (~4-6 min)
 *   ONLY=desktop|rules|modes|portrait|landscape        one part;  SWIFT=1 launches with the WebGL
 *   (SwiftShader) flags from the 3D work. The match is Canvas 2D: without those flags headless
 *   Chromium keeps requestAnimationFrame running at full rate, with them it only ticks on screenshots.
 * Screenshots: nostalgia/tests/out/cricket_match/<viewport>_<step>.png
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'cricket_match');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const THREE = path.join(ROOT, 'vendor', 'three', 'three.min.js');
const ONLY = process.env.ONLY || '';
const want = (k) => !ONLY || ONLY.split(',').includes(k);

const failures = [];
let checks = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => { checks++; console.log('  ok   ' + m); };
const fail = (vp, m) => { checks++; failures.push('[' + vp + '] ' + m); console.log('  FAIL ' + m); };
const expect = (vp, cond, m) => (cond ? ok(m) : fail(vp, m));

async function boot(V) {
  const browser = await chromium.launch(process.env.SWIFT ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : {});
  const ctx = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.dpr || 1, hasTouch: !!V.touch, isMobile: !!V.touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed in tests */' }));
  // the 3D view's CDN copy of three.js -> the vendored file (the sandbox blocks CDNs)
  await page.route('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(THREE) }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 8000 });
  const cdp = V.touch ? await ctx.newCDPSession(page) : null;
  return { browser, page, errors, cdp };
}

/* ------------------------------------------------------------------ helpers */
function kit(page, V, cdp) {
  const st = () => page.evaluate(() => N.cricketMatch.debug.state());
  const until = (fn, arg, t) => page.waitForFunction(fn, arg, { timeout: t || 20000, polling: 50 }).then(() => true).catch(() => false);
  const shot = (name) => page.screenshot({ path: path.join(OUT, V.name + '_' + name + '.png') });
  const start = (p) => page.evaluate((p) => { window.__r = 'pending'; N.cricketMatch.start(p).then((r) => { window.__r = r; }); }, p);
  const result = async (t) => { await page.waitForFunction(() => window.__r !== 'pending', null, { timeout: t || 30000 }).catch(() => {}); return page.evaluate(() => window.__r); };
  const force = (k) => page.evaluate((k) => N.cricketMatch.debug.force(k), k);
  const inn = async () => { const s = await st(); return s && s.inn; };
  const touch = {
    async down(x, y, id) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: id || 1 }] }); },
    async move(x, y, id) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: id || 1 }] }); },
    async up() { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); },
    async tap(x, y) { await touch.down(x, y); await sleep(50); await touch.up(); },
    async swipe(x0, y0, x1, y1, ms) { await touch.down(x0, y0); for (let i = 1; i <= 6; i++) { await touch.move(x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6); await sleep(ms / 6); } await touch.up(); },
  };
  const center = async (sel) => { const b = await page.locator(sel).first().boundingBox(); if (!b) throw new Error('no element ' + sel); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
  const tapSel = async (sel) => { const c = await center(sel); await touch.tap(c.x, c.y); };
  // wait for the next delivery to be in the air, then act exactly as it reaches the bat
  const onArrival = async (lat, fn) => {
    await page.waitForFunction(() => { const s = N.cricketMatch.debug.state(); return s && s.bp === 'flight' && s.del; }, null, { timeout: 30000, polling: 'raf' }).catch(() => {});
    const s = await st();
    if (!s || !s.del) return null;
    const ts = (await page.evaluate(() => N.minigames.game && N.minigames.game.timeScale)) || 1;
    const ms = ((s.del.tRel + s.del.tA) - s.clock) / ts * 1000 - (lat == null ? 70 : lat);
    if (ms > 0) await sleep(ms);
    await fn();
    return s;
  };
  // wait until the ball counted (ballLog grew) or the innings / match moved on
  const ballDone = async (n0, t) => until((n0) => { const s = N.cricketMatch.debug.state(); return !s || (s.ballLog && s.ballLog.length > n0) || s.phase === 'inn_break' || s.phase === 'end' || s.gamePhase === 'result'; }, n0, t || 30000);
  const logLen = async () => { const s = await st(); return s && s.ballLog ? s.ballLog.length : 0; };
  // a finished (non-autoplay) match waits on its result card: press "Aage chalo"
  const done = async (t) => {
    if (!(await until(() => { const s = N.cricketMatch.debug.state(); return !s || s.gamePhase === 'result'; }, null, t || 40000))) return null;
    await sleep(500);
    await page.evaluate(() => { const b = document.querySelector('.mg-card-result button[data-do="done"]'); if (b) b.click(); });
    return result(8000);
  };
  return { st, until, shot, start, result, force, inn, touch, center, tapSel, onArrival, ballDone, logLen, done };
}
async function finishChecks(V, page, errors) {
  const nerr = await page.evaluate(() => (N.errors || []).map((e) => (e && (e.where || '') + ' ' + (e.msg || e.message || '')) || String(e)));
  expect(V.name, errors.length === 0 && nerr.length === 0, 'zero console/page errors and N.err (' + errors.concat(nerr).slice(0, 5).join(' | ') + ')');
}
const RESULT_KEYS = ['id', 'win', 'tie', 'score', 'stars', 'runs', 'wickets', 'overs', 'oppRuns', 'oppWickets', 'oppOvers', 'target', 'fours', 'sixes', 'extras', 'battedFirst', 'tossWon', 'margin', 'reason', 'motm', 'topScorer', 'wagon', 'innings', 'quit', 'aborted', 'attempts', 'time', 'difficulty'];
function checkShape(vp, r, label) {
  const miss = RESULT_KEYS.filter((k) => !(k in (r || {})));
  expect(vp, r && miss.length === 0, label + ': promise resolves with the full result shape' + (miss.length ? ' (missing ' + miss.join(',') + ')' : ''));
  if (!r) return;
  expect(vp, r.id === 'match' && typeof r.win === 'boolean' && Number.isFinite(r.score) && Number.isFinite(r.runs) && Number.isFinite(r.oppRuns), label + ': id/win/score/runs/oppRuns types');
  expect(vp, Array.isArray(r.innings) && r.innings.length === 2 && r.innings.every((i) => Number.isFinite(i.runs) && Array.isArray(i.batting)), label + ': two innings summaries');
  expect(vp, r.motm && typeof r.motm.name === 'string' && r.motm.name.length > 0, label + ': Man of the Match ' + (r.motm && r.motm.name));
  const home = r.innings.find((i) => i.team === r.home), away = r.innings.find((i) => i.team === r.away);
  expect(vp, home && away && home.runs === r.runs && away.runs === r.oppRuns && home.wickets === r.wickets && away.wickets === r.oppWickets, label + ': result totals match the innings (' + r.runs + '/' + r.wickets + ' v ' + r.oppRuns + '/' + r.oppWickets + ')');
  const target = r.innings[1].target;
  const chaserWon = r.innings[1].runs >= target, firstWon = r.innings[1].runs < target - 1;
  const homeWon = r.innings[1].team === r.home ? chaserWon : firstWon;
  expect(vp, r.tie ? r.win === false : r.win === homeWon, label + ': win flag agrees with the scores (' + r.margin + ')');
}

/* ================================================================== B. rules engine */
async function testRules(page) {
  console.log(' -- scoring rules (N.cricketMatch.rules)');
  const R = await page.evaluate(() => {
    const CM = N.cricketMatch, ru = CM.rules;
    const bat = { name: 'A', short: 'A', players: 'abcdefghijk'.split('').map((n) => ({ name: n })) }, bowl = { name: 'B', players: [] };
    const out = {};
    let inn = ru.newInnings(bat, bowl, { overs: 1, wickets: 2 });
    let r = ru.applyBall(inn, { runs: 4, boundary: 4, bowler: 'x' });
    out.four = [inn.runs, inn.fours, inn.balls, inn.cards[0].runs, inn.cards[0].f4];
    r = ru.applyBall(inn, { runs: 6, boundary: 6, bowler: 'x' });
    out.six = [inn.runs, inn.sixes, inn.balls, inn.cards[0].f6];
    r = ru.applyBall(inn, { wide: true, runs: 0, bowler: 'x' });
    out.wide = [inn.runs, inn.wd, inn.balls, inn.over[inn.over.length - 1], inn.figs.x.wd];
    r = ru.applyBall(inn, { nb: true, runs: 1, bowler: 'x', cross: true });
    out.nb = [inn.runs, inn.nb, inn.balls, inn.striker, inn.cards[0].runs];
    r = ru.applyBall(inn, { runs: 1, bowler: 'x', wicket: { kind: 'runout', idx: inn.non, fielder: 'f' }, strikerAfter: inn.striker, nonAfter: inn.non });
    out.runout = [inn.runs, inn.wkts, inn.balls, inn.figs.x.wkts, inn.cards[0].out || inn.cards[1].out, inn.next];
    const st0 = inn.striker;
    r = ru.applyBall(inn, { runs: 0, bowler: 'x' });
    const mid = r.overEnd;
    r = ru.applyBall(inn, { runs: 0, bowler: 'x' });
    r = ru.applyBall(inn, { runs: 0, bowler: 'x' });
    out.overEnd = [mid === false && r.overEnd, inn.balls, inn.overs.length, inn.over.length, inn.striker !== st0];
    // all out: 2 wickets in a fresh innings
    inn = ru.newInnings(bat, bowl, { overs: 3, wickets: 2 });
    ru.applyBall(inn, { runs: 0, bowler: 'y', wicket: { kind: 'bowled' } });
    r = ru.applyBall(inn, { runs: 0, bowler: 'y', wicket: { kind: 'caught', fielder: 'q' } });
    out.allout = [r.inningsEnd, inn.endReason, inn.wkts, inn.figs.y.wkts, inn.catches.q];
    // target chased in the middle of an over
    inn = ru.newInnings(bat, bowl, { overs: 3, wickets: 5, target: 9 });
    ru.applyBall(inn, { runs: 4, boundary: 4, bowler: 'z' });
    r = ru.applyBall(inn, { runs: 6, boundary: 6, bowler: 'z' });
    out.target = [r.inningsEnd, r.targetReached, inn.endReason, inn.runs, ru.need(inn)];
    // overs run out
    inn = ru.newInnings(bat, bowl, { overs: 1, wickets: 5 });
    for (let i = 0; i < 6; i++) r = ru.applyBall(inn, { runs: 1, bowler: 'z', cross: true });
    out.overs = [r.inningsEnd, inn.endReason, inn.balls, ru.oversText(inn.balls)];
    return out;
  });
  const V = 'rules';
  expect(V, JSON.stringify(R.four) === JSON.stringify([4, 1, 1, 4, 1]), 'FOUR: +4 runs, fours+1, one ball, batter credited ' + JSON.stringify(R.four));
  expect(V, JSON.stringify(R.six) === JSON.stringify([10, 1, 2, 1]), 'SIX: +6 runs, sixes+1 ' + JSON.stringify(R.six));
  expect(V, R.wide[0] === 11 && R.wide[1] === 1 && R.wide[2] === 2 && R.wide[3] === 'wd' && R.wide[4] === 1, 'WIDE: +1 extra, not a legal ball, bowler charged ' + JSON.stringify(R.wide));
  expect(V, R.nb[0] === 13 && R.nb[1] === 1 && R.nb[2] === 2, 'NO BALL: +1 extra + runs, not a legal ball ' + JSON.stringify(R.nb));
  expect(V, R.runout[0] === 14 && R.runout[1] === 1 && R.runout[2] === 3 && R.runout[3] === 0 && R.runout[4] === true && R.runout[5] === 3, 'RUN OUT: runs completed count, wicket not credited to the bowler, next batter in ' + JSON.stringify(R.runout));
  expect(V, R.overEnd[0] === true && R.overEnd[1] === 6 && R.overEnd[2] === 1 && R.overEnd[3] === 0 && R.overEnd[4] === true, 'over ends after 6 legal balls (wides/no-balls re-bowled), strike changes ' + JSON.stringify(R.overEnd));
  expect(V, R.allout[0] === true && R.allout[1] === 'allout' && R.allout[2] === 2 && R.allout[3] === 2 && R.allout[4] === 1, 'ALL OUT at the wicket limit, catches recorded ' + JSON.stringify(R.allout));
  expect(V, R.target[0] === true && R.target[1] === true && R.target[2] === 'target' && R.target[4] === 0, 'TARGET CHASED ends the innings at once ' + JSON.stringify(R.target));
  expect(V, R.overs[0] === true && R.overs[1] === 'overs' && R.overs[3] === '1.0', 'overs used up ends the innings ' + JSON.stringify(R.overs));
}

/* ================================================================== A. desktop real-keys match */
async function testDesktopMatch(page, V) {
  const K = kit(page, V);
  console.log(' -- full match with real keyboard + mouse');
  await K.start({ overs: 1, wickets: 3, seed: 20, assist: true, difficulty: 0.25, timeScale: 0.75, forceToss: 'heads' });
  await page.waitForSelector('.mg-card button.primary', { timeout: 8000 });
  await sleep(500);
  await K.shot('howto');
  expect(V.name, await page.locator('.mg-screen[data-mg="match"] .mg-howto').count() === 1, 'how-to card is shown in the match overlay');
  await page.click('.mg-card button.primary'); // real mouse
  expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'toss'; }, null, 20000), 'intro fly-over -> the toss');
  await sleep(400);
  await K.shot('toss');
  await page.keyboard.press('ArrowLeft'); // heads
  expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'toss_choose'; }), 'called heads, won the toss (forced): bat or bowl?');
  await K.shot('toss_won');
  await page.keyboard.press('ArrowLeft'); // bat first
  expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'inn_intro'; }), 'chose to bat: innings intro');
  let s = await K.st();
  expect(V.name, s.inn.team === 'CHIN XI' && s.playerBats && s.tossWon === true, 'Chinnu XI bat first (' + s.inn.team + ')');
  await page.keyboard.press('Space');
  // ---- the batting over
  const plan = ['wide', 'four', 'six', 'runout', null, null, null, null, null, null];
  let k = 0, realShots = 0, shotTaken = false, replaySeen = false, runPressed = 0;
  for (let guard = 0; guard < 14; guard++) {
    if (!(await K.until(() => { const s = N.cricketMatch.debug.state(); return s && ((s.phase === 'ball' && s.bp === 'setup') || s.phase === 'inn_break' || s.phase === 'end'); }, null, 30000))) break;
    s = await K.st();
    if (s.phase !== 'ball' || s.innIdx !== 0) break;
    const before = s.inn, n0 = s.ballLog.length;
    const f = plan[k++] || null;
    if (f) await K.force(f);
    const key = ['ArrowUp', 'ArrowLeft', 'ArrowRight'][k % 3];
    if (f !== 'wide') {
      await K.onArrival(70, () => page.keyboard.press(f ? 'ArrowUp' : key));
      if (!f) realShots++;
      if (!shotTaken) { await sleep(120); await K.shot('batting'); shotTaken = true; }
    }
    // the partner's call: press R (real key) when he shouts YES
    if (!f) {
      const t0 = Date.now();
      while (Date.now() - t0 < 2500) {
        const c = await page.evaluate(() => { const g = N.cricketMatch.debug.game(); const S = g && g.S; return S ? { bp: S.bp, call: S.calls && S.calls.text, act: S.run && S.run.active } : null; });
        if (!c || c.bp !== 'live') { if (c && c.bp === 'dead') break; await sleep(60); continue; }
        if (c.call && /YES|ANOTHER/.test(c.call) && !c.act) { await page.keyboard.press('r'); runPressed++; await sleep(300); continue; }
        await sleep(60);
      }
    }
    if (f === 'six') {
      expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.bp === 'replay'; }, null, 12000), 'SIX -> ACTION REPLAY starts');
      await sleep(700);
      s = await K.st();
      expect(V.name, s.evt && /SIX/.test(s.evt.text), 'the replay is announced in text: "' + (s.evt && s.evt.text) + '"');
      await K.shot('replay');
      replaySeen = true;
    }
    await K.ballDone(n0, 40000);
    s = await K.st();
    const after = s.innings[0], last = s.ballLog[s.ballLog.length - 1];
    if (f === 'wide') expect(V.name, after.wd === before.wd + 1 && after.runs === before.runs + 1 && after.balls === before.balls, 'live WIDE: +1 run, extras+1, ball re-bowled (' + before.runs + '->' + after.runs + ', balls ' + after.balls + ')');
    if (f === 'four') expect(V.name, after.runs === before.runs + 4 && after.fours === before.fours + 1 && after.balls === before.balls + 1 && last.boundary === 4, 'live FOUR: +4, fours+1 (' + before.runs + '->' + after.runs + ')');
    if (f === 'six') expect(V.name, after.runs === before.runs + 6 && after.sixes === before.sixes + 1 && last.boundary === 6, 'live SIX: +6, sixes+1 (' + before.runs + '->' + after.runs + ')');
    if (f === 'runout') expect(V.name, after.wkts === before.wkts + 1 && last.wicket === 'runout' && after.runs >= before.runs, 'live RUN OUT on greedy running: wicket, completed runs kept (' + before.runs + '->' + after.runs + ', ' + last.runs + ' run(s))');
    if (s.phase !== 'ball') break;
  }
  expect(V.name, replaySeen, 'saw an action replay');
  s = await K.st();
  const inputs = s.inputLog || [];
  expect(V.name, realShots >= 1 && inputs.length >= 1, 'real key shots registered by the batting input (' + inputs.length + ': ' + inputs.map((i) => i.dir + '@' + i.t).join(' ') + ')');
  console.log('       real shots ' + realShots + ', run presses ' + runPressed + ', innings 1: ' + JSON.stringify(s.innings[0]));
  expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'inn_break'; }, null, 40000), 'innings break after the over');
  await sleep(300);
  await K.shot('innings_break');
  s = await K.st();
  expect(V.name, s.innings[0].done && (s.innings[0].balls === 6 || s.innings[0].endReason === 'allout'), 'first innings complete (' + s.innings[0].runs + '/' + s.innings[0].wkts + ' in ' + s.innings[0].balls + ' balls, ' + s.innings[0].endReason + ')');
  await page.keyboard.press('Enter');
  // ---- the bowling innings (real keys)
  expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'ball' && s.bp === 'aim'; }, null, 20000), 'second innings: Chinnu XI bowl, aiming');
  s = await K.st();
  expect(V.name, s.playerBowls && s.inn.team === 'ASHK XI' && s.inn.target === s.innings[0].runs + 1, 'target set to first-innings runs + 1 (' + s.inn.target + ')');
  // ball 1: real aim + type + bowl + release
  await page.keyboard.press('Digit3'); // yorker
  await page.keyboard.down('ArrowLeft'); await sleep(160); await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('KeyF'); // change the field
  await sleep(300);
  await K.shot('bowling_aim');
  s = await K.st();
  expect(V.name, s.field !== 'balanced' || s.field === 'balanced', 'field preset ' + s.field);
  const aimType = await page.evaluate(() => N.cricketMatch.debug.game().S.aim.type);
  expect(V.name, aimType === 'yorker', 'Digit3 selects the yorker');
  let n0 = await K.logLen();
  await page.keyboard.press('Space');
  expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.bp === 'runup'; }), 'Space: the bowler runs in, release meter');
  // release near the green
  await page.waitForFunction(() => { const g = N.cricketMatch.debug.game(); return g && g.S.meter >= (g.S.green ? g.S.green.c - 0.06 : 0.66); }, null, { timeout: 8000, polling: 'raf' }).catch(() => {});
  await page.keyboard.press('Space');
  await sleep(150);
  await K.shot('bowling_release');
  // FPV camera toggle (V) while the ball is live
  await page.keyboard.press('KeyV');
  await sleep(250);
  s = await K.st();
  expect(V.name, s.camMode === 'fpv', 'V switches to the first-person (FPV) camera');
  await K.ballDone(n0, 40000);
  // next ball: in FPV, bowler's-eye run-up
  if (await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'ball' && s.bp === 'aim'; }, null, 20000)) {
    await sleep(300);
    await K.shot('bowling_fpv_aim');
    await K.force('bowled');
    n0 = await K.logLen();
    await page.keyboard.press('Space');
    await sleep(500);
    await K.shot('bowling_fpv_runup');
    await page.keyboard.press('Space');
    await K.ballDone(n0, 40000);
    s = await K.st();
    expect(V.name, s.ballLog[s.ballLog.length - 1].wicket === 'bowled', 'forced delivery: BOWLED');
  }
  await page.keyboard.press('KeyV');
  // all out: one more wicket (wickets: 2)
  for (let guard = 0; guard < 6; guard++) {
    if (!(await K.until(() => { const s = N.cricketMatch.debug.state(); return s && ((s.phase === 'ball' && s.bp === 'aim') || s.phase === 'end' || s.gamePhase === 'result'); }, null, 20000))) break;
    s = await K.st();
    if (s.phase !== 'ball') break;
    await K.force('bowled');
    n0 = await K.logLen();
    await page.keyboard.press('Space');
    await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.bp === 'runup'; });
    await sleep(350);
    await page.keyboard.press('Space');
    await K.ballDone(n0, 40000);
  }
  expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.gamePhase === 'result'; }, null, 30000), 'ALL OUT ends the match -> result card');
  s = await K.st();
  expect(V.name, s.innings[1].endReason === 'allout' || s.innings[1].endReason === 'target', 'second innings ended: ' + s.innings[1].endReason + ' (' + s.innings[1].runs + '/' + s.innings[1].wkts + ')');
  await sleep(900);
  await K.shot('result');
  expect(V.name, await page.locator('.mg-card-result .cm-wagon canvas').count() === 1, 'result card has the wagon wheel');
  expect(V.name, await page.locator('.mg-card-result .cm-mom b').count() === 1, 'result card names the Man of the Match: ' + (await page.locator('.mg-card-result .cm-mom b').first().textContent().catch(() => '')));
  const perf = s.perf;
  console.log('       draw ms avg ' + (perf && perf.draw) + ', max ' + (perf && perf.max) + ', static repaints ' + s.bgPaints);
  expect(V.name, perf && perf.draw < 10, 'canvas draw cost per frame is small (avg ' + (perf && perf.draw) + ' ms)');
  await page.click('.mg-card-result button[data-do="done"]');
  const r = await K.result(10000);
  checkShape(V.name, r, 'real-keys match');
  expect(V.name, r && r.battedFirst === true && r.tossWon === true && r.extras && r.extras.got >= 1 && r.sixes >= 1 && r.fours >= 1, 'result records the toss, the wide, the four and the six');
  expect(V.name, await page.evaluate(() => !N.minigames.isOpen() && N.state.mode === 'play' && !document.querySelector('.mg-screen')), 'overlay closed, back in play');
  expect(V.name, await page.evaluate(() => N.flags.lb_match_played === true), 'N.flags.lb_match_played set after a finished match');
}

/* ================================================================== C. modes, autoplay, dressing */
async function testModes(page, V) {
  const K = kit(page, V);
  console.log(' -- registration, chase, all out, pause/quit, busy, autoplay, gully, dressing');
  const reg = await page.evaluate(() => ({ has: N.minigames.has('match'), alias: N.minigames.resolve('lb_match'), list: N.minigames.list().some((g) => g.id === 'match' && g.place === 'lb_stadium') }));
  expect(V.name, reg.has && reg.alias === 'match' && reg.list, 'registered as minigame "match" (alias lb_match, listed at lb_stadium)');
  // chase: target chased -> win
  await K.start({ mode: 'chase', target: 5, overs: 1, wickets: 2, skipHowto: true, timeScale: 2, seed: 4 });
  await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'ball' && s.bp === 'setup'; }, null, 30000);
  let s = await K.st();
  expect(V.name, s.innings[0].synthetic && s.inn.target === 5 && s.playerBats, 'chase mode: opponents\' 4 already on the board, Chinnu XI need 5');
  await K.force('six');
  expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && (s.phase === 'end' || s.gamePhase === 'result'); }, null, 40000), 'a six chases the target down');
  await K.shot('chase_end');
  let r = await K.done(40000);
  expect(V.name, r && r.win === true && r.reason === 'chased' && r.runs >= 5 && r.innings[1].endReason === 'target', 'TARGET CHASED -> win, reason "chased" (' + (r && r.margin) + ')');
  // all out while batting
  await K.start({ batFirst: true, overs: 2, wickets: 1, skipHowto: true, timeScale: 2, seed: 5 });
  await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'ball' && s.bp === 'setup'; }, null, 30000);
  await K.force('bowled');
  expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'inn_break'; }, null, 40000), 'one wicket of one: ALL OUT -> innings break');
  s = await K.st();
  expect(V.name, s.innings[0].endReason === 'allout' && s.innings[0].wkts === 1 && s.innings[0].balls < 12, 'innings over before the overs ran out (' + s.innings[0].endReason + ')');
  // pause -> quit
  await page.keyboard.press('Escape');
  expect(V.name, await page.locator('.mg-card-pause').count() === 1, 'Esc pauses the match');
  await K.shot('pause');
  await page.click('.mg-card-pause button[data-do="quit"]');
  r = await K.result(5000);
  expect(V.name, r && r.quit === true && r.win === false, 'Quit resolves {quit:true, win:false}');
  // busy guard
  await K.start({ skipHowto: true });
  await sleep(300);
  const busy = await page.evaluate(() => N.cricketMatch.start({}));
  expect(V.name, busy && busy.error === 'busy', 'a second start while open -> {error:"busy"}');
  await page.evaluate(() => N.minigames.abort('test'));
  r = await K.result(5000);
  expect(V.name, r && r.aborted === true, 'abort resolves {aborted:true}');
  // autoplay: the built-in bot plays whole matches
  for (const [want, label] of [['win', 'autoplay win'], ['lose', 'autoplay lose']]) {
    const t0 = Date.now();
    await K.start({ autoplay: want, overs: 1, wickets: 3, timeScale: 6, seed: want === 'win' ? 3 : 5 });
    r = await K.result(150000);
    console.log('       ' + label + ': ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s  ' + (r && r.margin) + '  stars ' + (r && r.stars));
    checkShape(V.name, r, label);
    expect(V.name, r && r.win === (want === 'win'), label + ' -> win ' + (r && r.win));
  }
  // gully skin
  await K.start({ venue: 'gully', autoplay: 'win', overs: 1, wickets: 2, timeScale: 4, seed: 9, autoClose: false });
  await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'ball' && s.bp === 'flight'; }, null, 30000);
  await K.shot('gully');
  s = await K.st();
  await page.evaluate(() => N.minigames.abort('test'));
  r = await K.result(5000);
  expect(V.name, s && s.frame && r && r.aborted, 'gully skin (colony ground) plays');
  // the 2D world on match day
  const d = await page.evaluate(async () => {
    N.flags.lb_match = true; N.debug.setTime(19, 30); N.debug.teleport(3840, 2600);
    await new Promise((r) => setTimeout(r, 1200));
    const D = N.cricketMatch.dressing;
    return { built: D.built, parked: D.parked.length, peds: D.peds.length, interact: !!(N.interact.get && N.interact.get('match:lb_stadium')) };
  });
  await K.shot('world_match_day');
  expect(V.name, d.built && d.parked > 20 && d.peds > 10, 'match-day dressing around lb_stadium (' + d.parked + ' parked two-wheelers, ' + d.peds + ' fans at the gates)');
  expect(V.name, d.interact, 'exhibition-match interact registered at the west gate');
  await page.evaluate(() => { N.flags.lb_match = false; N.debug.setTime(16, 40); });
}

/* ================================================================== D. phones (touch) */
async function testPhone(page, V, cdp) {
  const K = kit(page, V, cdp);
  console.log(' -- ' + V.name + ' touch');
  const batFirst = V.name === 'portrait';
  await K.start({ overs: 1, wickets: 2, seed: 8, assist: true, difficulty: 0.25, timeScale: 0.75, forceToss: 'heads' });
  await page.waitForSelector('.mg-card button.primary', { timeout: 8000 });
  await sleep(500);
  await K.shot('howto');
  await K.tapSel('.mg-card button.primary');
  expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'toss'; }, null, 20000), 'tap "Toss karo!" -> the toss');
  await sleep(500);
  await K.shot('toss');
  expect(V.name, await page.locator('.mg-btn[data-a="left"]').count() === 1 && /HEADS/.test(await page.locator('.mg-btn[data-a="left"]').textContent()), 'touch pad shows HEADS / TAILS');
  await K.tapSel('.mg-btn[data-a="left"]');
  expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'toss_choose'; }), 'tapped HEADS: won the toss');
  await sleep(200);
  await K.tapSel(batFirst ? '.mg-btn[data-a="left"]' : '.mg-btn[data-a="right"]');
  expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'inn_intro'; }), (batFirst ? 'BAT' : 'BOWL') + ' first');
  await sleep(700);
  // layout checks
  const L = await page.evaluate(() => {
    const g = N.minigames.game, S = g.S, fr = S.fr;
    const btns = [...document.querySelectorAll('.mg-screen .mg-btn')].map((b) => { const r = b.getBoundingClientRect(); return { a: b.dataset.a, x: r.x, y: r.y, w: r.width, h: r.height }; });
    return { W: innerWidth, H: innerHeight, sw: document.scrollingElement.scrollWidth, fr, btns, top: g.topEl.getBoundingClientRect().bottom };
  });
  const inside = (b) => b.x >= -1 && b.y >= -1 && b.x + b.w <= L.W + 1 && b.y + b.h <= L.H + 1;
  expect(V.name, L.sw <= L.W + 1, 'no horizontal page scroll (' + L.sw + ' <= ' + L.W + ')');
  expect(V.name, L.fr.x >= 0 && L.fr.x + L.fr.w <= L.W + 1 && L.fr.y >= L.top - 1 && L.fr.y + L.fr.h <= L.H + 1, 'broadcast frame letterboxed inside the viewport (' + [L.fr.x, L.fr.y, L.fr.w, L.fr.h].map(Math.round).join(',') + ')');
  expect(V.name, L.btns.length >= 6 && L.btns.every(inside) && L.btns.every((b) => b.w >= 44 && b.h >= 38), L.btns.length + ' pad buttons on screen and finger-sized');
  let overlap = 0;
  for (let i = 0; i < L.btns.length; i++) for (let j = i + 1; j < L.btns.length; j++) { const a = L.btns[i], b = L.btns[j]; if (a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1) overlap++; }
  expect(V.name, overlap === 0, 'pad buttons do not overlap each other');
  if (V.name === 'landscape') {
    const inFrame = L.btns.filter((b) => b.x + b.w > L.fr.x + 4 && b.x < L.fr.x + L.fr.w - 4).length;
    expect(V.name, inFrame === 0, 'landscape: pads sit in the side bars, clear of the 4:3 picture (' + inFrame + ' in the frame)');
  }
  await K.tapSel('.mg-btn[data-a="' + (batFirst ? 'up' : 'go') + '"]'); // continue
  if (batFirst) {
    // ball 1: tap ▲ on time
    await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'ball' && s.bp === 'setup'; }, null, 20000);
    let n0 = await K.logLen();
    const c = await K.center('.mg-btn[data-a="up"]');
    await K.onArrival(90, () => K.touch.tap(c.x, c.y));
    await sleep(150);
    await K.shot('batting');
    await K.ballDone(n0, 40000);
    // ball 2: a swipe across the picture (left)
    await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'ball' && s.bp === 'setup'; }, null, 20000);
    n0 = await K.logLen();
    const fr = (await K.st()).frame;
    await K.onArrival(140, () => K.touch.swipe(fr.x + fr.w * 0.6, fr.y + fr.h * 0.6, fr.x + fr.w * 0.25, fr.y + fr.h * 0.62, 60));
    await sleep(200);
    await K.shot('swipe');
    await K.ballDone(n0, 40000);
    const s = await K.st();
    expect(V.name, (s.inputLog || []).length >= 2, 'touch: a pad tap and a swipe both played shots (' + (s.inputLog || []).map((i) => i.dir + '@' + i.t).join(' ') + ')');
    // LOFT toggle + RUN exist
    await K.tapSel('.mg-btn[data-a="loft"]');
    await sleep(150);
    expect(V.name, await page.locator('.mg-btn[data-a="loft"].cm-on').count() === 1, 'LOFT toggles on (latched for the next shot)');
  } else {
    // bowling: chip YORKER, drag to aim, BOWL, release on the meter
    await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.phase === 'ball' && s.bp === 'aim'; }, null, 20000);
    await K.tapSel('.mg-btn[data-a="t3"]');
    const fr = (await K.st()).frame;
    await K.touch.swipe(fr.x + fr.w * 0.5, fr.y + fr.h * 0.62, fr.x + fr.w * 0.46, fr.y + fr.h * 0.58, 120);
    await sleep(250);
    await K.shot('bowling_aim');
    const A = await page.evaluate(() => { const S = N.cricketMatch.debug.game().S; return { type: S.aim.type, x: S.aim.x, z: S.aim.z }; });
    expect(V.name, A.type === 'yorker', 'YORKER chip selects the delivery (' + A.type + ', aim ' + A.x.toFixed(2) + ',' + A.z.toFixed(2) + ')');
    const n0 = await K.logLen();
    const c = await K.center('.mg-btn[data-a="go"]');
    await K.touch.tap(c.x, c.y);
    expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.bp === 'runup'; }), 'BOWL: run-up with the release meter');
    await page.waitForFunction(() => { const g = N.cricketMatch.debug.game(); return g && g.S.meter >= (g.S.green ? g.S.green.c - 0.08 : 0.64); }, null, { timeout: 8000, polling: 'raf' }).catch(() => {});
    await K.touch.tap(c.x, c.y);
    await sleep(120);
    await K.shot('bowling_release');
    await K.ballDone(n0, 40000);
    const s = await K.st();
    expect(V.name, s.ballLog.length > n0 && s.ballLog[s.ballLog.length - 1].team === 'ASHK XI', 'a delivery bowled by touch (' + s.ballLog[s.ballLog.length - 1].sym + ')');
    // camera pill on the canvas (tap) -> FPV
    const pill = await page.evaluate(() => { const S = N.cricketMatch.debug.game().S; const h = S.hits.find((h) => h.a === 'cam'); const r = N.minigames.game.canvas.getBoundingClientRect(); return h && { x: r.left + h.x + h.w / 2, y: r.top + h.y + h.h / 2 }; });
    if (pill) { await K.touch.tap(pill.x, pill.y); await sleep(400); await K.shot('fpv'); expect(V.name, (await K.st()).camMode === 'fpv', 'tapping the CAM pill switches to FPV'); }
  }
  // pause pill -> quit
  await K.tapSel('.mg-pausebtn');
  await sleep(250);
  expect(V.name, await page.locator('.mg-card-pause').count() === 1, 'pause pill opens the pause card');
  await K.tapSel('.mg-card-pause button[data-do="quit"]');
  const r = await K.result(5000);
  expect(V.name, r && r.quit === true, 'Quit resolves {quit:true}');
  // a whole match on this screen by the bot, to the result card
  await K.start({ autoplay: 'win', overs: 1, wickets: 2, timeScale: 6, seed: 12, autoClose: false });
  expect(V.name, await K.until(() => { const s = N.cricketMatch.debug.state(); return s && s.gamePhase === 'result'; }, null, 150000), 'autoplay match reaches the result card');
  await sleep(900);
  await K.shot('result');
  const card = await page.evaluate(() => { const c = document.querySelector('.mg-card-result'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, sh: c.scrollHeight, ch: c.clientHeight }; });
  expect(V.name, card && card.x >= 0 && card.x + card.w <= L.W + 1, 'result card fits the screen width');
  await K.tapSel('.mg-card-result button[data-do="done"]');
  const r2 = await K.result(8000);
  checkShape(V.name, r2, V.name + ' autoplay');
}

/* ================================================================== runner */
const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1280, height: 720 }, dpr: 1, touch: false },
  { name: 'portrait', viewport: { width: 390, height: 844 }, dpr: 2, touch: true },
  { name: 'landscape', viewport: { width: 844, height: 390 }, dpr: 2, touch: true },
];
(async () => {
  const t0 = Date.now();
  for (const V of VIEWPORTS) {
    const parts = V.name === 'desktop' ? ['rules', 'desktop', 'modes'].filter(want) : [V.name].filter(want);
    if (!parts.length) continue;
    console.log('\n== ' + V.name + ' ' + V.viewport.width + 'x' + V.viewport.height + (V.touch ? ' (touch)' : ''));
    const { browser, page, errors, cdp } = await boot(V);
    try {
      if (parts.includes('rules')) await testRules(page);
      if (parts.includes('desktop')) await testDesktopMatch(page, V);
      if (parts.includes('modes')) await testModes(page, V);
      if (V.touch) await testPhone(page, V, cdp);
    } catch (e) {
      fail(V.name, 'exception: ' + (e && e.stack || e));
      try { await page.screenshot({ path: path.join(OUT, V.name + '_exception.png') }); } catch (e2) { /* ignore */ }
    }
    await finishChecks(V, page, errors);
    await browser.close();
  }
  console.log('\n' + checks + ' checks, ' + failures.length + ' failures, ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
  console.log('ALL CRICKET MATCH TESTS PASSED');
})();
