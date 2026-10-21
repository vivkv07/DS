/* NOSTALGIA — ameerpet.js  (N.ameerpet: the Ameerpet computer-coaching belt, 2003)
 *
 * By 2003 Ameerpet was the city's software-coaching bazaar: every building round the junction and down the
 * coaching lane was wrapped in flex banners for C, C++, Java, Oracle 9i and D2K, VB 6, the new .NET, SAP,
 * mainframes and the testing tools, with "NEW BATCH FROM MONDAY" and "FREE DEMO" underneath. This module
 * dresses the generic buildings (world.js `t:'bldg'`) of that belt:
 *   - wall banners on the storeys above the shopfront, on every wall that looks onto a street (2-3 stacked
 *     lines: institute name, course list, tag line);
 *   - a rooftop hoarding on many road-facing flat roofs;
 *   - an institute signboard over the ground floor (the core's `b.sign`) where the building has none.
 * Every institute, course line and slogan is invented (bible rule: no real brands); the course list sticks
 * to what Ameerpet taught in 2003 (no tool or language that came later).
 *
 * Deterministic: each building's dress comes from N.util.rng('ameerpet:' + id) and its distance to the
 * anchors below, so the same building wears the same banners every session.
 *
 * Hooks (nothing in the core files is edited):
 *  - 'world:built': picks the buildings, sets their `sign` where free, and adds one structure per dressed
 *    building with N.world.addStructure({t: 'custom', draw}) (2D: it is queued with the building's own sort
 *    key, after it, so the banners paint over its walls and roof).
 *  - N.view3d.registerStructure('custom', ...): builds the 3D banners for structures that carry `build3d`
 *    (any other custom structure is left to the core, which draws nothing for 'custom' in 3D). The boards
 *    use the core sign atlas (H.signSlot, held by the chunk through J.slots like the core's shop boards).
 *
 * API  N.ameerpet = {ANCHORS, INSTITUTES, COURSES, TAGS, TUNE, dressed (structures), stats() -> {buildings,
 *   banners, hoardings, signs}, dressOf(bldg) -> structure | null}   (the belt is re-dressed on every
 *   'world:built': a rebuilt world has new buildings)
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;

  /* ================================================================ vocabulary (fictional, 2003) */
  // institutes: name + their flex colours (name line)
  const INSTITUTES = [
    { n: 'QUBIT INFOTECH', s: 'QUBIT', bg: '#c81a1a', fg: '#ffffff' },
    { n: 'VERTEX SOFT SOLUTIONS', s: 'VERTEX', bg: '#1d4e8a', fg: '#ffffff' },
    { n: 'SRI SAI SRINIVASA COMPUTERS', s: 'SRI SAI', bg: '#f2c230', fg: '#b22b2b' },
    { n: 'NEO MATRIX TECHNOLOGIES', s: 'NEO MATRIX', bg: '#1a1a2a', fg: '#40e070' },
    { n: 'GALAXY SOFTECH', s: 'GALAXY', bg: '#6a2ac8', fg: '#ffffff' },
    { n: 'PRAGATI COMPUTER ACADEMY', s: 'PRAGATI', bg: '#2f8a3a', fg: '#fff4c0' },
    { n: 'LOGIC GATE INSTITUTE', s: 'LOGIC GATE', bg: '#f08a24', fg: '#1a1a2a' },
    { n: 'ORBIT SYSTEMS', s: 'ORBIT', bg: '#f4f4f0', fg: '#1d4e8a' },
    { n: 'VIJETHA INFOTECH', s: 'VIJETHA', bg: '#b22b2b', fg: '#f2c230' },
    { n: 'SANKHYA SOFTWARE SCHOOL', s: 'SANKHYA', bg: '#0f6a6a', fg: '#ffffff' },
    { n: 'CODEWELL ACADEMY', s: 'CODEWELL', bg: '#e8302a', fg: '#ffffff' },
    { n: 'PIXEL POINT MULTIMEDIA', s: 'PIXEL PT', bg: '#1a1a1a', fg: '#ffd23a' },
    { n: 'SUPERNOVA SOFT', s: 'SUPERNOVA', bg: '#2a5cd8', fg: '#ffffff' },
    { n: 'BHARATHI COMPUTERS', s: 'BHARATHI', bg: '#f2c230', fg: '#1d4e8a' },
    { n: 'APEX ORACLE CENTRE', s: 'APEX', bg: '#c81a1a', fg: '#ffffff' },
    { n: "KRISHNA SIR'S JAVA CLASSES", s: 'JAVA SIR', bg: '#1d4e8a', fg: '#f2c230' },
    { n: 'MAINFRAME MASTERS', s: 'MAINFRAME', bg: '#3a3a4a', fg: '#ffffff' },
    { n: 'TESTING TOOLS POINT', s: 'TESTING', bg: '#2f8a3a', fg: '#ffffff' },
    { n: 'SAP SCHOOL OF HYDERABAD', s: 'SAP SCHOOL', bg: '#1d4e8a', fg: '#ffffff' },
    { n: 'INFOWAVE COMPUTER EDUCATION', s: 'INFOWAVE', bg: '#00838f', fg: '#fff4d8' },
  ];
  // course lines, each with fixed colours (keeps the 3D sign atlas small: one cell per line)
  const COURSES = [
    { t: 'C  C++  JAVA  ORACLE', bg: '#ffffff', fg: '#c81a1a', w: 'JAVA' },
    { t: 'ORACLE 9i  D2K  SQL', bg: '#ffffff', fg: '#1d4e8a', w: 'ORACLE' },
    { t: 'JAVA  J2EE  JSP  EJB', bg: '#f2c230', fg: '#1d4e8a', w: 'J2EE' },
    { t: 'VB 6.0  ASP  SQL SERVER', bg: '#ffffff', fg: '#2f6a2a', w: 'VB 6' },
    { t: '.NET  C#  ASP.NET  VB.NET', bg: '#f2c230', fg: '#6a2ac8', w: '.NET' },
    { t: 'SAP ABAP  FICO  MM  SD', bg: '#ffffff', fg: '#1d4e8a', w: 'SAP' },
    { t: 'COBOL  JCL  DB2  CICS', bg: '#e8e4dc', fg: '#3a3a4a', w: 'COBOL' },
    { t: 'WINRUNNER  LOADRUNNER', bg: '#ffffff', fg: '#2f8a3a', w: 'TESTING' },
    { t: 'MCSE  CCNA  LINUX', bg: '#f2c230', fg: '#b22b2b', w: 'MCSE' },
    { t: 'UNIX  SHELL  C', bg: '#ffffff', fg: '#3a3a4a', w: 'UNIX' },
    { t: 'DATA WAREHOUSING', bg: '#ffffff', fg: '#00838f', w: 'DWH' },
    { t: 'PHOTOSHOP  FLASH  3D MAX', bg: '#1a1a1a', fg: '#ffd23a', w: 'FLASH' },
    { t: 'TALLY  MS OFFICE  DTP', bg: '#ffffff', fg: '#b22b2b', w: 'TALLY' },
    { t: 'STRUTS  XML  WEBLOGIC', bg: '#f2c230', fg: '#1a1a2a', w: 'STRUTS' },
    { t: 'HTML  DHTML  JAVASCRIPT', bg: '#ffffff', fg: '#e8302a', w: 'HTML' },
    { t: 'C  C++  DATA STRUCTURES', bg: '#f2c230', fg: '#c81a1a', w: 'C C++' },
  ];
  const TAGS = [
    'NEW BATCH FROM MONDAY', 'FREE DEMO SATURDAY 10 AM', '100% PLACEMENT ASSISTANCE', 'REAL-TIME FACULTY',
    'US-RETURNED FACULTY', 'WEEKEND BATCHES', 'FAST TRACK - 15 DAYS', '7 AM AND 7 PM BATCHES', 'AC LAB - OPEN 24 HRS',
    'H1-B GUIDANCE', 'STUDENT DISCOUNT', 'CERTIFICATION TRAINING',
  ];
  const TAG_BG = '#1a1a2a', TAG_FG = '#f2c230';

  // where the belt is: the coaching lane, the junction and the Ameerpet Road / SR Nagar shops near it
  // (place ids; r = reach in world units, p = share of buildings dressed at the centre)
  const ANCHORS = [
    { place: 'ameerpet_coaching', r: 380, p: 0.95 },
    { place: 'giver_ameerpet', r: 260, p: 0.9 },
    { place: 'ameerpet', r: 340, p: 0.9 },
    { place: 'bus_stop_6', r: 220, p: 0.85 },
    { place: 'irani_cafe_11', r: 200, p: 0.6 },
  ];

  const TUNE = { minLen: 12, maxBanner: 46, hoardP: 0.5, signP: 0.7, offWall: 0.3 };

  /* ================================================================ choosing and dressing buildings */
  const A = (N.ameerpet = { ANCHORS, INSTITUTES, COURSES, TAGS, TUNE, dressed: [], stats, dressOf });
  const BY_BLDG = new WeakMap();
  const ST = { buildings: 0, banners: 0, hoardings: 0, signs: 0 };
  function stats() { return Object.assign({}, ST); }
  function dressOf(b) { return BY_BLDG.get(b) || null; }

  /** share of buildings dressed at (x, y): the best anchor, fading to 35% of its share at its rim */
  function shareAt(x, y, pts) {
    let best = 0;
    for (const a of pts) {
      const d = Math.hypot(x - a.x, y - a.y);
      if (d >= a.r) continue;
      const f = d < a.r * 0.55 ? 1 : 1 - 0.65 * (d - a.r * 0.55) / (a.r * 0.45);
      best = Math.max(best, a.p * f);
    }
    return best;
  }
  // a face's ground segment in reading order (left to right for someone facing the wall), the same order as
  // view3d.js faceSeg (so a board's text reads the right way round on every face)
  function faceSegW(b, f) {
    const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.d;
    switch (f) { case 'N': return [x1, y0, x0, y0]; case 'S': return [x0, y1, x1, y1]; case 'E': return [x1, y1, x1, y0]; default: return [x0, y0, x0, y1]; }
  }
  const OUT = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  /** what this wall looks onto: 2 = a street (or a road just past a yard and compound wall), 1 = open ground
   *  (a yard, a lane, a gap anyone passing sees), 0 = the next building (a party wall: no banner) */
  function faceView(b, f) {
    const SF = N.SURF, W = N.world, s = faceSegW(b, f), o = OUT[f];
    const mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2;
    let open = 0;
    for (const d of [5, 11, 18, 26]) {
      const v = W.surfaceAt(mx + o[0] * d, my + o[1] * d);
      if (v === SF.ROAD || v === SF.FOOTPATH || v === SF.PLAZA || v === SF.BRIDGE) return 2;
      if (v === SF.SOLID || v === SF.VOID || v === SF.WATER) return d > 5 ? open : 0;
      open = 1;
    }
    return open;
  }
  // a banner's lines, top down; k = share of the banner's height (name 46%, courses 34%, tag line 20%)
  const lineOf = (inst, course, tag) => {
    const out = [{ text: inst.n, bg: inst.bg, fg: inst.fg, k: tag ? 0.46 : 0.575 }, { text: course.t, bg: course.bg, fg: course.fg, k: tag ? 0.34 : 0.425 }];
    if (tag) out.push({ text: tag, bg: TAG_BG, fg: TAG_FG, k: 0.2 });
    return out;
  };

  function dressBuilding(b, rng) {
    if (b.mosque || b.roofType === 'frame' || !(b.h >= 9) || b.w < 10 || b.d < 10) return null;
    const view = {};
    for (const f of ['N', 'S', 'E', 'W']) view[f] = Math.max(f === b.front ? 2 : 0, faceView(b, f));
    // every wall on a street, and half the walls open to a yard or a lane (seen from the road too)
    const faces = ['N', 'S', 'E', 'W'].filter((f) => view[f] === 2 || (view[f] === 1 && rng.next() < 0.5));
    if (!faces.length) return null;
    // one institute per building (the big name), sometimes a second tenant upstairs
    const inst = rng.pick(INSTITUTES), inst2 = rng.next() < 0.35 ? rng.pick(INSTITUTES) : inst;
    const floors = b.floors || Math.max(1, Math.round(b.h / 10.5)), fh = b.h / floors;
    // the institute's board over the ground floor where the core gave the building none
    if (b.front && !b.sign && faces.indexOf(b.front) >= 0 && rng.next() < TUNE.signP) {
      const len = b.front === 'N' || b.front === 'S' ? b.w : b.d;
      const tw = (t) => (N.draw && N.draw.pixelTextWidth ? N.draw.pixelTextWidth(t) : t.length * 4);
      const text = [inst.n, inst.s].find((t) => tw(t) <= len * 1.05);
      if (text) { b.sign = { text, bg: inst.bg, fg: inst.fg }; ST.signs++; }
    }
    const banners = [];
    for (const f of faces) {
      const s = faceSegW(b, f), L = Math.hypot(s[2] - s[0], s[3] - s[1]);
      if (L < TUNE.minLen) continue;
      if (floors === 1 && f === b.front && b.sign) continue; // a one-storey shopfront: its signboard is the banner
      const rows = floors > 1 ? floors - 1 : 1;
      for (let r = 0; r < rows; r++) {
        if (floors > 1 && rng.next() < (view[f] === 2 ? 0.12 : 0.35)) continue; // a bare storey now and then
        const who = r === 0 ? inst : inst2;
        const course = rng.pick(COURSES), tag = rng.next() < 0.65 ? rng.pick(TAGS) : null;
        // two banners side by side on a long wall, else one wide one
        const pair = L > 34 && rng.next() < 0.55;
        const h0 = floors > 1 ? fh * (r + 1) + 1.2 : b.h * 0.45, h1 = floors > 1 ? fh * (r + 2) - 1.4 : b.h - 0.8;
        if (h1 - h0 < 3.5) continue;
        if (pair) {
          const gap = 1.2, half = Math.min(TUNE.maxBanner / 2, (L - 3 - gap) / 2);
          const c = 0.5 + (rng.next() - 0.5) * 0.06;
          banners.push({ face: f, t0: c - (half + gap / 2) / L, t1: c - gap / 2 / L, h0, h1, lines: lineOf(who, course, tag) });
          const who2 = rng.next() < 0.5 ? who : rng.pick(INSTITUTES);
          banners.push({ face: f, t0: c + gap / 2 / L, t1: c + (half + gap / 2) / L, h0, h1, lines: lineOf(who2, rng.pick(COURSES), rng.next() < 0.6 ? rng.pick(TAGS) : null) });
        } else {
          const wid = Math.min(TUNE.maxBanner, L * (0.74 + rng.next() * 0.18)), c = 0.5 + (rng.next() - 0.5) * (1 - wid / L) * 0.8;
          banners.push({ face: f, t0: c - wid / L / 2, t1: c + wid / L / 2, h0, h1, lines: lineOf(who, course, tag) });
        }
      }
    }
    // the rooftop hoarding (flat roofs facing a road)
    let hoard = null;
    const flat = b.roofType !== 'hip' && b.roofType !== 'gable';
    if (flat && b.front && faces.indexOf(b.front) >= 0 && rng.next() < TUNE.hoardP) {
      const s = faceSegW(b, b.front), L = Math.hypot(s[2] - s[0], s[3] - s[1]);
      if (L >= 16) {
        const course = rng.pick(COURSES);
        hoard = { face: b.front, w: Math.min(L - 2, 34), inset: 2.2, lines: lineOf(inst, course, null), word: course.w, inst };
      }
    }
    return banners.length || hoard ? { banners, hoard } : null;
  }

  function redress() {
    const W = N.world;
    if (!W || !W.built || !W.queryStructures) return 0;
    const P = N.places || {};
    const pts = ANCHORS.map((a) => (P[a.place] ? { x: P[a.place].x, y: P[a.place].y, r: a.r, p: a.p } : null)).filter(Boolean);
    A.dressed.length = 0;
    ST.buildings = ST.banners = ST.hoardings = ST.signs = 0;
    if (!pts.length) return 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const a of pts) { x0 = Math.min(x0, a.x - a.r); y0 = Math.min(y0, a.y - a.r); x1 = Math.max(x1, a.x + a.r); y1 = Math.max(y1, a.y + a.r); }
    const list = [];
    W.queryStructures(x0, y0, x1, y1, (s) => { if (s.t === 'bldg') list.push(s); });
    list.sort((a, b) => (a.y - b.y) || (a.x - b.x)); // query order is bucket order: fix it for determinism
    for (const b of list) {
      const share = shareAt(b.x + b.w / 2, b.y + b.d / 2, pts);
      if (!share) continue;
      const rng = U.rng('ameerpet:' + Math.round(b.x) + ',' + Math.round(b.y));
      if (rng.next() >= share) continue;
      let dress = null;
      try { dress = dressBuilding(b, rng); } catch (e) { N.err('ameerpet.dress', e); }
      if (!dress) continue;
      const s = W.addStructure({ t: 'custom', ameerpet: true, x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.d, cx: b.cx != null ? b.cx : b.x + b.w / 2, cy: b.cy != null ? b.cy : b.y + b.d / 2,
        b, banners: dress.banners, hoard: dress.hoard, draw: draw2D, build3d });
      BY_BLDG.set(b, s);
      A.dressed.push(s);
      ST.buildings++; ST.banners += dress.banners.length; if (dress.hoard) ST.hoardings++;
    }
    return ST.buildings;
  }
  N.on('world:built', () => { try { redress(); } catch (e) { N.err('ameerpet.redress', e); } });

  /* ================================================================ 2D (top-down) */
  const BIT = { N: 1, S: 2, W: 4, E: 8 };
  const shadeCache = new Map();
  const shade = (hex, f) => { const k = hex + f; let v = shadeCache.get(k); if (!v) { v = U.shade ? U.shade(hex, f) : hex; shadeCache.set(k, v); } return v; };
  function draw2D(ctx, s) {
    const R = N.render, D = N.draw, b = s.b;
    const vis = D.visibleWalls(b.x, b.y, b.w, b.d);
    if (vis) for (const bn of s.banners) if (vis & BIT[bn.face]) wallBanner2D(ctx, R, b, bn);
    if (s.hoard) hoarding2D(ctx, R, D, b, s.hoard);
  }
  /** a banner on a wall: its quad in perspective, a band per line and a bar of "lettering" in each band */
  function wallBanner2D(ctx, R, b, bn) {
    const sg = faceSegW(b, bn.face), o = OUT[bn.face], off = TUNE.offWall;
    const ax = sg[0] + (sg[2] - sg[0]) * bn.t0 + o[0] * off, ay = sg[1] + (sg[3] - sg[1]) * bn.t0 + o[1] * off;
    const bx = sg[0] + (sg[2] - sg[0]) * bn.t1 + o[0] * off, by = sg[1] + (sg[3] - sg[1]) * bn.t1 + o[1] * off;
    const kTop = R.k(bn.h1), kBot = R.k(bn.h0);
    // too thin to read (a wall seen almost edge-on): skip
    const px = Math.abs((R.sx(ax, kTop) - R.sx(ax, kBot)) + (R.sy(ay, kTop) - R.sy(ay, kBot))) + Math.hypot(R.sx(ax, kTop) - R.sx(ax, kBot), R.sy(ay, kTop) - R.sy(ay, kBot));
    if (px < 1.5) return;
    let h = bn.h1;
    for (const ln of bn.lines) {
      const hb = h - (bn.h1 - bn.h0) * ln.k;
      quadAt(ctx, R, ax, ay, bx, by, hb, h, ln.bg);
      if (px > 5) { // lettering: a thinner bar in the text colour, 70% of the band's width
        const m = 0.15, mh = (h - hb) * 0.3;
        quadAt(ctx, R, ax + (bx - ax) * m, ay + (by - ay) * m, bx - (bx - ax) * m, by - (by - ay) * m, hb + mh, h - mh, ln.fg);
      }
      h = hb;
    }
  }
  function quadAt(ctx, R, ax, ay, bx, by, h0, h1, col) {
    const k0 = R.k(h0), k1 = R.k(h1);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(R.sx(ax, k0), R.sy(ay, k0)); ctx.lineTo(R.sx(bx, k0), R.sy(by, k0));
    ctx.lineTo(R.sx(bx, k1), R.sy(by, k1)); ctx.lineTo(R.sx(ax, k1), R.sy(ay, k1));
    ctx.closePath(); ctx.fill();
  }
  /** the rooftop hoarding seen from above: a low board on the roof by the front edge, its course word on top */
  function hoarding2D(ctx, R, D, b, H) {
    const sg = faceSegW(b, H.face), o = OUT[H.face];
    const L = Math.hypot(sg[2] - sg[0], sg[3] - sg[1]), ux = (sg[2] - sg[0]) / L, uy = (sg[3] - sg[1]) / L;
    const mx = (sg[0] + sg[2]) / 2 - o[0] * (H.inset + 3), my = (sg[1] + sg[3]) / 2 - o[1] * (H.inset + 3);
    const along = H.w, deep = 6;
    const wx = Math.abs(ux) * along + Math.abs(o[0]) * deep, wy = Math.abs(uy) * along + Math.abs(o[1]) * deep;
    const h0 = b.h + (b.parapet ? 2 : 0), h1 = h0 + 4;
    const bg = H.inst.bg, fg = H.inst.fg;
    D.box(mx - wx / 2, my - wy / 2, wx, wy, h0, h1, { wall: shade(bg, 0.78), roof: bg });
    const k = R.k(h1), word = H.word, vert = H.face === 'E' || H.face === 'W';
    const tw = D.pixelTextWidth(word);
    if (tw <= (vert ? wy : wx) * k + 2) D.pixelText(mx, my, h1, word, fg, vert ? { rot: H.face === 'E' ? -1 : 1 } : null);
  }

  /* ================================================================ 3D */
  function segOf(b, f, ox, oz) { const s = faceSegW(b, f); return [s[0] - ox, s[1] - oz, s[2] - ox, s[3] - oz]; }
  /** one board line: a quad on the sign atlas page's builder (byPage) */
  function board(H, byPage, slots, text, bg, fg, ax, az, bx, bz, y0, y1) {
    const w = Math.hypot(bx - ax, bz - az), hh = y1 - y0;
    if (w < 1 || hh < 0.5) return;
    const slot = H.signSlot(String(text).toUpperCase().slice(0, 38), bg, fg, w / hh, slots);
    if (!slot) return;
    slot.page.dirty = true; slot.page.tex.needsUpdate = true;
    let g = byPage.get(slot.page);
    if (!g) { g = H.builder({ facade: true }); byPage.set(slot.page, g); }
    g.color('#ffffff');
    g.quad(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, [slot.u0, slot.v0, slot.u1, slot.v1]);
  }
  /** 3D builder of one dressed building. Frames and posts go into the chunk's merged facade mesh (gb); the boards of
   *  every dressed building of the chunk are collected per sign-atlas page and emitted as one mesh per page with the
   *  chunk's last dressed building (the core does the same with its shop boards), so a chunk full of banners costs a
   *  draw call or two, not one per building. */
  function build3d(THREE, s, H, gb, J) {
    if (!J || !J.detail || !H.signSlot) return null;
    let C = J._ameerpet;
    if (!C) {
      let last = -1;
      if (Array.isArray(J.list)) for (let i = 0; i < J.list.length; i++) if (J.list[i] && J.list[i].ameerpet) last = i;
      C = J._ameerpet = { last, byPage: new Map() };
    }
    addBoards(s, H, gb, J, C.byPage);
    const idx = typeof J.i === 'number' ? J.i - 1 : -1;
    if (C.last >= 0 && idx >= 0 && idx < C.last) return null; // more dressed buildings to come in this chunk
    const grp = boardMeshes(THREE, C.byPage, J);
    C.byPage = new Map();
    return grp;
  }
  function boardMeshes(THREE, byPage, J) {
    if (!byPage.size) return null;
    const grp = new THREE.Group();
    grp.name = 'ameerpet_banners';
    for (const [page, g] of byPage) {
      const geo = g.build(); if (!geo) continue;
      if (geo.getAttribute('facade')) geo.deleteAttribute('facade');
      if (geo.getAttribute('color')) geo.deleteAttribute('color');
      const m = new THREE.Mesh(geo, page.mat);
      m.name = 'signs'; m.castShadow = false; m.receiveShadow = false;
      grp.add(m);
    }
    grp.position.set(J.ox, 0, J.oz); // the chunk subtracts its origin from a returned object's position
    return grp;
  }
  function addBoards(s, H, gb, J, byPage) {
    const b = s.b, VS = H.VS, ox = J.ox, oz = J.oz;
    const slots = J.slots || (J.slots = []);
    for (const bn of s.banners) {
      const sg = segOf(b, bn.face, ox, oz), o = OUT[bn.face], off = TUNE.offWall;
      const ax = sg[0] + (sg[2] - sg[0]) * bn.t0 + o[0] * off, az = sg[1] + (sg[3] - sg[1]) * bn.t0 + o[1] * off;
      const bx = sg[0] + (sg[2] - sg[0]) * bn.t1 + o[0] * off, bz = sg[1] + (sg[3] - sg[1]) * bn.t1 + o[1] * off;
      let y = bn.h1 * VS;
      for (const ln of bn.lines) {
        const yb = y - (bn.h1 - bn.h0) * VS * ln.k;
        board(H, byPage, slots, ln.text, ln.bg, ln.fg, ax, az, bx, bz, yb + 0.06, y - 0.06);
        y = yb;
      }
      // the tie ropes at the four corners (thin dark ticks), so the flex reads as hung, not painted
      gb.plain(); gb.color('#2a2420');
      const t = 0.18;
      for (const [px, pz, py] of [[ax, az, bn.h1 * VS], [bx, bz, bn.h1 * VS], [ax, az, bn.h0 * VS], [bx, bz, bn.h0 * VS]]) gb.box(px - t, py - 0.6, pz - t, px + t, py + 0.6, pz + t);
    }
    if (s.hoard) {
      const Hd = s.hoard, sg = segOf(b, Hd.face, ox, oz), o = OUT[Hd.face];
      const L = Math.hypot(sg[2] - sg[0], sg[3] - sg[1]), ux = (sg[2] - sg[0]) / L, uz = (sg[3] - sg[1]) / L;
      const mx = (sg[0] + sg[2]) / 2 - o[0] * Hd.inset, mz = (sg[1] + sg[3]) / 2 - o[1] * Hd.inset;
      const half = Hd.w / 2, roof = b.h * VS + (b.parapet ? (b.parapet === 2 ? 4.2 : 3) : 0);
      const y0 = roof + 3.5, y1 = y0 + 11;
      // steel posts and the board's back
      gb.plain(); gb.color('#6a6a70');
      for (const u of [-half + 1.5, 0, half - 1.5]) { const px = mx + ux * u - o[0] * 1.2, pz = mz + uz * u - o[1] * 1.2; gb.box(px - 0.35, roof - 0.2, pz - 0.35, px + 0.35, y1 + 0.4, pz + 0.35); }
      gb.color('#8a8a86'); // the back of a flex hoarding: galvanised sheet
      const bx0 = Math.min(mx - ux * half, mx + ux * half) - Math.abs(o[0]) * 0.5, bx1 = Math.max(mx - ux * half, mx + ux * half) + Math.abs(o[0]) * 0.1;
      const bz0 = Math.min(mz - uz * half, mz + uz * half) - Math.abs(o[1]) * 0.5, bz1 = Math.max(mz - uz * half, mz + uz * half) + Math.abs(o[1]) * 0.1;
      gb.box(o[0] > 0 ? bx0 - 0.4 : bx0, y0 - 0.3, o[1] > 0 ? bz0 - 0.4 : bz0, o[0] < 0 ? bx1 + 0.4 : bx1, y1 + 0.3, o[1] < 0 ? bz1 + 0.4 : bz1);
      const ax = mx - ux * half + o[0] * 0.25, az = mz - uz * half + o[1] * 0.25, bx = mx + ux * half + o[0] * 0.25, bz = mz + uz * half + o[1] * 0.25;
      const n0 = Hd.lines[0], n1 = Hd.lines[1], ym = y0 + (y1 - y0) * 0.42;
      board(H, byPage, slots, n0.text, n0.bg, n0.fg, ax, az, bx, bz, ym, y1);
      board(H, byPage, slots, n1.text, n1.bg, n1.fg, ax, az, bx, bz, y0, ym);
    }
  }
  // 3D: the core has no builder for 'custom' structures; handle the ones that bring their own (build3d)
  if (N.view3d && N.view3d.registerStructure) {
    N.view3d.registerStructure('custom', (THREE, s, H, gb, J) => (typeof s.build3d === 'function' ? s.build3d(THREE, s, H, gb, J) : null));
  }
})();
