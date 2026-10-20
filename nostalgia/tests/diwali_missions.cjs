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
 * Diwali week IN THE STORY (phase 'story', real keys): a save right after Track 10 -> CONTINUE -> the card MON 20 OCT
 *   2003 (not the 1 Nov interlude), Amma's "Immu won't be here for the next one", the week loop, the clue on the
 *   Journal's Clues page (J + a click), Ammamma's swing "Wait till Sat 25 Oct · 15:00 ▶▶", Mithai Run and Deepon ki
 *   Raat from their givers, "Diwali's done" (the optional ones still out), "Sleep ▶▶" -> the outro -> the interlude as
 *   before -> Track 11 offered. Saves: an older build's save from after the interlude goes ◀◀ to the week and ▶▶
 *   back to its own date; a save past Last Bell stays put; the post-game card still works ("Diwali again?") and what
 *   was played in the story stays done. Phase 'rewind': ◀◀ REWIND lists October between September and December.
 * Then: no save is written while a mission runs (player saves are refused), a manual save after the missions, a page
 * reload + CONTINUE restores every mission's progress (done set, our save section, the cracker box, the tin), zero
 * console errors / page errors / N.err. Screenshots: tests/out/diwali_m_*.png.
 *   node tests/diwali_missions.cjs            ONLY=bazaar,mithai,deepon,rocket,tiger,week,save,eid,story,rewind   VERBOSE=1
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
  if (!ok && what) check(false, 'timed out waiting for ' + what, await ev(() => ({ mode: N.state.mode, obj: N.hud.objectiveText, prompt: N.missions.prompt, active: N.missions.active && N.missions.active.id, givers: N.missions.markers().filter((m) => m.kind === 'giver').map((m) => m.id + '@' + Math.round(m.x) + ',' + Math.round(m.y)), dw: N.dwMissions.debug.state(), dlg: N.dialogue.current && N.dialogue.current.text })).catch(() => null));
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
  // from 90 u away (after a pass at the same door the next giver waits until he has stepped out once), on the side
  // away from the other givers' rings (walking in through another J-card would start that one)
  if (!o.noTeleport) {
    const at = await ev(([id, gx, gy]) => {
      const others = N.missions.markers().filter((m) => m.kind === 'giver' && m.id !== id);
      let best = null, bs = -1;
      // a straight walk in (not through the house) when there is one: 90 u out, else nearer; else any side
      for (const [R, clear] of [[90, true], [70, true], [50, true], [90, false]]) for (let i = 0; i < 16 && !best; i++) {
        const a = (i / 16) * Math.PI * 2, x = gx + Math.cos(a) * R, y = gy + Math.sin(a) * R;
        if (!N.world.isWalkable(x, y)) continue;
        const rc = clear && N.world.raycast ? N.world.raycast(x, y, gx, gy, 'walk') : null;
        if (rc && rc.hit) continue;
        best = 'r' + R + (clear ? 'c' : ''); // (marks the radius found; the loop below picks the side)
      }
      const pick = best; best = null;
      const R0 = pick ? +pick.replace(/\D+/g, '') : 90, clear0 = !!pick && /c$/.test(pick);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, x = gx + Math.cos(a) * R0, y = gy + Math.sin(a) * R0;
        if (!N.world.isWalkable(x, y)) continue;
        const rc = clear0 && N.world.raycast ? N.world.raycast(x, y, gx, gy, 'walk') : null;
        if (rc && rc.hit) continue;
        let md = 1e9; for (const m of others) { const dd = Math.hypot(m.x - x, m.y - y); const seg = Math.min(md, dd); md = seg; }
        // and away from the straight line in
        for (const m of others) for (let t = 0.2; t < 1; t += 0.2) md = Math.min(md, Math.hypot(m.x - (x + (gx - x) * t), m.y - (y + (gy - y) * t)) + 10);
        if (md > bs) { bs = md; best = { x, y }; }
      }
      return best || { x: gx + 90, y: gy + 6 };
    }, [id, g.x, g.y]);
    await teleport(at.x, at.y);
  }
  await waitFor((id) => N.missions.markers().some((m) => m.kind === 'giver' && m.id === id), id, 8000, id + ' giver marker');
  if (o.shot) await shot(o.shot);
  // (the step-out gates have lapsed out there): the last 40 u on foot, along the same clear line
  if (!o.noTeleport) {
    const near = await ev(([gx, gy]) => { const p = N.player, d = Math.hypot(p.x - gx, p.y - gy) || 1, x = gx + (p.x - gx) / d * 40, y = gy + (p.y - gy) / d * 40; const rc = N.world.raycast ? N.world.raycast(x, y, gx, gy, 'walk') : null; return d > 50 && N.world.isWalkable(x, y) && !(rc && rc.hit) ? { x, y } : null; }, [g.x, g.y]);
    if (near) await teleport(near.x, near.y);
  }
  await walkTo(g.x, g.y, g.r - 4, { stop: () => !!N.missions.prompt || !!N.missions.active, ms: 30000 });
  // (an NPC giver may have moved, or the walk stopped short): the last steps to where the giver is now
  const g2 = await ev((id) => { const d = N.missions.defs[id]; const p = d && N.missions.giverPos(d); return p ? { x: p.x, y: p.y, prompt: N.missions.prompt } : null; }, id);
  if (g2 && g2.prompt !== id && !(await ev(() => N.missions.active))) { vlog('startAt ' + id + ': again to ' + JSON.stringify(g2)); await walkTo(g2.x, g2.y, g.r - 6, { direct: true, stop: `() => N.missions.prompt === '${id}' || !!N.missions.active`, ms: 8000 }); }
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
  await (typeof done === 'string' ? page.waitForFunction('(' + done + ')()', null, { timeout: ms || 6000, polling: 50 }) : page.waitForFunction(done, null, { timeout: ms || 6000, polling: 50 })).catch(() => {});
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
  if (!(await ev(() => /terrace/i.test(N.input.actionLabel || '')))) { vlog('the walk to the stairs fell short -> standing at them'); tally('debug hops (short walks)'); await teleport(st.x, st.y); }
  if (!(await useWhen(/terrace/i))) return false;
  return waitFor(() => N.player.level === 'home_terrace', null, 8000, 'on the home terrace');
}
async function deeponBot(ms) {
  const t0 = Date.now();
  let guardShot = false, lightShot = false;
  while (Date.now() - t0 < ms) {
    const s = await ev(() => ({ act: N.missions.active && N.missions.active.id, dlg: !!(N.dialogue.isOpen && N.dialogue.isOpen()), d: N.dwMissions.debug.state(), label: N.input.actionLabel, mode: N.state.mode }));
    if (s.act !== 'deepon_ki_raat' || !s.d.terrace) return s;
    const T = s.d.terrace, G = s.d.gust, p = s.d.player;
    if (T.lit >= T.n) return s;
    if (s.dlg) { await talkThrough(); continue; }
    if (s.mode !== 'play') { await tick(); continue; }
    if (G && (G.phase === 'warn' || G.phase === 'hit') && G.n <= 1 && s.d.stats.gusts <= 2) {
      // the first gust of this try: he keeps lighting (the gust blows the windward flames out)
    } else if (G && (G.phase === 'warn' || G.phase === 'hit')) {
      // guard: stand by the lit diyas on the windward edge (the most of them within reach)
      const ux = -Math.cos(G.dir), uy = -Math.sin(G.dir);
      const wind = T.diyas.filter((d) => d.lit && d.nx * ux + d.ny * uy >= 0.5);
      if (wind.length) {
        let best = wind[0], bn = -1;
        for (const c of wind) { const n = wind.filter((d) => Math.hypot(d.x - c.x, d.y - c.y) <= 9).length; if (n > bn) { bn = n; best = c; } }
        const gx = best.x - best.nx * 3, gy = best.y - best.ny * 3;
        if (Math.hypot(p.x - gx, p.y - gy) > 2.5) await walkTo(gx, gy, 2, { direct: true, ms: 2500, stop: () => { const g = N.dwMissions.debug.state().gust; return !g || g.phase === 'calm'; } });
        if (!guardShot && G.phase === 'warn') { guardShot = true; vlog('zoom ' + JSON.stringify(await ev(() => ({ z: N.render.cam.zoom, base: N.render.baseZoom, ov: N.render.camOverride, ff: !!(N.missions.active && N.missions.active.ff) })))); await shot('diyas_gust'); }
      }
      await page.waitForFunction(() => { const g = N.dwMissions.debug.state().gust; return !g || g.phase === 'calm'; }, null, { timeout: 5000, polling: 80 }).catch(() => {});
      continue;
    }
    // light the next one: the windward edge first (the hard way round: the gusts find them lit), nearest first
    const wd = G ? G.dir : 0, ux = -Math.cos(wd), uy = -Math.sin(wd);
    let tgt = null, bs = -1e9, bd = 1e9;
    for (const d of T.diyas) {
      if (d.lit) continue;
      const dd = Math.hypot(d.x - p.x, d.y - p.y), sc = (d.nx * ux + d.ny * uy >= 0.5 ? 100 : 0) - dd;
      if (sc > bs) { bs = sc; bd = dd; tgt = d; }
    }
    if (!tgt) { await tick(); continue; }
    if (!/Light the diya/.test(s.label || '') || bd > 6) {
      await walkTo(tgt.x - tgt.nx * 3, tgt.y - tgt.ny * 3, 2.5, { direct: true, ms: 4000, stop: () => { const g = N.dwMissions.debug.state().gust; return !!g && g.phase !== 'calm'; } });
    }
    const lab = await ev(() => N.input.actionLabel);
    if (/Light the diya/.test(lab || '')) {
      if (!lightShot && T.lit >= 8) { lightShot = true; await page.keyboard.down('KeyE'); await page.waitForTimeout(250); await shot('diyas_lighting'); await page.keyboard.up('KeyE'); }
      const n0 = T.lit;
      await holdE(`() => { const d = N.dwMissions.debug.state(); return !d.terrace || d.terrace.lit > ${n0} || (d.gust && d.gust.phase !== 'calm'); }`, 2500);
    }
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
  await waitFor(() => !!N.dwMissions.debug.state().terrace, null, 30000, 'the 21 diyas on the parapet');
  const T0 = await ev(() => N.dwMissions.debug.state().terrace);
  check(T0 && T0.n === 21 && T0.diyas.every((d) => isFinite(d.x)), '21 diya spots on the home terrace parapet', T0 && { n: T0.n, bb: T0.bb });
  // fail: the breeze comes before 21 (two lit for real, then he stands about)
  for (let i = 0; i < 2; i++) {
    const s = await ev(() => N.dwMissions.debug.state());
    const d = s.terrace.diyas.find((q) => !q.lit);
    await walkTo(d.x - d.nx * 3, d.y - d.ny * 3, 2.5, { direct: true, ms: 4000 });
    const n0 = (await ev(() => N.dwMissions.debug.state().terrace.lit));
    await holdE(`() => N.dwMissions.debug.state().terrace.lit > ${n0}`, 3000);
  }
  if (!(await failAndRetry('deepon_ki_raat', /breeze came first/i, () => ev(() => { N.dwMissions.TUNE.breezeSecs = 150; })))) return;
  const r = await ev(() => ({ level: N.player.level, lit: N.dwMissions.debug.state().terrace.lit }));
  check(r.level === 'home_terrace' && r.lit === 0, 'retried at the \'terrace\' checkpoint: on the terrace, every diya out again', r);
  await deeponBot(150000);
  await shot('diyas_all_lit');
  const st = await ev(() => N.dwMissions.debug.state().stats);
  check(st.gusts >= 2 && st.saved >= 1 && st.blown >= 1, 'gust fronts came (' + st.gusts + '): ' + st.saved + ' flames kept alive by standing guard, ' + st.blown + ' blown out and re-lit', st);
  // the terrace view
  vlog('modes before the view: ' + (await ev(() => window.__modes.slice(-8).join(' '))));
  await playUntil(() => N.state.mode === 'cutscene', 20000, 'the terrace fireworks view');
  vlog('modes: ' + (await ev(() => window.__modes.slice(-12).join(' '))));
  await page.waitForFunction(() => document.querySelector('#overlay .cs-text'), null, { timeout: 15000, polling: 100 }).catch(() => {});
  await shot('terrace_fireworks');
  if (!(await passed('deepon_ki_raat', 60000))) return;
  const t = await ev(() => ({ tin: N.tape.tin.has('clay_diya'), tok: N.tape.tokens.clay_diya, prog: N.dwMissions.state().prog.deepon_ki_raat }));
  check(t.tin && t.tok && /diya/i.test(t.tok.name), 'the clay diya is in the tin', t);
  // the twenty-one burn on tonight; the same in the 3D view (V)
  await waitFor(() => N.state.mode === 'play' && !N.dialogue.isOpen(), null, 10000, 'free roam on the terrace');
  if (await ev(() => !!(N.view && N.view3d))) {
    await press('KeyV');
    const ok3 = await waitFor(() => !!(N.view3d && N.view3d.active), null, 60000, 'the 3D view');
    if (ok3) {
      await ev(() => { try { N.view3d.settle && N.view3d.settle(3000); } catch (e) { /* ignore */ } });
      await page.waitForFunction(() => { const s = N.view3d.stats && N.view3d.stats(); return !s || !s.pending || s.pending < 4; }, null, { timeout: 30000, polling: 250 }).catch(() => {});
      await page.waitForTimeout(800);
      await shot('terrace_3d');
      const e3 = await ev(() => N.debug.state().errors);
      check(!e3.length, 'the 3D view draws the lit terrace (layer dwm3d) without errors', e3);
      // V cycles 3D -> first person -> top-down
      for (let i = 0; i < 3 && (await ev(() => N.view3d.active)); i++) { await press('KeyV'); await page.waitForFunction(() => true, null, { timeout: 2000 }).catch(() => {}); await page.waitForTimeout(400); }
      await waitFor(() => !N.view3d.active, null, 10000, 'back to the top-down view');
    }
  }
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
  const L0 = await ev(() => N.dwMissions.debug.state().rocket.L);
  await walkTo(L0.x, L0.y + 6, 5, { direct: true, ms: 3000, stop: `() => /Light it/.test(N.input.actionLabel || '')` });
  await waitFor(() => { const r = N.dwMissions.debug.state().rocket; return r && r.wind && r.wind.phase === 'gust' && /Light it/.test(N.input.actionLabel || ''); }, null, 15000, 'by the bottle in a gust');
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
  await waitFor(() => { const r = N.dwMissions.debug.state().rocket; return !r || !!r.burst; }, null, 8000, 'the burst over the colony');
  await page.waitForTimeout(350);
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
  await page.waitForTimeout(1600); // (the J-card dwell is 1 s: nothing may start under him)
  const st2 = await ev(() => ({ active: N.missions.active && N.missions.active.id, prompt: N.missions.prompt }));
  check(!st2.active && !st2.prompt, 'standing at the door after the ▶▶: Amma\'s Pataakha Bazaar card waits until he steps out', st2);
  await shot('week');
  await ev(() => { N.flags.postgame = false; });
}

/* ================================================================== the Eid morning hook (story2.js "[diwali hook]") */
async function pEid() {
  phase = 'eid';
  const f = await ev(() => N.flags.diwali_sevai_promise);
  if (!f) await ev(() => { N.flags.diwali_sevai_promise = true; }); // (ONLY=eid without mithai)
  await ev(() => { window.__lines = []; N.on('dialogue:line', (d) => window.__lines.push({ s: d.speaker, t: d.text })); N.story2.ending(); });
  // the ending's first card is Eid morning at Immu's house: Ammi's Eidi, then the sevaiyan promised at Diwali
  const ok = await playUntil(() => window.__lines.some((l) => /sevaiyan/i.test(l.t)), 40000, 'Ammi\'s Eid morning sevaiyan line');
  const L = await ev(() => window.__lines.map((l) => l.s + ': ' + l.t));
  const i = L.findIndex((l) => /Eid Mubarak/.test(l)), j = L.findIndex((l) => /sevaiyan/i.test(l));
  check(ok && i >= 0 && j === i + 1 && /^ammi/.test(L[j]), 'Eid morning (Wed 26 Nov) acknowledges the Diwali promise: "' + (L[j] || '').slice(0, 90) + '"', L.slice(0, 6));
  await page.waitForFunction(() => N.dialogue.current && /sevaiyan/i.test(N.dialogue.current.text) && !N.dialogue.current.typing, null, { timeout: 5000, polling: 60 }).catch(() => {});
  await shot('eid_sevaiyan');
  await ev(() => { N.story2.abortScene(); });
  await waitFor(() => !N.story2.state().scene && N.state.mode === 'play', null, 10000, 'the ending scene stops');
  await ev(() => { if (N.dialogue.isOpen()) N.dialogue.cancel(); if (N.menus.abortCutscene) N.menus.abortCutscene(); N.flags.ending_done = false; });
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

/* ================================================================== Diwali week IN THE STORY (after Track 10, before the interlude) */
const D10 = ['bo_kaata', 'lost_and_found', 'first_day_first_show', 'last_man_batting', 'right_right', 'ammammas_thursday', 'the_clap', 'drums_for_amma', 'opening_day', 'agle_baras'];
/** A save state written with N.save (missions done, flags, date), then a page reload and a real click on ▶▶ CONTINUE. */
async function saveState(o) {
  const ok = await ev((o) => {
    N.debug.newGame({ skipIntro: true }); N.save.clear();
    N.missions.deserialize({ done: o.done });
    for (const id of o.done) if (!N.dwMissions.IDS.includes(id)) N.tape.rec(id, { silent: true });
    Object.assign(N.flags, { prologue_seen: true, lock_4: 1, riddle_4: true, boats_open: true }, o.flags || {});
    N.calendar.set.apply(N.calendar, o.date);
    if (o.paused) N.tape.pause(true);
    const h = N.places.home; N.player.teleport(h.x + 200, h.y + 30);
    return N.save.save({ reason: 'mission', toast: false });
  }, o);
  check(ok, 'save state written: ' + o.what);
  await page.reload();
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
  await ev(() => { if (N.testing && N.testing.unlimitedMoney) N.testing.setUnlimitedMoney(false); const d = document.getElementById('debug'); if (d) d.classList.add('hide'); });
  await page.mouse.click(2, 2);
  await page.click('[data-act=continue]', { noWaitAfter: true, timeout: 60000 }); tally('click CONTINUE');
  await page.waitForFunction(() => N.state.mode !== 'title', null, { timeout: 30000 });
  await ev(() => { window.__lines = []; N.on('dialogue:line', (d) => window.__lines.push({ s: d.speaker, t: d.text })); });
}
/** The cutscene card whose text matches `re` (polled), screenshot. */
async function catchCard(re, name, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 30000)) {
    const cs = await ev(() => { const e = document.querySelector('.mn-cs'); return e && e.offsetParent !== null ? e.innerText : ''; });
    if (re.test(cs)) { if (name) await shot(name); return cs; }
    await page.waitForTimeout(80);
  }
  return null;
}
/** Into Ammamma's swing (the chapter's J-card) with the arrow keys, from the side away from the house. */
async function swingCard(re, name) {
  const c = await ev(() => N.dwMissions.story.state().card);
  if (!check(!!c, 'Ammamma\'s card is up at her swing', await ev(() => N.dwMissions.story.state()))) return false;
  await ev((c) => { const h = N.places.home, dx = c.x - h.x, dy = c.y - h.y, L = Math.hypot(dx, dy) || 1; const q = N.world.findFree(c.x + dx / L * 46, c.y + dy / L * 46, 'walk', 20) || { x: c.x + 46, y: c.y }; N.player.teleport(q.x, q.y); if (N.render.snapCamera) N.render.snapCamera(); }, c);
  await tick();
  await walkTo(c.x, c.y, 6, { stop: `() => /${re.source.replace(/\//g, '\\/')}/.test((document.querySelector('.hud-jcard.show') || {}).innerText || '')`, ms: 15000 });
  const ok = await waitFor((src) => new RegExp(src).test((document.querySelector('.hud-jcard.show') || {}).innerText || ''), re.source, 5000, 'the swing J-card ' + re);
  const txt = await ev(() => (document.querySelector('.hud-jcard.show') || {}).innerText || '');
  check(ok, 'Ammamma\'s swing: "' + txt.replace(/\s+/g, ' ').trim().slice(0, 130) + '"');
  if (ok && name) await shot(name);
  return ok;
}
async function pStory() {
  phase = 'story';
  // STORY_FROM=deepon: start at step 5 from a save in the week (Sat 25 Oct 17:00, Mithai Run done)
  if (process.env.STORY_FROM === 'deepon') {
    await saveState({ what: 'in Diwali week, Sat 25 Oct 17:00, Mithai Run done', done: D10.concat(['mithai_run']), flags: { dw_story: 'week', diwali_sevai_promise: true }, date: [2003, 10, 25, 17, 0] });
    await page.waitForTimeout(2500);
    return pStoryDeepon();
  }
  // 1. a save right after Track 10 (Agle Baras): CONTINUE plays the way into Diwali week
  await saveState({ what: 'M1-M10 done, Wed 10 Sep 2003 18:10 (right after Agle Baras)', done: D10, date: [2003, 9, 10, 18, 10] });
  const card = await catchCard(/20 OCT 2003/, 'story_card');
  check(card && /Diwali week/.test(card), 'CONTINUE after Track 10: the card "' + String(card).replace(/\s+/g, ' ').slice(0, 80) + '" (▶▶, not the 1 Nov interlude)', card);
  await playUntil(() => !N.story2.scene && N.state.mode === 'play', 40000, 'the way in');
  await page.waitForTimeout(1200);
  const w = await ev(() => ({ date: N.calendar.label(), st: N.dwMissions.story.state(), loop: N.calendar.loop ? [N.calendar.dateOf(N.calendar.loop.from).label, N.calendar.dateOf(N.calendar.loop.to).label] : null,
    hint: N.hints.active && N.hints.active.id, obj: N.hud.objectiveText, m11: N.missions.available().some((d) => d.id === 'last_bell'), inter: !!N.flags.interlude_done,
    lines: window.__lines.filter((l) => /next one|aeroplane|Saturday/.test(l.t)).map((l) => l.s + ': ' + l.t), save: JSON.parse(localStorage.getItem('nostalgia.save.v1')).data.flags.dw_story }));
  check(/MON 20 OCT 2003/.test(w.date) && w.st.week === 'week' && !w.inter, 'Diwali week: ' + w.date + ', the interlude not yet', w);
  check(w.lines.some((l) => /^amma: .*next one/.test(l)) && w.lines.some((l) => /^ammamma: .*aeroplane/.test(l)), 'Amma: "Immu won\'t be here for the next one"; Ammamma: "...see them from the aeroplane"', w.lines);
  check(w.loop && /20 OCT/.test(w.loop[0]) && /26 OCT/.test(w.loop[1]), 'the calendar loops the week (Mon 20 - Sun 26 Oct)', w.loop);
  check(w.hint === 'diwali_story' && /Deepavali is Saturday/.test(w.obj || '') && !w.m11 && w.save === 'week', 'the clue + the objective line; Last Bell waits; autosaved in the week', w);
  // 2. the Journal: the Clues page (J, a click on the tab)
  await press('KeyJ');
  if (await waitFor(() => N.state.mode === 'journal', null, 6000, 'the Journal')) {
    await page.click('.jr-tab[data-tab=clues]').catch(() => ev(() => N.menus.openJournal('clues'))); tally('click Clues');
    await page.waitForTimeout(500);
    const txt = await ev(() => (document.querySelector('.jr-page') || {}).innerText || '');
    await shot('story_journal');
    check(/Deepavali is Saturday/.test(txt), 'Journal, Clues: "' + txt.replace(/\s+/g, ' ').slice(0, 110) + '..."');
    await press('Escape');
    await waitFor(() => N.state.mode === 'play', null, 4000);
  }
  // 3. Ammamma's swing on Monday: ▶▶ to Deepavali (the bazaar stays optional: open till 15:00)
  if (await swingCard(/Wait till Sat 25 Oct · 15:00/, 'story_wait')) await press('KeyE');
  await waitFor(() => /SAT 25 OCT 2003/.test(N.calendar.label()) && N.clock.minutes >= 900 && N.clock.minutes < 905 && !N.calendar.jumping, null, 12000, '▶▶ SAT 25 OCT 2003 15:00');
  // 4. Mithai Run (story-required)
  if (await startAt('mithai_run')) {
    await talkThrough();
    const order = await ev(() => {
      const st = N.dwMissions.debug.state().mithai.stops, out = [];
      let cur = { x: N.player.x, y: N.player.y };
      const left = st.slice();
      while (left.length) { left.sort((a, b) => Math.hypot(a.x - cur.x, a.y - cur.y) - Math.hypot(b.x - cur.x, b.y - cur.y)); const n = left.shift(); out.push(n); cur = n; }
      return out;
    });
    for (const st of order) {
      // a hop across the colony to a clear spot 40 u from the door, the last stretch on foot
      const at = await ev(([x, y]) => { for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, px = x + Math.cos(a) * 40, py = y + Math.sin(a) * 40; const rc = N.world.raycast ? N.world.raycast(px, py, x, y, 'walk') : null; if (N.world.isWalkable(px, py) && !(rc && rc.hit)) return { x: px, y: py }; } return null; }, [st.x, st.y]);
      if (at) await teleport(at.x, at.y);
      await walkTo(st.x, st.y, 9, { stop: `() => /Give the sweets/.test(N.input.actionLabel || '')`, ms: 20000 });
      if (!(await ev(() => /Give the sweets/.test(N.input.actionLabel || '')))) { vlog('mithai: the walk to ' + st.key + ' fell short -> standing at the door'); tally('debug hops (short walks)'); await teleport(st.x, st.y); }
      if (!(await useWhen(/Give the sweets/))) break;
      await talkThrough();
    }
    const home = await ev(() => ({ x: N.places.home.x, y: N.places.home.y }));
    await walkTo(home.x, home.y, 18, { stop: () => !N.missions.active || !!(N.dialogue.isOpen && N.dialogue.isOpen()), ms: 60000 });
    await passed('mithai_run');
    check(await ev(() => N.flags.diwali_sevai_promise === true), 'Immu\'s Ammi: "Eid pe sevaiyan pakki!" (the promise Eid morning keeps)');
  }
  await page.waitForTimeout(2600);
  const m1 = await ev(() => ({ st: N.dwMissions.story.state(), saved: JSON.parse(localStorage.getItem('nostalgia.save.v1')).data.missions.done.includes('mithai_run') }));
  check(m1.saved && m1.st.left.join() === 'deepon_ki_raat' && /diyas/.test(m1.st.objective || ''), 'after Mithai Run: autosaved (a story beat); next: the diyas', m1);
  return pStoryDeepon();
}
const N_ok = (t) => !t || /DEEPON KI RAAT/.test(t); // (the card may already have started the activity: its dwell is 1 s)
async function pStoryDeepon() {
  // 5. Deepon ki Raat (story-required): ▶▶ to 18:30 at the swing if it is early, then Ammamma
  let started = false;
  if (await ev(() => N.clock.minutes < 18 * 60 + 30)) {
    if (await swingCard(/Wait till 18:30/, null)) await press('KeyE');
    await waitFor(() => N.clock.minutes >= 18 * 60 + 30 && !N.calendar.jumping, null, 12000, '▶▶ 18:30');
    // he is still at the swing, in Ammamma's ring: her own J-card comes up under him (as after a "Wait till ▶▶")
    if (await waitFor(() => N.missions.prompt === 'deepon_ki_raat' || (N.missions.active && N.missions.active.id === 'deepon_ki_raat') || /DEEPON KI RAAT/.test((document.querySelector('.hud-jcard.show') || {}).innerText || ''), null, 8000, 'Ammamma\'s Deepon ki Raat J-card right after the ▶▶')) {
      const txt = await ev(() => (document.querySelector('.hud-jcard.show') || {}).innerText || '');
      check(N_ok(txt), 'after "Wait till 18:30 ▶▶": "' + txt.replace(/\s+/g, ' ').trim().slice(0, 80) + '"');
      await shot('story_deepon_card');
      if (await ev(() => !N.missions.active)) await press('KeyE');
      started = await waitFor(() => N.missions.active && N.missions.active.id === 'deepon_ki_raat', null, 8000, 'deepon_ki_raat starts');
    }
  }
  if (started || await startAt('deepon_ki_raat')) {
    await talkThrough();
    if (await climbTerrace()) {
      await waitFor(() => !!N.dwMissions.debug.state().terrace, null, 30000, 'the 21 diyas');
      await deeponBot(150000);
      await playUntil(() => N.state.mode === 'cutscene' || !N.missions.active, 20000, 'the terrace fireworks view');
      await passed('deepon_ki_raat', 60000);
    }
  }
  await page.waitForTimeout(2600);
  // 6. Diwali's done: the player chooses when to sleep
  const dn = await ev(() => ({ st: N.dwMissions.story.state(), obj: N.hud.objectiveText, avail: N.missions.available().map((d) => d.id), date: N.calendar.label() + ' ' + N.clock.label(), scene: N.story2.scene, inter: !!N.flags.interlude_done }));
  check(!dn.st.left.length && dn.st.card && dn.st.card.kind === 'sleep' && !dn.scene && !dn.inter, 'Diwali\'s done (' + dn.date + '): nothing moves on by itself; "Sleep ▶▶" waits at Ammamma\'s swing', dn);
  check(['rocket_bunty', 'tiger_ko_bachao'].every((id) => dn.avail.includes(id)) && /Diwali's done/.test(dn.obj || ''), 'the optional ones are still out tonight; the objective: home to sleep', dn);
  await shot('story_done');
  if (await swingCard(/Sleep ▶▶/, 'story_sleep')) await press('KeyE');
  // 7. the outro, then the interlude exactly as before (Sat 1 Nov, ■ PAUSED 812, Ayesha)
  await playUntil(() => N.story2.scene === 'interlude', 60000, 'the interlude after the outro');
  const o = await ev(() => ({ f: N.flags.dw_story, l: window.__lines.filter((l) => /one diya extra|we show off/.test(l.t)).length, save: (() => { const d = JSON.parse(localStorage.getItem('nostalgia.save.v1')).data; return { dw: d.flags.dw_story, inter: !!d.flags.interlude_done }; })() }));
  check(o.f === 'done' && o.l === 2 && o.save.dw === 'done' && !o.save.inter, 'Sleep ▶▶: the outro (Ammamma: "one diya extra. For him."), autosaved, the interlude begins', o);
  await catchCard(/1 NOV 2003/, 'story_interlude', 20000);
  for (let i = 0; i < 80 && !(await ev(() => !!N.flags.interlude_done)); i++) {
    const s = await ev(() => ({ dlg: !!(N.dialogue.isOpen && N.dialogue.isOpen()), pr: N.story2.probe() }));
    if (s.dlg) { await talkThrough(() => !!N.flags.interlude_done, 10); continue; }
    if (s.pr.mode === 'play' && s.pr.target && s.pr.dist > 26) { await teleport(s.pr.target.x + 40, s.pr.target.y); await walkTo(s.pr.target.x, s.pr.target.y, 22, { ms: 10000, stop: () => !!(N.dialogue.isOpen && N.dialogue.isOpen()) }); continue; }
    await page.waitForTimeout(250);
  }
  await waitFor(() => !N.story2.scene && N.state.mode === 'play', null, 20000, 'the interlude ends');
  const af = await ev(() => ({ inter: !!N.flags.interlude_done, date: N.calendar.label(), paused: N.tape.paused, counter: N.tape.counter, m11: N.missions.available().some((d) => d.id === 'last_bell'), loop: N.calendar.loop ? N.calendar.dateOf(N.calendar.loop.to).label : null, hint: N.hints.active && N.hints.active.id }));
  check(af.inter && /01 NOV 2003/.test(af.date) && af.paused && af.counter === 812 && af.m11 && af.hint !== 'diwali_story', 'then the interlude as before (SAT 01 NOV 2003, ■ PAUSED 812) and Track 11 is offered', af);
  // 8. saves: one made after the interlude by an older build (no Diwali week) -> ◀◀ into the week, ▶▶ back afterwards
  await saveState({ what: 'M1-M10 done + the interlude, Fri 14 Nov 2003 (an older build skipped Diwali week)', done: D10, flags: { interlude_done: true, ayesha_moving: true }, date: [2003, 11, 14, 10, 0], paused: true });
  const back = await catchCard(/20 OCT 2003/, 'story_back_card');
  check(back && /Side A forgot/.test(back), 'that save goes to Diwali week on load (◀◀ "the week Side A forgot to record")', back);
  await playUntil(() => !N.story2.scene && N.state.mode === 'play' && N.flags.dw_story === 'week', 40000, 'the way in (◀◀)');
  const b1 = await ev(() => ({ st: N.dwMissions.story.state(), m11: N.missions.available().some((d) => d.id === 'last_bell') }));
  check(b1.st.back && b1.st.back[1] === 11 && b1.st.back[2] === 14 && !b1.m11, 'it remembers Fri 14 Nov; Last Bell waits', b1);
  await ev(() => { N.missions.deserialize({ done: N.missions.serialize().done.concat(['mithai_run', 'deepon_ki_raat']) }); }); // (both played above: here only the way back is checked)
  await page.waitForTimeout(1200);
  check(await ev(() => N.dwMissions.story.sleep()), 'Sleep ▶▶ (debug call)');
  await playUntil(() => !N.story2.scene && N.flags.dw_story === 'done' && !N.calendar.jumping && N.calendar.date.m === 11, 40000, 'the ▶▶ back to November');
  await page.waitForTimeout(800);
  const b2 = await ev(() => ({ date: N.calendar.label(), scene: N.story2.scene, m11: N.missions.available().some((d) => d.id === 'last_bell'), paused: N.tape.paused, back: N.flags.dw_back || null }));
  check(/FRI 14 NOV 2003/.test(b2.date) && !b2.scene && b2.m11 && b2.paused && !b2.back, 'after the week: ▶▶ back to FRI 14 NOV 2003 (no second interlude), Track 11 offered', b2);
  // a save at / after Last Bell is never pulled back
  await saveState({ what: 'M1-M11 done (Last Bell), Sat 22 Nov 2003', done: D10.concat(['last_bell']), flags: { interlude_done: true, lock_3: 0 }, date: [2003, 11, 22, 10, 0] });
  await page.waitForTimeout(4000);
  const c1 = await ev(() => ({ date: N.calendar.label(), scene: N.story2.scene, pending: N.dwMissions.story.state().pending }));
  check(/22 NOV 2003/.test(c1.date) && !c1.scene && !c1.pending, 'a save past Last Bell stays where it is (no Diwali week)', c1);
  // the post-game card still works; a player who played the week in the story gets Amma's "Diwali again?" and nothing doubles
  await saveState({ what: 'post-game, Sat 20 Sep 2003, Diwali week played in the story', done: D10.concat(['last_bell', 'chand_raat', 'mithai_run', 'deepon_ki_raat']), flags: { interlude_done: true, postgame: true, ending_done: true, epilogue_done: true, credits_seen: true, dw_story: 'done', diwali_sevai_promise: true }, date: [2003, 9, 20, 10, 0] });
  await page.waitForTimeout(3000);
  const d1 = await ev(() => ({ date: N.calendar.label(), scene: N.story2.scene, pending: N.dwMissions.story.state().pending, card: N.missions.available().some((d) => d.id === 'diwali_week'), line: N.missions.defs.diwali_week.jcardLine }));
  check(!d1.scene && !d1.pending && d1.card && /Diwali again/.test(d1.line), 'post-game: the "Diwali Week" card is up at home ("' + d1.line + '"); no story chapter again', d1);
  if (await startAt('diwali_week', { jshot: 'story_postgame_card' })) {
    await talkThrough();
    await waitFor(() => !N.missions.active && /MON 20 OCT 2003/.test(N.calendar.label()) && !N.calendar.jumping, null, 20000, '▶▶ Mon 20 Oct (post-game)');
    await ev(() => N.calendar.set(2003, 10, 25, 16, 0));
    await page.waitForTimeout(1000);
    const d2 = await ev(() => ({ av: N.missions.available().map((d) => d.id), st: N.dwMissions.story.state() }));
    check(!d2.av.includes('mithai_run') && !d2.av.includes('deepon_ki_raat') && d2.av.includes('rocket_bunty') && !d2.st.card, 'post-game Diwali week: what was played in the story stays done (no second Mithai Run / Deepon), the optional ones are there; no story card', d2);
  }
}
/** ◀◀ REWIND (post-game): "October" sits between September and December and starts in Diwali week. */
async function pRewind() {
  phase = 'rewind';
  await ev(() => { window.__pick = null; N.story2.rewind().then((k) => { window.__pick = k; if (k) N.story2.playSeason(k); }); });
  await waitFor(() => !!document.querySelector('.s2-rewind'), null, 6000, 'the REWIND menu');
  const items = await ev(() => Array.from(document.querySelectorAll('.s2-rewind .s2-jmenu button')).map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
  const oi = items.findIndex((t) => /October/.test(t));
  check(oi > 0 && /September/.test(items[oi - 1]) && /December/.test(items[oi + 1] || '') && /Diwali/.test(items[oi]), '◀◀ REWIND: "' + (items[oi] || '').slice(0, 90) + '" between September and December', items);
  await page.mouse.move(4, 700); // (the pointer from the CONTINUE click would hover a row)
  await press('ArrowDown', oi);
  await shot('rewind_october');
  await press('KeyE');
  await waitFor(() => window.__pick === 'october' && N.state.mode === 'play', null, 10000, 'October picked');
  await page.waitForTimeout(2500);
  const auto = await ev(() => N.missions.active && N.missions.active.id);
  check(!auto, 'standing at the door after the ◀◀: nothing starts under him (Amma\'s card waits until he steps out)', auto);
  const r = await ev(() => ({ date: N.calendar.label() + ' ' + N.clock.label(), post: N.flags.postgame, pick: N.flags.season_pick, stalls: N.dwMissions.season('pataakha'), pending: N.dwMissions.story.state().pending, bazaar: !N.missions.isDone('pataakha_bazaar') && N.missions.inWindow('pataakha_bazaar') && N.missions.defs.pataakha_bazaar._dwWhen() }));
  check(/MON 20 OCT 2003 10:0/.test(r.date) && r.post && r.pick === 'october' && r.stalls && !r.pending && r.bazaar, '◀◀ October 2003: Mon 20 Oct, Diwali week, post-game free roam (Amma\'s cracker list is open)', r);
  await shot('october_week');
}

/* ================================================================== main */
const PHASES = [['bazaar', pBazaar], ['mithai', pMithai], ['deepon', pDeepon], ['rocket', pRocket], ['tiger', pTiger], ['week', pWeek], ['save', pSave], ['eid', pEid], ['story', pStory], ['rewind', pRewind]];
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[' + phase + '] console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('[' + phase + '] pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  // three.js for the 3D view from the vendored copy (hermetic, as tests/view3d.cjs does)
  const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
  await page.route('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  // the GLTFLoader for the 3D view's Blender models: from the vendored file whichever path models3d.js tries
  const GLTF_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/GLTFLoader.classic.js'), 'utf8');
  await page.route(/\/vendor\/three\/GLTFLoader\.classic\.js$/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: GLTF_JS }));
  page.on('requestfailed', (q) => { if (!/fonts\.g/.test(q.url())) errors.push('[' + phase + '] request failed: ' + q.url().slice(-120) + ' ' + ((q.failure() && q.failure().errorText) || '')); });
  // STABLE=1 (default on): a src file that does not parse right now (another agent mid-edit) is served from git HEAD,
  // as tests/story_full.cjs does; STABLE=0 serves the working tree as it is
  if (process.env.STABLE !== '0') {
    await page.route(/\/src\/[\w.]+\.js$/, (r) => {
      const rel = 'src/' + r.request().url().split('/src/').pop();
      let body = null;
      try { body = fs.readFileSync(path.join(ROOT, rel), 'utf8'); new (require('vm').Script)(body); } catch (e) {
        try { body = require('child_process').execSync('git show HEAD:nostalgia/' + rel, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }); new (require('vm').Script)(body); console.log('  (STABLE: ' + rel + ' does not parse; using HEAD)'); } catch (e2) { body = '/* ' + rel + ': no parsable version (another agent mid-edit) */'; console.log('  (STABLE: ' + rel + ' does not parse anywhere; stubbed)'); }
      }
      return r.fulfill({ status: 200, contentType: 'text/javascript', body });
    });
  }
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
      // a phase that broke off must not leave its mission running into the next one
      await ev(() => { if (N.missions.active && N.dwMissions.IDS.includes(N.missions.active.id)) N.missions.abort(); if (N.dialogue.isOpen && N.dialogue.isOpen()) N.dialogue.cancel(); }).catch(() => {});
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
