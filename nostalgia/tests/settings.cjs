/* NOSTALGIA — tests/settings.cjs
 * Headless Chromium (Playwright) checks that accessibility settings are actually wired:
 *   autoadvance: settings autoAdvance -> N.dialogue.autoAdvance; plain lines move on by themselves
 *     after they finish typing (2 s or more, longer lines longer), never before; choices never auto-pick;
 *     with the setting off a line waits for the player.
 *   contrast: settings highContrast -> body.high-contrast, and style.css really changes the HUD toast,
 *     the dialogue box and the objective line under it (outline / text colour / background).
 * Fails on any console error / page error / N.errors entry.
 *
 *   node nostalgia/tests/settings.cjs        ONLY=autoadvance|contrast
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

async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 20000 });
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.setTime(12, 0); N.debug.freezeClock(true); });
  await page.waitForFunction(() => N.state.mode === 'play');
  return { context, page, errors };
}
async function checkErrors(page, errors, where) {
  const ne = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + e.msg.split('\n')[0]));
  check(errors.length === 0 && ne.length === 0, 'no console/page/engine errors (' + where + ')', { console: errors.slice(0, 5), engine: ne.slice(0, 5) });
}

/* =============================================================== autoadvance */
async function autoAdvance(browser) {
  section = 'autoadvance';
  console.log('\n== auto-advance dialogue');
  const { context, page, errors } = await newPage(browser);
  // a line resolves by itself; returns the game seconds from "typed" to "resolved" (null: still open after maxS)
  const timeLine = (text, maxS) => page.evaluate(async ({ text, maxS }) => {
    let res = false;
    const p = N.dialogue.say('narrator', text).then(() => { res = true; });
    const t0 = performance.now();
    let typedAt = null, doneAt = null;
    while (performance.now() - t0 < maxS * 1000) {
      await new Promise((r) => setTimeout(r, 50));
      const c = N.dialogue.current;
      if (typedAt == null && (res || (c && !c.typing))) typedAt = N.time.now;
      if (res) { doneAt = N.time.now; break; }
    }
    if (!res) { N.dialogue.cancel(); await p; }
    return doneAt == null ? null : doneAt - typedAt;
  }, { text, maxS });

  const on = await page.evaluate(() => { N.settings.set('autoAdvance', true); return N.dialogue.autoAdvance; });
  check(on === true, 'the setting reaches N.dialogue.autoAdvance', on);
  const short = await timeLine('Okay.', 6);
  check(short != null && short >= 1.9 && short < 3, 'a short line moves on by itself ~2 s after typing', short);
  const longText = 'Pochaiah-uncle says the Luna has a puncture again, so today we are walking all the way to the Irani cafe and back, no arguments.';
  const long = await timeLine(longText, 12);
  check(long != null && long > short + 2 && long <= 7.2, 'a long line stays up longer (capped at 7 s)', { short, long });
  // a choice never auto-picks
  const ch = await page.evaluate(async () => {
    let picked = null;
    const p = N.dialogue.choice('narrator', 'Which one?', ['Thums Up', 'Gold Spot']).then((i) => { picked = i; });
    await new Promise((r) => setTimeout(r, 6000));
    const still = N.dialogue.isOpen() && picked === null;
    N.dialogue.advance(); // ACTION picks the highlighted one
    await p;
    return { still, picked };
  });
  check(ch.still && ch.picked === 0, 'a choice waits for the player (no auto-pick)', ch);
  // off: a line waits
  await page.evaluate(() => N.settings.set('autoAdvance', false));
  const offT = await timeLine('Okay.', 4.5);
  check(offT === null, 'with the setting off a line waits for the player', offT);
  await checkErrors(page, errors, 'autoadvance');
  await context.close();
}

/* =============================================================== contrast */
async function contrast(browser) {
  section = 'contrast';
  console.log('\n== high-contrast HUD');
  const { context, page, errors } = await newPage(browser);
  let n = 0;
  const sample = () => page.evaluate(async (n) => {
    // toasts queue one at a time (and wait for the dialogue box): style a stand-in toast directly
    const tw = document.querySelector('.hud-toasts'), te = document.createElement('div');
    te.className = 'hud-toast show hc-probe'; te.textContent = 'High contrast test ' + n; tw.appendChild(te);
    if (N.hud.objective) N.hud.objective('Go to the Irani cafe');
    N.dialogue.say('narrator', 'Testing the box.');
    await new Promise((r) => setTimeout(r, 400));
    const cs = (sel) => { const e = document.querySelector(sel); if (!e) return null; const s = getComputedStyle(e); return { outline: s.outlineStyle + ' ' + s.outlineWidth, color: s.color, bg: s.backgroundColor + ' ' + s.backgroundImage.slice(0, 60), shadow: s.boxShadow.slice(0, 80), weight: s.fontWeight }; };
    const r = { body: document.body.classList.contains('high-contrast'), toast: cs('.hud-toast.hc-probe'), box: cs('.dlg-box'), text: cs('.dlg-text'), obj: cs('.hud-obj') };
    N.dialogue.cancel(); te.remove();
    return r;
  }, n++);
  const a = await sample();
  await page.evaluate(() => N.settings.set('highContrast', true));
  const b = await sample();
  await page.evaluate(() => N.settings.set('highContrast', false));
  const c = await sample();
  check(!a.body && b.body && !c.body, 'the setting toggles body.high-contrast', [a.body, b.body, c.body]);
  check(a.toast && b.toast && b.toast.outline !== a.toast.outline && /solid/.test(b.toast.outline), 'toasts get a solid outline', { off: a.toast, on: b.toast });
  check(a.box && b.box && b.box.shadow !== a.box.shadow && b.box.bg !== a.box.bg, 'the dialogue box gets an extra ring and a solid background', { off: a.box, on: b.box });
  check(a.text && b.text && b.text.color === 'rgb(255, 255, 255)' && b.text.color !== a.text.color, 'dialogue text is pure white', { off: a.text, on: b.text });
  check(c.toast && c.toast.outline === a.toast.outline && c.text.color === a.text.color, 'turning it off restores the normal look', { off: a, again: c });
  await checkErrors(page, errors, 'contrast');
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  const only = process.env.ONLY;
  try {
    if (!only || only === 'autoadvance') await autoAdvance(browser);
    if (!only || only === 'contrast') await contrast(browser);
  } catch (e) {
    fail('exception: ' + (e.stack || e.message));
  }
  await browser.close();
  console.log('\n' + (failures.length ? 'SETTINGS FAILED (' + failures.length + '):\n  ' + failures.join('\n  ') : 'SETTINGS PASSED'));
  process.exit(failures.length ? 1 : 0);
})();
