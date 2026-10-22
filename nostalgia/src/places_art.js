/* NOSTALGIA — places_art.js  (owner: street-life artist)
 *
 * Pseudo-3D art for the civic / transport / market / cinema draw ids of N.WORLD_DATA.landmarks
 * (design/map_plan.md §4b) and the everyday street life of 2003 Hyderabad: kirana stores, Irani
 * cafes, pindi girnis, stationery shops, barbers, cycle-rent and video-game parlours, medical and
 * meat shops, photo studios, internet cafes, bakeries, bangle shops; pushcarts (banana, flower,
 * samosa, dosa, coconut, chai, kite and book stalls); STD/ISD/PCO booths; bus stops; schools;
 * the player's home with its terrace; colony playgrounds; cinemas with hand-painted hoardings
 * (fictional films only); Koti bus stand, Imlibun (MGBS), the Gowliguda hangar; Gokul Chat;
 * Rythu Bazaars; Numaish (gate, stalls, giant wheel, maut ka kuan); Prasads IMAX (tin fence +
 * crane / opening day / open); NTR Gardens (open / work in progress); hospitals, GPO, colleges,
 * library, auditorium, AIR mast, Doordarshan tower, Gachibowli stadium, market halls, film
 * studios, club, Ameerpet coaching centres, Trendz, HITEX, gates, jetty, musical fountain, dhobi
 * ghat, Dhoolpet idol workshops, the parked plane at Begumpet and the suburban halts.
 *
 * Data driven: a landmark's `draw` id picks its art; `face` = shopfront side; `sign`, `films` /
 * `film`, `variant` (cinema: sandhya|sudarshan|odeon|devi, school: hps, home_house: friend,
 * market_hall: fruit, video_parlour: recording|tv_radio), `solids` (bus shelters, MGBS terminal,
 * hangar walls, rythu bazaar counters, gate piers), `era`, `seasonal`, `sign2` drive the details.
 * Place kinds without a landmark get decorations from N.WORLD_DATA.places: every playground_*
 * (pitch + stumps, swings, slide, see-saw, merry-go-round, kids at gully cricket, a Ganesh pandal
 * in season), ntr_gardens (Machan tree, waterfall, mini train, Nandi statues, flower beds) and
 * the street markets (patang_bazaar, laad_bazaar, pathergatti, sultan_bazaar, begum_bazaar,
 * abids_book_market, general_bazaar, chappal_bazar, dhoolpet: stalls placed on free footpath).
 *
 * Registration: N.landmarks.register(drawId, kit-style def {init, draw, shadow, lights, night,
 * floor, ground}); landmarks.js calls them with its frame state set, isolates errors (N.err +
 * drawDefault fallback) and lazily runs init on first enqueue. This file does NOT register
 * mozamjahi_market, railway_station, lb_stadium, airport_terminal and control_tower: the
 * monument artist's src/landmarks.js already has good art for those (agreed split).
 *
 * Hooks added from this file only (no core file is edited):
 *  - system 'placesArt' (order 43, every mode): update() turns the giant wheel / maut-ka-kuan
 *    bike; draw() queues people (vendors, queues, crowds, kids; cached sprites drawn with
 *    N.people.draw) on 'actors', and the place-driven decorations on 'structures' / 'light'
 *    (with cast shadows and night lights).
 *  - wraps N.render.setGroundPainter (composed after world.js's painter and inside
 *    world_extras.js's rails wrapper, same technique) to paint pitches, NTR beds + train loop and
 *    the NTR construction soil into the static ground chunks (chunks repaint on variant change).
 *  - on 'world:built': builds the decorations and makes the parked art buses (Koti, Rathifile,
 *    Mehdipatnam, MGBS, hangar) SOLID in the collision grid, never within 9 u of a place point.
 *  - walk-under roofs (bus shelters, MGBS canopies, hangar, rythu sheds, halt shelters) fade
 *    when the player is under them.
 *
 * API: N.placesArt = {
 *   drawProp(kind, x, y, angle, opts) -> bool   draw a prop now (inside a render-queue callback).
 *       kinds: N.placesArt.PROPS = carts (banana_cart, flower_cart, samosa_bandi, dosa_bandi,
 *       coconut_cart, chai_bandi, kite_stall, book_stall; any angle), props (sintex_tank,
 *       antenna, stumps, swing, slide, seesaw, sack, crate, cycle, bus, hoarding, pandal,
 *       haleem_bhatti, ice_gola, umbrella, steam, nandi, jcb, tower_crane) and every registered
 *       draw id (std_booth, bus_stop, kirana, irani_cafe, ...; angle snapped to N/S/E/W).
 *       opts: {seed, sign, film, livery, route, color, h, w, d, r, c1, c2}
 *   queueProp(kind, x, y, angle, opts)       same, queued on 'structures' this frame (+ shadow)
 *   fx: { prasads: null|'fence'|'opening'|'open', ntr: null|'open'|'construction',
 *         numaish, ganesh, sankranti, ramzan, chandRaat, summer, worldCup: null (auto) | bool,
 *         hitex: null|'construction'|'open' }   story overrides; null = automatic
 *   switches() -> resolved switches, variant(id) -> current art variant of a landmark/place id,
 *   decorList(), perf() -> {ms (this module's cost last frame), calls, initMs, sprites},
 *   prepareAll() (build every landmark's art state now), defs, PROPS, version }
 * Automatic switches (when fx.* is null) read N.flags (flag, N.flags.festival === id or listed
 * in N.flags.festivals) and the in-game date (N.clock.baseDate + day), per design/story_bible.md:
 *   Prasads: N.flags.prasads ('fence'|'opening'|'open'), prasads_opening or 25 Jul 2003 ->
 *   opening-day banners, balloons + crowd; prasads_open or date >= 25 Jul 2003 -> open; else the
 *   tin fence "PRASADS / COMING SOON / THE GIANT SCREEN" round a concrete frame and a crane.
 *   NTR Gardens: open (since Dec 2001) unless ntr_construction / ntr_gardens_construction /
 *   ntr_gardens === 'construction'. numaish (or 1 Jan - 15 Feb): stalls open, wheel turning,
 *   bulbs. ganesh* flags (or 31 Aug - 9 Sep 2003): pandals in playgrounds, idol workshops busy.
 *   sankranti (or 10-16 Jan): kites over the home terrace and on antennas, kite stalls busy.
 *   ramzan / chand_raat (or 27 Oct - 25 Nov 2003): haleem bhattis at the Old City hotels,
 *   bangle-shop bulb strings. summer (24 Apr - 11 Jun): ice-gola carts at school gates.
 *   world_cup (9 Feb - 23 Mar 2003): crowds at the TV shop. hitex_open or >= 14 Jan 2003: HITEX.
 * Crowds follow the clock: school bells, show times at the cinemas, Sunday-morning queue at the
 * meat shop, Thursday at the flower carts, morning dosa / evening samosa carts, lunch and dinner
 * at the biryani houses. Signs are hand-painted boards fitted once with the 3x5 pixel font
 * (place-name suffix and hyphen splitting, distinctive word before generic word).
 * Performance: facades use the kit's cached facade geometry; roofs, vegetable heaps, cart loads,
 * film boards and people are cached sprites; per-frame work is culled to the view. Measured
 * (N.placesArt.perf, headless desktop): ~0.5-2.5 ms per frame in the densest views (Gulzar Houz
 * bazaar, Koti, RTC X Roads), ~10 ms one-off at world build.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.landmarks || !N.landmarks.register) return;
  const U = N.util;
  const TAU = Math.PI * 2;
  const LMK = N.landmarks;
  const K = LMK.kit || {};

  /* ================================================================ frame state */
  let R = null, ctx = null, Z = 1, P = 0.0032, CX = 0, CY = 0, CAMX = 0, CAMY = 0, NIGHT = 0, TIME = 0, SUN = null;
  function frame() {
    R = N.render; ctx = R.ctx;
    Z = R.Z || 1; P = R.PERSP; CX = R.W / 2; CY = R.H / 2;
    CAMX = R.camX || 0; CAMY = R.camY || 0; NIGHT = R.night || 0;
    TIME = (N.time && N.time.real) || 0; SUN = R.sun;
    if (K.frame) K.frame();
  }
  const kh = (h) => Z * (1 + h * P);
  const sx = (x, k) => CX + (x - CAMX) * k;
  const sy = (y, k) => CY + (y - CAMY) * k;
  const sh = (c, f) => R.shaded(c, f);
  function fillc(c) { ctx.fillStyle = c; ctx.fill(); }
  function mv(x, y, h) { const k = Z * (1 + h * P); ctx.moveTo(CX + (x - CAMX) * k, CY + (y - CAMY) * k); }
  function ln(x, y, h) { const k = Z * (1 + h * P); ctx.lineTo(CX + (x - CAMX) * k, CY + (y - CAMY) * k); }
  function reset() { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ============================================================== primitives */
  // Vertical wall quad (ax,ay)-(bx,by) from h0 to h1, drawn only if its outward normal
  // (nx, ny) faces the camera; colour sun-shaded by the normal.
  function wallQ(ax, ay, bx, by, nx, ny, k0, k1, col) {
    const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5;
    if (nx * (CAMX - mx) + ny * (CAMY - my) <= 0) return;
    ctx.beginPath();
    ctx.moveTo(sx(ax, k0), sy(ay, k0)); ctx.lineTo(sx(bx, k0), sy(by, k0));
    ctx.lineTo(sx(bx, k1), sy(by, k1)); ctx.lineTo(sx(ax, k1), sy(ay, k1)); ctx.closePath();
    fillc(sh(col, R.shadeNormal(nx, ny)));
  }
  /** Oriented box centred at (x, y): half length hl along (ca, sa), half width hw across.
   *  Walls facing the camera (sun shaded) then the top (top === false: no top). */
  function obox(x, y, ca, sa, hl, hw, h0, h1, wall, top) {
    const k0 = kh(h0), k1 = kh(h1);
    const lx = ca * hl, ly = sa * hl, wx = -sa * hw, wy = ca * hw;
    const x0 = x + lx + wx, y0 = y + ly + wy, x1 = x + lx - wx, y1 = y + ly - wy;
    const x2 = x - lx - wx, y2 = y - ly - wy, x3 = x - lx + wx, y3 = y - ly + wy;
    if (h1 - h0 > 0.05 && wall) {
      wallQ(x0, y0, x1, y1, ca, sa, k0, k1, wall);
      wallQ(x1, y1, x2, y2, sa, -ca, k0, k1, wall);
      wallQ(x2, y2, x3, y3, -ca, -sa, k0, k1, wall);
      wallQ(x3, y3, x0, y0, -sa, ca, k0, k1, wall);
    }
    if (top !== false) {
      ctx.beginPath();
      ctx.moveTo(sx(x0, k1), sy(y0, k1)); ctx.lineTo(sx(x1, k1), sy(y1, k1));
      ctx.lineTo(sx(x2, k1), sy(y2, k1)); ctx.lineTo(sx(x3, k1), sy(y3, k1)); ctx.closePath();
      fillc(top || sh(wall, 1.08));
    }
  }
  /** Axis-aligned box by min corner. */
  function abox(x, y, w, d, h0, h1, wall, top) { obox(x + w / 2, y + d / 2, 1, 0, w / 2, d / 2, h0, h1, wall, top); }
  /** Horizontal rect (top only) at height h. */
  function hrect(x, y, w, d, h, col) {
    const k = kh(h);
    ctx.fillStyle = col; ctx.fillRect(sx(x, k), sy(y, k), w * k, d * k);
  }
  /** Quad with per-corner heights (sloped roofs, boards, awnings). */
  function quad3(x0, y0, h0, x1, y1, h1, x2, y2, h2, x3, y3, h3) {
    ctx.beginPath(); mv(x0, y0, h0); ln(x1, y1, h1); ln(x2, y2, h2); ln(x3, y3, h3); ctx.closePath();
  }
  function pole(x, y, h0, h1, col, w) {
    const k0 = kh(h0), k1 = kh(h1);
    ctx.beginPath(); ctx.moveTo(sx(x, k0), sy(y, k0)); ctx.lineTo(sx(x, k1), sy(y, k1));
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, (w || 0.7) * k1); ctx.stroke();
  }
  function seg3(x0, y0, h0, x1, y1, h1, col, w) {
    ctx.beginPath(); mv(x0, y0, h0); ln(x1, y1, h1);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.5, (w || 0.6) * kh(h1)); ctx.stroke();
  }
  function disc(x, y, r, h, col) {
    const k = kh(h);
    ctx.beginPath(); ctx.arc(sx(x, k), sy(y, k), Math.max(0.5, r * k), 0, TAU); fillc(col);
  }
  function ring(x, y, r, h, col, lw) {
    const k = kh(h);
    ctx.beginPath(); ctx.arc(sx(x, k), sy(y, k), Math.max(0.5, r * k), 0, TAU);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.5, (lw || 0.6) * k); ctx.stroke();
  }
  const cylSt = new Map();
  function cyl(x, y, r, h0, h1, wall, top) {
    const key = wall + '|' + top;
    let st = cylSt.get(key);
    if (!st) { st = { wall, top: top == null ? undefined : top, roof: top || undefined }; cylSt.set(key, st); }
    N.draw.cyl(x, y, r, h0, h1, st);
  }
  /** Beach umbrella / chhatri: n alternating gores from the rim at h to the apex. */
  function umbrella(x, y, r, h, c1, c2, n, rot) {
    n = n || 8;
    const k0 = kh(h), k1 = kh(h + r * 0.32);
    const ax = sx(x, k1), ay = sy(y, k1);
    const r0 = rot == null ? 0.4 : rot;
    for (let i = 0; i < n; i++) {
      const a0 = r0 + (i / n) * TAU, a1 = r0 + ((i + 1) / n) * TAU, am = (a0 + a1) / 2;
      ctx.beginPath(); ctx.moveTo(ax, ay);
      ctx.lineTo(sx(x + Math.cos(a0) * r, k0), sy(y + Math.sin(a0) * r, k0));
      ctx.lineTo(sx(x + Math.cos(a1) * r, k0), sy(y + Math.sin(a1) * r, k0)); ctx.closePath();
      fillc(sh(i % 2 ? c2 : c1, 0.88 + 0.16 * (Math.cos(am) * SUN.dx + Math.sin(am) * SUN.dy)));
    }
  }
  /** Set the transform for drawing a top-down sprite in local units at height h. */
  function spr(x, y, ca, sa, h) {
    const k = kh(h);
    ctx.setTransform(ca * k, sa * k, -sa * k, ca * k, sx(x, k), sy(y, k));
  }
  /** Set the transform for drawing in world coordinates on the plane at height h. */
  function plane(h) { const k = kh(h); ctx.setTransform(k, 0, 0, k, CX - CAMX * k, CY - CAMY * k); }
  function puff(x, y, h, r, a, col) {
    const k = kh(h);
    ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(sx(x, k), sy(y, k), Math.max(0.6, r * k), 0, TAU);
    fillc(col || '#f4f2ee'); ctx.globalAlpha = 1;
  }
  /** Rising steam / smoke puffs from (x, y, h). */
  function steam(x, y, h, n, seed, col, size) {
    for (let i = 0; i < n; i++) {
      const t = (TIME * 0.45 + i / n + seed * 0.13) % 1;
      const dx = Math.sin(t * 5 + seed + i) * 1.4 + t * 3;
      puff(x + dx, y - t * 2, h + t * 12, (size || 1) * (0.8 + t * 2.2), 0.32 * (1 - t), col);
    }
  }
  function light(lm, i, n, x, y, h, r, color, intensity, glowOn) {
    if (!K.lightsOf) return;
    const L = K.lightsOf(lm, n)[i];
    K.pushLight(L, x, y, h, r, color, intensity, glowOn);
  }
  function glow(x, y, h, r, col, a) { if (K.glow) K.glow(x, y, h, r, col, a); }

  /* ============================================================ people sprites */
  // Cached top-down people (drawn once with N.people.draw at 2.5 px/u, then one drawImage).
  const PRES = 2.5, PSZ = 44;
  const pImg = new Map();
  const pLook = new Map();
  function lookOf(kind, i, extra) {
    const key = kind + '#' + i + (extra ? '|' + JSON.stringify(extra) : '');
    let lk = pLook.get(key);
    if (!lk) {
      const rng = U.rng('pa:' + kind + ':' + i);
      const base = kind === 'any' ? null : kind;
      lk = N.people && N.people.randomLook ? N.people.randomLook(rng, base || undefined) : { kind: 'man' };
      if (extra) Object.assign(lk, extra);
      pLook.set(key, lk);
    }
    return lk;
  }
  function personImg(kind, i, extra) {
    const key = kind + '#' + i + (extra ? '|' + JSON.stringify(extra) : '');
    let c = pImg.get(key);
    if (c) return c;
    c = N.render.makeCanvas(PSZ, PSZ);
    const g = c.getContext('2d');
    g.setTransform(PRES, 0, 0, PRES, PSZ / 2, PSZ / 2);
    try { if (N.people && N.people.draw) N.people.draw(g, lookOf(kind, i, extra), { phase: 0, speed: 0 }); } catch (e) { N.err('placesArt.person', e); }
    pImg.set(key, c);
    return c;
  }
  // A person record: {x, y, a (facing), img, ph (phase), sway, t0, t1 (active minutes), w (weekday mask)}
  function peep(p, x, y, a) {
    const k = kh(0.6), c = (Math.cos(a) * k) / PRES, s = (Math.sin(a) * k) / PRES;
    ctx.setTransform(c, s, -s, c, sx(x, k), sy(y, k));
    ctx.drawImage(p.img || (p.img = personImg(p.kind, p.i, p.look)), -PSZ / 2, -PSZ / 2);
  }
  function drawPeople(list, n) {
    ctx.imageSmoothingEnabled = true;
    const v = R.view;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      if (p.x < v.x0 - 10 || p.x > v.x1 + 10 || p.y < v.y0 - 10 || p.y > v.y1 + 10) continue;
      const t = TIME * (p.sp || 1.3) + p.ph;
      const bob = p.sway * Math.sin(t);
      const a = p.a + bob * 0.18 + (p.turn ? Math.sin(t * 0.37) * p.turn : 0);
      peep(p, p.x + Math.cos(p.a) * bob * 0.4, p.y + Math.sin(p.a) * bob * 0.4, a);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  function person(kind, i, x, y, a, opts) {
    const o = opts || {};
    return { kind, i, look: o.look, x, y, a, img: null, ph: (i * 1.7 + x * 0.13) % TAU, sway: o.sway == null ? 0.6 : o.sway, sp: o.sp || 1.3, turn: o.turn || 0, t0: o.t0, t1: o.t1, need: o.need || 0 };
  }

  /* =========================================================== world time / flags */
  const T = { min: 0, wd: 4, y: 1999, m: 0, d: 14, ymd: 19990114, stamp: -1 };
  const MDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  function updDate() {
    const c = N.clock;
    T.min = c.minutes;
    if (T.stamp === c.day && T.base === c.baseDate) return;
    T.stamp = c.day; T.base = c.baseDate;
    const b = c.baseDate || [1999, 0, 14];
    const d = new Date(Date.UTC(b[0], b[1], b[2] + (c.day || 0)));
    T.y = d.getUTCFullYear(); T.m = d.getUTCMonth(); T.d = d.getUTCDate(); T.wd = d.getUTCDay();
    T.ymd = T.y * 10000 + (T.m + 1) * 100 + T.d;
  }
  void MDAYS;
  function flagOn(id) {
    const F = N.flags || {};
    if (F[id]) return true;
    if (F.festival === id) return true;
    return Array.isArray(F.festivals) && F.festivals.indexOf(id) >= 0;
  }
  const fx = { prasads: null, ntr: null, numaish: null, ganesh: null, sankranti: null, ramzan: null, chandRaat: null, summer: null, worldCup: null, hitex: null };
  const S = {}; // resolved switches, refreshed by the system each frame
  function resolveSwitches() {
    updDate();
    const F = N.flags || {};
    const md = (T.m + 1) * 100 + T.d;
    // Prasads IMAX: opened Fri 25 Jul 2003
    let pr = fx.prasads;
    if (!pr) {
      if (typeof F.prasads === 'string') pr = F.prasads;
      else if (F.prasads_opening || (T.ymd === 20030725)) pr = 'opening';
      else if (F.prasads_open || T.ymd >= 20030725) pr = 'open';
      else pr = 'fence';
    }
    S.prasads = pr;
    let nt = fx.ntr;
    if (!nt) nt = F.ntr_construction || F.ntr_gardens_construction || F.ntr_gardens === 'construction' ? 'construction' : 'open';
    S.ntr = nt;
    S.numaish = fx.numaish != null ? !!fx.numaish : flagOn('numaish') || (F.numaish !== false && md >= 101 && md <= 215);
    S.ganesh = fx.ganesh != null ? !!fx.ganesh : flagOn('ganesh') || flagOn('ganesh_chaturthi') || flagOn('vinayaka_chavithi') || flagOn('ganesh_immersion') || (F.ganesh !== false && T.ymd >= 20030831 && T.ymd <= 20030909);
    S.sankranti = fx.sankranti != null ? !!fx.sankranti : flagOn('sankranti') || (F.sankranti !== false && md >= 110 && md <= 116);
    S.ramzan = fx.ramzan != null ? !!fx.ramzan : flagOn('ramzan') || flagOn('chand_raat') || flagOn('ramadan') || (F.ramzan !== false && T.ymd >= 20031027 && T.ymd <= 20031125);
    S.chandRaat = fx.chandRaat != null ? !!fx.chandRaat : flagOn('chand_raat') || flagOn('eid') || (F.chand_raat !== false && T.ymd === 20031125);
    S.summer = fx.summer != null ? !!fx.summer : flagOn('summer') || (md >= 424 && md <= 611);
    S.worldCup = fx.worldCup != null ? !!fx.worldCup : flagOn('world_cup') || flagOn('worldcup') || (T.y === 2003 && md >= 209 && md <= 323);
    let hx = fx.hitex;
    if (!hx) hx = F.hitex_open || T.ymd >= 20030114 ? 'open' : 'construction';
    S.hitex = hx;
    S.weekday = T.wd; S.min = T.min;
  }
  resolveSwitches.lastFrame = -1;
  function sw() { const f = N.time ? N.time.frame : 0; if (resolveSwitches.lastFrame !== f) { resolveSwitches.lastFrame = f; try { resolveSwitches(); } catch (e) { N.err('placesArt.switches', e); } } return S; }

  /* ================================================================ text + icons */
  const pw = (s) => N.draw.pixelTextWidth(s);
  const SUFFIX = ['NAGAR', 'GUDA', 'PALLY', 'PALLI', 'PET', 'BAGH', 'PURA', 'ABAD', 'GUNJ', 'CHOWKI', 'CHOWK', 'KUNTA', 'BAZAAR', 'BAZAR',
    'PATNAM', 'PUL', 'STORES', 'KIRANA', 'MEDICALS', 'MEDICAL', 'SALOON', 'STATIONERY', 'STATIONERS', 'BAKERY', 'CHAKKI', 'GIRNI', 'BUND', 'ROADS', 'MANDIR', 'NIVAS'];
  const FILLER = new Set(['SRI', 'SHRI', 'NEW', 'THE', '&', 'AND', 'HOTEL', 'FRESH', 'OF']);
  const KEYWORDS = new Set(['CHICKEN', 'MUTTON', 'KIRANA', 'BAKERY', 'CAFE', 'MEDICALS', 'MEDICAL', 'STORES', 'SALOON', 'STUDIO', 'PHOTO', 'BOOKS', 'GAMES', 'VIDEO', 'BROWSING', 'NET', 'CYCLE', 'CYCLES', 'GIRNI', 'CHAKKI', 'FLOUR', 'STATIONERY', 'STATIONERS', 'PROVISIONS', 'HAIR', 'COLOUR', 'LAB']);
  const fitCache = new Map();
  function splitWord(wd, maxPx) {
    // after a hyphen (NOOR-E-IRAN -> NOOR-E- / IRAN), then at a known place-name suffix
    for (let i = wd.length - 2; i > 0; i--) {
      if (wd[i] !== '-') continue;
      const a = wd.slice(0, i + 1), b = wd.slice(i + 1);
      if (pw(a) <= maxPx && pw(b) <= maxPx) return [a, b];
    }
    for (const s of SUFFIX) {
      if (wd.length > s.length + 2 && wd.endsWith(s)) {
        const a = wd.slice(0, wd.length - s.length);
        if (pw(a) <= maxPx && pw(s) <= maxPx) return [a, s];
      }
    }
    return null;
  }
  function wrapWords(ws, maxPx) {
    const lines = [];
    let cur = '';
    for (const w of ws) {
      const t = cur ? cur + (cur.endsWith('-') ? '' : ' ') + w : w;
      if (pw(t) <= maxPx) cur = t; else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function expandWords(ws, maxPx) {
    const out = [];
    for (const w of ws) {
      if (pw(w) <= maxPx) { out.push(w); continue; }
      const s = splitWord(w, maxPx);
      if (!s) return null;
      out.push(s[0], s[1]);
    }
    return out;
  }
  /** Fit a sign text into at most maxLines lines of maxPx pixels (3x5 font). null = no fit. */
  function fitLines(text, maxPx, maxLines, noDrop) {
    maxPx = Math.floor(maxPx);
    const key = text + '|' + maxPx + '|' + maxLines + (noDrop ? '|n' : '');
    if (fitCache.has(key)) return fitCache.get(key);
    const words = String(text).toUpperCase().replace(/[^A-Z0-9 &'.\-/+:!]/g, ' ').split(/\s+/).filter(Boolean);
    let res = null;
    const tries = [words, words.filter((w) => !FILLER.has(w))];
    if (words.length > 1 && !noDrop) {
      const core = words.filter((w) => !FILLER.has(w));
      if (core.length > 2) tries.push(core.slice(0, -1), core.slice(1));
      for (const w of core) if (!KEYWORDS.has(w)) tries.push([w]); // the distinctive name first
      for (const w of core) if (KEYWORDS.has(w)) tries.push([w]);  // then what the shop is
    }
    for (const ws of tries) {
      if (!ws.length) continue;
      const ex = expandWords(ws, maxPx);
      if (!ex) continue;
      const lines = wrapWords(ex, maxPx);
      if (lines.length <= maxLines) { res = lines; break; }
    }
    if (fitCache.size > 4000) fitCache.clear();
    fitCache.set(key, res);
    return res;
  }
  /** Pixel text lines centred at a projected point; rot: 0 | 1 | -1 (as N.draw.pixelText). */
  function ptext(x, y, h, lines, col, shadow, rot) {
    if (!lines || !lines.length) return;
    const k = kh(h), X = Math.round(sx(x, k)), Y = Math.round(sy(y, k));
    const n = lines.length, lh = 6;
    for (let i = 0; i < n; i++) {
      const c = N.draw.pixelTextCanvas(lines[i], col, shadow);
      const off = Math.round((i - (n - 1) / 2) * lh);
      if (rot) {
        const r = rot > 0 ? 1 : -1;
        ctx.setTransform(0, r, -r, 0, X - off * r, Y);
        ctx.drawImage(c, -Math.round(c.width / 2), -Math.round(c.height / 2));
      } else ctx.drawImage(c, X - Math.round(c.width / 2), Y + off - Math.round(c.height / 2));
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  // 7x7 pictograms for signboards ('.' transparent, letters = palette keys)
  const ICON_PAL = { k: '#1a1416', w: '#f8f4ea', r: '#d8302a', y: '#f2c230', g: '#2f9a4a', b: '#2a5cb8', o: '#f08a24', t: '#2a8c82', s: '#b8bcc4', n: '#8a5a32', p: '#e85a9a', c: '#5ad0e8' };
  const ICONS = {
    cup: ['.......', '.w.w.w.', '.......', 'wwwwww.', 'wwwww.w', 'wwwwww.', '.wwww..'],
    jar: ['.rrrr..', '.wwww..', 'wyoyw..', 'woyow..', 'wyoyw..', '.wwww..', '.......'],
    pencil: ['.....kk', '....yyk', '...yyy.', '..yyy..', '.yyy...', 'nyy....', 'kn.....'],
    wheat: ['...y...', '..yyy..', '.y.y.y.', '..yyy..', '.y.y.y.', '..yyy..', '...n...'],
    scissors: ['w.....w', '.w...w.', '..w.w..', '...w...', '..w.w..', '.ww.ww.', '.ww.ww.'],
    cross: ['..www..', '..www..', 'wwwwwww', 'wwwwwww', 'wwwwwww', '..www..', '..www..'],
    hen: ['..rr...', '.wwww..', 'wwkwwy.', 'wwwwww.', '.wwwww.', '..wwww.', '..y.y..'],
    camera: ['.......', '..kk...', 'kkkkkkk', 'kwwkwwk', 'kwkkkwk', 'kwwkwwk', 'kkkkkkk'],
    crt: ['wwwwwww', 'wcccccw', 'wcccccw', 'wcccccw', 'wwwwwww', '..www..', '.wwwww.'],
    joy: ['..r....', '..r....', '..k....', '..k..y.', 'kkkkkkk', 'kkkkkkk', '.......'],
    cycle: ['.......', '...kk..', '..k.k..', '.k.k.k.', 'kkk.kkk', 'k.k.k.k', 'kkk.kkk'],
    bread: ['.......', '.yyyyy.', 'yyoyoyy', 'yoyoyoy', 'yyyyyyy', '.......', '.......'],
    bangle: ['.rrr...', 'r...r..', 'r.yyy..', '.ry..y.', '..y.ggg', '..yg...', '....ggg'],
    phone: ['.kkkkk.', 'kk...kk', 'k.kkk.k', '.kkkkk.', '.kwkwk.', '.kkkkk.', '.......'],
    film: ['kkkkkkk', 'kwkwkwk', 'kkkkkkk', 'kyyyyyk', 'kkkkkkk', 'kwkwkwk', 'kkkkkkk'],
    book: ['.......', 'bbb.rrr', 'bwb.rwr', 'bwb.rwr', 'bbbkrrr', '.......', '.......'],
    bus: ['rrrrrrr', 'rcccccr', 'rrrrrrr', 'rwwwwwr', 'rrrrrrr', '.k...k.', '.......'],
    kite: ['...p...', '..ppp..', '.ppypp.', 'pppyppp', '.ppypp.', '..ppp..', '...k...'],
    flower: ['.......', '.o.o.o.', 'ooooooo', '.oyoyo.', 'ooooooo', '.o.o.o.', '.......'],
  };
  const iconCache = new Map();
  function iconCanvas(name) {
    let c = iconCache.get(name);
    if (c) return c;
    const rows = ICONS[name];
    if (!rows) return null;
    c = N.render.makeCanvas(7, 7);
    const g = c.getContext('2d');
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
      const ch = rows[j][i];
      if (ch === '.' || !ICON_PAL[ch]) continue;
      g.fillStyle = ICON_PAL[ch]; g.fillRect(i, j, 1, 1);
    }
    iconCache.set(name, c);
    return c;
  }
  function icon(name, x, y, h) {
    const c = iconCanvas(name); if (!c) return;
    const k = kh(h);
    ctx.drawImage(c, Math.round(sx(x, k)) - 3, Math.round(sy(y, k)) - 3);
  }

  /* ============================================================ landmark frames */
  // F = the shop's front: rect, outward normal (ox, oy), along axis (ax, ay), front edge
  // centre (cx, cy), front length L, depth D.
  function frontOf(lm) {
    const x = lm.x - lm.w / 2, y = lm.y - lm.d / 2, w = lm.w, d = lm.d;
    const f = String(lm.face || (w >= d ? 's' : 'e')).toUpperCase();
    const F = { x, y, w, d, f, ox: 0, oy: 0, ax: 0, ay: 0, cx: 0, cy: 0, L: 0, D: 0, rot: 0 };
    if (f === 'N') { F.oy = -1; F.ax = 1; F.cx = lm.x; F.cy = y; F.L = w; F.D = d; }
    else if (f === 'S') { F.oy = 1; F.ax = -1; F.cx = lm.x; F.cy = y + d; F.L = w; F.D = d; }
    else if (f === 'W') { F.ox = -1; F.ay = -1; F.cx = x; F.cy = lm.y; F.L = d; F.D = w; F.rot = 1; }
    else { F.ox = 1; F.ay = 1; F.cx = x + w; F.cy = lm.y; F.L = d; F.D = w; F.rot = -1; }
    F.ang = Math.atan2(F.oy, F.ox);
    return F;
  }
  const fxp = (F, u, v) => F.cx + F.ax * u + F.ox * v;
  const fyp = (F, u, v) => F.cy + F.ay * u + F.oy * v;
  // camera on the front side of the shop?
  const camFront = (F) => (CAMX - F.cx) * F.ox + (CAMY - F.cy) * F.oy > 0;
  // axis-aligned world rect of front-local u0..u1, v0..v1 -> R4 = [x, y, w, d]
  const R4 = [0, 0, 0, 0];
  function frect(F, u0, u1, v0, v1) {
    const xa = fxp(F, u0, v0), xb = fxp(F, u1, v1), ya = fyp(F, u0, v0), yb = fyp(F, u1, v1);
    R4[0] = Math.min(xa, xb); R4[1] = Math.min(ya, yb); R4[2] = Math.abs(xb - xa); R4[3] = Math.abs(yb - ya);
    return R4;
  }
  function fbox(F, u0, u1, v0, v1, h0, h1, wall, top) {
    const r = frect(F, u0, u1, v0, v1);
    abox(r[0], r[1], r[2], r[3], h0, h1, wall, top);
  }
  function fcyl(F, u, v, r, h0, h1, wall, top) { cyl(fxp(F, u, v), fyp(F, u, v), r, h0, h1, wall, top); }
  function fdisc(F, u, v, r, h, col) { disc(fxp(F, u, v), fyp(F, u, v), r, h, col); }
  // set a sprite transform at front-local (u, v): local +x = outward, +y = along -a ... (right-handed)
  function fspr(F, u, v, h) { spr(fxp(F, u, v), fyp(F, u, v), F.ox, F.oy, h); }

  function rngOf(lm, salt) { return U.rng('pa:' + lm.id + ':' + (salt || '')); }
  function pickR(rng, arr) { return arr[Math.floor(rng.next() * arr.length) % arr.length]; }

  /* ====================================================== facades (kit specs) */
  const fac = K.fac || ((b) => ({ build: b, cache: new Map() }));
  // window lit pattern: deterministic per window index
  const litWin = (i, f, L) => ((i * 7 + f * 5 + Math.round(L)) % 9) < 5;
  function upperWindows(g, L, H, from, ww) {
    for (let f = 1; from + (f - 1) * 10 + 7 <= H; f++) {
      const v0 = from + (f - 1) * 10 + 2.5, v1 = v0 + 4.6;
      const n = Math.max(1, Math.floor((L - 2) / 7.5));
      const pitch = (L - 2) / n;
      for (let i = 0; i < n; i++) { const m = 1 + (i + 0.5) * pitch; g.rect(litWin(i, f, L) ? 'w' : 'd', m - (ww || 2.6) / 2, v0, m + (ww || 2.6) / 2, v1); }
      g.rect('s', 0.5, v1 + 0.4, L - 0.5, v1 + 1.1); // chajja shade
    }
  }
  const FAC = {
    shop: fac((g, L, H) => {
      const gf = Math.min(H - 0.5, 9.4);
      g.rect('g', 0, 0, L, 0.7);
      const m = Math.max(0.8, Math.min(2.2, L * 0.07));
      g.rect('w', m, 0.7, L - m, gf - 2.4);
      g.rect('l', m, gf - 2.4, L - m, gf - 1.5);
      g.rect('a', 0, gf - 1.5, L, gf);
      upperWindows(g, L, H, gf, 2.6);
    }),
    plain: fac((g, L, H) => { g.rect('g', 0, 0, L, 0.7); upperWindows(g, L, H, 0, 2.6); }),
    cafe: fac((g, L, H) => { // Irani cafe: arched openings + dado + cornice
      const gf = Math.min(H - 0.5, 11);
      g.rect('g', 0, 0, L, 1.2);
      g.rect('x', 0, 1.2, L, 2.4);
      const n = Math.max(2, Math.round(L / 7));
      g.arcade('l', 1, L - 1, n, 0.7, gf - 4.4, gf - 1.8, 1.6, 1.0);
      g.arcade('w', 1.5, L - 1.5, n, 0.7, gf - 4.6, gf - 2.3, 2.6, 1.0);
      g.rect('a', 0, gf - 1.2, L, gf);
      upperWindows(g, L, H, gf, 2.4);
    }),
    school: fac((g, L, H) => { // two corridor storeys with pillars + railings
      const fl = Math.max(1, Math.floor(H / 10));
      for (let f = 0; f < fl; f++) {
        const v0 = f * 10;
        g.rect('r', 0, v0 + 0.6, L, v0 + 8.4);
        const n = Math.max(2, Math.floor(L / 6));
        for (let i = 0; i < n; i++) { const u = (i + 0.5) * (L / n); g.rect(litWin(i, f, L) ? 'w' : 'd', u - 1.6, v0 + 1.4, u + 1.6, v0 + 6.6); }
        for (let i = 0; i <= n; i++) { const u = i * (L / n); g.rect('l', u - 0.45, v0 + 0.6, u + 0.45, v0 + 8.4); }
        if (f > 0) g.rect('a', 0, v0 + 0.6, L, v0 + 2.2);
        g.rect('l', 0, v0 + 8.4, L, v0 + 9.4);
      }
      g.rect('a', 0, H - 1.2, L, H);
    }),
    glass: fac((g, L, H) => {
      g.rect('g', 0, 0, L, 1);
      g.rect('w', 0.6, 1, L - 0.6, H - 1.4);
      for (let u = 4; u < L - 1; u += 4) g.rect('l', u - 0.25, 1, u + 0.25, H - 1.4);
      for (let v = 6; v < H - 2; v += 5) g.rect('l', 0.6, v - 0.2, L - 0.6, v + 0.2);
      g.rect('a', 0, H - 1.4, L, H);
    }),
    hall: fac((g, L, H) => { // cinema / auditorium side wall: fins + exit doors
      g.rect('g', 0, 0, L, 1);
      for (let u = 5; u < L - 3; u += 7) g.rect('r', u - 1, 1, u + 1, H - 2);
      for (let u = 8.5; u < L - 5; u += 21) g.rect('d', u - 1.6, 0.8, u + 1.6, 6.4);
      g.rect('l', 0, H - 2, L, H - 1);
    }),
    office: fac((g, L, H) => { // 70s government block: ribbon windows + sunshades
      g.rect('g', 0, 0, L, 0.9);
      const fl = Math.max(1, Math.floor(H / 10));
      for (let f = 0; f < fl; f++) {
        const v0 = f * 10 + 2.6;
        const n = Math.max(1, Math.floor(L / 5));
        for (let i = 0; i < n; i++) { const u = (i + 0.5) * (L / n); g.rect(litWin(i, f, L) ? 'w' : 'd', u - 1.7, v0, u + 1.7, v0 + 4.4); }
        g.rect('s', 0, v0 + 4.8, L, v0 + 5.6);
        g.rect('l', 0, v0 + 4.4, L, v0 + 4.9);
      }
      g.rect('a', 0, H - 1, L, H);
    }),
    blank: fac((g, L, H) => { g.rect('g', 0, 0, L, 0.8); g.rect('l', 0, H - 1, L, H); }),
  };

  /* ======================================================== roof sprite cache */
  const ROOF_RES = 2;
  // A.roofItems: [{t:'line'|'chilli'|'cot'|'plants'|'stain'|'tiles', ...}] in world coords
  function roofImage(A) {
    if (A.roofC) return A.roofC;
    const { x, y, w, d } = A.rr;
    const c = N.render.makeCanvas(Math.ceil(w * ROOF_RES) + 2, Math.ceil(d * ROOF_RES) + 2);
    const g = c.getContext('2d');
    g.setTransform(ROOF_RES, 0, 0, ROOF_RES, 1 - x * ROOF_RES, 1 - y * ROOF_RES);
    try { paintRoof(g, A); } catch (e) { N.err('placesArt.roof', e); }
    A.roofC = c;
    return c;
  }
  function paintRoof(g, A) {
    const { x, y, w, d } = A.rr;
    g.fillStyle = A.roof; g.fillRect(x, y, w, d);
    if (A.roofTiles) { // Mangalore tiles: rows
      g.strokeStyle = 'rgba(80,30,20,0.35)'; g.lineWidth = 0.4;
      g.beginPath();
      if (A.roofTiles === 'x') for (let yy = y + 1.2; yy < y + d; yy += 1.6) { g.moveTo(x, yy); g.lineTo(x + w, yy); }
      else for (let xx = x + 1.2; xx < x + w; xx += 1.6) { g.moveTo(xx, y); g.lineTo(xx, y + d); }
      g.stroke();
      return;
    }
    const rng = U.rng('roof:' + A.id);
    g.fillStyle = 'rgba(60,50,40,0.10)';
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x + rng.next() * w, y + rng.next() * d, 1.5 + rng.next() * 3, 0, TAU); g.fill(); }
    g.strokeStyle = A.trim || '#efe9dc'; g.lineWidth = 1.1;
    g.strokeRect(x + 0.6, y + 0.6, w - 1.2, d - 1.2);
    g.strokeStyle = 'rgba(40,30,30,0.18)'; g.lineWidth = 0.6;
    g.strokeRect(x + 1.6, y + 1.6, w - 3.2, d - 3.2);
    for (const it of A.roofItems || []) {
      if (it.t === 'line') {
        g.strokeStyle = 'rgba(40,40,40,0.55)'; g.lineWidth = 0.35;
        g.beginPath(); g.moveTo(it.x0, it.y0); g.lineTo(it.x1, it.y1); g.stroke();
        const n = 4 + ((it.x0 * 7) | 0) % 4;
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, px = it.x0 + (it.x1 - it.x0) * t, py = it.y0 + (it.y1 - it.y0) * t;
          g.fillStyle = ['#d8402a', '#2a5cb8', '#f2c230', '#efe9dc', '#3a8a3a', '#e88aa8', '#7a3a8a'][(i + n) % 7];
          if (Math.abs(it.x1 - it.x0) > Math.abs(it.y1 - it.y0)) g.fillRect(px - 0.8, py - 0.2, 1.6, 1.8); else g.fillRect(px - 0.2, py - 0.8, 1.8, 1.6);
        }
      } else if (it.t === 'chilli') {
        g.fillStyle = '#e8dcc0'; g.fillRect(it.x, it.y, it.w, it.d);
        g.fillStyle = '#c82a1a';
        for (let i = 0; i < 18; i++) g.fillRect(it.x + 0.4 + ((i * 2.3) % (it.w - 1)), it.y + 0.4 + ((i * 1.7) % (it.d - 1)), 0.9, 0.6);
      } else if (it.t === 'cot') {
        g.fillStyle = '#6a4428'; g.fillRect(it.x, it.y, it.w, it.d);
        g.fillStyle = '#d8c8a0'; g.fillRect(it.x + 0.6, it.y + 0.6, it.w - 1.2, it.d - 1.2);
        g.strokeStyle = 'rgba(120,90,50,0.6)'; g.lineWidth = 0.25; g.beginPath();
        for (let i = 1; i < it.w; i += 1) { g.moveTo(it.x + i, it.y + 0.6); g.lineTo(it.x + i, it.y + it.d - 0.6); }
        g.stroke();
      } else if (it.t === 'plants') {
        for (let i = 0; i < it.n; i++) {
          const px = it.x + i * 2.4;
          g.fillStyle = '#a0522d'; g.beginPath(); g.arc(px, it.y, 0.9, 0, TAU); g.fill();
          g.fillStyle = i % 3 ? '#4f8a3a' : '#3a7a2a'; g.beginPath(); g.arc(px, it.y, 0.75, 0, TAU); g.fill();
          if (i % 4 === 1) { g.fillStyle = '#e83a5a'; g.fillRect(px - 0.2, it.y - 0.2, 0.5, 0.5); }
        }
      } else if (it.t === 'kites') {
        for (let i = 0; i < 3; i++) {
          const kx = it.x + i * 3.2, ky = it.y + (i % 2) * 1.6;
          g.fillStyle = ['#e83a5a', '#2a5cb8', '#f2c230'][i];
          g.beginPath(); g.moveTo(kx, ky - 1.6); g.lineTo(kx + 1.2, ky); g.lineTo(kx, ky + 1.6); g.lineTo(kx - 1.2, ky); g.closePath(); g.fill();
        }
        g.fillStyle = '#c8a050'; g.beginPath(); g.arc(it.x + 10, it.y + 0.6, 1.1, 0, TAU); g.fill(); // charkha (spool)
        g.fillStyle = '#e83a5a'; g.beginPath(); g.arc(it.x + 10, it.y + 0.6, 0.6, 0, TAU); g.fill();
      } else if (it.t === 'rangoli') {
        g.strokeStyle = 'rgba(250,250,245,0.85)'; g.lineWidth = 0.35;
        g.beginPath(); g.arc(it.x, it.y, it.r, 0, TAU); g.stroke();
      }
    }
  }
  /** Standard roof furniture (live 3D): Sintex tank, stair room, TV antenna, dish. */
  function roofFurniture(A, h) {
    const it = A.r3;
    if (!it) return;
    if (it.mumty) abox(it.mumty[0], it.mumty[1], it.mumty[2], it.mumty[3], h, h + 7, A.wall, A.roofDark || sh(A.roof, 0.95));
    if (it.tank) {
      const [tx, ty, tr, black] = it.tank;
      const hb = it.tankOn ? h + 7 : h;
      if (black) { cyl(tx, ty, tr, hb, hb + 4.2, '#2c3036', '#3b4048'); ring(tx, ty, tr * 0.55, hb + 4.2, '#555b63', 0.4); }
      else { abox(tx - tr, ty - tr, tr * 2, tr * 1.7, hb, hb + 3.6, '#a8a39a', '#c4bfb6'); }
    }
    if (it.ant) {
      const [axx, ayy, ah, aa] = it.ant;
      const k0 = kh(h), k1 = kh(h + ah), ca = Math.cos(aa), sa = Math.sin(aa);
      ctx.beginPath();
      ctx.moveTo(sx(axx, k0), sy(ayy, k0)); ctx.lineTo(sx(axx, k1), sy(ayy, k1));
      for (let i = 0; i < 3; i++) {
        const kk = kh(h + ah - i * 2.2), Lr = 4.4 - i;
        ctx.moveTo(sx(axx - ca * Lr, kk), sy(ayy - sa * Lr, kk)); ctx.lineTo(sx(axx + ca * Lr, kk), sy(ayy + sa * Lr, kk));
      }
      ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = 0.6; ctx.stroke();
      if (it.kite && sw().sankranti) { // a kite tangled on the antenna
        const kk = kh(h + ah - 1), kx = sx(axx + ca * 4, kk), ky = sy(ayy + sa * 4, kk);
        ctx.fillStyle = it.kite; ctx.beginPath(); ctx.moveTo(kx, ky - 2.4 * kk); ctx.lineTo(kx + 2 * kk, ky); ctx.lineTo(kx, ky + 2.4 * kk); ctx.lineTo(kx - 2 * kk, ky); ctx.fill();
      }
    }
    if (it.dish) {
      const [dx, dy] = it.dish;
      pole(dx, dy, h, h + 2.5, '#6a6a70', 0.5);
      disc(dx, dy, 1.9, h + 3, '#d8d8d0'); disc(dx + 0.3, dy + 0.3, 0.6, h + 3.2, '#8a8a84');
    }
  }
  // standard roof plan for a rect (seeded)
  function planRoof(A, rng, opts) {
    const { x, y, w, d } = A.rr;
    const o = opts || {};
    A.roofItems = [];
    A.r3 = {};
    const big = w * d > 500;
    if (o.mumty !== false && w > 16 && d > 14 && rng.next() < 0.7) {
      const mw = 6, md = 6, corner = rng.next() < 0.5;
      A.r3.mumty = [corner ? x + 2 : x + w - mw - 2, y + d - md - 2, mw, md];
    }
    if (o.tank !== false) {
      const black = rng.next() < 0.8;
      const tr = black ? 2.2 : 2.5;
      const onM = A.r3.mumty && rng.next() < 0.5;
      const tx = onM ? A.r3.mumty[0] + 3 : x + 3.5 + rng.next() * Math.max(0.1, w - 7), ty = onM ? A.r3.mumty[1] + 3 : y + 3.5 + rng.next() * Math.max(0.1, d * 0.4);
      A.r3.tank = [tx, ty, tr, black];
      A.r3.tankOn = onM;
    }
    if (o.ant !== false && rng.next() < 0.75) A.r3.ant = [x + 2.5 + rng.next() * (w - 5), y + 2.5 + rng.next() * (d - 5), 8 + rng.next() * 4, rng.next() * Math.PI, ['#e83a5a', '#2a5cb8', '#f2c230'][(rng.next() * 3) | 0]];
    if (A.r3.ant) A.r3.kite = A.r3.ant[4];
    if (o.dish !== false && rng.next() < 0.3) A.r3.dish = [x + w - 3, y + 3];
    if (o.line !== false && rng.next() < 0.75) {
      if (w >= d) { const ly = y + d * (0.45 + rng.next() * 0.3); A.roofItems.push({ t: 'line', x0: x + 3, y0: ly, x1: x + w - 3, y1: ly }); }
      else { const lx = x + w * (0.45 + rng.next() * 0.3); A.roofItems.push({ t: 'line', x0: lx, y0: y + 3, x1: lx, y1: y + d - 3 }); }
    }
    if (big && rng.next() < 0.4) A.roofItems.push({ t: 'chilli', x: x + w * 0.55, y: y + 2.5, w: Math.min(8, w * 0.3), d: 4 });
    if (rng.next() < 0.35) A.roofItems.push({ t: 'plants', x: x + 3, y: y + d - 2.2, n: Math.max(2, Math.floor((w - 8) / 2.4 / 2)) });
    if (o.cot) A.roofItems.push({ t: 'cot', x: x + w * 0.5, y: y + d * 0.35, w: 8, d: 4 });
  }

  /* ========================================================= sign boards */
  // Raised lean-back signboard along the front edge of the roof (always readable from above).
  // The layout (lines, icon, depth) is fitted once at zoom 1; at other zooms the text is
  // dropped (icon only) when it would overflow the board.
  function planSign(A, text, bg, fg, iconName, opts) {
    const o = opts || {};
    const F = A.F;
    const over = o.over != null ? o.over : Math.min(4, F.L * 0.12);
    const len = F.L + over * 2 - 1.6;
    const k0 = 1 + (A.h + 3) * (N.render.PERSP || 0.0032);
    const two = F.D >= (o.twoAt || 13);
    const tries = [[iconName, 1], [null, 1]];
    if (two) tries.push([iconName, 2], [null, 2]);
    let lines = null, useIcon = !!iconName;
    for (const pass of [true, false]) { // complete text first, then shortened (two lines before one)
      const order = pass ? tries : tries.slice().sort((a, b) => b[1] - a[1]);
      for (const [ic, n] of order) {
        if (n === 1 && ic === null && !iconName && tries[0][0] === null) { /* same as first try */ }
        const avail = (len - (ic ? 9.5 : 1.5)) * k0;
        const l = text ? fitLines(text, avail, n, pass) : null;
        if (l) { lines = l; useIcon = !!ic; break; }
      }
      if (lines) break;
    }
    if (!text) useIcon = !!iconName;
    const maxW = lines ? Math.max.apply(null, lines.map(pw)) : 0;
    A.sign = { text: text || '', bg, fg: fg || '#fff6e0', icon: iconName, useIcon, lines, maxW, over, len,
      deep: lines && lines.length === 2 ? 12.5 : 7.5, vF: o.vF != null ? o.vF : -0.2, h0: o.h0 || 0.8, lift: o.lift || 3.6, frame: o.frame || '#2a201c', lit: o.lit !== false };
  }
  const SP = new Float64Array(12);
  function signPts(A, h) {
    const F = A.F, s = A.sign;
    const u0 = -F.L / 2 - s.over, u1 = F.L / 2 + s.over, vF = s.vF, vB = vF - s.deep;
    const hF = h + s.h0, hB = h + s.h0 + s.lift;
    SP[0] = fxp(F, u0, vF); SP[1] = fyp(F, u0, vF); SP[2] = hF; SP[3] = fxp(F, u1, vF); SP[4] = fyp(F, u1, vF); SP[5] = hF;
    SP[6] = fxp(F, u1, vB); SP[7] = fyp(F, u1, vB); SP[8] = hB; SP[9] = fxp(F, u0, vB); SP[10] = fyp(F, u0, vB); SP[11] = hB;
    return SP;
  }
  function drawSign(A, h, lit) {
    const s = A.sign; if (!s) return;
    const F = A.F;
    const p = signPts(A, h);
    if (!lit) {
      const vp = -s.deep * 0.6, hp = h + s.h0 + s.lift * 0.6;
      seg3(fxp(F, -F.L / 2 + 1, vp), fyp(F, -F.L / 2 + 1, vp), h, fxp(F, -F.L / 2 + 1, vp), fyp(F, -F.L / 2 + 1, vp), hp, '#3a3030', 0.5);
      seg3(fxp(F, F.L / 2 - 1, vp), fyp(F, F.L / 2 - 1, vp), h, fxp(F, F.L / 2 - 1, vp), fyp(F, F.L / 2 - 1, vp), hp, '#3a3030', 0.5);
      quad3(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11]);
      fillc(s.frame);
    }
    // inset face: the board shrunk by 0.55 u on every side
    {
      const u0 = -F.L / 2 - s.over + 0.55, u1 = F.L / 2 + s.over - 0.55, vF = s.vF - 0.55, vB = s.vF - s.deep + 0.55;
      const t0 = 0.55 / s.deep, hF = p[2] + (p[8] - p[2]) * t0 + 0.1, hB = p[8] - (p[8] - p[2]) * t0 + 0.1;
      quad3(fxp(F, u0, vF), fyp(F, u0, vF), hF, fxp(F, u1, vF), fyp(F, u1, vF), hF, fxp(F, u1, vB), fyp(F, u1, vB), hB, fxp(F, u0, vB), fyp(F, u0, vB), hB);
    }
    if (lit) { ctx.globalAlpha = lit; fillc(s.bg); ctx.globalAlpha = 1; } else fillc(s.bg);
    // icon + text, laid out along the reading direction (screen-aligned pixel text)
    const hm = (p[2] + p[8]) / 2, kk = kh(hm);
    const showText = s.lines && s.maxW <= (s.len - (s.useIcon ? 9.5 : 1.5)) * kk + 0.5;
    const showIcon = s.icon && (s.useIcon || !showText);
    const tw = showText ? s.maxW / kk : 0;
    const total = tw + (showIcon ? (showText ? 9 : 7) / kk : 0);
    const vM = s.vF - s.deep / 2;
    const cxw = fxp(F, 0, vM), cyw = fyp(F, 0, vM);
    const rdx = F.rot === 0 ? 1 : 0, rdy = F.rot === 1 ? 1 : F.rot === -1 ? -1 : 0;
    let t = -total / 2;
    if (showIcon) { const ti = t + 3.5 / kk; icon(s.icon, cxw + rdx * ti, cyw + rdy * ti, hm); t += 9 / kk; }
    if (showText) { const tc = t + tw / 2; ptext(cxw + rdx * tc, cyw + rdy * tc, hm, s.lines, s.fg, lit ? null : 'rgba(0,0,0,0.45)', F.rot); }
  }
  /** Lit version of the sign (light layer). */
  function nightSign(A, h, a) {
    if (!A.sign || !A.sign.lit) return;
    drawSign(A, h, clamp(a * 0.9, 0, 1));
  }

  /* ============================================================= awnings */
  // Awning over the footpath: u0..u1 along the front, depth dv, from hWall at the wall to hEdge.
  function awning(F, u0, u1, dv, hWall, hEdge, c1, c2, stripe) {
    const x0 = fxp(F, u0, 0), y0 = fyp(F, u0, 0), x1 = fxp(F, u1, 0), y1 = fyp(F, u1, 0);
    const x2 = fxp(F, u1, dv), y2 = fyp(F, u1, dv), x3 = fxp(F, u0, dv), y3 = fyp(F, u0, dv);
    const f = 0.95 + 0.12 * (F.ox * SUN.dx + F.oy * SUN.dy);
    quad3(x0, y0, hWall, x1, y1, hWall, x2, y2, hEdge, x3, y3, hEdge); fillc(sh(c1, f));
    if (c2) {
      const st = stripe || 1.6;
      ctx.beginPath();
      for (let u = u0 + st; u < u1 - 0.2; u += st * 2) {
        const ua = u, ub = Math.min(u1, u + st);
        mv(fxp(F, ua, 0), fyp(F, ua, 0), hWall); ln(fxp(F, ub, 0), fyp(F, ub, 0), hWall); ln(fxp(F, ub, dv), fyp(F, ub, dv), hEdge); ln(fxp(F, ua, dv), fyp(F, ua, dv), hEdge); ctx.closePath();
      }
      fillc(sh(c2, f));
    } else { // corrugation lines on a tin sheet
      ctx.beginPath();
      for (let u = u0 + 1.2; u < u1; u += 1.2) { mv(fxp(F, u, 0.2), fyp(F, u, 0.2), hWall); ln(fxp(F, u, dv - 0.1), fyp(F, u, dv - 0.1), hEdge); }
      ctx.strokeStyle = sh(c1, 0.72); ctx.lineWidth = Math.max(0.4, 0.35 * Z); ctx.stroke();
    }
    // valance (only seen from the front)
    if (camFront(F)) { quad3(x3, y3, hEdge, x2, y2, hEdge, x2, y2, hEdge - 1.1, x3, y3, hEdge - 1.1); fillc(sh(c2 || c1, 0.72)); }
  }

  /* ========================================================== generic building */
  // A = per-landmark art state (lm._pa): rect, front, palette, roof plan, sign, goods...
  function baseState(lm, spec) {
    const rng = rngOf(lm, 'b');
    const F = frontOf(lm);
    const A = {
      id: lm.id, lm, F, rng,
      h: Math.max(8, lm.h || 20),
      rr: { x: F.x, y: F.y, w: F.w, d: F.d },
      wall: spec.wall || pickR(rng, spec.walls || WALLS),
      roof: spec.roof || pickR(rng, ROOFS),
      trim: spec.trim || '#f4ecd8',
    };
    A.st = {
      wall: A.wall, roof: A.roof, trim: A.trim, dark: spec.dark || '#3a2f2b', acc: spec.acc || sh(A.wall, 0.8),
      acc2: spec.acc2 || '#2a8c82', acc3: spec.acc3 || '#6f9a3a', base: spec.base || '#8f8a86',
      win: spec.win || '#4a3a30', litCol: spec.litCol || '#ffe0a0', pass: spec.pass,
      fac: null, roofFn: null,
    };
    const ff = spec.front || FAC.shop, fs = spec.side || FAC.plain;
    A.st.fac = { N: F.f === 'N' ? ff : fs, S: F.f === 'S' ? ff : fs, W: F.f === 'W' ? ff : fs, E: F.f === 'E' ? ff : fs };
    A.st.roofFn = (c, x, y, w, d) => { c.imageSmoothingEnabled = true; c.drawImage(roofImage(A), x - 1 / ROOF_RES, y - 1 / ROOF_RES, w + 2 / ROOF_RES, d + 2 / ROOF_RES); c.imageSmoothingEnabled = false; };
    planRoof(A, rng, spec.roofPlan);
    return A;
  }
  const WALLS = ['#e8dcc0', '#d9c9a4', '#cfe0d8', '#e6cfc0', '#d8d0e0', '#e8e0a8', '#c8dcc8', '#f0e4d0', '#d8c0a8', '#c0d4e0', '#e8c8c8', '#d0e4c0'];
  const ROOFS = ['#cfc4ae', '#c8bca4', '#d6ccb6', '#bfb6a6', '#d0c0a8', '#c4c8c0'];
  function building(A) {
    if (K.box) K.box(A.rr.x, A.rr.y, A.rr.w, A.rr.d, 0, A.h, A.st);
    else abox(A.rr.x, A.rr.y, A.rr.w, A.rr.d, 0, A.h, A.wall, A.roof);
    roofFurniture(A, A.h);
  }
  function castMain(A, f) { N.draw.castBox(A.rr.x, A.rr.y, A.rr.w, A.rr.d, A.h * (f || 0.95)); }

  /* ================================================================ registry */
  const PEOPLE = []; // [{lm|item, x0, y0, x1, y1, list, count()}] queued on 'actors' by the system
  const DECOR = [];  // place-driven decorations {x0,y0,x1,y1, draw, shadow?, lights?, night?, actors?}
  const DEFS = {};
  // per-frame cost of this module (N.placesArt.perf()): wrapped draw / night / lights / shadow
  // calls plus the system's people, decorations and enqueue work
  const PERF = { frame: -1, cur: 0, last: 0, calls: 0, lastCalls: 0 };
  const now = () => performance.now();
  function perfAdd(t0) {
    const f = N.time ? N.time.frame : 0;
    if (f !== PERF.frame) { PERF.last = PERF.cur; PERF.lastCalls = PERF.calls; PERF.cur = 0; PERF.calls = 0; PERF.frame = f; }
    PERF.cur += now() - t0; PERF.calls++;
  }
  function timed(fn) { return function () { const t0 = now(); try { return fn.apply(this, arguments); } finally { perfAdd(t0); } }; }
  function reg(drawId, def) {
    DEFS[drawId] = def;
    const wrapped = {
      init(lm) { if (lm._pa) return; frame(); lm._pa = def.init ? def.init(lm) : {}; if (lm._pa && lm._pa.people) addPeople(lm, lm._pa); },
      draw: timed((lm) => { frame(); sw(); def.draw(lm, lm._pa || (lm._pa = {})); }),
      shadow: timed(def.shadow ? (lm) => { frame(); def.shadow(lm, lm._pa || {}); } : (lm) => { if (lm._pa && lm._pa.rr) castMain(lm._pa); else N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, (lm.h || 10) * 0.8); }),
      lights: def.lights ? timed((lm) => { frame(); def.lights(lm, lm._pa || {}); }) : undefined,
      night: def.night ? timed((lm, a) => { frame(); sw(); def.night(lm, lm._pa || {}, a); }) : undefined,
      floor: def.floor ? (lm) => { frame(); def.floor(lm, lm._pa || {}); } : undefined,
      ground: def.ground ? (g, lm) => { def.ground(g, lm); } : undefined,
    };
    LMK.register(drawId, wrapped);
  }
  function addPeople(lm, A) {
    if (A._peopleAdded) return;
    A._peopleAdded = true;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of A.people) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const e = { A, x0: x0 - 8, y0: y0 - 8, x1: x1 + 8, y1: y1 + 8, fn: null };
    e.fn = timed(() => { frame(); const n = A.count ? A.count(A) : A.people.length; drawPeople(A.people, Math.min(n, A.people.length)); });
    PEOPLE.push(e);
  }
  // Pre-initialise every landmark of ours once the world exists (so people show up even
  // before landmarks.js first enqueues the landmark).
  function initAll() {
    const D = N.WORLD_DATA;
    if (!D || !D.landmarks) return;
    frame();
    for (const lm of D.landmarks) {
      if (!DEFS[lm.draw] || lm._pa) continue;
      try { lm._pa = DEFS[lm.draw].init ? DEFS[lm.draw].init(lm) : {}; if (lm._pa && lm._pa.people) addPeople(lm, lm._pa); } catch (e) { N.err('placesArt.init:' + lm.draw, e); lm._pa = {}; }
    }
  }

  /* ================================================================ SHOPS */
  // per-kind shop recipes: palette, sign, awning, goods painter, people
  const SHOP = {};
  function shopInit(lm, kind) {
    const base = SHOP[kind];
    const R0 = base.variants && lm.variant && base.variants[lm.variant] ? Object.assign({}, base, base.variants[lm.variant]) : base;
    const A = baseState(lm, R0);
    A.kind = kind; A.R0 = R0;
    const rng = U.rng('pa:' + lm.id + ':s');
    const sg = R0.sign || ['#b22b2b', '#fff4d8'];
    const bg = Array.isArray(sg[0]) ? pickR(rng, sg[0]) : sg[0];
    planSign(A, lm.sign || R0.text || lm.name || '', bg, sg[1], R0.icon, R0.signOpts);
    const aw = R0.awn;
    if (aw) {
      const pal = Array.isArray(aw[0]) ? pickR(rng, aw) : aw;
      A.awn = { c1: pal[0], c2: pal[1], d: R0.awnD || 3.2 };
    }
    A.people = [];
    if (R0.init) R0.init(lm, A, rng);
    if (R0.people) R0.people(lm, A, rng, (kind2, i, u, v, a, o) => A.people.push(person(kind2, i, fxp(A.F, u, v), fyp(A.F, u, v), a, o)));
    if (!A.people.length) delete A.people;
    A.count = R0.count;
    return A;
  }
  function drawShop(lm, A) {
    const R0 = A.R0;
    const front = camFront(A.F);
    if (!front && R0.goods) R0.goods(lm, A); // camera behind: goods first, the building leans over them
    building(A);
    if (A.awn) awning(A.F, -A.F.L / 2 + 0.6, A.F.L / 2 - 0.6, A.awn.d, Math.min(A.h - 1, 9.6), Math.min(A.h - 1, 9.6) - 1.8, A.awn.c1, A.awn.c2, 1.4);
    drawSign(A, A.h, 0);
    if (R0.extra) R0.extra(lm, A);
    if (front && R0.goods) R0.goods(lm, A);
  }
  function shopLights(lm, A) {
    const R0 = A.R0, F = A.F;
    const col = R0.glow || '#ffd890';
    light(lm, 0, 2, fxp(F, 0, 3), fyp(F, 0, 3), 3, Math.min(34, 14 + F.L * 0.6), col, 0.85);
    if (R0.lights) R0.lights(lm, A);
  }
  function shopNight(lm, A, a) {
    nightSign(A, A.h, a);
    const R0 = A.R0;
    // spill of light from the open shutter onto the footpath
    const F = A.F;
    glow(fxp(F, 0, 1.6), fyp(F, 0, 1.6), 2, Math.min(18, 6 + F.L * 0.35), R0.glow || '#ffd890', a * 0.4);
    if (R0.night) R0.night(lm, A, a);
  }
  function regShop(kind, recipe) {
    SHOP[kind] = recipe;
    reg(kind, {
      init: (lm) => shopInit(lm, kind),
      draw: drawShop,
      shadow: (lm, A) => { castMain(A); },
      lights: shopLights,
      night: shopNight,
      floor: recipe.floor,
      ground: recipe.ground,
    });
  }

  /* ----------------------------------------------------- goods helpers */
  function sack(F, u, v, r, grain, col) {
    const x = fxp(F, u, v), y = fyp(F, u, v);
    cyl(x, y, r, 0, r * 1.6, col || '#c8b48a', col || '#c8b48a');
    disc(x, y, r * 0.78, r * 1.6 + 0.05, grain);
    ring(x, y, r * 0.95, r * 1.6, sh(col || '#c8b48a', 0.8), 0.5);
  }
  function jars(F, u, v, n, cols, h) {
    for (let i = 0; i < n; i++) {
      const uu = u + (i - (n - 1) / 2) * 1.9;
      const x = fxp(F, uu, v), y = fyp(F, uu, v);
      cyl(x, y, 0.85, h, h + 2.2, '#cfe6ee', null);
      disc(x, y, 0.62, h + 2.25, cols[i % cols.length]);
      disc(x, y, 0.35, h + 2.3, '#f6f2ea');
    }
  }
  function crate(F, u, v, w, dd, h0, h1, col, fillCol) {
    fbox(F, u - w / 2, u + w / 2, v - dd / 2, v + dd / 2, h0, h1, col, sh(col, 1.1));
    if (fillCol) { const r = frect(F, u - w / 2 + 0.4, u + w / 2 - 0.4, v - dd / 2 + 0.4, v + dd / 2 - 0.4); hrect(r[0], r[1], r[2], r[3], h1 + 0.05, fillCol); }
  }
  function hangingStrip(F, u0, u1, v, h, cols) {
    // sachets / pouches hanging from the awning edge: little coloured rects
    const k0 = kh(h), k1 = kh(h - 2.4);
    let i = 0;
    for (let u = u0; u < u1; u += 0.9, i++) {
      const x = fxp(F, u, v), y = fyp(F, u, v);
      ctx.fillStyle = cols[i % cols.length];
      const X0 = sx(x, k0), Y0 = sy(y, k0), X1 = sx(x, k1), Y1 = sy(y, k1);
      ctx.fillRect(Math.min(X0, X1) - 0.4, Math.min(Y0, Y1) - 0.4, Math.abs(X1 - X0) + 0.9, Math.abs(Y1 - Y0) + 0.9);
    }
  }
  function cycleProp(x, y, a, col, h) {
    const ca = Math.cos(a), sa = Math.sin(a);
    spr(x, y, ca, sa, h || 2.2);
    ctx.fillStyle = '#1a1a1e'; ctx.fillRect(-7.4, -0.35, 4.4, 0.7); ctx.fillRect(3, -0.35, 4.4, 0.7); // wheels
    ctx.strokeStyle = col; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(-5.2, 0); ctx.lineTo(-1, 0.2); ctx.lineTo(3.4, 0); ctx.moveTo(-1, 0.2); ctx.lineTo(0.8, -0.1); ctx.stroke();
    ctx.fillStyle = '#2a2220'; ctx.fillRect(-2.2, -0.7, 1.8, 1.4); // seat
    ctx.strokeStyle = '#8a8a90'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(4.6, -2.2); ctx.lineTo(4.6, 2.2); ctx.stroke(); // handlebar
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ----------------------------------------------------- kirana */
  regShop('kirana', {
    sign: [['#c8202a', '#1f5aa8', '#e8a020', '#2f8a4a', '#7a2a7a'], '#fff4d8'], icon: 'jar',
    awn: [['#d8402a', '#f4e8d0'], ['#2a5cb8', '#f4e8d0'], ['#2f8a4a', '#f2e6a0'], ['#9aa0a6', null]], awnD: 3,
    win: '#5a4030', litCol: '#fff2cc', glow: '#ffe8b0',
    goods(lm, A) {
      const F = A.F, L = F.L;
      const grains = ['#f4f0e4', '#e8c040', '#c8302a', '#7aa040', '#e8d8b0', '#a0522d'];
      const n = Math.max(2, Math.min(4, Math.floor(L / 6)));
      for (let i = 0; i < n; i++) sack(F, -L / 2 + 2.8 + i * 4, 4.4, 1.8, grains[(i + A.rr.x | 0) % grains.length]);
      // counter with glass candy jars at the shutter
      fbox(F, L / 2 - 8.5, L / 2 - 1.2, 0.3, 2.4, 0, 3.4, '#7a5030', '#9a6a40');
      jars(F, L / 2 - 4.9, 1.35, 3, ['#e8402a', '#f08a24', '#3aa04a', '#e85a9a'], 3.4);
      // soft drink crate
      crate(F, L / 2 - 2.2, 4.3, 2.6, 2.2, 0, 1.8, '#c8302a', '#2a201a');
      hangingStrip(F, -L / 2 + 1.4, L / 2 - 1.4, A.awn ? A.awn.d - 0.2 : 2.6, 7.8, ['#e8402a', '#f2c230', '#2a5cb8', '#f6f2ea', '#3aa04a', '#e85a9a']);
    },
    people(lm, A, rng, add) {
      add('uncle', (rng.next() * 6) | 0, A.F.L / 2 - 4.5, 0.8, A.F.ang, { sway: 0.3 });
      add('any', (rng.next() * 20) | 0, A.F.L / 2 - 4, 6.4, A.F.ang + Math.PI, { sway: 0.5 });
      add('kid', (rng.next() * 9) | 0, -1, 6.2, A.F.ang + Math.PI - 0.3, { sway: 0.8 });
    },
    count(A) { return S.min > 1350 || S.min < 400 ? 1 : 3; },
  });

  /* ----------------------------------------------------- stationery */
  regShop('stationery', {
    sign: [['#e86a1a', '#1f5aa8', '#2f8a4a', '#8a2a5a'], '#fff8e0'], icon: 'pencil',
    awn: [['#f2c230', '#2a5cb8'], ['#2a8c82', '#f4e8d0'], ['#9aa0a6', null]], awnD: 2.6,
    win: '#5a4a3a', litCol: '#f4fbff', glow: '#e8f4ff',
    goods(lm, A) {
      const F = A.F, L = F.L;
      // display rack with notebooks
      fbox(F, -L / 2 + 1.5, -L / 2 + 9, 2.4, 5.2, 0, 3.6, '#6a4a2a', '#8a6038');
      const cols = ['#f4f0e4', '#2a5cb8', '#e8d8b0', '#f4f0e4', '#c8302a', '#3a8a4a'];
      for (let i = 0; i < 6; i++) { const r = frect(F, -L / 2 + 1.9 + i * 1.2, -L / 2 + 2.9 + i * 1.2, 2.8, 4.8); hrect(r[0], r[1], r[2], r[3], 3.7 + (i % 2) * 0.3, cols[i]); }
      // brown cover-paper rolls standing in a bucket
      for (let i = 0; i < 4; i++) fcyl(F, L / 2 - 3 - (i % 2) * 1.5, 3 + (i >> 1) * 1.4, 0.55, 0, 6.5 + (i % 3), '#a8784a', '#c8986a');
      // charts hanging from the awning edge
      const chartCols = ['#f2c230', '#5ab0e0', '#f4f0e4', '#e85a5a'];
      for (let i = 0; i < 3; i++) {
        const u = -1.5 + i * 3.4;
        quad3(fxp(F, u, 2.5), fyp(F, u, 2.5), 8, fxp(F, u + 2.8, 2.5), fyp(F, u + 2.8, 2.5), 8, fxp(F, u + 2.8, 2.6), fyp(F, u + 2.8, 2.6), 4.4, fxp(F, u, 2.6), fyp(F, u, 2.6), 4.4);
        fillc(chartCols[i]);
      }
    },
    people(lm, A, rng, add) {
      add('man', (rng.next() * 8) | 0, 0, 0.9, A.F.ang, { sway: 0.3 });
      add('student', (rng.next() * 10) | 0, -2, 6, A.F.ang + Math.PI, { sway: 0.7 });
      add('student', 10 + ((rng.next() * 10) | 0), 2.4, 6.6, A.F.ang + Math.PI + 0.3, { sway: 0.7 });
    },
    count(A) { return S.min > 1290 || S.min < 450 ? 1 : 3; },
  });

  /* ----------------------------------------------------- pindi girni (flour mill) */
  regShop('pindi_girni', {
    walls: ['#e6e2d6', '#dfe2dc', '#e8e0cc'], sign: [['#2f6a3a', '#8a2a2a', '#1f4a8a'], '#fff8e0'], icon: 'wheat',
    awn: [['#b8bcc0', null]], awnD: 3.4, win: '#6a6460', litCol: '#fff6e0', glow: '#fff0d0',
    goods(lm, A) {
      const F = A.F, L = F.L;
      const thump = Math.sin(TIME * 22) > 0.2 ? 0.25 : 0;
      // the chakki: iron body + hopper + big pulley + belt to the motor
      const u = -L / 2 + 6;
      fbox(F, u - 2.6, u + 2.6, 0.6 + thump, 4.6 + thump, 0, 4.4, '#4a6a5a', '#5a7a6a');
      // hopper (inverted pyramid)
      const hx = fxp(F, u, 2.6 + thump), hy = fyp(F, u, 2.6 + thump);
      const k0 = kh(4.4), k1 = kh(7.2);
      ctx.beginPath();
      ctx.moveTo(sx(hx - 2.4, k1), sy(hy - 2.4, k1)); ctx.lineTo(sx(hx + 2.4, k1), sy(hy - 2.4, k1)); ctx.lineTo(sx(hx + 2.4, k1), sy(hy + 2.4, k1)); ctx.lineTo(sx(hx - 2.4, k1), sy(hy + 2.4, k1)); ctx.closePath();
      fillc('#6a7a72');
      ctx.beginPath(); ctx.arc(sx(hx, k0), sy(hy, k0), 1.1 * k0, 0, TAU); fillc('#e8e2d0');
      ctx.beginPath(); ctx.arc(sx(hx, k1), sy(hy, k1), 1.7 * k1, 0, TAU); fillc('#f4efe2'); // flour/grain in the hopper
      // motor + belt
      const mu = u + 6.5;
      fbox(F, mu - 1.4, mu + 1.4, 1.2, 3.6, 0, 2.6, '#2a4a7a', '#3a5a8a');
      const bx0 = fxp(F, u + 2.6, 2.6 + thump), by0 = fyp(F, u + 2.6, 2.6 + thump), bx1 = fxp(F, mu, 2.4), by1 = fyp(F, mu, 2.4);
      seg3(bx0, by0, 3.6, bx1, by1, 2.2, '#1a1414', 0.9);
      // spinning pulley spokes (seen from above as a flicker on the wheel)
      const pa = TIME * 18;
      const px0 = fxp(F, u + 2.9, 2.6 + thump), py0 = fyp(F, u + 2.9, 2.6 + thump);
      for (let i = 0; i < 2; i++) { const a = pa + i * Math.PI / 2; seg3(px0 - Math.cos(a) * F.ax * 1.8, py0 - Math.cos(a) * F.ay * 1.8, 2.6 + Math.sin(a) * 1.8, px0 + Math.cos(a) * F.ax * 1.8, py0 + Math.cos(a) * F.ay * 1.8, 2.6 - Math.sin(a) * 1.8, '#2a2a2a', 0.5); }
      // customers' steel dabbas waiting in a line
      for (let i = 0; i < 5; i++) {
        const du = L / 2 - 2 - i * 2.1;
        if (du < u + 4.5) break;
        fcyl(F, du, 3.4 + (i % 2) * 0.4, 0.9, 0, 2.2 + (i % 3) * 0.4, '#b8bcc4', '#d8dce2');
      }
      // flour puffs drifting out of the shutter
      for (let i = 0; i < 4; i++) {
        const t = (TIME * 0.35 + i * 0.25) % 1;
        puff(fxp(F, u - 1 + i * 0.8, 1 + t * 5), fyp(F, u - 1 + i * 0.8, 1 + t * 5), 2 + t * 6, 0.9 + t * 2.4, 0.45 * (1 - t), '#fbf8f0');
      }
    },
    ground(g, lm) { // flour dust on the footpath
      const F = frontOf(lm);
      g.fillStyle = 'rgba(250,248,240,0.38)';
      const r = frect(F, -F.L / 2, F.L / 2, 0, 5);
      g.fillRect(r[0], r[1], r[2], r[3]);
      g.fillStyle = 'rgba(250,248,240,0.25)';
      for (let i = 0; i < 6; i++) { const rr = frect(F, -F.L / 2 + i * F.L / 6, -F.L / 2 + i * F.L / 6 + 3, 5, 6.5); g.fillRect(rr[0], rr[1], rr[2], rr[3]); }
    },
    people(lm, A, rng, add) {
      add('uncle', 90 + ((rng.next() * 6) | 0), -A.F.L / 2 + 3, 1.2, A.F.ang + 0.6, { look: { skin: '#d8c8b0', hair: '#e8e4dc', lungi: '#e8e4dc' }, sway: 0.4 });
      add('aunty', (rng.next() * 10) | 0, A.F.L / 2 - 4, 6, A.F.ang + Math.PI, { sway: 0.5 });
      add('saree', (rng.next() * 10) | 0, A.F.L / 2 - 7, 6.6, A.F.ang + Math.PI - 0.4, { sway: 0.5 });
    },
    count(A) { return S.min > 1290 || S.min < 400 ? 1 : 3; },
  });

  /* ----------------------------------------------------- barber */
  regShop('barber', {
    sign: [['#1f5aa8', '#2a2a6a', '#8a2a2a'], '#fff8e0'], icon: 'scissors',
    awn: [['#9aa0a6', null], ['#2a5cb8', '#f4e8d0']], awnD: 2.4, win: '#5a6070', litCol: '#eaf6ff', glow: '#e8f4ff',
    goods(lm, A) {
      const F = A.F, L = F.L;
      // the striped pole: white cylinder + red/blue helix scrolling upwards
      const u = L / 2 - 1.6, v = 1.6, x = fxp(F, u, v), y = fyp(F, u, v);
      cyl(x, y, 0.8, 1, 8.6, '#f4f2ee', '#c8c8cc');
      const ph = (TIME * 2.2) % 1;
      for (let i = 0; i < 4; i++) {
        const h = 1.6 + ((i + ph) / 4) * 6.4;
        seg3(x - 0.75 * F.ax, y - 0.75 * F.ay, h, x + 0.75 * F.ax, y + 0.75 * F.ay, h + 1.1, i % 2 ? '#2a5cb8' : '#d8302a', 0.55);
      }
      disc(x, y, 0.9, 8.8, '#d8d8dc');
      // waiting bench
      fbox(F, -L / 2 + 1.5, -L / 2 + 8, 2.6, 4, 1.8, 2.4, '#6a4a2a', '#8a6038');
    },
    people(lm, A, rng, add) {
      add('man', (rng.next() * 12) | 0, -A.F.L / 2 + 3.5, 3.3, A.F.ang + Math.PI / 2, { sway: 0.2, look: { shirt: '#efe9dc' } });
      add('man', 30 + ((rng.next() * 12) | 0), -A.F.L / 2 + 6.5, 3.3, A.F.ang + Math.PI / 2 + 0.2, { sway: 0.2 });
      add('man', 50 + ((rng.next() * 6) | 0), 1, 0.6, A.F.ang, { sway: 0.4, look: { shirt: '#f4f4f4' } });
    },
    count() { return S.min > 1320 || S.min < 450 ? 0 : 3; },
  });

  /* ----------------------------------------------------- cycle rent */
  regShop('cycle_rent', {
    sign: [['#2f6a3a', '#8a2a2a', '#1f4a8a'], '#fff8e0'], icon: 'cycle',
    awn: [['#9aa0a6', null]], awnD: 2.6, win: '#4a4040', litCol: '#fff0c8',
    goods(lm, A) {
      const F = A.F, L = F.L;
      const cols = ['#1a1a1e', '#2a5cb8', '#3a7a3a', '#8a2a2a', '#1a1a1e', '#5a5a60'];
      const n = Math.max(2, Math.min(6, Math.floor((L - 4) / 3.4)));
      for (let i = 0; i < n; i++) {
        const u = -L / 2 + 2.6 + i * 3.4;
        cycleProp(fxp(F, u, 4.4), fyp(F, u, 4.4), F.ang + Math.PI + 0.25, cols[i % cols.length], 2.2);
      }
      // tyre hanging + pump
      ring(fxp(F, L / 2 - 2, 0.6), fyp(F, L / 2 - 2, 0.6), 1.5, 7, '#1a1a1e', 0.6);
      pole(fxp(F, L / 2 - 1.4, 2), fyp(F, L / 2 - 1.4, 2), 0, 3.4, '#c83030', 0.5);
    },
    people(lm, A, rng, add) { add('uncle', 40 + ((rng.next() * 6) | 0), 0, 1, A.F.ang, { sway: 0.3 }); add('kid', (rng.next() * 12) | 0, 2, 7, A.F.ang + Math.PI, { sway: 0.8 }); },
  });

  /* ----------------------------------------------------- video game parlour */
  regShop('video_parlour', {
    walls: ['#3a3a52', '#4a2a4a', '#2a3a4a'], sign: [['#121218'], '#ffe040'], icon: 'joy',
    awn: null, win: '#1a1a2a', litCol: '#9ae0ff', glow: '#a0c0ff', roof: '#9a98a0',
    goods(lm, A) {
      const F = A.F, L = F.L;
      // arcade cabinets peeking out of the shutter, screens flickering
      const scr = ['#40e0ff', '#ff4ad0', '#7aff5a'];
      for (let i = 0; i < 3; i++) {
        const u = -L / 2 + 4 + i * 4.6;
        fbox(F, u - 1.6, u + 1.6, 0.2, 2.6, 0, 7.2, '#22222e', '#2c2c3a');
        const fl = 0.75 + 0.25 * Math.sin(TIME * 9 + i * 2);
        const r = frect(F, u - 1.2, u + 1.2, 1.8, 2.5);
        ctx.globalAlpha = fl; hrect(r[0], r[1], r[2], r[3], 7.25, scr[i]); ctx.globalAlpha = 1;
      }
      // poster board on an easel
      fbox(F, L / 2 - 4.4, L / 2 - 1, 3.6, 4.2, 0, 6, '#f2c230', '#e83a5a');
    },
    night(lm, A, a) {
      const F = A.F;
      for (let i = 0; i < 3; i++) { const u = -F.L / 2 + 4 + i * 4.6; glow(fxp(F, u, 2.2), fyp(F, u, 2.2), 7, 6, ['#40e0ff', '#ff4ad0', '#7aff5a'][i], a * 0.6); }
    },
    people(lm, A, rng, add) {
      for (let i = 0; i < 4; i++) add(i % 3 ? 'kid' : 'student', (i * 5 + (rng.next() * 5)) | 0, -A.F.L / 2 + 4 + i * 3, 4 + (i % 2) * 1.5, A.F.ang + Math.PI + (i - 1.5) * 0.3, { sway: 0.9, turn: 0.3 });
    },
    count() { return S.min > 1290 || S.min < 600 ? 1 : 4; },
    variants: {
      recording: { // "Audio recording done here": a wall of cassettes, two big speakers, film songs on order
        walls: ['#e8d8c0', '#d8e0e8'], sign: [['#6a1a6a', '#1a3a7a'], '#ffe23a'], icon: 'film', litCol: '#ffe8c0', glow: '#ffd890',
        awn: [['#c0306a', '#f2c230']], awnD: 2.4,
        goods(lm, A) {
          const F = A.F, L = F.L;
          // speakers either side of the counter, cassette rack, a hand-written list of songs
          for (const e of [-1, 1]) { fbox(F, e * (L / 2 - 2.6) - 1.6, e * (L / 2 - 2.6) + 1.6, 0.6, 3, 0, 5.2, '#2a2a30', '#3a3a42'); fdisc(F, e * (L / 2 - 2.6), 1.8, 1, 5.3, '#6a6a72'); }
          fbox(F, -5, 5, 0.2, 1.8, 0, 3.4, '#7a5030', '#9a6a40');
          const cc = ['#e83a5a', '#2a5cd8', '#f2c230', '#f4f2ea', '#30b050', '#1a1a1a'];
          for (let i = 0; i < 9; i++) { const r = frect(F, -4.5 + i * 1.05, -3.7 + i * 1.05, 0.5, 1.5); hrect(r[0], r[1], r[2], r[3], 3.5, cc[i % cc.length]); }
          // music notes floating out of the shutter
          for (let i = 0; i < 2; i++) { const t = (TIME * 0.4 + i * 0.5) % 1; puff(fxp(F, -1 + i * 3, 2 + t * 4), fyp(F, -1 + i * 3, 2 + t * 4), 5 + t * 8, 0.7, 0.6 * (1 - t), '#1a1a1a'); }
          if (lm.sign2) { const k = kh(4); if (pw(lm.sign2) < (L + 6) * k) namePlate(fxp(F, 0, 4.4), fyp(F, 0, 4.4), 4, lm.sign2, '#f2c230', '#1a1416', F.rot); }
        },
        people(lm, A, rng, add) { add('man', 21, 0, 0.6, A.F.ang, { sway: 0.5 }); add('student', 22, -2, 5.4, A.F.ang + Math.PI, { sway: 0.6 }); add('kid', 23, 2, 5.8, A.F.ang + Math.PI, { sway: 0.7 }); },
        count() { return S.min > 1320 || S.min < 570 ? 0 : 3; },
        night: null,
      },
      tv_radio: { // a bunk shop with TVs in the window showing the cricket; a crowd gathers for the score
        walls: ['#e8e4dc'], sign: [['#1a3a8a'], '#ffffff'], icon: 'crt', litCol: '#c8e8ff', glow: '#c0e0ff', awn: [['#9aa0a6', null]], awnD: 2,
        goods(lm, A) {
          const F = A.F, L = F.L;
          for (let i = 0; i < 3; i++) {
            const u = -L / 2 + 5 + i * (L - 10) / 2;
            fbox(F, u - 2.4, u + 2.4, 0.2, 3.4, 0, 4.6, '#c8c0b0', '#d8d0c0');
            const r = frect(F, u - 1.9, u + 1.9, 0.5, 3.1);
            hrect(r[0], r[1], r[2], r[3], 4.65, '#2a2a30');
            const r2 = frect(F, u - 1.6, u + 1.6, 0.8, 2.8);
            hrect(r2[0], r2[1], r2[2], r2[3], 4.7, Math.sin(TIME * 0.7 + i) > -0.6 ? '#3a9a3a' : '#2a5cd8'); // the pitch (or an ad break)
            const pk = frect(F, u - 0.2, u + 0.2, 1.2, 2.4); hrect(pk[0], pk[1], pk[2], pk[3], 4.75, '#e8d8a0');
          }
          // a transistor radio on the counter, antenna up
          fbox(F, L / 2 - 3.4, L / 2 - 1, 0.4, 1.6, 0, 1.8, '#8a2a2a', '#a83a3a'); pole(fxp(F, L / 2 - 1.4, 1), fyp(F, L / 2 - 1.4, 1), 1.8, 6, '#c8ccd2', 0.3);
        },
        people(lm, A, rng, add) {
          add('man', 31, 0, -1, A.F.ang, { sway: 0.3 });
          for (let i = 0; i < 12; i++) add(pickR(rng, ['man', 'kid', 'student', 'uncle', 'man', 'lungi']), 40 + i, -A.F.L / 2 + 2 + (i % 6) * (A.F.L - 4) / 5, 4.4 + Math.floor(i / 6) * 2.6 + rng.next(), A.F.ang + Math.PI + (rng.next() - 0.5) * 0.6, { sway: 0.5, turn: 0.2 });
        },
        count() { return S.min < 540 || S.min > 1350 ? 0 : S.worldCup ? 13 : 4; },
        night(lm, A, a) { const F = A.F; for (let i = 0; i < 3; i++) { const u = -F.L / 2 + 5 + i * (F.L - 10) / 2; glow(fxp(F, u, 1.8), fyp(F, u, 1.8), 4.7, 5, '#9ad8ff', a * 0.7); } },
      },
    },
  });

  /* ----------------------------------------------------- photo studio */
  regShop('photo_studio', {
    sign: [['#f2c230', '#e8e4dc'], '#b22b2b'], icon: 'camera',
    awn: [['#2a5cb8', '#f2c230'], ['#c8302a', '#f2c230']], awnD: 2.4, win: '#4a4a5a', litCol: '#fff8ee',
    goods(lm, A) {
      const F = A.F, L = F.L;
      // glass showcase with framed photos on a stand
      fbox(F, -L / 2 + 1.4, -L / 2 + 7.4, 3.2, 4.6, 0, 5.4, '#6a4a2a', '#d8eef4');
      for (let i = 0; i < 4; i++) { const r = frect(F, -L / 2 + 1.9 + i * 1.4, -L / 2 + 2.9 + i * 1.4, 3.5, 4.3); hrect(r[0], r[1], r[2], r[3], 5.5, ['#e8c8a8', '#a8c8e8', '#e8e0a0', '#c8e8b8'][i]); }
    },
    people(lm, A, rng, add) { add('man', 60 + ((rng.next() * 8) | 0), 0, 0.8, A.F.ang, { sway: 0.3 }); add('student', (rng.next() * 12) | 0, 1.5, 6, A.F.ang + Math.PI, { sway: 0.6 }); },
    count() { return S.min > 1290 || S.min < 540 ? 0 : 2; },
  });

  /* ----------------------------------------------------- medical shop */
  regShop('medical_shop', {
    walls: ['#eef0ec', '#e8ecea', '#e4ece4'], sign: [['#1f8a4c', '#16703c'], '#ffffff'], icon: 'cross',
    awn: [['#2f9a5a', '#eef4ee'], ['#9aa0a6', null]], awnD: 2.4, win: '#d8ecee', litCol: '#eaffff', glow: '#d8fff0',
    goods(lm, A) {
      const F = A.F, L = F.L;
      // glass counter + projecting green cross box sign on a bracket
      fbox(F, -L / 2 + 1.2, L / 2 - 1.2, 0.2, 1.8, 0, 3.4, '#c8e0e4', '#e4f4f6');
      const u = -L / 2 + 1.4;
      seg3(fxp(F, u, 0), fyp(F, u, 0), 10.5, fxp(F, u, 3.2), fyp(F, u, 3.2), 10.5, '#4a4a4a', 0.5);
      fbox(F, u - 1.6, u + 1.6, 2.3, 4.5, 8, 11.6, '#f4f8f4', '#f4f8f4');
      const k = kh(11.7), cx0 = fxp(F, u, 3.4), cy0 = fyp(F, u, 3.4);
      ctx.fillStyle = '#1fae54';
      ctx.fillRect(sx(cx0, k) - 1.6 * k, sy(cy0, k) - 0.5 * k, 3.2 * k, 1 * k);
      ctx.fillRect(sx(cx0, k) - 0.5 * k, sy(cy0, k) - 1.6 * k, 1 * k, 3.2 * k);
    },
    night(lm, A, a) { const F = A.F, u = -F.L / 2 + 1.4; glow(fxp(F, u, 3.4), fyp(F, u, 3.4), 11.6, 7, '#30ff80', a * 0.8); },
    people(lm, A, rng, add) { add('man', 70 + ((rng.next() * 6) | 0), 0, 0.6, A.F.ang, { sway: 0.3, look: { shirt: '#f4f4f4' } }); add('aunty', (rng.next() * 10) | 0, -1.5, 4.4, A.F.ang + Math.PI, { sway: 0.5 }); },
    count() { return S.min > 1380 || S.min < 480 ? 1 : 2; },
  });

  /* ----------------------------------------------------- meat shop (kid friendly: cages + queue) */
  regShop('meat_shop', {
    walls: ['#e8e4dc', '#dfe6e6'], sign: [['#b22b2b', '#8a1a1a'], '#fff8e0'], icon: 'hen',
    awn: [['#9aa0a6', null], ['#c8302a', '#f4e8d0']], awnD: 2.6, win: '#c8c4bc', litCol: '#f4fbff',
    goods(lm, A) {
      const F = A.F, L = F.L;
      // two stacks of wire cages with white hens (they shuffle)
      for (let s = 0; s < 2; s++) {
        const u = -L / 2 + 3.4 + s * 6;
        for (let lev = 0; lev < 2; lev++) {
          const h0 = lev * 3.2, r = frect(F, u - 2.6, u + 2.6, 2.6, 5.4);
          abox(r[0], r[1], r[2], r[3], h0, h0 + 3, '#9a9890', false);
          // hens on top level visible
          if (lev === 1) {
            for (let i = 0; i < 3; i++) {
              const jit = Math.sin(TIME * 3 + i * 2 + s) * 0.4;
              fdisc(F, u - 1.6 + i * 1.6 + jit, 4 + (i % 2) * 0.6, 0.85, h0 + 3.05, '#f6f4ee');
              fdisc(F, u - 1.2 + i * 1.6 + jit, 3.6 + (i % 2) * 0.6, 0.35, h0 + 3.1, '#d8302a');
            }
            const rr = frect(F, u - 2.6, u + 2.6, 2.6, 5.4);
            const k = kh(h0 + 3.1);
            ctx.strokeStyle = 'rgba(70,70,70,0.75)'; ctx.lineWidth = 0.4; ctx.beginPath();
            for (let t = 0.5; t < rr[2]; t += 1.2) { ctx.moveTo(sx(rr[0] + t, k), sy(rr[1], k)); ctx.lineTo(sx(rr[0] + t, k), sy(rr[1] + rr[3], k)); }
            ctx.stroke();
          }
        }
      }
    },
    people(lm, A, rng, add) {
      add('man', 80 + ((rng.next() * 6) | 0), A.F.L / 2 - 3, 0.6, A.F.ang, { sway: 0.4, look: { shirt: '#f4f4f4' } });
      for (let i = 0; i < 4; i++) add(i % 2 ? 'man' : 'uncle', 20 + i * 3, A.F.L / 2 - 2 - i * 0.6, 4.5 + i * 2.6, A.F.ang + Math.PI, { sway: 0.4 });
    },
    count() { const sun = S.weekday === 0; return S.min < 360 || S.min > 1260 ? 0 : sun && S.min < 720 ? 5 : 2; },
  });

  /* ----------------------------------------------------- internet cafe (browsing centre) */
  regShop('internet_cafe', {
    walls: ['#e4e8f0', '#e8e4dc', '#dce8e8'], sign: [['#1f4a9a', '#2a2a6a', '#0f6a8a'], '#ffffff'], icon: 'crt',
    awn: [['#9aa0a6', null]], awnD: 2, win: '#3a4a5a', litCol: '#bfe8ff', glow: '#c0e0ff', front: null,
    init(lm, A) { A.st.fac[A.F.f] = FAC.glass; },
    goods(lm, A) {
      const F = A.F, L = F.L;
      // A-board "Rs 20 / HR"
      fbox(F, L / 2 - 4, L / 2 - 1, 3.6, 4.2, 0, 5.2, '#2a2a2a', '#f4f4f0');
      ptext(fxp(F, L / 2 - 2.5, 3.9), fyp(F, L / 2 - 2.5, 3.9), 5.3, ['RS20'], '#c82020', null, F.rot);
      // beige CRTs in plywood cubicles just inside the glass
      for (let i = 0; i < 3; i++) {
        const u = -L / 2 + 3.5 + i * 4.2;
        fbox(F, u - 1.8, u + 1.8, -3.6, -0.4, 0, 4.4, '#b88a5a', '#c89a6a');
      }
    },
    people(lm, A, rng, add) { add('student', 30 + ((rng.next() * 10) | 0), -2, 5, A.F.ang + Math.PI, { sway: 0.6 }); add('man', (rng.next() * 12) | 0, 2, 5.8, A.F.ang + Math.PI * 0.8, { sway: 0.5 }); },
    count() { return S.min > 1380 || S.min < 540 ? 0 : 2; },
  });

  /* ----------------------------------------------------- bakeries */
  function bakeryGoods(lm, A) {
    const F = A.F, L = F.L;
    // glass display case with buns, puffs, honey cake + biscuit tins stacked
    fbox(F, -L / 2 + 1.4, L / 2 - 7, 0.4, 2.8, 0, 3.6, '#a87a4a', '#d8ecf2');
    const cols = ['#d89a4a', '#f0c070', '#c8702a', '#f4e0a0', '#e8a8a0'];
    for (let i = 0; i < 6; i++) { const u = -L / 2 + 2.4 + i * 1.6; if (u > L / 2 - 8) break; fdisc(F, u, 1.6, 0.6, 3.7, cols[i % cols.length]); }
    const tins = ['#c8302a', '#2a5cb8', '#f2c230', '#2a8c82'];
    for (let i = 0; i < 4; i++) fbox(F, L / 2 - 5.4 + (i % 2) * 2.2, L / 2 - 3.6 + (i % 2) * 2.2, 2.4 + (i >> 1) * 2, 4.2 + (i >> 1) * 2, 0, 2 + (i % 3) * 0.6, tins[i], sh(tins[i], 1.15));
  }
  regShop('bakery', {
    walls: ['#f0e4cc', '#e8d8b8', '#f4ead8'], sign: [['#7a3a1a', '#a0522d', '#2a5a8a'], '#fff4d0'], icon: 'bread',
    awn: [['#a0522d', '#f4e8d0'], ['#2a5cb8', '#f4e8d0']], awnD: 2.6, win: '#7a5a3a', litCol: '#ffe8b0', glow: '#ffd890',
    goods: bakeryGoods,
    people(lm, A, rng, add) { add('man', 15 + ((rng.next() * 6) | 0), 0, 0.6, A.F.ang, { sway: 0.3 }); add('woman', (rng.next() * 10) | 0, 1.6, 5.4, A.F.ang + Math.PI, { sway: 0.5 }); add('kid', (rng.next() * 10) | 0, -1.6, 5.8, A.F.ang + Math.PI, { sway: 0.8 }); },
    count() { return S.min > 1350 || S.min < 450 ? 0 : 3; },
  });
  regShop('iyengar_bakery', {
    walls: ['#f4e8c8', '#f8ecc0'], sign: [['#c86a1a', '#a03a1a'], '#fffbe0'], icon: 'bread', text: 'IYENGAR BAKERY',
    awn: [['#f2c230', '#c8302a']], awnD: 2.6, win: '#b8782a', litCol: '#ffd860', glow: '#ffc850',
    goods: bakeryGoods,
    people(lm, A, rng, add) { add('man', 25 + ((rng.next() * 6) | 0), 0, 0.6, A.F.ang, { sway: 0.3 }); add('student', (rng.next() * 10) | 0, 1.6, 5.4, A.F.ang + Math.PI, { sway: 0.6 }); },
    count() { return S.min > 1350 || S.min < 450 ? 0 : 2; },
  });

  /* ----------------------------------------------------- bangle shops (Laad Bazaar) */
  regShop('bangle_shop', {
    walls: ['#e8c8d0', '#d8b8c8', '#f0d8c0'], sign: [['#c0306a', '#8a1a4a', '#2a5a8a'], '#fff4d0'], icon: 'bangle',
    awn: [['#c0306a', '#f2c230'], ['#2a8c82', '#f2c230']], awnD: 2.8, win: '#6a3a4a', litCol: '#ffe0b0', glow: '#ffd0a0',
    goods(lm, A) {
      const F = A.F, L = F.L;
      // stepped display stand with stacks of glittering lac bangles
      fbox(F, -L / 2 + 1.2, L / 2 - 1.2, 0.4, 3.2, 0, 2.4, '#7a2a3a', '#9a3a4a');
      fbox(F, -L / 2 + 1.2, L / 2 - 1.2, 0.4, 1.8, 2.4, 4, '#7a2a3a', '#9a3a4a');
      const cols = ['#d8202a', '#2a9a3a', '#e8b020', '#2a5cd8', '#c030a0', '#f06a1a'];
      let i = 0;
      for (let u = -L / 2 + 2; u < L / 2 - 1.8; u += 1.5, i++) {
        fdisc(F, u, 2.5, 0.6, 2.5, cols[i % 6]); ring(fxp(F, u, 2.5), fyp(F, u, 2.5), 0.6, 2.6, '#f8e070', 0.25);
        fdisc(F, u + 0.6, 1.1, 0.6, 4.1, cols[(i + 3) % 6]);
      }
      // glitter
      const tw = Math.floor(TIME * 6);
      for (let j = 0; j < 3; j++) { const u = -L / 2 + 2 + ((tw * 7 + j * 5) % Math.max(1, Math.floor(L - 4))); fdisc(F, u, 2.2, 0.25, 4.2, '#fffbe0'); }
    },
    night(lm, A, a) {
      if (!S.chandRaat && !S.ramzan) return;
      const F = A.F;
      if (K.bulbs) K.bulbs(fxp(F, -F.L / 2, 3.2), fyp(F, -F.L / 2, 3.2), 9.5, fxp(F, F.L / 2, 3.2), fyp(F, F.L / 2, 3.2), 9.5, 12, '#ffe070', '#60ff90', 1.2);
    },
    people(lm, A, rng, add) {
      add('man', 40 + ((rng.next() * 6) | 0), 0, 0.5, A.F.ang, { sway: 0.3 });
      for (let i = 0; i < 4; i++) add(i % 2 ? 'burqa' : 'woman', 10 + i * 2, -A.F.L / 2 + 3 + i * 4, 5 + (i % 2), A.F.ang + Math.PI, { sway: 0.4, turn: 0.2 });
    },
    count() { return S.chandRaat ? 5 : S.min > 1320 || S.min < 600 ? 1 : 3; },
  });

  /* ----------------------------------------------------- clothes store (Cherma's) */
  regShop('clothes_store', {
    walls: ['#e8e4dc'], sign: [['#1a1a2a'], '#f2c230'], icon: null, awn: null, win: '#405060', litCol: '#fff4dc', glow: '#ffe8c0',
    init(lm, A) { A.st.fac[A.F.f] = FAC.glass; },
    goods(lm, A) {
      const F = A.F;
      // mannequins behind the glass (seen through the front)
      for (let i = 0; i < 3; i++) { const u = -F.L / 2 + 6 + i * 10; fcyl(F, u, -1.5, 1, 0, 7, ['#c8302a', '#2a5cb8', '#f2c230'][i], '#d8b090'); }
    },
    people(lm, A, rng, add) { add('woman', 30, -4, 5, A.F.ang + Math.PI, { sway: 0.5 }); add('man', 33, 4, 5.5, A.F.ang + 2.6, { sway: 0.5 }); },
    count() { return S.min > 1290 || S.min < 630 ? 0 : 2; },
  });

  /* ================================================================ PUSHCARTS */
  // Cart frame: centre, long axis (ca, sa), half length/width, customer side (face).
  function cartOf(lm) {
    const long = lm.w >= lm.d;
    const ca = long ? 1 : 0, sa = long ? 0 : 1;
    const f = String(lm.face || 's').toUpperCase();
    const ox = f === 'E' ? 1 : f === 'W' ? -1 : 0, oy = f === 'S' ? 1 : f === 'N' ? -1 : 0;
    // customer side across the cart (+1 = local +y) or at an end (0)
    const side = Math.round(ox * -sa + oy * ca);
    return { x: lm.x, y: lm.y, ca, sa, hl: Math.max(lm.w, lm.d) / 2, hw: Math.min(lm.w, lm.d) / 2, ox, oy, side: side || 1 };
  }
  // local (u along, v across) -> world
  const cx_ = (C, u, v) => C.x + C.ca * u - C.sa * v;
  const cy_ = (C, u, v) => C.y + C.sa * u + C.ca * v;
  const LOAD_RES = 3;
  const loadCache = new Map();
  /** Cached top-down painting of a cart's load (local coords, u: -hl..hl, v: -hw..hw). */
  function loadImg(key, hl, hw, paint) {
    let c = loadCache.get(key);
    if (c) return c;
    c = N.render.makeCanvas(Math.ceil(hl * 2 * LOAD_RES) + 2, Math.ceil(hw * 2 * LOAD_RES) + 2);
    const g = c.getContext('2d');
    g.setTransform(LOAD_RES, 0, 0, LOAD_RES, hl * LOAD_RES + 1, hw * LOAD_RES + 1);
    try { paint(g, hl, hw, U.rng(key)); } catch (e) { N.err('placesArt.load', e); }
    loadCache.set(key, c);
    return c;
  }
  function drawLoad(C, img, h, inset) {
    const hl = C.hl - (inset || 0.4), hw = C.hw - (inset || 0.4);
    spr(C.x, C.y, C.ca, C.sa, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, -hl, -hw, hl * 2, hw * 2);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function cartBody(C, bed, hBed) {
    const hb = hBed || 5.2;
    // two big wheels on the long sides + stand legs at the ends
    obox(cx_(C, 0, C.hw + 0.25), cy_(C, 0, C.hw + 0.25), C.ca, C.sa, 2.7, 0.35, 0, hb - 0.4, '#2a2420', '#4a4038');
    obox(cx_(C, 0, -C.hw - 0.25), cy_(C, 0, -C.hw - 0.25), C.ca, C.sa, 2.7, 0.35, 0, hb - 0.4, '#2a2420', '#4a4038');
    obox(cx_(C, C.hl - 1, 0), cy_(C, C.hl - 1, 0), C.ca, C.sa, 0.4, C.hw - 1, 0, hb - 1, '#4a3a2a', null);
    obox(C.x, C.y, C.ca, C.sa, C.hl, C.hw, hb - 1.1, hb, bed, sh(bed, 1.12));
    // handles out of the back end
    const e = -C.hl;
    seg3(cx_(C, e, C.hw * 0.6), cy_(C, e, C.hw * 0.6), hb - 0.5, cx_(C, e - 3.2, C.hw * 0.6), cy_(C, e - 3.2, C.hw * 0.6), hb + 0.6, '#6a4a2a', 0.6);
    seg3(cx_(C, e, -C.hw * 0.6), cy_(C, e, -C.hw * 0.6), hb - 0.5, cx_(C, e - 3.2, -C.hw * 0.6), cy_(C, e - 3.2, -C.hw * 0.6), hb + 0.6, '#6a4a2a', 0.6);
  }
  function cartShadow(C, h) {
    // oriented: castBox works on axis-aligned rects; carts are axis aligned (ca/sa in {0,1})
    const w = C.ca ? C.hl * 2 : C.hw * 2, d = C.ca ? C.hw * 2 : C.hl * 2;
    N.draw.castBox(C.x - w / 2, C.y - d / 2, w, d, h);
  }
  const CART = {};
  function regCart(kind, recipe) {
    CART[kind] = recipe;
    reg(kind, {
      init(lm) {
        const C = cartOf(lm);
        const rng = rngOf(lm, 'c');
        const A = { C, rng, kind, seed: (rng.next() * 1e6) | 0 };
        A.bed = pickR(rng, recipe.beds || ['#3a6a9a', '#2a7a5a', '#8a3a2a', '#6a4a2a', '#2a5cb8']);
        if (recipe.umbrella) { const u = pickR(rng, recipe.umbrella); A.umb = u; }
        A.people = [];
        const add = (k, i, u, v, a, o) => A.people.push(person(k, i, cx_(C, u, v), cy_(C, u, v), a, o));
        // vendor at the handle end, facing along the cart
        const along = Math.atan2(C.sa, C.ca);
        add(recipe.vendor || 'man', (A.seed % 11), -C.hl - 4.4, 0, along, { sway: 0.5, look: recipe.vendorLook });
        if (recipe.customers !== 0) {
          const n = recipe.customers || 2;
          for (let i = 0; i < n; i++) add(pickR(rng, recipe.custKinds || ['any', 'woman', 'kid', 'man', 'aunty']), (A.seed + i * 7) % 23, (i - (n - 1) / 2) * 5, C.side * (C.hw + 4.6), along + (C.side > 0 ? -Math.PI / 2 : Math.PI / 2), { sway: 0.6, turn: 0.15 });
        }
        A.count = recipe.count;
        return A;
      },
      draw(lm, A) { drawCartA(kind, A); },
      shadow(lm, A) { cartShadow(A.C, 6); if (A.umb) N.draw.castCircle(cx_(A.C, -A.C.hl - 2, 0), cy_(A.C, -A.C.hl - 2, 0), recipe.umbR || 7.5, 12.5); },
      lights: recipe.lamp ? (lm, A) => { const C = A.C; light(lm, 0, 1, cx_(C, C.hl - 2, 0), cy_(C, C.hl - 2, 0), 9, 30, '#fff0c0', 0.9); } : undefined,
      night: recipe.lamp ? (lm, A, a) => {
        const C = A.C, x = cx_(C, C.hl - 2, 0), y = cy_(C, C.hl - 2, 0);
        pole(x, y, 5.2, 9, '#5a5a5a', 0.4);
        disc(x, y, 0.9, 9.2, '#fffbe8');
        glow(x, y, 9, 10, '#ffe8b0', a * 0.9);
        if (recipe.night) recipe.night(lm, A, a);
      } : recipe.night,
    });
  }
  function drawCartA(kind, A) {
    const recipe = CART[kind], C = A.C;
    cartBody(C, A.bed, recipe.hBed);
    if (recipe.load) drawLoad(C, loadImg(kind + ':' + (A.seed % 3) + ':' + C.hl + 'x' + C.hw, C.hl - 0.4, C.hw - 0.4, recipe.load), (recipe.hBed || 5.2) + 0.15);
    if (recipe.extra) recipe.extra(A.lm || null, A, C);
    if (A.umb) {
      const ux = cx_(C, -C.hl + 1, 0), uy = cy_(C, -C.hl + 1, 0);
      pole(ux, uy, 5, 12.5, '#6a6a6a', 0.5);
      umbrella(ux - C.ca * 3, uy - C.sa * 3, recipe.umbR || 7.5, 12.5, A.umb[0], A.umb[1], 8, (A.seed % 7) * 0.2);
    }
  }
  const propCarts = new Map();
  function cartPropA(kind, x, y, angle, seed) {
    const key = kind + '|' + Math.round(x) + '|' + Math.round(y) + '|' + angle.toFixed(2) + '|' + (seed | 0);
    let A = propCarts.get(key);
    if (A) return A;
    const recipe = CART[kind], rng = U.rng(key);
    A = { C: { x, y, ca: Math.cos(angle), sa: Math.sin(angle), hl: kind === 'book_stall' ? 12 : kind === 'kite_stall' ? 10 : 8, hw: kind === 'kite_stall' ? 6 : kind === 'book_stall' ? 5 : 4.5, side: 1 }, seed: seed == null ? (rng.next() * 1e6) | 0 : seed, kind };
    A.bed = pickR(rng, recipe.beds || ['#3a6a9a']);
    if (recipe.umbrella) A.umb = pickR(rng, recipe.umbrella);
    if (propCarts.size > 200) propCarts.clear();
    propCarts.set(key, A);
    return A;
  }
  // ---- load painters (local coords) ----
  function paintBananas(g, hl, hw, rng) {
    g.fillStyle = '#b89858'; g.fillRect(-hl, -hw, hl * 2, hw * 2);
    const n = Math.round(hl * hw * 0.32);
    for (let i = 0; i < n; i++) {
      const x = -hl + 1.4 + rng.next() * (hl * 2 - 2.8), y = -hw + 1.2 + rng.next() * (hw * 2 - 2.4);
      const a = rng.next() * TAU, green = rng.next() < 0.18, red = !green && rng.next() < 0.1;
      const col = green ? '#8ab03a' : red ? '#a8402a' : '#f2d23a';
      for (let j = 0; j < 5; j++) {
        const fa = a + (j - 2) * 0.32;
        g.fillStyle = j % 2 ? col : sh(col, 0.88);
        g.beginPath(); g.ellipse(x + Math.cos(fa) * 1.1, y + Math.sin(fa) * 1.1, 1.5, 0.48, fa, 0, TAU); g.fill();
      }
      g.fillStyle = '#5a4020'; g.beginPath(); g.arc(x, y, 0.4, 0, TAU); g.fill();
    }
  }
  function paintFlowers(g, hl, hw, rng) {
    g.fillStyle = '#2f6a4a'; g.fillRect(-hl, -hw, hl * 2, hw * 2); // wet gunny cloth
    const heaps = [['#f8f6ee', '#cfd8c0'], ['#f08a1a', '#c86010'], ['#f2c230', '#d89a10'], ['#d8203a', '#a01028'], ['#f8f6ee', '#cfd8c0'], ['#f06a2a', '#c04a10']];
    const n = Math.max(3, Math.round(hl / 2.4));
    for (let i = 0; i < n; i++) {
      const cx0 = -hl + (i + 0.5) * (hl * 2 / n), c = heaps[(i + ((rng.next() * 2) | 0)) % heaps.length];
      g.fillStyle = c[1]; g.beginPath(); g.ellipse(cx0, 0, hl / n * 0.95, hw * 0.82, 0, 0, TAU); g.fill();
      for (let j = 0; j < 28; j++) {
        const a = rng.next() * TAU, r = Math.sqrt(rng.next());
        g.fillStyle = j % 3 ? c[0] : sh(c[0], 0.85);
        g.beginPath(); g.arc(cx0 + Math.cos(a) * r * hl / n * 0.85, Math.sin(a) * r * hw * 0.72, 0.42, 0, TAU); g.fill();
      }
      if (c[0] === '#f8f6ee') { // jasmine strings coiled
        g.strokeStyle = 'rgba(90,140,90,0.6)'; g.lineWidth = 0.18;
        g.beginPath(); g.arc(cx0, 0, hw * 0.4, 0, TAU); g.arc(cx0, 0, hw * 0.22, 0, TAU); g.stroke();
      }
    }
  }
  function paintCoconuts(g, hl, hw, rng) {
    g.fillStyle = '#6a5030'; g.fillRect(-hl, -hw, hl * 2, hw * 2);
    const n = Math.round(hl * hw * 0.55);
    for (let i = 0; i < n; i++) {
      const x = -hl + 1 + rng.next() * (hl * 2 - 2), y = -hw + 1 + rng.next() * (hw * 2 - 2);
      const cut = rng.next() < 0.12;
      g.fillStyle = '#3f7a2a'; g.beginPath(); g.arc(x, y, 1.25, 0, TAU); g.fill();
      g.fillStyle = cut ? '#f4f0dc' : '#6aa040'; g.beginPath(); g.arc(x - 0.3, y - 0.3, cut ? 0.7 : 0.6, 0, TAU); g.fill();
      if (cut) { g.strokeStyle = '#e83a5a'; g.lineWidth = 0.25; g.beginPath(); g.moveTo(x - 0.3, y - 0.3); g.lineTo(x + 1.2, y - 1.4); g.stroke(); }
    }
  }
  function paintSteelTray(g, hl, hw, rng, what) {
    g.fillStyle = '#7a5a3a'; g.fillRect(-hl, -hw, hl * 2, hw * 2);
    g.fillStyle = '#c8ccd2'; g.fillRect(-hl + 0.6, -hw + 0.6, hl - 0.8, hw * 2 - 1.2);
    g.fillStyle = '#e4e8ec'; g.fillRect(-hl + 0.9, -hw + 0.9, hl - 1.4, 0.5);
    if (what === 'samosa') {
      for (let i = 0; i < 14; i++) {
        const x = -hl + 1.6 + (i % 5) * 1.5, y = -hw + 1.8 + Math.floor(i / 5) * 1.8;
        g.fillStyle = i % 2 ? '#d89a3a' : '#c8822a';
        g.beginPath(); g.moveTo(x, y - 0.8); g.lineTo(x + 0.8, y + 0.6); g.lineTo(x - 0.8, y + 0.6); g.closePath(); g.fill();
      }
    } else if (what === 'dosa') {
      g.fillStyle = '#1e1c1e'; g.fillRect(0.4, -hw + 0.6, hl - 1.1, hw * 2 - 1.2); // tawa
      g.fillStyle = '#f2e2b0'; g.beginPath(); g.arc(hl * 0.5, -hw * 0.2, Math.min(hw - 1.2, 2.4), 0, TAU); g.fill();
      g.fillStyle = '#e8c070'; g.beginPath(); g.arc(hl * 0.5, -hw * 0.2, Math.min(hw - 1.2, 2.4) * 0.6, 0, TAU); g.fill();
      for (let i = 0; i < 6; i++) { g.fillStyle = '#f8f4ea'; g.beginPath(); g.arc(-hl + 1.6 + (i % 3) * 1.6, -1 + Math.floor(i / 3) * 1.8, 0.65, 0, TAU); g.fill(); } // idlis
    } else if (what === 'chai') {
      for (let i = 0; i < 10; i++) { g.fillStyle = '#e8d4a8'; g.beginPath(); g.arc(-hl + 1.4 + (i % 5) * 1.2, -hw + 1.6 + Math.floor(i / 5) * 1.3, 0.45, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.15; g.stroke(); }
    }
    void rng;
  }
  function paintBooks(g, hl, hw, rng) {
    g.fillStyle = '#2a4a6a'; g.fillRect(-hl, -hw, hl * 2, hw * 2); // blue tarp
    const cols = ['#c8302a', '#2a5cb8', '#f2c230', '#efe9dc', '#3a8a4a', '#7a3a8a', '#e86a1a', '#5a3a2a'];
    for (let x = -hl + 0.8; x < hl - 1.6; x += 2.1) {
      for (let y = -hw + 0.7; y < hw - 1.4; y += 2.8) {
        g.fillStyle = cols[(rng.next() * cols.length) | 0];
        g.fillRect(x, y, 1.8, 2.4);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 0.3, y + 0.5, 1.2, 0.3);
      }
    }
  }

  regCart('banana_cart', {
    beds: ['#3a6a9a', '#2a7a5a', '#8a3a2a', '#6a4a2a'], load: paintBananas, vendor: 'man',
    umbrella: [['#d8402a', '#f4e8d0'], ['#2a5cb8', '#f2c230']], umbR: 5.5,
    extra(lm, A, C) { // a bunch hanging from the umbrella pole
      const x = cx_(C, -C.hl + 1, 1.2), y = cy_(C, -C.hl + 1, 1.2);
      seg3(x, y, 11.5, x, y, 8.8, '#5a4a2a', 0.3);
      disc(x, y, 1.3, 8.6, '#f2d23a'); disc(x + 0.4, y + 0.3, 0.7, 8.9, '#e0b820');
    },
    count() { return S.min > 1290 || S.min < 420 ? 1 : 3; },
  });
  regCart('flower_cart', {
    beds: ['#2a7a5a', '#3a6a9a', '#7a5a2a'], load: paintFlowers, vendor: 'aunty', custKinds: ['woman', 'saree', 'aunty', 'man'],
    umbrella: [['#f2c230', '#d8402a'], ['#2a8c82', '#f4e8d0'], ['#e85a9a', '#f4e8d0']], umbR: 5.5,
    extra(lm, A, C) { // garlands hanging from a bar across the cart
      const u0 = C.hl - 2;
      const xa = cx_(C, u0, -C.hw), ya = cy_(C, u0, -C.hw), xb = cx_(C, u0, C.hw), yb = cy_(C, u0, C.hw);
      pole(xa, ya, 5.2, 10.5, '#5a4a3a', 0.4); pole(xb, yb, 5.2, 10.5, '#5a4a3a', 0.4);
      seg3(xa, ya, 10.5, xb, yb, 10.5, '#5a4a3a', 0.4);
      for (let i = 1; i < 6; i++) {
        const t = i / 6, x = xa + (xb - xa) * t, y = ya + (yb - ya) * t;
        seg3(x, y, 10.3, x, y, 6.4, i % 2 ? '#f08a1a' : '#f8f6ee', 0.9);
      }
    },
    count() { const thu = S.weekday === 4; return S.min > 1320 || S.min < 360 ? 1 : thu ? 3 : 2; },
  });
  regCart('coconut_cart', {
    beds: ['#6a4a2a', '#3a6a9a'], load: paintCoconuts, vendor: 'man', umbrella: [['#3a8a3a', '#f2c230'], ['#d8402a', '#f4e8d0']], umbR: 5.5,
    count() { return S.min > 1200 || S.min < 480 ? 1 : 3; },
  });
  regCart('samosa_bandi', {
    beds: ['#8a3a2a', '#2a5cb8', '#5a5a5a'], load: (g, hl, hw, r) => paintSteelTray(g, hl, hw, r, 'samosa'), vendor: 'man', lamp: true,
    extra(lm, A, C) {
      // glass box + stove with a kadai of hot oil
      obox(cx_(C, -C.hl * 0.45, 0), cy_(C, -C.hl * 0.45, 0), C.ca, C.sa, C.hl * 0.42, C.hw - 0.6, 5.2, 8.6, '#a8ccd8', 'rgba(200,232,240,0.55)');
      const kx = cx_(C, C.hl * 0.55, 0), ky = cy_(C, C.hl * 0.55, 0);
      cyl(kx, ky, 2.2, 5.2, 6.8, '#3a3a40', '#2a2a2e');
      disc(kx, ky, 2.4, 7, '#1e1c1e'); disc(kx, ky, 1.8, 7.05, '#c89a3a');
      for (let i = 0; i < 3; i++) { const a = TIME * 0.6 + i * 2.1; disc(kx + Math.cos(a) * 0.9, ky + Math.sin(a) * 0.9, 0.55, 7.1, '#e0a040'); }
      steam(kx, ky, 7.5, 3, A.seed, '#f2efe8', 0.9);
    },
    count() { return S.min >= 900 && S.min <= 1320 ? 3 : 1; },
  });
  regCart('dosa_bandi', {
    beds: ['#2a5cb8', '#3a6a5a', '#8a3a2a'], load: (g, hl, hw, r) => paintSteelTray(g, hl, hw, r, 'dosa'), vendor: 'man', lamp: true,
    extra(lm, A, C) {
      // chutney buckets + idli steamer
      cyl(cx_(C, -C.hl * 0.6, C.hw + 1.4), cy_(C, -C.hl * 0.6, C.hw + 1.4), 0.9, 0, 2.4, '#b8bcc4', '#f4f2e8');
      cyl(cx_(C, -C.hl * 0.6 + 2, C.hw + 1.4), cy_(C, -C.hl * 0.6 + 2, C.hw + 1.4), 0.9, 0, 2.4, '#b8bcc4', '#d8402a');
      const ix = cx_(C, -C.hl * 0.25, -C.hw * 0.4), iy = cy_(C, -C.hl * 0.25, -C.hw * 0.4);
      cyl(ix, iy, 1.6, 5.2, 8.4, '#c8ccd2', '#e4e8ec');
      steam(ix, iy, 8.6, 3, A.seed, '#f6f4ee', 1);
      steam(cx_(C, C.hl * 0.5, 0), cy_(C, C.hl * 0.5, 0), 5.8, 2, A.seed + 3, '#f6f4ee', 0.7);
    },
    count() { return S.min >= 360 && S.min <= 690 ? 3 : 1; },
  });
  regCart('chai_bandi', {
    beds: ['#6a4a2a', '#2a7a5a', '#8a3a2a'], load: (g, hl, hw, r) => paintSteelTray(g, hl, hw, r, 'chai'), vendor: 'man', lamp: true, customers: 3, custKinds: ['man', 'uncle', 'student', 'man'],
    extra(lm, A, C) {
      // wooden cabin with a tin roof at the far end + the big kettle on the stove
      const cu = C.hl * 0.42;
      obox(cx_(C, cu, 0), cy_(C, cu, 0), C.ca, C.sa, C.hl * 0.55, C.hw, 5.2, 10, '#8a5a32', null);
      obox(cx_(C, cu, 0), cy_(C, cu, 0), C.ca, C.sa, C.hl * 0.62, C.hw + 0.8, 10, 10.6, '#9aa0a6', '#b8bcc0');
      const kx = cx_(C, -C.hl * 0.35, 0), ky = cy_(C, -C.hl * 0.35, 0);
      cyl(kx, ky, 1.2, 5.2, 6.4, '#3a3a40', '#2a2a2e');
      cyl(kx, ky, 1.8, 6.4, 9.2, '#c8ccd2', '#dfe2e6');
      seg3(kx + C.ca * 1.6, ky + C.sa * 1.6, 8.2, kx + C.ca * 3, ky + C.sa * 3, 9, '#b8bcc4', 0.5);
      steam(kx, ky, 9.4, 3, A.seed, '#f6f4ee', 1);
      // bench for customers
      const bs = C.side * (C.hw + 3.2);
      obox(cx_(C, 0, bs), cy_(C, 0, bs), C.ca, C.sa, C.hl * 0.7, 0.9, 1.6, 2.4, '#7a5a3a', '#8a6a48');
    },
    count() { return S.min >= 330 && S.min <= 1350 ? 4 : 1; },
  });
  regCart('kite_stall', {
    beds: ['#6a4a2a'], vendor: 'man', customers: 3, custKinds: ['kid', 'kid', 'student', 'man'],
    load(g, hl, hw, rng) { // charkhas (manja spools) + stacked kites on the table
      g.fillStyle = '#7a5a3a'; g.fillRect(-hl, -hw, hl * 2, hw * 2);
      const kc = ['#e83a5a', '#2a5cb8', '#f2c230', '#3aa04a', '#f06a1a', '#9a3ac8', '#f8f6ee'];
      for (let i = 0; i < 16; i++) {
        const x = -hl + 1.4 + (i % 8) * (hl * 2 - 2.8) / 7, y = i < 8 ? -hw * 0.45 : hw * 0.2;
        g.fillStyle = kc[(i + ((rng.next() * 3) | 0)) % kc.length];
        g.beginPath(); g.moveTo(x, y - 1.4); g.lineTo(x + 1.1, y); g.lineTo(x, y + 1.4); g.lineTo(x - 1.1, y); g.closePath(); g.fill();
      }
      for (let i = 0; i < 4; i++) { g.fillStyle = '#c8a050'; g.beginPath(); g.arc(-hl + 2 + i * 2.6, hw - 1.4, 0.9, 0, TAU); g.fill(); g.fillStyle = kc[i]; g.beginPath(); g.arc(-hl + 2 + i * 2.6, hw - 1.4, 0.55, 0, TAU); g.fill(); }
    },
    hBed: 4,
    extra(lm, A, C) {
      // bamboo frame + tarp over the stall, and kites pegged on a string line in front (they sway)
      for (const p of [[-C.hl, -C.hw], [C.hl, -C.hw], [C.hl, C.hw], [-C.hl, C.hw]]) pole(cx_(C, p[0], p[1]), cy_(C, p[0], p[1]), 0, 12, '#8a6a3a', 0.5);
      obox(cx_(C, 0, -C.side * 1.5), cy_(C, 0, -C.side * 1.5), C.ca, C.sa, C.hl + 0.6, C.hw - 0.5, 12, 12.4, null, A.seed % 2 ? '#d8402a' : '#2a8c82');
      ctx.beginPath();
      const vb = -C.side * 1.5, vh = C.hw - 0.5;
      for (let u = -C.hl; u < C.hl; u += 3) { mv(cx_(C, u, vb - vh), cy_(C, u, vb - vh), 12.45); ln(cx_(C, u + 1.5, vb - vh), cy_(C, u + 1.5, vb - vh), 12.45); ln(cx_(C, u + 1.5, vb + vh), cy_(C, u + 1.5, vb + vh), 12.45); ln(cx_(C, u, vb + vh), cy_(C, u, vb + vh), 12.45); ctx.closePath(); }
      fillc('#f4ecd8');
      const kc = ['#e83a5a', '#2a5cb8', '#f2c230', '#3aa04a', '#f06a1a', '#9a3ac8', '#f8f6ee'];
      const vv = C.side * (C.hw + 1.6);
      const ax = cx_(C, -C.hl, vv), ay = cy_(C, -C.hl, vv), bx = cx_(C, C.hl, vv), by = cy_(C, C.hl, vv);
      pole(ax, ay, 0, 9.4, '#8a6a3a', 0.4); pole(bx, by, 0, 9.4, '#8a6a3a', 0.4);
      seg3(ax, ay, 9.2, bx, by, 9.2, 'rgba(240,240,240,0.7)', 0.25);
      const nk = Math.max(4, Math.round(C.hl * 2 / 2.8));
      // kites batched by colour (one fill per colour)
      for (let ci = 0; ci < kc.length; ci++) {
        ctx.beginPath();
        let any = false;
        for (let row = 0; row < 2; row++) for (let i = 0; i < nk; i++) {
          if ((i + row * 3 + (A.seed % 5)) % kc.length !== ci) continue;
          any = true;
          const u = -C.hl + 1.4 + i * (C.hl * 2 - 2.8) / (nk - 1), sway = Math.sin(TIME * 2 + i * 1.3 + row) * 0.35, h = 8.6 - row * 3;
          const x = cx_(C, u, vv + sway + row * C.side * 0.6), y = cy_(C, u, vv + sway + row * C.side * 0.6), k = kh(h), X = sx(x, k), Y = sy(y, k);
          ctx.moveTo(X, Y - 2.1 * k); ctx.lineTo(X + 1.7 * k, Y); ctx.lineTo(X, Y + 2.1 * k); ctx.lineTo(X - 1.7 * k, Y); ctx.closePath();
        }
        if (any) fillc(kc[ci]);
      }
    },
    count() { return S.sankranti ? 4 : S.min > 1260 || S.min < 480 ? 1 : 2; },
  });
  regCart('book_stall', {
    beds: ['#5a4a3a'], load: paintBooks, vendor: 'uncle', hBed: 2.6, umbrella: [['#2a5cb8', '#e8e0c8']], umbR: 6, customers: 2, custKinds: ['student', 'man', 'uncle'],
    count() { return S.min > 1200 || S.min < 540 ? 0 : 3; },
  });

  /* ================================================================ BUS STOPS */
  function busStopInit(lm) {
    const A = { F: frontOf(lm), id: lm.id, h: 12 };
    const rng = rngOf(lm, 'bs');
    A.style = pickR(rng, [['#efe2c4', '#b22b2b'], ['#e8d8a0', '#2a5c8a'], ['#d8dce0', '#b22b2b']]);
    A.rr = { x: A.F.x, y: A.F.y, w: A.F.w, d: A.F.d };
    planSign(A, lm.sign || lm.name || 'BUS STOP', '#b22b2b', '#fff4d8', 'bus', { over: 3, twoAt: 6, lift: 3, h0: 0.6 });
    A.people = [];
    const F = A.F, n = 2 + (((rng.next() * 3) | 0));
    for (let i = 0; i < n; i++) {
      const u = -F.L / 2 + 5 + i * (F.L - 10) / Math.max(1, n - 1);
      A.people.push(person(pickR(rng, ['any', 'student', 'woman', 'man', 'aunty', 'uncle']), (rng.next() * 30) | 0, fxp(F, u, 3 + rng.next() * 2), fyp(F, u, 3 + rng.next() * 2), F.ang + (rng.next() - 0.5) * 1.2, { sway: 0.5, turn: 0.4 }));
    }
    A.count = () => (S.min > 1350 || S.min < 330 ? 0 : S.min > 450 && S.min < 600 ? A.people.length : Math.max(1, A.people.length - 1));
    return A;
  }
  function drawBusStop(lm, A) {
    const F = A.F, L = F.L, D = F.D, wall = A.style[0], acc = A.style[1];
    const vb = -D + 1.2;
    // back panel with a painted advert
    fbox(F, -L / 2 + 1, L / 2 - 1, vb - 0.5, vb + 0.5, 0, 9, wall, sh(wall, 1.05));
    // posts
    for (const u of [-L / 2 + 1.2, L / 2 - 1.2]) { const x = fxp(F, u, -0.6), y = fyp(F, u, -0.6); pole(x, y, 0, 11.4, '#5a5a5a', 0.6); }
    // bench
    fbox(F, -L / 2 + 3, L / 2 - 3, vb + 1, vb + 2.6, 2.2, 2.8, '#7a7a80', '#9a9aa2');
    // roof slab sloping to the road, red fascia
    const x0 = fxp(F, -L / 2, vb - 1), y0 = fyp(F, -L / 2, vb - 1), x1 = fxp(F, L / 2, vb - 1), y1 = fyp(F, L / 2, vb - 1);
    const x2 = fxp(F, L / 2, 0.8), y2 = fyp(F, L / 2, 0.8), x3 = fxp(F, -L / 2, 0.8), y3 = fyp(F, -L / 2, 0.8);
    quad3(x0, y0, 12.4, x1, y1, 12.4, x2, y2, 11.4, x3, y3, 11.4); fillc(sh(wall, 1.02 + 0.06 * (F.ox * SUN.dx + F.oy * SUN.dy)));
    quad3(x3, y3, 11.4, x2, y2, 11.4, x2, y2, 10.4, x3, y3, 10.4); fillc(acc);
    drawSign(A, 12, 0);
  }
  reg('bus_stop', {
    init: busStopInit, draw: drawBusStop,
    shadow(lm, A) { const r = frect(A.F, -A.F.L / 2, A.F.L / 2, -A.F.D + 0.2, 0.8); N.draw.castBox(r[0], r[1], r[2], r[3], 12); },
    lights(lm, A) { light(lm, 0, 1, fxp(A.F, 0, -2), fyp(A.F, 0, -2), 10, 26, '#e0f4ff', 0.7); },
    night(lm, A, a) { nightSign(A, 12, a * 0.8); },
  });

  /* ================================================================ STD / ISD / PCO booth */
  reg('std_booth', {
    init(lm) {
      const A = { F: frontOf(lm), id: lm.id, h: 10 };
      const rng = rngOf(lm, 'std');
      A.people = [person(pickR(rng, ['man', 'student', 'woman', 'uncle']), (rng.next() * 20) | 0, fxp(A.F, 2, 3.8), fyp(A.F, 2, 3.8), A.F.ang + Math.PI, { sway: 0.4, turn: 0.3 }),
        person(pickR(rng, ['man', 'kid', 'aunty']), (rng.next() * 20) | 0, fxp(A.F, -3, 5.8), fyp(A.F, -3, 5.8), A.F.ang + Math.PI - 0.5, { sway: 0.5 })];
      A.count = () => (S.min > 1380 || S.min < 360 ? 0 : S.min > 1260 ? 2 : 1); // after 21:00 (cheap rates) a queue
      return A;
    },
    draw(lm, A) {
      const x = lm.x - lm.w / 2, y = lm.y - lm.d / 2, w = lm.w, d = lm.d;
      // plinth + glass cabin (cyan glass, white frames), yellow roof
      abox(x, y, w, d, 0, 1, '#9a9690', '#b8b2a8');
      ctx.globalAlpha = 0.8; abox(x + 1, y + 1, w - 2, d - 2, 1, 9.6, '#9fd0dc', false); ctx.globalAlpha = 1;
      for (const [px, py] of [[x + 1, y + 1], [x + w - 1, y + 1], [x + w - 1, y + d - 1], [x + 1, y + d - 1]]) pole(px, py, 1, 9.6, '#f4f2ea', 0.5);
      abox(x + 0.4, y + 0.4, w - 0.8, d - 0.8, 9.6, 10.4, '#d8a820', '#f2c230');
      // the yellow STD ISD PCO light box standing on the roof
      const bw = 13, bd = 19;
      abox(lm.x - bw / 2, lm.y - bd / 2, bw, bd, 10.4, 12.6, '#d8a820', '#f2c230');
      const k = kh(12.6);
      ctx.strokeStyle = '#c8202a'; ctx.lineWidth = Math.max(1, 0.8 * k); ctx.strokeRect(sx(lm.x - bw / 2 + 0.8, k), sy(lm.y - bd / 2 + 0.8, k), (bw - 1.6) * k, (bd - 1.6) * k);
      ptext(lm.x, lm.y, 12.6, ['STD', 'ISD', 'PCO'], '#1a1416', null, 0);
    },
    shadow(lm) { N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, 11); },
    lights(lm) { light(lm, 0, 1, lm.x, lm.y, 9, 26, '#fff4c0', 0.8); },
    night(lm, A, a) {
      const bw = 13, bd = 19, k = kh(12.6);
      ctx.globalAlpha = a * 0.85; ctx.fillStyle = '#ffe050'; ctx.fillRect(sx(lm.x - bw / 2 + 1, k), sy(lm.y - bd / 2 + 1, k), (bw - 2) * k, (bd - 2) * k); ctx.globalAlpha = 1;
      ptext(lm.x, lm.y, 12.6, ['STD', 'ISD', 'PCO'], '#c8102a', null, 0);
      // the red pulse-meter display at the window
      const F = A.F;
      glow(fxp(F, 0, 0.5), fyp(F, 0, 0.5), 6, 3, '#ff3020', a * (0.6 + 0.4 * Math.sin(TIME * 2)));
    },
  });

  /* ================================================================ IRANI CAFES */
  reg('irani_cafe', {
    init(lm) {
      const rng = rngOf(lm, 'ic');
      const teal = rng.next() < 0.55;
      const spec = {
        wall: teal ? pickR(rng, ['#2a8c82', '#2f7f8a', '#3a8a7a']) : pickR(rng, ['#efe2c4', '#e8dcc0', '#f0e6d0']),
        trim: '#f4ecd8', acc: teal ? '#7a1a2a' : '#2a8c82', acc3: teal ? '#1f6a62' : '#2a8c82', win: '#6a4a2a', litCol: '#ffd890',
        front: FAC.cafe, side: FAC.plain,
      };
      const A = baseState(lm, spec);
      A.kind = 'irani_cafe';
      const tiled = rng.next() < 0.4 && A.h <= 24;
      if (tiled) { A.tiled = true; A.st.roof = false; }
      planSign(A, lm.sign || 'IRANI CAFE', pickR(rng, ['#7a1a2a', '#1f5a52', '#2a2a5a']), '#f8e8b0', 'cup', { lift: 3 });
      A.people = [];
      const F = A.F, L = F.L;
      const add = (k, i, u, v, a, o) => A.people.push(person(k, i, fxp(F, u, v), fyp(F, u, v), a, o));
      // the Irani uncle at the counter, customers at the two street tables, a waiter
      add('uncle', 3, L / 2 - 4, 0.4, F.ang, { sway: 0.2, look: { cap: 'topi', shirt: '#f4f4f0' } });
      A.tables = [];
      for (const tu of [-L / 2 + 5, -L / 2 + 13]) {
        if (tu > L / 2 - 9) break;
        A.tables.push(tu);
        add(pickR(rng, ['man', 'uncle', 'student', 'man']), (rng.next() * 30) | 0, tu - 2.6, 3.6, F.ang + Math.PI / 2 + Math.PI, { sway: 0.25, turn: 0.2 });
        add(pickR(rng, ['man', 'man', 'uncle']), (rng.next() * 30) | 0, tu + 2.6, 3.6, F.ang - Math.PI / 2 + Math.PI, { sway: 0.25, turn: 0.2 });
      }
      add('man', 77, 0, 5.8, F.ang - 0.6, { sway: 0.7, look: { shirt: '#f4f4f0' } });
      A.count = () => (S.min < 330 ? 1 : S.min > 1380 ? 2 : A.people.length);
      return A;
    },
    draw(lm, A) {
      const F = A.F, L = F.L, front = camFront(F);
      const goods = () => {
        // glass biscuit jars on the counter by the door (Osmania biscuits, khara, rusk)
        fbox(F, L / 2 - 8.6, L / 2 - 1.4, -0.2, 1.8, 0, 3.6, '#5a3a22', '#7a5030');
        for (let i = 0; i < 3; i++) {
          const u = L / 2 - 7.3 + i * 2.3, x = fxp(F, u, 0.8), y = fyp(F, u, 0.8);
          cyl(x, y, 0.95, 3.6, 6.2, '#d8eef2', null);
          disc(x, y, 0.75, 6.25, ['#e8c070', '#d89a4a', '#f0d8a0'][i]); disc(x, y, 0.45, 6.3, '#c8302a');
        }
        // marble-top tables with bentwood chairs + chai glasses
        for (const tu of A.tables) {
          const x = fxp(F, tu, 3.6), y = fyp(F, tu, 3.6);
          for (const s of [-1, 1]) { const cxp = fxp(F, tu + s * 2.6, 3.6), cyp = fyp(F, tu + s * 2.6, 3.6); ring(cxp, cyp, 1, 3.2, '#3a2416', 0.5); }
          pole(x, y, 0, 4, '#2a2a2a', 0.5);
          disc(x, y, 1.7, 4.1, '#f2f0ea');
          disc(fxp(F, tu - 0.6, 3.4), fyp(F, tu - 0.6, 3.4), 0.42, 4.3, '#c8925a');
          disc(fxp(F, tu + 0.6, 3.9), fyp(F, tu + 0.6, 3.9), 0.42, 4.3, '#c8925a');
          disc(fxp(F, tu, 3), fyp(F, tu, 3), 0.55, 4.25, '#e8c070'); // a plate of Osmania biscuits
        }
        steam(fxp(F, L / 2 - 4, 0.2), fyp(F, L / 2 - 4, 0.2), 6, 2, A.rr.x, '#f6f4ee', 0.8);
      };
      if (!front) goods();
      if (A.tiled) {
        if (K.box) K.box(A.rr.x, A.rr.y, A.rr.w, A.rr.d, 0, A.h - 4, A.st, null, true);
        if (K.hip) K.hip(A.rr.x - 0.8, A.rr.y - 0.8, A.rr.w + 1.6, A.rr.d + 1.6, A.h - 4, A.h + 2, '#b0583a');
        else if (K.pyramid) K.pyramid(A.rr.x - 0.8, A.rr.y - 0.8, A.rr.w + 1.6, A.rr.d + 1.6, A.h - 4, A.h + 2, '#b0583a');
        drawSign(A, A.h - 4.5, 0);
      } else {
        building(A);
        drawSign(A, A.h, 0);
      }
      awning(F, -L / 2 + 0.6, L / 2 - 0.6, 2.4, 9.8, 8.4, '#2a8c82', '#f4ecd8', 1.3);
      if (front) goods();
    },
    shadow(lm, A) { castMain(A); },
    lights(lm, A) { const F = A.F; light(lm, 0, 2, fxp(F, 0, 3), fyp(F, 0, 3), 4, 30, '#ffd890', 0.9); },
    night(lm, A, a) {
      nightSign(A, A.tiled ? A.h - 4.5 : A.h, a);
      glow(fxp(A.F, 0, 2), fyp(A.F, 0, 2), 3, Math.min(20, A.F.L * 0.5), '#ffcf80', a * 0.45);
    },
  });

  /* ================================================================ GOKUL CHAT */
  reg('gokul_chat', {
    init(lm) {
      const A = baseState(lm, { walls: ['#efe4c8'], roof: '#d0c4ac', win: '#6a4a30', litCol: '#fff2cc' });
      A.kind = 'gokul_chat';
      planSign(A, lm.sign || 'GOKUL CHAT', '#c8202a', '#ffe23a', null, { over: 3, lift: 4.2 });
      const F = A.F, L = F.L, rng = A.rng;
      A.people = [];
      const add = (k, i, u, v, a, o) => A.people.push(person(k, i, fxp(F, u, v), fyp(F, u, v), a, o));
      add('man', 5, -4, 0.6, F.ang, { sway: 0.8, sp: 2.4, look: { shirt: '#f4f4f0' } });  // pani-puri master
      add('man', 6, 4, 0.6, F.ang, { sway: 0.5, look: { shirt: '#f4f4f0' } });
      // the crowd: a half ring of hungry people with leaf plates
      for (let i = 0; i < 12; i++) {
        const t = i / 11, u = -L / 2 + 2 + t * (L - 4), v = 4.6 + (i % 3) * 2.2 + rng.next() * 0.8;
        add(pickR(rng, ['any', 'woman', 'student', 'man', 'kid', 'aunty', 'burqa', 'saree']), (i * 3 + 1) % 29, u, v, F.ang + Math.PI + (rng.next() - 0.5) * 0.8, { sway: 0.7, turn: 0.35, sp: 1.6 });
      }
      // kulfi matka man at the corner
      add('uncle', 9, L / 2 + 3.5, 3.4, F.ang + Math.PI / 2, { sway: 0.3 });
      A.count = () => (S.min < 510 || S.min > 1380 ? 0 : S.min > 1020 && S.min < 1320 ? A.people.length : 8);
      return A;
    },
    draw(lm, A) {
      const F = A.F, L = F.L, front = camFront(F);
      const counter = () => {
        // steel counter across the front: glass box of golden puris, ragda pot, pani cans
        fbox(F, -L / 2 + 1.2, L / 2 - 1.2, 0.2, 2.6, 0, 3.8, '#b8bcc4', '#d8dce2');
        fbox(F, -L / 2 + 2, -L / 2 + 8.5, 0.6, 2.4, 3.8, 6.6, '#cfe6ee', 'rgba(232,248,252,0.6)');
        for (let i = 0; i < 9; i++) fdisc(F, -L / 2 + 2.8 + (i % 5) * 1.3, 1.1 + Math.floor(i / 5) * 0.9, 0.5, 6.7, '#e8b440');
        const rx = fxp(F, 0.5, 1.4), ry = fyp(F, 0.5, 1.4);
        cyl(rx, ry, 1.9, 3.8, 6.4, '#c8ccd2', '#dfe2e6'); disc(rx, ry, 1.5, 6.45, '#d8c890');
        steam(rx, ry, 6.8, 3, 1, '#f6f4ee', 1);
        for (let i = 0; i < 3; i++) { const x = fxp(F, 4 + i * 2, 1.4), y = fyp(F, 4 + i * 2, 1.4); cyl(x, y, 0.9, 3.8, 6, '#b8bcc4', '#e4e8ec'); disc(x, y, 0.6, 6.05, ['#7aa04a', '#8a5a2a', '#c8a050'][i]); }
        // kulfi matka stall
        const kx = fxp(F, L / 2 + 3.5, 1.2), ky = fyp(F, L / 2 + 3.5, 1.2);
        cyl(kx, ky, 1.8, 0, 3, '#7a5030', '#8a6040');
        cyl(kx, ky, 1.5, 3, 5.4, '#b0583a', '#c8202a');
        // parked scooters in a row along the kerb
        const cols = ['#86b9c9', '#e8e0d0', '#c8302a', '#2a5cb8'];
        for (let i = 0; i < 4; i++) {
          const u = -L / 2 - 4 - i * 3.4;
          const x = fxp(F, u, 5), y = fyp(F, u, 5);
          obox(x, y, F.ox, F.oy, 3.6, 1.2, 1.2, 3.8, cols[i], sh(cols[i], 1.15));
          disc(x + F.ox * 2.2, y + F.oy * 2.2, 0.6, 4.6, '#2a2a2a');
        }
      };
      if (!front) counter();
      building(A);
      awning(F, -L / 2 + 0.4, L / 2 - 0.4, 3.4, 9.6, 8, '#b8bcc0', null, 1.4);
      drawSign(A, A.h, 0);
      if (front) counter();
    },
    shadow(lm, A) { castMain(A); },
    lights(lm, A) { const F = A.F; light(lm, 0, 2, fxp(F, 0, 4), fyp(F, 0, 4), 5, 40, '#f0f8ff', 0.95); light(lm, 1, 2, fxp(F, F.L / 2 + 3, 2), fyp(F, F.L / 2 + 3, 2), 5, 18, '#ffd890', 0.7); },
    night(lm, A, a) {
      nightSign(A, A.h, a);
      const F = A.F;
      glow(fxp(F, 0, 2), fyp(F, 0, 2), 6, 16, '#e8f8ff', a * 0.5);
      if (K.bulbs) K.bulbs(fxp(F, -F.L / 2, 3.3), fyp(F, -F.L / 2, 3.3), 8, fxp(F, F.L / 2, 3.3), fyp(F, F.L / 2, 3.3), 8, 10, '#ffe070', '#ff8040', 0.8);
    },
  });

  /* ================================================================ RESTAURANTS */
  const REST = {
    paradise: { wall: '#f2efe6', acc: '#2f7a4a', sign: ['#2f7a4a', '#ffffff'], crowd: 12 },
    bawarchi: { wall: '#efe0b8', acc: '#c8202a', sign: ['#f2c230', '#b01a1a'], crowd: 10 },
    shadab_hotel: { wall: '#e8e4d8', acc: '#1f6a3a', sign: ['#1f6a3a', '#ffffff'], crowd: 6, haleem: true },
    pista_house: { wall: '#e8f0e0', acc: '#3a8a3a', sign: ['#3a8a3a', '#fff8d0'], crowd: 6, haleem: true },
    shah_ghouse: { wall: '#efe6d8', acc: '#7a1a2a', sign: ['#7a1a2a', '#ffe8a0'], crowd: 6, haleem: true },
    hotel_nayaab: { wall: '#e0e8e8', acc: '#2a5a8a', sign: ['#2a5a8a', '#ffffff'], crowd: 4, haleem: true },
    hotel_niagara: { wall: '#e8e0f0', acc: '#2a4a8a', sign: ['#1f3a7a', '#f2e8c0'], crowd: 4 },
    taj_mahal_hotel_abids: { wall: '#f0e8d8', acc: '#8a6a2a', sign: ['#6a1a2a', '#f8e8b0'], crowd: 4 },
  };
  reg('restaurant', {
    init(lm) {
      const R0 = REST[lm.id] || { wall: '#efe6d2', acc: '#c03a2a', sign: ['#c03a2a', '#fff4d8'], crowd: 4 };
      const A = baseState(lm, { wall: R0.wall, acc: R0.acc, win: '#7a5a3a', litCol: '#ffe0a0', roofPlan: { cot: false } });
      A.kind = 'restaurant'; A.R0 = R0;
      planSign(A, lm.sign || lm.name, R0.sign[0], R0.sign[1], null, { over: 4, lift: 4.4 });
      const F = A.F, L = F.L, rng = A.rng;
      A.people = [];
      const add = (k, i, u, v, a, o) => A.people.push(person(k, i, fxp(F, u, v), fyp(F, u, v), a, o));
      add('man', 41, L / 2 - 5, 0.8, F.ang, { sway: 0.3, look: { shirt: '#f4f4f0' } });
      for (let i = 0; i < R0.crowd; i++) {
        const u = -L / 2 + 3 + (i % 6) * ((L - 6) / 5), v = 4 + Math.floor(i / 6) * 2.6 + rng.next();
        add(pickR(rng, ['man', 'any', 'uncle', 'student', 'woman', 'burqa']), (i * 5 + 2) % 31, u, v, F.ang + Math.PI + (rng.next() - 0.5) * 0.9, { sway: 0.6, turn: 0.3 });
      }
      if (R0.haleem) A.haleemPeople = [person('man', 51, fxp(F, -L / 2 + 5, 6.5), fyp(F, -L / 2 + 5, 6.5), F.ang + Math.PI, { sway: 1.2, sp: 2.2, look: { shirt: '#f4f4f0', cap: 'topi' } })];
      A.count = () => {
        const lunch = S.min > 720 && S.min < 900, dinner = S.min > 1170 && S.min < 1380;
        return S.min < 600 || S.min > 1420 ? 0 : lunch || dinner ? A.people.length : Math.min(A.people.length, 3);
      };
      return A;
    },
    draw(lm, A) {
      const F = A.F, L = F.L, front = camFront(F);
      const goods = () => {
        // the biryani degs at the parcel counter, lids sealed with dough
        for (let i = 0; i < 2; i++) {
          const x = fxp(F, L / 2 - 4 - i * 4.4, 2.2), y = fyp(F, L / 2 - 4 - i * 4.4, 2.2);
          cyl(x, y, 1.9, 0, 3.4, '#9a6a3a', '#b8803a'); disc(x, y, 1.5, 3.45, '#e8d8b0');
        }
        steam(fxp(F, L / 2 - 4, 2.2), fyp(F, L / 2 - 4, 2.2), 3.8, 2, A.rr.x, '#f6f4ee', 1);
        if (A.R0.haleem && S.ramzan) haleemBhatti(fxp(F, -L / 2 + 5, 4), fyp(F, -L / 2 + 5, 4), A.rr.x);
      };
      if (!front) goods();
      building(A);
      awning(F, -L / 2 + 0.6, L / 2 - 0.6, 2.8, 9.8, 8.2, A.R0.acc, '#f4ecd8', 1.6);
      drawSign(A, A.h, 0);
      if (front) goods();
    },
    shadow(lm, A) { castMain(A); },
    lights(lm, A) { const F = A.F; light(lm, 0, 2, fxp(F, 0, 4), fyp(F, 0, 4), 5, 40, '#ffe0a0', 0.95); if (A.R0.haleem && S.ramzan) light(lm, 1, 2, fxp(F, -F.L / 2 + 5, 4), fyp(F, -F.L / 2 + 5, 4), 3, 22, '#ff9040', 0.9); },
    night(lm, A, a) {
      nightSign(A, A.h, a);
      const F = A.F;
      if (K.bulbs) K.bulbs(fxp(F, -F.L / 2, 2.8), fyp(F, -F.L / 2, 2.8), 9.2, fxp(F, F.L / 2, 2.8), fyp(F, F.L / 2, 2.8), 9.2, Math.round(F.L / 2.4), '#ffe070', S.ramzan ? '#60ff90' : '#ff9a40', 0.6);
      if (A.R0.haleem && S.ramzan) glow(fxp(F, -F.L / 2 + 5, 4), fyp(F, -F.L / 2 + 5, 4), 2, 8, '#ff7020', a * 0.8);
    },
  });
  // haleem bhatti: brick oven, a huge copper deg, a man pounding with a long wooden paddle
  function haleemBhatti(x, y, seed) {
    abox(x - 3.4, y - 3.4, 6.8, 6.8, 0, 3.4, '#a8502a', '#8a3a1a');
    cyl(x, y, 2.6, 3.4, 5.6, '#b8783a', '#c88a40');
    disc(x, y, 2.1, 5.65, '#8a5a2a');
    const a = Math.sin(TIME * 4 + seed) * 0.6;
    seg3(x + Math.cos(a) * 0.5, y + Math.sin(a) * 0.5, 5.4, x + Math.cos(a) * 4.5, y + 3.5 + Math.sin(a) * 2, 9.5, '#8a6a3a', 0.7);
    steam(x, y, 6, 3, seed, '#f2efe8', 1.2);
  }

  /* ================================================================ PAINTED FILM BOARDS */
  // Hand-painted cinema hoardings: a stylised hero (and heroine) on a hot background, cached
  // per (title, size). Titles are always fictional (lm.films); the English title is drawn on
  // top as crisp pixel text in the dark band at the bottom.
  const BRES = 4;
  const boardCache = new Map();
  const SKINS = ['#c8885a', '#b8784a', '#d89a6a', '#a86a40'];
  function paintFace(g, cx, cy, r, o) {
    const skin = o.skin;
    // shoulders / collar
    g.fillStyle = o.shirt; g.beginPath(); g.ellipse(cx, cy + r * 1.55, r * 1.35, r * 0.75, 0, Math.PI, 0); g.fill();
    if (!o.female) { g.fillStyle = sh(o.shirt, 0.7); g.beginPath(); g.moveTo(cx - r * 0.35, cy + r * 0.85); g.lineTo(cx, cy + r * 1.3); g.lineTo(cx + r * 0.35, cy + r * 0.85); g.fill(); }
    if (o.female) { // long hair behind
      g.fillStyle = '#141014'; g.beginPath(); g.ellipse(cx, cy + r * 0.3, r * 1.02, r * 1.35, 0, 0, TAU); g.fill();
    }
    g.fillStyle = skin; g.beginPath(); g.ellipse(cx, cy + r * 0.92, r * 0.32, r * 0.3, 0, 0, TAU); g.fill(); // neck
    const gr = g.createRadialGradient(cx - r * 0.3, cy - r * 0.2, r * 0.1, cx, cy, r * 1.05);
    gr.addColorStop(0, sh(skin, 1.18)); gr.addColorStop(0.7, skin); gr.addColorStop(1, sh(skin, 0.72));
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, r * 0.76, r * 0.95, 0, 0, TAU); g.fill();
    // hair
    g.fillStyle = '#141014';
    if (o.female) { g.beginPath(); g.ellipse(cx, cy - r * 0.62, r * 0.8, r * 0.45, 0, Math.PI, 0); g.fill(); g.strokeStyle = sh(skin, 0.8); g.lineWidth = r * 0.04; g.beginPath(); g.moveTo(cx, cy - r * 0.98); g.lineTo(cx, cy - r * 0.62); g.stroke(); }
    else {
      g.beginPath(); g.ellipse(cx + r * 0.05, cy - r * 0.7, r * 0.85, r * 0.48, -0.08, Math.PI * 0.95, Math.PI * 2.08); g.fill(); // puff
      g.fillRect(cx - r * 0.78, cy - r * 0.62, r * 0.16, r * 0.62); g.fillRect(cx + r * 0.62, cy - r * 0.62, r * 0.16, r * 0.62); // sideburns
      g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.ellipse(cx - r * 0.2, cy - r * 0.92, r * 0.36, r * 0.1, -0.2, 0, TAU); g.fill();
    }
    // brows + eyes
    g.strokeStyle = '#141014'; g.lineWidth = r * (o.female ? 0.06 : 0.11); g.lineCap = 'round';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * r * 0.12, cy - r * 0.3); g.quadraticCurveTo(cx + s * r * 0.34, cy - r * (o.angry ? 0.3 : 0.42), cx + s * r * 0.56, cy - r * 0.32); g.stroke(); }
    if (o.glasses) {
      g.fillStyle = '#121216';
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * r * 0.33, cy - r * 0.1, r * 0.25, r * 0.17, 0, 0, TAU); g.fill(); }
      g.fillRect(cx - r * 0.1, cy - r * 0.14, r * 0.2, r * 0.05);
      g.fillStyle = 'rgba(160,220,255,0.55)'; for (const s of [-1, 1]) g.fillRect(cx + s * r * 0.33 - r * 0.12, cy - r * 0.18, r * 0.08, r * 0.04);
    } else {
      for (const s of [-1, 1]) {
        g.fillStyle = '#f8f4ea'; g.beginPath(); g.ellipse(cx + s * r * 0.33, cy - r * 0.1, r * 0.17, r * 0.09, 0, 0, TAU); g.fill();
        g.fillStyle = '#2a1a12'; g.beginPath(); g.arc(cx + s * r * 0.31, cy - r * 0.1, r * 0.07, 0, TAU); g.fill();
        if (o.female) { g.strokeStyle = '#141014'; g.lineWidth = r * 0.04; g.beginPath(); g.ellipse(cx + s * r * 0.33, cy - r * 0.1, r * 0.19, r * 0.11, 0, Math.PI, 0); g.stroke(); }
      }
    }
    // nose, mouth, moustache
    g.strokeStyle = sh(skin, 0.7); g.lineWidth = r * 0.05; g.beginPath(); g.moveTo(cx + r * 0.04, cy - r * 0.05); g.lineTo(cx + r * 0.08, cy + r * 0.2); g.lineTo(cx - r * 0.06, cy + r * 0.24); g.stroke();
    g.fillStyle = o.female ? '#c8243a' : '#7a3a2a';
    g.beginPath(); g.ellipse(cx, cy + r * 0.48, r * (o.smile ? 0.26 : 0.2), r * 0.07, 0, 0, TAU); g.fill();
    if (o.smile) { g.fillStyle = '#f8f4ea'; g.fillRect(cx - r * 0.16, cy + r * 0.44, r * 0.32, r * 0.05); }
    if (o.moustache) { g.fillStyle = '#141014'; g.beginPath(); g.ellipse(cx, cy + r * 0.34, r * 0.3, r * 0.08, 0, 0, TAU); g.fill(); }
    if (o.female) {
      g.fillStyle = '#d8102a'; g.beginPath(); g.arc(cx, cy - r * 0.42, r * 0.06, 0, TAU); g.fill(); // bindi
      g.fillStyle = '#f2c230'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * r * 0.78, cy + r * 0.2, r * 0.08, 0, TAU); g.fill(); }
      g.fillStyle = '#f8f6ee'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(cx + r * 0.75 + Math.cos(i) * r * 0.1, cy - r * 0.55 + i * r * 0.12, r * 0.06, 0, TAU); g.fill(); } // jasmine
    }
    // painted rim light
    g.strokeStyle = 'rgba(255,240,200,0.45)'; g.lineWidth = r * 0.05; g.beginPath(); g.ellipse(cx, cy, r * 0.76, r * 0.95, 0, -2.6, -1.2); g.stroke();
  }
  const BG_PAL = [['#f08a24', '#c8202a'], ['#2a5cd8', '#7a2ac8'], ['#e8c020', '#e84a20'], ['#1ab0a0', '#2a4ab8'], ['#e84a8a', '#7a1a5a'], ['#40c050', '#1a6a8a']];
  function filmBoard(title, w, d) {
    const key = title + '|' + Math.round(w) + 'x' + Math.round(d);
    let c = boardCache.get(key);
    if (c) return c;
    const W = Math.max(8, Math.round(w * BRES)), H = Math.max(8, Math.round(d * BRES));
    c = N.render.makeCanvas(W, H);
    const g = c.getContext('2d');
    const rng = U.rng('film:' + title);
    const pal = BG_PAL[(rng.next() * BG_PAL.length) | 0];
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, pal[0]); bg.addColorStop(1, pal[1]);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // sunburst rays
    g.save(); g.globalAlpha = 0.18; g.fillStyle = '#fff8d0';
    const ox = W * 0.3, oy = H * 0.45;
    for (let i = 0; i < 16; i += 2) { const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(a0) * W * 2, oy + Math.sin(a0) * W * 2); g.lineTo(ox + Math.cos(a1) * W * 2, oy + Math.sin(a1) * W * 2); g.fill(); }
    g.restore();
    const band = H * 0.24;
    const landscape = W >= H * 1.2;
    const hero = { skin: SKINS[(rng.next() * 4) | 0], shirt: pickR(rng, ['#d8202a', '#1a1a2a', '#f8f4ea', '#2a5cd8', '#f2c230']), moustache: rng.next() < 0.75, glasses: rng.next() < 0.35, angry: rng.next() < 0.4, smile: rng.next() < 0.4 };
    const her = { skin: SKINS[(rng.next() * 4) | 0], shirt: pickR(rng, ['#e84a8a', '#f2c230', '#2ac0a0', '#c8202a']), female: true, smile: true };
    if (landscape) {
      const r = (H - band) * 0.42;
      paintFace(g, W * 0.27, (H - band) * 0.48, r, hero);
      paintFace(g, W * 0.68, (H - band) * 0.55, r * 0.72, her);
      // a little action figure: hero leaping (silhouette)
      g.fillStyle = 'rgba(20,10,20,0.75)'; g.beginPath(); g.ellipse(W * 0.88, (H - band) * 0.32, W * 0.03, H * 0.08, 0.6, 0, TAU); g.fill();
    } else {
      const r = Math.min(W * 0.36, (H - band) * 0.3);
      paintFace(g, W * 0.5, (H - band) * 0.36, r, hero);
      paintFace(g, W * 0.3, (H - band) * 0.78, r * 0.55, her);
    }
    // painted lettering swash above the band + the band itself
    g.fillStyle = 'rgba(255,240,120,0.85)';
    g.beginPath(); g.moveTo(0, H - band - H * 0.04); g.quadraticCurveTo(W * 0.5, H - band - H * 0.12, W, H - band - H * 0.03); g.lineTo(W, H - band); g.lineTo(0, H - band); g.fill();
    g.fillStyle = '#1a1018'; g.fillRect(0, H - band, W, band);
    g.strokeStyle = '#f2c230'; g.lineWidth = Math.max(1, BRES * 0.35); g.strokeRect(1, 1, W - 2, H - 2);
    boardCache.set(key, c);
    return c;
  }
  /** Draw a flat painted board at height h over world rect (x, y, w, d), with title lines. */
  function drawFilmBoard(title, x, y, w, d, h, frameCol) {
    abox(x - 0.4, y - 0.4, w + 0.8, d + 0.8, h - 1.2, h, frameCol || '#3a3a40', frameCol || '#4a4a52');
    const img = filmBoard(title, w, d);
    plane(h + 0.05);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, x, y, w, d);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const k = kh(h), band = d * 0.24;
    const lines = fitLines(title, w * k - 2, 2, true) || fitLines(title, w * k - 2, 2);
    if (lines) ptext(x + w / 2, y + d - band / 2 - (lines.length > 1 ? 0 : 0), h, lines.length > 1 && band * k < 12 ? [lines.join(' ').slice(0, 14)] : lines, '#ffe23a', '#7a1a1a', 0);
  }

  /* ================================================================ CINEMAS */
  const CINE = {
    sandhya: { name: 'SANDHYA 70MM 35MM', wall: '#e4e6ea', acc: '#2a5cb8', twin: true },
    sudarshan: { name: 'SUDARSHAN 35MM', wall: '#efe2c8', acc: '#8a1a2a' },
    odeon: { name: 'ODEON', wall: '#f0e6d0', acc: '#1f6a4a' },
    devi: { name: 'DEVI 70MM', wall: '#f2dcd0', acc: '#b22b2b' },
  };
  const FILMS = ['TOOFAN TAMMUDU', 'MASS MAHARAJU', 'GULLY SIMHAM', 'PREMA PANDAGA', 'RANGULA PATANG', 'JAI HYDERABAD', 'CHARMINAR CHINNODU', 'MEGHA GARJANA'];
  const SHOWS = [660, 870, 1080, 1290];
  function showRush(min) { // 0..1: how close to a show (queue builds in the hour before)
    let q = 0;
    for (const s of SHOWS) { const dt = s - min; if (dt > -15 && dt < 75) q = Math.max(q, dt < 0 ? 0.6 : 1 - dt / 90); }
    return q;
  }
  reg('cinema', {
    init(lm) {
      const V = CINE[lm.variant] || {};
      const rng = rngOf(lm, 'cin');
      const F0 = frontOf(lm);
      const pd = clamp(F0.D * 0.28, 12, 20);
      // hall = footprint minus the porch strip at the front
      const r = frect(F0, -F0.L / 2, F0.L / 2, -F0.D, -pd);
      const hallLm = { id: lm.id, x: r[0] + r[2] / 2, y: r[1] + r[3] / 2, w: r[2], d: r[3], h: lm.h, face: lm.face };
      const A = baseState(hallLm, { wall: V.wall || pickR(rng, ['#efe6d4', '#e8e0d8', '#f0dcc8', '#e0e4e8']), acc: V.acc || '#b22b2b', front: FAC.blank, side: FAC.hall, win: '#3a3040', roofPlan: { line: false, cot: false, mumty: false } });
      A.F0 = F0; A.pd = pd; A.V = V;
      A.r3.mumty = null;
      const FH = A.F;
      // projection room on the hall roof (at the entrance end) + exhaust fans
      A.proj = frect(FH, -6, 6, -9, -1).slice();
      planSign(A, lm.sign || V.name || (lm.name || '').toUpperCase(), V.acc || '#b22b2b', '#fff4d8', 'film', { over: 2, lift: 4.6 });
      A.films = (lm.films && lm.films.length ? lm.films : [pickR(rng, FILMS)]).slice(0, 2);
      const sideW = clamp(F0.L * 0.2, 12, 20);
      A.sideW = sideW;
      A.canopy = [-F0.L / 2 + sideW, F0.L / 2 - sideW]; // u range of the entrance block
      const qLeft = rng.next() < 0.5;
      A.qu = qLeft ? [-F0.L / 2 + 1, -F0.L / 2 + sideW - 1] : [F0.L / 2 - sideW + 1, F0.L / 2 - 1];
      A.cu = qLeft ? [F0.L / 2 - sideW + 1, F0.L / 2 - 1] : [-F0.L / 2 + 1, -F0.L / 2 + sideW - 1];
      // people: queue in the cage lanes + crowd in front of the entrance
      A.people = [];
      const lanes = 3, laneW = (pd - 2) / lanes;
      for (let i = 0; i < 18; i++) {
        const lane = i % lanes, along = Math.floor(i / lanes);
        const u = A.qu[0] + 1.6 + along * 2.6, v = -pd + 1 + laneW * (lane + 0.5);
        if (u > A.qu[1] - 1) continue;
        A.people.push(person(pickR(rng, ['man', 'student', 'man', 'any', 'kid']), (i * 3 + 7) % 31, fxp(F0, u, v), fyp(F0, u, v), F0.ang + Math.PI / 2 * (lane % 2 ? 1 : -1), { sway: 0.5, turn: 0.4 }));
      }
      for (let i = 0; i < 10; i++) {
        const u = A.canopy[0] + rng.next() * (A.canopy[1] - A.canopy[0]), v = 1.5 + rng.next() * 6;
        A.people.push(person(pickR(rng, ['any', 'woman', 'man', 'student', 'aunty', 'burqa']), (i * 5 + 3) % 29, fxp(F0, u, v), fyp(F0, u, v), F0.ang + Math.PI + (rng.next() - 0.5) * 2, { sway: 0.6, turn: 0.5 }));
      }
      A.count = () => {
        if (S.min < 540 || S.min > 1395) return 0;
        const q = showRush(S.min);
        return Math.round(3 + q * (A.people.length - 3));
      };
      return A;
    },
    draw(lm, A) {
      const F0 = A.F0, L = F0.L, pd = A.pd, front = camFront(F0);
      const forecourt = () => {
        // queue cage (steel railings) with lanes
        const q = A.qu, lanes = 3, laneW = (pd - 2) / lanes;
        const k = kh(3.2);
        ctx.beginPath();
        for (let i = 0; i <= lanes; i++) {
          const v = -pd + 1 + laneW * i;
          mv(fxp(F0, q[0], v), fyp(F0, q[0], v), 3.2); ln(fxp(F0, q[1], v), fyp(F0, q[1], v), 3.2);
        }
        ctx.strokeStyle = '#8a9098'; ctx.lineWidth = Math.max(0.6, 0.5 * k); ctx.stroke();
        // ticket window booth
        fbox(F0, q[0], q[0] + 3, -pd, -pd + 2.6, 0, 8, '#5a5048', sh(A.wall, 1));
        // cycle / scooter stand: tin shed + rows of cycles
        const c = A.cu;
        const cols = ['#1a1a1e', '#2a5cb8', '#8a2a2a', '#3a7a3a', '#86b9c9', '#e8e0d0'];
        let i = 0;
        for (let u = c[0] + 1.5; u < c[1] - 1; u += 2.4, i++) cycleProp(fxp(F0, u, -pd / 2), fyp(F0, u, -pd / 2), F0.ang + 0.15, cols[i % cols.length], 2.2);
        const r = frect(F0, c[0], c[1], -pd + 0.5, -pd + 0.5 + Math.min(7, pd * 0.45));
        abox(r[0], r[1], r[2], r[3], 7.6, 8.2, '#9aa0a6', '#b4b8bc');
        for (const uu of [c[0] + 0.5, c[1] - 0.5]) pole(fxp(F0, uu, -pd + 4), fyp(F0, uu, -pd + 4), 0, 7.6, '#6a6a6a', 0.4);
      };
      if (!front) forecourt();
      // entrance block (porch) under the hoardings
      const cr = frect(F0, A.canopy[0], A.canopy[1], -pd, -0.5);
      abox(cr[0], cr[1], cr[2], cr[3], 0, 12, A.wall, sh(A.wall, 1.06));
      // cantilever canopy over the doors
      const cc = frect(F0, A.canopy[0] + 1, A.canopy[1] - 1, -0.5, 3.5);
      abox(cc[0], cc[1], cc[2], cc[3], 8.6, 9.6, A.st.acc, sh(A.st.acc, 1.1));
      // the hall (twin halls for Sandhya)
      if (A.V.twin) {
        const F = A.F;
        const half = frect(F, -F.L / 2, -1.5, -F.D, 0).slice(), half2 = frect(F, 1.5, F.L / 2, -F.D, 0).slice();
        if (K.box) { K.box(half[0], half[1], half[2], half[3], 0, A.h, A.st); K.box(half2[0], half2[1], half2[2], half2[3], 0, A.h - 6, A.st); }
      } else building(A);
      // projection room + exhaust fans on the roof
      const p = A.proj;
      abox(p[0], p[1], p[2], p[3], A.h, A.h + 5, A.wall, sh(A.roof, 0.95));
      for (let i = 0; i < 2; i++) {
        const u = -A.F.L / 4 + i * A.F.L / 2, x = fxp(A.F, u, -A.F.D * 0.55), y = fyp(A.F, u, -A.F.D * 0.55);
        cyl(x, y, 2, A.h, A.h + 2.2, '#8a8e94', '#6a6e74');
        const a = TIME * 6 + i, k2 = kh(A.h + 2.3);
        ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = Math.max(0.6, 0.5 * k2); ctx.beginPath();
        ctx.moveTo(sx(x + Math.cos(a) * 1.6, k2), sy(y + Math.sin(a) * 1.6, k2)); ctx.lineTo(sx(x - Math.cos(a) * 1.6, k2), sy(y - Math.sin(a) * 1.6, k2));
        ctx.moveTo(sx(x + Math.cos(a + 1.57) * 1.6, k2), sy(y + Math.sin(a + 1.57) * 1.6, k2)); ctx.lineTo(sx(x - Math.cos(a + 1.57) * 1.6, k2), sy(y - Math.sin(a + 1.57) * 1.6, k2)); ctx.stroke();
      }
      roofFurniture(A, A.h);
      // the hand-painted hoardings on the porch, leaning on the hall facade
      const n = A.films.length, u0 = A.canopy[0] + 0.5, u1 = A.canopy[1] - 0.5, bw = (u1 - u0 - (n - 1) * 1.5) / n;
      for (let i = 0; i < n; i++) {
        const ua = u0 + i * (bw + 1.5);
        const r = frect(F0, ua, ua + bw, -pd + 0.6, -1.2);
        // supports
        pole(r[0] + 1, r[1] + 1, 12, 20, '#4a4a50', 0.5); pole(r[0] + r[2] - 1, r[1] + r[3] - 1, 12, 20, '#4a4a50', 0.5);
        drawFilmBoard(A.films[i], r[0], r[1], r[2], r[3], 20.5);
      }
      drawSign(A, A.h, 0);
      if (front) forecourt();
    },
    shadow(lm, A) { castMain(A); const cr = frect(A.F0, A.canopy[0], A.canopy[1], -A.pd, -0.5); N.draw.castBox(cr[0], cr[1], cr[2], cr[3], 20); },
    lights(lm, A) {
      const F0 = A.F0;
      light(lm, 0, 3, fxp(F0, 0, 4), fyp(F0, 0, 4), 8, 54, '#ffe0a0', 1);
      light(lm, 1, 3, fxp(F0, (A.qu[0] + A.qu[1]) / 2, -A.pd / 2), fyp(F0, (A.qu[0] + A.qu[1]) / 2, -A.pd / 2), 9, 30, '#e8f4ff', 0.8);
      light(lm, 2, 3, fxp(F0, 0, -A.pd / 2), fyp(F0, 0, -A.pd / 2), 22, 44, '#fff0d0', 0.7, false);
    },
    night(lm, A, a) {
      nightSign(A, A.h, a);
      const F0 = A.F0, pd = A.pd;
      // marquee bulbs chasing round the porch + along the canopy edge
      if (K.bulbs) {
        const u0 = A.canopy[0], u1 = A.canopy[1];
        K.bulbs(fxp(F0, u0, 3.5), fyp(F0, u0, 3.5), 9.7, fxp(F0, u1, 3.5), fyp(F0, u1, 3.5), 9.7, Math.round((u1 - u0) / 1.6), '#ffe070', '#ff7040');
        K.bulbs(fxp(F0, u0, -pd + 0.6), fyp(F0, u0, -pd + 0.6), 20.6, fxp(F0, u1, -pd + 0.6), fyp(F0, u1, -pd + 0.6), 20.6, Math.round((u1 - u0) / 2), '#fff4b0', '#ff60a0');
        K.bulbs(fxp(F0, u0, -1.2), fyp(F0, u0, -1.2), 20.6, fxp(F0, u1, -1.2), fyp(F0, u1, -1.2), 20.6, Math.round((u1 - u0) / 2), '#fff4b0', '#60e0ff');
      }
      // floodlit hoardings
      const n = A.films.length, u0 = A.canopy[0] + 0.5, u1 = A.canopy[1] - 0.5, bw = (u1 - u0 - (n - 1) * 1.5) / n;
      for (let i = 0; i < n; i++) {
        const ua = u0 + i * (bw + 1.5), r = frect(F0, ua, ua + bw, -pd + 0.6, -1.2);
        const img = filmBoard(A.films[i], r[2], r[3]);
        plane(20.55); ctx.globalAlpha = a * 0.75; ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, r[0], r[1], r[2], r[3]);
        ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
        const k = kh(20.5), lines = fitLines(A.films[i], r[2] * k - 2, 2, true) || fitLines(A.films[i], r[2] * k - 2, 2);
        if (lines) ptext(r[0] + r[2] / 2, r[1] + r[3] - r[3] * 0.12, 20.5, r[3] * 0.24 * k < 12 ? [lines.join(' ').slice(0, 14)] : lines, '#ffe23a', null, 0);
      }
    },
  });
  reg('film_hoarding', {
    init(lm) {
      const t = lm.film || (lm.films && lm.films[0]) || pickR(rngOf(lm, 'fh'), FILMS);
      const long = lm.w >= lm.d;
      const bw = long ? Math.max(lm.w, 36) : Math.max(lm.d * 0.9, 18), bd = long ? 20 : Math.max(lm.d, 36);
      return { t, bw, bd };
    },
    draw(lm, A) {
      // two lattice legs, a catwalk, the painted board on top
      const lx = lm.w >= lm.d ? lm.w * 0.36 : 0, ly = lm.w >= lm.d ? 0 : lm.d * 0.36;
      for (const s of [-1, 1]) {
        const x = lm.x + s * lx, y = lm.y + s * ly;
        abox(x - 1.4, y - 1.4, 2.8, 2.8, 0, 2, '#8a8680', '#9a968e');
        pole(x - 0.9, y, 2, 30, '#5a5a62', 0.5); pole(x + 0.9, y, 2, 30, '#5a5a62', 0.5);
        for (let h = 5; h < 29; h += 6) seg3(x - 0.9, y, h, x + 0.9, y, h + 5, '#5a5a62', 0.35);
      }
      abox(lm.x - A.bw / 2, lm.y + A.bd / 2 - 1, A.bw, 2, 29, 29.6, '#6a6a72', '#7a7a82');
      drawFilmBoard(A.t, lm.x - A.bw / 2, lm.y - A.bd / 2, A.bw, A.bd, 31);
    },
    shadow(lm, A) { N.draw.castBox(lm.x - A.bw / 2, lm.y - A.bd / 2, A.bw, A.bd, 31); },
    lights(lm) { light(lm, 0, 1, lm.x, lm.y + 6, 28, 30, '#fff0d0', 0.7, false); },
    night(lm, A, a) {
      const img = filmBoard(A.t, A.bw, A.bd);
      plane(31.05); ctx.globalAlpha = a * 0.7; ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, lm.x - A.bw / 2, lm.y - A.bd / 2, A.bw, A.bd);
      ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (K.bulbs) K.bulbs(lm.x - A.bw / 2, lm.y + A.bd / 2, 31, lm.x + A.bw / 2, lm.y + A.bd / 2, 31, 14, '#fff4b0', '#ff60a0');
    },
  });

  /* ================================================================ ART BUSES */
  const LIVERY = {
    city: { body: '#b22b2b', roof: '#d6d0c2', end: '#b22b2b', text: 'CITY BUS', tc: '#b22b2b' },
    express: { body: '#b22b2b', roof: '#e8d070', end: '#8a1a1a', text: 'EXPRESS', tc: '#8a1a1a' },
    deluxe: { body: '#7a1a2a', roof: '#efe6cf', end: '#7a1a2a', text: 'DELUXE', tc: '#7a1a2a' },
    luxury: { body: '#e8ecf0', roof: '#d8dde4', end: '#2a5cb8', text: 'SUPER LUXURY', tc: '#2a5cb8' },
  };
  /** A parked APSRTC bus (62 x 18 x 19.5), pointing along angle a. Static art. */
  function artBus(x, y, a, livery, route, len) {
    const Lv = LIVERY[livery] || LIVERY.city, L = len || 62;
    const ca = Math.cos(a), sa = Math.sin(a);
    obox(x, y, ca, sa, L / 2, 9, 1.6, 18.8, Lv.body, false);
    spr(x, y, ca, sa, 18.8);
    ctx.fillStyle = Lv.roof; ctx.fillRect(-L / 2 + 0.6, -8.4, L - 1.2, 16.8);
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(-L / 2 + 3, -6.6, L - 7, 13.2);
    ctx.fillStyle = '#bdb6a6'; ctx.fillRect(-L / 2 + 10, -2.8, 7, 5.6); ctx.fillRect(4, -2.8, 7, 5.6);
    ctx.fillStyle = Lv.end; ctx.fillRect(L / 2 - 2.6, -8.4, 2, 16.8); ctx.fillRect(-L / 2 + 0.6, -8.4, 1.6, 16.8);
    if (livery === 'express' || livery === 'luxury') { // luggage carrier with a trunk and bags
      ctx.strokeStyle = '#6a6460'; ctx.lineWidth = 0.4; ctx.strokeRect(-L / 2 + 6, -6, 22, 12);
      ctx.fillStyle = '#2a4a8a'; ctx.fillRect(-L / 2 + 8, -4, 6, 4); ctx.fillStyle = '#7a4a2a'; ctx.fillRect(-L / 2 + 16, -1, 5, 5); ctx.fillStyle = '#c8302a'; ctx.fillRect(-L / 2 + 9, 1.5, 4, 3);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const k = kh(18.8);
    const vert = Math.abs(sa) > 0.7;
    if (L * k > 40) ptext(x - ca * 4, y - sa * 4, 18.8, [Lv.text], Lv.tc, null, vert ? (sa > 0 ? 1 : -1) : 0);
    if (route) ptext(x + ca * (L / 2 - 8), y + sa * (L / 2 - 8), 18.8, [route], '#1a1214', null, vert ? (sa > 0 ? 1 : -1) : 0);
  }
  // hand-placed parked buses per terminus [x, y, angle(deg), livery, route]
  const BUS_SLOTS = {
    koti_bus_stand: [[4404, 3252, 0, 'city', '8A'], [4440, 3287, 180, 'city', '127K']],
    rathifile_bus_station: [[5330, 1027, 0, 'city', '5K']],
    mehdipatnam_bus_terminus: [[2205, 2748, 0, 'city', '49M'], [2269, 2748, 0, 'city', '219']],
    imlibun_bus_station: [[4220, 3503, -90, 'express', 'KURNOOL'], [4248, 3503, -90, 'deluxe', 'WARANGAL'], [4352, 3503, -90, 'luxury', 'TIRUPATI'], [4380, 3503, -90, 'express', 'VIJAYAWADA']],
    cbs_hangar: [[4232, 3328, 0, 'city', '9X'], [4268, 3364, 180, 'city', '65G']],
  };
  function busesOf(lm) { return (BUS_SLOTS[lm.id] || []).map((b) => ({ x: b[0], y: b[1], a: (b[2] * Math.PI) / 180, liv: b[3], route: b[4] })); }
  function busShadows(A) { for (const b of A.buses) { const v = Math.abs(Math.sin(b.a)) > 0.7; N.draw.castBox(b.x - (v ? 9 : 31), b.y - (v ? 31 : 9), v ? 18 : 62, v ? 62 : 18, 19); } }
  function crowdAround(A, rng, F, n, u0, u1, v0, v1, kinds, ang) {
    for (let i = 0; i < n; i++) {
      const u = u0 + rng.next() * (u1 - u0), v = v0 + rng.next() * (v1 - v0);
      A.people.push(person(pickR(rng, kinds), (i * 7 + 3) % 31, fxp(F, u, v), fyp(F, u, v), ang == null ? rng.next() * TAU : ang + (rng.next() - 0.5) * 1.6, { sway: 0.6, turn: 0.4 }));
    }
  }
  // The underside of walk-under roofs fades when the player (or the camera target) is under it.
  function under(x, y, w, d) {
    const p = N.player; if (!p) return false;
    const e = p.vehicle || p;
    return e.x > x && e.x < x + w && e.y > y && e.y < y + d;
  }

  /* ================================================================ BUS TERMINI (Koti, Rathifile, Mehdipatnam) */
  reg('bus_terminus', {
    init(lm) {
      const rng = rngOf(lm, 'bt');
      const s = (lm.solids && lm.solids[0]) || [lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, 8];
      const A = { id: lm.id, wall: s, buses: busesOf(lm), people: [] };
      // the shelter: back wall = solid strip, roof extends 12 u into the bays
      const horiz = s[2] >= s[3];
      const cyS = s[1] + s[3] / 2, cxS = s[0] + s[2] / 2;
      const into = horiz ? Math.sign(lm.y - cyS) || 1 : Math.sign(lm.x - cxS) || 1;
      A.horiz = horiz; A.into = into;
      A.roofR = horiz ? [s[0] - 2, into > 0 ? s[1] : s[1] + s[3] - 13, s[2] + 4, 13] : [into > 0 ? s[0] : s[0] + s[2] - 13, s[1] - 2, 13, s[3] + 4];
      // booth for the controller
      A.booth = horiz ? [s[0] + s[2] - 10, s[1] + (into > 0 ? s[3] + 2 : -12), 9, 9] : [s[0] + (into > 0 ? s[2] + 2 : -12), s[1] + s[3] - 10, 9, 9];
      const F = { cx: cxS, cy: cyS, ax: horiz ? 1 : 0, ay: horiz ? 0 : 1, ox: horiz ? 0 : into, oy: horiz ? into : 0 };
      const half = (horiz ? s[2] : s[3]) / 2;
      crowdAround(A, rng, F, 14, -half + 4, half - 4, 6, 12, ['man', 'student', 'woman', 'aunty', 'any', 'uncle', 'burqa', 'saree'], horiz ? (into > 0 ? Math.PI / 2 : -Math.PI / 2) : (into > 0 ? 0 : Math.PI));
      // a conductor with his leather bag near each bus door
      for (const b of A.buses) A.people.push(person('man', 61, b.x + Math.cos(b.a + Math.PI / 2) * 12, b.y + Math.sin(b.a + Math.PI / 2) * 12, b.a, { sway: 0.5, look: { shirt: '#c8b48a', pants: '#8a7a5a' } }));
      A.count = () => (S.min < 300 || S.min > 1410 ? 2 : A.people.length);
      A.boards = ['8A', '127K', '9X', '1Z', '49M', '5K', '65G', '8C', '2V', '219'];
      A.rng = rng;
      return A;
    },
    draw(lm, A) {
      for (const b of A.buses) artBus(b.x, b.y, b.a, b.liv, b.route);
      const s = A.wall, r = A.roofR;
      abox(s[0], s[1], s[2], s[3], 0, 9, '#d8d0bc', '#c8bea8');
      // posts + route boards on the shelter edge
      const n = Math.max(3, Math.round((A.horiz ? r[2] : r[3]) / 14));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = A.horiz ? r[0] + 1 + t * (r[2] - 2) : (A.into > 0 ? r[0] + r[2] - 1 : r[0] + 1);
        const y = A.horiz ? (A.into > 0 ? r[1] + r[3] - 1 : r[1] + 1) : r[1] + 1 + t * (r[3] - 2);
        pole(x, y, 0, 13, '#c8302a', 0.7);
      }
      abox(A.booth[0], A.booth[1], A.booth[2], A.booth[3], 0, 9, '#efe2c4', '#b22b2b');
      const fade = under(r[0], r[1], r[2], r[3]) ? 0.35 : 1;
      ctx.globalAlpha = fade;
      abox(r[0], r[1], r[2], r[3], 13, 14, '#9a9a98', '#b8b4ac');
      // rust streaks and the red fascia
      const k = kh(14);
      ctx.fillStyle = 'rgba(150,80,40,0.25)';
      for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6; if (A.horiz) ctx.fillRect(sx(r[0] + t * r[2], k), sy(r[1], k), 1.5 * k, r[3] * k); else ctx.fillRect(sx(r[0], k), sy(r[1] + t * r[3], k), r[2] * k, 1.5 * k); }
      ctx.globalAlpha = 1;
      // route-number boards along the shelter (white on blue)
      const kb = kh(14.2), len = (A.horiz ? r[2] : r[3]) * kb;
      const nb = Math.max(2, Math.min(6, Math.floor(len / 24)));
      for (let i = 0; i < nb; i++) {
        const t = (i + 0.5) / nb;
        const name = A.boards[(i + (A.wall[0] | 0)) % A.boards.length];
        const x = A.horiz ? r[0] + t * r[2] : r[0] + r[2] / 2, y = A.horiz ? r[1] + r[3] / 2 : r[1] + t * r[3];
        const tw = pw(name);
        ctx.fillStyle = '#f4f0e4';
        ctx.fillRect(Math.round(sx(x, kb) - tw / 2 - 3), Math.round(sy(y, kb) - 5), tw + 6, 10);
        ctx.fillStyle = '#1a3a8a';
        ctx.fillRect(Math.round(sx(x, kb) - tw / 2 - 2), Math.round(sy(y, kb) - 4), tw + 4, 8);
        ptext(x, y, 14.2, [name], '#ffffff', null, 0);
      }
    },
    shadow(lm, A) { const r = A.roofR; N.draw.castBox(r[0], r[1], r[2], r[3], 14); busShadows(A); },
    lights(lm, A) { const r = A.roofR; light(lm, 0, 2, r[0] + r[2] / 2, r[1] + r[3] / 2, 12, Math.max(r[2], r[3]) * 0.6, '#e8f4ff', 0.9); light(lm, 1, 2, lm.x, lm.y, 6, 40, '#ffb060', 0.5); },
    ground(g, lm) { // oil-stained apron and painted bay lines
      const A = { buses: busesOf(lm) };
      g.fillStyle = 'rgba(40,36,40,0.18)';
      for (const b of A.buses) { g.beginPath(); g.ellipse(b.x, b.y, 22, 6, b.a, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(250,240,200,0.55)'; g.lineWidth = 1;
      g.strokeRect(lm.x - lm.w / 2 + 3, lm.y - lm.d / 2 + 3, lm.w - 6, lm.d - 6);
    },
  });

  /* ================================================================ MGBS (Imlibun) */
  reg('mgbs', {
    init(lm) {
      const rng = rngOf(lm, 'mg');
      const s = (lm.solids && lm.solids[0]) || [lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, 34];
      const A = { id: lm.id, term: s, buses: busesOf(lm), people: [], h: lm.h || 22 };
      A.st = { wall: '#e8e2d4', roof: '#d8d2c4', trim: '#f4efe4', dark: '#3a3a40', acc: '#b22b2b', win: '#3a4048', litCol: '#e8f4ff', fac: FAC.office };
      // platform islands between bus pairs; canopies over them
      A.islands = [[4226, 4242], [4358, 4374]].map(([a, b]) => [a, s[1] + s[3], b - a, 70]);
      const F = { cx: lm.x, cy: s[1] + s[3], ax: 1, ay: 0, ox: 0, oy: 1 };
      crowdAround(A, rng, F, 16, -lm.w / 2 + 8, lm.w / 2 - 8, 2, 7, ['man', 'woman', 'aunty', 'uncle', 'saree', 'burqa', 'student', 'any'], Math.PI / 2);
      for (const isl of A.islands) for (let i = 0; i < 5; i++) A.people.push(person(pickR(rng, ['man', 'aunty', 'uncle', 'woman']), 40 + i * 3, isl[0] + isl[2] / 2 + (rng.next() - 0.5) * 6, isl[1] + 10 + i * 11, rng.next() * TAU, { sway: 0.5, turn: 0.4 }));
      // coolies in red shirts with trunks
      for (let i = 0; i < 3; i++) A.people.push(person('man', 70 + i, lm.x - 30 + i * 30, s[1] + s[3] + 12, Math.PI / 2, { sway: 0.6, look: { shirt: '#c8202a', cap: null } }));
      A.count = () => (S.min < 240 ? 10 : A.people.length);
      return A;
    },
    draw(lm, A) {
      for (const b of A.buses) artBus(b.x, b.y, b.a, b.liv, b.route);
      const s = A.term;
      // platform islands (raised kerbs)
      for (const isl of A.islands) abox(isl[0], isl[1], isl[2], isl[3], 0, 1, '#b8b0a0', '#d0c8b8');
      // terminal block + a row of shallow vaulted roof shells
      if (K.box) K.box(s[0], s[1], s[2], s[3], 0, A.h, A.st); else abox(s[0], s[1], s[2], s[3], 0, A.h, A.st.wall, A.st.roof);
      const n = 6, bw = s[2] / n;
      for (let i = 0; i < n; i++) vault(s[0] + i * bw + 1, s[1] + 2, bw - 2, s[3] - 4, A.h, A.h + 7, 'y', '#f2efe8');
      // platform canopies (barrel vaults over the islands; fade when you walk under)
      for (const isl of A.islands) {
        const x = isl[0] - 6, y = isl[1], w = isl[2] + 12, d = isl[3];
        ctx.globalAlpha = under(x, y, w, d) ? 0.3 : 1;
        for (const px of [isl[0] + 1, isl[0] + isl[2] - 1]) for (let py = y + 6; py < y + d; py += 20) pole(px, py, 1, 15, '#6a6a70', 0.6);
        vault(x, y, w, d, 15, 19, 'y', '#e4e0d8');
        ctx.globalAlpha = 1;
      }
      // big sign along the roof edge facing the bays
      const k = kh(A.h + 0.5), txt = 'MAHATMA GANDHI BUS STATION';
      const tw = pw(txt);
      if (tw < s[2] * k - 10) {
        const X = Math.round(sx(lm.x, k)), Y = Math.round(sy(s[1] + s[3] - 3.5, k));
        ctx.fillStyle = '#b22b2b'; ctx.fillRect(X - tw / 2 - 3, Y - 5, tw + 6, 10);
        ptext(lm.x, s[1] + s[3] - 3.5, A.h + 0.5, [txt], '#fff4d8', null, 0);
      }
    },
    shadow(lm, A) { const s = A.term; N.draw.castBox(s[0], s[1], s[2], s[3], A.h + 4); for (const isl of A.islands) N.draw.castBox(isl[0] - 6, isl[1], isl[2] + 12, isl[3], 18); busShadows(A); },
    lights(lm, A) {
      const s = A.term;
      light(lm, 0, 4, lm.x, s[1] + s[3] + 8, 10, 90, '#e8f4ff', 0.9);
      let i = 1; for (const isl of A.islands) light(lm, i++, 4, isl[0] + isl[2] / 2, isl[1] + 35, 14, 50, '#e8f4ff', 0.85);
      light(lm, 3, 4, lm.x, lm.y + 30, 6, 60, '#ffb060', 0.6);
    },
    night(lm, A, a) {
      const s = A.term, k = kh(A.h + 0.5), txt = 'MAHATMA GANDHI BUS STATION', tw = pw(txt);
      if (tw < s[2] * k - 10) { const X = Math.round(sx(lm.x, k)), Y = Math.round(sy(s[1] + s[3] - 3.5, k)); ctx.globalAlpha = a; ctx.fillStyle = '#e8402a'; ctx.fillRect(X - tw / 2 - 3, Y - 5, tw + 6, 10); ctx.globalAlpha = 1; ptext(lm.x, s[1] + s[3] - 3.5, A.h + 0.5, [txt], '#fffbe8', null, 0); }
    },
    ground(g, lm) {
      // bay markings + platform numbers on the apron
      g.strokeStyle = 'rgba(250,240,200,0.6)'; g.lineWidth = 1;
      for (const x of [4206, 4234, 4262, 4338, 4366, 4394]) { g.beginPath(); g.moveTo(x, 3470); g.lineTo(x, 3538); g.stroke(); }
      g.fillStyle = 'rgba(40,36,40,0.16)';
      for (const b of busesOf(lm)) { g.beginPath(); g.ellipse(b.x, b.y, 6, 22, 0, 0, TAU); g.fill(); }
    },
  });
  /** Barrel vault (curved roof) over rect, running along axis ('x' | 'y'), springing at h0. */
  function vault(x, y, w, d, h0, h1, axis, col) {
    const n = 6;
    const along = axis === 'x';
    const span = along ? d : w;
    // strips from the far side to the near side of the camera
    const order = [];
    for (let i = 0; i < n; i++) order.push(i);
    const camT = along ? (CAMY - y) / d : (CAMX - x) / w;
    order.sort((a, b) => Math.abs((b + 0.5) / n - camT) - Math.abs((a + 0.5) / n - camT));
    for (const i of order) {
      const t0 = i / n, t1 = (i + 1) / n;
      const ha = h0 + (h1 - h0) * Math.sin(Math.PI * t0), hb = h0 + (h1 - h0) * Math.sin(Math.PI * t1);
      const nrm = Math.cos(Math.PI * (t0 + t1) / 2); // -1..1 across the span
      const f = along ? R.shadeNormal(0, -nrm) : R.shadeNormal(-nrm, 0);
      const fcol = sh(col, 0.75 + 0.35 * (f - 0.42) / 0.56 + 0.1);
      if (along) quad3(x, y + t0 * span, ha, x + w, y + t0 * span, ha, x + w, y + t1 * span, hb, x, y + t1 * span, hb);
      else quad3(x + t0 * span, y, ha, x + t0 * span, y + d, ha, x + t1 * span, y + d, hb, x + t1 * span, y, hb);
      fillc(fcol);
    }
    // rib lines
    ctx.beginPath();
    const ribs = Math.max(2, Math.round((along ? w : d) / 8));
    for (let r = 0; r <= ribs; r++) {
      const q = r / ribs;
      for (let i = 0; i <= n; i++) {
        const t = i / n, h = h0 + (h1 - h0) * Math.sin(Math.PI * t);
        const px = along ? x + q * w : x + t * span, py = along ? y + t * span : y + q * d;
        if (i) ln(px, py, h); else mv(px, py, h);
      }
    }
    ctx.strokeStyle = sh(col, 0.7); ctx.lineWidth = Math.max(0.4, 0.35 * Z); ctx.stroke();
  }

  /* ================================================================ GOWLIGUDA HANGAR (CBS) */
  reg('cbs_hangar', {
    init(lm) {
      const rng = rngOf(lm, 'cbs');
      const A = { id: lm.id, buses: busesOf(lm), people: [], walls: lm.solids || [] };
      for (let i = 0; i < 10; i++) A.people.push(person(pickR(rng, ['man', 'woman', 'student', 'uncle', 'aunty']), i * 3, lm.x - lm.w / 2 + 10 + rng.next() * (lm.w - 20), lm.y - 3 + rng.next() * 6, rng.next() * TAU, { sway: 0.5, turn: 0.4 }));
      A.count = () => (S.min < 300 || S.min > 1400 ? 2 : A.people.length);
      return A;
    },
    draw(lm, A) {
      for (const b of A.buses) artBus(b.x, b.y, b.a, b.liv, b.route);
      for (const s of A.walls) abox(s[0], s[1], s[2], s[3], 0, 8, '#8a8a88', '#9a9a96');
      const x = lm.x - lm.w / 2, y = lm.y - lm.d / 2;
      ctx.globalAlpha = under(x, y, lm.w, lm.d) ? 0.28 : 1;
      vault(x, y, lm.w, lm.d, 8, lm.h || 26, 'x', '#a8acb0');
      ctx.globalAlpha = 1;
      // painted name on the curve
      const k = kh((lm.h || 26) + 0.2);
      if (!under(x, y, lm.w, lm.d) && pw('CITY BUS STATION') < lm.w * k - 8) ptext(lm.x, lm.y, (lm.h || 26) + 0.2, ['CITY BUS STATION'], '#b22b2b', 'rgba(255,255,255,0.4)', 0);
    },
    shadow(lm) { N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, (lm.h || 26) * 0.8); },
    lights(lm) { light(lm, 0, 2, lm.x - 25, lm.y, 6, 40, '#e8f4ff', 0.8); light(lm, 1, 2, lm.x + 25, lm.y, 6, 40, '#e8f4ff', 0.8); },
  });

  /* ================================================================ SCHOOLS */
  const parkById = (id) => { const D = N.WORLD_DATA; if (!D || !D.parks) return null; for (const p of D.parks) if (p.id === id) return p; return null; };
  function polyBox(poly) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of poly) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); } return [x0, y0, x1 - x0, y1 - y0]; }
  function tricolour(x, y, h0, h1) {
    if (K.flag) K.flag(x, y, h0, h1, '#f08a24', 6, 4, false, '#f8f8f0', '#2a8a3a');
    else pole(x, y, h0, h1, '#6a5a48', 0.6);
  }
  function gateArch(F, u, v, wd, h, col, text, textCol) {
    const x0 = fxp(F, u - wd / 2, v), y0 = fyp(F, u - wd / 2, v), x1 = fxp(F, u + wd / 2, v), y1 = fyp(F, u + wd / 2, v);
    abox(x0 - 1.2, y0 - 1.2, 2.4, 2.4, 0, h, col, sh(col, 1.1));
    abox(x1 - 1.2, y1 - 1.2, 2.4, 2.4, 0, h, col, sh(col, 1.1));
    const r = frect(F, u - wd / 2 - 1.2, u + wd / 2 + 1.2, v - 1.6, v + 1.6);
    abox(r[0], r[1], r[2], r[3], h - 2.6, h, col, sh(col, 1.12));
    if (text) namePlate(fxp(F, u, v), fyp(F, u, v), h + 0.2, text, col, textCol || '#fff4d8', F.rot);
  }
  /** A painted name plate sized to its (pixel) text, centred at a projected point. */
  function namePlate(x, y, h, text, bg, fg, rot) {
    const t = String(text).toUpperCase(), tw = pw(t), k = kh(h), X = Math.round(sx(x, k)), Y = Math.round(sy(y, k));
    ctx.fillStyle = '#1a1416';
    if (rot) ctx.fillRect(X - 5, Y - tw / 2 - 3, 10, tw + 6); else ctx.fillRect(X - tw / 2 - 3, Y - 5, tw + 6, 10);
    ctx.fillStyle = bg;
    if (rot) ctx.fillRect(X - 4, Y - tw / 2 - 2, 8, tw + 4); else ctx.fillRect(X - tw / 2 - 2, Y - 4, tw + 4, 8);
    ptext(x, y, h, [t], fg, null, rot);
  }
  const SCHOOL_PAL = [
    { wall: '#e8c860', acc: '#a0402a', trim: '#f4ecd8' },   // government ochre
    { wall: '#f0ece0', acc: '#2a5cb8', trim: '#ffffff' },   // convent white + blue
    { wall: '#f0d0c0', acc: '#8a2a4a', trim: '#fff4ec' },   // public school peach
    { wall: '#d8e4c8', acc: '#2a6a3a', trim: '#f4f8ec' },
  ];
  reg('school', {
    init(lm) {
      const rng = rngOf(lm, 'sch');
      const hps = lm.variant === 'hps';
      const govt = /GOVT/.test(lm.sign || '') || /Government/.test(lm.name || '');
      const pal = hps ? { wall: '#c8705a', acc: '#f4ecd8', trim: '#f4ecd8' } : govt ? SCHOOL_PAL[0] : SCHOOL_PAL[1 + ((rng.next() * 3) | 0)];
      const A = baseState(lm, { wall: pal.wall, acc: pal.acc, trim: pal.trim, front: FAC.office, side: FAC.plain, win: '#3a3a48', litCol: '#fff0c8', roofPlan: { line: false, cot: false, dish: false } });
      A.hps = hps; A.pal = pal;
      A.initials = (lm.sign || lm.name || 'SCHOOL').toUpperCase().split(/\s+/).filter((w) => w !== 'THE').map((w) => w[0] + '.').join('');
      // corridor facade faces the ground (the back)
      const back = { N: 'S', S: 'N', W: 'E', E: 'W' }[A.F.f];
      A.st.fac[back] = FAC.school;
      planSign(A, lm.sign || lm.name, pal.acc === '#f4ecd8' ? '#7a2a1a' : pal.acc, '#fff8e0', 'book', { over: 2, lift: 3.6 });
      const gp = parkById(lm.id + '_ground');
      A.ground = gp ? polyBox(gp.poly) : null;
      A.gateV = 4.5;
      A.people = [];
      const F = A.F;
      // kids in the ground: clusters (cricket, kho-kho circle), plus the gate stream
      if (A.ground) {
        const [gx, gy, gw, gd] = A.ground;
        for (let i = 0; i < 16; i++) {
          const cl = i % 4, cxg = gx + gw * (0.2 + 0.2 * cl), cyg = gy + gd * (0.3 + 0.4 * ((cl * 7) % 3) / 2);
          A.people.push(person('student', (i * 3 + 1) % 23, cxg + (rng.next() - 0.5) * 18, cyg + (rng.next() - 0.5) * 14, rng.next() * TAU, { sway: 1, sp: 2.2, turn: 0.8 }));
        }
      }
      for (let i = 0; i < 8; i++) A.people.push(person('student', 30 + i, fxp(F, (rng.next() - 0.5) * 16, A.gateV + 2 + rng.next() * 6), fyp(F, (rng.next() - 0.5) * 16, A.gateV + 2 + rng.next() * 6), F.ang + (rng.next() - 0.5) * 1.5, { sway: 0.8, turn: 0.5 }));
      A.people.push(person('man', 90, fxp(F, 9, A.gateV + 3), fyp(F, 9, A.gateV + 3), F.ang + Math.PI, { sway: 0.5 })); // gate vendor
      A.vendorAt = [fxp(F, 9, A.gateV + 0.8), fyp(F, 9, A.gateV + 0.8)];
      const nGround = A.ground ? 16 : 0;
      A.count = () => {
        const wd = S.weekday, m = S.min;
        const schoolDay = wd >= 1 && wd <= 6;
        if (!schoolDay) return m > 420 && m < 1080 ? Math.min(nGround, 8) : 0; // Sunday cricket
        if (m >= 500 && m < 540) return nGround + 9;          // assembly / arriving
        if ((m >= 630 && m < 660) || (m >= 750 && m < 800)) return nGround + 1; // recess + lunch
        if (m >= 960 && m < 1000) return nGround + 9;         // the bell: everyone out
        if (m >= 1000 && m < 1110) return Math.min(nGround, 8) + 1;
        return m >= 540 && m < 960 ? 1 : 0;
      };
      // the ground's people are first in the list; reorder so that count() slices sensibly
      return A;
    },
    draw(lm, A) {
      const F = A.F, front = camFront(F);
      const gate = () => {
        gateArch(F, 0, A.gateV, 14, 9, A.pal.acc === '#f4ecd8' ? '#7a2a1a' : A.pal.acc, A.initials, '#fff8e0');
        tricolour(fxp(F, -F.L / 2 + 4, A.gateV - 1), fyp(F, -F.L / 2 + 4, A.gateV - 1), 0, 22);
        // gate vendor: ice-gola cart in summer, a peanut cart otherwise
        const [vx, vy] = A.vendorAt;
        abox(vx - 3, vy - 1.8, 6, 3.6, 2.6, 4, '#3a6a9a', '#4a7aaa');
        if (S.summer) { for (let i = 0; i < 4; i++) disc(vx - 2 + i * 1.3, vy - 0.8, 0.5, 4.6, ['#e8203a', '#f2c230', '#30c050', '#f06aa0'][i]); abox(vx, vy, 2.4, 1.4, 4, 5.2, '#e8f4f8', '#f4fcff'); umbrella(vx, vy, 4.5, 9, '#f2c230', '#e8203a', 6); }
        else { cyl(vx + 1.2, vy, 1.3, 4, 5, '#2a2a2e', '#c8a060'); steam(vx + 1.2, vy, 5.2, 2, 3, '#e8e4dc', 0.7); }
      };
      if (!front) gate();
      building(A);
      if (A.hps) { // The Hyderabad Public School: domes and chhatris on the roofline
        const x = A.rr.x, y = A.rr.y, w = A.rr.w, d = A.rr.d, h = A.h;
        K.dome && K.dome(x + w / 2, y + d / 2, 8, h, h + 12, '#f0e6d0', false, 3);
        for (const [cx0, cy0] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + d - 6], [x + w - 6, y + d - 6]]) { if (K.chhatri) K.chhatri(cx0, cy0, 4.5, h, h + 9, '#f0e6d0', '#e8dcc0'); }
      } else {
        // the school bell + a small stair room with the water tank on it
        pole(fxp(F, F.L / 2 - 4, -2), fyp(F, F.L / 2 - 4, -2), A.h, A.h + 4, '#5a5a5a', 0.5);
      }
      drawSign(A, A.h, 0);
      if (front) gate();
    },
    shadow(lm, A) { castMain(A); },
    lights(lm, A) { light(lm, 0, 1, fxp(A.F, 0, A.gateV + 2), fyp(A.F, 0, A.gateV + 2), 8, 28, '#ffd890', 0.7); },
    night(lm, A, a) { nightSign(A, A.h, a * 0.7); },
    ground(g, lm) {
      // a cricket pitch + boundary stones in the school ground (inside the landmark's reach)
      const gp = parkById(lm.id + '_ground');
      if (!gp) return;
      const [gx, gy, gw, gd] = polyBox(gp.poly);
      const r = Math.max(lm.w, lm.d);
      const cx0 = U.clamp(gx + gw / 2, lm.x - r + 14, lm.x + r - 14), cy0 = U.clamp(gy + gd / 2, lm.y - r + 14, lm.y + r - 14);
      const along = gw >= gd;
      g.fillStyle = 'rgba(232,214,170,0.55)';
      if (along) g.fillRect(cx0 - 11, cy0 - 2, 22, 4); else g.fillRect(cx0 - 2, cy0 - 11, 4, 22);
      g.fillStyle = 'rgba(255,255,255,0.6)';
      if (along) { g.fillRect(cx0 - 9, cy0 - 2.2, 0.6, 4.4); g.fillRect(cx0 + 8.4, cy0 - 2.2, 0.6, 4.4); } else { g.fillRect(cx0 - 2.2, cy0 - 9, 4.4, 0.6); g.fillRect(cx0 - 2.2, cy0 + 8.4, 4.4, 0.6); }
    },
  });

  /* ================================================================ HOME (Lakshmi Nivas) + friend's house */
  reg('home_house', {
    init(lm) {
      const friend = lm.variant === 'friend';
      const A = baseState(lm, { wall: friend ? '#cfe4cc' : '#f0dcb8', roof: '#d4c8b0', trim: friend ? '#f4fbf2' : '#fff6e6', acc: friend ? '#2a7a5a' : '#b0583a', win: '#5a4a3a', litCol: '#ffd890', front: FAC.plain, roofPlan: { mumty: true, cot: true } });
      A.friend = friend;
      const F = A.F, x = A.rr.x, y = A.rr.y, w = A.rr.w, d = A.rr.d;
      // the terrace: Sintex tank on a stand, the TV antenna, saris on the line, the cot, tulsi + plants
      A.r3.mumty = [x + w - 10, y + d - 10, 8, 8];
      A.r3.tank = [x + w - 6, y + d - 6, 2.4, true]; A.r3.tankOn = true;
      A.r3.ant = [x + 5, y + 5, 12, 0.7]; A.r3.kite = '#e83a5a';
      A.roofItems = [{ t: 'line', x0: x + 3, y0: y + d * 0.42, x1: x + w - 12, y1: y + d * 0.42 }, { t: 'cot', x: x + 4, y: y + d * 0.58, w: 9, d: 4.5 }, { t: 'plants', x: x + 4, y: y + 2.5, n: 5 }];
      if (!friend) A.roofItems.push({ t: 'kites', x: x + w * 0.45, y: y + d * 0.68 }, { t: 'chilli', x: x + w * 0.5, y: y + 3, w: 7, d: 3.6 });
      if (!friend && lm.sign) planSign(A, lm.sign, '#f4ecd8', '#8a2a1a', null, { over: 0, lift: 0.4, h0: 0.2, frame: '#e0d4bc', lit: false });
      A.people = [];
      const add = (k, i, u, v, a, o) => A.people.push(person(k, i, fxp(F, u, v), fyp(F, u, v), a, o));
      if (!friend) { add('aunty', 4, -6, 2.4, F.ang + 0.4, { sway: 0.4 }); }
      else add('burqa', 2, 5, 2.6, F.ang, { sway: 0.3 });
      A.count = () => (S.min > 420 && S.min < 1260 ? 1 : 0);
      A.kites = [];
      const rng = A.rng;
      for (let i = 0; i < 3; i++) A.kites.push({ ox: (rng.next() - 0.5) * 60, oy: -30 - rng.next() * 50, h: 40 + rng.next() * 25, col: ['#e83a5a', '#2a5cb8', '#f2c230'][i], ph: rng.next() * TAU });
      return A;
    },
    draw(lm, A) {
      const F = A.F, front = camFront(F);
      const yard = () => {
        // compound wall with the gate, the name plate, a tulsi kota in the yard
        const v = 5.5;
        fbox(F, -F.L / 2, -3.5, v - 0.6, v + 0.6, 0, 4, '#efe9dc', '#d8d0c0');
        fbox(F, 3.5, F.L / 2, v - 0.6, v + 0.6, 0, 4, '#efe9dc', '#d8d0c0');
        fbox(F, -3.6, -2.8, v - 0.9, v + 0.9, 0, 5.2, '#e8dcc8', '#c8bca8');
        fbox(F, 2.8, 3.6, v - 0.9, v + 0.9, 0, 5.2, '#e8dcc8', '#c8bca8');
        const gx = fxp(F, 0, v), gy = fyp(F, 0, v);
        seg3(fxp(F, -2.8, v), fyp(F, -2.8, v), 2.4, fxp(F, 2.8, v), fyp(F, 2.8, v), 2.4, A.friend ? '#2a7a5a' : '#3a4a8a', 0.8);
        void gx; void gy;
        fbox(F, -F.L / 2 + 5, -F.L / 2 + 7.5, 2, 4.5, 0, 3, '#e8c060', '#d8a040');
        fdisc(F, -F.L / 2 + 6.25, 3.25, 1.2, 3.6, '#3a8a3a');
      };
      if (!front) yard();
      building(A);
      if (A.sign) drawSign(A, A.h, 0);
      if (front) yard();
      if (S.sankranti && !A.friend) { // kites flying from our terrace
        const tx = A.rr.x + A.rr.w * 0.4, ty = A.rr.y + A.rr.d * 0.6;
        for (const kt of A.kites) {
          const kx = lm.x + kt.ox + Math.sin(TIME * 0.7 + kt.ph) * 4, ky = lm.y + kt.oy + Math.cos(TIME * 0.5 + kt.ph) * 3;
          seg3(tx, ty, A.h + 1, kx, ky, kt.h, 'rgba(250,250,250,0.6)', 0.25);
          const k = kh(kt.h), X = sx(kx, k), Y = sy(ky, k);
          ctx.beginPath(); ctx.moveTo(X, Y - 3 * k); ctx.lineTo(X + 2.4 * k, Y); ctx.lineTo(X, Y + 3 * k); ctx.lineTo(X - 2.4 * k, Y); ctx.closePath(); fillc(kt.col);
        }
      }
    },
    shadow(lm, A) { castMain(A); },
    lights(lm, A) { light(lm, 0, 1, fxp(A.F, 0, 3), fyp(A.F, 0, 3), 7, 22, '#ffd890', 0.7); },
    ground(g, lm) { // a muggulu (rangoli) at the gate
      const F = frontOf(lm), x = fxp(F, 0, 9), y = fyp(F, 0, 9);
      g.strokeStyle = 'rgba(250,250,245,0.85)'; g.lineWidth = 0.4;
      g.beginPath(); g.arc(x, y, 3.6, 0, TAU); g.stroke();
      g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 3.6, y + Math.sin(a) * 3.6); } g.stroke();
      g.fillStyle = 'rgba(230,60,90,0.7)'; g.beginPath(); g.arc(x, y, 1.2, 0, TAU); g.fill();
      g.fillStyle = 'rgba(250,250,245,0.8)'; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.4; g.beginPath(); g.arc(x + Math.cos(a) * 2.3, y + Math.sin(a) * 2.3, 0.35, 0, TAU); g.fill(); }
    },
  });

  /* ================================================================ COLONY PLAYGROUND KIT (swings + slide) */
  function swingSet(x, y, ca, sa, len, h, ph, n) {
    // A-frames at both ends, top bar, seats swinging on chains
    const wx = -sa, wy = ca;
    for (const s of [-1, 1]) {
      const ex = x + ca * len / 2 * s, ey = y + sa * len / 2 * s;
      seg3(ex + wx * 3.6, ey + wy * 3.6, 0, ex, ey, h, '#d8302a', 1.0);
      seg3(ex - wx * 3.6, ey - wy * 3.6, 0, ex, ey, h, '#d8302a', 1.0);
    }
    seg3(x - ca * len / 2, y - sa * len / 2, h, x + ca * len / 2, y + sa * len / 2, h, '#2a5cd8', 1.1);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5, px = x + ca * len * t, py = y + sa * len * t;
      const sw = Math.sin(TIME * 2.2 + ph + i * 1.7) * 0.7 * (i % 2 ? 1 : 0.4);
      const sxw = px + wx * Math.sin(sw) * (h - 3), syw = py + wy * Math.sin(sw) * (h - 3), hs = h - Math.cos(sw) * (h - 3);
      seg3(px - ca * 1.1, py - sa * 1.1, h, sxw - ca * 1.1, syw - sa * 1.1, hs, '#4a4a52', 0.4);
      seg3(px + ca * 1.1, py + sa * 1.1, h, sxw + ca * 1.1, syw + sa * 1.1, hs, '#4a4a52', 0.4);
      obox(sxw, syw, ca, sa, 1.6, 1, hs - 0.4, hs, '#f2c230', '#f2c230');
    }
  }
  function slide(x, y, ca, sa, h) {
    // ladder at the back, platform, a long yellow chute sloping forward
    const bx = x - ca * 5, by = y - sa * 5;
    seg3(bx - sa * 1.4, by + ca * 1.4, 0, bx - sa * 1.4, by + ca * 1.4, h, '#c8302a', 0.7);
    seg3(bx + sa * 1.4, by - ca * 1.4, 0, bx + sa * 1.4, by - ca * 1.4, h, '#c8302a', 0.7);
    for (let r = 2; r < h; r += 2.2) seg3(bx - sa * 1.4, by + ca * 1.4, r, bx + sa * 1.4, by - ca * 1.4, r, '#c8302a', 0.45);
    obox(bx, by, ca, sa, 1.4, 1.7, h - 0.5, h, '#2a5cd8', '#3a6ae8');
    const ex = x + ca * 7, ey = y + sa * 7;
    quad3(bx + ca * 1.4 - sa * 1.5, by + sa * 1.4 + ca * 1.5, h, bx + ca * 1.4 + sa * 1.5, by + sa * 1.4 - ca * 1.5, h, ex + sa * 1.5, ey - ca * 1.5, 0.6, ex - sa * 1.5, ey + ca * 1.5, 0.6);
    fillc('#f2c230');
    quad3(bx + ca * 1.4 - sa * 0.6, by + sa * 1.4 + ca * 0.6, h + 0.05, bx + ca * 1.4 + sa * 0.6, by + sa * 1.4 - ca * 0.6, h + 0.05, ex + sa * 0.6, ey - ca * 0.6, 0.65, ex - sa * 0.6, ey + ca * 0.6, 0.65);
    fillc('#fff0a0');
  }
  function seesaw(x, y, ca, sa, ph) {
    const t = Math.sin(TIME * 1.6 + ph) * 2.4;
    obox(x, y, ca, sa, 0.8, 0.8, 0, 2.6, '#5a5a62', '#6a6a72');
    const L = 8, w = 0.9, nx = -sa * w, ny = ca * w;
    quad3(x - ca * L + nx, y - sa * L + ny, 2.6 - t, x + ca * L + nx, y + sa * L + ny, 2.6 + t, x + ca * L - nx, y + sa * L - ny, 2.6 + t, x - ca * L - nx, y - sa * L - ny, 2.6 - t);
    fillc('#2a9c82');
    for (const e of [-1, 1]) { const hx = x + ca * L * 0.8 * e, hy = y + sa * L * 0.8 * e, hh = 2.6 + t * 0.8 * e; seg3(hx - sa * 0.9, hy + ca * 0.9, hh, hx - sa * 0.9, hy + ca * 0.9, hh + 1.8, '#d8302a', 0.4); seg3(hx + sa * 0.9, hy - ca * 0.9, hh, hx + sa * 0.9, hy - ca * 0.9, hh + 1.8, '#d8302a', 0.4); }
  }
  function roundabout(x, y, ph) {
    // the merry-go-round: a turning disc of coloured sectors with hand rails
    const a0 = TIME * 0.8 + ph, n = 6, r = 5.2, h = 1.4, k = kh(h);
    cyl(x, y, r, 0.3, h - 0.1, '#6a6a72', null);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU, b = a0 + ((i + 1) / n) * TAU;
      ctx.beginPath(); ctx.moveTo(sx(x, k), sy(y, k)); ctx.arc(sx(x, k), sy(y, k), r * k, a, b); ctx.closePath();
      fillc(['#d8302a', '#f2c230', '#2a5cd8', '#30a050', '#f08a24', '#e85a9a'][i]);
    }
    for (let i = 0; i < 3; i++) { const a = a0 + (i / 3) * TAU; seg3(x, y, 4, x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, 3, '#c8ccd2', 0.5); }
    pole(x, y, h, 4.2, '#c8ccd2', 0.7);
  }
  function stumps(x, y, ca, sa) {
    for (let i = -1; i <= 1; i++) pole(x - sa * i * 0.8, y + ca * i * 0.8, 0, 4, '#f4ecd0', 0.5);
  }
  reg('playground_kit', {
    init(lm) { return { long: lm.w >= lm.d, ph: (U.strHash(lm.id) % 100) / 10 }; },
    draw(lm, A) {
      const ca = A.long ? 1 : 0, sa = A.long ? 0 : 1;
      swingSet(lm.x, lm.y, ca, sa, Math.max(lm.w, lm.d) - 2, 12, A.ph, 2);
      slide(lm.x - sa * 12 + ca * 2, lm.y + ca * 12 + sa * 2, ca, sa, 8);
    },
    shadow(lm) { N.draw.castPole(lm.x - lm.w / 2, lm.y, 12, 1.2); N.draw.castPole(lm.x + lm.w / 2, lm.y, 12, 1.2); },
  });

  /* ================================================================ OVERHEAD WATER TANK */
  reg('water_tank', {
    init(lm) { return { r: Math.min(lm.w, lm.d) * 0.48, top: lm.h || 60 }; },
    draw(lm, A) {
      const x = lm.x, y = lm.y, H = A.top, tb = H - 16, r = A.r;
      // six columns with ring beams, a ladder
      const cols = 6;
      for (let i = 0; i < cols; i++) { const a = (i / cols) * TAU + 0.3; pole(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, 0, tb, '#a8a49c', 1.2); }
      for (const hb of [tb * 0.33, tb * 0.66]) ring(x, y, r * 0.75, hb, '#9a968e', 0.8);
      pole(x + r * 0.2, y + r * 0.2, 0, tb, '#6a6a6a', 0.4);
      // the bowl + tank drum + dome
      cyl(x, y, r * 0.8, tb - 3, tb, '#a8a49c', null);
      if (K.cylV) K.cylV(x, y, r, tb, H - 3, '#bdb8ae', null); else cyl(x, y, r, tb, H - 3, '#bdb8ae', null);
      ring(x, y, r, tb + 6, '#e8e0d0', 1.2);
      N.draw.dome(x, y, r, H - 3, H + 2, { fill: '#c8c4ba', steps: 5 });
      disc(x, y, 1.6, H + 2.2, '#8a8680');
    },
    shadow(lm, A) { N.draw.castCircle(lm.x, lm.y, A.r, A.top * 0.85); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; N.draw.castPole(lm.x + Math.cos(a) * A.r * 0.75, lm.y + Math.sin(a) * A.r * 0.75, A.top - 16, 1.4); } },
    lights(lm, A) { light(lm, 0, 1, lm.x, lm.y, A.top + 3, 8, '#ff3020', 0.5 + 0.5 * Math.sin(TIME * 3)); },
  });

  /* ================================================================ RYTHU BAZAAR */
  function paintVeg(g, w, d, rng) {
    g.fillStyle = '#a8a094'; g.fillRect(0, 0, w, d);
    const VEG = [['#d8302a', '#a81a1a', 1], ['#c86a8a', '#a04a6a', 1], ['#6a2a6a', '#4a1a4a', 1.1], ['#a87a4a', '#8a5a2a', 1.1], ['#3a8a2a', '#2a6a1a', 0.8], ['#5ab03a', '#3a8a2a', 0.5], ['#f2d23a', '#c8a020', 0.6], ['#f07a2a', '#c85a1a', 0.5], ['#cfe0a0', '#a8c070', 1.6], ['#f4f0e0', '#d8d0b8', 0.9]];
    const n = Math.floor(w / 6);
    for (let i = 0; i < n; i++) {
      const v = VEG[(i * 3 + ((rng.next() * 4) | 0)) % VEG.length];
      const cx0 = 3 + i * 6 + (rng.next() - 0.5), cy0 = d / 2;
      g.fillStyle = v[1]; g.beginPath(); g.ellipse(cx0, cy0, 2.7, d * 0.42, 0, 0, TAU); g.fill();
      for (let j = 0; j < 22; j++) {
        const a = rng.next() * TAU, rr = Math.sqrt(rng.next());
        g.fillStyle = j % 3 ? v[0] : sh(v[0], 1.15);
        g.beginPath(); g.arc(cx0 + Math.cos(a) * rr * 2.2, cy0 + Math.sin(a) * rr * d * 0.34, 0.45 * v[2], 0, TAU); g.fill();
      }
      if (i % 3 === 1) { g.fillStyle = '#2a2a2a'; g.fillRect(cx0 - 1, 0.3, 2, 1.2); g.fillStyle = '#f8f8f0'; g.fillRect(cx0 - 0.6, 0.6, 1.2, 0.3); } // price slate
    }
  }
  reg('rythu_bazaar', {
    init(lm) {
      const rng = rngOf(lm, 'rb');
      const counters = (lm.solids || []).map((s) => s.slice());
      const A = { id: lm.id, F: frontOf(lm), counters, people: [], rng };
      A.h = lm.h || 14;
      // two shed roofs, each over a counter plus an aisle
      A.sheds = counters.map((c) => [c[0] - 4, c[1] - 9, c[2] + 8, 9 + c[3] * 0.4]);
      for (const c of counters) {
        for (let i = 0; i < 9; i++) { // farmers behind the heaps
          const x = c[0] + 6 + i * (c[2] - 12) / 8;
          A.people.push(person(pickR(rng, ['uncle', 'saree', 'lungi', 'aunty']), (i * 5 + c[1]) % 29, x, c[1] - 3.2, Math.PI / 2, { sway: 0.4, sp: 1 }));
        }
        for (let i = 0; i < 8; i++) A.people.push(person(pickR(rng, ['woman', 'man', 'aunty', 'saree', 'uncle', 'burqa']), (i * 7 + 2) % 31, c[0] + 8 + rng.next() * (c[2] - 16), c[1] + c[3] + 3 + rng.next() * 4, -Math.PI / 2 + (rng.next() - 0.5), { sway: 0.6, turn: 0.4 }));
      }
      planSign(A, 'RYTHU BAZAAR', '#2f7a3a', '#fff8d8', null, { over: 0 });
      A.count = () => (S.min < 360 || S.min > 1200 ? 0 : S.min < 720 ? A.people.length : Math.round(A.people.length * 0.6));
      return A;
    },
    draw(lm, A) {
      for (const c of A.counters) {
        abox(c[0], c[1], c[2], c[3], 0, 2.6, '#9a958c', '#b4aea4');
        const img = loadImg('veg:' + lm.id + ':' + c[1], c[2] / 2, c[3] / 2, (g, hl, hw, r) => { g.setTransform(LOAD_RES, 0, 0, LOAD_RES, 1, 1); paintVeg(g, hl * 2, hw * 2, r); });
        plane(2.7); ctx.imageSmoothingEnabled = true; ctx.drawImage(img, c[0], c[1], c[2], c[3]); ctx.imageSmoothingEnabled = false; ctx.setTransform(1, 0, 0, 1, 0, 0);
        // hanging balances along the counter
        for (let i = 0; i < 4; i++) {
          const x = c[0] + 12 + i * (c[2] - 24) / 3, y = c[1] + c[3] / 2;
          pole(x, y - 2, 2.6, 7, '#6a5a48', 0.4); seg3(x - 1.8, y - 2, 7, x + 1.8, y - 2, 7, '#3a3a3a', 0.3);
          disc(x - 1.8, y - 2, 0.9, 5, '#b8bcc4'); disc(x + 1.8, y - 2, 0.9, 5, '#b8bcc4');
        }
      }
      for (const s of A.sheds) {
        for (let x = s[0] + 1; x < s[0] + s[2]; x += 20) { pole(x, s[1] + 1, 0, A.h - 1, '#6a6a70', 0.6); pole(x, s[1] + s[3] - 1, 0, A.h - 3, '#6a6a70', 0.6); }
        ctx.globalAlpha = under(s[0], s[1], s[2], s[3]) ? 0.3 : 1;
        const k0 = kh(A.h - 3), k1 = kh(A.h);
        quad3(s[0], s[1], A.h, s[0] + s[2], s[1], A.h, s[0] + s[2], s[1] + s[3], A.h - 3, s[0], s[1] + s[3], A.h - 3);
        fillc(sh('#9aa4a8', 1.0 + 0.1 * SUN.dy));
        ctx.beginPath();
        for (let x = s[0] + 2; x < s[0] + s[2]; x += 2.2) { ctx.moveTo(sx(x, k1), sy(s[1], k1)); ctx.lineTo(sx(x, k0), sy(s[1] + s[3], k0)); }
        ctx.strokeStyle = 'rgba(70,80,90,0.35)'; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.fillStyle = 'rgba(150,80,40,0.22)';
        for (let i = 0; i < 5; i++) { const x = s[0] + 10 + i * s[2] / 5; ctx.fillRect(sx(x, k1), sy(s[1], k1), 2 * k1, s[3] * k0); }
        ctx.globalAlpha = 1;
      }
      // entrance arch with the board
      gateArch(A.F, 0, 3, 46, 12, '#2f7a3a', 'RYTHU BAZAAR', '#fff8d8');
    },
    shadow(lm, A) { for (const s of A.sheds) N.draw.castBox(s[0], s[1], s[2], s[3], A.h - 1); },
    lights(lm, A) { let i = 0; for (const s of A.sheds) light(lm, i++, 2, s[0] + s[2] / 2, s[1] + s[3] / 2, 10, 60, '#e8f4ff', 0.75); },
    ground(g, lm) {
      g.fillStyle = 'rgba(190,184,170,0.6)'; g.fillRect(lm.x - lm.w / 2 + 2, lm.y - lm.d / 2 + 2, lm.w - 4, lm.d - 4);
      const rng = U.rng('rbg:' + lm.id);
      for (let i = 0; i < 40; i++) { g.fillStyle = ['rgba(60,140,40,0.6)', 'rgba(200,60,40,0.5)', 'rgba(220,200,150,0.6)'][i % 3]; g.fillRect(lm.x - lm.w / 2 + rng.next() * lm.w, lm.y - lm.d / 2 + rng.next() * lm.d, 0.8, 0.6); }
    },
  });

  /* ================================================================ PRASADS IMAX (fence / opening / open) */
  function tinFence(x, y, w, d, h, gapSide, gapAt) {
    const cols = ['#2a6a9a', '#2f8a5a'];
    const seg = (ax, ay, bx, by, nx, ny) => {
      const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / 6));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        if (gapAt != null && Math.abs((t0 + t1) / 2 - gapAt) < 0.06 && gapSide) continue;
        const x0 = ax + (bx - ax) * t0, y0 = ay + (by - ay) * t0, x1 = ax + (bx - ax) * t1, y1 = ay + (by - ay) * t1;
        wallQ(x0, y0, x1, y1, nx, ny, kh(0), kh(h), cols[i % 2]);
        wallQ(x1, y1, x0, y0, -nx, -ny, kh(0), kh(h), sh(cols[i % 2], 0.8));
      }
      seg3(ax, ay, h, bx, by, h, '#1a3a5a', 0.4);
    };
    seg(x, y, x + w, y, 0, -1, false);
    seg(x + w, y + d, x, y + d, 0, 1, true);
    seg(x, y + d, x, y, -1, 0, false);
    seg(x + w, y, x + w, y + d, 1, 0, false);
  }
  function towerCrane(x, y, h, a, jib) {
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pole(x + dx, y + dy, 0, h, '#e8b020', 0.45);
    for (let hh = 4; hh < h; hh += 5) { seg3(x - 1, y - 1, hh, x + 1, y + 1, hh + 4, '#d8a010', 0.3); }
    const ca = Math.cos(a), sa = Math.sin(a);
    seg3(x - ca * jib * 0.3, y - sa * jib * 0.3, h, x + ca * jib, y + sa * jib, h, '#e8b020', 0.9);
    obox(x - ca * jib * 0.28, y - sa * jib * 0.28, ca, sa, 2, 1.4, h - 1.5, h + 1, '#8a8a8a', '#a8a8a8');
    obox(x + ca * 1.5, y + sa * 1.5, ca, sa, 1.6, 1.4, h - 3, h, '#e8b020', '#f2c230');
    const hx = x + ca * jib * 0.7, hy = y + sa * jib * 0.7;
    seg3(hx, hy, h, hx, hy, h - 14, '#3a3a3a', 0.25);
    obox(hx, hy, 1, 0, 2, 1, h - 16, h - 14, '#8a5a3a', '#a06a40');
  }
  reg('prasads_imax', {
    init(lm) {
      const rng = rngOf(lm, 'imax');
      const A = { id: lm.id, F: frontOf(lm), rng, people: [] };
      const F = A.F;
      for (let i = 0; i < 26; i++) {
        const u = (rng.next() - 0.5) * (F.L - 6), v = 2 + rng.next() * 14;
        A.people.push(person(pickR(rng, ['any', 'woman', 'man', 'student', 'kid', 'aunty', 'burqa']), i, fxp(F, u, v), fyp(F, u, v), F.ang + Math.PI + (rng.next() - 0.5) * 1.8, { sway: 0.7, turn: 0.5 }));
      }
      A.count = () => {
        const v = S.prasads;
        if (v === 'fence') return 0;
        if (v === 'opening') return A.people.length;
        return S.min < 600 || S.min > 1410 ? 0 : 10 + Math.round(showRush(S.min) * 10);
      };
      return A;
    },
    draw(lm, A) {
      const F = A.F, x = lm.x - lm.w / 2, y = lm.y - lm.d / 2, w = lm.w, d = lm.d;
      const v = S.prasads;
      if (v === 'fence') {
        // construction site: concrete frame, scaffolding, sand heaps, a crane, the tin fence + hoarding
        for (const [hx, hy, r] of [[x + 12, y + d - 12, 6], [x + w - 14, y + 14, 5]]) N.draw.dome(hx, hy, r, 0, 3.5, { fill: '#d8c08a', steps: 4 });
        abox(x + w - 16, y + d - 12, 12, 8, 0, 7, '#2a5cb8', '#3a6ac8'); // site office
        const fx0 = x + 14, fy0 = y + 10, fw = w - 30, fd = d - 30;
        for (let lev = 0; lev < 2; lev++) {
          const h = 12 + lev * 12;
          for (let i = 0; i <= 4; i++) for (let j = 0; j <= 3; j++) pole(fx0 + (fw * i) / 4, fy0 + (fd * j) / 3, h - 12, h, '#a8a49c', 0.9);
          abox(fx0 - 1, fy0 - 1, fw + 2, fd + 2, h - 1, h, '#b8b4ac', lev ? 'rgba(184,180,172,0.0)' : '#c4c0b6');
          if (lev === 1) { // half-poured top slab + rebar
            hrect(fx0, fy0, fw * 0.55, fd, h, '#c4c0b6');
            const k = kh(h); ctx.strokeStyle = '#7a4a3a'; ctx.lineWidth = 0.4; ctx.beginPath();
            for (let xx = fx0 + fw * 0.55; xx < fx0 + fw; xx += 2) { ctx.moveTo(sx(xx, k), sy(fy0, k)); ctx.lineTo(sx(xx, k), sy(fy0 + fd, k)); }
            ctx.stroke();
          }
        }
        // scaffolding poles
        for (let i = 0; i < 6; i++) pole(fx0 - 3 + i * (fw + 6) / 5, fy0 + fd + 3, 0, 22, '#8a6a3a', 0.35);
        towerCrane(x + w * 0.25, y + d * 0.3, 52, TIME * 0.05, 34);
        tinFence(x, y, w, d, 8, true, 0.75);
        // the hoarding facing Necklace Road
        const bw = 44, bd = 16, bx = lm.x - bw / 2, by = y + d - bd - 2;
        pole(bx + 4, by + bd, 0, 18, '#4a4a50', 0.7); pole(bx + bw - 4, by + bd, 0, 18, '#4a4a50', 0.7);
        abox(bx, by, bw, bd, 17, 18.2, '#1a1a2a', '#1a1a2a');
        const k = kh(18.2);
        ptext(lm.x, by + bd * 0.28, 18.2, ['PRASADS'], '#f2c230', null, 0);
        ptext(lm.x, by + bd * 0.62, 18.2, pw('COMING SOON') < bw * k - 4 ? ['COMING SOON', 'THE GIANT SCREEN'] : ['COMING SOON'], '#ffffff', null, 0);
        return;
      }
      // open: the windowless giant-screen hall + the glass mall block with a curved front
      const hall = [x + 10, y + 2, w - 20, d * 0.55];
      const st = A.hallSt || (A.hallSt = { wall: '#3a4a5e', roof: '#4a5a6e', trim: '#8a9ab0', acc: '#2a3a4e', fac: FAC.blank });
      if (K.box) K.box(hall[0], hall[1], hall[2], hall[3], 0, lm.h || 44, st); else abox(hall[0], hall[1], hall[2], hall[3], 0, 44, st.wall, st.roof);
      const gy0 = y + d * 0.5, gd = d * 0.5 - 2;
      const pts = A.glassPts || (A.glassPts = (() => { const p = []; const cx0 = lm.x, rx = w / 2, ry = gd; p.push([x, gy0]); p.push([x + w, gy0]); for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; p.push([cx0 + Math.cos(a) * rx, gy0 + Math.sin(a) * ry * 0.95]); } return p; })());
      if (K.prism) K.prism(pts, 0, 26, { wall: '#5ab8d0', roof: '#9ab0c0' }); else abox(x, gy0, w, gd, 0, 26, '#5ab8d0', '#9ab0c0');
      // glass mullions on the curve (the near half) + sky reflection band
      const k0 = kh(1), k1 = kh(25);
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI, px = lm.x + Math.cos(a) * w / 2, py = gy0 + Math.sin(a) * gd * 0.95; if ((px - CAMX) * Math.cos(a) + (py - CAMY) * Math.sin(a) > 0) continue; ctx.moveTo(sx(px, k0), sy(py, k0)); ctx.lineTo(sx(px, k1), sy(py, k1)); }
      ctx.strokeStyle = 'rgba(230,245,255,0.55)'; ctx.lineWidth = 0.6; ctx.stroke();
      // roof garden + the big name on the hall roof
      const kr = kh((lm.h || 44) + 0.2);
      if (pw('PRASADS') < hall[2] * kr) {
        const X = Math.round(sx(lm.x, kr)), Y = Math.round(sy(hall[1] + hall[3] * 0.62, kr));
        ctx.fillStyle = '#c8202a'; ctx.fillRect(X - 16, Y - 6, 32, 12);
        ptext(lm.x, hall[1] + hall[3] * 0.62, (lm.h || 44) + 0.2, ['PRASADS'], '#ffffff', null, 0);
      }
      // vertical film banners down the glass front
      const bc = ['#e83a5a', '#f2c230', '#2a5cd8', '#30b050'];
      for (let i = 0; i < 4; i++) {
        const a = 0.55 + i * 0.68, px = lm.x + Math.cos(a) * w / 2 * 1.01, py = gy0 + Math.sin(a) * gd * 0.97;
        quad3(px - 1.6, py, 24, px + 1.6, py, 24, px + 1.6, py + 0.3, 8, px - 1.6, py + 0.3, 8); fillc(bc[i]);
      }
      if (v === 'opening') {
        // OPENING TODAY banner, balloon arch, bunting
        const bx = lm.x, by = y + d + 4;
        abox(bx - 20, by - 1, 40, 2, 9, 12, '#c8202a', '#e8302a');
        ptext(bx, by, 12, ['OPENING TODAY'], '#fff4b0', null, 0);
        for (let i = 0; i <= 14; i++) { const a = Math.PI + (i / 14) * Math.PI, px = bx + Math.cos(a) * 24, h = 2 + Math.sin(-a) * 14; disc(px, by + 6, 1.3, h, ['#e83a5a', '#f2c230', '#2a5cd8', '#30b050', '#f06aa0'][i % 5]); }
        for (let i = 0; i < 12; i++) {
          const t = i / 12, px = x + t * w, py = y + d + 1 + Math.sin(t * Math.PI) * 3;
          const k = kh(10), wv = Math.sin(TIME * 4 + i) * 0.4;
          ctx.beginPath(); ctx.moveTo(sx(px, k), sy(py, k)); ctx.lineTo(sx(px + 2.4, k), sy(py, k)); ctx.lineTo(sx(px + 1.2 + wv, k), sy(py + 2.4, k)); ctx.closePath();
          fillc(['#e83a5a', '#f2c230', '#2a5cd8', '#30b050'][i % 4]);
        }
      }
      // flag poles on the forecourt
      for (let i = 0; i < 3; i++) if (K.flag) K.flag(x + 8 + i * 8, y + d + 8, 0, 18, ['#2a5cd8', '#f2c230', '#e83a5a'][i], 5, 3.4, false);
    },
    shadow(lm, A) {
      if (S.prasads === 'fence') { N.draw.castBox(lm.x - lm.w / 2 + 14, lm.y - lm.d / 2 + 10, lm.w - 30, lm.d - 30, 22); return; }
      N.draw.castBox(lm.x - lm.w / 2 + 10, lm.y - lm.d / 2 + 2, lm.w - 20, lm.d * 0.55, 42);
      N.draw.castBox(lm.x - lm.w / 2, lm.y, lm.w, lm.d / 2 - 2, 24);
    },
    lights(lm, A) {
      if (S.prasads === 'fence') { light(lm, 0, 3, lm.x, lm.y + lm.d / 2 - 8, 18, 26, '#fff0d0', 0.6, false); return; }
      light(lm, 0, 3, lm.x, lm.y + lm.d / 2 + 6, 10, 70, '#bfe8ff', 1);
      light(lm, 1, 3, lm.x - 20, lm.y + 10, 24, 40, '#7ac8ff', 0.7);
      light(lm, 2, 3, lm.x + 20, lm.y + 10, 24, 40, '#7ac8ff', 0.7);
    },
    night(lm, A, a) {
      if (S.prasads === 'fence') return;
      const kr = kh((lm.h || 44) + 0.2), hall = [lm.x - lm.w / 2 + 10, lm.y - lm.d / 2 + 2, lm.w - 20, lm.d * 0.55];
      const X = Math.round(sx(lm.x, kr)), Y = Math.round(sy(hall[1] + hall[3] * 0.62, kr));
      ctx.globalAlpha = a; ctx.fillStyle = '#ff3040'; ctx.fillRect(X - 16, Y - 6, 32, 12); ctx.globalAlpha = 1;
      ptext(lm.x, hall[1] + hall[3] * 0.62, (lm.h || 44) + 0.2, ['PRASADS'], '#ffffff', null, 0);
      glow(lm.x, lm.y + lm.d / 4, 14, 40, '#60c8ff', a * 0.35);
      if (S.prasads === 'opening' && K.bulbs) K.bulbs(lm.x - lm.w / 2, lm.y + lm.d / 2 + 1, 10, lm.x + lm.w / 2, lm.y + lm.d / 2 + 1, 10, 24, '#ffe070', '#ff60a0', 2);
    },
  });

  /* ================================================================ PANJAGUTTA: the mall + multiplex site (2003) */
  // The east corner of the Panjagutta junction, where the city's big mall and its multiplex (later a PVR) opened
  // in Nov 2004: all through 2003 it is a fenced building site. The frame rises with the year (the first slab
  // till May, two floors through the monsoon, three from September); the hoardings face the junction and the
  // Begumpet road (a fictional builder, no brand).
  const mallLevels = () => (T.ymd && T.ymd < 20030601 ? 1 : T.ymd && T.ymd < 20030901 ? 2 : 3);
  reg('mall_site', {
    init(lm) { return { id: lm.id, F: frontOf(lm) }; },
    draw(lm, A) {
      const x = lm.x - lm.w / 2, y = lm.y - lm.d / 2, w = lm.w, d = lm.d, lv = mallLevels();
      // sand and aggregate heaps, the site office and the cement godown by the gate on the lane (south)
      for (const [hx, hy, r, c] of [[x + 12, y + d - 12, 6, '#d8c08a'], [x + 25, y + d - 9, 4.5, '#8a8a84'], [x + w - 12, y + 12, 5, '#d8c08a']]) N.draw.dome(hx, hy, r, 0, 3.5, { fill: c, steps: 4 });
      abox(x + w - 18, y + d - 12, 14, 8, 0, 7, '#2a5cb8', '#3a6ac8');
      abox(x + w - 34, y + d - 11, 12, 7, 0, 5, '#9a9a94', '#b8b8b0');
      // the concrete frame: columns, the slabs poured so far, rebar on the top one
      const fx0 = x + 14, fy0 = y + 12, fw = w - 28, fd = d - 32;
      for (let lev = 0; lev < lv; lev++) {
        const h = 11 + lev * 11, top = lev === lv - 1;
        for (let i = 0; i <= 5; i++) for (let j = 0; j <= 3; j++) pole(fx0 + (fw * i) / 5, fy0 + (fd * j) / 3, h - 11, h, '#a8a49c', 0.9);
        abox(fx0 - 1, fy0 - 1, fw + 2, fd + 2, h - 1, h, '#b8b4ac', top ? 'rgba(184,180,172,0.0)' : '#c4c0b6');
        if (top) {
          hrect(fx0, fy0, fw * 0.6, fd, h, '#c4c0b6');
          const k = kh(h); ctx.strokeStyle = '#7a4a3a'; ctx.lineWidth = 0.4; ctx.beginPath();
          for (let xx = fx0 + fw * 0.6; xx < fx0 + fw; xx += 2) { ctx.moveTo(sx(xx, k), sy(fy0, k)); ctx.lineTo(sx(xx, k), sy(fy0 + fd, k)); }
          ctx.stroke();
        }
      }
      for (let i = 0; i < 7; i++) pole(fx0 - 3 + i * (fw + 6) / 6, fy0 + fd + 3, 0, 11 * lv + 4, '#8a6a3a', 0.35); // bamboo scaffolding
      towerCrane(x + w * 0.64, y + d * 0.32, 62, TIME * 0.045 + 2, 38);
      tinFence(x, y, w, d, 8, true, 0.3);
      // hoarding 1, on the north fence (the Begumpet road): read from above
      const bw = 56, bd = 14, bx = lm.x - bw / 2, by = y + 2;
      pole(bx + 4, by + bd / 2, 0, 18, '#4a4a50', 0.7); pole(bx + bw - 4, by + bd / 2, 0, 18, '#4a4a50', 0.7);
      abox(bx, by, bw, bd, 17, 18.2, '#1a1a2a', '#1a1a2a');
      const k = kh(18.2);
      ptext(lm.x, by + bd * 0.34, 18.2, ['COMING 2004'], '#f2c230', null, 0);
      ptext(lm.x, by + bd * 0.72, 18.2, pw('MALL + MULTIPLEX') < bw * k - 4 ? ['MALL + MULTIPLEX'] : ['MALL'], '#ffffff', null, 0);
      // hoarding 2, on the west fence (the junction): the screens
      const vw = 12, vd = 44, vx = x + 2, vy = lm.y - vd / 2;
      pole(vx + vw / 2, vy + 4, 0, 18, '#4a4a50', 0.7); pole(vx + vw / 2, vy + vd - 4, 0, 18, '#4a4a50', 0.7);
      abox(vx, vy, vw, vd, 17, 18.2, '#c81a1a', '#c81a1a');
      ptext(vx + vw * 0.35, lm.y, 18.2, ['4 SCREENS'], '#ffffff', null, 1);
      ptext(vx + vw * 0.72, lm.y, 18.2, pw('SHOP SPACE') < vd * k - 4 ? ['SHOP SPACE'] : [], '#f2c230', null, 1);
    },
    shadow(lm) {
      const x = lm.x - lm.w / 2, y = lm.y - lm.d / 2;
      N.draw.castBox(x + 14, y + 12, lm.w - 28, lm.d - 32, 11 * mallLevels());
    },
    lights(lm) { light(lm, 0, 1, lm.x - lm.w / 2 + 8, lm.y, 18, 30, '#fff0d0', 0.6, false); },
  });

  /* ================================================================ NUMAISH (exhibition grounds) */
  const STALL_NAMES =['DELHI PAPAD', 'KASHMIR SHAWLS', 'AGRA PETHA', 'PEARLS', 'TOYS', 'BANGLES', 'CROCKERY', 'PICKLES', 'KHADI', 'CARPETS', 'BOOKS', 'DRY FRUITS'];
  reg('numaish_stalls', {
    init(lm) {
      const rng = rngOf(lm, 'ns');
      const A = { id: lm.id, F: frontOf(lm), rng, people: [] };
      const F = A.F, n = Math.max(3, Math.round(F.L / 11));
      A.stalls = [];
      for (let i = 0; i < n; i++) A.stalls.push({ u0: -F.L / 2 + i * F.L / n, u1: -F.L / 2 + (i + 1) * F.L / n - 0.6, name: STALL_NAMES[(i + ((rng.next() * 12) | 0)) % STALL_NAMES.length], col: pickR(rng, ['#c8302a', '#2a5cb8', '#f2c230', '#2a8c82', '#c0306a', '#e86a1a']), goods: (rng.next() * 6) | 0 });
      for (let i = 0; i < 22; i++) A.people.push(person(pickR(rng, ['any', 'woman', 'man', 'kid', 'aunty', 'burqa', 'saree', 'student', 'uncle']), i, fxp(F, (rng.next() - 0.5) * F.L, 4 + rng.next() * 12), fyp(F, (rng.next() - 0.5) * F.L, 4 + rng.next() * 12), rng.next() * TAU, { sway: 0.8, turn: 0.6 }));
      for (const s of A.stalls) A.people.push(person('man', 40 + (s.goods | 0), fxp(F, (s.u0 + s.u1) / 2, 1), fyp(F, (s.u0 + s.u1) / 2, 1), F.ang, { sway: 0.4 }));
      A.count = () => (!S.numaish ? 0 : S.min < 900 ? 4 : S.min > 1350 ? 6 : A.people.length);
      return A;
    },
    draw(lm, A) {
      const F = A.F, D = F.D, open = S.numaish;
      for (const s of A.stalls) {
        const r = frect(F, s.u0, s.u1, -D, 0);
        abox(r[0], r[1], r[2], r[3], 0, 8, open ? '#e8e0d0' : '#a8a8a8', null);
        // roof: striped canvas when open, plain tin when closed
        const top = frect(F, s.u0, s.u1, -D, 2.5);
        abox(top[0], top[1], top[2], top[3], 8, 9, open ? s.col : '#9aa0a6', open ? s.col : '#9aa0a6');
        if (open) {
          const k = kh(9.05); ctx.fillStyle = '#f8f4e8';
          for (let u = s.u0 + 1; u < s.u1; u += 2.4) { const rr = frect(F, u, Math.min(s.u1, u + 1.2), -D, 2.5); ctx.fillRect(sx(rr[0], k), sy(rr[1], k), rr[2] * k, rr[3] * k); }
          // goods on the counter
          const gc = [['#f4f0e0', '#e8e0c8'], ['#c8302a', '#2a5cb8', '#f2c230', '#2a8c82'], ['#f2e8c8', '#e8d0a0'], ['#f8f8f8', '#e8e8f0'], ['#e83a5a', '#2a5cd8', '#30b050'], ['#d8202a', '#e8b020', '#2a9a3a']][s.goods];
          for (let u = s.u0 + 1.4, i = 0; u < s.u1 - 1; u += 1.8, i++) fdisc(F, u, 1.4, 0.75, 3.4, gc[i % gc.length]);
          fbox(F, s.u0 + 0.4, s.u1 - 0.4, 0.4, 2.4, 0, 3, '#7a5a3a', null);
          const kb = kh(9.1);
          const lines = fitLines(s.name, (s.u1 - s.u0) * kb - 1, 1, true);
          if (lines) ptext(fxp(F, (s.u0 + s.u1) / 2, -D * 0.4), fyp(F, (s.u0 + s.u1) / 2, -D * 0.4), 9.1, lines, '#1a1416', null, F.rot);
        } else {
          // shutters down
          const k = kh(4); ctx.strokeStyle = 'rgba(60,60,60,0.5)'; ctx.lineWidth = 0.4;
          ctx.beginPath(); for (let u = s.u0 + 0.5; u < s.u1; u += 1) { mv(fxp(F, u, 0.1), fyp(F, u, 0.1), 0); ln(fxp(F, u, 0.1), fyp(F, u, 0.1), 7.5); } ctx.stroke(); void k;
        }
      }
    },
    shadow(lm) { N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, 9); },
    lights(lm, A) { if (!S.numaish) return; light(lm, 0, 2, fxp(A.F, -A.F.L / 4, 6), fyp(A.F, -A.F.L / 4, 6), 8, 40, '#ffe8a0', 0.9); light(lm, 1, 2, fxp(A.F, A.F.L / 4, 6), fyp(A.F, A.F.L / 4, 6), 8, 40, '#ffe8a0', 0.9); },
    night(lm, A, a) {
      if (!S.numaish || !K.bulbs) return;
      const F = A.F;
      K.bulbs(fxp(F, -F.L / 2, 2.5), fyp(F, -F.L / 2, 2.5), 9, fxp(F, F.L / 2, 2.5), fyp(F, F.L / 2, 2.5), 9, Math.round(F.L / 1.8), '#ffe070', '#ff60a0', 0.5);
      void a;
    },
  });
  reg('numaish_gate', {
    init(lm) { return { F: frontOf(lm) }; },
    draw(lm, A) {
      const open = S.numaish;
      const sol = lm.solids && lm.solids.length >= 2 ? lm.solids : [[lm.x - 6, lm.y - 30, 12, 10], [lm.x - 6, lm.y + 20, 12, 10]];
      const H = lm.h || 34;
      for (const s of sol) {
        abox(s[0], s[1], s[2], s[3], 0, H - 8, '#f2e6c8', '#e8d8b0');
        N.draw.dome(s[0] + s[2] / 2, s[1] + s[3] / 2, Math.min(s[2], s[3]) * 0.45, H - 8, H, { fill: '#e8a020', steps: 5, finial: 3 });
      }
      // the arch beam between the towers
      const a0 = sol[0], a1 = sol[1];
      const ax = Math.min(a0[0], a1[0]), ay = a0[1] + a0[3], aw = Math.max(a0[2], a1[2]), ad = a1[1] - ay;
      abox(ax, ay, aw, ad, H - 13, H - 6, open ? '#c8202a' : '#a87a6a', open ? '#d8302a' : '#b88a7a');
      ptext(ax + aw / 2, ay + ad / 2, H - 6, ['NUMAISH'], '#fff4b0', null, ad > aw ? 1 : 0);
    },
    shadow(lm) { N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, (lm.h || 34) * 0.7); },
    lights(lm) { if (S.numaish) light(lm, 0, 1, lm.x + 10, lm.y, 20, 50, '#ffe070', 1); },
    night(lm, A, a) {
      if (!S.numaish || !K.bulbRect) return;
      const H = lm.h || 34;
      K.bulbRect(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, H - 6, 3, '#ffe070', '#60ff90');
      K.bulbRect(lm.x - lm.w / 2 - 1, lm.y - lm.d / 2 - 1, lm.w + 2, lm.d + 2, H - 13, 3.5, '#ff60a0', '#ffe070');
      void a;
    },
  });
  const wheel = { a: 0 };
  reg('giant_wheel', {
    init(lm) { const long = lm.w >= lm.d; return { R: 26, hub: (lm.h || 70) - 30, ax: long ? 1 : 0, ay: long ? 0 : 1, tilt: 0.85 }; },
    draw(lm, A) {
      const R0 = A.R, hub = A.hub, ax = A.ax, ay = A.ay; // wheel plane: along (ax, ay) + up, tilted back
      const bx = -ay, by = ax; // the lean direction (back)
      const ct = Math.cos(A.tilt), st = Math.sin(A.tilt);
      const P = (ang, r) => { const c = Math.cos(ang) * r, s = Math.sin(ang) * r; return [lm.x + ax * c - bx * s * st, lm.y + ay * c - by * s * st, hub + s * ct]; };
      // A-frame legs from the base to the hub
      for (const sd of [-1, 1]) for (const lg of [-1, 1]) seg3(lm.x + ax * lg * 14 + bx * sd * 5, lm.y + ay * lg * 14 + by * sd * 5, 0, lm.x + bx * sd * 2, lm.y + by * sd * 2, hub, '#7a8088', 1);
      const rot = wheel.a;
      // spokes + rim
      ctx.beginPath();
      const n = 16;
      for (let i = 0; i < n; i++) { const p = P(rot + (i / n) * TAU, R0); mv(lm.x, lm.y, hub); ln(p[0], p[1], p[2]); }
      ctx.strokeStyle = '#c8ccd2'; ctx.lineWidth = Math.max(0.4, 0.35 * Z); ctx.stroke();
      for (const rr of [R0, R0 * 0.94]) {
        ctx.beginPath();
        for (let i = 0; i <= 32; i++) { const p = P(rot + (i / 32) * TAU, rr); if (i) ln(p[0], p[1], p[2]); else mv(p[0], p[1], p[2]); }
        ctx.strokeStyle = rr === R0 ? '#e8303a' : '#f2c230'; ctx.lineWidth = Math.max(0.8, 0.8 * Z); ctx.stroke();
      }
      // gondolas hanging from the rim (always upright)
      const gc = ['#e83a5a', '#2a5cd8', '#f2c230', '#30b050'];
      for (let i = 0; i < 8; i++) {
        const p = P(rot + (i / 8) * TAU, R0);
        obox(p[0], p[1], ax, ay, 2, 1.6, p[2] - 4, p[2] - 1, gc[i % 4], sh(gc[i % 4], 1.15));
      }
      cyl(lm.x, lm.y, 2, hub - 1, hub + 1, '#5a5e64', '#7a7e84');
      // ticket booth at the foot
      abox(lm.x + ax * 16 - 3, lm.y + ay * 16 + 4, 6, 5, 0, 7, '#f2c230', '#c8202a');
    },
    shadow(lm, A) { N.draw.castCircle(lm.x, lm.y, A.R * 0.9, A.hub); },
    lights(lm, A) { if (S.numaish) light(lm, 0, 1, lm.x, lm.y, A.hub, 60, '#ff80c0', 0.9); },
    night(lm, A, a) {
      if (!S.numaish) return;
      const R0 = A.R, hub = A.hub, ax = A.ax, ay = A.ay, bx = -ay, by = ax, ct = Math.cos(A.tilt), st = Math.sin(A.tilt);
      for (let pass = 0; pass < 3; pass++) {
        ctx.beginPath();
        for (let i = pass; i < 48; i += 3) {
          const ang = wheel.a + (i / 48) * TAU, c = Math.cos(ang) * R0, s = Math.sin(ang) * R0;
          const k = kh(hub + s * ct);
          ctx.rect(Math.round(sx(lm.x + ax * c - bx * s * st, k)) - 1, Math.round(sy(lm.y + ay * c - by * s * st, k)) - 1, 2, 2);
        }
        ctx.globalAlpha = a * (0.7 + 0.3 * Math.sin(TIME * 4 + pass * 2)); fillc(['#ff4060', '#ffe040', '#40e0ff'][pass]);
      }
      ctx.globalAlpha = 1;
    },
  });
  const mautBike = { a: 0 };
  reg('maut_ka_kuan', {
    init(lm) {
      const rng = rngOf(lm, 'mk');
      const A = { r: Math.min(lm.w, lm.d) * 0.45, H: lm.h || 22, people: [] };
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; A.people.push(person(pickR(rng, ['man', 'kid', 'woman', 'student', 'uncle']), i, lm.x + Math.cos(a) * (A.r + 4), lm.y + Math.sin(a) * (A.r + 4), a + Math.PI, { sway: 0.6, turn: 0.3 })); }
      A.count = () => (S.numaish && S.min > 960 ? A.people.length : S.numaish ? 5 : 0);
      return A;
    },
    draw(lm, A) {
      const x = lm.x, y = lm.y, r = A.r, H = A.H;
      // the wooden drum: outer wall, dark floor, inner wall seen over the rim
      cyl(x, y, r, 0, H, '#8a5a32', false);
      const k1 = kh(H), k0 = kh(0.5);
      ctx.beginPath(); ctx.arc(sx(x, k1), sy(y, k1), r * k1, 0, TAU); fillc('#6a4224');
      ctx.beginPath(); ctx.arc(sx(x, k0), sy(y, k0), (r - 0.6) * k0, 0, TAU); fillc('#3a2a20');
      // planks (rings) on the inside
      for (let h = 4; h < H; h += 4) { const k = kh(h); ctx.beginPath(); ctx.arc(sx(x, k), sy(y, k), (r - 0.4) * k, 0, TAU); ctx.strokeStyle = 'rgba(40,24,12,0.45)'; ctx.lineWidth = 0.5; ctx.stroke(); }
      // the motorbike riding the wall
      if (S.numaish) {
        const a = mautBike.a, bh = 6 + Math.sin(a * 0.5) * 3;
        const px = x + Math.cos(a) * (r - 1.6), py = y + Math.sin(a) * (r - 1.6);
        obox(px, py, -Math.sin(a), Math.cos(a), 2.6, 0.8, bh - 1, bh + 1, '#c8202a', '#2a2a2a');
      }
      // the spectators' gallery ring
      ring(x, y, r + 1.4, H + 1.5, '#5a3a20', 1.2);
      ring(x, y, r + 2.6, H + 3, '#8a8a8a', 0.4);
      // a painted banner
      abox(x - 12, y + r + 1, 24, 2, H - 4, H + 2, '#1a1a2a', '#c8202a');
      ptext(x, y + r + 2, H + 2, ['MAUT KA KUAN'], '#f2c230', null, 0);
    },
    shadow(lm, A) { N.draw.castCircle(lm.x, lm.y, A.r, A.H); },
    lights(lm, A) { if (S.numaish) light(lm, 0, 1, lm.x, lm.y, A.H, 40, '#ffe8a0', 0.9); },
  });

  /* ================================================================ CIVIC BUILDINGS (generic recipe) */
  function regCivic(drawId, cfg) {
    reg(drawId, {
      init(lm) {
        const c = typeof cfg === 'function' ? cfg(lm) : cfg;
        const A = baseState(lm, { wall: c.wall, walls: c.walls, roof: c.roof, trim: c.trim, acc: c.acc, front: c.front || FAC.office, side: c.side || FAC.office, win: c.win || '#3a4048', litCol: c.litCol || '#fff0c8', roofPlan: c.roofPlan || { line: false, cot: false } });
        A.c = c;
        if (c.sign !== false) planSign(A, lm.sign || c.text || (lm.name || '').toUpperCase(), (c.signCol || ['#2a4a7a'])[0], (c.signCol || [0, '#fff8e0'])[1], c.icon || null, { over: 2, lift: c.lift || 3.6 });
        A.people = [];
        if (c.people) c.people(lm, A, A.rng, (k, i, u, v, a, o) => A.people.push(person(k, i, fxp(A.F, u, v), fyp(A.F, u, v), a, o)));
        if (c.init) c.init(lm, A);
        A.count = c.count || (() => (S.min < 480 || S.min > 1260 ? 0 : A.people.length));
        if (!A.people.length) delete A.people;
        return A;
      },
      draw(lm, A) {
        const front = camFront(A.F);
        if (!front && A.c.yard) A.c.yard(lm, A);
        if (A.c.body) A.c.body(lm, A); else building(A);
        if (A.c.roof3) A.c.roof3(lm, A);
        if (A.sign) drawSign(A, A.signH || A.h, 0);
        if (front && A.c.yard) A.c.yard(lm, A);
      },
      shadow(lm, A) { if (A.c.shadow) A.c.shadow(lm, A); else castMain(A); },
      lights(lm, A) { light(lm, 0, 2, fxp(A.F, 0, 6), fyp(A.F, 0, 6), 8, Math.min(60, 20 + A.F.L * 0.4), A.c.glow || '#ffe0a0', 0.8); if (A.c.lights) A.c.lights(lm, A); },
      night(lm, A, a) { nightSign(A, A.signH || A.h, a); if (A.c.night) A.c.night(lm, A, a); },
      ground: cfg.ground,
    });
  }
  function postBox(x, y) { cyl(x, y, 1.3, 0, 4.6, '#c8202a', '#a81a1a'); N.draw.dome(x, y, 1.4, 4.6, 5.6, { fill: '#c8202a', steps: 3 }); }
  function ambulance(x, y, a) {
    const ca = Math.cos(a), sa = Math.sin(a);
    obox(x, y, ca, sa, 9, 4, 0.8, 9, '#f4f4f0', '#f8f8f4');
    obox(x + ca * 2, y + sa * 2, ca, sa, 4, 4.1, 6.5, 7.2, '#d8202a', '#d8202a');
    disc(x + ca * 5, y + sa * 5, 0.8, 9.2, '#3a7ad8');
  }
  function flagPole(x, y, h, col) { if (K.flag) K.flag(x, y, 0, h, col, 5, 3.4, false); }

  regCivic('gpo', {
    wall: '#dcb884', roof: '#cdb08a', trim: '#f4e4c4', acc: '#8a3a1a', front: FAC.office, text: 'GENERAL POST OFFICE', signCol: ['#8a1a1a', '#fff4d8'],
    roof3(lm, A) { // central clock tower with a small dome
      const x = A.rr.x + A.rr.w / 2, y = A.rr.y + A.rr.d / 2;
      abox(x - 6, y - 6, 12, 12, A.h, A.h + 12, '#d8b080', '#cdb08a');
      N.draw.dome(x, y, 5.5, A.h + 12, A.h + 19, { fill: '#e8d0a0', finial: 3 });
    },
    yard(lm, A) { const F = A.F; postBox(fxp(F, -F.L / 2 + 4, 4), fyp(F, -F.L / 2 + 4, 4)); postBox(fxp(F, F.L / 2 - 4, 4), fyp(F, F.L / 2 - 4, 4)); flagPole(fxp(F, 0, 5), fyp(F, 0, 5), 24, '#f08a24'); },
    people(lm, A, rng, add) { for (let i = 0; i < 5; i++) add(pickR(rng, ['man', 'uncle', 'aunty', 'student']), i * 5, (rng.next() - 0.5) * A.F.L * 0.8, 2 + rng.next() * 5, A.F.ang + Math.PI, { sway: 0.5, turn: 0.4 }); },
  });
  regCivic('hospital', (lm) => ({
    wall: lm.id === 'apollo_hospital_jubilee_hills' ? '#e8eef2' : '#f2f2ec', roof: '#d8dcd8', trim: '#ffffff', acc: '#2a8c5a', text: lm.sign || (lm.name || '').toUpperCase().replace(/,.*$/, ''), signCol: ['#1f7a4a', '#ffffff'], icon: 'cross', glow: '#e8fff4',
    yard(lm, A) { const F = A.F; ambulance(fxp(F, F.L / 2 - 10, 6), fyp(F, F.L / 2 - 10, 6), F.ang + Math.PI / 2); },
    people(lm, A, rng, add) { for (let i = 0; i < 6; i++) add(pickR(rng, ['man', 'aunty', 'uncle', 'woman', 'burqa', 'saree']), i * 3, (rng.next() - 0.5) * A.F.L * 0.6, 2 + rng.next() * 6, A.F.ang + Math.PI + (rng.next() - 0.5), { sway: 0.4, turn: 0.3 }); },
    count() { return 6; },
  }));
  regCivic('college', (lm) => lm.id === 'city_college' ? {
    wall: '#cfae80', roof: '#c4a478', trim: '#efe0c0', acc: '#7a3a1a', text: 'GOVT CITY COLLEGE', signCol: ['#7a3a1a', '#fff4d8'], icon: 'book',
    roof3(lm, A) { // Qutb Shahi style domes on the corners + the centre
      const r = A.rr, h = A.h;
      N.draw.dome(r.x + r.w / 2, r.y + r.d / 2, 9, h, h + 13, { fill: '#e8d8b8', finial: 3 });
      for (const [cx0, cy0] of [[r.x + 7, r.y + 7], [r.x + r.w - 7, r.y + 7], [r.x + 7, r.y + r.d - 7], [r.x + r.w - 7, r.y + r.d - 7]]) { if (K.chhatri) K.chhatri(cx0, cy0, 4.5, h, h + 9, '#e8d8b8', '#d8c4a0'); }
    },
    people(lm, A, rng, add) { for (let i = 0; i < 8; i++) add('student', i * 3, (rng.next() - 0.5) * A.F.L * 0.8, 2 + rng.next() * 6, rng.next() * TAU, { sway: 0.6, turn: 0.5 }); },
  } : {
    wall: '#e4dccc', roof: '#cfc8b8', trim: '#f4f0e8', acc: '#2a4a8a', text: 'JNTU', signCol: ['#2a4a8a', '#fff8e0'], icon: 'book',
    people(lm, A, rng, add) { for (let i = 0; i < 8; i++) add('student', i * 3, (rng.next() - 0.5) * A.F.L * 0.8, 2 + rng.next() * 6, rng.next() * TAU, { sway: 0.6, turn: 0.5 }); },
  });
  regCivic('library', {
    wall: '#e8dcc0', roof: '#d0c4a8', acc: '#7a2a2a', text: 'CITY CENTRAL LIBRARY', signCol: ['#5a2a1a', '#fff4d8'], icon: 'book',
    yard(lm, A) { const F = A.F; for (let i = 0; i < 5; i++) cycleProp(fxp(F, -F.L / 2 + 4 + i * 3, 4), fyp(F, -F.L / 2 + 4 + i * 3, 4), F.ang + Math.PI + 0.2, ['#1a1a1e', '#2a5cb8', '#8a2a2a'][i % 3], 2.2); },
    people(lm, A, rng, add) { for (let i = 0; i < 3; i++) add(pickR(rng, ['student', 'uncle', 'man']), i * 7, 4 + i * 3, 3 + rng.next() * 2, A.F.ang + Math.PI, { sway: 0.3 }); },
  });
  regCivic('auditorium', {
    wall: '#e8e2d4', roof: '#d4cec0', acc: '#7a1a2a', front: FAC.glass, side: FAC.hall, text: 'RAVINDRA BHARATHI', signCol: ['#7a1a2a', '#fff4d8'],
    roof3(lm, A) { // fly tower over the stage at the back
      const F = A.F, r = frect(F, -F.L * 0.3, F.L * 0.3, -F.D + 2, -F.D * 0.45);
      abox(r[0], r[1], r[2], r[3], A.h, A.h + 12, sh(A.wall, 0.95), '#c8c2b4');
    },
    yard(lm, A) { const F = A.F; for (let i = 0; i < 4; i++) flagPole(fxp(F, -12 + i * 8, 5), fyp(F, -12 + i * 8, 5), 18, ['#f08a24', '#2a8a3a', '#2a5cd8', '#c8202a'][i]); },
    people(lm, A, rng, add) { for (let i = 0; i < 8; i++) add(pickR(rng, ['woman', 'man', 'saree', 'uncle', 'student']), i * 3, (rng.next() - 0.5) * A.F.L * 0.7, 2 + rng.next() * 6, A.F.ang + Math.PI, { sway: 0.5, turn: 0.4 }); },
    count() { return S.min > 1050 && S.min < 1290 ? 8 : 2; },
  });
  regCivic('ashram', {
    wall: '#f0e2c4', roof: '#e0cca4', trim: '#fff4e0', acc: '#e07a1a', front: FAC.plain, text: 'RAMAKRISHNA MATH', signCol: ['#c8601a', '#fff8e8'],
    roof3(lm, A) {
      const r = A.rr;
      if (K.shikhara) K.shikhara(r.x + r.w / 2, r.y + r.d / 2, 8, A.h, A.h + 16, '#f0dcb0', 6, true); else N.draw.dome(r.x + r.w / 2, r.y + r.d / 2, 7, A.h, A.h + 12, { fill: '#f0dcb0', finial: 3 });
      if (K.flag) K.flag(r.x + r.w / 2 + 9, r.y + r.d / 2, A.h, A.h + 14, '#f07a10', 5, 3.4, true);
    },
    yard(lm, A) { const F = A.F; for (let i = 0; i < 6; i++) fdisc(F, -F.L / 2 + 5 + i * (F.L - 10) / 5, 4, 1.8, 0.6, i % 2 ? '#3a8a3a' : '#e8a020'); },
    people(lm, A, rng, add) { add('man', 5, -4, 3, A.F.ang + Math.PI, { sway: 0.2, look: { shirt: '#f07a10', pants: '#f07a10' } }); add('student', 6, 4, 4, A.F.ang + Math.PI, { sway: 0.3 }); },
  });
  regCivic('bal_bhavan', {
    wall: '#f2d070', roof: '#e8c860', trim: '#ffffff', acc: '#e83a5a', front: FAC.plain, text: 'JAWAHAR BAL BHAVAN', signCol: ['#2a5cd8', '#fff8e0'],
    init(lm, A) { A.roofItems.push({ t: 'plants', x: A.rr.x + 3, y: A.rr.y + 3, n: 8 }); },
    roof3(lm, A) { // painted murals: coloured bands round the parapet
      const r = A.rr, cols = ['#e83a5a', '#2a5cd8', '#30b050', '#f08a24'];
      for (let i = 0; i < 4; i++) { const t = i / 4; abox(r.x + t * r.w, r.y - 0.2, r.w / 4, 1.4, A.h - 3, A.h + 0.4, cols[i], cols[i]); }
    },
    yard(lm, A) { const F = A.F; swingSet(fxp(F, -F.L / 2 + 10, 6), fyp(F, -F.L / 2 + 10, 6), F.ax, F.ay, 12, 10, 1, 2); slide(fxp(F, F.L / 2 - 8, 6), fyp(F, F.L / 2 - 8, 6), F.ax, F.ay, 7); },
    people(lm, A, rng, add) { for (let i = 0; i < 8; i++) add('kid', i * 2, (rng.next() - 0.5) * A.F.L * 0.8, 3 + rng.next() * 6, rng.next() * TAU, { sway: 1, sp: 2.2, turn: 0.6 }); },
  });
  function lattice(x, y, w0, w1, h0, h1, col, bands) {
    // tapering 4-legged lattice tower
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [a, b] of c) seg3(x + a * w0, y + b * w0, h0, x + a * w1, y + b * w1, h1, col, 0.7);
    const n = Math.max(3, Math.round((h1 - h0) / 8));
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, ha = h0 + (h1 - h0) * t0, hb = h0 + (h1 - h0) * t1, wa = w0 + (w1 - w0) * t0, wb = w0 + (w1 - w0) * t1;
      for (let s = 0; s < 4; s++) { const p = c[s], q = c[(s + 1) % 4]; mv(x + p[0] * wa, y + p[1] * wa, ha); ln(x + q[0] * wb, y + q[1] * wb, hb); }
    }
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.5, 0.45 * Z); ctx.stroke();
    // platforms (seen from above as nested squares) with red-and-white bands between them
    const nb = bands ? 6 : 3;
    for (let i = 1; i <= nb; i++) {
      const t = i / (nb + 1), hh = h0 + (h1 - h0) * t, ww = w0 + (w1 - w0) * t + (bands && i % 2 ? 1.6 : 0.6);
      const k = kh(hh), X0 = sx(x - ww, k), Y0 = sy(y - ww, k), S0 = ww * 2 * k;
      ctx.fillStyle = bands ? (i % 2 ? '#d8302a' : '#f4f2ea') : '#8a8e94';
      ctx.fillRect(X0, Y0, S0, S0);
      ctx.fillStyle = 'rgba(30,30,40,0.35)'; ctx.fillRect(X0 + S0 * 0.25, Y0 + S0 * 0.25, S0 * 0.5, S0 * 0.5);
    }
    disc(x, y, Math.max(0.8, w1 * 1.2), h1, '#d8302a');
  }
  regCivic('radio_station', {
    wall: '#e8e4d8', roof: '#d0ccc0', acc: '#2a4a7a', text: 'ALL INDIA RADIO', signCol: ['#2a3a6a', '#fff8e0'],
    init(lm, A) { A.mast = [fxp(A.F, A.F.L / 2 - 6, -A.F.D + 6), fyp(A.F, A.F.L / 2 - 6, -A.F.D + 6)]; },
    roof3(lm, A) { lattice(A.mast[0], A.mast[1], 3, 0.7, A.h, A.h + 46, '#a83028', true); },
    shadow(lm, A) { castMain(A); N.draw.castPole(A.mast[0], A.mast[1], A.h + 46, 2); },
    lights(lm, A) { light(lm, 1, 2, A.mast[0], A.mast[1], A.h + 46, 8, '#ff2020', Math.sin(TIME * 3) > 0 ? 1 : 0.2); },
  });
  reg('tv_tower', {
    init(lm) { return { F: frontOf(lm) }; },
    draw(lm) {
      const x = lm.x, y = lm.y, H = lm.h || 120;
      abox(x - lm.w / 2, y - lm.d / 2, lm.w, lm.d, 0, 10, '#e4e0d4', '#cfcabc');
      lattice(x, y, lm.w * 0.3, 1.2, 10, H, '#6a6e76', true);
      ptext(x, y + lm.d / 2 - 3, 10, ['DOORDARSHAN'], '#2a3a6a', null, 0);
    },
    shadow(lm) { N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, 10); N.draw.castPole(lm.x, lm.y, (lm.h || 120) * 0.9, 4); },
    lights(lm) { light(lm, 0, 1, lm.x, lm.y, lm.h || 120, 10, '#ff2020', Math.sin(TIME * 2.6) > 0 ? 1 : 0.15); },
    night(lm, A, a) { glow(lm.x, lm.y, lm.h || 120, 6, '#ff2020', a * (Math.sin(TIME * 2.6) > 0 ? 1 : 0.2)); glow(lm.x, lm.y, (lm.h || 120) * 0.7, 4, '#ff2020', a * (Math.sin(TIME * 2.6 + 1) > 0 ? 1 : 0.2)); },
  });
  reg('stadium', {
    init(lm) { return { rx: lm.w / 2, ry: lm.d / 2 }; },
    draw(lm, A) {
      const x = lm.x, y = lm.y, rx = A.rx, ry = A.ry, H = lm.h || 30;
      // the bowl: outer wall, tiered stands (rings), the pitch
      const n = 28, outer = [], inner = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; outer.push([x + Math.cos(a) * rx, y + Math.sin(a) * ry]); inner.push([x + Math.cos(a) * rx * 0.62, y + Math.sin(a) * ry * 0.62]); }
      if (K.prism) K.prism(A._o || (A._o = outer), 0, H, { wall: '#c8c4bc', roof: false });
      for (let t = 0; t < 5; t++) {
        const f = 0.98 - t * 0.08, h = H - t * 5;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; if (i) ln(x + Math.cos(a) * rx * f, y + Math.sin(a) * ry * f, h); else mv(x + Math.cos(a) * rx * f, y + Math.sin(a) * ry * f, h); }
        ctx.closePath(); fillc(t % 2 ? '#a8a4a0' : '#bcb8b2');
      }
      ctx.beginPath(); for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; if (i) ln(x + Math.cos(a) * rx * 0.62, y + Math.sin(a) * ry * 0.62, 0.3); else mv(x + Math.cos(a) * rx * 0.62, y + Math.sin(a) * ry * 0.62, 0.3); } ctx.closePath(); fillc('#4f9a3a');
      ctx.beginPath(); for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; if (i) ln(x + Math.cos(a) * rx * 0.5, y + Math.sin(a) * ry * 0.5, 0.35); else mv(x + Math.cos(a) * rx * 0.5, y + Math.sin(a) * ry * 0.5, 0.35); } ctx.closePath(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.8; ctx.stroke();
      // canopy roof over the main stand + floodlight masts
      quad3(x - rx * 0.6, y - ry, H + 8, x + rx * 0.6, y - ry, H + 8, x + rx * 0.5, y - ry * 0.7, H + 4, x - rx * 0.5, y - ry * 0.7, H + 4); fillc('#e8ecf0');
      for (const [fx0, fy0] of [[x - rx * 0.8, y - ry * 0.8], [x + rx * 0.8, y - ry * 0.8], [x + rx * 0.8, y + ry * 0.8], [x - rx * 0.8, y + ry * 0.8]]) { pole(fx0, fy0, 0, H + 26, '#8a8e94', 1); abox(fx0 - 4, fy0 - 2, 8, 4, H + 24, H + 28, '#5a5e64', '#f4f4e0'); }
      void inner;
    },
    shadow(lm, A) { N.draw.castCircle(lm.x, lm.y, Math.min(A.rx, A.ry), (lm.h || 30) * 0.6); },
    lights(lm, A) { const H = lm.h || 30; let i = 0; for (const [fx0, fy0] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) light(lm, i++, 4, lm.x + fx0 * A.rx * 0.8, lm.y + fy0 * A.ry * 0.8, H + 26, 90, '#f4fbff', 0.7, false); },
  });
  regCivic('market_hall', (lm) => {
    if (lm.id === 'chenoy_trade_centre') return { wall: '#e8e8e4', roof: '#d0d0cc', acc: '#2a5cd8', front: FAC.glass, text: 'CHENOY TRADE CENTRE', signCol: ['#1a2a6a', '#f2c230'], people(lm, A, rng, add) { for (let i = 0; i < 8; i++) add(pickR(rng, ['woman', 'man', 'student', 'any']), i * 3, (rng.next() - 0.5) * A.F.L * 0.8, 2 + rng.next() * 6, rng.next() * TAU, { sway: 0.5, turn: 0.4 }); } };
    if (lm.variant === 'fruit' || lm.id === 'gaddiannaram_fruit_market') return { wall: '#d8d0c0', roof: '#a8b0b4', acc: '#2a7a3a', front: FAC.blank, side: FAC.blank, text: 'FRUIT MARKET', signCol: ['#2a7a3a', '#fff8d8'],
      body(lm, A) { // open sheds with crates of mangoes, bananas, papayas
        const r = A.rr;
        for (let i = 0; i < 3; i++) {
          const y0 = r.y + 4 + i * (r.d - 8) / 3, dd = (r.d - 8) / 3 - 4;
          const img = loadImg('fruit:' + lm.id + i, r.w / 2 - 4, dd / 2, (g, hl, hw, rng) => { g.setTransform(LOAD_RES, 0, 0, LOAD_RES, 1, 1); g.fillStyle = '#8a6a4a'; g.fillRect(0, 0, hl * 2, hw * 2); for (let j = 0; j < hl * 2 / 4; j++) { const c = ['#f2c230', '#f08a24', '#8ab03a', '#e8a020', '#c8302a'][(rng.next() * 5) | 0]; g.fillStyle = '#b8905a'; g.fillRect(j * 4 + 0.3, 0.6, 3.4, hw * 2 - 1.2); for (let q = 0; q < 10; q++) { g.fillStyle = c; g.beginPath(); g.arc(j * 4 + 0.9 + (q % 3) * 1.1, 1.4 + Math.floor(q / 3) * 1.4, 0.6, 0, TAU); g.fill(); } } });
          abox(r.x + 4, y0, r.w - 8, dd, 0, 2, '#7a5a3a', null);
          plane(2.05); ctx.imageSmoothingEnabled = true; ctx.drawImage(img, r.x + 4, y0, r.w - 8, dd); ctx.imageSmoothingEnabled = false; ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        ctx.globalAlpha = under(r.x, r.y, r.w, r.d) ? 0.3 : 0.92;
        for (let i = 0; i < 2; i++) vault(r.x + 2, r.y + 2 + i * (r.d / 2), r.w - 4, r.d / 2 - 4, A.h - 4, A.h, 'x', '#a8b0b4');
        ctx.globalAlpha = 1;
      },
      people(lm, A, rng, add) { for (let i = 0; i < 12; i++) add(pickR(rng, ['lungi', 'man', 'uncle', 'aunty']), i * 3, (rng.next() - 0.5) * A.F.L * 0.8, 2 + rng.next() * 6, rng.next() * TAU, { sway: 0.6, turn: 0.4 }); },
      count() { return S.min < 300 || S.min > 1140 ? 2 : 12; } };
    if (lm.id === 'murgi_chowk') return { wall: '#c8bca8', roof: '#b8ac98', acc: '#6a3a2a', front: FAC.shop, text: 'MURGI CHOWK', signCol: ['#6a3a2a', '#fff4d8'], icon: 'hen',
      roof3(lm, A) { const r = A.rr; for (let i = 0; i < 4; i++) N.draw.dome(r.x + 6 + i * (r.w - 12) / 3, r.y + 5, 2.6, A.h, A.h + 4, { fill: '#d8ccb8' }); },
      people(lm, A, rng, add) { for (let i = 0; i < 8; i++) add(pickR(rng, ['man', 'burqa', 'uncle', 'man']), i * 3, (rng.next() - 0.5) * A.F.L * 0.8, 2 + rng.next() * 6, rng.next() * TAU, { sway: 0.5, turn: 0.4 }); } };
    return { wall: '#d8c8a8', roof: '#b8604a', acc: '#6a3a2a', front: FAC.cafe, side: FAC.cafe, text: 'MONDA MARKET', signCol: ['#6a3a2a', '#fff4d8'],
      init(lm, A) { A.roofTiles = 'x'; A.roofItems = []; A.r3 = {}; },
      roof3(lm, A) { const r = A.rr; abox(r.x + r.w / 2 - 6, r.y + r.d / 2 - 6, 12, 12, A.h, A.h + 10, '#d8c8a8', '#c8b898'); },
      people(lm, A, rng, add) { for (let i = 0; i < 12; i++) add(pickR(rng, ['woman', 'man', 'aunty', 'saree', 'uncle']), i * 3, (rng.next() - 0.5) * A.F.L * 0.8, 2 + rng.next() * 6, rng.next() * TAU, { sway: 0.6, turn: 0.4 }); } };
  });
  regCivic('film_studio', (lm) => ({
    wall: '#b8bcc0', roof: '#a8acb0', acc: '#2a2a3a', front: FAC.blank, side: FAC.hall, text: (lm.name || 'STUDIOS').toUpperCase().replace(/,.*$/, ''), signCol: ['#1a1a2a', '#f2c230'], icon: 'film',
    body(lm, A) { // two tall sound stages behind the gate
      const F = A.F;
      const s1 = frect(F, -F.L / 2 + 2, -2, -F.D + 2, -10).slice(), s2 = frect(F, 2, F.L / 2 - 2, -F.D + 2, -10).slice();
      const st = A.st;
      if (K.box) { K.box(s1[0], s1[1], s1[2], s1[3], 0, A.h, st); K.box(s2[0], s2[1], s2[2], s2[3], 0, A.h - 4, st); }
      ptext(s1[0] + s1[2] / 2, s1[1] + s1[3] / 2, A.h, ['FLOOR 1'], '#f4f0e0', null, 0);
      ptext(s2[0] + s2[2] / 2, s2[1] + s2[3] / 2, A.h - 4, ['FLOOR 2'], '#f4f0e0', null, 0);
    },
    init(lm, A) { A.signH = 8; A.sign.vF = 2; A.sign.lift = 2; },
    yard(lm, A) {
      const F = A.F;
      gateArch(F, 0, 2, 22, 11, '#1a1a2a', null);
      // a vintage prop car and the SHOOTING IN PROGRESS board
      obox(fxp(F, -F.L / 2 + 12, -4), fyp(F, -F.L / 2 + 12, -4), F.ax, F.ay, 7, 3.2, 1, 5, '#2a2a2a', '#3a3a3a');
      fbox(F, F.L / 2 - 14, F.L / 2 - 4, 4, 5, 0, 6, '#c8202a', '#e8302a');
      ptext(fxp(F, F.L / 2 - 9, 4.5), fyp(F, F.L / 2 - 9, 4.5), 6, ['SILENCE'], '#fff4d8', null, F.rot);
    },
    people(lm, A, rng, add) { add('police', 1, 6, 3, A.F.ang + Math.PI, { sway: 0.2 }); for (let i = 0; i < 4; i++) add(pickR(rng, ['man', 'woman', 'student']), i * 3, -10 + i * 4, 6 + rng.next() * 2, A.F.ang + Math.PI, { sway: 0.6 }); },
  }));
  regCivic('club_house', {
    wall: '#f2ece0', roof: '#b0583a', trim: '#ffffff', acc: '#2a4a2a', front: FAC.cafe, side: FAC.cafe, text: 'SECUNDERABAD CLUB', signCol: ['#1f3a2a', '#f4e8c0'],
    init(lm, A) { A.r3 = {}; A.signH = A.h - 6; },
    body(lm, A) {
      const r = A.rr;
      if (K.box) K.box(r.x, r.y, r.w, r.d, 0, A.h - 8, A.st, null, true);
      if (K.hip) K.hip(r.x - 1.5, r.y - 1.5, r.w + 3, r.d + 3, A.h - 8, A.h + 4, '#b0583a'); else if (K.pyramid) K.pyramid(r.x - 1.5, r.y - 1.5, r.w + 3, r.d + 3, A.h - 8, A.h + 4, '#b0583a');
    },
    yard(lm, A) { const F = A.F; gateArch(F, 0, 8, 14, 8, '#2a3a2a', null); seg3(fxp(F, -7, 8), fyp(F, -7, 8), 3, fxp(F, 7, 8), fyp(F, 7, 8), 3, '#1a1a1a', 1.2); },
    count() { return 0; },
  });
  regCivic('coaching_centre', {
    walls: ['#e8e4dc', '#dcdcd4'], roof: '#cfcac0', acc: '#2a5cd8', front: FAC.office, signCol: ['#1a3aa8', '#ffffff'], icon: 'crt',
    roof3(lm, A) { // vinyl banners plastered all over the front and the roof edge
      const F = A.F, cols = ['#e8302a', '#2a5cd8', '#f2c230', '#30b050', '#7a2ac8', '#f08a24'];
      for (let i = 0; i < 6; i++) {
        const u0 = -F.L / 2 + 1 + i * (F.L - 2) / 6, u1 = u0 + (F.L - 2) / 6 - 0.8, hh = A.h - 6 - (i % 2) * 8;
        quad3(fxp(F, u0, 0.4), fyp(F, u0, 0.4), hh, fxp(F, u1, 0.4), fyp(F, u1, 0.4), hh, fxp(F, u1, 0.6), fyp(F, u1, 0.6), hh - 6, fxp(F, u0, 0.6), fyp(F, u0, 0.6), hh - 6);
        fillc(cols[i]);
      }
      const r = A.rr, txt = ['ORACLE', 'JAVA', 'C++', 'VB'];
      for (let i = 0; i < 4; i++) { const x = r.x + 6 + i * (r.w - 12) / 3, y = r.y + r.d * 0.45; abox(x - 6, y - 3, 12, 6, A.h, A.h + 4, '#1a1a2a', cols[i]); ptext(x, y, A.h + 4, [txt[i]], '#ffffff', null, 0); }
    },
    people(lm, A, rng, add) { for (let i = 0; i < 10; i++) add('student', i * 3, (rng.next() - 0.5) * A.F.L * 0.8, 2 + rng.next() * 7, rng.next() * TAU, { sway: 0.6, turn: 0.5 }); },
    count() { return S.min > 420 && S.min < 1290 ? 10 : 0; },
  });
  regCivic('department_store', {
    wall: '#e8e8ec', roof: '#d4d4d8', acc: '#c8202a', front: FAC.glass, side: FAC.office, signCol: ['#c8202a', '#ffffff'],
    yard(lm, A) { const F = A.F; for (let i = 0; i < 3; i++) flagPole(fxp(F, -10 + i * 10, 5), fyp(F, -10 + i * 10, 5), 16, ['#c8202a', '#f2c230', '#2a5cd8'][i]); },
    people(lm, A, rng, add) { for (let i = 0; i < 8; i++) add(pickR(rng, ['woman', 'man', 'student', 'any', 'kid']), i * 3, (rng.next() - 0.5) * A.F.L * 0.8, 2 + rng.next() * 6, rng.next() * TAU, { sway: 0.5, turn: 0.4 }); },
  });
  regCivic('exhibition_hall', {
    wall: '#d8dce0', roof: '#c8ccd0', acc: '#2a5cd8', front: FAC.glass, side: FAC.blank, text: 'HITEX', signCol: ['#2a3a8a', '#ffffff'],
    body(lm, A) {
      const r = A.rr;
      if (S.hitex === 'construction') { // steel frames rising out of the rocks, a crane
        for (let i = 0; i <= 6; i++) for (let j = 0; j <= 3; j++) pole(r.x + 8 + i * (r.w - 16) / 6, r.y + 8 + j * (r.d - 16) / 3, 0, 20, '#8a6a5a', 0.6);
        for (let j = 0; j <= 3; j++) seg3(r.x + 8, r.y + 8 + j * (r.d - 16) / 3, 20, r.x + r.w - 8, r.y + 8 + j * (r.d - 16) / 3, 20, '#8a6a5a', 0.8);
        towerCrane(r.x + r.w * 0.7, r.y + r.d * 0.4, 40, TIME * 0.04 + 1, 30);
        tinFence(r.x, r.y, r.w, r.d, 6, true, 0.5);
        return;
      }
      if (K.box) K.box(r.x, r.y, r.w, r.d, 0, A.h, A.st, null, true);
      // the space-frame roof grid
      hrect(r.x, r.y, r.w, r.d, A.h, '#c8ccd2');
      const k = kh(A.h + 0.05); ctx.strokeStyle = 'rgba(80,90,100,0.45)'; ctx.lineWidth = 0.5; ctx.beginPath();
      for (let xx = r.x + 5; xx < r.x + r.w; xx += 5) { ctx.moveTo(sx(xx, k), sy(r.y, k)); ctx.lineTo(sx(xx, k), sy(r.y + r.d, k)); }
      for (let yy = r.y + 5; yy < r.y + r.d; yy += 5) { ctx.moveTo(sx(r.x, k), sy(yy, k)); ctx.lineTo(sx(r.x + r.w, k), sy(yy, k)); }
      ctx.stroke();
    },
    init(lm, A) { A.r3 = {}; },
    count() { return S.hitex === 'open' ? 6 : 0; },
    people(lm, A, rng, add) { for (let i = 0; i < 6; i++) add(pickR(rng, ['man', 'woman', 'student']), i * 3, (rng.next() - 0.5) * A.F.L * 0.6, 3 + rng.next() * 6, rng.next() * TAU, { sway: 0.5, turn: 0.4 }); },
  });

  /* ---------------------------------------------------------------- gates */
  function gatePiers(lm) {
    if (lm.solids && lm.solids.length >= 2) return lm.solids;
    const long = lm.w >= lm.d;
    return long ? [[lm.x - lm.w / 2, lm.y - lm.d / 2, 6, lm.d], [lm.x + lm.w / 2 - 6, lm.y - lm.d / 2, 6, lm.d]] : [[lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, 6], [lm.x - lm.w / 2, lm.y + lm.d / 2 - 6, lm.w, 6]];
  }
  function regGate(drawId, cfg) {
    reg(drawId, {
      init(lm) { return { piers: gatePiers(lm), long: lm.w >= lm.d }; },
      draw(lm, A) {
        const H = lm.h || 22, [p0, p1] = A.piers;
        for (const p of A.piers) {
          abox(p[0], p[1], p[2], p[3], 0, H - 4, cfg.wall, cfg.top || sh(cfg.wall, 1.1));
          if (cfg.cap) cfg.cap(p[0] + p[2] / 2, p[1] + p[3] / 2, Math.min(p[2], p[3]), H - 4);
        }
        // the beam spanning the road
        let bx, by, bw, bd;
        if (A.long) { bx = p0[0]; by = lm.y - 2.2; bw = p1[0] + p1[2] - p0[0]; bd = 4.4; } else { bx = lm.x - 2.2; by = p0[1]; bw = 4.4; bd = p1[1] + p1[3] - p0[1]; }
        abox(bx, by, bw, bd, H - 8, H - 2, cfg.beam, sh(cfg.beam, 1.12));
        if (cfg.deco) cfg.deco(lm, A, bx, by, bw, bd, H);
        namePlate(bx + bw / 2, by + bd / 2, H - 1.8, cfg.text, cfg.beam, cfg.fg || '#fff4d8', A.long ? 0 : 1);
      },
      shadow(lm, A) { for (const p of A.piers) N.draw.castBox(p[0], p[1], p[2], p[3], (lm.h || 22) - 4); },
    });
  }
  regGate('zoo_gate', { wall: '#c8a878', beam: '#7a4a2a', text: 'NEHRU ZOOLOGICAL PARK', fg: '#f8e8b0',
    cap(x, y, s, h) { // a painted elephant and lion on the piers (simple silhouettes)
      disc(x, y, s * 0.42, h + 3, '#8a8a90'); disc(x + s * 0.3, y, s * 0.18, h + 3.4, '#9a9aa0');
    } });
  regGate('shilparamam_gate', { wall: '#b8603a', beam: '#8a4a2a', top: '#c8a060', text: 'SHILPARAMAM', fg: '#fff4d8',
    cap(x, y, s, h) { if (K.pyramid) K.pyramid(x - s * 0.7, y - s * 0.7, s * 1.4, s * 1.4, h, h + 5, '#c8a050'); } });
  reg('campus_gate', {
    init(lm) { return { F: frontOf(lm) }; },
    draw(lm, A) { gateArch(A.F, 0, -A.F.D / 2, Math.min(A.F.L - 6, 30), lm.h || 20, '#7a3a2a', 'UNIVERSITY OF HYDERABAD', '#fff4d8'); },
    shadow(lm) { N.draw.castBox(lm.x - 3, lm.y - lm.d / 2, 6, lm.d, 16); },
  });

  /* ---------------------------------------------------------------- water-side */
  reg('boat_jetty', {
    init(lm) { const rng = rngOf(lm, 'bj'); return { people: [person('man', 3, lm.x + 3, lm.y + lm.d / 2 - 4, -Math.PI / 2, { sway: 0.4 }), person('kid', 5, lm.x - 2, lm.y + lm.d / 2 - 6, -Math.PI / 2, { sway: 0.8 })], count: () => (S.min > 600 && S.min < 1170 ? 2 : 0), rng }; },
    draw(lm) {
      const x = lm.x - lm.w / 2, y = lm.y - lm.d / 2;
      for (let yy = y + 2; yy < y + lm.d; yy += 6) { pole(x + 1, yy, -2, 3, '#4a3a2a', 0.7); pole(x + lm.w - 1, yy, -2, 3, '#4a3a2a', 0.7); }
      abox(x, y, lm.w, lm.d, 2.4, 3.2, '#8a6a4a', '#a8805a');
      const k = kh(3.25); ctx.strokeStyle = 'rgba(60,40,20,0.5)'; ctx.lineWidth = 0.4; ctx.beginPath();
      for (let yy = y + 1.5; yy < y + lm.d; yy += 1.5) { ctx.moveTo(sx(x, k), sy(yy, k)); ctx.lineTo(sx(x + lm.w, k), sy(yy, k)); }
      ctx.stroke();
      seg3(x + 0.4, y, 6, x + 0.4, y + lm.d, 6, '#f4f2ea', 0.4); seg3(x + lm.w - 0.4, y, 6, x + lm.w - 0.4, y + lm.d, 6, '#f4f2ea', 0.4);
      ring(x + 0.6, y + lm.d * 0.4, 1.2, 5, '#f08a24', 0.6);
      abox(x + lm.w / 2 - 3, y + lm.d - 6, 6, 5, 3.2, 9, '#2a8c82', '#e8d8b0');
    },
    shadow(lm) { N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, 3); },
    lights(lm) { light(lm, 0, 1, lm.x, lm.y, 8, 24, '#ffe0a0', 0.8); },
  });
  reg('musical_fountain', {
    init(lm) { return { r: Math.min(lm.w, lm.d) / 2 }; },
    draw(lm, A) {
      const r = A.r;
      cyl(lm.x, lm.y, r, 0, 1.6, '#c8c0b0', null);
      disc(lm.x, lm.y, r - 1, 1.2, '#3f9aa0');
      // jets: a ring of arcs rising and falling to the music
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, hh = 4 + 5 * (0.5 + 0.5 * Math.sin(TIME * 2.4 + i * 0.9));
        const x0 = lm.x + Math.cos(a) * (r - 3), y0 = lm.y + Math.sin(a) * (r - 3);
        seg3(x0, y0, 1.2, x0, y0, hh, 'rgba(230,248,255,0.85)', 0.6);
        puff(x0, y0, hh, 0.8, 0.5, '#f0faff');
      }
      const hc = 6 + 6 * (0.5 + 0.5 * Math.sin(TIME * 1.3));
      seg3(lm.x, lm.y, 1.2, lm.x, lm.y, hc, 'rgba(240,250,255,0.9)', 1.2); puff(lm.x, lm.y, hc, 1.6, 0.55, '#f4fcff');
    },
    shadow() {},
    lights(lm) { light(lm, 0, 1, lm.x, lm.y, 6, 30, ['#ff60c0', '#60c0ff', '#60ff90', '#ffe060'][Math.floor(TIME / 2) % 4], 0.9); },
    night(lm, A, a) { glow(lm.x, lm.y, 6, A.r + 4, ['#ff60c0', '#60c0ff', '#60ff90', '#ffe060'][Math.floor(TIME / 2) % 4], a * 0.6); },
  });
  reg('dhobi_ghat', {
    init(lm) {
      const rng = rngOf(lm, 'dg');
      const long = lm.w >= lm.d, A = { long, lines: [], people: [], rng };
      for (let i = 0; i < 3; i++) A.lines.push({ off: (i - 1) * (long ? lm.d : lm.w) * 0.3, cols: Array.from({ length: 10 }, () => pickR(rng, ['#f4f2ea', '#e8302a', '#2a5cd8', '#f2c230', '#30b050', '#e85a9a', '#f4f2ea', '#7a3a8a'])) });
      for (let i = 0; i < 4; i++) A.people.push(person(pickR(rng, ['lungi', 'saree', 'uncle']), i * 5, lm.x + (rng.next() - 0.5) * lm.w * 0.8, lm.y + (rng.next() - 0.5) * lm.d * 0.6, rng.next() * TAU, { sway: 1.2, sp: 2.4 }));
      A.spread = [];
      for (let i = 0; i < 12; i++) {
        const w = 3 + rng.next() * 4, d = 2 + rng.next() * 2.5, x = lm.x - lm.w / 2 - 10 + rng.next() * (lm.w + 20), y = lm.y - lm.d / 2 - 8 + rng.next() * (lm.d + 16);
        if (N.world && N.world.isWater && N.world.isWater(x, y)) continue;
        A.spread.push([x, y, w, d, pickR(rng, ['#f4f2ea', '#e8302a', '#2a5cd8', '#f2c230', '#30b050', '#e85a9a', '#f4f2ea', '#c8a050'])]);
      }
      A.count = () => (S.min > 360 && S.min < 1080 ? 4 : 0);
      return A;
    },
    draw(lm, A) {
      const L = A.long ? lm.w : lm.d;
      for (const ln0 of A.lines) {
        const ax0 = A.long ? lm.x - L / 2 : lm.x + ln0.off, ay0 = A.long ? lm.y + ln0.off : lm.y - L / 2;
        const bx0 = A.long ? lm.x + L / 2 : ax0, by0 = A.long ? ay0 : lm.y + L / 2;
        pole(ax0, ay0, 0, 7, '#6a4a2a', 0.5); pole(bx0, by0, 0, 7, '#6a4a2a', 0.5);
        seg3(ax0, ay0, 7, bx0, by0, 7, 'rgba(40,40,40,0.6)', 0.25);
        for (let i = 0; i < ln0.cols.length; i++) {
          const t = (i + 0.5) / ln0.cols.length, x = ax0 + (bx0 - ax0) * t, y = ay0 + (by0 - ay0) * t, flap = Math.sin(TIME * 3 + i * 1.3) * 0.6;
          // a sheet over the line: seen from above as a strip either side of it, flapping in the breeze
          const hx = A.long ? 1.2 : 1.8 + flap, hy = A.long ? 1.8 + flap : 1.2;
          quad3(x - hx, y - hy, 6.2, x + hx, y - hy, 6.2, x + hx, y + hy, 6.2, x - hx, y + hy, 6.2);
          fillc(sh(ln0.cols[i], 0.92 + 0.1 * Math.sin(TIME * 3 + i)));
        }
      }
      // saris and dhotis spread out to dry on the sand
      for (const c of A.spread) { const k = kh(0.15); ctx.fillStyle = c[4]; ctx.fillRect(sx(c[0], k), sy(c[1], k), c[2] * k, c[3] * k); }
      // washing stones + tubs
      for (let i = 0; i < 4; i++) { const t = (i + 0.5) / 4; const x = A.long ? lm.x - L / 2 + t * L : lm.x + lm.w * 0.4, y = A.long ? lm.y + lm.d * 0.42 : lm.y - L / 2 + t * L; abox(x - 2, y - 1, 4, 2, 0, 1.4, '#8a8680', '#a8a49c'); cyl(x + 3, y, 1.1, 0, 1.6, '#3a6a9a', '#5ab0d0'); }
    },
    shadow() {},
  });
  reg('idol_workshop', {
    init(lm) { const rng = rngOf(lm, 'iw'); return { F: frontOf(lm), rng, idols: Array.from({ length: 4 }, (_, i) => ({ painted: rng.next() < 0.6, s: 0.7 + rng.next() * 0.5, col: pickR(rng, ['#f08a24', '#e85a9a', '#f2c230', '#30b0c0']), i })) }; },
    draw(lm, A) {
      const F = A.F, x = lm.x - lm.w / 2, y = lm.y - lm.d / 2, H = lm.h || 22;
      // bamboo frame + blue tarpaulin roof (translucent so the idols read)
      for (const [px, py] of [[x, y], [x + lm.w, y], [x + lm.w, y + lm.d], [x, y + lm.d]]) pole(px, py, 0, H, '#a8885a', 0.6);
      const season = S.ganesh;
      for (const idl of A.idols) {
        const u = -F.L / 2 + (idl.i + 0.5) * F.L / 4, cx0 = fxp(F, u, -F.D * 0.4), cy0 = fyp(F, u, -F.D * 0.4);
        const painted = season || idl.painted, s = idl.s * (season ? 1.15 : 1);
        const body = painted ? idl.col : '#9a948a', skin = painted ? '#f0a0b0' : '#a8a298';
        // pedestal, body, head with the big ears, a crown
        cyl(cx0, cy0, 3.4 * s, 0, 2, '#c8a060', '#d8b070');
        N.draw.dome(cx0, cy0, 3 * s, 2, 2 + 9 * s, { fill: body, steps: 5 });
        disc(cx0 - 2.2 * s, cy0, 1.6 * s, 2 + 9 * s, skin); disc(cx0 + 2.2 * s, cy0, 1.6 * s, 2 + 9 * s, skin);
        N.draw.dome(cx0, cy0, 1.8 * s, 2 + 9 * s, 2 + 13 * s, { fill: skin, steps: 4 });
        if (painted) N.draw.dome(cx0, cy0, 1.1 * s, 2 + 12.6 * s, 2 + 15.5 * s, { fill: '#e8b020', steps: 3 });
      }
      const tr = frect(F, -F.L / 2 - 1, F.L / 2 + 1, -F.D - 1, -F.D * 0.62);
      ctx.globalAlpha = 0.85; abox(tr[0], tr[1], tr[2], tr[3], H, H + 0.4, null, '#2a6ab8'); ctx.globalAlpha = 1;
    },
    shadow(lm) { N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, (lm.h || 22) * 0.9); },
    lights(lm) { if (S.ganesh) light(lm, 0, 1, lm.x, lm.y, 12, 40, '#ffd070', 0.9); },
    night(lm, A, a) { if (S.ganesh && K.bulbRect) K.bulbRect(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, (lm.h || 22) + 0.4, 3, '#ffe070', '#ff60a0'); void a; },
  });
  reg('aeroplane', {
    init(lm) { const f = String(lm.face || 'e').toUpperCase(); return { a: f === 'E' ? 0 : f === 'W' ? Math.PI : f === 'S' ? Math.PI / 2 : -Math.PI / 2 }; },
    draw(lm, A) {
      const ca = Math.cos(A.a), sa = Math.sin(A.a), x = lm.x, y = lm.y;
      const L = Math.max(lm.w, lm.d) * 0.98;
      // wings (swept), tailplane, fuselage, fin, engines
      const wing = (off, span, chord, sweep, h) => {
        const P0 = [x + ca * off, y + sa * off];
        quad3(P0[0] - sa * 2, P0[1] + ca * 2, h, P0[0] - sa * span - ca * sweep, P0[1] + ca * span - sa * sweep, h, P0[0] - sa * span - ca * (sweep + chord * 0.5), P0[1] + ca * span - sa * (sweep + chord * 0.5), h, P0[0] - sa * 2 - ca * chord, P0[1] + ca * 2 - sa * chord, h);
        fillc('#d8dce2');
        quad3(P0[0] + sa * 2, P0[1] - ca * 2, h, P0[0] + sa * span - ca * sweep, P0[1] - ca * span - sa * sweep, h, P0[0] + sa * span - ca * (sweep + chord * 0.5), P0[1] - ca * span - sa * (sweep + chord * 0.5), h, P0[0] + sa * 2 - ca * chord, P0[1] - ca * 2 - sa * chord, h);
        fillc('#d8dce2');
      };
      wing(L * 0.08, L * 0.42, 9, 7, 4);
      for (const s of [-1, 1]) { const ex = x + ca * L * 0.02 - sa * s * L * 0.18, ey = y + sa * L * 0.02 + ca * s * L * 0.18; obox(ex, ey, ca, sa, 3.4, 1.4, 2, 4.4, '#a8acb4', '#c8ccd4'); }
      obox(x, y, ca, sa, L / 2, 2.6, 2.6, 7.6, '#f4f6f8', '#f8fafc');
      spr(x, y, ca, sa, 7.65);
      ctx.fillStyle = '#2a5cb8'; ctx.fillRect(-L / 2 + 2, -0.5, L - 6, 1); // the cheat line
      ctx.fillStyle = '#c8302a'; ctx.fillRect(-L / 2 + 1, -2.4, 4, 4.8);
      ctx.fillStyle = '#1a2a3a'; ctx.fillRect(L / 2 - 4, -1.6, 1.4, 3.2); // cockpit
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      wing(-L * 0.4, L * 0.16, 5, 4, 8);
      obox(x - ca * L * 0.42, y - sa * L * 0.42, ca, sa, 4, 0.5, 7.6, 15, '#c8302a', '#c8302a');
    },
    shadow(lm, A) { N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, 5); },
    lights(lm, A) { light(lm, 0, 1, lm.x, lm.y, 8, 30, Math.sin(TIME * 4) > 0.6 ? '#ff3030' : '#e8f4ff', 0.6); },
  });
  reg('halt_station', {
    init(lm) {
      const A = { F: frontOf(lm), people: [] };
      const rng = rngOf(lm, 'hs');
      for (let i = 0; i < 5; i++) A.people.push(person(pickR(rng, ['man', 'student', 'woman', 'aunty']), i * 3, fxp(A.F, (rng.next() - 0.5) * A.F.L * 0.8, -A.F.D * 0.4), fyp(A.F, (rng.next() - 0.5) * A.F.L * 0.8, -A.F.D * 0.4), A.F.ang + Math.PI + (rng.next() - 0.5), { sway: 0.4, turn: 0.4 }));
      A.count = () => (S.min > 330 && S.min < 1350 ? 5 : 0);
      A.name = String(lm.name || '').toUpperCase().replace(/ (STATION|HALT)$/, '').replace(/ STATION.*/, '');
      return A;
    },
    draw(lm, A) {
      const F = A.F, x = lm.x - lm.w / 2, y = lm.y - lm.d / 2;
      abox(x, y, lm.w, lm.d, 0, 2.2, '#b8b0a0', '#cfc8b8'); // platform
      const r = frect(F, -F.L * 0.3, F.L * 0.3, -F.D + 2, -2);
      for (const [px, py] of [[r[0] + 1, r[1] + 1], [r[0] + r[2] - 1, r[1] + 1], [r[0] + r[2] - 1, r[1] + r[3] - 1], [r[0] + 1, r[1] + r[3] - 1]]) pole(px, py, 2.2, 11, '#4a5a6a', 0.6);
      ctx.globalAlpha = under(r[0], r[1], r[2], r[3]) ? 0.35 : 1;
      abox(r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2, 11, 11.8, '#8a3a2a', '#a84a3a');
      ctx.globalAlpha = 1;
      // the yellow station name board on two legs
      const bx = fxp(F, F.L * 0.38, -F.D / 2), by = fyp(F, F.L * 0.38, -F.D / 2);
      pole(bx - 3, by, 2.2, 8, '#2a2a2a', 0.4); pole(bx + 3, by, 2.2, 8, '#2a2a2a', 0.4);
      const tw = pw(A.name), k = kh(8.5);
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(Math.round(sx(bx, k) - tw / 2 - 3), Math.round(sy(by, k) - 5), tw + 6, 10);
      ctx.fillStyle = '#f2c230'; ctx.fillRect(Math.round(sx(bx, k) - tw / 2 - 2), Math.round(sy(by, k) - 4), tw + 4, 8);
      ptext(bx, by, 8.5, [A.name], '#1a1a1a', null, 0);
    },
    shadow(lm, A) { const r = frect(A.F, -A.F.L * 0.3, A.F.L * 0.3, -A.F.D + 2, -2); N.draw.castBox(r[0], r[1], r[2], r[3], 11); },
    lights(lm) { light(lm, 0, 1, lm.x, lm.y, 10, 30, '#e8f4ff', 0.8); },
  });

  /* ================================================================ PLACE-DRIVEN DECORATIONS */
  // Things the map has as places/parks but not as landmarks: colony playgrounds (pitch,
  // stumps, swings, slide, see-saw, kids at cricket, Ganesh pandals in season), NTR Gardens
  // (Machan tree, waterfall, mini train, Nandi statues / or work in progress) and street
  // markets (stalls round the place point). Queued by the placesArt system.
  function inView(x0, y0, x1, y1, m) { const v = R.view; return !(x1 < v.x0 - m || x0 > v.x1 + m || y1 < v.y0 - m || y0 > v.y1 + m); }
  let nearList = null;
  function nearLandmark(x, y, pad) {
    const list = nearList || N.WORLD_DATA.landmarks;
    for (const l of list) if (Math.abs(x - l.x) < l.w / 2 + pad && Math.abs(y - l.y) < l.d / 2 + pad) return l;
    return null;
  }
  // ---------------------------------------------------------------- playgrounds
  function pandal(x, y, ca, sa, lit) {
    // bamboo poles, striped cloth walls on three sides, the idol on a stage, a canopy over the back
    const hl = 9, hw = 6.5, H = 13;
    const P = (u, v, h) => [x + ca * u - sa * v, y + sa * u + ca * v, h];
    for (const [u, v] of [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]]) { const p = P(u, v, 0); pole(p[0], p[1], 0, H, '#a8885a', 0.6); }
    // back wall (cloth) at u = -hl
    const b0 = P(-hl, -hw, 0), b1 = P(-hl, hw, 0);
    quad3(b0[0], b0[1], 0, b1[0], b1[1], 0, b1[0], b1[1], H - 1, b0[0], b0[1], H - 1); fillc('#c8202a');
    // stage + idol (seated Ganesha: body, belly, head with big ears, crown), respectful and bright
    const sp = P(-hl + 4.5, 0, 0);
    obox(sp[0], sp[1], ca, sa, 3.5, 4.5, 0, 2.2, '#e8d8b0', '#f4e8c8');
    N.draw.dome(sp[0], sp[1], 3, 2.2, 8.5, { fill: '#f08a24', steps: 5 });
    const hp = P(-hl + 4, 0, 0);
    disc(hp[0] - sa * 2.2, hp[1] + ca * 2.2, 1.6, 9, '#f0a0b0'); disc(hp[0] + sa * 2.2, hp[1] - ca * 2.2, 1.6, 9, '#f0a0b0');
    N.draw.dome(hp[0], hp[1], 1.9, 8.5, 11, { fill: '#f0a0b0', steps: 4 });
    N.draw.dome(hp[0], hp[1], 1.1, 10.8, 13, { fill: '#e8b020', steps: 3 });
    // marigold garlands
    ring(sp[0], sp[1], 3.2, 6, '#f08a24', 0.6);
    // canopy over the back half (scalloped stripes)
    const c0 = P(-hl - 0.5, -hw - 0.5, H), c1 = P(0, -hw - 0.5, H), c2 = P(0, hw + 0.5, H), c3 = P(-hl - 0.5, hw + 0.5, H);
    quad3(c0[0], c0[1], H, c1[0], c1[1], H, c2[0], c2[1], H - 1, c3[0], c3[1], H); fillc('#f2c230');
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const t0 = i / 6, t1 = (i + 0.5) / 6; const q0 = P(-hl - 0.5 + t0 * (hl + 0.5), -hw - 0.5, H), q1 = P(-hl - 0.5 + t1 * (hl + 0.5), -hw - 0.5, H), q2 = P(-hl - 0.5 + t1 * (hl + 0.5), hw + 0.5, H), q3 = P(-hl - 0.5 + t0 * (hl + 0.5), hw + 0.5, H); mv(q0[0], q0[1], H + 0.05); ln(q1[0], q1[1], H + 0.05); ln(q2[0], q2[1], H + 0.05); ln(q3[0], q3[1], H + 0.05); ctx.closePath(); }
    fillc('#c8202a');
    // toran of mango leaves across the front + the loudspeaker horn on a pole
    const f0 = P(hl, -hw, H - 1), f1 = P(hl, hw, H - 1);
    seg3(f0[0], f0[1], H - 1, f1[0], f1[1], H - 1, '#3a8a3a', 0.8);
    const lp = P(hl + 3, hw + 2, 0); pole(lp[0], lp[1], 0, 16, '#6a6a6a', 0.5); obox(lp[0], lp[1], ca, sa, 1.6, 1.2, 15, 16.5, '#c8c8c0', '#a8a8a0');
    if (lit && K.bulbs) {
      K.bulbs(f0[0], f0[1], H - 0.5, f1[0], f1[1], H - 0.5, 10, '#ffe070', '#ff60a0', 0.8);
      const s0 = P(-hl, -hw, H), s1 = P(hl, -hw, H), s2 = P(-hl, hw, H), s3 = P(hl, hw, H);
      K.bulbs(s0[0], s0[1], H, s1[0], s1[1], H, 10, '#60ff90', '#ffe070'); K.bulbs(s2[0], s2[1], H, s3[0], s3[1], H, 10, '#60ff90', '#ffe070');
    }
  }
  function makePlayground(pl, park) {
    const [x, y, w, d] = polyBox(park.poly);
    const long = w >= d, ca = long ? 1 : 0, sa = long ? 0 : 1;
    const cx0 = x + w / 2, cy0 = y + d / 2;
    const rng = U.rng('pg:' + pl.id);
    const L = long ? w : d, Wd = long ? d : w;
    const P = (u, v) => [cx0 + ca * u - sa * v, cy0 + sa * u + ca * v];
    const it = { id: pl.id, kind: 'playground', x: cx0, y: cy0, w, d, x0: x - 20, y0: y - 30, x1: x + w + 20, y1: y + d + 10 };
    const kitNear = N.WORLD_DATA.landmarks.some((l) => l.draw === 'playground_kit' && Math.abs(l.x - cx0) < w / 2 + 10 && Math.abs(l.y - cy0) < d / 2 + 10);
    // pitch along the long axis through the centre; equipment in the corners
    const pu = Math.min(11, L * 0.2);
    it.pitch = [P(-pu, 0), P(pu, 0)];
    const cor = [P(-L / 2 + 10, -Wd / 2 + 8), P(L / 2 - 10, -Wd / 2 + 8), P(L / 2 - 10, Wd / 2 - 8), P(-L / 2 + 10, Wd / 2 - 8)];
    it.swing = kitNear ? null : cor[0];
    it.slide = cor[1];
    it.seesaw = cor[2];
    it.pandal = P(L / 2 - 14, 0);
    it.round = L > 70 && Wd > 50 ? cor[3] : null;
    it.ca = ca; it.sa = sa; it.ph = rng.next() * 6;
    it.bricks = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, p = P(Math.cos(a) * (L / 2 - 4), Math.sin(a) * (Wd / 2 - 4)); it.bricks.push(p); }
    // the cricket match: batsman, keeper, bowler (animated), fielders
    const kids = [];
    const kid = (i, u, v, a) => { const p = P(u, v); kids.push(person('kid', i, p[0], p[1], a, { sway: 0.9, sp: 2.4, turn: 0.4 })); };
    const along = Math.atan2(sa, ca);
    kid(1, -pu - 1.5, 0.8, along);           // batsman
    kid(2, -pu - 6, 0, along);               // keeper
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.6, r = Math.min(L, Wd) * 0.36; kid(4 + i, Math.cos(a) * r, Math.sin(a) * r * 0.8, Math.atan2(-Math.sin(a), -Math.cos(a))); }
    kid(12, 0, Wd / 2 - 8, along + Math.PI / 2); kid(13, 3, Wd / 2 - 9, along + Math.PI / 2); // watching
    it.kids = kids;
    it.bowler = person('kid', 3, 0, 0, along + Math.PI, { sway: 0 });
    it.P = P; it.pu = pu; it.along = along;
    it.kidCount = () => {
      const m = S.min, sun = S.weekday === 0;
      if (S.ganesh) return m > 420 && m < 1380 ? 6 : 0;
      if (m < 390 || m > 1125) return 0;
      if (sun) return kids.length;
      return (m < 540) || (m > 960) ? kids.length : 2;
    };
    it.draw = () => {
      if (it.swing) swingSet(it.swing[0], it.swing[1], ca, sa, 16, 12, it.ph, 2);
      slide(it.slide[0], it.slide[1], ca, sa, 8);
      seesaw(it.seesaw[0], it.seesaw[1], ca, sa, it.ph);
      if (it.round) roundabout(it.round[0], it.round[1], it.ph);
      for (const p of it.pitch) stumps(p[0], p[1], ca, sa);
      if (S.ganesh) pandal(it.pandal[0], it.pandal[1], -ca, -sa, false);
      // the ball in flight during a delivery
      const n = it.kidCount();
      if (n > 3 && !S.ganesh) {
        const t = (TIME * 0.45 + it.ph) % 1;
        if (t > 0.55 && t < 0.8) { const q = (t - 0.55) / 0.25, bp = P(it.pu - q * it.pu * 2, 0); disc(bp[0], bp[1], 0.6, 1 + Math.sin(q * Math.PI) * 2.5, '#d8302a'); }
      }
    };
    it.actors = () => {
      const n = it.kidCount();
      drawPeople(it.kids, Math.min(n, it.kids.length));
      if (n > 3 && !S.ganesh) { // the bowler's run-up and delivery
        const t = (TIME * 0.45 + it.ph) % 1;
        const u = t < 0.55 ? it.pu + 10 - t / 0.55 * 9 : it.pu + 1 + (t - 0.55) * 8;
        const p = it.P(u, 0.8);
        it.bowler.x = p[0]; it.bowler.y = p[1];
        drawPeople([it.bowler], 1);
      }
    };
    it.shadow = () => { if (it.swing) N.draw.castPole(it.swing[0], it.swing[1], 11, 3); N.draw.castPole(it.slide[0], it.slide[1], 7, 2); if (S.ganesh) N.draw.castBox(it.pandal[0] - 9, it.pandal[1] - 7, 18, 14, 13); };
    it.lights = (L) => { if (S.ganesh) { L.x = it.pandal[0]; L.y = it.pandal[1]; L.h = 10; L.r = 40; L.color = '#ffd070'; L.intensity = 1; L.glow = undefined; R.lights.push(L); } };
    it.night = () => { if (S.ganesh) pandal(it.pandal[0], it.pandal[1], -ca, -sa, true); };
    it.ground = (g) => {
      // the dusty worn pitch, crease lines, a bowler's footmarks
      const [a, b] = it.pitch;
      g.save(); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); g.rotate(it.along);
      g.fillStyle = 'rgba(236,218,170,0.6)'; g.fillRect(-it.pu - 2, -2.2, it.pu * 2 + 4, 4.4);
      g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillRect(-it.pu + 1.4, -2.4, 0.5, 4.8); g.fillRect(it.pu - 1.9, -2.4, 0.5, 4.8);
      g.fillStyle = 'rgba(120,90,60,0.25)'; for (let i = 0; i < 5; i++) g.fillRect(it.pu + 2 + i * 1.6, -0.8 + (i % 2) * 0.8, 1, 0.8);
      g.restore();
      g.fillStyle = 'rgba(150,70,50,0.8)'; for (const p of it.bricks) g.fillRect(p[0] - 1, p[1] - 0.6, 2, 1.2); // boundary bricks
    };
    return it;
  }
  // ---------------------------------------------------------------- NTR Gardens
  const leafCache = new Map();
  function leafImg(r, seed, col) {
    const key = r + '|' + seed + '|' + col;
    let c = leafCache.get(key);
    if (c) return c;
    const s = Math.ceil(r * 2 * 3) + 2;
    c = N.render.makeCanvas(s, s);
    const g = c.getContext('2d'), rng = U.rng(key);
    g.setTransform(3, 0, 0, 3, s / 2, s / 2);
    g.fillStyle = sh(col, 0.8); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    for (let i = 0; i < r * r * 0.8; i++) { const a = rng.next() * TAU, rr = Math.sqrt(rng.next()) * r * 0.92; g.fillStyle = sh(col, 0.75 + rng.next() * 0.5); g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr, 0.6 + rng.next() * 1.2, 0, TAU); g.fill(); }
    leafCache.set(key, c);
    return c;
  }
  function leafDisc(x, y, r, h, seed, col) {
    const img = leafImg(r, seed, col || '#4f9a3a');
    plane(h); ctx.imageSmoothingEnabled = true; ctx.drawImage(img, x - r - 0.33, y - r - 0.33, r * 2 + 0.66, r * 2 + 0.66); ctx.imageSmoothingEnabled = false; ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function nandi(x, y, a) {
    const ca = Math.cos(a), sa = Math.sin(a);
    obox(x, y, ca, sa, 3, 2.2, 0, 2.4, '#b8b4ac', '#c8c4bc');
    N.draw.dome(x - ca * 0.5, y - sa * 0.5, 2.2, 2.4, 5, { fill: '#9a968e', steps: 4 });
    N.draw.dome(x + ca * 2.4, y + sa * 2.4, 1.2, 3, 5.4, { fill: '#8a8680', steps: 3 });
    disc(x + ca * 2.4 - sa * 1, y + sa * 2.4 + ca * 1, 0.4, 5.8, '#6a6660'); disc(x + ca * 2.4 + sa * 1, y + sa * 2.4 - ca * 1, 0.4, 5.8, '#6a6660');
  }
  function jcb(x, y, a, t) {
    const ca = Math.cos(a), sa = Math.sin(a);
    obox(x, y, ca, sa, 5, 3, 1, 5, '#e8b020', '#f2c230');
    obox(x - ca * 1.5, y - sa * 1.5, ca, sa, 2, 2.6, 5, 9, '#e8b020', '#3a4a5a');
    const arm = 0.4 + Math.sin(t) * 0.35;
    const ex = x + ca * (6 + Math.cos(arm) * 6), ey = y + sa * (6 + Math.cos(arm) * 6);
    seg3(x + ca * 4, y + sa * 4, 5, ex, ey, 3 + Math.sin(arm) * 6, '#d8a010', 1.2);
    obox(ex, ey, ca, sa, 1.4, 1.6, 0.5, 2.4, '#3a3a3a', '#5a5a5a');
  }
  function makeNtr(pl, park) {
    const bb = polyBox(park.poly);
    const it = { id: pl.id, kind: 'ntr_gardens', x: bb[0] + bb[2] / 2, y: bb[1] + bb[3] / 2, w: bb[2], d: bb[3], x0: bb[0] - 30, y0: bb[1] - 50, x1: bb[0] + bb[2] + 20, y1: bb[1] + bb[3] + 20, poly: park.poly };
    const memo = N.WORLD_DATA.landmarks.find((l) => l.draw === 'ntr_memorial') || { x: 3672, y: 1985, w: 40, d: 28 };
    it.loop = { cx: memo.x, cy: memo.y + 5, rx: memo.w * 0.5 + 32, ry: memo.d * 0.5 + 16 };
    const hide = N.WORLD_DATA.places.find((p) => p.id === 'hide_ntr_lawn');
    it.tree = hide ? [hide.x - 2, hide.y - 12] : [bb[0] + 50, bb[1] + bb[3] * 0.5];
    it.fall = [it.loop.cx + it.loop.rx + 22, it.loop.cy + 22];
    if (!inPolyXY(it.fall[0], it.fall[1], park.poly)) it.fall = [it.loop.cx + it.loop.rx + 10, it.loop.cy + 10];
    it.nandi = [[pl.x - 12, pl.y + 8], [pl.x + 12, pl.y + 10]];
    it.beds = [];
    const rng = U.rng('ntr');
    for (let i = 0; i < 14; i++) {
      const px = bb[0] + rng.next() * bb[2], py = bb[1] + rng.next() * bb[3];
      if (!inPolyXY(px, py, park.poly)) continue;
      const dl = Math.hypot((px - it.loop.cx) / it.loop.rx, (py - it.loop.cy) / it.loop.ry);
      if (dl > 0.7 && dl < 1.35) continue;
      if (Math.hypot(px - it.tree[0], py - it.tree[1]) < 22) continue;
      if (Math.abs(px - memo.x) < memo.w / 2 + 6 && Math.abs(py - memo.y) < memo.d / 2 + 6) continue;
      it.beds.push([px, py, 5 + rng.next() * 5, pickR(rng, ['#e83a5a', '#f2c230', '#f08a24', '#c040c0', '#f4f2ea'])]);
    }
    it.people = [];
    for (let i = 0; i < 14; i++) {
      const a = rng.next() * TAU, r = 0.6 + rng.next() * 0.9;
      let px = it.loop.cx + Math.cos(a) * it.loop.rx * r * 1.2, py = it.loop.cy + Math.sin(a) * it.loop.ry * r * 1.2;
      if (!inPolyXY(px, py, park.poly)) { px = pl.x + (rng.next() - 0.5) * 30; py = pl.y + (rng.next() - 0.5) * 10; }
      it.people.push(person(pickR(rng, ['kid', 'woman', 'man', 'aunty', 'saree', 'student', 'burqa']), i * 2, px, py, rng.next() * TAU, { sway: 0.7, turn: 0.5 }));
    }
    it.actors = () => { if (S.ntr === 'construction') return; drawPeople(it.people, S.min < 540 || S.min > 1230 ? 0 : S.weekday === 0 ? it.people.length : 8); };
    it.trainPos = (t) => { const a = t; return [it.loop.cx + Math.cos(a) * it.loop.rx, it.loop.cy + Math.sin(a) * it.loop.ry, a]; };
    it.draw = () => {
      if (S.ntr === 'construction') {
        // the Machan tree's bare concrete trunk in scaffolding, saplings, a JCB, the hoarding
        const [tx, ty] = it.tree;
        cyl(tx, ty, 4, 0, 18, '#a8a49c', '#b8b4ac');
        for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; pole(tx + Math.cos(a) * 6, ty + Math.sin(a) * 6, 0, 20, '#8a6a3a', 0.4); }
        for (let i = 0; i < 18; i++) { const px = it.loop.cx - 40 + (i % 6) * 14, py = it.loop.cy - 10 + Math.floor(i / 6) * 14; if (!inPolyXY(px, py, it.poly)) continue; pole(px, py, 0, 3, '#8a6a3a', 0.3); disc(px, py, 1.2, 3.2, '#5aa040'); }
        jcb(it.fall[0] - 10, it.fall[1] - 8, 2.6, TIME * 1.2);
        for (const [rx, ry, rr] of [[it.fall[0], it.fall[1], 5], [it.fall[0] + 6, it.fall[1] - 3, 4], [it.fall[0] - 4, it.fall[1] + 4, 3.5]]) N.draw.dome(rx, ry, rr, 0, rr * 1.2, { fill: '#8a8278', steps: 4 });
        const bx = pl.x, by = pl.y + 4;
        pole(bx - 14, by, 0, 14, '#4a4a50', 0.6); pole(bx + 14, by, 0, 14, '#4a4a50', 0.6);
        abox(bx - 18, by - 5, 36, 10, 13, 14, '#1f5a2a', '#1f6a3a');
        ptext(bx, by - 1.6, 14, ['NTR GARDENS'], '#f2c230', null, 0);
        ptext(bx, by + 2.4, 14, ['WORK IN PROGRESS'], '#ffffff', null, 0);
        return;
      }
      // the mini train on its loop
      const t = TIME * 0.22;
      for (let i = 3; i >= 0; i--) {
        const [px, py, a] = it.trainPos(t - i * 0.075);
        const ang = a + Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang);
        if (i === 0) { obox(px, py, ca, sa, 3.6, 2.2, 0.4, 5.2, '#d8202a', '#2a2a2a'); obox(px - ca * 1.6, py - sa * 1.6, ca, sa, 1.4, 2.3, 5.2, 6.4, '#1a1a1a', '#f2c230'); cyl(px + ca * 2.2, py + sa * 2.2, 0.8, 5.2, 7.2, '#2a2a2a', '#1a1a1a'); steam(px + ca * 2.2, py + sa * 2.2, 7.4, 2, 1, '#f4f2ee', 0.7); }
        else { const col = ['#f2c230', '#30a060', '#2a6ae8'][i - 1]; obox(px, py, ca, sa, 3.2, 2.1, 0.4, 3.8, col, sh(col, 1.18)); obox(px, py, ca, sa, 3.3, 2.2, 5.6, 6, '#d8302a', '#e84a3a'); disc(px - ca, py - sa, 0.8, 4, '#f0b090'); disc(px + ca, py + sa, 0.8, 4, '#2a2a2a'); }
      }
      // the Machan: a concrete tree with dining decks in its branches
      const [tx, ty] = it.tree;
      // spiral stair round the trunk, the trunk, branch decks with diners, the leafy crown
      cyl(tx, ty, 5.2, 0, 36, '#8a6448', null);
      for (let i = 0; i < 10; i++) { const a = i * 0.9, h = 2 + i * 2.6; obox(tx + Math.cos(a) * 6.4, ty + Math.sin(a) * 6.4, -Math.sin(a), Math.cos(a), 1.4, 0.9, h - 0.4, h, '#c8b090', '#d8c0a0'); }
      for (const [h, r, ox, oy, col] of [[13, 12, -6, 4, '#3f8a34'], [21, 13, 7, -3, '#4a9a3a'], [29, 15, -2, 2, '#56a844']]) {
        seg3(tx, ty, h - 6, tx + ox, ty + oy, h - 0.5, '#7a5a3a', 2);
        leafDisc(tx + ox, ty + oy, r, h, h, col);
        ring(tx + ox, ty + oy, r * 0.55, h + 0.1, '#e8d8b0', 0.9); // the dining deck's rail
        disc(tx + ox + r * 0.2, ty + oy, 1, h + 0.2, '#f4f2ea'); disc(tx + ox - r * 0.25, ty + oy + r * 0.15, 1, h + 0.2, '#f4f2ea');
      }
      leafDisc(tx, ty, 10, 37, 37, '#6ab84e');
      N.draw.dome(tx, ty, 7, 37, 41, { fill: '#6ab84e', steps: 4 });
      // waterfall over the rock pile into a pool
      const [fx0, fy0] = it.fall;
      disc(fx0 + 4, fy0 + 7, 8, 0.2, '#3f9aa0');
      for (const [rx, ry, rr, h] of [[fx0, fy0, 6, 9], [fx0 + 7, fy0 - 2, 5, 7], [fx0 - 6, fy0 + 2, 4.5, 6], [fx0 + 2, fy0 - 5, 4, 11]]) N.draw.dome(rx, ry, rr, 0, h, { fill: '#8a8278', steps: 4 });
      for (let i = 0; i < 4; i++) { const q = ((TIME * 1.6 + i / 4) % 1); seg3(fx0 + 2 + i * 0.8, fy0 + 1 + q * 2, 9 - q * 8, fx0 + 2 + i * 0.8, fy0 + 1.6 + q * 2, 8 - q * 8, 'rgba(220,245,255,0.85)', 0.9); }
      // Nandi statues at the gate
      nandi(it.nandi[0][0], it.nandi[0][1], -Math.PI / 2); nandi(it.nandi[1][0], it.nandi[1][1], -Math.PI / 2);
    };
    it.shadow = () => { if (S.ntr === 'construction') return; N.draw.castCircle(it.tree[0], it.tree[1], 12, 24); };
    it.lights = (L) => { if (S.ntr === 'construction') return; L.x = it.tree[0]; L.y = it.tree[1]; L.h = 20; L.r = 40; L.color = '#ffd890'; L.intensity = 0.9; L.glow = undefined; R.lights.push(L); };
    it.night = (a) => { if (S.ntr === 'construction') return; if (K.bulbRing) { K.bulbRing(it.tree[0], it.tree[1], 13, 26, 18, '#ffe070', '#60ff90'); K.bulbRing(it.tree[0] + 5, it.tree[1] - 2, 11, 19, 14, '#ffe070', '#ff60a0'); } glow(it.fall[0], it.fall[1], 6, 12, '#60c0ff', a * 0.5); };
    it.groundKey = () => S.ntr;
    it.ground = (g) => {
      if (S.ntr === 'construction') {
        g.fillStyle = 'rgba(181,105,74,0.92)'; g.beginPath(); g.moveTo(it.poly[0][0], it.poly[0][1]); for (const q of it.poly) g.lineTo(q[0], q[1]); g.closePath(); g.fill();
        g.fillStyle = 'rgba(140,130,120,0.6)'; const rng = U.rng('ntrc'); for (let i = 0; i < 20; i++) g.fillRect(it.x0 + 30 + rng.next() * it.w, it.y0 + 50 + rng.next() * it.d, 2 + rng.next() * 4, 1.5 + rng.next() * 3);
        return;
      }
      for (const b of it.beds) {
        g.fillStyle = 'rgba(110,70,44,0.85)'; g.beginPath(); g.ellipse(b[0], b[1], b[2] + 1, b[2] * 0.6 + 1, 0.3, 0, TAU); g.fill();
        g.fillStyle = b[3];
        for (let i = 0; i < 26; i++) { const a = i * 2.4, rr = Math.sqrt((i % 9) / 9) * b[2]; g.beginPath(); g.arc(b[0] + Math.cos(a) * rr, b[1] + Math.sin(a) * rr * 0.6, 1.05, 0, TAU); g.fill(); }
        g.strokeStyle = 'rgba(250,250,240,0.7)'; g.lineWidth = 0.5; g.beginPath(); g.ellipse(b[0], b[1], b[2] + 1.3, b[2] * 0.6 + 1.3, 0.3, 0, TAU); g.stroke();
      }
      // the toy-train track (sleepers + rails)
      const L0 = it.loop;
      g.strokeStyle = 'rgba(110,90,70,0.8)'; g.lineWidth = 2.6; g.beginPath(); g.ellipse(L0.cx, L0.cy, L0.rx, L0.ry, 0, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(60,60,64,0.9)'; g.lineWidth = 0.35;
      g.beginPath(); g.ellipse(L0.cx, L0.cy, L0.rx - 0.8, L0.ry - 0.8, 0, 0, TAU); g.stroke();
      g.beginPath(); g.ellipse(L0.cx, L0.cy, L0.rx + 0.8, L0.ry + 0.8, 0, 0, TAU); g.stroke();
      // the paved entrance path
      g.fillStyle = 'rgba(214,198,164,0.85)'; g.fillRect(pl.x - 6, pl.y - 30, 12, 34);
    };
    return it;
  }
  function inPolyXY(x, y, poly) {
    let ins = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  // ---------------------------------------------------------------- street-market stalls
  const MARKET_TYPE = { patang_bazaar: 'kites', laad_bazaar: 'bangles', pathergatti: 'clothes', sultan_bazaar: 'clothes', begum_bazaar: 'sacks', abids_book_market: 'books', general_bazaar: 'toys', chappal_bazar: 'chappals', dhoolpet: 'kites' };
  const STALL_GOODS = {
    chappals(g, hl, hw, rng) { g.fillStyle = '#5a4a3a'; g.fillRect(-hl, -hw, hl * 2, hw * 2); for (let x = -hl + 0.8; x < hl - 1; x += 1.6) for (let y = -hw + 0.6; y < hw - 1; y += 2.2) { g.fillStyle = pickR(rng, ['#e8302a', '#2a5cd8', '#f2c230', '#1a1a1a', '#e85a9a', '#3a8a3a']); g.beginPath(); g.ellipse(x + 0.4, y + 0.8, 0.45, 0.9, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(x + 1.0, y + 0.8, 0.45, 0.9, 0, 0, TAU); g.fill(); } },
    clothes(g, hl, hw, rng) { g.fillStyle = '#6a4a3a'; g.fillRect(-hl, -hw, hl * 2, hw * 2); for (let x = -hl + 0.5; x < hl - 1; x += 1.8) { g.fillStyle = pickR(rng, ['#e8302a', '#2a5cd8', '#f2c230', '#f4f2ea', '#e85a9a', '#3a8a3a', '#7a3a8a']); g.fillRect(x, -hw + 0.6, 1.5, hw * 2 - 1.2); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x, -hw + 0.6, 1.5, 0.4); } },
    sacks(g, hl, hw, rng) { g.fillStyle = '#7a6a4a'; g.fillRect(-hl, -hw, hl * 2, hw * 2); for (let x = -hl + 1.4; x < hl - 1; x += 2.6) { g.fillStyle = '#c8b48a'; g.beginPath(); g.arc(x, 0, 1.2, 0, TAU); g.fill(); g.fillStyle = pickR(rng, ['#e8c040', '#c8302a', '#f4f0e4', '#7aa040', '#a0522d', '#f08a24']); g.beginPath(); g.arc(x, 0, 0.85, 0, TAU); g.fill(); } },
    toys(g, hl, hw, rng) { g.fillStyle = '#3a6a9a'; g.fillRect(-hl, -hw, hl * 2, hw * 2); for (let i = 0; i < 12; i++) { g.fillStyle = pickR(rng, ['#e8302a', '#2a5cd8', '#f2c230', '#3ac05a', '#f06aa0', '#f4f2ea']); g.fillRect(-hl + 0.6 + rng.next() * (hl * 2 - 2), -hw + 0.6 + rng.next() * (hw * 2 - 2), 1, 1); } },
    bangles(g, hl, hw, rng) { g.fillStyle = '#7a2a3a'; g.fillRect(-hl, -hw, hl * 2, hw * 2); for (let x = -hl + 1; x < hl - 0.5; x += 1.4) for (let y = -hw + 1; y < hw - 0.5; y += 1.6) { g.strokeStyle = pickR(rng, ['#d8202a', '#2a9a3a', '#e8b020', '#2a5cd8', '#c030a0']); g.lineWidth = 0.35; g.beginPath(); g.arc(x, y, 0.55, 0, TAU); g.stroke(); } },
  };
  function makeMarket(pl) {
    const type = MARKET_TYPE[pl.id] || 'toys';
    const W = N.world, SUR = N.SURF;
    const rng = U.rng('mk:' + pl.id);
    const stalls = [];
    const tries = 80;
    nearList = N.WORLD_DATA.landmarks.filter((l) => Math.abs(l.x - pl.x) < 80 + l.w && Math.abs(l.y - pl.y) < 80 + l.d);
    const okAt = (x, y) => { const q = W.surfaceAt(x, y); return q === SUR.FOOTPATH || q === SUR.PLAZA || q === SUR.GROUND || q === SUR.SAND; };
    for (let t = 0; t < tries && stalls.length < 5; t++) {
      const a = rng.next() * TAU, r = 10 + rng.next() * 30;
      const x = pl.x + Math.cos(a) * r, y = pl.y + Math.sin(a) * r;
      if (!okAt(x, y)) continue;
      if (Math.hypot(pl.x - x, pl.y - y) < 8) continue;
      if (stalls.some((q) => Math.hypot(q.x - x, q.y - y) < 13)) continue;
      if (nearLandmark(x, y, 8)) continue;
      const rp = W.nearestRoadPoint ? W.nearestRoadPoint(x, y) : null;
      const ang = rp ? rp.angle || 0 : 0, ca = Math.cos(ang), sa = Math.sin(ang);
      let ok = true;
      for (const [u, v] of [[-5.5, -3.5], [5.5, -3.5], [5.5, 3.5], [-5.5, 3.5], [0, 6], [0, -6]]) { if (!okAt(x + ca * u - sa * v, y + sa * u + ca * v) || !W.isWalkable(x + ca * u - sa * v, y + sa * u + ca * v)) { ok = false; break; } }
      if (!ok) continue;
      // which side faces away from the road (the wall side: the vendor stands there)
      let wx = -sa, wy = ca;
      if (rp && (wx * (x - rp.x) + wy * (y - rp.y)) < 0) { wx = -wx; wy = -wy; }
      stalls.push({ x, y, a: ang, ca, sa, wx, wy, seed: (rng.next() * 1e5) | 0, tarp: pickR(rng, [['#2a5cb8', '#2a5cb8'], ['#d8402a', '#f4e8d0'], ['#f2c230', '#e8302a'], ['#2a8c82', '#f4e8d0']]) });
    }
    nearList = null;
    if (!stalls.length) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of stalls) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
    const it = { id: pl.id, kind: 'market:' + type, x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0 + 20, d: y1 - y0 + 20, x0: x0 - 16, y0: y0 - 26, x1: x1 + 16, y1: y1 + 10, stalls };
    it.people = [];
    for (const s of stalls) {
      it.people.push(person(pickR(rng, ['man', 'uncle', 'lungi']), s.seed % 13, s.x + s.wx * 4.6, s.y + s.wy * 4.6, Math.atan2(-s.wy, -s.wx), { sway: 0.4 }));
      for (let i = 0; i < 2; i++) { const e = i ? 1 : -1; it.people.push(person(pickR(rng, ['woman', 'man', 'kid', 'aunty', 'burqa', 'student']), (s.seed + i * 5) % 29, s.x + s.ca * e * 7.5 + s.wx * 1.5, s.y + s.sa * e * 7.5 + s.wy * 1.5, Math.atan2(-s.sa * e, -s.ca * e), { sway: 0.6, turn: 0.4 })); }
    }
    it.actors = () => drawPeople(it.people, S.min < 540 || S.min > 1290 ? 0 : (type === 'books' && S.weekday !== 0) ? 3 : it.people.length);
    it.draw = () => {
      for (const s of stalls) {
        if (type === 'kites') { drawCartA('kite_stall', cartPropA('kite_stall', s.x, s.y, s.a, s.seed)); continue; }
        if (type === 'books') { drawCartA('book_stall', cartPropA('book_stall', s.x, s.y, s.a, s.seed)); continue; }
        obox(s.x, s.y, s.ca, s.sa, 4.6, 2.4, 0, 3, '#7a5a3a', null);
        const img = loadImg('stall:' + type + ':' + (s.seed % 4), 4.4, 2.2, STALL_GOODS[type] || STALL_GOODS.toys);
        spr(s.x, s.y, s.ca, s.sa, 3.05); ctx.imageSmoothingEnabled = true; ctx.drawImage(img, -4.4, -2.2, 8.8, 4.4); ctx.imageSmoothingEnabled = false; ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (type === 'clothes') { // a rail of hanging shirts behind the table
          const bx = s.x + s.sa * 2.4, by = s.y - s.ca * 2.4;
          seg3(bx - s.ca * 5, by - s.sa * 5, 8, bx + s.ca * 5, by + s.sa * 5, 8, '#5a5a5a', 0.4);
          for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5 - 0.5, hx = bx + s.ca * 10 * t, hy = by + s.sa * 10 * t; seg3(hx, hy, 8, hx, hy, 4.5, ['#e8302a', '#2a5cd8', '#f2c230', '#f4f2ea', '#3a8a3a'][(i + s.seed) % 5], 1.4); }
        }
        if (type === 'toys') for (let i = 0; i < 5; i++) { const bx = s.x - s.ca * 5 + i * 0.6, by = s.y - s.sa * 5, h = 10 + Math.sin(TIME * 1.5 + i) * 0.6; seg3(bx, by, 3, bx + (i - 2) * 0.6, by, h, 'rgba(240,240,240,0.7)', 0.2); disc(bx + (i - 2) * 0.6, by, 1.1, h, ['#e8302a', '#2a5cd8', '#f2c230', '#3ac05a', '#f06aa0'][i]); }
        // tarp on four poles
        for (const [u, v] of [[-4.8, 2.6], [4.8, 2.6]]) pole(s.x + s.ca * u + s.wx * v, s.y + s.sa * u + s.wy * v, 0, 9, '#8a6a3a', 0.35);
        // a tarp over the vendor's half, sloping down to the front
        const tx0 = s.x + s.wx * 5.6, ty0 = s.y + s.wy * 5.6, tx1 = s.x + s.wx * 1.6, ty1 = s.y + s.wy * 1.6;
        quad3(tx0 - s.ca * 5.6, ty0 - s.sa * 5.6, 9.4, tx0 + s.ca * 5.6, ty0 + s.sa * 5.6, 9.4, tx1 + s.ca * 5.6, ty1 + s.sa * 5.6, 8.4, tx1 - s.ca * 5.6, ty1 - s.sa * 5.6, 8.4);
        fillc(s.tarp[0]);
        if (s.tarp[1] !== s.tarp[0]) { ctx.beginPath(); for (let u = -5.6; u < 5.6; u += 2.8) { mv(tx0 + s.ca * u, ty0 + s.sa * u, 9.45); ln(tx0 + s.ca * (u + 1.4), ty0 + s.sa * (u + 1.4), 9.45); ln(tx1 + s.ca * (u + 1.4), ty1 + s.sa * (u + 1.4), 8.45); ln(tx1 + s.ca * u, ty1 + s.sa * u, 8.45); ctx.closePath(); } fillc(s.tarp[1]); }
      }
    };
    it.shadow = () => { for (const s of stalls) N.draw.castCircle(s.x + s.wx * 1.5, s.y + s.wy * 1.5, 4, 9); };
    it.lights = (L) => { L.x = it.x; L.y = it.y; L.h = 8; L.r = 50; L.color = '#ffd890'; L.intensity = 0.8; L.glow = undefined; R.lights.push(L); };
    it.night = () => { if (K.bulbs && stalls.length > 1) for (let i = 1; i < stalls.length; i++) K.bulbs(stalls[i - 1].x, stalls[i - 1].y, 9.3, stalls[i].x, stalls[i].y, 9.3, 8, '#ffe070', S.chandRaat ? '#60ff90' : '#ff9a40', 1.2); };
    return it;
  }
  function initDecor() {
    if (DECOR.length || !N.WORLD_DATA || !N.world || !N.world.built) return;
    const D = N.WORLD_DATA;
    const parks = {}; for (const p of D.parks || []) parks[p.id] = p;
    const lmIds = new Set(D.landmarks.map((l) => l.id));
    for (const pl of D.places || []) {
      if (pl.alias && parks[pl.alias] && pl.kind === 'playground') continue; // playground_1 = playground_home
      let it = null;
      try {
        if (pl.kind === 'playground' && parks[pl.id]) it = makePlayground(pl, parks[pl.id]);
        else if (pl.id === 'ntr_gardens' && parks[pl.id]) it = makeNtr(pl, parks[pl.id]);
        else if (pl.kind === 'market' && !lmIds.has(pl.id) && MARKET_TYPE[pl.id]) it = makeMarket(pl);
      } catch (e) { N.err('placesArt.decor:' + pl.id, e); }
      if (!it) continue;
      it.L = { x: 0, y: 0, r: 40, color: '#ffd890', intensity: 1, h: 0 };
      it.fn = timed(() => { frame(); try { it.draw(); } catch (e) { N.err('placesArt.decorDraw:' + it.id, e); } reset(); });
      if (it.actors) it.afn = timed(() => { frame(); try { it.actors(); } catch (e) { N.err('placesArt.decorActors:' + it.id, e); } reset(); });
      if (it.night) it.nfn = timed(() => { frame(); try { it.night(clamp(NIGHT * 1.2, 0, 1)); } catch (e) { N.err('placesArt.decorNight:' + it.id, e); } reset(); });
      DECOR.push(it);
    }
    // repaint the chunks under the decorations that paint ground art
    for (const it of DECOR) if (it.ground) { it._gk = it.groundKey ? it.groundKey() : null; N.render.invalidateChunks([it.x0, it.y0, it.x1 - it.x0, it.y1 - it.y0]); }
  }
  function paintDecorGround(g, x0, y0, w, h) {
    for (const it of DECOR) {
      if (!it.ground || it.x1 < x0 || it.x0 > x0 + w || it.y1 < y0 || it.y0 > y0 + h) continue;
      g.save(); try { it.ground(g); } catch (e) { N.err('placesArt.decorGround:' + it.id, e); } g.restore();
    }
  }
  function drawDecor() {
    const sun = R.sun.strength > 0.18, night = NIGHT > 0.04;
    for (const it of DECOR) {
      if (!inView(it.x0, it.y0, it.x1, it.y1, 60)) continue;
      if (it.groundKey) { const k = it.groundKey(); if (k !== it._gk) { it._gk = k; R.invalidateChunks([it.x0, it.y0, it.x1 - it.x0, it.y1 - it.y0]); } }
      if (sun && it.shadow) { try { it.shadow(); } catch (e) { N.err('placesArt.decorShadow:' + it.id, e); } }
      if (!inView(it.x0, it.y0, it.x1, it.y1, 10)) continue;
      R.queue('structures', R.distKey(it.x, it.y), it.fn);
      if (it.afn) R.queue('actors', it.y, it.afn);
      if (night) {
        if (it.lights) it.lights(it.L);
        if (it.nfn) R.queue('light', 6, it.nfn);
      }
    }
  }

  /* ================================================================ solid parked buses */
  function solidBuses() {
    const W = N.world, grid = W && W.grid;
    if (!grid) return;
    const CELL = N.CELL, SUR = N.SURF, GW = W.GW, GH = W.GH;
    const places = (N.WORLD_DATA.places || []);
    for (const id in BUS_SLOTS) {
      for (const b of BUS_SLOTS[id]) {
        const a = (b[2] * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
        const near = places.filter((p) => Math.hypot(p.x - b[0], p.y - b[1]) < 60);
        for (let u = -29; u <= 29; u += CELL / 2) for (let v = -7.5; v <= 7.5; v += CELL / 2) {
          const x = b[0] + ca * u - sa * v, y = b[1] + sa * u + ca * v;
          if (near.some((p) => Math.hypot(p.x - x, p.y - y) < 9)) continue;
          const i = Math.floor(x / CELL), j = Math.floor(y / CELL);
          if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
          const s = grid[j * GW + i];
          if (s === SUR.ROAD || s === SUR.PLAZA || s === SUR.GROUND || s === SUR.FOOTPATH) grid[j * GW + i] = SUR.SOLID;
        }
      }
    }
  }

  /* ================================================================ drawProp API */
  const PROP_CARTS = ['banana_cart', 'flower_cart', 'samosa_bandi', 'dosa_bandi', 'coconut_cart', 'chai_bandi', 'kite_stall', 'book_stall'];
  const propLms = new Map();
  function faceFromAngle(a) { const c = Math.cos(a), s = Math.sin(a); return Math.abs(c) > Math.abs(s) ? (c > 0 ? 'e' : 'w') : (s > 0 ? 's' : 'n'); }
  function propLandmark(kind, x, y, angle, opts) {
    const key = kind + '|' + Math.round(x) + '|' + Math.round(y) + '|' + faceFromAngle(angle) + '|' + ((opts && opts.sign) || '');
    let lm = propLms.get(key);
    if (lm) return lm;
    const SIZE = { std_booth: [12, 12, 15], bus_stop: [32, 10, 16], kirana: [26, 20, 22], stationery: [24, 18, 22], pindi_girni: [30, 24, 24], irani_cafe: [40, 28, 22], water_tank: [22, 22, 60], playground_kit: [18, 10, 14], film_hoarding: [30, 6, 40] };
    const sz = SIZE[kind] || [24, 20, 22];
    const f = faceFromAngle(angle), rot = f === 'e' || f === 'w';
    lm = { id: 'prop:' + key, draw: kind, x, y, w: rot && kind !== 'water_tank' ? sz[1] : sz[0], d: rot && kind !== 'water_tank' ? sz[0] : sz[1], h: sz[2], face: f, sign: (opts && opts.sign) || undefined, film: opts && opts.film };
    if (propLms.size > 120) propLms.clear();
    propLms.set(key, lm);
    lm._pa = DEFS[kind].init ? DEFS[kind].init(lm) : {};
    return lm;
  }
  const PROPS = {
    sintex_tank(x, y, a, o) { const h = (o && o.h) || 0; cyl(x, y, 2.3, h, h + 4.2, '#2c3036', '#3b4048'); ring(x, y, 1.3, h + 4.2, '#555b63', 0.4); },
    antenna(x, y, a, o) { const h = (o && o.h) || 0; const k0 = kh(h), k1 = kh(h + 10), ca = Math.cos(a), sa = Math.sin(a); ctx.beginPath(); ctx.moveTo(sx(x, k0), sy(y, k0)); ctx.lineTo(sx(x, k1), sy(y, k1)); for (let i = 0; i < 3; i++) { const kk = kh(h + 10 - i * 2.2), L = 4.4 - i; ctx.moveTo(sx(x - ca * L, kk), sy(y - sa * L, kk)); ctx.lineTo(sx(x + ca * L, kk), sy(y + sa * L, kk)); } ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = 0.6; ctx.stroke(); },
    stumps(x, y, a) { stumps(x, y, Math.cos(a), Math.sin(a)); },
    swing(x, y, a) { swingSet(x, y, Math.cos(a), Math.sin(a), 14, 11, x * 0.1, 2); },
    slide(x, y, a) { slide(x, y, Math.cos(a), Math.sin(a), 7); },
    seesaw(x, y, a) { seesaw(x, y, Math.cos(a), Math.sin(a), y * 0.1); },
    sack(x, y, a, o) { cyl(x, y, 1.5, 0, 2.4, '#c8b48a', '#c8b48a'); disc(x, y, 1.15, 2.45, (o && o.color) || '#e8c040'); },
    crate(x, y, a, o) { obox(x, y, Math.cos(a), Math.sin(a), 1.6, 1.2, 0, 1.8, (o && o.color) || '#c8302a', '#2a201a'); },
    cycle(x, y, a, o) { cycleProp(x, y, a, (o && o.color) || '#1a1a1e', 2.2); },
    bus(x, y, a, o) { artBus(x, y, a, (o && o.livery) || 'city', o && o.route); },
    hoarding(x, y, a, o) { const w = (o && o.w) || 36, d = (o && o.d) || 20; pole(x - w * 0.36, y, 0, 28, '#5a5a62', 0.6); pole(x + w * 0.36, y, 0, 28, '#5a5a62', 0.6); drawFilmBoard((o && o.film) || 'JAI HYDERABAD', x - w / 2, y - d / 2, w, d, 29); },
    pandal(x, y, a) { pandal(x, y, Math.cos(a), Math.sin(a), NIGHT > 0.2); },
    haleem_bhatti(x, y, a, o) { haleemBhatti(x, y, (o && o.seed) || x); },
    ice_gola(x, y, a) { const ca = Math.cos(a), sa = Math.sin(a); obox(x, y, ca, sa, 3, 1.8, 2.6, 4, '#3a6a9a', '#4a7aaa'); for (let i = 0; i < 4; i++) disc(x + ca * (i - 1.5) * 1.3, y + sa * (i - 1.5) * 1.3, 0.5, 4.6, ['#e8203a', '#f2c230', '#30c050', '#f06aa0'][i]); umbrella(x, y, 4.5, 9, '#f2c230', '#e8203a', 6); },
    umbrella(x, y, a, o) { pole(x, y, 0, 12, '#6a6a6a', 0.5); umbrella(x, y, (o && o.r) || 7, 12, (o && o.c1) || '#d8402a', (o && o.c2) || '#f4e8d0', 8, a); },
    steam(x, y, a, o) { steam(x, y, (o && o.h) || 6, 3, x, '#f6f4ee', 1); },
    nandi(x, y, a) { nandi(x, y, a); },
    jcb(x, y, a) { jcb(x, y, a, TIME); },
    tower_crane(x, y, a, o) { towerCrane(x, y, (o && o.h) || 50, a, (o && o.jib) || 30); },
  };
  function drawProp(kind, x, y, angle, opts) {
    frame(); sw();
    const a = angle || 0;
    try {
      if (PROP_CARTS.indexOf(kind) >= 0) { drawCartA(kind, cartPropA(kind, x, y, a, opts && opts.seed)); return true; }
      if (PROPS[kind]) { PROPS[kind](x, y, a, opts); return true; }
      if (DEFS[kind]) { const lm = propLandmark(kind, x, y, a, opts); DEFS[kind].draw(lm, lm._pa); return true; }
    } catch (e) { N.err('placesArt.drawProp:' + kind, e); } finally { reset(); }
    return false;
  }
  function queueProp(kind, x, y, angle, opts) {
    if (!N.render || !N.render.view) return;
    frame();
    if (!inView(x - 20, y - 20, x + 20, y + 20, 30)) return;
    if (R.sun.strength > 0.18) N.draw.castCircle(x, y, 5, 8);
    R.queue('structures', R.distKey(x, y), () => drawProp(kind, x, y, angle, opts));
  }


  /* ================================================================ ground painter hook */
  // Same technique as world_extras.js: compose our static ground art (playground pitches, NTR
  // Gardens beds + train loop, construction soil) after world.js's painter. world.js installs
  // its painter inside N.world.build(), after every script (and this wrapper) has loaded.
  (function wrapGround() {
    const Rr = N.render;
    if (!Rr || !Rr.setGroundPainter || Rr.setGroundPainter._placesArt) return;
    const prevSet = Rr.setGroundPainter;
    Rr.setGroundPainter = function (fn) {
      if (typeof fn !== 'function') return prevSet.call(Rr, fn);
      const composed = function (g, x0, y0, w, h) {
        fn(g, x0, y0, w, h);
        try { paintDecorGround(g, x0, y0, w, h); } catch (e) { N.err('placesArt.ground', e); }
      };
      composed.base = fn;
      return prevSet.call(Rr, composed);
    };
    Rr.setGroundPainter._placesArt = true;
  })();

  /* ================================================================ system */
  let initMs = 0, initParts = null;
  function onBuilt() {
    const t0 = now();
    const t1 = now();
    try { initDecor(); } catch (e) { N.err('placesArt.decor', e); }
    const t2 = now();
    try { solidBuses(); } catch (e) { N.err('placesArt.buses', e); }
    initParts = [t1 - t0, t2 - t1, now() - t2];
    for (const it of DECOR) if (it.people && !it.actors) addPeople(null, it);
    initMs = now() - t0;
  }
  N.addSystem({
    id: 'placesArt', order: 43, runIn: ['*'],
    init() { if (N.world && N.world.built && !DECOR.length) onBuilt(); },
    reset() { },
    update(dt) {
      sw();
      if (S.numaish) { wheel.a += dt * 0.12; mautBike.a += dt * 3.4; }
    },
    draw() {
      if (!N.world || !N.world.built) return;
      const t0 = now();
      frame(); sw();
      const v = R.view, m = 30;
      for (let i = 0; i < PEOPLE.length; i++) {
        const e = PEOPLE[i];
        if (e.x1 < v.x0 - m || e.x0 > v.x1 + m || e.y1 < v.y0 - m || e.y0 > v.y1 + m) continue;
        R.queue('actors', (e.y0 + e.y1) / 2, e.fn);
      }
      drawDecor();
      perfAdd(t0);
    },
  });
  N.on('world:built', onBuilt);

  N.placesArt = {
    version: 1, fx, defs: DEFS, S, PROPS: Object.keys(PROPS).concat(PROP_CARTS, Object.keys(DEFS).filter((k) => PROP_CARTS.indexOf(k) < 0)),
    drawProp, queueProp,
    /** the hand-painted film board for a (fictional) title as a cached canvas (w x d world units, 4 px a unit;
     *  the dark band at the bottom is left for the title): src/hoardings.js paints its film posters with it */
    filmBoard: (title, w, d) => filmBoard(title, w, d), FILMS,
    switches() { return sw(); },
    prepareAll() { initAll(); },
    perf() { return { ms: +PERF.last.toFixed(3), calls: PERF.lastCalls, initMs: +initMs.toFixed(1), initParts: initParts && initParts.map((v) => +v.toFixed(1)), sprites: pImg.size }; },
    decorList() { return DECOR.map((d) => ({ id: d.id, kind: d.kind, x: d.x, y: d.y, w: d.w, d: d.d })); },
    variant(id) {
      sw();
      if (id === 'prasads_imax') return S.prasads;
      if (id === 'ntr_gardens') return S.ntr;
      if (id === 'hitex') return S.hitex;
      if (/numaish|giant_wheel|maut_ka_kuan|exhibition/.test(id)) return S.numaish ? 'open' : 'closed';
      if (/^playground_/.test(id)) return S.ganesh ? 'pandal' : 'default';
      return 'default';
    },
  };
})();
