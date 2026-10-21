/* NOSTALGIA — tests/journey.cjs  (journey audit: first-time experience -> story -> post-game; design/audit/journey.md)
 * Regression checks for the fixes of the journey audit, each with real input where a player would use it:
 *   static  — no era brands in the story lines that were rewritten (Hajmola, Vicks, Fevicol, Tinkle, Hero Ranger), the
 *             M1 control hints are in story.js, every *highlighted* word of the story / Diwali / NPC / job lines
 *             has a glossary meaning (checked in the page with N.dialogue.gloss)
 *   roam    — the free-roam story line (storycore: N.hints.roamLine): after Track 01 the riddle (short form), the
 *             180 s nudge, Ammamma's answer, the riddle kept near its giver, the mission's own line while one runs,
 *             "Next on Side A: …" for a giver on the map, nothing in Diwali week / the post-game; desktop 1280x720
 *             + phone 390x844 screenshots
 *   home    — the home door (storycore): "Sleep till 07:00 ▶▶" at night with a real E (next morning, Chappal Meter
 *             0, energy / tummy refilled, saved with reason 'sleep'), "Eat (Amma's kitchen)" once per meal
 *             window, nothing during a mission; post-game "◀◀ REWIND: another season" (real keys: "Not now", then
 *             December)
 *   meta    — save meta.missions counts Side A tracks only (the title's CONTINUE "TRACK NN"), an older blob is
 *             recounted by N.save.info(), the CONTINUE line after a reload (DOM)
 *   heal    — story2's hand-over self-heal: Track 10's hand-over to Diwali week refused while a job runs picks up
 *             once the job is over; Diwali week done but no interlude -> the interlude starts
 *   m1      — M1: "Not now" on the kite card fails with its own line and retries on the terrace (real click + E),
 *             the device-aware move hint at the lootna
 * Fails on any console error / page error / N.err.
 *
 *   barks   — speech bubbles keep out of the HUD's objective strip and stack instead of overlapping (gameplay
 *             audit X4 / G27, dialogue.js placeBarks)
 *   watch   — SA1's night watch: E by the medical shop next to the pandal never opens the shop card
 *   node nostalgia/tests/journey.cjs            ONLY=static,roam,home,meta,heal,m1,barks,watch
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'journey');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY || '';
const want = (k) => !ONLY || ONLY.split(',').indexOf(k) >= 0;
const failures = [];
let passes = 0, phase = '-';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(cond, msg, data) {
  if (cond) { passes++; console.log('  ok   ' + msg); }
  else { const t = '[' + phase + '] ' + msg + (data !== undefined ? '  ' + JSON.stringify(data).slice(0, 700) : ''); failures.push(t); console.log('  FAIL ' + t); }
  return !!cond;
}

async function openPage(browser, V) {
  V = V || { viewport: { width: 1280, height: 720 } };
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.dpr || 1, hasTouch: !!V.touch, isMobile: !!V.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
  await page.evaluate(() => { const d = document.getElementById('debug'); if (d) d.classList.add('hide'); });
  return { page, errors, ev: (fn, arg) => page.evaluate(fn, arg) };
}
/** wait on the game's own clock: resolves when fn() is true (polls), false after `ms` real ms */
async function until(page, fn, arg, ms) { return page.waitForFunction(fn, arg, { timeout: ms || 15000, polling: 100 }).then(() => true, () => false); }
async function errorsOf(P, what) {
  const errs = await P.ev(() => N.debug.state().errors).catch(() => []);
  check(!errs.length && !P.errors.length, what + ': no console / page errors, no N.err', errs.concat(P.errors).slice(0, 6));
}
/** dismiss a line that opened by itself (Amma at the gate when he comes home after the street lights) with real E */
async function settle(page) {
  for (let i = 0; i < 12; i++) {
    const m = await page.evaluate(() => N.state.mode);
    if (m === 'play') return;
    if (m === 'dialogue') await page.keyboard.press('KeyE');
    await sleep(350);
  }
}
/** a fresh game in free roam on a given story state */
async function story(P, done, flags, at) {
  await P.ev(({ done, flags, at }) => {
    N.debug.newGame({ skipIntro: true });
    N.missions.deserialize({ done });
    Object.assign(N.flags, { prologue_seen: true, year: 2003 }, flags || {});
    const h = N.places[at || 'home'];
    N.player.teleport(h.x + 40, h.y + 70);
    N.debug.skipDialogue(true);
  }, { done, flags, at });
  await sleep(300);
}
const TRACKS = ['bo_kaata', 'lost_and_found', 'first_day_first_show', 'last_man_batting', 'right_right', 'ammammas_thursday', 'the_clap', 'drums_for_amma', 'opening_day', 'agle_baras', 'last_bell', 'chand_raat'];

/* ====================================================================== static */
function staticChecks() {
  phase = 'static';
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const mine = ['src/story.js', 'src/story2.js', 'src/storycore.js', 'src/collectibles.js', 'src/npcs.js', 'src/diwali_missions.js'];
  for (const f of mine) {
    const hits = (read(f).match(/\b(Hajmola|Vicks|Fevicol|Tinkles?|Hero Ranger)\b/g) || []);
    check(!hits.length, f + ': no era brand names in player-facing lines (Hajmola, Vicks, Fevicol, Tinkle, Hero Ranger)', hits);
  }
  const st = read('src/story.js');
  check(/Move: arrow keys or WASD\. Hold Shift to run\./.test(st) && /Drag the left thumb-pad to move/.test(st) && /ctrlHint\('move'\)/.test(st), 'M1: device-aware move hint (keyboard / touch / pad) at the lootna');
  check(/ctrlHint\('journal'\)/.test(st), 'M1: the chit points at the Journal (Clues)');
  const bible = read('design/story_bible.md');
  check(bible.indexOf('Or a churan goli?') >= 0 && bible.indexOf('Balm for Ammamma? And no, the churan goli is not for Ammamma.') >= 0, 'the bible carries the rewritten chemist lines (story_full checks the lines against it)');
}
/** every *highlighted* word in the story / Diwali / NPC / job lines has a glossary meaning */
async function glossaryCheck(P) {
  phase = 'static';
  const files = ['story.js', 'story2.js', 'diwali_missions.js', 'npcs.js', 'sidejobs.js', 'storycore.js'];
  const spans = [];
  for (const f of files) {
    fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').split('\n').forEach((L, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(L)) return;
      for (const m of L.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
        const s = m[1] != null ? m[1] : m[2];
        for (const g of s.matchAll(/\*([^*]{2,40})\*/g)) {
          const w = g[1].trim();
          if (/^[●■▶]/.test(w) || /[A-Z]{4,}/.test(w) || /^[\s\d.,]+$/.test(w) || !/[a-z]/i.test(w)) continue;
          spans.push({ at: f + ':' + (i + 1), w });
        }
      }
    });
  }
  const miss = await P.ev((spans) => spans.filter((s) => !N.dialogue.gloss(s.w)).map((s) => s.at + ' *' + s.w + '*'), spans);
  // (a game title in a collectibles toast is a name, not slang)
  const real = miss.filter((m) => !/Marbles vs Tiger/.test(m));
  check(!real.length, 'every *highlighted* word in ' + spans.length + ' story / Diwali / NPC / job spans has a glossary meaning', real.slice(0, 12));
}

/* ====================================================================== roam: the free-roam story line */
async function roamPhase(browser, V, tag) {
  phase = 'roam ' + tag;
  const P = await openPage(browser, V);
  const { ev, page } = P;
  await story(P, ['bo_kaata'], {});
  await ev(() => { N.hints.start('lost_and_found'); });
  const short = "Immu's clue: the clock tower that talks with half its faces. Saturday, 4 pm.";
  check(await until(page, (t) => N.hud.objectiveText === t, short, 8000), 'after Track 01, free roam shows the riddle (short form) as the objective', await ev(() => N.hud.objectiveText));
  const dom = await ev(() => { const e = document.querySelector('.hud-obj, .hud-objective, #hud-obj'); return e ? { shown: e.classList.contains('show'), text: e.innerText } : null; });
  check(!dom || (dom.shown && /clock tower/.test(dom.text)), 'the objective strip is on screen (DOM)', dom);
  await page.screenshot({ path: path.join(OUT, 'journey_' + tag + '_riddle.png') });
  // a save from before the short forms (its hints section has no `short`): still the short form
  await ev(() => { const S = N.hints.serialize(); delete S.active.short; N.hud.objective(null); N.hints.deserialize(S); });
  check(await until(page, (t) => N.hud.objectiveText === t, short, 8000), 'an older save\'s clue (no short form saved) shows the short form too', await ev(() => N.hud.objectiveText));
  // the 180 s nudge appends Ammamma's way out
  await ev(() => { const S = N.hints.serialize(); S.active.elapsed = 179.6; N.hints.deserialize(S); });
  check(await until(page, () => /Stuck\? Ammamma knows/.test(N.hud.objectiveText || ''), null, 8000), 'the 180 s nudge adds "(Stuck? Ammamma knows…)" to the riddle line', await ev(() => N.hud.objectiveText));
  await page.screenshot({ path: path.join(OUT, 'journey_' + tag + '_nudge.png') });
  // Ammamma's hint (home / the STD booth) puts her answer on the line
  await ev(() => { N.hints.next('home'); });
  check(await until(page, (t) => N.hud.objectiveText === t + ' — Ammamma: Mozamjahi Market.', short, 8000), 'Ammamma\'s hint adds her answer to the riddle line', await ev(() => N.hud.objectiveText));
  // close to Mozamjahi Market the giver's marker shows; the riddle stays the line (it IS the way to the giver)
  await ev(() => { const P0 = N.places.mozamjahi_market; N.player.teleport(P0.x + 210, P0.y + 140); });
  await sleep(1200);
  const near = await ev(() => ({ obj: N.hud.objectiveText, av: N.missions.available().some((d) => d.id === 'lost_and_found') }));
  check(near.av && /^Immu's clue: the clock tower/.test(near.obj || ''), 'near the answer: the giver is on the map, the riddle line stays', near);
  // a mission writes its own line; ours comes back after it
  await ev(() => { N.missions.start('lost_and_found', { noJump: true }); });
  check(await until(page, () => N.missions.active && N.hud.objectiveText && !/^Immu's clue/.test(N.hud.objectiveText), null, 10000), 'while a mission runs, the line is the mission\'s own', await ev(() => N.hud.objectiveText));
  await ev(() => { N.missions.abort(); N.hints.start('lost_and_found'); });
  check(await until(page, () => /^Immu's clue: the clock tower/.test(N.hud.objectiveText || ''), null, 10000), 'after the mission is quit, the story line comes back', await ev(() => N.hud.objectiveText));
  // Track 02 done: the next giver is at home
  await story(P, TRACKS.slice(0, 2), {});
  check(await until(page, () => N.hud.objectiveText === 'Next on Side A: First Day, First Show (the yellow marker at home)', null, 10000), 'after Track 02: "Next on Side A: First Day, First Show (the yellow marker at home)"', await ev(() => N.hud.objectiveText));
  await page.screenshot({ path: path.join(OUT, 'journey_' + tag + '_next.png') });
  // Track 03 done, CONTINUE right in the home giver's ring (it waits for him to step out): M4's clue ("four tall
  // uncles", LB Stadium) never becomes the line; stepping out shows the giver
  await story(P, TRACKS.slice(0, 3), {});
  await ev(() => { N.hints.start('last_man_batting'); const h = N.places.home; N.player.teleport(h.x, h.y + 2); N.save.save({ reason: 'std', toast: false }); N.save.load(); });
  await sleep(1500);
  const inRing = await ev(() => ({ obj: N.hud.objectiveText, av: N.missions.available().some((d) => d.id === 'last_man_batting') }));
  check(!/tall uncles|light-bulb/.test(inRing.obj || ''), 'after CONTINUE in the giver\'s ring: the M4 clue (it points inside the mission) is not the line', inRing);
  await ev(() => { const h = N.places.home; N.player.teleport(h.x + 70, h.y + 60); });
  check(await until(page, () => N.hud.objectiveText === 'Next on Side A: Last Man Batting (the yellow marker at home)', null, 10000), 'stepped out: "Next on Side A: Last Man Batting (the yellow marker at home)"', await ev(() => N.hud.objectiveText));
  // Track 08 done: Opening Day's giver is at Immu's house
  await story(P, TRACKS.slice(0, 8), {});
  check(await until(page, () => /^Next on Side A: Opening Day \(the yellow marker at Immu's house\)$/.test(N.hud.objectiveText || ''), null, 10000), 'after Track 08: the giver at Immu\'s house', await ev(() => N.hud.objectiveText));
  // Diwali week writes its own line (never ours)
  await story(P, TRACKS.slice(0, 10), { dw_story: 'week' });
  await sleep(1500);
  const dw = await ev(() => ({ obj: N.hud.objectiveText, line: N.hints.roamLine() }));
  check(dw.line === null && !/^Next on Side A/.test(dw.obj || ''), 'Diwali week: the story line stays out of the way', dw);
  // the post-game: nothing
  await story(P, TRACKS, { postgame: true, ending_done: true, epilogue_done: true, credits_seen: true, interlude_done: true, dw_story: 'done' });
  await sleep(1500);
  const pg = await ev(() => ({ obj: N.hud.objectiveText, line: N.hints.roamLine() }));
  check(pg.line === null && !/^Next on Side A/.test(pg.obj || ''), 'post-game: no story line', pg);
  await errorsOf(P, 'roam ' + tag);
  await page.context().close();
}

/* ====================================================================== home: sleep and meals */
async function homePhase(browser) {
  phase = 'home';
  const P = await openPage(browser);
  const { ev, page } = P;
  await story(P, ['bo_kaata'], {});
  await ev(() => { const h = N.places.home; N.player.teleport(h.x - 8, h.y - 6); N.clock.set(22, 40); N.player.energy = 20; N.player.tummy = 30; if (N.wanted && N.wanted.set) N.wanted.set(1); });
  await sleep(800); await settle(page); // Amma at the gate: "Inside. Now." (coming home after the street lights)
  check(await until(page, () => N.input.actionLabel === 'Sleep till 07:00 ▶▶', null, 8000), 'home at 22:40: ACTION offers "Sleep till 07:00 ▶▶"', await ev(() => N.input.actionLabel));
  const door = await ev(() => { const I = N.interact.get('home_door'), h = N.places.home; return { walk: N.world.isWalkable(I.x, I.y), d: Math.hypot(I.x - h.x, I.y - h.y), p: { x: Math.round(N.player.x), y: Math.round(N.player.y) } }; });
  check(door.walk && door.d < 16, 'the door stands on walkable ground by the gate (inside the home ring: a track\'s J-card there wins)', door);
  await page.screenshot({ path: path.join(OUT, 'journey_home_sleep_prompt.png') });
  const day0 = await ev(() => N.clock.day);
  await until(page, () => N.input.actionLabel === 'Sleep till 07:00 ▶▶' && N.state.mode === 'play', null, 6000);
  await page.keyboard.press('KeyE');
  check(await until(page, (d) => N.clock.day === d + 1 && N.clock.minutes >= 7 * 60 && N.clock.minutes < 7 * 60 + 30 && N.state.mode === 'play' && !(N.player.controlsLocked), day0, 20000), 'real E: the next morning at 07:00', await ev(() => ({ day: N.clock.day, clock: N.clock.label() })));
  await sleep(600);
  const m = await ev(() => ({ w: N.wanted ? N.wanted.level : 0, e: N.player.energy, t: N.player.tummy, reason: N.save.info() && N.save.info().reason, date: N.calendar.label() }));
  check(m.w === 0, 'sleeping at home clears the Chappal Meter (the curfew)', m);
  check(m.t >= 66 && m.e >= 66, 'sleeping at home: tummy 70 (dinner + breakfast), energy refilled', m);
  check(m.reason === 'sleep', 'the game is saved on waking (reason sleep)', m);
  await page.screenshot({ path: path.join(OUT, 'journey_home_morning.png') });
  // breakfast: once per window
  check(await until(page, () => N.input.actionLabel === "Eat (Amma's kitchen)", null, 6000), 'breakfast window: ACTION offers "Eat (Amma\'s kitchen)"', await ev(() => N.input.actionLabel));
  const t0 = await ev(() => { N.player.tummy = 30; N.player.energy = 30; return N.player.tummy; });
  await page.keyboard.press('KeyE');
  await sleep(500);
  const t1 = await ev(() => ({ t: N.player.tummy, act: N.input.actionLabel }));
  check(t1.t >= t0 + 55, 'a home meal: +60 tummy', { t0, t1 });
  check(t1.act !== "Eat (Amma's kitchen)", 'one meal per window', t1);
  // between meals and during a mission: nothing at the door
  await ev(() => N.clock.set(11, 0));
  await sleep(600);
  check(await ev(() => N.input.actionLabel !== "Eat (Amma's kitchen)" && N.input.actionLabel !== 'Sleep till 07:00 ▶▶'), '11:00: the door offers nothing', await ev(() => N.input.actionLabel));
  // the door takes nobody else's ACTION: the lootna terraces' stairs either side of the house, the 2-in-1, Ammamma
  const cf = await ev(async () => {
    const gw = (s0) => new Promise((res) => { const t0 = N.time.now, w0 = performance.now(); const f = () => (N.time.now - t0 >= s0 || performance.now() - w0 > 4000 ? res() : setTimeout(f, 20)); f(); });
    const lab = () => { const c = N.interact.current; return c ? (typeof c.label === 'function' ? c.label(N.player) : c.label) : null; };
    N.walkman.add('cassette_1');
    const out = [];
    for (const hm of [[8, 0], [21, 0]]) {
      N.clock.set(hm[0], hm[1]); delete N.flags.home_meal;
      for (const rf of N.world.roofs.list) for (const st of rf.stairs) {
        N.player.level = null; N.player.teleport(st.x, st.y); await gw(0.15);
        if (!/Go up|Climb|Up to/.test(lab() || '')) out.push({ at: hm.join(':'), roof: rf.id, label: lab() });
      }
      const D = N.interact.get('home_2in1'); N.player.teleport(D.x, D.y); await gw(0.15);
      if (lab() !== '2-in-1') out.push({ at: hm.join(':'), at2in1: lab() });
    }
    return out;
  });
  check(!cf.length, 'the home door takes no other ACTION (terrace stairs, the 2-in-1) at meal time or at night', cf);
  await ev(() => { N.missions.start('lost_and_found', { noJump: true }); const h = N.places.home; N.player.teleport(h.x - 8, h.y - 6); N.clock.set(22, 0); });
  await sleep(800);
  check(await ev(() => N.input.actionLabel !== 'Sleep till 07:00 ▶▶'), 'during a mission: no "Sleep" at the door', await ev(() => N.input.actionLabel));
  await ev(() => N.missions.abort());
  // the post-game: ◀◀ REWIND at the door, with a way out ("Not now"), then December (SA8's month) for real
  await story(P, TRACKS, { postgame: true, ending_done: true, epilogue_done: true, credits_seen: true, interlude_done: true, dw_story: 'done', season_pick: 'january' });
  await ev(() => { N.calendar.set(2003, 1, 14, 11, 0); const h = N.places.home; N.player.teleport(h.x - 8, h.y - 6); });
  check(await until(page, () => N.input.actionLabel === '◀◀ REWIND: another season', null, 8000), 'post-game, 11:00 at home: "◀◀ REWIND: another season"', await ev(() => N.input.actionLabel));
  await page.keyboard.press('KeyE');
  check(await until(page, () => !!document.querySelector('.s2-rewind.show [data-k=stay]'), null, 6000), 'the season menu opens with a "Not now" row');
  await page.screenshot({ path: path.join(OUT, 'journey_home_rewind.png') });
  await page.keyboard.press('ArrowUp'); await sleep(150); await page.keyboard.press('KeyE');
  await sleep(800);
  const st = await ev(() => ({ open: !!document.querySelector('.s2-rewind.show'), date: N.calendar.label(), locked: !!N.player.controlsLocked }));
  check(!st.open && st.date === 'TUE 14 JAN 2003' && !st.locked, '"Not now" closes it and stays in January', st);
  await page.keyboard.press('KeyE');
  await until(page, () => !!document.querySelector('.s2-rewind.show'), null, 6000);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowDown'); await sleep(150); }
  await page.keyboard.press('KeyE');
  check(await until(page, () => N.calendar.label() === 'SAT 13 DEC 2003' && N.flags.season_pick === 'december', null, 10000), 'real keys: ◀◀ December 2003 (SA8\'s month is reachable again)', await ev(() => ({ date: N.calendar.label(), pick: N.flags.season_pick })));
  await ev(() => { if (N.story2.scene) N.story2.abortScene(); });
  await errorsOf(P, 'home');
  await page.context().close();
}

/* ====================================================================== meta: CONTINUE "TRACK NN" */
async function metaPhase(browser) {
  phase = 'meta';
  const P = await openPage(browser);
  const { ev, page } = P;
  // nine tracks + seven side activities / jobs done
  const sides = ['sunday_mutton', 'current_poyindi', 'six_balls', 'twelve_oclock', 'new_class_old_books', 'bunty_races', 'pandal_duty'];
  await story(P, TRACKS.slice(0, 9).concat(sides), {});
  const r = await ev(() => { N.save.save({ reason: 'std', toast: false }); return N.save.info(); });
  check(r.missions === 9 && r.missionsAll === 16, 'save meta.missions counts the Side A tracks (9), missionsAll keeps the total (16)', r);
  // an older build's blob: meta.missions was the total
  const r2 = await ev(() => {
    const raw = JSON.parse(localStorage.getItem('nostalgia.save.v1'));
    raw.meta.missions = 16; delete raw.meta.missionsAll;
    localStorage.setItem('nostalgia.save.v1', JSON.stringify(raw));
    return N.save.info();
  });
  check(r2.missions === 9, 'an older save is recounted by N.save.info() (9 tracks, not 16)', r2);
  await page.reload();
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
  const line = await ev(() => { const e = document.querySelector('[data-act=continue]'); return e ? e.innerText.replace(/\s+/g, ' ') : null; });
  check(/TRACK 10/.test(line || '') && !/TRACK 12/.test(line || ''), 'the title\'s CONTINUE says TRACK 10 after Track 09 (was TRACK 12)', line);
  await page.screenshot({ path: path.join(OUT, 'journey_meta_title.png') });
  await errorsOf(P, 'meta');
  await page.context().close();
}

/* ====================================================================== heal: refused story hand-overs */
async function healPhase(browser) {
  phase = 'heal';
  const P = await openPage(browser);
  const { ev, page } = P;
  await story(P, TRACKS.slice(0, 10), {}, 'home');
  // a job is running when Track 10's hand-over fires (story2: later(4.6) -> Diwali week's way in)
  const job = await ev(() => Object.values(N.missions.defs).filter((d) => d.kind === 'job').map((d) => d.id)[0]);
  const r = await ev((job) => { N.missions.start(job); return N.dwMissions.story.resume().then((ok) => ({ ok, active: N.missions.active && N.missions.active.id, scene: N.story2.scene })); }, job);
  check(r.ok === false && r.active === job, 'the hand-over is refused while a job runs (as before)', r);
  await ev(() => N.missions.abort());
  check(await until(page, () => N.story2.scene === 'diwali_in', null, 20000), 'after the job, the story picks up by itself: Diwali week\'s way in (MON 20 OCT)', await ev(() => ({ scene: N.story2.scene, dw: N.flags.dw_story || null, date: N.calendar.label() })));
  await ev(() => N.story2.abortScene());
  // Diwali week done, the interlude did not start: it starts
  await story(P, TRACKS.slice(0, 10).concat(['mithai_run', 'deepon_ki_raat']), { dw_story: 'done' }, 'home');
  check(await until(page, () => N.story2.scene === 'interlude', null, 20000), 'Diwali week done but no interlude: the interlude starts by itself', await ev(() => ({ scene: N.story2.scene, f: N.flags.interlude_done })));
  await ev(() => N.story2.abortScene());
  // nothing to heal in the middle of the story
  await story(P, TRACKS.slice(0, 5), {}, 'home');
  await sleep(4500);
  check(await ev(() => !N.story2.scene), 'mid-story free roam: no scene starts by itself');
  await errorsOf(P, 'heal');
  await page.context().close();
}

/* ====================================================================== m1: the first move hint */
async function m1Phase(browser) {
  phase = 'm1';
  const P = await openPage(browser);
  const { ev, page } = P;
  await ev(() => {
    window.__toasts = [];
    const t0 = N.hud.toast.bind(N.hud);
    N.hud.toast = (text, ms, o) => { window.__toasts.push(String(text)); return t0(text, ms, o); };
    window.__failR = [];
    N.on('mission:fail', (d) => window.__failR.push(d.reason));
    N.debug.newGame({ skipIntro: true });
    N.flags.prologue_seen = true;
    N.story.debug.mg = null;
    N.debug.skipDialogue(true);
    N.missions.start('bo_kaata', { noJump: true });
  });
  check(await until(page, () => N.input.actionLabel === 'Fly the kite', null, 15000), 'M1 starts at the kite spot ("Fly the kite")');
  // "Not now" on the kite card (a real click): its own fail line, then retry from the terrace
  await page.keyboard.press('KeyE');
  const card = await until(page, () => !!document.querySelector('.mg-screen [data-do=quit]'), null, 20000);
  if (card) await page.click('.mg-screen [data-do=quit]');
  check(card && await until(page, () => window.__failR.length > 0, null, 15000), 'the kite card\'s "Not now" fails the run', await ev(() => window.__failR));
  check(await ev(() => /^Not now\?/.test(window.__failR[0] || '')), '"Not now" gets its own line (not "the Ashok Nagar kite cut yours")', await ev(() => window.__failR));
  await until(page, () => !!document.querySelector('.hud-ask.show'), null, 8000);
  await page.keyboard.press('KeyE');
  check(await until(page, () => N.missions.active && N.missions.active.id === 'bo_kaata' && N.input.actionLabel === 'Fly the kite', null, 20000), 'retry: back on the terrace at the kite spot', await ev(() => ({ a: N.missions.active && N.missions.active.id, act: N.input.actionLabel })));
  await ev(() => { N.story.debug.mg = 'win'; });
  await page.keyboard.press('KeyE');
  check(await until(page, () => /^Lootna!/.test(N.hud.objectiveText || ''), null, 60000), 'kite won (autoplay): the lootna starts', await ev(() => N.hud.objectiveText));
  const t = await ev(() => window.__toasts.slice());
  check(t.some((x) => x === 'Move: arrow keys or WASD. Hold Shift to run.'), 'keyboard: the lootna shows "Move: arrow keys or WASD. Hold Shift to run."', t.slice(-6));
  await ev(() => N.missions.abort());
  await errorsOf(P, 'm1');
  await page.context().close();
}

/* ====================================================================== watch: the SA1 night watch keeps E for "Tag!" */
async function watchPhase(browser) {
  phase = 'watch';
  const P = await openPage(browser);
  const { ev, page } = P;
  await story(P, TRACKS.slice(0, 6), { pandal_nights: 1 }, 'playground_1');
  await ev(() => { N.calendar.set(2003, 9, 2, 21, 20); N.story.debug.mg = 'win'; N.missions.start('pandal_duty'); });
  await until(page, () => /Guard the laddu/.test(N.hud.objectiveText || ''), null, 20000);
  await ev(() => { const G = N.places.playground_1; N.player.teleport(G.x, G.y); });
  check(await until(page, () => N.story.debug.state().step === 'watch', null, 30000), 'SA1 night 2: the night watch starts', await ev(() => ({ st: N.story.debug.state().step, a: N.missions.active && N.missions.active.id })));
  // stand at the medical shop by the colony ground, no raider in reach, and press E (a player chasing a raider that ran off)
  await ev(() => { const S = N.places.medical_shop_8; N.player.teleport(S.x, S.y + 6); });
  await sleep(400);
  const before = await ev(() => ({ act: N.input.actionLabel, lock: N.missions.active && N.missions.active.lockShops }));
  await page.keyboard.press('KeyE');
  await sleep(600);
  const after = await ev(() => ({ shop: !!(N.shops && N.shops.isOpen && N.shops.isOpen()), mode: N.state.mode, act: N.input.actionLabel }));
  check(!after.shop && after.mode === 'play' && before.lock === 'story:watch', 'during the watch E never opens the medical shop\'s card (shops locked for the night)', { before, after });
  await ev(() => { N.story.debug.skip(); });
  check(await until(page, () => !N.missions.active || N.story.debug.state().step !== 'watch', null, 30000), 'the watch ends');
  await sleep(500);
  const un = await ev(() => ({ lock: N.missions.active ? N.missions.active.lockShops : null }));
  check(un.lock !== 'story:watch', 'the shop lock goes with the watch', un);
  await ev(() => { if (N.missions.active) N.missions.abort(); });
  await errorsOf(P, 'watch');
  await page.context().close();
}

/* ====================================================================== barks: bubbles keep out of the HUD, stack */
async function barksPhase(browser) {
  phase = 'barks';
  const P = await openPage(browser);
  const { ev, page } = P;
  await story(P, ['bo_kaata'], {});
  await ev(() => { N.hints.start('lost_and_found'); });
  await until(page, () => !!N.hud.objectiveText, null, 8000);
  const r = await ev(async () => {
    const gw = (s) => new Promise((res) => { const t0 = N.time.now; const f = () => (N.time.now - t0 >= s ? res() : setTimeout(f, 30)); f(); });
    const p = N.player, R = N.render, cv = R.canvas.getBoundingClientRect();
    const scr = (x, y) => { const q = R.proj(x, y, 15); return (cv.top + (q.y / R.H) * cv.height); };
    // a spot whose bubble would sit on the objective strip (top centre)
    let dy = 40; while (dy < 600 && scr(p.x, p.y - dy) > 70) dy += 6;
    const a = N.npcs.spawn('aunty_2', { x: p.x, y: p.y - dy }, { idle: 'stand', talk: false });
    const b = N.npcs.spawn('immu', { x: p.x + 40, y: p.y + 30 }, { idle: 'stand', talk: false });
    const c = N.npcs.spawn('chitti', { x: p.x + 44, y: p.y + 31 }, { idle: 'stand', talk: false });
    await gw(0.3);
    N.dialogue.bark('aunty_2', 'Arre, that is near Mozamjahi Market! Everybody knows.', { secs: 6 });
    N.dialogue.bark('immu', 'Agent Chinnu! Red kite, two o\'clock. Over!', { secs: 6 });
    N.dialogue.bark('chitti', 'Mummy ki cheppesta! I saw. I SAW!', { secs: 6 });
    await gw(0.8);
    const box = (e) => { const q = e.getBoundingClientRect(); return [q.left, q.top, q.right, q.bottom]; };
    const els = Array.from(document.querySelectorAll('#barks .bark')).filter((e) => e.style.visibility !== 'hidden');
    const obj = document.querySelector('.hud-obj.show') || document.querySelector('.hud-obj');
    const ov = (A, B) => A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3];
    const bx = els.map(box), ob = obj ? box(obj) : null;
    const pair = []; for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) if (ov(bx[i], bx[j])) pair.push([i, j]);
    const under = ob ? bx.filter((q) => ov(q, ob)).length : 0;
    void a; void b; void c;
    return { n: bx.length, pair, under, dy, ob, bx: bx.map((q) => q.map(Math.round)) };
  });
  await page.screenshot({ path: path.join(OUT, 'journey_barks.png') });
  check(r.n >= 3, 'three speech bubbles on screen', r);
  check(!r.pair.length, 'speech bubbles next to each other stack instead of overlapping (G27)', r);
  check(r.under === 0, 'a bubble that would sit on the objective strip moves below it (X4)', r);
  await errorsOf(P, 'barks');
  await page.context().close();
}

(async () => {
  const T0 = Date.now();
  if (want('static')) staticChecks();
  const browser = await chromium.launch();
  try {
    if (want('static')) { const P = await openPage(browser); await glossaryCheck(P); await P.page.context().close(); }
    if (want('roam')) {
      await roamPhase(browser, { viewport: { width: 1280, height: 720 } }, 'desk');
      await roamPhase(browser, { viewport: { width: 390, height: 844 }, touch: true, dpr: 2 }, 'phone');
    }
    if (want('home')) await homePhase(browser);
    if (want('meta')) await metaPhase(browser);
    if (want('heal')) await healPhase(browser);
    if (want('m1')) await m1Phase(browser);
    if (want('barks')) await barksPhase(browser);
    if (want('watch')) await watchPhase(browser);
  } catch (e) { check(false, 'exception: ' + (e.stack || e.message)); }
  await browser.close();
  console.log('\n' + passes + ' passed, ' + failures.length + ' failed (' + ((Date.now() - T0) / 1000).toFixed(0) + ' s)   screenshots: ' + OUT);
  if (failures.length) { console.log('JOURNEY FAILED:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
  console.log('JOURNEY PASSED');
})();
