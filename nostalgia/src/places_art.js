/* NOSTALGIA — places_art.js  (owner: street-life artist)
 *
 * Pseudo-3D art for the civic / transport / market / cinema draw ids of N.WORLD_DATA.landmarks
 * (design/map_plan.md §4b) and the everyday street life of 1990s/2003 Hyderabad: kirana stores,
 * Irani cafes, pindi girnis, stationery shops, pushcarts (banana, flower, samosa, dosa, coconut,
 * chai), STD booths, bus stops, schools, colony playgrounds, cinemas with hand-painted hoardings
 * (fictional films only), Koti bus stand, Imlibun (MGBS), Gokul Chat, Rythu Bazaars, Numaish,
 * Prasads IMAX (fence / opening day / open), NTR Gardens (open / work in progress)...
 * Everything is data driven: a landmark's `draw` id picks its art, `face` its shopfront side,
 * `sign` / `films` / `variant` / `era` / `seasonal` its details; place kinds without a landmark
 * (playground_*, ntr_gardens, street markets) get decorations from N.WORLD_DATA.places.
 *
 * Loads after src/landmarks.js and registers its draw ids with N.landmarks.register(drawId, def)
 * using the kit-style defs {init, draw, shadow, lights, night, floor, ground} (landmarks.js calls
 * them with its frame state set, reports errors through N.err and falls back to drawDefault).
 * It deliberately does NOT register mozamjahi_market, railway_station, lb_stadium,
 * airport_terminal and control_tower: src/landmarks.js already has fine art for those
 * (agreed split; register them here later to override if needed).
 *
 * Hooks added from this file only (no core file is edited):
 *  - a system 'placesArt' (order 43, every mode) animates the mini train, the giant wheel, the
 *    see-saws... and in draw() queues people (vendors, queues, crowds) on the 'actors' layer,
 *    casts shadows, pushes night lights and queues the place-driven decorations (playground
 *    kits, NTR Gardens, street-market stalls, Ganesh pandals) on 'structures' / 'light'.
 *  - wraps N.render.setGroundPainter (composed after world.js's painter, before world_extras.js
 *    rails, same technique as world_extras.js) to paint cricket pitches in colony playgrounds,
 *    the NTR Gardens train loop / flower beds and market floors into the static ground chunks.
 *  - on 'world:built' makes the parked buses in bus termini / MGBS / the CBS hangar solid in the
 *    collision grid (never within 14 u of a place point) so you cannot drive through them.
 *
 * API: N.placesArt = {
 *   drawProp(kind, x, y, angle, opts)   draw a prop now (call inside a render-queue callback);
 *                                       kinds: see N.placesArt.PROPS (banana_cart, flower_cart,
 *                                       samosa_bandi, dosa_bandi, coconut_cart, chai_bandi,
 *                                       kite_stall, book_stall, std_booth, bus_stop, sintex_tank,
 *                                       antenna, stumps, swing, slide, seesaw, sack, crate,
 *                                       cycle, hoarding, pandal, haleem_bhatti, ice_gola, ...)
 *   queueProp(kind, x, y, angle, opts)  same, queued on 'structures' this frame (+ shadow)
 *   fx: { prasads: null|'fence'|'opening'|'open', ntr: null|'open'|'construction',
 *         numaish, ganesh, sankranti, ramzan, chandRaat, summer, worldCup: null(auto)|bool,
 *         hitex: null|'construction'|'open' }   story overrides; null = automatic
 *   variant(id)                          current art variant of a landmark/place id
 *   PROPS, version }
 * Automatic switches (when fx.* is null) read N.flags (flag, N.flags.festival === id or
 * N.flags.festivals[]) and the in-game date (N.clock.baseDate + day):
 *   prasads_open / prasads (='fence'|'opening'|'open') / date >= 25 Jul 2003  -> Prasads open,
 *   prasads_opening or 25 Jul 2003 -> opening-day banners + crowd; ntr_construction /
 *   ntr_gardens_construction -> NTR Gardens work in progress (default: open, since 2001);
 *   numaish (or Jan 1 - Feb 15) -> Numaish stalls open, wheel turning; ganesh -> pandals in
 *   playgrounds, idol workshops busy; sankranti -> kites; ramzan -> haleem bhattis at Old City
 *   hotels; chand_raat -> bangle shops lit; summer -> ice-gola carts at school gates;
 *   world_cup -> crowds at shop TVs; hitex_open or date >= 14 Jan 2003 -> HITEX built.
 * Performance: facades use the kit's cached facade geometry; roofs, hoardings, vegetable heaps
 * and people are cached sprites; signs are fitted once per zoom bucket; everything is culled
 * to the view; per-frame work is allocation free in the hot loops.
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
    ctx.drawImage(p.img, -PSZ / 2, -PSZ / 2);
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
    return { kind, x, y, a, img: personImg(kind, i, o.look), ph: (i * 1.7 + x * 0.13) % TAU, sway: o.sway == null ? 0.6 : o.sway, sp: o.sp || 1.3, turn: o.turn || 0, t0: o.t0, t1: o.t1, need: o.need || 0 };
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
    S.ganesh = fx.ganesh != null ? !!fx.ganesh : flagOn('ganesh') || flagOn('ganesh_chaturthi') || flagOn('vinayaka_chavithi') || flagOn('ganesh_immersion');
    S.sankranti = fx.sankranti != null ? !!fx.sankranti : flagOn('sankranti') || (F.sankranti !== false && md >= 110 && md <= 116);
    S.ramzan = fx.ramzan != null ? !!fx.ramzan : flagOn('ramzan') || flagOn('chand_raat') || flagOn('ramadan');
    S.chandRaat = fx.chandRaat != null ? !!fx.chandRaat : flagOn('chand_raat') || flagOn('eid');
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
  const FILLER = new Set(['SRI', 'SHRI', 'NEW', 'THE', '&', 'AND', 'HOTEL']);
  const fitCache = new Map();
  function splitWord(wd, maxPx) {
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
      const t = cur ? cur + ' ' + w : w;
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
  function fitLines(text, maxPx, maxLines) {
    maxPx = Math.floor(maxPx);
    const key = text + '|' + maxPx + '|' + maxLines;
    if (fitCache.has(key)) return fitCache.get(key);
    const words = String(text).toUpperCase().replace(/[^A-Z0-9 &'.\-/+:!]/g, ' ').split(/\s+/).filter(Boolean);
    let res = null;
    const tries = [words, words.filter((w) => !FILLER.has(w))];
    if (words.length > 1) tries.push(words.filter((w) => !FILLER.has(w)).slice(0, -1));
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
    for (const [ic, n] of tries) {
      if (n === 1 && ic === null && !iconName) continue;
      const avail = (len - (ic ? 9.5 : 1.5)) * k0;
      const l = text ? fitLines(text, avail, n) : null;
      if (l) { lines = l; useIcon = !!ic; break; }
    }
    if (!text) useIcon = !!iconName;
    const maxW = lines ? Math.max.apply(null, lines.map(pw)) : 0;
    A.sign = { text: text || '', bg, fg: fg || '#fff6e0', icon: iconName, useIcon, lines, maxW, over, len,
      deep: lines && lines.length === 2 ? 12.5 : 7.5, h0: o.h0 || 0.8, lift: o.lift || 3.6, frame: o.frame || '#2a201c', lit: o.lit !== false };
  }
  const SP = new Float64Array(12);
  function signPts(A, h) {
    const F = A.F, s = A.sign;
    const u0 = -F.L / 2 - s.over, u1 = F.L / 2 + s.over, vF = 1.2, vB = vF - s.deep;
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
    // inset face (shrunk towards the centre by ~0.6 u)
    const mx = (p[0] + p[3] + p[6] + p[9]) / 4, my = (p[1] + p[4] + p[7] + p[10]) / 4;
    const fx0 = 0.6 / Math.max(3, s.deep * 0.5), fx1 = 0.6 / Math.max(3, (s.len + 1.6) * 0.5);
    const ins = (px, c, f) => px + (c - px) * f;
    const fA = Math.max(fx0, fx1);
    quad3(ins(p[0], mx, fA), ins(p[1], my, fA), p[2] + 0.1, ins(p[3], mx, fA), ins(p[4], my, fA), p[5] + 0.1, ins(p[6], mx, fA), ins(p[7], my, fA), p[8] + 0.1, ins(p[9], mx, fA), ins(p[10], my, fA), p[11] + 0.1);
    if (lit) { ctx.globalAlpha = lit; fillc(s.bg); ctx.globalAlpha = 1; } else fillc(s.bg);
    // icon + text, laid out along the reading direction (screen-aligned pixel text)
    const hm = (p[2] + p[8]) / 2, kk = kh(hm);
    const showText = s.lines && s.maxW <= (s.len - (s.useIcon ? 9.5 : 1.5)) * kk + 0.5;
    const showIcon = s.icon && (s.useIcon || !showText);
    const tw = showText ? s.maxW / kk : 0;
    const total = tw + (showIcon ? (showText ? 9 : 7) / kk : 0);
    const vM = 1.2 - s.deep / 2;
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
  function reg(drawId, def) {
    DEFS[drawId] = def;
    const wrapped = {
      init(lm) { if (lm._pa) return; frame(); lm._pa = def.init ? def.init(lm) : {}; if (lm._pa && lm._pa.people) addPeople(lm, lm._pa); },
      draw(lm) { frame(); sw(); def.draw(lm, lm._pa || (lm._pa = {})); },
      shadow: def.shadow ? (lm) => { frame(); def.shadow(lm, lm._pa || {}); } : (lm) => { if (lm._pa && lm._pa.rr) castMain(lm._pa); else N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, (lm.h || 10) * 0.8); },
      lights: def.lights ? (lm) => { frame(); def.lights(lm, lm._pa || {}); } : undefined,
      night: def.night ? (lm, a) => { frame(); sw(); def.night(lm, lm._pa || {}, a); } : undefined,
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
    e.fn = () => { frame(); const n = A.count ? A.count(A) : A.people.length; drawPeople(A.people, Math.min(n, A.people.length)); };
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
    const R0 = SHOP[kind];
    const A = baseState(lm, R0);
    A.kind = kind;
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
    const R0 = SHOP[A.kind];
    const front = camFront(A.F);
    if (!front && R0.goods) R0.goods(lm, A); // camera behind: goods first, the building leans over them
    building(A);
    if (A.awn) awning(A.F, -A.F.L / 2 + 0.6, A.F.L / 2 - 0.6, A.awn.d, Math.min(A.h - 1, 9.6), Math.min(A.h - 1, 9.6) - 1.8, A.awn.c1, A.awn.c2, 1.4);
    drawSign(A, A.h, 0);
    if (R0.extra) R0.extra(lm, A);
    if (front && R0.goods) R0.goods(lm, A);
  }
  function shopLights(lm, A) {
    const R0 = SHOP[A.kind], F = A.F;
    const col = R0.glow || '#ffd890';
    light(lm, 0, 2, fxp(F, 0, 3), fyp(F, 0, 3), 3, Math.min(34, 14 + F.L * 0.6), col, 0.85);
    if (R0.lights) R0.lights(lm, A);
  }
  function shopNight(lm, A, a) {
    nightSign(A, A.h, a);
    const R0 = SHOP[A.kind];
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
      for (let i = 0; i < n; i++) sack(F, -L / 2 + 2.6 + i * 3.6, 4.2, 1.5, grains[(i + A.rr.x | 0) % grains.length]);
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
      draw(lm, A) {
        const C = A.C;
        cartBody(C, A.bed, recipe.hBed);
        if (recipe.load) drawLoad(C, loadImg(kind + ':' + (A.seed % 3) + ':' + C.hl + 'x' + C.hw, C.hl - 0.4, C.hw - 0.4, recipe.load), (recipe.hBed || 5.2) + 0.15);
        if (recipe.extra) recipe.extra(lm, A, C);
        if (A.umb) {
          const ux = cx_(C, -C.hl + 2.2, 0), uy = cy_(C, -C.hl + 2.2, 0);
          pole(ux, uy, 5, 12.5, '#6a6a6a', 0.5);
          umbrella(ux + C.ca * 2.6, uy + C.sa * 2.6, recipe.umbR || 7.5, 12.5, A.umb[0], A.umb[1], 8, (A.seed % 7) * 0.2);
        }
      },
      shadow(lm, A) { cartShadow(A.C, 6); if (A.umb) N.draw.castCircle(cx_(A.C, -A.C.hl + 4.8, 0), cy_(A.C, -A.C.hl + 4.8, 0), recipe.umbR || 7.5, 12.5); },
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
    umbrella: [['#d8402a', '#f4e8d0'], ['#2a5cb8', '#f2c230']], umbR: 6.5,
    extra(lm, A, C) { // a bunch hanging from the umbrella pole
      const x = cx_(C, -C.hl + 2.2, 0.8), y = cy_(C, -C.hl + 2.2, 0.8);
      seg3(x, y, 11.5, x, y, 8.8, '#5a4a2a', 0.3);
      disc(x, y, 1.3, 8.6, '#f2d23a'); disc(x + 0.4, y + 0.3, 0.7, 8.9, '#e0b820');
    },
    count() { return S.min > 1290 || S.min < 420 ? 1 : 3; },
  });
  regCart('flower_cart', {
    beds: ['#2a7a5a', '#3a6a9a', '#7a5a2a'], load: paintFlowers, vendor: 'aunty', custKinds: ['woman', 'saree', 'aunty', 'man'],
    umbrella: [['#f2c230', '#d8402a'], ['#2a8c82', '#f4e8d0'], ['#e85a9a', '#f4e8d0']], umbR: 6.5,
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
    beds: ['#6a4a2a', '#3a6a9a'], load: paintCoconuts, vendor: 'man', umbrella: [['#3a8a3a', '#f2c230'], ['#d8402a', '#f4e8d0']], umbR: 6.5,
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
      // bamboo frame with kites hanging in rows (they sway)
      const pts = [[-C.hl, -C.hw], [C.hl, -C.hw], [C.hl, C.hw], [-C.hl, C.hw]];
      for (const p of pts) pole(cx_(C, p[0], p[1]), cy_(C, p[0], p[1]), 0, 13, '#8a6a3a', 0.5);
      const kc = ['#e83a5a', '#2a5cb8', '#f2c230', '#3aa04a', '#f06a1a', '#9a3ac8'];
      const back = -C.side * (C.hw - 0.5);
      seg3(cx_(C, -C.hl, back), cy_(C, -C.hl, back), 12.6, cx_(C, C.hl, back), cy_(C, C.hl, back), 12.6, '#8a6a3a', 0.4);
      for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
        const u = -C.hl + 1.6 + i * (C.hl * 2 - 3.2) / 5, h = 11 - row * 3.2, sway = Math.sin(TIME * 2 + i + row) * 0.4;
        const x = cx_(C, u + sway, back), y = cy_(C, u + sway, back), k = kh(h);
        ctx.beginPath(); ctx.moveTo(sx(x, k), sy(y, k) - 1.6 * k); ctx.lineTo(sx(x, k) + 1.3 * k, sy(y, k)); ctx.lineTo(sx(x, k), sy(y, k) + 1.6 * k); ctx.lineTo(sx(x, k) - 1.3 * k, sy(y, k)); ctx.closePath();
        fillc(kc[(i + row * 2) % 6]);
      }
      // tarp roof (translucent so the kites read)
      const k1 = kh(13);
      ctx.globalAlpha = 0.55;
      obox(C.x, C.y, C.ca, C.sa, C.hl + 0.8, C.hw + 0.8, 13, 13.3, null, '#2a5cb8');
      ctx.globalAlpha = 1; void k1;
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
    if (!camFront(F) === false) { /* advert seen from the road side */ }
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

  /* @@PART3@@ */

  /* ================================================================ system */
  N.addSystem({
    id: 'placesArt', order: 43, runIn: ['*'],
    init() { if (N.world && N.world.built) initAll(); },
    reset() { },
    update(dt) { void dt; },
    draw() {
      if (!N.world || !N.world.built) return;
      frame(); sw();
      const v = R.view, m = 30;
      for (let i = 0; i < PEOPLE.length; i++) {
        const e = PEOPLE[i];
        if (e.x1 < v.x0 - m || e.x0 > v.x1 + m || e.y1 < v.y0 - m || e.y0 > v.y1 + m) continue;
        R.queue('actors', (e.y0 + e.y1) / 2, e.fn);
      }
    },
  });
  N.on('world:built', () => { try { initAll(); } catch (e) { N.err('placesArt.built', e); } });

  N.placesArt = {
    version: 1, fx, defs: DEFS, S,
    switches() { return sw(); },
    variant(id) {
      sw();
      if (id === 'prasads_imax') return S.prasads;
      if (id === 'ntr_gardens') return S.ntr;
      if (id === 'hitex') return S.hitex;
      if (/numaish|giant_wheel|maut_ka_kuan|exhibition/.test(id)) return S.numaish ? 'open' : 'closed';
      return 'default';
    },
  };
})();
