/* NOSTALGIA — view3d.js (3D engine lead) — ARCHITECTURE §20 "3D view mode"
 *
 * A GTA-5-style 3D renderer + camera over the SAME simulation (world, player, vehicles, traffic,
 * missions, dialogue, HUD and saves are untouched). Views: 'top' (the 2D renderer), 'tps' (third
 * person orbit / chase camera) and 'fps' (first person: an 11-year-old's eye height, bike handlebar
 * / cockpit in vehicles). three.js r149 is loaded lazily the first time 3D is chosen.
 *
 * Public API (full contract in ARCHITECTURE §20):
 *   N.view   {mode, want, available, loading, error, yaw, pitch, set(mode), cycle(), is3D(), label()}
 *            emits 'view:change' {mode, prev}; persisted in localStorage 'nostalgia.view.v1'.
 *   N.view3d {ready, active, THREE, H (helpers), VS, CHUNK, quality, registerLandmark(drawId, build,
 *            opts), registerActorRenderer(key, spec), registerStructure(t, build), registerLayer(id,
 *            spec), beginFrame(dt) / render(dt) (main.js), project(x, y, h), elevation(e),
 *            heightAt(x, y), setQuality(o), settle(ms), stats(), rebuild(rect)}
 *
 * Hooks into modules this file does not own (installed from here; nothing else is edited):
 *  - N.render.queue: dropped while 3D renders (systems still run draw() for the HUD minimap and the
 *    dialogue barks, but their 2D layer items would never be flushed).
 *  - N.render.proj / screenToWorld / clientToWorld: 3D projection while 3D is on (barks follow actors).
 *  - N.render.view: set each 3D frame to a square around the player sized to the 3D near range, so
 *    R.inView / R.rectInView (despawn / hop / culling logic) keep "near the player" semantics.
 *  - N.render.night, N.render.lights (drained) and N.render.fx.flash (decayed) are maintained in 3D
 *    because render.flush() (which normally does it) does not run.
 *  - N.render.invalidateChunks: wrapped to mark 3D ground tiles dirty (places_art variant changes).
 *  - Ground textures are painted by render.js's own composed chunk painter (world.js + world_extras
 *    rails + places_art decor + landmarks.paintGround): for one synchronous call per 256u quadrant,
 *    HTMLCanvasElement.prototype.getContext hands render.js's buildChunk our high-res context, then
 *    the stolen render chunk is invalidated again (render.js repaints it on demand in top view).
 *  - main.js (owned) calls N.view3d.beginFrame/render instead of the 2D world draw when 3D is on;
 *    input.js (owned) rotates N.input.move by N.view.yaw and collects look input.
 * Coordinates: three (x, y, z) = world (x, height, y); +x east, +z south, +y up; 1 unit = 1 world
 * unit. A model facing world angle a (0 = east) gets rotation.y = -a. Static world heights are scaled
 * by VS (data storey 10u -> 15u in 3D) so people (kids ~7u, adults ~9u) read at the right size.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;
  const now = () => performance.now();

  /* ================================================================ constants */
  const VS = 1.5;              // vertical scale of static world heights (storey 10u -> 15u)
  const FLOOR_H = 10 * VS;     // one storey in 3D units (window rows)
  const CH = 512;              // 3D chunk size = 2 x 2 render.js ground chunks
  const RCH = 256;             // render.js chunk size
  const AUX = 128;             // aux texture size per chunk (4u per texel = N.CELL)
  const LS_KEY = 'nostalgia.view.v1';
  const LIB = ['https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', 'vendor/three/three.min.js', '../vendor/three/three.min.js'];
  const MODES = ['top', 'tps', 'fps'];
  const LABEL = { top: 'Top-down', tps: '3D (third person)', fps: 'First person' };
  const SHORT = { top: '2D', tps: '3D', fps: 'FPS' };

  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) { /* storage off: fine */ } };
  const toast = (t, ms) => { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2600); } catch (e) { /* ignore */ } };
  const reducedMotion = () => document.body.classList.contains('reduced-motion');

  /* ================================================================ N.view */
  const view = (N.view = {
    MODES, LABEL,
    mode: 'top',            // effective view (3D only once the engine is ready)
    want: 'top',            // requested view
    available: null,        // null = not tried, true = 3D works, false = failed (error says why)
    loading: false,
    error: null,
    yaw: -Math.PI / 2,      // camera forward as a world angle (0 = east, +PI/2 = south)
    pitch: 0.3,             // camera pitch (positive = looking down)
    urls: LIB.slice(),      // three.js sources, tried in order
    noPointerLock: false,   // tests / settings: never capture the mouse on click
    is3D() { return view.mode !== 'top'; },
    label(m) { return LABEL[m || view.mode] || LABEL.top; },
    shortLabel(m) { return SHORT[m || view.want] || '3D'; },
    /** Switch view: 'top' | 'tps' | 'fps'. 3D loads three.js on first use (top-down meanwhile). */
    set(mode, opts) {
      opts = opts || {};
      if (MODES.indexOf(mode) < 0) mode = 'top';
      view.want = mode;
      if (!opts.noSave) lsSet(LS_KEY, mode);
      updateViewButton();
      if (mode === 'top') { applyMode('top'); return true; }
      if (E.ready && !E.lost) { applyMode(mode); return true; }
      if (view.available === false && !opts.retry) {
        toast('3D view unavailable: ' + (view.error || 'no WebGL') + '. Staying top-down.');
        view.want = 'top'; updateViewButton();
        return false;
      }
      startEngine(opts);
      return true;
    },
    /** top -> 3D -> first person -> top */
    cycle() {
      const i = MODES.indexOf(view.loading ? view.want : view.mode);
      const next = MODES[(i + 1) % MODES.length];
      const ok = view.set(next);
      if (ok && !view.loading) toast('View: ' + LABEL[view.mode] + (N.input && N.input.device === 'keyboard' ? '  (V to change)' : ''), 1800);
      return view.want;
    },
  });

  function updateViewButton() {
    try { if (N.input && N.input.setLabel) N.input.setLabel('view', SHORT[MODES[(MODES.indexOf(view.want) + 1) % 3]]); } catch (e) { /* ignore */ }
  }

  /* ================================================================ engine state */
  const E = {
    T: null, ready: false, lost: false, failCount: 0, warming: false, warmT: 0,
    renderer: null, scene: null, camera: null, canvas: null, fxEl: null,
    city: null, lmGroup: null, actorGroup: null, layerGroup: null,
    lastFrame: 0, jsMs: 0, jsAvg: 0, calls: 0, tris: 0, frames: 0,
  };
  let THREE = null;

  /* ================================================================ quality */
  const Q = {
    tier: 'high', pixelRatio: 1, maxPixelRatio: 1.5, minPixelRatio: 0.75,
    shadows: true, shadowSize: 2048, shadowRange: 190,
    drawDist: 1500, nearDist: 600, actorDist: 620, lmDist: 1650,
    groundHi: 2, groundLo: 0.5, pointLights: 4, budgetMs: 3.5, antialias: true,
    adaptive: true, baked: false,
  };
  function detectTier() {
    let coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) { /* ignore */ }
    const small = Math.min(window.innerWidth, window.innerHeight) < 820;
    const cores = navigator.hardwareConcurrency || 4;
    if ((coarse && small) || (coarse && cores <= 4)) return 'low';
    return 'high';
  }
  function applyTier(t) {
    const dpr = window.devicePixelRatio || 1;
    Q.tier = t;
    if (t === 'low') {
      Object.assign(Q, { maxPixelRatio: Math.min(dpr, 1.25), minPixelRatio: 0.7, shadows: false, shadowSize: 1024, drawDist: 950, nearDist: 380, actorDist: 400, lmDist: 1100, groundHi: 1, groundLo: 0.5, pointLights: 0, budgetMs: 2.5, antialias: false, baked: true });
    } else {
      Object.assign(Q, { maxPixelRatio: Math.min(dpr, 1.5), minPixelRatio: 0.75, shadows: true, shadowSize: 2048, drawDist: 1500, nearDist: 600, actorDist: 620, lmDist: 1650, groundHi: 2, groundLo: 0.5, pointLights: 4, budgetMs: 3.5, antialias: true, baked: false });
    }
    Q.pixelRatio = Q.maxPixelRatio;
  }
  applyTier(detectTier());

  /* ================================================================ loader */
  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return false;
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext(); // free the probe context right away
      return true;
    } catch (e) { return false; }
  }
  function loadScript(url, timeout) {
    return new Promise((resolve) => {
      let done = false;
      const fin = (ok) => { if (!done) { done = true; resolve(ok); } };
      const s = document.createElement('script');
      s.src = url; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = () => fin(!!(window.THREE && window.THREE.WebGLRenderer));
      s.onerror = () => { s.remove(); fin(false); };
      setTimeout(() => fin(!!(window.THREE && window.THREE.WebGLRenderer)), timeout || 9000);
      document.head.appendChild(s);
    });
  }
  let loadPromise = null;
  function loadThree() {
    if (window.THREE && window.THREE.WebGLRenderer) return Promise.resolve(window.THREE);
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      for (const u of view.urls) {
        if (await loadScript(u, /^https?:/.test(u) ? 9000 : 6000)) return window.THREE;
      }
      return null;
    })();
    return loadPromise;
  }

  async function startEngine(opts) {
    if (view.loading || E.ready) return;
    view.loading = true; view.error = null;
    toast('Loading 3D view…', 1600);
    let T = null;
    try {
      if (!hasWebGL()) throw new Error('WebGL is not available on this device');
      T = await loadThree();
      if (!T) throw new Error('could not load the 3D library');
      initEngine(T);
      view.available = true;
      E.warming = true; E.warmT = now();
    } catch (e) {
      view.loading = false; view.available = false;
      view.error = String((e && e.message) || e);
      view.want = 'top'; updateViewButton();
      if (!(opts && opts.silent)) toast('3D view unavailable: ' + view.error + '. Staying top-down.', 3600);
      try { lsSet(LS_KEY, 'top'); } catch (er) { /* ignore */ }
      N.emit('view:error', { error: view.error });
      if (E.renderer) { try { E.renderer.dispose(); } catch (er) { /* ignore */ } }
      return;
    }
  }
  // called from the update loop while warming: the near city is built before the view switches
  function warmStep() {
    if (!E.warming) return;
    const f = focus();
    updateWork(f.x, f.y, 22);
    const done = nearReady(f.x, f.y);
    if (done || now() - E.warmT > 7000) {
      E.warming = false; view.loading = false;
      if (view.want !== 'top') applyMode(view.want);
      N.emit('view:ready', {});
    }
  }

  function applyMode(m) {
    const prev = view.mode;
    if (m !== 'top' && !(E.ready && !E.lost)) return;
    if (m === prev) { updateViewButton(); return; }
    view.mode = m;
    const b = document.body;
    b.classList.toggle('view-3d', m !== 'top');
    b.classList.toggle('view-tps', m === 'tps');
    b.classList.toggle('view-fps', m === 'fps');
    b.dataset.view = m;
    updateViewButton();
    if (m !== 'top' && prev === 'top') {
      // start behind the player, looking where they face
      const p = N.player, e = p && (p.vehicle || p);
      if (e && isFinite(e.angle)) { view.yaw = e.vehicle ? e.vehicle.angle : (isFinite(p.facing) ? p.facing : e.angle); }
      view.pitch = m === 'fps' ? 0.05 : 0.3;
      CAM.snap = true;
      resize();
    }
    if (m === 'fps' && prev === 'tps') { view.pitch = U.clamp(view.pitch - 0.25, -0.4, 0.6); CAM.fpsOff = 0; }
    if (m === 'tps' && prev === 'fps') { view.pitch = U.clamp(view.pitch + 0.25, 0.05, 0.9); CAM.snap = true; }
    if (m === 'top') {
      try { if (N.input && N.input.exitPointerLock) N.input.exitPointerLock(); } catch (e) { /* ignore */ }
      try { const R = N.render; R.snapCamera(); R.warmChunks(N.player.x, N.player.y, 420); } catch (e) { N.err('view3d.toTop', e); }
      if (E.fxEl) E.fxEl.style.opacity = '0';
    }
    N.emit('view:change', { mode: m, prev });
  }

  /* ================================================================ helpers (H) */
  const H = { VS, FLOOR_H, CHUNK: CH };
  const colorCache = new Map();
  function col(hex) { // linear THREE.Color, cached
    let c = colorCache.get(hex);
    if (!c) { c = new THREE.Color(hex); colorCache.set(hex, c); }
    return c;
  }
  const rgbCache = new Map();
  function rgb8(hex) { // linear 0..255 triple for vertex colours
    let a = rgbCache.get(hex);
    if (!a) {
      const c = new THREE.Color(typeof hex === 'string' && hex[0] === '#' ? hex : '#888888');
      a = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
      rgbCache.set(hex, a);
    }
    return a;
  }

  /* ---------------------------------------------------- GeoBuilder (merged geometry) */
  // Vertex-coloured, optionally facade-attributed geometry built from primitives in one buffer.
  class GB {
    constructor(opts) {
      opts = opts || {};
      this.fac = !!opts.facade;
      this.cap = opts.cap || 2048; this.n = 0; this.icap = this.cap * 2; this.ni = 0;
      this.P = new Float32Array(this.cap * 3); this.Nn = new Int8Array(this.cap * 3); this.C = new Uint8Array(this.cap * 3);
      this.UV = this.fac ? new Float32Array(this.cap * 2) : null; this.F = this.fac ? new Uint8Array(this.cap * 4) : null;
      this.I = new Uint32Array(this.icap);
      this.c = [200, 200, 200]; this.f = [0, 0, 0, 0];
    }
    grow(nv, ni) {
      if (this.n + nv > this.cap) {
        let cap = this.cap; while (this.n + nv > cap) cap *= 2;
        const g = (A, k) => { const B = new A.constructor(cap * k); B.set(A); return B; };
        this.P = g(this.P, 3); this.Nn = g(this.Nn, 3); this.C = g(this.C, 3);
        if (this.fac) { this.UV = g(this.UV, 2); this.F = g(this.F, 4); }
        this.cap = cap;
      }
      if (this.ni + ni > this.icap) {
        let c = this.icap; while (this.ni + ni > c) c *= 2;
        const B = new Uint32Array(c); B.set(this.I); this.I = B; this.icap = c;
      }
    }
    color(hex) { const a = Array.isArray(hex) ? hex : rgb8(hex); this.c = a; return this; }
    /** facade attributes for following vertices: upper style, ground-floor style, lit (0-255), seed, window rows */
    facade(up, gf, lit, seed, floors) { this.f = [(up | 0) + 16 * (gf | 0), lit | 0, seed & 255, floors | 0]; return this; }
    plain() { this.f = [0, 0, 0, 0]; return this; }
    v(x, y, z, nx, ny, nz, u, w) {
      const i = this.n++, o = i * 3;
      this.P[o] = x; this.P[o + 1] = y; this.P[o + 2] = z;
      this.Nn[o] = Math.round(nx * 127); this.Nn[o + 1] = Math.round(ny * 127); this.Nn[o + 2] = Math.round(nz * 127);
      this.C[o] = this.c[0]; this.C[o + 1] = this.c[1]; this.C[o + 2] = this.c[2];
      if (this.fac) {
        this.UV[i * 2] = u || 0; this.UV[i * 2 + 1] = w || 0;
        const f = this.f, q = i * 4; this.F[q] = f[0]; this.F[q + 1] = f[1]; this.F[q + 2] = f[2]; this.F[q + 3] = f[3];
      }
      return i;
    }
    tri(a, b, c) { const I = this.I, o = this.ni; I[o] = a; I[o + 1] = b; I[o + 2] = c; this.ni += 3; }
    /** quad a,b,c,d counter-clockwise seen from the front; normal from the geometry */
    quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, uv) {
      this.grow(4, 6);
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const u = uv || Z4;
      const a = this.v(ax, ay, az, nx, ny, nz, u[0], u[1]);
      this.v(bx, by, bz, nx, ny, nz, u[2], u[1]);
      this.v(cx, cy, cz, nx, ny, nz, u[2], u[3]);
      this.v(dx, dy, dz, nx, ny, nz, u[0], u[3]);
      this.tri(a, a + 1, a + 2); this.tri(a, a + 2, a + 3);
      return this;
    }
    /** vertical wall from A to B (outward normal on the right of A->B seen from above, i.e. (-dz, 0, dx)) */
    wall(ax, az, bx, bz, y0, y1, u0, u1, v0, v1) {
      UVT[0] = u0 || 0; UVT[2] = u1 == null ? 1 : u1; UVT[1] = v0 || 0; UVT[3] = v1 == null ? 1 : v1;
      return this.quad(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, UVT);
    }
    /** horizontal rect at height y facing up (or down) */
    hquad(x0, z0, x1, z1, y, down) {
      if (down) return this.quad(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
      return this.quad(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0);
    }
    /** axis-aligned box; opts {bottom, top:false, sides:false} */
    box(x0, y0, z0, x1, y1, z1, opts) {
      if (!opts || opts.sides !== false) {
        this.wall(x1, z0, x0, z0, y0, y1); this.wall(x0, z1, x1, z1, y0, y1);
        this.wall(x1, z1, x1, z0, y0, y1); this.wall(x0, z0, x0, z1, y0, y1);
      }
      if (!opts || opts.top !== false) this.hquad(x0, z0, x1, z1, y1);
      if (opts && opts.bottom) this.hquad(x0, z0, x1, z1, y0, true);
      return this;
    }
    /** box centred at (cx, cz) with size w x d, rotated by world angle a (yaw), from y0 to y1 */
    obox(cx, cz, w, d, y0, y1, a, opts) {
      const c = Math.cos(a || 0), s = Math.sin(a || 0), hw = w / 2, hd = d / 2;
      const P = (lx, lz) => [cx + lx * c - lz * s, cz + lx * s + lz * c];
      const p0 = P(-hw, -hd), p1 = P(hw, -hd), p2 = P(hw, hd), p3 = P(-hw, hd);
      // corners clockwise seen from above in a right-handed y-up frame: walls need A->B with outward normal (-dz, dx)
      this.wall(p1[0], p1[1], p0[0], p0[1], y0, y1); this.wall(p2[0], p2[1], p1[0], p1[1], y0, y1);
      this.wall(p3[0], p3[1], p2[0], p2[1], y0, y1); this.wall(p0[0], p0[1], p3[0], p3[1], y0, y1);
      if (!opts || opts.top !== false) this.quad(p3[0], y1, p3[1], p2[0], y1, p2[1], p1[0], y1, p1[1], p0[0], y1, p0[1]);
      return this;
    }
    /** vertical cylinder / cone frustum */
    cyl(cx, y0, cz, r0, r1, h, seg, opts) {
      seg = seg || 8;
      this.grow(seg * 4 + 2, seg * 12);
      const top = !opts || opts.top !== false;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        // outward winding: from angle a1 to a0 (see wall())
        this.quad(cx + c1 * r0, y0, cz + s1 * r0, cx + c0 * r0, y0, cz + s0 * r0, cx + c0 * r1, y0 + h, cz + s0 * r1, cx + c1 * r1, y0 + h, cz + s1 * r1);
      }
      if (top && r1 > 0.01) {
        const c = this.v(cx, y0 + h, cz, 0, 1, 0);
        const first = this.n;
        for (let i = 0; i <= seg; i++) { const a = (i / seg) * TAU; this.v(cx + Math.cos(a) * r1, y0 + h, cz + Math.sin(a) * r1, 0, 1, 0); }
        for (let i = 0; i < seg; i++) this.tri(c, first + i + 1, first + i);
      }
      return this;
    }
    /** dome (half ellipsoid) on (cx, y0, cz), radius r, height h */
    dome(cx, y0, cz, r, h, seg, rings) {
      seg = seg || 10; rings = rings || 4;
      this.grow((seg + 1) * (rings + 1), seg * rings * 6);
      const base = this.n;
      for (let j = 0; j <= rings; j++) {
        const t = (j / rings) * (Math.PI / 2), cr = Math.cos(t), sr = Math.sin(t);
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
          const nx = ca * cr / r, ny = sr / h, nz = sa * cr / r, l = Math.hypot(nx, ny, nz) || 1;
          this.v(cx + ca * cr * r, y0 + sr * h, cz + sa * cr * r, nx / l, ny / l, nz / l);
        }
      }
      for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
        const a = base + j * (seg + 1) + i, b = a + seg + 1;
        this.tri(a, b + 1, a + 1); this.tri(a, b, b + 1);
      }
      return this;
    }
    /** ellipsoid blob (UV sphere) centred at (cx, cy, cz) */
    sphere(cx, cy, cz, rx, ry, rz, seg, rings) {
      seg = seg || 8; rings = rings || 6;
      this.grow((seg + 1) * (rings + 1), seg * rings * 6);
      const base = this.n;
      for (let j = 0; j <= rings; j++) {
        const t = (j / rings) * Math.PI - Math.PI / 2, cr = Math.cos(t), sr = Math.sin(t);
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
          const nx = ca * cr / rx, ny = sr / ry, nz = sa * cr / rz, l = Math.hypot(nx, ny, nz) || 1;
          this.v(cx + ca * cr * rx, cy + sr * ry, cz + sa * cr * rz, nx / l, ny / l, nz / l);
        }
      }
      for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
        const a = base + j * (seg + 1) + i, b = a + seg + 1;
        this.tri(a, b + 1, a + 1); this.tri(a, b, b + 1);
      }
      return this;
    }
    /** extrude a polygon [[x, z], ...] from y0 to y1 (walls + top cap; any winding) */
    extrude(pts, y0, y1, opts) {
      const n = pts.length; if (n < 3) return this;
      let area = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) area += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
      // area > 0 here means clockwise seen from above (+z is south): walls go a->b in that order
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if (area > 0) this.wall(b[0], b[1], a[0], a[1], y0, y1); else this.wall(a[0], a[1], b[0], b[1], y0, y1);
      }
      if (!opts || opts.top !== false) {
        const v2 = pts.map((p) => new THREE.Vector2(p[0], p[1]));
        let tris;
        try { tris = THREE.ShapeUtils.triangulateShape(v2, []); } catch (e) { tris = []; }
        this.grow(n, tris.length * 3);
        const base = this.n;
        for (const p of pts) this.v(p[0], y1, p[1], 0, 1, 0);
        for (const t of tris) {
          // make the cap face up (+y): counter-clockwise seen from above
          const A = pts[t[0]], B = pts[t[1]], C = pts[t[2]];
          const cr = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
          if (cr < 0) this.tri(base + t[0], base + t[1], base + t[2]); else this.tri(base + t[0], base + t[2], base + t[1]);
        }
      }
      return this;
    }
    /** append a THREE.BufferGeometry transformed by matrix m (uses the current colour) */
    addGeometry(geo, m) {
      const pa = geo.attributes.position, na = geo.attributes.normal, idx = geo.index;
      const cnt = pa.count, ni = idx ? idx.count : cnt;
      this.grow(cnt, ni);
      const v = TV3, nv = TV3b, nm = TM3.getNormalMatrix(m);
      const base = this.n;
      for (let i = 0; i < cnt; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(m);
        if (na) nv.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); else nv.set(0, 1, 0);
        this.v(v.x, v.y, v.z, nv.x, nv.y, nv.z);
      }
      if (idx) for (let i = 0; i < ni; i += 3) this.tri(base + idx.getX(i), base + idx.getX(i + 1), base + idx.getX(i + 2));
      else for (let i = 0; i < cnt; i += 3) this.tri(base + i, base + i + 1, base + i + 2);
      return this;
    }
    get empty() { return this.ni === 0; }
    /** -> THREE.BufferGeometry (null when empty) */
    build() {
      if (!this.ni) return null;
      const g = new THREE.BufferGeometry(), n = this.n;
      g.setAttribute('position', new THREE.BufferAttribute(this.P.slice(0, n * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(this.Nn.slice(0, n * 3), 3, true));
      g.setAttribute('color', new THREE.BufferAttribute(this.C.slice(0, n * 3), 3, true));
      if (this.fac) {
        g.setAttribute('uv', new THREE.BufferAttribute(this.UV.slice(0, n * 2), 2));
        g.setAttribute('facade', new THREE.BufferAttribute(this.F.slice(0, n * 4), 4, false));
      }
      const I = n > 65535 ? this.I.slice(0, this.ni) : Uint16Array.from(this.I.subarray(0, this.ni));
      g.setIndex(new THREE.BufferAttribute(I, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    }
    /** -> THREE.Mesh with the shared vertex-colour (or facade) material */
    mesh(mat) { const g = this.build(); if (!g) return null; return new THREE.Mesh(g, mat || (this.fac ? MAT.facade : MAT.vc)); }
  }
  const Z4 = [0, 0, 0, 0], UVT = [0, 0, 1, 1];
  let TV3, TV3b, TM3;

  /** merge BufferGeometries that share the same attribute set (non-indexed or indexed) */
  function mergeGeometries(list) {
    list = list.filter(Boolean);
    if (!list.length) return null;
    const names = Object.keys(list[0].attributes);
    let total = 0, totalI = 0;
    for (const g of list) { total += g.attributes.position.count; totalI += g.index ? g.index.count : g.attributes.position.count; }
    const out = new THREE.BufferGeometry();
    for (const nm of names) {
      const a0 = list[0].attributes[nm];
      const arr = new a0.array.constructor(total * a0.itemSize);
      let o = 0;
      for (const g of list) { const a = g.attributes[nm]; if (a) arr.set(a.array, o); o += g.attributes.position.count * a0.itemSize; }
      out.setAttribute(nm, new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized));
    }
    const I = total > 65535 ? new Uint32Array(totalI) : new Uint16Array(totalI);
    let o = 0, base = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      if (g.index) { const s = g.index.array; for (let i = 0; i < s.length; i++) I[o++] = s[i] + base; } else for (let i = 0; i < c; i++) I[o++] = i + base;
      base += c;
    }
    out.setIndex(new THREE.BufferAttribute(I, 1));
    out.computeBoundingSphere();
    return out;
  }

  /* ---------------------------------------------------- textures */
  const TEX = {};
  const texCache = new Map();
  function canvasTex(w, h, paint, opts) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    paint(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = opts && opts.linear ? THREE.LinearEncoding : THREE.sRGBEncoding;
    t.anisotropy = Math.min(8, E.maxAniso || 1);
    if (opts && opts.premult) t.premultiplyAlpha = true;
    if (opts && opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }
  /** cached CanvasTexture by key: tex(key, w, h, paint(ctx, w, h), opts) */
  function tex(key, w, h, paint, opts) {
    let t = texCache.get(key);
    if (!t) { t = canvasTex(w, h, paint, opts); t.userData.shared = true; texCache.set(key, t); }
    return t;
  }

  // Facade atlas: 16 window "bays" x 2 rows (albedo + premultiplied alpha | emissive mask), 64 px each.
  // Styles: 0 plain, 1 rect, 2 arch, 3 grill, 4 glass, 5 shop, 6 door, 7 arcade, 8 open frame,
  // 9 colonial shutters, 10 posh, 11 mosque arch, 12 stone banding, 13 brick, 14 office pair, 15 lamp.
  const STY = { plain: 0, rect: 1, arch: 2, grill: 3, glass: 4, shop: 5, door: 6, arcade: 7, open: 8, colonial: 9, posh: 10, mosque: 11, stone: 12, brick: 13, office: 14, lamp: 15 };
  H.STYLE = STY;
  function paintFacadeAtlas(g) {
    const S = 64;
    g.clearRect(0, 0, 16 * S, 2 * S);
    g.fillStyle = '#000'; g.fillRect(0, S, 16 * S, S); // emissive row: black
    const cell = (i, fnA, fnE) => {
      g.save(); g.translate(i * S, 0); g.beginPath(); g.rect(0, 0, S, S); g.clip(); fnA(g); g.restore();
      if (fnE) { g.save(); g.translate(i * S, S); g.beginPath(); g.rect(0, 0, S, S); g.clip(); fnE(g); g.restore(); }
    };
    const slab = (gg, a) => { gg.fillStyle = 'rgba(40,30,30,' + (a || 0.14) + ')'; gg.fillRect(0, S - 3, S, 3); };
    const glass = (gg, x, y, w, h, top) => { const gr = gg.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, top || '#4c5f6e'); gr.addColorStop(1, '#1d2730'); gg.fillStyle = gr; gg.fillRect(x, y, w, h); };
    const archPath = (gg, x, y, w, h, pointed) => {
      gg.beginPath(); gg.moveTo(x, y + h); gg.lineTo(x, y + w * 0.5);
      if (pointed) { gg.quadraticCurveTo(x, y, x + w / 2, y - w * 0.12); gg.quadraticCurveTo(x + w, y, x + w, y + w * 0.5); } else gg.arc(x + w / 2, y + w * 0.5, w / 2, Math.PI, 0);
      gg.lineTo(x + w, y + h); gg.closePath();
    };
    // 1 rect window
    cell(1, (gg) => {
      gg.fillStyle = '#e9e3d6'; gg.fillRect(18, 11, 28, 36);
      glass(gg, 21, 14, 22, 30); gg.fillStyle = '#e9e3d6'; gg.fillRect(31, 14, 2, 30); gg.fillRect(21, 28, 22, 2);
      gg.fillStyle = '#d8d0c0'; gg.fillRect(15, 47, 34, 3); gg.fillStyle = 'rgba(0,0,0,0.25)'; gg.fillRect(15, 50, 34, 1);
      slab(gg);
    }, (gg) => { gg.fillStyle = '#fff'; gg.fillRect(21, 14, 10, 14); gg.fillRect(33, 14, 10, 14); gg.fillRect(21, 30, 10, 14); gg.fillRect(33, 30, 10, 14); });
    // 2 arch (old city): pointed arch with a light surround and a small jali balcony line
    cell(2, (gg) => {
      gg.fillStyle = '#efe7d6'; archPath(gg, 17, 10, 30, 40, true); gg.fill();
      gg.fillStyle = '#1e2c30'; archPath(gg, 21, 14, 22, 34, true); gg.fill();
      gg.strokeStyle = 'rgba(200,220,210,0.35)'; gg.lineWidth = 1; for (let y = 30; y < 48; y += 4) { gg.beginPath(); gg.moveTo(21, y); gg.lineTo(43, y); gg.stroke(); }
      gg.fillStyle = '#d6cbb4'; gg.fillRect(13, 48, 38, 4);
      slab(gg, 0.18);
    }, (gg) => { gg.fillStyle = '#fff'; archPath(gg, 21, 14, 22, 34, true); gg.fill(); });
    // 3 grill (colony): sunshade, window with white grill
    cell(3, (gg) => {
      gg.fillStyle = '#d4ccbc'; gg.fillRect(8, 6, 48, 5); gg.fillStyle = 'rgba(0,0,0,0.28)'; gg.fillRect(8, 11, 48, 3);
      glass(gg, 14, 16, 36, 30, '#58707c');
      gg.strokeStyle = '#f2efe6'; gg.lineWidth = 1.6; gg.strokeRect(14, 16, 36, 30);
      for (let x = 20; x < 50; x += 6) { gg.beginPath(); gg.moveTo(x, 16); gg.lineTo(x, 46); gg.stroke(); }
      gg.beginPath(); gg.moveTo(14, 31); gg.lineTo(50, 31); gg.stroke();
      gg.beginPath(); gg.arc(32, 31, 6, 0, TAU); gg.stroke();
      slab(gg);
    }, (gg) => { gg.fillStyle = '#fff'; gg.fillRect(15, 17, 34, 28); });
    // 4 glass curtain wall
    cell(4, (gg) => {
      const gr = gg.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, '#7fb0c0'); gr.addColorStop(0.55, '#3c6f80'); gr.addColorStop(1, '#2a5262');
      gg.fillStyle = gr; gg.fillRect(0, 0, S, S - 8);
      gg.fillStyle = '#d6dcde'; gg.fillRect(0, S - 8, S, 8); gg.fillRect(0, 0, 2, S); gg.fillRect(31, 0, 2, S - 8);
      gg.fillStyle = 'rgba(255,255,255,0.12)'; gg.beginPath(); gg.moveTo(4, 0); gg.lineTo(22, 0); gg.lineTo(8, S - 8); gg.lineTo(2, S - 8); gg.fill();
    }, (gg) => { gg.fillStyle = '#fff'; gg.fillRect(2, 0, 29, S - 8); gg.fillRect(33, 0, 31, S - 8); });
    // 5 shop front: half-raised rolling shutter over a lit interior with goods
    cell(5, (gg) => {
      gg.fillStyle = '#8b9095'; gg.fillRect(4, 0, 56, 16);
      gg.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 2; y < 16; y += 3) gg.fillRect(4, y, 56, 1);
      gg.fillStyle = '#3a2a1e'; gg.fillRect(4, 16, 56, 48);
      const cols = ['#d8402a', '#f2c230', '#2a8c82', '#efe9dc', '#3a8a3a', '#c03a8a', '#f08a24'];
      for (let r = 0; r < 3; r++) { gg.fillStyle = '#6a4a30'; gg.fillRect(6, 26 + r * 10, 52, 2); for (let k = 0; k < 9; k++) { gg.fillStyle = cols[(k * 3 + r * 5) % cols.length]; gg.fillRect(8 + k * 5.6, 20 + r * 10, 4, 6); } }
      gg.fillStyle = '#7a5838'; gg.fillRect(4, 54, 56, 10);
    }, (gg) => { gg.fillStyle = '#ffd9a8'; gg.fillRect(4, 16, 56, 38); gg.fillStyle = '#806040'; gg.fillRect(4, 54, 56, 10); });
    // 6 door (ground floor house)
    cell(6, (gg) => {
      gg.fillStyle = '#efe9dc'; gg.fillRect(20, 14, 24, 50);
      gg.fillStyle = '#6a4024'; gg.fillRect(23, 17, 18, 47);
      gg.strokeStyle = 'rgba(0,0,0,0.35)'; gg.lineWidth = 1; gg.strokeRect(25, 20, 6, 18); gg.strokeRect(33, 20, 6, 18); gg.strokeRect(25, 42, 6, 18); gg.strokeRect(33, 42, 6, 18);
      gg.fillStyle = '#e0b040'; gg.fillRect(31, 40, 2, 3);
      gg.fillStyle = '#c84a2a'; gg.fillRect(20, 12, 24, 2); // toran
    }, null);
    // 7 arcade (ground floor arches)
    cell(7, (gg) => {
      gg.fillStyle = '#f1e9d8'; archPath(gg, 6, 10, 52, 56, false); gg.fill();
      gg.fillStyle = '#231a16'; archPath(gg, 10, 14, 44, 52, false); gg.fill();
      gg.fillStyle = 'rgba(255,200,120,0.18)'; gg.fillRect(14, 44, 36, 20);
    }, (gg) => { gg.fillStyle = '#7a6040'; archPath(gg, 10, 14, 44, 52, false); gg.fill(); });
    // 8 open concrete frame (construction)
    cell(8, (gg) => {
      gg.fillStyle = '#2c2a28'; gg.fillRect(0, 0, S, S);
      gg.fillStyle = '#b8b4ac'; gg.fillRect(0, S - 9, S, 9); gg.fillRect(0, 0, 6, S); gg.fillRect(58, 0, 6, S);
      gg.fillStyle = 'rgba(160,150,140,0.4)'; gg.fillRect(20, 30, 16, 25);
    }, null);
    // 9 colonial tall window with green louvred shutters
    cell(9, (gg) => {
      gg.fillStyle = '#f2ece0'; archPath(gg, 18, 6, 28, 50, false); gg.fill();
      gg.fillStyle = '#22343a'; archPath(gg, 22, 10, 20, 44, false); gg.fill();
      gg.fillStyle = '#2f6a4a'; gg.fillRect(14, 22, 8, 32); gg.fillRect(42, 22, 8, 32);
      gg.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 24; y < 54; y += 3) { gg.fillRect(14, y, 8, 1); gg.fillRect(42, y, 8, 1); }
      gg.fillStyle = '#e8e0d0'; gg.fillRect(14, 54, 36, 3);
      slab(gg);
    }, (gg) => { gg.fillStyle = '#fff'; archPath(gg, 22, 10, 20, 44, false); gg.fill(); });
    // 10 posh: wide window over a balcony railing
    cell(10, (gg) => {
      gg.fillStyle = '#f4f0e8'; gg.fillRect(8, 8, 48, 36);
      glass(gg, 11, 11, 42, 30, '#6c8a98'); gg.fillStyle = '#f4f0e8'; gg.fillRect(31, 11, 2, 30);
      gg.fillStyle = '#c8c4bc'; gg.fillRect(4, 46, 56, 3);
      gg.fillStyle = '#5a5a5e'; gg.fillRect(4, 49, 56, 2); for (let x = 6; x < 60; x += 4) gg.fillRect(x, 49, 1.2, 12); gg.fillRect(4, 60, 56, 2);
    }, (gg) => { gg.fillStyle = '#fff'; gg.fillRect(11, 11, 20, 30); gg.fillRect(33, 11, 20, 30); });
    // 11 mosque arch (cusped, white)
    cell(11, (gg) => {
      gg.fillStyle = '#f7f3ea'; archPath(gg, 14, 8, 36, 50, true); gg.fill();
      gg.fillStyle = '#2b3a40'; archPath(gg, 19, 14, 26, 44, true); gg.fill();
      gg.fillStyle = '#e8dcc0'; gg.fillRect(10, 58, 44, 4);
    }, (gg) => { gg.fillStyle = '#fff'; archPath(gg, 19, 14, 26, 44, true); gg.fill(); });
    // 12 stone banding (monuments): horizontal mouldings, small niche
    cell(12, (gg) => {
      gg.fillStyle = 'rgba(255,245,220,0.35)'; gg.fillRect(0, 4, S, 3); gg.fillStyle = 'rgba(60,40,20,0.25)'; gg.fillRect(0, 7, S, 2); gg.fillRect(0, S - 6, S, 3);
      gg.fillStyle = 'rgba(60,40,20,0.35)'; archPath(gg, 24, 22, 16, 26, true); gg.fill();
    }, null);
    // 13 exposed brick
    cell(13, (gg) => {
      gg.fillStyle = '#a5523a'; gg.fillRect(0, 0, S, S);
      gg.fillStyle = 'rgba(230,210,190,0.55)';
      for (let y = 0; y < S; y += 6) { gg.fillRect(0, y, S, 1); const o = (y / 6) % 2 ? 7 : 0; for (let x = o; x < S; x += 14) gg.fillRect(x, y, 1, 6); }
      glass(gg, 22, 18, 20, 24); slab(gg, 0.2);
    }, (gg) => { gg.fillStyle = '#fff'; gg.fillRect(22, 18, 20, 24); });
    // 14 office: a pair of small windows (government buildings, hospitals)
    cell(14, (gg) => {
      gg.fillStyle = '#ece6d8'; gg.fillRect(8, 14, 20, 32); gg.fillRect(36, 14, 20, 32);
      glass(gg, 10, 16, 16, 28); glass(gg, 38, 16, 16, 28);
      gg.fillStyle = 'rgba(0,0,0,0.18)'; gg.fillRect(0, 50, S, 2); slab(gg);
    }, (gg) => { gg.fillStyle = '#fff'; gg.fillRect(10, 16, 16, 28); gg.fillRect(38, 16, 16, 28); });
    // 15 lamp head (emissive)
    cell(15, (gg) => { gg.fillStyle = '#fff8e8'; gg.fillRect(0, 0, S, S); }, (gg) => { gg.fillStyle = '#fff'; gg.fillRect(0, 0, S, S); });
  }

  /* ---------------------------------------------------- materials + shared uniforms */
  const UNI = {};
  const MAT = {};
  const GLSL_HASH = 'float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }\n';

  function facadeCompile(shader) {
    shader.uniforms.uNight = UNI.uNight; shader.uniforms.uSkyTint = UNI.uHor;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 facade;\nvarying vec4 vFac;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvFac = facade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nuniform vec3 uSkyTint;\nvarying vec4 vFac;\n' + GLSL_HASH)
      .replace('#include <map_fragment>', [
        'vec2 cellF = floor(vUv); vec2 fr = fract(vUv);',
        'float codeA = floor(vFac.x + 0.5); float gfS = floor(codeA / 16.0 + 0.01); float upS = codeA - gfS * 16.0;',
        'float st = cellF.y < 0.5 ? gfS : upS;',
        'if (cellF.y > vFac.w - 0.5) st = 0.0;',
        'vec2 gsc = vec2(0.0546875, 0.4375);',
        'vec2 dX = dFdx(vUv) * gsc, dY = dFdy(vUv) * gsc;',
        'vec2 lim = vec2(6.0 / 1024.0, 6.0 / 128.0); dX = clamp(dX, -lim, lim); dY = clamp(dY, -lim, lim);',
        'vec2 auv = vec2((st + 0.0625 + fr.x * 0.875) / 16.0, 0.5 + (0.0625 + fr.y * 0.875) * 0.5);',
        'vec4 tA = texture2DGradEXT(map, auv, dX, dY);',
        'vec4 tE = texture2DGradEXT(map, auv - vec2(0.0, 0.5), dX, dY);',
      ].join('\n'))
      .replace('#include <color_fragment>', [
        'vec3 wallC = diffuseColor.rgb * vColor;',
        'float bayV = 0.93 + 0.07 * h12(cellF * 1.7 + vFac.z);',
        'diffuseColor.rgb = wallC * bayV * (1.0 - tA.a) + tA.rgb;',
      ].join('\n'))
      .replace('#include <emissivemap_fragment>', [
        'float hh = h12(cellF * vec2(1.13, 7.31) + vFac.z * 0.173);',
        'float litW = step(hh, vFac.y * (1.0 / 255.0));',
        'float isShop = step(4.5, st) * step(st, 5.5);',
        'float isLamp = step(14.5, st);',
        'vec3 wcol = mix(vec3(1.0, 0.70, 0.40), vec3(0.78, 0.90, 1.0), step(0.75, fract(hh * 17.0)));',
        'totalEmissiveRadiance += tE.rgb * ((litW * wcol * 1.35 + isShop * vec3(1.0, 0.72, 0.45) * 1.2) * uNight + uSkyTint * 0.10 * (1.0 - uNight));',
        'totalEmissiveRadiance += isLamp * vColor * (0.1 + 3.2 * uNight);',
      ].join('\n'));
  }
  function groundCompile(shader) {
    const ud = this.userData;
    shader.uniforms.auxMap = ud.auxU;
    shader.uniforms.uNight = UNI.uNight; shader.uniforms.uTime = UNI.uTime; shader.uniforms.uSunDir = UNI.uSunDir;
    shader.uniforms.uSunCol = UNI.uSunCol; shader.uniforms.uZen = UNI.uZen; shader.uniforms.uHor = UNI.uHor;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D auxMap;\nuniform float uNight;\nuniform float uTime;\nuniform vec3 uSunDir;\nuniform vec3 uSunCol;\nuniform vec3 uZen;\nuniform vec3 uHor;\nvarying vec3 vWP;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n\tvec4 aux = texture2D(auxMap, vUv);')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += diffuseColor.rgb * aux.rgb * (uNight * 2.4);')
      .replace('#include <envmap_fragment>', [
        '#include <envmap_fragment>',
        'float wm = aux.a;',
        'if (wm > 0.003) {',
        '  vec3 Vd = normalize(cameraPosition - vWP);',
        '  vec2 p = vWP.xz; float t = uTime;',
        '  float n1 = sin(p.x * 0.090 + p.y * 0.050 + t * 1.25) + sin(p.x * -0.060 + p.y * 0.115 + t * 0.95);',
        '  float n2 = sin(p.x * 0.210 - p.y * 0.170 + t * 2.10) + sin(p.x * 0.150 + p.y * 0.260 - t * 1.70);',
        '  vec3 nrm = normalize(vec3(n1 * 0.05 + n2 * 0.03, 1.0, n2 * 0.045 - n1 * 0.025));',
        '  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(nrm, Vd), 0.0, 1.0), 4.0);',
        '  vec3 Rf = reflect(-Vd, nrm);',
        '  vec3 skyC = mix(uHor, uZen, clamp(Rf.y * 1.6, 0.0, 1.0));',
        '  float sd = max(dot(Rf, uSunDir), 0.0);',
        '  float sp = pow(sd, 260.0) * 5.0 + pow(sd, 22.0) * 0.16;',
        '  vec3 wcol = mix(outgoingLight * 0.85, skyC, clamp(0.18 + fres * 0.8, 0.0, 0.88)) + sp * uSunCol;',
        '  outgoingLight = mix(outgoingLight, wcol, wm);',
        '}',
      ].join('\n'));
  }
  function windCompile(shader) {
    shader.uniforms.uTime = UNI.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '#ifdef USE_INSTANCING',
        '\tfloat ph = instanceMatrix[3].x * 0.071 + instanceMatrix[3].z * 0.053;',
        '\tfloat sw = max(position.y + 0.7, 0.0);',
        '\ttransformed.x += sin(uTime * 1.3 + ph) * 0.05 * sw;',
        '\ttransformed.z += cos(uTime * 1.1 + ph * 1.7) * 0.04 * sw;',
        '#endif',
      ].join('\n'));
  }

  function initMaterials() {
    UNI.uTime = { value: 0 }; UNI.uNight = { value: 0 };
    UNI.uSunDir = { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() };
    UNI.uSunCol = { value: new THREE.Color(1, 1, 1) };
    UNI.uZen = { value: new THREE.Color('#3a74c4') }; UNI.uHor = { value: new THREE.Color('#d2dfe8') };
    UNI.uMoonDir = { value: new THREE.Vector3(-0.3, 0.8, -0.4).normalize() };
    UNI.uSunVis = { value: 1 };

    TEX.facade = canvasTex(1024, 128, paintFacadeAtlas, { premult: true });
    TEX.facade.wrapS = TEX.facade.wrapT = THREE.ClampToEdgeWrapping;
    TEX.glow = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
    TEX.blob = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });

    MAT.facade = new THREE.MeshLambertMaterial({ map: TEX.facade, vertexColors: true });
    MAT.facade.onBeforeCompile = facadeCompile;
    MAT.facade.customProgramCacheKey = () => 'nostalgia-facade';
    MAT.facade.extensions = { derivatives: true, shaderTextureLOD: true };
    MAT.vc = new THREE.MeshLambertMaterial({ vertexColors: true });
    MAT.vcFlat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    MAT.vcDouble = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    MAT.canopy = new THREE.MeshLambertMaterial({ flatShading: true });
    MAT.canopy.onBeforeCompile = windCompile; MAT.canopy.customProgramCacheKey = () => 'nostalgia-wind';
    MAT.trunk = new THREE.MeshLambertMaterial({ color: '#5b4632' });
    MAT.rock = new THREE.MeshLambertMaterial({ flatShading: false });
    MAT.glow = new THREE.PointsMaterial({ size: 26, map: TEX.glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0 });
    MAT.blob = new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    MAT.outer = new THREE.MeshLambertMaterial({ color: '#9b7f5f' });
    for (const k in MAT) MAT[k].userData.shared = true;

    // shared geometries
    const G = (H.geo = {});
    G.trunk = new THREE.CylinderGeometry(0.42, 0.62, 1, 6, 1, true); G.trunk.translate(0, 0.5, 0);
    G.blob = noisyBlob(1, 1, 7);
    G.rock = noisyBlob(1, 1, 3, 0.13);
    G.crown = palmCrown();
    G.plane = new THREE.PlaneGeometry(1, 1); G.plane.rotateX(-Math.PI / 2);
    for (const k in G) G[k].userData.shared = true;
  }
  function noisyBlob(r, detail, seed, amp) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const p = g.attributes.position, rng = U.rng(seed || 1), a = amp == null ? 0.18 : amp;
    const seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = Math.round(p.getX(i) * 1000) + ',' + Math.round(p.getY(i) * 1000) + ',' + Math.round(p.getZ(i) * 1000);
      let k = seen.get(key); if (k == null) { k = 1 + (rng.next() - 0.5) * 2 * a; seen.set(key, k); }
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.86, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  }
  function palmCrown() {
    const gb = new GB();
    gb.color('#ffffff');
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (i % 2) * 0.2, c = Math.cos(a), s = Math.sin(a), px = -s, pz = c;
      // drooping frond: 3 segments, width tapering
      const pts = [[0, 0.1, 0.12], [0.45, 0.25, 0.22], [0.85, 0.05, 0.16], [1.15, -0.45, 0.02]];
      for (let k = 0; k < pts.length - 1; k++) {
        const A = pts[k], B = pts[k + 1];
        const ax = c * A[0], az = s * A[0], bx = c * B[0], bz = s * B[0];
        gb.quad(ax - px * A[2], A[1], az - pz * A[2], bx - px * B[2], B[1], bz - pz * B[2], bx + px * B[2], B[1], bz + pz * B[2], ax + px * A[2], A[1], az + pz * A[2]);
        gb.quad(ax + px * A[2], A[1] - 0.01, az + pz * A[2], bx + px * B[2], B[1] - 0.01, bz + pz * B[2], bx - px * B[2], B[1] - 0.01, bz - pz * B[2], ax - px * A[2], A[1] - 0.01, az - pz * A[2]);
      }
    }
    gb.sphere(0, 0, 0, 0.16, 0.16, 0.16, 6, 4);
    const g = gb.build();
    g.deleteAttribute('color');
    return g;
  }

  /** cached Lambert material: mat('#hex', {emissive, flat, double, transparent, opacity, basic}) */
  const matCache = new Map();
  function mat(hex, o) {
    o = o || {};
    const key = hex + '|' + JSON.stringify(o);
    let m = matCache.get(key);
    if (m) return m;
    const p = { color: hex };
    if (o.emissive) { p.emissive = o.emissive; p.emissiveIntensity = o.emissiveIntensity == null ? 1 : o.emissiveIntensity; }
    if (o.flat) p.flatShading = true;
    if (o.double) p.side = THREE.DoubleSide;
    if (o.transparent || o.opacity != null) { p.transparent = true; p.opacity = o.opacity == null ? 1 : o.opacity; p.depthWrite = o.depthWrite === true; }
    if (o.map) p.map = o.map;
    m = o.basic ? new THREE.MeshBasicMaterial(p) : new THREE.MeshLambertMaterial(p);
    m.userData.shared = true;
    matCache.set(key, m);
    return m;
  }

  /* ---------------------------------------------------- sign atlas (shop boards) */
  const SIGN = { pages: [], map: new Map(), CW: 512, CHt: 64, cols: 4, rows: 16, max: 6 };
  function signFont() {
    try { if (document.fonts && document.fonts.check && document.fonts.check("40px 'Yatra One'")) return "'Yatra One', 'Baloo 2', sans-serif"; } catch (e) { /* ignore */ }
    return "'Baloo 2', system-ui, sans-serif";
  }
  /** -> {page, u0, v0, u1, v1} for a board of aspect `asp` (w/h) */
  function signSlot(text, bg, fg, asp) {
    const cls = asp < 3.8 ? 3 : asp < 6.2 ? 5 : 8;
    const key = text + '|' + bg + '|' + fg + '|' + cls;
    let s = SIGN.map.get(key);
    if (s) return s;
    let page = SIGN.pages[SIGN.pages.length - 1];
    if (!page || page.n >= SIGN.cols * SIGN.rows) {
      if (SIGN.pages.length >= SIGN.max) return null;
      const c = document.createElement('canvas'); c.width = SIGN.CW * SIGN.cols; c.height = SIGN.CHt * SIGN.rows;
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = Math.min(8, E.maxAniso || 1);
      const m = new THREE.MeshLambertMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0 });
      m.userData.shared = true;
      page = { canvas: c, g: c.getContext('2d'), tex: t, mat: m, n: 0, dirty: true, index: SIGN.pages.length };
      SIGN.pages.push(page);
    }
    const i = page.n++, cx = (i % SIGN.cols) * SIGN.CW, cy = Math.floor(i / SIGN.cols) * SIGN.CHt;
    const w = SIGN.CHt * cls, x = cx + (SIGN.CW - w) / 2, g = page.g;
    g.fillStyle = '#2a1a10'; g.fillRect(x, cy, w, SIGN.CHt);
    g.fillStyle = bg; g.fillRect(x + 3, cy + 3, w - 6, SIGN.CHt - 6);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.strokeRect(x + 6, cy + 6, w - 12, SIGN.CHt - 12);
    let fs = 40;
    g.font = '800 ' + fs + 'px ' + signFont();
    const tw = g.measureText(text).width;
    if (tw > w - 22) { fs = Math.max(14, Math.floor(fs * (w - 22) / tw)); g.font = '800 ' + fs + 'px ' + signFont(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillText(text, x + w / 2 + 1.5, cy + SIGN.CHt / 2 + 3.5);
    g.fillStyle = fg; g.fillText(text, x + w / 2, cy + SIGN.CHt / 2 + 2);
    page.dirty = true;
    const W = page.canvas.width, Ht = page.canvas.height;
    s = { page, u0: x / W, u1: (x + w) / W, v0: 1 - (cy + SIGN.CHt) / Ht, v1: 1 - cy / Ht };
    SIGN.map.set(key, s);
    return s;
  }
  function flushSignPages() { for (const p of SIGN.pages) if (p.dirty) { p.dirty = false; p.tex.needsUpdate = true; } }
