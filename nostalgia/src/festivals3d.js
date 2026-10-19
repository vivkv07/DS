/* NOSTALGIA — festivals3d.js (3D festival decor) — ARCHITECTURE §20 + seasons.js
 *
 * The festival sites in the 3D view, built from the same layouts the 2D overlays draw (N.seasons.layout):
 *   numaish    the whole fair on the Exhibition Grounds: rows of stalls (bangles, toys, Delhi papad, Kashmiri
 *              shawls, dry fruits, pickles, crockery, khadi, pearls, carpets, books, Agra petha) with striped
 *              canopies, goods, tube lights and signboards; the food court (counters, tables, plastic chairs,
 *              warm glow); the toy train running round its loop; a carousel; the loudspeaker mast with bulb
 *              strings radiating to the rows; the bulb canopy over the main lane; searchlights sweeping the sky;
 *              the enquiry booth. (The gate, giant wheel, maut ka kuan and the two big stall rows are landmarks.)
 *   christmas  every church near the player: the crib just inside the gate (open to the street), a decorated
 *              tree on the other side, a gate arch with a big star and a "HAPPY CHRISTMAS" banner, bulbs along
 *              the compound front, serial-light strings from the steeple down to the lawn, floodlights on the
 *              facade at night; paper star lanterns on houses in Abids, Secunderabad and around.
 *   bonalu     neem-and-marigold festoons and paper buntings across the procession roads, the decorated gate
 *              arch and the row of offered bonam pots at the temple, the thottelu tower carried along, the
 *              little lamps on the women's pots glowing.
 *   ramzan     lit crescent-and-star cut-outs on the bazaar strings (chand_raat too).
 * Kid-friendly and respectful: nothing here is destructible, the people are N.seasons crowds (drawn by
 * view3d_actors.js from N.seasons.scene()).
 *
 * Cost: a site exists only while its festival is on and the player is near (numaish < 760 u, churches
 * < 620 u, bonalu < 600 u); built once into merged meshes (one shared Lambert program with a per-vertex
 * glow attribute lit at night, a sign atlas, additive glow points / ground pools / searchlight beams),
 * then only a few transforms move per frame (train, carousel, beams, thottelu). Disposed when out of range.
 * Decor pieces that could hide the player (crib, tree, stall rows) hide while they stand between the camera
 * and the player. Loads after view3d_landmarks.js; registers the 'festivals3d' layer.
 * Debug / tests: N.festivals3d = {sites(), stats(), rebuild()}.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.view3d) return;
  const V3 = N.view3d, U = N.util, TAU = Math.PI * 2, PI = Math.PI;
  let THREE = null, H = null, ROOT = null;
  const M = {}; // materials
  const UNI = { uFestN: { value: 0 }, uGlowI: { value: 0 }, uScale: { value: 400 }, uBeamI: { value: 0 } };
  const SITES = new Map();
  const ST = { built: 0, disposed: 0, buildMs: 0, sites: 0, hidden: 0 };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const S = () => N.seasons;
  const on = (n) => { const s = S(); return !!(s && s.is && s.is(n)); };

  /* ================================================================ geometry builder */
  // merged triangles with flat normals, linear vertex colours, a per-vertex glow amount (night emission)
  // and optional uv; a local frame (origin + rotation about y, three.js rotation.y convention).
  class GB {
    constructor() { this.p = []; this.n = []; this.c = []; this.g = []; this.uv = []; this.hasUV = false; this.cr = 1; this.cg = 1; this.cb = 1; this.gl = 0; this.ox = 0; this.oy = 0; this.oz = 0; this.ca = 1; this.sa = 0; }
    col(hex, glow) { const c = H.color(hex); this.cr = c.r; this.cg = c.g; this.cb = c.b; this.gl = glow || 0; return this; }
    frame(ox, oz, ang, oy) { this.ox = ox || 0; this.oz = oz || 0; this.oy = oy || 0; this.ca = Math.cos(ang || 0); this.sa = Math.sin(ang || 0); return this; }
    X(x, z) { return this.ox + x * this.ca + z * this.sa; }
    Z(x, z) { return this.oz - x * this.sa + z * this.ca; }
    tri(a, b, c, uva, uvb, uvc) {
      const ox = this.ox, oy = this.oy, oz = this.oz, ca = this.ca, sa = this.sa, p = this.p;
      const ax = ox + a[0] * ca + a[2] * sa, az = oz - a[0] * sa + a[2] * ca, ay = a[1] + oy;
      const bx = ox + b[0] * ca + b[2] * sa, bz = oz - b[0] * sa + b[2] * ca, by = b[1] + oy;
      const cx = ox + c[0] * ca + c[2] * sa, cz = oz - c[0] * sa + c[2] * ca, cy = c[1] + oy;
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      p.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      this.c.push(this.cr, this.cg, this.cb, this.cr, this.cg, this.cb, this.cr, this.cg, this.cb);
      this.g.push(this.gl, this.gl, this.gl);
      if (uva) { this.hasUV = true; this.uv.push(uva[0], uva[1], uvb[0], uvb[1], uvc[0], uvc[1]); } else this.uv.push(0, 0, 0, 0, 0, 0);
      return this;
    }
    quad(a, b, c, d, uv) { this.tri(a, b, c, uv && uv[0], uv && uv[1], uv && uv[2]); return this.tri(a, c, d, uv && uv[0], uv && uv[2], uv && uv[3]); }
    box(x0, y0, z0, x1, y1, z1, noBottom) {
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
      if (!noBottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
      return this;
    }
    cyl(cx, y0, cz, r0, r1, h, seg, caps) {
      seg = seg || 8;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        this.quad([cx + c0 * r0, y0, cz + s0 * r0], [cx + c1 * r0, y0, cz + s1 * r0], [cx + c1 * r1, y0 + h, cz + s1 * r1], [cx + c0 * r1, y0 + h, cz + s0 * r1]);
        if (caps && r1 > 0.01) this.tri([cx, y0 + h, cz], [cx + c0 * r1, y0 + h, cz + s0 * r1], [cx + c1 * r1, y0 + h, cz + s1 * r1]);
      }
      return this;
    }
    bead(cx, cy, cz, r) { // a tiny octahedron (bulbs, ornaments, flowers)
      const P = [[cx + r, cy, cz], [cx, cy, cz + r], [cx - r, cy, cz], [cx, cy, cz - r]], T = [cx, cy + r, cz], B = [cx, cy - r, cz];
      for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4]; this.tri(T, b, a); this.tri(B, a, b); }
      return this;
    }
    blob(cx, cy, cz, rx, ry, rz, seg) { // a low-poly ellipsoid
      seg = seg || 6; const rings = 4;
      for (let j = 0; j < rings; j++) {
        const p0 = -PI / 2 + (j / rings) * PI, p1 = -PI / 2 + ((j + 1) / rings) * PI;
        for (let i = 0; i < seg; i++) {
          const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
          const v = (p, a) => [cx + Math.cos(p) * Math.cos(a) * rx, cy + Math.sin(p) * ry, cz + Math.cos(p) * Math.sin(a) * rz];
          this.quad(v(p0, a0), v(p0, a1), v(p1, a1), v(p1, a0));
        }
      }
      return this;
    }
    rod(ax, ay, az, bx, by, bz, r) { // a thin square rod between two points
      const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1;
      let ux = -dz, uy = 0, uz = dx; let ul = Math.hypot(ux, uy, uz); if (ul < 1e-4) { ux = 1; uy = 0; uz = 0; ul = 1; }
      ux = ux / ul * r; uz = uz / ul * r;
      const vx = (dy * uz - dz * uy) / L, vy = (dz * ux - dx * uz) / L, vz = (dx * uy - dy * ux) / L;
      const c = (s, t, e) => e ? [bx + ux * s + vx * t, by + uy * s + vy * t, bz + uz * s + vz * t] : [ax + ux * s + vx * t, ay + uy * s + vy * t, az + uz * s + vz * t];
      const k = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      for (let i = 0; i < 4; i++) { const p = k[i], q = k[(i + 1) % 4]; this.quad(c(p[0], p[1], 0), c(q[0], q[1], 0), c(q[0], q[1], 1), c(p[0], p[1], 1)); }
      return this;
    }
    star(cx, cy, cz, r, depth, ang) { // a paper star lantern facing world angle ang (in the builder's frame)
      const fx = Math.cos(ang), fz = Math.sin(ang), tx = -fz, tz = fx;
      const rim = []; for (let k = 0; k < 10; k++) { const a = PI / 2 + (k / 10) * TAU, rr = k % 2 ? r * 0.45 : r; rim.push([cx + tx * Math.cos(a) * rr, cy + Math.sin(a) * rr, cz + tz * Math.cos(a) * rr]); }
      const F = [cx + fx * depth, cy, cz + fz * depth], B = [cx - fx * depth, cy, cz - fz * depth];
      for (let k = 0; k < 10; k++) { const a = rim[k], b = rim[(k + 1) % 10]; this.tri(F, a, b); this.tri(B, b, a); }
      return this;
    }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.g, 1));
      if (this.hasUV) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    }
    mesh(mat) { if (!this.p.length) return null; const m = new THREE.Mesh(this.geometry(), mat || M.solid); m.matrixAutoUpdate = false; m.updateMatrix(); return m; }
  }
  // glow points / bulb strings / pools collected while building a site
  class FX {
    constructor() { this.gp = []; this.gc = []; this.gs = []; this.wires = []; this.pools = []; }
    glow(x, h, z, hex, size, k) { const c = H.color(hex), f = k == null ? 1 : k; this.gp.push(x, h, z); this.gc.push(c.r * f, c.g * f, c.b * f); this.gs.push(size || 3); return this; }
    pool(x, z, r, hex, k) { this.pools.push([x, z, r, hex, k == null ? 1 : k]); return this; }
    // a sagging bulb string from a to b (world coords): bulbs into the builder, glows here, the wire as a line
    string(b, x0, h0, z0, x1, h1, z1, n, sag, cols, glowEvery, size) {
      let px = x0, ph = h0, pz = z0;
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, h = h0 + (h1 - h0) * t - Math.sin(t * PI) * sag;
        if (i) this.wires.push(px, ph, pz, x, h, z);
        px = x; ph = h; pz = z;
        const col = cols[i % cols.length];
        b.col(col, 2.4).bead(x, h - 0.35, z, 0.36);
        if (glowEvery && i % glowEvery === 0) this.glow(x, h - 0.35, z, col, size || 3.2);
      }
      return this;
    }
  }

  /* ================================================================ materials + textures */
  function initMaterials() {
    if (M.solid) return;
    const solid = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    solid.onBeforeCompile = (sh) => {
      sh.uniforms.uFestN = UNI.uFestN;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vFestG;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvFestG = aGlow;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFestN;\nvarying float vFestG;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * vFestG * uFestN;');
    };
    solid.customProgramCacheKey = () => 'fest3d-solid';
    M.solid = solid;
    M.sign = new THREE.MeshBasicMaterial({ map: signAtlas(), side: THREE.DoubleSide, color: new THREE.Color(1, 1, 1) });
    M.wire = new THREE.LineBasicMaterial({ color: new THREE.Color(0.05, 0.05, 0.05), transparent: true, opacity: 0.7 });
    M.glow = new THREE.ShaderMaterial({
      uniforms: { map: { value: H.materials.glow.map }, uI: UNI.uGlowI, uScale: UNI.uScale },
      vertexShader: 'attribute vec3 gCol; attribute float gSize; uniform float uScale; uniform float uI; varying vec3 vC; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = max(1.0, -mv.z); gl_PointSize = clamp(gSize * uScale / d, 0.0, 34.0); vC = gCol * uI * smoothstep(5.0, 22.0, d) * (1.0 - smoothstep(500.0, 1200.0, d)); }',
      fragmentShader: 'uniform sampler2D map; varying vec3 vC; void main(){ float a = texture2D(map, gl_PointCoord).r; gl_FragColor = vec4(vC * a, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    M.pool = new THREE.MeshBasicMaterial({ map: poolTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, color: new THREE.Color(0, 0, 0) });
    M.beam = new THREE.ShaderMaterial({
      uniforms: { uI: UNI.uBeamI },
      vertexShader: 'varying float vT; varying float vR; void main(){ vT = uv.y; vR = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uI; varying float vT; varying float vR; void main(){ float e = 1.0 - abs(fract(vR * 8.0) - 0.5) * 0.0; float a = pow(1.0 - vT, 1.6) * 0.32 * uI; gl_FragColor = vec4(vec3(1.0, 0.97, 0.85) * a * e, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
  }
  function poolTex() {
    return H.tex('fest3d:pool', 64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, { linear: true });
  }
  // sign atlas: 4 columns x 16 rows of 256 x 64 px boards
  const SIGNS = {};
  const SIGN_LIST = [
    ['BANGLES', '#c8202a', '#fff4d0'], ['TOYS', '#2a5cb8', '#ffffff'], ['DELHI PAPAD', '#f2c230', '#5a1a10'], ['KASHMIRI SHAWLS', '#5a1a3a', '#f8e0a0'],
    ['DRY FRUITS', '#6a3a1a', '#ffe8b0'], ['PICKLES', '#e8641a', '#ffffff'], ['CROCKERY', '#1f6a9a', '#ffffff'], ['KHADI', '#f4f0e0', '#2a6a2a'],
    ['PEARLS', '#1a2a4a', '#f8f0e0'], ['CARPETS', '#8a1a2a', '#f8d890'], ['BOOKS', '#2a7a3a', '#ffffff'], ['AGRA PETHA', '#f8f4e8', '#2a5a2a'],
    ['DILLI CHAAT', '#d8302a', '#ffe060'], ['PAV BHAJI', '#f2b820', '#5a1a10'], ['KULFI', '#f8f0e0', '#c8302a'], ['COTTON CANDY', '#ff90c8', '#ffffff'],
    ['BHUTTA', '#2a8a3a', '#ffe060'], ['ENQUIRY', '#1a3a8a', '#ffffff'], ['TOY TRAIN', '#c8202a', '#ffe060'], ['HAPPY CHRISTMAS', '#a8141a', '#ffe8a0'],
    ['LOST & FOUND', '#f2c230', '#1a1a1a'],
  ];
  function signAtlas() {
    return H.tex('fest3d:signs', 1024, 1024, (g) => {
      SIGN_LIST.forEach((s, i) => {
        const cx = (i % 4) * 256, cy = Math.floor(i / 4) * 64;
        g.fillStyle = s[1]; g.fillRect(cx, cy, 256, 64);
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 4; g.strokeRect(cx + 4, cy + 4, 248, 56);
        g.fillStyle = s[2]; g.textAlign = 'center'; g.textBaseline = 'middle';
        let fs = 40; g.font = 'bold ' + fs + 'px "Trebuchet MS", Arial, sans-serif';
        while (g.measureText(s[0]).width > 230 && fs > 16) { fs -= 2; g.font = 'bold ' + fs + 'px "Trebuchet MS", Arial, sans-serif'; }
        g.fillText(s[0], cx + 128, cy + 34);
      });
    }, { linear: true });
  }
  function signUV(name) {
    let i = SIGN_LIST.findIndex((s) => s[0] === name); if (i < 0) i = 0;
    const u0 = (i % 4) / 4, u1 = u0 + 0.25, v1 = 1 - Math.floor(i / 4) / 16, v0 = v1 - 1 / 16;
    return [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]; // (checked on screen: text upright, reading left to right)
  }
  // a signboard quad facing (fx, fz) centred at (x, y, z) in world coordinates
  function sign(sb, name, x, y, z, w, h, fx, fz) {
    const tx = -fz, tz = fx, uv = signUV(name), o = 0.06;
    const a = [x - tx * w / 2 + fx * o, y - h / 2, z - tz * w / 2 + fz * o], b = [x + tx * w / 2 + fx * o, y - h / 2, z + tz * w / 2 + fz * o];
    const c = [x + tx * w / 2 + fx * o, y + h / 2, z + tz * w / 2 + fz * o], d = [x - tx * w / 2 + fx * o, y + h / 2, z - tz * w / 2 + fz * o];
    sb.quad(a, b, c, d, uv);
  }

  /* ================================================================ site plumbing */
  function finishSite(site, parts, fx, ox, oz) {
    const grp = new THREE.Group(); grp.name = 'fest3d:' + site.key;
    site.grp = grp; site.occ = [];
    const shadows = !!(H.quality && H.quality.shadows);
    for (const p of parts) {
      if (!p) continue;
      const m = p.isMesh ? p : p.mesh ? p.mesh() : null;
      if (!m) continue;
      m.castShadow = shadows && !p.noShadow && m.material === M.solid; m.receiveShadow = shadows && m.material === M.solid;
      grp.add(m);
      if (p.occ || m.userData.occ) { const bb = m.geometry.boundingBox.clone(); site.occ.push({ m, bb }); }
    }
    if (fx) {
      if (fx.gp.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(fx.gp, 3)); g.setAttribute('gCol', new THREE.Float32BufferAttribute(fx.gc, 3)); g.setAttribute('gSize', new THREE.Float32BufferAttribute(fx.gs, 1));
        g.computeBoundingSphere();
        const pts = new THREE.Points(g, M.glow); pts.renderOrder = 9; pts.frustumCulled = true; grp.add(pts); site.glows = pts;
      }
      if (fx.wires.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(fx.wires, 3)); g.computeBoundingSphere();
        grp.add(new THREE.LineSegments(g, M.wire));
      }
      if (fx.pools.length) {
        const P = [], C = [], UV = [];
        for (const [x, z, r, hex, k] of fx.pools) {
          const c = H.color(hex);
          const q = [[x - r, z - r, 0, 0], [x + r, z - r, 1, 0], [x + r, z + r, 1, 1], [x - r, z - r, 0, 0], [x + r, z + r, 1, 1], [x - r, z + r, 0, 1]];
          for (const v of q) { P.push(v[0], 0.35, v[1]); C.push(c.r * k, c.g * k, c.b * k); UV.push(v[2], v[3]); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.computeBoundingSphere();
        const pm = new THREE.Mesh(g, M.pool); pm.renderOrder = 2; grp.add(pm); site.pools = pm;
      }
    }
    grp.position.set(ox || 0, 0, oz || 0);
    ROOT.add(grp);
  }
  function disposeSite(key) {
    const s = SITES.get(key); if (!s) return;
    SITES.delete(key); ST.disposed++;
    if (s.grp) {
      ROOT.remove(s.grp);
      s.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
  }
  // hide decor that stands between the camera and the player (it is not in the core's camera collision grid)
  const _seg = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 };
  function segHitsBox(bb, ox, oz) {
    let t0 = 0, t1 = 1;
    const a = [_seg.ax - ox, _seg.ay, _seg.az - oz], d = [_seg.bx - _seg.ax, _seg.by - _seg.ay, _seg.bz - _seg.az];
    const mn = [bb.min.x - 0.8, bb.min.y, bb.min.z - 0.8], mx = [bb.max.x + 0.8, bb.max.y + 0.8, bb.max.z + 0.8];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-6) { if (a[i] < mn[i] || a[i] > mx[i]) return false; continue; }
      let ta = (mn[i] - a[i]) / d[i], tb = (mx[i] - a[i]) / d[i]; if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false;
    }
    return true;
  }
  function occlusion(site) {
    if (!site.occ || !site.occ.length) return;
    const cam = H.camera, p = N.player; if (!cam || !p) return;
    _seg.ax = cam.position.x; _seg.ay = cam.position.y; _seg.az = cam.position.z;
    _seg.bx = p.x; _seg.by = (V3.elevation ? V3.elevation(p) : 0) + 5; _seg.bz = p.y;
    const fps = H.mode === 'fps';
    for (const o of site.occ) {
      const hit = !fps && segHitsBox(o.bb, site.grp.position.x, site.grp.position.z);
      if (hit) { o.m.visible = false; o.t = 0.6; ST.hidden++; }
      else if (!o.m.visible) { o.t = (o.t || 0) - 0.016; if (o.t <= 0) o.m.visible = true; }
    }
  }

  /* ================================================================ NUMAISH */
  const GOODS = {
    bangles: ['#e8202a', '#2a5cd8', '#30b050', '#f2c230', '#c03a9a', '#f4f0e0', '#ff8a2a'], toys: ['#e83a5a', '#2a5cd8', '#f2c230', '#30b050', '#ff8a2a'],
    papad: ['#f2e8c8', '#e8d8a8', '#f8f0d8'], shawls: ['#8a1a2a', '#c8902a', '#1f6a6a', '#5a2a6a', '#2a3a7a'], dryfruit: ['#a0683a', '#d8b878', '#6a3a1a', '#c89858'],
    pickles: ['#c8301a', '#e8741a', '#6a8a2a', '#a8201a'], crockery: ['#f8f8f8', '#3a6ad8', '#e8e8f0'], khadi: ['#f4f0e0', '#e8dcc0', '#d8c8a0'], pearls: ['#f8f4ea', '#e8e0d0'],
    carpets: ['#8a1a2a', '#c8902a', '#2a3a6a', '#1f5a4a'], books: ['#c8302a', '#2a5cb8', '#2a8a3a', '#e8c040', '#7a3db8'], petha: ['#f8f8e8', '#e8f0c8'],
    chaat: ['#e8a040', '#c8301a', '#f4e0a0'], pavbhaji: ['#c8501a', '#f2c230'], kulfi: ['#f8f0e0', '#e8b0a0', '#a0d8a0'], candy: ['#ff90c8', '#ffb8e0', '#ffffff'],
  };
  // one stall in world coordinates (s from the layout); b = solid builder, sb = sign builder
  function buildStall(b, sb, fx, s, food) {
    const nx = s.nx, nz = s.ny, tx = -nz, tz = nx;      // front normal and the along-row axis
    const cx = s.cx, cz = s.cy, hl = s.len / 2, hd = s.dep / 2;
    const P = (u, y, w) => [cx + tx * u + nx * w, y, cz + tz * u + nz * w]; // u along, w towards the front
    const H0 = food ? 8.4 : 9.4, HF = food ? 7.4 : 8.2;
    const wall = food ? '#efe6d2' : '#e8dcc4';
    // back + side walls (cloth over a frame) and the floor
    b.col(wall, 0.18).quad(P(-hl, 0, -hd), P(hl, 0, -hd), P(hl, H0, -hd), P(-hl, H0, -hd));
    b.col(U.shade(s.col, 1.25), 0.15);
    for (const u of [-hl, hl]) b.quad(P(u, 0, -hd), P(u, 0, hd), P(u, HF, hd), P(u, H0, -hd));
    b.col('#b8a888', 0).quad(P(-hl, 0.05, -hd), P(hl, 0.05, -hd), P(hl, 0.05, hd), P(-hl, 0.05, hd));
    // corner posts
    b.col('#6a5a4a', 0); for (const u of [-hl, hl]) { const q = P(u, 0, hd); b.cyl(q[0], 0, q[2], 0.18, 0.18, HF + 0.4, 4); }
    // the striped canopy sloping over the front (lit from below at night)
    const n = Math.max(3, Math.round(s.len / 1.6));
    for (let i = 0; i < n; i++) {
      const u0 = -hl - 0.3 + (i / n) * (s.len + 0.6), u1 = -hl - 0.3 + ((i + 1) / n) * (s.len + 0.6);
      b.col(i % 2 ? '#f8f2e4' : s.col, 0.28).quad(P(u0, H0 + 0.6, -hd - 0.3), P(u1, H0 + 0.6, -hd - 0.3), P(u1, HF - 0.2, hd + 1.8), P(u0, HF - 0.2, hd + 1.8));
    }
    // scalloped valance along the canopy front
    for (let i = 0; i < n; i++) { const u0 = -hl - 0.3 + (i / n) * (s.len + 0.6), u1 = -hl - 0.3 + ((i + 1) / n) * (s.len + 0.6); b.col(i % 2 ? s.col : '#f8f2e4', 0.3).tri(P(u0, HF - 0.2, hd + 1.8), P(u1, HF - 0.2, hd + 1.8), P((u0 + u1) / 2, HF - 1.3, hd + 1.8)); }
    // counter
    b.col(food ? '#c8c0b0' : '#8a5a3a', 0.05).box(...flatBox(P, -hl + 0.3, 0, hd - 1.4, hl - 0.3, 3.0, hd - 0.1));
    b.col(food ? '#e8e0d0' : '#c8a878', 0.1).box(...flatBox(P, -hl + 0.2, 3.0, hd - 1.5, hl - 0.2, 3.25, hd));
    // goods: on the counter, on the back wall, hanging from the canopy rod
    const gc = GOODS[s.kind] || GOODS.toys, rng = U.rng('fest3d:' + s.kind + s.cx + ':' + s.cy);
    const G = (glow) => b.col(gc[(rng.next() * gc.length) | 0], glow);
    switch (s.kind) {
      case 'bangles': // racks of bangles: rainbow bands on the back wall + stacks on the counter
        for (let r = 0; r < 4; r++) for (let u = -hl + 0.8; u < hl - 0.6; u += 0.55) { G(0.45); const q = P(u, 4.0 + r * 1.1, -hd + 0.25); b.box(q[0] - 0.22 * Math.abs(tx) - 0.05, q[1], q[2] - 0.22 * Math.abs(tz) - 0.05, q[0] + 0.22 * Math.abs(tx) + 0.05, q[1] + 0.8, q[2] + 0.22 * Math.abs(tz) + 0.05, true); }
        for (let u = -hl + 1; u < hl - 0.8; u += 1.1) { G(0.4); const q = P(u, 3.25, hd - 0.8); b.cyl(q[0], 3.25, q[2], 0.45, 0.45, 1.4, 6, true); }
        break;
      case 'toys':
        for (let u = -hl + 1; u < hl - 0.8; u += 1.2) { G(0.3); const q = P(u, 3.25, hd - 0.8); b.box(q[0] - 0.4, 3.25, q[2] - 0.4, q[0] + 0.4, 3.25 + 0.6 + rng.next() * 0.8, q[2] + 0.4, true); }
        for (let k = 0; k < 5; k++) { const q = P(-hl + 1 + k * (s.len - 2) / 4, 0, hd + 1.2); G(0.35).blob(q[0], HF + 1.6 + (k % 2) * 0.8, q[2], 0.65, 0.8, 0.65, 6); }
        for (let r = 0; r < 2; r++) for (let u = -hl + 1; u < hl - 0.8; u += 1.3) { G(0.25); const q = P(u, 4.6 + r * 1.6, -hd + 0.4); b.blob(q[0], q[1], q[2], 0.5, 0.5, 0.35, 5); }
        break;
      case 'shawls': case 'carpets': case 'khadi': // cloths hanging from the rod at the front + folded stacks
        for (let u = -hl + 0.4; u < hl - 0.6; u += 1.5) {
          const c1 = gc[(rng.next() * gc.length) | 0], c2 = s.kind === 'khadi' ? '#2a6a2a' : '#e8c060';
          b.col(c1, 0.3).quad(P(u, 3.6, hd + 0.9), P(u + 1.3, 3.6, hd + 0.9), P(u + 1.3, HF - 0.4, hd + 1.4), P(u, HF - 0.4, hd + 1.4));
          b.col(c2, 0.35).quad(P(u, 3.6, hd + 0.92), P(u + 1.3, 3.6, hd + 0.92), P(u + 1.3, 4.0, hd + 0.98), P(u, 4.0, hd + 0.98));
        }
        for (let u = -hl + 1; u < hl - 0.8; u += 1.4) { G(0.25); const q = P(u, 3.25, hd - 0.9); b.box(q[0] - 0.6, 3.25, q[2] - 0.5, q[0] + 0.6, 4.2, q[2] + 0.5, true); }
        for (let r = 0; r < 3; r++) for (let u = -hl + 0.8; u < hl - 0.8; u += 1.3) { G(0.25); const q = P(u, 3.8 + r * 1.5, -hd + 0.4); b.box(q[0] - 0.55, q[1], q[2] - 0.3, q[0] + 0.55, q[1] + 1.1, q[2] + 0.3, true); }
        break;
      case 'papad': case 'petha': case 'crockery': // round stacks
        for (let u = -hl + 0.9; u < hl - 0.6; u += 1.0) { G(0.3); const q = P(u, 3.25, hd - 0.8); b.cyl(q[0], 3.25, q[2], 0.5, 0.48, 0.6 + rng.next() * 1.4, 7, true); }
        for (let r = 0; r < 3; r++) for (let u = -hl + 0.8; u < hl - 0.8; u += 1.2) { G(0.25); const q = P(u, 3.8 + r * 1.5, -hd + 0.5); b.cyl(q[0], q[1], q[2], 0.45, 0.45, 0.9, 6, true); }
        break;
      case 'pickles': case 'dryfruit':
        for (let u = -hl + 0.9; u < hl - 0.6; u += 1.0) { G(0.3); const q = P(u, 3.25, hd - 0.8); if (s.kind === 'pickles') b.cyl(q[0], 3.25, q[2], 0.42, 0.42, 1.1, 6, true); else b.blob(q[0], 3.4, q[2], 0.55, 0.45, 0.55, 6); }
        for (let r = 0; r < 3; r++) for (let u = -hl + 0.8; u < hl - 0.8; u += 0.9) { G(0.25); const q = P(u, 3.8 + r * 1.5, -hd + 0.5); b.cyl(q[0], q[1], q[2], 0.35, 0.35, 0.9, 6, true); }
        break;
      case 'pearls': case 'books':
        b.col(s.kind === 'pearls' ? '#1a2440' : '#6a4a2a', 0.1).quad(P(-hl + 0.4, 3.6, -hd + 0.3), P(hl - 0.4, 3.6, -hd + 0.3), P(hl - 0.4, H0 - 1.2, -hd + 0.3), P(-hl + 0.4, H0 - 1.2, -hd + 0.3));
        for (let r = 0; r < 4; r++) for (let u = -hl + 0.8; u < hl - 0.8; u += s.kind === 'pearls' ? 0.5 : 0.35) { G(s.kind === 'pearls' ? 0.7 : 0.2); const q = P(u, 4.0 + r * 1.2, -hd + 0.45); if (s.kind === 'pearls') b.bead(q[0], q[1] + 0.4, q[2], 0.18); else b.box(q[0] - 0.12, q[1], q[2] - 0.12, q[0] + 0.12, q[1] + 0.9, q[2] + 0.12, true); }
        for (let u = -hl + 1; u < hl - 0.8; u += 1.2) { G(0.3); const q = P(u, 3.25, hd - 0.8); b.box(q[0] - 0.45, 3.25, q[2] - 0.35, q[0] + 0.45, 3.6, q[2] + 0.35, true); }
        break;
      case 'candy': // pink clouds of cotton candy on sticks
        for (let u = -hl + 1; u < hl - 0.8; u += 1.2) { G(0.5); const q = P(u, 0, hd - 0.7); b.blob(q[0], 4.6, q[2], 0.6, 0.7, 0.6, 6); }
        break;
      default: // food: big kadhai / tawa, steel vessels
        for (let u = -hl + 1.2; u < hl - 1; u += 2.2) { b.col('#b8b8c0', 0.15); const q = P(u, 3.25, hd - 0.8); b.cyl(q[0], 3.25, q[2], 0.8, 0.95, 0.7, 8, true); G(0.3).blob(q[0], 3.95, q[2], 0.7, 0.2, 0.7, 6); }
        break;
    }
    // the tube light under the canopy, the lit interior, a bulb row along the canopy edge
    b.col('#f4fbff', 2.6).box(...flatBox(P, -hl + 1, HF - 0.6, hd + 0.6, hl - 1, HF - 0.35, hd + 0.8));
    fx.glow(P(0, 0, 0)[0] + nx * (hd + 0.8), HF - 0.5, P(0, 0, 0)[2] + nz * (hd + 0.8), '#e8f4ff', 7, 0.55);
    for (let i = 0; i <= 4; i++) { const q = P(-hl + i * s.len / 4, 0, hd + 1.85); const c = ['#ffe070', '#ff7050', '#80ff90', '#80c0ff', '#ffe070'][i]; b.col(c, 2.4).bead(q[0], HF - 0.5, q[2], 0.3); fx.glow(q[0], HF - 0.5, q[2], c, 2.6); }
    // signboard over the canopy
    const sp = P(0, 0, -hd - 0.1);
    b.col('#5a4a3a', 0).box(sp[0] - 0.1 - Math.abs(tx) * hl * 0.9, H0 + 0.5, sp[2] - 0.1 - Math.abs(tz) * hl * 0.9, sp[0] + 0.1 + Math.abs(tx) * hl * 0.9, H0 + 0.7, sp[2] + 0.1 + Math.abs(tz) * hl * 0.9, true);
    sign(sb, s.name, sp[0] + nx * 0.15, H0 + 1.75, sp[2] + nz * 0.15, Math.min(s.len - 0.6, 9.5), 2.1, nx, nz);
  }
  function flatBox(P, u0, y0, w0, u1, y1, w1) { const a = P(u0, y0, w0), b = P(u1, y1, w1); return [Math.min(a[0], b[0]), y0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), y1, Math.max(a[2], b[2])]; }

  function* buildNumaish(site) {
    const L = S().layout.numaish(); if (!L) return false;
    const t0 = now(); ST.prof = {};
    const fx = new FX(), sb = new GB(), misc = new GB(), bulbs = new GB(), parts = [];
    // stall rows (one mesh per row: each hides on its own when it is between the camera and the player)
    const rows = new Map();
    for (const s of L.stalls) { const k = s.nx + ':' + s.ny; if (!rows.has(k)) rows.set(k, new GB()); buildStall(rows.get(k), sb, fx, s, false); yield; }
    for (const b of rows.values()) { b.occ = true; parts.push(b); }
    const food = new GB(); food.occ = true;
    for (const s of L.counters) { buildStall(food, sb, fx, s, true); yield; }
    parts.push(food);
    ST.prof.stalls = +(now() - t0).toFixed(1);
    // the food court: tables, plastic chairs, poles with the strings, the glow
    for (const t of L.tables) {
      misc.col('#e8e4dc', 0.15).cyl(t.x, 2.6, t.y, 2.3, 2.3, 0.25, 10, true);
      misc.col('#9a9aa0', 0).cyl(t.x, 0, t.y, 0.18, 0.18, 2.6, 4);
      for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + 0.4, x = t.x + Math.cos(a) * 3.4, z = t.y + Math.sin(a) * 3.4; misc.col(t.col, 0.12).box(x - 0.8, 1.5, z - 0.8, x + 0.8, 1.8, z + 0.8, true); misc.col(t.col, 0.12).box(x + Math.cos(a) * 0.7 - 0.8 * Math.abs(Math.sin(a)) - 0.1, 1.8, z + Math.sin(a) * 0.7 - 0.8 * Math.abs(Math.cos(a)) - 0.1, x + Math.cos(a) * 0.7 + 0.8 * Math.abs(Math.sin(a)) + 0.1, 3.4, z + Math.sin(a) * 0.7 + 0.8 * Math.abs(Math.cos(a)) + 0.1, true); for (const e of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) misc.col(U.shade(t.col, 0.8), 0).box(x + e[0] - 0.08, 0, z + e[1] - 0.08, x + e[0] + 0.08, 1.5, z + e[1] + 0.08, true); }
      // a few steel plates and glasses
      for (let k = 0; k < 3; k++) { const a = k * 2.1; misc.col('#d8dce0', 0.2).cyl(t.x + Math.cos(a) * 1.2, 2.85, t.y + Math.sin(a) * 1.2, 0.55, 0.55, 0.08, 8, true); }
    }
    for (const q of L.poles || []) misc.col('#7a6a5a', 0).cyl(q[0], 0, q[1], 0.22, 0.22, q[2] * 1.4 + 0.6, 5);
    yield;
    // bulb strings (heights x1.4 into 3D: the 2D overlay works in data units)
    const cols = ['#ff5040', '#ffe040', '#50ff80', '#50a0ff', '#ff60e0'], warm = ['#ffe070', '#ff9a40', '#fff4d0'];
    for (const st of L.strings) fx.string(bulbs, st.x0, st.h0 * 1.4, st.y0, st.x1, st.h1 * 1.4, st.y1, Math.max(3, Math.round(st.n * 1.15)), st.sag * 1.3, st.radial || st.lane ? cols : warm, st.radial ? 2 : 1, st.radial ? 3.4 : 3);
    // the loudspeaker mast: lattice pole, platform, four horns, a flag
    const Mt = L.mast, mh = Mt.h * 1.4;
    misc.col('#6a6e74', 0).cyl(Mt.x, 0, Mt.y, 0.7, 0.45, mh, 6).col('#8a8e94', 0).cyl(Mt.x, mh - 3, Mt.y, 1.8, 1.8, 0.4, 8, true);
    for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + 0.6, hx = Math.cos(a), hz = Math.sin(a); misc.col('#b8bcc0', 0.1).rod(Mt.x + hx * 0.6, mh - 1.2, Mt.y + hz * 0.6, Mt.x + hx * 2.6, mh - 0.8, Mt.y + hz * 2.6, 0.35).cyl(Mt.x + hx * 2.8, mh - 1.6, Mt.y + hz * 2.8, 0.3, 1.0, 1.4, 6); }
    misc.col('#e8402a', 0.2).quad([Mt.x, mh + 3.6, Mt.y], [Mt.x + 3.4, mh + 3.0, Mt.y], [Mt.x + 3.4, mh + 1.4, Mt.y], [Mt.x, mh + 1.8, Mt.y]).col('#6a6e74', 0).cyl(Mt.x, mh, Mt.y, 0.12, 0.12, 4, 4);
    yield;
    // the enquiry booth (lost and found: the loudspeaker voice), a ticket counter feel
    const B = L.booth;
    misc.col('#efe6d2', 0.15).box(B.x, 0, B.y, B.x + B.w, 8.5, B.y + B.d).col('#2a5cb8', 0.1).box(B.x - 0.6, 8.5, B.y - 0.6, B.x + B.w + 0.6, 9.3, B.y + B.d + 0.6);
    misc.col('#fff4c0', 1.6).quad([B.x - 0.05, 3.2, B.y + 1.2], [B.x - 0.05, 3.2, B.y + B.d - 1.2], [B.x - 0.05, 6.6, B.y + B.d - 1.2], [B.x - 0.05, 6.6, B.y + 1.2]);
    sign(sb, 'ENQUIRY', B.x - 0.1, 10.6, B.y + B.d / 2, B.d + 0.6, 1.9, -1, 0);
    misc.col('#b8bcc0', 0.1).cyl(B.x + B.w / 2, 9.3, B.y + B.d / 2, 0.2, 0.2, 3.4, 4).cyl(B.x + B.w / 2 - 0.8, 12, B.y + B.d / 2, 0.3, 1.1, 1.4, 6);
    fx.glow(B.x - 0.4, 5, B.y + B.d / 2, '#fff0c0', 8, 0.7);
    // the toy train loop: ballast, sleepers, two rails, a little station board
    const T = L.train;
    for (let i = 0; i < 64; i++) {
      const a0 = (i / 64) * TAU, a1 = ((i + 1) / 64) * TAU;
      const p = (a, o) => [T.cx + (T.rx + o) * Math.cos(a), T.cy + (T.ry + o) * Math.sin(a)];
      const q0 = p(a0, -1.6), q1 = p(a1, -1.6), q2 = p(a1, 1.6), q3 = p(a0, 1.6);
      misc.col('#8a7a6a', 0).quad([q0[0], 0.1, q0[1]], [q1[0], 0.1, q1[1]], [q2[0], 0.1, q2[1]], [q3[0], 0.1, q3[1]]);
      for (const o of [-0.7, 0.7]) { const r0 = p(a0, o), r1 = p(a1, o); misc.col('#c8ccd2', 0.05).rod(r0[0], 0.35, r0[1], r1[0], 0.35, r1[1], 0.1); }
      if (i % 2 === 0) { const s0 = p(a0, -1.2), s1 = p(a0, 1.2); misc.col('#5a4030', 0).rod(s0[0], 0.18, s0[1], s1[0], 0.18, s1[1], 0.18); }
    }
    sign(sb, 'TOY TRAIN', T.cx, 7.2, T.cy, 7, 1.8, 0, 1);
    misc.col('#7a6a5a', 0).cyl(T.cx - 3, 0, T.cy, 0.15, 0.15, 6.2, 4).cyl(T.cx + 3, 0, T.cy, 0.15, 0.15, 6.2, 4);
    yield;
    // searchlight drums
    for (const q of L.search) { misc.col('#3a3e44', 0).box(q[0] - 1.4, 0, q[1] - 1.4, q[0] + 1.4, 1.6, q[1] + 1.4).col('#5a5e64', 0.1).cyl(q[0], 1.6, q[1], 1.1, 1.3, 1.8, 10, true); fx.glow(q[0], 3.2, q[1], '#fffbe0', 9, 0.9); }
    // ground glow under the strings and in front of the rows
    for (const pl of L.pools) fx.pool(pl.x, pl.y, pl.r, pl.col, pl.i * 0.55);
    // assemble
    ST.prof.misc = +(now() - t0).toFixed(1);
    parts.push(misc, bulbs, sb.mesh(M.sign));
    yield;
    finishSite(site, parts, fx, 0, 0);
    site.grp.visible = false;
    ST.prof.finish = +(now() - t0).toFixed(1);
    site.L = L;
    yield;
    // the carousel (turns), the toy train (runs), the searchlight beams (sweep)
    site.car = buildCarousel(L.carousel); site.grp.add(site.car);
    yield;
    site.cars = buildTrain(T); for (const c of site.cars) site.grp.add(c);
    site.beams = L.search.map((q, i) => { const m = buildBeam(); m.position.set(q[0], 3.2, q[1]); m.userData.i = i; site.grp.add(m); return m; });
    site.update = updateNumaish;
    ST.prof.all = +(now() - t0).toFixed(1);
    return true;
  }
  function buildCarousel(C) {
    const b = new GB(), fx = new FX();
    b.col('#c8b898', 0.1).cyl(0, 0, 0, C.r, C.r, 1.1, 18, true).col('#e8c040', 0.3).cyl(0, 1.1, 0, C.r + 0.05, C.r + 0.05, 0.2, 18);
    b.col('#d8d0c0', 0.2).cyl(0, 1.1, 0, 1.4, 1.4, 10.4, 10);
    // the striped cone roof with a scalloped rim and a finial
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU, r = C.r + 0.8;
      b.col(i % 2 ? '#f8f0e0' : '#e8303a', 0.35).tri([0, 15.5, 0], [Math.cos(a1) * r, 11.5, Math.sin(a1) * r], [Math.cos(a0) * r, 11.5, Math.sin(a0) * r]);
      b.col(i % 2 ? '#e8303a' : '#f2c230', 0.35).quad([Math.cos(a0) * r, 11.5, Math.sin(a0) * r], [Math.cos(a1) * r, 11.5, Math.sin(a1) * r], [Math.cos(a1) * r, 10.4, Math.sin(a1) * r], [Math.cos(a0) * r, 10.4, Math.sin(a0) * r]);
      const m = (a0 + a1) / 2; b.col('#ffe070', 2.4).bead(Math.cos(m) * r, 10.3, Math.sin(m) * r, 0.32); fx.glow(Math.cos(m) * r, 10.3, Math.sin(m) * r, i % 2 ? '#ffe070' : '#ff70c0', 3);
    }
    b.col('#f2c230', 1.2).cyl(0, 15.5, 0, 0.5, 0.05, 1.8, 6); fx.glow(0, 16.4, 0, '#ffe070', 5);
    // horses on poles (simple and cheerful), two rings
    const HC = ['#f8f4ea', '#f2c230', '#e86a8a', '#60b0e8'];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, r = C.r - 1.6, x = Math.cos(a) * r, z = Math.sin(a) * r, dx = -Math.sin(a), dz = Math.cos(a);
      const hy = 3.2 + (i % 2) * 1.1;
      b.col('#e8e0c0', 0.3).cyl(x, 1.1, z, 0.1, 0.1, 9.3, 4);
      b.col(HC[i % 4], 0.25).blob(x, hy, z, 0.45 + Math.abs(dx) * 0.9, 0.55, 0.45 + Math.abs(dz) * 0.9, 6);
      b.blob(x + dx * 1.2, hy + 0.9, z + dz * 1.2, 0.35, 0.6, 0.35, 5);
      b.col('#c8202a', 0.2).box(x - 0.3, hy + 0.5, z - 0.3, x + 0.3, hy + 0.65, z + 0.3, true);
      for (const s of [-0.8, 0.8]) b.col(U.shade(HC[i % 4], 0.8), 0.1).rod(x + dx * s, hy - 0.3, z + dz * s, x + dx * s * 1.2, hy - 1.6, z + dz * s * 1.2, 0.1);
    }
    const g = new THREE.Group(); g.name = 'fest3d:carousel';
    const m = b.mesh(); m.castShadow = !!(H.quality && H.quality.shadows); g.add(m);
    const pts = new THREE.Points(glowGeo(fx), M.glow); pts.renderOrder = 9; g.add(pts);
    g.position.set(C.x, 0, C.y);
    return g;
  }
  function glowGeo(fx) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(fx.gp, 3)); g.setAttribute('gCol', new THREE.Float32BufferAttribute(fx.gc, 3)); g.setAttribute('gSize', new THREE.Float32BufferAttribute(fx.gs, 1)); g.computeBoundingSphere(); return g; }
  function buildTrain(T) {
    const out = [];
    for (let i = 0; i < T.cars; i++) {
      const b = new GB(), fx = new FX();
      if (i === 0) { // the engine: red with gold bands, a boiler, a cab, a chimney, a cowcatcher, the headlamp
        b.col('#1a1a1a', 0).box(-2.8, 0.5, -1.2, 2.8, 1.3, 1.2);
        for (let k = 0; k < 10; k++) { const a0 = (k / 10) * TAU, a1 = ((k + 1) / 10) * TAU; b.col(k % 5 === 0 ? '#e8b830' : '#c8202a', 0.2).quad([-0.2, 2.3 + Math.sin(a0) * 1.0, Math.cos(a0) * 1.0], [-0.2, 2.3 + Math.sin(a1) * 1.0, Math.cos(a1) * 1.0], [2.6, 2.3 + Math.sin(a1) * 1.0, Math.cos(a1) * 1.0], [2.6, 2.3 + Math.sin(a0) * 1.0, Math.cos(a0) * 1.0]); }
        b.col('#e8b830', 0.3).cyl(2.0, 3.0, 0, 0.35, 0.5, 1.6, 6).col('#1a1a1a', 0).cyl(1.0, 3.1, 0, 0.3, 0.3, 0.8, 6);
        b.col('#2a5cb8', 0.2).box(-2.8, 1.3, -1.3, -0.3, 4.2, 1.3).col('#c8202a', 0.2).box(-3.1, 4.2, -1.5, 0, 4.6, 1.5);
        b.col('#fff4c0', 1.8).box(-2.5, 2.8, -1.32, -0.6, 3.8, 1.32);
        b.col('#e8b830', 0.2).tri([2.8, 0.5, -1.2], [3.8, 0.4, 0], [2.8, 0.5, 1.2]).col('#fff8d0', 2.8).bead(2.75, 2.3, 0, 0.45);
        fx.glow(3.0, 2.3, 0, '#fff4c0', 9);
      } else { // open coaches with a canopy and kids waving
        const C = ['#2a5cd8', '#f2c230', '#30a050'][(i - 1) % 3];
        b.col('#1a1a1a', 0).box(-2.6, 0.5, -1.2, 2.6, 1.1, 1.2);
        b.col(C, 0.25).box(-2.6, 1.1, -1.3, 2.6, 2.6, -1.1).box(-2.6, 1.1, 1.1, 2.6, 2.6, 1.3).box(-2.6, 1.1, -1.3, -2.4, 2.6, 1.3).box(2.4, 1.1, -1.3, 2.6, 2.6, 1.3);
        for (const u of [-2.4, 2.4]) for (const v of [-1.2, 1.2]) b.col('#e8e0d0', 0.1).cyl(u, 2.6, v, 0.08, 0.08, 2.4, 4);
        for (let k = 0; k < 6; k++) b.col(k % 2 ? '#f8f0e0' : C, 0.3).quad([-2.8 + k * 0.94, 5.0, -1.5], [-2.8 + (k + 1) * 0.94, 5.0, -1.5], [-2.8 + (k + 1) * 0.94, 5.0, 1.5], [-2.8 + k * 0.94, 5.0, 1.5]);
        const SK = ['#8a5a32', '#a0683f', '#c8906a'], SH = ['#e83a5a', '#f2c230', '#40a0e8', '#ffffff', '#30b050'];
        for (const [u, v, k] of [[-1.2, -0.5, 0], [-1.2, 0.5, 1], [1.0, -0.5, 2], [1.0, 0.5, 3]]) { if ((i + k) % 5 === 4) continue; b.col(SH[(i + k) % 5], 0.15).blob(u, 2.4, v, 0.45, 0.6, 0.4, 5).col(SK[(i + k) % 3], 0.1).blob(u, 3.3, v, 0.32, 0.36, 0.32, 5).col('#1a1412', 0).blob(u - 0.05, 3.5, v, 0.33, 0.2, 0.33, 5); }
        fx.glow(0, 4.6, 0, '#ffe8b0', 4, 0.6);
      }
      for (const u of [-1.8, 1.8]) for (const v of [-1.25, 1.25]) b.col('#2a2a2a', 0).rod(u, 0.5, v - 0.05 * Math.sign(v), u, 0.5, v + 0.25 * Math.sign(v), 0.45);
      const g = new THREE.Group(); g.name = 'fest3d:train' + i;
      const m = b.mesh(); m.matrixAutoUpdate = false; g.add(m);
      const pts = new THREE.Points(glowGeo(fx), M.glow); pts.renderOrder = 9; g.add(pts);
      out.push(g);
    }
    return out;
  }
  function buildBeam() {
    const g = new THREE.CylinderGeometry(14, 0.9, 260, 14, 1, true);
    g.translate(0, 130, 0);
    const m = new THREE.Mesh(g, M.beam); m.renderOrder = 10; m.frustumCulled = false; m.userData.noShadow = true;
    return m;
  }
  const _tp = { x: 0, y: 0, a: 0 };
  function updateNumaish(site, dt, night) {
    const st = S().layout.numaishState(), L = site.L, T = L.train;
    site.car.rotation.y = -st.car;
    for (let i = 0; i < site.cars.length; i++) {
      S().layout.trainAt(T, st.train - i * T.gap, _tp);
      site.cars[i].position.set(_tp.x, 0, _tp.y); site.cars[i].rotation.y = -_tp.a;
    }
    const lit = st.open && night > 0.3;
    for (const b of site.beams) {
      b.visible = lit;
      if (!lit) continue;
      const i = b.userData.i, t = H.time;
      const g = L.g, q = L.search[i];
      const base = Math.atan2((g[1] + g[3]) / 2 - q[1], (g[0] + g[2]) / 2 - q[0]);
      const yaw = base + Math.sin(t * 0.3 + i * 2.1) * 0.9;
      b.rotation.set(0, 0, 0); b.rotation.y = -yaw; b.rotateZ(-(0.45 + Math.sin(t * 0.21 + i) * 0.18));
    }
    UNI.uBeamI.value = lit ? Math.min(1, (night - 0.3) * 2) : 0;
    if (night > 0.2 && st.open) {
      const p = N.player;
      const cands = [[L.food.x + L.food.w / 2, L.food.y + L.food.d / 2, 14, '#ffd9a0', 1.3, 90], [L.mast.x, L.mast.y, 30, '#fff0c8', 1.1, 110], [L.carousel.x, L.carousel.y, 12, '#ffb0d8', 1.0, 60]];
      for (const c of cands) if (Math.hypot(c[0] - p.x, c[1] - p.y) < 260) H.light({ x: c[0], y: c[1], h: c[2], color: c[3], intensity: c[4] * night, r: c[5] });
    }
    if (site.pools) site.pools.visible = night > 0.12 && st.open;
  }

  /* ================================================================ CHRISTMAS */
  const FRA = { s: 0, n: PI, e: PI / 2, w: -PI / 2 };
  function buildCrib(b, fx, c) {
    // local frame: +z towards the street (open front), x across
    const ang = Math.atan2(c.ox, c.oy);
    b.frame(c.crib.x, c.crib.y, ang);
    const FX0 = (x, y, z) => [b.X(x, z), y, b.Z(x, z)];
    b.col('#d8bc70', 0.1).box(-5, 0, -3.4, 5, 0.45, 3.4);
    b.col('#a8844a', 0.15).box(-5, 0, -3.7, 5, 4.6, -3.3);
    for (let x = -4.6; x < 4.7; x += 0.9) b.col(x % 1.8 > 0.8 ? '#8a6a3a' : '#b8945a', 0.15).box(x - 0.08, 0.4, -3.3, x + 0.08, 4.6, -3.2);
    for (const [x, z] of [[-4.7, 3.1], [4.7, 3.1], [-4.7, -3.5], [4.7, -3.5]]) b.col('#6a4a2a', 0).cyl(x, 0, z, 0.28, 0.24, z > 0 ? 5.9 : 7.1, 5);
    // thatched roof (two layers) with a ragged straw fringe
    b.col('#c8a860', 0.25).quad([-5.6, 7.4, -4.0], [5.6, 7.4, -4.0], [5.6, 5.8, 3.9], [-5.6, 5.8, 3.9]);
    b.col('#a88a48', 0.15).quad([-5.6, 7.0, -4.0], [5.6, 7.0, -4.0], [5.6, 5.5, 3.9], [-5.6, 5.5, 3.9]);
    for (let x = -5.4; x < 5.5; x += 0.7) b.col(x % 1.4 > 0.7 ? '#d8bc70' : '#b8964a', 0.25).tri([x, 5.6, 3.9], [x + 0.7, 5.6, 3.9], [x + 0.35, 4.9, 4.0]);
    // the manger with the baby, a soft halo
    b.col('#8a5a32', 0.1).box(-1.1, 0.45, -0.4, 1.1, 1.5, 0.6).col('#e8d8a0', 0.2).box(-1.0, 1.5, -0.3, 1.0, 1.7, 0.5);
    b.col('#f8f0e0', 0.6).blob(0, 1.95, 0.1, 0.75, 0.35, 0.4, 6).col('#c8906a', 0.3).blob(0.65, 2.05, 0.1, 0.24, 0.24, 0.24, 5);
    b.col('#ffe890', 1.6).cyl(0.65, 2.0, 0.1, 0.5, 0.5, 0.04, 10, true);
    // Mary (blue robe, white veil) kneeling, Joseph (brown robe) standing with a staff
    b.col('#2a5cb8', 0.25).cyl(-2.1, 0.45, 0.3, 1.0, 0.45, 2.6, 8, true).col('#f4f0e8', 0.25).blob(-2.1, 3.25, 0.3, 0.42, 0.5, 0.42, 6).col('#c8906a', 0.2).blob(-2.0, 3.2, 0.55, 0.26, 0.3, 0.2, 5);
    b.col('#7a5a3a', 0.2).cyl(2.2, 0.45, -0.4, 0.9, 0.45, 3.7, 8, true).col('#c8906a', 0.2).blob(2.2, 4.45, -0.4, 0.34, 0.4, 0.34, 6).col('#e8e0d0', 0.15).blob(2.2, 4.75, -0.4, 0.38, 0.18, 0.38, 6);
    b.col('#5a3a1a', 0).cyl(2.9, 0.45, -0.2, 0.08, 0.08, 4.8, 4);
    // the ox and two sheep
    b.col('#8a6a4a', 0.15).blob(-3.6, 1.6, -2.2, 1.0, 0.75, 0.6, 6).blob(-2.7, 2.0, -1.8, 0.4, 0.4, 0.38, 5);
    b.col('#f4f0e8', 0.2).blob(3.6, 1.1, 1.6, 0.75, 0.55, 0.5, 6).blob(3.0, 1.0, 2.4, 0.6, 0.45, 0.45, 6);
    // the star over the roof
    b.col('#6a4a2a', 0).cyl(0, 7.1, -3.9, 0.08, 0.08, 2.2, 4);
    b.col('#ffe060', 2.6).star(0, 9.6, -3.9, 1.3, 0.35, PI / 2);
    const s = FX0(0, 9.6, -3.9); fx.glow(s[0], s[1], s[2], '#ffe880', 9);
    const hb = FX0(0.65, 2.1, 0.1); fx.glow(hb[0], hb[1], hb[2], '#ffe8a0', 5, 0.8);
    const lan = FX0(0, 5.2, 2.6); fx.glow(lan[0], lan[1], lan[2], '#ffd080', 6, 0.7);
    b.col('#ffd080', 2.2).bead(0, 5.2, 2.6, 0.3);
    b.frame(0, 0, 0);
  }
  function buildTree(b, fx, x, z) {
    b.col('#6a4a2a', 0).cyl(x, 0, z, 0.55, 0.45, 2.6, 6);
    b.col('#8a3a2a', 0.1).cyl(x, 0, z, 1.4, 1.2, 1.2, 8, true);
    const tiers = [[5.0, 2.2, 5.4], [4.0, 5.2, 4.8], [3.0, 8.0, 4.2], [2.0, 10.6, 3.6]];
    tiers.forEach(([r, y, h], i) => b.col(i % 2 ? '#2f8a42' : '#2a7a3a', 0.05).cyl(x, y, z, r, 0.05, h, 10));
    const OC = ['#ff3040', '#ffe040', '#40a0ff', '#ff80e0', '#ffffff'];
    const rng = U.rng('fest3d:tree' + x + ':' + z);
    for (let i = 0; i < 26; i++) {
      const tier = tiers[(rng.next() * 4) | 0], f = 0.15 + rng.next() * 0.7, a = rng.next() * TAU;
      const r = tier[0] * (1 - f) + 0.2, y = tier[1] + tier[2] * f;
      b.col(OC[i % 5], 0.7).bead(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0.36);
    }
    for (let i = 0; i < 34; i++) { // a spiral of little bulbs
      const t = i / 34, y = 2.6 + t * 10.5, r = 4.6 * (1 - t) + 0.4, a = t * TAU * 3.5;
      const c = OC[i % 4]; b.col(c, 2.4).bead(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0.2);
      if (i % 2 === 0) fx.glow(x + Math.cos(a) * r, y, z + Math.sin(a) * r, c, 2.4);
    }
    b.col('#ffe060', 2.6).star(x, 15.4, z, 1.1, 0.3, 0); fx.glow(x, 15.4, z, '#ffe880', 8);
  }
  function landmarkObj(lm) {
    const E = V3.engine; if (!E || !E.lmGroup) return null;
    let best = null;
    for (const c of E.lmGroup.children) { if (c.name === 'lm:' + lm.id) return c; if (!best && Math.abs(c.position.x - lm.x) < 1 && Math.abs(c.position.z - lm.y) < 1) best = c; }
    return best;
  }
  const _v = { x: 0, y: 0, z: 0 };
  function modelTop(obj, lm) { // the highest point of the shown church model (the steeple / cross), world coordinates
    if (!obj) return null;
    obj.updateMatrixWorld(true);
    let best = -1, bx = lm.x, bz = lm.y;
    const v = new THREE.Vector3();
    obj.traverse((m) => {
      if (!m.isMesh || !m.geometry || !m.geometry.attributes.position || m.visible === false) return;
      const pa = m.geometry.attributes.position, step = Math.max(1, Math.floor(pa.count / 4000));
      for (let i = 0; i < pa.count; i += step) { v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld); if (v.y > best) { best = v.y; bx = v.x; bz = v.z; } }
    });
    if (best < 0) return null;
    _v.x = bx; _v.y = best; _v.z = bz;
    return { x: bx, y: best, z: bz };
  }
  function* buildChurch(site, ch) {
    const lm = ch.lm, fx = new FX(), b = new GB(), bulbs = new GB(), sb = new GB(), crib = new GB(), tree = new GB(), parts = [];
    const cols = ['#ffe070', '#ff4848', '#50ff80', '#50a8ff'];
    const gx = ch.gate.x, gz = ch.gate.y, ox = ch.ox, oz = ch.oy, tx = ch.tx, tz = ch.ty;
    // the gate arch: two posts, a bulb arch, the banner and a big star on top
    const pw = 7.5;
    for (const s of [-1, 1]) b.col('#f4f0e6', 0.2).box(gx + tx * s * pw - 0.5, 0, gz + tz * s * pw - 0.5, gx + tx * s * pw + 0.5, 12.5, gz + tz * s * pw + 0.5);
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, u = (t - 0.5) * 2 * pw, h = 12.5 + Math.sin(t * PI) * 3.2, x = gx + tx * u, z = gz + tz * u;
      const c = cols[i % 4]; bulbs.col(c, 2.4).bead(x + ox * 0.5, h, z + oz * 0.5, 0.32); fx.glow(x + ox * 0.6, h, z + oz * 0.6, c, 3);
      if (i) fx.wires.push(gx + tx * ((i - 1) / 16 - 0.5) * 2 * pw, 12.5 + Math.sin(((i - 1) / 16) * PI) * 3.2, gz + tz * ((i - 1) / 16 - 0.5) * 2 * pw, x, h, z);
    }
    b.col('#a8141a', 0.2).box(gx - Math.abs(tx) * pw + ox * 0.2 - Math.abs(ox) * 0.15, 10.0, gz - Math.abs(tz) * pw + oz * 0.2 - Math.abs(oz) * 0.15, gx + Math.abs(tx) * pw + ox * 0.2 + Math.abs(ox) * 0.15, 12.1, gz + Math.abs(tz) * pw + oz * 0.2 + Math.abs(oz) * 0.15);
    sign(sb, 'HAPPY CHRISTMAS', gx + ox * 0.45, 11.05, gz + oz * 0.45, pw * 2 - 1.4, 1.95, ox, oz);
    sign(sb, 'HAPPY CHRISTMAS', gx - ox * 0.05, 11.05, gz - oz * 0.05, pw * 2 - 1.4, 1.95, -ox, -oz);
    b.col('#ffe060', 2.6).star(gx + ox * 0.5, 18.4, gz + oz * 0.5, 2.1, 0.5, Math.atan2(oz, ox));
    fx.glow(gx + ox * 0.9, 18.4, gz + oz * 0.9, '#ffe880', 14);
    // bulbs along the compound front (on the wall top, both sides of the gate)
    const z = (S().layout && N.WORLD_DATA.respect || []).find((q) => q.place === lm.id || q.id === lm.id);
    if (z && z.rects && z.rects[0]) {
      const r = z.rects[0];
      // the front edge through the gate, as a span along t
      const half = Math.abs(tx) > 0.5 ? r[2] / 2 : r[3] / 2, cU = Math.abs(tx) > 0.5 ? (r[0] + r[2] / 2 - gx) * tx : (r[1] + r[3] / 2 - gz) * tz;
      for (const [u0, u1] of [[cU - half, -pw - 1], [pw + 1, cU + half]]) {
        if (u1 - u0 < 4) continue;
        fx.string(bulbs, gx + tx * u0, 5.2, gz + tz * u0, gx + tx * u1, 5.2, gz + tz * u1, Math.round((u1 - u0) / 2.4), 0.6, cols, 2, 2.6);
      }
    }
    // serial-light strings from the steeple down to the lawn in front (filled in once the model is up)
    site.tent = { built: false, obj: null, t: 0 };
    // the crib and the tree (each hides itself if it comes between the camera and the player)
    yield;
    buildCrib(crib, fx, ch); crib.occ = true;
    yield;
    buildTree(tree, fx, ch.tree.x, ch.tree.y); tree.occ = true;
    yield;
    // floodlights on the lawn aimed at the facade
    const fl = [];
    for (const s of [-1, 1]) {
      const x = gx - ox * 4 + tx * s * 4, zz = gz - oz * 4 + tz * s * 4;
      b.col('#3a3e44', 0).box(x - 0.6, 0, zz - 0.6, x + 0.6, 0.9, zz + 0.6).col('#fff8e0', 2).box(x - 0.45, 0.9, zz - 0.45, x + 0.45, 1.1, zz + 0.45);
      fx.glow(x, 1.2, zz, '#fff4d0', 6, 0.8); fl.push([x, zz]);
    }
    fx.pool(gx - ox * 10, gz - oz * 10, 26, '#ffe8c0', 0.5);
    fx.pool(ch.crib.x, ch.crib.y, 14, '#ffd890', 0.6);
    fx.pool(ch.tree.x, ch.tree.y, 12, '#ffd8e8', 0.45);
    parts.push(b, bulbs, crib, tree, sb.mesh(M.sign));
    finishSite(site, parts, fx, 0, 0);
    site.ch = ch; site.fl = fl;
    site.update = updateChurch;
    return true;
  }
  function buildTent(site) {
    const ch = site.ch, lm = ch.lm, obj = landmarkObj(lm);
    const top = obj ? modelTop(obj, lm) : null;
    const T = top || { x: lm.x, y: (lm.h || 40) * 1.5, z: lm.y };
    const fx = new FX(), b = new GB(), cols = ['#ffe070', '#ff4848', '#50ff80', '#50a8ff', '#ffffff'];
    // anchors on the lawn: a fan in front of the church (never across the nave behind)
    const ox = ch.ox, oz = ch.oy, tx = ch.tx, tz = ch.ty, hw = (Math.abs(tx) > 0.5 ? lm.w : lm.d) / 2;
    const fx0 = lm.x + ox * ((Math.abs(ox) > 0.5 ? lm.w : lm.d) / 2), fz0 = lm.y + oz * ((Math.abs(ox) > 0.5 ? lm.w : lm.d) / 2);
    const anchors = [];
    for (const u of [-1, -0.55, -0.2, 0.2, 0.55, 1]) anchors.push([fx0 + tx * u * (hw + 6) + ox * (Math.abs(u) > 0.9 ? -6 : 5 + (1 - Math.abs(u)) * 2), fz0 + tz * u * (hw + 6) + oz * (Math.abs(u) > 0.9 ? -6 : 5 + (1 - Math.abs(u)) * 2)]);
    const th = T.y - 3.5;
    anchors.forEach((a, i) => fx.string(b, T.x + ox * 0.6, th, T.z + oz * 0.6, a[0], 3.2, a[1], Math.round(Math.hypot(a[0] - T.x, a[1] - T.z, th) / 3.0), 1.2, [cols[i % 5], cols[(i + 2) % 5]], 2, 3.2));
    // a big star hung from the tower top over the front
    b.col('#fff0a0', 2.6).star(T.x + ox * 2.4, th - 8, T.z + oz * 2.4, 2.6, 0.6, Math.atan2(oz, ox));
    fx.glow(T.x + ox * 3, th - 8, T.z + oz * 3, '#fff0b0', 16);
    const g = new THREE.Group(); g.name = 'fest3d:tent';
    const m = b.mesh(); if (m) g.add(m);
    if (fx.gp.length) { const p = new THREE.Points(glowGeo(fx), M.glow); p.renderOrder = 9; g.add(p); }
    if (fx.wires.length) { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(fx.wires, 3)); gg.computeBoundingSphere(); g.add(new THREE.LineSegments(gg, M.wire)); }
    if (site.tent.grp) { site.grp.remove(site.tent.grp); site.tent.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    site.tent.grp = g; site.grp.add(g); site.tent.obj = obj; site.tent.built = true;
  }
  function updateChurch(site, dt, night) {
    // (re)build the steeple strings when the church model appears or is swapped (procedural -> Blender)
    site.tent.t -= dt;
    if (site.tent.t <= 0) {
      site.tent.t = 1.0;
      const obj = landmarkObj(site.ch.lm);
      if (!site.tent.built || (obj && obj !== site.tent.obj)) buildTent(site);
    }
    if (night > 0.2) {
      const p = N.player, ch = site.ch;
      if (Math.hypot(ch.gate.x - p.x, ch.gate.y - p.y) < 220) {
        H.light({ x: ch.gate.x - ch.ox * 6, y: ch.gate.y - ch.oy * 6, h: 14, color: '#ffe6c0', intensity: 1.4 * night, r: 110 });
        H.light({ x: ch.crib.x + ch.ox * 3, y: ch.crib.y + ch.oy * 3, h: 7, color: '#ffd890', intensity: 1.0 * night, r: 40 });
      }
    }
    if (site.pools) site.pools.visible = night > 0.12;
  }
  // paper star lanterns on houses near the player (Abids, Secunderabad, Marredpally, ...): one merged mesh per area
  const XS = { cx: 1e9, cy: 1e9, site: null };
  function updateHouseStars(night) {
    const p = N.player, L = S().layout;
    if (XS.site && Math.hypot(p.x - XS.cx, p.y - XS.cy) < 160) return;
    if (XS.site) { disposeSite('xmas:houses'); XS.site = null; }
    XS.cx = p.x; XS.cy = p.y;
    const b = new GB(), fx = new FX(), R2 = 480, tmp = {};
    let n = 0;
    N.world.queryStructures(p.x - R2, p.y - R2, p.x + R2, p.y + R2, (s) => {
      if (n >= 110 || !L.xmasHouse(s)) return;
      L.xmasStarAt(s, tmp);
      const ang = tmp.f === 'W' ? PI : tmp.f === 'E' ? 0 : tmp.f === 'N' ? -PI / 2 : PI / 2;
      const fxv = Math.cos(ang), fzv = Math.sin(ang);
      const h = Math.min(s.h * 1.5 - 4, 19), x = tmp.x + fxv * 0.8, z = tmp.y + fzv * 0.8;
      b.col('#3a3a3a', 0).rod(x, h + 2.9, z, x, h + 4.4, z, 0.04);
      b.col(tmp.col, 1.5).star(x, h, z, 2.2, 0.75, ang);
      b.col(U.shade(tmp.col, 0.9), 1.1);
      for (const o of [-0.7, 0, 0.7]) { const tx = -fzv, tz = fxv; b.quad([x + tx * (o - 0.12), h - 2.0, z + tz * (o - 0.12)], [x + tx * (o + 0.12), h - 2.0, z + tz * (o + 0.12)], [x + tx * (o + 0.1), h - 4.6, z + tz * (o + 0.1)], [x + tx * (o - 0.1), h - 4.6, z + tz * (o - 0.1)]); }
      fx.glow(x + fxv * 0.6, h, z + fzv * 0.6, tmp.col, 7);
      n++;
    });
    const site = { key: 'xmas:houses', update: null };
    finishSite(site, [b], fx, 0, 0);
    SITES.set('xmas:houses', site); XS.site = site;
    void night;
  }

  /* ================================================================ BONALU */
  function* buildBonaluSite(site, pr) {
    const fx = new FX(), b = new GB(), bulbs = new GB(), parts = [];
    const NEEM = ['#3f8a2a', '#5aa83a', '#2f7a22'], MARI = ['#ff9a1a', '#f2c230', '#ff7a10'];
    const FLAG = ['#e8202a', '#f2c230', '#30a040', '#e85aa8', '#ff8a1a', '#2a5cd8'];
    for (const f of pr.festoons) {
      const nx = -Math.sin(f.a), nz = Math.cos(f.a), w = 19;
      const ax = f.x - nx * w, az = f.y - nz * w, bx = f.x + nx * w, bz = f.y + nz * w, hh = 17;
      for (const [x, z] of [[ax, az], [bx, bz]]) { b.col('#a8844a', 0).cyl(x, 0, z, 0.32, 0.26, hh + 1, 5); b.col('#f2c230', 0.2).cyl(x, 0, z, 0.36, 0.36, 2.2, 6); b.col('#c8202a', 0.2).cyl(x, 2.2, z, 0.36, 0.36, 0.5, 6); }
      // the neem-leaf toran with marigold balls, and a paper bunting a little lower
      for (let i = 0; i <= 22; i++) {
        const t = i / 22, x = ax + (bx - ax) * t, z = az + (bz - az) * t, h = hh - Math.sin(t * PI) * 2.6;
        if (i) fx.wires.push(ax + (bx - ax) * (t - 1 / 22), hh - Math.sin((t - 1 / 22) * PI) * 2.6, az + (bz - az) * (t - 1 / 22), x, h, z);
        b.col(NEEM[i % 3], 0.15).quad([x - nx * 0.6, h, z - nz * 0.6], [x + nx * 0.6, h, z + nz * 0.6], [x + nx * 0.2 + Math.cos(f.a) * 0.2, h - 1.9, z + nz * 0.2 + Math.sin(f.a) * 0.2], [x - nx * 0.2, h - 1.9, z - nz * 0.2]);
        if (i % 2 === 0) b.col(MARI[i % 3], 0.3).bead(x, h - 0.4, z, 0.45);
        if (i % 3 === 0) { bulbs.col('#ffd040', 2.2).bead(x, h + 0.2, z, 0.24); fx.glow(x, h + 0.2, z, '#ffc040', 2.6); }
        const hb = hh - 4 - Math.sin(t * PI) * 2.0;
        if (i < 22) b.col(FLAG[i % FLAG.length], 0.25).tri([x, hb, z], [x + (bx - ax) / 22, hb, z + (bz - az) / 22], [x + (bx - ax) / 44, hb - 1.5, z + (bz - az) / 44]);
      }
    }
    yield;
    // the temple gate: a decorated arch (turmeric pillars with kumkum bands, neem and marigold garlands)
    const g = pr.path[pr.path.length - 1], g2 = pr.path[Math.max(0, pr.path.length - 2)];
    const a = Math.atan2(g[1] - g2[1], g[0] - g2[0]), nx = -Math.sin(a), nz = Math.cos(a), w = 9, gx = g[0] - Math.cos(a) * 6, gz = g[1] - Math.sin(a) * 6;
    for (const s of [-1, 1]) {
      const x = gx + nx * s * w, z = gz + nz * s * w;
      b.col('#f2c230', 0.25).box(x - 0.7, 0, z - 0.7, x + 0.7, 15, z + 0.7);
      for (const y of [3, 7, 11]) b.col('#c8202a', 0.3).box(x - 0.75, y, z - 0.75, x + 0.75, y + 0.6, z + 0.75);
      b.col('#3f8a2a', 0.15).blob(x, 15.6, z, 1.1, 0.9, 1.1, 6);
    }
    b.col('#e8402a', 0.3).box(...[gx - Math.abs(nx) * w - 0.7 - Math.abs(Math.cos(a)) * 0.5, 15, gz - Math.abs(nz) * w - 0.7 - Math.abs(Math.sin(a)) * 0.5, gx + Math.abs(nx) * w + 0.7 + Math.abs(Math.cos(a)) * 0.5, 16.4, gz + Math.abs(nz) * w + 0.7 + Math.abs(Math.sin(a)) * 0.5]);
    for (let i = 0; i <= 18; i++) { // hanging marigold strings and neem bunches under the beam
      const t = i / 18, x = gx + nx * (t - 0.5) * 2 * w, z = gz + nz * (t - 0.5) * 2 * w, L2 = 1.5 + (i % 3) * 0.9;
      for (let k = 0; k < 4; k++) b.col(MARI[(i + k) % 3], 0.3).bead(x, 14.6 - k * L2 / 3, z, 0.36);
      if (i % 2) b.col(NEEM[i % 3], 0.2).blob(x, 14.2, z, 0.55, 0.8, 0.55, 5);
      bulbs.col(i % 2 ? '#ffd040' : '#ff6040', 2.2).bead(x, 16.7, z, 0.26); if (i % 2 === 0) fx.glow(x, 16.7, z, '#ffc040', 3);
    }
    // offered bonam pots in a row beside the gate (brass, turmeric, kumkum, neem, a lamp on each)
    for (let k = 0; k < 7; k++) {
      const u = w + 3 + k * 2.2, x = gx + nx * u + Math.cos(a) * 2, z = gz + nz * u + Math.sin(a) * 2;
      b.col('#c89a2a', 0.2).blob(x, 1.2, z, 0.95, 1.0, 0.95, 7).col('#f2c230', 0.25).cyl(x, 2.0, z, 0.55, 0.7, 0.7, 7, true);
      b.col('#c8202a', 0.3).cyl(x, 0.9, z, 0.98, 0.98, 0.25, 8);
      for (let j = 0; j < 4; j++) { const aa = j * TAU / 4 + k; b.col(NEEM[j % 3], 0.15).quad([x, 2.8, z], [x + Math.cos(aa) * 0.3, 2.8, z + Math.sin(aa) * 0.3], [x + Math.cos(aa) * 1.2, 3.8, z + Math.sin(aa) * 1.2], [x + Math.cos(aa + 0.4) * 0.9, 4.0, z + Math.sin(aa + 0.4) * 0.9]); }
      b.col('#ffe080', 2.4).bead(x, 3.1, z, 0.22); fx.glow(x, 3.2, z, '#ffb040', 3.2);
    }
    parts.push(b, bulbs);
    yield;
    finishSite(site, parts, fx, 0, 0);
    site.pr = pr;
    yield;
    // the thottelu: a tall paper-and-bamboo tower carried on a platform at the head of the procession
    const tb = new GB(), tfx = new FX();
    tb.col('#a8844a', 0).box(-3.4, 5.6, -3.4, 3.4, 6.2, 3.4);
    for (const [u, v] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) tb.col('#a8844a', 0).cyl(u, 0, v, 0.2, 0.2, 6.2, 4);
    const TIERS = [['#e8202a', '#f2c230', 3.2, 6.2, 6], ['#30a040', '#f2c230', 2.6, 12.2, 6], ['#c03a8a', '#ffe040', 2.0, 18.2, 5.5], ['#2a5cd8', '#ff8a1a', 1.4, 23.7, 4.5]];
    for (const [c1, c2, r, y, h] of TIERS) {
      tb.col(c1, 0.25).cyl(0, y, 0, r, r * 0.85, h, 8, true);
      for (let k = 0; k < 16; k++) { const aa = (k / 16) * TAU; tb.col(k % 2 ? c2 : '#ffffff', 0.35).tri([Math.cos(aa) * (r + 0.05), y + h, Math.sin(aa) * (r + 0.05)], [Math.cos(aa + TAU / 16) * (r + 0.05), y + h, Math.sin(aa + TAU / 16) * (r + 0.05)], [Math.cos(aa + TAU / 32) * (r + 0.1), y + h - 1.2, Math.sin(aa + TAU / 32) * (r + 0.1)]); }
    }
    tb.col('#f2c230', 0.6).cyl(0, 28.2, 0, 1.2, 0.1, 2.6, 8).col('#e8402a', 0.3).quad([0, 32.6, 0], [2.4, 32.0, 0], [2.4, 30.9, 0], [0, 31.3, 0]).col('#6a4a2a', 0).cyl(0, 30.6, 0, 0.06, 0.06, 2.2, 4);
    for (let k = 0; k < 12; k++) { const aa = (k / 12) * TAU; tb.col('#ffe060', 2.2).bead(Math.cos(aa) * 3.3, 12.2, Math.sin(aa) * 3.3, 0.24); tfx.glow(Math.cos(aa) * 3.3, 12.2, Math.sin(aa) * 3.3, '#ffd040', 2.6); }
    const tg = new THREE.Group(); tg.name = 'fest3d:thottelu';
    const tm = tb.mesh(); tm.castShadow = !!(H.quality && H.quality.shadows); tg.add(tm);
    const tp = new THREE.Points(glowGeo(tfx), M.glow); tp.renderOrder = 9; tg.add(tp);
    tg.visible = !!pr.thottelu; site.grp.add(tg); site.thot = tg;
    // little lamps on the women's bonam pots (dynamic points)
    const cap = 48, lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const lc = new Float32Array(cap * 3), ls = new Float32Array(cap); const c = H.color('#ffb040'); for (let i = 0; i < cap; i++) { lc[i * 3] = c.r; lc[i * 3 + 1] = c.g; lc[i * 3 + 2] = c.b; ls[i] = 3.4; }
    lg.setAttribute('gCol', new THREE.BufferAttribute(lc, 3)); lg.setAttribute('gSize', new THREE.BufferAttribute(ls, 1)); lg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const lp = new THREE.Points(lg, M.glow); lp.renderOrder = 9; lp.frustumCulled = false; ROOT.add(lp); site.lamps = { pts: lp, cap };
    site.dispose = () => { ROOT.remove(lp); lg.dispose(); };
    site.update = updateBonalu;
    return true;
  }
  const _ap = { x: 0, y: 0, a: 0 };
  function updateBonalu(site, dt, night) {
    const pr = site.pr, L = S().layout;
    if (site.thot.visible && pr.members.length) {
      L.along(pr.path, (pr.members[pr.members.length - 1].d + 12) % (pr.L - 6), _ap);
      site.thot.position.set(_ap.x, 0, _ap.y); site.thot.rotation.y = -_ap.a + Math.sin(H.time * 0.8) * 0.05;
      site.thot.position.y = Math.abs(Math.sin(H.time * 2.4)) * 0.25;
    }
    const pos = site.lamps.pts.geometry.attributes.position, arr = pos.array; let n = 0;
    for (const m of pr.members) {
      if (m.kind !== 'bonam' || m.d < 0 || n >= site.lamps.cap) continue;
      L.along(pr.path, m.d, _ap);
      const x = _ap.x - Math.sin(_ap.a) * m.side, y = _ap.y + Math.cos(_ap.a) * m.side;
      arr[n * 3] = x; arr[n * 3 + 1] = 13.2; arr[n * 3 + 2] = y; n++;
    }
    pos.needsUpdate = true; site.lamps.pts.geometry.setDrawRange(0, n);
    void dt; void night;
  }

  /* ================================================================ RAMZAN (crescent cut-outs) */
  function* buildRamzan(site, list) {
    const b = new GB(), fx = new FX();
    for (const c of list) {
      // a pole on the kerb with a lit crescent-and-star cut-out, seen by people walking along Pathergatti
      const h = 26, R0 = 2.6;
      b.col('#5a5a62', 0).cyl(c.x, 0, c.y, 0.3, 0.24, h - 1.5, 5);
      for (let k = 0; k < 16; k++) { // the crescent (a ring band thinning at the horns), facing north and south
        const a0 = -PI * 0.78 + (k / 16) * PI * 1.56, a1 = -PI * 0.78 + ((k + 1) / 16) * PI * 1.56;
        const o = (a, r, cx) => [c.x + Math.cos(a + PI) * r + cx, h + Math.sin(a + PI) * r, c.y];
        const w0 = 0.45 + 0.55 * Math.sin((k / 16) * PI), w1 = 0.45 + 0.55 * Math.sin(((k + 1) / 16) * PI);
        b.col('#9affb8', 2.2).quad(o(a0, R0, 0), o(a1, R0, 0), o(a1, R0 - w1, 0.25), o(a0, R0 - w0, 0.25));
      }
      b.col('#ffffff', 2.4).star(c.x + 1.2, h + 0.2, c.y, 0.75, 0.25, PI / 2);
      b.col('#5a5a62', 0).rod(c.x, h - 1.6, c.y, c.x, h - R0 - 0.2, c.y, 0.08);
      fx.glow(c.x, h, c.y, '#80ffa0', 10, 0.8).glow(c.x + 1.2, h + 0.2, c.y, '#ffffff', 4, 0.8);
    }
    finishSite(site, [b], fx, 0, 0);
    site.update = null;
    return true;
  }

  /* ================================================================ the layer */
  function want(dt) {
    const p = N.player, s = S(), out = [];
    if (!p || !s || !s.layout) return out;
    const L = s.layout;
    if (on('numaish')) { const nl = L.numaish(); if (nl) { const cx = (nl.g[0] + nl.g[2]) / 2, cy = (nl.g[1] + nl.g[3]) / 2; if (Math.hypot(cx - p.x, cy - p.y) < 760) out.push(['numaish', () => buildNumaish]); } }
    if (on('christmas')) {
      const xl = L.christmas();
      if (xl) for (const ch of xl.churches) if (Math.hypot(ch.gate.x - p.x, ch.gate.y - p.y) < 620) out.push(['xmas:' + ch.id, () => (site) => buildChurch(site, ch)]);
    }
    if (on('bonalu')) {
      const procs = L.bonalu();
      if (procs) for (const pr of procs) { const g = pr.path[pr.path.length - 1]; if (Math.hypot(g[0] - p.x, g[1] - p.y) < 600) out.push(['bonalu:' + pr.id, () => (site) => buildBonaluSite(site, pr)]); }
    }
    if ((on('ramzan') || on('chand_raat')) && s._debug && s._debug.ram && s._debug.ram.crescents) {
      const list = s._debug.ram.crescents;
      if (list.length && Math.hypot(list[0].x - p.x, list[0].y - p.y) < 700) out.push(['ramzan', () => (site) => buildRamzan(site, list)]);
    }
    void dt;
    return out;
  }
  let checkT = 0;
  const LAYER = {
    order: 6,
    init(T, h) { THREE = T; H = h; ROOT = new THREE.Group(); ROOT.name = 'festivals3d'; H.layer.add(ROOT); initMaterials(); },
    update(dt, h) {
      H = h || H;
      if (!ROOT) return;
      const night = H.night || 0;
      UNI.uFestN.value = 0.1 + night * 1.0;
      UNI.uGlowI.value = night < 0.12 ? 0 : Math.min(1, night * 1.2);
      if (H.renderer) UNI.uScale.value = 190 * Math.max(0.5, H.renderer.domElement.height / 540);
      M.sign.color.setScalar(0.78 + night * 0.4);
      M.pool.color.setScalar(night);
      checkT -= dt;
      if (checkT <= 0) {
        checkT = 0.5;
        const w = want(dt), keys = new Set(w.map((q) => q[0]));
        for (const k of Array.from(SITES.keys())) if (k !== 'xmas:houses' && !keys.has(k)) { const s = SITES.get(k); if (s && s.dispose) s.dispose(); disposeSite(k); }
        for (const [k, mk] of w) {
          if (SITES.has(k)) continue;
          const site = { key: k, grp: null, gen: null, t0: now() };
          try { site.gen = mk()(site); } catch (e) { N.err('festivals3d.build:' + k, e); site.dead = true; }
          SITES.set(k, site);
        }
      }
      // sites being built: a few ms of generator steps per frame (no hitch when a festival comes into range)
      const tb = now();
      for (const site of SITES.values()) {
        if (!site.gen) continue;
        try {
          while (now() - tb < 4) {
            const r = site.gen.next();
            if (r.done) { site.gen = null; if (r.value === false || !site.grp) site.dead = true; else { site.grp.visible = true; ST.built++; ST.buildMs = +(now() - site.t0).toFixed(1); ST.tris = 0; site.grp.traverse((o) => { if (o.isMesh && o.geometry.attributes.position) ST.tris += o.geometry.attributes.position.count / 3; }); } break; }
          }
        } catch (e) { N.err('festivals3d.build:' + site.key, e); site.gen = null; site.dead = true; }
        if (now() - tb >= 4) break;
      }
      // house stars while it is Christmas
      if (on('christmas')) { try { updateHouseStars(night); } catch (e) { N.err('festivals3d.stars', e); } }
      else if (XS.site) { disposeSite('xmas:houses'); XS.site = null; }
      ST.sites = SITES.size; ST.hidden = 0;
      for (const s of SITES.values()) {
        if (!s.grp || s.gen) continue;
        if (s.glows) s.glows.visible = night > 0.12;
        if (s.update) { try { s.update(s, dt, night); } catch (e) { N.err('festivals3d.update:' + s.key, e); s.update = null; } }
        occlusion(s);
      }
    },
    dispose() { for (const k of Array.from(SITES.keys())) { const s = SITES.get(k); if (s && s.dispose) s.dispose(); disposeSite(k); } XS.site = null; if (ROOT && ROOT.parent) ROOT.parent.remove(ROOT); ROOT = null; },
  };
  V3.registerLayer('festivals3d', LAYER);
  N.on('world:built', () => { for (const k of Array.from(SITES.keys())) { const s = SITES.get(k); if (s && s.dispose) s.dispose(); disposeSite(k); } XS.site = null; });
  N.festivals3d = {
    sites: () => Array.from(SITES.keys()),
    stats: () => Object.assign({}, ST, { sites: SITES.size }),
    rebuild() { for (const k of Array.from(SITES.keys())) { const s = SITES.get(k); if (s && s.dispose) s.dispose(); disposeSite(k); } XS.site = null; checkT = 0; },
  };
})();
