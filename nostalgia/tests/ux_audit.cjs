/* NOSTALGIA — tests/ux_audit.cjs  (gameplay / UX audit, design/audit/gameplay.md)
 * Regression checks for the controls / HUD / menus fixes of the gameplay audit, in headless Chromium:
 *   hud      the money tin's compact format (₹ 9,99,999) never touches the OSD rows or the MAP / PAUSE pills
 *            (390x844, 320x640, 667x375); speech bubbles stack under the HUD and fade where they overlap it;
 *            pursuer blips are no longer a third of the minimap (size clamp); the empty Chappal Meter has a slot
 *   cb       Settings "Colour-blind blips" really changes the minimap pixels (it used to do nothing)
 *   touch    long ACTION labels ("Start a Chitti Chase") fit the round button; the landscape objective column
 *   prompt   the "E Get off" prompt goes quiet while riding and comes back when stopped; the crowd marker
 *   map      a tap on bare map offers "Route here" for that spot; the GPS route shows on the full map
 *   keys     Settings > Controls: rebind ACTION to K with real key presses (persisted), Esc cancels, Tab refused,
 *            reset; the prompt's key cap follows the binding and a gamepad ("A")
 *   pad      gamepad B goes back in menus (pause / journal)
 *   access   Text size (Large / Larger) scales the objective + dialogue; reduced motion = no camera shake;
 *            Aaram Se (relaxed) difficulty: no bike falls from traffic bumps
 * Fails on any console error / page error / N.err.
 *   node nostalgia/tests/ux_audit.cjs        ONLY=hud,cb,touch,prompt,map,keys,pad,access
 * Screenshots: tests/out/ux_audit/*.png
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'ux_audit');
const URL = 'file://' + path.join(ROOT, 'index.html');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.indexOf(k) >= 0;

const failures = [];
let section = '';
const ok = (msg) => console.log('  ok   ' + msg);
const fail = (msg) => { failures.push('[' + section + '] ' + msg); console.log('  FAIL ' + msg); };
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 400) : '')); return !!cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// game-time waits (a loaded machine only takes longer); frame time while the game clock is stopped (menus)
const GW = () => {
  window.__gw = (secs) => new Promise((res) => {
    let acc = 0, n0 = N.time.now, r0 = N.time.real;
    const t0 = performance.now(), cap = secs * 8000 + 5000;
    (function chk() {
      const dn = N.time.now - n0, dr = N.time.real - r0; n0 = N.time.now; r0 = N.time.real;
      acc += dn > 0 ? dn : dr;
      if (acc >= secs || performance.now() - t0 > cap) res(acc); else requestAnimationFrame(chk);
    })();
  });
};

async function boot(browser, vp, touch, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: vp, deviceScaleFactor: touch ? 2 : 1, hasTouch: !!touch, isMobile: !!touch });
  const page = await context.newPage();
  await page.addInitScript(GW);
  if (opts.pad) {
    await page.addInitScript(() => {
      const pad = { id: 'Test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
      navigator.getGamepads = () => [pad, null, null, null];
      // frame-based taps: the pad is polled once per frame, so a wall-clock 160 ms press can fall between two
      // polls on a loaded machine; hold for 3 frames, release for 3
      const frames = (n) => new Promise((r) => { const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      window.__padTap = async (i) => { pad.buttons[i].pressed = true; pad.buttons[i].value = 1; await frames(3); pad.buttons[i].pressed = false; pad.buttons[i].value = 0; await frames(3); };
    });
  }
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  await page.evaluate(() => { try { localStorage.removeItem('nostalgia.keys.v1'); } catch (e) { /* ignore */ } N.debug.newGame({ skipIntro: true }); N.debug.skipDialogue(true); });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 10000 });
  const gw = (s) => page.evaluate((s) => window.__gw(s), s);
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png'), timeout: 120000 });
  const done = async () => {
    const errs = errors.concat(await page.evaluate(() => (N.debug.errors || []).map((e) => 'N.err ' + e.where + ': ' + String(e.msg).split('\n')[0])).catch(() => []));
    check(errs.length === 0, 'no console / page errors / N.err', errs.slice(0, 5));
    await context.close();
  };
  return { context, page, errors, gw, shot, done };
}
const rectsOverlap = (a, b, pad) => a && b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > (pad || 0) && Math.min(a.b, b.b) - Math.max(a.t, b.t) > (pad || 0);

/* ======================================================================== hud */
async function testHud(browser) {
  section = 'hud';
  console.log('\n== hud: money tin, speech bubbles under the HUD, blip sizes, the Chappal Meter slot');
  for (const [name, vp] of [['portrait', { width: 390, height: 844 }], ['p320', { width: 320, height: 640 }], ['land667', { width: 667, height: 375 }]]) {
    const B = await boot(browser, vp, true);
    const { page, gw } = B;
    await page.evaluate(() => { N.player.money = 99999900; N.debug.setTime(16, 30); N.debug.teleport('abids'); });
    await gw(1.2);
    const r = await page.evaluate(() => {
      const box = (q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
      return { money: document.querySelector('.hud-money .m-val').textContent, tin: box('.hud-money'), row1: box('.osd-row1'), row2: box('.osd-row2'), dist: box('.osd-dist'), map: box('.t-map'), pause: box('.t-pause'), fmt: [N.hud.fmtMoney(1250), N.hud.fmtMoney(99999900), N.hud.fmtMoney(123456789)] };
    });
    check(r.money === '₹ 9,99,999', name + ': the money tin reads ₹ 9,99,999 (Indian grouping, no paise)', r.money);
    check(r.fmt[0] === '₹ 12.50' && r.fmt[1] === '₹ 9,99,999' && r.fmt[2] === '₹ 12,34,567', name + ': fmtMoney keeps paise below ₹1,000 and groups lakhs', r.fmt);
    const hits = ['row1', 'row2', 'dist', 'map', 'pause'].filter((k) => rectsOverlap(r.tin, r[k], 1));
    check(hits.length === 0, name + ': the tin clears the OSD rows and the MAP / PAUSE pills', { hits, tin: r.tin });
    if (name === 'land667') {
      // the objective column has an asymmetric gutter in landscape (used to be 167 px wide at 667 px: 5 lines)
      await page.evaluate(() => N.hud.objective('Take the tiffin box to Nanna at the Secunderabad Clock Tower before 6'));
      await gw(0.3);
      const ob = await page.evaluate(() => { const r = document.querySelector('.hud-obj').getBoundingClientRect(); const lh = parseFloat(getComputedStyle(document.querySelector('.hud-obj')).lineHeight) || 18; return { w: Math.round(r.width), lines: Math.round((r.height - 7) / lh) }; });
      check(ob.w >= 230 && ob.lines <= 3, 'land667: the objective strip is >= 230 px wide and <= 3 lines', ob);
      await page.evaluate(() => N.hud.objective(null));
    }
    if (name === 'portrait') {
      // style.css parses (a stray brace after the HUD-scale block once swallowed the next @media): braces balance
      {
        const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"\n]*"|'[^'\n]*'/g, '""');
        let depth = 0, neg = 0; for (const ch of css) { if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth < 0) { neg++; depth = 0; } } }
        check(depth === 0 && neg === 0 && /--hudz/.test(css) && /\.st-key\s*\{/.test(css), 'style.css: braces balance (no stray "}") and the new rules are there', { depth, neg });
      }
      // speech bubbles: one clamped to the top-left corner sits right on the OSD -> under the HUD and faded
      // a speaker pinned to the view's top-left corner (getters: it follows the camera, so it never leaves the view)
      await page.evaluate(() => { const V = N.render.view; window.__bk = N.dialogue.bark({ get x() { return V.x0 + 30; }, get y() { return V.y0 + 8; } }, 'Pista! Badam! Taaza taaza!', { secs: 8 }); N.dialogue.bark(N.player, 'Hallu!', { secs: 8 }); });
      await gw(0.6);
      const bk = await page.evaluate(() => {
        const host = document.getElementById('barks'), keep = N.hud.keepOutRects();
        const list = [...host.querySelectorAll('.bark')].filter((e) => e.style.visibility !== 'hidden').map((e) => {
          const r = e.getBoundingClientRect();
          const over = keep.some((q) => r.left < q[2] && q[0] < r.right && r.top < q[3] && q[1] < r.bottom);
          return { t: e.textContent.slice(0, 14), over, under: e.classList.contains('under-hud'), op: +getComputedStyle(e).opacity };
        });
        return { z: getComputedStyle(host).zIndex, list, keep: keep.length };
      });
      check(bk.z === '0', 'speech bubbles (#barks) stack under the HUD read-outs', bk.z);
      // dialogue.js now places bubbles clear of N.hud.keepOutRects(); any that still overlap must be faded
      check(bk.list.length >= 2 && bk.list.every((b) => !b.over || (b.under && b.op < 0.5)), 'no speech bubble sits at full strength on a HUD read-out (clamped clear or faded)', bk.list);
      check(bk.list.some((b) => /Hallu/.test(b.t) && !b.under), 'a bubble in the open (over the player) stays fully visible', bk.list);
      check(bk.keep >= 5, 'N.hud.keepOutRects() lists the HUD read-outs', bk.keep);
      await B.shot('hud_portrait_bubbles');
      // pursuer blips: size clamp (wanted.js asked for 4: a red diamond across a third of the minimap)
      await page.evaluate(() => { N.debug.setWanted(3); });
      await gw(2.5);
      const bl = await page.evaluate(() => { const out = []; for (const [id, b] of N.hud.blips) if (/^wanted:/.test(id)) out.push(b.size); return { sizes: out, max: N.hud.BLIP_MAX }; });
      check(bl.sizes.length > 0 && bl.sizes.every((x) => x <= bl.max) && bl.max <= 2.5, 'pursuer blips ask for <= BLIP_MAX (and the HUD clamps any bigger request)', bl);
      await page.evaluate(() => N.wanted.clear('test'));
      await gw(0.4);
      const ch = await page.evaluate(() => { const e = document.querySelector('.hud-chappal'); return { bg: getComputedStyle(e).backgroundColor, aria: e.getAttribute('aria-label') }; });
      check(ch.bg !== 'rgba(0, 0, 0, 0)' && /of 5/.test(ch.aria || ''), 'the empty Chappal Meter has a dark slot and an "N of 5" label', ch);
    }
    await B.shot('hud_' + name);
    await B.done();
  }
}

/* ========================================================================= cb */
async function testCB(browser) {
  section = 'cb';
  console.log('\n== cb: colour-blind blips change the minimap');
  const B = await boot(browser, { width: 1280, height: 720 }, false);
  const { page, gw } = B;
  await page.evaluate(() => { N.debug.setTime(12, 0); N.debug.teleport('abids'); N.traffic.enabled = false; N.traffic.clear(); N.hud.blip('t:green', { x: N.player.x + 150, y: N.player.y }, { color: '#6fbf5a', icon: 'square', size: 2 }); });
  await gw(1);
  await page.setViewportSize({ width: 900, height: 700 });
  await gw(0.4);
  const top = await page.evaluate(() => getComputedStyle(document.querySelector('.hud-top')).top);
  check(top === '100px', 'narrow desktop (900 px): the top column drops below the OSD (the @media rule parses)', top);
  await page.setViewportSize({ width: 1280, height: 720 });
  await gw(0.4);
  const sample = () => page.evaluate(() => {
    // the minimap canvas (never the game canvas): the blip sits 150 u east of the centre
    const c = document.querySelector('.hud-minimap canvas'), g = c.getContext('2d');
    const S = c.width, R = 360; // MM.radius on foot
    const x = Math.round(S / 2 + 150 * (S / (2 * R))), y = Math.round(S / 2);
    const d = g.getImageData(x - 1, y - 1, 3, 3).data;
    let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    return [Math.round(r / 9), Math.round(gg / 9), Math.round(b / 9)];
  });
  const off = await sample();
  check(off[1] > off[0] + 30 && off[1] > off[2] + 30, 'colour-blind off: the green blip is green on the minimap', off);
  await page.evaluate(() => N.settings.set('colorBlind', 'deutan'));
  await gw(0.4);
  const deu = await sample();
  check(deu[2] > deu[1] && deu[2] > deu[0] + 60, 'deutan: the same blip is drawn sky-blue', deu);
  const map = await page.evaluate(() => ({ cls: document.body.classList.contains('cb-deutan'), red: N.hud.blipColor('#ff4a3a'), yel: N.hud.blipColor('#f2c230'), pink: N.hud.blipColor('#ff5fb0'), tri: (N.settings.set('colorBlind', 'tritan'), N.hud.blipColor('#f2c230')), offc: (N.settings.set('colorBlind', 'off'), N.hud.blipColor('#ff4a3a')) }));
  check(map.cls && map.red === '#d55e00' && map.yel === '#f0e442' && map.pink !== '#ff5fb0' && map.tri !== '#f2c230' && map.offc === '#ff4a3a', 'blipColor follows the setting (deutan / tritan / off)', map);
  await B.done();
}

/* ====================================================================== touch */
async function testTouch(browser) {
  section = 'touch';
  console.log('\n== touch: long ACTION labels fit the button');
  const B = await boot(browser, { width: 390, height: 844 }, true);
  const { page, gw } = B;
  await page.evaluate(() => { const A = N.places.abids; N.debug.teleport(A.x + 160, A.y + 220); });
  await gw(0.5);
  for (const t of ['Talk', 'Ride Hero cycle', 'Start a Chitti Chase', 'Chai · hold for the ★ combo']) {
    await page.evaluate((t) => N.interact.add('t:ux', { x: N.player.x, y: N.player.y, r: 40, label: t, priority: 50, use() {} }), t);
    await gw(0.25);
    const r = await page.evaluate(() => { const b = document.querySelector('.t-action .t-txt'); return { txt: b.textContent, cls: document.querySelector('.t-action').className, clipped: b.scrollHeight > b.clientHeight + 1 }; });
    check(r.txt === t && !r.clipped, 'touch ACTION shows "' + t + '" without clipping', r);
  }
  await B.shot('touch_long_label');
  await page.evaluate(() => N.interact.remove('t:ux'));
  await B.done();
}

/* ===================================================================== prompt */
async function testPrompt(browser) {
  section = 'prompt';
  console.log('\n== prompt: "Get off" goes quiet while riding');
  const B = await boot(browser, { width: 1280, height: 720 }, false);
  const { page, gw } = B;
  await page.evaluate(() => { N.traffic.enabled = false; N.traffic.clear(); N.debug.god(true); const R = N.world.roads; let e = null; for (const x of R.edges) if (x.len > 700 && x.kind !== 'path' && (!e || x.len > e.len)) e = x; const A = R.nodes[e.a], Bn = R.nodes[e.b], ang = Math.atan2(Bn.y - A.y, Bn.x - A.x); N.debug.teleport((A.x + Bn.x) / 2, (A.y + Bn.y) / 2); const v = N.vehicles.spawn('hero_cycle', N.player.x, N.player.y, ang, {}); N.vehicles.enter(N.player, v); });
  await gw(0.4);
  const still = await page.evaluate(() => ({ label: N.input.actionLabel, show: document.getElementById('prompt').classList.contains('show') }));
  await page.keyboard.down('KeyW'); await gw(1.4);
  const moving = await page.evaluate(() => ({ sp: Math.round(N.player.vehicle.speed), label: N.input.actionLabel, quiet: N.input.actionQuiet, show: document.getElementById('prompt').classList.contains('show') }));
  await B.shot('prompt_quiet_riding');
  await page.keyboard.up('KeyW'); await page.keyboard.down('KeyS'); await gw(1.0); await page.keyboard.up('KeyS'); await gw(0.6);
  const stopped = await page.evaluate(() => ({ sp: Math.round(Math.abs(N.player.vehicle.speed)), label: N.input.actionLabel, show: document.getElementById('prompt').classList.contains('show') }));
  check(still.label === 'Get off' && still.show, 'standing on the cycle: "E Get off" shows', still);
  check(moving.sp > 40 && moving.label === 'Get off' && moving.quiet && !moving.show, 'riding at speed: the prompt is quiet (no "E Get off" mid-screen)', moving);
  check(stopped.sp < 25 && stopped.show, 'slowed down again: the prompt is back', stopped);
  await page.keyboard.down('KeyW'); await gw(1.0);
  await page.keyboard.press('KeyE'); await gw(0.5); await page.keyboard.up('KeyW');
  check(await page.evaluate(() => !N.player.vehicle), 'ACTION still gets off while the prompt is quiet');
  // in a crowd the "you are here" chevron shows while walking, not only after 2.5 s standing still
  const crowd = await page.evaluate(async () => {
    const T = N.traffic, real = T.inCrowd;
    T.inCrowd = () => true; await window.__gw(0.7); const on = N.player.inCrowd;
    T.inCrowd = () => false; await window.__gw(0.7); const off = N.player.inCrowd;
    T.inCrowd = real;
    return { on, off };
  });
  check(crowd.on === true && crowd.off === false, 'the player marker follows N.traffic.inCrowd (polled twice a second)', crowd);
  await B.done();
}

/* ======================================================================== map */
async function testMap(browser) {
  section = 'map';
  console.log('\n== map: tap a bare spot -> Route here; the route shows on the full map');
  for (const [name, vp, touch] of [['desktop', { width: 1280, height: 720 }, false], ['portrait', { width: 390, height: 844 }, true]]) {
    const B = await boot(browser, vp, touch);
    const { page, gw } = B;
    await page.evaluate(() => N.debug.teleport('home'));
    await gw(0.5);
    if (touch) await page.tap('.t-map'); else await page.keyboard.press('KeyM');
    await page.waitForFunction(() => N.state.mode === 'map', null, { timeout: 5000 }).catch(() => {});
    await sleep(500);
    // find a bare spot: a point with no icon within 14 px (hits list is internal: probe by tapping and reading the card)
    let card = null;
    const pts = touch ? [[300, 300], [80, 520], [320, 640], [200, 230]] : [[860, 300], [700, 600], [150, 150], [420, 640]];
    for (const [x, y] of pts) {
      if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
      await sleep(350);
      card = await page.evaluate(() => { const c = document.querySelector('.mp-card'); return c && !c.hidden ? { txt: c.innerText.replace(/\s+/g, ' ').slice(0, 120), spot: /A spot on the map/.test(c.innerText) } : null; });
      if (card && card.spot) break;
      if (card) { if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); await sleep(250); } // close a sign card, try the next point
    }
    check(card && card.spot && /Route here/.test(card.txt), name + ': a tap on bare map opens a spot card with "Route here"', card);
    const rb = await page.$('.mp-card [data-mc=route]');
    if (rb) { if (touch) await rb.tap(); else await rb.click(); }
    await gw(0.8);
    const r = await page.evaluate(() => ({ wp: N.hud.blips.has('mn:waypoint'), route: (N.hud.route() || []).length, hint: document.querySelector('.mp-hint').textContent }));
    check(r.wp && r.route > 1, name + ': Route here sets the waypoint and a road route', r);
    check(/spot/.test(r.hint), name + ': the map hint mentions tapping a spot', r.hint);
    await B.shot('map_route_' + name);
    // a second tap anywhere closes a card instead of opening another
    if (touch) await page.touchscreen.tap(pts[0][0], pts[0][1]); else await page.mouse.click(pts[0][0], pts[0][1]);
    await sleep(300);
    if (touch) await page.touchscreen.tap(pts[0][0], pts[0][1]); else await page.mouse.click(pts[0][0], pts[0][1]);
    await sleep(300);
    await B.done();
  }
}

/* ======================================================================= keys */
async function testKeys(browser) {
  section = 'keys';
  console.log('\n== keys: Settings > Controls, rebinding with real key presses');
  const B = await boot(browser, { width: 1280, height: 720 }, false);
  const { page, gw } = B;
  await page.keyboard.press('Escape'); await sleep(400);
  await page.click('.dk-key[data-act=settings]'); await sleep(400);
  const rows = await page.evaluate(() => ({ help: !!document.querySelector('.st-row[data-id="controls.help"] .st-help'), keys: document.querySelectorAll('.st-row.st-t-key').length, action: document.querySelector('.st-row[data-id="key.action"] kbd').textContent, textSize: !!document.querySelector('.st-row[data-id=textSize]') }));
  check(rows.help && rows.keys === 12 && rows.action === 'E', 'Settings has a Controls card and 12 key rows (ACTION = E)', rows);
  check(rows.textSize, 'Settings has a Text size row');
  await page.evaluate(() => document.querySelector('.st-row[data-id="controls.help"]').scrollIntoView());
  await B.shot('settings_controls');
  await page.click('.st-row[data-id="key.action"] .st-key'); await sleep(150);
  await page.keyboard.press('KeyK'); await sleep(200);
  let st = await page.evaluate(() => ({ key: N.input.keyFor('action'), K: N.input.KEYMAP.KeyK, E: N.input.KEYMAP.KeyE || null, F: N.input.KEYMAP.KeyF, label: document.querySelector('.st-row[data-id="key.action"] kbd').textContent, stored: localStorage.getItem('nostalgia.keys.v1'), top: N.menus.debugState().top }));
  check(st.key === 'KeyK' && st.K === 'action' && st.E === null && st.F === 'action' && st.label === 'K' && /KeyK/.test(st.stored || '') && st.top === 'settings', 'ACTION -> K: KEYMAP moved, F still works, saved, settings still open', st);
  await page.click('.st-row[data-id="key.horn"] .st-key'); await sleep(150);
  await page.keyboard.press('Escape'); await sleep(200);
  st = await page.evaluate(() => ({ horn: N.input.keyFor('horn'), top: N.menus.debugState().top, cap: !!document.querySelector('.st-row.capturing') }));
  check(st.horn === 'Space' && st.top === 'settings' && !st.cap, 'Esc cancels a key capture without closing Settings', st);
  await page.click('.st-row[data-id="key.horn"] .st-key'); await sleep(150);
  await page.keyboard.press('Tab'); await sleep(200);
  st = await page.evaluate(() => ({ horn: N.input.keyFor('horn'), msg: document.querySelector('.st-row[data-id="key.horn"] .st-h').textContent }));
  check(st.horn === 'Space' && /stays/.test(st.msg), 'Tab (a fixed key) is refused with a note', st);
  // horn onto K: ACTION loses K and falls back to F
  await page.click('.st-row[data-id="key.horn"] .st-key'); await sleep(150);
  await page.keyboard.press('KeyK'); await sleep(200);
  st = await page.evaluate(() => ({ horn: N.input.keyFor('horn'), action: N.input.keyFor('action'), K: N.input.KEYMAP.KeyK, space: N.input.KEYMAP.Space || null }));
  check(st.horn === 'KeyK' && st.K === 'horn' && st.action && st.action !== 'KeyK' && st.space === null, 'a key belongs to one action (horn takes K, ACTION falls back)', st);
  await B.shot('settings_rebound');
  // reset, then a binding survives a reload and works in play
  await page.click('.st-row[data-id="keys.reset"] .st-reset'); await sleep(200);
  st = await page.evaluate(() => ({ action: N.input.keyFor('action'), horn: N.input.keyFor('horn'), stored: localStorage.getItem('nostalgia.keys.v1') }));
  check(st.action === 'KeyE' && st.horn === 'Space' && st.stored === '{}', 'Reset puts every key back', st);
  await page.evaluate(() => N.input.bind('action', 'KeyK'));
  await page.keyboard.press('Escape'); await sleep(300); await page.keyboard.press('Escape'); await sleep(300);
  await page.reload();
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 10000 });
  await page.evaluate(() => { const A = N.places.abids; N.debug.teleport(A.x + 160, A.y + 220); const f = N.world.findFree(N.player.x + 12, N.player.y, 'drive', 10) || { x: N.player.x + 12, y: N.player.y }; N.vehicles.spawn('hero_cycle', f.x, f.y, 0, {}); });
  await gw(0.5);
  const pr = await page.evaluate(() => ({ key: N.input.keyFor('action'), glyph: document.querySelector('#prompt kbd').textContent, label: N.input.actionLabel }));
  await page.keyboard.press('KeyK'); await gw(0.4);
  const rode = await page.evaluate(() => !!N.player.vehicle);
  check(pr.key === 'KeyK' && pr.glyph === 'K' && /Ride/.test(pr.label || '') && rode, 'after a reload ACTION is still K: the prompt shows "K" and K rides the cycle', { pr, rode });
  await page.evaluate(() => { N.input.resetBindings(); try { localStorage.removeItem('nostalgia.keys.v1'); } catch (e) { /* ignore */ } });
  await B.done();
}

/* ======================================================================== pad */
async function testPad(browser) {
  section = 'pad';
  console.log('\n== pad: B goes back in menus; the prompt shows A');
  const B = await boot(browser, { width: 1280, height: 720 }, false, { pad: true });
  const { page, gw } = B;
  await page.evaluate(() => { const A = N.places.abids; N.debug.teleport(A.x + 160, A.y + 220); const f = N.world.findFree(N.player.x + 12, N.player.y, 'drive', 10) || { x: N.player.x + 12, y: N.player.y }; N.vehicles.spawn('hero_cycle', f.x, f.y, 0, {}); });
  await page.evaluate(() => window.__padTap(13)); // any pad input switches the device
  await gw(0.5);
  const g = await page.evaluate(() => ({ dev: N.input.device, glyph: document.querySelector('#prompt kbd').textContent, label: N.input.actionLabel }));
  check(g.dev === 'gamepad' && g.glyph === 'A', 'on a gamepad the prompt key cap reads "A"', g);
  await page.evaluate(() => window.__padTap(4)); await sleep(600); // LB in play: the journal
  let st = await page.evaluate(() => N.menus.debugState().top);
  await page.evaluate(() => window.__padTap(1)); await sleep(500); // B: back
  let st2 = await page.evaluate(() => ({ top: N.menus.debugState().top, mode: N.state.mode }));
  check(st === 'journal' && st2.top === null && st2.mode === 'play', 'LB opens the journal, B closes it', { st, st2 });
  await page.evaluate(() => window.__padTap(9)); await sleep(500); // Start: pause
  st = await page.evaluate(() => N.menus.debugState().top);
  check(st === 'pause', 'Start opens the pause deck', st);
  await page.evaluate(() => window.__padTap(13)); await sleep(250); await page.evaluate(() => window.__padTap(13)); await sleep(250); // d-pad down x2: Journal
  await page.evaluate(() => window.__padTap(0)); await sleep(600); // A
  st = await page.evaluate(() => N.menus.debugState().top);
  await page.evaluate(() => window.__padTap(1)); await sleep(500); // B
  st2 = await page.evaluate(() => N.menus.debugState().top);
  check(st === 'journal' && st2 === 'pause', 'B closes the journal back to the pause deck', { st, st2 });
  await page.evaluate(() => window.__padTap(1)); await sleep(500);
  st = await page.evaluate(() => ({ top: N.menus.debugState().top, mode: N.state.mode }));
  check(st.top === null && st.mode === 'play', 'B on the pause deck resumes the game', st);
  await B.done();
}

/* ===================================================================== access */
async function testAccess(browser) {
  section = 'access';
  console.log('\n== access: text size, reduced motion');
  const B = await boot(browser, { width: 390, height: 844 }, true);
  const { page, gw } = B;
  const z = {};
  for (const sz of ['m', 'l', 'xl']) {
    await page.evaluate((sz) => { N.settings.set('textSize', sz); N.hud.objective('Take the tiffin box to Nanna before 6'); }, sz);
    await gw(0.2);
    z[sz] = await page.evaluate(() => ({ cls: document.body.className.match(/txt-\w+/g) || [], zoom: getComputedStyle(document.querySelector('.hud-obj')).zoom, h: Math.round(document.querySelector('.hud-obj').getBoundingClientRect().height), w: Math.round(document.querySelector('.hud-obj').getBoundingClientRect().right) }));
  }
  check(String(z.m.zoom) === '1' && String(z.l.zoom) === '1.15' && String(z.xl.zoom) === '1.3' && z.xl.h > z.m.h && z.xl.w <= 392, 'Text size scales the objective (1 / 1.15 / 1.3) and it still fits the phone', z);
  await page.evaluate(() => N.dialogue.say('narrator', 'Hyderabad, January 2003. The kites are already up over the terraces.'));
  await gw(0.8);
  const dl = await page.evaluate(() => { const r = document.querySelector('.dlg-box').getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), zoom: getComputedStyle(document.querySelector('.dlg-box')).zoom }; });
  check(String(dl.zoom) === '1.3' && dl.l >= 0 && dl.r <= 392, 'the dialogue box grows with Text size and stays on screen', dl);
  await B.shot('text_xl');
  await page.evaluate(() => { N.dialogue.cancel(); N.settings.set('textSize', 'm'); N.settings.set('reducedMotion', 'on'); });
  await gw(0.3);
  // the drawn camera (camX) = the followed camera (cam.x) + shake, snapped to the pixel grid: a shake shows as a gap
  const shakeGap = () => page.evaluate(() => new Promise((res) => {
    N.render.shake(5, 0.6);
    let gap = 0, n = 0; const R = N.render;
    const tick = () => { gap = Math.max(gap, Math.abs(R.camX - R.cam.x), Math.abs(R.camY - R.cam.y)); if (++n < 12) requestAnimationFrame(tick); else res({ gap: +gap.toFixed(2), rm: document.body.classList.contains('reduced-motion') }); };
    tick();
  }));
  const calm = await shakeGap();
  await page.evaluate(() => N.settings.set('reducedMotion', 'off'));
  await gw(0.7);
  const wild = await shakeGap();
  check(calm.rm && calm.gap < 1 && wild.gap > 1.5, 'reduced motion: a camera shake request does nothing (it shakes with it off)', { calm, wild });
  await page.evaluate(() => N.settings.set('reducedMotion', 'auto'));
  // forgiving falls on Aaram Se (relaxed): a traffic bump never throws him, walls only near top speed
  const falls = await page.evaluate(async () => {
    const wait = (s) => window.__gw(s);
    const trial = async (diff, kind, speed) => {
      N.settings.set('difficulty', diff);
      if (N.player.vehicle) N.vehicles.exit(N.player, true);
      N.player.downT = 0; N.player.controlsLocked = false;
      const v = N.debug.enterVehicle('hero_cycle');
      const other = kind === 'vehicle' ? N.debug.spawnVehicle('ambassador') : null;
      await wait(0.3);
      N.emit('bump', kind === 'wall' ? { a: v, b: null, speed, wall: true, vehicle: v } : { a: v, b: other, speed, vehicle: v });
      const fell = !N.player.vehicle;
      await wait(1.3);
      if (other) N.vehicles.remove(other);
      return fell;
    };
    const out = { normalCar: await trial('normal', 'vehicle', 100), relaxedCar: await trial('relaxed', 'vehicle', 100), relaxedWall90: await trial('relaxed', 'wall', 90), relaxedWall110: await trial('relaxed', 'wall', 110), normalWall90: await trial('normal', 'wall', 90) };
    N.settings.set('difficulty', 'normal');
    return out;
  });
  check(falls.normalCar && falls.normalWall90 && !falls.relaxedCar && !falls.relaxedWall90 && falls.relaxedWall110, 'Aaram Se: no falls from traffic bumps, walls only near top speed (Normal unchanged)', falls);
  await B.done();
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (want('hud')) await testHud(browser);
    if (want('cb')) await testCB(browser);
    if (want('touch')) await testTouch(browser);
    if (want('prompt')) await testPrompt(browser);
    if (want('map')) await testMap(browser);
    if (want('keys')) await testKeys(browser);
    if (want('pad')) await testPad(browser);
    if (want('access')) await testAccess(browser);
  } catch (e) {
    fail('exception: ' + (e.stack || e.message));
  }
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAILED:\n  ' + failures.join('\n  ') : 'ALL PASSED'));
  process.exit(failures.length ? 1 : 0);
})();
