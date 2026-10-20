/* NOSTALGIA — diwali.js  (owner: Diwali developer) — Deepavali week 2003 in both views.
 *
 * Calendar (seasons.js "[diwali hook]"): `pataakha` 20-26 Oct 2003 (the cracker stalls go up) and `diwali`
 * 22-26 Oct 2003 (Naraka Chaturdashi Fri 24, Deepavali Sat 25 Oct). Both are N.seasons EXTRA names, mirrored
 * into N.flags, overridable with N.seasons.set(). They never overlap Ramzan (27 Oct ->), the interlude (1 Nov)
 * or any main mission date. In the main story the week is played between Track 10 and the interlude
 * (N.dwMissions.story in diwali_missions.js); it is also reachable from ◀◀ REWIND "October", the post-game
 * "Diwali Week" J-card at home, or whenever the calendar is set into it (debug / tests).
 *
 * WORLD (only near the player; pooled; capped per device — TUNE.budget desk / phone)
 *   colonies   every residential house (by district style share x the week's day factor): a rangoli / muggulu at
 *              the gate, two clay diyas on the step (+ on the gate posts), a marigold-and-mango-leaf toran over the
 *              door, an akash kandil (paper lantern: hexagonal, star or ball) on many first floors (it sways), fairy-
 *              light strings along many parapets (chase / blink / twinkle / alternate / steady), diyas along the
 *              parapets in the evening. Flames flicker from dusk; lamps glow at night (N.render.lights / 3D glow
 *              points + emissive). The home (Lakshmi Nivas) always; its terrace parapet diyas are lit only once the
 *              missions' deepon_ki_raat is done (N.flags.dw_terrace / diwali_terrace_lit), or when it is not registered.
 *   stalls     pataakha stalls on Sultan Bazaar (Koti), the Koti book bazaar, every market and beside every
 *              kirana: trestle table with a red skirt, colourful packs, stacked tins, bamboo poles, a striped
 *              awning, a board with a fictional, brand-free name (PATAAKHA BAZAAR, ROSHNI FIREWORKS, ...) and a
 *              product strip (BIJLI ROCKET ANAAR CHAKRI PHULJHADI), ladis and rocket bundles hanging from the awning,
 *              a bulb at night, a vendor behind the table and customers at the counter (busiest 17:00-22:30).
 *              20-26 Oct, 09:00-23:00. Away from respect zones, junction mouths and the places_art market stalls.
 *   fireworks  rockets streak up and burst (peony / ring / willow / crackle / multi / palm) all round the city, peak
 *              on Diwali night 19:00-23:00 (NIGHTS x hour curve; the 24th has its dawn crackers); families out on
 *              the colony lanes and grounds: an adult with a bucket of water, kids with phuljhadis (sparklers,
 *              the 3D arm held out), anaar fountains, spinning chakris, ladis (strings of crackers popping along
 *              the lane), the odd bijli / laxmi bomb lit by the adult only (flash, smoke puff, soot, red paper
 *              scatter; it only fizzles if anyone is within 6.5 u), rockets from a bottle (always straight up).
 *              Never within 60 u of a respect zone, 150 u of a mosque / church / dargah / gurudwara / ashurkhana /
 *              tomb / Charminar, or 230 u of a hospital (fireOK()). The home family (Amma, Nanna, Chitti with her
 *              phuljhadi) stands at the home gate on Diwali evenings when no mission runs ("Talk to Amma / Nanna").
 *   litter     red / pink / brown cracker paper on the roads: trodden-in patches + loose bits seeded per 24 u road
 *              cell from litterLevel (it accumulates through the night, stays the next morning and is swept by
 *              the afternoon into heaps at the kerbs); bombs / ladis add live bits and soot. Loose bits blow and
 *              swirl in the wake of every moving vehicle near them (speed + heading: the bow wave pushes them
 *              out, the body drags them along, the trailing vortex pair swirls them round and up behind it) and in
 *              N.wind gusts (and round Chinnu's feet when he runs): they flutter, flip, spin on curved paths, fall
 *              slowly, slide to a stop, pile against kerbs and walls and sink in water. 2D: batched quads +
 *              shadows of the flying ones; 3D: one InstancedMesh (only moved bits are rewritten) + decal atlas.
 *   haze       smoke haze over the city at night, thicker after 21:00 (2D wash; 3D fog colour + distance, sparks
 *              fade into it); big bursts tint the sky / the city.
 *   animals    traffic dogs run off and hide (napping by a wall, whimpering) after nearby bangs, cows get up and
 *              amble away, pigeons and birds scatter; a hiding dog offers "Comfort the dog" (a gentle moment:
 *              Chinnu's "Shh, shh...", a little heart, the dog settles and gets up calm a few seconds later).
 *   sounds     N.audio.ext.registerSfx: dw_crackle dw_sparkler dw_anaar dw_rocket dw_burst dw_far dw_bomb dw_ladi
 *              dw_match dw_fizzle dw_whimper (distance delay on bursts; the far city pops without a position).
 * Free roam: phuljhadis / chakris / anaars / rockets from the cracker box (N.diwali.box: the missions' Pataakha Bazaar
 *   fills it; any open stall sells a ₹5 box of 10 phuljhadis) can be lit (ACTION "Light a ...") only beside Amma /
 *   Nanna at home or at a family's "bucket of water" spot (TUNE.lightR); lighting near elders, animals or a
 *   hospital makes the adult stop it and raises the Chappal Meter (N.wanted.addHeat(TUNE.heat, 'cracker')).
 *   A mission that runs its own lighting sets `diwaliOwnsLighting: true` on its def (the offer is hidden then).
 *
 * missions live in src/diwali_missions.js
 *
 * API  N.diwali  (h = height in 2D units: 3D y = h * N.view3d.VS)
 *   active() -> bool (22-26 Oct)   stalls() -> bool (stalls open now)   stallsWeek() -> bool (20-26 Oct)
 *   intensity() 0..1   litterLevel() 0..1   sweepLevel() 0..1   haze() 0..1   isNight() -> bool (dark enough for
 *   crackers: N.clock.isNight() or after 18:20 / before 05:30)   lampTime() -> bool (diyas burn)   dayNo() 20..26 | 0
 *   fireOK(x, y) -> bool
 *   layout.stalls() -> [{id, anchor, kind 'bazaar'|'market'|'kirana', x, y, a, fx, fy (towards the road), label, stripes, seed}]
 *   layout.houses(cx, cy, r = 300) -> decorated houses, nearest first [{id, home, cx, cy, f, nx, ny, ux, uy, door {x, y},
 *     gate {x, y}, rangoli {x, y, r, v}, diyas, gateDiyas, toran, kandil, fairy, parapet, s, P(u, v) -> [x, y]}]
 *   layout.home() -> the home's plan   layout.spots === spots
 *   spots.home {x, y, fx, fy} (outside the home gate)   spots.terrace {x, y, h, rect, parapet: [{x, y, h, edge}]}
 *   spots.list() -> [{x, y, kind 'bucket'|'home', group, adult}]   spots.near(x, y, r = TUNE.lightR) -> spot | null
 *   spots.find(cx, cy, r) -> [{x, y, fx, fy, house, kind}] (where families come out tonight)
 *   burst(x, y, h = 140, type, col, big)   rocket(x, y, {h, type, col, big, vh, fuse, silent, force, onBurst}) -> rocket
 *   bomb(x, y, {fuse, big, onEnd})   anaar(x, y, o)   chakri(x, y, o)   ladi(x, y, {a, len, fuse})
 *   sparkler(x, y, {holder, dur})   bottle(x, y, {fuse, rocket, onLaunch})   (all -> emitter {kind, x, y, t, dur, ...})
 *   scatter(x, y, n = 20, {spread, burnt})   show(x, y, secs, {rate, r0, r1}) -> {stop(), running, t}
 *   litter {count, flying, awake, live, bits (snapshot), near(x, y, r) -> {n, flying, sliding, resting}, decals,
 *     heaps, level(), sweep(), settle(), clear(), air(x, y)}
 *   box {items {phuljhadi, chakri, anaar, rocket}, add(kind, n) -> count, use(kind) -> bool, count(kind), total(),
 *     clear()}   (save section 'diwali')
 *   canLight(x, y, kind?) -> {ok, why: 'quiet'|'adult'|'hospital'|'respect'|'elder'|'animal'|'vehicle', spot, near}
 *     (a phuljhadi is quiet: elders and animals may watch it; the rest not within TUNE.elderR / animalR)
 *   lightFromBox(kind?, {x, y}) -> emitter | null (the rule above: the adult stops it + heat)
 *   dogs {hiding (list), hide(dog, {x, y, secs, spot}) -> bool, calm(dog) -> bool, register(dog), unregister(dog),
 *     step(dog, dt) -> hiding, isHiding(dog)}   (a dog: dwHide (s left), dwSpot, dwCalm)
 *   stats()   TUNE   NIGHTS   debug {force(I), litter(L), haze(h), clear(), settle(ms), groups(), spawnGroupNear(x, y, r), ...}
 * Events: 'diwali:box' {kind, n, items}, 'diwali:light' {kind, x, y, by}, 'diwali:stopped' {why, kind},
 *   'diwali:buy' {stall, kind, n}, 'diwali:dog' {dog, hide, spot}, 'diwali:comfort' {dog}.
 * Hooks in files this module does not own (each marked "[diwali hook]"): index.html (script tag), seasons.js
 *   (EXTRA names + calendarFor), traffic.js (TUNE.events rows: busier Sultan Bazaar / colony nights; dogUpdate asks
 *   N.diwali._dogHide for a hiding dog). 3D through N.view3d.registerLayer('diwali3d').
 * Performance: everything lives round the player only; particles / paper / people are pooled typed arrays or reused
 *   actors; stats() books ms (update), ms2d (2D enqueue + draw), ms3d (3D layer) and their averages.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.addSystem) return;
  const U = N.util;
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const rnd = Math.random;
  const rr = (a, b) => a + rnd() * (b - a);
  const pick = (a) => a[(rnd() * a.length) | 0];
  const hsh = (a, b) => U.hash2(a * 0.613 + 0.29, b * 1.271 + 0.83);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const F = () => N.flags || (N.flags = {});
  const is3D = () => !!(N.view3d && N.view3d.active);
  const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

  /* ================================================================ tuning */
  const TUNE = {
    budget: {
      desk: { sparks: 2400, smoke: 170, litter: 1500, decals: 240, groups: 5, rockets: 24, houses: 80, lights: 12, persons: 26, glows: 900 },
      phone: { sparks: 720, smoke: 64, litter: 560, decals: 110, groups: 3, rockets: 10, houses: 40, lights: 6, persons: 14, glows: 420 },
    },
    range: 560,            // things happen within this of the player (2D); 3D city rockets out to range3d
    range3d: 1100,
    rocketRate: 2.6,       // city rockets per second at intensity 1 (desktop; phones x0.55)
    groupEvery: [3.5, 8],  // seconds between a family's crackers
    bangScare: 170,        // dogs within this of a bang run off and hide
    otherFaithR: 150, respectR: 60, hospitalR: 230,
    litterCell: 24,        // road cells for the night's paper
    litterPerCell: 11,     // seeded bits per cell at full weight and litterLevel 1
    litterR3d: 230,        // 3D: the paper lives this far round the player
    wake: { k: 1, lift: 1, len: 1.25, spread: 0.42 }, // vehicle wake strength / lift / length (x body) / widening
    windAir: 26,           // u/s of air per unit of N.wind strength (a breeze stirs the lightest paper, a gusty day all of it)
    heat: 45,              // Chappal Meter heat for lighting near elders / animals / a hospital
    lightR: 24,            // within this of Amma / Nanna or a family's bucket the player may light one
    elderR: 30, animalR: 40,
    decorShare: { colony: 0.9, rocky: 0.75, posh: 0.8, cantonment: 0.55, colonial: 0.55, oldcity: 0.3, market: 0.35, hitec: 0.15, osmania: 0.5 },
    litterStyle: { colony: 1, rocky: 0.7, posh: 0.65, cantonment: 0.55, colonial: 0.6, oldcity: 0.6, market: 1, hitec: 0.15, osmania: 0.5 },
    dayDecor: { 20: 0.15, 21: 0.2, 22: 0.4, 23: 0.6, 24: 0.9, 25: 1, 26: 0.85 },
    stallHours: [9 * 60, 23 * 60],
    phuljhadiBox: { price: 500, n: 10 },
  };
  let phoneCache = null;
  function PHONE() {
    if (phoneCache != null) return phoneCache;
    try { phoneCache = !!((window.matchMedia && matchMedia('(pointer: coarse)').matches) || Math.min(innerWidth, innerHeight) < 520); } catch (e) { phoneCache = false; }
    return phoneCache;
  }
  const BUD = () => (PHONE() ? TUNE.budget.phone : TUNE.budget.desk);

  /* ================================================================ calendar */
  // fireworks per night (2003): the 22nd/23rd a few; Naraka Chaturdashi (24th) the dawn crackers + a busy
  // evening; Deepavali (25th) the big night; the 26th the leftovers.
  const NIGHTS = { 22: 0.16, 23: 0.26, 24: 0.55, 25: 1, 26: 0.3 };
  function date() {
    try { if (N.calendar && N.calendar.date) { const d = N.calendar.date; return { y: d.y, m: d.m, d: d.d }; } } catch (e) { /* stub */ }
    try { if (N.seasons && N.seasons.date) return N.seasons.date(); } catch (e) { /* stub */ }
    return { y: 2003, m: 1, d: 14 };
  }
  const mins = () => (N.clock && isFinite(N.clock.minutes) ? N.clock.minutes : 720);
  const isOn = (n) => { try { if (N.seasons && N.seasons.is) return N.seasons.is(n); } catch (e) { /* stub */ } return !!F()[n]; };
  const active = () => isOn('diwali');
  const stallsOn = () => isOn('pataakha') || isOn('diwali');
  /** are the pataakha stalls open right now (the week + 09:00-23:00)? */
  const stallsOpen = () => { const m = mins(); return stallsOn() && m >= TUNE.stallHours[0] && m < TUNE.stallHours[1]; };
  /** Diwali-week day number (20..26) or 0 for the date the calendar shows (an override outside the week counts as the 25th). */
  function dayNo() {
    const d = date();
    if (d.y === 2003 && d.m === 10 && d.d >= 20 && d.d <= 26) return d.d;
    return active() ? 25 : 0;
  }
  /** dark enough for crackers: N.clock.isNight() or after 18:20 / before 05:30 */
  function isNight() {
    const m = mins();
    if (m >= 18 * 60 + 20 || m < 5 * 60 + 30) return true;
    try { return !!(N.clock && N.clock.isNight && N.clock.isNight()); } catch (e) { return false; }
  }
  /** 0..1: how many crackers go off right now. */
  function intensity() {
    if (!active()) return 0;
    if (F().dw_force != null) return clamp(+F().dw_force, 0, 1);
    const dn = dayNo(), m = mins(), base = NIGHTS[dn] || 0.3;
    let k = 0;
    if (m >= 17 * 60 + 50) k = smooth((m - (17 * 60 + 50)) / 70);                    // dusk: the first pops
    if (m >= 19 * 60 && m < 23 * 60) k = 1;                                            // the peak
    if (m >= 23 * 60) k = 1 - smooth((m - 23 * 60) / 75) * 0.75;                       // late night
    if (m < 90) k = 0.25 * (1 - m / 90);                                               // past midnight
    if (dn === 24 && m > 4 * 60 + 15 && m < 6 * 60 + 40) k = Math.max(k, 0.45);        // Naraka Chaturdashi dawn
    if (m > 13 * 60 && m < 17 * 60 + 50) k = Math.max(k, 0.03);                        // kids can't wait
    return clamp(base * k, 0, 1);
  }
  /** 0..1: the cracker paper on the roads (accumulates through each night, swept the next afternoon). */
  function litterLevel() {
    if (F().dw_litter != null) return clamp(+F().dw_litter, 0, 1);
    const d = date();
    if (d.y !== 2003 || d.m !== 10 || d.d < 22 || d.d > 27) return active() ? 0.5 : 0;
    const m = mins();
    const night = (n, tonight) => {
      const p = NIGHTS[n] || 0;
      if (!p) return 0;
      if (tonight) return p * smooth((m - 18 * 60 - 30) / 300);                         // tonight's grows
      if (m < 11 * 60) return p;                                                       // the morning after
      if (m < 16 * 60) return p * (1 - 0.7 * smooth((m - 11 * 60) / 300));             // swept
      return p * 0.3;
    };
    return clamp(Math.max(night(d.d, true), night(d.d - 1, false) * (d.d === 27 ? 0.7 : 1)), 0, 1);
  }
  /** 0..1: how far the morning sweep has gone (the swept heaps at the kerbs show 11:00-18:30). */
  function sweepLevel() {
    const d = date();
    if (d.y !== 2003 || d.m !== 10 || d.d < 23 || d.d > 27 || !(NIGHTS[d.d - 1] > 0)) return 0;
    const m = mins();
    if (m < 11 * 60 || m > 18 * 60 + 30) return 0;
    return smooth((m - 11 * 60) / 240) * Math.min(1, NIGHTS[d.d - 1] * 1.6);
  }
  /** 0..1 smoke haze at night (thicker after 21:00). */
  function haze() {
    if (F().dw_haze != null) return clamp(+F().dw_haze, 0, 1);
    if (!active() && dayNo() === 0) return 0;
    const m = mins(), dn = dayNo(), base = NIGHTS[dn] || 0.3;
    let k = 0;
    if (m >= 18 * 60 + 30) k = 0.25 * smooth((m - 18 * 60 - 30) / 120);
    if (m >= 21 * 60) k = 0.25 + 0.75 * smooth((m - 21 * 60) / 120);
    if (m < 6 * 60) k = 0.8 * (1 - smooth(m / 360));
    return clamp(k * base, 0, 1);
  }
  /** diyas burn at dusk and through the evening */
  function lampTime() { const m = mins(); return m >= 17 * 60 + 45 || m < 90 || (dayNo() === 24 && m > 4 * 60 + 15 && m < 6 * 60 + 30); }
  /** 0..1 how much of the colony is decorated today */
  const decorDay = () => (stallsOn() || active() ? (TUNE.dayDecor[dayNo()] || (active() ? 1 : 0)) : 0);

  /* ================================================================ safety: where crackers may go off */
  const OTHER_FAITH = new Set(['mosque', 'church', 'dargah', 'gurudwara', 'ashurkhana', 'tomb', 'charminar']);
  let HOSP = null;
  function hospitals() {
    if (HOSP) return HOSP;
    HOSP = [];
    const P = N.places || {};
    for (const id in P) { const p = P[id]; if (p && (p.kind === 'hospital' || /hospital|nursing_home/.test(id)) && !/compound|^spur_/.test(id) && isFinite(p.x)) HOSP.push(p); }
    return HOSP;
  }
  const okCache = new Map();
  function zoneBox(z) {
    if (z._dwbb) return z._dwbb;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const addR = (r) => { x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]); };
    for (const r of z.rects || []) addR(r);
    for (const r of z.forecourt || []) addR(r);
    for (const p of z.polys || []) for (const q of p) addR([q[0], q[1], 0, 0]);
    for (const l of z.lines || []) for (const q of l.pts) addR([q[0] - l.r, q[1] - l.r, l.r * 2, l.r * 2]);
    Object.defineProperty(z, '_dwbb', { value: [x0, y0, x1, y1], enumerable: false, configurable: true });
    return z._dwbb;
  }
  /** May a cracker go off at (x, y)? Away from respect zones, other faiths' places and hospitals. */
  function fireOK(x, y) {
    if (!isFinite(x) || !isFinite(y)) return false;
    // cached per 8 u cell, decided at the cell's centre (so every point of a cell gets the same, fair answer)
    const ci = Math.floor(x / 8), cj = Math.floor(y / 8), key = ci * 100003 + cj;
    const c = okCache.get(key);
    if (c != null) return c;
    x = ci * 8 + 4; y = cj * 8 + 4;
    let ok = true;
    const RS = N.respect;
    if (RS) {
      try {
        if (RS.at && RS.at(x, y)) ok = false;
        const zones = RS.zones || [];
        for (let i = 0; ok && i < zones.length; i++) {
          const z = zones[i];
          const R0 = OTHER_FAITH.has(z.kind) ? TUNE.otherFaithR : TUNE.respectR;
          const bb = zoneBox(z);
          if (x < bb[0] - R0 || x > bb[2] + R0 || y < bb[1] - R0 || y > bb[3] + R0) continue;
          const d = RS.distance ? RS.distance(x, y, z) : 0;
          if (d < R0) ok = false;
        }
      } catch (e) { /* respect optional */ }
    }
    if (ok) for (const h of hospitals()) if (Math.hypot(h.x - x, h.y - y) < TUNE.hospitalR) { ok = false; break; }
    if (okCache.size > 40000) okCache.clear();
    okCache.set(key, ok);
    return ok;
  }
  N.on('respect:change', () => okCache.clear());

  /* ================================================================ particle pools */
  // sparks (struct of arrays): world x, y, height h (2D units; 3D y = h * VS), velocity, age, life, size,
  // colour index into COLS, kind: 0 spark (gravity + drag), 1 glitter (twinkles), 2 trail (no gravity),
  // 3 willow (heavy drag, slow fall), 4 ground spark (fountain / chakri: bounces on the ground), 5 comet (palm)
  const COLS = ['#ffd24a', '#ff5a3a', '#4ad2ff', '#7aff6a', '#ff6ad8', '#ffffff', '#ffa030', '#b48aff', '#ffe8b0'];
  const COLS_RGB = COLS.map(hexRGB);
  const SP = { n: 0, cap: 2600 };
  SP.x = new Float32Array(SP.cap); SP.y = new Float32Array(SP.cap); SP.h = new Float32Array(SP.cap);
  SP.vx = new Float32Array(SP.cap); SP.vy = new Float32Array(SP.cap); SP.vh = new Float32Array(SP.cap);
  SP.t = new Float32Array(SP.cap); SP.life = new Float32Array(SP.cap); SP.size = new Float32Array(SP.cap);
  SP.col = new Uint8Array(SP.cap); SP.kind = new Uint8Array(SP.cap);
  function spark(x, y, h, vx, vy, vh, life, col, size, kind) {
    if (SP.n >= Math.min(SP.cap, BUD().sparks)) return -1;
    const i = SP.n++;
    SP.x[i] = x; SP.y[i] = y; SP.h[i] = h; SP.vx[i] = vx; SP.vy[i] = vy; SP.vh[i] = vh;
    SP.t[i] = 0; SP.life[i] = life; SP.col[i] = col; SP.size[i] = size || 1; SP.kind[i] = kind || 0;
    return i;
  }
  function killSpark(i) {
    const j = --SP.n;
    if (i !== j) {
      SP.x[i] = SP.x[j]; SP.y[i] = SP.y[j]; SP.h[i] = SP.h[j]; SP.vx[i] = SP.vx[j]; SP.vy[i] = SP.vy[j]; SP.vh[i] = SP.vh[j];
      SP.t[i] = SP.t[j]; SP.life[i] = SP.life[j]; SP.size[i] = SP.size[j]; SP.col[i] = SP.col[j]; SP.kind[i] = SP.kind[j];
    }
  }
  const _wv = { x: 0, y: 0, s: 0 };
  function windVec(x, y) {
    const W = N.wind;
    if (W && W.at) { try { W.at(x, y, _wv); _wv.x *= _wv.s; _wv.y *= _wv.s; return _wv; } catch (e) { /* atmosphere optional */ } }
    _wv.x = 0.15; _wv.y = 0.05; _wv.s = 0.16; return _wv;
  }
  function updateSparks(dt) {
    const w = windVec(N.player ? N.player.x : 0, N.player ? N.player.y : 0), wx = w.x * 6 * dt, wy = w.y * 6 * dt;
    for (let i = SP.n - 1; i >= 0; i--) {
      SP.t[i] += dt;
      if (SP.t[i] >= SP.life[i]) { killSpark(i); continue; }
      const k = SP.kind[i];
      let drag = 1.6, g = 28;
      if (k === 2) { drag = 3; g = 0; } else if (k === 3) { drag = 2.6; g = 9; } else if (k === 1) { drag = 2.0; g = 16; } else if (k === 4) { drag = 1.2; g = 46; } else if (k === 5) { drag = 0.9; g = 20; }
      const f = Math.max(0, 1 - drag * dt);
      SP.vx[i] = SP.vx[i] * f + wx; SP.vy[i] = SP.vy[i] * f + wy; SP.vh[i] = SP.vh[i] * f - g * dt;
      SP.x[i] += SP.vx[i] * dt; SP.y[i] += SP.vy[i] * dt; SP.h[i] += SP.vh[i] * dt;
      if (k === 5 && rnd() < dt * 30) spark(SP.x[i], SP.y[i], SP.h[i], rr(-2, 2), rr(-2, 2), rr(-4, 0), rr(0.3, 0.6), 8, 0.7, 2); // the palm's glittering tail
      if (SP.h[i] < 0) { if (k === 4) { SP.h[i] = 0; SP.vh[i] *= -0.3; SP.vx[i] *= 0.5; SP.vy[i] *= 0.5; } else { killSpark(i); } }
    }
  }
  // smoke puffs
  const SMK = ['x', 'y', 'h', 'vx', 'vy', 'vh', 't', 'life', 'size', 'a'];
  const SM = { n: 0, cap: 200 };
  for (const k of SMK) SM[k] = new Float32Array(SM.cap);
  function smoke(x, y, h, size, life, a, vh) {
    if (SM.n >= Math.min(SM.cap, BUD().smoke)) return;
    const i = SM.n++;
    SM.x[i] = x; SM.y[i] = y; SM.h[i] = h; SM.vx[i] = rr(-3, 3); SM.vy[i] = rr(-3, 3); SM.vh[i] = vh == null ? rr(3, 7) : vh;
    SM.t[i] = 0; SM.life[i] = life; SM.size[i] = size; SM.a[i] = a == null ? 0.5 : a;
  }
  function updateSmoke(dt) {
    const w = windVec(N.player ? N.player.x : 0, N.player ? N.player.y : 0);
    for (let i = SM.n - 1; i >= 0; i--) {
      SM.t[i] += dt;
      if (SM.t[i] >= SM.life[i]) {
        const j = --SM.n;
        if (i !== j) for (const k of SMK) SM[k][i] = SM[k][j];
        continue;
      }
      SM.vx[i] += (w.x * 9 - SM.vx[i]) * dt * 0.5; SM.vy[i] += (w.y * 9 - SM.vy[i]) * dt * 0.5;
      SM.x[i] += SM.vx[i] * dt; SM.y[i] += SM.vy[i] * dt; SM.h[i] += SM.vh[i] * dt; SM.vh[i] *= 1 - dt * 0.3;
      SM.size[i] += dt * 2.2;
    }
  }
  // flashes: a burst / bang lighting up the sky and the ground (2D glow + light pool; 3D glow + point light)
  const FLASH = [];
  function flash(x, y, h, col, r, life, inten) {
    if (FLASH.length > 40) FLASH.shift();
    FLASH.push({ x, y, h, col, r, t: 0, life, inten: inten == null ? 1 : inten });
  }
  function updateFlashes(dt) { for (let i = FLASH.length - 1; i >= 0; i--) { const f = FLASH[i]; f.t += dt; if (f.t >= f.life) FLASH.splice(i, 1); } }
  const flashK = (f) => { const u = f.t / f.life; return (u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88) * f.inten; };

  /* ================================================================ audio */
  const A = () => N.audio;
  function sfx(name, o) {
    const a = A(); if (!a || !a.sfx) return false;
    try { return a.sfx(name, o || {}); } catch (e) { return false; }
  }
  /** a sound at a world point; far ones arrive a little later (the sound travels) */
  function sfxAt(name, x, y, vol, o) {
    const p = N.player; if (!p) return;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d > 760) return;
    const opt = SFXO; for (const k in opt) delete opt[k];
    opt.x = x; opt.y = y; opt.vol = vol == null ? 1 : vol; opt.delay = Math.min(1.2, d / 650);
    if (o) for (const k in o) opt[k] = o[k];
    sfx(name, opt);
  }
  const SFXO = {};
  let sfxReady = false;
  function registerSounds() {
    const X = A() && A().ext;
    if (!X || !X.registerSfx || sfxReady) return;
    sfxReady = true;
    const P = X.P;
    const crackles = (ac, out, t, n, dur, v, f0) => {
      let end = t;
      for (let i = 0; i < n; i++) end = Math.max(end, P.burst(ac, out, t + Math.random() * dur, { ft: 'highpass', f: (f0 || 2600) + Math.random() * 3000, q: 0.7, a: 0.0008, r: 0.012 + Math.random() * 0.02, v: v * (0.4 + Math.random() * 0.6) }));
      return end;
    };
    X.registerSfx('dw_crackle', (ac, out, t, o) => crackles(ac, out, t, 18 + ((o.n || 0) | 0), 0.7, 0.5 * (o.vol || 1)), { cooldown: 0.08, caption: 'crackle' });
    X.registerSfx('dw_sparkler', (ac, out, t, o) => {
      const v = (o.vol == null ? 1 : o.vol) * 0.22;
      P.burst(ac, out, t, { ft: 'bandpass', f: 5200, q: 0.8, a: 0.05, h: 1.0, r: 0.3, v: v * 0.5 });
      return crackles(ac, out, t, 26, 1.3, v, 3800);
    }, { cooldown: 0.5, caption: 'phuljhadi fizz' });
    X.registerSfx('dw_anaar', (ac, out, t, o) => {
      const v = (o.vol == null ? 1 : o.vol) * 0.4;
      const nv = P.noiseVoice(ac, out, t, 3.2, 'white', 'bandpass', 3400, 0.9);
      nv.g.gain.setValueAtTime(0, t); nv.g.gain.linearRampToValueAtTime(v, t + 0.25); nv.g.gain.setValueAtTime(v, t + 2.4); nv.g.gain.linearRampToValueAtTime(0, t + 3.1);
      nv.f.frequency.setValueAtTime(2600, t); nv.f.frequency.linearRampToValueAtTime(4200, t + 2.8);
      crackles(ac, out, t + 0.3, 30, 2.6, v * 0.6, 3000);
      return t + 3.25;
    }, { cooldown: 0.6, caption: 'anaar hiss' });
    X.registerSfx('dw_rocket', (ac, out, t, o) => {
      const v = (o.vol == null ? 1 : o.vol) * 0.24, d = 1.1 + Math.random() * 0.5, f0 = 1500 + Math.random() * 500;
      P.tone(ac, out, t, { type: 'triangle', f: f0, f2: f0 * 2.1, glide: d, a: 0.04, h: d - 0.2, r: 0.15, v, vib: [11, 40] });
      P.burst(ac, out, t, { ft: 'highpass', f: 2500, q: 0.5, a: 0.02, h: d * 0.6, r: 0.3, v: v * 0.45 });
      return t + d + 0.3;
    }, { cooldown: 0.25, caption: 'rocket whistle ↑' });
    X.registerSfx('dw_burst', (ac, out, t, o) => {
      const v = (o.vol == null ? 1 : o.vol) * 0.55;
      P.tone(ac, out, t, { type: 'sine', f: 78, f2: 34, glide: 0.35, a: 0.003, r: 0.45, v });
      P.burst(ac, out, t, { ft: 'lowpass', f: 1500, f2: 260, sweep: 0.5, q: 0.6, a: 0.002, r: 0.55, v: v * 0.8 });
      if (o.variant === 'crackle') crackles(ac, out, t + 0.35, 40, 1.4, v * 0.35, 2200);
      return t + (o.variant === 'crackle' ? 1.9 : 0.8);
    }, { cooldown: 0.12, caption: 'BOOM' });
    X.registerSfx('dw_far', (ac, out, t, o) => {
      const v = (o.vol == null ? 0.3 : o.vol) * 0.4;
      P.tone(ac, out, t, { type: 'sine', f: 55 + Math.random() * 20, f2: 30, glide: 0.4, a: 0.01, r: 0.6, v });
      P.burst(ac, out, t, { ft: 'lowpass', f: 420, q: 0.5, a: 0.01, r: 0.7, v: v * 0.7 });
      return t + 1;
    }, { cooldown: 0.05 });
    X.registerSfx('dw_bomb', (ac, out, t, o) => {
      const v = (o.vol == null ? 1 : o.vol) * 0.7;
      const sh = P.shaper(ac, 3.5, out);
      P.burst(ac, sh, t, { ft: 'lowpass', f: 5200, f2: 600, sweep: 0.2, q: 0.4, a: 0.0006, r: 0.22, v });
      P.tone(ac, out, t, { type: 'sine', f: 110, f2: 40, glide: 0.25, a: 0.001, r: 0.35, v: v * 0.9 });
      P.burst(ac, out, t + 0.16, { ft: 'lowpass', f: 900, q: 0.5, a: 0.02, r: 0.6, v: v * 0.18 }); // the echo off the houses
      return t + 0.9;
    }, { cooldown: 0.1, caption: 'DHAAM!' });
    X.registerSfx('dw_ladi', (ac, out, t, o) => { // a string of a hundred small crackers: a rattling run of pops
      const v = (o.vol == null ? 1 : o.vol) * 0.42, dur = o.dur || 2.4, n = Math.round(dur * 22);
      let e = t;
      for (let i = 0; i < n; i++) {
        const tt = t + (i / n) * dur + Math.random() * 0.03;
        e = Math.max(e, P.burst(ac, out, tt, { ft: 'bandpass', f: 1400 + Math.random() * 2200, q: 0.6, a: 0.0008, r: 0.03 + Math.random() * 0.03, v: v * (0.5 + Math.random() * 0.5) }));
      }
      return e;
    }, { cooldown: 0.4, caption: 'tadatadatada!' });
    X.registerSfx('dw_match', (ac, out, t, o) => {
      const v = (o.vol == null ? 1 : o.vol) * 0.3;
      P.burst(ac, out, t, { ft: 'bandpass', f: 2400, q: 1.2, a: 0.005, h: 0.06, r: 0.05, v });
      P.burst(ac, out, t + 0.08, { ft: 'lowpass', f: 1200, q: 0.6, a: 0.02, h: 0.2, r: 0.25, v: v * 0.6 });
      return t + 0.6;
    }, { cooldown: 0.15, ui: false, caption: 'match strike' });
    X.registerSfx('dw_fizzle', (ac, out, t, o) => { // a dud: phusss
      const v = (o.vol == null ? 1 : o.vol) * 0.25;
      P.burst(ac, out, t, { ft: 'bandpass', f: 3000, f2: 1200, sweep: 0.5, q: 0.7, a: 0.03, h: 0.25, r: 0.35, v });
      return t + 0.7;
    }, { cooldown: 0.3, caption: 'phusss…' });
    X.registerSfx('dw_whimper', (ac, out, t, o) => {
      const v = (o.vol == null ? 1 : o.vol) * 0.18;
      let e = t;
      for (let i = 0; i < 3; i++) e = P.tone(ac, out, t + i * 0.32, { type: 'triangle', f: 980 - i * 40, f2: 640, glide: 0.24, a: 0.02, h: 0.12, r: 0.12, v, vib: [24, 18] });
      return e;
    }, { cooldown: 1.2, caption: 'a dog whimpers' });
  }

  /* ================================================================ fireworks */
  const ROCKETS = [];
  const EMIT = [];          // ground emitters: anaar, chakri, sparkler, bomb, ladi, bottle rocket fuse
  const BURSTS = ['peony', 'peony', 'ring', 'willow', 'crackle', 'multi', 'peony', 'willow', 'palm', 'multi'];
  const STATS = { rockets: 0, bursts: 0, bombs: 0, duds: 0, ladis: 0, anaars: 0, chakris: 0, sparklers: 0, scatters: 0, scared: 0, comforted: 0, lit: 0, stopped: 0, ms: 0, ms2d: 0, ms3d: 0, msAvg: 0, ms2dAvg: 0, ms3dAvg: 0 };
  /** launch a rocket from (x, y); opts {h (start height), type, col, big, silent, vx, vy, vh, fuse, force, onBurst} */
  function rocket(x, y, o) {
    o = o || {};
    if (ROCKETS.length >= BUD().rockets && !o.force) return null;
    const r = {
      x, y, h: o.h || 1, vx: o.vx != null ? o.vx : rr(-6, 6), vy: o.vy != null ? o.vy : rr(-6, 6), vh: o.vh || rr(112, 150),
      t: 0, fuse: o.fuse || rr(1.05, 1.5), type: o.type || pick(BURSTS), col: o.col != null ? o.col : (rnd() * 8) | 0,
      big: o.big || 1, silent: !!o.silent, trailT: 0, wobble: o.wobble || 0, onBurst: o.onBurst || null,
    };
    ROCKETS.push(r); STATS.rockets++;
    if (!r.silent) sfxAt('dw_rocket', x, y, 0.7);
    return r;
  }
  const _u = { x: 0, y: 0, z: 0 };
  function sphere(out) { const u = rnd() * 2 - 1, ph = rnd() * TAU, s = Math.sqrt(1 - u * u); out.x = s * Math.cos(ph); out.y = s * Math.sin(ph); out.z = u; return out; }
  /** a shell bursting at (x, y, h): type peony | ring | willow | crackle | multi | palm; col 0..8; big ~1 */
  function burst(x, y, h, type, col, big) {
    big = big || 1; type = type || 'peony'; col = col == null ? (rnd() * 8) | 0 : col;
    const phone = PHONE();
    const n = Math.round((phone ? 36 : 72) * big * (type === 'ring' ? 0.7 : type === 'palm' ? 0.22 : 1));
    const sp = (68 + rnd() * 22) * Math.sqrt(big);
    const col2 = (col + 3) % 8;
    const ra = rnd() * TAU, rc = Math.cos(ra), rs = Math.sin(ra), tilt = rr(0.2, 0.9);
    for (let i = 0; i < n; i++) {
      let vx, vy, vh;
      if (type === 'ring') { const a = (i / n) * TAU, cx = Math.cos(a) * sp, cy = Math.sin(a) * sp; vx = cx * rc - cy * rs * tilt; vy = cx * rs + cy * rc * tilt; vh = cy * Math.sqrt(1 - tilt * tilt); }
      else { sphere(_u); const s2 = sp * (0.82 + rnd() * 0.18); vx = _u.x * s2; vy = _u.y * s2; vh = _u.z * s2; }
      if (type === 'willow') spark(x, y, h, vx * 0.8, vy * 0.8, vh * 0.8 + 6, rr(2.4, 3.2), rnd() < 0.5 ? 0 : 8, 1.3, 3);
      else if (type === 'crackle') spark(x, y, h, vx * 0.9, vy * 0.9, vh * 0.9, rr(1.3, 1.9), rnd() < 0.6 ? 5 : 8, 1.1, 1);
      else if (type === 'palm') spark(x, y, h, vx * 0.9, vy * 0.9, Math.abs(vh) * 0.5 + 12, rr(1.6, 2.2), rnd() < 0.5 ? 0 : 6, 1.7, 5);
      else spark(x, y, h, vx, vy, vh, rr(1.2, 1.9), type === 'multi' && i % 2 ? col2 : col, 1.25, 0);
    }
    if (type === 'peony' && rnd() < 0.4) for (let i = 0; i < n * 0.25; i++) { sphere(_u); spark(x, y, h, _u.x * sp * 0.4, _u.y * sp * 0.4, _u.z * sp * 0.4, rr(0.9, 1.3), 5, 1, 1); } // a white pistil
    const fc = COLS[type === 'willow' || type === 'palm' ? 0 : col];
    flash(x, y, h, fc, 230 * Math.sqrt(big), 0.55, 1);
    flash(x, y, h, fc, sp * 2.6, 1.7, 0.32); // the glow of the burst's cloud, fading
    for (let i = 0; i < 2; i++) smoke(x + rr(-8, 8), y + rr(-8, 8), h + rr(-6, 6), 9 * big, rr(5, 8), 0.16, rr(-1, 1));
    STATS.bursts++;
    const p = N.player;
    if (p) {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < 760) sfxAt('dw_burst', x, y, 0.75 * Math.min(1.3, big), { variant: type === 'crackle' ? 'crackle' : null });
      else if (d < 1700) sfx('dw_far', { vol: 0.35 * (1 - d / 1800), delay: Math.min(2.5, d / 650) });
    }
  }
  function updateRockets(dt) {
    for (let i = ROCKETS.length - 1; i >= 0; i--) {
      const r = ROCKETS[i];
      r.t += dt;
      r.vh -= 30 * dt;
      if (r.wobble) { r.vx += Math.sin(r.t * 13) * r.wobble * dt; r.vy += Math.cos(r.t * 11) * r.wobble * dt; }
      r.x += r.vx * dt; r.y += r.vy * dt; r.h += r.vh * dt;
      r.trailT -= dt;
      if (r.trailT <= 0) { r.trailT = PHONE() ? 0.045 : 0.022; spark(r.x, r.y, r.h, rr(-3, 3), rr(-3, 3), rr(-8, -2), rr(0.35, 0.6), 6, 0.9, 2); }
      if (r.t >= r.fuse || r.vh < 8 || r.h < 0) {
        ROCKETS.splice(i, 1);
        if (r.h > 4) {
          burst(r.x, r.y, r.h, r.type, r.col, r.big);
          if (r.onBurst) { try { r.onBurst(r); } catch (e) { N.err('diwali.onBurst', e); } }
        }
      }
    }
  }
  /** ground emitters: kind 'anaar' | 'chakri' | 'sparkler' | 'bomb' | 'ladi' | 'bottle'; opts {holder, dur, fuse, big, a (ladi
   *  direction), len (ladi length), rocket (bottle: rocket() opts), onEnd(e), onLaunch(rocket), by (who lit it)} */
  function emitter(kind, x, y, o) {
    if (EMIT.length > 22 && kind !== 'bomb' && kind !== 'bottle' && !(o && o.force)) return null;
    const e = Object.assign({ kind, x, y, h: 0, t: 0, dur: 0, acc: 0, sndT: 0, ang: rnd() * TAU, holder: null, a: rnd() * TAU, len: 14, pops: 0 }, o || {});
    if (kind === 'anaar') { e.dur = e.dur || rr(8, 11); STATS.anaars++; }
    else if (kind === 'chakri') { e.dur = e.dur || rr(6, 8); STATS.chakris++; }
    else if (kind === 'sparkler') { e.dur = e.dur || rr(9, 13); STATS.sparklers++; }
    else if (kind === 'bomb') { e.dur = e.fuse || rr(1.8, 2.6); e.big = e.big || 1; }
    else if (kind === 'bottle') { e.dur = e.fuse || 1.4; }
    else if (kind === 'ladi') { e.fuse = e.fuse || 1.6; e.n = Math.round(e.len * 3.2); e.dur = e.fuse + e.n / 24 + 0.4; STATS.ladis++; }
    e.x0 = e.x; e.y0 = e.y;
    EMIT.push(e);
    return e;
  }
  const anaar = (x, y, o) => emitter('anaar', x, y, o);
  const chakri = (x, y, o) => emitter('chakri', x, y, o);
  const bomb = (x, y, o) => emitter('bomb', x, y, o);
  const ladi = (x, y, o) => emitter('ladi', x, y, o);
  function holderHand(e, out) {
    const a = e.holder, ang = a.facing != null ? a.facing : (a.angle || 0);
    out.x = a.x + Math.cos(ang) * 2.6 + Math.cos(ang + PI / 2) * 1.3; out.y = a.y + Math.sin(ang) * 2.6 + Math.sin(ang + PI / 2) * 1.3;
    return out;
  }
  /** is anyone (the player, a person, an animal, a vehicle) within r of (x, y)? (bombs fizzle rather than go off by someone) */
  const _near = [];
  function someoneNear(x, y, r, except) {
    const p = N.player;
    if (p && p !== except && Math.hypot(p.x - x, p.y - y) < r) return true;
    _near.length = 0;
    try { N.entities.query(x, y, r, null, _near); } catch (e) { return false; }
    for (const q of _near) if (q !== except && q.alive && (q.kind === 'ped' || q.kind === 'npc' || q.kind === 'animal' || (q.kind === 'vehicle' && Math.hypot(q.vx, q.vy) > 5))) return true;
    return false;
  }
  function updateEmitters(dt) {
    const p = N.player;
    for (let i = EMIT.length - 1; i >= 0; i--) {
      const e = EMIT[i];
      e.t += dt;
      const near = p ? Math.hypot(e.x - p.x, e.y - p.y) : 1e9;
      const left = e.dur - e.t;
      switch (e.kind) {
        case 'anaar': {
          const k = e.t < 0.6 ? e.t / 0.6 : left < 1.5 ? Math.max(0, left / 1.5) : 1;
          e.acc += dt * (PHONE() ? 55 : 120) * k;
          while (e.acc >= 1) { e.acc -= 1; const a = rnd() * TAU, s = rr(4, 14) * k; spark(e.x, e.y, 1.6, Math.cos(a) * s, Math.sin(a) * s, rr(38, 70) * (0.5 + 0.5 * k), rr(0.8, 1.4), pick([0, 6, 8, 8, 5]), 1, 4); }
          if (k > 0.2) { e.sndT -= dt; if (e.sndT <= 0 && near < 380) { e.sndT = 3; sfxAt('dw_anaar', e.x, e.y, 0.8); } }
          if (rnd() < dt * 3) smoke(e.x, e.y, 3, 3, 4, 0.2, 5);
          break;
        }
        case 'chakri': {
          e.ang += dt * 26;
          e.x += Math.cos(e.t * 1.7) * dt * 3; e.y += Math.sin(e.t * 1.3) * dt * 3;
          const k = left < 1 ? Math.max(0, left) : 1;
          e.acc += dt * (PHONE() ? 45 : 90) * k;
          while (e.acc >= 1) {
            e.acc -= 1;
            const a = e.ang + rnd() * 0.6, tx = -Math.sin(a), ty = Math.cos(a), s = rr(28, 46);
            spark(e.x + Math.cos(a) * 1.4, e.y + Math.sin(a) * 1.4, 0.6, tx * s, ty * s, rr(2, 9), rr(0.35, 0.7), pick([0, 1, 3, 6]), 0.9, 4);
          }
          e.sndT -= dt; if (e.sndT <= 0 && near < 300) { e.sndT = 0.7; sfxAt('dw_crackle', e.x, e.y, 0.5); }
          break;
        }
        case 'sparkler': {
          if (e.holder) { if (e.holder.alive === false) { e.t = e.dur; } else holderHand(e, e); e.h = e.holder === N.player ? 4.2 : (e.holder.look && e.holder.look.kind === 'kid' ? 3.3 : 4.0); }
          e.acc += dt * (PHONE() ? 22 : 46);
          while (e.acc >= 1) { e.acc -= 1; const a = rnd() * TAU, s = rr(8, 18); spark(e.x, e.y, e.h, Math.cos(a) * s, Math.sin(a) * s, rr(-6, 10), rr(0.25, 0.55), rnd() < 0.7 ? 8 : 5, 0.75, 1); }
          e.sndT -= dt; if (e.sndT <= 0 && near < 160) { e.sndT = 1.3; sfxAt('dw_sparkler', e.x, e.y, 0.6); }
          break;
        }
        case 'bomb': case 'bottle': {
          if (rnd() < dt * 22) spark(e.x, e.y, 0.8, rr(-6, 6), rr(-6, 6), rr(4, 10), rr(0.15, 0.3), 6, 0.7, 4); // the fuse fizz
          break;
        }
        case 'ladi': { // the string lies along the road; the fuse runs to its far end, then it pops back along it
          if (e.t < e.fuse) { if (rnd() < dt * 22) spark(e.x0, e.y0, 0.5, rr(-5, 5), rr(-5, 5), rr(3, 8), rr(0.15, 0.3), 6, 0.6, 4); break; }
          const want = Math.min(e.n, Math.floor((e.t - e.fuse) * 24));
          if (e.pops === 0 && want > 0) sfxAt('dw_ladi', e.x0, e.y0, 0.9, { dur: e.n / 24 });
          while (e.pops < want) {
            const u = e.pops / e.n, px = e.x0 + Math.cos(e.a) * e.len * u + rr(-0.6, 0.6), py = e.y0 + Math.sin(e.a) * e.len * u + rr(-0.6, 0.6);
            e.x = px; e.y = py;
            for (let k = 0; k < 3; k++) { const a = rnd() * TAU, s = rr(14, 36); spark(px, py, 0.5, Math.cos(a) * s, Math.sin(a) * s, rr(4, 18), rr(0.08, 0.2), pick([5, 8, 0]), 0.8, 4); }
            if (e.pops % 3 === 0) flash(px, py, 1.5, '#fff0c0', 40, 0.12, 0.6);
            if (e.pops % 4 === 0) smoke(px, py, 1.5, rr(2, 3.5), rr(4, 7), 0.32, rr(2, 4));
            scatter(px, py, 2, { spread: 0.7 });
            e.pops++;
          }
          break;
        }
        default: break;
      }
      if (e.t >= e.dur) {
        EMIT.splice(i, 1);
        if (e.kind === 'bomb') { if (someoneNear(e.x, e.y, 6.5, null)) fizzle(e.x, e.y); else bang(e.x, e.y, e.big || 1); }
        else if (e.kind === 'bottle') { const r = rocket(e.x, e.y, Object.assign({ h: 3, force: true, vx: rr(-3, 3), vy: rr(-3, 3) }, e.rocket || {})); if (e.onLaunch) { try { e.onLaunch(r); } catch (er) { N.err('diwali.bottle', er); } } }
        else if (e.kind === 'anaar' || e.kind === 'chakri') { scatter(e.x, e.y, 3, { burnt: true, spread: 0.3 }); }
        else if (e.kind === 'ladi') onBang(e.x0, e.y0, 0.8);
        if (e.onEnd) { try { e.onEnd(e); } catch (er) { N.err('diwali.emit', er); } }
      }
    }
  }
  /** a dud: someone walked up to it, so it only fizzles (nobody is ever near a bang) */
  function fizzle(x, y) {
    STATS.duds++;
    for (let i = 0; i < 6; i++) spark(x, y, 0.8, rr(-8, 8), rr(-8, 8), rr(4, 12), rr(0.2, 0.4), 6, 0.7, 4);
    smoke(x, y, 1.5, 2.5, 5, 0.35, 3);
    sfxAt('dw_fizzle', x, y, 0.7);
  }
  /** a bijli / laxmi bomb going off: flash, smoke puff, red paper scatter, the dogs run */
  function bang(x, y, big) {
    big = big || 1;
    STATS.bombs++;
    flash(x, y, 2, '#fff4d0', 120 * big, 0.25, 1.4);
    for (let i = 0; i < 18; i++) { const a = rnd() * TAU, s = rr(30, 70); spark(x, y, 1, Math.cos(a) * s, Math.sin(a) * s, rr(10, 40), rr(0.15, 0.4), pick([5, 8, 0]), 1, 4); }
    for (let i = 0; i < 4; i++) smoke(x + rr(-3, 3), y + rr(-3, 3), 2, rr(4, 7) * big, rr(5, 8), 0.42, rr(3, 6));
    scatter(x, y, Math.round(24 * big), { spread: 1 });
    soot(x, y, 0.9 + big * 0.3);
    sfxAt('dw_bomb', x, y, Math.min(1.3, 0.8 * big));
    const p = N.player; if (p && Math.hypot(p.x - x, p.y - y) < 90 && N.render && N.render.shake) N.render.shake(0.6 * big, 0.15);
    onBang(x, y, big);
  }

  /* ================================================================ animals */
  const DOGS = [];          // dogs other modules register (the missions' Tiger): scared by bangs too
  /** animals and birds react to a bang */
  function onBang(x, y, power) {
    const T = N.traffic, R0 = TUNE.bangScare * Math.sqrt(power || 1);
    try {
      if (T && T.animals) for (const a of T.animals) {
        if (!a.alive) continue;
        const d = Math.hypot(a.x - x, a.y - y);
        if (d > R0) continue;
        if (a.species === 'dog' && !(a.fedT > 0) && !(a.dwHide > 0)) hideDog(a, x, y);
        else if (a.species === 'cow' && T.wakeCow) T.wakeCow(a, rr(0.2, 0.7));
      }
      if (T && T.scarePigeons) T.scarePigeons(x, y, 120);
      if (N.birds && N.birds.scare) N.birds.scare(x, y, 160);
    } catch (e) { N.err('diwali.scare', e); }
    for (const d of DOGS) if (d.alive !== false && !(d.dwHide > 0) && !d.dwCalm && Math.hypot(d.x - x, d.y - y) < R0) { if (d.onBang) { try { d.onBang(x, y); } catch (e) { N.err('diwali.dog', e); } } else hideDog(d, x, y); }
  }
  /** a dog runs off from (fx, fy) (default: away from the player) and hides by a wall for a while */
  function hideDog(a, fx, fy, o) {
    if (!a || !N.world) return false;
    o = o || {};
    if (fx == null) { const p = N.player; fx = p ? p.x : a.x - 1; fy = p ? p.y : a.y; }
    const ang = Math.atan2(a.y - fy, a.x - fx) || 0;
    let spot = o.spot || null;
    for (let k = 0; k < 10 && !spot; k++) {
      const an = ang + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35, dd = rr(55, 95);
      const tx = a.x + Math.cos(an) * dd, ty = a.y + Math.sin(an) * dd;
      if (!N.world.isWalkable(tx, ty)) continue;
      if (N.world.surfaceAt(tx, ty) === N.SURF.ROAD) continue;
      if (N.world.raycast && N.world.raycast(a.x, a.y, tx, ty, 'walk').hit && k < 6) continue;
      spot = { x: tx, y: ty };
    }
    if (!spot && N.world.findFree) spot = N.world.findFree(a.x + Math.cos(ang) * 60, a.y + Math.sin(ang) * 60, 'walk', 20);
    if (!spot) return false;
    a.dwHide = o.secs || rr(35, 60); a.dwSpot = spot; a.dwWhT = rr(1, 4); a.dwCalm = false; a.dwFrom = { x: fx, y: fy };
    if (a.state === 'chase') { a.state = 'wander'; a.target = null; }
    STATS.scared++;
    N.emit('diwali:dog', { dog: a, hide: true, spot });
    return true;
  }
  /** one step of a hiding dog. traffic.js calls it for its dogs ("[diwali hook]", step = its stepAnimal); other
   *  dogs (DOGS) are stepped by this module with a plain walk. Returns true while the dog is hiding. */
  function dogHide(a, dt, step) {
    a.dwHide -= dt;
    if (a.dwHide <= 0 || !a.dwSpot) { a.dwHide = 0; a.dwSpot = null; if (a.state === 'nap' && !a.dwCalm) a.state = 'wander'; a.goal = null; a.dwCalm = false; return false; }
    if (a.dwCalm) { a.vx = a.vy = 0; a.state = 'nap'; return true; }
    const d = Math.hypot(a.dwSpot.x - a.x, a.dwSpot.y - a.y);
    if (d > 4) { a.state = 'wander'; (step || walkStep)(a, a.dwSpot.x, a.dwSpot.y, d > 30 ? 92 : 45, dt); }
    else { a.vx = a.vy = 0; a.state = 'nap'; a.dwWhT -= dt; if (a.dwWhT <= 0) { a.dwWhT = rr(4, 9); sfxAt('dw_whimper', a.x, a.y, 0.5); } }
    return true;
  }
  function walkStep(a, tx, ty, speed, dt) {
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    if (d < 1) { a.vx = a.vy = 0; return d; }
    const s = Math.min(speed, d * 4);
    a.vx = (dx / d) * s; a.vy = (dy / d) * s;
    const c = N.world.collide(a.x + a.vx * dt, a.y + a.vy * dt, a.r || 3, 'walk');
    if (!c.bad) { a.x = c.x; a.y = c.y; }
    a.angle = Math.atan2(dy, dx);
    if (a.anim && typeof a.anim === 'number') a.anim += s * dt * 0.3;
    return d;
  }
  /** comfort a hiding dog: it calms down, stops whimpering and gets up a little later (a gentle moment) */
  function calmDog(a) {
    if (!a || !(a.dwHide > 0) || a.dwCalm) return false;
    a.dwCalm = true; a.dwHide = Math.min(a.dwHide, rr(6, 9)); a.dwHeartT = 2.2;
    STATS.comforted++;
    N.emit('diwali:comfort', { dog: a });
    try { if (N.dialogue && N.dialogue.bark && N.player) N.dialogue.bark(N.player, pick(['Shh, shh... it\'s okay.', 'Arre, don\'t be scared, ra.', 'Only crackers. I\'m here.']), { secs: 2.2 }); } catch (e) { /* bark optional */ }
    return true;
  }
  function hidingDogs() {
    const out = [];
    const T = N.traffic;
    if (T && T.animals) for (const a of T.animals) if (a.alive && a.species === 'dog' && a.dwHide > 0) out.push(a);
    for (const d of DOGS) if (d.alive !== false && d.dwHide > 0 && out.indexOf(d) < 0) out.push(d);
    return out;
  }
  const HEARTS = [];
  function updateDogs(dt) {
    HEARTS.length = 0;
    for (const a of hidingDogs()) if (a.dwHeartT > 0) { a.dwHeartT -= dt; HEARTS.push(a); }
    for (let i = DOGS.length - 1; i >= 0; i--) {
      const d = DOGS[i];
      if (d.alive === false) { DOGS.splice(i, 1); continue; }
      if (d.dwHide > 0 && !d.dwOwnStep) dogHide(d, dt, null);
    }
    const p = N.player;
    if (!p || p.vehicle || N.state.mode !== 'play') return;
    // "Comfort the dog": a hiding dog napping by its wall, the player close and on foot
    let best = null, bd = 16;
    for (const a of hidingDogs()) {
      if (a.dwCalm || !a.dwSpot || Math.hypot(a.dwSpot.x - a.x, a.dwSpot.y - a.y) > 6) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < bd) { bd = d; best = a; }
    }
    if (best && N.interact && N.interact.offer) { const dog = best; N.interact.offer({ label: 'Comfort the dog', priority: 4, dist: bd, use: () => calmDog(dog) }); }
  }

  /* ================================================================ litter: red cracker paper on the roads */
  // Three layers: DECALS (trodden-in paper patches seeded per road cell: they stay put), HEAPS (swept to the kerb
  // the next morning) and BITS (loose paper pieces, struct of arrays, pooled): seeded per cell from the night's
  // litterLevel plus live ones from bombs / ladis. Loose bits rest until a passing vehicle's wake (bow wave,
  // drag along the body, the swirling wake behind it: speed + heading of every moving vehicle near them) or a
  // gust of N.wind lifts them: then they flutter (flip, spin, curved swirling paths), fall slowly and slide to a
  // stop, pile against kerbs and walls, and sink in water.
  const LCOL = ['#d81e1e', '#b8141e', '#e83848', '#f05a8a', '#a8402a', '#c8a070', '#2a2420', '#f2c230', '#3a8a3a', '#e8e0d0'];
  const LWT = [40, 18, 12, 10, 7, 7, 3, 1.5, 1.5, 0];
  const LBACK = LCOL.map((c, i) => (i === 6 ? '#4a4038' : U.mix ? U.mix(c, '#f4e4cc', 0.42) : c));
  const LNC = LCOL.length;
  function pickCol(u) { let t = u * 100; for (let i = 0; i < LWT.length; i++) { t -= LWT[i]; if (t <= 0) return i; } return 0; }
  const LB = { n: 0, cap: 1800 };
  const LBF = ['x', 'y', 'h', 'vx', 'vy', 'vh', 'ang', 'spin', 'flip', 'flipV', 'size', 'thr', 'gh', 'age'];
  for (const k of LBF) LB[k] = new Float32Array(LB.cap);
  LB.col = new Uint8Array(LB.cap); LB.st = new Uint8Array(LB.cap); LB.seq = new Uint8Array(LB.cap); LB.dirty = new Uint8Array(LB.cap);
  LB.cell = new Int32Array(LB.cap);
  const LIT = { awake: 0, live: 0, gen: 0, dmin: 1e9, dmax: -1, region: null, regT: 0, lastX: 1e9, lastY: 1e9, level: 0, sweep: 0, kicked: 0, flown: 0, cells: 0 };
  const markDirty = (i) => { LB.dirty[i] = 1; if (i < LIT.dmin) LIT.dmin = i; if (i > LIT.dmax) LIT.dmax = i; };
  function bitAlloc(x, y, col, size, cell, seq, thr) {
    if (LB.n >= Math.min(LB.cap, BUD().litter)) return -1;
    const i = LB.n++;
    LB.x[i] = x; LB.y[i] = y; LB.h[i] = 0; LB.vx[i] = 0; LB.vy[i] = 0; LB.vh[i] = 0;
    LB.ang[i] = rnd() * TAU; LB.spin[i] = 0; LB.flip[i] = rnd() < 0.2 ? PI : 0; LB.flipV[i] = 0;
    LB.size[i] = size; LB.thr[i] = thr; LB.gh[i] = NaN; LB.age[i] = 0;
    LB.col[i] = col; LB.st[i] = 0; LB.seq[i] = seq; LB.cell[i] = cell;
    markDirty(i);
    return i;
  }
  function bitFree(i) {
    if (LB.cell[i] < 0) LIT.live--;
    if (LB.st[i]) LIT.awake--;
    const j = --LB.n;
    if (i !== j) {
      for (const k of LBF) LB[k][i] = LB[k][j];
      LB.col[i] = LB.col[j]; LB.st[i] = LB.st[j]; LB.seq[i] = LB.seq[j]; LB.cell[i] = LB.cell[j];
    }
    markDirty(i);
  }
  /** live bits (bombs, ladis, emitters): flung from (x, y); opts {spread 0..1, burnt} */
  function scatter(x, y, n, o) {
    o = o || {};
    STATS.scatters++;
    const sp = o.spread == null ? 1 : o.spread;
    for (let k = 0; k < n; k++) {
      if (LB.n >= Math.min(LB.cap, BUD().litter)) { if (!recycleLive()) break; }
      const col = o.burnt ? (rnd() < 0.6 ? 6 : 4) : pickCol(rnd());
      const i = bitAlloc(x + rr(-0.8, 0.8), y + rr(-0.8, 0.8), col, rr(0.7, 1.5), -1, 0, rr(5, 12));
      if (i < 0) break;
      LIT.live++;
      const a = rnd() * TAU, s = rr(6, 34) * sp;
      LB.vx[i] = Math.cos(a) * s; LB.vy[i] = Math.sin(a) * s; LB.vh[i] = rr(4, 22) * sp; LB.h[i] = rr(0.4, 1.4);
      LB.spin[i] = rr(-7, 7); LB.flipV[i] = rr(6, 16); LB.st[i] = 2; LIT.awake++;
    }
  }
  function recycleLive() { // the budget is full: reuse the oldest live bit
    let best = -1, ba = -1;
    for (let i = 0; i < LB.n; i++) if (LB.cell[i] < 0 && LB.age[i] > ba) { ba = LB.age[i]; best = i; }
    if (best < 0) return false;
    bitFree(best); return true;
  }
  // live soot marks (where a bomb / anaar went off): a few decals that stay the night
  const SOOT = [];
  function soot(x, y, s) { if (SOOT.length > 40) SOOT.shift(); SOOT.push({ x, y, a: rnd() * TAU, v: 3, s: s || 1, gh: NaN, live: true }); LIT.gen++; }

  // ---- cells
  const CELLS = new Map();
  const S_OK = (s) => { const S = N.SURF; return s === S.ROAD || s === S.FOOTPATH || s === S.GROUND || s === S.PLAZA || s === S.BRIDGE; };
  function styleOf(d) { if (!d) return 'colony'; if (d.id === 'osmania') return 'osmania'; return d.style || 'colony'; }
  function cellInit(c) {
    const CS = TUNE.litterCell, W = N.world, S = N.SURF;
    const rng = U.rng('dwl:' + c.i + ':' + c.j);
    let road = 0, okc = 0;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { const s = W.surfaceAt(c.x0 + (a + 0.5) * CS / 4, c.y0 + (b + 0.5) * CS / 4); if (s === S.ROAD || s === S.BRIDGE) road++; if (S_OK(s)) okc++; }
    const cx = c.x0 + CS / 2, cy = c.y0 + CS / 2;
    const d = W.districtAt(cx, cy);
    const sw = TUNE.litterStyle[styleOf(d)] != null ? TUNE.litterStyle[styleOf(d)] : 0.5;
    let w = (road / 16) * 0.85 + (okc / 16) * 0.15;
    if (!road) w *= 0.35;
    w *= sw;
    if (!fireOK(cx, cy)) w = 0;
    c.w = w;
    const max = Math.round(TUNE.litterPerCell * 1.8 * w);
    const X = c.cx = new Float32Array(max), Y = c.cy = new Float32Array(max), C = c.cc = new Uint8Array(max), Z = c.cs = new Float32Array(max), T = c.ct = new Float32Array(max);
    let n = 0;
    // a clump where a ladi went off (most of the night's paper lies in such patches) + loose singles
    let kx = 0, ky = 0, clump = 0;
    if (rng.next() < w * 0.7) {
      for (let t = 0; t < 6; t++) { const x = c.x0 + rng.next() * CS, y = c.y0 + rng.next() * CS; const s = W.surfaceAt(x, y); if (s === S.ROAD || s === S.BRIDGE) { kx = x; ky = y; clump = 1; break; } }
    }
    for (let t = 0; t < max * 3 && n < max; t++) {
      let x, y;
      if (clump && rng.next() < 0.55) { const a = rng.next() * TAU, r = Math.sqrt(rng.next()) * 4.5; x = kx + Math.cos(a) * r * 1.6; y = ky + Math.sin(a) * r; }
      else { x = c.x0 + rng.next() * CS; y = c.y0 + rng.next() * CS; }
      const sf = W.surfaceAt(x, y);
      if (!S_OK(sf) || (sf !== S.ROAD && sf !== S.BRIDGE && rng.next() < 0.75)) continue;
      X[n] = x; Y[n] = y; C[n] = pickCol(rng.next()); Z[n] = 0.7 + rng.next() * 0.8; T[n] = 5 + rng.next() * 10;
      n++;
    }
    c.nc = n;
    // trodden-in patches (decals) and the morning heap at the kerb
    c.decals = [];
    const nd = rng.next() < w * 0.95 ? (rng.next() < w * 0.55 ? 2 : 1) : 0;
    for (let k = 0; k < nd; k++) {
      for (let t = 0; t < 5; t++) {
        const x = c.x0 + 3 + rng.next() * (CS - 6), y = c.y0 + 3 + rng.next() * (CS - 6), s = W.surfaceAt(x, y);
        if (s !== S.ROAD && s !== S.BRIDGE && s !== S.FOOTPATH) continue;
        c.decals.push({ x, y, a: rng.next() * TAU, v: (rng.next() * 3) | 0, s: 0.75 + rng.next() * 0.6, thr: 0.12 + rng.next() * 0.75, gh: NaN });
        break;
      }
    }
    if (clump && rng.next() < 0.5) c.decals.push({ x: kx, y: ky, a: rng.next() * TAU, v: 2, s: 0.9 + rng.next() * 0.5, thr: 0.25 + rng.next() * 0.5, gh: NaN });
    c.heap = null;
    if (road >= 5 && rng.next() < 0.45) {
      const rp = W.nearestRoadPoint ? W.nearestRoadPoint(cx, cy) : null;
      if (rp && rp.road && rp.dist < CS) {
        const nx = -Math.sin(rp.angle), ny = Math.cos(rp.angle), side = rng.next() < 0.5 ? -1 : 1, off = rp.road.w / 2 - 2.6;
        const hx = rp.x + nx * side * off, hy = rp.y + ny * side * off;
        if (W.surfaceAt(hx, hy) === S.ROAD && hx >= c.x0 && hx < c.x0 + CS && hy >= c.y0 && hy < c.y0 + CS) c.heap = { x: hx, y: hy, a: rp.angle, s: 0.8 + rng.next() * 0.6, thr: 0.25 + rng.next() * 0.6, gh: NaN };
      }
    }
    c.ready = true;
  }
  const cellKey = (i, j) => i * 4096 + j;
  const REG = { list: [], drop: new Set(), trim: new Map() };
  const DEC = [];   // active decals this period: {x, y, a, v, s, k (alpha), gh}
  const HEAPS = [];
  /** decide the cells round the player: seed / trim / release bits, collect the decals and heaps */
  function litterRegion(force) {
    const p = N.player; if (!p || !N.world || !N.world.built) return;
    const lvl = litterLevel(), sw = sweepLevel();
    const moved = Math.hypot(p.x - LIT.lastX, p.y - LIT.lastY);
    if (!force && moved < 14 && Math.abs(lvl - LIT.level) < 0.02 && Math.abs(sw - LIT.sweep) < 0.02 && LIT.regT > 0) return;
    LIT.lastX = p.x; LIT.lastY = p.y; LIT.level = lvl; LIT.sweep = sw; LIT.regT = 0.6;
    const CS = TUNE.litterCell;
    let x0, y0, x1, y1;
    if (is3D()) { const R3 = TUNE.litterR3d * (PHONE() ? 0.7 : 1); x0 = p.x - R3; x1 = p.x + R3; y0 = p.y - R3; y1 = p.y + R3; }
    else { const v = N.render.view; x0 = v.x0 - 30; y0 = v.y0 - 30; x1 = v.x1 + 30; y1 = v.y1 + 30; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = Math.min(700, (x1 - x0) / 2), hh = Math.min(700, (y1 - y0) / 2); x0 = cx - hw; x1 = cx + hw; y0 = cy - hh; y1 = cy + hh; }
    const i0 = Math.floor(x0 / CS), i1 = Math.floor(x1 / CS), j0 = Math.floor(y0 / CS), j1 = Math.floor(y1 / CS);
    const L = REG.list; L.length = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const key = cellKey(i, j);
      let c = CELLS.get(key);
      if (!c) { c = { i, j, key, x0: i * CS, y0: j * CS, ready: false, have: 0, want: 0, d: 0, stamp: 0 }; CELLS.set(key, c); }
      c.d = Math.hypot(c.x0 + CS / 2 - p.x, c.y0 + CS / 2 - p.y);
      c.stamp = LIT.gen + 1;
      L.push(c);
    }
    LIT.gen++;
    L.sort((a, b) => a.d - b.d);
    // release the cells that fell out (their bits go back to the pool)
    REG.drop.clear();
    for (const [key, c] of CELLS) if (c.stamp !== LIT.gen) { if (c.have > 0) REG.drop.add(key); CELLS.delete(key); }
    // seed: nearest cells first within the budget (live bits keep their share)
    let budget = Math.max(0, Math.min(LB.cap, BUD().litter) - Math.min(LIT.live, Math.round(BUD().litter * 0.35)));
    let initN = 0;
    REG.trim.clear();
    DEC.length = 0; HEAPS.length = 0;
    const dmax = BUD().decals;
    const decK = lvl * (1 - 0.75 * sw);
    for (const c of L) {
      if (!c.ready) { if (initN > (force ? 4000 : 90)) { c.want = 0; continue; } cellInit(c); initN++; }
      const want = Math.min(Math.floor(c.nc * lvl), budget);
      budget -= want;
      c.want = want;
      if (want < c.have) REG.trim.set(c.key, want);
      for (const d of c.decals) if (DEC.length < dmax && decK >= d.thr) { d.k = clamp((decK - d.thr) * 4, 0.25, 1); DEC.push(d); }
      if (c.heap && sw >= c.heap.thr * 0.8 && HEAPS.length < 60) { c.heap.k = clamp((sw - c.heap.thr * 0.8) * 3, 0.2, 1); HEAPS.push(c.heap); }
    }
    for (const s of SOOT) if (DEC.length < dmax + 20) { s.k = 1; DEC.push(s); }
    // one pass: free released / trimmed bits
    if (REG.drop.size || REG.trim.size) {
      for (let i = LB.n - 1; i >= 0; i--) {
        const ck = LB.cell[i]; if (ck < 0) continue;
        if (REG.drop.has(ck)) { bitFree(i); continue; }
        const t = REG.trim.get(ck);
        if (t != null && LB.seq[i] >= t) { bitFree(i); const c = CELLS.get(ck); if (c) c.have--; }
      }
    }
    // add the missing seeded bits
    for (const c of L) {
      if (!c.ready || c.want <= c.have) continue;
      for (let k = c.have; k < c.want; k++) { if (bitAlloc(c.cx[k], c.cy[k], c.cc[k], c.cs[k], c.key, k, c.ct[k]) < 0) break; c.have++; }
    }
    LIT.cells = L.length;
    LIT.decalsGen = (LIT.decalsGen || 0) + 1;
  }
  // vehicles with a wake: [x, y, ux, uy, speed, halfLength, halfWidth, reach] per vehicle
  const VW = new Float32Array(8 * 48);
  let VWN = 0;
  const _vq = [];
  const isVeh = (e) => e.kind === 'vehicle';
  function gatherWakes() {
    VWN = 0;
    const p = N.player; if (!p) return;
    _vq.length = 0;
    const R0 = is3D() ? TUNE.litterR3d + 60 : 520;
    try { N.entities.query(p.x, p.y, R0, isVeh, _vq); } catch (e) { return; }
    for (const v of _vq) {
      if (VWN >= 48) break;
      const sp = Math.hypot(v.vx || 0, v.vy || 0);
      if (!(sp > 7) || !v.T) continue;
      const o = VWN * 8, L = (v.T.w || 20) / 2, Wd = (v.T.d || 8) / 2;
      VW[o] = v.x; VW[o + 1] = v.y; VW[o + 2] = v.vx / sp; VW[o + 3] = v.vy / sp; VW[o + 4] = sp; VW[o + 5] = L; VW[o + 6] = Wd;
      VW[o + 7] = L + 8 + sp * 0.5 * TUNE.wake.len + Wd;
      VWN++;
    }
    // Chinnu running on foot kicks paper too (a tiny wake)
    if (!p.vehicle && VWN < 48) {
      const sp = Math.hypot(p.vx || 0, p.vy || 0);
      if (sp > 30) { const o = VWN * 8; VW[o] = p.x; VW[o + 1] = p.y; VW[o + 2] = p.vx / sp; VW[o + 3] = p.vy / sp; VW[o + 4] = sp * 0.32; VW[o + 5] = 2; VW[o + 6] = 2; VW[o + 7] = 12; VWN++; }
    }
  }
  /** the air a wake moves at (x, y): fills AIR = [ax, ay, lift, swirl] (u/s); 0 when outside every wake */
  const AIR = new Float32Array(4);
  function wakeAir(x, y, seed, t) {
    let ax = 0, ay = 0, lift = 0, sw = 0;
    const K = TUNE.wake.k, KL = TUNE.wake.lift;
    for (let k = 0; k < VWN; k++) {
      const o = k * 8, R0 = VW[o + 7];
      const dx = x - VW[o], dy = y - VW[o + 1];
      if (dx > R0 || dx < -R0 || dy > R0 || dy < -R0) continue;
      const ux = VW[o + 2], uy = VW[o + 3], sp = VW[o + 4], L = VW[o + 5], hw = VW[o + 6];
      const lx = dx * ux + dy * uy, ly = -dx * uy + dy * ux, sg = ly < 0 ? -1 : 1, aly = ly * sg;
      const nx = -uy, ny = ux; // to the right of the heading (+ly)
      let fa = 0, fl = 0, fz = 0, fs = 0;
      if (lx > L) { // the bow wave: pushed ahead and out to the sides
        const dd = lx - L; if (dd > 7 || aly > hw + 3) continue;
        const f = (1 - dd / 7) * sp; fa = f * 0.5; fl = sg * f * 0.55; fz = f * 0.08;
      } else if (lx >= -L) { // alongside / under the body: dragged along, flicked out from under it
        if (aly > hw + 5) continue;
        if (aly < hw) { fa = sp * 0.62; fl = sg * sp * 0.18; fz = sp * 0.07; }
        else { const f = 1 - (aly - hw) / 5; fa = sp * 0.36 * f; fl = sg * sp * 0.1 * f; fz = sp * 0.05 * f; }
      } else { // the wake behind: drag along the track, a trailing vortex pair swirling the paper round and up
        const db = -L - lx, wl = L * 2 * TUNE.wake.len + sp * 0.4 * TUNE.wake.len;
        if (db > wl) continue;
        const whw = hw + 1.5 + db * TUNE.wake.spread;
        if (aly > whw) continue;
        const fall = 1 - db / wl, core = 1 - aly / whw;
        fa = sp * 0.72 * fall * (0.35 + 0.65 * core);
        const ph = db * 0.42 - t * (2.5 + sp * 0.025) + seed;
        fl = sp * 0.34 * fall * Math.sin(ph) - sg * sp * 0.16 * fall * (1 - core);
        fz = sp * 0.17 * fall * (0.35 + 0.65 * core) * (0.75 + 0.5 * Math.sin(ph * 1.7 + 1.1));
        fs = sg * fall * (2 + sp * 0.03);
      }
      ax += (ux * fa + nx * fl) * K; ay += (uy * fa + ny * fl) * K; lift += fz * KL; sw += fs;
    }
    AIR[0] = ax; AIR[1] = ay; AIR[2] = lift; AIR[3] = sw;
    return ax !== 0 || ay !== 0;
  }
  function updateLitter(dt) {
    if (!LB.n) return;
    gatherWakes();
    const W = N.world, S = N.SURF, t = N.time ? N.time.now : 0;
    const WI = N.wind;
    let wdx = 0, wdy = 0, wstr = 0, wgust = 0;
    if (WI && WI.at) { wdx = WI.dx || 0; wdy = WI.dy || 0; wstr = WI.strength || 0; wgust = WI.gustiness || 0; }
    const windMax = wstr * (0.72 + 0.62 * wgust) * TUNE.windAir; // the strongest air the wind can make now
    const windWakes = windMax > 5.5;
    LIT.kicked = 0;
    for (let i = LB.n - 1; i >= 0; i--) {
      const x = LB.x[i], y = LB.y[i];
      let st = LB.st[i];
      const seed = (i * 0.618) % 1 * 6.283;
      const inWake = VWN ? wakeAir(x, y, LB.thr[i] * 3.1, t) : false;
      let ax = 0, ay = 0, lift = 0, swirl = 0;
      if (inWake) { ax = AIR[0]; ay = AIR[1]; lift = AIR[2]; swirl = AIR[3]; }
      if (windWakes || st) {
        const s = wstr * (0.72 + 0.62 * wgust * (WI && WI.gust ? WI.gust(x, y) : 0.5)) * TUNE.windAir;
        ax += wdx * s; ay += wdy * s;
        if (s > 11) lift += (s - 11) * 0.45 * (0.6 + 0.4 * Math.sin(t * 2.3 + seed));
      }
      if (LB.cell[i] < 0) LB.age[i] += dt;
      if (st === 0) {
        const a2 = ax * ax + ay * ay;
        const thr = LB.thr[i];
        if (a2 < thr * thr && lift < thr * 0.9) continue;
        st = LB.st[i] = 1; LIT.awake++;
      }
      LIT.kicked++;
      let vx = LB.vx[i], vy = LB.vy[i], vh = LB.vh[i], h = LB.h[i];
      const sz = LB.size[i];
      if (st === 2) { // in the air: paper follows the air quickly, falls slowly with a flutter
        const K = 3.4 / (0.6 + sz * 0.5);
        vx += (ax - vx) * Math.min(1, K * dt); vy += (ay - vy) * Math.min(1, K * dt);
        vh += (lift * 1.6 - 13) * dt;
        const term = -3.2 - 2.2 * Math.abs(Math.sin(LB.flip[i]));
        if (vh < term) vh = term;
        vh *= 1 - 0.6 * dt;
        LB.spin[i] += swirl * dt * 2.5;
        const sp = LB.spin[i] * dt * 0.55; if (sp) { const c = Math.cos(sp), s = Math.sin(sp), nx = vx * c - vy * s; vy = vx * s + vy * c; vx = nx; }
        const fl = Math.sin(LB.flip[i]) * 1.6; // falling-leaf flutter across the path
        LB.x[i] = x; LB.y[i] = y;
        LB.flip[i] += LB.flipV[i] * dt;
        h += vh * dt;
        if (h <= 0) { h = 0; vh = 0; st = 1; vx *= 0.55; vy *= 0.55; LB.flipV[i] *= 0.25; LB.gh[i] = NaN; }
        else { const vl = Math.hypot(vx, vy) || 1; vx += (-vy / vl) * fl * dt * 4; vy += (vx / vl) * fl * dt * 4; }
      } else { // on the ground: slides and tumbles with the air, friction stops it, enough lift takes it up
        const K = 2.2 / (0.6 + sz * 0.5);
        vx += (ax - vx) * Math.min(1, K * dt * 0.55); vy += (ay - vy) * Math.min(1, K * dt * 0.55);
        const fr = Math.exp(-6.5 * dt); vx *= fr; vy *= fr;
        LB.spin[i] = (LB.spin[i] + swirl * dt * 1.5) * (1 - 2.5 * dt);
        const v = Math.hypot(vx, vy);
        LB.flip[i] += v * 0.18 * dt * (LB.seq[i] & 1 ? 1 : -1);
        if (lift > 4 + LB.thr[i] * 0.45) { st = 2; vh = lift * 0.55 + rr(0, 3); h = 0.05; LB.flipV[i] = rr(5, 15) * (rnd() < 0.5 ? -1 : 1); LIT.flown++; }
        else if (v < 0.5 && !inWake && !(windWakes && ax * ax + ay * ay > LB.thr[i] * LB.thr[i])) { vx = vy = 0; st = 0; LIT.awake--; LB.spin[i] = 0; const f = LB.flip[i] % TAU; LB.flip[i] = Math.abs(Math.cos(f)) > 0.0 ? (Math.cos(f) >= 0 ? 0 : PI) : 0; LB.gh[i] = NaN; }
      }
      LB.ang[i] += LB.spin[i] * dt;
      // move, with the world in the way: walls stop it, kerbs catch ground paper, water takes it
      if (vx || vy) {
        const nx = x + vx * dt, ny = y + vy * dt;
        const s1 = W.surfaceAt(nx, ny);
        if (s1 === S.SOLID || s1 === S.VOID || s1 === S.ROCK) { if (h < 8) { vx *= -0.25; vy *= -0.25; } else { LB.x[i] = nx; LB.y[i] = ny; } }
        else if (s1 === S.WATER && h < 0.4) { bitFree(i); continue; }
        else if (h < 0.3 && s1 === S.FOOTPATH && W.surfaceAt(x, y) === S.ROAD && (LB.seq[i] % 5) < 3) { vx *= 0.1; vy *= 0.1; }
        else { LB.x[i] = nx; LB.y[i] = ny; }
      }
      LB.vx[i] = vx; LB.vy[i] = vy; LB.vh[i] = vh; LB.h[i] = h; LB.st[i] = st;
      markDirty(i);
    }
    // live bits wander far behind the player: let them go
    if (LIT.live > 0 && N.player) {
      const p = N.player;
      for (let i = LB.n - 1; i >= 0; i--) if (LB.cell[i] < 0 && (LB.age[i] > 900 || Math.abs(LB.x[i] - p.x) > 800 || Math.abs(LB.y[i] - p.y) > 800)) bitFree(i);
    }
  }
  function litterClear() {
    while (LB.n) bitFree(LB.n - 1);
    CELLS.clear(); DEC.length = 0; HEAPS.length = 0; SOOT.length = 0;
    LIT.live = 0; LIT.awake = 0; LIT.lastX = 1e9; LIT.regT = 0; LIT.decalsGen = (LIT.decalsGen || 0) + 1;
  }

  /* ================================================================ layout: decorated houses */
  // A residential house (generic colony / rocky / posh / old-city house with a front, no shop sign; plus the home
  // landmark) gets a deterministic decor plan in its own frame: origin at the middle of the front wall, u along the
  // wall, v out towards the street. Which houses show it today: share by district style x the week's day factor.
  const DECOR = new WeakMap();
  const FAIRY_SETS = [['#ff3040', '#ffd040', '#40ff70', '#40a0ff'], ['#ffd8a0'], ['#ff3040'], ['#ffd040', '#ff8020'], ['#40a0ff', '#ffffff'], ['#ff60e0', '#40ff70', '#ffd040'], ['#ff3040', '#40ff70']];
  const FAIRY_PAT = ['chase', 'blink', 'twinkle', 'alt', 'steady', 'chase', 'twinkle'];
  const KANDIL = [['#e83030', '#ffd040'], ['#ff8a1a', '#2aa040'], ['#f05aa0', '#fff0d0'], ['#2a6ad8', '#ffd040'], ['#ffd040', '#e83030'], ['#8a3ad8', '#ffb0e0']];
  const FACEN = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  function framePlan(id, cx, cy, f, L, setback, h, floors, seed, o) {
    const n = FACEN[f] || FACEN.S, nx = n[0], ny = n[1], ux = -ny, uy = nx;
    const P = (u, v) => [cx + ux * u + nx * v, cy + uy * u + ny * v];
    const H = (k) => hsh(seed * 0.0137 + k * 3.7, seed * 0.0071 - k * 1.3);
    const d = { id, cx, cy, f, nx, ny, ux, uy, L, setback, h, floors, seed, home: !!(o && o.home), s: o && o.s || null, u: o && o.home ? 0 : H(1), P };
    d.door = { x: cx + nx * 0.6, y: cy + ny * 0.6 };
    const gv = setback > 2.5 ? setback : 4;
    d.gate = { x: cx + nx * (gv + 3.5), y: cy + ny * (gv + 3.5) };   // just outside the gate (where a family stands)
    if (o && o.home || H(2) < 0.88) { const rv = setback > 3 ? setback + (o && o.home ? 4.5 : 0.3) : 3.4, q = P(0, rv); d.rangoli = { x: q[0], y: q[1], r: setback > 3 ? (o && o.home ? 4.6 : 4.1) : 3, v: (H(3) * 8) | 0, a: H(4) * TAU }; }
    d.diyas = [P(-2.7, 0.9), P(2.7, 0.9)];
    d.gateDiyas = setback > 2.5 && (o ? o.gateDiyas !== false : true) ? [P(-(o && o.gateHalf || 5.1), setback), P(o && o.gateHalf || 5.1, setback)] : [];
    d.gateH = o && o.gateH || 3.9; d.gateH3 = o && o.gateH3 || 4.5;
    if (o && o.home || H(5) < 0.82) d.toran = { a: P(-3.1, 0.35), b: P(3.1, 0.35), h: 7.5 };
    if (floors >= 2 && (o && o.home || H(6) < 0.62)) { const ku = (H(7) < 0.5 ? -1 : 1) * Math.min(L * 0.28, 9), q = P(ku, 1.7); d.kandil = { x: q[0], y: q[1], h: 14.6, hTop: 17.2, col: KANDIL[(H(8) * KANDIL.length) | 0], style: H(9) < 0.6 ? 'hex' : H(9) < 0.85 ? 'star' : 'ball', ph: H(10) * TAU }; }
    if (o && o.home || H(11) < 0.58) {
      const set = (H(12) * FAIRY_SETS.length) | 0, pts = [], e = o && o.edge || 0.15, hh = h + 1.0;
      const add = (ax, ay, bx, by) => { const l = Math.hypot(bx - ax, by - ay), n0 = Math.max(2, Math.round(l / 2.6)); for (let k = 0; k < n0; k++) { const t = (k + 0.5) / n0; pts.push(ax + (bx - ax) * t, ay + (by - ay) * t); } };
      const x0 = o && o.rect ? o.rect[0] : d.s.x, y0 = o && o.rect ? o.rect[1] : d.s.y, x1 = x0 + (o && o.rect ? o.rect[2] : d.s.w), y1 = y0 + (o && o.rect ? o.rect[3] : d.s.d);
      const E = { N: [x0 - e, y0 - e, x1 + e, y0 - e], S: [x0 - e, y1 + e, x1 + e, y1 + e], W: [x0 - e, y0 - e, x0 - e, y1 + e], E: [x1 + e, y0 - e, x1 + e, y1 + e] };
      const side = { N: ['W', 'E'], S: ['W', 'E'], E: ['N', 'S'], W: ['N', 'S'] }[f] || ['W', 'E'];
      const edges = [f]; if (H(13) < 0.7 || (o && o.home)) edges.push(side[0], side[1]); if (H(14) < 0.3) edges.push({ N: 'S', S: 'N', E: 'W', W: 'E' }[f]);
      for (const k of edges) { const q = E[k]; if (q) add(q[0], q[1], q[2], q[3]); }
      d.fairy = { pts, h: hh, cols: FAIRY_SETS[set], pat: FAIRY_PAT[(H(15) * FAIRY_PAT.length) | 0], ph: H(16) * 10 };
    }
    if (o && o.home || H(17) < 0.66) { const pd = [], n0 = Math.max(3, Math.floor((L - 3) / 3.2)); for (let k = 0; k < n0; k++) { const u = -L / 2 + 1.5 + (k + 0.5) * ((L - 3) / n0), q = P(u, -0.45); pd.push(q[0], q[1]); } d.parapet = { pts: pd, h: h + 0.9 }; }
    return d;
  }
  function makeDecor(s) {
    if (s.t !== 'bldg' || !s.front || s.sign || s.mosque || s.roofType === 'frame' || !(s.h > 7) || !(s.w > 9 && s.d > 9)) return null;
    const share = TUNE.decorShare[s.style]; if (!share) return null;
    const f = s.front, L = f === 'N' || f === 'S' ? s.w : s.d;
    const cx = f === 'W' ? s.x : f === 'E' ? s.x + s.w : s.cx, cy = f === 'N' ? s.y : f === 'S' ? s.y + s.d : s.cy;
    let setback = 0;
    const y = s.yard;
    if (y) setback = f === 'N' ? s.y - y.y : f === 'S' ? (y.y + y.h) - (s.y + s.d) : f === 'W' ? s.x - y.x : (y.x + y.w) - (s.x + s.w);
    const d = framePlan('b' + (s.seed >>> 0), cx, cy, f, L, setback, s.h, Math.max(1, Math.round(s.h / 10)), (s.seed >>> 0) % 100000, { s, gateDiyas: !!s.cwall });
    d.share = share;
    return d;
  }
  function houseDecor(s) {
    let d = DECOR.get(s);
    if (d === undefined) { try { d = makeDecor(s) || false; } catch (e) { N.err('diwali.decor', e); d = false; } DECOR.set(s, d); }
    return d;
  }
  let HOME = null;
  function homeDecor() {
    if (HOME !== null) return HOME || null;
    HOME = false;
    const D = N.WORLD_DATA, lm = D && (D.landmarks || []).find((l) => l.id === 'home');
    if (!lm) return null;
    const f = (lm.face || 'n').toUpperCase(), x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2;
    const cx = f === 'W' ? x0 : f === 'E' ? x0 + lm.w : lm.x, cy = f === 'N' ? y0 : f === 'S' ? y0 + lm.d : lm.y;
    HOME = framePlan('home', cx, cy, f, f === 'N' || f === 'S' ? lm.w : lm.d, 5.5, lm.h || 22, 2, 4242, { home: true, rect: [x0, y0, lm.w, lm.d], gateHalf: 3.2, gateH: 5.4, gateH3: 7.6, edge: 0.2 });
    HOME.share = 1; HOME.lm = lm;
    return HOME;
  }
  /** is this house decorated today? */
  function decorOn(d) { return !!d && (d.home || d.u < d.share * decorDay()); }
  /** the home terrace parapet diyas are the deepon_ki_raat mission's: lit only once it is done (N.flags.diwali_terrace_lit), or when no such mission exists */
  function homeParapetLit() {
    if (F().diwali_terrace_lit || F().dw_terrace) return true;
    const M = N.missions; const has = M && M.defs && (Array.isArray(M.defs) ? M.defs.some((q) => q.id === 'deepon_ki_raat') : M.defs.deepon_ki_raat);
    return !has;
  }
  const _hq = [];
  /** decorated houses within r of (cx, cy), nearest first (live decor plans: read, don't write) */
  function housesNear(cx, cy, r, max, out) {
    out = out || [];
    out.length = 0;
    if (!N.world || !N.world.built || !decorDay()) return out;
    _hq.length = 0;
    N.world.queryStructures(cx - r, cy - r, cx + r, cy + r, (s) => { if (s.t !== 'bldg') return; const d = houseDecor(s); if (d && decorOn(d)) { const dd = Math.hypot(d.cx - cx, d.cy - cy); if (dd <= r) { d._d = dd; _hq.push(d); } } });
    const hd = homeDecor(); if (hd) { const dd = Math.hypot(hd.cx - cx, hd.cy - cy); if (dd <= r) { hd._d = dd; _hq.push(hd); } }
    _hq.sort((a, b) => a._d - b._d);
    const n = Math.min(_hq.length, max || 1e9);
    for (let i = 0; i < n; i++) out.push(_hq[i]);
    return out;
  }

  /* ================================================================ layout: pataakha stalls */
  const STALL_LABELS = ['DEEPAVALI CRACKERS', 'PATAAKHA BAZAAR', 'HAPPY DIWALI', 'CRACKERS SALE', 'ROSHNI FIREWORKS', 'JYOTHI CRACKERS', 'CHAMAK PATAAKHE', 'DEEPAM FIREWORKS', 'NEW STAR CRACKERS', 'RAINBOW FIREWORKS'];
  const PACK_LABELS = ['BIJLI', 'ROCKET', 'ANAAR', 'CHAKRI', 'PHULJHADI'];
  const SS = 1.25; // stall scale (local units below are x SS)
  const STRIPES = [['#d8302a', '#f4ecd8'], ['#f2c230', '#2a8a3a'], ['#2a5cb8', '#f4ecd8'], ['#e8641a', '#f2c230'], ['#c02a6a', '#f4ecd8']];
  let STALLS = null;
  function buildStalls() {
    const W = N.world, D = N.WORLD_DATA, P = N.places, S = N.SURF;
    const out = [];
    if (!W || !W.built || !D) return out;
    const markets = Object.values(P).filter((p) => p.kind === 'market');
    const okGround = (x, y) => { const s = W.surfaceAt(x, y); return s === S.GROUND || s === S.FOOTPATH || s === S.PLAZA || s === S.SAND; };
    const nearJunction = (x, y) => { const n = W.roads && W.roads.nearestNode ? W.roads.nearestNode(x, y) : null; return n && n.deg >= 3 && Math.hypot(n.x - x, n.y - y) < (n.w || 30) / 2 + 12; };
    const tryAt = (x, y, ang, anchor, kind) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (const [u, v] of [[-6.5, -3.6], [6.5, -3.6], [6.5, 3.6], [-6.5, 3.6], [0, 0]]) { const px = x + (ca * u - sa * v) * SS, py = y + (sa * u + ca * v) * SS; if (!okGround(px, py) || !W.isWalkable(px, py)) return false; }
      if (out.some((q) => Math.hypot(q.x - x, q.y - y) < 15 * SS)) return false;
      if (kind !== 'kirana' && markets.some((m) => Math.hypot(m.x - x, m.y - y) < 44)) return false;
      if (N.respect && N.respect.near && N.respect.near(x, y, 50)) return false;
      if (nearJunction(x, y)) return false;
      const i = out.length, hv = hsh(x * 0.31, y * 0.17);
      out.push({ id: 'stall_' + anchor + '_' + i, anchor, kind, x, y, a: ang, label: STALL_LABELS[(hv * STALL_LABELS.length) | 0], stripes: STRIPES[(hsh(y, x) * STRIPES.length) | 0], seed: (hv * 1e5) | 0 });
      return true;
    };
    // candidate spots every 18 u along every road near the anchor, on both sides, nearest first
    const along = (pl, n, d0, d1, kind) => {
      const roads = (D.roads || []).filter((r) => r.kind !== 'path' && r.kind !== 'bridge' && r.kind !== 'bund' && r.pts.some((q) => Math.abs(q[0] - pl.x) < d1 + 60 && Math.abs(q[1] - pl.y) < d1 + 60));
      const cand = [];
      for (const road of roads) {
        const pts = road.pts, foot = (W.FOOT && W.FOOT[road.kind]) || 0, off = road.w / 2 + foot * 0.55 + 4.6 * SS;
        for (let i = 1; i < pts.length; i++) {
          const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1], L = Math.hypot(bx - ax, by - ay); if (L < 1) continue;
          const ang = Math.atan2(by - ay, bx - ax);
          for (let t = 9; t < L - 9; t += 18) {
            const qx = ax + (bx - ax) * (t / L), qy = ay + (by - ay) * (t / L), d = Math.hypot(qx - pl.x, qy - pl.y);
            if (d > d1 || d < d0 - 20) continue;
            for (const side of [1, -1]) { const nx = -Math.sin(ang) * side, ny = Math.cos(ang) * side; cand.push({ x: qx + nx * off, y: qy + ny * off, a: ang + (side > 0 ? 0 : PI), fx: -nx, fy: -ny, d }); }
          }
        }
      }
      cand.sort((p0, p1) => p0.d - p1.d);
      let got = 0;
      for (const q of cand) {
        if (got >= n) break;
        if (Math.hypot(q.x - pl.x, q.y - pl.y) < d0) continue;
        if (tryAt(q.x, q.y, q.a, pl.id, kind)) { const st = out[out.length - 1]; st.fx = q.fx; st.fy = q.fy; got++; }
      }
    };
    if (P.sultan_bazaar) along(P.sultan_bazaar, 10, 44, 210, 'bazaar');
    if (P.koti_book_bazaar) along(P.koti_book_bazaar, 3, 50, 120, 'bazaar');
    for (const m of markets) if (m.id !== 'sultan_bazaar' && m.id !== 'koti_book_bazaar') along(m, 2, 50, 110, 'market');
    for (const id in P) { const p = P[id]; if (p.kind === 'kirana') along(p, 1, 8, 40, 'kirana'); }
    return out;
  }
  function stallList() { if (!STALLS && N.world && N.world.built) { try { STALLS = buildStalls(); } catch (e) { N.err('diwali.stalls', e); STALLS = []; } } return STALLS || []; }

  /* ================================================================ layout: spots */
  // where Chinnu may light one: beside Amma / Nanna at home or at a family's "bucket of water"
  const GROUPS = [];
  const spots = {
    /** the lane outside the home gate (where the family stands on Diwali night) */
    get home() { const d = homeDecor(); return d ? { x: d.gate.x, y: d.gate.y, kind: 'home', fx: d.P(0, 20)[0], fy: d.P(0, 20)[1] } : (N.places.home ? { x: N.places.home.x, y: N.places.home.y, kind: 'home' } : null); },
    /** the home terrace: rect, floor height and its parapet points ({x, y, h, edge 'N'|'S'|'E'|'W'}, ~3.4 u apart, front first) */
    get terrace() {
      const R = N.world && N.world.roofs && N.world.roofs.get && N.world.roofs.get('home_terrace');
      if (!R) return null;
      const [x, y, w, d] = R.rect, out = [], e = 0.7;
      const edge = (ax, ay, bx, by, k) => { const l = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.round(l / 3.4)); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, h: R.h + 0.9, edge: k }); } };
      edge(x + e, y + e, x + w - e, y + e, 'N'); edge(x + w - e, y + e, x + w - e, y + d - e, 'E'); edge(x + e, y + e, x + e, y + d - e, 'W'); edge(x + e, y + d - e, x + w - e, y + d - e, 'S');
      return { id: 'home_terrace', x: x + w / 2, y: y + d / 2, h: R.h, rect: R.rect, parapet: out };
    },
    /** the families out with crackers right now: [{x, y (the bucket), kind: 'bucket'|'home', group, adult}] */
    list() { const o = []; for (const g of GROUPS) if (g.bucket) o.push({ x: g.bucket.x, y: g.bucket.y, kind: g.home ? 'home' : 'bucket', group: g.key, adult: g.adult || null }); return o; },
    /** the nearest live light spot within r of (x, y) (an adult with a bucket of water), or null */
    near(x, y, r) { let best = null, bd = r == null ? TUNE.lightR : r; for (const g of GROUPS) { if (!g.bucket || !g.adult || !g.adult.alive) continue; const d = Math.min(Math.hypot(g.bucket.x - x, g.bucket.y - y), Math.hypot(g.adult.x - x, g.adult.y - y)); if (d < bd) { bd = d; best = { x: g.bucket.x, y: g.bucket.y, kind: g.home ? 'home' : 'bucket', group: g.key, adult: g.adult, d }; } } return best; },
    /** deterministic family spots round (cx, cy) (where families come out tonight): [{x, y, fx, fy (fire point), house}] */
    find(cx, cy, r) { const o = []; for (const s of groupSites(cx, cy, r || 300)) o.push({ x: s.x, y: s.y, fx: s.fx, fy: s.fy, house: s.house ? s.house.id : null, kind: s.kind }); return o; },
  };

  /* ================================================================ people (pooled 'ped' entities: both views draw them) */
  const PERSONS = [], PPOOL = [];
  function lookFor(role, style) {
    const T = N.traffic;
    try { if (T && T.makeLook) { const L = T.makeLook(role, style || 'colony'); if (L && L.look) return L.look; } } catch (e) { /* fall through */ }
    return { kind: role === 'kid' ? 'kid' : role === 'aunty' ? 'aunty' : 'man', skin: '#a0683f', hair: '#1a1412', shirt: '#e8e0d0', pants: '#3a3a4a' };
  }
  // festive clothes: new clothes on Diwali (silk sarees, bright kurtas, frocks)
  const FESTIVE = ['#d8202a', '#f2c230', '#e8641a', '#c02a8a', '#2a8a5a', '#7a2ab8', '#f05a8a', '#2a5cd8'];
  function festive(look, role) {
    const L = Object.assign({}, look);
    if (L.prop && L.prop !== 'stick') L.prop = null;
    if (role === 'aunty' && L.saree) { L.saree = pick(FESTIVE); L.border = pick(['#f2c230', '#e8c060', '#fff0c0']); L.blouse = U.shade ? U.shade(L.saree, 0.7) : L.saree; }
    else if (L.kind === 'kid') { L.shirt = pick(FESTIVE); if (L.girl) L.pants = L.shirt; L.cap = null; }
    else if (L.kind === 'man' && rnd() < 0.6) { L.shirt = pick(['#f4ecd8', '#f2c230', '#e8641a', '#c8e0f0', '#f4f2ea']); }
    return L;
  }
  class Person extends N.Actor {
    constructor() {
      super({ kind: 'ped', r: 3, mass: 1, solid: true });
      this.dw = true; this.amb = true;
      this.anim = { phase: 0, speed: 0, run: false };
      this._fn = (ctx) => drawPerson2D(ctx, this);
    }
    update(dt) { try { personUpdate(this, dt); } catch (e) { N.err('diwali.person', e); freePerson(this); } }
    draw() { if (!is3D()) N.render.queue('actors', this.y, this._fn); }
  }
  function newPerson(role, x, y, o) {
    o = o || {};
    if (PERSONS.length >= BUD().persons && !o.force) return null;
    if (!N.world.isWalkable(x, y)) { const f = N.world.findFree(x, y, 'walk', 6); if (!f) return null; x = f.x; y = f.y; }
    const p = PPOOL.pop() || new Person();
    p.alive = true; p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.role = role;
    p.look = o.look || festive(lookFor(role, o.style), role);
    p.angle = p.facing = o.face != null ? o.face : rnd() * TAU;
    p.beh = 'stand'; p.tx = x; p.ty = y; p.hx = x; p.hy = y; p.spd = o.spd || rr(30, 40);
    p.faceX = o.faceX != null ? o.faceX : null; p.faceY = o.faceY != null ? o.faceY : null;
    p.balloons = null; p.grp = o.grp || null; p.lookAt = null; p.lookT = 0; p.knockT = 0; p.down = false; p.npcId = o.npcId || null;
    p.anim.phase = rnd() * TAU; p.anim.speed = 0; p.anim.run = false;
    N.entities.add(p);
    PERSONS.push(p);
    return p;
  }
  function freePerson(p) {
    if (!p) return;
    const j = PERSONS.indexOf(p); if (j >= 0) PERSONS.splice(j, 1);
    if (p.alive) N.entities.remove(p);
    p.alive = false; p.grp = null; p.lookAt = null; p.balloons = null;
    if (PPOOL.length < 40) PPOOL.push(p);
  }
  function goTo(p, x, y, spd) { p.tx = x; p.ty = y; p.beh = 'goto'; if (spd) p.spd = spd; }
  function personUpdate(p, dt) {
    if (p.lookT > 0) p.lookT -= dt;
    if (p.knockT > 0) { p.knockT -= dt; p.vx *= 0.9; p.vy *= 0.9; return; }
    if (p.beh === 'goto') {
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      if (d < 1.2) { p.beh = 'stand'; p.vx = p.vy = 0; p.anim.speed = 0; }
      else {
        const s = Math.min(p.spd, d * 3);
        p.vx = (dx / d) * s; p.vy = (dy / d) * s;
        const c = N.world.collide(p.x + p.vx * dt, p.y + p.vy * dt, p.r, 'walk');
        if (!c.bad) { p.x = c.x; p.y = c.y; }
        p.facing = p.angle = Math.atan2(dy, dx);
        p.anim.speed = Math.min(1, s / 45); p.anim.phase += s * dt * 0.25;
        return;
      }
    }
    p.vx = p.vy = 0; p.anim.speed = 0;
    const tg = p.lookT > 0 && p.lookAt ? p.lookAt : p.faceX != null ? { x: p.faceX, y: p.faceY } : null;
    if (tg) { const a = Math.atan2(tg.y - p.y, tg.x - p.x); p.facing += U.angleDiff(p.facing, a) * Math.min(1, dt * 6); p.angle = p.facing; }
  }
  function drawPerson2D(ctx, p) {
    const T = N.traffic;
    if (T && T.blitPerson) T.blitPerson(ctx, p.look, p.x, p.y, p.facing, p.anim, 0.6);
    else if (N.draw && N.draw.sprite && N.people) N.draw.sprite(p.x, p.y, p.facing, 0.6, (g) => N.people.draw(g, p.look, p.anim));
  }
  const bark = (who, text, secs) => { try { if (N.dialogue && N.dialogue.bark && who && who.alive !== false) N.dialogue.bark(who, text, { secs: secs || 1.8 }); } catch (e) { /* optional */ } };
  const KID_LINES = ['Wah!', 'Bhale!', 'Ooh, see that one!', 'Happy Diwali!', 'Mine is bigger!', 'Light it, light it!', 'Abba, so loud!', 'Rocket, rocket!', 'Again, again!'];
  const ADULT_LINES = ['Step back, step back!', 'Not near the gate, ra!', 'Hold it away from your clothes.', 'Water bucket is here.', 'Careful, careful.', 'Only one at a time.'];

  /* ================================================================ families out with crackers */
  /** the deterministic family sites round (cx, cy): outside decorated houses' gates + colony playgrounds */
  const _gs = [];
  function groupSites(cx, cy, r) {
    const out = [];
    const night = dayNo();
    for (const d of housesNear(cx, cy, r, 60, _gs)) {
      if (d.home) continue;
      if (hsh(d.cx * 1.31 + night * 7.7, d.cy * 0.71) > 0.34) continue;   // this family is out tonight
      const sv = d.setback > 2.5 ? d.setback + 3.6 : 4.5;
      const q = d.P(0, sv), fp = d.P(0, sv + 8.5);
      if (!N.world.isWalkable(q[0], q[1]) || !fireOK(fp[0], fp[1]) || !N.world.isWalkable(fp[0], fp[1])) continue;
      out.push({ key: 'h' + d.id, kind: 'house', x: q[0], y: q[1], fx: fp[0], fy: fp[1], ux: d.ux, uy: d.uy, nx: d.nx, ny: d.ny, house: d, big: false });
    }
    const P = N.places;
    for (const id in P) {
      const pl = P[id];
      if (pl.kind !== 'playground' || Math.hypot(pl.x - cx, pl.y - cy) > r || !fireOK(pl.x, pl.y)) continue;
      if (!N.world.isWalkable(pl.x, pl.y)) continue;
      out.push({ key: 'p' + id, kind: 'ground', x: pl.x - 6, y: pl.y, fx: pl.x + 6, fy: pl.y, ux: 0, uy: 1, nx: 1, ny: 0, house: null, big: true });
    }
    return out;
  }
  function spawnGroup(site) {
    const style = styleOf(N.world.districtAt(site.x, site.y));
    const g = { key: site.key, site, members: [], kids: [], adult: null, adult2: null, t: rr(0.6, 2.5), act: null, cheerT: rr(3, 8), bucket: null, home: false };
    const ux = site.ux, uy = site.uy, face = Math.atan2(site.fy - site.y, site.fx - site.x);
    const at = (u, v) => ({ x: site.x + ux * u + site.nx * v, y: site.y + uy * u + site.ny * v });
    const a = at(-3.2, 0);
    g.adult = newPerson(pick(['aunty', 'uncle', 'man', 'lungi', 'aunty']), a.x, a.y, { faceX: site.fx, faceY: site.fy, style, grp: g, face });
    if (!g.adult) return null;
    g.members.push(g.adult);
    const b = at(-6.4, -0.8); g.bucket = { x: b.x, y: b.y };
    if (site.big || rnd() < 0.35) { const a2 = at(5.5, -0.6); g.adult2 = newPerson(rnd() < 0.5 ? 'youth' : 'aunty', a2.x, a2.y, { faceX: site.fx, faceY: site.fy, style, grp: g, face }); if (g.adult2) g.members.push(g.adult2); }
    const nk = site.big ? 4 : 1 + ((rnd() * 2.6) | 0);
    for (let k = 0; k < nk; k++) {
      const q = at(0.2 + k * 3.1 - (site.big ? 2 : 0), 1.2 + (k % 2) * 1.4);
      const kid = newPerson('kid', q.x, q.y, { faceX: site.fx, faceY: site.fy, style, grp: g, face });
      if (kid) { g.members.push(kid); g.kids.push(kid); }
    }
    for (const m of g.members) { m.hx = m.x; m.hy = m.y; }
    GROUPS.push(g);
    return g;
  }
  function freeGroup(g) {
    for (const e of EMIT) if (e.grp === g) { if (e.kind === 'sparkler') e.t = e.dur; e.grp = null; }
    for (const m of g.members) freePerson(m);
    const i = GROUPS.indexOf(g); if (i >= 0) GROUPS.splice(i, 1);
    if (g.home) homeTalk(false);
  }
  const ACTS = [['sparkler', 3], ['anaar', 2], ['chakri', 1.6], ['ladi', 1], ['bomb', 0.8], ['rocket', 1.4]];
  function groupUpdate(g, dt) {
    const I = Math.max(intensity(), 0.15);
    for (const m of g.members) if (!m.alive) { freeGroup(g); return; }
    const A0 = g.act;
    if (A0) {
      const ad = g.adult;
      if (A0.state === 'walk') { if (ad.beh !== 'goto') { A0.state = 'light'; A0.tt = 0.9; ad.faceX = A0.x; ad.faceY = A0.y; sfxAt('dw_match', A0.x, A0.y, 0.6); spark(A0.x, A0.y, 0.6, 0, 0, 3, 0.4, 6, 1.2, 2); } }
      else if (A0.state === 'light') {
        A0.tt -= dt;
        if (A0.tt <= 0) {
          if (someoneNear(A0.x, A0.y, 4.5, ad)) { A0.tt = 1.5; return; } // wait till the way is clear
          lightKind(A0.kind, A0.x, A0.y, { by: ad, grp: g, a: A0.a });
          A0.state = 'back'; goTo(ad, ad.hx, ad.hy, A0.kind === 'bomb' || A0.kind === 'ladi' ? 62 : 38); ad.faceX = g.site.fx; ad.faceY = g.site.fy;
          if (A0.kind === 'bomb' || A0.kind === 'ladi') for (const k of g.kids) if (rnd() < 0.6) { k.lookAt = { x: A0.x, y: A0.y }; k.lookT = 3; }
        }
      } else if (A0.state === 'back') { if (ad.beh !== 'goto') { g.act = null; g.t = rr(TUNE.groupEvery[0], TUNE.groupEvery[1]) / (0.45 + I); } }
    } else {
      g.t -= dt;
      if (g.t <= 0 && !(crackerTime() && intensity() > 0.02)) g.t = 5; // the night is over: no new ones
      if (g.t <= 0) {
        let tot = 0; const w = [];
        for (const [k, wt] of ACTS) {
          let v = wt;
          if (k === 'sparkler' && !g.kids.some((q) => !q.spk)) v = 0;
          if ((k === 'bomb' || k === 'ladi') && I < 0.3) v *= 0.3;
          if (k === 'rocket') v *= 0.4 + I;
          w.push(v); tot += v;
        }
        let r = rnd() * tot, kind = 'sparkler';
        for (let i = 0; i < ACTS.length; i++) { r -= w[i]; if (r <= 0) { kind = ACTS[i][0]; break; } }
        if (kind === 'sparkler') {
          const kid = g.kids.find((q) => !q.spk);
          if (kid) { sfxAt('dw_match', kid.x, kid.y, 0.5); const e = emitter('sparkler', kid.x, kid.y, { holder: kid, grp: g, force: true, onEnd: () => { kid.spk = null; kid.balloons = null; } }); if (e) { kid.spk = e; kid.balloons = []; } }
          g.t = rr(1.5, 4) / (0.5 + I);
        } else {
          const far = kind === 'bomb' || kind === 'ladi' ? 4 : 0, s = g.site;
          let x = s.fx + s.nx * far + s.ux * rr(-3, 3), y = s.fy + s.ny * far + s.uy * rr(-3, 3);
          if (!N.world.isWalkable(x, y) || !fireOK(x, y)) { x = s.fx; y = s.fy; }
          const a = Math.atan2(s.uy, s.ux) + (rnd() < 0.5 ? 0 : PI);
          g.act = { kind, x, y, a, state: 'walk', tt: 0 };
          const back = kind === 'ladi' ? -1.5 : -2.2;
          goTo(g.adult, x + s.nx * back, y + s.ny * back, 34); // he crouches on the family's side of it
        }
      }
    }
    // the kids cheer now and then while something is going
    g.cheerT -= dt;
    if (g.cheerT <= 0) { g.cheerT = rr(5, 11); const k = g.kids.length ? pick(g.kids) : null; if (k && (g.act || EMIT.some((e) => e.grp === g))) bark(k, pick(KID_LINES)); else if (g.adult && rnd() < 0.3) bark(g.adult, pick(ADULT_LINES)); }
  }
  /** light a cracker of `kind` at (x, y): 'anaar' | 'chakri' | 'bomb' | 'ladi' | 'rocket' (from a bottle) | 'phuljhadi' */
  function lightKind(kind, x, y, o) {
    o = o || {};
    if (kind === 'anaar') return emitter('anaar', x, y, { grp: o.grp, force: true });
    if (kind === 'chakri') return emitter('chakri', x, y, { grp: o.grp, force: true });
    if (kind === 'bomb') return emitter('bomb', x, y, { grp: o.grp, big: rr(0.8, 1.2) });
    if (kind === 'ladi') return emitter('ladi', x, y, { grp: o.grp, a: o.a != null ? o.a : rnd() * TAU, len: rr(10, 16), force: true });
    if (kind === 'rocket') return emitter('bottle', x, y, { grp: o.grp, rocket: { type: pick(BURSTS), big: rr(0.75, 1.05) } });
    if (kind === 'phuljhadi' || kind === 'sparkler') return emitter('sparkler', x, y, { holder: o.holder || null, grp: o.grp, force: true });
    return null;
  }

  /* ================================================================ the home family on Diwali night */
  const HOME_LINES = {
    amma: ['First the diyas, then the crackers, {nick}.', 'Phuljhadi only! Hold it away from your clothes.', 'Look at Chitti, so happy. Don\'t scare her with bombs.', 'Wear your chappals, the road is full of paper.'],
    nanna: ['Bucket is here. Light it and step back, *chuddam*.', 'The big rocket after dinner.', 'Nobody lights near the cow, okay?', 'Smile! One photo with the anaar.'],
  };
  function wantHomeFamily() {
    if (!active() || F().dw_no_home_family) return false;
    if (N.missions && N.missions.active) return false;
    const m = mins();
    if (!(m >= 17 * 60 + 45 || m < 30 || (dayNo() === 24 && m > 4 * 60 + 30 && m < 6 * 60 + 30))) return false;
    const h = spots.home, p = N.player;
    return !!(h && p && Math.hypot(h.x - p.x, h.y - p.y) < 420);
  }
  function npcLook(id) { try { if (N.npcs && N.npcs.look) { const l = N.npcs.look(id); if (l) return Object.assign({}, l, { prop: null }); } } catch (e) { /* stub */ } return null; }
  function spawnHomeFamily() {
    const d = homeDecor(); if (!d) return null;
    const sv = d.setback + 6.5;
    const q = d.P(0, sv), fp = d.P(0, sv + 9);
    const site = { key: 'home', kind: 'home', x: q[0], y: q[1], fx: fp[0], fy: fp[1], ux: d.ux, uy: d.uy, nx: d.nx, ny: d.ny, house: d, big: false };
    const g = { key: 'home', site, members: [], kids: [], adult: null, adult2: null, t: rr(1, 3), act: null, cheerT: rr(4, 9), bucket: null, home: true };
    const at = (u, v) => ({ x: site.x + site.ux * u + site.nx * v, y: site.y + site.uy * u + site.ny * v });
    const face = Math.atan2(site.fy - site.y, site.fx - site.x);
    const n = at(-3.4, 0.4), a = at(4.2, -0.6), c = at(0.6, 1.4), b = at(-6.6, -0.6);
    g.adult = newPerson('man', n.x, n.y, { look: npcLook('nanna') || null, faceX: site.fx, faceY: site.fy, grp: g, face, force: true, npcId: 'nanna' });
    g.adult2 = newPerson('aunty', a.x, a.y, { look: npcLook('amma') || null, faceX: site.fx, faceY: site.fy, grp: g, face, force: true, npcId: 'amma' });
    const chitti = newPerson('kid', c.x, c.y, { look: npcLook('chitti') || null, faceX: site.fx, faceY: site.fy, grp: g, face, force: true, npcId: 'chitti' });
    if (!g.adult || !g.adult2) { for (const m of [g.adult, g.adult2, chitti]) freePerson(m); return null; }
    g.members.push(g.adult, g.adult2); if (chitti) { g.members.push(chitti); g.kids.push(chitti); }
    for (const m of g.members) { m.hx = m.x; m.hy = m.y; }
    g.bucket = { x: b.x, y: b.y };
    GROUPS.push(g);
    homeTalk(g);
    return g;
  }
  let homeTalkOn = false;
  function homeTalk(g) {
    const I = N.interact; if (!I || !I.add) return;
    if (!g) { if (homeTalkOn) { I.remove('dw_talk_amma'); I.remove('dw_talk_nanna'); homeTalkOn = false; } return; }
    homeTalkOn = true;
    const say = (id) => () => { const t = pick(HOME_LINES[id]); try { if (N.dialogue && N.dialogue.say) N.dialogue.say(id, t); } catch (e) { bark(id === 'amma' ? g.adult2 : g.adult, t); } };
    I.add('dw_talk_amma', { entity: g.adult2, r: 12, priority: 1, label: 'Talk to Amma', enabled: () => !!(g.adult2 && g.adult2.alive), use: say('amma') });
    I.add('dw_talk_nanna', { entity: g.adult, r: 12, priority: 1, label: 'Talk to Nanna', enabled: () => !!(g.adult && g.adult.alive), use: say('nanna') });
  }

  /* ================================================================ the director: families + city rockets + shows */
  let dirT = 0, cityAcc = 0, farAcc = 0;
  function groupRange() { if (is3D()) return 260; const v = N.render.view; return Math.max(220, Math.hypot(v.x1 - v.x0, v.y1 - v.y0) * 0.5 + 60); }
  function crackerTime() { const m = mins(); return m >= 17 * 60 + 40 || m < 100 || (dayNo() === 24 && m > 4 * 60 + 15 && m < 6 * 60 + 40); }
  function director() {
    const p = N.player; if (!p || !N.world || !N.world.built) return;
    const on = active() && intensity() > 0.02 && crackerTime();
    const R0 = groupRange();
    // the home family
    const hg = GROUPS.find((g) => g.home);
    if (wantHomeFamily()) { if (!hg) spawnHomeFamily(); }
    else if (hg && (!hg.adult || Math.hypot(hg.site.x - p.x, hg.site.y - p.y) > 470 || !active() || (N.missions && N.missions.active) || !N.render.inView(hg.site.x, hg.site.y, 30))) freeGroup(hg);
    // release far families (out of sight) / when the night is over
    for (let i = GROUPS.length - 1; i >= 0; i--) {
      const g = GROUPS[i]; if (g.home) continue;
      const d = Math.hypot(g.site.x - p.x, g.site.y - p.y);
      const seen = !is3D() && N.render.inView(g.site.x, g.site.y, 20);
      if ((d > R0 + 140 || !on) && !seen && !g.act) freeGroup(g);
    }
    try { stallPeople(); } catch (e) { N.err('diwali.stallPeople', e); }
    if (!on) return;
    const want = Math.round(BUD().groups * Math.min(1, 0.35 + intensity() * 1.3));
    let n = GROUPS.filter((g) => !g.home).length;
    if (n >= want) return;
    const sites = groupSites(p.x, p.y, R0);
    sites.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    for (const s of sites) {
      if (n >= want) break;
      if (GROUPS.some((g) => g.key === s.key || Math.hypot(g.site.x - s.x, g.site.y - s.y) < 40)) continue;
      if (Math.hypot(s.x - p.x, s.y - p.y) < 10) continue;
      if (spawnGroup(s)) { n++; break; } // one family per tick (no hitch)
    }
  }
  // the stalls' people: a vendor behind each open stall near the player, customers at the counter by the hour
  const STALLP = new Map();
  function freeStallPeople(id) { const o = STALLP.get(id); if (!o) return; freePerson(o.vendor); for (const c of o.cust) freePerson(c); STALLP.delete(id); }
  function stallPeople() {
    const p = N.player, open = stallsOpen(), R0 = is3D() ? 220 : groupRange();
    for (const [id, o] of STALLP) {
      const d = Math.hypot(o.st.x - p.x, o.st.y - p.y), seen = !is3D() && N.render.inView(o.st.x, o.st.y, 20);
      if ((!open && !seen) || (d > R0 + 140 && !seen) || (o.vendor && !o.vendor.alive)) freeStallPeople(id);
    }
    if (!open) return;
    const m = mins(), peak = m > 17 * 60 && m < 22 * 60 + 30 ? 3 : m > 10 * 60 ? 2 : 1;
    let n = 0;
    for (const st of stallList()) {
      if (n >= 2 || PERSONS.length >= BUD().persons - 2) break;
      if (STALLP.has(st.id) || Math.abs(st.x - p.x) > R0 || Math.abs(st.y - p.y) > R0) continue;
      const ca = Math.cos(st.a), sa = Math.sin(st.a), P = (u, w) => ({ x: st.x + (ca * u + st.fx * w) * SS, y: st.y + (sa * u + st.fy * w) * SS });
      const fx = st.x + st.fx * 30, fy = st.y + st.fy * 30, v = P(rr(-2, 2), -1.9);
      const vendor = newPerson(pick(['uncle', 'man', 'lungi', 'youth']), v.x, v.y, { faceX: fx, faceY: fy, face: Math.atan2(st.fy, st.fx) });
      if (!vendor) break;
      const o = { st, vendor, cust: [] };
      for (let k = 0; k < peak; k++) {
        if (rnd() > 0.75) continue;
        const q = P(rr(-4.5, 4.5), rr(5.2, 6.6)), c = newPerson(pick(['aunty', 'man', 'kid', 'uncle', 'youth', 'kid']), q.x, q.y, { faceX: st.x, faceY: st.y, face: Math.atan2(-st.fy, -st.fx) });
        if (c) o.cust.push(c);
      }
      STALLP.set(st.id, o);
      n++;
    }
  }
  function cityRocket() {
    const p = N.player; if (!p) return;
    let x, y;
    for (let t = 0; t < 6; t++) {
      if (is3D()) {
        const yaw = N.view && isFinite(N.view.yaw) ? N.view.yaw : 0;
        const front = rnd() < 0.6, a = front ? yaw + rr(-0.9, 0.9) : rnd() * TAU, d = front ? rr(160, 900) : rr(120, TUNE.range3d);
        x = p.x + Math.cos(a) * d; y = p.y + Math.sin(a) * d;
      } else {
        const v = N.render.view;
        // the perspective throws high bursts outwards from the screen centre: launch them well inside the view
        const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2, hw = (v.x1 - v.x0) / 2 / 1.6, hh = (v.y1 - v.y0) / 2 / 1.6;
        if (rnd() < 0.75) { x = rr(cx - hw, cx + hw); y = rr(cy - hh, cy + hh); }
        else { const a = rnd() * TAU, d = rr(150, TUNE.range); x = p.x + Math.cos(a) * d; y = p.y + Math.sin(a) * d; }
      }
      if (Math.hypot(x - p.x, y - p.y) < 40) continue;
      const s = N.world.surfaceAt(x, y);
      if (s === N.SURF.WATER || s === N.SURF.VOID || !fireOK(x, y)) continue;
      const h0 = s === N.SURF.SOLID ? rr(18, 32) : 1;
      rocket(x, y, { h: h0, big: rr(0.8, 1.25), vh: rr(105, 150) });
      return;
    }
  }
  const SHOWS = [];
  /** a dense show round (x, y) for `secs` seconds (the terrace view): rockets at ~3/s 140-520 u away, bigger shells */
  function show(x, y, secs, o) {
    o = o || {};
    const s = { x, y, t: 0, secs: secs || 20, acc: 0, rate: o.rate || (PHONE() ? 2.2 : 3.4), r0: o.r0 || 140, r1: o.r1 || 520, done: false };
    SHOWS.push(s);
    return { stop() { s.done = true; }, get running() { return !s.done; }, get t() { return s.t; } };
  }
  function updateShows(dt) {
    for (let i = SHOWS.length - 1; i >= 0; i--) {
      const s = SHOWS[i];
      s.t += dt;
      if (s.done || s.t >= s.secs) { SHOWS.splice(i, 1); continue; }
      s.acc += s.rate * dt * (0.7 + 0.6 * Math.sin(s.t * 0.9) ** 2);
      while (s.acc >= 1) {
        s.acc -= 1;
        for (let t = 0; t < 5; t++) {
          const a = rnd() * TAU, d = rr(s.r0, s.r1), x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d;
          if (!fireOK(x, y) || N.world.surfaceAt(x, y) === N.SURF.WATER) continue;
          rocket(x, y, { force: true, big: rr(1, 1.45), h: N.world.surfaceAt(x, y) === N.SURF.SOLID ? 24 : 1, vh: rr(120, 160) });
          break;
        }
      }
    }
  }
  function updateCity(dt) {
    const I = intensity();
    if (I > 0 && crackerTime()) {
      cityAcc += TUNE.rocketRate * I * (PHONE() ? 0.55 : 1) * dt;
      while (cityAcc >= 1) { cityAcc -= 1; cityRocket(); }
      // the whole city popping far away: bombs and ladis heard, not seen
      farAcc += I * 2.4 * dt;
      while (farAcc >= 1) { farAcc -= 1; if (rnd() < 0.7) sfx('dw_far', { vol: rr(0.12, 0.32), delay: rr(0, 0.6) }); else sfx('dw_crackle', { vol: rr(0.06, 0.14), n: 10 }); }
    } else { cityAcc = 0; farAcc = 0; }
    updateShows(dt);
  }

  /* ================================================================ free roam: the cracker box + the lighting rule */
  const KINDS = ['phuljhadi', 'chakri', 'anaar', 'rocket'];
  const KIND_NAME = { phuljhadi: 'phuljhadi', chakri: 'chakri', anaar: 'anaar', rocket: 'rocket' };
  const box = {
    items: { phuljhadi: 0, chakri: 0, anaar: 0, rocket: 0 },
    /** add n of a kind (phuljhadi | chakri | anaar | rocket); returns the new count */
    add(kind, n) { if (!(kind in box.items)) return 0; box.items[kind] = Math.max(0, (box.items[kind] | 0) + (n == null ? 1 : n | 0)); N.emit('diwali:box', { kind, n: box.items[kind], items: Object.assign({}, box.items) }); return box.items[kind]; },
    /** take one out; false when there is none */
    use(kind) { if (!(box.items[kind] > 0)) return false; box.items[kind]--; N.emit('diwali:box', { kind, n: box.items[kind], items: Object.assign({}, box.items), used: true }); return true; },
    count(kind) { return kind ? box.items[kind] | 0 : box.total(); },
    total() { let t = 0; for (const k of KINDS) t += box.items[k] | 0; return t; },
    clear() { for (const k of KINDS) box.items[k] = 0; },
  };
  /** what is wrong with lighting one (kind; default a noisy one) at (x, y) right now? -> {ok, why, spot, near} (why: 'quiet'
   *  (not Diwali / daytime), 'adult' (no Amma / Nanna / bucket within TUNE.lightR), 'hospital', 'respect', 'elder', 'animal',
   *  'vehicle'). A phuljhadi is quiet: elders and animals may watch it. */
  const _cq = [];
  function canLight(x, y, kind) {
    const out = { ok: false, why: null, spot: null, near: null };
    if (!active() || !(isNight() || dayNo() === 24 && mins() > 4 * 60 + 15 && mins() < 6 * 60 + 40)) { out.why = 'quiet'; return out; }
    out.spot = spots.near(x, y, TUNE.lightR);
    if (!out.spot) { out.why = 'adult'; return out; }
    for (const h of hospitals()) if (Math.hypot(h.x - x, h.y - y) < TUNE.hospitalR) { out.why = 'hospital'; out.near = h; return out; }
    if (!fireOK(x, y)) { out.why = 'respect'; return out; }
    _cq.length = 0;
    try { N.entities.query(x, y, Math.max(TUNE.elderR, TUNE.animalR), null, _cq); } catch (e) { /* ok */ }
    const quiet = kind === 'phuljhadi' || kind === 'sparkler';
    for (const q of _cq) {
      if (!q.alive || q === N.player) continue;
      const d = Math.hypot(q.x - x, q.y - y);
      if (quiet && q.kind !== 'vehicle') continue;
      if (q.kind === 'animal' && d < TUNE.animalR) { out.why = 'animal'; out.near = q; return out; }
      if ((q.kind === 'ped' || q.kind === 'npc') && d < TUNE.elderR && (q.role === 'old' || q.role === 'elder' || q.npcId === 'ammamma' || (q.look && q.look.hair === '#e8e4dc'))) { out.why = 'elder'; out.near = q; return out; }
      if (q.kind === 'vehicle' && d < 12 && Math.hypot(q.vx, q.vy) > 5) { out.why = 'vehicle'; out.near = q; return out; }
    }
    out.ok = true;
    return out;
  }
  const STOP_LINES = {
    elder: ['Arre, not near Thatha! His heart, ra.', 'Old people are sitting there. Move away!'],
    animal: ['Not near the animal! See how it\'s shivering.', 'Poor thing is scared. Go away from it first.'],
    hospital: ['Hospital is right there, people are sleeping. No crackers here!'],
    respect: ['Not here. Go further down the lane.'],
    vehicle: ['Wait! Let the vehicle go first.'],
  };
  /** Chinnu lights one from his box at (x, y) (default: in front of him). -> the emitter / rocket, or null (and why) */
  function lightFromBox(kind, o) {
    o = o || {};
    const p = N.player; if (!p) return null;
    kind = kind || KINDS.find((k) => box.items[k] > 0);
    if (!kind || !(box.items[kind] > 0)) return null;
    const fa = p.facing != null ? p.facing : p.angle || 0;
    const x = o.x != null ? o.x : kind === 'phuljhadi' ? p.x : p.x + Math.cos(fa) * 7, y = o.y != null ? o.y : kind === 'phuljhadi' ? p.y : p.y + Math.sin(fa) * 7;
    const c = canLight(x, y, kind);
    if (!c.ok) {
      if (c.spot && c.why !== 'quiet' && c.why !== 'adult') {
        // the adult stops it, and the Chappal Meter warms up
        STATS.stopped++;
        const ad = c.spot.adult;
        bark(ad, pick(STOP_LINES[c.why] || STOP_LINES.respect), 2.4);
        if (c.why !== 'vehicle' && c.why !== 'respect') { try { if (N.wanted && N.wanted.addHeat) N.wanted.addHeat(TUNE.heat, 'cracker'); } catch (e) { /* optional */ } }
        N.emit('diwali:stopped', { why: c.why, kind });
      } else if (c.why === 'adult') { try { if (N.hud && N.hud.toast) N.hud.toast('Crackers only with Amma or Nanna, next to a bucket of water.', 2600, { key: 'dw_rule' }); } catch (e) { /* optional */ } }
      return null;
    }
    box.use(kind);
    STATS.lit++;
    sfxAt('dw_match', x, y, 0.7);
    let e = null;
    if (kind === 'phuljhadi') e = emitter('sparkler', x, y, { holder: p, force: true, by: p });
    else if (kind === 'rocket') e = emitter('bottle', x, y, { by: p, rocket: { big: 1, type: pick(BURSTS) } });
    else e = emitter(kind, x, y, { by: p, force: true });
    N.emit('diwali:light', { kind, x, y, by: 'player', emitter: e });
    return e;
  }
  function roamOffers() {
    const p = N.player, I = N.interact;
    if (!p || !I || !I.offer || p.vehicle || N.state.mode !== 'play' || (N.missions && N.missions.active && N.missions.active.diwaliOwnsLighting)) return;
    // light one from the box beside an adult with a bucket
    if (box.total() > 0 && active() && isNight()) {
      const sp = spots.near(p.x, p.y, TUNE.lightR);
      if (sp && !EMIT.some((e) => e.holder === p)) {
        const kinds = KINDS.filter((k) => box.items[k] > 0);
        const k0 = kinds[0];
        I.offer({ label: kinds.length > 1 ? 'Light a cracker' : 'Light a ' + KIND_NAME[k0] + ' (' + box.items[k0] + ')', priority: 3, dist: sp.d || 0, use: () => {
          if (kinds.length > 1 && N.hud && N.hud.ask) {
            N.hud.ask('Which one?', kinds.map((k) => ({ label: KIND_NAME[k] + ' ×' + box.items[k], fn: () => lightFromBox(k) })).concat([{ label: 'Not now', key: 'Escape', fn: () => {} }]));
          } else lightFromBox(k0);
        } });
      }
    }
    // the ₹5 phuljhadi box at any open stall
    if (stallsOpen()) {
      let best = null, bd = 16;
      for (const s of stallList()) { if (Math.abs(s.x - p.x) > 20 || Math.abs(s.y - p.y) > 20) continue; const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < bd) { bd = d; best = s; } }
      if (best) I.offer({ label: 'Phuljhadi box ₹' + (TUNE.phuljhadiBox.price / 100), priority: 2, dist: bd, use: () => buyPhuljhadi(best) });
    }
  }
  function buyPhuljhadi(stall) {
    const price = TUNE.phuljhadiBox.price;
    let ok = false;
    try {
      if (N.shops && N.shops.charge) ok = !!N.shops.charge(price, { why: 'phuljhadi' }).ok;
      else if (N.player && N.player.money >= price) { N.player.money -= price; ok = true; N.emit('money', { delta: -price, total: N.player.money, why: 'phuljhadi' }); }
    } catch (e) { N.err('diwali.buy', e); }
    if (!ok) { try { N.hud.toast('Not enough money for phuljhadis.', 2000, { key: 'dw_buy' }); } catch (e) { /* optional */ } return false; }
    box.add('phuljhadi', TUNE.phuljhadiBox.n);
    try { N.hud.toast('Got a box of phuljhadis (' + TUNE.phuljhadiBox.n + '). Light them with Amma or Nanna!', 2600, { key: 'dw_buy' }); } catch (e) { /* optional */ }
    try { if (N.audio && N.audio.sfx) N.audio.sfx('coin', {}); } catch (e) { /* optional */ }
    N.emit('diwali:buy', { stall: stall.id, kind: 'phuljhadi', n: TUNE.phuljhadiBox.n });
    return true;
  }

  /* ================================================================ sprites (shared painters: 2D canvases + 3D atlases) */
  const RC = ['#e8207a', '#f2c230', '#ff7a1a', '#2aa84a', '#2a7ad8', '#f4f0e8', '#c020c0', '#e83030', '#18a8a0'];
  function petal(g, cx, cy, a, r0, len, wid) { g.save(); g.translate(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.rotate(a); g.beginPath(); g.ellipse(len / 2, 0, len / 2, wid / 2, 0, 0, TAU); g.restore(); }
  function ring(g, cx, cy, r, n, col, fn) { g.fillStyle = col; for (let i = 0; i < n; i++) { fn(i, (i / n) * TAU); g.fill(); } }
  /** a festive rangoli / muggulu (design v 0..7) in a circle of radius R px at (cx, cy) */
  function paintRangoli(g, cx, cy, R, v) {
    g.save();
    const c = (i) => RC[(i + v) % RC.length];
    g.fillStyle = 'rgba(244,240,232,0.9)'; g.beginPath(); g.arc(cx, cy, R * 0.98, 0, TAU); g.fill();       // the rice-flour base
    g.fillStyle = c(0); g.beginPath(); g.arc(cx, cy, R * 0.92, 0, TAU); g.fill();
    switch (v % 8) {
      case 0: ring(g, cx, cy, R, 8, c(1), (i, a) => petal(g, cx, cy, a, R * 0.3, R * 0.6, R * 0.34)); ring(g, cx, cy, R, 8, c(2), (i, a) => petal(g, cx, cy, a + PI / 8, R * 0.15, R * 0.45, R * 0.22)); break;
      case 1: { g.fillStyle = c(3); g.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r = i % 2 ? R * 0.42 : R * 0.86; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.fill(); g.fillStyle = c(1); g.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + PI / 8, r = i % 2 ? R * 0.25 : R * 0.5; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.fill(); break; }
      case 2: for (let i = 0; i < 12; i++) { g.fillStyle = RC[i % RC.length]; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R * 0.86, (i / 12) * TAU, ((i + 1) / 12) * TAU); g.closePath(); g.fill(); } break;
      case 3: { g.fillStyle = c(4); g.beginPath(); g.moveTo(cx, cy - R * 0.85); g.lineTo(cx + R * 0.85, cy); g.lineTo(cx, cy + R * 0.85); g.lineTo(cx - R * 0.85, cy); g.closePath(); g.fill(); g.fillStyle = c(1); g.fillRect(cx - R * 0.42, cy - R * 0.42, R * 0.84, R * 0.84); g.fillStyle = '#f4f0e8'; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (Math.abs(a) + Math.abs(b) <= 3) { g.beginPath(); g.arc(cx + a * R * 0.2, cy + b * R * 0.2, R * 0.045, 0, TAU); g.fill(); } break; }
      case 4: for (let k = 0; k < 4; k++) { const r = R * (0.86 - k * 0.2); g.fillStyle = c(k + 1); g.beginPath(); for (let i = 0; i <= 48; i++) { const a = (i / 48) * TAU, rr2 = r * (1 + 0.06 * Math.sin(a * 12)); g.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); } g.fill(); } break;
      case 5: ring(g, cx, cy, R, 12, c(6), (i, a) => petal(g, cx, cy, a, R * 0.2, R * 0.66, R * 0.26)); ring(g, cx, cy, R, 12, '#f4f0e8', (i, a) => petal(g, cx, cy, a, R * 0.25, R * 0.4, R * 0.12)); break;
      case 6: ring(g, cx, cy, R, 9, '#18a8a0', (i, a) => petal(g, cx, cy, a, R * 0.2, R * 0.68, R * 0.36)); ring(g, cx, cy, R, 9, '#2a5cd8', (i, a) => petal(g, cx, cy, a, R * 0.32, R * 0.36, R * 0.2)); ring(g, cx, cy, R, 9, '#f2c230', (i, a) => { g.beginPath(); g.arc(cx + Math.cos(a) * R * 0.66, cy + Math.sin(a) * R * 0.66, R * 0.08, 0, TAU); }); break;
      default: ring(g, cx, cy, R, 8, c(2), (i, a) => petal(g, cx, cy, a, R * 0.35, R * 0.5, R * 0.3)); g.fillStyle = '#d8641a'; g.beginPath(); g.ellipse(cx, cy + R * 0.08, R * 0.34, R * 0.18, 0, 0, TAU); g.fill(); g.fillStyle = '#ffd040'; g.beginPath(); g.ellipse(cx, cy - R * 0.12, R * 0.09, R * 0.2, 0, 0, TAU); g.fill(); break;
    }
    g.fillStyle = c(5 + 2); g.beginPath(); g.arc(cx, cy, R * 0.16, 0, TAU); g.fill();
    g.fillStyle = '#fff6e8'; for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; g.beginPath(); g.arc(cx + Math.cos(a) * R * 0.93, cy + Math.sin(a) * R * 0.93, R * 0.04, 0, TAU); g.fill(); }
    g.restore();
  }
  /** cracker-paper patches: v 0, 1 trodden shreds, 2 a ladi's remains (a dense red streak), 3 soot + burnt bits, 4 a swept heap */
  function paintLitter(g, ox, oy, S, v, seed) {
    const r = U.rng('dwp' + v + ':' + seed);
    g.save();
    if (v === 3) { const gr = g.createRadialGradient(ox + S / 2, oy + S / 2, 0, ox + S / 2, oy + S / 2, S * 0.45); gr.addColorStop(0, 'rgba(20,16,14,0.75)'); gr.addColorStop(0.6, 'rgba(30,24,20,0.35)'); gr.addColorStop(1, 'rgba(30,24,20,0)'); g.fillStyle = gr; g.fillRect(ox, oy, S, S); }
    if (v === 4) { const gr = g.createRadialGradient(ox + S / 2, oy + S / 2, 0, ox + S / 2, oy + S / 2, S * 0.48); gr.addColorStop(0, 'rgba(90,30,24,0.9)'); gr.addColorStop(0.55, 'rgba(150,40,30,0.6)'); gr.addColorStop(1, 'rgba(150,40,30,0)'); g.fillStyle = gr; g.fillRect(ox, oy, S, S); }
    const n = v === 2 ? 170 : v === 4 ? 240 : v === 3 ? 50 : 110;
    for (let i = 0; i < n; i++) {
      let x, y;
      if (v === 2) { const t = r.next(); x = ox + S * (0.1 + 0.8 * t) + (r.next() - 0.5) * S * 0.16; y = oy + S * (0.1 + 0.8 * t) + (r.next() - 0.5) * S * 0.16; }
      else { const a = r.next() * TAU, d = Math.sqrt(r.next()) * S * (v === 4 ? 0.36 : 0.46); x = ox + S / 2 + Math.cos(a) * d; y = oy + S / 2 + Math.sin(a) * d; }
      const ci = v === 3 ? (r.next() < 0.55 ? 6 : 4) : pickCol(r.next());
      g.fillStyle = r.next() < 0.3 ? LBACK[ci] : LCOL[ci];
      g.globalAlpha = 0.75 + r.next() * 0.25;
      const w = S * (0.02 + r.next() * 0.035), h = S * (0.012 + r.next() * 0.022);
      g.save(); g.translate(x, y); g.rotate(r.next() * TAU);
      if (ci === 5 && r.next() < 0.5) { g.fillStyle = '#b8862a'; g.fillRect(-w, -h * 0.6, w * 2, h * 1.2); g.fillStyle = '#8a3a20'; g.fillRect(-w, -h * 0.6, w * 0.4, h * 1.2); } // a spent casing
      else g.fillRect(-w / 2, -h / 2, w, h);
      g.restore();
    }
    g.restore();
  }
  const SPR = new Map();
  function sprite(key, w, h, paint) { let c = SPR.get(key); if (!c) { c = N.render.makeCanvas(w, h); const g = c.getContext('2d'); paint(g, w, h); SPR.set(key, c); } return c; }
  const glowSprite = (col) => sprite('glow:' + col, 32, 32, (g) => { const rgb = hexRGB(col).map((v) => Math.round(v * 255)).join(','); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(' + rgb + ',0.9)'); gr.addColorStop(0.3, 'rgba(' + rgb + ',0.35)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });
  const smokeSprite = () => sprite('smoke', 32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(200,190,184,0.55)'); gr.addColorStop(0.6, 'rgba(180,170,165,0.22)'); gr.addColorStop(1, 'rgba(180,170,165,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });
  const rangoliSprite = (v) => sprite('rangoli:' + v, 72, 72, (g) => paintRangoli(g, 36, 36, 34, v));
  const litterSprite = (v) => sprite('litter:' + v, 64, 64, (g) => paintLitter(g, 0, 0, 64, v, v * 7 + 1));
  const litterTurn = (v, a) => { const q = ((Math.round(((a % TAU) + TAU) / (TAU / 4)) % 4) + 4) % 4; return sprite('litter:' + v + ':' + q, 64, 64, (g) => { g.translate(32, 32); g.rotate(q * PI / 2 + (v === 2 ? 0 : 0.4)); g.translate(-32, -32); g.drawImage(litterSprite(v), 0, 0); }); };
  function imgFlat(img, x, y, h, size, alpha) { const k = kk(h), s2 = size * k; ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.drawImage(img, SX(x, k) - s2 / 2, SY(y, k) - s2 / 2, s2, s2); }

  /* ================================================================ 2D drawing */
  let R = null, ctx = null, TT = 0, NIGHT = 0;
  const kk = (h) => R.k(h), SX = (x, k) => R.sx(x, k), SY = (y, k) => R.sy(y, k);
  const VIS = { houses: [], stalls: [] };
  const PROF = { g: 0, h: 0, k: 0, s: 0, l: 0, e: 0, st: 0, n: 0 };
  function frontVisible(d) {
    const s = d.s, lm = d.lm;
    const x = s ? s.x : lm.x - lm.w / 2, y = s ? s.y : lm.y - lm.d / 2, w = s ? s.w : lm.w, dd = s ? s.d : lm.d;
    const bits = N.draw.visibleWalls(x, y, w, dd);
    return !!(bits & ({ N: 1, S: 2, W: 4, E: 8 }[d.f] || 2));
  }
  function seg3(ax, ay, ah, bx, by, bh) { const k0 = kk(ah), k1 = kk(bh); ctx.moveTo(SX(ax, k0), SY(ay, k0)); ctx.lineTo(SX(bx, k1), SY(by, k1)); }
  function quad3(ax, ay, ah, bx, by, bh, cx, cy, ch, dx, dy, dh, col) {
    let k = kk(ah); ctx.beginPath(); ctx.moveTo(SX(ax, k), SY(ay, k)); k = kk(bh); ctx.lineTo(SX(bx, k), SY(by, k)); k = kk(ch); ctx.lineTo(SX(cx, k), SY(cy, k)); k = kk(dh); ctx.lineTo(SX(dx, k), SY(dy, k)); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
  }
  function dot(x, y, h, r, col) { const k = kk(h), s = Math.max(0.8, r * k); ctx.fillStyle = col; ctx.fillRect(SX(x, k) - s / 2, SY(y, k) - s / 2, s, s); }
  function glowAt(x, y, h, col, r, a) { const k = kk(h), s = r * k; ctx.globalAlpha = a; ctx.drawImage(glowSprite(col), SX(x, k) - s, SY(y, k) - s, s * 2, s * 2); }
  // litter bits: one pass sorts them into colour groups (front / back side), then one fill per group
  const ORD = new Int32Array(1800), GCNT = new Int32Array(LNC * 2 + 1), GOFF = new Int32Array(LNC * 2 + 1);
  const LSCALE = 1.55;
  function drawBits(air) {
    const v = R.view, n = LB.n;
    GCNT.fill(0);
    let m = 0;
    for (let i = 0; i < n; i++) {
      if ((LB.st[i] === 2) !== air) continue;
      const x = LB.x[i], y = LB.y[i];
      if (x < v.x0 - 4 || x > v.x1 + 4 || y < v.y0 - 4 || y > v.y1 + 4) continue;
      const g = LB.col[i] + (Math.cos(LB.flip[i]) < 0 ? LNC : 0);
      GCNT[g]++; ORD[m++] = i;
    }
    if (!m) return;
    let o = 0; for (let g = 0; g < LNC * 2; g++) { GOFF[g] = o; o += GCNT[g]; }
    const OUT = DRAWORD; for (let j = 0; j < m; j++) { const i = ORD[j], g = LB.col[i] + (Math.cos(LB.flip[i]) < 0 ? LNC : 0); OUT[GOFF[g]++] = i; }
    o = 0;
    for (let g = 0; g < LNC * 2; g++) {
      const c = GCNT[g]; if (!c) continue;
      ctx.fillStyle = g < LNC ? LCOL[g] : LBACK[g - LNC];
      ctx.beginPath();
      for (let j = o; j < o + c; j++) {
        const i = OUT[j], k = kk(LB.h[i]), X = SX(LB.x[i], k), Y = SY(LB.y[i], k);
        const sz = LB.size[i] * k * LSCALE, hw = sz * 0.5 * Math.max(0.22, Math.abs(Math.cos(LB.flip[i]))), hh = sz * 0.32;
        const ca = Math.cos(LB.ang[i]), sa = Math.sin(LB.ang[i]);
        const ax = ca * hw, ay = sa * hw, bx = -sa * hh, by = ca * hh;
        ctx.moveTo(X - ax - bx, Y - ay - by); ctx.lineTo(X + ax - bx, Y + ay - by); ctx.lineTo(X + ax + bx, Y + ay + by); ctx.lineTo(X - ax + bx, Y - ay + by);
      }
      ctx.fill();
      o += c;
    }
  }
  const DRAWORD = new Int32Array(1800);
  function drawBitShadows() {
    const v = R.view, sun = R.sun || { sx: 0.3, sy: 0.3 };
    ctx.fillStyle = 'rgba(20,14,20,0.28)'; ctx.beginPath();
    let any = false;
    for (let i = 0; i < LB.n; i++) {
      if (LB.st[i] !== 2) continue;
      const h = LB.h[i], x = LB.x[i] + (sun.sx || 0.3) * h, y = LB.y[i] + (sun.sy || 0.3) * h;
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
      const k = kk(0), s = Math.max(0.8, LB.size[i] * k * 0.9);
      ctx.rect(SX(x, k) - s / 2, SY(y, k) - s * 0.35, s, s * 0.7); any = true;
    }
    if (any) ctx.fill();
  }
  function drawGround2D() {
    R = N.render; ctx = R.ctx;
    const t0 = now();
    const v = R.view;
    ctx.imageSmoothingEnabled = true;
    // trodden paper patches, swept heaps, soot
    let nd = 0; const dmax = PHONE() ? 70 : 160;
    for (const d of DEC) { if (d.x < v.x0 - 12 || d.x > v.x1 + 12 || d.y < v.y0 - 12 || d.y > v.y1 + 12) continue; if (nd++ > dmax) break; imgFlat(litterTurn(d.v, d.a), d.x, d.y, 0, (d.v === 3 ? 9 : d.v === 2 ? 15 : 13) * d.s, d.k == null ? 1 : d.k); }
    for (const d of HEAPS) { if (d.x < v.x0 - 8 || d.x > v.x1 + 8 || d.y < v.y0 - 8 || d.y > v.y1 + 8) continue; imgFlat(litterTurn(4, d.a), d.x, d.y, 0.2, 8 * d.s, d.k); }
    // rangolis + the clay diyas on the steps
    for (const d of VIS.houses) if (d.rangoli) { const r = d.rangoli; imgFlat(rangoliSprite(r.v), r.x, r.y, 0, r.r * 2.1, 0.95); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#9a4a24';
    for (const d of VIS.houses) for (const q of d.diyas) { const k = kk(0.2), s = 1.1 * k; ctx.fillRect(SX(q[0], k) - s / 2, SY(q[1], k) - s * 0.35, s, s * 0.7); }
    // loose paper at rest + the shadows of the flying bits
    drawBits(false);
    drawBitShadows();
    // the crackers themselves (before / while they go)
    for (const e of EMIT) {
      if (e.x < v.x0 - 10 || e.x > v.x1 + 10 || e.y < v.y0 - 10 || e.y > v.y1 + 10) continue;
      if (e.kind === 'anaar') { const k0 = kk(0), k1 = kk(1.6); ctx.fillStyle = '#b8481e'; ctx.beginPath(); ctx.moveTo(SX(e.x - 0.9, k0), SY(e.y, k0)); ctx.lineTo(SX(e.x + 0.9, k0), SY(e.y, k0)); ctx.lineTo(SX(e.x, k1), SY(e.y, k1)); ctx.closePath(); ctx.fill(); dot(e.x, e.y, 1.6, 0.6, '#f2c230'); }
      else if (e.kind === 'chakri') { const k = kk(0.3), X = SX(e.x, k), Y = SY(e.y, k); ctx.strokeStyle = '#2a8a3a'; ctx.lineWidth = Math.max(0.6, 0.5 * k); ctx.beginPath(); ctx.arc(X, Y, 1.4 * k, e.ang, e.ang + 4.5); ctx.stroke(); ctx.strokeStyle = '#d8302a'; ctx.beginPath(); ctx.arc(X, Y, 0.7 * k, e.ang + 1, e.ang + 5); ctx.stroke(); }
      else if (e.kind === 'bomb') { dot(e.x, e.y, 0.5, 1.6, '#c82020'); dot(e.x + 0.6, e.y - 0.5, 0.9, 0.5, '#e8d8a0'); }
      else if (e.kind === 'bottle') { const k0 = kk(0), k1 = kk(3); ctx.strokeStyle = '#2a7a4a'; ctx.lineWidth = Math.max(1, 1.1 * k0); ctx.beginPath(); ctx.moveTo(SX(e.x, k0), SY(e.y, k0)); ctx.lineTo(SX(e.x, k1), SY(e.y, k1)); ctx.stroke(); ctx.strokeStyle = '#c83a2a'; ctx.lineWidth = Math.max(0.6, 0.5 * k0); ctx.beginPath(); ctx.moveTo(SX(e.x, k1), SY(e.y, k1)); ctx.lineTo(SX(e.x, kk(6)), SY(e.y, kk(6))); ctx.stroke(); }
      else if (e.kind === 'ladi') { const n = e.n, ca = Math.cos(e.a), sa = Math.sin(e.a), k = kk(0.3); ctx.fillStyle = '#c81e1e'; for (let j = e.pops; j < n; j += 2) { const u = (j / n) * e.len, s = Math.max(0.7, 0.7 * k); ctx.fillRect(SX(e.x0 + ca * u, k) - s / 2, SY(e.y0 + sa * u, k) - s / 2, s, s); } }
    }
    // the families' buckets of water
    for (const g of GROUPS) { const b = g.bucket; if (!b || b.x < v.x0 - 6 || b.x > v.x1 + 6 || b.y < v.y0 - 6 || b.y > v.y1 + 6) continue; N.draw.cyl(b.x, b.y, 1.2, 0, 2.2, { wall: '#6a8aa8', top: '#3a7ab8', grad: false }); }
    ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    STATS._d2 += now() - t0; PROF.g += now() - t0;
  }
  // a house's decor on the structures layer (right after the house: same sort key + a hair)
  function drawHouse2D(d) {
    R = N.render; ctx = R.ctx;
    const t0 = now();
    const fv = frontVisible(d);
    if (fv && d.toran) {
      const T = d.toran, n = 9;
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = T.a[0] + (T.b[0] - T.a[0]) * t, y = T.a[1] + (T.b[1] - T.a[1]) * t, h = T.h - Math.abs(Math.sin(t * PI * 3)) * 0.8;
        dot(x, y, h, 0.75, i % 2 ? '#ffb020' : '#ff7a10');
        if (i % 2 === 0) { const k0 = kk(h - 0.2), k1 = kk(h - 1.5); ctx.fillStyle = '#2f8a2a'; ctx.beginPath(); ctx.moveTo(SX(x - 0.4, k0), SY(y, k0)); ctx.lineTo(SX(x + 0.4, k0), SY(y, k0)); ctx.lineTo(SX(x, k1), SY(y, k1)); ctx.fill(); }
      }
    }
    if (fv && d.kandil) {
      const K = d.kandil, sw = Math.sin(TT * 1.6 + K.ph) * 0.35;
      const x = K.x + d.ux * sw, y = K.y + d.uy * sw;
      ctx.strokeStyle = 'rgba(40,30,30,0.6)'; ctx.lineWidth = 0.4; ctx.beginPath(); seg3(K.x, K.y, K.hTop, x, y, K.h + 1.4); ctx.stroke();
      const lit = NIGHT > 0.2;
      // the lantern: a paper body between its bottom and top rings (seen from above it leans out like the walls), a band, a cap
      const r = K.style === 'ball' ? 1.3 : 1.2, k0 = kk(K.h - 1.3), k1 = kk(K.h + 1.3), X0 = SX(x, k0), Y0 = SY(y, k0), X1 = SX(x, k1), Y1 = SY(y, k1);
      const dx = X1 - X0, dy = Y1 - Y0, L = Math.hypot(dx, dy) || 1, px = -dy / L, py = dx / L, r0 = r * k0, r1 = r * k1;
      ctx.fillStyle = lit ? (K._lit || (K._lit = U.mix(K.col[0], '#fff0c0', 0.35))) : K.col[0];
      ctx.beginPath(); ctx.moveTo(X0 + px * r0, Y0 + py * r0); ctx.lineTo(X1 + px * r1, Y1 + py * r1); ctx.lineTo(X1 - px * r1, Y1 - py * r1); ctx.lineTo(X0 - px * r0, Y0 - py * r0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(X0, Y0, r0, 0, TAU); ctx.fill();
      ctx.fillStyle = K.col[1]; ctx.beginPath(); ctx.arc(X1, Y1, r1, 0, TAU); ctx.fill();
      const km = kk(K.h), Xm = SX(x, km), Ym = SY(y, km); ctx.fillRect(Xm - r * km, Ym - 0.35 * km, r * 2 * km, 0.7 * km);
      ctx.strokeStyle = K.col[1]; ctx.lineWidth = Math.max(0.5, 0.35 * kk(K.h)); ctx.beginPath();
      for (let j = -1; j <= 1; j++) seg3(x + d.ux * j * 0.6, y + d.uy * j * 0.6, K.h - 1.3, x + d.ux * j * 0.7 + sw * 0.4, y + d.uy * j * 0.7, K.h - 4.2);
      ctx.stroke();
    }
    PROF.k += now() - t0;
    if (fv) { ctx.fillStyle = '#9a4a24'; for (const q of d.gateDiyas) { const k = kk(d.gateH), s = 1 * k; ctx.fillRect(SX(q[0], k) - s / 2, SY(q[1], k) - s * 0.35, s, s * 0.7); } }
    if (d.parapet && (!d.home || homeParapetLit())) { ctx.fillStyle = '#9a4a24'; const P = d.parapet.pts, k = kk(d.parapet.h), s = 0.85 * k; ctx.beginPath(); for (let i = 0; i < P.length; i += 2) ctx.rect(SX(P[i], k) - s / 2, SY(P[i + 1], k) - s * 0.35, s, s * 0.7); ctx.fill(); }
    if (d.fairy) { // the wire and the bulbs (dull by day; the lit ones glow on the light layer)
      const P = d.fairy.pts, k = kk(d.fairy.h);
      ctx.strokeStyle = 'rgba(30,30,30,0.5)'; ctx.lineWidth = 0.35; ctx.beginPath();
      for (let i = 0; i < P.length; i += 2) { const X = SX(P[i], k), Y = SY(P[i + 1], k); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
      ctx.stroke();
      if (NIGHT < 0.35) { ctx.fillStyle = d.fairy.cols.length > 1 ? '#c8a050' : U.shade(d.fairy.cols[0], 0.75); ctx.beginPath(); const s = Math.max(0.6, 0.5 * k); for (let i = 0; i < P.length; i += 2) ctx.rect(SX(P[i], k) - s / 2, SY(P[i + 1], k) - s / 2, s, s); ctx.fill(); }
    }
    STATS._d2 += now() - t0; PROF.h += now() - t0;
  }
  // a pataakha stall: trestle table with packs, tins at the back, bamboo poles, a striped awning, the board
  function drawStall2D(st) {
    R = N.render; ctx = R.ctx;
    const t0 = now();
    const ca = Math.cos(st.a), sa = Math.sin(st.a), fx = st.fx, fy = st.fy;
    const P = (u, w) => [st.x + (ca * u + fx * w) * SS, st.y + (sa * u + fy * w) * SS];
    const Q = (u0, w0, u1, w1, h, col) => { const a = P(u0, w0), b = P(u1, w0), c = P(u1, w1), d = P(u0, w1); quad3(a[0], a[1], h, b[0], b[1], h, c[0], c[1], h, d[0], d[1], h, col); };
    // tins stacked at the back, the table, its front skirt
    for (let i = 0; i < 4; i++) Q(-5.8 + i * 3, -3.4, -3.6 + i * 3, -1.6, 4.4 - (i % 2), ['#7a8aa8', '#c8302a', '#3a6a9a', '#d8a020'][i]);
    const tb = [P(-6.2, -0.8), P(6.2, -0.8), P(6.2, 3.2), P(-6.2, 3.2)];
    N.draw.poly(tb, 0, 3.2, { wall: '#7a5232', roof: '#a8784a' });
    const rng = U.rng('stall' + st.seed);
    for (let r0 = 0; r0 < 2; r0++) for (let c = 0; c < 6; c++) {
      const col = pick2(rng, ['#e8302a', '#f2c230', '#2a8a3a', '#2a5cd8', '#f06aa0', '#ff8a1a', '#7a3ab8']);
      const u0 = -5.6 + c * 1.9, w0 = -0.3 + r0 * 1.7;
      Q(u0, w0, u0 + 1.6, w0 + 1.4, 3.35 + (c % 2) * 0.25, col);
      Q(u0 + 0.2, w0 + 0.5, u0 + 1.4, w0 + 0.8, 3.65 + (c % 2) * 0.25, '#f8f0d8');
    }
    // poles
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = Math.max(0.6, 0.45 * kk(5)); ctx.beginPath();
    for (const [u, w] of [[-6.4, -3.8], [6.4, -3.8], [-6.4, 1.4], [6.4, 1.4]]) { const q = P(u, w); seg3(q[0], q[1], 0, q[0], q[1], w < 0 ? 9.2 : 8.2); }
    ctx.stroke();
    // the striped awning over the back half (the front of the table stays in the open)
    const ns = 8;
    for (let i = 0; i < ns; i++) {
      const u0 = -6.8 + (13.6 * i) / ns, u1 = u0 + 13.6 / ns, a = P(u0, -4.2), b = P(u1, -4.2), c = P(u1, 1.4), d = P(u0, 1.4);
      quad3(a[0], a[1], 9.4, b[0], b[1], 9.4, c[0], c[1], 8.2, d[0], d[1], 8.2, st.stripes[i % 2]);
    }
    // ladis (cracker garlands) and rocket bundles hanging from the awning's front edge
    for (let i = 0; i < 7; i++) {
      const u = -5.6 + i * 1.85, q = P(u, 1.5), hang = i % 3 === 1;
      ctx.strokeStyle = hang ? '#e8c060' : '#c8141e'; ctx.lineWidth = Math.max(0.8, (hang ? 0.35 : 0.55) * kk(7)); ctx.beginPath(); seg3(q[0], q[1], 8.2, q[0], q[1], hang ? 6.2 : 5.2); ctx.stroke();
      if (!hang) { ctx.fillStyle = '#ffd040'; const k = kk(5.2), sz = Math.max(0.8, 0.5 * k); ctx.fillRect(SX(q[0], k) - sz / 2, SY(q[1], k) - sz / 2, sz, sz); }
      else { ctx.fillStyle = '#2a5cd8'; const k = kk(6.2), sz = Math.max(0.8, 0.6 * k); ctx.fillRect(SX(q[0], k) - sz / 2, SY(q[1], k) - sz / 2, sz, sz * 1.4); }
    }
    // the board on top at the back, with its (fictional, brand-free) name
    const b0 = P(-6.6, -4.3), b1 = P(6.6, -4.3);
    quad3(b0[0], b0[1], 9.4, b1[0], b1[1], 9.4, b1[0], b1[1], 12.6, b0[0], b0[1], 12.6, '#f4ecd8');
    const tc = P(0, -4.3);
    try {
      if (N.draw.pixelText && N.draw.pixelTextWidth) {
        const bw = 12.6 * SS * kk(11);
        let t = st.label; if (N.draw.pixelTextWidth(t) > bw) t = t.split(' ')[0];
        if (N.draw.pixelTextWidth(t) <= bw) N.draw.pixelText(tc[0], tc[1], 11, t, '#b0201a', { scale: 1 });
      }
    } catch (e) { /* text optional */ }
    STATS._d2 += now() - t0; PROF.st += now() - t0;
  }
  const pick2 = (rng, a) => a[(rng.next() * a.length) | 0];
  // flying paper + smoke (before the night wash, so the night darkens them)
  function drawSky2D() {
    R = N.render; ctx = R.ctx;
    const t0 = now();
    drawBits(true);
    const v = R.view, img = smokeSprite();
    ctx.imageSmoothingEnabled = true;
    for (let i = 0; i < SM.n; i++) {
      const x = SM.x[i], y = SM.y[i];
      if (x < v.x0 - 40 || x > v.x1 + 40 || y < v.y0 - 40 || y > v.y1 + 40) continue;
      const u = SM.t[i] / SM.life[i], k = kk(SM.h[i]), s = SM.size[i] * k;
      ctx.globalAlpha = SM.a[i] * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85);
      ctx.drawImage(img, SX(x, k) - s, SY(y, k) - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
    STATS._d2 += now() - t0; PROF.s += now() - t0;
  }
  function fairyOn(i, pat, ph) {
    switch (pat) {
      case 'chase': return ((i + Math.floor(TT * 6 + ph)) % 3) !== 0;
      case 'blink': return (Math.floor(TT * 1.5 + ph) % 2) === 0 || (i % 4 === 0);
      case 'twinkle': return hsh(i * 1.7, Math.floor(TT * 3 + ph)) > 0.35;
      case 'alt': return ((i + Math.floor(TT * 1.4 + ph)) % 2) === 0;
      default: return true;
    }
  }
  const SPK = { cnt: new Int32Array(COLS.length * 2), off: new Int32Array(COLS.length * 2), ord: new Int32Array(2600), bk: new Uint8Array(2600), out: new Int32Array(2600) };
  const FAIRY_COLS = Array.from(new Set([].concat(...FAIRY_SETS)));
  // everything that glows, after the night wash: sparks, rocket heads, flashes, flames, lanterns, bulbs
  function drawLight2D() {
    R = N.render; ctx = R.ctx; NIGHT = R.night || 0;
    const t0 = now(), v = R.view;
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    // flashes: the sky lights up round a burst
    for (const f of FLASH) { if (f.x < v.x0 - 200 || f.x > v.x1 + 200 || f.y < v.y0 - 200 || f.y > v.y1 + 200) continue; const a = flashK(f); if (a <= 0.01) continue; if (f.life > 1) glowAt(f.x, f.y, f.h, f.col, f.r * 0.22, Math.min(0.5, a * 0.55)); else glowAt(f.x, f.y, f.h, f.col, f.r * (f.h > 20 ? 0.26 : 0.4), Math.min(1, a * 0.8)); }
    ctx.globalAlpha = 1;
    // sparks as short streaks (their motion over ~1/30 s): one pass sorts them into colour x brightness buckets,
    // then one stroke per bucket
    const NB = COLS.length * 2;
    SPK.cnt.fill(0);
    let m = 0;
    for (let i = 0; i < SP.n; i++) {
      const x = SP.x[i], y = SP.y[i];
      if (x < v.x0 - 30 || x > v.x1 + 30 || y < v.y0 - 30 || y > v.y1 + 30) continue;
      const u = SP.t[i] / SP.life[i];
      let a = 1 - u * u; if (SP.kind[i] === 1 && rnd() < 0.35) a *= 0.2;
      const b = SP.col[i] * 2 + (a > 0.5 ? 0 : 1);
      SPK.cnt[b]++; SPK.ord[m] = i; SPK.bk[m] = b; m++;
    }
    if (m) {
      let o = 0; for (let b = 0; b < NB; b++) { SPK.off[b] = o; o += SPK.cnt[b]; }
      for (let j = 0; j < m; j++) SPK.out[SPK.off[SPK.bk[j]]++] = SPK.ord[j];
      o = 0;
      for (let b = 0; b < NB; b++) {
        const c = SPK.cnt[b]; if (!c) continue;
        const bright = (b & 1) === 0;
        ctx.strokeStyle = COLS[b >> 1]; ctx.globalAlpha = bright ? 1 : 0.45; ctx.lineWidth = bright ? 1.7 : 1.2;
        ctx.beginPath();
        for (let j = o; j < o + c; j++) {
          const i = SPK.out[j], kd = SP.kind[i], h = SP.h[i], k1 = kk(h), sl = kd === 2 ? 0.02 : kd === 4 ? 0.03 : 0.045, k0 = kk(h - SP.vh[i] * sl);
          ctx.moveTo(SX(SP.x[i] - SP.vx[i] * sl, k0), SY(SP.y[i] - SP.vy[i] * sl, k0)); ctx.lineTo(SX(SP.x[i], k1) + 0.01, SY(SP.y[i], k1));
        }
        ctx.stroke();
        o += c;
      }
    }
    ctx.globalAlpha = 1;
    for (const r of ROCKETS) { if (r.x < v.x0 - 30 || r.x > v.x1 + 30 || r.y < v.y0 - 30 || r.y > v.y1 + 30) continue; dot(r.x, r.y, r.h, 1.3, '#fff4d0'); glowAt(r.x, r.y, r.h, '#ffb050', 3, 0.7); }
    for (const e of EMIT) {
      if (e.x < v.x0 - 20 || e.x > v.x1 + 20 || e.y < v.y0 - 20 || e.y > v.y1 + 20) continue;
      if (e.kind === 'anaar' && e.t > 0.3) glowAt(e.x, e.y, 3, '#ffd080', 9, 0.8);
      else if (e.kind === 'sparkler') glowAt(e.x, e.y, e.h, '#fff0c0', 4.5, 0.85);
      else if (e.kind === 'chakri') glowAt(e.x, e.y, 0.5, '#ffe060', 5, 0.8);
    }
    // diya flames, lanterns and fairy lights on the visible houses: batched across houses (one fill per colour);
    // soft glow sprites only on the nearest houses
    const lamps = lampTime(), lit = NIGHT > 0.12, fl = clamp(0.35 + NIGHT, 0, 1);
    if (lamps) {
      const parOK = homeParapetLit();
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass ? '#fff0a0' : '#ff9a2a'; ctx.globalAlpha = fl; ctx.beginPath();
        const rad = pass ? 0.5 : 0.9, hh = pass ? 0.7 : 0.6;
        const fr = (x, y, h) => { const f = 0.85 + 0.3 * Math.sin(TT * 17 + x * 3.1 + y), k = kk(h + hh), sz = Math.max(0.8, rad * f * k); ctx.rect(SX(x, k) - sz / 2, SY(y, k) - sz / 2, sz, sz); };
        for (const d of VIS.houses) {
          if (d._fv) { for (const q of d.diyas) fr(q[0], q[1], 0.2); for (const q of d.gateDiyas) fr(q[0], q[1], d.gateH); }
          if (d.parapet && (!d.home || parOK)) { const P = d.parapet.pts; for (let i = 0; i < P.length; i += 2) fr(P[i], P[i + 1], d.parapet.h); }
        }
        ctx.fill();
      }
      let g = 0;
      for (const d of VIS.houses) { if (g++ > 10) break; if (!d._fv) continue; for (const q of d.diyas) glowAt(q[0], q[1], 0.8, '#ffa040', 4, 0.55 * fl); for (const q of d.gateDiyas) glowAt(q[0], q[1], d.gateH + 0.6, '#ffa040', 4, 0.55 * fl); }
    }
    if (lit) {
      for (const d of VIS.houses) if (d._fv && d.kandil) { const K = d.kandil, sw = Math.sin(TT * 1.6 + K.ph) * 0.35; glowAt(K.x + d.ux * sw, K.y + d.uy * sw, K.h, K.col[0], 5.5, 0.85 * NIGHT); }
      ctx.globalAlpha = Math.min(1, NIGHT * 1.3);
      for (let ci = 0; ci < FAIRY_COLS.length; ci++) {
        const col = FAIRY_COLS[ci]; let any = false;
        ctx.fillStyle = col; ctx.beginPath();
        for (const d of VIS.houses) {
          const Fy = d.fairy; if (!Fy || Fy.cols.indexOf(col) < 0) continue;
          const P = Fy.pts, k = kk(Fy.h), sz = Math.max(0.9, 0.7 * k), nc = Fy.cols.length, c = Fy.cols.indexOf(col);
          for (let i = c * 2, j = c; i < P.length; i += nc * 2, j += nc) if (fairyOn(j, Fy.pat, Fy.ph)) { ctx.rect(SX(P[i], k) - sz / 2, SY(P[i + 1], k) - sz / 2, sz, sz); any = true; }
        }
        if (any) ctx.fill();
      }
      let g = 0;
      for (const d of VIS.houses) {
        if (g++ > 10) break;
        const Fy = d.fairy; if (!Fy) continue;
        const P = Fy.pts, nc = Fy.cols.length;
        for (let i = 0, j = 0; i < P.length; i += 10, j += 5) if (fairyOn(j, Fy.pat, Fy.ph)) glowAt(P[i], P[i + 1], Fy.h, Fy.cols[j % nc], 2.6, 0.45 * NIGHT);
      }
    }
    // a heart over a comforted dog
    for (const a of HEARTS) {
      const k = kk(6 + (2.2 - a.dwHeartT) * 1.2), X = SX(a.x, k), Y = SY(a.y, k), r = 1.1 * k;
      ctx.globalAlpha = Math.min(1, a.dwHeartT); ctx.fillStyle = '#ff6a9a';
      ctx.beginPath(); ctx.arc(X - r * 0.5, Y, r * 0.55, 0, TAU); ctx.arc(X + r * 0.5, Y, r * 0.55, 0, TAU); ctx.moveTo(X - r, Y + r * 0.15); ctx.lineTo(X, Y + r * 1.2); ctx.lineTo(X + r, Y + r * 0.15); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // the stalls' bulbs
    if (lit && stallsOpen()) for (const st of VIS.stalls) { const q = [st.x + st.fx * 0.5 * SS, st.y + st.fy * 0.5 * SS]; dot(q[0], q[1], 7.6, 1.3, '#fff6d0'); glowAt(q[0], q[1], 7.6, '#ffd890', 13, 0.9 * NIGHT); glowAt(st.x + st.fx * 3 * SS, st.y + st.fy * 3 * SS, 3.5, '#ffb050', 9, 0.5 * NIGHT); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
    STATS._d2 += now() - t0; PROF.l += now() - t0;
  }
  // the smoke haze over the city at night, and the city lit by the big bursts
  function drawFx2D() {
    R = N.render; ctx = R.ctx;
    const hz = haze(), night = R.night || 0;
    if (hz > 0.01) { ctx.globalAlpha = Math.min(0.32, hz * (0.12 + 0.16 * night)); ctx.fillStyle = '#8a7a74'; ctx.fillRect(0, 0, R.W, R.H); ctx.globalAlpha = 1; }
    let fr = 0, fg = 0, fb = 0;
    let ba = 0, bf = null;
    for (const f of FLASH) { if (f.h < 20 || f.life > 1) continue; const a = flashK(f); if (a > ba) { ba = a; bf = f; } }
    if (bf) { const c = hexRGB(bf.col), a = ba * 0.035 * night; fr = c[0] * a; fg = c[1] * a; fb = c[2] * a; }
    if (fr + fg + fb > 0.004) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgb(' + Math.min(255, fr * 255 | 0) + ',' + Math.min(255, fg * 255 | 0) + ',' + Math.min(255, fb * 255 | 0) + ')'; ctx.fillRect(0, 0, R.W, R.H); ctx.globalCompositeOperation = 'source-over'; }
  }
  const _vh = [];
  const VQ = { x: 1e9, y: 1e9, r: 0, t: -1, day: -1 };
  /** the system's draw(): what is in view this frame, the light pools, and the queue items */
  const GROUND_FN = () => { try { drawGround2D(); } catch (e) { N.err('diwali.draw.ground', e); } };
  const SKY_FN = () => { try { drawSky2D(); } catch (e) { N.err('diwali.draw.sky', e); } };
  const LIGHT_FN = () => { try { drawLight2D(); } catch (e) { N.err('diwali.draw.light', e); } };
  const FX_FN = () => { try { drawFx2D(); } catch (e) { N.err('diwali.draw.fx', e); } };
  function draw2D() {
    R = N.render;
    TT = (N.time && (N.time.real || N.time.now)) || 0;
    NIGHT = R.night || 0;
    const v = R.view, p = N.player;
    STATS._d2 = 0; PROF.n++;
    const t0 = now();
    // houses in view (nearest the camera first, capped)
    VIS.houses.length = 0;
    if (decorDay() > 0) {
      const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2, r = Math.hypot(v.x1 - v.x0, v.y1 - v.y0) / 2 + 20;
      if (Math.abs(cx - VQ.x) > 10 || Math.abs(cy - VQ.y) > 10 || Math.abs(r - VQ.r) > 8 || TT - VQ.t > 0.3 || TT < VQ.t || VQ.day !== decorDay()) { housesNear(cx, cy, r, BUD().houses, _vh); VQ.x = cx; VQ.y = cy; VQ.r = r; VQ.t = TT; VQ.day = decorDay(); }
      for (const d of _vh) {
        if (d.cx < v.x0 - 40 || d.cx > v.x1 + 40 || d.cy < v.y0 - 40 || d.cy > v.y1 + 40) continue;
        d._fv = frontVisible(d);
        VIS.houses.push(d);
        const dd = d;
        if (!dd._fn) dd._fn = () => { try { drawHouse2D(dd); } catch (e) { N.err('diwali.draw.house', e); } };
        R.queue('structures', R.distKey(d.s ? d.s.cx : d.lm.x, d.s ? d.s.cy : d.lm.y) + 0.01, dd._fn);
      }
    }
    VIS.stalls.length = 0;
    if (stallsOpen() || (stallsOn() && mins() >= 7 * 60)) for (const st of stallList()) {
      if (st.x < v.x0 - 20 || st.x > v.x1 + 20 || st.y < v.y0 - 20 || st.y > v.y1 + 20) continue;
      VIS.stalls.push(st);
      if (!st._fn) { const s0 = st; st._fn = () => { try { drawStall2D(s0); } catch (e) { N.err('diwali.draw.stall', e); } }; }
      R.queue('structures', R.distKey(st.x, st.y), st._fn);
    }
    R.queue('ground', 2, GROUND_FN);
    R.queue('sky', 4, SKY_FN);
    R.queue('light', 8, LIGHT_FN);
    R.queue('fx', 3, FX_FN);
    pushLights(p);
    STATS._d2 += now() - t0; PROF.e += now() - t0;
  }
  // light pools in the night wash (the 3D view turns the same list into point-light candidates)
  const LP = [];
  function lp(x, y, r, col, inten, h) { let o = LP[LPn]; if (!o) o = LP[LPn] = { x: 0, y: 0, r: 0, color: '', intensity: 0, h: 0, glow: false }; o.x = x; o.y = y; o.r = r; o.color = col; o.intensity = inten; o.h = h || 0; o.glow = false; LPn++; N.render.lights.push(o); }
  let LPn = 0;
  function pushLights(p) {
    LPn = 0;
    const night = N.render.night || 0;
    if (night < 0.05 || !p) return;
    let n = 0; const cap = BUD().lights;
    let hi = 0;
    for (let i = FLASH.length - 1; i >= 0; i--) { const f = FLASH[i]; if (n >= cap) break; if (f.life > 1) continue; const a = flashK(f); if (a < 0.08) continue; if (Math.abs(f.x - p.x) > 600 || Math.abs(f.y - p.y) > 600) continue; if (f.h > 20) { if (hi >= 3) continue; hi++; lp(f.x, f.y, 110, f.col, Math.min(1, a) * 0.3, 0); } else lp(f.x, f.y, Math.min(90, f.r * 0.6), f.col, Math.min(1, a) * 0.85, 0); n++; }
    for (const e of EMIT) { if (n >= cap + 4) break; if (Math.abs(e.x - p.x) > 400 || Math.abs(e.y - p.y) > 400) continue; if (e.kind === 'anaar' && e.t > 0.3) { lp(e.x, e.y, 46, '#ffc070', 0.95, 3); n++; } else if (e.kind === 'sparkler') { lp(e.x, e.y, 20, '#ffe8b0', 0.8, e.h); n++; } else if (e.kind === 'chakri') { lp(e.x, e.y, 24, '#ffe070', 0.85, 0.5); n++; } }
    if (lampTime()) { let m = 0; for (const d of VIS.houses) { if (m >= Math.max(3, cap >> 1)) break; if (!d._fv && !is3D()) continue; lp(d.door.x + d.nx * 2, d.door.y + d.ny * 2, 22, '#ffb050', 0.6, 0.5); m++; } }
    for (const st of VIS.stalls) { if (n >= cap + 8) break; if (!stallsOpen()) break; lp(st.x + st.fx * 2, st.y + st.fy * 2, 38, '#ffe0a0', 0.85, 7); n++; }
  }

  /* ================================================================ 3D (N.view3d.registerLayer('diwali3d')) */
  const G3 = { ready: false, THREE: null, H: null, grp: null, spk: null, smk: null, glo: null, lit: null, dec: null, heap: null, mound: null, cone: null, cyl: null, decor: null, stalls: null, decGen: -1, lamp: null, uni: null, M: {}, ms: 0, allDirty: true };
  const VS3 = () => (N.view3d && N.view3d.VS) || 1.5;
  // ---- a merged-geometry builder: flat normals, linear vertex colours, glow (night emission), sway (lanterns)
  class GB3 {
    constructor() { this.p = []; this.n = []; this.c = []; this.g = []; this.s = []; this.cr = 1; this.cg = 1; this.cb = 1; this.gl = 0; this.sa = 0; this.sp = 0; this.pivot = 0; }
    col(hex, glow) { const c = G3.H.color(hex); this.cr = c.r; this.cg = c.g; this.cb = c.b; this.gl = glow || 0; return this; }
    sway(a, ph, pivotY) { this.sa = a; this.sp = ph; this.pivot = pivotY; return this; }
    tri(a, b, c) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      this.c.push(this.cr, this.cg, this.cb, this.cr, this.cg, this.cb, this.cr, this.cg, this.cb);
      this.g.push(this.gl, this.gl, this.gl);
      const sw = (q) => (this.sa ? Math.max(0, this.pivot - q[1]) * this.sa : 0);
      this.s.push(sw(a), this.sp, sw(b), this.sp, sw(c), this.sp);
      return this;
    }
    quad(a, b, c, d) { this.tri(a, b, c); return this.tri(a, c, d); }
    box(x0, y0, z0, x1, y1, z1) {
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
      return this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    }
    obox(cx, cz, ux, uz, hu, hv, y0, y1) { // an oriented box: half length hu along (ux, uz), half width hv across
      const vx = -uz, vz = ux, P = (a, b, y) => [cx + ux * a + vx * b, y, cz + uz * a + vz * b];
      const A = P(-hu, -hv, 0), B = P(hu, -hv, 0), C = P(hu, hv, 0), D = P(-hu, hv, 0);
      const s = (q, y) => [q[0], y, q[2]];
      this.quad(s(A, y0), s(B, y0), s(B, y1), s(A, y1)); this.quad(s(B, y0), s(C, y0), s(C, y1), s(B, y1)); this.quad(s(C, y0), s(D, y0), s(D, y1), s(C, y1)); this.quad(s(D, y0), s(A, y0), s(A, y1), s(D, y1));
      return this.quad(s(A, y1), s(B, y1), s(C, y1), s(D, y1));
    }
    cyl(cx, y0, cz, r0, r1, h, seg, top) {
      seg = seg || 6;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        this.quad([cx + c0 * r0, y0, cz + s0 * r0], [cx + c1 * r0, y0, cz + s1 * r0], [cx + c1 * r1, y0 + h, cz + s1 * r1], [cx + c0 * r1, y0 + h, cz + s0 * r1]);
        if (top && r1 > 0.01) this.tri([cx, y0 + h, cz], [cx + c0 * r1, y0 + h, cz + s0 * r1], [cx + c1 * r1, y0 + h, cz + s1 * r1]);
      }
      return this;
    }
    bead(cx, cy, cz, r) {
      const P = [[cx + r, cy, cz], [cx, cy, cz + r], [cx - r, cy, cz], [cx, cy, cz - r]], T = [cx, cy + r, cz], B = [cx, cy - r, cz];
      for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4]; this.tri(T, b, a); this.tri(B, a, b); }
      return this;
    }
    mesh(mat) {
      if (!this.p.length) return null;
      const T = G3.THREE, g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
      g.setAttribute('aGlow', new T.Float32BufferAttribute(this.g, 1));
      g.setAttribute('aSway', new T.Float32BufferAttribute(this.s, 2));
      g.computeBoundingSphere();
      const m = new T.Mesh(g, mat || G3.M.solid); m.matrixAutoUpdate = false; m.updateMatrix(); m.userData.noShadow = true; m.castShadow = false;
      return m;
    }
  }
  // ---- points: dynamic (sparks, glows, smoke) + static per site (flames, bulbs: animated in the shader)
  const PT_VS = [
    'attribute vec2 aSA; attribute vec3 aCol; varying vec4 vCol; uniform float uScale; uniform float uFogK; uniform float uMin;',
    'void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = max(1.0, -mv.z);',
    '  vCol = vec4(aCol, aSA.y * exp(-d * uFogK));',
    '  float ps = aSA.x * uScale / d; if (ps < uMin) { vCol.a *= max(0.35, ps / uMin); ps = uMin; }',
    '  gl_PointSize = clamp(ps, 1.0, 256.0); gl_Position = projectionMatrix * mv; }',
  ].join('\n');
  const PT_FS = [
    'varying vec4 vCol; uniform float uHard; uniform float uAdd;',
    'void main() { vec2 d = gl_PointCoord - vec2(0.5); float r = length(d) * 2.0;',
    '  float a = mix(1.0 - smoothstep(0.0, 1.0, r), 1.0 - step(0.85, r), uHard); a = pow(max(a, 0.0), 1.3);',
    '  a += uAdd * (1.0 - smoothstep(0.0, 0.32, r));',
    '  if (vCol.a * a < 0.004) discard; gl_FragColor = vec4(vCol.rgb, min(1.0, vCol.a * a)); }',
  ].join('\n');
  function makePoints(n, additive, hard, core, minPx) {
    const T = G3.THREE, geo = new T.BufferGeometry();
    const pos = new T.BufferAttribute(new Float32Array(n * 3), 3), col = new T.BufferAttribute(new Float32Array(n * 3), 3), siz = new T.BufferAttribute(new Float32Array(n * 2), 2);
    for (const a of [pos, col, siz]) a.setUsage(T.DynamicDrawUsage);
    geo.setAttribute('position', pos); geo.setAttribute('aCol', col); geo.setAttribute('aSA', siz);
    geo.setDrawRange(0, 0); geo.boundingSphere = new T.Sphere(new T.Vector3(), 1e7);
    const mat = new T.ShaderMaterial({ vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending, uniforms: { uScale: G3.uni.uScale, uFogK: additive ? G3.uni.uFogK : G3.uni.uFogK2, uHard: { value: hard || 0 }, uAdd: { value: core || 0 }, uMin: { value: minPx || 0 } } });
    const p = new T.Points(geo, mat);
    p.frustumCulled = false; p.renderOrder = additive ? 8 : 7; p.userData.noShadow = true;
    return { p, n: 0, max: n, pa: pos.array, ca: col.array, sa: siz.array };
  }
  function ptAdd(B, x, h, y, size, a, rgb) {
    if (B.n >= B.max) return;
    const i = B.n++, o = i * 3;
    B.pa[o] = x; B.pa[o + 1] = h; B.pa[o + 2] = y;
    B.ca[o] = rgb[0]; B.ca[o + 1] = rgb[1]; B.ca[o + 2] = rgb[2];
    B.sa[i * 2] = size; B.sa[i * 2 + 1] = a;
  }
  function ptCommit(B) { const g = B.p.geometry, a = g.attributes; g.setDrawRange(0, B.n); a.position.needsUpdate = true; a.aCol.needsUpdate = true; a.aSA.needsUpdate = true; }
  const GLOW_VS = [
    'attribute vec3 aCol; attribute vec3 aGP; uniform float uT; uniform float uScale; uniform float uI; uniform float uLamp; uniform float uFogK; varying vec3 vC;',
    'float hh(float a, float b) { return fract(sin(a * 12.9898 + b * 78.233) * 43758.5453); }',
    'void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = max(1.0, -mv.z);',
    '  float pat = aGP.y, idx = aGP.z, on = 1.0;',
    '  if (pat < 0.5) on = uLamp * (0.78 + 0.22 * sin(uT * 17.0 + idx * 13.1));',
    '  else if (pat > 5.5) on = uI;',
    '  else { on = uI; float ph = fract(idx * 0.0137) * 10.0;',
    '    if (pat < 1.5) on *= step(0.5, mod(idx + floor(uT * 6.0 + ph), 3.0));',
    '    else if (pat < 2.5) on *= mod(floor(uT * 1.5 + ph), 2.0) < 0.5 ? 1.0 : (mod(idx, 4.0) < 0.5 ? 1.0 : 0.12);',
    '    else if (pat < 3.5) on *= step(0.35, hh(idx, floor(uT * 3.0 + ph)));',
    '    else if (pat < 4.5) on *= mod(idx + floor(uT * 1.4 + ph), 2.0) < 0.5 ? 1.0 : 0.1; }',
    '  vC = aCol * on * exp(-d * uFogK) * smoothstep(2.0, 8.0, d);',
    '  gl_PointSize = clamp(aGP.x * uScale / d, 0.0, 48.0); gl_Position = projectionMatrix * mv; }',
  ].join('\n');
  const GLOW_FS = 'varying vec3 vC; void main() { vec2 d = gl_PointCoord - vec2(0.5); float r = length(d) * 2.0; float a = (1.0 - smoothstep(0.0, 1.0, r)); a = a * a * 0.8 + (1.0 - smoothstep(0.0, 0.3, r)) * 0.9; if (a < 0.01) discard; gl_FragColor = vec4(vC * a, 1.0); }';
  class GP3 { // static glow points collected while building a site
    constructor() { this.p = []; this.c = []; this.g = []; }
    add(x, h, z, hex, size, pat, idx) { const c = hexRGB(hex); this.p.push(x, h, z); this.c.push(c[0], c[1], c[2]); this.g.push(size, pat, idx); }
    points() {
      if (!this.p.length) return null;
      const T = G3.THREE, g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3)); g.setAttribute('aCol', new T.Float32BufferAttribute(this.c, 3)); g.setAttribute('aGP', new T.Float32BufferAttribute(this.g, 3));
      g.computeBoundingSphere();
      const pts = new T.Points(g, G3.M.glow); pts.renderOrder = 9; pts.userData.noShadow = true;
      return pts;
    }
  }
  function initMaterials3D() {
    const T = G3.THREE, H = G3.H, M = G3.M;
    G3.uni = { uScale: { value: 600 }, uFogK: { value: 0 }, uFogK2: { value: 0 }, uT: { value: 0 }, uI: { value: 0 }, uLamp: { value: 0 }, uDwN: { value: 0 }, uDwCam: { value: new T.Vector3() }, uDwFade: { value: 10 } };
    // stalls / lanterns right in front of the camera dither out (they are not in the camera's collision grid);
    // Lambert gets no cameraPosition in r149, so the eye comes in our own uniform
    const FADE_V = ['#include <common>', 'varying vec3 vDwW;'], FADE_F = 'uniform vec3 uDwCam; uniform float uDwFade; varying vec3 vDwW;';
    const FADE_DISCARD = '\tif (uDwFade > 0.0) { float dwd = distance(vDwW, uDwCam); vec2 dwq = floor(mod(gl_FragCoord.xy, 4.0)); float dwb = (dwq.x * 4.0 + dwq.y) / 16.0; if (dwd < uDwFade * (0.55 + 0.45 * dwb)) discard; }';
    const fadeVS = (vs) => vs.replace(FADE_V[0], FADE_V[0] + '\n' + FADE_V[1]).replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvDwW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    G3.fade = (sh) => { sh.uniforms.uDwCam = G3.uni.uDwCam; sh.uniforms.uDwFade = G3.uni.uDwFade; sh.vertexShader = fadeVS(sh.vertexShader); sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FADE_F).replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FADE_DISCARD); };
    const solid = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
    solid.onBeforeCompile = (sh) => {
      G3.fade(sh);
      sh.uniforms.uDwN = G3.uni.uDwN; sh.uniforms.uDwT = G3.uni.uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow;\nattribute vec2 aSway;\nuniform float uDwT;\nvarying float vDwG;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvDwG = aGlow;\n\ttransformed.x += aSway.x * sin(uDwT * 1.6 + aSway.y);\n\ttransformed.z += aSway.x * 0.7 * cos(uDwT * 1.3 + aSway.y * 1.7);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDwN;\nvarying float vDwG;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * vDwG * uDwN;');
    };
    solid.customProgramCacheKey = () => 'diwali3d-solid';
    M.solid = solid;
    M.glow = new T.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uT: G3.uni.uT, uScale: G3.uni.uScale, uI: G3.uni.uI, uLamp: G3.uni.uLamp, uFogK: G3.uni.uFogK2 } });
    // the paper: front side its colour, the inside paler / browner
    const paper = new T.MeshLambertMaterial({ side: T.DoubleSide });
    paper.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tif (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.72, 0.56), 0.45);'); };
    paper.customProgramCacheKey = () => 'diwali3d-paper';
    M.paper = paper;
    const atlas = H.tex('dw:litter', 1024, 512, (g) => { for (let v = 0; v < 5; v++) paintLitter(g, (v % 4) * 256, Math.floor(v / 4) * 256, 256, v, v * 7 + 1); });
    const dec = new T.MeshLambertMaterial({ map: atlas, transparent: true, alphaTest: 0.06, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
    dec.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aUvOff;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\n\tvUv = vUv * vec2(0.25, 0.5) + aUvOff;\n#endif'); };
    dec.customProgramCacheKey = () => 'diwali3d-decal';
    M.dec = dec;
    const rang = H.tex('dw:rangoli', 1024, 512, (g) => { for (let v = 0; v < 8; v++) paintRangoli(g, (v % 4) * 256 + 128, Math.floor(v / 4) * 256 + 128, 122, v); });
    M.rangoli = new T.MeshLambertMaterial({ map: rang, emissiveMap: rang, emissive: new T.Color(0, 0, 0), transparent: true, alphaTest: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
    const labels = H.tex('dw:labels', 1024, 1024, (g) => {
      const rows = STALL_LABELS.concat(['BIJLI  ROCKET  ANAAR', 'CHAKRI  PHULJHADI']);
      rows.forEach((t, i) => {
        const x = (i % 2) * 512, y = Math.floor(i / 2) * 128, pack = i >= STALL_LABELS.length;
        g.fillStyle = pack ? '#2a2a3a' : '#f4ecd8'; g.fillRect(x, y, 512, 128);
        g.strokeStyle = pack ? '#f2c230' : '#b0201a'; g.lineWidth = 8; g.strokeRect(x + 8, y + 8, 496, 112);
        g.fillStyle = pack ? '#ffe070' : '#b0201a'; g.textAlign = 'center'; g.textBaseline = 'middle';
        let fs = 64; g.font = 'bold ' + fs + 'px "Trebuchet MS", Arial, sans-serif';
        while (g.measureText(t).width > 460 && fs > 20) { fs -= 2; g.font = 'bold ' + fs + 'px "Trebuchet MS", Arial, sans-serif'; }
        g.fillText(t, x + 256, y + 68);
      });
    }, { linear: true });
    M.labels = new T.MeshLambertMaterial({ map: labels, side: T.DoubleSide, emissive: new T.Color(0, 0, 0), emissiveMap: labels });
    M.labels.onBeforeCompile = (sh) => G3.fade(sh); M.labels.customProgramCacheKey = () => 'diwali3d-labels';
  }
  function labelUV(i) { const u0 = (i % 2) * 0.5, u1 = u0 + 0.5, v1 = 1 - Math.floor(i / 2) / 8, v0 = v1 - 1 / 8; return [u0, v0, u1, v1]; }
  function imesh(geo, mat, n, color) {
    const T = G3.THREE, m = new T.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    if (color) { const c = new T.Color(1, 1, 1); for (let i = 0; i < n; i++) m.setColorAt(i, c); m.instanceColor.setUsage(T.DynamicDrawUsage); }
    m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.userData.noShadow = true;
    return m;
  }
  function initLayer3D(THREE, H) {
    G3.THREE = THREE; G3.H = H;
    initMaterials3D();
    const T = THREE;
    G3.grp = new T.Group(); G3.grp.name = 'diwali3d';
    G3.spk = makePoints(TUNE.budget.desk.sparks * 3 + 200, true, 0, 0.6, 2.6);
    G3.glo = makePoints(220, true, 0, 0.35);
    G3.smk = makePoints(TUNE.budget.desk.smoke + 40, false, 0, 0);
    const pg = new T.PlaneGeometry(1, 1); pg.rotateX(-PI / 2);
    G3.lit = imesh(pg, G3.M.paper, LB.cap, true);
    const dg = new T.PlaneGeometry(1, 1); dg.rotateX(-PI / 2);
    const ig = new T.InstancedBufferGeometry(); ig.index = dg.index; for (const k in dg.attributes) ig.setAttribute(k, dg.attributes[k]);
    G3.decUv = new T.InstancedBufferAttribute(new Float32Array(400 * 2), 2); G3.decUv.setUsage(T.DynamicDrawUsage); ig.setAttribute('aUvOff', G3.decUv);
    G3.dec = imesh(ig, G3.M.dec, 400, false); G3.dec.renderOrder = 2;
    const mg = new T.SphereGeometry(1, 9, 4, 0, TAU, 0, PI / 2);
    G3.mound = imesh(mg, new T.MeshLambertMaterial({ color: 0xffffff }), 80, true);
    G3.cone = imesh(new T.CylinderGeometry(0.18, 1, 1, 8), new T.MeshLambertMaterial({ color: 0xffffff }), 60, true);
    G3.cyl = imesh(new T.CylinderGeometry(1, 1, 1, 10), new T.MeshLambertMaterial({ color: 0xffffff }), 80, true);
    for (const o of [G3.lit, G3.dec, G3.mound, G3.cone, G3.cyl, G3.spk.p, G3.glo.p, G3.smk.p]) G3.grp.add(o);
    H.layer.add(G3.grp);
    G3.ready = true; G3.allDirty = true; G3.decGen = -1;
  }
  function disposeSite3D(site) { if (!site) return; if (site.grp && site.grp.parent) site.grp.parent.remove(site.grp); if (site.grp) site.grp.traverse((o) => { if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose(); }); site.grp = null; }
  function disposeLayer3D(H) {
    disposeSite3D(G3.decor); disposeSite3D(G3.stalls); disposeSite3D(G3.decorNext); disposeSite3D(G3.stallsNext);
    G3.decor = G3.stalls = G3.decorNext = G3.stallsNext = null;
    if (G3.grp) { G3.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); if (G3.grp.parent) G3.grp.parent.remove(G3.grp); }
    for (const k in G3.M) { const m = G3.M[k]; if (m && m.dispose) m.dispose(); }
    G3.M = {}; G3.grp = null; G3.ready = false; void H;
  }
  // ---- decorated houses round the player: one site (merged decor + rangoli quads + glow points), rebuilt as he moves
  function decorKey() { return (decorDay() * 10 | 0) + ':' + (lampTime() ? 1 : 0) + ':' + (homeParapetLit() ? 1 : 0) + ':' + dayNo(); }
  function* buildDecor3D(site) {
    const VS = VS3(), H = G3.H, T = G3.THREE;
    const gh = (x, y) => { try { return N.view3d.groundHeightAt ? N.view3d.groundHeightAt(x, y) || 0 : 0; } catch (e) { return 0; } };
    const b = new GB3(), gp = new GP3(), rq = { p: [], uv: [] };
    const lamps = lampTime();
    const list = housesNear(site.x, site.y, site.r, BUD().houses, []);
    let n = 0, bulbIdx = 0;
    for (const d of list) {
      const P = d.P, ux = d.ux, uy = d.uy, nx = d.nx, ny = d.ny;
      if (d.rangoli) { // a textured quad on the ground
        const r = d.rangoli, h0 = gh(r.x, r.y) + 0.06, s = r.r * 1.05, ca = Math.cos(r.a) * s, sa = Math.sin(r.a) * s, u0 = (r.v % 4) * 0.25, v1 = 1 - Math.floor(r.v / 4) * 0.5, v0 = v1 - 0.5;
        const c = [[-ca + sa, -sa - ca], [ca + sa, sa - ca], [ca - sa, sa + ca], [-ca - sa, -sa + ca]];
        const uv = [[u0, v0], [u0 + 0.25, v0], [u0 + 0.25, v1], [u0, v1]];
        for (const k of [0, 2, 1, 0, 3, 2]) { rq.p.push(r.x + c[k][0], h0, r.y + c[k][1]); rq.uv.push(uv[k][0], uv[k][1]); }
      }
      const cup = (x, z, y, lit) => { b.col('#9a4a24', 0.05).cyl(x, y, z, 0.42, 0.62, 0.32, 6, true); b.col('#e8b060', 0.1).cyl(x, y + 0.32, z, 0.5, 0.5, 0.05, 6, true); if (lit) gp.add(x, y + 0.75, z, '#ffb040', 1.5, 0, bulbIdx++); };
      for (const q of d.diyas) cup(q[0], q[1], gh(q[0], q[1]), lamps);
      for (const q of d.gateDiyas) cup(q[0], q[1], d.gateH3, lamps);
      if (d.toran) { // marigold scallops + mango leaves over the door
        const T0 = d.toran, y0 = T0.h * VS, nn = 16;
        for (let i = 0; i <= nn; i++) {
          const t = i / nn, x = T0.a[0] + (T0.b[0] - T0.a[0]) * t + nx * 0.25, z = T0.a[1] + (T0.b[1] - T0.a[1]) * t + ny * 0.25, y = y0 - Math.abs(Math.sin(t * PI * 3)) * 1.1;
          b.col(i % 2 ? '#ffb020' : '#ff7a10', 0.25).bead(x, y, z, 0.42);
          if (i % 2 === 0) b.col('#2f8a2a', 0.05).quad([x - ux * 0.35, y - 0.2, z - uy * 0.35], [x + ux * 0.35, y - 0.2, z + uy * 0.35], [x + nx * 0.15, y - 2.0, z + ny * 0.15], [x + nx * 0.15, y - 2.0, z + ny * 0.15]);
        }
      }
      if (d.kandil) { // a paper sky lantern: hexagonal bicone, coloured bands, paper tails; lit from inside at night
        const K = d.kandil, cy = K.h * VS, top = K.hTop * VS, x = K.x, z = K.y, piv = top, sw = 0.035;
        b.sway(sw, K.ph, piv);
        b.col('#3a3030', 0).quad([x - 0.05, top, z], [x + 0.05, top, z], [x + 0.05, cy + 2.2, z], [x - 0.05, cy + 2.2, z]);
        if (K.style === 'star') {
          b.col(K.col[0], 1.4);
          const r0 = 2.0, r1 = 0.85, dz = 0.9;
          const rim = []; for (let k = 0; k < 10; k++) { const a = PI / 2 + (k / 10) * TAU, rr2 = k % 2 ? r1 : r0; rim.push([x + ux * Math.cos(a) * rr2, cy + Math.sin(a) * rr2, z + uy * Math.cos(a) * rr2]); }
          const Fp = [x + nx * dz, cy, z + ny * dz], Bp = [x - nx * dz, cy, z - ny * dz];
          for (let k = 0; k < 10; k++) { const a = rim[k], c = rim[(k + 1) % 10]; b.tri(Fp, a, c); b.tri(Bp, c, a); }
        } else {
          b.col(K.col[0], 1.4).cyl(x, cy - 1.2, z, 1.25, 1.25, 2.4, 6, false);
          b.col(K.col[1], 1.1).cyl(x, cy + 1.2, z, 1.25, 0.2, 1.1, 6, true).cyl(x, cy - 2.3, z, 0.2, 1.25, 1.1, 6, false);
          b.col(K.col[1], 1.2).cyl(x, cy - 0.25, z, 1.3, 1.3, 0.5, 6, false);
        }
        b.col(K.col[1], 0.6);
        for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, tx = x + Math.cos(a) * 0.9, tz = z + Math.sin(a) * 0.9; b.quad([tx - 0.12, cy - 2.2, tz], [tx + 0.12, cy - 2.2, tz], [tx + 0.1, cy - 5.6, tz], [tx - 0.1, cy - 5.6, tz]); }
        b.sway(0, 0, 0);
        gp.add(x, cy, z, K.col[0], 6.5, 6, bulbIdx++);
      }
      if (d.fairy) { // bulbs along the parapet edge: beads by day, chasing / blinking glows at night
        const Fy = d.fairy, Pp = Fy.pts, nc = Fy.cols.length, top = d.home ? (d.h * VS + 3.2) : (d.s ? d.s.h * VS + (d.s.parapet === 2 ? 4.2 : d.s.parapet ? 3 : 0) + 0.25 : d.h * VS + 3);
        const pat = { chase: 1, blink: 2, twinkle: 3, alt: 4, steady: 5 }[Fy.pat] || 5;
        for (let i = 0, j = 0; i < Pp.length; i += 2, j++) {
          const col = Fy.cols[j % nc], y = top - 0.35 - 0.25 * Math.abs(Math.sin(j * 1.3));
          b.col(col, 0.4).bead(Pp[i], y, Pp[i + 1], 0.22);
          gp.add(Pp[i], y, Pp[i + 1], col, 1.25, pat, j + (Fy.ph * 37 | 0));
        }
      }
      if (d.parapet && (!d.home || homeParapetLit()) && lamps) {
        const Pp = d.parapet.pts, top = d.home ? (d.h * VS + 3.2) : (d.s ? d.s.h * VS + (d.s.parapet === 2 ? 4.2 : d.s.parapet ? 3 : 0) : d.h * VS);
        for (let i = 0; i < Pp.length; i += 2) cup(Pp[i] - nx * 0.05, Pp[i + 1] - ny * 0.05, top, true);
      }
      void T;
      if (++n % 8 === 0) yield;
    }
    const grp = new T.Group(); grp.name = 'diwali3d:decor';
    const m = b.mesh(G3.M.solid); if (m) grp.add(m);
    if (rq.p.length) {
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(rq.p, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(rq.uv, 2));
      const nrm = new Float32Array(rq.p.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1; g.setAttribute('normal', new T.BufferAttribute(nrm, 3)); g.computeBoundingSphere();
      const rm = new T.Mesh(g, G3.M.rangoli); rm.renderOrder = 1; rm.userData.noShadow = true; rm.receiveShadow = true; grp.add(rm);
    }
    const pts = gp.points(); if (pts) grp.add(pts);
    site.grp = grp; site.n = list.length;
    void H;
  }
  // ---- pataakha stalls round the player
  function* buildStalls3D(site) {
    const VS = VS3(), T = G3.THREE;
    const b = new GB3(), gp = new GP3(), lq = { p: [], uv: [] };
    let n = 0;
    for (const st of stallList()) {
      if (Math.hypot(st.x - site.x, st.y - site.y) > site.r) continue;
      const ca = Math.cos(st.a), sa = Math.sin(st.a), fx = st.fx, fy = st.fy;
      const P = (u, w, y) => [st.x + (ca * u + fx * w) * SS, y, st.y + (sa * u + fy * w) * SS];
      const box = (u0, w0, u1, w1, y0, y1) => { const A = P(u0, w0, 0), B = P(u1, w0, 0), C = P(u1, w1, 0), D = P(u0, w1, 0), s = (q, y) => [q[0], y, q[2]]; b.quad(s(A, y0), s(B, y0), s(B, y1), s(A, y1)); b.quad(s(B, y0), s(C, y0), s(C, y1), s(B, y1)); b.quad(s(C, y0), s(D, y0), s(D, y1), s(C, y1)); b.quad(s(D, y0), s(A, y0), s(A, y1), s(D, y1)); b.quad(s(A, y1), s(B, y1), s(C, y1), s(D, y1)); };
      const th = 3.2 * VS;
      b.col('#7a5232', 0); box(-6.2, -0.8, 6.2, 3.2, th - 0.4, th);                          // the table top
      b.col('#c8302a', 0.05); box(-6.2, 3.1, 6.2, 3.25, 0.4, th - 0.4);                       // a red cloth skirt in front
      b.col('#5a3a22', 0); for (const [u, w] of [[-5.9, -0.5], [5.9, -0.5], [-5.9, 2.9], [5.9, 2.9]]) box(u - 0.2, w - 0.2, u + 0.2, w + 0.2, 0, th - 0.4);
      const rng = U.rng('stall' + st.seed);
      for (let r0 = 0; r0 < 2; r0++) for (let c = 0; c < 6; c++) {
        const col = pick2(rng, ['#e8302a', '#f2c230', '#2a8a3a', '#2a5cd8', '#f06aa0', '#ff8a1a', '#7a3ab8']), u0 = -5.6 + c * 1.9, w0 = -0.3 + r0 * 1.7, hh = (0.5 + (c % 3) * 0.35) * VS;
        b.col(col, 0.1); box(u0, w0, u0 + 1.6, w0 + 1.4, th, th + hh);
        b.col('#f8f0d8', 0.1); box(u0 + 0.25, w0 + 1.38, u0 + 1.35, w0 + 1.42, th + hh * 0.3, th + hh * 0.7);
      }
      for (let i = 0; i < 4; i++) { b.col(['#7a8aa8', '#c8302a', '#3a6a9a', '#d8a020'][i], 0); box(-5.8 + i * 3, -3.4, -3.6 + i * 3, -1.6, 0, (4.4 - (i % 2)) * VS); }
      b.col('#9a7a4a', 0); for (const [u, w, hp] of [[-6.4, -3.8, 9.4], [6.4, -3.8, 9.4], [-6.4, 1.4, 8.2], [6.4, 1.4, 8.2]]) box(u - 0.18, w - 0.18, u + 0.18, w + 0.18, 0, hp * VS);
      const ns = 8;
      for (let i = 0; i < ns; i++) { const u0 = -6.8 + (13.6 * i) / ns, u1 = u0 + 13.6 / ns; b.col(st.stripes[i % 2], 0.08).quad(P(u0, -4.2, 9.4 * VS), P(u1, -4.2, 9.4 * VS), P(u1, 1.4, 8.2 * VS), P(u0, 1.4, 8.2 * VS)); }
      b.col('#3a3a30', 0); box(-6.6, -4.4, 6.6, -4.2, 9.4 * VS, 12.8 * VS);
      // ladis (cracker garlands) and rocket bundles hanging from the awning's front edge
      for (let i = 0; i < 7; i++) {
        const u = -5.6 + i * 1.85, hang = i % 3 === 1, top = 8.15 * VS, bot = (hang ? 6.4 : 5.4) * VS;
        if (hang) { b.col('#2a5cd8', 0.15); box(u - 0.35, 1.25, u + 0.35, 1.6, bot, bot + 1.8); b.col('#e8c060', 0.1); box(u - 0.06, 1.38, u + 0.06, 1.48, bot + 1.8, top); }
        else { b.col('#c8141e', 0.25); for (let y = bot; y < top; y += 0.55) box(u - 0.22, 1.3, u + 0.22, 1.55, y, y + 0.4); b.col('#ffd040', 0.3); box(u - 0.1, 1.36, u + 0.1, 1.5, bot - 0.5, bot); }
      }
      // the boards: the stall's name on the back, the products on a strip under the awning's front edge
      const li = STALL_LABELS.indexOf(st.label), uvA = labelUV(li < 0 ? 0 : li), uvB = labelUV(STALL_LABELS.length + (st.seed & 1));
      const quadL = (a, bq, c, d, uv) => { const U2 = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]], Q = [a, bq, c, d]; for (const k of [0, 1, 2, 0, 2, 3]) { lq.p.push(Q[k][0], Q[k][1], Q[k][2]); lq.uv.push(U2[k][0], U2[k][1]); } };
      quadL(P(6.5, -4.15, 9.6 * VS), P(-6.5, -4.15, 9.6 * VS), P(-6.5, -4.15, 12.6 * VS), P(6.5, -4.15, 12.6 * VS), uvA);
      quadL(P(5.5, 1.45, 6.9 * VS), P(-5.5, 1.45, 6.9 * VS), P(-5.5, 1.45, 8.1 * VS), P(5.5, 1.45, 8.1 * VS), uvB);
      const bp = P(0, 0.4, 7.4 * VS); b.col('#fff6d0', 2.4).bead(bp[0], bp[1], bp[2], 0.35); gp.add(bp[0], bp[1], bp[2], '#ffd890', 5, 6, n);
      if (++n % 3 === 0) yield;
    }
    const grp = new T.Group(); grp.name = 'diwali3d:stalls';
    const m = b.mesh(G3.M.solid); if (m) grp.add(m);
    if (lq.p.length) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(lq.p, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(lq.uv, 2)); g.computeVertexNormals(); const lm = new T.Mesh(g, G3.M.labels); lm.userData.noShadow = true; grp.add(lm); }
    const pts = gp.points(); if (pts) grp.add(pts);
    site.grp = grp; site.n = n;
  }
  function stepSite(cur, next, dt, want, make) {
    // returns the (possibly new) current site; builds `next` with a few ms of generator steps per frame
    if (next && next.gen) {
      const t0 = now(), budget = G3.urgent > 0 ? 30 : 3;
      try { while (now() - t0 < budget) { const r = next.gen.next(); if (r.done) { next.gen = null; break; } } } catch (e) { N.err('diwali3d.build', e); next.gen = null; next.dead = true; }
      if (!next.gen) { if (!next.dead && next.grp) G3.grp.add(next.grp); disposeSite3D(cur); return { cur: next.dead ? null : next, next: null }; }
      return { cur, next };
    }
    if (want && (!cur || cur.key !== want.key || Math.hypot(cur.x - want.x, cur.y - want.y) > want.move)) {
      const s = { key: want.key, x: want.x, y: want.y, r: want.r, grp: null, gen: null };
      s.gen = make(s);
      return { cur, next: s };
    }
    if (!want && cur) { disposeSite3D(cur); return { cur: null, next: null }; }
    return { cur, next };
  }
  const _m = new Float32Array(16);
  function writeBitMatrix(i, VS) {
    let gh = LB.gh[i];
    if (gh !== gh) { try { gh = N.view3d.groundHeightAt ? N.view3d.groundHeightAt(LB.x[i], LB.y[i]) || 0 : 0; } catch (e) { gh = 0; } LB.gh[i] = gh; }
    const th = -LB.ang[i], c = Math.cos(th), s = Math.sin(th), f = LB.flip[i], cf = Math.cos(f), sf = Math.sin(f);
    const sz = LB.size[i] * 0.78, sx = sz, szz = sz * 0.62;
    const a = G3.lit.instanceMatrix.array, o = i * 16;
    a[o] = c * sx; a[o + 1] = 0; a[o + 2] = -s * sx; a[o + 3] = 0;
    a[o + 4] = s * sf; a[o + 5] = cf; a[o + 6] = c * sf; a[o + 7] = 0;
    a[o + 8] = s * cf * szz; a[o + 9] = -sf * szz; a[o + 10] = c * cf * szz; a[o + 11] = 0;
    a[o + 12] = LB.x[i]; a[o + 13] = gh + 0.07 + (i % 7) * 0.006 + LB.h[i] * VS; a[o + 14] = LB.y[i]; a[o + 15] = 1;
    const cc = G3.H.color(LCOL[LB.col[i]]), ca = G3.lit.instanceColor.array;
    ca[i * 3] = cc.r; ca[i * 3 + 1] = cc.g; ca[i * 3 + 2] = cc.b;
  }
  function decalMatrix(mesh, k, x, h, y, a, s, sy) {
    const c = Math.cos(-a) * s, sn = Math.sin(-a) * s, arr = mesh.instanceMatrix.array, o = k * 16;
    arr[o] = c; arr[o + 1] = 0; arr[o + 2] = -sn; arr[o + 3] = 0; arr[o + 4] = 0; arr[o + 5] = sy || 1; arr[o + 6] = 0; arr[o + 7] = 0;
    arr[o + 8] = sn; arr[o + 9] = 0; arr[o + 10] = c; arr[o + 11] = 0; arr[o + 12] = x; arr[o + 13] = h; arr[o + 14] = y; arr[o + 15] = 1;
  }
  const PINK = hexRGB('#ff6a9a');
  const RGB = COLS_RGB, SMOKE_D = hexRGB('#bdb4ae'), SMOKE_N = hexRGB('#4a4248'), WHITE = [1, 0.97, 0.88], ORANGE = [1, 0.66, 0.3];
  const _rgb = [0, 0, 0];
  function layerUpdate3D(dt, H) {
    if (!G3.ready) return;
    const t0 = now();
    const VS = VS3(), p = N.player;
    const night = H.night || 0, hz = haze();
    G3.uni.uT.value = (N.time && (N.time.real || N.time.now)) || 0;
    G3.uni.uI.value = night < 0.1 ? 0 : Math.min(1, night * 1.25);
    G3.uni.uLamp.value = lampTime() ? clamp(0.5 + night, 0, 1.2) : 0;
    G3.uni.uDwN.value = 0.08 + night * 1.1;
    if (G3.M.rangoli) G3.M.rangoli.emissive.setScalar(lampTime() ? 0.08 + night * 0.3 : 0);
    if (G3.M.labels) G3.M.labels.emissive.setScalar(stallsOpen() ? night * 0.55 : 0);
    G3.uni.uFogK.value = hz * 0.0006; G3.uni.uFogK2.value = hz * 0.0018;
    if (H.camera) { G3.uni.uDwCam.value.copy(H.camera.position); G3.uni.uDwFade.value = H.mode === 'fps' ? 3 : 10; }
    if (H.renderer && H.camera) G3.uni.uScale.value = (H.renderer.domElement.height || 720) / (2 * Math.tan((H.camera.fov * PI) / 360));
    if (G3.urgent > 0) G3.urgent -= dt;
    // sites: decorated houses + stalls round the player
    const decorWant = decorDay() > 0 && p ? { key: decorKey(), x: p.x, y: p.y, r: PHONE() ? 280 : 400, move: PHONE() ? 110 : 150 } : null;
    let r0 = stepSite(G3.decor, G3.decorNext, dt, decorWant, buildDecor3D); G3.decor = r0.cur; G3.decorNext = r0.next;
    const m = mins(), stWant = stallsOn() && m >= 7 * 60 && m < 23 * 60 + 30 && p ? { key: 'stalls:' + (stallsOpen() ? 1 : 0), x: p.x, y: p.y, r: 520, move: 180 } : null;
    r0 = stepSite(G3.stalls, G3.stallsNext, dt, stWant, buildStalls3D); G3.stalls = r0.cur; G3.stallsNext = r0.next;
    // sparks (+ a ghost at their last position: short streaks), rocket heads, flashes, emitter glows
    const S = G3.spk; S.n = 0;
    for (let i = 0; i < SP.n; i++) {
      const u = SP.t[i] / SP.life[i], kd = SP.kind[i]; let a = 1 - u * u;
      if (kd === 1 && rnd() < 0.35) a *= 0.15;
      const sz = (kd === 4 ? 0.42 : kd === 2 ? 1.8 : 4.4) * SP.size[i], c = RGB[SP.col[i]], x = SP.x[i], y = SP.y[i], h = SP.h[i] * VS;
      ptAdd(S, x, h, y, sz, a, c);
      if (kd !== 4 && kd !== 2) { ptAdd(S, x - SP.vx[i] * 0.045, h - SP.vh[i] * 0.045 * VS, y - SP.vy[i] * 0.045, sz * 0.8, a * 0.5, c); ptAdd(S, x - SP.vx[i] * 0.09, h - SP.vh[i] * 0.09 * VS, y - SP.vy[i] * 0.09, sz * 0.6, a * 0.25, c); }
    }
    for (const r of ROCKETS) { ptAdd(S, r.x, r.h * VS, r.y, 2.4, 1, WHITE); }
    ptCommit(S);
    const G = G3.glo; G.n = 0;
    let fr = 0, fg = 0, fb = 0, best = null, bk = 0;
    for (const f of FLASH) {
      const a = flashK(f); if (a <= 0.01) continue;
      const c = hexRGB(f.col);
      ptAdd(G, f.x, f.h * VS, f.y, f.life > 1 ? f.r : f.r * (f.h > 20 ? 0.5 : 0.35), Math.min(1, a * (f.life > 1 ? 0.6 : 0.5)), c);
      if (f.h > 20) { const d = p ? Math.hypot(f.x - p.x, f.y - p.y) : 500, w = a * Math.max(0, 1 - d / 1400); fr += c[0] * w; fg += c[1] * w; fb += c[2] * w; if (w > bk) { bk = w; best = f; } }
      else if (p && Math.hypot(f.x - p.x, f.y - p.y) < 160 && H.light) H.light({ x: f.x, y: f.y, h: 3, color: f.col, intensity: 1.6 * a, r: f.r * 0.8 });
    }
    if (best && H.light) H.light({ x: best.x, y: best.y, h: best.h * VS, color: best.col, intensity: 2.2 * bk, r: 420 });
    for (const r of ROCKETS) ptAdd(G, r.x, r.h * VS, r.y, 5, 0.55, ORANGE);
    for (const a of HEARTS) ptAdd(G, a.x, (6 + (2.2 - a.dwHeartT) * 1.2) * VS, a.y, 3.5, Math.min(1, a.dwHeartT), PINK);
    for (const e of EMIT) {
      if (p && Math.hypot(e.x - p.x, e.y - p.y) > 500) continue;
      if (e.kind === 'anaar' && e.t > 0.3) { ptAdd(G, e.x, 3 * VS, e.y, 14, 0.5, ORANGE); if (H.light && p && Math.hypot(e.x - p.x, e.y - p.y) < 220) H.light({ x: e.x, y: e.y, h: 4, color: '#ffc070', intensity: 1.4, r: 60 }); }
      else if (e.kind === 'sparkler') { ptAdd(G, e.x, e.h * VS, e.y, 4, 0.7, WHITE); if (H.light && p && Math.hypot(e.x - p.x, e.y - p.y) < 120) H.light({ x: e.x, y: e.y, h: e.h * VS, color: '#ffe8b0', intensity: 0.9, r: 30 }); }
      else if (e.kind === 'chakri') ptAdd(G, e.x, 0.6, e.y, 6, 0.6, ORANGE);
    }
    ptCommit(G);
    // smoke: grey by day, dark against the night, warmed by the bursts
    const K = G3.smk; K.n = 0;
    const flashW = Math.min(1, fr + fg + fb);
    for (let c = 0; c < 3; c++) _rgb[c] = lerp(SMOKE_D[c], SMOKE_N[c], night) + [fr, fg, fb][c] * 0.35;
    for (let i = 0; i < SM.n; i++) { const u = SM.t[i] / SM.life[i]; ptAdd(K, SM.x[i], SM.h[i] * VS, SM.y[i], SM.size[i] * 2.2, SM.a[i] * 0.85 * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85), _rgb); }
    ptCommit(K);
    void flashW;
    // the paper: only the bits that moved (or were added / swapped) are rewritten
    const L = G3.lit;
    if (G3.allDirty) { for (let i = 0; i < LB.n; i++) LB.gh[i] = NaN; LIT.dmin = 0; LIT.dmax = LB.n - 1; for (let i = 0; i < LB.n; i++) LB.dirty[i] = 1; G3.allDirty = false; }
    if (LIT.dmax >= LIT.dmin) {
      const hi = Math.min(LIT.dmax, LB.n - 1);
      for (let i = LIT.dmin; i <= hi; i++) if (LB.dirty[i]) { writeBitMatrix(i, VS); LB.dirty[i] = 0; }
      const im = L.instanceMatrix, ic = L.instanceColor;
      im.updateRange.offset = LIT.dmin * 16; im.updateRange.count = Math.max(0, hi - LIT.dmin + 1) * 16; im.needsUpdate = true;
      ic.updateRange.offset = LIT.dmin * 3; ic.updateRange.count = Math.max(0, hi - LIT.dmin + 1) * 3; ic.needsUpdate = true;
      LIT.dmin = 1e9; LIT.dmax = -1;
    }
    L.count = LB.n;
    // trodden patches, heaps, soot
    if (G3.decGen !== LIT.decalsGen + SOOT.length * 1e6) {
      G3.decGen = LIT.decalsGen + SOOT.length * 1e6;
      const D = G3.dec, U2 = G3.decUv.array, M2 = G3.mound;
      let k = 0;
      const gh = (o) => { if (o.gh !== o.gh) { try { o.gh = N.view3d.groundHeightAt ? N.view3d.groundHeightAt(o.x, o.y) || 0 : 0; } catch (e) { o.gh = 0; } } return o.gh; };
      for (const d of DEC) { if (k >= 380) break; const sz = (d.v === 3 ? 9 : d.v === 2 ? 15 : 13) * d.s * (0.6 + 0.4 * (d.k == null ? 1 : d.k)); decalMatrix(D, k, d.x, gh(d) + 0.05, d.y, d.a, sz); U2[k * 2] = (d.v % 4) * 0.25; U2[k * 2 + 1] = 0.5; k++; }
      let mk = 0;
      for (const d of HEAPS) { if (k >= 398 || mk >= 78) break; const sz = 8 * d.s * (0.5 + 0.5 * d.k); decalMatrix(D, k, d.x, gh(d) + 0.06, d.y, d.a, sz); U2[k * 2] = 0; U2[k * 2 + 1] = 0; k++; decalMatrix(M2, mk, d.x, gh(d), d.y, d.a, 2.1 * d.s * (0.5 + 0.5 * d.k), 0.42); M2.setColorAt(mk, G3.H.color(mk % 3 ? '#a02a22' : '#8a3424')); mk++; }
      D.count = k; D.instanceMatrix.needsUpdate = true; G3.decUv.needsUpdate = true;
      M2.count = mk; M2.instanceMatrix.needsUpdate = true; if (M2.instanceColor) M2.instanceColor.needsUpdate = true;
    }
    // the crackers on the ground + the families' buckets
    const CN = G3.cone, CY = G3.cyl; let cn = 0, cy = 0;
    const put = (mesh, k, x, h, y, sx, sy, sz, col) => { G3.H.color(col); const arr = mesh.instanceMatrix.array, o = k * 16; arr.fill(0, o, o + 16); arr[o] = sx; arr[o + 5] = sy; arr[o + 10] = sz; arr[o + 12] = x; arr[o + 13] = h; arr[o + 14] = y; arr[o + 15] = 1; mesh.setColorAt(k, G3.H.color(col)); };
    for (const e of EMIT) {
      if (p && Math.hypot(e.x - p.x, e.y - p.y) > 400) continue;
      if (e.kind === 'anaar' && cn < 60) put(CN, cn++, e.x, 1.1, e.y, 0.95, 2.2, 0.95, '#b8481e');
      else if (e.kind === 'chakri' && cy < 78) put(CY, cy++, e.x, 0.25, e.y, 1.4, 0.3, 1.4, (e.t * 4 | 0) % 2 ? '#2a8a3a' : '#d8302a');
      else if (e.kind === 'bomb' && cy < 78) put(CY, cy++, e.x, 0.55, e.y, 0.6, 1.1, 0.6, '#c82020');
      else if (e.kind === 'bottle' && cy < 78) put(CY, cy++, e.x, 1.6, e.y, 0.7, 3.2, 0.7, '#2a7a4a');
      else if (e.kind === 'ladi') { const ca = Math.cos(e.a), sa = Math.sin(e.a); for (let j = e.pops; j < e.n && cy < 78; j += 4) { const u = (j / e.n) * e.len; put(CY, cy++, e.x0 + ca * u, 0.25, e.y0 + sa * u, 0.35, 0.5, 0.35, '#c81e1e'); } }
    }
    for (const g of GROUPS) { const b = g.bucket; if (!b || cy >= 78) continue; put(CY, cy++, b.x, 1.6, b.y, 1.3, 3.2, 1.3, '#4a7aa8'); }
    CN.count = cn; CY.count = cy; CN.instanceMatrix.needsUpdate = true; CY.instanceMatrix.needsUpdate = true;
    if (CN.instanceColor) CN.instanceColor.needsUpdate = true; if (CY.instanceColor) CY.instanceColor.needsUpdate = true;
    // smoke haze: the fog closes in and turns smoky (thicker after 21:00); bursts tint the sky
    const fog = H.scene && H.scene.fog;
    if (fog) {
      if (hz > 0.01) {
        G3.fogC = G3.fogC || new G3.THREE.Color();
        G3.fogC.setRGB(0.22 + 0.25 * (1 - night), 0.19 + 0.24 * (1 - night), 0.19 + 0.22 * (1 - night));
        fog.color.lerp(G3.fogC, Math.min(0.6, hz * 0.7));
        fog.far = Math.max(380, fog.far * (1 - 0.42 * hz)); fog.near = Math.min(fog.near, fog.far * (0.32 - 0.24 * hz));
      }
      if (fr + fg + fb > 0.01) { fog.color.r = Math.min(1, fog.color.r + fr * 0.05 * night); fog.color.g = Math.min(1, fog.color.g + fg * 0.05 * night); fog.color.b = Math.min(1, fog.color.b + fb * 0.05 * night); }
    }
    // the stalls' bulbs and the nearest doorway diyas light their surroundings
    if (H.light && p && night > 0.1) {
      let n = 0;
      if (stallsOpen()) for (const st of stallList()) { if (n >= 2) break; if (Math.abs(st.x - p.x) > 160 || Math.abs(st.y - p.y) > 160) continue; H.light({ x: st.x + st.fx * 0.4, y: st.y + st.fy * 0.4, h: 7.4 * VS, color: '#ffe0a0', intensity: 1.2, r: 70 }); n++; }
    }
    G3.ms = now() - t0;
    STATS.ms3d = G3.ms; STATS.ms3dAvg += (G3.ms - STATS.ms3dAvg) * 0.05;
  }
  if (N.view3d && N.view3d.registerLayer) N.view3d.registerLayer('diwali3d', {
    order: 46,
    init(THREE, H) { try { initLayer3D(THREE, H); } catch (e) { N.err('diwali3d.init', e); } },
    update(dt, H) { try { layerUpdate3D(dt, H); } catch (e) { N.err('diwali3d.update', e); } },
    dispose(H) { try { disposeLayer3D(H); } catch (e) { N.err('diwali3d.dispose', e); } },
  });
  N.on('view:change', (e) => { if (e && e.mode && e.mode !== 'top') { G3.allDirty = true; G3.decGen = -1; LIT.regT = 0; } else LIT.regT = 0; });
  N.on('player:teleport', () => { G3.urgent = 2; LIT.regT = 0; });

  /* ================================================================ the system */
  let busy = false;
  function anyAlive() { return SP.n || SM.n || ROCKETS.length || EMIT.length || FLASH.length || GROUPS.length || LB.n || SHOWS.length || DEC.length; }
  function resetAll() {
    for (const g of GROUPS.slice()) freeGroup(g);
    STALLP.clear();
    for (const p of PERSONS.slice()) freePerson(p);
    SP.n = 0; SM.n = 0; ROCKETS.length = 0; EMIT.length = 0; FLASH.length = 0; SHOWS.length = 0;
    litterClear();
    homeTalk(false);
    for (const a of hidingDogs()) { a.dwHide = 0; a.dwSpot = null; a.dwCalm = false; }
  }
  let frameStamp = -1, frameMs = 0;
  function update(dt) {
    const t0 = now();
    if (!sfxReady) registerSounds();
    const week = stallsOn() || active() || litterLevel() > 0 || SHOWS.length > 0;
    if (!week && !busy) { if (anyAlive()) { resetAll(); } return; }
    busy = week || !!anyAlive();
    timeJump();
    updateRockets(dt); updateSparks(dt); updateSmoke(dt); updateFlashes(dt); updateEmitters(dt);
    updateDogs(dt);
    updateCity(dt);
    dirT -= dt; if (dirT <= 0) { dirT = 0.8; try { director(); } catch (e) { N.err('diwali.director', e); } }
    for (let i = GROUPS.length - 1; i >= 0; i--) { const g = GROUPS[i]; try { groupUpdate(g, dt); } catch (e) { N.err('diwali.group', e); freeGroup(g); } }
    LIT.regT -= dt;
    litterRegion(false);
    updateLitter(dt);
    roamOffers();
    if (!week && !anyAlive()) busy = false;
    const f = N.time ? N.time.frame : 0;
    if (f !== frameStamp) { if (frameStamp >= 0) { STATS.ms = frameMs; STATS.msAvg += (frameMs - STATS.msAvg) * 0.05; } frameStamp = f; frameMs = 0; }
    frameMs += now() - t0;
  }
  function draw() {
    if (is3D() || !busy) return;
    // the 2D draw closures ran during the last flush: book last frame's enqueue + draw cost
    if (STATS._d2 != null) { STATS.ms2d = STATS._d2; STATS.ms2dAvg += (STATS.ms2d - STATS.ms2dAvg) * 0.05; }
    try { draw2D(); } catch (e) { N.err('diwali.draw', e); }
  }
  N.addSystem({
    id: 'diwali', order: 44, runIn: ['play', 'dialogue', 'cutscene'],
    init() {
      registerSounds();
      if (N.save && N.save.register) N.save.register('diwali', {
        serialize() { return { box: Object.assign({}, box.items), lit: STATS.lit, comforted: STATS.comforted }; },
        deserialize(j) { box.clear(); if (j && j.box) for (const k of KINDS) box.items[k] = Math.max(0, j.box[k] | 0); if (j && isFinite(j.lit)) STATS.lit = j.lit | 0; },
      });
    },
    update,
    draw,
    reset() { resetAll(); busy = false; },
  });
  N.on('world:built', () => { okCache.clear(); HOSP = null; HOME = null; STALLS = null; litterClear(); });
  N.on('game:new', () => { box.clear(); });
  // a jump in time (a ▶▶, the debug calendar, a load): the families and stall people of the old hour go home at once
  let absMin = null;
  const nowAbs = () => ((N.clock && N.clock.day) || 0) * 1440 + mins();
  function timeJump() {
    const a = nowAbs();
    if (absMin != null && Math.abs(a - absMin) > 30) {
      for (const g of GROUPS.slice()) freeGroup(g);
      for (const id of Array.from(STALLP.keys())) freeStallPeople(id);
      for (const e of EMIT) if (e.kind === 'sparkler') e.t = e.dur;
    }
    absMin = a;
  }
  N.on('calendar:change', () => { LIT.regT = 0; dirT = 0; timeJump(); });
  N.on('season:change', (e) => { if (e && (e.name === 'diwali' || e.name === 'pataakha')) { LIT.regT = 0; dirT = 0; busy = true; } });

  /* ================================================================ API */
  const layout = {
    /** every pataakha stall: [{id, anchor (place id), kind 'bazaar'|'market'|'kirana', x, y, a (along the road), fx, fy (towards the road), label, stripes, seed}] */
    stalls: () => stallList(),
    /** decorated houses within r of (cx, cy), nearest first: [{id, home, cx, cy (front wall middle), f, nx, ny, ux, uy, door {x, y},
     *  gate {x, y} (just outside the gate), rangoli {x, y, r, v}, diyas [[x, y]..], gateDiyas, toran {a, b, h}, kandil {x, y, h, col, style},
     *  fairy {pts, h, cols, pat}, parapet {pts, h}, s (the world structure, or null for the home), P(u, v) -> [x, y]}] */
    houses: (cx, cy, r) => housesNear(cx, cy, r == null ? 300 : r, 400, []),
    /** the home's decor plan (the Lakshmi Nivas landmark) */
    home: () => homeDecor(),
    spots,
  };
  const litterAPI = {
    get count() { return LB.n; },
    get flying() { let n = 0; for (let i = 0; i < LB.n; i++) if (LB.st[i] === 2) n++; return n; },
    get awake() { return LIT.awake; },
    get live() { return LIT.live; },
    /** a snapshot of the loose bits: [{x, y, h, st (0 rest, 1 sliding, 2 flying), col}] (debug / tests; allocates) */
    get bits() { const o = []; for (let i = 0; i < LB.n; i++) o.push({ x: LB.x[i], y: LB.y[i], h: LB.h[i], st: LB.st[i], col: LCOL[LB.col[i]] }); return o; },
    /** counts within r of (x, y): {n, flying, sliding, resting} */
    near(x, y, r) { const o = { n: 0, flying: 0, sliding: 0, resting: 0 }; const r2 = r * r; for (let i = 0; i < LB.n; i++) { const dx = LB.x[i] - x, dy = LB.y[i] - y; if (dx * dx + dy * dy > r2) continue; o.n++; if (LB.st[i] === 2) o.flying++; else if (LB.st[i] === 1) o.sliding++; else o.resting++; } return o; },
    get decals() { return DEC.length; }, get heaps() { return HEAPS.length; },
    level: litterLevel, sweep: sweepLevel,
    /** re-seed round the player now and put every flying bit down */
    settle() { LIT.regT = 0; litterRegion(true); for (let i = 0; i < LB.n; i++) { if (LB.st[i]) { LIT.awake--; } LB.st[i] = 0; LB.h[i] = 0; LB.vx[i] = LB.vy[i] = LB.vh[i] = 0; LB.gh[i] = NaN; markDirty(i); } LIT.awake = 0; G3.decGen = -1; return LB.n; },
    clear() { litterClear(); },
    /** the air a passing vehicle / the wind moves at (x, y) right now: {ax, ay, lift} (debug) */
    air(x, y) { gatherWakes(); wakeAir(x, y, 0, N.time ? N.time.now : 0); return { ax: AIR[0], ay: AIR[1], lift: AIR[2], wakes: VWN }; },
  };
  const dogs = {
    /** dogs hiding from the crackers right now (traffic dogs + registered ones) */
    get hiding() { return hidingDogs(); },
    /** make a dog run off and hide (from (o.x, o.y), default: away from the player); o {x, y, secs, spot} -> bool */
    hide(dog, o) { o = o || {}; return hideDog(dog, o.x, o.y, o); },
    /** comfort a hiding dog -> bool */
    calm: calmDog,
    /** a dog this module should scare / step too (not a traffic dog, e.g. the missions' Tiger). dog.onBang(x, y) overrides the
     *  default reaction; dog.dwOwnStep = true means the owner steps it (call dogs.step(dog, dt) yourself) */
    register(dog) { if (dog && DOGS.indexOf(dog) < 0) DOGS.push(dog); return dog; },
    unregister(dog) { const i = DOGS.indexOf(dog); if (i >= 0) DOGS.splice(i, 1); },
    /** one step of a hiding dog (walks to its spot, naps there whimpering) -> true while hiding */
    step: (dog, dt) => dogHide(dog, dt, null),
    isHiding: (dog) => !!(dog && dog.dwHide > 0),
  };
  N.diwali = {
    TUNE, NIGHTS, KINDS,
    /** Diwali (22-26 Oct 2003): the colonies lit, fireworks at night */
    active,
    /** the pataakha stalls are open now (20-26 Oct, 09:00-23:00); stallsWeek() = the stalls' week */
    stalls: stallsOpen, stallsWeek: stallsOn,
    intensity, litterLevel, sweepLevel, haze, isNight, lampTime, dayNo, decorDay,
    fireOK,
    layout, spots,
    /** a shell bursting at (x, y, h): type 'peony' | 'ring' | 'willow' | 'crackle' | 'multi' | 'palm' */
    burst: (x, y, h, type, col, big) => burst(x, y, h == null ? 140 : h, type, col, big),
    /** a rocket from (x, y): opts {h, type, col, big, vh, fuse, silent, force, onBurst(r)} -> rocket | null */
    rocket,
    bomb: (x, y, o) => bomb(x, y, Object.assign({}, o)), anaar: (x, y, o) => anaar(x, y, o), chakri: (x, y, o) => chakri(x, y, o),
    ladi: (x, y, o) => ladi(x, y, o),
    /** a phuljhadi: held by o.holder (an actor: follows his hand) or standing at (x, y) */
    sparkler: (x, y, o) => emitter('sparkler', x, y, Object.assign({ force: true }, o)),
    /** a rocket from a bottle at (x, y) after its fuse: o {fuse, rocket: rocket opts, onLaunch(r)} */
    bottle: (x, y, o) => emitter('bottle', x, y, o),
    scatter: (x, y, n, o) => scatter(x, y, n == null ? 20 : n, o),
    show,
    litter: litterAPI,
    box,
    canLight, lightFromBox,
    dogs,
    stats() {
      return Object.assign({}, STATS, { sparks: SP.n, smoke: SM.n, rockets: ROCKETS.length, emitters: EMIT.length, flashes: FLASH.length, groups: GROUPS.length, persons: PERSONS.length,
        bits: LB.n, awake: LIT.awake, flyingBits: litterAPI.flying, liveBits: LIT.live, decals: DEC.length, heaps: HEAPS.length, cells: LIT.cells, houses2d: VIS.houses.length, stalls2d: VIS.stalls.length,
        stallsTotal: (STALLS || []).length, decor3d: G3.decor ? G3.decor.n : 0, stalls3d: G3.stalls ? G3.stalls.n : 0, phone: PHONE(), budget: Object.assign({}, BUD()), shows: SHOWS.length });
    },
    _dogHide: (a, dt, step) => dogHide(a, dt, step),
    /** 2D draw ms per frame since the last call, per pass: ground, houses (kandil part k), stalls, sky, light, enqueue */
    /** micro-benchmark of the 2D passes (n calls each, ms per call; draws over the current frame: tests only) */
    bench2d(n) {
      n = n || 20; const out = {};
      const t = (k, fn) => { const t0 = now(); for (let i = 0; i < n; i++) fn(); out[k] = +((now() - t0) / n).toFixed(3); };
      t('enqueue', () => { VQ.t = -1; draw2D(); });
      t('ground', drawGround2D); t('houses', () => { for (const d of VIS.houses) drawHouse2D(d); }); t('stalls', () => { for (const st of VIS.stalls) drawStall2D(st); });
      t('sky', drawSky2D); t('light', drawLight2D); t('fx', drawFx2D);
      out.houses_n = VIS.houses.length; out.bits = LB.n; out.decals = DEC.length; out.sparks = SP.n;
      N.render.ctx.setTransform(1, 0, 0, 1, 0, 0); N.render.ctx.globalAlpha = 1; N.render.ctx.globalCompositeOperation = 'source-over';
      return out;
    },
    prof2d() { const n = Math.max(1, PROF.n); const o = { frames: PROF.n }; let t = 0; for (const k of ['g', 'h', 'k', 'st', 's', 'l', 'e']) { o[k] = +(PROF[k] / n).toFixed(3); if (k !== 'k') t += PROF[k] / n; PROF[k] = 0; } o.total = +t.toFixed(3); PROF.n = 0; return o; },
    debug: {
      /** pin the cracker intensity (0..1, null = the calendar) / the litter level / the haze */
      force(v) { if (v == null) delete F().dw_force; else F().dw_force = v; dirT = 0; busy = true; },
      litter(v) { if (v == null) delete F().dw_litter; else F().dw_litter = v; LIT.regT = 0; busy = true; },
      haze(v) { if (v == null) delete F().dw_haze; else F().dw_haze = v; },
      clear: resetAll,
      /** decide everything round the player now (families, litter) and finish the 3D builds (tests / captures) */
      settle(ms) {
        busy = true; dirT = 0; try { for (let i = 0; i < 6; i++) director(); } catch (e) { N.err('diwali.settle', e); }
        LIT.regT = 0; litterRegion(true);
        if (G3.ready && G3.H) {
          G3.urgent = 2; const t0 = now();
          while (now() - t0 < (ms || 4000)) { layerUpdate3D(0, G3.H); if (!(G3.decorNext && G3.decorNext.gen) && !(G3.stallsNext && G3.stallsNext.gen)) { layerUpdate3D(0, G3.H); break; } }
        }
        return true;
      },
      /** test aid: n resting loose bits in the circle (x, y, r) on walkable ground (live bits) */
      sprinkle(x, y, r, n) {
        let k = 0;
        for (let t = 0; t < n * 4 && k < n; t++) {
          const a = rnd() * TAU, d = Math.sqrt(rnd()) * r, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
          if (!S_OK(N.world.surfaceAt(px, py))) continue;
          if (LB.n >= Math.min(LB.cap, BUD().litter)) { let far = -1, fd = -1; for (let j = 0; j < LB.n; j++) { if (LB.cell[j] < 0) continue; const dd = Math.abs(LB.x[j] - x) + Math.abs(LB.y[j] - y); if (dd > fd) { fd = dd; far = j; } } if (far < 0) break; const c = CELLS.get(LB.cell[far]); if (c) c.have--; bitFree(far); }
          const i = bitAlloc(px, py, pickCol(rnd()), rr(0.7, 1.5), -1, 0, rr(5, 12)); if (i < 0) break;
          LIT.live++; k++;
        }
        return k;
      },
      groups: () => GROUPS.map((g) => ({ key: g.key, home: g.home, x: Math.round(g.site.x), y: Math.round(g.site.y), members: g.members.length, act: g.act ? g.act.kind : null })),
      spawnGroupNear(x, y, r) { const s = groupSites(x, y, r || 200).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]; return s && !GROUPS.some((g) => g.key === s.key) ? !!spawnGroup(s) : false; },
      cityRocket,
      G3, LB, SP, GROUPS, EMIT, DEC, HEAPS,
    },
  };
})();
