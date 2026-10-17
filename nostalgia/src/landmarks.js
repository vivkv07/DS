/* NOSTALGIA — landmarks.js  (owner: monument artist)
 *
 * Hand-built pseudo-3D art (GTA2-style lean, back-face culling, sun-shaded faces, exact
 * per-vertex projection of facade details, night floodlights and emissive details) for the
 * heritage / monument / worship draw ids of N.WORLD_DATA.landmarks (design/map_plan.md §4a),
 * plus provisional art for a few civic ids the brief asked for (mozamjahi_market,
 * railway_station, lb_stadium, airport_terminal, control_tower). places_art.js loads after this
 * file; anything it registers for the same draw id replaces the version here (load order).
 *
 * API (backward compatible with the stub world.js was written against):
 *   N.landmarks.enqueue(lm, visible)  world.js, every frame, for each landmark within view+140 u:
 *                                     casts dynamic shadows, queues art on 'structures' (sortKey
 *                                     R.distKey), floor art on 'ground', lights + emissive night
 *                                     details on 'light'.
 *   N.landmarks.paintGround(ctx, lm)  world.js chunk painter (world coords, static, kept inside the
 *                                     landmark's ±max(w, d) box so chunk edges never cut it).
 *   N.landmarks.drawDefault(lm)       decent fallback building for unknown draw ids.
 *   N.landmarks.register(drawId, def) def is either the old style {enqueue(lm, vis), paintGround(ctx, lm)}
 *                                     (e.g. places_art.js) or the kit style {draw(lm), shadow?(lm),
 *                                     night?(lm), lights?(lm), floor?(lm), ground?(ctx, lm)}.
 *   N.landmarks.kit                   the drawing toolkit (box/prism/cyl/dome/cone/minaret/chhatri/
 *                                     parapet/facade specs/flag/clock...) for other art modules.
 *   N.landmarks.fx                    story hooks: {charminarLights: null (auto) | 0..1, festive:
 *                                     null (auto: N.flags chand_raat/eid/ramzan/finale) | bool,
 *                                     ganesh: null (auto: N.flags ganesh*) | bool}.
 *   N.landmarks.flocks                pigeon flocks (Charminar plaza, Mecca Masjid square, Gulzar Houz).
 * Hooks added from this file (no core file is edited, nothing is monkeypatched): a 'landmarks'
 * system (order 42) that animates the pigeons (they scatter when the player comes close,
 * N.audio.sfx('pigeons')) and strikes the hour on the clock towers near the player
 * (N.audio.sfx('gong'), N.emit('landmarks:chime', {id, hour})); its draw() queues the pigeons.
 * Clock faces show the in-game time. Performance: static facade geometry is built once per
 * (spec, wall length, wall height) and cached; per frame only the visible walls are projected.
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;
  const TAU = Math.PI * 2;

  /* ================================================================ frame state */
  let R = null, ctx = null;
  let Z = 1, P = 0.0032, CX = 0, CY = 0, CAMX = 0, CAMY = 0, NIGHT = 0, TIME = 0;
  function frame() {
    R = N.render; ctx = R.ctx;
    Z = R.Z || 1; P = R.PERSP; CX = R.W / 2; CY = R.H / 2;
    CAMX = R.camX || 0; CAMY = R.camY || 0; NIGHT = R.night || 0; TIME = N.time.real || 0;
  }
  const kh = (h) => Z * (1 + h * P);
  const sxp = (x, k) => CX + (x - CAMX) * k;
  const syp = (y, k) => CY + (y - CAMY) * k;
  const sh = (c, f) => R.shaded(c, f);
  function mv(x, y, h) { const k = Z * (1 + h * P); ctx.moveTo(CX + (x - CAMX) * k, CY + (y - CAMY) * k); }
  function ln(x, y, h) { const k = Z * (1 + h * P); ctx.lineTo(CX + (x - CAMX) * k, CY + (y - CAMY) * k); }
  function fill(c) { ctx.fillStyle = c; ctx.fill(); }
  const camDist2 = (x, y) => (x - CAMX) * (x - CAMX) + (y - CAMY) * (y - CAMY);

  /* ======================================================= facade geometry specs */
  // A facade spec builds static polygons in wall-local units: u along the wall (0..L, from the
  // wall's start corner; u runs to the viewer's LEFT when looking at the wall from outside),
  // v = height above the wall's base (0..H). Polygons are grouped in colour classes:
  //   d dark opening   r recess (darker wall)   l light trim   a accent   b accent 2   x accent 3
  //   g granite base   w window (dark by day, lit at night)   c clock/white face   k gold
  //   p passage light (glimpse of daylight through an arch; glows at night)   s shadow line
  let specSeq = 0;
  function fac(build) { return { id: ++specSeq, build, cache: new Map() }; }
  class GB {
    constructor() { this.cls = {}; this.order = []; }
    _a(c) { let a = this.cls[c]; if (!a) { a = this.cls[c] = []; this.order.push(c); } return a; }
    poly(c, pts) { const a = this._a(c); a.push(pts.length / 2); for (let i = 0; i < pts.length; i++) a.push(pts[i]); return this; }
    rect(c, u0, v0, u1, v1) { return this.poly(c, [u0, v0, u1, v0, u1, v1, u0, v1]); }
    arch(c, u0, u1, v0, spring, apex, sharp, n) {
      if (!(u1 - u0 > 0.3) || !(apex > v0)) return this; // degenerate (short wall): skip
      return this.poly(c, archPts(u0, u1, v0, Math.min(spring, apex), apex, sharp, n));
    }
    circ(c, uc, vc, r, n) {
      n = n || 10; const p = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; p.push(uc + Math.cos(a) * r, vc + Math.sin(a) * r); }
      return this.poly(c, p);
    }
    // evenly spaced arches across [u0, u1]
    arcade(c, u0, u1, n, v0, spring, apex, gap, sharp) {
      if (!(u1 - u0 > 1)) return this;
      let g = gap == null ? ((u1 - u0) / n) * 0.28 : gap;
      n = Math.max(1, Math.min(n, Math.floor((u1 - u0) / (g + 0.8))));
      const pitch = (u1 - u0) / n;
      if (pitch - g < 0.6) g = pitch * 0.3;
      for (let i = 0; i < n; i++) this.arch(c, u0 + i * pitch + g / 2, u0 + (i + 1) * pitch - g / 2, v0, spring, apex, sharp);
      return this;
    }
    // evenly spaced rect windows
    wins(c, u0, u1, n, v0, v1, ww) {
      if (!(u1 - u0 > ww) || n < 1) return this;
      n = Math.max(1, Math.min(n, Math.floor((u1 - u0) / (ww + 0.6))));
      const pitch = (u1 - u0) / n;
      for (let i = 0; i < n; i++) { const m = u0 + (i + 0.5) * pitch; this.rect(c, m - ww / 2, v0, m + ww / 2, v1); }
      return this;
    }
    // merlon teeth along the top: from v0 to v1, tooth width tw, pitch pt
    teeth(c, L, v0, v1, tw, pt, round) {
      const n = Math.max(1, Math.floor(L / pt)), m = (L - n * pt) / 2;
      for (let i = 0; i < n; i++) {
        const u = m + i * pt + (pt - tw) / 2;
        if (round) this.arch(c, u, u + tw, v0, v1 - tw * 0.5, v1, 1, 3);
        else this.rect(c, u, v0, u + tw, v1);
      }
      return this;
    }
  }
  // pointed (sharp > 1) or round (sharp = 1) arch outline, from the ground line v0 up
  function archPts(u0, u1, v0, spring, apex, sharp, n) {
    sharp = sharp || 1.45; n = n || 5;
    const half = (u1 - u0) / 2, Rr = half * sharp;
    const fe = Math.acos(U.clamp((half - Rr) / Rr, -1, 1));
    const scale = (apex - spring) / Math.max(0.001, Rr * Math.sin(fe));
    const pts = [u0, v0, u0, spring];
    const left = [];
    for (let i = 1; i <= n; i++) {
      const f = Math.PI - (Math.PI - fe) * (i / n);
      left.push(u0 + Rr + Rr * Math.cos(f), spring + Rr * Math.sin(f) * scale);
    }
    for (let i = 0; i < left.length; i += 2) pts.push(left[i], left[i + 1]);
    for (let i = left.length - 4; i >= 0; i -= 2) pts.push(u1 - (left[i] - u0), left[i + 1]);
    pts.push(u1, spring, u1, v0);
    return pts;
  }
  function geomOf(spec, L, H) {
    const key = Math.round(L * 4) * 100000 + Math.round(H * 4);
    let g = spec.cache.get(key);
    if (!g) {
      const b = new GB();
      spec.build(b, L, H);
      g = { order: b.order, cls: {} };
      for (const c of b.order) g.cls[c] = Float32Array.from(b.cls[c]);
      if (spec.cache.size > 1024) spec.cache.clear();
      spec.cache.set(key, g);
    }
    return g;
  }
  // add the polygons of one class to the current path, exact projection
  function pathArr(arr, ax, ay, ux, uy, h0) {
    const A = ax - CAMX, B = ay - CAMY;
    let i = 0;
    while (i < arr.length) {
      const n = arr[i++];
      for (let j = 0; j < n; j++) {
        const u = arr[i++], v = arr[i++];
        const k = Z * (1 + (h0 + v) * P);
        const X = CX + (A + ux * u) * k, Y = CY + (B + uy * u) * k;
        if (j) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
      ctx.closePath();
    }
  }

  // class colour for a style on a face with sun factor f
  function clsColor(st, c, f) {
    switch (c) {
      case 'd': return sh(st.dark || '#3a2f2b', 0.75 + f * 0.3);
      case 'r': return sh(st.wall, f * 0.86);
      case 'l': return sh(st.trim || '#f4ecd8', f);
      case 'a': return sh(st.acc || '#b5584a', f);
      case 'b': return sh(st.acc2 || '#2a8c82', f);
      case 'x': return sh(st.acc3 || '#6f9a3a', f);
      case 'g': return sh(st.base || '#9a9088', f);
      case 'w': return NIGHT > 0.35 ? '#1d1b26' : sh(st.win || '#3b3741', 0.8 + f * 0.25);
      case 'c': return sh('#f4eedc', 0.7 + f * 0.32);
      case 'k': return sh('#d6a432', 0.7 + f * 0.35);
      case 'p': return sh(st.pass || '#c8b48e', 0.62 + f * 0.25);
      case 's': return 'rgba(30,20,20,0.28)';
      default: return sh(st.wall, f);
    }
  }

  // night: lit windows recorded during the structures pass, drawn on the light layer
  const litPool = [];
  let litN = 0;
  function recordLit(arr, ax, ay, ux, uy, h0, col) {
    let e = litPool[litN];
    if (!e) e = litPool[litN] = {};
    e.arr = arr; e.ax = ax; e.ay = ay; e.ux = ux; e.uy = uy; e.h0 = h0; e.col = col;
    litN++;
  }

  // wall start corner + direction for the 4 faces of an axis-aligned box
  const FW = { ax: 0, ay: 0, ux: 0, uy: 0, L: 0, dist: 0 };
  function faceWall(face, x, y, w, d) {
    switch (face) {
      case 'N': FW.ax = x; FW.ay = y; FW.ux = 1; FW.uy = 0; FW.L = w; FW.dist = y - CAMY; break;
      case 'S': FW.ax = x + w; FW.ay = y + d; FW.ux = -1; FW.uy = 0; FW.L = w; FW.dist = CAMY - (y + d); break;
      case 'W': FW.ax = x; FW.ay = y + d; FW.ux = 0; FW.uy = -1; FW.L = d; FW.dist = x - CAMX; break;
      default: FW.ax = x + w; FW.ay = y; FW.ux = 0; FW.uy = 1; FW.L = d; FW.dist = CAMX - (x + w); break;
    }
    return FW;
  }
  // true when the projected wall quad lies entirely outside the screen
  function offscreenWall(x0, y0, x1, y1, h0, h1) {
    const ka = Z * (1 + h0 * P), kb = Z * (1 + h1 * P);
    const a = CX + (x0 - CAMX) * ka, b = CX + (x1 - CAMX) * ka, c = CX + (x0 - CAMX) * kb, d = CX + (x1 - CAMX) * kb;
    if (Math.max(a, b, c, d) < -2 || Math.min(a, b, c, d) > R.W + 2) return true;
    const e = CY + (y0 - CAMY) * ka, f = CY + (y1 - CAMY) * ka, g = CY + (y0 - CAMY) * kb, h = CY + (y1 - CAMY) * kb;
    return Math.max(e, f, g, h) < -2 || Math.min(e, f, g, h) > R.H + 2;
  }
  function specFor(st, face) {
    const f = st.fac;
    if (!f) return null;
    if (f.build) return f;
    return f[face] || f.all || null;
  }
  function facade(st, face, x, y, w, d, h0, h1) {
    const spec = specFor(st, face);
    if (!spec) return;
    const fw = faceWall(face, x, y, w, d);
    const H = h1 - h0;
    if (Math.abs(fw.dist) * Z * H * P < 2.2) return; // sliver: plain wall reads fine
    const ax = fw.ax, ay = fw.ay, ux = fw.ux, uy = fw.uy;
    if (offscreenWall(ax, ay, ax + ux * fw.L, ay + uy * fw.L, h0, h1)) return;
    const g = geomOf(spec, fw.L, H);
    const f = R.faceShade[face];
    for (let i = 0; i < g.order.length; i++) {
      const c = g.order[i], arr = g.cls[c];
      ctx.beginPath(); pathArr(arr, ax, ay, ux, uy, h0); ctx.fillStyle = clsColor(st, c, f); ctx.fill();
      if (NIGHT > 0.15 && (c === 'w' || c === 'p') && st.lit !== false) recordLit(arr, ax, ay, ux, uy, h0, c === 'p' ? '#ffc964' : st.litCol || '#ffd27a');
    }
    if (st.clock) clockHands(st.clock, ax, ay, ux, uy, h0, fw.L);
  }

  /* ================================================================ primitives */
  /** Axis-aligned extruded box with optional facade spec(s) and roof painter. */
  // mask: which walls may be drawn (bits N1 S2 W4 E8; default all). noRoof: skip the roof.
  function box(x, y, w, d, h0, h1, st, mask, noRoof) {
    const k0 = kh(h0), k1 = kh(h1);
    const X0 = sxp(x, k0), X1 = sxp(x + w, k0), Y0 = syp(y, k0), Y1 = syp(y + d, k0);
    const x0 = sxp(x, k1), x1 = sxp(x + w, k1), y0 = syp(y, k1), y1 = syp(y + d, k1);
    const fs = R.faceShade;
    const m = mask == null ? 15 : mask;
    if (h1 - h0 > 0.01 && st.walls !== false) {
      if (CAMY < y && m & 1) { ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y0); ctx.lineTo(x1, y0); ctx.lineTo(x0, y0); ctx.closePath(); fill(st.wallN || sh(st.wall, fs.N)); if (st.fac) facade(st, 'N', x, y, w, d, h0, h1); }
      if (CAMY > y + d && m & 2) { ctx.beginPath(); ctx.moveTo(X0, Y1); ctx.lineTo(X1, Y1); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath(); fill(st.wallS || sh(st.wall, fs.S)); if (st.fac) facade(st, 'S', x, y, w, d, h0, h1); }
      if (CAMX < x && m & 4) { ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X0, Y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y0); ctx.closePath(); fill(st.wallW || sh(st.wall, fs.W)); if (st.fac) facade(st, 'W', x, y, w, d, h0, h1); }
      if (CAMX > x + w && m & 8) { ctx.beginPath(); ctx.moveTo(X1, Y0); ctx.lineTo(X1, Y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y0); ctx.closePath(); fill(st.wallE || sh(st.wall, fs.E)); if (st.fac) facade(st, 'E', x, y, w, d, h0, h1); }
    }
    if (st.roof !== false && !noRoof) {
      ctx.fillStyle = st.roof || sh(st.wall, 1.07);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      if (st.roofFn) {
        ctx.setTransform(k1, 0, 0, k1, CX - CAMX * k1, CY - CAMY * k1);
        st.roofFn(ctx, x, y, w, d, h1);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
  }
  /** Run fn(ctx) in world coordinates on the horizontal plane at height h. */
  function plane(h, fn, a, b, c) {
    const k = kh(h);
    ctx.setTransform(k, 0, 0, k, CX - CAMX * k, CY - CAMY * k);
    fn(ctx, a, b, c);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function polyArea(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    return a / 2;
  }
  const wallBuf = [];
  /** Extruded polygon [[x,y],...]: back-face culled, sun-shaded, far walls first, roof last.
   *  st: {wall, roof|false, edge, flat, roofFn} */
  function prism(pts, h0, h1, st) {
    const n = pts.length; if (n < 3) return;
    let sgn = pts._sgn;
    if (!sgn) sgn = pts._sgn = polyArea(pts) > 0 ? 1 : -1;
    const k0 = kh(h0), k1 = kh(h1);
    if (h1 - h0 > 0.01 && st.walls !== false) {
      let m = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const ex = b[0] - a[0], ey = b[1] - a[1];
        const nx = ey * sgn, ny = -ex * sgn;
        if (nx * (CAMX - a[0]) + ny * (CAMY - a[1]) <= 0) continue;
        let e = wallBuf[m]; if (!e) e = wallBuf[m] = { d: 0, i: 0, f: 0 };
        const mx = (a[0] + b[0]) / 2 - CAMX, my = (a[1] + b[1]) / 2 - CAMY;
        const nl = Math.hypot(nx, ny) || 1;
        e.d = mx * mx + my * my; e.i = i; e.f = R.shadeNormal(nx / nl, ny / nl);
        m++;
      }
      // insertion sort far -> near (small m)
      for (let i = 1; i < m; i++) { const e = wallBuf[i]; let j = i - 1; while (j >= 0 && wallBuf[j].d < e.d) { wallBuf[j + 1] = wallBuf[j]; j--; } wallBuf[j + 1] = e; }
      for (let q = 0; q < m; q++) {
        const e = wallBuf[q], a = pts[e.i], b = pts[(e.i + 1) % n];
        ctx.beginPath();
        ctx.moveTo(sxp(a[0], k0), syp(a[1], k0)); ctx.lineTo(sxp(b[0], k0), syp(b[1], k0));
        ctx.lineTo(sxp(b[0], k1), syp(b[1], k1)); ctx.lineTo(sxp(a[0], k1), syp(a[1], k1)); ctx.closePath();
        fill(st.flat ? st.wall : sh(st.wall, e.f));
        if (st.edge) { ctx.strokeStyle = st.edge; ctx.lineWidth = 0.6; ctx.stroke(); }
      }
    }
    if (st.roof !== false) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const X = sxp(pts[i][0], k1), Y = syp(pts[i][1], k1); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
      ctx.closePath();
      fill(st.roof || sh(st.wall, 1.07));
      if (st.roofFn) plane(h1, st.roofFn, pts);
    }
  }
  // regular n-gon points (cached by key)
  const ngonCache = new Map();
  function ngon(x, y, r, n, rot) {
    const key = x + ',' + y + ',' + r + ',' + n + ',' + (rot || 0);
    let p = ngonCache.get(key);
    if (!p) {
      p = [];
      for (let i = 0; i < n; i++) { const a = (rot || 0) + (i / n) * TAU; p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
      if (ngonCache.size > 4000) ngonCache.clear();
      ngonCache.set(key, p);
    }
    return p;
  }
  /** Cylinder (wraps N.draw.cyl). st: {wall, top|roof|false, grad} */
  function cyl(x, y, r, h0, h1, wall, top, grad) {
    N.draw.cyl(x, y, r, h0, h1, { wall, top: top === undefined ? undefined : top, roof: top || undefined, grad: grad === false ? false : undefined });
  }
  /** Cylinder with sun shading across it and ambient darkening towards the ground along it
   *  (reads as a standing column even when the lean is long). top: colour | false. */
  function cylV(x, y, r, h0, h1, col, top) {
    const k0 = kh(h0), k1 = kh(h1);
    const bx = sxp(x, k0), by = syp(y, k0), rb = r * k0, tx = sxp(x, k1), ty = syp(y, k1), rt = r * k1;
    const dx = tx - bx, dy = ty - by, Ld = Math.hypot(dx, dy);
    if (Ld > Math.abs(rt - rb) + 0.01 && h1 - h0 > 0.01) {
      const th = Math.atan2(dy, dx), al = Math.acos(U.clamp((rb - rt) / Ld, -1, 1));
      ctx.beginPath(); ctx.arc(bx, by, rb, th + al, th - al + TAU); ctx.arc(tx, ty, rt, th - al, th + al); ctx.closePath();
      const sx = R.sun.dx, sy = R.sun.dy, mx = (bx + tx) / 2, my = (by + ty) / 2, rr = Math.max(1, (rb + rt) / 2);
      const g = ctx.createLinearGradient(mx + sx * rr, my + sy * rr, mx - sx * rr, my - sy * rr);
      g.addColorStop(0, sh(col, 1.02)); g.addColorStop(0.45, sh(col, 0.84)); g.addColorStop(1, sh(col, 0.6));
      ctx.fillStyle = g; ctx.fill();
      const a0 = U.clamp(0.22 * (1 - h0 / 70), 0, 0.22), a1 = U.clamp(0.22 * (1 - h1 / 70), 0, 0.22);
      if (Ld > 3 && a0 > 0.02) {
        const g2 = ctx.createLinearGradient(bx, by, tx, ty);
        g2.addColorStop(0, 'rgba(48,30,18,' + a0.toFixed(3) + ')'); g2.addColorStop(1, 'rgba(48,30,18,' + a1.toFixed(3) + ')');
        ctx.fillStyle = g2; ctx.fill();
      }
    }
    if (top) { ctx.beginPath(); ctx.arc(tx, ty, Math.max(0.5, rt), 0, TAU); fill(top); }
  }
  /** Dome; bulb = onion. */
  function dome(x, y, r, h0, h1, col, bulb, finial, finialCol) {
    N.draw.dome(x, y, r, h0, h1, { fill: col, bulb: !!bulb, finial: finial || 0, finialColor: finialCol || '#c9a227', steps: Math.max(4, Math.min(9, Math.round(r / 1.6))) });
  }
  /** Flat ring of lotus petals (star polygon) at height h. */
  function petals(x, y, r0, r1, h, n, col, rot) {
    const k = kh(h);
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (rot || 0) + (i / (n * 2)) * TAU, r = i % 2 ? r0 : r1;
      const X = sxp(x + Math.cos(a) * r, k), Y = syp(y + Math.sin(a) * r, k);
      if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
    }
    ctx.closePath(); fill(col);
  }
  /** Ring outline at height h (railings, mouldings). */
  function ring(x, y, r, h, col, lw) {
    const k = kh(h);
    ctx.beginPath(); ctx.arc(sxp(x, k), syp(y, k), Math.max(0.5, r * k), 0, TAU);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, (lw || 0.7) * k); ctx.stroke();
  }
  function disc(x, y, r, h, col) {
    const k = kh(h);
    ctx.beginPath(); ctx.arc(sxp(x, k), syp(y, k), Math.max(0.5, r * k), 0, TAU); fill(col);
  }
  /** Vertical line (pole) from h0 to h1. */
  function pole(x, y, h0, h1, col, w) {
    const k0 = kh(h0), k1 = kh(h1);
    ctx.beginPath(); ctx.moveTo(sxp(x, k0), syp(y, k0)); ctx.lineTo(sxp(x, k1), syp(y, k1));
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.7, (w || 0.8) * k1); ctx.stroke();
  }
  /** Cone (spire) with faceted sun shading. */
  function cone(x, y, r, h0, h1, col, n) {
    n = n || 10;
    const ka = kh(h1), AX = sxp(x, ka), AY = syp(y, ka), k0 = kh(h0);
    // far facets first
    const a0 = Math.atan2(y - CAMY, x - CAMX); // direction away from camera
    for (let s = 0; s < n; s++) {
      // order: start at the far side, alternate outwards towards the near side
      const off = s === 0 ? 0 : (s % 2 ? 1 : -1) * Math.ceil(s / 2);
      const am = a0 + (off / n) * TAU, da = Math.PI / n;
      const xa = x + Math.cos(am - da) * r, ya = y + Math.sin(am - da) * r, xb = x + Math.cos(am + da) * r, yb = y + Math.sin(am + da) * r;
      ctx.beginPath(); ctx.moveTo(AX, AY); ctx.lineTo(sxp(xa, k0), syp(ya, k0)); ctx.lineTo(sxp(xb, k0), syp(yb, k0)); ctx.closePath();
      fill(sh(col, R.shadeNormal(Math.cos(am), Math.sin(am)) + 0.08));
    }
  }
  /** Pyramid roof over a rect (hip): apex line or point. */
  function pyramid(x, y, w, d, h0, h1, col) {
    const cx = x + w / 2, cy = y + d / 2, k0 = kh(h0), ka = kh(h1);
    const AX = sxp(cx, ka), AY = syp(cy, ka);
    const fs = R.faceShade;
    const tri = (xa, ya, xb, yb, f) => { ctx.beginPath(); ctx.moveTo(sxp(xa, k0), syp(ya, k0)); ctx.lineTo(sxp(xb, k0), syp(yb, k0)); ctx.lineTo(AX, AY); ctx.closePath(); fill(sh(col, f)); };
    // far faces first (cheap: draw all four ordered by distance of their mid points)
    const faces = [[x, y, x + w, y, fs.N, cy - d / 2], [x + w, y + d, x, y + d, fs.S, cy + d / 2], [x, y + d, x, y, fs.W, 0], [x + w, y, x + w, y + d, fs.E, 0]];
    faces[0][5] = camDist2(cx, y); faces[1][5] = camDist2(cx, y + d); faces[2][5] = camDist2(x, cy); faces[3][5] = camDist2(x + w, cy);
    faces.sort((p, q) => q[5] - p[5]);
    for (const f of faces) tri(f[0], f[1], f[2], f[3], f[4] + 0.06);
  }
  /** Gable roof (prism) along axis 'x' or 'y' from h0 (eaves) to h1 (ridge). */
  function gable(x, y, w, d, h0, h1, col, axis) {
    const k0 = kh(h0), k1 = kh(h1);
    const fs = R.faceShade;
    if (axis === 'x') {
      const ry = y + d / 2;
      // two slopes: north (faces N/up) and south
      const nf = CAMY < ry ? 1 : 0;
      const slope = (yy, f) => { ctx.beginPath(); ctx.moveTo(sxp(x, k0), syp(yy, k0)); ctx.lineTo(sxp(x + w, k0), syp(yy, k0)); ctx.lineTo(sxp(x + w, k1), syp(ry, k1)); ctx.lineTo(sxp(x, k1), syp(ry, k1)); ctx.closePath(); fill(sh(col, f)); };
      if (nf) { slope(y + d, fs.S + 0.1); slope(y, fs.N + 0.12); } else { slope(y, fs.N + 0.12); slope(y + d, fs.S + 0.1); }
      // gable ends
      const end = (xx, f) => { ctx.beginPath(); ctx.moveTo(sxp(xx, k0), syp(y, k0)); ctx.lineTo(sxp(xx, k0), syp(y + d, k0)); ctx.lineTo(sxp(xx, k1), syp(ry, k1)); ctx.closePath(); fill(f); };
      if (CAMX < x) end(x, sh(col, fs.W * 0.9)); else if (CAMX > x + w) end(x + w, sh(col, fs.E * 0.9));
    } else {
      const rx = x + w / 2;
      const slope = (xx, f) => { ctx.beginPath(); ctx.moveTo(sxp(xx, k0), syp(y, k0)); ctx.lineTo(sxp(xx, k0), syp(y + d, k0)); ctx.lineTo(sxp(rx, k1), syp(y + d, k1)); ctx.lineTo(sxp(rx, k1), syp(y, k1)); ctx.closePath(); fill(sh(col, f)); };
      if (CAMX < rx) { slope(x + w, fs.E + 0.1); slope(x, fs.W + 0.12); } else { slope(x, fs.W + 0.12); slope(x + w, fs.E + 0.1); }
      const end = (yy, f) => { ctx.beginPath(); ctx.moveTo(sxp(x, k0), syp(yy, k0)); ctx.lineTo(sxp(x + w, k0), syp(yy, k0)); ctx.lineTo(sxp(rx, k1), syp(yy, k1)); ctx.closePath(); fill(f); };
      if (CAMY < y) end(y, sh(col, fs.N * 0.9)); else if (CAMY > y + d) end(y + d, sh(col, fs.S * 0.9));
    }
  }

  /** Parapet around a rect at height h (thin walls with a facade spec), far sides first.
   *  The inside of far walls is visible from the camera (darker). */
  const parBuf = [['N', 0], ['S', 0], ['W', 0], ['E', 0]];
  function parapet(x, y, w, d, h, ph, st, spec) {
    parBuf[0][1] = camDist2(x + w / 2, y); parBuf[1][1] = camDist2(x + w / 2, y + d);
    parBuf[2][1] = camDist2(x, y + d / 2); parBuf[3][1] = camDist2(x + w, y + d / 2);
    parBuf.sort((a, b) => b[1] - a[1]);
    const fs = R.faceShade;
    for (const pb of parBuf) {
      const face = pb[0];
      const fw = faceWall(face, x, y, w, d);
      const outer = fw.dist > 0; // camera on the outside of this wall
      const f = outer ? fs[face] : fs[face] * 0.72;
      if (offscreenWall(fw.ax, fw.ay, fw.ax + fw.ux * fw.L, fw.ay + fw.uy * fw.L, h, h + ph)) continue;
      if (Math.abs(fw.dist) * Z * ph * P < 1.4) {
        // a sliver of a pixel or so: one quad in the crest colour instead of every merlon
        ctx.beginPath(); mv(fw.ax, fw.ay, h); ln(fw.ax + fw.ux * fw.L, fw.ay + fw.uy * fw.L, h); ln(fw.ax + fw.ux * fw.L, fw.ay + fw.uy * fw.L, h + ph); ln(fw.ax, fw.ay, h + ph); ctx.closePath();
        fill(clsColor(st, 'l', f));
        continue;
      }
      const g = geomOf(spec, fw.L, ph);
      for (let i = 0; i < g.order.length; i++) {
        const c = g.order[i];
        ctx.beginPath(); pathArr(g.cls[c], fw.ax, fw.ay, fw.ux, fw.uy, h); fill(clsColor(st, c, f));
      }
    }
  }

  /** Clock hands on a facade at (st.clock = {u: 'mid'|number, v, r}) showing N.clock time. */
  function clockHands(c, ax, ay, ux, uy, h0, L) {
    const uc = c.u == null ? L / 2 : c.u, vc = c.v, r = c.r;
    const m = N.clock.minutes;
    const ah = ((m % 720) / 720) * TAU, am = ((m % 60) / 60) * TAU;
    const A = ax - CAMX, B = ay - CAMY;
    const pt = (u, v) => { const k = Z * (1 + (h0 + v) * P); return [CX + (A + ux * u) * k, CY + (B + uy * u) * k]; };
    const o = pt(uc, vc), hh = pt(uc - Math.sin(ah) * r * 0.55, vc + Math.cos(ah) * r * 0.55), mm = pt(uc - Math.sin(am) * r * 0.85, vc + Math.cos(am) * r * 0.85);
    ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(hh[0], hh[1]); ctx.moveTo(o[0], o[1]); ctx.lineTo(mm[0], mm[1]);
    ctx.strokeStyle = '#2a2018'; ctx.lineWidth = Math.max(0.6, Z * 0.55); ctx.stroke();
  }

  /** Flag on a pole: pennant (tri) or rectangular (rect), waving. */
  function flag(x, y, h0, h1, col, len, fh, tri, col2, col3) {
    pole(x, y, h0, h1, '#6a5a48', 0.6);
    const t = TIME * 3 + x * 0.05;
    const wind = 0.35 + Math.sin(TIME * 0.4 + y) * 0.25;
    const dx = Math.cos(wind) * len, dy = Math.sin(wind) * len;
    const wv = Math.sin(t) * 1.2;
    const nx = -Math.sin(wind) * wv, ny = Math.cos(wind) * wv;
    if (col2) { // tricolour: three horizontal bands
      const cols = [col, col2, col3];
      for (let i = 0; i < 3; i++) {
        const ha = h1 - (fh * i) / 3, hb = h1 - (fh * (i + 1)) / 3;
        ctx.beginPath(); mv(x, y, ha); ln(x + dx * 0.5 + nx, y + dy * 0.5 + ny, ha - 0.3); ln(x + dx, y + dy, ha - 0.6);
        ln(x + dx, y + dy, hb - 0.6); ln(x + dx * 0.5 + nx, y + dy * 0.5 + ny, hb - 0.3); ln(x, y, hb); ctx.closePath(); fill(cols[i]);
      }
      return;
    }
    ctx.beginPath();
    mv(x, y, h1);
    if (tri) { ln(x + dx * 0.5 + nx, y + dy * 0.5 + ny, h1 - fh * 0.3); ln(x + dx, y + dy, h1 - fh * 0.5); ln(x, y, h1 - fh); }
    else { ln(x + dx * 0.5 + nx, y + dy * 0.5 + ny, h1 - 0.3); ln(x + dx, y + dy, h1 - 0.5); ln(x + dx, y + dy, h1 - fh - 0.5); ln(x + dx * 0.5 + nx, y + dy * 0.5 + ny, h1 - fh - 0.3); ln(x, y, h1 - fh); }
    ctx.closePath(); fill(col);
  }

  /** Bulb string: dots between two points at heights (light layer). Batched into two paths
   *  (even / odd bulbs) that twinkle in turn like a chaser string. */
  function bulbs(x0, y0, h0, x1, y1, h1, n, col, col2, sag) {
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = pass; i <= n; i += 2) {
        const t = i / n;
        const h = h0 + (h1 - h0) * t - (sag || 0) * Math.sin(t * Math.PI);
        const k = kh(h);
        ctx.rect(Math.round(sxp(x0 + (x1 - x0) * t, k)) - 1, Math.round(syp(y0 + (y1 - y0) * t, k)) - 1, 2, 2);
      }
      ctx.globalAlpha = NIGHT * (0.72 + 0.28 * Math.sin(TIME * 3.2 + pass * Math.PI + x0 * 0.01));
      ctx.fillStyle = pass && col2 ? col2 : col; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function bulbRing(x, y, r, h, n, col, col2) {
    const k = kh(h), X = sxp(x, k), Y = syp(y, k), rr = r * k;
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = pass; i < n; i += 2) { const a = (i / n) * TAU; ctx.rect(Math.round(X + Math.cos(a) * rr) - 1, Math.round(Y + Math.sin(a) * rr) - 1, 2, 2); }
      ctx.globalAlpha = NIGHT * (0.72 + 0.28 * Math.sin(TIME * 3.2 + pass * Math.PI + x * 0.01));
      ctx.fillStyle = pass && col2 ? col2 : col; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function bulbRect(x, y, w, d, h, step, col, col2) {
    const nx = Math.max(1, Math.round(w / step)), ny = Math.max(1, Math.round(d / step));
    bulbs(x, y, h, x + w, y, h, nx, col, col2); bulbs(x + w, y, h, x + w, y + d, h, ny, col, col2);
    bulbs(x + w, y + d, h, x, y + d, h, nx, col, col2); bulbs(x, y + d, h, x, y, h, ny, col, col2);
  }
  /** Soft additive glow blob at (x, y, h) on the light layer. */
  const glowCache = new Map();
  function glowImg(col) {
    let c = glowCache.get(col);
    if (c) return c;
    c = N.render.makeCanvas(64, 64);
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    const [r, gg, b] = U.hexToRgb(col);
    gr.addColorStop(0, 'rgba(' + r + ',' + gg + ',' + b + ',0.9)'); gr.addColorStop(0.35, 'rgba(' + r + ',' + gg + ',' + b + ',0.35)'); gr.addColorStop(1, 'rgba(' + r + ',' + gg + ',' + b + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glowCache.set(col, c);
    return c;
  }
  function glow(x, y, h, r, col, a) {
    const k = kh(h), X = sxp(x, k), Y = syp(y, k), rr = r * k;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = U.clamp(a, 0, 1);
    ctx.drawImage(glowImg(col), X - rr, Y - rr, rr * 2, rr * 2);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  /** Draw only the given facade classes of a box face in a colour (light layer emissives). */
  function faceEmit(x, y, w, d, h0, h1, spec, classes, col, alpha) {
    const fs = 'NSWE';
    for (let i = 0; i < 4; i++) {
      const face = fs[i];
      if (!(face === 'N' ? CAMY < y : face === 'S' ? CAMY > y + d : face === 'W' ? CAMX < x : CAMX > x + w)) continue;
      const fw = faceWall(face, x, y, w, d);
      if (Math.abs(fw.dist) * Z * (h1 - h0) * P < 2.2) continue;
      const g = geomOf(spec, fw.L, h1 - h0);
      ctx.beginPath();
      for (const c of classes) if (g.cls[c]) pathArr(g.cls[c], fw.ax, fw.ay, fw.ux, fw.uy, h0);
      ctx.globalAlpha = alpha; fill(col); ctx.globalAlpha = 1;
    }
  }
  function visibleFace(face, x, y, w, d) {
    return face === 'N' ? CAMY < y : face === 'S' ? CAMY > y + d : face === 'W' ? CAMX < x : CAMX > x + w;
  }

  /* ======================================================= festivals / story hooks */
  const fx = { charminarLights: null, festive: null, ganesh: null };
  function flagOn(id) {
    const F = N.flags || {};
    if (F[id]) return true;
    if (F.festival === id) return true;
    if (Array.isArray(F.festivals) && F.festivals.indexOf(id) >= 0) return true;
    return false;
  }
  function festiveNight() {
    if (fx.festive != null) return !!fx.festive;
    return flagOn('chand_raat') || flagOn('eid') || flagOn('ramzan') || flagOn('finale');
  }
  function ganeshOn() {
    if (fx.ganesh != null) return !!fx.ganesh;
    return flagOn('ganesh') || flagOn('ganesh_immersion') || flagOn('ganesh_chaturthi') || flagOn('vinayaka_chavithi');
  }
  function bonaluOn() { return flagOn('bonalu'); }
  function decemberish() {
    try { return /DEC/.test(N.clock.dateLabel()) || flagOn('christmas'); } catch (e) { return false; }
  }

  /* ======================================================= light helpers */
  // per-landmark preallocated light objects (no per-frame allocation)
  function lightsOf(lm, n) {
    if (!lm._lights) { lm._lights = []; for (let i = 0; i < n; i++) lm._lights.push({ x: 0, y: 0, r: 40, color: '#ffd890', intensity: 1, h: 0 }); }
    return lm._lights;
  }
  function pushLight(L, x, y, h, r, color, intensity, glowOn) {
    L.x = x; L.y = y; L.h = h; L.r = r; L.color = color; L.intensity = intensity; L.glow = glowOn === false ? false : undefined;
    N.render.lights.push(L);
  }

  /* ============================================================ registry */
  const defs = {};
  const nightList = [];
  let lightQueued = false;
  function drawLightLayer() {
    lightQueued = false;
    frame();
    const a = U.clamp(NIGHT * 1.2, 0, 1);
    // lit windows / arch glows recorded in the structures pass
    if (litN && a > 0.05) {
      for (let i = 0; i < litN; i++) {
        const e = litPool[i];
        ctx.beginPath(); pathArr(e.arr, e.ax, e.ay, e.ux, e.uy, e.h0);
        ctx.globalAlpha = a; fill(e.col);
      }
      ctx.globalAlpha = 1;
    }
    litN = 0;
    for (let i = 0; i < nightList.length; i++) {
      const lm = nightList[i], def = defs[lm.draw];
      try { def.night(lm, a); } catch (e) { N.err('landmarks.night:' + lm.draw, e); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    nightList.length = 0;
  }

  function runDraw(lm) {
    frame();
    const def = defs[lm.draw];
    if (lm._broken || !def || !def.draw) { drawDefault(lm); return; }
    try { def.draw(lm); } catch (e) {
      lm._broken = true;
      N.err('landmarks.draw:' + lm.draw, e);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      drawDefault(lm);
    }
  }
  function runFloor(lm) {
    frame();
    const def = defs[lm.draw];
    if (!def || !def.floor || lm._broken) return;
    try { def.floor(lm); } catch (e) { lm._broken = true; N.err('landmarks.floor:' + lm.draw, e); }
  }

  function enqueue(lm, visible) {
    const def = defs[lm.draw];
    if (def && def.enqueue) return def.enqueue(lm, visible); // old-style module (places_art.js)
    frame();
    if (!lm._fn) {
      lm._fn = () => runDraw(lm);
      lm._ffn = () => runFloor(lm);
      if (def && def.init) { try { def.init(lm); } catch (e) { N.err('landmarks.init:' + lm.draw, e); } }
    }
    if (!def || !def.draw || lm._broken) {
      if (R.sun.strength > 0.18) N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, lm.h);
      if (visible) R.queue('structures', R.distKey(lm.x, lm.y), lm._fn);
      return;
    }
    if (R.sun.strength > 0.18 && !lm._broken) {
      if (def.shadow) { try { def.shadow(lm); } catch (e) { N.err('landmarks.shadow:' + lm.draw, e); } }
      else N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, lm.h * 0.8);
    }
    if (!visible) return;
    if (def.floor) R.queue('ground', 1, lm._ffn);
    R.queue('structures', R.distKey(lm.x, lm.y), lm._fn);
    if (NIGHT > 0.04) {
      if (def.lights) { try { def.lights(lm); } catch (e) { N.err('landmarks.lights:' + lm.draw, e); } }
      if (def.night) nightList.push(lm);
      if (!lightQueued) { lightQueued = true; R.queue('light', 5, drawLightLayer); }
    } else if (litN && !lightQueued) { lightQueued = true; R.queue('light', 5, drawLightLayer); }
  }

  function paintGround(g, lm) {
    const def = defs[lm.draw];
    if (!def) return;
    if (def.paintGround) return def.paintGround(g, lm);
    if (def.ground) def.ground(g, lm);
  }

  /* ============================================================ fallback */
  const DEF_COL = {
    cinema: ['#d9cdb8', '#b22b2b'], school: ['#e8d9a0', '#2a5cb8'], kirana: ['#e0d4bc', '#d8402a'], irani_cafe: ['#e6e0d0', '#2a8c82'],
    hospital: ['#eef0ee', '#2a8c5a'], restaurant: ['#efe6d2', '#c03a2a'], bakery: ['#efe2c8', '#a0522d'], railway_station: ['#c9a27a', '#7a3a2a'],
  };
  function drawDefault(lm) {
    frame();
    const x = lm.x - lm.w / 2, y = lm.y - lm.d / 2, h = Math.max(6, lm.h || 20);
    const cols = DEF_COL[lm.draw] || ['#e3d6bb', '#d8402a'];
    let st = lm._defSt;
    if (!st) {
      st = lm._defSt = {
        wall: cols[0], roof: sh(cols[0], 1.08), trim: '#f6efe0', dark: '#3a302c',
        fac: fac((g, L, H) => {
          const floors = Math.max(1, Math.round(H / 10));
          for (let f = 0; f < floors; f++) g.wins('w', 2, L - 2, Math.max(1, Math.floor((L - 4) / 7)), f * (H / floors) + H / floors * 0.32, f * (H / floors) + H / floors * 0.72, 2.6);
          g.rect('l', 0, H - 1.2, L, H);
        }),
        roofFn(c, bx, by, bw, bd) {
          c.strokeStyle = 'rgba(80,60,40,0.35)'; c.lineWidth = 1.2; c.strokeRect(bx + 1, by + 1, bw - 2, bd - 2);
          c.fillStyle = 'rgba(70,60,50,0.18)'; c.fillRect(bx + bw * 0.6, by + bd * 0.2, bw * 0.22, bd * 0.25);
        },
      };
    }
    box(x, y, lm.w, lm.d, 0, h, st);
    // painted signboard on the entrance side
    const txt = (lm.sign || lm.name || lm.id || '').toUpperCase();
    const f = (lm.face || 's').toUpperCase();
    if (txt) {
      const sx = f === 'W' ? x : f === 'E' ? x + lm.w : lm.x, sy = f === 'N' ? y : f === 'S' ? y + lm.d : lm.y;
      const tw = N.draw.pixelTextWidth(txt), k = kh(h);
      const span = (f === 'N' || f === 'S' ? lm.w : lm.d) * k;
      if (tw + 4 <= span + 6) {
        const X = sxp(sx, k), Y = syp(sy, k);
        const vert = f === 'W' || f === 'E';
        ctx.fillStyle = cols[1];
        if (vert) ctx.fillRect(Math.round(X - 4), Math.round(Y - tw / 2 - 2), 8, tw + 4); else ctx.fillRect(Math.round(X - tw / 2 - 2), Math.round(Y - 4), tw + 4, 8);
        N.draw.pixelText(sx, sy, h, txt, '#fff6e0', vert ? { rot: f === 'E' ? -1 : 1 } : null);
      }
    }
  }

  /* ============================================================ registry object */
  const L = (N.landmarks = {
    defs,
    fx,
    register(drawId, def) { defs[drawId] = def; },
    enqueue,
    paintGround,
    drawDefault,
    festiveNight, ganeshOn,
    kit: null, // filled below
  });

  /* ======================================================================== */
  /*                               THE OLD CITY                               */
  /* ======================================================================== */
  const LIME = '#e8d9b5', LIME_HI = '#f3e9cf', LIME_RF = '#efe3c4', GRANITE = '#9c9289', GRANITE_DK = '#8f8a86';

  /* ---------------------------------------------------------------- Charminar */
  // Tiers (world height): plinth 0-2.6 | great-arch storey 2.6-38 | first-floor balcony slab
  // 37.2-39.4 | arcaded upper storey 39.4-50 | arched crest 50-53.4 | minarets to ~93.
  const CM_TOP = 50, CM_MAIN = 38, CM_SLAB = 39.4;
  const CM = {
    body: fac((g, L, H) => {
      const m = L / 2;
      g.rect('g', 0, 0, L, 2.2);                                  // granite skirting
      g.rect('r', m - 15.5, 0, m + 15.5, 34.6);                    // recessed panel framing arch + clock
      g.arch('l', m - 12.8, m + 12.8, 0, 13.6, 28.6, 1.5, 6);      // moulded arch frame
      g.arch('d', m - 11.4, m + 11.4, 0, 13.4, 27.2, 1.5, 6);      // the great arch
      g.arch('p', m - 6.4, m + 6.4, 0, 6.2, 12.8, 1.3, 4);         // daylight through the far arch
      g.circ('l', m - 14, 27.6, 1.2, 6); g.circ('l', m + 14, 27.6, 1.2, 6); // spandrel rosettes
      g.circ('l', m, 31.4, 3.6, 14); g.circ('c', m, 31.4, 2.9, 14); // clock (1889)
      for (let u = 8; u <= L - 8; u += 3.2) g.rect('r', u - 0.5, 34.8, u + 0.5, 35.4); // corbels under the balcony
      g.rect('s', 6, 34.6, L - 6, 35.4);
    }),
    upper: fac((g, L, H) => {
      g.rect('l', 0, 0, L, 1);
      g.arcade('d', 5, L - 5, 7, 1.2, 5, 8.2, 1.6, 1.4);
      g.rect('l', 0, H - 1.3, L, H - 0.5);
    }),
    slab: fac((g, L, H) => { g.rect('s', 0, 0, L, H * 0.4); }),
    crest: fac((g, L, H) => { g.rect('r', 0, 0, L, 1.2); g.rect('l', 0, 1, L, 1.6); g.teeth('l', L, 1.4, H, 1.9, 3.1, true); }),
    mosq: fac((g, L, H) => { g.arcade('d', 2, L - 2, 5, 0, H * 0.45, H * 0.78, 1.1, 1.4); g.rect('l', 0, H - 1, L, H); }),
  };
  function charminarStyles(lm) {
    if (lm._st) return lm._st;
    lm._st = {
      plinth: { wall: GRANITE, roof: '#b3a796' },
      plinth2: { wall: '#a59a8c', roof: '#c9bb9f' },
      main: { wall: LIME, roof: LIME_RF, trim: LIME_HI, dark: '#3d2f28', base: GRANITE, pass: '#cdb88f', fac: CM.body, clock: { v: 31.4, r: 2.9 } },
      slab: { wall: '#efe4c6', roof: '#f4ebd2', fac: CM.slab },
      upper: {
        wall: '#e6d6b0', roof: LIME_RF, trim: LIME_HI, dark: '#3d2f28', fac: CM.upper,
        roofFn(c, x, y, w, d) {
          // terrace: walkway ring, flagstones, the open well over the crossing of the arches
          c.fillStyle = 'rgba(120,100,70,0.14)'; c.fillRect(x + 2, y + 2, w - 4, d - 4);
          c.fillStyle = LIME_RF; c.fillRect(x + 5, y + 5, w - 10, d - 10);
          c.strokeStyle = 'rgba(150,125,90,0.32)'; c.lineWidth = 0.45;
          c.beginPath();
          for (let i = 1; i < 6; i++) { c.moveTo(x + 5, y + 5 + i * (d - 10) / 6); c.lineTo(x + w - 5, y + 5 + i * (d - 10) / 6); }
          c.stroke();
          const cx = x + w / 2, cy = y + d / 2;
          c.fillStyle = '#d6c4a0'; c.fillRect(cx - 7.5, cy - 7.5, 15, 15);
          // radiating ribs from the central well to the four arches below
          c.strokeStyle = 'rgba(160,135,95,0.4)'; c.lineWidth = 0.6;
          c.beginPath(); c.moveTo(cx, y + 5); c.lineTo(cx, cy - 7.5); c.moveTo(cx, cy + 7.5); c.lineTo(cx, y + d - 5); c.moveTo(x + 5, cy); c.lineTo(cx - 7.5, cy); c.moveTo(cx + 7.5, cy); c.lineTo(x + w - 5, cy); c.stroke();
        },
      },
      crest: { wall: '#d9c69c', trim: '#fbf3dc' },
      mosque: { wall: '#eadcb9', roof: '#f1e6cb', trim: LIME_HI, dark: '#4a382c', fac: CM.mosq },
    };
    return lm._st;
  }
  // a Charminar minaret, drawn between heights [from, to): fluted shaft, two corbelled ring
  // balconies, an arched kiosk and an onion dome on a lotus-petal base
  const CM_SHAFT = '#dccaa3', CM_CORBEL = '#b49f78', CM_FLOOR = '#efe5ca';
  function cmMinaret(x, y, from, to) {
    const seg = (r, h0, h1, col, top, fl) => {
      const a = Math.max(h0, from), b = Math.min(h1, to);
      if (b - a <= 0.01) return;
      cylV(x, y, r, a, b, col, b === h1 ? top : false);
      if (fl) flutes(x, y, r, a, b, fl);
    };
    seg(5.6, 1.4, CM_TOP, CM_SHAFT, false, 3);
    seg(6.1, CM_TOP, 52, LIME_HI, LIME_HI, 0);
    if (from <= 52 && to > 52) ring(x, y, 4.6, 52.1, 'rgba(80,60,40,0.45)', 0.9);
    seg(4.4, 52, 63, CM_SHAFT, false, 2);
    seg(6.0, 61.2, 63.2, CM_CORBEL, CM_FLOOR, 0);
    if (from <= 63.2 && to > 63.2) { ring(x, y, 4.5, 63.3, 'rgba(80,60,40,0.55)', 1); ring(x, y, 5.7, 64.3, '#fffaf0', 0.5); }
    seg(3.9, 63.2, 73.6, CM_SHAFT, false, 2);
    seg(5.4, 71.8, 73.8, CM_CORBEL, CM_FLOOR, 0);
    if (from <= 73.8 && to > 73.8) { ring(x, y, 4.0, 73.9, 'rgba(80,60,40,0.55)', 1); ring(x, y, 5.1, 74.8, '#fffaf0', 0.5); }
    seg(3.5, 73.8, 79.2, '#e4d3ae', LIME_HI, 0);
    if (from <= 79.2 && to > 79.2) {
      kioskArches(x, y, 3.5, 74.6, 78.4);
      ring(x, y, 3.4, 79.3, 'rgba(80,60,40,0.5)', 0.8);
      petals(x, y, 3.2, 5.3, 79.6, 10, '#f6ecd2');
      dome(x, y, 4.1, 79.4, 89.4, '#f7eed6', true, 4, '#d1a83a');
      disc(x, y, 0.65, 93.4, '#e0bb4c');
    }
  }
  // vertical flutes on the camera-facing side of a cylinder
  function flutes(x, y, r, h0, h1, n) {
    const a0 = Math.atan2(CAMY - y, CAMX - x);
    const k0 = kh(h0), k1 = kh(h1);
    ctx.beginPath();
    for (let i = -n; i <= n; i++) {
      if (!i) continue;
      const a = a0 + i * (1.25 / n);
      const px = x + Math.cos(a) * r * 0.98, py = y + Math.sin(a) * r * 0.98;
      ctx.moveTo(sxp(px, k0), syp(py, k0)); ctx.lineTo(sxp(px, k1), syp(py, k1));
    }
    ctx.strokeStyle = 'rgba(110,85,55,0.32)'; ctx.lineWidth = Math.max(0.5, 0.5 * k0); ctx.stroke();
  }
  function kioskArches(x, y, r, h0, h1) {
    const a0 = Math.atan2(CAMY - y, CAMX - x);
    const k0 = kh(h0), k1 = kh(h1);
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      const a = a0 + i * 0.95;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      ctx.moveTo(sxp(px, k0), syp(py, k0)); ctx.lineTo(sxp(px, k1), syp(py, k1));
    }
    ctx.strokeStyle = '#5a4434'; ctx.lineWidth = Math.max(1, 1.3 * k0); ctx.stroke();
  }
  const cmItems = [{ d: 0, k: 0 }, { d: 0, k: 1 }, { d: 0, k: 2 }, { d: 0, k: 3 }, { d: 0, k: 4 }];
  const cmFront = [false, false, false, false];
  function drawCharminar(lm) {
    const st = charminarStyles(lm);
    const X = lm.x, Y = lm.y;
    const bx = X - 26, by = Y - 26, B = 52;
    box(X - 32, Y - 32, 64, 64, 0, 1.4, st.plinth);
    box(X - 30, Y - 30, 60, 60, 1.4, 2.6, st.plinth2);
    box(bx, by, B, B, 2.6, CM_MAIN, st.main);
    box(X - 27.5, Y - 27.5, 55, 55, 37.2, CM_SLAB, st.slab);
    // which corner minarets stand in front of a visible wall
    const vN = CAMY < by, vS = CAMY > by + B, vW = CAMX < bx, vE = CAMX > bx + B;
    cmFront[0] = vW || vN; cmFront[1] = vE || vN; cmFront[2] = vW || vS; cmFront[3] = vE || vS;
    const cs = CM_CORNERS;
    // back minarets: the band hidden behind the upper storey's walls first
    for (let i = 0; i < 4; i++) if (!cmFront[i]) cmMinaret(X + cs[i][0], Y + cs[i][1], CM_SLAB, CM_TOP);
    box(X - 24, Y - 24, 48, 48, CM_SLAB, CM_TOP, st.upper);
    courtHole(X - 5.5, Y - 5.5, 11, 11, CM_TOP, st.main, '#cdb88f', null);
    parapet(X - 23.5, Y - 23.5, 47, 47, CM_TOP, 3.4, st.crest, CM.crest);
    // then the roof mosque and the minarets, far -> near
    for (let i = 0; i < 4; i++) { cmItems[i].k = i; cmItems[i].d = camDist2(X + cs[i][0], Y + cs[i][1]); }
    cmItems[4].k = 4; cmItems[4].d = camDist2(X - 14, Y);
    cmItems.sort((a, b) => b.d - a.d);
    for (const it of cmItems) {
      if (it.k === 4) {
        box(X - 21, Y - 13, 10, 26, CM_TOP, CM_TOP + 6, st.mosque);
        dome(X - 16, Y - 6, 2.6, CM_TOP + 6, CM_TOP + 9.4, '#efe3c3', true, 1.4);
        dome(X - 16, Y + 6, 2.6, CM_TOP + 6, CM_TOP + 9.4, '#efe3c3', true, 1.4);
        for (const yy of [Y - 12.2, Y + 12.2]) { cylV(X - 11.8, yy, 0.9, CM_TOP + 6, CM_TOP + 11, '#efe3c3', false); dome(X - 11.8, yy, 1, CM_TOP + 11, CM_TOP + 12.6, '#f4ead0', true, 0.6); }
        continue;
      }
      const i = it.k;
      cmMinaret(X + cs[i][0], Y + cs[i][1], cmFront[i] ? 1.4 : CM_TOP, 999);
    }
  }
  const CM_CORNERS = [[-26, -26], [26, -26], [-26, 26], [26, 26]];
  function charminarShadow(lm) {
    const D = N.draw;
    D.castBox(lm.x - 26, lm.y - 26, 52, 52, CM_TOP);
    for (const c of CM_CORNERS) { D.castPole(lm.x + c[0], lm.y + c[1], 86, 9.5); D.castCircle(lm.x + c[0] + R.sun.sx * 84, lm.y + c[1] + R.sun.sy * 84, 4.6, 0); }
  }
  function charminarLevel() {
    if (fx.charminarLights != null) return U.clamp(fx.charminarLights, 0, 1);
    return NIGHT;
  }
  function charminarLights(lm) {
    const a = charminarLevel();
    if (a < 0.05) return;
    const Ls = lightsOf(lm, 4);
    pushLight(Ls[0], lm.x, lm.y, 0, 150, '#ffcf7a', 0.95 * a, false);
    pushLight(Ls[1], lm.x, lm.y, 34, 95, '#ffcf7a', a, false);
    pushLight(Ls[2], lm.x, lm.y, 70, 90, '#ffe0a0', a, false);
    pushLight(Ls[3], lm.x, lm.y + 40, 4, 70, '#ffb050', 0.5 * a, true);
  }
  function charminarNight(lm, al) {
    const a = Math.max(al, charminarLevel());
    if (a < 0.05) return;
    const st = charminarStyles(lm);
    const X = lm.x, Y = lm.y, bx = X - 26, by = Y - 26, B = 52;
    // floodlights from below: warm multiply tint + a little bloom
    tint(X, Y, 30, 125, '#ffc27a', a);
    glow(X, Y, 10, 120, '#ff9c40', 0.22 * a);
    // glowing arch interiors and clock faces
    faceEmit(bx, by, B, B, 2.6, CM_MAIN, CM.body, ['p'], '#ffd27a', 0.9 * a);
    faceEmit(bx, by, B, B, 2.6, CM_MAIN, CM.body, ['c'], '#fff6d8', a);
    for (const face of 'NSWE') {
      if (!visibleFace(face, bx, by, B, B)) continue;
      const fw = faceWall(face, bx, by, B, B);
      if (Math.abs(fw.dist) * Z * (CM_MAIN - 2.6) * P < 2.2) continue;
      clockHands(st.main.clock, fw.ax, fw.ay, fw.ux, fw.uy, 2.6, B);
    }
    const fest = festiveNight();
    const c1 = fest ? '#8dffa8' : '#fff1b8', c2 = fest ? '#fffbe8' : null;
    bulbRect(X - 23.5, Y - 23.5, 47, 47, CM_TOP + 3.4, 3.2, c1, c2);
    bulbRect(X - 27.5, Y - 27.5, 55, 55, CM_SLAB, 3.4, c1, c2);
    for (const c of CM_CORNERS) {
      const cx = X + c[0], cy = Y + c[1];
      bulbRing(cx, cy, 5.8, 63.4, 12, c1, c2);
      bulbRing(cx, cy, 5.2, 74, 10, c1, c2);
      glow(cx, cy, 88, 7, '#fff0c0', 0.4 * a);
    }
    if (fest) {
      // Chand Raat: bulb strings from the minaret balconies to the plaza corners + crescents
      for (const c of CM_CORNERS) bulbs(X + c[0], Y + c[1], 62, X + c[0] * 3.6, Y + c[1] * 3.6, 12, 26, '#8dffa8', '#fff3c0', 9);
      for (const face of 'NSWE') {
        if (!visibleFace(face, bx, by, B, B)) continue;
        const fw = faceWall(face, X - 24, Y - 24, 48, 48);
        crescent(fw.ax + fw.ux * 24, fw.ay + fw.uy * 24, CM_TOP + 7, 3.4, a);
      }
    }
  }
  // warm multiply tint (centre colour -> white at the edge) on the light layer
  const tintCache = new Map();
  function tint(x, y, h, r, col, a) {
    let c = tintCache.get(col);
    if (!c) {
      c = N.render.makeCanvas(64, 64);
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, col); gr.addColorStop(0.55, U.mix(col, '#ffffff', 0.45)); gr.addColorStop(1, '#ffffff');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      tintCache.set(col, c);
    }
    const k = kh(h), X = sxp(x, k), Y = syp(y, k), rr = r * k;
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = U.clamp(a, 0, 1);
    ctx.drawImage(c, X - rr, Y - rr, rr * 2, rr * 2);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  // glowing crescent-and-star cut-out at a point (light layer)
  function crescent(x, y, h, r, a) {
    const k = kh(h), X = sxp(x, k), Y = syp(y, k), rr = r * k;
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(X, Y, rr, 0, TAU); ctx.arc(X + rr * 0.45, Y - rr * 0.2, rr * 0.85, 0, TAU, true);
    ctx.fillStyle = '#b8ffcf'; ctx.fill('evenodd');
    ctx.fillRect(Math.round(X + rr * 0.9), Math.round(Y - rr * 0.5), 2, 2);
    ctx.globalAlpha = 1;
  }
  function charminarGround(g, lm) {
    // granite apron + paving around the monument (inside the ±64 box)
    const x = lm.x, y = lm.y;
    g.fillStyle = '#cbbd9f'; g.fillRect(x - 46, y - 46, 92, 92);
    g.strokeStyle = 'rgba(110,90,70,0.28)'; g.lineWidth = 0.8;
    for (let r = 38; r <= 46; r += 4) g.strokeRect(x - r, y - r, r * 2, r * 2);
    g.beginPath();
    for (let i = -44; i <= 44; i += 8) { g.moveTo(x + i, y - 46); g.lineTo(x + i, y - 34); g.moveTo(x + i, y + 34); g.lineTo(x + i, y + 46); g.moveTo(x - 46, y + i); g.lineTo(x - 34, y + i); g.moveTo(x + 34, y + i); g.lineTo(x + 46, y + i); }
    g.stroke();
    // low iron railing with gaps at the four arches
    g.strokeStyle = 'rgba(40,40,46,0.55)'; g.lineWidth = 1;
    g.setLineDash([2, 1.5]);
    for (const [sx, sy, ex, ey] of [[-50, -50, -14, -50], [14, -50, 50, -50], [-50, 50, -14, 50], [14, 50, 50, 50], [-50, -50, -50, -14], [-50, 14, -50, 50], [50, -50, 50, -14], [50, 14, 50, 50]]) {
      g.beginPath(); g.moveTo(x + sx, y + sy); g.lineTo(x + ex, y + ey); g.stroke();
    }
    g.setLineDash([]);
    // worn paths through the four arches
    g.fillStyle = 'rgba(150,130,100,0.25)';
    g.fillRect(x - 10, y - 64, 20, 30); g.fillRect(x - 10, y + 34, 20, 30); g.fillRect(x - 64, y - 10, 30, 20); g.fillRect(x + 34, y - 10, 30, 20);
  }
  L.register('charminar', { draw: drawCharminar, shadow: charminarShadow, lights: charminarLights, night: charminarNight, ground: charminarGround });

  /* ---------------------------------------------------------------- Char Kaman */
  const KM = {
    pier: fac((g, L, H) => {
      g.rect('g', 0, 0, L, 2);
      g.arch('r', L * 0.22, L * 0.78, 4, H * 0.42, H * 0.56, 1.4);
      g.arch('d', L * 0.3, L * 0.7, 6, H * 0.42, H * 0.53, 1.4);
      g.rect('l', 0, H * 0.66, L, H * 0.66 + 1.2);
      g.arch('d', L * 0.3, L * 0.7, H * 0.72, H * 0.82, H * 0.9, 1.4);
    }),
    span: fac((g, L, H) => {
      g.rect('l', 0, 0, L, 1.2);
      g.arcade('d', 4, L - 4, 6, 3, H * 0.45, H * 0.72, 1.6, 1.4);
      g.rect('l', 0, H - 1.4, L, H);
    }),
    crest: fac((g, L, H) => { g.rect('l', 0, 0, L, 1); g.teeth('l', L, 0.8, H, 1.6, 3, true); }),
  };
  function kamanStyles(lm) {
    if (lm._st) return lm._st;
    const wall = '#dccdaa';
    lm._st = {
      pier: { wall, roof: LIME_RF, trim: LIME_HI, dark: '#3d3029', base: GRANITE, fac: KM.pier },
      span: { wall, roof: LIME_RF, trim: LIME_HI, dark: '#3d3029', fac: KM.span },
      spand: wall,
      crest: { wall, trim: LIME_HI },
    };
    return lm._st;
  }
  const KM_SPRING = 22, KM_APEX = 36, KM_SPAN0 = 36, KM_TOP = 50;
  // spandrel polygon on a wall plane: from pier to pier along u, the region above the arch curve up to KM_SPAN0
  const kmSpand = fac((g, L, H) => {
    const p = archPts(0, L, 0, KM_SPRING, KM_APEX, 1.35, 6);
    // replace the outline's ground points by the top line -> region between arch curve and v = KM_SPAN0
    const pts = [0, KM_SPAN0, 0, KM_SPRING];
    for (let i = 4; i < p.length - 4; i += 2) pts.push(p[i], p[i + 1]);
    pts.push(L, KM_SPRING, L, KM_SPAN0);
    g.poly('r', pts);
    // archivolt moulding just above the curve
    const q = archPts(-1, L + 1, 0, KM_SPRING, KM_APEX + 1.2, 1.35, 6);
    const band = [];
    for (let i = 2; i < q.length - 2; i += 2) band.push(q[i], q[i + 1]);
    for (let i = p.length - 4; i >= 2; i -= 2) band.push(p[i], p[i + 1]);
    g.poly('l', band);
  });
  function drawKaman(lm) {
    const st = kamanStyles(lm);
    const ew = lm.axis === 'ew'; // arch spans east-west, road passes north-south
    const s0 = lm.solids && lm.solids[0], s1 = lm.solids && lm.solids[1];
    const x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2;
    const pw = 12;
    // piers
    const piers = ew ? [[x0, y0, pw, lm.d], [x0 + lm.w - pw, y0, pw, lm.d]] : [[x0, y0, lm.w, pw], [x0, y0 + lm.d - pw, lm.w, pw]];
    if (s0 && s1) { piers[0] = s0; piers[1] = s1; }
    const pa = piers[0], pb = piers[1];
    const da = camDist2(pa[0] + pa[2] / 2, pa[1] + pa[3] / 2), db = camDist2(pb[0] + pb[2] / 2, pb[1] + pb[3] / 2);
    const far = da > db ? pa : pb, near = da > db ? pb : pa;
    box(far[0], far[1], far[2], far[3], 0, KM_TOP, st.pier);
    // span between the piers
    let sx, sy, sw, sd;
    if (ew) { sx = pa[0] + pa[2]; sw = pb[0] - sx; sy = y0; sd = lm.d; } else { sy = pa[1] + pa[3]; sd = pb[1] - sy; sx = x0; sw = lm.w; }
    // the far spandrel first (dark, it shows as the arch's soffit), then the near one
    const fs = R.faceShade;
    if (ew) {
      const nearN = CAMY < lm.y;
      const fFar = nearN ? 'S' : 'N', fNear = nearN ? 'N' : 'S';
      spandrel(fFar, sx, sy, sw, sd, '#6b5a48', 0.55);
      box(sx, sy, sw, sd, KM_SPAN0, KM_TOP, st.span);
      spandrel(fNear, sx, sy, sw, sd, null, fs[fNear]);
    } else {
      const nearW = CAMX < lm.x;
      const fFar = nearW ? 'E' : 'W', fNear = nearW ? 'W' : 'E';
      spandrel(fFar, sx, sy, sw, sd, '#6b5a48', 0.55);
      box(sx, sy, sw, sd, KM_SPAN0, KM_TOP, st.span);
      spandrel(fNear, sx, sy, sw, sd, null, fs[fNear]);
    }
    parapet(x0 + 0.5, y0 + 0.5, lm.w - 1, lm.d - 1, KM_TOP, 3, st.crest, KM.crest);
    box(near[0], near[1], near[2], near[3], 0, KM_TOP, st.pier);
    // little domed kiosks crowning the piers
    for (const p of [far, near]) {
      const cx = p[0] + p[2] / 2, cy = p[1] + p[3] / 2;
      cyl(cx, cy, 3.4, KM_TOP, KM_TOP + 4.5, '#e6d8b6', LIME_HI);
      kioskArches(cx, cy, 3.4, KM_TOP + 0.8, KM_TOP + 3.8);
      petals(cx, cy, 2.6, 4.2, KM_TOP + 4.6, 8, '#f2e8cc');
      dome(cx, cy, 3.1, KM_TOP + 4.5, KM_TOP + 10, '#efe3c3', true, 2.4);
    }
  }
  // draw the spandrel of the span on one face. col: explicit colour (soffit) or null for the wall colour shaded by f
  function spandrel(face, x, y, w, d, col, f) {
    const fw = faceWall(face, x, y, w, d);
    const g = geomOf(kmSpand, fw.L, KM_SPAN0);
    for (const c of g.order) {
      ctx.beginPath(); pathArr(g.cls[c], fw.ax, fw.ay, fw.ux, fw.uy, 0);
      fill(col ? (c === 'l' ? sh(col, 0.85) : col) : c === 'l' ? sh(LIME_HI, f) : sh('#dccdaa', f));
    }
  }
  function kamanShadow(lm) {
    const D = N.draw;
    if (lm.solids) for (const s of lm.solids) D.castBox(s[0], s[1], s[2], s[3], KM_TOP);
    const ew = lm.axis === 'ew';
    if (ew) D.castBox(lm.x - lm.w / 2 + 12, lm.y - lm.d / 2, lm.w - 24, lm.d, KM_TOP);
    else D.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2 + 12, lm.w, lm.d - 24, KM_TOP);
  }
  function kamanLights(lm) {
    const Ls = lightsOf(lm, 2);
    pushLight(Ls[0], lm.x, lm.y, 20, 64, '#ffcf7a', 0.8, false);
    pushLight(Ls[1], lm.x, lm.y, 46, 54, '#ffe0a0', 0.7, false);
  }
  function kamanNight(lm, a) {
    const fest = festiveNight();
    const x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2;
    bulbRect(x0 + 0.5, y0 + 0.5, lm.w - 1, lm.d - 1, KM_TOP + 3, 3.2, fest ? '#7dff9a' : '#fff1b8', fest ? '#fffbe8' : null);
    // a lantern hanging in the arch
    glow(lm.x, lm.y, 30, 10, '#ffcf70', 0.5 * a);
  }
  L.register('kaman', { draw: drawKaman, shadow: kamanShadow, lights: kamanLights, night: kamanNight });

  /* ---------------------------------------------------------------- Gulzar Houz */
  function drawGulzarHouz(lm) {
    const x = lm.x, y = lm.y;
    const oct = ngon(x, y, 11, 8, Math.PI / 8), oct2 = ngon(x, y, 9.6, 8, Math.PI / 8);
    prism(oct, 0, 2.6, { wall: '#c8b89a', roof: '#e3d6b8' });
    // water surface (slightly below the rim)
    const k = kh(2.2);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const X = sxp(oct2[i][0], k), Y = syp(oct2[i][1], k); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
    ctx.closePath(); fill('#3d8c97');
    // ripples
    ctx.strokeStyle = 'rgba(220,245,250,0.45)'; ctx.lineWidth = Math.max(0.5, 0.5 * k);
    for (let i = 0; i < 2; i++) {
      const rr = ((TIME * 3 + i * 4) % 8) + 3.2;
      ctx.beginPath(); ctx.arc(sxp(x, k), syp(y, k), rr * k, 0, TAU); ctx.stroke();
    }
    // central octagonal pedestal + bowl
    prism(ngon(x, y, 2.6, 8, Math.PI / 8), 0, 6, { wall: '#d9caa6', roof: '#ebe0c6' });
    cyl(x, y, 4.2, 6, 7, '#cbb995', '#9fd0d6');
    cyl(x, y, 1.2, 7, 9.5, '#e0d2b0', '#f0e6cc');
    // spray
    for (let i = 0; i < 10; i++) {
      const t = ((TIME * 0.9 + i / 10) % 1);
      const a = (i / 10) * TAU + 0.3;
      const rr = t * 7, hh = 9.5 + Math.sin(t * Math.PI) * 4 - t * 2;
      const kk = kh(hh);
      ctx.fillStyle = 'rgba(225,245,250,' + (0.85 - t * 0.6).toFixed(2) + ')';
      ctx.fillRect(sxp(x + Math.cos(a) * rr, kk) - 0.5, syp(y + Math.sin(a) * rr, kk) - 0.5, 1.2, 1.2);
    }
  }
  function gulzarGround(g, lm) {
    // star paving around the cistern
    g.fillStyle = 'rgba(120,95,70,0.18)';
    g.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r = i % 2 ? 15 : 20; const X = lm.x + Math.cos(a) * r, Y = lm.y + Math.sin(a) * r; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
    g.closePath(); g.fill();
  }
  L.register('gulzar_houz', {
    draw: drawGulzarHouz, ground: gulzarGround,
    shadow(lm) { N.draw.castCircle(lm.x, lm.y, 11, 2.6); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 4, 46, '#9fe6ff', 0.5); },
  });

  /* ---------------------------------------------------------------- Mecca Masjid */
  const MM = {
    front: fac((g, L, H) => {
      g.rect('g', 0, 0, L, 2);
      const n = 5, m0 = 10, pitch = (L - 2 * m0) / n;
      for (let i = 0; i < n; i++) {
        const u0 = m0 + i * pitch + 2.2, u1 = m0 + (i + 1) * pitch - 2.2;
        g.arch('r', u0 - 1.4, u1 + 1.4, 0, H * 0.5, H * 0.82, 1.45, 6);
        g.arch('d', u0, u1, 0, H * 0.48, H * 0.78, 1.45, 6);
        g.arch('p', u0 + (u1 - u0) * 0.3, u1 - (u1 - u0) * 0.3, 0, H * 0.2, H * 0.34, 1.2, 4);
      }
      g.rect('l', 0, H * 0.88, L, H * 0.91);
      g.arcade('r', 3, L - 3, Math.round(L / 6), H * 0.92, H * 0.95, H * 0.995, 1.6, 1.3);
    }),
    side: fac((g, L, H) => {
      g.rect('g', 0, 0, L, 2);
      g.arcade('r', 6, L - 6, Math.max(2, Math.round(L / 16)), 2, H * 0.45, H * 0.7, 4, 1.4);
      g.arcade('d', 8, L - 8, Math.max(2, Math.round(L / 16)), 4, H * 0.42, H * 0.62, 7, 1.4);
      g.rect('l', 0, H * 0.88, L, H * 0.91);
    }),
    crest: fac((g, L, H) => { g.rect('l', 0, 0, L, 1.2); g.teeth('l', L, 1, H, 2.2, 4.2, false); }),
  };
  function drawMecca(lm) {
    let st = lm._st;
    const face = (lm.face || 'e').toUpperCase();
    if (!st) {
      const facs = { N: MM.side, S: MM.side, E: MM.side, W: MM.side };
      facs[face] = MM.front;
      st = lm._st = {
        plinth: { wall: '#8a847e', roof: '#b9b1a5' },
        hall: {
          wall: GRANITE_DK, roof: '#a9a198', trim: '#b8b0a6', dark: '#2e2a2a', base: '#77716b', pass: '#9a8f80', fac: facs,
          roofFn(c, x, y, w, d) {
            // the prayer hall's roof: 3 x 5 bays of shallow domed vaults between ribs
            const nx = 3, ny = 5, bw = (w - 4) / nx, bd = (d - 4) / ny;
            c.fillStyle = '#9c958c'; c.fillRect(x + 1, y + 1, w - 2, d - 2);
            for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
              const cx = x + 2 + (i + 0.5) * bw, cy = y + 2 + (j + 0.5) * bd, r = Math.min(bw, bd) * 0.36;
              c.fillStyle = '#857e76'; c.beginPath(); c.arc(cx + 0.5, cy + 0.6, r, 0, TAU); c.fill();
              c.fillStyle = '#b3aca2'; c.beginPath(); c.arc(cx, cy, r * 0.92, 0, TAU); c.fill();
              c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.arc(cx - r * 0.25, cy - r * 0.25, r * 0.45, 0, TAU); c.fill();
            }
          },
        },
        crest: { wall: GRANITE_DK, trim: '#a59d94' },
      };
    }
    const x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2;
    box(x0, y0, lm.w, lm.d, 0, 2.2, st.plinth);
    // hall rectangle: leave a verandah strip on the face side
    let hx = x0 + 3, hy = y0 + 5, hw = lm.w - 6, hd = lm.d - 10;
    if (face === 'E') hw -= 12; else if (face === 'W') { hx += 12; hw -= 12; } else if (face === 'S') hd -= 12; else { hy += 12; hd -= 12; }
    const top = 32;
    box(hx, hy, hw, hd, 2.2, top, st.hall);
    parapet(hx, hy, hw, hd, top, 3.2, st.crest, MM.crest);
    // tiny finials along the long edges of the roof
    for (let i = 1; i < 6; i++) { const yy = hy + (i * hd) / 6; disc(hx + 1, yy, 0.8, top + 4.5, '#c7bfb5'); disc(hx + hw - 1, yy, 0.8, top + 4.5, '#c7bfb5'); }
    // massive octagonal columns at the front corners, small turrets at the back
    const fx0 = face === 'E' ? hx + hw : face === 'W' ? hx : null;
    const corners = fx0 != null
      ? [[fx0, hy, 7, true], [fx0, hy + hd, 7, true], [face === 'E' ? hx : hx + hw, hy, 4, false], [face === 'E' ? hx : hx + hw, hy + hd, 4, false]]
      : [[hx, face === 'S' ? hy + hd : hy, 7, true], [hx + hw, face === 'S' ? hy + hd : hy, 7, true], [hx, face === 'S' ? hy : hy + hd, 4, false], [hx + hw, face === 'S' ? hy : hy + hd, 4, false]];
    corners.sort((a, b) => camDist2(b[0], b[1]) - camDist2(a[0], a[1]));
    const vN = CAMY < hy, vS = CAMY > hy + hd, vW = CAMX < hx, vE = CAMX > hx + hw;
    for (const [cx, cy, r, big] of corners) {
      const front = (cx <= hx ? vW : vE) || (cy <= hy ? vN : vS);
      const from = front ? 2.2 : top;
      if (big) {
        prism(ngon(cx, cy, r, 8, Math.PI / 8), from, 42, { wall: '#8c8781', roof: false });
        prism(ngon(cx, cy, r + 1.6, 8, Math.PI / 8), 40, 42.5, { wall: '#7d7873', roof: '#b0a89e' });
        prism(ngon(cx, cy, r - 1.5, 8, Math.PI / 8), 42.5, 47, { wall: '#958f88', roof: '#a7a097' });
        dome(cx, cy, r - 1.6, 47, 54, '#a39b91', false, 2.6, '#b0a080');
      } else {
        cyl(cx, cy, r, from, top + 6, '#8e8984', '#a9a198');
        dome(cx, cy, r - 0.5, top + 6, top + 11, '#a39b91', false, 1.8);
      }
    }
  }
  function meccaShadow(lm) { N.draw.castBox(lm.x - lm.w / 2 + 3, lm.y - lm.d / 2 + 5, lm.w - 6, lm.d - 10, 34); }
  L.register('mecca_masjid', {
    draw: drawMecca, shadow: meccaShadow,
    lights(lm) { const Ls = lightsOf(lm, 2); pushLight(Ls[0], lm.x + lm.w / 2, lm.y, 0, 120, '#ffe2a8', 0.6, false); pushLight(Ls[1], lm.x, lm.y, 30, 90, '#fff0c8', 0.45, false); },
  });

  /* ======================================================================== */
  /*                   SHARED PARTS: chhatris, hips, prism facades            */
  /* ======================================================================== */
  const CORNER4 = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const FACEBIT = { N: 1, S: 2, W: 4, E: 8 };
  const stCache = new Map();
  function plainSt(wall, roof) {
    const key = wall + '|' + (roof || '');
    let s = stCache.get(key);
    if (!s) { s = { wall, roof: roof || undefined }; stCache.set(key, s); }
    return s;
  }
  /** Chhatri: four posts, a slab and a small onion dome. */
  function chhatri(x, y, s, h0, h1, col, dcol) {
    const hs = s / 2, pw = Math.max(0.7, s * 0.15), hp = h0 + (h1 - h0) * 0.46, o = hs - pw * 0.55;
    const pc = sh(col, 0.82);
    for (let i = 0; i < 4; i++) pole(x + CORNER4[i][0] * o, y + CORNER4[i][1] * o, h0, hp, pc, pw);
    box(x - hs - 0.4, y - hs - 0.4, s + 0.8, s + 0.8, hp, hp + 0.9, plainSt(col, sh(col, 1.06)));
    dome(x, y, hs * 0.92, hp + 0.9, h1, dcol || col, true, Math.max(0.8, s * 0.22));
  }
  /** Hip roof over a rect: ridge along the long axis. */
  function hip(x, y, w, d, h0, h1, col) {
    const k0 = kh(h0), k1 = kh(h1), fs = R.faceShade;
    let r0x, r0y, r1x, r1y;
    if (w >= d) { r0x = x + d / 2; r1x = x + w - d / 2; r0y = r1y = y + d / 2; } else { r0y = y + w / 2; r1y = y + d - w / 2; r0x = r1x = x + w / 2; }
    const faces = HIPF;
    // N, S trapezoids / triangles and W, E, ordered far -> near
    faces[0][0] = camDist2(x + w / 2, y); faces[1][0] = camDist2(x + w / 2, y + d); faces[2][0] = camDist2(x, y + d / 2); faces[3][0] = camDist2(x + w, y + d / 2);
    faces.sort((a, b) => b[0] - a[0]);
    for (const f of faces) {
      ctx.beginPath();
      if (f[1] === 'N') { ctx.moveTo(sxp(x, k0), syp(y, k0)); ctx.lineTo(sxp(x + w, k0), syp(y, k0)); ctx.lineTo(sxp(r1x, k1), syp(r1y, k1)); ctx.lineTo(sxp(r0x, k1), syp(r0y, k1)); }
      else if (f[1] === 'S') { ctx.moveTo(sxp(x, k0), syp(y + d, k0)); ctx.lineTo(sxp(x + w, k0), syp(y + d, k0)); ctx.lineTo(sxp(r1x, k1), syp(r1y, k1)); ctx.lineTo(sxp(r0x, k1), syp(r0y, k1)); }
      else if (f[1] === 'W') { ctx.moveTo(sxp(x, k0), syp(y, k0)); ctx.lineTo(sxp(x, k0), syp(y + d, k0)); ctx.lineTo(sxp(r0x, k1), syp(r0y, k1)); }
      else { ctx.moveTo(sxp(x + w, k0), syp(y, k0)); ctx.lineTo(sxp(x + w, k0), syp(y + d, k0)); ctx.lineTo(sxp(r1x, k1), syp(r1y, k1)); }
      ctx.closePath(); fill(sh(col, fs[f[1]] + 0.12));
    }
    // ridge line
    ctx.beginPath(); ctx.moveTo(sxp(r0x, k1), syp(r0y, k1)); ctx.lineTo(sxp(r1x, k1), syp(r1y, k1));
    ctx.strokeStyle = sh(col, 1.15); ctx.lineWidth = Math.max(0.6, 0.6 * k1); ctx.stroke();
  }
  const HIPF = [[0, 'N'], [0, 'S'], [0, 'W'], [0, 'E']];
  /** Facade on an arbitrary wall segment a->b (exact projection). */
  function wallFac(spec, ax, ay, bx, by, h0, h1, st, f) {
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 0.5) return;
    const ux = (bx - ax) / L, uy = (by - ay) / L;
    const dist = Math.abs((CAMX - ax) * -uy + (CAMY - ay) * ux);
    if (dist * Z * (h1 - h0) * P < 2.2) return;
    const g = geomOf(spec, L, h1 - h0);
    for (let i = 0; i < g.order.length; i++) {
      const c = g.order[i], arr = g.cls[c];
      ctx.beginPath(); pathArr(arr, ax, ay, ux, uy, h0); fill(clsColor(st, c, f));
      if (NIGHT > 0.15 && c === 'w' && st.lit !== false) recordLit(arr, ax, ay, ux, uy, h0, st.litCol || '#ffd27a');
    }
  }
  /** A courtyard / light well cut into a roof at height H: the court floor and the inner walls
   *  are drawn clipped to the opening, so it has real depth when the building leans. */
  function courtHole(x, y, w, d, H, st, floorCol, spec) {
    const k1 = kh(H), k0 = kh(0.1), fs = R.faceShade;
    ctx.save();
    ctx.beginPath(); ctx.rect(sxp(x, k1), syp(y, k1), w * k1, d * k1); ctx.clip();
    ctx.fillStyle = floorCol; ctx.fillRect(sxp(x, k0), syp(y, k0), w * k0, d * k0);
    const wall = (ax, ay, bx, by, f) => {
      ctx.beginPath(); mv(ax, ay, 0); ln(bx, by, 0); ln(bx, by, H); ln(ax, ay, H); ctx.closePath();
      fill(sh(st.wall, f * 0.84));
      if (spec) wallFac(spec, ax, ay, bx, by, 0, H, st, f * 0.84);
    };
    if (CAMY > y) wall(x + w, y, x, y, fs.S);
    if (CAMY < y + d) wall(x, y + d, x + w, y + d, fs.N);
    if (CAMX > x) wall(x, y, x, y + d, fs.E);
    if (CAMX < x + w) wall(x + w, y + d, x + w, y, fs.W);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,250,235,0.35)'; ctx.lineWidth = Math.max(0.6, 0.6 * k1);
    ctx.strokeRect(sxp(x, k1), syp(y, k1), w * k1, d * k1);
  }
  /** prism with an optional facade spec on every visible wall (st.fac). */
  function prismF(pts, h0, h1, st) {
    const n = pts.length; if (n < 3) return;
    let sgn = pts._sgn;
    if (!sgn) sgn = pts._sgn = polyArea(pts) > 0 ? 1 : -1;
    const k0 = kh(h0), k1 = kh(h1);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const nx = ey * sgn, ny = -ex * sgn;
      if (nx * (CAMX - a[0]) + ny * (CAMY - a[1]) <= 0) continue;
      let e = wallBuf[m]; if (!e) e = wallBuf[m] = { d: 0, i: 0, f: 0 };
      const mx = (a[0] + b[0]) / 2 - CAMX, my = (a[1] + b[1]) / 2 - CAMY, nl = Math.hypot(nx, ny) || 1;
      e.d = mx * mx + my * my; e.i = i; e.f = R.shadeNormal(nx / nl, ny / nl);
      m++;
    }
    for (let i = 1; i < m; i++) { const e = wallBuf[i]; let j = i - 1; while (j >= 0 && wallBuf[j].d < e.d) { wallBuf[j + 1] = wallBuf[j]; j--; } wallBuf[j + 1] = e; }
    for (let q = 0; q < m; q++) {
      const e = wallBuf[q], a = pts[e.i], b = pts[(e.i + 1) % n];
      ctx.beginPath();
      ctx.moveTo(sxp(a[0], k0), syp(a[1], k0)); ctx.lineTo(sxp(b[0], k0), syp(b[1], k0));
      ctx.lineTo(sxp(b[0], k1), syp(b[1], k1)); ctx.lineTo(sxp(a[0], k1), syp(a[1], k1)); ctx.closePath();
      fill(sh(st.wall, e.f));
      if (st.fac) wallFac(st.fac, a[0], a[1], b[0], b[1], h0, h1, st, e.f);
    }
    if (st.roof !== false) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const X = sxp(pts[i][0], k1), Y = syp(pts[i][1], k1); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
      ctx.closePath(); fill(st.roof || sh(st.wall, 1.07));
      if (st.roofFn) plane(h1, st.roofFn, pts);
    }
  }
  function ngonE(x, y, rx, ry, n, rot) {
    const p = [];
    for (let i = 0; i < n; i++) { const a = (rot || 0) + (i / n) * TAU; p.push([x + Math.cos(a) * rx, y + Math.sin(a) * ry]); }
    return p;
  }
  // a parapet facade: rim + merlons / arched crest / balustrade
  const CREST = {
    merlon: fac((g, L, H) => { g.rect('l', 0, 0, L, H * 0.45); g.teeth('l', L, H * 0.4, H, 2, 4, false); }),
    arch: fac((g, L, H) => { g.rect('l', 0, 0, L, H * 0.45); g.teeth('l', L, H * 0.4, H, 1.6, 3, true); }),
    bal: fac((g, L, H) => { g.rect('l', 0, 0, L, H * 0.3); g.rect('l', 0, H * 0.78, L, H); const n = Math.max(1, Math.floor(L / 1.6)); for (let i = 0; i < n; i++) g.rect('l', (i + 0.3) * (L / n), H * 0.3, (i + 0.7) * (L / n), H * 0.78); }),
    plain: fac((g, L, H) => { g.rect('l', 0, 0, L, H); }),
  };
  function crestSt(c) { return c._crestSt || (c._crestSt = { wall: c.wall, trim: c.crestCol || c.trim || sh(c.wall, 1.1) }); }

  /* ======================================================================== */
  /*                CIVIC / INDO-SARACENIC / COLONIAL BUILDER                  */
  /* ======================================================================== */
  // c: {wall, roof, trim, dark, acc..., floors, h (main height), win: arch|round|rect|col, gf: arcade|col|shops,
  //     pitch, ww, stripes, chajja, inset, front: {...spec overrides for the entrance face},
  //     pav: {w, pro, din, h, low: 'bigarch'|'col'|'porch', pediment, dome: true},
  //     towers: {s, h, cap: dome|chhatri|spire|merlon|pyr, col, capCol, round},
  //     dome: {r, drum, h, col, bulb, at: 'pav'|'centre', finial}, chh: {n, s, h, col, dcol},
  //     crest: merlon|arch|bal|plain, crestH, flag: 'tricolour', hip: colour, sign: {text, bg, fg}}
  function civicSpec(c) {
    return fac((g, L, H) => {
      const fl = c.floors || Math.max(1, Math.round(H / 11)), fh = H / fl;
      if (c.base !== false) g.rect('g', 0, 0, L, Math.min(1.8, fh * 0.15));
      if (c.stripes) for (let v = 2.4; v < H - 1; v += c.stripes * 2) g.rect('a', 0, v, L, Math.min(H - 0.8, v + c.stripes));
      const pitch = c.pitch || 7, ww = c.ww || Math.min(3.2, pitch * 0.45);
      const n = Math.max(1, Math.floor((L - 3) / pitch)), m0 = (L - n * pitch) / 2;
      for (let f = 0; f < fl; f++) {
        const v0 = f * fh;
        const kind = f === 0 && c.gf ? c.gf : c.win || 'arch';
        for (let i = 0; i < n; i++) {
          const u = m0 + (i + 0.5) * pitch;
          if (kind === 'arch' || kind === 'round') g.arch('w', u - ww / 2, u + ww / 2, v0 + fh * 0.2, v0 + fh * 0.55, v0 + fh * 0.8, kind === 'round' ? 1 : 1.45, 4);
          else if (kind === 'rect') g.rect('w', u - ww / 2, v0 + fh * 0.25, u + ww / 2, v0 + fh * 0.75);
          else if (kind === 'arcade') g.arch('d', u - pitch * 0.36, u + pitch * 0.36, v0, v0 + fh * 0.5, v0 + fh * 0.86, 1.4, 5);
          else if (kind === 'col') g.rect('d', u - pitch * 0.3, v0 + 0.6, u + pitch * 0.3, v0 + fh - 1.4);
          else if (kind === 'shops') { g.rect('d', u - pitch * 0.4, v0, u + pitch * 0.4, v0 + fh * 0.74); g.rect(i % 3 === 0 ? 'a' : i % 3 === 1 ? 'b' : 'x', u - pitch * 0.34, v0 + fh * 0.08, u + pitch * 0.34, v0 + fh * 0.42); }
          if (c.chajja && (kind === 'arch' || kind === 'round' || kind === 'rect')) g.rect('s', u - ww / 2 - 0.7, v0 + fh * 0.8, u + ww / 2 + 0.7, v0 + fh * 0.88);
        }
        if (f < fl - 1) g.rect('l', 0, v0 + fh - 0.8, L, v0 + fh);
      }
      g.rect('l', 0, H - 1, L, H);
    });
  }
  const PAV_LOW = {
    bigarch: fac((g, L, H) => { g.rect('g', 0, 0, L, 1.6); g.rect('r', L * 0.14, 0, L * 0.86, H * 0.92); g.arch('d', L * 0.22, L * 0.78, 0, H * 0.45, H * 0.84, 1.45, 6); g.arch('p', L * 0.38, L * 0.62, 0, H * 0.2, H * 0.36, 1.2, 4); g.rect('l', 0, H - 1, L, H); }),
    col: fac((g, L, H) => { const n = Math.max(2, Math.round(L / 4.5)); for (let i = 0; i < n; i++) g.rect('d', (i + 0.28) * (L / n), 0.8, (i + 0.72) * (L / n), H - 2.4); g.rect('l', 0, H - 2.4, L, H); }),
    porch: fac((g, L, H) => { g.arcade('d', 1, L - 1, 3, 0, H * 0.5, H * 0.85, 1.4, 1.4); g.rect('l', 0, H - 1, L, H); }),
  };
  const PAV_UP = fac((g, L, H) => { g.rect('l', 0, 0, L, 0.9); g.arcade('w', 2, L - 2, Math.max(1, Math.round(L / 6)), 1.4, H * 0.5, H * 0.8, 1.6, 1.45); g.rect('l', 0, H - 1, L, H); });
  const TOWER_FAC = fac((g, L, H) => { const fl = Math.max(1, Math.round(H / 9)); for (let f = 0; f < fl; f++) { const v0 = f * (H / fl); g.arch('w', L * 0.3, L * 0.7, v0 + 1.4, v0 + H / fl * 0.5, v0 + H / fl * 0.8, 1.4, 4); g.rect('l', 0, v0 + H / fl - 0.7, L, v0 + H / fl); } });

  function civicRoofFn(c) {
    return (g, x, y, w, d) => {
      // terrace: ambient band under the parapet, a faint flagstone grid, a few vents
      g.fillStyle = 'rgba(60,45,30,0.2)'; g.fillRect(x, y, w, d);
      g.fillStyle = c.roof; g.fillRect(x + 2.4, y + 2.4, w - 4.8, d - 4.8);
      g.strokeStyle = 'rgba(90,70,50,0.07)'; g.lineWidth = 0.4;
      g.beginPath();
      for (let xx = x + 6; xx < x + w - 3; xx += 4) { g.moveTo(xx, y + 3); g.lineTo(xx, y + d - 3); }
      for (let yy = y + 6; yy < y + d - 3; yy += 4) { g.moveTo(x + 3, yy); g.lineTo(x + w - 3, yy); }
      g.stroke();
      g.fillStyle = 'rgba(80,65,50,0.25)';
      const n = Math.max(1, Math.floor(w / 40));
      for (let i = 0; i < n; i++) g.fillRect(x + (i + 0.5) * (w / n) - 1.5, y + d - 6, 3, 2);
      if (c.roofExtra) c.roofExtra(g, x, y, w, d);
    };
  }
  function civicInit(lm, c) {
    const F = (lm.face || 's').toUpperCase();
    const x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2;
    let ins = c.inset == null ? 2 : c.inset;
    if (c.towers) ins = Math.max(ins, c.towers.s / 2);
    const pro = c.pav ? c.pav.pro || 0 : 0;
    let mx = x0 + ins, my = y0 + ins, mw = lm.w - 2 * ins, md = lm.d - 2 * ins;
    if (F === 'N') { my += pro; md -= pro; } else if (F === 'S') md -= pro; else if (F === 'W') { mx += pro; mw -= pro; } else mw -= pro;
    const H = c.h || Math.round(lm.h * 0.62);
    if (!c.roof) c.roof = U.mix(c.wall, '#efe8da', 0.5);
    const spec = civicSpec(c);
    const front = c.front ? civicSpec(Object.assign({}, c, c.front)) : spec;
    const facs = { N: spec, S: spec, E: spec, W: spec }; facs[F] = front;
    const lit = !(lm.gated || c.lit === false);
    const S = {
      F, mx, my, mw, md, H, lit,
      main: { wall: c.wall, roof: c.roof, trim: c.trim, dark: c.dark, acc: c.acc, acc2: c.acc2, acc3: c.acc3, base: c.base || U.shade(c.wall, 0.82), fac: facs, roofFn: c.hip ? null : civicRoofFn(c), lit, litCol: c.litCol },
      items: [],
    };
    if (c.pav) {
      const p = c.pav, pw = p.w, din = p.din == null ? 6 : p.din, ph = p.h || H + 8;
      let outer = null, full;
      if (F === 'N') { outer = [lm.x - pw / 2, my - pro, pw, pro]; full = [lm.x - pw / 2, my - pro, pw, pro + din]; }
      else if (F === 'S') { outer = [lm.x - pw / 2, my + md, pw, pro]; full = [lm.x - pw / 2, my + md - din, pw, pro + din]; }
      else if (F === 'W') { outer = [mx - pro, lm.y - pw / 2, pro, pw]; full = [mx - pro, lm.y - pw / 2, pro + din, pw]; }
      else { outer = [mx + mw, lm.y - pw / 2, pro, pw]; full = [mx + mw - din, lm.y - pw / 2, pro + din, pw]; }
      if (pro <= 0.01) outer = null;
      const pst = { wall: p.col || c.wall, roof: p.roof || c.roof, trim: c.trim, dark: c.dark, acc: c.acc, base: c.base || U.shade(c.wall, 0.82), pass: c.pass, lit, litCol: c.litCol };
      S.pav = {
        outer, full, h: ph, low: Object.assign({}, pst, { fac: PAV_LOW[p.low || 'bigarch'] }), up: Object.assign({}, pst, { fac: PAV_UP }),
        mask: F === 'N' ? 13 : F === 'S' ? 14 : F === 'W' ? 7 : 11, ped: p.pediment, crest: p.crest || c.crest,
      };
      S.items.push({ t: 'pav', x: full[0] + full[2] / 2, y: full[1] + full[3] / 2, d: 0 });
    }
    if (c.towers) {
      const t = c.towers, s = t.s;
      S.tw = { s, h: t.h, cap: t.cap || 'dome', st: { wall: t.col || c.wall, roof: t.roof || c.roof, trim: c.trim, dark: c.dark, fac: t.round ? null : TOWER_FAC, lit, litCol: c.litCol }, capCol: t.capCol || c.trim || c.wall, round: t.round };
      for (let i = 0; i < 4; i++) {
        const cx = CORNER4[i][0] < 0 ? mx : mx + mw, cy = CORNER4[i][1] < 0 ? my : my + md;
        if (t.front && !((F === 'N' && CORNER4[i][1] < 0) || (F === 'S' && CORNER4[i][1] > 0) || (F === 'W' && CORNER4[i][0] < 0) || (F === 'E' && CORNER4[i][0] > 0))) continue;
        S.items.push({ t: 'tower', x: cx, y: cy, mask: (CORNER4[i][0] < 0 ? 4 : 8) | (CORNER4[i][1] < 0 ? 1 : 2), d: 0 });
      }
    }
    if (c.dome) {
      const dm = c.dome;
      const onPav = dm.at === 'pav' && S.pav;
      const cx = onPav ? S.items[0].x : lm.x + (dm.dx || 0), cy = onPav ? S.items[0].y : lm.y + (dm.dy || 0);
      S.items.push({ t: 'dome', x: cx, y: cy, h0: onPav ? S.pav.h : H, d: 0 });
    }
    if (c.chh) {
      const ch = c.chh, n = ch.n || 2;
      const along = F === 'N' || F === 'S';
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        for (const side of [0, 1]) {
          if (ch.front && side === 1) continue;
          let x, y;
          if (along) { x = mx + mw * (0.08 + 0.84 * t); y = (F === 'N') === (side === 0) ? my + ch.s * 0.7 : my + md - ch.s * 0.7; }
          else { y = my + md * (0.08 + 0.84 * t); x = (F === 'W') === (side === 0) ? mx + ch.s * 0.7 : mx + mw - ch.s * 0.7; }
          if (S.pav && Math.abs(x - S.items[0].x) < (c.pav.w / 2 + ch.s) && Math.abs(y - S.items[0].y) < (c.pav.w / 2 + ch.s)) continue;
          S.items.push({ t: 'chh', x, y, d: 0 });
        }
      }
    }
    if (c.flag) {
      const fxp = S.pav ? S.items[0].x : lm.x, fyp = S.pav ? S.items[0].y : lm.y;
      S.flag = { x: fxp, y: fyp };
    }
    // courtyards (light wells) in big blocks, set back from the entrance side
    S.courts = [];
    const longX = mw >= md, long = longX ? mw : md, short = longX ? md : mw;
    const nc = c.courts != null ? c.courts : long > 90 && short > 40 ? Math.max(1, Math.round(long / 85)) : 0;
    for (let i = 0; i < nc; i++) {
      const seg = long / nc, cl = seg * 0.56, cs = short * 0.36;
      const along0 = (longX ? mx : my) + seg * i + (seg - cl) / 2;
      let off = (short - cs) / 2;
      const back = (F === 'N' || F === 'W') ? 1 : -1;
      if ((longX && (F === 'N' || F === 'S')) || (!longX && (F === 'W' || F === 'E'))) off += back * short * 0.08;
      S.courts.push(longX ? [along0, my + off, cl, cs] : [mx + off, along0, cs, cl]);
    }
    S.courtFloor = c.courtFloor || '#7a9a52';
    lm._civ = S;
    return S;
  }
  function drawCivic(lm, c) {
    const S = lm._civ || civicInit(lm, c);
    const H = S.H;
    if (c.before) c.before(lm, S);
    box(S.mx, S.my, S.mw, S.md, 0, H, S.main);
    for (const ct of S.courts) courtHole(ct[0], ct[1], ct[2], ct[3], H, S.main, S.courtFloor, S.main.fac.N);
    if (c.hip) hip(S.mx - 1, S.my - 1, S.mw + 2, S.md + 2, H, H + (c.hipH || Math.min(S.mw, S.md) * 0.3), c.hip);
    else if (c.crest) parapet(S.mx, S.my, S.mw, S.md, H, c.crestH || 2.6, crestSt(c), CREST[c.crest]);
    if (c.mid) c.mid(lm, S);
    const items = S.items;
    for (const it of items) it.d = camDist2(it.x, it.y);
    for (let i = 1; i < items.length; i++) { const e = items[i]; let j = i - 1; while (j >= 0 && items[j].d < e.d) { items[j + 1] = items[j]; j--; } items[j + 1] = e; }
    const vr = R.view;
    for (const it of items) {
      if (it.t !== 'pav' && (it.x < vr.x0 - 14 || it.x > vr.x1 + 14 || it.y < vr.y0 - 14 || it.y > vr.y1 + 14)) continue;
      if (it.t === 'pav') drawPav(S, c);
      else if (it.t === 'tower') drawTower(S, it, c);
      else if (it.t === 'dome') {
        const dm = c.dome, h0 = it.h0;
        if (dm.drum) { cylV(it.x, it.y, dm.r * 0.86, h0, h0 + dm.drum, dm.drumCol || c.trim || c.wall, false); drumWins(it.x, it.y, dm.r * 0.86, h0 + dm.drum * 0.2, h0 + dm.drum * 0.8); }
        const hb = h0 + (dm.drum || 0);
        if (dm.petals !== false) petals(it.x, it.y, dm.r * 0.72, dm.r * 1.02, hb + 0.2, 12, sh(dm.col, 0.94));
        dome(it.x, it.y, dm.r, hb, hb + dm.h, dm.col, dm.bulb, dm.finial || 2.5, dm.finialCol);
      } else if (it.t === 'chh') chhatri(it.x, it.y, c.chh.s, H, H + c.chh.h, c.chh.col || c.trim || c.wall, c.chh.dcol);
    }
    if (S.flag) {
      const fh = (S.pav ? S.pav.h : H) + (c.dome && c.dome.at === 'pav' ? c.dome.h + (c.dome.drum || 0) + 2 : 0);
      if (c.flag === 'tricolour') flag(S.flag.x + (c.flagDx || 0), S.flag.y + (c.flagDy || 0), fh, fh + 12, '#f08a24', 7, 4.5, false, '#ffffff', '#2f8a3a');
      else flag(S.flag.x, S.flag.y, fh, fh + 10, c.flag, 6, 4, true);
    }
    if (c.sign) signBoard(lm, S, c.sign);
    if (c.after) c.after(lm, S);
  }
  function drumWins(x, y, r, h0, h1) {
    const a0 = Math.atan2(CAMY - y, CAMX - x), k0 = kh(h0), k1 = kh(h1);
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      const a = a0 + i * 0.62, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      ctx.moveTo(sxp(px, k0), syp(py, k0)); ctx.lineTo(sxp(px, k1), syp(py, k1));
    }
    ctx.strokeStyle = 'rgba(50,40,40,0.55)'; ctx.lineWidth = Math.max(0.8, r * 0.18 * k0); ctx.stroke();
  }
  function drawPav(S, c) {
    const p = S.pav, H = S.H;
    if (p.outer) box(p.outer[0], p.outer[1], p.outer[2], p.outer[3], 0, H, p.low, p.mask);
    const f = p.full;
    box(f[0], f[1], f[2], f[3], H, p.h, p.up);
    if (p.ped) {
      const axis = S.F === 'N' || S.F === 'S' ? 'y' : 'x';
      gable(f[0] - 0.6, f[1] - 0.6, f[2] + 1.2, f[3] + 1.2, p.h, p.h + Math.min(f[2], f[3]) * 0.32, c.pedCol || c.trim || c.wall, axis);
    } else if (p.crest) parapet(f[0], f[1], f[2], f[3], p.h, 2.4, crestSt(c), CREST[p.crest]);
  }
  function drawTower(S, it, c) {
    const T = S.tw, s = T.s, H = S.H;
    const x = it.x - s / 2, y = it.y - s / 2;
    if (T.round) {
      // round bastion-tower: lower outer half is in front of the walls when its corner faces the camera
      const vis = (it.mask & 1 && CAMY < S.my) || (it.mask & 2 && CAMY > S.my + S.md) || (it.mask & 4 && CAMX < S.mx) || (it.mask & 8 && CAMX > S.mx + S.mw);
      cylV(it.x, it.y, s / 2, vis ? 0 : H, T.h, T.st.wall, T.st.roof || U.shade(T.st.wall, 1.06));
      crenRing(it.x, it.y, s / 2, T.h, T.capCol);
      return;
    }
    box(x, y, s, s, 0, H, T.st, it.mask, true);
    box(x, y, s, s, H, T.h, T.st);
    const cap = T.cap, top = T.h;
    if (cap === 'dome') { petals(it.x, it.y, s * 0.3, s * 0.48, top + 0.2, 8, sh(T.capCol, 0.92)); dome(it.x, it.y, s * 0.42, top, top + s * 0.75, T.capCol, true, 1.6); if (s >= 10) ribs(it.x, it.y, s * 0.42, top, top + s * 0.75, 8); }
    else if (cap === 'chhatri') chhatri(it.x, it.y, s * 0.82, top, top + s * 1.1, T.capCol, T.capCol);
    else if (cap === 'spire') cone(it.x, it.y, s * 0.5, top, top + s * 1.5, T.capCol, 8);
    else if (cap === 'pyr') pyramid(x, y, s, s, top, top + s * 0.7, T.capCol);
    else if (cap === 'merlon') parapet(x, y, s, s, top, 2.2, crestSt(c), CREST.merlon);
  }
  // crenellated ring on top of a round tower
  function crenRing(x, y, r, h, col) {
    const k0 = kh(h), k = kh(h + 1.6);
    ctx.beginPath(); ctx.arc(sxp(x, k0), syp(y, k0), Math.max(0.6, (r - 0.8) * k0), 0, TAU);
    ctx.strokeStyle = 'rgba(40,30,20,0.35)'; ctx.lineWidth = Math.max(1, 1.2 * k0); ctx.stroke();
    ctx.beginPath(); ctx.arc(sxp(x, k), syp(y, k), Math.max(0.6, (r - 0.6) * k), 0, TAU);
    ctx.setLineDash([2.2 * k, 1.6 * k]); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, 1.7 * k); ctx.stroke(); ctx.setLineDash([]);
  }
  // Indian Railways-style yellow name board (or any sign) above the entrance
  function signBoard(lm, S, sg) {
    const F = S.F, h = (S.pav ? S.pav.h : S.H) + (sg.dh || 0);
    let x = lm.x, y = lm.y;
    const f = S.pav ? S.pav.full : [S.mx, S.my, S.mw, S.md];
    if (F === 'N') y = f[1]; else if (F === 'S') y = f[1] + f[3]; else if (F === 'W') x = f[0]; else x = f[0] + f[2];
    if (!visibleFace(F, f[0], f[1], f[2], f[3]) && !sg.always) return;
    const k = kh(h - 2.5), X = Math.round(sxp(x, k)), Y = Math.round(syp(y, k));
    const tw = N.draw.pixelTextWidth(sg.text);
    const vert = F === 'W' || F === 'E';
    ctx.fillStyle = sg.edge || '#1a1a1a';
    if (vert) ctx.fillRect(X - 5, Y - tw / 2 - 3, 10, tw + 6); else ctx.fillRect(X - tw / 2 - 3, Y - 5, tw + 6, 10);
    ctx.fillStyle = sg.bg || '#f2c230';
    if (vert) ctx.fillRect(X - 4, Y - tw / 2 - 2, 8, tw + 4); else ctx.fillRect(X - tw / 2 - 2, Y - 4, tw + 4, 8);
    N.draw.pixelText(x, y, h - 2.5, sg.text, sg.fg || '#1a1a1a', vert ? { rot: F === 'E' ? -1 : 1 } : null);
  }
  function civicShadow(lm, c) {
    const S = lm._civ;
    const D = N.draw;
    if (!S) { D.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, lm.h * 0.6); return; }
    D.castBox(S.mx, S.my, S.mw, S.md, S.H + 2);
    if (S.pav) { const f = S.pav.full; D.castBox(f[0], f[1], f[2], f[3], S.pav.h); }
    for (const it of S.items) {
      if (it.t === 'tower') D.castBox(it.x - S.tw.s / 2, it.y - S.tw.s / 2, S.tw.s, S.tw.s, S.tw.h + S.tw.s * 0.6);
      else if (it.t === 'dome') D.castCircle(it.x, it.y, c.dome.r, it.h0 + (c.dome.drum || 0) + c.dome.h * 0.6);
    }
  }
  function civicLights(lm, c) {
    const S = lm._civ;
    if (!S || !S.lit || c.flood === false) return;
    const Ls = lightsOf(lm, 2);
    const r = Math.max(lm.w, lm.d) * 0.75 + 30;
    pushLight(Ls[0], lm.x, lm.y, 0, r, c.floodCol || '#ffe6b0', 0.55, false);
    pushLight(Ls[1], lm.x, lm.y, S.H, r * 0.8, c.floodCol || '#ffe6b0', 0.45, false);
  }
  function civicReg(draw, c, ids) {
    // c may be a function(lm) -> cfg (variants by id)
    const cfg = typeof c === 'function' ? c : () => c;
    const get = (lm) => lm._cfg || (lm._cfg = cfg(lm));
    L.register(draw, {
      draw(lm) { drawCivic(lm, get(lm)); },
      shadow(lm) { civicShadow(lm, get(lm)); },
      lights(lm) { civicLights(lm, get(lm)); },
      night(lm, a) { const cc = get(lm); if (cc.night) cc.night(lm, a, lm._civ); },
      ground(g, lm) { const cc = get(lm); if (cc.ground) cc.ground(g, lm); },
    });
  }

  /* ---------------------------------------------------- Public Gardens group */
  civicReg('assembly', {
    wall: '#f4f1ea', roof: '#ebe6dc', trim: '#ffffff', dark: '#4a4b53', base: '#cbc4b8', floors: 2, h: 22, win: 'arch', gf: 'arcade', pitch: 6.4, inset: 4,
    pav: { w: 22, pro: 6, h: 28, low: 'porch', crest: 'arch' },
    towers: { s: 7, h: 29, cap: 'chhatri', capCol: '#f8f6f0' },
    dome: { r: 11, drum: 4, h: 13, col: '#f7f4ee', bulb: true, at: 'centre', finial: 3.5, dx: -4 },
    chh: { n: 2, s: 4.6, h: 7, col: '#f4f1ea' }, crest: 'arch', flag: 'tricolour', flagDx: -4,
    night(lm, a, S) { if (!S) return; bulbRect(S.mx, S.my, S.mw, S.md, S.H + 2.6, 3.4, '#fff2c0'); bulbRing(lm.x - 4, lm.y, 9.5, S.H + 4.2, 16, '#fff2c0'); },
  });
  civicReg('jubilee_hall', {
    wall: '#efe4cc', trim: '#fbf6ea', dark: '#4a4038', floors: 1, h: 13, win: 'arch', pitch: 6, inset: 3,
    towers: { s: 5, h: 16, cap: 'dome', capCol: '#f4ecd8' },
    dome: { r: 7, drum: 3, h: 8, col: '#f3ecda', bulb: true, at: 'centre', finial: 2 }, crest: 'arch',
  });
  civicReg('museum', {
    wall: '#e1bf7c', trim: '#f6ecd6', dark: '#4a3a2c', floors: 2, h: 15, win: 'arch', pitch: 6, inset: 3,
    pav: { w: 16, pro: 5, h: 20, low: 'bigarch' },
    towers: { s: 5, h: 20, cap: 'dome', capCol: '#f4e9d0' },
    dome: { r: 6.5, drum: 2.5, h: 8, col: '#f4ead2', bulb: true, at: 'pav', finial: 2.4 }, crest: 'arch',
  });
  civicReg('nizam_college', {
    wall: '#a99c92', trim: '#d9cfc4', dark: '#352e2d', base: '#8a7f78', floors: 2, h: 18, win: 'arch', pitch: 6.5, chajja: true, inset: 4,
    pav: { w: 20, pro: 5, h: 26, low: 'bigarch' },
    towers: { s: 7, h: 23, cap: 'dome', capCol: '#c4b8ad' },
    dome: { r: 6, drum: 3, h: 7.5, col: '#bfb2a6', bulb: true, at: 'pav' }, crest: 'merlon',
  });
  civicReg('secretariat', {
    wall: '#e8dcc0', trim: '#f6efe0', dark: '#3f3a36', floors: 3, h: 22, win: 'rect', pitch: 5.5, ww: 2.6, chajja: true, inset: 3,
    pav: { w: 26, pro: 6, h: 28, low: 'col', crest: 'bal' }, crest: 'bal', flag: 'tricolour',
  });
  civicReg('raj_bhavan', {
    wall: '#f4f2ec', trim: '#ffffff', dark: '#47464a', floors: 2, h: 16, win: 'rect', gf: 'col', pitch: 6, inset: 4,
    pav: { w: 18, pro: 6, h: 20, low: 'col', pediment: true }, crest: 'bal', flag: 'tricolour',
    ground(g, lm) { lawn(g, lm.x, lm.y, lm.w + 30, lm.d + 26); },
  });
  civicReg('british_residency', {
    wall: '#e2bf72', trim: '#f7f0de', dark: '#4a3a2a', floors: 2, h: 20, win: 'rect', pitch: 6, ww: 2.6, inset: 3,
    pav: { w: 34, pro: 10, h: 22, low: 'col', pediment: true, col: '#f4ecd8' }, pedCol: '#f2e9d2', crest: 'bal',
    ground(g, lm) { lawn(g, lm.x, lm.y, lm.w + 28, lm.d + 30); },
  });
  // a lawn rectangle with a border (ground art)
  function lawn(g, x, y, w, d) {
    g.fillStyle = 'rgba(90,140,60,0.35)'; g.fillRect(x - w / 2, y - d / 2, w, d);
    g.strokeStyle = 'rgba(60,100,40,0.35)'; g.lineWidth = 1; g.strokeRect(x - w / 2 + 2, y - d / 2 + 2, w - 4, d - 4);
  }

  /* ---------------------------------------------------- the Musi civic quartet */
  civicReg('high_court', {
    wall: '#c8775e', trim: '#f2e6d6', acc: '#f2e6d6', dark: '#3a2a26', base: '#9c5c48', stripes: 1.1, floors: 2, h: 22, win: 'arch', pitch: 6.6, inset: 4,
    pav: { w: 34, pro: 6, h: 30, low: 'bigarch', crest: 'arch' },
    towers: { s: 8, h: 28, cap: 'dome', capCol: '#f0e4d4' },
    dome: { r: 10, drum: 3.5, h: 12, col: '#f0e5d6', bulb: true, at: 'pav', finial: 3 },
    chh: { n: 3, s: 4.6, h: 7.5, col: '#f0e4d4', dcol: '#f4ebdf' }, crest: 'arch',
  });
  civicReg('osmania_hospital', {
    wall: '#a39c93', trim: '#cec7bd', dark: '#34302f', base: '#857e76', floors: 3, h: 24, win: 'arch', pitch: 6.2, chajja: true, inset: 4,
    pav: { w: 36, pro: 6, h: 32, low: 'bigarch', crest: 'merlon' },
    towers: { s: 9, h: 30, cap: 'dome', capCol: '#bbb3a9' },
    dome: { r: 12, drum: 4, h: 13, col: '#cdc6bb', bulb: true, at: 'pav', finial: 3 },
    chh: { n: 4, s: 4.6, h: 7, col: '#c4bdb3' }, crest: 'merlon',
  });
  civicReg('state_central_library', {
    wall: '#dcc596', trim: '#f4ead4', dark: '#3e3428', floors: 2, h: 18, win: 'round', pitch: 6.4, inset: 3,
    pav: { w: 26, pro: 6, h: 26, low: 'bigarch', crest: 'bal' },
    towers: { s: 6, h: 22, cap: 'chhatri', capCol: '#efe4cb' },
    dome: { r: 7, drum: 3, h: 8, col: '#efe3c6', bulb: true, at: 'pav' }, crest: 'bal',
  });
  civicReg('salar_jung_museum', {
    wall: '#eee1c0', trim: '#fffaf0', dark: '#3f3a34', floors: 2, h: 18, win: 'rect', gf: 'col', pitch: 6, ww: 2.8, inset: 3,
    pav: { w: 40, pro: 8, h: 24, low: 'col', crest: 'bal' },
    dome: { r: 8, drum: 3, h: 7, col: '#f2ead6', at: 'pav', finial: 2 }, crest: 'bal',
    sign: { text: 'SALAR JUNG MUSEUM', bg: '#7a2a2a', fg: '#f6e7c4', edge: '#3a1a1a' },
  });
  civicReg('ou_arts_college', {
    wall: '#a8928a', trim: '#cbb9af', dark: '#2f2726', base: '#86726b', floors: 2, h: 24, win: 'rect', gf: 'col', pitch: 6.5, ww: 2.6, inset: 4,
    pav: { w: 40, pro: 8, h: 38, low: 'bigarch', crest: 'merlon' },
    towers: { s: 9, h: 30, cap: 'chhatri', capCol: '#bba89f' },
    chh: { n: 3, s: 5, h: 8, col: '#b4a197' }, crest: 'merlon',
    ground(g, lm) { lawn(g, lm.x, lm.y + lm.d / 2 + 18, lm.w * 0.8, 26); },
  });

  /* ---------------------------------------------------- Old City blocks */
  civicReg('madina_building', {
    wall: '#ece5d2', trim: '#ffffff', acc: '#d8402a', acc2: '#2a8c82', acc3: '#f2c230', dark: '#3a302a', floors: 3, h: 24, win: 'arch', gf: 'shops', pitch: 6, inset: 2,
    chh: { n: 2, s: 4, h: 6, col: '#ece5d2', dcol: '#e8dfca' }, crest: 'arch',
    sign: { text: 'MADINA', bg: '#2a6a3a', fg: '#f6efe0', edge: '#1a3a22', dh: -8 },
  });
  civicReg('pathergatti_arcade', {
    wall: '#b9a59f', trim: '#d9ccc5', acc: '#c03a8a', acc2: '#e8b830', acc3: '#3a8ad8', dark: '#3a2f2c', floors: 2, h: 20, win: 'arch', gf: 'shops', pitch: 5.5, inset: 1,
    chh: { n: 2, s: 3.6, h: 5.5, col: '#cbbcb5' }, crest: 'arch',
  });
  civicReg('purani_haveli', {
    wall: '#e8d39a', trim: '#fbf3df', dark: '#4a3a2a', floors: 2, h: 18, win: 'rect', gf: 'col', pitch: 6, inset: 2,
    crest: 'bal', lit: true,
    // a U-shaped palace: draw the courtyard lawn over the middle of the roof as an open court
    mid(lm, S) {
      const F = S.F, cw = 0.42, k = kh(S.H);
      // open courtyard facing the entrance side
      let cx = S.mx + S.mw * (0.5 - cw / 2), cy = S.my + S.md * 0.18, w = S.mw * cw, d = S.md * 0.64;
      if (F === 'W' || F === 'E') { cx = F === 'W' ? S.mx : S.mx + S.mw * 0.42; cy = S.my + S.md * 0.25; w = S.mw * 0.58; d = S.md * 0.5; }
      ctx.fillStyle = '#5f8a42'; ctx.fillRect(sxp(cx, k), syp(cy, k), w * k, d * k);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(sxp(cx + 2, k), syp(cy + d / 2 - 1, k), (w - 4) * k, 2 * k);
    },
  });

  /* ---------------------------------------------------- palaces */
  civicReg('palace', (lm) => {
    switch (lm.id) {
      case 'hill_fort_palace': return { wall: '#e8dcc2', trim: '#fbf3df', dark: '#3d3530', floors: 2, h: 18, win: 'arch', inset: 6, towers: { s: 11, h: 26, round: true, capCol: '#f2e9d2' }, crest: 'merlon', lit: false };
      case 'king_kothi': return { wall: '#ead197', trim: '#fbf3df', dark: '#4a3a2a', floors: 2, h: 17, win: 'rect', gf: 'col', inset: 4, pav: { w: 18, pro: 5, h: 21, low: 'col', pediment: true }, crest: 'bal', lit: false };
      case 'errum_manzil': return { wall: '#e6b29a', trim: '#fdf2e8', dark: '#4a332c', floors: 2, h: 20, win: 'round', gf: 'col', inset: 4, pav: { w: 20, pro: 6, h: 26, low: 'bigarch' }, dome: { r: 6, drum: 2, h: 7, col: '#f6e8de', at: 'pav' }, towers: { s: 6, h: 24, cap: 'dome', capCol: '#f6e8de' }, crest: 'bal', lit: false };
      case 'rashtrapati_nilayam': return { wall: '#f4f1ea', trim: '#ffffff', dark: '#4a4848', floors: 1, h: 11, win: 'rect', gf: 'col', inset: 8, hip: '#a8543a', hipH: 9, flag: 'tricolour', lit: false, ground(g, l) { lawn(g, l.x, l.y, l.w, l.d); } };
      default: return { wall: '#efe4cc', trim: '#fbf6ea', dark: '#4a4038', floors: 2, h: 15, win: 'arch', inset: 4, towers: { s: 6, h: 19, cap: 'dome', capCol: '#f4ecd8' }, crest: 'bal', lit: false };
    }
  });

  /* ---------------------------------------------------- Gun Park memorial */
  L.register('gun_park', {
    draw(lm) {
      const x = lm.x, y = lm.y;
      box(x - 7, y - 7, 14, 14, 0, 1.4, plainSt('#b9ad9c', '#cfc4b2'));
      box(x - 5.5, y - 5.5, 11, 11, 1.4, 2.8, plainSt('#c4b8a8', '#d8cebe'));
      box(x - 4, y - 4, 8, 8, 2.8, 4.4, plainSt('#cfc4b4', '#e2d9cb'));
      prism(ngon(x, y, 2.9, 8, Math.PI / 8), 4.4, 20, { wall: '#d8cfc2', roof: '#e8e1d6' });
      petals(x, y, 2.4, 4.1, 20.4, 10, '#e9e2d6');
      cylV(x, y, 2.2, 20.4, 22.5, '#e4dccf', '#efe9df');
      // the wheel emblem on top
      ring(x, y, 2.4, 23.4, '#7a6a52', 0.5);
      disc(x, y, 0.8, 24.2, '#c9a227');
      // marigold wreaths at the foot
      for (const [dx, dy] of [[-6, 5.8], [6, 5.8]]) ring(x + dx * 0.6, y + dy, 1.6, 1.6, '#f08a24', 0.9);
    },
    shadow(lm) { N.draw.castPole(lm.x, lm.y, 24, 5); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 10, 34, '#fff0c8', 0.6, false); },
  });
  /* ---------------------------------------------------- statues */
  const BRONZE = '#6f5536', BRONZE_G = '#5f7258';
  function figure(x, y, h0, s, col, ang, kind) {
    // a standing bronze figure seen from above-ish: legs/robe, torso, shoulders, head + an attribute
    const fx = Math.cos(ang), fy = Math.sin(ang);
    cylV(x, y, 1.5 * s, h0, h0 + 5 * s, col, false);           // robe / legs
    cylV(x, y, 1.35 * s, h0 + 5 * s, h0 + 8.4 * s, col, false);  // torso
    prism(ngonE(x, y, Math.abs(fy) * 1.1 * s + 1.0 * s, Math.abs(fx) * 1.1 * s + 1.0 * s, 8), h0 + 8.4 * s, h0 + 9.4 * s, { wall: col, roof: sh(col, 1.12) }); // shoulders
    if (kind === 1) { pole(x - fy * 1.6 * s, y + fx * 1.6 * s, h0 + 8.5 * s, h0 + 13 * s, sh(col, 0.9), 0.9 * s); disc(x - fy * 1.6 * s, y + fx * 1.6 * s, 0.55 * s, h0 + 13.2 * s, sh(col, 1.1)); } // raised arm
    if (kind === 2) box(x + fx * 1.3 * s - 0.7 * s, y + fy * 1.3 * s - 0.6 * s, 1.4 * s, 1.2 * s, h0 + 6 * s, h0 + 7 * s, plainSt('#e9e2d0', '#f2ecdc')); // book
    if (kind === 3) pole(x + fy * 1.8 * s, y - fx * 1.8 * s, h0, h0 + 11 * s, '#4a3a2a', 0.5 * s); // staff
    dome(x, y, 0.95 * s, h0 + 9.4 * s, h0 + 11.4 * s, sh(col, 1.08), false);
    if (kind === 0) dome(x, y, 1.05 * s, h0 + 10.9 * s, h0 + 12 * s, '#d9c08a', false); // turban
  }
  L.register('tank_bund_statue', {
    draw(lm) {
      const x = lm.x, y = lm.y, idx = lm.idx || 0, ang = lm.faceAngle || 0;
      const col = idx % 3 === 1 ? BRONZE_G : BRONZE;
      box(x - 3.6, y - 3.6, 7.2, 7.2, 0, 1.2, plainSt('#9d968c', '#b3aca2'));
      box(x - 2.8, y - 2.8, 5.6, 5.6, 1.2, 13.2, lm._st || (lm._st = { wall: '#a8a096', roof: '#c2bbb1', trim: '#c9a227', fac: TB_PLINTH }));
      box(x - 3.3, y - 3.3, 6.6, 6.6, 13.2, 14.4, plainSt('#b6aea4', '#cdc6bc'));
      figure(x, y, 14.4, 1.18, col, ang, idx % 4);
      // ornamental lamp post beside the statue (along the bund)
      const lx = x - Math.sin(ang) * 9, ly = y + Math.cos(ang) * 9;
      tbLamp(lx, ly);
    },
    shadow(lm) { N.draw.castBox(lm.x - 2.8, lm.y - 2.8, 5.6, 5.6, 14); N.draw.castPole(lm.x, lm.y, 28, 3); },
    lights(lm) {
      const Ls = lightsOf(lm, 2), ang = lm.faceAngle || 0;
      pushLight(Ls[0], lm.x, lm.y, 18, 22, '#ffe7b0', 0.7, false);
      pushLight(Ls[1], lm.x - Math.sin(ang) * 9, lm.y + Math.cos(ang) * 9, 18, 40, '#fff2d0', 0.85, true);
    },
    night(lm, a) { const ang = lm.faceAngle || 0; const lx = lm.x - Math.sin(ang) * 9, ly = lm.y + Math.cos(ang) * 9; for (const o of [-1.6, 0, 1.6]) disc(lx + o * Math.cos(ang), ly + o * Math.sin(ang), 0.9, 18.6, 'rgba(255,248,220,' + a.toFixed(2) + ')'); },
  });
  const TB_PLINTH = fac((g, L, H) => { g.rect('l', 0, H - 1.2, L, H); g.rect('k', L * 0.2, H * 0.55, L * 0.8, H * 0.75); g.rect('s', 0, 1.2, L, 1.8); });
  function tbLamp(x, y) {
    pole(x, y, 0, 18, '#2e4436', 1.1);
    disc(x, y, 1.6, 18, '#2e4436');
    disc(x - 1.6, y, 0.85, 18.6, '#f3efe2'); disc(x + 1.6, y, 0.85, 18.6, '#f3efe2'); disc(x, y, 0.95, 19.4, '#f8f4e8');
  }
  L.register('statue', {
    draw(lm) {
      const x = lm.x, y = lm.y;
      box(x - 4, y - 4, 8, 8, 0, 1.2, plainSt('#b8b0a4', '#cec7bb'));
      box(x - 3, y - 3, 6, 6, 1.2, 8, plainSt('#8e8780', '#a59e96'));
      // seated Gandhi: folded legs, torso, bald head; a marigold garland
      prism(ngonE(x, y + 0.4, 2.4, 1.8, 8), 8, 9.4, { wall: BRONZE, roof: sh(BRONZE, 1.1) });
      cylV(x, y - 0.3, 1.25, 9.4, 12.4, BRONZE, false);
      dome(x, y - 0.3, 0.95, 12.4, 14.3, sh(BRONZE, 1.08), false);
      ring(x, y - 0.3, 1.3, 11.6, '#f08a24', 0.7);
    },
    shadow(lm) { N.draw.castBox(lm.x - 3, lm.y - 3, 6, 6, 12); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 8, 22, '#fff0c8', 0.6, false); },
  });

  /* ======================================================================== */
  /*                          NAUBAT PAHAD & THE LAKE                          */
  /* ======================================================================== */
  const MARBLE = '#f3f0e9', MARBLE_SH = '#e2ddd2';
  // curvilinear temple tower (rekha deul): cross-plan slices shrinking with a curve
  function shikhara(x, y, s, h0, h1, col, n, kal) {
    n = n || 7;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const w = s * (1 - 0.62 * Math.pow(t0, 1.6)), w2 = w * 0.62;
      const ha = h0 + (h1 - h0) * t0, hb = h0 + (h1 - h0) * t1;
      const c = i % 2 ? col : sh(col, 0.95);
      const st = plainSt(c, sh(c, 1.04));
      box(x - w / 2, y - w2 / 2, w, w2, ha, hb, st);
      box(x - w2 / 2, y - w / 2, w2, w, ha, hb, st, 3);
      // a moulding line at the top of each course
      const k = kh(hb);
      ctx.strokeStyle = sh(col, 0.8); ctx.lineWidth = Math.max(0.5, 0.4 * k);
      ctx.strokeRect(sxp(x - w / 2, k), syp(y - w2 / 2, k), w * k, w2 * k);
    }
    const top = h1, ar = s * 0.3;
    cylV(x, y, ar, top, top + 1.6, sh(col, 0.92), sh(col, 1.05));      // amalaka
    ring(x, y, ar * 0.98, top + 0.8, sh(col, 0.7), 0.4);
    if (kal !== false) { dome(x, y, Math.min(1.7, ar * 0.42), top + 1.6, top + 4.6, '#d9a82a', true, 1.8, '#e8c040'); }
  }
  // a stepped mandapa roof: tiers of small domes/pyramids
  function mandapaRoof(x, y, w, d, h0, col, tiers) {
    for (let i = 0; i < tiers; i++) {
      const f = 1 - i * 0.24, hh = h0 + i * 2.4;
      box(x - (w * f) / 2, y - (d * f) / 2, w * f, d * f, hh, hh + 2.4, plainSt(i % 2 ? col : sh(col, 0.95), sh(col, 1.03)));
    }
    dome(x, y, Math.min(w, d) * 0.18, h0 + tiers * 2.4, h0 + tiers * 2.4 + 3, col, false, 1.4, '#d9a82a');
  }
  const BIRLA_ROCK = [];
  const BIRLA_TERR = { wall: MARBLE_SH, roof: '#d9d4ca', roofFn(g, x, y, w, d) {
    g.fillStyle = '#e4dfd5'; g.fillRect(x + 1.5, y + 1.5, w - 3, d - 3);
    g.fillStyle = '#cfc9bd';
    for (let i = 0; i < w; i += 6) for (let j = 0; j < d; j += 6) if (((i + j) / 6) % 2 === 0) g.fillRect(x + i + 1.5, y + j + 1.5, 3, 3);
    g.strokeStyle = 'rgba(200,170,90,0.6)'; g.lineWidth = 0.6; g.strokeRect(x + 3, y + 3, w - 6, d - 6);
  } };
  L.register('birla_mandir', {
    init(lm) {
      const x = lm.x, y = lm.y;
      for (const [dx, dy] of [[-31, -20], [-24, -27], [0, -28], [22, -27], [31, -18], [32, 6], [30, 25], [12, 28], [-14, 28], [-30, 24], [-32, 2]]) BIRLA_ROCK.push([x + dx, y + dy]);
      lm._mand = { wall: MARBLE, roof: '#f6f4ee', trim: '#ffffff', dark: '#6a6258', fac: fac((g, L, H) => { const n = Math.max(2, Math.round(L / 3.6)); for (let i = 0; i < n; i++) g.rect('d', (i + 0.3) * (L / n), 0.6, (i + 0.7) * (L / n), H - 1.6); g.rect('l', 0, H - 1.6, L, H); }) };
    },
    draw(lm) {
      const x = lm.x, y = lm.y;
      // the Naubat Pahad rock and the white marble terrace on it
      prism(BIRLA_ROCK, 0, 9, { wall: '#9a8977', roof: '#a8977f' });
      for (const [dx, dy, r] of [[-27, 21, 5], [28, -21, 4.5], [25, 23, 4]]) dome(x + dx, y + dy, r, 8, 12, '#a39280', false);
      box(x - 28, y - 25, 56, 50, 9, 11.6, plainSt('#e6e1d6', '#f1eee7'));
      box(x - 26, y - 23, 52, 46, 11.6, 12.6, BIRLA_TERR);
      const F = (lm.face || 's') === 's' ? 1 : -1;
      const parts = BIRLA_PARTS;
      for (const p of parts) p.d = camDist2(x + p.dx, y + p.dy * F);
      parts.sort((a, b) => b.d - a.d);
      for (const p of parts) {
        const px = x + p.dx, py = y + p.dy * F;
        if (p.t === 'main') {
          box(px - 10, py - 10, 20, 20, 12.6, 21, plainSt(MARBLE, '#f7f5f0'));
          shikhara(px, py, 19, 21, 54, MARBLE, 9);
          flag(px, py, 58, 64, '#f08a24', 5, 3.5, true);
        } else if (p.t === 'side') {
          box(px - 5.5, py - 5.5, 11, 11, 12.6, 17, plainSt(MARBLE, '#f7f5f0'));
          shikhara(px, py, 10, 17, 33, MARBLE, 6);
        } else if (p.t === 'gop') {
          gopuram(px, py, 22, 10, 12.6, 38, true, BIRLA_GOP, 5, '#f3f0e8');
        } else {
          box(px - 13, py - 7, 26, 14, 12.6, 20, lm._mand);
          mandapaRoof(px, py, 26, 14, 20, MARBLE, 3);
        }
      }
    },
    shadow(lm) { const D = N.draw; D.castBox(lm.x - 28, lm.y - 25, 56, 50, 12); D.castBox(lm.x - 9, lm.y - 19, 18, 18, 50); D.castBox(lm.x - 9, lm.y + 11, 18, 10, 34); },
    lights(lm) {
      const Ls = lightsOf(lm, 2);
      pushLight(Ls[0], lm.x, lm.y, 12, 80, '#fff6e6', 0.85, false);
      pushLight(Ls[1], lm.x, lm.y - 8, 40, 56, '#fffaf0', 0.85, false);
    },
    night(lm, a) {
      // the temple glows white on its hill: a soft bloom + warm lamps along the terrace
      glow(lm.x, lm.y - 6, 36, 46, '#fff0d0', 0.16 * a);
      bulbRect(lm.x - 26, lm.y - 23, 52, 46, 12.8, 3.5, '#fff1c8');
    },
    ground(g, lm) {
      // stairs climbing the rock from the south (Saifabad Road side)
      const x = lm.x + 8, y0 = lm.y + 26;
      g.fillStyle = '#d9d2c4'; g.fillRect(x - 6, y0, 12, 36);
      g.strokeStyle = 'rgba(90,80,70,0.45)'; g.lineWidth = 0.6;
      g.beginPath(); for (let yy = y0 + 1.5; yy < y0 + 36; yy += 2.2) { g.moveTo(x - 6, yy); g.lineTo(x + 6, yy); } g.stroke();
      g.fillStyle = '#b8b0a2'; g.fillRect(x - 7, y0, 1, 36); g.fillRect(x + 6, y0, 1, 36);
    },
  });
  const BIRLA_PARTS = [{ t: 'main', dx: 0, dy: -10, d: 0 }, { t: 'side', dx: -18, dy: -12, d: 0 }, { t: 'side', dx: 18, dy: -12, d: 0 }, { t: 'mand', dx: 0, dy: 4, d: 0 }, { t: 'gop', dx: 0, dy: 16, d: 0 }];
  const BIRLA_GOP = ['#f7f5f0', '#efebe3', '#f7f5f0', '#ece8df', '#f7f5f0'];

  L.register('birla_planetarium', {
    draw(lm) {
      const x = lm.x, y = lm.y;
      let st = lm._st;
      if (!st) st = lm._st = { wall: '#ecebe6', roof: '#e2e0da', trim: '#ffffff', dark: '#47494f', fac: fac((g, L, H) => { g.rect('g', 0, 0, L, 1.2); g.wins('w', 2, L - 2, Math.max(1, Math.round(L / 6)), H * 0.3, H * 0.75, 3.4); g.rect('l', 0, H - 1, L, H); }) };
      box(x - 28, y + 4, 56, 24, 0, 12, st);                       // science museum block
      cylV(x, y - 6, 21, 0, 15, '#e9e8e3', false);                 // drum
      ring(x, y - 6, 21, 15, '#c9c7c0', 0.8);
      dome(x, y - 6, 21, 15, 34, '#f5f5f2', false, 1.5, '#bdbab2');
    },
    shadow(lm) { N.draw.castCircle(lm.x, lm.y - 6, 21, 26); N.draw.castBox(lm.x - 28, lm.y + 4, 56, 24, 12); },
    lights(lm) { const Ls = lightsOf(lm, 1); pushLight(Ls[0], lm.x, lm.y - 6, 20, 60, '#e8f0ff', 0.7, false); },
    night(lm, a) { glow(lm.x, lm.y - 6, 30, 34, '#b8d4ff', 0.25 * a); },
  });

  L.register('buddha_statue', {
    floor(lm) {
      // the Gibraltar Rock island: rocky rim + paved platform (drawn per frame so chunk edges never cut it)
      const x = lm.x, y = lm.y, k = kh(0);
      ctx.beginPath();
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU, r = (lm.island || 34) - 2 + Math.sin(i * 2.3) * 2.5;
        const X = sxp(x + Math.cos(a) * r, k), Y = syp(y + Math.sin(a) * r * 0.92, k);
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
      ctx.closePath(); fill('#8d8478');
      ctx.beginPath(); ctx.arc(sxp(x, k), syp(y, k), 18 * k, 0, TAU); fill('#c9c3b8');
      ctx.strokeStyle = 'rgba(80,70,60,0.35)'; ctx.lineWidth = Math.max(0.5, 0.5 * k);
      ctx.beginPath(); ctx.arc(sxp(x, k), syp(y, k), 14 * k, 0, TAU); ctx.stroke();
    },
    draw(lm) {
      const x = lm.x, y = lm.y, W = '#ece9e1';
      prism(ngon(x, y, 10, 8, Math.PI / 8), 0, 3, { wall: '#b4aea5', roof: '#ccc6bc' });
      cylV(x, y, 7.4, 3, 5.6, '#dedad2', '#ebe8e1');
      petals(x, y, 6.2, 9, 5.8, 12, '#f1ece6');                    // lotus pedestal
      petals(x, y, 4.6, 7.2, 6.6, 12, '#f6f1ec', Math.PI / 12);
      const B = lm._b || (lm._b = {
        hem: ngonE(x, y + 0.4, 5, 4, 12), robe1: ngonE(x, y + 0.3, 4.5, 3.6, 12), robe2: ngonE(x, y + 0.2, 4.1, 3.2, 12), sh: ngonE(x, y, 4.9, 3.1, 12),
      });
      prism(B.hem, 6.6, 10, { wall: W, roof: false });              // robe hem flaring over the feet
      prism(B.robe1, 10, 26, { wall: W, roof: false });
      prism(B.robe2, 26, 42, { wall: W, roof: false });
      prism(B.sh, 42, 47.5, { wall: '#efece5', roof: '#f4f2ec' }); // shoulders
      robeFolds(x, y + 0.3, 4.4, 3.5, 12, 40);
      // the raised right hand (abhaya mudra) and the left holding the robe
      box(x + 2.4, y + 2.6, 1.7, 1.6, 34, 41, plainSt('#f1eee8', '#f6f4ef'));
      box(x - 3.7, y + 2, 1.5, 1.5, 25, 31, plainSt('#e9e6de', '#f3f0ea'));
      cylV(x, y, 1.4, 47.5, 49.2, W, false);
      dome(x, y, 2.9, 48.8, 56, '#f1eee8', false);                 // head
      dome(x, y, 2.1, 53.4, 56.8, '#dcd8cf', false);               // hair curls
      dome(x, y, 1.3, 55.8, 58.8, '#e6e2d9', false);               // ushnisha
    },
    shadow(lm) { N.draw.castCircle(lm.x, lm.y, 9, 4); N.draw.castPole(lm.x, lm.y, 56, 8); },
    lights(lm) {
      const Ls = lightsOf(lm, 3);
      pushLight(Ls[0], lm.x, lm.y, 4, 30, '#f4f8ff', 0.55, false);
      pushLight(Ls[1], lm.x, lm.y, 28, 22, '#f4f8ff', 0.85, false);
      pushLight(Ls[2], lm.x, lm.y, 52, 16, '#ffffff', 0.85, false);
    },
    night(lm, a) { glow(lm.x, lm.y, 40, 14, '#dbe8ff', 0.16 * a); },
  });
  function robeFolds(x, y, rx, ry, h0, h1) {
    const a0 = Math.atan2(CAMY - y, CAMX - x);
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      const a = a0 + i * 0.7;
      const k0 = kh(h0 + 2 + i), k1 = kh(h1 - 4 + i * 2);
      ctx.moveTo(sxp(x + Math.cos(a) * rx, k0), syp(y + Math.sin(a) * ry, k0));
      ctx.lineTo(sxp(x + Math.cos(a + 0.35) * rx * 0.96, k1), syp(y + Math.sin(a + 0.35) * ry * 0.96, k1));
    }
    ctx.strokeStyle = 'rgba(120,112,100,0.35)'; ctx.lineWidth = Math.max(0.5, 0.45 * kh(h0)); ctx.stroke();
  }

  L.register('kakatiya_arch', {
    draw(lm) {
      const x = lm.x, y = lm.y, ew = lm.w >= lm.d;
      const G = '#b3a399', st = lm._st || (lm._st = { wall: G, roof: '#c6b8ae', trim: '#d6cac1', fac: fac((g, L, H) => { g.rect('l', 0, H - 1, L, H); g.rect('s', 0, H * 0.4, L, H * 0.43); }) });
      const half = (ew ? lm.w : lm.d) / 2 - 1.8;
      const pts = [-half, -half * 0.55, half * 0.55, half];
      for (const o of pts) { const px = ew ? x + o : x, py = ew ? y : y + o, ps = Math.abs(o) > half * 0.9 ? 3.2 : 2.2; box(px - ps / 2, py - ps / 2, ps, ps, 0, 21, st); }
      // lintels + crown with the swan-tipped crest
      if (ew) { box(x - half - 2, y - 2, half * 2 + 4, 4, 21, 24.5, st); box(x - half * 0.6, y - 1.6, half * 1.2, 3.2, 24.5, 27.5, st); }
      else { box(x - 2, y - half - 2, 4, half * 2 + 4, 21, 24.5, st); box(x - 1.6, y - half * 0.6, 3.2, half * 1.2, 24.5, 27.5, st); }
      dome(x, y, 1.8, 27.5, 31, '#c2b4aa', false, 1);
      for (const s of [-1, 1]) { const px = ew ? x + s * (half + 1) : x, py = ew ? y : y + s * (half + 1); cone(px, py, 1.6, 24.5, 28.5, '#c2b4aa', 6); }
    },
    shadow(lm) { N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2 + 3, lm.w, lm.d - 6, 26); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 16, 30, '#ffe7b8', 0.6, false); },
  });

  L.register('ntr_memorial', {
    draw(lm) {
      const x = lm.x, y = lm.y;
      box(x - 20, y - 14, 40, 28, 0, 1.4, plainSt('#d8d2c6', '#e9e4da'));
      box(x - 16, y - 11, 32, 22, 1.4, 2.8, plainSt('#e6e1d7', '#f2eee6'));
      box(x - 12, y - 8, 24, 16, 2.8, 4.2, plainSt('#efebe3', '#f8f6f1'));
      // samadhi with a garland and a canopy on four pillars
      box(x - 4, y - 2.5, 8, 5, 4.2, 6.2, plainSt('#3a3836', '#4e4b48'));
      ring(x, y, 3.2, 6.4, '#f08a24', 0.8);
      for (const [dx, dy] of CORNER4) pole(x + dx * 9, y + dy * 5.5, 4.2, 15, '#f4f2ec', 1.4);
      box(x - 11, y - 7.5, 22, 15, 15, 16.4, plainSt('#f2efe8', '#faf8f4'));
      box(x - 6, y - 4, 12, 8, 16.4, 18, plainSt('#f2efe8', '#faf8f4'));
    },
    shadow(lm) { N.draw.castBox(lm.x - 11, lm.y - 7.5, 22, 15, 16); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 6, 44, '#fff4dc', 0.7, false); },
    ground(g, lm) { lawn(g, lm.x, lm.y, 80, 56); },
  });

  L.register('khairatabad_ganesh', {
    draw(lm) {
      const x = lm.x, y = lm.y, hw = lm.w / 2 - 2, hd = lm.d / 2 - 2;
      const on = ganeshOn();
      const BAM = '#c9a86a';
      if (on) {
        // the giant idol: lotus base, dhoti, belly, arms, elephant head, tall crown
        cylV(x, y, 12, 0, 4, '#e47a9a', false); petals(x, y, 10, 14, 4.2, 14, '#f29ab2');
        prism(ngonE(x, y, 9, 7, 12), 4, 14, { wall: '#e8742a', roof: false });
        prism(ngonE(x, y, 10, 8, 12), 14, 24, { wall: '#f0a46a', roof: false });
        for (const s of [-1, 1]) { box(x + s * 9.5 - 1.5, y - 1.5, 3, 3, 16, 28, plainSt('#f0a46a', '#f3b27c')); box(x + s * 12 - 1.4, y - 1.4, 2.8, 2.8, 22, 32, plainSt('#f0a46a', '#f3b27c')); }
        prism(ngonE(x, y, 7, 6, 12), 24, 30, { wall: '#f2b080', roof: '#f4bc90' });
        for (const s of [-1, 1]) prism(ngonE(x + s * 7, y, 4.2, 5, 10), 30, 31.6, { wall: '#f4bc90', roof: '#f6c8a0' }); // ears
        dome(x, y, 6, 30, 38, '#f2b080', false);
        cylV(x, y + 4.4, 1.6, 26, 33, '#f2b080', false);            // trunk
        cylV(x, y, 4, 37, 41, '#e8b830', false); cone(x, y, 4.2, 41, 50, '#f2c230', 10); // crown
        disc(x, y, 0.9, 50.4, '#ff4a3a');
        // the pandal canopy edges (striped cloth) on bamboo
        for (const [dx, dy] of CORNER4) pole(x + dx * hw, y + dy * hd, 0, 46, BAM, 1.2);
        bambooFrame(x, y, hw, hd, 46, BAM);
      } else {
        // off-season: the bamboo skeleton waits on its ground
        for (const [dx, dy] of CORNER4) pole(x + dx * hw, y + dy * hd, 0, 44, BAM, 1.2);
        bambooFrame(x, y, hw, hd, 16, BAM); bambooFrame(x, y, hw, hd, 30, BAM); bambooFrame(x, y, hw, hd, 44, BAM);
        box(x - 4, y - 3, 8, 6, 0, 5, plainSt('#e8742a', '#f08a3a'));  // the small shrine kept all year
      }
    },
    shadow(lm) { if (ganeshOn()) N.draw.castCircle(lm.x, lm.y, 10, 30); },
    lights(lm) { if (ganeshOn()) { const Ls = lightsOf(lm, 2); pushLight(Ls[0], lm.x, lm.y, 10, 70, '#ffd890', 0.9, false); pushLight(Ls[1], lm.x, lm.y, 40, 50, '#ffe0a0', 0.9, true); } },
    night(lm, a) { if (ganeshOn()) bulbRect(lm.x - lm.w / 2 + 2, lm.y - lm.d / 2 + 2, lm.w - 4, lm.d - 4, 46, 3, '#ff6a4a', '#fff0a0'); },
  });
  function bambooFrame(x, y, hw, hd, h, col) {
    const k = kh(h);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.8, 0.9 * k);
    ctx.strokeRect(sxp(x - hw, k), syp(y - hd, k), hw * 2 * k, hd * 2 * k);
  }

  /* ======================================================================== */
  /*                                SECUNDERABAD                               */
  /* ======================================================================== */
  const CT = {
    shaft: fac((g, L, H) => { g.rect('g', 0, 0, L, 1.2); g.arch('w', L * 0.32, L * 0.68, H * 0.12, H * 0.32, H * 0.42, 1.4, 4); g.rect('a', 0, H * 0.48, L, H * 0.52); g.arch('w', L * 0.36, L * 0.64, H * 0.6, H * 0.78, H * 0.86, 1.4, 4); g.rect('l', 0, H - 1, L, H); }),
    clock: fac((g, L, H) => { g.rect('l', 0, 0, L, 0.8); g.circ('r', L / 2, H * 0.52, Math.min(L, H) * 0.42, 14); g.circ('c', L / 2, H * 0.52, Math.min(L, H) * 0.34, 14); g.rect('l', 0, H - 0.9, L, H); }),
    lantern: fac((g, L, H) => { g.arcade('d', 0.8, L - 0.8, 2, 0.6, H * 0.55, H * 0.85, 0.9, 1.3); }),
  };
  function clockTowerSt(lm) {
    if (lm._st) return lm._st;
    const mc = lm.variant === 'mahboob_chowk';
    const wall = mc ? '#e8d7a6' : '#e3d8c4', acc = mc ? '#5f9a7a' : '#a8503e';
    lm._st = {
      base: { wall: '#a59c90', roof: '#bdb4a8' },
      shaft: { wall, roof: U.shade(wall, 1.06), trim: '#f6efe0', acc, dark: '#3f3530', fac: CT.shaft },
      clock: { wall: U.shade(wall, 1.04), roof: U.shade(wall, 1.1), trim: '#f6efe0', fac: CT.clock },
      lantern: { wall, roof: U.shade(wall, 1.1), dark: '#3f3530', fac: CT.lantern },
      mc, acc,
    };
    return lm._st;
  }
  function drawClockTower(lm) {
    const st = clockTowerSt(lm), x = lm.x, y = lm.y;
    if (st.mc) {
      box(x - 8, y - 8, 16, 16, 0, 3, st.base);
      box(x - 4.5, y - 4.5, 9, 9, 3, 32, st.shaft);
      box(x - 5.2, y - 5.2, 10.4, 10.4, 32, 40, st.clock);
      clocksOn(x - 5.2, y - 5.2, 10.4, 10.4, 32, 40);
      prism(ngon(x, y, 3.8, 8, Math.PI / 8), 40, 45, { wall: '#efe2bc', roof: '#f4ead0' });
      dome(x, y, 3.9, 45, 51, '#f2ead6', true, 2.2);
    } else {
      box(x - 9, y - 9, 18, 18, 0, 2, st.base);
      box(x - 7.5, y - 7.5, 15, 15, 2, 6, st.base);
      box(x - 5.5, y - 5.5, 11, 11, 6, 46, st.shaft);
      box(x - 6.5, y - 6.5, 13, 13, 45, 47, plainSt('#efe6d4', '#f6f0e4'));
      box(x - 6, y - 6, 12, 12, 47, 57, st.clock);
      clocksOn(x - 6, y - 6, 12, 12, 47, 57);
      box(x - 6.8, y - 6.8, 13.6, 13.6, 57, 58.4, plainSt('#efe6d4', '#f6f0e4'));
      box(x - 4.4, y - 4.4, 8.8, 8.8, 58.4, 64, st.lantern);
      for (const [dx, dy] of CORNER4) dome(x + dx * 5.6, y + dy * 5.6, 1.3, 58.4, 61, '#efe6d4', true, 0.8);
      dome(x, y, 4.6, 64, 71, '#c9b9a0', true, 3, '#c9a227');
    }
  }
  function clocksOn(x, y, w, d, h0, h1) {
    const c = CLOCK_C; c.v = (h1 - h0) * 0.52; c.r = Math.min(w, h1 - h0) * 0.34;
    for (const face of 'NSWE') {
      if (!visibleFace(face, x, y, w, d)) continue;
      const fw = faceWall(face, x, y, w, d);
      if (Math.abs(fw.dist) * Z * (h1 - h0) * P < 1.6) continue;
      clockHands(c, fw.ax, fw.ay, fw.ux, fw.uy, h0, fw.L);
    }
  }
  const CLOCK_C = { v: 5, r: 3 };
  L.register('clock_tower', {
    draw: drawClockTower,
    shadow(lm) { N.draw.castBox(lm.x - 5.5, lm.y - 5.5, 11, 11, lm.variant === 'mahboob_chowk' ? 50 : 70); },
    lights(lm) { const Ls = lightsOf(lm, 2); pushLight(Ls[0], lm.x, lm.y, 10, 40, '#ffe7b8', 0.7, false); pushLight(Ls[1], lm.x, lm.y, lm.variant === 'mahboob_chowk' ? 36 : 52, 26, '#fff6e0', 0.9, false); },
    night(lm, a) {
      const mc = lm.variant === 'mahboob_chowk';
      const x = mc ? lm.x - 5.2 : lm.x - 6, y = x - lm.x + lm.y, s = mc ? 10.4 : 12, h0 = mc ? 32 : 47, h1 = mc ? 40 : 57;
      faceEmit(x, y, s, s, h0, h1, CT.clock, ['c'], '#fff6d8', a);
      clocksOn(x, y, s, s, h0, h1);
    },
    ground(g, lm) { if (lm.variant !== 'mahboob_chowk') { g.fillStyle = 'rgba(210,200,180,0.8)'; g.fillRect(lm.x - 12, lm.y - 12, 24, 24); } },
  });

  L.register('spanish_mosque', {
    draw(lm) {
      const x = lm.x, y = lm.y;
      let st = lm._st;
      if (!st) st = lm._st = { wall: '#ece2cc', roof: '#e2d8c2', trim: '#f8f2e4', dark: '#3e4a46', fac: fac((g, L, H) => { g.rect('g', 0, 0, L, 1.2); g.arcade('d', 3, L - 3, Math.max(2, Math.round(L / 7)), 0, H * 0.5, H * 0.8, 2.2, 1); g.rect('a', 0, H - 2, L, H - 1.2); g.rect('l', 0, H - 1, L, H); }), acc: '#4f7a6a' };
      box(x - 16, y - 16, 32, 32, 0, 18, st);
      parapet(x - 16, y - 16, 32, 32, 18, 2.2, crestSt({ wall: '#ece2cc', trim: '#f4ecdc' }), CREST.arch);
      const items = SPM; for (const it of items) it.d = camDist2(x + it.dx, y + it.dy);
      items.sort((a, b) => b.d - a.d);
      for (const it of items) {
        const px = x + it.dx, py = y + it.dy;
        if (it.t === 0) { prism(ngon(px, py, 8, 8, Math.PI / 8), 18, 27, { wall: '#e8dcc2', roof: '#d9cdb4' }); cone(px, py, 8.6, 27, 44, '#6c7177', 8); disc(px, py, 0.7, 44.6, '#c9a227'); }
        else { cylV(px, py, 2.6, 0, 26, '#e9dfc8', '#e1d6be'); ring(px, py, 3, 20, '#8a9a8a', 0.8); cone(px, py, 3.1, 26, 35, '#6c7177', 8); }
      }
    },
    shadow(lm) { N.draw.castBox(lm.x - 16, lm.y - 16, 32, 32, 18); N.draw.castPole(lm.x, lm.y, 42, 12); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 10, 50, '#fff0d0', 0.55, false); },
  });
  const SPM = [{ t: 0, dx: 0, dy: 0, d: 0 }, { t: 1, dx: -16, dy: -16, d: 0 }, { t: 1, dx: 16, dy: -16, d: 0 }, { t: 1, dx: -16, dy: 16, d: 0 }, { t: 1, dx: 16, dy: 16, d: 0 }];

  /* ======================================================================== */
  /*                                 HITEC CITY                                */
  /* ======================================================================== */
  function sectorPts(x, y, r0, r1, a0, a1, n) {
    const p = [];
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; p.push([x + Math.cos(a) * r1, y + Math.sin(a) * r1]); }
    for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; p.push([x + Math.cos(a) * r0, y + Math.sin(a) * r0]); }
    return p;
  }
  L.register('cyber_towers', {
    init(lm) {
      const x = lm.x, y = lm.y, g = 0.13;
      lm._sec = [];
      for (let q = 0; q < 4; q++) {
        const a0 = q * (TAU / 4) + g, a1 = (q + 1) * (TAU / 4) - g, am = (a0 + a1) / 2;
        lm._sec.push({ lo: sectorPts(x, y, 22, 46, a0, a1, 6), hi: sectorPts(x, y, 22, 36, a0 + 0.05, a1 - 0.05, 6), cx: x + Math.cos(am) * 34, cy: y + Math.sin(am) * 34, d: 0 });
      }
      lm._cr = [{ x: x + 41, y: y - 41, a: 0.6, s: 0.05 }, { x: x - 41, y: y + 41, a: 3.6, s: -0.04 }];
    },
    draw(lm) {
      const secs = lm._sec;
      for (const s of secs) s.d = camDist2(s.cx, s.cy);
      secs.sort((a, b) => b.d - a.d);
      const glass = { wall: '#3c8396', roof: '#c9ccd0', concave: true };
      const glass2 = { wall: '#4693a6', roof: '#d6d8dc' };
      for (const s of secs) {
        prism(s.lo, 0, 56, glass);
        floorLines(s.lo, 0, 56, 7);
        prism(s.hi, 56, 74, glass2);
        floorLines(s.hi, 56, 74, 6);
        plane(74, cyberRoof, s);
      }
      // core: the round atrium court with a fountain
      const k = kh(0.4);
      ctx.beginPath(); ctx.arc(sxp(lm.x, k), syp(lm.y, k), 8 * k, 0, TAU); fill('#7fb8c4');
      for (const c of lm._cr) crane(c.x, c.y, 104, c.a + Math.sin(TIME * c.s) * 0.8);
    },
    shadow(lm) { N.draw.castCircle(lm.x, lm.y, 44, 50); for (const c of lm._cr || []) N.draw.castPole(c.x, c.y, 104, 3); },
    lights(lm) {
      const Ls = lightsOf(lm, 3);
      pushLight(Ls[0], lm.x, lm.y, 30, 90, '#d8f0ff', 0.75, false);
      pushLight(Ls[1], lm.x, lm.y, 70, 60, '#d8f0ff', 0.6, false);
      pushLight(Ls[2], lm.x, lm.y + 60, 0, 70, '#ffe0a0', 0.6, true);
    },
    night(lm, a) {
      // lit floors on the curved glass + red crane beacons
      ctx.globalAlpha = a * 0.85;
      for (const s of lm._sec) { floorLines(s.lo, 0, 56, 7, '#bff0ff', 1.4); floorLines(s.hi, 56, 74, 6, '#d8f6ff', 1.2); }
      ctx.globalAlpha = 1;
      const blink = Math.sin(TIME * 3) > 0 ? 1 : 0.25;
      for (const c of lm._cr) glow(c.x, c.y, 106, 5, '#ff3020', blink * a);
    },
  });
  function cyberRoof(g, s) {
    g.strokeStyle = 'rgba(120,125,130,0.6)'; g.lineWidth = 0.8;
    g.beginPath(); const p = s.hi; g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); g.stroke();
    g.fillStyle = '#9aa0a6'; g.fillRect(s.cx - 2.5, s.cy - 2, 5, 4);
    g.fillStyle = '#b8bec4'; g.fillRect(s.cx - 2, s.cy - 1.5, 4, 3);
  }
  // white floor bands across the visible outer walls of a sector prism
  function floorLines(pts, h0, h1, step, col, lw) {
    const n = pts.length, sgn = pts._sgn || (pts._sgn = polyArea(pts) > 0 ? 1 : -1);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const ex = b[0] - a[0], ey = b[1] - a[1], nx = ey * sgn, ny = -ex * sgn;
      if (nx * (CAMX - a[0]) + ny * (CAMY - a[1]) <= 0) continue;
      for (let h = h0 + step; h < h1 - 0.5; h += step) { const k = kh(h); ctx.moveTo(sxp(a[0], k), syp(a[1], k)); ctx.lineTo(sxp(b[0], k), syp(b[1], k)); }
    }
    ctx.strokeStyle = col || 'rgba(235,245,250,0.75)'; ctx.lineWidth = Math.max(0.6, (lw || 0.7) * Z); ctx.stroke();
  }
  // a tower crane: lattice mast, jib + counter-jib with a block, hook line
  function crane(x, y, h, ang) {
    box(x - 1.3, y - 1.3, 2.6, 2.6, 0, h, CRANE_ST);
    const k0 = kh(0), k = kh(h);
    // lattice zigzag on the camera-facing side
    ctx.beginPath();
    for (let hh = 0; hh < h - 4; hh += 4) { const ka = kh(hh), kb = kh(hh + 4); ctx.moveTo(sxp(x - 1.3, ka), syp(y + 1.3, ka)); ctx.lineTo(sxp(x + 1.3, kb), syp(y + 1.3, kb)); }
    ctx.strokeStyle = '#8a6a10'; ctx.lineWidth = Math.max(0.5, 0.4 * k0); ctx.stroke();
    const ca = Math.cos(ang), sa = Math.sin(ang);
    ctx.beginPath(); ctx.moveTo(sxp(x - ca * 12, k), syp(y - sa * 12, k)); ctx.lineTo(sxp(x + ca * 42, k), syp(y + sa * 42, k));
    ctx.strokeStyle = '#e8b830'; ctx.lineWidth = Math.max(1, 1.8 * k); ctx.stroke();
    ctx.fillStyle = '#7a7a78'; ctx.fillRect(sxp(x - ca * 11, k) - 2 * k, syp(y - sa * 11, k) - 2 * k, 4 * k, 4 * k);
    const tx = x + ca * 30, ty = y + sa * 30, kh2 = kh(h - 30);
    ctx.beginPath(); ctx.moveTo(sxp(tx, k), syp(ty, k)); ctx.lineTo(sxp(tx, kh2), syp(ty, kh2));
    ctx.strokeStyle = 'rgba(40,40,40,0.7)'; ctx.lineWidth = Math.max(0.5, 0.4 * k); ctx.stroke();
    ctx.fillStyle = '#4a4a48'; ctx.fillRect(sxp(tx, kh2) - 1.5, syp(ty, kh2) - 1.5, 3, 3);
    box(x - 2, y - 2, 4, 4, h - 2, h + 1.5, CRANE_CAB);
  }
  const CRANE_ST = { wall: '#e0a820', roof: '#f2c230' }, CRANE_CAB = { wall: '#d8d4cc', roof: '#ece8e0' };

  /* ======================================================================== */
  /*                               GOLCONDA                                    */
  /* ======================================================================== */
  const FORT = '#8e7f6b', FORT_RF = '#7c6e5c';
  const FW_FAC = fac((g, L, H) => {
    for (let v = 3; v < H - 1; v += 3.2) g.rect('s', 0, v, L, v + 0.45);
    const n = Math.floor(L / 24);
    for (let i = 0; i < n; i++) { const u = (i + 0.5) * (L / n); g.rect('d', u - 0.5, H * 0.55, u + 0.5, H * 0.75); }
  });
  const FORT_CREST = { wall: FORT, trim: '#c8b796' };
  // top of a curtain wall: worn walkway + merlon blocks along both edges
  function fortTop(g, x, y, w, d) {
    g.fillStyle = '#857663'; g.fillRect(x + 2, y + 2, w - 4, d - 4);
    g.fillStyle = '#c3b293';
    if (w >= d) for (let i = x + 1; i < x + w - 2; i += 4) { g.fillRect(i, y, 2.2, 2); g.fillRect(i, y + d - 2, 2.2, 2); }
    else for (let j = y + 1; j < y + d - 2; j += 4) { g.fillRect(x, j, 2, 2.2); g.fillRect(x + w - 2, j, 2, 2.2); }
  }
  L.register('fort_wall', {
    init(lm) {
      const ew = lm.w > lm.d, len = ew ? lm.w : lm.d;
      lm._bast = [];
      const n = Math.max(1, Math.round(len / 90));
      for (let i = 0; i <= n; i++) { const t = i / n; lm._bast.push(ew ? [lm.x - lm.w / 2 + lm.w * t, lm.y] : [lm.x, lm.y - lm.d / 2 + lm.d * t]); }
      lm._st = { wall: FORT, roof: FORT_RF, trim: '#bca684', dark: '#2e261e', fac: FW_FAC, roofFn: fortTop };
    },
    draw(lm) {
      const x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2, H = 22;
      box(x0, y0, lm.w, lm.d, 0, H, lm._st);
      parapet(x0, y0, lm.w, lm.d, H, 3.4, FORT_CREST, CREST.merlon);
      const vr = R.view;
      for (const b of lm._bast) {
        if (b[0] < vr.x0 - 60 || b[0] > vr.x1 + 60 || b[1] < vr.y0 - 60 || b[1] > vr.y1 + 60) continue;
        cylV(b[0], b[1], 11, 0, 26, '#8a7b67', '#7a6c5a');
        crenRing(b[0], b[1], 11, 26, '#c8b18c');
      }
    },
    shadow(lm) { N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, 24); for (const b of lm._bast || []) N.draw.castCircle(b[0], b[1], 11, 18); },
    lights(lm) { if (lm.id === 'golconda_wall_e1' || lm.id === 'golconda_wall_e2') pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 10, 120, '#ffd890', 0.45, false); },
  });
  const GATE_SPRING = 16, GATE_APEX = 30, GATE_SPAN0 = 30, GATE_TOP = 40;
  const gateSpand = fac((g, L, H) => {
    const p = archPts(0, L, 0, GATE_SPRING, GATE_APEX, 1.35, 6);
    const pts = [0, GATE_SPAN0, 0, GATE_SPRING];
    for (let i = 4; i < p.length - 4; i += 2) pts.push(p[i], p[i + 1]);
    pts.push(L, GATE_SPRING, L, GATE_SPAN0);
    g.poly('r', pts);
    for (let v = 3; v < GATE_SPAN0; v += 3.2) { /* masonry courses on the piers are part of the pier facade */ }
  });
  L.register('fort_gate', {
    draw(lm) {
      const s0 = lm.solids[0], s1 = lm.solids[1];
      const ns = lm.d > lm.w; // the gate wall runs north-south (passage east-west)
      const st = lm._st || (lm._st = { wall: '#8e7f6b', roof: '#7c6e5c', trim: '#c8b796', dark: '#2a221a', fac: FW_FAC });
      const da = camDist2(s0[0] + s0[2] / 2, s0[1] + s0[3] / 2), db = camDist2(s1[0] + s1[2] / 2, s1[1] + s1[3] / 2);
      const far = da > db ? s0 : s1, near = da > db ? s1 : s0;
      box(far[0], far[1], far[2], far[3], 0, GATE_TOP, st);
      let sx, sy, sw, sd;
      if (ns) { sy = Math.min(s0[1], s1[1]) + 6; sd = Math.abs(s1[1] - s0[1]) - 6; sx = lm.x - lm.w / 2; sw = lm.w; }
      else { sx = Math.min(s0[0], s1[0]) + 6; sw = Math.abs(s1[0] - s0[0]) - 6; sy = lm.y - lm.d / 2; sd = lm.d; }
      const fs = R.faceShade;
      let fFar, fNear;
      if (ns) { fNear = CAMX < lm.x ? 'W' : 'E'; fFar = fNear === 'W' ? 'E' : 'W'; } else { fNear = CAMY < lm.y ? 'N' : 'S'; fFar = fNear === 'N' ? 'S' : 'N'; }
      gateFace(fFar, sx, sy, sw, sd, '#4a3c2c');
      box(sx, sy, sw, sd, GATE_SPAN0, GATE_TOP, st);
      gateFace(fNear, sx, sy, sw, sd, sh('#8e7f6b', fs[fNear]));
      parapet(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, GATE_TOP, 3.4, FORT_CREST, CREST.merlon);
      box(near[0], near[1], near[2], near[3], 0, GATE_TOP, st);
      // two round bastions flank the gate on its outer face
      const F = (lm.face || 'e').toUpperCase();
      for (const p of [far, near]) {
        let bx = p[0] + p[2] / 2, by = p[1] + p[3] / 2;
        if (F === 'E') bx = p[0] + p[2]; else if (F === 'W') bx = p[0]; else if (F === 'N') by = p[1]; else by = p[1] + p[3];
        if (ns) by += (p === s0 ? -3 : 3) * (p[1] < lm.y ? 1 : -1) * -1; else bx += (p[0] < lm.x ? -3 : 3);
        cylV(bx, by, 7, 0, GATE_TOP + 4, '#8a7b67', '#7a6c5a');
        crenRing(bx, by, 7, GATE_TOP + 4, '#c8b796');
      }
      // the great spiked doors swung open against the passage walls
      const dk = kh(1);
      ctx.fillStyle = '#5a3a22';
      for (const p of [s0, s1]) {
        const px = ns ? p[0] + p[2] * 0.15 : p[0] + p[2] / 2, py = ns ? p[1] + p[3] / 2 : p[1] + p[3] * 0.15;
        ctx.fillRect(sxp(px, dk) - 1, syp(py, dk) - 1, 3, 3);
      }
    },
    shadow(lm) { const D = N.draw; for (const s of lm.solids) D.castBox(s[0], s[1], s[2], s[3], GATE_TOP); D.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, GATE_TOP * 0.4); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 20, 60, '#ffcf7a', 0.75, false); },
    night(lm, a) { glow(lm.x, lm.y, 26, 12, '#ffb050', 0.45 * a); },
  });
  function gateFace(face, x, y, w, d, col) {
    const fw = faceWall(face, x, y, w, d);
    const g = geomOf(gateSpand, fw.L, GATE_SPAN0);
    ctx.beginPath(); pathArr(g.cls.r, fw.ax, fw.ay, fw.ux, fw.uy, 0); fill(col);
  }
  const BH_ROCK = [];
  L.register('golconda_bala_hissar', {
    init(lm) {
      const x = lm.x, y = lm.y;
      for (const [dx, dy] of [[-41, -18], [-30, -31], [-6, -32], [20, -30], [41, -20], [42, 8], [34, 30], [6, 32], [-22, 31], [-40, 20], [-42, 0]]) BH_ROCK.push([x + dx, y + dy]);
      lm._st = { wall: '#a08868', roof: '#94805f', trim: '#c2ab86', dark: '#2a221a', fac: fac((g, L, H) => { g.rect('g', 0, 0, L, 1.4); g.arcade('d', 3, L - 3, Math.max(2, Math.round(L / 8)), 0.6, H * 0.28, H * 0.44, 2.2, 1.45); g.rect('l', 0, H * 0.5, L, H * 0.53); g.arcade('d', 3, L - 3, Math.max(2, Math.round(L / 8)), H * 0.56, H * 0.78, H * 0.92, 2.2, 1.45); g.rect('l', 0, H - 1, L, H); }) };
    },
    draw(lm) {
      const x = lm.x, y = lm.y;
      prism(BH_ROCK, 0, 10, { wall: '#8f7d68', roof: '#9c8a73' });
      for (const [dx, dy, r] of [[-34, 18, 6], [32, -22, 5], [36, 20, 5.5], [-30, -24, 5]]) dome(x + dx, y + dy, r, 9, 14, '#998770', false);
      box(x - 30, y - 22, 60, 40, 10, 34, lm._st);
      courtHole(x - 24, y - 15, 14, 12, 34, lm._st, '#8f7d68', lm._st.fac);
      courtHole(x + 8, y - 4, 16, 14, 34, lm._st, '#8f7d68', lm._st.fac);
      parapet(x - 30, y - 22, 60, 40, 34, 3.2, FORT_CREST, CREST.merlon);
      for (const [dx, dy] of CORNER4) chhatri(x + dx * 27, y + dy * 19, 4.4, 34, 41, '#a99272', '#b29b79');
      flag(x, y - 4, 34, 48, '#f08a24', 7, 4.5, false, '#ffffff', '#2f8a3a');
    },
    shadow(lm) { N.draw.castBox(lm.x - 30, lm.y - 22, 60, 40, 34); },
    lights(lm) { const Ls = lightsOf(lm, 2); pushLight(Ls[0], lm.x, lm.y, 20, 80, '#ffcf7a', 0.8, false); pushLight(Ls[1], lm.x, lm.y, 30, 50, '#ffb060', 0.5, true); },
  });
  L.register('taramati_baradari', {
    draw(lm) {
      const x = lm.x, y = lm.y;
      const st = lm._st || (lm._st = { wall: '#c4a27a', roof: '#d2b48e', trim: '#dcc4a2', dark: '#3a2a1c', fac: fac((g, L, H) => { g.rect('g', 0, 0, L, 1.2); g.arcade('d', 2, L - 2, 3, 0.8, H * 0.5, H * 0.82, 3, 1.4); g.rect('l', 0, H - 1.2, L, H); }) });
      box(x - 30, y - 22, 60, 44, 0, 4, plainSt('#a99070', '#bba280'));
      box(x - 22, y - 15, 44, 30, 4, 20, st);
      parapet(x - 22, y - 15, 44, 30, 20, 2.6, { wall: '#c4a27a', trim: '#d6bc98' }, CREST.merlon);
      for (const [dx, dy] of CORNER4) chhatri(x + dx * 19, y + dy * 12, 4, 20, 26, '#d2b48e');
    },
    shadow(lm) { N.draw.castBox(lm.x - 22, lm.y - 15, 44, 30, 20); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 10, 60, '#ffd890', 0.6, false); },
  });
  const QT_BASE = fac((g, L, H) => {
    g.rect('g', 0, 0, L, 1.2);
    const n = L > 30 ? 5 : 3;
    g.arcade('d', 2, L - 2, n, 1, H * 0.34, H * 0.46, 1.6, 1.45);
    g.rect('l', 0, H * 0.5, L, H * 0.53);
    g.arcade('d', 2, L - 2, n, H * 0.56, H * 0.82, H * 0.94, 1.6, 1.45);
  });
  const QT_TERR = fac((g, L, H) => { g.arcade('r', 1, L - 1, Math.max(3, Math.round(L / 6)), 0, H * 0.45, H * 0.85, 1.2, 1.3); g.rect('l', 0, H - 0.6, L, H); });
  function qtTerrace(g, x, y, w, d) {
    g.strokeStyle = 'rgba(90,80,70,0.35)'; g.lineWidth = 0.5;
    g.strokeRect(x + 1.5, y + 1.5, w - 3, d - 3);
    g.fillStyle = 'rgba(80,110,70,0.25)';
    for (const [dx, dy] of CORNER4) g.fillRect(x + w / 2 + dx * w * 0.42 - 2, y + d / 2 + dy * d * 0.42 - 2, 4, 4);
  }
  L.register('qutb_tomb', {
    draw(lm) {
      const x = lm.x, y = lm.y, s = lm.w, h = lm.h;
      const st = lm._st || (lm._st = { base: { wall: '#958e86', roof: '#c4bcae', trim: '#b0a89e', dark: '#3a3530', fac: QT_TERR, roofFn: qtTerrace }, cube: { wall: '#aaa298', roof: '#b9b2a8', trim: '#c4bcb2', dark: '#2f2a28', base: '#8e877f', fac: QT_BASE } });
      const b = s * 0.66, hb0 = 4, hb1 = 4 + h * 0.36;
      box(x - s / 2, y - s / 2, s, s, 0, hb0, st.base);
      box(x - b / 2, y - b / 2, b, b, hb0, hb1, st.cube);
      parapet(x - b / 2, y - b / 2, b, b, hb1, 2.4, { wall: '#aaa298', trim: '#bbb4aa' }, CREST.arch);
      // corner minarets with tiny domes
      for (const [dx, dy] of CORNER4) { const mx = x + dx * (b / 2), my = y + dy * (b / 2); cylV(mx, my, 1.4, hb1, hb1 + 6, '#b4ada3', false); dome(mx, my, 1.5, hb1 + 6, hb1 + 8.4, '#a49d93', true, 0.8); }
      const dr = b * 0.36, h0 = hb1 + 1;
      cylV(x, y, dr, hb1, h0 + h * 0.1, '#a39b91', false);
      ring(x, y, dr * 1.01, h0 + h * 0.05, '#4f8a8a', 0.9); // the last blue-green tiles
      petals(x, y, dr * 0.8, dr * 1.16, h0 + h * 0.1, 14, '#aea79d');
      dome(x, y, dr * 1.04, h0 + h * 0.1, h0 + h * 0.1 + h * 0.4, '#a69e92', true, 3, '#c9a227');
      ribs(x, y, dr * 1.04, h0 + h * 0.1, h0 + h * 0.1 + h * 0.4, 12);
    },
    shadow(lm) { const b = lm.w * 0.66; N.draw.castBox(lm.x - b / 2, lm.y - b / 2, b, b, 4 + lm.h * 0.36); N.draw.castCircle(lm.x, lm.y, b * 0.37, lm.h * 0.75); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 10, lm.w * 1.1, '#ffe2a8', 0.5, false); },
    ground(g, lm) { g.fillStyle = 'rgba(200,190,170,0.6)'; g.fillRect(lm.x - lm.w / 2 - 4, lm.y - lm.w / 2 - 4, lm.w + 8, lm.w + 8); },
  });
  L.register('paigah_tombs', {
    draw(lm) {
      const x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2, w = lm.w, d = lm.d;
      const jali = lm._j || (lm._j = { wall: '#f1eee6', roof: '#f6f3ed', trim: '#ffffff', dark: '#9a948a', fac: fac((g, L, H) => { g.rect('l', 0, 0, L, 1); for (let u = 1.2; u < L - 1; u += 1.6) for (let v = 1.6; v < H - 1.2; v += 1.6) g.rect('d', u, v, u + 0.7, v + 0.7); g.rect('l', 0, H - 1, L, H); }) });
      // floor of the enclosure (white marble) then the lattice walls far first, tombs, canopies, near walls
      plane(0.3, (g) => { g.fillStyle = '#e7e3da'; g.fillRect(x0 + 2, y0 + 2, w - 4, d - 4); g.fillStyle = '#d4cfc4'; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) g.fillRect(x0 + 10 + i * 18, y0 + 10 + j * 14, 7, 3.5); });
      const t = 1.6, H = 8;
      const walls = PG_W;
      walls[0][0] = camDist2(lm.x, y0); walls[1][0] = camDist2(lm.x, y0 + d); walls[2][0] = camDist2(x0, lm.y); walls[3][0] = camDist2(x0 + w, lm.y);
      const order = walls.slice().sort((a, b) => b[0] - a[0]);
      const drawWall = (i) => {
        if (i === 0) box(x0, y0, w, t, 0, H, jali); else if (i === 1) box(x0, y0 + d - t, w, t, 0, H, jali);
        else if (i === 2) box(x0, y0, t, d, 0, H, jali); else box(x0 + w - t, y0, t, d, 0, H, jali);
      };
      drawWall(order[0][1]); drawWall(order[1][1]);
      for (const [dx, dy] of [[-22, -8], [0, -8], [22, -8], [-11, 10], [11, 10]]) {
        box(lm.x + dx - 3.5, lm.y + dy - 1.8, 7, 3.6, 0, 2.2, plainSt('#f6f4ef', '#fbfaf7'));
      }
      chhatri(lm.x, lm.y - 8, 10, 0, 14, '#f3f0ea', '#f6f4ef');
      chhatri(lm.x - 22, lm.y - 8, 7, 0, 11, '#f3f0ea', '#f6f4ef');
      chhatri(lm.x + 22, lm.y - 8, 7, 0, 11, '#f3f0ea', '#f6f4ef');
      drawWall(order[2][1]); drawWall(order[3][1]);
      for (const [dx, dy] of CORNER4) { const mx = lm.x + dx * (w / 2 - 1), my = lm.y + dy * (d / 2 - 1); cylV(mx, my, 1.4, 0, 15, '#f3f0ea', false); dome(mx, my, 1.5, 15, 17.5, '#f6f4ef', true, 0.8); }
    },
    shadow(lm) { N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, 6); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 6, 70, '#fff4dc', 0.5, false); },
  });
  const PG_W = [[0, 0], [0, 1], [0, 2], [0, 3]];

  /* ======================================================================== */
  /*                          PALACES OF THE NIZAMS                            */
  /* ======================================================================== */
  L.register('falaknuma', {
    init(lm) {
      const x = lm.x, y = lm.y;
      const F = (lm.face || 'e') === 'e' ? 1 : -1;
      lm._fk = {
        main: [x - 28 * F - 22, y - 22, 44, 44],
        pincN: sectorPts(x + 8 * F, y, 34, 46, F > 0 ? -1.75 : Math.PI + 0.25, F > 0 ? -0.25 : Math.PI + 1.75, 7),
        pincS: sectorPts(x + 8 * F, y, 34, 46, F > 0 ? 0.25 : Math.PI - 1.75, F > 0 ? 1.75 : Math.PI - 0.25, 7),
        tail: [x - 52 * F - (F > 0 ? 30 : 0), y - 7, 30, 14],
        F,
      };
      lm._st = {
        main: { wall: '#f3f0e8', roof: '#e8e3d8', trim: '#ffffff', dark: '#4a4744', fac: civicSpec({ floors: 2, win: 'rect', gf: 'col', pitch: 5.5, ww: 2.4 }), lit: false },
        wing: { wall: '#efebe2', roof: '#e4dfd4', trim: '#ffffff', dark: '#4a4744', fac: civicSpec({ floors: 2, win: 'round', pitch: 5, ww: 2.2 }), lit: false },
        tail: { wall: '#ebe7de', roof: '#e2ddd2', trim: '#ffffff', dark: '#4a4744', fac: civicSpec({ floors: 1, win: 'rect', pitch: 5, ww: 2.2 }), lit: false },
        terr: { wall: '#9d8f7e', roof: '#c9bfae' },
      };
    },
    draw(lm) {
      const K = lm._fk, S = lm._st, x = lm.x, y = lm.y;
      box(x - lm.w / 2, y - lm.d / 2, lm.w, lm.d, 0, 4, S.terr);
      // garden court between the pincers with a fountain
      plane(4.1, (g) => { g.fillStyle = '#6f9a4e'; g.beginPath(); g.arc(x + 14 * K.F, y, 26, 0, TAU); g.fill(); g.fillStyle = '#e8e2d4'; g.beginPath(); g.arc(x + 14 * K.F, y, 4, 0, TAU); g.fill(); g.fillStyle = '#7fb8c8'; g.beginPath(); g.arc(x + 14 * K.F, y, 2.6, 0, TAU); g.fill(); });
      const parts = FK_PARTS;
      parts[0][0] = camDist2(K.tail[0] + 15, y); parts[1][0] = camDist2(x + 8 * K.F, y - 40); parts[2][0] = camDist2(x + 8 * K.F, y + 40); parts[3][0] = camDist2(K.main[0] + 22, y);
      const order = parts.slice().sort((a, b) => b[0] - a[0]);
      for (const p of order) {
        if (p[1] === 0) box(K.tail[0], K.tail[1], K.tail[2], K.tail[3], 4, 16, S.tail);
        else if (p[1] === 1) prismF(K.pincN, 4, 22, S.wing);
        else if (p[1] === 2) prismF(K.pincS, 4, 22, S.wing);
        else {
          const m = K.main;
          box(m[0], m[1], m[2], m[3], 4, 30, S.main);
          parapet(m[0], m[1], m[2], m[3], 30, 2.2, { wall: '#f3f0e8', trim: '#ffffff' }, CREST.bal);
          dome(m[0] + m[2] / 2, y, 8, 30, 38, '#f6f3ec', false, 2);
          // portico with pediment facing the garden
          const px = K.F > 0 ? m[0] + m[2] : m[0] - 8;
          box(px, y - 9, 8, 18, 4, 24, { wall: '#f6f3ec', roof: '#ffffff', dark: '#5a5550', fac: PAV_LOW.col });
          gable(px - 0.5, y - 9.5, 9, 19, 24, 29, '#f2eee6', 'x');
        }
      }
    },
    shadow(lm) { const K = lm._fk; if (!K) return; N.draw.castBox(K.main[0], K.main[1], K.main[2], K.main[3], 30); N.draw.castPoly(K.pincN, 22); N.draw.castPoly(K.pincS, 22); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x + 60, lm.y, 0, 30, '#ffcf7a', 0.6, true); },
  });
  const FK_PARTS = [[0, 0], [0, 1], [0, 2], [0, 3]];

  L.register('chowmahalla', {
    init(lm) {
      const x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2, w = lm.w, d = lm.d;
      const spec = civicSpec({ floors: 2, win: 'round', gf: 'col', pitch: 5.5, ww: 2.4 });
      const st = { wall: '#dcb66c', roof: '#ece2c8', trim: '#f8f3e6', dark: '#4a3a28', fac: spec, lit: false };
      lm._ch = {
        wall: { wall: '#d4ad62', roof: '#f2ead6', trim: '#f8f3e6', fac: fac((g, L, H) => { g.rect('l', 0, H - 1.2, L, H); g.arcade('r', 2, L - 2, Math.max(2, Math.round(L / 9)), 1, H * 0.5, H * 0.82, 2, 1.4); }), lit: false },
        st, x0, y0, w, d,
        blocks: [
          [lm.x - 30, y0 + d * 0.42, 60, 26, 24],              // Khilwat Mubarak durbar hall
          [lm.x - 40, y0 + d - 30, 80, 20, 20],                // Afzal Mahal (south)
          [x0 + 10, y0 + d * 0.62, 18, 40, 18],                // Mahtab Mahal (west)
          [x0 + w - 28, y0 + d * 0.62, 18, 40, 18],            // Aftab Mahal (east)
        ],
      };
    },
    draw(lm) {
      const C = lm._ch, x0 = C.x0, y0 = C.y0, w = C.w, d = C.d, t = 3, H = 11;
      // courtyards: lawns and the long pools
      plane(0.2, (g) => {
        g.fillStyle = '#c9b48c'; g.fillRect(x0 + t, y0 + t, w - 2 * t, d - 2 * t);
        g.fillStyle = '#6f9a4e'; g.fillRect(x0 + 14, y0 + 16, w - 28, d * 0.3);
        g.fillStyle = '#4f9aa8'; g.fillRect(lm.x - 4, y0 + 18, 8, d * 0.3 - 4);
        g.fillStyle = '#6f9a4e'; g.fillRect(x0 + 32, y0 + d * 0.62, w - 64, d * 0.26);
        g.fillStyle = '#4f9aa8'; g.fillRect(lm.x - 12, y0 + d * 0.7, 24, 10);
      });
      const items = CH_ITEMS;
      for (const it of items) {
        if (it.k < 4) { const b = C.blocks[it.k]; it.d = camDist2(b[0] + b[2] / 2, b[1] + b[3] / 2); }
        else if (it.k === 4) it.d = camDist2(lm.x, y0); else if (it.k === 5) it.d = camDist2(lm.x, y0 + d); else if (it.k === 6) it.d = camDist2(x0, lm.y); else it.d = camDist2(x0 + w, lm.y);
      }
      items.sort((a, b) => b.d - a.d);
      for (const it of items) {
        if (it.k < 4) { const b = C.blocks[it.k]; box(b[0], b[1], b[2], b[3], 0, b[4], C.st); parapet(b[0], b[1], b[2], b[3], b[4], 2, { wall: '#dcb66c', trim: '#f8f3e6' }, CREST.bal); }
        else if (it.k === 4) {
          box(x0, y0, w, t, 0, H, C.wall);
          // the north gate with the clock tower
          box(lm.x - 10, y0 - 1, 20, 9, 0, 16, C.st);
          box(lm.x - 4, y0, 8, 7, 16, 27, C.st);
          clocksOn(lm.x - 4, y0, 8, 7, 18, 25);
          dome(lm.x, y0 + 3.5, 3.6, 27, 32, '#efe6d0', true, 1.6);
        }
        else if (it.k === 5) box(x0, y0 + d - t, w, t, 0, H, C.wall);
        else if (it.k === 6) box(x0, y0, t, d, 0, H, C.wall);
        else box(x0 + w - t, y0, t, d, 0, H, C.wall);
      }
    },
    shadow(lm) { const C = lm._ch; if (!C) return; N.draw.castBox(C.x0, C.y0, C.w, C.d, 10); for (const b of C.blocks) N.draw.castBox(b[0], b[1], b[2], b[3], b[4]); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y - lm.d / 2, 10, 30, '#ffcf7a', 0.6, true); },
  });
  const CH_ITEMS = [{ k: 0, d: 0 }, { k: 1, d: 0 }, { k: 2, d: 0 }, { k: 3, d: 0 }, { k: 4, d: 0 }, { k: 5, d: 0 }, { k: 6, d: 0 }, { k: 7, d: 0 }];

  /* ======================================================================== */
  /*                            PLACES OF WORSHIP                              */
  /* ======================================================================== */
  // rect of the "front" part of a footprint in the face direction: returns [x, y, w, d] for a share t
  function splitFace(lm, t) {
    const x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2, F = (lm.face || 's').toUpperCase();
    // back (main) part and front part
    if (F === 'N') return { back: [x0, y0 + lm.d * t, lm.w, lm.d * (1 - t)], front: [x0, y0, lm.w, lm.d * t], F };
    if (F === 'S') return { back: [x0, y0, lm.w, lm.d * (1 - t)], front: [x0, y0 + lm.d * (1 - t), lm.w, lm.d * t], F };
    if (F === 'W') return { back: [x0 + lm.w * t, y0, lm.w * (1 - t), lm.d], front: [x0, y0, lm.w * t, lm.d], F };
    return { back: [x0, y0, lm.w * (1 - t), lm.d], front: [x0 + lm.w * (1 - t), y0, lm.w * t, lm.d], F };
  }
  /* ---------------------------------------------------------------- mosques */
  const MOSQ_FAC = fac((g, L, H) => { g.rect('g', 0, 0, L, 1); g.arcade('d', 2, L - 2, 3, 0, H * 0.5, H * 0.8, 2, 1.45); g.rect('a', 0, H - 2, L, H - 1.3); g.rect('l', 0, H - 1.2, L, H); });
  L.register('mosque', {
    init(lm) {
      const sp = splitFace(lm, 0.32);
      const named = lm.id === 'jama_masjid_charminar';
      const big = lm.id === 'khairatabad_mosque';
      const h = U.hash2(lm.x | 0, lm.y | 0);
      lm._m = {
        sp, named, big,
        st: { wall: named ? '#a59d93' : '#f4f2ec', roof: named ? '#b6aea4' : '#ebe8e1', trim: named ? '#c2bab0' : '#ffffff', dark: '#2f3a34', acc: named ? '#8a8279' : '#2f8f5a', fac: MOSQ_FAC },
        dome: named ? '#a8a096' : h < 0.5 ? '#f4f2ec' : '#3f9a68', mcol: named ? '#a8a096' : '#f2f0ea',
      };
    },
    draw(lm) {
      const M = lm._m, b = M.sp.back, fr = M.sp.front, F = M.sp.F;
      const H = M.big ? 18 : 15;
      // courtyard platform with a little ablution tank
      box(fr[0], fr[1], fr[2], fr[3], 0, 1.2, plainSt('#d8d2c6', '#e8e3da'));
      const k = kh(1.25);
      ctx.fillStyle = '#4f9aa8'; ctx.fillRect(sxp(fr[0] + fr[2] / 2 - 2.5, k), syp(fr[1] + fr[3] / 2 - 1.8, k), 5 * k, 3.6 * k);
      box(b[0], b[1], b[2], b[3], 0, H, M.st);
      parapet(b[0], b[1], b[2], b[3], H, 1.8, { wall: M.st.wall, trim: M.st.trim }, CREST.arch);
      const cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2, r = Math.min(b[2], b[3]) * 0.3;
      // two minarets at the front corners of the hall
      const mins = MOSQ_MIN;
      if (F === 'N' || F === 'S') { const yy = F === 'N' ? b[1] : b[1] + b[3]; mins[0][0] = b[0] + 1.5; mins[0][1] = yy; mins[1][0] = b[0] + b[2] - 1.5; mins[1][1] = yy; }
      else { const xx = F === 'W' ? b[0] : b[0] + b[2]; mins[0][0] = xx; mins[0][1] = b[1] + 1.5; mins[1][0] = xx; mins[1][1] = b[1] + b[3] - 1.5; }
      const mh = M.big ? 38 : 30;
      const items = MOSQ_IT; items[0].d = camDist2(cx, cy); items[1].d = camDist2(mins[0][0], mins[0][1]); items[2].d = camDist2(mins[1][0], mins[1][1]);
      items.sort((a, b2) => b2.d - a.d);
      for (const it of items) {
        if (it.k === 0) { cylV(cx, cy, r * 0.82, H, H + 2.6, M.st.wall, false); petals(cx, cy, r * 0.6, r * 0.95, H + 2.7, 10, sh(M.dome, 0.95)); dome(cx, cy, r, H + 2.6, H + 2.6 + r * 1.25, M.dome, true, 2.5, '#d9b44a'); }
        else {
          const m = mins[it.k - 1];
          cylV(m[0], m[1], 1.9, 0, mh, M.mcol, false);
          cylV(m[0], m[1], 2.6, mh * 0.72, mh * 0.72 + 1.2, sh(M.mcol, 0.85), M.mcol);
          cylV(m[0], m[1], 1.6, mh, mh + 2.6, M.mcol, false);
          dome(m[0], m[1], 1.8, mh + 2.6, mh + 5.4, M.dome, true, 1.2, '#d9b44a');
        }
      }
    },
    shadow(lm) { const M = lm._m; if (!M) return; const b = M.sp.back; N.draw.castBox(b[0], b[1], b[2], b[3], 18); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 6, 44, '#f0fff0', 0.55, false); },
    night(lm, a) {
      const M = lm._m; if (!M) return;
      const b = M.sp.back, H = M.big ? 18 : 15;
      bulbRect(b[0], b[1], b[2], b[3], H + 1.8, 3, festiveNight() ? '#8dffa8' : '#e8ffe8');
    },
  });
  const MOSQ_MIN = [[0, 0], [0, 0]], MOSQ_IT = [{ k: 0, d: 0 }, { k: 1, d: 0 }, { k: 2, d: 0 }];

  /* ---------------------------------------------------------------- dargahs */
  L.register('dargah', {
    init(lm) { lm._st = { wall: '#f4f2ec', roof: '#ebe8e1', trim: '#ffffff', dark: '#2f3a34', acc: '#2f8f5a', fac: MOSQ_FAC }; },
    draw(lm) {
      const x = lm.x, y = lm.y, hill = lm.id === 'moula_ali_dargah';
      let h0 = 0;
      if (hill) {
        prism(ngonE(x, y, lm.w / 2, lm.d / 2, 11, 0.3), 0, 10, { wall: '#8f7d68', roof: '#9c8a73' });
        for (const [dx, dy, r] of [[-15, 12, 5], [16, -10, 4.5], [12, 15, 4]]) dome(x + dx, y + dy, r, 9, 13, '#998770', false);
        h0 = 10;
      }
      const s = hill ? 22 : lm.w * 0.6;
      box(x - s / 2, y - s / 2, s, s, h0, h0 + 12, lm._st);
      parapet(x - s / 2, y - s / 2, s, s, h0 + 12, 1.8, { wall: '#f4f2ec', trim: '#ffffff' }, CREST.arch);
      for (const [dx, dy] of CORNER4) { cylV(x + dx * s / 2, y + dy * s / 2, 1.2, h0 + 12, h0 + 18, '#f2f0ea', false); dome(x + dx * s / 2, y + dy * s / 2, 1.3, h0 + 18, h0 + 20.4, '#3f9a68', true, 0.8); }
      cylV(x, y, s * 0.3, h0 + 12, h0 + 14, '#f2f0ea', false);
      dome(x, y, s * 0.34, h0 + 14, h0 + 14 + s * 0.42, '#3f9a68', true, 2.4, '#d9b44a');
      flag(x + s / 2, y - s / 2, h0 + 12, h0 + 24, '#2f8f5a', 5, 3.2, true);
    },
    shadow(lm) { N.draw.castBox(lm.x - lm.w * 0.3, lm.y - lm.d * 0.3, lm.w * 0.6, lm.d * 0.6, 20); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 10, 44, '#e8ffe8', 0.6, false); },
    night(lm, a) { glow(lm.x, lm.y, 24, 14, '#9effc0', 0.3 * a); },
  });

  /* ---------------------------------------------------------------- churches */
  const CHURCH_FAC = fac((g, L, H) => { g.rect('g', 0, 0, L, 1); const n = Math.max(2, Math.round(L / 7)); for (let i = 0; i < n; i++) { const u = (i + 0.5) * (L / n); g.arch('w', u - 1.3, u + 1.3, H * 0.2, H * 0.6, H * 0.85, 1.6, 4); } g.rect('l', 0, H - 1, L, H); });
  L.register('church', {
    init(lm) {
      const v = {
        church_st_josephs: { wall: '#e8d39a', roof: '#a8543a', twin: true, tower: '#efdcaa' },
        st_georges_church_abids: { wall: '#f2efe6', roof: '#9a5038', tower: '#f6f3ec' },
        st_johns_church_secunderabad: { wall: '#ece6d6', roof: '#8a4a34', tower: '#f2ede0' },
        holy_trinity_church_bolarum: { wall: '#b3aca2', roof: '#6a6e74', tower: '#c2bbb1' },
        church_st_marys: { wall: '#e6dccb', roof: '#a8543a', tower: '#efe7d8' },
        church_wesley: { wall: '#c98a6a', roof: '#7a3a2a', tower: '#d39a7a' },
      }[lm.id] || { wall: '#f1ede4', roof: '#a8543a', tower: '#f6f3ec' };
      v.st = { wall: v.wall, roof: v.roof, trim: '#ffffff', dark: '#3a3438', fac: CHURCH_FAC, litCol: '#ffe0a0' };
      v.tst = { wall: v.tower, roof: v.tower, trim: '#ffffff', dark: '#3a3438', fac: TOWER_FAC };
      v.sp = splitFace(lm, 0.22);
      lm._c = v;
    },
    draw(lm) {
      const C = lm._c, F = C.sp.F, b = C.sp.back, fr = C.sp.front;
      const along = F === 'N' || F === 'S';
      const nw = along ? b[2] * 0.62 : b[2], nd = along ? b[3] : b[3] * 0.62;
      const nx = b[0] + (b[2] - nw) / 2, ny = b[1] + (b[3] - nd) / 2;
      const H = 14;
      const towers = C.twin ? 2 : 1;
      const ts = Math.min(fr[2], fr[3], 13);
      const tws = TW_POS;
      for (let i = 0; i < towers; i++) {
        const t = towers === 1 ? 0.5 : i === 0 ? 0.22 : 0.78;
        tws[i][0] = along ? fr[0] + fr[2] * t : fr[0] + fr[2] / 2; tws[i][1] = along ? fr[1] + fr[3] / 2 : fr[1] + fr[3] * t;
        tws[i][2] = camDist2(tws[i][0], tws[i][1]);
      }
      const nave = () => { box(nx, ny, nw, nd, 0, H, C.st, null, true); gable(nx - 0.6, ny - 0.6, nw + 1.2, nd + 1.2, H, H + Math.min(nw, nd) * 0.42, C.roof, along ? 'y' : 'x'); };
      const towerAt = (tx, ty) => {
        const s = ts;
        box(tx - s / 2, ty - s / 2, s, s, 0, 30, C.tst);
        if (C.twin) { pyramid(tx - s / 2, ty - s / 2, s, s, 30, 40, '#8a6a52'); }
        else cone(tx, ty, s * 0.55, 30, 46, '#7a7f86', 8);
        crossAt(tx, ty, C.twin ? 40 : 46);
      };
      const navD = camDist2(nx + nw / 2, ny + nd / 2);
      let drawn = false;
      const order = towers === 2 && tws[1][2] > tws[0][2] ? [1, 0] : [0, 1];
      for (const i of order.slice(0, towers)) {
        if (!drawn && navD > tws[i][2]) { nave(); drawn = true; }
        towerAt(tws[i][0], tws[i][1]);
      }
      if (!drawn) nave();
    },
    shadow(lm) { const C = lm._c; if (!C) return; N.draw.castBox(lm.x - lm.w * 0.3, lm.y - lm.d / 2, lm.w * 0.6, lm.d, 18); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 8, 50, '#fff0d0', 0.5, false); },
    night(lm, a) {
      if (!decemberish()) return;
      // a paper Christmas star hung on the tower
      const C = lm._c; if (!C) return;
      const p = TW_POS[0], k = kh(26), X = sxp(p[0], k), Y = syp(p[1], k), r = 3.4 * k;
      ctx.globalAlpha = a; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const an = -Math.PI / 2 + (i / 10) * TAU, rr = i % 2 ? r * 0.45 : r; if (i) ctx.lineTo(X + Math.cos(an) * rr, Y + Math.sin(an) * rr); else ctx.moveTo(X + Math.cos(an) * rr, Y + Math.sin(an) * rr); }
      ctx.closePath(); fill('#fff2a0'); ctx.globalAlpha = 1;
      glow(p[0], p[1], 26, 9, '#ffd860', 0.5 * a);
    },
  });
  const TW_POS = [[0, 0, 0], [0, 0, 0]];
  function crossAt(x, y, h) {
    const k0 = kh(h), k1 = kh(h + 4), k2 = kh(h + 2.8);
    ctx.strokeStyle = '#d9b44a'; ctx.lineWidth = Math.max(0.8, 0.6 * k1);
    ctx.beginPath(); ctx.moveTo(sxp(x, k0), syp(y, k0)); ctx.lineTo(sxp(x, k1), syp(y, k1));
    ctx.moveTo(sxp(x - 1.2, k2), syp(y, k2)); ctx.lineTo(sxp(x + 1.2, k2), syp(y, k2)); ctx.stroke();
  }

  /* ---------------------------------------------------------------- temples */
  const GOP_COLS = ['#f2d16b', '#e98a7a', '#8cc2e2', '#9ccf7a', '#f4b0c8', '#f2a03a'];
  // Dravidian gopuram: tiers of painted figures shrinking upwards, a barrel-vault crown with kalashas
  function gopuram(x, y, w, d, h0, h1, axisX, cols, n, vault) {
    n = n || 5;
    const th = (h1 - h0 - 3) / n;
    for (let i = 0; i < n; i++) {
      const f = 1 - i * (0.42 / n);
      const ww = w * f, dd = d * (1 - i * (0.3 / n));
      const c = cols[i % cols.length];
      box(x - ww / 2, y - dd / 2, ww, dd, h0 + i * th, h0 + (i + 1) * th, gopSt(c));
    }
    const ww = w * 0.55, dd = d * 0.6, hb = h0 + n * th;
    const vc = vault || '#e8b14a';
    if (axisX) gable(x - ww / 2, y - dd / 2, ww, dd, hb, h1, vc, 'x'); else gable(x - dd / 2, y - ww / 2, dd, ww, hb, h1, vc, 'y');
    for (let i = -1; i <= 1; i++) disc(x + (axisX ? i * ww * 0.32 : 0), y + (axisX ? 0 : i * ww * 0.32), 0.7, h1 + 0.6, '#f2c230');
  }
  const gopStC = new Map();
  function gopSt(c) {
    let s = gopStC.get(c);
    if (!s) { s = { wall: c, roof: U.shade(c, 1.08), dark: U.shade(c, 0.55), trim: U.shade(c, 1.2), acc: '#d8402a', acc2: '#2a6ab8', acc3: '#3a9a3a', fac: GOP_FAC }; gopStC.set(c, s); }
    return s;
  }
  const GOP_FAC = fac((g, L, H) => { const n = Math.max(2, Math.round(L / 2.6)); for (let i = 0; i < n; i++) { const u = (i + 0.5) * (L / n); g.rect(i % 3 === 0 ? 'a' : i % 3 === 1 ? 'b' : 'x', u - 0.5, H * 0.2, u + 0.5, H * 0.75); } g.rect('l', 0, H - 0.5, L, H); });
  const STRIPE_FAC = fac((g, L, H) => { const n = Math.max(2, Math.round(L / 2.4)); for (let i = 0; i < n; i += 2) g.rect('a', (i * L) / n, 0, ((i + 1) * L) / n, H); g.rect('l', 0, H - 0.6, L, H); });
  function templeVariant(lm) {
    const id = lm.id;
    if (id === 'iskcon_abids') return { wall: '#f6f3ec', stripe: '#f2a03a', gop: ['#f6f3ec', '#f2e6c8'], dome: true };
    if (id === 'temple_2' || id === 'karmanghat_hanuman_temple') return { wall: '#f3e9d8', stripe: '#e8742a', gop: ['#f08a3a', '#f2b05a', '#e8742a'] };
    if (id === 'temple_4' || id === 'katta_maisamma_temple' || id === 'peddamma_temple') return { wall: '#f6f0e0', stripe: '#d23a2a', gop: ['#f2d16b', '#d23a2a', '#f2c230'], small: id !== 'peddamma_temple' };
    if (id === 'ashtalakshmi_temple') return { wall: '#f6f0e4', stripe: '#d23a2a', gop: GOP_COLS, big: true };
    return { wall: '#f6f0e4', stripe: '#c8402a', gop: GOP_COLS };
  }
  function drawTemple(lm, v) {
    const sp = lm._sp || (lm._sp = splitFace(lm, 0.3));
    const F = sp.F, x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2;
    // compound wall with red-white vertical stripes (only the far half first; near after)
    const wall = v._wst || (v._wst = { wall: v.wall, roof: U.shade(v.wall, 1.05), acc: v.stripe, trim: '#ffffff', fac: STRIPE_FAC });
    plane(0.2, (g) => { g.fillStyle = '#e2d8c4'; g.fillRect(x0, y0, lm.w, lm.d); });
    const t = 1.6, Hw = 4.5;
    // sanctum + vimana at the back centre
    const b = sp.back, bx = b[0] + b[2] / 2, by = b[1] + b[3] / 2, s = Math.min(b[2], b[3]) * (v.small ? 0.6 : 0.5);
    const fr = sp.front, gx = fr[0] + fr[2] / 2, gy = fr[1] + fr[3] / 2;
    const axisX = F === 'N' || F === 'S';
    const gw = (axisX ? fr[2] : fr[3]) * (v.big ? 0.62 : 0.5), gd = (axisX ? fr[3] : fr[2]) * 0.7;
    const parts = TEMP_P;
    parts[0][0] = camDist2(lm.x, y0); parts[1][0] = camDist2(lm.x, y0 + lm.d); parts[2][0] = camDist2(x0, lm.y); parts[3][0] = camDist2(x0 + lm.w, lm.y);
    parts[4][0] = camDist2(bx, by); parts[5][0] = camDist2(gx, gy);
    const order = parts.slice().sort((a, c) => c[0] - a[0]);
    for (const p of order) {
      switch (p[1]) {
        case 0: box(x0, y0, lm.w, t, 0, Hw, wall); break;
        case 1: box(x0, y0 + lm.d - t, lm.w, t, 0, Hw, wall); break;
        case 2: box(x0, y0, t, lm.d, 0, Hw, wall); break;
        case 3: box(x0 + lm.w - t, y0, t, lm.d, 0, Hw, wall); break;
        case 4: {
          box(bx - s / 2, by - s / 2, s, s, 0, 9, plainSt(v.wall, U.shade(v.wall, 1.05)));
          if (v.dome) { dome(bx, by, s * 0.45, 9, 9 + s * 0.6, '#f6f3ec', true, 2, '#e8c040'); }
          else {
            for (let i = 0; i < 3; i++) { const f = 1 - i * 0.22; box(bx - (s * f) / 2, by - (s * f) / 2, s * f, s * f, 9 + i * 3, 12 + i * 3, gopSt(v.gop[(i + 1) % v.gop.length])); }
            dome(bx, by, s * 0.24, 18, 21.5, '#e8b14a', false, 1.6, '#f2c230');
          }
          // dhwaja stambham (gold flag mast) in front of the sanctum
          const mx = (bx + gx) / 2, my = (by + gy) / 2;
          pole(mx, my, 0, v.small ? 10 : 16, '#d9a82a', 0.8);
          break;
        }
        case 5: gopuram(gx, gy, axisX ? gw : gd, axisX ? gd : gw, 0, v.small ? 14 : v.big ? 30 : 22, axisX, v.gop, v.small ? 3 : v.big ? 6 : 5); break;
      }
    }
    if (!v.small) flag(bx + s / 2, by - s / 2, 9, 20, '#f08a24', 4, 2.8, true);
  }
  const TEMP_P = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]];
  L.register('temple', {
    draw(lm) { drawTemple(lm, lm._v || (lm._v = templeVariant(lm))); },
    shadow(lm) { N.draw.castBox(lm.x - lm.w * 0.3, lm.y - lm.d * 0.3, lm.w * 0.6, lm.d * 0.6, 16); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 6, 44, '#ffe0a0', 0.6, false); },
    night(lm, a) { bulbRect(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, 4.6, 3, '#ffd060', '#ff7040'); },
  });
  L.register('mahankali_temple', {
    draw(lm) {
      const v = lm._v || (lm._v = { wall: '#f0cf4a', stripe: '#d23a2a', gop: ['#f2c230', '#d23a2a', '#f08a24', '#3a9a3a'], small: lm.w < 36 });
      drawTemple(lm, v);
      // neem-leaf festoons across the entrance, bonam pots on festival days
      const sp = lm._sp, fr = sp.front;
      const F = sp.F;
      const ax = F === 'N' || F === 'S';
      const ex = F === 'W' ? fr[0] : F === 'E' ? fr[0] + fr[2] : null, ey = F === 'N' ? fr[1] : F === 'S' ? fr[1] + fr[3] : null;
      const k = kh(5);
      ctx.strokeStyle = '#3f7a2a'; ctx.lineWidth = Math.max(1, 1.2 * k); ctx.setLineDash([1.2 * k, 0.8 * k]);
      ctx.beginPath();
      if (ax) { ctx.moveTo(sxp(fr[0] + 2, k), syp(ey, k)); ctx.lineTo(sxp(fr[0] + fr[2] - 2, k), syp(ey, k)); }
      else { ctx.moveTo(sxp(ex, k), syp(fr[1] + 2, k)); ctx.lineTo(sxp(ex, k), syp(fr[1] + fr[3] - 2, k)); }
      ctx.stroke(); ctx.setLineDash([]);
      if (bonaluOn()) {
        for (let i = 0; i < 6; i++) {
          const t = (i + 0.5) / 6;
          const px = ax ? fr[0] + fr[2] * t : (ex + (F === 'W' ? -4 : 4)), py = ax ? ey + (F === 'N' ? -4 : 4) : fr[1] + fr[3] * t;
          dome(px, py, 1.3, 0, 2.4, '#d9a82a', false); disc(px, py, 0.5, 3, '#ffcc40');
        }
      }
    },
    shadow(lm) { N.draw.castBox(lm.x - lm.w * 0.3, lm.y - lm.d * 0.3, lm.w * 0.6, lm.d * 0.6, 14); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 6, 44, '#ffd890', 0.6, false); },
    night(lm, a) { bulbRect(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, 4.6, 3, '#ffd060', '#ff5040'); if (bonaluOn()) glow(lm.x, lm.y, 4, 30, '#ff9a30', 0.4 * a); },
  });

  /* ---------------------------------------------------------------- Sai Baba temple */
  const SAI_CREST = { wall: '#f6f4ef', trim: '#ffffff' };
  const SAI_VROOF = { wall: '#f08a24', roof: '#f6efe2', roofFn(g, x, y, w, d) { g.fillStyle = '#f08a24'; const n = Math.max(2, Math.round(w / 3)); for (let i = 0; i < n; i += 2) g.fillRect(x + (i * w) / n, y, w / n, d); } };
  /** A painted board along the top edge of a box face (pixel font). */
  function faceSign(x, y, w, d, F, h, text, bg, fg) {
    if (!visibleFace(F, x, y, w, d)) return;
    let px = x + w / 2, py = y + d / 2;
    if (F === 'N') py = y; else if (F === 'S') py = y + d; else if (F === 'W') px = x; else px = x + w;
    const k = kh(h - 2.2), X = Math.round(sxp(px, k)), Y = Math.round(syp(py, k));
    const tw = N.draw.pixelTextWidth(text), vert = F === 'W' || F === 'E';
    if (tw > (vert ? d : w) * k + 4) return;
    ctx.fillStyle = bg;
    if (vert) ctx.fillRect(X - 4, Y - tw / 2 - 2, 8, tw + 4); else ctx.fillRect(X - tw / 2 - 2, Y - 4, tw + 4, 8);
    N.draw.pixelText(px, py, h - 2.2, text, fg, vert ? { rot: F === 'E' ? -1 : 1 } : null);
  }
  L.register('sai_temple', {
    init(lm) {
      lm._sp = splitFace(lm, 0.28);
      lm._st = { wall: '#f6f4ef', roof: '#ecebe6', trim: '#ffffff', dark: '#4a4a52', acc: '#f08a24', fac: civicSpec({ floors: 1, win: 'round', pitch: 6, ww: 3 }), litCol: '#ffe8b0' };
      lm._ver = { wall: '#fbfaf6', roof: '#f2f1ec', trim: '#ffffff', dark: '#5a5a62', fac: PAV_LOW.col };
    },
    draw(lm) {
      const sp = lm._sp, b = sp.back, fr = sp.front, F = sp.F;
      box(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, 0, 1.6, plainSt('#d9d4ca', '#e9e6df'));
      box(b[0] + 2, b[1] + 2, b[2] - 4, b[3] - 4, 1.6, 16, lm._st);
      parapet(b[0] + 2, b[1] + 2, b[2] - 4, b[3] - 4, 16, 1.8, SAI_CREST, CREST.arch);
      // pillared verandah on the entrance side + a saffron-and-white shamiana over the queue
      const vx = fr[0] + 4, vy = fr[1] + 1, vw = fr[2] - 8, vd = fr[3] - 1;
      box(vx, vy, vw, vd, 1.6, 12, lm._ver, F === 'N' ? 13 : F === 'S' ? 14 : F === 'W' ? 7 : 11);
      box(vx - 1, vy - 1, vw + 2, vd + 2, 12, 13.4, SAI_VROOF);
      faceSign(vx - 1, vy - 1, vw + 2, vd + 2, F, 13, 'SAI BABA MANDIR', '#b8401a', '#fff4d8');
      // the white tower over the sanctum, gold kalash and saffron flag; corner domes
      const cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2 + (F === 'N' ? 3 : F === 'S' ? -3 : 0);
      for (const [dx, dy] of CORNER4) dome(b[0] + 2 + (dx < 0 ? 3.4 : b[2] - 7.4), b[1] + 2 + (dy < 0 ? 3.4 : b[3] - 7.4), 2.6, 16, 20.5, '#f7f5f0', true, 1.2, '#e8c040');
      box(cx - 9, cy - 9, 18, 18, 16, 20, plainSt('#f4f2ec', '#faf9f5'));
      shikhara(cx, cy, 16, 20, 38, '#f7f5f0', 6);
      flag(cx, cy, 42, 49, '#f08a24', 5.5, 3.6, true);
      // saffron pennants at the gate
      const gx0 = F === 'W' ? fr[0] : F === 'E' ? fr[0] + fr[2] : fr[0] + 2, gy0 = F === 'N' ? fr[1] : F === 'S' ? fr[1] + fr[3] : fr[1] + 2;
      const gx1 = F === 'W' || F === 'E' ? gx0 : fr[0] + fr[2] - 2, gy1 = F === 'N' || F === 'S' ? gy0 : fr[1] + fr[3] - 2;
      flag(gx0, gy0, 0, 15, '#f08a24', 4.5, 2.8, true); flag(gx1, gy1, 0, 15, '#f08a24', 4.5, 2.8, true);
    },
    shadow(lm) { const b = lm._sp ? lm._sp.back : [lm.x - 30, lm.y - 20, 60, 40]; N.draw.castBox(b[0], b[1], b[2], b[3], 18); N.draw.castPole(lm.x, lm.y, 32, 8); },
    lights(lm) { const Ls = lightsOf(lm, 2); pushLight(Ls[0], lm.x, lm.y, 6, 70, '#ffe6b8', 0.65, false); pushLight(Ls[1], lm.x, lm.y, 30, 34, '#fff0d0', 0.6, false); },
    night(lm, a) {
      const b = lm._sp.back, F = lm._sp.F;
      bulbRect(b[0] + 2, b[1] + 2, b[2] - 4, b[3] - 4, 17.8, 3, '#ffd060', '#ff8a30');
      const cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2 + (F === 'N' ? 3 : F === 'S' ? -3 : 0);
      bulbs(cx - 8, cy - 8, 20, cx, cy, 38, 8, '#ffd060', '#ff8a30'); bulbs(cx + 8, cy - 8, 20, cx, cy, 38, 8, '#ffd060', '#ff8a30');
      bulbs(cx - 8, cy + 8, 20, cx, cy, 38, 8, '#ffd060', '#ff8a30'); bulbs(cx + 8, cy + 8, 20, cx, cy, 38, 8, '#ffd060', '#ff8a30');
    },
    ground(g, lm) {
      // flower sellers' mats outside the gate: marigold heaps, jasmine, a chappal stand
      const F = (lm.face || 'n').toUpperCase();
      const ox = lm.x, oy = F === 'N' ? lm.y - lm.d / 2 - 12 : F === 'S' ? lm.y + lm.d / 2 + 12 : lm.y;
      const along = F === 'N' || F === 'S';
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const mx = along ? ox + i * 9 : ox + (F === 'W' ? -12 : 12) - lm.w / 2 * (F === 'W' ? 1 : -1), my = along ? oy : lm.y + i * 9;
        g.fillStyle = '#8a5a3a'; g.fillRect(mx - 3.5, my - 2.5, 7, 5);
        g.fillStyle = i % 2 ? '#f29a1a' : '#f2c230'; g.beginPath(); g.arc(mx - 1.2, my, 1.6, 0, TAU); g.fill();
        g.fillStyle = '#fbf6ea'; g.beginPath(); g.arc(mx + 1.6, my - 0.6, 1.1, 0, TAU); g.fill();
        g.fillStyle = '#d23a2a'; g.fillRect(mx + 1, my + 1, 1.6, 0.8);
      }
      if (along) { g.fillStyle = '#6a4a2a'; g.fillRect(ox - 4, oy + (F === 'N' ? 6 : -8), 8, 2); }
    },
  });

  /* ---------------------------------------------------------------- gurudwara */
  L.register('gurudwara', {
    draw(lm) {
      const x = lm.x, y = lm.y, s = Math.min(lm.w, lm.d) - 10;
      const st = lm._st || (lm._st = { wall: '#f6f4ef', roof: '#eceae4', trim: '#ffffff', dark: '#4a4a52', fac: civicSpec({ floors: 2, win: 'arch', pitch: 5.5, ww: 2.4 }) });
      box(x - s / 2, y - s / 2, s, s, 0, 16, st);
      parapet(x - s / 2, y - s / 2, s, s, 16, 2, { wall: '#f6f4ef', trim: '#ffffff' }, CREST.arch);
      for (const [dx, dy] of CORNER4) chhatri(x + dx * (s / 2 - 3), y + dy * (s / 2 - 3), 4.4, 16, 23, '#f6f4ef', '#e8c860');
      cylV(x, y, s * 0.26, 16, 19, '#f4f2ec', false);
      petals(x, y, s * 0.2, s * 0.32, 19.2, 16, '#f6f2e8');
      dome(x, y, s * 0.28, 19, 19 + s * 0.38, '#f8f6f0', true, 3, '#e8c040');
      ribs(x, y, s * 0.28, 19, 19 + s * 0.38, 8);
      // Nishan Sahib: tall saffron flag in front
      const F = (lm.face || 'n').toUpperCase();
      const fx2 = F === 'E' ? x + lm.w / 2 - 2 : F === 'W' ? x - lm.w / 2 + 2 : x + 12, fy2 = F === 'N' ? y - lm.d / 2 + 2 : F === 'S' ? y + lm.d / 2 - 2 : y + 12;
      flag(fx2, fy2, 0, 40, '#f08a24', 6, 3.6, true);
    },
    shadow(lm) { const s = Math.min(lm.w, lm.d) - 10; N.draw.castBox(lm.x - s / 2, lm.y - s / 2, s, s, 22); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 8, 54, '#fff0d0', 0.7, false); },
  });
  function ribs(x, y, r, h0, h1, n) {
    ctx.beginPath();
    const steps = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      for (let j = 0; j <= steps; j++) {
        const t = j / steps, rr = r * Math.sqrt(Math.max(0, 1 - t * t)) * (1 + 0.25 * Math.sin(t * Math.PI)), h = h0 + (h1 - h0) * t, k = kh(h);
        const X = sxp(x + Math.cos(a) * rr, k), Y = syp(y + Math.sin(a) * rr, k);
        if (j) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
    }
    ctx.strokeStyle = 'rgba(180,160,120,0.45)'; ctx.lineWidth = Math.max(0.5, 0.4 * kh(h0)); ctx.stroke();
  }

  /* ---------------------------------------------------------------- Badshahi Ashurkhana */
  L.register('ashurkhana', {
    draw(lm) {
      const sp = lm._sp || (lm._sp = splitFace(lm, 0.25)), b = sp.back, fr = sp.front, F = sp.F;
      const st = lm._st || (lm._st = {
        wall: '#cfc2a6', roof: '#bfb29a', trim: '#e6dcc6', dark: '#2a2420', acc: '#2a6ab8', acc2: '#2a8c6a', acc3: '#e8b830',
        fac: { N: AK_SIDE, S: AK_SIDE, E: AK_SIDE, W: AK_SIDE },
      });
      st.fac[F] = AK_FRONT;
      box(fr[0], fr[1], fr[2], fr[3], 0, 1, plainSt('#b8ad98', '#cfc6b4'));
      box(b[0], b[1], b[2], b[3], 0, 24, st);
      parapet(b[0], b[1], b[2], b[3], 24, 2.4, { wall: '#cfc2a6', trim: '#e0d6c0' }, CREST.merlon);
      const fx0 = F === 'W' ? b[0] : F === 'E' ? b[0] + b[2] : null;
      const pts = F === 'N' || F === 'S' ? [[b[0] + 2, F === 'N' ? b[1] : b[1] + b[3]], [b[0] + b[2] - 2, F === 'N' ? b[1] : b[1] + b[3]]] : [[fx0, b[1] + 2], [fx0, b[1] + b[3] - 2]];
      for (const p of pts) { cylV(p[0], p[1], 1.8, 0, 30, '#d8ccb2', false); dome(p[0], p[1], 2, 30, 33, '#e0d6c0', true, 1); }
    },
    shadow(lm) { N.draw.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d * 0.75, 24); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 8, 50, '#c8e0ff', 0.6, false); },
  });
  const AK_FRONT = fac((g, L, H) => {
    g.rect('g', 0, 0, L, 1.4);
    g.rect('r', L * 0.14, 0, L * 0.86, H * 0.92);
    g.arch('d', L * 0.22, L * 0.78, 0, H * 0.45, H * 0.85, 1.45, 6);
    // glowing tile mosaic inside the great arch
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) g.rect(['b', 'x', 'a'][(i + j) % 3], L * 0.3 + i * L * 0.068, H * 0.12 + j * H * 0.1, L * 0.3 + i * L * 0.068 + L * 0.05, H * 0.12 + j * H * 0.1 + H * 0.07);
    g.rect('l', 0, H - 1, L, H);
  });
  const AK_SIDE = fac((g, L, H) => { g.rect('g', 0, 0, L, 1.4); g.arcade('r', 2, L - 2, Math.max(2, Math.round(L / 8)), 1, H * 0.5, H * 0.8, 2, 1.45); g.rect('l', 0, H - 1, L, H); });

  /* ---------------------------------------------------------------- Bapu Ghat */
  L.register('memorial', {
    draw(lm) {
      const x = lm.x, y = lm.y;
      box(x - 18, y - 14, 36, 28, 0, 1.6, plainSt('#e6e1d6', '#f2eee6'));
      box(x - 12, y - 9, 24, 18, 1.6, 3, plainSt('#ece8df', '#f8f6f1'));
      prism(ngon(x + 6, y, 2.6, 8, Math.PI / 8), 3, 16, { wall: '#3c3a38', roof: '#55524e' });
      dome(x + 6, y, 1.8, 16, 18.5, '#c9a227', false);
      box(x - 9, y - 2, 4, 4, 3, 8, plainSt('#8e8780', '#a59e96'));
      figure(x - 7, y, 8, 0.7, BRONZE, 0, 3);
    },
    shadow(lm) { N.draw.castPole(lm.x + 6, lm.y, 18, 5); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 8, 40, '#fff0c8', 0.6, false); },
    ground(g, lm) { lawn(g, lm.x, lm.y, 90, 70); },
  });

  /* ---------------------------------------------------------------- Purana Pul arches */
  L.register('puranapul_arches', {
    floor(lm) {
      // pier cutwaters into the river on both sides of the old bridge = its row of arches
      const x0 = lm.x - lm.w / 2, x1 = lm.x + lm.w / 2, y0 = lm.y - lm.d / 2, k = kh(0);
      // dark arch openings under the deck, then the granite cutwaters between them
      ctx.fillStyle = 'rgba(20,30,34,0.45)';
      for (let yy = y0 + 4; yy < y0 + lm.d - 5; yy += 6.8) for (const bx of [x0 - 2.4, x1]) ctx.fillRect(sxp(bx, k), syp(yy + 1.8, k), 2.4 * k, 3.2 * k);
      ctx.beginPath();
      for (let yy = y0 + 4; yy < y0 + lm.d - 2; yy += 6.8) {
        for (const [bx, sg] of [[x0, -1], [x1, 1]]) { ctx.moveTo(sxp(bx, k), syp(yy - 1.8, k)); ctx.lineTo(sxp(bx + sg * 5, k), syp(yy, k)); ctx.lineTo(sxp(bx, k), syp(yy + 1.8, k)); ctx.closePath(); }
      }
      ctx.fillStyle = '#8c8781'; ctx.fill();
      ctx.strokeStyle = 'rgba(40,36,34,0.5)'; ctx.lineWidth = Math.max(0.5, 0.5 * k); ctx.stroke();
    },
    draw(lm) {
      const x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2;
      const st = lm._st || (lm._st = { wall: '#8f8a86', roof: '#a7a19b', trim: '#b6b0a8', dark: '#2e2a28', fac: fac((g, L, H) => { g.arcade('d', 0, L, Math.max(2, Math.round(L / 6.8)), -0.2, H * 0.3, H * 0.8, 1.6, 1); g.rect('l', 0, H - 0.8, L, H); }) });
      box(x0, y0, 3, lm.d, 0, 3.6, st);
      box(x0 + lm.w - 3, y0, 3, lm.d, 0, 3.6, st);
    },
    shadow() { /* low parapets: no cast shadow */ },
  });
  /* ======================================================================== */
  /*        CIVIC IDS THE BRIEF ASKED FOR (places_art.js may override)         */
  /* ======================================================================== */
  /* ---------------------------------------------------------------- Mozamjahi Market */
  // court walls are seen from inside the courtyard: reversed visibility, no roof
  function courtWalls(pts, h0, h1, st) {
    const n = pts.length, sgn = pts._sgn || (pts._sgn = polyArea(pts) > 0 ? 1 : -1);
    const k0 = kh(h0), k1 = kh(h1);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const ex = b[0] - a[0], ey = b[1] - a[1], nx = -ey * sgn, ny = ex * sgn; // inward normal
      if (nx * (CAMX - a[0]) + ny * (CAMY - a[1]) <= 0) continue;
      const nl = Math.hypot(nx, ny) || 1, f = R.shadeNormal(nx / nl, ny / nl);
      ctx.beginPath();
      ctx.moveTo(sxp(a[0], k0), syp(a[1], k0)); ctx.lineTo(sxp(b[0], k0), syp(b[1], k0)); ctx.lineTo(sxp(b[0], k1), syp(b[1], k1)); ctx.lineTo(sxp(a[0], k1), syp(a[1], k1)); ctx.closePath();
      fill(sh(st.wall, f));
      if (st.fac) wallFac(st.fac, b[0], b[1], a[0], a[1], h0, h1, st, f);
    }
  }
  function chamfer(x, y, r, c) { return [[x - r + c, y - r], [x + r - c, y - r], [x + r, y - r + c], [x + r, y + r - c], [x + r - c, y + r], [x - r + c, y + r], [x - r, y + r - c], [x - r, y - r + c]]; }
  const MZ_ARC = fac((g, L, H) => {
    g.rect('g', 0, 0, L, 1.2);
    const n = Math.max(1, Math.round(L / 6));
    for (let i = 0; i < n; i++) {
      const u0 = (i + 0.12) * (L / n), u1 = (i + 0.88) * (L / n);
      g.arch('d', u0, u1, 0, H * 0.45, H * 0.78, 1.45, 4);
      g.rect(i % 3 === 0 ? 'a' : i % 3 === 1 ? 'b' : 'x', u0 + 0.6, H * 0.08, u1 - 0.6, H * 0.3);
    }
    g.rect('l', 0, H * 0.84, L, H * 0.88); g.rect('l', 0, H - 1, L, H);
  });
  const MZ_TOWER = fac((g, L, H) => { g.rect('g', 0, 0, L, 1); g.arch('d', L * 0.22, L * 0.78, 0, H * 0.3, H * 0.46, 1.45, 4); g.rect('l', 0, H * 0.5, L, H * 0.53); g.arch('w', L * 0.28, L * 0.72, H * 0.58, H * 0.78, H * 0.9, 1.45, 4); g.rect('l', 0, H - 1, L, H); });
  const MZ_CLOCK = fac((g, L, H) => { g.circ('l', L / 2, H / 2, Math.min(L, H) * 0.44, 12); g.circ('c', L / 2, H / 2, Math.min(L, H) * 0.36, 12); });
  const MZ_CK_ST = { wall: '#9a958e', roof: '#b0aaa2' };
  L.register('mozamjahi_market', {
    init(lm) {
      const x = lm.x, y = lm.y;
      lm._mz = {
        outer: chamfer(x, y, 34, 11), inner: chamfer(x, y, 20, 7), tower: ngon(x, y, 9, 8, Math.PI / 8),
        st: { wall: '#8f8a86', roof: '#a8a29b', trim: '#b8b1a8', dark: '#2e2a28', base: '#77716c', acc: '#f29a1a', acc2: '#7ab83a', acc3: '#e8d040', fac: MZ_ARC },
        tw: { wall: '#959089', roof: '#aaa49c', trim: '#bdb6ad', dark: '#2e2a28', fac: MZ_TOWER },
        ck: { wall: '#959089', trim: '#c9c2b8' },
      };
    },
    draw(lm) {
      const M = lm._mz, x = lm.x, y = lm.y, H = 12;
      // courtyard: fruit and flower heaps
      plane(0.2, mzCourt, lm);
      courtWalls(M.inner, 0, H, M.st);
      M.st.roof = false;
      prismF(M.outer, 0, H, M.st);
      // ring roof with a crest of merlons along the outer edge
      const k = kh(H);
      ctx.beginPath();
      for (const poly of [M.outer, M.inner]) { for (let i = 0; i < poly.length; i++) { const X = sxp(poly[i][0], k), Y = syp(poly[i][1], k); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); } ctx.closePath(); }
      ctx.fillStyle = '#bdb6ac'; ctx.fill('evenodd');
      const k2 = kh(H + 1.6);
      ctx.beginPath();
      for (let i = 0; i <= M.outer.length; i++) { const q = M.outer[i % M.outer.length]; const X = sxp(q[0], k2), Y = syp(q[1], k2); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
      ctx.setLineDash([1.6 * k2, 1.4 * k2]); ctx.strokeStyle = '#d6cfc4'; ctx.lineWidth = Math.max(1, 1.4 * k2); ctx.stroke(); ctx.setLineDash([]);
      // the octagonal two-storey clock tower with its dome
      prismF(M.tower, 0, 26, M.tw);
      const t = M.tower;
      for (let i = 0; i < 8; i += 2) {
        const a = t[i], b = t[(i + 1) % 8];
        const nx = b[1] - a[1], ny = -(b[0] - a[0]);
        const sg = t._sgn || 1;
        if ((nx * sg) * (CAMX - a[0]) + (ny * sg) * (CAMY - a[1]) <= 0) continue;
        wallFac(MZ_CLOCK, a[0], a[1], b[0], b[1], 26, 32, M.ck, 0.9);
        const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const c = CLOCK_C; c.v = 3; c.r = 1.9;
        clockHands(c, a[0], a[1], (b[0] - a[0]) / L2, (b[1] - a[1]) / L2, 26, L2);
      }
      prismF(ngon(x, y, 8.6, 8, Math.PI / 8), 26, 32, MZ_CK_ST);
      petals(x, y, 6.4, 9.6, 32.2, 8, '#c2bbb1');
      dome(x, y, 7.8, 32, 42, '#b9b2a8', true, 3.4, '#c9a227');
      ribs(x, y, 7.8, 32, 42, 8);
    },
    shadow(lm) { const M = lm._mz; if (!M) return; N.draw.castPoly(M.outer, 12); N.draw.castCircle(lm.x, lm.y, 8, 34); },
    lights(lm) { const Ls = lightsOf(lm, 2); pushLight(Ls[0], lm.x, lm.y, 4, 70, '#ffe0a0', 0.75, false); pushLight(Ls[1], lm.x, lm.y, 26, 30, '#fff6e0', 0.8, false); },
    night(lm, a) { bulbRing(lm.x, lm.y, 9.4, 26.4, 16, '#fff1b8'); glow(lm.x, lm.y, 29, 10, '#fff4d0', 0.35 * a); },
  });
  function mzCourt(g, lm) {
    const M = lm._mz;
    g.fillStyle = '#b9ab90'; g.beginPath(); const p = M.inner; g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); g.fill();
    const cols = ['#f29a1a', '#e8d040', '#7ab83a', '#d8402a', '#f2c230'];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, r = 14.5; g.fillStyle = cols[i % cols.length]; g.beginPath(); g.arc(lm.x + Math.cos(a) * r, lm.y + Math.sin(a) * r, 1.6, 0, TAU); g.fill(); }
  }

  /* ---------------------------------------------------------------- railway stations */
  const RAIL_SIGN = { bg: '#f2c230', fg: '#1a1a1a', edge: '#1a1a1a' };
  // long platform shelters (on pillars) over the station's platform park, split into bays
  function platformsOf(lm) {
    if (lm._plat !== undefined) return lm._plat;
    lm._plat = null;
    const pk = ((N.WORLD_DATA || {}).parks || []).find((p) => p.id === lm.id.replace(/_station$/, '') + '_platforms');
    if (pk) {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (const [px, py] of pk.poly) { a = Math.min(a, px); b = Math.min(b, py); c = Math.max(c, px); d = Math.max(d, py); }
      const w = c - a, h = d - b, along = w >= h, n = along ? Math.max(1, Math.round(w / 60)) : Math.max(1, Math.round(h / 60));
      const bays = [];
      for (let i = 0; i < n; i++) {
        if (along) bays.push([a + 4 + (i * (w - 8)) / n + 1, b + h * 0.2, (w - 8) / n - 2, Math.min(18, h * 0.6)]);
        else bays.push([a + w * 0.2, b + 4 + (i * (h - 8)) / n + 1, Math.min(18, w * 0.6), (h - 8) / n - 2]);
      }
      lm._plat = { bays, along };
    }
    return lm._plat;
  }
  const PLAT_ROOF = { wall: '#7a5a48', roof: '#a8644a', roofFn(g, x, y, w, d) { g.strokeStyle = 'rgba(60,30,20,0.35)'; g.lineWidth = 0.5; g.beginPath(); if (w > d) for (let i = x + 3; i < x + w; i += 3) { g.moveTo(i, y); g.lineTo(i, y + d); } else for (let j = y + 3; j < y + d; j += 3) { g.moveTo(x, j); g.lineTo(x + w, j); } g.stroke(); } };
  function drawPlatforms(lm) {
    const P = platformsOf(lm);
    if (!P) return;
    const vr = R.view;
    for (const b of P.bays) {
      if (b[0] > vr.x1 + 30 || b[0] + b[2] < vr.x0 - 30 || b[1] > vr.y1 + 30 || b[1] + b[3] < vr.y0 - 30) continue;
      const n = Math.max(2, Math.round((P.along ? b[2] : b[3]) / 12));
      for (let i = 0; i <= n; i++) {
        const t = i / n, px = P.along ? b[0] + b[2] * t : b[0] + b[2] / 2, py = P.along ? b[1] + b[3] / 2 : b[1] + b[3] * t;
        pole(px, py, 0, 9, '#4a4a4e', 0.9);
      }
      box(b[0], b[1], b[2], b[3], 9, 10, PLAT_ROOF);
    }
  }
  civicReg('railway_station', (lm) => {
    if (lm.variant === 'kachiguda') return {
      wall: '#e9d29a', trim: '#fff6e0', dark: '#3a2a22', acc: '#a0522d', base: '#b5876a', floors: 2, h: 18, win: 'arch', pitch: 6, inset: 7, chajja: true,
      pav: { w: 22, pro: 4, h: 26, low: 'bigarch', pediment: true }, pedCol: '#b8603a',
      towers: { s: 14, h: 36, cap: 'dome', capCol: '#c8703e', front: true }, crest: 'arch', courts: 0,
      roofExtra(g, x, y, w, d) { g.fillStyle = 'rgba(160,82,45,0.55)'; g.fillRect(x + 2.4, y + 2.4, w - 4.8, 1.6); g.fillRect(x + 2.4, y + d - 4, w - 4.8, 1.6); g.fillRect(x + 2.4, y + 2.4, 1.6, d - 4.8); g.fillRect(x + w - 4, y + 2.4, 1.6, d - 4.8); },
      sign: Object.assign({ text: 'KACHEGUDA' }, RAIL_SIGN), after: drawPlatforms,
    };
    if (lm.variant === 'secunderabad') return {
      wall: '#e8dcc2', trim: '#fbf6ea', dark: '#3a3430', acc: '#b5584a', floors: 2, h: 16, win: 'round', gf: 'arcade', pitch: 6, inset: 3,
      pav: { w: 30, pro: 5, h: 25, low: 'bigarch', crest: 'bal' },
      dome: { r: 6.5, drum: 5, h: 7, col: '#d9c9ae', at: 'pav', finial: 2 },
      towers: { s: 7, h: 22, cap: 'dome', capCol: '#efe4cc', front: true }, crest: 'bal',
      sign: Object.assign({ text: 'SECUNDERABAD' }, RAIL_SIGN), after: drawPlatforms,
    };
    return {
      wall: '#e3c98f', trim: '#fbf3df', dark: '#3e3226', floors: 2, h: 18, win: 'arch', gf: 'arcade', pitch: 6, inset: 3,
      pav: { w: 26, pro: 5, h: 24, low: 'bigarch', crest: 'arch' },
      dome: { r: 7, drum: 3, h: 8.5, col: '#f2e8d0', bulb: true, at: 'pav', finial: 2.4 },
      towers: { s: 6, h: 22, cap: 'dome', capCol: '#f2e8d0' }, crest: 'arch',
      sign: Object.assign({ text: 'HYDERABAD' }, RAIL_SIGN), after: drawPlatforms,
    };
  });

  /* ---------------------------------------------------------------- LB Stadium */
  L.register('lb_stadium', {
    init(lm) {
      const D = N.WORLD_DATA || {};
      const fp = (D.parks || []).find((p) => p.id === 'lb_stadium_field');
      let f = [lm.x - 67, lm.y - 78, 134, 156];
      if (fp) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [px, py] of fp.poly) { a = Math.min(a, px); b = Math.min(b, py); c = Math.max(c, px); d = Math.max(d, py); } f = [a, b, c - a, d - b]; }
      const stands = [];
      for (const s of lm.solids || []) {
        // tiers rise away from the field
        const [x, y, w, d] = s, cx = x + w / 2, cy = y + d / 2;
        let dir;
        if (cy < f[1]) dir = 'N'; else if (cy > f[1] + f[3]) dir = 'S'; else if (cx < f[0]) dir = 'W'; else dir = 'E';
        const tiers = [];
        for (let i = 0; i < 3; i++) {
          const t0 = i / 3, t1 = (i + 1) / 3, h = 6 + i * 6;
          let r;
          if (dir === 'N') r = [x, y + d * (1 - t1), w, d / 3]; else if (dir === 'S') r = [x, y + d * t0, w, d / 3];
          else if (dir === 'W') r = [x + w * (1 - t1), y, w / 3, d]; else r = [x + w * t0, y, w / 3, d];
          tiers.push({ r, h, d: 0 });
        }
        stands.push({ tiers, dir, cx, cy, d: 0, roof: dir === 'E' });
      }
      const x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2;
      lm._lb = { field: f, stands, towers: [[x0 + 8, y0 + 8], [x0 + lm.w - 8, y0 + 8], [x0 + 8, y0 + lm.d - 8], [x0 + lm.w - 8, y0 + lm.d - 8]] };
    },
    draw(lm) {
      const S = lm._lb;
      for (const s of S.stands) s.d = camDist2(s.cx, s.cy);
      S.stands.sort((a, b) => b.d - a.d);
      for (const s of S.stands) {
        for (const t of s.tiers) t.d = camDist2(t.r[0] + t.r[2] / 2, t.r[1] + t.r[3] / 2);
        const ord = s.tiers.slice().sort((a, b) => b.d - a.d);
        for (const t of ord) box(t.r[0], t.r[1], t.r[2], t.r[3], 0, t.h, LB_TIER[(t.h / 6 - 1) | 0]);
        if (s.roof) {
          const o = s.tiers[2].r, m = s.tiers[1].r;
          const rx = Math.min(o[0], m[0]), ry = Math.min(o[1], m[1]), rw = Math.max(o[0] + o[2], m[0] + m[2]) - rx, rd = Math.max(o[1] + o[3], m[1] + m[3]) - ry;
          for (let i = 0; i < 5; i++) pole(rx + rw - 1, ry + 6 + i * ((rd - 12) / 4), 18, 26, '#7a7a7a', 0.8);
          box(rx, ry, rw, rd, 25, 26, LB_ROOF);
        }
      }
      for (const [tx, ty] of S.towers) floodTower(tx, ty, lm.x, lm.y);
    },
    shadow(lm) { const S = lm._lb; if (!S) return; for (const s of S.stands) { const t = s.tiers[2].r; N.draw.castBox(t[0], t[1], t[2], t[3], 18); } for (const [tx, ty] of S.towers) N.draw.castPole(tx, ty, 64, 3); },
    lights(lm) {
      const S = lm._lb; if (!S) return;
      const Ls = lightsOf(lm, 5);
      for (let i = 0; i < 4; i++) pushLight(Ls[i], S.towers[i][0], S.towers[i][1], 64, 34, '#f4f8ff', 1, true);
      pushLight(Ls[4], S.field[0] + S.field[2] / 2, S.field[1] + S.field[3] / 2, 0, 130, '#f0f6ff', 0.95, false);
    },
    night(lm, a) { const S = lm._lb; for (const [tx, ty] of S.towers) glow(tx, ty, 66, 16, '#e8f2ff', 0.6 * a); },
    ground(g, lm) {
      const S = lm._lb || (L.defs.lb_stadium.init(lm), lm._lb), f = S.field;
      const cx = f[0] + f[2] / 2, cy = f[1] + f[3] / 2;
      // mowing stripes, the boundary rope, the 22-yard pitch and the 30-yard circle
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < f[3]; i += 16) g.fillRect(f[0], f[1] + i, f[2], 8);
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(cx, cy, f[2] / 2 - 6, f[3] / 2 - 6, 0, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.8; g.setLineDash([3, 3]);
      g.beginPath(); g.ellipse(cx, cy, f[2] * 0.28, f[3] * 0.24, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#c8ad78'; g.fillRect(cx - 2.6, cy - 11, 5.2, 22);
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(cx - 2.6, cy - 8.6, 5.2, 0.5); g.fillRect(cx - 2.6, cy + 8.1, 5.2, 0.5);
      g.fillStyle = '#5a4a3a'; for (const yy of [cy - 10.4, cy + 9.9]) for (const dx of [-0.6, 0, 0.6]) g.fillRect(cx + dx - 0.15, yy, 0.3, 0.5);
    },
  });
  const LB_TIER = [
    { wall: '#b9b3a8', roof: '#c9c3b8', roofFn: seatRows('#2a6ab8') },
    { wall: '#b3ada2', roof: '#c4beb3', roofFn: seatRows('#d8402a') },
    { wall: '#aca69b', roof: '#bfb9ae', roofFn: seatRows('#e8b830') },
  ];
  const LB_ROOF = { wall: '#9aa0a6', roof: '#b8bec4', walls: false };
  function seatRows(col) {
    return (g, x, y, w, d) => {
      g.strokeStyle = 'rgba(80,75,70,0.4)'; g.lineWidth = 0.5;
      g.beginPath();
      if (w > d) for (let yy = y + 2; yy < y + d; yy += 2.5) { g.moveTo(x, yy); g.lineTo(x + w, yy); }
      else for (let xx = x + 2; xx < x + w; xx += 2.5) { g.moveTo(xx, y); g.lineTo(xx, y + d); }
      g.stroke();
      g.fillStyle = col; g.globalAlpha = 0.35;
      for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6; if (w > d) g.fillRect(x + w * t - 3, y + 1, 6, d - 2); else g.fillRect(x + 1, y + d * t - 3, w - 2, 6); }
      g.globalAlpha = 1;
    };
  }
  function floodTower(x, y, fx, fy) {
    box(x - 1.6, y - 1.6, 3.2, 3.2, 0, 60, FT_ST);
    const k0 = kh(0), k1 = kh(60);
    ctx.beginPath();
    for (let h = 0; h < 58; h += 5) { const ka = kh(h), kb = kh(h + 5); ctx.moveTo(sxp(x - 1.6, ka), syp(y - 1.6, ka)); ctx.lineTo(sxp(x + 1.6, kb), syp(y + 1.6, kb)); }
    ctx.strokeStyle = 'rgba(60,60,64,0.6)'; ctx.lineWidth = Math.max(0.5, 0.4 * k0); ctx.stroke();
    void k1;
    // the lamp bank faces the field
    const a = Math.atan2(fy - y, fx - x), ca = Math.cos(a), sa = Math.sin(a);
    const pts = FT_BANK;
    const hw = 6, hd = 1.2;
    pts[0][0] = x - sa * hw; pts[0][1] = y + ca * hw; pts[1][0] = x + sa * hw; pts[1][1] = y - ca * hw;
    pts[2][0] = pts[1][0] + ca * hd; pts[2][1] = pts[1][1] + sa * hd; pts[3][0] = pts[0][0] + ca * hd; pts[3][1] = pts[0][1] + sa * hd;
    pts._sgn = 0;
    prism(pts, 60, 68, { wall: '#6a6e74', roof: '#8a8e94' });
    const kb = kh(66);
    ctx.fillStyle = NIGHT > 0.3 ? '#fbfdff' : '#d8dde2';
    for (let i = -2; i <= 2; i++) for (let j = 0; j < 2; j++) {
      const px = x - sa * i * 2.2 + ca * (hd + 0.2), py = y + ca * i * 2.2 + sa * (hd + 0.2);
      const kk = kh(61.5 + j * 3);
      ctx.fillRect(sxp(px, kk) - 0.8, syp(py, kk) - 0.8, 1.6, 1.6);
    }
    void kb;
  }
  const FT_ST = { wall: '#8a8e94', roof: '#a4a8ae' }, FT_BANK = [[0, 0], [0, 0], [0, 0], [0, 0]];

  /* ---------------------------------------------------------------- Begumpet airport */
  civicReg('airport_terminal', {
    wall: '#e6e6e2', trim: '#ffffff', dark: '#2f4f5a', win: 'rect', floors: 1, h: 11, pitch: 4, ww: 3.2, inset: 2, litCol: '#d8ecff',
    front: { win: 'rect', pitch: 3.6, ww: 3.2 },
    pav: { w: 44, pro: 0, din: 16, h: 17, low: 'col', crest: 'plain' }, crest: 'plain', crestH: 1.2,
    sign: { text: 'HYDERABAD AIRPORT', bg: '#1d4e8a', fg: '#ffffff', edge: '#0d2a4a', dh: -1 },
    mid(lm, S) {
      // the long canopy along the kerb side
      const F = S.F;
      if (F === 'S') box(S.mx + 6, S.my + S.md, S.mw - 12, 5, 7, 8, AIRP_CAN);
      else if (F === 'N') box(S.mx + 6, S.my - 5, S.mw - 12, 5, 7, 8, AIRP_CAN);
    },
  });
  const AIRP_CAN = { wall: '#c9ccd0', roof: '#e2e4e8' };
  L.register('control_tower', {
    draw(lm) {
      const x = lm.x, y = lm.y;
      box(x - 6, y - 6, 12, 12, 0, 6, plainSt('#e6e6e2', '#f0f0ec'));
      cylV(x, y, 3.6, 6, 40, '#ecebe6', false);
      ring(x, y, 3.7, 20, '#d8402a', 1.2);
      prism(ngon(x, y, 7, 8, Math.PI / 8), 39, 40.5, { wall: '#d8d8d4', roof: '#e8e8e4' });
      prism(ngon(x, y, 6.6, 8, Math.PI / 8), 40.5, 46.5, { wall: '#2f5560', roof: false });
      prism(ngon(x, y, 7.2, 8, Math.PI / 8), 46.5, 48, { wall: '#d8d8d4', roof: '#ececea' });
      pole(x + 2, y, 48, 56, '#5a5a5a', 0.5);
    },
    shadow(lm) { N.draw.castPole(lm.x, lm.y, 48, 7); },
    lights(lm) { pushLight(lightsOf(lm, 1)[0], lm.x, lm.y, 44, 22, '#cfe8ff', 0.8, false); },
    night(lm, a) {
      const k = kh(43.5), X = sxp(lm.x, k), Y = syp(lm.y, k);
      ctx.globalAlpha = a; ctx.strokeStyle = '#bfe8ff'; ctx.lineWidth = Math.max(1, 1.2 * k);
      ctx.beginPath(); ctx.arc(X, Y, 6.6 * k, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      glow(lm.x + 2, lm.y, 56, 4, '#ff3020', (Math.sin(TIME * 2.4) > 0 ? 1 : 0.2) * a);
    },
  });
  /* ======================================================================== */
  /*                           PIGEONS + CLOCK CHIMES                          */
  /* ======================================================================== */
  const flocks = (L.flocks = []);
  function makeFlock(id, cx, cy, n, spots, avoid) {
    const rng = U.rng('pigeons_' + id);
    const birds = [];
    for (let i = 0; i < n; i++) {
      const s = spots[i % spots.length];
      const x = s[0] + (rng.next() - 0.5) * s[2], y = s[1] + (rng.next() - 0.5) * s[2];
      birds.push({ x, y, hx: x, hy: y, h: 0, vx: 0, vy: 0, st: 0, t: rng.next() * 3, a: rng.next() * TAU, ph: rng.next() * TAU, orb: 0, ow: 0, or: 0, col: rng.next() < 0.15 ? 1 : rng.next() < 0.1 ? 2 : 0 });
    }
    flocks.push({ id, cx, cy, birds, cool: 0, spots, avoid: avoid || null, rng });
  }
  function initFlocks() {
    flocks.length = 0;
    const D = N.WORLD_DATA;
    if (!D) return;
    const lmById = {};
    for (const l of D.landmarks || []) lmById[l.id] = l;
    const c = lmById.charminar;
    if (c) {
      const sp = [];
      for (const [dx, dy] of [[-58, -44], [52, -48], [-60, 46], [56, 52], [0, -62], [-64, 2], [64, -4], [8, 62], [-30, -66], [30, 66]]) sp.push([c.x + dx, c.y + dy, 16]);
      makeFlock('charminar', c.x, c.y, 34, sp, [c.x - 34, c.y - 34, 68, 68]);
    }
    const mp = (D.parks || []).find((p) => p.id === 'mecca_masjid_pigeons');
    if (mp) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [px, py] of mp.poly) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      makeFlock('mecca', cx, cy, 30, [[cx - 14, cy - 6, 22], [cx + 12, cy + 4, 22], [cx, cy + 10, 18]]);
    }
    const mm = lmById.mecca_masjid;
    if (mm) makeFlock('mecca_court', mm.x + mm.w / 2 + 24, mm.y - 30, 16, [[mm.x + mm.w / 2 + 20, mm.y - 40, 20], [mm.x + mm.w / 2 + 34, mm.y + 30, 20]]);
    const gh = lmById.gulzar_houz;
    if (gh) makeFlock('gulzar', gh.x, gh.y, 12, [[gh.x - 22, gh.y + 18, 12], [gh.x + 20, gh.y - 20, 12]], [gh.x - 12, gh.y - 12, 24, 24]);
  }
  function scareFlock(f, sx, sy) {
    let n = 0;
    for (const b of f.birds) {
      if (b.st !== 0) continue;
      const d = Math.hypot(b.x - sx, b.y - sy);
      if (d > 70) continue;
      b.st = 1; n++;
      const a = Math.atan2(b.y - sy, b.x - sx) + (f.rng.next() - 0.5) * 0.8;
      const sp = 60 + f.rng.next() * 40;
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.vh = 45 + f.rng.next() * 25;
      b.t = 0; b.or = 50 + f.rng.next() * 60; b.ow = (f.rng.next() < 0.5 ? -1 : 1) * (0.7 + f.rng.next() * 0.5);
      b.orb = Math.atan2(b.y - f.cy, b.x - f.cx); b.ft = 5 + f.rng.next() * 5; b.alt = 30 + f.rng.next() * 50;
    }
    if (n > 3 && f.cool <= 0) {
      f.cool = 4;
      try { if (N.audio && N.audio.sfx) N.audio.sfx('pigeons', { x: f.cx, y: f.cy }); } catch (e) { /* audio optional */ }
    }
  }
  function updateFlocks(dt) {
    const p = N.player;
    if (!p) return;
    const sp = Math.hypot(p.vx || 0, p.vy || 0);
    for (const f of flocks) {
      f.cool -= dt;
      const pd = Math.hypot(p.x - f.cx, p.y - f.cy);
      if (pd > 900) continue;
      // threat: the player close by (running or riding scares from further away)
      const scareR = sp > 90 ? 46 : sp > 30 ? 30 : 16;
      for (const b of f.birds) {
        if (b.st === 0) {
          const d = Math.hypot(b.x - p.x, b.y - p.y);
          if (d < scareR) { scareFlock(f, p.x, p.y); break; }
        }
      }
      for (const b of f.birds) {
        b.ph += dt * (b.st ? 18 : 2 + (b.col * 0.3));
        if (b.st === 0) {
          b.t -= dt;
          if (b.t < 0) { // hop or turn
            b.t = 0.6 + f.rng.next() * 2.5;
            if (f.rng.next() < 0.5) {
              b.a += (f.rng.next() - 0.5) * 2;
              const nx = b.x + Math.cos(b.a) * 3, ny = b.y + Math.sin(b.a) * 3;
              if (Math.hypot(nx - b.hx, ny - b.hy) < 14 && !inAvoid(f, nx, ny)) { b.x = nx; b.y = ny; }
            }
          }
        } else if (b.st === 1) { // take off, then circle the monument
          b.t += dt;
          b.h = Math.min(b.alt, b.h + b.vh * dt);
          b.orb += b.ow * dt * 0.9;
          const tx = f.cx + Math.cos(b.orb) * b.or, ty = f.cy + Math.sin(b.orb) * b.or;
          const blend = Math.min(1, b.t * 0.6);
          const ax = (tx - b.x) * 1.6 * blend, ay = (ty - b.y) * 1.6 * blend;
          b.vx += (ax - b.vx * blend * 0.9) * dt * 2.2; b.vy += (ay - b.vy * blend * 0.9) * dt * 2.2;
          b.x += b.vx * dt; b.y += b.vy * dt;
          b.a = Math.atan2(b.vy, b.vx);
          if (b.t > b.ft) { // land back near home
            const s = f.spots[(f.rng.next() * f.spots.length) | 0];
            b.hx = s[0] + (f.rng.next() - 0.5) * s[2]; b.hy = s[1] + (f.rng.next() - 0.5) * s[2];
            b.st = 2;
          }
        } else { // glide down to the landing spot
          const dx = b.hx - b.x, dy = b.hy - b.y, d = Math.hypot(dx, dy) || 1;
          const v = Math.min(70, d * 2.2 + 8);
          b.vx += (dx / d * v - b.vx) * Math.min(1, dt * 3); b.vy += (dy / d * v - b.vy) * Math.min(1, dt * 3);
          b.x += b.vx * dt; b.y += b.vy * dt;
          b.h = Math.max(0, b.h - dt * Math.max(12, b.h * 1.1) * (d < 30 ? 2 : 0.8));
          b.a = Math.atan2(b.vy, b.vx);
          if (d < 2 && b.h < 0.5 || (b.h <= 0 && d < 6)) { b.st = 0; b.h = 0; b.vx = b.vy = 0; b.t = 1 + f.rng.next() * 2; if (Math.hypot(b.x - p.x, b.y - p.y) < 18) { b.st = 1; b.t = 0; b.ft = 3; b.vh = 40; } }
        }
      }
    }
  }
  function inAvoid(f, x, y) { const a = f.avoid; return a && x > a[0] && x < a[0] + a[2] && y > a[1] && y < a[1] + a[3]; }
  const PCOL = [['#a3a6ad', '#7e828c', '#4d5560'], ['#e4e1da', '#bdb9b1', '#77736e'], ['#9a7f6c', '#76604f', '#4f3c33']];
  function drawFlockGround(f) {
    frame();
    const k = Z;
    for (const b of f.birds) {
      if (b.st !== 0) continue;
      const X = sxp(b.x, k), Y = syp(b.y, k);
      if (X < -4 || Y < -4 || X > R.W + 4 || Y > R.H + 4) continue;
      const c = PCOL[b.col], ca = Math.cos(b.a), sa = Math.sin(b.a);
      const peck = Math.sin(b.ph) > 0.6 ? 0.6 : 0;
      ctx.fillStyle = c[1]; ctx.fillRect(Math.round(X - ca * 1.2 * k) - 1, Math.round(Y - sa * 1.2 * k) - 1, 2, 2);
      ctx.fillStyle = c[0]; ctx.fillRect(Math.round(X) - 1, Math.round(Y) - 1, 2, 2);
      ctx.fillStyle = c[2]; ctx.fillRect(Math.round(X + ca * (1.6 + peck) * k), Math.round(Y + sa * (1.6 + peck) * k), 1, 1);
    }
  }
  function drawFlockSky(f) {
    frame();
    for (const b of f.birds) {
      if (b.st === 0) continue;
      const k = kh(b.h), X = sxp(b.x, k), Y = syp(b.y, k);
      if (X < -8 || Y < -8 || X > R.W + 8 || Y > R.H + 8) continue;
      const c = PCOL[b.col], ca = Math.cos(b.a), sa = Math.sin(b.a);
      const flap = Math.sin(b.ph) * 2.2 * k;
      const wx = -sa, wy = ca;
      ctx.strokeStyle = c[1]; ctx.lineWidth = Math.max(1, 0.9 * k);
      ctx.beginPath();
      ctx.moveTo(X + wx * 3 * k - ca * flap * 0.4, Y + wy * 3 * k - sa * flap * 0.4); ctx.lineTo(X, Y); ctx.lineTo(X - wx * 3 * k - ca * flap * 0.4, Y - wy * 3 * k - sa * flap * 0.4);
      ctx.stroke();
      ctx.fillStyle = c[0]; ctx.fillRect(Math.round(X) - 1, Math.round(Y) - 1, 2, 2);
    }
  }
  function drawFlockShadow(f) {
    frame();
    const s = R.sun;
    ctx.fillStyle = 'rgba(20,15,30,' + (0.25 * s.strength).toFixed(3) + ')';
    for (const b of f.birds) {
      if (b.st === 0 || b.h < 1) continue;
      const X = sxp(b.x + s.sx * b.h, Z), Y = syp(b.y + s.sy * b.h, Z);
      ctx.fillRect(Math.round(X) - 1, Math.round(Y), 3, 1);
    }
  }
  function queueFlocks() {
    if (!N.world || !N.world.built || !N.render.view) return;
    const R2 = N.render, v = R2.view;
    for (const f of flocks) {
      if (f.cx < v.x0 - 260 || f.cx > v.x1 + 260 || f.cy < v.y0 - 260 || f.cy > v.y1 + 260) continue;
      if (!f._g) { f._g = () => drawFlockGround(f); f._s = () => drawFlockSky(f); f._sh = () => drawFlockShadow(f); }
      R2.queue('actors', f.cy - 4000, f._g);
      let flying = false;
      for (const b of f.birds) if (b.st !== 0) { flying = true; break; }
      if (flying) { R2.queue('sky', 0, f._s); if (R2.sun.strength > 0.2) R2.queue('shadow', 0, f._sh); }
    }
  }

  // hourly strikes on the clock towers near the player
  const CLOCKS = ['charminar', 'secunderabad_clock_tower', 'mahboob_chowk_clock_tower', 'mozamjahi_market'];
  let lastHour = -1, clockLms = null;
  function updateChimes() {
    const hr = Math.floor(N.clock.minutes / 60);
    if (lastHour < 0) { lastHour = hr; return; }
    if (hr === lastHour) return;
    lastHour = hr;
    if (!clockLms) { clockLms = []; for (const l of (N.WORLD_DATA && N.WORLD_DATA.landmarks) || []) if (CLOCKS.indexOf(l.id) >= 0) clockLms.push(l); }
    const p = N.player;
    for (const l of clockLms) {
      if (Math.hypot(p.x - l.x, p.y - l.y) > 380) continue;
      const n = hr % 12 || 12;
      try { if (N.audio && N.audio.sfx) for (let i = 0; i < n; i++) N.audio.sfx('gong', { x: l.x, y: l.y, delay: i * 1.5, vol: 0.7 }); } catch (e) { /* audio optional */ }
      N.emit('landmarks:chime', { id: l.id, hour: hr });
    }
  }

  N.addSystem({
    id: 'landmarks', order: 42, runIn: ['play', 'dialogue', 'cutscene', 'minigame', 'title'],
    init() { initFlocks(); },
    reset() { initFlocks(); lastHour = -1; },
    update(dt) { if (!flocks.length && N.world && N.world.built) initFlocks(); updateFlocks(dt); updateChimes(); },
    draw() { queueFlocks(); },
  });

  /* ======================================================================== */
  L.kit = {
    frame, kh, box, prism, cyl, dome, cone, pyramid, gable, petals, ring, disc, pole, flag, parapet, ngon,
    fac, archPts, bulbs, bulbRing, bulbRect, glow, faceEmit, plane, clockHands, lightsOf, pushLight, chhatri, cylV, hip, prismF, wallFac,
    civicSpec, civicReg, shikhara, gopuram, flutes, CREST,
  };
})();
