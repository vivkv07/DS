/* NOSTALGIA — tests/story_part1.cjs  (owner: story agent, part 1)
 * Plays the story layer of src/story.js in headless Chromium (Playwright) and checks it:
 *   - the 2026 PROLOGUE through the real title -> name card -> cutscene flow (real E presses,
 *     the ▶ PLAY prompt), then M1 starting on home_terrace in TUE 14 JAN 2003 07:10;
 *   - M1..M6 played to MISSION PASSED (debug-assisted travel and minigame autoplay; real keyboard
 *     input for at least one beat per mission: J-card ▶ PLAY, ● REC, the riddle choice, the queue
 *     cage, the Assembly choice, the walkman Q key...), each with a FAIL + RETRY from its checkpoint;
 *   - after each: tape counter, tin token, flags, collectible unlocks, hints, the autosave;
 *   - SA4 six_balls with the LB Stadium final (N.flags.lb_match, match engine) + the replayable
 *     exhibition match; SA3 sunday_mutton; SA2 current_poyindi (power cut darkness); SA1
 *     pandal_duty (chanda round + three watch nights): each passed, each with a fail + retry;
 *   - zero console errors / page errors / N.err; screenshots in tests/out/story1_*.png.
 *
 *   node nostalgia/tests/story_part1.cjs            (all)
 *   ONLY=prologue,m1,m2 node nostalgia/tests/story_part1.cjs   (phases: prologue m1 m2 m3 m4 m5 m6 sa4 sa3 sa2 sa1)
 *   KEEP=1 ... keep going after a failure inside a phase
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (ph) => !ONLY || ONLY.indexOf(ph) >= 0;

const failures = [];
let phase = '-';
const fail = (msg) => { failures.push('[' + phase + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, extra) => { if (cond) ok(msg); else fail(msg + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); return !!cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let page, errors;
const shot = (n) => page.screenshot({ path: path.join(OUT, 'story1_' + n + '.png') });
const ev = (fn, arg) => page.evaluate(fn, arg);

/* ------------------------------------------------------------------ helpers */
async function snap() {
  return ev(() => {
    const a = N.missions.active;
    return {
      mode: N.state.mode, id: a && a.id, obj: N.hud.objectiveText, rec: N.tape.recState, st: N.story.debug.state(), tgt: N.story.debug.target(),
      lf: N.missions.lastFailed && N.missions.lastFailed.id, ask: !!document.querySelector('.hud-ask.show'),
      p: { x: Math.round(N.player.x), y: Math.round(N.player.y), lvl: N.player.level, veh: N.player.vehicle && N.player.vehicle.type },
      clock: N.calendar.osd(), wanted: N.wanted ? N.wanted.level : 0,
    };
  });
}
async function waitFor(fn, arg, ms, what) {
  const ok2 = await page.waitForFunction(fn, arg, { timeout: ms || 10000, polling: 100 }).then(() => true, () => false);
  if (!ok2 && what) fail('timed out waiting for ' + what);
  return ok2;
}
/** Teleport (or move the ridden vehicle) to a point. */
async function goTo(t) {
  await ev((t) => {
    const p = N.player;
    if (p.vehicle) { const v = p.vehicle; v.x = t.x; v.y = t.y + 6; v.vx = v.vy = 0; v.speed = 0; v.okX = null; p.x = v.x; p.y = v.y; }
    else p.teleport(t.x, t.y);
  }, t);
  await sleep(220);
}
async function pressKey(k, n) { for (let i = 0; i < (n || 1); i++) { await page.keyboard.press(k); await sleep(120); } }
/** Hold a real key for ms. */
async function hold(k, ms) { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); }

/**
 * Drive the active mission until it passes / fails. hooks(s) may handle a state and return true.
 * Real input: ● REC (E), act/press prompts (E), queue cage (↑ / E), getting on story cycles (E).
 */
const counts = (o) => ({ recs: o.recs || 0, acts: o.acts || 0, steps: o.steps || 0, lineMein: o.lineMein || 0, rides: o.rides || 0, skips: o.skips || 0 });
async function autopilot(id, o) {
  o = o || {};
  const t0 = Date.now();
  const pass0 = await ev((id) => (window.__passes && window.__passes[id]) || 0, id);
  let last = '', same = 0;
  for (;;) {
    const s = await snap();
    const done = await ev((a) => ((window.__passes && window.__passes[a.id]) || 0) > a.n, { id, n: pass0 });
    if (done && s.id !== id) return Object.assign({ ok: true, s }, counts(o));
    if (s.lf === id && s.id !== id) { s.why = await ev(() => (window.__fails || []).slice(-1)[0] || null); return Object.assign({ ok: false, failed: true, s }, counts(o)); }
    if (Date.now() - t0 > (o.timeout || 420000)) return { ok: false, timeout: true, s };
    const key = JSON.stringify([s.mode, s.obj, s.st.step, s.p]);
    if (key === last) same++; else { same = 0; last = key; if (process.env.VERBOSE) console.log('     ·', s.mode, '|', s.obj, '|', s.st.step, '|', JSON.stringify(s.p), s.clock); }
    if (s.rec && s.rec.phase === 'prompt' && s.mode === 'play') { await pressKey('KeyE'); o.recs = (o.recs || 0) + 1; await sleep(250); continue; }
    if (s.mode === 'dialogue' && same > 6) { await pressKey('KeyE'); same = 0; continue; }
    if (s.mode !== 'play') { await sleep(220); continue; }
    if (o.hook && await o.hook(s)) continue;
    if (s.st.queue && !s.st.queue.done) {
      if (s.st.queue.tell) { await pressKey('KeyE'); o.lineMein = (o.lineMein || 0) + 1; }
      else if (s.st.queue.gap) { await pressKey('ArrowUp'); o.steps = (o.steps || 0) + 1; }
      await sleep(120); continue;
    }
    if (s.st.cargo != null && s.tgt) { await goTo(s.tgt); continue; }
    const veh = await ev(() => {
      const p = N.player; if (p.vehicle) return null;
      const r = N.missions.active; if (!r) return null;
      const v = r.spawned.map((x) => x.e).find((e) => e && e.kind === 'vehicle' && e.alive && !e.noEnter && !e.locked && e.T && e.T.cls === 'bike');
      return v ? { x: v.x, y: v.y } : null;
    });
    if (veh && /Get on|cycle/i.test(s.obj || '')) { await goTo({ x: veh.x + 9, y: veh.y }); await pressKey('KeyE'); o.rides = (o.rides || 0) + 1; await sleep(250); continue; }
    if (s.tgt) {
      const d = Math.hypot(s.tgt.x - s.p.x, s.tgt.y - s.p.y);
      if (d > 12) { await goTo(s.tgt); continue; }
      if (s.st.step === 'act' || s.st.step === 'press' || s.st.step === 'cutouts') { await pressKey('KeyE'); o.acts = (o.acts || 0) + 1; await sleep(250); continue; }
    } else if (s.st.step === 'press') { await pressKey('KeyE'); o.acts = (o.acts || 0) + 1; await sleep(250); continue; }
    if (same > 40 && s.st.step) { await ev(() => N.story.debug.skip()); same = 0; o.skips = (o.skips || 0) + 1; }
    await sleep(180);
  }
}
/** Press E through dialogue lines (real input) until a choice is on screen. */
async function untilChoice(ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await ev(() => !!(N.dialogue.current && N.dialogue.current.choices && !N.dialogue.current.typing))) return true;
    if (await ev(() => !!(N.dialogue.isOpen && N.dialogue.isOpen() && !(N.dialogue.current && N.dialogue.current.choices)))) await pressKey('KeyE');
    await sleep(200);
  }
  fail('timed out waiting for ' + what);
  return false;
}
/** The retry card after MISSION FAILED: press E (real) and wait for the run to restart. */
async function retryFromCard(id) {
  const shown = await waitFor(() => !!document.querySelector('.hud-ask.show'), null, 6000, 'the retry card');
  if (!shown) return false;
  await shot(id + '_failed');
  // E on the card (a walk-up viewpoint may hold the controls for a moment: press again)
  for (let i = 0; i < 12; i++) {
    await pressKey('KeyE');
    if (await waitFor((id) => N.missions.active && N.missions.active.id === id && N.missions.active.attempt >= 2, id, 700)) return true;
  }
  fail('timed out waiting for the retry to start');
  return false;
}
async function saveData() {
  return ev(() => { try { const raw = localStorage.getItem('nostalgia.save.v1'); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } });
}
async function verifyAfter(id, exp) {
  const s = await ev(() => ({
    done: Array.from(N.missions.done), counter: N.tape.counter, tracks: N.tape.tracks.map((t) => t.id), tin: Array.from(N.tape.tin), flags: Object.assign({}, N.flags),
    inv: Array.from(N.player.inventory), money: N.player.money, hint: N.hints.active ? { id: N.hints.active.id, off: N.hints.active.off, clue: N.hints.active.clue } : null,
    unlocked: N.collectibles && N.collectibles.unlocked ? ['kites', 'golis', 'cassettes', 'tickets', 'frames'].filter((k) => N.collectibles.unlocked(k)) : [],
    date: N.calendar.osd(), mode: N.state.mode, errs: N.debug.state().errors,
  }));
  check(s.done.indexOf(id) >= 0 || exp.repeatable, id + ': MISSION PASSED (in missions.done)');
  if (exp.counter != null) check(s.counter === exp.counter, id + ': tape counter ' + exp.counter, s.counter);
  if (exp.track) check(s.tracks.indexOf(exp.track) >= 0, id + ': Side A track recorded');
  for (const t of exp.tin || []) check(s.tin.indexOf(t) >= 0, id + ': tin token ' + t, s.tin);
  for (const f of exp.flags || []) check(!!s.flags[f], id + ': flag ' + f);
  for (const [f, v] of Object.entries(exp.flagVals || {})) check(s.flags[f] === v, id + ': flag ' + f + ' = ' + v, s.flags[f]);
  for (const it of exp.inv || []) check(s.inv.indexOf(it) >= 0, id + ': item ' + it, s.inv);
  for (const u of exp.unlocked || []) check(s.unlocked.indexOf(u) >= 0, id + ': collectibles series ' + u + ' unlocked', s.unlocked);
  if (exp.hint !== undefined) check(s.hint && s.hint.id === exp.hint, id + ': next clue armed (' + exp.hint + ')', s.hint);
  if (exp.date) check(s.date.indexOf(exp.date) >= 0, id + ': free roam goes on at ' + exp.date, s.date);
  if (exp.save !== false) {
    const sv = await saveData();
    const sdone = sv && sv.data && sv.data.missions && sv.data.missions.done;
    check(!!(sdone && sdone.indexOf(id) >= 0), id + ': autosaved (save has it in missions.done)', sdone);
    if (exp.counter != null) check(!!(sv && sv.data && sv.data.tape && sv.data.tape.counter === exp.counter), id + ': save holds the tape counter', sv && sv.data && sv.data.tape && sv.data.tape.counter);
  }
  return s;
}
async function startMission(id, at) {
  await ev((a) => { const P = N.places[a.at] || N.places.home; if (P) N.player.teleport(P.x, P.y + 8); N.debug.startMission(a.id); }, { id, at: at || 'home' });
  return waitFor((id) => N.missions.active && N.missions.active.id === id, id, 8000, id + ' to start');
}
/** Walk into a giver marker and press E on the J-card (real input). */
async function startFromGiver(id) {
  // step away first (a giver right where the last mission ended waits until you step out)
  await ev((id) => { const d = N.missions.defs[id]; const g = d && N.missions.giverPos(d); if (g) N.player.teleport(g.x + 160, g.y + 120); }, id);
  await sleep(700);
  await waitFor((id) => (N.missions.markers() || []).some((x) => x.kind === 'giver' && x.id === id), id, 3000);
  const g = await ev((id) => (N.missions.markers() || []).find((x) => x.kind === 'giver' && x.id === id) || null, id);
  if (!check(!!g, id + ': giver marker visible')) return false;
  await goTo({ x: g.x, y: g.y });
  const card = await waitFor((id) => N.missions.prompt === id || (N.missions.active && N.missions.active.id === id), id, 10000, id + ' J-card');
  if (card) await pressKey('KeyE');
  return waitFor((id) => N.missions.active && N.missions.active.id === id, id, 8000, id + ' to start from the J-card');
}
async function finish(id, o) {
  const r = await autopilot(id, o);
  check(r.ok, id + ': played to MISSION PASSED' + (r.timeout ? ' (timeout)' : r.failed ? ' (failed)' : ''), r.ok ? undefined : r.s);
  await waitFor(() => N.state.mode === 'play' && !N.missions.active, null, 15000);
  await sleep(600);
  return r;
}

/* ------------------------------------------------------------------ phases */
async function prologue() {
  phase = 'prologue';
  console.log('\n== PROLOGUE (2026) + M1 start');
  await ev(() => { N.menus.quickStart = false; try { localStorage.removeItem('nostalgia.save.v1'); } catch (e) { /* ignore */ } });
  await page.click('#title-start');
  const named = await waitFor(() => N.menus.debugState().top === 'name', null, 6000, 'the name card');
  if (named) await page.click('.mn-name [data-act=start]');
  const cs = await waitFor(() => N.state.mode === 'cutscene', null, 3000, 'the prologue cutscene');
  check(cs, 'PLAY -> name card -> the prologue cutscene starts at once');
  await sleep(900);
  const y = await ev(() => ({ year: N.flags.year, date: N.calendar.label(), art: !!document.querySelector('.mn-cs canvas.st-art.on') }));
  check(y.year === 2026 && /14 JAN 2026/.test(y.date), 'prologue runs in WED 14 JAN 2026', y);
  check(y.art, 'prologue art (desk lamp, window, parcel) is painted behind the cards');
  await shot('prologue_office');
  // advance through the cards and lines with real E presses until the ▶ PLAY prompt
  let prompt = false;
  for (let i = 0; i < 80 && !prompt; i++) {
    prompt = await ev(() => !!document.querySelector('.mn-cs .cs-card.k-prompt'));
    if (prompt) break;
    if (i === 6) await shot('prologue_amma');
    await pressKey('KeyE');
    await sleep(250);
  }
  check(prompt, 'the ▶ PLAY prompt appears (bible §4.1)');
  await shot('prologue_play');
  await pressKey('KeyE'); // ▶ PLAY
  // the rewind: 2026 -> 2003
  const rew = await waitFor(() => document.querySelector('.mn-cs.vhs-rewind') !== null, null, 8000, 'the ◀◀ REWIND');
  if (rew) await shot('prologue_rewind');
  // let the rest play (E advances cards)
  for (let i = 0; i < 40; i++) { if (await ev(() => N.state.mode !== 'cutscene')) break; await pressKey('KeyE'); await sleep(300); }
  await waitFor(() => N.state.mode === 'play' && N.missions.active && N.missions.active.id === 'bo_kaata', null, 15000, 'M1 to start after the prologue');
  const s = await ev(() => ({ year: N.flags.year, date: N.calendar.label(), clock: N.clock.label(), lvl: N.player.level, seen: N.flags.prologue_seen, sank: N.flags.sankranti, obj: N.hud.objectiveText, errs: N.debug.state().errors }));
  check(s.year === 2003 && s.date === 'TUE 14 JAN 2003' && s.clock === '07:10', 'after ◀◀ REWIND: TUE 14 JAN 2003 07:10', s);
  check(s.lvl === 'home_terrace', 'M1 auto-starts on home_terrace (the player is on the roof)', s.lvl);
  check(s.seen && s.sank, 'flags prologue_seen + sankranti');
  check(s.obj === 'Fly your kite. Win a pech!', 'M1 objective: "Fly your kite. Win a pech!"', s.obj);
  await sleep(500);
  await shot('m1_terrace');
}

async function m1() {
  phase = 'm1';
  console.log('\n== M1 bo_kaata');
  await ev(() => { N.debug.skipDialogue(true); N.story.debug.fastRides = true; N.story.debug.mg = 'lose'; N.story.debug.mgTimeScale = 2; });
  if (!(await ev(() => N.missions.active && N.missions.active.id === 'bo_kaata'))) { await ev(() => { N.flags.prologue_seen = true; }); await startMission('bo_kaata', 'home_terrace'); }
  // real input: walk to the kite (it is right there on the terrace) and press E
  await waitFor(() => N.story.debug.state().step === 'act', null, 5000, 'the kite prompt');
  const lab = await ev(() => N.input.actionLabel);
  check(lab === 'Fly the kite', 'ACTION label "Fly the kite" on the terrace', lab);
  await pressKey('KeyE');
  // the kite fight starts (on a loaded machine a slow frame can eat the prompt: press E again)
  const kiteGo = () => (N.minigames && N.minigames.active === 'kite') || N.story.debug.state().step !== 'act' || !!(N.missions.lastFailed && N.missions.lastFailed.id === 'bo_kaata');
  for (let i = 0; i < 3 && !(await waitFor(kiteGo, null, 4000)); i++) { console.log('   (E again on "Fly the kite")'); await pressKey('KeyE'); }
  // the kite minigame is lost -> MISSION FAILED -> retry from 'terrace'. The 'lose' bot just over-pulls, and
  // with a random seed an over-pull can still cut the rival; so after a few seconds of bot play the test ends
  // the fight as lost (g.finish(false)) if the bot has not lost it yet.
  if (await waitFor(() => N.minigames && N.minigames.active === 'kite', null, 20000, 'the kite minigame')) {
    await waitFor(() => { const g = N.minigames.game; return !g || g.phase === 'play' || g.over; }, null, 8000);
    await sleep(1200);
    await ev(() => { const g = N.minigames.game; if (g && g.id === 'kite' && !g.over && !g.closed) g.finish(false, { reason: 'test' }); });
  }
  const failed = await waitFor(() => N.missions.lastFailed && N.missions.lastFailed.id === 'bo_kaata', null, 60000, 'M1 to fail on a lost kite fight');
  check(failed, 'losing the kite fight fails M1 (bible: the kite minigame offers retry)');
  if (!failed) console.log('   kite debug:', JSON.stringify(await ev(() => ({ mg: window.__mg.slice(-3), end: window.__mgEnd.slice(-3), dbg: N.story.debug.mg, obj: N.hud.objectiveText, mode: N.state.mode, fails: (window.__fails || []).slice(-2) }))));
  await ev(() => { N.story.debug.mg = 'win'; N.story.debug.mgTimeScale = 6; });
  check(await retryFromCard('bo_kaata'), 'retry (E on the card) restarts M1 from the terrace checkpoint');
  const lvl = await ev(() => N.player.level);
  check(lvl === 'home_terrace', 'retry resumes on home_terrace', lvl);
  let lootna = null;
  const r = await finish('bo_kaata', { hook: async (s) => {
    if (/Lootna/.test(s.obj || '') && !lootna) { lootna = s.clock; await shot('m1_lootna'); }
    if (/fountain railing/.test(s.obj || '') && !s.tgt) { await ev(() => N.story.debug.skip()); return true; }
    return false;
  } });
  check(r.recs >= 1, 'M1 ● REC pressed with a real E', r.recs);
  const v = await verifyAfter('bo_kaata', { counter: 83, track: 'bo_kaata', tin: ['kite_corner'], flags: ['prologue_seen'], inv: ['camera', 'charkhi', 'kite'], unlocked: ['kites', 'golis', 'frames'], hint: 'lost_and_found', date: 'TUE 14 JAN 2003  18:2' });
  // the Lootna bonus is a time bonus (+₹2): it depends on how fast the run went, so it is logged, not required
  console.log('   lootna bonus: ' + (v.flags.m1_lootna_bonus ? 'yes (+₹2)' : 'no (slow run)'));
  check(Array.isArray(v.flags.bunty_words) && v.flags.bunty_words.length === 2, 'Bunty\'s "nostalgia" definitions collected', v.flags.bunty_words);
  // the M2 giver stays hidden until you are near Mozamjahi (the clue is a riddle)
  const g = await ev(() => (N.missions.markers() || []).some((x) => x.id === 'lost_and_found'));
  check(!g, 'M2 giver hidden far from the answer (the clue must be solved)');
  await shot('m1_passed');
}

async function m2() {
  phase = 'm2';
  console.log('\n== M2 lost_and_found');
  await ev(() => { N.debug.skipDialogue(true); N.story.debug.fastRides = true; N.story.debug.mg = 'win'; if (!N.missions.isDone('bo_kaata')) { N.missions.done.add('bo_kaata'); N.flags.prologue_seen = true; } });
  // near the answer: the giver appears; walk in and press ▶ PLAY (real E)
  await ev(() => { const P = N.places.mozamjahi_market; N.player.teleport(P.x + 150, P.y + 120); });
  await waitFor(() => (N.missions.markers() || []).some((x) => x.id === 'lost_and_found'), null, 3000, 'the M2 giver near Mozamjahi');
  check(await startFromGiver('lost_and_found'), 'M2 starts from its giver with a real E on the J-card');
  await waitFor(() => N.calendar.label() === 'SAT 25 JAN 2003', null, 5000, 'the ▶▶ jump to 25 Jan');
  // the riddle: real keys (skip off; ↓ to "4"; E)
  await ev(() => { N.debug.skipDialogue(false); });
  const chose = await untilChoice(25000, 'the riddle choice');
  if (chose) {
    // complete the typing and pick "4"
    await shot('m2_riddle');
    await pressKey('ArrowDown');
    await pressKey('KeyE');
    await sleep(400);
  }
  await ev(() => { N.debug.skipDialogue(true); });
  await waitFor(() => N.flags.lock_2 === 4, null, 8000, 'lock slot 2 = 4');
  check(await ev(() => N.flags.lock_2 === 4 && N.flags.riddle_2), 'The Lock slot 2 filled with 4 (real ↓ + E on the choice)');
  // fail + retry after the tin
  let before = null;
  const r0 = await autopilot('lost_and_found', { timeout: 120000, hook: async () => {
    if (!before && await ev(() => { const r = N.missions.active; return !!(r && r.checkpointData && r.checkpointData.name === 'tin_bought' && N.player.inventory.has('tin')); })) {
      before = await ev(() => ({ money: N.player.money, x: N.player.x, y: N.player.y }));
      await ev(() => N.missions.fail('test: forced fail after the tin'));
      return true;
    }
    return false;
  } });
  check(r0.failed && before, 'M2 forced fail after the tin_bought checkpoint');
  check(await retryFromCard('lost_and_found'), 'M2 retry after a forced fail');
  await waitFor(() => N.missions.active && !N.missions.active.ff, null, 5000);
  const after = await ev(() => ({ money: N.player.money, x: N.player.x, y: N.player.y, tin: N.player.inventory.has('tin') }));
  check(before && after.tin && after.money === before.money && Math.hypot(after.x - before.x, after.y - before.y) < 60, 'retry resumes at tin_bought without paying for the tin again', { before, after });
  const r = await finish('lost_and_found');
  void r;
  await verifyAfter('lost_and_found', { counter: 166, track: 'lost_and_found', tin: ['numaish_ticket'], inv: ['tin'], hint: 'first_day_first_show', date: 'SAT 25 JAN 2003  20:0' });
}

async function m3() {
  phase = 'm3';
  console.log('\n== M3 first_day_first_show');
  await ev(() => { N.debug.skipDialogue(true); N.story.debug.fastRides = true; N.story.debug.mg = 'win'; for (const id of ['bo_kaata', 'lost_and_found']) N.missions.done.add(id); N.flags.prologue_seen = true; });
  check(await startFromGiver('first_day_first_show'), 'M3 starts from the alarm-clock giver at home');
  await waitFor(() => N.calendar.label() === 'SAT 08 FEB 2003', null, 5000, 'the ▶▶ jump to 8 Feb');
  // let the autopilot reach the queue, then force HOUSEFULL (timer) -> fail -> retry from 'queue'
  let forced = false, qshot = false;
  const r0 = await autopilot('first_day_first_show', { timeout: 120000, hook: async (s) => {
    if (s.st.queue && !forced) {
      await sleep(1500);
      await shot('m3_queue');
      await ev(() => { const r = N.missions.active; if (r && r.timer) r.timer.left = 0.3; });
      forced = true;
      return true;
    }
    return false;
  } });
  check(r0.failed, 'HOUSEFULL fails M3 (queue cage timer)', r0.s && r0.s.obj);
  check(await retryFromCard('first_day_first_show'), 'retry from the queue checkpoint');
  // the queue with real ↑ / E presses, at normal speed (75 s HOUSEFULL timer, 9 ahead + 4 cutters)
  const r = await finish('first_day_first_show', { hook: async (s) => { if (s.st.queue && !qshot) { qshot = true; await sleep(800); await shot('m3_queue_retry'); } return false; } });
  check((r.steps || 0) >= 3, 'queue cage: stepped forward with real ↑ presses', r.steps);
  await verifyAfter('first_day_first_show', { counter: 249, track: 'first_day_first_show', tin: ['toofan_stub'], flags: ['meter_live', 'sa6_unlocked'], hint: 'last_man_batting', date: 'SAT 08 FEB 2003' });
  const w = await ev(() => N.wanted.level);
  // the M4 giver is at home, where M3 ended: it must not start by itself on the J-card dwell
  await sleep(2600);
  const auto = await ev(() => N.missions.active && N.missions.active.id);
  check(!auto, 'standing at home after M3: M4 waits until you step out (no accidental start)', auto);
  check(w === 0, 'the peace offering cleared the Chappal Meter', w);
}

async function m4() {
  phase = 'm4';
  console.log('\n== M4 last_man_batting');
  await ev(() => { N.debug.skipDialogue(true); N.story.debug.fastRides = true; N.story.debug.mg = 'lose'; for (const id of ['bo_kaata', 'lost_and_found', 'first_day_first_show']) N.missions.done.add(id); N.flags.prologue_seen = true; });
  check(await startFromGiver('last_man_batting'), 'M4 starts from Amma at home');
  const giverNpcGone = await ev(() => !N.npcs.get('giver:last_man_batting'));
  check(giverNpcGone, 'giver NPC (Amma) handed over to the mission');
  const r0 = await autopilot('last_man_batting', { timeout: 120000 });
  check(r0.failed, 'losing the back-lawn match fails M4');
  await ev(() => { N.story.debug.mg = 'win'; });
  check(await retryFromCard('last_man_batting'), 'retry from the match checkpoint');
  // the Assembly gate: real choice (cheeky first: +1 meter, the choice repeats; then polite)
  let gate = 0;
  const r = await finish('last_man_batting', { hook: async (s) => {
    if (/Assembly gate/.test(s.obj || '') && gate === 0) {
      await ev(() => { N.debug.skipDialogue(false); });
      if (s.tgt) await goTo(s.tgt);
      if (await untilChoice(15000, 'the Assembly choice')) {
        await shot('m4_gate');
        const w0 = await ev(() => N.wanted.level);
        await pressKey('ArrowDown'); await pressKey('KeyE');
        await sleep(300);
        // the sentry's reply, then the choice again
        for (let i = 0; i < 10 && !(await ev(() => !!(N.dialogue.current && N.dialogue.current.choices))); i++) await pressKey('KeyE');
        const w1 = await ev(() => N.wanted.level);
        check(w1 >= w0 + 1 || w1 >= 1, 'cheeky "Oye uncle" raises the Chappal Meter and the choice repeats', { w0, w1 });
        await pressKey('KeyE'); // polite (first option)
      }
      await ev(() => { N.debug.skipDialogue(true); });
      gate = 1;
      return true;
    }
    return false;
  } });
  void r;
  await verifyAfter('last_man_batting', { counter: 332, track: 'last_man_batting', tin: ['signed_ball'], inv: ['signed_ball'], flags: ['side_cricket'], flagVals: { lock_1: 1 }, hint: 'right_right', date: 'SUN 23 MAR 2003' });
}

async function m5() {
  phase = 'm5';
  console.log('\n== M5 right_right');
  await ev(() => { N.debug.skipDialogue(true); N.story.debug.fastRides = true; N.story.debug.mg = 'win'; for (const id of ['bo_kaata', 'lost_and_found', 'first_day_first_show', 'last_man_batting']) N.missions.done.add(id); N.flags.prologue_seen = true; });
  check(await startFromGiver('right_right'), 'M5 starts from Amma at home');
  let forced = false;
  const r0 = await autopilot('right_right', { timeout: 120000, hook: async (s) => {
    if (!forced && /red bus/.test(s.obj || '') && await ev(() => N.missions.active.checkpointData && N.missions.active.checkpointData.name === 'koti')) {
      forced = true; await ev(() => N.missions.fail('test: forced fail at Koti')); return true;
    }
    return false;
  } });
  check(r0.failed, 'M5 forced fail at the koti checkpoint');
  check(await retryFromCard('right_right'), 'M5 retry');
  await waitFor(() => N.missions.active && !N.missions.active.ff, null, 6000);
  const near = await ev(() => { const k = N.places.koti_bus_stand; return Math.hypot(N.player.x - k.x, N.player.y - k.y); });
  check(near < 140, 'retry resumes at Koti (checkpoint koti)', Math.round(near));
  let bays = false;
  await finish('right_right', { hook: async (s) => { if (!bays && /Kurnool/.test(s.obj || '')) { bays = true; await sleep(1200); await shot('m5_imlibun'); } return false; } });
  const v = await verifyAfter('right_right', { counter: 415, track: 'right_right', tin: ['punched_ticket'], inv: ['punched_ticket'], unlocked: ['tickets'], hint: 'the_clap', date: 'WED 02 APR 2003' });
  check(v.flags.bus_unlocked || v.flags.unlock_bus, 'bus fast travel unlocked');
  check(v.hint && v.hint.off, 'clue 5: hint tiers switched off ("Even Yadagiri doesn\'t know")', v.hint);
}

async function m6() {
  phase = 'm6';
  console.log('\n== M6 ammammas_thursday');
  await ev(() => { N.debug.skipDialogue(true); N.story.debug.fastRides = true; N.story.debug.mg = 'win'; for (const id of ['bo_kaata', 'lost_and_found', 'first_day_first_show', 'last_man_batting', 'right_right']) N.missions.done.add(id); N.flags.prologue_seen = true; N.debug.setTime(10, 0); });
  check(await startFromGiver('ammammas_thursday'), 'M6 starts from Ammamma on the verandah swing');
  // the walkman tutorial: real Q
  let q = false, spilled = false;
  const r0 = await autopilot('ammammas_thursday', { timeout: 150000, hook: async (s) => {
    if (!q && /Wait for the current/.test(s.obj || '')) {
      q = true;
      check(await ev(() => !!N.flags.power_cut), 'power cut at the girni (N.flags.power_cut)');
      const w0 = await ev(() => window.__wm);
      await pressKey('KeyQ');
      await sleep(300);
      const w1 = await ev(() => window.__wm);
      check(w1 > w0, 'walkman tutorial: real Q plays the walkman (the current comes back)', { w0, w1 });
      return true;
    }
    if (!spilled && s.st.cargo != null && s.p.veh === 'old_cycle') {
      spilled = true;
      // ride away from the girni first (its odd-job giver stands there)
      const h = await ev(() => {
        // a spot on the way home, away from every other giver (a job giver would start on the 1 s J-card dwell)
        const a = N.places.pindi_girni_1, b = N.places.home;
        const gs = Object.values(N.missions.defs).map((d) => N.missions.giverPos(d)).filter(Boolean);
        let best = null, bd = -1;
        for (let k = 0; k <= 20; k++) {
          for (const off of [0, 60, -60, 120, -120]) {
            const x = a.x + (b.x - a.x) * (k / 20), y = a.y + (b.y - a.y) * (k / 20) + off;
            if (!N.world.isWalkable(x, y)) continue;
            const md = Math.min.apply(null, gs.map((g) => Math.hypot(g.x - x, g.y - y)).concat([1e9]));
            if (md > bd) { bd = md; best = { x, y }; }
          }
        }
        return best || { x: a.x, y: a.y + 120 };
      });
      await goTo(h);
      await sleep(400);
      await shot('m6_cargo');
      // potholes / kerbs / a crash: bumps on the cycle spill the flour below 40 -> fail
      await ev(() => { const v = N.player.vehicle; for (let i = 0; i < 5; i++) N.emit('bump', { a: v, b: null, speed: 72, x: v.x, y: v.y, wall: true, vehicle: v }); });
      await sleep(400);
      return true;
    }
    return false;
  } });
  check(q, 'reached the power-cut step');
  check(r0.failed, 'spilling the flour (cargo below 40) fails M6', r0.s && r0.s.obj);
  check(await retryFromCard('ammammas_thursday'), 'retry from girni_done');
  await waitFor(() => N.missions.active && !N.missions.active.ff, null, 6000);
  const near = await ev(() => { const k = N.places.pindi_girni_1; return Math.hypot(N.player.x - k.x, N.player.y - k.y); });
  check(near < 120, 'retry resumes at the girni (girni_done)', Math.round(near));
  let tq = false;
  const r = await finish('ammammas_thursday', { hook: async (s) => { if (!tq && s.st.queue) { tq = true; await sleep(800); await shot('m6_temple_queue'); } return false; } });
  check((r.steps || 0) >= 1, 'temple queue: real ↑ steps (respect variant)', r.steps);
  await verifyAfter('ammammas_thursday', { counter: 498, track: 'ammammas_thursday', tin: ['brass_token_47'], flags: ['clue5_solved'], hint: 'the_clap', date: 'THU 15 MAY 2003  19:3' });
  const h = await ev(() => N.hints.active);
  check(h && !h.off && /Fateh Darwaza/.test(h.clue), 'clue 5 solved: Fateh Darwaza / Bala Hissar in the Journal, tiers back on', h);
  check(await ev(() => !N.flags.power_cut), 'current came back (power_cut off)');
}

async function sa4() {
  phase = 'sa4';
  console.log('\n== SA4 six_balls + the LB Stadium final + exhibition');
  await ev(() => { N.debug.skipDialogue(true); N.story.debug.fastRides = true; N.story.debug.mg = 'lose'; for (const id of ['bo_kaata', 'lost_and_found', 'first_day_first_show', 'last_man_batting', 'right_right']) N.missions.done.add(id); N.flags.prologue_seen = true; N.calendar.set(2003, 5, 3, 6, 10); });
  const money0 = await ev(() => N.player.money);
  check(await startFromGiver('six_balls'), 'SA4 starts from Ayesha at the Jawahar Bal Bhavan notice board');
  const r0 = await autopilot('six_balls', { timeout: 150000 });
  check(r0.failed, 'losing two dawn sessions fails SA4 (win two of three)');
  await ev(() => { N.story.debug.mg = 'win'; });
  check(await retryFromCard('six_balls'), 'SA4 retry from the nets');
  const mg0 = await ev(() => window.__mg.length);
  let watching = true;
  const watcher = (async () => { while (watching) { if (await ev(() => N.minigames.active === 'match')) { await sleep(3500); await shot('sa4_lb_match'); await sleep(6000); await shot('sa4_lb_match2'); return; } await sleep(300); } })();
  // the final is a full 3-over match in the 3D match engine: a faster sim and a long timeout for loaded machines
  await ev(() => { N.story.debug.mgTimeScale = 10; });
  await finish('six_balls', { timeout: 900000 });
  watching = false; await watcher;
  const games = await ev((n) => window.__mg.slice(n), mg0);
  const match = games.find((g) => g.id === 'match');
  check(!!match, 'the LB Stadium final is played with the match engine (minigame "match")', games);
  check(match && match.lb, 'N.flags.lb_match on for the match day (crowds, floodlights)', match);
  const v = await ev(() => ({ done: N.missions.isDone('six_balls'), badge: N.flags.ayesha_camp_badge, played: N.flags.lb_match_played, unlocked: N.flags.lb_match_unlocked, lb: N.flags.lb_match, money: N.player.money, nets: N.npcs.scheduleOn('ayesha_nets'), mg: N.minigames.stats && N.minigames.stats.match }));
  check(v.done, 'SA4 six_balls passed');
  check(v.played, 'the LB Stadium match was played (N.flags.lb_match_played from cricket_match.js)', v);
  check(v.badge && v.unlocked, "Ayesha's camp badge + exhibition unlocked", v);
  check(!v.lb, 'match-day dressing flag cleared after the mission');
  check(v.money >= money0 + 2000, 'SA4 reward ₹20', { money0, now: v.money });
  check(v.nets, 'Ayesha now appears in the LB nets at dawn (schedule ayesha_nets on)');
  // exhibition: replayable from the coach at lb_stadium
  await ev(() => N.debug.setTime(16, 0));
  await sleep(700);
  const mg1 = await ev(() => window.__mg.length);
  check(await startFromGiver('lb_exhibition'), 'exhibition match giver (the coach) at lb_stadium');
  await finish('lb_exhibition', { timeout: 900000 });
  await ev(() => { N.story.debug.mgTimeScale = null; });
  const ex = (await ev((n) => window.__mg.slice(n), mg1)).find((g) => g.id === 'match');
  check(ex && ex.lb, 'exhibition: the match engine runs with N.flags.lb_match on', ex);
  // step away and back: the coach offers another one
  await ev(() => { const P = N.places.lb_stadium; N.player.teleport(P.x + 200, P.y + 150); });
  await sleep(900);
  const again = await ev(() => !N.missions.isDone('lb_exhibition') && (N.missions.markers() || []).some((x) => x.id === 'lb_exhibition'));
  check(again, 'the exhibition match is replayable (giver back after MISSION PASSED)');
  await shot('sa4_after');
}

async function sa3() {
  phase = 'sa3';
  console.log('\n== SA3 sunday_mutton');
  await ev(() => { N.debug.skipDialogue(true); N.story.debug.fastRides = true; N.story.debug.mg = 'win'; for (const id of ['bo_kaata', 'lost_and_found']) N.missions.done.add(id); N.flags.prologue_seen = true; N.calendar.set(2003, 2, 16, 7, 20); });
  check(await startFromGiver('sunday_mutton'), 'SA3 starts from Nanna at the meat shop on a Sunday morning');
  let spilled = false, cut = 0;
  const r0 = await autopilot('sunday_mutton', { timeout: 120000, hook: async (s) => {
    if (!spilled && s.st.cargo != null) { spilled = true; await ev(() => { for (let i = 0; i < 9; i++) N.emit('bump', { a: N.player, b: null, speed: 75, x: N.player.x, y: N.player.y }); }); await sleep(300); return true; }
    return false;
  } });
  cut = r0.lineMein || 0;
  check(r0.failed, 'dropping the parcel (light cargo) fails SA3');
  check(cut >= 1, 'queue: a cutter tried it and "Line mein!" (real E) pushed him back, ' + cut + ' time(s)');
  check(await retryFromCard('sunday_mutton'), 'SA3 retry from the parcel checkpoint');
  const money0 = await ev(() => N.player.money);
  await finish('sunday_mutton');
  const v = await ev(() => ({ done: N.missions.isDone('sunday_mutton'), runs: N.flags.sa3_runs, money: N.player.money, inv: Array.from(N.player.inventory) }));
  check(v.runs === 1, 'SA3 passed (sa3_runs = 1)', v.runs);
  check(v.money >= money0 + 500, 'SA3 reward ₹5', { money0, now: v.money });
  check(v.inv.indexOf('balm') >= 0, "Ammamma's balm picked up");
  check(!v.done, 'SA3 repeats on the next Sunday (not locked as done)');
}

async function sa2() {
  phase = 'sa2';
  console.log('\n== SA2 current_poyindi');
  await ev(() => { N.debug.skipDialogue(true); N.story.debug.fastRides = true; N.story.debug.mg = 'win'; for (const id of ['bo_kaata', 'lost_and_found', 'first_day_first_show', 'last_man_batting']) N.missions.done.add(id); N.flags.prologue_seen = true; N.flags.force_power_cut = true; N.calendar.set(2003, 4, 10, 19, 5); });
  await ev(() => { const P = N.places.kirana_1; N.player.teleport(P.x + 60, P.y + 40); });
  await waitFor(() => N.flags.power_cut === true, null, 4000, 'the evening power cut');
  await sleep(500);
  check(await ev(() => N.story.debug.state().dark), 'colony goes dark (darkness overlay) during the power cut');
  await shot('sa2_dark');
  check(await startFromGiver('current_poyindi'), 'SA2 starts at the kirana');
  let forced = false;
  const r0 = await autopilot('current_poyindi', { timeout: 120000, hook: async (s) => {
    if (!forced && /candle to five terraces/.test(s.obj || '')) { forced = true; await sleep(600); await shot('sa2_candles'); await ev(() => { const r = N.missions.active; if (r && r.timer) r.timer.left = 0.3; }); return true; }
    return false;
  } });
  check(r0.failed, 'the 90 s candle round runs out -> SA2 fails');
  check(await retryFromCard('current_poyindi'), 'SA2 retry from the candles checkpoint');
  const money0 = await ev(() => N.player.money);
  await finish('current_poyindi');
  const v = await ev(() => ({ runs: N.flags.sa2_runs, money: N.player.money, toffee: N.player.inventory.has('toffee'), pc: N.flags.power_cut, dark: N.story.debug.state().dark }));
  check(v.runs === 1 && v.toffee, 'SA2 passed: ₹5 and a toffee', v);
  check(v.money >= money0 + 500, 'SA2 reward ₹5');
  check(!v.pc && !v.dark, 'current came back: power_cut off, no darkness', v);
  await ev(() => { N.flags.force_power_cut = false; });
}

async function sa1() {
  phase = 'sa1';
  console.log('\n== SA1 pandal_duty');
  await ev(() => { N.debug.skipDialogue(true); N.story.debug.fastRides = true; N.story.debug.mg = 'win'; for (const id of ['bo_kaata', 'lost_and_found', 'first_day_first_show', 'last_man_batting', 'right_right', 'ammammas_thursday']) N.missions.done.add(id); N.flags.prologue_seen = true; N.calendar.set(2003, 9, 1, 21, 5); });
  check(await startFromGiver('pandal_duty'), 'SA1 night 1 starts from Bunty (Committee President) at the colony ground');
  let forced = false;
  const r0 = await autopilot('pandal_duty', { timeout: 120000, hook: async (s) => {
    if (!forced && /Chanda round/.test(s.obj || '')) { forced = true; await ev(() => { const r = N.missions.active; if (r && r.timer) r.timer.left = 0.3; }); return true; }
    return false;
  } });
  check(r0.failed, 'the chanda round runs out of time -> SA1 night 1 fails');
  check(await retryFromCard('pandal_duty'), 'SA1 retry');
  // the chanda round: walk to each donor and press E (the autopilot does the walking)
  const chanda = async (s) => {
    if (!/Chanda round/.test(s.obj || '')) return false;
    const pts = await ev(() => ['kirana_1', 'pindi_girni_1', 'irani_cafe_7', 'medical_shop_8', 'friend_home'].map((id) => N.places[id]).filter(Boolean).map((p) => ({ x: p.x, y: p.y })));
    for (const p of pts) { await goTo(p); await pressKey('KeyE'); await sleep(250); }
    return true;
  };
  await finish('pandal_duty', { hook: chanda });
  let v = await ev(() => ({ nights: N.flags.pandal_nights, done: N.missions.isDone('pandal_duty') }));
  check(v.nights === 1 && !v.done, 'night 1 done; the next night is still to come', v);
  // nights 2 to 4: the night watch (torch cone, tag raiders with a real E)
  // the bot runs to the raider nearest the laddu (teleport) and tags him with a real E ("Tag!")
  const tagger = async (s) => {
    if (!s.st.tag) return false;
    const lab = await ev(() => {
      const W = N.story.debug.tag(); if (!W) return null;
      const L = N.places.playground_1;
      const live = W.raiders.filter((r) => r.alive && !r.tagged).sort((a, b) => Math.hypot(a.x - L.x, a.y - L.y) - Math.hypot(b.x - L.x, b.y - L.y));
      const e = live[0]; if (!e) return null;
      N.player.teleport(e.x + 5, e.y);
      return 'go';
    });
    if (lab) {
      await sleep(90);
      if (await ev(() => N.input.actionLabel === 'Tag!')) { await pressKey('KeyE'); tags++; }
    } else await sleep(150);
    return true;
  };
  let tags = 0;
  for (let night = 2; night <= 4; night++) {
    await ev((n) => { N.calendar.set(2003, 9, n, 21, 5); }, night);
    await sleep(700);
    check(await startFromGiver('pandal_duty'), 'SA1 night ' + night + ' starts');
    if (night === 2) {
      // fail the first watch: a raider reaches the laddu
      const rf = await autopilot('pandal_duty', { timeout: 90000, hook: async (s) => {
        if (s.st.tag) { await sleep(2500); await shot('sa1_watch'); await ev(() => { const W = N.story.debug.tag(); const e = W.raiders.find((r) => r.alive); const L = N.places.playground_1; if (e) { e.x = L.x + 2; e.y = L.y + 2; } }); await sleep(600); return true; }
        return false;
      } });
      check(rf.failed, 'a raider reaching the laddu fails the night');
      check(await retryFromCard('pandal_duty'), 'night 2 retry from the watch checkpoint');
    }
    const r = await finish('pandal_duty', { hook: tagger, timeout: 150000 });
    void r;
    const nn = await ev(() => N.flags.pandal_nights);
    check(nn === night, 'night ' + night + ' passed (pandal_nights = ' + nn + ')');
  }
  check(tags >= 3, 'raiders tagged with real E presses (' + tags + ')');
  v = await ev(() => ({ nights: N.flags.pandal_nights, done: N.missions.isDone('pandal_duty'), tiger: N.flags.tiger_helps_lorry }));
  check(v.nights === 4 && v.done && v.tiger, 'four nights done: Tiger\'s gang will help push the lorry (M10 cameo)', v);
}

/* ------------------------------------------------------------------ main */
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  page = await context.newPage();
  errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  ok('booted in ' + (Date.now() - t0) + ' ms');
  await ev(() => {
    window.__passes = {}; window.__wm = 0;
    N.on('mission:pass', (d) => { const k = d && d.id; if (k) window.__passes[k] = (window.__passes[k] || 0) + 1; });
    window.__fails = [];
    N.on('mission:fail', (d) => { window.__fails.push({ id: d && d.id, reason: d && d.reason, at: N.calendar.osd() }); });
    N.on('walkman:play', () => { window.__wm++; });
    window.__mg = [];
    N.on('minigame:start', (d) => { window.__mg.push({ id: d && d.id, lb: !!N.flags.lb_match, mission: N.missions.active && N.missions.active.id, home: d && d.params && (d.params.home && (d.params.home.name || d.params.home)), auto: d && d.params && d.params.autoplay, ts: d && d.params && d.params.timeScale, side: !!(d && d.params && d.params.side) }); });
    window.__mgEnd = [];
    N.on('minigame:end', (d) => { const r = (d && d.result) || {}; window.__mgEnd.push({ id: d && d.id, win: r.win, quit: r.quit, aborted: r.aborted, time: r.time, at: N.calendar.osd() }); });
  });
  const phases = [['prologue', prologue], ['m1', m1], ['m2', m2], ['m3', m3], ['m4', m4], ['m5', m5], ['m6', m6], ['sa4', sa4], ['sa3', sa3], ['sa2', sa2], ['sa1', sa1]];
  let started = false;
  for (const [name, fn] of phases) {
    if (!want(name)) continue;
    if (!started && name !== 'prologue') { await ev(() => { N.menus.quickStart = true; N.debug.newGame(); }); }
    started = true;
    const tp = Date.now();
    try { await fn(); } catch (e) { phase = name; fail('exception: ' + (e.stack || e.message)); }
    console.log('  (' + name + ' ' + ((Date.now() - tp) / 1000).toFixed(1) + ' s)');
    const errs = await ev(() => N.debug.state().errors);
    if (errs.length) fail(name + ': N.err ' + errs.slice(0, 5).join(' | '));
    if (errors.length) { fail(name + ': ' + errors.length + ' console/page error(s):\n    ' + errors.slice(0, 6).join('\n    ')); errors.length = 0; }
  }
  await shot('final');
  await browser.close();
  console.log('\nScreenshots: ' + OUT + '/story1_*.png');
  if (failures.length) { console.log('\nSTORY PART 1 FAILED (' + failures.length + '):\n' + failures.join('\n')); process.exit(1); }
  console.log('\nSTORY PART 1 PASSED');
})();
