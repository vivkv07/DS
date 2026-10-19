/* NOSTALGIA — render.js
 * Integer-scaled pixel canvas, camera (follow + look-ahead + speed zoom), GTA2-style
 * pseudo-3D projection, layer queue, LRU ground-chunk cache, N.draw helpers with
 * back-face culling and sun shading, day colour grade, night lighting, shake, VHS FX.
 * Contract: ARCHITECTURE.md §6.
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;

  const LAYERS = ['ground', 'shadow', 'actors', 'structures', 'sky', 'light', 'fx'];
  const CH = 256;          // chunk size in world units (= px at zoom 1)
  const MAX_CHUNKS = 64;   // LRU cap (256 KB each): visible + prefetch ring + look-ahead

  const R = (N.render = {
    canvas: null, ctx: null,
    W: 640, H: 360, scale: 1, dpr: 1,
    PERSP: 0.0032,
    cam: { x: 4000, y: 3000, zoom: 1 },
    baseZoom: 1,             // multiplied into the follow zoom (e.g. portrait tweak)
    follow: null,            // entity to follow (default: player or player's vehicle)
    camOverride: null,       // {x, y, zoom, snap?} for cutscenes / title attract mode
    view: { x0: 0, y0: 0, x1: 0, y1: 0 },
    lights: [],              // per-frame: {x, y, r, color, intensity, h?}
    fx: { vhs: 0, flash: 0, fade: 0, fadeColor: '#000000', grade: true },
    sun: { dx: 0.6, dy: 0.2, sx: -0.6, sy: -0.2, elev: 0.5, strength: 1 },
    stats: { chunkBuilds: 0, queued: 0, ms: {} }, // ms: last frame's cost per flush phase
    LAYERS, CH,
  });

  // Frame projection values (hot path, kept in closure vars)
  let cx = 320, cy = 180, camX = 0, camY = 0, Z = 1;
  let shakeAmt = 0, shakeT = 0, shakeDur = 1, shakeX = 0, shakeY = 0;

  /* ------------------------------------------------------------- canvas */
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    return c;
  }
  R.makeCanvas = makeCanvas;

  // The canvas is PAD internal pixels larger than the viewport on every side and is shifted
  // by the camera's sub-pixel remainder (rounded to device pixels) each frame, so scrolling and
  // the followed vehicle move smoothly even though the camera itself is snapped to the
  // internal pixel grid (which keeps the cached ground crisp). See setupFrame / applySubpixel.
  const PAD = 1;
  R.PAD = PAD;
  function resize() {
    const c = R.canvas; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
    const pw = Math.round(vw * dpr), ph = Math.round(vh * dpr);
    const scale = Math.max(1, Math.round(Math.min(pw, ph) / 400));
    const W = Math.ceil(pw / scale) + PAD * 2, H = Math.ceil(ph / scale) + PAD * 2;
    R.dpr = dpr; R.scale = scale;
    if (W !== R.W || H !== R.H || c.width !== W || c.height !== H) {
      R.W = W; R.H = H;
      c.width = W; c.height = H;
      if (lightCanvas) { lightCanvas.width = Math.ceil(W / LIGHT_DIV); lightCanvas.height = Math.ceil(H / LIGHT_DIV); }
    }
    c.style.width = (W * scale) / dpr + 'px';
    c.style.height = (H * scale) / dpr + 'px';
    c.style.left = (-PAD * scale) / dpr + 'px';
    c.style.top = (-PAD * scale) / dpr + 'px';
    subpx.x = subpx.y = NaN; // force a transform refresh
    R.ctx.imageSmoothingEnabled = false;
    R.baseZoom = 1; // (portrait already shows ~844 u vertically; no extra zoom-out)
    N.emit('render:resize', { W, H, scale });
  }
  // Sub-pixel camera remainder, applied as a CSS translate in whole device pixels.
  const subpx = { x: 0, y: 0 };
  R.subpx = subpx;
  function applySubpixel(fx, fy) {
    const c = R.canvas; if (!c) return;
    const dev = R.scale; // device pixels per internal pixel
    const tx = Math.round(-fx * dev), ty = Math.round(-fy * dev);
    if (tx === subpx.x && ty === subpx.y) return;
    subpx.x = tx; subpx.y = ty;
    c.style.transform = tx || ty ? 'translate3d(' + tx / R.dpr + 'px,' + ty / R.dpr + 'px,0)' : '';
  }

  /* ------------------------------------------------------------- camera */
  const camState = { lookX: 0, lookY: 0, zoom: 1, inited: false };

  function followEntity() {
    if (R.follow) return R.follow;
    const p = N.player;
    if (!p) return null;
    return p.vehicle || p;
  }

  function updateCamera(dt) {
    const cam = R.cam;
    const o = R.camOverride;
    // never let a bad value (NaN from a broken script / entity) poison the camera for good
    if (!isFinite(cam.x) || !isFinite(cam.y)) { const e = followEntity(); cam.x = e && isFinite(e.x) ? e.x : N.WORLD_W / 2; cam.y = e && isFinite(e.y) ? e.y : N.WORLD_H / 2; camState.inited = false; }
    if (!(cam.zoom > 0.05) || !isFinite(cam.zoom)) cam.zoom = 1;
    if (!isFinite(camState.lookX) || !isFinite(camState.lookY)) camState.lookX = camState.lookY = 0;
    if (o && !(isFinite(o.x) && isFinite(o.y))) { /* ignore a broken override this frame */ } else if (o) {
      const rate = o.snap ? 1 : 1 - Math.exp(-dt * (o.rate || 3));
      cam.x += (o.x - cam.x) * rate; cam.y += (o.y - cam.y) * rate;
      if (o.zoom) cam.zoom += (o.zoom - cam.zoom) * rate;
      camState.inited = true;
    } else {
      const e = followEntity();
      if (e && isFinite(e.x) && isFinite(e.y)) {
        const vx = isFinite(e.vx) ? e.vx : 0, vy = isFinite(e.vy) ? e.vy : 0;
        const speed = Math.hypot(vx, vy);
        // look-ahead in velocity direction, smoothed slowly so it doesn't swing
        let lx = vx * 0.5, ly = vy * 0.5;
        const lm = Math.hypot(lx, ly), maxL = 110;
        if (lm > maxL) { lx *= maxL / lm; ly *= maxL / lm; }
        const la = 1 - Math.exp(-dt * 2.2);
        camState.lookX += (lx - camState.lookX) * la;
        camState.lookY += (ly - camState.lookY) * la;
        const tx = e.x + camState.lookX, ty = e.y + camState.lookY;
        if (!camState.inited) { cam.x = tx; cam.y = ty; camState.inited = true; }
        const f = 1 - Math.exp(-dt * 9);
        cam.x += (tx - cam.x) * f; cam.y += (ty - cam.y) * f;
        // zoom out with speed: 1.0 on foot -> ~0.78 at top car speed
        const zt = U.lerp(1, 0.78, U.smooth((speed - 60) / (170 - 60))) * R.baseZoom;
        cam.zoom += (zt - cam.zoom) * (1 - Math.exp(-dt * 1.6));
      }
    }
    if (shakeT > 0) {
      shakeT -= dt;
      const a = shakeAmt * Math.max(0, shakeT / shakeDur);
      shakeX = (Math.random() * 2 - 1) * a; shakeY = (Math.random() * 2 - 1) * a;
    } else { shakeX = shakeY = 0; }
  }
  R.snapCamera = function () { camState.inited = false; camState.lookX = camState.lookY = 0; updateCamera(0.016); };
  R.shake = function (amount, time) {
    if (document.body.classList.contains('reduced-motion')) amount *= 0.3;
    shakeAmt = Math.max(shakeAmt * Math.max(0, shakeT / shakeDur), amount || 3);
    shakeDur = shakeT = Math.max(0.05, time || 0.3);
  };

  /* --------------------------------------------------------- projection */
  function setupFrame() {
    const W = R.W, H = R.H;
    Z = Math.max(0.2, R.cam.zoom);
    cx = W / 2; cy = H / 2;
    // snap camera to the pixel grid so the cached ground never shimmers; the remainder is
    // applied as a whole-device-pixel CSS shift of the (padded) canvas (applySubpixel)
    const rx = (R.cam.x + shakeX) * Z, ry = (R.cam.y + shakeY) * Z;
    camX = Math.round(rx) / Z;
    camY = Math.round(ry) / Z;
    applySubpixel(rx - Math.round(rx), ry - Math.round(ry));
    const v = R.view;
    v.x0 = camX - cx / Z; v.x1 = camX + cx / Z;
    v.y0 = camY - cy / Z; v.y1 = camY + cy / Z;
    R.camX = camX; R.camY = camY; R.Z = Z;
  }

  R.proj = function (x, y, h) {
    const k = Z * (1 + (h || 0) * R.PERSP);
    return { x: cx + (x - camX) * k, y: cy + (y - camY) * k, k };
  };
  // allocation-free helpers for hot loops
  R.k = (h) => Z * (1 + h * R.PERSP);
  R.sx = (x, k) => cx + (x - camX) * k;
  R.sy = (y, k) => cy + (y - camY) * k;
  R.screenToWorld = function (sx, sy) { return { x: camX + (sx - cx) / Z, y: camY + (sy - cy) / Z }; };
  // CSS pixel (clientX/Y) -> world (ground plane)
  R.clientToWorld = function (clientX, clientY) {
    const r = R.canvas.getBoundingClientRect();
    return R.screenToWorld(((clientX - r.left) / r.width) * R.W, ((clientY - r.top) / r.height) * R.H);
  };
  R.inView = function (x, y, margin) {
    const m = margin || 0, v = R.view;
    return x >= v.x0 - m && x <= v.x1 + m && y >= v.y0 - m && y <= v.y1 + m;
  };
  R.rectInView = function (x, y, w, h, margin) {
    const m = margin || 0, v = R.view;
    return x + w >= v.x0 - m && x <= v.x1 + m && y + h >= v.y0 - m && y <= v.y1 + m;
  };

  /* -------------------------------------------------------------- queue */
  const queues = {};
  for (const l of LAYERS) queues[l] = [];
  let qSeq = 0;
  R.queue = function (layer, sortKey, fn) {
    const q = queues[layer];
    if (!q) { N.err('render.queue', new Error('unknown layer ' + layer)); return; }
    q.push({ k: sortKey || 0, i: qSeq++, fn });
  };
  const byKey = (a, b) => a.k - b.k || a.i - b.i;
  const now = () => performance.now();
  function runLayer(layer) {
    const q = queues[layer];
    if (!q.length) { R.stats.ms[layer] = 0; return; }
    const t0 = now();
    if (layer !== 'ground' && layer !== 'light' && layer !== 'fx') q.sort(byKey);
    else q.sort(byKey);
    const ctx = R.ctx;
    for (let i = 0; i < q.length; i++) {
      try { q[i].fn(ctx); } catch (e) { N.err('draw:' + layer, e); }
      // guard against helpers leaving a transform/alpha behind
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    R.stats.queued += q.length;
    q.length = 0;
    R.stats.ms[layer] = now() - t0;
  }
  // structures sort key helper: farthest from camera first
  R.distKey = (x, y) => -((x - camX) * (x - camX) + (y - camY) * (y - camY));

  /* ------------------------------------------------------- chunk cache */
  let groundPainter = null;
  const chunks = new Map(); // key -> canvas (Map order = LRU order)
  const chunkEpoch = new Map(); // key -> shadow epoch the chunk was painted with
  const pool = [];
  R.shadowEpoch = 0; // bumps when the (quantised) sun changes; stale chunks repaint progressively
  R.setGroundPainter = function (fn) { groundPainter = fn; R.invalidateChunks(); };
  R.invalidateChunks = function (rect) {
    if (!rect) { for (const c of chunks.values()) pool.push(c); chunks.clear(); return; }
    const [x, y, w, h] = rect;
    for (const key of Array.from(chunks.keys())) {
      const i = key % 1000, j = Math.floor(key / 1000);
      if (i * CH < x + w && i * CH + CH > x && j * CH < y + h && j * CH + CH > y) { pool.push(chunks.get(key)); chunks.delete(key); }
    }
  };
  function buildChunk(i, j) {
    const key = j * 1000 + i;
    let c;
    if (chunks.has(key)) { c = chunks.get(key); chunks.delete(key); }
    else if (chunks.size >= MAX_CHUNKS) {
      const oldest = chunks.keys().next().value;
      c = chunks.get(oldest); chunks.delete(oldest); chunkEpoch.delete(oldest);
    } else c = pool.pop() || makeCanvas(CH, CH);
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#6b5a48'; g.fillRect(0, 0, CH, CH);
    if (groundPainter) {
      g.save();
      g.translate(-i * CH, -j * CH); // painter draws in world coordinates
      try { groundPainter(g, i * CH, j * CH, CH, CH); } catch (e) { N.err('groundPainter', e); }
      g.restore();
    }
    chunks.set(key, c);
    chunkEpoch.set(key, R.shadowEpoch);
    R.stats.chunkBuilds++;
    return c;
  }
  function getChunk(i, j, allowBuild) {
    const key = j * 1000 + i;
    const c = chunks.get(key);
    if (c) { chunks.delete(key); chunks.set(key, c); return c; }
    return allowBuild ? buildChunk(i, j) : null;
  }
  R.chunkCount = () => chunks.size;
  // Pre-build chunks around a point (boot / teleport) so there is no pop-in.
  R.warmChunks = function (x, y, radius) {
    const r = radius || 600;
    const i0 = Math.max(0, Math.floor((x - r) / CH)), i1 = Math.min(Math.ceil(N.WORLD_W / CH) - 1, Math.floor((x + r) / CH));
    const j0 = Math.max(0, Math.floor((y - r) / CH)), j1 = Math.min(Math.ceil(N.WORLD_H / CH) - 1, Math.floor((y + r) / CH));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) getChunk(i, j, true);
  };

  // Ground chunks: visible ones missing from the cache are built nearest-first within a time
  // budget (at least one per frame); spare budget repaints one chunk baked with an old sun, or
  // prefetches one chunk ahead of the camera's travel, so driving fast never stalls a frame on
  // a burst of chunk builds.
  const BUILD_MS = 2.5;
  const visList = [];
  let prefetchTick = 0;
  function drawGround(ctx) {
    const v = R.view;
    const maxI = Math.ceil(N.WORLD_W / CH) - 1, maxJ = Math.ceil(N.WORLD_H / CH) - 1;
    const i0 = Math.max(0, Math.floor(v.x0 / CH)), i1 = Math.min(maxI, Math.floor(v.x1 / CH));
    const j0 = Math.max(0, Math.floor(v.y0 / CH)), j1 = Math.min(maxJ, Math.floor(v.y1 / CH));
    visList.length = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = (i + 0.5) * CH - camX, dy = (j + 0.5) * CH - camY;
      visList.push(Math.floor(dx * dx + dy * dy) * 4096 + j * 64 + i); // packed: distance, then index
    }
    visList.sort((a, b) => a - b);
    const t0 = now();
    let built = 0, missing = 0, staleDone = false;
    ctx.imageSmoothingEnabled = Z < 0.97;
    for (let n = 0; n < visList.length; n++) {
      const code = visList[n] % 4096, i = code % 64, j = (code - i) / 64;
      let c = getChunk(i, j, false);
      if (!c) {
        if (built === 0 || now() - t0 < BUILD_MS) { c = buildChunk(i, j); built++; } else missing++;
      } else if (!staleDone && !built && chunkEpoch.get(j * 1000 + i) !== R.shadowEpoch) {
        c = buildChunk(i, j); staleDone = true; // the sun moved: refresh baked shadows, one per frame
      }
      const x0 = Math.round(cx + (i * CH - camX) * Z), x1 = Math.round(cx + ((i + 1) * CH - camX) * Z);
      const y0 = Math.round(cy + (j * CH - camY) * Z), y1 = Math.round(cy + ((j + 1) * CH - camY) * Z);
      if (c) ctx.drawImage(c, x0, y0, x1 - x0, y1 - y0);
      else { ctx.fillStyle = '#6b5a48'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
    }
    ctx.imageSmoothingEnabled = false;
    if (missing || built || staleDone || now() - t0 > BUILD_MS || (++prefetchTick % 3)) return;
    // prefetch: the nearest uncached chunk in the view grown by half a chunk plus ~1 s of travel
    const e = followEntity();
    const lead = Math.min(1, 380 / Math.max(1, Math.hypot((e && e.vx) || 0, (e && e.vy) || 0)));
    const ax = e && isFinite(e.vx) ? e.vx * lead : 0, ay = e && isFinite(e.vy) ? e.vy * lead : 0;
    const px0 = Math.min(v.x0, v.x0 + ax) - CH / 2, px1 = Math.max(v.x1, v.x1 + ax) + CH / 2;
    const py0 = Math.min(v.y0, v.y0 + ay) - CH / 2, py1 = Math.max(v.y1, v.y1 + ay) + CH / 2;
    const fx = camX + ax, fy = camY + ay;
    let best = -1, bd = Infinity;
    for (let j = Math.max(0, Math.floor(py0 / CH)); j <= Math.min(maxJ, Math.floor(py1 / CH)); j++) {
      for (let i = Math.max(0, Math.floor(px0 / CH)); i <= Math.min(maxI, Math.floor(px1 / CH)); i++) {
        if (chunks.has(j * 1000 + i)) continue;
        const dx = (i + 0.5) * CH - fx, dy = (j + 0.5) * CH - fy, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = j * 1000 + i; }
      }
    }
    if (best >= 0) { buildChunk(best % 1000, Math.floor(best / 1000)); R.stats.prefetched = (R.stats.prefetched || 0) + 1; }
  }

  /* --------------------------------------------------------------- sun */
  function updateSun() {
    const m = N.clock.minutes;
    const t = U.clamp((m - 360) / 720, 0, 1); // 0 at 06:00 (east) -> 1 at 18:00 (west)
    const a = Math.PI * t;
    let dx = Math.cos(a), dy = 0.55 * Math.sin(a) + 0.15;
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    const elev = U.lerp(0.14, 1.05, Math.sin(Math.PI * t)); // radians
    const day = N.clock.light();
    const s = R.sun;
    if (day < 0.08) { dx = 0.5; dy = 0.7; } // moonlight: soft fixed direction
    s.dx = dx; s.dy = dy; s.elev = elev;
    // Shadows use a quantised sun so they can be baked into ground chunks (see shadowEpoch)
    const len = Math.round(Math.min(2.0, 1 / Math.tan(Math.max(0.2, elev))) * 12) / 12;
    const az = Math.round(Math.atan2(dy, dx) / 0.045) * 0.045;
    const strength = Math.round(U.clamp(day * 1.4, 0.15, 1) * 10) / 10;
    const key = az * 1e4 + len * 100 + strength;
    if (key !== s.key) { s.key = key; R.shadowEpoch++; }
    s.sx = -Math.cos(az) * len; s.sy = -Math.sin(az) * len; // shadow offset per unit height
    s.strength = strength;
    faceShade.N = shadeFor(0, -1); faceShade.S = shadeFor(0, 1);
    faceShade.E = shadeFor(1, 0); faceShade.W = shadeFor(-1, 0);
    faceShade.roof = 1;
  }
  const faceShade = { N: 0.6, S: 0.85, E: 0.7, W: 0.8, roof: 1 };
  function shadeFor(nx, ny) {
    const d = nx * R.sun.dx + ny * R.sun.dy; // -1..1
    return U.clamp(0.66 + 0.3 * d * R.sun.strength, 0.42, 0.98);
  }
  R.faceShade = faceShade;
  R.shadeNormal = shadeFor;

  // colour shading cache: shaded(hex, f) quantised to 1/32
  const shadeCache = new Map();
  function shaded(hex, f) {
    if (f === 1 || typeof hex !== 'string' || hex[0] !== '#') return hex;
    let arr = shadeCache.get(hex);
    if (!arr) { arr = new Array(41); shadeCache.set(hex, arr); }
    const q = Math.max(0, Math.min(40, Math.round(f * 32)));
    return arr[q] || (arr[q] = U.shade(hex, q / 32));
  }
  R.shaded = shaded;

  /* ------------------------------------------------------- draw helpers */
  const D = (N.draw = {});

  function quad(ctx, x0, y0, x1, y1, x2, y2, x3, y3) {
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
  }
  // Adds a vertical rectangle (ground segment (x0,y0)-(x1,y1), heights h0..h1) to the current path.
  D.quadPath = function (ctx, x0, y0, x1, y1, h0, h1) {
    const k0 = Z * (1 + h0 * R.PERSP), k1 = Z * (1 + h1 * R.PERSP);
    quad(ctx,
      cx + (x0 - camX) * k0, cy + (y0 - camY) * k0,
      cx + (x1 - camX) * k0, cy + (y1 - camY) * k0,
      cx + (x1 - camX) * k1, cy + (y1 - camY) * k1,
      cx + (x0 - camX) * k1, cy + (y0 - camY) * k1);
  };
  // Adds a horizontal rect at height h to the current path
  D.rectPath = function (ctx, x, y, w, d, h) {
    const k = Z * (1 + (h || 0) * R.PERSP);
    ctx.rect(cx + (x - camX) * k, cy + (y - camY) * k, w * k, d * k);
  };

  const WALLKEY = { N: 'wallN', S: 'wallS', W: 'wallW', E: 'wallE' };
  function wallColor(st, face) {
    const own = st[WALLKEY[face] || 'wall' + face];
    if (own) return own;
    return shaded(st.wall || '#c9b99a', faceShade[face]);
  }

  // Which walls of an axis-aligned box face the camera: returns bitmask N=1,S=2,W=4,E=8
  D.visibleWalls = function (x, y, w, d) {
    return (camY < y ? 1 : 0) | (camY > y + d ? 2 : 0) | (camX < x ? 4 : 0) | (camX > x + w ? 8 : 0);
  };

  /** Extruded axis-aligned box. style: {roof, wall, wallN/S/E/W, outline, roofFn(ctx,k,x,y,w,d), wallFn(ctx,face,...)} */
  D.box = function (x, y, w, d, h0, h1, st) {
    st = st || {};
    const ctx = R.ctx;
    const k0 = Z * (1 + h0 * R.PERSP), k1 = Z * (1 + h1 * R.PERSP);
    const ax0 = cx + (x - camX) * k0, ax1 = cx + (x + w - camX) * k0;
    const ay0 = cy + (y - camY) * k0, ay1 = cy + (y + d - camY) * k0;
    const bx0 = cx + (x - camX) * k1, bx1 = cx + (x + w - camX) * k1;
    const by0 = cy + (y - camY) * k1, by1 = cy + (y + d - camY) * k1;
    if (h1 - h0 > 0.01) {
      if (camY < y) { ctx.beginPath(); quad(ctx, ax0, ay0, ax1, ay0, bx1, by0, bx0, by0); ctx.fillStyle = wallColor(st, 'N'); ctx.fill(); if (st.wallFn) st.wallFn(ctx, 'N', x, y, w, d, h0, h1); }
      if (camY > y + d) { ctx.beginPath(); quad(ctx, ax0, ay1, ax1, ay1, bx1, by1, bx0, by1); ctx.fillStyle = wallColor(st, 'S'); ctx.fill(); if (st.wallFn) st.wallFn(ctx, 'S', x, y, w, d, h0, h1); }
      if (camX < x) { ctx.beginPath(); quad(ctx, ax0, ay0, ax0, ay1, bx0, by1, bx0, by0); ctx.fillStyle = wallColor(st, 'W'); ctx.fill(); if (st.wallFn) st.wallFn(ctx, 'W', x, y, w, d, h0, h1); }
      if (camX > x + w) { ctx.beginPath(); quad(ctx, ax1, ay0, ax1, ay1, bx1, by1, bx1, by0); ctx.fillStyle = wallColor(st, 'E'); ctx.fill(); if (st.wallFn) st.wallFn(ctx, 'E', x, y, w, d, h0, h1); }
    }
    if (st.roof !== false) {
      ctx.fillStyle = st.roof || '#d8cbb0';
      ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
      if (st.roofFn) {
        ctx.save();
        ctx.setTransform(k1, 0, 0, k1, cx - camX * k1, cy - camY * k1);
        try { st.roofFn(ctx, k1, x, y, w, d, h1); } finally { ctx.restore(); }
      }
      if (st.outline) {
        ctx.strokeStyle = st.outline; ctx.lineWidth = st.outlineW || 1;
        ctx.strokeRect(bx0 + 0.5, by0 + 0.5, bx1 - bx0 - 1, by1 - by0 - 1);
      }
    }
  };

  function polyArea(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    return a / 2;
  }
  /** Extruded polygon (points [[x,y],...]). Walls back-face culled, farthest first, roof last. */
  D.poly = function (pts, h0, h1, st) {
    st = st || {};
    const ctx = R.ctx;
    const n = pts.length; if (n < 3) return;
    const k0 = Z * (1 + h0 * R.PERSP), k1 = Z * (1 + h1 * R.PERSP);
    const sgn = polyArea(pts) > 0 ? 1 : -1;
    if (h1 - h0 > 0.01) {
      const walls = [];
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const ex = b[0] - a[0], ey = b[1] - a[1];
        const nx = ey * sgn, ny = -ex * sgn; // outward normal
        if (nx * (camX - a[0]) + ny * (camY - a[1]) <= 0) continue;
        const mx = (a[0] + b[0]) / 2 - camX, my = (a[1] + b[1]) / 2 - camY;
        const nl = Math.hypot(nx, ny) || 1;
        walls.push([mx * mx + my * my, a, b, shadeFor(nx / nl, ny / nl)]);
      }
      walls.sort((p, q) => q[0] - p[0]);
      for (const [, a, b, f] of walls) {
        ctx.beginPath();
        quad(ctx,
          cx + (a[0] - camX) * k0, cy + (a[1] - camY) * k0, cx + (b[0] - camX) * k0, cy + (b[1] - camY) * k0,
          cx + (b[0] - camX) * k1, cy + (b[1] - camY) * k1, cx + (a[0] - camX) * k1, cy + (a[1] - camY) * k1);
        ctx.fillStyle = st.wallFlat ? st.wall : shaded(st.wall || '#c9b99a', f);
        ctx.fill();
        if (st.edge) { ctx.strokeStyle = st.edge; ctx.lineWidth = 0.6; ctx.stroke(); }
      }
    }
    if (st.roof !== false) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const X = cx + (pts[i][0] - camX) * k1, Y = cy + (pts[i][1] - camY) * k1;
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
      ctx.closePath();
      ctx.fillStyle = st.roof || '#d8cbb0'; ctx.fill();
      if (st.outline) { ctx.strokeStyle = st.outline; ctx.lineWidth = 1; ctx.stroke(); }
      if (st.roofFn) {
        ctx.save();
        ctx.setTransform(k1, 0, 0, k1, cx - camX * k1, cy - camY * k1);
        try { st.roofFn(ctx, k1, h1); } finally { ctx.restore(); }
      }
    }
  };

  /** Cylinder: hull of base and top circles, shaded towards the sun, top disc. */
  D.cyl = function (x, y, r, h0, h1, st) {
    st = st || {};
    const ctx = R.ctx;
    const k0 = Z * (1 + h0 * R.PERSP), k1 = Z * (1 + h1 * R.PERSP);
    const bx = cx + (x - camX) * k0, by = cy + (y - camY) * k0, rb = r * k0;
    const tx = cx + (x - camX) * k1, ty = cy + (y - camY) * k1, rt = r * k1;
    const dx = tx - bx, dy = ty - by, L = Math.hypot(dx, dy);
    const wall = st.wall || '#c9b99a';
    if (L > Math.abs(rt - rb) + 0.01 && h1 - h0 > 0.01) {
      const th = Math.atan2(dy, dx), al = Math.acos(U.clamp((rb - rt) / L, -1, 1));
      ctx.beginPath();
      ctx.arc(bx, by, rb, th + al, th - al + Math.PI * 2);
      ctx.arc(tx, ty, rt, th - al, th + al);
      ctx.closePath();
      if (st.grad === false) ctx.fillStyle = shaded(wall, 0.72);
      else {
        // light comes from the sun direction across the cylinder
        const sx = R.sun.dx, sy = R.sun.dy, mx = (bx + tx) / 2, my = (by + ty) / 2, rr = (rb + rt) / 2;
        const g = ctx.createLinearGradient(mx + sx * rr, my + sy * rr, mx - sx * rr, my - sy * rr);
        g.addColorStop(0, shaded(wall, 0.98)); g.addColorStop(0.55, shaded(wall, 0.74)); g.addColorStop(1, shaded(wall, 0.5));
        ctx.fillStyle = g;
      }
      ctx.fill();
      if (st.bands) { // horizontal rings (e.g. minaret balconies)
        ctx.strokeStyle = st.bandColor || shaded(wall, 0.55); ctx.lineWidth = Math.max(1, k0);
        for (const bh of st.bands) {
          const kb = Z * (1 + bh * R.PERSP);
          ctx.beginPath(); ctx.arc(cx + (x - camX) * kb, cy + (y - camY) * kb, r * kb, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    if (st.top !== false) {
      ctx.beginPath(); ctx.arc(tx, ty, rt, 0, Math.PI * 2);
      ctx.fillStyle = st.roof || st.top || shaded(wall, 1.08); ctx.fill();
      if (st.outline) { ctx.strokeStyle = st.outline; ctx.lineWidth = 1; ctx.stroke(); }
    }
  };

  /** Dome: stacked rings from h0 to hTop, lighter towards the top and the sun. */
  D.dome = function (x, y, r, h0, hTop, st) {
    st = st || {};
    const ctx = R.ctx;
    const col = st.fill || st.wall || '#e8d9b5';
    const steps = st.steps || Math.max(4, Math.min(10, Math.round(r / 2.5)));
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const rr = r * Math.sqrt(Math.max(0, 1 - s * s)) * (st.bulb ? 1 + 0.25 * Math.sin(s * Math.PI) : 1);
      if (rr <= 0.05 && i < steps) continue;
      const h = h0 + (hTop - h0) * s;
      const k = Z * (1 + h * R.PERSP);
      // shift highlight towards the sun as we go up
      const off = rr * 0.18 * s;
      ctx.beginPath();
      ctx.arc(cx + (x - camX) * k + R.sun.dx * off * k, cy + (y - camY) * k + R.sun.dy * off * k, Math.max(0.6, rr * k), 0, Math.PI * 2);
      ctx.fillStyle = shaded(col, 0.62 + 0.42 * s);
      ctx.fill();
    }
    if (st.finial) {
      const k = Z * (1 + (hTop + st.finial) * R.PERSP), kb = Z * (1 + hTop * R.PERSP);
      ctx.strokeStyle = st.finialColor || '#c9a227'; ctx.lineWidth = Math.max(1, kb * 0.8);
      ctx.beginPath(); ctx.moveTo(cx + (x - camX) * kb, cy + (y - camY) * kb); ctx.lineTo(cx + (x - camX) * k, cy + (y - camY) * k); ctx.stroke();
    }
  };

  D.disc = function (x, y, r, h, fill) {
    const ctx = R.ctx, k = Z * (1 + (h || 0) * R.PERSP);
    ctx.beginPath(); ctx.arc(cx + (x - camX) * k, cy + (y - camY) * k, Math.max(0.5, r * k), 0, Math.PI * 2);
    ctx.fillStyle = fill || '#000'; ctx.fill();
  };

  /** Draw in world coordinates on a horizontal plane at height h (affine). */
  D.plane = function (h, fn) {
    const ctx = R.ctx, k = Z * (1 + (h || 0) * R.PERSP);
    ctx.save();
    ctx.setTransform(k, 0, 0, k, cx - camX * k, cy - camY * k);
    try { fn(ctx, k); } finally { ctx.restore(); }
  };
  D.flat = function (fn) { D.plane(0, fn); };

  /** Top-down sprite: fn(ctx) draws in local units centred at origin facing +x. */
  D.sprite = function (x, y, angle, h, fn) {
    const ctx = R.ctx, k = Z * (1 + (h || 0) * R.PERSP);
    const c = Math.cos(angle || 0) * k, s = Math.sin(angle || 0) * k;
    ctx.save();
    ctx.setTransform(c, s, -s, c, cx + (x - camX) * k, cy + (y - camY) * k);
    try { fn(ctx, k); } finally { ctx.restore(); }
  };

  const fontCache = new Map();
  /** Upright text at a projected point. style: {size, font, color, align, baseline, outline, bg, pad} */
  D.text = function (x, y, h, str, st) {
    st = st || {};
    const ctx = R.ctx, k = Z * (1 + (h || 0) * R.PERSP);
    const size = Math.max(4, Math.round((st.size || 8) * (st.fixed ? 1 : k)));
    const fam = st.font || "'VT323', 'Courier New', monospace";
    const key = size + '|' + fam + '|' + (st.weight || '');
    let f = fontCache.get(key);
    if (!f) { f = (st.weight ? st.weight + ' ' : '') + size + 'px ' + fam; fontCache.set(key, f); }
    ctx.font = f;
    ctx.textAlign = st.align || 'center';
    ctx.textBaseline = st.baseline || 'middle';
    const X = Math.round(cx + (x - camX) * k), Y = Math.round(cy + (y - camY) * k);
    if (st.bg) {
      const w = ctx.measureText(str).width, p = st.pad == null ? 2 : st.pad;
      ctx.fillStyle = st.bg;
      const bx = st.align === 'left' ? X - p : st.align === 'right' ? X - w - p : X - w / 2 - p;
      ctx.fillRect(Math.round(bx), Math.round(Y - size / 2 - p / 2), Math.round(w + p * 2), Math.round(size + p));
    }
    if (st.outline) { ctx.lineWidth = st.outlineW || 2; ctx.strokeStyle = st.outline; ctx.lineJoin = 'round'; ctx.strokeText(str, X, Y); }
    ctx.fillStyle = st.color || '#fff';
    ctx.fillText(str, X, Y);
  };

  /* ---------------------------------------------- 3x5 pixel font (signs) */
  // Crisp at the internal resolution; used for in-world shop signs and hoardings.
  const GLYPHS = {
    A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
    D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
    G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
    J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
    M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
    P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
    S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
    V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
    Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
    0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
    3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
    6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
    9: ['###', '#.#', '###', '..#', '##.'], ' ': ['..', '..', '..', '..', '..'], '.': ['.', '.', '.', '.', '#'],
    '-': ['...', '...', '###', '...', '...'], '/': ['..#', '..#', '.#.', '#..', '#..'], "'": ['#', '#', '.', '.', '.'],
    '!': ['#', '#', '#', '.', '#'], '&': ['.#.', '#.#', '.#.', '#.#', '.##'], ':': ['.', '#', '.', '#', '.'], '+': ['...', '.#.', '###', '.#.', '...'],
  };
  const ptCache = new Map();
  D.pixelTextWidth = function (str) {
    let w = 0;
    for (const ch of String(str).toUpperCase()) { const g = GLYPHS[ch] || GLYPHS[' ']; w += g[0].length + 1; }
    return Math.max(0, w - 1);
  };
  /** Returns a cached canvas with str rendered in the 3x5 pixel font (with optional 1px shadow). */
  D.pixelTextCanvas = function (str, color, shadow) {
    str = String(str).toUpperCase();
    const key = str + '|' + color + '|' + (shadow || '');
    let c = ptCache.get(key);
    if (c) return c;
    const w = D.pixelTextWidth(str) + (shadow ? 1 : 0), h = 5 + (shadow ? 1 : 0);
    c = makeCanvas(Math.max(1, w), h);
    const g = c.getContext('2d');
    const paint = (ox, oy, col) => {
      g.fillStyle = col;
      let x = ox;
      for (const ch of str) {
        const gl = GLYPHS[ch] || GLYPHS[' '];
        for (let r = 0; r < 5; r++) for (let q = 0; q < gl[r].length; q++) if (gl[r][q] === '#') g.fillRect(x + q, oy + r, 1, 1);
        x += gl[0].length + 1;
      }
    };
    if (shadow) paint(1, 1, shadow);
    paint(0, 0, color);
    if (ptCache.size > 600) ptCache.clear();
    ptCache.set(key, c);
    return c;
  };
  /** Draw pixel text centred at a projected world point (screen-aligned, integer pixels). */
  // opts: {scale, shadow, rot: 1 (90deg clockwise) | -1 (counter-clockwise)}
  D.pixelText = function (x, y, h, str, color, opts) {
    const ctx = R.ctx, k = Z * (1 + (h || 0) * R.PERSP);
    const c = D.pixelTextCanvas(str, color || '#fff', opts && opts.shadow);
    const s = (opts && opts.scale) || 1;
    const X = Math.round(cx + (x - camX) * k), Y = Math.round(cy + (y - camY) * k);
    if (opts && opts.rot) {
      const r = opts.rot > 0 ? 1 : -1;
      ctx.setTransform(0, r, -r, 0, X, Y);
      ctx.drawImage(c, -Math.round((c.width * s) / 2), -Math.round((c.height * s) / 2), c.width * s, c.height * s);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }
    ctx.drawImage(c, X - Math.round((c.width * s) / 2), Y - Math.round((c.height * s) / 2), c.width * s, c.height * s);
  };

  /** Soft contact shadow under an object (rounded rect rotated by angle). Enqueue on 'shadow'. */
  D.shadow = function (x, y, w, d, angle, h) {
    const ctx = R.ctx, s = R.sun;
    const lift = (h == null ? 3 : h);
    const ox = s.sx * lift, oy = s.sy * lift;
    const c = Math.cos(angle || 0) * Z, sn = Math.sin(angle || 0) * Z;
    ctx.save();
    ctx.setTransform(c, sn, -sn, c, cx + (x + ox - camX) * Z, cy + (y + oy - camY) * Z);
    ctx.globalAlpha = 0.32 * s.strength + 0.08;
    ctx.fillStyle = '#1a1020';
    const r = Math.min(w, d) * 0.45;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-w / 2, -d / 2, w, d, r); else ctx.rect(-w / 2, -d / 2, w, d);
    ctx.fill();
    ctx.restore();
  };

  /* ---------------------------------------- batched cast shadows (buildings) */
  // world.js / landmarks add footprints during enqueue; drawn as ONE fill so overlaps
  // don't double-darken. Drawn at the start of the 'shadow' layer.
  let castPath = null, castCount = 0;
  function castBegin() { castPath = new Path2D(); castCount = 0; }
  function hullPath(pts) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
    for (let i = 0; i < hull.length; i++) {
      const X = cx + (hull[i][0] - camX) * Z, Y = cy + (hull[i][1] - camY) * Z;
      if (i) castPath.lineTo(X, Y); else castPath.moveTo(X, Y);
    }
    castPath.closePath();
    castCount++;
  }
  /** Cast shadow of an axis-aligned box of height h (allocation-free hexagon, clockwise). */
  D.castBox = function (x, y, w, d, h) {
    const sx = R.sun.sx * h * Z, sy = R.sun.sy * h * Z;
    const X0 = cx + (x - camX) * Z, X1 = X0 + w * Z, Y0 = cy + (y - camY) * Z, Y1 = Y0 + d * Z;
    const p = castPath;
    if (sx >= 0 && sy >= 0) { p.moveTo(X0, Y0); p.lineTo(X1, Y0); p.lineTo(X1 + sx, Y0 + sy); p.lineTo(X1 + sx, Y1 + sy); p.lineTo(X0 + sx, Y1 + sy); p.lineTo(X0, Y1); }
    else if (sx < 0 && sy >= 0) { p.moveTo(X0, Y0); p.lineTo(X1, Y0); p.lineTo(X1, Y1); p.lineTo(X1 + sx, Y1 + sy); p.lineTo(X0 + sx, Y1 + sy); p.lineTo(X0 + sx, Y0 + sy); }
    else if (sx < 0) { p.moveTo(X1, Y0); p.lineTo(X1, Y1); p.lineTo(X0, Y1); p.lineTo(X0 + sx, Y1 + sy); p.lineTo(X0 + sx, Y0 + sy); p.lineTo(X1 + sx, Y0 + sy); }
    else { p.moveTo(X1, Y1); p.lineTo(X0, Y1); p.lineTo(X0, Y0); p.lineTo(X0 + sx, Y0 + sy); p.lineTo(X1 + sx, Y0 + sy); p.lineTo(X1 + sx, Y1 + sy); }
    p.closePath();
    castCount++;
  };
  /** Cast shadow of an extruded convex polygon of height h. */
  D.castPoly = function (pts, h) {
    const sx = R.sun.sx * h, sy = R.sun.sy * h;
    const all = [];
    for (const q of pts) { all.push([q[0], q[1]]); all.push([q[0] + sx, q[1] + sy]); }
    hullPath(all);
  };
  /** Cast shadow of a round thing (tree canopy, dome) of radius r at height h. */
  D.castCircle = function (x, y, r, h) {
    const X = cx + (x + R.sun.sx * h - camX) * Z, Y = cy + (y + R.sun.sy * h - camY) * Z;
    castPath.moveTo(X + r * Z, Y);
    castPath.arc(X, Y, r * Z, 0, Math.PI * 2);
    castPath.closePath();
    castCount++;
  };
  /** Cast shadow of a thin pole (lamp post, trunk) of height h. */
  D.castPole = function (x, y, h, w) {
    const ex = R.sun.sx * h, ey = R.sun.sy * h, l = Math.hypot(ex, ey) || 1;
    const nx = (-ey / l) * (w || 1.5) * 0.5, ny = (ex / l) * (w || 1.5) * 0.5;
    // order chosen so the quad winds clockwise like the other shadow shapes
    const flip = ex * ny - ey * nx > 0 ? 1 : -1;
    const P = (px, py) => [cx + (px - camX) * Z, cy + (py - camY) * Z];
    const a = P(x + nx * flip, y + ny * flip), b = P(x + ex + nx * flip, y + ey + ny * flip), c = P(x + ex - nx * flip, y + ey - ny * flip), d = P(x - nx * flip, y - ny * flip);
    castPath.moveTo(a[0], a[1]); castPath.lineTo(b[0], b[1]); castPath.lineTo(c[0], c[1]); castPath.lineTo(d[0], d[1]); castPath.closePath();
    castCount++;
  };

  function drawCastShadows(ctx) {
    if (!castCount) return;
    ctx.globalAlpha = 0.30 * R.sun.strength + 0.04;
    ctx.fillStyle = '#20142a';
    ctx.fill(castPath);
    ctx.globalAlpha = 1;
  }

  /* ----------------------------------------------- grade, night, effects */
  // The night darkness mask is soft, so it is painted at 1/LIGHT_DIV resolution and upscaled.
  const LIGHT_DIV = 4;
  let lightCanvas = null, lightCtx = null;
  const blobCache = new Map();
  function blob(color) {
    let c = blobCache.get(color);
    if (c) return c;
    c = makeCanvas(64, 64);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (color === 'mask') {
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      const [r, gg, b] = U.hexToRgb(color);
      gr.addColorStop(0, 'rgba(' + r + ',' + gg + ',' + b + ',0.55)');
      gr.addColorStop(0.4, 'rgba(' + r + ',' + gg + ',' + b + ',0.22)');
      gr.addColorStop(1, 'rgba(' + r + ',' + gg + ',' + b + ',0)');
    }
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    blobCache.set(color, c);
    return c;
  }

  // Colour grade by time of day: [minute, color, alpha]
  const GRADE = [
    [0, '#1a2a6a', 0.0], [300, '#2a2a6a', 0.0], [345, '#ff7aa8', 0.16], [420, '#ffc9a0', 0.10], [540, '#fff4e0', 0.03],
    [720, '#ffffff', 0.0], [930, '#ffe0a0', 0.05], [1020, '#ffb050', 0.11], [1090, '#ff8040', 0.15], [1140, '#c05a80', 0.13],
    [1200, '#2a3a8a', 0.0], [1440, '#1a2a6a', 0.0],
  ];
  function gradeAt(m) {
    for (let i = 1; i < GRADE.length; i++) {
      if (m <= GRADE[i][0]) {
        const a = GRADE[i - 1], b = GRADE[i], t = (m - a[0]) / (b[0] - a[0]);
        return [U.mix(a[1], b[1], t), U.lerp(a[2], b[2], t)];
      }
    }
    return ['#ffffff', 0];
  }

  function drawGradeAndNight(ctx) {
    const W = R.W, H = R.H;
    const light = N.clock.light();
    if (R.fx.grade) {
      const [col, a] = gradeAt(N.clock.minutes);
      if (a > 0.005) {
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = Math.min(1, a * 2.4);
        ctx.fillStyle = col; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a * 0.35;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }
    const night = U.clamp((0.6 - light) / 0.52, 0, 1);
    R.night = night;
    if (night <= 0.01) { R.lights.length = 0; return; }
    if (!lightCanvas) { lightCanvas = makeCanvas(Math.ceil(W / LIGHT_DIV), Math.ceil(H / LIGHT_DIV)); lightCtx = lightCanvas.getContext('2d'); }
    const lc = lightCtx, LW = lightCanvas.width, LH = lightCanvas.height;
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, LW, LH);
    lc.fillStyle = 'rgba(10,16,52,' + (0.76 * night).toFixed(3) + ')';
    lc.fillRect(0, 0, LW, LH);
    lc.globalCompositeOperation = 'destination-out';
    const mask = blob('mask');
    const lights = R.lights;
    for (let i = 0; i < lights.length; i++) {
      const L = lights[i];
      const k = Z * (1 + (L.h || 0) * R.PERSP);
      const X = (cx + (L.x - camX) * k) / LIGHT_DIV, Y = (cy + (L.y - camY) * k) / LIGHT_DIV, rr = (L.r || 40) * k / LIGHT_DIV;
      if (X + rr < 0 || Y + rr < 0 || X - rr > LW || Y - rr > LH) continue;
      lc.globalAlpha = U.clamp(L.intensity == null ? 1 : L.intensity, 0, 1);
      lc.drawImage(mask, X - rr, Y - rr, rr * 2, rr * 2);
    }
    lc.globalAlpha = 1;
    lc.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lightCanvas, 0, 0, LW * LIGHT_DIV, LH * LIGHT_DIV);
    ctx.imageSmoothingEnabled = false;
    // coloured additive glow (sodium vapour orange etc.)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < lights.length; i++) {
      const L = lights[i];
      if (L.glow === false) continue;
      const k = Z * (1 + (L.h || 0) * R.PERSP);
      const X = cx + (L.x - camX) * k, Y = cy + (L.y - camY) * k, rr = (L.r || 40) * k * 0.8;
      if (X + rr < 0 || Y + rr < 0 || X - rr > W || Y - rr > H) continue;
      ctx.globalAlpha = night * 0.7 * U.clamp(L.intensity == null ? 1 : L.intensity, 0, 1);
      ctx.drawImage(blob(L.color || '#ffb050'), X - rr, Y - rr, rr * 2, rr * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    lights.length = 0;
  }

  // VHS: scanlines + rolling tracking band + chroma offset
  let vhsA = null, vhsB = null, scanPat = null, noiseCanvas = null;
  function drawVHS(ctx, amt) {
    const W = R.W, H = R.H, t = performance.now() / 1000;
    if (!vhsA || vhsA.width !== W || vhsA.height !== H) { vhsA = makeCanvas(W, H); vhsB = makeCanvas(W, H); }
    const a = vhsA.getContext('2d'), b = vhsB.getContext('2d');
    // chroma split: red channel shifted right, green+blue shifted left
    a.globalCompositeOperation = 'source-over'; a.drawImage(R.canvas, 0, 0);
    a.globalCompositeOperation = 'multiply'; a.fillStyle = '#ff0000'; a.fillRect(0, 0, W, H);
    b.globalCompositeOperation = 'source-over'; b.drawImage(R.canvas, 0, 0);
    b.globalCompositeOperation = 'multiply'; b.fillStyle = '#00ffff'; b.fillRect(0, 0, W, H);
    const off = Math.max(1, Math.round(2 * amt));
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(vhsB, -off * 0.5, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(vhsA, off, 0);
    ctx.globalCompositeOperation = 'source-over';
    // wobble: a few horizontally displaced slices
    const band = ((t * 0.18) % 1.3) * H - H * 0.15;
    for (let y = Math.max(0, band | 0); y < Math.min(H, band + 18 * amt); y += 3) {
      ctx.drawImage(R.canvas, 0, y, W, 3, Math.sin(y * 0.7 + t * 30) * 4 * amt, y, W, 3);
    }
    // tracking noise band
    if (!noiseCanvas) {
      noiseCanvas = makeCanvas(128, 32);
      const g = noiseCanvas.getContext('2d'), id = g.createImageData(128, 32);
      for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() < 0.5 ? 255 : 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = Math.random() * 200; }
      g.putImageData(id, 0, 0);
    }
    ctx.globalAlpha = 0.35 * amt;
    ctx.drawImage(noiseCanvas, (Math.random() * 64) | 0, (Math.random() * 16) | 0, 64, 8, 0, band, W, 10 + 6 * amt);
    ctx.globalAlpha = 1;
    // scanlines
    if (!scanPat) {
      const s = makeCanvas(2, 3), g = s.getContext('2d');
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 2, 2, 1);
      scanPat = ctx.createPattern(s, 'repeat');
    }
    ctx.globalAlpha = Math.min(1, amt * 1.2);
    ctx.fillStyle = scanPat; ctx.fillRect(0, 0, W, H);
    // slight desaturating wash + vignette tint
    ctx.globalAlpha = 0.08 * amt; ctx.fillStyle = '#3040a0'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function drawScreenFX(ctx, dt) {
    const fx = R.fx, W = R.W, H = R.H;
    if (fx.vhs > 0.01) { try { drawVHS(ctx, Math.min(1, fx.vhs)); } catch (e) { N.err('vhs', e); } }
    if (fx.flash > 0.01) {
      ctx.globalAlpha = Math.min(1, fx.flash); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      fx.flash = Math.max(0, fx.flash - dt * 3);
    }
    if (fx.fade > 0.001) {
      ctx.globalAlpha = Math.min(1, fx.fade); ctx.fillStyle = fx.fadeColor || '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
  }

  /* -------------------------------------------------------------- frame */
  R.begin = function () {
    setupFrame();
    updateSun();
    castBegin();
    R.stats.queued = 0;
  };

  R.flush = function (dt) {
    const ctx = R.ctx, W = R.W, H = R.H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#1b1420'; ctx.fillRect(0, 0, W, H);
    const ms = R.stats.ms;
    let t0 = now();
    try { drawGround(ctx); } catch (e) { N.err('drawGround', e); }
    ms.chunks = now() - t0;
    runLayer('ground');
    t0 = now();
    try { drawCastShadows(ctx); } catch (e) { N.err('castShadows', e); }
    ms.cast = now() - t0;
    runLayer('shadow');
    runLayer('actors');
    runLayer('structures');
    runLayer('sky');
    t0 = now();
    try { drawGradeAndNight(ctx); } catch (e) { N.err('night', e); }
    ms.night = now() - t0;
    runLayer('light');
    runLayer('fx');
    t0 = now();
    drawScreenFX(ctx, dt || 0.016);
    ms.screenfx = now() - t0;
  };

  /* --------------------------------------------------------------- init */
  R.init = function () {
    let c = document.getElementById('game');
    if (!c) { c = document.createElement('canvas'); c.id = 'game'; document.body.prepend(c); }
    R.canvas = c;
    R.ctx = c.getContext('2d', { alpha: false });
    resize();
    let pending = false;
    const onResize = () => {
      if (pending) return; pending = true;
      requestAnimationFrame(() => { pending = false; resize(); });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    R.resize = resize;
  };

  N.addSystem({ id: 'camera', order: 60, runIn: ['*'], update: updateCamera });
})();
