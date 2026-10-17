/* NOSTALGIA — wanted.js  (owner: city-life + wanted agent)
 *
 * THE CHAPPAL METER (wanted level 0..5), systems_design §4 (numbers in N.wanted.TUNE) and story bible
 * §8.2 / §8.3 (lines). Mummy's meter: five slippers on the HUD (hud.js draws them from `level`; this
 * file adds the heat-filling of the next slipper and the pursuer blips on the minimap).
 *
 * Model: `heat` 0..599, level = floor(heat / 100). Major offences add whole levels; minor heat alone
 * cannot lift the meter above level 2 (heat 299). Unseen for 12 s (difficulty: 9 / 12 / 15) drops a
 * level; at level 0 heat fades 5/s. Respect zones (N.respect: temples, mosques, churches, dargahs, the
 * gurudwara, Charminar's interior, processions) freeze it; pursuers wait 40 u away, and during a chase
 * the compound gate is closed to Chinnu ("Shant ho ke aao, beta").
 *
 * Offences (bump events from entities.js / vehicles.js, plus polling): running into people (> 60 u/s,
 * +10), knocking them down with a bike (+25) or a motor vehicle (+50), x1.5 for aunties / uncles /
 * elders / sarees / burqas; bumping a constable or Pochaiah (+100); crashing into a vehicle at > 70
 * u/s (+20); riding on a footpath fast with people near (+5/s); bumping a cow when someone sees
 * (+20); horn spam at one person (+10, via traffic.js); under-age driving seen by a podium constable
 * (+40); borrowing (vehicles.js: +1 level occupied, addHeat for parked ones); spotter reports (+40);
 * tattles (+100); escalation (Pochaiah sees you 25 s at level 3 -> 4; 30 s at level 4 -> 5); the curfew
 * floor (21:30 / 23:00 / 00:30 in free roam).
 *
 * Pursuers (one chaser + spotters, kid-sized: nobody hits, a "catch" is a hand on the shoulder):
 *   1  Chitti (colony, daytime, not in school hours; can't catch, tattles after 8 s within 60 u;
 *      a Mango Bite bribes her) or a colony uncle running and shouting (on a cycle if you ride)
 *   2  + a second uncle, the aunties' phone tree (ambient aunties become spotters with a "!" pip, one
 *      waves her stick and walks after you), Bahadur the Gurkha with his torch at night, podium
 *      constables report
 *   3  Havaldar Pochaiah: whistle, runs at 70; arrives on his red Luna when far, parks and runs
 *   4  Pochaiah on the Luna (box-in) + a second havaldar on foot + a roadblock: a cycle-rickshaw
 *      across the road ahead with a constable beside it
 *   5  MUMMY in Yadagiri's auto (day) or pillion on Nanna's Chetak (night), throwing the homing chappal
 *      every 6 s (dodge it sideways late in its flight); she steps out and grabs when you stop
 * PAKDA GAYA! (caught): freeze, comic chappal flight + THUP!, banner, VHS rewind, −₹2 (difficulty),
 *   +30 game minutes, tummy +10, respawn at the home gate (or the mission checkpoint / the mission's
 *   onBusted / failOnBusted), meter 0, then the scolding line. THAK GAYA! (tummy 0, 'player:starving'):
 *   sit and pant, banner, fade, wake at the nearest open Irani cafe with glucose water (−₹1) or at home
 *   between 23:30 and 05:00 with Amma's glass of Horlicks; tummy/energy 40, +45 gm, meter −2.
 * Cool-downs here: Mango Bite for Chitti, jasmine / new chappals for Mummy, home before the street
 *   lights, unseen decay, banana peels (pursuers slip), fed dogs (traffic.js) bark pursuers to a halt.
 *   Barbers, cafe family rooms, cinemas, the kirana hide and the parlour back door are shops.js rows
 *   that call clear / set / hide below; a fallback "Haircut ₹10" is offered at barber_* places only
 *   while N.shops has no barber kind.
 *
 * API  N.wanted = {
 *   level, heat, seen (bool), unseenT, chaser (actor | null), spotters [actors], pursuers [actors],
 *   inRespect (bool), TUNE, stats {caught, exhausted, caughtByDay}, busy (a busted / wasted sequence),
 *   add(levels, reason), addHeat(h, reason, {major}), set(level, reason), clear(reason), coolDown(n, reason),
 *   freeze(on, reason) / frozen(), lock(level | null), policy('normal'|'frozen'|'scripted', level),
 *   hide(kind 'kirana'|'parlour'|'queue', placeId, {teleport}) -> {ok, line}, haircut(placeId) -> Promise,
 *   bust(by?) (PAKDA GAYA now), exhaust() (THAK GAYA now), fine(), dropPeel(),
 *   route({x, y, angle}, tx, ty) / routeStats() (pursuer road routes: N.world.roads.route, cached),
 *   serialize() / deserialize(o) (save section 'wanted') }
 * Roofs (N.player.level): nobody climbs after Chinnu and only a pursuer on his level can catch him;
 *   foot chasers who saw him go up wait by the stairs for TUNE.chaseMemory s, then search as usual.
 * Events: 'wanted' and 'wanted:change' {level, prev, reason}, 'wanted:seen' {by}, 'wanted:report' {by},
 *   'wanted:tattle' {by}, 'chappal:throw' {x, y}, 'chappal:dodge', 'chappal:hit', 'busted' {by, x, y},
 *   'wasted' {x, y}, 'wanted:pursuer' {role, actor}. Sounds: whistle, gurkha, chappal_whoosh, chappal,
 *   peel_slip, busted, wasted, pant, rewind (via 'cutscene:vhs'); captions come from audio.js.
 * Missions: def.meter / m.meter(policy, level) (missions.js calls policy()), def.onBusted(m) and
 *   def.failOnBusted; a THAK GAYA in a mission respawns at the last checkpoint.
 * Coordination: shops.js calls clear('barber'), set(level, why), freeze(on, 'shop'), hide(kind, id) and
 *   reads chaser / seen; traffic.js supplies ambient peds (spotters), constables, N.traffic.dogScare and
 *   the 'rickshaw' vehicle type; vehicles.js calls add(1) / addHeat() when Chinnu borrows.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = Math.random;
  const rr = (a, b) => a + rnd() * (b - a);
  const pick = (a) => a[(rnd() * a.length) | 0];

  /* ================================================================ tuning (systems §4) */
  const TUNE = {
    unseenDrop: 12, level0Decay: 5, minorCap: 299, seeEvery: 0.25,
    heat: {
      pedFoot: 10, pedBike: 25, pedMotor: 50, elderMul: 1.5, constable: 100, vehicle: 20, vehicleSpeed: 70,
      footpath: 5, footpathSpeed: 60, footpathPedR: 30, cow: 20, peel: 20, underage: 40, report: 40, tattle: 100,
    },
    pedFootSpeed: 60, bumpCooldown: 2,
    sight: { chitti: 160, uncle: 180, aunty: 130, bahadur: 150, torch: 200, constable: 140, pochaiah: 220, luna: 260, havaldar: 200, mummy: 240, mummyNight: 200 },
    nightSight: 0.75, crowdSight: 0.6,
    speed: { chitti: 62, chittiWalk: 40, uncle: 64, uncleCycle: 95, aunty: 20, bahadur: 40, pochaiah: 70, havaldar: 66, luna: 114, auto: 122, chetak: 128, mummy: 75 },
    spawnDist: { 1: 260, 2: 300, 3: 350, 4: 400, 5: 450 },
    tattle: { chitti: [60, 8], uncle: [80, 10] },
    report: { secs: 1.5, cooldown: 10, max: 4, r: 400, gap: 3 },
    escalate: { 3: 25, 4: 30 },
    catchR: 12, bikeSlow: 35, boxR: 18, boxSpeed: 25, boxSecs: 1.2, grabR: 10, stepOutR: 34, mummyRunSecs: 8,
    lunaDismount: 70, lunaFootSecs: 6,
    chappal: { every: 6, range: 150, windup: 0.4, speed: 170, arc: 24, life: 1.4, turn1: 2.0, turn2: 0.8, switchT: 0.6, hit: 7, hitBike: 12, nearMiss: 20, rest: 3 },
    respectBuffer: 40, chaseMemory: 12, searchSecs: 8, spiralR: 150,
    // pursuer vehicle routes: replan at most every `min` s (every `every` s, or when the goal moved by
    // max(goalMove, goalFrac x distance)); node-pair cache lifetime and size
    route: { every: 2.5, min: 0.6, goalMove: 60, goalFrac: 0.15, ttl: 3, cacheMax: 48 },
    // Chinnu up on a roof: chasers who saw him go up wait this far from the stair foot, then give up
    roofWaitR: 22,
    fine: 200, bustGm: 30, bustTummy: 10, wastedFine: 100, wastedTummy: 40, wastedEnergy: 40, wastedGm: 45, wastedMeter: 2,
    curfew: [[21 * 60 + 30, 1], [23 * 60, 2], [24 * 60 + 30, 3]], curfewMorning: 5 * 60,
    homeBefore: 18 * 60 + 30, homeR: 22,
    chittiDistricts: ['himayatnagar', 'rtc_x'], chittiHours: [7 * 60, 19 * 60 + 30], schoolHours: [8 * 60 + 30, 15 * 60 + 30],
    mummyDay: [6 * 60, 19 * 60 + 30], auntyHours: [6 * 60, 20 * 60], bahadurHours: [20 * 60, 6 * 60],
    bahadurStyles: ['colony'], podiumHours: [8 * 60, 21 * 60], underageCooldown: 60,
    leaveR: 500, rubberBand: 820, barkEvery: 6, whistleEvery: 4, haircut: 1000, haircutSecs: 5,
  };

  /* ================================================================ helpers */
  const mins = () => (N.clock && isFinite(N.clock.minutes) ? N.clock.minutes : 720);
  const day = () => (N.clock && N.clock.day) || 0;
  function inHours(h, m) { m = m == null ? mins() : m; return h[0] <= h[1] ? m >= h[0] && m < h[1] : m >= h[0] || m < h[1]; }
  function night() { try { return !!N.clock.isNight(); } catch (e) { return false; } }
  function diff(key, d) { try { if (N.settings && typeof N.settings.diff === 'function') { const v = N.settings.diff(key); if (v != null && isFinite(v)) return v; } } catch (e) { /* stub */ } return d; }
  function sfx(name, o) { try { if (N.audio && N.audio.sfx) N.audio.sfx(name, o || {}); } catch (e) { /* audio optional */ } }
  function toast(t, ms) { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2400); } catch (e) { /* hud optional */ } }
  function bark(actor, text, speaker, secs) {
    try { if (N.dialogue && N.dialogue.bark) return N.dialogue.bark(actor, subst(text), { speaker: speaker || undefined, name: speaker ? undefined : false, secs }); } catch (e) { N.err('wanted.bark', e); }
    return null;
  }
  function subst(t) {
    try { if (N.menus && N.menus.subst) return N.menus.subst(t); } catch (e) { /* stub */ }
    const nick = (N.player && (N.player.nick || N.player.name)) || 'Chinnu';
    return String(t).replace(/\{nick\}/g, nick === 'You' ? 'Chinnu' : nick).replace(/\{FULL\}/g, 'K. SRIKANTH').replace(/\{full\}/g, 'K. Srikanth');
  }
  function districtAt(x, y) { try { return N.world.districtAt(x, y); } catch (e) { return null; } }
  function respectAt(x, y) { try { return N.respect && N.respect.at ? N.respect.at(x, y) : null; } catch (e) { return null; } }
  function respectNear(x, y, r) { try { return N.respect && N.respect.near ? N.respect.near(x, y, r) : null; } catch (e) { return null; } }
  function calDate() {
    try { if (N.calendar && N.calendar.date) return N.calendar.date; } catch (e) { /* stub */ }
    const b = (N.clock && N.clock.baseDate) || [2003, 0, 14];
    const d = new Date(Date.UTC(b[0], b[1], b[2] + day()));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() };
  }
  function schoolDay() { try { if (N.calendar && N.calendar.isSchoolDay) return N.calendar.isSchoolDay(); } catch (e) { /* stub */ } return calDate().dow !== 0; }
  function flagOn(id) {
    const F = N.flags || {};
    if (F[id] || F.festival === id || (Array.isArray(F.festivals) && F.festivals.indexOf(id) >= 0)) return true;
    try { if (N.seasons && N.seasons.is && N.seasons.is(id)) return true; } catch (e) { /* stub */ }
    return false;
  }
  function itemCount(id) {
    const p = N.player;
    let n = 0;
    try { if (p.itemCount) n = p.itemCount(id); } catch (e) { /* ignore */ }
    if (!n && p.inventory && p.inventory.has && p.inventory.has(id)) n = 1;
    return n;
  }
  function useItem(id) {
    const p = N.player;
    if (p.itemCount && p.itemCount(id) > 0) { p.addItem(id, -1); return true; }
    if (p.inventory && p.inventory.has && p.inventory.has(id)) { p.inventory.delete(id); return true; }
    return false;
  }
  function advanceClock(gm) {
    const c = N.clock;
    if (!c || !(gm > 0)) return;
    c.minutes += gm;
    while (c.minutes >= 1440) { c.minutes -= 1440; if (c.nextDay) c.nextDay(); else c.day++; }
  }
  function money(delta, why) {
    const p = N.player;
    const before = p.money;
    p.money = Math.max(0, Math.round(p.money + delta));
    const d = p.money - before;
    if (d) N.emit('money', { delta: d, total: p.money, why });
    return d;
  }
  function homePos() {
    const h = N.places && N.places.home;
    if (h) return { x: h.x, y: h.y };
    const s = N.WORLD_DATA && N.WORLD_DATA.spawns && (N.WORLD_DATA.spawns.home || N.WORLD_DATA.spawns.player);
    return s ? { x: s[0], y: s[1] } : { x: N.player.x, y: N.player.y };
  }
  const isVeh = (e) => e.kind === 'vehicle';
  const ELDER = { aunty: 1, saree: 1, burqa: 1, uncle: 1, lungi: 1 };
  function elderly(q) {
    const L = q.look || {};
    return !!(ELDER[L.kind] || q.role === 'old' || q.role === 'elder' || q.role === 'aunty' || q.role === 'uncle' || L.hair === '#e8e4dc' || L.prop === 'stick');
  }

  /* ================================================================ state */
  const W = {
    heat: 0, level: 0, frozen: new Set(), locked: null, policyName: 'normal',
    seen: false, seenBy: null, unseenT: 0, lastSeenT: -99, lastSeen: null, seenAcc: 0, escT: 0,
    chaser: null, helpers: [], spotters: [], roadblock: null, chappal: null, chappalT: 4,
    seq: null, busyFlag: false, curfewFloor: 0, curfewHomeDay: -1, curfewToastLvl: 0, chittiTattledDay: -1,
    stats: { caught: 0, exhausted: 0, caughtByDay: {} }, bumpCD: new WeakMap(), underageCD: new WeakMap(), reportCD: new WeakMap(),
    seeT: 0, footT: 0, lastOut: null, gateT: 0, slipFx: null, peels: [], heatFrac: -1, blips: new Set(), now: 0, inRespect: false,
  };
  function allPursuers() {
    const out = [];
    if (W.chaser) out.push(W.chaser);
    for (const h of W.helpers) out.push(h);
    if (W.roadblock && W.roadblock.cop) out.push(W.roadblock.cop);
    return out;
  }

  /* ================================================================ heat / level */
  function frozenNow() { return W.frozen.size > 0 || W.inRespect; }
  function floorHeat() { return W.curfewFloor > 0 ? W.curfewFloor * 100 : 0; }
  function setHeat(h, reason) {
    if (W.locked != null) return;
    const prev = W.level;
    W.heat = clamp(h, floorHeat(), 599);
    const lvl = Math.min(5, Math.floor(W.heat / 100));
    if (lvl !== prev) levelChanged(prev, lvl, reason);
  }
  function levelChanged(prev, lvl, reason) {
    W.level = lvl;
    API.level = lvl;
    W.escT = 0;
    if (lvl > prev) { W.unseenT = 0; }
    N.emit('wanted', { level: lvl, prev, reason: reason || null });
    N.emit('wanted:change', { level: lvl, prev, reason: reason || null });
    if (lvl < prev && !W.seq) {
      if (lvl === 0) toast('Safe. For now.', 1800);
      else toast('*Bach gaya!*', 1500);
    }
    if (lvl === 0) { dismissAll(reason === 'busted' || reason === 'clear' || reason === 'barber'); }
    else syncPursuers(prev);
  }
  const MAJOR = new Set(['report', 'tattle', 'escalate', 'curfew', 'aunty network', 'mission']);
  const API = (N.wanted = {
    level: 0, TUNE,
    get heat() { return W.heat; },
    get seen() { return W.seen; },
    get unseenT() { return W.unseenT; },
    get chaser() { return W.chaser; },
    get spotters() { return W.spotters.slice(); },
    get pursuers() { return allPursuers(); },
    get inRespect() { return W.inRespect; },
    /** Pursuer road route from {x, y, angle} to (tx, ty) -> [[x, y], ...] (cached per node pair). */
    route(from, tx, ty) { return roadRoute(from, tx, ty); },
    routeStats() { return { calls: RC.calls, hits: RC.hits, fails: RC.fails, expanded: RC.expanded, cached: RC.cache.size }; },
    get stats() { return W.stats; },
    get busy() { return !!W.seq; },
    get locked() { return W.locked; },
    get policyName() { return W.policyName; },
    get curfewFloor() { return W.curfewFloor; },
    /** +levels (a major offence: borrowing an occupied vehicle, a rude choice, a story beat). */
    add(levels, reason) {
      if (W.locked != null || W.seq) return W.level;
      if (frozenNow() && reason !== 'mission' && reason !== 'force') return W.level;
      const n = levels == null ? 1 : +levels || 0;
      setHeat(Math.min(599, W.heat + 100 * n), reason || 'add');
      return W.level;
    },
    /** Minor heat (cannot lift the meter past level 2 on its own unless major). */
    addHeat(h, reason, opts) {
      if (W.locked != null || W.seq || !(h > 0)) return W.level;
      if (frozenNow() && !(opts && opts.force)) return W.level;
      const major = (opts && opts.major) || MAJOR.has(reason);
      let nh = W.heat + h;
      if (!major && nh > TUNE.minorCap) nh = Math.max(W.heat, TUNE.minorCap);
      setHeat(nh, reason || 'heat');
      return W.level;
    },
    set(level, reason) {
      if (W.locked != null && reason !== 'lock') return W.level;
      const l = clamp(level | 0, 0, 5);
      setHeat(l ? l * 100 + 50 : 0, reason || 'set');
      return W.level;
    },
    clear(reason) {
      if (W.locked != null) return 0;
      const keepFloor = W.curfewFloor;
      if (reason === 'barber' || reason === 'sleep' || reason === 'busted' || reason === 'home') W.curfewFloor = 0;
      setHeat(0, reason || 'clear');
      W.curfewFloor = W.curfewFloor || 0;
      void keepFloor;
      W.unseenT = 0; W.seen = false;
      return W.level;
    },
    coolDown(n, reason) { return API.set(Math.max(0, W.level - (n == null ? 1 : n)), reason || 'cooldown'); },
    freeze(on, reason) { const r = reason || 'script'; if (on) W.frozen.add(r); else W.frozen.delete(r); return frozenNow(); },
    frozen: frozenNow,
    lock(level) {
      if (level == null) { W.locked = null; return W.level; }
      W.locked = null;
      API.set(level, 'lock');
      W.locked = clamp(level | 0, 0, 5);
      return W.level;
    },
    policy(name, level) {
      W.policyName = name || 'normal';
      if (name === 'frozen') { W.frozen.add('mission'); API.lock(null); }
      else if (name === 'scripted') { W.frozen.delete('mission'); API.lock(level != null ? level : W.level); }
      else { W.frozen.delete('mission'); API.lock(null); }
      return W.policyName;
    },
    hide, haircut, bust: (by) => startBusted(by || (W.chaser && W.chaser.role) || 'amma'), exhaust: () => startWasted(),
    dropPeel, fine: () => Math.round(diff('caughtFine', TUNE.fine)),
    podiumOff(pod) { return !!(W.roadblock && W.roadblock.pod === pod); },
    serialize() {
      return { heat: W.heat, floor: W.curfewFloor, home: W.curfewHomeDay, stats: W.stats, chitti: W.chittiTattledDay };
    },
    deserialize(o) {
      dismissAll(true);
      W.seq = null; W.frozen.clear(); W.locked = null; W.policyName = 'normal';
      if (!o || typeof o !== 'object') { W.heat = 0; W.level = 0; API.level = 0; return; }
      const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
      W.curfewFloor = clamp(num(o.floor, 0) | 0, 0, 3);
      W.curfewHomeDay = num(o.home, -1);
      W.chittiTattledDay = num(o.chitti, -1);
      if (o.stats && typeof o.stats === 'object') W.stats = { caught: num(o.stats.caught, 0) | 0, exhausted: num(o.stats.exhausted, 0) | 0, caughtByDay: (o.stats.caughtByDay && typeof o.stats.caughtByDay === 'object') ? o.stats.caughtByDay : {} };
      W.heat = 0; W.level = 0; API.level = 0;
      setHeat(clamp(num(o.heat, 0), 0, 599), 'load');
    },
    // debug / tests
    _W: W,
  });

  /* ================================================================ pursuers */
  const LINES = {
    chitti: ['*Mummy ki cheppesta!*', 'Annayya is outside AGAIN!', 'Give me a Mango Bite or I\'m telling.', 'I saw. I SAW!'],
    chittiBribed: '...I saw nothing. Mango Bite is very good.',
    uncle: ['*Arre*, Sreenivas\'s boy! Does your Amma know?', 'I\'m going that way anyway. Towards your house.', '*Oye!* *Ruko!* Stop there!', 'Running in this heat? Wait till I tell Padma!', '*Abbabba!* Children these days!'],
    aunty: ['Kamala-garu\'s grandson! At this hour!', 'I\'ll just phone Padma. Just to say hello.', '*Ayyo*, look at his knees.', 'The whole colony knows in ten minutes, *beta*.'],
    bahadur: ['*Kaun hai?*', 'Chinnu baba! *Ghar jao!*', 'I am only a whistle. But I am a LOUD whistle.'],
    pochaiah: ['*Ruko!*', 'Three on one cycle? *Utro!*', 'Licence? ...You\'re eleven. *Utro* anyway.', 'I have one quiet day a year. Not today.'],
    pochaiahLuna: ['Stop the cycle! Stop the BOY!', 'My Luna is faster than your excuses!', 'Number plate? A cycle has no number plate? Then your FACE is the number plate!'],
    havaldar: ['*Ruko!* Traffic police!', 'Whistle means STOP, *beta*!', '*Idhar aao!*'],
    mummy: ['{FULL}!', '*Intiki raa!* NOW!', 'Wait till your Nanna hears!', 'One more step and this chappal flies!', '*Ekkada?* EKKADA?!'],
    mummyNight: ['Sreenivas, faster!', '{FULL}! In your banyan, at this hour!', '*Intiki raa!* NOW!'],
    yadagiri: ['Sorry, {nick}! Full meter! FULL meter!', 'Aunty, left or right? ...Okay, straight, through the cows.'],
    nanna: ['Padma, it\'s a Chetak, not a rocket.'],
    roof: ['*Neeche aao!* Come down!', 'I can wait. I have ALL day.', 'Whose terrace is that? I\'m telling them also!', 'You have to come down sometime, {nick}!'],
    escaped: { pochaiah: '*Hai*, my knees...', pochaiahLuna: 'Luna, you have betrayed me.', uncle: 'Fine, fine. I\'ll tell her tomorrow.', chitti: 'I\'m TELLING anyway!', havaldar: 'Next time, *beta*.', mummy: 'You have to come home sometime!' },
  };
  const BUSTED_LINES = {
    amma: ['Two rupees cut from pocket money. And no TV.', 'Do you know how many aunties called me today? FOUR.', 'Sit. Homework. Now. With the door open.', '*{FULL}.* Look at me. ...Fine. Eat first. Then scolding.', 'You want to roam the city? Roam the kitchen. Peel these peas.'],
    pochaiah: ['First and last warning. Next time I tell your Nanna. ...He\'s my friend, you know.'],
    ammi: ['Imran\'s friend means Imran\'s punishment also. Sit there.'],
    nanna: ['Your Amma is angry. I am also angry. Officially.'],
    ammamma: ['Let him go, Padma. ...After the peas.'],
    chitti: ['I TOLD you I\'d tell.'],
  };
  const WASTED_LINES = {
    self: ['*Thak gaya...* Legs have gone on strike.', 'Water... chai... Osmania... in that order.', 'Even the cow is walking faster than me.', 'Note to self: running is for the movies.', 'My chappal is tired. I am more tired.'],
    salim: ['*Arre*, sit, sit. Glucose water, one rupee. Then chai.'],
    waiter: ['Two hours you\'ll sit for one chai? ...Okay, for you, one hour.', '*Arre*, sit, sit. Glucose water, one rupee. Then chai.'],
    amma: ['Come, eat. ...First this glass of Horlicks. All of it.', '*Intiki vachava?* Horlicks first, questions later.'],
  };
  function npcLook(id, fallback) {
    let L = null;
    try { if (N.npcs && N.npcs.look) L = N.npcs.look(id); } catch (e) { /* stub */ }
    L = Object.assign({}, L || fallback || { kind: 'man' });
    if (!L.cast) L.cast = 'wanted';
    return L;
  }
  const FALLBACK = {
    chitti: { kind: 'kid', girl: true, skin: '#b97a4f', hair: '#1a1412', shirt: '#e88aa8', pants: '#e88aa8', ponytails: '#d8202a', cast: 1 },
    pochaiah: { kind: 'man', skin: '#7a4a30', hair: '#1a1412', shirt: '#f4f2ea', pants: '#a89060', cap: 'police', belly: true, cast: 1 },
    amma: { kind: 'aunty', skin: '#a0683f', hair: '#1a1412', saree: '#3b7d4f', border: '#7a1f2b', blouse: '#7a1f2b', cast: 1 },
    bahadur: { kind: 'man', skin: '#d29a6a', hair: '#1a1412', shirt: '#8a7a4a', pants: '#4a4a3a', hat: 'dhaka', hatColor: '#1d1a1e', prop: 'stick', cast: 1 },
    nanna: { kind: 'man', skin: '#9a6040', hair: '#1a1412', shirt: '#a9c4e0', pants: '#5a5f66', cast: 1 },
    yadagiri: { kind: 'man', skin: '#7a4a30', hair: '#1a1412', shirt: '#a08a5a', pants: '#a08a5a', towel: '#c03030', cast: 1 },
  };
  function uncleLook() {
    if (N.traffic && N.traffic.makeLook) {
      const L = N.traffic.makeLook(rnd() < 0.5 ? 'lungi' : 'uncle', 'colony').look;
      L.cast = 'wanted';
      return L;
    }
    return { kind: 'uncle', skin: '#9a6040', hair: '#8a8680', lungi: '#2a5cb8', towel: '#efe6d0', cast: 1 };
  }
  function havaldarLook() { return { kind: 'man', skin: pick(['#7a4a30', '#9a6040', '#a0683f']), hair: '#1a1412', shirt: '#f4f2ea', pants: '#a89060', cap: 'police', cast: 'wanted' }; }

  class Pursuer extends N.Actor {
    constructor(role, x, y, o) {
      super({ kind: 'npc', x, y, r: 3.4, mass: 0.8, solid: true }); // light: Chinnu can squeeze past
      o = o || {};
      this.pursuer = true; this.role = role; this.speaker = o.speaker || null; this.look = o.look;
      this.anim = { phase: rnd() * TAU, speed: 0, run: false };
      this.state = 'chase'; this.target = null; this.path = null; this.pi = 0; this.planT = 0; this.goal = null;
      this.seeR = o.seeR || 180; this.runSpd = o.speed || 64; this.walkSpd = o.walk || 42;
      this.canCatch = !!o.canCatch; this.barkT = rr(0.5, 2); this.whT = rr(0.5, 2); this.slipT = 0; this.stopT = 0;
      this.seeing = false; this.tattleAcc = 0; this.seenAcc = 0; this.searchT = 0; this.spiralA = 0; this.mount = null;
      this.angle = 0; this.emote = null; this.emoteT = 0; this.leaveT = 0; this.footT = 0; this.boxT = 0;
      this.bark = o.lines || null; this.id2 = role + ':' + this.id;
      this._fn = (ctx) => drawPursuer(ctx, this);
      this._skyFn = (ctx) => drawPursuerSky(ctx, this);
    }
    update() { /* driven by the wanted system (it only moves in play, never while frozen) */ }
    draw() {
      if (this.vehicle || this.hidden) { if (this.emoteT > 0) N.render.queue('sky', 2, this._skyFn); return; }
      N.render.queue('actors', this.y, this._fn);
      N.render.queue('sky', 2, this._skyFn);
    }
  }
  function drawPursuer(ctx, a) {
    const D = N.draw;
    const slip = a.slipT > 0;
    D.sprite(a.x, a.y, slip ? a.angle + Math.PI / 2 : a.angle, slip ? 2 : 8, (g) => N.people.draw(g, a.look, slip ? { phase: 0, speed: 0 } : a.anim));
  }
  function drawPursuerSky(ctx, a) {
    const R = N.render;
    if (a.emoteT <= 0 || !a.emote) return;
    const k = R.k(18), X = Math.round(R.sx(a.x, k)), Y = Math.round(R.sy(a.y, k)) - 8;
    const bob = Math.round(Math.sin((N.time.real || 0) * 8));
    ctx.fillStyle = '#1a1214'; ctx.fillRect(X - 4, Y - 6 + bob, 8, 10);
    ctx.fillStyle = a.emote === '!' ? '#ff4a3a' : '#f2c230';
    if (a.emote === '!') { ctx.fillRect(X - 1, Y - 5 + bob, 2, 5); ctx.fillRect(X - 1, Y + 1 + bob, 2, 2); }
    else { ctx.fillRect(X - 2, Y - 5 + bob, 4, 1); ctx.fillRect(X + 1, Y - 4 + bob, 1, 2); ctx.fillRect(X - 1, Y - 2 + bob, 2, 1); ctx.fillRect(X - 1, Y + 1 + bob, 2, 2); }
  }
  function emote(a, e, secs) { a.emote = e; a.emoteT = secs || 1.4; }

  /* ---------------------------------------------------------------- spawning */
  function spawnSpot(dist, opts) {
    opts = opts || {};
    const p = N.player;
    const T = N.traffic;
    const from = opts.from || p;
    let best = null;
    // a road node at about `dist` out of view (from a direction, e.g. home, when given)
    if (T && T.index && T.index.built) {
      for (let k = 0; k < 14 && !best; k++) {
        let n;
        if (opts.dir) {
          const a = Math.atan2(opts.dir.y - p.y, opts.dir.x - p.x) + rr(-0.6, 0.6), d = dist * rr(0.85, 1.15);
          const ns = T.nodesNear(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 120);
          n = ns.length ? pick(ns) : null;
        } else n = T.ringNode(from.x, from.y, dist * 0.8, dist * 1.2);
        if (!n) continue;
        if (N.render.inView(n.x, n.y, 40)) continue;
        if (respectNear(n.x, n.y, TUNE.respectBuffer)) continue;
        if (!N.world.isWalkable(n.x, n.y)) continue;
        best = { x: n.x, y: n.y, node: n };
      }
    }
    if (!best) {
      for (let k = 0; k < 24 && !best; k++) {
        const a = rnd() * TAU, d = dist * rr(0.8, 1.2);
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (N.render.inView(x, y, 40) || !N.world.isWalkable(x, y)) continue;
        const f = N.world.findFree(x, y, 'walk', 10);
        if (f) best = f;
      }
    }
    return best;
  }
  function addPursuer(role, spot, o) {
    const a = new Pursuer(role, spot.x, spot.y, o);
    a.angle = Math.atan2(N.player.y - spot.y, N.player.x - spot.x);
    N.entities.add(a);
    if (N.hud && N.hud.blip) {
      try { N.hud.blip('wanted:' + a.id, a, { color: o && o.spotter ? '#ffb020' : '#ff4a3a', icon: o && o.spotter ? 'dot' : 'diamond', label: o && o.label || role, edge: !(o && o.spotter), size: 4 }); W.blips.add('wanted:' + a.id); } catch (e) { /* hud optional */ }
    }
    N.emit('wanted:pursuer', { role, actor: a });
    return a;
  }
  function removePursuer(a) {
    if (!a) return;
    if (a.mount) { try { if (a.vehicle) N.vehicles.alight(a, true); } catch (e) { /* ignore */ } try { N.vehicles.remove(a.mount); } catch (e) { a.mount.alive = false; } a.mount = null; }
    if (a.passengerOf) { a.passengerOf = null; }
    N.entities.remove(a);
    if (N.hud && N.hud.unblip) { N.hud.unblip('wanted:' + a.id); W.blips.delete('wanted:' + a.id); }
  }
  /** Send a pursuer away: "escaped" line, walk off, despawn when out of view and far. */
  function dismiss(a, quiet) {
    if (!a || a.state === 'leave') return;
    a.state = 'leave'; a.leaveT = 0; a.canCatch = false;
    if (N.hud && N.hud.unblip) { N.hud.unblip('wanted:' + a.id); W.blips.delete('wanted:' + a.id); }
    if (!quiet) {
      const key = a.role === 'pochaiah' && a.mount ? 'pochaiahLuna' : a.role;
      const line = LINES.escaped[key];
      if (line && N.render.inView(a.x, a.y, 20)) bark(a, line, a.speaker);
    }
    W.leaving.push(a);
  }
  W.leaving = [];
  function dismissAll(quiet) {
    if (W.chaser) { dismiss(W.chaser, quiet); W.chaser = null; }
    for (const h of W.helpers) dismiss(h, quiet);
    W.helpers = [];
    clearRoadblock(quiet);
    clearSpotters();
    W.chappal = null;
    if (quiet) { for (const a of W.leaving) removePursuer(a); W.leaving = []; }
  }
  /** Make the cast match the level (systems §4.4). */
  function syncPursuers(prev) {
    if (!N.world || !N.world.built || N.state.mode === 'title') return;
    const lvl = W.level, ch = W.chaser;
    const role = ch ? ch.role : null;
    const want = chaserRoleFor(lvl);
    // the level rose past the chaser (or fell below it): it says its line and leaves
    if (ch && !roleOk(role, lvl, want)) { dismiss(ch); W.chaser = null; }
    if (!W.chaser && want) spawnChaser(want);
    // helpers: a second uncle at level 2 (day), a second havaldar at level 4
    const wantHelper = lvl === 2 && !night() && W.chaser && W.chaser.role !== 'chitti' ? 'uncle' : lvl === 4 ? 'havaldar' : null;
    for (const h of W.helpers.slice()) if (h.role !== wantHelper) { dismiss(h); W.helpers.splice(W.helpers.indexOf(h), 1); }
    if (wantHelper && !W.helpers.length) spawnHelper(wantHelper);
    if (lvl === 4) setRoadblock(); else clearRoadblock();
    if (lvl < 2) clearSpotters();
    void prev;
  }
  function roleOk(role, lvl, want) {
    if (lvl <= 2) return role === 'chitti' || role === 'uncle';
    return role === want;
  }
  function chaserRoleFor(lvl) {
    if (lvl <= 0) return null;
    if (lvl <= 2) return chittiOk() ? 'chitti' : 'uncle';
    if (lvl <= 4) return 'pochaiah';
    return 'mummy';
  }
  function chittiOk() {
    if (W.chittiTattledDay === day()) return false;
    const p = N.player, d = districtAt(p.x, p.y);
    if (!d || TUNE.chittiDistricts.indexOf(d.id) < 0) return false;
    const m = mins();
    if (!inHours(TUNE.chittiHours, m)) return false;
    if (schoolDay() && inHours(TUNE.schoolHours, m)) return false;
    return true;
  }
  function spawnChaser(role) {
    const dist = TUNE.spawnDist[Math.max(1, Math.min(5, W.level))] || 300;
    const sp = diff('pursuerSpeed', 1);
    let a = null;
    if (role === 'chitti') {
      const spot = spawnSpot(dist, { dir: homePos() });
      if (!spot) return;
      a = addPursuer('chitti', spot, { look: npcLook('chitti', FALLBACK.chitti), speaker: 'chitti', seeR: TUNE.sight.chitti, speed: TUNE.speed.chitti * sp, walk: TUNE.speed.chittiWalk * sp, label: 'Chitti' });
    } else if (role === 'uncle') {
      const spot = spawnSpot(dist);
      if (!spot) return;
      a = addPursuer('uncle', spot, { look: uncleLook(), seeR: TUNE.sight.uncle, speed: TUNE.speed.uncle * sp, walk: 44 * sp, label: 'Colony uncle' });
      if (N.player.vehicle) mountUp(a, 'cycle', TUNE.speed.uncleCycle * sp);
    } else if (role === 'pochaiah') {
      // from the nearest podium junction if there is one close by (on foot), else he rides in on the Luna
      const p = N.player;
      let spot = null;
      for (const pod of (N.world.podiums || [])) {
        const d = Math.hypot(pod.x - p.x, pod.y - p.y);
        if (d < 350 && d > 120 && !N.render.inView(pod.x, pod.y, 30) && (!spot || d < spot.d)) spot = { x: pod.x, y: pod.y, d };
      }
      const onLuna = W.level >= 4 || !spot;
      if (!spot) spot = spawnSpot(dist);
      if (!spot) return;
      a = addPursuer('pochaiah', spot, { look: npcLook('pochaiah', FALLBACK.pochaiah), speaker: 'pochaiah', seeR: TUNE.sight.pochaiah, speed: TUNE.speed.pochaiah * sp, walk: 50 * sp, canCatch: true, label: 'Pochaiah' });
      if (onLuna) mountUp(a, N.vehicles.TYPES.pochaiah_luna ? 'pochaiah_luna' : 'luna', TUNE.speed.luna * sp);
      // the npcs.js podium Pochaiah steps off his podium while this one chases
      hideNpc('pochaiah', true);
    } else if (role === 'mummy') {
      const spot = spawnSpot(dist);
      if (!spot) return;
      const isNight = !inHours(TUNE.mummyDay);
      a = addPursuer('mummy', spot, { look: Object.assign(npcLook('amma', FALLBACK.amma), { prop: 'chappal' }), speaker: 'amma', seeR: isNight ? TUNE.sight.mummyNight : TUNE.sight.mummy, speed: TUNE.speed.mummy * sp, walk: 50 * sp, canCatch: true, label: 'MUMMY' });
      a.nightRide = isNight;
      if (isNight) {
        mountUp(a, N.vehicles.TYPES.family_chetak ? 'family_chetak' : 'chetak', TUNE.speed.chetak * sp, { driverLook: npcLook('nanna', FALLBACK.nanna), driverId: 'nanna', pillion: true });
      } else {
        mountUp(a, N.vehicles.TYPES.yadagiri_auto ? 'yadagiri_auto' : 'auto', TUNE.speed.auto * sp, { driverLook: npcLook('yadagiri', FALLBACK.yadagiri), driverId: 'yadagiri', passenger: true });
      }
      W.chappalT = 3;
    }
    if (!a) return;
    W.chaser = a;
    a.target = { x: N.player.x, y: N.player.y };
    a.state = 'chase';
  }
  function spawnHelper(role) {
    const sp = diff('pursuerSpeed', 1);
    let spot = null;
    if (role === 'havaldar') {
      const p = N.player;
      for (const pod of (N.world.podiums || [])) {
        const d = Math.hypot(pod.x - p.x, pod.y - p.y);
        if (d < 400 && !N.render.inView(pod.x, pod.y, 30) && (!spot || d < spot.d)) spot = { x: pod.x, y: pod.y, d };
      }
    }
    if (!spot) spot = spawnSpot(TUNE.spawnDist[Math.min(5, Math.max(1, W.level))] || 300);
    if (!spot) return;
    const a = role === 'havaldar'
      ? addPursuer('havaldar', spot, { look: havaldarLook(), seeR: TUNE.sight.havaldar, speed: TUNE.speed.havaldar * sp, walk: 48 * sp, canCatch: true, label: 'Havaldar' })
      : addPursuer('uncle', spot, { look: uncleLook(), seeR: TUNE.sight.uncle, speed: TUNE.speed.uncle * sp, walk: 44 * sp, label: 'Another uncle' });
    a.target = { x: N.player.x, y: N.player.y };
    W.helpers.push(a);
  }
  function hideNpc(id, on) {
    try {
      const n = N.npcs && N.npcs.get && N.npcs.get(id);
      if (n) { if (on) { n._wantedHidden = !n.hidden; n.hidden = true; } else if (n._wantedHidden) { n.hidden = false; n._wantedHidden = false; } }
    } catch (e) { /* stub */ }
  }
  /** Put a pursuer on a vehicle (its own controller drives it along the roads after Chinnu). */
  function mountUp(a, type, speed, o) {
    o = o || {};
    const V = N.vehicles;
    if (!V || !V.spawn || !V.TYPES[type]) return null;
    const v = V.spawn(type, a.x, a.y, a.angle, { driver: o.driverLook ? { look: o.driverLook, npc: true } : null, noEnter: true, locked: true });
    if (!v) return null;
    v.noEnter = true; v.npcOwned = true; v.pursuitVehicle = true;
    v.pu = { actor: a, speed, path: null, pi: 1, planT: 0, goal: null, stuck: 0, chk: 1, cx: v.x, cy: v.y, rev: 0 };
    if (o.passenger || o.pillion) {
      // Mummy rides along (in the auto behind Yadagiri, or pillion behind Nanna)
      a.passengerOf = v; a.hidden = true; a.noCollide = true; a.driverSpeaker = o.driverId;
      if (o.pillion && V.setPillion) V.setPillion(v, a.look);
    } else {
      try { if (V.board) V.board(a, v); else V.enter(a, v); } catch (e) { N.err('wanted.mount', e); }
    }
    v.controller = pursuitCtl; // (vehicles.enter clears it)
    a.mount = v;
    return v;
  }
  function dismount(a) {
    const v = a.mount;
    if (!v) return false;
    if (a.passengerOf) {
      const s = N.vehicles.exitSpot ? N.vehicles.exitSpot(v, 'walk') : null;
      if (!s) return false;
      a.x = s.x; a.y = s.y; a.hidden = false; a.noCollide = false; a.passengerOf = null; a.onFootT = 0;
      if (N.vehicles.setPillion && v.pillion) N.vehicles.setPillion(v, null);
      return true;
    }
    try { if (a.vehicle) { if (!N.vehicles.alight(a)) return false; } } catch (e) { return false; }
    v.controller = parkCtl;
    a.onFootT = 0;
    return true;
  }
  function parkCtl(v) { v.ctl.throttle = 0; v.ctl.steer = 0; v.ctl.brake = true; v.ctl.handbrake = false; }
  function remount(a) {
    const v = a.mount;
    if (!v || !v.alive) return false;
    if (Math.hypot(v.x - a.x, v.y - a.y) > 22) return false;
    if (a.role === 'mummy') {
      a.passengerOf = v; a.hidden = true; a.noCollide = true;
      if (a.nightRide && N.vehicles.setPillion) N.vehicles.setPillion(v, a.look);
      return true;
    }
    let ok = false;
    try { ok = N.vehicles.board ? N.vehicles.board(a, v) : N.vehicles.enter(a, v); } catch (e) { ok = false; }
    if (ok) { v.controller = pursuitCtl; v.pu.path = null; }
    return ok;
  }
  const mounted = (a) => !!(a.mount && (a.vehicle === a.mount || a.passengerOf === a.mount));

  /* ---------------------------------------------------------------- the roadblock (level 4) */
  function setRoadblock() {
    if (W.roadblock) return;
    const p = N.player, R = N.world.roads;
    if (!R || !N.vehicles.TYPES.rickshaw && !N.vehicles.TYPES.cycle) return;
    // a road point ahead of Chinnu (where he is heading), out of view
    const sp = Math.hypot(p.vx || 0, p.vy || 0);
    const ang = sp > 10 ? Math.atan2(p.vy, p.vx) : (p.angle || 0);
    let rp = null;
    for (const d of [300, 360, 260, 420]) {
      const q = N.world.nearestRoadPoint(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, (r) => r.kind !== 'path' && r.kind !== 'bridge');
      if (q && q.dist < 80 && !N.render.inView(q.x, q.y, 30) && !respectNear(q.x, q.y, TUNE.respectBuffer)) { rp = q; break; }
    }
    if (!rp) return;
    const type = N.vehicles.TYPES.rickshaw ? 'rickshaw' : 'cycle';
    const v = N.vehicles.spawn(type, rp.x, rp.y, rp.angle + Math.PI / 2, { noEnter: true, locked: true });
    if (!v) return;
    v.noEnter = true; v.npcOwned = true; v.roadblock = true;
    const side = { x: rp.x + Math.cos(rp.angle) * 16, y: rp.y + Math.sin(rp.angle) * 16 };
    const f = N.world.findFree(side.x, side.y, 'walk', 10) || side;
    const cop = addPursuer('havaldar', f, { look: havaldarLook(), seeR: TUNE.sight.constable, speed: TUNE.speed.havaldar * diff('pursuerSpeed', 1), walk: 40, canCatch: true, label: 'Roadblock' });
    cop.guard = { x: f.x, y: f.y, r: 70 };
    W.roadblock = { v, cop, x: rp.x, y: rp.y };
  }
  function clearRoadblock(quiet) {
    const rb = W.roadblock;
    if (!rb) return;
    W.roadblock = null;
    if (rb.cop) dismiss(rb.cop, quiet);
    rb.fadeV = rb.v;
    W.rbGone.push(rb.v);
  }
  W.rbGone = [];

  /* ---------------------------------------------------------------- spotters (level >= 2) */
  function clearSpotters() {
    for (const s of W.spotters) {
      if (s.amb) { s.spotter = null; if (s._lookBefore) { s.look = s._lookBefore; s._lookBefore = null; } }
      else if (s.wantedSpotter) removePursuer(s);
    }
    W.spotters = [];
    if (W.bahadur) { dismiss(W.bahadur, true); W.bahadur = null; }
  }
  function updateSpotters(dt) {
    const lvl = W.level, p = N.player, m = mins();
    if (lvl < 2) { if (W.spotters.length || W.bahadur) clearSpotters(); return; }
    W.spotT = (W.spotT || 0) - dt;
    if (W.spotT > 0) return;
    W.spotT = 1;
    // drop spotters that are gone or far
    W.spotters = W.spotters.filter((s) => {
      const keep = s.alive && Math.hypot(s.x - p.x, s.y - p.y) < TUNE.report.r * 1.3;
      if (!keep && s.amb) { s.spotter = null; if (s._lookBefore) { s.look = s._lookBefore; s._lookBefore = null; } }
      return keep;
    });
    // the aunties' phone tree, by day
    if (inHours(TUNE.auntyHours, m) && N.traffic && W.spotters.length < TUNE.report.max) {
      const cands = (N.traffic.peds || []).filter((q) => q.alive && !q.down && !q.spotter && (q.role === 'aunty' || q.role === 'woman' || (q.look && (q.look.kind === 'aunty' || q.look.kind === 'saree'))) && Math.hypot(q.x - p.x, q.y - p.y) < TUNE.report.r);
      cands.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      for (const q of cands) {
        if (W.spotters.length >= TUNE.report.max) break;
        const stick = !W.spotters.some((s) => s.spotter && s.spotter.stick);
        q.spotter = { stick };
        if (stick) { q._lookBefore = q.look; q.look = Object.assign({}, q.look, { prop: 'stick', cast: q.look.cast || 'wanted' }); }
        W.spotters.push(q);
      }
    }
    // Bahadur the Gurkha, at night in the colonies
    const d = districtAt(p.x, p.y);
    const colony = d && TUNE.bahadurStyles.indexOf(d.style) >= 0;
    if (inHours(TUNE.bahadurHours, m) && colony && !W.bahadur) {
      const spot = spawnSpot(260);
      if (spot) {
        const b = addPursuer('bahadur', spot, { look: npcLook('bahadur', FALLBACK.bahadur), speaker: 'bahadur', seeR: TUNE.sight.bahadur, speed: 52, walk: TUNE.speed.bahadur, spotter: true, label: 'Bahadur' });
        b.isSpotter = true; b.torch = true; b.target = W.lastSeen ? { x: W.lastSeen.x, y: W.lastSeen.y } : { x: p.x, y: p.y };
        W.bahadur = b;
      }
    } else if (W.bahadur && (!inHours(TUNE.bahadurHours, m) || !colony)) { dismiss(W.bahadur, false); W.bahadur = null; }
  }

  /* ================================================================ sight */
  function playerHidden() {
    const p = N.player;
    if (p.hidden || p.level || W.hideT > 0) return true;
    if (W.inRespect) return true;
    // riding inside a city bus as a passenger (levels 1-3)
    if (p.vehicle && p.vehicle.type === 'bus' && p.vehicle.driver !== p && W.level <= 3) return true;
    return false;
  }
  function inCrowd(x, y) { try { return !!(N.traffic && N.traffic.inCrowd && N.traffic.inCrowd(x, y)); } catch (e) { return false; } }
  function canSee(a, sightR) {
    const p = N.player;
    const ax = a.mount && mounted(a) ? a.mount.x : a.x, ay = a.mount && mounted(a) ? a.mount.y : a.y;
    let r = sightR * diff('sight', 1);
    if (night() && a.role !== 'mummy' && !a.torch) r *= TUNE.nightSight;
    if (inCrowd(p.x, p.y)) r *= TUNE.crowdSight;
    const d = Math.hypot(p.x - ax, p.y - ay);
    if (a.torch && night()) {
      const da = Math.abs(U.angleDiff(a.angle, Math.atan2(p.y - ay, p.x - ax)));
      r = da < Math.PI / 6 ? TUNE.sight.torch : TUNE.sight.bahadur * TUNE.nightSight;
    }
    if (d > r) return false;
    if (d < 14) return true;
    try { return !N.world.raycast(ax, ay, p.x, p.y, 'walk').hit; } catch (e) { return false; }
  }
  function sightPass() {
    const p = N.player;
    const hidden = playerHidden();
    let seenBy = null;
    const list = allPursuers();
    if (W.bahadur) list.push(W.bahadur);
    for (const a of list) {
      if (a.state === 'leave') continue;
      const was = a.seeing;
      a.seeing = !hidden && canSee(a, a.seeR);
      if (a.seeing && !was) { emote(a, '!', 1.2); if (a === W.chaser || a.isSpotter) N.emit('wanted:seen', { by: a.role }); }
      if (a.seeing) { a.target = { x: p.x, y: p.y }; a.lastSeenAt = W.now; seenBy = seenBy || a; }
    }
    // ambient spotters + podium constables report (+40 after 1.5 s of looking)
    const spot = W.spotters.slice();
    if (W.bahadur) spot.push(W.bahadur);
    if (W.level >= 2 && inHours(TUNE.podiumHours) && N.traffic && N.traffic.constables) for (const c of N.traffic.constables) spot.push(c);
    for (const s of spot) {
      if (!s.alive) continue;
      const r = s.constable ? TUNE.sight.constable : s === W.bahadur ? TUNE.sight.bahadur : TUNE.sight.aunty * (schoolDay() && inHours(TUNE.schoolHours) ? 1.25 : 1);
      const sees = !hidden && canSee(s, r);
      if (!sees) continue;
      seenBy = seenBy || s;
      const cd = W.reportCD.get(s) || 0;
      if (cd > W.now) continue;
      s.reportAcc = (s.reportAcc || 0) + TUNE.seeEvery;
      if (s.reportAcc >= TUNE.report.secs && W.now - (W.lastReport || -99) >= TUNE.report.gap) {
        s.reportAcc = 0; W.reportCD.set(s, W.now + TUNE.report.cooldown); W.lastReport = W.now;
        // reports take the meter from 2 to 3 (the phone tree reaches Pochaiah); above that they only point the way
        if (W.level < 3) API.addHeat(Math.min(TUNE.heat.report, 399 - W.heat), 'report', { major: true });
        for (const a of allPursuers()) if (a.state !== 'leave') a.target = { x: N.player.x, y: N.player.y };
        N.emit('wanted:report', { by: s.constable ? 'constable' : s === W.bahadur ? 'bahadur' : 'aunty' });
        if (s === W.bahadur) { sfx('gurkha', { x: s.x, y: s.y }); bark(s, pick(LINES.bahadur), 'bahadur'); }
        else if (s.constable) { sfx('whistle', { x: s.x, y: s.y }); if (W.level < 3) bark(s, pick(['*Hallu!*', 'Licence *dikhao!*', 'Side, side! Stop!']), null); }
        else if (W.level < 3) bark(s, pick(LINES.aunty), null);
      }
    }
    // under-age driving seen by a podium constable (+40, once per constable a minute; minor heat)
    const pv = p.vehicle;
    if (pv && pv.driver === p && !pv.T.pedal && inHours(TUNE.podiumHours) && N.traffic && N.traffic.constables && !hidden) {
      const ok = pv.owned || (pv.special === 'family' && N.vehicles.unlocked && N.vehicles.unlocked('chetak', 30));
      if (!ok) for (const c of N.traffic.constables) {
        if (!c.alive || Math.hypot(c.x - p.x, c.y - p.y) > TUNE.sight.constable) continue;
        if ((W.underageCD.get(c) || 0) > W.now) continue;
        if (N.world.raycast(c.x, c.y, p.x, p.y, 'walk').hit) continue;
        W.underageCD.set(c, W.now + TUNE.underageCooldown);
        API.addHeat(TUNE.heat.underage, 'underage');
        sfx('whistle', { x: c.x, y: c.y });
        bark(c, 'Licence *dikhao!*', null);
      }
    }
    W.seen = !!seenBy;
    W.seenBy = seenBy;
    if (seenBy) { W.lastSeen = { x: p.x, y: p.y }; W.lastSeenT = W.now; }
  }

  /* ================================================================ pursuer movement */
  function moveOnFoot(a, tx, ty, speed, dt) {
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    if (d < 1.5) { a.vx *= 0.7; a.vy *= 0.7; a.anim.speed = 0; return d; }
    // keep 40 u away from respect zones (never path through them)
    let gx = tx, gy = ty;
    // path planning when the straight line is blocked
    a.planT -= dt;
    let direct = false;
    try { direct = !N.world.raycast(a.x, a.y, tx, ty, 'walk').hit; } catch (e) { direct = true; }
    if (!direct) {
      if (!a.path || a.planT <= 0 || !a.goal || Math.hypot(a.goal.x - tx, a.goal.y - ty) > 30) {
        a.planT = 1.0 + rnd() * 0.3; a.goal = { x: tx, y: ty }; a.pi = 0;
        try { a.path = N.npcs && N.npcs.planPath ? N.npcs.planPath(a.x, a.y, tx, ty) : null; } catch (e) { a.path = null; }
      }
      if (a.path && a.path.length) {
        while (a.pi < a.path.length - 1 && Math.hypot(a.path[a.pi].x - a.x, a.path[a.pi].y - a.y) < 6) a.pi++;
        gx = a.path[a.pi].x; gy = a.path[a.pi].y;
      }
    } else a.path = null;
    const ex = gx - a.x, ey = gy - a.y, ed = Math.hypot(ex, ey) || 1;
    let vx = (ex / ed) * speed, vy = (ey / ed) * speed;
    // never into a temple / mosque / church compound or its forecourt; while Chinnu is inside one,
    // not closer than 40 u to it (they wait there, arms folded)
    const nx = a.x + vx * dt * 4, ny = a.y + vy * dt * 4;
    if (respectAt(nx, ny) && !respectAt(a.x, a.y)) { vx = 0; vy = 0; }
    else if (W.inRespect) {
      const rz = respectNear(nx, ny, TUNE.respectBuffer);
      if (rz && rz.d < TUNE.respectBuffer) { const cur = respectNear(a.x, a.y, TUNE.respectBuffer + 6); if (!cur || rz.d < cur.d) { vx = 0; vy = 0; } }
    }
    const k = 1 - Math.exp(-dt * 10);
    a.vx += (vx - a.vx) * k; a.vy += (vy - a.vy) * k;
    const c = N.world.collide(a.x + a.vx * dt, a.y + a.vy * dt, a.r, 'walk');
    if (!c.bad) {
      if (c.hit) { const dot = a.vx * c.nx + a.vy * c.ny; if (dot < 0) { a.vx -= dot * c.nx; a.vy -= dot * c.ny; } }
      a.x = c.x; a.y = c.y;
    }
    const sp = Math.hypot(a.vx, a.vy);
    if (sp > 3) a.angle += U.angleDiff(a.angle, Math.atan2(a.vy, a.vx)) * Math.min(1, dt * 12);
    a.anim.speed = Math.min(1, sp / 45); a.anim.run = sp > 55; a.anim.phase += sp * dt * (a.anim.run ? 0.2 : 0.26);
    return d;
  }
  /** Road route for a pursuer vehicle: from a node ahead of it (no U-turns on replans) to the node nearest
   *  the target, by N.world.roads.route (heap A* sized for the whole city) ignoring one-ways (Pochaiah knows
   *  every short cut). Node-pair results are cached for TUNE.route.ttl s, shared by every pursuer. -> [[x, y], ...] */
  const RC = { cache: new Map(), calls: 0, hits: 0, fails: 0, expanded: 0 };
  function roadRoute(v, tx, ty) {
    const R = N.world.roads;
    if (!R || !R.nodes || !R.nodes.length || !R.route) return [[v.x, v.y], [tx, ty]];
    const nodes = R.nodes;
    const hx = Math.cos(v.angle || 0), hy = Math.sin(v.angle || 0);
    let a = null, best = Infinity;
    const near = N.traffic && N.traffic.nodesNear ? N.traffic.nodesNear(v.x, v.y, 180) : [];
    for (const n of near) {
      if (!n.inc.length) continue;
      const dx = n.x - v.x, dy = n.y - v.y, d = Math.hypot(dx, dy);
      const behind = (dx * hx + dy * hy) < -4 ? 220 : 0;
      const sc = d + behind;
      if (sc < best) { best = sc; a = n; }
    }
    if (!a) a = R.nearestNode(v.x, v.y);
    const b = R.nearestNode(tx, ty);
    if (!a || !b) return [[v.x, v.y], [tx, ty]];
    RC.calls++;
    const key = a.id + '>' + b.id, now = W.now;
    let hit = RC.cache.get(key);
    if (hit && now - hit.t > TUNE.route.ttl) { RC.cache.delete(key); hit = null; }
    let ids;
    if (hit) { RC.hits++; ids = hit.ids; }
    else {
      const list = R.route(a, b, ROUTE_OPTS);
      const st = R.routeStats ? R.routeStats() : null;
      if (st) RC.expanded = st.expanded;
      ids = list ? list.map((n) => n.id) : null;
      if (!ids) RC.fails++;
      if (RC.cache.size >= TUNE.route.cacheMax) RC.cache.delete(RC.cache.keys().next().value);
      RC.cache.set(key, { t: now, ids });
    }
    const pts = [[v.x, v.y]];
    if (ids) for (const id of ids) pts.push([nodes[id].x, nodes[id].y]);
    pts.push([tx, ty]);
    return pts;
  }
  // every incident edge (one-ways ignored), no dirt paths, lanes cost x1.15; the whole city fits in the budget
  const ROUTE_OPTS = { walk: true, costs: { lane: 1.15 }, maxExpand: 24000 };
  function pursuitCtl(v, dt) {
    const pu = v.pu, ctl = v.ctl, a = pu && pu.actor;
    if (!pu || !a || !a.alive) { ctl.throttle = 0; ctl.brake = true; return; }
    if (frozenNow() || W.seq || a.state === 'wait') { ctl.throttle = 0; ctl.brake = true; return; }
    const p = N.player;
    const tg = a.state === 'leave' ? (a.leaveTo || (a.leaveTo = awayPoint(a))) : (a.target || { x: p.x, y: p.y });
    pu.planT -= dt;
    const dT = Math.hypot(tg.x - v.x, tg.y - v.y);
    let tx = tg.x, ty = tg.y;
    let directOk = false;
    if (dT < 110) { try { directOk = !N.world.raycast(v.x, v.y, tg.x, tg.y, 'drive').hit; } catch (e) { directOk = false; } }
    if (!directOk) {
      const RT = TUNE.route;
      pu.minT = (pu.minT || 0) - dt;
      const moved = pu.goal ? Math.hypot(pu.goal.x - tg.x, pu.goal.y - tg.y) : Infinity;
      if (!pu.path || (pu.minT <= 0 && (pu.planT <= 0 || moved > Math.max(RT.goalMove, dT * RT.goalFrac)))) {
        pu.planT = RT.every; pu.minT = RT.min; pu.goal = { x: tg.x, y: tg.y }; pu.pi = 1;
        try { pu.path = roadRoute(v, tg.x, tg.y); } catch (e) { N.err('wanted.route', e); pu.path = [[v.x, v.y], [tg.x, tg.y]]; }
      }
      const P = pu.path;
      const look = Math.max(16, Math.abs(v.speed) * 0.4);
      while (pu.pi < P.length - 1 && Math.hypot(P[pu.pi][0] - v.x, P[pu.pi][1] - v.y) < look) pu.pi++;
      tx = P[pu.pi][0]; ty = P[pu.pi][1];
      // at the end of the road, the target is still behind something: get off and run
      if (pu.pi >= P.length - 1 && dT < 170 && a.state !== 'leave') pu.giveUp = true;
    }
    const diffA = U.angleDiff(v.angle, Math.atan2(ty - v.y, tx - v.x));
    let want = pu.speed;
    // slow down to stop beside Chinnu (box-in), slow for corners
    const stopD = a.role === 'mummy' ? 16 : 12;
    if (a.state !== 'leave') want = Math.min(want, Math.max(0, (dT - stopD) * 2.2 + (Math.hypot(p.vx || 0, p.vy || 0) * 0.9)));
    if (Math.abs(diffA) > 1.2) want = Math.min(want, 26); else if (Math.abs(diffA) > 0.5) want = Math.min(want, 55);
    // don't ram anyone
    try {
      if (N.traffic && N.traffic.sense) {
        const ob = N.traffic.sense(v, Math.cos(v.angle), Math.sin(v.angle));
        if (ob && ob.e !== p && ob.e !== (p.vehicle || null)) want = Math.min(want, Math.max(0, ob.sp + (ob.gap - 6) * 1.6));
        else if (ob && ob.gap < 4) want = Math.min(want, Math.max(0, ob.sp));
      }
    } catch (e) { /* traffic optional */ }
    if (pu.rev > 0) { pu.rev -= dt; ctl.brake = false; ctl.throttle = -0.7; ctl.steer = clamp(-diffA * 2, -1, 1); return; }
    ctl.steer = clamp(diffA * 2.5, -1, 1); ctl.handbrake = false;
    const sp = v.speed || 0;
    if (want < 1 && Math.abs(sp) < 3) { ctl.throttle = 0; ctl.brake = true; }
    else if (sp < want - 3) { ctl.brake = false; ctl.throttle = clamp((want - sp) / 20, 0.2, 1); }
    else if (sp > want + 8) { ctl.brake = sp > want + 30; ctl.throttle = ctl.brake ? 0 : -0.5; }
    else { ctl.brake = false; ctl.throttle = 0.05; }
    pu.chk -= dt;
    if (pu.chk <= 0) {
      pu.chk = 1;
      const moved = Math.hypot(v.x - pu.cx, v.y - pu.cy); pu.cx = v.x; pu.cy = v.y;
      if (moved < 3 && want > 15) {
        pu.stuck++; pu.rev = 0.7;
        // close by but the road doesn't get there (a plaza, a park, parked buses): get off and run
        if (pu.stuck >= 2 && dT < 240) pu.giveUp = true;
        // far away and unseen: hop forward along the route
        else if (pu.stuck >= 3 && !N.render.inView(v.x, v.y, 40) && pu.path && pu.path.length > 1) {
          const j = Math.min(pu.path.length - 1, pu.pi + 1), q = pu.path[j], nx = pu.path[Math.min(pu.path.length - 1, j + 1)];
          if (q && N.world.isDrivable(q[0], q[1]) && !N.world.collide(q[0], q[1], v.T.d / 2, 'drive').hit && !N.render.inView(q[0], q[1], 30)) {
            v.x = q[0]; v.y = q[1]; v.okX = null; v.vx = v.vy = v.av = 0; v.speed = 0;
            if (nx && nx !== q) v.angle = Math.atan2(nx[1] - q[1], nx[0] - q[0]);
            pu.stuck = 0; pu.pi = j;
          }
        }
        pu.path = null;
      } else pu.stuck = 0;
    }
  }
  function awayPoint(a) {
    const p = N.player, ax = a.mount ? a.mount.x : a.x, ay = a.mount ? a.mount.y : a.y;
    const ang = Math.atan2(ay - p.y, ax - p.x);
    return { x: ax + Math.cos(ang) * 600, y: ay + Math.sin(ang) * 600 };
  }
  /** A chaser left far behind is brought back (out of view) so the chase goes on. */
  function rubberBand(a, force) {
    const p = N.player;
    const ax = a.mount && mounted(a) ? a.mount.x : a.x, ay = a.mount && mounted(a) ? a.mount.y : a.y;
    if (!force && Math.hypot(ax - p.x, ay - p.y) < TUNE.rubberBand) return;
    if (N.render.inView(ax, ay, 40)) return;
    const spot = spawnSpot(TUNE.spawnDist[Math.max(1, Math.min(5, W.level))] || 320);
    if (!spot) return;
    if (a.mount && mounted(a)) {
      const v = a.mount;
      if (!N.world.isDrivable(spot.x, spot.y) || N.world.collide(spot.x, spot.y, v.T.d / 2, 'drive').hit) return;
      v.x = spot.x; v.y = spot.y; v.okX = null; v.vx = v.vy = v.av = 0; v.speed = 0; v.angle = Math.atan2(p.y - spot.y, p.x - spot.x);
      v.pu.path = null;
      a.x = v.x; a.y = v.y;
    } else { a.x = spot.x; a.y = spot.y; a.path = null; }
  }

  function updatePursuer(a, dt) {
    const p = N.player;
    if (a.emoteT > 0) a.emoteT -= dt;
    if (a.slipT > 0) { a.slipT -= dt; a.vx = a.vy = 0; a.anim.speed = 0; return; }
    if (a.stopT > 0) { a.stopT -= dt; a.vx *= 0.7; a.vy *= 0.7; a.anim.speed = 0; return; }
    if (a.mount && mounted(a)) { a.x = a.mount.x; a.y = a.mount.y; a.angle = a.mount.angle; }
    // leaving: walk / ride away, gone once out of view and far
    if (a.state === 'leave') {
      a.leaveT += dt;
      if (!mounted(a)) { const to = a.leaveTo || (a.leaveTo = awayPoint(a)); moveOnFoot(a, to.x, to.y, a.walkSpd, dt); }
      const ax = a.mount && mounted(a) ? a.mount.x : a.x, ay = a.mount && mounted(a) ? a.mount.y : a.y;
      if ((Math.hypot(ax - p.x, ay - p.y) > TUNE.leaveR && !N.render.inView(ax, ay, 40)) || (a.leaveT > 25 && !N.render.inView(ax, ay, 40))) { a.gone = true; }
      return;
    }
    // respect zones: wait 40 u away, arms folded
    if (W.inRespect) {
      const z = respectNear(a.x, a.y, TUNE.respectBuffer);
      if (z) { a.vx = a.vy = 0; a.anim.speed = 0; if (!mounted(a)) a.angle += U.angleDiff(a.angle, Math.atan2(p.y - a.y, p.x - a.x)) * Math.min(1, dt * 4); return; }
    }
    // a fed dog barks at foot pursuers: they stop for 1.5 s
    if (!mounted(a) && a.role !== 'mummy' && N.traffic && N.traffic.dogScare) { const s = N.traffic.dogScare(a); if (s > 0) { a.stopT = s; emote(a, '?', s); return; } }
    // banana peels (Mummy never slips)
    if (!mounted(a) && a.role !== 'mummy') for (const pl of W.peels) {
      if (!pl.alive || Math.hypot(pl.x - a.x, pl.y - a.y) > 4.5) continue;
      pl.alive = false; a.slipT = 2; sfx('peel_slip', { x: a.x, y: a.y }); bark(a, pick(['*Arre arre arre!*', 'WHO PUT THIS HERE?!', '*Abba!*']), a.speaker);
      API.addHeat(TUNE.heat.peel, 'peel');
      return;
    }
    const tg = a.target || W.lastSeen || { x: p.x, y: p.y };
    const seenRecently = W.now - (a.lastSeenAt || -99) < 1.5;
    // shouting, whistling
    a.barkT -= dt;
    if (a.barkT <= 0) {
      a.barkT = TUNE.barkEvery * rr(0.9, 1.4);
      if (Math.hypot(a.x - p.x, a.y - p.y) < 300 && (a.seeing || rnd() < 0.3)) {
        const key = a.role === 'pochaiah' && mounted(a) ? 'pochaiahLuna' : a.role === 'mummy' && a.nightRide ? 'mummyNight' : a.role;
        if (LINES[key]) {
          if (a.role === 'mummy' && mounted(a) && rnd() < 0.35) bark(a.mount, pick(a.nightRide ? LINES.nanna : LINES.yadagiri), a.nightRide ? 'nanna' : 'yadagiri');
          else bark(a.mount && mounted(a) ? a.mount : a, pick(LINES[key]), a.speaker);
        }
      }
    }
    if (a.role === 'pochaiah' || a.role === 'havaldar') {
      a.whT -= dt;
      if (a.whT <= 0) { a.whT = TUNE.whistleEvery * rr(0.8, 1.3); if (Math.hypot(a.x - p.x, a.y - p.y) < 420) sfx('whistle', { x: a.x, y: a.y }); }
    }
    // tattles (Chitti and the uncles can't catch, they tell)
    if (a.role === 'chitti' || a.role === 'uncle') {
      const T = TUNE.tattle[a.role];
      if (Math.hypot(a.x - p.x, a.y - p.y) < T[0] && !playerHidden()) {
        a.tattleAcc += dt;
        if (a.tattleAcc >= T[1]) {
          a.tattleAcc = 0;
          bark(a, a.role === 'chitti' ? '*MUMMY KI CHEPPESTA!*' : 'That\'s it. I\'m telling Padma. RIGHT NOW.', a.speaker, 2.4);
          if (a.role === 'chitti') W.chittiTattledDay = day();
          N.emit('wanted:tattle', { by: a.role });
          const wasChaser = a === W.chaser;
          API.add(1, 'tattle');
          // she runs home to tell (and the uncle goes off to find a phone)
          if (wasChaser && W.chaser === a) { dismiss(a, true); W.chaser = null; a.leaveTo = homePos(); syncPursuers(W.level); }
          else if (W.helpers.indexOf(a) >= 0) { dismiss(a, true); W.helpers.splice(W.helpers.indexOf(a), 1); }
          return;
        }
      }
    }
    // the roadblock constable stays near his rickshaw
    if (a.guard) {
      const dd = Math.hypot(p.x - a.guard.x, p.y - a.guard.y);
      const goal = dd < a.guard.r && a.seeing ? tg : a.guard;
      moveOnFoot(a, goal.x, goal.y, dd < a.guard.r ? a.runSpd : a.walkSpd, dt);
      checkCatch(a, dt);
      return;
    }
    // mounted chasers: Pochaiah's Luna, Mummy's auto / Chetak
    if (a.mount && mounted(a)) {
      const v = a.mount, dP = Math.hypot(v.x - p.x, v.y - p.y), psp = Math.hypot(p.vx || 0, p.vy || 0);
      // box-in: stopped beside a slow Chinnu
      if (a.role === 'pochaiah' && dP < TUNE.boxR && psp < TUNE.boxSpeed && sameLevel(a)) { a.boxT += dt; if (a.boxT >= TUNE.boxSecs) { startBusted('pochaiah'); return; } } else a.boxT = 0;
      // Pochaiah gets off when Chinnu is close on foot or in a park / plaza / narrow lane (L3: for good; L4: runs 6 s, then back)
      if (a.role === 'pochaiah' && !p.level && (dP < TUNE.lunaDismount && !p.vehicle || (dP < 140 && narrowSpot(p.x, p.y))) && Math.abs(v.speed) < 40) {
        if (dismount(a)) { a.onFootT = 0; a.footLimit = W.level >= 4 ? TUNE.lunaFootSecs : 1e9; bark(a, '*Ruko!*', 'pochaiah'); return; }
      }
      // Mummy steps out and grabs when the auto / Chetak has caught up with a slow Chinnu
      if (a.role === 'mummy' && !p.level && dP < TUNE.stepOutR && psp < 40 && Math.abs(v.speed) < 25) {
        if (dismount(a)) { a.onFootT = 0; a.footLimit = TUNE.mummyRunSecs; bark(a, pick(['*Intiki raa!* NOW!', 'Caught you!', '{FULL}!']), 'amma'); return; }
      }
      // the road won't take the vehicle there: everybody gets off and runs
      if (v.pu && v.pu.giveUp && Math.abs(v.speed) < 20) {
        v.pu.giveUp = false;
        if (dismount(a)) { a.onFootT = 0; a.footLimit = a.role === 'mummy' ? TUNE.mummyRunSecs * 1.5 : a.role === 'pochaiah' && W.level >= 4 ? TUNE.lunaFootSecs * 1.5 : 1e9; return; }
      }
      a.target = a.seeing || seenRecently ? { x: p.x, y: p.y } : (W.lastSeen || tg);
      rubberBand(a, false);
      return;
    }
    // on foot: chase the last seen point, search, spiral
    if (a.mount && a.footLimit != null) {
      a.onFootT = (a.onFootT || 0) + dt;
      if (a.onFootT > a.footLimit) {
        // back to the vehicle
        const v = a.mount;
        if (v && v.alive) {
          const d = moveOnFoot(a, v.x, v.y, a.runSpd, dt);
          if (d < 18 && remount(a)) { a.footLimit = null; a.onFootT = 0; }
          return;
        }
      }
    }
    // Chinnu is up on a roof: nobody climbs after him (they wait by the stairs, then give up)
    a.waitingBelow = false;
    if (p.level && !a.level && !a.isSpotter && roofWait(a, dt)) return;
    const fast = a.seeing || seenRecently || Math.hypot(tg.x - a.x, tg.y - a.y) > 60;
    let speed = fast ? a.runSpd : a.walkSpd;
    if (a.role === 'chitti' && Math.hypot(p.x - a.x, p.y - a.y) < 50) speed = a.walkSpd; // she just keeps him in sight
    if (a.isSpotter) speed = a.walkSpd;
    if (a.seeing || seenRecently) {
      a.searchT = 0;
      const dP = Math.hypot(p.x - a.x, p.y - a.y);
      // the ones who can't catch keep an arm's length (and never shove him): wag a finger, shout
      if (!a.canCatch && dP < (a.isSpotter ? 40 : 15)) {
        a.vx *= 0.6; a.vy *= 0.6; a.anim.speed = 0.25; a.anim.phase += dt * 8;
        a.angle += U.angleDiff(a.angle, Math.atan2(p.y - a.y, p.x - a.x)) * Math.min(1, dt * 8);
      } else moveOnFoot(a, a.isSpotter ? tg.x : p.x, a.isSpotter ? tg.y : p.y, speed, dt);
    } else {
      // go to where he was last seen, look around, then spiral out
      const d = Math.hypot(tg.x - a.x, tg.y - a.y);
      if (d > 8 && a.searchT === 0) moveOnFoot(a, tg.x, tg.y, speed, dt);
      else {
        a.searchT += dt;
        if (a.searchT === dt) emote(a, '?', 2);
        if (a.searchT < TUNE.searchSecs) { a.vx *= 0.8; a.vy *= 0.8; a.anim.speed = 0; a.angle += dt * 1.6 * Math.sin(a.searchT * 1.3); }
        else {
          a.spiralA += dt * 0.6;
          const r = Math.min(TUNE.spiralR, 20 + (a.searchT - TUNE.searchSecs) * 12);
          moveOnFoot(a, tg.x + Math.cos(a.spiralA) * r, tg.y + Math.sin(a.spiralA) * r, a.walkSpd, dt);
        }
      }
    }
    if (!a.isSpotter) rubberBand(a, false);
    checkCatch(a, dt);
  }
  /** Pursuers stay on the ground: they can only catch Chinnu on the same level (systems §7.3 roof zones). */
  function sameLevel(a) { return (N.player.level || null) === ((a && a.level) || null); }
  /** Chinnu went up onto a roof while being chased (seen in the last TUNE.chaseMemory s): a foot pursuer
   *  waits TUNE.roofWaitR from the foot of the stairs he took, arms folded, shouting up. After that the
   *  chase memory runs out and he searches like any lost chase (the meter keeps dropping unseen). */
  function roofWait(a, dt) {
    const p = N.player;
    if (W.now - W.lastSeenT > TUNE.chaseMemory) return false;
    const RF = N.world.roofs, r = RF && RF.get ? RF.get(p.level) : null;
    if (!r || !r.stairs || !r.stairs.length) return false;
    const ref = W.lastSeen || a;
    let st = r.stairs[0], bd = Infinity;
    for (const s of r.stairs) { const dd = (s.x - ref.x) ** 2 + (s.y - ref.y) ** 2; if (dd < bd) { bd = dd; st = s; } }
    const dx = a.x - st.x, dy = a.y - st.y, d = Math.hypot(dx, dy) || 1;
    const gx = st.x + (dx / d) * TUNE.roofWaitR, gy = st.y + (dy / d) * TUNE.roofWaitR;
    a.searchT = 0;
    if (d > TUNE.roofWaitR + 4) moveOnFoot(a, gx, gy, a.runSpd, dt);
    else {
      a.vx *= 0.7; a.vy *= 0.7; a.anim.speed = 0;
      a.angle += U.angleDiff(a.angle, Math.atan2(p.y - a.y, p.x - a.x)) * Math.min(1, dt * 4);
      a.roofT = (a.roofT || 0) - dt;
      if (a.roofT <= 0) { a.roofT = TUNE.barkEvery * rr(1, 1.5); bark(a, pick(LINES.roof), a.speaker); }
    }
    a.waitingBelow = true;
    return true;
  }
  function narrowSpot(x, y) {
    const s = N.world.surfaceAt(x, y), S = N.SURF;
    if (s === S.GRASS || s === S.PLAZA || s === S.SAND || s === S.GROUND) return true;
    try { const q = N.world.nearestRoadPoint(x, y); if (q && q.road && q.road.kind === 'lane' && q.dist < 14) return true; } catch (e) { /* ignore */ }
    return false;
  }
  function checkCatch(a, dt) {
    if (!a.canCatch || W.seq || frozenNow()) return;
    const p = N.player;
    if (W.inRespect || !sameLevel(a)) return;
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    const pv = p.vehicle;
    const reach = a.role === 'mummy' ? TUNE.grabR : TUNE.catchR;
    if (d > reach + (pv ? pv.T.d / 2 : 0)) return;
    if (pv) {
      const sp = Math.hypot(pv.vx, pv.vy);
      if (pv.T.cls === 'bike' && sp >= TUNE.bikeSlow) return;
      if (pv.T.cls !== 'bike' && sp > 4) return; // a stopped car: she opens the door and takes him by the ear
    }
    void dt;
    startBusted(a.role === 'mummy' ? 'amma' : a.role === 'havaldar' ? 'pochaiah' : a.role);
  }

  /* ================================================================ the homing chappal (level 5) */
  function updateChappal(dt) {
    const ch = W.chaser;
    const C = TUNE.chappal, p = N.player;
    if (!ch || ch.role !== 'mummy' || ch.state === 'leave' || W.level < 5) { W.chappal = null; return; }
    const src = ch.mount && mounted(ch) ? ch.mount : ch;
    const c = W.chappal;
    if (!c) {
      W.chappalT -= dt;
      if (W.chappalT > 0) return;
      const d = Math.hypot(src.x - p.x, src.y - p.y);
      if (d > C.range || !ch.seeing || W.inRespect || playerHidden()) { W.chappalT = 0.5; return; }
      W.chappal = { ph: 'wind', t: 0, x: src.x, y: src.y, h: 10, a: Math.atan2(p.y - src.y, p.x - src.x), tx: p.x, ty: p.y, minD: 1e9, src };
      sfx('chappal_whoosh', { x: src.x, y: src.y });
      bark(src, 'One more step and this chappal flies!', 'amma', 1.2);
      N.emit('chappal:throw', { x: src.x, y: src.y, windup: true });
      return;
    }
    c.t += dt;
    if (c.ph === 'wind') {
      c.tx = p.x; c.ty = p.y;
      c.x = src.x; c.y = src.y;
      if (c.t >= C.windup) { c.ph = 'fly'; c.t = 0; c.a = Math.atan2(p.y - c.y, p.x - c.x); N.emit('chappal:throw', { x: c.x, y: c.y }); }
      return;
    }
    if (c.ph === 'fly') {
      const turn = (c.t < C.switchT ? C.turn1 : C.turn2) * diff('homingTurn', 1);
      const want = Math.atan2(p.y - c.y, p.x - c.x);
      c.a += clamp(U.angleDiff(c.a, want), -turn * dt, turn * dt);
      c.x += Math.cos(c.a) * C.speed * dt; c.y += Math.sin(c.a) * C.speed * dt;
      c.h = 6 + Math.sin(Math.PI * Math.min(1, c.t / C.life)) * C.arc;
      c.spin = (c.spin || 0) + dt * 14;
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      c.minD = Math.min(c.minD, d);
      // slow-motion assist when it is 40 u away (setting)
      if (N.settings && N.settings.assist && d < 40 && !c.slowed) { c.slowed = true; N.time.scale = 0.5; setTimeout(() => { N.time.scale = 1; }, 300); }
      const hitR = p.vehicle && p.vehicle.T.cls === 'bike' ? C.hitBike : C.hit;
      if (d < hitR && !playerHidden()) {
        c.ph = 'land'; c.t = 0; c.h = 0;
        sfx('chappal', { x: p.x, y: p.y });
        N.emit('chappal:hit', {});
        startBusted('amma', { hit: true });
        return;
      }
      if (c.t >= C.life || N.world.surfaceAt(c.x, c.y) === N.SURF.SOLID) {
        c.ph = 'land'; c.t = 0; c.h = 0;
        if (c.minD < C.nearMiss) {
          toast('DODGE!', 1100); N.emit('chappal:dodge', {});
          bark(src, 'Missed! ...She never misses twice.', 'amma', 1.8);
        }
      }
      return;
    }
    if (c.ph === 'land' && c.t > C.rest) { W.chappal = null; W.chappalT = C.every === 6 ? diff('chappalInterval', 6) : C.every; }
  }
  function drawChappal(ctx) {
    const c = W.chappal;
    if (!c) return;
    const R = N.render;
    if (c.ph === 'wind' || c.ph === 'fly') {
      // ground marker under the target
      const k0 = R.k(0), X = R.sx(c.ph === 'wind' ? c.tx : N.player.x, k0), Y = R.sy(c.ph === 'wind' ? c.ty : N.player.y, k0);
      const pulse = 0.5 + 0.5 * Math.sin((N.time.real || 0) * 16);
      ctx.strokeStyle = 'rgba(255,74,58,' + (0.45 + pulse * 0.4).toFixed(2) + ')'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(X, Y, 9 * k0, 6 * k0, 0, 0, TAU); ctx.stroke();
    }
    if (c.ph === 'wind') return;
    // shadow on the ground, then the slipper spinning in the air
    const k = R.k(0), sx = R.sx(c.x, k), sy = R.sy(c.y, k);
    ctx.fillStyle = 'rgba(20,10,20,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy, 3.5 * k, 2 * k, 0, 0, TAU); ctx.fill();
    N.draw.sprite(c.x, c.y, c.ph === 'land' ? c.a : (c.spin || 0), c.h || 0, (g) => drawSlipper(g, 1));
  }
  function drawSlipper(g, s) {
    g.scale(s, s);
    g.fillStyle = '#f6f1e4'; g.strokeStyle = '#1a1214'; g.lineWidth = 0.5;
    g.beginPath(); g.ellipse(0, 0, 5.2, 2.2, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#e8dcc0'; g.beginPath(); g.ellipse(-2.2, 0, 1.6, 1.4, 0, 0, TAU); g.fill();
    g.strokeStyle = '#2a62c8'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(2.6, 0); g.lineTo(-0.6, -1.9); g.moveTo(2.6, 0); g.lineTo(-0.6, 1.9); g.stroke();
    g.fillStyle = '#1e4a9a'; g.beginPath(); g.arc(2.6, 0, 0.5, 0, TAU); g.fill();
  }

  /* ================================================================ PAKDA GAYA! / THAK GAYA! */
  function startBusted(by, o) {
    if (W.seq || N.state.mode !== 'play') return false;
    const p = N.player;
    o = o || {};
    W.seq = { kind: 'busted', by: by || 'amma', t: 0, step: 0, x: p.x, y: p.y, hit: !!o.hit, noRespawn: !!o.noRespawn, vhs0: N.render.fx.vhs || 0 };
    N.emit('busted', { by: W.seq.by, x: p.x, y: p.y });
    sfx('busted', { ui: true });
    try { N.state.push('gameover'); W.seq.pushed = true; } catch (e) { W.seq.pushed = false; }
    // the comic chappal flight: from the screen edge onto Chinnu's back
    W.slipFx = { t: 0, dur: 1.0, side: rnd() < 0.5 ? -1 : 1, x: p.x, y: p.y };
    if (N.render.shake && !reduced()) N.render.shake(1.5, 0.2);
    return true;
  }
  function reduced() { return !!(document.body && document.body.classList.contains('reduced-motion')); }
  function startWasted() {
    if (W.seq || N.state.mode !== 'play') return false;
    const p = N.player;
    // a chaser close by catches him instead (systems §4.11)
    const ch = W.chaser;
    if (W.level >= 3 && ch && ch.state !== 'leave' && sameLevel(ch) && Math.hypot(ch.x - p.x, ch.y - p.y) < 250) return startBusted(ch.role === 'mummy' ? 'amma' : 'pochaiah');
    W.seq = { kind: 'wasted', t: 0, step: 0, x: p.x, y: p.y };
    N.emit('wasted', { x: p.x, y: p.y });
    sfx('pant', { ui: true });
    p.sitting = true;
    try { N.state.push('gameover'); W.seq.pushed = true; } catch (e) { W.seq.pushed = false; }
    return true;
  }
  function stepSeq(dt) {
    const s = W.seq;
    if (!s) return;
    s.t += dt;
    const R = N.render;
    if (s.kind === 'busted') {
      if (s.step === 0 && s.t >= 0.4) {
        s.step = 1;
        const fine = Math.round(diff('caughtFine', TUNE.fine));
        const sub = (s.by === 'pochaiah' ? 'Havaldar Pochaiah caught you.' : s.by === 'amma' ? (s.hit ? 'Mummy\'s chappal never misses twice.' : 'Mummy caught you.') : 'Caught!') + '  −' + U.fmtMoney(fine);
        try { N.hud.banner('PAKDA GAYA!', sub, 1600, { kind: 'busted' }); } catch (e) { /* hud optional */ }
      }
      if (s.step === 1 && s.t >= 1.2) { s.step = 2; N.emit('cutscene:vhs', { mode: 'rewind' }); }
      if (s.step >= 2 && s.step < 4) R.fx.vhs = Math.min(1, Math.max(s.vhs0, (s.t - 1.2) / 0.5) * (reduced() ? 0.4 : 1));
      if (s.step === 2 && s.t >= 1.9) { s.step = 3; bustedConsequences(s); }
      if (s.step === 3 && s.t >= 2.4) {
        s.step = 4; R.fx.vhs = s.vhs0;
        endSeq();
        bustedLine(s);
      }
    } else {
      if (s.step === 0 && s.t >= 0.3) { s.step = 1; try { N.hud.banner('THAK GAYA!', 'Too tired to take one more step...', 1700, { kind: 'fail' }); } catch (e) { /* hud optional */ } sfx('wasted', { ui: true }); }
      if (s.step >= 1 && s.step < 3) R.fx.fade = Math.min(1, Math.max(0, (s.t - 1.2) / 0.8)), R.fx.fadeColor = '#000000';
      if (s.step === 1 && s.t >= 2.1) { s.step = 2; wastedConsequences(s); }
      if (s.step === 2 && s.t >= 2.4) { s.step = 3; }
      if (s.step === 3) { R.fx.fade = Math.max(0, 1 - (s.t - 2.4) / 0.7); if (s.t >= 3.1) { R.fx.fade = 0; s.step = 4; endSeq(); wastedLine(s); } }
    }
  }
  function endSeq() {
    const s = W.seq;
    W.seq = null; W.slipFx = null;
    N.player.sitting = false;
    if (s && s.pushed && N.state.mode === 'gameover') { try { N.state.pop(); } catch (e) { /* ignore */ } }
  }
  function respawnAt(x, y) {
    const p = N.player;
    try { if (p.vehicle && N.vehicles && N.vehicles.exit) N.vehicles.exit(p, true); } catch (e) { /* ignore */ }
    p.teleport(x, y);
    p.vx = p.vy = 0;
    try { if (N.render.snapCamera) N.render.snapCamera(); } catch (e) { /* ignore */ }
  }
  function bustedConsequences(s) {
    const p = N.player;
    const fine = Math.round(diff('caughtFine', TUNE.fine));
    money(-fine, 'busted');
    advanceClock(TUNE.bustGm);
    try { p.feed(0, { tummy: TUNE.bustTummy, energy: 0, quiet: true }); } catch (e) { p.tummy = Math.min(100, (p.tummy || 0) + TUNE.bustTummy); }
    W.stats.caught++;
    W.stats.caughtByDay[day()] = (W.stats.caughtByDay[day()] || 0) + 1;
    if (N.flags) N.flags.times_caught = (N.flags.times_caught | 0) + 1;
    const pre = W.level;
    W.curfewFloor = 0; W.curfewHomeDay = day();
    W.locked = null;
    setHeat(0, 'busted');
    dismissAll(true);
    void pre;
    if (s.noRespawn) return;
    // in a mission: onBusted / failOnBusted / the last checkpoint
    const run = N.missions && N.missions.active;
    if (run && run.def) {
      if (run.def.failOnBusted) { setTimeout(() => { try { N.missions.fail('PAKDA GAYA! Caught before the job was done.'); } catch (e) { N.err('wanted.fail', e); } }, 50); return; }
      if (typeof run.def.onBusted === 'function') { try { run.def.onBusted(run); } catch (e) { N.err('wanted.onBusted', e); } return; }
      const cp = run.checkpointData || run.startPos;
      if (cp) { respawnAt(cp.x, cp.y); return; }
    }
    const h = homePos();
    respawnAt(h.x, h.y);
  }
  function bustedLine(s) {
    if (!N.dialogue || !N.dialogue.say) return;
    let spk = s.by === 'pochaiah' ? 'pochaiah' : (N.missions && N.missions.active && N.flags && N.flags.chand_raat && rnd() < 0.5) ? 'ammi' : 'amma';
    let pool = BUSTED_LINES[spk] || BUSTED_LINES.amma;
    if (spk === 'amma') {
      if (W.chittiTattledDay === day() && rnd() < 0.4) { spk = 'chitti'; pool = BUSTED_LINES.chitti; }
      else if (rnd() < 0.2) { const r = rnd(); spk = r < 0.5 ? 'nanna' : 'ammamma'; pool = BUSTED_LINES[spk]; }
    }
    try { N.dialogue.say(spk, subst(pick(pool)), { mood: spk === 'ammamma' ? 'happy' : 'angry' }); } catch (e) { N.err('wanted.line', e); }
  }
  function wastedConsequences(s) {
    const p = N.player;
    void s;
    const m = mins(), shut = m >= 23 * 60 + 30 || m < 5 * 60;
    let spot = null, who = 'self';
    const run = N.missions && N.missions.active;
    if (run && (run.checkpointData || run.startPos)) { spot = run.checkpointData || run.startPos; }
    else if (!shut) {
      let bd = 1e9;
      for (const id in N.places) {
        if (!/^irani_cafe_\d+$/.test(id)) continue;
        const c = N.places[id], d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bd) { bd = d; spot = c; }
      }
      if (spot) who = spot.id === 'irani_cafe_7' ? 'salim' : 'waiter';
    }
    if (!spot) { spot = homePos(); who = 'amma'; }
    W.wasted = { who };
    money(who === 'amma' ? 0 : -TUNE.wastedFine, 'glucose');
    p.tummy = Math.max(p.tummy || 0, TUNE.wastedTummy); p.energy = Math.min(p.tummy, TUNE.wastedEnergy); p.starving = false; p.exhausted = false;
    advanceClock(TUNE.wastedGm);
    API.set(Math.max(0, W.level - TUNE.wastedMeter), 'wasted');
    W.stats.exhausted++;
    respawnAt(spot.x, spot.y);
    try { if (N.player.addStatus && who !== 'amma') N.player.addStatus('warm'); } catch (e) { /* ignore */ }
  }
  function wastedLine() {
    const w = W.wasted || { who: 'self' };
    if (!N.dialogue || !N.dialogue.say) return;
    try {
      if (w.who === 'self') N.dialogue.say('you', pick(WASTED_LINES.self), { mood: 'tired' });
      else N.dialogue.say(w.who, pick(WASTED_LINES[w.who] || WASTED_LINES.waiter), { mood: w.who === 'amma' ? 'worried' : 'happy' });
    } catch (e) { N.err('wanted.line', e); }
  }
  function drawSlipFx(ctx) {
    const f = W.slipFx;
    if (!f) return;
    const R = N.render;
    const k = R.k(8), px = R.sx(f.x, k), py = R.sy(f.y, k) - 6;
    const u = Math.min(1, f.t / f.dur);
    if (u < 0.75) {
      // a giant chappal tumbling in from the side of the screen
      const q = u / 0.75, e = q * q;
      const sx = f.side < 0 ? -40 : R.W + 40, sy = R.H * 0.15;
      const x = sx + (px - sx) * e, y = sy + (py - sy) * e - Math.sin(q * Math.PI) * R.H * 0.25;
      const sc = (2.6 - q * 1.2) * Math.max(1, R.H / 360);
      ctx.save(); ctx.translate(x, y); ctx.rotate(q * 9 * f.side); drawSlipper(ctx, sc * 2.2); ctx.restore();
    } else {
      // THUP! with a cartoon star
      const q = (u - 0.75) / 0.25;
      ctx.save(); ctx.translate(px, py - 4);
      const s = (1 + q * 0.6) * Math.max(1, R.H / 360);
      ctx.fillStyle = '#f2c230'; ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r = (i % 2 ? 7 : 15) * s; if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      const c = N.draw.pixelTextCanvas('THUP!', '#b22b2b', '#1a1214');
      const ts = Math.max(1, Math.round(s * 1.6));
      ctx.drawImage(c, Math.round(-c.width * ts / 2), Math.round(-c.height * ts / 2), c.width * ts, c.height * ts);
      ctx.restore();
    }
  }

  /* ================================================================ rules polled each step */
  function offenceFromBump(d) {
    if (!d || W.seq || W.locked != null) return;
    const p = N.player, pv = p.vehicle;
    const a = d.a, b = d.b;
    const mine = (x) => x === p || (pv && x === pv);
    let other = null;
    if (mine(a)) other = b; else if (mine(b)) other = a;
    if (!other || other === p || other === pv) return;
    const sp = +d.speed || 0;
    const cd = W.bumpCD.get(other) || 0;
    if (cd > W.now) return;
    // pursuers and constables
    if (other.pursuer || other.constable || (other.npcId === 'pochaiah')) {
      if (other.role === 'pochaiah' || other.role === 'havaldar' || other.constable || other.npcId === 'pochaiah') {
        if (sp > 20) { W.bumpCD.set(other, W.now + 5); API.addHeat(TUNE.heat.constable, 'constable', { major: true }); }
      }
      return;
    }
    if (other.kind === 'vehicle') {
      if (pv && sp > TUNE.heat.vehicleSpeed) { W.bumpCD.set(other, W.now + 1.5); API.addHeat(TUNE.heat.vehicle, 'crash'); }
      return;
    }
    if (other.kind === 'animal') {
      if (other.species === 'cow' && pv && sp > 15 && witnessed(other.x, other.y)) { W.bumpCD.set(other, W.now + 3); API.addHeat(TUNE.heat.cow, 'cow'); }
      return;
    }
    if (other.kind === 'ped' || other.kind === 'npc') {
      let h = 0;
      if (pv) h = pv.T.cls === 'bike' ? TUNE.heat.pedBike : TUNE.heat.pedMotor;
      else if (sp > TUNE.pedFootSpeed) h = TUNE.heat.pedFoot;
      if (!h) return;
      if (elderly(other)) h *= TUNE.heat.elderMul;
      W.bumpCD.set(other, W.now + TUNE.bumpCooldown);
      API.addHeat(h, pv ? 'knockdown' : 'bump');
    }
  }
  function witnessed(x, y) {
    const T = N.traffic;
    if (!T || !T.peds) return true;
    for (const q of T.peds) {
      if (!q.alive || Math.hypot(q.x - x, q.y - y) > 140) continue;
      try { if (!N.world.raycast(q.x, q.y, x, y, 'walk').hit) return true; } catch (e) { return true; }
    }
    return false;
  }
  function footpathRule(dt) {
    const p = N.player, pv = p.vehicle;
    if (!pv || pv.driver !== p) return;
    const s = N.world.surfaceAt(p.x, p.y), S = N.SURF;
    if (s !== S.FOOTPATH && s !== S.PLAZA) return;
    if (Math.hypot(pv.vx, pv.vy) <= TUNE.heat.footpathSpeed) return;
    const near = N.entities.query(p.x, p.y, TUNE.heat.footpathPedR, (e) => (e.kind === 'ped' || e.kind === 'npc') && e !== p && !e.vehicle);
    if (!near.length) return;
    W.footAcc = (W.footAcc || 0) + TUNE.heat.footpath * dt;
    if (W.footAcc >= 1) { const n = Math.floor(W.footAcc); W.footAcc -= n; API.addHeat(n, 'footpath'); }
  }
  function curfewRule() {
    const m = mins(), d = day();
    const off = (N.missions && N.missions.active) || (N.flags && (N.flags.postgame || N.flags.ending_done || N.flags.no_curfew)) ||
      (flagOn('numaish') && m < 22 * 60 + 30 && m >= 16 * 60) || flagOn('ganesh_immersion') || (flagOn('ramzan') && (m < 23 * 60 + 30 && m > 12 * 60)) || flagOn('chand_raat');
    let floor = 0;
    const mm = m < TUNE.curfewMorning ? m + 1440 : m;
    for (const [t, f] of TUNE.curfew) if (mm >= t) floor = f;
    // the curfew night belongs to the day it started (00:30 is still "last night")
    const nightDay = m < TUNE.curfewMorning ? d - 1 : d;
    if (off || W.curfewHomeDay === nightDay) floor = 0;
    if (floor !== W.curfewFloor) {
      const up = floor > W.curfewFloor;
      W.curfewFloor = floor;
      if (up) {
        if (floor === 1) toast('Mummy is waiting at the gate.', 2600);
        else if (floor === 2) toast('Bahadur is out with his torch. Go HOME.', 2600);
        else toast('Pochaiah is on his night round...', 2600);
        if (W.heat < floor * 100) setHeat(floor * 100 + 30, 'curfew');
      }
    }
  }
  function homeRule() {
    const p = N.player, h = homePos();
    if (p.vehicle && p.vehicle.T.cls !== 'bike') return;
    if (Math.hypot(p.x - h.x, p.y - h.y) > TUNE.homeR) { W.atHome = false; return; }
    if (W.atHome) return;
    W.atHome = true;
    const m = mins();
    const nightDay = m < TUNE.curfewMorning ? day() - 1 : day();
    // reaching home ends the curfew for tonight
    if (W.curfewFloor > 0 || (m >= 21 * 60 + 30 || m < TUNE.curfewMorning)) {
      W.curfewHomeDay = nightDay;
      const late = (m >= 23 * 60 || m < TUNE.curfewMorning);
      W.curfewFloor = 0;
      if (W.level >= 1 || late) {
        if (late) money(-Math.round(diff('caughtFine', TUNE.fine)), 'curfew');
        setHeat(0, 'home');
        try { if (N.dialogue && N.dialogue.say) N.dialogue.say('amma', late ? 'Do you know what TIME it is? Two rupees from your pocket money. Now sleep.' : 'Inside. Now. We will talk about this after dinner.', { mood: 'angry' }); } catch (e) { /* ignore */ }
        return;
      }
    }
    if (W.level <= 0) return;
    if (m < TUNE.homeBefore && W.level <= 3) {
      setHeat(0, 'home');
      try { if (N.dialogue && N.dialogue.say) N.dialogue.say('amma', 'Good boy, home on time.', { mood: 'happy' }); else toast('"Good boy, home on time."'); } catch (e) { /* ignore */ }
    } else {
      // after the street lights (or at level 4-5): caught at the door
      startBusted('amma', { noRespawn: true });
    }
  }
  function respectRule(dt) {
    const p = N.player;
    const z = respectAt(p.x, p.y);
    W.inRespect = !!z;
    if (!z) { W.lastOut = { x: p.x, y: p.y }; return; }
    // during a chase (seen in the last 12 s) the compound gate is closed to him
    if (z.part === 'compound' && W.level >= 1 && W.now - W.lastSeenT < TUNE.chaseMemory && W.lastOut) {
      if (p.vehicle) return;
      p.x = W.lastOut.x; p.y = W.lastOut.y; p.vx = p.vy = 0;
      W.inRespect = !!respectAt(p.x, p.y);
      W.gateT -= dt;
      if (W.gateT <= 0) {
        W.gateT = 4;
        const g = z.gate || { x: p.x, y: p.y };
        bark({ x: g.x, y: g.y }, '*Shant ho ke aao, beta.*', null, 2.2);
        toast('Come back calm. Not in the middle of a chase.', 2000);
      }
    }
  }

  /* ================================================================ offers (ACTION) */
  const offers = {
    mango: { label: 'Mango Bite?', priority: 6, dist: 0, use: () => {
      const ch = W.chaser;
      if (!ch || ch.role !== 'chitti' || !useItem('mango_bite')) return;
      bark(ch, LINES.chittiBribed, 'chitti', 2.6);
      dismiss(ch, true); W.chaser = null;
      API.clear('mango_bite');
    } },
    jasmine: { label: 'Jasmine for Mummy', priority: 6, dist: 0, use: () => {
      if (W.level < 5 || !useItem('jasmine')) return;
      const ch = W.chaser;
      if (ch) bark(ch.mount && mounted(ch) ? ch.mount : ch, '...Jasmine? For me? ...Don\'t think this fixes everything. ...It fixes some things.', 'amma', 3);
      API.set(3, 'jasmine');
    } },
    chappals: { label: 'New chappals for Mummy', priority: 6, dist: 0, use: () => {
      if (W.level < 5 || !useItem('kotha_chappal')) return;
      const ch = W.chaser;
      if (ch) bark(ch.mount && mounted(ch) ? ch.mount : ch, 'New chappals? ...These are NICE. ...Go. Before I change my mind.', 'amma', 3);
      API.clear('kotha_chappal');
    } },
    peel: { label: 'Drop peel', priority: 2, dist: 0, use: () => dropPeel() },
  };
  function updateOffers() {
    const p = N.player;
    if (!N.interact || p.controlsLocked || N.state.mode !== 'play') return;
    const ch = W.chaser;
    if (ch && ch.state !== 'leave') {
      const cx = ch.mount && mounted(ch) ? ch.mount.x : ch.x, cy = ch.mount && mounted(ch) ? ch.mount.y : ch.y;
      const d = Math.hypot(cx - p.x, cy - p.y);
      if (ch.role === 'chitti' && d < 20 && itemCount('mango_bite') > 0 && !p.vehicle) { offers.mango.dist = d; N.interact.offer(offers.mango); }
      if (ch.role === 'mummy' && W.level >= 5 && d < 24 && !p.vehicle) {
        if (itemCount('kotha_chappal') > 0) { offers.chappals.dist = d; N.interact.offer(offers.chappals); }
        else if (itemCount('jasmine') > 0) { offers.jasmine.dist = d; N.interact.offer(offers.jasmine); }
      }
    }
    if (W.level >= 1 && W.level <= 4 && !p.vehicle && itemCount('banana_peel') > 0 && !W.inRespect && !W.peels.some((q) => q.alive)) { offers.peel.dist = 0; N.interact.offer(offers.peel); }
  }
  function dropPeel() {
    const p = N.player;
    if (W.inRespect || p.vehicle) return false;
    if (!useItem('banana_peel')) return false;
    W.peels = W.peels.filter((q) => q.alive);
    W.peels.push({ x: p.x - Math.cos(p.angle || 0) * 6, y: p.y - Math.sin(p.angle || 0) * 6, alive: true, t: 0, a: rnd() * TAU });
    toast('Peel down. *Hehe.*', 1200);
    return true;
  }
  function drawPeels(ctx) {
    for (const q of W.peels) {
      if (!q.alive) continue;
      N.draw.sprite(q.x, q.y, q.a, 0.2, (g) => {
        g.fillStyle = '#f2d23a'; g.strokeStyle = '#5a4020'; g.lineWidth = 0.4;
        for (let i = 0; i < 4; i++) { g.save(); g.rotate((i / 4) * TAU); g.beginPath(); g.ellipse(2, 0, 2.4, 0.8, 0, 0, TAU); g.fill(); g.stroke(); g.restore(); }
        g.fillStyle = '#6a5020'; g.beginPath(); g.arc(0, 0, 0.7, 0, TAU); g.fill();
      });
    }
  }

  /* ================================================================ hide (shops.js rows) + haircut */
  /** kind: 'kirana' (behind the rice sacks), 'parlour' (the video parlour back door), 'queue' (blend in). */
  function hide(kind, placeId, opts) {
    opts = opts || {};
    const lvl = W.level;
    if (lvl <= 0) return { ok: false, line: 'Nobody is chasing you, *beta*.' };
    const pl = placeId && N.places[placeId];
    if (kind === 'kirana') {
      if (lvl >= 5) return { ok: false, line: '"Agarwal-ji, is he behind the rice?" ...She knows every hiding place.' };
      API.coolDown(1, 'hide');
      W.seen = false; W.unseenT = 0; W.hideT = 2;
      if (pl) W.lastSeen = { x: pl.x, y: pl.y };
      for (const a of allPursuers()) { a.lastSeenAt = -99; a.target = W.lastSeen; a.searchT = 0; }
      return { ok: true, line: 'Behind the rice sacks. Nobody saw. *Bach gaya.*' };
    }
    if (kind === 'parlour' || kind === 'back_door' || kind === 'backdoor') {
      W.seen = false; W.unseenT = (TUNE.unseenDrop * diff('unseenDrop', 12) / 12) * 0.5; W.hideT = 1.5;
      if (pl) W.lastSeen = { x: pl.x, y: pl.y };
      for (const a of allPursuers()) { a.lastSeenAt = -99; a.target = W.lastSeen; a.searchT = 0; }
      if (opts.teleport && pl) {
        const r = N.world.nearestRoadPoint(pl.x, pl.y);
        const ang = r ? Math.atan2(pl.y - r.y, pl.x - r.x) : rnd() * TAU;
        const f = N.world.findFree(pl.x + Math.cos(ang) * 40, pl.y + Math.sin(ang) * 40, 'walk', 30);
        if (f) N.player.teleport(f.x, f.y);
      }
      return { ok: true, line: 'Out by the back lane. *Bach gaya.*' };
    }
    if (kind === 'queue') {
      if (lvl > 3) return { ok: false, line: 'The whole queue is looking at you. Not here.' };
      W.queueT = 2;
      return { ok: true, line: 'Just another kid in the queue...' };
    }
    return { ok: false, line: '' };
  }
  function shopsHandlesBarber() {
    const S = N.shops;
    return !!(S && ((S.KINDS && S.KINDS.barber) || S.handlesBarber || (S.defs && (S.defs.barber_1 || S.defs.barber_2))));
  }
  /** The barber cool-down (systems §4.6): ₹10, a short chair scene, meter clear, next hairstyle. */
  async function haircut(placeId) {
    const p = N.player;
    if (W.seq) return false;
    if (W.chaser && W.chaser.seeing && Math.hypot(W.chaser.x - p.x, W.chaser.y - p.y) < 40) { toast('Not with a chaser at the door!', 2000); return false; }
    if (calDate().dow === 2) { toast('Closed on Tuesdays.', 1800); return false; }
    if (p.money < TUNE.haircut) { toast('A haircut is ₹10. Not enough money.', 2000); return false; }
    money(-TUNE.haircut, 'haircut');
    sfx('scissors', { ui: true });
    const lines = ['Haircut, ten rupees. Nobody will recognise you. Not even your Mummy.'];
    if (N.menus && typeof N.menus.cutscene === 'function') {
      try {
        await N.menus.cutscene([
          { type: 'fade', to: 'black', ms: 350 },
          { type: 'sfx', name: 'scissors' },
          { type: 'text', lines: ['*Kirr-kirr-kirr*...', 'Snip. Snip. A splash of coconut oil.'], ms: 1800 },
          { type: 'say', s: 'barber', t: lines[0] },
          { type: 'fade', to: 'clear', ms: 350 },
        ], { id: 'haircut', skippable: true });
      } catch (e) { N.err('wanted.haircut', e); }
    } else {
      p.controlsLocked = true;
      await new Promise((r) => setTimeout(r, TUNE.haircutSecs * 1000));
      p.controlsLocked = false;
    }
    try { const cur = p.status && p.status.hair ? (+p.status.hair.value || 0) : 0; p.addStatus('hair', Infinity, { value: (cur % 4) + 1 }); } catch (e) { /* ignore */ }
    API.clear('barber');
    toast('New haircut! Nobody recognises you.', 2200);
    N.emit('shop:service', { place: placeId || null, service: 'haircut' });
    return true;
  }
  let barberMine = false;
  function barberOffers() {
    const shopsDo = shopsHandlesBarber();
    if (shopsDo) {
      if (barberMine) { for (const id in N.places) if (N.places[id].kind === 'barber') N.interact.remove('wanted:' + id); barberMine = false; }
      return;
    }
    barberMine = true;
    for (const id in N.places) {
      const pl = N.places[id];
      if (pl.kind !== 'barber' || N.interact.get('wanted:' + id)) continue;
      N.interact.add('wanted:' + id, {
        x: pl.x, y: pl.y, r: 18, priority: 3, level: 'ground',
        label: () => 'Haircut ₹10',
        enabled: () => barberMine && !N.player.vehicle && inHours([8 * 60, 20 * 60 + 30]),
        use: () => { haircut(id); },
      });
    }
  }

  /* ================================================================ HUD: heat fill + blips */
  function hudHeat() {
    const els = document.querySelectorAll('.hud-chappal .slipper .sole');
    if (!els.length) return;
    if (!document.getElementById('nost-heat-defs')) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('id', 'nost-heat-defs'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
      svg.setAttribute('aria-hidden', 'true'); svg.style.position = 'absolute';
      svg.innerHTML = '<defs><linearGradient id="nost-heat" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff8a5a" stop-opacity="0.85"/><stop id="nost-heat-a" offset="0" stop-color="#ff8a5a" stop-opacity="0.85"/><stop id="nost-heat-b" offset="0" stop-color="#120d16" stop-opacity="0.35"/><stop offset="1" stop-color="#120d16" stop-opacity="0.35"/></linearGradient></defs>';
      document.body.appendChild(svg);
    }
    const lvl = W.level, frac = lvl >= 5 ? 0 : clamp((W.heat - lvl * 100) / 100, 0, 1);
    const key = lvl * 10 + Math.round(frac * 20) / 20;
    if (key === W.heatFrac) return;
    W.heatFrac = key;
    const a = document.getElementById('nost-heat-a'), b = document.getElementById('nost-heat-b');
    if (a && b) { a.setAttribute('offset', frac.toFixed(2)); b.setAttribute('offset', frac.toFixed(2)); }
    els.forEach((el, i) => { el.style.fill = i === lvl && frac > 0.02 ? 'url(#nost-heat)' : ''; });
  }

  /* ================================================================ system */
  function update(dt) {
    const mode = N.state.mode;
    if (W.slipFx) { W.slipFx.t += dt; if (W.slipFx.t > W.slipFx.dur + 0.35) W.slipFx = null; }
    if (mode === 'gameover') { stepSeq(dt); return; }
    if (W.seq) { stepSeq(dt); return; }
    if (mode !== 'play' || !N.world || !N.world.built) return;
    W.now += dt;
    if (W.hideT > 0) W.hideT -= dt;
    const p = N.player;
    respectRule(dt);
    curfewRule();
    homeRule();
    if (W.seq) return;
    // THAK GAYA: tummy at 0 (entities.js emits player:starving and runs a fallback after 4 s)
    if (p.starving && p.tummy <= 0 && !W.seq) { startWasted(); return; }
    footpathRule(dt);
    // sight checks every 0.25 s
    W.seeT -= dt;
    if (W.seeT <= 0) { W.seeT = TUNE.seeEvery; sightPass(); }
    // unseen decay / escalation
    if (W.level > 0 && W.locked == null) {
      if (W.seen) {
        W.unseenT = 0;
        if (W.level === 3 || W.level === 4) {
          const ch = W.chaser;
          if (ch && ch.role === 'pochaiah' && ch.seeing) {
            W.escT += dt;
            if (W.escT >= TUNE.escalate[W.level]) { W.escT = 0; if (W.level === 4) toast('Pochaiah phoned Lakshmi Nivas...', 2400); API.add(1, 'escalate'); }
          }
        }
      } else if (!frozenNow()) {
        let mul = 1;
        if (inCrowd(p.x, p.y)) mul *= 2;
        if (p.vehicle && p.vehicle.type === 'bus' && p.vehicle.driver !== p) mul *= 2;
        if (W.queueT > 0) { W.queueT -= dt; mul *= 2; }
        W.unseenT += dt * mul;
        const drop = diff('unseenDrop', TUNE.unseenDrop);
        if (W.unseenT >= drop) {
          W.unseenT = 0;
          const nl = W.level - 1;
          setHeat(nl > 0 ? nl * 100 + 60 : 0, 'unseen');
        }
      }
    } else if (W.level === 0 && W.heat > 0 && !frozenNow() && W.locked == null) {
      W.heat = Math.max(floorHeat(), W.heat - TUNE.level0Decay * dt);
    }
    // pursuers: keep the cast right, move them
    const pausedChase = W.frozen.has('mission') || W.frozen.has('shop') || W.frozen.has('script');
    if (pausedChase && allPursuers().length && W.frozen.has('mission')) dismissAll(true);
    if (!pausedChase && W.level > 0 && (!W.chaser || !W.chaser.alive)) { W.chaser = null; W.syncT = (W.syncT || 0) - dt; if (W.syncT <= 0) { W.syncT = 0.7; syncPursuers(W.level); } }
    if (!pausedChase && W.level === 4 && !W.roadblock) { W.rbT = (W.rbT || 0) - dt; if (W.rbT <= 0) { W.rbT = 1.5; setRoadblock(); } }
    if (!frozenNow()) {
      for (const a of allPursuers()) if (a.alive) updatePursuer(a, dt);
      if (W.bahadur && W.bahadur.alive) { const b = W.bahadur; b.target = W.lastSeen || b.target; updatePursuer(b, dt); }
      updateChappal(dt);
    }
    for (const a of W.leaving.slice()) {
      if (a.alive && !a.gone) updatePursuer(a, dt);
      if (!a.alive || a.gone) { removePursuer(a); W.leaving.splice(W.leaving.indexOf(a), 1); }
    }
    // the roadblock rickshaw goes once nobody sees it
    for (const v of W.rbGone.slice()) if (!v.alive || !N.render.inView(v.x, v.y, 40)) { try { N.vehicles.remove(v); } catch (e) { v.alive = false; } W.rbGone.splice(W.rbGone.indexOf(v), 1); }
    if (W.level < 3) hideNpc('pochaiah', false);
    updateSpotters(dt);
    updateOffers();
    W.peels = W.peels.filter((q) => { q.t += dt; return q.alive && q.t < 60; });
    W.barberT = (W.barberT || 0) - dt;
    if (W.barberT <= 0) { W.barberT = 5; barberOffers(); }
  }
  function draw() {
    const R = N.render;
    hudHeat();
    if (W.chappal) R.queue('sky', 5, drawChappal);
    if (W.peels.length) R.queue('ground', 6, drawPeels);
    if (W.slipFx) R.queue('fx', 20, drawSlipFx);
    // Bahadur's torch at night
    const b = W.bahadur;
    if (b && b.alive && night() && R.lights) {
      for (let i = 1; i <= 3; i++) R.lights.push({ x: b.x + Math.cos(b.angle) * i * 40, y: b.y + Math.sin(b.angle) * i * 40, r: 26 + i * 12, color: '#fff2c0', intensity: 0.75 - i * 0.12 });
    }
  }
  function reset() {
    dismissAll(true);
    for (const a of W.leaving) removePursuer(a);
    W.leaving = [];
    for (const v of W.rbGone) { try { N.vehicles.remove(v); } catch (e) { v.alive = false; } }
    W.rbGone = [];
    for (const id of W.blips) { try { N.hud.unblip(id); } catch (e) { /* ignore */ } }
    W.blips.clear();
    W.heat = 0; W.level = 0; API.level = 0; W.seen = false; W.unseenT = 0; W.lastSeen = null; W.chappal = null; W.seq = null;
    W.frozen.clear(); W.locked = null; W.policyName = 'normal'; W.curfewFloor = 0; W.curfewHomeDay = -1; W.peels = []; W.slipFx = null;
    W.chittiTattledDay = -1; W.stats = { caught: 0, exhausted: 0, caughtByDay: {} }; W.heatFrac = -1; W.atHome = false;
    if (N.render && N.render.fx) { N.render.fx.fade = 0; }
    hideNpc('pochaiah', false);
  }

  N.on('bump', (d) => { try { offenceFromBump(d); } catch (e) { N.err('wanted.bump', e); } });
  N.on('game:quit', () => { try { reset(); } catch (e) { N.err('wanted.quit', e); } });
  N.on('mission:start', () => { W.curfewFloor = 0; });

  N.addSystem({
    id: 'wanted', order: 50, runIn: ['play', 'gameover'],
    init() {
      if (N.save && N.save.register) N.save.register('wanted', { serialize: () => API.serialize(), deserialize: (o) => API.deserialize(o) });
    },
    update(dt) { update(dt); },
    draw() { try { draw(); } catch (e) { N.err('wanted.draw', e); } },
    reset() { reset(); },
  });
})();
