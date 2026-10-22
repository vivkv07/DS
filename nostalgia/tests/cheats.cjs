/* NOSTALGIA — tests/cheats.cjs  (src/cheats.js: typed cheat codes)
 * Phases (ONLY=codes,chain,save,ui,phone,off):
 *   codes  every code in the code book, applied the way the card applies it (N.cheats.apply): each stage code lands
 *          on its stage (the main mission running on its own 2003 date, Diwali week's MON 20 OCT card, the interlude,
 *          a Ramzan night at Charminar with the tape ■ PAUSED at 812, the ending, the epilogue, the ◀◀ season menu,
 *          SA8); each side activity / odd job starts set up for itself (the Diwali ones inside the story's Diwali
 *          week); every time / helper code does its one thing. Zero N.err after each.
 *   chain  the story goes on after a jump: GANESH -> PASS -> Diwali week's way in; GOLCONDA -> NEXT -> BONALU (M8).
 *   save   a player's own save is put aside before the first jump (localStorage 'nostalgia.cheats.mygame'), a cheat
 *          game's autosave carries N.flags.cheat, a second jump keeps the first copy, MYGAME puts the player's game
 *          back (same money, no cheat flag) and continues it.
 *   ui     real keys and clicks: the title's CHEAT CODE track -> type "chand raat" + Enter -> Track 12 runs; the pause
 *          deck's Cheats key -> a wrong code stays on the card with a message -> typing "ram" filters the book -> a click
 *          on RAMZAN jumps; C in free roam opens the card with an empty field -> "night" + Enter -> 21:00, back in play;
 *          Esc closes a C card back to the game.
 *   phone  the card on a 390 x 844 portrait phone (fits the width, the book scrolls) - screenshot.
 *   off    N.cheats.enabled = false: no title track, no pause key, C does nothing (N.debug.cheat still works).
 * Zero console errors / page errors. Screenshots: tests/out/cheats_*.png.
 *   node tests/cheats.cjs        ONLY=codes,chain,save,ui,phone,off   VERBOSE=1
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const VERBOSE = !!process.env.VERBOSE;
const T0 = Date.now();
const failures = [];
let passes = 0, phase = '-', page = null;
const errors = [];
const log = (s) => console.log('[' + ((Date.now() - T0) / 1000).toFixed(0).padStart(4) + 's] ' + s);
const vlog = (s) => { if (VERBOSE) log('   ' + s); };
function check(cond, msg, data) {
  if (cond) { passes++; console.log('  ok   ' + msg); }
  else { const t = '[' + phase + '] ' + msg + (data !== undefined ? '  ' + JSON.stringify(data).slice(0, 700) : ''); failures.push(t); console.log('  FAIL ' + t); }
  return !!cond;
}
const ev = (fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 10000, polling: 100 }).then(() => true, () => false);
async function shot(name) { try { await page.screenshot({ path: path.join(OUT, 'cheats_' + name + '.png') }); } catch (e) { /* ignore */ } }
/** what the game looks like right now (for messages) */
const probe = () => ev(() => ({
  mode: N.state.mode, mission: N.missions.active && N.missions.active.id, scene: N.story2.scene, date: N.calendar.label() + ' ' + N.clock.label(),
  counter: N.tape.counter, paused: N.tape.paused, cheat: N.flags.cheat || null, top: N.menus.topPanelId(), err: N.debug.state().errors.slice(0, 3),
}));
async function calm() {
  await ev(() => {
    try { if (N.missions.active) N.missions.abort(); } catch (e) { /* ignore */ }
    try { if (N.story2.scene) N.story2.abortScene(); } catch (e) { /* ignore */ }
    try { if (N.menus.inCutscene) N.menus.abortCutscene(); } catch (e) { /* ignore */ }
    try { if (N.dialogue.isOpen()) N.dialogue.cancel(); } catch (e) { /* ignore */ }
  }).catch(() => {});
}
async function noErr(what) {
  const errs = await ev(() => N.debug.state().errors).catch(() => []);
  if (errs.length) { check(false, what + ': N.err ' + errs.slice(0, 4).join(' | ')); await ev(() => { N.errors.length = 0; }); }
}
async function toPlay() {
  await calm();
  await ev(() => { if (N.state.mode === 'title' || N.menus.isOpen()) N.debug.newGame({ skipIntro: true }); });
  await until(() => N.state.mode === 'play', null, 10000);
}

/* ================================================================== codes */
async function pCodes() {
  await toPlay();
  const rows = await ev(() => N.cheats.list().map((r) => ({ code: r.code, sec: r.sec })));
  check(rows.filter((r) => r.sec === 'stage').length === 20, 'the code book lists 20 story stages', rows.filter((r) => r.sec === 'stage').map((r) => r.code));
  check(rows.filter((r) => r.sec === 'side').length >= 15 && rows.filter((r) => r.sec === 'job').length >= 9, 'and every side activity (15+) and odd job (9)', rows.length);
  // aliases normalise: case, spaces, dashes, underscores; mission names, M1..M12 and TRACK numbers
  const al = await ev(() => ['chand raat', 'Chand-Raat', 'chand_raat', 'M12', 'track 12', 'TRACK12', 'diwali week', 'Ramadan', 'the_clap', 'm7', 'six balls', 'job_paper_round', 'paper round']
    .map((c) => { const e = N.cheats.lookup(c); return e ? (e.s ? e.s.code : e.id) : null; }));
  check(JSON.stringify(al) === JSON.stringify(['CHANDRAAT', 'CHANDRAAT', 'CHANDRAAT', 'CHANDRAAT', 'CHANDRAAT', 'CHANDRAAT', 'DIWALI', 'RAMZAN', 'GOLCONDA', 'GOLCONDA', 'six_balls', 'job_paper_round', 'job_paper_round']), 'codes ignore case / spaces / dashes / underscores; mission ids, M7, TRACK 12, nicknames all work', al);
  check(await ev(() => !N.cheats.lookup('nope') && N.cheats.apply('nope').ok === false), 'an unknown code is refused');
  for (const r of rows) {
    if (r.sec === 'tool') continue;
    await calm();
    const res = await ev((c) => { N.errors.length = 0; return N.cheats.apply(c); }, r.code);
    // what each code must lead to (checked in the page: ids and dates come from the game's own tables)
    const ok = await until((c) => {
      const e = N.cheats.lookup(c), s = e.s, A = N.missions.active, C = N.calendar, d = C.date;
      if (!N.flags.cheat) return false;
      const on = (y, m, dd) => d.y === y && d.m === m && d.d === dd;
      if (s && s.id) { const def = N.missions.defs[s.id]; const dt = def.date || N.cheats.WHEN[s.id]; return !!A && A.id === s.id && on(dt[0], dt[1], dt[2]); }
      if (s && s.stage === 'prologue') return N.menus.inCutscene && d.y === 2026;
      if (s && s.stage === 'diwali') return N.story2.scene === 'diwali_in' && on(2003, 10, 20);
      if (s && s.stage === 'interlude') return N.story2.scene === 'interlude' && on(2003, 11, 1);
      if (s && s.stage === 'ramzan') {
        const p = N.player, c2 = N.places.charminar_plaza || N.places.charminar;
        return on(2003, 11, 15) && N.clock.minutes >= 20 * 60 + 30 && N.seasons.is('ramzan') && N.tape.paused && N.tape.counter === 812 && !!N.flags.interlude_done &&
          Math.hypot(p.x - c2.x, p.y - c2.y) < 300 && N.missions.available().some((m) => m.id === 'last_bell');
      }
      if (s && s.stage === 'ending') return N.story2.scene === 'ending' && on(2003, 11, 26);
      if (s && s.stage === 'epilogue') return N.story2.scene === 'epilogue' && !N.flags.postgame && !!N.flags.ending_done;
      if (s && s.stage === 'rewind') return !!N.story2.panel && !!N.flags.postgame && N.tape.counter === 999;
      const id = e.id;
      if (id === 'job_lootna') return !A && !!N.flags.cheat;
      if (!A || A.id !== id) return false;
      if (N.dwMissions.IDS.indexOf(id) >= 0) return N.dwMissions.story.state().week === 'week' && d.m === 10 && !N.flags.interlude_done;
      const w = N.cheats.WHEN[id];
      return !w || on(w[0], w[1], w[2]);
    }, r.code, 12000);
    const s = await probe();
    check(res.ok && ok && !s.err.length, r.code.padEnd(14) + ' ' + (res.msg || ''), Object.assign({ res }, s));
    vlog(JSON.stringify(s));
    await noErr(r.code);
  }
  // a whole tape before a stage: the counter and the tin match what was played
  await calm();
  await ev(() => N.cheats.apply('LASTBELL'));
  await until(() => N.missions.active && N.missions.active.id === 'last_bell', null, 10000);
  const st = await ev(() => ({ done: N.calendar.STORY.filter((s) => N.missions.isDone(s.id)).length, tracks: N.tape.tracks.length, tin: N.tape.tin.size, lock: [N.flags.lock_1, N.flags.lock_2, N.flags.lock_4], dw: N.flags.dw_story, inter: N.flags.interlude_done, bus: N.flags.bus_golconda, prasads: N.flags.prasads_open, cam: N.player.inventory.has('camera') }));
  check(st.done === 10 && st.tracks === 10 && st.tin >= 10 && st.lock.join() === '1,4,1' && st.dw === 'done' && st.inter && st.bus && st.prasads && st.cam, 'LASTBELL: ten tracks recorded, ten tokens in the tin, lock digits 1-4-_-1, Diwali + interlude done, Golconda bus, Prasads, camera', st);
  // the time and helper codes
  await calm();
  await toPlay();
  for (const [c, h] of [['MORNING', '07:0'], ['NOON', '12:0'], ['EVENING', '17:3'], ['NIGHT', '21:0']]) {
    const r = await ev((c) => { const r = N.cheats.apply(c); r.clock = N.clock.label(); r.date = N.calendar.label(); r.mode = N.state.mode; return r; }, c);
    check(r.ok && r.clock.indexOf(h) === 0, c + ': clock ' + h + 'x', r);
  }
  const t = await ev(() => {
    const out = {};
    out.skip = [N.cheats.apply('skiptalk').ok && N.dialogue.skip, N.cheats.apply('skiptalk').ok && !N.dialogue.skip];
    out.win = [N.cheats.apply('autowin').ok && N.story.debug.mg === 'win' && N.story2.TUNE.mg.autoplay === 'win', N.cheats.apply('autowin').ok && !N.story.debug.mg && !N.story2.TUNE.mg];
    out.god = [N.cheats.apply('godmode').ok && N.player.god, N.cheats.apply('god').ok && !N.player.god];
    N.debug.setWanted(3);
    out.chappal = N.cheats.apply('NOCHAPPAL').ok && (N.wanted.level | 0) === 0;
    out.pass0 = N.cheats.apply('PASS').ok === false;
    return out;
  });
  check(t.skip.every(Boolean), 'SKIPTALK turns the dialogue skip on and off', t);
  check(t.win.every(Boolean), 'AUTOWIN: story minigames (M1-M6 and M7-M12) win themselves, and back off', t);
  check(t.god.every(Boolean) && t.chappal && t.pass0, 'GODMODE / GOD toggle, NOCHAPPAL clears the meter, PASS with nothing running is refused', t);
  await noErr('tools');
}

/* ================================================================== chain */
async function pChain() {
  await calm();
  await ev(() => N.cheats.apply('GANESH'));
  check(await until(() => N.missions.active && N.missions.active.id === 'agle_baras', null, 10000), 'GANESH: Track 10 runs');
  const r = await ev(() => N.cheats.apply('PASS'));
  check(r.ok, 'PASS passes it', r);
  // MISSION PASSED, then (4.6 s later in game time) the story hands over to Diwali week
  const dw = await until(() => N.story2.scene === 'diwali_in' || N.flags.dw_story === 'week', null, 30000);
  check(dw && (await ev(() => N.missions.isDone('agle_baras'))), 'after a jump the story goes on: Track 10 passed -> Diwali week\'s way in (MON 20 OCT)', await probe());
  await calm();
  await ev(() => N.cheats.apply('GOLCONDA'));
  await until(() => N.missions.active && N.missions.active.id === 'the_clap', null, 10000);
  const n = await ev(() => N.cheats.apply('next'));
  const ok = await until(() => N.missions.active && N.missions.active.id === 'drums_for_amma', null, 10000);
  check(n.ok && ok && /BONALU/.test(n.msg), 'NEXT during Track 07 jumps to the next stage: BONALU (Track 08)', Object.assign({ n }, await probe()));
  await calm();
  await ev(() => { N.cheats.apply('INTERLUDE'); });
  await until(() => N.story2.scene === 'interlude', null, 10000);
  const n2 = await ev(() => N.cheats.apply('NEXT'));
  check(n2.ok && /LASTBELL/.test(n2.msg) && await until(() => N.missions.active && N.missions.active.id === 'last_bell', null, 10000), 'NEXT during the interlude skips RAMZAN (a time code) and goes to LASTBELL', n2);
  await noErr('chain');
}

/* ================================================================== save */
async function pSave() {
  await calm();
  await ev(() => { try { localStorage.removeItem('nostalgia.cheats.mygame'); } catch (e) { /* ignore */ } N.save.clear(); });
  // the player's own game (a real new game, not the last phase's cheat game): Track 01 done, some money, saved
  await ev(() => N.debug.newGame({ skipIntro: true }));
  await until(() => N.state.mode === 'play', null, 10000);
  check(!(await ev(() => N.flags.cheat)), 'a new game from PLAY is not a cheat game');
  const mine = await ev(() => {
    N.missions.deserialize({ done: ['bo_kaata'] });
    N.flags.prologue_seen = true;
    N.player.money = 4321;
    N.testing.unlimitedMoney = false;
    N.save.save({ reason: 'manual', toast: false });
    return { t: N.save.slotBlob('main').t, money: N.save.slotBlob('main').data.player.money };
  });
  check(mine.money === 4321, 'the player\'s own game is saved (₹43.21)', mine);
  await ev(() => N.cheats.apply('DIWALI'));
  await until(() => N.story2.scene === 'diwali_in', null, 10000);
  const b = await ev(() => { const raw = localStorage.getItem('nostalgia.cheats.mygame'); const o = raw && JSON.parse(raw); return { has: !!o, money: o && o.data.player.money, cheat: o && o.data.flags.cheat, card: N.cheats.hasMyGame() }; });
  check(b.has && b.money === 4321 && !b.cheat && b.card, 'DIWALI puts the player\'s own save aside first', b);
  // the cheat game autosaves over Side A (as any mission pass would)
  await calm();
  const a = await ev(() => { N.save.save({ reason: 'mission', toast: false }); const m = N.save.slotBlob('main'); return { cheat: m.data.flags.cheat }; });
  check(a.cheat === 'diwali', 'a cheat game\'s save carries N.flags.cheat', a);
  await ev(() => N.cheats.apply('RAMZAN'));
  await sleep(500);
  const b2 = await ev(() => JSON.parse(localStorage.getItem('nostalgia.cheats.mygame')).data.player.money);
  check(b2 === 4321, 'a second jump keeps the first copy (not the cheat game\'s save)', b2);
  await calm();
  const r = await ev(() => N.cheats.apply('my game'));
  await until(() => N.state.mode === 'play' && !N.flags.cheat, null, 10000);
  const back = await ev(() => ({ money: N.player.money, cheat: N.flags.cheat || null, m1: N.missions.isDone('bo_kaata'), m2: N.missions.isDone('lost_and_found'), main: N.save.slotBlob('main').data.player.money, left: N.cheats.hasMyGame() }));
  check(r.ok && back.money === 4321 && !back.cheat && back.m1 && !back.m2 && back.main === 4321 && !back.left, 'MYGAME: the player\'s own game is back in Side A and playing (Track 01 done, ₹43.21, no cheat flag)', Object.assign({ r }, back));
  check((await ev(() => N.cheats.apply('MYGAME'))).ok === false, 'MYGAME again: nothing put aside any more');
  await ev(() => { N.testing.unlimitedMoney = true; });
  await noErr('save');
}

/* ================================================================== ui */
async function typeCode(text) {
  await page.keyboard.type(text, { delay: 25 });
  await page.keyboard.press('Enter');
}
async function pUi() {
  await calm();
  await ev(() => N.game.quitToTitle());
  await until(() => N.state.mode === 'title' && N.menus.topPanelId() === 'title', null, 8000);
  const trk = page.locator('.trk-cheat button');
  check(await trk.isVisible(), 'the title shows a CHEAT CODE track');
  await trk.click();
  check(await until(() => N.menus.topPanelId() === 'cheats' && document.activeElement && document.activeElement.matches('.ch-field input'), null, 4000), 'it opens the cheat card with the cursor in the field');
  await shot('title_card');
  await typeCode('chand raat');
  check(await until(() => N.missions.active && N.missions.active.id === 'chand_raat' && !N.menus.isPanelShown('cheats'), null, 10000), 'typing "chand raat" + Enter from the title: Track 12 Chand Raat runs', await probe());
  await calm();
  await toPlay();
  // the pause deck
  await page.keyboard.press('KeyP');
  await until(() => N.menus.topPanelId() === 'pause', null, 4000);
  const key = page.locator('.mn-pause .k-cheat');
  check(await key.isVisible(), 'the pause deck has a Cheats key');
  await shot('pause_deck');
  await key.click();
  await until(() => N.menus.topPanelId() === 'cheats', null, 4000);
  await typeCode('bo kaata 2');
  const bad = await ev(() => ({ top: N.menus.topPanelId(), msg: document.querySelector('.ch-msg').textContent, cls: document.querySelector('.ch-msg').className, mode: N.state.mode }));
  check(bad.top === 'cheats' && /not a code/.test(bad.msg) && /bad/.test(bad.cls) && bad.mode === 'paused', 'a wrong code stays on the card with a message (the game stays paused)', bad);
  await page.locator('.ch-field input').fill('');
  await page.keyboard.type('ram', { delay: 25 });
  const f = await ev(() => Array.from(document.querySelectorAll('.ch-code')).filter((b) => !b.hidden).map((b) => b.dataset.code));
  check(f.indexOf('RAMZAN') >= 0 && f.length < 8, 'typing "ram" filters the code book down to RAMZAN and friends', f);
  await shot('filtered');
  await page.locator('.ch-code[data-code="RAMZAN"]').click();
  check(await until(() => N.flags.cheat === 'ramzan' && N.state.mode === 'play' && !N.menus.isOpen() && N.calendar.date.m === 11, null, 10000), 'a click on RAMZAN in the book jumps to the Ramzan night', await probe());
  await sleep(2200);
  await shot('ramzan');
  // C in free roam
  await calm();
  await page.keyboard.press('KeyC');
  const c = await ev(() => ({ top: N.menus.topPanelId(), mode: N.state.mode, val: document.querySelector('.ch-field input').value, focus: document.activeElement && document.activeElement.matches('.ch-field input') }));
  check(c.top === 'cheats' && c.mode === 'paused' && c.val === '' && c.focus, 'C in free roam opens the card (game paused, the field empty and focused)', c);
  await typeCode('night');
  const n = await ev(() => ({ open: N.menus.isOpen(), mode: N.state.mode, t: N.clock.label() }));
  check(!n.open && n.mode === 'play' && /^21:0/.test(n.t), '"night" + Enter: 21:00 and straight back to the game', n);
  await page.keyboard.press('KeyC');
  await until(() => N.menus.topPanelId() === 'cheats', null, 3000);
  await page.keyboard.press('Escape');
  check(await until(() => !N.menus.isOpen() && N.state.mode === 'play', null, 3000), 'Esc closes a C card back to the game');
  // C while a dialogue is open does nothing
  await ev(() => { N.dialogue.say('amma', 'Test line.'); });
  await until(() => N.state.mode === 'dialogue', null, 3000);
  await page.keyboard.press('KeyC');
  check(!(await ev(() => N.menus.isOpen())), 'C does nothing in a conversation');
  await calm();
  await noErr('ui');
}

/* ================================================================== phone */
async function pPhone() {
  await calm();
  await toPlay();
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(600);
  await ev(() => { N.game.pause(); N.cheats.open({ from: 'pause' }); });
  await until(() => N.menus.topPanelId() === 'cheats', null, 4000);
  await sleep(500);
  const g = await ev(() => {
    const c = document.querySelector('.ch-card').getBoundingClientRect(), b = document.querySelector('.ch-body');
    return { l: c.left, r: c.right, w: innerWidth, h: innerHeight, top: c.top, bot: c.bottom, scroll: b.scrollHeight > b.clientHeight, hscroll: document.documentElement.scrollWidth > innerWidth };
  });
  check(g.l >= 0 && g.r <= g.w && g.top >= 0 && g.bot <= g.h && g.scroll && !g.hscroll, 'portrait phone: the card fits the screen and the code book scrolls inside it', g);
  await shot('phone');
  await ev(() => N.cheats.close());
  await ev(() => N.menus.resume());
  await page.setViewportSize({ width: 1280, height: 720 });
  await sleep(400);
  await noErr('phone');
}

/* ================================================================== off */
async function pOff() {
  await calm();
  await toPlay();
  await ev(() => { N.cheats.enabled = false; });
  await page.keyboard.press('KeyC');
  check(!(await ev(() => N.menus.isOpen())), 'cheats off: C does nothing');
  await page.keyboard.press('KeyP');
  await until(() => N.menus.topPanelId() === 'pause', null, 4000);
  check(!(await page.locator('.mn-pause .k-cheat').isVisible()), 'cheats off: no Cheats key on the pause deck');
  await ev(() => N.menus.resume());
  await ev(() => N.game.quitToTitle());
  await until(() => N.menus.topPanelId() === 'title', null, 4000);
  check(!(await page.locator('.trk-cheat button').isVisible()), 'cheats off: no CHEAT CODE track on the title');
  const r = await ev(() => N.debug.cheat('NUMAISH').ok);
  check(r && await until(() => N.missions.active && N.missions.active.id === 'lost_and_found', null, 10000), 'N.debug.cheat still works from the console');
  await ev(() => { N.cheats.enabled = true; });
  await calm();
  await noErr('off');
}

/* ================================================================== main */
const PHASES = [['codes', pCodes], ['chain', pChain], ['save', pSave], ['ui', pUi], ['phone', pPhone], ['off', pOff]];
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[' + phase + '] console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('[' + phase + '] pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  try {
    await page.goto(URL);
    await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
    await page.mouse.click(2, 2);
    for (const [name, fn] of PHASES) {
      if (ONLY && !ONLY.has(name)) continue;
      phase = name; log('== ' + name);
      try { await fn(); } catch (e) { check(false, 'exception: ' + (e.stack || e.message)); await shot('exception_' + name); }
    }
  } catch (e) { check(false, 'exception: ' + (e.stack || e)); }
  phase = 'end';
  check(!errors.length, 'no console errors / page errors', errors.slice(0, 8));
  await browser.close();
  log(passes + ' passed, ' + failures.length + ' failed');
  if (failures.length) { console.log('\nFAILURES:\n' + failures.join('\n')); process.exit(1); }
})();
