/* NOSTALGIA — tests/funfair.cjs  (src/funfair.js: NUMAISH stall games, rides, snacks and toys)
 *
 * Numaish evening: N.calendar.set(2003, 1, 20, 19, 30) (20 Jan 2003, the fair is on and open).
 *   desktop  1280x720, keyboard + mouse:
 *            the stalls / carts / rides are in the world with E prompts; RING TOSS from the stall card (E, 1) with the mouse
 *            (aim, hold, release), TIN CANS with the arrows + a held Space, BALLOON DARTS with mouse clicks; each paid through
 *            shops.js; the AI friends play beside you; autoplay wins land prizes in the tin; the Fair challenge totals three
 *            games; the snack cart (candy floss in hand) and the toy cart (bubble blower: E blows bubbles that drift with
 *            N.wind; a balloon; T switches toys); EVERY RIDE ridden from its E prompt with ACTION on the ride: giant wheel (the
 *            group photo at the top goes into the tin), Columbus, merry-go-round, cup and saucer, dashing cars (driven with
 *            the arrow keys), toy train, maut ka kuan (watched from the gallery). Outside the season: no prompts.
 *   phone    390x844 touch: a stall card tapped, balloon darts by tapping balloons, the toy cart tapped, bubbles blown with
 *            the ACTION touch button, the cups ridden and spun with ACTION.
 *   3d       800x500 third person (three.js from vendor/, SwiftShader): the fair's props built, the giant wheel in step,
 *            riding the wheel / Columbus / dashing cars in 3D (rider entities seated at height), bubbles as 3D points,
 *            the toy in hand, JS frame time.
 *   party    (when N.party exists) two pages in one online room (tests/online_mock.cjs): the ring toss challenge with
 *            live tallies across pages and party results; the dashing cars together (A drives into B: a bump; B's car on A's
 *            page follows B's own driving); the giant wheel together (both kids in one gondola, the ghost hidden).
 * Zero console errors / page errors / N.err. Screenshots: tests/out/funfair_*.png
 *   node nostalgia/tests/funfair.cjs       ONLY=desktop|phone|3d|party   SHOTS=0
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
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const SDK_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-compositing'];
const failures = [];
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const check = (c, m) => { if (c) ok(m); else fail(m); return !!c; };
const only = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k);

async function openPage(browser, V, url, conf) {
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.dpr || 1, hasTouch: !!V.touch, isMobile: !!V.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(THREE_CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  if (conf) {
    const SDK_JS = fs.readFileSync(path.join(ROOT, 'vendor/supabase/supabase.js'), 'utf8');
    await page.route(SDK_CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: SDK_JS }));
    await page.addInitScript((c) => { window.NOSTALGIA_ONLINE_CONFIG = c; }, conf);
  }
  await page.goto(url || FILE_URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.evaluate(() => {
    window.__gw = (secs) => new Promise((res) => { let acc = 0, n0 = N.time.now, r0 = N.time.real; const t0 = performance.now(), cap = secs * 8000 + 5000; (function chk() { const dn = N.time.now - n0, dr = N.time.real - r0; n0 = N.time.now; r0 = N.time.real; acc += dn > 0 ? dn : dr; if (acc >= secs || performance.now() - t0 > cap) res(acc); else requestAnimationFrame(chk); })(); });
  });
  const P = { page, context, errors, V };
  P.ev = (fn, arg) => page.evaluate(fn, arg);
  P.gw = (s) => page.evaluate((x) => window.__gw(x), s);
  P.shot = async (n) => { if (process.env.SHOTS === '0') return; await page.screenshot({ path: path.join(OUT, 'funfair_' + n + '.png'), timeout: SHOT_MS }); };
  P.errs = async () => errors.concat(await page.evaluate(() => (N.debug.state().errors || []).map((e) => 'N.err ' + e)).catch(() => []));
  P.until = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 15000, polling: 100 }).then(() => true, () => false);
  return P;
}
async function fairGame(P, o) {
  o = o || {};
  await P.ev((o) => {
    N.debug.newGame({ skipIntro: true });
    N.calendar.set(2003, 1, 20, 19, 30);
    N.debug.freezeClock(true);
    if (N.testing) N.testing.unlimitedMoney = false;
    N.player.money = 20000;
    if (N.dialogue) N.dialogue.skip = true;
    if (N.seasons) N.seasons.set('sankranti', false);
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    window.__buys = []; N.on('shop:buy', (b) => window.__buys.push(b));
    window.__ff = { prize: [], ride: [], photo: 0, bub: 0 };
    N.on('funfair:prize', (e) => window.__ff.prize.push(e.id)); N.on('funfair:ride', (e) => window.__ff.ride.push(e.id + ':' + e.phase)); N.on('funfair:photo', () => window.__ff.photo++); N.on('funfair:bubbles', (e) => { window.__ff.bub += e.n; });
    if (o.rideScale) N.funfair.TUNE.rideScale = o.rideScale;
  }, o);
  await P.until(() => N.state.mode === 'play');
}
/** stand on an E prompt of the fair (teleport next to it) and wait until it is the current interaction */
async function goTo(P, key) {
  const it = await P.ev((k) => { const s = N.interact.get(k); if (!s) return null; N.player.teleport(s.x, s.y + 1.5); return { x: s.x, y: s.y }; }, key);
  if (!it) return false;
  return P.until((k) => N.interact.current && N.interact.current.id === k, key, 20000);
}
/** wait for the stall / cart card; it ignores a pick in its first 150 ms (the E that opened it), so give it a moment */
async function cardUp(P) { const up = await P.until(() => !!document.querySelector('.ff-card')); await P.gw(0.35); return up; }
/** the how-to card takes Enter once it has been up for a moment (minigames.js ignores a key in its first 0.3 s) */
async function howtoEnter(P) {
  if (!(await P.until(() => !!document.querySelector('.mg-card-howto'), null, 20000))) return false;
  for (let i = 0; i < 4; i++) {
    await P.gw(0.5);
    await P.page.keyboard.press('Enter');
    if (await P.until(() => N.minigames.game && N.minigames.game.phase !== 'howto', null, 6000)) return P.until(() => N.minigames.game && N.minigames.game.phase === 'play', null, 20000);
  }
  return false;
}
const S_ = (expr) => `(() => { const g = N.minigames.game; const S = g && g.S; return ${expr}; })()`;
const label = (P) => P.ev(() => { const c = N.interact.current; return c ? (typeof c.label === 'function' ? c.label(N.player) : c.label) : null; });
async function closeResult(P, tap) {
  await P.until(() => !!document.querySelector('.mg-card-result [data-do="done"]'), null, 60000);
  await P.gw(0.3);
  const b = await P.page.locator('.mg-card-result [data-do="done"]').boundingBox();
  if (tap) await tap(b.x + b.width / 2, b.y + b.height / 2); else await P.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  return P.until(() => !N.minigames.isOpen(), null, 8000);
}

/* ================================================================ 2D at night: the middle of the fair reads */
// The rides and stall fronts must read as shapes at night in the 2D view: the painted crowd keeps off their footprints
// and the strips in front of the stall counters, seasons.js's bulb strings over them carry fewer glow sprites in 2D only
// (the 3D view still builds from seasons.js's own list), and the signboards are drawn last (above people and light).
async function night(browser) {
  console.log('\n== 2D night readability 1280x720');
  const P = await openPage(browser, { viewport: { width: 1280, height: 720 } });
  await fairGame(P);
  await P.ev(() => { const S = N.funfair.spots(); N.player.teleport(S.bumper.ix + 4, S.bumper.iy + 14); N.render.camOverride = null; });
  await P.gw(2.5);
  const r = await P.ev(() => {
    const S = N.funfair.spots(), L = N.seasons.layout.numaish(), cr = N.seasons._debug && N.seasons._debug.crowds;
    let people = 0, inside = 0;
    for (const k in cr || {}) if (/^numaish/.test(k)) for (const p of cr[k].people) { people++; if (S.keepOff.some((q) => p.x > q[0] && p.y > q[1] && p.x < q[0] + q[2] && p.y < q[1] + q[3])) inside++; }
    const glows = (arr) => arr.reduce((a, st) => a + Math.ceil((st.n - 1) / (st.radial ? 4 : st.lane ? 3 : 5)), 0);
    const avoidHas = S.keepOff.every((q) => L.avoid.some((a) => a[0] === q[0] && a[1] === q[1] && a[2] === q[2] && a[3] === q[3]));
    return { people, inside, keep: S.keepOff.length, avoidHas, g2: glows(L.strings), g0: glows(L.ffStrings.orig), night: N.render.night };
  });
  check(r.night > 0.5, 'it is night in the 2D view (' + (+r.night).toFixed(2) + ')');
  check(r.avoidHas && r.keep >= 8, 'the crowd avoid list holds our ' + r.keep + ' footprints (stall-front strip, rides with swing room and entrances, carts)');
  check(r.people > 50 && r.inside === 0, 'no fair crowd ped inside a ride footprint or stall-front strip (' + r.people + ' peds, ' + r.inside + ' inside)');
  check(r.g2 < r.g0 * 0.75, 'fewer glow sprites over the middle of the fair in 2D: ' + r.g2 + ' (seasons.js list: ' + r.g0 + ')');
  // the crowd keeps walking: still nobody inside after a while
  await P.gw(6);
  const r2 = await P.ev(() => { const S = N.funfair.spots(), cr = N.seasons._debug.crowds; let inside = 0; for (const k in cr) if (/^numaish/.test(k)) for (const p of cr[k].people) if (S.keepOff.some((q) => p.x > q[0] && p.y > q[1] && p.x < q[0] + q[2] && p.y < q[1] + q[3])) inside++; return inside; });
  check(r2 === 0, 'after 6 s of wandering still no ped inside (' + r2 + ')');
  // signboards on the top layer: count what is queued on 'fx' by the fair this frame
  const lb = await P.ev(() => new Promise((res) => {
    const R = N.render, q0 = R.queue; let n = 0;
    R.queue = function (layer, key, fn) { if (layer === 'fx' && fn && /pixelTextCanvas/.test(String(fn))) n++; return q0.apply(this, arguments); };
    requestAnimationFrame(() => requestAnimationFrame(() => { R.queue = q0; res(n); }));
  }));
  check(lb >= 1, 'the ride and stall signboards are queued on the top (fx) layer: ' + lb + ' batch(es)');
  await P.shot('night_overview');
  await P.ev(() => { const S = N.funfair.spots(); N.render.camOverride = { x: S.cups.x - 22, y: S.cups.y - 14, zoom: 2.4, snap: true }; });
  await P.gw(1.2);
  await P.shot('night_rides_close');
  await P.ev(() => { N.render.camOverride = null; });
  // 3D still builds from seasons.js's own strings
  const s3 = await P.ev(() => { const L = N.seasons.layout.numaish(), v = N.view3d; const a = L.strings.length; N.view3d = { active: true }; let b; try { b = L.strings.length; } finally { N.view3d = v; } return { a, b, orig: L.ffStrings.orig.length }; }).catch(() => null);
  check(s3 && s3.b === s3.orig && s3.a < s3.orig, 'the 3D view reads seasons.js\'s own strings (' + (s3 && s3.b) + '), 2D the thinned ones (' + (s3 && s3.a) + ')');
  const errs = await P.errs();
  check(errs.length === 0, 'night: zero console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await P.context.close();
}

/* ================================================================ desktop: keyboard + mouse */
async function desktop(browser) {
  console.log('\n== desktop 1280x720 (keyboard + mouse)');
  const P = await openPage(browser, { viewport: { width: 1280, height: 720 } });
  await fairGame(P, { rideScale: 3 });
  const base = await P.ev(() => ({ on: N.funfair.on(), open: N.funfair.open(), ia: N.funfair.interacts(), stalls: N.funfair.spots().stalls.length }));
  check(base.on && base.open, 'Numaish is on and open at 19:30 on 20 Jan 2003');
  check(base.ia.length >= 12, 'E prompts in the world: ' + base.ia.length + ' (3 stalls, 2 carts, 7 rides)');
  // ---------------- RING TOSS: the stall card, then the mouse
  check(await goTo(P, 'ff:stall:rings'), 'standing at the ring toss stall: "' + (await label(P)) + '"');
  await P.ev(() => { N.render.camOverride = null; });
  await P.page.keyboard.press('e');
  check(await cardUp(P), 'E opened the stall card');
  await P.shot('stall_card');
  await P.page.keyboard.press('1');
  check(await P.until(() => N.minigames.active === 'ff_rings', null, 8000), '1 paid ₹3 and opened the ring toss');
  check(await P.ev(() => window.__buys.some((b) => b.place === 'nampally_exhibition' && b.item === 'ff_rings' && b.price === 300)), 'shop:buy nampally_exhibition ff_rings ₹3');
  check(await howtoEnter(P), 'Enter on the how-to card started the game');
  await P.until(() => N.minigames.game && N.minigames.game.phase === 'play', null, 20000);
  const rect = await P.ev(() => { const r = document.querySelector('.mg-canvas').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  for (let i = 0; i < 5; i++) {
    // aim with the mouse at a free bottle (its spot on the table), hold, let go when the power fits
    const t = await P.ev(S_(`(() => { const q = S.targets.filter((q) => !q.ringed)[${i % 3}]; const L = S.L, vv = Math.pow(q.v, 0.85), y = L.yNear + (L.yFar - L.yNear) * vv, hw = L.hwNear + (L.hwFar - L.hwNear) * q.v; return { x: L.cx + q.u * hw, y, p: (q.v - 0.08) / 0.98 }; })()`));
    await P.page.mouse.move(rect.x + t.x, rect.y + t.y);
    await P.gw(0.15);
    await P.page.mouse.down();
    await P.until((p) => { const S = N.minigames.game && N.minigames.game.S; return !S || S.power >= p - 0.03 || S.chargeT > 0.72; }, t.p, 5000);
    await P.page.mouse.up();
    if (i === 1) { await P.gw(0.25); await P.shot('rings_flight'); }
    await P.until(S_('!S.fly'), null, 8000);
    await P.gw(0.2);
  }
  const rs = await P.ev(S_('({ left: S.left, score: S.score, ringed: S.targets.filter((q) => q.ringed).length, flat: S.flat.length, rivals: S.rivals.map((r) => r.nick + ":" + r.n) })'));
  check(5 - rs.left >= 3 && rs.ringed + rs.flat >= 1, (5 - rs.left) + ' rings thrown with the mouse: ' + rs.ringed + ' ringers, ' + rs.flat + ' on the table, ' + rs.score + ' points');
  // any ring left (a click lost on a loaded machine): throw it with a held Space so the stall finishes
  for (let k = 0; k < 5 && (await P.ev(S_('S ? S.left : 0'))) > 0; k++) {
    await P.until(S_('!S || !S.fly'), null, 8000);
    await P.page.keyboard.down('Space'); await P.gw(0.3); await P.page.keyboard.up('Space');
    await P.gw(0.3);
  }
  await P.until(() => !!document.querySelector('.mg-card-result'), null, 30000);
  await P.shot('rings_result');
  check(await closeResult(P), 'ring toss result card closed');
  // ---------------- TIN CANS: arrows + a held Space
  await goTo(P, 'ff:stall:cans');
  await P.page.keyboard.press('e');
  await cardUp(P);
  await P.page.keyboard.press('1');
  check(await P.until(() => N.minigames.active === 'ff_cans', null, 8000), 'tin cans opened (₹2)');
  check(await howtoEnter(P), 'Enter on the how-to card started the game');
  await P.until(() => N.minigames.game && N.minigames.game.phase === 'play', null, 20000);
  await P.page.keyboard.down('ArrowDown'); await P.gw(0.35); await P.page.keyboard.up('ArrowDown'); // aim at the bottom row
  for (let i = 0; i < 3; i++) {
    await P.until(S_('!S.ball && !S.cans.some((c) => c.st === "fly")'), null, 8000);
    await P.page.keyboard.down('Space'); await P.gw(0.7); await P.page.keyboard.up('Space');
    if (i === 0) { await P.gw(0.45); await P.shot('cans_hit'); }
    await P.gw(0.5);
  }
  const cs = await P.ev(S_('({ down: S.cans.filter((c) => c.st !== "stand").length, left: S.left, score: S.score })'));
  check((cs.left === 0 || cs.down === 10) && cs.down >= 2, (3 - cs.left) + ' balls (Space held + released): ' + cs.down + ' cans down, ' + cs.score + ' points' + (cs.down === 10 ? ' (all down: the stall ends early)' : ''));
  check(await closeResult(P), 'tin cans result closed');
  // ---------------- BALLOON DARTS: mouse clicks on balloons
  await goTo(P, 'ff:stall:darts');
  await P.page.keyboard.press('e');
  await cardUp(P);
  await P.page.keyboard.press('1');
  check(await P.until(() => N.minigames.active === 'ff_darts', null, 8000), 'balloon darts opened (₹3)');
  check(await howtoEnter(P), 'Enter on the how-to card started the game');
  await P.until(() => N.minigames.game && N.minigames.game.phase === 'play', null, 20000);
  for (let i = 0; i < 5; i++) {
    const b = await P.ev(S_('(() => { const b = S.balloons.filter((q) => !q.popped)[0]; const L = S.L; return { x: L.bx + (b.x - (S.sx - S.ax)) * L.bw, y: L.by + (b.y - (S.sy - S.ay) - 0.02) * L.bh }; })()'));
    await P.page.mouse.click(rect.x + b.x, rect.y + b.y);
    await P.until(S_('!S.fly'), null, 5000);
    await P.gw(0.25);
  }
  const ds = await P.ev(S_('({ pops: S.pops, left: S.left, score: S.score, darts: S.darts.length })'));
  check(ds.darts >= 3, ds.darts + ' darts thrown by clicking: ' + ds.pops + ' pops, ' + ds.score + ' points');
  // a click lost on a loaded machine: the rest with Space so the stall finishes
  for (let k = 0; k < 5 && (await P.ev(S_('S ? S.left : 0'))) > 0; k++) { await P.until(S_('!S || !S.fly'), null, 5000); await P.page.keyboard.press('Space'); await P.gw(0.5); }
  await P.until(() => !!document.querySelector('.mg-card-result'), null, 30000);
  await P.shot('darts_result');
  check(await closeResult(P), 'darts result closed');
  // ---------------- prizes into the tin (autoplay wins) + the Fair challenge
  const pz = await P.ev(() => N.funfair.play('rings', { autoplay: 'win', skipHowto: true, seed: 11 }).then((r) => ({ score: r.score, prizes: r.prizes, rank: r.rank })));
  check(pz.prizes && pz.prizes.length >= 1, 'autoplay ring toss: ' + pz.score + ' points, prize ' + (pz.prizes || []).join(','));
  const tin = await P.ev(() => Array.from(N.tape.tin).filter((t) => /^ff_prize_/.test(t)));
  check(tin.length >= 1, 'the prize is in the tin: ' + tin.join(', '));
  const ch = await P.ev(() => N.funfair.challenge({ autoplay: 'win', skipHowto: true, seed: 5 }).then((r) => ({ total: r.total, games: r.games.map((g) => g.id + ':' + g.score), done: r.done, totals: r.totals })));
  check(ch.done && ch.games.length === 3 && ch.total === ch.games.reduce((s, g) => s + +g.split(':')[1], 0), 'Fair challenge: ' + ch.games.join(' + ') + ' = ' + ch.total + ' (friends ' + JSON.stringify(ch.totals) + ')');
  // ---------------- snack cart: candy floss in hand
  check(await goTo(P, 'ff:cart:snacks'), 'at the snack cart: "' + (await label(P)) + '"');
  await P.page.keyboard.press('e');
  await cardUp(P);
  await P.page.keyboard.press('ArrowDown'); await P.page.keyboard.press('Enter'); // the second row: candy floss
  check(await P.until(() => N.funfair.snack === 'candyfloss', null, 5000), 'candy floss bought (↓ Enter) and held: ' + (await P.ev(() => N.funfair.snack)));
  check(await P.ev(() => window.__buys.some((b) => b.item === 'ff_candyfloss' && b.price === 300)), 'shop:buy ff_candyfloss ₹3');
  await P.ev(() => { N.render.camOverride = { x: N.player.x, y: N.player.y, zoom: 3.2, snap: true }; });
  await P.gw(0.6);
  await P.shot('candyfloss');
  await P.ev(() => { N.render.camOverride = null; N.funfair._debug.TOY.snack = null; });
  // ---------------- toy cart: the bubble blower, bubbles on the wind; a balloon; T switches
  check(await goTo(P, 'ff:cart:toys'), 'at the toy cart: "' + (await label(P)) + '"');
  await P.page.keyboard.press('e');
  await cardUp(P);
  await P.shot('toy_card');
  await P.page.keyboard.press('1');
  check(await P.until(() => N.funfair.toys.held === 'bubbles', null, 5000), 'bubble blower bought (1) and in hand');
  check(await P.ev(() => window.__buys.some((b) => b.item === 'ff_bubbles' && b.price === 500)), 'shop:buy ff_bubbles ₹5');
  await P.ev(() => { if (N.wind && N.wind.force) N.wind.force({ strength: 0.6, dir: 0, gustiness: 0.1 }); N.player.teleport(N.player.x - 30, N.player.y + 20); });
  await P.gw(0.5);
  check(/bubbles/i.test(await label(P) || ''), 'the ACTION prompt reads "' + (await label(P)) + '"');
  await P.page.keyboard.press('e');
  await P.gw(0.3);
  await P.page.keyboard.press('e');
  const b0 = await P.ev(() => ({ n: N.funfair.bubbles(), x: N.funfair._debug.BUB.reduce((s, b) => s + b.x, 0) / Math.max(1, N.funfair._debug.BUB.length), soap: N.player.items.ff_bubbles }));
  check(b0.n >= 8, 'E blew bubbles: ' + b0.n + ' in the air (soap left ' + b0.soap + ')');
  await P.gw(2);
  const b1 = await P.ev(() => ({ n: N.funfair.bubbles(), x: N.funfair._debug.BUB.reduce((s, b) => s + b.x, 0) / Math.max(1, N.funfair._debug.BUB.length) }));
  check(b1.x - b0.x > 6, 'the bubbles drift east on the wind (mean x +' + (b1.x - b0.x).toFixed(1) + ' u in 2 s)');
  await P.ev(() => { N.render.camOverride = { x: N.player.x + 12, y: N.player.y - 6, zoom: 3, snap: true }; });
  await P.gw(0.3);
  await P.shot('bubbles');
  await P.ev(() => { N.render.camOverride = null; if (N.wind && N.wind.force) N.wind.force(null); });
  await goTo(P, 'ff:cart:toys');
  await P.page.keyboard.press('e');
  await cardUp(P);
  await P.page.keyboard.press('2');
  check(await P.until(() => N.funfair.toys.held === 'balloon', null, 5000), 'a balloon on a stick (2) in hand');
  await P.page.keyboard.press('t');
  const held = await P.ev(() => N.funfair.toys.held);
  check(held !== 'balloon', 'T switches the toy (now ' + held + ')');
  await P.ev(() => N.funfair.toys.hold('balloon'));
  // ---------------- every ride from its E prompt; ACTION on the ride
  const rides = ['wheel', 'columbus', 'carousel', 'cups', 'bumper', 'train', 'maut'];
  for (const id of rides) {
    const at = await goTo(P, 'ff:ride:' + id);
    const lab = await label(P);
    check(at, id + ': prompt "' + lab + '"');
    const n0 = await P.ev(() => window.__buys.length);
    await P.page.keyboard.press('e');
    const on = await P.until((id) => N.funfair.rideState() && N.funfair.rideState().id === id, id, 20000);
    const paid = await P.ev((n0) => window.__buys.slice(n0).map((b) => b.item + ':' + b.price).join(','), n0);
    check(on, id + ': E paid (' + paid + ') and boarded');
    if (!on) continue;
    await P.until(() => N.funfair.rideState() && N.funfair.rideState().phase === 'run', null, 8000);
    if (id === 'bumper') {
      // drive the dashing car with the arrow keys
      // (the distance driven is summed along the way: a bump into the fence or a stranger's car can send it back)
      const pos = () => P.ev(() => { const s = N.funfair.rideState(); const r = s && s.riders[0]; return r ? { x: r.x2, y: r.y2 } : null; });
      let last = await pos(), path = 0;
      const step = async () => { const q = await pos(); if (q && last) path += Math.hypot(q.x - last.x, q.y - last.y); last = q || last; };
      await P.page.keyboard.down('ArrowUp'); await P.page.keyboard.down('ArrowLeft');
      for (let k = 0; k < 4; k++) { await P.gw(0.3); await step(); }
      await P.page.keyboard.up('ArrowLeft');
      for (let k = 0; k < 3; k++) { await P.gw(0.25); await step(); }
      await P.page.keyboard.up('ArrowUp');
      check(path > 4, 'dashing car driven with ↑ ←: ' + path.toFixed(1) + ' u driven');
    } else {
      await P.gw(1.2);
    }
    await P.page.keyboard.press('e'); // ACTION on the ride (wave / scream / spin / whistle / clap)
    await P.gw(id === 'wheel' ? 0.2 : 0.8);
    const st = await P.ev(() => N.funfair.rideState());
    const me = st && st.riders.find((r) => r.me);
    check(st && me && (me.h2 > 1 || id === 'bumper'), id + ': riding at seat height ' + (me ? me.h2.toFixed(1) : '?') + ' (2D), player locked: ' + (await P.ev(() => N.player.controlsLocked && N.player.hidden)));
    if (id === 'wheel') { await P.until(() => window.__ff.photo > 0, null, 60000); await P.gw(0.6); }
    await P.shot('ride_' + id);
    check(await P.until(() => !N.funfair.rideState(), null, 90000), id + ': the ride ended');
    check(await P.ev(() => !N.player.hidden && !N.player.controlsLocked && N.player.mode === 'foot'), id + ': back on foot at the exit');
  }
  check(await P.ev(() => N.tape.tin.has('ff_group_photo') && N.funfair.photos().length >= 1), 'the giant wheel group photo is in the tin and the Journal');
  // ---------------- outside the season: nothing offered
  await P.ev(() => { N.calendar.set(2003, 3, 10, 19, 30); });
  await P.gw(0.4);
  const off = await P.ev(() => { const s = N.interact.get('ff:stall:rings'); N.player.teleport(s.x, s.y + 1.5); return N.funfair.on(); });
  await P.gw(0.5);
  check(!off && !(await P.ev(() => N.interact.current && /^ff:/.test(N.interact.current.id || ''))), 'in April (no Numaish) the fair prompts are gone');
  const e = await P.errs();
  check(!e.length, 'desktop: zero errors' + (e.length ? ': ' + e.slice(0, 3).join(' | ') : ''));
  await P.context.close();
}

/* ================================================================ phone: touch */
async function phone(browser) {
  console.log('\n== phone 390x844 (touch)');
  const P = await openPage(browser, { viewport: { width: 390, height: 844 }, touch: true, dpr: 2 });
  await fairGame(P, { rideScale: 3 });
  const cdp = await P.context.newCDPSession(P.page);
  const tap = async (x, y, holdS) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await P.gw(holdS || 0.06); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const center = async (sel) => { const b = await P.page.locator(sel).first().boundingBox(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; };
  const tapSel = async (sel) => { const c = await center(sel); if (!c) return false; await tap(c.x, c.y); return true; };
  // the darts stall card, tapped
  await goTo(P, 'ff:stall:darts');
  check(await tapSel('.t-action'), 'tapped ACTION at the balloon stall');
  check(await cardUp(P), 'stall card on the phone');
  await P.shot('phone_stall_card');
  await tapSel('.ff-row[data-i="0"]');
  check(await P.until(() => N.minigames.active === 'ff_darts', null, 8000), 'tapped "Play balloon darts"');
  await P.until(() => !!document.querySelector('.mg-card-howto'));
  await tapSel('.mg-card-howto [data-do="start"]');
  await P.until(() => N.minigames.game && N.minigames.game.phase === 'play', null, 20000);
  const rect = await P.ev(() => { const r = document.querySelector('.mg-canvas').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  for (let i = 0; i < 5; i++) {
    const b = await P.ev(S_('(() => { const b = S.balloons.filter((q) => !q.popped)[0]; const L = S.L; return { x: L.bx + (b.x - (S.sx - S.ax)) * L.bw, y: L.by + (b.y - (S.sy - S.ay) - 0.02) * L.bh }; })()'));
    await tap(rect.x + b.x, rect.y + b.y);
    await P.until(S_('!S.fly'), null, 5000);
    await P.gw(0.25);
    if (i === 2) await P.shot('phone_darts');
  }
  const ds = await P.ev(S_('({ pops: S.pops, darts: S.darts.length })'));
  check(ds.darts === 5, 'five darts by tapping balloons: ' + ds.pops + ' pops');
  check(await closeResult(P, tap), 'result tapped closed');
  // the toy cart by touch, bubbles with the ACTION button
  await goTo(P, 'ff:cart:toys');
  await tapSel('.t-action');
  await cardUp(P);
  await tapSel('.ff-row[data-i="0"]');
  check(await P.until(() => N.funfair.toys.held === 'bubbles', null, 5000), 'bubble blower bought by tapping');
  await P.ev(() => { N.player.teleport(N.player.x - 30, N.player.y + 20); });
  await P.gw(0.5);
  await tapSel('.t-action');
  check(await P.until(() => N.funfair.bubbles() > 0, null, 4000), 'ACTION touch button blew ' + (await P.ev(() => N.funfair.bubbles())) + ' bubbles');
  check(await P.ev(() => { const e = document.querySelector('.ff-toy'); return !!e && !e.hidden; }), 'the toy button shows on the touch HUD');
  await P.gw(0.8);
  await P.shot('phone_bubbles');
  // the cups: ride + spin with ACTION
  await goTo(P, 'ff:ride:cups');
  await tapSel('.t-action');
  check(await P.until(() => N.funfair.rideState() && N.funfair.rideState().id === 'cups', null, 8000), 'tapped ACTION: riding the cup and saucer');
  await P.until(() => N.funfair.rideState() && N.funfair.rideState().phase === 'run', null, 8000);
  await P.gw(0.4);
  await tapSel('.t-action'); await P.gw(0.7); await tapSel('.t-action');
  check(await P.ev(() => N.funfair._debug.AMB && N.funfair._debug.AMB.cupsS[0] !== 0), 'ACTION spins the cup');
  await P.shot('phone_cups');
  check(await P.until(() => !N.funfair.rideState(), null, 60000), 'cups ride over');
  const e = await P.errs();
  check(!e.length, 'phone: zero errors' + (e.length ? ': ' + e.slice(0, 3).join(' | ') : ''));
  await P.context.close();
}

/* ================================================================ 3D */
async function threeD(browser) {
  console.log('\n== 3D 800x500 (third person, SwiftShader)');
  const P = await openPage(browser, { viewport: { width: 800, height: 500 } });
  // waits here count GAME time (N.time.real): SwiftShader on a busy machine can drop to a frame every few seconds
  const G = (fn, arg, secs) => P.page.evaluate(([src, arg, secs]) => new Promise((res) => {
    const f = new Function('arg', 'return (' + src + ')(arg)'); let acc = 0, r0 = N.time.real; const t0 = performance.now();
    (function chk() { let ok = false; try { ok = !!f(arg); } catch (e) { ok = false; } if (ok) return res(true); const dr = N.time.real - r0; r0 = N.time.real; acc += Math.max(0, dr); if (acc >= secs || performance.now() - t0 > secs * 40000 + 60000) return res(false); requestAnimationFrame(chk); })();
  }), [fn.toString(), arg, secs]);
  await fairGame(P, { rideScale: 6 });
  await P.ev(() => { const s = N.interact.get('ff:stall:cans'); N.player.teleport(s.x, s.y + 4); N.view.set('tps'); });
  check(await P.until(() => N.view3d && N.view3d.active, null, 180000), '3D view active');
  await P.ev(() => { N.view3d.settle && N.view3d.settle(4000); if (N.festivals3d) N.festivals3d.settle(4000); });
  check(await G(() => N.funfair.stats().site, null, 30), 'the fair\'s 3D props are built (' + JSON.stringify(await P.ev(() => N.funfair.stats())) + ')');
  await G(() => !!N.funfair.wheel3D(), null, 20);
  await P.ev(() => N.view3d.setCamera({ yaw: -Math.PI / 2 - 0.4, pitch: 0.35, snap: true }));
  await P.gw(1.0);
  await P.shot('3d_alley');
  // the giant wheel in step: the 3D wheel's angle = the 2D one
  const wa = await P.ev(() => { const w = N.funfair.wheel3D(); return w ? { r: w.rotation.z, a: N.funfair.wheelAngle() } : null; });
  check(wa && Math.abs(wa.r - wa.a) < 1e-6, 'the 3D giant wheel turns in step with the 2D one (' + (wa ? wa.r.toFixed(3) + ' = ' + wa.a.toFixed(3) : 'wheel not streamed in') + ')');
  // rides in 3D
  for (const id of ['wheel', 'columbus', 'bumper']) {
    await P.ev((id) => { const s = N.interact.get('ff:ride:' + id); N.player.teleport(s.x, s.y + 1.5); }, id);
    await G((k) => N.interact.current && N.interact.current.id === k, 'ff:ride:' + id, 10);
    await P.page.keyboard.press('e');
    const on = await G((id) => N.funfair.rideState() && N.funfair.rideState().id === id, id, 10);
    check(on, '3D: E boarded the ' + id);
    if (!on) continue;
    await G(() => N.funfair.rideState() && N.funfair.rideState().phase === 'run', null, 15);
    if (id === 'bumper') { await P.page.keyboard.down('ArrowUp'); await P.gw(1.0); await P.page.keyboard.up('ArrowUp'); }
    else if (id === 'wheel') await G(() => window.__ff.photo > 0, null, 20);
    else await P.gw(2.5);
    const st = await P.ev(() => { const s = N.funfair.rideState(); if (!s) return null; const me = s.riders.find((r) => r.me); return { z: me.z, fol: !!(N.render.follow && N.render.follow.ffRider), cam: N.view3d.engine.camera.position.y }; });
    check(st && st.fol && (id === 'bumper' || st.z > 3), '3D ' + id + ': the camera follows the seated rider' + (st ? ' at height ' + st.z.toFixed(1) + ' (camera y ' + st.cam.toFixed(1) + ')' : ''));
    await P.shot('3d_ride_' + id);
    check(await G(() => !N.funfair.rideState(), null, 40), '3D ' + id + ' over');
  }
  // bubbles + a toy in hand in 3D
  await P.ev(() => { N.funfair.toys.give('bubbles'); const s = N.interact.get('ff:cart:toys'); N.player.teleport(s.x - 25, s.y + 18); });
  await P.gw(0.5);
  await P.page.keyboard.press('e'); await P.gw(0.3); await P.page.keyboard.press('e');
  await G(() => N.funfair.bubbles() > 0 && N.funfair.stats().held3 >= 1, null, 5);
  const b3 = await P.ev(() => ({ n: N.funfair.bubbles(), held3: N.funfair.stats().held3 }));
  check(b3.n > 0 && b3.held3 >= 1, '3D: bubbles in the air (' + b3.n + ') and the blower in Chinnu\'s hand');
  await P.ev(() => N.view3d.setCamera({ yaw: Math.PI / 2, pitch: 0.2, snap: true }));
  await P.gw(0.6);
  await P.shot('3d_bubbles');
  // perf: the fair layer's own share of the frame (the whole frame's JS time depends on how loaded this machine is)
  const perf = await P.ev(() => Object.assign({}, N.view3d.stats(), { ff: N.funfair.stats() }));
  check(perf.ff.layerMs < 2.5, '3D fair layer ' + (perf.ff.layerMs || 0).toFixed(2) + ' ms/frame over ' + perf.ff.layerN + ' frames (site build ' + perf.ff.buildMs + ' ms once; whole frame JS avg ' + (perf.jsAvg || 0).toFixed(1) + ' ms, ' + perf.calls + ' draw calls, machine load ' + require('os').loadavg()[0].toFixed(0) + ')');
  const e = await P.errs();
  check(!e.length, '3D: zero errors' + (e.length ? ': ' + e.slice(0, 3).join(' | ') : ''));
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
  const A = await openPage(browser, { viewport: { width: 960, height: 600 } }, S.url + '#debug', CONF);
  const B = await openPage(browser, { viewport: { width: 960, height: 600 } }, S.url + '#debug', CONF);
  const accept = async () => { check(await B.until(() => !!N.party.invite, null, 15000), 'B got the invite'); await B.page.keyboard.press('y'); };
  try {
    if (!check(await A.ev(() => !!(N.party && N.party.get && N.party.get('fair_rings') && N.party.get('fair_bumper') && N.party.get('fair_wheel') && N.party.get('fair_challenge'))), 'N.party has the fair activities')) return;
    for (const [P, nick, dx] of [[A, 'Ravi', 0], [B, 'Pooja', 10]]) {
      await fairGame(P, { rideScale: 2 });
      await P.ev(([dx]) => { const s = N.interact.get('ff:stall:rings'); N.player.teleport(s.x + dx, s.y + 6); }, [dx]);
      await P.ev((n) => N.online.goOnline().then(() => N.online.setNick(n)), nick);
    }
    const made = await A.ev(() => N.online.createRoom());
    await B.ev((c) => N.online.joinRoom(c), made.code);
    check(await A.until(() => N.online.room && N.online.room.n === 2, null, 15000), 'room ' + made.code + ' with Ravi and Pooja');
    // ---- friends see each other's bubbles and balloons (the room bus)
    await A.ev(() => { N.funfair.toys.give('bubbles'); N.funfair.toys.use(); });
    check(await B.until(() => N.funfair._debug.BUB.some((b) => b.remote), null, 10000), 'B sees the bubbles A blew (' + (await B.ev(() => N.funfair._debug.BUB.filter((b) => b.remote).length)) + ')');
    await A.ev(() => N.funfair.toys.give('balloon'));
    check(await B.until(() => N.entities.all.some((e) => e.kind === 'ghost' && e.balloons && e.balloons.length), null, 12000), 'B sees A\'s balloon on A\'s ghost');
    await B.ev(() => { const g = N.entities.all.find((e) => e.kind === 'ghost'); if (g) N.render.camOverride = { x: g.x, y: g.y, zoom: 3, snap: true }; });
    await B.gw(0.5); await B.shot('party_friend_balloon'); await B.ev(() => { N.render.camOverride = null; });
    await A.ev(() => N.funfair.toys.hold(null));
    // ---- the ring toss challenge: same seed, live tallies, party results
    check((await A.ev(() => N.party.challenge('fair_rings', { autoplay: 'win' }))).ok, 'A challenged the room to the ring toss');
    await accept();
    check(await A.until(() => N.minigames.active === 'ff_rings', null, 30000) && await B.until(() => N.minigames.active === 'ff_rings', null, 30000), 'ring toss open on both pages');
    check(await A.ev(() => N.minigames.game.baseSeed) === await B.ev(() => N.minigames.game.baseSeed), 'the same seed on both pages');
    await A.until(S_('S && S.left <= 2'), null, 60000);
    const tall = await A.ev(S_('S.rivals.map((r) => r.nick + ":" + r.n + (r.remote ? "(live)" : ""))'));
    await A.shot('party_rings_A');
    check(await A.until(() => N.party.last && N.party.last.id === 'fair_rings', null, 90000) && await B.until(() => N.party.last && N.party.last.id === 'fair_rings', null, 90000), 'party results on both pages; A saw ' + tall.join(', '));
    const st = await A.ev(() => N.party.last.standings.map((r) => r.nick + ':' + r.score));
    const bScore = await B.ev(() => { const r = N.party.last.standings.find((q) => q.nick === 'Pooja'); return r && r.score; });
    check(st.length === 2 && bScore != null, 'standings ' + st.join(', '));
    await A.gw(1); await A.shot('party_rings_results');
    await A.ev(() => N.party.closeCards && N.party.closeCards()); await B.ev(() => N.party.closeCards && N.party.closeCards());
    // ---- dashing cars together: A drives into B
    check((await A.ev(() => N.party.challenge('fair_bumper', {}))).ok, 'A challenged the room to the dashing cars');
    await accept();
    check(await A.until(() => N.funfair.rideState() && N.funfair.rideState().id === 'bumper', null, 30000) && await B.until(() => N.funfair.rideState() && N.funfair.rideState().id === 'bumper', null, 30000), 'both in the arena (2 + strangers)');
    await A.until(() => N.funfair.rideState().phase === 'run', null, 15000);
    const bStart = await A.ev(() => { const r = N.funfair.rideState().riders.find((q) => !q.me); return { x: r.x2, y: r.y2 }; });
    // B drives too; A steers at B with the arrow keys and drives into it
    await B.page.keyboard.down('ArrowUp');
    await A.page.keyboard.down('ArrowUp');
    let bumped = false;
    for (let i = 0; i < 40 && !bumped; i++) {
      const d = await A.ev(() => { const s = N.funfair.rideState(); const me = s.riders.find((q) => q.me), o = s.riders.find((q) => !q.me); const want = Math.atan2(o.y2 - me.y2, o.x2 - me.x2); return Math.atan2(Math.sin(want - me.a), Math.cos(want - me.a)); });
      const key = d > 0.15 ? 'ArrowRight' : d < -0.15 ? 'ArrowLeft' : null;
      if (key) { await A.page.keyboard.down(key); await A.gw(Math.min(0.25, Math.abs(d) * 0.3)); await A.page.keyboard.up(key); } else await A.gw(0.15);
      bumped = await A.ev(() => (N.funfair.rideState() || {}).bumps > 0);
    }
    await A.page.keyboard.up('ArrowUp'); await B.page.keyboard.up('ArrowUp');
    const bNow = await A.ev(() => { const r = N.funfair.rideState().riders.find((q) => !q.me); return { x: r.x2, y: r.y2 }; });
    check(Math.hypot(bNow.x - bStart.x, bNow.y - bStart.y) > 3, 'B\'s car moves on A\'s page as B drives (' + Math.hypot(bNow.x - bStart.x, bNow.y - bStart.y).toFixed(1) + ' u)');
    const bumps = await A.ev(() => N.funfair.rideState().bumps) + await B.ev(() => (N.funfair.rideState() || {}).bumps || 0);
    check(bumps > 0 || bumped, 'bumps landed between the friends\' cars: ' + bumps);
    await A.shot('party_bumper_A');
    check(await A.until(() => !N.funfair.rideState(), null, 90000) && await A.until(() => N.party.last && N.party.last.id === 'fair_bumper', null, 60000), 'dashing cars over; party results');
    await A.ev(() => N.party.closeCards && N.party.closeCards()); await B.ev(() => N.party.closeCards && N.party.closeCards());
    // ---- the giant wheel together: one gondola, B's ghost hidden on A's page (B is A's rider)
    check((await A.ev(() => N.party.challenge('fair_wheel', {}))).ok, 'A invited the room onto the giant wheel');
    await accept();
    check(await A.until(() => N.funfair.rideState() && N.funfair.rideState().id === 'wheel', null, 30000), 'both boarding the wheel');
    const gw = await A.ev(() => { const s = N.funfair.rideState(); const g = N.entities.all.filter((e) => e.kind === 'ghost'); return { riders: s.riders.map((r) => r.nick || 'me'), same: new Set(s.riders.map((r) => Math.round(r.x2 / 6))).size <= 2, ghostHidden: g.every((e) => e.hidden) }; });
    check(gw.riders.length === 2 && gw.same && gw.ghostHidden, 'one gondola: ' + gw.riders.join(' + ') + '; Pooja\'s ghost hidden while she sits with Ravi');
    await A.until(() => N.funfair.rideState() && N.funfair.rideState().phase === 'run', null, 15000);
    await A.gw(2);
    await A.shot('party_wheel_A');
    await A.ev(() => N.party.cancel && N.party.cancel('test done'));
    await A.gw(0.5);
    for (const [P, n] of [[A, 'A'], [B, 'B']]) { const e = await P.errs(); check(!e.length, 'party ' + n + ': zero errors' + (e.length ? ': ' + e.slice(0, 3).join(' | ') : '')); }
  } finally {
    await A.context.close(); await B.context.close();
    try { S.srv.close(); } catch (e) { /* ignore */ }
    try { await M.close(); } catch (e) { /* ignore */ }
  }
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (only('night')) await night(browser);
    if (only('desktop')) await desktop(browser);
    if (only('phone')) await phone(browser);
    if (only('3d')) await threeD(browser);
    if (only('party')) await party(browser);
  } catch (e) { fail('crashed: ' + (e.stack || e.message)); }
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAILURE(S):\n  ' + failures.join('\n  ') : 'ALL FUNFAIR CHECKS PASSED'));
  process.exit(failures.length ? 1 : 0);
})();
