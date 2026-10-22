/* NOSTALGIA — citylife_events.js  (owner: city-life events developer) — design/atmosphere.md "City-life
 * scenes" (binding: the dynamic / moving ones), places_registry.md (2003, fictional film titles, no brands,
 * no phones), ARCHITECTURE §6 (layer queue), §8, §17 (N.audio.ext), §20 (3D registries), §21 (N.models3d).
 *
 * Six kinds of moving city-life scene, each a data-driven rule set (district / landmark, time of day, day of
 * week, season, weather) with an activation radius around the player, pooled actors and a debug force():
 *   junction   3. traffic chaos at the big junctions (Abids, Koti, RTC X Roads, Panjagutta, Chaderghat,
 *              the Charminar approach, Basheerbagh, Malakpet): peak-hour jams of real vehicles queued on every
 *              arm (left-hand lanes), honk storms, the havaldar on his podium (traffic.js's constable where the
 *              junction has a podium, our own on a painted podium elsewhere) whistling and waving one arm through
 *              at a time, an auto squeezing through, a cow sitting in the middle, a stalled bus pushed by
 *              passengers (it coughs into life), a lorry reversing with its helper ("aane do... aane do"),
 *              two-wheelers climbing the footpath, pedestrians weaving between bumpers, dust and exhaust haze.
 *              Jams build, churn (the green arm drains, new vehicles arrive at the back) and clear.
 *   colony_am  5. colony mornings 06:00-09:00 on a real colony lane: muggulu drawn at doorsteps (the pattern
 *              stays on the ground for the rest of the day), the milkman's cycle with cans and bell, the paper
 *              boy tossing papers (they stay at the doors), aunties chatting at the gates, the school auto
 *              packed with kids and bags (school days), the summer water tanker with its queue of plastic pots.
 *   colony_pm  6. colony evenings 17:30-21:00: gully cricket on the lane (bowled! "OUT!", the ball into a
 *              house and the aunty throwing it back; Chinnu can join through the cricket minigame), uncles on
 *              plastic chairs, and when the power goes (N.flags.power_cut from story.js, or forced) everyone
 *              comes out with hand fans and candles while one house's inverter hums; "Current vachindi!".
 *   oldcity    8. Old City bustle (Charminar, Laad Bazaar, Gulzar Houz, Pathergatti): buffalo herds crossing
 *              with their herder, bangle sellers calling, the attar seller, handcarts, a narrow-lane jam of
 *              honking two-wheelers, pigeons rising, hawkers around Charminar. Calm (no calls, no horns, no
 *              pigeon scaring) near Mecca Masjid and during prayer times (Jumma on Fridays).
 *   cinema     10. cinema release day (Fridays) at the RTC X Roads halls and the other cinemas: teenmaar
 *              drummers, a garlanded cut-out of a FICTIONAL star (fictional titles), fans dancing, petals and
 *              confetti, the ticket-counter crush (comic) and the HOUSE FULL board. Off while story mission M3
 *              first_day_first_show runs (everything near RTC X Roads stays out of its way).
 *   baraat     11. a wedding baraat at night (Fri-Sun in the wedding months, no rain): tube-light bearers, the
 *              brass band, dancing relatives (no alcohol), the groom on a white horse with his sehra, the
 *              generator trolley, traffic stopped behind and honking; it walks along a real road and ends at a
 *              function hall gate lit with bulbs.
 *
 * Crowd members are pooled 'ped' entities (2D: N.traffic.blitPerson with N.traffic.makeLook looks + small
 * overlays; 3D: view3d_actors draws them: sitting on stools, the constable wave (dancers, helpers), dappu
 * drummers, pots on the head); animals are 'animal' entities (cows / buffalo = the cow model with a dark
 * coat; the horse has its own actor renderer); vehicles are real N.vehicles (noEnter) with our controller.
 * Props: one batched 2D pass per scene (+ y-sorted tall props), 3D = a few InstancedMeshes shared by all
 * scenes + per-scene merged meshes (podium, stalls, cut-out, tanker, gate) and two Points layers (haze,
 * glows / sparks). N.models3d.has('<id>') models are used for props when the Blender pipeline ships them.
 *
 * ------------------------------------------------------------------ API  N.citylifeEvents (also
 * N.citylife.events when citylife.js defines N.citylife)
 *   enabled (false: release everything)   TUNE   KINDS   sites   LINES
 *   force(id | kind | null, {level, keep, power, phase})   pin a site (or the nearest site of a kind) on
 *   active() -> [{id, kind, level, persons, vehicles, animals, phase}]   site(id)   scene(id)   nearest(kind, x, y)
 *   stats() -> {sites, active, persons, vehicles, animals, particles, ms, msAvg, ms2d, ms3d, pool, ...}
 *   setOptions({sounds, barks, particles})   reset()
 * Events: 'citylife:scene' {id, kind, on}, 'citylife:beat' {id, kind, beat}.
 *
 * ------------------------------------------------------------------ HOOKS (files this module does not own)
 *  - traffic.js (documented API only): makeLook / blitPerson (looks + cached sprites), closeRoads(id, {x, y, r})
 *    while a jam / herd / baraat holds the road (ambient traffic routes round it instead of ploughing into
 *    our queues), scarePigeons(x, y, r), constables / world.podiums (the podium constable whistles at Chinnu
 *    on a cycle), N.vehicles.spawn / remove for the jam vehicles (driver looks, noEnter).
 *  - streetfood.js: nothing is shared at runtime: its scene director is food-cart shaped (crowd rings round
 *    a vendor); these scenes are moving formations, so this file has its own small director. We avoid its
 *    spots (no city-life scene is placed within 30 u of a food spot).
 *  - story.js: reads N.flags.power_cut (never writes it); N.missions.active (M3) to stay out of the way.
 *  - minigames.js: 'Join gully cricket' -> N.minigames.play('cricket', {difficulty}) when it exists.
 *  - view3d.js: registerLayer('citylife_events'), registerActorRenderer('cle:horse'), 'cle:block'.
 *  - audio: N.audio.sfx / horn (feature-checked) + N.audio.ext.registerSfx: cle_inverter, cle_band,
 *    cle_teenmaar, cle_reverse.
 *
 * Never trapped: the jam leaves the outbound half and the footpaths open, people step aside, and if Chinnu (on
 * foot or a cycle) pushes against one of our vehicles without moving for ~1 s it drives off (or, wedged, goes).
 * Pooling: people and animals come from pools (released ones walk off and return to them); vehicles are real
 * N.vehicles entities (spawned on activation / arrival, removed out of sight). Lights are pooled objects.
 * Performance (tests/citylife_events.cjs, phone 390x844, three busy scenes on screen): all of this module's
 * per-frame work (director + scene updates + our entities' updates + vehicle controllers + 2D pass or 3D
 * layer) is booked per frame in stats().ms / msAvg; steady state allocates nothing per frame on the hot
 * paths (shared scratch objects, cached option objects, typed-array particles, instanced 3D props).
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
  // [pace] walking speeds here were tuned for the player's old 45 u/s walk; entities.js paceK() = walk now / 45
  const pace = () => (N.player && N.player.paceK ? N.player.paceK() : 1);
  const pick = (a) => a[(rnd() * a.length) | 0];
  const now = () => performance.now();
  const angDiff = (a, b) => { let d = b - a; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; };
  const hashS = (s) => ((U.strHash ? U.strHash(String(s)) : 7) >>> 0) / 4294967296;
  const shade = (hex, f) => { try { return U.shade(hex, f); } catch (e) { return hex; } };
  function wpick(obj) {
    let t = 0; for (const k in obj) if (obj[k] > 0) t += obj[k];
    if (t <= 0) return null;
    let r = rnd() * t;
    for (const k in obj) if (obj[k] > 0) { r -= obj[k]; if (r <= 0) return k; }
    return null;
  }

  /* ================================================================ tuning */
  const TUNE = {
    act2D: 470, act3D: 540, releasePad: 220, dirEvery: 0.5,
    maxActive: { desk: 4, low: 3 },
    persons: { desk: 70, low: 46 }, vehicles: { desk: 20, low: 13 },
    barkR: 240, barkGap: 1.1, sfxR: 560, personal: 9,
    particles: true, sounds: true, barks: true,
    hornBudget: 4,
  };

  /* ================================================================ clock / calendar / weather */
  const mins = () => (N.clock && isFinite(N.clock.minutes) ? N.clock.minutes : 720);
  const dayN = () => (N.clock && N.clock.day) || 0;
  const simT = () => (N.time && N.time.now) || 0;
  const realT = () => (N.time && N.time.real) || now() / 1000;
  function calDate() { try { const d = N.calendar && N.calendar.date; if (d && isFinite(d.m)) return d; } catch (e) { /* stub */ } return null; }
  function dow() {
    const d = calDate(); if (d && isFinite(d.dow)) return d.dow;
    const b = (N.clock && N.clock.baseDate) || [2003, 0, 14];
    return new Date(Date.UTC(b[0], b[1], b[2] + dayN())).getUTCDay();
  }
  function month() { const d = calDate(); if (d) return d.m; const b = (N.clock && N.clock.baseDate) || [2003, 0, 14]; return new Date(Date.UTC(b[0], b[1], b[2] + dayN())).getUTCMonth() + 1; }
  function season(n) {
    try { if (N.seasons && typeof N.seasons.is === 'function') return !!N.seasons.is(n); } catch (e) { /* stub */ }
    return !!(N.flags && N.flags[n]);
  }
  function schoolDay() {
    try { if (N.calendar && N.calendar.isSchoolDay) return !!N.calendar.isSchoolDay(); } catch (e) { /* stub */ }
    const w = dow(); return w !== 0 && !season('summer');
  }
  function rainLevel() {
    const W = N.weather;
    if (W && isFinite(W.rain)) return clamp(W.rain, 0, 1);
    if (season('rain') || (N.flags && (N.flags.raining || N.flags.rain === true))) return 0.7;
    return 0;
  }
  const is3D = () => !!(N.view3d && N.view3d.active);
  function lowTier() {
    try { const q = N.view3d && N.view3d.quality; if (q && q.tier) return q.tier === 'low'; } catch (e) { /* stub */ }
    try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
  }
  const tier = () => (lowTier() ? 'low' : 'desk');
  // approximate Hyderabad prayer windows (minutes) + Jumma on Fridays: the Old City scenes go quiet
  const PRAYER = [[300, 340], [785, 825], [1000, 1035], [1090, 1120], [1180, 1215]];
  function prayerTime(m, fri) { for (const p of PRAYER) if (m >= p[0] && m < p[1]) return true; return !!fri && m >= 770 && m < 860; }
  function m3Active() {
    try {
      const a = N.missions && N.missions.active;
      const id = a && (a.id || (a.def && a.def.id));
      return id === 'first_day_first_show';
    } catch (e) { return false; }
  }
  const WED_MONTHS = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 8: 1, 11: 1, 12: 1 };
  /** the shared rule context, refreshed by the director */
  const CX = { m: 720, dow: 2, mon: 1, rain: 0, summer: false, school: true, wedding: false, ramzan: false, power: false, night: false, prayer: false, fri: false, weekend: false, m3: false, light: 1 };
  function refreshCtx() {
    CX.m = mins(); CX.dow = dow(); CX.mon = month(); CX.rain = rainLevel();
    CX.summer = season('summer'); CX.ramzan = season('ramzan'); CX.school = schoolDay();
    CX.fri = CX.dow === 5; CX.weekend = CX.dow === 5 || CX.dow === 6 || CX.dow === 0;
    CX.wedding = !!WED_MONTHS[CX.mon] && !CX.ramzan;
    CX.power = !!(N.flags && N.flags.power_cut);
    CX.light = N.clock && N.clock.light ? N.clock.light() : 1;
    CX.night = CX.light < 0.3;
    CX.prayer = prayerTime(CX.m, CX.fri);
    CX.m3 = m3Active();
  }
  /** level from time spans [[from, to, level]] (minutes; 25 min ramps outside each span) */
  function peak(m, spans) {
    let best = 0;
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i], a = s[0], b = s[1];
      const f = m >= a && m <= b ? 1 : m < a ? 1 - (a - m) / 25 : 1 - (m - b) / 25;
      if (f > 0 && s[2] * f > best) best = s[2] * f;
    }
    return best;
  }

  /* ================================================================ sound + barks */
  let SFXN = null;
  function hasSfx(name) {
    const A = N.audio;
    if (!A || !A.sfx) return false;
    if (!SFXN || SFXN.size < 20) { try { SFXN = new Set(A.SFX_NAMES || []); } catch (e) { SFXN = null; } }
    return !SFXN || !SFXN.size || SFXN.has(name);
  }
  const SFXT = new Map();
  function sfx(name, x, y, o) {
    if (!TUNE.sounds || !hasSfx(name)) return false;
    const pl = N.player;
    if (x != null && Math.hypot(x - pl.x, y - pl.y) > TUNE.sfxR) return false;
    const t = realT(), gap = (o && o.gap) || 0.15;
    if (t - (SFXT.get(name) || -9) < gap) return false;
    SFXT.set(name, t);
    try { return N.audio.sfx(name, Object.assign({ x, y, vol: 0.55 }, o || {})); } catch (e) { return false; }
  }
  const HORNLOG = [];
  function honk(v, dur) {
    if (!v || !v.alive || !TUNE.sounds) return false;
    const t = realT();
    while (HORNLOG.length && t - HORNLOG[0] > 2) HORNLOG.shift();
    if (HORNLOG.length >= TUNE.hornBudget) return false;
    const pl = N.player;
    if (Math.hypot(v.x - pl.x, v.y - pl.y) > TUNE.sfxR) return false;
    HORNLOG.push(t);
    if (v.cle) v.cle.honkT = 0.45;
    ST.honks++;
    try { if (N.audio && N.audio.horn) N.audio.horn(v, { x: v.x, y: v.y, dur: dur || (v.T && v.T.cls === 'bike' ? 0.2 : rr(0.25, 0.55)) }); } catch (e) { /* audio is optional */ }
    return true;
  }
  let barkT = 0;
  function bark(e, text, o) {
    if (!TUNE.barks || !text || !e || !N.dialogue || !N.dialogue.bark) return false;
    const t = realT(), pl = N.player;
    if (!(o && o.force) && t - barkT < TUNE.barkGap) return false;
    if (Math.hypot(e.x - pl.x, e.y - pl.y) > TUNE.barkR) return false;
    if (!is3D() && !N.render.inView(e.x, e.y, 10)) return false;
    try { N.dialogue.bark(e, text, { name: false, blip: false, secs: (o && o.secs) || 2.4 }); } catch (err) { N.err('citylife.bark', err); return false; }
    barkT = t; ST.barks++;
    return true;
  }
  // Hyderabadi street talk (Telugu / Dakhni / English mix), kid-friendly: no politics, no swearing
  const LINES = {
    havaldar: ['Aage badho! Aage!', 'Ruko, ruko! Side lo!', 'Ey auto! Line lo ra!', 'Bus wala, jaldi chalo!', 'Horn band karo, bhai!', 'Signal chudandi!'],
    havaldarKid: ['Ey chotu! Cycle side lo, side!', 'Pilla, footpath meeda vellu!', 'Chinna, jagratha! Signal chudu!'],
    jam: ['Arre bhai, chalo na!', 'Office ki late ayipoyindi!', 'Emi traffic ra baabu!', 'Kya traffic hai yaar!', 'Ee signal eppudu green?'],
    push: ['Dhakka maaro! Haan!', 'Inkoncham! Inkoncham!', 'Ek, do, teen... zor se!', 'Battery down, bhai.'],
    pushDone: ['Chal gaya! Chal gaya!', 'Start ayyindi!', 'Shabash!'],
    lorry: ['Aane do... aane do... aane do...', 'Ruko! Bas, bas!', 'Left kaatu, left!', 'Thoda peeche!'],
    footpath: ['Footpath pe gaadi?!', 'Arey, nadavadaniki dari ledu!', 'Footpath nadavadaniki ra!'],
    weave: ['Side, side!', 'Excuse me, uncle!', 'Jaane do, jaane do!'],
    cow: ['Gomata, side ivvu amma...', 'Arey, aavu kuchundi!', 'Gaay ko kuch mat bolo.'],
    milk: ['Paalu! Paalu!', 'Amma, paalu vachayi!'],
    milkAunty: ['Ninna paalu palchaga unnayi, anna.', 'Rendu litres, anna.', 'Repu konchem ekkuva.'],
    paper: ['Paper!', 'Paper vachindi!'],
    gossip: ['Mee abbayi results vachaya?', 'Tomatoes rate perigindi!', 'Ninna serial chusara?', 'Ivala neellu vastaya?', 'Maa intlo ivala pappu charu.', 'Pellichoopulu ani vinnanu!'],
    muggu: ['Sankranti ki inka pedda muggu!', 'Ee chukkala muggu chudu.'],
    school: ['Auto vachindi! Bag teesko!', 'Tiffin box marchipoyav!', 'Jaldi, auto uncle velipothadu!'],
    tanker: ['Line lo raa!', 'Naa bindhe mundu undi!', 'Tanker vachindi! Tanker!', 'Okka bindhe ey, akka!'],
    cricket: ['Bowling!', 'Run! Run!', 'Catch it!', 'Wide ball, ra!', 'Last ball, last ball!', 'Four!'],
    out: ['OUT! OUT!', 'Clean bowled!', 'Howzat!', 'Out ra, vellu!'],
    lost: ['Ball intlo padindi!', 'Aunty, ball ivvandi please!', 'Evadu kottadu ra?!'],
    back: ['Inkosari intloki kotte, ball ivvanu!', 'Jagratha ga aadandi!'],
    invite: ['Chinnu! Aaja, ek over!', 'Rara, nuvvu batting!'],
    uncles: ['Ee saari India World Cup kodutundi.', 'Petrol rate chusava?', 'Maa rojullo...', 'Raghav century kodatadu chudu.', 'Ivala chaala ukkapotha.'],
    power: ['Current poyindi!', 'Inverter on cheyyi!', 'Kovvotthi ekkada?', 'Abba, ukkapotha!', 'Mallee current poyindi!'],
    powerBack: ['Current vachindi!', 'Hammayya!'],
    bangles: ['Choodiyan! Choodiyan le lo!', 'Laad Bazaar ki asli choodiyan!', 'Aao behen, dekh lo!', 'Shaadi ke liye seedha yahan!'],
    attar: ['Attar, attar! Gulab, mogra, khus!', 'Ek baar sungh ke dekho!', 'Asli attar, miya!'],
    herder: ['Hatto! Hatto!', 'Bhains aa rahi hai, side!', 'Chal, chal!'],
    hawker: ['Moti le lo! Asli moti!', 'Khilone! Khilone!', 'Pista! Badam!', 'Charminar ka photo frame!'],
    lanejam: ['Arre miya, aage badho na!', 'Kaiku horn bajare?', 'Thoda side lo, bhai!', 'Hau, hau, aate!'],
    cinema: ['Jai Toofan! Jai Toofan!', 'Boss is back!', 'First day first show, mama!', 'Mass ra idhi!', 'Cut-out ki dandalu!'],
    counter: ['Line lo ra!', 'Okka ticket, anna!', 'Thosaku!', 'Naa kaalu! Naa kaalu!', 'Balcony ivvandi!'],
    ticket: ['Dorikindi! Ticket dorikindi!', 'Ticket mila!'],
    housefull: ['House full!', 'Aiyyo, house full!', 'Next show ki raa!'],
    baraat: ['Aao beta, naacho!', 'Dulha aa raha hai!', 'Band baaja baarat!', 'Side lo, baraat vastundi!'],
    baraatHushPrayer: ['Band roko, namaaz ka waqt hai.', 'Aahista, azaan ho rahi hai.', 'Band aapandi, namaaz time.'],
    baraatHush: ['Band roko, thodi der.', 'Band aapandi, konchem.', 'Bas, chup chaap chalo thodi der.'],
    baraatTraffic: ['Shaadi hai bhai, thoda ruko!', 'Kitni der lagegi?', 'Baraat ra, emi cheyyagalam.'],
    step: ['Side, chinna!', 'Arre, dekh ke!', 'Jagratha!', 'Aaram se, beta.'],
  };
  const line = (k) => pick(LINES[k] || LINES.step);

  // custom synthesised sounds through the documented extension API (feature-checked; nothing breaks without)
  let audioReg = false;
  function registerAudio() {
    const X = N.audio && N.audio.ext;
    if (audioReg || !X || !X.registerSfx || !X.P || !X.P.tone || !X.P.burst) return;
    audioReg = true;
    const P = X.P;
    try {
      X.registerSfx('cle_inverter', (ac, out, t) => {
        P.tone(ac, out, t, { type: 'sawtooth', f: 100, a: 0.25, h: 1.25, r: 0.3, v: 0.035 });
        P.tone(ac, out, t, { type: 'sine', f: 50, a: 0.25, h: 1.25, r: 0.3, v: 0.07 });
        return P.tone(ac, out, t, { type: 'sine', f: 6200, a: 0.3, h: 1.1, r: 0.3, v: 0.006 });
      }, { cooldown: 0.6, gain: 0.7 });
      X.registerSfx('cle_teenmaar', (ac, out, t) => { // the teenmaar 3-3-2: big dappu strokes + rim taps
        let end = t;
        const S = [[0, 1], [0.21, 0.45], [0.42, 0.55], [0.63, 1], [0.84, 0.45], [1.05, 0.55], [1.26, 1], [1.5, 0.9], [1.68, 0.5]];
        for (const s of S) {
          const tt = t + s[0];
          P.tone(ac, out, tt, { type: 'sine', f: 150, f2: 70, glide: 0.09, a: 0.002, r: 0.16, v: 0.55 * s[1] });
          end = Math.max(end, P.burst(ac, out, tt, { f: s[1] > 0.8 ? 420 : 1900, q: 1.2, a: 0.001, r: 0.07, v: 0.4 * s[1] }));
        }
        return end;
      }, { cooldown: 1.2, gain: 0.8 });
      X.registerSfx('cle_band', (ac, out, t) => { // a brass-band phrase: two trumpets in thirds, a tuba, a snare
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(out);
        const mel = [67, 69, 71, 72, 71, 69, 67, 64, 67, 71, 74, 72];
        let end = t;
        const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
        for (let i = 0; i < mel.length; i++) {
          const tt = t + i * 0.19, d = i === mel.length - 1 ? 0.3 : 0.13;
          P.tone(ac, lp, tt, { type: 'sawtooth', f: mtof(mel[i]), a: 0.02, h: d, r: 0.06, v: 0.11, vib: [6, 4] });
          P.tone(ac, lp, tt, { type: 'sawtooth', f: mtof(mel[i] - 4), a: 0.02, h: d, r: 0.06, v: 0.07 });
          if (i % 2 === 0) P.tone(ac, out, tt, { type: 'triangle', f: mtof(mel[i] - 24), a: 0.01, h: 0.12, r: 0.08, v: 0.2 });
          end = Math.max(end, P.burst(ac, out, tt + 0.095, { f: 2400, q: 0.8, a: 0.001, r: 0.05, v: 0.12 }));
        }
        return end + 0.2;
      }, { cooldown: 1.6, gain: 0.75 });
      X.registerSfx('cle_reverse', (ac, out, t) => { // the lorry's reverse horn tune
        let end = t;
        for (let i = 0; i < 4; i++) end = P.tone(ac, out, t + i * 0.32, { type: 'square', f: i % 2 ? 660 : 880, a: 0.005, h: 0.17, r: 0.04, v: 0.08 });
        return end;
      }, { cooldown: 1, gain: 0.6 });
      SFXN = null;
    } catch (e) { N.err('citylife.audio', e); }
  }

  /* ================================================================ stats */
  const ACC = { ent: 0, drw: 0, veh: 0 }; // per-frame cost of our entities' update / 2D draw / vehicle controllers
  const ST = { ms: 0, msAvg: 0, ms2d: 0, ms3d: 0, msUpd: 0, frames: 0, activations: 0, barks: 0, honks: 0, spawnedP: 0, spawnedV: 0, beats: 0, unstuck: 0, lights: 0, sfxLoops: 0 };

  /* ================================================================ geometry: road arms and paths */
  const RD = () => (N.world && N.world.roads) || null;
  function styleAt(x, y) { try { const d = N.world.districtAt(x, y); if (!d) return 'colony'; if (d.id === 'osmania') return 'osmania'; return d.style || 'colony'; } catch (e) { return 'colony'; } }
  function districtOf(x, y) { try { const d = N.world.districtAt(x, y); return d ? (d.id || String(d)) : ''; } catch (e) { return ''; } }
  function footW(kind) { const F = N.world && N.world.FOOT; return (F && F[kind]) || 0; }
  /* ---- siting rules shared by the colony lanes and the baraat routes (build time only).
     Places of worship stay calm: no gully cricket, band or dancing beside a mosque, temple, church,
     dargah or gurudwara (N.respect, minus the dynamic 'procession' zones). A colony lane is also kept
     off station forecourts, bus termini and markets: those are commercial, not residential. */
  let WZ = null, BUSY = null;
  function worshipZones() {
    if (WZ) return WZ;
    WZ = [];
    try { const all = N.respect && N.respect.zones; if (all) for (const z of all) if (z && z.kind !== 'procession') WZ.push(z); } catch (e) { WZ = []; }
    return WZ;
  }
  /** the distance from (x, y) to the nearest place of worship (capped at lim) */
  function worshipDist(x, y, lim) {
    const Z = worshipZones(), Rs = N.respect;
    let best = lim;
    for (const z of Z) {
      const b = z.bb;
      if (b && (x < b[0] - best || y < b[1] - best || x > b[2] + best || y > b[3] + best)) continue;
      let d = best;
      try { d = Rs.distance(x, y, z); } catch (e) { d = best; }
      if (d < best) best = d;
    }
    return best;
  }
  const BUSY_DRAW = { railway_station: 120, halt_station: 120, bus_terminus: 120, mgbs: 120, cbs_hangar: 120, market_hall: 120, mozamjahi_market: 120, rythu_bazaar: 120, numaish_gate: 120, airport_terminal: 120, bus_stop: 45 };
  const BUSY_PLACE = { market: 120, transport: 120 };
  function busyList() {
    if (BUSY) return BUSY;
    BUSY = [];
    const D = N.WORLD_DATA || {};
    for (const l of D.landmarks || []) { const r = BUSY_DRAW[l.draw]; if (r && isFinite(l.x)) BUSY.push({ x: l.x, y: l.y, hw: (l.w || 0) / 2, hd: (l.d || 0) / 2, r, id: l.id }); }
    for (const p of D.places || []) { const r = BUSY_PLACE[p.kind]; if (r && isFinite(p.x)) BUSY.push({ x: p.x, y: p.y, hw: p.r || 0, hd: p.r || 0, r, id: p.id }); }
    return BUSY;
  }
  /** the busy (commercial / transport) spot within its exclusion radius of (x, y), or null */
  function busyAt(x, y) {
    for (const b of busyList()) {
      const dx = Math.max(Math.abs(x - b.x) - b.hw, 0), dy = Math.max(Math.abs(y - b.y) - b.hd, 0);
      if (dx < b.r && dy < b.r && dx * dx + dy * dy < b.r * b.r) return b;
    }
    return null;
  }
  /** does a whole path (and optional extra points) keep clear: worship farther than wR, busy spots outside their radius */
  function pathClear(path, wR, busy, extra) {
    const step = 12;
    for (let d = 0; d <= path.len; d += step) {
      const q = at(path, d, 0, PT2);
      if (worshipDist(q.x, q.y, wR) < wR) return false;
      if (busy && busyAt(q.x, q.y)) return false;
    }
    if (extra) for (const e of extra) { if (worshipDist(e.x, e.y, wR) < wR) return false; if (busy && busyAt(e.x, e.y)) return false; }
    return true;
  }
  /** a polyline [x0, y0, x1, y1, ...] with cumulative lengths */
  function mkPath(pts, o) {
    const n = pts.length / 2, cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
    return Object.assign({ pts, cum, len: n > 1 ? cum[n - 1] : 0 }, o || {});
  }
  const PT = { x: 0, y: 0, ux: 1, uy: 0 }, PT2 = { x: 0, y: 0, ux: 1, uy: 0 };
  /** the point at distance d along a path, off units to its LEFT ((uy, -ux) is the left normal: +y is south) */
  function at(path, d, off, out) {
    out = out || PT;
    const P = path.pts, C = path.cum, n = C.length;
    if (n < 2) { out.x = P[0]; out.y = P[1]; out.ux = 1; out.uy = 0; return out; }
    d = clamp(d, 0, path.len);
    let i = 1; while (i < n - 1 && C[i] < d) i++;
    const s0 = C[i - 1], L = (C[i] - s0) || 1, t = clamp((d - s0) / L, 0, 1);
    const x0 = P[i * 2 - 2], y0 = P[i * 2 - 1], x1 = P[i * 2], y1 = P[i * 2 + 1];
    const ux = (x1 - x0) / L, uy = (y1 - y0) / L, o = off || 0;
    out.x = x0 + (x1 - x0) * t + uy * o; out.y = y0 + (y1 - y0) * t - ux * o; out.ux = ux; out.uy = uy;
    return out;
  }
  /** distance along a path of the point nearest (x, y) (coarse: per vertex + segment projection) */
  function along(path, x, y) {
    const P = path.pts, C = path.cum, n = C.length;
    let best = 0, bd = 1e18;
    for (let i = 1; i < n; i++) {
      const q = U.closestOnSeg(x, y, P[i * 2 - 2], P[i * 2 - 1], P[i * 2], P[i * 2 + 1]);
      if (q.d2 < bd) { bd = q.d2; best = C[i - 1] + (C[i] - C[i - 1]) * q.t; }
    }
    return best;
  }
  /** the roads leaving junction node n, each walked outwards (straightest continuation) up to L units */
  function armsOf(n, L, maxArms) {
    const R = RD(); const out = [];
    if (!R || !n) return out;
    for (const eid of n.inc) {
      const e = R.edges[eid]; if (!e || e.kind === 'path') continue;
      let prev = n, cur = R.nodes[e.a === n.id ? e.b : e.a];
      if (!cur) continue;
      const pts = [n.x, n.y, cur.x, cur.y];
      let len = Math.hypot(cur.x - n.x, cur.y - n.y), h = Math.atan2(cur.y - n.y, cur.x - n.x);
      const a0 = h;
      for (let g = 0; g < 80 && len < L; g++) {
        let best = null, bd = 0.6;
        for (const id2 of cur.inc) {
          const e2 = R.edges[id2]; if (!e2 || e2.kind === 'path') continue;
          const nx = R.nodes[e2.a === cur.id ? e2.b : e2.a];
          if (!nx || nx === prev) continue;
          const d = Math.abs(angDiff(h, Math.atan2(nx.y - cur.y, nx.x - cur.x)));
          if (d < bd) { bd = d; best = nx; }
        }
        if (!best) break;
        len += Math.hypot(best.x - cur.x, best.y - cur.y);
        h = Math.atan2(best.y - cur.y, best.x - cur.x); prev = cur; cur = best; pts.push(cur.x, cur.y);
      }
      if (len < 30) continue;
      out.push(mkPath(pts, { w: e.w || 20, kind: e.kind, ang: a0 }));
    }
    out.sort((a, b) => b.w - a.w || b.len - a.len);
    const keep = [];
    for (const a of out) { if (keep.some((k) => Math.abs(angDiff(k.ang, a.ang)) < 0.5)) continue; keep.push(a); if (keep.length >= (maxArms || 4)) break; }
    return keep;
  }
  /** a straight-through path along the road at node n: the two most opposite arms joined (far end -> n -> far end) */
  function throughPath(n, L) {
    const arms = armsOf(n, L, 4);
    if (arms.length < 2) return null;
    let A = null, B = null, bd = -1;
    for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) {
      const d = Math.abs(angDiff(arms[i].ang, arms[j].ang));
      if (d > bd) { bd = d; A = arms[i]; B = arms[j]; }
    }
    if (bd < 2.2) return null;
    const pts = [];
    for (let i = A.pts.length / 2 - 1; i >= 0; i--) pts.push(A.pts[i * 2], A.pts[i * 2 + 1]);
    for (let i = 1; i < B.pts.length / 2; i++) pts.push(B.pts[i * 2], B.pts[i * 2 + 1]);
    return mkPath(pts, { w: Math.min(A.w, B.w), kind: A.kind, mid: A.len, arms: [A, B] });
  }
  function nearNode(x, y, r, pred) {
    const R = RD(); if (!R || !R.nearestNode) return null;
    const n = R.nearestNode(x, y, pred);
    return n && Math.hypot(n.x - x, n.y - y) <= r ? n : null;
  }
  const flat = (list) => { const o = []; for (const p of list) o.push(p.x, p.y); return o; };
  const cp = (p) => ({ x: p.x, y: p.y, ux: p.ux, uy: p.uy });
  function walkable(x, y) { try { return N.world.isWalkable(x, y); } catch (e) { return true; } }
  function freeSpot(x, y, cells) {
    if (walkable(x, y)) return { x, y };
    try { const f = N.world.findFree(x, y, 'walk', cells || 3); return f ? { x: f.x, y: f.y } : null; } catch (e) { return null; }
  }
  /** is a point on screen / near the camera (spawning there would pop) */
  function seen(x, y, m) {
    if (is3D()) { const pl = N.player; return Math.hypot(x - pl.x, y - pl.y) < 300; }
    return N.render.inView(x, y, m == null ? 24 : m);
  }

  /* ================================================================ particles (shared by every scene) */
  const PMAX = 320;
  const PK = { DUST: 0, EXH: 1, PETAL: 2, CONF: 3, SPARK: 4, WATER: 5, POWDER: 6 };
  const PCOL = ['#b89a72', '#6a6662', '#f08a1a', '#f2c230', '#e8203a', '#2a8cd8', '#30c050', '#f4f2ea', '#ffd060', '#a8d0ec', '#3a3634', '#f06aa0'];
  const P = { n: 0, x: new Float32Array(PMAX), y: new Float32Array(PMAX), h: new Float32Array(PMAX), vx: new Float32Array(PMAX), vy: new Float32Array(PMAX), vh: new Float32Array(PMAX), t: new Float32Array(PMAX), life: new Float32Array(PMAX), s: new Float32Array(PMAX), k: new Uint8Array(PMAX), c: new Uint8Array(PMAX) };
  function emit(kind, x, y, h, vx, vy, vh, life, size, col) {
    if (!TUNE.particles) return -1;
    let i = P.n;
    if (i >= PMAX) { i = (rnd() * PMAX) | 0; } else P.n++;
    P.x[i] = x; P.y[i] = y; P.h[i] = h; P.vx[i] = vx; P.vy[i] = vy; P.vh[i] = vh; P.t[i] = 0; P.life[i] = life; P.s[i] = size; P.k[i] = kind; P.c[i] = col;
    return i;
  }
  function updateParticles(dt) {
    let i = 0;
    while (i < P.n) {
      P.t[i] += dt;
      if (P.t[i] >= P.life[i]) { const j = --P.n; if (i !== j) { P.x[i] = P.x[j]; P.y[i] = P.y[j]; P.h[i] = P.h[j]; P.vx[i] = P.vx[j]; P.vy[i] = P.vy[j]; P.vh[i] = P.vh[j]; P.t[i] = P.t[j]; P.life[i] = P.life[j]; P.s[i] = P.s[j]; P.k[i] = P.k[j]; P.c[i] = P.c[j]; } continue; }
      const k = P.k[i];
      if (k === PK.DUST || k === PK.EXH) { P.vx[i] *= 1 - dt * 0.8; P.vy[i] *= 1 - dt * 0.8; P.vh[i] *= 1 - dt * 0.5; }
      else if (k === PK.PETAL || k === PK.CONF) { P.vh[i] -= 14 * dt; if (P.vh[i] < -4) P.vh[i] = -4; P.vx[i] *= 1 - dt * 1.4; P.vy[i] *= 1 - dt * 1.4; }
      else { P.vh[i] -= 38 * dt; }
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.h[i] += P.vh[i] * dt;
      if (P.h[i] < 0.1) { P.h[i] = 0.1; P.vh[i] = 0; P.vx[i] *= 0.5; P.vy[i] *= 0.5; if (k === PK.SPARK || k === PK.WATER) P.t[i] = Math.max(P.t[i], P.life[i] - 0.15); }
      i++;
    }
  }
  function puffs(kind, x, y, h, n, spread, col) {
    for (let i = 0; i < n; i++) emit(kind, x + rr(-spread, spread), y + rr(-spread, spread), h + rr(0, 1.5), rr(-4, 4), rr(-4, 4), rr(2, 6), rr(1.4, 2.6), rr(1.6, 3.2), col);
  }

  /* ================================================================ pooled people */
  const PPOOL = [], PERSONS = [];
  const UMB = ['#1a1a22', '#2a2a40', '#7a2a3a', '#2a5a8a', '#3a3a3a'];
  const SIDES = [-1, 1], KIDBAG = ['#2a5cb8', '#b22b2b', '#3a8a3a', '#d8402a'], ATTAR = ['#e8b030', '#c83a5a', '#30a050', '#f4f2ea'], CLOTH = ['#c83a5a', '#2a6ab8', '#f2c230'];
  const LEGS_H = [3.6, 1.5, 3.6, -1.5, -3.4, 1.5, -3.4, -1.5], LEGS_C = [3.8, 2.0, 3.8, -2.0, -3.8, 2.0, -3.8, -2.0], TUBE_O = [-1.2, 1.2], TUBE3 = [-0.7, 0.7];
  class Person extends N.Actor {
    constructor() {
      super({ kind: 'ped', r: 3.2, mass: 1, solid: true });
      this.cle = true; this.amb = true;
      this.anim = { phase: 0, speed: 0, run: false };
      this._fn = (ctx) => { const t0 = now(); drawPerson(ctx, this); ACC.drw += now() - t0; };
    }
    update(dt) { const t0 = now(); try { personUpdate(this, dt); } catch (e) { N.err('citylife.person', e); freePerson(this); } ACC.ent += now() - t0; }
    draw() { if (!is3D() && !this.hidden) N.render.queue('actors', this.y, this._fn); }
    onBump(other, info) {
      if (other !== N.player || !info || this.bumpT > 0) return;
      const sp = info.speed || 0;
      if (sp < 25) return;
      this.bumpT = 1.5;
      const sx = info.a === this ? -info.nx : info.nx, sy = info.a === this ? -info.ny : info.ny;
      if (isFinite(sx)) { this.ofx = clamp(this.ofx + sx * 3, -5, 5); this.ofy = clamp(this.ofy + sy * 3, -5, 5); }
      this.lookAt = N.player; this.lookT = 1.4;
      if (rnd() < 0.5) bark(this, line('step'));
    }
  }
  function lookFor(role, style) {
    const T = N.traffic;
    try { if (T && T.makeLook) { const L = T.makeLook(role, style || 'colony'); if (L && L.look) return L.look; } } catch (e) { /* fall through */ }
    try { if (N.people && N.people.randomLook) return N.people.randomLook(U.rng((rnd() * 1e9) | 0), role === 'aunty' ? 'aunty' : role === 'kid' ? 'kid' : 'man'); } catch (e) { /* stub */ }
    return { kind: role === 'kid' || role === 'student' ? 'kid' : role === 'aunty' ? 'aunty' : 'man', skin: '#a0683f', hair: '#1a1412', shirt: '#e8e0d0', pants: '#3a3a4a' };
  }
  const withProp = (look, prop) => Object.assign({}, look, { prop });
  function newPerson(sc, role, x, y, o) {
    o = o || {};
    if (PERSONS.length >= TUNE.persons[tier()]) return null;
    if (!o.ghost && !walkable(x, y)) { const f = freeSpot(x, y, 4); if (!f) return null; x = f.x; y = f.y; }
    const p = PPOOL.pop() || new Person();
    p.id = 0; p.alive = true; p.hidden = false;
    p.sc = sc; p.role = role; p.x = x; p.y = y; p.vx = 0; p.vy = 0;
    p.angle = o.angle != null ? o.angle : rnd() * TAU; p.facing = p.angle;
    p.look = o.look || lookFor(role, sc ? sc.style : 'colony');
    p.spd = o.spd || rr(30, 42) * pace();
    p.beh = o.beh || 'stand'; p.then = o.then || null; p.tx = x; p.ty = y; p.face = o.face != null ? o.face : null;
    p.path = null; p.pi = 0; p.t = 0; p.item = o.item || null; p.itemCol = o.itemCol || null; p.idle = null; p.bench = false;
    p.constable = false; p.pod = null; p.ofx = 0; p.ofy = 0; p.barkCD = rr(2, 9); p.stuckT = 0; p.tag = o.tag || null;
    p.arrived = false; p.lookAt = null; p.lookT = 0; p.bob = 0; p.bumpT = 0; p.knockT = 0; p.down = false; p.getupT = 0;
    p.solid = !o.ghost; p.noCollide = !!o.ghost; p.seed = (rnd() * 1e6) | 0; p.leaveN = 0; p.chair = o.chair || null; p.v = null; p.slot = null; p.aux = 0;
    p.anim.phase = rnd() * TAU; p.anim.speed = 0; p.anim.run = false;
    p.umb = CX.rain > 0.3 && !o.item && rnd() < 0.65 ? pick(UMB) : null; // umbrellas in the rain (3D draws e.umb too)
    N.entities.add(p);
    PERSONS.push(p); if (sc) sc.persons.push(p);
    ST.spawnedP++;
    return p;
  }
  function freePerson(p) {
    if (!p) return;
    const sc = p.sc;
    if (sc) { const i = sc.persons.indexOf(p); if (i >= 0) sc.persons.splice(i, 1); }
    const j = PERSONS.indexOf(p); if (j >= 0) PERSONS.splice(j, 1);
    if (p.alive) N.entities.remove(p);
    p.alive = false; p.sc = null; p.pod = null; p.path = null; p.lookAt = null; p.v = null; p.slot = null; p.constable = false; p.idle = null;
    if (PPOOL.length < 90) PPOOL.push(p);
  }
  function setPath(p, pts, then, spd) { p.path = pts; p.pi = 0; p.beh = 'path'; p.then = then || 'stand'; p.arrived = false; if (spd) p.spd = spd; }
  function goTo(p, x, y, then, spd) { p.tx = x; p.ty = y; p.beh = 'goto'; p.then = then || 'stand'; p.arrived = false; if (spd) p.spd = spd; }
  /** walk off and vanish out of sight: towards (x, y), extended while still seen */
  function leave(p, x, y) { p.tx = x; p.ty = y; p.beh = 'leave'; p.leaveN = 0; p.constable = false; p.idle = null; p.pod = null; }
  /** go in at a door (a house, the hall, the auto): vanish on arrival even if seen */
  function goIn(p, x, y) { p.tx = x; p.ty = y; p.beh = 'in'; p.constable = false; p.idle = null; }

  function integrate(p, dt) {
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    if (p.noCollide) { p.x = nx; p.y = ny; }
    else {
      const c = N.world.collide(nx, ny, p.r, 'walk');
      if (!c.bad) {
        if (c.hit && isFinite(c.nx)) { const dot = p.vx * c.nx + p.vy * c.ny; if (dot < 0) { p.vx -= dot * c.nx; p.vy -= dot * c.ny; } }
        p.x = c.x; p.y = c.y;
      }
    }
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 3 && !(p.lookT > 0)) p.angle += angDiff(p.angle, Math.atan2(p.vy, p.vx)) * Math.min(1, dt * 10);
    p.anim.speed = Math.min(1, sp / 45); p.anim.run = sp > 62;
    p.anim.phase += sp * dt * 0.26;
    return sp;
  }
  function walkTo(p, tx, ty, speed, dt, arrive) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    let vx = 0, vy = 0;
    if (d > (arrive || 1)) { const s = Math.min(speed, d * 4); vx = (dx / d) * s; vy = (dy / d) * s; }
    if (p.detT > 0) { p.detT -= dt; vx = vx * 0.3 + p.detX * speed * 0.8; vy = vy * 0.3 + p.detY * speed * 0.8; }
    // look where they walk: sidestep people, animals and vehicles, keep left, slow behind (entities.js E.steer)
    else if (p.solid && N.entities.steer) { const S = N.entities.steer(p, vx, vy, dt, { arrive: d }); vx = S.x; vy = S.y; }
    const a = 1 - Math.exp(-dt * 8);
    p.vx += (vx - p.vx) * a; p.vy += (vy - p.vy) * a;
    const sp = integrate(p, dt);
    if (d > 3 && sp < 4 && speed > 5) {
      p.stuckT += dt;
      if (p.stuckT > 1.0) { p.stuckT = 0; p.detT = 0.6; const s = rnd() < 0.5 ? 1 : -1; p.detX = (-dy / d) * s; p.detY = (dx / d) * s; }
    } else p.stuckT = 0;
    return d;
  }
  function stand(p, face, dt) {
    p.vx *= 0.7; p.vy *= 0.7;
    integrate(p, dt);
    if (face != null && isFinite(face)) p.angle += angDiff(p.angle, face) * Math.min(1, dt * 4);
    p.anim.speed = 0;
  }
  function holdAt(p, x, y, face, dt) {
    const tx = x + p.ofx, ty = y + p.ofy;
    if (Math.hypot(tx - p.x, ty - p.y) > 1.6) walkTo(p, tx, ty, p.spd * 0.6, dt, 0.8);
    else stand(p, face, dt);
  }
  /** people make room when Chinnu pushes through (and grumble now and then) */
  function shuffle(p, dt) {
    const pl = N.player;
    if (!pl || pl.hidden) { p.ofx *= 1 - dt * 0.6; p.ofy *= 1 - dt * 0.6; return; }
    const dx = p.x - pl.x, dy = p.y - pl.y, d = Math.hypot(dx, dy) || 1;
    const pvx = pl.vehicle ? pl.vehicle.vx : pl.vx || 0, pvy = pl.vehicle ? pl.vehicle.vy : pl.vy || 0, ps = Math.hypot(pvx, pvy);
    const R = TUNE.personal + (pl.vehicle ? 4 : 0);
    if (d < R && ps > 6 && (pvx * dx + pvy * dy) > 0) {
      const s = (pvx * dy - pvy * dx) > 0 ? -1 : 1, ux = -(pvy / ps) * s, uy = (pvx / ps) * s;
      p.ofx = clamp(p.ofx + (ux * 0.7 + (dx / d) * 0.3) * dt * 16, -6, 6);
      p.ofy = clamp(p.ofy + (uy * 0.7 + (dy / d) * 0.3) * dt * 16, -6, 6);
      p.lookT = 0.8; p.lookAt = pl;
      if (p.barkCD <= 0 && rnd() < dt * 0.6) { p.barkCD = 10; bark(p, line(p.sc && p.sc.kind === 'baraat' ? 'baraat' : 'step')); }
    } else if (d > R + 6) { p.ofx *= 1 - dt * 0.5; p.ofy *= 1 - dt * 0.5; }
  }
  function personUpdate(p, dt) {
    p.t += dt; if (p.barkCD > 0) p.barkCD -= dt; if (p.bumpT > 0) p.bumpT -= dt; if (p.lookT > 0) p.lookT -= dt;
    if (!p.sc || !p.sc.on) { if (p.beh !== 'leave' && p.beh !== 'in') { const pl = N.player; leave(p, p.x + (p.x - pl.x) * 3, p.y + (p.y - pl.y) * 3); } }
    switch (p.beh) {
      case 'goto': {
        const d = walkTo(p, p.tx, p.ty, p.spd, dt, 1.2);
        if (d < 2) { p.arrived = true; p.beh = p.then || 'stand'; }
        break;
      }
      case 'path': {
        const pts = p.path;
        if (!pts) { p.beh = 'stand'; break; }
        const n = pts.length / 2;
        const tx = pts[p.pi * 2], ty = pts[p.pi * 2 + 1];
        const d = walkTo(p, tx, ty, p.spd, dt, 0.8);
        if (d < 2.5) { if (p.pi < n - 1) p.pi++; else { p.arrived = true; p.beh = p.then || 'stand'; p.tx = tx; p.ty = ty; } }
        break;
      }
      case 'follow': { // formations: the scene moves (tx, ty) each frame
        shuffle(p, dt);
        const d = Math.hypot(p.tx + p.ofx - p.x, p.ty + p.ofy - p.y);
        if (d > 1.2) walkTo(p, p.tx + p.ofx, p.ty + p.ofy, Math.min(p.spd * 1.6, 8 + d * 2.2), dt, 0.6);
        else stand(p, p.face, dt);
        break;
      }
      case 'leave': {
        const d = walkTo(p, p.tx, p.ty, p.spd, dt, 2);
        if (d < 4 || p.t > 40) {
          if (!seen(p.x, p.y, 16) || p.leaveN > 4 || p.t > 60) { freePerson(p); return; }
          const pl = N.player, ax = p.x - pl.x, ay = p.y - pl.y, L = Math.hypot(ax, ay) || 1;
          p.tx = p.x + (ax / L) * 90; p.ty = p.y + (ay / L) * 90; p.leaveN++;
          if (!walkable(p.tx, p.ty)) { const f = freeSpot(p.tx, p.ty, 6); if (f) { p.tx = f.x; p.ty = f.y; } }
        }
        break;
      }
      case 'in': {
        const d = walkTo(p, p.tx, p.ty, p.spd, dt, 1.2);
        if (d < 2.5 || p.t > 30) { freePerson(p); return; }
        break;
      }
      case 'sit': p.idle = 'sit'; p.vx = p.vy = 0; p.x = p.tx; p.y = p.ty; if (p.face != null) p.angle += angDiff(p.angle, p.face) * Math.min(1, dt * 3); p.anim.speed = 0; break;
      case 'work': p.idle = 'work'; shuffle(p, dt); holdAt(p, p.tx, p.ty, p.face, dt); break;
      case 'dance': {
        shuffle(p, dt);
        p.constable = true;
        if (!p.pod) p.pod = { axisA: 0, green: 0 };
        const t = p.t + p.seed * 0.001;
        p.pod.axisA = (p.face || 0) + Math.sin(t * 1.7) * 1.4 + (Math.sin(t * 0.4) > 0.7 ? t * 4 : 0);
        p.angle = p.pod.axisA;
        const r = 1.6, cx = p.tx + Math.cos(t * 2.1) * r, cy = p.ty + Math.sin(t * 2.6) * r;
        walkTo(p, cx + p.ofx, cy + p.ofy, 16, dt, 0.3);
        p.angle = p.pod.axisA; p.facing = p.angle;
        p.bob = Math.abs(Math.sin(t * 5.5)) * 1.2;
        p.anim.speed = 0.5; p.anim.phase += dt * 6;
        break;
      }
      case 'wave': { // the havaldar / the lorry helper: the constable pose facing p.face
        p.constable = true;
        if (!p.pod) p.pod = { axisA: 0, green: 0 };
        p.pod.axisA = p.face || 0; p.pod.green = 0;
        holdAt(p, p.tx, p.ty, p.face, dt); p.angle = p.face || 0;
        break;
      }
      case 'crush': { // the ticket-counter scrum: everyone leans in and jostles
        const t = p.t * 3 + p.seed;
        const jx = Math.sin(t * 1.3) * 1.4, jy = Math.cos(t * 1.7) * 1.4;
        walkTo(p, p.tx + jx + p.ofx, p.ty + jy + p.ofy, 12, dt, 0.4);
        if (p.face != null) p.angle += angDiff(p.angle, p.face) * Math.min(1, dt * 6);
        p.anim.speed = 0.3; p.anim.phase += dt * 3;
        shuffle(p, dt);
        break;
      }
      case 'push': { // pushing the stalled bus: lean, walk in place
        const v = p.v;
        if (!v || !v.alive) { p.beh = 'stand'; break; }
        const ca = Math.cos(v.angle), sa = Math.sin(v.angle), L = v.T.w / 2 + 2.5;
        const tx = v.x - ca * L - sa * p.aux, ty = v.y - sa * L + ca * p.aux;
        const d = Math.hypot(tx - p.x, ty - p.y);
        if (d > 1.2) walkTo(p, tx, ty, 30, dt, 0.5); else { p.vx = v.vx; p.vy = v.vy; integrate(p, dt); }
        p.angle += angDiff(p.angle, v.angle) * Math.min(1, dt * 6);
        p.anim.speed = 0.35; p.anim.phase += dt * 4;
        break;
      }
      default: // 'stand'
        shuffle(p, dt);
        holdAt(p, p.tx, p.ty, p.lookT > 0 && p.lookAt ? Math.atan2(p.lookAt.y - p.y, p.lookAt.x - p.x) : p.face, dt);
        break;
    }
    if (p.beh !== 'dance' && p.beh !== 'wave') { p.constable = false; }
    if (p.beh !== 'dance') p.bob = 0;
    if (p.beh !== 'sit' && p.beh !== 'work') p.idle = null;
    p.facing = p.angle;
  }

  /* ================================================================ animals (cows, buffalo, the horse) */
  const BPOOL = [], BEASTS = [];
  class Beast extends N.Actor {
    constructor() {
      super({ kind: 'animal', r: 6, mass: 400, solid: true });
      this.cle = true; this.species = 'cow'; this.col = ['#ece8e0', '#c8c0b4']; this.state = 'stand'; this.moving = false;
      this._fn = (ctx) => { const t0 = now(); drawBeast(ctx, this); ACC.drw += now() - t0; };
    }
    update(dt) { const t0 = now(); try { beastUpdate(this, dt); } catch (e) { N.err('citylife.beast', e); freeBeast(this); } ACC.ent += now() - t0; }
    draw() { if (!is3D() && !this.hidden) N.render.queue('actors', this.y, this._fn); }
  }
  function newBeast(sc, species, x, y, a, o) {
    o = o || {};
    const b = BPOOL.pop() || new Beast();
    b.id = 0; b.alive = true; b.hidden = false; b.sc = sc; b.species = species; b.x = x; b.y = y; b.angle = a || 0; b.vx = b.vy = 0;
    b.col = o.col || (species === 'buffalo' ? ['#2c2826', '#1c1a18'] : species === 'horse' ? ['#f2efe8', '#d8d2c8'] : ['#ece8e0', '#c8c0b4']);
    b.state = o.state || 'stand'; b.moving = false; b.getUpT = null; b.seed = (rnd() * 1e6) | 0; b.path = null; b.pi = 0; b.spd = o.spd || 12; b.t = 0;
    b.fixed = !!o.fixed; b.view3d = species === 'horse' ? 'cle:horse' : undefined; b.r = species === 'horse' ? 5 : 6; b.ph = rnd() * 6; b.tx = x; b.ty = y; b.rider = o.rider || null;
    if (species === 'buffalo') b.species3 = 'cow';
    N.entities.add(b); BEASTS.push(b); if (sc) sc.beasts.push(b);
    return b;
  }
  // 3D: the animal renderer keys on e.species ('cow' draws the cow model); buffalo are cows with a dark coat
  Object.defineProperty(Beast.prototype, 'speciesKey', { get() { return this.species; } });
  function freeBeast(b) {
    if (!b) return;
    if (b.sc) { const i = b.sc.beasts.indexOf(b); if (i >= 0) b.sc.beasts.splice(i, 1); }
    const j = BEASTS.indexOf(b); if (j >= 0) BEASTS.splice(j, 1);
    if (b.alive) N.entities.remove(b);
    b.alive = false; b.sc = null; b.path = null;
    if (BPOOL.length < 24) BPOOL.push(b);
  }
  function beastUpdate(b, dt) {
    b.t += dt;
    if (b.fixed || b.state === 'lie') { b.vx = b.vy = 0; b.moving = false; return; }
    let tx = b.tx, ty = b.ty;
    if (b.path) { const n = b.path.length / 2; tx = b.path[b.pi * 2]; ty = b.path[b.pi * 2 + 1]; if (Math.hypot(tx - b.x, ty - b.y) < 3 && b.pi < n - 1) b.pi++; }
    const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
    const want = d > 1.5 ? Math.min(b.spd, d * 2) : 0;
    const vx = d > 0.01 ? (dx / d) * want : 0, vy = d > 0.01 ? (dy / d) * want : 0;
    const a = 1 - Math.exp(-dt * 3);
    b.vx += (vx - b.vx) * a; b.vy += (vy - b.vy) * a;
    b.x += b.vx * dt; b.y += b.vy * dt;
    const sp = Math.hypot(b.vx, b.vy);
    b.moving = sp > 1.5; b.state = b.moving ? 'walk' : 'stand';
    if (sp > 1) b.angle += angDiff(b.angle, Math.atan2(b.vy, b.vx)) * Math.min(1, dt * 3);
    b.ph += sp * dt * 0.35;
  }
  // the species the 3D animal renderer sees: buffalo -> 'cow' (dark coat); restore for 2D
  Object.defineProperty(Beast.prototype, 'species', {
    get() { return this._sp === 'buffalo' && is3D() ? 'cow' : this._sp; },
    set(v) { this._sp = v; },
  });

  /* ================================================================ static solid blocks (stalls, tankers, podiums) */
  class Block extends N.Actor {
    constructor(x, y, r) { super({ kind: 'prop', x, y, r: r || 4, mass: 500, solid: true, fixed: true }); this.cle = true; this.view3d = 'cle:block'; }
  }
  function addBlock(sc, x, y, r) { const b = new Block(x, y, r); N.entities.add(b); sc.blocks.push(b); return b; }

  /* ================================================================ vehicles (real N.vehicles, our controller) */
  const VEHS = [];
  const MOTOR = { auto: 1, bus: 1, lorry: 1, chetak: 1, rx100: 1, luna: 1, scooty: 1, ambassador: 1, maruti800: 1, padmini: 1, family_chetak: 1 };
  function driverLook(type, style) {
    const T = N.vehicles.TYPES[type] || {};
    let L;
    if (type === 'auto') { L = Object.assign({}, lookFor('man', style)); L.shirt = '#b8a070'; L.pants = '#9a8656'; }
    else if (T.pedal) L = lookFor(pick(['man', 'student', 'lungi', 'youth', 'uncle']), style);
    else if (T.cls === 'bike') L = lookFor(pick(['man', 'youth', 'uncle', 'office']), style);
    else L = lookFor(pick(['man', 'uncle']), style);
    return L;
  }
  function spawnVeh(sc, type, x, y, a, o) {
    o = o || {};
    const VV = N.vehicles;
    if (!VV || !VV.spawn || !VV.TYPES || !VV.TYPES[type]) return null;
    if (VEHS.length >= TUNE.vehicles[tier()] && !o.must) return null;
    const T = VV.TYPES[type];
    const near = N.entities.query(x, y, Math.max(5, (T.d || 6) * 0.6 + 2), (e) => e.kind === 'vehicle' || e === N.player);
    if (near.length) return null;
    const col = T.colors && T.colors.length ? pick(T.colors) : undefined;
    let v = null;
    try { v = VV.spawn(type, x, y, a, { color: col, seed: (rnd() * 1e9) | 0, driver: { look: o.look || driverLook(type, sc.style), npc: true } }); } catch (e) { N.err('citylife.spawnVeh', e); v = null; }
    if (!v) return null;
    v.noEnter = true; v.cleVeh = true;
    v.cle = { sc, mode: o.mode || 'hold', tx: x, ty: y, ta: a, vmax: o.vmax || 16, path: null, pi: 0, then: null, t: 0, honkT: 0, hd: 0, lane: null, d: 0, puffT: rr(0, 1.5), stall: false, push: false, revT: 0, revPh: 0, blockT: 0, motor: !!MOTOR[type], tag: o.tag || null, kids: o.kids || 0, cans: !!o.cans, papers: !!o.papers };
    v.controller = vehCtl;
    if (o.pillion && VV.setPillion) { try { VV.setPillion(v, lookFor(o.pillion, sc.style)); } catch (e) { /* optional */ } }
    VEHS.push(v); sc.vehs.push(v);
    ST.spawnedV++;
    return v;
  }
  function freeVeh(v) {
    if (!v) return;
    const c = v.cle;
    if (c) {
      if (c.lane) { const q = c.lane.q, i = q.indexOf(v); if (i >= 0) q.splice(i, 1); c.lane = null; }
      if (c.sc) { const i = c.sc.vehs.indexOf(v); if (i >= 0) c.sc.vehs.splice(i, 1); }
    }
    const j = VEHS.indexOf(v); if (j >= 0) VEHS.splice(j, 1);
    v.cle = null;
    if (N.player.vehicle === v) { v.controller = null; return; }
    if (v.controller === vehCtl) v.controller = null;
    try { N.vehicles.remove(v); } catch (e) { N.entities.remove(v); }
  }
  /** is something right in front of v (the player, one of our vehicles, a beast)? */
  const BA = { v: null, ca: 0, sa: 0, L: 0, range: 0, back: false };
  function baTest(x, y, r) {
    const v = BA.v, dx = x - v.x, dy = y - v.y;
    const f = BA.back ? -(dx * BA.ca + dy * BA.sa) : dx * BA.ca + dy * BA.sa;
    if (f < BA.L - 2 || f > BA.L + BA.range + r) return false;
    return Math.abs(-dx * BA.sa + dy * BA.ca) < v.T.d / 2 + r + (BA.back ? 0 : 1);
  }
  /** is something right in front of v (the player, one of our vehicles, a beast)? */
  function blockedAhead(v, c, range, back) {
    BA.v = v; BA.ca = Math.cos(v.angle); BA.sa = Math.sin(v.angle); BA.L = v.T.w / 2; BA.range = range; BA.back = !!back;
    const pl0 = N.player;
    if (!pl0.hidden && baTest(pl0.x, pl0.y, pl0.vehicle ? 4 : 3)) return true;
    const S = c && c.sc;
    if (S) {
      for (let i = 0; i < S.vehs.length; i++) { const o = S.vehs[i]; if (o !== v && o.alive && baTest(o.x, o.y, o.T.d / 2)) return true; }
      if (!back) for (let i = 0; i < S.beasts.length; i++) { const b = S.beasts[i]; if (b.alive && baTest(b.x, b.y, 5)) return true; }
    }
    return false;
  }
  function vehCtl(v, dt) { const t0 = now(); vehCtl0(v, dt); ACC.veh += now() - t0; }
  function vehCtl0(v, dt) {
    const c = v.cle, ctl = v.ctl;
    if (!c) { ctl.throttle = 0; ctl.brake = true; return; }
    c.t += dt;
    if (c.honkT > 0) c.honkT -= dt;
    if (c.hd > 0) { c.hd -= dt; if (c.hd <= 0) honk(v); }
    ctl.handbrake = false;
    const sp = v.speed || 0;
    switch (c.mode) {
      case 'hold': {
        const dx = c.tx - v.x, dy = c.ty - v.y, ca = Math.cos(v.angle), sa = Math.sin(v.angle);
        const fwd = dx * ca + dy * sa;
        if (fwd > 1.0 && !(c.stall && !c.push)) {
          let want = Math.min(c.vmax, 1.5 + fwd * 1.1);
          if (c.stall) want = Math.min(want, 3.2);
          const aim = fwd > 5 ? Math.atan2(dy, dx) : c.ta;
          ctl.steer = clamp(angDiff(v.angle, aim) * 2.2, -1, 1);
          if (c.blockT > 0) { c.blockT -= dt; want = 0; }
          else if ((c.t * 7 | 0) % 2 === 0 && fwd > 6 && blockedAhead(v, c, 4)) { c.blockT = 0.4; want = 0; }
          if (sp < want - 0.5) { ctl.throttle = clamp((want - sp) / 18, c.stall ? 0.06 : 0.12, c.stall ? 0.12 : 0.85); ctl.brake = false; }
          else { ctl.throttle = 0; ctl.brake = sp > want + 2; }
        } else { ctl.throttle = 0; ctl.brake = true; ctl.steer = 0; }
        break;
      }
      case 'path': case 'leave': {
        const Pp = c.path;
        if (!Pp) { c.mode = 'gone'; break; }
        const n = Pp.length / 2;
        const look = Math.max(8, Math.abs(sp) * 0.35);
        while (c.pi < n - 1 && Math.hypot(Pp[c.pi * 2] - v.x, Pp[c.pi * 2 + 1] - v.y) < look) c.pi++;
        const tx = Pp[c.pi * 2], ty = Pp[c.pi * 2 + 1];
        const dEnd = c.pi >= n - 1 ? Math.hypot(tx - v.x, ty - v.y) : 1e9;
        if (c.pi >= n - 1 && dEnd < 6) { ctl.throttle = 0; ctl.brake = true; c.mode = c.then || 'gone'; c.then = null; if (c.onEnd) { const f = c.onEnd; c.onEnd = null; f(v); } break; }
        const diff = angDiff(v.angle, Math.atan2(ty - v.y, tx - v.x));
        let want = c.vmax;
        if (Math.abs(diff) > 1) want = Math.min(want, 12); else if (Math.abs(diff) > 0.45) want = Math.min(want, 22);
        if (dEnd < 30) want = Math.min(want, 5 + dEnd * 0.7);
        if (c.blockT > 0) { c.blockT -= dt; want = 0; }
        else if ((c.t * 6 | 0) % 2 === 0 && blockedAhead(v, c, 5 + sp * 0.25)) { c.blockT = 0.5; want = 0; c.waitT = (c.waitT || 0) + 0.5; if (c.waitT > 1.5 && c.honkT <= 0) { honk(v); c.waitT = 0; } }
        ctl.steer = clamp(diff * 2.5, -1, 1);
        if (sp < want - 1) { ctl.throttle = clamp((want - sp) / 25, 0.2, 1); ctl.brake = false; }
        else { ctl.throttle = 0; ctl.brake = sp > want + 3; }
        break;
      }
      case 'rev': { // the lorry backs up in steps while the helper waves it in
        c.revT -= dt;
        if (c.revT <= 0) { c.revPh = (c.revPh + 1) % 3; c.revT = c.revPh === 0 ? 1.3 : c.revPh === 1 ? 1.4 : 0.9; }
        ctl.steer = clamp(Math.sin(c.t * 0.4) * 0.4, -1, 1);
        if (c.revPh === 0 && !c.revStop) { ctl.throttle = sp > -4 ? -0.32 : 0; ctl.brake = false; }
        else if (c.revPh === 2 && !c.revStop) { ctl.throttle = sp < 2.5 ? 0.18 : 0; ctl.brake = false; }
        else { ctl.throttle = 0; ctl.brake = true; }
        break;
      }
      default: ctl.throttle = 0; ctl.brake = true; ctl.steer = 0; break;
    }
  }
  function exhaust(v, dt) {
    const c = v.cle;
    if (!c || !c.motor) return;
    c.puffT -= dt;
    if (c.puffT > 0) return;
    const sp = Math.abs(v.speed || 0), heavy = v.T.cls === 'heavy';
    c.puffT = (heavy ? 0.35 : 0.8) + rnd() * 0.6 - Math.min(0.3, sp * 0.01);
    const ca = Math.cos(v.angle), sa = Math.sin(v.angle), L = v.T.w / 2;
    emit(PK.EXH, v.x - ca * L, v.y - sa * L, heavy ? 2 : 1, -ca * 6 + rr(-2, 2), -sa * 6 + rr(-2, 2), rr(1.5, 3.5), rr(1.6, 2.8), heavy ? rr(2.4, 3.6) : rr(1.2, 2), heavy || v.type === 'auto' ? 10 : 1);
    if (sp > 8 && rnd() < 0.35) emit(PK.DUST, v.x - ca * L + rr(-3, 3), v.y - sa * L + rr(-3, 3), 0.5, rr(-3, 3), rr(-3, 3), rr(1, 2.5), rr(1.6, 2.6), rr(2, 3.4), 0);
  }

  /* ================================================================ the jam: queues on the arms of a node */
  const TYPEMIX = {
    market: { auto: 30, bus: 7, chetak: 14, rx100: 8, luna: 6, cycle: 7, ambassador: 6, maruti800: 9, padmini: 4, lorry: 2, scooty: 5, rickshaw: 2 },
    colonial: { auto: 24, bus: 8, chetak: 14, rx100: 8, luna: 4, cycle: 6, ambassador: 10, maruti800: 12, padmini: 6, lorry: 2, scooty: 6 },
    oldcity: { auto: 18, chetak: 18, rx100: 12, luna: 12, cycle: 14, scooty: 6, rickshaw: 8, maruti800: 2 },
    colony: { auto: 24, bus: 4, chetak: 16, rx100: 8, luna: 9, cycle: 12, maruti800: 8, scooty: 8, ambassador: 4 },
    lane: { chetak: 22, rx100: 14, luna: 16, cycle: 14, scooty: 10, rickshaw: 6, auto: 6 },
    posh: { auto: 16, chetak: 12, rx100: 10, ambassador: 10, maruti800: 22, padmini: 10, bus: 5, scooty: 8 },
  };
  const KERB_OK = { chetak: 1, rx100: 1, luna: 1, cycle: 1, scooty: 1, auto: 1, rickshaw: 1 };
  function jamMake(sc, node, arms, o) {
    o = o || {};
    const J = { node, arms, jr: o.jr || Math.max(10, (node.w || 20) / 2 + 4), lanes: [], green: 0, greenT: rr(3, 6), flowT: 2, spawnT: 0, honkT: rr(2, 4), cap: o.cap || 10, gap: 3.2, mix: o.mix || 'market', clearing: false, maxDepth: o.depth || 170, lr: o.laneOnly || false, trapT: 0, chkT: 0, box: [], boxCap: o.boxCap || 0, avoid: [] };
    for (let ai = 0; ai < arms.length; ai++) {
      const A = arms[ai], hw = A.w / 2;
      const offs = hw >= 13 ? [hw * 0.46, hw * 0.86] : [hw * 0.5];
      for (let c = 0; c < offs.length; c++) J.lanes.push({ arm: A, ai, off: offs[c], kerb: c === 1, q: [], front: J.jr + (o.front || 2) });
    }
    return J;
  }
  function laneBackD(J, lane) {
    let d = lane.front;
    for (const v of lane.q) d += v.T.w + J.gap;
    return d;
  }
  function jamPickType(J, lane) {
    const mix = TYPEMIX[J.mix] || TYPEMIX.market;
    for (let g = 0; g < 6; g++) {
      const t = wpick(mix);
      if (!t || !N.vehicles.TYPES[t]) continue;
      if (lane.kerb && !KERB_OK[t]) continue;
      if (!lane.kerb && lane.arm.w < 22 && N.vehicles.TYPES[t].cls === 'heavy') continue;
      return t;
    }
    return 'chetak';
  }
  function jamCount(J) { let n = 0; for (const l of J.lanes) n += l.q.length; return n; }
  /** add one vehicle at the back of a lane (warm: straight into place; else it drives in from behind, out of sight) */
  function jamAdd(sc, J, lane, warm, type) {
    if (!type) { for (let k = 0; k < 3; k++) { const v = jamAdd(sc, J, lane, warm, jamPickType(J, lane)); if (v) return v; } return null; }
    const T = N.vehicles.TYPES[type];
    if (!T) return null;
    const back = laneBackD(J, lane), d = back + T.w / 2;
    if (d + T.w / 2 > Math.min(J.maxDepth, lane.arm.len - 6)) return null;
    let sd = d;
    if (!warm) {
      sd = Math.min(lane.arm.len - 8, d + 70);
      const q = at(lane.arm, sd, -lane.off);
      if (seen(q.x, q.y, 20)) return null;
    }
    const q = at(lane.arm, sd, -lane.off);
    const v = spawnVeh(sc, type, q.x, q.y, Math.atan2(-q.uy, -q.ux), { vmax: warm ? 12 : 26 });
    if (!v) return null;
    v.cle.lane = lane; lane.q.push(v);
    return v;
  }
  function jamTargets(J) {
    for (const lane of J.lanes) {
      let d = lane.front;
      for (const v of lane.q) {
        const c = v.cle; if (!c) continue;
        const L = v.T.w;
        d += L / 2;
        const q = at(lane.arm, d, -lane.off, PT2);
        c.tx = q.x; c.ty = q.y; c.ta = Math.atan2(-q.uy, -q.ux); c.d = d;
        d += L / 2 + J.gap;
      }
    }
  }
  /** the front vehicle of a lane drives off through the node and out along another arm */
  function jamDepart(sc, J, v) {
    const c = v.cle; if (!c) return;
    const lane = c.lane;
    if (lane) { const i = lane.q.indexOf(v); if (i >= 0) lane.q.splice(i, 1); c.lane = null; }
    const A = lane ? lane.arm : J.arms[0];
    let ex = null, bs = -1;
    for (const B of J.arms) {
      if (B === A) continue;
      const turn = Math.abs(angDiff(A.ang + PI, B.ang)); // 0 = straight across
      const s = (turn < 0.6 ? 2 : turn < 1.9 ? 1.2 : 0.3) + rnd();
      if (s > bs) { bs = s; ex = B; }
    }
    if (!ex) ex = A;
    const pts = [v.x, v.y];
    const off = lane ? lane.off : A.w / 4, eoff = Math.min(off, ex.w / 2 * 0.6);
    let q = at(A, J.jr * 0.6, -off); pts.push(q.x, q.y);
    q = at(ex, J.jr * 0.7, eoff); pts.push(q.x, q.y);
    for (let d = J.jr + 30; d < ex.len; d += 40) { q = at(ex, d, eoff); pts.push(q.x, q.y); }
    q = at(ex, ex.len, eoff); pts.push(q.x, q.y);
    c.path = pts; c.pi = 0; c.mode = 'leave'; c.then = 'gone'; c.vmax = v.T.cls === 'heavy' ? 26 : rr(28, 38); c.stall = false;
    if (J.boxCap && !J.clearing && J.box.length < J.boxCap && v.T.cls !== 'heavy' && rnd() < 0.45) {
      const bp = boxSpot(J);
      if (bp) { c.path = [v.x, v.y, bp.x, bp.y]; c.vmax = 16; c.then = 'hold'; c.onEnd = (veh) => boxStick(J, veh); }
    }
  }
  /** a free spot inside the junction box (not on the podium, the cow or another stuck vehicle) */
  function boxSpot(J) {
    const n = J.node;
    for (let g = 0; g < 12; g++) {
      const a = rnd() * TAU, r = J.jr * rr(0.35, 0.78), x = n.x + Math.cos(a) * r, y = n.y + Math.sin(a) * r;
      let ok = true;
      for (const q of J.avoid) if (Math.hypot(q.x - x, q.y - y) < 13) { ok = false; break; }
      if (ok) for (const v of J.box) if (Math.hypot(v.x - x, v.y - y) < 13) { ok = false; break; }
      if (ok) return { x, y };
    }
    return null;
  }
  function boxStick(J, v) {
    const c = v.cle; if (!c) return;
    c.mode = 'hold'; c.tx = v.x; c.ty = v.y; c.ta = v.angle; c.boxT = rr(4, 10); c.box = true;
    if (J.box.indexOf(v) < 0) J.box.push(v);
    c.hd = 0.2;
  }
  function boxRelease(sc, J, v) {
    const c = v.cle; if (!c) return;
    const i = J.box.indexOf(v); if (i >= 0) J.box.splice(i, 1);
    c.box = false;
    let ex = null, bd = 9;
    for (const B of J.arms) { const d = Math.abs(angDiff(v.angle, B.ang)); if (d < bd) { bd = d; ex = B; } }
    ex = ex || pick(J.arms);
    const eoff = ex.w / 4, pts = [v.x, v.y];
    let q = at(ex, J.jr * 0.8, eoff); pts.push(q.x, q.y);
    for (let d = J.jr + 30; d < ex.len; d += 40) { q = at(ex, d, eoff); pts.push(q.x, q.y); }
    c.path = pts; c.pi = 0; c.mode = 'leave'; c.then = 'gone'; c.vmax = 26; c.onEnd = null;
  }
  const JO0 = { calm: false, onGreen: null };
  function jamUpdate(sc, J, dt, level, opts) {
    opts = opts || JO0;
    const want = Math.round(clamp(level, 0, 1) * J.cap);
    J.clearing = level < 0.18;
    // arrivals
    J.spawnT -= dt;
    if (!J.clearing && J.spawnT <= 0 && jamCount(J) < want) {
      J.spawnT = rr(0.7, 1.8);
      let best = null, bd = 1e9;
      for (const l of J.lanes) { const b = laneBackD(J, l) + rnd() * 30 + (l.kerb ? 12 : 0); if (b < bd) { bd = b; best = l; } }
      if (best) jamAdd(sc, J, best, false);
    }
    // the green arm (the havaldar's wave, or traffic.js's podium cycle) drains
    J.greenT -= dt;
    if (J.greenT <= 0) {
      J.greenT = rr(7, 11);
      J.green = (J.green + 1) % Math.max(1, J.arms.length);
      if (opts.onGreen) opts.onGreen(J.green);
    }
    J.flowT -= dt;
    if (J.flowT <= 0) {
      J.flowT = J.clearing ? rr(0.7, 1.2) : rr(1.5, 2.6) * (0.8 + level * 0.5);
      let moving = 0; for (const v of sc.vehs) if (v.cle && v.cle.mode === 'leave' && Math.hypot(v.x - J.node.x, v.y - J.node.y) < J.jr + 10) moving++;
      if (moving < (J.clearing ? 3 : 2)) {
        for (const l of J.lanes) {
          if (!J.clearing && l.ai !== J.green) continue;
          const v = l.q[0];
          if (!v || !v.cle || v.cle.stall || v.cle.mode !== 'hold') continue;
          if (Math.hypot(v.x - v.cle.tx, v.y - v.cle.ty) > 6) continue;
          if (blockedAhead(v, v.cle, 6)) continue;
          jamDepart(sc, J, v);
          if (!J.clearing) break;
        }
      }
    }
    jamTargets(J);
    for (let i = J.box.length - 1; i >= 0; i--) {
      const v = J.box[i];
      if (!v.alive || !v.cle) { J.box.splice(i, 1); continue; }
      v.cle.boxT -= dt;
      if (v.cle.boxT <= 0 && (J.clearing || !blockedAhead(v, v.cle, 8))) boxRelease(sc, J, v);
      else if (v.cle.boxT <= 0) v.cle.boxT = rr(1, 2.5);
    }
    // honk storms behind a red light
    J.honkT -= dt;
    if (J.honkT <= 0 && !opts.calm) {
      J.honkT = rr(2.5, 6) / (0.4 + level);
      const n = 1 + ((rnd() * (2 + level * 4)) | 0);
      let k = 0;
      for (const l of J.lanes) {
        if (l.ai === J.green && !J.clearing) continue;
        for (const v of l.q) { if (k >= n) break; if (rnd() < 0.5) { v.cle.hd = 0.05 + k * rr(0.15, 0.45); k++; } }
      }
      if (k >= 3) beat(sc, 'honkstorm');
    }
    // exhaust + tidy up the ones that drove off
    for (let i = sc.vehs.length - 1; i >= 0; i--) {
      const v = sc.vehs[i];
      if (!v.alive || !v.cle) { freeVeh(v); continue; }
      if (v.cle.mode === 'gone' && !seen(v.x, v.y, 30)) { freeVeh(v); continue; }
      if (v.cle.mode === 'gone' && v.cle.t > 90) { freeVeh(v); continue; }
      exhaust(v, dt);
    }
  }
  /** never trap Chinnu: if he pushes against our vehicles and cannot move, the nearest one moves off */
  function antiTrap(sc, J, dt) {
    const pl = N.player;
    if (!pl || pl.hidden) return;
    const pv = pl.vehicle;
    if (pv && !(pv.T && (pv.T.pedal || pv.T.cls === 'bike'))) return;
    const mv = N.input && N.input.move, want = mv ? Math.hypot(mv.x || 0, mv.y || 0) : 0;
    // real progress over the last second (a blocked walker keeps his wish velocity, so measure the position)
    J.chkT += dt;
    if (J.chkT >= 0.5) {
      const moved = J.lastX == null ? 99 : Math.hypot(pl.x - J.lastX, pl.y - J.lastY);
      J.lastX = pl.x; J.lastY = pl.y;
      if (want > 0.35 && moved < 2.5 && (pv ? Math.abs(pv.speed || 0) < 6 : true)) J.trapT += J.chkT; else J.trapT = Math.max(0, J.trapT - J.chkT * 2);
      J.chkT = 0;
    }
    if (J.trapT < 1.0) return;
    J.trapT = 0;
    let best = null, bd = 7; // only one of OUR vehicles touching him (walls are not our business)
    for (const v of sc.vehs) {
      if (!v.alive || !v.cle) continue;
      const dx = pl.x - v.x, dy = pl.y - v.y, ca = Math.cos(v.angle), sa = Math.sin(v.angle);
      const f = Math.abs(dx * ca + dy * sa) - v.T.w / 2, l = Math.abs(-dx * sa + dy * ca) - v.T.d / 2, d = Math.max(f, l);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) return;
    ST.unstuck++;
    if (J.lastUn === best || bd < -2) { // still in the way (or he is wedged against it): it simply goes
      for (let i = 0; i < 5; i++) emit(PK.DUST, best.x + rr(-4, 4), best.y + rr(-4, 4), 1, rr(-6, 6), rr(-6, 6), rr(2, 5), 1.6, 3, 0);
      const bi = J.box.indexOf(best); if (bi >= 0) J.box.splice(bi, 1);
      freeVeh(best); J.lastUn = null; return;
    }
    J.lastUn = best;
    if (best.cle.box) boxRelease(sc, J, best);
    else if (best.cle.lane || best.cle.mode === 'hold') jamDepart(sc, J, best);
    else if (best.cle.mode === 'gone' || best.cle.mode === 'rev') freeVeh(best);
    else best.cle.blockT = 0;
  }

  /* ================================================================ sites + scenes (shared plumbing) */
  const SITES = [], BYID = new Map(), ACTIVE = [], ORPH = [];
  let UIDN = 1;
  function addSite(s) { s.uid = UIDN++; s.sc = null; s.force = null; s.cool = 0; s.d = 1e9; s.lvl = 0; SITES.push(s); BYID.set(s.id, s); return s; }
  function newScene(site) {
    return { site, id: site.id, kind: site.kind, K: KINDS[site.kind], on: true, level: 0, want: 0, t: 0, persons: [], vehs: [], beasts: [], blocks: [], closures: [], st: {}, style: site.style || 'colony', uid: site.uid, phase: '', o3: null };
  }
  function beat(sc, name) { ST.beats++; sc.lastBeat = name; N.emit('citylife:beat', { id: sc.id, kind: sc.kind, beat: name }); }
  function closeRoad(sc, key, x, y, r) {
    const T = N.traffic; if (!T || !T.closeRoads) return;
    const id = 'cle:' + sc.id + ':' + key;
    try { T.closeRoads(id, x == null ? null : { x, y, r }); } catch (e) { return; }
    if (x != null) { if (sc.closures.indexOf(id) < 0) sc.closures.push(id); } else { const i = sc.closures.indexOf(id); if (i >= 0) sc.closures.splice(i, 1); }
  }
  function forced(sc) { return sc.site.force; }
  function phaseOn(sc, name) { const f = sc.site.force; return !!(f && (f.phase === name || f.phase === 'all')); }
  const pl = () => N.player;
  const dPl = (x, y) => { const p = N.player; return Math.hypot(x - p.x, y - p.y); };
  /** the player is on a cycle (the havaldar whistles at a kid on a cycle) */
  function onCycle() { const v = N.player.vehicle; return !!(v && v.T && (v.T.pedal || /cycle/.test(v.type || ''))); }

  /* ================================================================ 3. JUNCTION CHAOS */
  const JUNCTIONS = [
    { id: 'abids', place: 'abids', w: 1 }, { id: 'koti', place: 'koti', w: 1 }, { id: 'rtc_x_roads', place: 'rtc_x_roads', w: 1 },
    { id: 'panjagutta', place: 'panjagutta', w: 0.95 }, { id: 'chaderghat', place: 'chaderghat_bridge', w: 0.9, r: 260 },
    { id: 'charminar_approach', xy: [9044, 8070], w: 0.8, old: true, r: 280, avoid: [9020, 8188] }, { id: 'basheerbagh', place: 'basheerbagh', w: 0.85 }, { id: 'malakpet', place: 'malakpet', w: 0.85 },
  ];
  function buildJunctions() {
    for (const j of JUNCTIONS) {
      const pc = j.place && N.places[j.place];
      const x = pc ? pc.x : j.xy[0], y = pc ? pc.y : j.xy[1];
      const n = nearNode(x, y, j.r || 160, (q) => q.deg >= 3 && (!j.avoid || Math.hypot(q.x - j.avoid[0], q.y - j.avoid[1]) > 60));
      if (!n) continue;
      const arms = armsOf(n, 250, 4);
      if (arms.length < 2) continue;
      let pod = null;
      for (const p of (N.world.podiums || [])) if (Math.hypot(p.x - n.x, p.y - n.y) < 70) { pod = p; break; }
      addSite({ id: 'junction:' + j.id, kind: 'junction', name: j.id, x: n.x, y: n.y, node: n, arms, pod, weight: j.w, style: styleAt(n.x, n.y), old: !!j.old });
    }
  }
  /** a warm start: ambient traffic.js vehicles parked in our queues' places go (out of sight, or when forced) */
  function clearAmbient(sc, x, y, r) {
    const T = N.traffic; if (!T || !T.clear) return;
    const f = !!forced(sc);
    try { T.clear((e) => e.kind === 'vehicle' && e !== N.player.vehicle && !e.cleVeh && Math.hypot(e.x - x, e.y - y) < r && (f || !seen(e.x, e.y, 20))); } catch (e) { /* optional */ }
  }
  function copOf(sc) { const s = sc.site; if (sc.st.cop && sc.st.cop.alive) return sc.st.cop; return s.pod && s.pod.cop && s.pod.cop.alive !== false ? s.pod.cop : null; }
  const KJ = {
    label: 'Traffic chaos',
    level(s, c) {
      if (c.m < 420 || c.m > 1350) return 0;
      const wk = c.dow !== 0;
      let l = peak(c.m, wk ? [[510, 660, 1], [1020, 1230, 1], [690, 1000, 0.42]] : [[600, 780, 0.5], [1050, 1230, 0.62]]);
      l *= s.weight || 1;
      if (c.rain > 0.3) l = Math.min(1, l + 0.22);
      if (c.m3 && s.name === 'rtc_x_roads') l = 0;
      return l;
    },
    start(sc, warm) {
      const s = sc.site, low = lowTier();
      const J = jamMake(sc, s.node, s.arms, { cap: low ? 9 : 14, mix: s.old ? 'oldcity' : TYPEMIX[s.style] ? s.style : 'market', depth: 200, boxCap: low ? 2 : 3 });
      clearAmbient(sc, s.x, s.y, J.jr + 190);
      sc.st.J = J; sc.st.kidCD = 0; sc.st.whT = rr(3, 7); sc.st.weaveT = rr(1, 4); sc.st.fpT = rr(6, 14); sc.st.sqT = rr(8, 16); sc.st.mooT = rr(10, 20); sc.st.dustT = 0;
      closeRoad(sc, 'box', s.x, s.y, J.jr + 26);
      const f = forced(sc);
      // the havaldar: traffic.js's constable on a real podium, else ours on a painted one
      if (!s.pod) {
        const h = newPerson(sc, 'police', s.x, s.y, { beh: 'wave', face: s.arms[0].ang, look: lookFor('police', 'colonial'), ghost: true });
        if (h) { h.tag = 'havaldar'; sc.st.cop = h; }
        addBlock(sc, s.x, s.y, 3.4);
        sc.st.podium = true;
      }
      // the cow sitting in the middle of it all
      if (rnd() < 0.85 || f) {
        const a = s.arms.length > 1 ? s.arms[0].ang + angDiff(s.arms[0].ang, s.arms[1].ang) / 2 : s.arms[0].ang + 0.8;
        const r = J.jr * 0.62;
        sc.st.cow = newBeast(sc, 'cow', s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, a + 1.4, { state: 'lie', fixed: true });
      }
      // a stalled bus, already being pushed
      if (warm || f) {
        const lanes = J.lanes.filter((l) => !l.kerb && l.arm.w >= 22 && l.ai !== J.green);
        if (lanes.length && (s.style === 'market' || s.style === 'colonial' || f) && (rnd() < 0.75 || f)) {
          const L = pick(lanes);
          const bus = jamAdd(sc, J, L, true, 'bus');
          if (bus) {
            bus.cle.stall = true; bus.cle.vmax = 3;
            const pushers = [];
            for (const lat of [-4.5, 0, 4.5]) { const p = newPerson(sc, pick(['man', 'youth', 'lungi', 'office']), bus.x - Math.cos(bus.angle) * 36, bus.y - Math.sin(bus.angle) * 36, { beh: 'push' }); if (p) { p.v = bus; p.aux = lat; pushers.push(p); } }
            sc.st.stall = { v: bus, pushers, t: rr(16, 26), pt: 0 };
          }
        }
        // a lorry reversing on an arterial arm, its helper waving it back
        const big = s.arms.filter((a) => a.w >= 24 && a.len > 120);
        if (big.length && (rnd() < 0.7 || f)) {
          const A = big[big.length > 1 ? 1 : 0], d = J.jr + 62, off = A.w / 2 * 0.5;
          const q = at(A, d, off);
          const lor = spawnVeh(sc, 'lorry', q.x, q.y, Math.atan2(q.uy, q.ux), { mode: 'rev', must: true });
          if (lor) {
            const hq = at(A, d - 32, off);
            const h = newPerson(sc, 'lungi', hq.x, hq.y, { beh: 'wave', face: Math.atan2(q.y - hq.y, q.x - hq.x) });
            sc.st.lorry = { v: lor, helper: h, t: rr(20, 30), A, off, barkT: 1, beepT: 0 };
          }
        }
      }
      J.avoid.push({ x: s.x, y: s.y });
      if (sc.st.cow) J.avoid.push(sc.st.cow);
      if (warm && sc.level > 0.55) {
        for (let i = 0; i < J.boxCap; i++) {
          const bp = boxSpot(J); if (!bp) break;
          const A = pick(s.arms), t = pick(['auto', 'chetak', 'rx100', 'auto', 'luna', 'maruti800']);
          const v = spawnVeh(sc, t, bp.x, bp.y, A.ang + PI + rr(-0.7, 0.7), { vmax: 10 });
          if (v) boxStick(J, v);
        }
      }
      if (warm) {
        const want = Math.round(clamp(sc.level, 0, 1) * J.cap);
        const full = new Set();
        for (let g = 0; g < 50 && jamCount(J) < want; g++) {
          let best = null, bd = 1e9;
          for (const l of J.lanes) { if (full.has(l)) continue; const b = laneBackD(J, l) + (l.kerb ? 14 : 0) + rnd() * 10; if (b < bd) { bd = b; best = l; } }
          if (!best) break;
          if (!jamAdd(sc, J, best, true)) { best.skip = (best.skip || 0) + 1; if (best.skip > 2) full.add(best); }
        }
        for (const l of J.lanes) l.skip = 0;
        jamTargets(J);
        for (const v of sc.vehs) if (v.cle && v.cle.lane) { v.x = v.cle.tx; v.y = v.cle.ty; v.angle = v.cle.ta; }
      }
    },
    update(sc, dt) {
      const s = sc.site, st = sc.st, J = st.J;
      const calm = s.old && CX.prayer;
      if (!st.jo) st.jo = { calm: false, onGreen: (g) => {
        const cop = copOf(sc);
        if (st.cop && st.cop.alive) st.cop.face = s.arms[g].ang + PI;
        if (cop && dPl(cop.x, cop.y) < 380) { if (!st.jo.calm) sfx('whistle', cop.x, cop.y, { vol: 0.5, gap: 2 }); if (rnd() < 0.5) bark(cop, line('havaldar')); beat(sc, 'whistle'); }
      } };
      st.jo.calm = calm;
      jamUpdate(sc, J, dt, sc.level, st.jo);
      antiTrap(sc, J, dt);
      // the stalled bus: pushed in fits, then it coughs into life
      const S = st.stall;
      if (S) {
        const v = S.v;
        if (!v.alive || !v.cle) { for (const p of S.pushers) if (p.alive) leave(p, p.x, p.y); st.stall = null; }
        else {
          S.t -= dt; S.pt -= dt;
          if (S.pt <= 0) { v.cle.push = !v.cle.push; S.pt = v.cle.push ? rr(1.8, 2.6) : rr(1.2, 2); if (v.cle.push && S.pushers[0] && S.pushers[0].alive && rnd() < 0.6) bark(S.pushers[0], line('push')); }
          if (S.t <= 0) {
            v.cle.stall = false; v.cle.push = false; v.cle.vmax = 14;
            sfx('diesel_start', v.x, v.y, { vol: 0.6 });
            for (let i = 0; i < 10; i++) emit(PK.EXH, v.x - Math.cos(v.angle) * 30, v.y - Math.sin(v.angle) * 30, 2, -Math.cos(v.angle) * 10 + rr(-4, 4), -Math.sin(v.angle) * 10 + rr(-4, 4), rr(3, 6), rr(2, 3.4), rr(3, 4.5), 10);
            const p0 = S.pushers.find((p) => p.alive); if (p0) bark(p0, line('pushDone'), { force: true });
            for (const p of S.pushers) if (p.alive) { const q = at(v.cle.lane ? v.cle.lane.arm : s.arms[0], (v.cle.d || 40) + 20, -((v.cle.lane ? v.cle.lane.arm.w : 24) / 2 + 6)); leave(p, q.x, q.y); }
            beat(sc, 'bus_started');
            st.stall = null;
          }
        }
      }
      // the lorry reversing with its helper
      const Lr = st.lorry;
      if (Lr) {
        const v = Lr.v, h = Lr.helper;
        if (!v.alive || !v.cle) st.lorry = null;
        else {
          Lr.t -= dt;
          const rear = { x: v.x - Math.cos(v.angle) * (v.T.w / 2 + 7), y: v.y - Math.sin(v.angle) * (v.T.w / 2 + 7) };
          v.cle.revStop = Math.hypot(rear.x - s.x, rear.y - s.y) < J.jr + 4 || blockedBehind(v, sc);
          if (h && h.alive) { h.tx = rear.x - Math.cos(v.angle) * 4 + Math.sin(v.angle) * 5; h.ty = rear.y - Math.sin(v.angle) * 4 - Math.cos(v.angle) * 5; h.face = Math.atan2(v.y - h.y, v.x - h.x); }
          Lr.barkT -= dt; Lr.beepT -= dt;
          if (Lr.beepT <= 0 && v.cle.mode === 'rev') { Lr.beepT = 2.4; sfx('cle_reverse', v.x, v.y, { vol: 0.45, gap: 1.5 }); }
          if (Lr.barkT <= 0 && h && h.alive) { Lr.barkT = rr(3, 5); bark(h, line('lorry')); }
          if (Lr.t <= 0 && v.cle.mode === 'rev') {
            const pts = [v.x, v.y];
            for (let d = (v.cle.d || J.jr + 60) + 20; d < Lr.A.len; d += 40) { const q = at(Lr.A, d, Lr.off); pts.push(q.x, q.y); }
            const q = at(Lr.A, Lr.A.len, Lr.off); pts.push(q.x, q.y);
            v.cle.path = pts; v.cle.pi = 0; v.cle.mode = 'leave'; v.cle.then = 'gone'; v.cle.vmax = 24;
            if (h && h.alive) goIn(h, v.x, v.y);
            beat(sc, 'lorry_gone'); st.lorry = null;
          }
        }
      }
      // pedestrians weaving between the bumpers
      st.weaveT -= dt;
      let weavers = 0; for (let i = 0; i < sc.persons.length; i++) if (sc.persons[i].tag === 'weave') weavers++;
      if (st.weaveT <= 0 && weavers < Math.round(1 + sc.level * 3)) { st.weaveT = rr(2, 5); spawnWeaver(sc, J); }
      // two-wheelers up on the footpath
      st.fpT -= dt;
      if (st.fpT <= 0 && sc.level > 0.35) { st.fpT = rr(10, 18); footpathBike(sc, J); }
      // an auto squeezing through the gaps
      st.sqT -= dt;
      if (st.sqT <= 0 && sc.level > 0.3) { st.sqT = rr(12, 22); squeezeAuto(sc, J); }
      // the cow, unbothered
      st.mooT -= dt;
      if (st.mooT <= 0 && st.cow && st.cow.alive) { st.mooT = rr(14, 26); sfx('cow_moo', st.cow.x, st.cow.y, { vol: 0.45, gap: 6 }); if (rnd() < 0.3) { const p = sc.persons.find((q) => q.tag === 'weave' && q.alive); if (p) bark(p, line('cow')); } }
      // the havaldar whistles at a kid on a cycle
      st.kidCD -= dt;
      const cop = copOf(sc);
      if (cop && st.kidCD <= 0 && onCycle() && dPl(cop.x, cop.y) < 70) {
        st.kidCD = 14; sfx('whistle', cop.x, cop.y, { vol: 0.65, gap: 1 }); bark(cop, line('havaldarKid'), { force: true }); beat(sc, 'whistle_kid');
      }
      st.whT -= dt;
      if (st.whT <= 0 && cop) { st.whT = rr(5, 10); if (!calm && dPl(cop.x, cop.y) < 360) sfx('whistle', cop.x, cop.y, { vol: 0.4, gap: 2 }); }
      // dust kicked up in the box
      st.dustT -= dt;
      if (st.dustT <= 0 && dPl(s.x, s.y) < 320) { st.dustT = rr(0.25, 0.6) / (0.4 + sc.level); const a = rnd() * TAU, r = rnd() * (J.jr + 30); emit(PK.DUST, s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, 0.4, rr(-5, 5), rr(-5, 5), rr(1, 3), rr(2, 3.5), rr(2.5, 4.5), 0); }
      // tidy: weavers who reached the far footpath walk on
      sc.phase = J.clearing ? 'clearing' : jamCount(J) >= Math.round(sc.level * J.cap) - 1 ? 'jammed' : 'building';
    },
    stop(sc) {},
  };
  function blockedBehind(v, sc) { return blockedAhead(v, v.cle, 8, true); }
  function spawnWeaver(sc, J) {
    const A = pick(J.arms), hw = A.w / 2, fw = Math.max(3, footW(A.kind));
    const d = rr(J.jr + 14, Math.min(A.len - 20, J.jr + 100));
    const sgn = rnd() < 0.5 ? 1 : -1;
    const a0 = at(A, d, sgn * (hw + fw * 0.5)), a3 = at(A, d + rr(-16, 16), -sgn * (hw + fw * 0.5));
    if (seen(a0.x, a0.y, -10) && sc.t > 3) {
      // start from a doorway-ish point on the footpath a little further out (no popping in view)
      const b = at(A, Math.min(A.len - 5, d + 60), sgn * (hw + fw * 0.5));
      if (seen(b.x, b.y, 10)) return null;
    }
    const pts = [a0.x, a0.y];
    for (let i = 1; i <= 3; i++) { const q = at(A, d + rr(-7, 7), sgn * (hw - (2 * hw * i) / 4) + rr(-2, 2)); pts.push(q.x, q.y); }
    pts.push(a3.x, a3.y);
    const fin = at(A, Math.min(A.len, d + rr(60, 140)), -sgn * (hw + fw * 0.5)); pts.push(fin.x, fin.y);
    const p = newPerson(sc, pick(['man', 'aunty', 'student', 'uncle', 'woman', 'youth', 'porter']), a0.x, a0.y, { tag: 'weave' });
    if (!p) return null;
    setPath(p, pts, 'leave', rr(24, 34));
    p.tx = fin.x; p.ty = fin.y;
    if (rnd() < 0.3) p.barkCD = 0;
    return p;
  }
  function footpathBike(sc, J) {
    const arms = J.arms.filter((a) => footW(a.kind) >= 4 && a.len > 140);
    if (!arms.length) return;
    const A = pick(arms), hw = A.w / 2, fw = footW(A.kind), off = hw + fw * 0.5;
    const d0 = Math.min(A.len - 10, J.jr + 150);
    const q0 = at(A, d0, -hw * 0.85);
    if (seen(q0.x, q0.y, 10)) return;
    const v = spawnVeh(sc, pick(['chetak', 'luna', 'rx100', 'scooty', 'chetak']), q0.x, q0.y, Math.atan2(-q0.uy, -q0.ux), { mode: 'path', vmax: 13 });
    if (!v) return;
    const pts = [q0.x, q0.y];
    let q = at(A, d0 - 14, -off); pts.push(q.x, q.y);
    for (let d = d0 - 40; d > J.jr + 22; d -= 26) { q = at(A, d, -off); pts.push(q.x, q.y); }
    q = at(A, J.jr + 8, -hw * 0.7); pts.push(q.x, q.y);
    v.cle.path = pts; v.cle.pi = 0; v.cle.then = 'hold';
    v.cle.onEnd = (veh) => { if (veh.cle) jamDepart(sc, J, veh); };
    v.cle.tag = 'footpath';
    beat(sc, 'footpath');
  }
  function squeezeAuto(sc, J) {
    let pickV = null;
    for (const l of J.lanes) { if (l.ai === J.green) continue; for (let i = 1; i < l.q.length; i++) if (l.q[i].type === 'auto') { pickV = l.q[i]; break; } if (pickV) break; }
    if (!pickV) return;
    const v = pickV, c = v.cle, lane = c.lane, A = lane.arm;
    const i = lane.q.indexOf(v); if (i >= 0) lane.q.splice(i, 1); c.lane = null;
    const pts = [v.x, v.y];
    for (let d = (c.d || 60) - 12; d > J.jr; d -= 14) { const q = at(A, d, -A.w / 2 * (0.12 + ((d / 14) & 1) * 0.12)); pts.push(q.x, q.y); }
    const ex = J.arms[(J.arms.indexOf(A) + 1 + ((rnd() * (J.arms.length - 1)) | 0)) % J.arms.length] || A;
    let q = at(ex, J.jr * 0.6, ex.w / 4); pts.push(q.x, q.y);
    for (let d = J.jr + 30; d < ex.len; d += 40) { q = at(ex, d, ex.w / 4); pts.push(q.x, q.y); }
    c.path = pts; c.pi = 0; c.mode = 'leave'; c.then = 'gone'; c.vmax = 11; c.tag = 'squeeze';
    for (let k = 0; k < 3; k++) c.hd = 0.1; // one honk now; the rest when blocked
    beat(sc, 'squeeze');
  }

  /* ================================================================ 5 + 6. COLONY LANES */
  const COLONY_EXTRA = [{ id: 'home', place: 'home' }, { id: 'friend_home', place: 'friend_home' }];
  const GEOS = [];
  /** why candidate lanes / routes were turned down (build-time diagnostics, E._debug.REJ) */
  const REJ = {};
  const rej = (k) => { REJ[k] = (REJ[k] || 0) + 1; return null; };
  function colonyGeo(id, x, y) {
    const R = RD();
    const n = nearNode(x, y, 240, (q) => {
      if (q.deg < 2 || q.deg > 3) return false;
      let ok = false;
      for (const eid of q.inc) { const e = R.edges[eid]; if (e && (e.kind === 'lane' || e.kind === 'street')) { ok = true; break; } }
      return ok && worshipDist(q.x, q.y, COLONY_CLEAR) >= COLONY_CLEAR && !busyAt(q.x, q.y);
    });
    if (!n) return rej('node');
    if (GEOS.some((g) => g.n === n)) return rej('dup');
    const path = throughPath(n, 105);
    if (!path || path.len < 150) return rej('path');
    const hw = path.w / 2, foot = footW(path.kind);
    const doors = [];
    const S = [-66, -40, -14, 12, 38, 64];
    for (let i = 0; i < S.length; i++) {
      const side = i % 2 ? 1 : -1, s = path.mid + S[i];
      if (s < 10 || s > path.len - 10) continue;
      const q = at(path, s, side * (hw + foot + 4.5), PT2);
      const f = freeSpot(q.x, q.y, 2);
      if (!f) continue;
      try { if (N.world.surfaceAt(f.x, f.y) === N.SURF.ROAD) continue; } catch (e) { /* ok */ }
      const nx = q.uy * side, ny = -q.ux * side; // towards the house
      doors.push({ x: f.x, y: f.y, s, side, nx, ny, a: Math.atan2(-ny, -nx), ix: f.x + nx * 3, iy: f.y + ny * 3 });
    }
    if (doors.length < 3) return rej('doors');
    // the whole lane (where the cricket, the milkman and the chairs go) keeps off worship places and busy spots
    if (!pathClear(path, COLONY_CLEAR, true, doors)) return rej('clear');
    const g = { id, path, hw, foot, doors, n, x: n.x, y: n.y, day: -1, mugg: [], papers: [], style: styleAt(n.x, n.y), near: false };
    GEOS.push(g);
    return g;
  }
  const COLONY_CLEAR = 120;
  /** where to look first in a district: Secunderabad's centroid is the station / Rathifile bus station
     (commercial), so its colony lane is looked for on the Bowenpally / Sikh Village side instead;
     Marredpally's is looked for in West Marredpally's residential streets */
  const COLONY_HINT = { secunderabad: [9900, 900], marredpally: [10950, 900] };
  const polyPts = (d) => { const P = d.poly || d.pts || d.polygon; return Array.isArray(P) && P.length > 2 ? P.map((p) => (Array.isArray(p) ? p : [p.x, p.y])) : null; };
  /** candidate lane points around a hint: the hint, then vertices of lanes / streets nearby, nearest first */
  function colonyCands(hx, hy, R, did) {
    const out = [[hx, hy, 0]];
    const roads = (N.WORLD_DATA && N.WORLD_DATA.roads) || [];
    const seen = new Set();
    for (const r of roads) {
      if (r.kind !== 'lane' && r.kind !== 'street') continue;
      for (const p of r.pts || []) {
        const d = Math.hypot(p[0] - hx, p[1] - hy);
        if (d > R || d < 60) continue;
        if (did && districtOf(p[0], p[1]) !== did) continue;
        const key = ((p[0] / 90) | 0) + ':' + ((p[1] / 90) | 0);
        if (seen.has(key)) continue; seen.add(key);
        out.push([p[0], p[1], d + (r.kind === 'lane' ? 0 : 60)]);
      }
    }
    out.sort((a, b) => a[2] - b[2]);
    return out.slice(0, 28);
  }
  function buildColonies() {
    const D = (N.world.data && N.world.data.districts) || (N.WORLD_DATA && N.WORLD_DATA.districts) || [];
    const used = [];
    const mk = (id, hx, hy, R, did) => {
      for (const c of colonyCands(hx, hy, R, did)) {
        const x = c[0], y = c[1];
        if (used.some((u) => Math.hypot(u[0] - x, u[1] - y) < 260)) continue;
        const g = colonyGeo(id, x, y);
        if (!g) continue;
        if (used.some((u) => Math.hypot(u[0] - g.x, u[1] - g.y) < 260)) { GEOS.pop(); continue; }
        used.push([g.x, g.y]);
        addSite({ id: 'colony_am:' + id, kind: 'colony_am', x: g.x, y: g.y, geo: g, style: g.style });
        addSite({ id: 'colony_pm:' + id, kind: 'colony_pm', x: g.x, y: g.y, geo: g, style: g.style });
        return;
      }
    };
    for (const e of COLONY_EXTRA) { const p = N.places[e.place]; if (p) mk(e.id, p.x + 20, p.y + 10, 420, null); }
    for (const d of D) {
      if (d.style !== 'colony' && d.style !== 'cantonment') continue;
      const pts = polyPts(d);
      let cx = d.x, cy = d.y;
      if ((!isFinite(cx) || !isFinite(cy)) && pts) {
        cx = 0; cy = 0; let n = 0;
        for (const p of pts) { if (isFinite(p[0])) { cx += p[0]; cy += p[1]; n++; } }
        if (!n) continue; cx /= n; cy /= n;
      }
      const h = COLONY_HINT[d.id];
      if (h) { cx = h[0]; cy = h[1]; }
      if (!isFinite(cx) || !isFinite(cy)) continue;
      mk(d.id, cx, cy, 900, d.id);
    }
  }
  /** the day's muggulu (and the papers at the doors) for a lane: they stay on the ground all day */
  function muggFor(g) {
    const d = dayN();
    if (g.day === d) return g.mugg;
    g.day = d; g.mugg = []; g.papers = [];
    const rng = U.rng('mugg:' + g.id + ':' + d);
    for (const door of g.doors) {
      if (rng.next() > 0.8) continue;
      const out = 6 + rng.next() * 1.4;
      g.mugg.push({ door, x: door.x - door.nx * out, y: door.y - door.ny * out, a: door.a, seed: (rng.next() * 1e9) | 0, start: 355 + rng.next() * 55, dur: 30 + rng.next() * 20, prog: 0, live: 0, r: 4.6 + rng.next() * 2.2, n: 5 + ((rng.next() * 3) | 0) * 2 - 2, kind: (rng.next() * 3) | 0, cols: [pick(['#e8306a', '#f2a020', '#30a050', '#2a6ad8', '#c83aa8', '#f2d020'])], img: null, drawer: null });
    }
    return g.mugg;
  }
  function muggProg(M) {
    const m = CX.m;
    const cp = m >= 1380 ? 1 : clamp((m - M.start) / M.dur, 0, 1);
    return Math.max(cp, M.live);
  }
  const KAM = {
    label: 'Colony morning',
    level(s, c) { return peak(c.m, [[365, 535, 1]]) * (c.rain > 0.5 ? 0.4 : 1); },
    start(sc, warm) {
      const g = sc.site.geo;
      muggFor(g);
      sc.st = { g, milk: null, milkT: warm ? rr(0.5, 2) : rr(3, 8), boy: null, boyT: warm ? rr(1, 3) : rr(3, 9), auto: null, autoT: rr(2, 6), gossip: [], gosT: rr(3, 6), tanker: null, throws: [] };
      const m = CX.m, f = forced(sc);
      // aunties chatting at a gate
      if ((m >= 400 && m <= 560) || f) {
        const door = g.doors[(g.doors.length / 2) | 0];
        const cx = door.x - door.nx * 2, cy = door.y - door.ny * 2;
        const n = 2 + (rnd() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + 0.4, px = cx + Math.cos(a) * 2.6, py = cy + Math.sin(a) * 2.6;
          const p = newPerson(sc, 'aunty', px, py, { beh: 'stand', face: Math.atan2(cy - py, cx - px), tag: 'gossip' });
          if (p) { p.tx = px; p.ty = py; sc.st.gossip.push(p); if (i === 0 && rnd() < 0.5) p.item = 'vessel'; }
        }
      }
      if ((CX.summer || phaseOn(sc, 'tanker')) && ((m >= 390 && m <= 600) || f)) startTanker(sc);
    },
    update(sc, dt) {
      const st = sc.st, g = st.g, m = CX.m, f = forced(sc), rain = CX.rain > 0.5;
      // muggulu: an aunty crouches at each doorstep until her pattern is done, then goes back in
      for (const M of g.mugg) {
        const pr = muggProg(M);
        M.prog = pr;
        const drawing = pr < 1 && (m >= M.start || (f && M.live > 0) || (f && phaseOn(sc, 'muggu'))) && !rain;
        if (drawing && (!M.drawer || !M.drawer.alive || M.drawer.sc !== sc)) {
          if (f && m < M.start && M.live === 0) M.live = 0.02;
          const px = M.x + M.door.nx * (M.r + 1.6), py = M.y + M.door.ny * (M.r + 1.6);
          if (!seen(M.door.x, M.door.y, -30) || sc.t < 1 || f) {
            const p = newPerson(sc, 'aunty', px, py, { beh: 'work', face: Math.atan2(M.y - py, M.x - px), tag: 'muggu' });
            if (p) { p.tx = px; p.ty = py; M.drawer = p; }
          }
        }
        if (M.drawer && M.drawer.alive && M.drawer.sc === sc) {
          const p = M.drawer;
          if (pr < 1) {
            M.live = Math.min(1, M.live + dt / 42);
            // her hand sweeps round the pattern; the powder trickles
            const a = p.t * 1.7, rr0 = M.r * clamp(pr * 1.1, 0.15, 1);
            p.tx = M.x + M.door.nx * (M.r + 1.6) + Math.cos(a) * 0.8; p.ty = M.y + M.door.ny * (M.r + 1.6) + Math.sin(a) * 0.8;
            if (rnd() < dt * 6) emit(PK.POWDER, M.x + Math.cos(a * 2.3) * rr0, M.y + Math.sin(a * 2.3) * rr0, 1.6, rr(-1, 1), rr(-1, 1), -2, 0.5, 0.6, 7);
            if (p.barkCD <= 0 && rnd() < dt * 0.05) { p.barkCD = 20; bark(p, line('muggu')); }
          } else { goIn(p, M.door.ix, M.door.iy); M.drawer = null; beat(sc, 'muggu_done'); }
        }
      }
      // the milkman
      st.milkT -= dt;
      if (!st.milk && st.milkT <= 0 && ((m >= 360 && m <= 500) || f) && !rain) startRider(sc, 'milk');
      if (st.milk) riderTick(sc, st.milk, dt);
      // the paper boy
      st.boyT -= dt;
      if (!st.boy && st.boyT <= 0 && ((m >= 350 && m <= 470) || f)) startRider(sc, 'paper');
      if (st.boy) riderTick(sc, st.boy, dt);
      for (let i = st.throws.length - 1; i >= 0; i--) {
        const T = st.throws[i]; T.t += dt;
        if (T.t >= T.dur) { g.papers.push({ x: T.x1, y: T.y1, a: T.a }); st.throws.splice(i, 1); sfx('paper', T.x1, T.y1, { vol: 0.5, gap: 0.3 }); }
      }
      // the school auto (school days)
      st.autoT -= dt;
      if (!st.auto && st.autoT <= 0 && ((CX.school && m >= 440 && m <= 525) || phaseOn(sc, 'school'))) startRider(sc, 'auto');
      if (st.auto) riderTick(sc, st.auto, dt);
      // gossip
      st.gosT -= dt;
      if (st.gosT <= 0 && st.gossip.length) {
        st.gosT = rr(5, 9);
        const p = pick(st.gossip);
        if (p && p.alive) { bark(p, line('gossip')); sfx('gossip', p.x, p.y, { vol: 0.35, gap: 4 }); p.lookAt = st.gossip[(st.gossip.indexOf(p) + 1) % st.gossip.length]; p.lookT = 3; }
      }
      for (let i = st.gossip.length - 1; i >= 0; i--) if (!st.gossip[i].alive || st.gossip[i].sc !== sc) st.gossip.splice(i, 1);
      if (st.tanker) tankerTick(sc, dt);
      sc.phase = st.tanker ? 'tanker' : st.auto ? 'school' : g.mugg.some((M) => M.drawer) ? 'muggu' : 'morning';
      if (sc.level <= 0.02 && !f) for (const p of st.gossip) goIn(p, p.x + 3, p.y);
    },
    stop(sc) { const st = sc.st; if (st.tanker) for (const b of sc.blocks) N.entities.remove(b); },
  };
  /** cyclists / the school auto riding the lane: the milkman stops at doors, the paper boy throws, the auto picks up a kid */
  function startRider(sc, what) {
    const st = sc.st, g = st.g, P0 = g.path;
    const fwd = rnd() < 0.5;
    const off = P0.w / 2 * 0.5;
    const s0 = fwd ? 4 : P0.len - 4, s1 = fwd ? P0.len - 2 : 2;
    const q0 = at(P0, s0, fwd ? off : -off);
    if (seen(q0.x, q0.y, 10) && !forced(sc)) { st[what === 'milk' ? 'milkT' : what === 'paper' ? 'boyT' : 'autoT'] = 3; return; }
    const ang = fwd ? Math.atan2(q0.uy, q0.ux) : Math.atan2(-q0.uy, -q0.ux);
    const type = what === 'auto' ? 'auto' : (N.vehicles.TYPES.hero_cycle ? 'hero_cycle' : 'cycle');
    const look = what === 'milk' ? Object.assign({}, lookFor('lungi', sc.style), { towel: '#f2efe6' }) : what === 'paper' ? lookFor('student', sc.style) : null;
    const v = spawnVeh(sc, type, q0.x, q0.y, ang, { mode: 'path', vmax: what === 'auto' ? 22 : what === 'paper' ? 20 : 14, look, cans: what === 'milk', papers: what === 'paper', kids: what === 'auto' ? 5 : 0, must: true });
    if (!v) { st[what === 'milk' ? 'milkT' : what === 'paper' ? 'boyT' : 'autoT'] = 4; return; }
    const pts = [];
    for (let k = 0; k <= 12; k++) { const s = lerp(s0, s1, k / 12); const q = at(P0, s, fwd ? off : -off); pts.push(q.x, q.y); }
    v.cle.path = pts; v.cle.pi = 0; v.cle.then = 'gone';
    // stops: the milkman at two doors, the auto at one
    const doors = g.doors.slice().sort((a, b) => (fwd ? a.s - b.s : b.s - a.s));
    const stops = what === 'milk' ? doors.filter((d, i) => i % 2 === 0).slice(0, 2) : what === 'auto' ? [doors[(doors.length / 2) | 0]] : [];
    const R = { what, v, fwd, stops, k: 0, ph: 'ride', t: 0, who: null, thrown: new Set() };
    if (what === 'milk') st.milk = R; else if (what === 'paper') st.boy = R; else st.auto = R;
    if (what === 'milk') { sfx('bell', v.x, v.y, { vol: 0.5 }); beat(sc, 'milkman'); }
    if (what === 'paper') beat(sc, 'paperboy');
    if (what === 'auto') { honk(v, 0.2); beat(sc, 'school_auto'); }
  }
  function riderTick(sc, R, dt) {
    const st = sc.st, g = st.g, v = R.v, P0 = g.path;
    if (!v.alive || !v.cle) { endRider(sc, R); return; }
    R.t += dt;
    const s = along(P0, v.x, v.y);
    if (R.ph === 'ride') {
      const nx = R.stops[R.k];
      if (nx && Math.abs(s - nx.s) < 5) { R.ph = 'stop'; R.t = 0; v.cle.mode = 'park'; }
      if (R.what === 'paper') {
        for (const d of g.doors) {
          if (R.thrown.has(d) || Math.abs(s - d.s) > 7) continue;
          R.thrown.add(d);
          const tx = d.x - d.nx * 1.2 + rr(-1, 1), ty = d.y - d.ny * 1.2 + rr(-1, 1);
          st.throws.push({ x0: v.x, y0: v.y, x1: tx, y1: ty, t: 0, dur: 0.55, a: rnd() * TAU });
          if (rnd() < 0.4) bark(v, line('paper'));
        }
      }
      if (v.cle.mode === 'gone') { endRider(sc, R); return; }
    } else if (R.ph === 'stop') {
      const d = R.stops[R.k];
      if (R.what === 'milk') {
        if (R.t > 0.2 && !R.who) {
          sfx('bell', v.x, v.y, { vol: 0.55, gap: 0.5 }); bark(v, line('milk'));
          const p = newPerson(sc, 'aunty', d.ix, d.iy, { beh: 'goto', item: 'vessel' });
          if (p) { const ca = Math.cos(v.angle), sa = Math.sin(v.angle); goTo(p, v.x - sa * 5 * (R.fwd ? 1 : -1) * 0 + d.nx * 0 + (v.x - d.x) * 0, v.y, 'stand'); p.tx = v.x + (d.x - v.x) * 0.25 - ca * 2; p.ty = v.y + (d.y - v.y) * 0.25 - sa * 2; R.who = p; }
          else R.who = { alive: false };
        }
        const p = R.who;
        if (p && p.alive && p.arrived && !R.served) { R.served = true; R.t2 = R.t; p.face = Math.atan2(v.y - p.y, v.x - p.x); if (rnd() < 0.7) bark(p, line('milkAunty')); sfx('cup_clink', p.x, p.y, { vol: 0.35, gap: 0.5 }); }
        if ((R.served && R.t - R.t2 > 3.2) || R.t > 16 || (p && !p.alive && R.t > 2)) {
          if (p && p.alive) goIn(p, d.ix, d.iy);
          R.who = null; R.served = false; R.k++; R.ph = 'ride'; v.cle.mode = 'path';
        }
      } else if (R.what === 'auto') {
        if (R.t > 0.4 && !R.who) {
          honk(v, 0.25); honk(v, 0.25);
          const p = newPerson(sc, 'student', d.ix, d.iy, { beh: 'goto', spd: 48 });
          if (p) { goTo(p, v.x + (d.x - v.x) * 0.3, v.y + (d.y - v.y) * 0.3, 'stand'); R.who = p; if (rnd() < 0.8) { const m0 = newPerson(sc, 'aunty', d.ix, d.iy, { beh: 'goto' }); if (m0) { goTo(m0, d.x, d.y, 'stand'); m0.tag = 'mother'; R.mom = m0; } } }
          else R.who = { alive: false };
        }
        const p = R.who;
        if (p && p.alive && p.arrived) { freePerson(p); v.cle.kids++; R.who = { alive: false, done: true }; R.t3 = R.t; if (R.mom && R.mom.alive) bark(R.mom, line('school')); }
        if ((R.who && R.who.done && R.t - R.t3 > 1.2) || R.t > 15) {
          if (R.mom && R.mom.alive) goIn(R.mom, d.ix, d.iy);
          R.k++; R.ph = 'ride'; v.cle.mode = 'path'; honk(v, 0.2);
        }
      }
    }
  }
  function endRider(sc, R) {
    const st = sc.st;
    if (R.who && R.who.alive) goIn(R.who, R.who.x, R.who.y);
    if (R.v && R.v.alive && R.v.cle) R.v.cle.mode = 'gone';
    if (st.milk === R) { st.milk = null; st.milkT = rr(25, 45); }
    if (st.boy === R) { st.boy = null; st.boyT = rr(30, 60); }
    if (st.auto === R) { st.auto = null; st.autoT = rr(20, 40); }
  }
  // the summer water tanker and its queue of coloured plastic pots (bindelu)
  const POTS = ['#d8302a', '#2a6ad8', '#30a050', '#f2c230', '#e86a20', '#8a3ad8'];
  function startTanker(sc) {
    const st = sc.st, g = st.g, P0 = g.path;
    const s = P0.mid + 18, side = -1;
    const q = at(P0, s, side * (g.hw * 0.55));
    const ang = Math.atan2(q.uy, q.ux);
    const T = { x: q.x, y: q.y, a: ang, ux: q.ux, uy: q.uy, side, queue: [], fillT: 0, n: 0, spawnT: 0.2, pots: [] };
    addBlock(sc, q.x + q.ux * 8, q.y + q.uy * 8, 6); addBlock(sc, q.x - q.ux * 6, q.y - q.uy * 6, 6);
    // the tap is at the back; the queue snakes back along the kerb
    T.tap = { x: q.x - q.ux * 16, y: q.y - q.uy * 16 };
    const qs = at(P0, s - 22, side * (g.hw + g.foot * 0.5 + 1));
    T.qx = qs.x; T.qy = qs.y; T.qux = -q.ux; T.quy = -q.uy;
    for (let i = 0; i < 7; i++) T.pots.push({ x: T.qx + T.qux * (i * 3.4 + 6), y: T.qy + T.quy * (i * 3.4 + 6), col: POTS[i % POTS.length] });
    st.tanker = T;
    beat(sc, 'tanker');
  }
  function tankerTick(sc, dt) {
    const st = sc.st, T = st.tanker, g = st.g;
    T.spawnT -= dt;
    if (T.spawnT <= 0 && T.queue.length < (lowTier() ? 5 : 7)) {
      T.spawnT = rr(1.5, 3.5);
      const d = pick(g.doors);
      const p = newPerson(sc, rnd() < 0.7 ? 'aunty' : 'kid', d.ix, d.iy, { beh: 'goto', item: 'pot', itemCol: pick(POTS), tag: 'queue' });
      if (p) T.queue.push(p);
    }
    for (let i = T.queue.length - 1; i >= 0; i--) if (!T.queue[i].alive || T.queue[i].sc !== sc) T.queue.splice(i, 1);
    for (let i = 0; i < T.queue.length; i++) {
      const p = T.queue[i];
      const tx = i === 0 ? T.tap.x + T.quy * 3 : T.qx + T.qux * (i * 3.6), ty = i === 0 ? T.tap.y - T.qux * 3 : T.qy + T.quy * (i * 3.6);
      if (p.beh === 'goto' || p.beh === 'stand') { p.tx = tx; p.ty = ty; p.face = Math.atan2(T.tap.y - p.y, T.tap.x - p.x); if (p.beh === 'goto' && Math.hypot(tx - p.x, ty - p.y) < 2) p.beh = 'stand'; }
    }
    const front = T.queue[0];
    if (front && front.beh === 'stand' && Math.hypot(front.x - front.tx, front.y - front.ty) < 2.5) {
      T.fillT += dt;
      if (rnd() < dt * 18) emit(PK.WATER, T.tap.x + rr(-0.5, 0.5), T.tap.y + rr(-0.5, 0.5), 3.2, rr(-2, 2) + T.quy * 4, rr(-2, 2) - T.qux * 4, rr(0, 3), 0.5, 0.5, 9);
      if (T.fillT > 3.5) {
        T.fillT = 0; T.n++;
        const col = front.itemCol;
        front.look = withProp(front.look, 'pot'); front.item = 'pothead'; front.itemCol = col;
        const d = pick(g.doors); goIn(front, d.ix, d.iy);
        T.queue.shift();
        if (rnd() < 0.5) bark(front, line('tanker'));
        sfx('splash', T.tap.x, T.tap.y, { vol: 0.3, gap: 1 });
      }
    }
  }
  // 6. evenings
  const CHAIRS = ['#c8302a', '#2a6ab8', '#f2f0ea', '#3a8a4a', '#f2c230'];
  const KPM = {
    label: 'Colony evening',
    level(s, c) { return peak(c.m, [[1055, 1255, 1]]) * (c.rain > 0.5 ? 0.35 : 1) + (c.power && c.m > 1080 && c.m < 1290 ? 0.4 : 0); },
    start(sc, warm) {
      const g = sc.site.geo, st = sc.st;
      Object.assign(st, { g, cricket: null, uncles: [], chairs: [], power: false, extras: [], candles: [], inv: null, invT: 0, unT: rr(4, 8), invite: 0 });
      const m = CX.m, f = forced(sc), rain = CX.rain > 0.5;
      if (!rain && ((m >= 1010 && m <= 1175) || (f && !phaseOn(sc, 'power')))) startCricket(sc);
      if ((m >= 1050 && m <= 1275) || f) {
        const door = g.doors[g.doors.length - 1];
        for (let i = 0; i < 2 + (rnd() < 0.4 ? 1 : 0); i++) {
          const lat = (i - 0.5) * 4.6;
          const cx = door.x - door.nx * 1.5 + door.ny * lat, cy = door.y - door.ny * 1.5 - door.nx * lat;
          const ch = { x: cx, y: cy, a: Math.atan2(-door.ny, -door.nx) + (i - 0.5) * 0.5, col: CHAIRS[(i + (sc.uid | 0)) % CHAIRS.length] };
          st.chairs.push(ch);
          const p = newPerson(sc, rnd() < 0.6 ? 'uncle' : 'old', cx, cy, { beh: 'sit', face: ch.a, item: i === 0 ? 'paper' : null, chair: ch, ghost: true, tag: 'uncle' });
          if (p) { p.tx = cx; p.ty = cy; p.angle = ch.a; st.uncles.push(p); }
        }
        addBlock(sc, door.x - door.nx * 1.5, door.y - door.ny * 1.5, 4);
      }
    },
    update(sc, dt) {
      const st = sc.st, g = st.g, f = forced(sc);
      const want = CX.power || !!(f && (f.power || phaseOn(sc, 'power')));
      if (want && !st.power) powerOff(sc); else if (!want && st.power) powerOn(sc);
      if (st.cricket) cricketTick(sc, dt);
      // uncles chatting
      st.unT -= dt;
      if (st.unT <= 0 && st.uncles.length) { st.unT = rr(7, 12); const p = pick(st.uncles); if (p && p.alive) bark(p, line(st.power ? 'power' : 'uncles')); }
      if (st.power) {
        st.invT -= dt;
        if (st.invT <= 0 && st.inv && dPl(st.inv.x, st.inv.y) < 200) { st.invT = 1.3; if (sfx('cle_inverter', st.inv.x, st.inv.y, { vol: 0.5, gap: 1.1 })) ST.sfxLoops++; }
        for (const p of st.extras) {
          if (!p.alive) continue;
          if (p.tag === 'pkid' && (p.beh === 'stand' || p.arrived) && rnd() < dt * 0.6) { const d = pick(g.doors); goTo(p, d.x - d.nx * rr(3, 8), d.y - d.ny * rr(3, 8), 'stand', 46); }
        }
      }
      sc.phase = st.power ? 'powercut' : st.cricket ? 'cricket' : 'evening';
      if (sc.level <= 0.02 && !f) { for (const p of st.uncles) if (p.alive) goIn(p, g.doors[0].ix, g.doors[0].iy); }
    },
    stop(sc) {},
  };
  function powerOff(sc) {
    const st = sc.st, g = st.g;
    st.power = true;
    const d0 = g.doors[0];
    st.inv = { x: d0.ix, y: d0.iy };
    for (let i = 0; i < Math.min(4, g.doors.length); i++) { const d = g.doors[(i * 2 + 1) % g.doors.length]; st.candles.push({ x: d.x + d.nx * 1.2 - d.ny * 2, y: d.y + d.ny * 1.2 + d.nx * 2, h: 3.4, ph: rnd() * 6 }); }
    const n = lowTier() ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const d = g.doors[i % g.doors.length];
      const role = i % 3 === 2 ? 'kid' : i % 3 === 1 ? 'aunty' : pick(['uncle', 'lungi', 'old', 'woman']);
      const p = newPerson(sc, role, d.ix, d.iy, { beh: 'goto', item: role === 'kid' ? null : i % 2 ? 'fan' : 'candle', tag: role === 'kid' ? 'pkid' : 'pout' });
      if (p) { goTo(p, d.x - d.nx * rr(2, 5) + rr(-3, 3), d.y - d.ny * rr(2, 5) + rr(-3, 3), 'stand'); st.extras.push(p); }
    }
    for (const p of st.uncles) if (p.alive && !p.item) p.item = 'fan';
    const sp = st.extras[0] || st.uncles[0];
    if (sp) bark(sp, line('power'), { force: true });
    beat(sc, 'power_cut');
  }
  function powerOn(sc) {
    const st = sc.st;
    st.power = false; st.candles.length = 0; st.inv = null;
    const sp = st.extras.find((p) => p.alive);
    if (sp) bark(sp, line('powerBack'), { force: true });
    sfx('crowd_cheer', sc.site.x, sc.site.y, { vol: 0.3, gap: 3 });
    for (const p of st.extras) if (p.alive) { const d = pick(st.g.doors); goIn(p, d.ix, d.iy); }
    st.extras.length = 0;
    for (const p of st.uncles) if (p.alive && p.item === 'fan') p.item = null;
    beat(sc, 'power_back');
  }
  // gully cricket: a bowler, a batsman at a brick-and-slipper wicket, a keeper and fielders; the ball is simulated
  function startCricket(sc) {
    const st = sc.st, g = st.g, P0 = g.path;
    const sW = P0.mid - 26, sB = P0.mid + 2;
    const w = at(P0, sW, 0), b = at(P0, sB, 0);
    const C = { sW, sB, wx: w.x, wy: w.y, bx: b.x, by: b.y, ux: w.ux, uy: w.uy, ph: 'walk', t: 0, ball: { x: b.x, y: b.y, h: 5, vx: 0, vy: 0, vh: 0, live: false, held: null }, down: 0, runs: 0, outs: 0, fielders: [], target: null, lost: null, swing: 0, offer: null };
    const mk = (role, x, y, face, tag) => { const p = newPerson(sc, role, x, y, { beh: 'stand', face, tag, spd: 46 }); if (p) { p.tx = x; p.ty = y; } return p; };
    C.bat = mk('kid', w.x + w.ux * 2.5, w.y + w.uy * 2.5, Math.atan2(w.uy, w.ux), 'bat');
    if (C.bat) C.bat.look = withProp(C.bat.look, 'bat');
    C.bowl = mk('kid', b.x + b.ux * 6, b.y + b.uy * 6, Math.atan2(-w.uy, -w.ux), 'bowl');
    C.keep = mk('kid', w.x - w.ux * 5, w.y - w.uy * 5, Math.atan2(w.uy, w.ux), 'keep');
    const fp = [[sB - 8, g.hw * 0.75], [sW + 16, -g.hw * 0.8], [sB + 22, -g.hw * 0.4]];
    for (const f of fp) { const q = at(P0, f[0], f[1]); const p = mk(pick(['kid', 'kid', 'student']), q.x, q.y, Math.atan2(w.y - q.y, w.x - q.x), 'field'); if (p) { p.home = { x: q.x, y: q.y }; C.fielders.push(p); } }
    st.cricket = C;
    addBlock(sc, w.x - w.ux * 1, w.y - w.uy * 1, 1.6);
    beat(sc, 'cricket');
  }
  function throwBall(C, x, y, flight) {
    const B = C.ball, dx = x - B.x, dy = y - B.y, T = flight || 0.7;
    B.vx = dx / T; B.vy = dy / T; B.vh = 19 * T * 0.5 + (2 - B.h) / T; B.live = true; B.held = null; B.toT = T;
  }
  function cricketTick(sc, dt) {
    const st = sc.st, C = st.cricket, g = st.g, B = C.ball;
    if (!C.bat || !C.bat.alive || !C.bowl || !C.bowl.alive) { st.cricket = null; return; }
    C.t += dt; C.swing = Math.max(0, C.swing - dt * 3); if (C.down > 0) C.down -= dt;
    // ball physics
    if (B.held) { const h = B.held; B.x = h.x + Math.cos(h.angle) * 1.6; B.y = h.y + Math.sin(h.angle) * 1.6; B.h = 4.5; }
    else if (B.live) {
      B.vh -= 19 * dt; B.x += B.vx * dt; B.y += B.vy * dt; B.h += B.vh * dt;
      if (B.h < 0.4) { B.h = 0.4; if (B.vh < -3) { B.vh = -B.vh * 0.45; } else B.vh = 0; B.vx *= 0.82; B.vy *= 0.82; }
      if (!walkable(B.x, B.y) && C.ph !== 'lost') { B.vx = -B.vx * 0.4; B.vy = -B.vy * 0.4; B.x += B.vx * dt * 2; B.y += B.vy * dt * 2; }
      const pl0 = N.player;
      if (Math.hypot(B.x - pl0.x, B.y - pl0.y) < 3.5 && B.h < 8 && C.ph === 'field') { B.vx = -B.vx * 0.5; B.vy = -B.vy * 0.5; const p = C.fielders[0]; if (p && p.alive) bark(p, 'Chinnu, ball!'); }
    }
    const bow = C.bowl, bat = C.bat;
    switch (C.ph) {
      case 'walk': // the bowler walks back to his mark with the ball
        B.held = bow; bow.beh = 'goto'; bow.tx = C.bx + C.ux * 10; bow.ty = C.by + C.uy * 10;
        if (Math.hypot(bow.x - bow.tx, bow.y - bow.ty) < 2 || C.t > 4) { C.ph = 'runup'; C.t = 0; bow.tx = C.bx; bow.ty = C.by; bow.spd = 55; bow.beh = 'goto'; }
        break;
      case 'runup':
        B.held = bow;
        if (Math.hypot(bow.x - C.bx, bow.y - C.by) < 2.5 || C.t > 2.5) {
          C.ph = 'ball'; C.t = 0; B.held = null; B.live = true; B.x = bow.x; B.y = bow.y; B.h = 6.5;
          const tx = C.wx + C.ux * 0.8 + rr(-0.6, 0.6), ty = C.wy + C.uy * 0.8 + rr(-0.6, 0.6), T = 0.62;
          B.vx = (tx - B.x) / T; B.vy = (ty - B.y) / T; B.vh = (1.2 - 6.5) / T + 19 * T * 0.5;
          C.out = wpick({ hit: 50, miss: 24, bowled: 13, lost: 13 });
          if (phaseOn(sc, 'out') && C.outs === 0) C.out = 'bowled';
          if (phaseOn(sc, 'lost') && !C.lostOnce) { C.out = 'lost'; C.lostOnce = true; }
          bow.beh = 'goto'; bow.tx = C.bx - C.ux * 3; bow.ty = C.by - C.uy * 3; bow.spd = 30;
        }
        break;
      case 'ball': {
        if (C.t > 0.5 && C.t - dt <= 0.5) C.swing = 1;
        if (C.t >= 0.6) {
          C.t = 0;
          if (C.out === 'bowled') {
            C.down = 2.2; B.vx *= 0.3; B.vy *= 0.3; C.ph = 'out';
            sfx('howzat', C.wx, C.wy, { vol: 0.55, gap: 2 }); bark(bow, line('out'), { force: true }); C.outs++;
            for (let i = 0; i < 6; i++) emit(PK.DUST, C.wx, C.wy, 1, rr(-8, 8), rr(-8, 8), rr(2, 5), 1.2, 1.4, 0);
            beat(sc, 'out');
          } else if (C.out === 'miss') { C.ph = 'keeper'; }
          else {
            sfx('bat_hit', C.wx, C.wy, { vol: 0.6, gap: 0.3 });
            if (C.out === 'lost') { // over the compound wall into a house
              const d = pick(g.doors);
              C.lost = d; throwBall(C, d.x + d.nx * 9, d.y + d.ny * 9, 0.9); B.vh += 8; C.ph = 'lost';
              const k = C.fielders[0]; if (k && k.alive) bark(k, line('lost'), { force: true });
              beat(sc, 'ball_lost');
            } else {
              const a = Math.atan2(-C.uy, -C.ux) + rr(-0.9, 0.9), sp = rr(55, 95);
              B.vx = Math.cos(a) * sp; B.vy = Math.sin(a) * sp; B.vh = rr(4, 12); C.ph = 'field';
              if (rnd() < 0.5) bark(pick(C.fielders.filter((p) => p.alive)) || bow, line('cricket'));
              bat.beh = 'goto'; bat.tx = C.bx - C.ux * 2; bat.ty = C.by - C.uy * 2; bat.spd = 50; C.runs++;
            }
          }
        }
        break;
      }
      case 'field': { // the nearest fielder chases it down and throws it back to the bowler
        let best = null, bd = 1e9;
        for (const p of C.fielders) { if (!p.alive) continue; const d = Math.hypot(p.x - B.x, p.y - B.y); if (d < bd) { bd = d; best = p; } }
        if (best) { best.beh = 'goto'; best.tx = B.x; best.ty = B.y; best.spd = 52; if (bd < 2.6 && B.h < 5) { B.held = best; C.ph = 'return'; C.t = 0; C.thrower = best; } }
        if (C.t > 9) { C.ph = 'walk'; C.t = 0; B.held = bow; }
        break;
      }
      case 'return':
        if (C.t > 0.5 && B.held) { throwBall(C, bow.x, bow.y, 0.75); const p = C.thrower; if (p && p.home) { p.beh = 'goto'; p.tx = p.home.x; p.ty = p.home.y; p.spd = 34; } bat.beh = 'goto'; bat.tx = C.wx + C.ux * 2.5; bat.ty = C.wy + C.uy * 2.5; }
        if (!B.held && Math.hypot(B.x - bow.x, B.y - bow.y) < 3) { C.ph = 'walk'; C.t = 0; }
        if (C.t > 4) { C.ph = 'walk'; C.t = 0; }
        break;
      case 'keeper':
        if (C.keep && C.keep.alive && Math.hypot(B.x - C.keep.x, B.y - C.keep.y) < 4) { B.held = C.keep; C.ph = 'kret'; C.t = 0; }
        if (C.t > 1.5) { C.ph = 'walk'; C.t = 0; }
        break;
      case 'kret':
        if (C.t > 0.6 && B.held) throwBall(C, bow.x, bow.y, 0.8);
        if (C.t > 1.6) { C.ph = 'walk'; C.t = 0; }
        break;
      case 'out': // the batsman walks off, a fielder takes the bat
        if (C.t > 2.4) {
          const nb = C.fielders.find((p) => p.alive);
          if (nb) {
            const i = C.fielders.indexOf(nb);
            const oldBat = bat;
            nb.look = withProp(nb.look, 'bat'); oldBat.look = withProp(oldBat.look, null);
            C.bat = nb; C.fielders[i] = oldBat; oldBat.home = nb.home || { x: oldBat.x, y: oldBat.y };
            oldBat.beh = 'goto'; oldBat.tx = oldBat.home.x; oldBat.ty = oldBat.home.y; oldBat.spd = 30;
            nb.beh = 'goto'; nb.tx = C.wx + C.ux * 2.5; nb.ty = C.wy + C.uy * 2.5; nb.spd = 40; nb.home = null;
          }
          B.live = false; B.held = bow; C.ph = 'walk'; C.t = 0;
        }
        break;
      case 'lost': // "Aunty, ball ivvandi!" ... and she throws it back
        if (C.t > 1.2 && !C.aunty) {
          B.live = false; B.x = C.lost.x + C.lost.nx * 9; B.y = C.lost.y + C.lost.ny * 9; B.h = 0.4;
          for (const p of C.fielders) if (p.alive) { p.beh = 'goto'; p.tx = C.lost.x - C.lost.nx * 2 + rr(-3, 3); p.ty = C.lost.y - C.lost.ny * 2 + rr(-3, 3); p.spd = 40; }
          C.aunty = true;
        }
        if (C.t > 4.5 && C.aunty === true) {
          const a = newPerson(sc, 'aunty', C.lost.ix, C.lost.iy, { beh: 'stand', face: Math.atan2(-C.lost.ny, -C.lost.nx) });
          C.aunty = a || 'none';
          if (a) { a.tx = C.lost.x; a.ty = C.lost.y; bark(a, line('back'), { force: true }); }
          B.x = C.lost.x + C.lost.nx * 2; B.y = C.lost.y + C.lost.ny * 2; B.h = 7; throwBall(C, bow.x, bow.y, 1.1);
        }
        if (C.t > 7.5) {
          if (C.aunty && C.aunty.alive) goIn(C.aunty, C.lost.ix, C.lost.iy);
          C.aunty = null; C.lost = null;
          for (const p of C.fielders) if (p.alive && p.home) { p.beh = 'goto'; p.tx = p.home.x; p.ty = p.home.y; }
          C.ph = 'walk'; C.t = 0;
        }
        break;
      default: C.ph = 'walk'; C.t = 0;
    }
    // Chinnu can join: through the cricket minigame when it exists
    const pl0 = N.player, dP = Math.hypot(pl0.x - (C.wx + C.bx) / 2, pl0.y - (C.wy + C.by) / 2);
    if (dP < 60 && realT() - st.invite > 40 && !pl0.vehicle) { st.invite = realT(); const k = C.fielders.find((p) => p.alive) || bow; bark(k, line('invite')); }
    const MG = N.minigames;
    if (dP < 26 && !pl0.vehicle && MG && typeof MG.play === 'function' && N.interact && N.interact.offer && !(N.missions && N.missions.active) && N.state.mode === 'play') {
      if (!C.offer) C.offer = { label: 'Join gully cricket', priority: 1, dist: dP, use: () => { try { MG.play('cricket', { difficulty: 0.4 }); beat(sc, 'joined'); } catch (e) { N.err('citylife.cricket', e); } } };
      C.offer.dist = dP;
      try { N.interact.offer(C.offer); } catch (e) { /* optional */ }
    }
    if (rnd() < dt * 0.08) sfx('kids', C.wx, C.wy, { vol: 0.3, gap: 6 });
  }

  /* ================================================================ 8. OLD CITY BUSTLE */
  const OLD = [
    { id: 'charminar', place: 'charminar', at: [9020, 8178], flav: { hawkers: 4, pigeons: 1, herd: 1, bangles: 1, lanejam: 1 } },
    { id: 'laad_bazaar', place: 'laad_bazaar', flav: { bangles: 2, attar: 1, lanejam: 1, handcart: 1, hawkers: 1 } },
    { id: 'gulzar_houz', place: 'gulzar_houz', r: 280, avoid: [9020, 8188], flav: { herd: 1, handcart: 1, lanejam: 1, hawkers: 2, attar: 1, pigeons: 1 } },
    { id: 'pathergatti', place: 'pathergatti', flav: { attar: 1, bangles: 1, handcart: 2, lanejam: 1, hawkers: 1 } },
  ];
  function buildOld() {
    const R = RD();
    for (const o of OLD) {
      const pc = N.places[o.place];
      if (!pc) continue;
      const x = o.at ? o.at[0] : pc.x, y = o.at ? o.at[1] : pc.y;
      const n = nearNode(x, y, o.r || 170, (q) => q.deg >= 2 && q.deg <= 4 && (!o.avoid || Math.hypot(q.x - o.avoid[0], q.y - o.avoid[1]) > 60) && !SITES.some((s2) => s2.kind === 'oldcity' && Math.hypot(s2.x - q.x, s2.y - q.y) < 90) && q.inc.some((e) => R.edges[e] && R.edges[e].kind !== 'path' && R.edges[e].kind !== 'arterial'));
      if (!n) continue;
      const path = throughPath(n, 110);
      if (!path || path.len < 120) continue;
      const mq = N.places.mecca_masjid;
      addSite({ id: 'oldcity:' + o.id, kind: 'oldcity', name: o.id, x: n.x, y: n.y, node: n, path, flav: o.flav, place: pc, style: 'oldcity', mosque: mq && Math.hypot(mq.x - n.x, mq.y - n.y) < 420 ? mq : null });
    }
  }
  const BANGLE_COLS = ['#e8203a', '#2a8cd8', '#30c050', '#f2c230', '#c83aa8', '#f06aa0', '#e86a20', '#8a3ad8', '#f4f2ea'];
  function calmAt(sc, x, y) {
    if (CX.prayer) return true;
    const mq = sc.site.mosque;
    return !!(mq && Math.hypot(mq.x - x, mq.y - y) < 160);
  }
  const KOLD = {
    label: 'Old City bustle',
    level(s, c) {
      if (c.m < 480 || c.m > 1380) return c.ramzan && (c.m > 1380 || c.m < 180) ? 0.9 : 0;
      let l = Math.max(0.55, peak(c.m, [[600, 780, 0.85], [1020, 1290, 1]]));
      if (c.ramzan && c.m > 1110) l = 1;
      if (c.rain > 0.5) l *= 0.5;
      return l;
    },
    start(sc, warm) {
      const s = sc.site, st = sc.st, P0 = s.path, hw = P0.w / 2, fw = Math.max(3, footW(P0.kind));
      Object.assign(st, { stalls: [], hawkers: [], carts: [], herd: null, herdT: warm ? rr(4, 10) : rr(10, 20), pigT: rr(4, 9), callT: rr(2, 4), J: null, cartT: rr(1, 4), calm: false });
      const f = forced(sc);
      // stalls along the lane edge: bangles (Laad Bazaar's lac and glass choodiyan), attar
      const slots = [-34, 26, -12, 46];
      let k = 0;
      const addStall = (type) => {
        const sOff = slots[k % slots.length] + (k >= slots.length ? 8 : 0), side = k % 2 ? 1 : -1; k++;
        const q = at(P0, P0.mid + sOff, side * (hw + fw * 0.5 + 1.5), PT2);
        const f2 = freeSpot(q.x, q.y, 2); if (!f2) return;
        try { if (N.respect && N.respect.at && N.respect.at(f2.x, f2.y)) return; } catch (e) { /* optional */ }
        const nx = q.uy * side, ny = -q.ux * side, a = Math.atan2(q.uy, q.ux);
        const S = { type, x: f2.x, y: f2.y, a, nx, ny, seller: null, buyers: [], cols: [] };
        if (type === 'bangles') for (let i = 0; i < 10; i++) S.cols.push(pick(BANGLE_COLS));
        addBlock(sc, f2.x, f2.y, type === 'bangles' ? 3.6 : 2.8);
        const sl = newPerson(sc, type === 'attar' ? 'elder' : pick(['man', 'elder', 'uncle']), f2.x + nx * 4, f2.y + ny * 4, { beh: 'sit', face: Math.atan2(-ny, -nx), ghost: true, tag: 'seller' });
        if (sl) { sl.tx = sl.x; sl.ty = sl.y; S.seller = sl; if (type === 'attar') { sl.look = Object.assign({}, sl.look, { hat: 'skull', hatColor: '#f4f2ea' }); } }
        const nb = type === 'bangles' ? 2 : 1;
        for (let i = 0; i < nb; i++) {
          const bx = f2.x - nx * 4 + q.ux * (i - 0.5) * 4, by = f2.y - ny * 4 + q.uy * (i - 0.5) * 4;
          const b = newPerson(sc, type === 'bangles' ? (rnd() < 0.5 ? 'woman' : 'aunty') : pick(['man', 'youth', 'elder']), bx, by, { beh: 'stand', face: Math.atan2(ny, nx), tag: 'buyer', item: type === 'bangles' && i === 0 ? 'bangles' : null });
          if (b) { b.tx = bx; b.ty = by; S.buyers.push(b); }
        }
        st.stalls.push(S);
      };
      for (let i = 0; i < (s.flav.bangles || 0); i++) addStall('bangles');
      for (let i = 0; i < (s.flav.attar || 0); i++) addStall('attar');
      // hawkers walking loops
      for (let i = 0; i < (s.flav.hawkers || 0); i++) {
        const loop = [];
        if (s.name === 'charminar') { const c = s.place; for (let a = 0; a < 12; a++) { const ang = (a / 12) * TAU + i * 0.9; const fx = freeSpot(c.x + Math.cos(ang) * 58, c.y + 0 + Math.sin(ang) * 58, 2); if (fx) loop.push(fx.x, fx.y); } }
        else { for (let d = 10; d < P0.len - 10; d += 22) { const q = at(P0, d, (i % 2 ? 1 : -1) * hw * 0.55); loop.push(q.x, q.y); } }
        if (loop.length < 6) continue;
        const j = ((rnd() * loop.length / 2) | 0);
        const p = newPerson(sc, pick(['vendor', 'man', 'youth']), loop[j * 2], loop[j * 2 + 1], { tag: 'hawker', spd: 22 });
        if (!p) continue;
        p.look = withProp(p.look, i % 2 ? 'basket' : 'tray');
        p.loop = loop; p.pi = j; setPath(p, loop, 'stand', 20); p.pi = j;
        st.hawkers.push(p);
      }
      // the narrow-lane jam: two-wheelers nosing in from both ends, blocked by an auto unloading
      if (s.flav.lanejam) {
        clearAmbient(sc, s.x, s.y, 140);
        const J = jamMake(sc, s.node, P0.arms, { cap: lowTier() ? 5 : 7, mix: 'lane', jr: 7, front: 3, depth: 110 });
        J.gap = 2.6; st.J = J;
        if (warm) { for (let g = 0; g < 14 && jamCount(J) < Math.round(sc.level * J.cap); g++) jamAdd(sc, J, J.lanes[g % J.lanes.length], true); jamTargets(J); for (const v of sc.vehs) if (v.cle && v.cle.lane) { v.x = v.cle.tx; v.y = v.cle.ty; v.angle = v.cle.ta; } }
      }
      if (f && phaseOn(sc, 'herd')) st.herdT = 0.5;
    },
    update(sc, dt) {
      const s = sc.site, st = sc.st, P0 = s.path;
      st.calm = calmAt(sc, s.x, s.y);
      if (st.J) {
        if (!st.jo) st.jo = { calm: false, onGreen: null };
        st.jo.calm = st.calm;
        jamUpdate(sc, st.J, dt, sc.level * 0.9, st.jo);
        st.J.flowT = Math.max(st.J.flowT, 0); // the lane drains slowly
        antiTrap(sc, st.J, dt);
        for (const l of st.J.lanes) for (const v of l.q) if (v.cle && !st.calm && v.cle.hd <= 0 && rnd() < dt * 0.05) v.cle.hd = 0.05;
        if (!st.calm && rnd() < dt * 0.05) { const v = pick(sc.vehs); if (v) bark(v, line('lanejam')); }
      }
      // sellers calling (never during prayers / near the masjid)
      st.callT -= dt;
      if (st.callT <= 0) {
        st.callT = rr(4, 8);
        if (!st.calm) {
          const S = st.stalls.length && rnd() < 0.6 ? pick(st.stalls) : null;
          if (S && S.seller && S.seller.alive) { bark(S.seller, line(S.type)); sfx(S.type === 'bangles' ? 'bangles' : 'vendor_call', S.x, S.y, { vol: 0.45, gap: 2 }); }
          else if (st.hawkers.length) { const h = pick(st.hawkers); if (h && h.alive) { bark(h, line('hawker')); sfx('vendor_call', h.x, h.y, { vol: 0.4, gap: 3 }); } }
        }
      }
      for (const h of st.hawkers) if (h.alive && h.beh === 'stand' && h.loop) { setPath(h, h.loop, 'stand', 20); }
      // handcarts pushed along the lane
      st.cartT -= dt;
      if (st.cartT <= 0 && st.carts.length < (s.flav.handcart || 0)) {
        st.cartT = rr(8, 16);
        const fwd = rnd() < 0.5, off = (fwd ? 1 : -1) * P0.w / 2 * 0.62;
        const s0 = fwd ? 4 : P0.len - 4, q = at(P0, s0, off);
        if (!seen(q.x, q.y, 6) || sc.t < 0.6) {
          const p = newPerson(sc, pick(['porter', 'lungi', 'man']), q.x, q.y, { tag: 'cart', spd: 14 });
          if (p) {
            const pts = []; for (let k = 0; k <= 10; k++) { const r = at(P0, lerp(s0, fwd ? P0.len - 2 : 2, k / 10), off); pts.push(r.x, r.y); }
            setPath(p, pts, 'leave', 14); p.tx = pts[pts.length - 2]; p.ty = pts[pts.length - 1];
            p.cart = { kind: pick(['sacks', 'bananas', 'cloth', 'pots']), col: pick(['#c8a878', '#e8d040', '#c83a5a', '#b8643a']) };
            st.carts.push(p);
          }
        }
      }
      for (let i = st.carts.length - 1; i >= 0; i--) if (!st.carts[i].alive || st.carts[i].sc !== sc) st.carts.splice(i, 1);
      // buffalo herds crossing (mornings and late afternoons)
      st.herdT -= dt;
      const herdTime = (CX.m >= 420 && CX.m <= 620) || (CX.m >= 950 && CX.m <= 1120) || phaseOn(sc, 'herd');
      if (!st.herd && st.herdT <= 0 && s.flav.herd && herdTime) startHerd(sc);
      if (st.herd) herdTick(sc, dt);
      // pigeons rising round Charminar / Gulzar Houz (not during prayers)
      st.pigT -= dt;
      if (st.pigT <= 0 && s.flav.pigeons) {
        st.pigT = rr(9, 16);
        if (!st.calm && N.traffic && N.traffic.scarePigeons && dPl(s.place.x, s.place.y) < 420) { try { N.traffic.scarePigeons(s.place.x, s.place.y + 40, 120); } catch (e) { /* optional */ } sfx('pigeons', s.place.x, s.place.y, { vol: 0.4, gap: 6 }); beat(sc, 'pigeons'); }
      }
      sc.phase = st.herd ? 'herd' : st.calm ? 'calm' : 'bustle';
    },
    stop(sc) {},
  };
  function startHerd(sc) {
    const s = sc.site, st = sc.st, P0 = s.path;
    const fwd = rnd() < 0.5, s0 = fwd ? 0 : P0.len, s1 = fwd ? P0.len : 0;
    const q0 = at(P0, s0, 0);
    if (seen(q0.x, q0.y, 10) && !forced(sc)) { st.herdT = 6; return; }
    const H = { fwd, s: fwd ? 0 : P0.len, s1, beasts: [], herder: null, t: 0, spd: 9 };
    if (forced(sc)) { const ps = along(P0, N.player.x, N.player.y); H.s = clamp(ps + (fwd ? -26 : 26), 0, P0.len); } // staged: the herd is right there
    const n = lowTier() ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const d = H.s - (fwd ? 1 : -1) * i * 7.5;
      const q = at(P0, clamp(d, 0, P0.len), rr(-P0.w * 0.25, P0.w * 0.25));
      const b = newBeast(sc, 'buffalo', q.x, q.y, fwd ? Math.atan2(q.uy, q.ux) : Math.atan2(-q.uy, -q.ux), { spd: 10 });
      b.lat = rr(-P0.w * 0.28, P0.w * 0.28); b.lag = i * 7 + rr(0, 3);
      H.beasts.push(b);
    }
    const hq = at(P0, clamp(H.s - (fwd ? 1 : -1) * (n * 7.5 + 6), 0, P0.len), 2);
    const h = newPerson(sc, 'lungi', hq.x, hq.y, { tag: 'herder', spd: 12 });
    if (h) { h.look = withProp(h.look, 'stick'); h.beh = 'follow'; H.herder = h; }
    st.herd = H;
    beat(sc, 'herd');
  }
  function herdTick(sc, dt) {
    const s = sc.site, st = sc.st, H = st.herd, P0 = s.path;
    H.t += dt;
    H.s += (H.fwd ? 1 : -1) * H.spd * dt;
    let alive = 0;
    for (const b of H.beasts) {
      if (!b.alive) continue;
      alive++;
      const d = H.s - (H.fwd ? 1 : -1) * b.lag;
      const q = at(P0, d, b.lat + Math.sin(H.t * 0.5 + b.seed) * 1.5);
      b.tx = q.x; b.ty = q.y; b.path = null;
      if ((H.fwd && d > P0.len + 4) || (!H.fwd && d < -4)) { if (!seen(b.x, b.y, 8)) freeBeast(b); else { b.tx = q.x + (H.fwd ? q.ux : -q.ux) * 30; b.ty = q.y + (H.fwd ? q.uy : -q.uy) * 30; } }
    }
    const tailD = H.s - (H.fwd ? 1 : -1) * (H.beasts.length * 7 + 6);
    const hq = at(P0, tailD, 1.5);
    if (H.herder && H.herder.alive) { H.herder.tx = hq.x; H.herder.ty = hq.y; H.herder.face = Math.atan2(H.fwd ? hq.uy : -hq.uy, H.fwd ? hq.ux : -hq.ux); if (H.herder.barkCD <= 0 && dPl(H.herder.x, H.herder.y) < 120) { H.herder.barkCD = 7; bark(H.herder, line('herder')); } }
    const mid = at(P0, H.s - (H.fwd ? 1 : -1) * 18, 0);
    closeRoad(sc, 'herd', mid.x, mid.y, 46);
    if (rnd() < dt * 0.15) sfx('cow_moo', mid.x, mid.y, { vol: 0.3, gap: 5, pitch: 0.75 });
    if (alive === 0 || H.t > 120) {
      closeRoad(sc, 'herd', null);
      if (H.herder && H.herder.alive) leave(H.herder, hq.x + (H.fwd ? hq.ux : -hq.ux) * 80, hq.y + (H.fwd ? hq.uy : -hq.uy) * 80);
      for (const b of H.beasts) if (b.alive) ORPH.push(b);
      st.herd = null; st.herdT = rr(40, 80);
    }
  }

  /* ================================================================ 10. CINEMA RELEASE DAY */
  // fictional films only (places_registry): no real titles, no real stars
  const FILMS = [
    { t: 'TOOFAN RAJU', tel: 'తూఫాన్ రాజు', bg: ['#f08a24', '#c8202a'] }, { t: 'MERUPU', tel: 'మెరుపు', bg: ['#2a5cd8', '#7a2ac8'] },
    { t: 'DHAMAKA DADA', tel: 'ధమాకా దాదా', bg: ['#e8c020', '#e84a20'] }, { t: 'CHANDRUDU NO.1', tel: 'చంద్రుడు', bg: ['#1ab0a0', '#2a4ab8'] },
    { t: 'SHER-E-DECCAN', tel: 'షేర్', bg: ['#e84a8a', '#7a1a5a'] }, { t: 'GULLY SIMHAM', tel: 'గల్లీ సింహం', bg: ['#40c050', '#1a6a8a'] },
  ];
  function buildCinemas() {
    for (const id in N.places) {
      const p = N.places[id];
      if (p.kind !== 'cinema') continue;
      let q = null;
      try { q = N.world.nearestRoadPoint(p.x, p.y, (r) => r.kind !== 'path'); } catch (e) { q = null; }
      if (!q || !isFinite(q.x)) continue;
      const w = (q.road && q.road.w) || 24, fw = Math.max(3, footW(q.road && q.road.kind));
      let nx = p.x - q.x, ny = p.y - q.y; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
      const ux = -ny, uy = nx;
      const fd = Math.min(L - 6, w / 2 + fw + 6);
      const fx = q.x + nx * fd, fy = q.y + ny * fd;
      const film = FILMS[(hashS(id) * FILMS.length) | 0];
      const rtc = N.places.rtc_x_roads;
      addSite({ id: 'cinema:' + id, kind: 'cinema', name: id, x: fx, y: fy, place: p, nx, ny, ux, uy, roadW: w, fw, film, style: styleAt(fx, fy), rtc: !!(rtc && Math.hypot(rtc.x - p.x, rtc.y - p.y) < 700) });
    }
  }
  const KCIN = {
    label: 'Cinema release day',
    level(s, c) {
      if (c.m3 && s.rtc) return 0;
      if (c.fri) return peak(c.m, [[470, 760, 1], [1020, 1110, 0.6]]);
      if (c.dow === 6 || c.dow === 0) return peak(c.m, [[540, 700, 0.35]]);
      return 0;
    },
    start(sc, warm) {
      const s = sc.site, st = sc.st, low = lowTier();
      const P = (u, v) => ({ x: s.x + s.ux * u + s.nx * v, y: s.y + s.uy * u + s.ny * v });
      const co = P(15, 1), ct = P(-16, 5);
      Object.assign(st, { cut: { x: co.x, y: co.y, a: Math.atan2(-s.ny, -s.nx) }, counter: { x: ct.x, y: ct.y, a: Math.atan2(-s.ny, -s.nx) }, drums: [], dancers: [], crush: [], tickT: rr(4, 7), housefull: false, hfT: rr(55, 80), drumT: 0, confT: 0.5, coconut: rr(6, 12), fanT: rr(3, 6), whistleT: rr(1, 3) });
      addBlock(sc, co.x, co.y, 4.5); addBlock(sc, ct.x + s.nx * 2, ct.y + s.ny * 2, 4);
      const drumLook = (r) => withProp(Object.assign({}, lookFor(r, s.style), { shirt: pick(['#f2f0ea', '#c8302a', '#f2c230']) }), 'dappu');
      for (let i = 0; i < (low ? 3 : 4); i++) { const q = P(10 + i * 4.2, -8); const p = newPerson(sc, 'man', q.x, q.y, { beh: 'stand', face: Math.atan2(s.ny, s.nx) + 0.3, look: drumLook(pick(['man', 'lungi', 'youth'])), tag: 'drum', item: 'dappu' }); if (p) { p.tx = q.x; p.ty = q.y; st.drums.push(p); } }
      for (let i = 0; i < (low ? 5 : 7); i++) { const a = (i / 7) * TAU, q = P(6 + Math.cos(a) * 7, -14 + Math.sin(a) * 5); const p = newPerson(sc, pick(['youth', 'youth', 'student', 'man']), q.x, q.y, { beh: 'dance', face: rnd() * TAU, tag: 'dancer' }); if (p) { p.tx = q.x; p.ty = q.y; st.dancers.push(p); } }
      st.win = P(-16, 3);
      for (let i = 0; i < (low ? 6 : 9); i++) {
        const a = -PI / 2 + (i / 8 - 0.5) * 2.4, r = 3 + (i % 3) * 2.6;
        const q = { x: st.win.x - s.nx * (r + 1) + s.ux * Math.sin(a) * r * 1.2, y: st.win.y - s.ny * (r + 1) + s.uy * Math.sin(a) * r * 1.2 };
        const p = newPerson(sc, pick(['youth', 'man', 'student', 'youth']), q.x, q.y, { beh: 'crush', face: Math.atan2(s.ny, s.nx), tag: 'crush' });
        if (p) { p.tx = q.x; p.ty = q.y; st.crush.push(p); }
      }
      if (phaseOn(sc, 'housefull')) st.hfT = 2;
    },
    update(sc, dt) {
      const s = sc.site, st = sc.st;
      // teenmaar on a loop while you are near
      st.drumT -= dt;
      if (st.drumT <= 0) { st.drumT = 1.86; if (dPl(s.x, s.y) < 300 && st.drums.some((p) => p.alive)) sfx('cle_teenmaar', s.x, s.y, { vol: 0.6, gap: 1.5 }); }
      st.whistleT -= dt;
      if (st.whistleT <= 0) { st.whistleT = rr(2.5, 6); sfx('finger_whistle', s.x, s.y, { vol: 0.4, gap: 2 }); const d = pick(st.dancers); if (d && d.alive && rnd() < 0.6) bark(d, line('cinema')); }
      // petals and paper confetti over the dancers
      st.confT -= dt;
      if (st.confT <= 0) {
        st.confT = rr(0.8, 1.8);
        const d = pick(st.dancers);
        if (d && d.alive) for (let i = 0; i < 9; i++) emit(i % 3 ? PK.CONF : PK.PETAL, d.x, d.y, 9, rr(-8, 8), rr(-8, 8), rr(10, 18), rr(2.5, 4), rr(0.5, 0.9), i % 3 ? [3, 4, 5, 6, 7, 11][(rnd() * 6) | 0] : 2);
      }
      // a coconut broken at the cut-out, the garland showered with petals
      st.coconut -= dt;
      if (st.coconut <= 0) { st.coconut = rr(14, 24); sfx('coconut_chop', st.cut.x, st.cut.y, { vol: 0.5, gap: 4 }); for (let i = 0; i < 14; i++) emit(PK.PETAL, st.cut.x + rr(-6, 6), st.cut.y + rr(-3, 3), rr(22, 34), rr(-4, 4), rr(-4, 4), rr(0, 4), rr(2.5, 4), 0.8, 2); beat(sc, 'coconut'); }
      // the ticket counter crush
      st.tickT -= dt;
      if (st.tickT <= 0 && !st.housefull) {
        st.tickT = rr(4, 8);
        const p = st.crush.find((q) => q.alive && q.beh === 'crush');
        if (p) {
          p.item = 'ticket'; bark(p, line('ticket'), { force: rnd() < 0.5 });
          goIn(p, s.place.x * 0.25 + s.x * 0.75, s.place.y * 0.25 + s.y * 0.75); p.spd = 46;
          st.crush.splice(st.crush.indexOf(p), 1);
          const sp = at0(s, rr(-40, 40), -s.roadW * 0.6 - 4);
          if (!seen(sp.x, sp.y, -20) || sc.t < 2) {
            const nq = newPerson(sc, pick(['youth', 'man', 'student']), sp.x, sp.y, { beh: 'goto', tag: 'crush', spd: 40 });
            if (nq) { const r = 3 + rnd() * 5; goTo(nq, st.win.x - s.nx * r + s.ux * rr(-4, 4), st.win.y - s.ny * r + s.uy * rr(-4, 4), 'crush'); nq.face = Math.atan2(s.ny, s.nx); st.crush.push(nq); }
          }
          beat(sc, 'ticket');
        }
        const q = st.crush.find((x) => x.alive && x.beh === 'crush'); if (q && rnd() < 0.5) bark(q, line('counter'));
      }
      for (const p of st.crush) if (p.alive && p.beh === 'crush') { p.ty += 0; }
      st.hfT -= dt;
      if (!st.housefull && st.hfT <= 0) {
        st.housefull = true;
        const p = st.crush.find((q) => q.alive);
        if (p) bark(p, line('housefull'), { force: true });
        for (let i = 0; i < st.crush.length; i++) { const q = st.crush[i]; if (q.alive && i % 2) { q.beh = 'stand'; q.face = Math.atan2(-s.ny, -s.nx); } }
        beat(sc, 'housefull');
      }
      for (let i = st.crush.length - 1; i >= 0; i--) if (!st.crush[i].alive || st.crush[i].sc !== sc) st.crush.splice(i, 1);
      sc.phase = st.housefull ? 'housefull' : 'crush';
    },
    stop(sc) {},
  };
  const at0 = (s, u, v) => ({ x: s.x + s.ux * u + s.nx * v, y: s.y + s.uy * u + s.ny * v });

  /* ================================================================ 11. WEDDING BARAAT */
  const BARAAT_AREAS = ['himayatnagar', 'kachiguda', 'dilsukhnagar', 'ameerpet', 'masab_tank', 'malakpet', 'saidabad', 'tolichowki', 'charminar', 'marredpally', 'amberpet', 'musheerabad'];
  function roadSub(road, seg, t, L) {
    const P0 = road.pts; if (!P0 || P0.length < 2) return null;
    const pts = [];
    // walk back L/2 from the projection point, then forward L
    let i = clamp(seg | 0, 0, P0.length - 2), back = L / 2;
    let x = lerp(P0[i][0], P0[i + 1][0], t || 0), y = lerp(P0[i][1], P0[i + 1][1], t || 0);
    let j = i;
    while (back > 0 && j >= 0) { const d = Math.hypot(x - P0[j][0], y - P0[j][1]); if (d >= back) { const f = back / (d || 1); x = lerp(x, P0[j][0], f); y = lerp(y, P0[j][1], f); back = 0; break; } back -= d; x = P0[j][0]; y = P0[j][1]; j--; }
    pts.push(x, y);
    let rem = L, k = Math.max(0, j + 1);
    while (rem > 0 && k < P0.length) { const d = Math.hypot(P0[k][0] - x, P0[k][1] - y); if (d >= rem) { const f = rem / (d || 1); x = lerp(x, P0[k][0], f); y = lerp(y, P0[k][1], f); pts.push(x, y); rem = 0; break; } rem -= d; x = P0[k][0]; y = P0[k][1]; if (d > 0.5) pts.push(x, y); k++; }
    const p = mkPath(pts, { w: road.w || 24, kind: road.kind });
    return p.len > L * 0.6 ? p : null;
  }
  const BARAAT_CLEAR = 150, BARAAT_QUIET = 240;
  /** stretches [s0, s1, ...] of a route that pass within BARAAT_QUIET of a place of worship: the band stops there */
  function quietSpans(route) {
    const out = [];
    let on = -1;
    for (let d = 0; d <= route.len + 10; d += 10) {
      const q = at(route, Math.min(d, route.len), 0, PT2);
      const near = d <= route.len && worshipDist(q.x, q.y, BARAAT_QUIET) < BARAAT_QUIET;
      if (near && on < 0) on = Math.max(0, d - 20);
      else if (!near && on >= 0) { out.push(on, Math.min(route.len, d + 20)); on = -1; }
    }
    return out;
  }
  function inSpans(sp, d) { for (let i = 0; i < sp.length; i += 2) if (d >= sp[i] && d <= sp[i + 1]) return true; return false; }
  function buildBaraats() {
    const D = (N.world.data && N.world.data.districts) || (N.WORLD_DATA && N.WORLD_DATA.districts) || [];
    const roads = (N.WORLD_DATA && N.WORLD_DATA.roads) || [];
    for (const id of BARAAT_AREAS) {
      const d = D.find((q) => q.id === id);
      if (!d) continue;
      let cx = d.x, cy = d.y;
      const pts = d.poly || d.pts || d.polygon;
      if ((!isFinite(cx) || !isFinite(cy)) && Array.isArray(pts) && pts.length) { cx = 0; cy = 0; let n = 0; for (const p of pts) { const px = Array.isArray(p) ? p[0] : p.x, py = Array.isArray(p) ? p[1] : p.y; if (isFinite(px)) { cx += px; cy += py; n++; } } if (!n) continue; cx /= n; cy /= n; }
      if (id === 'himayatnagar' && N.places.home) { cx = N.places.home.x + 140; cy = N.places.home.y + 60; }
      // candidates: the nearest street point first, then every street / arterial segment within reach, nearest first;
      // a route is kept only if no point of it (nor the function-hall gate) comes within BARAAT_CLEAR of a place of worship
      const cands = [];
      try { const q = N.world.nearestRoadPoint(cx, cy, (r) => r.kind === 'street' || r.kind === 'arterial'); if (q && q.road) cands.push({ road: q.road, seg: q.seg, t: q.t, d: 0 }); } catch (e) { /* fall through */ }
      for (const r of roads) {
        if ((r.kind !== 'street' && r.kind !== 'arterial') || !r.pts || r.pts.length < 2) continue;
        for (let i = 0; i < r.pts.length - 1; i++) {
          const a = r.pts[i], b = r.pts[i + 1];
          for (const t of [0.25, 0.75]) {
            const x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t), dd = Math.hypot(x - cx, y - cy);
            if (dd < 1400) cands.push({ road: r, seg: i, t, d: dd + 1 });
          }
        }
      }
      cands.sort((a, b) => a.d - b.d);
      let route = null, gate = null, tries = 0;
      // a full 520-unit walk if one fits; in the dense Old City (a mosque, temple or ashurkhana every few lanes)
      // a shorter walk between them is taken instead
      for (const L of [520, 400, 320]) {
        tries = 0;
        for (const c of cands) {
          if (++tries > 160) break;
          const R0 = roadSub(c.road, c.seg, c.t, L);
          if (!R0) continue;
          const hw = R0.w / 2, fw = Math.max(3, footW(R0.kind));
          const e = cp(at(R0, R0.len - 6, -(hw + fw + 6)));
          if (!pathClear(R0, BARAAT_CLEAR, false, [e])) { rej('baraat_clear'); continue; }
          route = R0; gate = e; break;
        }
        if (route) break;
      }
      if (!route) { rej('baraat_none:' + id); continue; }
      const style = styleAt(gate.x, gate.y);
      addSite({ id: 'baraat:' + id, kind: 'baraat', name: id, x: route.pts[0], y: route.pts[1], route, quiet: quietSpans(route), gate: { x: gate.x, y: gate.y, a: Math.atan2(gate.uy, gate.ux), nx: -gate.uy, ny: gate.ux }, style, sign: style === 'oldcity' ? 'SHAADI MUBARAK' : 'SUBHA VIVAHAM' });
    }
  }
  const KBAR = {
    label: 'Wedding baraat',
    level(s, c) {
      if (c.rain > 0.2) return 0;
      if (!c.weekend || !c.wedding) return 0;
      return peak(c.m, [[1170, 1385, 1]]);
    },
    start(sc, warm) {
      const s = sc.site, st = sc.st, R0 = s.route, hw = R0.w / 2, low = lowTier();
      const pdist = along(R0, N.player.x, N.player.y);
      const s0 = forced(sc) ? clamp(pdist + 45, 90, R0.len - 150) : warm ? clamp(pdist - 120, 90, R0.len * 0.5) : 90;
      Object.assign(st, { s: s0, ph: 'walk', phT: rr(9, 13), members: [], horse: null, cars: [], bandT: 0, done: false, honkT: 3, lightsN: 0, gen: null, calm: false });
      const F = [];
      const nb = low ? 6 : 8;
      for (let i = 0; i < nb; i++) F.push({ role: pick(['man', 'lungi', 'youth', 'kid']), a: -2 - Math.floor(i / 2) * 15, l: (i % 2 ? 1 : -1) * hw * 0.78, tag: 'tube', item: 'tube' });
      for (let i = 0; i < (low ? 4 : 6); i++) F.push({ role: 'man', a: -10 - Math.floor(i / 3) * 5, l: ((i % 3) - 1) * 4.5, tag: 'band', item: i % 3 === 1 ? 'drum' : 'trumpet', band: true });
      for (let i = 0; i < (low ? 4 : 7); i++) { const ang = (i / 7) * TAU; F.push({ role: pick(['youth', 'man', 'woman', 'aunty', 'kid', 'youth']), a: -30 + Math.sin(ang) * 6, l: Math.cos(ang) * 6, tag: 'dancer', dance: true }); }
      for (let i = 0; i < (low ? 3 : 5); i++) F.push({ role: pick(['aunty', 'uncle', 'woman', 'kid', 'old']), a: -58 - Math.floor(i / 2) * 6, l: ((i % 2) ? 1 : -1) * (4 + rnd() * 4), tag: 'rel', item: i === 0 ? 'sparkler' : null });
      for (const f of F) {
        const q = at(R0, st.s + f.a, f.l);
        const look = f.band ? Object.assign({}, lookFor('man', s.style), { shirt: '#c8202a', pants: '#f2f0ea', hat: 'gandhi', hatColor: '#c8202a' }) : f.role === 'aunty' || f.role === 'woman' ? Object.assign({}, lookFor(f.role, s.style), { saree: pick(['#c8202a', '#e8a020', '#c83a8a', '#2a8c82']), dupatta: '#f2c230' }) : null;
        const p = newPerson(sc, f.role, q.x, q.y, { beh: f.dance ? 'dance' : 'follow', look: look || undefined, tag: f.tag, item: f.item || null, ghost: true, spd: 20 });
        if (!p) continue;
        if (f.item === 'drum') p.look = withProp(p.look, 'dappu');
        p.slot = f; p.tx = q.x; p.ty = q.y; p.face = Math.atan2(q.uy, q.ux);
        st.members.push(p);
      }
      const hq = at(R0, st.s - 44, 0);
      st.horse = newBeast(sc, 'horse', hq.x, hq.y, Math.atan2(hq.uy, hq.ux), { spd: 9 });
      if (st.horse) st.horse.rider = { look: Object.assign({}, lookFor('man', s.style), { shirt: '#f2e6c8', pants: '#f2e6c8' }) };
      const gq = at(R0, st.s - 70, hw * 0.4);
      const g = newPerson(sc, 'man', gq.x, gq.y, { beh: 'follow', tag: 'gen', ghost: true, spd: 16 });
      if (g) { g.slot = { a: -70, l: hw * 0.4 }; g.cart = { kind: 'gen', col: '#3a5a8a' }; st.gen = g; st.members.push(g); }
      // traffic stopped behind the procession
      for (let i = 0; i < (low ? 2 : 3); i++) {
        const d = st.s - 92 - i * 26; if (d < 4) break;
        const q = at(R0, d, -hw * 0.45);
        const v = spawnVeh(sc, pick(['auto', 'chetak', 'maruti800', 'ambassador', 'rx100', 'auto']), q.x, q.y, Math.atan2(q.uy, q.ux), { vmax: 10, must: i === 0 });
        if (v) { v.cle.k = i; st.cars.push(v); }
      }
      beat(sc, 'baraat');
    },
    update(sc, dt) {
      const s = sc.site, st = sc.st, R0 = s.route;
      if (st.done) { sc.phase = 'done'; return; }
      st.phT -= dt;
      // a real baraat falls silent during namaaz and while it passes a mosque, temple, church or dargah:
      // no band, no dappu, no dancing, no horns, no sparklers (it just walks on quietly)
      const quiet = s.quiet || [];
      const calm = CX.prayer || inSpans(quiet, st.s + 6) || inSpans(quiet, st.s - 40) || inSpans(quiet, st.s - 80);
      if (calm !== st.calm) {
        st.calm = calm;
        if (calm) { if (st.ph === 'dance') { st.ph = 'walk'; st.phT = rr(9, 13); } beat(sc, 'hush'); const r = st.members.find((p) => p.alive && p.slot && p.slot.tag === 'rel'); if (r) bark(r, line(CX.prayer ? 'baraatHushPrayer' : 'baraatHush')); }
        else beat(sc, 'band_resumes');
      }
      if (st.ph === 'dance' && calm) { st.ph = 'walk'; st.phT = rr(9, 13); }
      if (st.ph === 'walk' && st.phT <= 0 && calm) st.phT = 2;
      else if (st.ph === 'walk' && st.phT <= 0) { st.ph = 'dance'; st.phT = rr(6, 9); beat(sc, 'dance'); const d = st.members.find((p) => p.alive && p.slot && p.slot.dance); if (d) bark(d, line('baraat')); }
      else if (st.ph === 'dance' && st.phT <= 0) { st.ph = 'walk'; st.phT = rr(9, 13); }
      if (st.ph === 'walk' || st.ph === 'arrive') st.s += 4.6 * dt;
      const end = R0.len - 10;
      if (st.s >= end && st.ph !== 'arrive') { st.ph = 'arrive'; st.arriveT = 0; beat(sc, 'arrive'); }
      s.x = at(R0, st.s, 0).x; s.y = PT.y;
      // formation
      for (const p of st.members) {
        if (!p.alive || p.sc !== sc) continue;
        if (st.ph === 'arrive' && p.beh !== 'in') { p.beh = 'follow'; }
        const f = p.slot; if (!f) continue;
        if (f.dance && st.ph !== 'arrive' && p.beh !== 'in') p.beh = calm ? 'follow' : 'dance';
        const q = at(R0, Math.min(st.s, end) + f.a, f.l);
        p.tx = q.x; p.ty = q.y;
        if (!f.dance) p.face = Math.atan2(q.uy, q.ux) + (f.band ? Math.sin(sc.t * 2 + p.seed) * 0.15 : 0);
        if (f.dance && p.beh === 'dance') { p.face = Math.atan2(q.uy, q.ux) + PI; }
      }
      // the arrival: everyone files in through the function hall gate
      if (st.ph === 'arrive') {
        st.arriveT += dt;
        let k = 0;
        for (const p of st.members) { if (!p.alive || p.beh === 'in') continue; if (st.arriveT > 1 + k * 0.35) goIn(p, s.gate.x + s.gate.nx * 4, s.gate.y + s.gate.ny * 4); k++; }
        if (st.horse && st.horse.alive) { st.horse.tx = s.gate.x - s.gate.nx * 2; st.horse.ty = s.gate.y - s.gate.ny * 2; if (st.arriveT > 6) { ORPH.push(st.horse); st.horse.tx = s.gate.x + s.gate.nx * 8; st.horse.ty = s.gate.y + s.gate.ny * 8; st.horse = null; } }
        if (st.arriveT > 12 || st.members.every((p) => !p.alive || p.sc !== sc)) {
          st.done = true; s.cool = 300;
          for (const v of st.cars) if (v.alive && v.cle) { const pts = []; for (let d = along(R0, v.x, v.y) + 20; d < R0.len; d += 40) { const q = at(R0, d, -R0.w / 4); pts.push(q.x, q.y); } if (pts.length >= 4) { v.cle.path = pts; v.cle.pi = 0; v.cle.mode = 'leave'; v.cle.then = 'gone'; v.cle.vmax = 24; } else v.cle.mode = 'gone'; }
          closeRoad(sc, 'head', null); closeRoad(sc, 'tail', null);
          beat(sc, 'baraat_done');
          return;
        }
      } else if (st.horse && st.horse.alive) {
        const q = at(R0, st.s - 44 + Math.sin(sc.t * 0.7) * 0.6, 0);
        st.horse.tx = q.x; st.horse.ty = q.y; st.horse.spd = st.ph === 'dance' ? 2 : 9;
      }
      // traffic stopped behind it, honking (people shrug: "shaadi hai")
      for (const v of st.cars) {
        if (!v.alive || !v.cle || v.cle.mode !== 'hold') continue;
        const q = at(R0, Math.max(4, st.s - 92 - v.cle.k * 26), -R0.w / 2 * 0.45);
        v.cle.tx = q.x; v.cle.ty = q.y; v.cle.ta = Math.atan2(q.uy, q.ux); v.cle.vmax = 9;
      }
      st.honkT -= dt;
      if (st.honkT <= 0 && calm) st.honkT = 2;
      else if (st.honkT <= 0) { st.honkT = rr(3, 7); const v = pick(st.cars); if (v && v.alive) { honk(v); if (rnd() < 0.4) bark(v, line('baraatTraffic')); } }
      const hd = at(R0, st.s + 6, 0); closeRoad(sc, 'head', hd.x, hd.y, 60);
      const tl = at(R0, st.s - 80, 0); closeRoad(sc, 'tail', tl.x, tl.y, 60);
      // the band
      st.bandT -= dt;
      if (st.bandT <= 0 && calm) st.bandT = 1;
      else if (st.bandT <= 0) { st.bandT = st.ph === 'dance' ? 2.2 : 2.6; if (dPl(s.x, s.y) < 330) { sfx('cle_band', s.x, s.y, { vol: 0.6, gap: 1.8 }); if (st.ph === 'dance') sfx('dappu', s.x, s.y, { vol: 0.45, gap: 1 }); } }
      // petals over the groom, sparkler sparks
      if (rnd() < dt * (st.ph === 'dance' ? 2.5 : 0.8) && st.horse && st.horse.alive) for (let i = 0; i < 5; i++) emit(PK.PETAL, st.horse.x + rr(-3, 3), st.horse.y + rr(-3, 3), 16, rr(-5, 5), rr(-5, 5), rr(4, 9), rr(2, 3.2), 0.7, rnd() < 0.5 ? 2 : 4);
      if (!calm) for (const p of st.members) if (p.alive && p.item === 'sparkler' && rnd() < dt * 20) emit(PK.SPARK, p.x + Math.cos(p.angle) * 2.5, p.y + Math.sin(p.angle) * 2.5, 6.5, rr(-14, 14), rr(-14, 14), rr(4, 14), rr(0.3, 0.6), 0.5, 8);
      sc.phase = calm && st.ph !== 'arrive' ? 'hush' : st.ph;
    },
    stop(sc) { closeRoad(sc, 'head', null); closeRoad(sc, 'tail', null); },
  };

  /* ================================================================ 2D drawing */
  let R = null, CTX = null;
  const kk = (h) => R.k(h);
  const SX = (x, k) => R.sx(x, k), SY = (y, k) => R.sy(y, k);
  function frame2d(ctx) { R = N.render; CTX = ctx; }
  function resetCtx(ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt'; }
  function dot(x, y, h, r, col) { const k = kk(h); CTX.fillStyle = col; CTX.beginPath(); CTX.arc(SX(x, k), SY(y, k), Math.max(0.45, r * k), 0, TAU); CTX.fill(); }
  function seg(x0, y0, h0, x1, y1, h1, w, col) {
    const k0 = kk(h0), k1 = kk(h1);
    CTX.strokeStyle = col; CTX.lineWidth = Math.max(0.5, w * (k0 + k1) * 0.5); CTX.lineCap = 'round';
    CTX.beginPath(); CTX.moveTo(SX(x0, k0), SY(y0, k0)); CTX.lineTo(SX(x1, k1), SY(y1, k1)); CTX.stroke();
  }
  function ell(x, y, h, rx, ry, a, col) { const k = kk(h); CTX.fillStyle = col; CTX.beginPath(); CTX.ellipse(SX(x, k), SY(y, k), Math.max(0.4, rx * k), Math.max(0.4, ry * k), a || 0, 0, TAU); CTX.fill(); }
  function shadeHex(hex, nx, ny) { try { return R.shaded ? R.shaded(hex, R.shadeNormal(nx, ny)) : hex; } catch (e) { return hex; } }
  /** an oriented box: camera-facing walls (sun shaded) then the top */
  function obox(x, y, a, hl, hw, h0, h1, wall, top) {
    const ca = Math.cos(a), sa = Math.sin(a), k0 = kk(h0), k1 = kk(h1);
    const lx = ca * hl, ly = sa * hl, wx = -sa * hw, wy = ca * hw;
    const X = [x + lx + wx, x + lx - wx, x - lx - wx, x - lx + wx], Y = [y + ly + wy, y + ly - wy, y - ly - wy, y - ly + wy];
    const NX = [ca, sa, -ca, -sa], NY = [sa, -ca, -sa, ca];
    const cx = R.cam ? R.cam.x : x, cy = R.cam ? R.cam.y : y;
    if (h1 - h0 > 0.05 && wall) {
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) & 3, mx = (X[i] + X[j]) / 2, my = (Y[i] + Y[j]) / 2;
        const nx = i === 0 ? ca : i === 1 ? sa : i === 2 ? -ca : -sa, ny = i === 0 ? sa : i === 1 ? -ca : i === 2 ? -sa : ca;
        if (nx * (cx - mx) + ny * (cy - my) <= 0) continue;
        CTX.beginPath();
        CTX.moveTo(SX(X[i], k0), SY(Y[i], k0)); CTX.lineTo(SX(X[j], k0), SY(Y[j], k0));
        CTX.lineTo(SX(X[j], k1), SY(Y[j], k1)); CTX.lineTo(SX(X[i], k1), SY(Y[i], k1)); CTX.closePath();
        CTX.fillStyle = shadeHex(wall, nx, ny); CTX.fill();
      }
    }
    void NX; void NY;
    if (top !== false) {
      CTX.beginPath(); CTX.moveTo(SX(X[0], k1), SY(Y[0], k1));
      for (let i = 1; i < 4; i++) CTX.lineTo(SX(X[i], k1), SY(Y[i], k1));
      CTX.closePath(); CTX.fillStyle = top || wall; CTX.fill();
    }
  }
  function cylD(x, y, r, h0, h1, wall, top) { try { N.draw.cyl(x, y, r, h0, h1, { wall, roof: top || wall, top: top || wall }); } catch (e) { dot(x, y, h1, r, top || wall); } }
  /** a vertical picture standing on the ground line (x0, y0)-(x1, y1) from h0 to h1 (affine-mapped) */
  function imgQuad(img, x0, y0, x1, y1, h0, h1, alpha) {
    const k0 = kk(h0), k1 = kk(h1);
    const ax = SX(x0, k1), ay = SY(y0, k1), bx = SX(x1, k1), by = SY(y1, k1), cx = SX(x0, k0), cy = SY(y0, k0);
    const w = img.width, h = img.height;
    CTX.save();
    CTX.setTransform((bx - ax) / w, (by - ay) / w, (cx - ax) / h, (cy - ay) / h, ax, ay);
    if (alpha != null) CTX.globalAlpha = alpha;
    CTX.imageSmoothingEnabled = true;
    CTX.drawImage(img, 0, 0);
    CTX.restore();
  }
  /** a picture on a slope: bottom edge (x0, y0)-(x1, y1) at h0, top edge shifted by (dx, dy) at h1 (boards leaning
   *  back read from above; a truly vertical board is edge-on in the top-down view) */
  function imgSlope(img, x0, y0, x1, y1, h0, dx, dy, h1) {
    const k0 = kk(h0), k1 = kk(h1);
    const ax = SX(x0 + dx, k1), ay = SY(y0 + dy, k1), bx = SX(x1 + dx, k1), by = SY(y1 + dy, k1), cx = SX(x0, k0), cy = SY(y0, k0);
    const w = img.width, h = img.height;
    CTX.save();
    CTX.setTransform((bx - ax) / w, (by - ay) / w, (cx - ax) / h, (cy - ay) / h, ax, ay);
    CTX.imageSmoothingEnabled = true;
    CTX.drawImage(img, 0, 0);
    CTX.restore();
  }
  function blit(ctx, look, x, y, a, anim, h) {
    const T = N.traffic;
    if (T && T.blitPerson) { T.blitPerson(ctx, look, x, y, a, anim, h); return; }
    if (N.draw && N.draw.sprite && N.people) N.draw.sprite(x, y, a, h, (g) => N.people.draw(g, look, anim));
  }
  function umbrella(x, y, r, h, c1, c2, n) {
    const k0 = kk(h), k1 = kk(h + r * 0.3), ax = SX(x, k1), ay = SY(y, k1);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU + 0.3, a1 = ((i + 1) / n) * TAU + 0.3;
      CTX.beginPath(); CTX.moveTo(ax, ay);
      CTX.lineTo(SX(x + Math.cos(a0) * r, k0), SY(y + Math.sin(a0) * r, k0)); CTX.lineTo(SX(x + Math.cos(a1) * r, k0), SY(y + Math.sin(a1) * r, k0));
      CTX.closePath(); CTX.fillStyle = i % 2 ? c2 : c1; CTX.fill();
    }
  }
  function ptext(x, y, h, s, col) { try { if (N.draw.pixelText) N.draw.pixelText(x, y, h, s, col, { shadow: true }); } catch (e) { /* optional */ } }

  // ---- people overlays
  const ANIM0 = { phase: 0, speed: 0, run: false };
  const HP1 = { x: 0, y: 0, h: 0 }, HP2 = { x: 0, y: 0, h: 0 };
  function handPt(p, side, fwd, h, out) { const a = p.angle, o = out || HP1; o.x = p.x + Math.cos(a) * fwd - Math.sin(a) * side; o.y = p.y + Math.sin(a) * fwd + Math.cos(a) * side; o.h = h; return o; }
  function drawItem(p) {
    const a = p.angle, t = simT();
    switch (p.item) {
      case 'fan': { const s = Math.sin(t * 11 + p.seed) * 0.7; const q = handPt(p, 2.4, 1.6 + s, 7.4); ell(q.x, q.y, q.h, 1.5, 1.2, a + s, '#d8b060'); seg(q.x, q.y, q.h, q.x - Math.cos(a) * 1.6, q.y - Math.sin(a) * 1.6, q.h - 0.5, 0.35, '#8a6a3a'); break; }
      case 'candle': { const q = handPt(p, 1.6, 2.2, 6.6); seg(q.x, q.y, q.h, q.x, q.y, q.h + 1.2, 0.5, '#f4f2ea'); dot(q.x, q.y, q.h + 1.6, 0.45, '#ffd060'); dot(q.x, q.y, q.h + 1.7, 0.22, '#fff8e0'); break; }
      case 'vessel': { const q = handPt(p, 2.2, 1.4, 5.2); dot(q.x, q.y, q.h, 1.25, '#9aa0a8'); dot(q.x, q.y, q.h + 0.1, 0.8, '#c8ccd2'); break; }
      case 'paper': { const q = handPt(p, 0, 2.6, 6.6); const ca = Math.cos(a + PI / 2), sa = Math.sin(a + PI / 2); seg(q.x - ca * 2.2, q.y - sa * 2.2, q.h, q.x + ca * 2.2, q.y + sa * 2.2, q.h, 2.2, '#e8e2d2'); seg(q.x - ca * 1.6, q.y - sa * 1.6, q.h + 0.05, q.x + ca * 1.6, q.y + sa * 1.6, q.h + 0.05, 0.3, '#8a8a8a'); break; }
      case 'pot': { const q = handPt(p, 2.4, 0.4, 4.4); dot(q.x, q.y, q.h, 1.5, p.itemCol || '#d8302a'); dot(q.x, q.y, q.h + 0.2, 0.6, shade(p.itemCol || '#d8302a', 0.6)); break; }
      case 'pothead': { dot(p.x, p.y, 10.6, 1.9, p.itemCol || '#d8302a'); dot(p.x, p.y, 10.9, 0.7, shade(p.itemCol || '#d8302a', 0.55)); break; }
      case 'ticket': { const q = handPt(p, 1.2, 0.6, 12); seg(q.x, q.y, q.h, q.x + 0.5, q.y + 0.5, q.h, 1.3, '#f4e8a0'); break; }
      case 'bangles': { const q = handPt(p, 2.2, 1.8, 5.8); for (let i = 0; i < 4; i++) dot(q.x + i * 0.25, q.y, q.h + i * 0.1, 0.55, BANGLE_COLS[(i + p.seed) % BANGLE_COLS.length]); break; }
      case 'tube': { // a tube light on a T-pole over the head
        const ca = Math.cos(a + PI / 2), sa = Math.sin(a + PI / 2), hh = 14.5;
        seg(p.x, p.y, 9, p.x, p.y, hh, 0.4, '#7a7a7a');
        for (let oi = 0; oi < 2; oi++) { const o = TUBE_O[oi]; seg(p.x - ca * 3.4 + Math.cos(a) * o, p.y - sa * 3.4 + Math.sin(a) * o, hh, p.x + ca * 3.4 + Math.cos(a) * o, p.y + sa * 3.4 + Math.sin(a) * o, hh, 0.8, '#f4fbff'); }
        break;
      }
      case 'trumpet': { const q = handPt(p, 0.6, 2.2, 7.2), e = handPt(p, 0.6, 5.2, 7.4, HP2); seg(q.x, q.y, q.h, e.x, e.y, e.h, 0.5, '#e8c040'); dot(e.x, e.y, e.h, 0.9, '#f2d050'); break; }
      case 'drum': case 'dappu': { const q = handPt(p, -0.8, 2.0, 6.2); dot(q.x, q.y, q.h, p.item === 'drum' ? 2.1 : 1.8, p.item === 'drum' ? '#c8302a' : '#6a4a2a'); dot(q.x, q.y, q.h + 0.1, p.item === 'drum' ? 1.6 : 1.45, '#ece0c0'); const s = p.sc && p.sc.st && p.sc.st.calm ? -0.6 : Math.sin(t * 13 + p.seed); const st = handPt(p, 1.8, 2.4 + s, 7 + s, HP2); seg(st.x, st.y, st.h, q.x, q.y, q.h + 0.3, 0.3, '#5a3a1a'); break; }
      case 'sparkler': { const q = handPt(p, 1.6, 2.5, 6.5); seg(p.x, p.y, 6, q.x, q.y, q.h, 0.25, '#9a9a9a'); dot(q.x, q.y, q.h, 0.7, '#fff2b0'); break; }
      default: break;
    }
  }
  function drawCart(p) { // handcarts and the baraat's generator trolley, pushed in front
    const C = p.cart, a = p.angle, ca = Math.cos(a), sa = Math.sin(a);
    const x = p.x + ca * 7.5, y = p.y + sa * 7.5;
    if (C.kind === 'gen') { obox(x, y, a, 3.6, 2.4, 0.8, 4.6, '#4a5a6a', '#6a7a8a'); dot(x + ca * 2, y + sa * 2, 4.8, 0.8, '#2a2a2a'); return; }
    for (let si = 0; si < 2; si++) { const s = SIDES[si]; dot(x - sa * s * 3, y + ca * s * 3, 1.2, 1.2, '#3a3030'); }
    obox(x, y, a, 5, 2.8, 2.6, 3.3, '#7a5a3a', '#9a7a52');
    seg(p.x + ca * 1.2, p.y + sa * 1.2, 4.2, x - ca * 4.6, y - sa * 4.6, 3.4, 0.45, '#5a4028');
    const col = C.col;
    if (C.kind === 'sacks') { for (let i = 0; i < 3; i++) ell(x + ca * (i - 1) * 2.8, y + sa * (i - 1) * 2.8, 4.6, 1.6, 2.2, a, i % 2 ? '#d8c8a0' : col); }
    else if (C.kind === 'bananas') { for (let i = 0; i < 5; i++) ell(x + ca * (i - 2) * 1.8, y + sa * (i - 2) * 1.8, 4, 0.9, 2, a + 0.4, i % 2 ? '#e8d040' : '#c8b030'); }
    else if (C.kind === 'cloth') { for (let i = 0; i < 3; i++) obox(x + ca * (i - 1) * 2.8, y + sa * (i - 1) * 2.8, a, 1.3, 2.3, 3.3, 5.4 + (i % 2) * 0.6, CLOTH[i], null); }
    else { for (let i = 0; i < 4; i++) dot(x + ca * (i - 1.5) * 2.4, y + sa * (i - 1.5) * 2.4, 4.4, 1.2, '#b8643a'); }
  }
  function drawPerson(ctx, p) {
    frame2d(ctx);
    if (p.beh === 'sit') {
      if (p.chair) drawChair(p.chair);
      blit(ctx, p.look, p.x, p.y, p.angle, ANIM0, 2.6);
    } else if (p.beh === 'work') { // crouched over the muggu: lower and leaning
      blit(ctx, p.look, p.x, p.y, p.angle, ANIM0, 0.1);
      resetCtx(ctx);
      const q = handPt(p, 1.4, 3.2 + Math.sin(p.t * 3) * 0.6, 2.2); dot(q.x, q.y, q.h, 0.55, p.look.skin || '#a0683f');
    } else {
      blit(ctx, p.look, p.x, p.y, p.angle, p.anim, 0.6 + (p.bob || 0));
      if (p.beh === 'dance') { // hands up!
        resetCtx(ctx);
        const sk = p.look.skin || '#a0683f', s = Math.sin(p.t * 7 + p.seed);
        for (let si = 0; si < 2; si++) { const side = SIDES[si]; const q = handPt(p, side * (3.4 + s * side * 0.8), 0.6, 9 + Math.abs(s) * 2); dot(q.x, q.y, q.h, 0.65, sk); }
      } else if (p.beh === 'wave' || (p.beh === 'push')) {
        resetCtx(ctx);
        const sk = p.look.skin || '#a0683f';
        if (p.beh === 'wave') { const s = Math.sin(simT() * 5 + p.seed) * 2.2; const q = handPt(p, 4 + s * 0.3, 1 + s, 8.5); dot(q.x, q.y, q.h, 0.7, p.tag === 'havaldar' ? '#f4f2ea' : sk); }
        else for (let si = 0; si < 2; si++) { const q = handPt(p, SIDES[si] * 1.6, 3.2, 6.2); dot(q.x, q.y, q.h, 0.6, sk); }
      }
    }
    resetCtx(ctx);
    if (p.umb) { umbrella(p.x, p.y, 5.2, 11, p.umb, shade(p.umb, 1.3), 8); resetCtx(ctx); }
    if (p.item) { drawItem(p); resetCtx(ctx); }
    if (p.cart) { drawCart(p); resetCtx(ctx); }
  }
  function drawChair(ch) {
    const a = ch.a, ca = Math.cos(a), sa = Math.sin(a);
    obox(ch.x, ch.y, a, 2.2, 2.2, 0, 2.4, shade(ch.col, 0.8), ch.col);
    obox(ch.x - ca * 2.3, ch.y - sa * 2.3, a, 0.35, 2.3, 2.4, 6.4, shade(ch.col, 0.8), ch.col);
  }
  // ---- animals
  function drawBeast(ctx, b) {
    frame2d(ctx);
    const sp = b._sp, a = b.angle, lie = b.state === 'lie';
    const h = lie ? 2.8 : 5.4, k = kk(h), X = SX(b.x, k), Y = SY(b.y, k), ca = Math.cos(a) * k, sa = Math.sin(a) * k;
    // shadow
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const k0 = kk(0); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(SX(b.x, k0) + 1, SY(b.y, k0) + 1, 8 * k0, 4 * k0, a, 0, TAU); ctx.fill();
    ctx.setTransform(ca, sa, -sa, ca, X, Y);
    const c0 = b.col[0], c1 = b.col[1];
    const g = ctx;
    if (sp === 'horse') {
      const ph = b.ph * 2.2;
      g.fillStyle = shade(c0, 0.82);
      for (let i = 0; i < 8; i += 2) { const lx = LEGS_H[i], ly = LEGS_H[i + 1], s = b.moving ? Math.sin(ph + lx + ly) * 1.2 : 0; g.fillRect(lx + s - 0.5, ly - 0.5, 1, 1); }
      g.fillStyle = c0; g.beginPath(); g.ellipse(0, 0, 6.2, 2.3, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(6.4, 0, 2.6, 1.1, 0, 0, TAU); g.fill(); // neck + head
      g.fillStyle = '#c8202a'; g.fillRect(-3.5, -2.6, 6, 5.2); g.fillStyle = '#f2c230'; g.fillRect(-3.5, -2.6, 6, 0.6); g.fillRect(-3.5, 2.0, 6, 0.6); // the jhool
      g.fillStyle = '#f2c230'; g.fillRect(7.6, -0.4, 1.4, 0.8); // the plume
      g.fillStyle = '#e8e0d0'; g.beginPath(); g.ellipse(-6.6, 0, 1.5, 0.5, 0, 0, TAU); g.fill(); // tail
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (b.rider) { blit(ctx, b.rider.look, b.x - Math.cos(a) * 0.6, b.y - Math.sin(a) * 0.6, a, ANIM0, 8.2); resetCtx(ctx); for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU; dot(b.x + Math.cos(an) * 1.7, b.y + Math.sin(an) * 1.7, 15.4, 0.38, i % 2 ? '#f8f4e8' : '#f2c230'); } dot(b.x, b.y, 15.8, 1.2, '#c8202a'); }
      return;
    }
    const buff = sp === 'buffalo';
    if (!lie) {
      g.fillStyle = shade(c0, 0.7);
      const ph = b.ph * 1.6;
      for (let i = 0; i < 8; i += 2) { const lx = LEGS_C[i], ly = LEGS_C[i + 1], s = b.moving ? Math.sin(ph + lx * 0.7 + ly) * 1.1 : 0; g.fillRect(lx + s - 0.6, ly - 0.6, 1.2, 1.2); }
    }
    g.fillStyle = c0; g.beginPath(); g.ellipse(0, 0, 6.6, lie ? 3.6 : 3.1, 0, 0, TAU); g.fill();
    if (!buff) { g.fillStyle = c1; g.beginPath(); g.ellipse(2.4, 0, 1.6, 1.4, 0, 0, TAU); g.fill(); } // the hump
    if (!buff && b.seed % 3 === 0) { g.fillStyle = '#8a5a3a'; g.beginPath(); g.ellipse(-2.5, 1, 1.6, 1.2, 0.4, 0, TAU); g.fill(); }
    const hx = lie ? 6.4 : 7.4, hy = lie ? 1.6 : 0, nod = Math.sin(b.t * 1.3 + b.seed) * 0.4;
    g.fillStyle = shade(c0, buff ? 1.1 : 0.95); g.beginPath(); g.ellipse(hx, hy + nod, 2.2, 1.5, 0, 0, TAU); g.fill();
    g.strokeStyle = buff ? '#4a4440' : '#d8ccb0'; g.lineWidth = 0.55;
    g.beginPath();
    if (buff) { g.moveTo(hx - 0.6, hy + nod - 1.2); g.quadraticCurveTo(hx - 2.2, hy + nod - 3, hx - 3.6, hy + nod - 1.6); g.moveTo(hx - 0.6, hy + nod + 1.2); g.quadraticCurveTo(hx - 2.2, hy + nod + 3, hx - 3.6, hy + nod + 1.6); }
    else { g.moveTo(hx - 0.4, hy + nod - 1); g.lineTo(hx + 0.4, hy + nod - 2.6); g.moveTo(hx - 0.4, hy + nod + 1); g.lineTo(hx + 0.4, hy + nod + 2.6); }
    g.stroke();
    g.fillStyle = shade(c0, 0.6); g.beginPath(); g.ellipse(-6.8, Math.sin(b.t * 2 + b.seed) * 0.8, 1.4, 0.4, 0, 0, TAU); g.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---- muggulu (rangoli) at the doorsteps: painted once per pattern, drawn with a growing reveal
  const MUGG_PPU = 7;
  function paintMugg(M) {
    const S = Math.ceil(M.r * 2 * MUGG_PPU) + 2, c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d'), C = S / 2, r = M.r * MUGG_PPU;
    const rng = U.rng(M.seed);
    // the wet wash (kallapi) under the pattern
    g.fillStyle = 'rgba(52,58,40,0.55)'; g.beginPath(); g.arc(C, C, r * 1.0, 0, TAU); g.fill();
    g.strokeStyle = '#f6f4ec'; g.fillStyle = '#f6f4ec'; g.lineCap = 'round'; g.lineJoin = 'round';
    const col = M.cols[0], col2 = pick(['#f2d020', '#30a050', '#e8306a', '#2a6ad8']);
    if (M.kind === 0) { // chukkala muggu: a dot grid with loops threaded round the dots
      const n = M.n, sp = (r * 1.5) / (n - 1), o = C - (sp * (n - 1)) / 2;
      g.lineWidth = Math.max(1, sp * 0.13);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const x = o + i * sp, y = o + j * sp;
        if (Math.hypot(x - C, y - C) > r * 0.92) continue;
        if ((i + j) % 2 === 0) { g.beginPath(); g.arc(x, y, sp * 0.42, 0, TAU); g.stroke(); }
        g.beginPath(); g.arc(x, y, Math.max(0.8, sp * 0.08), 0, TAU); g.fill();
      }
      g.fillStyle = col; g.globalAlpha = 0.85;
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + PI / 4; g.beginPath(); g.ellipse(C + Math.cos(a) * r * 0.45, C + Math.sin(a) * r * 0.45, sp * 0.35, sp * 0.18, a, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
    } else if (M.kind === 1) { // a flower: rings of coloured petals with white outlines
      const pet = 8 + ((rng.next() * 3) | 0) * 2;
      for (let ring = 2; ring >= 0; ring--) {
        const rr0 = r * (0.35 + ring * 0.28), c0 = ring === 1 ? col2 : col;
        for (let i = 0; i < pet; i++) {
          const a = (i / pet) * TAU + ring * 0.2;
          g.beginPath(); g.ellipse(C + Math.cos(a) * rr0 * 0.6, C + Math.sin(a) * rr0 * 0.6, rr0 * 0.42, rr0 * 0.17, a, 0, TAU);
          g.fillStyle = c0; g.fill(); g.lineWidth = 1; g.strokeStyle = '#f6f4ec'; g.stroke();
        }
      }
      g.fillStyle = '#f2d020'; g.beginPath(); g.arc(C, C, r * 0.12, 0, TAU); g.fill();
    } else { // a star with lotus corners
      g.lineWidth = 1.4;
      for (let s = 0; s < 2; s++) {
        g.beginPath();
        for (let i = 0; i <= 8; i++) { const a = (i / 8) * TAU + s * PI / 8, rad = i % 2 ? r * 0.42 : r * 0.88; const x = C + Math.cos(a) * rad, y = C + Math.sin(a) * rad; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
        g.closePath(); g.fillStyle = s ? col2 : col; g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1; g.stroke();
      }
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.beginPath(); g.arc(C + Math.cos(a) * r * 0.95, C + Math.sin(a) * r * 0.95, 1.2, 0, TAU); g.fill(); }
      g.beginPath(); g.arc(C, C, r * 0.2, 0, TAU); g.fillStyle = '#f6f4ec'; g.fill();
    }
    M.img = c;
    return c;
  }
  function drawMuggulu(ctx, g) {
    for (const M of g.mugg) {
      const pr = M.prog;
      if (pr <= 0.01) continue;
      if (!N.render.inView(M.x, M.y, M.r + 4)) continue;
      const img = M.img || paintMugg(M), k = kk(0), X = SX(M.x, k), Y = SY(M.y, k);
      const s = (k * M.r * 2) / (img.width - 2), ca = Math.cos(M.a) * s, sa = Math.sin(M.a) * s;
      ctx.save();
      if (pr < 1) { ctx.beginPath(); ctx.arc(X, Y, Math.max(1, M.r * k * (0.15 + 0.85 * pr)), 0, TAU); ctx.clip(); }
      ctx.setTransform(ca, sa, -sa, ca, X, Y);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    }
    for (const q of g.papers) {
      if (!N.render.inView(q.x, q.y, 4)) continue;
      const k = kk(0.15), X = SX(q.x, k), Y = SY(q.y, k), ca = Math.cos(q.a) * k, sa = Math.sin(q.a) * k;
      ctx.setTransform(ca, sa, -sa, ca, X, Y);
      ctx.fillStyle = '#ece6d6'; ctx.fillRect(-1.6, -1.0, 3.2, 2.0); ctx.fillStyle = '#9a968c'; ctx.fillRect(-1.2, -0.5, 2.4, 0.25); ctx.fillRect(-1.2, 0.2, 1.8, 0.25);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---- cut-outs of fictional stars (painted once per film)
  const CUT_CACHE = new Map();
  function paintCutout(film) {
    let c = CUT_CACHE.get(film.t);
    if (c) return c;
    c = document.createElement('canvas'); c.width = 120; c.height = 216;
    const g = c.getContext('2d');
    // the hero, hand-painted style: a big pose with one fist up, the film title in a band below
    const grd = g.createLinearGradient(0, 0, 0, 216); grd.addColorStop(0, film.bg[0]); grd.addColorStop(1, film.bg[1]);
    g.fillStyle = grd; g.fillRect(14, 8, 92, 150);
    g.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(60, 70); g.lineTo(14 + i * 12, 8); g.lineTo(20 + i * 12, 8); g.fill(); }
    const skin = '#c8885a';
    g.fillStyle = '#1a1a2a'; g.fillRect(40, 112, 16, 66); g.fillRect(62, 112, 16, 66); // trousers
    g.fillStyle = '#e8e8f0'; g.beginPath(); g.moveTo(34, 62); g.lineTo(86, 62); g.lineTo(82, 118); g.lineTo(38, 118); g.closePath(); g.fill(); // shirt
    g.fillStyle = '#2a2a3a'; g.beginPath(); g.moveTo(34, 62); g.lineTo(50, 62); g.lineTo(46, 118); g.lineTo(38, 118); g.closePath(); g.fill(); g.beginPath(); g.moveTo(70, 62); g.lineTo(86, 62); g.lineTo(82, 118); g.lineTo(74, 118); g.closePath(); g.fill(); // jacket
    g.strokeStyle = '#e8e8f0'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(84, 66); g.lineTo(100, 40); g.lineTo(98, 16); g.stroke(); // the fist up
    g.fillStyle = skin; g.beginPath(); g.arc(98, 14, 6, 0, TAU); g.fill();
    g.strokeStyle = '#2a2a3a'; g.beginPath(); g.moveTo(36, 66); g.lineTo(26, 96); g.stroke();
    g.fillStyle = skin; g.beginPath(); g.arc(26, 99, 5, 0, TAU); g.fill();
    g.fillStyle = skin; g.beginPath(); g.ellipse(60, 44, 14, 17, 0, 0, TAU); g.fill();
    g.fillStyle = '#141014'; g.beginPath(); g.ellipse(61, 30, 15, 8, 0, PI, 0); g.fill(); g.fillRect(46, 30, 4, 12); g.fillRect(71, 30, 4, 12);
    g.fillStyle = '#121216'; g.fillRect(48, 40, 10, 5); g.fillRect(62, 40, 10, 5); g.fillRect(57, 41, 6, 2); // the dark glasses
    g.fillStyle = '#141014'; g.fillRect(53, 51, 14, 3); // moustache
    g.fillStyle = '#7a3a2a'; g.fillRect(56, 56, 8, 2);
    // the garland (marigold) round his neck and over the frame
    for (let i = 0; i < 26; i++) { const a = PI * 0.08 + (i / 25) * PI * 0.84; g.fillStyle = i % 3 === 0 ? '#f2c230' : '#f08a1a'; g.beginPath(); g.arc(60 + Math.cos(a) * 26, 64 + Math.sin(a) * 30, 3.6, 0, TAU); g.fill(); }
    g.fillStyle = '#c8202a'; g.fillRect(4, 158, 112, 40);
    g.fillStyle = '#f2c230'; g.fillRect(4, 158, 112, 4); g.fillRect(4, 194, 112, 4);
    g.fillStyle = '#ffffff'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(film.t, 60, 172, 108);
    g.font = 'bold 10px sans-serif'; g.fillStyle = '#f2c230'; g.fillText('NOW SHOWING', 60, 188, 100);
    c.title = film.t;
    CUT_CACHE.set(film.t, c);
    return c;
  }
  const SIGN_CACHE = new Map();
  function paintSign(text, bg, fg) {
    const key = text + bg; let c = SIGN_CACHE.get(key); if (c) return c;
    c = document.createElement('canvas'); c.width = 160; c.height = 36;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 160, 36); g.fillStyle = '#f2c230'; g.fillRect(0, 0, 160, 3); g.fillRect(0, 33, 160, 3);
    g.fillStyle = fg; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 80, 19, 150);
    SIGN_CACHE.set(key, c);
    return c;
  }

  // ---- per-scene props
  function drawJunction(ctx, sc) {
    frame2d(ctx);
    const s = sc.site, st = sc.st;
    if (st.podium) { // the painted podium with its little canopy
      cylD(s.x, s.y, 3.2, 0, 1.4, '#e8e4dc', '#f4f2ea');
      dot(s.x, s.y, 1.45, 2.2, '#c8302a'); dot(s.x, s.y, 1.5, 1.4, '#f4f2ea');
      const cx = s.x - 3.6, cy = s.y - 3.6;
      seg(cx, cy, 0, cx, cy, 15, 0.45, '#5a5a5a');
      resetCtx(ctx);
    }
  }
  function drawTall(ctx, sc) { // props that stand taller than people: sorted with the actors
    frame2d(ctx);
    const s = sc.site, st = sc.st;
    switch (sc.kind) {
      case 'junction': if (st.podium) { umbrella(s.x - 3.6, s.y - 3.6, 4.6, 15, '#f4f2ea', '#c8302a', 8); } break;
      case 'cinema': {
        const C = st.cut, img = paintCutout(s.film);
        const ux = s.ux, uy = s.uy;
        // the bamboo scaffold it leans on, then the board itself (leaning back towards the hall)
        const lx = s.nx * 22, ly = s.ny * 22;
        for (const u of [-9, 9]) { seg(C.x + ux * u + s.nx * 3, C.y + uy * u + s.ny * 3, 0, C.x + ux * u + lx + s.nx * 3, C.y + uy * u + ly + s.ny * 3, 32, 0.6, '#8a7a52'); seg(C.x + ux * u + lx + s.nx * 3, C.y + uy * u + ly + s.ny * 3, 0, C.x + ux * u + lx + s.nx * 3, C.y + uy * u + ly + s.ny * 3, 32, 0.6, '#8a7a52'); }
        obox(C.x, C.y, Math.atan2(uy, ux), 10, 2.4, 0, 2.2, '#8a7a5a', '#a89a78');
        imgSlope(img, C.x - ux * 10, C.y - uy * 10, C.x + ux * 10, C.y + uy * 10, 2, lx, ly, 30);
        for (let i = 0; i < 12; i++) { const f = i / 11; dot(C.x - ux * 10 + ux * 20 * f + lx * 0.05, C.y - uy * 10 + uy * 20 * f + ly * 0.05, 3 + Math.sin(f * PI) * 0.5, 0.9, i % 2 ? '#f08a1a' : '#f2c230'); }
        // the counter: a wall with a grille window and the board above
        const W = st.counter, a = Math.atan2(uy, ux);
        obox(W.x + s.nx * 2, W.y + s.ny * 2, a, 7, 1.6, 0, 11, '#c8b898', '#a89878');
        const wx = W.x + s.nx * 0.3, wy = W.y + s.ny * 0.3;
        obox(wx, wy, a, 1.6, 0.4, 4.5, 7.5, '#3a3a3a', '#5a5a5a');
        ptext(W.x - s.nx * 0.5, W.y - s.ny * 0.5, 12, st.housefull ? 'HOUSE FULL' : 'TICKETS', st.housefull ? '#ff4a3a' : '#f2c230');
        break;
      }
      case 'oldcity': {
        for (const S of st.stalls) {
          if (!N.render.inView(S.x, S.y, 12)) continue;
          const a = S.a, ca = Math.cos(a), sa = Math.sin(a);
          if (S.type === 'bangles') {
            obox(S.x, S.y, a, 4, 2.4, 0, 3.2, '#7a5a3a', '#8a6a48');
            for (let i = 0; i < 10; i++) { const u = (i % 5 - 2) * 1.5, v = (i < 5 ? -1 : 1) * 1.0; const x = S.x + ca * u - sa * v, y = S.y + sa * u + ca * v; ell(x, y, 3.4, 0.8, 0.8, 0, S.cols[i]); ell(x, y, 3.5, 0.45, 0.45, 0, shade(S.cols[i], 0.6)); }
            // the stand with bangles stacked on rods
            for (let i = 0; i < 3; i++) { const u = (i - 1) * 2.6, x = S.x + ca * u + S.nx * 2.2, y = S.y + sa * u + S.ny * 2.2; for (let j = 0; j < 6; j++) dot(x, y, 3.4 + j * 0.9, 0.75, S.cols[(i * 3 + j) % S.cols.length]); }
            umbrella(S.x + S.nx * 1.2, S.y + S.ny * 1.2, 5.2, 11, '#e8e0c8', '#c8302a', 8);
          } else {
            obox(S.x, S.y, a, 3, 1.8, 0, 3, '#5a4030', '#e8e0d0');
            for (let i = 0; i < 8; i++) { const u = (i % 4 - 1.5) * 1.3, v = (i < 4 ? -0.6 : 0.6); const x = S.x + ca * u - sa * v, y = S.y + sa * u + ca * v; dot(x, y, 3.5, 0.45, ATTAR[i % 4]); dot(x - 0.15, y - 0.15, 3.7, 0.15, '#ffffff'); }
          }
        }
        break;
      }
      case 'baraat': {
        const G = s.gate, ca = Math.cos(G.a), sa = Math.sin(G.a), hw = 9;
        const lx = G.x - ca * hw, ly = G.y - sa * hw, rx = G.x + ca * hw, ry = G.y + sa * hw;
        cylD(lx, ly, 1.1, 0, 22, '#e8c8a0', '#f4f2ea'); cylD(rx, ry, 1.1, 0, 22, '#e8c8a0', '#f4f2ea');
        imgSlope(paintSign(s.sign, '#8a1a2a', '#fff2c0'), lx, ly, rx, ry, 17, G.nx * 5, G.ny * 5, 23);
        const night = CX.night, tt = simT();
        for (let i = 0; i <= 14; i++) { const f = i / 14, x = lerp(lx, rx, f), y = lerp(ly, ry, f); dot(x, y, 24 + Math.sin(f * PI) * 2, 0.5, night && ((i + (tt * 4 | 0)) % 3) ? '#fff2a0' : '#d8b040'); }
        for (let i = 0; i < 8; i++) { const f = i / 7; dot(lerp(lx, rx, f), lerp(ly, ry, f), 17 - Math.sin(f * PI) * 3, 0.7, i % 2 ? '#f08a1a' : '#f2c230'); }
        break;
      }
      default: break;
    }
    resetCtx(ctx);
  }
  function drawGround(ctx, sc) { // flat things on the road: stumps, ball, pots, tanker, the cut-out's shadow
    frame2d(ctx);
    const st = sc.st;
    if (sc.kind === 'colony_pm' && st.cricket) {
      const C = st.cricket, B = C.ball;
      const down = C.down > 0;
      for (let i = -1; i <= 1; i++) {
        const x = C.wx - C.uy * i * 0.7, y = C.wy + C.ux * i * 0.7;
        if (down) seg(x, y, 0.2, x + C.ux * 2.4 + i * 0.6, y + C.uy * 2.4 + i * 0.6, 0.3, 0.45, '#d8c8a0');
        else seg(x, y, 0, x, y, 5.6, 0.45, '#d8c8a0');
      }
      if (!down) seg(C.wx - C.uy * 0.8, C.wy + C.ux * 0.8, 5.7, C.wx + C.uy * 0.8, C.wy - C.ux * 0.8, 5.7, 0.35, '#c8a060');
      // the crease scratched in the dust
      seg(C.wx + C.ux * 3.6 - C.uy * 3, C.wy + C.uy * 3.6 + C.ux * 3, 0.05, C.wx + C.ux * 3.6 + C.uy * 3, C.wy + C.uy * 3.6 - C.ux * 3, 0.05, 0.3, 'rgba(240,236,220,0.7)');
      if (B.live || B.held) { const k0 = kk(0); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(SX(B.x, k0), SY(B.y, k0), Math.max(0.5, 0.7 * k0), 0, TAU); ctx.fill(); dot(B.x, B.y, B.h, 0.75, '#d8e040'); }
      if (C.swing > 0 && C.bat && C.bat.alive) { const p = C.bat, a = p.angle + (1 - C.swing) * 2.4 - 1.2; seg(p.x, p.y, 5, p.x + Math.cos(a) * 6, p.y + Math.sin(a) * 6, 4.5, 1.1, '#d8b878'); }
    }
    if (sc.kind === 'colony_pm' && st.power) for (const c of st.candles) { seg(c.x, c.y, c.h, c.x, c.y, c.h + 1.4, 0.55, '#f4f2ea'); dot(c.x, c.y, c.h + 1.9 + Math.sin(simT() * 9 + c.ph) * 0.12, 0.5, '#ffd060'); }
    if (sc.kind === 'colony_am') {
      const T = st.tanker;
      if (T) {
        const a = T.a;
        for (const p of T.pots) dot(p.x, p.y, 1.6, 1.4, p.col);
        obox(T.x + Math.cos(a) * 15, T.y + Math.sin(a) * 15, a, 5, 6.5, 1.5, 12, '#2a4a8a', '#3a5aa0'); // cab
        obox(T.x + Math.cos(a) * 21, T.y + Math.sin(a) * 21, a, 1.2, 6, 4, 8, '#e8e8e8', '#cfe0f0'); // windscreen
        cylH(T.x - Math.cos(a) * 3, T.y - Math.sin(a) * 3, a, 12, 6.2, 3.4, '#3a6ab8', '#5a8ad8');
        ptext(T.x - Math.cos(a) * 3, T.y - Math.sin(a) * 3, 13.5, 'DRINKING WATER', '#f4f2ea');
        dot(T.tap.x, T.tap.y, 3.2, 0.7, '#9aa0a8');
      }
      for (const Th of st.throws) { const f = Th.t / Th.dur; dot(lerp(Th.x0, Th.x1, f), lerp(Th.y0, Th.y1, f), 6 + Math.sin(f * PI) * 6 - f * 5, 0.9, '#ece6d6'); }
      for (const v of sc.vehs) {
        if (!v.alive || !v.cle) continue;
        const c = v.cle, a = v.angle, ca = Math.cos(a), sa = Math.sin(a);
        if (c.cans) for (let si = 0; si < 2; si++) { const s2 = SIDES[si], x = v.x - ca * 5.2 - sa * s2 * 2.2, y = v.y - sa * 5.2 + ca * s2 * 2.2; cylD(x, y, 1.3, 2, 6.2, '#a8acb4', '#d0d4da'); }
        if (c.papers) ell(v.x - ca * 4.6, v.y - sa * 4.6, 5.6, 2, 1.4, a, '#d8d0b8');
        if (c.kids) { // school kids packed in, bags hanging out
          for (let i = 0; i < Math.min(7, c.kids); i++) { const u = -3.5 + (i % 4) * 2, s2 = i < 4 ? 1 : -1; const x = v.x + ca * u - sa * s2 * 5.8, y = v.y + sa * u + ca * s2 * 5.8; dot(x, y, 10, 1.3, '#1a1412'); dot(x - sa * s2 * 0.9, y + ca * s2 * 0.9, 7.5, 1.2, KIDBAG[i % 4]); }
        }
      }
    }
    if (sc.kind === 'baraat') { // the generator cable snaking up to the tube lights
      const g = st.gen;
      if (g && g.alive) {
        let px = g.x + Math.cos(g.angle) * 7, py = g.y + Math.sin(g.angle) * 7;
        for (const p of st.members) { if (!p.alive || p.item !== 'tube') continue; seg(px, py, 1.4, p.x, p.y, 8, 0.28, '#141414'); px = p.x; py = p.y; }
      }
    }
    resetCtx(ctx);
  }
  function cylH(x, y, a, hl, r, h0, wall, top) { // a horizontal tank: a long box with a rounded top
    obox(x, y, a, hl, r * 0.92, h0, h0 + r * 1.2, wall, top);
    obox(x, y, a, hl, r * 0.6, h0 + r * 1.2, h0 + r * 1.55, shade(wall, 1.1), top);
  }
  // ---- particles + haze + honk marks (one fx pass)
  let PUFF = null, HAZE = null;
  function puffSprite() {
    if (PUFF) return PUFF;
    PUFF = document.createElement('canvas'); PUFF.width = PUFF.height = 24;
    const g = PUFF.getContext('2d'), gr = g.createRadialGradient(12, 12, 1, 12, 12, 12);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 24, 24);
    return PUFF;
  }
  const TINTED = new Map();
  function tinted(col) {
    let c = TINTED.get(col); if (c) return c;
    const base = puffSprite(); c = document.createElement('canvas'); c.width = c.height = 24;
    const g = c.getContext('2d'); g.drawImage(base, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, 24, 24);
    TINTED.set(col, c); return c;
  }
  function hazeSprite() {
    if (HAZE) return HAZE;
    HAZE = document.createElement('canvas'); HAZE.width = HAZE.height = 64;
    const g = HAZE.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(176,150,112,0.85)'); gr.addColorStop(0.6, 'rgba(160,140,110,0.4)'); gr.addColorStop(1, 'rgba(150,130,100,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return HAZE;
  }
  function drawFx(ctx) {
    frame2d(ctx);
    for (const sc of ACTIVE) {
      if (sc.kind === 'junction' && sc.level > 0.1) {
        const s = sc.site, k = kk(4), r = (sc.st.J.jr + 70) * k, X = SX(s.x, k), Y = SY(s.y, k);
        if (X > -r && Y > -r && X < R.W + r && Y < R.H + r) { ctx.globalAlpha = 0.1 + 0.16 * sc.level; ctx.drawImage(hazeSprite(), X - r, Y - r, r * 2, r * 2); ctx.globalAlpha = 1; }
      }
      for (const v of sc.vehs) { // honks: little sound arcs at the bonnet
        if (!v.alive || !v.cle || !(v.cle.honkT > 0)) continue;
        const a = v.angle, L = v.T.w / 2 + 2, k = kk(6), x = SX(v.x + Math.cos(a) * L, k), y = SY(v.y + Math.sin(a) * L, k), f = 1 - v.cle.honkT / 0.45;
        ctx.strokeStyle = '#fff8d2'; ctx.globalAlpha = 0.85 * (1 - f); ctx.lineWidth = 1;
        for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(x, y, (2 + i * 2.5 + f * 4) * k, a - 0.7, a + 0.7); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
    }
    for (let i = 0; i < P.n; i++) {
      const kd = P.k[i], x = P.x[i], y = P.y[i], h = P.h[i];
      if (!N.render.inView(x, y, 6)) continue;
      const f = P.t[i] / P.life[i], k = kk(h), X = SX(x, k), Y = SY(y, k);
      if (kd === PK.DUST || kd === PK.EXH) {
        const s = P.s[i] * (1 + f * 1.6) * k;
        ctx.globalAlpha = (kd === PK.DUST ? 0.32 : 0.42) * (1 - f) * Math.min(1, f * 6);
        ctx.drawImage(tinted(PCOL[P.c[i]]), X - s, Y - s, s * 2, s * 2);
      } else if (kd === PK.SPARK) {
        ctx.globalAlpha = 1 - f; ctx.fillStyle = PCOL[P.c[i]]; ctx.fillRect(X - 0.5, Y - 0.5, 1, 1);
      } else {
        const s = Math.max(0.6, P.s[i] * k);
        ctx.globalAlpha = kd === PK.WATER ? 0.7 : 1 - f * f; ctx.fillStyle = PCOL[P.c[i]];
        if (kd === PK.CONF) { const w = s * (0.5 + 0.5 * Math.abs(Math.sin(P.t[i] * 9 + i))); ctx.fillRect(X - w / 2, Y - s / 2, w, s); }
        else ctx.fillRect(X - s / 2, Y - s / 2, s, s);
      }
    }
    resetCtx(ctx);
  }
  // ---- lights at night (pooled objects, pushed into N.render.lights each frame)
  const LPOOL = []; let LN = 0;
  function light(x, y, r, color, intensity, h) {
    const L = R.lights; if (!L || LN > 24) return;
    let o = LPOOL[LN]; if (!o) { o = { x: 0, y: 0, r: 0, color: '', intensity: 0, h: 0 }; LPOOL[LN] = o; }
    LN++;
    o.x = x; o.y = y; o.r = r; o.color = color; o.intensity = intensity; o.h = h || 6;
    L.push(o); ST.lights++;
  }
  function pushLights() {
    LN = 0;
    if (!CX.night && !(R.night > 0.15)) return;
    for (const sc of ACTIVE) {
      const st = sc.st;
      if (sc.kind === 'baraat' && !st.done) {
        let n = 0;
        for (const p of st.members) if (p.alive && p.item === 'tube' && (n++ % 2 === 0)) light(p.x, p.y, 34, '#e8f4ff', 0.75, 14);
        light(sc.site.gate.x, sc.site.gate.y, 40, '#ffe6a0', 0.85, 22);
      } else if (sc.kind === 'colony_pm' && st.power) for (const c of st.candles) light(c.x, c.y, 16, '#ffc870', 0.6, 4);
      else if (sc.kind === 'baraat') light(sc.site.gate.x, sc.site.gate.y, 40, '#ffe6a0', 0.8, 22);
    }
  }

  /* ================================================================ 3D (view3d.js loads after this file: registered lazily) */
  const G3 = { ready: false, THREE: null, H: null, grp: null, im: {}, pts: null, glo: null, scenes: new Map(), decals: new Map(), ms: 0, M4: null, Q: null, V: null, S: null, E: null, UP: null };
  // [terrain] the ground's rise and fall under a world point (terrain.js via view3d.js; 0 when it is off); tzOf(q) keeps
  // it on a prop that never moves (chairs, pots, candles, doorstep papers, rangoli) so it is looked up once
  const TZ = (x, y) => (G3.H && G3.H.terrainAt ? G3.H.terrainAt(x, y) : 0);
  const tzOf = (q) => (q.tz != null ? q.tz : (q.tz = TZ(q.x, q.y)));
  const IMSPEC = { box: 300, cyl: 260, ball: 200, cone: 48, emis: 120, ebal: 140 };
  function imMake(THREE, key, n) {
    let geo;
    if (key === 'box' || key === 'emis') geo = new THREE.BoxGeometry(1, 1, 1);
    else if (key === 'cyl') geo = new THREE.CylinderGeometry(1, 1, 1, 10);
    else if (key === 'cone') geo = new THREE.ConeGeometry(1, 1, 10, 1, true);
    else geo = new THREE.SphereGeometry(1, 8, 6);
    const emissive = key === 'emis' || key === 'ebal';
    const mat = emissive ? new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }) : new THREE.MeshLambertMaterial({ color: 0xffffff, side: key === 'cone' ? THREE.DoubleSide : THREE.FrontSide });
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) m.setColorAt(i, c);
    m.count = 0; m.frustumCulled = false; m.castShadow = !emissive; m.receiveShadow = false;
    m.userData.noShadow = emissive;
    return { mesh: m, n: 0, max: n };
  }
  /** one instance: centre (x, h, y) in world units (h = bottom for 'cyl'/'box' when bottom true), yaw ry, scale (sx, sy, sz), colour hex */
  function I(key, x, h, y, ry, sx, sy, sz, col, rx, rz) {
    const B = G3.im[key]; if (!B || B.n >= B.max) return;
    const i = B.n++;
    G3.V.set(x, h, y); G3.S.set(sx, sy, sz);
    G3.E.set(rx || 0, -(ry || 0), rz || 0, 'YXZ'); G3.Q.setFromEuler(G3.E);
    G3.M4.compose(G3.V, G3.Q, G3.S);
    B.mesh.setMatrixAt(i, G3.M4);
    B.mesh.setColorAt(i, G3.H.color(col));
  }
  const ibox = (x, h0, y, a, l, w, hh, col) => I('box', x, h0 + hh / 2, y, a, l, hh, w, col);
  const icyl = (x, h0, y, r, hh, col) => I('cyl', x, h0 + hh / 2, y, 0, r, hh, r, col);
  const iball = (x, h, y, r, col) => I('ball', x, h, y, 0, r, r, r, col);
  // ---- particles as points (normal + additive)
  const PT_VS = [
    'attribute vec2 aSA; attribute vec3 aCol; varying vec4 vCol; uniform float uScale;',
    'void main() { vCol = vec4(aCol, aSA.y); vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = clamp(aSA.x * uScale / max(1.0, -mv.z), 1.0, 256.0); gl_Position = projectionMatrix * mv; }',
  ].join('\n');
  const PT_FS = [
    'varying vec4 vCol; uniform float uHard;',
    'void main() { vec2 d = gl_PointCoord - vec2(0.5); float r = length(d) * 2.0;',
    '  float a = mix(1.0 - smoothstep(0.0, 1.0, r), 1.0 - step(0.85, r), uHard); a = pow(a, 1.3);',
    '  if (vCol.a * a < 0.004) discard; gl_FragColor = vec4(vCol.rgb, vCol.a * a); }',
  ].join('\n');
  function makePoints(THREE, n, additive, hard) {
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3), col = new THREE.BufferAttribute(new Float32Array(n * 3), 3), siz = new THREE.BufferAttribute(new Float32Array(n * 2), 2);
    for (const a of [pos, col, siz]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pos); geo.setAttribute('aCol', col); geo.setAttribute('aSA', siz);
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const mat = new THREE.ShaderMaterial({ vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: { value: 600 }, uHard: { value: hard || 0 } } });
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false; p.renderOrder = 6; p.userData.noShadow = true;
    return { p, n: 0, max: n, pa: pos.array, ca: col.array, sa: siz.array };
  }
  function ptAdd(B, x, h, y, size, a, col) {
    if (B.n >= B.max) return;
    const i = B.n++, c = G3.H.color(col);
    B.pa[i * 3] = x; B.pa[i * 3 + 1] = h; B.pa[i * 3 + 2] = y;
    B.ca[i * 3] = c.r; B.ca[i * 3 + 1] = c.g; B.ca[i * 3 + 2] = c.b;
    B.sa[i * 2] = size; B.sa[i * 2 + 1] = a;
  }
  function ptCommit(B, H) {
    const g = B.p.geometry, a = g.attributes;
    g.setDrawRange(0, B.n); a.position.needsUpdate = true; a.aCol.needsUpdate = true; a.aSA.needsUpdate = true;
    const cam = H.camera, r = H.renderer;
    if (cam && r) B.p.material.uniforms.uScale.value = (r.domElement.height || 720) / (2 * Math.tan((cam.fov * PI) / 360));
  }
  const VSC = () => (N.view3d && N.view3d.VS) || 1.5;
  // ---- per-scene static models (merged, one draw call each where possible)
  function texPlane(H, key, canvas, w, h) {
    const THREE = H.THREE;
    const tex = H.tex ? H.tex(key, canvas.width, canvas.height, (g) => g.drawImage(canvas, 0, 0), { premult: false }) : new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.05 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.userData.own = true;
    return m;
  }
  function useModel(H, id, grp, x, y, a, s) { // a Blender prop when the pipeline ships it
    try {
      const M = N.models3d;
      if (!M || !M.has || !M.has(id) || !M.instance) return false;
      const o = M.instance(id);
      if (!o) return false;
      o.position.set(x, 0, y); o.rotation.y = -(a || 0); if (s) o.scale.setScalar(s);
      grp.add(o); return true;
    } catch (e) { return false; }
  }
  function build3d(sc, H) {
    const THREE = H.THREE, grp = new THREE.Group(), s = sc.site, st = sc.st, VS = VSC();
    const o = { grp, signs: null };
    const b = H.builder();
    let any = false;
    // [terrain] each piece (podium, cut-out, counter, stall, gate) is rigid on the low side of its footprint (TB): mark()
    // before it, lift(mark, off) after it raises its builder vertices and the group children added since by off; off
    // null: the ground under each (the tanker follows the road like the traffic pitches on it)
    const TB = (x, y, r) => (H.terrainBase ? H.terrainBase(x - r, y - r, x + r, y + r) : 0), LIFT = [];
    const mark = () => [b.n, grp.children.length];
    const lift = (m, off) => { LIFT.push(m[0], b.n, off); for (let k = m[1]; k < grp.children.length; k++) { const c = grp.children[k]; c.position.y += off == null ? TZ(c.position.x, c.position.z) : off; } };
    if (sc.kind === 'junction' && st.podium) {
      const m0 = mark();
      b.color('#e8e4dc').cyl(s.x, 0, s.y, 3.2, 3.2, 1.5, 14).color('#c8302a').cyl(s.x, 1.5, s.y, 2.3, 2.3, 0.08, 14);
      b.color('#5a5a5a').cyl(s.x - 3.6, 0, s.y - 3.6, 0.22, 0.22, 15 * VS / 1.5 * 1.1, 6);
      any = true;
      const um = new THREE.Mesh(new THREE.ConeGeometry(4.8, 1.8, 8, 1, true), new THREE.MeshLambertMaterial({ color: '#f4f2ea', side: THREE.DoubleSide }));
      um.position.set(s.x - 3.6, 16.5 * 1.1, s.y - 3.6); um.userData.own = true; grp.add(um);
      const ub = new THREE.Mesh(new THREE.ConeGeometry(4.85, 1.82, 8, 1, true, 0, PI / 4), new THREE.MeshLambertMaterial({ color: '#c8302a', side: THREE.DoubleSide }));
      ub.position.copy(um.position); ub.userData.own = true; grp.add(ub);
      lift(m0, TB(s.x, s.y, 4));
    }
    if (sc.kind === 'cinema') {
      const C = st.cut, a = Math.atan2(s.uy, s.ux), m0 = mark();
      if (!useModel(H, 'prop_cutout', grp, C.x, C.y, a)) {
        for (const u of [-9, 9]) b.color('#7a6a4a').cyl(C.x + s.ux * u + s.nx * 1.5, 0, C.y + s.uy * u + s.ny * 1.5, 0.35, 0.35, 52, 6);
        b.color('#8a7a5a').obox(C.x, C.y, 20, 4.8, 0, 3, a);
        const pl = texPlane(H, 'cle:cut:' + s.film.t, paintCutout(s.film), 20, 36);
        pl.position.set(C.x - s.nx * 0.2, 3 + 18, C.y - s.ny * 0.2); pl.rotation.y = -a; grp.add(pl);
        any = true;
      }
      lift(m0, TB(C.x, C.y, 10));
      const W = st.counter, m1 = mark();
      b.color('#c8b898').obox(W.x + s.nx * 2, W.y + s.ny * 2, 14, 3.2, 0, 16.5, a);
      b.color('#2a2a2a').obox(W.x + s.nx * 0.3, W.y + s.ny * 0.3, 3.2, 0.8, 6.5, 11, a);
      any = true;
      const sT = texPlane(H, 'cle:sign:TICKETS', paintSign('TICKETS', '#2a3a6a', '#f2c230'), 10, 2.3);
      const sH = texPlane(H, 'cle:sign:HOUSEFULL', paintSign('HOUSE FULL', '#c8202a', '#ffffff'), 10, 2.3);
      for (const m of [sT, sH]) { m.position.set(W.x + s.nx * 0.35 - s.nx * 0, 13.6, W.y + s.ny * 0.35); m.rotation.y = -a; m.translateZ(0.05); grp.add(m); }
      // face the road: the plane's normal is +z in local space; turn it towards -n
      const fa = Math.atan2(-s.ny, -s.nx);
      sT.rotation.y = -fa + PI / 2; sH.rotation.y = -fa + PI / 2;
      lift(m1, TB(W.x + s.nx * 2, W.y + s.ny * 2, 7));
      pl3Fix(grp, s);
      o.signs = { sT, sH };
    }
    if (sc.kind === 'oldcity') {
      for (const S of st.stalls) {
        const a = S.a, ca = Math.cos(a), sa = Math.sin(a), m0 = mark();
        if (S.type === 'bangles') {
          if (!useModel(H, 'bangle_stall', grp, S.x, S.y, a)) {
            b.color('#7a5a3a').obox(S.x, S.y, 8, 4.8, 0, 4.4, a);
            for (let i = 0; i < 10; i++) { const u = (i % 5 - 2) * 1.5, v = (i < 5 ? -1 : 1) * 1.0; b.color(S.cols[i]).cyl(S.x + ca * u - sa * v, 4.4, S.y + sa * u + ca * v, 0.75, 0.75, 0.5, 8); }
            for (let i = 0; i < 3; i++) { const u = (i - 1) * 2.6, x = S.x + ca * u + S.nx * 2.2, y = S.y + sa * u + S.ny * 2.2; b.color('#5a4030').cyl(x, 0, y, 0.12, 0.12, 9, 4); for (let j = 0; j < 7; j++) b.color(S.cols[(i * 3 + j) % S.cols.length]).cyl(x, 4.6 + j * 0.62, y, 0.7, 0.7, 0.42, 8); }
            b.color('#5a5a5a').cyl(S.x + S.nx * 1.2, 0, S.y + S.ny * 1.2, 0.15, 0.15, 13, 5);
            const um = new THREE.Mesh(new THREE.ConeGeometry(5.4, 1.8, 8, 1, true), new THREE.MeshLambertMaterial({ color: '#e8e0c8', side: THREE.DoubleSide }));
            um.position.set(S.x + S.nx * 1.2, 13.5, S.y + S.ny * 1.2); um.userData.own = true; grp.add(um);
            any = true;
          }
        } else {
          b.color('#5a4030').obox(S.x, S.y, 6, 3.6, 0, 4.2, a).color('#e8e0d0').obox(S.x, S.y, 6.1, 3.7, 4.2, 4.35, a);
          for (let i = 0; i < 8; i++) { const u = (i % 4 - 1.5) * 1.3, v = (i < 4 ? -0.6 : 0.6); b.color(['#e8b030', '#c83a5a', '#30a050', '#f4f2ea'][i % 4]).cyl(S.x + ca * u - sa * v, 4.35, S.y + sa * u + ca * v, 0.32, 0.25, 1.0, 6); }
          any = true;
        }
        lift(m0, TB(S.x, S.y, S.type === 'bangles' ? 5 : 3.5));
      }
    }
    if (sc.kind === 'baraat') {
      const G = s.gate, ca = Math.cos(G.a), sa = Math.sin(G.a), hw = 9, gh = 22 * 1.25;
      const lx = G.x - ca * hw, ly = G.y - sa * hw, rx = G.x + ca * hw, ry = G.y + sa * hw;
      const m0 = mark(), gb = H.terrainBase ? H.terrainBase(Math.min(lx, rx), Math.min(ly, ry), Math.max(lx, rx), Math.max(ly, ry)) : 0;
      b.color('#e8c8a0').cyl(lx, 0, ly, 1.1, 1.1, gh, 8).cyl(rx, 0, ry, 1.1, 1.1, gh, 8);
      b.color('#f2c230').obox(G.x, G.y, hw * 2 + 3, 1.4, gh - 0.4, gh + 1.2, G.a);
      for (let i = 0; i < 9; i++) { const f = i / 8; b.color(i % 2 ? '#f08a1a' : '#f2c230').sphere(lerp(lx, rx, f), gh - 4 - Math.sin(f * PI) * 3.5, lerp(ly, ry, f), 0.8, 0.8, 0.8, 6, 4); }
      any = true;
      const sg = texPlane(H, 'cle:sign:' + s.sign, paintSign(s.sign, '#8a1a2a', '#fff2c0'), 18, 4);
      sg.position.set(G.x - G.nx * 0.8, gh - 2.2, G.y - G.ny * 0.8); sg.rotation.y = -Math.atan2(-G.ny, -G.nx) + PI / 2; grp.add(sg);
      lift(m0, gb);
      o.bulbs = []; // world points (the gate's base in them)
      for (let i = 0; i <= 14; i++) { const f = i / 14; o.bulbs.push([lerp(lx, rx, f), gb + gh + 1.6 + Math.sin(f * PI) * 2.4, lerp(ly, ry, f)]); }
      for (let i = 0; i <= 10; i++) { const f = i / 10; o.bulbs.push([lx, gb + f * gh, ly], [rx, gb + f * gh, ry]); }
    }
    if (sc.kind === 'colony_am' && st.tanker) {
      const T = st.tanker, a = T.a, ca = Math.cos(a), sa = Math.sin(a), m0 = mark();
      if (!useModel(H, 'water_tanker', grp, T.x, T.y, a)) {
        b.color('#2a4a8a').obox(T.x + ca * 15, T.y + sa * 15, 10, 13, 1.5, 14, a).color('#cfe0f0').obox(T.x + ca * 20.2, T.y + sa * 20.2, 0.4, 11, 8, 13, a);
        const tk = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 24, 14), new THREE.MeshLambertMaterial({ color: '#3a6ab8' }));
        tk.rotation.set(0, -a, PI / 2, 'YXZ'); tk.position.set(T.x - ca * 3, 10.5, T.y - sa * 3); tk.userData.own = true; grp.add(tk);
        b.color('#2a2a2a').obox(T.x - ca * 3, T.y - sa * 3, 26, 11, 2.8, 4.4, a);
        for (const u of [12, -6, -12]) for (const sd of [-1, 1]) b.color('#141414').cyl(T.x + ca * u - sa * sd * 5.6, 0, T.y + sa * u + ca * sd * 5.6, 2.4, 2.4, 1.6, 10);
        any = true;
      }
      lift(m0, null);
    }
    if (any) {
      const m = b.mesh();
      if (m) {
        const g = m.geometry, pa = g.attributes.position.array;
        for (let i = 0; i < LIFT.length; i += 3) for (let k = LIFT[i]; k < LIFT[i + 1]; k++) pa[k * 3 + 1] += LIFT[i + 2] == null ? TZ(pa[k * 3], pa[k * 3 + 2]) : LIFT[i + 2];
        if (LIFT.length) { g.computeBoundingSphere(); g.computeBoundingBox(); }
        m.userData.own = true; grp.add(m);
      }
    }
    return o;
  }
  function pl3Fix() { /* signs are placed facing the road in build3d */ }
  function emit3d(sc, H) {
    const st = sc.st, t = simT(), night = clamp(H.night || 0, 0, 1);
    const GL = G3.glo, PN = G3.pts;
    // people's things
    for (const p of sc.persons) {
      if (!p.alive || !p.item) continue;
      const a = p.angle, ca = Math.cos(a), sa = Math.sin(a), kid = p.look && (p.look.kind === 'kid' || p.look.kind === 'student'), z = kid ? 0.78 : 1;
      const px = p.x, py = p.y, el = H.elev ? H.elev(p) : 0; // [terrain] his feet where view3d_actors stands him (the ground included)
      switch (p.item) {
        case 'tube': {
          icyl(p.x, el + 8 * z, p.y, 0.14, 6.5, '#7a7a7a');
          for (let oi = 0; oi < 2; oi++) { const off = TUBE3[oi]; I('emis', p.x + ca * off, el + 14.6 * z, p.y + sa * off, a + PI / 2, 7, 0.35, 0.35, night > 0.3 ? '#f4fbff' : '#d8e4ec'); }
          if (night > 0.2) ptAdd(GL, p.x, el + 14.6 * z, p.y, 4.5, 0.22 * night, '#cfe8ff');
          break;
        }
        case 'trumpet': I('cone', (px + ca * (3.4) - sa * (0.6)), el + 6.8, (py + sa * (3.4) + ca * (0.6)), a, 0.8, 3.2, 0.8, '#e8c040', 0, -PI / 2); break;
        case 'fan': { const s = Math.sin(t * 11 + p.seed) * 0.6; I('cyl', (px + ca * (1.8) - sa * (2.2)), el + 7 * z, (py + sa * (1.8) + ca * (2.2)), a + s, 1.4, 0.12, 1.4, '#d8b060', PI / 2, 0); break; }
        case 'candle': icyl((px + ca * (2) - sa * (1.4)), el + 6 * z, (py + sa * (2) + ca * (1.4)), 0.22, 1.1, '#f4f2ea'); ptAdd(GL, (px + ca * (2) - sa * (1.4)), el + 7.4 * z, (py + sa * (2) + ca * (1.4)), 2.2, 0.9, '#ffc860'); break;
        case 'vessel': icyl((px + ca * (1.6) - sa * (2.2)), el + 4.4 * z, (py + sa * (1.6) + ca * (2.2)), 1.1, 1.6, '#a8acb4'); break;
        case 'paper': ibox((px + ca * (2.4) - sa * (0)), el + 6.2 * z, (py + sa * (2.4) + ca * (0)), a + PI / 2, 4.2, 0.2, 2.8, '#e8e2d2'); break;
        case 'pot': iball((px + ca * (0.4) - sa * (2.6)), el + 4.6 * z, (py + sa * (0.4) + ca * (2.6)), 1.5, p.itemCol || '#d8302a'); break;
        case 'pothead': break; // the look's 'pot' prop sits on the head in 3D
        case 'ticket': ibox((px + ca * (0.6) - sa * (1.2)), el + 11.5 * z, (py + sa * (0.6) + ca * (1.2)), a, 1.6, 1, 0.1, '#f4e8a0'); break;
        case 'bangles': for (let i = 0; i < 4; i++) I('cyl', (px + ca * (1.6) - sa * (2.4)), el + 5.4 + i * 0.25, (py + sa * (1.6) + ca * (2.4)), 0, 0.55, 0.18, 0.55, BANGLE_COLS[(i + p.seed) % BANGLE_COLS.length]); break;
        case 'sparkler': ptAdd(GL, (px + ca * (2.6) - sa * (1.6)), el + 6.6, (py + sa * (2.6) + ca * (1.6)), 3, 1, '#fff2b0'); break;
        default: break;
      }
      if (p.cart) {
        const x = p.x + ca * 7.5, y = p.y + sa * 7.5, g = TZ(x, y); // the cart on the ground it rolls over
        if (p.cart.kind === 'gen') { ibox(x, g + 0.8, y, a, 7, 4.8, 4, '#4a5a6a'); }
        else {
          ibox(x, g + 3.4, y, a, 10, 5.6, 0.8, '#7a5a3a');
          for (let si = 0; si < 2; si++) { const sd = SIDES[si]; I('cyl', x - sa * sd * 3, g + 1.3, y + ca * sd * 3, a + PI / 2, 1.3, 0.5, 1.3, '#3a3030', PI / 2, 0); }
          if (p.cart.kind === 'sacks') for (let i = 0; i < 3; i++) I('ball', x + ca * (i - 1) * 2.8, g + 5.4, y + sa * (i - 1) * 2.8, a, 1.6, 1.2, 2.3, i % 2 ? '#d8c8a0' : p.cart.col);
          else if (p.cart.kind === 'bananas') for (let i = 0; i < 5; i++) I('ball', x + ca * (i - 2) * 1.8, g + 4.8, y + sa * (i - 2) * 1.8, a + 0.4, 0.9, 0.8, 2, '#e8d040');
          else if (p.cart.kind === 'cloth') for (let i = 0; i < 3; i++) ibox(x + ca * (i - 1) * 2.8, g + 4.2, y + sa * (i - 1) * 2.8, a, 2.6, 4.6, 2 + (i % 2) * 0.6, CLOTH[i]);
          else for (let i = 0; i < 4; i++) iball(x + ca * (i - 1.5) * 2.4, g + 5.2, y + sa * (i - 1.5) * 2.4, 1.3, '#b8643a');
        }
      }
      if (p.chair) {
        const c = p.chair, cca = Math.cos(c.a), csa = Math.sin(c.a);
        ibox(c.x - cca * 2.4, tzOf(c) + 2.6, c.y - csa * 2.4, c.a, 0.5, 4.4, 4.4, c.col);
      }
    }
    for (const p of sc.persons) if (p.alive && p.chair && !p.item) { const c = p.chair, cca = Math.cos(c.a), csa = Math.sin(c.a); ibox(c.x - cca * 2.4, tzOf(c) + 2.6, c.y - csa * 2.4, c.a, 0.5, 4.4, 4.4, c.col); }
    switch (sc.kind) {
      case 'colony_am': {
        const T = st.tanker;
        if (T) for (const q of T.pots) icyl(q.x, tzOf(q), q.y, 1.3, 2.4, q.col);
        for (const Th of st.throws) { const f = Th.t / Th.dur, x = lerp(Th.x0, Th.x1, f), y = lerp(Th.y0, Th.y1, f); ibox(x, TZ(x, y) + 6 + Math.sin(f * PI) * 6 - f * 5, y, t * 9, 2.6, 1.6, 0.6, '#ece6d6'); }
        for (const v of sc.vehs) {
          if (!v.alive || !v.cle) continue;
          const c = v.cle, a = v.angle, ca = Math.cos(a), sa = Math.sin(a), tv = TZ(v.x, v.y); // the ground view3d_actors puts the vehicle on
          if (c.cans) for (let si = 0; si < 2; si++) { const s2 = SIDES[si]; icyl(v.x - ca * 5.2 - sa * s2 * 2.3, tv + 3, v.y - sa * 5.2 + ca * s2 * 2.3, 1.3, 4.4, '#b8bcc4'); }
          if (c.papers) ibox(v.x - ca * 4.6, tv + 4.4, v.y - sa * 4.6, a, 3.6, 2.6, 1.6, '#d8d0b8');
          if (c.kids) for (let i = 0; i < Math.min(7, c.kids); i++) { const u = -3.5 + (i % 4) * 2, s2 = i < 4 ? 1 : -1; iball(v.x + ca * u - sa * s2 * 5.2, tv + 9.2, v.y + sa * u + ca * s2 * 5.2, 1.15, '#1a1412'); ibox(v.x + ca * u - sa * s2 * 6.6, tv + 5.2, v.y + sa * u + ca * s2 * 6.6, a, 1.6, 0.9, 2.2, KIDBAG[i % 4]); }
        }
        break;
      }
      case 'colony_pm': {
        const C = st.cricket;
        if (C) {
          const down = C.down > 0, tw = C.tz != null ? C.tz : (C.tz = TZ(C.wx, C.wy)); // the wicket's ground (it stays put)
          for (let i = -1; i <= 1; i++) { const x = C.wx - C.uy * i * 0.7, y = C.wy + C.ux * i * 0.7; if (down) I('cyl', x + C.ux * 1.2, tw + 0.3, y + C.uy * 1.2, Math.atan2(C.uy, C.ux) + i * 0.3, 0.22, 4.6, 0.22, '#d8c8a0', 0, PI / 2); else icyl(x, tw, y, 0.22, 5.8, '#d8c8a0'); }
          const B = C.ball; if (B.live || B.held) iball(B.x, TZ(B.x, B.y) + B.h + 0.5, B.y, 0.7, '#d8e040');
        }
        if (st.power) for (const c of st.candles) { const h = tzOf(c) + c.h; icyl(c.x, h, c.y, 0.25, 1.3, '#f4f2ea'); ptAdd(GL, c.x, h + 1.9, c.y, 2.4 + Math.sin(t * 9 + c.ph) * 0.2, 0.95, '#ffc060'); ptAdd(GL, c.x, h + 1.9, c.y, 12, 0.18 * (0.4 + night), '#ff9a40'); }
        break;
      }
      case 'baraat': {
        const o = sc.o3;
        if (o && o.bulbs) { const k = (t * 4) | 0; for (let i = 0; i < o.bulbs.length; i++) { const q = o.bulbs[i], on = (i + k) % 3 !== 0; I('ebal', q[0], q[1], q[2], 0, 0.42, 0.42, 0.42, on ? '#fff2a0' : '#b89030'); if (on && night > 0.2 && i % 2 === 0) ptAdd(GL, q[0], q[1], q[2], 4, 0.5 * night, '#ffe08a'); } }
        break;
      }
      default: break;
    }
    if (sc.kind === 'junction' && sc.level > 0.1) { // a low brown haze over the box
      const s = sc.site, J = st.J;
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + t * 0.02, r = (J.jr + 20) * (0.3 + (i % 3) * 0.3), x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r; ptAdd(PN, x, TZ(x, y) + 5 + (i % 2) * 4, y, 70, 0.07 * sc.level, '#b09670'); }
    }
  }
  function particles3d() {
    const PN = G3.pts, GL = G3.glo;
    for (let i = 0; i < P.n; i++) {
      const kd = P.k[i], f = P.t[i] / P.life[i], h = P.h[i] * 1.2 + TZ(P.x[i], P.y[i]); // [terrain] over the ground under it
      if (kd === PK.SPARK) { ptAdd(GL, P.x[i], h, P.y[i], 1.1, 1 - f, PCOL[P.c[i]]); continue; }
      const s = kd === PK.DUST || kd === PK.EXH ? P.s[i] * (1 + f * 1.6) * 2.2 : P.s[i] * 1.6;
      const a = kd === PK.DUST ? 0.3 * (1 - f) * Math.min(1, f * 6) : kd === PK.EXH ? 0.4 * (1 - f) * Math.min(1, f * 6) : kd === PK.WATER ? 0.7 : 1 - f * f;
      ptAdd(PN, P.x[i], h, P.y[i], s, a, PCOL[P.c[i]]);
    }
  }
  // ---- rangoli decals in 3D: textured planes on the ground, growing while being drawn
  function decals3d(H) {
    const THREE = H.THREE;
    for (const g of GEOS) {
      let D = G3.decals.get(g);
      const want = g.near && g.mugg.some((M) => M.prog > 0.01);
      if (!want) { if (D) { G3.grp.remove(D.grp); D.grp.traverse((m) => { if (m.userData.own) { m.geometry.dispose(); m.material.dispose(); } }); G3.decals.delete(g); } continue; }
      if (!D || D.day !== g.day) {
        if (D) { G3.grp.remove(D.grp); D.grp.traverse((m) => { if (m.userData.own) { m.geometry.dispose(); m.material.dispose(); } }); }
        D = { grp: new THREE.Group(), day: g.day, planes: [] };
        for (const M of g.mugg) {
          const img = M.img || paintMugg(M);
          const tex = new THREE.CanvasTexture(img); tex.encoding = THREE.sRGBEncoding;
          const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
          const m = new THREE.Mesh(new THREE.PlaneGeometry(M.r * 2, M.r * 2), mat);
          m.rotation.set(-PI / 2, 0, -M.a, 'YXZ'); m.position.set(M.x, tzOf(M) + 0.12, M.y); m.userData.own = true; m.renderOrder = 2; m.userData.noShadow = true;
          const TR = N.terrain; if (TR && TR.ready && TR.slopeAt) { const sl = TR.slopeAt(M.x, M.y); m.quaternion.premultiply(G3.Q.setFromUnitVectors(G3.UP, G3.V.set(-sl.gx, 1, -sl.gy).normalize())); } // [terrain] lying along the slope
          tex.userData = {}; m.userData.tex = tex;
          D.grp.add(m); D.planes.push({ M, m });
        }
        G3.grp.add(D.grp); G3.decals.set(g, D);
      }
      for (const q of D.planes) { const pr = q.M.prog; q.m.visible = pr > 0.01; q.m.scale.setScalar(0.15 + 0.85 * clamp(pr, 0, 1)); }
      for (const q of g.papers) ibox(q.x, tzOf(q) + 0.1, q.y, q.a, 3.2, 2, 0.3, '#ece6d6');
    }
  }
  function disposeObj(o) {
    if (!o) return;
    o.grp.traverse((m) => { if (m.userData && m.userData.own) { if (m.geometry) m.geometry.dispose(); if (m.material) { if (m.material.map && !G3.H.tex) m.material.map.dispose(); m.material.dispose(); } } });
  }
  function layerUpdate(dt, H) {
    const t0 = now();
    if (!G3.ready || !is3D()) return;
    for (const k in G3.im) G3.im[k].n = 0;
    G3.pts.n = 0; G3.glo.n = 0;
    for (const [sc, o] of G3.scenes) if (!sc.on || ACTIVE.indexOf(sc) < 0) { G3.grp.remove(o.grp); disposeObj(o); G3.scenes.delete(sc); sc.o3 = null; }
    for (const sc of ACTIVE) {
      let o = G3.scenes.get(sc);
      if (!o) { try { o = build3d(sc, H); } catch (e) { N.err('citylife.build3d', e); o = { grp: new H.THREE.Group() }; } G3.grp.add(o.grp); G3.scenes.set(sc, o); sc.o3 = o; }
      if (o.signs) { o.signs.sT.visible = !sc.st.housefull; o.signs.sH.visible = !!sc.st.housefull; }
      try { emit3d(sc, H); } catch (e) { N.err('citylife.emit3d', e); }
    }
    try { decals3d(H); } catch (e) { N.err('citylife.decals3d', e); }
    particles3d();
    for (const k in G3.im) { const B = G3.im[k]; B.mesh.count = B.n; if (B.n) { B.mesh.instanceMatrix.needsUpdate = true; if (B.mesh.instanceColor) B.mesh.instanceColor.needsUpdate = true; } }
    ptCommit(G3.pts, H); ptCommit(G3.glo, H);
    G3.ms = now() - t0;
  }
  // ---- the groom's horse (actor renderer): procedural, decorated, legs swinging
  const HORSE3 = {
    create(e, H) {
      const THREE = H.THREE, root = new THREE.Group(), b = H.builder();
      b.color('#f2efe8').sphere(0, 7.4, 0, 6.4, 2.6, 2.4, 10, 7);
      b.color('#f2efe8').cyl(5.4, 7.6, 0, 1.1, 1.5, 4.6, 8).sphere(7.6, 11.6, 0, 2.4, 1.1, 0.95, 8, 6);
      b.color('#c8202a').sphere(-0.6, 9.0, 0, 4.6, 1.2, 2.7, 10, 5).color('#f2c230').sphere(-0.6, 8.6, 0, 4.7, 0.25, 2.75, 10, 3);
      b.color('#f2c230').cyl(7.4, 12.4, 0, 0.25, 0.1, 2.6, 5);
      b.color('#e8e0d0').sphere(-6.6, 7.0, 0, 1.6, 0.5, 0.5, 6, 4);
      // the groom: cream sherwani, a red safa with a sehra of flowers over the face
      b.color('#f2e6c8').cyl(-0.6, 9.4, 0, 1.2, 1.1, 4.4, 8).color('#f2e6c8').box(-1.6, 7.6, -2.6, 0.4, 9.4, -1.6).box(-1.6, 7.6, 1.6, 0.4, 9.4, 2.6);
      b.color('#c8885a').sphere(-0.5, 14.6, 0, 0.95, 1.05, 0.9, 8, 6);
      b.color('#c8202a').sphere(-0.6, 15.6, 0, 1.15, 0.7, 1.1, 8, 5).color('#f2c230').cyl(-0.4, 16.0, 0, 0.12, 0.05, 1.3, 4);
      for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; b.color(i % 2 ? '#f8f4e8' : '#f2c230').cyl(-0.5 + Math.cos(an) * 1.05, 13.2, Math.sin(an) * 1.0, 0.1, 0.1, 2.2, 3); }
      const body = b.mesh(); if (body) root.add(body);
      const legs = [];
      for (const [x, z] of [[3.8, 1.3], [3.8, -1.3], [-3.6, 1.3], [-3.6, -1.3]]) {
        const pv = new THREE.Group(); pv.position.set(x, 6.4, z);
        const lb = H.builder(); lb.color('#e8e4dc').cyl(0, -6.4, 0, 0.45, 0.6, 6.4, 6).color('#3a3430').cyl(0, -6.4, 0, 0.5, 0.5, 0.6, 6);
        const lm = lb.mesh(); if (lm) pv.add(lm);
        root.add(pv); legs.push(pv);
      }
      root.userData.legs = legs;
      if (!H.quality || !H.quality.shadows) { const sh = H.blobShadow ? H.blobShadow(16, 6) : null; if (sh) root.add(sh); }
      return root;
    },
    update(obj, e, dt, H) {
      obj.position.set(e.x, H.elev ? H.elev(e) : 0, e.y);
      obj.rotation.y = -(e.angle || 0);
      const L = obj.userData.legs, sp = Math.hypot(e.vx || 0, e.vy || 0), ph = e.ph * 2.2;
      if (L) for (let i = 0; i < 4; i++) L[i].rotation.z = sp > 1 ? Math.sin(ph + (i === 0 || i === 3 ? 0 : PI)) * 0.4 : 0;
    },
    dispose() {},
  };
  const BLOCK3 = { create(e, H) { return new H.THREE.Group(); }, update() {}, dispose() {} };
  let reg3d = false;
  function register3d() {
    const V = N.view3d;
    if (reg3d || !V || !V.registerLayer || !V.registerActorRenderer) return;
    reg3d = true;
    V.registerActorRenderer('cle:horse', HORSE3);
    V.registerActorRenderer('cle:block', BLOCK3);
    V.registerLayer('citylife_events', {
      order: 62,
      init(THREE, H) {
        G3.THREE = THREE; G3.H = H;
        G3.M4 = new THREE.Matrix4(); G3.Q = new THREE.Quaternion(); G3.V = new THREE.Vector3(); G3.S = new THREE.Vector3(); G3.E = new THREE.Euler(); G3.UP = new THREE.Vector3(0, 1, 0);
        G3.grp = new THREE.Group(); G3.grp.name = 'citylife_events';
        for (const k in IMSPEC) { G3.im[k] = imMake(THREE, k, IMSPEC[k]); G3.grp.add(G3.im[k].mesh); }
        G3.pts = makePoints(THREE, PMAX + 64, false, 0); G3.glo = makePoints(THREE, 220, true, 0.4);
        G3.grp.add(G3.pts.p); G3.grp.add(G3.glo.p);
        H.layer.add(G3.grp);
        G3.ready = true;
      },
      update(dt, H) { try { layerUpdate(dt, H); } catch (e) { N.err('citylife.layer', e); } },
      dispose(H) {
        for (const o of G3.scenes.values()) disposeObj(o);
        G3.scenes.clear();
        for (const D of G3.decals.values()) D.grp.traverse((m) => { if (m.userData.own) { m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); } });
        G3.decals.clear();
        for (const k in G3.im) { const B = G3.im[k]; B.mesh.geometry.dispose(); B.mesh.material.dispose(); }
        G3.im = {};
        for (const B of [G3.pts, G3.glo]) if (B) { B.p.geometry.dispose(); B.p.material.dispose(); }
        if (G3.grp && H && H.layer) H.layer.remove(G3.grp);
        G3.ready = false;
      },
    });
  }
  N.on('boot', register3d);

  /* ================================================================ the director */
  const KINDS = { junction: KJ, colony_am: KAM, colony_pm: KPM, oldcity: KOLD, cinema: KCIN, baraat: KBAR };
  let ready = false, dirT = 0;
  // The sites are static per world (junction arms, colonies, Old City lanes, cinemas, baraat routes) but building them
  // all took one 100-250 ms update on a desktop (~1 s on a 4x-throttled phone) on the first play frame after START
  // (design/audit/performance.md). They are now built a step at a time in idle callbacks while the title screen is
  // up; whatever is left still completes synchronously on first use (ensure / the sites getter), as before.
  let buildStep = 0;
  const BUILD_STEPS = [buildJunctions, buildColonies, buildOld, buildCinemas, buildBaraats];
  function buildSites(oneStep) {
    if (buildStep === 0) {
      SITES.length = 0; BYID.clear(); GEOS.length = 0; WZ = null; BUSY = null;
      if (!N.world || !N.world.built || !RD()) return false;
    }
    while (buildStep < BUILD_STEPS.length) {
      const f = BUILD_STEPS[buildStep++];
      try { f(); } catch (e) { N.err('citylife.build.' + f.name, e); }
      if (oneStep && buildStep < BUILD_STEPS.length) return false;
    }
    buildStep = 0;
    ready = true;
    return true;
  }
  function idleBuild() {
    const ric = window.requestIdleCallback;
    if (!ric) return;
    const tick = (dl) => {
      if (ready || !N.world || !N.world.built) return;
      if (dl.didTimeout || dl.timeRemaining() > 6) { try { buildSites(true); } catch (e) { N.err('citylife.idleBuild', e); return; } }
      if (!ready) ric(tick, { timeout: 1500 });
    };
    ric(tick, { timeout: 1500 });
  }
  function actR() {
    if (is3D()) { const q = N.view3d.quality || {}; return Math.min(TUNE.act3D, (q.actorDist || 620) * 0.9); }
    const v = N.render && N.render.view;
    if (v && isFinite(v.x1)) return Math.max(TUNE.act2D, Math.hypot(v.x1 - v.x0, v.y1 - v.y0) * 0.5 + 140);
    return TUNE.act2D;
  }
  function siteDist(s) {
    const p = N.player;
    if (s.kind === 'baraat') {
      if (s.sc) return Math.hypot(s.x - p.x, s.y - p.y);
      const R0 = s.route, P0 = R0.pts;
      if (Math.abs(P0[0] - p.x) > 1200 || Math.abs(P0[1] - p.y) > 1200) return 1e9;
      let bd = 1e9; for (let i = 0; i < P0.length; i += 2) { const d = Math.hypot(P0[i] - p.x, P0[i + 1] - p.y); if (d < bd) bd = d; }
      return bd;
    }
    return Math.hypot(s.x - p.x, s.y - p.y);
  }
  function siteLevel(s) {
    if (s.force) return s.force.level != null ? s.force.level : 1;
    if (s.cool > 0) return 0;
    let l = 0;
    try { l = KINDS[s.kind].level(s, CX); } catch (e) { N.err('citylife.level.' + s.kind, e); l = 0; }
    if (CX.m3 && s.x > 10200 && s.x < 11500 && s.y > 3800 && s.y < 5100) l = 0; // M3 owns RTC X Roads
    return clamp(l || 0, 0, 1);
  }
  function activate(s, warm) {
    const sc = newScene(s);
    s.sc = sc;
    sc.level = siteLevel(s);
    ACTIVE.push(sc);
    try { sc.K.start(sc, warm); } catch (e) { N.err('citylife.start.' + s.kind, e); }
    ST.activations++;
    N.emit('citylife:scene', { id: s.id, kind: s.kind, on: true });
    return sc;
  }
  function release(sc, hard) {
    if (!sc.on) return;
    sc.on = false;
    try { if (sc.K.stop) sc.K.stop(sc); } catch (e) { N.err('citylife.stop.' + sc.kind, e); }
    for (const id of sc.closures.slice()) { try { N.traffic.closeRoads(id, null); } catch (e) { /* optional */ } }
    sc.closures.length = 0;
    const J = sc.st && sc.st.J;
    for (const v of sc.vehs.slice()) {
      if (hard || !v.alive || !seen(v.x, v.y, 30)) { freeVeh(v); continue; }
      if (v.cle) {
        if (v.cle.lane && J) jamDepart(sc, J, v);
        else if (v.cle.lane) { const q = v.cle.lane.q, i = q.indexOf(v); if (i >= 0) q.splice(i, 1); v.cle.lane = null; }
        if (v.cle.mode === 'hold' || v.cle.mode === 'rev' || v.cle.mode === 'park') v.cle.mode = 'gone';
      }
      ORPH.push(v);
    }
    sc.vehs.length = 0;
    for (const b of sc.beasts.slice()) { if (hard || !seen(b.x, b.y, 20)) freeBeast(b); else { b.sc = null; ORPH.push(b); } }
    sc.beasts.length = 0;
    for (const b of sc.blocks) N.entities.remove(b);
    sc.blocks.length = 0;
    // people out of sight vanish now; the rest walk off on their own (personUpdate sees sc.on === false)
    for (const p of sc.persons.slice()) if (hard || !seen(p.x, p.y, 16)) freePerson(p);
    const i = ACTIVE.indexOf(sc); if (i >= 0) ACTIVE.splice(i, 1);
    sc.site.sc = null;
    N.emit('citylife:scene', { id: sc.id, kind: sc.kind, on: false });
  }
  function sweepOrphans() {
    for (let i = ORPH.length - 1; i >= 0; i--) {
      const e = ORPH[i];
      if (!e.alive) { ORPH.splice(i, 1); continue; }
      if (!seen(e.x, e.y, 30) || (e.cle && e.cle.t > 120)) {
        ORPH.splice(i, 1);
        if (e.kind === 'vehicle') { const j = VEHS.indexOf(e); if (j >= 0) VEHS.splice(j, 1); e.cle = null; if (N.player.vehicle !== e) { if (e.controller === vehCtl) e.controller = null; try { N.vehicles.remove(e); } catch (x) { N.entities.remove(e); } } }
        else freeBeast(e);
      }
    }
  }
  function sceneEmpty(sc) { return sc.persons.length === 0 && sc.vehs.length === 0 && sc.beasts.length === 0; }
  function direct() {
    refreshCtx();
    const r = actR(), rel = r + TUNE.releasePad, cap = TUNE.maxActive[tier()];
    const cand = [];
    for (const s of SITES) {
      if (s.cool > 0) s.cool -= TUNE.dirEvery;
      s.d = siteDist(s);
      s.lvl = s.d < rel + 200 || s.force ? siteLevel(s) : 0;
      if (s.force && s.force.keep !== false) { cand.push(s); continue; }
      if (s.d < r && s.lvl > 0.05) cand.push(s);
    }
    cand.sort((a, b) => (b.force ? 1 : 0) - (a.force ? 1 : 0) || a.d - b.d);
    // release what is far, over the cap, or done
    for (let i = ACTIVE.length - 1; i >= 0; i--) {
      const sc = ACTIVE[i], s = sc.site;
      const rank = cand.indexOf(s);
      const done = sc.kind === 'baraat' && sc.st.done;
      if (s.force && s.force.keep !== false && !done) continue;
      if (s.lvl <= 0.02 && sc.level <= 0.03) sc.zeroT = (sc.zeroT || 0) + TUNE.dirEvery; else sc.zeroT = 0;
      if (s.d > rel || (rank < 0 && s.lvl <= 0.02 && (sceneEmpty(sc) || s.d > r || sc.zeroT > 12)) || rank >= cap + 1 || (done && (sceneEmpty(sc) || sc.t > 400))) release(sc);
    }
    for (let i = 0; i < cand.length && ACTIVE.length < cap + (cand[i].force ? 2 : 0); i++) {
      const s = cand[i];
      if (s.sc) continue;
      activate(s, true);
    }
    // the rangoli lanes near the player keep their decals even when their scene is off
    const p = N.player, rr2 = r + 100;
    for (const g of GEOS) { g.near = Math.abs(g.x - p.x) < rr2 && Math.abs(g.y - p.y) < rr2; if (g.near) { muggFor(g); for (const M of g.mugg) M.prog = muggProg(M); } }
  }
  function update(dt) {
    const t0 = now();
    if (!API.enabled) { if (ACTIVE.length) for (const sc of ACTIVE.slice()) release(sc); return; }
    if (!ready) { if (N.world && N.world.built) buildSites(); if (!ready) return; }
    if (!audioReg) registerAudio(); // (also when the sites were built in idle time before play)
    dirT -= dt;
    if (dirT <= 0) { dirT = TUNE.dirEvery; try { direct(); } catch (e) { N.err('citylife.direct', e); } sweepOrphans(); }
    for (let i = 0; i < ACTIVE.length; i++) {
      const sc = ACTIVE[i];
      sc.t += dt;
      const target = sc.site.lvl;
      const rate = sc.site.force ? 10 : 0.06;
      sc.level += clamp(target - sc.level, -rate * dt, rate * dt);
      try { sc.K.update(sc, dt); } catch (e) { N.err('citylife.update.' + sc.kind, e); }
    }
    updateParticles(dt);
  }
  function draw() {
    if (!ready || !API.enabled) return;
    const t0 = now();
    R = N.render;
    if (is3D()) { pushLights(); ST.ms2d = 0; return; }
    try {
      for (const g of GEOS) if (g.near && (g.mugg.length || g.papers.length)) R.queue('ground', 0, g._fn || (g._fn = (ctx) => { frame2d(ctx); drawMuggulu(ctx, g); }));
      for (const sc of ACTIVE) {
        if (!sc._fg) { sc._fg = (ctx) => drawGround(ctx, sc); sc._fj = (ctx) => drawJunction(ctx, sc); sc._ft = (ctx) => drawTall(ctx, sc); }
        R.queue('actors', sc.site.y - 30, sc._fg);
        if (sc.kind === 'junction') R.queue('actors', sc.site.y - 0.5, sc._fj);
        const ty = sc.kind === 'cinema' ? sc.st.cut.y + 1 : sc.kind === 'baraat' ? sc.site.gate.y : sc.site.y + 0.5;
        R.queue(sc.kind === 'junction' ? 'sky' : 'structures', R.distKey ? R.distKey(sc.site.x, ty) : ty, sc._ft);
      }
      R.queue('fx', 0, FXFN);
      pushLights();
    } catch (e) { N.err('citylife.draw', e); }
    ST.ms2d = now() - t0;
  }
  const FR = { frame: -1, upd: 0 };
  function ensure() { if (!ready && N.world && N.world.built) buildSites(); }
  const FXFN = (ctx) => { try { drawFx(ctx); } catch (e) { N.err('citylife.fx', e); } };
  function resetAll() {
    for (const sc of ACTIVE.slice()) release(sc);
    for (const p of PERSONS.slice()) freePerson(p);
    for (const b of BEASTS.slice()) freeBeast(b);
    for (const v of VEHS.slice()) freeVeh(v);
    ORPH.length = 0; P.n = 0;
    for (const s of SITES) { s.force = null; s.cool = 0; }
    dirT = 0;
  }
  N.on('world:built', () => { resetAll(); ready = false; buildStep = 0; });
  N.on('boot', idleBuild);
  N.on('game:new', () => { resetAll(); dirT = 0; });
  N.on('player:teleport', () => {
    dirT = 0;
    const pl0 = N.player;
    for (const p of PERSONS.slice()) if ((!p.sc || !p.sc.on) && Math.hypot(p.x - pl0.x, p.y - pl0.y) > 260) freePerson(p);
  });
  N.on('save:loaded', () => { dirT = 0; });

  N.addSystem({
    id: 'citylife_events', order: 47, runIn: ['play', 'dialogue', 'cutscene'],
    init() { register3d(); registerAudio(); },
    update(dt) {
      const t0 = now();
      update(dt);
      const f = (N.time && N.time.frame) || 0;
      FR.upd += now() - t0;
      if (f !== FR.frame) { // a new frame: book the last one (sub-steps add up), then start over
        const ms = FR.upd + ACC.ent + ACC.veh + ACC.drw + ST.ms2d + (G3.ms || 0);
        ST.ms = ms; ST.ms3d = G3.ms || 0; ST.msEnt = ACC.ent + ACC.veh; ST.msDrawP = ACC.drw; ST.msUpd = FR.upd; ST.frames++;
        ST.msAvg = ST.msAvg ? ST.msAvg * 0.95 + ms * 0.05 : ms;
        ACC.ent = 0; ACC.veh = 0; ACC.drw = 0; FR.upd = 0; FR.frame = f;
      }
    },
    draw() { draw(); },
    reset() { resetAll(); },
  });

  /* ================================================================ API */
  const API = (N.citylifeEvents = {
    version: 1, enabled: true, TUNE, KINDS, LINES,
    get sites() { if (!ready && N.world && N.world.built) buildSites(); return SITES; },
    site: (id) => { ensure(); return BYID.get(id) || null; },
    scene: (id) => { const s = BYID.get(id); return s ? s.sc : null; },
    nearest(kind, x, y) {
      ensure();
      const p = N.player; x = x == null ? p.x : x; y = y == null ? p.y : y;
      let best = null, bd = 1e18;
      for (const s of SITES) { if (kind && s.kind !== kind) continue; const sx = s.kind === 'baraat' ? s.route.pts[0] : s.x, sy = s.kind === 'baraat' ? s.route.pts[1] : s.y; const d = (sx - x) * (sx - x) + (sy - y) * (sy - y); if (d < bd) { bd = d; best = s; } }
      return best;
    },
    active() {
      return ACTIVE.map((sc) => ({
        id: sc.id, kind: sc.kind, level: +sc.level.toFixed(2), phase: sc.phase, persons: sc.persons.length, vehicles: sc.vehs.length, animals: sc.beasts.length,
        d: Math.round(sc.site.d), beat: sc.lastBeat || null, forced: !!sc.site.force,
        jam: sc.st.J ? jamCount(sc.st.J) : null,
      }));
    },
    /** tests: pin a site (an id, or a kind = the nearest site of that kind) on, at a level; null clears every pin */
    force(id, o) {
      if (id == null) { for (const s of SITES) s.force = null; dirT = 0; return true; }
      if (!ready && N.world && N.world.built) buildSites();
      let s = BYID.get(id);
      if (!s && KINDS[id]) s = API.nearest(id);
      if (!s) return false;
      if (o === null) { s.force = null; dirT = 0; return true; }
      s.force = Object.assign({ level: 1, keep: true }, o || {});
      s.cool = 0;
      if (s.sc && o && o.restart) release(s.sc, true);
      if (o && o.solo) for (const sc of ACTIVE.slice()) if (sc.site !== s && !sc.site.force) release(sc, true);
      if (o && (o.restart || o.solo)) { for (const e of ORPH.slice()) { if (e.kind === 'vehicle') { const j = VEHS.indexOf(e); if (j >= 0) VEHS.splice(j, 1); e.cle = null; if (e.controller === vehCtl) e.controller = null; if (N.player.vehicle !== e) { try { N.vehicles.remove(e); } catch (x) { N.entities.remove(e); } } } else freeBeast(e); } ORPH.length = 0; for (const p of PERSONS.slice()) if (!p.sc || !p.sc.on) freePerson(p); }
      dirT = 0;
      return s.id;
    },
    stats() {
      if (!ready && N.world && N.world.built) buildSites();
      return {
        sites: SITES.length, kinds: SITES.reduce((o, s) => { o[s.kind] = (o[s.kind] || 0) + 1; return o; }, {}), active: ACTIVE.length,
        persons: PERSONS.length, vehicles: VEHS.length, animals: BEASTS.length, particles: P.n, orphans: ORPH.length,
        pool: { persons: PPOOL.length, beasts: BPOOL.length },
        ms: +ST.ms.toFixed(3), msAvg: +ST.msAvg.toFixed(3), ms2d: +(ST.ms2d + (ST.msDrawP || 0)).toFixed(3), ms3d: +(G3.ms || 0).toFixed(3), msUpd: +ST.msUpd.toFixed(3), msEnt: +(ST.msEnt || 0).toFixed(3),
        activations: ST.activations, barks: ST.barks, honks: ST.honks, beats: ST.beats, unstuck: ST.unstuck, spawnedP: ST.spawnedP, spawnedV: ST.spawnedV,
        layer3d: G3.ready, im3d: G3.ready ? Object.keys(G3.im).reduce((o, k) => { o[k] = G3.im[k].n; return o; }, {}) : null, r: Math.round(actR()), audio: audioReg,
      };
    },
    setOptions(o) { for (const k of ['sounds', 'barks', 'particles']) if (o && o[k] != null) TUNE[k] = !!o[k]; return { sounds: TUNE.sounds, barks: TUNE.barks, particles: TUNE.particles }; },
    reset: resetAll,
    rebuild() { resetAll(); ready = false; buildStep = 0; return buildSites(); },
    _debug: { ACTIVE, SITES, PERSONS, VEHS, BEASTS, P, G3, CX, GEOS, REJ, colonyGeo: (id, x, y) => { const g = colonyGeo(id, x, y); if (g) GEOS.pop(); return g; } },
  });
  if (N.citylife && typeof N.citylife === 'object' && !N.citylife.events) { try { N.citylife.events = API; } catch (e) { /* frozen */ } }
  N.on('boot', () => { if (N.citylife && typeof N.citylife === 'object' && !N.citylife.events) { try { N.citylife.events = API; } catch (e) { /* frozen */ } } });
})();
