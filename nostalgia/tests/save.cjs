/* NOSTALGIA — tests/save.cjs
 * Headless Chromium (Playwright) tests for save safety (src/save.js + main.js):
 *   newer: a save written by a newer build (v = VERSION + 1) in the main slot, the backup or
 *     the manual copy is never overwritten (autosave, manual save, mission save, forced save,
 *     tab hidden), N.save.tooNew reports it, the title shows a note and the player is toasted;
 *   hide: the game saves silently on visibilitychange (hidden) and on pagehide, once per second;
 *   blocked: no background save during a cutscene, a minigame, a mission, with N.flags.no_save
 *     or on the title screen;
 *   nostorage: without localStorage the hide-save still works (memory) and nothing is "too new";
 *   font: the district card's Telugu subtitle uses 'Noto Sans Telugu' (the font is requested).
 * Fails on any console error / page error / N.errors entry.
 *
 *   node nostalgia/tests/save.cjs        ONLY=newer|hide|blocked|nostorage|font
 */
'use strict';
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';

const failures = [];
let section = '';
const ok = (msg) => console.log('  ok   ' + msg);
const fail = (msg) => { failures.push('[' + section + '] ' + msg); console.log('  FAIL ' + msg); };
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); return !!cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(browser, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  if (opts.noStorage) {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('SecurityError: storage disabled'); } });
    });
  }
  // fake tab visibility: window.__setHidden(true|false) flips document.hidden/visibilityState
  await context.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    window.__setHidden = (h) => { hidden = !!h; document.dispatchEvent(new Event('visibilitychange')); };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.goto(URL);
  await waitTitle(page);
  return { context, page, errors };
}
const waitTitle = (page) => page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 20000 });

async function checkErrors(page, errors, where) {
  const ne = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + e.msg.split('\n')[0]));
  check(errors.length === 0 && ne.length === 0, 'no console/page/engine errors (' + where + ')', { console: errors.slice(0, 5), engine: ne.slice(0, 5) });
}

async function startGame(page) {
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true }); N.debug.setTime(12, 0); N.debug.freezeClock(true);
    window.__saves = 0; N.on('save', () => { window.__saves++; });
  });
  await page.waitForFunction(() => N.state.mode === 'play');
}

/* ===================================================================== newer */
async function newer(browser) {
  section = 'newer';
  console.log('\n== newer-version save is never overwritten');
  const { context, page, errors } = await newPage(browser);
  const slots = [['main', ''], ['backup', '.bak'], ['manual', '.manual']];
  for (const [slot, suffix] of slots) {
    // a valid v1 save in the main slot (except when the main slot itself is the newer one)
    const setup = await page.evaluate((suffix) => {
      const K = N.save.KEY, V = N.save.VERSION;
      localStorage.clear();
      const old = JSON.stringify({ game: 'nostalgia', v: V, t: 1000, meta: { reason: 'booth', day: 0, money: 111 }, data: {} });
      const nw = JSON.stringify({ game: 'nostalgia', v: V + 1, t: 2000, meta: { reason: 'booth', day: 9, money: 999 }, data: { future: { x: 1 } } });
      if (suffix === '') { localStorage.setItem(K, nw); localStorage.setItem(K + '.bak', old); } else { localStorage.setItem(K, old); localStorage.setItem(K + suffix, nw); }
      return { K, nw };
    }, suffix);
    await page.reload();
    await waitTitle(page);
    const t = await page.evaluate(() => {
      const n = document.querySelector('.mn-title .jc-newer');
      return { tooNew: N.save.tooNew, note: n && !n.hidden ? n.textContent : null };
    });
    check(t.tooNew && t.tooNew.slot === slot && t.tooNew.v === 2, slot + ': N.save.tooNew reports the newer save', t.tooNew);
    check(t.note && /newer version/i.test(t.note), slot + ': the title screen tells the player', t.note);
    await startGame(page);
    await sleep(1500); // game:new warning toast
    const r = await page.evaluate(async (suffix) => {
      const K = N.save.KEY;
      const snap = () => [localStorage.getItem(K), localStorage.getItem(K + '.bak'), localStorage.getItem(K + '.manual')];
      const before = snap();
      const toastAfterStart = (document.querySelector('.hud-toasts') || {}).textContent || '';
      const refused = [];
      N.on('save:refused', (e) => refused.push(e.why));
      const res = {
        plain: N.save.save(), manual: N.menus.saveManual(), mission: N.save.save({ reason: 'mission', toast: false }),
        forced: N.save.save({ reason: 'booth', force: true }), auto: N.save.autosave(), allowed: N.save.allowed(),
        canSave: N.menus.canSave(),
      };
      window.__setHidden(true); window.__setHidden(false);
      window.dispatchEvent(new Event('pagehide'));
      await new Promise((r) => setTimeout(r, 300));
      const after = snap();
      return { res, same: JSON.stringify(before) === JSON.stringify(after), before, after, saves: window.__saves, refused,
        toastAfterStart, toast: (document.querySelector('.hud-toasts') || {}).textContent || '' };
    }, suffix);
    check(r.same, slot + ': no slot changed after save / manual save / mission save / forced save / hide / pagehide', { before: r.before, after: r.after });
    check(!r.res.plain && !r.res.manual && !r.res.mission && !r.res.forced && !r.res.auto && r.saves === 0, slot + ': every save call is refused', r.res);
    check(!r.res.allowed.ok && !r.res.canSave.ok && /newer/i.test(r.res.canSave.reason), slot + ': allowed() / menus.canSave() say no', r.res);
    check(r.refused.includes('newer'), slot + ': save:refused {why: "newer"} is emitted', r.refused);
    check(/newer version/i.test(r.toastAfterStart) || /newer version/i.test(r.toast), slot + ': the player is told in a toast', { start: r.toastAfterStart, now: r.toast });
    await page.evaluate(() => { N.game.quitToTitle(); });
  }
  // CONTINUE still plays the older backup; erasing the saves lifts the block
  const c = await page.evaluate(() => {
    const K = N.save.KEY, V = N.save.VERSION;
    localStorage.clear();
    localStorage.setItem(K, JSON.stringify({ game: 'nostalgia', v: V + 1, t: 2, meta: {}, data: {} }));
    localStorage.setItem(K + '.bak', JSON.stringify({ game: 'nostalgia', v: V, t: 1, meta: { money: 7 }, data: { player: { x: 4000, y: 4300, money: 777 } } }));
    const cont = N.game.continueGame();
    const r = { cont, from: N.save.info() && N.save.info().from, money: N.player.money, stillNew: localStorage.getItem(K).indexOf('"v":' + (V + 1)) > 0 };
    N.save.clear(); localStorage.removeItem(K + '.manual');
    r.after = N.save.tooNew; r.saved = N.save.save({ reason: 'mission', toast: false });
    return r;
  });
  check(c.cont && c.from === 'backup' && c.money === 777 && c.stillNew, 'CONTINUE plays the older backup and leaves the newer save alone', c);
  check(c.after === null && c.saved, 'after erasing the saves, saving works again', c);
  await checkErrors(page, errors, 'newer');
  await context.close();
}

/* ===================================================================== hide */
async function hide(browser) {
  section = 'hide';
  console.log('\n== save on tab hidden / pagehide');
  const { context, page, errors } = await newPage(browser);
  await page.evaluate(() => localStorage.clear());
  await startGame(page);
  const a = await page.evaluate(async () => {
    N.player.money = 5150;
    const toasts0 = (document.querySelector('.hud-toasts') || {}).textContent || '';
    window.__setHidden(true);
    const raw = N.save._raw(), o = raw && JSON.parse(raw);
    const r = { saves: window.__saves, money: o && o.data.player.money, reason: o && o.meta.reason, mode: N.state.mode, toast: ((document.querySelector('.hud-toasts') || {}).textContent || '') !== toasts0 && /saved/i.test((document.querySelector('.hud-toasts') || {}).textContent || '') };
    window.dispatchEvent(new Event('pagehide')); // same moment: no second save
    r.savesAfterPagehide = window.__saves;
    window.__setHidden(false);
    return r;
  });
  check(a.saves === 1 && a.money === 5150 && a.reason === 'autosave', 'visibilitychange (hidden) saves the game', a);
  check(a.mode === 'paused', 'and still pauses', a.mode);
  check(!a.toast, 'no toast for the background save');
  check(a.savesAfterPagehide === 1, 'hide + pagehide within a second save once', a);
  await sleep(1100);
  const b = await page.evaluate(() => {
    N.game.resume();
    N.player.money = 6262;
    window.dispatchEvent(new Event('pagehide'));
    const o = JSON.parse(N.save._raw());
    return { saves: window.__saves, money: o.data.player.money };
  });
  check(b.saves === 2 && b.money === 6262, 'pagehide saves the game', b);
  // reload: the hide-save is what CONTINUE plays
  await page.reload();
  await waitTitle(page);
  const c = await page.evaluate(() => { N.game.continueGame(); return N.player.money; });
  check(c === 6262, 'the background save loads after a reload', c);
  await checkErrors(page, errors, 'hide');
  await context.close();
}

/* ===================================================================== blocked */
async function blocked(browser) {
  section = 'blocked';
  console.log('\n== no background save in cutscenes / minigames / no_save');
  const { context, page, errors } = await newPage(browser);
  await page.evaluate(() => localStorage.clear());
  await startGame(page);
  const tryHide = () => page.evaluate(() => {
    const n = window.__saves;
    window.__setHidden(true); window.__setHidden(false);
    window.dispatchEvent(new Event('pagehide'));
    return { saved: window.__saves - n, mode: N.state.mode, raw: !!N.save._raw() };
  });
  // cutscene
  await page.evaluate(() => { window.__cs = N.menus.cutscene([{ type: 'wait', ms: 8000 }], { id: 'save_test' }); });
  await page.waitForFunction(() => N.state.mode === 'cutscene');
  let r = await tryHide();
  check(r.saved === 0 && !r.raw, 'no save while a cutscene plays', r);
  // hiding the tab pauses the cutscene (menus.js): resume, then abort it
  await page.evaluate(() => { if (N.state.mode === 'paused') N.menus.resume(); N.menus.abortCutscene(); });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 8000 });
  await sleep(1100);
  // minigame
  await page.evaluate(() => { N.minigames.play('marbles', { seed: 1 }); });
  await page.waitForFunction(() => N.state.has('minigame') || N.minigames.active, null, { timeout: 8000 });
  r = await tryHide();
  check(r.saved === 0 && !r.raw, 'no save during a minigame', r);
  await page.evaluate(() => N.minigames.abort('test'));
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 8000 });
  await sleep(1100);
  // story flag
  await page.evaluate(() => { N.flags.no_save = true; });
  r = await tryHide();
  check(r.saved === 0 && !r.raw, 'no save with N.flags.no_save', r);
  await page.evaluate(() => { delete N.flags.no_save; N.game.resume(); });
  await sleep(1100);
  // mission running
  await page.evaluate(() => {
    N.missions.register({ id: 'save_test_run', kind: 'side', title: 'Save test', autosave: false, script: () => new Promise(() => {}) });
    N.debug.startMission('save_test_run');
  });
  if (await page.evaluate(() => !!N.missions.active)) {
    r = await tryHide();
    check(r.saved === 0 && !r.raw, 'no save while a mission runs', r);
    await page.evaluate(() => { N.missions.abort(); if (N.state.mode === 'paused') N.game.resume(); });
  } else fail('could not start a test mission');
  await sleep(1100);
  // title
  await page.evaluate(() => N.game.quitToTitle());
  r = await tryHide();
  check(r.saved === 0 && !r.raw, 'no save on the title screen', r);
  await checkErrors(page, errors, 'blocked');
  await context.close();
}

/* ===================================================================== nostorage */
async function noStorage(browser) {
  section = 'nostorage';
  console.log('\n== no localStorage (private mode)');
  const { context, page, errors } = await newPage(browser, { noStorage: true });
  await startGame(page);
  const r = await page.evaluate(() => {
    N.player.money = 4242;
    window.__setHidden(true); window.__setHidden(false);
    const hid = { saves: window.__saves, has: N.save.has(), tooNew: N.save.tooNew, available: N.save.available };
    N.player.money = 1;
    const manual = N.save.save({ toast: false });
    N.player.money = 4343;
    hid.manual = manual; hid.loaded = N.save.load(); hid.money = N.player.money;
    return hid;
  });
  check(!r.available && r.saves === 1 && r.has && r.tooNew === null, 'hide-save goes to memory without localStorage', r);
  check(r.manual && r.loaded && r.money === 1, 'manual save / load still work in memory', r);
  await checkErrors(page, errors, 'nostorage');
  await context.close();
}

/* ===================================================================== font */
async function font(browser) {
  section = 'font';
  console.log('\n== Telugu district subtitle font');
  const { context, page, errors } = await newPage(browser);
  await startGame(page);
  const r = await page.evaluate(async () => {
    N.hud.districtBanner('Charminar', 'చార్మినార్');
    await new Promise((res) => setTimeout(res, 300));
    const s = document.querySelector('.hud-district .d-sub');
    const links = Array.from(document.querySelectorAll('link[rel=stylesheet]')).map((l) => l.href);
    return { text: s && s.textContent, lang: s && s.lang, ff: s && getComputedStyle(s).fontFamily, link: links.find((h) => /fonts\.googleapis\.com/.test(h) && /Noto\+Sans\+Telugu/.test(h)) || null };
  });
  check(r.text === 'చార్మినార్' && /^\s*["']?Noto Sans Telugu["']?\s*,/.test(r.ff || ''), 'subtitle computed font-family starts with Noto Sans Telugu', r);
  check(r.lang === 'te', 'subtitle is marked lang="te"', r.lang);
  check(!!r.link, 'index.html requests Noto Sans Telugu from Google Fonts', r.link);
  await checkErrors(page, errors, 'font');
  await context.close();
}

(async () => {
  const browser = await chromium.launch(process.env.REAL_FONTS && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  const only = process.env.ONLY;
  try {
    if (!only || only === 'newer') await newer(browser);
    if (!only || only === 'hide') await hide(browser);
    if (!only || only === 'blocked') await blocked(browser);
    if (!only || only === 'nostorage') await noStorage(browser);
    if (!only || only === 'font') await font(browser);
  } catch (e) {
    fail('exception: ' + (e.stack || e.message));
  }
  await browser.close();
  console.log('\n' + (failures.length ? 'SAVE FAILED (' + failures.length + '):\n  ' + failures.join('\n  ') : 'SAVE PASSED'));
  process.exit(failures.length ? 1 : 0);
})();
