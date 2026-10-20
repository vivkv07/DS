/* NOSTALGIA — funfair.js  (owner: party games developer) — NUMAISH: the fair games, the rides, the snacks and toys
 *
 * The All India Industrial Exhibition at Nampally (`nampally_exhibition`), 1 Jan – 15 Feb (seasons flag 'numaish'),
 * open 16:00–22:30 (the shops.js Numaish hours). Everything here plays SOLO (AI friends Immu, Ayesha, Pappu play
 * beside you) and with FRIENDS in an online room (src/party.js, BINDING contract; registered when N.party exists).
 *
 * STALL GAMES (DOM canvas minigames through N.minigames.register; real input: keys, mouse, touch; autoplay bot):
 *   ff_rings   RING TOSS: five rings onto goli-soda bottles and prize blocks. Aim (← → / mouse / drag), hold to swing the
 *              power, release; the ring wobbles in flight and on the rim before it drops (or bounces off). ₹3
 *   ff_cans    TIN-CAN PYRAMID: ten painted cans 4-3-2-1 on a plank, three cloth balls; aim + wind-up, the reticle wobbles
 *              more the harder you throw; cans topple and knock each other off. ₹2
 *   ff_darts   BALLOON DARTS: a board of balloons, five darts (darts, never guns); the aim sways, tap to throw; gold
 *              balloons are worth more. ₹3
 *   Fair challenge (ff_challenge): the three in a row, points totalled (party: the "Fair challenge" score game). ₹7
 *   Prizes are fair trinkets kept in THE TIN (N.tape.addToken): a plastic whistle (also a toy you can blow), a paper
 *   fan, a kite, a pencil box. No gambling framing anywhere: you pay for the go, you win a trinket for skill.
 * RIDES (in the world, both views, ride camera: 2D camera override; 3D the camera follows the rider entity, which sits
 *   at the seat height through e.z; friends in the same gondola / boat / cups / coach, AI or party players):
 *   giant wheel (the landmark; its 2D and 3D wheels are kept turning in step, the group photo at the top goes into the
 *   tin and the Journal), the Columbus swing boat (screams, the stomach drop), the merry-go-round (the seasons.js
 *   carousel), the cup-and-saucer spinner (ACTION spins your cup faster), DASHING CARS (bumper cars you drive; friends
 *   bump each other in party mode), the toy train (seasons.js train loop), the maut ka kuan show (watch from the gallery).
 * SNACKS AND TOYS (carts in the main lane, bought through shops.js): boiled peanuts in a paper cone, candy floss (buddhi
 *   ke baal), roasted bhutta, kulfi, Delhi papad; a bubble blower (blow bubbles in the world: they drift on N.wind; room
 *   friends see them), a balloon on a stick, a paper windmill (phirki), a plastic whistle, a toy flute. The held toy or
 *   snack shows in Chinnu's hand (2D sprite, 3D prop / balloon); room friends see each other's balloons and toys.
 *
 * WHERE: placed in free spots of the fair (never on festivals3d.js / seasons.js stall rows: their layout data
 *   N.seasons.layout.numaish() is read, not edited): the games alley between the giant wheel and the first stall row, the
 *   Columbus north of the wheel, the dashing cars north of the food court, the cups east of it, the two carts in the main
 *   lane; the giant wheel, carousel, toy train and well are the existing ones. E prompts (N.interact, priority 4, r 9;
 *   rides and games are held while a mission runs).
 *
 * API  N.funfair = {
 *   play(game, params) -> Promise<result>     'rings' | 'cans' | 'darts' (minigame ids ff_rings / ff_cans / ff_darts)
 *   challenge(params) -> Promise<{total, games}>   the three games in a row
 *   ride(id, {ctx, riders, solo}) -> bool     'wheel' | 'columbus' | 'carousel' | 'cups' | 'bumper' | 'train' | 'maut'
 *   rideState() -> {id, phase, t, secs, seat, riders, bumps, photo} | null      stopRide(reason)
 *   buy(rowId) -> {ok, why}                   through N.shops (hidden rows on nampally_exhibition)
 *   toys: {held, owned(), hold(id | null), use(), cycle()}     bubbles() -> live count     snack (held snack)
 *   prizes() -> [token ids]   photos() -> [{t, names, img}]   spots() -> the stall / ride positions   open() (fair on + open)
 *   TUNE, RIDES, PRICES, _debug
 * }
 * Events: 'funfair:prize' {id, game}, 'funfair:ride' {id, phase}, 'funfair:photo' {names}, 'funfair:bubbles' {n, remote},
 *   'funfair:buy' {row}, 'funfair:game' {game, score}.
 *
 * HOOKS (files this module does not own; public APIs only, nothing edited):
 *   - shops.js: N.shops.addRow('nampally_exhibition', {id: 'ff_*', hidden, price, act}) — every go, ride, snack and toy is a
 *     (hidden) row of the Numaish card, bought with N.shops.buy (money, hours, 'shop:buy' stay in shops.js).
 *   - seasons.js: reads N.seasons.layout.numaish() (carousel, train) and numaishState() (their live angles). Two marked
 *     [funfair hook]s on that layout object (seasons.js itself is not edited): our footprints (rides with their swing room
 *     and entrances, the strip in front of the stall counters, the carts) are pushed onto its crowd `avoid` list, and in
 *     the 2D view only, `strings` reads a thinned copy (fewer bulbs, so fewer soft glow sprites, over our rides, the food
 *     court and the lane canopy) so each ride reads as a shape at night; the 3D view still gets seasons.js's own list.
 *     2D signboards are drawn on the 'fx' layer (above the crowd and the light) on a dark plate.
 *   - places_art.js / view3d_landmarks.js: the giant wheel. Its 2D angle is followed (the same 0.12 rad/s, only while
 *     N.placesArt.variant('giant_wheel') is 'open'); the 3D wheel sub-group ('wheel' in the landmark's userData.lm3d.subs)
 *     is set to the same angle every frame, so the gondolas match in both views.
 *   - online.js (party hook): N.online.channelSend('ff_bub' | 'ff_toy', data) / onMessage(fn) for bubbles and held toys
 *     seen by room friends; ghosts of friends riding with you are hidden while their rider sits in your gondola.
 *   - view3d.js: registerLayer('funfair'), registerActorRenderer('ff:none'); riders are kind 'ffrider' entities with
 *     view3d 'ped' (view3d_actors.js draws them seated, e.idle 'sit', at e.z).
 *   - storycore.js: N.tape.addToken (prizes, the group photo). menus.js: N.menus.addJournalTab('numaish', ...).
 *   - audio.js: N.audio.ext.registerSfx (ff_* sounds).
 * Perf: 2D props are queued only in view; the 3D site is built once (merged meshes) within ~700 u and disposed beyond.
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
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function toast(t, ms) { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2600); } catch (e) { /* ignore */ } }
  function sfx(name, o) { try { return !!(N.audio && N.audio.sfx && N.audio.sfx(name, o || { ui: true })); } catch (e) { return false; } }
  function sfxAt(name, x, y, o) { return sfx(name, Object.assign({ x, y }, o || {})); }
  const mins = () => (N.clock && isFinite(N.clock.minutes) ? N.clock.minutes : 720);
  const mode = () => (N.state && N.state.mode) || 'boot';
  const is3D = () => !!(N.view3d && N.view3d.active);
  const MGH = () => N.minigames && N.minigames.helpers;
  const VS = () => (N.view3d && N.view3d.VS) || 1.5;

  /* ================================================================ tuning */
  const TUNE = {
    rideScale: 1,          // tests: run the rides faster (the giant wheel then turns on its own clock)
    wheelSpeed: 0.12,      // rad/s: the speed places_art / view3d_landmarks turn the giant wheel at
    near3d: 700, nearInteract: 12, bubbleCap: 140, bubbleLife: [4, 8],
    rides: { wheel: 52, columbus: 30, carousel: 30, cups: 26, bumper: 45, train: 40, maut: 30 },
  };

  /* ================================================================ the fair layout (world units) */
  // Offsets from the exhibition grounds' top-left (seasons.js lays its rows out the same way), so the spots follow the
  // map. Free ground there (checked against the seasons layout's `avoid` rects, the landmarks and the trees): the strip
  // between the giant wheel and the first big stall row, north of the wheel, north of the food court, east of it, and the
  // two edges of the main lane.
  const SP = { built: false };
  function grounds() {
    try { const L = N.seasons && N.seasons.layout && N.seasons.layout.numaish(); if (L && L.g) return L.g; } catch (e) { /* ignore */ }
    const D = N.WORLD_DATA, pk = D && D.parks && D.parks.find((p) => p.id === 'exhibition_grounds');
    if (!pk) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of pk.poly) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    return [x0, y0, x1, y1];
  }
  function lmById(id) { const D = N.WORLD_DATA; return (D && D.landmarks && D.landmarks.find((l) => l.id === id)) || null; }
  function buildSpots() {
    const g = grounds();
    SP.built = true; SP.ok = !!g;
    if (!g) return SP;
    const [x0, y0, x1, y1] = g;
    SP.g = g; SP.cx = (x0 + x1) / 2; SP.cy = (y0 + y1) / 2;
    // the games alley: three stalls, backs to the first big stall row, fronts facing north (towards the wheel)
    SP.stalls = [
      { id: 'rings', game: 'ff_rings', name: 'RING TOSS', x: x0 + 15, y: y0 + 77, w: 15, d: 8, col: '#c8302a', col2: '#f2c230' },
      { id: 'cans', game: 'ff_cans', name: 'TIN CANS', x: x0 + 31.5, y: y0 + 77, w: 15, d: 8, col: '#2a5cb8', col2: '#f8f0e0' },
      { id: 'darts', game: 'ff_darts', name: 'BALLOONS', x: x0 + 48, y: y0 + 77, w: 15, d: 8, col: '#2a8c3a', col2: '#ffe060' },
    ];
    for (const s of SP.stalls) { s.cx = s.x + s.w / 2; s.cy = s.y + s.d / 2; s.ix = s.cx; s.iy = s.y - 6; }
    // the Columbus swing boat (pivot axle north-south; the boat swings east-west)
    SP.columbus = { x: x0 + 48, y: y0 + 21, len: 26, wid: 7, hp: 22, rs: 14, ix: x0 + 48, iy: y0 + 37 };
    // dashing cars: the arena north of the food court
    SP.bumper = { x: x0 + 77, y: y0 + 17, w: 48, d: 18, ix: x0 + 129, iy: y0 + 26, n: 8 };
    // cup-and-saucer east of the food court
    SP.cups = { x: x0 + 145, y: y0 + 63, r: 10, ix: x0 + 139, iy: y0 + 51 };
    // the two carts in the main lane (snacks on the north edge, toys on the south edge)
    SP.carts = [
      { id: 'snacks', name: 'MOONGPHALI · CANDY', x: x0 + 127, y: y0 + 107, a: Math.PI / 2, ix: x0 + 127, iy: y0 + 113, col: '#e8641a' },
      { id: 'toys', name: 'KHILONE', x: x0 + 99, y: y0 + 123, a: -Math.PI / 2, ix: x0 + 99, iy: y0 + 117, col: '#2a5cb8' },
    ];
    // the existing rides
    const W = lmById('giant_wheel'), M = lmById('maut_ka_kuan');
    SP.wheel = W ? { lm: W, x: W.x, y: W.y, ix: W.x + 25, iy: W.y + 14 } : null;
    SP.maut = M ? { lm: M, x: M.x, y: M.y, r: Math.min(M.w, M.d) * 0.45, H: M.h || 22, ix: M.x, iy: M.y - M.d / 2 - 6 } : null;
    let L = null; try { L = N.seasons && N.seasons.layout && N.seasons.layout.numaish(); } catch (e) { L = null; }
    // our footprints: the stalls with the strip in front of their counters, the carts and their fronts, the rides with
    // their swing / spin room and their entrances (the crowd keeps off them; the 2D bulb strings over them are thinned)
    const C = SP.columbus, B = SP.bumper, Cu = SP.cups, st0 = SP.stalls[0], st2 = SP.stalls[SP.stalls.length - 1];
    SP.keepOff = [
      [st0.x - 2, st0.y - 12, st2.x + st2.w - st0.x + 4, st0.d + 15],
      [C.x - 25, C.y - 9, 50, 18], [C.x - 5, C.y + 8, 10, 10],
      [B.x - 3, B.y - 3, B.w + 12, B.d + 6],
      [Cu.x - Cu.r - 4, Cu.y - Cu.r - 4, Cu.r * 2 + 8, Cu.r * 2 + 8], [Cu.ix - 4, Cu.iy - 4, 8, 8],
    ];
    for (const c of SP.carts) SP.keepOff.push([c.x - 8, c.y - 7, 16, 14]);
    // [funfair hook] the fair's painted crowd (seasons.js crowdDraw avoid list) keeps off our stalls, carts and rides
    if (L && Array.isArray(L.avoid) && !L.avoid.ffAdded) {
      L.avoid.ffAdded = true;
      for (const r of SP.keepOff) L.avoid.push(r.slice());
    }
    // [funfair hook] 2D only: the bulb strings over our rides, the food court and the lane canopy get fewer bulbs (and so
    // fewer of seasons.js's soft glow sprites), so at night each ride reads as a shape and not one bright blob. A getter
    // on the layout object: the 3D view (festivals3d.js builds from the same list) always sees seasons.js's own strings.
    if (L && Array.isArray(L.strings) && !L.ffStrings) thinStrings(L, SP.keepOff);
    SP.carousel = L && L.carousel ? { x: L.carousel.x, y: L.carousel.y, r: L.carousel.r, ix: L.carousel.x, iy: L.carousel.y - L.carousel.r - 5 } : null;
    SP.train = L && L.train ? Object.assign({ ix: L.train.cx + L.train.rx + 5, iy: L.train.cy - 14 }, L.train) : null;
    return SP;
  }
  const spots = () => (SP.built ? SP : buildSpots());
  function segCrosses(x0, y0, x1, y1, r) {
    for (let i = 0; i <= 24; i++) { const t = i / 24, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (x > r[0] && y > r[1] && x < r[0] + r[2] && y < r[1] + r[3]) return true; }
    return false;
  }
  function thinStrings(L, rects) {
    const orig = L.strings, fc = L.food, thin = [];
    const inFood = (x, y) => fc && x >= fc.x - 1 && y >= fc.y - 1 && x <= fc.x + fc.w + 1 && y <= fc.y + fc.d + 1;
    const fcR = fc ? [fc.x, fc.y, fc.w, fc.d] : null;
    for (const st of orig) {
      const food = !st.radial && !st.lane && inFood(st.x0, st.y0) && inFood(st.x1, st.y1);
      if (food && st.x0 !== st.x1 && st.y0 !== st.y1) continue; // the cross over the food court
      let f = 1;
      if (food) f = 0.5;
      else if (st.lane) f = 0.6;
      else if (rects.some((r) => segCrosses(st.x0, st.y0, st.x1, st.y1, r)) || (st.radial && fcR && segCrosses(st.x0, st.y0, st.x1, st.y1, fcR))) f = 0.5;
      thin.push(f < 1 ? Object.assign({}, st, { n: Math.max(3, Math.round(st.n * f)) }) : st);
    }
    let base = orig;
    L.ffStrings = { orig, thin };
    try {
      Object.defineProperty(L, 'strings', { configurable: true, enumerable: true, get: () => (is3D() ? base : thin), set: (v) => { base = v; L.ffStrings.orig = v; } });
    } catch (e) { /* a frozen layout: leave it */ }
  }

  /* ================================================================ season / hours */
  function fairOn() {
    try { if (N.seasons && N.seasons.is && N.seasons.is('numaish')) return true; } catch (e) { /* ignore */ }
    return !!(N.flags && N.flags.numaish);
  }
  function fairOpen() {
    if (!fairOn()) return false;
    try { if (N.shops && N.shops.status) { const st = N.shops.status('nampally_exhibition'); if (st) return !!st.open; } } catch (e) { /* ignore */ }
    const m = mins(); return m >= 16 * 60 && m <= 22.5 * 60;
  }
  function closedWhy() {
    if (!fairOn()) return 'Numaish is from 1 January to 15 February';
    try { const st = N.shops && N.shops.status && N.shops.status('nampally_exhibition'); if (st && !st.open) return String(st.text || 'Closed now').replace(/\*/g, ''); } catch (e) { /* ignore */ }
    return 'Opens at 4 pm';
  }

  /* ================================================================ prices: hidden rows of the Numaish card (shops.js) */
  const PRICES = {
    ff_rings: 300, ff_cans: 200, ff_darts: 300, ff_challenge: 700,
    ff_wheel: 500, ff_columbus: 500, ff_carousel: 300, ff_cups: 500, ff_bumper: 800, ff_train: 300, ff_maut: 500,
    ff_peanuts: 200, ff_candyfloss: 300, ff_bhutta: 400, ff_kulfi: 500, ff_papad: 1000,
    ff_bubbles: 500, ff_balloon: 500, ff_phirki: 300, ff_whistle: 200, ff_flute: 500,
  };
  const ROWNAME = {
    ff_rings: 'Ring toss (5 rings)', ff_cans: 'Tin cans (3 balls)', ff_darts: 'Balloon darts (5 darts)', ff_challenge: 'Fair challenge (all three)',
    ff_wheel: 'Giant wheel ride', ff_columbus: 'Columbus ride', ff_carousel: 'Merry-go-round', ff_cups: 'Cup and saucer', ff_bumper: 'Dashing cars', ff_train: 'Toy train ride', ff_maut: 'Maut ka kuan show',
    ff_peanuts: 'Boiled peanuts (paper cone)', ff_candyfloss: 'Buddhi ke baal (candy floss)', ff_bhutta: 'Roasted bhutta', ff_kulfi: 'Kulfi', ff_papad: 'Delhi papad',
    ff_bubbles: 'Bubble blower', ff_balloon: 'Balloon on a stick', ff_phirki: 'Phirki (paper windmill)', ff_whistle: 'Plastic whistle', ff_flute: 'Toy flute',
  };
  const FEED = { ff_peanuts: 8, ff_candyfloss: 6, ff_bhutta: 12, ff_kulfi: 12, ff_papad: 20 };
  let pendingAct = null; // the act a buy() runs (the row's act reads it)
  function addRows() {
    const SH = N.shops;
    if (!SH || !SH.addRow || addRows.done) return;
    addRows.done = true;
    for (const id in PRICES) {
      const row = { id, name: ROWNAME[id], price: PRICES[id], hidden: () => true, act: () => { const f = pendingAct; pendingAct = null; let r = null; try { r = f ? f() : null; } catch (e) { N.err('funfair.act:' + id, e); } return r || { close: true }; } };
      if (FEED[id]) row.feed = FEED[id];
      if (id === 'ff_candyfloss') row.status = 'sugar';
      if (id === 'ff_kulfi') row.status = 'cool';
      if (id === 'ff_bhutta') row.status = 'warm';
      SH.addRow('nampally_exhibition', row);
    }
  }
  /** pay for a row through shops.js, then run fn (the row's act); free when shops.js is missing */
  function buy(rowId, fn, o) {
    o = o || {};
    const SH = N.shops;
    if (!SH || !SH.buy || !PRICES[rowId]) { try { if (fn) fn(); } catch (e) { N.err('funfair.buy', e); } return { ok: true, paid: 0 }; }
    addRows();
    pendingAct = fn || null;
    let r = null;
    try { r = SH.buy('nampally_exhibition', rowId, { force: !!o.force }); } catch (e) { N.err('funfair.buy:' + rowId, e); r = { ok: false, why: 'Something went wrong' }; }
    pendingAct = null;
    if (!r || !r.ok) { if (!o.quiet) toast(String((r && r.why) || 'Not now').replace(/\*/g, ''), 2400); return r || { ok: false }; }
    N.emit('funfair:buy', { row: rowId, paid: r.paid });
    return r;
  }

  /* ================================================================ sounds (N.audio.ext) */
  function regSounds() {
    const X = N.audio && N.audio.ext;
    if (!X || !X.registerSfx || X.__ff) return;
    X.__ff = true;
    const P = X.P;
    X.registerSfx('ff_toss', (ac, out, t) => P.burst(ac, out, t, { kind: 'pink', ft: 'bandpass', f: 700, f2: 1500, q: 0.8, a: 0.03, h: 0.05, r: 0.18, v: 0.16 }), { cooldown: 0.05, ui: true });
    X.registerSfx('ff_ring', (ac, out, t, o) => {
      // a plastic ring on a glass bottle: a bright clink, a little rattle when it wobbles
      let e = P.strike(ac, out, t, 2300 * (o.pitch || 1), P.BELL, 0.18, 0.35);
      if (o.wobble) for (let i = 1; i < 5; i++) e = Math.max(e, P.strike(ac, out, t + i * 0.09 * (1 - i * 0.12), 2100 + i * 60, P.BELL, 0.08 / i, 0.15));
      return e;
    }, { cooldown: 0.05, ui: true });
    X.registerSfx('ff_clatter', (ac, out, t) => P.burst(ac, out, t, { kind: 'white', ft: 'bandpass', f: 1800, q: 1.4, a: 0.003, r: 0.12, v: 0.22 }), { cooldown: 0.05, ui: true });
    X.registerSfx('ff_can', (ac, out, t, o) => P.strike(ac, out, t, 520 * (o.pitch || 1), P.METAL, 0.22, 0.28), { cooldown: 0.03, ui: true });
    X.registerSfx('ff_cans', (ac, out, t) => {
      let e = t;
      for (let i = 0; i < 7; i++) e = Math.max(e, P.strike(ac, out, t + i * 0.06 + Math.random() * 0.04, 380 + Math.random() * 380, P.METAL, 0.16, 0.25));
      return Math.max(e, P.burst(ac, out, t, { kind: 'pink', ft: 'lowpass', f: 600, a: 0.005, r: 0.3, v: 0.25 }));
    }, { cooldown: 0.2, ui: true, caption: 'cans clatter' });
    X.registerSfx('ff_thud', (ac, out, t) => P.burst(ac, out, t, { kind: 'pink', ft: 'lowpass', f: 380, a: 0.003, r: 0.09, v: 0.35 }), { cooldown: 0.04, ui: true });
    X.registerSfx('ff_pop', (ac, out, t) => Math.max(P.burst(ac, out, t, { kind: 'white', ft: 'highpass', f: 900, a: 0.0008, r: 0.05, v: 0.55 }), P.burst(ac, out, t, { kind: 'pink', ft: 'lowpass', f: 300, a: 0.001, r: 0.08, v: 0.4 })), { cooldown: 0.03, ui: true, caption: 'pop!' });
    X.registerSfx('ff_dart', (ac, out, t) => Math.max(P.burst(ac, out, t, { kind: 'white', ft: 'bandpass', f: 2600, f2: 900, q: 1, a: 0.01, r: 0.1, v: 0.14 }), P.tone(ac, out, t + 0.12, { type: 'triangle', f: 180, f2: 90, a: 0.002, r: 0.05, v: 0.2 })), { cooldown: 0.04, ui: true });
    X.registerSfx('ff_bubble', (ac, out, t) => P.tone(ac, out, t, { type: 'sine', f: 1400 + Math.random() * 900, f2: 2600, glide: 0.03, a: 0.001, r: 0.04, v: 0.06 }), { cooldown: 0.02 });
    X.registerSfx('ff_blow', (ac, out, t) => P.burst(ac, out, t, { kind: 'pink', ft: 'bandpass', f: 900, q: 0.7, a: 0.08, h: 0.25, r: 0.3, v: 0.12 }), { cooldown: 0.2, ui: true });
    X.registerSfx('ff_whistle', (ac, out, t) => {
      // a cheap plastic whistle: a shrill trill (pea inside)
      const o = P.osc0(ac, 'square'); o.frequency.value = 2650;
      const lfo = P.osc0(ac, 'sine'); lfo.frequency.value = 23; const lg = P.gain(ac, 160, o.frequency); lfo.connect(lg);
      const f = P.filt(ac, 'bandpass', 2700, 3); const g = P.gain(ac, 0);
      o.connect(f); f.connect(g); g.connect(out);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.03); g.gain.setValueAtTime(0.16, t + 0.5); g.gain.linearRampToValueAtTime(0, t + 0.62);
      o.start(t); lfo.start(t); o.stop(t + 0.7); lfo.stop(t + 0.7);
      return t + 0.7;
    }, { cooldown: 0.4, ui: true, caption: 'peeeep!' });
    X.registerSfx('ff_flute', (ac, out, t, o) => {
      // a toy flute: an original little pentatonic phrase (Sa Re Ga Pa Dha), breathy
      const tune = o.tune || [0, 2, 4, 7, 4, 2, 0, 9, 7];
      const base = 587;
      let e = t;
      tune.forEach((n, i) => {
        const tt = t + i * 0.19;
        e = Math.max(e, P.tone(ac, out, tt, { type: 'sine', f: base * Math.pow(2, n / 12), a: 0.03, h: 0.1, r: 0.08, v: 0.13, vib: [5.5, 6] }));
        P.burst(ac, out, tt, { kind: 'white', ft: 'bandpass', f: base * Math.pow(2, n / 12) * 2, q: 3, a: 0.02, r: 0.08, v: 0.03 });
      });
      return e;
    }, { cooldown: 1.2, ui: true, caption: 'a little flute tune' });
    X.registerSfx('ff_wheee', (ac, out, t, o) => P.crowd(ac, out, t, { n: o.n || 6, f0: 420, spread: 5, v: 0.22, sy: [[0, 0.7, 'i', 0, 1, 5], [0.7, 0.4, 'e', 5, 0.7]] }), { cooldown: 1.2, caption: 'wheeee!' });
    X.registerSfx('ff_bump', (ac, out, t) => Math.max(P.burst(ac, out, t, { kind: 'pink', ft: 'lowpass', f: 260, a: 0.002, r: 0.14, v: 0.5 }), P.tone(ac, out, t, { type: 'triangle', f: 150, f2: 70, a: 0.002, r: 0.1, v: 0.25 }), P.burst(ac, out, t + 0.02, { kind: 'white', ft: 'highpass', f: 4000, a: 0.001, r: 0.05, v: 0.1 })), { cooldown: 0.08, caption: 'bonk!' });
    X.registerSfx('ff_buzz', (ac, out, t) => {
      // the dashing-car hum + the pole sparking on the ceiling net
      let e = P.tone(ac, out, t, { type: 'sawtooth', f: 110, a: 0.05, h: 0.4, r: 0.2, v: 0.05 });
      for (let i = 0; i < 4; i++) e = Math.max(e, P.burst(ac, out, t + Math.random() * 0.5, { kind: 'white', ft: 'highpass', f: 5000, a: 0.001, r: 0.02, v: 0.08 }));
      return e;
    }, { cooldown: 0.6 });
    X.registerSfx('ff_bike', (ac, out, t) => {
      // a motorbike on the wooden wall: a two-stroke buzz that rises and falls with each lap
      const o = P.osc0(ac, 'sawtooth'); o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(110, t + 0.6); o.frequency.linearRampToValueAtTime(75, t + 1.2);
      const f = P.filt(ac, 'lowpass', 900, 2); const g = P.gain(ac, 0);
      o.connect(f); f.connect(g); g.connect(out);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.1); g.gain.setValueAtTime(0.12, t + 1.0); g.gain.linearRampToValueAtTime(0, t + 1.25);
      o.start(t); o.stop(t + 1.3);
      return t + 1.3;
    }, { cooldown: 0.9, caption: 'motorbike roar' });
    X.registerSfx('ff_bell', (ac, out, t) => { let e = t; for (let i = 0; i < 3; i++) e = Math.max(e, P.strike(ac, out, t + i * 0.16, 1760, P.BELL, 0.2, 0.4)); return e; }, { cooldown: 0.5, ui: true, caption: 'ride bell' });
    X.registerSfx('ff_shutter', (ac, out, t) => Math.max(P.burst(ac, out, t, { kind: 'white', ft: 'bandpass', f: 3000, q: 2, a: 0.001, r: 0.03, v: 0.3 }), P.burst(ac, out, t + 0.07, { kind: 'white', ft: 'bandpass', f: 2200, q: 2, a: 0.001, r: 0.04, v: 0.25 })), { cooldown: 0.3, ui: true, caption: 'click!' });
    X.registerSfx('ff_squeak', (ac, out, t) => P.tone(ac, out, t, { type: 'sine', f: 900, f2: 1500, glide: 0.08, a: 0.005, r: 0.08, v: 0.14 }), { cooldown: 0.15, ui: true });
  }

  /* ================================================================ the AI friends + prizes (the tin) */
  const FRIENDS = [
    { id: 'immu', nick: 'Immu', skill: 0.7, look: { kind: 'kid', skin: '#c68b5e', hair: '#1a1412', shirt: '#2f8a5a', pants: '#2c3550', stripes: '#246e48', specs: true } },
    { id: 'ayesha', nick: 'Ayesha', skill: 0.82, look: { kind: 'kid', girl: true, skin: '#a0683f', hair: '#1a1412', shirt: '#d24d57', pants: '#f4f0e8', cap: 'cricket', capColor: '#1d4f91' } },
    { id: 'pappu', nick: 'Pappu', skill: 0.58, look: { kind: 'kid', skin: '#a0683f', hair: '#1a1412', shirt: '#2a8c82', pants: '#3a3a4a' } },
  ];
  const PRIZES = {
    whistle: { name: 'Plastic whistle (Numaish prize)', desc: 'One shrill note. Amma has already hidden it twice.', pts: 1, toy: 'whistle', col: '#e83a5a' },
    fan: { name: 'Paper fan (Numaish prize)', desc: 'Folded paper with painted peacocks. Opens with a snap.', pts: 2, col: '#2a8cd8' },
    kite: { name: 'Little fair kite (Numaish prize)', desc: 'A paper kite with the Numaish stamp. For the wall, not for the pech.', pts: 3, col: '#f2c230' },
    pencilbox: { name: 'Tin pencil box (Numaish first prize)', desc: 'A magnet lid and a times table inside. First prize at the stalls!', pts: 4, col: '#8a3ab8' },
  };
  const STORE = 'nostalgia.funfair.v1';
  const REC = (() => { try { const o = JSON.parse(lsGet(STORE) || 'null'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } })();
  REC.prizes = Array.isArray(REC.prizes) ? REC.prizes : [];
  REC.photos = Array.isArray(REC.photos) ? REC.photos : [];
  REC.best = REC.best && typeof REC.best === 'object' ? REC.best : {};
  function saveRec() { lsSet(STORE, JSON.stringify(REC)); }
  function givePrize(id, game) {
    const P = PRIZES[id]; if (!P) return;
    try { if (N.tape && N.tape.addToken) N.tape.addToken('ff_prize_' + id, { name: P.name, desc: P.desc }); } catch (e) { N.err('funfair.prize', e); }
    if (P.toy) { try { if (N.player && N.player.addItem) N.player.addItem('ff_' + P.toy, 1); } catch (e) { /* ignore */ } }
    if (REC.prizes.indexOf(id) < 0) REC.prizes.push(id);
    saveRec();
    N.emit('funfair:prize', { id, game });
  }
  /** the prize for a points total on a stall game (thresholds per game) */
  function prizeFor(game, score, extra) {
    const T = { ff_rings: [30, 60, 100], ff_cans: [40, 70, 150], ff_darts: [30, 50, 80] }[game] || [30, 60, 100];
    if (extra && extra.kite) return 'kite';
    if (score >= T[2]) return 'pencilbox';
    if (score >= T[1]) return 'fan';
    if (score >= T[0]) return 'whistle';
    return null;
  }

  /* ================================================================ stall games: shared parts */
  const GAME_NAMES = { ff_rings: 'Ring toss', ff_cans: 'Tin cans', ff_darts: 'Balloon darts' };
  const SHOTS = { ff_rings: 5, ff_cans: 3, ff_darts: 5 };
  // an AI friend (or a party player) playing at the next counter: same number of throws, points by skill
  function aiShot(game, r) {
    const s = r.skill, q = r.rng.next();
    if (game === 'ff_rings') { if (q < 0.06 * s) return 30 + Math.floor(r.rng.next() * 3) * 10; return q < 0.2 + s * 0.38 ? 10 + (r.rng.next() < 0.4 ? 5 : 0) : 0; }
    if (game === 'ff_cans') { const left = 10 - (r.cans || 0); const k = Math.min(left, Math.round(q * (1 + s * 4)) + (r.rng.next() < s * 0.25 ? 1 : 0)); r.cans = (r.cans || 0) + k; return k * 10 + (r.cans >= 10 && k > 0 ? 50 : 0); }
    if (game === 'ff_darts') return q < 0.3 + s * 0.45 ? (r.rng.next() < 0.15 ? 30 : 10) : 0;
    return 0;
  }
  function setupRivals(g, S, game) {
    const P = g.params, ctx = P.party, ch = P.challenge || null;
    const list = [];
    if (ctx && Array.isArray(ctx.players)) {
      ctx.players.forEach((pl) => {
        if (pl.isMe) return;
        let sk = 0.65;
        if (pl.isAI) { try { if (ctx.ai && ctx.ai.skill) sk = ctx.ai.skill(pl.uid); } catch (e) { /* ignore */ } }
        const fr = FRIENDS.find((f) => pl.npc === f.id || 'ai:' + f.id === pl.uid);
        list.push({ uid: pl.uid, nick: pl.nick || 'Friend', look: pl.look || (fr && fr.look) || {}, ai: !!pl.isAI, remote: !pl.isAI, skill: isFinite(sk) ? sk : 0.65 });
      });
      S.waitParty = typeof ctx.elapsed === 'function' && !(ch && ch.i > 0);
    } else {
      const fl = Array.isArray(P.friends) ? P.friends : FRIENDS;
      fl.forEach((f) => list.push({ uid: 'ai:' + f.id, nick: f.nick, look: f.look, ai: true, remote: false, skill: f.skill }));
    }
    S.rivals = list.slice(0, 9).map((r, i) => Object.assign(r, {
      rng: U.rng(((g.baseSeed >>> 0) + 7919 * (i + 1) + (game.length * 131)) >>> 0), n: 0, shots: SHOTS[game], left: SHOTS[game], next: 1.8 + i * 0.7, bump: 0, cans: 0,
      base: ch && ch.totals ? (ch.totals[r.uid] | 0) : 0,
    }));
    S.game = game;
    if (ctx && typeof ctx.on === 'function' && !g.ffListen) {
      g.ffListen = true;
      try {
        ctx.on('ff', (d, from) => {
          if (!d || typeof d !== 'object' || !g.S || !g.S.rivals) return;
          const uid = (from && from.uid) || d.uid;
          const r = g.S.rivals.find((q) => q.uid === uid);
          if (!r || !r.remote) return;
          const tot = clamp(+d.t || 0, 0, 9999), n = clamp(+d.n || 0, 0, 9999);
          if (d.g === g.S.game) { if (n > r.n) r.bump = 0.4; r.n = n; r.left = clamp(d.k | 0, 0, 9); }
          if (tot) r.base = Math.max(0, tot - (d.g === g.S.game ? n : 0));
        });
      } catch (e) { N.err('funfair.party.on', e); }
    }
  }
  function rivalsStep(g, S, dt) {
    for (const r of S.rivals) {
      r.bump = Math.max(0, r.bump - dt);
      if (r.remote || r.left <= 0 || S.waitParty) continue;
      r.next -= dt;
      if (r.next <= 0) {
        r.left--;
        const p = aiShot(S.game, r);
        if (p > 0) { r.n += p; r.bump = 0.4; }
        r.next = (S.game === 'ff_cans' ? 3.4 : S.game === 'ff_darts' ? 2.1 : 2.9) * (0.75 + r.rng.next() * 0.5);
      }
    }
  }
  function sendTally(g, S, force) {
    const ctx = g.params.party;
    if (!ctx || typeof ctx.send !== 'function') return;
    const key = S.score * 10 + S.left;
    S.sendT = (S.sendT || 0) - 1 / 60;
    if (!force && (key === S.lastSent || S.sendT > 0)) return;
    S.lastSent = key; S.sendT = 0.3;
    const ch = g.params.challenge;
    try { ctx.send('ff', { g: S.game, n: S.score, k: S.left, t: (ch ? ch.mine | 0 : 0) + S.score }); } catch (e) { N.err('funfair.party.send', e); }
  }
  /** the results of one stall game for the party (single games; the challenge reports its total itself) */
  function partyReport(g, S, early) {
    const ctx = g.params.party;
    if (!ctx || g.params.challenge || S.reported) return;
    S.reported = true;
    try { ctx.report(early ? { score: S.score, dnf: true } : { score: S.score, note: S.score + ' points' }); } catch (e) { N.err('funfair.party.report', e); }
    try { if (ctx.ai && ctx.ai.report && ctx.isHost) for (const r of S.rivals) if (r.ai) { while (r.left > 0) { r.left--; r.n += aiShot(S.game, r); } ctx.ai.report(r.uid, { score: r.n, note: r.n + ' points' }); } } catch (e) { N.err('funfair.party.aiReport', e); }
  }
  function waitGo(g, S) {
    if (!S.waitParty) return false;
    let e = 0;
    try { e = g.params.party.elapsed(); } catch (er) { e = 0; }
    if (isFinite(e) && e < 0) { S.waitLeft = -e / 1000; return true; }
    S.waitParty = false; S.waitLeft = 0;
    return false;
  }
  function kidTiny(c, x, y, s, look) {
    look = look || {};
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = look.shirt || '#d8402a'; MGH().rr(c, -9, -15, 18, 16, 5); c.fill();
    c.fillStyle = look.skin || '#a8703f'; c.beginPath(); c.arc(0, -22, 7.5, 0, TAU); c.fill();
    c.fillStyle = look.hair || '#1a1412'; c.beginPath(); c.arc(0, -24, 7.8, Math.PI * 1.05, Math.PI * 1.95); c.fill();
    if (look.cap) { c.fillStyle = look.capColor || '#1d4f91'; c.beginPath(); c.arc(0, -25, 7.8, Math.PI, TAU); c.fill(); }
    c.fillStyle = '#1a1214'; c.beginPath(); c.arc(-2.6, -22, 1.1, 0, TAU); c.arc(2.6, -22, 1.1, 0, TAU); c.fill();
    c.restore();
  }
  function drawStrip(g, ctx, S, y0) {
    const H = MGH(), n = S.rivals.length;
    if (!n) return 0;
    const W = g.W, h = 50, w = Math.min(124, (W - 16 - (n - 1) * 6) / n), x0 = (W - (w * n + (n - 1) * 6)) / 2;
    const ch = g.params.challenge;
    S.rivals.forEach((r, i) => {
      const x = x0 + i * (w + 6), y = y0;
      const tot = (ch ? r.base : 0) + r.n, mine = (ch ? ch.mine | 0 : 0) + S.score;
      ctx.fillStyle = 'rgba(18,13,22,0.8)'; H.rr(ctx, x, y, w, h, 8); ctx.fill();
      ctx.strokeStyle = tot > mine ? '#ff8a5a' : 'rgba(242,194,48,0.55)'; ctx.lineWidth = 2; H.rr(ctx, x, y, w, h, 8); ctx.stroke();
      kidTiny(ctx, x + 16, y + h - 5, h / 62, r.look);
      const b = 1 + r.bump;
      ctx.save(); ctx.translate(x + w * 0.66, y + h * 0.56); ctx.scale(b, b);
      H.text(ctx, String(tot), 0, 0, { font: 'display', size: 20, color: tot > mine ? '#ffb08a' : '#ffd84a', outline: 3 });
      ctx.restore();
      H.text(ctx, r.nick, x + w * 0.55, y + 9, { font: 'body', weight: 800, size: 12, color: '#f4ead8', maxW: w - 30 });
      for (let k = 0; k < r.shots; k++) { ctx.fillStyle = k < r.left ? '#f2c230' : 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(x + 32 + k * 7, y + h - 7, 2.4, 0, TAU); ctx.fill(); }
    });
    return h + 6;
  }
  function drawWait(g, ctx, S) {
    if (!(S.waitParty && S.waitLeft > 0)) return;
    const H = MGH(), A = g.area;
    ctx.fillStyle = 'rgba(18,13,22,0.55)'; ctx.fillRect(0, A.y, g.W, A.h);
    H.text(ctx, 'GET READY', g.W / 2, A.y + A.h * 0.42, { font: 'display', size: 38, color: '#ffd84a', outline: 6 });
    H.text(ctx, String(Math.ceil(S.waitLeft)), g.W / 2, A.y + A.h * 0.56, { font: 'display', size: 62, color: '#f4efe2', outline: 7 });
  }
  function bulbsRow(ctx, x0, x1, y, t, n) {
    const cols = ['#ff5040', '#ffe040', '#50ff80', '#50a0ff', '#ff60e0'];
    ctx.strokeStyle = 'rgba(30,20,20,0.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x0, y);
    for (let i = 1; i <= n; i++) { const xx = lerp(x0, x1, i / n); ctx.quadraticCurveTo(lerp(x0, x1, (i - 0.5) / n), y + 7, xx, y); }
    ctx.stroke();
    for (let i = 0; i <= n; i++) {
      const xx = lerp(x0, x1, i / n), on = Math.sin(t * 5 + i * 1.3) > -0.3;
      ctx.fillStyle = on ? cols[i % cols.length] : 'rgba(80,60,60,0.8)'; ctx.beginPath(); ctx.arc(xx, y + 3, 3, 0, TAU); ctx.fill();
      if (on) { ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(xx, y + 3, 8, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    }
  }
  function stallBack(g, ctx, S, title, col, col2) {
    // a cloth back wall with a striped canopy and a painted sign (cached per size)
    const H = MGH(), W = g.W, Hh = g.H, A = g.area, d = g.dpr;
    const key = W + 'x' + Hh + ':' + d + ':' + A.y + ':' + A.h + ':' + (S.stripH || 0);
    if (S.bgKey !== key) {
      S.bgKey = key;
      const c0 = (S.bg = S.bg || H.canvas(1, 1)); c0.width = Math.round(W * d); c0.height = Math.round(Hh * d);
      const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      let gr = c.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#2a1830'); gr.addColorStop(1, '#120d16');
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      const top = A.y + (S.stripH || 0);
      // canopy stripes
      const sw = Math.max(18, W / 18);
      for (let x = 0, i = 0; x < W; x += sw, i++) { c.fillStyle = i % 2 ? col2 : col; c.beginPath(); c.moveTo(x, top); c.lineTo(x + sw, top); c.lineTo(x + sw, top + 26); c.quadraticCurveTo(x + sw / 2, top + 36, x, top + 26); c.fill(); }
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, top + 26, W, 4);
      // back cloth
      gr = c.createLinearGradient(0, top + 30, 0, A.y + A.h); gr.addColorStop(0, U.shade(col, 0.55)); gr.addColorStop(1, U.shade(col, 0.3));
      c.fillStyle = gr; c.fillRect(0, top + 30, W, A.y + A.h - top - 30);
      c.fillStyle = 'rgba(255,255,255,0.04)'; for (let x = 0; x < W; x += 22) c.fillRect(x, top + 30, 9, A.y + A.h - top - 30);
      const sgw = Math.min(W * 0.7, 360), sgh = Math.max(30, Math.min(44, A.h * 0.07));
      H.sign(c, (W - sgw) / 2, top + 34, sgw, sgh, { fill: col2, text: title, color: U.shade(col, 0.6), size: sgh * 0.6 });
      S.signBottom = top + 34 + sgh;
    }
    ctx.drawImage(S.bg, 0, 0, W, Hh);
  }
  function prizeShelf(g, ctx, S, y, h) {
    // the trinkets on display: whistle, paper fan, kite, pencil box
    const H = MGH(), W = g.W, n = 4, w = Math.min(W * 0.18, 86), gap = Math.min(16, W * 0.03), x0 = (W - (w * n + gap * (n - 1))) / 2;
    ctx.fillStyle = '#7a5030'; ctx.fillRect(x0 - 10, y + h, w * n + gap * (n - 1) + 20, 5);
    ['whistle', 'fan', 'kite', 'pencilbox'].forEach((id, i) => { const x = x0 + i * (w + gap) + w / 2; drawTrinket(ctx, id, x, y + h * 0.55, Math.min(w, h) * 0.42, S.t || 0); });
    H.text(ctx, 'PRIZES', x0 - 2, y + 4, { font: 'osd', size: 13, color: '#ffd84a', align: 'left' });
  }
  function drawTrinket(c, id, x, y, s, t) {
    c.save(); c.translate(x, y);
    if (id === 'whistle') {
      c.rotate(-0.3); c.fillStyle = '#e83a5a'; MGH().rr(c, -s, -s * 0.3, s * 1.4, s * 0.6, s * 0.2); c.fill();
      c.beginPath(); c.arc(s * 0.4, 0, s * 0.42, 0, TAU); c.fill(); c.fillStyle = '#1a1214'; c.fillRect(-s, -s * 0.12, s * 0.25, s * 0.24);
      c.strokeStyle = '#f2c230'; c.lineWidth = 1.5; c.beginPath(); c.arc(s * 0.4, s * 0.1, s * 0.7, 0.5, 2.6); c.stroke();
    } else if (id === 'fan') {
      for (let i = 0; i < 7; i++) { const a = -PI * 0.85 + i * (PI * 0.7 / 6); c.fillStyle = i % 2 ? '#2a8cd8' : '#f4f0e0'; c.beginPath(); c.moveTo(0, s * 0.6); c.arc(0, s * 0.6, s * 1.3, a, a + PI * 0.7 / 6); c.fill(); }
      c.fillStyle = '#2a8a5a'; c.beginPath(); c.arc(0, -s * 0.2, s * 0.22, 0, TAU); c.fill();
    } else if (id === 'kite') {
      c.rotate(Math.sin(t * 2) * 0.08);
      c.fillStyle = '#f2c230'; c.beginPath(); c.moveTo(0, -s * 1.1); c.lineTo(s * 0.8, 0); c.lineTo(0, s * 1.1); c.lineTo(-s * 0.8, 0); c.closePath(); c.fill();
      c.fillStyle = '#d8302a'; c.beginPath(); c.moveTo(0, -s * 1.1); c.lineTo(s * 0.8, 0); c.lineTo(0, 0); c.closePath(); c.fill();
      c.strokeStyle = '#5a3a1a'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -s * 1.1); c.lineTo(0, s * 1.1); c.moveTo(-s * 0.8, 0); c.quadraticCurveTo(0, -s * 0.5, s * 0.8, 0); c.stroke();
      c.fillStyle = '#d8302a'; c.beginPath(); c.moveTo(0, s * 1.1); c.lineTo(-s * 0.2, s * 1.45); c.lineTo(s * 0.2, s * 1.45); c.fill();
    } else if (id === 'pencilbox') {
      c.fillStyle = '#8a3ab8'; MGH().rr(c, -s * 1.1, -s * 0.45, s * 2.2, s * 0.9, s * 0.15); c.fill();
      c.fillStyle = '#f2c230'; c.fillRect(-s * 1.1, -s * 0.12, s * 2.2, s * 0.08);
      c.fillStyle = '#f4f0e0'; c.font = 'bold ' + Math.round(s * 0.42) + 'px sans-serif'; c.textAlign = 'center'; c.fillText('2 x 2', 0, s * 0.32);
    }
    c.restore();
  }

  /* ================================================================ RING TOSS */
  const RINGS = {
    id: 'ff_rings', title: 'Ring Toss', sub: 'Numaish. Five rings, a table full of goli-soda bottles and prizes.', osd: 'NUMAISH · RING TOSS',
    place: 'nampally_exhibition', places: ['nampally_exhibition'], secs: 40, goLabel: 'PHENKO!',
    keys: { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'throw', ArrowUp: 'throw', KeyW: 'throw', Enter: 'throw' },
    buttons: () => [{ a: 'left', label: '◀', sub: 'AIM' }, { a: 'throw', label: 'PHENKO!', sub: 'HOLD · LET GO', cls: 'big' }, { a: 'right', label: '▶', sub: 'AIM' }],
    keyHint: () => '<kbd>←</kbd><kbd>→</kbd> aim · hold <kbd>Space</kbd> and let go at the right power (or move the mouse and hold the button)',
    howto(g) {
      return {
        lines: [
          'Aim the ring at a bottle or a prize block. <b>Hold</b> to swing the power, <b>let go</b> to throw. Far rows need more power.',
          'Your hand wobbles a little and so does the ring: a ring that lands on the rim rattles before it drops in (or falls off).',
          'Ring a <b>prize block</b> to win that trinket. Bottles score 10 (15 at the back).',
        ],
        goal: 'FIVE RINGS · PRIZES FOR 30 / 60 / 100 POINTS',
        keys: '<kbd>←</kbd><kbd>→</kbd> aim &nbsp;·&nbsp; hold <kbd>Space</kbd>, release to throw',
        touch: 'Slide a finger to aim, lift at the right power (or ◀ ▶ and hold <b>PHENKO!</b>)',
      };
    },
    setup(g) {
      const S = g.S;
      setupRivals(g, S, 'ff_rings');
      S.t = 0; S.score = 0; S.left = 5; S.aim = 0; S.wob = 0; S.power = 0; S.charging = false; S.chargeT = 0; S.fly = null; S.done = []; S.flat = [];
      S.won = []; S.end = false; S.endT = 0;
      // targets: 4 rows x 5 columns of bottles; four prize blocks in seeded spots (whistle near, pencil box at the back)
      S.targets = [];
      const rng = g.rng;
      const prizeCells = { 1: [['whistle', rng.next() < 0.5 ? 1 : 3]], 2: [['fan', rng.next() < 0.5 ? 0 : 4]], 3: [['kite', rng.next() < 0.5 ? 1 : 3], ['pencilbox', 2]] };
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
        const pz = (prizeCells[r] || []).find((q) => q[1] === c);
        const u = (c - 2) * 0.36 + (r % 2 ? 0.09 : -0.09), v = 0.22 + r * 0.22;
        S.targets.push({ u, v, r, c, prize: pz ? pz[0] : null, col: ['#3a8a4a', '#6a4a2a', '#2a6a7a'][(r + c) % 3], ringed: false });
      }
      S.wind = [];
      for (let i = 0; i < 5; i++) S.wind.push((rng.next() - 0.5) * 0.06);
    },
    layout(g) { const S = g.S; S.bgKey = null; S.stripH = S.rivals.length ? 56 : 0; },
    update(g, dt) {
      const S = g.S;
      if (waitGo(g, S)) return;
      S.t += dt;
      rivalsStep(g, S, dt);
      const steer = (g.down('right') ? 1 : 0) - (g.down('left') ? 1 : 0);
      if (steer) S.aim = clamp(S.aim + steer * dt * 0.75, -0.55, 0.55);
      if (S.ptrAim != null && isFinite(S.ptrAim)) S.aim += (S.ptrAim - S.aim) * Math.min(1, dt * 14);
      if (!S.fly && S.left > 0 && !S.end) {
        // a press made while the last ring was still in the air (or rattling) starts the swing as soon as it is down
        if (!S.charging && (g.pressed('throw') || g.down('throw'))) { S.charging = true; S.chargeT = 0; }
        if (S.charging) { S.chargeT += dt; S.power = 0.5 - 0.5 * Math.cos(S.chargeT * PI / 0.75); }
        if (S.charging && (g.released('throw') || !g.down('throw'))) { S.charging = false; throwRing(g, S); }
      }
      if (S.fly) flyRing(g, S, dt);
      if (S.left <= 0 && !S.fly && !S.end) { S.endT += dt; if (S.endT > 0.8) endStall(g, S, 'ff_rings'); }
      sendTally(g, S, false);
    },
    idle(g, dt) { if (g.S) g.S.t += dt; },
    pointer(g, type, x, y, id) {
      const S = g.S, L = S.L; if (!L) return;
      if (type === 'move' || type === 'down') S.ptrAim = clamp(Math.atan2(x - L.hx, L.hy - y) * 0.9, -0.55, 0.55);
      if (type === 'down') { S.ptrId = id; g.press('throw', 'ptr'); }
      if (type === 'up' && S.ptrId === id) { S.ptrId = null; g.release('throw', 'ptr'); }
    },
    bot(g, dt, want) {
      const S = g.S;
      if (S.fly || S.left <= 0 || S.end || S.waitParty) return;
      if (!S.botT) {
        const free = S.targets.filter((q) => !q.ringed);
        const pick = want === 'lose' ? null : (free.find((q) => q.prize === 'kite') || free.find((q) => q.prize) || free[0]);
        S.botT = pick ? { u: pick.u, v: pick.v } : { u: 1.4, v: 1.2 };
        const wind = S.wind[5 - S.left] || 0;
        // landing: v = 0.08 + 0.98 * power, u = tan(aim) * (v + 0.12) + wind
        S.botP = clamp((S.botT.v - 0.08) / 0.98, 0, 1);
        S.botA = Math.atan((S.botT.u - wind) / (S.botT.v + 0.12));
      }
      S.ptrAim = S.botA - S.wob;
      if (!S.charging) { g.botHold('throw', true); return; }
      if (S.power >= S.botP - 0.004 || S.chargeT >= 0.74) { g.botHold('throw', false); S.botT = null; }
    },
    hud(g) { const S = g.S; return [{ k: 'RINGS', v: S.left }, { k: 'POINTS', v: S.score, good: S.score > 0 }]; },
    draw(g, ctx) { drawRings(g, ctx, g.S); },
    result(g, r) { return stallResult(g, r, 'Ring toss'); },
    stars(g, r) { return r.score >= 100 ? 3 : r.score >= 60 ? 2 : r.score >= 30 ? 1 : 0; },
    cleanup(g) { if (g.S && !g.S.end) partyReport(g, g.S, true); },
  };
  function ringLand(S, aim, power, wind) { const v = -0.12 + 0.2 + power * 0.98; return { u: Math.tan(aim) * (v + 0.12) + wind, v }; }
  function throwRing(g, S) {
    const k = 5 - S.left;
    S.left--;
    const wob = S.wob || 0;
    const land = ringLand(S, S.aim + wob, S.power, S.wind[k] || 0);
    S.fly = { t: 0, dur: 0.62, u0: 0, v0: -0.12, u1: land.u, v1: land.v, spin: (g.rng.next() - 0.5) * 8, phase: 'air', settle: 0, target: null, res: null };
    g.sfx('ff_toss');
    S.power = 0;
  }
  function flyRing(g, S, dt) {
    const F = S.fly, L = S.L;
    if (F.phase === 'air') {
      F.t += dt / F.dur;
      if (F.t < 1) return;
      F.t = 1;
      // where did it land?
      let best = null, bd = 9;
      for (const q of S.targets) { if (q.ringed) continue; const d = Math.hypot(F.u1 - q.u, (F.v1 - q.v) * 1.5); if (d < bd) { bd = d; best = q; } }
      const tol = best && best.prize ? 0.07 : 0.085;
      if (F.v1 > 1.04) { F.phase = 'gone'; F.settle = 0.5; g.pop('PEECHE GIRA!', L.cx, L.yFar - 18, { size: 18, color: '#d8d0c0', font: 'body' }); g.sfx('ff_clatter'); return; }
      if (best && bd < tol * 0.5) { F.phase = 'in'; F.target = best; F.settle = 0.35; }
      else if (best && bd < tol) { F.phase = 'rim'; F.target = best; F.settle = 0.85; F.inChance = 1 - (bd / tol - 0.5) * 2; g.sfx('ff_ring', { ui: true, wobble: true }); }
      else { F.phase = 'flat'; F.settle = 0.4; g.sfx('ff_clatter'); }
      return;
    }
    F.settle -= dt;
    if (F.settle > 0) return;
    const q = F.target;
    if (F.phase === 'rim') { F.phase = g.rng.next() < F.inChance ? 'in' : 'flat'; if (F.phase === 'flat') { F.u1 += (g.rng.next() - 0.5) * 0.12; F.v1 += 0.05; g.sfx('ff_clatter'); g.pop('ARRE!', projU(S, F.u1, F.v1).x, projU(S, F.u1, F.v1).y - 30, { size: 18, color: '#ffb08a', font: 'body' }); } }
    if (F.phase === 'in' && q) {
      q.ringed = true;
      const pts = q.prize ? { whistle: 20, fan: 30, kite: 40, pencilbox: 50 }[q.prize] : 10 + (q.r >= 2 ? 5 : 0);
      S.score += pts;
      const p = projU(S, q.u, q.v);
      g.sfx('ff_ring', { ui: true, pitch: q.prize ? 1.3 : 1 });
      g.burst(p.x, p.y - 20, q.prize ? 22 : 12, { colors: ['#ffd84a', '#ff6a8a', '#7ad8ff', '#fff'], speed: 160, life: 0.8, size: 3.5, kind: q.prize ? 'paper' : 'dot' });
      g.pop(q.prize ? 'PRIZE! +' + pts : 'RINGER! +' + pts, p.x, p.y - 34, { size: q.prize ? 26 : 22, color: '#ffd84a' });
      if (q.prize) { S.won.push(q.prize); g.flash('#fff6c0', 0.25); }
    } else if (F.phase === 'flat' || F.phase === 'gone') {
      if (F.phase === 'flat') S.flat.push({ u: F.u1, v: F.v1, a: g.rng.next() * TAU });
      if (F.phase !== 'gone') { const p = projU(S, F.u1, F.v1); g.pop('miss', p.x, p.y - 22, { size: 16, color: '#d8d0c0', font: 'body' }); }
    }
    S.fly = null;
  }
  function projU(S, u, v) {
    const L = S.L;
    const y = v < 0 ? L.yNear - v * (L.yNear - L.yFar) * 0.9 : lerp(L.yNear, L.yFar, Math.pow(Math.min(v, 1.2), 0.85));
    const hw = lerp(L.hwNear, L.hwFar, clamp(v, 0, 1.2));
    return { x: L.cx + u * hw, y, s: lerp(1, 0.58, clamp(v, 0, 1.2)) };
  }
  function layRings(g, S) {
    const A = g.area, W = g.W, P = g.portrait;
    const top = A.y + (S.stripH || 0);
    const L = (S.L = {});
    L.cx = W / 2; L.yFar = top + (A.y + A.h - top) * (P ? 0.36 : 0.4); L.yNear = A.y + A.h * (P ? 0.76 : 0.8);
    L.hwNear = Math.min(W * (P ? 0.47 : 0.36), (L.yNear - L.yFar) * 1.25); L.hwFar = L.hwNear * 0.58;
    L.hx = W / 2; L.hy = A.y + A.h * 0.93; L.unit = L.hwNear;
    return L;
  }
  function drawBottle(c, x, y, s, col, ringed) {
    const w = 7 * s, h = 26 * s;
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(x, y, w * 1.1, w * 0.4, 0, 0, TAU); c.fill();
    const gr = c.createLinearGradient(x - w, 0, x + w, 0); gr.addColorStop(0, U.shade(col, 0.7)); gr.addColorStop(0.35, U.shade(col, 1.5)); gr.addColorStop(1, U.shade(col, 0.6));
    c.fillStyle = gr; MGH().rr(c, x - w, y - h * 0.62, w * 2, h * 0.62, w * 0.5); c.fill();
    c.beginPath(); c.moveTo(x - w * 0.8, y - h * 0.6); c.quadraticCurveTo(x - w * 0.4, y - h * 0.85, x - w * 0.32, y - h); c.lineTo(x + w * 0.32, y - h); c.quadraticCurveTo(x + w * 0.4, y - h * 0.85, x + w * 0.8, y - h * 0.6); c.closePath(); c.fill();
    c.fillStyle = 'rgba(200,240,255,0.7)'; c.beginPath(); c.arc(x, y - h * 0.86, w * 0.26, 0, TAU); c.fill(); // the goli in the neck
    if (ringed) ringShape(c, x, y - h * 0.55, s, '#ff4a8a');
  }
  function ringShape(c, x, y, s, col) {
    c.strokeStyle = col; c.lineWidth = Math.max(2, 3.2 * s);
    c.beginPath(); c.ellipse(x, y, 10.5 * s, 4 * s, 0, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = Math.max(1, 1 * s); c.beginPath(); c.ellipse(x, y - 1, 10 * s, 3.5 * s, 0, PI * 1.1, PI * 1.6); c.stroke();
  }
  function drawRings(g, ctx, S) {
    const H = MGH(), W = g.W, A = g.area;
    layRings(g, S);
    stallBack(g, ctx, S, 'RING TOSS · 5 RINGS', '#c8302a', '#f2c230');
    const L = S.L;
    if (S.signBottom && L.yFar - S.signBottom > 50) prizeShelf(g, ctx, S, S.signBottom + 6, Math.min(56, L.yFar - S.signBottom - 18));
    bulbsRow(ctx, 8, W - 8, (A.y + (S.stripH || 0)) + 30, S.t, Math.round(W / 40));
    // the table (green felt) in perspective
    const n0 = projU(S, -1.15, -0.04), n1 = projU(S, 1.15, -0.04), f0 = projU(S, -1.15, 1.06), f1 = projU(S, 1.15, 1.06);
    ctx.fillStyle = '#2f6a3a'; ctx.beginPath(); ctx.moveTo(n0.x, n0.y); ctx.lineTo(n1.x, n1.y); ctx.lineTo(f1.x, f1.y); ctx.lineTo(f0.x, f0.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#6a4024'; ctx.fillRect(n0.x, n0.y, n1.x - n0.x, Math.max(10, A.h * 0.03));
    // rings lying on the table
    for (const f of S.flat) { const p = projU(S, f.u, f.v); ringShape(ctx, p.x, p.y, p.s, '#ff4a8a'); }
    // targets, far rows first
    const list = S.targets.slice().sort((a, b) => b.v - a.v);
    for (const q of list) {
      const p = projU(S, q.u, q.v);
      if (q.prize) {
        const s = p.s;
        ctx.fillStyle = '#b8864a'; ctx.fillRect(p.x - 9 * s, p.y - 12 * s, 18 * s, 12 * s); ctx.fillStyle = '#d8a86a'; ctx.fillRect(p.x - 9 * s, p.y - 14 * s, 18 * s, 3 * s);
        drawTrinket(ctx, q.prize, p.x, p.y - 22 * s, 9 * s, S.t);
        if (q.ringed) ringShape(ctx, p.x, p.y - 8 * s, s * 1.1, '#ff4a8a');
      } else drawBottle(ctx, p.x, p.y, p.s, q.col, q.ringed);
    }
    // the ring in flight / on the rim
    const F = S.fly;
    if (F) {
      const t = F.phase === 'air' ? H.ease.out(F.t) : 1;
      const u = lerp(F.u0, F.u1, t), v = lerp(F.v0, F.v1, t);
      const p = projU(S, u, v), arc = F.phase === 'air' ? Math.sin(F.t * PI) * (L.yNear - L.yFar) * 0.55 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 10 * p.s, 3.5 * p.s, 0, 0, TAU); ctx.fill();
      let yy = p.y - arc - (F.phase === 'rim' || F.phase === 'in' ? 16 * p.s : 6 * p.s);
      let rot = F.phase === 'air' ? Math.sin(F.t * 9 + F.spin) * 0.6 : F.phase === 'rim' ? Math.sin(S.t * 30) * 0.35 * F.settle : 0;
      if (F.target && (F.phase === 'rim' || F.phase === 'in')) { const q = projU(S, F.target.u, F.target.v); p.x = q.x + (F.phase === 'rim' ? Math.sin(S.t * 26) * 3 * q.s : 0); yy = q.y - 15 * q.s; }
      ctx.save(); ctx.translate(p.x, yy); ctx.rotate(rot); ctx.scale(1, F.phase === 'air' ? 0.7 + 0.5 * Math.abs(Math.sin(F.t * 7 + F.spin)) : 1);
      ringShape(ctx, 0, 0, p.s * (F.phase === 'air' ? 1.15 - F.t * 0.2 : 1), '#ff4a8a');
      ctx.restore();
    }
    // the hand with the next ring, the aim arrow, the power meter
    S.wob = Math.sin(S.t * 2.6) * 0.035 + Math.sin(S.t * 4.3 + 1) * 0.015;
    if (S.left > 0 && !S.end) {
      const ang = S.aim + S.wob, len = (L.yNear - L.yFar) * (0.35 + S.power * 0.8);
      ctx.save(); ctx.translate(L.hx, L.hy); ctx.rotate(ang);
      ctx.strokeStyle = 'rgba(255,240,180,0.85)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, -20 - len); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,240,180,0.9)'; ctx.beginPath(); ctx.moveTo(0, -26 - len); ctx.lineTo(-7, -14 - len); ctx.lineTo(7, -14 - len); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#a8703f'; ctx.beginPath(); ctx.ellipse(L.hx, L.hy + 14, 22, 13, 0, 0, TAU); ctx.fill();
      if (!S.fly) ringShape(ctx, L.hx, L.hy, 1.5, '#ff4a8a');
      for (let i = 0; i < S.left - (S.fly ? 0 : 1); i++) ringShape(ctx, 24 + i * 9, A.y + A.h - 22, 1.1, '#ff4a8a');
      const pw = Math.min(150, W * 0.36), px = W - pw - 18, py = A.y + A.h - 30;
      ctx.fillStyle = 'rgba(18,13,22,0.75)'; H.rr(ctx, px - 4, py - 4, pw + 8, 18, 6); ctx.fill();
      const gr = ctx.createLinearGradient(px, 0, px + pw, 0); gr.addColorStop(0, '#6fdc5a'); gr.addColorStop(0.6, '#ffd84a'); gr.addColorStop(1, '#ff5a3a');
      ctx.fillStyle = gr; ctx.fillRect(px, py, pw * S.power, 10);
      H.text(ctx, 'POWER', px + pw / 2, py - 12, { font: 'osd', size: 14, color: '#f4efe2', outline: 3 });
    }
    if (S.stripH) drawStrip(g, ctx, S, A.y + 4);
    drawWait(g, ctx, S);
  }
  function endStall(g, S, game) {
    if (S.end) return;
    S.end = true;
    const extra = {};
    const won = (S.won || []).slice();
    const pz = prizeFor(game, S.score, { kite: false });
    if (pz && won.indexOf(pz) < 0 && !won.length) won.push(pz);
    S.prizes = won;
    sendTally(g, S, true);
    partyReport(g, S, false);
    const tb = [{ nick: 'You', n: S.score, me: true }].concat(S.rivals.map((r) => { while (!r.remote && r.left > 0) { r.left--; r.n += aiShot(game, r); } return { nick: r.nick, n: r.n, uid: r.uid }; }));
    tb.sort((a, b) => b.n - a.n || (a.me ? -1 : 1));
    extra.table = tb; extra.prizes = won; extra.rank = tb.findIndex((x) => x.me) + 1; extra.game = game;
    extra.ai = {}; for (const r of S.rivals) extra.ai[r.uid] = r.n;
    g.finish(S.score > 0, Object.assign(extra, { delay: 1.2 }));
  }
  function stallResult(g, r, name) {
    const ch = g.params.challenge;
    const rows = (r.table || []).slice(0, 5).map((x, i) => [(i + 1) + '. ' + x.nick, x.n + ' pts']);
    if (r.prizes && r.prizes.length) rows.push(['Prize', r.prizes.map((p) => PRIZES[p].name.replace(/ \(.*\)/, '')).join(', ')]);
    if (ch) rows.push(['Challenge total', ((ch.mine | 0) + r.score) + ' pts']);
    return {
      title: r.prizes && r.prizes.length ? 'Inaam mila!' : r.score > 0 ? 'Shabash!' : 'Arre, phir se!',
      line: r.prizes && r.prizes.length ? 'The stall uncle hands you ' + r.prizes.map((p) => 'a ' + PRIZES[p].name.replace(/ \(.*\)/, '').toLowerCase()).join(' and ') + '. Into the tin it goes!' : r.score > 0 ? name + ': ' + r.score + ' points. So close to a prize!' : 'Not even one! The uncle gives you a sympathetic toffee look.',
      rows,
    };
  }

  /* ================================================================ TIN CANS */
  const CANS = {
    id: 'ff_cans', title: 'Tin Can Pyramid', sub: 'Numaish. Three cloth balls, ten painted cans.', osd: 'NUMAISH · TIN CANS',
    place: 'nampally_exhibition', places: ['nampally_exhibition'], secs: 30, goLabel: 'MAARO!',
    keys: { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'throw', Enter: 'throw' },
    buttons: () => [{ a: 'left', label: '◀' }, { a: 'up', label: '▲' }, { a: 'throw', label: 'MAARO!', sub: 'HOLD · LET GO', cls: 'big' }, { a: 'down', label: '▼' }, { a: 'right', label: '▶' }],
    keyHint: () => '<kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> aim · hold <kbd>Space</kbd> to wind up, let go to throw (or the mouse)',
    howto() {
      return {
        lines: [
          'Aim at the pyramid. <b>Hold</b> to wind up (harder throws knock more cans), <b>let go</b> to throw.',
          'The harder you wind up, the more your hand wobbles. Hit the bottom row and the whole pyramid comes down.',
          'Ten cans, three balls. All ten off the plank = <b>SAFAYA!</b> and the first prize.',
        ],
        goal: 'KNOCK DOWN ALL 10 CANS WITH 3 BALLS',
        keys: '<kbd>←↑↓→</kbd> aim &nbsp;·&nbsp; hold <kbd>Space</kbd>, release',
        touch: 'Touch the pyramid to aim, hold, drag, lift to throw',
      };
    },
    setup(g) {
      const S = g.S;
      setupRivals(g, S, 'ff_cans');
      S.t = 0; S.score = 0; S.left = 3; S.ax = 0; S.ay = 1.6; S.rx = 0; S.ry = 1.6; S.charge = 0; S.charging = false; S.ball = null; S.settleT = 0; S.end = false; S.endT = 0;
      S.cans = [];
      const rows = [4, 3, 2, 1];
      let idx = 0;
      rows.forEach((n, k) => { for (let i = 0; i < n; i++) S.cans.push({ i: idx++, k, col: i, x: (i - (n - 1) / 2) * 1.06, y: k * 1.42, vx: 0, vy: 0, a: 0, va: 0, st: 'stand', paint: ['#d8302a', '#2a5cd8', '#f2c230', '#2a9a4a', '#e8641a'][(idx + k) % 5] }); });
      // supporters: a can in row k rests on the two below it
      for (const c of S.cans) { if (c.k === 0) { c.sup = []; continue; } c.sup = S.cans.filter((d) => d.k === c.k - 1 && Math.abs(d.x - c.x) < 0.8); }
    },
    layout(g) { const S = g.S; S.bgKey = null; S.stripH = S.rivals.length ? 56 : 0; },
    update(g, dt) {
      const S = g.S;
      if (waitGo(g, S)) return;
      S.t += dt;
      rivalsStep(g, S, dt);
      const mx = (g.down('right') ? 1 : 0) - (g.down('left') ? 1 : 0), my = (g.down('up') ? 1 : 0) - (g.down('down') ? 1 : 0);
      S.ax = clamp(S.ax + mx * dt * 3.2, -3.4, 3.4); S.ay = clamp(S.ay + my * dt * 3.2, -0.5, 6);
      if (S.ptr && isFinite(S.ptr.x) && isFinite(S.ptr.y)) { S.ax += (S.ptr.x - S.ax) * Math.min(1, dt * 16); S.ay += (S.ptr.y - S.ay) * Math.min(1, dt * 16); }
      const wob = 0.1 + S.charge * 0.5;
      S.rx = S.ax + Math.sin(S.t * 3.1) * wob + Math.sin(S.t * 5.3 + 2) * wob * 0.4; S.ry = S.ay + Math.sin(S.t * 2.3 + 1) * wob * 0.8;
      const settled = !S.cans.some((c) => c.st === 'fly');
      if (!S.ball && S.left > 0 && !S.end && settled) {
        if (!S.charging && (g.pressed('throw') || g.down('throw'))) { S.charging = true; S.charge = 0; } // a press held through the last throw counts
        if (S.charging) S.charge = Math.min(1, S.charge + dt / 1.1);
        if (S.charging && (g.released('throw') || !g.down('throw'))) { S.charging = false; S.left--; S.ball = { t: 0, x: S.rx, y: S.ry, p: 0.35 + S.charge * 0.65 }; S.charge = 0; g.sfx('ff_toss'); }
      }
      if (S.ball) { S.ball.t += dt / 0.38; if (S.ball.t >= 1) { hitCans(g, S, S.ball); S.ball = null; S.settleT = 0; } }
      canPhysics(g, S, dt);
      const down = S.cans.filter((c) => c.st !== 'stand').length;
      S.score = down * 10 + (down >= 10 ? 50 : 0);
      if (!S.end && !S.ball && settled && (S.left <= 0 || down >= 10)) { S.endT += dt; if (S.endT > 1.0) { if (down >= 10) { g.pop('SAFAYA!', g.W / 2, S.L.py - 120, { size: 40, color: '#ffd84a', life: 1.6 }); g.flash('#fff6c0', 0.3); } endStall(g, S, 'ff_cans'); } }
      sendTally(g, S, false);
    },
    idle(g, dt) { if (g.S) g.S.t += dt; },
    pointer(g, type, x, y, id) {
      const S = g.S, L = S.L; if (!L) return;
      if (type === 'move' || type === 'down') S.ptr = { x: clamp((x - L.px) / L.u, -3.4, 3.4), y: clamp((L.py - y) / L.u, -0.5, 6) };
      if (type === 'down') { S.ptrId = id; g.press('throw', 'ptr'); }
      if (type === 'up' && S.ptrId === id) { S.ptrId = null; g.release('throw', 'ptr'); }
    },
    bot(g, dt, want) {
      const S = g.S;
      if (S.ball || S.left <= 0 || S.end || S.waitParty || S.cans.some((c) => c.st === 'fly')) return;
      const stand = S.cans.filter((c) => c.st === 'stand').sort((a, b) => a.k - b.k);
      const tgt = want === 'lose' ? { x: 3.3, y: 5.5 } : stand[0] ? { x: stand.length > 6 ? 0 : stand[0].x, y: stand[0].y + 0.6 } : { x: 0, y: 0.6 };
      S.ptr = tgt;
      if (!S.charging) { g.botHold('throw', true); return; }
      if (S.charge >= 0.55 && Math.hypot(S.rx - tgt.x, S.ry - tgt.y) < 0.45) g.botHold('throw', false);
      else if (S.charge >= 1) g.botHold('throw', false);
    },
    hud(g) { const S = g.S; return [{ k: 'BALLS', v: S.left }, { k: 'CANS', v: S.cans.filter((c) => c.st !== 'stand').length + '/10', good: true }, { k: 'POINTS', v: S.score }]; },
    draw(g, ctx) { drawCans(g, ctx, g.S); },
    result(g, r) { return stallResult(g, r, 'Tin cans'); },
    stars(g, r) { return r.score >= 150 ? 3 : r.score >= 70 ? 2 : r.score >= 40 ? 1 : 0; },
    cleanup(g) { if (g.S && !g.S.end) partyReport(g, g.S, true); },
  };
  function hitCans(g, S, b) {
    let hit = 0;
    for (const c of S.cans) {
      if (c.st === 'down') continue;
      const cx = c.x, cy = c.y + 0.7;
      const dx = cx - b.x, dy = cy - b.y;
      if (Math.abs(dx) < 0.95 && Math.abs(dy) < 1.15) {
        hit++;
        c.st = 'fly';
        const dir = dx === 0 ? (g.rng.next() < 0.5 ? -1 : 1) : Math.sign(dx);
        c.vx = dir * (1.5 + b.p * 4) + (g.rng.next() - 0.5) * 2; c.vy = 3 + b.p * 4 + g.rng.next() * 2; c.va = (g.rng.next() - 0.5) * 14;
        c.z = -1; // knocked backwards off the plank
      }
    }
    if (hit) { g.sfx('ff_can'); g.sfx('ff_cans'); g.shake(4); g.burst(S.L.px + b.x * S.L.u, S.L.py - b.y * S.L.u, 10, { colors: ['#e8e0d0', '#c8b8a0'], speed: 120, life: 0.5, size: 3 }); }
    else { g.sfx('ff_thud'); g.pop('miss', S.L.px + b.x * S.L.u, S.L.py - b.y * S.L.u - 20, { size: 16, color: '#d8d0c0', font: 'body' }); }
  }
  function canPhysics(g, S, dt) {
    const G = 26;
    for (const c of S.cans) {
      if (c.st === 'stand' && c.k > 0 && c.sup.length) {
        const ok = c.sup.filter((d) => d.st === 'stand').length;
        if (ok < c.sup.length) { c.st = 'fly'; const miss = c.sup.find((d) => d.st !== 'stand'); c.vx = (ok === 0 ? (g.rng.next() - 0.5) * 1.5 : Math.sign(miss.x - c.x) * 1.4); c.vy = 0.5; c.va = c.vx * 2.5; g.sfx('ff_can', { ui: true, pitch: 0.8 + g.rng.next() * 0.5 }); }
      }
      if (c.st !== 'fly') continue;
      c.vy -= G * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.va * dt;
      // a flying can knocks a standing one
      for (const d of S.cans) {
        if (d === c || d.st !== 'stand') continue;
        if (Math.abs(d.x - c.x) < 0.95 && Math.abs((d.y + 0.7) - (c.y + 0.7)) < 1.2) {
          d.st = 'fly'; d.vx = c.vx * 0.7 + (g.rng.next() - 0.5); d.vy = Math.max(1, c.vy * 0.4 + 1.5); d.va = (g.rng.next() - 0.5) * 10;
          c.vx *= 0.6; g.sfx('ff_can', { ui: true, pitch: 0.9 + g.rng.next() * 0.4 });
        }
      }
      if (c.y < 0 && Math.abs(c.x) < 3.3 && c.vy < 0 && c.z !== -1) {
        c.y = 0; c.vy = -c.vy * 0.3; c.vx *= 0.6; c.va *= 0.5;
        if (Math.abs(c.vy) < 1.2) { c.st = 'rest'; c.vy = 0; c.a = Math.round(c.a / (PI / 2)) * (PI / 2); }
      } else if (c.y < -6 || Math.abs(c.x) > 7) { c.st = 'down'; }
    }
  }
  function drawCan(c, x, y, u, can) {
    const w = u * 0.92, h = u * 1.36;
    c.save(); c.translate(x, y - h / 2); c.rotate(-can.a);
    const gr = c.createLinearGradient(-w / 2, 0, w / 2, 0); gr.addColorStop(0, U.shade(can.paint, 0.65)); gr.addColorStop(0.4, U.shade(can.paint, 1.35)); gr.addColorStop(1, U.shade(can.paint, 0.6));
    c.fillStyle = gr; c.fillRect(-w / 2, -h / 2, w, h);
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillRect(-w / 2, -h * 0.12, w, h * 0.24);
    c.fillStyle = can.paint; c.font = 'bold ' + Math.round(u * 0.3) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('★', 0, 0);
    c.fillStyle = '#b8bcc4'; c.beginPath(); c.ellipse(0, -h / 2, w / 2, w * 0.16, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.strokeRect(-w / 2, -h / 2, w, h);
    c.restore();
  }
  function drawCans(g, ctx, S) {
    const H = MGH(), W = g.W, A = g.area;
    stallBack(g, ctx, S, 'TIN CANS · 3 BALLS', '#2a5cb8', '#f8f0e0');
    const top = A.y + (S.stripH || 0);
    const L = (S.L = S.L || {});
    L.u = Math.min(W / 9.5, (A.y + A.h - top) / 11.5); L.px = W / 2; L.py = top + (A.y + A.h - top) * 0.66;
    bulbsRow(ctx, 8, W - 8, top + 30, S.t, Math.round(W / 40));
    // the plank on two brackets, a cloth behind
    ctx.fillStyle = '#8a5a30'; ctx.fillRect(L.px - 3.5 * L.u, L.py, 7 * L.u, L.u * 0.28);
    ctx.fillStyle = '#5a3a20'; ctx.fillRect(L.px - 3 * L.u, L.py + L.u * 0.28, L.u * 0.3, L.u * 1.4); ctx.fillRect(L.px + 2.7 * L.u, L.py + L.u * 0.28, L.u * 0.3, L.u * 1.4);
    // the counter in front
    ctx.fillStyle = '#6a3a24'; ctx.fillRect(0, A.y + A.h * 0.88, W, A.h * 0.12);
    ctx.fillStyle = '#8a5a34'; ctx.fillRect(0, A.y + A.h * 0.88, W, 6);
    for (const c of S.cans) if (c.st !== 'down') drawCan(ctx, L.px + c.x * L.u, L.py - c.y * L.u, L.u, c);
    // the ball in flight (shrinks into the stall)
    if (S.ball) {
      const t = S.ball.t, sx = lerp(W / 2, L.px + S.ball.x * L.u, t), sy = lerp(A.y + A.h * 0.95, L.py - S.ball.y * L.u, t) - Math.sin(t * PI) * L.u * 1.2, r = lerp(L.u * 0.7, L.u * 0.4, t);
      ctx.fillStyle = '#e8e0d0'; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill(); ctx.strokeStyle = '#c84a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, r * 0.7, -0.6, 0.9); ctx.stroke();
    }
    // balls waiting on the counter
    for (let i = 0; i < S.left - (S.ball ? 0 : 0); i++) { const bx = 26 + i * L.u * 0.9, by = A.y + A.h * 0.88 - L.u * 0.35; ctx.fillStyle = '#e8e0d0'; ctx.beginPath(); ctx.arc(bx, by, L.u * 0.35, 0, TAU); ctx.fill(); ctx.strokeStyle = '#c84a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, L.u * 0.25, -0.6, 0.9); ctx.stroke(); }
    // the reticle and the wind-up ring
    if (!S.end && S.left > 0) {
      const rx = L.px + S.rx * L.u, ry = L.py - S.ry * L.u;
      ctx.strokeStyle = 'rgba(255,240,180,0.9)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(rx, ry, L.u * 0.45, 0, TAU); ctx.moveTo(rx - L.u * 0.7, ry); ctx.lineTo(rx - L.u * 0.25, ry); ctx.moveTo(rx + L.u * 0.25, ry); ctx.lineTo(rx + L.u * 0.7, ry); ctx.moveTo(rx, ry - L.u * 0.7); ctx.lineTo(rx, ry - L.u * 0.25); ctx.moveTo(rx, ry + L.u * 0.25); ctx.lineTo(rx, ry + L.u * 0.7); ctx.stroke();
      if (S.charging) { ctx.strokeStyle = S.charge > 0.8 ? '#ff5a3a' : '#ffd84a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(rx, ry, L.u * 0.62, -PI / 2, -PI / 2 + TAU * S.charge); ctx.stroke(); }
    }
    if (S.stripH) drawStrip(g, ctx, S, A.y + 4);
    drawWait(g, ctx, S);
  }

  /* ================================================================ BALLOON DARTS */
  const DARTS = {
    id: 'ff_darts', title: 'Balloon Darts', sub: 'Numaish. Five darts, a board full of balloons.', osd: 'NUMAISH · BALLOONS',
    place: 'nampally_exhibition', places: ['nampally_exhibition'], secs: 30, goLabel: 'PHODO!',
    keys: { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'throw', Enter: 'throw' },
    buttons: () => [{ a: 'left', label: '◀' }, { a: 'up', label: '▲' }, { a: 'throw', label: 'PHODO!', sub: 'THROW', cls: 'big' }, { a: 'down', label: '▼' }, { a: 'right', label: '▶' }],
    keyHint: () => '<kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> aim · <kbd>Space</kbd> throw the dart (or point and click)',
    howto() {
      return {
        lines: [
          'Your aim sways a little (a full tummy of Delhi papad). Wait for it to drift over a balloon, then <b>throw</b>.',
          'Each pop is 10 points; the <b style="color:#ffd84a">gold</b> balloons are 30. Five darts.',
          'Pop all five and the uncle rings his bell for you.',
        ],
        goal: 'FIVE DARTS · PRIZES FOR 30 / 50 / 80 POINTS',
        keys: '<kbd>←↑↓→</kbd> aim &nbsp;·&nbsp; <kbd>Space</kbd> throw',
        touch: 'Tap a balloon to throw at it (the dart flies where your sway is)',
      };
    },
    setup(g) {
      const S = g.S;
      setupRivals(g, S, 'ff_darts');
      S.t = 0; S.score = 0; S.left = 5; S.ax = 0.5; S.ay = 0.5; S.sx = 0.5; S.sy = 0.5; S.darts = []; S.fly = null; S.pops = 0; S.end = false; S.endT = 0;
      S.balloons = [];
      const cols = 6, rows = 4, pal = ['#e83a5a', '#2a8cd8', '#3ac06a', '#e8641a', '#9a5ae0', '#f4f0e8'];
      const golds = [Math.floor(g.rng.next() * 6) + 6, Math.floor(g.rng.next() * 6) + 12];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        S.balloons.push({ x: (c + 0.5 + (r % 2 ? 0.25 : -0.25)) / cols, y: (r + 0.5) / rows, r: 0.07, col: golds.indexOf(i) >= 0 ? '#f2c230' : pal[(i * 7 + r) % pal.length], gold: golds.indexOf(i) >= 0, popped: false, ph: g.rng.next() * TAU });
      }
    },
    layout(g) { const S = g.S; S.bgKey = null; S.stripH = S.rivals.length ? 56 : 0; },
    update(g, dt) {
      const S = g.S;
      if (waitGo(g, S)) return;
      S.t += dt;
      rivalsStep(g, S, dt);
      const mx = (g.down('right') ? 1 : 0) - (g.down('left') ? 1 : 0), my = (g.down('down') ? 1 : 0) - (g.down('up') ? 1 : 0);
      S.ax = clamp(S.ax + mx * dt * 0.6, 0, 1); S.ay = clamp(S.ay + my * dt * 0.6, 0, 1);
      if (S.ptr && isFinite(S.ptr.x) && isFinite(S.ptr.y)) { S.ax += (S.ptr.x - S.ax) * Math.min(1, dt * 18); S.ay += (S.ptr.y - S.ay) * Math.min(1, dt * 18); }
      S.sx = clamp(S.ax + Math.sin(S.t * 1.7) * 0.05 + Math.sin(S.t * 3.1 + 1) * 0.025, 0, 1);
      S.sy = clamp(S.ay + Math.sin(S.t * 2.2 + 2) * 0.045, 0, 1);
      // a tap while the last dart is still in the air is kept for a moment and thrown as soon as the hand is free
      if (g.pressed('throw')) S.wantT = 0.5; else if (S.wantT > 0) S.wantT -= dt;
      if (!S.fly && S.left > 0 && !S.end && S.wantT > 0) { S.wantT = 0; S.left--; S.fly = { t: 0, x: S.sx, y: S.sy }; g.sfx('ff_toss'); }
      if (S.fly) {
        S.fly.t += dt / 0.3;
        if (S.fly.t >= 1) {
          const x = S.fly.x, y = S.fly.y + 0.02;
          let hit = null;
          for (const b of S.balloons) { if (b.popped) continue; const by = b.y + Math.sin(S.t * 1.5 + b.ph) * 0.012; if (Math.hypot((x - b.x) * S.L.bw, (y - by) * S.L.bh) < b.r * S.L.bw * 1.08) { hit = b; break; } }
          const L = S.L, px = L.bx + x * L.bw, py = L.by + y * L.bh;
          if (hit) {
            hit.popped = true; S.pops++;
            const pts = hit.gold ? 30 : 10;
            S.score += pts;
            g.sfx('ff_pop'); g.burst(px, py, 18, { colors: [hit.col, '#fff', U.shade(hit.col, 0.7)], speed: 200, life: 0.6, size: 4, kind: 'paper' });
            g.pop((hit.gold ? 'GOLD! +' : 'PHAT! +') + pts, px, py - 26, { size: hit.gold ? 28 : 22, color: hit.gold ? '#ffd84a' : '#fff' });
            if (S.pops >= 5) { S.score += 20; g.sfx('ff_bell'); g.pop('ALL FIVE! +20', g.W / 2, L.by - 10, { size: 30, color: '#ffd84a', life: 1.6 }); }
          } else { g.sfx('ff_dart'); g.pop('thup', px, py - 20, { size: 15, color: '#d8d0c0', font: 'body' }); }
          S.darts.push({ x, y, a: (g.rng.next() - 0.5) * 0.5 });
          S.fly = null;
        }
      }
      if (S.left <= 0 && !S.fly && !S.end) { S.endT += dt; if (S.endT > 0.8) endStall(g, S, 'ff_darts'); }
      sendTally(g, S, false);
    },
    idle(g, dt) { if (g.S) g.S.t += dt; },
    pointer(g, type, x, y) {
      const S = g.S, L = S.L; if (!L) return;
      const px = clamp((x - L.bx) / L.bw, 0, 1), py = clamp((y - L.by) / L.bh, 0, 1);
      if (type === 'move') S.ptr = { x: px, y: py };
      if (type === 'down') { S.ptr = { x: px, y: py }; S.ax = px; S.ay = py; g.press('throw', 'ptr'); g.release('throw', 'ptr'); }
    },
    bot(g, dt, want) {
      const S = g.S;
      if (S.fly || S.left <= 0 || S.end || S.waitParty) return;
      const live = S.balloons.filter((b) => !b.popped);
      const tgt = want === 'lose' ? { x: 0.02, y: 0.98 } : live.sort((a, b) => (b.gold - a.gold) || (Math.hypot(a.x - S.ax, a.y - S.ay) - Math.hypot(b.x - S.ax, b.y - S.ay)))[0];
      if (!tgt) return;
      S.ptr = { x: tgt.x - (S.sx - S.ax), y: tgt.y - (S.sy - S.ay) - 0.02 };
      if (want === 'lose' || Math.hypot((S.sx - tgt.x) * 1.4, S.sy + 0.02 - tgt.y) < 0.03) g.botPress('throw');
    },
    hud(g) { const S = g.S; return [{ k: 'DARTS', v: S.left }, { k: 'POPS', v: S.pops }, { k: 'POINTS', v: S.score, good: S.score > 0 }]; },
    draw(g, ctx) { drawDarts(g, ctx, g.S); },
    result(g, r) { return stallResult(g, r, 'Balloon darts'); },
    stars(g, r) { return r.score >= 80 ? 3 : r.score >= 50 ? 2 : r.score >= 30 ? 1 : 0; },
    cleanup(g) { if (g.S && !g.S.end) partyReport(g, g.S, true); },
  };
  function drawBalloon(c, x, y, r, col, gold) {
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y + r * 1.15); c.quadraticCurveTo(x + r * 0.3, y + r * 1.6, x, y + r * 2.1); c.stroke();
    const gr = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.2);
    gr.addColorStop(0, U.shade(col, 1.6)); gr.addColorStop(0.5, col); gr.addColorStop(1, U.shade(col, 0.55));
    c.fillStyle = gr; c.beginPath(); c.ellipse(x, y, r, r * 1.15, 0, 0, TAU); c.fill();
    c.fillStyle = U.shade(col, 0.6); c.beginPath(); c.moveTo(x - r * 0.15, y + r * 1.1); c.lineTo(x + r * 0.15, y + r * 1.1); c.lineTo(x, y + r * 1.3); c.fill();
    if (gold) { c.strokeStyle = '#fff6c0'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, r * 1.12, r * 1.28, 0, 0, TAU); c.stroke(); }
  }
  function drawDarts(g, ctx, S) {
    const W = g.W, A = g.area;
    stallBack(g, ctx, S, 'BALLOONS · 5 DARTS', '#2a8c3a', '#ffe060');
    const top = A.y + (S.stripH || 0);
    const L = (S.L = S.L || {});
    const bt = (S.signBottom || top + 80) + 10;
    L.bw = Math.min(W * 0.86, (A.y + A.h * 0.82 - bt) * 1.5); L.bh = Math.min(A.y + A.h * 0.8 - bt, L.bw * 0.72); L.bx = (W - L.bw) / 2; L.by = bt;
    bulbsRow(ctx, 8, W - 8, top + 30, S.t, Math.round(W / 40));
    // the board: plywood with a cloth border
    ctx.fillStyle = '#c8a070'; ctx.fillRect(L.bx - 8, L.by - 8, L.bw + 16, L.bh + 16);
    ctx.fillStyle = '#e8d0a0'; ctx.fillRect(L.bx, L.by, L.bw, L.bh);
    ctx.fillStyle = 'rgba(120,80,40,0.12)'; for (let i = 0; i < 9; i++) ctx.fillRect(L.bx, L.by + i * L.bh / 9, L.bw, 1);
    for (const b of S.balloons) {
      const x = L.bx + b.x * L.bw, y = L.by + (b.y + Math.sin(S.t * 1.5 + b.ph) * 0.012) * L.bh, r = b.r * L.bw;
      if (b.popped) { ctx.fillStyle = U.shade(b.col, 0.7); for (let k = 0; k < 4; k++) { const a = k * 1.7 + b.ph; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.25, y + r * 0.5 + Math.sin(a) * r * 0.2, r * 0.22, r * 0.08, a, 0, TAU); ctx.fill(); } continue; }
      drawBalloon(ctx, x, y, r, b.col, b.gold);
    }
    for (const d of S.darts) { const x = L.bx + d.x * L.bw, y = L.by + d.y * L.bh; ctx.save(); ctx.translate(x, y); ctx.rotate(d.a); ctx.fillStyle = '#5a5a62'; ctx.fillRect(-1, 0, 2, 14); ctx.fillStyle = '#e83a5a'; ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(-5, 18); ctx.lineTo(5, 18); ctx.fill(); ctx.restore(); }
    if (S.fly) {
      const t = S.fly.t, x = lerp(W / 2, L.bx + S.fly.x * L.bw, t), y = lerp(A.y + A.h * 0.96, L.by + (S.fly.y + 0.02) * L.bh, t) - Math.sin(t * PI) * 30, s = lerp(1.6, 1, t);
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = '#5a5a62'; ctx.fillRect(-1, -2, 2, 16); ctx.fillStyle = '#e83a5a'; ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(-6, 20); ctx.lineTo(6, 20); ctx.fill(); ctx.restore();
    }
    if (!S.end && S.left > 0) {
      const x = L.bx + S.sx * L.bw, y = L.by + S.sy * L.bh;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.moveTo(x - 15, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 15, y); ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 15); ctx.stroke();
      ctx.fillStyle = '#e83a5a'; ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
      for (let i = 0; i < S.left; i++) { ctx.save(); ctx.translate(24 + i * 14, A.y + A.h - 34); ctx.fillStyle = '#5a5a62'; ctx.fillRect(-1, 0, 2, 16); ctx.fillStyle = '#e83a5a'; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(-5, 22); ctx.lineTo(5, 22); ctx.fill(); ctx.restore(); }
    }
    if (S.stripH) drawStrip(g, ctx, S, A.y + 4);
    drawWait(g, ctx, S);
  }

  function regGames() {
    const MG = N.minigames;
    if (!MG || !MG.register || regGames.done) return;
    regGames.done = true;
    MG.register(RINGS); MG.register(CANS); MG.register(DARTS);
    Object.assign(MG.alias || {}, { ring_toss: 'ff_rings', rings: 'ff_rings', tin_cans: 'ff_cans', can_pyramid: 'ff_cans', balloon_darts: 'ff_darts', darts: 'ff_darts' });
  }
  regGames();

  /* ---------------------------------------------------------------- playing them (prizes, the challenge) */
  let gameBusy = false;
  function playGame(game, params) {
    const MG = N.minigames;
    const id = { rings: 'ff_rings', cans: 'ff_cans', darts: 'ff_darts' }[game] || game;
    if (!MG || !MG.play || !MG.has(id)) return Promise.resolve({ id, win: false, error: 'unknown' });
    regSounds();
    gameBusy = true;
    return MG.play(id, Object.assign({ place: 'nampally_exhibition', difficulty: 0.4, friends: FRIENDS }, params || {})).then((r) => {
      gameBusy = false;
      if (r && !r.error && !r.aborted && !r.quit) {
        for (const p of r.prizes || []) givePrize(p, id);
        if (!(REC.best[id] >= r.score)) { REC.best[id] = r.score; saveRec(); }
        N.emit('funfair:game', { game: id, score: r.score });
      }
      return r;
    }, (e) => { gameBusy = false; throw e; });
  }
  /** the Fair challenge: rings, cans, darts in a row; totals (yours and the AI friends' / party players') */
  async function challenge(params) {
    params = params || {};
    const ctx = params.party || null;
    const ch = { i: 0, n: 3, mine: 0, totals: {} };
    const games = [];
    for (const id of ['ff_rings', 'ff_cans', 'ff_darts']) {
      const r = await playGame(id, Object.assign({}, params, { challenge: Object.assign({}, ch), seed: ((params.seed | 0) + ch.i * 101) >>> 0, skipHowto: ch.i > 0 || params.skipHowto, noRetry: true, title: 'Fair challenge ' + (ch.i + 1) + '/3 · ' + GAME_NAMES[id] }));
      games.push({ id, score: (r && r.score) | 0, quit: !!(r && (r.quit || r.aborted)) });
      if (!r || r.quit || r.aborted || r.error) break;
      ch.mine += r.score | 0;
      if (r.ai) for (const k in r.ai) ch.totals[k] = (ch.totals[k] | 0) + (r.ai[k] | 0);
      ch.i++;
    }
    const total = ch.mine;
    const done = games.length === 3 && !games[2].quit;
    if (ctx && typeof ctx.report === 'function') {
      try { ctx.report(done ? { score: total, note: total + ' points' } : { score: total, dnf: true }); } catch (e) { N.err('funfair.challenge.report', e); }
      try { if (ctx.ai && ctx.ai.report && ctx.isHost) for (const k in ch.totals) if (/^ai:/.test(k)) ctx.ai.report(k, { score: ch.totals[k], note: ch.totals[k] + ' points' }); } catch (e) { N.err('funfair.challenge.ai', e); }
    }
    if (done) {
      const best = Object.keys(ch.totals).reduce((m, k) => Math.max(m, ch.totals[k] | 0), 0);
      const win = total >= best && total > 0;
      if (!(REC.best.ff_challenge >= total)) { REC.best.ff_challenge = total; saveRec(); }
      if (win && total >= 150) givePrize('pencilbox', 'ff_challenge');
      try { if (N.hud && N.hud.banner) N.hud.banner(win ? 'FAIR CHAMPION' : 'FAIR CHALLENGE', total + ' points' + (best ? ' · best friend ' + best : ''), 2600, { kind: win ? 'pass' : 'info' }); } catch (e) { /* ignore */ }
    }
    return { total, games, done, totals: ch.totals };
  }

  /* ================================================================ RIDES */
  // A rider: a seated person entity (kind 'ffrider'). 2D: drawn by us at (x2, y2, h2) after the ride's prop; 3D: view3d_actors
  // draws it (e.view3d 'ped', e.idle 'sit' = seated) at (x, y, z). vx is a tiny non-zero so the gait sees "not walking".
  class Rider {
    constructor(look, o) {
      this.kind = 'ffrider'; this.view3d = 'ped'; this.look = look || {}; this.x = 0; this.y = 0; this.z = 0.01; this.x2 = 0; this.y2 = 0; this.h2 = 0;
      this.angle = 0; this.facing = 0; this.solid = false; this.noCollide = true; this.selfUpdate = true; this.noWorld = true; this.alive = true;
      this.r = 3; this.mass = 1; this.idle = 'sit'; this.anim = { phase: 0, speed: 0, run: false }; this.vx = 1e-6; this.vy = 0; this.hidden = false; this.sk = 0; this.ffRider = true;
      this.barkH = 12;
      Object.assign(this, o || {});
    }
    update() {}
    draw() {
      if (this.hidden || is3D()) return;
      const self = this, R = N.render;
      R.queue('structures', this.sk, (ctx) => {
        if (N.traffic && N.traffic.blitPerson) N.traffic.blitPerson(ctx, self.look, self.x2, self.y2, self.angle, self.anim, self.h2);
        else N.draw.sprite(self.x2, self.y2, self.angle, self.h2, (g) => N.people.draw(g, self.look, self.anim));
        if (self.held) drawHeld2D(ctx, self.held, self.x2, self.y2, self.h2 + 3, self.angle, 0.8);
      });
    }
  }
  function addRider(look, o) { const e = new Rider(look, o); try { N.entities.add(e); } catch (er) { N.err('funfair.rider', er); } return e; }
  function removeRider(e) { if (!e) return; e.alive = false; try { N.entities.remove(e); } catch (er) { /* ignore */ } }

  /* ---------------------------------------------------------------- the giant wheel, kept in step in 2D and 3D */
  // places_art turns its 2D wheel by 0.12 rad/s while the fair is on (wheel.a, not exported): this angle advances the same way
  // from the same boot frame, so it is the 2D wheel's angle. The 3D wheel (its own clock) is set to it every frame.
  const WH = { a: 0, grp: null, findT: 0, own: null };
  function wheelOpen() { try { return N.placesArt && N.placesArt.variant ? N.placesArt.variant('giant_wheel') === 'open' : fairOn(); } catch (e) { return fairOn(); } }
  function wheelGeom() {
    const W = spots().wheel; if (!W) return null;
    const lm = W.lm, long = lm.w >= lm.d;
    return { lm, R0: 26, hub: (lm.h || 70) - 30, ax: long ? 1 : 0, ay: long ? 0 : 1, tilt: 0.85 };
  }
  /** 2D gondola position (as places_art draws it) for a wheel angle */
  function wheel2D(ang, out) {
    const G = wheelGeom(); if (!G) return null;
    const bx = -G.ay, by = G.ax, ct = Math.cos(G.tilt), st = Math.sin(G.tilt);
    const c = Math.cos(ang) * G.R0, s = Math.sin(ang) * G.R0;
    out.x = G.lm.x + G.ax * c - bx * s * st; out.y = G.lm.y + G.ay * c - by * s * st; out.h = G.hub + s * ct;
    return out;
  }
  function wheel3DGroup() {
    if (!is3D()) return null;
    if (WH.grp && WH.grp.parent && WH.grp.parent.parent) return WH.grp;
    WH.grp = null;
    const t = nowMs();
    if (t - WH.findT < 900) return null;
    WH.findT = t;
    const E = N.view3d && N.view3d.engine, G = E && E.lmGroup;
    if (!G) return null;
    for (const o of G.children) {
      const u = o.userData && o.userData.lm3d;
      if (o.name === 'lm:giant_wheel' && u && u.subs && u.subs.wheel) { WH.grp = u.subs.wheel; break; }
    }
    return WH.grp;
  }
  const _v3 = { v: null };
  /** 3D seat in gondola k (16 gondolas in the 3D model; 2D gondola k = 3D gondola 2k), side -1 | 1 */
  function wheel3D(k, side, out) {
    const g = wheel3DGroup(), W = spots().wheel;
    const a = (2 * k / 16) * TAU, R = 44;
    if (g && window.THREE) {
      if (!_v3.v) _v3.v = new window.THREE.Vector3();
      g.updateWorldMatrix(true, false);
      _v3.v.set(Math.cos(a) * R + side * 0.95, Math.sin(a) * R - 6.6, side * 0.4);
      g.localToWorld(_v3.v);
      out.x = _v3.v.x; out.y = _v3.v.z; out.z = _v3.v.y; return out;
    }
    const ang = a + WH.a;
    out.x = W.x + Math.cos(ang) * R + side * 0.95; out.y = W.y; out.z = 52 + Math.sin(ang) * R - 6.6;
    return out;
  }
  function wheelTick(dt) {
    if (wheelOpen()) WH.a += dt * TUNE.wheelSpeed;
    const g = is3D() && fairOn() ? wheel3DGroup() : null;
    if (g) { g.rotation.z = WH.own != null ? WH.own : WH.a; g.updateMatrix(); }
  }

  /* ---------------------------------------------------------------- the props' live state (ambient + ride) */
  const AMB = { col: 0, colA: 0, cupsP: 0, cupsS: [0, 0, 0, 0, 0, 0], cupsW: [1.6, -1.2, 1.4, -1.8, 1.1, -1.5], mautA: [0, 2.1, 4.2], t: 0, bumper: null };
  // the Columbus angle: a 30 s cycle (swing up, hold, slow down) then 14 s of rest, with strangers in it
  function columbusAngle(t, amp) {
    const T = TUNE.rides.columbus;
    const up = smooth(t / 9), down = 1 - smooth((t - (T - 9)) / 9);
    const A = (amp || 1.15) * Math.min(up, down);
    return A * Math.sin((t / 4.6) * TAU);
  }
  function columbusSeat(ship, ang, l, side, out) {
    // pivot (x, hp); the deck hangs rs below it; seat l along the boat; side across (y)
    const C = ship;
    out.x = C.x + C.rs * Math.sin(ang) + l * Math.cos(ang);
    out.h = C.hp - C.rs * Math.cos(ang) + l * Math.sin(ang) + 1.2;
    out.y = C.y + side;
    return out;
  }
  const CUP_R = 6.2, CUP_SEAT = 1.15;
  const COL3 = { hp: 30, rs: 18 }; // the 3D Columbus: pivot height, deck radius (3D units)
  function cupCenter(j, out) { const C = spots().cups, a = AMB.cupsP + (j / 6) * TAU; out.x = C.x + Math.cos(a) * CUP_R; out.y = C.y + Math.sin(a) * CUP_R; return out; }

  /* ---------------------------------------------------------------- ride definitions */
  const RIDES = {
    wheel: { name: 'Giant wheel', row: 'ff_wheel', icon: '🎡', max: 4, act: 'Wave!', cam: { zoom: 1.5 }, view: { yaw: -PI / 2, pitch: 0.18 } },
    columbus: { name: 'Columbus', row: 'ff_columbus', icon: '⛵', max: 10, act: 'Scream!', cam: { zoom: 1.35 }, view: { yaw: -PI / 2, pitch: 0.22 } },
    carousel: { name: 'Merry-go-round', row: 'ff_carousel', icon: '🎠', max: 8, act: 'Wave!', cam: { zoom: 2.2 }, view: { yaw: 0, pitch: 0.3 } },
    cups: { name: 'Cup and saucer', row: 'ff_cups', icon: '☕', max: 6, act: 'Spin faster!', cam: { zoom: 2.0 }, view: { yaw: PI / 2, pitch: 0.55 } },
    bumper: { name: 'Dashing cars', row: 'ff_bumper', icon: '🚗', max: 8, act: 'Honk!', cam: { zoom: 2.0 }, view: { yaw: 0, pitch: 0.5 } },
    train: { name: 'Toy train', row: 'ff_train', icon: '🚂', max: 6, act: 'Whistle!', cam: { zoom: 1.7 }, view: { yaw: 0, pitch: 0.3 } },
    maut: { name: 'Maut ka kuan', row: 'ff_maut', icon: '🏍️', max: 10, act: 'Clap!', cam: { zoom: 2.3 }, view: { yaw: PI / 2, pitch: 0.75 } },
  };
  function rideAvail(id) {
    const S = spots();
    if (!S.ok) return false;
    if (id === 'wheel') return !!S.wheel;
    if (id === 'maut') return !!S.maut;
    if (id === 'carousel') return !!S.carousel && !!(N.seasons && N.seasons.layout && N.seasons.layout.numaishState);
    if (id === 'train') return !!S.train && !!(N.seasons && N.seasons.layout && N.seasons.layout.trainAt);
    return !!RIDES[id];
  }
  let RD = null; // the ride Chinnu is on
  const STRANGER = (seed, kind) => { try { return N.people.randomLook(U.rng(seed >>> 0), kind || 'kid'); } catch (e) { return { kind: 'kid', shirt: '#2a5cb8', skin: '#a0683f' }; } };

  /** start a ride: o {ctx (party), riders: [{uid, nick, look, isMe, isAI}], force, paid} */
  function startRide(id, o) {
    o = o || {};
    const spec = RIDES[id], p = N.player;
    if (!spec || !p || RD) return false;
    if (!rideAvail(id)) { toast('This ride is not here today.'); return false; }
    if (!o.force && !fairOpen()) { toast(closedWhy()); return false; }
    if (p.vehicle && N.vehicles && N.vehicles.exit) N.vehicles.exit(p, true);
    regSounds();
    const ctx = o.ctx || null;
    let list = o.riders || (ctx && ctx.players) || null;
    if (!list || !list.length) list = [{ uid: 'me', nick: 'You', isMe: true, look: p.look }];
    list = list.slice(0, spec.max);
    if (!list.some((q) => q.isMe)) list.unshift({ uid: 'me', nick: 'You', isMe: true, look: p.look });
    const seed = ctx && ctx.seed != null ? ctx.seed >>> 0 : (Math.random() * 1e9) >>> 0;
    RD = { id, spec, ctx, seed, rng: U.rng(seed), t: 0, phase: 'board', secs: TUNE.rides[id], riders: [], strangers: [], from: { x: p.x, y: p.y }, saved: { locked: !!p.controlsLocked, follow: N.render.follow, zoom: N.render.baseZoom }, actT: 0, photo: null, bumps: 0, ended: false };
    // the participants (me + party players / AI friends), each a seated rider
    list.forEach((q, i) => {
      const e = addRider(q.isMe ? (p.look || {}) : (q.look || STRANGER(seed + i)), { uid: q.uid, nick: q.nick || '', isMe: !!q.isMe, isAI: !!q.isAI, slot: i });
      RD.riders.push(e);
      if (q.isMe) RD.me = e;
    });
    // strangers fill some seats (solo or not: the fair is busy)
    // (the Columbus and the cups carry their strangers in their own models / ambient drawing; Chinnu's party takes the free seats)
    const cap = { carousel: 8, maut: 14 }[id] || 0;
    const fill = Math.min({ carousel: 4, maut: 7 }[id] || 0, Math.max(0, cap - list.length));
    for (let i = 0; i < fill; i++) RD.strangers.push(addRider(STRANGER(seed * 7 + i * 13, i % 3 ? 'kid' : null), { stranger: true, slot: list.length + i }));
    if (id === 'maut') for (const e of RD.riders.concat(RD.strangers)) e.idle = 'stand';
    rideSetup(RD);
    // hide me (the rider shows me); lock; camera
    p.hidden = true; p.controlsLocked = true; p.mode = 'busy'; p.vx = p.vy = 0;
    N.render.follow = RD.me;
    if (is3D() && spec.view && N.view3d && N.view3d.setCamera) { try { N.view3d.setCamera({ yaw: spec.view.yaw, pitch: spec.view.pitch }); } catch (e) { /* ignore */ } }
    sfx('ff_bell');
    toast(spec.icon + ' ' + spec.name + '! ' + (ctx && ctx.mode === 'party' ? 'With ' + list.filter((q) => !q.isMe).map((q) => q.nick).join(', ') + '. ' : '') + 'ACTION: ' + spec.act, 3000);
    N.emit('funfair:ride', { id, phase: 'board' });
    rideStep(0);
    return true;
  }
  function rideSetup(R) {
    const id = R.id, S = spots();
    if (id === 'wheel') {
      // board the gondola nearest the bottom
      let best = 0, bd = 9;
      for (let k = 0; k < 8; k++) { const a = ((WH.a + (k / 8) * TAU) % TAU + TAU) % TAU; const d = Math.abs(U.angleDiff(a, -PI / 2)); if (d < bd) { bd = d; best = k; } }
      R.k = best; R.a0 = WH.a; R.photoDone = false;
      if (TUNE.rideScale !== 1) WH.own = WH.a;
    } else if (id === 'columbus') {
      // the end rows are the thrill seats: party first
      const seats = [];
      for (const l of [-10, 10, -7.5, 7.5, -2.5, 2.5]) for (const sd of [-1.4, 1.4]) seats.push([l, sd]);
      R.seats = seats; R.screamT = 0; R.lastSign = 0;
    } else if (id === 'cups') {
      R.cupW = AMB.cupsW.slice(); R.boost = 0;
    } else if (id === 'bumper') {
      bumperStart(R);
    } else if (id === 'train') {
      R.done = 0;
    } else if (id === 'maut') {
      R.claps = 0;
    }
    // every rider's seat index
    const all = R.riders.concat(R.strangers);
    all.forEach((e, i) => { e.seat = i; });
    void S;
  }
  /** ride time in seconds: the shared clock in a party (everybody in step), else local */
  function rideTime(R, dt) {
    if (R.ctx && typeof R.ctx.elapsed === 'function') { let e = 0; try { e = R.ctx.elapsed() / 1000; } catch (er) { e = R.t; } return e * TUNE.rideScale; }
    return R.t + dt * TUNE.rideScale;
  }
  const _o = { x: 0, y: 0, h: 0, z: 0 };
  function rideStep(dt) {
    const R = RD; if (!R) return;
    const p = N.player, S = spots();
    const prevT = R.t;
    R.t = rideTime(R, dt);
    if (R.phase === 'board') { if (R.t >= (R.ctx ? 0 : 1.2)) { R.phase = 'run'; R.t0 = R.t; R.runT = 0; sfx('ff_bell'); N.emit('funfair:ride', { id: R.id, phase: 'run' }); } }
    const run = R.phase === 'run' ? Math.max(0, R.t - (R.ctx ? 0 : 1.2)) : 0;
    R.runT = run;
    const all = R.riders.concat(R.strangers);
    const id = R.id, vs = VS(), D3 = is3D();
    // ACTION on a ride (controls are locked, so read it here: after N.interact)
    if (N.input && mode() === 'play') {
      try { N.input.setActionLabel(R.phase === 'run' ? R.spec.act : null); } catch (e) { /* ignore */ }
      if (N.input.pressed('action')) { N.input.consume('action'); rideAction(R); }
    }
    R.actT = Math.max(0, R.actT - dt);
    if (id === 'wheel') {
      if (TUNE.rideScale !== 1) WH.own = R.a0 + run * TUNE.wheelSpeed;
      const ang = (WH.own != null ? WH.own : WH.a) + (R.k / 8) * TAU;
      wheel2D(ang, _o);
      all.forEach((e, i) => {
        const side = (i % 2 ? 1 : -1) * (i < 2 ? 0.8 : 1.6);
        e.x2 = _o.x + side * (wheelGeom().ax); e.y2 = _o.y + side * wheelGeom().ay; e.h2 = _o.h - 3.2; e.angle = PI / 2;
        if (D3) { wheel3D(R.k, i % 2 ? 1 : -1, _o); e.x = _o.x + (i >= 2 ? (i % 2 ? 1 : -1) * 0.9 : 0); e.y = _o.y + (i >= 2 ? 1.1 : -0.6); e.z = Math.max(0.05, _o.z); }
        e.sk = N.render.distKey(S.wheel.x, S.wheel.y) + 0.5;
      });
      // the group photo when the gondola passes the top
      const rel = ((ang % TAU) + TAU) % TAU;
      if (!R.photoDone && run > 3 && Math.abs(U.angleDiff(rel, PI / 2)) < 0.12) { R.photoDone = true; groupPhoto(R); }
      if (run >= TAU / TUNE.wheelSpeed) R.over = true;
    } else if (id === 'columbus') {
      const ang = columbusAngle(run, 1.15);
      AMB.colRide = ang;
      const C = S.columbus;
      all.forEach((e, i) => {
        const st = R.seats[i % R.seats.length];
        columbusSeat(C, ang, st[0], st[1], _o);
        e.x2 = _o.x; e.y2 = _o.y; e.h2 = _o.h; e.angle = st[0] < 0 ? 0 : PI;
        // 3D: the boat model hangs RS3 below a pivot HP3 high and turns rigidly (rotation.z = ang)
        const sy = -COL3.rs + 0.4;
        e.x = C.x + st[0] * Math.cos(ang) - sy * Math.sin(ang); e.y = C.y + st[1]; e.z = Math.max(0.05, COL3.hp + st[0] * Math.sin(ang) + sy * Math.cos(ang) - 2.2);
        e.sk = N.render.distKey(C.x, C.y) + 0.5;
      });
      // screams at the top of each big swing, the stomach drop at the bottom
      const sgn = Math.sign(Math.sin((run / 4.6) * TAU));
      if (sgn !== R.lastSign && Math.abs(ang) > 0.75) { sfxAt('ff_wheee', C.x, C.y, { n: 8 }); bark(all[(R.screamT++ * 3) % all.length], ['WHEEEE!', 'AAAAA!', 'Ammaaa!', 'Phir se!'][R.screamT % 4]); }
      if (sgn !== R.lastSign && Math.abs(ang) < 0.2 && run > 10 && run < 20) { if (!is3D()) N.render.shake(2, 0.3); }
      R.lastSign = sgn;
      if (run >= TUNE.rides.columbus) R.over = true;
    } else if (id === 'carousel') {
      const st = N.seasons.layout.numaishState(), C = S.carousel;
      all.forEach((e, i) => {
        const k = (i * 3) % 8, a = st.car + (k / 8) * TAU;
        e.x2 = C.x + Math.cos(a) * C.r * 0.75; e.y2 = C.y + Math.sin(a) * C.r * 0.75; e.h2 = 5.5; e.angle = a + PI / 2;
        e.x = C.x + Math.cos(a) * (C.r - 1.6); e.y = C.y + Math.sin(a) * (C.r - 1.6); e.z = Math.max(0.05, 3.2 + (k % 2) * 1.1 + 0.55 - 2.2);
        e.sk = N.render.distKey(C.x, C.y) + 0.5;
      });
      if (run >= TUNE.rides.carousel) R.over = true;
    } else if (id === 'cups') {
      const C = S.cups;
      all.forEach((e, i) => {
        const j = i < R.riders.length ? Math.floor(i / 3) : 2 + ((i - R.riders.length) % 4), s = i % 3;
        cupCenter(j, _o);
        const a = AMB.cupsS[j] + (s / 3) * TAU;
        e.x2 = _o.x + Math.cos(a) * CUP_SEAT; e.y2 = _o.y + Math.sin(a) * CUP_SEAT; e.h2 = 3; e.angle = a + PI;
        e.x = e.x2; e.y = e.y2; e.z = 0.01;
        e.sk = N.render.distKey(C.x, C.y) + 0.5;
      });
      if (run >= TUNE.rides.cups) R.over = true;
    } else if (id === 'bumper') {
      bumperStep(R, dt, run);
      if (run >= TUNE.rides.bumper) R.over = true;
    } else if (id === 'train') {
      const T = S.train, st = N.seasons.layout.numaishState(), tp = { x: 0, y: 0, a: 0 };
      all.forEach((e, i) => {
        const coach = 1 + (Math.floor(i / 2) % 3), side = i % 2 ? 0.55 : -0.55;
        N.seasons.layout.trainAt(T, st.train - coach * T.gap, tp);
        const c = Math.cos(tp.a), s2 = Math.sin(tp.a), u = -0.2;
        e.x2 = tp.x + c * u - s2 * side; e.y2 = tp.y + s2 * u + c * side; e.h2 = 4.6; e.angle = tp.a;
        e.x = e.x2; e.y = e.y2; e.z = 0.01;
        e.sk = N.render.distKey(T.cx, T.cy) + 0.5;
      });
      if (run >= TUNE.rides.train) R.over = true;
    } else if (id === 'maut') {
      const M = S.maut;
      all.forEach((e, i) => {
        const a = -PI / 2 + (i - (all.length - 1) / 2) * 0.17, r2 = M.r + 2, r3 = Math.min(M.lm.w, M.lm.d) / 2 - 1 + 1.6;
        e.x2 = M.x + Math.cos(a) * r2; e.y2 = M.y + Math.sin(a) * r2; e.h2 = M.H + 1.8; e.angle = a + PI;
        e.x = M.x + Math.cos(a) * r3; e.y = M.y + Math.sin(a) * r3; e.z = 31; e.facing = a + PI;
        e.sk = N.render.distKey(M.x, M.y) + 0.5;
      });
      if (Math.floor(run / 6) !== Math.floor((run - dt) / 6) && run > 1) sfxAt('ff_bike', M.x, M.y);
      if (run >= TUNE.rides.maut) R.over = true;
    }
    for (const e of all) { if (!D3) { e.x = e.x2; e.y = e.y2; } e.facing = e.angle; e.barkH = (D3 ? 0 : e.h2) + 11; }
    // fps: hide my own rider (the eye sits in its head)
    if (R.me) R.me.hidden = D3 && N.view && N.view.mode === 'fps';
    // the player follows the seat (for distance checks, audio, online); controls stay locked
    if (R.me) { p.x = R.me.x2; p.y = R.me.y2; }
    p.vx = p.vy = 0; p.controlsLocked = true; p.mode = 'busy'; p.hidden = true;
    N.render.follow = R.me;
    // 2D ride camera
    if (!D3 && R.me) {
      let cx = R.me.x2, cy = R.me.y2, z = R.spec.cam.zoom;
      if (id === 'wheel') { z = lerp(1.55, 0.95, clamp((R.me.h2 - 20) / 37, 0, 1)); }
      else if (id === 'carousel') { cx = S.carousel.x; cy = S.carousel.y; }
      else if (id === 'cups') { cx = S.cups.x; cy = S.cups.y; }
      else if (id === 'maut') { cx = S.maut.x; cy = S.maut.y; }
      else if (id === 'bumper') { cx = lerp(S.bumper.x + S.bumper.w / 2, R.me.x2, 0.5); cy = lerp(S.bumper.y + S.bumper.d / 2, R.me.y2, 0.4); }
      else if (id === 'columbus') { cx = S.columbus.x; cy = S.columbus.y; }
      N.render.camOverride = { x: cx, y: cy, zoom: z, rate: 4 };
    } else if (D3 && N.render.camOverride && N.render.camOverride.ff) N.render.camOverride = null;
    if (N.render.camOverride && !D3) N.render.camOverride.ff = true;
    // ride over: report (party), unload
    if (R.over && !R.ended) endRide('done');
    void prevT;
  }
  function bark(e, text) { try { if (e && N.dialogue && N.dialogue.bark) N.dialogue.bark(e, text, { secs: 1.6 }); } catch (er) { /* ignore */ } }
  function rideAction(R) {
    if (R.phase !== 'run' || R.actT > 0) return;
    R.actT = 0.6;
    const me = R.me, S = spots();
    if (R.id === 'cups') { R.boost = Math.min(5, (R.boost || 0) + 2.2); sfx('ff_squeak'); bark(me, 'Ghumao!'); }
    else if (R.id === 'columbus') { sfxAt('ff_wheee', S.columbus.x, S.columbus.y, { n: 4 }); bark(me, 'AAAAAA!'); }
    else if (R.id === 'bumper') { sfx('scooter_horn', { ui: true }); bark(me, 'Hato! Hato!'); }
    else if (R.id === 'train') { sfx('train_horn', { ui: true, vol: 0.4 }); bark(me, 'Chhuk chhuk!'); }
    else if (R.id === 'maut') { sfx('applause', { ui: true }); R.claps = (R.claps | 0) + 1; bark(me, 'Shabash!'); }
    else { bark(me, R.id === 'wheel' ? 'Ta-ta, Hyderabad!' : 'Haath hilao!'); sfx('kids', { ui: true }); }
    if (R.ctx && R.ctx.send) { try { R.ctx.send('fa', { a: R.id }); } catch (e) { /* ignore */ } }
  }
  function endRide(reason) {
    const R = RD; if (!R || R.ended) return;
    R.ended = true;
    const p = N.player, S = spots();
    // the party: everybody reports (custom rides: no score; dashing cars: bumps)
    if (R.ctx && typeof R.ctx.report === 'function' && reason === 'done') {
      try { R.ctx.report(R.id === 'bumper' ? { score: R.bumps | 0, note: (R.bumps | 0) + ' bumps' } : { score: 1, note: 'rode the ' + R.spec.name.toLowerCase() }); } catch (e) { N.err('funfair.ride.report', e); }
      try { if (R.ctx.ai && R.ctx.ai.report && R.ctx.isHost) for (const e of R.riders) if (e.isAI) R.ctx.ai.report(e.uid, R.id === 'bumper' ? { score: (e.car && e.car.bumps) | 0, note: ((e.car && e.car.bumps) | 0) + ' bumps' } : { score: 1, note: 'rode along' }); } catch (e) { N.err('funfair.ride.ai', e); }
    }
    for (const e of R.riders.concat(R.strangers)) removeRider(e);
    if (R.id === 'bumper') bumperEnd(R);
    WH.own = null; AMB.colRide = null;
    RD = null;
    const exit = rideExit(R.id);
    p.hidden = false; p.mode = 'foot'; p.controlsLocked = false;
    N.render.follow = R.saved.follow && R.saved.follow.alive !== false && !R.saved.follow.ffRider ? R.saved.follow : null;
    if (N.render.camOverride && N.render.camOverride.ff) N.render.camOverride = null;
    try { N.input.setActionLabel(null); } catch (e) { /* ignore */ }
    if (exit) p.teleport(exit.x, exit.y);
    if (reason === 'done') {
      const lines = { wheel: 'Down again. Your ears are still up there.', columbus: 'Your stomach arrives two seconds after you.', carousel: 'The horse was called Badal. You decided.', cups: 'The ground is spinning. Or is it you?', bumper: 'DHISHOOM count: ' + (R.bumps | 0) + '. The uncle blows his whistle.', train: 'The toy train whistles to a stop. Everybody claps for the driver.', maut: 'The riders wave from the wall. The whole well shakes with claps.' };
      toast(lines[R.id] || 'What a ride!', 3000);
    }
    N.emit('funfair:ride', { id: R.id, phase: 'end', reason });
    if (R.endFn) { try { R.endFn(reason); } catch (e) { N.err('funfair.ride.endFn', e); } }
    void S;
  }
  function rideExit(id) {
    const S = spots();
    const at = { wheel: S.wheel, columbus: S.columbus, carousel: S.carousel, cups: S.cups, bumper: S.bumper, train: S.train, maut: S.maut }[id];
    return at && isFinite(at.ix) ? { x: at.ix, y: at.iy } : null;
  }

  /* ---------------------------------------------------------------- the group photo at the top of the giant wheel */
  function groupPhoto(R) {
    const names = R.riders.map((e) => (e.isMe ? (N.player.name || 'Chinnu') : e.nick)).filter(Boolean);
    sfx('ff_shutter'); sfx('camera_flash', { ui: true });
    try { if (N.render && N.render.fx) N.render.fx.flash = 0.9; } catch (e) { /* ignore */ }
    let img = null;
    try { img = paintPhoto(R.riders.map((e) => ({ look: e.look, nick: e.isMe ? 'Me' : e.nick }))); } catch (e) { N.err('funfair.photo', e); }
    const ph = { t: Date.now(), names, img, date: (N.calendar && N.calendar.date && N.calendar.date.label) || '' };
    REC.photos.unshift(ph); REC.photos = REC.photos.slice(0, 6); saveRec();
    try { if (N.tape && N.tape.addToken) N.tape.addToken('ff_group_photo', { name: 'Group photo, top of the giant wheel', desc: (names.length > 1 ? names.join(', ') : 'Just me') + ' at the very top, the whole Numaish lit up below. ' + ph.date }); } catch (e) { N.err('funfair.photoToken', e); }
    showPhoto(ph);
    R.photo = ph;
    N.emit('funfair:photo', { names });
  }
  function paintPhoto(people) {
    const c = document.createElement('canvas'); c.width = 240; c.height = 180;
    const g = c.getContext('2d');
    // the night city below, bokeh lights
    let gr = g.createLinearGradient(0, 0, 0, 180); gr.addColorStop(0, '#0e1430'); gr.addColorStop(0.55, '#2a1a3a'); gr.addColorStop(1, '#4a2a2a');
    g.fillStyle = gr; g.fillRect(0, 0, 240, 180);
    const rng = U.rng(people.length * 7 + 3);
    for (let i = 0; i < 70; i++) { const x = rng.next() * 240, y = 70 + rng.next() * 110, r = 1 + rng.next() * 4; g.globalAlpha = 0.35 + rng.next() * 0.5; g.fillStyle = ['#ffd890', '#ff9a50', '#fff4d0', '#ff6ab0', '#80d0ff'][i % 5]; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    // the gondola rim (red and yellow) and the kids inside
    g.fillStyle = '#e8303a'; g.fillRect(0, 128, 240, 14); g.fillStyle = '#f2c230'; g.fillRect(0, 124, 240, 5);
    const n = Math.max(1, people.length), w = 200 / n;
    people.forEach((q, i) => {
      const x = 20 + w * (i + 0.5), s = Math.min(1.5, w / 50);
      const look = q.look || {};
      g.save(); g.translate(x, 128); g.scale(s, s);
      g.fillStyle = look.shirt || '#d8402a'; g.beginPath(); g.ellipse(0, -8, 17, 15, 0, PI, TAU); g.fill();
      g.fillStyle = look.skin || '#a8703f'; g.beginPath(); g.arc(0, -34, 13, 0, TAU); g.fill();
      g.fillStyle = look.hair || '#1a1412'; g.beginPath(); g.arc(0, -37, 13.5, PI * 1.05, PI * 1.95); g.fill();
      if (look.cap) { g.fillStyle = look.capColor || '#1d4f91'; g.beginPath(); g.arc(0, -38, 13.6, PI, TAU); g.fill(); }
      g.fillStyle = '#1a1214'; g.beginPath(); g.arc(-4.5, -35, 1.8, 0, TAU); g.arc(4.5, -35, 1.8, 0, TAU); g.fill();
      if (look.specs) { g.strokeStyle = '#2a2a2a'; g.lineWidth = 1.2; g.beginPath(); g.arc(-4.5, -35, 3.6, 0, TAU); g.moveTo(8.1, -35); g.arc(4.5, -35, 3.6, 0, TAU); g.stroke(); }
      g.strokeStyle = '#5a1a1a'; g.lineWidth = 1.6; g.beginPath(); g.arc(0, -31, 5, 0.25, PI - 0.25); g.stroke(); // a big grin
      g.strokeStyle = look.skin || '#a8703f'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(12, -14); g.lineTo(20, -40); g.stroke(); // waving
      g.restore();
    });
    // a 2003 colour print: warm, the date stamp
    g.globalCompositeOperation = 'soft-light'; g.fillStyle = 'rgba(255,200,120,0.45)'; g.fillRect(0, 0, 240, 180); g.globalCompositeOperation = 'source-over';
    let d = null; try { d = N.calendar && N.calendar.date; } catch (e) { d = null; }
    g.fillStyle = 'rgba(255,150,40,0.95)'; g.font = '11px monospace'; g.textAlign = 'right';
    if (d) g.fillText("'" + String(d.y).slice(2) + ' ' + String(d.m).padStart(2, '0') + ' ' + String(d.d).padStart(2, '0'), 232, 172);
    return c.toDataURL('image/jpeg', 0.8);
  }
  let photoEl = null, photoT = 0;
  function showPhoto(ph) {
    if (!ph || !ph.img) return;
    if (!photoEl) { photoEl = document.createElement('div'); photoEl.className = 'ff-photo'; photoEl.setAttribute('aria-live', 'polite'); (document.getElementById('ui') || document.body).appendChild(photoEl); }
    photoEl.innerHTML = '<div class="ff-photo-card"><img alt="Group photo at the top of the giant wheel" src="' + ph.img + '"><b>Top of the giant wheel!</b><span>' + esc(ph.names.join(' · ')) + '</span></div>';
    photoEl.classList.add('show');
    photoT = 5.5;
  }

  /* ---------------------------------------------------------------- DASHING CARS (bumper cars) */
  const CAR_COLS = ['#e83a3a', '#2a6ad8', '#f2c230', '#30a050', '#e86ab0', '#ff8a2a', '#8a4ad8', '#20b8c8'];
  const CAR_R = 3.1;
  function newCar(i, x, y, a, o) { return Object.assign({ i, x, y, a, vx: 0, vy: 0, thr: 0, steer: 0, col: CAR_COLS[i % CAR_COLS.length], bumps: 0, flash: 0, ai: null, remote: false, rider: null, tx: x, ty: y, ta: a, spark: 0 }, o || {}); }
  function arenaSpawn(i, n) {
    const B = spots().bumper, cols = Math.ceil(n / 2), c = i % cols, r = Math.floor(i / cols);
    return { x: B.x + 6 + (c + 0.5) * ((B.w - 12) / cols), y: B.y + (r ? B.d - 4.5 : 4.5), a: r ? -PI / 2 + 0.3 : PI / 2 - 0.3 };
  }
  function bumperStart(R) {
    const n = Math.max(6, R.riders.length + 3);
    const cars = [];
    R.riders.forEach((e, i) => {
      const s = arenaSpawn(i, n);
      const car = newCar(i, s.x, s.y, s.a, { rider: e, me: e.isMe, remote: !e.isMe && !e.isAI, ai: e.isAI ? { tgt: null, t: 0, skill: 0.7 } : null });
      e.car = car; cars.push(car);
    });
    for (let i = R.riders.length; i < n; i++) {
      const s = arenaSpawn(i, n);
      const e = addRider(STRANGER(R.seed + i * 31), { stranger: true });
      R.strangers.push(e);
      const car = newCar(i, s.x, s.y, s.a, { rider: e, ai: { tgt: null, t: 0, skill: 0.5 } });
      e.car = car; cars.push(car);
    }
    R.cars = cars;
    R.sendT = 0;
    if (R.ctx && typeof R.ctx.on === 'function' && !R.listen) {
      R.listen = true;
      try {
        R.offFns = [R.ctx.on('bc', (d, from) => {
          if (!RD || RD !== R || !d || typeof d !== 'object') return;
          const uid = from && from.uid;
          const car = R.cars.find((c) => c.rider && c.rider.uid === uid && c.remote);
          if (!car) return;
          const B = spots().bumper;
          car.tx = clamp(+d.x || car.x, B.x, B.x + B.w); car.ty = clamp(+d.y || car.y, B.y, B.y + B.d); car.ta = +d.a || 0;
          car.vx = clamp(+d.vx || 0, -40, 40); car.vy = clamp(+d.vy || 0, -40, 40); car.bumps = clamp(d.b | 0, 0, 999); car.rxT = 0;
        })];
      } catch (e) { N.err('funfair.bumper.on', e); }
    }
    AMB.bumper = null;
  }
  function bumperEnd(R) { if (R.offFns) for (const f of R.offFns) { try { if (typeof f === 'function') f(); } catch (e) { /* ignore */ } } }
  function carControl(car, dt, R, cars) {
    const B = spots().bumper;
    if (car.me) {
      const I = N.input;
      let thr = 0, steer = 0;
      if (R.phase === 'run' && I) {
        const m = I.move || { x: 0, y: 0 }, mag = Math.min(1, Math.hypot(m.x, m.y));
        if (I.analog && mag > 0.2) {
          const want = Math.atan2(m.y, m.x), d = U.angleDiff(car.a, want);
          steer = clamp(d * 2, -1, 1); thr = mag * (Math.abs(d) > 2.4 ? -0.6 : 1);
        } else {
          thr = (I.down('up') ? 1 : 0) - (I.down('down') ? 0.7 : 0);
          steer = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0);
        }
      }
      car.thr = thr; car.steer = steer;
      return;
    }
    if (!car.ai) return;
    const A = car.ai;
    A.t -= dt;
    if (A.t <= 0 || !A.tgt) {
      A.t = 2 + R.rng.next() * 2.5;
      const others = cars.filter((c) => c !== car);
      const chase = R.rng.next() < (car.rider && car.rider.isAI ? 0.75 : 0.45);
      A.tgt = chase && others.length ? others[Math.floor(R.rng.next() * others.length)] : { x: B.x + 4 + R.rng.next() * (B.w - 8), y: B.y + 3 + R.rng.next() * (B.d - 6) };
    }
    const tx = A.tgt.x, ty = A.tgt.y, want = Math.atan2(ty - car.y, tx - car.x), d = U.angleDiff(car.a, want);
    car.steer = clamp(d * 1.8, -1, 1); car.thr = R.phase === 'run' ? (Math.abs(d) > 2.2 ? -0.5 : 0.75 + A.skill * 0.25) : 0;
  }
  function carPhysics(car, dt) {
    if (car.remote) {
      // kinematic: follow the last state, a little extrapolation
      car.rxT = (car.rxT || 0) + dt;
      const ex = Math.min(0.25, car.rxT);
      const tx = car.tx + car.vx * ex, ty = car.ty + car.vy * ex, k = 1 - Math.exp(-dt * 12);
      car.x += (tx - car.x) * k; car.y += (ty - car.y) * k; car.a += U.angleDiff(car.a, car.ta) * k;
      return;
    }
    const c = Math.cos(car.a), s = Math.sin(car.a);
    car.vx += c * car.thr * 34 * dt; car.vy += s * car.thr * 34 * dt;
    let fwd = car.vx * c + car.vy * s, side = -car.vx * s + car.vy * c;
    fwd *= Math.exp(-dt * 0.9); side *= Math.exp(-dt * 3.2);
    const sp = Math.hypot(fwd, side);
    if (sp > 22) { fwd *= 22 / sp; side *= 22 / sp; }
    car.vx = fwd * c - side * s; car.vy = fwd * s + side * c;
    car.a += car.steer * dt * 2.4 * (fwd < -0.5 ? -1 : 1) * clamp(Math.abs(fwd) / 8 + 0.35, 0.35, 1);
    car.x += car.vx * dt; car.y += car.vy * dt;
  }
  function bumperCollide(R, cars, dt) {
    const B = spots().bumper;
    for (const car of cars) {
      if (car.remote) continue;
      const x0 = B.x + CAR_R, x1 = B.x + B.w - CAR_R, y0 = B.y + CAR_R, y1 = B.y + B.d - CAR_R;
      let wall = false;
      if (car.x < x0) { car.x = x0; if (car.vx < 0) { car.vx = -car.vx * 0.5; wall = Math.abs(car.vx) > 3; } }
      if (car.x > x1) { car.x = x1; if (car.vx > 0) { car.vx = -car.vx * 0.5; wall = Math.abs(car.vx) > 3; } }
      if (car.y < y0) { car.y = y0; if (car.vy < 0) { car.vy = -car.vy * 0.5; wall = Math.abs(car.vy) > 3; } }
      if (car.y > y1) { car.y = y1; if (car.vy > 0) { car.vy = -car.vy * 0.5; wall = Math.abs(car.vy) > 3; } }
      if (wall && car.me) sfx('ff_thud', { ui: true });
    }
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.remote && b.remote) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= CAR_R * 2 || d < 1e-4) continue;
      const nx = dx / d, ny = dy / d, over = CAR_R * 2 - d;
      // separate (a remote car does not move here: its own page moves it)
      const wa = a.remote ? 0 : b.remote ? 1 : 0.5, wb = 1 - wa;
      a.x -= nx * over * wa; a.y -= ny * over * wa; b.x += nx * over * wb; b.y += ny * over * wb;
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv >= 0) continue;
      const jimp = -(1 + 0.65) * rv / 2;
      if (!a.remote) { a.vx -= jimp * nx; a.vy -= jimp * ny; }
      if (!b.remote) { b.vx += jimp * nx; b.vy += jimp * ny; }
      if (-rv > 6) {
        // the one driving into the other lands the bump
        const ia = a.vx * nx + a.vy * ny, ib = -(b.vx * nx + b.vy * ny);
        const giver = ia >= ib ? a : b;
        if (!giver.remote) { giver.bumps++; giver.flash = 0.5; }
        if (giver.me) { R.bumps = giver.bumps; bark(giver.rider, ['DHISHOOM!', 'Bonk!', 'Hato!', 'Le!'][giver.bumps % 4]); }
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        sfxAt('ff_bump', mx, my, (a.me || b.me) ? { ui: true } : {});
        a.spark = b.spark = 0.35;
        if ((a.me || b.me) && !is3D()) N.render.shake(1.5, 0.15);
      }
    }
  }
  function bumperStep(R, dt, run) {
    const cars = R.cars; if (!cars) return;
    for (const car of cars) { carControl(car, dt, R, cars); carPhysics(car, dt); car.flash = Math.max(0, car.flash - dt); car.spark = Math.max(0, car.spark - dt); }
    bumperCollide(R, cars, dt);
    const S = spots(), B = S.bumper;
    for (const car of cars) {
      const e = car.rider; if (!e) continue;
      e.x2 = car.x - Math.cos(car.a) * 0.6; e.y2 = car.y - Math.sin(car.a) * 0.6; e.h2 = 2.2; e.angle = car.a;
      e.x = e.x2; e.y = e.y2; e.z = 0.01; e.sk = N.render.distKey(B.x + B.w / 2, B.y + B.d / 2) + 0.6;
    }
    // party: my car's state ~10 times a second
    R.sendT -= dt;
    if (R.ctx && R.ctx.send && R.sendT <= 0 && R.me && R.me.car) {
      R.sendT = 0.1;
      const c = R.me.car;
      try { R.ctx.send('bc', { x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, a: Math.round(c.a * 100) / 100, vx: Math.round(c.vx), vy: Math.round(c.vy), b: c.bumps }); } catch (e) { /* ignore */ }
    }
    if (R.phase === 'run' && Math.floor(run * 1.4) !== Math.floor((run - dt) * 1.4)) sfxAt('ff_buzz', B.x + B.w / 2, B.y + B.d / 2);
  }
  // ambient: a few strangers bump about while the fair is open and nobody is riding
  function bumperAmbient(dt) {
    const S = spots(); if (!S.ok) return;
    const B = S.bumper, p = N.player;
    const near = p && Math.hypot(p.x - (B.x + B.w / 2), p.y - (B.y + B.d / 2)) < 420;
    if (!near || !fairOpen() || (RD && RD.id === 'bumper')) { if (!near) AMB.bumper = null; return; }
    if (!AMB.bumper) {
      const R0 = { rng: U.rng(99), phase: 'run' };
      AMB.bumper = { R: R0, cars: [] };
      for (let i = 0; i < 5; i++) { const s = arenaSpawn(i, 6); AMB.bumper.cars.push(newCar(i + 2, s.x, s.y, s.a, { ai: { tgt: null, t: 0, skill: 0.5 }, look: STRANGER(4000 + i * 17) })); }
    }
    const A = AMB.bumper;
    for (const car of A.cars) { carControl(car, dt, A.R, A.cars); carPhysics(car, dt); car.spark = Math.max(0, car.spark - dt); }
    bumperCollide({ bumps: 0 }, A.cars, dt);
  }
  function bumperCars() { if (RD && RD.id === 'bumper' && RD.cars) return RD.cars; return AMB.bumper ? AMB.bumper.cars : []; }

  /* ---------------------------------------------------------------- ambient motion of the props */
  function ambientTick(dt) {
    AMB.t += dt;
    const open = fairOpen();
    // the Columbus: 30 s ride cycles with 14 s of loading between (unless Chinnu rides it)
    if (!(RD && RD.id === 'columbus')) { const cyc = TUNE.rides.columbus + 14, t = AMB.t % cyc; AMB.col = open && t < TUNE.rides.columbus ? columbusAngle(t, 0.95) : AMB.col * Math.exp(-dt * 2); }
    else AMB.col = AMB.colRide || 0;
    // the cups: the big saucer turns, every cup spins (Chinnu's cup faster when he spins it)
    const run = open ? 1 : 0;
    const boost = RD && RD.id === 'cups' ? (RD.boost || 0) : 0;
    if (RD && RD.id === 'cups') RD.boost = Math.max(0, (RD.boost || 0) - dt * 0.8);
    AMB.cupsP += dt * 0.55 * run;
    for (let j = 0; j < 6; j++) AMB.cupsS[j] += dt * run * (AMB.cupsW[j] + (j === 0 ? boost * Math.sign(AMB.cupsW[0]) : 0));
    // the maut ka kuan: two bikes and a little car on the wall
    for (let i = 0; i < 3; i++) AMB.mautA[i] += dt * (open ? 3.2 + i * 0.25 : 0);
    bumperAmbient(dt);
  }

  /* ================================================================ TOYS + SNACKS in hand, BUBBLES */
  const TOYS = {
    bubbles: { item: 'ff_bubbles', name: 'Bubble blower', act: 'Blow bubbles', per: 25 },
    balloon: { item: 'ff_balloon', name: 'Balloon', act: 'Bop the balloon', per: 1 },
    phirki: { item: 'ff_phirki', name: 'Phirki', act: 'Blow the phirki', per: 1 },
    whistle: { item: 'ff_whistle', name: 'Whistle', act: 'Blow the whistle', per: 1 },
    flute: { item: 'ff_flute', name: 'Toy flute', act: 'Play the flute', per: 1 },
  };
  const SNACKS = {
    peanuts: { name: 'Boiled peanuts', row: 'ff_peanuts', line: 'Garam garam moongphali, in yesterday\'s newspaper cone.' },
    candyfloss: { name: 'Buddhi ke baal', row: 'ff_candyfloss', line: 'Pink candy floss as big as your head. It melts on your nose.' },
    bhutta: { name: 'Roasted bhutta', row: 'ff_bhutta', line: 'Lemon, salt, chilli. Fingers on fire, worth it.' },
    kulfi: { name: 'Kulfi', row: 'ff_kulfi', line: 'Matka kulfi on a stick. Eat fast, it is dripping!' },
    papad: { name: 'Delhi papad', row: 'ff_papad', line: 'Biggest papad in the world! Crumbs everywhere.' },
  };
  const TOY = { held: null, snack: null, snackT: 0, spin: 0, spinV: 0, bop: 0, color: '#e83a5a', sendT: 0, lastSent: '', munchT: 0, notes: [] };
  function owned(id) { const T = TOYS[id], p = N.player; return !!(T && p && p.items && (p.items[T.item] | 0) > 0); }
  function ownedList() { return Object.keys(TOYS).filter(owned); }
  function holdToy(id) {
    if (id && !owned(id)) return false;
    TOY.held = id || null;
    if (TOY.held) { TOY.bop = 0.4; sfx('ui_select', { ui: true }); }
    syncToyNow();
    renderPill();
    return true;
  }
  function cycleToy() {
    const L = ownedList(); if (!L.length) { TOY.held = null; renderPill(); return null; }
    const i = TOY.held ? L.indexOf(TOY.held) : -1;
    holdToy(i + 1 >= L.length ? null : L[i + 1]);
    if (!TOY.held) toast('Toys away in the pocket.', 1400);
    return TOY.held;
  }
  function useToy() {
    const id = TOY.held, p = N.player;
    if (!id || !p || !owned(id)) return false;
    const a = isFinite(p.facing) ? p.facing : p.angle || 0;
    if (id === 'bubbles') {
      const left = p.items.ff_bubbles | 0;
      const seed = (Math.random() * 1e9) >>> 0;
      blowBubbles(p.x, p.y, a, seed, false);
      sfx('ff_blow', { ui: true });
      p.addItem ? p.addItem('ff_bubbles', -1) : (p.items.ff_bubbles = left - 1);
      if ((p.items.ff_bubbles | 0) <= 0) { toast('The soap water is finished. One more bottle at the toy cart!', 2600); TOY.held = null; renderPill(); }
      sendNet('ff_bub', { x: Math.round(p.x), y: Math.round(p.y), a: Math.round(a * 100) / 100, s: seed });
    } else if (id === 'balloon') { TOY.bop = 1; sfx('ff_squeak', { ui: true }); }
    else if (id === 'phirki') { TOY.spinV += 30; sfx('ff_blow', { ui: true }); }
    else if (id === 'whistle') {
      sfx('ff_whistle', { ui: true });
      try { if (N.birds && N.birds.scare) N.birds.scare(p.x, p.y, 90); } catch (e) { /* ignore */ }
      sendNet('ff_snd', { k: 'w', x: Math.round(p.x), y: Math.round(p.y) });
    } else if (id === 'flute') {
      const tunes = [[0, 2, 4, 7, 4, 2, 0, 9, 7], [7, 9, 7, 4, 2, 4, 0], [0, 4, 7, 12, 9, 7, 4, 2, 0]];
      const tune = tunes[(Math.random() * tunes.length) | 0];
      sfx('ff_flute', { ui: true, tune });
      for (let i = 0; i < 5; i++) TOY.notes.push({ t: -i * 0.3, x: p.x, y: p.y, life: 1.8, dx: (Math.random() - 0.5) * 6 });
      sendNet('ff_snd', { k: 'f', x: Math.round(p.x), y: Math.round(p.y) });
    }
    N.emit('funfair:toy', { id });
    return true;
  }
  function giveToy(id) {
    const T = TOYS[id], p = N.player; if (!T || !p) return;
    if (p.addItem) p.addItem(T.item, T.per); else { p.items = p.items || {}; p.items[T.item] = (p.items[T.item] | 0) + T.per; }
    if (id === 'balloon') TOY.color = ['#e83a5a', '#2a8cd8', '#f2c230', '#3ac06a', '#9a5ae0'][(Math.random() * 5) | 0];
    holdToy(id);
  }
  function eatSnack(id) {
    const S2 = SNACKS[id]; if (!S2) return;
    TOY.snack = id; TOY.snackT = 35; TOY.munchT = 3;
    toast(S2.line, 2600);
    syncToyNow(); renderPill();
  }

  /* ---------------------------------------------------------------- bubbles (2D + 3D), drifting on N.wind */
  const BUB = [];
  const _w = { x: 0, y: 0, s: 0 };
  function blowBubbles(x, y, a, seed, remote) {
    const rng = U.rng(seed >>> 0);
    const n = 7 + Math.floor(rng.next() * 6);
    for (let i = 0; i < n; i++) {
      if (BUB.length >= TUNE.bubbleCap) BUB.shift();
      const sp = 6 + rng.next() * 10, aa = a + (rng.next() - 0.5) * 0.9;
      BUB.push({ x: x + Math.cos(a) * 4, y: y + Math.sin(a) * 4, h: 6 + rng.next() * 2, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, vh: 1.5 + rng.next() * 2.5, r: 0.5 + rng.next() * 1.1, age: -i * 0.05, life: TUNE.bubbleLife[0] + rng.next() * (TUNE.bubbleLife[1] - TUNE.bubbleLife[0]), ph: rng.next() * TAU, remote: !!remote });
    }
    N.emit('funfair:bubbles', { n, remote: !!remote });
  }
  function bubblesTick(dt) {
    if (!BUB.length) return;
    const W = N.wind, p = N.player;
    for (let i = BUB.length - 1; i >= 0; i--) {
      const b = BUB[i];
      b.age += dt;
      if (b.age < 0) continue;
      let wx = 0.4, wy = 0.1, ws = 0.25;
      try { if (W && W.at) { W.at(b.x, b.y, _w); wx = _w.x; wy = _w.y; ws = _w.s; } } catch (e) { /* default breeze */ }
      const tv = 3 + ws * 26, k = 1 - Math.exp(-dt * 0.7);
      b.vx += (wx * tv - b.vx) * k + Math.sin(b.age * 3 + b.ph) * dt * 4; b.vy += (wy * tv - b.vy) * k + Math.cos(b.age * 2.6 + b.ph) * dt * 4;
      b.vh += (0.6 - b.vh) * dt * 0.4;
      b.x += b.vx * dt; b.y += b.vy * dt; b.h = Math.max(1, b.h + b.vh * dt);
      if (b.age >= b.life || b.h > 70) {
        BUB.splice(i, 1);
        if (p && Math.abs(b.x - p.x) < 160 && Math.abs(b.y - p.y) < 160 && Math.random() < 0.5) sfxAt('ff_bubble', b.x, b.y, { vol: 0.5 });
        POPS.push({ x: b.x, y: b.y, h: b.h, r: b.r, t: 0 });
        if (POPS.length > 40) POPS.shift();
      }
    }
    for (let i = POPS.length - 1; i >= 0; i--) { POPS[i].t += dt; if (POPS[i].t > 0.25) POPS.splice(i, 1); }
  }
  const POPS = [];
  function drawBubbles2D() {
    if (!BUB.length && !POPS.length) return;
    const R = N.render;
    R.queue('sky', 2, (ctx) => {
      ctx.lineWidth = 1;
      for (const b of BUB) {
        if (b.age < 0 || !R.inView(b.x, b.y, 20)) continue;
        const k = R.k(b.h), X = R.sx(b.x, k), Y = R.sy(b.y, k), r = Math.max(1.2, b.r * k);
        const fade = Math.min(1, b.age * 4, (b.life - b.age) * 2);
        ctx.globalAlpha = 0.18 * fade; ctx.fillStyle = '#cfe8ff'; ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.75 * fade; ctx.strokeStyle = 'hsl(' + ((b.ph * 57 + b.age * 90) % 360).toFixed(0) + ',85%,78%)';
        ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.9 * fade; ctx.fillStyle = '#ffffff'; ctx.fillRect(X - r * 0.45, Y - r * 0.5, Math.max(1, r * 0.3), Math.max(1, r * 0.3));
      }
      for (const q of POPS) { const k = R.k(q.h), X = R.sx(q.x, k), Y = R.sy(q.y, k); ctx.globalAlpha = 1 - q.t / 0.25; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(X, Y, (q.r + q.t * 8) * k, 0, TAU); ctx.stroke(); }
      ctx.globalAlpha = 1;
    });
  }

  /* ---------------------------------------------------------------- held things, drawn in the hand (2D) */
  function drawHeld2D(ctx, kind, x, y, h, a, s, o) {
    const R = N.render, k = R.k(h), hx = x + Math.cos(a + 1.1) * 3.2, hy = y + Math.sin(a + 1.1) * 3.2;
    const X = R.sx(hx, k), Y = R.sy(hy, k), z = k * (s || 1);
    o = o || {};
    if (kind === 'balloon') {
      const bob = Math.sin((o.t || 0) * 2.2) * 1.2 + (o.bop || 0) * 3;
      const kb = R.k(h + 12 + bob), BX = R.sx(hx + 1.5, kb), BY = R.sy(hy - 1, kb);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(0.6, 0.35 * z); ctx.beginPath(); ctx.moveTo(X, Y); ctx.quadraticCurveTo((X + BX) / 2 + 2 * z, (Y + BY) / 2, BX, BY + 3 * kb); ctx.stroke();
      ctx.fillStyle = o.color || '#e83a5a'; ctx.beginPath(); ctx.ellipse(BX, BY, 3 * kb, 3.6 * kb, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(BX - 1 * kb, BY - 1.3 * kb, 0.8 * kb, 1.1 * kb, -0.5, 0, TAU); ctx.fill();
      return;
    }
    ctx.save(); ctx.translate(X, Y); ctx.scale(z, z);
    if (kind === 'phirki') {
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -5); ctx.stroke();
      ctx.translate(0, -5); ctx.rotate(o.spin || 0);
      const cs = ['#e83a5a', '#f2c230', '#2a8cd8', '#3ac06a'];
      for (let i = 0; i < 4; i++) { ctx.fillStyle = cs[i]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(2.6, -0.6); ctx.lineTo(2.2, 1.6); ctx.closePath(); ctx.fill(); ctx.rotate(PI / 2); }
    } else if (kind === 'bubbles') {
      ctx.fillStyle = 'rgba(200,230,255,0.85)'; ctx.fillRect(-0.9, -1.8, 1.8, 2.6); ctx.fillStyle = '#e83a5a'; ctx.fillRect(-0.9, -2.3, 1.8, 0.6);
      ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.arc(1.8, -3.2, 1, 0, TAU); ctx.stroke();
    } else if (kind === 'whistle') {
      ctx.fillStyle = '#e83a5a'; ctx.fillRect(-1.4, -0.5, 2.2, 1); ctx.beginPath(); ctx.arc(0.8, 0, 0.8, 0, TAU); ctx.fill();
    } else if (kind === 'flute') {
      ctx.rotate(-0.5); ctx.fillStyle = '#d8b070'; ctx.fillRect(-0.4, -5, 0.8, 7); ctx.fillStyle = '#5a3a1a'; for (let i = 0; i < 4; i++) ctx.fillRect(-0.2, -4 + i * 1.4, 0.4, 0.4);
    } else if (kind === 'candyfloss') {
      ctx.strokeStyle = '#f4e8c8'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -3); ctx.stroke();
      ctx.fillStyle = '#ff9ad0'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * 1.3) * 1.4, -4.5 + Math.sin(i * 1.3) * 1.2, 1.7, 0, TAU); ctx.fill(); }
    } else if (kind === 'peanuts') {
      ctx.fillStyle = '#e8e0c8'; ctx.beginPath(); ctx.moveTo(-1.6, -2.5); ctx.lineTo(1.6, -2.5); ctx.lineTo(0, 1.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b8864a'; ctx.beginPath(); ctx.arc(-0.5, -2.6, 0.5, 0, TAU); ctx.arc(0.6, -2.7, 0.5, 0, TAU); ctx.fill();
    } else if (kind === 'bhutta') {
      ctx.rotate(-0.6); ctx.fillStyle = '#e8b830'; ctx.beginPath(); ctx.ellipse(0, -2.5, 1, 2.6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#6a3a1a'; for (let i = 0; i < 5; i++) ctx.fillRect(-0.6 + (i % 2) * 0.6, -4.2 + i * 0.7, 0.4, 0.3);
    } else if (kind === 'kulfi') {
      ctx.fillStyle = '#c8a070'; ctx.fillRect(-0.2, -1, 0.4, 2); ctx.fillStyle = '#f4e4b8'; ctx.beginPath(); ctx.ellipse(0, -2.6, 0.9, 1.8, 0, 0, TAU); ctx.fill();
    } else if (kind === 'papad') {
      ctx.fillStyle = '#f2dca0'; ctx.beginPath(); ctx.arc(0, -3, 3, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(160,100,40,0.5)'; for (let i = 0; i < 6; i++) ctx.fillRect(Math.cos(i) * 1.8, -3 + Math.sin(i * 2) * 1.6, 0.4, 0.4);
    }
    ctx.restore();
  }
  /** what an actor holds: the toy, or a snack while eating it */
  function heldOf(t) { return t ? (t.snack || t.held || null) : null; }

  /* ---------------------------------------------------------------- friends see them (the online room bus) */
  const NET = { off: null, map: new Map() };
  function inRoom() { try { return !!(N.online && N.online.room && typeof N.online.channelSend === 'function'); } catch (e) { return false; } }
  function sendNet(type, data) { if (!inRoom()) return false; try { return N.online.channelSend(type, data); } catch (e) { N.err('funfair.net', e); return false; } }
  function wireNet() {
    if (NET.off || !N.online || typeof N.online.onMessage !== 'function') return;
    NET.off = N.online.onMessage((m) => {
      if (!m || typeof m.type !== 'string' || !/^ff_/.test(m.type)) return;
      const d = m.data && typeof m.data === 'object' ? m.data : null; if (!d) return;
      const p = N.player;
      if (m.type === 'ff_bub') {
        const x = +d.x, y = +d.y, a = +d.a;
        if (!isFinite(x) || !isFinite(y) || !p || Math.hypot(x - p.x, y - p.y) > 900) return;
        blowBubbles(x, y, isFinite(a) ? a : 0, (d.s >>> 0) || 1, true);
      } else if (m.type === 'ff_toy') {
        const t = TOYS[d.t] ? d.t : null, sn = SNACKS[d.sn] ? d.sn : null, c = /^#[0-9a-f]{6}$/i.test(String(d.c || '')) ? d.c : '#e83a5a';
        NET.map.set(m.from, { held: t, snack: sn, color: c, at: nowMs() });
      } else if (m.type === 'ff_snd') {
        const x = +d.x, y = +d.y;
        if (!isFinite(x) || !isFinite(y) || !p || Math.hypot(x - p.x, y - p.y) > 500) return;
        sfxAt(d.k === 'f' ? 'ff_flute' : 'ff_whistle', x, y, { vol: 0.7 });
      }
    });
  }
  function syncToyNow() { TOY.sendT = 0; TOY.lastSent = ''; }
  function toyNetTick(dt) {
    if (!inRoom()) return;
    wireNet();
    TOY.sendT -= dt;
    const key = (TOY.held || '') + '|' + (TOY.snack || '') + '|' + TOY.color;
    if (TOY.sendT <= 0 || key !== TOY.lastSent) {
      if (key === TOY.lastSent && TOY.sendT > 0) return;
      TOY.sendT = 5; TOY.lastSent = key;
      sendNet('ff_toy', { t: TOY.held, sn: TOY.snack, c: TOY.color });
    }
  }
  function ghostOf(key) { try { for (const e of N.entities.byKind ? N.entities.byKind('ghost') : N.entities.all) if (e.kind === 'ghost' && e.online === key) return e; } catch (e) { /* ignore */ } return null; }
  function ghostToys() {
    const out = [];
    const t = nowMs();
    for (const [k, v] of NET.map) {
      if (t - v.at > 16000) { NET.map.delete(k); const g0 = ghostOf(k); if (g0 && g0.ffBalloon) { g0.balloons = undefined; g0.ffBalloon = false; } continue; }
      const g = ghostOf(k); if (!g || g.hidden) continue;
      // 3D: the built-in balloon on a raised arm
      if (v.held === 'balloon') { g.balloons = [v.color]; g.ffBalloon = true; } else if (g.ffBalloon) { g.balloons = undefined; g.ffBalloon = false; }
      out.push({ e: g, held: heldOf(v), color: v.color });
    }
    return out;
  }

  /* ---------------------------------------------------------------- the toy pill (HUD) */
  let pillEl = null;
  function buildPill() {
    if (pillEl || !document.getElementById('ui')) return;
    pillEl = document.createElement('button');
    pillEl.type = 'button'; pillEl.className = 'ff-toy interactive'; pillEl.tabIndex = -1; pillEl.hidden = true;
    pillEl.innerHTML = '<canvas width="56" height="56" aria-hidden="true"></canvas><span class="ff-toy-n"></span><kbd class="ff-toy-k">T</kbd>';
    pillEl.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); cycleToy(); });
    document.getElementById('ui').appendChild(pillEl);
  }
  let pillKey = '';
  function renderPill() {
    buildPill();
    if (!pillEl) return;
    const m = mode(), show = (m === 'play' || m === 'dialogue') && (ownedList().length > 0 || !!TOY.snack) && !RD;
    pillEl.hidden = !show;
    if (!show) { pillKey = ''; return; }
    const kind = heldOf(TOY), key = kind + ':' + ownedList().join(',');
    if (key === pillKey) return;
    pillKey = key;
    const nm = TOY.snack ? SNACKS[TOY.snack].name : TOY.held ? TOYS[TOY.held].name : 'Toys';
    pillEl.querySelector('.ff-toy-n').textContent = nm + (TOY.held === 'bubbles' ? ' ×' + ((N.player.items.ff_bubbles | 0)) : '');
    pillEl.setAttribute('aria-label', TOY.held ? 'Holding ' + nm + ': tap to switch' : 'Take out a toy');
    const c = pillEl.querySelector('canvas'), g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 56, 56);
    // the held toy (or, with nothing in hand, the first one in the pocket, faded: tap to take it out)
    const icon = kind || ownedList().find((id) => TOYS[id]) || null;
    if (icon) {
      // reuse the 2D painter: a fake projection centred in the little canvas
      const R = N.render, sk = R.k, ssx = R.sx, ssy = R.sy;
      try {
        R.k = () => 4.2; R.sx = (x) => 28 + x * 4.2; R.sy = (y) => 40 + y * 4.2;
        g.globalAlpha = kind ? 1 : 0.5;
        drawHeld2D(g, icon, -Math.cos(1.1) * 3.2, -Math.sin(1.1) * 3.2 + (icon === 'balloon' ? 1.5 : 0), 0, 0, icon === 'balloon' ? 0.9 : 1.25, { color: TOY.color, spin: 0.4 });
      } finally { R.k = sk; R.sx = ssx; R.sy = ssy; g.globalAlpha = 1; }
    }
  }

  /* ================================================================ the stall card (snacks, toys, games, rides with friends) */
  let card = null;
  function closeCard() {
    if (!card) return;
    try { card.el.remove(); } catch (e) { /* ignore */ }
    window.removeEventListener('keydown', card.onKey, true);
    if (N.player && card.locked === false) N.player.controlsLocked = false;
    card = null;
  }
  /** rows: [{label, sub, price (paise) | null, fn, why}] */
  function openCard(title, sub, rows) {
    closeCard();
    const host = document.getElementById('overlay') || document.body;
    const el = document.createElement('div');
    el.className = 'ff-card show'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
    const touch = !!(N.input && N.input.device === 'touch') || document.body.classList.contains('touch-on');
    el.innerHTML = '<div class="ff-card-in"><div class="ff-card-head"><b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div><div class="ff-card-rows">' +
      rows.map((r, i) => '<button type="button" class="ff-row' + (r.why ? ' dis' : '') + (i === 0 ? ' sel' : '') + '" data-i="' + i + '"><span class="ff-row-k">' + (touch ? '' : '<kbd>' + (i + 1) + '</kbd>') + '</span><span class="ff-row-n">' + esc(r.label) + (r.sub || r.why ? '<small>' + esc(r.why || r.sub) + '</small>' : '') + '</span><span class="ff-row-p">' + (r.price == null ? '' : r.price > 0 ? '₹' + (r.price % 100 ? (r.price / 100).toFixed(2) : r.price / 100) : 'free') + '</span></button>').join('') +
      '</div><div class="ff-card-foot">' + (touch ? '<button type="button" class="ff-close">Not now</button>' : '<kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>E</kbd> buy · <kbd>Esc</kbd> close') + '</div></div>';
    host.appendChild(el);
    const p = N.player;
    card = { el, rows, sel: 0, locked: null, t: nowMs() };
    if (p && !p.controlsLocked) { p.controlsLocked = true; card.locked = false; }
    const pick = (i) => {
      if (!card || nowMs() - card.t < 150) return;
      const r = rows[i]; if (!r) return;
      if (r.why) { sfx('ui_back', { ui: true }); toast(r.why, 1800); return; }
      sfx('ui_select', { ui: true });
      closeCard();
      try { r.fn && r.fn(); } catch (e) { N.err('funfair.card', e); }
    };
    const setSel = (i) => { if (!card) return; card.sel = (i + rows.length) % rows.length; el.querySelectorAll('.ff-row').forEach((b, k) => b.classList.toggle('sel', k === card.sel)); };
    el.addEventListener('click', (e) => { const b = e.target.closest('.ff-row'); if (b) { e.preventDefault(); pick(+b.dataset.i); return; } if (e.target.closest('.ff-close')) { e.preventDefault(); closeCard(); } });
    card.onKey = (e) => {
      if (!card) return;
      const c = e.code;
      if (c === 'Escape' || c === 'KeyQ') { e.preventDefault(); e.stopPropagation(); closeCard(); return; }
      if (c === 'ArrowUp' || c === 'KeyW') { e.preventDefault(); e.stopPropagation(); setSel(card.sel - 1); return; }
      if (c === 'ArrowDown' || c === 'KeyS') { e.preventDefault(); e.stopPropagation(); setSel(card.sel + 1); return; }
      if (c === 'Enter' || c === 'KeyE' || c === 'Space' || c === 'KeyF') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) pick(card.sel); return; }
      const d = /^Digit([1-9])$/.exec(c);
      if (d) { e.preventDefault(); e.stopPropagation(); pick(+d[1] - 1); return; }
      e.stopPropagation();
    };
    window.addEventListener('keydown', card.onKey, true);
    if (N.input && N.input.clear) N.input.clear();
    return el;
  }
  const priceOf = (row) => PRICES[row] | 0;
  function snackCard() {
    const rows = Object.keys(SNACKS).map((id) => ({ label: SNACKS[id].name, sub: id === 'peanuts' ? 'in a paper cone' : id === 'candyfloss' ? 'candy floss on a stick' : id === 'bhutta' ? 'lemon, salt, chilli' : id === 'kulfi' ? 'matka kulfi' : 'the biggest papad in the world', price: priceOf(SNACKS[id].row), fn: () => { buy(SNACKS[id].row, () => { eatSnack(id); return { close: true }; }); } }));
    openCard('Moongphali · Candy cart', 'Snacks, hot and sweet', rows);
  }
  function toyCard() {
    const rows = [
      { label: 'Bubble blower', sub: 'a bottle of soap water and a ring (25 blows)', price: priceOf('ff_bubbles'), fn: () => buy('ff_bubbles', () => { giveToy('bubbles'); toast('Blow bubbles with ACTION. Watch them drift away on the wind!', 3000); return { close: true }; }) },
      { label: 'Balloon on a stick', sub: 'it bobs over your head', price: priceOf('ff_balloon'), fn: () => buy('ff_balloon', () => { giveToy('balloon'); return { close: true }; }) },
      { label: 'Phirki', sub: 'a paper windmill: run and it spins', price: priceOf('ff_phirki'), fn: () => buy('ff_phirki', () => { giveToy('phirki'); return { close: true }; }) },
      { label: 'Plastic whistle', sub: 'very loud, very fun', price: priceOf('ff_whistle'), fn: () => buy('ff_whistle', () => { giveToy('whistle'); return { close: true }; }) },
      { label: 'Toy flute', sub: 'bamboo, four holes', price: priceOf('ff_flute'), fn: () => buy('ff_flute', () => { giveToy('flute'); return { close: true }; }) },
    ];
    openCard('Khilone · Toy cart', 'Balloons, bubbles, phirkis', rows);
  }

  /* ================================================================ the world: E prompts */
  function friendsHere() { try { return !!(N.party && N.party.challenge && N.online && N.online.room && (N.online.room.n | 0) > 1); } catch (e) { return false; } }
  function challengeFriends(pid, opts) {
    registerParty();
    let r = null;
    try { r = N.party.challenge(pid, opts || {}); } catch (e) { N.err('funfair.challenge', e); }
    if (!r || !r.ok) toast((r && r.why) || 'Could not start the challenge.', 2400);
    return r;
  }
  function stallCard(st) {
    const name = GAME_NAMES[st.game];
    const rows = [
      { label: 'Play ' + name.toLowerCase(), sub: { ff_rings: 'five rings', ff_cans: 'three balls', ff_darts: 'five darts' }[st.game] + ' · Immu, Ayesha and Pappu play too', price: PRICES[st.game], fn: () => buy(st.game, () => { setTimeout(() => playGame(st.game, {}), 30); return { close: true }; }) },
      { label: 'Fair challenge', sub: 'ring toss, tin cans and balloons in a row: total points', price: PRICES.ff_challenge, fn: () => buy('ff_challenge', () => { setTimeout(() => challenge({}), 30); return { close: true }; }) },
    ];
    if (friendsHere()) {
      rows.push({ label: 'Challenge friends: ' + name, sub: 'everyone in the room plays the same stall', price: PRICES[st.game], fn: () => buy(st.game, () => { challengeFriends(PARTY_IDS[st.game], {}); return { close: true }; }) });
      rows.push({ label: 'Challenge friends: Fair challenge', sub: 'all three stalls, points totalled', price: PRICES.ff_challenge, fn: () => buy('ff_challenge', () => { challengeFriends('fair_challenge', {}); return { close: true }; }) });
    }
    openCard(st.name, 'Numaish stall · prizes in the tin', rows);
  }
  function rideUse(id) {
    const spec = RIDES[id];
    if (!fairOpen()) { toast(closedWhy(), 2200); return; }
    if (friendsHere()) {
      openCard(spec.name, 'Ride alone or with your friends', [
        { label: 'Ride now', sub: 'just you (and a few strangers)', price: PRICES[spec.row], fn: () => buy(spec.row, () => { setTimeout(() => startRide(id, {}), 30); return { close: true }; }) },
        { label: 'Ride with friends', sub: 'invite the room: same ' + (id === 'wheel' ? 'gondola' : id === 'bumper' ? 'arena: bump each other!' : 'ride'), price: PRICES[spec.row], fn: () => buy(spec.row, () => { challengeFriends(PARTY_IDS[id], {}); return { close: true }; }) },
      ]);
      return;
    }
    buy(spec.row, () => { setTimeout(() => startRide(id, {}), 30); return { close: true }; });
  }
  const IA = [];
  function installInteracts() {
    const I = N.interact, S = spots();
    if (!I || !I.add || !S.ok) return;
    for (const k of IA) I.remove(k);
    IA.length = 0;
    const add = (key, x, y, label, use, extra) => {
      IA.push(key);
      I.add(key, Object.assign({
        // priority 4 within 9 u: beats the Numaish card (shops, 3) right at a stall; story prompts (7) still win
        x, y, r: 9, priority: 4,
        label: () => (fairOpen() ? label() : label().replace(/ ₹.*$/, '') + ' · ' + closedWhy()),
        enabled: (pl) => fairOn() && !RD && !gameBusy && !card && !(pl && pl.vehicle) && !(N.party && N.party.active) && (!/^ff:(ride|stall)/.test(key) || !(N.missions && N.missions.active)),
        use: () => { if (!fairOpen()) { toast(closedWhy(), 2200); return; } use(); },
      }, extra || {}));
    };
    const rs = (p) => '₹' + (p % 100 ? (p / 100).toFixed(2) : p / 100);
    for (const st of S.stalls) add('ff:stall:' + st.id, st.ix, st.iy, () => GAME_NAMES[st.game] + ' ' + rs(PRICES[st.game]), () => stallCard(st));
    for (const c of S.carts) add('ff:cart:' + c.id, c.ix, c.iy, () => (c.id === 'snacks' ? 'Peanuts, candy floss, bhutta' : 'Balloons, bubbles, toys'), () => (c.id === 'snacks' ? snackCard() : toyCard()));
    for (const id of Object.keys(RIDES)) {
      const at = { wheel: S.wheel, columbus: S.columbus, carousel: S.carousel, cups: S.cups, bumper: S.bumper, train: S.train, maut: S.maut }[id];
      if (!at || !isFinite(at.ix)) continue;
      add('ff:ride:' + id, at.ix, at.iy, () => (id === 'maut' ? 'Watch the maut ka kuan ' : id === 'bumper' ? 'Drive the dashing cars ' : 'Ride the ' + RIDES[id].name.toLowerCase() + ' ') + rs(PRICES[RIDES[id].row]), () => rideUse(id));
    }
  }

  /* ================================================================ 2D drawing */
  const D2 = () => N.draw;
  function inGroundsView() { const S = spots(); if (!S.ok) return false; const g = S.g; return N.render.rectInView(g[0] - 20, g[1] - 60, g[2] - g[0] + 40, g[3] - g[1] + 80, 80); }
  // Signboards: drawn last ('fx', above the crowd, the night grade and the bulb glow), pixel text on a dark plate with a
  // coloured edge, so a ride or stall name is never lost under people or light. Twice the size when the camera is close.
  const LBL = [];
  function label(x, y, h, text, open, edge, room) { LBL.push({ x, y, h, text, col: open ? '#ffe070' : '#c8c0b0', edge: edge || '#c8302a', room: room || 0 }); }
  function flushLabels() {
    if (!LBL.length) return;
    const list = LBL.splice(0, LBL.length);
    N.render.queue('fx', 0, (ctx) => {
      const R = N.render, D = N.draw, placed = [];
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      list.sort((a, b) => a.y - b.y);
      for (const q of list) {
        const c = D.pixelTextCanvas(q.text, q.col, '#140c10');
        const k = R.k(q.h);
        // twice the size when the camera is close, unless that is wider than the thing it names (the stall row)
        const s = R.Z >= 2.2 && (!q.room || c.width * 2 + 8 <= q.room * k) ? 2 : 1;
        const w = c.width * s, h = c.height * s, p = 2 * s;
        let x0 = Math.round(R.sx(q.x, k)) - Math.round(w / 2), y0 = Math.round(R.sy(q.y, k)) - Math.round(h / 2);
        // never on top of another signboard: step up until clear
        for (let tries = 0; tries < 4; tries++) {
          const hit = placed.find((r) => x0 - p < r[0] + r[2] && x0 + w + p > r[0] && y0 - p < r[1] + r[3] && y0 + h + p > r[1]);
          if (!hit) break;
          y0 = hit[1] - h - p - 1;
        }
        placed.push([x0 - p, y0 - p, w + p * 2, h + p * 2]);
        ctx.fillStyle = 'rgba(20,12,24,0.84)'; ctx.fillRect(x0 - p, y0 - p, w + p * 2, h + p * 2);
        ctx.fillStyle = q.edge; ctx.fillRect(x0 - p, y0 + h + p - s, w + p * 2, s);
        ctx.drawImage(c, x0, y0, w, h);
      }
    });
  }
  // Rim bulbs: crisp points (no soft glow) on the light layer at night that trace each ride's outline.
  const RIM = []; let RIMn = 0;
  function rim(x, y, h, col) { let b = RIM[RIMn]; if (!b) b = RIM[RIMn] = { x: 0, y: 0, h: 0, col: '' }; b.x = x; b.y = y; b.h = h; b.col = col; RIMn++; }
  function flushRim(night) {
    if (!RIMn || night <= 0.2) { RIMn = 0; return; }
    const n = RIMn, list = RIM; RIMn = 0;
    const blink = Math.floor(AMB.t * 4);
    N.render.queue('light', 0, (ctx) => {
      const R = N.render;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(0.95, 0.4 + night * 0.6);
      for (let i = 0; i < n; i++) {
        if ((i + blink) % 6 === 0) continue; // chase
        const b = list[i], k = R.k(b.h), r = Math.max(0.7, 0.42 * k);
        ctx.fillStyle = b.col; ctx.fillRect(R.sx(b.x, k) - r, R.sy(b.y, k) - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    });
  }
  function drawStall2D(st, open, night) {
    const D = D2(), R = N.render;
    // the strip in front of the counter: a dhurrie and a chalk line (where you stand to play; the crowd keeps off it)
    R.queue('ground', 3, () => D.flat((g) => {
      g.fillStyle = open ? 'rgba(120,40,34,0.55)' : 'rgba(90,70,60,0.35)'; g.fillRect(st.x + 1.5, st.y - 6.5, st.w - 3, 5.5);
      g.strokeStyle = 'rgba(250,244,230,0.7)'; g.lineWidth = 0.35; g.beginPath(); g.moveTo(st.x + 1, st.y - 7.2); g.lineTo(st.x + st.w - 1, st.y - 7.2); g.stroke();
    }));
    R.queue('structures', R.distKey(st.cx, st.cy), () => {
      const x = st.x, y = st.y, w = st.w, d = st.d;
      // back wall + side walls (cloth), the counter at the front (north side)
      D.box(x, y + d - 1.2, w, 1.2, 0, 10, { wall: '#efe4d0', roof: U.shade(st.col, 0.8) });
      D.box(x, y, 0.8, d, 0, 10, { wall: st.col2, roof: st.col });
      D.box(x + w - 0.8, y, 0.8, d, 0, 10, { wall: st.col2, roof: st.col });
      D.box(x + 0.8, y, w - 1.6, 1.4, 0, 3.4, { wall: '#8a5a30', roof: '#b8864a' });
      // the goods on display
      if (st.id === 'rings') {
        D.box(x + 1.5, y + 2.2, w - 3, d - 4, 0, 3, { wall: '#2f6a3a', roof: '#3a7a44' });
        const k = R.k(3.2), ctx = R.ctx;
        for (let i = 0; i < 10; i++) { const bx = x + 2.6 + (i % 5) * (w - 5) / 4, by = y + 3 + Math.floor(i / 5) * 2.4; ctx.fillStyle = i === 3 ? '#f2c230' : ['#3a8a4a', '#6a4a2a', '#2a6a7a'][i % 3]; ctx.beginPath(); ctx.arc(R.sx(bx, k), R.sy(by, k), 0.7 * k, 0, TAU); ctx.fill(); }
      } else if (st.id === 'cans') {
        D.box(x + 2, y + d - 3.4, w - 4, 1.2, 0, 4.5, { wall: '#7a5030', roof: '#9a6a40' });
        const rows = [4, 3, 2, 1];
        rows.forEach((n, kk) => { for (let i = 0; i < n; i++) { const cx = x + w / 2 + (i - (n - 1) / 2) * 1.6; D.cyl(cx, y + d - 2.8, 0.7, 4.5 + kk * 1.6, 6 + kk * 1.6, { wall: ['#d8302a', '#2a5cd8', '#f2c230', '#2a9a4a'][(i + kk) % 4], top: '#c8ccd2', grad: false }); } });
      } else if (st.id === 'darts') {
        D.box(x + 1.5, y + d - 2, w - 3, 0.6, 2, 9.5, { wall: '#e8d0a0', roof: '#c8a070' });
        const k = R.k(6), ctx = R.ctx;
        for (let i = 0; i < 12; i++) { const bx = x + 2.6 + (i % 6) * (w - 5.2) / 5, by = y + d - 2.3; const kk = R.k(4 + Math.floor(i / 6) * 3); ctx.fillStyle = ['#e83a5a', '#2a8cd8', '#3ac06a', '#f2c230', '#9a5ae0', '#e8641a'][i % 6]; ctx.beginPath(); ctx.ellipse(R.sx(bx, kk), R.sy(by, kk) - 0.3 * kk, 0.8 * kk, 0.95 * kk, 0, 0, TAU); ctx.fill(); }
        void k;
      }
      // a striped awning over the counter (the booth is open on top, so its goods show from the kite's view) + the signboard
      D.box(x - 0.6, y - 1.6, w + 1.2, 3.2, 10, 11.2, { wall: U.shade(st.col, 0.75), roof: st.col, roofFn: (c, k2, rx, ry, rw, rd) => { c.fillStyle = 'rgba(255,250,235,0.85)'; for (let i = 0; i < 8; i += 2) c.fillRect(rx + (i / 8) * rw, ry, rw / 8, rd); } });
    });
    if (night > 0.2 && open) {
      R.lights.push({ x: st.cx, y: st.y - 3, r: 13, color: '#ffe0a0', intensity: 0.4, h: 9 });
      for (let i = 0; i <= 6; i++) rim(st.x + (i / 6) * st.w, st.y - 1.6, 11.2, i % 2 ? '#fff0b0' : st.col2);
    }
  }
  function drawCart2D(c, open, night) {
    const D = D2(), R = N.render, ca = Math.cos(c.a), sa = Math.sin(c.a);
    R.queue('structures', R.distKey(c.x, c.y), () => {
      D.box(c.x - 4.5, c.y - 2.5, 9, 5, 1.5, 4.5, { wall: c.col, roof: '#e8dcc0' });
      D.cyl(c.x - 3.2, c.y + 2.6, 1.2, 0, 2.4, { wall: '#3a3a3a', top: '#5a5a5a', grad: false }); D.cyl(c.x + 3.2, c.y + 2.6, 1.2, 0, 2.4, { wall: '#3a3a3a', top: '#5a5a5a', grad: false });
      if (c.id === 'snacks') {
        D.cyl(c.x + 1.8, c.y, 1.6, 4.5, 7, { wall: '#cfe6f2', top: '#ff9ad0', grad: false }); // the candy floss drum
        D.cyl(c.x - 2, c.y, 1.4, 4.5, 5.6, { wall: '#9a6a30', top: '#c8a060', grad: false }); // the peanut basket
        D.box(c.x - 0.4, c.y - 0.4, 0.8, 0.8, 4.5, 11, { wall: '#7a6a5a', roof: '#ffe070' }); // the petromax pole
      } else {
        D.box(c.x - 0.3, c.y - 0.3, 0.6, 0.6, 4.5, 16, { wall: '#8a6a3a', roof: '#8a6a3a' });
        const k = R.k(17), ctx = R.ctx, t = AMB.t;
        const cols = ['#e83a5a', '#2a8cd8', '#f2c230', '#3ac06a', '#9a5ae0', '#ff8a2a'];
        for (let i = 0; i < 9; i++) { const a = i * 0.72 + Math.sin(t * 1.3 + i) * 0.1, r = 2.4 + (i % 3) * 0.9; ctx.fillStyle = cols[i % 6]; ctx.beginPath(); ctx.ellipse(R.sx(c.x + Math.cos(a) * r, k), R.sy(c.y + Math.sin(a) * r, k), 1.7 * k, 2 * k, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(R.sx(c.x + Math.cos(a) * r - 0.5, k), R.sy(c.y + Math.sin(a) * r - 0.7, k), 0.45 * k, 0, TAU); ctx.fill(); }
        const k2 = R.k(10);
        for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(R.sx(c.x + (i - 1) * 1.6, k2), R.sy(c.y - 1.5, k2)); ctx.rotate(t * 4 + i); for (let j = 0; j < 4; j++) { ctx.fillStyle = cols[(i + j) % 6]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1.4 * k2, -0.3 * k2); ctx.lineTo(1.1 * k2, 0.9 * k2); ctx.fill(); ctx.rotate(PI / 2); } ctx.restore(); }
      }
      void ca; void sa;
    });
    label(c.x, c.y - 5.5, 8, c.id === 'snacks' ? 'MOONGPHALI' : 'KHILONE', open, c.id === 'snacks' ? '#e8641a' : '#4a8ce8');
    if (night > 0.2 && open) R.lights.push({ x: c.x, y: c.y, r: 12, color: c.id === 'snacks' ? '#fff0c0' : '#ffd0e0', intensity: 0.4, h: 10 });
  }
  function drawColumbus2D(night, open) {
    const S = spots(), C = S.columbus, R = N.render, D = D2();
    const ang = AMB.col;
    R.queue('structures', R.distKey(C.x, C.y), (ctx) => {
      // the A-frames at both ends of the axle (north and south) and the axle
      const legs = [[-9, -6.5], [9, -6.5], [-9, 6.5], [9, 6.5]];
      const kp = R.k(C.hp), kg = R.k(0);
      ctx.strokeStyle = '#7a8088'; ctx.lineWidth = Math.max(1, 0.9 * R.Z);
      for (const l of legs) { ctx.beginPath(); ctx.moveTo(R.sx(C.x + l[0], kg), R.sy(C.y + l[1], kg)); ctx.lineTo(R.sx(C.x, kp), R.sy(C.y + Math.sign(l[1]) * 5, kp)); ctx.stroke(); }
      ctx.strokeStyle = '#a8b0b8'; ctx.lineWidth = Math.max(1.2, 1.2 * R.Z); ctx.beginPath(); ctx.moveTo(R.sx(C.x, kp), R.sy(C.y - 5, kp)); ctx.lineTo(R.sx(C.x, kp), R.sy(C.y + 5, kp)); ctx.stroke();
      // the arms down to the boat
      const cx = C.x + C.rs * Math.sin(ang), ch = C.hp - C.rs * Math.cos(ang), kc = R.k(ch);
      ctx.strokeStyle = '#c8302a'; ctx.lineWidth = Math.max(1, 0.8 * R.Z);
      for (const sd of [-3.4, 3.4]) { ctx.beginPath(); ctx.moveTo(R.sx(C.x, kp), R.sy(C.y + sd, kp)); ctx.lineTo(R.sx(cx, kc), R.sy(C.y + sd, kc)); ctx.stroke(); }
      // the boat: a pirate-ship hull seen from above, its length foreshortened as it tilts
      const L = C.len / 2, ca = Math.cos(ang);
      D.plane(ch, (g) => {
        g.fillStyle = '#8a3a1a';
        g.beginPath(); g.moveTo(cx - L * ca - 2, C.y); g.quadraticCurveTo(cx - L * ca + 2, C.y - C.wid / 2 - 0.6, cx - L * ca + 5, C.y - C.wid / 2);
        g.lineTo(cx + L * ca - 5, C.y - C.wid / 2); g.quadraticCurveTo(cx + L * ca - 2, C.y - C.wid / 2 - 0.6, cx + L * ca + 2, C.y);
        g.quadraticCurveTo(cx + L * ca - 2, C.y + C.wid / 2 + 0.6, cx + L * ca - 5, C.y + C.wid / 2); g.lineTo(cx - L * ca + 5, C.y + C.wid / 2);
        g.quadraticCurveTo(cx - L * ca + 2, C.y + C.wid / 2 + 0.6, cx - L * ca - 2, C.y); g.fill();
        g.fillStyle = '#f2c230'; g.fillRect(cx - L * ca + 3, C.y - C.wid / 2 + 0.4, (L * ca - 3) * 2, 0.6); g.fillRect(cx - L * ca + 3, C.y + C.wid / 2 - 1, (L * ca - 3) * 2, 0.6);
        g.fillStyle = '#5a2a12'; for (let i = -2; i <= 2; i++) g.fillRect(cx + i * 5 * ca - 0.4, C.y - C.wid / 2 + 1.2, 0.8, C.wid - 2.4);
      });
      // strangers on the ambient rides (Chinnu's ride draws its own riders)
      if (open) {
        for (let i = 0; i < 6; i++) {
          const l = [-5, -5, 0, 0, 5, 5][i], sd = i % 2 ? 1.4 : -1.4, o = columbusSeat(C, ang, l, sd, _o);
          if (N.traffic && N.traffic.blitPerson) N.traffic.blitPerson(ctx, AMBLOOK(i), o.x, o.y, l < 0 ? 0 : PI, null, o.h);
        }
      }
    });
    label(C.x, C.y - 11, C.hp + 2, 'COLUMBUS', open, '#c8302a');
    if (night > 0.2 && open) {
      R.lights.push({ x: C.x, y: C.y, r: 20, color: '#ffd890', intensity: 0.35, h: 14 });
      // bulbs along both gunwales of the boat (they swing with it) and up the A-frames
      const cx = C.x + C.rs * Math.sin(ang), ch = C.hp - C.rs * Math.cos(ang), L = C.len / 2 - 3, ca = Math.cos(ang);
      for (let i = 0; i <= 8; i++) { const x = cx + (i / 8 * 2 - 1) * L * ca; rim(x, C.y - C.wid / 2 + 0.6, ch, i % 2 ? '#ffe070' : '#ff7040'); rim(x, C.y + C.wid / 2 - 0.6, ch, i % 2 ? '#ff7040' : '#ffe070'); }
      for (const sd of [-1, 1]) for (let i = 1; i <= 4; i++) { const t = i / 5; rim(C.x + sd * 9 * (1 - t), C.y - 6.5 + 1.5 * t, C.hp * t, '#fff0b0'); rim(C.x + sd * 9 * (1 - t), C.y + 6.5 - 1.5 * t, C.hp * t, '#fff0b0'); }
    }
  }
  const AMBL = [];
  function AMBLOOK(i) { if (!AMBL[i]) AMBL[i] = STRANGER(5000 + i * 37, i % 3 ? 'kid' : null); return AMBL[i]; }
  function drawBumper2D(night, open) {
    const S = spots(), B = S.bumper, R = N.render, D = D2();
    R.queue('ground', 3, () => {
      D.flat((g) => {
        g.fillStyle = '#3a4048'; g.fillRect(B.x, B.y, B.w, B.d);
        g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 0.3; for (let x = B.x + 3; x < B.x + B.w; x += 3) { g.beginPath(); g.moveTo(x, B.y); g.lineTo(x, B.y + B.d); g.stroke(); }
      });
    });
    R.queue('structures', R.distKey(B.x + B.w / 2, B.y + B.d / 2) - 0.2, (ctx) => {
      // the rubber-lined fence (low), the posts and the roof frame (edges only, so the cars show)
      for (const [x, y, w, d] of [[B.x - 1, B.y - 1, B.w + 2, 1], [B.x - 1, B.y + B.d, B.w + 2, 1], [B.x - 1, B.y, 1, B.d], [B.x + B.w, B.y, 1, B.d]]) D.box(x, y, w, d, 0, 2.2, { wall: '#f2c230', roof: '#1a1a1a' });
      for (const [x, y] of [[B.x, B.y], [B.x + B.w, B.y], [B.x, B.y + B.d], [B.x + B.w, B.y + B.d], [B.x + B.w / 2, B.y], [B.x + B.w / 2, B.y + B.d]]) D.cyl(x, y, 0.5, 0, 13, { wall: '#c8302a', top: '#c8302a', grad: false });
      const k = R.k(13);
      ctx.strokeStyle = 'rgba(200,48,42,0.9)'; ctx.lineWidth = Math.max(1, 0.7 * R.Z); ctx.strokeRect(R.sx(B.x, k), R.sy(B.y, k), B.w * k, B.d * k);
      ctx.strokeStyle = 'rgba(160,170,180,0.35)'; ctx.lineWidth = 0.6; ctx.beginPath(); for (let x = B.x + 4; x < B.x + B.w; x += 4) { ctx.moveTo(R.sx(x, k), R.sy(B.y, k)); ctx.lineTo(R.sx(x, k), R.sy(B.y + B.d, k)); } ctx.stroke();
    });
    // signboards sit on the south side of a ride: a rider's speech bubble rises above them, so it never covers the name
    label(B.x + B.w / 2, B.y + B.d + 2.5, 3, 'DASHING CARS', open, '#c8302a');
    const cars = bumperCars();
    for (const car of cars) {
      R.queue('structures', R.distKey(B.x + B.w / 2, B.y + B.d / 2) + 0.4, (ctx) => {
        D.sprite(car.x, car.y, car.a, 1.2, (g) => {
          g.fillStyle = '#1a1a1a'; g.beginPath(); g.ellipse(0, 0, CAR_R + 0.4, CAR_R * 0.82 + 0.4, 0, 0, TAU); g.fill();
          g.fillStyle = car.flash > 0 ? '#ffffff' : car.col; g.beginPath(); g.ellipse(0.2, 0, CAR_R - 0.3, CAR_R * 0.82 - 0.4, 0, 0, TAU); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0.8, -1.2, 1.4, 2.4);
        });
        const kp = R.k(12.5);
        ctx.strokeStyle = '#8a8a90'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(R.sx(car.x - Math.cos(car.a) * 2, R.k(2)), R.sy(car.y - Math.sin(car.a) * 2, R.k(2))); ctx.lineTo(R.sx(car.x - Math.cos(car.a) * 2, kp), R.sy(car.y - Math.sin(car.a) * 2, kp)); ctx.stroke();
        if (car.spark > 0 || Math.random() < 0.04) { ctx.fillStyle = '#bfe8ff'; ctx.fillRect(R.sx(car.x - Math.cos(car.a) * 2, kp) - 1, R.sy(car.y - Math.sin(car.a) * 2, kp) - 1, 2, 2); }
        if (!car.rider && N.traffic && N.traffic.blitPerson) N.traffic.blitPerson(ctx, car.look || AMBLOOK(car.i), car.x - Math.cos(car.a) * 0.6, car.y - Math.sin(car.a) * 0.6, car.a, null, 2.2);
      });
    }
    if (night > 0.2 && open) {
      R.lights.push({ x: B.x + B.w / 2, y: B.y + B.d / 2, r: 22, color: '#e0f0ff', intensity: 0.35, h: 13 });
      // a frame of bulbs round the roof: the arena reads as a lit rectangle
      for (let x = 0; x <= B.w; x += 4) { rim(B.x + x, B.y, 13, (x / 4) % 2 ? '#fff4d0' : '#ffd040'); rim(B.x + x, B.y + B.d, 13, (x / 4) % 2 ? '#ffd040' : '#fff4d0'); }
      for (let y = 4; y < B.d; y += 4) { rim(B.x, B.y + y, 13, '#fff4d0'); rim(B.x + B.w, B.y + y, 13, '#fff4d0'); }
    }
  }
  function drawCups2D(night, open) {
    const S = spots(), C = S.cups, R = N.render, D = D2();
    R.queue('structures', R.distKey(C.x, C.y), (ctx) => {
      const k0 = R.k(0.8);
      ctx.fillStyle = 'rgba(30,18,36,0.9)'; ctx.beginPath(); ctx.arc(R.sx(C.x, R.k(0)), R.sy(C.y, R.k(0)), (C.r + 0.9) * R.k(0), 0, TAU); ctx.fill();
      D.cyl(C.x, C.y, C.r, 0, 0.8, { wall: '#5a3a6a', top: '#9a78b0', grad: false });
      ctx.strokeStyle = '#f2c230'; ctx.lineWidth = Math.max(1, 0.45 * k0); ctx.beginPath(); ctx.arc(R.sx(C.x, k0), R.sy(C.y, k0), (C.r - 0.3) * k0, 0, TAU); ctx.stroke();
      D.cyl(C.x, C.y, 1.6, 0.8, 4, { wall: '#f2c230', top: '#e8402a', grad: false });
      for (let j = 0; j < 6; j++) {
        const o = cupCenter(j, { x: 0, y: 0 }), col = ['#e83a5a', '#2a8cd8', '#3ac06a', '#f2c230', '#ff8a2a', '#9a5ae0'][j];
        D.cyl(o.x, o.y, 2.6, 0.8, 1.6, { wall: '#f4f0e0', top: '#e8e0d0', grad: false });
        D.cyl(o.x, o.y, 2.2, 1.6, 3.2, { wall: col, top: U.shade(col, 0.55), grad: false });
        const k = R.k(3.25); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.8, 0.35 * k); ctx.beginPath(); ctx.arc(R.sx(o.x, k), R.sy(o.y, k), 2.0 * k, AMB.cupsS[j], AMB.cupsS[j] + 1.2); ctx.stroke();
        if (open && (j === 2 || j === 4) && N.traffic && N.traffic.blitPerson) { const a = AMB.cupsS[j]; N.traffic.blitPerson(ctx, AMBLOOK(10 + j), o.x + Math.cos(a) * CUP_SEAT, o.y + Math.sin(a) * CUP_SEAT, a + PI, null, 3); }
      }
    });
    label(C.x, C.y + C.r + 3.5, 1, 'CUP & SAUCER', open, '#c8307a');
    if (night > 0.2 && open) {
      R.lights.push({ x: C.x, y: C.y, r: 15, color: '#ffc0f0', intensity: 0.35, h: 8 });
      for (let i = 0; i < 20; i++) { const a = AMB.cupsP * 0.5 + i * TAU / 20; rim(C.x + Math.cos(a) * C.r, C.y + Math.sin(a) * C.r, 0.9, i % 2 ? '#ff8ad0' : '#ffe070'); }
    }
  }
  function drawMaut2D(open) {
    const S = spots(), M = S.maut, R = N.render, p = N.player;
    if (!M || !open || !p || Math.hypot(p.x - M.x, p.y - M.y) > 360) return;
    // two more riders on the wall (places_art draws one): a motorbike and a little car, banking round
    R.queue('structures', R.distKey(M.x, M.y) + 0.3, (ctx) => {
      for (let i = 1; i < 3; i++) {
        const a = AMB.mautA[i], h = 5 + Math.sin(a * 0.5 + i) * 3 + i, r = M.r - 1.6;
        N.draw.sprite(M.x + Math.cos(a) * r, M.y + Math.sin(a) * r, a + PI / 2, h, (g) => {
          if (i === 2) { g.fillStyle = '#2a6ad8'; g.fillRect(-2.2, -1.3, 4.4, 2.6); g.fillStyle = '#bfe0ff'; g.fillRect(-0.4, -1, 1.2, 2); }
          else { g.fillStyle = '#1a1a1a'; g.fillRect(-1.6, -0.4, 3.2, 0.8); g.fillStyle = '#f2c230'; g.beginPath(); g.arc(0, 0, 0.7, 0, TAU); g.fill(); }
        });
      }
    });
  }
  function drawHeldAll2D() {
    const p = N.player, R = N.render, t = AMB.t;
    const kind = heldOf(TOY);
    if (p && kind && !p.hidden && !p.vehicle) {
      const a = isFinite(p.facing) ? p.facing : p.angle || 0;
      R.queue('actors', p.y + 0.6, (ctx) => drawHeld2D(ctx, kind, p.x, p.y, 4, a, 1, { color: TOY.color, spin: TOY.spin, bop: TOY.bop, t }));
    }
    for (const q of ghostToys()) {
      if (!q.held) continue;
      const e = q.e;
      R.queue('actors', e.y + 0.6, (ctx) => drawHeld2D(ctx, q.held, e.x, e.y, 4, e.angle || 0, 1, { color: q.color, spin: t * 3, t }));
    }
    if (TOY.notes.length) R.queue('sky', 3, (ctx) => {
      for (const n of TOY.notes) { if (n.t < 0) continue; const k = R.k(8 + n.t * 8); ctx.globalAlpha = Math.max(0, 1 - n.t / n.life); ctx.fillStyle = '#ffe9a0'; ctx.font = 'bold ' + Math.round(4 * k) + 'px serif'; ctx.fillText(n.t % 0.6 < 0.3 ? '♪' : '♫', R.sx(n.x + n.dx * n.t, k), R.sy(n.y - n.t * 2, k)); }
      ctx.globalAlpha = 1;
    });
  }
  function draw2D() {
    if (is3D()) return;
    if (mode() === 'title' || mode() === 'boot') return;
    if (fairOn() && inGroundsView()) {
      const S = spots(), open = fairOpen(), night = (N.render && N.render.night) || 0;
      for (const st of S.stalls) if (N.render.inView(st.cx, st.cy, 40)) drawStall2D(st, open, night);
      // the stall signboards: one each when the camera is close enough for them to fit over their own booth, else one
      // board for the alley (stacked boards would climb up over the giant wheel)
      const s0 = S.stalls[0], s2 = S.stalls[S.stalls.length - 1];
      if (N.render.inView(s0.cx, s0.cy, 60) || N.render.inView(s2.cx, s2.cy, 60)) {
        const kk = N.render.k(12.4), fit = S.stalls.every((st) => N.draw.pixelTextWidth(st.name) + 6 <= (st.w + 1) * kk);
        if (fit) for (const st of S.stalls) label(st.cx, st.y - 1.4, 12.4, st.name, open, st.col2, st.w + 1);
        else label((s0.x + s2.x + s2.w) / 2, s0.y - 1.4, 12.4, 'RING TOSS / CANS / BALLOONS', open, '#f2c230');
      }
      for (const c of S.carts) if (N.render.inView(c.x, c.y, 40)) drawCart2D(c, open, night);
      if (N.render.inView(S.columbus.x, S.columbus.y, 60)) drawColumbus2D(night, open);
      if (N.render.inView(S.bumper.x + S.bumper.w / 2, S.bumper.y + S.bumper.d / 2, 60)) drawBumper2D(night, open);
      if (N.render.inView(S.cups.x, S.cups.y, 40)) drawCups2D(night, open);
      drawMaut2D(open);
      if (S.carousel && N.render.inView(S.carousel.x, S.carousel.y, 40)) label(S.carousel.x, S.carousel.y - S.carousel.r - 3, 13, 'MERRY-GO-ROUND', open, '#e8303a'); // north: the cups are just south of it
      if (S.train && N.render.inView(S.train.cx, S.train.cy, 60)) label(S.train.cx, S.train.cy, 4, 'TOY TRAIN', open, '#2a5cd8');
      flushRim(night);
      flushLabels();
    }
    drawBubbles2D();
    drawHeldAll2D();
  }

  /* ================================================================ 3D (three.js r149 through N.view3d.registerLayer) */
  let THREE = null, H3 = null, ROOT = null;
  const M3 = {};
  const UNI3 = { uN: { value: 0 }, uScale: { value: 300 }, uGlowI: { value: 0 } };
  const ST3 = { builds: 0, disposed: 0, buildMs: 0, site: false, calls: 0 };
  // merged triangles, flat normals, linear vertex colours, a per-vertex glow amount (lit at night), optional uv
  class GB {
    constructor() { this.p = []; this.n = []; this.c = []; this.g = []; this.uv = []; this.hasUV = false; this.cr = 1; this.cg = 1; this.cb = 1; this.gl = 0; }
    col(hex, glow) { const c = H3.color(hex); this.cr = c.r; this.cg = c.g; this.cb = c.b; this.gl = glow || 0; return this; }
    tri(a, b, c, ua, ub, uc) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      for (let i = 0; i < 3; i++) { this.c.push(this.cr, this.cg, this.cb); this.g.push(this.gl); }
      if (ua) { this.hasUV = true; this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]); } else this.uv.push(0, 0, 0, 0, 0, 0);
      return this;
    }
    quad(a, b, c, d, uv) { this.tri(a, b, c, uv && uv[0], uv && uv[1], uv && uv[2]); return this.tri(a, c, d, uv && uv[0], uv && uv[2], uv && uv[3]); }
    box(x0, y0, z0, x1, y1, z1) {
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]); this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
      return this;
    }
    cyl(cx, y0, cz, r0, r1, h, seg, cap) {
      seg = seg || 10;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        this.quad([cx + c0 * r0, y0, cz + s0 * r0], [cx + c1 * r0, y0, cz + s1 * r0], [cx + c1 * r1, y0 + h, cz + s1 * r1], [cx + c0 * r1, y0 + h, cz + s0 * r1]);
        if (cap && r1 > 0.01) this.tri([cx, y0 + h, cz], [cx + c0 * r1, y0 + h, cz + s0 * r1], [cx + c1 * r1, y0 + h, cz + s1 * r1]);
      }
      return this;
    }
    blob(cx, cy, cz, rx, ry, rz, seg) {
      seg = seg || 6; const rings = 4;
      const v = (p, a) => [cx + Math.cos(p) * Math.cos(a) * rx, cy + Math.sin(p) * ry, cz + Math.cos(p) * Math.sin(a) * rz];
      for (let j = 0; j < rings; j++) { const p0 = -PI / 2 + (j / rings) * PI, p1 = -PI / 2 + ((j + 1) / rings) * PI; for (let i = 0; i < seg; i++) { const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU; this.quad(v(p0, a0), v(p0, a1), v(p1, a1), v(p1, a0)); } }
      return this;
    }
    rod(ax, ay, az, bx, by, bz, r) {
      const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1;
      let ux = -dz, uz = dx; let ul = Math.hypot(ux, uz); if (ul < 1e-4) { ux = 1; uz = 0; ul = 1; }
      ux = (ux / ul) * r; uz = (uz / ul) * r;
      const vx = (dy * uz) / L, vy = (dz * ux - dx * uz) / L, vz = (-dy * ux) / L;
      const c = (s, t, e) => (e ? [bx + ux * s + vx * t, by + vy * t, bz + uz * s + vz * t] : [ax + ux * s + vx * t, ay + vy * t, az + uz * s + vz * t]);
      const k = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      for (let i = 0; i < 4; i++) { const p = k[i], q = k[(i + 1) % 4]; this.quad(c(p[0], p[1], 0), c(q[0], q[1], 0), c(q[0], q[1], 1), c(p[0], p[1], 1)); }
      return this;
    }
    kid(x, y, z, look, s) { // a seated stranger: body + head + hair (static, inside a prop)
      look = look || {}; s = s || 1;
      this.col(look.shirt || '#d8402a', 0.05).blob(x, y + 1.2 * s, z, 0.8 * s, 1.2 * s, 0.6 * s, 6);
      this.col(look.skin || '#a8703f', 0.05).blob(x, y + 2.9 * s, z, 0.62 * s, 0.7 * s, 0.62 * s, 6);
      return this.col(look.hair || '#1a1412', 0).blob(x, y + 3.25 * s, z, 0.64 * s, 0.38 * s, 0.64 * s, 6);
    }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.g, 1));
      if (this.hasUV) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.computeBoundingSphere();
      return g;
    }
    mesh(mat) { if (!this.p.length) return null; const m = new THREE.Mesh(this.geometry(), mat || M3.solid); m.castShadow = !!(H3.quality && H3.quality.shadows); m.receiveShadow = !!(H3.quality && H3.quality.shadows); return m; }
  }
  const SIGNS3 = ['RING TOSS', 'TIN CANS', 'BALLOONS', 'DASHING CARS', 'COLUMBUS', 'CUP & SAUCER', 'MOONGPHALI', 'KHILONE'];
  const SIGNCOL = [['#c8302a', '#ffe060'], ['#2a5cb8', '#ffffff'], ['#2a8c3a', '#ffe060'], ['#1a1a1a', '#f2c230'], ['#8a3a1a', '#ffe8a0'], ['#7a3a9a', '#ffffff'], ['#e8641a', '#ffffff'], ['#2a5cb8', '#ffe060']];
  function initMat3() {
    if (M3.solid) return;
    const solid = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    solid.onBeforeCompile = (sh) => {
      sh.uniforms.uFfN = UNI3.uN;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vFfG;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvFfG = aGlow;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFfN;\nvarying float vFfG;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * vFfG * uFfN;');
    };
    solid.customProgramCacheKey = () => 'ff3d-solid';
    M3.solid = solid;
    M3.sign = new THREE.MeshBasicMaterial({ map: H3.tex('ff3d:signs', 512, 256, (g) => {
      SIGNS3.forEach((t, i) => {
        const x = (i % 2) * 256, y = Math.floor(i / 2) * 64, c = SIGNCOL[i];
        g.fillStyle = c[0]; g.fillRect(x, y, 256, 64);
        g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 4; g.strokeRect(x + 4, y + 4, 248, 56);
        g.fillStyle = c[1]; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x + 128, y + 33, 236);
      });
    }), side: THREE.DoubleSide });
    const glowTex = H3.tex('ff3d:glow', 64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { linear: true });
    M3.glow = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTex }, uI: UNI3.uGlowI, uScale: UNI3.uScale },
      vertexShader: 'attribute vec3 gCol; attribute float gSize; uniform float uScale; uniform float uI; varying vec3 vC; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = max(1.0, -mv.z); gl_PointSize = clamp(gSize * uScale / d, 0.0, 30.0); vC = gCol * uI * smoothstep(4.0, 18.0, d); }',
      fragmentShader: 'uniform sampler2D map; varying vec3 vC; void main(){ float a = texture2D(map, gl_PointCoord).r; gl_FragColor = vec4(vC * a, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    M3.bubble = new THREE.ShaderMaterial({
      uniforms: { uScale: UNI3.uScale },
      vertexShader: 'attribute float bSize; attribute float bPh; attribute float bA; uniform float uScale; varying float vPh; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(bSize * uScale / max(1.0, -mv.z), 0.0, 90.0); vPh = bPh; vA = bA; }',
      fragmentShader: 'varying float vPh; varying float vA; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard; float rim = smoothstep(0.62, 0.98, r) * (1.0 - smoothstep(0.98, 1.0, r)); vec3 film = 0.6 + 0.4 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + r * 1.4 + vPh)); float hl = smoothstep(0.22, 0.0, length(p - vec2(-0.38, 0.4))); float a = (rim * 0.75 + 0.07 + hl * 0.85) * vA; gl_FragColor = vec4(mix(film, vec3(1.0), hl), a); }',
      transparent: true, depthWrite: false,
    });
  }
  function signQuad(b, i, cx, cy, cz, w, h, nx, nz) {
    // a board facing (nx, nz); atlas cell i
    const u0 = (i % 2) * 0.5, u1 = u0 + 0.5, v1 = 1 - Math.floor(i / 2) * 0.25, v0 = v1 - 0.25;
    const tx = -nz, tz = nx, hw = w / 2;
    b.quad([cx - tx * hw, cy - h / 2, cz - tz * hw], [cx + tx * hw, cy - h / 2, cz + tz * hw], [cx + tx * hw, cy + h / 2, cz + tz * hw], [cx - tx * hw, cy + h / 2, cz - tz * hw], [[u1, v0], [u0, v0], [u0, v1], [u1, v1]]);
  }
  function glowPoints(list) {
    if (!list.length) return null;
    const p = [], c = [], s = [];
    for (const q of list) { const col = H3.color(q[3]); p.push(q[0], q[1], q[2]); c.push(col.r, col.g, col.b); s.push(q[4] || 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('gCol', new THREE.Float32BufferAttribute(c, 3)); g.setAttribute('gSize', new THREE.Float32BufferAttribute(s, 1));
    g.computeBoundingSphere();
    const pts = new THREE.Points(g, M3.glow); pts.renderOrder = 9; pts.frustumCulled = false;
    return pts;
  }
  const BULBS = ['#ff5040', '#ffe040', '#50ff80', '#50a0ff', '#ff60e0'];
  function buildSite3() {
    const t0 = nowMs(), S = spots(), vs = VS();
    initMat3();
    const site = { grp: new THREE.Group(), ship: null, cups: null, cupKids: [], cars: [], bikes: [] };
    site.grp.name = 'funfair3d';
    const b = new GB(), sb = new GB(), glows = [];
    // ---- the three game stalls (fronts face north: -z)
    S.stalls.forEach((st, i) => {
      const x0 = st.x, x1 = st.x + st.w, z0 = st.y, z1 = st.y + st.d, H = 13;
      b.col('#efe4d0', 0.15).box(x0, 0, z1 - 1, x1, H, z1);
      b.col(st.col2, 0.2).box(x0, 0, z0, x0 + 0.6, H, z1).box(x1 - 0.6, 0, z0, x1, H, z1);
      b.col('#8a5a30', 0.05).box(x0 + 0.6, 0, z0, x1 - 0.6, 3.8, z0 + 1.4).col('#b8864a', 0.1).box(x0 + 0.4, 3.8, z0 - 0.2, x1 - 0.4, 4.1, z0 + 1.6);
      // the striped canopy sloping to the front
      for (let k = 0; k < 8; k++) { const xa = x0 - 0.6 + (k / 8) * (st.w + 1.2), xb = x0 - 0.6 + ((k + 1) / 8) * (st.w + 1.2); b.col(k % 2 ? '#f8f2e4' : st.col, 0.35).quad([xa, H + 2, z1], [xb, H + 2, z1], [xb, H - 0.5, z0 - 2], [xa, H - 0.5, z0 - 2]); }
      for (let k = 0; k <= 8; k++) { const x = x0 - 0.6 + (k / 8) * (st.w + 1.2); b.col(BULBS[k % 5], 2.2).blob(x, H - 0.9, z0 - 2, 0.3, 0.3, 0.3, 4); glows.push([x, H - 0.9, z0 - 2, BULBS[k % 5], 2.6]); }
      signQuad(sb, i, (x0 + x1) / 2, H + 1.6, z0 - 2.1, st.w - 2, 2.6, 0, -1);
      if (st.id === 'rings') {
        b.col('#2f6a3a', 0.1).box(x0 + 1.5, 0, z0 + 2.2, x1 - 1.5, 3.4, z1 - 1.8);
        for (let k = 0; k < 15; k++) { const bx = x0 + 2.6 + (k % 5) * ((st.w - 5.2) / 4), bz = z0 + 3 + Math.floor(k / 5) * 1.6; b.col(k === 7 ? '#f2c230' : ['#3a8a4a', '#6a4a2a', '#2a6a7a'][k % 3], 0.3).cyl(bx, 3.4, bz, 0.42, 0.42, 1.5, 6, true).cyl(bx, 4.9, bz, 0.42, 0.16, 0.9, 6, true); }
      } else if (st.id === 'cans') {
        b.col('#7a5030', 0.05).box(x0 + 2, 5, z1 - 2.6, x1 - 2, 5.4, z1 - 1.2).box(x0 + 2.5, 0, z1 - 2, x0 + 3, 5, z1 - 1.5).box(x1 - 3, 0, z1 - 2, x1 - 2.5, 5, z1 - 1.5);
        [4, 3, 2, 1].forEach((n, kk) => { for (let k = 0; k < n; k++) { const cx = (x0 + x1) / 2 + (k - (n - 1) / 2) * 1.5; b.col(['#d8302a', '#2a5cd8', '#f2c230', '#2a9a4a'][(k + kk) % 4], 0.3).cyl(cx, 5.4 + kk * 1.9, z1 - 1.9, 0.62, 0.62, 1.85, 8, true); } });
      } else {
        b.col('#e8d0a0', 0.15).box(x0 + 1.5, 2.5, z1 - 1.8, x1 - 1.5, 11.5, z1 - 1.3);
        for (let k = 0; k < 18; k++) { const bx = x0 + 2.6 + (k % 6) * ((st.w - 5.2) / 5), by = 4 + Math.floor(k / 6) * 2.6; b.col(k === 8 ? '#f2c230' : ['#e83a5a', '#2a8cd8', '#3ac06a', '#9a5ae0', '#e8641a', '#f4f0e8'][k % 6], 0.35).blob(bx, by, z1 - 2.4, 0.8, 0.95, 0.6, 6); }
      }
    });
    // ---- the two carts in the main lane
    S.carts.forEach((c, i) => {
      const ca = Math.cos(c.a), sa = Math.sin(c.a);
      const P = (u, v) => [c.x + u * ca - v * sa, c.y + u * sa + v * ca];
      const q = [P(-2.5, -4.5), P(2.5, -4.5), P(2.5, 4.5), P(-2.5, 4.5)];
      const xs = q.map((p) => p[0]), zs = q.map((p) => p[1]);
      b.col(c.col, 0.2).box(Math.min(...xs), 2.4, Math.min(...zs), Math.max(...xs), 5.6, Math.max(...zs));
      b.col('#e8dcc0', 0.2).box(Math.min(...xs) - 0.2, 5.6, Math.min(...zs) - 0.2, Math.max(...xs) + 0.2, 5.9, Math.max(...zs) + 0.2);
      for (const w of [P(2.6, -3), P(2.6, 3), P(-2.6, -3), P(-2.6, 3)]) b.col('#2a2a2a', 0).cyl(w[0], 0, w[1], 1.2, 1.2, 0.5, 8, true);
      if (c.id === 'snacks') {
        const d = P(0, 1.8); b.col('#cfe6f2', 0.4).cyl(d[0], 5.9, d[1], 1.6, 1.8, 2.6, 10).col('#ff9ad0', 0.5).blob(d[0], 8.6, d[1], 1.3, 0.9, 1.3, 6);
        const k = P(0, -2); b.col('#9a6a30', 0.1).cyl(k[0], 5.9, k[1], 1.5, 1.2, 1.2, 8, true).col('#c8a060', 0.1).blob(k[0], 7.1, k[1], 1.2, 0.5, 1.2, 6);
        const pl = P(0, 0); b.col('#7a6a5a', 0).cyl(pl[0], 5.9, pl[1], 0.15, 0.15, 6, 4).col('#fff4c0', 2.6).blob(pl[0], 12.2, pl[1], 0.6, 0.8, 0.6, 5); glows.push([pl[0], 12.2, pl[1], '#fff4c0', 7]);
      } else {
        const pl = P(0, 0); b.col('#8a6a3a', 0).cyl(pl[0], 5.9, pl[1], 0.2, 0.2, 12, 4);
        for (let k = 0; k < 8; k++) { const a = k * 0.8, r = 2 + (k % 2); b.col(['#e83a5a', '#2a8cd8', '#f2c230', '#3ac06a', '#9a5ae0', '#ff8a2a'][k % 6], 0.4).blob(pl[0] + Math.cos(a) * r, 19 + (k % 3), pl[1] + Math.sin(a) * r, 1.1, 1.35, 1.1, 6).col('#f4f4f4', 0).rod(pl[0], 17.9, pl[1], pl[0] + Math.cos(a) * r, 18 + (k % 3), pl[1] + Math.sin(a) * r, 0.04); }
        for (let k = 0; k < 3; k++) { const pp = P(1.2, -1.5 + k * 1.5); b.col('#c8a070', 0).cyl(pp[0], 5.9, pp[1], 0.08, 0.08, 3.4, 3); for (let j = 0; j < 4; j++) { const a = j * PI / 2 + k; b.col(['#e83a5a', '#f2c230', '#2a8cd8', '#3ac06a'][j], 0.3).tri([pp[0], 9.3, pp[1]], [pp[0] + Math.cos(a) * 1.2, 9.3 + Math.sin(a) * 1.2, pp[1]], [pp[0] + Math.cos(a + 0.6) * 1.1, 9.3 + Math.sin(a + 0.6) * 1.1, pp[1]]); } }
      }
      signQuad(sb, 6 + i, c.x, 7.4, c.y, 7.5, 1.9, -sa, ca);
    });
    // ---- the Columbus frame (the boat itself turns)
    const C = S.columbus, hp3 = 30;
    for (const sz of [-6.5, 6.5]) {
      b.col('#7a8088', 0.05).rod(C.x - 10, 0, C.y + sz * 1.2, C.x, hp3, C.y + sz * 0.8, 0.45).rod(C.x + 10, 0, C.y + sz * 1.2, C.x, hp3, C.y + sz * 0.8, 0.45);
      b.col('#c8302a', 0.3).cyl(C.x, hp3 - 1, C.y + sz * 0.8, 1.1, 1.1, 2, 8, true);
    }
    b.col('#a8b0b8', 0.1).rod(C.x, hp3, C.y - 6, C.x, hp3, C.y + 6, 0.5);
    b.col('#8a6a4a', 0.05).box(C.x - 8, 0, C.y + 5, C.x + 8, 1.6, C.y + 9); // the loading deck
    for (let k = 0; k <= 10; k++) glows.push([C.x - 10 + k * 2, 0.4 + (k % 2) * 0.2, C.y + 9.2, BULBS[k % 5], 2.4]);
    signQuad(sb, 4, C.x, 5, C.y + 9.3, 9, 2.2, 0, 1);
    // ---- dashing cars: floor, fence, posts, the roof frame + net
    const B = S.bumper, RH = 19.5;
    b.col('#3a4048', 0.05).box(B.x, 0, B.y, B.x + B.w, 0.25, B.y + B.d);
    for (const [x0, z0, x1, z1] of [[B.x - 1, B.y - 1, B.x + B.w + 1, B.y], [B.x - 1, B.y + B.d, B.x + B.w + 1, B.y + B.d + 1], [B.x - 1, B.y, B.x, B.y + B.d], [B.x + B.w, B.y, B.x + B.w + 1, B.y + B.d]]) b.col('#f2c230', 0.2).box(x0, 0, z0, x1, 2.4, z1).col('#1a1a1a', 0).box(x0, 1, z0 - 0.05, x1, 1.6, z1 + 0.05);
    const posts = [[B.x, B.y], [B.x + B.w, B.y], [B.x, B.y + B.d], [B.x + B.w, B.y + B.d], [B.x + B.w / 2, B.y], [B.x + B.w / 2, B.y + B.d]];
    for (const q of posts) b.col('#c8302a', 0.2).cyl(q[0], 0, q[1], 0.5, 0.5, RH, 6);
    b.col('#c8302a', 0.25).rod(B.x, RH, B.y, B.x + B.w, RH, B.y, 0.4).rod(B.x, RH, B.y + B.d, B.x + B.w, RH, B.y + B.d, 0.4).rod(B.x, RH, B.y, B.x, RH, B.y + B.d, 0.4).rod(B.x + B.w, RH, B.y, B.x + B.w, RH, B.y + B.d, 0.4);
    for (let x = B.x + 4; x < B.x + B.w; x += 4) b.col('#8a9098', 0.1).rod(x, RH - 0.2, B.y, x, RH - 0.2, B.y + B.d, 0.08);
    for (let z = B.y + 4; z < B.y + B.d; z += 4) b.col('#8a9098', 0.1).rod(B.x, RH - 0.2, z, B.x + B.w, RH - 0.2, z, 0.08);
    for (let k = 0; k <= 12; k++) { const x = B.x + (k / 12) * B.w; glows.push([x, RH + 0.6, B.y, BULBS[k % 5], 3]); glows.push([x, RH + 0.6, B.y + B.d, BULBS[(k + 2) % 5], 3]); b.col(BULBS[k % 5], 2.2).blob(x, RH + 0.6, B.y, 0.35, 0.35, 0.35, 4).blob(x, RH + 0.6, B.y + B.d, 0.35, 0.35, 0.35, 4); }
    signQuad(sb, 3, B.x + B.w / 2, RH + 3, B.y - 0.2, 16, 3.2, 0, -1);
    // ---- the cup-and-saucer base (the platform turns)
    const Cu = S.cups;
    b.col('#5a4a6a', 0.05).cyl(Cu.x, 0, Cu.y, Cu.r + 0.8, Cu.r + 0.8, 0.6, 18, true);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; glows.push([Cu.x + Math.cos(a) * (Cu.r + 0.9), 0.9, Cu.y + Math.sin(a) * (Cu.r + 0.9), BULBS[k % 5], 2.4]); }
    signQuad(sb, 5, Cu.x, 3, Cu.y - Cu.r - 1.6, 8, 2, 0, -1);
    const mesh = b.mesh(M3.solid); if (mesh) site.grp.add(mesh);
    const sm = sb.mesh(M3.sign); if (sm) { sm.castShadow = false; site.grp.add(sm); }
    site.glow = glowPoints(glows); if (site.glow) site.grp.add(site.glow);
    // ---- the Columbus boat: a pirate ship hanging from the pivot (rotation.z = the swing angle)
    {
      const g = new THREE.Group(); g.position.set(C.x, hp3, C.y);
      const k = new GB(), RS = 18, L = 13, Wd = 3.6, sg = [];
      const y0 = -RS - 2.6, y1 = -RS + 0.8;
      // hull: a box with pointed ends, a gold stripe, a dragon head
      k.col('#8a3a1a', 0.1).box(-L + 3, y0, -Wd, L - 3, y1, Wd);
      for (const s of [-1, 1]) { k.col('#8a3a1a', 0.1).quad([s * (L - 3), y0, -Wd], [s * (L + 1.5), y1 + 1.5, 0], [s * (L + 1.5), y1 + 1.5, 0], [s * (L - 3), y1, -Wd]).quad([s * (L - 3), y0, Wd], [s * (L - 3), y1, Wd], [s * (L + 1.5), y1 + 1.5, 0], [s * (L + 1.5), y1 + 1.5, 0]).tri([s * (L - 3), y0, -Wd], [s * (L - 3), y0, Wd], [s * (L + 1.5), y1 + 1.5, 0]); }
      k.col('#f2c230', 0.6).box(-L + 3, y1 - 0.6, -Wd - 0.05, L - 3, y1 - 0.2, Wd + 0.05);
      k.col('#2a8a4a', 0.3).blob(L + 2, y1 + 2.6, 0, 1.2, 1.4, 0.9, 6).col('#e83a3a', 0.4).blob(L + 2.9, y1 + 2.9, 0, 0.5, 0.3, 0.5, 4);
      for (let i = -2; i <= 2; i++) k.col('#5a2a12', 0).box(i * 5 - 0.6, y1 - 1.2, -Wd + 0.4, i * 5 + 0.6, y1 - 0.4, Wd - 0.4);
      // the arms up to the pivot
      for (const s of [-1, 1]) k.col('#c8302a', 0.2).rod(-L * 0.6, y1, s * Wd, 0, 0, s * 4.2, 0.35).rod(L * 0.6, y1, s * Wd, 0, 0, s * 4.2, 0.35);
      // strangers in the middle rows (Chinnu and friends take the end rows)
      [-5, 0, 5].forEach((l, i) => { for (const sd of [-1.4, 1.4]) k.kid(l, y1 - 2.2 + 0.2, sd, AMBLOOK(i * 2 + (sd > 0 ? 1 : 0)), 0.8); });
      for (let i = 0; i <= 12; i++) sg.push([-L + 1 + i * (2 * L - 2) / 12, y1 + 0.2, Wd + 0.1, BULBS[i % 5], 2.4]);
      const m = k.mesh(M3.solid); g.add(m);
      const gp = glowPoints(sg); if (gp) g.add(gp);
      site.ship = g; site.grp.add(g);
    }
    // ---- the cups: a turning platform with six spinning cups
    {
      const g = new THREE.Group(); g.position.set(Cu.x, 0, Cu.y);
      const base = new GB(); base.col('#c8a0d8', 0.15).cyl(0, 0.6, 0, Cu.r, Cu.r, 0.3, 18, true).col('#f2c230', 0.3).cyl(0, 0.9, 0, 1.6, 1.2, 3.6, 8, true).col('#e8402a', 0.4).blob(0, 4.8, 0, 1.4, 0.8, 1.4, 6);
      g.add(base.mesh(M3.solid));
      for (let j = 0; j < 6; j++) {
        const cg = new THREE.Group(); const a = (j / 6) * TAU; cg.position.set(Math.cos(a) * CUP_R, 0, Math.sin(a) * CUP_R);
        const k = new GB(), col = ['#e83a5a', '#2a8cd8', '#3ac06a', '#f2c230', '#ff8a2a', '#9a5ae0'][j];
        k.col('#f4f0e0', 0.15).cyl(0, 0.9, 0, 2.5, 2.5, 0.25, 12, true).col(col, 0.3).cyl(0, 1.15, 0, 1.7, 2.15, 2.3, 12).col('#ffffff', 0.4).cyl(0, 2.6, 0, 2.05, 2.1, 0.3, 12).col('#6a4a3a', 0).cyl(0, 1.2, 0, 0.5, 0.5, 1.2, 6, true);
        k.col(col, 0.3).rod(2.1, 2.2, 0, 2.9, 2.3, 0, 0.18);
        if (j >= 2) k.kid(CUP_SEAT, 0.2, 0, AMBLOOK(10 + j), 0.78);
        cg.add(k.mesh(M3.solid));
        g.add(cg); site.cupKids.push(cg);
      }
      site.cups = g; site.grp.add(g);
    }
    // ---- dashing cars: eight cars (each its own small mesh; the driver blob shows when no rider entity sits in it)
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group(), k = new GB(), d = new GB(), col = CAR_COLS[i % CAR_COLS.length];
      k.col('#1a1a1a', 0).cyl(0, 0.3, 0, CAR_R + 0.3, CAR_R + 0.3, 1.0, 12, true);
      k.col(col, 0.35).cyl(0, 1.3, 0, CAR_R - 0.2, CAR_R - 0.5, 1.2, 12, true).col(U.shade(col, 0.7), 0.2).box(0.6, 2.5, -1.4, 2.4, 3.4, 1.4);
      k.col('#8a8a90', 0).cyl(-2, 2.5, 0, 0.12, 0.12, RH - 2.5, 4).col('#bfe8ff', 1.5).blob(-2, RH - 0.3, 0, 0.35, 0.35, 0.35, 4);
      d.kid(-0.6, 1.2, 0, AMBLOOK(20 + i), 0.78);
      const m = k.mesh(M3.solid), dm = d.mesh(M3.solid);
      g.add(m); if (dm) { g.add(dm); g.userData.driver = dm; }
      g.visible = false;
      site.cars.push(g); site.grp.add(g);
    }
    // ---- the maut ka kuan riders (two bikes and a little car on the wall) while the show runs
    const M = S.maut;
    if (M) {
      for (let i = 0; i < 3; i++) {
        const g = new THREE.Group(), k = new GB();
        if (i === 2) { k.col('#2a6ad8', 0.3).box(-2.6, 0, -1.4, 2.6, 2, 1.4).col('#bfe0ff', 0.5).box(-0.6, 2, -1.1, 1.4, 3, 1.1); k.kid(-0.8, 1.4, 0, AMBLOOK(30), 0.7); }
        else { k.col('#1a1a1a', 0).cyl(-1.6, 0.9, 0, 0.9, 0.9, 0.3, 8, true).cyl(1.6, 0.9, 0, 0.9, 0.9, 0.3, 8, true).col(i ? '#c8202a' : '#f2c230', 0.3).box(-1.6, 1.1, -0.35, 1.6, 2.1, 0.35); k.kid(-0.4, 1.6, 0, { shirt: i ? '#f4f4f4' : '#2a2a2a', skin: '#8a5a35' }, 0.8); }
        g.add(k.mesh(M3.solid)); g.visible = false;
        site.bikes.push(g); site.grp.add(g);
      }
    }
    ST3.builds++; ST3.buildMs = +(nowMs() - t0).toFixed(1);
    return site;
  }
  const BUB3 = { pts: null };
  function ensureBubbles3() {
    if (BUB3.pts || !ROOT || !M3.bubble) return;
    const n = TUNE.bubbleCap, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('bSize', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('bPh', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('bA', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    const pts = new THREE.Points(g, M3.bubble); pts.frustumCulled = false; pts.renderOrder = 12; pts.visible = false;
    BUB3.pts = pts; ROOT.add(pts);
  }
  const HELD3 = new Map(); // holder key -> {kind, obj}
  function heldMesh(kind) {
    const k = new GB();
    if (kind === 'phirki') {
      k.col('#8a6a3a', 0).cyl(0, 0, 0, 0.07, 0.07, 3, 4);
      const g = new THREE.Group(); g.add(k.mesh(M3.solid));
      const w = new GB(); for (let j = 0; j < 4; j++) { const a = j * PI / 2; w.col(['#e83a5a', '#f2c230', '#2a8cd8', '#3ac06a'][j], 0.4).tri([0, 0, 0], [Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0], [Math.cos(a + 0.7) * 1.1, Math.sin(a + 0.7) * 1.1, 0.2]); }
      const wm = w.mesh(M3.solid); wm.position.set(0, 3, 0.15); g.add(wm); g.userData.wheel = wm;
      return g;
    }
    if (kind === 'bubbles') k.col('#cfe6f2', 0.3).cyl(0, 0, 0, 0.45, 0.45, 1.3, 6, true).col('#e83a5a', 0.2).cyl(0, 1.3, 0, 0.47, 0.47, 0.3, 6, true).col('#f2c230', 0.4).rod(0.3, 1.6, 0, 0.9, 2.6, 0, 0.05);
    else if (kind === 'whistle') k.col('#e83a5a', 0.3).box(-0.6, 0, -0.25, 0.5, 0.5, 0.25).blob(0.5, 0.25, 0, 0.4, 0.4, 0.4, 5);
    else if (kind === 'flute') k.col('#d8b070', 0.2).rod(0, 0, 0, 0.6, 3.2, 0, 0.13);
    else if (kind === 'candyfloss') k.col('#f4e8c8', 0).cyl(0, 0, 0, 0.06, 0.06, 1.6, 4).col('#ff9ad0', 0.5).blob(0, 2.6, 0, 1.2, 1.1, 1.2, 6);
    else if (kind === 'peanuts') k.col('#e8e0c8', 0.1).cyl(0, 0, 0, 0.05, 0.75, 1.6, 6, true).col('#b8864a', 0.1).blob(0, 1.7, 0, 0.55, 0.3, 0.55, 5);
    else if (kind === 'bhutta') k.col('#e8b830', 0.2).blob(0, 1.3, 0, 0.45, 1.3, 0.45, 6).col('#7a9a3a', 0).blob(0, 0.2, 0, 0.5, 0.5, 0.5, 4);
    else if (kind === 'kulfi') k.col('#c8a070', 0).cyl(0, 0, 0, 0.06, 0.06, 0.9, 4).col('#f4e4b8', 0.2).blob(0, 1.6, 0, 0.45, 0.9, 0.45, 6);
    else if (kind === 'papad') k.col('#f2dca0', 0.2).cyl(0, 1.6, 0, 1.6, 1.6, 0.08, 12, true);
    else return null;
    return k.mesh(M3.solid);
  }
  function updateHeld3(dt) {
    const want = new Map();
    const p = N.player, kind = heldOf(TOY);
    // the balloon: view3d_actors' own balloon on a raised arm (e.balloons)
    if (p) { if (TOY.held === 'balloon' && !TOY.snack && !p.hidden) { p.balloons = [TOY.color]; p.ffBalloon = true; } else if (p.ffBalloon) { p.balloons = undefined; p.ffBalloon = false; } }
    if (p && kind && kind !== 'balloon' && !p.hidden && !p.vehicle && !(N.view && N.view.mode === 'fps')) want.set('me', { e: p, kind, spin: TOY.spin });
    for (const q of ghostToys()) if (q.held && q.held !== 'balloon') want.set(q.e.online || q.e.id, { e: q.e, kind: q.held, spin: AMB.t * 3 });
    for (const [key, h] of HELD3) { const w = want.get(key); if (!w || w.kind !== h.kind) { ROOT.remove(h.obj); H3.dispose && H3.dispose(h.obj); HELD3.delete(key); } }
    for (const [key, w] of want) {
      let h = HELD3.get(key);
      if (!h) { const obj = heldMesh(w.kind); if (!obj) continue; h = { kind: w.kind, obj }; HELD3.set(key, h); ROOT.add(obj); }
      const e = w.e, f = isFinite(e.facing) ? e.facing : e.angle || 0;
      const el = H3.elev ? H3.elev(e) : 0;
      h.obj.position.set(e.x + Math.cos(f + 1.0) * 1.7 + Math.cos(f) * 0.8, el + 3.3, e.y + Math.sin(f + 1.0) * 1.7 + Math.sin(f) * 0.8);
      h.obj.rotation.set(0, -f, 0);
      if (h.obj.userData.wheel) h.obj.userData.wheel.rotation.z = w.spin;
    }
  }
  function updateBubbles3() {
    const P = BUB3.pts; if (!P) return;
    const g = P.geometry, pos = g.attributes.position.array, sz = g.attributes.bSize.array, ph = g.attributes.bPh.array, al = g.attributes.bA.array, vs = VS();
    let n = 0;
    for (const b of BUB) {
      if (b.age < 0 || n >= TUNE.bubbleCap) continue;
      pos[n * 3] = b.x; pos[n * 3 + 1] = b.h * vs; pos[n * 3 + 2] = b.y;
      sz[n] = b.r * 2.4; ph[n] = b.ph + b.age * 0.3; al[n] = Math.min(1, b.age * 4, (b.life - b.age) * 2);
      n++;
    }
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true; g.attributes.bSize.needsUpdate = true; g.attributes.bPh.needsUpdate = true; g.attributes.bA.needsUpdate = true;
    P.visible = n > 0;
  }
  let SITE3 = null, checkT3 = 0;
  function disposeSite3() {
    if (!SITE3) return;
    try { ROOT.remove(SITE3.grp); if (H3.dispose) H3.dispose(SITE3.grp); } catch (e) { N.err('funfair3d.dispose', e); }
    SITE3 = null; ST3.disposed++; ST3.site = false;
  }
  const LAYER3 = {
    order: 7,
    init(T, h) { THREE = T; H3 = h; ROOT = new THREE.Group(); ROOT.name = 'funfair'; H3.layer.add(ROOT); },
    update(dt, h) {
      const t0 = performance.now(), b0 = ST3.builds, m0 = !!M3.solid;
      try { update3(dt, h); } finally {
        // the running cost per frame (the one-off site build and material set-up are counted in buildMs, not here)
        const ms = performance.now() - t0;
        if (ST3.builds === b0 && (m0 || !M3.solid)) { ST3.layerMs = ST3.layerN ? ST3.layerMs * 0.9 + ms * 0.1 : ms; ST3.layerN = (ST3.layerN | 0) + 1; ST3.layerMax = Math.max(ST3.layerMax || 0, ms); }
      }
    },
    dispose() { disposeSite3(); for (const h of HELD3.values()) { try { ROOT.remove(h.obj); } catch (e) { /* ignore */ } } HELD3.clear(); if (BUB3.pts && ROOT) ROOT.remove(BUB3.pts); BUB3.pts = null; if (ROOT && ROOT.parent) ROOT.parent.remove(ROOT); ROOT = null; for (const k in M3) delete M3[k]; },
  };
  // the layer's work per frame (its cost is kept in ST3.layerMs: the fair's share of the 3D frame)
  function update3(dt, h) {
      H3 = h || H3;
      if (!ROOT) return;
      const night = H3.night || 0;
      UNI3.uN.value = 0.1 + night;
      UNI3.uGlowI.value = night < 0.12 ? 0 : Math.min(1, night * 1.2);
      if (H3.renderer) UNI3.uScale.value = 190 * Math.max(0.5, H3.renderer.domElement.height / 540);
      if (M3.sign) M3.sign.color.setScalar(0.8 + night * 0.35);
      // the giant wheel follows the 2D wheel's angle (or Chinnu's ride clock in tests)
      wheelTick(0);
      checkT3 -= dt;
      if (checkT3 <= 0) {
        checkT3 = 0.6;
        const S = spots(), p = N.player;
        const want = fairOn() && S.ok && p && Math.hypot(p.x - S.cx, p.y - S.cy) < TUNE.near3d;
        if (want && !SITE3) { try { initMat3(); SITE3 = buildSite3(); ROOT.add(SITE3.grp); ST3.site = true; } catch (e) { N.err('funfair3d.build', e); SITE3 = null; } }
        else if (!want && SITE3) disposeSite3();
      }
      if (!M3.solid && (BUB.length || heldOf(TOY) || NET.map.size)) initMat3();
      if (M3.solid) { ensureBubbles3(); updateHeld3(dt); updateBubbles3(); }
      if (!SITE3) return;
      const S = spots(), open = fairOpen();
      SITE3.ship.rotation.z = AMB.col;
      SITE3.cups.rotation.y = -AMB.cupsP;
      SITE3.cupKids.forEach((cg, j) => { cg.rotation.y = -(AMB.cupsS[j] - AMB.cupsP); });
      const cars = bumperCars();
      SITE3.cars.forEach((g, i) => {
        const c = cars[i];
        g.visible = !!c;
        if (!c) return;
        g.position.set(c.x, 0, c.y); g.rotation.y = -c.a;
        if (g.userData.driver) g.userData.driver.visible = !c.rider;
      });
      const M = S.maut, showMaut = !!M && open && N.player && Math.hypot(N.player.x - M.x, N.player.y - M.y) < 420;
      SITE3.bikes.forEach((g, i) => {
        g.visible = showMaut;
        if (!showMaut) return;
        const a = AMB.mautA[i], r = Math.min(M.lm.w, M.lm.d) / 2 - 2.6, hh = 6 + Math.sin(a * 0.5 + i) * 4 + i * 2.5;
        g.position.set(M.x + Math.cos(a) * r, hh, M.y + Math.sin(a) * r);
        g.rotation.set(0, 0, 0); g.rotation.y = -(a + PI / 2); g.rotateX(-1.2);
      });
      // night lights near the player
      if (night > 0.2 && open) {
        const p = N.player;
        for (const q of [[S.bumper.x + S.bumper.w / 2, S.bumper.y + S.bumper.d / 2, 18, '#e0f0ff'], [S.columbus.x, S.columbus.y + 7, 12, '#ffd890'], [S.stalls[1].cx, S.stalls[1].y - 4, 12, '#ffe0a0']]) if (Math.hypot(q[0] - p.x, q[1] - p.y) < 220) H3.light({ x: q[0], y: q[1], h: q[2], color: q[3], intensity: 1.1 * night, r: 60 });
      }
      if (SITE3.glow) SITE3.glow.visible = night > 0.12;
  }
  function register3D() {
    const V3 = N.view3d;
    if (!V3 || !V3.registerLayer || register3D.done) return;
    register3D.done = true;
    V3.registerLayer('funfair', LAYER3);
  }
  register3D();

  /* ================================================================ the party activities (src/party.js contract) */
  const PARTY_IDS = { ff_rings: 'fair_rings', ff_cans: 'fair_cans', ff_darts: 'fair_darts', wheel: 'fair_wheel', columbus: 'fair_columbus', carousel: 'fair_carousel', cups: 'fair_cups', bumper: 'fair_bumper', train: 'fair_train', maut: 'fair_maut' };
  function spotOf(id) {
    const S = spots(); if (!S.ok) return [];
    const st = S.stalls && S.stalls.find((q) => q.game === id);
    if (st) return [{ x: st.ix, y: st.iy, r: 10, name: st.name }];
    const at = { wheel: S.wheel, columbus: S.columbus, carousel: S.carousel, cups: S.cups, bumper: S.bumper, train: S.train, maut: S.maut }[id];
    if (at && isFinite(at.ix)) return [{ x: at.ix, y: at.iy, r: 10, name: RIDES[id].name }];
    if (id === 'challenge' && S.stalls) return [{ x: S.stalls[1].ix, y: S.stalls[1].iy, r: 10, name: 'Fair challenge' }];
    return [];
  }
  function gameSpec(game) {
    return {
      name: GAME_NAMES[game], icon: game === 'ff_rings' ? '⭕' : game === 'ff_cans' ? '🥫' : '🎈', where: 'nampally_exhibition', kind: 'score', players: { min: 1, max: 10 }, seasons: ['numaish'], solo: true,
      ai: ['immu', 'ayesha', 'pappu'], lock: false, label: 'Play ' + GAME_NAMES[game].toLowerCase(),
      spots: spotOf(game), r: 1,
      token: { id: 'ff_stall_star', name: 'Numaish stall star', desc: 'Top score at a Numaish stall game with friends' },
      when: () => fairOpen() || closedWhy(),
      describe: () => ({ ff_rings: 'Five rings each: bottles and prize blocks. Most points wins.', ff_cans: 'Three balls each at the tin-can pyramid. Most cans wins.', ff_darts: 'Five darts each at the balloon board. Most points wins.' })[game],
      start(ctx) {
        let open = true;
        setTimeout(() => { if (!open) return; playGame(game, { party: ctx, seed: ctx.seed, skipHowto: true, noRetry: true, autoplay: ctx.opts && ctx.opts.autoplay }).then(() => { open = false; }); }, 0);
        return { end(reason) { if (open && N.minigames && N.minigames.active === game && reason !== 'done') N.minigames.abort('party:' + reason); open = false; } };
      },
    };
  }
  function rideSpec(id) {
    const R = RIDES[id];
    return {
      name: R.name, icon: R.icon, where: 'nampally_exhibition', kind: id === 'bumper' ? 'score' : 'custom', players: { min: 1, max: Math.min(10, R.max) }, seasons: ['numaish'], solo: true,
      ai: id === 'wheel' ? ['immu', 'ayesha'] : ['immu', 'ayesha', 'pappu'], lock: false,
      label: id === 'bumper' ? 'Dashing cars with friends' : 'Ride the ' + R.name.toLowerCase() + ' together',
      spots: spotOf(id), r: 1,
      token: id === 'bumper' ? { id: 'ff_bumper_king', name: 'Dashing cars champion', desc: 'Most bumps in the dashing cars' } : { id: 'ff_ride_ribbon', name: 'Numaish ride ribbon', desc: 'Rode the rides at Numaish with friends' },
      when: () => fairOpen() || closedWhy(),
      describe: () => ({ wheel: 'All of you in one gondola, round and round over the fair; a group photo at the top for the tin.', columbus: 'The pirate-ship swing. Scream together at the top!', carousel: 'Wooden horses, round and round, waving at everybody.', cups: 'Spin your cups. ACTION spins faster.', bumper: 'Dashing cars: bump your friends, most bumps wins.', train: 'The toy train round the fair, all in a row.', maut: 'Watch the well of death together from the gallery.' })[id],
      rank: id === 'bumper' ? undefined : (rows) => rows,
      start(ctx) {
        let open = true;
        const ok = startRide(id, { ctx, riders: ctx.players, force: true });
        if (!ok) { setTimeout(() => { try { ctx.report({ dnf: true, note: 'could not board' }); } catch (e) { /* ignore */ } }, 0); open = false; }
        else if (RD) RD.endFn = () => { open = false; };
        return {
          update() {},
          end(reason) { if (open && RD && RD.ctx === ctx && reason !== 'done') endRide(reason || 'end'); open = false; },
        };
      },
    };
  }
  const challengeSpec = () => ({
    name: 'Fair challenge', icon: '🎪', where: 'nampally_exhibition', kind: 'score', players: { min: 1, max: 10 }, seasons: ['numaish'], solo: true,
    ai: ['immu', 'ayesha', 'pappu'], lock: false, label: 'Fair challenge: rings, cans, balloons',
    get spots() { return spotOf('challenge'); }, r: 1,
    token: { id: 'ff_fair_champion', name: 'Numaish fair champion rosette', desc: 'Most points across ring toss, tin cans and balloons' },
    when: () => fairOpen() || closedWhy(),
    describe: () => 'Ring toss, tin cans and balloon darts in a row: the most points in total wins.',
    start(ctx) {
      let open = true;
      setTimeout(() => { if (!open) return; challenge({ party: ctx, seed: ctx.seed, skipHowto: true }).then(() => { open = false; }); }, 0);
      return { end(reason) { if (open && N.minigames && /^ff_/.test(N.minigames.active || '') && reason !== 'done') N.minigames.abort('party:' + reason); open = false; } };
    },
  });
  let partyRef = null;
  function registerParty() {
    const P = N.party;
    if (!P || typeof P.register !== 'function') return false;
    if (partyRef === P) return true;
    try {
      for (const g of ['ff_rings', 'ff_cans', 'ff_darts']) P.register(PARTY_IDS[g], gameSpec(g));
      P.register('fair_challenge', challengeSpec());
      for (const id of Object.keys(RIDES)) P.register(PARTY_IDS[id], rideSpec(id));
      partyRef = P;
      return true;
    } catch (e) { N.err('funfair.party.register', e); return false; }
  }
  registerParty();

  /* ================================================================ the Journal page: prizes and group photos */
  function journalTab() {
    const M = N.menus;
    if (!M || !M.addJournalTab || journalTab.done) return;
    journalTab.done = true;
    try {
      M.addJournalTab({
        id: 'numaish', title: 'Numaish', order: 48,
        render(el) {
          const pz = REC.prizes.map((id) => PRIZES[id]).filter(Boolean);
          let h = '<div class="ff-jn"><p class="ff-jn-l">Prizes from the stalls (in the tin):</p>';
          h += pz.length ? '<ul class="ff-jn-p">' + pz.map((p) => '<li>' + esc(p.name) + '<small>' + esc(p.desc) + '</small></li>').join('') + '</ul>' : '<p class="nb-empty">No prizes yet. The ring toss is waiting.</p>';
          const best = REC.best || {};
          h += '<p class="ff-jn-l">Best scores: ring toss ' + (best.ff_rings | 0) + ' · tin cans ' + (best.ff_cans | 0) + ' · balloons ' + (best.ff_darts | 0) + ' · fair challenge ' + (best.ff_challenge | 0) + '</p>';
          if (REC.photos.length) h += '<p class="ff-jn-l">Group photos from the top of the giant wheel:</p><div class="ff-jn-ph">' + REC.photos.map((ph) => '<figure><img alt="Group photo" src="' + (/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(ph.img || '') ? ph.img : '') + '"><figcaption>' + esc((ph.names || []).join(' · ')) + '<br>' + esc(ph.date || '') + '</figcaption></figure>').join('') + '</div>';
          el.innerHTML = h + '</div>';
        },
      });
    } catch (e) { N.err('funfair.journal', e); }
  }

  /* ================================================================ styles (scoped to this module; tokens from style.css) */
  function injectCss() {
    if (document.getElementById('ff-css')) return;
    const s = document.createElement('style');
    s.id = 'ff-css';
    s.textContent = [
      '.ff-card { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 5; background: rgba(18,13,22,0.35); pointer-events: auto; }',
      '.ff-card-in { width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto; background: var(--panel); border: 3px solid var(--auto-yellow); border-radius: 10px; box-shadow: 6px 6px 0 var(--apsrtc-red); padding: 12px 12px 10px; font-family: var(--font-body); color: var(--ink); }',
      '.ff-card-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }',
      '.ff-card-head b { font-family: var(--font-display); font-size: 24px; color: var(--auto-yellow); font-weight: 400; }',
      '.ff-card-head span { font-family: var(--font-osd); font-size: 18px; color: var(--osd); letter-spacing: 1px; }',
      '.ff-card-rows { display: flex; flex-direction: column; gap: 6px; }',
      '.ff-row { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 48px; text-align: left; background: rgba(255,255,255,0.06); border: 2px solid rgba(242,194,48,0.25); border-radius: 8px; padding: 6px 10px; cursor: pointer; font: inherit; color: var(--ink); }',
      '.ff-row.sel, .ff-row:hover { border-color: var(--auto-yellow); background: rgba(242,194,48,0.14); }',
      '.ff-row.dis { opacity: 0.55; }',
      '.ff-row-n { flex: 1; font-weight: 800; font-size: 16px; display: flex; flex-direction: column; }',
      '.ff-row-n small { font-weight: 400; font-size: 13px; color: var(--ink-dim); }',
      '.ff-row-p { font-family: var(--font-osd); font-size: 22px; color: var(--auto-yellow); }',
      '.ff-row-k kbd { font-size: 15px; }',
      '.ff-card-foot { margin-top: 8px; font-family: var(--font-osd); font-size: 16px; color: var(--ink-dim); text-align: center; }',
      '.ff-close { min-height: 44px; padding: 6px 22px; border-radius: 8px; border: 2px solid var(--auto-yellow); background: var(--whitewash); color: var(--auto-black); font-weight: 800; }',
      '.ff-toy { position: absolute; z-index: 2; left: calc(16px + var(--safe-l)); bottom: calc(16px + 156px + 14px + 46px + var(--safe-b)); display: flex; align-items: center; gap: 4px; height: 40px; padding: 0 8px 0 2px; border-radius: 20px; border: 2px solid var(--auto-yellow); background: var(--panel); color: var(--ink); font-family: var(--font-body); font-weight: 800; font-size: 14px; pointer-events: auto; cursor: pointer; }',
      '.ff-toy[hidden] { display: none; }',
      '.ff-toy canvas { width: 34px; height: 34px; }',
      '.ff-toy-k { font-size: 13px; }',
      'body.touch-on .ff-toy { left: auto; right: calc(30px + var(--t-horn) + 14px + var(--safe-r)); bottom: calc(30px + var(--t-action) + 16px + 62px + var(--safe-b)); width: 52px; height: 52px; padding: 0; justify-content: center; border-radius: 50%; }',
      'body.touch-on .ff-toy .ff-toy-n, body.touch-on .ff-toy-k { display: none; }',
      'body[data-mode="minigame"] .ff-toy, body[data-mode="cutscene"] .ff-toy { display: none; }',
      '.ff-photo { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; pointer-events: none; z-index: 6; }',
      '.ff-photo.show { display: flex; }',
      '.ff-photo-card { background: #fffaf0; padding: 10px 10px 14px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); transform: rotate(-3deg); display: flex; flex-direction: column; align-items: center; gap: 4px; animation: ff-drop 0.5s ease-out; max-width: calc(100vw - 40px); }',
      '.ff-photo-card img { width: min(300px, calc(100vw - 60px)); height: auto; display: block; }',
      '.ff-photo-card b { font-family: var(--font-display); font-weight: 400; color: #1a1214; font-size: 20px; }',
      '.ff-photo-card span { font-family: var(--font-body); color: #3a2a2a; font-size: 14px; }',
      '@keyframes ff-drop { from { transform: translateY(-40px) rotate(4deg); opacity: 0; } to { transform: rotate(-3deg); opacity: 1; } }',
      '.ff-jn-l { margin: 8px 0 4px; font-weight: 800; }',
      '.ff-jn-p { margin: 0; padding-left: 18px; } .ff-jn-p li { margin: 2px 0; } .ff-jn-p small { display: block; color: var(--ink-dim); }',
      '.ff-jn-ph { display: flex; flex-wrap: wrap; gap: 10px; } .ff-jn-ph figure { margin: 0; background: #fffaf0; padding: 6px; transform: rotate(-1.5deg); } .ff-jn-ph img { width: 160px; display: block; } .ff-jn-ph figcaption { color: #3a2a2a; font-size: 12px; }',
    ].join('\n');
    (document.head || document.body).appendChild(s);
  }

  /* ================================================================ systems */
  let partyT = 0, partyN = 0;
  N.addSystem({
    id: 'funfair', order: 59, runIn: ['*'],
    update(dt) {
      // the giant wheel angle runs in every mode (as places_art's does)
      wheelTick(dt);
      const m = mode();
      partyT -= dt;
      if (partyT <= 0) { partyT = partyN++ < 60 ? 1 : 10; registerParty(); if (!IA.length && spots().ok && N.interact) installInteracts(); }
      if (m === 'title' || m === 'boot') return;
      const play = m === 'play';
      if (play || m === 'dialogue') ambientTick(dt);
      if (play) {
        if (RD) rideStep(dt);
        bubblesTick(dt);
        // the toy in hand: ACTION uses it when nothing else is offered
        const p = N.player;
        if (TOY.held && !owned(TOY.held)) { TOY.held = null; renderPill(); }
        if (TOY.held && p && !RD && !card && !p.vehicle && !p.controlsLocked) N.interact.offer({ label: TOYS[TOY.held].act, priority: -2, dist: 0, use: () => useToy() });
        const sp = p ? Math.hypot(p.vx || 0, p.vy || 0) : 0;
        let ws = 0.3; try { if (N.wind && isFinite(N.wind.strength)) ws = N.wind.strength; } catch (e) { /* ignore */ }
        TOY.spinV += (sp * 0.25 + ws * 8 - TOY.spinV) * Math.min(1, dt * 1.5);
        TOY.spin += TOY.spinV * dt;
        TOY.bop = Math.max(0, TOY.bop - dt * 2);
        if (TOY.snack) {
          TOY.snackT -= dt; TOY.munchT -= dt;
          if (TOY.munchT <= 0) { TOY.munchT = 5 + Math.random() * 3; sfx('munch', { ui: true, vol: 0.4 }); }
          if (TOY.snackT <= 0) { TOY.snack = null; syncToyNow(); renderPill(); }
        }
        for (let i = TOY.notes.length - 1; i >= 0; i--) { TOY.notes[i].t += dt; if (TOY.notes[i].t > TOY.notes[i].life) TOY.notes.splice(i, 1); }
        toyNetTick(dt);
      } else if (m === 'minigame' || m === 'paused') { /* frozen */ }
      if (photoT > 0) { photoT -= dt; if (photoT <= 0 && photoEl) photoEl.classList.remove('show'); }
      renderPill();
      if (card && m !== 'play') closeCard();
    },
    draw() { try { draw2D(); } catch (e) { N.err('funfair.draw', e); } },
    reset() { if (RD) endRide('reset'); closeCard(); BUB.length = 0; TOY.notes.length = 0; },
  });
  // after online.js (86): friends riding with me are drawn as my riders, so their ghosts hide meanwhile
  N.addSystem({
    id: 'funfair.late', order: 87, runIn: ['*'],
    update() {
      if (!RD || !RD.ctx) return;
      for (const e of RD.riders) { if (e.isMe || e.isAI || !e.uid) continue; const g = ghostOf(e.uid); if (g) g.hidden = true; }
    },
  });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyT' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (mode() !== 'play' || card || RD || (N.minigames && N.minigames.isOpen && N.minigames.isOpen())) return;
    if (!ownedList().length) return;
    cycleToy();
  });

  function onBoot() { regSounds(); addRows(); regGames(); register3D(); injectCss(); buildPill(); journalTab(); SP.built = false; spots(); partyRef = null; registerParty(); installInteracts(); }
  N.on('boot', onBoot);
  N.on('world:built', () => { SP.built = false; spots(); partyRef = null; registerParty(); if (IA.length) installInteracts(); });
  N.on('game:new', () => { TOY.held = null; TOY.snack = null; if (RD) endRide('quit'); closeCard(); BUB.length = 0; });
  N.on('game:quit', () => { if (RD) endRide('quit'); closeCard(); });
  if (N.world && N.world.built) onBoot();

  /* ================================================================ API */
  N.funfair = {
    TUNE, RIDES, PRICES, PRIZES, FRIENDS,
    play: (game, params) => playGame(game, params),
    challenge: (params) => challenge(params),
    ride: (id, o) => startRide(id, o || {}),
    stopRide: (reason) => { if (RD) { endRide(reason || 'stop'); return true; } return false; },
    rideState() {
      const R = RD; if (!R) return null;
      return { id: R.id, phase: R.phase, t: R.runT || 0, secs: R.secs, riders: R.riders.map((e) => ({ uid: e.uid, nick: e.nick, me: !!e.isMe, x: e.x, y: e.y, z: e.z, x2: e.x2, y2: e.y2, h2: e.h2, a: e.angle })), strangers: R.strangers.length, bumps: R.bumps | 0, photo: !!R.photo, gondola: R.k, cars: R.cars ? R.cars.length : 0 };
    },
    buy: (row, fn) => buy(row, fn),
    toys: { get held() { return TOY.held; }, owned: ownedList, hold: holdToy, use: useToy, cycle: cycleToy, give: giveToy },
    get snack() { return TOY.snack; },
    eat: eatSnack,
    bubbles: () => BUB.length,
    prizes: () => REC.prizes.slice(),
    photos: () => REC.photos.map((p) => ({ t: p.t, names: p.names.slice(), date: p.date, img: !!p.img })),
    spots: () => spots(),
    open: () => fairOpen(),
    on: () => fairOn(),
    registerParty,
    interacts: () => IA.slice(),
    card: () => (card ? { rows: card.rows.map((r) => r.label) } : null),
    closeCard,
    snackCard, toyCard, stallCard: (id) => { const st = spots().stalls.find((q) => q.id === id || q.game === id); if (st) stallCard(st); },
    wheelAngle: () => WH.a,
    stats: () => Object.assign({}, ST3, { bubbles: BUB.length, held3: HELD3.size, ambientCars: AMB.bumper ? AMB.bumper.cars.length : 0 }),
    _debug: { AMB, WH, BUB, TOY, NET, columbusAngle, blowBubbles, wheel2D, wheel3D },
  };
})();
