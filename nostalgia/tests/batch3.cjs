/* NOSTALGIA — tests/batch3.cjs  (QA batch 3)
 * Focused regressions, each fails without its fix:
 *   input     two taps of one action inside a single slow frame give two presses; a held key one
 *   train     trainRide() from a cycle leaves him on foot with no hidden cycle
 *   cricket   Chinnu XI has Pappu (not Bunty-anna, 19); shortOf keeps short words; minigame:end flags
 *   curfew    23:00 curfew floor is 0 with no_curfew, a story2 scene, or the Ganesh pandal week
 *   toast     toast(text, ms, {until}) drops stale queued toasts; dropToasts(pred); mission:start
 *             drops item toasts queued in the previous mission
 *   result    an autoplay minigame result card auto-closes at a few fps
 *   bark      a bark pushes out the bark cooldown of NPCs within 40 u
 *   contrast  the J-card Side A track numbers have >= 4.5:1 contrast on the card paper
 *   node nostalgia/tests/batch3.cjs        ONLY=input,train,cricket,curfew,toast,result,bark,contrast
 */
'use strict';
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.indexOf(k) >= 0;
const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, info) => (cond ? ok(msg) : fail(msg + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')));
// game-time waits (see tests/shops.cjs)
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
const gwait = (pg, secs) => pg.evaluate((s) => window.__gw(s), secs);
const fresh = (page) => page.evaluate(() => {
  if (N.shops && N.shops.isOpen()) N.shops.close();
  if (N.minigames && N.minigames.isOpen && N.minigames.isOpen()) N.minigames.abort('test');
  if (N.missions.active) N.missions.abort();
  N.debug.newGame({ skipIntro: true }); N.debug.skipDialogue(true); N.debug.god(true);
  return N.state.mode;
});

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.addInitScript(GW);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });

  /* ------------------------------------------------------------ contrast (title J-card) */
  if (want('contrast')) {
    console.log('\n== J-card track-number contrast');
    const r = await page.evaluate(() => {
      const lum = (c) => {
        const m = c.match(/[\d.]+/g).map(Number);
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
      };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const trk = document.querySelector('.jc-tracks .jc-trk');
      if (!trk) return { err: 'no .jc-trk' };
      const fg = getComputedStyle(trk, '::before').color;
      // the card paper: first ancestor with an opaque background colour (+ the paper tokens)
      let bg = null;
      for (let e = trk; e && e !== document.documentElement; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && !/rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent') { bg = c; break; }
      }
      const tok = (n) => { const d = document.createElement('i'); d.style.color = 'var(' + n + ')'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const bgs = [bg, tok('--mn-paper'), tok('--mn-paper-2')].filter(Boolean);
      return { fg, bgs, min: Math.min.apply(null, bgs.map((b) => ratio(fg, b))) };
    });
    check(r.min >= 4.5, 'track number "A1" contrast ' + (r.min || 0).toFixed(2) + ':1 >= 4.5:1', r);
  }

  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.skipDialogue(true); });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 8000 });

  /* ------------------------------------------------------------------ input */
  if (want('input')) {
    console.log('\n== input: presses inside one slow frame');
    await fresh(page);
    const r = await page.evaluate(() => {
      // all synchronous: no rAF runs in between, as in one long frame
      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
      const count = (n) => { let c = 0; for (let i = 0; i < n; i++) { N.input.update(1 / 60); if (N.input.pressed('journal')) c++; } return c; };
      N.input.update(1 / 60);
      key('keydown', 'KeyJ'); key('keyup', 'KeyJ'); key('keydown', 'KeyJ'); key('keyup', 'KeyJ');
      const taps = count(4);
      key('keydown', 'KeyJ');
      const held = count(4);
      key('keyup', 'KeyJ'); N.input.update(1 / 60);
      return { taps, held };
    });
    check(r.taps === 2, 'two taps in one frame -> 2 presses (got ' + r.taps + ')', r);
    check(r.held === 1, 'a held key -> exactly 1 press (got ' + r.held + ')', r);
  }

  /* ------------------------------------------------------------------ train */
  if (want('train')) {
    console.log('\n== trainRide from a cycle');
    await fresh(page);
    const r = await page.evaluate(async () => {
      N.debug.teleport('ntr_gardens');
      const v = N.debug.enterVehicle('hero_cycle');
      const was = !!(N.player.vehicle && N.player.vehicle === v);
      N.shops.trainRide('ntr_gardens', { secs: 1.5 });
      const during = { veh: !!N.player.vehicle, hidden: !!N.player.hidden, driver: !!(v && v.driver === N.player) };
      await __gw(0.3);
      N.shops.debug.endRide();
      await __gw(0.3);
      return { was, during, after: { veh: !!N.player.vehicle, hidden: !!N.player.hidden, locked: !!N.player.controlsLocked } };
    });
    check(r.was, 'he was riding the cycle', r);
    check(!r.during.veh && !r.during.driver, 'on the train: no hidden cycle under him', r);
    check(!r.after.veh && !r.after.hidden && !r.after.locked, 'after the ride: on foot, visible, free', r);
  }

  /* ---------------------------------------------------------------- cricket */
  if (want('cricket')) {
    console.log('\n== cricket: Chinnu XI, shortOf, flags');
    await fresh(page);
    const r = await page.evaluate(() => {
      const CM = N.cricketMatch;
      const names = CM.TEAMS.chinnu_xi.players.map((p) => p.name);
      const out = { names, pintu: CM.shortOf('Pintu XI'), chinnu: CM.shortOf('Chinnu XI'), long: CM.shortOf('Nallakunta Strikers') };
      delete N.flags.lb_match_played; delete N.flags.lb_match_won;
      N.emit('minigame:end', { id: 'match', result: { id: 'match', win: false, quit: false, aborted: false } });
      out.lose = { played: N.flags.lb_match_played, won: N.flags.lb_match_won };
      N.emit('minigame:end', { id: 'match', result: { id: 'match', win: true, quit: false, aborted: false } });
      out.win = { played: N.flags.lb_match_played, won: N.flags.lb_match_won };
      delete N.flags.lb_match_played; delete N.flags.lb_match_won;
      N.emit('minigame:end', { id: 'match', result: { id: 'match', win: false, quit: true } });
      out.quit = { played: N.flags.lb_match_played };
      return out;
    });
    check(r.names.indexOf('Pappu') >= 0 && r.names.indexOf('Bunty') < 0 && r.names.length === 11, 'Chinnu XI: Pappu in, Bunty-anna out (11 players)', r.names);
    check(r.pintu === 'PINTU XI' && r.long === 'NALL XI', 'shortOf: "Pintu XI" -> ' + r.pintu + ', "Nallakunta Strikers" -> ' + r.long, r);
    check(r.lose.played === true && r.lose.won === false, 'minigame:end lose -> lb_match_played true, lb_match_won false', r.lose);
    check(r.win.played === true && r.win.won === true, 'minigame:end win -> lb_match_won true', r.win);
    check(!r.quit.played, 'a quit match sets no flags', r.quit);
  }

  /* ----------------------------------------------------------------- curfew */
  if (want('curfew')) {
    console.log('\n== curfew exemptions at 23:00');
    await fresh(page);
    const r = await page.evaluate(async () => {
      N.debug.setWanted(0);
      N.player.teleport(N.places.abids.x, N.places.abids.y);
      N.calendar.set(2003, 3, 5, 23, 0); await __gw(0.5);
      const floor = () => N.wanted.curfewFloor;
      const out = { base: floor() };
      N.flags.no_curfew = true; N.debug.setWanted(0); await __gw(0.4); out.noCurfew = floor(); N.flags.no_curfew = false;
      N.debug.setTime(23, 5); await __gw(0.4); out.back = floor();
      const st = N.story2.state;
      N.story2.state = function () { return Object.assign(st.apply(this, arguments), { scene: 'test_scene' }); };
      N.debug.setWanted(0); await __gw(0.4); out.scene = floor();
      N.story2.state = st;
      N.debug.setTime(23, 10); await __gw(0.4); out.back2 = floor();
      N.flags.ganesh = true; N.debug.setWanted(0); await __gw(0.4); out.ganesh = floor(); N.flags.ganesh = false;
      return out;
    });
    check(r.base >= 2 && r.back >= 2 && r.back2 >= 2, 'ordinary March night 23:00: curfew floor ' + r.base, r);
    check(r.noCurfew === 0, 'N.flags.no_curfew -> floor 0', r);
    check(r.scene === 0, 'a story2 scene in progress -> floor 0', r);
    check(r.ganesh === 0, 'Ganesh pandal week (flag ganesh) -> floor 0', r);
    await page.evaluate(() => { N.calendar.set(2003, 3, 5, 12, 0); N.debug.setWanted(0); });
  }

  /* ------------------------------------------------------------------ toast */
  if (want('toast')) {
    console.log('\n== hud toasts: until / dropToasts / mission:start');
    await fresh(page);
    const r = await page.evaluate(async () => {
      const H = N.hud, out = {};
      H.dropToasts();
      let live = false;
      H.toast('B3 first', 900);
      H.toast('B3 stale fn', 900, { until: () => live });
      H.toast('B3 stale time', 900, { until: N.time.now + 0.2 });
      H.toast('B3 kept', 900, { until: () => true });
      out.q0 = H.toastQueue();
      const seen = new Set();
      for (let i = 0; i < 30 && H.toastQueue().length; i++) { await __gw(0.25); H.toastQueue().forEach((t) => seen.add(t)); }
      out.seen = Array.from(seen);
      H.toast('B3 a', 3000, { tag: 'x' }); H.toast('B3 b', 3000, { tag: 'y' }); H.toast('B3 c', 3000, { tag: 'x' });
      await __gw(0.2);
      out.dropped = H.dropToasts((t) => t.tag === 'x');
      out.q1 = H.toastQueue();
      H.dropToasts();
      // an item toast queued in one mission must not show in the next
      const id = 'b3_toast_test';
      if (!(N.missions.defs && N.missions.defs[id])) N.missions.register({ id, kind: 'side', help: false, chapter: 'Test', title: 'Toast Test', script: async (m) => { m.objective('wait'); await new Promise(() => {}); } });
      out.mission = id;
      if (id) {
        N.debug.startMission(id);
        const run = N.missions.active;
        await __gw(0.3);
        N.hud.banner('B3 hold', '', 4); // keep the centre busy so the toast stays queued
        if (run) run.m.give('chai_flask', { name: 'B3 thing' }); // the mission API's own item toast
        N.hud.toast('B3 plain', 2600);
        out.q2 = H.toastQueue(); out.act = run ? run.id : null;
        N.missions.abort(); await __gw(0.3);
        N.debug.startMission(id); await __gw(0.2);
        out.q3 = H.toastQueue();
        N.missions.abort();
      }
      return out;
    });
    check(r.seen.indexOf('B3 first') >= 0 && r.seen.indexOf('B3 kept') >= 0, 'queued toasts with a live until still show', r.seen);
    check(r.seen.indexOf('B3 stale fn') < 0 && r.seen.indexOf('B3 stale time') < 0, 'toasts whose until lapsed (predicate / game time) are dropped unseen', r);
    check(r.dropped === 2 && r.q1.join('|') === 'B3 b', 'dropToasts(pred) drops the matching current + queued toasts', r);
    if (r.mission) {
      check(r.q2 && r.q2.indexOf('Got: B3 thing') >= 0, 'item toast queued during mission ' + r.mission, r);
      check(r.q3 && r.q3.indexOf('Got: B3 thing') < 0 && r.q3.indexOf('B3 plain') >= 0, 'next mission:start drops the queued item toast (plain toast kept)', r.q3);
    } else fail('no mission to test mission:start toast drop');
    await page.evaluate(() => N.hud.dropToasts());
  }

  /* ----------------------------------------------------------------- result */
  if (want('result')) {
    console.log('\n== minigame autoplay result card at low fps');
    await fresh(page);
    const id = await page.evaluate(() => {
      const ids = N.minigames.list().map((d) => d.id);
      return ['catch', 'goli', 'kite', 'kanche'].find((x) => ids.indexOf(x) >= 0) || ids[0];
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    const r = await page.evaluate(async (id) => {
      // ~3 fps (as a weak phone in a heavy scene): the result card's 0.15 s guard outlasts one 900 ms timer
      const raf0 = window.requestAnimationFrame;
      window.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 330);
      let res = null;
      N.minigames.play(id, { difficulty: 0.3, seed: 9, autoplay: 'win', timeScale: 6, skipHowto: true }).then((x) => { res = x; });
      const t0 = performance.now();
      let sawCard = false;
      while (!res && performance.now() - t0 < 120000) {
        await new Promise((ok) => setTimeout(ok, 250));
        if (document.querySelector('.mg-card-result')) sawCard = true;
      }
      window.requestAnimationFrame = raf0;
      return { id, sawCard, closed: !!res, win: res && res.win, secs: Math.round((performance.now() - t0) / 1000), open: N.minigames.isOpen() };
    }, id);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check(r.sawCard && r.closed && !r.open, 'autoplay ' + r.id + ' result card auto-closed at ~3 fps (' + r.secs + ' s)', r);
  }

  /* ------------------------------------------------------------------- bark */
  if (want('bark')) {
    console.log('\n== shared bark cooldown');
    await fresh(page);
    const r = await page.evaluate(() => {
      N.debug.teleport('playground_1');
      const p = N.player;
      const a = N.npcs.spawn('pasha', { x: p.x + 20, y: p.y }, { idle: 'stand', free: true });
      const b = N.npcs.spawn('babloo', { x: p.x + 40, y: p.y }, { idle: 'stand', free: true });
      const c = N.npcs.spawn('faramarz', { x: p.x + 20, y: p.y + 120 }, { idle: 'stand', free: true });
      if (!a || !b || !c) return { err: 'spawn' };
      a.barkT = 12; b.barkT = 0.5; c.barkT = 0.5;
      N.npcs.bark('pasha', 'Arre, listen!', { blip: false });
      const out = { d: Math.hypot(a.x - b.x, a.y - b.y), near: b.barkT, far: c.barkT };
      ['pasha', 'babloo', 'faramarz'].forEach((k) => N.npcs.remove(k));
      return out;
    });
    check(!r.err && r.near >= 12, 'NPC ' + (r.d || 0).toFixed(0) + ' u away gets the bark cooldown pushed out (' + r.near + ' s)', r);
    check(!r.err && r.far === 0.5, 'NPC 120 u away keeps its own cooldown', r);
  }

  check(errors.length === 0, 'zero console errors', errors.slice(0, 5));
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAILED' : 'ALL OK'));
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
