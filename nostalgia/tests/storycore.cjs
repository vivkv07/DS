/* NOSTALGIA — tests/storycore.cjs  (story-core agent)
 * Playwright (headless Chromium) checks for the story layer's shared machinery:
 *   calendar  — dates/weekdays for every bible §1.4 row, set/jumpTo (VHS ▶▶ overlay + fx), midnight
 *               rollover, the elastic week loop (systems §10.5), clock frozen outside play, seasons hook
 *   tape      — ● REC prompt (real ACTION key), counter roll, ■ PAUSED, decline, the tin, Side A playback
 *   walkman   — cassettes, play/next/stop with the real RADIO key, memos, the home 2-in-1 deck
 *   player    — money 1000, tummy 80, drains, energy cap, feed, statuses, quick-item slot, the bike fall
 *   HUD       — 1280x720, 390x844, 844x390 screenshots of a busy HUD; no overlapping clutter, one toast
 *   missions  — the J-card prompt with the DEMO mission (step out cancels, ACTION / dwell starts),
 *               date jump on start, saves refused during missions, "Let Immu do it", timer help
 *   save      — save -> reload page -> continue restores tape, tin, walkman, calendar, tummy, statuses
 * Fails on any console error / page error / N.err.
 *
 *   node nostalgia/tests/storycore.cjs          ONLY=calendar|tape|walkman|player|hud|missions|save
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'storycore');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY || '';
const want = (k) => !ONLY || ONLY.split(',').indexOf(k) >= 0;

const failures = [];
let passes = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(cond, msg, data) {
  if (cond) { passes++; console.log('  ok   ' + msg); }
  else { failures.push(msg + (data !== undefined ? '  ' + JSON.stringify(data).slice(0, 600) : '')); console.log('  FAIL ' + msg + (data !== undefined ? '  ' + JSON.stringify(data).slice(0, 600) : '')); }
}

async function openPage(browser, V) {
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.dpr || 1, hasTouch: !!V.touch, isMobile: !!V.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 20000 });
  await page.mouse.click(2, 2); // a real gesture unlocks WebAudio
  await page.evaluate(() => { const d = document.getElementById('debug'); if (d) d.classList.add('hide'); });
  return { context, page, errors };
}
async function newGame(page, opts) {
  await page.evaluate((o) => { N.debug.newGame(Object.assign({ skipIntro: true }, o || {})); N.debug.setTime(16, 30); N.save.clear(); }, opts || {});
  await sleep(300);
}
async function errorsOf(page, errors) {
  const s = await page.evaluate(() => N.debug.state().errors);
  return errors.concat(s.map((e) => 'N.err ' + e));
}

/* ======================================================================= calendar */
async function testCalendar(page) {
  console.log('\n== calendar');
  await newGame(page);
  const rows = [
    [2003, 1, 13, 'MON'], [2003, 1, 14, 'TUE'], [2003, 1, 25, 'SAT'], [2003, 2, 8, 'SAT'], [2003, 3, 23, 'SUN'], [2003, 4, 1, 'TUE'],
    [2003, 4, 2, 'WED'], [2003, 5, 15, 'THU'], [2003, 6, 7, 'SAT'], [2003, 6, 12, 'THU'], [2003, 7, 20, 'SUN'], [2003, 7, 25, 'FRI'],
    [2003, 8, 31, 'SUN'], [2003, 9, 9, 'TUE'], [2003, 9, 10, 'WED'], [2003, 11, 1, 'SAT'], [2003, 11, 21, 'FRI'], [2003, 11, 25, 'TUE'],
    [2003, 11, 26, 'WED'], [2003, 11, 27, 'THU'], [2026, 1, 14, 'WED'], [2026, 1, 17, 'SAT'],
  ];
  const r = await page.evaluate((rows) => {
    const C = N.calendar;
    const out = { base: C.label(), dl: N.clock.dateLabel(), osd: C.osd(), year: C.year, flagYear: N.flags.year, bad: [] };
    for (const [y, m, d, dow] of rows) {
      const day = C.dayOf(y, m, d), dt = C.dateOf(day);
      if (dt.y !== y || dt.m !== m || dt.d !== d || dt.dayName !== dow || dt.label.indexOf(dow) !== 0) out.bad.push([y, m, d, dow, dt.label]);
    }
    // every mission's bible date carries the bible weekday
    const want = { bo_kaata: 'TUE', lost_and_found: 'SAT', first_day_first_show: 'SAT', last_man_batting: 'SUN', right_right: 'TUE', ammammas_thursday: 'THU',
      the_clap: 'SAT', drums_for_amma: 'SUN', opening_day: 'FRI', agle_baras: 'TUE', last_bell: 'FRI', chand_raat: 'TUE' };
    out.missions = C.STORY.map((s) => { const p = C.parse(s.date); const dt = C.dateOf(C.dayOf(p.y, p.m, p.d)); return [s.id, dt.dayName, want[s.id]]; }).filter((x) => x[1] !== x[2]);
    out.counters = C.STORY.map((s) => s.counter).join(',');
    return out;
  }, rows);
  check(r.base === 'TUE 14 JAN 2003' && r.dl === 'TUE 14 JAN 2003' && r.year === 2003 && r.flagYear === 2003, 'new game starts on TUE 14 JAN 2003 (N.calendar + N.clock.dateLabel)', r);
  check(/^▶ PLAY {2}TUE 14 JAN 2003 {2}\d\d:\d\d$/.test(r.osd), 'osd() = "▶ PLAY  TUE 14 JAN 2003  hh:mm"', r.osd);
  check(r.bad.length === 0, 'dates and weekdays of every bible §1.4 row (' + rows.length + ' rows)', r.bad);
  check(r.missions.length === 0, 'every mission date falls on its bible weekday', r.missions);
  check(r.counters === '83,166,249,332,415,498,581,664,747,812,905,999', 'tape counters per mission match bible §1.6', r.counters);
  const hud = await page.evaluate(() => ({ date: document.querySelector('.osd-date').textContent, year: document.querySelector('.osd-year').textContent }));
  check(hud.date === 'TUE 14 JAN' && hud.year === '2003', 'HUD OSD shows the calendar date', hud);

  // set + seasons hook + events
  const s = await page.evaluate(() => {
    const calls = [], evs = [];
    const S = N.seasons || (N.seasons = {});
    const orig = S.autoFor;
    S.autoFor = function (d) { calls.push(d.iso); return orig ? orig.apply(this, arguments) : undefined; };
    const h = (e) => evs.push(e.reason + ':' + e.date.iso);
    N.on('calendar:change', h);
    N.calendar.set(2003, 2, 8, 5, 15);
    const a = { label: N.calendar.label(), clock: N.clock.label(), day: N.clock.day };
    N.calendar.set('2003-07-25 08:30');
    const b = N.calendar.label();
    // midnight rollover
    N.calendar.set([2003, 3, 22, 23, 59]);
    N.clock.update(2);
    const c = { label: N.calendar.label(), clock: N.clock.label() };
    N.off('calendar:change', h);
    S.autoFor = orig;
    if (!orig && Object.keys(S).length === 1) delete N.seasons;
    return { a, b, c, calls, evs };
  });
  check(s.a.label === 'SAT 08 FEB 2003' && s.a.clock === '05:15' && s.a.day === 25, 'set(2003, 2, 8, 5, 15) -> SAT 08 FEB 2003 05:15 (day 25)', s.a);
  check(s.b === 'FRI 25 JUL 2003', 'set("2003-07-25 08:30") parses ISO strings', s.b);
  check(s.c.label === 'SUN 23 MAR 2003' && /^00:/.test(s.c.clock), 'midnight rollover moves to the next date', s.c);
  check(s.calls.indexOf('2003-02-08') >= 0 && s.calls.indexOf('2003-03-23') >= 0, 'N.seasons.autoFor(date) is called on every date change', s.calls);
  check(s.evs.some((e) => /^midnight:2003-03-23/.test(e)) && s.evs.some((e) => /^set:2003-02-08/.test(e)), "'calendar:change' events carry the reason", s.evs);

  // the elastic week loop
  const L = await page.evaluate(() => {
    const C = N.calendar, out = {};
    N.missions.done.add('bo_kaata');
    C.set(2003, 1, 14, 18, 20); C.markStop();
    out.l1 = Object.assign({}, N.clock.loop, { fromL: C.dateOf(N.clock.loop.from).label, toL: C.dateOf(N.clock.loop.to).label });
    C.set(2003, 1, 24, 23, 59); N.clock.update(90);
    out.after = { label: C.label(), looping: C.looping };
    out.hudLoop = (N.systems.get('hud').update(0.016), document.querySelector('.osd-loop').classList.contains('show'));
    // 25 Jan (M2) done -> M3 8 Feb: loop 1..7 Feb
    N.missions.done.add('lost_and_found'); C.set(2003, 1, 25, 20, 0); C.markStop();
    out.l2 = [C.dateOf(N.clock.loop.from).label, C.dateOf(N.clock.loop.to).label];
    // a short gap: M8 (20 Jul) -> M9 (25 Jul): the loop starts the day after M8
    for (const id of ['first_day_first_show', 'last_man_batting', 'right_right', 'ammammas_thursday', 'the_clap', 'drums_for_amma']) N.missions.done.add(id);
    C.set(2003, 7, 20, 13, 30); C.markStop();
    out.l3 = [C.dateOf(N.clock.loop.from).label, C.dateOf(N.clock.loop.to).label];
    // days advance normally before the window
    C.set(2003, 7, 21, 23, 59); N.clock.update(90); out.norm = C.label();
    C.set(2003, 7, 24, 23, 59); N.clock.update(90); out.wrap = C.label();
    return out;
  });
  check(L.l1.fromL === 'SAT 18 JAN 2003' && L.l1.toL === 'FRI 24 JAN 2003', 'after M1 the loop is the last 7 days before M2 (18–24 Jan)', L.l1);
  check(L.after.label === 'SAT 18 JAN 2003' && L.after.looping && L.hudLoop, 'after FRI 24 JAN comes SAT 18 JAN again; the OSD shows ↻', L);
  check(L.l2[0] === 'SAT 01 FEB 2003' && L.l2[1] === 'FRI 07 FEB 2003', 'M2 -> M3 loop is 1–7 Feb', L.l2);
  check(L.l3[0] === 'MON 21 JUL 2003' && L.l3[1] === 'THU 24 JUL 2003', 'a short gap loops from the day after the last mission (21–24 Jul)', L.l3);
  check(L.norm === 'TUE 22 JUL 2003' && L.wrap === 'MON 21 JUL 2003', 'days run normally inside the window and wrap after D-1', L);
  await shot(page, 'calendar_loop');

  // clock frozen outside play
  const fr = await page.evaluate(async () => {
    N.calendar.set(2003, 1, 14, 10, 0);
    const m0 = N.clock.minutes;
    N.state.push('paused');
    await new Promise((r) => setTimeout(r, 700));
    const m1 = N.clock.minutes;
    N.state.pop();
    await new Promise((r) => setTimeout(r, 700));
    return { paused: m1 - m0, play: N.clock.minutes - m1 };
  });
  check(fr.paused === 0 && fr.play > 0.3, 'the clock is frozen outside play (paused) and runs in play', fr);

  // jumpTo: VHS ▶▶ with the date spinning
  await page.evaluate(() => { N.calendar.set(2003, 1, 14, 16, 30); window.__jump = N.calendar.jumpTo(2003, 3, 23, 9, 30).then((d) => { window.__jumped = d && d.label; }); });
  await sleep(650);
  const mid = await page.evaluate(() => ({ vhs: N.render.fx.vhs, jumping: N.calendar.jumping, overlay: !!document.querySelector('.sc-vhs.show'), mode: document.querySelector('.sc-vhs-mode').textContent, locked: N.player.controlsLocked, held: N.clock.held, disp: N.calendar.displayLabel() }));
  await shot(page, 'jump_mid');
  check(mid.vhs > 0.5 && mid.jumping && mid.overlay && /▶▶/.test(mid.mode) && mid.locked && mid.held, 'jumpTo: VHS fx up, ▶▶ overlay, controls + clock held mid-jump', mid);
  await page.waitForFunction(() => window.__jumped, null, { timeout: 4000 }).catch(() => {});
  const end = await page.evaluate(() => ({ label: N.calendar.label(), clock: N.clock.label(), vhs: N.render.fx.vhs, overlay: !!document.querySelector('.sc-vhs.show'), locked: N.player.controlsLocked, jumped: window.__jumped }));
  check(end.label === 'SUN 23 MAR 2003' && end.clock === '09:30' && end.vhs < 0.05 && !end.overlay && !end.locked && end.jumped === 'SUN 23 MAR 2003', 'jumpTo resolves on SUN 23 MAR 2003 09:30 and cleans up', end);
  const rw = await page.evaluate(async () => { const d = await N.calendar.jumpTo('2003-03-23 07:00', { ms: 400 }); return { label: d.label, clock: N.clock.label() }; });
  check(rw.clock === '07:00', 'jumpTo backwards in time (◀◀) works', rw);
}

async function shot(page, name) {
  try { await page.screenshot({ path: path.join(OUT, (page.__vp || 'desktop') + '_' + name + '.png') }); } catch (e) { console.log('  (screenshot failed: ' + e.message + ')'); }
}

/* ======================================================================= tape */
async function testTape(page) {
  console.log('\n== tape (Side A) + tin');
  await newGame(page);
  await page.evaluate(() => { window.__tapeEv = []; N.on('tape:rec', (e) => window.__tapeEv.push(e)); window.__rec = N.tape.rec('bo_kaata').then((v) => { window.__recDone = v; }); });
  await sleep(250);
  const p1 = await page.evaluate(() => ({ st: N.tape.recState, hudRec: document.querySelector('.osd-rec.show') && document.querySelector('.osd-rec').textContent, label: N.input.actionLabel, counter: N.tape.counter }));
  await shot(page, 'rec_prompt');
  check(p1.st && p1.st.phase === 'prompt' && p1.hudRec === '● REC' && p1.label === '● REC' && p1.counter === 0, '● REC prompt: HUD blinks ● REC, ACTION reads "● REC"', p1);
  await page.keyboard.press('KeyE');
  await sleep(500);
  const p2 = await page.evaluate(() => ({ st: N.tape.recState, counter: N.tape.counter, shown: N.tape.shown, rolling: N.tape.rolling }));
  await shot(page, 'rec_rolling');
  check(!p2.st && p2.counter === 83 && p2.rolling && p2.shown > 0 && p2.shown < 83, 'ACTION records: the counter rolls 000 -> 083', p2);
  await page.waitForFunction(() => window.__recDone !== undefined, null, { timeout: 4000 }).catch(() => {});
  const p3 = await page.evaluate(() => ({ done: window.__recDone, shown: N.tape.shown, num: document.querySelector('.tp-num').textContent, tracks: N.tape.tracks.map((t) => t.id + '@' + t.counter + ':' + t.sfx), tin: Array.from(N.tape.tin), ev: window.__tapeEv.length }));
  check(p3.done === true && p3.shown === 83 && p3.num === '083' && p3.tracks[0] === 'bo_kaata@83:bo_kaata' && p3.tin[0] === 'kite_corner' && p3.ev === 1, 'track recorded (bo_kaata sfx), HUD 083, the kite corner goes in the tin', p3);

  // auto-fire after the window
  const auto = await page.evaluate(async () => { const t0 = performance.now(); const v = await N.tape.rec('lost_and_found', { window: 0.6 }); return { v, ms: performance.now() - t0, c: N.tape.counter }; });
  check(auto.v === true && auto.c === 166 && auto.ms > 500, 'REC auto-fires when the window runs out (counter 166)', auto);
  // ■ PAUSED (interlude) then M11 resumes
  await page.evaluate(() => { N.tape.setCounter(812); N.tape.pause(true); });
  await sleep(200);
  const pz = await page.evaluate(() => ({ paused: N.tape.paused, cls: document.querySelector('.osd-tape').className, txt: document.querySelector('.osd-tape').textContent }));
  await shot(page, 'tape_paused');
  check(pz.paused && /paused/.test(pz.cls) && /PAUSED/.test(pz.txt), 'SIDE A ■ PAUSED greys the counter', pz);
  const dec = await page.evaluate(async () => { const v = await N.tape.rec('last_bell', { decline: true, window: 0.4 }); return { v, has: N.tape.has('last_bell'), paused: N.tape.paused }; });
  check(dec.v === false && !dec.has && dec.paused, '"● REC?" declined: nothing recorded', dec);
  const res = await page.evaluate(async () => { await N.tape.rec('last_bell', { prompt: false }); return { c: N.tape.counter, paused: N.tape.paused, tin: N.tape.tin.has('slam_book_page'), q: N.hud.toastQueue() }; });
  check(res.c === 905 && !res.paused && res.tin && res.q.some((t) => /RESUMED/.test(t)), 'M11 REC un-greys: 812 -> 905, "SIDE A ▶ RESUMED"', res);
  const tok = await page.evaluate(() => { const a = N.tape.addToken('passport_photo', { name: 'A passport photo of two boys laughing' }); const b = N.tape.addToken('passport_photo', { name: 'again' }); return { a, b, name: N.tape.tokens.passport_photo.name, n: N.tape.tin.size }; });
  check(tok.a === true && tok.b === false && tok.n === 4, 'addToken: new tokens go in the tin once', tok);
  // Side A playback: captions show the J-card lines, the counter runs to 999
  await page.evaluate(() => { window.__caps = []; N.on('caption', (c) => window.__caps.push(c.text)); window.__played = null; N.tape.play('sideA', { gap: 350 }).then((v) => { window.__played = v; }); });
  await sleep(500);
  await shot(page, 'sideA_play');
  await page.waitForFunction(() => window.__played !== null, null, { timeout: 15000 }).catch(() => {});
  await sleep(800);
  const pl = await page.evaluate(() => ({ played: window.__played, caps: window.__caps.filter((c) => /TRACK/.test(c)), counter: N.tape.counter }));
  check(pl.played === true && pl.caps.length === 3 && /TRACK 01/.test(pl.caps[0]) && pl.counter === 999, 'play("sideA"): each J-card line shows, the counter ends on 999', pl);
}

/* ======================================================================= walkman */
async function testWalkman(page) {
  console.log('\n== walkman + 2-in-1');
  await newGame(page);
  const a = await page.evaluate(() => ({ owned: N.walkman.owned, songs: N.walkman.songs(), playing: N.walkman.playing, lib: N.audio.walkman.library, ready: N.audio.ready }));
  check(a.owned && a.songs.length === 0 && !a.playing && a.lib.length === 0, 'new game: walkman owned, no cassettes yet', a);
  const b = await page.evaluate(() => { const n1 = N.walkman.add('cassette_3'); const n2 = N.walkman.add('cassette_3'); N.walkman.add('cassette_1'); return { n1, n2, songs: N.walkman.songs(), lib: N.audio.walkman.library, inv: N.player.inventory.has('cassette_3') }; });
  check(b.n1 && !b.n2 && b.songs.join() === 'r_baraat,r_chandni' && b.lib.join() === 'r_baraat,r_chandni' && b.inv, 'cassettes unlock songs in the order found', b);
  // real RADIO key on foot: tap = next source
  await page.keyboard.press('KeyQ');
  await sleep(700);
  let s = await page.evaluate(() => ({ p: N.walkman.playing, audio: N.audio.walkman.playing, walk: document.querySelector('.mm-walk.show span') && document.querySelector('.mm-walk span').textContent, reels: document.querySelector('.osd-cas').classList.contains('playing') }));
  await shot(page, 'walkman_playing');
  check(s.p && s.p.kind === 'tape' && s.p.id === 'r_baraat' && (!a.ready || s.audio === 'r_baraat') && /BARAAT EXPRESS/.test(s.walk || '') && s.reels, 'Q plays the first found song (HUD now-playing strip, spinning reels)', s);
  await page.keyboard.press('KeyQ'); await sleep(300);
  await page.keyboard.press('KeyQ'); await sleep(500);
  s = await page.evaluate(() => ({ p: N.walkman.playing, radio: N.audio.radio.on, st: N.audio.radio.station }));
  check(s.p && s.p.kind === 'radio' && s.p.id === 'radio:0' && (!a.ready || (s.radio && s.st === 0)), 'next source after the songs: Deccan Vani 101.2 (radio band)', s);
  await page.keyboard.down('KeyQ'); await sleep(850); await page.keyboard.up('KeyQ'); await sleep(200);
  s = await page.evaluate(() => ({ p: N.walkman.playing, radio: N.audio.radio.on, walk: document.querySelector('.mm-walk').classList.contains('show') }));
  check(!s.p && !s.radio && !s.walk, 'holding Q for 0.6 s turns the walkman off', s);
  // touch-style cassette icon (pointer on the OSD button)
  const box = await page.evaluate(() => { const r = document.querySelector('.osd-cas').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(box.x, box.y);
  await sleep(500);
  s = await page.evaluate(() => N.walkman.playing);
  check(s && s.id === 'radio:0', 'the OSD cassette icon is the RADIO button (a click resumes the last source)', s);
  const memo = await page.evaluate(() => { N.walkman.add('cassette_13'); N.walkman.play('cassette_13'); return { p: N.walkman.playing, q: N.hud.toastQueue().join(' | ') }; });
  check(memo.p && memo.p.kind === 'memo' && /Secret Fact No\. 1: Chinnu sleeps/.test(memo.q), 'an Agent tape plays as Immu\'s memo (nickname substituted)', memo);
  await page.evaluate(() => N.walkman.stop());
  // the home 2-in-1
  await page.evaluate(() => { const h = N.places.home; N.player.teleport(h.x + 8, h.y - 6); });
  await sleep(250);
  const lab = await page.evaluate(() => N.input.actionLabel);
  check(lab === '2-in-1' || !!lab, 'at home ACTION offers the 2-in-1 (label: ' + lab + ')', lab);
  await page.evaluate(() => N.walkman.deck.open());
  await sleep(250);
  await page.keyboard.press('ArrowDown'); await sleep(120);
  await page.keyboard.press('KeyE'); await sleep(400);
  const dk = await page.evaluate(() => ({ open: N.walkman.deck.isOpen, rows: document.querySelectorAll('.sc-deck-row').length, sel: document.querySelector('.sc-deck-row.sel') && document.querySelector('.sc-deck-row.sel').textContent, p: N.walkman.playing, locked: N.player.controlsLocked }));
  await shot(page, 'deck');
  check(dk.open && dk.rows === 3 && /C01/.test(dk.sel || '') && dk.p && dk.p.id === 'r_chandni' && dk.locked, '2-in-1 deck: lists cassettes, ↓ + E plays C01', dk);
  await page.keyboard.press('Escape'); await sleep(250);
  const cl = await page.evaluate(() => ({ open: N.walkman.deck.isOpen, mode: N.state.mode, locked: N.player.controlsLocked }));
  check(!cl.open && cl.mode === 'play' && !cl.locked, 'Esc closes the deck (no pause menu)', cl);
  await page.evaluate(() => N.walkman.stop());
}

/* ======================================================================= player */
async function testPlayer(page) {
  console.log('\n== player: money, tummy, energy, statuses, falls');
  await newGame(page);
  await sleep(200);
  const a = await page.evaluate(() => ({ money: N.player.money, tummy: Math.round(N.player.tummy), energy: Math.round(N.player.energy), notch: document.querySelector('.e-notch').style.left }));
  check(a.money === 1000 && a.tummy === 80 && a.energy <= 80 && a.notch === '80%', 'new game: ₹10.00 (1000 paise), tummy 80, energy capped at tummy, notch at 80%', a);
  // drains: standing 0.10/s, running 0.25/s
  const d = await page.evaluate(async () => {
    const p = N.player; p.tummy = 60; p.energy = 60;
    let t0 = p.tummy; await new Promise((r) => setTimeout(r, 2000)); const idle = (t0 - p.tummy) / 2;
    N.input.hold('run', true); N.input.setMove(1, 0);
    t0 = p.tummy; await new Promise((r) => setTimeout(r, 2000)); const run = (t0 - p.tummy) / 2;
    N.input.hold('run', false); N.input.setMove(null);
    return { idle, run, energy: p.energy };
  });
  check(Math.abs(d.idle - 0.10) < 0.03 && Math.abs(d.run - 0.25) < 0.05, 'tummy drains ~0.10/s standing, ~0.25/s running', d);
  const cap = await page.evaluate(async () => { const p = N.player; p.tummy = 30; p.energy = 100; await new Promise((r) => setTimeout(r, 200)); const e1 = p.energy; p.feed(40, { quiet: true }); await new Promise((r) => setTimeout(r, 300)); return { e1, tummy: p.tummy, energy: Math.round(p.energy), notch: document.querySelector('.e-notch').style.left }; });
  check(cap.e1 <= 30.01 && Math.round(cap.tummy) === 70 && cap.energy <= 70 && cap.energy >= 69 && cap.notch === '70%', 'energy never exceeds tummy; feed(40) raises both (notch moves)', cap);
  const hg = await page.evaluate(async () => { const p = N.player; p.tummy = 20; await new Promise((r) => setTimeout(r, 300)); return { hungry: p.hungry, cls: document.querySelector('.hud-energy').classList.contains('hungry'), q: N.hud.toastQueue().join('|') }; });
  check(hg.hungry && hg.cls && /chuhe/.test(hg.q), 'tummy < 25: hungry (chai icon blinks, "Pet mein chuhe daud rahe hain!")', hg);
  await shot(page, 'hungry');
  // statuses
  const st = await page.evaluate(() => {
    const p = N.player; p.tummy = 80;
    p.addStatus('warm'); p.addStatus('knee', { gm: 120 }); p.addStatus('coma', 45); p.addStatus('hair', { value: 2 });
    const o = { warm: p.statusLeft('warm'), knee: Math.round(p.statusLeft('knee')), coma: p.hasStatus('coma'), hair: p.status.hair.value, q: N.hud.toastQueue().join('|') };
    p.clearStatus('coma');
    return o;
  });
  check(st.warm === 60 && st.knee === 120 && st.coma && st.hair === 2 && /Neend/.test(st.q), 'statuses: warm 60 s, knee 120 gm, coma ("Neend aa rahi hai..."), hair', st);
  // quick-item slot
  await page.evaluate(() => { N.player.tummy = 50; N.player.energy = 40; N.player.addItem('osmania_packet', 3); N.player.addItem('mango_bite', 2); });
  await sleep(400);
  const qi = await page.evaluate(() => { const b = document.querySelector('.hud-qitem'); const r = b.getBoundingClientRect(); return { show: b.classList.contains('show'), name: b.querySelector('.q-name').textContent, n: b.querySelector('.q-n').textContent, x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  check(qi.show && qi.name === 'Osmania' && qi.n === '×3', 'quick-item slot shows the best edible (Osmania ×3)', qi);
  await shot(page, 'quickitem');
  await page.mouse.click(qi.x, qi.y);
  await sleep(300);
  const ate = await page.evaluate(() => ({ n: N.player.itemCount('osmania_packet'), tummy: Math.round(N.player.tummy), n2: document.querySelector('.hud-qitem .q-n').textContent }));
  check(ate.n === 2 && ate.tummy >= 64 && ate.n2 === '×2', 'clicking the slot eats one (+15 tummy)', ate);
  // DHADAAM! a hard bump on the cycle throws Chinnu off
  const f = await page.evaluate(async () => {
    const p = N.player; p.tummy = 90; p.energy = 80; p.clearStatus('knee');
    const v = N.debug.enterVehicle('cycle');
    let ev = 0; const h = () => ev++; N.on('player:fall', h);
    await new Promise((r) => setTimeout(r, 100));
    N.emit('bump', { a: v, b: null, speed: 95, x: v.x, y: v.y, wall: true, vehicle: v });
    await new Promise((r) => setTimeout(r, 300));
    const o = { onFoot: !p.vehicle, down: p.downT > 0, knee: p.hasStatus('knee'), energy: Math.round(p.energy), ev, locked: p.controlsLocked, q: N.hud.toastQueue().join('|') };
    await new Promise((r) => setTimeout(r, 1100));
    o.up = p.downT === 0 && !p.controlsLocked;
    N.off('player:fall', h);
    // a soft bump does nothing; a motor bike needs 90
    const v2 = N.debug.enterVehicle('chetak');
    await new Promise((r) => setTimeout(r, 100));
    N.emit('bump', { a: v2, b: null, speed: 80, wall: true, vehicle: v2 });
    o.chetakStays = !!p.vehicle;
    N.vehicles.exit(p, true);
    return o;
  });
  check(f.onFoot && f.down && f.knee && f.energy <= 66 && f.ev === 1 && f.locked && /DHADAAM/.test(f.q) && f.up, 'bike crash at 95 u/s: DHADAAM!, thrown off, knocked down 1 s, −15 energy, scraped knee', f);
  check(f.chetakStays, 'a Chetak bump at 80 u/s (< 90) does not throw him', f);
  // THAK GAYA at tummy 0 (wanted.js may own the flow; entities.js has a fallback)
  const tg = await page.evaluate(async () => {
    const p = N.player; let st = 0, w = 0;
    const h1 = () => st++, h2 = () => w++;
    N.on('player:starving', h1); N.on('wasted', h2);
    p.tummy = 0.01;
    await new Promise((r) => setTimeout(r, 5500));
    N.off('player:starving', h1); N.off('wasted', h2);
    return { st, w, tummy: Math.round(p.tummy), money: p.money };
  });
  check(tg.st === 1 && tg.w >= 1 && tg.tummy >= 40, 'tummy 0 -> player:starving -> THAK GAYA (respawn with tummy 40)', tg);
}

/* ======================================================================= HUD at 3 viewports */
const HUD_SEL = ['.hud-osd', '.hud-stats', '.hud-obj.show', '.hud-timer.show', '.hud-toast.show', '.hud-banner.show', '.hud-district.show', '.hud-minimap', '.hud-qitem.show', '.hud-jcard.show', '.hud-ask.show'];
async function hudOverlaps(page) {
  return page.evaluate((sels) => {
    const boxes = [];
    for (const s of sels) {
      for (const e of document.querySelectorAll('#hud ' + s)) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
        let par = e.parentElement, hidden = false;
        while (par && par.id !== 'hud') { const pc = getComputedStyle(par); if (+pc.opacity < 0.05 || pc.display === 'none') { hidden = true; break; } par = par.parentElement; }
        if (hidden) continue;
        const r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        boxes.push({ s, x: r.x, y: r.y, w: r.width, h: r.height });
      }
    }
    // the touch controls count too (MAP / PAUSE pills, ACTION / RUN / HORN)
    if (document.body.classList.contains('touch-on')) for (const e of document.querySelectorAll('#touch .t-btn')) { const r = e.getBoundingClientRect(); if (r.width > 2) boxes.push({ s: 'touch:' + e.dataset.a, x: r.x, y: r.y, w: r.width, h: r.height }); }
    const over = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.s.startsWith('touch:') && b.s.startsWith('touch:')) continue;
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix > 2 && iy > 2) over.push(a.s + ' x ' + b.s + ' (' + Math.round(ix) + 'x' + Math.round(iy) + ')');
    }
    return { over, n: boxes.length, toasts: document.querySelectorAll('#hud .hud-toast.show').length, list: boxes.map((b) => b.s) };
  }, HUD_SEL);
}
async function testHud(browser) {
  console.log('\n== HUD at 1280x720 / 390x844 / 844x390');
  const VPS = [
    { name: 'desktop', viewport: { width: 1280, height: 720 } },
    { name: 'portrait', viewport: { width: 390, height: 844 }, dpr: 2, touch: true },
    { name: 'landscape', viewport: { width: 844, height: 390 }, dpr: 2, touch: true },
  ];
  for (const V of VPS) {
    const { context, page, errors } = await openPage(browser, V);
    page.__vp = V.name;
    await newGame(page);
    if (V.touch) await page.evaluate(() => { document.body.classList.add('touch-on'); N.input.showTouch && N.input.showTouch(true); });
    // a deliberately busy moment: objective + timer + 4 toasts + walkman + quick item + loop + REC prompt + district card
    await page.evaluate(() => {
      N.missions.done.add('bo_kaata'); N.calendar.set(2003, 1, 24, 16, 30); N.calendar.markStop(N.calendar.dayOf(2003, 1, 14));
      N.clock.minutes = 1439.9; N.clock.update(1);
      N.clock.set(16, 30);
      N.tape.setCounter(83);
      N.walkman.add('cassette_1'); N.walkman.play();
      N.player.addItem('samosa_dozen', 3); N.player.tummy = 64;
      N.hud.objective('Every capsule needs a box. Find the clock tower that talks with half its faces; buy a tin that smells of fruit.');
      N.hud.timer('CHAI RUN', 42, { countdown: false });
      N.hud.toast('Sankranti! Kites in every sky.'); N.hud.toast('Cassette C01 found'); N.hud.toast('Bus fast travel unlocked'); N.hud.toast('Sankranti! Kites in every sky.');
      N.hud.districtBanner('Himayatnagar & Narayanguda', 'హిమాయత్‌నగర్');
    });
    await sleep(900);
    let o = await hudOverlaps(page);
    await shot(page, 'hud_busy');
    check(o.over.length === 0, V.name + ': busy HUD (objective, timer, toast, district, walkman, quick item) has no overlaps', o);
    check(o.toasts <= 1, V.name + ': at most one toast is visible (' + o.toasts + ')', o.toasts);
    const q = await page.evaluate(() => N.hud.toastQueue());
    check(q.filter((t) => /Sankranti/.test(t)).length === 1, V.name + ': duplicate toasts are merged', q);
    // a banner owns the centre: toasts held, district card waits
    await page.evaluate(() => { N.hud.banner('MISSION PASSED', 'TRACK 01 · BO KAATA! · TERRACE, SANKRANTI   ₹ 10.00', 3000, { kind: 'pass', note: 'your name is spelt wrong. —I' }); N.hud.toast('Into the tin: The kite corner'); N.hud.districtBanner('Basheerbagh', 'బషీర్‌బాగ్'); });
    await sleep(700);
    o = await hudOverlaps(page);
    const held = await page.evaluate(() => ({ held: document.querySelector('.hud-toasts').classList.contains('held'), dist: document.querySelector('.hud-district').classList.contains('show'), note: document.querySelector('.b-note').textContent }));
    await shot(page, 'hud_banner');
    check(o.over.length === 0 && held.held && !held.dist && /spelt wrong/.test(held.note), V.name + ': MISSION PASSED card (J-card line + scribble) holds toasts and the district card', Object.assign(held, o));
    await sleep(3200);
    const after = await page.evaluate(() => ({ dist: document.querySelector('.hud-district').classList.contains('show'), name: document.querySelector('.hud-district .d-name').textContent }));
    check(after.dist && after.name === 'Basheerbagh', V.name + ': the district card shows after the banner', after);
    // sound captions
    await page.evaluate(() => { const p = N.player; N.audio.sfx('whistle', { x: p.x + 200, y: p.y - 120 }); N.audio.sfx('chappal_whoosh', { x: p.x - 90, y: p.y + 30 }); N.hud.caption('● REC', { kind: 'rec' }); });
    await sleep(300);
    const caps = await page.evaluate(() => Array.from(document.querySelectorAll('.hud-cap.show')).map((e) => e.textContent));
    await shot(page, 'hud_captions');
    check(caps.some((c) => /^\[whistle [↗→]\]$/.test(c)) && caps.some((c) => /^\[chappal whoosh [←↙]\]$/.test(c)) && caps.indexOf('[● REC]') >= 0, V.name + ': sound captions with direction arrows', caps);
    // J-card prompt card
    await page.evaluate(() => { N.walkman.stop(); N.hud.timer(null); const g = N.places.giver_himayatnagar; N.player.teleport(g.x, g.y); });
    await sleep(500);
    o = await hudOverlaps(page);
    const jc = await page.evaluate(() => ({ show: !!document.querySelector('.hud-jcard.show'), title: document.querySelector('.hud-jcard .jc-title').textContent, mission: N.missions.active && N.missions.active.id }));
    await shot(page, 'hud_jcard');
    check(jc.show && o.over.length === 0, V.name + ': J-card prompt card fits without overlaps', Object.assign(jc, o));
    await page.waitForFunction(() => N.missions.active, null, { timeout: 3000 }).catch(() => {});
    await page.evaluate(() => N.missions.abort());
    const errs = await errorsOf(page, errors);
    check(errs.length === 0, V.name + ': no console errors', errs);
    await context.close();
  }
}

/* ======================================================================= missions */
async function testMissions(page) {
  console.log('\n== missions: J-card prompt (DEMO), kinds, date jump, saves, help');
  await newGame(page);
  await page.evaluate(() => { window.__ms = []; N.on('mission:start', (e) => window.__ms.push(e.id)); });
  // walk in -> card; step out -> cancelled
  const g = await page.evaluate(() => { const g = N.places.giver_himayatnagar; N.player.teleport(g.x + 40, g.y); return { x: g.x, y: g.y }; });
  await sleep(200);
  await page.keyboard.down('KeyA'); await sleep(820); await page.keyboard.up('KeyA');
  await sleep(150);
  let s = await page.evaluate(() => ({ card: !!document.querySelector('.hud-jcard.show'), head: document.querySelector('.jc-head').textContent, title: document.querySelector('.jc-title').textContent, sub: document.querySelector('.jc-sub').textContent, label: N.input.actionLabel, active: !!N.missions.active, prompt: N.missions.prompt }));
  await shot(page, 'jcard_prompt');
  check(s.card && s.title === 'CHAI BEFORE SUNSET' && /TUE 14 JAN 2003/.test(s.sub) && s.label === '▶ PLAY' && s.prompt === 'demo_chai_run', 'walking into the giver shows the J-card (title, date, "▶ PLAY")', s);
  check(!s.active, 'walking in does not start the mission by itself', s);
  await page.evaluate((g) => N.player.teleport(g.x + 60, g.y), g);
  await sleep(1300);
  s = await page.evaluate(() => ({ card: !!document.querySelector('.hud-jcard.show'), active: !!N.missions.active }));
  check(!s.card && !s.active, 'stepping out cancels ("Not now")', s);
  // walk in + ACTION starts
  await page.evaluate((g) => N.player.teleport(g.x, g.y), g);
  await sleep(250);
  await page.keyboard.press('KeyE');
  await sleep(250);
  s = await page.evaluate(() => ({ active: N.missions.active && N.missions.active.id, card: !!document.querySelector('.hud-jcard.show'), kind: N.missions.kindOf('demo_chai_run') }));
  check(s.active === 'demo_chai_run' && !s.card && s.kind === 'main', 'ACTION on the card starts the DEMO mission', s);
  // saves are refused during a mission
  const sv = await page.evaluate(() => ({ booth: N.save.save({ reason: 'booth' }), can: N.missions.canSave(), q: N.hud.toastQueue().join('|'), has: N.save.has() }));
  check(sv.booth === false && !sv.can.ok && /Save after the mission/.test(sv.q) && !sv.has, 'saving at a booth is refused during a mission ("Save after the mission, beta.")', sv);
  await page.evaluate(() => N.missions.abort());
  // dwell 1.0 s starts it too
  await page.evaluate((g) => { N.player.teleport(g.x + 60, g.y); }, g);
  await sleep(300);
  await page.evaluate((g) => N.player.teleport(g.x, g.y), g);
  await page.waitForFunction(() => N.missions.active, null, { timeout: 3000 }).catch(() => {});
  s = await page.evaluate(() => ({ active: N.missions.active && N.missions.active.id }));
  check(s.active === 'demo_chai_run', 'standing in the marker for 1.0 s starts it', s);
  await page.evaluate(() => N.missions.abort());

  // a dated main mission: the calendar jumps (VHS ▶▶) before the script, MISSION PASSED card, end time
  const dj = await page.evaluate(async () => {
    N.missions.register({ id: '__sc_dated', title: 'QA Dated', track: 3, date: [2003, 2, 8, 5, 15], end: [2003, 2, 8, 10, 30], jcard: 'TRACK 03 · QA · TEST', scribble: 'qa scribble —I', rec: false,
      script: async (m) => { window.__dj = { label: N.calendar.label(), clock: N.clock.label() }; await m.wait(0.2); } });
    N.missions.start('__sc_dated');
    await new Promise((r) => setTimeout(r, 700));
    const mid = { jumping: N.calendar.jumping, vhs: N.render.fx.vhs };
    await new Promise((r) => setTimeout(r, 1500));
    return { mid, inScript: window.__dj, done: N.missions.isDone('__sc_dated'), after: N.calendar.label() + ' ' + N.clock.label(), banner: document.querySelector('.hud-banner .b-sub').textContent, note: document.querySelector('.hud-banner .b-note') && document.querySelector('.hud-banner .b-note').textContent };
  });
  check(dj.mid.jumping && dj.mid.vhs > 0.3 && dj.inScript && dj.inScript.label === 'SAT 08 FEB 2003' && dj.inScript.clock === '05:15', 'a dated main mission jumps to its date (▶▶) before the script runs', dj);
  check(dj.done && /^SAT 08 FEB 2003 10:3/.test(dj.after) && /TRACK 03 · QA/.test(dj.banner) && /qa scribble/.test(dj.note || ''), 'MISSION PASSED shows the J-card line + scribble; free roam resumes at the end time', dj);
  // a bible mission without a REC in its script gets the ● REC moment before MISSION PASSED
  const br = await page.evaluate(async () => {
    N.missions.register({ id: 'bo_kaata', script: async (m) => { await m.wait(0.1); } });
    const def = N.missions.defs.bo_kaata;
    const o = { date: def.date && def.date.join('-'), title: def.title, track: def.track };
    N.missions.start('bo_kaata');
    await new Promise((r) => setTimeout(r, 2100));
    o.recPrompt = N.tape.recState && N.tape.recState.phase;
    N.input.press('action');
    await new Promise((r) => setTimeout(r, 2600));
    o.done = N.missions.isDone('bo_kaata'); o.counter = N.tape.counter; o.tin = N.tape.tin.has('kite_corner'); o.date = o.date + ' / ' + N.calendar.label() + ' ' + N.clock.label();
    o.saved = N.save.has();
    return o;
  });
  check(br.title === 'Bo Kaata!' && br.track === 1 && br.recPrompt === 'prompt' && br.done && br.counter === 83 && br.tin, 'bible defaults fill M1 (title, track, date); its ● REC runs before MISSION PASSED', br);
  check(/TUE 14 JAN 2003 18:2/.test(br.date) && br.saved, 'M1 ends at 18:20 and autosaves ("SIDE A saved ●")', br);

  // help after repeated fails: "Let Immu do it" after 3 lost tries of the same minigame
  const hp = await page.evaluate(async () => {
    const activeBefore = N.missions.active ? N.missions.active.id : null;
    const MG = N.minigames;
    const origStart = MG && MG.start, origHas = MG && MG.has;
    const fakeMG = MG || (N.minigames = {});
    fakeMG.has = (id) => id === '__qa_game' || (origHas ? origHas.call(MG, id) : false);
    fakeMG.start = (id, p) => id === '__qa_game' ? Promise.resolve({ id, win: false, stars: 0 }) : origStart.call(MG, id, p);
    N.missions.register({ id: '__sc_help', title: 'QA Help', kind: 'side', script: async (m) => { m.checkpoint('start'); const r = await m.minigame('__qa_game', {}); if (!r.win) m.fail('Lost!'); window.__assisted = !!r.assisted; } });
    const labels = [];
    for (let i = 0; i < 3; i++) {
      if (i === 0) N.missions.start('__sc_help'); else N.missions.retry();
      await new Promise((r) => setTimeout(r, 1900));
      labels.push(Array.from(document.querySelectorAll('.hud-ask button')).map((b) => b.textContent.trim()).join(' / '));
    }
    const btn = Array.from(document.querySelectorAll('.hud-ask button')).find((b) => /Let Immu/.test(b.textContent));
    if (btn) btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 600));
    const out = { activeBefore, labels, assisted: window.__assisted, done: N.missions.isDone('__sc_help'), q: N.hud.toastQueue().join('|'), mode: N.state.mode, errs: N.errors.map((e) => e.where + ': ' + e.msg.slice(0, 160)) };
    if (MG) { MG.start = origStart; MG.has = origHas; }
    return out;
  });
  await shot(page, 'help_card');
  check(!/Let Immu/.test(hp.labels[0]) && !/Let Immu/.test(hp.labels[1]) && /Retry from checkpoint.*Let Immu do it.*Free roam/.test(hp.labels[2]), 'after 3 lost tries the retry card offers "Let Immu do it"', hp.labels);
  check(hp.assisted && hp.done && /Watch the master/.test(hp.q), '"Let Immu do it" passes the minigame (1 star, teasing line)', hp);
  // timer help: 2 timer fails -> +25%
  const th = await page.evaluate(async () => {
    N.missions.register({ id: '__sc_timer', title: 'QA Timer', kind: 'job', script: async (m) => { m.timer(1, 'QA'); await m.wait(30); } });
    N.missions.start('__sc_timer'); await new Promise((r) => setTimeout(r, 1600));
    N.missions.retry(); await new Promise((r) => setTimeout(r, 1600));
    const streak = N.missions.streaks.timer.__sc_timer;
    N.missions.retry(); await new Promise((r) => setTimeout(r, 120));
    const t = N.hud.timerValue();
    const q = N.hud.toastQueue().join('|');
    N.missions.abort();
    return { streak, t, q };
  });
  check(th.streak === 2 && th.t > 1.05 && th.t <= 1.25 && /extra time/.test(th.q), 'after 2 timer fails the timer gets +25% ("Bunty-anna says: extra time")', th);
  // kinds: one main giver at a time; side givers only in their window
  const kd = await page.evaluate(() => {
    N.missions.done.add('demo_chai_run');
    const g = N.places.giver_himayatnagar;
    N.player.teleport(g.x, g.y + 400);
    N.missions.register({ id: '__sc_m1', title: 'Main A', giver: { place: 'giver_himayatnagar' }, script: async () => {} });
    N.missions.register({ id: '__sc_m2', title: 'Main B', giver: { x: g.x + 200, y: g.y }, script: async () => {} });
    N.missions.register({ id: '__sc_s1', title: 'Side', kind: 'side', window: { from: '06:00', to: '08:00' }, giver: { x: g.x - 200, y: g.y }, script: async () => {} });
    N.clock.set(16, 0);
    N.systems.get('missions').update(0.6);
    const a = N.missions.markers().filter((m) => m.kind === 'giver').map((m) => m.id);
    N.clock.set(7, 0);
    N.systems.get('missions').update(0.6);
    const b = N.missions.markers().filter((m) => m.kind === 'giver').map((m) => m.id);
    for (const id of ['__sc_m1', '__sc_m2', '__sc_s1']) N.missions.done.add(id);
    return { a, b };
  });
  check(kd.a.join() === '__sc_m1' && kd.b.join() === '__sc_m1,__sc_s1', 'one main giver at a time; side givers only inside their window', kd);
}

/* ======================================================================= save / reload */
async function testSave(browser) {
  console.log('\n== save -> reload -> continue');
  const { context, page, errors } = await openPage(browser, { viewport: { width: 1280, height: 720 } });
  page.__vp = 'desktop';
  await newGame(page);
  const before = await page.evaluate(async () => {
    N.missions.done.add('bo_kaata');
    N.calendar.set(2003, 1, 20, 11, 0); N.calendar.markStop(0);
    await N.tape.rec('bo_kaata', { prompt: false });
    N.tape.addToken('passport_photo', { name: 'Passport photo' });
    N.tape.pause(true);
    N.walkman.add('cassette_5'); N.walkman.add('cassette_14');
    N.hints.register('lost_and_found', { clue: 'Every capsule needs a box.', answer: 'mozamjahi_market', ammamma: 'A tower that talks? Clocks talk, *kanna*. Mozamjahi.' });
    N.hints.start('lost_and_found');
    const p = N.player; p.tummy = 47; p.energy = 30; p.addStatus('knee', { gm: 100 }); p.addItem('glucose', 2);
    const ok = N.save.save({ reason: 'booth' });
    return { ok, counter: N.tape.counter, loop: Object.assign({}, N.clock.loop) };
  });
  check(before.ok, 'free-roam save at a booth works');
  await page.reload();
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 20000 });
  const after = await page.evaluate(() => {
    N.game.continueGame();
    const p = N.player;
    return { counter: N.tape.counter, paused: N.tape.paused, tracks: N.tape.tracks.map((t) => t.id), tin: Array.from(N.tape.tin).sort().join(), songs: N.walkman.songs().join(), cas: Array.from(N.walkman.cassettes).join(),
      label: N.calendar.label(), clock: N.clock.label(), loop: N.clock.loop, tummy: Math.round(p.tummy), energy: Math.round(p.energy), knee: Math.round(p.statusLeft('knee')), glucose: p.itemCount('glucose'),
      hint: N.hints.active && N.hints.active.id, money: p.money, mode: N.state.mode };
  });
  check(after.mode === 'play' && after.counter === 83 && after.paused && after.tracks.join() === 'bo_kaata' && after.tin === 'kite_corner,passport_photo', 'tape: counter, ■ PAUSED, tracks and the tin survive a reload', after);
  check(after.songs === 'r_neon' && after.cas === 'cassette_5,cassette_14', 'walkman: cassettes and songs survive', after);
  check(after.label === 'MON 20 JAN 2003' && after.loop && after.loop.from === before.loop.from && after.loop.to === before.loop.to, 'calendar date and week loop survive', { after: after.loop, before: before.loop });
  check(after.tummy === 47 && after.energy === 30 && after.knee > 90 && after.knee <= 100 && after.glucose === 2 && after.hint === 'lost_and_found', 'player tummy, statuses, items and the active clue survive', after);
  // hints: sources + nudges
  const hn = await page.evaluate(() => {
    const out = {};
    out.home = N.hints.next('home');
    out.auto = N.hints.next('auto');
    out.c1 = N.hints.next('city'); out.c2 = N.hints.next('city'); out.c3 = N.hints.next('city');
    out.aunty = N.hints.next('aunty');
    out.blip = N.hud.blips.has('hint:aunty');
    const A = N.hints.active; A; // nudges: fast-forward the timer
    N.hud.objective('Every capsule needs a box.');
    const sys = N.systems.get('storycore');
    for (let i = 0; i < 60; i++) sys.update(3.1);
    out.obj = N.hud.objectiveText;
    out.circles = N.hud.circles.size;
    out.nudge = N.hints.active.nudge;
    out.ps = N.hints.active.ps;
    return out;
  });
  check(/Mozamjahi/.test(hn.home.text) && hn.home.tier === 1, 'Ammamma (home/std) gives the plain hint', hn.home);
  check(hn.auto.tier === 2 && hn.auto.target && hn.auto.cost === 500, "Yadagiri's auto: a drop point near the answer (₹5)", hn.auto);
  check(hn.c1.deflect && hn.c2.deflect && !hn.c3.deflect && hn.c3.place === 'mozamjahi_market', 'Ask the city: the third local answers', [hn.c1, hn.c2, hn.c3]);
  check(hn.aunty.tier === 3 && hn.aunty.meter === 1 && hn.blip, 'aunty network blips the answer (+1 meter later)', hn.aunty);
  check(/Stuck\? Ammamma knows/.test(hn.obj || '') && hn.circles === 1 && hn.nudge === 4 && /PS: it's Mozamjahi/.test(hn.ps || ''), 'timed nudges: objective tip, search circle, Immu\'s PS', hn);
  await shot(page, 'hints_circle');
  const errs = await errorsOf(page, errors);
  check(errs.length === 0, 'save test: no console errors', errs);
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (want('calendar') || want('tape') || want('walkman') || want('player') || want('missions')) {
      const { context, page, errors } = await openPage(browser, { viewport: { width: 1280, height: 720 } });
      page.__vp = 'desktop';
      try {
        if (want('calendar')) await testCalendar(page);
        if (want('tape')) await testTape(page);
        if (want('walkman')) await testWalkman(page);
        if (want('player')) await testPlayer(page);
        if (want('missions')) await testMissions(page);
      } catch (e) { check(false, 'exception: ' + (e.stack || e.message)); }
      const errs = await errorsOf(page, errors);
      check(errs.length === 0, 'desktop run: no console errors', errs);
      await context.close();
    }
    if (want('hud')) { try { await testHud(browser); } catch (e) { check(false, 'hud exception: ' + (e.stack || e.message)); } }
    if (want('save')) { try { await testSave(browser); } catch (e) { check(false, 'save exception: ' + (e.stack || e.message)); } }
  } finally { await browser.close(); }
  console.log('\nScreenshots: ' + OUT);
  console.log(passes + ' passed, ' + failures.length + ' failed');
  if (failures.length) { console.log('\nSTORYCORE FAILED:\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('STORYCORE PASSED');
})();
