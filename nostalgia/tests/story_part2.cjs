/* NOSTALGIA — tests/story_part2.cjs  (story agent, part 2)
 * Plays Side A from the midpoint to the end of the tape, and Side B, in headless Chromium:
 *   setup     a SAVE STATE where M1-M6 are done (missions, the tape at 498 with its tracks and tokens,
 *             lock digits 1 and 4, cassettes / kites / tickets found) is written with N.save, the page
 *             is reloaded and CONTINUE loads it.
 *   M7..M12   each mission played to MISSION PASSED (debug-assisted travel: N.story2.probe() says
 *             where the step wants the player, N.story2.tp() moves him), with REAL key input for at
 *             least one beat each (walking into the giver with the arrows, E on ● REC, choices with
 *             ↑/↓ + E, the Charminar gallery pan with the arrows, the self-timer, the claps, ...).
 *   interlude ■ PAUSED 812;  M11 resumes Side A (905);  M12 fills it (999).
 *   SA5-SA8   the twelve o'clock gong, Bunty-anna's races R1-R4, new class / old books, Christmas stars.
 *   ending    at Charminar (Thu 27 Nov 2003): kites found rise, the plane light, the claps, Side A plays.
 *   epilogue  Sat 17 Jan 2026 on the Charminar plaza: Side B's tail reflects the cassettes found, the
 *             1-4-0-1 lock dial with real keys (one wrong try first), the tin, the album, the photo.
 *   credits   the definitions card, the credits with the A1 map line and the three.js MIT line,
 *             post-credits ◀◀ REWIND (December with real keys), Ayesha's lorry, SA8.
 * Fails on any console error, page error or N.err. Screenshots: tests/out/story_part2/.
 *
 *   node nostalgia/tests/story_part2.cjs        STABLE=1 serves any src file that does not parse right now
 *                                               (another agent mid-edit) from git HEAD.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'story_part2');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
let passes = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(cond, msg, data) {
  if (cond) { passes++; console.log('  ok   ' + msg); }
  else { failures.push(msg + (data !== undefined ? '  ' + JSON.stringify(data).slice(0, 700) : '')); console.log('  FAIL ' + msg + (data !== undefined ? '  ' + JSON.stringify(data).slice(0, 700) : '')); }
}
const T0 = Date.now();
// START=M8|SA6|M9|M10|M11|M12|END begins later (the save state then has the missions before it done)
const PH = ['M7', 'SA7', 'SA5', 'M8', 'SA6', 'M9', 'M10', 'M11', 'M12', 'END'];
const START = process.env.START || 'M7';
const from = (ph) => PH.indexOf(ph) >= PH.indexOf(START);
const log = (s) => console.log('[' + ((Date.now() - T0) / 1000).toFixed(0).padStart(4) + 's] ' + s);

async function openPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  if (process.env.STABLE) {
    await page.route(/\/src\/[\w.]+\.js$/, (r) => {
      const rel = 'src/' + r.request().url().split('/src/').pop();
      let body = null;
      try { body = fs.readFileSync(path.join(ROOT, rel), 'utf8'); new (require('vm').Script)(body); } catch (e) {
        try { body = require('child_process').execSync('git show HEAD:nostalgia/' + rel, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }); console.log('  (STABLE: ' + rel + ' does not parse; using HEAD)'); } catch (e2) { body = null; }
      }
      if (body == null) return r.continue();
      return r.fulfill({ status: 200, contentType: 'text/javascript', body });
    });
  }
  return { context, page, errors };
}
async function boot(page) {
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  await page.mouse.click(2, 2);
  await page.evaluate(() => { const d = document.getElementById('debug'); if (d) d.classList.add('hide'); });
}
const probe = (page) => page.evaluate(() => {
  // the autopilot never stops to eat: keep Chinnu fed so THAK GAYA (another module's flow) does not interrupt the run
  const pl = N.player;
  if (pl && pl.tummy != null && pl.tummy < 60) { try { if (pl.feed) pl.feed(60, { quiet: true }); else pl.tummy = 80; } catch (e) { pl.tummy = 80; } }
  if (pl && pl.energy < 50 && !N.story2.state().epilogue) pl.energy = 80;
  const s = N.story2.probe();
  s.shop = !!(N.shops && N.shops.isOpen && N.shops.isOpen());
  s.defs = !!document.querySelector('.mn-defs.show');
  s.credits = !!document.querySelector('.mn-credits.show');
  s.journal = N.state.mode === 'journal';
  s.mgResult = !!document.querySelector('.mg-card-result');
  return s;
});
async function shot(page, name) { try { await page.screenshot({ path: path.join(OUT, name + '.png') }); } catch (e) { console.log('  (screenshot failed: ' + name + ')'); } }
async function errorsOf(page, errors) {
  const s = await page.evaluate(() => N.debug.state().errors);
  return errors.concat(s.map((e) => 'N.err ' + e));
}

// offers the autopilot may take with a real E press (story steps only; never shops or random talks)
// the missions that hand him a cycle / Scooty to ride (M8 parcel, M9 tiffin + race, SA6); elsewhere a parked one is scenery
const RIDE_OK = /^(drums_for_amma|opening_day|bunty_races)/;
const STORY_OFFER = /^(CLAP \(|Set the self|Drag Nanna|Nanna,|Look down|Leave the cake|Send Immu|Get in the boat|Board the bus|Ask about|▶ PLAY|● REC|Climb to the|Go up|Up to|Ride (Hero|Hercules|Scooty|BSA|cycle|Ladies))/;
/** The autopilot: teleports to where the step wants the player, presses E (a real key) for story offers,
 *  ● REC prompts and cards, skips cutscenes (unless keepCut), lets autoplay minigames run. */
async function drive(page, done, o) {
  o = o || {};
  const t0 = Date.now();
  let s = null, lastKey = '', same = 0, dlgT = 0, mgT = 0;
  while (Date.now() - t0 < (o.timeout || 180000)) {
    s = await probe(page);
    if (await done(s)) return s;
    if (o.each) { const r = await o.each(s); if (r === 'skip') { await sleep(120); continue; } }
    const key = [s.mission, s.scene, s.objective, s.target && Math.round(s.target.x), s.offer, s.mode].join('|');
    if (key === lastKey) same++; else { same = 0; lastKey = key; }
    if (s.shop) { await page.evaluate(() => { try { N.shops.close(); } catch (e) { /* ignore */ } }); await sleep(250); continue; }
    if (s.journal) { await page.keyboard.press('Escape'); await sleep(250); continue; }
    if (s.defs) { await page.keyboard.press('KeyE'); await sleep(400); continue; }
    if (s.credits) { await page.keyboard.press('Escape'); await sleep(400); continue; }
    if (s.cut && !o.keepCut) { await page.evaluate(() => { if (N.menus.skipCutscene) N.menus.skipCutscene(); }); await sleep(200); continue; }
    if (s.mg || s.mode === 'minigame') {
      // autoplay closes its result card itself; at a very low frame rate that timer can miss, so press Enter
      if (s.mgResult) { mgT = mgT || Date.now(); if (Date.now() - mgT > 2500) { await page.keyboard.press('Enter'); mgT = Date.now(); } } else mgT = 0;
      await sleep(300); continue;
    }
    if (s.rec === 'prompt') { await page.keyboard.press('KeyE'); await sleep(250); continue; }
    if (s.panel) { if (o.panel && (await o.panel(s)) !== false) { await sleep(200); continue; } await page.keyboard.press('KeyE'); await sleep(350); continue; }
    if (s.dialog || s.mode === 'dialogue') {
      // with skipDialogue on every new line resolves at once: a box that stays up was shown before it
      dlgT = dlgT || Date.now();
      if (Date.now() - dlgT > 1500) { await page.keyboard.press('KeyE'); dlgT = Date.now(); }
      await sleep(120); continue;
    }
    dlgT = 0;
    if (s.mode === 'play') {
      if (s.gallery) { await galleryKeys(page, s); continue; }
      if (s.offer && STORY_OFFER.test(s.offer) && (!s.target || s.dist <= 44) && (!/^Ride /.test(s.offer) || RIDE_OK.test(s.mission || ''))) { await page.keyboard.press('KeyE'); await sleep(220); continue; }
      if (s.target && s.dist > (o.near || 16)) { await page.evaluate(([x, y]) => N.story2.tp(x, y), [s.target.x, s.target.y]); await sleep(o.tpWait || 160); continue; }
      if (same > 40 && s.target) { await page.evaluate(([x, y]) => N.story2.tp(x + 6, y + 6), [s.target.x, s.target.y]); same = 0; }
    }
    await sleep(160);
  }
  throw new Error('drive timeout: ' + JSON.stringify(s));
}
/** Real arrow keys: walk the player on foot to (x, y). */
async function walkKeys(page, x, y, r, maxMs) {
  r = r || 14;
  const t0 = Date.now();
  let held = new Set();
  const set = async (keys) => { for (const k of held) if (!keys.has(k)) await page.keyboard.up(k); for (const k of keys) if (!held.has(k)) await page.keyboard.down(k); held = keys; };
  let d = Infinity;
  while (Date.now() - t0 < (maxMs || 12000)) {
    const p = await page.evaluate(() => ({ x: N.player.x, y: N.player.y, mode: N.state.mode }));
    if (p.mode !== 'play') break;
    const dx = x - p.x, dy = y - p.y; d = Math.hypot(dx, dy);
    if (d <= r) break;
    const keys = new Set();
    if (dx > 5) keys.add('ArrowRight'); if (dx < -5) keys.add('ArrowLeft'); if (dy > 5) keys.add('ArrowDown'); if (dy < -5) keys.add('ArrowUp');
    await set(keys);
    await sleep(70);
  }
  await set(new Set());
  return d;
}
/** M12 gallery: pan the camera with the arrows until the raincoat is centred, then E (all real keys). */
async function galleryKeys(page, s) {
  const g = s.gallery;
  const dx = g.coat.x - g.cam.x, dy = g.coat.y - g.cam.y;
  if (Math.hypot(dx, dy) < 60) { await page.keyboard.press('KeyE'); await sleep(250); return; }
  const keys = [];
  if (dx > 20) keys.push('ArrowRight'); if (dx < -20) keys.push('ArrowLeft'); if (dy > 20) keys.push('ArrowDown'); if (dy < -20) keys.push('ArrowUp');
  for (const k of keys) await page.keyboard.down(k);
  await sleep(120);
  for (const k of keys) await page.keyboard.up(k);
}
/** Dialogue with real keys until the box closes: E advances; at a choice, ↓ st.choices[st.ci] times then E. */
async function talkKeys(page, st, o) {
  o = o || {};
  const t0 = Date.now();
  let opened = false;
  for (;;) {
    if (Date.now() - t0 > (o.max || 30000)) return;
    const d = await page.evaluate(() => ({ open: N.dialogue.isOpen(), cur: N.dialogue.current ? { choices: N.dialogue.current.choices, typing: N.dialogue.current.typing } : null }));
    if (!d.open) { if (opened || Date.now() - t0 > (o.wait || 6000)) return; await sleep(120); continue; }
    opened = true;
    if (d.cur && d.cur.choices && d.cur.choices.length && !d.cur.typing) {
      const want = st.ci < st.choices.length ? st.choices[st.ci] : 0;
      st.ci++;
      for (let k = 0; k < want; k++) { await page.keyboard.press('ArrowDown'); await sleep(90); }
      await page.keyboard.press('KeyE');
      await sleep(280);
      continue;
    }
    await page.keyboard.press('KeyE');
    await sleep(150);
    if (process.env.DEBUG_TALK && ++st.dbg % 25 === 0) console.log('  talkKeys:', JSON.stringify(await page.evaluate(() => ({ mode: N.state.mode, open: N.dialogue.isOpen(), cur: N.dialogue.current ? { s: N.dialogue.current.speaker, t: String(N.dialogue.current.text).slice(0, 60), typing: N.dialogue.current.typing, ch: N.dialogue.current.choices } : null, skip: N.dialogue.skip, stack: N.state.stack || null }))));
  }
}
async function waitMission(page, id, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 20000)) { const a = await page.evaluate(() => N.missions.active && N.missions.active.id); if (a === id) return true; await sleep(100); }
  return false;
}
const passed = (id) => (s) => s.mission !== id && s.scene == null;
/** Start a mission once the game is idle (play mode, no mission, scene or card up; a Chappal Meter left over
 *  from M7 running late, level 2, is cleared first so the mothers do not catch him mid-errand), and wait until it runs. */
async function startM(page, id) {
  for (let k = 0; k < 3; k++) {
    await page.waitForFunction(() => N.state.mode === 'play' && !N.missions.active && !N.story2.state().scene && !N.story2.state().panel, null, { timeout: 15000 }).catch(() => {});
    const r = await page.evaluate((mid) => { if (N.wanted && N.wanted.level > 0 && N.wanted.set) N.wanted.set(0, 'test'); const ok = N.debug.startMission(mid); return { ok, active: N.missions.active && N.missions.active.id, mode: N.state.mode, done: N.missions.isDone(mid) }; }, id);
    if (r.done || (await waitMission(page, id, 6000))) return true;
    console.log('  (start ' + id + ' again: ' + JSON.stringify(r) + ')');
  }
  return false;
}
/** Test speed-ups (minigames autoplay; escorts walk faster; dialogue instant). */
async function retune(page) {
  await page.evaluate(() => {
    N.story2.TUNE.mg = { autoplay: 'win', skipHowto: true, timeScale: 8 };
    N.story2.TUNE.escortSpeed = 4; N.story2.TUNE.climbSecs = 2; N.story2.TUNE.galleryFind = 60;
    N.debug.skipDialogue(true);
    if (N.npcs && N.npcs.schedule) N.npcs.schedule('colony_aunties', false);
  });
}
/** Reload the page and CONTINUE the autosave (what a player who quits right after MISSION PASSED gets). */
async function reloadContinue(page) {
  await page.reload();
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  await page.mouse.click(2, 2);
  await page.evaluate(() => { const d = document.getElementById('debug'); if (d) d.classList.add('hide'); N.game.continueGame(); });
  await retune(page);
}

/* ======================================================================= the run */
(async () => {
  const browser = await chromium.launch();
  const { page, errors } = await openPage(browser);
  try {
    await boot(page);
    /* ------------------------------------------------ setup: a save state with M1-M6 done */
    log('setup: save state M1-M6 done');
    const setup = await page.evaluate((start) => {
      N.debug.newGame({ skipIntro: true });
      N.save.clear();
      const M16 = ['bo_kaata', 'lost_and_found', 'first_day_first_show', 'last_man_batting', 'right_right', 'ammammas_thursday'];
      const LATER = { M8: ['the_clap'], SA6: ['the_clap'], M9: ['the_clap', 'drums_for_amma'], M10: ['the_clap', 'drums_for_amma', 'opening_day'], M11: ['the_clap', 'drums_for_amma', 'opening_day', 'agle_baras'], M12: ['the_clap', 'drums_for_amma', 'opening_day', 'agle_baras', 'last_bell'], END: ['the_clap', 'drums_for_amma', 'opening_day', 'agle_baras', 'last_bell', 'chand_raat'] }[start] || [];
      // the kites are found before Chand Raat (found after it they are 'late' and stay out of the ending)
      for (const s of ['kites', 'golis', 'frames', 'tickets']) { try { N.collectibles.unlockSeries(s, { silent: true }); } catch (e) { /* ignore */ } }
      for (const k of ['kite_1', 'kite_3', 'kite_7']) { try { N.collectibles.found(k, { silent: true }); } catch (e) { /* ignore */ } }
      N.missions.deserialize({ done: M16.concat(LATER) });
      for (const id of M16) N.tape.rec(id, { silent: true });
      for (const id of LATER) N.tape.rec(id, { silent: true });
      if (LATER.indexOf('agle_baras') >= 0) Object.assign(N.flags, { interlude_done: true, ayesha_moving: true, lock_4: 1, riddle_4: true, clue_tunnel: true });
      if (LATER.indexOf('last_bell') >= 0) Object.assign(N.flags, { lock_3: 0, riddle_3: true });
      if (LATER.indexOf('chand_raat') >= 0) Object.assign(N.flags, { tin_locked: true, frame_24: true });
      const f = N.flags;
      Object.assign(f, { prologue_seen: true, clue5_solved: true, lock_1: 1, riddle_1: true, lock_2: 4, riddle_2: true });
      for (const c of ['cassette_1', 'cassette_5', 'cassette_9', 'cassette_13', 'cassette_14', 'cassette_15', 'cassette_16']) N.walkman.add(c, { silent: true });
      N.player.inventory.add('camera'); N.player.inventory.add('walkman');
      N.calendar.set(2003, 5, 15, 19, 30);
      N.player.money = 20000;
      const h = N.places.home; N.player.teleport(h.x, h.y + 30);
      const ok = N.save.save({ reason: 'mission', toast: false });
      return { ok, counter: N.tape.counter, done: Array.from(N.missions.done), kites: N.collectibles.count('kites') };
    }, START);
    check(setup.ok && (START !== 'M7' || setup.counter === 498) && setup.done.length >= 6, 'save state written: M1-M6 done, Side A at 498', setup);
    await page.reload();
    await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
    await page.mouse.click(2, 2);
    await page.evaluate(() => { const d = document.getElementById('debug'); if (d) d.classList.add('hide'); N.game.continueGame(); });
    await sleep(800);
    const loaded = await page.evaluate(() => ({ counter: N.tape.counter, done: Array.from(N.missions.done), date: N.calendar.label(), tin: Array.from(N.tape.tin), cassettes: N.story2.cassettesFound(), avail: N.missions.available().map((d) => d.id) }));
    check((START !== 'M7' || loaded.counter === 498) && loaded.done.length >= 6 && /15 MAY 2003/.test(loaded.date), 'CONTINUE restores the save: 498, 15 MAY 2003', loaded);
    if (START === 'M7') check(loaded.avail.indexOf('the_clap') >= 0, 'M7 the_clap is available after ammammas_thursday (requires)', loaded.avail);
    check(loaded.cassettes.dedications.length === 3 && loaded.cassettes.agent.length === 4, 'cassettes found: 3 dedications + 4 Agent tapes', loaded.cassettes);
    await retune(page);

    if (from('M7')) {
    /* ------------------------------------------------ M7 the_clap (real keys: walk into Amma's giver marker, E on the J-card) */
    log('M7 the_clap');
    const g7 = await page.evaluate(() => {
      const g = N.missions.giverPos(N.missions.defs.the_clap);
      let st = null; // an approach with a clear line of walk to the marker
      for (let i = 0; i < 16 && !st; i++) { const a = (i / 16) * Math.PI * 2, x = g.x + Math.cos(a) * 64, y = g.y + Math.sin(a) * 64; const rc = N.world.raycast(x, y, g.x, g.y, 'walk'); if (N.world.isWalkable(x, y) && !(rc && rc.hit)) st = { x, y }; }
      st = st || N.world.findFree(g.x, g.y + 56, 'walk', 20);
      N.player.teleport(st.x, st.y);
      return { x: g.x, y: g.y };
    });
    await sleep(300);
    const wd = await walkKeys(page, g7.x, g7.y, 10, 12000);
    await sleep(500);
    const jc = await page.evaluate(() => ({ prompt: N.missions.prompt, active: N.missions.active && N.missions.active.id }));
    if (!jc.active) await page.keyboard.press('KeyE');
    const st7 = await waitMission(page, 'the_clap', 8000);
    check(st7, 'M7 starts by walking into the giver with the arrow keys (+E on the J-card)', { wd, jc });
    await page.waitForFunction(() => /07 JUN 2003/.test(N.calendar.label()), null, { timeout: 6000 }).catch(() => {});
    check(await page.evaluate(() => /07 JUN 2003/.test(N.calendar.label())), 'M7 jumps the calendar to SAT 07 JUN 2003');
    let sumShot = false;
    await drive(page, passed('the_clap'), {
      each: async (s) => {
        if (!sumShot && /Shake off Professor Pasha/.test(s.objective || '')) { sumShot = true; await shot(page, 'm7_pasha_summit'); }
      },
    });
    const a7 = await page.evaluate(() => ({ counter: N.tape.counter, done: N.missions.isDone('the_clap'), clue: N.flags.clue_tunnel, tin: N.tape.tin.has('golconda_ticket'), bus: !!(N.flags.bus_golconda), notes: N.flags.s2_notes }));
    check(a7.done && a7.counter === 581, 'M7 passed: Side A 581 (clap_echo)', a7);
    check(a7.clue && a7.tin && a7.bus, 'M7: the tunnel clue is planted, the Golconda ticket is in the tin, the Golconda bus route is open', a7);

    }
    if (from('SA7')) {
    /* ------------------------------------------------ SA7 new_class_old_books (8-11 Jun) */
    log('SA7 new_class_old_books');
    await page.evaluate(() => { N.calendar.set(2003, 6, 9, 10, 0); });
    await sleep(300);
    check(await page.evaluate(() => N.missions.available().some((d) => d.id === 'new_class_old_books')), 'SA7 is available on 9 Jun');
    await page.evaluate(() => { const g = N.places.koti_book_bazaar; N.player.teleport(g.x, g.y + 40); });
    await startM(page, 'new_class_old_books');
    await drive(page, passed('new_class_old_books'), { timeout: 90000 });
    check(await page.evaluate(() => N.missions.isDone('new_class_old_books')), 'SA7 passed (books, brown cover, the home cutscene)');

    }
    if (from('SA5')) {
    /* ------------------------------------------------ SA5 twelve_oclock (any day 11:25-12:00 after M5) */
    log('SA5 twelve_oclock');
    await page.evaluate(() => { N.calendar.set(2003, 6, 10, 11, 30); const g = N.places.std_1; N.player.teleport(g.x, g.y + 30); });
    await sleep(300);
    check(await page.evaluate(() => N.missions.available().some((d) => d.id === 'twelve_oclock') && N.missions.inWindow('twelve_oclock')), 'SA5 offered at 11:30');
    await startM(page, 'twelve_oclock');
    await drive(page, passed('twelve_oclock'), { timeout: 90000 });
    const a5 = await page.evaluate(() => ({ done: N.missions.isDone('twelve_oclock'), f12: N.collectibles && N.collectibles.has ? N.collectibles.has('frame_12') : null }));
    check(a5.done, 'SA5 passed: the gong struck twelve', a5);

    }
    if (from('M8')) {
    /* ------------------------------------------------ M8 drums_for_amma (real E on ● REC) */
    log('M8 drums_for_amma');
    await startM(page, 'drums_for_amma');
    await waitMission(page, 'drums_for_amma', 6000);
    await page.waitForFunction(() => /20 JUL 2003/.test(N.calendar.label()), null, { timeout: 6000 }).catch(() => {});
    check(await page.evaluate(() => /20 JUL 2003/.test(N.calendar.label()) && !!N.flags.bonalu), 'M8 jumps to SUN 20 JUL 2003 (Bonalu flag on)');
    let procShot = false;
    await drive(page, passed('drums_for_amma'), {
      timeout: 240000,
      each: async (s) => { if (!procShot && /Walk with Amma/.test(s.objective || '') && s.mode === 'play') { procShot = true; await sleep(600); await shot(page, 'm8_procession'); } },
    });
    const a8 = await page.evaluate(() => ({ counter: N.tape.counter, done: N.missions.isDone('drums_for_amma'), friends: N.flags.ramulu_agarwal, tin: N.tape.tin.has('neem_leaf') }));
    check(a8.done && a8.counter === 664 && a8.friends && a8.tin, 'M8 passed: Side A 664 (dappu), Ramulu and Agarwal-ji make up, neem leaf in the tin', a8);

    }
    if (from('SA6')) {
    /* ------------------------------------------------ SA6 bunty_races R1-R4 (16:00-19:00) */
    for (const id of ['bunty_races', 'bunty_races_r2', 'bunty_races_r3', 'bunty_races_r4']) {
      log('SA6 ' + id);
      await page.evaluate((mid) => { N.clock.set(16, 40); const g = N.missions.giverPos(N.missions.defs[mid]); N.player.teleport(g.x, g.y + 30); }, id);
      await startM(page, id);
      await waitMission(page, id, 6000);
      if (id === 'bunty_races_r3') { await sleep(2500); await shot(page, 'sa6_r3_start'); }
      await drive(page, passed(id), { timeout: 150000, near: 20 });
      check(await page.evaluate((mid) => N.missions.isDone(mid), id), 'SA6 ' + id + ' won');
    }
    const a6 = await page.evaluate(() => ({ race: N.flags.sa6_race, pillion: N.flags.bunty_pillion }));
    check(a6.race === 4 && a6.pillion, 'SA6: R4 won, Bunty gives RX100 pillion rides (A3: never the bike)', a6);

    }
    if (from('M9')) {
    /* ------------------------------------------------ M9 opening_day (real keys: the HITEC choice ↓ + E: "Cycle it") */
    log('M9 opening_day');
    await page.evaluate(() => { N.debug.skipDialogue(false); N.debug.startMission('opening_day'); });
    await waitMission(page, 'opening_day', 6000);
    await talkKeys(page, { choices: [1], ci: 0, dbg: 0 }, { wait: 8000 });
    await page.evaluate(() => N.debug.skipDialogue(true));
    const v9 = await page.evaluate(() => N.vehicles.list.filter((v) => v.alive && v.T && v.T.pedal && !v.driver).length);
    check(v9 >= 1, 'M9: "Cycle it" (real ↓ + E) puts a cycle beside Immu\'s house', v9);
    let imaxShot = false;
    await drive(page, passed('opening_day'), {
      timeout: 200000,
      each: async (s) => { if (!imaxShot && /Ride the mini train/.test(s.objective || '')) { imaxShot = true; await shot(page, 'm9_after_prasads'); } },
    });
    const a9 = await page.evaluate(() => ({ counter: N.tape.counter, done: N.missions.isDone('opening_day'), imax: N.flags.prasads_open, seasons: N.seasons && N.seasons.is ? N.seasons.is('prasads_open') : null, peacock: N.flags.clue_peacock }));
    check(a9.done && a9.counter === 747, 'M9 passed: Side A 747 (applause)', a9);
    check(a9.imax && a9.seasons !== false && a9.peacock, 'M9: Prasads is open (N.flags.prasads_open + N.seasons), Bunty\'s peacock flyer', a9);

    }
    if (from('M10')) {
    /* ------------------------------------------------ M10 agle_baras + the interlude (real keys: walk statue 6 -> 7) */
    log('M10 agle_baras');
    await page.evaluate(() => N.debug.startMission('agle_baras'));
    await waitMission(page, 'agle_baras', 6000);
    let lorryShot = false, walked = false;
    await drive(page, (s) => s.mission !== 'agle_baras' && (s.scene === 'interlude' || s.scene == null), {
      timeout: 300000,
      each: async (s) => {
        if (!lorryShot && /Walk with our Ganesh/.test(s.objective || '') && s.mode === 'play') { lorryShot = true; await sleep(900); await shot(page, 'm10_procession'); }
        if (walked === false && /\(6\/7\)/.test(s.objective || '') && s.mode === 'play') {
          walked = null;
          const t7 = await page.evaluate(() => { const l = N.WORLD_DATA.landmarks.find((q) => q.id === 'tank_bund_statue_7'); const r = N.world.nearestRoadPoint(l.x, l.y); return { x: r.x, y: r.y }; });
          walked = (await walkKeys(page, t7.x, t7.y, 26, 15000)) <= 40;
          await sleep(300);
          return 'skip';
        }
        return null;
      },
    });
    const a10 = await page.evaluate(() => ({ counter: N.tape.counter, done: N.missions.isDone('agle_baras'), lock4: N.flags.lock_4, riddle4: N.flags.riddle_4, boats: N.flags.boats_open, gulal: N.tape.tin.has('gulal') }));
    check(a10.done && a10.counter === 812, 'M10 passed: Side A 812 (crowd_cheer)', a10);
    check(a10.lock4 === 1 && a10.riddle4 && a10.boats && a10.gulal, 'M10: lock digit 4 = 1 (the man in the lake), Lumbini boats open, gulal in the tin', a10);
    check(walked, 'M10: the 7th statue reached on foot with the arrow keys');
    log('interlude (reload right after MISSION PASSED: the autosave resumes into it)');
    await reloadContinue(page);
    await drive(page, (s) => s.scene === 'interlude', { timeout: 20000 });
    check(true, 'after a reload, CONTINUE resumes into the interlude (no save inside it)');
    await drive(page, (s) => s.scene == null && !s.cut, { timeout: 120000 });
    const ai = await page.evaluate(() => ({ paused: N.tape.paused, counter: N.tape.counter, date: N.calendar.label(), done: N.flags.interlude_done, ayesha: N.flags.ayesha_moving, avail: N.missions.available().map((d) => d.id), hud: (document.querySelector('#ui .hud-osd') || {}).textContent || '' }));
    await shot(page, 'interlude_paused_hud');
    check(ai.paused && ai.counter === 812 && /01 NOV 2003/.test(ai.date), 'interlude: SAT 01 NOV 2003, SIDE A ■ PAUSED 812', ai);
    check(ai.done && ai.ayesha && ai.avail.indexOf('last_bell') >= 0, 'interlude done: Ayesha\'s Tolichowki bark played, M11 available', ai);

    }
    if (from('M11')) {
    /* ------------------------------------------------ M11 last_bell (real keys: the bells riddle, a wrong answer first) */
    log('M11 last_bell');
    await page.evaluate(() => N.debug.startMission('last_bell'));
    await waitMission(page, 'last_bell', 6000);
    await page.waitForFunction(() => /21 NOV 2003/.test(N.calendar.label()), null, { timeout: 6000 }).catch(() => {});
    await page.waitForFunction(() => N.tape.paused && N.missions.active && !N.calendar.jumping, null, { timeout: 6000 }).catch(() => {});
    check(await page.evaluate(() => /21 NOV 2003/.test(N.calendar.label()) && N.tape.paused), 'M11: FRI 21 NOV 2003, the counter still ■ PAUSED');
    let riddle = false, riddleDone = false, parapetShot = false;
    const rst = { choices: [1, 0], ci: 0, dbg: 0 };
    await drive(page, passed('last_bell'), {
      timeout: 260000,
      each: async (s) => {
        const lit = await page.evaluate(() => N.story2.state().props.filter((p) => /s2:rec:/.test(p)).length);
        if (!parapetShot && s.mode === 'cutscene' && lit >= 6) { parapetShot = true; await sleep(1800); await shot(page, 'm11_parapet_rec_lights'); }
        if (!riddle && /Naubat Pahad/.test(s.objective || '')) { riddle = true; await page.evaluate(() => N.debug.skipDialogue(false)); }
        if (riddle && !riddleDone) {
          if (s.dialog) { await talkKeys(page, rst, { wait: 500 }); }
          if ((await page.evaluate(() => N.flags.lock_3)) === 0 && rst.ci >= 2) { riddleDone = true; await page.evaluate(() => N.debug.skipDialogue(true)); }
          if (s.dialog) return 'skip';
        }
        return null;
      },
    });
    const a11 = await page.evaluate(() => ({ counter: N.tape.counter, paused: N.tape.paused, done: N.missions.isDone('last_bell'), lock3: N.flags.lock_3, email: N.flags.s2_email, slam: N.tape.tin.has('slam_book_page'), tracks: N.tape.tracks.map((t) => t.id) }));
    check(a11.done && a11.counter === 905 && !a11.paused, 'M11 passed: Side A ▶ RESUMED, 905 (kite_wind)', a11);
    check(a11.lock3 === 0 && /_charminar2$/.test(a11.email || '') && a11.slam, 'M11: lock digit 3 = 0 (no bells), the email ids, the slam-book page', a11);
    check(a11.tracks.indexOf('last_bell_school_bell') < 0, 'M11: the school bell REC was declined (not on the tape)', a11.tracks);
    check(riddleDone && rst.ci >= 2, 'M11: the bells riddle answered with real keys (a wrong answer, then 0)', rst);

    }
    if (from('M12')) {
    /* ------------------------------------------------ M12 chand_raat: THE FINALE AT CHARMINAR */
    log('M12 chand_raat');
    await page.evaluate(() => N.debug.startMission('chand_raat'));
    await waitMission(page, 'chand_raat', 6000);
    await page.waitForFunction(() => /25 NOV 2003/.test(N.calendar.label()), null, { timeout: 6000 }).catch(() => {});
    check(await page.evaluate(() => /25 NOV 2003/.test(N.calendar.label()) && !!N.flags.chand_raat), 'M12: TUE 25 NOV 2003, Chand Raat flag on');
    const seen = { meter5: false, chappals2: false, gallery: false, respectStop: null, shant: false, caught: false, photo: false, mosqueGuards: 0 };
    let chaseDone = false;
    await drive(page, passed('chand_raat'), {
      timeout: 360000,
      each: async (s) => {
        if (s.wanted === 5) seen.meter5 = true;
        if (!seen.chappals2 && await page.evaluate(() => !!document.querySelector('#ui .hud-stats .s2-chap2'))) { seen.chappals2 = true; await shot(page, 'm12_two_chappals'); }
        if (s.gallery && !seen.gallery) { seen.gallery = true; await shot(page, 'm12_gallery_pan'); }
        if (s.chase && !chaseDone) {
          chaseDone = true;
          await sleep(1500);
          await shot(page, 'm12_chase');
          // the mothers wait outside a masjid's forecourt; the compound is closed to a chased boy
          const r = await page.evaluate(async () => {
            const z = N.respect.zones.find((q) => q.place === 'mecca_masjid');
            const out = { gate: !!(z && z.gate) };
            out.guards = ['s2_watch_mecca_masjid', 's2_watch_jama_masjid_charminar'].filter((k) => N.npcs.get(k)).length;
            if (!z || !z.gate) return out;
            N.player.teleport(z.gate.x, z.gate.y);
            await new Promise((res) => setTimeout(res, 2500));
            const ms = ['amma', 'ammi'].map((k) => N.npcs.get(k)).filter(Boolean);
            out.inRespect = !!N.respect.at(N.player.x, N.player.y);
            const mosques = N.respect.zones.filter((q) => q.kind === 'mosque' && /^(mecca_masjid|jama_masjid_charminar)$/.test(q.place));
            out.minNear = Math.round(Math.min(...ms.map((a) => Math.min(...mosques.map((q) => N.respect.distance(a.x, a.y, q))))));
            out.mumIn = ms.some((a) => N.respect.at(a.x, a.y));
            // try to walk into the compound: pushed back to the gate
            let inside = null;
            for (let r2 = 4; r2 < 160 && !inside; r2 += 6) for (let a = 0; a < 6.28 && !inside; a += 0.4) { const x = z.gate.x + Math.cos(a) * r2, y = z.gate.y + Math.sin(a) * r2; const q = N.respect.at(x, y); if (q && q.part === 'compound' && N.world.isWalkable(x, y)) inside = { x, y }; }
            if (inside) { N.player.x = inside.x; N.player.y = inside.y; await new Promise((res) => setTimeout(res, 400)); const q = N.respect.at(N.player.x, N.player.y); out.pushed = !(q && q.part === 'compound'); }
            return out;
          });
          seen.respectStop = r; seen.mosqueGuards = r.guards;
          // then get caught by Ammi (PAKDA GAYA: the scene plays on to the café)
          // (on her far side from the masjid gate: a boy still heading for the gate is never caught inside the buffer)
          await page.evaluate(() => { const a = N.npcs.get('ammi') || N.npcs.get('amma'); const z = N.respect.zones.find((q) => q.place === 'mecca_masjid'); if (!a) return; const g = (z && z.gate) || { x: a.x - 1, y: a.y }; const an = Math.atan2(a.y - g.y, a.x - g.x); N.player.teleport(a.x + Math.cos(an) * 7, a.y + Math.sin(an) * 7); });
          await sleep(1200);
          return 'skip';
        }
        if (!seen.photo && /The last photo/.test(s.objective || '')) { seen.photo = true; await sleep(400); await shot(page, 'm12_self_timer'); }
        return null;
      },
    });
    const a12 = await page.evaluate(() => ({ counter: N.tape.counter, done: N.missions.isDone('chand_raat'), chase: N.flags.m12_chase, tin: N.flags.tin_locked, f24: N.flags.frame_24, song: N.walkman.songs().indexOf('ending') >= 0, wanted: (N.wanted.level | 0), side: N.tape.tin.has('side_a_copy'), photo: N.tape.tin.has('passport_photo') }));
    check(a12.done && a12.counter === 999, 'M12 passed: Side A 999 (bangles)', a12);
    check(seen.meter5 && seen.chappals2, 'M12: both mothers at level 5, two chappal icons on the HUD', seen);
    check(seen.respectStop && seen.respectStop.inRespect && !seen.respectStop.mumIn && seen.respectStop.minNear >= 30, 'M12: at the Mecca Masjid gate the mothers stop outside the 40 u buffer', seen.respectStop);
    check(seen.respectStop && seen.respectStop.pushed !== false && seen.mosqueGuards === 2, 'M12: watchmen at both masjid gates; a chased boy cannot run into the compound', seen.respectStop);
    check(a12.chase === 'caught', 'M12: caught by Ammi = PAKDA GAYA, and the scene plays on (marched to the café)', a12);
    check(a12.tin && a12.f24 && a12.song && a12.side && a12.photo && a12.wanted === 0, 'M12: the tin locked (copy + photo inside), frame 24, the ending song on the walkman, meter back to 0', a12);

    }
    if (from('END')) {
    /* ------------------------------------------------ the ENDING at Charminar (real keys: CLAP ×3) */
    log('ending (reload right after MISSION PASSED: the autosave resumes into the finale)');
    await reloadContinue(page);
    await drive(page, (s) => s.scene === 'ending', { timeout: 20000 });
    check(await page.evaluate(() => N.flags.no_save === true && N.menus.canSave().ok === false), 'the ending cannot be saved half-way (N.flags.no_save)');
    const end = { atPlaza: null, kites: null, plane: false, rise: false };
    await page.evaluate(() => { window.__s2ev = []; N.on('story2:ending', (d) => window.__s2ev.push(d.phase)); N.on('story2:epilogue', (d) => { const c = N.places.charminar; window.__s2ev.push('epi:' + d.phase + ':' + Math.round(Math.hypot(N.player.x - c.x, N.player.y - c.y))); }); N.on('player:teleport', () => { if (N.story2.state().epilogue) window.__s2ev.push('tp:' + Math.round(N.player.x) + ',' + Math.round(N.player.y) + ' ' + String(new Error().stack).split('\n').slice(3, 7).map((l) => l.trim().replace(/^at /, '').replace(/file:.*\/src\//, '')).join(' < ')); }); window.__lines = []; N.on('dialogue:line', (d) => window.__lines.push([d.speaker, d.text])); });
    await drive(page, (s) => s.scene !== 'ending', {
      timeout: 240000,
      each: async (s) => {
        const ph = await page.evaluate(() => window.__s2ev.slice());
        if (ph.indexOf('alaap') >= 0 && end.kites == null) { end.kites = await page.evaluate(() => N.story2.state().props.indexOf('s2:kites') >= 0); await sleep(1200); await shot(page, 'ending_kite_train'); }
        if (ph.indexOf('theme') >= 0 && !end.plane) {
          end.plane = true;
          end.atPlaza = await page.evaluate(() => { const c = N.places.charminar; return Math.round(Math.hypot(N.player.x - c.x, N.player.y - c.y)); });
          await sleep(800); await shot(page, 'ending_plane_light');
        }
        if (ph.indexOf('rise') >= 0 && !end.rise) { end.rise = true; }
        if (/CLAP/.test(s.offer || '')) { await page.keyboard.press('KeyE'); await sleep(260); return 'skip'; }
        return null;
      },
    });
    const ae = await page.evaluate(() => ({ ending: N.flags.ending_done, counter: N.tape.counter, phases: window.__s2ev.slice(), kites: N.story2.kitesForEnding(), eidi: N.player.money }));
    check(ae.ending && ae.counter === 999, 'the ending played: Side A back at 999 after the playback', ae);
    check(end.atPlaza != null && end.atPlaza < 260, 'THE GAME ENDS AT CHARMINAR: the player is on the plaza at 23:40 (look north)', end);
    check(end.kites && ae.kites === 3, 'the ending: the 3 kites found rise into the floodlight', { end, kites: ae.kites });
    check(['alaap', 'theme', 'rise', 'lift', 'end'].every((p) => ae.phases.indexOf(p) >= 0), 'the ending runs alaap -> theme -> rise -> lift', ae.phases);

    }
    if (from('END')) {
    /* ------------------------------------------------ the EPILOGUE "Side B" (real keys: the lock dial, one wrong try first) */
    log('epilogue');
    await drive(page, (s) => s.scene === 'epilogue', { timeout: 30000 });
    let dialDone = false, wrongTried = false, epiShot = false, tinShot = false, albumShot = false;
    await drive(page, (s) => s.scene !== 'epilogue', {
      timeout: 300000, keepCut: true,
      panel: async (s) => {
        if (/s2-lock/.test(s.panel || '')) {
          if (!epiShot) { epiShot = true; await shot(page, 'epilogue_lock_dial'); }
          const want = wrongTried ? [1, 4, 0, 1] : [1, 4, 0, 2];
          const st = s.lock || { digits: [0, 0, 0, 0], sel: 0 };
          for (let i = 0; i < 4; i++) {
            const cur = await page.evaluate(() => N.story2.lockState);
            let sel = cur.sel;
            while (sel !== i) { await page.keyboard.press('ArrowRight'); sel = (sel + 1) % 4; await sleep(60); }
            const now = (await page.evaluate(() => N.story2.lockState)).digits[i];
            const up = (want[i] - now + 10) % 10;
            for (let k = 0; k < up; k++) { await page.keyboard.press('ArrowUp'); await sleep(50); }
          }
          void st;
          await page.keyboard.press('KeyE');
          if (!wrongTried) wrongTried = true; else dialDone = true;
          await sleep(1300);
          return true;
        }
        if (/s2-panel/.test(s.panel || '')) {
          const title = await page.evaluate(() => (document.querySelector('.s2-panel .s2-card h2') || {}).textContent || '');
          if (/tin/i.test(title) && !tinShot) { tinShot = true; await shot(page, 'epilogue_tin'); }
          if (/album/i.test(title) && !albumShot) { albumShot = true; await shot(page, 'epilogue_album'); }
          await page.keyboard.press('KeyE');
          return true;
        }
        return false;
      },
      each: async (s) => {
        if (s.cut) { await sleep(150); return 'skip'; } // keep Side B's say steps so the tail lines are played
        if (/CLAP|Clap back/.test(s.offer || '')) { await page.keyboard.press('KeyE'); await sleep(260); return 'skip'; }
        return null;
      },
    });
    const ap = await page.evaluate(() => ({
      epi: N.flags.epilogue_done, lock: N.story2.lockResult, year: N.flags.year, lines: window.__lines.slice(), tail: N.story2.sideBTail(),
      player: (() => { const c = N.places.charminar; return Math.round(Math.hypot(N.player.x - c.x, N.player.y - c.y)); })(),
    }));
    check(ap.epi && ap.year === 2026, 'the epilogue played in 2026 (SAT 17 JAN 2026)', { epi: ap.epi, year: ap.year });
    check(ap.lock && ap.lock.code === '1401' && ap.lock.tries === 1 && !ap.lock.auto && dialDone, 'the 1-4-0-1 lock opened with real keys after one wrong try (Faramarz: Gurthunda?)', ap.lock);
    check(ap.lines.some((l) => l[0] === 'faramarz' && /Gurthunda/.test(l[1])), 'the wrong try gets Faramarz\'s "Gurthunda?"');
    const radio = ap.lines.filter((l) => l[0] === 'radio').map((l) => l[1]);
    const hiss = ap.lines.filter((l) => /\(tape hiss\)/.test(l[1] || '')).length;
    check(radio.length === 3 && /Pinky of Malakpet/.test(radio[0]) && /7 pm Java batch/.test(radio[1]) && /bangle sellers of Laad Bazaar/.test(radio[2]), 'Side B\'s tail: the 3 dedication cassettes found play as lines', radio);
    check(hiss === 9, 'Side B\'s tail: the 9 missed ones are tape hiss', hiss);
    check(ap.lines.some((l) => l[0] === 'imran_tape' && /promoted/.test(l[1])), 'all four Agent tapes found: "Agent, you are promoted."');
    const coda = (await page.evaluate(() => window.__s2ev.slice())).filter((e) => /^(epi|tp):/.test(e));
    const codaAt = coda.find((e) => /^epi:coda:/.test(e));
    check(codaAt && +codaAt.split(':')[2] < 320, 'the epilogue ends on the Charminar plaza (Café Noor-e-Iran) at the coda', coda);

    }
    if (from('END')) {
    /* ------------------------------------------------ definitions, CREDITS, ◀◀ REWIND (real keys: December) */
    log('credits');
    let creditsText = '', defsSeen = false, rewindShot = false;
    await drive(page, (s) => s.scene == null && !s.panel && s.mode === 'play' && !s.credits && !s.defs, {
      timeout: 200000,
      each: async (s) => {
        if (s.defs && !defsSeen) { defsSeen = true; await sleep(1500); await shot(page, 'definitions_card'); }
        if (s.credits && !creditsText) { creditsText = await page.evaluate(() => (document.querySelector('.mn-credits .cr-roll') || {}).textContent || ''); await page.keyboard.down('KeyE'); await sleep(2500); await page.keyboard.up('KeyE'); await shot(page, 'credits'); }
        return null;
      },
      panel: async (s) => {
        if (/s2-rewind/.test(s.panel || '')) {
          if (!rewindShot) { rewindShot = true; await sleep(400); await shot(page, 'rewind_menu'); }
          for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowDown'); await sleep(120); }
          await page.keyboard.press('KeyE');
          return true;
        }
        return false;
      },
    });
    check(defsSeen, 'the definitions card (bible §9.3) shows after ■ STOP');
    check(/DataMeet Municipal Spatial Data \(CC BY 4\.0\) and © OpenStreetMap contributors \(ODbL\)/.test(creditsText), 'credits: the A1 map attribution line', creditsText.slice(0, 120));
    check(/three\.js/.test(creditsText) && /MIT/.test(creditsText), 'credits: the three.js MIT credit for the 3D mode');
    check(/Gurthunda\?/.test(creditsText) && /THE CAST/.test(creditsText), 'credits: the bible §9.4 roll');
    await drive(page, (s) => s.scene == null && !s.panel && s.mode === 'play' && /20 DEC 2003/.test(s.date || ''), { timeout: 120000 });
    const ar = await page.evaluate(() => ({ pick: N.flags.season_pick, post: N.flags.postgame, year: N.flags.year, credits: N.flags.credits_seen, side: N.tape.side, date: N.calendar.label(), immu: N.npcs.scheduleOn ? N.npcs.scheduleOn('immu_hangout') : null, avail: N.missions.available().map((d) => d.id), money: N.player.money, saved: N.save.info ? N.save.info() : null }));
    check(ar.pick === 'december' && ar.post && ar.year === 2003 && ar.credits && ar.side === 'A', '◀◀ REWIND: December 2003 picked with real keys; post-game free roam, Side A', ar);
    check(ar.avail.indexOf('christmas_stars') >= 0 && ar.immu === false, 'December: Immu has gone (no hangout), SA8 Christmas Stars is offered', ar);

    }
    if (from('END')) {
    /* ------------------------------------------------ SA8 christmas_stars */
    log('SA8 christmas_stars');
    await page.evaluate(() => { N.clock.set(10, 30); const g = N.places.iyengar_bakery_2; N.player.teleport(g.x, g.y + 30); });
    await startM(page, 'christmas_stars');
    await waitMission(page, 'christmas_stars', 6000);
    let mailShot = false;
    await drive(page, passed('christmas_stars'), {
      timeout: 200000,
      panel: async (s) => { if (!mailShot) { mailShot = true; await sleep(400); await shot(page, 'sa8_immu_email'); } await page.keyboard.press('KeyE'); return true; },
    });
    const a8s = await page.evaluate(() => ({ done: N.missions.isDone('christmas_stars'), email: N.flags.immu_email, lantern: N.flags.star_lantern }));
    check(a8s.done && a8s.email && a8s.lantern, 'SA8 passed: four plum cakes, Immu\'s first email, a star lantern on the balcony', a8s);
    await page.evaluate(() => { const h = N.places.home; N.player.teleport(h.x + 10, h.y + 30); N.clock.set(20, 0); });
    await sleep(1500);
    await shot(page, 'postgame_star_lantern');
    check(await page.evaluate(() => N.story2.state().props.indexOf('s2:lantern') >= 0), 'the paper star lantern hangs at Lakshmi Nivas after SA8');

    }
    /* ------------------------------------------------ errors */
    const errs = await errorsOf(page, errors);
    check(errs.length === 0, 'zero console errors / page errors / N.err', errs.slice(0, 12));
  } catch (e) {
    failures.push('exception: ' + (e && e.stack || e));
    console.log('EXCEPTION', e && e.stack || e);
    try { await shot(page, 'exception'); console.log(JSON.stringify(await probe(page))); } catch (e2) { /* ignore */ }
    try { console.log((await errorsOf(page, errors)).slice(0, 10).join('\n')); } catch (e3) { /* ignore */ }
  }
  await browser.close();
  console.log('\n' + passes + ' passed, ' + failures.length + ' failed (' + ((Date.now() - T0) / 1000).toFixed(0) + ' s)');
  if (failures.length) { console.log(failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})();
