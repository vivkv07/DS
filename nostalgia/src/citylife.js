/* NOSTALGIA — citylife.js  (owner: city-life scenes developer, places) — design/atmosphere.md "City-life scenes"
 * (binding), design/places_registry.md (2003, no brands / phones / post-2003 things), ARCHITECTURE §6-§8, §17, §20, §21.
 *
 * "Tea shops, saloons, I want all the chaos in the city to be shown in the game as real scenes." This file stages the
 * PLACE-ANCHORED city-life scenes (the dynamic ones - junction chaos, colony mornings / evenings, cinema release day,
 * baraats - are citylife_events.js). Both views: top-down 2D (procedural, the places_art / streetfood visual language)
 * and the 3D view (people are real 'ped' entities that view3d_actors draws - seated, working, carrying head-loads -
 * plus props / particles from this file's layer).
 *
 *   irani     every Irani cafe landmark: a bench of uncles reading the (illegible) Eenadu / Siasat, chai glasses, the
 *             radio on its stool (instrumental), cyclists who push up for "do chai", cricket arguments; the waiter with
 *             the tray, the crowd ring and the steam are streetfood.js's 'irani' scene (reused, not doubled). The player
 *             can sit for chai: the shops.js 'sit' row of that cafe. Peaks 07:00-09:00 and 16:00-19:00.
 *   chai      roadside tea stalls (fixed shopfronts with a counter, glass biscuit jars, a tin back wall, a bench): the
 *             chai-wala, his pour, the crowd and the steam come from a streetfood kind registered here ('cl_chai' via
 *             N.streetfood.register + addSpot); this file draws the stall and the bench readers.
 *   saloon    every barber landmark (shops.js barbers: the haircut clears the Chappal Meter) + open-front roadside saloon
 *             cabins on commercial streets: the man in the chair under a white cloth (spray, comb, scissors, foam, razor
 *             on the strop, shave, the hand mirror, talc), kids getting a machine cut, the waiting bench with newspapers,
 *             the mirror, a haircut chart, painted FICTIONAL film-star posters, an instrumental radio; closed Tuesdays,
 *             Sunday mornings packed.
 *   busstop   every bus stop: the waiting crowd, a rush at the door when a traffic.js bus stops (or a scene-owned bus
 *             when none comes), men hanging on the footboard as it pulls out (never the player), the conductor's
 *             "Right, right!", peanut / cucumber sellers at the windows.
 *   trade     street trades on commercial frontages: cobbler under a tree, puncture shop (tube in a tub, bubbles),
 *             ironing-wala (coal iron smoking, stack of clothes), tailor at the sewing machine, knife sharpener's cycle
 *             (sparks), raddi-wala (call + scale, handcart), vegetable cart (calls), flower seller stringing garlands,
 *             cycle-repair stand, key maker.
 *   roadwork  a few real arterial road segments: dug-up strip with a barricade and a DIVERSION board, the tar drum
 *             smoking over a fire, a cement mixer, labourers with head-loads, a man with a pickaxe, a havaldar; only the
 *             kerb strip is used (traffic lanes stay open, nothing here collides with vehicles).
 * Kid-friendly (atmosphere.md): no politics, alcohol, smoking or gore, no begging; scenes keep away from places of
 * worship (respect zones); every community is shown at work and at ease.
 *
 * Each scene has data-driven rules (KINDS / TRADES: peaks by time of day, base, hours, day-of-week multipliers, district
 * style multipliers, season gates, rain response, shop status), activates within ~1.2 screens of the player (nearest
 * first, capped), uses pooled people / particles, reacts to the player (walkers step aside, people look at him, barks,
 * the havaldar whistles at a kid racing his cycle, labourers warn him off the pit) and can be staged with force().
 *
 * ------------------------------------------------------------------ API  N.citylife
 *   enabled (false: release everything)   TUNE   KINDS   TRADES   LINES
 *   spots (all)  spot(id)  scene(id)  nearest(x, y, kind?)  active() -> [{id, kind, sub, level, people, ...}]
 *   force(idOrKind | null, {level, bus}) -> spot id   tests: pin a spot (or the nearest spot of a kind / 'trade:<sub>')
 *   stats() -> {spots, active, people, pool, particles, ms, msAvg, ms2d, ms3d, kinds, s3d}
 *   rebuild()   setOptions({particles, barks, sounds})
 * Events: 'citylife:scene' {id, kind, on}, 'citylife:bus' {id, phase: 'arrive'|'depart'|'own'}.
 *
 * ------------------------------------------------------------------ HOOKS (files this module does not own)
 *  - streetfood.js (documented API "city-life scenes reuse these"): register('cl_chai', spec) + addSpot() for the tea
 *    stalls (re-added after a streetfood rebuild), active()/spot() to keep the Irani bench clear of its crowd ring.
 *  - traffic.js: makeLook / blitPerson (looks, cached sprites), spawnPed (a leaving person is handed back as a walker),
 *    busAt (buses stopped at stops), spawnVehicle('bus', ...) for the scene-owned bus.
 *  - shops.js: status() (open / closed), open(place, {focus: 'sit'}) at the Irani bench, buy(place, 'chai' | 'haircut')
 *    at the roadside stalls / saloons (nearest shop of that kind prices it); listens to 'shop:service' / 'shop:open'.
 *  - places_art.js: while a barber scene runs, the painted bench people of that landmark are hidden by wrapping its
 *    per-landmark counter lm._pa.count (restored behaviour when inactive; cosmetic only).
 *  - view3d.js (loads later): registerLayer('citylife') lazily at 'boot' / init. People use the documented entity
 *    fields view3d_actors reads: idle 'sit' / 'work', bench, z (footboard height), umb, look.prop ('pot' head-loads,
 *    'tray', 'basket'), lookAt / lookT. N.models3d.has('tree_neem') shades the cobbler when the pack has it.
 *  - audio (§17): N.audio.ext.registerSfx for cl_strop cl_clipper cl_sewing cl_grind cl_bubbles cl_tap cl_mixer
 *    cl_shovel cl_radio cl_iron cl_file (every call feature-checked); existing names: scissors whistle conductor
 *    air_brake cup_clink sip page_flip bell coin keys freewheel vendor_call.
 *
 * Performance: one system update (director every 0.25 s, scenes, pooled people, one particle array) and per scene one
 * low + one high 2D queue item (+ people sprites from traffic.js's cache); 3D: one merged static mesh per scene, a few
 * pooled dynamic meshes, two point draws. Budget for all city-life work ~1.5 ms/frame with three busy scenes on a phone.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.addSystem || !N.Actor) return;
  const U = N.util || {};
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
  const hash = (s) => (((U.strHash ? U.strHash(String(s)) : strHash(String(s))) >>> 0) / 4294967296);
  function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h; }
  const angDiff = (a, b) => { let d = b - a; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; };
  function rng(seed) { if (U.rng) return U.rng(seed); let s = strHash(String(seed)) >>> 0; return { next() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; } }; }
  function wpick(obj) { let t = 0; for (const k in obj) if (obj[k] > 0) t += obj[k]; if (t <= 0) return null; let r = rnd() * t; for (const k in obj) if (obj[k] > 0) { r -= obj[k]; if (r <= 0) return k; } return null; }

  /* ================================================================ clock / calendar / weather */
  const mins = () => (N.clock && isFinite(N.clock.minutes) ? N.clock.minutes : 720);
  const dayN = () => (N.clock && N.clock.day) || 0;
  const simT = () => (N.time && N.time.now) || 0;
  const realT = () => (N.time && N.time.real) || 0;
  function dow() {
    try { const d = N.calendar && N.calendar.date; if (d && isFinite(d.dow)) return d.dow; } catch (e) { /* stub */ }
    const b = (N.clock && N.clock.baseDate) || [2003, 0, 14];
    return new Date(Date.UTC(b[0], b[1], b[2] + dayN())).getUTCDay();
  }
  function season(n) {
    try { if (N.seasons && typeof N.seasons.is === 'function') return !!N.seasons.is(n); } catch (e) { /* stub */ }
    return !!(N.flags && N.flags[n]);
  }
  function rainLevel() {
    const W = N.weather;
    if (W && isFinite(W.rain)) return clamp(W.rain, 0, 1);
    if (season('rain') || (N.flags && (N.flags.raining || N.flags.rain === true))) return 0.7;
    return 0;
  }
  const isNight = () => { try { return !!(N.clock && N.clock.isNight && N.clock.isNight()); } catch (e) { const m = mins(); return m < 360 || m > 1110; } };
  const is3D = () => !!(N.view3d && N.view3d.active);
  const lowTier = () => {
    try { if (N.atmos && N.atmos.low != null) return !!N.atmos.low; } catch (e) { /* ignore */ }
    if (N.view3d && N.view3d.quality && N.view3d.quality.tier === 'low') return true;
    try { if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true; } catch (e) { /* ignore */ }
    return Math.min(window.innerWidth || 1280, window.innerHeight || 720) < 500;
  };

  /* ================================================================ tuning */
  const TUNE = {
    keep3dSecs: 120, keep3dMax: 8, // released scenes keep their built 3D group this long / this many
    maxScenes: { desk: 6, low: 4 }, maxPeople: { desk: 64, low: 40 }, maxParticles: { desk: 220, low: 140 },
    actScreens: 1.2, actMin: 230, actMax: 640, act3D: 460, offPad: 1.25,
    walk: [30, 42], barkGap: 2.4, barkR: 230, sfxGap: 0.22, sfxR: 320, glanceR: 18, aside: 9,
    handBack: true, whistleR: 55, whistleSpd: 34,
    particles: true, barks: true, sounds: true,
  };

  /* ================================================================ bark lines (Hyderabadi, kid-friendly) */
  const LINES = {
    cricket: [['Raghav hai toh match hai, miyan!', 'Arre, ek akela kya karega?'], ['Kal ki bowling dekhi? Ekdum bekaar!', 'Pitch hi aisa tha, yaar.'],
      ['World Cup hamara hai, likh ke le lo!', 'Pehle semi-final toh jeeto!'], ['Gopi ki googly, waah!', 'Arre, catch chhod diya na!'],
      ['Vinod ne bachaya, warna...', 'Haan, deewar hai woh, deewar!'], ['Last over mein six! Kya baat!', 'Radio pe sunte hi kood gaya main!']],
    paper: ['Aaj ka paper aaya?', 'Bhav phir badh gaye.', 'Is baar baarish late hai, likha hai.', 'Exhibition kab shuru hai?', 'Naya flyover ban raha, dekho.'],
    readerChai: ['Ek chai aur, anna!', 'Chai khadak banao!', 'Osmania do, plate bhar ke.'],
    cyclist: ['Anna, do chai! Jaldi!', 'Ek cutting, anna!', 'Chai, aur ek Osmania.', 'Do chai, ek bun!'],
    cyclistBye: ['Chalo, late ho gaya!', 'Kal milte, anna!', 'Paise rakh liye, anna!'],
    sitChai: ['Baitho beta, chai aati hai.', 'Aao, chhotu, baitho.'],
    barber: ['Sar seedha rakho, saab.', 'Thoda neeche... haan.', 'Chhota karoon ya medium?', 'Kaan pe chalaun?', 'Ho gaya, ekdum hero!', 'Agla kaun?'],
    barberKid: ['Hilna mat, beta! Machine hai.', 'Army cut, ekdum chhota!', 'Rona nahi, ho gaya!'],
    waiting: ['Kitna time aur, bhai?', 'Sunday ko hamesha line lagti.', 'Paper dena zara.', 'Mera number kab?'],
    barberPlayer: ['Aao chhotu, baitho. Do minute.', 'Haircut? Pehle line mein, haan!'],
    barberDone: ['Ho gaya! Pehchanega bhi nahi koi!', 'Ekdum film hero lag raha hai!'],
    waitingPlayer: ['Bachche ko pehle? Achha theek hai.', 'Arre, hum kab se baithe hain!'],
    busWait: ['Bus kab aayegi?', 'Aaj bhi late.', 'Yeh wali Koti jaati?', 'Pass dikhana padega.'],
    busRush: ['Ruko! Ruko!', 'Arre, chadhne do!', 'Peeche jao, jagah hai!', 'Dhakka mat do!', 'Jaldi chadho, jaldi!'],
    busMiss: ['Arre! Ruka hi nahi!', 'Agli wali mein chalenge.', 'Bas bhar gayi thi.'],
    conductor: ['Right, right!', 'Chalo, chalo, aage badho!', 'Ticket, ticket!', 'Andar chalo, footboard pe mat latko!'],
    hanger: ['Pakad ke rakhna!', 'Agle stop pe utrenge.', 'Jagah nahi andar!'],
    vendorPeanut: ['Palli! Garam palli!', 'Palli, do rupay!', 'Bhuni palli, le lo!'],
    vendorCucumber: ['Kheera! Thanda kheera!', 'Kheera, masala laga ke!'],
    vendorSamosa: ['Samosa, samosa! Garam!', 'Do samose, teen rupay!'],
    havaldar: ['Ae chhotu! Cycle dheere chala!', 'Oye! Race nahi hai yahan!', 'Dheere! Kaam chal raha hai!'],
    pit: ['Door raho, beta! Gaddha hai!', 'Idhar mat aao, chhotu!', 'Sambhal ke, beta!'],
    labour: ['Cement lao!', 'Aur ret!', 'Ek, do... uthao!', 'Thoda paani dalo!'],
    bump: ['Arre, dekh ke chalo!', 'Dhyaan se, bachcha!', 'Aaram se, beta.', 'Oho, kya jaldi hai?'],
    look: ['Kya dekh raha hai, chhotu?', 'School nahi gaya aaj?', 'Ghar jao, beta, dhoop hai.'],
  };

  /* ================================================================ frames (local u along, v outward) */
  // A frame maps local (u, v) to world: P = c + a * u + n * v. Shop frames (places_art frontOf convention): c = the
  // front edge centre, a = along the front, n = the outward normal. Frontage frames: c = a footpath point, n = to the road.
  function shopFrame(lm) {
    const x = lm.x - lm.w / 2, y = lm.y - lm.d / 2, w = lm.w, d = lm.d;
    const f = String(lm.face || (w >= d ? 's' : 'e')).toUpperCase();
    const F = { cx: 0, cy: 0, ax: 0, ay: 0, nx: 0, ny: 0, L: 0, D: 0, hl: 0, s: 1 };
    if (f === 'N') { F.ny = -1; F.ax = 1; F.cx = lm.x; F.cy = y; F.L = w; F.D = d; }
    else if (f === 'S') { F.ny = 1; F.ax = -1; F.cx = lm.x; F.cy = y + d; F.L = w; F.D = d; }
    else if (f === 'W') { F.nx = -1; F.ay = -1; F.cx = x; F.cy = lm.y; F.L = d; F.D = w; }
    else { F.nx = 1; F.ay = 1; F.cx = x + w; F.cy = lm.y; F.L = d; F.D = w; }
    F.hl = F.L / 2;
    return F;
  }
  function ptFrame(x, y, ax, ay, nx, ny, hl, s) { return { cx: x, cy: y, ax, ay, nx, ny, hl: hl || 8, L: (hl || 8) * 2, D: 6, s: s || 1 }; }
  const fx = (F, u, v) => F.cx + (F.ax * u + F.nx * v) * F.s;
  const fy = (F, u, v) => F.cy + (F.ay * u + F.ny * v) * F.s;
  const fang = (F) => Math.atan2(F.ny, F.nx);  // facing outward
  const aang = (F) => Math.atan2(F.ay, F.ax);  // along the front

  /* ================================================================ world checks */
  const SURF = () => N.SURF || {};
  let LMRECTS = null;
  function inLandmark(x, y, pad) {
    if (!LMRECTS) return false;
    for (let i = 0; i < LMRECTS.length; i += 4) if (x > LMRECTS[i] - pad && x < LMRECTS[i + 2] + pad && y > LMRECTS[i + 1] - pad && y < LMRECTS[i + 3] + pad) return true;
    return false;
  }
  /** a spot a person can stand on: walkable, off the carriageway, clear of walls, not water, not a respect compound */
  function walkOk(x, y, r, road) {
    const W = N.world, S = SURF();
    if (!W || !W.built || !isFinite(x) || !isFinite(y)) return false;
    if (!W.isWalkable(x, y)) return false;
    const s = W.surfaceAt(x, y);
    if (s === S.WATER || s === S.BRIDGE || s === S.VOID || (s === S.ROAD && !road)) return false;
    const c = W.collide(x, y, r || 3, 'walk');
    if (c.hit || c.bad) return false;
    try { const z = N.respect && N.respect.at ? N.respect.at(x, y) : null; if (z) return false; } catch (e) { /* ignore */ }
    return true;
  }
  function polyAt(pts, f) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let d = L * f;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (d <= l || i === pts.length - 1) {
        const t = l ? clamp(d / l, 0, 1) : 0, a = pts[i - 1], b = pts[i];
        return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, a: Math.atan2(b[1] - a[1], b[0] - a[0]), L };
      }
      d -= l;
    }
    return null;
  }
  /** a footpath frontage beside a road: free ground for `need.back` behind (towards the buildings), `need.hl` along,
   *  a building / wall beyond when need.wall; n points to the road */
  function frontage(road, f, side, need) {
    const q = polyAt(road.pts, f);
    if (!q) return null;
    const tx = Math.cos(q.a), ty = Math.sin(q.a), px = -ty * side, py = tx * side;
    for (const off of [4.5, 6.5, 8.5]) {
      const d = road.w / 2 + off, x = q.x + px * d, y = q.y + py * d;
      if (!walkOk(x, y, 3)) continue;
      let ok = true;
      for (let b = 2; b <= need.back && ok; b += 2.5) if (!walkOk(x + px * b, y + py * b, 2.4)) ok = false;
      for (const u of [-need.hl, -need.hl * 0.5, need.hl * 0.5, need.hl]) if (ok && !walkOk(x + tx * u, y + ty * u, 2.4)) ok = false;
      if (!ok) continue;
      if (need.wall) { const c = N.world.collide(x + px * (need.back + 7), y + py * (need.back + 7), 5, 'walk'); if (!c.hit) continue; }
      // clear of every carriageway (junction mouths, a parallel road) over the whole stall
      let clear = true;
      for (const [u, b] of [[0, 0], [-need.hl, 0], [need.hl, 0], [0, need.back], [-need.hl, need.back * 0.6], [need.hl, need.back * 0.6]]) {
        const xx = x + tx * u + px * b, yy = y + ty * u + py * b;
        try { const r2 = N.world.nearestRoadPoint(xx, yy); if (r2 && r2.road && r2.dist < (r2.road.w || 20) / 2 + 2.5) { clear = false; break; } } catch (e) { /* ignore */ }
      }
      if (!clear) continue;
      if (inLandmark(x, y, 12)) continue;
      return { x, y, ax: tx, ay: ty, nx: -px, ny: -py, road };
    }
    return null;
  }

  /* ================================================================ looks */
  const KHAKI = ['#b9a46a', '#a8925e', '#c2ad78'];
  function styleAt(x, y) { try { const d = N.world.districtAt(x, y); return d ? (d.style || 'colony') : 'colony'; } catch (e) { return 'colony'; } }
  function lookFor(role, style, over) {
    const T = N.traffic;
    const base = role === 'conductor' ? 'man' : role === 'labour' ? 'worker' : role === 'labourW' ? 'worker' : role === 'havaldar' ? 'police' : role;
    let L = null, spd = 38;
    try { if (T && T.makeLook) { const r = T.makeLook(base, style); L = Object.assign({}, r.look); spd = r.spd || 38; } } catch (e) { L = null; }
    if (!L) L = N.people && N.people.randomLook ? N.people.randomLook(null, { student: 'student', kid: 'kid', aunty: 'aunty', lungi: 'lungi', police: 'police' }[base] || 'man') : { kind: 'man', skin: '#a0683f', shirt: '#e8e0d0', pants: '#3a3a4a' };
    if (role === 'conductor') { L.kind = 'man'; L.shirt = pick(KHAKI); L.pants = pick(KHAKI); L.prop = 'clothbag'; }
    if (role === 'labour') { L.kind = 'man'; L.shirt = pick(['#7a6a5a', '#8a5a3a', '#5a6a7a', '#9a8a6a']); L.pants = pick(['#5a4a3a', '#4a4a52']); L.hat = null; L.towel = pick(['#efe6d0', '#c03030', '#d8a020']); L.prop = null; }
    if (role === 'labourW') { L.kind = 'saree'; L.saree = pick(['#c8a020', '#d8402a', '#3a6a9a', '#7a2a6a', '#2a7a4a']); L.border = '#f2c230'; L.blouse = U.shade ? U.shade(L.saree, 0.7) : L.saree; L.prop = null; }
    if (role === 'havaldar') { L.kind = 'man'; L.shirt = '#f4f2ea'; L.pants = '#a89060'; L.cap = 'police'; L.prop = null; }
    if (L.prop && L.prop !== 'clothbag' && L.prop !== 'notebook' && L.prop !== 'packet') L.prop = null;
    if (over) Object.assign(L, over);
    return { look: L, spd: clamp(spd, 28, 44) };
  }

  /* ================================================================ barks + sounds */
  let barkT = 0, sfxT = 0;
  function bark(e, text, o) {
    if (!TUNE.barks || !text || !e || !N.dialogue || !N.dialogue.bark) return false;
    const t = realT(), pl = N.player;
    if (!(o && o.force) && t - barkT < TUNE.barkGap) return false;
    if (!pl || Math.hypot(e.x - pl.x, e.y - pl.y) > TUNE.barkR) return false;
    if (!is3D() && N.render && N.render.inView && !N.render.inView(e.x, e.y, 10)) return false;
    try { N.dialogue.bark(e, text, { name: false, blip: false, secs: (o && o.secs) || 2.3 }); } catch (err) { N.err('citylife.bark', err); return false; }
    barkT = t;
    return true;
  }
  let SFXN = null, SFXN_T = -1;
  function hasSfx(name) {
    if (!name) return false;
    const A = N.audio;
    if (!A || !A.sfx) return false;
    const t = realT();
    if (!SFXN || (t - SFXN_T > 5)) { SFXN_T = t; try { if (Array.isArray(A.SFX_NAMES)) SFXN = new Set(A.SFX_NAMES); } catch (e) { SFXN = null; } }
    return !SFXN || SFXN.has(name);
  }
  function sound(name, x, y, o) {
    if (!TUNE.sounds || !hasSfx(name)) return false;
    const t = realT();
    if (t - sfxT < TUNE.sfxGap && !(o && o.force)) return false;
    const pl = N.player;
    if (!pl || Math.hypot(x - pl.x, y - pl.y) > TUNE.sfxR) return false;
    sfxT = t;
    try { return N.audio.sfx(name, Object.assign({ x, y, vol: 0.5 }, o || {})); } catch (e) { return false; }
  }
  // our own synthesised one-shots (N.audio.ext, §17), registered once the audio core exists
  let sfxReg = false;
  function registerSfx() {
    const X = N.audio && N.audio.ext;
    if (sfxReg || !X || !X.registerSfx || !X.P) return;
    sfxReg = true;
    const P = X.P;
    const reg = (n, fn, o) => { try { X.registerSfx(n, fn, o); } catch (e) { N.err('citylife.sfx', e); } };
    // razor on the leather strop: three swishes up and down
    reg('cl_strop', (ac, out, t) => { let e = t; for (let i = 0; i < 4; i++) e = Math.max(e, P.burst(ac, out, t + i * 0.17, { kind: 'white', ft: 'bandpass', f: i % 2 ? 2600 : 3400, f2: i % 2 ? 3600 : 2400, q: 1.6, a: 0.01, r: 0.09, v: 0.22 })); return e; }, { cooldown: 0.5 });
    // the hair clipper buzz ("machine cut")
    reg('cl_clipper', (ac, out, t) => {
      const o = P.osc0(ac, 'square'); o.frequency.setValueAtTime(118, t);
      const f = P.filt(ac, 'bandpass', 1900, 3); const g = P.gain(ac, 0, out); o.connect(f); f.connect(g);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.05); g.gain.setValueAtTime(0.09, t + 1.1); g.gain.linearRampToValueAtTime(0, t + 1.3);
      o.start(t); o.stop(t + 1.35); return t + 1.4;
    }, { cooldown: 1.2 });
    // sewing machine: a fast run of needle ticks
    reg('cl_sewing', (ac, out, t) => { let e = t; for (let i = 0; i < 18; i++) e = Math.max(e, P.burst(ac, out, t + i * 0.075, { kind: 'white', ft: 'highpass', f: 3200, q: 0.7, a: 0.001, r: 0.018, v: 0.2 }), P.tone(ac, out, t + i * 0.075, { f: 210, a: 0.001, r: 0.03, v: 0.06, type: 'triangle' })); return e; }, { cooldown: 1.0 });
    // knife on the grinding wheel: a bright metallic hiss
    reg('cl_grind', (ac, out, t) => Math.max(P.burst(ac, out, t, { kind: 'white', ft: 'bandpass', f: 2600, f2: 4800, sweep: 1.1, q: 4, a: 0.05, h: 0.8, r: 0.25, v: 0.16 }), P.tone(ac, out, t, { f: 1760, a: 0.05, h: 0.6, r: 0.3, v: 0.025, vib: [9, 12] })), { cooldown: 1.0 });
    // bubbles out of the tube in the tub
    reg('cl_bubbles', (ac, out, t) => { let e = t; for (let i = 0; i < 6; i++) { const f = 380 + rnd() * 520; e = Math.max(e, P.tone(ac, out, t + i * 0.11 + rnd() * 0.05, { f, f2: f * 1.9, glide: 0.05, a: 0.002, r: 0.05, v: 0.1 })); } return e; }, { cooldown: 0.6 });
    // the cobbler's hammer on the last
    reg('cl_tap', (ac, out, t) => { let e = t; for (let i = 0; i < 3; i++) e = Math.max(e, P.tone(ac, out, t + i * 0.2, { f: 230, f2: 120, glide: 0.04, a: 0.001, r: 0.06, v: 0.22 }), P.burst(ac, out, t + i * 0.2, { kind: 'white', ft: 'bandpass', f: 1800, q: 2, a: 0.001, r: 0.02, v: 0.12 })); return e; }, { cooldown: 0.6 });
    // the cement mixer drum churning
    reg('cl_mixer', (ac, out, t) => Math.max(P.burst(ac, out, t, { kind: 'brown', ft: 'lowpass', f: 420, q: 0.8, a: 0.2, h: 1.6, r: 0.4, v: 0.3 }), P.tone(ac, out, t, { f: 48, a: 0.2, h: 1.6, r: 0.4, v: 0.08, type: 'sawtooth' })), { cooldown: 2.0 });
    // a shovel into sand
    reg('cl_shovel', (ac, out, t) => Math.max(P.burst(ac, out, t, { kind: 'white', ft: 'bandpass', f: 1200, f2: 600, q: 1, a: 0.02, r: 0.22, v: 0.2 }), P.tone(ac, out, t + 0.18, { f: 140, f2: 80, glide: 0.06, a: 0.002, r: 0.08, v: 0.12 })), { cooldown: 0.7 });
    // a transistor radio in the shop: a short instrumental phrase, tinny (no words)
    const RAGA = [0, 2, 4, 7, 9, 12, 9, 7, 4, 2];
    reg('cl_radio', (ac, out, t) => {
      const f = P.filt(ac, 'bandpass', 1400, 0.9, out), base = 330 * Math.pow(2, ((rnd() * 4) | 0) / 12);
      let e = t, tt = t; const n = 7 + ((rnd() * 4) | 0), s0 = (rnd() * 4) | 0;
      for (let i = 0; i < n; i++) { const st = RAGA[(s0 + i) % RAGA.length], d = i === n - 1 ? 0.5 : 0.2 + (i % 3 === 0 ? 0.1 : 0); e = Math.max(e, P.tone(ac, f, tt, { f: base * Math.pow(2, st / 12), a: 0.01, h: d * 0.5, r: d, v: 0.13, type: 'triangle', vib: [5.5, 6] })); tt += d; }
      e = Math.max(e, P.burst(ac, f, t, { kind: 'white', ft: 'bandpass', f: 3000, q: 0.5, a: 0.05, h: tt - t, r: 0.1, v: 0.012 }));
      return e;
    }, { cooldown: 2.5 });
    reg('cl_iron', (ac, out, t) => Math.max(P.tone(ac, out, t, { f: 95, f2: 70, glide: 0.08, a: 0.002, r: 0.12, v: 0.25 }), P.burst(ac, out, t + 0.05, { kind: 'white', ft: 'bandpass', f: 900, q: 1, a: 0.04, h: 0.3, r: 0.2, v: 0.05 })), { cooldown: 0.8 });
    reg('cl_file', (ac, out, t) => { let e = t; for (let i = 0; i < 5; i++) e = Math.max(e, P.burst(ac, out, t + i * 0.16, { kind: 'white', ft: 'bandpass', f: 4200, f2: 2600, q: 2.5, a: 0.01, r: 0.11, v: 0.13 })); return e; }, { cooldown: 0.8 });
  }

  /* ================================================================ particles (one simulation, both views) */
  // kinds: 0 steam (white), 1 smoke (grey), 2 spark (ember, additive, falls), 3 bubble (stays at its height), 4 dust/talc
  const PMAX = 240;
  const P = {
    n: 0, x: new Float32Array(PMAX), y: new Float32Array(PMAX), h: new Float32Array(PMAX), vx: new Float32Array(PMAX), vy: new Float32Array(PMAX), vh: new Float32Array(PMAX),
    life: new Float32Array(PMAX), max: new Float32Array(PMAX), s0: new Float32Array(PMAX), s1: new Float32Array(PMAX), a0: new Float32Array(PMAX), kind: new Uint8Array(PMAX), sc: new Int32Array(PMAX),
  };
  let pCap = 220;
  function emit(sc, x, y, h, kind, vh, life, s0, s1, a0) {
    if (!TUNE.particles || P.n >= pCap) return -1;
    const i = P.n++;
    P.x[i] = x; P.y[i] = y; P.h[i] = h; P.vx[i] = (rnd() - 0.5) * 2; P.vy[i] = (rnd() - 0.5) * 2; P.vh[i] = vh;
    P.life[i] = 0; P.max[i] = life; P.s0[i] = s0; P.s1[i] = s1; P.a0[i] = a0; P.kind[i] = kind; P.sc[i] = sc ? sc.uid : -1;
    return i;
  }
  function sparks(sc, x, y, h, n, spd) {
    for (let k = 0; k < n; k++) { const i = emit(sc, x, y, h, 2, rr(4, 12), rr(0.35, 0.8), 0.45, 0.2, 1); if (i >= 0) { const a = rnd() * TAU, s = (spd || 10) * rr(0.4, 1); P.vx[i] = Math.cos(a) * s; P.vy[i] = Math.sin(a) * s; } }
  }
  function updateParticles(dt) {
    const t = simT(), wx = Math.cos(-0.6 + Math.sin(t * 0.021) * 0.5) * 3.2, wy = Math.sin(-0.6 + Math.sin(t * 0.021) * 0.5) * 3.2;
    let i = 0;
    while (i < P.n) {
      P.life[i] += dt;
      if (P.life[i] >= P.max[i]) {
        const j = --P.n;
        if (i !== j) { P.x[i] = P.x[j]; P.y[i] = P.y[j]; P.h[i] = P.h[j]; P.vx[i] = P.vx[j]; P.vy[i] = P.vy[j]; P.vh[i] = P.vh[j]; P.life[i] = P.life[j]; P.max[i] = P.max[j]; P.s0[i] = P.s0[j]; P.s1[i] = P.s1[j]; P.a0[i] = P.a0[j]; P.kind[i] = P.kind[j]; P.sc[i] = P.sc[j]; }
        continue;
      }
      const k = P.kind[i];
      if (k === 2) { P.vh[i] -= 26 * dt; P.vx[i] *= 1 - dt * 1.5; P.vy[i] *= 1 - dt * 1.5; if (P.h[i] < 0) P.max[i] = 0; }
      else if (k === 3) { P.vx[i] = Math.sin(P.life[i] * 9 + i) * 0.6; P.vy[i] = Math.cos(P.life[i] * 7 + i) * 0.6; P.vh[i] = 0; }
      else if (k === 4) { P.vx[i] *= 1 - dt * 2; P.vy[i] *= 1 - dt * 2; P.vh[i] -= 2 * dt; }
      else {
        const up = clamp(P.h[i] / 14, 0.2, 1.4);
        P.vx[i] += (wx * up - P.vx[i]) * Math.min(1, dt * 1.2); P.vy[i] += (wy * up - P.vy[i]) * Math.min(1, dt * 1.2);
        P.vh[i] *= 1 - dt * (k === 1 ? 0.3 : 0.7);
      }
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.h[i] += P.vh[i] * dt;
      i++;
    }
  }
  const PS = { t: 0, s: 0, a: 0 };
  function pState(i) {
    const t = P.life[i] / P.max[i];
    PS.t = t; PS.s = lerp(P.s0[i], P.s1[i], Math.sqrt(t));
    PS.a = P.a0[i] * (t < 0.1 ? t / 0.1 : 1) * Math.pow(1 - t, 1.15);
    return PS;
  }

  /* ================================================================ people (pooled 'ped' entities) */
  const POOL = [];
  const PEOPLE = [];
  class Person extends N.Actor {
    constructor() {
      super({ kind: 'ped', r: 3.2, mass: 1, solid: true });
      this.cl = true; this.amb = true;
      this.anim = { phase: 0, speed: 0, run: false };
      this._fn = (ctx) => drawPerson(ctx, this);
    }
    update(dt) { try { personUpdate(this, dt); } catch (e) { N.err('citylife.person', e); dropPerson(this); } }
    draw() { if (!is3D() && !this.hidden) N.render.queue('actors', this.y + (this.dk || 0), this._fn); }
    onBump(other, info) { try { bumped(this, other, info); } catch (e) { N.err('citylife.bump', e); } }
  }
  function maxPeople() { return lowTier() ? TUNE.maxPeople.low : TUNE.maxPeople.desk; }
  function newPerson(sc, role, x, y, a, o) {
    if (PEOPLE.length >= maxPeople() && !(o && o.must)) return null;
    const p = POOL.pop() || new Person();
    p.id = 0; p.alive = true; p.hidden = false; p.solid = !(o && o.ghost); p.mass = (o && o.mass) || 1; p.fixed = !!(o && o.fixed);
    p.sc = sc; p.role = role; p.x = x; p.y = y; p.angle = a || 0; p.facing = p.angle; p.vx = 0; p.vy = 0;
    const L = (o && o.look) ? { look: o.look, spd: 36 } : lookFor(role, sc ? sc.style : 'colony', o && o.over);
    p.look0 = L.look; p.look = L.look; p.lookAlt = null; p.spd = (o && o.spd) || (L.spd || rr(TUNE.walk[0], TUNE.walk[1])) * pace();
    p.st = (o && o.st) || 'walk'; p.then = null; p.t = 0; p.tx = x; p.ty = y; p.fa = p.angle; p.seat = null; p.slot = null; p.held = false; p.holdBack = false;
    p.idle = null; p.bench = false; p.z = 0; p.dk = 0; p.hold = null; p.tool = null; p.hx = x; p.hy = y; p.hh = 5; p.cape = false; p.foam = 0;
    p.job = (o && o.job) || null; p.k = 0; p.ph = null; p.timer = 0; p.n = 0; p.cyc = null; p.raise = 0; p.flip = 0;
    p.barkCD = rr(2, 8); p.knockT = 0; p.getupT = 0; p.down = false; p.bumpT = 0; p.lookAt = null; p.lookT = 0; p.lookTarget = null;
    p.ex = null; p.ey = null; p.stuckT = 0; p.detT = 0; p.detX = 0; p.detY = 0; p.life = 0; p.umb = null; p.talkT = 0; p.dur = 0; p.bus = null; p.off = 0; p.side = 0;
    p.anim.phase = rnd() * TAU; p.anim.speed = 0; p.anim.run = false;
    N.entities.add(p);
    PEOPLE.push(p); if (sc) sc.people.push(p);
    return p;
  }
  function dropPerson(p) {
    const sc = p.sc;
    if (sc) { const i = sc.people.indexOf(p); if (i >= 0) sc.people.splice(i, 1); }
    if (p.seat && p.seat.by === p) p.seat.by = null;
    if (p.slot && p.slot.by === p) p.slot.by = null;
    p.seat = null; p.slot = null;
    const j = PEOPLE.indexOf(p); if (j >= 0) PEOPLE.splice(j, 1);
    if (p.alive) N.entities.remove(p);
    p.alive = false; p.sc = null; p.lookAt = null; p.lookTarget = null; p.cyc = null; p.bus = null;
    if (POOL.length < 80) POOL.push(p);
  }
  function integrate(p, dt) {
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    const c = N.world.collide(nx, ny, p.r, 'walk');
    if (!c.bad) {
      if (c.hit && isFinite(c.nx)) { const d = p.vx * c.nx + p.vy * c.ny; if (d < 0) { p.vx -= d * c.nx; p.vy -= d * c.ny; } }
      p.x = c.x; p.y = c.y;
    }
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 3 && !(p.lookT > 0)) p.angle += angDiff(p.angle, Math.atan2(p.vy, p.vx)) * Math.min(1, dt * 10);
    p.facing = p.angle;
    p.anim.speed = Math.min(1, sp / 45); p.anim.run = sp > 60; p.anim.phase += sp * dt * 0.26;
    return sp;
  }
  /** walk towards (tx, ty); walkers step off Chinnu's line; stuck -> a sidestep. Returns the remaining distance. */
  function walkTo(p, tx, ty, speed, dt, arrive, noCollide) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    let vx = 0, vy = 0;
    if (d > (arrive || 1)) { const s = Math.min(speed, d * 4); vx = (dx / d) * s; vy = (dy / d) * s; }
    const pl = N.player;
    if (pl && !pl.vehicle && !pl.hidden && (vx || vy)) {
      const ex = pl.x - p.x, ey = pl.y - p.y, e = Math.hypot(ex, ey);
      if (e < TUNE.aside && e > 0.1 && (vx * ex + vy * ey) > 0) { const s = (vx * ey - vy * ex) > 0 ? 1 : -1; vx += (-ey / e) * speed * 0.8 * s; vy += (ex / e) * speed * 0.8 * s; }
    }
    if (p.detT > 0) { p.detT -= dt; vx = vx * 0.3 + p.detX * speed * 0.8; vy = vy * 0.3 + p.detY * speed * 0.8; }
    // look where they walk: sidestep people, animals and vehicles, keep left, slow behind (entities.js E.steer)
    else if (!noCollide && p.solid && N.entities.steer) { const S = N.entities.steer(p, vx, vy, dt, { arrive: d }); vx = S.x; vy = S.y; }
    const a = 1 - Math.exp(-dt * 8);
    p.vx += (vx - p.vx) * a; p.vy += (vy - p.vy) * a;
    let sp;
    if (noCollide) { p.x += p.vx * dt; p.y += p.vy * dt; sp = Math.hypot(p.vx, p.vy); if (sp > 3) p.angle += angDiff(p.angle, Math.atan2(p.vy, p.vx)) * Math.min(1, dt * 10); p.facing = p.angle; p.anim.speed = Math.min(1, sp / 45); p.anim.run = sp > 60; p.anim.phase += sp * dt * 0.26; }
    else sp = integrate(p, dt);
    if (d > 3 && sp < 5) {
      p.stuckT += dt;
      if (p.stuckT > 1.1) { p.stuckT = 0; p.detT = 0.7; const s = rnd() < 0.5 ? 1 : -1; p.detX = (-dy / d) * s; p.detY = (dx / d) * s; }
    } else p.stuckT = 0;
    return d;
  }
  function stand(p, face, dt) {
    p.vx *= 0.7; p.vy *= 0.7;
    if (Math.abs(p.vx) + Math.abs(p.vy) > 0.5) integrate(p, dt);
    if (face != null && isFinite(face) && !(p.lookT > 0)) p.angle += angDiff(p.angle, face) * Math.min(1, dt * 4);
    p.facing = p.angle;
    p.anim.speed = 0; p.anim.run = false; p.anim.phase += dt * 0.4;
  }
  /** go to a seat and sit on it (view3d: idle 'sit' + bench / stool) */
  function sitAt(p, s, dt) {
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d > 1.4 && p.idle !== 'sit') { walkTo(p, s.x, s.y, p.spd * 0.7, dt, 0.6); return false; }
    p.x = s.x; p.y = s.y; p.vx = 0; p.vy = 0; p.idle = 'sit'; p.bench = s.bench !== false;
    if (!(p.lookT > 0) && !(p.talkT > 0)) p.angle += angDiff(p.angle, s.a) * Math.min(1, dt * 5);
    p.facing = p.angle; p.anim.speed = 0; p.anim.run = false;
    return true;
  }
  function holdAt(p, x, y, face, dt) {
    const d = Math.hypot(x - p.x, y - p.y);
    // hysteresis: nudged by a neighbour (two spots of a group closer than two bodies) he stays put, he walks back
    // only once properly out of place; a group settles shoulder to shoulder instead of shoving and stepping back
    if (!p.holdBack && d > 4.5) p.holdBack = true;
    else if (p.holdBack && d < 1.2) p.holdBack = false;
    if (p.holdBack || (d > 1.5 && !(p.vx * p.vx + p.vy * p.vy < 4 && d < 4.5 && p.held))) walkTo(p, x, y, p.spd * 0.6, dt, 0.8); else stand(p, face, dt);
    p.held = d < 1.5 || (p.held && !p.holdBack);
    return d;
  }
  function freeOf(list) { for (const s of list) if (!s.by) return s; return null; }
  function take(p, s) { if (!s) return null; if (p.seat && p.seat.by === p) p.seat.by = null; s.by = p; p.seat = s; return s; }
  /** pick an entry / exit point out of sight along the frontage */
  function entryOf(sc) {
    const E = sc.L && sc.L.entry, pl = N.player;
    if (E && E.length) {
      let best = null, bd = -1;
      for (let i = 0; i < 4; i++) { const e = E[(rnd() * E.length) | 0]; const vis = is3D() ? Math.hypot(e.x - pl.x, e.y - pl.y) < 90 : N.render.inView(e.x, e.y, 6); const sc2 = (vis ? 0 : 100) + rnd() * 10; if (sc2 > bd) { bd = sc2; best = e; } }
      return best;
    }
    const a = rnd() * TAU;
    return { x: sc.spot.x + Math.cos(a) * 90, y: sc.spot.y + Math.sin(a) * 90 };
  }
  function leaveStep(p, dt) {
    if (p.seat && p.seat.by === p) p.seat.by = null;
    if (p.slot && p.slot.by === p) p.slot.by = null;
    p.seat = null; p.slot = null; p.idle = null; p.hold = p.hold === 'paper' ? 'paper' : null; p.tool = null; p.z = 0;
    if (p.ex == null) { const sc = p.sc; const e = sc && sc.on ? entryOf(sc) : { x: p.x + Math.cos(p.angle) * 90, y: p.y + Math.sin(p.angle) * 90 }; p.ex = e.x; p.ey = e.y; p.t = 0; }
    const d = walkTo(p, p.ex, p.ey, p.spd, dt, 2);
    const pl = N.player;
    const far = Math.hypot(p.x - pl.x, p.y - pl.y);
    const hidden = is3D() ? far > 150 : !N.render.inView(p.x, p.y, 12);
    if (hidden && (p.t > 1.2 || d < 4)) { dropPerson(p); return; }
    const sc = p.sc;
    if (TUNE.handBack && p.t > 2.5 && (!sc || Math.hypot(p.x - sc.spot.x, p.y - sc.spot.y) > 26) && !p.cyc && handBack(p)) return;
    if (d < 4 || p.t > 40) { if (hidden || p.t > 60) dropPerson(p); else { const a = rnd() * TAU; p.ex = p.x + Math.cos(a) * 60; p.ey = p.y + Math.sin(a) * 60; } }
  }
  const TRAFFIC_ROLE = { conductor: 'man', labour: 'worker', labourW: 'worker', havaldar: 'police', cyclist: 'man', vendorP: 'vendor', vendorC: 'vendor', reader: 'uncle', customer: 'man' };
  function handBack(p) {
    const T = N.traffic;
    if (!T || !T.spawnPed || T.enabled === false) return false;
    try {
      if ((T.peds || []).length >= (lowTier() ? 34 : 48)) return false;
      const look = p.hold === 'paper' || p.look !== p.look0 ? p.look0 : p.look;
      const q = T.spawnPed(TRAFFIC_ROLE[p.role] || p.role || 'man', { x: p.x, y: p.y, look });
      if (!q) return false;
      q.angle = p.angle; q.vx = p.vx; q.vy = p.vy; if (p.umb) q.umb = p.umb;
      dropPerson(p); ST.handedBack++;
      return true;
    } catch (e) { N.err('citylife.handBack', e); return false; }
  }
  function bumped(p, other, info) {
    if (!other || p.down || p.fixed) return;
    const sp = (info && info.speed) || 0;
    if (other === N.player && sp > 28 && !(p.bumpT > 0)) {
      p.bumpT = 1.2;
      const sx = info.a === p ? -info.nx : info.nx, sy = info.a === p ? -info.ny : info.ny;
      p.lookT = 1.4; p.lookAt = N.player;
      if (sp < 60 || p.idle === 'sit') { if (p.idle !== 'sit') { p.vx = (sx || 0) * 24; p.vy = (sy || 0) * 24; } if (rnd() < 0.4) bark(p, pick(LINES.bump)); return; }
      p.knockT = clamp(0.4 + sp / 200, 0.6, 1.0); p.vx = (sx || 0) * sp * 0.5; p.vy = (sy || 0) * sp * 0.5;
      N.emit('ped:knocked', { ped: p, by: N.player, speed: sp });
    }
  }
  /** people look at Chinnu when he hangs around (and sometimes say something) */
  function glance(p, dt) {
    const pl = N.player;
    if (!pl || pl.hidden) return;
    const d = Math.hypot(pl.x - p.x, pl.y - p.y);
    if (d < TUNE.glanceR && !(p.lookT > 0) && rnd() < dt * 0.5) {
      p.lookT = rr(1.2, 2.6); p.lookAt = pl;
      if (d < 11 && p.barkCD <= 0 && rnd() < 0.08) { p.barkCD = 25; bark(p, pick(LINES.look)); }
    }
    if (p.lookT <= 0 && p.lookAt === pl) p.lookAt = null;
  }
  function personUpdate(p, dt) {
    p.t += dt; p.life += dt;
    if (p.barkCD > 0) p.barkCD -= dt;
    if (p.bumpT > 0) p.bumpT -= dt;
    if (p.lookT > 0) p.lookT -= dt;
    if (p.talkT > 0) p.talkT -= dt;
    if (p.knockT > 0) { // knocked over (vehicles.js pushes / a running kid)
      p.down = true; p.idle = null; p.z = 0; p.knockT -= dt;
      const f = Math.exp(-dt * 7); p.vx *= f; p.vy *= f; integrate(p, dt); p.anim.speed = 0;
      if (p.knockT <= 0) p.getupT = 0.8;
      return;
    }
    if (p.getupT > 0) {
      p.getupT -= dt; p.vx = p.vy = 0;
      if (p.getupT <= 0) { p.down = false; bark(p, pick(LINES.bump), { force: true }); p.lookT = 1.2; p.lookAt = N.player; }
      return;
    }
    const sc = p.sc;
    if (!sc || !sc.on) { leaveStep(p, dt); return; }
    if (p.st !== 'leave' && p.st !== 'hang' && p.st !== 'rush') glance(p, dt);
    if (sc.K.act && sc.K.act(p, dt, sc)) return;
    switch (p.st) {
      case 'walk': { const d = walkTo(p, p.tx, p.ty, p.spd, dt, 1.2); if (d < 2 || p.t > 40) { p.st = p.then || 'stand'; p.t = 0; } break; }
      case 'sit': if (p.seat) sitAt(p, p.seat, dt); else stand(p, p.fa, dt); break;
      case 'stand': if (p.slot) holdAt(p, p.slot.x, p.slot.y, p.slot.a, dt); else stand(p, p.fa, dt); break;
      case 'leave': leaveStep(p, dt); break;
      default: stand(p, p.fa, dt);
    }
  }
  /** a person arrives from out of sight and takes a seat / slot */
  function arrive(sc, role, target, then, o) {
    const e = entryOf(sc);
    const p = newPerson(sc, role, e.x, e.y, Math.atan2(target.y - e.y, target.x - e.x), o);
    if (!p) return null;
    if (target.by !== undefined) { if (then === 'sit') take(p, target); else { target.by = p; p.slot = target; } }
    p.st = 'walk'; p.tx = target.x; p.ty = target.y; p.then = then || 'stand'; p.t = 0;
    return p;
  }
  /** someone already there (activation in view of nobody / warm start) */
  function place(sc, role, target, then, o) {
    const p = newPerson(sc, role, target.x, target.y, target.a || 0, o);
    if (!p) return null;
    if (target.by !== undefined) { if (then === 'sit') take(p, target); else { target.by = p; p.slot = target; } }
    p.st = then || 'stand';
    if (then === 'sit') { p.idle = 'sit'; p.bench = target.bench !== false; }
    return p;
  }
  function leave(p) { if (!p || p.st === 'leave') return; p.st = 'leave'; p.ex = null; p.t = 0; p.idle = null; if (p.seat && p.seat.by === p) p.seat.by = null; if (p.slot && p.slot.by === p) p.slot.by = null; p.seat = null; p.slot = null; }
  function count(sc, pred) { let n = 0; for (const p of sc.people) if (p.st !== 'leave' && (!pred || pred(p))) n++; return n; }
  function talkPair(a, b, lines, sc) {
    a.lookTarget = b; b.lookTarget = a; a.lookT = 0; b.lookT = 0;
    sc.st.talk = { a, b, lines, i: 0, t: 0.2 };
  }
  function talkTick(sc, dt) {
    const T = sc.st.talk;
    if (!T) return;
    T.t -= dt;
    if (!T.a.alive || !T.b.alive || T.a.sc !== sc || T.b.sc !== sc) { sc.st.talk = null; return; }
    if (T.t <= 0) {
      if (T.i >= T.lines.length) { T.a.lookTarget = null; T.b.lookTarget = null; sc.st.talk = null; return; }
      const who = T.i % 2 ? T.b : T.a;
      bark(who, T.lines[T.i], { force: true, secs: 2.0 }); who.talkT = 2.0;
      T.i++; T.t = 2.2;
    }
  }

  /* ================================================================ slot helpers */
  function seatsAlong(F, u0, u1, v, a, gap, bench) {
    const out = [];
    for (let u = u0; u <= u1 + 0.01; u += gap) { const x = fx(F, u, v), y = fy(F, u, v); if (walkOk(x, y, 1.6)) out.push({ x, y, u, v, a, by: null, bench: bench !== false }); }
    return out;
  }
  function slotsGrid(F, u0, u1, v0, v1, gap, face, road) {
    const out = [], R = rng('slots:' + Math.round(F.cx) + ':' + Math.round(F.cy));
    for (let v = v0; v <= v1 + 0.01; v += gap) for (let u = u0; u <= u1 + 0.01; u += gap) {
      const uu = u + (R.next() - 0.5) * 1.4, vv = v + (R.next() - 0.5) * 1.2, x = fx(F, uu, vv), y = fy(F, uu, vv);
      if (!walkOk(x, y, 2.2, road)) continue;
      out.push({ x, y, u: uu, v: vv, a: face != null ? face + (R.next() - 0.5) * 0.6 : 0, by: null });
    }
    return out;
  }
  function entries(F, list, n, dMin, dMax, seed) {
    const out = [], R = rng('entry:' + seed);
    for (let i = 0; i < 24 && out.length < n; i++) {
      const s = R.next() < 0.5 ? -1 : 1, d = dMin + R.next() * (dMax - dMin);
      let x = fx(F, s * d, 4 + R.next() * 8), y = fy(F, s * d, 4 + R.next() * 8);
      const f = N.world.findFree ? N.world.findFree(x, y, 'walk', 6) : null;
      if (f) { x = f.x; y = f.y; }
      if (!walkOk(x, y, 2, true)) continue;
      out.push({ x, y });
    }
    if (!out.length) out.push({ x: fx(F, 0, 70), y: fy(F, 0, 70) });
    void list;
    return out;
  }

  /* ================================================================ 2D drawing primitives (internal screen space) */
  let R = null, CTX = null;
  const kk = (h) => R.k(h);
  const SX = (x, k) => R.sx(x, k), SY = (y, k) => R.sy(y, k);
  function frame2d(ctx) { R = N.render; CTX = ctx; }
  function resetCtx(ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt'; }
  function dot(x, y, h, r, col) { const k = kk(h); CTX.fillStyle = col; CTX.beginPath(); CTX.arc(SX(x, k), SY(y, k), Math.max(0.45, r * k), 0, TAU); CTX.fill(); }
  function ring(x, y, h, r, col, w) { const k = kk(h); CTX.strokeStyle = col; CTX.lineWidth = Math.max(0.5, (w || 0.4) * k); CTX.beginPath(); CTX.arc(SX(x, k), SY(y, k), Math.max(0.5, r * k), 0, TAU); CTX.stroke(); }
  function seg(x0, y0, h0, x1, y1, h1, w, col) {
    const k0 = kk(h0), k1 = kk(h1);
    CTX.strokeStyle = col; CTX.lineWidth = Math.max(0.5, w * (k0 + k1) * 0.5); CTX.lineCap = 'round';
    CTX.beginPath(); CTX.moveTo(SX(x0, k0), SY(y0, k0)); CTX.lineTo(SX(x1, k1), SY(y1, k1)); CTX.stroke();
  }
  function ell(x, y, h, rx, ry, a, col) { const k = kk(h); CTX.fillStyle = col; CTX.beginPath(); CTX.ellipse(SX(x, k), SY(y, k), Math.max(0.4, rx * k), Math.max(0.4, ry * k), a || 0, 0, TAU); CTX.fill(); }
  function fquad(F, u0, v0, u1, v1, h, col) {
    const k = kk(h);
    CTX.fillStyle = col; CTX.beginPath();
    CTX.moveTo(SX(fx(F, u0, v0), k), SY(fy(F, u0, v0), k)); CTX.lineTo(SX(fx(F, u1, v0), k), SY(fy(F, u1, v0), k));
    CTX.lineTo(SX(fx(F, u1, v1), k), SY(fy(F, u1, v1), k)); CTX.lineTo(SX(fx(F, u0, v1), k), SY(fy(F, u0, v1), k)); CTX.closePath(); CTX.fill();
  }
  /** a vertical panel along the frame (u0 -> u1 at v), from h0 to h1 */
  function fwall(F, u0, u1, v, h0, h1, col) {
    const k0 = kk(h0), k1 = kk(h1), x0 = fx(F, u0, v), y0 = fy(F, u0, v), x1 = fx(F, u1, v), y1 = fy(F, u1, v);
    CTX.fillStyle = col; CTX.beginPath();
    CTX.moveTo(SX(x0, k0), SY(y0, k0)); CTX.lineTo(SX(x1, k0), SY(y1, k0)); CTX.lineTo(SX(x1, k1), SY(y1, k1)); CTX.lineTo(SX(x0, k1), SY(y0, k1)); CTX.closePath(); CTX.fill();
  }
  /** a vertical panel across the frame (v0 -> v1 at u) */
  function fwallV(F, u, v0, v1, h0, h1, col) {
    const k0 = kk(h0), k1 = kk(h1), x0 = fx(F, u, v0), y0 = fy(F, u, v0), x1 = fx(F, u, v1), y1 = fy(F, u, v1);
    CTX.fillStyle = col; CTX.beginPath();
    CTX.moveTo(SX(x0, k0), SY(y0, k0)); CTX.lineTo(SX(x1, k0), SY(y1, k0)); CTX.lineTo(SX(x1, k1), SY(y1, k1)); CTX.lineTo(SX(x0, k1), SY(y0, k1)); CTX.closePath(); CTX.fill();
  }
  const SHADE = new Map();
  function shade(c, f) { const key = c + f; let s = SHADE.get(key); if (!s) { s = U.shade ? U.shade(c, f) : c; SHADE.set(key, s); } return s; }
  /** an extruded box in frame coordinates (sides darker, top lighter) */
  function fbox(F, u0, u1, v0, v1, h0, h1, col, top) {
    const s = shade(col, 0.78);
    fwall(F, u0, u1, v0, h0, h1, s); fwall(F, u0, u1, v1, h0, h1, s);
    fwallV(F, u0, v0, v1, h0, h1, shade(col, 0.9)); fwallV(F, u1, v0, v1, h0, h1, shade(col, 0.9));
    fquad(F, u0, v0, u1, v1, h1, top || col);
  }
  function pole(x, y, h0, h1, w, col) { seg(x, y, h0, x, y, h1, w, col); }
  function blit(ctx, look, x, y, a, anim, h) {
    const T = N.traffic;
    if (T && T.blitPerson) { T.blitPerson(ctx, look, x, y, a, anim, h); return; }
    if (N.draw && N.draw.sprite && N.people) N.draw.sprite(x, y, a, h, (g) => N.people.draw(g, look, anim));
  }
  function umbrella(x, y, a, col) {
    const k = kk(11), X = SX(x, k), Y = SY(y, k), r = 6.2 * k;
    for (let i = 0; i < 8; i++) { CTX.beginPath(); CTX.moveTo(X, Y); CTX.arc(X, Y, r, (i / 8) * TAU + a, ((i + 1) / 8) * TAU + a); CTX.closePath(); CTX.fillStyle = i % 2 ? col : shade(col, 1.25); CTX.fill(); }
  }
  function cycle2d(x, y, a, col) {
    const PA = N.placesArt;
    if (PA && PA.drawProp) { PA.drawProp('cycle', x, y, a, { color: col }); frame2d(CTX); return; }
    const c = Math.cos(a), s = Math.sin(a);
    ring(x + c * 3.4, y + s * 3.4, 1.5, 1.5, '#1a1a1e', 0.4); ring(x - c * 3.4, y - s * 3.4, 1.5, 1.5, '#1a1a1e', 0.4);
    seg(x - c * 3.4, y - s * 3.4, 1.6, x + c * 3.4, y + s * 3.4, 1.6, 0.5, col);
  }

  /* ================================================================ people in 2D */
  function headPos(p) { const c = Math.cos(p.angle), s = Math.sin(p.angle); HP.x = p.x + c * 0.4; HP.y = p.y + s * 0.4; return HP; }
  const HP = { x: 0, y: 0 };
  function drawHeld(p) {
    const c = Math.cos(p.angle), s = Math.sin(p.angle), rx = -s, ry = c;
    const base = p.idle === 'sit' ? 5.4 : p.z > 0 ? 7.4 : 4.8;
    switch (p.hold) {
      case 'paper': { // the open newspaper in front: two pages, grey lines; a page turn every few seconds
        const f = p.flip > 0 ? Math.abs(Math.cos(p.flip * PI)) : 1, w = 2.6 * f, cx = p.x + c * 2.6, cy = p.y + s * 2.6, h = base + 1.2;
        const k = kk(h);
        CTX.fillStyle = '#ebe7da'; CTX.beginPath();
        CTX.moveTo(SX(cx + rx * w - c * 1.4, k), SY(cy + ry * w - s * 1.4, k)); CTX.lineTo(SX(cx + rx * w + c * 1.2, k), SY(cy + ry * w + s * 1.2, k));
        CTX.lineTo(SX(cx - rx * w + c * 1.2, k), SY(cy - ry * w + s * 1.2, k)); CTX.lineTo(SX(cx - rx * w - c * 1.4, k), SY(cy - ry * w - s * 1.4, k)); CTX.closePath(); CTX.fill();
        CTX.strokeStyle = 'rgba(60,60,70,0.55)'; CTX.lineWidth = Math.max(0.4, 0.22 * k); CTX.beginPath();
        for (let i = -1; i <= 1; i++) { const o = i * 0.6; CTX.moveTo(SX(cx + rx * (w - 0.4) + c * o, k), SY(cy + ry * (w - 0.4) + s * o, k)); CTX.lineTo(SX(cx + rx * 0.3 + c * o, k), SY(cy + ry * 0.3 + s * o, k)); CTX.moveTo(SX(cx - rx * (w - 0.4) + c * o, k), SY(cy - ry * (w - 0.4) + s * o, k)); CTX.lineTo(SX(cx - rx * 0.3 + c * o, k), SY(cy - ry * 0.3 + s * o, k)); }
        CTX.stroke();
        seg(cx + c * 1.2 - rx * w, cy + s * 1.2 - ry * w, h + 0.02, cx + c * 1.2 - rx * w * 0.3, cy + s * 1.2 - ry * w * 0.3, h + 0.02, 0.35, p.n % 2 ? '#2a4a8a' : '#8a2a2a'); // the masthead stripe (no words)
        break;
      }
      case 'glass': { const x = p.x + c * 2.4 + rx * 1.6, y = p.y + s * 2.4 + ry * 1.6; dot(x, y, base + 0.4, 0.62, '#f2f0ea'); dot(x, y, base + 0.5, 0.46, '#b07a3a'); break; }
      case 'pan': { const h = headPos(p); dot(h.x, h.y, 10.6, 2.3, '#3a3a40'); dot(h.x, h.y, 10.7, 1.8, p.n % 2 ? '#c8b48a' : '#9a9a96'); break; }
      case 'bricks': { const h = headPos(p); const k = kk(10.8); CTX.fillStyle = '#a8442a'; CTX.save(); CTX.translate(SX(h.x, k), SY(h.y, k)); CTX.rotate(p.angle); CTX.fillRect(-2 * k, -1.4 * k, 4 * k, 2.8 * k); CTX.strokeStyle = 'rgba(40,20,10,0.5)'; CTX.lineWidth = 0.4 * k; CTX.strokeRect(-2 * k, -1.4 * k, 4 * k, 2.8 * k); CTX.restore(); break; }
      case 'basket': { const up = p.raise || 0, x = p.x + c * (1 + up * 1.8), y = p.y + s * (1 + up * 1.8), h = lerp(10.2, 8.6, up); dot(x, y, h, 2.2, '#8a6a3a'); dot(x, y, h + 0.1, 1.8, p.job === 'vendorC' ? '#5a8a3a' : '#c89a5a'); break; }
      case 'bundle': { const x = p.x + c * 2.2, y = p.y + s * 2.2; ell(x, y, 4.6, 1.8, 1.3, p.angle, p.n % 2 ? '#e8e0f0' : '#f0d8c8'); break; }
      case 'clothes': { const x = p.x + c * 2.2, y = p.y + s * 2.2; ell(x, y, 4.8, 2, 1.4, p.angle, '#d8e0ea'); break; }
      case 'knife': { const x = p.x + c * 2.4, y = p.y + s * 2.4; seg(x, y, 5, x + c * 1.6, y + s * 1.6, 5, 0.4, '#d8dce2'); break; }
      default: break;
    }
  }
  function drawTool(p) {
    const x = p.hx, y = p.hy, h = p.hh, a = p.angle, c = Math.cos(a), s = Math.sin(a);
    switch (p.tool) {
      case 'scissors': { const o = Math.sin(simT() * 22) * 0.5; seg(x - c * 0.8, y - s * 0.8, h, x + c * 1 - s * o, y + s * 1 + c * o, h, 0.28, '#c8ccd2'); seg(x - c * 0.8, y - s * 0.8, h, x + c * 1 + s * o, y + s * 1 - c * o, h, 0.28, '#c8ccd2'); break; }
      case 'comb': seg(x - s, y + c, h, x + s, y - c, h, 0.35, '#1a1a1e'); break;
      case 'razor': seg(x, y, h, x + c * 1.4, y + s * 1.4, h, 0.32, '#e8ecf0'); break;
      case 'spray': dot(x, y, h, 0.6, '#5aa0d8'); break;
      case 'clipper': ell(x, y, h, 0.9, 0.5, a, '#2a2a30'); break;
      case 'mirror': dot(x, y, h, 1.4, '#7a5a3a'); dot(x, y, h + 0.05, 1.1, '#cfe2ee'); break;
      case 'brush': dot(x, y, h, 0.7, '#f2f0ea'); break;
      case 'iron': { ell(x, y, h, 1.4, 0.9, a, '#1e1e22'); seg(x - c * 0.8, y - s * 0.8, h + 0.8, x + c * 0.8, y + s * 0.8, h + 0.8, 0.35, '#7a5a3a'); break; }
      case 'hammer': seg(x, y, h, x + c * 1.4, y + s * 1.4, h, 0.3, '#6a4a2a'); dot(x + c * 1.4, y + s * 1.4, h, 0.4, '#3a3a40'); break;
      case 'needle': dot(x, y, h, 0.3, '#d8d8e0'); break;
      case 'file': seg(x, y, h, x + c * 1.6, y + s * 1.6, h, 0.3, '#8a8e94'); break;
      case 'shovel': seg(x, y, h, x + c * 3, y + s * 3, h - 2.6, 0.32, '#7a5a3a'); dot(x + c * 3.2, y + s * 3.2, h - 2.8, 0.9, '#5a5a62'); break;
      case 'pick': seg(x, y, h, x + c * 2.6, y + s * 2.6, h - 1, 0.32, '#7a5a3a'); seg(x + c * 2.6 - s * 1.2, y + s * 2.6 + c * 1.2, h - 1, x + c * 2.6 + s * 1.2, y + s * 2.6 - c * 1.2, h - 1, 0.35, '#4a4a52'); break;
      case 'pump': seg(x, y, h, x, y, h - 4, 0.4, '#2a5a9a'); break;
      case 'tube': ring(x + c * 0.6, y + s * 0.6, h, 1.1, '#1e1e22', 0.45); break;
      case 'garland': seg(x - s * 1.2, y + c * 1.2, h, x + s * 1.2, y - c * 1.2, h, 0.55, p.n % 2 ? '#f08a1a' : '#f8f6ee'); break;
      case 'scale': seg(x, y, h + 2, x, y, h, 0.2, '#5a5a62'); seg(x - s * 1.6, y + c * 1.6, h, x + s * 1.6, y - c * 1.6, h, 0.3, '#5a5a62'); dot(x - s * 1.6, y + c * 1.6, h - 0.8, 0.7, '#9a8a6a'); dot(x + s * 1.6, y - c * 1.6, h - 0.8, 0.7, '#9a8a6a'); break;
      default: break;
    }
  }
  function drawPerson(ctx, p) {
    frame2d(ctx);
    if (p.down) { blit(ctx, p.look, p.x, p.y, p.angle + (p.getupT > 0 ? PI / 4 : PI / 2), null, 0.3); return; }
    if (p.cyc && !p.cyc.parked) cycle2d(p.x - Math.sin(p.angle) * 2.6, p.y + Math.cos(p.angle) * 2.6, p.angle, p.cyc.col);
    const h = p.idle === 'sit' ? 1.8 : p.z > 0 ? 2.8 : 0.6;
    blit(ctx, p.look, p.x, p.y, p.angle, p.anim, h);
    frame2d(ctx);
    if (p.cape) { const c = Math.cos(p.angle), s = Math.sin(p.angle); ell(p.x + c * 0.6, p.y + s * 0.6, 3.6, 3.6, 3.1, p.angle, '#f6f6f2'); ell(p.x - c * 0.5, p.y - s * 0.5, 3.7, 2.2, 2.4, p.angle, '#e8e8e4'); const hp = headPos(p); dot(hp.x, hp.y, 6.2, 1.55, p.look.skin || '#a0683f'); dot(hp.x - c * 0.5, hp.y - s * 0.5, 6.3, 1.25, p.look.hair || '#1a1412'); }
    if (p.foam > 0.05) { const hp = headPos(p), c = Math.cos(p.angle), s = Math.sin(p.angle); for (const sd of [-1, 1]) dot(hp.x + c * 0.9 - s * 1.1 * sd, hp.y + s * 0.9 + c * 1.1 * sd, 6.6, 0.75 * p.foam, '#ffffff'); dot(hp.x + c * 1.5, hp.y + s * 1.5, 6.6, 0.7 * p.foam, '#fbfbfb'); }
    if (p.hold) drawHeld(p);
    if (p.tool) drawTool(p);
    if (p.umb) umbrella(p.x, p.y, p.angle, p.umb);
    if (p.z > 0 && p.bus && p.bus.alive) { // a hand on the bus rail
      const b = p.bus, sx = Math.sin(b.angle), sy = -Math.cos(b.angle), d = (b.T ? b.T.d : 11) / 2;
      seg(p.x, p.y, 7.4, p.x - sx * 2.4, p.y - sy * 2.4, 9.6, 0.7, p.look.skin || '#a0683f'); void d;
    }
    resetCtx(ctx);
  }

  /* ================================================================ spots + scenes */
  const SPOTS = [];
  const BYID = new Map();
  let UID = 1;
  const ACTIVE = [];
  class Scene {
    constructor(sp) {
      this.uid = UID++; this.spot = sp; this.K = sp.K; this.F = sp.F; this.L = null; this.sub = sp.sub || null;
      this.people = []; this.st = {}; this.on = true; this.level = 0; this.want = 0; this.lvlT = 0; this.rain = 0; this.ms = 0;
      this.style = styleAt(sp.x, sp.y); this.t = 0; this.night = false;
      this.fnLo = (ctx) => drawLo(ctx, this); this.fnHi = (ctx) => drawHi(ctx, this);
    }
  }
  function addSpot(s) {
    if (!s || !s.id || !KINDS[s.kind] || BYID.has(s.id)) return null;
    const sp = Object.assign({ K: KINDS[s.kind], seed: hash(s.id), scene: null, force: null, d: 1e9, layout: null }, s);
    SPOTS.push(sp); BYID.set(sp.id, sp);
    return sp;
  }
  function layoutOf(sp) {
    if (sp.layout) return sp.layout;
    try { sp.layout = sp.K.layout(sp) || {}; } catch (e) { N.err('citylife.layout:' + sp.id, e); sp.layout = {}; }
    if (!sp.layout.entry) sp.layout.entry = entries(sp.F, null, 6, 60, 110, sp.id);
    return sp.layout;
  }
  function peakLevel(peaks, m) {
    let L = 0;
    const Rr = 25;
    for (const p of peaks || []) {
      const a = p[0], b = p[1];
      let mm = m;
      if (b > 1440 && mm < a - Rr) mm += 1440;
      if (mm < a - Rr || mm > b + Rr) continue;
      const k = mm < a ? 1 - (a - mm) / Rr : mm > b ? 1 - (mm - b) / Rr : 1;
      L = Math.max(L, p[2] * smooth(k));
    }
    return L;
  }
  function inHours(m, hs) { if (!hs) return true; if (typeof hs[0] === 'number') hs = [hs]; for (const h of hs) { const a = h[0], b = h[1]; if (b > 1440 ? (m >= a || m < b - 1440) : (m >= a && m < b)) return true; } return false; }
  function shopOpen(place) {
    if (!place || !N.shops || !N.shops.status) return true;
    try { const s = N.shops.status(place); return !s || s.open !== false; } catch (e) { return true; }
  }
  /** the rules: time of day (peaks / base / hours), day of week, district style, season gates, rain, the shop's status */
  function levelOf(sc) {
    const sp = sc.spot, K = sc.K, D = sp.sub ? TRADES[sp.sub] : K, m = mins();
    if (sp.force && sp.force.level != null) return sp.force.level;
    if (K.when && !K.when(sc)) return 0;
    if (!inHours(m, D.hours)) return 0;
    if (sp.place && K.shopGate && !shopOpen(sp.place)) return 0;
    if (D.closedDow && D.closedDow.indexOf(dow()) >= 0) return 0;
    let L = peakLevel(D.peaks, m);
    if (D.base) L = Math.max(L, D.base);
    if (D.dow) L *= D.dow[dow()] == null ? 1 : D.dow[dow()];
    if (D.styles) L *= D.styles[sc.style] == null ? (D.styles.other == null ? 1 : D.styles.other) : D.styles[sc.style];
    if (D.fri && dow() === 5) L *= D.fri;
    L *= 0.8 + 0.4 * hash(sp.id + ':' + dayN());
    const rk = D.rainK == null ? 0.6 : D.rainK;
    L *= lerp(1, rk, clamp(sc.rain, 0, 1));
    return clamp(L, 0, 1.6);
  }

  /* ================================================================ KIND: irani (bench readers at the Irani cafe) */
  const PAPER_ROLES = { uncle: 4, office: 2, old: 2, man: 2, elder: 1 };
  const READER_ROLES_OC = { elder: 4, uncle: 2, old: 2, man: 2 };
  /** shared by irani / chai / saloon waiting benches: keep the bench at its schedule's head-count */
  function benchTick(sc, dt, seats, roles, o) {
    const want = Math.min(seats.length, Math.round(sc.level * seats.length * (o.mul || 1)) + (sc.level > 0.12 ? (o.min || 0) : 0));
    const n = count(sc, (p) => p.job === o.job);
    sc.st.benchT = (sc.st.benchT || rr(0.5, 2)) - dt;
    if (n < want && sc.st.benchT <= 0) {
      const s = freeOf(seats);
      if (s) { const p = arrive(sc, wpick(roles) || 'uncle', s, 'sit', { job: o.job }); if (p) { p.hold = rnd() < (o.paper || 0.6) ? 'paper' : (o.glass ? 'glass' : null); p.dur = rr(o.stay[0], o.stay[1]); } }
      sc.st.benchT = rr(2.5, 6);
    } else if (n > want + 1) {
      for (const p of sc.people) if (p.job === o.job && p.st === 'sit' && p.t > 6) { leave(p); break; }
    }
  }
  function readerAct(p, dt, sc) {
    if (p.st === 'sit') {
      if (!p.seat) { leave(p); return true; }
      sitAt(p, p.seat, dt);
      if (p.flip > 0) p.flip = Math.max(0, p.flip - dt * 2);
      p.timer -= dt;
      if (p.timer <= 0) {
        p.timer = rr(5, 13);
        if (p.hold === 'paper' && rnd() < 0.6) { p.flip = 1; p.n++; sound('page_flip', p.x, p.y, { vol: 0.25 }); }
        else if (p.hold === 'glass') sound('sip', p.x, p.y, { vol: 0.2 });
        if (p.barkCD <= 0 && rnd() < 0.12) { p.barkCD = 20; bark(p, pick(p.hold === 'paper' ? LINES.paper : LINES.readerChai)); }
      }
      if (p.t > p.dur && !(sc.st.talk && (sc.st.talk.a === p || sc.st.talk.b === p))) leave(p);
      return true;
    }
    return false;
  }
  function cricketTick(sc, dt, job) {
    talkTick(sc, dt);
    sc.st.argT = (sc.st.argT == null ? rr(8, 16) : sc.st.argT) - dt;
    if (sc.st.argT > 0 || sc.st.talk) return;
    sc.st.argT = rr(28, 55);
    const pl = N.player;
    if (!pl || Math.hypot(pl.x - sc.spot.x, pl.y - sc.spot.y) > 140) return;
    let a = null, b = null, bd = 9;
    for (const p of sc.people) { if (p.job !== job || p.st !== 'sit' || p.idle !== 'sit') continue; for (const q of sc.people) { if (q === p || q.job !== job || q.st !== 'sit' || q.idle !== 'sit') continue; const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd) { bd = d; a = p; b = q; } } }
    if (a && b) { const L = pick(LINES.cricket); const more = rnd() < 0.5 ? pick(LINES.cricket) : null; talkPair(a, b, more ? L.concat(more) : L, sc); }
  }
  function radioTick(sc, dt, x, y) {
    sc.st.radT = (sc.st.radT == null ? rr(1, 5) : sc.st.radT) - dt;
    if (sc.st.radT <= 0) { sc.st.radT = rr(7, 13); sound('cl_radio', x, y, { vol: 0.32 }); }
  }
  const KIND_IRANI = {
    label: 'Irani cafe', peaks: [[420, 540, 1], [960, 1140, 1], [1260, 1380, 0.45]], base: 0.3, hours: [[330, 1410]], dow: [1.2, 1, 1, 1, 1, 1.1, 1.1], rainK: 1.05, shopGate: true,
    layout(sp) {
      const F = sp.F, L = F.L, hl = F.hl, out = { seats: [], radio: null, cyc: null, cycPath: null, sit: null, kind: 'front' };
      const a0 = fang(F);
      const tryLine = (u0, u1, v, a, name) => { const s = seatsAlong(F, u0, u1, v, a, 3.4); return s.length >= 3 ? { s, name } : null; };
      const uMin = Math.max(-hl + 17, 2.4), uMax = hl - 10;
      const cands = [];
      if (uMax - uMin >= 6.5) cands.push(() => tryLine(uMin, uMax, 2.3, a0, 'front'));
      cands.push(() => { const s = []; for (let v = 3.2; v <= 13; v += 3.4) { const x = fx(F, -hl - 3.2, v), y = fy(F, -hl - 3.2, v); if (walkOk(x, y, 1.6)) s.push({ x, y, u: -hl - 3.2, v, a: aang(F), by: null, bench: true }); } return s.length >= 3 ? { s, name: 'left' } : null; });
      cands.push(() => { const s = []; for (let v = 3.2; v <= 13; v += 3.4) { const x = fx(F, hl + 3.2, v), y = fy(F, hl + 3.2, v); if (walkOk(x, y, 1.6)) s.push({ x, y, u: hl + 3.2, v, a: aang(F) + PI, by: null, bench: true }); } return s.length >= 3 ? { s, name: 'right' } : null; });
      cands.push(() => tryLine(-hl + 4, hl - 4, 16.5, a0 + PI, 'across'));
      for (const c of cands) { const r = c(); if (r) { out.seats = r.s.slice(0, 5); out.kind = r.name; break; } }
      if (out.seats.length) {
        const s0 = out.seats[0], s1 = out.seats[out.seats.length - 1];
        const dx = s1.x - s0.x, dy = s1.y - s0.y, d = Math.hypot(dx, dy) || 1;
        const rx = s1.x + (dx / d) * 3.2, ry = s1.y + (dy / d) * 3.2;
        out.radio = walkOk(rx, ry, 1.2) ? { x: rx, y: ry, a: s1.a } : { x: s0.x - (dx / d) * 3.2, y: s0.y - (dy / d) * 3.2, a: s0.a };
        out.sit = { x: (s0.x + s1.x) / 2, y: (s0.y + s1.y) / 2 };
        out.benchA = s0.a; out.bx0 = s0.x - (dx / d) * 1.7; out.by0 = s0.y - (dy / d) * 1.7; out.bx1 = s1.x + (dx / d) * 1.7; out.by1 = s1.y + (dy / d) * 1.7;
      }
      // the cyclist pulls up beyond the crowd ring
      for (const u of [0, -hl * 0.5, hl * 0.5]) { const x = fx(F, u, 17.5), y = fy(F, u, 17.5); if (walkOk(x, y, 3, true)) { out.cyc = { x, y, a: aang(F), u }; break; } }
      if (out.cyc) { const u = out.cyc.u; out.cycPath = [];
        for (const d of [-150, -100, -60, 60, 100, 150]) { const x = fx(F, u + d, 18.5), y = fy(F, u + d, 18.5); if (N.world.isWalkable(x, y)) out.cycPath.push({ x, y }); }
        if (out.cycPath.length < 2) out.cycPath = null; }
      return out;
    },
    start(sc) {
      const Lo = sc.L, roles = sc.style === 'oldcity' ? READER_ROLES_OC : PAPER_ROLES;
      const n = Math.min(Lo.seats.length, Math.round(sc.level * Lo.seats.length * 0.85));
      for (let i = 0; i < n; i++) { const s = Lo.seats[i]; const p = place(sc, wpick(roles), s, 'sit', { job: 'reader' }); if (p) { p.hold = i === 0 || rnd() < 0.6 ? 'paper' : 'glass'; p.dur = rr(30, 110); p.t = rr(0, 20); p.timer = rr(1, 8); } }
    },
    tick(sc, dt) {
      const Lo = sc.L;
      if (!Lo.seats.length) return;
      benchTick(sc, dt, Lo.seats, sc.style === 'oldcity' ? READER_ROLES_OC : PAPER_ROLES, { job: 'reader', min: 1, paper: 0.62, glass: true, stay: [40, 120] });
      cricketTick(sc, dt, 'reader');
      if (Lo.radio) radioTick(sc, dt, Lo.radio.x, Lo.radio.y);
      cyclistTick(sc, dt);
    },
    act(p, dt, sc) { if (p.job === 'reader') return readerAct(p, dt, sc); if (p.job === 'cyclist') return cyclistAct(p, dt, sc); return false; },
  };
  // the cyclist who pushes his cycle up, rings the bell, asks for "do chai", drinks, rides off
  const CYC_COL = ['#1a1a1e', '#1a1a1e', '#2a2a6a', '#5a1a1a', '#1a3a2a'];
  function cyclistTick(sc, dt) {
    const Lo = sc.L;
    if (!Lo.cyc || !Lo.cycPath) return;
    sc.st.cycT = (sc.st.cycT == null ? rr(4, 12) : sc.st.cycT) - dt;
    if (sc.st.cycT > 0 || count(sc, (p) => p.job === 'cyclist') || sc.level < 0.35) return;
    const pl = N.player, hid = (q) => Math.hypot(q.x - pl.x, q.y - pl.y) > 70; // rides in from down the street
    let from = null;
    for (const q of Lo.cycPath) if (hid(q) && (!from || rnd() < 0.5)) from = q; // comes in from out of sight
    if (!from) { sc.st.cycT = 2; return; }
    sc.st.cycT = rr(25, 55) / Math.max(0.5, sc.level);
    const p = newPerson(sc, pick(['man', 'office', 'youth', 'student']), from.x, from.y, Math.atan2(Lo.cyc.y - from.y, Lo.cyc.x - from.x), { job: 'cyclist' });
    if (!p) return;
    p.cyc = { col: pick(CYC_COL), parked: false }; p.st = 'cycIn'; p.spd = 34; p.t = 0;
  }
  function cyclistAct(p, dt, sc) {
    const Lo = sc.L, c = Lo.cyc;
    switch (p.st) {
      case 'cycIn': {
        const d = walkTo(p, c.x, c.y, p.spd, dt, 1.0);
        if (d < 1.8 || p.t > 30) { p.st = 'cycAsk'; p.t = 0; p.cyc.parked = false; sound('bell', p.x, p.y, { vol: 0.4 }); p.timer = rr(2.5, 4.5); bark(p, pick(LINES.cyclist)); }
        return true;
      }
      case 'cycAsk': {
        stand(p, sc.F ? fang(sc.F) + PI : p.angle, dt);
        p.timer -= dt;
        if (p.timer <= 0) { p.hold = 'glass'; sound('cup_clink', p.x, p.y, { vol: 0.35 }); p.st = 'cycDrink'; p.t = 0; p.timer = rr(9, 16); }
        return true;
      }
      case 'cycDrink': {
        stand(p, sc.F ? fang(sc.F) + PI + 0.6 : p.angle, dt);
        p.timer -= dt;
        if (rnd() < dt * 0.3) sound('sip', p.x, p.y, { vol: 0.2 });
        if (p.timer <= 0) { p.hold = null; sound('coin', p.x, p.y, { vol: 0.3 }); if (rnd() < 0.5) bark(p, pick(LINES.cyclistBye)); p.st = 'cycOut'; p.t = 0; let far = Lo.cycPath[0], fd = -1; for (const q of Lo.cycPath) { const d = Math.hypot(q.x - p.x, q.y - p.y) + rnd() * 30; if (d > fd) { fd = d; far = q; } } p.ex = far.x; p.ey = far.y; sound('bell', p.x, p.y, { vol: 0.35 }); }
        return true;
      }
      case 'cycOut': {
        const d = walkTo(p, p.ex, p.ey, 44, dt, 2);
        const pl = N.player, hidden = is3D() ? Math.hypot(p.x - pl.x, p.y - pl.y) > 150 : !N.render.inView(p.x, p.y, 10);
        if ((hidden && p.t > 1.5) || d < 3 || p.t > 25) dropPerson(p);
        return true;
      }
      default: return false;
    }
  }

  /* ================================================================ KIND: chai (roadside tea stall; the chai-wala is streetfood's) */
  const SF_CHAI = {
    label: 'Tea stall', type: 'cart', max: 7, peaks: [[420, 540, 1], [960, 1140, 0.95], [1140, 1260, 0.4]], base: 0.3, hours: [330, 1290],
    dow: [0.9, 1.1, 1.1, 1.1, 1.1, 1.1, 1],
    roles: (m) => (m < 690 ? { office: 3, uncle: 3, auto: 3, lungi: 2, man: 2, student: 1 } : { man: 3, youth: 3, auto: 3, uncle: 2, office: 2 }),
    vendor: { role: 'man', look: { shirt: '#e8e0c8', towel: '#c03030' }, work: 'chai' },
    stove: { u: -0.45, v: -0.1, h: 7.4, u3: -0.45, h3: 7.4 }, hold: 'glass', eat: [14, 34], parcel: 0.03, serve: 5,
    steam: { rate: 3.0, burst: 6, smoke: 0.05 }, sounds: { cook: 'cup_clink', serve: 'cup_clink', pay: 'coin' },
    orders: 'chai', vlines: 'chaiV', chat: 'chaiChat', vehicles: 2, lamp: 'bulb', glow: '#ff9a40', shelter: 'tarp', ring: { r0: 4.6, rows: 2, gap: 5.4 },
  };
  const KIND_CHAI = {
    label: 'Tea stall', peaks: SF_CHAI.peaks, base: 0.3, hours: [[330, 1290]], dow: SF_CHAI.dow, rainK: 1.0,
    layout(sp) {
      const F = sp.F, out = { seats: [], radio: null };
      // the bench beside the stall, end-on to the road; readers face the street
      for (const s of [1, -1]) {
        const u = s * (F.hl + 4.5), list = [];
        for (let v = -2.5; v <= 5; v += 3.4) { const x = fx(F, u, v), y = fy(F, u, v); if (walkOk(x, y, 1.6)) list.push({ x, y, u, v, a: aang(F) * 0 + (s > 0 ? aang(F) + PI : aang(F)), by: null, bench: true }); }
        if (list.length >= 2) { out.seats = list.slice(0, 3); out.side = s; break; }
      }
      if (out.seats.length) {
        const s1 = out.seats[out.seats.length - 1], u = s1.u;
        out.radio = { x: fx(F, u, s1.v + 3.2), y: fy(F, u, s1.v + 3.2) };
        out.bu = u;
      }
      return out;
    },
    start(sc) {
      const Lo = sc.L, n = Math.min(Lo.seats.length, Math.round(sc.level * Lo.seats.length * 0.8));
      for (let i = 0; i < n; i++) { const p = place(sc, wpick(PAPER_ROLES), Lo.seats[i], 'sit', { job: 'reader' }); if (p) { p.hold = rnd() < 0.5 ? 'paper' : 'glass'; p.dur = rr(30, 90); p.t = rr(0, 20); p.timer = rr(1, 8); } }
    },
    tick(sc, dt) {
      const Lo = sc.L;
      ensureSfSpot(sc.spot);
      if (Lo.seats.length) { benchTick(sc, dt, Lo.seats, PAPER_ROLES, { job: 'reader', paper: 0.5, glass: true, stay: [30, 90] }); cricketTick(sc, dt, 'reader'); }
      if (Lo.radio) radioTick(sc, dt, Lo.radio.x, Lo.radio.y);
    },
    act(p, dt, sc) { if (p.job === 'reader') return readerAct(p, dt, sc); return false; },
  };
  function ensureSfSpot(sp) {
    const S = N.streetfood;
    if (!S || !S.addSpot || !S.spot || !S.KINDS || !sp.sf) return;
    if (!S.KINDS.cl_chai) { try { S.register('cl_chai', SF_CHAI); } catch (e) { return; } }
    if (S.spot(sp.sf.id)) return;
    if (!S.spots || !S.spots.length) return; // its own spots are not built yet (it rebuilds them from scratch)
    try { S.addSpot(sp.sf); ST.sfSpots++; } catch (e) { N.err('citylife.sfSpot', e); }
  }

  /* ================================================================ KIND: saloon */
  const PROG_MAN = [['spray', 2.2], ['comb', 2], ['cut', 9], ['foam', 3], ['strop', 2.4], ['shave', 7], ['mirror', 2.2], ['talc', 2], ['pay', 1.6]];
  const PROG_SHORT = [['spray', 2], ['comb', 1.6], ['cut', 10], ['mirror', 2], ['talc', 1.8], ['pay', 1.5]];
  const PROG_KID = [['spray', 1.4], ['machine', 8], ['cut', 4], ['mirror', 1.6], ['talc', 1.6], ['pay', 1.2]];
  const KIND_SALOON = {
    label: 'Saloon', peaks: [[480, 720, 1], [1020, 1230, 0.8]], base: 0.3, hours: [[480, 1230]], closedDow: [2], dow: [2.0, 0.8, 0, 0.8, 0.85, 1, 1.3], rainK: 0.9, shopGate: true,
    layout(sp) {
      const F = sp.F, hl = F.hl, out = { chair: null, barber: null, seats: [], stand: [], strop: null, mirror: null, cabin: !sp.lm };
      if (sp.lm) { // a barber landmark: the chair at the open front, the bench where places_art paints it
        // the chair out on the footpath in front of the shop (the shop's own awning and board would hide it), a
        // standing mirror on its stand facing it, the waiting bench along the front; posters + chart on a board
        let cv = 8.2, cu = Math.min(2.5, hl - 6);
        for (const v of [8.2, 7, 9.5, 6]) { if (walkOk(fx(F, cu, v), fy(F, cu, v), 2.4) && walkOk(fx(F, cu, v + 3), fy(F, cu, v + 3), 2)) { cv = v; break; } }
        out.chair = { x: fx(F, cu, cv), y: fy(F, cu, cv), a: fang(F) + PI, u: cu, v: cv, by: null, bench: false };
        out.stand3 = true;
        out.mirror = { u0: cu - 2.3, u1: cu + 2.3, v: cv - 3.1, h0: 4.2, h1: 10.2, stand: true };
        out.strop = { x: fx(F, cu + 3.6, cv - 2.4), y: fy(F, cu + 3.6, cv - 2.4) };
        out.posters = [[cu + 4.6, cu + 7.0], [cu + 7.4, cu + 9.6]].filter((q) => q[1] < hl + 2);
        out.chart = [cu - 6.8, cu - 4.0];
        out.boardV = cv - 3.4;
        out.seats = seatsAlong(F, -hl + 2.2, cu - 5.2, cv - 1.2, fang(F) + 0.2, 3.2);
        if (out.seats.length < 2) out.seats = seatsAlong(F, -hl + 2.6, -hl + 8.4, 3.3, aang(F) + 0.25, 2.9);
        out.stand = slotsGrid(F, -hl + 3, cu - 4, cv + 2, cv + 5, 3.6, aang(F) + 0.4, false);
      } else { // a roadside cabin (this file draws it): the chair inside, facing the back-wall mirror
        out.chair = { x: fx(F, 0, -3.6), y: fy(F, 0, -3.6), a: fang(F) + PI, u: 0, v: -3.6, by: null, bench: false };
        out.mirror = { u0: -2.8, u1: 2.8, v: -6.1, h0: 4.6, h1: 10.4 };
        out.strop = { x: fx(F, 3.6, -5), y: fy(F, 3.6, -5) };
        out.posters = [[-6.4, -3.8], [3.8, 6.4]];
        out.chart = null;
        out.seats = seatsAlong(F, -5.4, 5.4, 2.4, fang(F) + 0.2, 3.6);
        out.stand = slotsGrid(F, -6, 6, 5.5, 8, 3.6, fang(F), false);
      }
      out.bx = fx(F, out.chair.u, out.chair.v + 2.4); out.by = fy(F, out.chair.u, out.chair.v + 2.4);
      if (!walkOk(out.bx, out.by, 1.6, true)) { out.bx = fx(F, out.chair.u + 2.4, out.chair.v + 1); out.by = fy(F, out.chair.u + 2.4, out.chair.v + 1); }
      return out;
    },
    start(sc) {
      const Lo = sc.L;
      const b = place(sc, 'man', { x: Lo.bx, y: Lo.by, a: fang(sc.F) + PI }, 'barber', { job: 'barber', fixed: true, mass: 60, must: true, over: { shirt: pick(['#f4f4f0', '#e8f0f8', '#f0e8d8']), pants: '#3a3a4a', kind: 'man' } });
      sc.st.barber = b;
      if (b) { b.idle = null; b.timer = 0; }
      const n = Math.min(Lo.seats.length, Math.round(sc.level * Lo.seats.length));
      for (let i = 0; i < n; i++) { const p = place(sc, rnd() < 0.2 ? 'kid' : wpick(PAPER_ROLES), Lo.seats[i], 'sit', { job: 'waiter' }); if (p) { p.hold = p.look.kind === 'kid' ? null : rnd() < 0.7 ? 'paper' : null; p.timer = rr(1, 8); } }
      if (sc.level > 0.15) { const p = place(sc, rnd() < 0.3 ? 'kid' : 'man', Lo.chair, 'chair', { job: 'client' }); if (p) startClient(sc, p, rr(0, 0.6)); }
    },
    tick(sc, dt) {
      const Lo = sc.L, F = sc.F;
      // waiting bench + standing overflow (Sunday mornings)
      const wantW = Math.round(sc.level * (Lo.seats.length + (dow() === 0 ? Lo.stand.length * 0.6 : 0)));
      const n = count(sc, (p) => p.job === 'waiter');
      sc.st.arrT = (sc.st.arrT == null ? rr(2, 5) : sc.st.arrT) - dt;
      if (n < wantW && sc.st.arrT <= 0) {
        sc.st.arrT = rr(4, 9);
        const s = freeOf(Lo.seats);
        const kid = rnd() < 0.22;
        if (s) { const p = arrive(sc, kid ? 'kid' : wpick(PAPER_ROLES), s, 'sit', { job: 'waiter' }); if (p) p.hold = kid ? null : rnd() < 0.6 ? 'paper' : null; }
        else { const t = freeOf(Lo.stand); if (t) { const p = arrive(sc, kid ? 'kid' : wpick({ man: 3, youth: 2, uncle: 2 }), t, 'stand', { job: 'waiter' }); if (p) p.hold = !kid && rnd() < 0.3 ? 'paper' : null; } }
      }
      // the next one to the chair
      const cl = sc.st.client;
      if ((!cl || !cl.alive || cl.sc !== sc || cl.st === 'leave') && sc.st.barber) {
        sc.st.client = null;
        let next = null;
        for (const p of sc.people) if (p.job === 'waiter' && p.st === 'sit' && p.idle === 'sit') { next = p; break; }
        if (!next) for (const p of sc.people) if (p.job === 'waiter' && p.st === 'stand') { next = p; break; }
        sc.st.nextT = (sc.st.nextT == null ? 1.5 : sc.st.nextT) - dt;
        if (next && sc.st.nextT <= 0 && !Lo.chair.by) {
          sc.st.nextT = rr(1.5, 3);
          if (next.seat && next.seat.by === next) next.seat.by = null; next.seat = null; if (next.slot && next.slot.by === next) next.slot.by = null; next.slot = null;
          next.idle = null; next.job = 'client'; next.hold = null; take(next, Lo.chair); next.st = 'toChair'; next.t = 0;
          sc.st.client = next;
          // the others shuffle up the bench
          for (const p of sc.people) if (p.job === 'waiter' && p.st === 'stand') { const s = freeOf(Lo.seats); if (s) { if (p.slot && p.slot.by === p) p.slot.by = null; p.slot = null; take(p, s); p.st = 'sit'; } break; }
        }
      }
      for (const p of sc.people) if (p.job === 'waiter' && p.st === 'sit') readerTick(p, dt);
      if (Lo.mirror) radioTick(sc, dt, fx(F, Lo.chair.u, Lo.chair.v - 2), fy(F, Lo.chair.u, Lo.chair.v - 2));
      // a remark from the bench now and then
      sc.st.remT = (sc.st.remT == null ? rr(10, 20) : sc.st.remT) - dt;
      if (sc.st.remT <= 0) { sc.st.remT = rr(18, 35); const w = sc.people.find((p) => p.job === 'waiter' && p.look.kind !== 'kid'); if (w) bark(w, pick(LINES.waiting)); }
    },
    act(p, dt, sc) {
      if (p.job === 'barber') { barberAct(p, dt, sc); return true; }
      if (p.job === 'client') return clientAct(p, dt, sc);
      return false;
    },
  };
  function readerTick(p, dt) {
    if (p.flip > 0) p.flip = Math.max(0, p.flip - dt * 2);
    p.timer -= dt;
    if (p.timer <= 0) { p.timer = rr(5, 12); if (p.hold === 'paper' && rnd() < 0.6) { p.flip = 1; p.n++; sound('page_flip', p.x, p.y, { vol: 0.22 }); } }
  }
  function startClient(sc, p, frac) {
    const kid = p.look.kind === 'kid';
    p.prog = kid ? PROG_KID : rnd() < 0.5 ? PROG_MAN : PROG_SHORT;
    p.pi = 0; p.k = frac ? frac * p.prog.length % 1 : 0; p.cape = true; p.foam = 0; p.st = 'chair'; p.idle = 'sit'; p.bench = false;
    if (frac) p.pi = Math.min(p.prog.length - 2, Math.floor(frac * (p.prog.length - 1)));
    sc.st.client = p;
  }
  function clientAct(p, dt, sc) {
    const Lo = sc.L;
    if (p.st === 'toChair') {
      if (sitAt(p, Lo.chair, dt)) { startClient(sc, p, 0); }
      else if (p.t > 6) { p.x = Lo.chair.x; p.y = Lo.chair.y; p.idle = 'sit'; startClient(sc, p, 0); }
      return true;
    }
    if (p.st === 'chair') {
      sitAt(p, Lo.chair, dt);
      const P2 = p.prog, ph = P2[p.pi];
      p.ph = ph[0];
      const B = sc.st.barber;
      if (B && B.alive) p.k += dt / ph[1];
      if (p.ph === 'foam') p.foam = Math.min(1, p.foam + dt / 2);
      if (p.ph === 'shave') p.foam = Math.max(0, 1 - p.k);
      if (p.k >= 1) {
        p.k = 0; p.pi++;
        if (p.pi >= P2.length) { // done: up, pay, off
          p.cape = false; p.foam = 0; sound('coin', p.x, p.y, { vol: 0.35, force: true });
          if (B && rnd() < 0.6) bark(B, pick(LINES.barber.slice(4)));
          leave(p); sc.st.client = null; ST.haircuts++;
          return true;
        }
        const nx = P2[p.pi][0];
        if (nx === 'talc') for (let i = 0; i < 6; i++) emit(sc, p.x + rr(-1.5, 1.5), p.y + rr(-1.5, 1.5), 6.6, 4, rr(1, 3), rr(0.8, 1.4), 0.6, 2.2, 0.55);
        if (B && rnd() < 0.3) bark(B, pick(p.look.kind === 'kid' ? LINES.barberKid : LINES.barber.slice(0, 4)));
      }
      return true;
    }
    return false;
  }
  function barberAct(b, dt, sc) {
    const Lo = sc.L, F = sc.F, cl = sc.st.client;
    const ch = Lo.chair, t = simT();
    b.tool = null;
    if (!cl || !cl.alive || cl.st !== 'chair') {
      // between clients: wipe the chair, look out at the street
      holdAt(b, Lo.bx, Lo.by, fang(F), dt);
      b.idle = 'work';
      b.hx = ch.x; b.hy = ch.y; b.hh = 3;
      return;
    }
    const ph = cl.ph, k = cl.k;
    const hp = headPos(cl);
    const behind = fang(F) + PI; // the client faces the mirror (into the shop)
    const bxo = cl.x - Math.cos(behind) * 2.6, byo = cl.y - Math.sin(behind) * 2.6;
    let tx = bxo, ty = byo;
    // circle round the client while cutting
    if (ph === 'cut' || ph === 'machine' || ph === 'comb') { const a = behind + PI + Math.sin(t * 0.35) * 1.1; tx = cl.x + Math.cos(a) * 2.8; ty = cl.y + Math.sin(a) * 2.8; }
    if (ph === 'strop' && Lo.strop) { tx = Lo.strop.x; ty = Lo.strop.y; }
    holdAt(b, tx, ty, Math.atan2(cl.y - b.y, cl.x - b.x), dt);
    b.idle = 'work';
    b.lookAt = null; b.lookTarget = cl;
    b.hx = hp.x; b.hy = hp.y; b.hh = 6.6;
    switch (ph) {
      case 'spray': b.tool = 'spray'; if (rnd() < dt * 6) emit(sc, hp.x, hp.y, 7, 0, rr(0.5, 1.5), 0.5, 0.4, 1.0, 0.35); break;
      case 'comb': b.tool = 'comb'; b.hx += Math.sin(t * 5) * 0.8; break;
      case 'cut': b.tool = 'scissors'; b.hx += Math.cos(t * 3) * 1.1; b.hy += Math.sin(t * 3) * 1.1; b.hh = 7 + Math.sin(t * 2) * 0.4; sc.st.snipT = (sc.st.snipT || 0) - dt; if (sc.st.snipT <= 0) { sc.st.snipT = rr(0.7, 1.3); sound('scissors', hp.x, hp.y, { vol: 0.35 }); if (rnd() < 0.35) emit(sc, hp.x, hp.y, 6.5, 4, -2, 0.9, 0.25, 0.35, 0.9); } break;
      case 'machine': b.tool = 'clipper'; b.hx += Math.cos(t * 2) * 0.9; b.hy += Math.sin(t * 2) * 0.9; sc.st.snipT = (sc.st.snipT || 0) - dt; if (sc.st.snipT <= 0) { sc.st.snipT = 1.5; sound('cl_clipper', hp.x, hp.y, { vol: 0.4 }); } break;
      case 'foam': b.tool = 'brush'; b.hx += Math.cos(t * 7) * 0.6; b.hy += Math.sin(t * 7) * 0.6; b.hh = 6.2; break;
      case 'strop': b.tool = 'razor'; b.hx = Lo.strop.x; b.hy = Lo.strop.y; b.hh = 6 + Math.abs(Math.sin(k * PI * 3)) * 2.2; sc.st.snipT = (sc.st.snipT || 0) - dt; if (sc.st.snipT <= 0) { sc.st.snipT = 1.2; sound('cl_strop', b.x, b.y, { vol: 0.35 }); } break;
      case 'shave': b.tool = 'razor'; b.hh = 6.2 + Math.sin(t * 4) * 0.4; b.hx += Math.cos(behind + 1.4) * 1.1; b.hy += Math.sin(behind + 1.4) * 1.1; break;
      case 'mirror': b.tool = 'mirror'; b.hx = cl.x - Math.cos(behind) * 1.8; b.hy = cl.y - Math.sin(behind) * 1.8; b.hh = 7.4; break;
      case 'talc': b.tool = 'brush'; b.hh = 6.8; break;
      default: break;
    }
  }

  /* ================================================================ KIND: busstop */
  const BUS_ROLES = { man: 3, office: 3, student: 2, aunty: 2, woman: 2, uncle: 2, youth: 2, college: 1, kid: 0.5 };
  const KIND_BUS = {
    label: 'Bus stop', peaks: [[480, 600, 1], [1020, 1170, 1]], base: 0.3, hours: [[330, 1350]], dow: [0.6, 1.1, 1.1, 1.1, 1.1, 1.1, 0.9], rainK: 0.85,
    layout(sp) {
      const F = sp.F, hl = F.hl, out = {};
      out.slots = slotsGrid(F, -hl + 2, hl - 2, 2.2, 8.5, 3.4, fang(F) + 0.2, false);
      out.seats = seatsAlong(F, -hl + 4, hl - 4, -2.8, fang(F), 3.6);
      out.vendor = [];
      for (const u of [-hl - 4, hl + 4]) { const x = fx(F, u, 4), y = fy(F, u, 4); if (walkOk(x, y, 2)) out.vendor.push({ x, y, a: fang(F), by: null }); }
      // the kerb point (the bus stops on the road beside the shelter)
      const q = busRoad(F);
      out.road = q ? { x: q.x, y: q.y, a: q.angle, w: q.road ? q.road.w : 30 } : null;
      return out;
    },
    start(sc) {
      const Lo = sc.L;
      const n = Math.min(Lo.slots.length + Lo.seats.length, Math.round(sc.level * 9));
      for (let i = 0; i < n; i++) { const seat = i % 3 === 2 ? freeOf(Lo.seats) : null; const s = seat || freeOf(Lo.slots); if (!s) break; const p = place(sc, wpick(BUS_ROLES), s, seat ? 'sit' : 'stand', { job: 'wait' }); if (p) { p.fa = s.a; p.hold = rnd() < 0.15 ? 'paper' : null; } }
      if (sc.level > 0.3) for (const v of Lo.vendor.slice(0, sc.level > 0.7 ? 2 : 1)) { const which = rnd() < 0.5 ? 'vendorP' : rnd() < 0.5 ? 'vendorC' : 'vendorS'; const p = place(sc, 'vendor', v, 'stand', { job: which, over: { prop: 'basket' } }); if (p) { p.hold = 'basket'; p.fa = v.a; } }
      sc.st.noBusT = 0;
    },
    tick(sc, dt) {
      const Lo = sc.L, F = sc.F, st = sc.st;
      // waiting crowd follows the schedule
      const want = Math.round(sc.level * 9);
      const n = count(sc, (p) => p.job === 'wait');
      st.arrT = (st.arrT == null ? rr(1, 4) : st.arrT) - dt;
      if (n < want && st.arrT <= 0 && !st.bus) {
        st.arrT = rr(3, 7);
        const seat = rnd() < 0.3 ? freeOf(Lo.seats) : null, s = seat || freeOf(Lo.slots);
        if (s) { const p = arrive(sc, wpick(BUS_ROLES), s, seat ? 'sit' : 'stand', { job: 'wait' }); if (p) p.fa = s.a; }
      }
      // a bus at the stop? (traffic.js stops its buses 4 s at every stop on their side)
      let bus = null;
      try { bus = N.traffic && N.traffic.busAt ? N.traffic.busAt(F.cx + F.nx * 10, F.cy + F.ny * 10, 75) : null; } catch (e) { bus = null; }
      if (!bus && st.own && st.own._clStop) bus = st.own;
      if (bus && bus !== st.bus) busArrive(sc, bus);
      if (st.bus) {
        const b = st.bus;
        const stopped = busStopped(b);
        if (stopped) {
          // keep the bus a little longer while people climb on (traffic owns it: only extend its stop timer)
          if (b.tr && st.boardT > 0 && b.tr.stopT < 1.2 && st.extend < 6) { b.tr.stopT += dt; st.extend += dt; }
          st.boardT -= dt;
        }
        if (!stopped && !st.departed) { st.departed = true; const con = st.conductor; if (con && con.alive) { bark(con, 'Right, right!', { force: true }); } sound('conductor', b.x, b.y, { vol: 0.6 }); N.emit('citylife:bus', { id: sc.spot.id, phase: 'depart' }); for (const p of sc.people) if (p.st === 'rush') { p.st = 'missed'; p.t = 0; } }
        if (!b.alive || (st.departed && (Math.hypot(b.x - F.cx, b.y - F.cy) > 110 || simT() - st.busAt > 40))) { st.bus = null; st.departed = false; for (const p of sc.people) if (p.st === 'hang') dropPerson(p); }
        st.noBusT = 0;
      } else {
        st.noBusT += dt;
        // nobody came for a long while: the scene brings its own bus (forced: soon)
        const wait = sc.spot.force ? (sc.spot.force.bus ? 6 : 14) : 70 - 30 * sc.level;
        if (st.noBusT > wait && !st.own && Lo.road) ownBus(sc);
        if (st.own && (!st.own.alive || simT() - st.ownT > 60)) st.own = null;
      }
      // a passing bus that did not stop: they run a few steps and give up
      talkTick(sc, dt);
      st.chatT = (st.chatT == null ? rr(10, 20) : st.chatT) - dt;
      if (st.chatT <= 0) { st.chatT = rr(16, 30); const w = sc.people.find((p) => p.job === 'wait' && p.st !== 'leave'); if (w) bark(w, pick(LINES.busWait)); }
      havaldarTick(sc, dt);
    },
    act(p, dt, sc) { return busAct(p, dt, sc); },
  };
  function busDoor(b, rear, out) {
    const a = b.angle, w = (b.T && b.T.w) || 34, d = (b.T && b.T.d) || 11, f = rear ? -w * 0.3 : w * 0.25, sx = Math.sin(a), sy = -Math.cos(a);
    out.x = b.x + Math.cos(a) * f + sx * (d / 2 + 0.6); out.y = b.y + Math.sin(a) * f + sy * (d / 2 + 0.6); out.sx = sx; out.sy = sy;
    return out;
  }
  const DOOR = { x: 0, y: 0, sx: 0, sy: 0 };
  function busArrive(sc, b) {
    const st = sc.st;
    st.bus = b; st.busAt = simT(); st.departed = false; st.boardT = 3.5; st.extend = 0;
    N.emit('citylife:bus', { id: sc.spot.id, phase: 'arrive' });
    ST.buses++;
    // the rush: most of the waiting crowd runs for the doors
    let i = 0;
    for (const p of sc.people) {
      if (p.job !== 'wait' || p.st === 'leave') continue;
      if (rnd() < 0.85) { p.st = 'rush'; p.t = 0; p.idle = null; p.rear = rnd() < 0.45; p.off = rr(-2.4, 2.4); if (p.seat && p.seat.by === p) p.seat.by = null; if (p.slot && p.slot.by === p) p.slot.by = null; p.seat = null; p.slot = null; p.board = rnd() < 0.8; p.delay = i * 0.25 + rr(0, 0.4); i++; }
    }
    if (i) { const r = sc.people.find((p) => p.st === 'rush'); if (r) bark(r, pick(LINES.busRush), { force: true }); }
    // men already hanging on the footboard (from earlier stops) + the conductor at the rear door
    const nh = (sc.level > 0.5 ? 2 : 1) + (rnd() < 0.5 ? 1 : 0);
    for (let k = 0; k < nh; k++) {
      busDoor(b, k % 2 === 1, DOOR);
      const p = newPerson(sc, k === 1 ? 'conductor' : pick(['youth', 'man', 'student', 'youth']), DOOR.x, DOOR.y, b.angle, { ghost: true, job: k === 1 ? 'conductor' : 'hang' });
      if (!p) break;
      p.st = 'hang'; p.bus = b; p.rear = k % 2 === 1; p.off = (k >> 1) * 1.8 * (k % 2 ? -1 : 1); p.z = 2.4; p.t = 0;
      if (k === 1) st.conductor = p;
    }
    if (st.conductor) bark(st.conductor, pick(LINES.conductor.slice(1)), { force: true, secs: 2 });
    sound('air_brake', b.x, b.y, { vol: 0.5 });
    // vendors come to the windows
    for (const p of sc.people) if (p.job === 'vendorP' || p.job === 'vendorC' || p.job === 'vendorS') { p.st = 'sell'; p.t = 0; p.off = rr(-8, 8); }
  }
  /** the scene-owned bus: spawned out of sight up the road, drives itself (vehicles.js physics) along the kerb lane,
   *  stops at the stop for the crowd, pulls out and is removed once out of sight at the end of its run */
  function ownBus(sc) {
    const st = sc.st, F = sc.F;
    st.noBusT = 0;
    const V = N.vehicles;
    if (!V || !V.spawn || !V.TYPES || !V.TYPES.bus) return;
    let q = null;
    q = busRoad(F);
    if (!q || !q.road || !q.road.pts) return;
    const pts = q.road.pts, cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1];
    const seg = clamp(q.seg | 0, 0, pts.length - 2), s0 = cum[seg] + (q.t || 0) * (cum[seg + 1] - cum[seg]);
    const at = (s) => { s = clamp(s, 0, total); let i = 1; while (i < pts.length - 1 && cum[i] < s) i++; const a = pts[i - 1], b = pts[i], L = (cum[i] - cum[i - 1]) || 1, t = (s - cum[i - 1]) / L; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ux: (b[0] - a[0]) / L, uy: (b[1] - a[1]) / L }; };
    const c0 = at(s0);
    const px = sc.spot.x - c0.x, py = sc.spot.y - c0.y;
    let dir = 1;
    if (c0.ux * py - c0.uy * px > 0) dir = -1; // the stop on the LEFT of travel (left-hand traffic)
    const off = Math.max(5, (q.road.w || 30) / 2 - 6.5), path = [];
    let stopI = 0;
    for (let d = -230; d <= 260; d += 14) {
      const sp = s0 + dir * d;
      if (sp < 0 || sp > total) continue;
      const c = at(sp), ux = c.ux * dir, uy = c.uy * dir;
      if (Math.abs(d) < 7) stopI = path.length;
      path.push({ x: c.x + uy * off, y: c.y - ux * off, nx: -uy, ny: ux }); // n: towards the road's centre (the overtaking side)
    }
    if (path.length < 6 || stopI < 3) return;
    const start = path[0], pl = N.player;
    if (Math.hypot(start.x - pl.x, start.y - pl.y) < 90 || !N.world.isDrivable(start.x, start.y)) return;
    let v = null;
    try { v = V.spawn('bus', start.x, start.y, Math.atan2(path[1].y - start.y, path[1].x - start.x), { driver: true, noEnter: true, seed: (rnd() * 1e6) | 0 }); } catch (e) { v = null; }
    if (!v) return;
    v.noEnter = true; v.clBus = { path, i: 0, stopI, ph: 'in', t: 0, sc };
    v.controller = busCtl;
    st.own = v; st.ownT = simT(); ST.ownBuses++;
    N.emit('citylife:bus', { id: sc.spot.id, phase: 'own' });
  }
  /** the road the buses use beside a stop: an arterial / street within reach, else the nearest road */
  function busRoad(F) {
    const x = F.cx + F.nx * 8, y = F.cy + F.ny * 8;
    let q = null;
    try { q = N.world.nearestRoadPoint(x, y, (r) => (r.kind === 'arterial' || r.kind === 'street' || r.kind === 'bund') && r.w >= 24); } catch (e) { q = null; }
    if (!q || q.dist > 70) { try { q = N.world.nearestRoadPoint(x, y); } catch (e) { q = null; } }
    return q;
  }
  /** Is something in the scene bus's way? Chinnu (always: the bus must never shove him), then whatever
   *  traffic.js's corridor sense finds (peds, cows, vehicles), feature-detected. Sampled ~10x/s. */
  function busBlocked(v, sp, ca, sa) {
    const T = v.T || {}, half = (T.w || 34) / 2, hw = (T.d || 11) / 2, range = 8 + Math.max(0, sp) * 0.3, pl = N.player;
    if (ca == null) { ca = Math.cos(v.angle); sa = Math.sin(v.angle); }
    if (pl && !pl.hidden && pl.alive !== false) {
      const pv = pl.vehicle, r = pv ? ((pv.T && pv.T.d) || 8) / 2 : (pl.r || 3.4);
      const dx = (pv ? pv.x : pl.x) - v.x, dy = (pv ? pv.y : pl.y) - v.y;
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      if (lx > half * 0.2 && lx - half - r < range && Math.abs(ly) < hw + r + 1.5) return pl;
    }
    const TR = N.traffic;
    if (TR && typeof TR.sense === 'function') {
      let ob = null;
      try { ob = TR.sense(v, ca, sa); } catch (e) { ob = null; }
      if (ob && ob.e && ob.e.alive && ob.gap < range && !(ob.e.cl && ob.e.ghost)) return ob.e;
    }
    return null;
  }
  function busGone(v) {
    try { N.vehicles.remove(v); } catch (er) { v.alive = false; }
    const sc = v.clBus && v.clBus.sc;
    if (sc && sc.st && sc.st.own === v) sc.st.own = null;
  }
  /** a blocker the bus may go round: anything standing still (Chinnu, a stalled scooter, a parked auto); people
   *  walking across and cows are waited for */
  const busPassable = (e) => !!e && (e === N.player ? Math.hypot(e.vx || 0, e.vy || 0) < 6 : e.kind === 'vehicle' && Math.abs(e.speed || 0) < 4);
  function busCtl(v, dt) {
    const B = v.clBus, ctl = v.ctl;
    if (!B || !ctl) return;
    const P2 = B.path, T = v.T || {};
    B.t += dt; B.life = (B.life || 0) + dt;
    while (B.i < P2.length - 1 && Math.hypot(P2[B.i].x - v.x, P2[B.i].y - v.y) < 12) B.i++;
    // overtaking: ease out towards the road's centre while B.swEnd is ahead, then back to the kerb lane
    const swMax = B.swMax || (B.swMax = (T.d || 11) + 4);
    const swWant = B.i < (B.swEnd || 0) ? swMax : 0;
    B.sw = (B.sw || 0) + clamp(swWant - (B.sw || 0), -dt * 10, dt * 10);
    const tg = P2[Math.min(P2.length - 1, B.i + 1)], tx = tg.x + (tg.nx || 0) * B.sw, ty = tg.y + (tg.ny || 0) * B.sw;
    ctl.steer = clamp(angDiff(v.angle, Math.atan2(ty - v.y, tx - v.x)) * 2.2, -1, 1);
    let want = B.sw > 1 ? 22 : 40, dStop = 1e9;
    if (B.ph === 'in') {
      const S = P2[B.stopI]; dStop = Math.hypot(S.x - v.x, S.y - v.y);
      want = Math.min(want, dStop * 0.7 + 2);
      if (dStop < 4 || (B.i > B.stopI)) { B.ph = 'stop'; B.t = 0; B.dwell = 9; v._clStop = true; }
    } else if (B.ph === 'stop') {
      want = 0;
      if (B.t > B.dwell) { B.ph = 'out'; v._clStop = false; }
    }
    const sp = v.speed || 0;
    // look ahead before moving: brake for Chinnu / people / animals / vehicles in the lane (never shove anyone)
    if (want > 0) {
      B.senseT = (B.senseT || 0) - dt;
      if (B.senseT <= 0) { B.senseT = 0.1; B.by = busBlocked(v, sp); B.blocked = !!B.by; }
      if (B.blocked) {
        want = 0; B.blockT = (B.blockT || 0) + dt;
        if (B.blockT > 1.5 && !B.honked) { B.honked = true; sound('bus_horn', v.x, v.y, { vol: 0.5, force: true }); }
        if (B.ph === 'in' && dStop < 45 && sp < 3) {
          // something parked in the bay: the bus stops right here, as they do
          B.ph = 'stop'; B.t = 0; B.dwell = 9; v._clStop = true; B.blockT = 0;
        } else if (B.blockT > 2 && !(B.i < (B.swEnd || 0)) && busPassable(B.by) && (B.ph !== 'in' || B.stopI - B.i > 4)) {
          // go round it if the overtaking lane is clear
          const q = P2[Math.min(P2.length - 1, B.i + 2)], ox = q.x + (q.nx || 0) * swMax - v.x, oy = q.y + (q.ny || 0) * swMax - v.y, ol = Math.hypot(ox, oy) || 1;
          if (!busBlocked(v, 10, ox / ol, oy / ol)) { B.swEnd = B.i + 5; B.blockT = 0; B.blocked = false; B.by = null; }
        }
      } else { B.blockT = Math.max(0, (B.blockT || 0) - dt * 0.5); if (B.blockT < 0.5) B.honked = false; }
    } else { B.blocked = false; B.by = null; }
    const e = want - sp;
    ctl.throttle = want > 0 ? clamp(e * 0.12, 0, 1) : 0;
    ctl.brake = e < -2 || want === 0 ? 1 : 0;
    const pl = N.player, hidden = is3D() ? Math.hypot(v.x - pl.x, v.y - pl.y) > 260 : !N.render.inView(v.x, v.y, 40);
    // give up: blocked for long (gone at once out of sight, else after a real wait), or a run that never ends
    // (e.g. stuck in 'in' for ever after the scene dropped st.own at 60 s)
    if ((B.blockT || 0) > (hidden ? 6 : 20) || B.life > (hidden ? 70 : 110)) { ST.busGaveUp++; ST.busGaveUpBy = B.by ? (B.by === N.player ? 'player' : B.by.kind + ':' + (B.by.type || B.by.role || '')) : 'timeout'; busGone(v); return; }
    if (B.ph === 'out' && B.i >= P2.length - 2 && (hidden || B.t > 40)) busGone(v);
  }
  const busStopped = (b) => !!(b && b.alive && ((b.tr && b.tr.stopT != null) || b._clStop));
  function busAct(p, dt, sc) {
    const st = sc.st, b = st.bus;
    switch (p.st) {
      case 'rush': {
        if (!b || !b.alive) { p.st = 'missed'; p.t = 0; return true; }
        if (p.delay > 0) { p.delay -= dt; stand(p, Math.atan2(b.y - p.y, b.x - p.x), dt); return true; }
        busDoor(b, p.rear, DOOR);
        const tx = DOOR.x + DOOR.sx * (2.2 + Math.abs(p.off) * 0.6) + Math.cos(b.angle) * p.off, ty = DOOR.y + DOOR.sy * (2.2 + Math.abs(p.off) * 0.6) + Math.sin(b.angle) * p.off;
        const d = walkTo(p, tx, ty, p.spd * 1.7, dt, 0.8);
        p.anim.run = true;
        if (d < 2.6) {
          if (st.departed) { p.st = 'missed'; p.t = 0; return true; }
          p.queueT = (p.queueT || 0) + dt;
          if (p.board && p.queueT > 0.6 + (p.delay || 0)) { // squeezes in (gone inside the bus); one or two end up on the footboard
            sound('step', p.x, p.y, { vol: 0.25 });
            if (rnd() < 0.3 && count(sc, (q) => q.st === 'hang') < 4) { p.st = 'hang'; p.bus = b; p.z = 2.4; p.solid = false; p.off = rr(-1.5, 1.5); p.t = 0; p.job = 'hang'; if (rnd() < 0.4) bark(p, pick(LINES.hanger)); }
            else dropPerson(p);
            ST.boarded++;
          }
        }
        return true;
      }
      case 'missed': {
        if (p.t < 1.2 && b && b.alive) { stand(p, Math.atan2(b.y - p.y, b.x - p.x), dt); return true; }
        if (p.barkCD <= 0 && rnd() < 0.3) { p.barkCD = 15; bark(p, pick(LINES.busMiss)); }
        const s = freeOf(sc.L.slots);
        if (s) { s.by = p; p.slot = s; p.st = 'stand'; p.fa = s.a; } else leave(p);
        return true;
      }
      case 'hang': { // on the footboard: rides with the bus (never the player: no interaction is offered)
        const bb = p.bus;
        if (!bb || !bb.alive) { dropPerson(p); return true; }
        busDoor(bb, p.rear, DOOR);
        p.x = DOOR.x + Math.cos(bb.angle) * p.off + DOOR.sx * 0.6; p.y = DOOR.y + Math.sin(bb.angle) * p.off + DOOR.sy * 0.6;
        p.vx = bb.vx || 0; p.vy = bb.vy || 0;
        p.angle = bb.angle + (p.rear ? -0.5 : 0.5) + Math.sin(simT() * 2 + p.off) * 0.08; p.facing = p.angle;
        p.anim.speed = 0; p.z = 2.4; p.idle = null; p.solid = false;
        const pl = N.player, far = Math.hypot(p.x - pl.x, p.y - pl.y);
        if (p.t > 60 || (far > 200 && st.departed) || (!is3D() && st.departed && !N.render.inView(p.x, p.y, 20))) dropPerson(p);
        return true;
      }
      case 'sell': { // vendors at the bus windows, basket held up
        if (!b || !b.alive || st.departed) { p.st = 'back'; p.t = 0; p.raise = 0; return true; }
        const a = b.angle, d = ((b.T && b.T.d) || 11) / 2 + 3.4;
        const tx = b.x + Math.cos(a) * p.off + Math.sin(a) * d, ty = b.y + Math.sin(a) * p.off - Math.cos(a) * d;
        const dd = walkTo(p, tx, ty, p.spd * 1.3, dt, 0.8);
        if (dd < 1.6) { stand(p, Math.atan2(b.y - p.y, b.x - p.x), dt); p.raise = Math.min(1, p.raise + dt * 2); p.look = p.lookAlt || (p.lookAlt = Object.assign({}, p.look0, { prop: 'tray' })); if (p.barkCD <= 0) { p.barkCD = rr(3, 6); bark(p, pick(p.job === 'vendorP' ? LINES.vendorPeanut : p.job === 'vendorC' ? LINES.vendorCucumber : LINES.vendorSamosa), { force: true, secs: 1.8 }); if (rnd() < 0.4) sound('coin', p.x, p.y, { vol: 0.3 }); } }
        return true;
      }
      case 'back': {
        p.look = p.look0; p.raise = 0;
        const s = p.slot || p.seat;
        const home = s || sc.L.vendor[0];
        if (!home) { leave(p); return true; }
        if (holdAt(p, home.x, home.y, home.a, dt) < 1.6) p.st = 'stand';
        return true;
      }
      default: return false;
    }
  }
  /** the havaldar (roadwork / busy stops) whistles at a kid racing his cycle past */
  function havaldarTick(sc, dt) {
    const h = sc.st.havaldar;
    if (!h || !h.alive) return;
    const pl = N.player;
    sc.st.whT = (sc.st.whT || 0) - dt;
    if (!pl || sc.st.whT > 0) return;
    const v = pl.vehicle;
    const sp = v ? Math.abs(v.speed || 0) : Math.hypot(pl.vx || 0, pl.vy || 0);
    const d = Math.hypot(pl.x - h.x, pl.y - h.y);
    if (v && /cycle/.test(v.type || '') && sp > TUNE.whistleSpd && d < TUNE.whistleR) {
      sc.st.whT = 9; sound('whistle', h.x, h.y, { vol: 0.7, force: true }); bark(h, pick(LINES.havaldar), { force: true }); h.lookAt = pl; h.lookT = 3; ST.whistles++;
      N.emit('citylife:whistle', { id: sc.spot.id });
    }
  }

  /* ================================================================ KIND: trade (street trades) */
  // pose: 'sit' (on a stool / gunny cloth), 'work' (standing at work), 'mobile' (pushes a handcart along the frontage)
  const TRADES = {
    cobbler: { label: 'Cobbler under the tree', role: 'lungi', look: { shirt: '#d8cfb8', towel: '#8a6a3a' }, pose: 'sit', hours: [[540, 1140]], peaks: [[600, 780, 1], [960, 1110, 0.8]], base: 0.35, dow: [1.3, 1, 1, 1, 1, 1, 1.1], rainK: 0.7, cust: 2, sfx: 'cl_tap', calls: ['Chappal silai! Joota polish!', 'Aao saab, do minute mein!'], custLines: ['Anna, chappal ka strap toot gaya.', 'Polish karo, achha wala.'], tree: true, styles: { market: 1.2, oldcity: 1.1, colonial: 1.1, colony: 1 } },
    puncture: { label: 'Puncture shop', role: 'man', look: { shirt: '#5a5a62', pants: '#3a3a40' }, pose: 'work', hours: [[420, 1260]], peaks: [[480, 660, 0.9], [1020, 1200, 1]], base: 0.4, rainK: 1.3, cust: 2, sfx: 'cl_bubbles', calls: ['Puncture! Tube badlo!', 'Hawa bharo, ek rupaya!'], custLines: ['Anna, puncture hai, jaldi.', 'Kitna time lagega?'] },
    ironing: { label: 'Ironing-wala', role: 'lungi', look: { towel: '#efe6d0' }, pose: 'work', hours: [[420, 1200]], peaks: [[450, 660, 1], [960, 1140, 0.8]], base: 0.35, rainK: 0.45, cust: 1, sfx: 'cl_iron', calls: ['Istri! Kapde istri!', 'Shaam tak ho jayega, amma.'], custLines: ['Yeh sab shaam tak, haan.', 'Kitne kapde hue?'], styles: { colony: 1.3, cantonment: 1.2, colonial: 1, other: 0.8 } },
    tailor: { label: 'Tailor', role: 'man', look: { shirt: '#e8e0c8', specs: true }, pose: 'sit', hours: [[600, 1230]], peaks: [[660, 840, 0.8], [1020, 1200, 1]], base: 0.45, dow: [0.4, 1, 1, 1, 1, 1.1, 1.2], rainK: 0.9, cust: 1, sfx: 'cl_sewing', calls: ['Naap de do, kal le jao!', 'Blouse, pant, shirt... sab silte hain!'], custLines: ['Thoda dheela rakhna.', 'Eid se pehle ho jayega na?'] },
    knife: { label: 'Knife sharpener', role: 'man', look: { shirt: '#c8b89a', towel: '#c03030' }, pose: 'work', hours: [[600, 1050]], peaks: [[630, 780, 1], [900, 1020, 0.8]], base: 0.3, rainK: 0.2, cust: 1, sfx: 'cl_grind', calls: ['Chhuri-kainchi tez karwa lo!', 'Saan pe chadha do! Dhaar lagao!'], custLines: ['Yeh chhuri, aur yeh kainchi.', 'Achhi dhaar lagana, anna.'], styles: { oldcity: 1.3, colony: 1.1, other: 1 } },
    raddi: { label: 'Raddi-wala', role: 'lungi', look: { towel: '#e8d8a8' }, pose: 'mobile', cart: 'raddi', hours: [[540, 780]], peaks: [[570, 750, 1]], base: 0.4, dow: [1.6, 1, 1, 1, 1, 1, 1.2], rainK: 0.3, cust: 1, sfx: 'cl_file', calls: ['Raddi paper! Purane akhbaar!', 'Khaali seesha, purana loha, raddi!'], custLines: ['Kilo kitna de rahe ho?', 'Taraazu theek hai na?'], styles: { colony: 1.3, cantonment: 1.2, other: 0.9 } },
    vegcart: { label: 'Vegetable cart', role: 'man', look: { towel: '#3a8a3a' }, pose: 'mobile', cart: 'veg', hours: [[390, 690], [960, 1170]], peaks: [[420, 600, 1], [990, 1140, 0.9]], base: 0.35, rainK: 0.5, cust: 2, calls: ['Tamatar! Aloo! Pyaaz! Taaza sabzi!', '*Bendakaya, vankaya*, taaza hai amma!', 'Dhaniya muft, amma!'], custLines: ['Tamatar kaise diye?', 'Thoda dhaniya daal do.', 'Itna mehenga?'], styles: { colony: 1.3, cantonment: 1.2, market: 1.1, other: 0.9 } },
    flowers: { label: 'Flower seller', role: 'aunty', look: {}, pose: 'sit', hours: [[360, 690], [960, 1200]], peaks: [[390, 600, 1], [1020, 1170, 0.8]], base: 0.4, fri: 1.5, rainK: 0.5, cust: 1, calls: ['*Mallepoolu!* Moora do rupay!', 'Gulab, chameli, kanakambaram!'], custLines: ['Ek moora mallepoolu.', 'Gende ka haar bhi dena.'], styles: { oldcity: 1.1, market: 1.2, colony: 1.1, other: 1 } },
    cyclerepair: { label: 'Cycle repair stand', role: 'man', look: { shirt: '#6a7a8a' }, pose: 'work', hours: [[480, 1200]], peaks: [[480, 600, 0.8], [960, 1140, 1]], base: 0.4, dow: [1.3, 1, 1, 1, 1, 1, 1.1], rainK: 1.1, cust: 1, sfx: 'freewheel', calls: ['Cycle repair! Hawa, chain, brake!', 'Chain tight karo, aath aane!'], custLines: ['Anna, chain baar baar utar rahi.', 'Brake hi nahi lag raha!'] },
    keymaker: { label: 'Key maker', role: 'old', look: { specs: 'round' }, pose: 'sit', hours: [[600, 1140]], peaks: [[660, 840, 0.8], [960, 1080, 1]], base: 0.35, rainK: 0.6, cust: 1, sfx: 'cl_file', calls: ['Chaabi banwa lo! Taala-chaabi!', 'Duplicate chaabi, paanch minute!'], custLines: ['Iski ek duplicate chahiye.', 'Godrej wala nahi, chhota wala.'] },
  };
  const TRADE_LIST = Object.keys(TRADES);
  // where a trade sits in its frame (worker home W, customer slot C, props), facing the street (frame n = to the road)
  const KIND_TRADE = {
    label: 'Street trade', rainK: 0.7,
    layout(sp) {
      const F = sp.F, T = TRADES[sp.sub], out = { W: null, C: [], patrol: null };
      const wv = T.pose === 'mobile' ? 1.5 : -1.5;
      out.W = { x: fx(F, 0, wv), y: fy(F, 0, wv), a: fang(F), u: 0, v: wv };
      if (sp.sub === 'tailor' || sp.sub === 'keymaker') out.W.a = fang(F);
      if (sp.sub === 'cobbler') out.W.a = fang(F) + 0.4;
      const cs = T.pose === 'mobile' ? [[-4, 4.5], [4, 4.5]] : [[-4.6, 4.2], [5.2, 3.8], [-8, 2.2]];
      for (const [u, v] of cs) { const x = fx(F, u, v), y = fy(F, u, v); if (walkOk(x, y, 1.8, true)) out.C.push({ x, y, u, v, a: Math.atan2(out.W.y - y, out.W.x - x), by: null }); }
      if (T.pose === 'mobile') {
        const pts = [];
        for (const u of [-40, -20, 0, 20, 40]) { const x = fx(F, u, 1.5), y = fy(F, u, 1.5); if (walkOk(x, y, 2.6)) pts.push({ x, y, u }); }
        out.patrol = pts.length >= 2 ? pts : [{ x: out.W.x, y: out.W.y, u: 0 }];
      }
      // the cobbler's tree: a real one nearby, else ours
      if (T.tree) {
        let tree = null;
        try { const TR = N.world.trees || []; let bd = 26; for (const t of TR) { const d = Math.hypot(t.x - out.W.x, t.y - out.W.y); if (d < bd) { bd = d; tree = t; } } } catch (e) { tree = null; }
        out.tree = tree ? { x: tree.x, y: tree.y, own: false } : { x: fx(F, -5, -8), y: fy(F, -5, -8), own: true, r: 9 };
      }
      return out;
    },
    start(sc) {
      const Lo = sc.L, T = TRADES[sc.sub];
      const w = place(sc, T.role, Lo.W, T.pose === 'sit' ? 'sit' : 'stand', { job: 'worker', fixed: T.pose !== 'mobile', mass: 40, must: true, over: T.look });
      if (w) { w.fa = Lo.W.a; w.timer = rr(0.5, 2); if (T.pose === 'sit') { w.idle = 'sit'; w.bench = false; take(w, { x: Lo.W.x, y: Lo.W.y, a: Lo.W.a, by: null, bench: false }); } if (T.pose === 'mobile') { w.pi = 0; w.dir = 1; w.st = 'patrol'; w.stopT = rr(4, 8); } }
      sc.st.worker = w;
      const nc = Math.min(Lo.C.length, Math.round(sc.level * T.cust));
      for (let i = 0; i < nc; i++) { const p = place(sc, custRole(sc.sub), Lo.C[i], 'cust', { job: 'cust' }); if (p) { p.dur = rr(10, 25); p.t = rr(0, 8); custProps(p, sc.sub); } }
    },
    tick(sc, dt) {
      const Lo = sc.L, T = TRADES[sc.sub], st = sc.st, w = st.worker;
      if (!w || !w.alive) return;
      // customers
      const want = Math.min(Lo.C.length, Math.round(sc.level * T.cust + (sc.level > 0.3 ? 0.3 : 0)));
      const n = count(sc, (p) => p.job === 'cust');
      st.arrT = (st.arrT == null ? rr(3, 8) : st.arrT) - dt;
      if (n < want && st.arrT <= 0 && (T.pose !== 'mobile' || w.st === 'halt')) {
        st.arrT = rr(8, 18);
        const s = freeOf(Lo.C);
        if (s) { const p = arrive(sc, custRole(sc.sub), s, 'cust', { job: 'cust' }); if (p) { p.dur = rr(12, 28); custProps(p, sc.sub); } }
      }
      // the trade's call
      st.callT = (st.callT == null ? rr(3, 8) : st.callT) - dt;
      if (st.callT <= 0) { st.callT = T.pose === 'mobile' ? rr(7, 12) : rr(14, 26); bark(w, pick(T.calls)); if (T.pose === 'mobile' || rnd() < 0.3) sound('vendor_call', w.x, w.y, { vol: 0.35 }); }
      // umbrella in the rain
      w.umb = sc.rain > 0.2 && T.pose !== 'work' ? '#2a2a6a' : null;
    },
    act(p, dt, sc) {
      if (p.job === 'worker') { tradeWork(p, dt, sc); return true; }
      if (p.job === 'cust') {
        if (p.st === 'cust') {
          const s = p.slot || p.seat;
          const w = sc.st.worker;
          if (s) holdAt(p, s.x, s.y, w ? Math.atan2(w.y - p.y, w.x - p.x) : s.a, dt); else stand(p, p.fa, dt);
          if (p.t > 2 && !p.said && rnd() < dt * 0.4) { p.said = true; bark(p, pick(TRADES[sc.sub].custLines)); }
          if (p.t > p.dur) { if (rnd() < 0.7) sound('coin', p.x, p.y, { vol: 0.3 }); p.said = false; leave(p); }
          return true;
        }
      }
      return false;
    },
  };
  function custRole(sub) {
    switch (sub) {
      case 'ironing': case 'vegcart': case 'flowers': return pick(['aunty', 'aunty', 'woman']);
      case 'knife': return pick(['aunty', 'lungi', 'uncle']);
      case 'raddi': return pick(['uncle', 'aunty', 'old']);
      case 'cyclerepair': return pick(['kid', 'student', 'youth', 'man']);
      case 'puncture': return pick(['youth', 'man', 'student', 'office']);
      default: return pick(['man', 'uncle', 'office', 'youth', 'aunty']);
    }
  }
  function custProps(p, sub) {
    if (sub === 'ironing') p.hold = 'bundle';
    else if (sub === 'raddi') p.hold = 'paper';
    else if (sub === 'knife') p.hold = 'knife';
    else if (sub === 'tailor') p.hold = 'clothes';
    p.said = false;
  }
  function tradeWork(w, dt, sc) {
    const Lo = sc.L, T = TRADES[sc.sub], F = sc.F, t = simT();
    const c = Math.cos(w.angle), s = Math.sin(w.angle);
    w.tool = null;
    if (T.pose === 'mobile') {
      const P2 = Lo.patrol;
      if (w.st === 'patrol') {
        const tg = P2[w.pi];
        const d = walkTo(w, tg.x, tg.y, 14, dt, 1);
        w.idle = null;
        if (d < 1.6) { w.st = 'halt'; w.stopT = rr(10, 22); w.angle = aang(F) * (w.dir > 0 ? 1 : -1); }
      } else {
        stand(w, fang(F), dt);
        w.idle = 'work';
        w.stopT -= dt;
        if (sc.sub === 'raddi') { w.tool = 'scale'; w.hx = w.x + c * 2.6; w.hy = w.y + s * 2.6; w.hh = 6.4; w.k = (w.k || 0) + dt; if (w.k > 4) { w.k = 0; sound('cl_file', w.x, w.y, { vol: 0.15 }); } }
        if (w.stopT <= 0 && !count(sc, (p) => p.job === 'cust' && p.st === 'cust')) {
          w.pi += w.dir; if (w.pi >= P2.length || w.pi < 0) { w.dir = -w.dir; w.pi = clamp(w.pi + 2 * w.dir, 0, P2.length - 1); }
          w.st = 'patrol';
        }
      }
      return;
    }
    if (w.seat) sitAt(w, w.seat, dt); else holdAt(w, Lo.W.x, Lo.W.y, Lo.W.a, dt);
    if (T.pose === 'work') w.idle = 'work';
    w.timer -= dt;
    const busy = count(sc, (p) => p.job === 'cust' && p.st === 'cust') > 0 || sc.level > 0.25;
    switch (sc.sub) {
      case 'cobbler': { w.tool = 'hammer'; w.hx = w.x + c * 2.4; w.hy = w.y + s * 2.4; w.hh = 2.6 + Math.abs(Math.sin(t * 6)) * 1.2; if (busy && w.timer <= 0) { w.timer = rr(1.8, 3.2); sound('cl_tap', w.x, w.y, { vol: 0.3 }); } break; }
      case 'puncture': { // dunks the tube in the tub: bubbles where the hole is
        const tub = { x: fx(F, 3.2, 1.6), y: fy(F, 3.2, 1.6) };
        w.tool = 'tube'; w.hx = tub.x; w.hy = tub.y; w.hh = 3 + Math.sin(t * 1.4) * 0.5;
        if (busy && rnd() < dt * 4) emit(sc, tub.x + rr(-1.2, 1.2), tub.y + rr(-1.2, 1.2), 3.05, 3, 0, rr(0.6, 1.3), 0.3, 0.7, 0.9);
        if (busy && w.timer <= 0) { w.timer = rr(2.5, 5); sound('cl_bubbles', tub.x, tub.y, { vol: 0.3 }); }
        break;
      }
      case 'ironing': { // the coal iron slides over the shirt; smoke curls from its chimney
        const u = Math.sin(t * 1.6) * 2.4;
        w.tool = 'iron'; w.hx = fx(F, u, 1.4); w.hy = fy(F, u, 1.4); w.hh = 5.6;
        if (rnd() < dt * 2.2) emit(sc, w.hx, w.hy, 6.8, 1, rr(3, 6), rr(1.6, 2.6), 0.6, 2.6, 0.32);
        if (busy && w.timer <= 0) { w.timer = rr(3, 6); sound('cl_iron', w.hx, w.hy, { vol: 0.3 }); }
        break;
      }
      case 'tailor': { w.tool = 'needle'; w.hx = fx(F, 0.4, 0.4); w.hy = fy(F, 0.4, 0.4); w.hh = 5.4 + Math.sin(t * 30) * 0.12; if (busy && w.timer <= 0) { w.timer = rr(2.5, 5.5); sound('cl_sewing', w.x, w.y, { vol: 0.3 }); } break; }
      case 'knife': { // pedals the stand: the wheel spins and throws sparks
        const wh = { x: fx(F, 2.6, 1.4), y: fy(F, 2.6, 1.4) };
        w.tool = 'knife'; w.hx = wh.x; w.hy = wh.y; w.hh = 5.6; w.anim.phase += dt * 6;
        const grinding = busy && (t % 6) < 3.6;
        sc.st.grind = grinding;
        if (grinding && rnd() < dt * 18) sparks(sc, wh.x, wh.y, 5.4, 1, 12);
        if (grinding && w.timer <= 0) { w.timer = rr(2.4, 4); sound('cl_grind', wh.x, wh.y, { vol: 0.32 }); }
        break;
      }
      case 'flowers': { w.tool = 'garland'; w.hx = w.x + c * 2.2; w.hy = w.y + s * 2.2; w.hh = 2.6 + Math.sin(t * 3) * 0.3; w.n = (t * 0.5) | 0; break; }
      case 'cyclerepair': { w.tool = rnd() < 0.002 ? 'pump' : 'hammer'; const wh = { x: fx(F, 2.8, 1.8), y: fy(F, 2.8, 1.8) }; w.hx = wh.x; w.hy = wh.y; w.hh = 4.6; if (busy && w.timer <= 0) { w.timer = rr(4, 8); sound('freewheel', wh.x, wh.y, { vol: 0.3 }); } break; }
      case 'keymaker': { w.tool = 'file'; w.hx = w.x + c * 2.2; w.hy = w.y + s * 2.2; w.hh = 4 + Math.sin(t * 9) * 0.2; if (busy && w.timer <= 0) { w.timer = rr(3, 6); sound(rnd() < 0.5 ? 'cl_file' : 'keys', w.x, w.y, { vol: 0.28 }); } break; }
      default: break;
    }
  }

  /* ================================================================ KIND: roadwork */
  const KIND_ROAD = {
    label: 'Roadwork', peaks: [[540, 1050, 1]], base: 0, hours: [[510, 1080]], dow: [0.15, 1, 1, 1, 1, 1, 1], rainK: 0.25, always: true,
    layout(sp) {
      const F = sp.F, out = { work: [], loopA: null, loopB: null };
      const zw = sp.zw;
      out.zw = zw;
      out.pit = { u0: -17, u1: 6, v0: -zw + 0.8, v1: 0.6 };
      out.mixer = { x: fx(F, 17, 1.2), y: fy(F, 17, 1.2) };
      out.drum = { x: fx(F, 10.5, -zw * 0.45), y: fy(F, 10.5, -zw * 0.45) };
      out.sand = { x: fx(F, 25, 3.6), y: fy(F, 25, 3.6) };
      out.bricks = { x: fx(F, -20, 3.2), y: fy(F, -20, 3.2) };
      out.board = { u: -27, v: -zw + 0.8 };
      const ok = (u, v) => { const x = fx(F, u, v), y = fy(F, u, v); return { x, y, ok: N.world.isWalkable(x, y) || N.world.isDrivable(x, y) }; };
      out.digger = ok(-5, -zw * 0.55); out.digger.a = aang(F) + PI / 2;
      out.shovel = ok(17, -3.6); out.shovel.a = Math.atan2(out.mixer.y - out.shovel.y, out.mixer.x - out.shovel.x);
      out.loopA = ok(22, 0.2); out.loopB = ok(7.5, -2.6);
      // the havaldar stands at the head of the strip on the work side of the barricade line, never in the live lane
      out.hav = ok(-31, -zw + 1.5); out.hav.a = aang(F) + PI;
      out.watch = ok(-24, 2.6); out.watch.a = fang(F) + PI;
      out.shelter = slotsGrid(F, 16, 26, 2, 5, 3.4, fang(F) + PI, true);
      return out;
    },
    start(sc) {
      const Lo = sc.L, st = sc.st;
      st.crew = [];
      if (sc.level > 0.1) {
        const d = place(sc, 'labour', Lo.digger, 'stand', { job: 'digger', fixed: true, mass: 40 }); if (d) { d.fa = Lo.digger.a; st.crew.push(d); }
        const s = place(sc, 'labour', Lo.shovel, 'stand', { job: 'shovel', fixed: true, mass: 40 }); if (s) { s.fa = Lo.shovel.a; st.crew.push(s); }
        const nc = sc.level > 0.6 ? 3 : 2;
        for (let i = 0; i < nc; i++) { const w = i % 2 === 0; const P2 = place(sc, w ? 'labourW' : 'labour', i % 2 ? Lo.loopA : Lo.loopB, 'carry', { job: 'carry', over: { prop: 'pot' } }); if (P2) { P2.leg = i % 2; P2.k = rnd(); P2.hold = w ? 'pan' : 'bricks'; P2.n = i; st.crew.push(P2); } }
        const h = place(sc, 'havaldar', Lo.hav, 'stand', { job: 'havaldar', fixed: true, mass: 60, must: true }); if (h) { h.fa = Lo.hav.a; st.havaldar = h; }
      } else {
        const w = place(sc, 'lungi', Lo.watch, 'sit', { job: 'watch', fixed: true, mass: 40 }); if (w) { w.idle = 'sit'; w.bench = false; take(w, { x: Lo.watch.x, y: Lo.watch.y, a: Lo.watch.a, by: null, bench: false }); }
      }
    },
    tick(sc, dt) {
      const Lo = sc.L, st = sc.st, F = sc.F;
      havaldarTick(sc, dt);
      narrowLane(sc, dt);
      // the tar drum smokes over its fire all day (and the embers fly)
      if (TUNE.particles) {
        st.smk = (st.smk || 0) + dt * (sc.level > 0.1 ? 3.2 : 1.2);
        while (st.smk >= 1) { st.smk -= 1; emit(sc, Lo.drum.x + rr(-0.8, 0.8), Lo.drum.y + rr(-0.8, 0.8), 6.6, 1, rr(5, 9), rr(2.8, 4.2), 1.4, rr(6, 9.5), 0.55); }
        if (rnd() < dt * 2) sparks(sc, Lo.drum.x, Lo.drum.y, 1.4, 1, 5);
      }
      st.mixA = (st.mixA || 0) + dt * (sc.level > 0.1 && sc.rain < 0.3 ? 2.4 : 0);
      st.mixT = (st.mixT == null ? rr(1, 3) : st.mixT) - dt;
      if (st.mixT <= 0 && sc.level > 0.1) { st.mixT = rr(4, 7); sound('cl_mixer', Lo.mixer.x, Lo.mixer.y, { vol: 0.35 }); }
      // labourers' calls; Chinnu near the pit
      st.callT = (st.callT == null ? rr(6, 12) : st.callT) - dt;
      if (st.callT <= 0) { st.callT = rr(12, 24); const c = st.crew && st.crew.length ? pick(st.crew) : null; if (c && c.alive) bark(c, pick(LINES.labour)); }
      const pl = N.player;
      st.pitT = (st.pitT || 0) - dt;
      if (pl && !pl.vehicle && st.pitT <= 0 && st.crew && st.crew.length) {
        const cx = fx(F, (Lo.pit.u0 + Lo.pit.u1) / 2, (Lo.pit.v0 + Lo.pit.v1) / 2), cy = fy(F, (Lo.pit.u0 + Lo.pit.u1) / 2, (Lo.pit.v0 + Lo.pit.v1) / 2);
        if (Math.hypot(pl.x - cx, pl.y - cy) < 16) { st.pitT = 12; const c = st.crew[0]; if (c && c.alive) { bark(c, pick(LINES.pit), { force: true }); c.lookAt = pl; c.lookT = 2.5; } }
      }
      // rain: work stops, the crew sits it out by the sand heap
      if (sc.rain > 0.3 && !st.rainy) { st.rainy = true; for (const p of sc.people) if (p.job === 'carry' || p.job === 'digger' || p.job === 'shovel') { const s = freeOf(Lo.shelter); if (s) { p.prevSt = p.st; take(p, s); p.st = 'shelterSit'; p.fixed = false; } } }
      if (sc.rain < 0.15 && st.rainy) { st.rainy = false; for (const p of sc.people) if (p.st === 'shelterSit') { if (p.seat && p.seat.by === p) p.seat.by = null; p.seat = null; p.idle = null; p.st = p.prevSt || 'stand'; } }
    },
    act(p, dt, sc) {
      const Lo = sc.L, t = simT();
      if (p.st === 'shelterSit') { if (p.seat) sitAt(p, p.seat, dt); p.umb = null; return true; }
      switch (p.job) {
        case 'digger': {
          if (holdAt(p, Lo.digger.x, Lo.digger.y, Lo.digger.a, dt) < 1.6) p.idle = 'work';
          const sw = Math.abs(Math.sin(t * 2.2));
          p.tool = 'pick'; p.hx = p.x + Math.cos(p.angle) * 1.4; p.hy = p.y + Math.sin(p.angle) * 1.4; p.hh = 5 + sw * 3;
          if (sw > 0.97 && rnd() < 0.5) { sound('cl_shovel', p.x, p.y, { vol: 0.2 }); for (let i = 0; i < 3; i++) emit(sc, p.hx + Math.cos(p.angle) * 2.4, p.hy + Math.sin(p.angle) * 2.4, 0.6, 4, rr(2, 4), rr(0.6, 1.1), 0.5, 1.8, 0.5); }
          return true;
        }
        case 'shovel': {
          if (holdAt(p, Lo.shovel.x, Lo.shovel.y, Lo.shovel.a, dt) < 1.6) p.idle = 'work';
          const k = (t * 0.5) % 1;
          p.tool = 'shovel'; p.hx = p.x + Math.cos(p.angle) * 1.2; p.hy = p.y + Math.sin(p.angle) * 1.2; p.hh = 4.8 + Math.sin(k * TAU) * 1.4;
          p.timer -= dt; if (p.timer <= 0) { p.timer = 2; sound('cl_shovel', p.x, p.y, { vol: 0.22 }); }
          return true;
        }
        case 'carry': { // sand heap -> pit with the pan on the head, back empty
          p.idle = null;
          const A = Lo.loopA, B = Lo.loopB, to = p.leg ? B : A;
          const d = walkTo(p, to.x, to.y, 22, dt, 1.2);
          p.hold = p.leg ? (p.look.kind === 'saree' ? 'pan' : 'bricks') : null;
          p.look = p.leg ? (p.lookAlt || (p.lookAlt = Object.assign({}, p.look0, { prop: 'pot' }))) : p.look0;
          if (d < 2) { p.timer -= dt; stand(p, null, dt); if (p.timer <= 0) { p.leg = 1 - p.leg; p.timer = rr(1.2, 2.6); if (p.leg) sound('cl_shovel', p.x, p.y, { vol: 0.18 }); } }
          return true;
        }
        case 'havaldar': {
          holdAt(p, Lo.hav.x, Lo.hav.y, Lo.hav.a + Math.sin(t * 0.8) * 0.5, dt);
          p.idle = 'work'; // waves the traffic round (view3d: the work-arms habit)
          return true;
        }
        case 'watch': { if (p.seat) sitAt(p, p.seat, dt); return true; }
        default: return false;
      }
    },
  };

  /* Lane narrowing for the roadwork strip. traffic.js drives its two-wheelers and the kerb lane right where the
   * crew works, and its vehicles stop for solid people on asphalt. Until traffic.js offers a narrowing hint
   * (api request), ambient vehicles approaching the site on its side of the road are eased out of the strip
   * through tr.pull, the lateral offset traffic.js already honours for pull-overs (positive = towards the left
   * kerb). Feature-detected: without v.tr / tr.pull semantics nothing is touched. Pulls are tracked and cleared
   * when the vehicle leaves the zone or the scene goes away. */
  const NQ = [], PULLED = [];
  const NARROW = { ahead: 70, behind: 46, margin: 3, every: 0.1, maxPull: 22 };
  function narrowLane(sc, dt) {
    const st = sc.st;
    st.nT = (st.nT || 0) - dt;
    if (st.nT > 0) return;
    st.nT = NARROW.every;
    const E = N.entities, F = sc.F, L = sc.L;
    if (!E || !E.query) return;
    const zw = L.zw, cx = F.cx, cy = F.cy, ax = F.ax, ay = F.ay, nx = F.nx, ny = F.ny;
    const road = sc.spot.roadW || 52;
    NQ.length = 0;
    E.query(cx, cy, NARROW.ahead + 10, null, NQ);
    for (let i = 0; i < NQ.length; i++) {
      const v = NQ[i];
      if (v.kind !== 'vehicle' || !v.alive || !v.tr || v === N.player.vehicle || v.driver === N.player) continue;
      const tr = v.tr;
      const dx = v.x - cx, dy = v.y - cy;
      const u = dx * ax + dy * ay, vv = dx * nx + dy * ny;
      // only vehicles on this carriageway (the half of the road whose kerb is the strip's kerb)
      if (vv > 4 || vv < -road / 2 - 2) { unpull(v); continue; }
      // which way +lat moves this vehicle relative to the strip normal (traffic.js: lat moves along (uy, -ux))
      const s = Math.sin(v.angle) * nx - Math.cos(v.angle) * ny;
      if (Math.abs(s) < 0.6) { unpull(v); continue; }
      const along = Math.cos(v.angle) * ax + Math.sin(v.angle) * ay; // + means travelling towards +u
      const rel = along >= 0 ? -u : u; // distance still to go before the strip's centre
      if (rel < -NARROW.behind || rel > NARROW.ahead) { unpull(v); continue; }
      if (tr.pullT != null || tr.stopT != null || (tr.pull && v._clPull == null)) continue; // a real pull-over / bus stop
      const half = (v.T && v.T.d ? v.T.d : 4) / 2;
      const cur = v._clPull || 0;
      const base = vv - s * (tr.lat || 0); // where the vehicle would ride with no lateral shift
      const lim = -zw - NARROW.margin - half;       // its outer edge must stay this far out from the strip
      let need = Math.min(0, lim - base);           // in strip-normal units (negative = towards the road centre)
      need = Math.max(need, -road / 2 + 1 + half * 0.5 - base); // never further than just over the centre line
      const pull = clamp(need / s, -NARROW.maxPull, NARROW.maxPull);
      if (Math.abs(pull) < 0.3) { unpull(v); continue; }
      tr.pull = pull; v._clPull = pull;
      if (cur === 0 && PULLED.indexOf(v) < 0) PULLED.push(v);
    }
    // vehicles that left the query radius
    for (let i = PULLED.length - 1; i >= 0; i--) { const v = PULLED[i]; if (!v.alive || Math.hypot(v.x - cx, v.y - cy) > NARROW.ahead + 10) unpull(v); }
  }
  function unpull(v) {
    if (v._clPull == null) return;
    if (v.tr && v.tr.pull === v._clPull) v.tr.pull = 0;
    v._clPull = null;
    const i = PULLED.indexOf(v); if (i >= 0) PULLED.splice(i, 1);
  }
  function unpullAll() { for (let i = PULLED.length - 1; i >= 0; i--) unpull(PULLED[i]); }

  const KINDS = { irani: KIND_IRANI, chai: KIND_CHAI, saloon: KIND_SALOON, busstop: KIND_BUS, trade: KIND_TRADE, roadwork: KIND_ROAD };

  /* ================================================================ spot catalogue (data driven from N.WORLD_DATA) */
  const COUNTS = { saloon: 8, chai: 8, trade: 26, roadwork: 5 };
  const TRADE_PREF = {
    oldcity: ['knife', 'flowers', 'keymaker', 'tailor', 'raddi', 'cobbler', 'cyclerepair'],
    market: ['cobbler', 'puncture', 'cyclerepair', 'vegcart', 'keymaker', 'tailor', 'flowers'],
    colonial: ['cobbler', 'keymaker', 'tailor', 'puncture', 'ironing'],
    colony: ['ironing', 'raddi', 'vegcart', 'puncture', 'cyclerepair', 'flowers', 'knife'],
    cantonment: ['ironing', 'raddi', 'vegcart', 'cobbler', 'cyclerepair'],
  };
  function buildSpots() {
    for (const sp of SPOTS) if (sp.scene) releaseScene(sp.scene, true);
    SPOTS.length = 0; BYID.clear();
    const D = N.WORLD_DATA;
    if (!D || !N.world || !N.world.built) return;
    LMRECTS = [];
    for (const l of D.landmarks || []) LMRECTS.push(l.x - l.w / 2, l.y - l.d / 2, l.x + l.w / 2, l.y + l.d / 2);
    // landmark-anchored: every Irani cafe, barber and bus stop
    for (const lm of D.landmarks || []) {
      if (lm.draw === 'irani_cafe') addSpot({ id: 'irani:' + lm.id, kind: 'irani', lm, F: shopFrame(lm), x: lm.x, y: lm.y, place: N.places && N.places[lm.id] ? lm.id : null });
      else if (lm.draw === 'barber') addSpot({ id: 'saloon:' + lm.id, kind: 'saloon', lm, F: shopFrame(lm), x: lm.x, y: lm.y, place: N.places && N.places[lm.id] ? lm.id : null });
      else if (lm.draw === 'bus_stop') addSpot({ id: 'busstop:' + lm.id, kind: 'busstop', lm, F: shopFrame(lm), x: lm.x, y: lm.y, place: lm.id });
    }
    // frontages on commercial streets near markets / stops / the player's colony (deterministic)
    const anchors = [];
    for (const p of D.places || []) if (p && !p.alias && (p.kind === 'market' || p.kind === 'bus_stop' || p.kind === 'kirana' || p.kind === 'barber' || p.kind === 'irani_cafe')) anchors.push(p.x, p.y);
    const home = (D.spawns && (D.spawns.player || D.spawns.home)) || null;
    if (home) anchors.push(home[0], home[1]);
    const nearAnchor = (x, y, r) => { for (let i = 0; i < anchors.length; i += 2) if (Math.abs(anchors[i] - x) < r && Math.abs(anchors[i + 1] - y) < r) return true; return false; };
    const R0 = rng('citylife:frontage');
    const roads = (D.roads || []).filter((r) => (r.kind === 'street' || r.kind === 'arterial') && r.pts && r.pts.length >= 2);
    const order = roads.map((r, i) => [R0.next(), i]).sort((a, b) => a[0] - b[0]).map((q) => roads[q[1]]);
    const taken = [];
    const farFromAll = (x, y, dMin) => {
      for (let i = 0; i < taken.length; i += 2) if (Math.hypot(taken[i] - x, taken[i + 1] - y) < dMin) return false;
      for (const s of SPOTS) if (Math.hypot(s.x - x, s.y - y) < 60) return false;
      const S = N.streetfood; if (S && S.nearest) { try { const n = S.nearest(x, y); if (n && Math.hypot(n.x - x, n.y - y) < 45) return false; } catch (e) { /* ignore */ } }
      return true;
    };
    const STY = { market: 1, oldcity: 1, colonial: 1, colony: 1, cantonment: 1 };
    const want = { saloon: COUNTS.saloon, chai: COUNTS.chai, trade: COUNTS.trade };
    const tradeN = {}; for (const k of TRADE_LIST) tradeN[k] = 0;
    let n = 0, tries = 0;
    const homeFirst = home ? order.slice().sort((a, b) => Math.hypot(a.pts[0][0] - home[0], a.pts[0][1] - home[1]) - Math.hypot(b.pts[0][0] - home[0], b.pts[0][1] - home[1])) : [];
    const passes = [homeFirst.slice(0, 40), order];
    for (const list of passes) {
      for (const road of list) {
        if (want.saloon + want.chai + want.trade <= 0 || tries > 2600) break;
        for (const f of [0.3, 0.7]) {
          for (const side of [1, -1]) {
            tries++;
            const q = polyAt(road.pts, f); if (!q || q.L < 60) continue;
            if (!nearAnchor(q.x, q.y, 700)) continue;
            const st = styleAt(q.x, q.y); if (!STY[st]) continue;
            // which kind: a few of each, round-robin by need
            const kind = want.trade > 0 && (n % 3 !== 2 || (want.saloon <= 0 && want.chai <= 0)) ? 'trade' : want.saloon >= want.chai && want.saloon > 0 ? 'saloon' : want.chai > 0 ? 'chai' : want.trade > 0 ? 'trade' : null;
            if (!kind) continue;
            const need = kind === 'saloon' ? { back: 9, hl: 10, wall: true } : kind === 'chai' ? { back: 9, hl: 10, wall: false } : { back: 6, hl: 9, wall: false };
            const fr = frontage(road, f, side, need);
            if (!fr || !farFromAll(fr.x, fr.y, kind === 'trade' ? 110 : 160)) continue;
            n++;
            taken.push(fr.x, fr.y);
            if (kind === 'trade') {
              const pref = TRADE_PREF[st] || TRADE_LIST;
              let sub = pref[0], best = 1e9;
              for (const k of pref) { const c = tradeN[k] * 10 + R0.next() * 4; if (c < best) { best = c; sub = k; } }
              tradeN[sub]++; want.trade--;
              addSpot({ id: 'trade:' + sub + ':' + tradeN[sub], kind: 'trade', sub, F: ptFrame(fr.x, fr.y, fr.ax, fr.ay, fr.nx, fr.ny, 6, 1.35), x: fr.x, y: fr.y });
            } else if (kind === 'saloon') {
              want.saloon--;
              addSpot({ id: 'saloon:cabin_' + (COUNTS.saloon - want.saloon), kind: 'saloon', F: ptFrame(fr.x, fr.y, fr.ax, fr.ay, fr.nx, fr.ny, 7.5, 1.25), x: fr.x, y: fr.y, cabin: true });
            } else {
              want.chai--;
              const id = 'chai:stall_' + (COUNTS.chai - want.chai);
              const F = ptFrame(fr.x, fr.y, fr.ax, fr.ay, fr.nx, fr.ny, 6);
              // the streetfood spot (a 'cart' frame: its customers on the n side = the road side)
              const sf = { id: 'cl_' + id.replace(':', '_'), kind: 'cl_chai', x: fr.x, y: fr.y, angle: Math.atan2(-fr.nx, fr.ny), lm: null, hl: 5.5, hw: 2.4 };
              addSpot({ id, kind: 'chai', F, x: fr.x, y: fr.y, sf });
            }
            break;
          }
        }
      }
    }
    // roadwork: a few arterial segments, the kerb strip only (lanes stay open), away from junctions and places
    const R1 = rng('citylife:roadwork');
    const arts = (D.roads || []).filter((r) => r.kind === 'arterial' && r.w >= 34 && r.pts && r.pts.length >= 2);
    const ord2 = arts.map((r, i) => [R1.next(), i]).sort((a, b) => a[0] - b[0]).map((q) => arts[q[1]]);
    let rw = 0;
    const rwTaken = [];
    for (const road of ord2) {
      if (rw >= COUNTS.roadwork) break;
      for (const f of [0.35, 0.6]) {
        if (rw >= COUNTS.roadwork) break;
        const q = polyAt(road.pts, f); if (!q || q.L < 200) continue;
        if (!nearAnchor(q.x, q.y, 900)) continue;
        if (rwTaken.some((p) => Math.hypot(p[0] - q.x, p[1] - q.y) < 700)) continue;
        let nearJ = false;
        try { const nn = N.world.roads.nearestNode(q.x, q.y, (nd) => nd.deg >= 3); if (nn && Math.hypot(nn.x - q.x, nn.y - q.y) < 75) nearJ = true; } catch (e) { /* ignore */ }
        if (nearJ) continue;
        if ((D.places || []).some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 70)) continue;
        const side = R1.next() < 0.5 ? 1 : -1;
        const tx = Math.cos(q.a), ty = Math.sin(q.a), px = -ty * side, py = tx * side;
        const zw = 7;
        const cxp = q.x + px * (road.w / 2 - 1), cyp = q.y + py * (road.w / 2 - 1);
        let ok = true;
        for (const u of [-28, -14, 0, 14, 26]) { const x = cxp + tx * u - px * 3, y = cyp + ty * u - py * 3; if (!N.world.isDrivable(x, y) || N.world.surfaceAt(x, y) !== SURF().ROAD) ok = false; }
        for (const u of [-20, 0, 22]) { const x = cxp + tx * u + px * 4, y = cyp + ty * u + py * 4; if (!N.world.isWalkable(x, y)) ok = false; }
        if (!ok || inLandmark(cxp, cyp, 30)) continue;
        rw++; rwTaken.push([q.x, q.y]);
        // frame: c at the kerb line, a along the road, n outwards (to the footpath); the work strip is v in [-zw, 0]
        addSpot({ id: 'roadwork:' + road.id + ':' + rw, kind: 'roadwork', F: ptFrame(cxp, cyp, tx, ty, px, py, 30), x: cxp, y: cyp, zw, road: road.id, roadW: road.w });
      }
    }
    ST.spots = SPOTS.length;
  }

  /* ================================================================ director */
  const ST = { spots: 0, ms: 0, msAvg: 0, ms2d: 0, ms3d: 0, draw2dAcc: 0, activations: 0, handedBack: 0, haircuts: 0, buses: 0, ownBuses: 0, boarded: 0, whistles: 0, sfSpots: 0, busGaveUp: 0, busGaveUpBy: '' };
  let dirT = 0, ready = false;
  function actRadius() {
    if (is3D()) { const q = N.view3d.quality || {}; return Math.min(TUNE.act3D, (q.actorDist || 620) * 0.8); }
    const v = N.render && N.render.view;
    if (!v || !isFinite(v.x0)) return 400;
    const hd = Math.hypot(v.x1 - v.x0, v.y1 - v.y0) / 2;
    return clamp(hd * TUNE.actScreens, TUNE.actMin, TUNE.actMax);
  }
  function activateScene(sp) {
    if (sp.scene) return sp.scene;
    const sc = new Scene(sp);
    sc.L = layoutOf(sp);
    sp.scene = sc;
    ACTIVE.push(sc);
    sc.rain = rainLevel();
    sc.level = levelOf(sc);
    try { if (sp.sf) ensureSfSpot(sp); sc.K.start(sc); } catch (e) { N.err('citylife.start:' + sp.id, e); }
    if (sp.kind === 'saloon' && sp.lm) wrapArt(sp);
    N.emit('citylife:scene', { id: sp.id, kind: sp.kind, on: true });
    ST.activations++;
    return sc;
  }
  function releaseScene(sc, quick) {
    if (!sc || !sc.on) return;
    sc.on = false;
    if (sc.spot.kind === 'roadwork') unpullAll();
    const i = ACTIVE.indexOf(sc); if (i >= 0) ACTIVE.splice(i, 1);
    if (sc.spot.scene === sc) sc.spot.scene = null;
    for (const p of sc.people.slice()) {
      const vis = !quick && (is3D() ? Math.hypot(p.x - N.player.x, p.y - N.player.y) < 150 : N.render.inView(p.x, p.y, 10));
      if (!vis || p.fixed || p.st === 'hang' || p.job === 'barber' || p.job === 'worker') dropPerson(p);
      else { p.sc = null; p.st = 'leave'; p.ex = null; p.idle = null; p.cape = false; p.foam = 0; }
    }
    sc.people.length = 0;
    const L = sc.L;
    if (L) for (const k of ['seats', 'slots', 'stand', 'C', 'vendor', 'shelter']) if (L[k]) for (const s of L[k]) s.by = null;
    if (L && L.chair) L.chair.by = null;
    for (let k = 0; k < P.n; k++) if (P.sc[k] === sc.uid) P.max[k] = 0;
    N.emit('citylife:scene', { id: sc.spot.id, kind: sc.spot.kind, on: false });
  }
  function spotAvailable(sp) {
    if (API.enabled === false) return false;
    if (sp.force) return true;
    if (sp.K.always) return true; // roadwork props stay day and night (the crew follows the clock)
    const sc = { spot: sp, K: sp.K, rain: rainLevel(), style: sp._style || (sp._style = styleAt(sp.x, sp.y)) };
    return levelOf(sc) > 0.04;
  }
  function direct() {
    const pl = N.player;
    if (!pl) return;
    const rOn = actRadius(), rOff = rOn * TUNE.offPad + 40;
    const cap = lowTier() ? TUNE.maxScenes.low : TUNE.maxScenes.desk;
    const cand = DIRC; cand.length = 0;
    for (const sp of SPOTS) {
      const d = Math.hypot(sp.x - pl.x, sp.y - pl.y);
      sp.d = d - (sp.force ? 1e6 : 0);
      if (sp.scene) { if (d > rOff && !sp.force) releaseScene(sp.scene); else if (!spotAvailable(sp) && !sp.scene.people.length) releaseScene(sp.scene); else cand.push(sp); }
      else if ((d < rOn || sp.force) && spotAvailable(sp)) cand.push(sp);
    }
    cand.sort((a, b) => a.d - b.d);
    for (let i = 0; i < cand.length; i++) {
      const sp = cand[i];
      if (i < cap) { if (!sp.scene) activateScene(sp); }
      else if (sp.scene) releaseScene(sp.scene);
    }
    ACTIVE.sort((a, b) => a.spot.d - b.spot.d);
  }
  const DIRC = [];
  function sceneUpdate(sc, dt) {
    const t0 = now();
    sc.t += dt;
    sc.lvlT -= dt;
    if (sc.lvlT <= 0) { sc.lvlT = 1; sc.rain += (rainLevel() - sc.rain) * 0.5; sc.level = levelOf(sc); sc.night = isNight(); }
    try { sc.K.tick(sc, dt); } catch (e) { N.err('citylife.tick:' + sc.spot.id, e); }
    sc.ms = now() - t0;
  }

  /* ================================================================ places_art hook: the barber's painted bench people give way */
  function wrapArt(sp) {
    if (sp._artW || !sp.lm) return;
    const A = sp.lm._pa;
    if (!A || !Array.isArray(A.people)) return;
    if (A._clWrapped) { sp._artW = true; return; }
    const orig = A.count;
    A.count = function (a) {
      const n0 = orig ? orig.call(this, a) : A.people.length;
      const s = sp.scene;
      if (!s || !s.on || API.enabled === false) return n0;
      return 0;
    };
    A._clWrapped = true; sp._artW = true;
  }

  /* ================================================================ 2D: per-kind props */
  const WOOD = '#7a5232', WOOD2 = '#9a6a3e', TIN = '#8a9098', CEMENT = '#a8a49c';
  function benchLine(x0, y0, x1, y1, a, h, col) {
    const nx = Math.cos(a) * 1.2, ny = Math.sin(a) * 1.2;
    const k = kk(h);
    CTX.fillStyle = col; CTX.beginPath();
    CTX.moveTo(SX(x0 - nx, k), SY(y0 - ny, k)); CTX.lineTo(SX(x1 - nx, k), SY(y1 - ny, k)); CTX.lineTo(SX(x1 + nx, k), SY(y1 + ny, k)); CTX.lineTo(SX(x0 + nx, k), SY(y0 + ny, k)); CTX.closePath(); CTX.fill();
    seg(x0, y0, 0, x0, y0, h, 0.5, shade(col, 0.6)); seg(x1, y1, 0, x1, y1, h, 0.5, shade(col, 0.6));
  }
  function radio2d(x, y, a) {
    const c = Math.cos(a), s = Math.sin(a);
    pole(x, y, 0, 3.2, 0.9, WOOD); dot(x, y, 3.3, 1.2, WOOD2);
    const k = kk(4.6); CTX.fillStyle = '#5a3a2a'; CTX.save(); CTX.translate(SX(x, k), SY(y, k)); CTX.rotate(a); CTX.fillRect(-1.3 * k, -0.8 * k, 2.6 * k, 1.6 * k); CTX.fillStyle = '#d8c8a0'; CTX.fillRect(-1.0 * k, -0.5 * k, 1.1 * k, 1.0 * k); CTX.restore();
    seg(x + s * 0.8, y - c * 0.8, 4.6, x + s * 0.8 + c * 1.6, y - c * 0.8 + s * 1.6, 8.2, 0.15, '#c8ccd2');
  }
  function drawLo(ctx, sc) {
    if (!sc.on) return;
    const t0 = now();
    frame2d(ctx);
    try {
      const L = sc.L, F = sc.F;
      switch (sc.spot.kind) {
        case 'irani': case 'chai': {
          if (sc.spot.kind === 'chai') chaiStallLo(sc);
          if (L.seats && L.seats.length) {
            const s0 = L.seats[0], s1 = L.seats[L.seats.length - 1], dx = s1.x - s0.x, dy = s1.y - s0.y, d = Math.hypot(dx, dy) || 1;
            benchLine(s0.x - (dx / d) * 1.8, s0.y - (dy / d) * 1.8, s1.x + (dx / d) * 1.8, s1.y + (dy / d) * 1.8, s0.a, 2.2, sc.spot.kind === 'irani' ? '#6a4a2a' : CEMENT);
          }
          if (L.radio) radio2d(L.radio.x, L.radio.y, L.radio.a || 0);
          break;
        }
        case 'saloon': {
          if (!sc.spot.lm) saloonCabinLo(sc);
          const ch = L.chair, a = ch.a, c = Math.cos(a), s = Math.sin(a);
          // the barber's chair: footrest, iron base, red seat and backrest
          dot(ch.x, ch.y, 0.4, 2, '#3a3a40'); dot(ch.x, ch.y, 2.6, 2.2, '#8a1a22');
          seg(ch.x - c * 1.8 - s * 1.8, ch.y - s * 1.8 + c * 1.8, 2.8, ch.x - c * 1.8 + s * 1.8, ch.y - s * 1.8 - c * 1.8, 2.8, 0.5, '#c8ccd2');
          seg(ch.x - c * 2.2, ch.y - s * 2.2, 2.8, ch.x - c * 2.4, ch.y - s * 2.4, 7.2, 2.2, '#7a1a20');
          if (L.seats && L.seats.length && !sc.spot.lm) { const s0 = L.seats[0], s1 = L.seats[L.seats.length - 1], dx = s1.x - s0.x, dy = s1.y - s0.y, d = Math.hypot(dx, dy) || 1; benchLine(s0.x - (dx / d) * 1.8, s0.y - (dy / d) * 1.8, s1.x + (dx / d) * 1.8, s1.y + (dy / d) * 1.8, s0.a, 2.2, WOOD); }
          break;
        }
        case 'trade': tradeLo(sc, false); break;
        case 'roadwork': roadLo(sc, false); break;
        default: break;
      }
    } catch (e) { N.err('citylife.drawLo', e); }
    resetCtx(ctx);
    ST.draw2dAcc += now() - t0;
    void F0;
  }
  const F0 = 0;
  function drawHi(ctx, sc) {
    if (!sc.on) return;
    const t0 = now();
    frame2d(ctx);
    try {
      switch (sc.spot.kind) {
        case 'saloon': saloonHi(sc); break;
        case 'chai': chaiStallHi(sc); break;
        case 'trade': tradeLo(sc, true); tradeHi(sc); break;
        case 'roadwork': roadLo(sc, true); roadHi(sc); break;
        default: break;
      }
      drawParticles(sc);
    } catch (e) { N.err('citylife.drawHi', e); }
    resetCtx(ctx);
    ST.draw2dAcc += now() - t0;
  }
  function chaiStallLo(sc) {
    const F = sc.F;
    // the tin back wall with a calendar picture, the plank counter with glass jars and the kettle stove
    fbox(F, -7.5, 7.5, -7.4, -6.6, 0, 11, TIN);
    fquad(F, -3, -6.65, 0.5, -6.6, 8, '#e8d8b0');
    fbox(F, -5.5, 5.5, -2.4, 2.4, 0, 6.4, WOOD, WOOD2);
    const jc = ['#e8c070', '#d89a4a', '#f0d8a0', '#c87a3a'];
    for (let i = 0; i < 4; i++) { const u = 0.8 + i * 1.3, x = fx(F, u, 0.6), y = fy(F, u, 0.6); dot(x, y, 6.5, 0.6, '#cfe6ee'); dot(x, y, 8.0, 0.55, jc[i]); dot(x, y, 8.1, 0.32, '#c8302a'); }
    // a stack of glasses and the steel tray
    for (let i = 0; i < 5; i++) dot(fx(F, -1 + (i % 3) * 0.7, 1.4 + (i > 2 ? 0.7 : 0)), fy(F, -1 + (i % 3) * 0.7, 1.4 + (i > 2 ? 0.7 : 0)), 6.6, 0.4, '#e8f0f2');
  }
  function chaiStallHi(sc) {
    const F = sc.F;
    // tarpaulin awning strip over the counter + the TEA board
    fquad(F, -7.8, -7, 7.8, -2.2, 12.2, 'rgba(42,92,154,0.92)');
    const D = N.draw;
    if (D && D.pixelText) { D.pixelText(fx(F, 0, -6.9), fy(F, 0, -6.9), 12.4, 'CHAI', '#fff4c0', { scale: 1 }); frame2d(CTX); }
    if (sc.night) { const x = fx(F, 0, -2.6), y = fy(F, 0, -2.6); dot(x, y, 11.4, 0.7, '#fff2c0'); }
  }
  function saloonCabinLo(sc) {
    const F = sc.F;
    // floor tiles, side panels, the back wall (mirror and posters are on the high pass)
    fquad(F, -7, -6.4, 7, 0.4, 0.05, '#c8c0b0');
    for (let u = -6; u <= 6; u += 2) fquad(F, u - 0.03, -6.4, u + 0.03, 0.4, 0.06, 'rgba(0,0,0,0.12)');
    fbox(F, -7.4, -6.9, -6.6, 0.2, 0, 7.5, '#3a7a8a');
    fbox(F, 6.9, 7.4, -6.6, 0.2, 0, 7.5, '#3a7a8a');
    fbox(F, -7.4, 7.4, -7.0, -6.4, 0, 11.5, '#4a8a9a');
    // the shelf under the mirror: bottles, comb jar
    fbox(F, -3.2, 3.2, -6.4, -5.6, 0, 4.2, '#f2efe6');
    for (let i = 0; i < 5; i++) dot(fx(F, -2.4 + i * 1.1, -6), fy(F, -2.4 + i * 1.1, -6), 5, 0.42, ['#2a8a5a', '#d8a020', '#5aa0d8', '#c03030', '#f2f0ea'][i]);
  }
  /** a painted film-star poster (fictional: a face, a bold title block - no readable title) */
  function poster(F, u0, u1, v, h0, h1, seed) {
    const cols = [['#d82a3a', '#f2c230'], ['#2a5cb8', '#f08a1a'], ['#3a8a3a', '#f4e8c0'], ['#7a2a8a', '#f2c230']][seed % 4];
    fwall(F, u0, u1, v, h0, h1, cols[0]);
    const um = (u0 + u1) / 2, k = (h1 - h0);
    // the hero's face + hair
    const hx = fx(F, um, v + 0.02), hy = fy(F, um, v + 0.02);
    dot(hx, hy, h0 + k * 0.62, Math.min(0.9, (u1 - u0) * 0.22), '#d8a070');
    dot(hx, hy, h0 + k * 0.72, Math.min(0.8, (u1 - u0) * 0.2), '#1a1412');
    fwall(F, u0 + 0.2, u1 - 0.2, v + 0.03, h0 + k * 0.08, h0 + k * 0.26, cols[1]);
  }
  function saloonHi(sc) {
    const F = sc.F, L = sc.L, m = L.mirror;
    if (m && m.stand) { // the freestanding board: mirror in the middle, posters and the chart beside it, on legs
      const u0 = Math.min(m.u0, L.chart ? L.chart[0] : m.u0) - 0.4, u1 = Math.max(m.u1, L.posters && L.posters.length ? L.posters[L.posters.length - 1][1] : m.u1) + 0.4;
      for (const u of [u0 + 0.3, u1 - 0.3]) pole(fx(F, u, m.v - 0.1), fy(F, u, m.v - 0.1), 0, 4.4, 0.5, '#4a3020');
      fwall(F, u0, u1, m.v - 0.06, 3.8, 11.2, '#5a3a22');
      fquad(F, m.u0, m.v - 0.05, m.u1, m.v + 0.9, 4.2, '#f2efe6'); // the shelf
      for (let i = 0; i < 5; i++) dot(fx(F, m.u0 + 0.5 + i * ((m.u1 - m.u0 - 1) / 4), m.v + 0.45), fy(F, m.u0 + 0.5 + i * ((m.u1 - m.u0 - 1) / 4), m.v + 0.45), 5, 0.4, ['#2a8a5a', '#d8a020', '#5aa0d8', '#c03030', '#f2f0ea'][i]);
    }
    if (m) {
      fwall(F, m.u0 - 0.3, m.u1 + 0.3, m.v, m.h0 - 0.3, m.h1 + 0.3, '#6a4a2a');
      fwall(F, m.u0, m.u1, m.v + 0.02, m.h0, m.h1, '#b8d0dc');
      fwall(F, m.u0 + 0.4, m.u0 + 1.3, m.v + 0.04, m.h0 + 1, m.h1 - 1, 'rgba(255,255,255,0.35)');
      // the client's reflection: a dark blob of hair in the glass
      const cl = sc.st.client;
      if (cl && cl.alive && cl.st === 'chair') { const um = cl.seat ? cl.seat.u : 0; fwall(F, um - 0.9, um + 0.9, m.v + 0.05, m.h0 + 2.2, m.h0 + 4.2, '#c89060'); fwall(F, um - 1, um + 1, m.v + 0.06, m.h0 + 3.6, m.h0 + 4.6, '#1a1412'); }
    }
    if (L.posters) L.posters.forEach((q, i) => poster(F, q[0], q[1], (m ? m.v : 0.2) + 0.01, 5.6, 10.6, i + (sc.spot.seed * 7 | 0)));
    if (L.chart) { // the haircut chart: a grid of little heads
      const [u0, u1] = L.chart, v = (m ? m.v : 0.2) + 0.01;
      fwall(F, u0, u1, v, 5.2, 10.6, '#f4f0e0');
      for (let r = 0; r < 3; r++) for (let q = 0; q < 2; q++) { const u = lerp(u0, u1, (q + 0.5) / 2), h = 6.2 + r * 1.6, x = fx(F, u, v + 0.02), y = fy(F, u, v + 0.02); dot(x, y, h, 0.45, '#c89060'); dot(x, y, h + 0.35, 0.42, '#1a1412'); }
    }
    if (!sc.spot.lm) { // the cabin's tin awning over the back half + its painted board
      fquad(F, -7.8, -7.2, 7.8, -3.8, 12, TIN);
      fquad(F, -7.8, -3.9, 7.8, -3.6, 11.6, shade(TIN, 0.75));
      const D = N.draw;
      if (D && D.pixelText) { D.pixelText(fx(F, 0, -7.0), fy(F, 0, -7.0), 12.2, 'SALOON', '#1a2a5a', { scale: 1 }); frame2d(CTX); }
      // the barber pole by the door
      const x = fx(F, 7.8, 0.6), y = fy(F, 7.8, 0.6);
      pole(x, y, 0, 8, 1.2, '#f4f2ee');
      const ph = (simT() * 2) % 1; for (let i = 0; i < 3; i++) { const h = 1 + ((i + ph) / 3) * 6.4; seg(x - 0.5, y, h, x + 0.5, y, h + 1, 0.4, i % 2 ? '#2a5cb8' : '#d8302a'); }
    }
    if (sc.night) { const x = fx(F, L.chair.u, L.chair.v - 1), y = fy(F, L.chair.u, L.chair.v - 1); seg(x - F.ax * 2, y - F.ay * 2, 11, x + F.ax * 2, y + F.ay * 2, 11, 0.6, '#eaf6ff'); }
  }
  // ---- street trades
  function tree2d(x, y, r) {
    pole(x, y, 0, 9, 1.6, '#5a4030');
    const t = simT();
    dot(x, y, 13, r, '#3f6a2a'); dot(x - r * 0.3, y - r * 0.25, 13.6, r * 0.7, '#4f7f32'); dot(x + r * 0.35, y + r * 0.2, 13.3, r * 0.55, '#5a8a3a');
    dot(x + Math.sin(t * 0.7) * 0.4 - r * 0.2, y - r * 0.45, 13.8, r * 0.35, '#6a9a42');
  }
  /** street trades: flat things on the ground under the people (lo pass), the stall / tools over them (hi pass) */
  function tradeLo(sc, hi) {
    const F = sc.F, L = sc.L, sub = sc.sub, t = simT();
    if (!hi) {
      if (sub === 'cobbler') {
        fquad(F, -3.2, -3.2, 2.6, 0.4, 0.04, '#6a5a3a'); // gunny cloth
        for (let i = 0; i < 4; i++) { const x = fx(F, -2.4 + i * 1.3, -2.4), y = fy(F, -2.4 + i * 1.3, -2.4); ell(x, y, 0.3, 1.4, 0.6, aang(F), ['#5a3a22', '#2a2a2a', '#8a4a2a', '#3a2a1a'][i]); }
      } else if (sub === 'flowers') {
        fquad(F, -3, -3, 3, 0.6, 0.04, '#7a6a4a');
        for (let i = 0; i < 3; i++) seg(fx(F, -2.6 + i * 1.6, -1.8), fy(F, -2.6 + i * 1.6, -1.8), 0.2, fx(F, -1.6 + i * 1.6, -2.8), fy(F, -1.6 + i * 1.6, -2.8), 0.2, 0.8, i % 2 ? '#f08a1a' : '#f8f6ee');
      }
      return;
    }
    switch (sub) {
      case 'cobbler': {
        fbox(F, 1.2, 2.6, -1.6, -0.4, 0, 1.6, WOOD); // the last / box
        dot(fx(F, 2, 1.4), fy(F, 2, 1.4), 0.4, 0.7, '#2a2a2a');
        break;
      }
      case 'puncture': {
        fbox(F, -6, -2, -4.2, -1.2, 0, 3.4, WOOD); // tools box
        for (let i = 0; i < 3; i++) ring(fx(F, -5.6 + i * 1.4, -4.6), fy(F, -5.6 + i * 1.4, -4.6), 4.5, 1.6, '#1a1a1e', 0.55); // tyres hanging
        const tx = fx(F, 3.2, 1.6), ty = fy(F, 3.2, 1.6);
        dot(tx, ty, 0.2, 2.2, '#3a3a40'); dot(tx, ty, 2.8, 2.2, '#4a5a68'); dot(tx, ty, 3.0, 1.8, '#6a8aa0'); // the tub of water
        ring(tx, ty, 3.05, 1.2, '#1e1e22', 0.5); // the tube in it
        // the pump + an upturned cycle wheel
        pole(fx(F, -1, 2.4), fy(F, -1, 2.4), 0, 4, 0.5, '#2a5a9a');
        break;
      }
      case 'ironing': {
        fbox(F, -3.4, 3.4, 0.4, 2.6, 0, 5.2, '#d8d0c0', '#e8e4dc'); // the table with a blanket + sheet
        for (let i = 0; i < 4; i++) fbox(F, -6.2, -4, -1 + i * 0.05, 1 + i * 0.05, 5.2 + i * 0.5, 5.6 + i * 0.5, ['#d8e0ea', '#f0d8c8', '#e8e8d0', '#c8d8e8'][i]);
        // the folded pile (done) and the coal brazier with embers
        for (let i = 0; i < 3; i++) fbox(F, 4.2, 6, 0.6, 2.2, 5.2 + i * 0.4, 5.55 + i * 0.4, ['#f2f0ea', '#a8c0e0', '#e8d0b0'][i]);
        const bx = fx(F, -1.8, -2.6), by = fy(F, -1.8, -2.6);
        dot(bx, by, 1.6, 1.3, '#3a3a40'); dot(bx, by, 1.7, 1.0, sc.night ? '#ff7a20' : '#c84a1a');
        break;
      }
      case 'tailor': {
        fbox(F, -2.6, 2.6, -0.6, 1.8, 0, 4.6, WOOD, '#8a6040'); // the machine table
        const mx = fx(F, 0.4, 0.6), my = fy(F, 0.4, 0.6);
        ell(mx, my, 5.6, 1.6, 0.7, aang(F), '#1a1a1e'); dot(fx(F, 1.6, 0.6), fy(F, 1.6, 0.6), 5.8, 0.6, '#c8a040');
        fquad(F, -1.8, 0.8, 0.2, 1.7, 4.7, '#c84a6a'); // the cloth under the needle
        // the wheel turning
        const a = t * 10, wx = fx(F, 2.4, 0.6), wy = fy(F, 2.4, 0.6);
        ring(wx, wy, 5.4, 0.9, '#3a3a40', 0.3); seg(wx, wy, 5.4, wx + Math.cos(a) * 0.9, wy + Math.sin(a) * 0.9, 5.4, 0.2, '#c8ccd2');
        // shirts on a line behind
        for (let i = 0; i < 3; i++) fwall(F, -4 + i * 2.6, -2 + i * 2.6, -3, 5, 9.6, ['#e8f0f8', '#f0c8c8', '#c8e0c8'][i]);
        break;
      }
      case 'knife': {
        // the sharpener's cycle on its stand: frame, the grinding wheel by the back
        const a = aang(F);
        cycle2d(fx(F, 0.6, 1.6), fy(F, 0.6, 1.6), a, '#1a1a1e');
        const wx = fx(F, 2.6, 1.4), wy = fy(F, 2.6, 1.4), sp = t * (sc.st.grind ? 18 : 3);
        dot(wx, wy, 5, 1.4, '#7a7e84'); seg(wx, wy, 5.1, wx + Math.cos(sp) * 1.3, wy + Math.sin(sp) * 1.3, 5.1, 0.25, '#4a4e54');
        break;
      }
      case 'raddi': case 'vegcart': {
        const w = sc.st.worker;
        if (!w || !w.alive) break;
        const c = Math.cos(w.angle), s = Math.sin(w.angle);
        const cx = w.x + c * 5.4, cy = w.y + s * 5.4;
        // the handcart: wooden bed on two cycle wheels, heaped load
        const k = kk(4.2);
        CTX.save(); CTX.translate(SX(cx, k), SY(cy, k)); CTX.rotate(w.angle);
        CTX.fillStyle = '#6a4a2a'; CTX.fillRect(-3.6 * k, -2.6 * k, 7.2 * k, 5.2 * k);
        CTX.restore();
        ring(cx - s * 2.8, cy + c * 2.8, 1.6, 1.6, '#1a1a1e', 0.4); ring(cx + s * 2.8, cy - c * 2.8, 1.6, 1.6, '#1a1a1e', 0.4);
        if (sub === 'vegcart') {
          const cols = ['#d8302a', '#c86a3a', '#3a8a2a', '#8a3a7a', '#e8a020', '#5aa02a'];
          for (let i = 0; i < 12; i++) { const u = (i % 4) - 1.5, v = ((i / 4) | 0) - 1; dot(cx + c * u * 1.6 - s * v * 1.4, cy + s * u * 1.6 + c * v * 1.4, 5.2, 0.85, cols[i % cols.length]); }
        } else {
          for (let i = 0; i < 3; i++) { const u = i - 1; ell(cx + c * u * 2, cy + s * u * 2, 5.4 + i * 0.2, 1.6, 1.3, w.angle, '#d8cfb8'); }
          dot(cx - s * 1.6, cy + c * 1.6, 5.6, 0.8, '#3a7a5a'); // bottles
        }
        break;
      }
      case 'flowers': {
        const bx = fx(F, 1.8, 0.6), by = fy(F, 1.8, 0.6);
        dot(bx, by, 1.4, 1.8, '#8a6a3a'); for (let i = 0; i < 9; i++) dot(bx + Math.cos(i * 0.7) * 1.1, by + Math.sin(i * 0.7) * 1.1, 1.6, 0.4, i % 2 ? '#f8f6ee' : '#f2f0e0');
        const ox = fx(F, -1.8, 0.4), oy = fy(F, -1.8, 0.4);
        dot(ox, oy, 1.4, 1.6, '#8a6a3a'); for (let i = 0; i < 7; i++) dot(ox + Math.cos(i * 0.9) * 0.9, oy + Math.sin(i * 0.9) * 0.9, 1.6, 0.45, i % 2 ? '#f08a1a' : '#e8a020');
        break;
      }
      case 'cyclerepair': {
        fbox(F, -6, -3, -4, -2, 0, 3, WOOD);
        for (let i = 0; i < 2; i++) ring(fx(F, -5 + i * 1.6, -4.4), fy(F, -5 + i * 1.6, -4.4), 4.2, 1.6, '#1a1a1e', 0.5);
        // a cycle upside down on its saddle, the back wheel spinning
        const a = aang(F), wx = fx(F, 2.8, 1.8), wy = fy(F, 2.8, 1.8), sp = t * 9;
        seg(fx(F, -1.4, 1.8), fy(F, -1.4, 1.8), 3.6, wx, wy, 3.6, 0.5, '#2a5a9a');
        ring(fx(F, -1.4, 1.8), fy(F, -1.4, 1.8), 3.6, 1.6, '#1a1a1e', 0.4);
        ring(wx, wy, 3.6, 1.6, '#1a1a1e', 0.4); seg(wx, wy, 3.62, wx + Math.cos(sp) * 1.5, wy + Math.sin(sp) * 1.5, 3.62, 0.15, '#c8ccd2');
        void a;
        break;
      }
      case 'keymaker': {
        fbox(F, -2.2, 2.2, -0.2, 1.8, 0, 3.4, '#4a6a8a'); // the box stall
        // the key board: rows of blanks
        fwall(F, -2.4, 2.4, -0.4, 3.4, 8.6, '#7a5232');
        for (let r = 0; r < 4; r++) for (let q = 0; q < 6; q++) dot(fx(F, -2 + q * 0.8, -0.35), fy(F, -2 + q * 0.8, -0.35), 4 + r * 1.2, 0.22, '#d8b84a');
        dot(fx(F, 1.6, 0.8), fy(F, 1.6, 0.8), 3.5, 0.6, '#5a5a62'); // the vice
        break;
      }
      default: break;
    }
    void L;
  }
  function tradeHi(sc) {
    const L = sc.L;
    if (L.tree && L.tree.own) tree2d(L.tree.x, L.tree.y, L.tree.r || 10);
    if (sc.sub === 'puncture' || sc.sub === 'cyclerepair') { // a painted tin board
      const F = sc.F, D = N.draw;
      fwall(F, -6.4, -1.6, -4.6, 6.6, 9, '#f2c230');
      if (D && D.pixelText) { D.pixelText(fx(F, -4, -4.5), fy(F, -4, -4.5), 9.2, sc.sub === 'puncture' ? 'PUNCTURE' : 'CYCLE', '#c03030', { scale: 1 }); frame2d(CTX); }
    }
  }
  // ---- roadwork
  function roadLo(sc, hi) {
    const F = sc.F, L = sc.L, zw = L.zw, pit = L.pit, t = simT();
    if (hi) { roadRaised(sc, F, L, zw, t); return; }
    // the dug strip: dark earth, rubble, the soil heaped beside it
    fquad(F, pit.u0 - 0.8, pit.v0 - 0.6, pit.u1 + 0.8, pit.v1 + 0.6, 0.04, '#a87a4a');
    fquad(F, pit.u0, pit.v0, pit.u1, pit.v1, 0.05, '#7a5432');
    fquad(F, pit.u0 + 1.2, pit.v0 + 1, pit.u1 - 1.2, pit.v1 - 0.8, 0.06, '#4a3020');
    for (let i = 0; i < 9; i++) { const u = lerp(pit.u0 + 1, pit.u1 - 1, ((i * 0.37) % 1)), v = lerp(pit.v0 + 0.5, pit.v1 - 0.3, ((i * 0.61) % 1)); dot(fx(F, u, v), fy(F, u, v), 0.3, 0.5, '#7a6a5a'); }
    ell(fx(F, pit.u0 - 3.4, -2.6), fy(F, pit.u0 - 3.4, -2.6), 1.6, 4.4, 3.0, aang(F), '#8a6040'); ell(fx(F, pit.u0 - 3.8, -2.9), fy(F, pit.u0 - 3.8, -2.9), 2.6, 2.6, 1.8, aang(F), '#9a7048');
    // sand heap + bricks
    dot(L.sand.x, L.sand.y, 0.8, 5.4, '#d8c08a'); dot(L.sand.x - 0.8, L.sand.y - 0.8, 2.2, 3.8, '#e2cc98'); dot(L.sand.x - 1.4, L.sand.y - 1.2, 3.2, 2.0, '#eed8a6');
    for (let r = 0; r < 3; r++) fbox(F, -22 + r * 0.3, -18 + r * 0.3, 2.2 + r * 0.2, 4.2 - r * 0.2, r * 0.9, r * 0.9 + 0.9, '#a8442a');
    void zw;
  }
  function roadRaised(sc, F, L, zw, t) {
    // the tar drum on bricks over its fire
    const d = L.drum;
    dot(d.x, d.y, 0.3, 3.0, '#6a3a2a');
    const fl = 0.7 + Math.sin(t * 13) * 0.2;
    dot(d.x, d.y, 0.9, 2.4 * fl, '#ff8a20'); dot(d.x, d.y, 1.1, 1.4 * fl, '#ffe080');
    N.draw && N.draw.cyl ? N.draw.cyl(d.x, d.y, 2.4, 1.6, 7.6, { wall: '#26262a', roof: '#101012' }) : dot(d.x, d.y, 7.6, 2.4, '#26262a');
    dot(d.x, d.y, 7.7, 1.8, '#0a0a0c');
    frame2d(CTX);
    // the cement mixer: frame, rotating drum
    const m = L.mixer, a = aang(F), ca = Math.cos(a), sa = Math.sin(a);
    seg(m.x - ca * 4.5, m.y - sa * 4.5, 2.4, m.x + ca * 4.5, m.y + sa * 4.5, 2.4, 1.4, '#d8a020');
    dot(m.x - sa * 3, m.y + ca * 3, 1.4, 1.5, '#1a1a1e'); dot(m.x + sa * 3, m.y - ca * 3, 1.4, 1.5, '#1a1a1e');
    const ma = (sc.st.mixA || 0);
    ell(m.x, m.y, 6.0, 4.0, 3.2, a + 0.4, '#e8a020'); ell(m.x + Math.cos(ma) * 0.9, m.y + Math.sin(ma) * 0.9, 7.2, 2.4, 1.7, a + ma, '#c88010'); dot(m.x + ca * 2.6, m.y + sa * 2.6, 7.8, 1.4, '#3a3a3e'); dot(m.x + ca * 2.6, m.y + sa * 2.6, 7.9, 0.9, '#9a9a96');
    // barricades along the lane side
    for (let u = -24; u <= 24.01; u += 6) { const x = fx(F, u, -zw), y = fy(F, u, -zw); pole(x, y, 0, 5, 1.0, (u / 6) % 2 ? '#f4f2ee' : '#d8302a'); dot(x, y, 0.2, 1.1, '#2a2a2a'); }
  }
  function roadHi(sc) {
    const F = sc.F, L = sc.L, zw = L.zw;
    // the striped tape / bars between the barricade poles
    for (let u = -24; u < 24; u += 6) { for (let i = 0; i < 3; i++) { const u0 = u + i * 2, u1 = u0 + 2; seg(fx(F, u0, -zw), fy(F, u0, -zw), 3.8, fx(F, u1, -zw), fy(F, u1, -zw), 3.8, 0.5, i % 2 ? '#f4f2ee' : '#d8302a'); } }
    // the DIVERSION board on its stand, facing the oncoming lane
    const b = L.board, D = N.draw;
    const x0 = fx(F, b.u, b.v), y0 = fy(F, b.u, b.v);
    pole(fx(F, b.u - 2.6, b.v), fy(F, b.u - 2.6, b.v), 0, 7.4, 0.5, '#4a4a52'); pole(fx(F, b.u + 2.6, b.v), fy(F, b.u + 2.6, b.v), 0, 7.4, 0.5, '#4a4a52');
    fwallV(F, b.u - 0.05, b.v - 0.01, b.v + 0.01, 0, 0, '#000');
    fwall(F, b.u - 3.4, b.u + 3.4, b.v, 6.2, 10.6, '#f2c230');
    fwall(F, b.u - 3.0, b.u + 3.0, b.v + 0.02, 6.6, 10.2, '#1a1a1e');
    if (D && D.pixelText) { D.pixelText(x0, y0, 10.8, 'DIVERSION', '#f2c230', { scale: 1 }); frame2d(CTX); }
    // the arrow on the board
    const ax = fx(F, b.u + 2, b.v + 0.05), ay = fy(F, b.u + 2, b.v + 0.05);
    seg(ax, ay, 7.6, fx(F, b.u - 2, b.v + 0.05), fy(F, b.u - 2, b.v + 0.05), 7.6, 0.6, '#f2c230');
    // night: red lanterns on the barricade
    if (sc.night) for (const u of [-24, 0, 24]) { const x = fx(F, u, -zw), y = fy(F, u, -zw); dot(x, y, 5, 0.8, '#ff3020'); }
  }
  // ---- particles (2D)
  const PCOL = ['#f4f2ee', '#4a4642', '#ffb040', '#e8f4ff', '#f0ead8'];
  function drawParticles(sc) {
    const uid = sc.uid, ctx = CTX;
    for (let i = 0; i < P.n; i++) {
      if (P.sc[i] !== uid) continue;
      const k = P.kind[i], ps = pState(i), kp = kk(P.h[i]), X = SX(P.x[i], kp), Y = SY(P.y[i], kp);
      if (k === 2) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ps.a; ctx.fillStyle = PCOL[2]; ctx.fillRect(X - 0.6, Y - 0.6, 1.2, 1.2); ctx.globalCompositeOperation = 'source-over'; continue; }
      if (k === 3) { ctx.globalAlpha = ps.a; ctx.strokeStyle = PCOL[3]; ctx.lineWidth = Math.max(0.4, 0.15 * kp); ctx.beginPath(); ctx.arc(X, Y, Math.max(0.5, ps.s * kp), 0, TAU); ctx.stroke(); continue; }
      ctx.globalAlpha = ps.a * (k === 1 ? 0.75 : 0.6); ctx.fillStyle = PCOL[k]; ctx.beginPath(); ctx.arc(X, Y, Math.max(0.6, ps.s * kp), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function pushLights(sc) {
    const Rr = N.render;
    if (!Rr || !Rr.lights || !sc.night) return;
    const F = sc.F, L = sc.L;
    switch (sc.spot.kind) {
      case 'saloon': Rr.lights.push({ x: fx(F, L.chair.u, L.chair.v), y: fy(F, L.chair.u, L.chair.v), r: 26, color: '#e8f4ff', intensity: 0.7 }); break;
      case 'chai': Rr.lights.push({ x: fx(F, 0, -2), y: fy(F, 0, -2), r: 24, color: '#ffd890', intensity: 0.75 }); break;
      case 'roadwork': Rr.lights.push({ x: L.drum.x, y: L.drum.y, r: 18, color: '#ff8a30', intensity: 0.8 }); Rr.lights.push({ x: fx(F, 0, -L.zw), y: fy(F, 0, -L.zw), r: 14, color: '#ff3020', intensity: 0.5 }); break;
      case 'trade': if (sc.sub === 'ironing') Rr.lights.push({ x: fx(F, -1.8, -2.6), y: fy(F, -1.8, -2.6), r: 10, color: '#ff7a20', intensity: 0.5 }); break;
      default: break;
    }
  }

  /* ================================================================ 3D layer (view3d.js loads after this file) */
  const G3 = { THREE: null, H: null, ready: false, grp: null, pts: null, spk: null, scenes: new Map(), list: [], built: 0, ms: 0, pools: null };
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
    const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3), col = new THREE.BufferAttribute(new Float32Array(n * 3), 3), siz = new THREE.BufferAttribute(new Float32Array(n * 2), 2);
    for (const a of [pos, col, siz]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pos); geo.setAttribute('aCol', col); geo.setAttribute('aSA', siz);
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const mat = new THREE.ShaderMaterial({ vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: { value: 600 }, uHard: { value: additive ? 0.6 : 0 } } });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.renderOrder = 5; pts.userData.noShadow = true;
    return pts;
  }
  const PC3 = [[0.95, 0.95, 0.93], [0.36, 0.34, 0.32], [1, 0.7, 0.25], [0.9, 0.95, 1], [0.94, 0.91, 0.84]];
  function fillPoints(H) {
    const st = G3.pts, sk = G3.spk;
    if (!st) return;
    const sp = st.geometry.attributes.position.array, sc = st.geometry.attributes.aCol.array, ss = st.geometry.attributes.aSA.array;
    const kp = sk.geometry.attributes.position.array, kc = sk.geometry.attributes.aCol.array, ks = sk.geometry.attributes.aSA.array;
    const night = clamp(H.night || 0, 0, 1), amb = 0.3 + 0.65 * (1 - night);
    const VS = H.VS || 1.5;
    let n = 0, m = 0;
    for (let i = 0; i < P.n; i++) {
      pState(i);
      const k = P.kind[i], x = P.x[i], y = P.y[i], h = P.h[i] * VS;
      if (k === 2) { if (m >= 64) continue; kp[m * 3] = x; kp[m * 3 + 1] = h; kp[m * 3 + 2] = y; kc[m * 3] = 1; kc[m * 3 + 1] = PS.t < 0.5 ? 0.75 : 0.45; kc[m * 3 + 2] = 0.2; ks[m * 2] = 0.9; ks[m * 2 + 1] = PS.a; m++; continue; }
      if (n >= PMAX) break;
      const c = PC3[k];
      sp[n * 3] = x; sp[n * 3 + 1] = h; sp[n * 3 + 2] = y;
      sc[n * 3] = c[0] * amb; sc[n * 3 + 1] = c[1] * amb; sc[n * 3 + 2] = c[2] * amb;
      ss[n * 2] = PS.s * (k === 3 ? 1.6 : 2.5); ss[n * 2 + 1] = clamp(PS.a * (k === 1 ? 0.9 : k === 3 ? 0.7 : 0.85), 0, 1);
      n++;
    }
    st.geometry.setDrawRange(0, n); sk.geometry.setDrawRange(0, m);
    for (const p of [st, sk]) { const a = p.geometry.attributes; a.position.needsUpdate = true; a.aCol.needsUpdate = true; a.aSA.needsUpdate = true; }
    const cam = H.camera, r = H.renderer;
    if (cam && r) { const hpx = r.domElement.height || 720; const u = hpx / (2 * Math.tan((cam.fov * PI) / 360)); st.material.uniforms.uScale.value = u; sk.material.uniforms.uScale.value = u; }
  }
  // world <-> builder helpers (three x = world x, three z = world y, heights in 3D units)
  function W3(F, u, v) { return [fx(F, u, v), fy(F, u, v)]; }
  function obox3(b, F, u0, u1, v0, v1, y0, y1) { const c = W3(F, (u0 + u1) / 2, (v0 + v1) / 2); b.obox(c[0], c[1], Math.abs(u1 - u0) * F.s, Math.abs(v1 - v0) * F.s, y0, y1, aang(F)); }
  function cyl3(b, x, y, y0, r0, r1, h, seg) { b.cyl(x, y0, y, r0, r1, h, seg || 8); }
  function texPlane(H, key, w, h, paint, F, u, v, y, wu, hv, face) {
    const THREE = H.THREE;
    const mat = texMat(H, key, w, h, paint);
    const m = new THREE.Mesh(G3.plane || (G3.plane = sharedPlane(THREE)), mat);
    const c = W3(F, u, v);
    m.position.set(c[0], y, c[1]);
    m.scale.set(wu, hv, 1);
    m.rotation.y = -(face != null ? face : fang(F)) + PI / 2;
    m.userData.noShadow = true;
    return m;
  }
  // Textured materials are cached here per texture key. Never hand a texture to H.mat: view3d keys its cache on
  // JSON.stringify(options), and a Texture serialises through toJSON -> canvas.toDataURL (a PNG encode per call).
  const TEXMAT = new Map();
  function texMat(H, key, w, h, paint) {
    let m = TEXMAT.get(key);
    if (m) return m;
    const THREE = H.THREE, tex = H.tex(key, w, h, paint);
    m = new THREE.MeshLambertMaterial({ color: 0xffffff, map: tex, side: THREE.DoubleSide });
    m.userData.shared = true;
    TEXMAT.set(key, m);
    return m;
  }
  // per-tool held-item materials (plain colours, looked up once instead of H.mat's string key every frame)
  const TOOLMAT = new Map();
  function toolMat(H, tool) {
    let m = TOOLMAT.get(tool);
    if (m) return m;
    m = H.mat(tool === 'comb' || tool === 'iron' || tool === 'clipper' ? '#1e1e22' : tool === 'hammer' || tool === 'shovel' || tool === 'pick' ? '#6a4a2a' : tool === 'garland' ? '#f08a1a' : tool === 'mirror' ? '#cfe2ee' : '#c8ccd2');
    TOOLMAT.set(tool, m);
    return m;
  }
  function sharedPlane(THREE) { const g = new THREE.PlaneGeometry(1, 1); g.userData = { shared: true }; return g; }
  function paintPoster(i) { return (g, w, h) => { const cols = [['#d82a3a', '#f2c230'], ['#2a5cb8', '#f08a1a'], ['#3a8a3a', '#f4e8c0'], ['#7a2a8a', '#f2c230']][i % 4]; g.fillStyle = cols[0]; g.fillRect(0, 0, w, h); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1412'; g.beginPath(); g.ellipse(w * 0.5, h * 0.3, w * 0.24, h * 0.16, 0, 0, TAU); g.fill(); g.fillStyle = '#d8a070'; g.beginPath(); g.ellipse(w * 0.5, h * 0.4, w * 0.2, h * 0.17, 0, 0, TAU); g.fill(); g.fillStyle = cols[1]; g.fillRect(w * 0.08, h * 0.72, w * 0.84, h * 0.16); g.fillStyle = cols[0]; for (let k = 0; k < 5; k++) g.fillRect(w * (0.14 + k * 0.15), h * 0.75, w * 0.08, h * 0.1); g.strokeStyle = '#f4f0e0'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4); }; }
  function paintChart(g, w, h) { g.fillStyle = '#f4f0e0'; g.fillRect(0, 0, w, h); for (let r = 0; r < 3; r++) for (let q = 0; q < 2; q++) { const x = w * (0.25 + q * 0.5), y = h * (0.2 + r * 0.3); g.fillStyle = '#c89060'; g.beginPath(); g.arc(x, y, w * 0.13, 0, TAU); g.fill(); g.fillStyle = '#1a1412'; g.beginPath(); g.arc(x, y - w * 0.05, w * 0.13, PI, TAU); g.fill(); g.fillStyle = '#5a5a62'; g.fillRect(x - w * 0.15, y + w * 0.16, w * 0.3, 3); } }
  function paintMirror(g, w, h) { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#dcecf4'); gr.addColorStop(0.5, '#9ab8c8'); gr.addColorStop(1, '#cfe2ec'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(w * 0.12, 0, w * 0.1, h); g.strokeStyle = '#6a4a2a'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); }
  function paintBoard(text, bg, fg) { return (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = 'bold ' + Math.round(h * 0.42) + 'px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h * 0.52); g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6); }; }
  function paintDiversion(g, w, h) { g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1e'; g.fillRect(6, 6, w - 12, h - 12); g.fillStyle = '#f2c230'; g.font = 'bold ' + Math.round(h * 0.22) + 'px monospace'; g.textAlign = 'center'; g.fillText('DIVERSION', w / 2, h * 0.38); g.font = 'bold ' + Math.round(h * 0.13) + 'px monospace'; g.fillText('ROAD WORK', w / 2, h * 0.58); g.beginPath(); g.moveTo(w * 0.2, h * 0.78); g.lineTo(w * 0.34, h * 0.68); g.lineTo(w * 0.34, h * 0.74); g.lineTo(w * 0.8, h * 0.74); g.lineTo(w * 0.8, h * 0.82); g.lineTo(w * 0.34, h * 0.82); g.lineTo(w * 0.34, h * 0.88); g.closePath(); g.fill(); }
  function scene3d(sc, H) {
    const THREE = H.THREE, grp = new THREE.Group(), o = { grp, dyn: {}, own: [] };
    const b = H.builder(), F = sc.F, L = sc.L, VS = H.VS || 1.5;
    switch (sc.spot.kind) {
      case 'irani': case 'chai': {
        if (sc.spot.kind === 'chai') {
          b.color(TIN); obox3(b, F, -7.5, 7.5, -7.4, -6.7, 0, 16.5);
          b.color('#6a6e74'); obox3(b, F, -7.8, 7.8, -7.6, -2.0, 17.4, 17.9);
          b.color('#5a5a62'); for (const u of [-7.4, 7.4]) { const c = W3(F, u, -2.3); cyl3(b, c[0], c[1], 0, 0.25, 0.25, 17.6, 6); }
          b.color(WOOD); obox3(b, F, -5.5, 5.5, -2.4, 2.4, 0, 9.4);
          b.color(WOOD2); obox3(b, F, -5.7, 5.7, -2.6, 2.6, 9.4, 9.8);
          const jc = ['#e8c070', '#d89a4a', '#f0d8a0', '#c87a3a'];
          for (let i = 0; i < 4; i++) { const c = W3(F, 0.8 + i * 1.3, 0.6); b.color('#cfe6ee'); cyl3(b, c[0], c[1], 9.8, 0.6, 0.6, 2.2, 8); b.color(jc[i]); cyl3(b, c[0], c[1], 9.8, 0.5, 0.5, 1.6, 8); b.color('#c8302a'); cyl3(b, c[0], c[1], 12, 0.5, 0.5, 0.3, 8); }
          grp.add(texPlane(H, 'cl_board_chai', 128, 48, paintBoard('CHAI', '#2a5c9a', '#fff4c0'), F, 0, -6.6, 14, 7, 2.6));
          grp.add(texPlane(H, 'cl_calendar', 64, 80, paintPoster(2), F, 3.5, -6.6, 11, 2.6, 3.4));
        }
        if (L.seats && L.seats.length) {
          const s0 = L.seats[0], s1 = L.seats[L.seats.length - 1], dx = s1.x - s0.x, dy = s1.y - s0.y, d = Math.hypot(dx, dy) || 1, cx = (s0.x + s1.x) / 2, cy = (s0.y + s1.y) / 2;
          // a long bench (matches view3d_actors' bench prop height; sitters get theirs on top)
          b.color(sc.spot.kind === 'irani' ? '#7a5232' : '#a8a49c'); b.obox(cx - Math.cos(s0.a) * 0.9, cy - Math.sin(s0.a) * 0.9, d + 4, 2.8, 2.0, 2.5, Math.atan2(dy, dx));
          b.color('#5a3a22'); for (const s of [-1, 1]) b.obox(cx + (dx / d) * s * (d / 2 + 1.4) - Math.cos(s0.a) * 0.9, cy + (dy / d) * s * (d / 2 + 1.4) - Math.sin(s0.a) * 0.9, 0.5, 2.4, 0, 2.0, Math.atan2(dy, dx));
        }
        if (L.radio) {
          const r = L.radio;
          b.color(WOOD); cyl3(b, r.x, r.y, 0, 0.8, 0.8, 4.4, 6);
          b.color('#5a3a2a'); b.obox(r.x, r.y, 2.6, 1.4, 4.4, 6.4, r.a || 0);
          b.color('#d8c8a0'); b.obox(r.x + Math.cos((r.a || 0) + PI / 2) * 0.72, r.y + Math.sin((r.a || 0) + PI / 2) * 0.72, 1.2, 0.05, 4.8, 6.0, r.a || 0);
          b.color('#c8ccd2'); cyl3(b, r.x + 0.8, r.y, 6.4, 0.06, 0.06, 4.5, 4);
        }
        break;
      }
      case 'saloon': {
        const ch = L.chair;
        // the chair: chrome footrest, red seat back and armrests around view3d's stool
        const a = ch.a, ca = Math.cos(a), sa = Math.sin(a);
        b.color('#7a1a20'); b.obox(ch.x - ca * 1.7, ch.y - sa * 1.7, 0.8, 3.4, 2.4, 9.2, a);
        b.color('#8a1a22'); for (const s of [-1, 1]) b.obox(ch.x - sa * 1.7 * s, ch.y + ca * 1.7 * s, 3.2, 0.5, 3.6, 4.2, a);
        b.color('#c8ccd2'); b.obox(ch.x + ca * 2.2, ch.y + sa * 2.2, 0.6, 3, 0.8, 1.1, a); cyl3(b, ch.x, ch.y, 0, 1.6, 1.6, 0.4, 10);
        const m = L.mirror, mu = (m.u0 + m.u1) / 2;
        if (m.stand) { const u0 = Math.min(m.u0, L.chart ? L.chart[0] : m.u0) - 0.4, u1 = Math.max(m.u1, L.posters && L.posters.length ? L.posters[L.posters.length - 1][1] : m.u1) + 0.4; b.color('#5a3a22'); obox3(b, F, u0, u1, m.v - 0.4, m.v - 0.05, 5.6, 16.8); for (const u of [u0 + 0.3, u1 - 0.3]) obox3(b, F, u - 0.3, u + 0.3, m.v - 0.5, m.v, 0, 5.6); }
        const mi = texPlane(H, 'cl_mirror', 64, 96, paintMirror, F, mu, m.v + 0.06, ((m.h0 + m.h1) / 2) * VS, (m.u1 - m.u0), (m.h1 - m.h0) * VS);
        grp.add(mi);
        // the shelf with bottles under the mirror
        b.color('#f2efe6'); obox3(b, F, m.u0, m.u1, m.v, m.v + 0.9, 0, 6.2);
        const bc = ['#2a8a5a', '#d8a020', '#5aa0d8', '#c03030', '#f2f0ea'];
        for (let i = 0; i < 5; i++) { const c = W3(F, m.u0 + 0.6 + i * ((m.u1 - m.u0 - 1.2) / 4), m.v + 0.45); b.color(bc[i]); cyl3(b, c[0], c[1], 6.2, 0.3, 0.3, 1.4, 6); }
        // radio on the shelf end
        { const c = W3(F, m.u1 - 0.6, m.v + 0.5); b.color('#5a3a2a'); b.obox(c[0], c[1], 1.8, 0.9, 6.2, 7.6, aang(F)); }
        if (L.posters) L.posters.forEach((q, i) => grp.add(texPlane(H, 'cl_poster_' + ((i + (sc.spot.seed * 7 | 0)) % 4), 64, 96, paintPoster(i + (sc.spot.seed * 7 | 0)), F, (q[0] + q[1]) / 2, m.v + 0.06, 8.1 * VS, q[1] - q[0], 5 * VS)));
        if (L.chart) grp.add(texPlane(H, 'cl_chart', 64, 96, paintChart, F, (L.chart[0] + L.chart[1]) / 2, m.v + 0.06, 7.9 * VS, L.chart[1] - L.chart[0], 5.4 * VS));
        if (!sc.spot.lm) { // the roadside cabin
          b.color('#c8c0b0'); obox3(b, F, -7, 7, -6.4, 0.4, 0, 0.12);
          b.color('#4a8a9a'); obox3(b, F, -7.4, 7.4, -7.0, -6.4, 0, 17);
          b.color('#3a7a8a'); obox3(b, F, -7.4, -6.9, -6.6, 0.2, 0, 11); obox3(b, F, 6.9, 7.4, -6.6, 0.2, 0, 11);
          b.color(TIN); obox3(b, F, -7.8, 7.8, -7.2, 0.6, 16.4, 16.9);
          grp.add(texPlane(H, 'cl_board_saloon', 128, 40, paintBoard('SALOON', '#f4f0e0', '#1a2a5a'), F, 0, 0.7, 15.2, 9, 2.6));
          b.color('#5a3a22'); if (L.seats && L.seats.length) { const s0 = L.seats[0], s1 = L.seats[L.seats.length - 1], dx = s1.x - s0.x, dy = s1.y - s0.y, d = Math.hypot(dx, dy) || 1; b.obox((s0.x + s1.x) / 2 - Math.cos(s0.a) * 0.9, (s0.y + s1.y) / 2 - Math.sin(s0.a) * 0.9, d + 4, 2.8, 2.0, 2.5, Math.atan2(dy, dx)); }
          const pc = W3(F, 7.8, 0.6); b.color('#f4f2ee'); cyl3(b, pc[0], pc[1], 0, 0.6, 0.6, 12, 8); b.color('#d8302a'); cyl3(b, pc[0], pc[1], 4, 0.65, 0.65, 1.2, 8); cyl3(b, pc[0], pc[1], 8, 0.65, 0.65, 1.2, 8); b.color('#2a5cb8'); cyl3(b, pc[0], pc[1], 6, 0.65, 0.65, 1.2, 8);
        }
        break;
      }
      case 'busstop': { // the route board on its pole beside the shelter + the vendors' baskets on a crate
        const c = W3(F, F.hl + 2.5, 3);
        b.color('#4a4a52'); cyl3(b, c[0], c[1], 0, 0.3, 0.3, 13, 6);
        grp.add(texPlane(H, 'cl_board_route', 96, 64, paintBoard('BUS STOP', '#c8202a', '#fff4e0'), F, F.hl + 2.5, 3.2, 14.5, 5, 3.3));
        const k = W3(F, -F.hl - 2.5, 3.5); b.color(WOOD); b.obox(k[0], k[1], 3, 2.2, 0, 2.2, aang(F));
        break;
      }
      case 'trade': trade3d(b, sc, H, grp, o); break;
      case 'roadwork': road3d(b, sc, H, grp, o); break;
      default: break;
    }
    const mesh = b.mesh();
    if (mesh) { mesh.castShadow = true; mesh.receiveShadow = true; grp.add(mesh); }
    return o;
  }
  function trade3d(b, sc, H, grp, o) {
    const F = sc.F, L = sc.L, sub = sc.sub, THREE = H.THREE;
    switch (sub) {
      case 'cobbler': {
        b.color('#6a5a3a'); obox3(b, F, -3.2, 2.6, -3.2, 0.4, 0, 0.08);
        b.color(WOOD); obox3(b, F, 1.2, 2.6, -1.6, -0.4, 0, 2.4);
        for (let i = 0; i < 4; i++) { const c = W3(F, -2.4 + i * 1.3, -2.4); b.color(['#5a3a22', '#2a2a2a', '#8a4a2a', '#3a2a1a'][i]); b.obox(c[0], c[1], 2, 0.9, 0.08, 0.6, aang(F)); }
        break;
      }
      case 'puncture': {
        b.color(WOOD); obox3(b, F, -6, -2, -4.2, -1.2, 0, 5);
        const tc = W3(F, 3.2, 1.6);
        b.color('#4a5a68'); cyl3(b, tc[0], tc[1], 0, 2.2, 2.0, 4.2, 12);
        b.color('#6a8aa0'); cyl3(b, tc[0], tc[1], 4.2, 1.85, 1.85, 0.05, 12);
        o.dyn.tube = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.28, 6, 14), H.mat('#1e1e22')); o.dyn.tube.rotation.x = PI / 2; o.dyn.tube.position.set(tc[0], 4.4, tc[1]); grp.add(o.dyn.tube); o.own.push(o.dyn.tube.geometry);
        for (let i = 0; i < 3; i++) { const c = W3(F, -5.6 + i * 1.4, -4.6); const t = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.4, 6, 16), H.mat('#1a1a1e')); t.position.set(c[0], 7, c[1]); t.rotation.y = -aang(F); grp.add(t); o.own.push(t.geometry); }
        b.color('#2a5a9a'); { const c = W3(F, -1, 2.4); cyl3(b, c[0], c[1], 0, 0.3, 0.3, 6, 6); }
        grp.add(texPlane(H, 'cl_board_punct', 128, 48, paintBoard('PUNCTURE', '#f2c230', '#c03030'), F, -4, -4.4, 11.5, 6, 2.4));
        break;
      }
      case 'ironing': {
        b.color('#d8d0c0'); obox3(b, F, -3.4, 3.4, 0.4, 2.6, 0, 7.8);
        b.color('#efe9dc'); obox3(b, F, -3.5, 3.5, 0.3, 2.7, 7.8, 8.1);
        const cc = ['#d8e0ea', '#f0d8c8', '#e8e8d0', '#c8d8e8'];
        for (let i = 0; i < 4; i++) { b.color(cc[i]); obox3(b, F, -6.2, -4, -1, 1, 0.1 + 7.8 + i * 0.6, 7.8 + i * 0.6 + 0.6); }
        b.color(WOOD); obox3(b, F, -6.4, -3.8, -1.2, 1.2, 0, 7.8);
        const bc = W3(F, -1.8, -2.6); b.color('#3a3a40'); cyl3(b, bc[0], bc[1], 0, 1.4, 1.1, 2.4, 10);
        o.dyn.glow = H.glow('#ff6a20', 4); o.dyn.glow.position.set(bc[0], 2.8, bc[1]); grp.add(o.dyn.glow); o.own.push(o.dyn.glow.material);
        break;
      }
      case 'tailor': {
        b.color(WOOD); obox3(b, F, -2.6, 2.6, -0.6, 1.8, 0, 6.6);
        b.color('#1a1a1e'); { const c = W3(F, 0.4, 0.6); b.obox(c[0], c[1], 3.6, 1.2, 6.6, 8.6, aang(F)); }
        b.color('#c84a6a'); obox3(b, F, -1.8, 0.2, 0.8, 1.7, 6.6, 6.75);
        b.color('#3a3a40'); { const c = W3(F, 0, 0.6); cyl3(b, c[0], c[1], 0, 1.4, 1.4, 0.3, 8); }
        const shirts = ['#e8f0f8', '#f0c8c8', '#c8e0c8'];
        b.color('#5a5a62'); obox3(b, F, -4.4, 4.4, -3.1, -2.9, 14, 14.2);
        for (let i = 0; i < 3; i++) { b.color(shirts[i]); obox3(b, F, -4 + i * 2.8, -1.8 + i * 2.8, -3.1, -2.9, 8, 14); }
        break;
      }
      case 'knife': {
        const c = W3(F, 0.6, 1.6);
        if (N.models3d && N.models3d.has && N.models3d.has('hero_cycle') && N.models3d.instance) {
          try { const m = N.models3d.instance('hero_cycle'); if (m) { m.position.set(c[0], 0, c[1]); m.rotation.y = -aang(F); grp.add(m); o.dyn.model = m; } } catch (e) { o.dyn.model = null; }
        }
        if (!o.dyn.model) { b.color('#1a1a1e'); b.obox(c[0], c[1], 12, 0.4, 3.4, 3.8, aang(F)); for (const u of [-4.6, 4.6]) { const w = W3(F, 0.6 + u, 1.6); const t = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.22, 6, 18), H.mat('#1a1a1e')); t.position.set(w[0], 2.8, w[1]); t.rotation.y = -aang(F); grp.add(t); o.own.push(t.geometry); } }
        b.color('#4a4a52'); obox3(b, F, -4, 5, 1.4, 1.8, 0, 2.6); // the stand
        const wc = W3(F, 2.6, 1.4);
        o.dyn.wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.6, 14), H.mat('#7a7e84')); o.dyn.wheel.rotation.z = PI / 2; o.dyn.wheel.rotation.y = -aang(F); o.dyn.wheel.position.set(wc[0], 7.6, wc[1]); grp.add(o.dyn.wheel); o.own.push(o.dyn.wheel.geometry);
        break;
      }
      case 'flowers': {
        b.color('#7a6a4a'); obox3(b, F, -3, 3, -3, 0.6, 0, 0.08);
        const bc = W3(F, 1.8, 0.6), oc = W3(F, -1.8, 0.4);
        b.color('#8a6a3a'); cyl3(b, bc[0], bc[1], 0, 1.8, 1.4, 1.6, 10); cyl3(b, oc[0], oc[1], 0, 1.6, 1.3, 1.5, 10);
        b.color('#f6f4ea'); b.sphere(bc[0], 1.7, bc[1], 1.5, 0.5, 1.5, 8, 4);
        b.color('#f08a1a'); b.sphere(oc[0], 1.6, oc[1], 1.3, 0.5, 1.3, 8, 4);
        break;
      }
      case 'cyclerepair': {
        b.color(WOOD); obox3(b, F, -6, -3, -4, -2, 0, 4.5);
        const wc = W3(F, 2.8, 1.8), fc = W3(F, -1.4, 1.8);
        b.color('#2a5a9a'); b.obox((wc[0] + fc[0]) / 2, (wc[1] + fc[1]) / 2, 4.6, 0.4, 3.4, 3.8, aang(F));
        const tf = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.2, 6, 18), H.mat('#1a1a1e')); tf.position.set(fc[0], 5.6, fc[1]); tf.rotation.y = -aang(F); grp.add(tf); o.own.push(tf.geometry);
        o.dyn.wheel = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.2, 6, 18), H.mat('#1a1a1e')); o.dyn.wheel.position.set(wc[0], 5.6, wc[1]); o.dyn.wheelA = aang(F); grp.add(o.dyn.wheel); o.own.push(o.dyn.wheel.geometry);
        for (let i = 0; i < 2; i++) { const c = W3(F, -5 + i * 1.6, -4.4); const t = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.35, 6, 16), H.mat('#1a1a1e')); t.position.set(c[0], 7.4, c[1]); t.rotation.y = -aang(F); grp.add(t); o.own.push(t.geometry); }
        grp.add(texPlane(H, 'cl_board_cycle', 128, 48, paintBoard('CYCLE', '#f2c230', '#c03030'), F, -4.5, -4.2, 11.5, 5, 2.2));
        break;
      }
      case 'keymaker': {
        b.color('#4a6a8a'); obox3(b, F, -2.2, 2.2, -0.2, 1.8, 0, 5);
        b.color('#7a5232'); obox3(b, F, -2.4, 2.4, -0.5, -0.3, 5, 12.8);
        b.color('#d8b84a'); for (let r = 0; r < 4; r++) for (let q = 0; q < 6; q++) { const c = W3(F, -2 + q * 0.8, -0.25); b.obox(c[0], c[1], 0.3, 0.1, 6 + r * 1.7, 6.9 + r * 1.7, aang(F)); }
        b.color('#5a5a62'); { const c = W3(F, 1.6, 0.8); b.obox(c[0], c[1], 1, 0.8, 5, 5.9, aang(F)); }
        break;
      }
      case 'raddi': case 'vegcart': {
        // the handcart is dynamic (it moves with the worker)
        const g2 = H.builder();
        g2.color('#6a4a2a'); g2.box(-3.6, 4.4, -2.6, 3.6, 5.2, 2.6);
        g2.color('#4a3220'); g2.box(-6.4, 4.6, -1.8, -3.6, 4.9, -1.5); g2.box(-6.4, 4.6, 1.5, -3.6, 4.9, 1.8);
        if (sub === 'vegcart') { const cols = ['#d8302a', '#c86a3a', '#3a8a2a', '#8a3a7a', '#e8a020', '#5aa02a']; for (let i = 0; i < 12; i++) { const u = (i % 4) - 1.5, v = ((i / 4) | 0) - 1; g2.color(cols[i % cols.length]); g2.sphere(u * 1.6, 5.9, v * 1.4, 0.9, 0.7, 0.9, 6, 4); } }
        else { g2.color('#d8cfb8'); for (let i = 0; i < 3; i++) g2.box(-3 + i * 2, 5.2, -1.6, -1.2 + i * 2, 7.4 + i * 0.3, 1.6); g2.color('#3a7a5a'); g2.cyl(1.8, 5.2, 1.6, 0.4, 0.4, 2, 6); }
        const cart = g2.mesh(); if (cart) { o.dyn.cart = cart; grp.add(cart); o.own.push(cart.geometry); }
        for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.22, 6, 16), H.mat('#1a1a1e')); t.userData.side = s; grp.add(t); o.own.push(t.geometry); (o.dyn.wheels || (o.dyn.wheels = [])).push(t); }
        break;
      }
      default: break;
    }
    if (L.tree && L.tree.own) {
      if (N.models3d && N.models3d.has && N.models3d.has('tree_neem') && N.models3d.instance) {
        try { const m = N.models3d.instance('tree_neem'); if (m) { m.position.set(L.tree.x, 0, L.tree.y); m.scale.setScalar(0.8); grp.add(m); o.dyn.treeModel = m; } } catch (e) { o.dyn.treeModel = null; }
      }
      if (!o.dyn.treeModel) { b.color('#5a4030'); cyl3(b, L.tree.x, L.tree.y, 0, 1.4, 1.0, 14, 7); b.color('#3f6a2a'); b.sphere(L.tree.x, 19, L.tree.y, 9, 6, 9, 9, 6); b.color('#4f7f32'); b.sphere(L.tree.x - 3, 21, L.tree.y - 2.5, 6, 4.5, 6, 8, 5); }
    }
  }
  function road3d(b, sc, H, grp, o) {
    const F = sc.F, L = sc.L, zw = L.zw, THREE = H.THREE, pit = L.pit;
    b.color('#5a4030'); obox3(b, F, pit.u0, pit.u1, pit.v0, pit.v1, 0.02, 0.18);
    b.color('#3e2c22'); obox3(b, F, pit.u0 + 1, pit.u1 - 1, pit.v0 + 0.8, pit.v1 - 0.6, 0.02, 0.2);
    b.color('#7a5a3a'); { const c = W3(F, pit.u1 + 2.6, -1.2); b.sphere(c[0], 0, c[1], 3.4, 2.2, 2.4, 8, 4); }
    b.color('#d8c08a'); b.sphere(L.sand.x, 0, L.sand.y, 4.2, 3.2, 4.2, 9, 5);
    b.color('#a8442a'); for (let r = 0; r < 3; r++) obox3(b, F, -22 + r * 0.3, -18 + r * 0.3, 2.2 + r * 0.2, 4.2 - r * 0.2, r * 1.2, r * 1.2 + 1.2);
    // tar drum on bricks
    const d = L.drum;
    b.color('#8a3a2a'); for (const s of [-1, 1]) b.obox(d.x + s * 1.4, d.y, 0.9, 2.6, 0, 1.2, 0);
    b.color('#1a1a1e'); cyl3(b, d.x, d.y, 1.2, 1.8, 1.8, 7.2, 12);
    b.color('#0a0a0c'); cyl3(b, d.x, d.y, 8.4, 1.6, 1.6, 0.1, 12);
    o.dyn.fire = H.glow('#ff7a20', 6); o.dyn.fire.position.set(d.x, 1, d.y); grp.add(o.dyn.fire); o.own.push(o.dyn.fire.material);
    // the cement mixer: yellow frame, rotating drum
    const m = L.mixer, a = aang(F);
    b.color('#d8a020'); b.obox(m.x, m.y, 7, 1, 2, 3, a); b.obox(m.x, m.y, 1, 4.4, 2, 3, a);
    b.color('#1a1a1e'); for (const s of [-1, 1]) cyl3(b, m.x - Math.sin(a) * 2.2 * s, m.y + Math.cos(a) * 2.2 * s, 0, 1.2, 1.2, 0.6, 8);
    const dg = new THREE.CylinderGeometry(1.8, 2.8, 5, 12); dg.translate(0, 0.5, 0); o.own.push(dg);
    o.dyn.drum = new THREE.Mesh(dg, H.mat('#e8a020')); o.dyn.drum.position.set(m.x, 7, m.y); o.dyn.drum.rotation.order = 'YZX'; o.dyn.drum.rotation.y = -a; o.dyn.drum.rotation.z = 0.9; grp.add(o.dyn.drum);
    // barricades: striped poles + bars
    for (let u = -24; u <= 24.01; u += 6) { const c = W3(F, u, -zw); b.color(((u / 6) | 0) % 2 ? '#f4f2ee' : '#d8302a'); cyl3(b, c[0], c[1], 0, 0.35, 0.35, 6.6, 6); }
    for (let u = -24; u < 24; u += 2) { b.color(((u / 2) | 0) % 2 ? '#f4f2ee' : '#d8302a'); obox3(b, F, u, u + 2, -zw - 0.2, -zw + 0.2, 5, 5.8); obox3(b, F, u, u + 2, -zw - 0.2, -zw + 0.2, 2.6, 3.2); }
    // the DIVERSION board on its stand, facing the oncoming traffic (along -a)
    const bd = L.board;
    b.color('#4a4a52'); for (const s of [-2.6, 2.6]) { const c = W3(F, bd.u, bd.v + s * 0.4); cyl3(b, c[0], c[1], 0, 0.3, 0.3, 9, 6); }
    grp.add(texPlane(H, 'cl_board_div', 128, 96, paintDiversion, F, bd.u - 0.2, bd.v, 12.4, 7, 5.6, aang(F) + PI));
    if (sc.night || true) { o.dyn.lamps = []; for (const u of [-24, 0, 24]) { const c = W3(F, u, -zw); const g = H.glow('#ff3020', 3); g.position.set(c[0], 7.2, c[1]); g.material.opacity = 0; grp.add(g); o.own.push(g.material); o.dyn.lamps.push(g); } }
  }
  function update3dScene(sc, o, H, dt) {
    const t = simT(), night = clamp(H.night || 0, 0, 1), D = o.dyn;
    if (D.drum) D.drum.rotation.x = (sc.st.mixA || 0);
    if (D.fire) D.fire.material.opacity = 0.55 + 0.3 * Math.sin(t * 13) * Math.sin(t * 7.1);
    if (D.lamps) for (const g of D.lamps) g.material.opacity = night * (0.6 + 0.3 * Math.sin(t * 3));
    if (D.glow) D.glow.material.opacity = 0.35 + night * 0.5 + 0.1 * Math.sin(t * 9);
    if (D.wheel) { if (D.wheelA != null) { D.wheel.rotation.set(0, -D.wheelA, t * 8); } else D.wheel.rotation.x = t * (sc.st.grind ? 18 : 3); }
    if (D.cart && sc.st.worker && sc.st.worker.alive) {
      const w = sc.st.worker, c = Math.cos(w.angle), s = Math.sin(w.angle), cx = w.x + c * 5.4, cy = w.y + s * 5.4;
      D.cart.position.set(cx, 0, cy); D.cart.rotation.y = -w.angle;
      for (const wh of D.wheels || []) { const sd = wh.userData.side; wh.position.set(cx - s * 2.8 * sd, 2.2, cy + c * 2.8 * sd); wh.rotation.set(0, -w.angle, 0); }
    }
    void dt;
  }
  // pooled dynamic held items in 3D (newspapers, capes, foam, glasses, tools, carried baskets)
  function pools3d(H) {
    if (G3.pools) return G3.pools;
    const THREE = H.THREE, g = G3.grp;
    const mk = (geo, col, n, o) => { const out = []; for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo, H.mat(col, o)); m.visible = false; m.userData.noShadow = true; g.add(m); out.push(m); } return out; };
    const paperG = new THREE.BoxGeometry(3.2, 2.3, 0.06), capeG = new THREE.ConeGeometry(2.7, 4.4, 10, 1, true), foamG = new THREE.SphereGeometry(0.55, 6, 4), glassG = new THREE.CylinderGeometry(0.45, 0.38, 1.1, 8), toolG = new THREE.BoxGeometry(1.6, 0.25, 0.25), panG = new THREE.CylinderGeometry(2.2, 1.6, 0.9, 10);
    capeG.translate(0, -2.2, 0);
    G3.geos = [paperG, capeG, foamG, glassG, toolG, panG];
    G3.pools = { paper: mk(paperG, '#ebe7da', 14), cape: mk(capeG, '#f6f6f2', 6, { double: true }), foam: mk(foamG, '#ffffff', 12), glass: mk(glassG, '#c8925a', 14), tool: mk(toolG, '#c8ccd2', 12), pan: mk(panG, '#3a3a40', 8) };
    return G3.pools;
  }
  const PI3 = { paper: 0, cape: 0, foam: 0, glass: 0, tool: 0, pan: 0 };
  function heldItems3d(H) {
    const PL = pools3d(H), VS = H.VS || 1.5;
    for (const k in PI3) PI3[k] = 0;
    const take3 = (k) => { const arr = PL[k], i = PI3[k]; if (i >= arr.length) return null; PI3[k]++; const m = arr[i]; m.visible = true; return m; };
    const pl = N.player;
    for (const p of PEOPLE) {
      if (!p.alive || p.hidden || p.down) continue;
      if (pl && Math.hypot(p.x - pl.x, p.y - pl.y) > 260) continue;
      const a = p.angle, c = Math.cos(a), s = Math.sin(a), el = p.z > 0 ? p.z : 0;
      const sit = p.idle === 'sit';
      const chest = el + (sit ? 6.0 : 7.0) * (p.look && p.look.kind === 'kid' ? 0.8 : 1);
      if (p.hold === 'paper') { const m = take3('paper'); if (m) { const f = p.flip > 0 ? Math.abs(Math.cos(p.flip * PI)) : 1; m.position.set(p.x + c * 2.0, chest, p.y + s * 2.0); m.rotation.set(-0.35, -a + PI / 2, 0, 'YXZ'); m.scale.set(f, 1, 1); } }
      else if (p.hold === 'glass') { const m = take3('glass'); if (m) m.position.set(p.x + c * 1.9 - s * 1.2, chest - 0.6, p.y + s * 1.9 + c * 1.2); }
      else if ((p.hold === 'pan' || p.hold === 'bricks') && p.look.prop !== 'pot') { const m = take3('pan'); if (m) m.position.set(p.x, el + 10.4, p.y); }
      if (p.cape) { const m = take3('cape'); if (m) { m.position.set(p.x + c * 0.3, el + 7.6, p.y + s * 0.3); m.rotation.set(0, 0, 0); } }
      if (p.foam > 0.05) for (const sd of [-1, 1]) { const m = take3('foam'); if (m) { m.position.set(p.x + c * 0.9 - s * 0.7 * sd, el + 8.1, p.y + s * 0.9 + c * 0.7 * sd); m.scale.setScalar(p.foam); } }
      if (p.tool) { const m = take3('tool'); if (m) { m.position.set(p.hx, p.hh * VS, p.hy); m.rotation.set(0, -a + (p.tool === 'scissors' ? Math.sin(simT() * 22) * 0.4 : 0), 0); m.material = toolMat(H, p.tool); m.scale.set(p.tool === 'shovel' || p.tool === 'pick' ? 2.2 : p.tool === 'iron' ? 1.2 : 1, p.tool === 'iron' ? 4 : p.tool === 'mirror' ? 6 : 1, p.tool === 'iron' ? 4 : p.tool === 'mirror' ? 6 : 1); } }
    }
    for (const k in PL) { const arr = PL[k]; for (let i = PI3[k]; i < arr.length; i++) arr[i].visible = false; }
  }
  function lights3d(H) {
    if (!H.light || !(H.night > 0.2)) return;
    let n = 0;
    for (const sc of ACTIVE) {
      if (n >= 3) break;
      const F = sc.F, L = sc.L;
      if (sc.spot.kind === 'saloon') { H.light({ x: fx(F, L.chair.u, L.chair.v), y: fy(F, L.chair.u, L.chair.v), h: 14, color: '#e8f4ff', intensity: 0.8, r: 40 }); n++; }
      else if (sc.spot.kind === 'chai') { H.light({ x: fx(F, 0, -2), y: fy(F, 0, -2), h: 15, color: '#ffd890', intensity: 0.8, r: 36 }); n++; }
      else if (sc.spot.kind === 'roadwork') { H.light({ x: L.drum.x, y: L.drum.y, h: 4, color: '#ff8a30', intensity: 0.9, r: 30 }); n++; }
    }
  }
  function layerUpdate(dt, H) {
    const t0 = now();
    if (!G3.ready || !is3D()) return;
    // built scene groups are cached per spot: a released scene is hidden and kept for a while, so walking back
    // across the activation radius re-shows it instead of rebuilding it
    const L3 = G3.list;
    let idle = 0;
    for (let i = L3.length - 1; i >= 0; i--) {
      const o = L3[i];
      if (o.sc && o.sc.on && o.sc.spot.scene === o.sc) continue;
      o.sc = null;
      if (o.grp.visible) o.grp.visible = false;
      o.idle += dt;
      if (o.idle > TUNE.keep3dSecs) disposeScene3d(o); else idle++;
    }
    while (idle > TUNE.keep3dMax) { let w = null; for (const o of L3) if (!o.sc && (!w || o.idle > w.idle)) w = o; if (!w) break; disposeScene3d(w); idle--; }
    for (const sc of ACTIVE) {
      let o = G3.scenes.get(sc.spot);
      if (!o) {
        try { o = scene3d(sc, H); } catch (e) { N.err('citylife.scene3d', e); o = { grp: new H.THREE.Group(), own: [], dyn: {} }; }
        o.spot = sc.spot; o.idle = 0; o.sc = null;
        G3.grp.add(o.grp); G3.scenes.set(sc.spot, o); L3.push(o); G3.built++;
      }
      if (o.sc !== sc) { o.sc = sc; o.idle = 0; o.grp.visible = true; }
      try { update3dScene(sc, o, H, dt); } catch (e) { N.err('citylife.update3d', e); }
    }
    try { heldItems3d(H); } catch (e) { N.err('citylife.held3d', e); }
    fillPoints(H);
    lights3d(H);
    G3.ms = now() - t0;
  }
  function disposeScene3d(o) {
    G3.grp.remove(o.grp);
    for (const m of o.own) { try { m.dispose(); } catch (e) { /* ignore */ } }
    o.grp.traverse((m) => { if (m.geometry && !(m.geometry.userData && m.geometry.userData.shared) && o.own.indexOf(m.geometry) < 0 && m !== o.dyn.model && m !== o.dyn.treeModel && !(o.dyn.model && isChild(m, o.dyn.model)) && !(o.dyn.treeModel && isChild(m, o.dyn.treeModel))) { try { m.geometry.dispose(); } catch (e) { /* ignore */ } } });
    G3.scenes.delete(o.spot);
    const i = G3.list.indexOf(o); if (i >= 0) G3.list.splice(i, 1);
  }
  function isChild(m, root) { let p = m; while (p) { if (p === root) return true; p = p.parent; } return false; }
  let reg3d = false;
  function register3d() {
    const V = N.view3d;
    if (reg3d || !V || !V.registerLayer) return;
    reg3d = true;
    V.registerLayer('citylife', {
      order: 62,
      init(THREE, H) {
        G3.THREE = THREE; G3.H = H;
        G3.grp = new THREE.Group(); G3.grp.name = 'citylife';
        G3.pts = makePoints(THREE, PMAX, false); G3.spk = makePoints(THREE, 64, true);
        G3.grp.add(G3.pts); G3.grp.add(G3.spk);
        H.layer.add(G3.grp);
        G3.ready = true; G3.pools = null;
      },
      update(dt, H) { try { layerUpdate(dt, H); } catch (e) { N.err('citylife.layer', e); } },
      dispose(H) {
        for (const o of G3.list.slice()) disposeScene3d(o);
        for (const m of TEXMAT.values()) m.dispose(); TEXMAT.clear(); TOOLMAT.clear();
        if (G3.grp && H && H.layer) H.layer.remove(G3.grp);
        for (const p of [G3.pts, G3.spk]) if (p) { p.geometry.dispose(); p.material.dispose(); }
        if (G3.geos) for (const g of G3.geos) g.dispose();
        G3.ready = false; G3.pools = null; G3.geos = null;
      },
    });
  }
  N.on('boot', register3d);

  /* ================================================================ interactions (shops.js) */
  function nearestPlace(kind, x, y) {
    let best = null, bd = 1e12;
    try { const ids = N.shops && N.shops.list ? N.shops.list(kind) : []; for (const id of ids) { const p = N.places[id]; if (!p) continue; const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y); if (d < bd) { bd = d; best = id; } } } catch (e) { best = null; }
    return best;
  }
  function offerInteractions() {
    const pl = N.player, I = N.interact;
    if (!pl || !I || !I.offer || pl.vehicle || !N.shops) return;
    for (const sc of ACTIVE) {
      const L = sc.L, kind = sc.spot.kind;
      if (kind === 'irani' && L.sit && sc.spot.place) {
        const d = Math.hypot(L.sit.x - pl.x, L.sit.y - pl.y);
        if (d < 11) I.offer({ label: 'Sit for chai', priority: 4, dist: d, use: () => sitForChai(sc) });
      } else if (kind === 'chai') {
        const d = Math.hypot(sc.spot.x - pl.x, sc.spot.y - pl.y);
        if (d < 14) I.offer({ label: 'Chai ₹2', priority: 1, dist: d, use: () => buyAt(sc, 'chai_bandi', 'chai') });
      } else if (kind === 'saloon' && !sc.spot.lm) {
        const d = Math.hypot(L.chair.x - pl.x, L.chair.y - pl.y);
        if (d < 12) I.offer({ label: 'Haircut ₹10', priority: 1, dist: d, use: () => buyAt(sc, 'barber', 'haircut') });
      }
    }
  }
  function sitForChai(sc) {
    const id = sc.spot.place;
    try { if (N.shops.open && N.shops.open(id, { focus: 'sit' })) { const w = sc.people.find((p) => p.job === 'reader'); if (w) bark(w, pick(LINES.sitChai), { force: true }); return; } } catch (e) { N.err('citylife.sit', e); }
  }
  function buyAt(sc, kind, item) {
    const id = nearestPlace(kind, sc.spot.x, sc.spot.y);
    if (!id || !N.shops.buy) return;
    let r = null;
    try { r = N.shops.buy(id, item, {}); } catch (e) { N.err('citylife.buy', e); }
    if (r && r.ok) {
      sound('coin', sc.spot.x, sc.spot.y, { vol: 0.4, force: true });
      if (kind === 'barber') { const b = sc.st.barber; if (b) bark(b, pick(LINES.barberDone), { force: true }); toastMsg(typeof r.msg === 'string' ? r.msg : 'Snip, snip. New hairstyle!'); }
      else { const sf = N.streetfood && sc.spot.sf ? N.streetfood.scene(sc.spot.sf.id) : null; if (sf && sf.vendor) bark(sf.vendor, 'Lo beta, garam chai!', { force: true }); }
    } else if (r && r.why) toastMsg(String(r.why).replace(/\*/g, ''));
  }
  function toastMsg(t) { try { if (N.hud && N.hud.toast) N.hud.toast(t, 2400); } catch (e) { /* ignore */ } }

  /* ================================================================ system */
  function init() {
    register3d();
    registerSfx();
    if (ready || !N.world || !N.world.built) return;
    ready = true;
    pCap = lowTier() ? TUNE.maxParticles.low : TUNE.maxParticles.desk;
    try { buildSpots(); } catch (e) { N.err('citylife.spots', e); }
    try { if (N.streetfood && N.streetfood.register && !N.streetfood.KINDS.cl_chai) N.streetfood.register('cl_chai', SF_CHAI); } catch (e) { N.err('citylife.sfRegister', e); }
  }
  let sfT = 0;
  function update(dt) {
    if (!ready) { init(); if (!ready) return; }
    registerSfx();
    const t0 = now();
    if (API.enabled === false) { if (ACTIVE.length) for (const sc of ACTIVE.slice()) releaseScene(sc, true); return; }
    dirT -= dt;
    if (dirT <= 0) { dirT = 0.25; direct(); }
    // tea-stall spots in streetfood (it rebuilds its own list from scratch at times)
    sfT -= dt;
    if (sfT <= 0) { sfT = 2; for (const sc of ACTIVE) if (sc.spot.sf) ensureSfSpot(sc.spot); }
    for (let i = 0; i < ACTIVE.length; i++) sceneUpdate(ACTIVE[i], dt);
    updateParticles(dt);
    offerInteractions();
    const ms = now() - t0;
    ST.ms = ms; ST.msAvg += (ms - ST.msAvg) * 0.05;
  }
  function draw() {
    if (!ready || !N.render) return;
    const Rr = N.render;
    ST.ms2d = ST.draw2dAcc; ST.draw2dAcc = 0; ST.ms3d = G3.ms;
    for (const sc of ACTIVE) pushLights(sc);
    if (is3D() || !ACTIVE.length) return;
    const v = Rr.view;
    for (const sc of ACTIVE) {
      const sp = sc.spot, r = 60;
      if (sp.x + r < v.x0 || sp.x - r > v.x1 || sp.y + r < v.y0 || sp.y - r > v.y1) continue;
      // ground-level props under the people (actors layer, before them) and the tall / facade bits after the art
      Rr.queue('actors', loKey(sc), sc.fnLo);
      const key = sp.lm ? Rr.distKey(sp.lm.x, sp.lm.y) + 0.6 : Rr.distKey(sp.x, sp.y) + (sp.kind === 'chai' ? 0.3 : 0.6);
      Rr.queue('structures', key, sc.fnHi);
    }
  }
  function loKey(sc) {
    const F = sc.F;
    switch (sc.spot.kind) {
      case 'roadwork': return Math.min(fy(F, -30, -10), fy(F, 30, -10), fy(F, -30, 6), fy(F, 30, 6)) - 2;
      case 'busstop': return -1e9;
      default: return Math.min(fy(F, -F.hl - 6, -8), fy(F, F.hl + 6, -8), fy(F, -F.hl - 6, 18), fy(F, F.hl + 6, 18)) - 4;
    }
  }
  function resetAll() {
    for (const sc of ACTIVE.slice()) releaseScene(sc, true);
    for (const p of PEOPLE.slice()) dropPerson(p);
    P.n = 0;
    for (const sp of SPOTS) sp.force = null;
  }

  /* ================================================================ events */
  N.on('shop:service', (d) => {
    try {
      if (!d || d.service !== 'haircut') return;
      for (const sc of ACTIVE) {
        if (sc.spot.kind !== 'saloon' || sc.spot.place !== d.place) continue;
        const b = sc.st.barber; if (b) bark(b, pick(LINES.barberDone), { force: true });
        const w = sc.people.find((p) => p.job === 'waiter' && p.look.kind !== 'kid'); if (w) { w.lookAt = N.player; w.lookT = 3; setTimeout(() => bark(w, pick(LINES.waitingPlayer), { force: true }), 2600); }
      }
    } catch (e) { N.err('citylife.service', e); }
  });
  N.on('shop:open', (d) => {
    try {
      if (!d || d.kind !== 'barber') return;
      for (const sc of ACTIVE) if (sc.spot.kind === 'saloon' && sc.spot.place === d.place && sc.st.barber) bark(sc.st.barber, pick(LINES.barberPlayer), { force: true });
    } catch (e) { N.err('citylife.shopOpen', e); }
  });
  N.on('world:built', () => { ready = false; resetAll(); });
  N.on('game:new', () => { dirT = 0; });
  N.on('player:teleport', () => { dirT = 0; });

  N.addSystem({
    id: 'citylife', order: 44, runIn: ['play', 'dialogue', 'cutscene'],
    init() { init(); },
    update(dt) { try { update(dt); } catch (e) { N.err('citylife.update', e); } },
    draw() { try { draw(); } catch (e) { N.err('citylife.draw2d', e); } },
    reset() { resetAll(); },
  });

  /* ================================================================ API */
  function spotByKind(k) {
    const pl = N.player;
    let kind = k, sub = null;
    if (/^trade:/.test(k)) { kind = 'trade'; sub = k.slice(6); }
    let best = null, bd = 1e12;
    for (const s of SPOTS) { if (s.kind !== kind || (sub && s.sub !== sub)) continue; const d = pl ? Math.hypot(s.x - pl.x, s.y - pl.y) : 0; if (d < bd) { bd = d; best = s; } }
    return best;
  }
  const API = (N.citylife = {
    version: 1, enabled: true, TUNE, KINDS, TRADES, LINES,
    get spots() { return SPOTS; },
    spot: (id) => BYID.get(id) || null,
    scene: (id) => { const s = BYID.get(id); return s ? s.scene : null; },
    nearest(x, y, kind) { let best = null, bd = 1e12; for (const s of SPOTS) { if (kind && s.kind !== kind && ('trade:' + s.sub) !== kind) continue; const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y); if (d < bd) { bd = d; best = s; } } return best; },
    active() {
      return ACTIVE.map((sc) => ({
        id: sc.spot.id, kind: sc.spot.kind, sub: sc.sub, x: Math.round(sc.spot.x), y: Math.round(sc.spot.y), level: +sc.level.toFixed(2), d: Math.round(Math.max(0, sc.spot.d)),
        people: sc.people.length, states: sc.people.reduce((o, p) => { o[p.st] = (o[p.st] || 0) + 1; return o; }, {}),
        jobs: sc.people.reduce((o, p) => { o[p.job || '-'] = (o[p.job || '-'] || 0) + 1; return o; }, {}),
        seated: sc.people.filter((p) => p.idle === 'sit').length, papers: sc.people.filter((p) => p.hold === 'paper').length,
        particles: (() => { let n = 0; for (let i = 0; i < P.n; i++) if (P.sc[i] === sc.uid) n++; return n; })(),
        bus: sc.st.bus ? (sc.st.departed ? 'departing' : 'stopped') : null, client: sc.st.client ? sc.st.client.ph : null, ms: +sc.ms.toFixed(3),
      }));
    },
    /** tests: pin a spot's level (0..1; null = the schedule) and keep it active; idOrKind = spot id, kind or 'trade:<sub>' */
    force(id, o) {
      if (id == null) { for (const s of SPOTS) s.force = null; dirT = 0; return true; }
      const s = BYID.get(id) || spotByKind(id);
      if (!s) return null;
      s.force = o === null ? null : Object.assign({ level: 1 }, o || {});
      if (s.scene) { s.scene.lvlT = 0; if (s.force && s.force.bus) s.scene.st.noBusT = 999; }
      dirT = 0;
      return s.id;
    },
    stats() {
      return {
        spots: SPOTS.length, active: ACTIVE.length, people: PEOPLE.length, pool: POOL.length, particles: P.n,
        ms: +ST.ms.toFixed(3), msAvg: +ST.msAvg.toFixed(3), ms2d: +ST.ms2d.toFixed(3), ms3d: +ST.ms3d.toFixed(3), r: Math.round(actRadius()),
        activations: ST.activations, handedBack: ST.handedBack, haircuts: ST.haircuts, buses: ST.buses, ownBuses: ST.ownBuses, boarded: ST.boarded, whistles: ST.whistles, sfSpots: ST.sfSpots, busGaveUp: ST.busGaveUp, busGaveUpBy: ST.busGaveUpBy,
        s3d: G3.scenes.size, s3dBuilt: G3.built, layer3d: G3.ready, sfx: sfxReg,
        kinds: SPOTS.reduce((o, s) => { const k = s.kind === 'trade' ? 'trade:' + s.sub : s.kind; o[k] = (o[k] || 0) + 1; return o; }, {}),
      };
    },
    rebuild() { resetAll(); buildSpots(); },
    reset: resetAll,
    setOptions(o) { for (const k of ['particles', 'barks', 'sounds']) if (o && o[k] != null) TUNE[k] = !!o[k]; return Object.assign({}, TUNE); },
    _debug: { P, ACTIVE, PEOPLE, SPOTS, G3, levelOf, layoutOf, emit },
  });
})();
