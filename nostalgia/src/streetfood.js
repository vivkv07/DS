/* NOSTALGIA — streetfood.js  (owner: street-food scenes developer) — design/atmosphere.md "Street-food
 * scenes" (binding), ARCHITECTURE §6-§8, §19-§21.
 *
 * Every food cart and food spot on the map becomes a living scene in BOTH views:
 *   dosa bandis (dosa_bandi_*), samosa / mirchi-bajji bandis (samosa_bandi_*), chai bandis (chai_bandi_*,
 *   the Hussain Sagar ones also roast bhutta in the evening), pani-puri carts and bhutta carts (extra spots
 *   placed by this file: markets / Necklace Road + Tank Bund), coconut, banana and flower carts, ice-gola
 *   carts (summer: school gates, the lake front), Gokul Chat, the Irani cafe fronts, the Paradise / Bawarchi
 *   biryani queue and, in Ramzan, the haleem bhattis (Old City hotels + the street bhattis of seasons.js).
 *
 * A data-driven SCENE DIRECTOR (shared with the coming city-life scenes, design/atmosphere.md): spots are
 * built from N.WORLD_DATA at 'world:built'; a scene activates within ~1.2 screens of the player (nearest
 * first, capped: desktop 6 / phones 4) and is released beyond that (hysteresis). Crowd size follows the
 * clock (each kind's peaks: morning tiffin and late-night dosa, evening samosa, chai at all hours with two
 * peaks...), the day of the week, the season (Ramzan, summer), the weather and a per-spot-per-day mood.
 * Crowd members are REAL pedestrians (kind 'ped' entities, pooled) with district looks (office uncles,
 * students, aunties, auto drivers in khaki, kids, youths, elders): passers-by from traffic.js join (the
 * traffic ped is swapped for a crowd member with the same look) or walk in from out of view; they queue or
 * stand in a loose half-ring, step up to order (barks: "Ek plain dosa, anna!"), eat standing from steel or
 * leaf plates / sip chai glasses / munch bhutta, chat with their neighbours and leave (handed back to
 * traffic as walkers). The vendor loops a work animation (2D: arm + ladle and the dosa spread in a spiral,
 * oiled, browned, folded and served; samosas tipped into bubbling oil; the long chai pour; the hand fan over
 * the bhutta sigri throwing sparks; puris handed out one by one; the machete chop; ice shaved for the gola;
 * the haleem paddle; 3D: a procedural animated vendor via registerActorRenderer + tawa / kadai / kettle /
 * sigri props via registerLayer). Steam and smoke are one shared particle simulation (soft puffs that rise
 * and drift with N.wind or a default breeze, thicker bursts when batter hits the tawa) drawn as soft sprites
 * in 2D and camera-facing points in 3D (lit by the cart lamp at night). Stove / charcoal glow and bulb /
 * petromax / tube lamps at night (N.render.lights in 2D; the same list feeds the 3D point lights, plus
 * emissive glows). Busy carts get parked scooters and cycles (real vehicles, noEnter). Rain: a tarpaulin
 * goes up over the carts, the crowd squeezes under it or the shop awning, the rest open umbrellas, fewer
 * people come, steam shows less. Sounds through N.audio.sfx (sizzle, plates / cup clink, coin, munch, sip,
 * coconut chop, vendor calls, gossip when the audio build has it), every call feature-checked.
 * The player can walk into the crowd (people shuffle aside) and buy through the existing shops.js
 * interaction; the vendor serves him ("Lo, garam garam!").
 *
 * ------------------------------------------------------------------ API  N.streetfood
 *   enabled (false: release every scene, spawn nothing)      density (0..2 crowd multiplier)
 *   TUNE, KINDS (scene kinds: data, see below), spots (all spots), LINES (bark lines)
 *   active() -> [{id, kind, x, y, want, crowd, level, vendor, particles, vehicles}]
 *   scene(spotId) -> the live scene (debug)            spot(spotId) -> spot            nearest(x, y, kind?)
 *   force(spotId | null, {level, keep}) tests: pin a spot's crowd level (0..1) and keep it active
 *   stats() -> {spots, active, patrons, vendors, particles, vehicles, ms, ms2d, ms3d, msAvg, pool}
 *   register(kindId, spec) / addSpot({id, kind, x, y, lm?, frame?, ...})   (city-life scenes reuse these)
 *   rebuild()   reset()   setDensity(d)   setOptions({particles, vehicles, barks, sounds, suppressArt, nightDosa})
 *   debugHud(on?) the optional on-screen readout (Alt+F with #debug; style.css "streetfood" section)
 * Events: 'streetfood:scene' {id, kind, on}, 'streetfood:order' {id, ped, text}, 'streetfood:serve'
 *   {id, to (ped | player)}.
 * Scene kind fields (KINDS[k]): type 'cart'|'shop'|'bhatti'|'extra', max (crowd at peak), peaks [[from, to,
 *   level]] in game minutes (to may pass 1440), base, dow[7] multipliers, roles(min, ctx) -> weights, vendor
 *   {role, look, work}, hold (what eaters hold), eat [s0, s1], parcel (share who leave with a parcel),
 *   steam {rate, burst, smoke, sparks}, sounds {cook, serve, pay}, vehicles (parked at peak), lamp, glow,
 *   shelter 'tarp'|'awning'|'umbrella', ring {r0, rows, gap, spread}, when(ctx) (season gate), shop (place
 *   has a shops.js shop) | buy {place, item, label} (extra carts buy through N.shops.buy).
 *
 * ------------------------------------------------------------------ HOOKS (files this module does not own)
 *  - places_art.js: while a scene is active, the painted (2D-only) vendor / customer sprites of that
 *    landmark are hidden by wrapping its per-landmark people counter `lm._pa.count` (restored when the scene
 *    ends; if places_art changes that state the painted crowd simply stays: cosmetic only). Gokul Chat /
 *    the biryani houses keep their shop art; their painted crowd gives way to the real one.
 *  - shops.js (documented catalogue N.shops.KINDS): KINDS.dosa_bandi.hoursFor adds the late-night dosa shift
 *    21:00-01:00 (atmosphere.md: "busiest at morning tiffin and late night") and its batter-gated rows
 *    accept the fresh night batter (TUNE.nightDosa = false turns both off). Extra carts (pani puri, bhutta,
 *    ice gola) get their own N.interact entries that buy through N.shops.buy(gokul_chat / chai_bandi_6 /
 *    a school gate, item), so prices, hours, money, feeding and 'shop:buy' all stay in shops.js.
 *  - traffic.js (documented API): N.traffic.makeLook / blitPerson for looks and cached sprites, N.traffic.clear
 *    (pred) to take a passing walker into a crowd, N.traffic.spawnPed(role, {x, y, look}) to hand a leaving
 *    one back, N.traffic.crowd(placeId) so Gokul Chat / Irani / food crowd zones are not doubled.
 *  - view3d.js (loads after this file, so registered lazily at 'boot' / the system init):
 *    registerActorRenderer('sf:vendor') (vendors set e.view3d = 'sf:vendor'), 'sf:cart' (the extra carts),
 *    registerLayer('streetfood'); crowd members are plain 'ped' entities (view3d_actors draws them; e.umb umbrellas,
 *    look.prop 'tray' = the plate in the right hand). N.models3d.has('prop_<name>') models replace the
 *    procedural tawa / kadai / kettle / sigri / cart props when the Blender pipeline ships them.
 *  - Listens to 'shop:buy', 'player:teleport', 'game:new', 'world:built', 'season:change'.
 *
 * Performance (N.streetfood.stats(), measured in tests/streetfood.cjs): one system update + one batched 2D
 * pass per scene (cached people sprites, one shadow fill, pooled particles), ~0.3-1.2 ms with three busy
 * scenes on a phone viewport; the 3D layer is 2 point draws + ~3 calls per vendor.
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
  const hash = (s) => ((U.strHash ? U.strHash(String(s)) : 7) >>> 0) / 4294967296;
  const angDiff = (a, b) => { let d = b - a; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; };
  function wpick(obj) {
    let t = 0; for (const k in obj) if (obj[k] > 0) t += obj[k];
    if (t <= 0) return null;
    let r = rnd() * t;
    for (const k in obj) if (obj[k] > 0) { r -= obj[k]; if (r <= 0) return k; }
    return null;
  }

  /* ================================================================ clock / calendar / weather */
  const mins = () => (N.clock && isFinite(N.clock.minutes) ? N.clock.minutes : 720);
  const dayN = () => (N.clock && N.clock.day) || 0;
  const simT = () => (N.time && N.time.now) || 0;
  function dow() {
    try { const d = N.calendar && N.calendar.date; if (d && isFinite(d.dow)) return d.dow; } catch (e) { /* stub */ }
    const b = (N.clock && N.clock.baseDate) || [2003, 0, 14];
    return new Date(Date.UTC(b[0], b[1], b[2] + dayN())).getUTCDay();
  }
  function season(n) {
    try { if (N.seasons && typeof N.seasons.is === 'function') return !!N.seasons.is(n); } catch (e) { /* stub */ }
    return !!(N.flags && N.flags[n]);
  }
  function schoolDay() {
    try { if (N.calendar && N.calendar.isSchoolDay) return !!N.calendar.isSchoolDay(); } catch (e) { /* stub */ }
    const w = dow(); return w !== 0 && !season('summer');
  }
  /** rain 0..1: N.weather (atmosphere layer) when present, else the seasons.js shower flag */
  function rainLevel() {
    const W = N.weather;
    if (W && isFinite(W.rain)) return clamp(W.rain, 0, 1);
    if (season('rain') || (N.flags && (N.flags.raining || N.flags.rain === true))) return 0.7;
    return 0;
  }
  /** wind {x, y} (u/s drift at the puff height): N.wind when present, else a slow default breeze */
  const WIND = { x: 0, y: 0 };
  function windAt(x, y) {
    const W = N.wind, t = simT();
    let dx, dy, s;
    try {
      if (W && typeof W.at === 'function') { const o = W.at(x, y); dx = o.x; dy = o.y; s = 1; }
      else if (W && isFinite(W.dx)) { dx = W.dx; dy = W.dy; s = isFinite(W.strength) ? W.strength : 0.3; }
      else if (W && isFinite(W.dir)) { dx = Math.cos(W.dir); dy = Math.sin(W.dir); s = isFinite(W.speed) ? clamp(W.speed / 10, 0, 1.2) : 0.3; if (typeof W.gust === 'function') s *= 0.7 + 0.6 * clamp(W.gust(x, y, t), 0, 1); }
    } catch (e) { dx = null; }
    if (dx == null || !isFinite(dx)) { const a = -0.6 + Math.sin(t * 0.021) * 0.5; dx = Math.cos(a); dy = Math.sin(a); s = 0.22 + 0.08 * Math.sin(t * 0.13 + x * 0.001); }
    WIND.x = dx * s * TUNE.windDrift; WIND.y = dy * s * TUNE.windDrift;
    return WIND;
  }
  const lowTier = () => {
    try { if (N.atmos && N.atmos.low != null) return !!N.atmos.low; } catch (e) { /* ignore */ }
    if (N.view3d && N.view3d.quality && N.view3d.quality.tier === 'low') return true;
    try { if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true; } catch (e) { /* ignore */ }
    return Math.min(window.innerWidth || 1280, window.innerHeight || 720) < 500;
  };
  const is3D = () => !!(N.view3d && N.view3d.active);

  /* ================================================================ tuning */
  const TUNE = {
    maxScenes: { desk: 6, low: 4 }, maxPatrons: { desk: 44, low: 26 }, maxParticles: { desk: 260, low: 150 },
    maxVehicles: { desk: 10, low: 6 },
    actScreens: 1.2,        // activate within this many screens (half diagonals) of the player
    actMin: 230, actMax: 680, act3D: 520, offPad: 1.25,
    think: 0.15, walk: [34, 44], ramp: 25,
    recruitR: 150, recruitShare: 0.55, handBack: true, handBackAfter: [22, 40],
    personal: 9,            // patrons shuffle aside when the player pushes within this
    barkGap: 2.6, barkR: 230, orderBark: 0.55, chatBark: 0.12,
    sfxGap: 0.3, sfxR: 300,
    windDrift: 13, rainSteam: 0.6, rainCrowd: 0.55,
    nightDosa: true, suppressArt: true, particles: true, vehicles: true, barks: true, sounds: true,
  };

  /* ================================================================ bark lines (Hyderabadi, kid-friendly) */
  const LINES = {
    chat: ['Kal ka match dekha?', 'Bus aaj bhi late hai, yaar.', 'Nalla paani nahi aaya subah.', 'Exam kab hai re?', 'Arre, kitne din baad!',
      'Office ko late ho raha hai.', 'Sunday ko biryani, pakka.', 'Chutney ekdum first class!', '*Ammo,* chala bagundi!', '*Hau,* bilkul!',
      'Kya bolte, miyan?', 'Baarish aayegi lagta.', 'Petrol phir mehenga hua.', 'Kal raat phir power cut.', 'Bhai, cassette wapas kab?'],
    dosa: ['Ek plain dosa, anna!', 'Anna, ek masala dosa!', 'Thoda karam kam, anna.', 'Do idli, ek vada!', 'Chutney aur dena, anna.',
      'Ek parcel, jaldi!', 'Anna, onion dosa!', 'Ghee thoda zyada.', '*Rendu* idli, *oka* vada!', '*Karam podi* dosa, anna!'],
    dosaV: ['Garam garam dosa!', 'Ek minute, saar!', 'Aa jao, aa jao!', 'Chutney leke jao!', '*Tondaraga cheppandi!*', 'Batter fresh hai, saar.'],
    samosa: ['Ek plate samose!', 'Do mirchi bajji, anna.', 'Garam wale dena.', 'Chutney thodi meethi.', 'Dozen parcel karo!', 'Teekha zyada!'],
    samosaV: ['*Garam samose!* Garam!', 'Abhi nikale, ekdum garam!', 'Kadai ke paas mat aao, beta!', 'Paanch rupay dozen!'],
    chai: ['Do chai!', 'Ek cutting, anna.', 'Chai mein shakkar kam.', 'Ek chai, ek bun.', 'Anna, char chai idhar!', 'Biscuit bhi dena.'],
    chaiV: ['*Garam chai!*', 'Glass wapas dena, saar.', 'Do rupay, bas!', 'Aa jao, chai taiyaar!'],
    kidChat: ['Homework kiya kya?', 'Kal cricket khelenge, pakka!', 'Mera wala zyada bada hai!', 'Sir ne dekha toh?', 'Ek aur lete, please?', 'Shaktimaan dekha kal?', 'Mujhe bhi chakhao na!'],
    chaiChat: ['Newspaper mein kya hai aaj?', 'Kal ka match kya tha, bhai!', 'World Cup mein India jeetega, dekhna.', 'Rate phir badh gaya.', 'Is baar baarish late hai.'],
    bhutta: ['Ek bhutta, nimbu laga ke!', 'Teekha kam, anna.', 'Do bhutte, garam garam.', 'Masala thoda zyada!'],
    bhuttaV: ['Bhutta! *Garam garam* bhutta!', 'Lemon-chilli, ekdum fresh!', 'Hawa achhi hai aaj, saar.'],
    panipuri: ['Teekha, bhaiya!', 'Meetha wala dena.', 'Ek aur, *phokat!*', 'Sukha puri last mein.', 'Pani thoda zyada!'],
    panipuriV: ['Agla! Le lo!', 'Teekha ya meetha?', 'Ek ek karke, bachcha!'],
    coconut: ['Malai wala dena, anna.', 'Paani zyada wala.', 'Straw dena, anna.'],
    coconutV: ['*Kobbari bondam!* Meetha paani!', 'Malai wala ya paani wala?'],
    banana: ['Ek darjan, anna.', 'Pakke wale dena.', 'Do kele, bas.'],
    bananaV: ['*Arati pandlu! Chakkarakeli!*', 'Ekdum meethe, amma!'],
    flower: ['Ek *moora* mallepoolu.', 'Gulab ka haar dena.', 'Thoda kanakambaram bhi.'],
    flowerV: ['*Mallepoolu!* Do rupay moora!', 'Fresh hai, amma, abhi aaye!'],
    gola: ['Kala khatta, bhaiya!', 'Rose wala!', 'Zyada syrup!', 'Mera pehle!'],
    golaV: ['Gola! Gola! Thanda thanda!', 'Line mein, bachcho!'],
    peanut: ['Ek packet palli, anna.', 'Garam wale dena.'],
    peanutV: ['*Palli!* Garam palli!'],
    gokul: ['Ek plate pani puri!', 'Bhel puri, teekha!', 'Dahi puri dena.', 'Ragda patties ek.', 'Anna, sev puri!'],
    gokulV: ['Agla plate!', 'Teekha ya meetha?', 'Haan, le lo!'],
    irani: ['Ek Irani chai, ek Osmania!', 'Do chai, ek paani.', 'Bun maska dena.', 'Chai khadak!'],
    iraniV: ['Haan saab, aaya!', 'Do chai, table teen!', 'Abhi laya, saab.'],
    biryani: ['Ek full biryani parcel.', 'Do half, raita extra.', 'Kitna time lagega?', 'Line mein khade raho, miyan.'],
    biryaniV: ['Parcel taiyaar!', 'Agla number!', 'Do minute, saab.'],
    haleem: ['Ek plate haleem, miyan!', 'Ghee zyada dalo.', 'Haleem ki khushboo!', 'Iftar ke baad ka maza!'],
    haleemV: ['Haleem taiyaar hai, miyan!', 'Garam garam haleem!'],
    player: ['Aage aao, beta, tum pehle le lo.', 'Line mein aao, bachcha!', 'Arre, chhota hai, pehle isko do.'],
    serveP: ['Lo beta, garam garam!', 'Lo, *jaldi* khao, thanda ho jayega.', 'Le lo, bachcha!'],
    rain: ['Baarish! Andar aao, andar!', 'Tarpaulin ke neeche aao!', 'Chai ke saath baarish, waah!'],
  };

  /* ================================================================ scene kinds (data) */
  // roles: traffic.js makeLook roles (office uncle aunty student kid youth man lungi woman elder old college
  // police) + 'auto' (auto drivers in khaki) and 'family' (aunty + kid)
  const MORNING = (m) => m < 690;
  const KINDS = {
    dosa: {
      label: 'Dosa bandi', type: 'cart', max: 9, peaks: [[390, 600, 1], [690, 720, 0.25], [1260, 1500, 0.85]], base: 0.05,
      dow: [1.35, 1, 1, 1, 1, 1, 1.15],
      roles: (m) => (MORNING(m) ? { office: 3, uncle: 3, student: 2, auto: 2, aunty: 2, kid: 1, lungi: 1 } : { youth: 4, man: 3, auto: 3, uncle: 1, office: 1 }),
      vendor: { role: 'lungi', look: { shirt: '#f2efe6', towel: '#c03030' }, work: 'dosa' },
      stove: { u: 0.5, vl: -0.2, h: 5.4, u3: 0.55, h3: 5.35 }, hold: 'steel', eat: [26, 55], parcel: 0.15, serve: 9.4,
      steam: { rate: 4.2, burst: 14, smoke: 0.12 }, sounds: { cook: 'sizzle', serve: 'plates', pay: 'coin' },
      orders: 'dosa', vlines: 'dosaV', vehicles: 3, lamp: 'bulb', glow: '#ff8a30', shelter: 'tarp', shop: true,
    },
    samosa: {
      label: 'Samosa bandi', type: 'cart', max: 8, peaks: [[960, 1200, 1], [900, 960, 0.35]], base: 0.0,
      dow: [1.2, 1, 1, 1, 1, 1.05, 1.15],
      roles: () => ({ student: 2, office: 3, uncle: 2, youth: 3, kid: 2, aunty: 1, auto: 1 }),
      vendor: { role: 'man', look: { shirt: '#e8e0c8', towel: '#efe6d0' }, work: 'fry' },
      stove: { u: 0.55, v: 0, h: 7.0, u3: 0.55, h3: 6.2 }, hold: 'cone', eat: [16, 34], parcel: 0.25, serve: 6.5,
      steam: { rate: 4.4, burst: 10, smoke: 0.25 }, sounds: { cook: 'sizzle', serve: 'paper', pay: 'coin' },
      orders: 'samosa', vlines: 'samosaV', vehicles: 2, lamp: 'bulb', glow: '#ff7a20', shelter: 'tarp', shop: true,
    },
    chai: {
      label: 'Chai bandi', type: 'cart', max: 8, peaks: [[420, 570, 1], [960, 1140, 0.9], [1140, 1290, 0.45]], base: 0.3,
      dow: [0.85, 1.1, 1.1, 1.1, 1.1, 1.1, 1],
      roles: (m) => (MORNING(m) ? { office: 3, uncle: 3, auto: 3, lungi: 2, man: 2, police: 0.4, student: 1 } : { man: 3, youth: 3, auto: 3, uncle: 2, office: 2, elder: 0.5 }),
      vendor: { role: 'man', look: { shirt: '#d8d0b8', towel: '#2a6a8a' }, work: 'chai' },
      stove: { u: -0.35, v: 0, h: 9.2, u3: 0.4, h3: 8.4 }, hold: 'glass', eat: [14, 34], parcel: 0.05, serve: 5.5,
      steam: { rate: 3.2, burst: 8, smoke: 0.08 }, sounds: { cook: 'cup_clink', serve: 'cup_clink', pay: 'coin' },
      orders: 'chai', vlines: 'chaiV', chat: 'chaiChat', vehicles: 2, lamp: 'bulb', glow: '#ff9a40', shelter: 'tarp', shop: true,
      hours: [330, 1320],
    },
    bhutta: {
      label: 'Bhutta cart', type: 'extra', cart: 'bhutta', max: 7, peaks: [[990, 1290, 1]], base: 0,
      dow: [1.4, 0.9, 0.9, 0.9, 0.9, 1, 1.3],
      roles: () => ({ youth: 3, man: 2, family: 3, college: 2, kid: 1, uncle: 1 }),
      vendor: { role: 'lungi', look: { towel: '#efe6d0' }, work: 'bhutta' },
      stove: { u: 0.35, v: 0, h: 4.6, u3: 0.35, h3: 4.6 }, hold: 'cob', eat: [24, 50], parcel: 0.1, serve: 7.5,
      steam: { rate: 3.4, burst: 6, smoke: 1, sparks: 1 }, sounds: { cook: 'chop', serve: 'paper', pay: 'coin' },
      orders: 'bhutta', vlines: 'bhuttaV', vehicles: 1, lamp: 'petromax', glow: '#ff5a10', shelter: 'umbrella',
      buy: { place: 'chai_bandi_6', item: 'bhutta', label: 'Bhutta ₹3' },
    },
    panipuri: {
      label: 'Pani puri cart', type: 'extra', cart: 'panipuri', max: 7, peaks: [[1020, 1290, 1], [960, 1020, 0.4]], base: 0,
      dow: [1.3, 0.9, 0.9, 1, 1, 1.1, 1.25],
      roles: () => ({ aunty: 2, woman: 3, college: 3, student: 2, kid: 2, youth: 2, family: 2 }),
      vendor: { role: 'man', look: { shirt: '#f4f4f0', cap: 'topi' }, work: 'panipuri' },
      stove: { u: 0.45, v: 0, h: 6.2, u3: 0.45, h3: 6.2 }, hold: 'leaf', eat: [18, 40], parcel: 0, serve: 2.4, tight: true,
      steam: { rate: 0.25, burst: 0, smoke: 0 }, sounds: { cook: null, serve: 'munch', pay: 'coin' },
      orders: 'panipuri', vlines: 'panipuriV', vehicles: 1, lamp: 'petromax', glow: null, shelter: 'umbrella',
      buy: { place: 'gokul_chat', item: 'pani_puri', label: 'Pani puri ₹5' },
    },
    gola: {
      label: 'Ice-gola cart', type: 'extra', cart: 'gola', max: 6, peaks: [[690, 1080, 1]], base: 0, when: () => season('summer'),
      dow: [1.4, 1, 1, 1, 1, 1, 1.2],
      roles: () => ({ kid: 5, student: 2, family: 3, youth: 1 }),
      vendor: { role: 'man', look: { shirt: '#e8e0d0' }, work: 'gola' },
      stove: { u: 0.3, v: 0, h: 5.2, u3: 0.3, h3: 5.2 }, hold: 'gola', eat: [16, 34], parcel: 0, serve: 4.5,
      steam: { rate: 0.6, burst: 0, smoke: 0, cold: true }, sounds: { cook: null, serve: null, pay: 'coin' },
      orders: 'gola', vlines: 'golaV', vehicles: 0, lamp: null, glow: null, shelter: 'umbrella',
      buy: { place: '@school_gate', item: 'gola', label: 'Ice gola ₹1' },
    },
    gate: {
      label: 'School gate cart', type: 'gate', max: 7, peaks: [[950, 1110, 1]], base: 0,
      roles: () => ({ student: 6, kid: 2, aunty: 1 }),
      vendor: { role: 'man', look: { shirt: '#e8e0d0' }, work: 'gola', hide2d: true },
      hold: 'gola', eat: [12, 28], parcel: 0.2, serve: 4,
      steam: { rate: 0.5, burst: 0, smoke: 0 }, sounds: { cook: null, serve: null, pay: 'coin' },
      orders: 'gola', vlines: 'golaV', vehicles: 0, lamp: null, glow: null, shelter: null, shop: true, ring: { r0: 7, rows: 2, gap: 5.2 },
    },
    coconut: {
      label: 'Coconut cart', type: 'cart', max: 4, peaks: [[660, 1020, 1]], base: 0.15, hours: [540, 1140],
      roles: () => ({ man: 2, family: 2, office: 1, youth: 2, aunty: 1, college: 1 }),
      vendor: { role: 'lungi', look: { towel: '#3a8a3a' }, work: 'coconut' },
      stove: { u: 0.62, v: 0, h: 5.6, u3: 0.62, h3: 5.0 }, hold: 'coconut', eat: [18, 36], parcel: 0.1, serve: 5,
      steam: null, sounds: { cook: 'coconut_chop', serve: null, pay: 'coin' },
      orders: 'coconut', vlines: 'coconutV', vehicles: 1, lamp: null, glow: null, shelter: 'umbrella', shop: true,
    },
    banana: {
      label: 'Banana cart', type: 'cart', max: 3, peaks: [[480, 690, 0.8], [990, 1200, 1]], base: 0.2, hours: [420, 1200],
      roles: () => ({ aunty: 3, uncle: 2, man: 1, kid: 1, woman: 1 }),
      vendor: { role: 'man', look: { towel: '#efe6d0' }, work: 'banana' },
      stove: { u: 0.2, v: 0, h: 5.6, u3: 0.2, h3: 5.0 }, hold: 'banana', eat: [10, 22], parcel: 0.6, serve: 4,
      steam: null, sounds: { cook: null, serve: null, pay: 'coin' },
      orders: 'banana', vlines: 'bananaV', vehicles: 0, lamp: null, glow: null, shelter: 'umbrella', shop: true,
    },
    flower: {
      label: 'Flower cart', type: 'cart', max: 3, peaks: [[390, 600, 1], [1020, 1200, 0.8]], base: 0.15, hours: [360, 1200],
      dow: [1.1, 1, 1, 1, 1.6, 1.4, 1.1],
      roles: () => ({ aunty: 5, woman: 3, uncle: 1, man: 1 }),
      vendor: { role: 'aunty', look: {}, work: 'flower' },
      stove: { u: 0.3, v: 0, h: 5.6, u3: 0.3, h3: 5.0 }, hold: 'flowers', eat: [6, 14], parcel: 0.85, serve: 4.5,
      steam: null, sounds: { cook: null, serve: null, pay: 'coin' },
      orders: 'flower', vlines: 'flowerV', vehicles: 0, lamp: null, glow: null, shelter: 'umbrella', shop: true,
    },
    gokul: {
      label: 'Gokul Chat', type: 'shop', max: 15, peaks: [[690, 900, 0.55], [1020, 1335, 1]], base: 0.25, hours: [660, 1350],
      dow: [1.35, 0.9, 0.9, 1, 1, 1.15, 1.3],
      roles: () => ({ college: 3, youth: 3, family: 3, woman: 2, aunty: 2, student: 2, kid: 1, office: 1 }),
      vendor: { role: 'man', look: { shirt: '#f4f4f0' }, work: 'panipuri', at: [-4, 0.9], second: { at: [4, 0.9], work: 'chaat' } },
      stove: { u: 0.5, v: 1.4, h: 6.6, abs: true }, hold: 'leaf', eat: [20, 46], parcel: 0.08, serve: 3.2,
      steam: { rate: 1.0, burst: 3, smoke: 0.1 }, sounds: { cook: 'sizzle', serve: 'plates', pay: 'coin' },
      orders: 'gokul', vlines: 'gokulV', vehicles: 3, lamp: null, glow: null, shelter: 'awning', shop: true,
      ring: { v0: 4.6, v1: 13, gap: 4.6 }, zone: true,
    },
    irani: {
      label: 'Irani cafe', type: 'shop', max: 6, peaks: [[390, 570, 1], [960, 1170, 0.9], [1290, 1400, 0.5]], base: 0.3, hours: [300, 1410],
      dow: [1.2, 1, 1, 1, 1, 1.15, 1.1],
      roles: (m) => (MORNING(m) ? { uncle: 3, office: 3, elder: 1, man: 2, auto: 1, old: 1 } : { man: 3, youth: 3, uncle: 2, elder: 1, college: 1 }),
      vendor: { role: 'man', look: { shirt: '#f4f4f0', cap: 'topi', prop: 'tray' }, work: 'waiter', at: [0, 2.2] },
      stove: { u: 0.5, v: 0.8, h: 6.4, abs: true, uk: -6 }, hold: 'glass', eat: [22, 60], parcel: 0, serve: 4.5,
      steam: { rate: 1.0, burst: 2, smoke: 0 }, sounds: { cook: 'cup_clink', serve: 'cup_clink', pay: 'coin' },
      orders: 'irani', vlines: 'iraniV', chat: 'chaiChat', vehicles: 2, lamp: null, glow: null, shelter: 'awning', shop: true,
      ring: { v0: 6.5, v1: 13, gap: 5.2 }, zone: true,
    },
    biryani: {
      label: 'Biryani house', type: 'shop', max: 14, peaks: [[750, 900, 1], [1170, 1380, 1], [900, 1170, 0.3]], base: 0.15, hours: [660, 1380],
      dow: [1.4, 0.9, 0.9, 0.9, 1, 1.1, 1.3],
      roles: () => ({ man: 3, family: 3, office: 2, youth: 2, uncle: 2, elder: 1 }),
      vendor: { role: 'man', look: { shirt: '#f4f4f0' }, work: 'counter', at: [0.5, 0.9], rel: 'end' },
      stove: { u: 0.5, v: 2.2, h: 3.6, abs: true, uk: -4 }, hold: null, eat: [0, 0], parcel: 0.6, serve: 4.6, queue: true,
      steam: { rate: 0.9, burst: 2, smoke: 0 }, sounds: { cook: null, serve: 'paper', pay: 'coin' },
      orders: 'biryani', vlines: 'biryaniV', vehicles: 3, lamp: null, glow: null, shelter: 'awning', shop: true, zone: true,
    },
    haleem: {
      label: 'Haleem bhatti', type: 'bhatti', max: 12, peaks: [[1065, 1170, 1], [1260, 1470, 0.85]], base: 0.25,
      when: () => season('ramzan') || season('chand_raat'), hours: [1050, 1500],
      roles: () => ({ man: 3, elder: 3, youth: 3, kid: 1, uncle: 1 }),
      vendor: { role: 'man', look: { shirt: '#f4f4f0', cap: 'topi', hat: 'skull', hatColor: '#f4f2ea' }, work: 'haleem' },
      hold: 'bowl', eat: [22, 48], parcel: 0.35, serve: 4.8,
      steam: { rate: 4.0, burst: 6, smoke: 0.6, sparks: 0.3 }, sounds: { cook: null, serve: 'plates', pay: 'coin' },
      orders: 'haleem', vlines: 'haleemV', vehicles: 2, lamp: 'tube', glow: '#ff6a18', shelter: null, ring: { r0: 9, rows: 3, gap: 5 },
    },
  };
  // the Hussain Sagar chai bandis also roast bhutta in the evening (shops.js sells it there 16:00-21:00)
  const BHUTTA_CHAI = /^chai_bandi_(6|8)$/;

  /* ================================================================ frames */
  // A frame maps local (u along, v towards the customers) to world: P = c + a * u + n * v.
  //  carts (places_art.js cartOf convention): c = cart centre, a = long axis, n = the customer side normal;
  //  shops (places_art.js frontOf): c = the front edge centre, a = along the front, n = outward normal.
  function cartFrame(lm) {
    const long = lm.w >= lm.d;
    const ca = long ? 1 : 0, sa = long ? 0 : 1;
    const f = String(lm.face || 's').toUpperCase();
    const ox = f === 'E' ? 1 : f === 'W' ? -1 : 0, oy = f === 'S' ? 1 : f === 'N' ? -1 : 0;
    const side = Math.round(ox * -sa + oy * ca) || 1;
    return { t: 'cart', cx: lm.x, cy: lm.y, ax: ca, ay: sa, nx: -sa * side, ny: ca * side, side, hl: Math.max(lm.w, lm.d) / 2, hw: Math.min(lm.w, lm.d) / 2, L: Math.max(lm.w, lm.d), D: Math.min(lm.w, lm.d) };
  }
  // the 3D cart model's own long axis (view3d_landmarks.js pushcart: rotFor(lm) + PI/2 when L < D)
  const FR3 = { s: 0, n: PI, e: PI / 2, w: -PI / 2 };
  function cart3Axis(lm) {
    const ns = !lm.face || lm.face === 'n' || lm.face === 's' || isFinite(lm.faceAngle);
    const L = ns ? lm.w : lm.d, D = ns ? lm.d : lm.w;
    const rot = (isFinite(lm.faceAngle) ? PI / 2 - lm.faceAngle : FR3[lm.face] || 0) + (L < D ? PI / 2 : 0);
    return { ax: Math.cos(rot), ay: -Math.sin(rot), hl: Math.min(Math.max(L, D), 15) / 2 };
  }
  function shopFrame(lm) {
    const x = lm.x - lm.w / 2, y = lm.y - lm.d / 2, w = lm.w, d = lm.d;
    const f = String(lm.face || (w >= d ? 's' : 'e')).toUpperCase();
    const F = { t: 'shop', cx: 0, cy: 0, ax: 0, ay: 0, nx: 0, ny: 0, L: 0, D: 0, hl: 0, hw: 0 };
    if (f === 'N') { F.ny = -1; F.ax = 1; F.cx = lm.x; F.cy = y; F.L = w; F.D = d; }
    else if (f === 'S') { F.ny = 1; F.ax = -1; F.cx = lm.x; F.cy = y + d; F.L = w; F.D = d; }
    else if (f === 'W') { F.nx = -1; F.ay = -1; F.cx = x; F.cy = lm.y; F.L = d; F.D = w; }
    else { F.nx = 1; F.ay = 1; F.cx = x + w; F.cy = lm.y; F.L = d; F.D = w; }
    F.hl = F.L / 2; F.hw = 0;
    return F;
  }
  function pointFrame(x, y, ang, hl, hw) { // extra carts / bhattis: a frame at a point
    const ax = Math.cos(ang), ay = Math.sin(ang);
    return { t: 'cart', cx: x, cy: y, ax, ay, nx: -ay, ny: ax, hl: hl || 7, hw: hw || 3.6, L: (hl || 7) * 2, D: (hw || 3.6) * 2 };
  }
  const fx = (F, u, v) => F.cx + F.ax * u + F.nx * v;
  const fy = (F, u, v) => F.cy + F.ay * u + F.ny * v;
  const fang = (F) => Math.atan2(F.ny, F.nx); // facing the customers

  /* ================================================================ world checks */
  const SURF = () => N.SURF || {};
  function roadKindAt(x, y) {
    try { const q = N.world.nearestRoadPoint(x, y); if (q && q.road && q.dist < (q.road.w || 30) / 2 + 2) return q.road.kind; } catch (e) { /* ignore */ }
    return null;
  }
  /** a standing spot: walkable, clear of walls, not water / bridge, not inside a respect compound;
   *  road: 0 never, 1 lanes and streets only */
  function standOk(x, y, road, r) {
    const W = N.world, S = SURF();
    if (!W || !W.built || !isFinite(x) || !isFinite(y)) return false;
    if (!W.isWalkable(x, y)) return false;
    const s = W.surfaceAt(x, y);
    if (s === S.WATER || s === S.BRIDGE || s === S.VOID) return false;
    const c = W.collide(x, y, r || 3.2, 'walk');
    if (c.hit || c.bad) return false;
    if (s === S.ROAD) { if (!road) return false; const k = roadKindAt(x, y); if (k && k !== 'lane' && k !== 'street') return false; }
    try { const z = N.respect && N.respect.at ? N.respect.at(x, y) : null; if (z && z.part === 'compound') return false; } catch (e) { /* ignore */ }
    return true;
  }
  function seen(x0, y0, x1, y1) { try { return !N.world.raycast(x0, y0, x1, y1, 'walk').hit; } catch (e) { return true; } }

  /* ================================================================ spots */
  const SPOTS = [];
  const BYID = new Map();
  const HALEEM_REST = ['shadab_hotel', 'pista_house', 'shah_ghouse', 'hotel_nayaab'];
  const PANI_MARKETS = ['sultan_bazaar', 'general_bazaar', 'begum_bazaar', 'monda_market', 'chappal_bazar', 'rythu_bazaar_mehdipatnam', 'rythu_bazaar_saroornagar', 'rythu_bazaar_erragadda', 'gaddiannaram_fruit_market', 'abids_book_market', 'mozamjahi_market'];
  function kindForPlace(p) {
    if (p.id === 'gokul_chat') return 'gokul';
    if (p.id === 'paradise' || p.id === 'bawarchi') return 'biryani';
    switch (p.kind) {
      case 'dosa_bandi': return 'dosa';
      case 'samosa_bandi': return 'samosa';
      case 'chai_bandi': return 'chai';
      case 'coconut_cart': return 'coconut';
      case 'banana_cart': return 'banana';
      case 'flower_cart': return 'flower';
      case 'irani_cafe': return 'irani';
      case 'school': return /^school_\d+$/.test(p.id) ? 'gate' : null;
      default: return null;
    }
  }
  function addSpot(s) {
    if (!s || !s.id || !KINDS[s.kind] || BYID.has(s.id)) return null;
    const K = KINDS[s.kind];
    const sp = Object.assign({ K, seed: hash(s.id), slots: null, scene: null, present: true, cart: null, frame: null }, s);
    if (!sp.frame) {
      if (sp.lm && (K.type === 'cart')) sp.frame = cartFrame(sp.lm);
      else if (sp.lm && (K.type === 'shop' || K.type === 'gate')) sp.frame = shopFrame(sp.lm);
      else sp.frame = pointFrame(sp.x, sp.y, sp.angle || 0, sp.hl, sp.hw);
    }
    if (sp.lm && K.type === 'cart') sp.axis3 = cart3Axis(sp.lm);
    SPOTS.push(sp); BYID.set(sp.id, sp);
    return sp;
  }
  function polyAt(pts, f) { // point + direction at fraction f along a polyline
    let L = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); L += l; }
    let d = L * f;
    for (let i = 1; i < pts.length; i++) {
      if (d <= seg[i - 1] || i === pts.length - 1) {
        const t = seg[i - 1] ? clamp(d / seg[i - 1], 0, 1) : 0, a = pts[i - 1], b = pts[i];
        return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
      }
      d -= seg[i - 1];
    }
    return null;
  }
  /** a cart beside a road: on the lake (water) side when there is one, on free ground / footpath */
  function roadsideSpot(road, f, kind, id) {
    const q = polyAt(road.pts, f);
    if (!q) return null;
    const px = -Math.sin(q.a), py = Math.cos(q.a);
    let best = null;
    for (const side of [1, -1]) for (const extra of [7, 10, 13, 17]) {
      const d = road.w / 2 + extra, x = q.x + px * side * d, y = q.y + py * side * d;
      if (!standOk(x, y, 0, 6)) continue;
      const lake = N.world.isWater(x + px * side * 40, y + py * side * 40) || N.world.isWater(x + px * side * 70, y + py * side * 70);
      const score = (lake ? 10 : 0) - extra * 0.1;
      if (!best || score > best.score) best = { x, y, side, score };
    }
    if (!best) return null;
    // the customers gather on the promenade side, away from the traffic (frame n = away from the road)
    return addSpot({ id, kind, x: best.x, y: best.y, angle: q.a + (best.side > 0 ? 0 : PI), lm: null, hl: 6.5, hw: 3.4, extra: true });
  }
  function marketSpot(pl, kind, id, rng) {
    for (let k = 0; k < 60; k++) {
      const a = rng.next() * TAU, d = 24 + rng.next() * 46;
      const x = pl.x + Math.cos(a) * d, y = pl.y + Math.sin(a) * d;
      if (!standOk(x, y, 0, 7)) continue;
      // keep clear of landmarks and other spots
      const lms = (N.WORLD_DATA.landmarks || []);
      if (lms.some((l) => x > l.x - l.w / 2 - 14 && x < l.x + l.w / 2 + 14 && y > l.y - l.d / 2 - 14 && y < l.y + l.d / 2 + 14)) continue;
      if (SPOTS.some((s) => Math.hypot(s.x - x, s.y - y) < 45)) continue;
      // the cart's back to the nearest road: its customers stand on the footpath / ground side
      let ang = rng.next() * TAU;
      try { const q = N.world.nearestRoadPoint(x, y); if (q && q.dist < 90) ang = Math.atan2(q.y - y, q.x - x) + PI / 2; } catch (e) { /* ignore */ }
      return addSpot({ id, kind, x, y, angle: ang, lm: null, hl: 6.5, hw: 3.4, extra: true, near: pl.id });
    }
    return null;
  }
  function buildSpots() {
    for (const sp of SPOTS) if (sp.scene) releaseScene(sp.scene, true);
    for (const sp of SPOTS) removeCartEntity(sp);
    SPOTS.length = 0; BYID.clear();
    const D = N.WORLD_DATA;
    if (!D || !N.world || !N.world.built) return;
    const LM = new Map();
    for (const l of D.landmarks || []) LM.set(l.id, l);
    for (const p of D.places || []) {
      if (!p || p.alias || !N.places[p.id] || p.level || p.roof) continue;
      const kind = kindForPlace(p);
      if (kind) {
        const lm = LM.get(p.id) || null;
        if ((KINDS[kind].type === 'cart' || kind === 'gate' || KINDS[kind].type === 'shop') && !lm) continue;
        const o = { id: p.id, kind, x: lm ? lm.x : p.x, y: lm ? lm.y : p.y, place: p.id, lm };
        if (kind === 'gate') {
          const F = shopFrame(lm), gx = fx(F, 9, 5.3), gy = fy(F, 9, 5.3);
          o.frame = { t: 'gate', cx: gx, cy: gy, ax: F.ax, ay: F.ay, nx: F.nx, ny: F.ny, hl: 3, hw: 1.8, L: 6, D: 3.6 };
          o.x = gx; o.y = gy;
        }
        addSpot(o);
      }
      if (HALEEM_REST.indexOf(p.id) >= 0 && LM.get(p.id)) {
        const lm = LM.get(p.id), F = shopFrame(lm), bx = fx(F, -F.L / 2 + 5, 4), by = fy(F, -F.L / 2 + 5, 4);
        addSpot({ id: p.id + ':haleem', kind: 'haleem', x: bx, y: by, place: p.id, lm, art: 'rest', frame: { t: 'bhatti', cx: bx, cy: by, ax: F.ax, ay: F.ay, nx: F.nx, ny: F.ny, hl: 3.4, hw: 3.4, L: 6.8, D: 6.8 } });
      }
    }
    // extra carts the map does not list: bhutta + ice gola on the lake front, pani puri by the markets
    const roads = D.roads || [];
    const neck = roads.find((r) => r.id === 'necklace_rd'), bund = roads.find((r) => r.id === 'tank_bund');
    let n = 0;
    if (neck) for (const f of [0.16, 0.34, 0.55, 0.78]) roadsideSpot(neck, f, 'bhutta', 'bhutta_' + (++n));
    if (bund) for (const f of [0.22, 0.48, 0.72]) roadsideSpot(bund, f, 'bhutta', 'bhutta_' + (++n));
    n = 0;
    if (neck) for (const f of [0.26, 0.66]) roadsideSpot(neck, f, 'gola', 'gola_' + (++n));
    if (bund) roadsideSpot(bund, 0.36, 'gola', 'gola_' + (++n));
    const rng = U.rng('streetfood:pani');
    n = 0;
    for (const id of PANI_MARKETS) { const pl = N.places[id]; if (pl) marketSpot(pl, 'panipuri', 'panipuri_' + (++n), rng); }
    for (const sp of SPOTS) if (sp.extra) addCartEntity(sp);
    ST.spots = SPOTS.length;
  }
  // Ramzan street bhattis (seasons.js) become spots while the season is on
  let bhattiT = 0;
  function refreshBhattis(dt) {
    bhattiT -= dt;
    if (bhattiT > 0) return;
    bhattiT = 4;
    const on = KINDS.haleem.when();
    for (let i = SPOTS.length - 1; i >= 0; i--) {
      const s = SPOTS[i];
      if (s.art !== 'season') continue;
      if (!on) { if (s.scene) releaseScene(s.scene); SPOTS.splice(i, 1); BYID.delete(s.id); }
    }
    if (!on || !N.seasons || typeof N.seasons.scene !== 'function') return;
    let sc = null;
    try { sc = N.seasons.scene(N.player.x, N.player.y, 1200); } catch (e) { return; }
    for (const pr of (sc && sc.props) || []) {
      if (pr.kind !== 'haleem_bhatti' || !isFinite(pr.x)) continue;
      const id = 'bhatti_' + Math.round(pr.x) + '_' + Math.round(pr.y);
      if (BYID.has(id)) continue;
      // the seasons.js cook stands east of the deg; the crowd gathers on the other sides
      addSpot({ id, kind: 'haleem', x: pr.x, y: pr.y, art: 'season', lm: null, frame: { t: 'bhatti', cx: pr.x, cy: pr.y, ax: 0, ay: 1, nx: -1, ny: 0, hl: 5, hw: 5, L: 10, D: 10 } });
    }
  }

  /* ================================================================ slots (computed once per spot, lazily) */
  function jit(rng, a) { return (rng.next() - 0.5) * 2 * a; }
  function slotsFor(sp) {
    if (sp.slots) return sp.slots;
    const K = sp.K, F = sp.frame, rng = U.rng('sf:' + sp.id);
    const out = { ring: [], shelter: [], queue: [], entry: [], park: [], counter: null, vendor: null, vendor2: null, stove: null, stove3: null, ret: null, door: null, eatRing: [] };
    const push = (list, u, v, road, face) => {
      const x = fx(F, u, v), y = fy(F, u, v);
      if (!standOk(x, y, road)) return false;
      const ex = fx(F, clamp(u, -F.hl, F.hl), F.t === 'shop' ? 1 : F.hw + 0.5), ey = fy(F, clamp(u, -F.hl, F.hl), F.t === 'shop' ? 1 : F.hw + 0.5);
      if (!seen(ex, ey, x, y)) return false;
      for (const s of list) if (Math.hypot(s.x - x, s.y - y) < 4.2) return false;
      list.push({ x, y, u, v, a: face != null ? face : Math.atan2(F.cy - y, F.cx - x), taken: null, row: 0 });
      return true;
    };
    const t = F.t;
    // the stove (2D) and the vendor's spot
    const st = K.stove;
    if (st) {
      const su = st.abs ? (st.uk != null ? F.hl + st.uk : st.u) : st.u * F.hl;
      // vl: across the cart in places_art's load image (its +y is the cart's left), so the tawa sits on the painted one
      const sv = st.abs ? st.v : st.vl != null ? st.vl * F.hw * (F.side || 1) : (st.v || 0) * F.hw;
      out.stove = { x: fx(F, su, sv), y: fy(F, su, sv), h: st.h, u: su };
      if (sp.axis3) { // the 3D cart model may run the other way round
        const A = sp.axis3, u3 = (st.u3 != null ? st.u3 : st.u) * A.hl;
        out.stove3 = { x: F.cx + A.ax * u3, y: F.cy + A.ay * u3, h: st.h3 || st.h, u: u3 * (A.ax * F.ax + A.ay * F.ay) };
      }
    } else if (t === 'bhatti' || t === 'gate') out.stove = { x: F.cx, y: F.cy, h: t === 'bhatti' ? 5.6 : 5.2, u: 0 };
    if (!out.stove3) out.stove3 = out.stove;
    const vend = (s) => { // behind the stove on the far side, else at the handle end
      if (!s) return null;
      if (t === 'cart') {
        const u = clamp(s.u, -F.hl + 1, F.hl - 1);
        for (const d of [3.4, 4.4, 5.4, 6.4]) { const x = fx(F, u, -F.hw - d), y = fy(F, u, -F.hw - d); if (standOk(x, y, 1, 2.4)) return { x, y, a: fang(F) }; }
        const x = fx(F, -F.hl - 4.2, 0), y = fy(F, -F.hl - 4.2, 0);
        return { x, y, a: Math.atan2(F.ay, F.ax), end: true };
      }
      return null;
    };
    if (t === 'cart') {
      if (K.tight) { // pani puri: the vendor at the front end, a tight crowd round him
        const vx = fx(F, F.hl + 2.6, 0), vy = fy(F, F.hl + 2.6, 0);
        out.vendor = { x: vx, y: vy, a: Math.atan2(F.ay, F.ax) + PI, tight: true };
        out.stove = { x: fx(F, F.hl - 1.6, 0), y: fy(F, F.hl - 1.6, 0), h: 6.2, u: F.hl - 1.6 };
        out.stove3 = out.stove;
        const ax = F.ax, ay = F.ay;
        for (const [R, n] of [[6.6, 7], [11.2, 9]]) for (let i = 0; i < n; i++) {
          const a = Math.atan2(ay, ax) + (i / (n - 1) - 0.5) * 2 * 1.85 + jit(rng, 0.08), x = vx + Math.cos(a) * R, y = vy + Math.sin(a) * R;
          if (!standOk(x, y, 1) || !seen(vx, vy, x, y)) continue;
          if (out.ring.some((s) => Math.hypot(s.x - x, s.y - y) < 4.2)) continue;
          out.ring.push({ x, y, u: 0, v: 0, a: Math.atan2(vy - y, vx - x), taken: null, row: R > 8 ? 1 : 0 });
        }
        out.counter = { x: fx(F, F.hl + 7.4, 0), y: fy(F, F.hl + 7.4, 0) };
      } else {
        out.vendor = vend(out.stove || { u: 0 });
        out.vendor3 = out.stove3 && out.stove3 !== out.stove ? vend(out.stove3) : out.vendor;
        const g = (K.ring && K.ring.gap) || 6, rows = (K.ring && K.ring.rows) || 3;
        for (let row = 0; row < rows; row++) {
          const d = ((K.ring && K.ring.r0) || 4.4) + row * g, A = F.hl + d, B = F.hw + d;
          const per = Math.max(3, Math.round((PI * Math.sqrt((A * A + B * B) / 2) * 0.9) / g));
          for (let i = 0; i < per; i++) {
            const th = (i / (per - 1) - 0.5) * PI * 0.92 + jit(rng, 0.05);
            const u = A * Math.sin(th) + jit(rng, 0.7), v = B * Math.cos(th) + jit(rng, 0.7);
            if (push(out.ring, u, v, 0)) out.ring[out.ring.length - 1].row = row;
          }
        }
        if (out.ring.length < K.max + 2) for (let row = 0; row < rows; row++) { // overflow onto quiet lanes
          const d = 5.2 + row * g, A = F.hl + d, B = F.hw + d;
          for (let i = 0; i < 9; i++) { const th = (i / 8 - 0.5) * PI * 0.92; if (push(out.ring, A * Math.sin(th), B * Math.cos(th), 1)) out.ring[out.ring.length - 1].row = row + 1; }
        }
        const cu = clamp(out.stove ? out.stove.u : 0, -F.hl + 1.5, F.hl - 1.5);
        out.counter = { x: fx(F, cu, F.hw + 3.3), y: fy(F, cu, F.hw + 3.3) };
        if (!standOk(out.counter.x, out.counter.y, 1)) out.counter = out.ring[0] ? { x: out.ring[0].x, y: out.ring[0].y } : { x: fx(F, 0, F.hw + 5), y: fy(F, 0, F.hw + 5) };
        out.ret = { x: fx(F, -F.hl * 0.55, F.hw + 2.8), y: fy(F, -F.hl * 0.55, F.hw + 2.8) };
      }
      // under the tarpaulin / umbrella
      if (K.shelter === 'tarp') { for (const v of [F.hw + 2.6, F.hw + 6.4]) for (let u = -F.hl; u <= F.hl + 0.1; u += 4.3) push(out.shelter, u, v, 1); }
      else if (K.shelter === 'umbrella') { for (const [u, v] of [[-F.hl + 1, F.hw + 2.6], [-F.hl + 4.5, F.hw + 2.8], [-F.hl - 2.5, F.hw + 1.5]]) push(out.shelter, u, v, 1); }
      // parking: beyond the ends of the ring, off the carriageway
      for (const s of [1, -1]) for (let i = 0; i < 3; i++) {
        const u = s * (F.hl + 13 + i * 5.2), v = F.hw + 5 + (i % 2) * 1.5;
        const x = fx(F, u, v), y = fy(F, u, v);
        if (!N.world.isDrivable(x, y) || N.world.surfaceAt(x, y) === SURF().ROAD || N.world.collide(x, y, 5.5, 'drive').hit) continue;
        if (out.ring.some((q) => Math.hypot(q.x - x, q.y - y) < 6)) continue;
        out.park.push({ x, y, a: Math.atan2(F.ny, F.nx) + (rng.next() - 0.5) * 0.5 });
      }
    } else if (t === 'shop') {
      const r0 = K.ring || { v0: 5, v1: 12, gap: 5 };
      for (let v = r0.v0; v <= r0.v1 + 0.01; v += r0.gap) {
        for (let u = -F.hl + 3; u <= F.hl - 3 + 0.01; u += r0.gap) push(out.ring, u + jit(rng, 0.9), v + jit(rng, 0.7), 0);
      }
      if (out.ring.length < K.max) for (let v = r0.v0; v <= r0.v1 + 0.01; v += r0.gap) for (let u = -F.hl + 3; u <= F.hl - 3; u += r0.gap) push(out.ring, u, v, 1);
      for (let u = -F.hl + 3; u <= F.hl - 3 + 0.01; u += 4) push(out.shelter, u, 2.4, 1);
      out.door = { x: fx(F, 0, 0.6), y: fy(F, 0, 0.6) };
      const va = K.vendor && K.vendor.at;
      if (va) {
        const u = K.vendor.rel === 'end' ? F.hl - 5 : va[0];
        out.vendor = { x: fx(F, u, va[1]), y: fy(F, u, va[1]), a: fang(F) };
        if (K.vendor.second) { const s2 = K.vendor.second.at; out.vendor2 = { x: fx(F, s2[0], s2[1]), y: fy(F, s2[0], s2[1]), a: fang(F) }; }
      }
      const cu = out.vendor ? (K.vendor.rel === 'end' ? F.hl - 5 : va[0]) : 0;
      out.counter = { x: fx(F, cu, K.queue ? 4.4 : 3.8), y: fy(F, cu, K.queue ? 4.4 : 3.8) };
      if (K.queue) { // the biryani parcel queue along the front, doubling back on a second line
        let u = F.hl - 5, v = 4.4, dir = -1;
        for (let i = 0; i < 16 && out.queue.length < 12; i++) {
          push(out.queue, u, v, 1);
          u += dir * 4.4;
          if (u < -F.hl + 4) { u = -F.hl + 4; v += 4.8; dir = 1; }
        }
        for (let i = 0; i < out.queue.length; i++) { const q = out.queue[i], n = i ? out.queue[i - 1] : out.counter; q.a = Math.atan2(n.y - q.y, n.x - q.x); }
        // the ring keeps clear of the queue line
        out.ring = out.ring.filter((s) => !out.queue.some((q) => Math.hypot(q.x - s.x, q.y - s.y) < 4));
      }
    } else if (t === 'bhatti' || t === 'gate') {
      const r0 = (K.ring && K.ring.r0) || 8, rows = (K.ring && K.ring.rows) || 3, g = (K.ring && K.ring.gap) || 5;
      const base = Math.atan2(F.ny, F.nx), spread = t === 'gate' ? 1.25 : (sp.art === 'season' ? 2.2 : 1.45);
      for (let row = 0; row < rows; row++) {
        const R = r0 + row * g, per = Math.max(4, Math.round((R * spread * 2) / g));
        for (let i = 0; i < per; i++) {
          const a = base + (i / (per - 1) - 0.5) * 2 * spread + jit(rng, 0.06);
          const x = F.cx + Math.cos(a) * R, y = F.cy + Math.sin(a) * R;
          if (!standOk(x, y, 1) || !seen(F.cx, F.cy, x, y)) continue;
          if (out.ring.some((s) => Math.hypot(s.x - x, s.y - y) < 4.2)) continue;
          out.ring.push({ x, y, u: 0, v: 0, a: Math.atan2(F.cy - y, F.cx - x), taken: null, row });
        }
      }
      out.counter = { x: F.cx + F.nx * (r0 - 2.5), y: F.cy + F.ny * (r0 - 2.5) };
      if (sp.art === 'rest') { // the pounder stands by the deg, on the shop side
        const x = F.cx + F.ax * 4.6 - F.nx * 0.5, y = F.cy + F.ay * 4.6 - F.ny * 0.5;
        out.vendor = standOk(x, y, 1, 3) ? { x, y, a: Math.atan2(F.cy - y, F.cx - x) } : null;
      } else if (t === 'gate') {
        const x = F.cx - F.nx * 2.6, y = F.cy - F.ny * 2.6;
        out.vendor = { x, y, a: fang(F) };
      }
    }
    // ring slots facing the cart's working point; order: nearest row first
    const cx0 = out.counter ? out.counter.x : F.cx, cy0 = out.counter ? out.counter.y : F.cy;
    const lx0 = K.tight && out.vendor ? out.vendor.x : out.stove ? out.stove.x : F.cx, ly0 = K.tight && out.vendor ? out.vendor.y : out.stove ? out.stove.y : F.cy;
    for (const s of out.ring) {
      s.a = F.t === 'shop' ? Math.atan2(-F.ny, -F.nx) + jit(rng, 0.4) : Math.atan2(ly0 - s.y, lx0 - s.x) + jit(rng, 0.25);
      s.d = Math.hypot(s.x - cx0, s.y - cy0);
    }
    out.ring.sort((a, b) => a.row - b.row || a.d - b.d);
    // entry / exit points: out along the customer side, reachable from the ring
    const base = Math.atan2(F.ny, F.nx), ox = cx0, oy = cy0;
    for (let i = 0; i < 16 && out.entry.length < 8; i++) {
      const a = base + (i % 2 ? 1 : -1) * (0.2 + (i >> 1) * 0.22) + jit(rng, 0.1), d = 70 + rng.next() * 50;
      let x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d;
      const f = N.world.findFree ? N.world.findFree(x, y, 'walk', 6) : null;
      if (f) { x = f.x; y = f.y; }
      if (!standOk(x, y, 1)) continue;
      out.entry.push({ x, y });
    }
    if (!out.entry.length) out.entry.push({ x: ox + Math.cos(base) * 60, y: oy + Math.sin(base) * 60 });
    // an extra cart with no room on its customer side turns round once
    if (sp.extra && !sp._flipped && out.ring.length < Math.min(6, K.max)) {
      sp._flipped = true;
      const F2 = sp.frame;
      F2.ax = -F2.ax; F2.ay = -F2.ay; F2.nx = -F2.nx; F2.ny = -F2.ny;
      if (sp.cartE) sp.cartE.angle = Math.atan2(F2.ay, F2.ax);
      return slotsFor(sp);
    }
    sp.slots = out;
    return out;
  }

  /* ================================================================ looks */
  const KHAKI = ['#b9a46a', '#a8925e', '#c2ad78'];
  function styleAt(x, y) { try { const d = N.world.districtAt(x, y); if (!d) return 'colony'; if (d.id === 'osmania') return 'osmania'; return d.style || 'colony'; } catch (e) { return 'colony'; } }
  function lookFor(role, style) {
    const T = N.traffic;
    const base = role === 'auto' ? 'man' : role === 'family' ? (rnd() < 0.6 ? 'aunty' : 'uncle') : role;
    let L = null, spd = 40;
    try { if (T && T.makeLook) { const r = T.makeLook(base, style); L = r.look; spd = r.spd || 40; } } catch (e) { L = null; }
    if (!L) {
      const kind = { office: 'man', uncle: 'uncle', aunty: 'aunty', student: 'student', kid: 'kid', youth: 'man', lungi: 'lungi', woman: 'woman', elder: 'man', old: 'man', college: 'man', police: 'police' }[base] || 'man';
      L = N.people && N.people.randomLook ? N.people.randomLook(null, kind) : { kind: 'man', skin: '#a0683f', shirt: '#e8e0d0', pants: '#3a3a4a' };
    }
    if (role === 'auto') { L = Object.assign({}, L, { kind: 'man', shirt: pick(KHAKI), pants: pick(KHAKI), towel: rnd() < 0.5 ? '#efe6d0' : null, prop: null }); }
    if (L.prop && L.prop !== 'notebook' && L.prop !== 'packet') L = Object.assign({}, L, { prop: null }); // hands free for the food
    return { look: L, spd: clamp(spd, 30, 46) };
  }
  const HOLD_PROP = { steel: 'tray', leaf: 'tray', bowl: 'tray' };
  function holdLook(p) { // a second look object with the plate in the right hand (3D: look.prop 'tray')
    const pr = HOLD_PROP[p.hold];
    if (!pr) return p.look0;
    if (!p.lookH || p.lookH._from !== p.look0) { p.lookH = Object.assign({}, p.look0, { prop: pr }); Object.defineProperty(p.lookH, '_from', { value: p.look0, enumerable: false }); }
    return p.lookH;
  }

  /* ================================================================ barks + sounds */
  let barkT = 0, sfxT = 0;
  const lineOf = (k) => { const l = LINES[k]; return l && l.length ? pick(l) : null; };
  function bark(e, text, o) {
    if (!TUNE.barks || !text || !e || !N.dialogue || !N.dialogue.bark) return false;
    const t = (N.time && N.time.real) || 0, pl = N.player;
    if (!(o && o.force) && t - barkT < TUNE.barkGap) return false;
    if (Math.hypot(e.x - pl.x, e.y - pl.y) > TUNE.barkR) return false;
    if (!is3D() && !N.render.inView(e.x, e.y, 10)) return false;
    try { N.dialogue.bark(e, text, { name: false, blip: false, secs: (o && o.secs) || 2.3 }); } catch (err) { N.err('streetfood.bark', err); return false; }
    barkT = t;
    return true;
  }
  let SFXN = null;
  function hasSfx(name) {
    if (!name) return false;
    const A = N.audio;
    if (!A || !A.sfx) return false;
    if (!SFXN && Array.isArray(A.SFX_NAMES)) SFXN = new Set(A.SFX_NAMES);
    return !SFXN || SFXN.has(name);
  }
  function sound(name, x, y, o) {
    if (!TUNE.sounds || !hasSfx(name)) return false;
    const t = (N.time && N.time.real) || 0;
    if (t - sfxT < TUNE.sfxGap && !(o && o.force)) return false;
    const pl = N.player;
    if (Math.hypot(x - pl.x, y - pl.y) > TUNE.sfxR) return false;
    sfxT = t;
    try { return N.audio.sfx(name, Object.assign({ x, y, vol: 0.55 }, o || {})); } catch (e) { return false; }
  }

  /* ================================================================ people: crowd members */
  const POOL = [];
  const PATRONS = [];
  const BUMP_LINES = ['Arre, dekh ke chalo!', 'Oye! Plate gira dete!', 'Dhyaan se, bachcha!', 'Aaram se, beta.'];
  class Patron extends N.Actor {
    constructor() {
      super({ kind: 'ped', r: 3.3, mass: 1, solid: true });
      this.sf = true; this.amb = true;
      this.anim = { phase: 0, speed: 0, run: false };
      this._fn = (ctx) => drawPatron(ctx, this);
    }
    update(dt) { try { patronUpdate(this, dt); } catch (e) { N.err('streetfood.patron', e); dropPatron(this); } }
    draw() { if (!is3D()) N.render.queue('actors', this.y, this._fn); }
    onBump(other, info) { try { patronBumped(this, other, info); } catch (e) { N.err('streetfood.bump', e); } }
  }
  function newPatron(sc, role, x, y, angle, look, spd) {
    const p = POOL.pop() || new Patron();
    p.id = 0; p.alive = true; p.hidden = false;
    p.sc = sc; p.role = role; p.x = x; p.y = y; p.angle = angle || 0; p.vx = 0; p.vy = 0;
    if (!look) { const L = lookFor(role, sc.style); look = L.look; spd = L.spd; }
    p.look0 = look; p.look = look; p.lookH = null; p.spd = (spd || rr(TUNE.walk[0], TUNE.walk[1])) * pace();
    p.st = 'arrive'; p.t = 0; p.slot = null; p.tgt = null; p.hold = null; p.served = false; p.ordered = false;
    p.eatT = 0; p.biteT = rr(1, 3); p.bite = 0; p.puris = 0; p.chatT = 0; p.chatA = null; p.lookTarget = null; p.lookT = 0; p.lookAt = null;
    p.barkCD = rr(2, 8); p.knockT = 0; p.getupT = 0; p.down = false; p.bumpT = 0; p.umb = null; p.shelter = null; p.prev = null;
    p.ofx = 0; p.ofy = 0; p.stuckT = 0; p.detT = 0; p.detX = 0; p.detY = 0; p.life = 0; p.thinkT = rnd() * 0.15;
    p.lead = null; p.mill = false; p.exit = null; p.stuckN = 0; p.parcel = rnd() < (sc.K.parcel || 0); p.waitT = 0; p.handT = rr(TUNE.handBackAfter[0], TUNE.handBackAfter[1]);
    p.anim.phase = rnd() * TAU; p.anim.speed = 0; p.anim.run = false;
    N.entities.add(p);
    PATRONS.push(p); sc.patrons.push(p);
    return p;
  }
  function dropPatron(p) {
    const sc = p.sc;
    if (sc) {
      const i = sc.patrons.indexOf(p); if (i >= 0) sc.patrons.splice(i, 1);
      const w = sc.waitQ.indexOf(p); if (w >= 0) sc.waitQ.splice(w, 1);
      const q = sc.queue.indexOf(p); if (q >= 0) sc.queue.splice(q, 1);
      if (sc.counterBy === p) sc.counterBy = null;
      if (sc.waiterFor === p) sc.waiterFor = null;
    }
    freeSlot(p);
    if (p.shelter) { p.shelter.taken = null; p.shelter = null; }
    const j = PATRONS.indexOf(p); if (j >= 0) PATRONS.splice(j, 1);
    if (p.alive) N.entities.remove(p);
    p.alive = false; p.sc = null; p.lead = null; p.lookTarget = null; p.lookAt = null;
    if (POOL.length < 64) POOL.push(p);
  }
  function freeSlot(p) { if (p.slot) { if (p.slot.taken === p) p.slot.taken = null; p.slot = null; } }
  function takeSlot(p, list, prefRow) {
    freeSlot(p);
    let best = null, bd = 1e9;
    for (const s of list) {
      if (s.taken) continue;
      const d = (s.row || 0) * 40 + (prefRow != null && s.row !== prefRow ? 25 : 0) + Math.hypot(s.x - p.x, s.y - p.y) * 0.25 + rnd() * 6;
      if (d < bd) { bd = d; best = s; }
    }
    if (best) { best.taken = p; p.slot = best; }
    return best;
  }

  // movement (walkers collide like traffic.js peds; stuck -> a sidestep)
  function integrate(p, dt) {
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    const c = N.world.collide(nx, ny, p.r, 'walk');
    if (!c.bad) {
      if (c.hit && isFinite(c.nx)) { const dot = p.vx * c.nx + p.vy * c.ny; if (dot < 0) { p.vx -= dot * c.nx; p.vy -= dot * c.ny; } }
      p.x = c.x; p.y = c.y;
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
    const a = 1 - Math.exp(-dt * 8);
    p.vx += (vx - p.vx) * a; p.vy += (vy - p.vy) * a;
    const sp = integrate(p, dt);
    if (d > 3 && sp < 5) {
      p.stuckT += dt;
      if (p.stuckT > 1.1) { p.stuckT = 0; p.detT = 0.7; const s = rnd() < 0.5 ? 1 : -1; p.detX = (-dy / d) * s; p.detY = (dx / d) * s; p.stuckN = (p.stuckN || 0) + 1; }
    } else p.stuckT = 0;
    return d;
  }
  function stand(p, face, dt) {
    p.vx *= 0.75; p.vy *= 0.75;
    integrate(p, dt);
    if (face != null && isFinite(face)) p.angle += angDiff(p.angle, face) * Math.min(1, dt * 4);
    p.anim.speed = 0;
    p.anim.phase += dt * 0.4;
  }
  /** stand on a slot (+ the shuffle-aside offset), drifting back when pushed off it */
  function holdSlot(p, s, face, dt) {
    const tx = s.x + p.ofx, ty = s.y + p.ofy;
    const d = Math.hypot(tx - p.x, ty - p.y);
    if (d > 1.6) walkTo(p, tx, ty, p.spd * 0.55, dt, 0.8);
    else stand(p, face, dt);
  }
  function shuffle(p, dt) { // people make room when Chinnu pushes into the crowd
    const pl = N.player;
    if (!pl || pl.vehicle || pl.hidden) { p.ofx *= 1 - dt * 0.6; p.ofy *= 1 - dt * 0.6; return; }
    const dx = p.x - pl.x, dy = p.y - pl.y, d = Math.hypot(dx, dy) || 1;
    const ps = Math.hypot(pl.vx || 0, pl.vy || 0);
    if (d < TUNE.personal && ps > 8 && ((pl.vx || 0) * dx + (pl.vy || 0) * dy) > 0) {
      // step sideways off his line of travel
      const s = (pl.vx * dy - pl.vy * dx) > 0 ? -1 : 1, ux = -(pl.vy / ps) * s, uy = (pl.vx / ps) * s;
      p.ofx = clamp(p.ofx + (ux * 0.7 + dx / d * 0.3) * dt * 14, -5, 5);
      p.ofy = clamp(p.ofy + (uy * 0.7 + dy / d * 0.3) * dt * 14, -5, 5);
      p.lookT = 0.8; p.lookAt = pl;
      if (rnd() < dt * 0.25 && p.barkCD <= 0) { p.barkCD = 12; bark(p, lineOf('player')); }
    } else if (d > TUNE.personal + 6) { p.ofx *= 1 - dt * 0.4; p.ofy *= 1 - dt * 0.4; }
  }
  function patronBumped(p, other, info) {
    if (!other || p.down) return;
    const sp = (info && info.speed) || 0;
    if (other === N.player && sp > 30 && !(p.bumpT > 0)) {
      p.bumpT = 1.2;
      const sx = info.a === p ? -info.nx : info.nx, sy = info.a === p ? -info.ny : info.ny;
      if (sp < 58) { p.lookT = 1.3; p.lookAt = N.player; p.vx = sx * 26; p.vy = sy * 26; if (rnd() < 0.3) bark(p, pick(BUMP_LINES)); return; }
      p.knockT = clamp(0.4 + sp / 200, 0.6, 1.0); p.vx = sx * sp * 0.5; p.vy = sy * sp * 0.5;
      if (p.hold && rnd() < 0.5) p.hold = null; // the plate goes flying
      N.emit('ped:knocked', { ped: p, by: N.player, speed: sp });
    }
  }

  function faceOf(sc) { const v = sc.vendor || null; const S = sc.sl.stove; return (x, y) => Math.atan2(((v && !v.hidden) ? v.y : S ? S.y : sc.F.cy) - y, ((v && !v.hidden) ? v.x : S ? S.x : sc.F.cx) - x); }

  function patronUpdate(p, dt) {
    p.life += dt; p.t += dt;
    if (p.barkCD > 0) p.barkCD -= dt;
    if (p.bumpT > 0) p.bumpT -= dt;
    if (p.lookT > 0) p.lookT -= dt;
    if (p.knockT > 0) { // knocked over (vehicles.js / a running kid)
      p.down = true; p.knockT -= dt;
      const f = Math.exp(-dt * 7); p.vx *= f; p.vy *= f; integrate(p, dt); p.anim.speed = 0;
      if (p.knockT <= 0) p.getupT = 0.7;
      return;
    }
    if (p.getupT > 0) {
      p.getupT -= dt; p.vx = p.vy = 0;
      if (p.getupT <= 0) { p.down = false; bark(p, pick(BUMP_LINES), { force: true }); p.lookT = 1.2; p.lookAt = N.player; }
      return;
    }
    const sc = p.sc;
    if (!sc || !sc.on) { leaveStep(p, dt, null); return; }
    const K = sc.K, sl = sc.sl;
    p.thinkT -= dt;
    const think = p.thinkT <= 0;
    if (think) p.thinkT = TUNE.think + rnd() * 0.06;
    // a follower (the kid with Amma) keeps to the leader
    if (p.lead) {
      const L = p.lead;
      if (!L.alive || L.sc !== sc) { p.lead = null; if (p.st !== 'leave') p.st = 'leave'; }
      else {
        if (L.st === 'leave' && p.st !== 'leave') { p.st = 'leave'; p.exit = L.exit; }
        if (L.hold && !p.hold && L.st === 'eat') { p.hold = L.hold; p.look = holdLook(p); p.eatT = L.eatT; }
        if (p.st !== 'leave') {
          const a = L.angle + PI / 2 * (p.side || 1), tx = L.x + Math.cos(a) * 4.6 - Math.cos(L.angle) * 1.2, ty = L.y + Math.sin(a) * 4.6 - Math.sin(L.angle) * 1.2;
          const d = Math.hypot(tx - p.x, ty - p.y);
          if (d > 1.8) walkTo(p, tx, ty, Math.max(p.spd, L.spd) * (d > 8 ? 1.2 : 0.7), dt, 1); else stand(p, faceOf(sc)(p.x, p.y), dt);
          if (p.hold) eatAnim(p, dt);
          p.umb = sc.rain > 0.15 && !p.shelter ? (L.umb ? null : p.umb) : null;
          return;
        }
      }
    }
    if (think) rainCheck(p, sc);
    switch (p.st) {
      case 'arrive': {
        if (!p.slot) {
          if (K.queue && sc.queue.length < sl.queue.length) { p.st = 'queue'; p.t = 0; if (sc.queue.indexOf(p) < 0) sc.queue.push(p); break; }
          if (!takeSlot(p, sl.ring)) { p.st = 'leave'; break; }
          if (K.queue) { p.mill = true; p.eatT = rr(15, 40); } // the queue is full: hang about, chat, give up
        }
        const d = walkTo(p, p.slot.x, p.slot.y, p.spd, dt, 1.2);
        if (d < 2.2 || (p.t > 30 && d < 8)) {
          p.t = 0;
          if (K.vendor && K.vendor.work === 'waiter') { p.st = 'wait'; sc.waitQ.push(p); }
          else if (p.hold || p.mill) { p.st = 'eat'; }
          else { p.st = 'wait'; sc.waitQ.push(p); }
        } else if (p.t > 45) p.st = 'leave';
        break;
      }
      case 'wait': {
        shuffle(p, dt);
        if (p.slot) holdSlot(p, p.slot, chatFace(p, sc, dt, think), dt); else stand(p, null, dt);
        p.waitT += dt;
        if (K.vendor && K.vendor.work === 'waiter') { // the waiter comes to you
          if (p.served) { p.served = false; p.st = 'eat'; p.t = 0; }
          if (p.waitT > 60) { p.st = 'leave'; bark(p, 'Arre, chai kab aayegi?'); }
          break;
        }
        if (sc.waitQ[0] === p && !sc.counterBy) { sc.waitQ.shift(); sc.counterBy = p; p.st = 'order'; p.t = 0; }
        else if (p.waitT > 75) { p.st = 'leave'; }
        break;
      }
      case 'order': {
        const c = sl.counter;
        const d = walkTo(p, c.x, c.y, p.spd * 0.8, dt, 1);
        if (d < 2.2) {
          stand(p, faceOf(sc)(p.x, p.y), dt);
          if (!p.ordered) {
            p.ordered = true;
            const text = lineOf(K.orders);
            if (text && rnd() < TUNE.orderBark && p.barkCD <= 0) { p.barkCD = 10; bark(p, text); }
            N.emit('streetfood:order', { id: sc.spot.id, ped: p, text });
          }
        }
        if (p.served) {
          p.served = false; sc.counterBy = null;
          sound(K.sounds && K.sounds.pay, p.x, p.y, { vol: 0.35 });
          if (p.parcel || !K.hold) { p.st = 'leave'; p.hold = K.hold ? 'parcel' : 'parcel'; p.look = p.look0; p.t = 0; break; }
          p.hold = K.hold; p.look = holdLook(p);
          p.eatT = rr(K.eat[0], K.eat[1]) * (sc.rain > 0.2 ? 0.7 : 1);
          if (K.tight) p.puris = 0;
          // back to the ring to eat (an outer slot when the inner one has filled)
          if (!p.slot || rnd() < 0.5) takeSlot(p, sl.ring, 1) || takeSlot(p, sl.ring);
          p.st = 'eat'; p.t = 0;
        } else if (p.t > 30) { sc.counterBy = null; p.st = 'leave'; bark(p, 'Arre, kitna time, anna!'); }
        break;
      }
      case 'eat': {
        shuffle(p, dt);
        if (p.slot) holdSlot(p, p.slot, chatFace(p, sc, dt, think), dt); else stand(p, null, dt);
        if (!K.tight || p.puris >= 6) p.eatT -= dt;
        eatAnim(p, dt);
        if (p.eatT <= 0 || p.t > 150) {
          p.t = 0;
          if ((p.hold === 'steel' || p.hold === 'glass' || p.hold === 'bowl') && sl.ret) { p.st = 'return'; }
          else { p.hold = null; p.look = p.look0; p.st = 'leave'; }
        }
        break;
      }
      case 'return': { // the steel plate / chai glass goes back to the cart
        const r = sl.ret;
        const d = walkTo(p, r.x, r.y, p.spd * 0.8, dt, 1.2);
        if (d < 2.4 || p.t > 14) { sound(p.hold === 'glass' ? 'cup_clink' : 'plates', p.x, p.y, { vol: 0.3 }); p.hold = null; p.look = p.look0; p.st = 'leave'; p.t = 0; }
        break;
      }
      case 'queue': {
        const i = sc.queue.indexOf(p);
        if (i < 0) { p.st = 'leave'; break; }
        const s = sl.queue[Math.min(i, sl.queue.length - 1)];
        const ahead = i > 0 ? sc.queue[i - 1] : null;
        const fa = ahead ? Math.atan2(ahead.y - p.y, ahead.x - p.x) : faceOf(sc)(p.x, p.y);
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d > 1.6) walkTo(p, s.x, s.y, p.spd * (p.t < 3 ? 1 : 0.6), dt, 0.8); else stand(p, fa, dt);
        if (think && rnd() < 0.004 && p.barkCD <= 0) { p.barkCD = 20; bark(p, lineOf(K.orders)); }
        if (p.served) {
          p.served = false; sc.queue.splice(i, 1); p.hold = 'parcel';
          sound('coin', p.x, p.y, { vol: 0.3 });
          p.st = rnd() < 0.4 && sl.door ? 'inside' : 'leave'; p.t = 0;
        } else if (p.t > 140) { sc.queue.splice(i, 1); p.st = 'leave'; }
        break;
      }
      case 'inside': { // into the restaurant to eat (despawns at the door)
        const d = walkTo(p, sl.door.x, sl.door.y, p.spd * 0.8, dt, 1.4);
        if (d < 2.5 || p.t > 20) dropPatron(p);
        break;
      }
      case 'shelter': {
        if (p.shelter) holdSlot(p, p.shelter, faceOf(sc)(p.x, p.y), dt); else stand(p, null, dt);
        if (p.hold) eatAnim(p, dt);
        if (p.hold && (!K.tight || p.puris >= 6)) { p.eatT -= dt; if (p.eatT <= 0) { p.hold = null; p.look = p.look0; } }
        break;
      }
      case 'leave': leaveStep(p, dt, sc); break;
      default: p.st = 'leave';
    }
  }
  function chatFace(p, sc, dt, think) {
    if (p.chatT > 0) { p.chatT -= dt; if (p.chatT <= 0) { p.chatA = null; p.lookTarget = null; } }
    else if (think && rnd() < 0.025) {
      let best = null, bd = 10;
      for (const q of sc.patrons) { if (q === p || q.st === 'arrive' || q.st === 'leave' || q.down) continue; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q; } }
      if (best) {
        p.chatT = rr(2.5, 6); p.chatA = Math.atan2(best.y - p.y, best.x - p.x); p.lookTarget = best;
        if (!(best.chatT > 0)) { best.chatT = p.chatT; best.chatA = p.chatA + PI; best.lookTarget = p; }
        if (rnd() < TUNE.chatBark && p.barkCD <= 0) { p.barkCD = 14; const kid = p.role === 'kid' || p.role === 'student' || (p.look0 && (p.look0.kind === 'kid' || p.look0.kind === 'student')); bark(p, kid ? lineOf('kidChat') : (sc.K.chat && rnd() < 0.5) ? lineOf(sc.K.chat) : lineOf('chat')); }
      }
    }
    if (p.chatA != null) return p.chatA;
    return p.slot && isFinite(p.slot.a) ? p.slot.a : faceOf(sc)(p.x, p.y);
  }
  function eatAnim(p, dt) {
    p.biteT -= dt;
    if (p.biteT <= 0) { p.bite = 1; p.biteT = p.hold === 'glass' ? rr(2.8, 5) : p.hold === 'leaf' && p.sc && p.sc.K.tight ? 9 : rr(1.6, 3.6); if (p.hold === 'glass' && rnd() < 0.2) sound('sip', p.x, p.y, { vol: 0.25 }); }
    if (p.bite > 0) p.bite = Math.max(0, p.bite - dt * 1.5);
  }
  function rainCheck(p, sc) {
    const K = sc.K, sl = sc.sl;
    if (sc.rain > 0.15) {
      if (!p.shelter && (p.st === 'wait' || p.st === 'eat') && sl.shelter.length) {
        const s = sl.shelter.find((q) => !q.taken);
        if (s) { s.taken = p; p.shelter = s; p.prev = p.st; p.st = 'shelter'; p.umb = null; if (rnd() < 0.15) bark(p, lineOf('rain')); return; }
      }
      if (!p.shelter && !p.umb && p.st !== 'shelter' && rnd() < (p.role === 'kid' || p.role === 'student' ? 0.25 : 0.7)) p.umb = pick(['#1a1a22', '#1a1a22', '#2a2a6a', '#6a1a2a', '#2a5a3a']);
    } else if (sc.rain < 0.08) {
      p.umb = null;
      if (p.st === 'shelter') { if (p.shelter) p.shelter.taken = null; p.shelter = null; p.st = p.hold ? 'eat' : (p.prev === 'wait' ? 'wait' : 'eat'); if (p.st === 'wait' && sc.waitQ.indexOf(p) < 0) sc.waitQ.push(p); if (p.st === 'eat' && !p.hold) p.st = 'leave'; }
    }
    if (p.st === 'shelter' && p.prev === 'wait' && !p.hold && sc.waitQ.indexOf(p) < 0 && !sc.counterBy) {
      // still hungry under the tarp: order from there
      sc.counterBy = p; p.st = 'order'; p.t = 0; if (p.shelter) { p.shelter.taken = null; p.shelter = null; }
    }
    void K;
  }
  function leaveStep(p, dt, sc) {
    freeSlot(p);
    if (p.shelter) { p.shelter.taken = null; p.shelter = null; }
    if (!p.exit) {
      const E = sc && sc.sl ? sc.sl.entry : null;
      p.exit = E && E.length ? E[(rnd() * E.length) | 0] : { x: p.x + Math.cos(p.angle) * 80, y: p.y + Math.sin(p.angle) * 80 };
      p.t = 0;
    }
    const d = walkTo(p, p.exit.x, p.exit.y, p.spd, dt, 2);
    const pl = N.player;
    const far = Math.hypot(p.x - pl.x, p.y - pl.y);
    const hidden = is3D() ? far > 140 : !N.render.inView(p.x, p.y, 12);
    if (hidden && (p.t > 1.5 || d < 4)) { dropPatron(p); return; }
    // walked clear of the crowd: hand back to traffic.js as an ordinary walker
    if (TUNE.handBack && p.t > 2.5 && sc && Math.hypot(p.x - sc.spot.x, p.y - sc.spot.y) > 24 && !p.lead && handBack(p)) return;
    if (d < 4 || p.t > 35) { if (hidden || p.t > 60) dropPatron(p); else { p.exit = { x: p.x + (p.exit.x - (sc ? sc.spot.x : p.x)) * 0.6, y: p.y + (p.exit.y - (sc ? sc.spot.y : p.y)) * 0.6 }; } }
  }
  const TRAFFIC_ROLE = { auto: 'man', family: 'aunty' };
  function handBack(p) {
    const T = N.traffic;
    if (!T || !T.spawnPed || T.enabled === false) return false;
    try {
      const caps = lowTier() ? 32 : 45;
      if ((T.peds || []).length >= caps + 4) return false;
      const look = p.look0;
      const q = T.spawnPed(TRAFFIC_ROLE[p.role] || p.role, { x: p.x, y: p.y, look });
      if (!q) return false;
      q.angle = p.angle; q.vx = p.vx; q.vy = p.vy;
      if (p.umb) q.umb = p.umb;
      dropPatron(p);
      ST.handedBack++;
      return true;
    } catch (e) { N.err('streetfood.handBack', e); return false; }
  }
  /** take a passing traffic.js walker into the crowd (same look, same spot: no pop) */
  function recruit(sc) {
    const T = N.traffic;
    if (!T || !T.peds || !T.clear) return null;
    const R = TUNE.recruitR, x0 = sc.spot.x, y0 = sc.spot.y;
    const roles = sc.roles;
    let best = null, bd = R;
    for (const q of T.peds) {
      if (!q.alive || q.down || q.mode !== 'walk' || q.zone || q.spotter || q.hold || q.cart || q.balloons || q.boardV || q.constable || q.knockT > 0) continue;
      const d = Math.hypot(q.x - x0, q.y - y0);
      if (d > bd) continue;
      if (roles && q.role && !(roles[q.role] > 0) && !(q.role === 'man' && roles.auto) && rnd() < 0.7) continue;
      bd = d; best = q;
    }
    if (!best) return null;
    const q = best, look = q.look;
    try { T.clear((e) => e === q); } catch (e) { return null; }
    const p = newPatron(sc, q.role || 'man', q.x, q.y, q.angle, look, q.spd);
    ST.recruited++;
    p.vx = q.vx || 0; p.vy = q.vy || 0; p.umb = q.umb || null;
    return p;
  }

  /* ================================================================ vendors */
  const VENDORS = [];
  class Vendor extends N.Actor {
    constructor(sc, spec, at) {
      super({ kind: 'ped', r: 3.3, mass: 60, solid: true, fixed: true });
      this.sf = true; this.vendor = true; this.view3d = 'sf:vendor';
      this.sc = sc; this.work = spec.work; this.hide2d = !!spec.hide2d;
      const L = lookFor(spec.role || 'man', sc.style);
      this.look = Object.assign({}, L.look, spec.look || {});
      if (this.work === 'waiter') this.look.prop = 'tray'; else if (this.look.prop) this.look.prop = null;
      this.home = { x: at.x, y: at.y, a: at.a };
      this.x = at.x; this.y = at.y; this.angle = at.a; this.facing = at.a;
      this.anim = { phase: 0, speed: 0, run: false };
      this.prog = PROG[this.work] || PROG.idle;
      this.pi = 0; this.k = 0; this.ph = this.prog[0][0]; this.cyc = 0; this.busy = false; this.idleT = rr(0, 2);
      this.dosa = { r: 0, brown: 0, fold: 0, oil: 0, on: false, fill: 0 };
      this.batch = 0; this.pour = 0; this.fan = 0; this.lift = 0; this.servePl = 0; this.handTo = null; this.target = null;
      this.hands = { r: { x: at.x, y: at.y, h: 5 }, l: { x: at.x, y: at.y, h: 5 }, tool: null, tip: null };
      this._fn = (ctx) => drawVendor(ctx, this);
    }
    update(dt) { try { vendorUpdate(this, dt); } catch (e) { N.err('streetfood.vendor', e); } }
    draw() { if (!is3D() && !this.hide2d && !this.hidden) N.render.queue('actors', this.y, this._fn); }
  }
  // work programs: [phase, seconds]; 'serve' hands the food over
  const PROG = {
    dosa: [['scoop', 0.7], ['pour', 0.45], ['spread', 2.1], ['oil', 0.8], ['cook', 2.3], ['fold', 0.9], ['serve', 0.9], ['wipe', 0.8]],
    fry: [['drop', 0.9], ['fry', 2.6], ['stir', 1.2], ['lift', 0.9], ['serve', 0.8]],
    chai: [['boil', 1.4], ['pour', 1.7], ['pour2', 0.9], ['serve', 0.8]],
    bhutta: [['fan', 2.4], ['turn', 0.9], ['fan', 1.4], ['rub', 0.9], ['serve', 0.8]],
    panipuri: [['crack', 0.5], ['fill', 0.55], ['serve', 0.6]],
    chaat: [['mix', 2.0], ['plate', 0.9]],
    coconut: [['pick', 0.6], ['chop', 1.5], ['straw', 0.5], ['serve', 0.8]],
    gola: [['shave', 1.8], ['shape', 0.7], ['syrup', 0.8], ['serve', 0.7]],
    banana: [['pick', 0.8], ['tear', 0.5], ['serve', 0.8]],
    flower: [['string', 2.2], ['measure', 0.9], ['serve', 0.8]],
    haleem: [['pound', 2.8], ['ladle', 0.9], ['serve', 0.8]],
    counter: [['pack', 2.2], ['serve', 0.8]],
    waiter: [['tray', 1]],
    idle: [['idle', 2]],
  };
  // the idle loop when nobody is waiting (the kadai keeps frying, the deg keeps getting pounded...)
  const IDLE = { dosa: 'wait', fry: 'fry', chai: 'boil', bhutta: 'fan', panipuri: 'wait', chaat: 'mix', coconut: 'wait', gola: 'wait', banana: 'wait', flower: 'string', haleem: 'pound', counter: 'wait', waiter: 'wait' };
  function vendorUpdate(v, dt) {
    const sc = v.sc;
    if (!sc || !sc.on) return;
    // a story NPC working this cart (e.g. M8's dosa_man) takes over: ours steps out of sight
    v.npcT = (v.npcT || 0) - dt;
    if (v.npcT <= 0) { v.npcT = 1.5; v.hidden = !!N.entities.query(v.home.x, v.home.y, 14, (e) => e.kind === 'npc' && !e.hidden).length; v.solid = !v.hidden; }
    // the per-view home (the 3D cart model may have its stove at the other end)
    const h = is3D() && sc.sl.vendor3 ? sc.sl.vendor3 : v.home;
    if (v.work !== 'waiter' && (Math.abs(v.x - h.x) > 0.01 || Math.abs(v.y - h.y) > 0.01)) { v.x = h.x; v.y = h.y; }
    const want = vendorBusy(v, sc);
    if (v.work === 'waiter') { waiterStep(v, sc, dt); computeHands(v, sc); return; }
    if (v.servePl > 0) { v.servePl -= dt; v.ph = 'servePl'; v.k = 1 - v.servePl / 1.2; computeHands(v, sc); faceTo(v, N.player.x, N.player.y, dt); return; }
    if (!v.busy && want) { v.busy = true; v.pi = 0; v.k = 0; v.cyc = 0; enterPhase(v, sc, v.prog[0][0]); }
    if (v.busy) {
      const P = v.prog[v.pi];
      v.k += dt / P[1];
      if (v.k >= 1) {
        v.k = 0; v.pi++;
        if (v.pi >= v.prog.length) { v.pi = 0; v.cyc++; if (!vendorBusy(v, sc)) { v.busy = false; v.idleT = rr(1.5, 4); } }
        if (v.busy) enterPhase(v, sc, v.prog[v.pi][0]);
      }
      if (v.busy) v.ph = v.prog[v.pi][0];
    }
    if (!v.busy) { v.ph = IDLE[v.work] || 'wait'; v.k = (v.k + dt / 2.4) % 1; v.idleT -= dt; }
    phaseTick(v, sc, dt);
    computeHands(v, sc);
    // face the customers, glance at the pan
    const fa = h.a + (v.ph === 'pour2' || v.ph === 'turn' ? 0.4 : 0);
    v.angle += angDiff(v.angle, fa) * Math.min(1, dt * 5); v.facing = v.angle;
    // calls now and then
    v.callT = (v.callT || rr(5, 12)) - dt;
    if (v.callT <= 0) { v.callT = rr(10, 22); if (sc.patrons.length < 3 || rnd() < 0.4) bark(v, lineOf(sc.K.vlines)); if (rnd() < 0.5) sound('vendor_call', v.x, v.y, { vol: 0.35, variant: { chai: 'chai', bhutta: 'bhutta', banana: 'banana', flower: 'flower', fry: 'chai' }[v.work] }); }
    // greet Chinnu when he comes to the counter
    const pl = N.player, dp = Math.hypot(pl.x - v.x, pl.y - v.y);
    if (dp < 16 && !pl.vehicle && !(v.greetT > 0)) { v.greetT = 30; if (rnd() < 0.6) bark(v, pick(['Kya chahiye, beta?', 'Haan bachcha, bolo!', 'Aao beta, kya doon?'])); }
    if (v.greetT > 0 && dp > 30) v.greetT -= dt;
  }
  function faceTo(v, x, y, dt) { v.angle += angDiff(v.angle, Math.atan2(y - v.y, x - v.x)) * Math.min(1, dt * 6); v.facing = v.angle; }
  function vendorBusy(v, sc) {
    if (v.work === 'chaat') return sc.patrons.length > 2;
    if (v.work === 'panipuri' && sc.K.tight) return sc.patrons.some((p) => p.st === 'eat' && p.hold === 'leaf' && p.puris < 6) || !!sc.counterBy;
    if (v.work === 'panipuri') return !!sc.counterBy || sc.waitQ.length > 0 || sc.patrons.length > 4;
    if (v.work === 'counter') return sc.queue.length > 0;
    return !!sc.counterBy || sc.waitQ.length > 0 || (v.work === 'dosa' && sc.patrons.length > 3 && rnd() < 0.002);
  }
  function enterPhase(v, sc, ph) {
    const K = sc.K, S = stoveOf(sc);
    if (v.work === 'dosa') {
      const D = v.dosa;
      if (ph === 'pour') { D.on = true; D.r = 0.12; D.brown = 0; D.fold = 0; D.oil = 0; D.fill = 0; burst(sc, S, 1); sound(K.sounds.cook, S.x, S.y, { vol: 0.5 }); }
      if (ph === 'wipe') { burst(sc, S, 0.5); sound('sizzle', S.x, S.y, { vol: 0.3 }); }
    }
    if (v.work === 'fry' && ph === 'drop') { v.batch = 1; burst(sc, S, 0.8); sound('sizzle', S.x, S.y, { vol: 0.5 }); }
    if (v.work === 'chai' && ph === 'pour') sound('cup_clink', S.x, S.y, { vol: 0.3 });
    if (v.work === 'coconut' && ph === 'chop') sound('coconut_chop', S.x, S.y, { vol: 0.5 });
    // a queue: idli-vada plates go out from the steamer while the dosa cooks; two chai glasses per pour
    if ((v.work === 'dosa' && ph === 'cook' || v.work === 'chai' && ph === 'pour2' || v.work === 'fry' && ph === 'stir') && sc.waitQ.length >= 2) serve(v, sc);
    if (v.work === 'bhutta' && ph === 'fan') v.fan = 1;
    if (ph === 'serve') serve(v, sc);
  }
  function phaseTick(v, sc, dt) {
    const D = v.dosa, k = v.k;
    if (v.work === 'dosa') {
      if (v.ph === 'spread') D.r = Math.max(D.r, 0.12 + 0.88 * smooth(k));
      else if (v.ph === 'oil') D.oil = Math.max(D.oil, k);
      else if (v.ph === 'cook') { D.brown = Math.max(D.brown, k); if (rnd() < dt * 0.6) D.fill = 1; }
      else if (v.ph === 'fold') D.fold = Math.max(D.fold, smooth(k));
      else if (v.ph === 'serve') { D.lift = k; }
      else if (v.ph === 'wipe' || v.ph === 'scoop') { if (D.on && (v.ph === 'scoop' || k > 0.2)) { D.on = false; D.lift = 0; } }
      if (D.on && D.r > 0.3) D.brown = Math.min(1, D.brown + dt * 0.04);
    } else if (v.work === 'fry') { if (v.ph === 'lift') v.lift = k; else if (v.ph !== 'serve') v.lift = 0; }
    else if (v.work === 'chai') v.pour = v.ph === 'pour' ? smooth(Math.min(1, k * 3)) * (k < 0.92 ? 1 : 0) : v.ph === 'pour2' ? 0.6 : 0;
    else if (v.work === 'bhutta') { if (v.ph === 'fan') { v.fan = 1; if (rnd() < dt * 9) sparks(sc, stoveOf(sc), 1); } else v.fan *= 1 - dt * 3; }
  }
  /** hand the food to whoever is at the counter (or the next pani-puri eater / queue head) */
  function serve(v, sc) {
    const K = sc.K;
    let to = null;
    if (v.work === 'counter') { to = sc.queue[0] || null; }
    else if (v.work === 'panipuri' && K.tight) {
      if (sc.counterBy && Math.hypot(sc.counterBy.x - sc.sl.counter.x, sc.counterBy.y - sc.sl.counter.y) < 4) to = sc.counterBy; // a fresh leaf bowl
      else {
        // one puri to the next eater, round the ring
        const eaters = sc.patrons.filter((p) => p.st === 'eat' && p.hold === 'leaf' && p.puris < 6);
        if (eaters.length) { v.rr = ((v.rr || 0) + 1) % eaters.length; const e = eaters[v.rr]; e.puris++; e.bite = 1; v.handTo = e; if (e.puris === 6) e.eatT = Math.min(e.eatT, rr(1.5, 4)); if (rnd() < 0.08) bark(e, lineOf(K.orders)); }
        sound('munch', v.x, v.y, { vol: 0.25 });
        return;
      }
    } else if (sc.counterBy && Math.hypot(sc.counterBy.x - sc.sl.counter.x, sc.counterBy.y - sc.sl.counter.y) < 4.5) to = sc.counterBy;
    if (!to) return;
    to.served = true; v.handTo = to; ST.served++;
    sound(K.sounds && K.sounds.serve, v.x, v.y, { vol: 0.4 });
    N.emit('streetfood:serve', { id: sc.spot.id, to });
  }
  function waiterStep(v, sc, dt) {
    // door -> a waiting customer -> serve -> door
    const door = sc.sl.door || v.home;
    if (!v.target && sc.waitQ.length) { v.target = sc.waitQ.shift(); v.ph = 'go'; }
    const tg = v.target;
    let tx = door.x, ty = door.y, sp = 30;
    if (tg) {
      if (!tg.alive || tg.st !== 'wait' || tg.sc !== sc) { v.target = null; }
      else { tx = tg.x + Math.cos(tg.angle) * 5; ty = tg.y + Math.sin(tg.angle) * 5; }
    }
    const dx = tx - v.x, dy = ty - v.y, d = Math.hypot(dx, dy);
    if (d > 1.5) {
      const s = Math.min(sp, d * 4), nx = v.x + (dx / d) * s * dt, ny = v.y + (dy / d) * s * dt;
      const c = N.world.collide(nx, ny, v.r, 'walk');
      if (!c.bad) { v.vx = (c.x - v.x) / dt; v.vy = (c.y - v.y) / dt; v.x = c.x; v.y = c.y; }
      v.angle += angDiff(v.angle, Math.atan2(dy, dx)) * Math.min(1, dt * 8); v.facing = v.angle;
      v.anim.speed = Math.min(1, s / 45); v.anim.phase += s * dt * 0.26; v.ph = 'walk';
    } else {
      v.vx = v.vy = 0; v.anim.speed = 0;
      if (tg && v.target) { v.k += dt; v.ph = 'serve'; faceTo(v, tg.x, tg.y, dt); if (v.k > 0.9) { tg.served = true; v.k = 0; v.target = null; sound('cup_clink', v.x, v.y, { vol: 0.4 }); if (rnd() < 0.3) bark(v, lineOf(sc.K.vlines)); } }
      else { v.ph = 'wait'; v.angle += angDiff(v.angle, door.a != null ? door.a : fang(sc.F)) * Math.min(1, dt * 3); v.facing = v.angle; }
    }
  }
  /** the working hands in world space {x, y, h} (both views draw arms / tools to these) */
  function computeHands(v, sc) {
    const S = stoveOf(sc), H = v.hands, ph = v.ph, k = v.k, t = simT();
    const fwd = Math.cos(v.angle), fwy = Math.sin(v.angle), rx = -fwy, ry = fwd; // right of the facing
    const at = (o, x, y, h) => { o.x = x; o.y = y; o.h = h; return o; };
    const rest = (o, s) => at(o, v.x + fwd * 1.6 + rx * 2.6 * s, v.y + fwy * 1.6 + ry * 2.6 * s, 4.2);
    rest(H.r, 1); rest(H.l, -1); H.tool = null; H.tip = null;
    if (!S) return;
    const sx = S.x, sy = S.y, sh = S.h;
    const F = sc.F, ax = F.ax, ay = F.ay;
    const W = v.work;
    if (ph === 'servePl') { const p = N.player; at(H.r, lerp(sx, p.x, smooth(k)), lerp(sy, p.y, smooth(k)), sh + 1); H.tool = W === 'chai' ? 'glass' : W === 'dosa' ? 'plate' : 'plate'; return; }
    switch (W) {
      case 'dosa': {
        const R = DOSA_R;
        if (ph === 'scoop') { const bx = sx - ax * 3.4 - F.nx * 1.2, by = sy - ay * 3.4 - F.ny * 1.2; at(H.r, bx, by, sh + 1.2 - Math.sin(k * PI) * 1.2); H.tool = 'ladle'; }
        else if (ph === 'pour') { at(H.r, sx, sy, sh + 2.4 - k); H.tool = 'ladle'; }
        else if (ph === 'spread') { const a = k * TAU * 2.2, r = R * (0.15 + 0.75 * k); at(H.r, sx + Math.cos(a) * r, sy + Math.sin(a) * r, sh + 0.9); H.tool = 'ladle'; }
        else if (ph === 'oil') { const a = k * TAU; at(H.r, sx + Math.cos(a) * R * 0.75, sy + Math.sin(a) * R * 0.75, sh + 2); H.tool = 'oil'; }
        else if (ph === 'cook') { at(H.r, sx + rx * R * 0.9, sy + ry * R * 0.9, sh + 1); at(H.l, sx - ax * (R + 1.2), sy - ay * (R + 1.2), sh + 0.4); H.tool = 'spatula'; }
        else if (ph === 'fold') { const u = lerp(-R, R * 0.2, smooth(k)); at(H.r, sx + ax * u, sy + ay * u, sh + 0.8 + Math.sin(k * PI) * 0.8); H.tool = 'spatula'; }
        else if (ph === 'serve') { const c = sc.sl.counter; at(H.r, lerp(sx, c.x, smooth(k) * 0.8), lerp(sy, c.y, smooth(k) * 0.8), sh + 1 + Math.sin(k * PI)); H.tool = 'plate'; }
        else if (ph === 'wipe') { const s = Math.sin(k * TAU * 3) * R * 0.8; at(H.r, sx + ax * s, sy + ay * s, sh + 0.5); H.tool = 'cloth'; }
        else { at(H.r, sx + rx * (R + 0.5), sy + ry * (R + 0.5), sh + 0.6); H.tool = 'ladle'; }
        break;
      }
      case 'fry': {
        if (ph === 'drop') { const bx = sx - ax * 4, by = sy - ay * 4; at(H.r, lerp(bx, sx, smooth(k)), lerp(by, sy, smooth(k)), sh + 1.4 + Math.sin(k * PI)); H.tool = 'samosas'; }
        else if (ph === 'fry' || ph === 'stir') { const a = t * (ph === 'stir' ? 7 : 3.5), r = 1.1; at(H.r, sx + Math.cos(a) * r, sy + Math.sin(a) * r, sh + 1.2); H.tool = 'jhara'; }
        else if (ph === 'lift') { const bx = sx - ax * 4, by = sy - ay * 4; at(H.r, lerp(sx, bx, smooth(k)), lerp(sy, by, smooth(k)), sh + 1.6 + Math.sin(k * PI) * 1.4); H.tool = 'jhara'; }
        else if (ph === 'serve') { const c = sc.sl.counter; at(H.r, lerp(sx, c.x, k * 0.8), lerp(sy, c.y, k * 0.8), sh); H.tool = 'cone'; }
        break;
      }
      case 'chai': {
        if (ph === 'boil') { at(H.l, sx - rx * 1.6, sy - ry * 1.6, sh - 0.4); at(H.r, sx + rx * 1.2, sy + ry * 1.2, sh - 0.6); H.tool = 'spoon'; }
        else if (ph === 'pour') { const up = smooth(Math.min(1, k * 2.5)); at(H.r, sx + rx * 1.8, sy + ry * 1.8, sh + 0.5 + up * 4.8); at(H.l, sx + rx * 1.8 + fwd * 1.4, sy + ry * 1.8 + fwy * 1.4, sh - 2.4); H.tool = 'pan'; H.tip = 'stream'; }
        else if (ph === 'pour2') { const s = Math.sin(k * TAU * 1.5); at(H.r, sx + rx * 1.6, sy + ry * 1.6, sh + 1.6 + s * 1.5); at(H.l, sx - rx * 1.2, sy - ry * 1.2, sh - 1.4 - s); H.tool = 'pan'; H.tip = 'stream'; }
        else if (ph === 'serve') { const c = sc.sl.counter; at(H.r, lerp(sx, c.x, smooth(k) * 0.8), lerp(sy, c.y, smooth(k) * 0.8), sh - 2.5); H.tool = 'glass'; }
        break;
      }
      case 'bhutta': {
        if (ph === 'fan') { const s = Math.sin(t * 17) * 1.6; at(H.r, sx + rx * s + fwd * -0.6, sy + ry * s + fwy * -0.6, sh + 1.8); H.tool = 'fan'; at(H.l, sx - ax * 2.2, sy - ay * 2.2, sh + 0.6); }
        else if (ph === 'turn') { at(H.l, sx + Math.sin(k * TAU) * 1.2 * ax, sy + Math.sin(k * TAU) * 1.2 * ay, sh + 0.7); H.tool = 'fan'; at(H.r, sx + rx * 2.4, sy + ry * 2.4, sh + 0.4); }
        else if (ph === 'rub') { const a = t * 9; at(H.r, sx + ax * 1.4 + Math.cos(a) * 0.5, sy + ay * 1.4 + Math.sin(a) * 0.5, sh + 1.6); H.tool = 'lemon'; }
        else if (ph === 'serve') { const c = sc.sl.counter; at(H.r, lerp(sx, c.x, k * 0.8), lerp(sy, c.y, k * 0.8), sh + 0.6); H.tool = 'cob'; }
        break;
      }
      case 'panipuri': {
        const pot = S;
        if (ph === 'crack') { at(H.l, pot.x + rx * 1.1, pot.y + ry * 1.1, sh + 0.8); at(H.r, pot.x + rx * 0.8, pot.y + ry * 0.8, sh + 1.5 - k); H.tool = 'puri'; }
        else if (ph === 'fill') { at(H.r, pot.x, pot.y, sh - 0.6 + Math.abs(Math.sin(k * PI)) * 0.4); H.tool = 'puri'; }
        else if (ph === 'serve') { const e = v.handTo && v.handTo.alive ? v.handTo : null; const tx = e ? e.x + Math.cos(e.angle) * 2.6 : v.x + fwd * 5, ty = e ? e.y + Math.sin(e.angle) * 2.6 : v.y + fwy * 5; at(H.r, lerp(pot.x, tx, Math.sin(k * PI) * 0.75), lerp(pot.y, ty, Math.sin(k * PI) * 0.75), sh); H.tool = 'puri'; }
        else { at(H.r, v.x + fwd * 3 + rx * 1.6, v.y + fwy * 3 + ry * 1.6, sh - 0.6); }
        break;
      }
      case 'chaat': { const a = t * 5; at(H.r, v.x + fwd * 3 + Math.cos(a) * 0.7, v.y + fwy * 3 + Math.sin(a) * 0.7, 4.6); at(H.l, v.x + fwd * 3 - rx * 1.2, v.y + fwy * 3 - ry * 1.2, 4.2); H.tool = 'spoon'; break; }
      case 'coconut': {
        const cx2 = sx, cy2 = sy;
        if (ph === 'chop') { const sw = Math.abs(Math.sin(k * PI * 3)); at(H.r, cx2 + rx * 1.2, cy2 + ry * 1.2, sh + 0.6 + sw * 4.6); at(H.l, cx2 - rx * 1.4, cy2 - ry * 1.4, sh + 0.8); H.tool = 'machete'; }
        else if (ph === 'pick' || ph === 'straw') { at(H.l, cx2 - ax * 2, cy2 - ay * 2, sh + 0.8); H.tool = ph === 'straw' ? 'coconut' : null; }
        else if (ph === 'serve') { const c = sc.sl.counter; at(H.r, lerp(cx2, c.x, k * 0.8), lerp(cy2, c.y, k * 0.8), sh + 0.6); H.tool = 'coconut'; }
        break;
      }
      case 'gola': {
        if (ph === 'shave') { const s = Math.sin(k * TAU * 5) * 1.3; at(H.r, sx + ax * s, sy + ay * s, sh + 0.8); H.tool = 'shaver'; }
        else if (ph === 'shape') { at(H.r, sx + rx * 1.4, sy + ry * 1.4, sh + 1.8); at(H.l, sx + rx * 1.4 + fwd, sy + ry * 1.4 + fwy, sh + 1.6); H.tool = 'gola'; }
        else if (ph === 'syrup') { at(H.r, sx + rx * 1.4, sy + ry * 1.4, sh + 3.2); at(H.l, sx + rx * 1.4 + fwd * 1.2, sy + ry * 1.4 + fwy * 1.2, sh + 1.4); H.tool = 'bottle'; }
        else if (ph === 'serve') { const c = sc.sl.counter; at(H.r, lerp(sx, c.x, k * 0.8), lerp(sy, c.y, k * 0.8), sh + 1); H.tool = 'gola'; }
        break;
      }
      case 'banana': case 'flower': {
        const a = t * (W === 'flower' ? 4 : 2);
        at(H.r, sx + Math.cos(a) * 0.8, sy + Math.sin(a) * 0.8, sh + 0.8); at(H.l, sx - ax * 1.6, sy - ay * 1.6, sh + 0.6);
        if (ph === 'serve') { const c = sc.sl.counter; at(H.r, lerp(sx, c.x, k * 0.8), lerp(sy, c.y, k * 0.8), sh + 0.6); H.tool = W === 'flower' ? 'garland' : 'bananas'; }
        break;
      }
      case 'haleem': {
        const up = ph === 'pound' ? Math.abs(Math.sin(t * 2.6)) : ph === 'ladle' ? 0.4 : 0.6;
        const hx = v.x + fwd * 2.2, hy = v.y + fwy * 2.2;
        at(H.r, hx + rx * 0.6, hy + ry * 0.6, 5.4 + up * 2.4); at(H.l, hx - rx * 0.6, hy - ry * 0.6, 6.4 + up * 2.4);
        H.tool = ph === 'serve' ? 'bowl' : 'paddle';
        if (ph === 'serve') { const c = sc.sl.counter; at(H.r, lerp(sx, c.x, k * 0.6), lerp(sy, c.y, k * 0.6), 6); }
        break;
      }
      case 'counter': {
        const a = t * 3; at(H.r, v.x + fwd * 2.4 + Math.cos(a) * 0.6, v.y + fwy * 2.4 + Math.sin(a) * 0.6, 4.4); at(H.l, v.x + fwd * 2.4 - rx * 1.4, v.y + fwy * 2.4 - ry * 1.4, 4.2);
        H.tool = ph === 'serve' ? 'parcel' : null;
        break;
      }
      case 'waiter': { at(H.l, v.x + fwd * 1.4 - rx * 2.4, v.y + fwy * 1.4 - ry * 2.4, 6.4); H.tool = 'tray'; break; }
      default: break;
    }
  }
  const DOSA_R = 2.4;

  /* ================================================================ particles (one simulation, both views) */
  // kinds: 0 steam (white, soft), 1 smoke (grey-brown), 2 spark (ember, additive), 3 wisp (from a hot glass / plate)
  const PMAX = 320;
  const P = {
    n: 0, x: new Float32Array(PMAX), y: new Float32Array(PMAX), h: new Float32Array(PMAX), vx: new Float32Array(PMAX), vy: new Float32Array(PMAX), vh: new Float32Array(PMAX),
    life: new Float32Array(PMAX), max: new Float32Array(PMAX), s0: new Float32Array(PMAX), s1: new Float32Array(PMAX), a0: new Float32Array(PMAX), kind: new Uint8Array(PMAX), sc: new Int32Array(PMAX),
  };
  let pCap = 260;
  function emit(sc, x, y, h, kind, vh, life, s0, s1, a0) {
    if (!TUNE.particles || P.n >= pCap) return -1;
    const i = P.n++;
    P.x[i] = x; P.y[i] = y; P.h[i] = h; P.vx[i] = (rnd() - 0.5) * 2; P.vy[i] = (rnd() - 0.5) * 2; P.vh[i] = vh;
    P.life[i] = 0; P.max[i] = life; P.s0[i] = s0; P.s1[i] = s1; P.a0[i] = a0; P.kind[i] = kind; P.sc[i] = sc ? sc.uid : -1;
    return i;
  }
  function stoveOf(sc) { return is3D() && sc.sl.stove3 ? sc.sl.stove3 : sc.sl.stove; }
  function burst(sc, S, amt) {
    if (!S || !sc.K.steam) return;
    const n = Math.round((sc.K.steam.burst || 0) * amt * (lowTier() ? 0.6 : 1));
    for (let i = 0; i < n; i++) emit(sc, S.x + (rnd() - 0.5) * 3.4, S.y + (rnd() - 0.5) * 3.4, S.h + 0.3, 0, rr(8, 14), rr(1.5, 2.6), rr(1.6, 2.4), rr(6, 9.5), rr(0.6, 0.85));
  }
  function sparks(sc, S, n) {
    if (!S) return;
    for (let k = 0; k < n; k++) { const i = emit(sc, S.x + (rnd() - 0.5) * 2, S.y + (rnd() - 0.5) * 2, S.h + 0.4, 2, rr(9, 17), rr(0.5, 1.0), 0.45, 0.25, 1); if (i >= 0) { P.vx[i] = (rnd() - 0.5) * 10; P.vy[i] = (rnd() - 0.5) * 10; } }
  }
  function updateParticles(dt) {
    let i = 0;
    while (i < P.n) {
      P.life[i] += dt;
      if (P.life[i] >= P.max[i]) { // swap-remove
        const j = --P.n;
        if (i !== j) { P.x[i] = P.x[j]; P.y[i] = P.y[j]; P.h[i] = P.h[j]; P.vx[i] = P.vx[j]; P.vy[i] = P.vy[j]; P.vh[i] = P.vh[j]; P.life[i] = P.life[j]; P.max[i] = P.max[j]; P.s0[i] = P.s0[j]; P.s1[i] = P.s1[j]; P.a0[i] = P.a0[j]; P.kind[i] = P.kind[j]; P.sc[i] = P.sc[j]; }
        continue;
      }
      const k = P.kind[i];
      if (k === 2) { P.vh[i] -= 22 * dt; P.vx[i] *= 1 - dt; P.vy[i] *= 1 - dt; if (P.h[i] < 0) P.max[i] = 0; }
      else {
        const w = windAt(P.x[i], P.y[i]), up = clamp(P.h[i] / 14, 0.2, 1.4);
        P.vx[i] += (w.x * up - P.vx[i]) * Math.min(1, dt * 1.2);
        P.vy[i] += (w.y * up - P.vy[i]) * Math.min(1, dt * 1.2);
        P.vh[i] *= 1 - dt * (k === 1 ? 0.35 : 0.7);
      }
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.h[i] += P.vh[i] * dt;
      i++;
    }
  }
  /** per particle: progress t, size (u), alpha */
  function pState(i, out) {
    const t = P.life[i] / P.max[i];
    out.t = t; out.s = lerp(P.s0[i], P.s1[i], Math.sqrt(t));
    out.a = P.a0[i] * (t < 0.1 ? t / 0.1 : 1) * Math.pow(1 - t, 1.15);
    return out;
  }

  /* ================================================================ scenes */
  let UID = 1;
  const ACTIVE = [];
  class Scene {
    constructor(sp) {
      this.uid = UID++; this.spot = sp; this.K = sp.K; this.F = sp.frame; this.sl = slotsFor(sp);
      this.patrons = []; this.waitQ = []; this.queue = []; this.counterBy = null; this.waiterFor = null;
      this.vendors = []; this.vendor = null; this.vehicles = [];
      this.on = false; this.level = 0; this.want = 0; this.arriveT = 0; this.rain = 0; this.style = styleAt(sp.x, sp.y);
      this.roles = null; this.emitAcc = 0; this.wispAcc = 0; this.sndT = rr(3, 8); this.lvlT = 0; this.tarp = 0; this.ms = 0;
      this.fn = (ctx) => drawSceneOverlay(ctx, this);
    }
  }
  function peakLevel(peaks, m) {
    let L = 0;
    const R = TUNE.ramp;
    for (const p of peaks || []) {
      const a = p[0], b = p[1];
      let mm = m;
      if (b > 1440 && mm < a - R) mm += 1440;
      if (mm < a - R || mm > b + R) continue;
      const k = mm < a ? 1 - (a - mm) / R : mm > b ? 1 - (mm - b) / R : 1;
      L = Math.max(L, p[2] * smooth(k));
    }
    return L;
  }
  function inSpan(m, h) { if (!h) return true; const a = h[0], b = h[1]; return b > 1440 ? m >= a || m < b - 1440 : m >= a && m < b; }
  function shopOpen(sp) {
    if (!sp.place || !N.shops || !N.shops.status) return true;
    try { const s = N.shops.status(sp.place); return !s || s.open !== false; } catch (e) { return true; }
  }
  function cartPresent(sp, m) {
    const k = sp.kind;
    if (k === 'bhutta') return m >= 930 && m < 1350;
    if (k === 'panipuri') return m >= 960 && m < 1380;
    if (k === 'gola') return season('summer') && m >= 630 && m < 1110;
    return true;
  }
  function levelOf(sc) {
    const sp = sc.spot, K = sc.K, m = mins();
    if (sp.force && sp.force.level != null) return sp.force.level;
    if (K.when && !K.when(sp)) return 0;
    if (!cartPresent(sp, m)) return 0;
    let L = peakLevel(K.peaks, m);
    if (K.base && inSpan(m, K.hours) && !(m < 300 && !K.hours)) L = Math.max(L, K.base);
    if (sp.kind === 'gate') { if (season('summer')) L = Math.max(L * 0.4, m > 690 && m < 1080 ? 0.6 : 0); else if (!schoolDay()) L *= 0.25; }
    if (sp.kind === 'chai' && BHUTTA_CHAI.test(sp.id) && m > 990 && m < 1260) L = Math.max(L, 0.95);
    if (sp.kind === 'coconut' && season('summer')) L = Math.min(1, L * 1.5);
    if (!shopOpen(sp)) L *= 0.2;
    const w = dow(); if (K.dow) L *= K.dow[w] || 1;
    // the spot's mood today (deterministic per spot per day)
    L *= 0.78 + 0.44 * hash(sp.id + ':' + dayN());
    L *= 1 - TUNE.rainCrowd * sc.rain;
    return clamp(L, 0, 1.5);
  }
  function maxPatrons() { return lowTier() ? TUNE.maxPatrons.low : TUNE.maxPatrons.desk; }
  function activateScene(sp) {
    if (sp.scene) return sp.scene;
    const sc = new Scene(sp);
    sp.scene = sc; sc.on = true;
    ACTIVE.push(sc);
    sc.rain = rainLevel();
    // vendors
    const V = sc.K.vendor;
    if (V && sc.sl.vendor && !(sp.art === 'season')) {
      const v = new Vendor(sc, V, sc.sl.vendor);
      N.entities.add(v); sc.vendors.push(v); sc.vendor = v; VENDORS.push(v);
      if (V.second && sc.sl.vendor2) { const v2 = new Vendor(sc, Object.assign({}, V, { work: V.second.work }), sc.sl.vendor2); N.entities.add(v2); sc.vendors.push(v2); VENDORS.push(v2); }
    }
    sc.level = levelOf(sc);
    sc.want = wantOf(sc);
    warmStart(sc);
    parkVehicles(sc, true);
    wrapArt(sp);
    N.emit('streetfood:scene', { id: sp.id, kind: sp.kind, on: true });
    return sc;
  }
  function releaseScene(sc, quick) {
    if (!sc || !sc.on) return;
    sc.on = false;
    const i = ACTIVE.indexOf(sc); if (i >= 0) ACTIVE.splice(i, 1);
    if (sc.spot.scene === sc) sc.spot.scene = null;
    for (const p of sc.patrons.slice()) {
      const vis = !quick && (is3D() ? Math.hypot(p.x - N.player.x, p.y - N.player.y) < 150 : N.render.inView(p.x, p.y, 10));
      if (!vis) dropPatron(p); else { p.st = 'leave'; p.exit = null; }
    }
    for (const v of sc.vendors) { N.entities.remove(v); const j = VENDORS.indexOf(v); if (j >= 0) VENDORS.splice(j, 1); }
    sc.vendors.length = 0; sc.vendor = null;
    for (const v of sc.vehicles) ORPHANS.push(v);
    sc.vehicles.length = 0;
    for (const s of sc.sl.ring) if (s.taken && !s.taken.alive) s.taken = null;
    // remove this scene's particles
    for (let k = 0; k < P.n; k++) if (P.sc[k] === sc.uid) P.max[k] = 0;
    N.emit('streetfood:scene', { id: sc.spot.id, kind: sc.spot.kind, on: false });
  }
  function wantOf(sc) {
    const K = sc.K;
    let w = sc.level * K.max * (API.density == null ? 1 : API.density);
    // fluctuate: a few arrive together, then it thins (deterministic per spot and 20 s)
    w += (hash(sc.spot.id + ':' + Math.floor(simT() / 20)) - 0.5) * 1.4;
    if (K.zone && sc.spot.place && N.traffic && N.traffic.crowd) {
      try { const z = N.traffic.crowd(sc.spot.place); if (z && z.active) w = Math.max(sc.level > 0.3 ? 2 : 0, w - z.n * 0.6); } catch (e) { /* ignore */ }
    }
    return Math.max(0, Math.min(Math.round(w), K.queue ? sc.sl.queue.length + sc.sl.ring.length : sc.sl.ring.length));
  }
  function warmStart(sc) {
    const K = sc.K, sl = sc.sl;
    let n = Math.min(Math.round(sc.want * 0.85), maxPatrons() - PATRONS.length);
    const m = mins();
    sc.roles = K.roles ? K.roles(m, sc) : null;
    for (let i = 0; i < n; i++) {
      const role = (sc.roles && wpick(sc.roles)) || 'man';
      const r2 = role === 'family' ? (rnd() < 0.5 ? 'aunty' : 'kid') : role;
      if (K.queue && i < Math.min(n - 2, sl.queue.length)) {
        const s = sl.queue[i];
        const p = newPatron(sc, r2, s.x, s.y, s.a || 0);
        p.st = 'queue'; sc.queue.push(p);
        continue;
      }
      const p = newPatron(sc, r2, sc.spot.x, sc.spot.y, 0);
      if (!takeSlot(p, sl.ring)) { dropPatron(p); break; }
      p.x = p.slot.x; p.y = p.slot.y; p.angle = p.slot.a || 0;
      const r = rnd();
      if (K.vendor && K.vendor.work === 'waiter') { if (r < 0.6) { p.st = 'eat'; p.hold = K.hold; p.eatT = rr(4, K.eat[1]); } else { p.st = 'wait'; sc.waitQ.push(p); } }
      else if (!K.hold || r < 0.4) { p.st = 'wait'; sc.waitQ.push(p); }
      else { p.st = 'eat'; p.hold = K.hold; p.look = holdLook(p); p.eatT = rr(3, K.eat[1] * 0.8); if (K.tight) p.puris = (rnd() * 6) | 0; }
      p.t = rr(0, 6);
    }
    sc.arriveT = rr(0.5, 2.5);
  }
  function spawnArrival(sc) {
    if (PATRONS.length >= maxPatrons()) return null;
    const K = sc.K, m = mins();
    sc.roles = K.roles ? K.roles(m, sc) : null;
    if (rnd() < TUNE.recruitShare) { const p = recruit(sc); if (p) return p; }
    const pl = N.player, E = sc.sl.entry;
    const cand = E.filter((e) => (is3D() ? Math.hypot(e.x - pl.x, e.y - pl.y) > 80 : !N.render.inView(e.x, e.y, 8)));
    if (!cand.length) return null;
    const e = pick(cand), a = Math.atan2(sc.spot.y - e.y, sc.spot.x - e.x);
    let role = (sc.roles && wpick(sc.roles)) || 'man';
    if (role === 'kid' && (m > 1290 || m < 360)) role = 'youth';
    if (role === 'student' && !schoolDay()) role = 'kid';
    if (role === 'family') {
      const lead = newPatron(sc, rnd() < 0.65 ? 'aunty' : 'uncle', e.x, e.y, a);
      if (PATRONS.length < maxPatrons()) { const kid = newPatron(sc, 'kid', e.x - Math.cos(a) * 4, e.y - Math.sin(a) * 4, a); kid.lead = lead; kid.side = rnd() < 0.5 ? 1 : -1; kid.st = 'follow'; }
      return lead;
    }
    return newPatron(sc, role, e.x, e.y, a);
  }
  function sceneUpdate(sc, dt) {
    const t0 = now();
    const K = sc.K, sl = sc.sl;
    sc.lvlT -= dt;
    if (sc.lvlT <= 0) { sc.lvlT = 1; sc.rain += (rainLevel() - sc.rain) * 0.5; sc.level = levelOf(sc); sc.want = wantOf(sc); }
    sc.tarp += ((sc.rain > 0.12 && (K.shelter === 'tarp') ? 1 : 0) - sc.tarp) * Math.min(1, dt * 0.8);
    // arrivals / departures
    const count = sc.patrons.filter((p) => p.st !== 'leave' && p.st !== 'inside' && !p.lead).length;
    if (count < sc.want) {
      sc.arriveT -= dt;
      if (sc.arriveT <= 0) { spawnArrival(sc); sc.arriveT = rr(1.4, 4.2) * (count < sc.want * 0.5 ? 0.55 : 1) * (sc.rain > 0.3 ? 1.6 : 1); }
    } else if (count > sc.want + 1) {
      // thin out: someone finishes up
      const e = sc.patrons.find((p) => p.st === 'eat' && p.eatT > 3) || sc.patrons.find((p) => p.st === 'wait' && p.waitT > 8);
      if (e) { if (e.st === 'eat') e.eatT = Math.min(e.eatT, rr(0.5, 3)); else { const w = sc.waitQ.indexOf(e); if (w >= 0) sc.waitQ.splice(w, 1); e.st = 'leave'; } }
    }
    // a family's kid follows (state 'follow' is handled by the lead logic)
    // steam / smoke from the stove
    const S = stoveOf(sc), st = K.steam;
    if (st && S && TUNE.particles) {
      const v = sc.vendor;
      let mul = 0.6;
      if (v) {
        if (v.work === 'dosa') mul = v.dosa.on ? (v.ph === 'spread' || v.ph === 'oil' ? 1.6 : v.ph === 'cook' ? 1.2 : 0.9) : 0.35;
        else if (v.work === 'fry') mul = v.ph === 'fry' || v.ph === 'stir' || v.ph === 'drop' ? 1.4 : 0.9;
        else if (v.work === 'chai') mul = v.ph === 'pour' || v.ph === 'pour2' ? 1.5 : 1;
        else if (v.work === 'bhutta') mul = 0.7 + v.fan * 0.9;
        else if (v.work === 'haleem') mul = 1.2;
      }
      if (K.cart === 'gola' || st.cold) mul *= sc.level > 0.1 ? 0.6 : 0.2;
      if (sc.level <= 0.01 && sc.K.type !== 'cart' && !v) mul *= 0.3;
      sc.emitAcc += st.rate * mul * dt * (lowTier() ? 0.65 : 1);
      while (sc.emitAcc >= 1) {
        sc.emitAcc -= 1;
        const smoke = rnd() < (st.smoke || 0);
        const cold = st.cold && !smoke;
        emit(sc, S.x + (rnd() - 0.5) * 2.6, S.y + (rnd() - 0.5) * 2.6, S.h + 0.2, cold ? 3 : smoke ? 1 : 0, cold ? rr(-1, 1) : rr(5.5, 10), smoke ? rr(2.4, 3.8) : cold ? rr(0.8, 1.4) : rr(1.8, 2.9), smoke ? 1.8 : 1.4, smoke ? rr(7, 10.5) : cold ? 2.4 : rr(5, 8), smoke ? 0.5 : cold ? 0.36 : rr(0.45, 0.68));
      }
      if (st.sparks && v && v.work !== 'bhutta' && rnd() < dt * st.sparks * 3) sparks(sc, S, 1);
    }
    // wisps off hot glasses / plates held near the player
    if (TUNE.particles && K.steam && !K.steam.cold) {
      sc.wispAcc += dt;
      if (sc.wispAcc > 0.4) {
        sc.wispAcc = 0;
        for (const p of sc.patrons) if ((p.hold === 'glass' || p.hold === 'steel' || p.hold === 'bowl' || p.hold === 'cob') && rnd() < 0.18) { const hp = heldPos(p); emit(sc, hp.x, hp.y, hp.h + 0.4, 3, rr(3, 5), rr(0.9, 1.5), 0.4, rr(1.6, 2.4), 0.3); }
      }
    }
    // the murmur of a crowd
    sc.sndT -= dt;
    if (sc.sndT <= 0) {
      sc.sndT = rr(5, 11);
      if (count >= 4) sound(hasSfx('gossip') ? 'gossip' : null, sc.spot.x, sc.spot.y, { vol: 0.32 + Math.min(0.3, count * 0.02) });
      if (K.sounds && K.sounds.cook === 'sizzle' && sc.vendor && sc.vendor.busy && rnd() < 0.5) sound('sizzle', S ? S.x : sc.spot.x, S ? S.y : sc.spot.y, { vol: 0.3 });
    }
    // parked scooters come and go out of sight
    sc.vehT = (sc.vehT || 6) - dt;
    if (sc.vehT <= 0) { sc.vehT = 7; parkVehicles(sc, false); }
    if (!sc.spot._artW) wrapArt(sc.spot);
    sc.ms = now() - t0;
  }
  function heldPos(p) {
    // right hand, in front (2D world units); a bite brings it to the mouth
    const c = Math.cos(p.angle), s = Math.sin(p.angle), b = p.bite || 0;
    const f = lerp(3.4, 1.6, b), r = lerp(2.2, 0.6, b);
    HP.x = p.x + c * f - s * r; HP.y = p.y + s * f + c * r; HP.h = lerp(4.6, 6.4, b) * (p.look0 && (p.look0.kind === 'kid' || p.look0.kind === 'student') ? 0.82 : 1);
    return HP;
  }
  const HP = { x: 0, y: 0, h: 0 };

  /* ================================================================ parked scooters and cycles */
  const ORPHANS = [];
  let VEH_N = 0;
  function vehVisible(v) { return is3D() ? Math.hypot(v.x - N.player.x, v.y - N.player.y) < 260 : N.render.inView(v.x, v.y, 20); }
  function parkVehicles(sc, warm) {
    if (!TUNE.vehicles || !N.vehicles || !N.vehicles.spawn || !N.vehicles.TYPES) return;
    const K = sc.K;
    const want = K.vehicles ? Math.round(K.vehicles * clamp(sc.level * 1.15, 0, 1)) : 0;
    // drop extras (only out of sight)
    for (let i = sc.vehicles.length - 1; i >= 0; i--) {
      const v = sc.vehicles[i];
      if (!v.alive || N.player.vehicle === v) { sc.vehicles.splice(i, 1); continue; }
      if (sc.vehicles.length > want && !vehVisible(v)) { removeVeh(v); sc.vehicles.splice(i, 1); }
    }
    const cap = lowTier() ? TUNE.maxVehicles.low : TUNE.maxVehicles.desk;
    const m = mins(), night = m > 1200 || m < 330;
    const TY = N.vehicles.TYPES;
    const types = (night ? ['rx100', 'chetak', 'chetak', 'luna', 'cycle'] : ['chetak', 'luna', 'cycle', 'cycle', 'rx100', 'scooty', 'hero_cycle', 'ladiescycle']).filter((t) => TY[t]);
    if (!types.length) return;
    for (const s of sc.sl.park) {
      if (sc.vehicles.length >= want || VEH_N >= cap) break;
      if (sc.vehicles.some((v) => Math.hypot(v.x - s.x, v.y - s.y) < 5)) continue;
      if (!warm && vehVisible(s)) continue;
      if (N.entities.query(s.x, s.y, 6, (e) => e.kind === 'vehicle' || e === N.player).length) continue;
      const t = pick(types), T = TY[t];
      const col = T.colors && T.colors.length ? pick(T.colors) : undefined;
      let v = null;
      try { v = N.vehicles.spawn(t, s.x, s.y, s.a, { color: col, seed: (rnd() * 1e6) | 0 }); } catch (e) { v = null; }
      if (!v) continue;
      v.noEnter = true; v.sfPark = true;
      sc.vehicles.push(v); VEH_N++;
    }
  }
  function removeVeh(v) {
    if (!v) return;
    if (N.player.vehicle === v) return;
    try { N.vehicles.remove(v); } catch (e) { N.entities.remove(v); }
    VEH_N = Math.max(0, VEH_N - 1);
  }
  function sweepOrphans() {
    for (let i = ORPHANS.length - 1; i >= 0; i--) {
      const v = ORPHANS[i];
      if (!v.alive || N.player.vehicle === v) { ORPHANS.splice(i, 1); if (!v.alive) VEH_N = Math.max(0, VEH_N - 1); continue; }
      if (!vehVisible(v)) { removeVeh(v); ORPHANS.splice(i, 1); }
    }
  }

  /* ================================================================ extra carts (not in the map data) */
  class CartProp extends N.Actor {
    constructor(sp) {
      super({ kind: 'prop', r: 5, mass: 80, solid: true, fixed: true });
      this.sf = true; this.view3d = 'sf:cart'; this.spot = sp; this.cartKind = sp.K.cart;
      this.x = sp.x; this.y = sp.y; this.angle = Math.atan2(sp.frame.ay, sp.frame.ax);
      this._fn = (ctx) => drawExtraCart(ctx, this);
    }
    draw() {
      if (is3D()) return;
      const R = N.render;
      R.queue('structures', R.distKey(this.x, this.y), this._fn);
      if (R.sun && R.sun.strength > 0.18 && N.draw.castCircle) N.draw.castCircle(this.x, this.y, 6, this.cartKind === 'bhutta' ? 7 : 11);
    }
  }
  function addCartEntity(sp) {
    if (sp.cartE) return;
    sp.cartE = new CartProp(sp);
    sp.present = false;
    if (N.interact && N.interact.add && sp.K.buy) {
      N.interact.add('sf:' + sp.id, {
        entity: sp.cartE, r: 18, priority: 2,
        label: () => sp.K.buy.label,
        enabled: () => !!(sp.present && sp.cartE && sp.cartE.alive && !(N.player && N.player.vehicle)),
        use: () => buyAt(sp),
      });
    }
  }
  function removeCartEntity(sp) {
    if (sp.cartE) { if (sp.cartE.alive) N.entities.remove(sp.cartE); sp.cartE = null; }
    if (N.interact && N.interact.remove) { try { N.interact.remove('sf:' + sp.id); } catch (e) { /* ignore */ } }
  }
  let presT = 0, presSnap = true; // presSnap: apply at once (after a teleport / a new game nobody saw it roll in)
  function updatePresence(dt) {
    presT -= dt;
    if (presT > 0 && !presSnap) return;
    presT = 2;
    const snap = presSnap; presSnap = false;
    const m = mins(), pl = N.player;
    for (const sp of SPOTS) {
      if (!sp.cartE) continue;
      const want = cartPresent(sp, m) && API.enabled !== false;
      if (want === sp.present) continue;
      const vis = is3D() ? Math.hypot(sp.x - pl.x, sp.y - pl.y) < 300 : N.render.inView(sp.x, sp.y, 20);
      if (vis && !sp.forceShow && !snap) continue; // the cart rolls in / away out of sight
      sp.present = want;
      if (want) { sp.cartE.alive = true; sp.cartE.id = 0; N.entities.add(sp.cartE); } else if (sp.cartE.alive) N.entities.remove(sp.cartE);
    }
  }
  function schoolGateShop() {
    try { const l = N.shops.list('school_gate'); return l && l.length ? l[0] : null; } catch (e) { return null; }
  }
  function buyAt(sp) {
    const b = sp.K.buy;
    if (!b || !N.shops || !N.shops.buy) return;
    let place = b.place;
    if (place === '@school_gate') place = schoolGateShop();
    if (!place) return;
    let r = null;
    try { r = N.shops.buy(place, b.item, {}); } catch (e) { N.err('streetfood.buy', e); }
    if (r && r.ok) {
      const v = sp.scene && sp.scene.vendor;
      if (v) { v.servePl = 1.2; bark(v, lineOf('serveP'), { force: true }); }
      sound(sp.K.sounds && sp.K.sounds.pay, sp.x, sp.y, { vol: 0.4, force: true });
    } else if (r && r.why && N.hud && N.hud.toast) N.hud.toast(String(r.why).replace(/\*/g, ''), 2400);
  }

  /* ================================================================ hooks: places_art painted crowds, shops night dosa */
  const KEEP = { gokul: () => 0, biryani: () => 0, irani: (A) => Math.max(0, A.people.length - 1), haleem: () => 1 };
  function wrapArt(sp) {
    if (sp._artW || !sp.lm || sp.art === 'season' || sp.kind === 'gate') { if (sp.kind === 'gate') sp._artW = true; return; }
    const A = sp.lm._pa;
    if (!A || !Array.isArray(A.people) || !A.people.length) return;
    if (A._sfWrapped) { sp._artW = true; return; }
    const orig = A.count;
    const keep = KEEP[sp.kind] || (() => 0);
    A.count = function (a) {
      const n0 = orig ? orig.call(this, a) : A.people.length;
      const s = sp.scene;
      if (!s || !s.on || !TUNE.suppressArt || API.enabled === false) return n0;
      return Math.min(n0, keep(A));
    };
    A._sfWrapped = true; sp._artW = true;
  }
  let shopsHooked = false;
  const nightShift = () => { const m = mins(); return m >= 1260 || m < 60; };
  function hookShops() {
    if (shopsHooked || !N.shops || !N.shops.KINDS) return;
    shopsHooked = true;
    const K = N.shops.KINDS.dosa_bandi;
    if (!K) return;
    const orig = K.hoursFor;
    K.hoursFor = function (c) {
      let base = K.hours || [];
      try { if (orig) base = orig.call(this, c) || base; } catch (e) { /* keep the catalogue hours */ }
      return TUNE.nightDosa ? base.concat([['21:00', '01:00']]) : base;
    };
    for (const row of K.rows || []) {
      if (typeof row.when !== 'function' || !/dosa|vada|pesarattu/.test(row.id)) continue;
      const w = row.when;
      row.when = function (c, q) { return TUNE.nightDosa && nightShift() ? null : w.call(this, c, q); };
    }
  }

  /* ================================================================ 2D drawing */
  let R = null, CTX = null;
  const kk = (h) => R.k(h);
  const SX = (x, k) => R.sx(x, k), SY = (y, k) => R.sy(y, k);
  function dot(x, y, h, r, col) { const k = kk(h); CTX.fillStyle = col; CTX.beginPath(); CTX.arc(SX(x, k), SY(y, k), Math.max(0.45, r * k), 0, TAU); CTX.fill(); }
  function seg(x0, y0, h0, x1, y1, h1, w, col) {
    const k0 = kk(h0), k1 = kk(h1);
    CTX.strokeStyle = col; CTX.lineWidth = Math.max(0.6, w * (k0 + k1) * 0.5); CTX.lineCap = 'round';
    CTX.beginPath(); CTX.moveTo(SX(x0, k0), SY(y0, k0)); CTX.lineTo(SX(x1, k1), SY(y1, k1)); CTX.stroke();
  }
  function ell(x, y, h, rx, ry, a, col) { const k = kk(h); CTX.fillStyle = col; CTX.beginPath(); CTX.ellipse(SX(x, k), SY(y, k), Math.max(0.4, rx * k), Math.max(0.4, ry * k), a || 0, 0, TAU); CTX.fill(); }
  function quad(F, u0, v0, u1, v1, h, col) {
    const k = kk(h);
    CTX.fillStyle = col; CTX.beginPath();
    CTX.moveTo(SX(fx(F, u0, v0), k), SY(fy(F, u0, v0), k)); CTX.lineTo(SX(fx(F, u1, v0), k), SY(fy(F, u1, v0), k));
    CTX.lineTo(SX(fx(F, u1, v1), k), SY(fy(F, u1, v1), k)); CTX.lineTo(SX(fx(F, u0, v1), k), SY(fy(F, u0, v1), k)); CTX.closePath(); CTX.fill();
  }
  function blit(ctx, look, x, y, a, anim, h) {
    const T = N.traffic;
    if (T && T.blitPerson) { T.blitPerson(ctx, look, x, y, a, anim, h); return; }
    if (N.draw && N.draw.sprite && N.people) N.draw.sprite(x, y, a, h, (g) => N.people.draw(g, look, anim));
  }
  function frame2d(ctx) { R = N.render; CTX = ctx; }
  function resetCtx(ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt'; }

  const DOSA_COL = (b) => U.mix ? U.mix('#f4ecd2', '#c9873a', clamp(b, 0, 1)) : '#e8c070';
  function drawHeld(p) {
    const H = p.hold; if (!H) return;
    const hp = heldPos(p), x = hp.x, y = hp.y, h = hp.h, a = p.angle;
    switch (H) {
      case 'steel': dot(x, y, h, 1.55, '#b8bcc4'); dot(x, y, h + 0.05, 1.25, '#d8dce2'); ell(x, y, h + 0.1, 1.05, 0.42, a + 0.6, '#d8a050'); dot(x + 0.6, y - 0.4, h + 0.12, 0.35, '#f4f2e8'); dot(x - 0.5, y + 0.5, h + 0.12, 0.32, '#c8602a'); break;
      case 'leaf': dot(x, y, h, 1.45, '#3f7a2a'); dot(x, y, h + 0.05, 1.05, '#5a9a3a'); for (let i = 0; i < 3; i++) dot(x + Math.cos(i * 2.1) * 0.55, y + Math.sin(i * 2.1) * 0.55, h + 0.1, 0.38, '#d8a858'); break;
      case 'bowl': dot(x, y, h, 1.15, '#b8bcc4'); dot(x, y, h + 0.1, 0.85, '#7a4a22'); dot(x + 0.2, y - 0.2, h + 0.15, 0.3, '#e8c060'); break;
      case 'glass': dot(x, y, h, 0.68, '#f2f0ea'); dot(x, y, h + 0.1, 0.5, '#b07a3a'); break;
      case 'cone': { const c = Math.cos(a), s = Math.sin(a); const k = kk(h); CTX.fillStyle = '#e8dcc0'; CTX.beginPath(); CTX.moveTo(SX(x + c * 1.3, k), SY(y + s * 1.3, k)); CTX.lineTo(SX(x - s * 0.9, k), SY(y + c * 0.9, k)); CTX.lineTo(SX(x + s * 0.9, k), SY(y - c * 0.9, k)); CTX.closePath(); CTX.fill(); dot(x + c * 0.2, y + s * 0.2, h + 0.1, 0.55, '#c8822a'); break; }
      case 'cob': { const c = Math.cos(a + 0.8), s = Math.sin(a + 0.8); seg(x - c * 1.5, y - s * 1.5, h, x + c * 1.5, y + s * 1.5, h + 0.3, 1.0, '#e0b030'); dot(x + c * 0.4, y + s * 0.4, h + 0.4, 0.3, '#5a3a1a'); dot(x - c * 0.6, y - s * 0.6, h + 0.4, 0.28, '#d8402a'); break; }
      case 'coconut': dot(x, y, h, 1.3, '#4f8a2a'); dot(x - 0.3, y - 0.3, h + 0.1, 0.6, '#f0ecd8'); seg(x - 0.3, y - 0.3, h + 0.2, x + 0.4, y - 1.2, h + 1.6, 0.18, '#e83a5a'); break;
      case 'gola': { const col = ['#e8203a', '#f08a1a', '#30c050', '#8a3ad8'][(p.id || 0) % 4]; seg(x, y, h - 0.6, x, y, h + 0.6, 0.25, '#d8c8a0'); dot(x, y, h + 0.9, 0.95, col); dot(x - 0.3, y - 0.3, h + 1, 0.35, '#ffffff'); break; }
      case 'banana': { const c = Math.cos(a), s = Math.sin(a); seg(x - s * 1.1, y + c * 1.1, h, x + c * 0.8, y + s * 0.8, h + 0.2, 0.7, '#f2d23a'); break; }
      case 'flowers': for (let i = 0; i < 5; i++) dot(x + Math.cos(i * 1.25) * 0.8, y + Math.sin(i * 1.25) * 0.8, h, 0.32, i % 2 ? '#f8f6ee' : '#f08a1a'); break;
      case 'parcel': ell(x, y, h, 1.2, 0.8, a, '#e8dcc0'); seg(x - 0.6, y, h + 0.1, x + 0.6, y, h + 0.1, 0.15, '#c03030'); break;
      default: break;
    }
  }
  function drawUmb(ctx, x, y, a, col) {
    const k = kk(11), X = SX(x, k), Y = SY(y, k), r = 6.2 * k;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.arc(X, Y, r, (i / 8) * TAU + a, ((i + 1) / 8) * TAU + a); ctx.closePath();
      ctx.fillStyle = i % 2 ? col : (U.shade ? U.shade(col, 1.25) : col); ctx.fill();
    }
    ctx.fillStyle = '#c8c8c8'; ctx.fillRect(X - 0.5, Y - 0.5, 1, 1);
  }
  function drawPatron(ctx, p) {
    frame2d(ctx);
    if (p.down) { blit(ctx, p.look, p.x, p.y, p.angle + (p.getupT > 0 ? PI / 4 : PI / 2), null, 0.3); return; }
    blit(ctx, p.look, p.x, p.y, p.angle, p.anim, 0.6);
    if (p.hold) { drawHeld(p); resetCtx(ctx); }
    if (p.umb) drawUmb(ctx, p.x, p.y, p.angle, p.umb);
  }
  function drawVendor(ctx, v) {
    frame2d(ctx);
    blit(ctx, v.look, v.x, v.y, v.angle, v.anim, 0.6);
    if (v.work === 'waiter') { // the tray of chai glasses on his palm
      const L = v.hands.l;
      dot(L.x, L.y, L.h, 2.2, '#b8bcc4'); dot(L.x, L.y, L.h + 0.05, 1.9, '#d0d4da');
      for (let i = 0; i < 5; i++) dot(L.x + Math.cos(i * 1.26) * 1.1, L.y + Math.sin(i * 1.26) * 1.1, L.h + 0.2, 0.42, '#b07a3a');
      resetCtx(ctx);
    }
  }
  // arms + tools of a working vendor (drawn after the cart so they reach over it)
  function drawArms(v) {
    if (v.hidden || v.hide2d || v.work === 'waiter') return;
    const H = v.hands, skin = (v.look && v.look.skin) || '#a0683f';
    const c = Math.cos(v.angle), s = Math.sin(v.angle), rx = -s, ry = c;
    const sh = 5.8;
    const S = v.sc.spot;
    const restB = S.art === 'rest'; // places_art draws that bhatti's paddle itself
    for (const side of [1, -1]) {
      const hd = side > 0 ? H.r : H.l;
      const sx0 = v.x + c * 0.4 + rx * 2.4 * side, sy0 = v.y + s * 0.4 + ry * 2.4 * side;
      const dx = hd.x - sx0, dy = hd.y - sy0, d = Math.hypot(dx, dy);
      if (d < 1.2) continue; // resting at the side: the sprite's own arm
      const L = Math.min(d, 6.4), ex = sx0 + (dx / d) * L, ey = sy0 + (dy / d) * L, eh = lerp(sh, hd.h, L / Math.max(d, 0.01));
      seg(sx0, sy0, sh, ex, ey, eh, 1.35, skin);
      dot(ex, ey, eh + 0.05, 0.62, skin);
    }
    const r = H.r, tool = H.tool;
    const tc = Math.cos(v.angle), ts = Math.sin(v.angle);
    switch (tool) {
      case 'ladle': seg(r.x, r.y, r.h + 0.4, r.x - tc * 1.6, r.y - ts * 1.6, r.h + 1.6, 0.28, '#9aa0a6'); dot(r.x, r.y, r.h, 0.75, '#b8bcc4'); break;
      case 'spatula': seg(r.x - tc * 1.6, r.y - ts * 1.6, r.h + 1.2, r.x, r.y, r.h, 0.3, '#6a4a2a'); ell(r.x + tc * 0.6, r.y + ts * 0.6, r.h, 0.9, 0.5, v.angle, '#c8ccd2'); break;
      case 'oil': seg(r.x, r.y, r.h, r.x, r.y, r.h + 1.2, 0.7, '#c8ccd2'); if (rnd() < 0.5) dot(r.x + (rnd() - 0.5), r.y + (rnd() - 0.5), stoveOf(v.sc).h + 0.1, 0.22, '#f2d070'); break;
      case 'cloth': ell(r.x, r.y, r.h, 0.9, 0.6, 0, '#e8e0d0'); break;
      case 'plate': dot(r.x, r.y, r.h, 1.4, '#b8bcc4'); ell(r.x, r.y, r.h + 0.1, 1.0, 0.4, v.angle + 0.6, '#d8a050'); break;
      case 'samosas': for (let i = 0; i < 3; i++) dot(r.x + (i - 1) * 0.6, r.y, r.h, 0.4, '#d89a3a'); break;
      case 'jhara': seg(r.x, r.y, r.h, r.x - tc * 2.2, r.y - ts * 2.2, r.h + 2, 0.25, '#7a7e84'); dot(r.x, r.y, r.h, 0.8, '#9aa0a6'); if (v.lift > 0) for (let i = 0; i < 3; i++) dot(r.x + (i - 1) * 0.4, r.y, r.h + 0.2, 0.3, '#c8822a'); break;
      case 'cone': ell(r.x, r.y, r.h, 0.9, 0.6, 0, '#e8dcc0'); break;
      case 'spoon': seg(r.x, r.y, r.h, r.x - tc, r.y - ts, r.h + 1, 0.2, '#9aa0a6'); break;
      case 'pan': {
        dot(r.x, r.y, r.h, 0.9, '#9aa0a6'); dot(r.x, r.y, r.h + 0.05, 0.6, '#b07a3a');
        const L = H.l; dot(L.x, L.y, L.h, 0.6, '#f2f0ea');
        if (H.tip === 'stream' && v.pour > 0.05) { seg(r.x, r.y, r.h - 0.2, L.x, L.y, L.h + 0.3, 0.32 * v.pour + 0.12, 'rgba(176,122,58,0.92)'); }
        break;
      }
      case 'glass': dot(r.x, r.y, r.h, 0.62, '#f2f0ea'); dot(r.x, r.y, r.h + 0.05, 0.45, '#b07a3a'); break;
      case 'fan': { const fa = v.angle + Math.sin(simT() * 17) * 0.5; ell(r.x + Math.cos(fa) * 0.8, r.y + Math.sin(fa) * 0.8, r.h, 1.3, 0.9, fa, '#c8a060'); break; }
      case 'lemon': dot(r.x, r.y, r.h, 0.45, '#d8e04a'); break;
      case 'cob': seg(r.x - 1.2, r.y, r.h, r.x + 1.2, r.y, r.h, 0.9, '#e0b030'); break;
      case 'puri': dot(r.x, r.y, r.h, 0.5, '#e0b060'); break;
      case 'machete': { const up = r.h - stoveOf(v.sc).h; seg(r.x, r.y, r.h, r.x + tc * 2.2, r.y + ts * 2.2, r.h - 0.4 - up * 0.2, 0.42, '#d8dce2'); break; }
      case 'coconut': dot(r.x, r.y, r.h, 1.2, '#4f8a2a'); break;
      case 'shaver': ell(r.x, r.y, r.h, 1.1, 0.7, v.angle, '#7a5a3a'); break;
      case 'gola': dot(r.x, r.y, r.h, 0.9, '#f4f8fc'); break;
      case 'bottle': seg(r.x, r.y, r.h, r.x + tc * 1.2, r.y + ts * 1.2, r.h - 0.6, 0.5, '#d8203a'); break;
      case 'garland': seg(r.x - 1, r.y, r.h, r.x + 1, r.y, r.h, 0.6, '#f08a1a'); break;
      case 'bananas': for (let i = 0; i < 4; i++) ell(r.x + (i - 1.5) * 0.4, r.y, r.h, 0.9, 0.3, 1.2, '#f2d23a'); break;
      case 'paddle': if (!restB) { const S2 = stoveOf(v.sc); seg(r.x, r.y, r.h + 1.5, S2.x, S2.y, S2.h - 0.5, 0.75, '#8a6a3a'); } break;
      case 'bowl': dot(r.x, r.y, r.h, 1.1, '#b8bcc4'); dot(r.x, r.y, r.h + 0.1, 0.8, '#7a4a22'); break;
      case 'parcel': ell(r.x, r.y, r.h, 1.3, 0.9, v.angle, '#e8dcc0'); break;
      default: break;
    }
  }
  // the stove's contents, animated (2D)
  function drawStove(sc) {
    const v = sc.vendor, S = sc.sl.stove, K = sc.K;
    if (!S) return;
    const t = simT();
    const work = v ? v.work : (K.vendor && K.vendor.work);
    if (work === 'dosa') {
      const R0 = DOSA_R, h = S.h;
      dot(S.x, S.y, h - 0.02, R0 + 0.6, '#1e1c1e');           // the big iron tawa (covers the painted dosa)
      ell(S.x - 0.6, S.y - 0.6, h, R0 * 0.5, R0 * 0.25, -0.6, 'rgba(255,255,255,0.06)');
      const D = v && v.dosa;
      if (D && D.on) {
        const r = R0 * D.r, col = DOSA_COL(D.brown * 0.85 + D.oil * 0.1);
        const lift = D.lift || 0, F = sc.F;
        let cx = S.x, cy = S.y;
        if (v.ph === 'serve') { const c = sc.sl.counter; cx = lerp(S.x, c.x, smooth(lift) * 0.8); cy = lerp(S.y, c.y, smooth(lift) * 0.8); }
        const hh = h + 0.06 + (v.ph === 'serve' ? Math.sin(lift * PI) * 1.2 + lift * 0.6 : 0);
        if (D.fold < 0.05) {
          dot(cx, cy, hh, r, col);
          if (D.r > 0.4) { // the spiral the ladle left + crispy lace
            const k = kk(hh); CTX.strokeStyle = 'rgba(150,90,30,' + (0.18 + D.brown * 0.3).toFixed(2) + ')'; CTX.lineWidth = Math.max(0.4, 0.22 * k);
            CTX.beginPath(); for (let i = 0; i <= 24; i++) { const a = i * 0.55, rr2 = r * (i / 24) * 0.92; const X = SX(cx + Math.cos(a) * rr2, k), Y = SY(cy + Math.sin(a) * rr2, k); if (i) CTX.lineTo(X, Y); else CTX.moveTo(X, Y); } CTX.stroke();
          }
          if (D.oil > 0) for (let i = 0; i < 7; i++) { if (i / 7 > D.oil) break; const a = i * 0.9; dot(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7, hh + 0.04, 0.24, 'rgba(250,215,120,0.85)'); }
          if (D.fill) dot(cx, cy, hh + 0.08, r * 0.28, '#e8c040');
        } else {
          // folding: the half-moon closes over, then the long roll
          const f = D.fold, ax = F.ax, ay = F.ay;
          if (f < 0.6) {
            const k = kk(hh), X = SX(cx, k), Y = SY(cy, k), rr2 = r * k, base = Math.atan2(ay, ax) + PI / 2;
            CTX.fillStyle = col; CTX.beginPath(); CTX.arc(X, Y, rr2, base, base + PI); CTX.closePath(); CTX.fill();
            CTX.save(); CTX.translate(X, Y); CTX.rotate(base); CTX.scale(1, 1 - f / 0.6); CTX.fillStyle = U.shade ? U.shade(col, 0.88) : col; CTX.beginPath(); CTX.arc(0, 0, rr2, PI, TAU); CTX.closePath(); CTX.fill(); CTX.restore();
          } else {
            const L = r * lerp(1, 1.15, (f - 0.6) / 0.4), w = r * lerp(0.5, 0.32, (f - 0.6) / 0.4);
            seg(cx - ax * L, cy - ay * L, hh + 0.1, cx + ax * L, cy + ay * L, hh + 0.1, w * 1.6, U.shade ? U.shade(col, 0.92) : col);
          }
        }
      }
      // the batter bucket at his elbow
      const F = sc.F, bx = S.x - F.ax * 3.4 - F.nx * 1.2, by = S.y - F.ay * 3.4 - F.ny * 1.2;
      dot(bx, by, h + 0.6, 1.1, '#b8bcc4'); dot(bx, by, h + 0.65, 0.85, '#f2ead0');
    } else if (work === 'fry') {
      const h = S.h + 0.06;
      dot(S.x, S.y, h, 1.75, '#b07a2a');
      for (let i = 0; i < 6; i++) { const a = t * 2.2 + i * 1.05, r = 0.5 + ((i * 37) % 10) / 10; const b = (Math.sin(t * 9 + i * 1.7) + 1) * 0.5; dot(S.x + Math.cos(a) * r, S.y + Math.sin(a) * r, h + 0.05, 0.12 + b * 0.22, 'rgba(255,235,170,0.8)'); }
      if (v && v.batch && v.ph !== 'serve' && v.ph !== 'lift') { const tri = v.ph === 'drop' ? smooth(v.k) : 1; for (let i = 0; i < 4; i++) { const a = t * 0.8 + i * 1.6; dot(S.x + Math.cos(a) * 1.0, S.y + Math.sin(a) * 1.0, h + 0.1, 0.45 * tri, v.ph === 'fry' || v.ph === 'stir' ? '#d8a040' : '#e8c890'); } }
    } else if (work === 'chai') {
      // a row of small glasses on the plank, filled as the chai goes in
      const F = sc.F, n = 5;
      for (let i = 0; i < n; i++) { const u = (S.u || 0) + 2.6 + i * 1.15; const x = fx(F, u, F.hw * 0.55), y = fy(F, u, F.hw * 0.55); dot(x, y, 5.6, 0.48, '#f2f0ea'); dot(x, y, 5.65, 0.34, i < 3 ? '#b07a3a' : '#e8e0d0'); }
    } else if (work === 'coconut') {
      dot(S.x, S.y, S.h, 1.25, '#4f8a2a');
      if (v && v.ph === 'chop') dot(S.x - 0.3, S.y - 0.3, S.h + 0.1, 0.55 * smooth(v.k), '#f0ecd8');
    } else if (work === 'gola') {
      const F = sc.F;
      quad(F, (S.u || 0) - 1.4, -0.9, (S.u || 0) + 1.4, 0.9, S.h + 0.6, '#e8f4f8');
      for (let i = 0; i < 4; i++) dot(fx(F, (S.u || 0) - 3 + i * 0.9, -F.hw * 0.6), fy(F, (S.u || 0) - 3 + i * 0.9, -F.hw * 0.6), S.h + 1.2, 0.42, ['#e8203a', '#f2c230', '#30c050', '#f06aa0'][i]);
    } else if (work === 'haleem' && sc.spot.art !== 'rest' && sc.spot.art !== 'season') {
      dot(S.x, S.y, 5.5, 2.4, '#b8783a'); dot(S.x, S.y, 5.6, 1.9, '#7a4a22');
    }
    // night: the stove glows
    const night = (N.render.night || 0);
    if (night > 0.05 && K.glow && (!v || work !== 'coconut')) {
      CTX.globalCompositeOperation = 'lighter';
      const k = kk(S.h - 1), fl = 0.75 + 0.25 * Math.sin(t * 13 + sc.uid) * Math.sin(t * 7.3);
      CTX.globalAlpha = clamp(night * 0.38 * fl, 0, 1);
      CTX.drawImage(glowSprite(K.glow), SX(S.x, k) - 4.5 * k, SY(S.y, k) - 4.5 * k, 9 * k, 9 * k);
      CTX.globalAlpha = 1; CTX.globalCompositeOperation = 'source-over';
    }
  }
  function drawTarp(sc) {
    const a = sc.tarp; if (a < 0.03) return;
    const F = sc.F, u0 = -F.hl - 1.5, u1 = F.hl + 1.5, v0 = -F.hw - 1.2, v1 = F.hw + 8.6;
    for (const [u, v] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) seg(fx(F, u, v), fy(F, u, v), 0, fx(F, u, v), fy(F, u, v), v > 0 ? 9.6 : 11, 0.35, '#5a5a62');
    CTX.globalAlpha = 0.62 * a;
    const k0 = kk(11), k1 = kk(9.6);
    CTX.fillStyle = '#2a5c9a'; CTX.beginPath();
    CTX.moveTo(SX(fx(F, u0, v0), k0), SY(fy(F, u0, v0), k0)); CTX.lineTo(SX(fx(F, u1, v0), k0), SY(fy(F, u1, v0), k0));
    CTX.lineTo(SX(fx(F, u1, v1), k1), SY(fy(F, u1, v1), k1)); CTX.lineTo(SX(fx(F, u0, v1), k1), SY(fy(F, u0, v1), k1)); CTX.closePath(); CTX.fill();
    CTX.globalAlpha = 0.25 * a; CTX.strokeStyle = '#9ac0e8'; CTX.lineWidth = 0.6; CTX.stroke();
    CTX.globalAlpha = 1;
  }
  // puff sprites (soft round, cached)
  const SPR = {};
  function puffSprite(kind) {
    if (SPR[kind]) return SPR[kind];
    const c = N.render.makeCanvas(32, 32), g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    const col = kind === 1 ? '118,108,98' : kind === 2 ? '255,170,60' : '255,255,255', rim = kind === 1 ? '96,90,84' : kind === 2 ? '255,120,40' : '196,204,218';
    gr.addColorStop(0, 'rgba(' + col + ',1)'); gr.addColorStop(0.35, 'rgba(' + col + ',0.78)'); gr.addColorStop(0.7, 'rgba(' + rim + ',0.32)'); gr.addColorStop(1, 'rgba(' + rim + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    SPR[kind] = c;
    return c;
  }
  function glowSprite(col) {
    const key = 'g' + col;
    if (SPR[key]) return SPR[key];
    const c = N.render.makeCanvas(32, 32), g = c.getContext('2d');
    const rgb = U.hexToRgb ? U.hexToRgb(col) : { r: 255, g: 140, b: 60 };
    const s = (rgb.r != null ? [rgb.r, rgb.g, rgb.b] : rgb).join(',');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(' + s + ',1)'); gr.addColorStop(0.35, 'rgba(' + s + ',0.5)'); gr.addColorStop(1, 'rgba(' + s + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    SPR[key] = c;
    return c;
  }
  const PS = { t: 0, s: 0, a: 0 };
  function drawParticles(sc) {
    if (!P.n) return;
    const vis = 1 - TUNE.rainSteam * sc.rain;
    const night = N.render.night || 0;
    let add = false;
    for (let i = 0; i < P.n; i++) {
      if (P.sc[i] !== sc.uid) continue;
      pState(i, PS);
      const kd = P.kind[i];
      const k = kk(P.h[i]), X = SX(P.x[i], k), Y = SY(P.y[i], k);
      if (kd === 2) {
        if (!add) { CTX.globalCompositeOperation = 'lighter'; add = true; }
        CTX.globalAlpha = clamp(PS.a * (0.6 + night * 0.4), 0, 1);
        CTX.fillStyle = PS.t < 0.5 ? '#ffd27a' : '#ff7a2a';
        const s = Math.max(0.8, PS.s * k);
        CTX.fillRect(X - s / 2, Y - s / 2, s, s);
        continue;
      }
      if (add) { CTX.globalCompositeOperation = 'source-over'; add = false; }
      const sz = PS.s * k * 2;
      CTX.globalAlpha = clamp(PS.a * vis * (kd === 3 ? 0.8 : 1) * (1 - night * 0.35), 0, 1);
      CTX.drawImage(puffSprite(kd === 3 ? 0 : kd), X - sz / 2, Y - sz / 2, sz, sz);
    }
    CTX.globalAlpha = 1; CTX.globalCompositeOperation = 'source-over';
  }
  function drawSceneOverlay(ctx, sc) {
    if (!sc.on) return;
    const t0 = now();
    frame2d(ctx);
    try {
      drawStove(sc);
      for (const v of sc.vendors) drawArms(v);
      drawTarp(sc);
      drawParticles(sc);
    } catch (e) { N.err('streetfood.draw', e); }
    resetCtx(ctx);
    ST.draw2dAcc += now() - t0;
  }
  // the extra carts' own bodies (pani puri, bhutta, ice gola)
  function drawExtraCart(ctx, e) {
    const t0 = now();
    frame2d(ctx);
    try {
      const sp = e.spot, F = sp.frame, kind = e.cartKind, hl = F.hl, hw = F.hw;
      const D = N.draw;
      // bed on two cycle wheels, handles
      quad(F, -hl, -hw, hl, hw, 4.4, '#6a4a2a');
      for (const s of [1, -1]) { const x = fx(F, 0, s * (hw + 0.3)), y = fy(F, 0, s * (hw + 0.3)); ell(x, y, 2.2, 2.6, 0.35, Math.atan2(F.ay, F.ax), '#2a2420'); }
      seg(fx(F, -hl, hw * 0.6), fy(F, -hl, hw * 0.6), 4.6, fx(F, -hl - 3, hw * 0.6), fy(F, -hl - 3, hw * 0.6), 5.4, 0.55, '#6a4a2a');
      seg(fx(F, -hl, -hw * 0.6), fy(F, -hl, -hw * 0.6), 4.6, fx(F, -hl - 3, -hw * 0.6), fy(F, -hl - 3, -hw * 0.6), 5.4, 0.55, '#6a4a2a');
      quad(F, -hl + 0.3, -hw + 0.3, hl - 0.3, hw - 0.3, 4.8, '#8a6a42');
      if (kind === 'bhutta') {
        // corn heap (green husks + yellow cobs) and the iron sigri with glowing coals at the front
        for (let i = 0; i < 12; i++) { const u = -hl + 1.2 + (i % 6) * 1.5, v = -hw + 1.2 + Math.floor(i / 6) * 2.4; dot(fx(F, u, v), fy(F, u, v), 5.2, 0.9, i % 3 ? '#6a9a3a' : '#e0b840'); }
        const S = sp.slots && sp.slots.stove || { x: fx(F, hl * 0.35, 0), y: fy(F, hl * 0.35, 0), h: 4.6 };
        dot(S.x, S.y, 4.9, 2.6, '#2a2626'); dot(S.x, S.y, 5.0, 2.1, '#3a3030');
        const t = simT(), sc = sp.scene, fan = sc && sc.vendor ? sc.vendor.fan : 0.3;
        for (let i = 0; i < 7; i++) { const a = i * 0.9, r = 0.4 + (i % 3) * 0.55; const b = 0.55 + 0.45 * Math.sin(t * (6 + fan * 10) + i * 1.9); dot(S.x + Math.cos(a) * r, S.y + Math.sin(a) * r, 5.05, 0.5, U.mix ? U.mix('#5a1a08', '#ff8a20', clamp(b * (0.6 + fan * 0.5), 0, 1)) : '#ff6a20'); }
        for (let i = 0; i < 3; i++) { const ang = Math.atan2(F.ay, F.ax) + PI / 2, off = (i - 1) * 1.3; const x = S.x + F.ax * off, y = S.y + F.ay * off; seg(x - Math.cos(ang) * 1.6, y - Math.sin(ang) * 1.6, 5.4, x + Math.cos(ang) * 1.6, y + Math.sin(ang) * 1.6, 5.4, 0.85, i === 1 ? '#c89a30' : '#e0b030'); }
        // petromax on a pole
        const lx = fx(F, -hl + 1, -hw + 0.8), ly = fy(F, -hl + 1, -hw + 0.8);
        seg(lx, ly, 4.8, lx, ly, 10.5, 0.3, '#6a6a6a'); dot(lx, ly, 10.6, 0.8, '#f8f0d8');
      } else if (kind === 'panipuri') {
        // the glass box of golden puris, the pani matka, the potato-masala pot
        quad(F, -hl + 1, -hw + 0.8, hl * 0.3, hw - 0.8, 7.4, 'rgba(210,236,244,0.55)');
        for (let i = 0; i < 14; i++) { const u = -hl + 2 + (i % 7) * 1.25, v = -1.2 + Math.floor(i / 7) * 2.2; dot(fx(F, u, v), fy(F, u, v), 7.5, 0.55, '#e0b050'); }
        const mx = fx(F, hl - 1.6, 0), my = fy(F, hl - 1.6, 0);
        dot(mx, my, 6.2, 1.6, '#a8502a'); dot(mx, my, 6.3, 1.15, '#4a7a3a');
        const px = fx(F, hl - 4.2, hw * 0.4), py = fy(F, hl - 4.2, hw * 0.4); dot(px, py, 5.8, 1.1, '#b8bcc4'); dot(px, py, 5.85, 0.8, '#e8c060');
        // stacks of leaf bowls
        const lx = fx(F, hl - 4.2, -hw * 0.45), ly = fy(F, hl - 4.2, -hw * 0.45); dot(lx, ly, 5.4, 1.0, '#3f7a2a');
        const tx = fx(F, -hl + 0.5, hw - 0.6), ty = fy(F, -hl + 0.5, hw - 0.6);
        seg(tx, ty, 4.8, tx, ty, 10.5, 0.3, '#6a6a6a'); dot(tx, ty, 10.6, 0.8, '#f8f0d8');
      } else if (kind === 'gola') {
        quad(F, -hl + 1, -hw + 0.6, hl - 1, hw - 0.6, 5.0, '#3a6a9a');
        quad(F, -1.6, -1, 1.6, 1, 5.8, '#e8f4f8');
        for (let i = 0; i < 5; i++) dot(fx(F, -hl + 1.6 + i * 1.1, -hw + 1.1), fy(F, -hl + 1.6 + i * 1.1, -hw + 1.1), 6.4, 0.45, ['#e8203a', '#f2c230', '#30c050', '#f06aa0', '#8a3ad8'][i]);
        // the big umbrella
        const ux = fx(F, -hl + 1, 0), uy = fy(F, -hl + 1, 0), k = kk(12), X = SX(ux, k), Y = SY(uy, k), r = 6 * k;
        seg(ux, uy, 4.8, ux, uy, 12, 0.3, '#6a6a6a');
        for (let i = 0; i < 8; i++) { CTX.beginPath(); CTX.moveTo(X, Y); CTX.arc(X, Y, r, (i / 8) * TAU, ((i + 1) / 8) * TAU); CTX.closePath(); CTX.fillStyle = i % 2 ? '#f2c230' : '#e8203a'; CTX.fill(); }
      }
      void D;
    } catch (err) { N.err('streetfood.cart2d', err); }
    resetCtx(ctx);
    ST.draw2dAcc += now() - t0;
  }
  // one batched contact-shadow fill for every crowd member and vendor in view
  function drawShadows(ctx) {
    const Rr = N.render, s = Rr.sun, Z = Rr.Z || 1, v = Rr.view;
    const ox = s.sx * 1.6, oy = s.sy * 1.6;
    ctx.globalAlpha = 0.28 * s.strength + 0.08;
    ctx.fillStyle = '#1a1020';
    ctx.beginPath();
    const add = (e) => {
      if (!e.alive || e.hidden || e.hide2d || e.x < v.x0 - 10 || e.x > v.x1 + 10 || e.y < v.y0 - 10 || e.y > v.y1 + 10) return;
      const X = Rr.sx(e.x + ox, Z), Y = Rr.sy(e.y + oy, Z), rx = (e.down ? 5 : 3.4) * Z, ry = 2.6 * Z;
      ctx.moveTo(X + rx, Y); ctx.ellipse(X, Y, rx, ry, e.angle || 0, 0, TAU);
    };
    for (const p of PATRONS) add(p);
    for (const p of VENDORS) add(p);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // night lights: the stove glow, petromax / tube lamps (N.render.lights: both views)
  function pushLights(sc) {
    const Rr = N.render, night = Rr.night || 0;
    if (night < 0.04 || !Rr.lights) return;
    const K = sc.K, t = simT(), S = stoveOf(sc), n0 = Rr.lights.length;
    if (S && K.glow && (K.cart === 'bhutta' || sc.vendor || sc.spot.art)) {
      const fl = 0.78 + 0.22 * Math.sin(t * 11 + sc.uid * 3) * Math.sin(t * 6.7 + sc.uid);
      Rr.lights.push({ x: S.x, y: S.y, r: K.cart === 'bhutta' ? 20 : 12, color: K.glow, intensity: (K.cart === 'bhutta' ? 0.7 : 0.45) * fl, h: S.h });
    }
    const F = sc.F;
    if (K.lamp === 'petromax') Rr.lights.push({ x: fx(F, -F.hl + 1, -F.hw + 0.8), y: fy(F, -F.hl + 1, -F.hw + 0.8), r: 40, color: '#fff2c8', intensity: 0.95, h: 10 });
    else if (K.lamp === 'tube') Rr.lights.push({ x: F.cx + F.nx * 2, y: F.cy + F.ny * 2, r: 34, color: '#e8f4ff', intensity: 0.85, h: 10 });
    else if (K.lamp === 'bulb' && is3D()) Rr.lights.push({ x: fx(F, F.hl - 2, 0), y: fy(F, F.hl - 2, 0), r: 30, color: '#fff0c0', intensity: 0.9, h: 9 }); // 2D: places_art lights its own cart bulb
    ST.lightAcc += Rr.lights.length - n0;
  }

  /* ================================================================ 3D */
  // view3d.js loads after this file: everything 3D registers lazily (register3d, from the system init)
  const V3 = { get active() { return !!(N.view3d && N.view3d.active); } };
  const G3 = { THREE: null, H: null, ready: false, grp: null, pts: null, spk: null, geo: {}, mat: {}, scenes: new Map(), ms: 0 };
  const SH = (o) => { if (o) { o.userData = o.userData || {}; o.userData.shared = true; } return o; };
  // [terrain] the ground under a point (terrain.js via view3d.js; 0 while not ready), and the ground a scene's cart / stove
  // stands on (once per scene): an extra cart's entity (sf:cart, drawn at H.elev), a landmark cart's base as the core lifts
  // it (the low corner of its footprint), a hotel bhatti's footprint, else the ground under the stove. Stove heights (S.h),
  // hand heights and particle heights stay over the ground: the 3D adds this
  const TZ = (x, y) => (G3.H && G3.H.terrainAt ? G3.H.terrainAt(x, y) : 0);
  function sceneBase(sc) {
    if (sc.tb3 != null) return sc.tb3;
    const H = G3.H, sp = sc.spot, S = sc.sl.stove3 || sc.sl.stove, TB = (x0, y0, x1, y1) => (H && H.terrainBase ? H.terrainBase(x0, y0, x1, y1) : 0);
    let t;
    if (sp.cartE) t = H && H.elev ? H.elev(sp.cartE) : 0;
    else if (sp.lm && sp.K.type === 'cart') { const lm = sp.lm; t = TB(lm.x - (lm.w || 20) / 2, lm.y - (lm.d || 20) / 2, lm.x + (lm.w || 20) / 2, lm.y + (lm.d || 20) / 2); }
    else if (sp.art === 'rest' && S) t = TB(S.x - 3.4, S.y - 3.4, S.x + 3.4, S.y + 3.4);
    else t = S ? TZ(S.x, S.y) : TZ(sc.F.cx, sc.F.cy);
    return (sc.tb3 = t);
  }
  function geo3(THREE) {
    const g = G3.geo;
    if (g.ready) return g;
    g.disc = SH(new THREE.CircleGeometry(1, 24)); g.disc.rotateX(-PI / 2);
    g.half = SH(new THREE.CircleGeometry(1, 16, 0, PI)); g.half.rotateX(-PI / 2);
    g.roll = SH(new THREE.CylinderGeometry(1, 1, 1, 10)); g.roll.rotateZ(PI / 2);
    g.ball = SH(new THREE.SphereGeometry(1, 8, 6));
    g.cyl = SH(new THREE.CylinderGeometry(1, 1, 1, 10));
    g.box = SH(new THREE.BoxGeometry(1, 1, 1));
    g.cone = SH(new THREE.ConeGeometry(1, 1, 8, 1, true));
    g.tet = SH(new THREE.TetrahedronGeometry(1));
    g.ready = true;
    return g;
  }
  function M3(hex, o) { return G3.H.mat(hex, o); } // cached + shared (view3d.js)

  // ---- particles: two Points draws (steam + smoke with normal blending, embers additive)
  const PT_VS = [
    'attribute vec2 aSA; attribute vec3 aCol; varying vec4 vCol; uniform float uScale;',
    'void main() { vCol = vec4(aCol, aSA.y); vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = clamp(aSA.x * uScale / max(1.0, -mv.z), 1.0, 256.0); gl_Position = projectionMatrix * mv; }',
  ].join('\n');
  const PT_FS = [
    'varying vec4 vCol; uniform float uHard;',
    'void main() { vec2 d = gl_PointCoord - vec2(0.5); float r = length(d) * 2.0;',
    '  float a = mix(1.0 - smoothstep(0.0, 1.0, r), 1.0 - step(0.8, r), uHard); a = pow(a, 1.4);',
    '  if (vCol.a * a < 0.004) discard; gl_FragColor = vec4(vCol.rgb, vCol.a * a); }',
  ].join('\n');
  function makePoints(THREE, n, additive) {
    const geo = new THREE.BufferGeometry();
    // colour as a vec3, size + alpha as a vec2 (a vec4 colour's 4th component did not reach SwiftShader)
    const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3), col = new THREE.BufferAttribute(new Float32Array(n * 3), 3), siz = new THREE.BufferAttribute(new Float32Array(n * 2), 2);
    for (const a of [pos, col, siz]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pos); geo.setAttribute('aCol', col); geo.setAttribute('aSA', siz);
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const mat = new THREE.ShaderMaterial({
      vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 }, uHard: { value: additive ? 0.6 : 0 } },
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.renderOrder = 5; pts.userData.noShadow = true;
    return pts;
  }
  const LAMP_C = [1.0, 0.78, 0.5];
  function fillPoints(H) {
    const steam = G3.pts, spk = G3.spk;
    if (!steam) return;
    const sp = steam.geometry.attributes.position.array, sc = steam.geometry.attributes.aCol.array, ss = steam.geometry.attributes.aSA.array;
    const kp = spk.geometry.attributes.position.array, kc = spk.geometry.attributes.aCol.array, ks = spk.geometry.attributes.aSA.array;
    const night = clamp(H.night || 0, 0, 1), day = clamp(H.day == null ? 1 - night : H.day, 0, 1);
    const amb = 0.28 + 0.62 * day;
    let n = 0, m = 0;
    const lamps = [], tbs = [];
    for (const s of ACTIVE) { const S = stoveOf(s); if (S && (s.K.lamp || s.K.glow)) lamps.push(S.x, S.y, s.rain, s.uid); tbs.push(s.uid, sceneBase(s)); }
    for (let i = 0; i < P.n; i++) {
      pState(i, PS);
      let tb = null; for (let j = 0; j < tbs.length; j += 2) if (tbs[j] === P.sc[i]) { tb = tbs[j + 1]; break; }
      const k = P.kind[i], x = P.x[i], y = P.y[i], h = P.h[i] * 1.12 + (tb != null ? tb : TZ(x, y)); // [terrain]
      if (k === 2) {
        if (m >= 64) continue;
        kp[m * 3] = x; kp[m * 3 + 1] = h; kp[m * 3 + 2] = y;
        kc[m * 3] = 1; kc[m * 3 + 1] = PS.t < 0.5 ? 0.75 : 0.45; kc[m * 3 + 2] = 0.2;
        ks[m * 2] = 0.9; ks[m * 2 + 1] = PS.a; m++;
        continue;
      }
      if (n >= PMAX) break;
      // the cart lamp lights the steam at night
      let lit = 0, rain = 0;
      for (let j = 0; j < lamps.length; j += 4) { const d = Math.hypot(x - lamps[j], y - lamps[j + 1]); if (d < 26) lit = Math.max(lit, 1 - d / 26); if (lamps[j + 3] === P.sc[i]) rain = lamps[j + 2]; }
      lit *= night;
      const base = k === 1 ? 0.5 : 0.94;
      sp[n * 3] = x; sp[n * 3 + 1] = h; sp[n * 3 + 2] = y;
      sc[n * 3] = base * amb + LAMP_C[0] * lit * 0.8; sc[n * 3 + 1] = base * amb * (k === 1 ? 0.95 : 1) + LAMP_C[1] * lit * 0.8; sc[n * 3 + 2] = base * amb * (k === 1 ? 0.9 : 1.02) + LAMP_C[2] * lit * 0.8;
      ss[n * 2] = PS.s * 2.5;
      ss[n * 2 + 1] = clamp(PS.a * (1 - TUNE.rainSteam * rain) * (k === 3 ? 0.85 : 1.15) * (1 + lit * 0.4), 0, 1);
      n++;
    }
    steam.geometry.setDrawRange(0, n); spk.geometry.setDrawRange(0, m);
    for (const p of [steam, spk]) { const a = p.geometry.attributes; a.position.needsUpdate = true; a.aCol.needsUpdate = true; a.aSA.needsUpdate = true; }
    // pixels per world unit at distance 1
    const cam = H.camera, r = H.renderer;
    if (cam && r) { const hpx = r.domElement.height || 720; const u = hpx / (2 * Math.tan((cam.fov * PI) / 360)); steam.material.uniforms.uScale.value = u; spk.material.uniforms.uScale.value = u; }
  }

  // ---- the procedural vendor (actor renderer 'sf:vendor'): body + two animated arms + tools
  const WRAP = { uncle: 1, lungi: 1, aunty: 1, saree: 1, burqa: 1 };
  function vendorModel(e, H) {
    const THREE = H.THREE, L = e.look || {}, root = new THREE.Group(), inner = new THREE.Group();
    root.add(inner);
    const b = H.builder();
    const skin = L.skin || '#a0683f', hair = L.hair || '#1a1412';
    const kind = L.kind || 'man', wrap = !!WRAP[kind];
    const shirt = kind === 'uncle' ? '#f2efe6' : kind === 'aunty' || kind === 'saree' ? (L.blouse || '#7a3a3a') : (L.shirt || '#e8e0d0');
    const low = kind === 'aunty' || kind === 'saree' ? (L.saree || '#d8402a') : wrap ? (L.lungi || '#2a5cb8') : (L.pants || '#3a3a4a');
    b.color('#2a2220').box(-0.5, 0, -0.7, 0.9, 0.35, -0.15).box(-0.5, 0, 0.15, 0.9, 0.35, 0.7);
    if (wrap) b.color(low).cyl(0, 0.3, 0, 1.05, 0.9, 4.2, 10);
    else { b.color(low).box(-0.38, 0.3, -0.72, 0.38, 4.5, -0.08).box(-0.38, 0.3, 0.08, 0.38, 4.5, 0.72); }
    b.color(shirt).box(-0.62, 4.3, -1.15, 0.62, 7.25, 1.15);
    if (kind === 'aunty' || kind === 'saree') b.color(low).box(-0.66, 4.3, -1.18, 0.66, 7.0, -0.2); // the pallu
    if (L.belly) b.color(shirt).sphere(0.45, 5.2, 0, 0.55, 0.8, 0.95, 8, 5);
    if (L.towel) b.color(L.towel).box(-0.55, 6.95, -1.32, 0.55, 7.55, -0.72);
    b.color(skin).cyl(0, 7.2, 0, 0.32, 0.32, 0.5, 6).sphere(0.08, 8.2, 0, 0.8, 0.92, 0.78, 10, 8);
    b.color(hair).sphere(-0.16, 8.55, 0, 0.82, 0.6, 0.8, 10, 6);
    if (kind === 'aunty' || kind === 'saree') b.color(hair).sphere(-0.95, 8.1, 0, 0.42, 0.42, 0.42, 6, 5);
    if (L.cap === 'topi' || L.hat === 'skull') b.color(L.hatColor || '#f4f2ea').cyl(-0.05, 8.75, 0, 0.78, 0.74, 0.42, 10);
    const body = b.mesh(); if (body) inner.add(body);
    const arms = [];
    for (const side of [1, -1]) {
      const pv = new THREE.Group(); pv.position.set(0.05, 7.0, 1.3 * side); pv.rotation.order = 'YZX';
      const ab = H.builder();
      ab.color(kind === 'uncle' ? skin : shirt).cyl(0, -1.25, 0, 0.36, 0.34, 1.25, 7, { top: false });
      ab.color(skin).cyl(0, -3.3, 0, 0.27, 0.33, 2.1, 7, { top: false }).sphere(0, -3.45, 0, 0.36, 0.36, 0.36, 6, 4);
      const am = ab.mesh(); if (am) pv.add(am);
      const tool = new THREE.Group(); tool.position.set(0, -3.5, 0); pv.add(tool);
      inner.add(pv);
      arms.push({ pv, tool, tools: {}, cur: null, th: 0, ph: 0 });
    }
    root.userData.sf = { inner, arms, side: [1, -1] };
    return root;
  }
  function toolMesh(H, name) {
    const THREE = H.THREE, g = geo3(THREE), grp = new THREE.Group();
    const add = (geo, hex, sx, sy, sz, x, y, z, o) => { const m = new THREE.Mesh(geo, M3(hex, o)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); grp.add(m); return m; };
    switch (name) {
      case 'ladle': add(g.cyl, '#9aa0a6', 0.08, 2.2, 0.08, 0, -1.0, 0); add(g.ball, '#b8bcc4', 0.55, 0.3, 0.55, 0, -2.1, 0); break;
      case 'spatula': add(g.cyl, '#6a4a2a', 0.09, 1.6, 0.09, 0, -0.7, 0); add(g.box, '#c8ccd2', 1.0, 0.06, 0.8, 0.2, -1.55, 0); break;
      case 'oil': add(g.cyl, '#c8ccd2', 0.32, 1.0, 0.32, 0, -0.3, 0); break;
      case 'cloth': add(g.box, '#e8e0d0', 0.9, 0.2, 0.7, 0, -0.2, 0); break;
      case 'plate': add(g.cyl, '#b8bcc4', 1.25, 0.08, 1.25, 0.5, -0.1, 0); add(g.roll, '#d8a050', 0.95, 0.32, 0.32, 0.5, 0.12, 0); break;
      case 'samosas': for (let i = 0; i < 3; i++) add(g.tet, '#d89a3a', 0.35, 0.35, 0.35, (i - 1) * 0.5, -0.2, 0); break;
      case 'jhara': add(g.cyl, '#7a7e84', 0.07, 2.4, 0.07, 0, -1.1, 0); add(g.cyl, '#9aa0a6', 0.7, 0.06, 0.7, 0, -2.3, 0); break;
      case 'cone': add(g.cone, '#e8dcc0', 0.5, 1.1, 0.5, 0, -0.3, 0); break;
      case 'spoon': add(g.cyl, '#9aa0a6', 0.06, 1.4, 0.06, 0, -0.6, 0); break;
      case 'pan': add(g.cyl, '#9aa0a6', 0.75, 0.6, 0.75, 0.4, -0.2, 0); add(g.cyl, '#b07a3a', 0.62, 0.05, 0.62, 0.4, 0.12, 0); break;
      case 'glass': add(g.cyl, '#e8e4dc', 0.36, 0.8, 0.36, 0, 0.1, 0, { transparent: true, opacity: 0.8 }); add(g.cyl, '#b07a3a', 0.3, 0.55, 0.3, 0, 0.0, 0); break;
      case 'fan': add(g.cyl, '#7a5a32', 0.07, 0.8, 0.07, 0, -0.3, 0); add(g.box, '#c8a060', 1.5, 0.08, 1.2, 0, -1.2, 0); break;
      case 'lemon': add(g.ball, '#d8e04a', 0.35, 0.3, 0.3, 0, 0, 0); break;
      case 'cob': add(g.cyl, '#e0b030', 0.38, 2.2, 0.38, 0.4, 0, 0); break;
      case 'puri': add(g.ball, '#e0b050', 0.4, 0.3, 0.4, 0.3, 0, 0); break;
      case 'machete': add(g.cyl, '#3a2a1a', 0.1, 0.6, 0.1, 0, -0.2, 0); add(g.box, '#d8dce2', 0.5, 2.2, 0.06, 0.15, -1.5, 0); break;
      case 'coconut': add(g.ball, '#4f8a2a', 1.1, 1.2, 1.1, 0.6, 0.3, 0); break;
      case 'shaver': add(g.box, '#7a5a3a', 1.1, 0.5, 0.7, 0, -0.2, 0); break;
      case 'gola': add(g.cyl, '#d8c8a0', 0.06, 1.0, 0.06, 0, 0.2, 0); add(g.ball, '#e8203a', 0.7, 0.8, 0.7, 0, 1.0, 0); break;
      case 'bottle': add(g.cyl, '#d8203a', 0.25, 1.2, 0.25, 0, 0.3, 0); break;
      case 'garland': add(g.box, '#f08a1a', 2.0, 0.3, 0.3, 0, -0.2, 0); break;
      case 'bananas': for (let i = 0; i < 4; i++) add(g.cyl, '#f2d23a', 0.2, 1.4, 0.2, (i - 1.5) * 0.35, -0.4, 0); break;
      case 'paddle': add(g.cyl, '#8a6a3a', 0.2, 9, 0.2, 0, -3.6, 0); break;
      case 'bowl': add(g.cyl, '#b8bcc4', 1.0, 0.45, 0.8, 0.5, 0, 0); add(g.cyl, '#7a4a22', 0.85, 0.05, 0.85, 0.5, 0.24, 0); break;
      case 'parcel': add(g.box, '#e8dcc0', 1.4, 0.9, 1.0, 0.5, 0, 0); break;
      case 'tray': add(g.cyl, '#b8bcc4', 1.7, 0.08, 1.7, 0, 0.3, 0); for (let i = 0; i < 5; i++) add(g.cyl, '#b07a3a', 0.28, 0.7, 0.28, Math.cos(i * 1.26) * 0.9, 0.7, Math.sin(i * 1.26) * 0.9); break;
      default: return null;
    }
    return grp;
  }
  const _v = { x: 0, y: 0, z: 0 };
  function aimArm(arm, e, side, hand, el, dt, H) {
    // shoulder in world space
    const a = e.angle || 0, c = Math.cos(a), s = Math.sin(a);
    const sx = e.x + c * 0.05 - s * 1.3 * side, sy = e.y + s * 0.05 + c * 1.3 * side, sh = el + 7.0;
    const dx = hand.x - sx, dz = hand.y - sy, dy = hand.h * 1.0 + 0.4 + (e.sc ? sceneBase(e.sc) : TZ(hand.x, hand.y)) - sh; // [terrain]
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    const len = Math.hypot(lx, dy, lz) || 1;
    let th = Math.acos(clamp(-dy / len, -1, 1)), ph = Math.atan2(-lz, lx);
    if (Math.hypot(lx, lz) < 0.6 && len < 4.2) { th = 0.08; ph = 0; } // hanging by the side
    const k = Math.min(1, dt * 14);
    arm.th += (th - arm.th) * k;
    let dph = ph - arm.ph; while (dph > PI) dph -= TAU; while (dph < -PI) dph += TAU;
    arm.ph += dph * k;
    arm.pv.rotation.set(0, arm.ph, arm.th);
  }
  const VEND3 = {
    create(e, H) { geo3(H.THREE); return vendorModel(e, H); },
    update(obj, e, dt, H) {
      const el = H.elev ? H.elev(e) : 0;
      obj.position.set(e.x, el, e.y);
      obj.rotation.y = -(e.angle || 0);
      obj.visible = !e.hidden;
      const U3 = obj.userData.sf;
      if (!U3 || e.hidden) return;
      const hands = e.hands || {};
      const t = simT();
      U3.inner.position.y = Math.sin(t * 1.7 + (e.id || 0)) * 0.05;
      U3.inner.rotation.z = e.busy ? -0.12 : -0.04; // lean into the work
      for (let i = 0; i < 2; i++) {
        const arm = U3.arms[i], side = i === 0 ? 1 : -1, hd = i === 0 ? hands.r : hands.l;
        if (hd) aimArm(arm, e, side, hd, el, dt, H);
        // the tool in the hand
        const name = i === 0 ? hands.tool : (hands.tool === 'tray' ? 'tray' : hands.tool === 'pan' ? 'glass' : null);
        const want = i === 0 && hands.tool === 'tray' ? null : name;
        if (arm.cur !== want) {
          if (arm.cur && arm.tools[arm.cur]) arm.tools[arm.cur].visible = false;
          if (want) { if (!arm.tools[want]) { const m = toolMesh(H, want); if (m) { arm.tool.add(m); arm.tools[want] = m; } } if (arm.tools[want]) arm.tools[want].visible = true; }
          arm.cur = want;
        }
        if (want && arm.tools[want]) arm.tools[want].rotation.set(0, 0, -arm.th * 0.6);
      }
    },
    dispose() { /* per-vendor geometry is freed by view3d.js disposeObj; tools use shared geometry / materials */ },
    shadow: true,
  };

  // ---- the extra carts (actor renderer 'sf:cart'): bhutta sigri, pani puri, ice gola
  function cartModel(H, kind, hl, hw, opts) {
    const THREE = H.THREE, g = geo3(THREE), root = new THREE.Group();
    const b = H.builder(), bed = 4.4;
    b.color('#6a4a2a').box(-hl, bed - 0.6, -hw, hl, bed, hw);
    b.color('#8a6a42').box(-hl + 0.3, bed, -hw + 0.3, hl - 0.3, bed + 0.12, hw - 0.3);
    b.color('#4a3a2a').box(-hl - 3.2, bed + 0.2, -hw * 0.6 - 0.2, -hl, bed + 0.5, -hw * 0.6 + 0.2).box(-hl - 3.2, bed + 0.2, hw * 0.6 - 0.2, -hl, bed + 0.5, hw * 0.6 + 0.2);
    b.color('#3a3a3a').box(hl - 1.6, 0, -0.35, hl - 0.9, bed - 0.6, 0.35);
    const parts = { coals: null, cobs: [], lamp: null, glow: null, glowS: null };
    if (kind === 'bhutta') {
      for (let i = 0; i < 12; i++) { const u = -hl + 1.2 + (i % 6) * 1.4, v = -hw + 1.0 + Math.floor(i / 6) * 2.2; b.color(i % 3 ? '#6a9a3a' : '#e0b840').sphere(u, bed + 0.7, v, 0.9, 0.55, 0.65, 6, 4); }
      const su = hl * 0.35;
      b.color('#2a2626').cyl(su, bed + 0.1, 0, 2.3, 2.6, 1.0, 12).color('#1a1616').cyl(su, bed + 1.1, 0, 2.0, 2.0, 0.05, 12);
      const cm = new THREE.MeshLambertMaterial({ color: '#4a1a08', emissive: '#ff5a10', emissiveIntensity: 0.6 });
      const coals = new THREE.Group();
      for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(g.ball, cm); const a = i * 0.9, r = 0.4 + (i % 3) * 0.5; m.scale.set(0.5, 0.3, 0.5); m.position.set(su + Math.cos(a) * r, bed + 1.2, Math.sin(a) * r); coals.add(m); }
      root.add(coals); parts.coals = cm;
      for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(g.roll, M3('#e0b030')); m.scale.set(1.6, 0.45, 0.45); m.rotation.y = PI / 2; m.position.set(su + (i - 1) * 1.2, bed + 1.6, 0); root.add(m); parts.cobs.push(m); }
    } else if (kind === 'panipuri') {
      const gl = new THREE.Mesh(g.box, M3('#d2ecf4', { transparent: true, opacity: 0.42 })); gl.scale.set(hl * 1.2, 2.6, hw * 2 - 1.4); gl.position.set(-hl * 0.35, bed + 1.4, 0); root.add(gl);
      for (let i = 0; i < 14; i++) b.color('#e0b050').sphere(-hl + 2 + (i % 7) * 1.1, bed + 0.6 + Math.floor(i / 7) * 0.9, -0.8 + (i % 2) * 1.6, 0.5, 0.42, 0.5, 6, 4);
      b.color('#a8502a').sphere(hl - 1.6, bed + 1.2, 0, 1.5, 1.3, 1.5, 9, 6).color('#4a7a3a').cyl(hl - 1.6, bed + 2.3, 0, 1.0, 1.0, 0.1, 9);
      b.color('#b8bcc4').cyl(hl - 4.2, bed, hw * 0.4, 1.0, 1.0, 1.1, 9).color('#e8c060').cyl(hl - 4.2, bed + 1.1, hw * 0.4, 0.85, 0.85, 0.05, 9);
      b.color('#3f7a2a').cyl(hl - 4.2, bed, -hw * 0.45, 0.95, 0.95, 0.5, 9);
    } else if (kind === 'gola' || kind === 'peanut') {
      b.color(kind === 'gola' ? '#3a6a9a' : '#5a4a3a').box(-hl + 0.6, bed + 0.12, -hw + 0.5, hl - 0.6, bed + 0.9, hw - 0.5);
      if (kind === 'gola') {
        b.color('#e8f4f8').box(-1.4, bed + 0.9, -1, 1.4, bed + 2.5, 1);
        const cols = ['#e8203a', '#f2c230', '#30c050', '#f06aa0', '#8a3ad8'];
        for (let i = 0; i < 5; i++) b.color(cols[i]).cyl(-hl + 1.6 + i * 1.1, bed + 0.9, -hw + 1.1, 0.28, 0.28, 1.6, 6);
        const pole = new THREE.Mesh(g.cyl, M3('#7a7e84')); pole.scale.set(0.2, 8, 0.2); pole.position.set(-hl + 1, bed + 4, 0); root.add(pole);
        const um = new THREE.Mesh(g.cone, M3('#f2c230', { double: true })); um.scale.set(6, 2, 6); um.position.set(-hl + 1, bed + 8.4, 0); root.add(um);
      } else {
        b.color('#2a2a2e').cyl(0, bed + 0.9, 0, 1.4, 1.4, 1.4, 10).color('#c8a060').cyl(0, bed + 2.3, 0, 1.3, 1.3, 0.05, 10);
      }
    }
    if (opts && opts.lamp) {
      const lu = -hl + 1, lv = -hw + 0.8;
      b.color('#6a6a6a').cyl(lu, bed, lv, 0.15, 0.15, 6, 5);
      const lm = new THREE.Mesh(g.ball, M3('#fff4d8', { emissive: '#fff0c0', emissiveIntensity: 0.4 })); lm.scale.set(0.8, 0.95, 0.8); lm.position.set(lu, bed + 6.4, lv); root.add(lm);
      parts.lamp = lm.material;
      const gs = H.glow('#ffe6b0', 14); gs.position.set(lu, bed + 6.4, lv); gs.material.opacity = 0; root.add(gs); parts.glowS = gs;
    }
    if (opts && opts.stoveGlow) { const gs = H.glow(opts.stoveGlow, 9); gs.position.set(hl * 0.35, bed + 1.6, 0); gs.material.opacity = 0; root.add(gs); parts.glow = gs; }
    const m = b.mesh(); if (m) root.add(m);
    root.userData.sf = parts;
    return root;
  }
  const CART3 = {
    create(e, H) {
      const sp = e.spot, F = sp.frame, K = sp.K;
      return cartModel(H, e.cartKind, F.hl, F.hw, { lamp: K.lamp === 'petromax', stoveGlow: K.glow });
    },
    update(obj, e, dt, H) {
      obj.position.set(e.x, H.elev ? H.elev(e) : 0, e.y);
      obj.rotation.y = -(e.angle || 0);
      const P0 = obj.userData.sf; if (!P0) return;
      const night = clamp(H.night || 0, 0, 1), t = simT();
      const sc = e.spot.scene, fan = sc && sc.vendor ? sc.vendor.fan : 0.3;
      if (P0.coals) P0.coals.emissiveIntensity = 0.45 + (0.35 + fan * 0.5) * (0.6 + 0.4 * Math.sin(t * (7 + fan * 8)));
      for (let i = 0; i < P0.cobs.length; i++) P0.cobs[i].rotation.x = t * 0.6 + i * 2;
      if (P0.lamp) P0.lamp.emissiveIntensity = 0.3 + night * 1.6;
      if (P0.glowS) P0.glowS.material.opacity = night * 0.9;
      if (P0.glow) P0.glow.material.opacity = night * (0.55 + fan * 0.35);
    },
    dispose() {},
  };

  // ---- per scene props in the layer: the dosa on the tawa, oil bubbles, chai stream, tarp, glows
  function scene3d(sc, H) {
    const THREE = H.THREE, g = geo3(THREE), grp = new THREE.Group();
    const o = { grp, dosa: null, dosaMat: null, half: null, roll: null, bubbles: [], fries: [], stream: null, tarp: null, glow: null, glowL: null, own: [], extra: null };
    const K = sc.K, S = sc.sl.stove3 || sc.sl.stove, w = K.vendor && K.vendor.work, tb = (o.tb = sceneBase(sc)); // [terrain]
    if (S && w === 'dosa') {
      const dm = new THREE.MeshLambertMaterial({ color: '#f4ecd2' }); o.dosaMat = dm; o.own.push(dm);
      o.dosa = new THREE.Mesh(g.disc, dm); o.dosa.position.set(S.x, S.h + 0.06 + tb, S.y); grp.add(o.dosa);
      o.half = new THREE.Mesh(g.half, dm); o.half.position.set(S.x, S.h + 0.08 + tb, S.y); grp.add(o.half);
      o.roll = new THREE.Mesh(g.roll, dm); o.roll.position.set(S.x, S.h + 0.35 + tb, S.y); grp.add(o.roll);
      const bucket = new THREE.Mesh(g.cyl, M3('#b8bcc4')); const F = sc.F; bucket.scale.set(1.0, 1.4, 1.0); bucket.position.set(S.x - F.ax * 3.4 - F.nx * 1.2, S.h + 0.7 + tb, S.y - F.ay * 3.4 - F.ny * 1.2); grp.add(bucket);
    }
    if (S && w === 'fry') {
      for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(g.ball, M3('#fff0b8', { emissive: '#7a5a20', emissiveIntensity: 0.3 })); m.position.set(S.x, S.h + 0.05 + tb, S.y); grp.add(m); o.bubbles.push(m); }
      for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(g.tet, M3('#d8a040')); m.scale.setScalar(0.5); grp.add(m); o.fries.push(m); }
    }
    if (w === 'chai') { o.stream = new THREE.Mesh(g.cyl, M3('#a8702e')); o.stream.visible = false; grp.add(o.stream); }
    if (K.shelter === 'tarp') {
      const F = sc.F, tg = new THREE.Group();
      const tm = new THREE.Mesh(g.box, M3('#2a5c9a', { double: true })); tm.scale.set(F.hl * 2 + 3, 0.15, F.hw * 2 + 9.8);
      const cu = 0, cv = (F.hw + 8.6 - F.hw - 1.2) / 2;
      tm.position.set(fx(F, cu, cv), 15.4, fy(F, cu, cv)); tm.rotation.y = -Math.atan2(F.ay, F.ax); tm.rotation.x = 0.05;
      tg.add(tm);
      let tt = Infinity;
      for (const [u, v] of [[-F.hl - 1.5, -F.hw - 1.2], [F.hl + 1.5, -F.hw - 1.2], [-F.hl - 1.5, F.hw + 8.6], [F.hl + 1.5, F.hw + 8.6]]) { const p = new THREE.Mesh(g.cyl, M3('#5a5a62')); p.scale.set(0.18, 15.4, 0.18); p.position.set(fx(F, u, v), 7.7, fy(F, u, v)); tg.add(p); tt = Math.min(tt, TZ(fx(F, u, v), fy(F, u, v))); }
      tg.position.y = tt; // [terrain] rigid, on the low side of its poles
      tg.visible = false; grp.add(tg); o.tarp = tg;
    }
    // carts that only 2D art draws (school gate carts) / the hotels' haleem bhatti
    if (sc.spot.kind === 'gate') { const m = cartModel(H, season('summer') ? 'gola' : 'peanut', 3.2, 1.9, {}); m.position.set(sc.F.cx, TZ(sc.F.cx, sc.F.cy), sc.F.cy); m.rotation.y = -Math.atan2(sc.F.ay, sc.F.ax); m.scale.set(0.85, 0.9, 0.85); grp.add(m); o.extra = m; }
    if (sc.spot.art === 'rest' && S) {
      const b = H.builder();
      b.color('#9a4a2a').box(S.x - 3.4, 0, S.y - 3.4, S.x + 3.4, 4.4, S.y + 3.4).color('#c87a3a').cyl(S.x, 4.4, S.y, 2.8, 3.0, 2.6, 14).color('#5a3a1a').cyl(S.x, 7.0, S.y, 2.5, 2.5, 0.05, 14);
      const m = b.mesh(); if (m) { m.position.y = tb; grp.add(m); }
    }
    if (S && K.glow) { o.glow = H.glow(K.glow, 10); o.glow.position.set(S.x, S.h + 0.8 + tb, S.y); o.glow.material.opacity = 0; grp.add(o.glow); o.own.push(o.glow.material); }
    if (K.lamp === 'tube') { const F = sc.F; o.glowL = H.glow('#e8f4ff', 16); o.glowL.position.set(F.cx + F.nx * 2, 14 + tb, F.cy + F.ny * 2); o.glowL.material.opacity = 0; grp.add(o.glowL); o.own.push(o.glowL.material); }
    return o;
  }
  const _q = { a: null, b: null, q: null };
  function update3dScene(sc, o, H) {
    const v = sc.vendor, S = stoveOf(sc), t = simT(), night = clamp(H.night || 0, 0, 1), tb = o.tb || 0;
    if (o.dosa && v) {
      const D = v.dosa, on = D.on && !v.hidden;
      const r = DOSA_R * 1.05 * D.r, col = DOSA_COL(D.brown * 0.85 + D.oil * 0.1);
      o.dosaMat.color.set(col);
      let cx = S.x, cy = S.y, hh = S.h + 0.06 + tb;
      if (v.ph === 'serve') { const c = sc.sl.counter, l = smooth(D.lift || 0) * 0.8; cx = lerp(S.x, c.x, l); cy = lerp(S.y, c.y, l); hh += Math.sin((D.lift || 0) * PI) * 1.4; }
      const f = D.fold, ang = -Math.atan2(sc.F.ay, sc.F.ax);
      o.dosa.visible = on && f < 0.05; o.dosa.position.set(cx, hh, cy); o.dosa.scale.setScalar(Math.max(0.01, r));
      o.half.visible = on && f >= 0.05 && f < 0.6; o.half.position.set(cx, hh + 0.02, cy); o.half.rotation.y = ang; o.half.scale.set(Math.max(0.01, r), 1 + f * 2, Math.max(0.01, r));
      o.roll.visible = on && f >= 0.6; o.roll.position.set(cx, hh + 0.3, cy); o.roll.rotation.y = ang; o.roll.scale.set(r * 2.1, r * 0.34, r * 0.34);
    }
    if (o.bubbles.length && S) {
      for (let i = 0; i < o.bubbles.length; i++) { const a = t * 2.2 + i * 1.25, rr2 = 0.5 + (i % 3) * 0.45, b = (Math.sin(t * 9 + i * 1.7) + 1) * 0.5; const m = o.bubbles[i]; m.position.set(S.x + Math.cos(a) * rr2, S.h + 0.05 + tb, S.y + Math.sin(a) * rr2); m.scale.setScalar(0.1 + b * 0.22); }
      const fry = v && v.batch && v.ph !== 'serve' && v.ph !== 'lift';
      for (let i = 0; i < o.fries.length; i++) { const m = o.fries[i]; m.visible = !!fry; if (fry) { const a = t * 0.8 + i * 1.6; m.position.set(S.x + Math.cos(a) * 1.0, S.h + 0.15 + tb, S.y + Math.sin(a) * 1.0); m.rotation.set(t + i, t * 0.7, 0); } }
    }
    if (o.stream && v) {
      const H2 = v.hands, show = H2.tip === 'stream' && v.pour > 0.05 && !v.hidden;
      o.stream.visible = show;
      if (show) {
        const THREE = H.THREE;
        if (!_q.a) { _q.a = new THREE.Vector3(); _q.b = new THREE.Vector3(); _q.q = new THREE.Vector3(0, 1, 0); }
        const a = _q.a.set(H2.r.x, H2.r.h + 0.2 + tb, H2.r.y), b = _q.b.set(H2.l.x, H2.l.h + 0.7 + tb, H2.l.y);
        const len = a.distanceTo(b);
        o.stream.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        o.stream.scale.set(0.12 + v.pour * 0.08, len, 0.12 + v.pour * 0.08);
        o.stream.quaternion.setFromUnitVectors(_q.q, b.sub(a).normalize());
      }
    }
    if (o.tarp) o.tarp.visible = sc.tarp > 0.5;
    if (o.glow) o.glow.material.opacity = night * (0.6 + 0.3 * Math.sin(t * 11 + sc.uid) * Math.sin(t * 6.3));
    if (o.glowL) o.glowL.material.opacity = night * 0.9;
  }
  function layerUpdate(dt, H) {
    const t0 = now();
    if (!G3.ready || !V3 || !V3.active) return;
    // scenes on / off
    for (const [sc, o] of G3.scenes) if (!sc.on) { G3.grp.remove(o.grp); for (const m of o.own) m.dispose(); o.grp.traverse((m) => { if (m.geometry && !(m.geometry.userData && m.geometry.userData.shared)) m.geometry.dispose(); }); G3.scenes.delete(sc); }
    for (const sc of ACTIVE) {
      let o = G3.scenes.get(sc);
      if (!o) { try { o = scene3d(sc, H); } catch (e) { N.err('streetfood.scene3d', e); o = { grp: new H.THREE.Group(), own: [], bubbles: [], fries: [] }; } G3.grp.add(o.grp); G3.scenes.set(sc, o); }
      try { update3dScene(sc, o, H); } catch (e) { N.err('streetfood.update3d', e); }
    }
    fillPoints(H);
    G3.ms = now() - t0;
  }
  let reg3d = false;
  function register3d() {
    const V = N.view3d;
    if (reg3d || !V || !V.registerLayer || !V.registerActorRenderer) return;
    reg3d = true;
    V.registerActorRenderer('sf:vendor', VEND3);
    V.registerActorRenderer('sf:cart', CART3);
    V.registerLayer('streetfood', {
      order: 60,
      init(THREE, H) {
        G3.THREE = THREE; G3.H = H;
        geo3(THREE);
        G3.grp = new THREE.Group(); G3.grp.name = 'streetfood';
        G3.pts = makePoints(THREE, PMAX, false); G3.spk = makePoints(THREE, 64, true);
        G3.grp.add(G3.pts); G3.grp.add(G3.spk);
        H.layer.add(G3.grp);
        G3.ready = true;
      },
      update(dt, H) { try { layerUpdate(dt, H); } catch (e) { N.err('streetfood.layer', e); } },
      dispose(H) {
        if (G3.grp && H && H.layer) H.layer.remove(G3.grp);
        for (const o of G3.scenes.values()) for (const m of o.own) m.dispose();
        G3.scenes.clear();
        for (const p of [G3.pts, G3.spk]) if (p) { p.geometry.dispose(); p.material.dispose(); }
        G3.ready = false;
      },
    });
  }
  N.on('boot', register3d);

  /* ================================================================ director */
  const ST = { spots: 0, ms: 0, msAvg: 0, ms2d: 0, ms3d: 0, draw2dAcc: 0, frames: 0, activations: 0, lights: 0, lightAcc: 0, recruited: 0, handedBack: 0, spawned: 0, served: 0 };
  let dirT = 0, ready = false;
  function actRadius() {
    if (is3D()) { const q = N.view3d.quality || {}; return Math.min(TUNE.act3D, (q.actorDist || 620) * 0.85); }
    const v = N.render && N.render.view;
    if (!v || !isFinite(v.x0)) return 400;
    const hd = Math.hypot(v.x1 - v.x0, v.y1 - v.y0) / 2;
    return clamp(hd * TUNE.actScreens, TUNE.actMin, TUNE.actMax);
  }
  function spotAvailable(sp, m) {
    if (API.enabled === false) return false;
    if (sp.K.when && !sp.K.when(sp)) return false;
    if (sp.cartE && !sp.present) return false;
    if (!cartPresent(sp, m)) return false;
    return true;
  }
  function direct() {
    const pl = N.player;
    if (!pl) return;
    const m = mins();
    const rOn = actRadius(), rOff = rOn * TUNE.offPad + 40;
    const cap = lowTier() ? TUNE.maxScenes.low : TUNE.maxScenes.desk;
    const cand = [];
    for (const sp of SPOTS) {
      const d = Math.hypot(sp.x - pl.x, sp.y - pl.y);
      sp.d = d - (sp.force ? 1e6 : 0);
      const avail = spotAvailable(sp, m);
      if (sp.scene) { if (!avail || (d > rOff && !sp.force)) releaseScene(sp.scene); else cand.push(sp); }
      else if (avail && (d < rOn || sp.force)) cand.push(sp);
    }
    cand.sort((a, b) => a.d - b.d);
    for (let i = 0; i < cand.length; i++) {
      const sp = cand[i];
      if (i < cap) { if (!sp.scene) { activateScene(sp); ST.activations++; } }
      else if (sp.scene) releaseScene(sp.scene);
    }
    // keep the active list nearest-first (the patron cap favours the nearest scenes)
    ACTIVE.sort((a, b) => a.spot.d - b.spot.d);
  }
  function init() {
    register3d();
    if (ready || !N.world || !N.world.built) return;
    ready = true;
    pCap = lowTier() ? TUNE.maxParticles.low : TUNE.maxParticles.desk;
    try { buildSpots(); } catch (e) { N.err('streetfood.spots', e); }
    hookShops();
  }
  function update(dt) {
    if (!ready) { init(); if (!ready) return; }
    const t0 = now();
    hookShops();
    refreshBhattis(dt);
    updatePresence(dt);
    dirT -= dt;
    if (dirT <= 0) { dirT = 0.25; direct(); sweepOrphans(); }
    for (let i = 0; i < ACTIVE.length; i++) { try { sceneUpdate(ACTIVE[i], dt); } catch (e) { N.err('streetfood.scene', e); } }
    updateParticles(dt);
    const ms = now() - t0;
    ST.ms = ms; ST.msAvg += (ms - ST.msAvg) * 0.05;
  }
  function draw() {
    if (!ready || !N.render) return;
    const Rr = N.render;
    ST.ms2d = ST.draw2dAcc; ST.draw2dAcc = 0; ST.ms3d = G3.ms; ST.lights = ST.lightAcc; ST.lightAcc = 0;
    debugTick();
    for (const sc of ACTIVE) pushLights(sc);
    if (is3D() || !ACTIVE.length) return;
    const v = Rr.view;
    Rr.queue('shadow', 1.6, drawShadows);
    for (const sc of ACTIVE) {
      const sp = sc.spot, F = sc.F;
      const r = Math.max(F.hl || 8, 8) + 30;
      if (sp.x + r < v.x0 || sp.x - r > v.x1 || sp.y + r < v.y0 || sp.y - r > v.y1) continue;
      // just after the cart / shop art (structures are drawn far to near)
      const key = sp.lm ? Rr.distKey(sp.lm.x, sp.lm.y) + 0.5 : Rr.distKey(sp.x, sp.y) + 0.5;
      Rr.queue('structures', key, sc.fn);
    }
  }
  // optional debug readout (style.css "streetfood" section): N.streetfood.debugHud(true) or Alt+F with #debug
  const DBG = { el: null, on: false, t: 0 };
  function debugHud(on) {
    DBG.on = on == null ? !DBG.on : !!on;
    if (DBG.on && !DBG.el) { const ui = document.getElementById('ui') || document.body; DBG.el = document.createElement('div'); DBG.el.className = 'sf-debug'; ui.appendChild(DBG.el); }
    if (DBG.el) DBG.el.classList.toggle('show', DBG.on);
    return DBG.on;
  }
  function debugTick() {
    if (!DBG.on || !DBG.el) return;
    const t = (N.time && N.time.real) || 0;
    if (t - DBG.t < 0.5) return;
    DBG.t = t;
    const st = API.stats();
    let s = '<b>street food</b> ' + st.active + ' scenes · ' + st.patrons + ' people · ' + st.particles + ' puffs · ' + st.ms + ' ms\n';
    for (const a of API.active().slice(0, 6)) s += a.id + ' ' + a.crowd + '/' + a.want + (a.vendor ? ' ' + a.vendor.ph : '') + (a.rain > 0.1 ? ' rain' : '') + '\n';
    DBG.el.innerHTML = s;
  }
  if (N.DEBUG) window.addEventListener('keydown', (e) => { if (e.altKey && (e.key === 'f' || e.key === 'F')) { debugHud(); e.preventDefault(); } });
  function resetAll() {
    for (const sc of ACTIVE.slice()) releaseScene(sc, true);
    for (const p of PATRONS.slice()) dropPatron(p);
    for (const v of ORPHANS.splice(0)) removeVeh(v);
    P.n = 0;
    for (const sp of SPOTS) { sp.force = null; if (sp.slots) for (const s of sp.slots.ring.concat(sp.slots.shelter, sp.slots.queue)) s.taken = null; }
    VEH_N = 0;
  }

  /* ================================================================ events */
  N.on('shop:buy', (d) => {
    try {
      if (!d || !d.place) return;
      let id = d.place;
      try { if (N.shops && N.shops.resolve) id = N.shops.resolve(id) || id; } catch (e) { /* ignore */ }
      const pl = N.player;
      for (const sc of ACTIVE) {
        if (sc.spot.place !== id && sc.spot.id !== id) continue;
        if (Math.hypot(sc.spot.x - pl.x, sc.spot.y - pl.y) > 60) continue;
        const v = sc.vendor;
        if (v && !v.hidden) { v.servePl = 1.2; bark(v, lineOf('serveP'), { force: true }); }
        sound(sc.K.sounds && sc.K.sounds.serve, sc.spot.x, sc.spot.y, { vol: 0.45, force: true });
        N.emit('streetfood:serve', { id: sc.spot.id, to: pl });
        // the crowd lets the kid through: whoever stands at the counter steps back a little
        const c = sc.counterBy; if (c) { c.ofx += (c.x - pl.x) * 0.3; c.ofy += (c.y - pl.y) * 0.3; }
      }
    } catch (e) { N.err('streetfood.shopBuy', e); }
  });
  N.on('world:built', () => { ready = false; resetAll(); });
  N.on('game:new', () => { dirT = 0; presSnap = true; });
  N.on('player:teleport', () => { dirT = 0; presSnap = true; });
  N.on('season:change', () => { bhattiT = 0; });

  N.addSystem({
    id: 'streetfood', order: 42, runIn: ['play', 'dialogue', 'cutscene'],
    init() { init(); },
    update(dt) { try { update(dt); } catch (e) { N.err('streetfood.update', e); } },
    draw() { try { draw(); } catch (e) { N.err('streetfood.draw2d', e); } },
    reset() { resetAll(); },
  });

  /* ================================================================ API */
  const API = (N.streetfood = {
    version: 1, enabled: true, density: 1, TUNE, KINDS, LINES,
    get spots() { return SPOTS; },
    spot: (id) => BYID.get(id) || null,
    scene: (id) => { const s = BYID.get(id); return s ? s.scene : null; },
    active() {
      return ACTIVE.map((sc) => ({
        id: sc.spot.id, kind: sc.spot.kind, x: sc.spot.x, y: sc.spot.y, want: sc.want, level: +sc.level.toFixed(2),
        crowd: sc.patrons.filter((p) => p.alive && p.st !== 'leave').length, all: sc.patrons.length,
        states: sc.patrons.reduce((o, p) => { o[p.st] = (o[p.st] || 0) + 1; return o; }, {}),
        vendor: sc.vendor ? { work: sc.vendor.work, ph: sc.vendor.ph, busy: sc.vendor.busy, cyc: sc.vendor.cyc, hidden: !!sc.vendor.hidden } : null,
        particles: (() => { let n = 0; for (let i = 0; i < P.n; i++) if (P.sc[i] === sc.uid) n++; return n; })(),
        vehicles: sc.vehicles.length, rain: +sc.rain.toFixed(2), tarp: +sc.tarp.toFixed(2),
        umbrellas: sc.patrons.filter((p) => p.umb).length, sheltered: sc.patrons.filter((p) => p.st === 'shelter').length,
        holding: sc.patrons.filter((p) => p.hold).length, d: Math.round(sc.spot.d),
      }));
    },
    nearest(x, y, kind) {
      let best = null, bd = 1e12;
      for (const s of SPOTS) { if (kind && s.kind !== kind) continue; const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y); if (d < bd) { bd = d; best = s; } }
      return best;
    },
    /** tests: pin a spot's crowd level (0..1, null = the schedule) and keep it active */
    force(id, o) {
      if (id == null) { for (const s of SPOTS) s.force = null; dirT = 0; return true; }
      const s = BYID.get(id); if (!s) return false;
      s.force = o === null ? null : Object.assign({ level: 1 }, o || {});
      if (s.cartE && !s.present) { s.forceShow = true; s.present = true; s.cartE.alive = true; s.cartE.id = 0; N.entities.add(s.cartE); }
      if (s.scene) { s.scene.lvlT = 0; }
      dirT = 0;
      return true;
    },
    stats() {
      let veh = 0; for (const sc of ACTIVE) veh += sc.vehicles.length;
      return {
        spots: SPOTS.length, active: ACTIVE.length, patrons: PATRONS.length, vendors: VENDORS.length, particles: P.n, vehicles: veh, orphans: ORPHANS.length,
        ms: +ST.ms.toFixed(3), msAvg: +ST.msAvg.toFixed(3), ms2d: +ST.ms2d.toFixed(3), ms3d: +ST.ms3d.toFixed(3), pool: POOL.length,
        activations: ST.activations, lights: ST.lights, recruited: ST.recruited, handedBack: ST.handedBack, served: ST.served, r: Math.round(actRadius()), s3d: G3.scenes.size, pts3d: G3.pts ? G3.pts.geometry.drawRange.count : -1, layer3d: G3.ready, kinds: SPOTS.reduce((o, s) => { o[s.kind] = (o[s.kind] || 0) + 1; return o; }, {}),
      };
    },
    register(id, spec) { if (!id || !spec) return false; KINDS[id] = Object.assign({ type: 'cart', max: 4, peaks: [], hold: null, eat: [10, 30], sounds: {} }, spec); return true; },
    addSpot(o) { const s = addSpot(o); if (s && s.extra) addCartEntity(s); return s; },
    rebuild() { resetAll(); buildSpots(); },
    debugHud,
    reset: resetAll,
    setDensity(d) { API.density = clamp(+d || 0, 0, 2); return API.density; },
    setOptions(o) { for (const k of ['particles', 'vehicles', 'barks', 'sounds', 'suppressArt', 'nightDosa']) if (o && o[k] != null) TUNE[k] = !!o[k]; return Object.assign({}, TUNE); },
    _debug: { P, ACTIVE, PATRONS, VENDORS, SPOTS, G3, slotsFor, levelOf, heldPos, emit },
  });
})();
