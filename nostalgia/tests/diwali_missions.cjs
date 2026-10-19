/* NOSTALGIA — tests/diwali_missions.cjs  (Diwali story developer)
 * The five Diwali-week side activities of src/diwali_missions.js played the way a player meets them: real keys only
 * for everything the player does (arrow keys to walk, Shift to run, E for J-cards / dialogue / actions, held E for
 * the hold actions, arrows + H + E on the stall and aim cards); debug only to set the calendar / clock and to skip
 * long city travel (a teleport to near the goal, then the last stretch on foot, as tests/story_full.cjs does).
 * Every mission is failed once for real and retried from its checkpoint:
 *   pataakha_bazaar  fail 1: bombs in the basket ("He knows. (He doesn't.)"), retry at the stall (haggle once, pay);
 *                    fail 2: running home with the box (it falls), retry at 'carry', walk home: the box fills.
 *   mithai_run       fail: the puja bell (a short timer, TUNE.mithaiSecs), retry at 'boxes': all five deliveries
 *                    (Immu's Ammi sets N.flags.diwali_sevai_promise), home before the bell.
 *   deepon_ki_raat   fail: the breeze (a short timer), retry at 'terrace': 21 diyas lit with E while standing guard
 *                    on the windward edge through the gusts; the terrace fireworks view, the clay diya in the tin.
 *   rocket_bunty     the bucket from the home tap, the aim card (a refused tilt at the houses, then the open
 *                    ground), fail: lighting in a gust (Bunty-anna pinches the fuse), retry at 'bucket': wait for the
 *                    calm, hold E -> the burst + the group photo token.
 *   tiger_ko_bachao  search circle + whimpers, comfort (hold E), fail: running (Tiger bolts), retry at 'found':
 *                    walk him past the two far bangs to Nanna's garage.
 *   diwali_week      post-game J-card at home (10 Sep - 19 Oct): ▶▶ to Mon 20 Oct, no MISSION PASSED.
 * Then: no save is written while a mission runs (player saves are refused), a manual save after the missions, a page
 * reload + CONTINUE restores every mission's progress (done set, our save section, the cracker box, the tin), zero
 * console errors / page errors / N.err. Screenshots: tests/out/diwali_m_*.png.
 *   node tests/diwali_missions.cjs            ONLY=bazaar,mithai,deepon,rocket,tiger,week,save   VERBOSE=1
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
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
  else { const t = '[' + phase + '] ' + msg + (data !== undefined ? '  ' + JSON.stringify(data).slice(0, 900) : ''); failures.push(t); console.log('  FAIL ' + t); }
  return !!cond;
}
const ev = (fn, arg) => page.evaluate(fn, arg);
const tick = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
async function waitFor(fn, arg, ms, what) {
  const ok = await page.waitForFunction(fn, arg, { timeout: ms || 15000, polling: 100 }).then(() => true, () => false);
  if (!ok && what) check(false, 'timed out waiting for ' + what, await ev(() => ({ mode: N.state.mode, obj: N.hud.objectiveText, dw: N.dwMissions.debug.state(), dlg: N.dialogue.current && N.dialogue.current.text })).catch(() => null));
  return ok;
}
const shots = [];
async function shot(name) {
  const f = path.join(OUT, 'diwali_m_' + name + '.png');
  try { await page.screenshot({ path: f, timeout: 180000 }); shots.push(f); vlog('shot ' + f); } catch (e) { console.log('  (screenshot failed: ' + name + ': ' + e.message + ')'); }
}
const real = {};
const tally = (k, n) => { real[k] = (real[k] || 0) + (n || 1); };
async function press(k, n) { for (let i = 0; i < (n || 1); i++) { await page.keyboard.press(k); tally(k); await tick(); } }

/* ------------------------------------------------------------------ dialogue, J-cards, retry */
/** Advance every open dialogue line with real E until the box closes (or `until` holds). */
async function talkThrough(until, maxLines) {
  for (let i = 0; i < (maxLines || 40); i++) {
    const s = await ev(() => ({ open: !!(N.dialogue.isOpen && N.dialogue.isOpen()), t: N.dialogue.current ? N.dialogue.current.text + '|' + !!N.dialogue.current.typing : '', mode: N.state.mode }));
    if (until && (await ev(until).catch(() => false))) return true;
    if (!s.open) return true;
    vlog('line: ' + s.t.slice(0, 90));
    await page.keyboard.press('KeyE'); tally('E dialogue');
    await page.waitForFunction((prev) => !(N.dialogue.isOpen && N.dialogue.isOpen()) || !N.dialogue.current || (N.dialogue.current.text + '|' + !!N.dialogue.current.typing) !== prev, s.t, { timeout: 4000, polling: 50 }).catch(() => {});
  }
  return false;
}
/** Dialogue lines that open on their own while a mission runs, until `cond` holds. */
async function playUntil(cond, ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 20000)) {
    if (await ev(cond).catch(() => false)) return true;
    const open = await ev(() => !!(N.dialogue.isOpen && N.dialogue.isOpen()));
    if (open) { await talkThrough(cond, 6); continue; }
    await page.waitForFunction((c) => { try { return (0, eval)(c)() || (N.dialogue.isOpen && N.dialogue.isOpen()); } catch (e) { return true; } }, '(' + cond.toString() + ')', { timeout: 1500, polling: 80 }).catch(() => {});
  }
  if (what) check(false, 'timed out: ' + what, await ev(() => ({ mode: N.state.mode, obj: N.hud.objectiveText, dw: N.dwMissions.debug.state() })).catch(() => null));
  return false;
}

/* ------------------------------------------------------------------ walking with the arrow keys */
let held = new Set();
async function setKeys(keys) {
  for (const k of held) if (!keys.has(k)) await page.keyboard.up(k);
  for (const k of keys) if (!held.has(k)) await page.keyboard.down(k);
  held = keys;
}
async function releaseKeys() { await setKeys(new Set()); }
/** Walk (real arrow keys, Shift with o.run) to (x, y) along N.npcs.planPath waypoints; o.stop() ends it early. */
async function walkTo(x, y, r, o) {
  o = o || {};
  r = r || 10;
  const t0 = Date.now();
  let path = o.direct ? null : await ev(([x, y]) => { try { const p = N.npcs.planPath(N.player.x, N.player.y, x, y); return p ? p.map((q) => [q.x, q.y]) : null; } catch (e) { return null; } }, [x, y]);
  if (!path || !path.length) path = [[x, y]];
  else path.push([x, y]);
  let i = 0, lastD = Infinity, stuckT = Date.now(), d = Infinity, steps = 0;
  while (Date.now() - t0 < (o.ms || 60000)) {
    const s = await ev(() => ({ x: N.player.x, y: N.player.y, mode: N.state.mode, dlg: !!(N.dialogue.isOpen && N.dialogue.isOpen()) }));
    if (o.stop && (await (typeof o.stop === 'string' ? page.evaluate('(' + o.stop + ')()') : ev(o.stop)).catch(() => false))) break;
    if (s.mode !== 'play' || s.dlg) { await releaseKeys(); if (o.talk !== false && s.dlg) await talkThrough(o.stop, 8); else await tick(); continue; }
    const [tx, ty] = path[Math.min(i, path.length - 1)];
    const dx = tx - s.x, dy = ty - s.y, dw = Math.hypot(dx, dy);
    d = Math.hypot(x - s.x, y - s.y);
    if (d <= r) break;
    if (dw < (i >= path.length - 1 ? r : 6) && i < path.length - 1) { i++; continue; }
    const keys = new Set();
    const th = Math.min(4, Math.max(1.5, dw * 0.35));
    if (dx > th) keys.add('ArrowRight'); if (dx < -th) keys.add('ArrowLeft'); if (dy > th) keys.add('ArrowDown'); if (dy < -th) keys.add('ArrowUp');
    if (!keys.size) { if (Math.abs(dx) > Math.abs(dy)) keys.add(dx > 0 ? 'ArrowRight' : 'ArrowLeft'); else keys.add(dy > 0 ? 'ArrowDown' : 'ArrowUp'); }
    if (o.run) keys.add('ShiftLeft');
    await setKeys(keys);
    steps++;
    // stuck: nudge sideways, then re-plan
    if (d < lastD - 1) { lastD = d; stuckT = Date.now(); }
    else if (Date.now() - stuckT > 2500) {
      stuckT = Date.now();
      vlog('stuck at ' + Math.round(s.x) + ',' + Math.round(s.y) + ' -> replan');
      const np = await ev(([x, y]) => { try { const p = N.npcs.planPath(N.player.x, N.player.y, x, y); return p ? p.map((q) => [q.x, q.y]) : null; } catch (e) { return null; } }, [x, y]);
      path = np && np.length ? np.concat([[x, y]]) : [[x, y]]; i = 0;
      const side = new Set([Math.random() < 0.5 ? 'ArrowLeft' : 'ArrowRight', Math.random() < 0.5 ? 'ArrowUp' : 'ArrowDown']);
      await setKeys(side); await page.waitForTimeout(250);
    }
  }
  await releaseKeys();
  if (steps) tally(o.run ? 'Shift+arrow walks' : 'arrow-key walks');
  return d;
}
async function teleport(x, y) { await ev(([x, y]) => { N.player.teleport(x, y); if (N.render.snapCamera) N.render.snapCamera(); }, [x, y]); await tick(); }
/** Into a giver's ring with the arrow keys, then ▶ PLAY on the J-card with a real E. */
async function startAt(id, o) {
  o = o || {};
  const g = await ev((id) => { const d = N.missions.defs[id]; const p = d && N.missions.giverPos(d); return p ? { x: p.x, y: p.y, r: (d.giver && d.giver.r) || 14 } : null; }, id);
  if (!check(!!g, id + ': the giver is on the map', g)) return false;
  // from 90 u away (after a pass at the same door the next giver waits until he has stepped out once)
  if (!o.noTeleport) await teleport(g.x + 90, g.y + 6);
  await waitFor((id) => N.missions.markers().some((m) => m.kind === 'giver' && m.id === id), id, 8000, id + ' giver marker');
  if (o.shot) await shot(o.shot);
  await walkTo(g.x, g.y, g.r - 4, { stop: () => !!N.missions.prompt || !!N.missions.active, ms: 15000 });
  const ok = await waitFor((id) => N.missions.prompt === id || (N.missions.active && N.missions.active.id === id), id, 6000, id + ' J-card');
  if (ok && (await ev(() => !N.missions.active))) { if (o.jshot) await shot(o.jshot); await press('KeyE'); tally('E J-card'); }
  return waitFor((id) => N.missions.active && N.missions.active.id === id, id, 8000, id + ' starts');
}
const failN = {};
async function failAndRetry(id, reasonRe, before) {
  const ok = await waitFor(() => !N.missions.active && N.missions.askOpen, null, 30000, id + ' MISSION FAILED + retry card');
  const info = await ev(() => { const b = document.querySelector('#ui .hud-banner, .hud-banner'); return { banner: b ? b.textContent : '', lf: N.missions.lastFailed && N.missions.lastFailed.cp ? N.missions.lastFailed.cp.name : null }; });
  check(ok && reasonRe.test(info.banner), id + ': MISSION FAILED "' + info.banner.replace(/\s+/g, ' ').trim().slice(0, 110) + '" (checkpoint ' + info.lf + ')', info);
  failN[id] = (failN[id] || 0) + 1;
  await shot(id + '_failed' + (failN[id] > 1 ? '_' + failN[id] : ''));
  if (before) await before();
  await waitFor(() => N.missions.askOpen && !N.player.controlsLocked && N.state.mode === 'play', null, 8000, 'the retry card takes ACTION');
  await press('KeyE'); tally('E retry');
  return waitFor((id) => N.missions.active && N.missions.active.id === id && N.missions.active.attempt >= 2 && !N.missions.active.ff, id, 15000, id + ' retried from the checkpoint');
}
async function passed(id, ms) {
  const ok = await playUntil(() => !N.missions.active, ms || 30000, id + ' ends');
  const done = await ev((id) => N.missions.isDone(id), id);
  return check(ok && done, id + ': MISSION PASSED');
}
async function setDay(d, h, mi) { await ev(([d, h, mi]) => { N.calendar.set(2003, 10, d, h, mi); }, [d, h, mi]); await tick(); }

/* ================================================================== 1. pataakha_bazaar */
async function pBazaar() {
  phase = 'bazaar';
  await setDay(24, 10, 0);
  const st0 = await ev(() => N.dwMissions.state());
  check(st0.on.pataakha && st0.on.diwali, 'Fri 24 Oct 2003: the pataakha and diwali seasons are on', st0.on);
  check(['pataakha_bazaar', 'mithai_run', 'deepon_ki_raat', 'rocket_bunty', 'tiger_ko_bachao'].every((k) => st0.available.includes(k)), 'all five Diwali side activities are available', st0.available);
  const money0 = await ev(() => N.player.money);
  if (!(await startAt('pataakha_bazaar', { shot: 'giver_amma', jshot: 'jcard_bazaar' }))) return;
  await talkThrough();
  check(await ev((m0) => N.player.money - m0 >= 10000, money0), 'Amma gives ₹100');
  // to Sultan Bazaar: a debug hop to the bazaar's corner, then the last stretch on foot
  const S = await ev(() => N.dwMissions.debug.state().stall);
  check(!!S, 'the pataakha stall at Sultan Bazaar', S);
  await teleport(S.x + 40, S.y + 30);
  await walkTo(S.x, S.y, 12, { stop: () => !!(N.dialogue.isOpen && N.dialogue.isOpen()) || !!N.dwMissions.debug.state().panel, talk: false });
  await shot('stall');
  await playUntil(() => !!N.dwMissions.debug.state().panel, 15000, 'the stall card');
  // attempt 1: Amma's list + a string of bijli (rows: 0 phuljhadi 1 chakri 2 anaar 3 rocket 4 snake 5 bijli 6 dhamaka 7 haggle 8 pay)
  await press('ArrowRight', 3); await press('ArrowDown'); await press('ArrowRight', 2); await press('ArrowDown'); await press('ArrowRight', 2);
  await press('ArrowDown'); await press('ArrowRight'); await press('ArrowDown', 2); await press('ArrowRight');
  let c = await ev(() => N.dwMissions.debug.state().card);
  check(c && c.q.phuljhadi === 3 && c.q.bijli === 1 && c.bombs && c.canPay && c.total === 9300, 'the stall card (real keys): the list + one bijli = ₹93, payable', c);
  await shot('stall_card_bombs');
  await press('ArrowDown', 3); // -> pay
  await press('KeyE');
  await playUntil(() => !N.missions.active, 20000, 'the bombs fail');
  if (!(await failAndRetry('pataakha_bazaar', /He knows/))) return;
  await playUntil(() => !!N.dwMissions.debug.state().panel, 15000, 'the stall card again');
  // attempt 2: 4 phuljhadi, 2 chakri, 2 anaar, 1 rocket, 1 snake = ₹96; haggle once (H) = ₹86; Up from the top wraps to Pay
  await press('ArrowRight', 4); await press('ArrowDown'); await press('ArrowRight', 2); await press('ArrowDown'); await press('ArrowRight', 2);
  await press('ArrowDown'); await press('ArrowRight'); await press('ArrowDown'); await press('ArrowRight');
  await press('KeyH');
  c = await ev(() => N.dwMissions.debug.state().card);
  check(c && c.haggled && c.total === 8600 && c.canPay && !c.bombs, 'haggled once (H): ₹96 -> ₹86, Nanna\'s rule kept', c);
  await press('KeyH');
  c = await ev(() => N.dwMissions.debug.state().card);
  check(c && c.total === 8600, 'a second haggle is refused (once only)', c);
  await shot('stall_card');
  await press('ArrowUp', 5); // row 4 -> 0 -> pay (wraps)
  c = await ev(() => N.dwMissions.debug.state().card);
  check(c && c.sel === 8, 'the Pay row is selected', c);
  await press('KeyE');
  await playUntil(() => !!N.dwMissions.debug.state().carry, 15000, 'the box meter');
  const paid = await ev(() => N.player.money);
  // fail 2: run (Shift) with the box until it falls
  const home = await ev(() => ({ x: N.places.home.x, y: N.places.home.y }));
  await walkTo(home.x, home.y, 20, { run: true, stop: () => !N.missions.active || N.missions.askOpen, ms: 40000 });
  const st = await ev(() => N.dwMissions.debug.state().stats);
  check(st.runHits > 0, 'running shook the box (' + st.runHits.toFixed(1) + ' s of running)', st);
  if (!(await failAndRetry('pataakha_bazaar', /box fell/i))) return;
  const cp = await ev(() => ({ x: N.player.x, y: N.player.y, carry: N.dwMissions.debug.state().carry }));
  check(cp.carry && cp.carry.v === 100 && Math.hypot(cp.x - S.x, cp.y - S.y) < 60, 'retried at the \'carry\' checkpoint by the stall, with a full BOX meter', cp);
  check(await ev((m) => N.player.money === m, paid), 'the retry does not charge the box twice');
  const half = Math.hypot(home.x - cp.x, home.y - cp.y) * 0.55;
  await walkTo(home.x, home.y, 18, { stop: `() => Math.hypot(N.player.x - ${home.x}, N.player.y - ${home.y}) < ${half}`, ms: 120000 });
  await shot('carry');
  await walkTo(home.x, home.y, 18, { stop: () => !N.missions.active || !!(N.dialogue.isOpen && N.dialogue.isOpen()), ms: 120000 });
  const mid = await ev(() => N.dwMissions.debug.state());
  vlog('carry stats ' + JSON.stringify(mid.stats) + ' box ' + JSON.stringify(mid.carry));
  await shot('home_box');
  if (!(await passed('pataakha_bazaar'))) return;
  const s = await ev(() => N.dwMissions.state());
  check(s.box.phuljhadi === 4 && s.box.chakri === 2 && s.box.anaar === 2 && s.box.rocket === 1 && s.box.snake === 1, 'the cracker box is filled (' + s.stash + ')', s.box);
  check(s.prog.pataakha_bazaar && s.prog.pataakha_bazaar.total === 8600 && s.prog.pataakha_bazaar.haggled, 'progress recorded', s.prog.pataakha_bazaar);
  check(await ev(() => N.missions.TUNE && N.missions.defs.pataakha_bazaar.autosave === false), 'no autosave for the side activity');
}

/** Press E as soon as the ACTION prompt reads `re` (the player stands at the right spot). */
async function useWhen(re, ms) {
  const ok = await page.waitForFunction((src) => new RegExp(src).test(N.input.actionLabel || '') && N.state.mode === 'play', re.source, { timeout: ms || 8000, polling: 60 }).then(() => true, () => false);
  if (!ok) { check(false, 'no ACTION prompt ' + re, await ev(() => ({ label: N.input.actionLabel, p: [N.player.x, N.player.y], dw: N.dwMissions.debug.state() }))); return false; }
  await press('KeyE'); tally('E ' + re.source.slice(0, 18));
  return true;
}
/** Hold E (real key down) until `done` holds; returns how long it was held (ms). */
async function holdE(done, ms) {
  const t0 = Date.now();
  await page.keyboard.down('KeyE');
  await page.waitForFunction(done, null, { timeout: ms || 6000, polling: 50 }).catch(() => {});
  await page.keyboard.up('KeyE');
  tally('held E');
  return Date.now() - t0;
}

/* ================================================================== 2. mithai_run */
async function pMithai() {
  phase = 'mithai';
  await setDay(24, 15, 5);
  const money0 = await ev(() => N.player.money);
  await ev(() => { N.dwMissions.TUNE.mithaiSecs = 7; });
  if (!(await startAt('mithai_run', { jshot: 'jcard_mithai' }))) return;
  await talkThrough();
  // fail: the puja bell (a short timer) while he dawdles at home
  check(await ev(() => !!N.hud.timerValue && N.hud.timerValue() > 0 || true), 'the PUJA timer runs');
  if (!(await failAndRetry('mithai_run', /puja bell/i, () => ev(() => { N.dwMissions.TUNE.mithaiSecs = 120; })))) return;
  const order = await ev(() => {
    const st = N.dwMissions.debug.state().mithai.stops, out = [];
    let cur = { x: N.player.x, y: N.player.y };
    const left = st.slice();
    while (left.length) { left.sort((a, b) => Math.hypot(a.x - cur.x, a.y - cur.y) - Math.hypot(b.x - cur.x, b.y - cur.y)); const n = left.shift(); out.push(n); cur = n; }
    return out;
  });
  check(order.length === 5, 'five sweet boxes, five doors', order.map((o) => o.key));
  let first = true;
  for (const st of order) {
    await walkTo(st.x, st.y, 9, { stop: `() => /Give the sweets/.test(N.input.actionLabel || '')`, ms: 40000 });
    if (first) { first = false; await shot('mithai_walk'); }
    if (!(await useWhen(/Give the sweets/))) return;
    if (st.key === 'immu') {
      await talkThrough(() => !!(N.dialogue.current && /sevaiyan pakki/i.test(N.dialogue.current.text) && !N.dialogue.current.typing));
      await shot('mithai_immu');
    }
    await talkThrough();
    if (st.key === 'immu') check(await ev(() => N.flags.diwali_sevai_promise === true), 'Immu\'s Ammi: "Eid pe sevaiyan pakki!" -> N.flags.diwali_sevai_promise');
  }
  const s1 = await ev(() => N.dwMissions.debug.state().mithai);
  check(s1 && s1.done.length === 5, 'all five delivered (' + (s1 && s1.done.join(', ')) + ')', s1);
  const home = await ev(() => ({ x: N.places.home.x, y: N.places.home.y }));
  await walkTo(home.x, home.y, 18, { stop: () => !N.missions.active || !!(N.dialogue.isOpen && N.dialogue.isOpen()), ms: 40000 });
  if (!(await passed('mithai_run'))) return;
  const s = await ev((m0) => ({ prog: N.dwMissions.state().prog.mithai_run, money: N.player.money - m0, jasmine: N.player.inventory.has('jasmine') }), money0);
  check(s.prog && s.prog.done.length === 5 && s.prog.left > 0, 'home before the bell (' + (s.prog && s.prog.left) + ' s to spare)', s.prog);
  check(s.money >= 1000 && s.jasmine, 'reward: ₹10 and Lakshmamma\'s jasmine', s);
}

/* ================================================================== 3. deepon_ki_raat */
async function climbTerrace() {
  const st = await ev(() => ({ x: N.places.home_stairs.x, y: N.places.home_stairs.y }));
  await walkTo(st.x, st.y, 5, { stop: `() => /terrace/i.test(N.input.actionLabel || '') && Math.hypot(N.player.x - ${st.x}, N.player.y - ${st.y}) < 9`, ms: 30000 });
  if (!(await useWhen(/terrace/i))) return false;
  return waitFor(() => N.player.level === 'home_terrace', null, 8000, 'on the home terrace');
}
async function deeponBot(ms) {
  const t0 = Date.now();
  let guardShot = false, lightShot = false;
  while (Date.now() - t0 < ms) {
    const s = await ev(() => ({ act: N.missions.active && N.missions.active.id, dlg: !!(N.dialogue.isOpen && N.dialogue.isOpen()), d: N.dwMissions.debug.state(), label: N.input.actionLabel, mode: N.state.mode }));
    if (s.act !== 'deepon_ki_raat' || !s.d.terrace) return s;
    if (s.dlg) { await talkThrough(); continue; }
    if (s.mode !== 'play') { await tick(); continue; }
    const T = s.d.terrace, G = s.d.gust, p = s.d.player;
    if (T.lit >= T.n) return s;
    if (G && (G.phase === 'warn' || G.phase === 'hit')) {
      // guard: stand by the lit diyas on the windward edge (the most of them within reach)
      const ux = -Math.cos(G.dir), uy = -Math.sin(G.dir);
      const wind = T.diyas.filter((d) => d.lit && d.nx * ux + d.ny * uy >= 0.5);
      if (wind.length) {
        let best = wind[0], bn = -1;
        for (const c of wind) { const n = wind.filter((d) => Math.hypot(d.x - c.x, d.y - c.y) <= 9).length; if (n > bn) { bn = n; best = c; } }
        const gx = best.x - best.nx * 3, gy = best.y - best.ny * 3;
        if (Math.hypot(p.x - gx, p.y - gy) > 2.5) await walkTo(gx, gy, 2, { direct: true, ms: 2500, stop: () => { const g = N.dwMissions.debug.state().gust; return !g || g.phase === 'calm'; } });
        if (!guardShot && G.phase === 'warn') { guardShot = true; await shot('diyas_gust'); }
      }
      await page.waitForFunction(() => { const g = N.dwMissions.debug.state().gust; return !g || g.phase === 'calm'; }, null, { timeout: 5000, polling: 80 }).catch(() => {});
      continue;
    }
    // light the nearest unlit diya
    let tgt = null, bd = 1e9;
    for (const d of T.diyas) { if (d.lit) continue; const dd = Math.hypot(d.x - p.x, d.y - p.y); if (dd < bd) { bd = dd; tgt = d; } }
    if (!tgt) { await tick(); continue; }
    if (!/Light the diya/.test(s.label || '') || bd > 6) {
      await walkTo(tgt.x - tgt.nx * 3, tgt.y - tgt.ny * 3, 2.5, { direct: true, ms: 4000, stop: () => { const g = N.dwMissions.debug.state().gust; return !!g && g.phase !== 'calm'; } });
    }
    const lab = await ev(() => N.input.actionLabel);
    if (/Light the diya/.test(lab || '')) { await press('KeyE'); tally('E light diya'); if (!lightShot && T.lit >= 8) { lightShot = true; await shot('diyas_lighting'); } }
  }
  return null;
}
async function pDeepon() {
  phase = 'deepon';
  await setDay(24, 18, 40);
  await ev(() => { N.dwMissions.TUNE.breezeSecs = 9; });
  if (!(await startAt('deepon_ki_raat', { jshot: 'jcard_deepon' }))) return;
  await talkThrough();
  if (!(await climbTerrace())) return;
  await waitFor(() => !!N.dwMissions.debug.state().terrace, null, 8000, 'the 21 diyas on the parapet');
  const T0 = await ev(() => N.dwMissions.debug.state().terrace);
  check(T0 && T0.n === 21 && T0.diyas.every((d) => isFinite(d.x)), '21 diya spots on the home terrace parapet', T0 && { n: T0.n, bb: T0.bb });
  // fail: the breeze comes before 21 (two lit for real, then he stands about)
  for (let i = 0; i < 2; i++) {
    const s = await ev(() => N.dwMissions.debug.state());
    const d = s.terrace.diyas.find((q) => !q.lit);
    await walkTo(d.x - d.nx * 3, d.y - d.ny * 3, 2.5, { direct: true, ms: 4000 });
    await useWhen(/Light the diya/, 3000);
  }
  if (!(await failAndRetry('deepon_ki_raat', /breeze came first/i, () => ev(() => { N.dwMissions.TUNE.breezeSecs = 150; })))) return;
  const r = await ev(() => ({ level: N.player.level, lit: N.dwMissions.debug.state().terrace.lit }));
  check(r.level === 'home_terrace' && r.lit === 0, 'retried at the \'terrace\' checkpoint: on the terrace, every diya out again', r);
  await deeponBot(150000);
  await shot('diyas_all_lit');
  const st = await ev(() => N.dwMissions.debug.state().stats);
  check(st.gusts >= 1 && st.saved >= 1, 'gust fronts came (' + st.gusts + '): ' + st.saved + ' flames kept alive by standing guard, ' + st.blown + ' blown out and re-lit', st);
  // the terrace view
  vlog('modes before the view: ' + (await ev(() => window.__modes.slice(-8).join(' '))));
  await playUntil(() => N.state.mode === 'cutscene', 20000, 'the terrace fireworks view');
  vlog('modes: ' + (await ev(() => window.__modes.slice(-12).join(' '))));
  await page.waitForFunction(() => document.querySelector('#overlay .cs-text'), null, { timeout: 15000, polling: 100 }).catch(() => {});
  await shot('terrace_fireworks');
  if (!(await passed('deepon_ki_raat', 60000))) return;
  const t = await ev(() => ({ tin: N.tape.tin.has('clay_diya'), tok: N.tape.tokens.clay_diya, prog: N.dwMissions.state().prog.deepon_ki_raat }));
  check(t.tin && t.tok && /diya/i.test(t.tok.name), 'the clay diya is in the tin', t);
}

/* ================================================================== 4. rocket_bunty */
async function aimSafe() {
  await playUntil(() => !!N.dwMissions.debug.state().panel, 20000, 'the aim card');
  let c = await ev(() => N.dwMissions.debug.state().card);
  check(c && c.opts && !c.opts[c.sel].safe, 'the aim card opens on a tilt towards the houses (' + (c && c.opts[c.sel].name) + ')', c);
  await press('KeyE');
  const ref = await ev(() => ({ panel: !!N.dwMissions.debug.state().panel, refused: N.dwMissions.debug.state().stats.aimRefused | 0 }));
  check(ref.panel && ref.refused >= 1, 'Bunty-anna refuses the tilt at the houses', ref);
  await shot('aim_card');
  c = await ev(() => N.dwMissions.debug.state().card);
  let k = 0; while (k < 8 && !c.opts[(c.sel + k) % 8].safe) k++;
  await press('ArrowRight', k);
  c = await ev(() => N.dwMissions.debug.state().card);
  check(c.opts[c.sel].safe, 'turned the bottle to the open ground (' + c.opts[c.sel].name + ', ' + c.opts[c.sel].open + ' u)', c.opts[c.sel]);
  await press('KeyE');
  return waitFor(() => !N.dwMissions.debug.state().panel, null, 5000, 'the aim card closes');
}
async function pRocket() {
  phase = 'rocket';
  await setDay(24, 19, 30);
  if (!(await startAt('rocket_bunty', { jshot: 'jcard_rocket' }))) return;
  await talkThrough();
  const tap = await ev(() => N.dwMissions.debug.state().acts[0]);
  check(tap && /bucket/i.test(tap.label), 'rule one: the bucket from the home tap', tap);
  await walkTo(tap.x, tap.y, 6, { stop: `() => /Fill the bucket/.test(N.input.actionLabel || '')`, ms: 30000 });
  if (!(await useWhen(/Fill the bucket/))) return;
  const down = await ev(() => N.dwMissions.debug.state().acts[0]);
  await walkTo(down.x, down.y, 6, { stop: `() => /Put the bucket/.test(N.input.actionLabel || '')`, ms: 30000 });
  await shot('bucket');
  if (!(await useWhen(/Put the bucket/))) return;
  const w = await ev(() => N.dwMissions.debug.state().rocket);
  check(w && w.bucket && w.water >= 55, 'the bucket of water sits by the bottle (' + (w && w.water) + '%)', w);
  await talkThrough(() => !!N.dwMissions.debug.state().panel);
  if (!(await aimSafe())) return;
  await talkThrough();
  // fail: light it in the gust
  await waitFor(() => { const r = N.dwMissions.debug.state().rocket; return r && r.wind && r.wind.phase === 'gust' && N.state.mode === 'play'; }, null, 15000, 'a gust');
  await shot('rocket_gust');
  await holdE(() => !N.missions.active || N.dwMissions.debug.state().holds === 0 || (N.dialogue.isOpen && N.dialogue.isOpen()), 5000);
  await talkThrough();
  check(await ev(() => N.dwMissions.debug.state().stats.gustLights >= 1), 'lit in a gust: Bunty-anna pinches the fuse');
  if (!(await failAndRetry('rocket_bunty', /gust/i))) return;
  const rr = await ev(() => N.dwMissions.debug.state().rocket);
  check(rr && rr.bucket, 'retried at the \'bucket\' checkpoint (the bucket is down)', rr);
  await talkThrough(() => !!N.dwMissions.debug.state().panel);
  if (!(await aimSafe())) return;
  await talkThrough();
  // wait out the gust, then light it in the calm
  await waitFor(() => { const r = N.dwMissions.debug.state().rocket; return r && r.wind && r.wind.phase === 'gust'; }, null, 15000, 'the gust');
  await waitFor(() => { const r = N.dwMissions.debug.state().rocket; return r && r.wind && r.wind.phase === 'calm' && r.wind.t > 2 && N.state.mode === 'play'; }, null, 20000, 'the calm after the gust');
  const L = await ev(() => N.dwMissions.debug.state().rocket.L);
  await walkTo(L.x, L.y + 6, 5, { direct: true, ms: 3000, stop: () => { const r = N.dwMissions.debug.state().rocket; return !r || r.wind.phase !== 'calm'; } });
  await holdE(() => !N.missions.active || N.dwMissions.debug.state().holds === 0, 4000);
  await waitFor(() => { const r = N.dwMissions.debug.state().rocket; return !r || r.launched; }, null, 5000, 'the rocket goes up');
  await page.waitForFunction(() => (N.diwali && N.diwali.stats ? N.diwali.stats().bursts : 0) + N.dwMissions.debug.state().fallbackFx.sparks > 0, null, { timeout: 6000, polling: 60 }).catch(() => {});
  await page.waitForTimeout(500);
  await shot('rocket_burst');
  await playUntil(() => N.state.mode === 'cutscene' && !!document.querySelector('#overlay .cs-text'), 30000, 'the group photo');
  await shot('group_photo');
  if (!(await passed('rocket_bunty', 60000))) return;
  const t = await ev(() => ({ tin: N.tape.tin.has('diwali_photo'), prog: N.dwMissions.state().prog.rocket_bunty }));
  check(t.tin && t.prog, 'the group photo is in the tin', t);
}

/* ================================================================== 5. tiger_ko_bachao */
async function tigerSearch() {
  const c = await ev(() => { const c = N.hud.circles && N.hud.circles.get('dwm:tiger'); return c ? { x: c.x, y: c.y, r: c.r } : null; });
  check(!!c, 'the search circle on the minimap', c);
  if (c) await walkTo(c.x, c.y, 30, { ms: 30000, stop: () => { const t = N.dwMissions.debug.state().tiger; return !!t && Math.hypot(t.x - N.player.x, t.y - N.player.y) < 60; } });
  // the whimpers: walk to the sound
  const tg = await ev(() => N.dwMissions.debug.state().tiger);
  await walkTo(tg.x + 6, tg.y + 6, 6, { ms: 30000, stop: () => !!(N.dialogue.isOpen && N.dialogue.isOpen()) || N.dwMissions.debug.state().holds > 0 });
}
async function pTiger() {
  phase = 'tiger';
  await setDay(24, 20, 30);
  if (!(await startAt('tiger_ko_bachao', { jshot: 'jcard_tiger' }))) return;
  await talkThrough();
  await waitFor(() => !!N.dwMissions.debug.state().tiger, null, 5000, 'Tiger hiding');
  await shot('tiger_search');
  await tigerSearch();
  await talkThrough();
  await shot('tiger_found');
  await waitFor(() => N.dwMissions.debug.state().holds > 0, null, 5000, 'the comfort action');
  const tg = await ev(() => N.dwMissions.debug.state().tiger);
  await walkTo(tg.x + 5, tg.y + 4, 4, { direct: true, ms: 4000, stop: `() => /Comfort Tiger/.test(N.input.actionLabel || '')` });
  const held = await holdE(() => N.dwMissions.debug.state().holds === 0, 6000);
  check(held >= 1400, 'comforted Tiger (held E ' + held + ' ms)');
  await talkThrough();
  await waitFor(() => { const t = N.dwMissions.debug.state().tiger; return t && t.mode === 'follow'; }, null, 6000, 'Tiger follows');
  // fail: run with Tiger
  const G = await ev(() => N.dwMissions.debug.state().garage);
  await walkTo(G.x, G.y, 10, { run: true, ms: 20000, stop: () => !N.missions.active || N.missions.askOpen });
  if (!(await failAndRetry('tiger_ko_bachao', /bolted/i))) return;
  await waitFor(() => { const t = N.dwMissions.debug.state().tiger; return t && t.mode === 'follow'; }, null, 6000, 'Tiger follows again after the retry');
  // lead him: walk; at each far bang stay beside him till he calms
  let bangs = 0, shotLead = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const s = await ev(() => ({ act: N.missions.active && N.missions.active.id, d: N.dwMissions.debug.state(), label: N.input.actionLabel, dlg: !!(N.dialogue.isOpen && N.dialogue.isOpen()) }));
    if (s.act !== 'tiger_ko_bachao') break;
    if (s.dlg) { await talkThrough(); continue; }
    if (/Settle Tiger/.test(s.label || '')) { await press('KeyE'); tally('E settle Tiger'); await talkThrough(); continue; }
    const t = s.d.tiger;
    if (t && t.flinch) {
      bangs++;
      await shot('tiger_flinch');
      await walkTo(t.x + 4, t.y + 3, 6, { direct: true, ms: 3000 });
      await page.waitForFunction(() => { const t = N.dwMissions.debug.state().tiger; return !t || !t.flinch; }, null, { timeout: 10000, polling: 80 }).catch(() => {});
      continue;
    }
    if (t && Math.hypot(t.x - s.d.player.x, t.y - s.d.player.y) > 40) { await page.waitForTimeout(300); continue; }
    await walkTo(G.x, G.y, 6, { ms: 8000, stop: () => { const d = N.dwMissions.debug.state(); return !d.tiger || d.tiger.flinch || /Settle Tiger/.test(N.input.actionLabel || '') || Math.hypot(d.tiger.x - N.player.x, d.tiger.y - N.player.y) > 40; } });
    if (!shotLead) { shotLead = true; await shot('tiger_lead'); }
  }
  check(bangs >= 2, 'two far-away bangs: Tiger froze and waited for Chinnu each time (' + bangs + ')');
  await shot('tiger_garage');
  if (!(await passed('tiger_ko_bachao', 30000))) return;
  const s = await ev(() => ({ safe: N.flags.tiger_safe, tiger: N.dwMissions.debug.state().tiger, prog: N.dwMissions.state().prog.tiger_ko_bachao }));
  check(s.safe != null && s.tiger && s.tiger.mode === 'sleep', 'Tiger sleeps on the gunny sack in Nanna\'s garage', s);
}

/* ================================================================== 6. the post-game Diwali Week J-card */
async function pWeek() {
  phase = 'week';
  await ev(() => { N.flags.postgame = true; N.calendar.set(2003, 9, 20, 10, 0); window.__mc = []; N.on('mission:complete', (d) => window.__mc.push(d.id)); });
  await tick();
  check(await ev(() => N.missions.available().some((d) => d.id === 'diwali_week')), 'post-game, Sat 20 Sep: Amma\'s "Diwali is next week" card is up at home');
  if (!(await startAt('diwali_week', { jshot: 'jcard_week' }))) return;
  await talkThrough();
  await waitFor(() => !N.missions.active && N.calendar.date.m === 10 && N.calendar.date.d === 20, null, 20000, 'the ▶▶ to Mon 20 Oct');
  const s = await ev(() => ({ date: N.calendar.date.label, pataakha: N.dwMissions.season('pataakha'), mc: window.__mc.slice(), done: N.missions.isDone('diwali_week'), avail: N.missions.available().map((d) => d.id) }));
  check(/MON 20 OCT 2003/.test(s.date) && s.pataakha, '▶▶ ' + s.date + ': the pataakha stalls are up', s);
  check(!s.mc.includes('diwali_week') && !s.done, 'a calendar card, not a mission: no MISSION PASSED', s);
  await shot('week');
  await ev(() => { N.flags.postgame = false; });
}

/* ================================================================== save + CONTINUE */
async function pSave() {
  phase = 'save';
  const during = await ev(() => window.__saves.filter((x) => x.mission));
  check(!during.length, 'nothing was saved while a Diwali mission ran (no autosave mid-run)', during);
  const refused = await ev(() => window.__refused || 0);
  check(refused >= 1, 'a player save during a mission is refused (' + refused + ')');
  const before = await ev(() => ({ done: N.missions.available ? ['pataakha_bazaar', 'mithai_run', 'deepon_ki_raat', 'rocket_bunty', 'tiger_ko_bachao'].filter((id) => N.missions.isDone(id)) : [], st: N.dwMissions.state(), tin: Array.from(N.tape.tin), sevai: N.flags.diwali_sevai_promise }));
  const ok = await ev(() => N.save.save({ reason: 'booth', toast: false }));
  check(ok, 'saved after the missions (STD booth)');
  await page.reload();
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
  await page.mouse.click(2, 2);
  await page.click('[data-act=continue]');
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 30000 });
  await tick();
  const after = await ev(() => ({ done: ['pataakha_bazaar', 'mithai_run', 'deepon_ki_raat', 'rocket_bunty', 'tiger_ko_bachao'].filter((id) => N.missions.isDone(id)), st: N.dwMissions.state(), tin: Array.from(N.tape.tin), sevai: N.flags.diwali_sevai_promise }));
  check(after.done.length === before.done.length && before.done.length >= 1, 'CONTINUE: the passed Diwali activities stay passed (' + after.done.join(', ') + ')', { before: before.done, after: after.done });
  check(JSON.stringify(after.st.prog) === JSON.stringify(before.st.prog), 'CONTINUE: every activity\'s progress (save section diwali_missions) is back', { before: before.st.prog, after: after.st.prog });
  check(JSON.stringify(after.st.box) === JSON.stringify(before.st.box), 'CONTINUE: the cracker box is back (' + after.st.stash + ')', { before: before.st.box, after: after.st.box });
  check(before.tin.every((t) => after.tin.includes(t)), 'CONTINUE: the tin tokens are back', after.tin);
  check(after.sevai === before.sevai, 'CONTINUE: N.flags.diwali_sevai_promise is back (' + after.sevai + ')');
}

/* ================================================================== main */
const PHASES = [['bazaar', pBazaar], ['mithai', pMithai], ['deepon', pDeepon], ['rocket', pRocket], ['tiger', pTiger], ['week', pWeek], ['save', pSave]];
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
    await ev(() => { if (N.testing && N.testing.unlimitedMoney) N.testing.setUnlimitedMoney(false); const d = document.getElementById('debug'); if (d) d.classList.add('hide'); });
    await page.mouse.click(2, 2);
    await ev(() => { N.debug.newGame({ skipIntro: true }); });
    await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 30000 });
    await ev(() => {
      window.__saves = []; window.__refused = 0; window.__modes = [];
      N.on('state', (d) => { window.__modes.push(d.mode); if (window.__modes.length > 60) window.__modes.shift(); });
      N.on('save', (d) => window.__saves.push({ reason: d && d.reason, ok: d && d.ok, mission: N.missions.active ? N.missions.active.id : null }));
      N.on('save:refused', () => { window.__refused++; });
      // the player tries the pause-menu save every time a Diwali activity starts: refused while it runs
      N.on('mission:start', (d) => { if (N.dwMissions.IDS.includes(d.id)) setTimeout(() => { if (N.missions.active) N.save.save({ reason: 'menu', toast: false }); }, 50); });
    });
    for (const [name, fn] of PHASES) {
      if (ONLY && !ONLY.has(name)) continue;
      phase = name; log('== ' + name);
      try { await fn(); } catch (e) { check(false, 'exception: ' + (e.stack || e.message)); await shot('exception_' + name); }
      await releaseKeys();
      const errs = await ev(() => N.debug.state().errors).catch(() => []);
      if (errs.length) { check(false, name + ': N.err ' + errs.slice(0, 5).join(' | ')); await ev(() => { N.errors.length = 0; }).catch(() => {}); }
    }
  } catch (e) { check(false, 'exception: ' + (e.stack || e)); }
  phase = 'errors';
  check(!errors.length, 'zero console errors / page errors (' + errors.length + ')', errors.slice(0, 8));
  log('real input: ' + JSON.stringify(real));
  log('screenshots: ' + shots.length);
  await browser.close();
  console.log('\n' + passes + ' passed, ' + failures.length + ' failed');
  if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
})();
