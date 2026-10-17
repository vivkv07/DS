/* NOSTALGIA — tests/minigames.cjs
 * Every minigame (src/minigames.js) in headless Chromium, on desktop 1280x720 (keyboard + mouse)
 * and phone portrait 390x844 / landscape 844x390 (CDP touch):
 *   A. open via N.minigames.play(id) -> how-to card (screenshot) -> START (real click/tap) -> drive
 *      the game with REAL input for a few seconds, assert the game reacted (screenshot) -> pause
 *      (Esc / pause pill, screenshot) -> Quit -> promise resolves {quit:true, win:false} and the
 *      overlay + 'minigame' state are gone.
 *   B. params.autoplay 'win' (the built-in test bot) -> result card (screenshot) -> "Aage chalo"
 *      -> promise resolves {win:true, score, stars>=1, ...}.
 *   C. params.autoplay 'lose' -> {win:false}.
 * Also: list()/has()/aliases, unknown id, busy guard, the world-draw skip while covered, side
 * activities on the map, frame rate inside a game, and zero console/page errors or N.err.
 *
 *   node nostalgia/tests/minigames.cjs                  full game (index.html#debug)
 *   LAB=1 node nostalgia/tests/minigames.cjs            staging lab page (no world, faster)
 *   ONLY=desktop|portrait|landscape  IDS=kite,clap      subsets;  QUICK=1 skips phase C on phones
 * Screenshots: nostalgia/tests/out/minigames/<viewport>_<id>_<step>.png
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'minigames');
fs.mkdirSync(OUT, { recursive: true });
const LAB = !!process.env.LAB;
const URL = LAB ? 'file://' + path.join(ROOT, 'staging', 'mg_lab.html') : 'file://' + path.join(ROOT, 'index.html') + '#debug';
const IDS_ALL = ['kite', 'clap', 'brickgame', 'cricket', 'antenna', 'panipuri', 'bargain', 'marbles'];
const IDS = process.env.IDS ? process.env.IDS.split(',') : IDS_ALL;
const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, touch: false },
  { name: 'portrait', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, touch: true },
  { name: 'landscape', viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, touch: true },
].filter((v) => !process.env.ONLY || v.name === process.env.ONLY);

const failures = [];
let checks = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => { checks++; console.log('  ok   ' + m); };
const fail = (vp, m) => { checks++; failures.push('[' + vp + '] ' + m); console.log('  FAIL ' + m); };
const expect = (vp, cond, m) => (cond ? ok(m) : fail(vp, m));

/* ------------------------------------------------------------ input kit */
function inputKit(page, cdp, V) {
  const center = async (sel) => {
    await page.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {});
    const b = await page.locator(sel).first().boundingBox();
    if (!b) throw new Error('no element ' + sel);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const touch = {
    async down(x, y, id) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: id || 1 }] }); },
    async move(x, y, id) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: id || 1 }] }); },
    async up() { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); },
    async tap(x, y) { await touch.down(x, y); await sleep(60); await touch.up(); },
    async hold(x, y, ms) { await touch.down(x, y); await sleep(ms); await touch.up(); },
    async drag(x0, y0, x1, y1, ms) { await touch.down(x0, y0); const n = 8; for (let i = 1; i <= n; i++) { await touch.move(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n); await sleep(ms / n); } await touch.up(); },
  };
  const K = {
    async press(key) { await page.keyboard.press(key); },
    async hold(key, ms) { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); },
  };
  // abstract game action -> device input
  const btn = async (a) => center('.mg-btn[data-a="' + a + '"]');
  return {
    touch, K, center,
    async tapBtn(a) { const c = await btn(a); await touch.tap(c.x, c.y); },
    async holdBtn(a, ms) { const c = await btn(a); await touch.hold(c.x, c.y, ms); },
    async canvasTap(x, y) { if (V.touch) await touch.tap(x, y); else await page.mouse.click(x, y); },
    async canvasDrag(x0, y0, x1, y1, ms) {
      if (V.touch) return touch.drag(x0, y0, x1, y1, ms);
      await page.mouse.move(x0, y0); await page.mouse.down();
      for (let i = 1; i <= 8; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8); await sleep(ms / 8); }
      await page.mouse.up();
    },
  };
}

// per-game real-input scripts + a probe that proves the game reacted
const S_ = (expr) => `(() => { const g = N.minigames.game; const S = g && g.S; return ${expr}; })()`;
const SCRIPTS = {
  async kite(io, V) {
    if (V.touch) { await io.holdBtn('pull', 800); await io.holdBtn('left', 350); await io.holdBtn('pull', 500); }
    else { await io.K.hold('Space', 800); await io.K.hold('ArrowLeft', 350); await io.K.hold('Space', 500); }
  },
  kiteProbe: S_('(S.maxT || 0)'),
  async clap(io, V) { for (let i = 0; i < 4; i++) { if (V.touch) await io.tapBtn('clap'); else await io.K.press('Space'); await sleep(330); } },
  clapProbe: S_('S.clapsTotal || 0'),
  async brickgame(io, V, page) {
    await sleep(1500); // boot animation
    const tapDev = async (a) => { const b = await page.evaluate(S_('(S.btns.find((b) => b.a === "' + a + '") || {})')); await io.touch.tap(b.x, b.y); };
    if (V.touch) { await tapDev('right'); await sleep(150); await tapDev('left'); await sleep(150); await tapDev('rotate'); }
    else { await io.K.press('ArrowRight'); await sleep(150); await io.K.press('ArrowLeft'); await sleep(150); await io.K.press('ArrowUp'); }
    await sleep(1500);
    if (V.touch) { await tapDev('left'); await tapDev('rotate'); await tapDev('right'); }
    else { await io.K.press('ArrowLeft'); await io.K.press('ArrowUp'); await io.K.hold('ArrowDown', 400); }
  },
  brickgameProbe: S_('S.mode === "blocks" ? 1 : 0'),
  async cricket(io, V) {
    await sleep(1150);
    for (const a of ['drive', 'cut']) { if (V.touch) await io.tapBtn(a); else await io.K.press(a === 'drive' ? 'ArrowUp' : 'ArrowRight'); await sleep(2600); }
  },
  cricketProbe: S_('S.swings || 0'),
  async antenna(io, V) {
    if (V.touch) { await io.holdBtn('right', 1000); await io.tapBtn('left'); await io.tapBtn('shoo'); }
    else { await io.K.hold('ArrowRight', 1000); await io.K.press('ArrowLeft'); await io.K.press('Space'); }
  },
  antennaProbe: S_('Math.abs(N.util.angleDiff(S.theta0, S.theta))'),
  async panipuri(io, V) {
    for (let i = 0; i < 4; i++) { await sleep(700); if (V.touch) await io.tapBtn('eat'); else await io.K.press('Space'); }
    if (V.touch) await io.tapBtn('skip'); else await io.K.press('ArrowDown');
  },
  panipuriProbe: S_('S.eaten + S.misses'),
  async bargain(io, V, page) {
    await sleep(1500);
    if (V.touch) { const r = await page.evaluate(S_('S.cardRects[0]')); await io.touch.tap(r.x + r.w / 2, r.y + r.h / 2); }
    else await io.K.press('1');
    await sleep(500);
    if (V.touch) { const vp = page.viewportSize(); await io.touch.tap(vp.width / 2, vp.height * 0.3); } else await io.K.press('Space');
    await sleep(400);
  },
  bargainProbe: S_('S.turns'),
  async marbles(io, V, page) {
    await sleep(300);
    if (V.touch) {
      const p = await page.evaluate(S_('({ x: S.L.cx + S.striker.x * S.L.s, y: S.L.cy + S.striker.y * S.L.s, cy: S.L.cy })'));
      await io.touch.drag(p.x, p.y - 10, p.x + 10, p.y + 90, 400); // drag back (down) = flick up into the ring
    } else { await io.K.hold('ArrowLeft', 250); await io.K.hold('Space', 550); }
    await sleep(600);
  },
  marblesProbe: S_('S.myTurns'),
};

/* ----------------------------------------------------------------- run */
async function run(browser, V) {
  console.log('\n== ' + V.name + ' ' + V.viewport.width + 'x' + V.viewport.height + (V.touch ? ' (touch)' : '') + (LAB ? ' [lab]' : ''));
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.deviceScaleFactor, hasTouch: V.touch, isMobile: V.touch });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed in tests */' }));
  const shot = (n) => page.screenshot({ path: path.join(OUT, V.name + '_' + n + '.png') });
  const io = inputKit(page, cdp, V);

  await page.goto(URL);
  if (LAB) await page.waitForFunction(() => window.N && N.minigames && N.minigames.list().length > 0, null, { timeout: 15000 });
  else {
    await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
    await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); });
    await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 5000 });
    await sleep(300);
  }
  // ---- API surface
  const api = await page.evaluate(() => ({
    ids: N.minigames.list().map((d) => d.id),
    has: N.minigames.has('clap') && N.minigames.has('golconda_clap') && !N.minigames.has('nope'),
    fns: ['play', 'start', 'list', 'register', 'abort', 'isOpen', 'has'].every((k) => typeof N.minigames[k] === 'function'),
    side: (() => { try { let n = 0; const I = N.interact, SIDE = N.minigames.SIDE || []; if (!I || !I.get) return -1; for (const [gid, pl] of [['clap', 'golconda_fateh_darwaza'], ['panipuri', 'gokul_chat'], ['kite', 'home_terrace'], ['antenna', 'home']]) { const si = SIDE.findIndex((s) => s.id === gid); if (si >= 0 && I.get('mg:' + gid + ':' + si + ':' + pl)) n++; } return n; } catch (e) { return -2; } })(),
    // free-roam pay rules (systems_design §2.4): 3 paid wins per game per day, kite ₹10/day cap, Tiger ₹5
    pay: (() => {
      const MG = N.minigames, pl = N.player;
      if (!MG.pay || !pl) return null;
      const m0 = pl.money, S = (id, extra) => Object.assign({ id }, extra || {}), out = {};
      const led = MG.ledger, keep = JSON.stringify(led);
      led.day = null;
      out.cricket = [1, 2, 3, 4].map(() => MG.pay(S('cricket'), { win: true, stars: 2 }, 'playground_1'));
      out.cricket3 = MG.pay(S('marbles'), { win: true, opponent: 'tiger' }, 'playground_14');
      out.kite = [MG.pay(S('kite'), { win: true, cuts: 3 }, 'home_terrace'), MG.pay(S('kite'), { win: false, cuts: 3 }, 'home_terrace')];
      out.loss = MG.pay(S('marbles'), { win: false }, 'playground_1');
      MG.pay(S('bargain', { params: { who: 'auto' } }), { win: false }, 'koti_bus_stand');
      out.off = Object.keys(led.off).length;
      out.delta = pl.money - m0;
      pl.money = m0; Object.assign(led, JSON.parse(keep));
      return out;
    })(),
  }));
  if (!LAB && api.pay) {
    const P = api.pay;
    expect(V.name, P.cricket.join(',') === '200,200,200,0' && P.cricket3 === 500 && P.kite.join(',') === '600,400' && P.loss === 0 && P.off === 1 && P.delta === 600 + 500 + 1000,
      'pay rules: 3 paid wins/day, Tiger ₹5, kite ₹2/cut capped ₹10/day, bargain loss closes the seller (' + JSON.stringify(P) + ')');
  }
  expect(V.name, IDS_ALL.every((i) => api.ids.includes(i)), 'list() has all 8 games: ' + api.ids.join(','));
  expect(V.name, api.has && api.fns, 'has()/aliases + API functions present');
  if (!LAB) expect(V.name, api.side >= 2, 'side activities registered on the map (' + api.side + ' sampled)');
  const unknown = await page.evaluate(() => N.minigames.play('no_such_game'));
  expect(V.name, unknown && unknown.win === false && unknown.error === 'unknown', 'unknown id resolves {win:false, error:"unknown"}');
  await page.evaluate(() => N.errors.splice(0)); // the unknown-id N.err above is expected

  const results = {};
  for (const id of IDS) {
    console.log(' -- ' + id);
    const t0 = Date.now();
    // ================= A. how-to -> real input -> pause -> quit
    await page.evaluate((id) => { window.__mg = 'pending'; N.minigames.play(id, { difficulty: 0.3, seed: 1234 }).then((r) => { window.__mg = r; }); }, id);
    await page.waitForSelector('.mg-card-howto', { timeout: 5000 });
    await sleep(450);
    await shot(id + '_howto');
    const st = await page.evaluate(() => ({ mode: N.state.mode, open: N.minigames.isOpen(), active: N.minigames.active }));
    expect(V.name, st.open && st.active && (LAB || st.mode === 'minigame'), id + ': open, state "minigame"');
    const busy = await page.evaluate(() => N.minigames.play('clap'));
    expect(V.name, busy && busy.error === 'busy', id + ': a second play() while open resolves {error:"busy"}');
    // START with a real click / tap
    if (V.touch) { const c = await io.center('.mg-card button.primary'); await io.touch.tap(c.x, c.y); } else await page.click('.mg-card button.primary');
    await page.waitForFunction(() => N.minigames.game && N.minigames.game.phase === 'play', null, { timeout: 5000 }).catch(() => fail(V.name, id + ': did not reach play phase'));
    if (id === 'kite') await page.evaluate(() => { const g = N.minigames.game; g.S.maxT = 0; const u = g.def.update; g.def.__u = u; g.def.update = function (g2, dt) { u(g2, dt); g2.S.maxT = Math.max(g2.S.maxT || 0, g2.S.me.T); }; });
    const before = await page.evaluate(SCRIPTS[id + 'Probe']);
    await SCRIPTS[id](io, V, page);
    const after = await page.evaluate(SCRIPTS[id + 'Probe']);
    const inputs = await page.evaluate(() => N.minigames.game.inputs || 0);
    const reacted = id === 'kite' ? after > 0.5 : id === 'antenna' ? after > 0.05 : after > before;
    expect(V.name, inputs > 0 && reacted, id + ': real ' + (V.touch ? 'touch' : 'keyboard') + ' input reached the game and it reacted (' + inputs + ' presses, probe ' + (+before).toFixed(2) + ' -> ' + (+after).toFixed(2) + ')');
    if (id === 'kite') await page.evaluate(() => { const g = N.minigames.game; g.def.update = g.def.__u; });
    const covering = await page.evaluate(() => N.minigames.covering);
    expect(V.name, covering === true, id + ': world draw skipped while covered');
    // in-game frame rate (rAF count over 1.5 s)
    const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); })(); }));
    await shot(id + '_play');
    // pause (Esc on desktop, the pause pill on touch) -> quit
    if (V.touch) { const c = await io.center('.mg-pausebtn'); await io.touch.tap(c.x, c.y); } else await page.keyboard.press('Escape');
    await page.waitForSelector('.mg-card-pause', { timeout: 3000 }).then(() => ok(id + ': pause card')).catch(() => fail(V.name, id + ': no pause card'));
    await sleep(250);
    await shot(id + '_pause');
    if (V.touch) { const c = await io.center('.mg-card button[data-do="quit"]'); await io.touch.tap(c.x, c.y); } else await page.click('.mg-card button[data-do="quit"]');
    await page.waitForFunction(() => window.__mg !== 'pending', null, { timeout: 4000 }).catch(() => {});
    const rq = await page.evaluate(() => ({ r: window.__mg, mode: N.state.mode, dom: document.querySelectorAll('.mg-screen').length, open: N.minigames.isOpen() }));
    expect(V.name, rq.r && rq.r.quit === true && rq.r.win === false && rq.r.id === id, id + ': quit resolves {quit:true, win:false}');
    expect(V.name, rq.dom === 0 && !rq.open && (LAB || rq.mode === 'play'), id + ': overlay removed, back to "' + rq.mode + '"');
    console.log('       fps in game: ' + fps);

    // ================= B. autoplay win -> result card -> continue
    await page.evaluate((id) => { window.__mg = 'pending'; N.minigames.play(id, { difficulty: 0.4, seed: 77, autoplay: 'win', timeScale: 4, skipHowto: true, autoClose: false }).then((r) => { window.__mg = r; }); }, id);
    await page.waitForSelector('.mg-card-result', { timeout: 120000 }).catch(() => fail(V.name, id + ': win run never reached the result card'));
    await sleep(900);
    await shot(id + '_result_win');
    if (V.touch) { const c = await io.center('.mg-card button[data-do="done"]'); await io.touch.tap(c.x, c.y); } else await page.click('.mg-card button[data-do="done"]');
    await page.waitForFunction(() => window.__mg !== 'pending', null, { timeout: 4000 }).catch(() => {});
    const rw = await page.evaluate(() => window.__mg);
    const shape = rw && typeof rw === 'object' && rw.id === id && typeof rw.win === 'boolean' && typeof rw.score === 'number' && typeof rw.stars === 'number' && typeof rw.time === 'number' && rw.attempts >= 1 && rw.quit === false;
    expect(V.name, shape, id + ': result shape ' + JSON.stringify(rw).slice(0, 170));
    expect(V.name, rw && rw.win === true && rw.stars >= 1 && rw.score > 0, id + ': autoplay win -> win:true, stars ' + (rw && rw.stars) + ', score ' + (rw && rw.score));
    results[id] = rw;

    // ================= C. autoplay lose (desktop: then "Phir se" retry -> attempt 2 -> abort())
    if (!(process.env.QUICK && V.touch)) {
      const retry = !V.touch;
      await page.evaluate(([id, retry]) => { window.__mg = 'pending'; N.minigames.play(id, { difficulty: 0.4, seed: 5, autoplay: 'lose', timeScale: 6, skipHowto: true, autoClose: !retry }).then((r) => { window.__mg = r; }); }, [id, retry]);
      if (retry) {
        await page.waitForSelector('.mg-card-result', { timeout: 120000 }).catch(() => fail(V.name, id + ': lose run never reached the result card'));
        await sleep(400);
        await shot(id + '_result_lose');
        const lost = await page.evaluate(() => N.minigames.game && N.minigames.game.result);
        expect(V.name, lost && lost.win === false, id + ': autoplay lose -> win:false (' + JSON.stringify(lost).slice(0, 100) + ')');
        await page.click('.mg-card button[data-do="retry"]');
        await page.evaluate(() => { const g = N.minigames.game; g.auto = null; g.timeScale = 1; });
        await sleep(300);
        const again = await page.evaluate(() => ({ phase: N.minigames.game.phase, attempts: N.minigames.game.attempts, card: !!document.querySelector('.mg-card-wrap.show') }));
        expect(V.name, again.attempts === 2 && (again.phase === 'countdown' || again.phase === 'play') && !again.card, id + ': "Phir se" restarts (attempt ' + again.attempts + ', ' + again.phase + ')');
        if (id === 'kite') { // resize mid-game: layout + caches rebuild, no errors
          await page.setViewportSize({ width: 900, height: 620 }); await sleep(600); await shot(id + '_resized');
          await page.setViewportSize(V.viewport); await sleep(300);
        }
        await page.evaluate(() => N.minigames.abort('test'));
        await page.waitForFunction(() => window.__mg !== 'pending', null, { timeout: 4000 }).catch(() => {});
        const ra = await page.evaluate(() => window.__mg);
        expect(V.name, ra && ra.aborted === true && ra.win === false && ra.attempts === 2, id + ': abort() resolves {aborted:true}');
      } else {
        await page.waitForFunction(() => window.__mg !== 'pending', null, { timeout: 120000 }).catch(() => fail(V.name, id + ': lose run never resolved'));
        const rl = await page.evaluate(() => window.__mg);
        expect(V.name, rl && rl.win === false && !rl.quit, id + ': autoplay lose -> win:false (' + JSON.stringify(rl).slice(0, 100) + ')');
      }
    }
    const st2 = await page.evaluate(() => ({ mode: N.state.mode, dom: document.querySelectorAll('.mg-screen').length }));
    expect(V.name, st2.dom === 0 && (LAB || st2.mode === 'play'), id + ': clean after runs (mode ' + st2.mode + ')');
    console.log('       ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  }

  // ---- no page scroll, errors
  const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
  expect(V.name, scroll.sw <= scroll.iw && scroll.sh <= scroll.ih, 'no page scroll ' + JSON.stringify(scroll));
  const nerr = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + e.msg.split('\n')[0]));
  expect(V.name, errors.length === 0 && nerr.length === 0, 'zero console/page errors and N.err (' + errors.concat(nerr).slice(0, 5).join(' | ') + ')');
  await context.close();
  return results;
}

(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  try {
    for (const V of VIEWPORTS) await run(browser, V);
  } catch (e) {
    failures.push('crash: ' + (e.stack || e.message));
    console.log(e);
  }
  await browser.close();
  console.log('\n' + checks + ' checks, ' + failures.length + ' failures, ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
  console.log('ALL MINIGAME TESTS PASSED');
})();
