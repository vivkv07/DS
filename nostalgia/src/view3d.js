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
  const toast = (t, ms) => { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2600, { key: 'view3d' }); } catch (e) { /* ignore */ } };
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
    adaptive: true, baked: false, aniso: 8,
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
      s.src = url; s.async = true;
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
    toast('Loading 3D view…', 1100);
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
    try { computeSun(); updateSunBake(); } catch (e) { /* first frame */ }
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
      if (!E.hinted) {
        E.hinted = true;
        const dev = N.input && N.input.device;
        toast(dev === 'touch' ? 'Drag on the right side to look around · VIEW changes the view' : dev === 'gamepad' ? 'Right stick looks around · R3 changes the view' : 'Drag (or click) to look around · V changes the view', 3200);
      }
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
    t.anisotropy = Math.min(Q.aniso, E.maxAniso || 1);
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
    const S = 64; // painted in 64-unit cells, rasterised at 2x (128 px per bay)
    g.scale(2, 2);
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

  // dithered fade of things right in front of the camera (trunks, poles, walls the camera hugs)
  function nearFade(shader, uni) {
    shader.uniforms.uNearFade = uni;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNearFade;\nfloat nfHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tif (uNearFade > 0.0) { float nfd = length(vViewPosition) / uNearFade; if (nfd < 1.0 && nfHash(floor(gl_FragCoord.xy)) > clamp((nfd - 0.45) / 0.55, 0.0, 1.0)) discard; }');
  }
  function facadeCompile(shader) {
    shader.uniforms.uNight = UNI.uNight; shader.uniforms.uSkyTint = UNI.uHor;
    shader.uniforms.uFlood = { value: (this && this.userData && this.userData.flood) || 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 facade;\nvarying vec4 vFac;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvFac = facade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nuniform float uFlood;\nuniform vec3 uSkyTint;\nvarying vec4 vFac;\n' + GLSL_HASH)
      .replace('#include <map_fragment>', [
        'vec2 cellF = floor(vUv); vec2 fr = fract(vUv);',
        'float codeA = floor(vFac.x + 0.5); float gfS = floor(codeA / 16.0 + 0.01); float upS = codeA - gfS * 16.0;',
        'float st = cellF.y < 0.5 ? gfS : upS;',
        'if (cellF.y > vFac.w - 0.5) st = 0.0;',
        'vec2 gsc = vec2(0.0546875, 0.4375);',
        'vec2 dX = dFdx(vUv) * gsc, dY = dFdy(vUv) * gsc;',
        'vec2 lim = vec2(12.0 / 2048.0, 12.0 / 256.0); dX = clamp(dX, -lim, lim); dY = clamp(dY, -lim, lim);',
        'vec2 auv = vec2((st + 0.0625 + fr.x * 0.875) / 16.0, 0.5 + (0.0625 + fr.y * 0.875) * 0.5);',
        'vec4 tA = texture2DGradEXT(map, auv, dX, dY);',
        'vec4 tE = texture2DGradEXT(map, auv - vec2(0.0, 0.5), dX, dY);',
      ].join('\n'))
      .replace('#include <color_fragment>', [
        'vec3 wallC = diffuseColor.rgb * vColor;',
        'float bayV = 0.93 + 0.07 * h12(cellF * 1.7 + vFac.z);',
        'float wallH = vUv.y * ' + FLOOR_H.toFixed(1) + ';',
        'float ao = vFac.w > 0.5 ? mix(0.72, 1.0, smoothstep(0.0, 5.0, wallH)) : 1.0;',
        'diffuseColor.rgb = (wallC * bayV * (1.0 - tA.a) + tA.rgb) * ao;',
      ].join('\n'))
      .replace('#include <emissivemap_fragment>', [
        'float hh = h12(cellF * vec2(1.13, 7.31) + vFac.z * 0.173);',
        'float litW = step(hh, vFac.y * (1.0 / 255.0));',
        'float isShop = step(4.5, st) * step(st, 5.5);',
        'float isLamp = step(14.5, st);',
        'vec3 wcol = mix(vec3(1.0, 0.62, 0.30), vec3(0.62, 0.80, 1.0), step(0.78, fract(hh * 17.0))) * (0.75 + 0.5 * fract(hh * 31.0));',
        'totalEmissiveRadiance += tE.rgb * ((litW * wcol * 0.8 + isShop * vec3(1.0, 0.68, 0.38) * 1.0) * uNight + uSkyTint * 0.10 * (1.0 - uNight));',
        'totalEmissiveRadiance += isLamp * vColor * (0.1 + 3.2 * uNight);',
        'totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.82, 0.62) * uFlood * uNight;',
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
      .replace('#include <common>', '#include <common>\nuniform sampler2D auxMap;\nuniform float uNight;\nuniform float uTime;\nuniform vec3 uSunDir;\nuniform vec3 uSunCol;\nuniform vec3 uZen;\nuniform vec3 uHor;\nvarying vec3 vWP;\n' + GLSL_HASH + 'float gvn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y); }')
      .replace('#include <map_fragment>', [
        '#include <map_fragment>',
        'vec4 aux = texture2D(auxMap, vUv);',
        '{ float dd = length(cameraPosition - vWP); float amp = (1.0 - smoothstep(25.0, 140.0, dd)) * (1.0 - aux.a);',
        '  if (amp > 0.0) { float dn = gvn(vWP.xz * 0.9) * 0.6 + gvn(vWP.xz * 3.1) * 0.4; diffuseColor.rgb *= 1.0 + (dn - 0.5) * 0.16 * amp; } }',
      ].join('\n'))
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += diffuseColor.rgb * aux.rgb * (uNight * 3.0);')
      .replace('#include <envmap_fragment>', [
        '#include <envmap_fragment>',
        'float wm = aux.a;',
        'if (wm > 0.003) {',
        '  vec3 Vd = normalize(cameraPosition - vWP);',
        '  vec2 p = vWP.xz; float t = uTime;',
        '  vec2 q = p + vec2(gvn(p * 0.021 + t * 0.03), gvn(p * 0.019 - t * 0.025)) * 40.0;',
        '  float n1 = sin(q.x * 0.090 + q.y * 0.050 + t * 1.25) + sin(q.x * -0.060 + q.y * 0.115 + t * 0.95) + (gvn(q * 0.08 + t * 0.2) - 0.5) * 1.6;',
        '  float n2 = sin(q.x * 0.210 - q.y * 0.170 + t * 2.10) + sin(q.x * 0.150 + q.y * 0.260 - t * 1.70) + (gvn(q * 0.23 - t * 0.3) - 0.5) * 1.4;',
        '  vec3 nrm = normalize(vec3(n1 * 0.05 + n2 * 0.03, 1.0, n2 * 0.045 - n1 * 0.025));',
        '  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(nrm, Vd), 0.0, 1.0), 4.0);',
        '  vec3 Rf = reflect(-Vd, nrm);',
        '  vec3 skyC = mix(uHor, uZen, clamp(Rf.y * 2.4 + 0.32, 0.0, 1.0)) * 0.82;',
        '  float sd = max(dot(Rf, uSunDir), 0.0);',
        '  float sp = pow(sd, 260.0) * 5.0 + pow(sd, 22.0) * 0.14;',
        '  vec3 base = outgoingLight * vec3(0.5, 0.78, 0.82) + vec3(0.004, 0.02, 0.024);',
        '  float glint = smoothstep(0.82, 1.0, sin(p.x * 0.7 + t * 2.3) * sin(p.y * 0.63 - t * 1.9)) * 0.25;',
        '  vec3 wcol = mix(base, skyC, clamp(0.08 + fres * 0.62, 0.0, 0.64)) + (sp + glint * sd * sd) * uSunCol;',
        '  outgoingLight = mix(outgoingLight, wcol, wm);',
        '}',
      ].join('\n'));
  }
  function trunkCompile(shader) { nearFade(shader, UNI.uNearFade); }
  function windCompile(shader) {
    nearFade(shader, UNI.uNearFade);
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
    UNI.uTime = { value: 0 }; UNI.uNight = { value: 0 }; UNI.uNearFade = { value: 8 };
    UNI.uSunDir = { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() };
    UNI.uSunCol = { value: new THREE.Color(1, 1, 1) };
    UNI.uZen = { value: new THREE.Color('#3a74c4') }; UNI.uHor = { value: new THREE.Color('#d2dfe8') };
    UNI.uMoonDir = { value: new THREE.Vector3(-0.3, 0.8, -0.4).normalize() };
    UNI.uSunVis = { value: 1 };

    TEX.facade = canvasTex(2048, 256, paintFacadeAtlas, { premult: true });
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
    // the same facade shader, floodlit at night (monuments, landmark fallbacks)
    MAT.facadeLit = new THREE.MeshLambertMaterial({ map: TEX.facade, vertexColors: true });
    MAT.facadeLit.onBeforeCompile = facadeCompile; MAT.facadeLit.customProgramCacheKey = () => 'nostalgia-facade';
    MAT.facadeLit.extensions = MAT.facade.extensions; MAT.facadeLit.userData.flood = 0.5;
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
  const SIGN = { pages: [], map: new Map(), CW: 512, CHt: 64, cols: 4, rows: 16, max: 6 }; // phones: halved (initEngine)
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
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = Math.min(Q.aniso, E.maxAniso || 1);
      const m = new THREE.MeshLambertMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0 });
      m.userData.shared = true;
      page = { canvas: c, g: c.getContext('2d'), tex: t, mat: m, n: 0, dirty: true, index: SIGN.pages.length };
      SIGN.pages.push(page);
    }
    const i = page.n++, cx = (i % SIGN.cols) * SIGN.CW, cy = Math.floor(i / SIGN.cols) * SIGN.CHt;
    const w = SIGN.CHt * cls, x = cx + (SIGN.CW - w) / 2, g = page.g;
    const bw = Math.max(2, SIGN.CHt / 20);
    g.fillStyle = '#2a1a10'; g.fillRect(x, cy, w, SIGN.CHt);
    g.fillStyle = bg; g.fillRect(x + bw, cy + bw, w - bw * 2, SIGN.CHt - bw * 2);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = Math.max(1, bw * 0.6); g.strokeRect(x + bw * 2, cy + bw * 2, w - bw * 4, SIGN.CHt - bw * 4);
    const k = SIGN.CHt / 64;
    let fs = Math.round(40 * k);
    g.font = '800 ' + fs + 'px ' + signFont();
    const tw = g.measureText(text).width;
    if (tw > w - 22 * k) { fs = Math.max(Math.round(14 * k), Math.floor(fs * (w - 22 * k) / tw)); g.font = '800 ' + fs + 'px ' + signFont(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillText(text, x + w / 2 + 1.5 * k, cy + SIGN.CHt / 2 + 3.5 * k);
    g.fillStyle = fg; g.fillText(text, x + w / 2, cy + SIGN.CHt / 2 + 2 * k);
    page.dirty = true;
    const W = page.canvas.width, Ht = page.canvas.height;
    s = { page, u0: x / W, u1: (x + w) / W, v0: 1 - (cy + SIGN.CHt) / Ht, v1: 1 - cy / Ht };
    SIGN.map.set(key, s);
    return s;
  }
  function flushSignPages() { for (const p of SIGN.pages) if (p.dirty) { p.dirty = false; p.tex.needsUpdate = true; } }

  /* ================================================================ height grid (camera collision) */
  let HG = null; // Uint8Array, 4u cells: top of solid stuff in 3D units (0 = open)
  let HGW = 0, HGH = 0;
  function buildHeightGrid() {
    const C = N.CELL || 4;
    HGW = Math.ceil(N.WORLD_W / C); HGH = Math.ceil(N.WORLD_H / C);
    HG = new Uint8Array(HGW * HGH);
    const put = (x0, y0, x1, y1, h) => {
      const v = Math.min(255, Math.ceil(h));
      const i0 = Math.max(0, Math.floor(x0 / C)), i1 = Math.min(HGW - 1, Math.floor((x1 - 0.01) / C));
      const j0 = Math.max(0, Math.floor(y0 / C)), j1 = Math.min(HGH - 1, Math.floor((y1 - 0.01) / C));
      for (let j = j0; j <= j1; j++) { const o = j * HGW; for (let i = i0; i <= i1; i++) if (HG[o + i] < v) HG[o + i] = v; }
    };
    const W = N.world;
    for (const s of W.structures) {
      if (s.t === 'bldg') put(s.x, s.y, s.x + s.w, s.y + s.d, s.h * VS + (s.parapet ? 3 : 0) + (s.roofType === 'hip' || s.roofType === 'gable' ? 6 : 0));
      else if (s.t === 'wall') put(s.x, s.y, s.x + s.w, s.y + s.d, s.h);
      else if (s.t === 'rock') put(s.x - s.r * 0.8, s.y - s.r * 0.8, s.x + s.r * 0.8, s.y + s.r * 0.8, s.h * 1.1);
    }
    for (const lm of (W.data && W.data.landmarks) || []) {
      if (lm.noSolid || lm.solid === false) continue;
      const h = (lm.h || 20) * VS * 0.9;
      if (lm.solids) for (const r of lm.solids) put(r[0], r[1], r[0] + r[2], r[1] + r[3], h);
      else put(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.x + lm.w / 2, lm.y + lm.d / 2, h);
    }
  }
  function heightAt(x, y) {
    if (!HG) return 0;
    const C = N.CELL || 4, i = Math.floor(x / C), j = Math.floor(y / C);
    if (!(i >= 0 && j >= 0 && i < HGW && j < HGH)) return 0;
    return HG[j * HGW + i];
  }

  /** height of an entity's feet in 3D (roof zones) */
  function elevation(e) {
    if (!e) return 0;
    if (e.level) {
      const RF = N.world && N.world.roofs;
      if (RF && RF.heightAt) { const h = RF.heightAt(e.x, e.y); if (h) return h * VS; }
      const r = RF && RF.get && RF.get(e.level);
      if (r) return r.h * VS;
    }
    if (isFinite(e.z) && e.z > 0) return e.z;
    // [ground hook] raised footpaths / medians and pothole dips under the entity (view3d_ground.js)
    const gp = gpOn();
    if (gp && gp.heightAt) return gp.heightAt(e.x, e.y, e);
    return 0;
  }

  /* ================================================================ ground painting (render.js painter) */
  // One canvas per resolution; its context's setTransform/resetTransform are made relative to a base
  // transform so render.js's buildChunk (which resets to identity) paints a quadrant at our scale.
  const PAINT = {};
  function paintCanvas(px) {
    let p = PAINT[px];
    if (p) return p;
    const c = document.createElement('canvas'); c.width = c.height = px;
    const g = c.getContext('2d');
    const P = CanvasRenderingContext2D.prototype;
    const st = { s: 1, ox: 0, oy: 0 };
    g.setTransform = function (a, b, cc, d, e, f) {
      if (a && typeof a === 'object') { b = a.b; cc = a.c; d = a.d; e = a.e; f = a.f; a = a.a; }
      P.setTransform.call(this, st.s * a, st.s * b, st.s * cc, st.s * d, st.s * e + st.ox, st.s * f + st.oy);
    };
    g.resetTransform = function () { P.setTransform.call(this, st.s, 0, 0, st.s, st.ox, st.oy); };
    p = PAINT[px] = { canvas: c, g, st, P };
    return p;
  }
  let selfInval = false;
  const sunBake = { sx: 0, sy: 0, strength: 0.7, key: '' };
  /** paint render chunk (ri, rj) into paint canvas `p` at s px/u with its top-left at (ox, oy) px */
  function paintQuadrant(p, ri, rj, s, ox, oy) {
    const R = N.render;
    const rect = [ri * RCH, rj * RCH, RCH, RCH];
    const proto = HTMLCanvasElement.prototype, orig = proto.getContext;
    const g = p.g, P = p.P;
    p.st.s = s; p.st.ox = ox; p.st.oy = oy;
    P.setTransform.call(g, 1, 0, 0, 1, 0, 0);
    g.save(); g.beginPath(); g.rect(ox, oy, RCH * s, RCH * s); g.clip();
    const sun = R.sun, keep = [sun.sx, sun.sy, sun.strength];
    sun.sx = sunBake.sx; sun.sy = sunBake.sy; sun.strength = sunBake.strength;
    let hit = false;
    selfInval = true;
    try {
      R.invalidateChunks(rect);
      proto.getContext = function (type) { if (!hit && type === '2d') { hit = true; return g; } return orig.apply(this, arguments); };
      R.warmChunks(rect[0] + RCH / 2, rect[1] + RCH / 2, 1);
    } catch (e) { N.err('view3d.paint', e); } finally {
      proto.getContext = orig;
      sun.sx = keep[0]; sun.sy = keep[1]; sun.strength = keep[2];
      try { R.invalidateChunks(rect); } catch (e) { /* ignore */ }
      selfInval = false;
      P.setTransform.call(g, 1, 0, 0, 1, 0, 0);
      g.restore();
    }
    if (!hit) { g.fillStyle = '#8a7058'; g.fillRect(ox, oy, RCH * s, RCH * s); }
    return hit;
  }
  // sun used for baked ground shadows (low tier only; high tier uses the real shadow map)
  function updateSunBake() {
    if (!Q.baked) { sunBake.sx = sunBake.sy = 0; sunBake.strength = 0.75; sunBake.key = 'none'; return; }
    const S = SUN;
    const len = Math.min(2, 1 / Math.tan(Math.max(0.46, S.elev)));
    const az = Math.round(Math.atan2(S.gy, S.gx) / 0.14) * 0.14;
    const L = Math.round(len * 4) / 4;
    const st = Math.round(U.clamp(S.day * 1.4, 0.15, 1) * 5) / 5;
    const key = az.toFixed(2) + '|' + L + '|' + st;
    if (key !== sunBake.key) {
      sunBake.key = key; sunBake.sx = -Math.cos(az) * L; sunBake.sy = -Math.sin(az) * L; sunBake.strength = st;
      for (const ch of chunks.values()) if (ch.groundRes) ch.groundStale = true;
    }
  }

  /* ================================================================ chunks */
  const chunks = new Map(); // key -> chunk
  // [ground hook] chunk columns / rows follow the built world size (map v2 is larger than 8000 x 6000)
  let CW = Math.ceil(8000 / CH), CHn = Math.ceil(6000 / CH);
  const sizeChunks = () => { CW = Math.min(64, Math.ceil((N.WORLD_W || 8000) / CH)); CHn = Math.ceil((N.WORLD_H || 6000) / CH); };
  const ckey = (ci, cj) => cj * 64 + ci;
  // [ground hook] ground provider (src/view3d_ground.js, N.view3d.setGroundProvider): when enabled it
  // builds every chunk's ground (terrain + road geometry) instead of the render.js painter texture
  let GP = null;
  const gpOn = () => (GP && GP.enabled ? GP : null);
  let railSegs = null; // chunk key -> [[ax, ay, bx, by]] (64u pieces)
  function prepRails() {
    railSegs = new Map();
    for (const r of (N.WORLD_DATA && N.WORLD_DATA.rails) || []) {
      for (let k = 0; k < r.pts.length - 1; k++) {
        const a = r.pts[k], b = r.pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 64));
        for (let q = 0; q < n; q++) {
          const ax = a[0] + (b[0] - a[0]) * q / n, ay = a[1] + (b[1] - a[1]) * q / n, bx = a[0] + (b[0] - a[0]) * (q + 1) / n, by = a[1] + (b[1] - a[1]) * (q + 1) / n;
          const key = ckey(Math.floor((ax + bx) / 2 / CH), Math.floor((ay + by) / 2 / CH));
          (railSegs.get(key) || railSegs.set(key, []).get(key)).push([ax, ay, bx, by]);
        }
      }
    }
  }
  function newChunk(ci, cj) {
    const ch = {
      ci, cj, key: ckey(ci, cj), x0: ci * CH, y0: cj * CH,
      group: new THREE.Group(), ground: null, groundMat: null, groundTex: null, groundRes: 0, groundStale: false, aux: null,
      geom: null, detail: -1, objs: [], lights: [], dist: 0, job: null, gjob: null, wantDetail: 0, wantRes: 0, dirty: false,
    };
    ch.group.name = 'chunk' + ci + '_' + cj;
    ch.group.position.set(ch.x0, 0, ch.y0);
    ch.group.matrixAutoUpdate = false; ch.group.updateMatrix();
    E.city.add(ch.group);
    chunks.set(ch.key, ch);
    return ch;
  }
  function disposeObj(o) {
    o.traverse((m) => {
      if (m.geometry && !(m.geometry.userData && m.geometry.userData.shared)) m.geometry.dispose();
      if (m.isInstancedMesh && m.dispose) m.dispose();
      const ms = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mm of ms) {
        if (mm.userData && mm.userData.shared) continue;
        for (const k of ['map', 'emissiveMap', 'alphaMap']) if (mm[k] && !(mm[k].userData && mm[k].userData.shared)) mm[k].dispose();
        mm.dispose();
      }
    });
  }
  function clearChunkGeom(ch) {
    for (const o of ch.objs) { ch.group.remove(o); disposeObj(o); }
    ch.objs.length = 0; ch.lights.length = 0;
  }
  function disposeChunk(ch) {
    clearChunkGeom(ch);
    if (ch.ground) { ch.group.remove(ch.ground); ch.ground.geometry.dispose(); }
    if (ch.groundMat) ch.groundMat.dispose();
    if (ch.groundTex) ch.groundTex.dispose();
    if (ch.aux) ch.aux.dispose();
    if (GP) { try { GP.dispose(ch); } catch (e) { N.err('view3d.ground.dispose', e); } } // [ground hook]
    E.city.remove(ch.group);
    chunks.delete(ch.key);
    if (paintJob && paintJob.ch === ch) paintJob = null;
  }
  // [ground hook] drop a chunk's painted ground plane + texture (the provider took over its ground)
  function dropPainted(ch) {
    if (ch.ground) { ch.group.remove(ch.ground); ch.ground.geometry.dispose(); ch.ground = null; }
    if (ch.groundMat) { ch.groundMat.dispose(); ch.groundMat = null; }
    if (ch.groundTex) { ch.groundTex.dispose(); ch.groundTex = null; }
    if (paintJob && paintJob.ch === ch) paintJob = null;
    ch.groundRes = 0; ch.groundStale = false;
  }

  /* ---------------------------------------------------- ground mesh + texture */
  let paintJob = null; // {ch, res, px, p, q (next quadrant)}
  function ensureGroundMesh(ch) {
    if (ch.ground) return;
    const geo = new THREE.PlaneGeometry(CH, CH, 1, 1);
    geo.rotateX(-Math.PI / 2); geo.translate(CH / 2, 0, CH / 2);
    const m = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    m.userData.auxU = { value: null };
    m.onBeforeCompile = groundCompile; m.customProgramCacheKey = () => 'nostalgia-ground';
    ch.groundMat = m;
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true; mesh.name = 'ground';
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    ch.ground = mesh;
    ch.group.add(mesh);
    if (!ch.aux) buildAux(ch);
    m.userData.auxU.value = ch.aux;
  }
  function stepPaint(ch, res, deadline) {
    if (!paintJob || paintJob.ch !== ch || paintJob.res !== res) {
      const px = Math.max(64, Math.round(CH * res));
      paintJob = { ch, res, px, p: paintCanvas(px), q: 0 };
    }
    const J = paintJob, s = J.px / CH;
    while (J.q < 4) {
      const qi = J.q & 1, qj = J.q >> 1;
      paintQuadrant(J.p, ch.ci * 2 + qi, ch.cj * 2 + qj, s, qi * RCH * s, qj * RCH * s);
      J.q++;
      if (now() > deadline) break;
    }
    if (J.q < 4) return false;
    // upload now (the paint canvas is reused for the next chunk)
    const t = new THREE.CanvasTexture(J.p.canvas);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = Math.min(res >= 1 ? Q.aniso : Math.min(4, Q.aniso), E.maxAniso || 1);
    try { E.renderer.initTexture(t); } catch (e) { N.err('view3d.upload', e); }
    t.image = { width: J.px, height: J.px }; // drop the canvas reference (it is reused); never re-uploaded
    ensureGroundMesh(ch);
    const old = ch.groundTex;
    ch.groundTex = t; ch.groundRes = res; ch.groundStale = false;
    ch.groundMat.map = t; ch.groundMat.needsUpdate = !old;
    if (old) old.dispose();
    paintJob = null;
    return true;
  }

  /* ---------------------------------------------------- aux texture: water mask (a) + lamp pools (rgb) */
  function buildAux(ch) {
    const n = AUX, data = new Uint8Array(n * n * 4), acc = new Float32Array(n * n * 3);
    const W = N.world, S = N.SURF, C = CH / n;
    for (let r = 0; r < n; r++) {
      const j = n - 1 - r; // texture row 0 = south edge (v = 0)
      const y = ch.y0 + (j + 0.5) * C;
      for (let i = 0; i < n; i++) data[(r * n + i) * 4 + 3] = W.surfaceAt(ch.x0 + (i + 0.5) * C, y) === S.WATER ? 255 : 0;
    }
    const pool = (px, py, R, cr, cg, cb, k) => {
      const i0 = Math.max(0, Math.floor((px - R - ch.x0) / C)), i1 = Math.min(n - 1, Math.floor((px + R - ch.x0) / C));
      const j0 = Math.max(0, Math.floor((py - R - ch.y0) / C)), j1 = Math.min(n - 1, Math.floor((py + R - ch.y0) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = ch.x0 + (i + 0.5) * C - px, dy = ch.y0 + (j + 0.5) * C - py, d = Math.sqrt(dx * dx + dy * dy);
        if (d >= R) continue;
        const f = (1 - d / R); const w = f * f * k, o = ((n - 1 - j) * n + i) * 3;
        acc[o] += cr * w; acc[o + 1] += cg * w; acc[o + 2] += cb * w;
      }
    };
    const M = 60;
    W.queryStructures(ch.x0 - M, ch.y0 - M, ch.x0 + CH + M, ch.y0 + CH + M, (s) => {
      if (s.t === 'lamp') {
        const tube = !!s.tube, c = tube ? [0.72, 0.88, 1.0] : [1.0, 0.6, 0.24];
        for (const a of s.arms || [[0, 0]]) pool(s.x + a[0] * 1.3, s.y + a[1] * 1.3, tube ? 30 : 42, c[0], c[1], c[2], tube ? 0.55 : 0.8);
      } else if (s.t === 'bldg' && s.front && (s.sign || s.porch)) {
        const fx = s.front === 'E' ? s.x + s.w + 5 : s.front === 'W' ? s.x - 5 : s.x + s.w / 2;
        const fy = s.front === 'S' ? s.y + s.d + 5 : s.front === 'N' ? s.y - 5 : s.y + s.d / 2;
        if (s.sign) pool(fx, fy, Math.min(20, Math.max(s.w, s.d) * 0.55), 1.0, 0.7, 0.4, 0.45);
        else pool(fx, fy, 12, 1.0, 0.78, 0.5, 0.35);
      }
    });
    for (let q = 0, o = 0; q < n * n; q++, o += 3) {
      data[q * 4] = Math.min(255, acc[o] * 255); data[q * 4 + 1] = Math.min(255, acc[o + 1] * 255); data[q * 4 + 2] = Math.min(255, acc[o + 2] * 255);
    }
    const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.needsUpdate = true;
    ch.aux = t;
  }

  /* ---------------------------------------------------- structures -> geometry */
  const WIN = { rect: STY.rect, arch: STY.arch, grill: STY.grill, glass: STY.glass };
  const GFS = { shutters: STY.shop, door: STY.door, arches: STY.arcade };
  const TREEK = {
    neem: ['#2c5226', '#3a6a2e', '#4a7c36', '#5f9142'], banyan: ['#203f1e', '#2d5427', '#3b6830', '#4c7a3a'],
    gulmohar: ['#2f5a28', '#3f7032', '#4f8238', '#628f40'], ashoka: ['#1f4a24', '#2b5d2e', '#3a7038', '#4a8040'],
    palm: ['#3e6a2a', '#4f7f34', '#6a9440', '#2e5222'], coconut: ['#456f2c', '#588a36', '#74a046', '#33582a'],
    mango: ['#1c3f1c', '#28522a', '#376636', '#4a7a40'], tamarind: ['#2a4f24', '#386230', '#4a763a', '#5f8a46'],
    peepal: ['#25502a', '#326434', '#43783e', '#58904a'],
  };
  const FLOWERS = ['#e0482a', '#f07a2a', '#d83a24'];
  const STRUCT = new Map(); // registered builders for other structure types
  function faceSeg(b, f, x0, z0, x1, z1) {
    switch (f) { case 'N': return [x1, z0, x0, z0]; case 'S': return [x0, z1, x1, z1]; case 'E': return [x1, z1, x1, z0]; default: return [x0, z0, x0, z1]; }
  }
  const FACES = ['N', 'S', 'E', 'W'];

  function addBldg(J, b) {
    const gb = J.gb, ox = J.ox, oz = J.oz, detail = J.detail;
    const x0 = b.x - ox, z0 = b.y - oz, x1 = x0 + b.w, z1 = z0 + b.d;
    const Ht = b.h * VS;
    const floors = Math.max(1, Math.round(b.h / 10));
    let up = WIN[b.win] || STY.rect;
    if ((b.style === 'colonial' || b.style === 'cantonment') && b.win === 'arch') up = STY.colonial;
    if (b.style === 'posh') up = STY.posh;
    if (b.mosque) up = STY.mosque;
    const gfFront = GFS[b.gf] || up;
    const lit = Math.round(U.clamp(b.lit || 0.4, 0, 1) * 255), seed = (b.seed || 0) & 255;
    if (b.roofType === 'frame') { addFrame(J, b, x0, z0, x1, z1); return; }
    const bazaar = b.style === 'oldcity' || b.style === 'market';
    const SF = N.SURF, surfAt = N.world.surfaceAt;
    gb.color(b.wall || '#d8cbb0');
    for (let k = 0; k < 4; k++) {
      const f = FACES[k], sg = faceSeg(b, f, x0, z0, x1, z1);
      const len = Math.abs(sg[2] - sg[0]) + Math.abs(sg[3] - sg[1]);
      const front = b.front === f;
      // what is outside this wall? a neighbour (party wall: blank), a street (shops), a yard
      const ux = (sg[2] - sg[0]) / (len || 1), uz = (sg[3] - sg[1]) / (len || 1);
      const mx = (sg[0] + sg[2]) / 2 + ox - uz * 3, mz = (sg[1] + sg[3]) / 2 + oz + ux * 3;
      const out = surfAt(mx, mz);
      const street = out === SF.ROAD || out === SF.FOOTPATH || out === SF.PLAZA || out === SF.BRIDGE;
      let us = up, gs = front ? gfFront : (b.gf === 'arches' && !bazaar ? STY.arcade : up);
      if (!front && (out === SF.SOLID || out === SF.VOID)) { us = 0; gs = 0; }
      else if (!front && bazaar && street) { const r = ((seed >> (k * 2)) & 3); gs = r === 0 ? up : r === 1 && b.style === 'oldcity' ? STY.arcade : r === 1 ? STY.door : STY.shop; }
      if (len < 5) { us = gs = 0; }
      const nb = Math.max(1, Math.round(len / (b.winSp || 8)));
      gb.facade(us, gs, lit, seed, floors);
      gb.wall(sg[0], sg[1], sg[2], sg[3], 0, Ht, 0, nb, 0, Ht / FLOOR_H);
      if (detail && us && len >= 6 && CHAJJA[b.style]) chajjas(gb, sg, len, floors, Ht, b, front && (b.sign || b.awning) ? 2 : 1);
    }
    gb.plain();
    const pitched = b.roofType === 'hip' || b.roofType === 'gable';
    if (pitched) { addPitched(gb, b, x0, z0, x1, z1, Ht); }
    else {
      gb.color(b.roof || '#c9bfb0');
      gb.hquad(x0, z0, x1, z1, Ht);
      const pH = detail && b.parapet ? (b.parapet === 2 ? 4.2 : 3) : 0;
      if (pH) {
        const t = 0.9, top = Ht + pH;
        gb.color(b.trim || b.wall);
        gb.wall(x1, z0, x0, z0, Ht, top); gb.wall(x0, z1, x1, z1, Ht, top); gb.wall(x1, z1, x1, z0, Ht, top); gb.wall(x0, z0, x0, z1, Ht, top);
        // inner faces (toward the roof)
        gb.wall(x0 + t, z0 + t, x1 - t, z0 + t, Ht, top); gb.wall(x1 - t, z1 - t, x0 + t, z1 - t, Ht, top);
        gb.wall(x1 - t, z0 + t, x1 - t, z1 - t, Ht, top); gb.wall(x0 + t, z1 - t, x0 + t, z0 + t, Ht, top);
        gb.color(U.shade(b.trim || b.wall, 1.06));
        gb.hquad(x0, z0, x1, z0 + t, top); gb.hquad(x0, z1 - t, x1, z1, top);
        gb.hquad(x0, z0 + t, x0 + t, z1 - t, top); gb.hquad(x1 - t, z0 + t, x1, z1 - t, top);
      }
      if (detail && b.items && b.items.length) addItems(J, b, Ht, ox, oz);
    }
    if (!detail) return;
    if (b.front && b.awning) addAwning(gb, b, x0, z0, x1, z1);
    if (b.front && b.sign) J.signs.push({ b, x0, z0, x1, z1 });
    if (b.cwall) addCompound(gb, b.cwall, ox, oz);
    if (b.porch && b.yard) {
      const y = b.yard, f = b.front;
      const gx = f === 'E' ? y.x + y.w : f === 'W' ? y.x : y.x + y.w / 2, gy = f === 'S' ? y.y + y.h : f === 'N' ? y.y : y.y + y.h / 2;
      J.glows.push([gx - ox, 7, gy - oz, 1.0, 0.82, 0.55, 0.7]);
    }
  }
  // projecting sunshade slabs ("chajjas") over each storey's windows: depth and shadow lines
  const CHAJJA = { oldcity: 1.3, market: 1.2, colony: 1.6, rocky: 1.4, posh: 2.2, colonial: 0.9, cantonment: 0 };
  function chajjas(gb, sg, len, floors, Ht, b, k0) {
    const out = CHAJJA[b.style], ux = (sg[2] - sg[0]) / len, uz = (sg[3] - sg[1]) / len, nx = -uz, nz = ux;
    const ax = sg[0] - ux * 0.3, az = sg[1] - uz * 0.3, bx = sg[2] + ux * 0.3, bz = sg[3] + uz * 0.3;
    gb.plain(); gb.color(U.shade(b.trim || b.wall, 0.97));
    const top = b.style === 'colonial' ? 1 : floors;
    for (let k = b.style === 'colonial' ? 1 : k0 || 1; k <= top; k++) {
      const y = b.style === 'colonial' ? Ht - 1.2 : k * FLOOR_H - FLOOR_H * 0.22;
      if (y > Ht - 0.8 && b.style !== 'colonial') break;
      const t = 0.55, X0 = ax + nx * out, Z0 = az + nz * out, X1 = bx + nx * out, Z1 = bz + nz * out;
      gb.quad(ax, y + t, az, X0, y + t, Z0, X1, y + t, Z1, bx, y + t, bz); // top (slopes down to the outside)
      gb.quad(X0, y, Z0, X1, y, Z1, X1, y + t, Z1, X0, y + t, Z0);         // front edge
      gb.quad(bx, y, bz, X1, y, Z1, X0, y, Z0, ax, y, az);                 // underside
    }
  }
  function addPitched(gb, b, x0, z0, x1, z1, Ht) {
    const o = 1.2, rise = (b.roofType === 'hip' ? 5.5 : 7) * VS * 0.8;
    const X0 = x0 - o, X1 = x1 + o, Z0 = z0 - o, Z1 = z1 + o, top = Ht + rise;
    gb.color(b.roof || '#a24b32');
    if (b.roofType === 'gable') {
      if ((b.ridge || (b.w >= b.d ? 'x' : 'y')) === 'x') {
        const zm = (z0 + z1) / 2;
        gb.quad(X1, Ht, Z0, X0, Ht, Z0, X0, top, zm, X1, top, zm); // north slope
        gb.quad(X0, Ht, Z1, X1, Ht, Z1, X1, top, zm, X0, top, zm); // south slope
        gb.color(b.wall);
        gb.grow(6, 6); let a = gb.v(x1, Ht, z1, 1, 0, 0); gb.v(x1, Ht, z0, 1, 0, 0); gb.v(x1, top, zm, 1, 0, 0); gb.tri(a, a + 1, a + 2);
        a = gb.v(x0, Ht, z0, -1, 0, 0); gb.v(x0, Ht, z1, -1, 0, 0); gb.v(x0, top, zm, -1, 0, 0); gb.tri(a, a + 1, a + 2);
      } else {
        const xm = (x0 + x1) / 2;
        gb.quad(X0, Ht, Z0, X0, Ht, Z1, xm, top, Z1, xm, top, Z0); // west slope
        gb.quad(X1, Ht, Z1, X1, Ht, Z0, xm, top, Z0, xm, top, Z1); // east slope
        gb.color(b.wall);
        gb.grow(6, 6); let a = gb.v(x1, Ht, z0, 0, 0, -1); gb.v(x0, Ht, z0, 0, 0, -1); gb.v(xm, top, z0, 0, 0, -1); gb.tri(a, a + 1, a + 2);
        a = gb.v(x0, Ht, z1, 0, 0, 1); gb.v(x1, Ht, z1, 0, 0, 1); gb.v(xm, top, z1, 0, 0, 1); gb.tri(a, a + 1, a + 2);
      }
    } else {
      // hip: ridge along the long axis
      const alongX = b.w >= b.d, hw = Math.min(b.w, b.d) / 2;
      const ra = alongX ? [X0 + hw, (Z0 + Z1) / 2] : [(X0 + X1) / 2, Z0 + hw], rb = alongX ? [X1 - hw, (Z0 + Z1) / 2] : [(X0 + X1) / 2, Z1 - hw];
      if (alongX) {
        gb.quad(X1, Ht, Z0, X0, Ht, Z0, ra[0], top, ra[1], rb[0], top, rb[1]);
        gb.quad(X0, Ht, Z1, X1, Ht, Z1, rb[0], top, rb[1], ra[0], top, ra[1]);
        gb.grow(6, 6); let a = gb.v(X0, Ht, Z0, -1, 0.5, 0); gb.v(X0, Ht, Z1, -1, 0.5, 0); gb.v(ra[0], top, ra[1], -1, 0.5, 0); gb.tri(a, a + 1, a + 2);
        a = gb.v(X1, Ht, Z1, 1, 0.5, 0); gb.v(X1, Ht, Z0, 1, 0.5, 0); gb.v(rb[0], top, rb[1], 1, 0.5, 0); gb.tri(a, a + 1, a + 2);
      } else {
        gb.quad(X0, Ht, Z0, X0, Ht, Z1, rb[0], top, rb[1], ra[0], top, ra[1]);
        gb.quad(X1, Ht, Z1, X1, Ht, Z0, ra[0], top, ra[1], rb[0], top, rb[1]);
        gb.grow(6, 6); let a = gb.v(X1, Ht, Z0, 0, 0.5, -1); gb.v(X0, Ht, Z0, 0, 0.5, -1); gb.v(ra[0], top, ra[1], 0, 0.5, -1); gb.tri(a, a + 1, a + 2);
        a = gb.v(X0, Ht, Z1, 0, 0.5, 1); gb.v(X1, Ht, Z1, 0, 0.5, 1); gb.v(rb[0], top, rb[1], 0, 0.5, 1); gb.tri(a, a + 1, a + 2);
      }
    }
    // soffit (underside of the overhang) so the eaves read from below
    gb.color(U.shade(b.wall, 0.75));
    gb.hquad(X0, Z0, X1, Z1, Ht - 0.05, true);
  }
  function addFrame(J, b, x0, z0, x1, z1) {
    const gb = J.gb, fl = b.floors || Math.max(1, Math.round(b.h / 10));
    gb.plain(); gb.color('#b8b4ac');
    for (let k = 0; k <= fl; k++) gb.box(x0, k * FLOOR_H, z0, x1, k * FLOOR_H + 1.2, z1, { bottom: true });
    const nx = Math.max(2, Math.round(b.w / 14)), nz = Math.max(2, Math.round(b.d / 14));
    gb.color('#a8a49c');
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
      const cx = x0 + 1 + (b.w - 2) * i / (nx - 1), cz = z0 + 1 + (b.d - 2) * j / (nz - 1);
      gb.box(cx - 0.8, 0, cz - 0.8, cx + 0.8, fl * FLOOR_H, cz + 0.8, { top: false });
    }
  }
  function addItems(J, b, Ht, ox, oz) {
    const gb = J.gb;
    gb.plain();
    for (const it of b.items) {
      const x = (it.x || 0) - ox, z = (it.y || 0) - oz;
      switch (it.t) {
        case 'tank': {
          const r = it.r || 2.2;
          gb.color('#8a8a86').box(x - r * 0.8, Ht, z - r * 0.8, x + r * 0.8, Ht + 1.2, z + r * 0.8);
          gb.color(it.black ? '#1e2224' : '#e8e2d0').cyl(x, Ht + 1.2, z, r, r * 0.95, r * 1.7, 8);
          break;
        }
        case 'mumty': {
          const h = (it.h || 8) * VS * 0.85;
          gb.color(b.wall).box(x, Ht, z, x + it.w, Ht + h, z + it.d);
          gb.color(U.shade(b.roof || '#c9bfb0', 0.95)).hquad(x - 0.4, z - 0.4, x + it.w + 0.4, z + it.d + 0.4, Ht + h + 0.3);
          gb.color('#6a4024').wall(x + it.w * 0.3, z + it.d + 0.05, x + it.w * 0.7, z + it.d + 0.05, Ht, Ht + 7);
          break;
        }
        case 'ant': {
          const h = (it.h || 10) * VS * 0.9, a = it.a || 0;
          gb.color('#55575a').box(x - 0.15, Ht, z - 0.15, x + 0.15, Ht + h, z + 0.15);
          for (let k = 0; k < 3; k++) { const y = Ht + h - k * 1.6, l = 1 - k * 0.22; gb.obox(x, z, 6 * l, 0.25, y - 0.12, y + 0.12, a); }
          if (it.kite) { gb.color(it.kite); gb.obox(x + 1.5, z, 2.2, 0.1, Ht + h + 0.5, Ht + h + 2.7, a + 0.6); }
          break;
        }
        case 'line': {
          const ax = it.x0 - ox, az = it.y0 - oz, bx = it.x1 - ox, bz = it.y1 - oz, L = Math.hypot(bx - ax, bz - az) || 1;
          const y = Ht + 4.2, ux = (bx - ax) / L, uz = (bz - az) / L;
          gb.color('#d8d4cc'); gb.box(ax - 0.2, Ht, az - 0.2, ax + 0.2, y, az + 0.2); gb.box(bx - 0.2, Ht, bz - 0.2, bx + 0.2, y, bz + 0.2);
          for (const c of it.cl || []) {
            const t = c[0] * L, w = c[2] * 1.1, px = ax + ux * t, pz = az + uz * t;
            gb.color(c[1]);
            gb.quad(px - ux * w / 2, y - 2.4, pz - uz * w / 2, px + ux * w / 2, y - 2.4, pz + uz * w / 2, px + ux * w / 2, y, pz + uz * w / 2, px - ux * w / 2, y, pz - uz * w / 2);
            gb.quad(px + ux * w / 2, y - 2.4, pz + uz * w / 2, px - ux * w / 2, y - 2.4, pz - uz * w / 2, px - ux * w / 2, y, pz - uz * w / 2, px + ux * w / 2, y, pz + uz * w / 2);
          }
          break;
        }
        case 'domeItem': {
          const r = it.r || 4, h = (it.h || 6) * VS * 0.7;
          gb.color(it.col || '#efe9dc').cyl(x, Ht, z, r * 0.9, r * 0.9, 1.6, 12, { top: false });
          gb.dome(x, Ht + 1.6, z, r * 0.9, Math.max(h, r), 12, 5);
          gb.color('#d8b850').cyl(x, Ht + 1.6 + Math.max(h, r), z, 0.3, 0.05, 2.4, 4);
          break;
        }
        case 'minaret': {
          const r = it.r || 2, h = (it.h || 40) * VS * 0.8;
          gb.color('#f2eee4').cyl(x, 0, z, r, r * 0.8, h, 8);
          gb.color('#e6dcc6').cyl(x, h * 0.62, z, r * 1.35, r * 1.35, 1.2, 8);
          gb.color('#f2eee4').dome(x, h, z, r * 0.95, r * 1.5, 8, 3);
          break;
        }
        case 'tower': {
          const h = (it.h || 16) * VS;
          gb.facade(STY.colonial, STY.colonial, 60, b.seed & 255, Math.max(1, Math.round(it.h / 10)));
          gb.color(b.wall).box(x, Ht, z, x + it.w, Ht + h, z + it.d);
          gb.plain();
          break;
        }
        case 'ac': gb.color('#c8c8c4').box(x, Ht, z, x + it.w, Ht + 3, z + it.d); break;
        case 'dish': gb.color('#e8e8e4').cyl(x, Ht, z, 0.2, 0.2, 2, 4).cyl(x, Ht + 2, z, 0.3, 1.6, 0.8, 8); break;
        case 'chilli': gb.color('#b8261a').hquad(x - 3, z - 2, x + 3, z + 2, Ht + 0.15); break;
        case 'cot': gb.color('#7a5a3a').obox(x, z, 6, 2.6, Ht + 1.5, Ht + 2, it.a || 0); break;
        case 'plants': {
          const n = it.n || 3;
          for (let k = 0; k < n; k++) { const px = x + 1 + (k / Math.max(1, n - 1)) * Math.max(0, it.w - 2); gb.color('#8a5a3a').box(px - 0.7, Ht, z - 0.7, px + 0.7, Ht + 1.2, z + 0.7); gb.color(k % 2 ? '#3f7a30' : '#4f8a3a').box(px - 1, Ht + 1.2, z - 1, px + 1, Ht + 2.6, z + 1); }
          break;
        }
        default: break;
      }
    }
  }
  function addAwning(gb, b, x0, z0, x1, z1) {
    const sg = faceSeg(b, b.front, x0, z0, x1, z1), ax = sg[0], az = sg[1], bx = sg[2], bz = sg[3];
    const L = Math.hypot(bx - ax, bz - az); if (L < 4) return;
    const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux; // outward normal
    const y0 = FLOOR_H * 0.66, y1 = FLOOR_H * 0.5, out = 3.6, n = Math.max(2, Math.round(L / 2.2));
    const c = b.awning;
    gb.plain();
    for (let k = 0; k < n; k++) {
      const t0 = 0.5 + (L - 1) * k / n, t1 = 0.5 + (L - 1) * (k + 1) / n;
      gb.color(c[k % 2]);
      const A = [ax + ux * t0, az + uz * t0], B = [ax + ux * t1, az + uz * t1];
      // top (outside) and underside
      gb.quad(A[0] + nx * out, y1, A[1] + nz * out, B[0] + nx * out, y1, B[1] + nz * out, B[0], y0, B[1], A[0], y0, A[1]);
      gb.quad(B[0] + nx * out, y1 - 0.05, B[1] + nz * out, A[0] + nx * out, y1 - 0.05, A[1] + nz * out, A[0], y0 - 0.05, A[1], B[0], y0 - 0.05, B[1]);
      // valance
      gb.quad(A[0] + nx * out, y1 - 1.1, A[1] + nz * out, B[0] + nx * out, y1 - 1.1, B[1] + nz * out, B[0] + nx * out, y1, B[1] + nz * out, A[0] + nx * out, y1, A[1] + nz * out);
    }
  }
  function addCompound(gb, cw, ox, oz) {
    const x0 = cw.x - ox, z0 = cw.y - oz, x1 = x0 + cw.w, z1 = z0 + cw.h, t = 0.9, h = 4.2, g = 9;
    gb.plain(); gb.color(cw.col || '#efe9dc');
    const seg = (a0, a1, fixed, horiz) => { if (a1 - a0 < 0.5) return; if (horiz) gb.box(a0, 0, fixed, a1, h, fixed + t); else gb.box(fixed, 0, a0, fixed + t, h, a1); };
    const side = cw.side;
    const hs = (zz, isF) => { if (!isF) seg(x0, x1, zz, true); else { const m = (x0 + x1) / 2; seg(x0, m - g / 2, zz, true); seg(m + g / 2, x1, zz, true); } };
    const vs = (xx, isF) => { if (!isF) seg(z0, z1, xx, false); else { const m = (z0 + z1) / 2; seg(z0, m - g / 2, xx, false); seg(m + g / 2, z1, xx, false); } };
    hs(z0, side === 'N'); hs(z1 - t, side === 'S'); vs(x0, side === 'W'); vs(x1 - t, side === 'E');
  }
  function addSigns(J) {
    if (!J.signs.length) return;
    const byPage = new Map();
    for (const sg of J.signs) {
      const b = sg.b, s = faceSeg(b, b.front, sg.x0, sg.z0, sg.x1, sg.z1);
      const L = Math.hypot(s[2] - s[0], s[3] - s[1]); if (L < 5) continue;
      const ux = (s[2] - s[0]) / L, uz = (s[3] - s[1]) / L, nx = -uz, nz = ux, off = 0.35;
      const w = Math.min(L - 1.2, 40), h = Math.min(5.2, Math.max(3.2, w / 5)), m = (L - w) / 2;
      const slot = signSlot(b.sign.text, b.sign.bg || '#d8402a', b.sign.fg || '#fff8e8', w / h);
      if (!slot) continue;
      let gb = byPage.get(slot.page);
      if (!gb) { gb = new GB({ facade: true }); byPage.set(slot.page, gb); }
      const y0 = FLOOR_H * 0.7, y1 = y0 + h;
      const ax = s[0] + ux * m + nx * off, az = s[1] + uz * m + nz * off, bx = s[0] + ux * (m + w) + nx * off, bz = s[1] + uz * (m + w) + nz * off;
      gb.color('#ffffff');
      gb.quad(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, [slot.u0, slot.v0, slot.u1, slot.v1]);
    }
    for (const [page, gb] of byPage) {
      const g = gb.build(); if (!g) continue;
      g.deleteAttribute('facade'); g.deleteAttribute('color');
      const mesh = new THREE.Mesh(g, page.mat);
      mesh.name = 'signs';
      J.out.push(mesh);
    }
    flushSignPages();
  }
  function addLamp(J, s) {
    const gb = J.gb, x = s.x - J.ox, z = s.y - J.oz, h = (s.h || 24) * VS * 0.85, tube = !!s.tube;
    gb.plain(); gb.color('#5d6064');
    gb.box(x - 0.55, 0, z - 0.55, x + 0.55, h, z + 0.55, { top: false });
    gb.color('#8a8c8e').box(x - 1, 0, z - 1, x + 1, 2, z + 1, { top: false });
    for (const a of s.arms || []) {
      const L = Math.hypot(a[0], a[1]) * 1.3 || 1, ang = Math.atan2(a[1], a[0]);
      const ux = Math.cos(ang), uz = Math.sin(ang);
      gb.color('#5d6064').obox(x + ux * L / 2, z + uz * L / 2, L, 0.5, h - 0.4, h + 0.2, ang);
      const hx = x + ux * L, hz = z + uz * L;
      gb.color('#4a4c50').obox(hx, hz, tube ? 4 : 3.4, 1.4, h - 0.6, h + 0.4, ang);
      gb.facade(STY.lamp, STY.lamp, 0, 0, 1); gb.color(tube ? '#d8f4ff' : '#ffab40');
      gb.obox(hx, hz, tube ? 3.4 : 2.6, 1.0, h - 1.0, h - 0.55, ang, { top: false });
      gb.plain();
      J.glows.push([hx, h - 1.2, hz].concat(tube ? [0.75, 0.92, 1.0, 0.8] : [1.0, 0.62, 0.25, 1.0]));
      J.lamps.push([hx + J.ox, h - 2, hz + J.oz, tube ? 0xd8f4ff : 0xffab40]);
    }
  }
  function addTree(J, s) {
    const K = TREEK[s.kind] || TREEK.neem;
    const palm = s.kind === 'palm' || s.kind === 'coconut';
    const x = s.x - J.ox, z = s.y - J.oz, h = (s.h || 22) * VS * 0.95, r = s.r || 9;
    const seed = ((s.x * 73.1) ^ (s.y * 19.7)) >>> 0, rng = U.rng(seed);
    if (palm) {
      const th = h * 0.92, lean = (rng.next() - 0.5) * 0.12;
      J.trunks.push([x, 0, z, 0.55, th, 0.55, lean, rng.next() * TAU, '#7a6448']);
      J.crowns.push([x - Math.sin(lean) * th, th, z, r * 0.95, r * 0.75, r * 0.95, rng.next() * TAU, K[(seed >> 3) % 4]]);
      if (s.kind === 'coconut') for (let k = 0; k < 3; k++) J.blobs.push([x - Math.sin(lean) * th + (rng.next() - 0.5) * 1.6, th - 0.6, z + (rng.next() - 0.5) * 1.6, 0.6, 0.6, 0.6, 0, '#6a5a2a']);
      return;
    }
    const banyan = s.kind === 'banyan';
    const th = h * (banyan ? 0.42 : 0.48), tw = banyan ? 1.9 : 0.75 + r * 0.05;
    J.trunks.push([x, 0, z, tw, th + r * 0.3, tw, 0, rng.next() * TAU, banyan ? '#6a5a48' : '#5b4632']);
    const R = r * 1.05, cy = th + R * 0.55;
    const blobs = (s.blobs && s.blobs.length ? s.blobs : [[0, 0, r * 0.6]]).slice().sort((p, q) => q[2] - p[2]).slice(0, banyan ? 6 : 4);
    for (let k = 0; k < blobs.length; k++) {
      const bl = blobs[k], br = Math.max(2.4, bl[2] * 1.35);
      let c = K[(k + (seed & 3)) % 4];
      if (s.kind === 'gulmohar' && k % 2 === 0) c = FLOWERS[(seed + k) % 3];
      J.blobs.push([x + bl[0] * 1.05, cy + (rng.next() - 0.35) * R * 0.35 + (k === 0 ? R * 0.15 : 0), z + bl[1] * 1.05, br, br * (0.78 + rng.next() * 0.2), br, rng.next() * TAU, c]);
    }
    if (banyan) for (let k = 0; k < 5; k++) { const a = rng.next() * TAU, d = r * (0.3 + rng.next() * 0.5); J.trunks.push([x + Math.cos(a) * d, 0, z + Math.sin(a) * d, 0.18, cy - 2, 0.18, 0, 0, '#7a6a58']); }
  }
  function addRock(J, s) {
    const x = s.x - J.ox, z = s.y - J.oz, rng = U.rng(((s.x * 31) ^ (s.y * 17)) >>> 0);
    for (const p of s.parts || [[0, 0, s.r, 0, s.h]]) {
      const r = p[2], h0 = p[3] || 0, h1 = p[4] || s.h, hh = (h1 - h0) * 1.15;
      const base = h0 > 0 ? h0 * 1.15 : -hh * 0.25;
      J.rocks.push([x + p[0], base + hh * 0.5, z + p[1], r * 1.02, hh * 0.56, r * (0.85 + rng.next() * 0.15), rng.next() * TAU, s.col || '#8f8a86']);
    }
  }
  function addRail(J, s) {
    J.gb.plain(); J.gb.color('#c4bcae');
    const pts = s.pts.map((p) => [p[0] - J.ox, p[1] - J.oz]);
    J.gb.extrude(pts, 0, 4.5);
  }
  function addRoofZone(J, s) {
    const r = s.roof; if (!r) return;
    const gb = J.gb, x0 = r.x - J.ox, z0 = r.y - J.oz, x1 = x0 + r.w, z1 = z0 + r.d, h = r.h * VS, ph = 3.6, t = 1.2;
    if (r.lm) return; // landmark roofs are the landmark model's job
    gb.plain(); gb.color(r.data && r.data.wall ? U.shade(r.data.wall, 1.08) : '#e8e0cc');
    gb.box(x0, h, z0, x1, h + ph, z0 + t); gb.box(x0, h, z1 - t, x1, h + ph, z1);
    gb.box(x0, h, z0 + t, x0 + t, h + ph, z1 - t); gb.box(x1 - t, h, z0 + t, x1, h + ph, z1 - t);
    if (r.mumty) {
      const m = r.mumty, mx = m.x - J.ox, mz = m.y - J.oz, mh = (m.h || 8) * VS * 0.85;
      gb.color(r.data && r.data.wall ? r.data.wall : '#d8cbb0').box(mx, h, mz, mx + m.w, h + mh, mz + m.d);
      gb.color('#6a4024');
      const dw = 3.2;
      if (m.door === 's') gb.wall(mx + m.w / 2 - dw / 2, mz + m.d + 0.05, mx + m.w / 2 + dw / 2, mz + m.d + 0.05, h, h + 7);
      else if (m.door === 'n') gb.wall(mx + m.w / 2 + dw / 2, mz - 0.05, mx + m.w / 2 - dw / 2, mz - 0.05, h, h + 7);
      else if (m.door === 'e') gb.wall(mx + m.w + 0.05, mz + m.d / 2 + dw / 2, mx + m.w + 0.05, mz + m.d / 2 - dw / 2, h, h + 7);
      else gb.wall(mx - 0.05, mz + m.d / 2 - dw / 2, mx - 0.05, mz + m.d / 2 + dw / 2, h, h + 7);
      if (r.tank) gb.color('#1e2224').cyl(r.tank.x - J.ox, h + mh, r.tank.y - J.oz, r.tank.r || 2.3, (r.tank.r || 2.3) * 0.95, 3.8, 8);
    }
    if (r.antenna) {
      const a = r.antenna, ax = a.x - J.ox, az = a.y - J.oz, ah = (a.h || 11) * VS * 0.9;
      gb.color('#55575a').box(ax - 0.15, h, az - 0.15, ax + 0.15, h + ah, az + 0.15);
      for (let k = 0; k < 3; k++) { const y = h + ah - k * 1.6, l = 1 - k * 0.22; gb.obox(ax, az, 6 * l, 0.25, y - 0.12, y + 0.12, a.a || 0); }
    }
    if (r.line) addItems(J, { items: [Object.assign({ t: 'line' }, r.line)], wall: '#ccc', roof: '#ccc' }, h, J.ox, J.oz);
    for (const p of r.planks || []) {
      if (p.ra !== r) continue;
      const [px, py, pw, pd] = p.rect, hy = (p.ra.h + p.rb.h) / 2 * VS + 0.3;
      gb.color('#8a6a48').box(px - J.ox, hy - 0.5, py - J.oz, px - J.ox + pw, hy, py - J.oz + pd, { bottom: true });
    }
  }
  function addCrane(J, s) {
    const gb = J.gb, x = s.x - J.ox, z = s.y - J.oz, h = (s.h || 80) * VS * 0.8;
    gb.plain(); gb.color('#e0b020');
    gb.box(x - 1.2, 0, z - 1.2, x + 1.2, h, z + 1.2);
    gb.obox(x + Math.cos(s.a) * s.len * 0.35, z + Math.sin(s.a) * s.len * 0.35, s.len * 1.3, 1.6, h, h + 1.8, s.a);
    gb.color('#5a5a5a').box(x - 2.5, h - 4, z - 2.5, x + 2.5, h, z + 2.5);
  }
  function addPodium(J, s) {
    const gb = J.gb, x = s.x - J.ox, z = s.y - J.oz;
    gb.plain(); gb.color('#efe9dc').cyl(x, 0, z, 3.4, 3.2, 3, 10);
    gb.color('#d8402a').cyl(x, 3, z, 0.18, 0.18, 9, 4);
    gb.color('#f2c230').cyl(x, 11, z, 6, 0.3, 2.2, 10);
  }
  function addRailway(J, segs) {
    const gb = J.gb; gb.plain();
    for (const sg of segs) {
      const ax = sg[0] - J.ox, az = sg[1] - J.oz, bx = sg[2] - J.ox, bz = sg[3] - J.oz, L = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (const sd of [-4, 4]) {
        const o0x = ax + nx * sd, o0z = az + nz * sd, o1x = bx + nx * sd, o1z = bz + nz * sd, w = 0.35;
        gb.color('#8a8c90');
        gb.quad(o0x - nx * w, 0.9, o0z - nz * w, o0x + nx * w, 0.9, o0z + nz * w, o1x + nx * w, 0.9, o1z + nz * w, o1x - nx * w, 0.9, o1z - nz * w);
        gb.color('#4a4038');
        gb.wall(o0x + nx * w, o0z + nz * w, o1x + nx * w, o1z + nz * w, 0, 0.9); gb.wall(o1x - nx * w, o1z - nz * w, o0x - nx * w, o0z - nz * w, 0, 0.9);
      }
    }
  }

  // Chunk geometry job (resumable: structures are added in slices within the frame budget)
  function startGeom(ch, detail) {
    const J = { ch, detail, ox: ch.x0, oz: ch.y0, list: [], i: 0, gb: new GB({ facade: true, cap: detail ? 8192 : 2048 }), trunks: [], blobs: [], crowns: [], rocks: [], glows: [], signs: [], lamps: [], out: [] };
    const x1 = ch.x0 + CH, y1 = ch.y0 + CH;
    N.world.queryStructures(ch.x0, ch.y0, x1, y1, (s) => {
      if (s.t === 'landmark') return;
      if (s.cx < ch.x0 || s.cx >= x1 || s.cy < ch.y0 || s.cy >= y1) return; // owned by the chunk of its centre
      J.list.push(s);
    });
    ch.gjob = J;
    return J;
  }
  function stepGeom(J, deadline) {
    const L = J.list;
    while (J.i < L.length) {
      const s = L[J.i++];
      try {
        const custom = STRUCT.get(s.t);
        if (custom) { const o = custom(THREE, s, H, J.gb, J); if (o && o.isObject3D) { o.position.x -= J.ox; o.position.z -= J.oz; J.out.push(o); } }
        else switch (s.t) {
          case 'bldg': addBldg(J, s); break;
          case 'tree': addTree(J, s); break;
          case 'lamp': addLamp(J, s); break;
          case 'rock': addRock(J, s); break;
          case 'wall': J.gb.plain(); J.gb.color(s.col || '#efe9dc').box(s.x - J.ox, 0, s.y - J.oz, s.x - J.ox + s.w, s.h || 6, s.y - J.oz + s.d); break;
          case 'rail': addRail(J, s); break;
          case 'roofzone': if (J.detail) addRoofZone(J, s); break;
          case 'crane': addCrane(J, s); break;
          case 'podium': if (J.detail) addPodium(J, s); break;
          default: break;
        }
      } catch (e) { N.err('view3d.struct:' + s.t, e); }
      if ((J.i & 15) === 0 && now() > deadline) return false;
    }
    return true;
  }
  const TM4 = () => new THREE.Matrix4();
  function finishGeom(J) {
    const ch = J.ch, out = J.out;
    if (railSegs && railSegs.has(ch.key)) addRailway(J, railSegs.get(ch.key));
    const bm = J.gb.mesh(MAT.facade);
    if (bm) { bm.name = 'buildings'; bm.castShadow = Q.shadows; bm.receiveShadow = Q.shadows; out.push(bm); }
    if (J.detail) addSigns(J);
    const m4 = TM4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    const inst = (geo, material, list, name, shadow, upright) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, material, list.length);
      for (let k = 0; k < list.length; k++) {
        const a = list[k];
        p.set(a[0], a[1], a[2]); sc.set(a[3], a[4], a[5]);
        if (upright) e.set(0, a[7], a[6]); else e.set(0, a[6], 0);
        q.setFromEuler(e); m4.compose(p, q, sc);
        im.setMatrixAt(k, m4);
        c.set(upright ? a[8] : a[7]); im.setColorAt(k, c);
      }
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false; // r149 culls instances by the base geometry: the chunk group is culled instead
      im.castShadow = shadow && Q.shadows; im.receiveShadow = false; im.name = name;
      out.push(im);
    };
    if (!MAT.trunkI) { MAT.trunkI = new THREE.MeshLambertMaterial(); MAT.trunkI.onBeforeCompile = trunkCompile; MAT.trunkI.customProgramCacheKey = () => 'nostalgia-trunk'; MAT.trunkI.userData.shared = true; }
    inst(H.geo.trunk, MAT.trunkI, J.trunks, 'trunks', true, true);
    inst(H.geo.blob, MAT.canopy, J.blobs, 'canopies', true, false);
    inst(H.geo.crown, MAT.canopy, J.crowns, 'crowns', true, false);
    inst(H.geo.rock, MAT.rock, J.rocks, 'rocks', true, false);
    if (J.glows.length) {
      const g = new THREE.BufferGeometry(), pos = new Float32Array(J.glows.length * 3), cc = new Float32Array(J.glows.length * 3);
      J.glows.forEach((a, k) => { pos[k * 3] = a[0]; pos[k * 3 + 1] = a[1]; pos[k * 3 + 2] = a[2]; cc[k * 3] = a[3] * a[6]; cc[k * 3 + 1] = a[4] * a[6]; cc[k * 3 + 2] = a[5] * a[6]; });
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      g.computeBoundingSphere();
      const pts = new THREE.Points(g, MAT.glow); pts.name = 'glows'; pts.renderOrder = 2; pts.frustumCulled = false;
      out.push(pts);
    }
    // swap in
    clearChunkGeom(ch);
    for (const o of out) { o.matrixAutoUpdate = false; o.updateMatrix(); ch.group.add(o); ch.objs.push(o); }
    ch.lights = J.lamps;
    let top = 40;
    for (const o of out) if (o.geometry && o.geometry.boundingBox) top = Math.max(top, o.geometry.boundingBox.max.y);
    ch.top = Math.max(top, 60);
    ch.detail = J.detail;
    ch.gjob = null;
    ch.dirty = false;
  }

  /* ---------------------------------------------------- the work scheduler */
  let lastPlan = { x: -1e9, y: -1e9, t: 0 }, planList = [];
  function plan(fx, fy) {
    // chunks wanted around the focus, nearest first, with their detail / ground resolution
    sizeChunks(); // [ground hook] the world size may have changed (map v2)
    const r = Q.drawDist + CH * 0.75;
    const ci0 = Math.max(0, Math.floor((fx - r) / CH)), ci1 = Math.min(CW - 1, Math.floor((fx + r) / CH));
    const cj0 = Math.max(0, Math.floor((fy - r) / CH)), cj1 = Math.min(CHn - 1, Math.floor((fy + r) / CH));
    planList = [];
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const x0 = ci * CH, y0 = cj * CH;
      const dx = Math.max(x0 - fx, 0, fx - x0 - CH), dy = Math.max(y0 - fy, 0, fy - y0 - CH), d = Math.hypot(dx, dy);
      if (d > Q.drawDist + 60) continue;
      planList.push({ ci, cj, d });
    }
    planList.sort((a, b) => a.d - b.d);
    lastPlan.x = fx; lastPlan.y = fy; lastPlan.t = now();
  }
  function wantFor(d) {
    return { detail: d < Q.nearDist ? 1 : 0, res: d < Q.nearDist * 0.75 ? Q.groundHi : d < Q.nearDist * 1.5 ? Math.max(Q.groundLo, Q.groundHi / 2) : Q.groundLo };
  }
  let workMs = 0;
  /** build / upgrade chunks around (fx, fy) within budget ms; returns true when nothing near is missing */
  function updateWork(fx, fy, budget) {
    const t0 = now(), deadline = t0 + budget;
    if (Math.hypot(fx - lastPlan.x, fy - lastPlan.y) > 48 || t0 - lastPlan.t > 800) plan(fx, fy);
    const keep = new Set();
    // pass 1: missing things (nearest first); pass 2: upgrades / stale repaints
    for (let pass = 0; pass < 2; pass++) {
      for (const it of planList) {
        const key = ckey(it.ci, it.cj);
        keep.add(key);
        let ch = chunks.get(key);
        if (!ch) { if (pass) continue; ch = newChunk(it.ci, it.cj); }
        ch.dist = it.d;
        const w = wantFor(it.d);
        // downgrade far chunks again (with hysteresis) so a long trip never piles up hi-res textures
        const far = it.d > Q.nearDist * 1.8;
        const downRes = far && ch.groundRes > w.res, downGeo = far && ch.detail > w.detail;
        const needGeom = ch.detail < 0 || ch.dirty || (pass === 1 && (w.detail > ch.detail || downGeo));
        // [ground hook] the ground provider decides what its chunks still need
        const gp = gpOn();
        const needGround = gp ? gp.need(ch, it.d, pass) : !ch.groundRes || (pass === 1 && (w.res > ch.groundRes || ch.groundStale || downRes));
        if (!needGeom && !needGround) continue;
        if (now() > deadline) break;
        if (needGeom && (pass === 1 || ch.detail < 0 || ch.dirty)) {
          let J = ch.gjob;
          if (!J || J.detail !== w.detail) J = startGeom(ch, w.detail);
          if (stepGeom(J, deadline)) finishGeom(J);
        }
        if (needGround && now() < deadline && gp) gp.step(ch, it.d, deadline); // [ground hook]
        else if (needGround && now() < deadline) {
          // never interleave two paint jobs: finish the current one first
          if (paintJob && paintJob.ch !== ch && chunks.has(paintJob.ch.key)) stepPaint(paintJob.ch, paintJob.res, deadline);
          else stepPaint(ch, ch.groundRes && !ch.groundStale && !downRes ? Math.max(w.res, ch.groundRes) : w.res, deadline);
        }
      }
      if (now() > deadline) break;
    }
    // landmarks
    if (now() < deadline) updateLandmarks(fx, fy, deadline);
    // drop far chunks (a few per call; disposal is cheap)
    if (planList.length) {
      let n = 0;
      for (const ch of Array.from(chunks.values())) {
        if (farChunk(ch, fx, fy)) { disposeChunk(ch); if (++n >= 8) break; }
      }
    }
    workMs = now() - t0;
  }
  function farChunk(ch, fx, fy) {
    const dx = Math.max(ch.x0 - fx, 0, fx - ch.x0 - CH), dy = Math.max(ch.y0 - fy, 0, fy - ch.y0 - CH);
    return Math.hypot(dx, dy) > Q.drawDist + CH;
  }
  function nearReady(fx, fy) {
    for (const it of planList) {
      if (it.d > Math.min(Q.nearDist, 500)) break;
      const ch = chunks.get(ckey(it.ci, it.cj));
      const gp = gpOn(); // [ground hook]
      if (!ch || ch.detail < 0 || (gp ? gp.pending(ch, it.d) : !ch.groundRes) || ch.gjob) return false;
    }
    return planList.length > 0;
  }

  /* ================================================================ landmarks */
  const LMB = new Map();       // draw id (or '#landmarkId') -> {build, opts}
  const lmRecs = new Map();    // landmark id -> {lm, obj, reg}
  let lmCheckT = 0, lmQueue = [];
  const lmUpdaters = new Set();
  function rectDist(x0, y0, x1, y1, fx, fy) { const dx = Math.max(x0 - fx, 0, fx - x1), dy = Math.max(y0 - fy, 0, fy - y1); return Math.hypot(dx, dy); }
  function lmD(lm, fx, fy) { return rectDist(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.x + lm.w / 2, lm.y + lm.d / 2, fx, fy); }
  function landmarkReg(lm) { return LMB.get('#' + lm.id) || LMB.get(lm.draw) || null; }
  function updateLandmarks(fx, fy, deadline) {
    const L = (N.world.data && N.world.data.landmarks) || [];
    if (now() - lmCheckT > 350) {
      lmCheckT = now();
      lmQueue = [];
      for (const lm of L) {
        const d = lmD(lm, fx, fy), rec = lmRecs.get(lm.id);
        const reach = Q.lmDist + Math.max(lm.w, lm.d) * 0.5 + (lm.h || 0) * 2;
        if (rec) {
          if (d > reach * 1.2 || rec.reg !== landmarkReg(lm)) disposeLandmark(lm.id);
          continue;
        }
        if (d <= reach) lmQueue.push([d, lm]);
      }
      lmQueue.sort((a, b) => a[0] - b[0]);
    }
    while (lmQueue.length && now() < deadline) buildLandmark(lmQueue.shift()[1]);
  }
  function buildLandmark(lm) {
    if (lmRecs.has(lm.id)) return;
    const reg = landmarkReg(lm);
    let obj;
    try { obj = reg ? reg.build(THREE, lm, H) : null; } catch (e) { N.err('view3d.landmark:' + lm.draw, e); obj = null; }
    if (obj === false) { lmRecs.set(lm.id, { lm, obj: null, reg }); return; }
    if (!obj || !obj.isObject3D) obj = fallbackLandmark(lm);
    if (!obj.userData.worldSpace) obj.position.set(lm.x + obj.position.x, obj.position.y, lm.y + obj.position.z);
    const shadow = Q.shadows && !(reg && reg.opts && reg.opts.castShadow === false);
    obj.traverse((m) => { if (m.isMesh) { m.castShadow = shadow && m.userData.noShadow !== true; m.receiveShadow = Q.shadows; } });
    obj.name = obj.name || 'lm:' + lm.id;
    obj.updateMatrixWorld(true);
    if (reg && reg.opts && reg.opts.static !== false && !(reg.opts && reg.opts.update)) obj.traverse((m) => { m.matrixAutoUpdate = false; });
    E.lmGroup.add(obj);
    const rec = { lm, obj, reg };
    lmRecs.set(lm.id, rec);
    if (reg && reg.opts && reg.opts.update) lmUpdaters.add(rec);
  }
  function disposeLandmark(id) {
    const rec = lmRecs.get(id); if (!rec) return;
    lmRecs.delete(id); lmUpdaters.delete(rec);
    if (rec.obj) { E.lmGroup.remove(rec.obj); if (rec.reg && rec.reg.opts && rec.reg.opts.dispose) { try { rec.reg.opts.dispose(rec.obj, rec.lm, H); } catch (e) { N.err('view3d.lmDispose', e); } } disposeObj(rec.obj); }
  }
  const LM_COLORS = [[/temple|mandir|gudi|church|cathedral/, '#efe7d6'], [/masjid|mosque|dargah|tomb|minar|charminar|kaman|darwaza|gate|fort|wall|hissar/, '#d9c49c'], [/station|hospital|court|assembly|college|school|museum|library|office|bank|hotel|tower|cinema|theatre|talkies/, '#e6d4b4'], [/hitec|cyber|mall|plaza/, '#6f97a8']];
  function lmColor(lm) {
    const s = (lm.id + ' ' + (lm.name || '') + ' ' + lm.draw).toLowerCase();
    for (const [re, c] of LM_COLORS) if (re.test(s)) return c;
    return '#dccfb4';
  }
  /** decent generic landmark: footprint extruded with stone/office facades, parapet, corner towers for tall square ones */
  function fallbackLandmark(lm) {
    const gb = new GB({ facade: true });
    const w = lm.w, d = lm.d, h = Math.max(4, (lm.h || 20) * VS), c = lmColor(lm), x0 = -w / 2, z0 = -d / 2, x1 = w / 2, z1 = d / 2;
    const name = (lm.id + ' ' + lm.draw).toLowerCase();
    const stone = /masjid|mosque|tomb|minar|charminar|kaman|darwaza|gate|fort|wall|hissar|temple|mandir|statue/.test(name);
    const glassy = /hitec|cyber|mall/.test(name);
    const style = glassy ? STY.glass : stone ? STY.stone : STY.office;
    const fl = Math.max(1, Math.round((lm.h || 20) / 10));
    gb.color(c);
    if (lm.noSolid || lm.solid === false) {
      // a gateway: two piers and a lintel (walk / drive under it)
      const t = Math.min(w, d) * 0.3, along = w >= d;
      gb.facade(STY.stone, STY.stone, 0, 3, fl);
      if (along) { gb.box(x0, 0, z0, x0 + Math.min(t * 1.4, w * 0.2), h, z1); gb.box(x1 - Math.min(t * 1.4, w * 0.2), 0, z0, x1, h, z1); gb.box(x0, h * 0.68, z0, x1, h, z1); }
      else { gb.box(x0, 0, z0, x1, h, z0 + Math.min(t * 1.4, d * 0.2)); gb.box(x0, 0, z1 - Math.min(t * 1.4, d * 0.2), x1, h, z1); gb.box(x0, h * 0.68, z0, x1, h, z1); }
    } else if (lm.solids && lm.solids.length > 1) {
      gb.facade(style, style, 70, 7, fl);
      for (const r of lm.solids) gb.box(r[0] - lm.x, 0, r[1] - lm.y, r[0] - lm.x + r[2], h, r[1] - lm.y + r[3]);
    } else if (Math.max(w, d) <= 24 && (lm.h || 0) * VS > Math.max(w, d) * 1.5) {
      // statue / pillar: pedestal, column, figure-ish top
      gb.plain(); gb.color(U.shade(c, 0.92));
      gb.box(x0, 0, z0, x1, h * 0.28, z1);
      gb.color(U.shade(c, 1.05)).box(x0 + w * 0.12, h * 0.28, z0 + d * 0.12, x1 - w * 0.12, h * 0.34, z1 - d * 0.12);
      gb.color(/statue|buddha/.test(name) ? '#9a9890' : c).cyl(0, h * 0.34, 0, Math.min(w, d) * 0.26, Math.min(w, d) * 0.2, h * 0.52, 10);
      gb.sphere(0, h * 0.92, 0, Math.min(w, d) * 0.18, Math.min(w, d) * 0.22, Math.min(w, d) * 0.18, 8, 6);
    } else if (stone && (lm.h || 0) * VS > Math.max(w, d) * 0.9 && Math.abs(w - d) < Math.max(w, d) * 0.35) {
      // monument: arched body + four corner towers + dome
      const t = Math.min(w, d) * 0.16, bh = h * 0.55;
      gb.facade(STY.arch, STY.arcade, 40, 9, Math.max(1, Math.round(bh / FLOOR_H)));
      gb.box(x0 + t * 0.5, 0, z0 + t * 0.5, x1 - t * 0.5, bh, z1 - t * 0.5);
      gb.plain(); gb.color(U.shade(c, 1.08));
      for (const [cx, cz] of [[x0 + t / 2, z0 + t / 2], [x1 - t / 2, z0 + t / 2], [x0 + t / 2, z1 - t / 2], [x1 - t / 2, z1 - t / 2]]) {
        gb.cyl(cx, 0, cz, t * 0.62, t * 0.5, h * 0.92, 10);
        gb.cyl(cx, h * 0.6, cz, t * 0.8, t * 0.8, 1.6, 10);
        gb.dome(cx, h * 0.92, cz, t * 0.55, t * 0.9, 8, 3);
      }
      gb.dome(0, bh, 0, Math.min(w, d) * 0.22, Math.min(w, d) * 0.22, 12, 4);
    } else {
      gb.facade(style, stone ? STY.arcade : style, glassy ? 120 : 70, 5, fl);
      gb.box(x0, 0, z0, x1, h, z1);
      gb.plain(); gb.color(U.shade(c, 1.05));
      const t = 1.1, ph = 3.5;
      gb.box(x0, h, z0, x1, h + ph, z0 + t); gb.box(x0, h, z1 - t, x1, h + ph, z1); gb.box(x0, h, z0 + t, x0 + t, h + ph, z1 - t); gb.box(x1 - t, h, z0 + t, x1, h + ph, z1 - t);
    }
    const m = gb.mesh(stone ? MAT.facadeLit : MAT.facade);
    const g = new THREE.Group(); if (m) g.add(m);
    g.userData.fallback = true;
    return g;
  }

  /* ================================================================ actors */
  const ACT = { specs: new Map(), recs: new Map(), frame: 0 };
  function specFor(e) {
    const S = ACT.specs;
    let s;
    if (e.view3d && (s = S.get(e.view3d))) return s;
    if (e === N.player && (s = S.get('player'))) return s;
    const sub = e.type || e.species || e.npcId || e.role || e.sub;
    if (sub && (s = S.get(e.kind + ':' + sub))) return s;
    if (e.kind && (s = S.get(e.kind))) return s;
    return S.get('*') || null;
  }
  function syncActors(dt, fx, fy) {
    const fr = ++ACT.frame;
    const p = N.player;
    let list;
    try { list = N.entities.query(fx, fy, Q.actorDist); } catch (e) { list = []; }
    if (p && list.indexOf(p) < 0) list.push(p);
    if (p && p.vehicle && list.indexOf(p.vehicle) < 0) list.push(p.vehicle);
    const fps = view.mode === 'fps';
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.alive === false) continue;
      let rec = ACT.recs.get(e);
      const spec = specFor(e);
      if (!spec) continue;
      if (!rec || rec.spec !== spec) {
        if (rec) disposeActor(e, rec);
        let obj = null;
        try { obj = spec.create(e, H); } catch (er) { N.err('view3d.actor.create:' + (e.kind || '?'), er); }
        if (!obj) { ACT.recs.set(e, { spec, obj: null, wrap: null, seen: fr }); continue; }
        const wrap = new THREE.Group(); wrap.add(obj);
        if (Q.shadows && spec.shadow !== false) obj.traverse((m) => { if (m.isMesh && m.userData.noShadow !== true) m.castShadow = true; });
        E.actorGroup.add(wrap);
        rec = { spec, obj, wrap, seen: fr };
        ACT.recs.set(e, rec);
      }
      rec.seen = fr;
      if (!rec.obj) continue;
      try { if (spec.update) spec.update(rec.obj, e, dt, H); } catch (er) { N.err('view3d.actor.update:' + (e.kind || '?'), er); }
      let vis = true;
      if (fps && !spec.fps && (e === p || (p && e === p.vehicle))) vis = false;
      if (e === p && view.mode === 'tps' && CAM.distCur < 6) vis = false;
      rec.wrap.visible = vis;
    }
    for (const [e, rec] of ACT.recs) if (rec.seen !== fr) disposeActor(e, rec);
  }
  function disposeActor(e, rec) {
    ACT.recs.delete(e);
    if (!rec.obj) return;
    try { if (rec.spec.dispose) rec.spec.dispose(rec.obj, e, H); } catch (er) { N.err('view3d.actor.dispose', er); }
    E.actorGroup.remove(rec.wrap);
    disposeObj(rec.wrap);
  }
  function clearActors() { for (const [e, rec] of Array.from(ACT.recs)) disposeActor(e, rec); }

  // ---- temporary default renderers (view3d_actors.js replaces them with registerActorRenderer)
  function personGeo(look, kid) {
    const gb = new GB(), s = kid ? 0.78 : 1;
    const skin = look.skin || '#b97a4f', shirt = look.shirt || look.saree || '#d8d0c0', pants = look.pants || look.lungi || '#3a3a48', hair = look.hair || '#1e1612';
    gb.color(pants).box(-0.9 * s, 0, -0.75 * s, 0.9 * s, 3.6 * s, 0.75 * s);
    gb.color(shirt).cyl(0, 3.4 * s, 0, 1.5 * s, 1.25 * s, 3.6 * s, 8);
    gb.color(skin).cyl(-1.75 * s, 3.9 * s, 0, 0.36 * s, 0.36 * s, 2.8 * s, 5).cyl(1.75 * s, 3.9 * s, 0, 0.36 * s, 0.36 * s, 2.8 * s, 5);
    gb.color(skin).sphere(0, 8.1 * s, 0, 1.2 * s, 1.35 * s, 1.2 * s, 8, 6);
    gb.color(hair).sphere(-0.15 * s, 8.6 * s, 0, 1.25 * s, 0.95 * s, 1.25 * s, 8, 4);
    gb.color('#1a1414').box(0.95 * s, 8.15 * s, -0.55 * s, 1.18 * s, 8.45 * s, -0.25 * s).box(0.95 * s, 8.15 * s, 0.25 * s, 1.18 * s, 8.45 * s, 0.55 * s); // eyes (face +x)
    return gb.build();
  }
  const DEF_PERSON = {
    create(e, Hh) {
      const look = e.look || {};
      const kid = e === N.player || look.kind === 'kid' || look.kind === 'student' || look.age === 'kid';
      const m = new THREE.Mesh(personGeo(look, kid), MAT.vc);
      m.name = 'person';
      if (!Q.shadows) m.add(Hh.blobShadow(kid ? 5 : 6));
      return m;
    },
    update(o, e) {
      o.position.set(e.x, elevation(e), e.y);
      const a = isFinite(e.facing) ? e.facing : e.angle || 0;
      o.rotation.y = -a;
      const sp = Math.hypot(e.vx || 0, e.vy || 0);
      o.position.y += sp > 5 ? Math.abs(Math.sin(N.time.now * (sp > 60 ? 14 : 9))) * 0.35 : 0;
      o.visible = !e.vehicle || (e.vehicle.T && e.vehicle.T.cls === 'bike');
      if (e.vehicle && o.visible) o.position.y += 2.5;
    },
  };
  const VH = { bike: 6.5, auto: 11, car: 9, heavy: 17, boat: 4 };
  const DEF_VEHICLE = {
    create(e) {
      const T = e.T || (N.vehicles && N.vehicles.TYPES[e.type]) || { w: 20, d: 10, h: 10, cls: 'car' };
      const gb = new GB(), L = T.w, Wd = T.d, cls = T.cls || 'car', h = VH[cls] || 9, c = e.color || '#c0392b';
      if (cls === 'bike') {
        gb.color('#1a1a1a').obox(-L * 0.36, 0, 3.4, 0.7, 0, 3.4, 0).obox(L * 0.36, 0, 3.4, 0.7, 0, 3.4, 0);
        gb.color(c).obox(0, 0, L * 0.7, Wd * 0.45, 2.2, 3.6, 0);
        gb.color('#2a2a2a').obox(-L * 0.1, 0, L * 0.3, Wd * 0.5, 3.6, 4.4, 0);
        gb.color('#888').obox(L * 0.32, 0, 0.5, Wd * 0.9, 4.4, 5.6, 0);
      } else if (cls === 'boat') {
        gb.color(c).obox(0, 0, L, Wd, -0.5, 2.4, 0); gb.color(e.color2 || '#c0392b').obox(0, 0, L * 0.98, Wd * 0.98, 2.4, 2.9, 0);
      } else {
        gb.color(c).obox(0, 0, L, Wd, 1.4, h * 0.55, 0);
        gb.color(cls === 'auto' ? '#1a1214' : U.shade(c, 0.9)).obox(cls === 'auto' ? -L * 0.05 : -L * 0.08, 0, L * (cls === 'heavy' ? 0.96 : 0.6), Wd * 0.94, h * 0.55, h, 0);
        gb.color('#2a3540').obox(cls === 'heavy' ? L * 0.47 : L * 0.2, 0, 0.4, Wd * 0.8, h * 0.6, h * 0.92, 0);
        gb.color('#151515');
        for (const sx of [-0.32, 0.32]) for (const sz of [-0.5, 0.5]) gb.obox(L * sx, Wd * sz, 3.4, 1.2, 0, 3.0, 0);
      }
      const m = new THREE.Mesh(gb.build(), MAT.vc); m.name = 'vehicle';
      if (!Q.shadows && cls !== 'boat') { const b = H.blobShadow(L * 1.1, Wd * 1.3); m.add(b); }
      return m;
    },
    update(o, e) { o.position.set(e.x, (e.T && e.T.cls === 'boat') ? 0.6 : 0, e.y); o.rotation.y = -(e.angle || 0); },
  };
  const DEF_MISC = {
    create(e) {
      const gb = new GB();
      if (e.kind === 'animal') gb.color(e.color || '#8a6a4a').obox(0, 0, (e.r || 4) * 2.2, (e.r || 4) * 0.9, 1.5, (e.r || 4) * 1.3, 0);
      else gb.color(e.color || '#f2c230').box(-1.5, 1, -1.5, 1.5, 4, 1.5);
      const m = new THREE.Mesh(gb.build(), MAT.vc); m.name = e.kind || 'thing';
      return m;
    },
    update(o, e) { o.position.set(e.x, elevation(e), e.y); o.rotation.y = -(e.angle || 0); },
  };
  const DEFAULT_SPECS = { player: DEF_PERSON, ped: DEF_PERSON, npc: DEF_PERSON, vehicle: DEF_VEHICLE, animal: DEF_MISC, pickup: DEF_MISC, prop: DEF_MISC, '*': DEF_MISC };
  for (const k in DEFAULT_SPECS) ACT.specs.set(k, Object.assign({ _default: true }, DEFAULT_SPECS[k]));

  /* ================================================================ layers (markers, glints, seasons...) */
  const LAYERS = new Map(); // id -> {spec, inited, order}
  let layerList = [];
  function initLayer(L) {
    if (L.inited || !E.ready) return;
    L.inited = true;
    try { if (L.spec.init) L.spec.init(THREE, H); } catch (e) { N.err('view3d.layer.init:' + L.id, e); }
  }

  /* ================================================================ sky, sun, fog, lights */
  // time-of-day keys: minute, zenith, horizon, sun colour, sun intensity, hemi sky, hemi ground, hemi intensity
  const TOD = [
    [0, '#070c1e', '#30294a', '#7088c0', 0.2, '#33406e', '#2a1e14', 0.5],
    [290, '#08101f', '#2c2848', '#7088c0', 0.2, '#33406e', '#2a1e14', 0.5],
    [345, '#29396e', '#d58a8e', '#ff9a70', 0.55, '#5a5a8a', '#3a2a22', 0.6],
    [400, '#4a76c0', '#f2c6a2', '#ffc896', 1.7, '#8aa2c8', '#6a5038', 0.78],
    [480, '#3d78c8', '#d8e2ea', '#fff0dc', 2.5, '#a6bede', '#7a6448', 0.85],
    [720, '#3a74c4', '#d2dfe8', '#fff8ee', 2.75, '#aec4e0', '#806a4e', 0.9],
    [930, '#4278c2', '#e2dccd', '#ffe8c8', 2.55, '#aec0d6', '#806648', 0.86],
    [1020, '#4f72b4', '#f4c890', '#ffc078', 2.3, '#a8b0c8', '#8a6440', 0.8],
    [1080, '#495c9c', '#fa9c60', '#ff9a52', 1.8, '#8c8cb0', '#7a5030', 0.72],
    [1120, '#33407a', '#de7650', '#ff7a40', 0.9, '#6a6a98', '#4a3426', 0.62],
    [1160, '#1c2350', '#7a4a6a', '#8a7ab0', 0.4, '#3e4270', '#20180f', 0.55],
    [1220, '#090f24', '#3a3050', '#7088c0', 0.2, '#33406e', '#2a1e14', 0.5],
    [1440, '#070c1e', '#30294a', '#7088c0', 0.2, '#33406e', '#2a1e14', 0.5],
  ];
  const SUN = { gx: 0.6, gy: 0.2, elev: 0.5, day: 1, night: 0, dir: null, lightDir: null, moon: false };
  const SKYC = {};
  function todAt(m) {
    for (let i = 1; i < TOD.length; i++) {
      if (m <= TOD[i][0]) {
        const a = TOD[i - 1], b = TOD[i], t = U.clamp((m - a[0]) / (b[0] - a[0]), 0, 1);
        return { zen: U.mix(a[1], b[1], t), hor: U.mix(a[2], b[2], t), sun: U.mix(a[3], b[3], t), sunI: U.lerp(a[4], b[4], t), hs: U.mix(a[5], b[5], t), hg: U.mix(a[6], b[6], t), hI: U.lerp(a[7], b[7], t) };
      }
    }
    return todAt(0);
  }
  function computeSun() {
    const m = N.clock.minutes;
    const t = U.clamp((m - 360) / 720, 0, 1), a = Math.PI * t;
    let gx = Math.cos(a), gy = 0.55 * Math.sin(a) + 0.15;
    const l = Math.hypot(gx, gy); gx /= l; gy /= l;
    const day = N.clock.light();
    SUN.day = day; SUN.night = U.clamp((0.6 - day) / 0.52, 0, 1);
    // visible sun: real-ish path (below the horizon at night); light: clamped so shadows stay <= 2x height
    const sunUp = m > 330 && m < 1130;
    const elev = sunUp ? Math.max(-0.05, Math.sin(Math.PI * U.clamp((m - 345) / 770, 0, 1)) * 1.05) : -0.2;
    SUN.gx = gx; SUN.gy = gy; SUN.elev = elev; SUN.moon = !sunUp;
    const ce = Math.cos(elev);
    SUN.dir.set(gx * ce, Math.sin(elev), gy * ce).normalize();
    if (SUN.moon) { SUN.lightDir.set(0.42, 0.78, 0.46).normalize(); }
    else { const le = Math.max(0.47, elev); SUN.lightDir.set(gx * Math.cos(le), Math.sin(le), gy * Math.cos(le)).normalize(); }
  }

  const SKY_VS = 'varying vec3 vDir;\nvoid main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w * 0.99999; }';
  const SKY_FS = [
    'uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uMoonDir; uniform float uNight; uniform float uTime; uniform float uSunVis;',
    'varying vec3 vDir;',
    'float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }',
    'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = h13(vec3(i, 1.0)), b = h13(vec3(i + vec2(1.0, 0.0), 1.0)), c = h13(vec3(i + vec2(0.0, 1.0), 1.0)), d = h13(vec3(i + vec2(1.0, 1.0), 1.0)); return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }',
    'float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += vn(p) * a; p = p * 2.07 + 13.1; a *= 0.5; } return s; }',
    'void main(){',
    '  vec3 d = normalize(vDir); float h = d.y;',
    '  vec3 col = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.5));',
    '  col = mix(col, uHor * 0.82, clamp(-h * 5.0, 0.0, 1.0));',
    '  float sd = max(dot(d, uSunDir), 0.0);',
    '  col += uSunCol * (pow(sd, 5.0) * 0.18 + pow(sd, 60.0) * 0.5) * uSunVis;',
    '  col += uSunCol * smoothstep(0.99935, 0.99965, sd) * 5.0 * uSunVis;',
    '  float md = max(dot(d, uMoonDir), 0.0);',
    '  col += (vec3(0.95, 0.95, 1.0) * smoothstep(0.99945, 0.99968, md) * 1.6 + vec3(0.25, 0.3, 0.45) * pow(md, 30.0) * 0.35) * uNight;',
    '  if (uNight > 0.02 && h > 0.0) { vec3 q = floor(d * 260.0); float s = h13(q); col += vec3(step(0.9984, s) * (0.55 + 0.45 * sin(uTime * 1.7 + s * 90.0))) * uNight * smoothstep(0.02, 0.3, h); }',
    '  if (h > 0.015) {',
    '    vec2 cp = d.xz / (h + 0.1) * 0.9 + vec2(uTime * 0.006, uTime * 0.0025);',
    '    float c = fbm(cp * 1.6); c = smoothstep(0.52, 0.86, c) * smoothstep(0.015, 0.22, h);',
    '    vec3 cc = mix(uHor * 1.08 + uSunCol * 0.08 * uSunVis, vec3(0.05, 0.06, 0.1), uNight * 0.85);',
    '    col = mix(col, cc, c * 0.6);',
    '  }',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '}',
  ].join('\n');

  function initSky() {
    const m = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uZen: UNI.uZen, uHor: UNI.uHor, uSunDir: UNI.uSunDir, uSunCol: { value: new THREE.Color() }, uMoonDir: UNI.uMoonDir, uNight: UNI.uNight, uTime: UNI.uTime, uSunVis: UNI.uSunVis },
    });
    m.userData.shared = true;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), m);
    sky.frustumCulled = false; sky.renderOrder = 1e6; sky.name = 'sky';
    E.sky = sky; E.skyMat = m;
    E.scene.add(sky);
    // ground beyond the loaded city (and under the map edge)
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), MAT.outer);
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.4; outer.scale.set(30000, 30000, 1); outer.name = 'outer';
    outer.receiveShadow = false;
    E.scene.add(outer);
  }
  function initLights() {
    const sun = new THREE.DirectionalLight('#ffffff', 2);
    sun.castShadow = Q.shadows;
    if (Q.shadows) {
      sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
      const c = sun.shadow.camera, r = Q.shadowRange;
      c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 10; c.far = 1400;
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.5;
    }
    E.scene.add(sun); E.scene.add(sun.target);
    E.sun = sun;
    E.hemi = new THREE.HemisphereLight('#aec4e0', '#806a4e', 0.9);
    E.scene.add(E.hemi);
    E.points = [];
    for (let i = 0; i < Q.pointLights; i++) {
      const p = new THREE.PointLight('#ffab40', 0, 70, 1.6);
      p.userData.cand = null;
      E.scene.add(p); E.points.push(p);
    }
    E.scene.fog = new THREE.Fog('#d2dfe8', 300, Q.drawDist);
  }
  const _v = {};
  function updateSkyLights(fx, fy, fz) {
    computeSun();
    const T = todAt(N.clock.minutes);
    UNI.uZen.value.set(T.zen); UNI.uHor.value.set(T.hor);
    const night = SUN.night;
    UNI.uNight.value = night;
    UNI.uSunDir.value.copy(SUN.dir.y > -0.05 ? SUN.dir : SUN.lightDir);
    UNI.uSunVis.value = U.clamp((SUN.elev + 0.04) * 8, 0, 1) * (1 - night * 0.9);
    const sc = E.skyMat.uniforms.uSunCol.value; sc.set(T.sun).multiplyScalar(0.9 + 0.6 * U.clamp(1 - SUN.elev, 0, 1));
    UNI.uSunCol.value.set(T.sun).multiplyScalar(T.sunI * 0.5);
    // moon roughly opposite the sun's ground direction, high
    UNI.uMoonDir.value.set(-0.35, 0.72, -0.6).normalize();
    // fog: horizon colour, slightly towards the zenith
    E.scene.fog.color.set(T.hor).lerp(UNI.uZen.value, 0.12);
    E.scene.fog.far = Q.drawDist; E.scene.fog.near = Q.drawDist * (night > 0.5 ? 0.18 : 0.3);
    E.renderer.toneMappingExposure = 1.0 + night * 0.25;
    // sun light
    const sun = E.sun;
    sun.color.set(T.sun); sun.intensity = T.sunI * (SUN.moon ? 0.9 : 1);
    if (!_v.t) { _v.t = new THREE.Vector3(); _v.r = new THREE.Vector3(); _v.u = new THREE.Vector3(); _v.f = new THREE.Vector3(); }
    const tg = _v.t.set(fx, fz, fy);
    if (Q.shadows) {
      // snap the shadow frustum centre to its texel grid (no shimmering while moving)
      const f = _v.f.copy(SUN.lightDir).negate(), r = _v.r.set(0, 1, 0).cross(f).normalize(), u = _v.u.copy(f).cross(r).normalize();
      const tx = (2 * Q.shadowRange) / Q.shadowSize;
      const a = Math.round(tg.dot(r) / tx) * tx - tg.dot(r), b = Math.round(tg.dot(u) / tx) * tx - tg.dot(u);
      tg.addScaledVector(r, a).addScaledVector(u, b);
    }
    sun.target.position.copy(tg);
    sun.position.copy(tg).addScaledVector(SUN.lightDir, 700);
    sun.target.updateMatrixWorld();
    E.hemi.color.set(T.hs); E.hemi.groundColor.set(T.hg); E.hemi.intensity = T.hI;
    MAT.glow.opacity = U.clamp(night * 1.2, 0, 1);
    for (const p of SIGN.pages) p.mat.emissiveIntensity = night * 0.35;
  }
  // a few real point lights near the focus at night (lamps, R.lights, actor lights)
  const lightCands = [];
  const actorLights = [];
  function updatePointLights(fx, fy) {
    const P = E.points; if (!P || !P.length) return;
    const night = SUN.night;
    lightCands.length = 0;
    if (night > 0.05) {
      for (const ch of chunks.values()) {
        if (ch.dist > 300) continue;
        for (const l of ch.lights) { const d = Math.hypot(l[0] - fx, l[2] - fy); if (d < 260) lightCands.push([d, l[0], l[1], l[2], l[3], 1, 75]); }
      }
      const RL = N.render.lights;
      for (const L of RL) { if (!isFinite(L.x)) continue; const d = Math.hypot(L.x - fx, L.y - fy); if (d < 260) lightCands.push([d * 0.8, L.x, (L.h || 8), L.y, L.color || '#ffb050', L.intensity == null ? 1 : L.intensity, (L.r || 40) * 1.4]); }
      for (const L of actorLights) { const d = Math.hypot(L.x - fx, L.y - fy); if (d < 300) lightCands.push([d * 0.7, L.x, L.h || 6, L.y, L.color || '#fff2d0', L.intensity == null ? 1 : L.intensity, L.r || 60]); }
      lightCands.sort((a, b) => a[0] - b[0]);
    }
    for (let i = 0; i < P.length; i++) {
      const c = lightCands[i], p = P[i];
      if (!c) { p.intensity = 0; continue; }
      p.position.set(c[1], c[2], c[3]);
      p.color.set(c[4]);
      p.distance = c[6]; p.intensity = 1.6 * c[5] * night;
    }
  }

  /* ================================================================ cameras */
  const CAM = {
    distCur: 30, fovCur: 60, lastLook: -99, fpsOff: 0, snap: true, bob: 0, bobPh: 0, orbit: 0,
    tgt: null, pos: null, look: null, tmp: null, prevVeh: null,
  };
  function focusEntity() {
    const R = N.render, p = N.player;
    if (R.follow && R.follow.alive !== false && isFinite(R.follow.x)) return R.follow;
    return (p && p.vehicle) || p;
  }
  function focus() {
    const R = N.render, m = N.state.mode;
    if (R.camOverride || m === 'title' || m === 'boot') return { x: R.cam.x, y: R.cam.y }; // cinematic: stream around the 2D camera
    const e = focusEntity();
    if (!e || !isFinite(e.x)) return { x: N.render.cam.x, y: N.render.cam.y };
    return { x: e.x, y: e.y };
  }
  function wrapA(a) { return U.wrapAngle ? U.wrapAngle(a) : Math.atan2(Math.sin(a), Math.cos(a)); }
  function approachAngle(a, b, k) { return a + wrapA(b - a) * k; }
  function camCollide(tx, ty, tz, px, py, pz) {
    // march from the target to the wanted camera spot over the height grid; return the free distance
    const dx = px - tx, dy = py - ty, dz = pz - tz, L = Math.hypot(dx, dy, dz);
    if (L < 0.5) return L;
    const steps = Math.ceil(L / 1.5);
    let free = L;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps, x = tx + dx * t, y = ty + dy * t, z = tz + dz * t;
      if (y < heightAt(x, z) + 1.2) { free = Math.max(0, L * t - 2.2); break; }
    }
    // landmark models (arbitrary shapes, arches you can walk under): a short ray test
    if (!CAM.ray) { CAM.ray = new THREE.Raycaster(); CAM.rayO = new THREE.Vector3(); CAM.rayD = new THREE.Vector3(); CAM.near = []; CAM.nearT = 0; }
    const tn = now();
    if (tn - CAM.nearT > 250) {
      CAM.nearT = tn; CAM.near.length = 0;
      for (const rec of lmRecs.values()) {
        if (!rec.obj) continue;
        const lm = rec.lm, r = Math.max(lm.w, lm.d) * 0.75 + 90;
        if (Math.abs(lm.x - tx) < r && Math.abs(lm.y - tz) < r) CAM.near.push(rec.obj);
      }
    }
    if (CAM.near.length && free > 1) {
      CAM.rayO.set(tx, ty, tz); CAM.rayD.set(dx / L, dy / L, dz / L);
      CAM.ray.set(CAM.rayO, CAM.rayD); CAM.ray.near = 0; CAM.ray.far = free;
      const hits = CAM.ray.intersectObjects(CAM.near, true);
      for (const h of hits) { if (h.object.isMesh && h.object.visible !== false && !(h.object.material && h.object.material.transparent)) { free = Math.max(0, h.distance - 2); break; } }
    }
    return free;
  }
  function updateCamera(dt) {
    const cam = E.camera, I = N.input, p = N.player;
    if (!CAM.tgt) { CAM.tgt = new THREE.Vector3(); CAM.pos = new THREE.Vector3(); CAM.look = new THREE.Vector3(); CAM.tmp = new THREE.Vector3(); }
    const tnow = N.time.real || now() / 1000;
    // look input
    let dx = 0, dy = 0, sx = 0, sy = 0;
    if (I && I.takeLook) {
      const L = I.takeLook();
      const touch = I.look && I.look.source === 'touch';
      const k = touch ? 0.0062 : 0.0036;
      dx = L.dx * k; dy = L.dy * k * 0.85;
      sx = I.look.stickX || 0; sy = I.look.stickY || 0;
    }
    const mode = N.state.mode;
    const canLook = mode === 'play' || mode === 'dialogue' || mode === 'cutscene';
    if (!canLook) { dx = dy = sx = sy = 0; }
    if (dx || dy || sx || sy) CAM.lastLook = tnow;
    const fps = view.mode === 'fps';
    UNI.uNearFade.value = fps ? 3.5 : 9;
    view.yaw = wrapA(view.yaw + dx + sx * 2.5 * dt);
    view.pitch += (fps ? dy : dy) + sy * 1.7 * dt;
    const R = N.render;
    const cine = R.camOverride || mode === 'title' || mode === 'boot';
    const e = focusEntity();
    const veh = p && p.vehicle && e === p.vehicle ? p.vehicle : null;
    const T = veh ? veh.T || {} : null;
    const spd = e ? Math.hypot(e.vx || 0, e.vy || 0) : 0;
    const since = tnow - CAM.lastLook;
    let fov = 60;
    const aspect = E.aspect || 1.6;
    if (aspect < 1) fov = Math.min(84, 2 * Math.atan(Math.tan((60 * Math.PI) / 360) * 1.05 / Math.max(0.42, aspect)) * 180 / Math.PI * 0.62 + 18);
    if (cine) {
      // cinematic orbit around the 2D camera centre (title attract mode, cutscene camera moves)
      CAM.orbit += dt * (mode === 'title' ? 0.05 : 0.02);
      const z = Math.max(0.3, R.cam.zoom || 1), dist = (mode === 'title' ? 300 : 170) / z, hgt = (mode === 'title' ? 150 : 95) / z;
      const ang = (R.camOverride ? view.yaw : 0) + CAM.orbit;
      CAM.tgt.set(R.cam.x, 12, R.cam.y);
      CAM.pos.set(R.cam.x - Math.cos(ang) * dist, hgt, R.cam.y - Math.sin(ang) * dist);
      const k = CAM.snap ? 1 : 1 - Math.exp(-dt * 2.5);
      if (!CAM.cpos) { CAM.cpos = CAM.pos.clone(); CAM.ctgt = CAM.tgt.clone(); }
      CAM.cpos.lerp(CAM.pos, k); CAM.ctgt.lerp(CAM.tgt, k);
      cam.position.copy(CAM.cpos); cam.lookAt(CAM.ctgt);
      CAM.snap = false;
      setFov(fov, dt);
      return;
    }
    CAM.cpos = null;
    if (!e) return;
    const ex = e.x, ey = e.y, el = elevation(veh ? p : e);
    if (fps) {
      view.pitch = U.clamp(view.pitch, -1.15, 1.25);
      let yaw = view.yaw, eyeX = ex, eyeY = ey, eyeH = el + 6.3;
      if (veh) {
        // cockpit: the look offset springs back to the vehicle heading
        CAM.fpsOff = wrapA(CAM.fpsOff + dx + sx * 2.5 * dt);
        if (since > 1.2) CAM.fpsOff *= Math.exp(-dt * 2.5);
        yaw = (veh.angle || 0) + CAM.fpsOff;
        view.yaw = yaw;
        const c = Math.cos(veh.angle || 0), s = Math.sin(veh.angle || 0);
        const cls = T.cls || 'car';
        const fwd = cls === 'heavy' ? T.w * 0.36 : cls === 'auto' ? 1.5 : cls === 'bike' ? -1.5 : 1.2;
        const side = cls === 'car' ? T.d * 0.18 : 0; // right-hand drive
        eyeX = ex + c * fwd - s * side; eyeY = ey + s * fwd + c * side;
        eyeH = el + (cls === 'heavy' ? 15 : cls === 'auto' ? 9 : cls === 'bike' ? 8.6 : cls === 'boat' ? 6.5 : 8.2);
        if (cls === 'bike' && !reducedMotion()) eyeH += Math.sin(tnow * 9) * Math.min(0.15, spd * 0.001);
      } else {
        CAM.fpsOff = 0;
        // head bob while walking / running (off with reduced motion)
        if (!reducedMotion() && spd > 4) { CAM.bobPh += dt * (spd > 60 ? 13 : 9); CAM.bob = Math.sin(CAM.bobPh) * Math.min(0.28, spd * 0.004); } else CAM.bob *= Math.exp(-dt * 8);
        eyeH += CAM.bob;
      }
      const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
      cam.position.set(eyeX, eyeH, eyeY);
      CAM.look.set(eyeX + Math.cos(yaw) * cp * 10, eyeH - sp * 10, eyeY + Math.sin(yaw) * cp * 10);
      cam.lookAt(CAM.look);
      CAM.distCur = 0;
      setFov(veh ? fov + 6 + Math.min(10, spd * 0.05) : fov + 4, dt);
      cockpit(veh);
      return;
    }
    cockpit(null);
    // third person: orbit / chase
    view.pitch = U.clamp(view.pitch, -0.12, 1.15);
    const cls = T ? T.cls || 'car' : null;
    let dist = 30, th = 7.5;
    if (veh) {
      dist = cls === 'bike' ? 34 : cls === 'auto' ? 40 : cls === 'heavy' ? 72 : cls === 'boat' ? 48 : 44;
      th = cls === 'heavy' ? 18 : cls === 'bike' ? 8 : 10;
      dist += Math.min(16, spd * 0.06);
      // chase: swing behind the heading (unless the player is looking around)
      if (since > 1.0 && Math.abs(veh.speed || spd) > 6) {
        const k = 1 - Math.exp(-dt * 2.6 * U.clamp(spd / 60, 0.25, 1.2));
        view.yaw = approachAngle(view.yaw, veh.angle || 0, k);
      }
      if (CAM.prevVeh !== veh) { CAM.prevVeh = veh; if (since > 0.5) view.yaw = veh.angle || view.yaw; }
    } else {
      CAM.prevVeh = null;
      // drift back behind the player while they move roughly forward (not while strafing)
      const face = p ? (isFinite(p.facing) ? p.facing : p.angle) : 0;
      if (since > 2.2 && spd > 25 && p && Math.abs(wrapA(face - view.yaw)) < 1.0) {
        const k = 1 - Math.exp(-dt * 0.9);
        view.yaw = approachAngle(view.yaw, face, k);
      }
    }
    const look = veh ? Math.min(26, spd * 0.2) : 0;
    const fw = veh ? veh.angle || 0 : view.yaw;
    const tx = ex + Math.cos(fw) * look, ty = ey + Math.sin(fw) * look, tz = el + th;
    const kT = CAM.snap ? 1 : 1 - Math.exp(-dt * 14);
    CAM.tgt.x += (tx - CAM.tgt.x) * kT; CAM.tgt.y += (tz - CAM.tgt.y) * kT; CAM.tgt.z += (ty - CAM.tgt.z) * kT;
    const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    const wx = CAM.tgt.x - Math.cos(view.yaw) * cp * dist, wy = CAM.tgt.y + sp * dist, wz = CAM.tgt.z - Math.sin(view.yaw) * cp * dist;
    let free = camCollide(CAM.tgt.x, CAM.tgt.y, CAM.tgt.z, wx, wy, wz);
    free = Math.max(2.5, Math.min(dist, free));
    if (CAM.snap || free < CAM.distCur) CAM.distCur = free; else CAM.distCur += (free - CAM.distCur) * (1 - Math.exp(-dt * 2.2));
    const d = CAM.distCur;
    let px = CAM.tgt.x - Math.cos(view.yaw) * cp * d, py = CAM.tgt.y + sp * d, pz = CAM.tgt.z - Math.sin(view.yaw) * cp * d;
    py = Math.max(py, el + 1.6);
    // screen shake from render.js (R.shake): reuse its offset
    if (R.camX != null && isFinite(R.camX)) { const sx2 = R.camX - R.cam.x, sy2 = R.camY - R.cam.y; if (Math.abs(sx2) > 0.8 || Math.abs(sy2) > 0.8) { px += sx2 * 0.35; py += sy2 * 0.2; } }
    cam.position.set(px, py, pz);
    cam.lookAt(CAM.tgt);
    CAM.snap = false;
    // FOV kick with speed
    setFov(fov + (veh ? U.clamp((spd - 60) / 120, 0, 1) * 12 : 0), dt);
  }
  function setFov(f, dt) {
    CAM.fovCur += (f - CAM.fovCur) * (1 - Math.exp(-dt * 3));
    if (Math.abs(E.camera.fov - CAM.fovCur) > 0.01) { E.camera.fov = CAM.fovCur; E.camera.updateProjectionMatrix(); }
  }
  // first-person cockpit pieces attached to the camera (bike handlebar, car / auto / bus dashboard)
  const COCK = {};
  function cockpit(veh) {
    const cls = veh ? (veh.T && veh.T.cls) || 'car' : null;
    const spec = veh ? specFor(veh) : null;
    const want = cls && !(spec && spec.fps) ? cls : null;
    for (const k in COCK) COCK[k].visible = k === want;
    if (!want) return;
    let g = COCK[want];
    if (!g) {
      const gb = new GB();
      if (want === 'bike') {
        gb.color('#2a2a2a').obox(0, 0, 0.35, 7.5, -0.15, 0.15, 0).color('#151515').obox(0, -3.6, 0.6, 1.5, -0.3, 0.3, 0).obox(0, 3.6, 0.6, 1.5, -0.3, 0.3, 0);
        gb.color('#c8c8c8').cyl(0, -0.2, 0, 0.9, 0.9, 0.6, 8);
      } else if (want === 'boat') {
        gb.color('#c0392b').obox(0, 0, 4, 9, -1.4, -0.9, 0);
      } else {
        gb.color(want === 'auto' ? '#1a1214' : '#3a3030').obox(0, 0, 3, 14, -2.2, -1.2, 0);
        gb.color('#121212').cyl(0, -1.3, 0, 1.7, 1.7, 0.25, 12, { top: false });
      }
      const geo = gb.build();
      g = new THREE.Mesh(geo, MAT.vc);
      // local: camera looks down -Z; geometry x = right, z = forward -> rotate so +x(forward) maps to -z
      g.rotation.y = Math.PI / 2;
      g.position.set(0, want === 'bike' ? -2.2 : -1.6, want === 'bike' ? -4.2 : -3.6);
      g.renderOrder = 5;
      g.frustumCulled = false;
      E.camera.add(g);
      COCK[want] = g;
    }
    g.visible = true;
  }

  /* ================================================================ projection shims + frame */
  const nearRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  let canvasRect = null, rect2D = null, rectFrame = -1;
  function rects() {
    if (rectFrame === E.frames) return;
    rectFrame = E.frames;
    canvasRect = E.canvas.getBoundingClientRect();
    rect2D = N.render.canvas ? N.render.canvas.getBoundingClientRect() : canvasRect;
  }
  /** world (x, y, h) -> CSS px {x, y, visible} on the 3D view */
  function project(x, y, h) {
    if (!E.ready) return { x: 0, y: 0, visible: false };
    rects();
    const v = TV3.set(x, h || 0, y).project(E.camera);
    const vis = v.z < 1 && v.z > -1 && Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05;
    return { x: canvasRect.left + (v.x + 1) / 2 * canvasRect.width, y: canvasRect.top + (1 - v.y) / 2 * canvasRect.height, visible: vis, behind: v.z >= 1 };
  }
  function installShims() {
    const R = N.render;
    if (R.__v3d) return;
    R.__v3d = true;
    const oQueue = R.queue;
    R.queue = function () { if (api.active) return undefined; return oQueue.apply(this, arguments); };
    const oProj = R.proj;
    R.proj = function (x, y, h) {
      if (!api.active) return oProj.apply(this, arguments);
      const q = project(x, y, (h || 0) * 1.15);
      const r = rect2D || canvasRect;
      const sx = ((q.behind ? -9999 : q.x) - r.left) / r.width * R.W, sy = ((q.behind ? -9999 : q.y) - r.top) / r.height * R.H;
      return { x: sx, y: sy, k: 1 };
    };
    const oS2W = R.screenToWorld;
    R.screenToWorld = function (sx, sy) {
      if (!api.active) return oS2W.apply(this, arguments);
      rects(); const r = rect2D || canvasRect;
      return groundAt(r.left + sx / R.W * r.width, r.top + sy / R.H * r.height);
    };
    const oC2W = R.clientToWorld;
    R.clientToWorld = function (cx, cy) { if (!api.active) return oC2W.apply(this, arguments); return groundAt(cx, cy); };
    const oInv = R.invalidateChunks;
    R.invalidateChunks = function (rect) {
      const r = oInv.apply(this, arguments);
      if (!selfInval && E.ready) {
        for (const ch of chunks.values()) {
          if (!rect || (ch.x0 < rect[0] + rect[2] && ch.x0 + CH > rect[0] && ch.y0 < rect[1] + rect[3] && ch.y0 + CH > rect[1])) ch.groundStale = true;
        }
      }
      return r;
    };
  }
  const _ray = {};
  function groundAt(cx, cy) {
    rects();
    if (!_ray.r) { _ray.r = new THREE.Raycaster(); _ray.v = new THREE.Vector2(); _ray.p = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); _ray.o = new THREE.Vector3(); }
    _ray.v.set((cx - canvasRect.left) / canvasRect.width * 2 - 1, -((cy - canvasRect.top) / canvasRect.height * 2 - 1));
    _ray.r.setFromCamera(_ray.v, E.camera);
    const hit = _ray.r.ray.intersectPlane(_ray.p, _ray.o);
    return hit ? { x: hit.x, y: hit.z } : { x: N.render.cam.x, y: N.render.cam.y };
  }

  function beginFrame(dt) {
    const R = N.render, f = focus();
    E.frames++;
    // R.view: a square around the player sized to the 3D near range (inView / despawn semantics)
    const half = Math.min(Math.max(R.W, R.H) / Math.max(0.3, R.Z || 1) * 0.5 + 120, Math.max(480, Q.nearDist * 0.9));
    nearRect.x0 = f.x - half; nearRect.x1 = f.x + half; nearRect.y0 = f.y - half; nearRect.y1 = f.y + half;
    R.view.x0 = nearRect.x0; R.view.x1 = nearRect.x1; R.view.y0 = nearRect.y0; R.view.y1 = nearRect.y1;
    R.night = U.clamp((0.6 - N.clock.light()) / 0.52, 0, 1);
  }

  let fpsAcc = 0, fpsN = 0, lowFrames = 0, highFrames = 0;
  function render(dt) {
    if (!E.ready || E.lost) return;
    const t0 = now();
    const R = N.render;
    UNI.uTime.value = (N.time.real || t0 / 1000) % 10000;
    // lights pushed by systems' draw() this frame (markers etc.) -> point light candidates
    updateCamera(dt);
    const f = focus();
    const fe = focusEntity();
    const fz = elevation(fe === (N.player && N.player.vehicle) ? N.player : fe);
    updateSkyLights(f.x, f.y, fz);
    updateSunBake();
    updatePointLights(f.x, f.y);
    R.lights.length = 0; actorLights.length = 0;
    if (R.fx.flash > 0.01) R.fx.flash = Math.max(0, R.fx.flash - dt * 3);
    // world streaming within the frame budget
    const budget = E.urgent > 0 ? 18 : Q.budgetMs;
    if (E.urgent > 0) E.urgent--;
    updateWork(f.x, f.y, budget);
    // actors + landmark animators + layers
    syncActors(dt, f.x, f.y);
    for (const rec of lmUpdaters) { try { rec.reg.opts.update(rec.obj, rec.lm, dt, H); } catch (e) { N.err('view3d.lm.update', e); } }
    for (const L of layerList) { if (!L.inited) initLayer(L); try { if (L.spec.update) L.spec.update(dt, H); } catch (e) { N.err('view3d.layer:' + L.id, e); } }
    // sky dome follows the camera
    E.sky.position.copy(E.camera.position); E.sky.scale.setScalar(Q.drawDist * 1.25);
    E.sky.updateMatrixWorld();
    updateFx();
    cullChunks(f.x, f.y);
    const covered = N.minigames && N.minigames.covering;
    const tR = now();
    if (!covered) {
      try { E.renderer.render(E.scene, E.camera); } catch (e) { onRenderError(e); return; }
    }
    const info = E.renderer.info;
    E.calls = info.render.calls; E.tris = info.render.triangles;
    const t1 = now();
    E.jsMs = t1 - t0; E.renderMs = t1 - tR;
    E.jsAvg += (E.jsMs - E.jsAvg) * 0.05;
    // adaptive pixel ratio (a slow GPU shows up as long frames)
    if (Q.adaptive && dt > 0) {
      fpsAcc += dt; fpsN++;
      if (fpsAcc > 2) {
        const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
        if (fps < 40) { lowFrames++; highFrames = 0; } else if (fps > 57) { highFrames++; lowFrames = 0; } else { lowFrames = highFrames = 0; }
        if (lowFrames >= 2 && Q.pixelRatio > Q.minPixelRatio) { Q.pixelRatio = Math.max(Q.minPixelRatio, Q.pixelRatio - 0.25); lowFrames = 0; resize(); }
        else if (lowFrames >= 3 && fps < 30 && Q.drawDist > 650) { Q.drawDist = Math.round(Q.drawDist * 0.85); lowFrames = 0; E.camera.far = Q.drawDist * 1.5; E.camera.updateProjectionMatrix(); lastPlan.t = 0; }
        else if (highFrames >= 4 && Q.pixelRatio < Q.maxPixelRatio) { Q.pixelRatio = Math.min(Q.maxPixelRatio, Q.pixelRatio + 0.25); highFrames = 0; resize(); }
      }
    }
  }
  // chunk-level frustum culling (instanced trees / rocks / glows are not culled per object in r149);
  // chunks inside the shadow range stay visible so they still cast into the view
  const CULL = {};
  function cullChunks(fx, fy) {
    if (!CULL.f) { CULL.f = new THREE.Frustum(); CULL.m = new THREE.Matrix4(); CULL.b = new THREE.Box3(); }
    const cam = E.camera;
    cam.updateMatrixWorld();
    CULL.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    CULL.f.setFromProjectionMatrix(CULL.m);
    const sr = Q.shadows ? Q.shadowRange + 40 : -1;
    let vis = 0;
    for (const ch of chunks.values()) {
      CULL.b.min.set(ch.x0 - 30, -2, ch.y0 - 30); CULL.b.max.set(ch.x0 + CH + 30, ch.top || 80, ch.y0 + CH + 30);
      let v = CULL.f.intersectsBox(CULL.b);
      if (!v && sr > 0 && rectDist(ch.x0, ch.y0, ch.x0 + CH, ch.y0 + CH, fx, fy) < sr) v = true;
      ch.group.visible = v;
      if (v) vis++;
    }
    E.visChunks = vis;
  }
  function onRenderError(e) {
    E.failCount++;
    N.err('view3d.render', e);
    if (E.failCount > 3) { toast('3D view hit a problem; back to top-down.', 3000); applyMode('top'); view.want = 'top'; }
  }

  /* ---------------------------------------------------- screen fx (fade / flash / VHS) */
  function updateFx() {
    const el = E.fxEl; if (!el) return;
    const fx = N.render.fx;
    const fade = U.clamp(fx.fade || 0, 0, 1), flash = U.clamp(fx.flash || 0, 0, 1), vhs = U.clamp(fx.vhs || 0, 0, 1);
    E.fxFade.style.opacity = fade.toFixed(3); E.fxFade.style.background = fx.fadeColor || '#000';
    E.fxFlash.style.opacity = flash.toFixed(3);
    E.fxVhs.style.opacity = (vhs * 0.9).toFixed(3);
    el.style.opacity = fade + flash + vhs > 0.004 ? '1' : '0';
    const filt = vhs > 0.02 ? 'saturate(' + (1 - vhs * 0.35).toFixed(2) + ') contrast(' + (1 + vhs * 0.12).toFixed(2) + ')' : '';
    if (E.canvas.style.filter !== filt) E.canvas.style.filter = filt;
  }

  /* ================================================================ init + resize + context loss */
  function resize() {
    if (!E.renderer) return;
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    E.renderer.setPixelRatio(Q.pixelRatio);
    E.renderer.setSize(w, h, false);
    E.canvas.style.width = w + 'px'; E.canvas.style.height = h + 'px';
    E.aspect = w / h;
    E.camera.aspect = w / h; E.camera.updateProjectionMatrix();
    rectFrame = -1;
  }
  function initEngine(T) {
    THREE = T; api.THREE = T;
    if (Q.tier === 'low') { SIGN.CW = 256; SIGN.CHt = 32; SIGN.max = 3; }
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    TV3 = new THREE.Vector3(); TV3b = new THREE.Vector3(); TM3 = new THREE.Matrix3();
    SUN.dir = new THREE.Vector3(); SUN.lightDir = new THREE.Vector3();
    const c = document.createElement('canvas');
    c.id = 'game3d'; c.setAttribute('aria-label', 'Nostalgia — 3D view of 1990s Hyderabad');
    c.tabIndex = -1;
    const g2 = document.getElementById('game');
    if (g2 && g2.parentNode) g2.parentNode.insertBefore(c, g2.nextSibling); else document.body.prepend(c);
    E.canvas = c;
    const fx = document.createElement('div'); fx.id = 'fx3d'; fx.setAttribute('aria-hidden', 'true');
    fx.innerHTML = '<div class="fx3d-vhs"></div><div class="fx3d-fade"></div><div class="fx3d-flash"></div>';
    c.parentNode.insertBefore(fx, c.nextSibling);
    E.fxEl = fx; E.fxVhs = fx.children[0]; E.fxFade = fx.children[1]; E.fxFlash = fx.children[2];
    let r;
    try {
      r = new THREE.WebGLRenderer({ canvas: c, antialias: Q.antialias, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    } catch (e) { c.remove(); fx.remove(); throw new Error('WebGL could not start'); }
    E.renderer = r;
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = Q.shadows; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.info.autoReset = true;
    E.maxAniso = r.capabilities.getMaxAnisotropy ? r.capabilities.getMaxAnisotropy() : 1;
    E.isWebGL2 = !!r.capabilities.isWebGL2;
    E.scene = new THREE.Scene();
    E.scene.matrixWorldAutoUpdate = true;
    E.camera = new THREE.PerspectiveCamera(60, 1, 0.6, Q.drawDist * 1.5);
    E.scene.add(E.camera);
    E.city = new THREE.Group(); E.city.name = 'city'; E.scene.add(E.city);
    E.lmGroup = new THREE.Group(); E.lmGroup.name = 'landmarks'; E.scene.add(E.lmGroup);
    E.actorGroup = new THREE.Group(); E.actorGroup.name = 'actors'; E.scene.add(E.actorGroup);
    E.layerGroup = new THREE.Group(); E.layerGroup.name = 'layers'; E.scene.add(E.layerGroup);
    H.scene = E.scene; H.camera = E.camera; H.renderer = r; H.layer = E.layerGroup;
    initMaterials();
    initSky();
    initLights();
    buildHeightGrid();
    prepRails();
    installShims();
    resize();
    let pend = false;
    const onR = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; resize(); }); };
    window.addEventListener('resize', onR); window.addEventListener('orientationchange', onR);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onR);
    c.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      E.lost = true;
      if (view.mode !== 'top') { const keep = view.want; applyMode('top'); view.want = keep; toast('3D view paused (graphics reset) — showing top-down.', 2600); }
    }, false);
    c.addEventListener('webglcontextrestored', () => {
      E.lost = false;
      // three re-creates programs / buffers; our ground textures were uploaded from reused canvases: rebuild
      for (const ch of Array.from(chunks.values())) disposeChunk(ch);
      for (const id of Array.from(lmRecs.keys())) disposeLandmark(id);
      clearActors();
      if (view.want !== 'top') { E.warming = true; E.warmT = now(); view.loading = true; }
    }, false);
    E.ready = true;
    api.ready = true;
    if (GP && GP.attach) { try { GP.attach(groundInternals()); } catch (e) { N.err('view3d.ground.attach', e); GP = null; } } // [ground hook]
    for (const L of layerList) initLayer(L);
    N.emit('view3d:ready', api);
  }

  // [ground hook] engine internals handed to the ground provider (view3d_ground.js)
  function groundInternals() {
    return {
      THREE, E, Q, UNI, MAT, TEX, H, SUN, VS, CH, chunks, ckey, sunBake,
      buildAux, dropPainted, rgb8, col, GB, mergeGeometries,
      replan() { lastPlan.t = 0; },
    };
  }

  /* ================================================================ API */
  const api = (N.view3d = {
    ready: false,
    THREE: null,
    H, VS, CHUNK: CH, FLOOR_H,
    quality: Q,
    get active() { return E.ready && !E.lost && view.mode !== 'top'; },
    get engine() { return E; },
    beginFrame, render,
    /** registerLandmark(drawId | '#landmarkId', build(THREE, lm, H) -> Object3D | null (fallback) | false (nothing), opts)
     *  opts: {castShadow (true), update(obj, lm, dt, H) (animated), dispose(obj, lm, H)} */
    registerLandmark(id, build, opts) {
      if (typeof build !== 'function') return false;
      LMB.set(id, { build, opts: opts || {} });
      lmCheckT = 0; // rebuild on the next check (reg changed)
      return true;
    },
    /** registerActorRenderer(key, {create(e, H) -> Object3D, update(obj, e, dt, H), dispose?, fps?, shadow?})
     *  key: 'player' | '<kind>' | '<kind>:<type|species|npcId|role>' | '*' | a custom e.view3d */
    registerActorRenderer(key, spec) {
      if (!spec || typeof spec.create !== 'function') return false;
      ACT.specs.set(key, spec);
      return true;
    },
    /** registerStructure(t, build(THREE, s, H, gb, job) -> Object3D (chunk-local is added) | void (use gb)) */
    registerStructure(t, build) { if (typeof build === 'function') { STRUCT.set(t, build); for (const ch of chunks.values()) ch.dirty = true; } },
    /** registerLayer(id, {init(THREE, H), update(dt, H), dispose(H), order}) — per-frame 3D overlays */
    registerLayer(id, spec) {
      const old = LAYERS.get(id);
      if (old && old.inited && old.spec.dispose) { try { old.spec.dispose(H); } catch (e) { N.err('view3d.layer.dispose', e); } }
      const L = { id, spec: spec || {}, inited: false, order: (spec && spec.order) || 0 };
      LAYERS.set(id, L);
      layerList = Array.from(LAYERS.values()).sort((a, b) => a.order - b.order);
      if (E.ready) initLayer(L);
      return L;
    },
    project, elevation, heightAt,
    focus,
    /** [ground hook] install the ground provider (src/view3d_ground.js). p.attach(internals) runs once the
     *  engine is ready; p: {enabled, attach(I), need(ch, d, pass), step(ch, d, deadline), pending(ch, d),
     *  dispose(ch), heightAt(x, y, e)}. While p.enabled it owns every chunk's ground (no painter texture). */
    setGroundProvider(p) { GP = p || null; if (GP && E.ready && GP.attach) GP.attach(groundInternals()); lastPlan.t = 0; return !!GP; },
    /** mark chunks overlapping rect [x, y, w, h] (or all) for a rebuild */
    rebuild(rect) {
      for (const ch of chunks.values()) if (!rect || (ch.x0 < rect[0] + rect[2] && ch.x0 + CH > rect[0] && ch.y0 < rect[1] + rect[3] && ch.y0 + CH > rect[1])) { ch.dirty = true; ch.groundStale = true; }
      if (!rect) for (const id of Array.from(lmRecs.keys())) disposeLandmark(id);
    },
    /** setQuality({tier: 'high'|'low', pixelRatio, drawDist, adaptive}) */
    setQuality(o) {
      o = o || {};
      if (o.tier && o.tier !== Q.tier && !E.ready) applyTier(o.tier);
      for (const k of ['pixelRatio', 'drawDist', 'nearDist', 'actorDist', 'adaptive', 'budgetMs', 'maxPixelRatio', 'minPixelRatio']) if (o[k] != null) Q[k] = o[k];
      // engine-creation options (only before the first 3D switch)
      if (!E.ready) for (const k of ['antialias', 'shadows', 'shadowSize', 'pointLights', 'groundHi', 'groundLo', 'baked', 'aniso']) if (o[k] != null) Q[k] = o[k];
      if (E.ready) { E.camera.far = Q.drawDist * 1.5; E.camera.updateProjectionMatrix(); resize(); lastPlan.t = 0; }
      return Q;
    },
    /** finish the pending chunk work around the focus synchronously (tests / teleports); ms cap */
    settle(ms) {
      if (!E.ready) return false;
      const f = focus(), t0 = now(), cap = ms || 4000;
      lastPlan.t = 0;
      while (now() - t0 < cap) {
        updateWork(f.x, f.y, 50);
        let pending = !!paintJob || lmQueue.length > 0;
        for (const ch of chunks.values()) if (farChunk(ch, f.x, f.y)) { pending = true; break; }
        if (!pending && now() - lmCheckT > 350) { updateLandmarks(f.x, f.y, now() + 20); pending = lmQueue.length > 0; }
        const gp = gpOn(); // [ground hook]
        for (const it of planList) {
          const ch = chunks.get(ckey(it.ci, it.cj)), w = wantFor(it.d);
          const gnd = gp ? gp.pending(ch || null, it.d) : !ch || !ch.groundRes || ch.groundRes < w.res || ch.groundStale;
          if (!ch || ch.detail < w.detail || ch.detail < 0 || ch.gjob || ch.dirty || gnd) { pending = true; break; }
        }
        if (!pending) return true;
      }
      return false;
    },
    /** per-frame actor light request (headlights, lanterns): {x, y, h, color, intensity, r} */
    light(L) { if (L && isFinite(L.x) && isFinite(L.y)) actorLights.push(L); },
    stats() {
      const info = E.renderer ? E.renderer.info : null;
      let readyChunks = 0, tex = 0;
      for (const ch of chunks.values()) { if (ch.detail >= 0 && ch.groundRes) readyChunks++; if (ch.groundTex) tex++; }
      return {
        ready: E.ready, active: api.active, mode: view.mode, tier: Q.tier, pixelRatio: Q.pixelRatio,
        calls: E.calls, triangles: E.tris, jsMs: +E.jsMs.toFixed(2), jsAvg: +E.jsAvg.toFixed(2), renderMs: +(E.renderMs || 0).toFixed(2), workMs: +workMs.toFixed(2),
        chunks: chunks.size, readyChunks, groundTextures: tex, landmarks: lmRecs.size, actors: ACT.recs.size,
        geometries: info ? info.memory.geometries : 0, textures: info ? info.memory.textures : 0, programs: info && info.programs ? info.programs.length : 0,
        signPages: SIGN.pages.length, drawDist: Q.drawDist, shadows: Q.shadows, visChunks: E.visChunks || 0,
      };
    },
    /** debug: direct camera control {yaw, pitch} (radians) */
    setCamera(o) { if (o) { if (isFinite(o.yaw)) view.yaw = o.yaw; if (isFinite(o.pitch)) view.pitch = o.pitch; CAM.lastLook = (N.time.real || 0); CAM.snap = !!o.snap; } },
    snapCamera() { CAM.snap = true; },
    GB, mergeGeometries,
  });

  // helpers exposed to the landmark / actor modules (filled as soon as THREE is loaded)
  Object.defineProperties(H, Object.getOwnPropertyDescriptors({
    get THREE() { return THREE; },
    get night() { return SUN.night; },
    get day() { return SUN.day; },
    get sunDir() { return SUN.lightDir; },
    get time() { return UNI.uTime ? UNI.uTime.value : 0; },
    get mode() { return view.mode; },
    get quality() { return Q; },
    get uniforms() { return UNI; },
    get materials() { return MAT; },
    /** world (x, y, h) -> THREE.Vector3 */
    pos(x, y, h) { return new THREE.Vector3(x, h || 0, y); },
    /** place an object at world (x, y) facing world angle a */
    place(obj, x, y, h, a) { obj.position.set(x, h || 0, y); if (a != null) obj.rotation.y = -a; return obj; },
    yaw(a) { return -(a || 0); },
    elev: elevation, heightAt,
    builder(opts) { return new GB(opts); },
    merge: mergeGeometries,
    mat, color: (hex) => col(hex), tex, signSlot,
    facadeMaterial: () => MAT.facade, vcMaterial: () => MAT.vc,
    /** soft round contact shadow (use when H.quality.shadows is false) */
    blobShadow(w, d) { const m = new THREE.Mesh(H.geo.plane, MAT.blob); m.scale.set(w || 8, 1, d || w || 8); m.position.y = 0.08; m.renderOrder = 1; m.userData.noShadow = true; m.castShadow = false; return m; },
    /** additive glow sprite for night lights */
    glow(color, size) { const m = new THREE.SpriteMaterial({ map: TEX.glow, color: color || '#ffb050', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); const s = new THREE.Sprite(m); s.scale.setScalar(size || 10); return s; },
    light(L) { api.light(L); },
    dispose: disposeObj,
  }));

  /* ================================================================ system + boot */
  N.addSystem({
    id: 'view3d', order: 61, runIn: ['*'],
    update(dt) {
      const I = N.input;
      if (I && I.pressed && I.pressed('view') && (N.state.mode === 'play')) { I.consume('view'); view.cycle(); }
      if (E.warming && now() - (E.warmAt || 0) > 10) { E.warmAt = now(); try { warmStep(); } catch (e) { N.err('view3d.warm', e); E.warming = false; view.loading = false; } }
    },
  });
  N.on('player:teleport', () => { CAM.snap = true; E.urgent = 20; lastPlan.t = 0; });
  N.on('game:new', () => { CAM.snap = true; E.urgent = 20; lastPlan.t = 0; });
  N.on('game:continue', () => { CAM.snap = true; E.urgent = 20; lastPlan.t = 0; });
  N.on('player:enterVehicle', () => { CAM.prevVeh = null; });
  N.on('settings:change', (d) => { if (d && d.key === 'view' && MODES.indexOf(d.value) >= 0 && d.value !== view.want) view.set(d.value); });
  N.on('world:built', () => { if (E.ready) { buildHeightGrid(); prepRails(); api.rebuild(); } });
  N.on('boot', () => {
    updateViewButton();
    const saved = lsGet(LS_KEY);
    if (saved === 'tps' || saved === 'fps') view.set(saved, { noSave: true, silent: true });
  });
})();
