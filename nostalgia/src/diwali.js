/* NOSTALGIA — diwali.js  (owner: Diwali developer) — Deepavali week 2003 in both views.
 *
 * Calendar (seasons.js "[diwali hook]"): `pataakha` 20-26 Oct 2003 (the cracker stalls go up) and `diwali`
 * 22-26 Oct 2003 (Naraka Chaturdashi Fri 24, Deepavali Sat 25 Oct). Both are N.seasons EXTRA names, mirrored
 * into N.flags, overridable with N.seasons.set(). They never overlap Ramzan (27 Oct ->), the interlude (1 Nov)
 * or any main mission date. In the main story the interlude's ▶▶ (10 Sep -> 1 Nov) passes over the week; the
 * week is played in the post-game ◀◀ REWIND free roam (the "Diwali Week" J-card at home ▶▶s there from any
 * day 10 Sep - 19 Oct) or whenever the calendar is set into it (debug / tests).
 *
 * WORLD (only near the player; pooled; capped per device — TUNE.budget desk / phone)
 *   colonies   every residential house (by district style share): a rangoli / muggulu at the doorstep, two
 *              clay diyas on the step, a marigold-and-mango-leaf toran over the door, an akash kandil (paper
 *              lantern) on many first floors, fairy-light strings along many parapets, diyas on the parapets
 *              in the evening. Lamps glow at night (N.render.lights / 3D glow points).
 *   stalls     pataakha stalls on Sultan Bazaar (Koti) and the commercial streets (market districts, kiranas):
 *              trestle table, striped canopy, tin boxes and colourful packs with fictional, brand-free labels
 *              (BIJLI ROCKET ANAAR CHAKRI PHULJHADI), a bulb at night. 20-26 Oct, 09:00-23:00.
 *   fireworks  rockets streak up and burst (peony / ring / willow / crackle / multi) all round the city, peak
 *              on Diwali night 19:00-23:00 (NIGHTS x hour curve); family groups on colony lanes and grounds: an
 *              adult with a bucket of water, kids with phuljhadis (sparklers), anaar fountains, spinning
 *              chakris, the odd bijli / laxmi bomb lit by the adult only (flash, smoke puff, red paper scatter),
 *              rockets from a bottle. Never within 60 u of a respect zone, 150 u of a mosque / church / dargah /
 *              gurudwara / ashurkhana / tomb / Charminar, or 230 u of a hospital (fireOK()).
 *   litter     red / pink / brown cracker paper on the roads: it accumulates through the night (litterLevel)
 *              and stays the next morning (swept by the afternoon); bomb scatters add live bits. Bits blow and
 *              swirl in the wake of passing vehicles (speed + heading of every moving vehicle near the bits)
 *              and drift / lift in N.wind gusts.
 *   haze       smoke haze over the city at night, thicker after 21:00 (2D wash; 3D fog colour + distance).
 *   animals    traffic dogs run off and hide (napping by a wall) after nearby bangs, cows get up and amble
 *              away, pigeons and birds scatter; a hiding dog offers "Comfort the dog" (a gentle moment).
 *   sounds     N.audio.ext.registerSfx: dw_crackle dw_sparkler dw_anaar dw_rocket dw_burst dw_far dw_bomb
 *              dw_match dw_whimper (distance delay on bursts, far city pops without a position).
 * Free roam: phuljhadis / chakris / anaars / rockets from the Pataakha Bazaar box (or a ₹5 phuljhadi box from
 *   any stall) can be lit only beside Amma / Nanna at home or at a family's "bucket of water" spot; lighting near
 *   elders, animals or a hospital raises the Chappal Meter (N.wanted.addHeat) and the adult stops it.
 *
 * SIDE ACTIVITIES (N.missions, kind 'side', Diwali week only, no autosave; save section 'diwali')
 *   pataakha_bazaar  Amma's ₹100 budget and list -> the Sultan Bazaar stall card (choose within budget, Nanna's
 *                    rule: no bombs, more phuljhadis), haggle once, carry the box home through traffic (box meter;
 *                    bumps / near misses / running). Fail: "He knows (he doesn't)" with bombs, or the box falls.
 *   deepon_ki_raat   with Ammamma: 21 diyas on the home terrace parapet before the breeze; gusts (N.wind direction
 *                    + scripted gust fronts) blow out the windward flames unless Chinnu stands guard; re-light.
 *                    Reward: the terrace view of the city's fireworks + a clay diya for the tin.
 *   mithai_run       five sweet boxes: Immu's family (Ammi: "Eid pe sevaiyan pakki" -> N.flags.diwali_sevai_promise,
 *                    read by story2.js's Eid morning card "[diwali hook]"), Agarwal-ji, Ramulu-uncle, Lakshmamma,
 *                    the gate aunties. Timer (before Amma's puja).
 *   rocket_bunty     Bunty-anna: bucket of water first, aim the bottle away from the houses (aim card), wait out
 *                    the gust and light it -> the big burst over the colony and the group photo (tin token).
 *   tiger_ko_bachao  (optional) Tiger, the colony dog, is hiding from the crackers: find him (whimpers + search
 *                    circle), comfort him, lead him (walk, no running) to Nanna's quiet garage.
 *   diwali_week      post-game only: Amma's "Diwali is next week" card ▶▶s the calendar to Mon 20 Oct.
 *
 * API  N.diwali = {TUNE, active(), stalls(), intensity(), litterLevel(), haze(), fireOK(x, y), stats(),
 *   layout {stalls(), houses(cx, cy, r), spots}, burst(x, y, h, type), rocket(x, y, {h, type}), bomb(x, y),
 *   anaar(x, y), chakri(x, y), scatter(x, y, n), show(x, y, secs) (a dense show for the terrace view),
 *   litter {count, bits, settle(), clear()}, box (the cracker stash), debug {...}}.
 * Hooks in files this module does not own (each marked "[diwali hook]"): index.html (script tag), seasons.js
 *   (EXTRA names + calendarFor), traffic.js (TUNE.events rows: busier Sultan Bazaar / colony nights),
 *   story2.js (the Eid morning sevaiyan line). 3D through N.view3d.registerLayer('diwali3d').
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

  /* ================================================================ tuning */
  const TUNE = {
    budget: {
      desk: { sparks: 1800, smoke: 150, litter: 900, groups: 5, rockets: 22, houses: 70, lights: 10 },
      phone: { sparks: 650, smoke: 60, litter: 360, groups: 3, rockets: 10, houses: 40, lights: 5 },
    },
    range: 560,            // things happen within this of the player (2D); 3D city rockets out to range3d
    range3d: 1100,
    rocketRate: 1.5,       // city rockets per second at intensity 1 (desktop; phones x0.55)
    groupEvery: [5, 12],   // seconds between a family's crackers
    bangScare: 170,        // dogs within this of a bang run off and hide
    otherFaithR: 150, respectR: 60, hospitalR: 230,
    litterCell: 24,        // road cells for the night's paper
    litterPerCell: 7,
    wakeK: 0.55, wakeLift: 22, windLift: 0.55,
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
  /** Diwali-week day number (22..26) or 0, for the date the calendar shows (overrides count as the 25th). */
  function dayNo() {
    const d = date();
    if (d.y === 2003 && d.m === 10 && d.d >= 22 && d.d <= 26) return d.d;
    return active() ? 25 : 0;
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
    let best = 0;
    const night = (n, tonight) => {
      const p = NIGHTS[n] || 0;
      if (!p) return 0;
      if (tonight) return p * smooth((m - 18 * 60 - 30) / 300);                         // tonight's grows
      if (m < 11 * 60) return p;                                                       // the morning after
      if (m < 16 * 60) return p * (1 - 0.7 * smooth((m - 11 * 60) / 300));             // swept
      return p * 0.3;
    };
    best = Math.max(best, night(d.d, true), night(d.d - 1, false) * (d.d === 27 ? 0.7 : 1));
    return clamp(best, 0, 1);
  }
  /** 0..1 smoke haze at night (thicker after 21:00). */
  function haze() {
    if (!active() && dayNo() === 0) return 0;
    const m = mins(), dn = dayNo(), base = NIGHTS[dn] || 0.3;
    let k = 0;
    if (m >= 18 * 60 + 30) k = 0.25 * smooth((m - 18 * 60 - 30) / 120);
    if (m >= 21 * 60) k = 0.25 + 0.75 * smooth((m - 21 * 60) / 120);
    if (m < 6 * 60) k = 0.8 * (1 - smooth(m / 360));
    return clamp(k * base, 0, 1);
  }

  /* ================================================================ safety: where crackers may go off */
  const OTHER_FAITH = new Set(['mosque', 'church', 'dargah', 'gurudwara', 'ashurkhana', 'tomb', 'charminar']);
  let HOSP = null;
  function hospitals() {
    if (HOSP) return HOSP;
    HOSP = [];
    const P = N.places || {};
    for (const id in P) { const p = P[id]; if (p && (p.kind === 'hospital' || /hospital|nursing_home/.test(id)) && isFinite(p.x)) HOSP.push(p); }
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
    const key = ((x / 32) | 0) * 100003 + ((y / 32) | 0);
    const c = okCache.get(key);
    if (c != null) return c;
    let ok = true;
    const RS = N.respect;
    if (RS) {
      try {
        if (RS.at && RS.at(x, y)) ok = false;
        const zones = (RS.zones || []).concat(RS.dyn || []);
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
    if (okCache.size > 6000) okCache.clear();
    okCache.set(key, ok);
    return ok;
  }
  N.on('respect:change', () => okCache.clear());
  N.on('world:built', () => { okCache.clear(); HOSP = null; });

  /* ================================================================ particle pools */
  // sparks (struct of arrays): world x, y, height h (2D units; 3D y = h * VS), velocity, age, life, size,
  // colour index into COLS, kind: 0 spark (gravity + drag), 1 glitter (twinkles), 2 trail (no gravity),
  // 3 willow (heavy drag, slow fall), 4 ground spark (fountain / chakri: bounces on the ground)
  const COLS = ['#ffd24a', '#ff5a3a', '#4ad2ff', '#7aff6a', '#ff6ad8', '#ffffff', '#ffa030', '#b48aff', '#ffe8b0'];
  const COLS_RGB = COLS.map((c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
  const SP = { n: 0, cap: 2400 };
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
  function updateSparks(dt) {
    const w = windVec(N.player ? N.player.x : 0, N.player ? N.player.y : 0);
    for (let i = SP.n - 1; i >= 0; i--) {
      SP.t[i] += dt;
      if (SP.t[i] >= SP.life[i]) { killSpark(i); continue; }
      const k = SP.kind[i];
      let drag = 1.6, g = 28;
      if (k === 2) { drag = 3; g = 0; } else if (k === 3) { drag = 2.6; g = 9; } else if (k === 1) { drag = 2.0; g = 16; } else if (k === 4) { drag = 1.2; g = 46; }
      const f = Math.max(0, 1 - drag * dt);
      SP.vx[i] = SP.vx[i] * f + w.x * 6 * dt; SP.vy[i] = SP.vy[i] * f + w.y * 6 * dt; SP.vh[i] = SP.vh[i] * f - g * dt;
      SP.x[i] += SP.vx[i] * dt; SP.y[i] += SP.vy[i] * dt; SP.h[i] += SP.vh[i] * dt;
      if (SP.h[i] < 0) { if (k === 4) { SP.h[i] = 0; SP.vh[i] *= -0.3; SP.vx[i] *= 0.5; SP.vy[i] *= 0.5; } else { killSpark(i); } }
    }
  }
  // smoke puffs
  const SM = { n: 0, cap: 200 };
  for (const k of ['x', 'y', 'h', 'vx', 'vy', 'vh', 't', 'life', 'size', 'a']) SM[k] = new Float32Array(SM.cap);
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
        if (i !== j) for (const k of ['x', 'y', 'h', 'vx', 'vy', 'vh', 't', 'life', 'size', 'a']) SM[k][i] = SM[k][j];
        continue;
      }
      SM.vx[i] += (w.x * 9 - SM.vx[i]) * dt * 0.5; SM.vy[i] += (w.y * 9 - SM.vy[i]) * dt * 0.5;
      SM.x[i] += SM.vx[i] * dt; SM.y[i] += SM.vy[i] * dt; SM.h[i] += SM.vh[i] * dt; SM.vh[i] *= 1 - dt * 0.3;
      SM.size[i] += dt * 2.2;
    }
  }
  const _wv = { x: 0, y: 0, s: 0 };
  function windVec(x, y) {
    const W = N.wind;
    if (W && W.at) { try { W.at(x, y, _wv); _wv.x *= _wv.s; _wv.y *= _wv.s; return _wv; } catch (e) { /* atmosphere optional */ } }
    _wv.x = 0.15; _wv.y = 0.05; _wv.s = 0.16; return _wv;
  }
  // lamp flashes (2D glow + light; 3D point-light candidates)
  const FLASH = [];
  function flash(x, y, h, col, r, life, inten) {
    if (FLASH.length > 24) FLASH.shift();
    FLASH.push({ x, y, h, col, r, t: 0, life, inten: inten == null ? 1 : inten });
  }

  /* ================================================================ audio */
  const A = () => N.audio;
  const audioOK = () => { const a = A(); return !!(a && a.sfx && a.SFX_NAMES); };
  function sfx(name, o) {
    const a = A(); if (!a || !a.sfx) return false;
    try { return a.sfx(name, o || {}); } catch (e) { return false; }
  }
  /** a sound at a world point; far ones arrive a little later (the sound travels) */
  function sfxAt(name, x, y, vol, o) {
    const p = N.player; if (!p) return;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d > 760) return;
    sfx(name, Object.assign({ x, y, vol: vol == null ? 1 : vol, delay: Math.min(1.2, d / 650) }, o || {}));
  }
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
    X.registerSfx('dw_match', (ac, out, t, o) => {
      const v = (o.vol == null ? 1 : o.vol) * 0.3;
      P.burst(ac, out, t, { ft: 'bandpass', f: 2400, q: 1.2, a: 0.005, h: 0.06, r: 0.05, v });
      P.burst(ac, out, t + 0.08, { ft: 'lowpass', f: 1200, q: 0.6, a: 0.02, h: 0.2, r: 0.25, v: v * 0.6 });
      return t + 0.6;
    }, { cooldown: 0.15, ui: false, caption: 'match strike' });
    X.registerSfx('dw_whimper', (ac, out, t, o) => {
      const v = (o.vol == null ? 1 : o.vol) * 0.18;
      let e = t;
      for (let i = 0; i < 3; i++) e = P.tone(ac, out, t + i * 0.32, { type: 'triangle', f: 980 - i * 40, f2: 640, glide: 0.24, a: 0.02, h: 0.12, r: 0.12, v, vib: [24, 18] });
      return e;
    }, { cooldown: 1.2, caption: 'a dog whimpers' });
  }

  /* ================================================================ fireworks */
  const ROCKETS = [];
  const EMIT = [];          // ground emitters: anaar, chakri, sparkler, bomb, bottle rocket fuse
  const BURSTS = ['peony', 'peony', 'ring', 'willow', 'crackle', 'multi', 'peony', 'willow'];
  const STATS = { rockets: 0, bursts: 0, bombs: 0, anaars: 0, chakris: 0, sparklers: 0, scatters: 0, scared: 0, ms: 0, ms2d: 0, ms3d: 0, msAvg: 0 };
  /** launch a rocket from (x, y); opts {h (start height), type, col, big, silent, vx, vy, fuse} */
  function rocket(x, y, o) {
    o = o || {};
    if (ROCKETS.length >= BUD().rockets && !o.force) return null;
    const r = {
      x, y, h: o.h || 1, vx: o.vx != null ? o.vx : rr(-6, 6), vy: o.vy != null ? o.vy : rr(-6, 6), vh: o.vh || rr(112, 150),
      t: 0, fuse: o.fuse || rr(1.05, 1.5), type: o.type || pick(BURSTS), col: o.col != null ? o.col : (rnd() * 8) | 0, col2: (rnd() * 8) | 0,
      big: o.big || 1, silent: !!o.silent, trailT: 0, wobble: o.wobble || 0, onBurst: o.onBurst || null,
    };
    ROCKETS.push(r); STATS.rockets++;
    if (!r.silent) sfxAt('dw_rocket', x, y, 0.7);
    return r;
  }
  const _u = { x: 0, y: 0, z: 0 };
  function sphere(out) { const u = rnd() * 2 - 1, ph = rnd() * TAU, s = Math.sqrt(1 - u * u); out.x = s * Math.cos(ph); out.y = s * Math.sin(ph); out.z = u; return out; }
  /** a shell bursting at (x, y, h) */
  function burst(x, y, h, type, col, big) {
    big = big || 1; type = type || 'peony'; col = col == null ? (rnd() * 8) | 0 : col;
    const phone = PHONE();
    const n = Math.round((phone ? 36 : 70) * big * (type === 'ring' ? 0.7 : 1));
    const sp = (44 + rnd() * 14) * Math.sqrt(big);
    const col2 = (col + 3) % 8;
    for (let i = 0; i < n; i++) {
      let vx, vy, vh;
      if (type === 'ring') { const a = (i / n) * TAU; vx = Math.cos(a) * sp; vy = Math.sin(a) * sp * 0.92; vh = Math.sin(a * 2 + x) * sp * 0.15; }
      else { sphere(_u); const s2 = sp * (0.82 + rnd() * 0.18); vx = _u.x * s2; vy = _u.y * s2; vh = _u.z * s2; }
      if (type === 'willow') spark(x, y, h, vx * 0.8, vy * 0.8, vh * 0.8 + 6, rr(2.4, 3.2), rnd() < 0.5 ? 0 : 8, 1.3, 3);
      else if (type === 'crackle') spark(x, y, h, vx * 0.9, vy * 0.9, vh * 0.9, rr(1.3, 1.9), rnd() < 0.6 ? 5 : 8, 1.1, 1);
      else spark(x, y, h, vx, vy, vh, rr(1.2, 1.9), type === 'multi' && i % 2 ? col2 : col, 1.25, 0);
    }
    flash(x, y, h, COLS[col], 230 * Math.sqrt(big), 0.55, 1);
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
      if (r.trailT <= 0) { r.trailT = PHONE() ? 0.045 : 0.025; spark(r.x, r.y, r.h, rr(-3, 3), rr(-3, 3), rr(-8, -2), rr(0.35, 0.6), 6, 0.9, 2); }
      if (r.t >= r.fuse || r.vh < 8 || r.h < 0) {
        ROCKETS.splice(i, 1);
        if (r.h > 4) {
          burst(r.x, r.y, r.h, r.type, r.col, r.big);
          if (r.onBurst) { try { r.onBurst(r); } catch (e) { N.err('diwali.onBurst', e); } }
        }
      }
    }
  }
  /** ground emitters */
  function emitter(kind, x, y, o) {
    if (EMIT.length > 18 && kind !== 'bomb') return null;
    const e = Object.assign({ kind, x, y, h: 0, t: 0, dur: 10, acc: 0, sndT: 0, ang: rnd() * TAU, holder: null }, o || {});
    if (kind === 'anaar') { e.dur = e.dur || rr(8, 11); STATS.anaars++; }
    if (kind === 'chakri') { e.dur = rr(6, 8); STATS.chakris++; }
    if (kind === 'sparkler') { e.dur = o && o.dur ? o.dur : rr(9, 13); STATS.sparklers++; }
    if (kind === 'bomb') { e.dur = o && o.fuse ? o.fuse : rr(1.8, 2.6); e.big = (o && o.big) || 1; }
    if (kind === 'bottle') { e.dur = o && o.fuse ? o.fuse : 1.4; }
    EMIT.push(e);
    return e;
  }
  const anaar = (x, y, o) => emitter('anaar', x, y, o);
  const chakri = (x, y, o) => emitter('chakri', x, y, o);
  const bomb = (x, y, o) => emitter('bomb', x, y, o);
  const _hp = { x: 0, y: 0 };
  function holderHand(e, out) {
    const a = e.holder, ang = a.facing != null && a === N.player ? a.facing : (a.angle || 0);
    out.x = a.x + Math.cos(ang) * 2.2 + Math.cos(ang + PI / 2) * 1.6; out.y = a.y + Math.sin(ang) * 2.2 + Math.sin(ang + PI / 2) * 1.6;
    return out;
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
          if (e.holder) { if (e.holder.alive === false) { e.t = e.dur; } else holderHand(e, e); e.h = e.holder === N.player ? 4.2 : 3.4; }
          e.acc += dt * (PHONE() ? 22 : 46);
          while (e.acc >= 1) { e.acc -= 1; const a = rnd() * TAU, s = rr(8, 18); spark(e.x, e.y, e.h, Math.cos(a) * s, Math.sin(a) * s, rr(-6, 10), rr(0.25, 0.55), rnd() < 0.7 ? 8 : 5, 0.75, 1); }
          e.sndT -= dt; if (e.sndT <= 0 && near < 160) { e.sndT = 1.3; sfxAt('dw_sparkler', e.x, e.y, 0.6); }
          break;
        }
        case 'bomb': case 'bottle': {
          if (rnd() < dt * 22) spark(e.x, e.y, 0.8, rr(-6, 6), rr(-6, 6), rr(4, 10), rr(0.15, 0.3), 6, 0.7, 4); // the fuse fizz
          break;
        }
        default: break;
      }
      if (e.t >= e.dur) {
        EMIT.splice(i, 1);
        if (e.kind === 'bomb') bang(e.x, e.y, e.big || 1);
        else if (e.kind === 'bottle') { const r = rocket(e.x, e.y, Object.assign({ h: 3, force: true }, e.rocket || {})); if (e.onLaunch) { try { e.onLaunch(r); } catch (er) { N.err('diwali.bottle', er); } } }
        else if (e.kind === 'anaar' || e.kind === 'chakri') { scatter(e.x, e.y, 3, { burnt: true, spread: 3 }); }
        if (e.onEnd) { try { e.onEnd(e); } catch (er) { N.err('diwali.emit', er); } }
      }
    }
  }
  /** a bijli / laxmi bomb going off: flash, smoke puff, red paper scatter, the dogs run */
  function bang(x, y, big) {
    big = big || 1;
    STATS.bombs++;
    flash(x, y, 2, '#fff4d0', 120 * big, 0.25, 1.4);
    for (let i = 0; i < 18; i++) { const a = rnd() * TAU, s = rr(30, 70); spark(x, y, 1, Math.cos(a) * s, Math.sin(a) * s, rr(10, 40), rr(0.15, 0.4), pick([5, 8, 0]), 1, 4); }
    for (let i = 0; i < 4; i++) smoke(x + rr(-3, 3), y + rr(-3, 3), 2, rr(4, 7) * big, rr(5, 8), 0.42, rr(3, 6));
    scatter(x, y, Math.round(22 * big), { spread: 1 });
    sfxAt('dw_bomb', x, y, Math.min(1.3, 0.8 * big));
    onBang(x, y, big);
  }
  /** animals and birds react to a bang */
  function onBang(x, y, power) {
    const T = N.traffic, R0 = TUNE.bangScare * Math.sqrt(power || 1);
    try {
      if (T && T.animals) for (const a of T.animals) {
        if (!a.alive) continue;
        const d = Math.hypot(a.x - x, a.y - y);
        if (d > R0) continue;
        if (a.species === 'dog' && !(a.fedT > 0) && !(a.dwHide > 0)) scareDog(a, x, y);
        else if (a.species === 'cow' && T.wakeCow) T.wakeCow(a, rr(0.2, 0.7));
      }
      if (T && T.scarePigeons) T.scarePigeons(x, y, 120);
      if (N.birds && N.birds.scare) N.birds.scare(x, y, 160);
    } catch (e) { N.err('diwali.scare', e); }
    for (const d of DOGS) if (d.alive && Math.hypot(d.x - x, d.y - y) < R0 && d.onBang) d.onBang(x, y);
  }
  /** a traffic dog runs off from (x, y) and hides by a wall for a while (traffic.js "[diwali hook]") */
  function scareDog(a, x, y) {
    const ang = Math.atan2(a.y - y, a.x - x);
    let spot = null;
    for (let k = 0; k < 8 && !spot; k++) {
      const an = ang + (k % 2 ? 1 : -1) * k * 0.35, dd = rr(55, 95);
      const tx = a.x + Math.cos(an) * dd, ty = a.y + Math.sin(an) * dd;
      if (!N.world.isWalkable(tx, ty)) continue;
      if (N.world.surfaceAt(tx, ty) === N.SURF.ROAD) continue;
      spot = { x: tx, y: ty };
    }
    if (!spot) spot = N.world.findFree ? N.world.findFree(a.x - Math.cos(ang) * -60, a.y - Math.sin(ang) * -60, 'walk', 20) : null;
    if (!spot) return;
    a.dwHide = rr(35, 60); a.dwSpot = spot; a.dwWhT = rr(1, 4);
    STATS.scared++;
  }
  /** traffic.js asks this for a dog with dwHide > 0 (return true = handled this step) */
  function dogHide(a, dt, step) {
    a.dwHide -= dt;
    if (a.dwHide <= 0 || !a.dwSpot) { a.dwHide = 0; a.state = 'wander'; a.goal = null; return false; }
    const d = Math.hypot(a.dwSpot.x - a.x, a.dwSpot.y - a.y);
    if (d > 4) { a.state = 'wander'; step(a, a.dwSpot.x, a.dwSpot.y, d > 30 ? 92 : 45, dt); }
    else { a.vx = a.vy = 0; a.state = 'nap'; a.dwWhT -= dt; if (a.dwWhT <= 0) { a.dwWhT = rr(4, 9); sfxAt('dw_whimper', a.x, a.y, 0.5); } }
    return true;
  }
