/* NOSTALGIA — view3d_landmarks.js (3D landmark modeller) — ARCHITECTURE §20
 *
 * Low-poly 3D models for every N.WORLD_DATA.landmarks draw id (426 landmarks, ~95 draw ids),
 * registered through N.view3d.registerLandmark; nothing in another module is edited or patched.
 * Proportions and colours follow the 2D art in landmarks.js / places_art.js so the city reads the
 * same in both views. Test: node tests/view3d_landmarks.cjs (screenshots: tests/out/view3d_landmarks/).
 *
 * How it is built
 *  - Kit material (one shared Lambert program, vertex colours): the core GeoBuilder's 4-byte
 *    `facade` attribute is reused per vertex as [emission colour index, night emission 0-255,
 *    floodlight 0-255, -]: index 0 = the vertex colour itself, 1 warm bulb, 2 cool tube light,
 *    3 sodium, 4 festive green. One mesh per landmark carries walls, floodlit stone (warm, strongest
 *    near the ground) and glowing shop interiors / windows / bulbs. Double-sided pieces (awnings,
 *    tarps, railings) are emitted twice with opposite winding into the same mesh (no extra call).
 *  - Big civic facades use the core facade atlas (H.materials.facade / facadeLit: window styles,
 *    lit windows at night) through civic(md, lm, D, opts) - porch / domes / chhatris / tower /
 *    crest / compound options; signboards use the core sign atlas (H.signSlot) with the 2D sign text.
 *  - Frames: every model is written in a local frame (u = right as seen from the front, y = up,
 *    v = towards the front; front face at v = +D/2) rotated by the landmark's `face` / `faceAngle`.
 *    Arch walls are THREE.Shape outlines with pointed-arch openings (two-centred arches) extruded
 *    with ExtrudeGeometry and merged; domes, minarets, petals, shikharas are lathes. Extruded walls
 *    and lathes are cached by shape (Charminar's four faces share one).
 *  - Small things (shops, Irani cafes, carts, booths, bus stops, Tank Bund statues...) are batched:
 *    every member of one class in a 384 u cell becomes one mesh (+ one per sign page) built by
 *    whichever member the core asks for first (the others return false; the owner's dispose frees
 *    the cell). Each batch, and the mid-size worship / school models, is a THREE.LOD that hides it
 *    beyond ~430-1400 u (shorter on the low tier).
 *  - Camera: detailed meshes are not ray-cast (raycast = no-op: three.js has no BVH and the core
 *    casts the camera ray every frame); invisible proxy boxes (material.visible = false) stand in
 *    where the camera can pass under (Charminar's arches, the Char Kaman, gates, canopies, the
 *    hangar vault). Solid footprints are already in the core's height grid.
 *  - Night: a layer ('landmarks3d') fades the glow points (bulb strings, lamps, floodlight banks;
 *    hidden entirely by day = no draw calls), the clock dials (one shared dynamic texture showing
 *    the in-game time on Charminar, the clock towers, Mozamjahi, Chowmahalla), the painted film
 *    hoardings (ported from places_art's board painter, fictional titles). Landmarks with lights
 *    push H.light() near the player (floodlit Charminar plaza, stadium towers on match day...).
 *  - Variants are built side by side and toggled per frame: Charminar bulbs white / festive green
 *    (N.landmarks.fx.festive or flags chand_raat / eid / ramzan / finale), LB Stadium match day
 *    (N.flags.lb_match: crowds on the stands, floodlight banks, the U-12 FINAL banner), Prasads
 *    fence / open (N.placesArt.variant('prasads_imax') or N.flags.prasads_open), NTR Gardens
 *    (construction hides the Machan tree + train; the mini train runs round its loop), Khairatabad
 *    Ganesh idol (ganesh season), the Numaish giant wheel turning.
 *  - Decor layer: street-market stalls (Laad Bazaar bangles, Patang Bazaar kites, Sultan Bazaar
 *    cloth, Abids books...) and colony playgrounds that places_art draws from places in 2D are
 *    replayed with the same seeded placement and built within ~650 u of the focus.
 * Respect: places of worship are modelled plainly and with care; nothing is destructible.
 * Reads (never writes): N.world (data, roads, surfaces), N.flags, N.clock, N.places,
 * N.placesArt.variant(), N.landmarks.fx.
 * Debug / tests: N.view3dLandmarks = {DEFS, cells(), measure(id) -> {ms, tris, meshes, points}}.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.view3d) return;
  const U = N.util, V3 = N.view3d, TAU = Math.PI * 2, PI = Math.PI;
  const VS = V3.VS || 1.5;
  let THREE = null, H = null;
  const M = {};           // materials (shared, created once three.js is loaded)
  const TX = {};          // textures
  const TMP = {};
  const FR = { s: 0, n: PI, e: PI / 2, w: -PI / 2 };
  const NOOP = () => {};
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sh = (c, f) => U.shade(c, f);
  const pick = (r, a) => a[(r.next() * a.length) | 0];

  /* ================================================================ palette */
  const LIME = '#efd9a8', LIME_HI = '#f7e8c4', LIME_RF = '#f0dfb8', LIME_SH = '#e6cc98';
  const GRANITE = '#9c9289', GRANITE_DK = '#8f8a86', GRANITE_LT = '#b3ada4';
  const SAND = '#b98f5e', SAND_DK = '#9a7650';
  const MARBLE = '#f3f0e9', MARBLE_SH = '#e2ddd2';
  const GOLD = '#d1a83a', DARK = '#3d2f28', IRON = '#2c2c30', WOOD = '#7a5a3a';
  const TEAL = '#2a8c82';

  /* ================================================================ materials */
  function kitCompile(shader) {
    shader.uniforms.uNight = H.uniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 facade;\nvarying vec4 vKit;\nvarying float vKitY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvKit = facade;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvKitY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying vec4 vKit;\nvarying float vKitY;')
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        '{',
        '  float kE = vKit.y * 0.0039216; float kF = vKit.z * 0.0039216; float ci = vKit.x;',
        '  vec3 ec = ci < 0.5 ? vColor : ci < 1.5 ? vec3(1.0, 0.70, 0.40) : ci < 2.5 ? vec3(0.80, 0.92, 1.0) : ci < 3.5 ? vec3(1.0, 0.55, 0.22) : vec3(0.50, 1.0, 0.62);',
        '  totalEmissiveRadiance += ec * kE * uNight * 2.0;',
        '  float fh = 1.0 - smoothstep(0.0, 170.0, vKitY) * 0.5;',
        '  totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.80, 0.56) * kF * uNight * fh * 0.95;',
        '}',
      ].join('\n'));
  }
  function init(T, h) {
    if (M.kit) return;
    THREE = T; H = h || V3.H;
    TMP.m = new THREE.Matrix4(); TMP.m2 = new THREE.Matrix4(); TMP.m3 = new THREE.Matrix4(); TMP.id = new THREE.Matrix4();
    TMP.d = new THREE.Vector3(); TMP.up = new THREE.Vector3(0, 1, 0); TMP.q = new THREE.Quaternion(); TMP.p = new THREE.Vector3(); TMP.sc = new THREE.Vector3(); TMP.sv = new THREE.Vector3();
    const kit = (side, key) => {
      const m = new THREE.MeshLambertMaterial({ vertexColors: true, side });
      m.onBeforeCompile = kitCompile; m.customProgramCacheKey = () => key;
      m.userData.shared = true; return m;
    };
    M.kit = kit(THREE.FrontSide, 'lm3d-kit');
    M.kit2 = kit(THREE.DoubleSide, 'lm3d-kit2');
    M.water = new THREE.MeshPhongMaterial({ color: '#3a8a93', specular: '#bfe2ea', shininess: 70, transparent: true, opacity: 0.9 });
    const gmap = H.materials.glow && H.materials.glow.map;
    const pts = (size) => new THREE.PointsMaterial({ size, map: gmap, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0 });
    M.gS = pts(3.6); M.gM = pts(11); M.gL = pts(34);
    TX.clock = new THREE.CanvasTexture(makeCanvas(256, 256));
    TX.clock.encoding = THREE.sRGBEncoding;
    paintClock(TX.clock.image, 600);
    M.clock = new THREE.MeshLambertMaterial({ map: TX.clock, emissive: '#fff2cc', emissiveMap: TX.clock, emissiveIntensity: 0.1, alphaTest: 0.5 });
    M.filmMats = new Map();
    M.proxy = new THREE.MeshBasicMaterial({ visible: false });
    for (const k of ['water', 'gS', 'gM', 'gL', 'clock', 'proxy']) M[k].userData.shared = true;
    TX.clock.userData.shared = true;
  }
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function filmMat(title) {
    let m = M.filmMats.get(title);
    if (m) return m;
    const t = H.tex('lm3d-film:' + title, 384, 256, (g, w, hh) => paintFilmBoard(g, w, hh, title));
    m = new THREE.MeshLambertMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0, side: THREE.DoubleSide });
    m.userData.shared = true;
    M.filmMats.set(title, m);
    return m;
  }

  /* ---------------------------------------------------------------- clock dial (in-game time) */
  let clockMin = -1;
  function paintClock(c, minutes) {
    const g = c.getContext('2d'), S = c.width, r = S / 2;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#3a3026'; g.beginPath(); g.arc(r, r, r - 2, 0, TAU); g.fill();
    g.fillStyle = '#f6efdc'; g.beginPath(); g.arc(r, r, r - 14, 0, TAU); g.fill();
    g.strokeStyle = '#2a2018'; g.lineWidth = 3; g.beginPath(); g.arc(r, r, r - 30, 0, TAU); g.stroke();
    g.fillStyle = '#2a2018'; g.font = '700 26px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const RN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU - PI / 2;
      g.save(); g.translate(r + Math.cos(a) * (r - 52), r + Math.sin(a) * (r - 52)); g.rotate(a + PI / 2);
      g.fillText(RN[i], 0, 0); g.restore();
    }
    const hr = ((minutes / 60) % 12) / 12 * TAU - PI / 2, mn = ((minutes % 60) / 60) * TAU - PI / 2;
    g.lineCap = 'round';
    g.lineWidth = 9; g.beginPath(); g.moveTo(r, r); g.lineTo(r + Math.cos(hr) * r * 0.42, r + Math.sin(hr) * r * 0.42); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.moveTo(r, r); g.lineTo(r + Math.cos(mn) * r * 0.66, r + Math.sin(mn) * r * 0.66); g.stroke();
    g.fillStyle = '#b8902a'; g.beginPath(); g.arc(r, r, 8, 0, TAU); g.fill();
  }

  /* ---------------------------------------------------------------- painted film boards (ported from places_art) */
  const SKINS = ['#c8885a', '#b8784a', '#d89a6a', '#a86a40'];
  const BG_PAL = [['#f08a24', '#c8202a'], ['#2a5cd8', '#7a2ac8'], ['#e8c020', '#e84a20'], ['#1ab0a0', '#2a4ab8'], ['#e84a8a', '#7a1a5a'], ['#40c050', '#1a6a8a']];
  function paintFace(g, cx, cy, r, o) {
    const skin = o.skin;
    g.fillStyle = o.shirt; g.beginPath(); g.ellipse(cx, cy + r * 1.55, r * 1.35, r * 0.75, 0, PI, 0); g.fill();
    if (o.female) { g.fillStyle = '#141014'; g.beginPath(); g.ellipse(cx, cy + r * 0.3, r * 1.02, r * 1.35, 0, 0, TAU); g.fill(); }
    g.fillStyle = skin; g.beginPath(); g.ellipse(cx, cy + r * 0.92, r * 0.32, r * 0.3, 0, 0, TAU); g.fill();
    const gr = g.createRadialGradient(cx - r * 0.3, cy - r * 0.2, r * 0.1, cx, cy, r * 1.05);
    gr.addColorStop(0, sh(skin, 1.18)); gr.addColorStop(0.7, skin); gr.addColorStop(1, sh(skin, 0.72));
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, r * 0.76, r * 0.95, 0, 0, TAU); g.fill();
    g.fillStyle = '#141014';
    if (o.female) { g.beginPath(); g.ellipse(cx, cy - r * 0.62, r * 0.8, r * 0.45, 0, PI, 0); g.fill(); }
    else {
      g.beginPath(); g.ellipse(cx + r * 0.05, cy - r * 0.7, r * 0.85, r * 0.48, -0.08, PI * 0.95, PI * 2.08); g.fill();
      g.fillRect(cx - r * 0.78, cy - r * 0.62, r * 0.16, r * 0.62); g.fillRect(cx + r * 0.62, cy - r * 0.62, r * 0.16, r * 0.62);
    }
    g.strokeStyle = '#141014'; g.lineWidth = r * (o.female ? 0.06 : 0.11); g.lineCap = 'round';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * r * 0.12, cy - r * 0.3); g.quadraticCurveTo(cx + s * r * 0.34, cy - r * (o.angry ? 0.3 : 0.42), cx + s * r * 0.56, cy - r * 0.32); g.stroke(); }
    if (o.glasses) {
      g.fillStyle = '#121216';
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * r * 0.33, cy - r * 0.1, r * 0.25, r * 0.17, 0, 0, TAU); g.fill(); }
      g.fillRect(cx - r * 0.1, cy - r * 0.14, r * 0.2, r * 0.05);
    } else {
      for (const s of [-1, 1]) {
        g.fillStyle = '#f8f4ea'; g.beginPath(); g.ellipse(cx + s * r * 0.33, cy - r * 0.1, r * 0.17, r * 0.09, 0, 0, TAU); g.fill();
        g.fillStyle = '#2a1a12'; g.beginPath(); g.arc(cx + s * r * 0.31, cy - r * 0.1, r * 0.07, 0, TAU); g.fill();
      }
    }
    g.strokeStyle = sh(skin, 0.7); g.lineWidth = r * 0.05; g.beginPath(); g.moveTo(cx + r * 0.04, cy - r * 0.05); g.lineTo(cx + r * 0.08, cy + r * 0.2); g.lineTo(cx - r * 0.06, cy + r * 0.24); g.stroke();
    g.fillStyle = o.female ? '#c8243a' : '#7a3a2a';
    g.beginPath(); g.ellipse(cx, cy + r * 0.48, r * (o.smile ? 0.26 : 0.2), r * 0.07, 0, 0, TAU); g.fill();
    if (o.moustache) { g.fillStyle = '#141014'; g.beginPath(); g.ellipse(cx, cy + r * 0.34, r * 0.3, r * 0.08, 0, 0, TAU); g.fill(); }
    if (o.female) {
      g.fillStyle = '#d8102a'; g.beginPath(); g.arc(cx, cy - r * 0.42, r * 0.06, 0, TAU); g.fill();
      g.fillStyle = '#f2c230'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * r * 0.78, cy + r * 0.2, r * 0.08, 0, TAU); g.fill(); }
    }
    g.strokeStyle = 'rgba(255,240,200,0.45)'; g.lineWidth = r * 0.05; g.beginPath(); g.ellipse(cx, cy, r * 0.76, r * 0.95, 0, -2.6, -1.2); g.stroke();
  }
  function paintFilmBoard(g, W, Hh, title) {
    const rng = U.rng('film:' + title);
    const pal = BG_PAL[(rng.next() * BG_PAL.length) | 0];
    const bg = g.createLinearGradient(0, 0, W, Hh);
    bg.addColorStop(0, pal[0]); bg.addColorStop(1, pal[1]);
    g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
    g.save(); g.globalAlpha = 0.18; g.fillStyle = '#fff8d0';
    const ox = W * 0.3, oy = Hh * 0.45;
    for (let i = 0; i < 16; i += 2) { const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(a0) * W * 2, oy + Math.sin(a0) * W * 2); g.lineTo(ox + Math.cos(a1) * W * 2, oy + Math.sin(a1) * W * 2); g.fill(); }
    g.restore();
    const band = Hh * 0.24;
    const hero = { skin: SKINS[(rng.next() * 4) | 0], shirt: pick(rng, ['#d8202a', '#1a1a2a', '#f8f4ea', '#2a5cd8', '#f2c230']), moustache: rng.next() < 0.75, glasses: rng.next() < 0.35, angry: rng.next() < 0.4, smile: rng.next() < 0.4 };
    const her = { skin: SKINS[(rng.next() * 4) | 0], shirt: pick(rng, ['#e84a8a', '#f2c230', '#2ac0a0', '#c8202a']), female: true, smile: true };
    const r = (Hh - band) * 0.42;
    paintFace(g, W * 0.27, (Hh - band) * 0.48, r, hero);
    paintFace(g, W * 0.68, (Hh - band) * 0.55, r * 0.72, her);
    g.fillStyle = 'rgba(255,240,120,0.85)';
    g.beginPath(); g.moveTo(0, Hh - band - Hh * 0.04); g.quadraticCurveTo(W * 0.5, Hh - band - Hh * 0.12, W, Hh - band - Hh * 0.03); g.lineTo(W, Hh - band); g.lineTo(0, Hh - band); g.fill();
    g.fillStyle = '#1a1018'; g.fillRect(0, Hh - band, W, band);
    let fs = Math.round(band * 0.62);
    g.font = '800 ' + fs + "px 'Yatra One', 'Baloo 2', Impact, sans-serif";
    const tw = g.measureText(title).width;
    if (tw > W * 0.92) { fs = Math.floor(fs * W * 0.92 / tw); g.font = '800 ' + fs + "px 'Yatra One', 'Baloo 2', Impact, sans-serif"; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#7a1a1a'; g.fillText(title, W / 2 + 2, Hh - band / 2 + 2);
    g.fillStyle = '#ffe23a'; g.fillText(title, W / 2, Hh - band / 2);
    g.strokeStyle = '#f2c230'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, Hh - 4);
  }

  /* ================================================================ geometry kit */
  // A frame maps local (u, y, v) to the model's coordinates: X = ox + u*c + v*s, Z = oz - u*s + v*c
  // (rotation about +y by rot; rot 0 = the front (+v) faces south, PI/2 = east, PI = north).
  class Frame {
    constructor() { this.m = new THREE.Matrix4(); this.set(0, 0, 0); }
    set(ox, oz, rot) { this.ox = ox; this.oz = oz; this.rot = rot || 0; this.c = Math.cos(this.rot); this.s = Math.sin(this.rot); this.m.makeRotationY(this.rot).setPosition(ox, 0, oz); return this; }
    X(u, v) { return this.ox + u * this.c + v * this.s; }
    Z(u, v) { return this.oz - u * this.s + v * this.c; }
  }
  // Kit builder: a core GeoBuilder (facade attributes) driven in local frame coordinates
  class KB {
    constructor(F, g, dbl) { this.F = F; this.g = g || H.builder({ facade: true }); this.dbl = !!dbl; }
    c(hex) { this.g.color(hex); return this; }
    /** per-vertex night look: ci = emission colour (0 vertex colour, 1 warm, 2 tube, 3 sodium, 4 green), em 0-255, fl = floodlight 0-255 */
    fx(ci, em, fl) { this.g.f = [ci | 0, em | 0, fl | 0, 0]; return this; }
    fac(up, gf, lit, seed, floors) { this.g.facade(up, gf, lit, seed, floors); return this; }
    q(u0, y0, v0, u1, y1, v1, u2, y2, v2, u3, y3, v3, uv) {
      const F = this.F;
      this.g.quad(F.X(u0, v0), y0, F.Z(u0, v0), F.X(u1, v1), y1, F.Z(u1, v1), F.X(u2, v2), y2, F.Z(u2, v2), F.X(u3, v3), y3, F.Z(u3, v3), uv);
      if (this.dbl) this.g.quad(F.X(u3, v3), y3, F.Z(u3, v3), F.X(u2, v2), y2, F.Z(u2, v2), F.X(u1, v1), y1, F.Z(u1, v1), F.X(u0, v0), y0, F.Z(u0, v0), uv);
      return this;
    }
    /** vertical wall A -> B (outward normal on the right of A->B seen from above) */
    wall(ua, va, ub, vb, y0, y1, u0, u1, w0, w1) {
      const F = this.F;
      this.g.wall(F.X(ua, va), F.Z(ua, va), F.X(ub, vb), F.Z(ub, vb), y0, y1, u0, u1, w0, w1);
      if (this.dbl) this.g.wall(F.X(ub, vb), F.Z(ub, vb), F.X(ua, va), F.Z(ua, va), y0, y1, u0, u1, w0, w1);
      return this;
    }
    /** front-facing rectangle at v (normal +v), slightly proud */
    front(u0, u1, y0, y1, v, uv) { return this.q(u0, y0, v, u1, y0, v, u1, y1, v, u0, y1, v, uv); }
    hq(u0, v0, u1, v1, y, down) {
      if (down) return this.q(u0, y, v0, u1, y, v0, u1, y, v1, u0, y, v1);
      return this.q(u0, y, v1, u1, y, v1, u1, y, v0, u0, y, v0);
    }
    box(u0, y0, v0, u1, y1, v1, o) {
      if (!o || o.sides !== false) {
        if (!o || o.back !== false) this.wall(u1, v0, u0, v0, y0, y1);
        if (!o || o.front !== false) this.wall(u0, v1, u1, v1, y0, y1);
        this.wall(u0, v0, u0, v1, y0, y1); this.wall(u1, v1, u1, v0, y0, y1);
      }
      if (!o || o.top !== false) this.hq(u0, v0, u1, v1, y1);
      if (o && o.bottom) this.hq(u0, v0, u1, v1, y0, true);
      return this;
    }
    /** box centred at (cu, cv), w x d, rotated by angle a (local), from y0 to y1 */
    obox(cu, cv, w, d, y0, y1, a, o) {
      const c = Math.cos(a || 0), s = Math.sin(a || 0), hw = w / 2, hd = d / 2;
      const P = (lu, lv) => [cu + lu * c - lv * s, cv + lu * s + lv * c];
      const p0 = P(-hw, -hd), p1 = P(hw, -hd), p2 = P(hw, hd), p3 = P(-hw, hd);
      this.wall(p1[0], p1[1], p0[0], p0[1], y0, y1); this.wall(p2[0], p2[1], p1[0], p1[1], y0, y1);
      this.wall(p3[0], p3[1], p2[0], p2[1], y0, y1); this.wall(p0[0], p0[1], p3[0], p3[1], y0, y1);
      if (!o || o.top !== false) this.q(p3[0], y1, p3[1], p2[0], y1, p2[1], p1[0], y1, p1[1], p0[0], y1, p0[1]);
      return this;
    }
    /** thin bar between two local points (u, y, v) with square section t */
    bar(u0, y0, v0, u1, y1, v1, t) {
      const du = u1 - u0, dy = y1 - y0, dv = v1 - v0, L = Math.hypot(du, dy, dv);
      if (L < 0.01) return this;
      TMP.d.set(du / L, dy / L, dv / L);
      TMP.q.setFromUnitVectors(TMP.up, TMP.d);
      TMP.p.set((u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2); TMP.sc.set(t, L, t);
      TMP.m2.compose(TMP.p, TMP.q, TMP.sc);
      return this.geo(unitBox(), TMP.m2);
    }
    prism(pts, y0, y1, o) { const F = this.F; this.g.extrude(pts.map((p) => [F.X(p[0], p[1]), F.Z(p[0], p[1])]), y0, y1, o); return this; }
    cyl(u, y0, v, r0, r1, h, seg, o) {
      if (this.dbl && o && o.top === false) { // open tube seen from both sides
        seg = seg || 8;
        for (let i = 0; i < seg; i++) {
          const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
          this.q(u + c1 * r0, y0, v + s1 * r0, u + c0 * r0, y0, v + s0 * r0, u + c0 * r1, y0 + h, v + s0 * r1, u + c1 * r1, y0 + h, v + s1 * r1);
        }
        return this;
      }
      this.g.cyl(this.F.X(u, v), y0, this.F.Z(u, v), r0, r1, h, seg, o); return this;
    }
    dome(u, y0, v, r, h, seg, rings) { this.g.dome(this.F.X(u, v), y0, this.F.Z(u, v), r, h, seg, rings); return this; }
    sphere(u, y, v, rx, ry, rz, seg, rings) {
      const swap = Math.abs(this.F.s) > 0.7;
      this.g.sphere(this.F.X(u, v), y, this.F.Z(u, v), swap ? rz : rx, ry, swap ? rx : rz, seg, rings); return this;
    }
    /** add a THREE geometry with a local matrix (current colour) */
    geo(geom, m) { this.g.addGeometry(geom, TMP.m3.multiplyMatrices(this.F.m, m || TMP.id)); return this; }
    /** geometry translated to local (u, y, v), optionally rotated about y by a and scaled */
    put(geom, u, y, v, a, sx, sy, sz) {
      const m = TMP.m2.makeRotationY(a || 0);
      if (sx != null) m.scale(TMP.sv.set(sx, sy == null ? sx : sy, sz == null ? sx : sz));
      m.setPosition(u, y, v);
      return this.geo(geom, m);
    }
    lathe(u, y0, v, prof, seg, mod, key) { return this.put(latheGeo(prof, seg || 16, mod, key), u, y0, v); }
    /** extruded wall slab: shape in (s along A->B, y) coordinates, A->B with the outward normal on the right; extruded inward by depth */
    slab(ua, va, ub, vb, depth, geom, y0) {
      const du = ub - ua, dv = vb - va, L = Math.hypot(du, dv) || 1, ex = du / L, ez = dv / L;
      TMP.m2.set(ex, 0, -ez, ua + ez * depth, 0, 1, 0, y0 || 0, ez, 0, ex, va - ex * depth, 0, 0, 0, 1);
      return this.geo(geom, TMP.m2);
    }
    /** a vertical disc (clock bezel, rosette) on the plane facing +v at v */
    vdisc(u, y, v, r, t, seg) { TMP.m2.makeRotationX(PI / 2).setPosition(u, y, v + t / 2); return this.geo(cylGeo(r, r, t, seg || 16), TMP.m2); }
  }
  let _unitBox = null;
  function unitBox() { if (!_unitBox) { _unitBox = new THREE.BoxGeometry(1, 1, 1); } return _unitBox; }
  const geoCache = new Map();
  function cached(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }
  function wheelGeo(r, t) { return cached('wheel:' + r + ':' + t, () => new THREE.CylinderGeometry(r, r, t, 14, 1).rotateX(PI / 2)); }
  function cylGeo(r0, r1, h, seg) { return cached('cyl:' + r0 + ':' + r1 + ':' + h + ':' + seg, () => new THREE.CylinderGeometry(r1, r0, h, seg, 1)); }
  /** surface of revolution; prof [[r, y], ...] bottom to top; mod(angle, row) scales the radius */
  function latheGeo(prof, seg, mod, key) {
    const make = () => {
      const n = prof.length, pos = new Float32Array(n * seg * 3);
      for (let j = 0; j < n; j++) for (let i = 0; i < seg; i++) {
        const a = (i / seg) * TAU, k = mod ? mod(a, j) : 1, r = prof[j][0] * k, o = (j * seg + i) * 3;
        pos[o] = Math.cos(a) * r; pos[o + 1] = prof[j][1]; pos[o + 2] = Math.sin(a) * r;
      }
      const idx = [];
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < seg; i++) {
        const a = j * seg + i, b = j * seg + ((i + 1) % seg), c = (j + 1) * seg + i, d = (j + 1) * seg + ((i + 1) % seg);
        idx.push(a, c, d, a, d, b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    return key ? cached('lathe:' + key, make) : make();
  }
  // classic profiles (unit radius / height)
  const ONION = [[0.6, 0], [0.82, 0.07], [0.98, 0.2], [1.03, 0.34], [0.98, 0.5], [0.82, 0.65], [0.56, 0.79], [0.3, 0.9], [0.12, 0.97], [0, 1]];
  const DOMEP = [[1, 0], [0.98, 0.2], [0.92, 0.4], [0.8, 0.6], [0.6, 0.8], [0.32, 0.95], [0, 1]];
  const scaleProf = (P, r, h) => P.map((p) => [p[0] * r, p[1] * h]);

  /* ---------------------------------------------------------------- arches + walls with openings */
  function archCurve(x0, x1, ys, ya, seg) {
    const hw = (x1 - x0) / 2, xm = x0 + hw, rise = ya - ys, out = [];
    if (rise < 0.01) return out;
    if (rise <= hw * 1.001) {
      const n = Math.max(2, seg * 2);
      for (let i = 1; i < n; i++) { const t = PI - (i / n) * PI; out.push([xm + Math.cos(t) * hw, ys + Math.sin(t) * rise]); }
      return out;
    }
    const R = (hw * hw + rise * rise) / (2 * hw), cx = x0 + R, phi = Math.atan2(rise, hw - R);
    for (let i = 1; i <= seg; i++) { const t = PI + (phi - PI) * (i / seg); out.push([cx + Math.cos(t) * R, ys + Math.sin(t) * R]); }
    for (let i = seg - 1; i >= 1; i--) { const t = PI + (phi - PI) * (i / seg); out.push([2 * xm - (cx + Math.cos(t) * R), ys + Math.sin(t) * R]); }
    return out;
  }
  /** wall outline 0..L x y0..y1 with openings from the base: [{x0, x1, ys, ya}] (ya = ys: flat top) */
  function wallShape(L, y0, y1, opens, seg, top) {
    const s = new THREE.Shape();
    s.moveTo(0, y0);
    for (const o of (opens || []).slice().sort((a, b) => a.x0 - b.x0)) {
      if (o.x0 > 0.001) s.lineTo(o.x0, y0);
      s.lineTo(o.x0, o.ys);
      for (const p of archCurve(o.x0, o.x1, o.ys, o.ya, seg || 6)) s.lineTo(p[0], p[1]);
      s.lineTo(o.x1, o.ys);
      s.lineTo(o.x1, y0);
    }
    s.lineTo(L, y0);
    if (top) { s.lineTo(L, y1); for (let i = top.length - 1; i >= 0; i--) s.lineTo(top[i][0], top[i][1]); s.lineTo(0, y1); }
    else { s.lineTo(L, y1); s.lineTo(0, y1); }
    return s;
  }
  function archHole(x0, x1, yb, ys, ya, seg) {
    const p = new THREE.Path();
    p.moveTo(x0, yb); p.lineTo(x1, yb); p.lineTo(x1, ys);
    const c = archCurve(x0, x1, ys, ya, seg || 5);
    for (let i = c.length - 1; i >= 0; i--) p.lineTo(c[i][0], c[i][1]);
    p.lineTo(x0, ys); p.lineTo(x0, yb);
    return p;
  }
  function rectHole(x0, y0, x1, y1) { const p = new THREE.Path(); p.moveTo(x0, y0); p.lineTo(x1, y0); p.lineTo(x1, y1); p.lineTo(x0, y1); p.lineTo(x0, y0); return p; }
  function circHole(cx, cy, r, seg) { const p = new THREE.Path(); p.absarc(cx, cy, r, 0, TAU, true); return p; }
  /** an arch-shaped band (archivolt) centred at xc: outer half width ho, inner hi */
  function archBand(xc, ho, hi, yb, ys, yaO, yaI, seg) {
    const s = new THREE.Shape();
    s.moveTo(xc - ho, yb); s.lineTo(xc - hi, yb); s.lineTo(xc - hi, ys);
    for (const p of archCurve(xc - hi, xc + hi, ys, yaI, seg)) s.lineTo(p[0], p[1]);
    s.lineTo(xc + hi, ys); s.lineTo(xc + hi, yb); s.lineTo(xc + ho, yb); s.lineTo(xc + ho, ys);
    const c = archCurve(xc - ho, xc + ho, ys, yaO, seg);
    for (let i = c.length - 1; i >= 0; i--) s.lineTo(c[i][0], c[i][1]);
    s.lineTo(xc - ho, ys); s.lineTo(xc - ho, yb);
    return s;
  }
  /** a solid pointed-arch shape (merlon, niche back, gate leaf) */
  function archSolid(x0, x1, yb, ys, ya, seg) {
    const s = new THREE.Shape();
    s.moveTo(x0, yb); s.lineTo(x1, yb); s.lineTo(x1, ys);
    const c = archCurve(x0, x1, ys, ya, seg || 4);
    for (let i = c.length - 1; i >= 0; i--) s.lineTo(c[i][0], c[i][1]);
    s.lineTo(x0, ys); s.lineTo(x0, yb);
    return s;
  }
  function ext(shape, depth, seg) { return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: seg || 6, steps: 1 }); }
  /** merlon crest outline points along the top: pointed merlons of width w with gaps */
  function merlonTop(L, yb, h, w, gap) {
    const n = Math.max(1, Math.floor((L + gap) / (w + gap))), used = n * w + (n - 1) * gap, s0 = (L - used) / 2, pts = [];
    pts.push([0, yb]);
    for (let i = 0; i < n; i++) {
      const a = s0 + i * (w + gap);
      pts.push([a, yb], [a, yb + h * 0.55], [a + w * 0.18, yb + h * 0.8], [a + w / 2, yb + h], [a + w * 0.82, yb + h * 0.8], [a + w, yb + h * 0.55], [a + w, yb]);
    }
    pts.push([L, yb]);
    return pts;
  }
  /** shape: band 0..L from y0 to y1 with optional holes and a merlon crest on top */
  function crestShape(L, y0, y1, mh, mw, gap, holes) {
    const s = new THREE.Shape();
    s.moveTo(0, y0); s.lineTo(L, y0); s.lineTo(L, y1);
    const t = merlonTop(L, y1, mh, mw, gap);
    for (let i = t.length - 1; i >= 0; i--) s.lineTo(t[i][0], t[i][1]);
    s.lineTo(0, y0);
    if (holes) for (const h of holes) s.holes.push(h);
    return s;
  }

  /* ================================================================ model (one landmark or one batch) */
  class Model {
    constructor(wx, wz) {
      this.F = new Frame(); this.parts = new Map(); this.glows = { gS: [], gM: [], gL: [] };
      this.lights = []; this.ticks = []; this.groups = {}; this.wx = wx || 0; this.wz = wz || 0;
      this.sub = null;
    }
    at(ox, oz, rot) { this.F.set(ox, oz, rot); return this; }
    get k() { return this.part('kit'); }
    get k2() { return this.part('kit2'); }
    /** sub-builder by key; tag puts it in a toggled sub group */
    part(key, mat, tag) {
      const t = tag || this.sub || '';
      if (key === 'kit2') { // double-sided pieces go into the kit mesh with both windings (no extra draw call)
        const id2 = t + '|kit2';
        let p2 = this.parts.get(id2);
        if (!p2) { p2 = { kb: new KB(this.F, this.part('kit', null, tag).g, true), key: 'kit2', shared: true, tag: t || null }; this.parts.set(id2, p2); }
        return p2.kb;
      }
      const id = t + '|' + key;
      let p = this.parts.get(id);
      if (!p) { p = { kb: new KB(this.F), key, mat: mat || null, tag: t || null }; this.parts.set(id, p); }
      return p.kb;
    }
    /** invisible camera-collision proxy box (local coords); detailed meshes are not ray-cast */
    px(u0, y0, v0, u1, y1, v1) { this.part('proxy', M.proxy).box(u0, y0, v0, u1, y1, v1, { bottom: true }); return this; }
    glow(u, y, v, hex, size) { const F = this.F, a = this.glows[size || 'gS']; a.push(F.X(u, v), y, F.Z(u, v), (this.sub || '') + '|' + hex); return this; }
    light(u, y, v, color, intensity, r) { this.lights.push({ x: this.F.X(u, v) + this.wx, y: this.F.Z(u, v) + this.wz, h: y, color, intensity, r }); return this; }
    /** signboard quad on the plane facing +v (text from the core sign atlas) */
    sign(text, u0, u1, y0, y1, v, bg, fg) {
      if (!text || !H.signSlot) return false;
      const w = u1 - u0, hh = y1 - y0;
      const slot = H.signSlot(String(text).toUpperCase().slice(0, 38), bg || '#d8402a', fg || '#fff8e8', w / hh);
      if (!slot) return false;
      slot.page.dirty = true; slot.page.tex.needsUpdate = true;
      this.part('sign:' + slot.page.index, slot.page.mat).c('#ffffff').front(u0, u1, y0, y1, v, [slot.u0, slot.v0, slot.u1, slot.v1]);
      return true;
    }
    finish() {
      const root = new THREE.Group();
      const subs = {};
      const target = (tag) => { if (!tag) return root; if (!subs[tag]) { subs[tag] = new THREE.Group(); subs[tag].name = tag; root.add(subs[tag]); } return subs[tag]; };
      for (const p of this.parts.values()) {
        if (p.shared) continue;
        const g = p.kb.g.build(); if (!g) continue;
        const k = p.key;
        let mat = p.mat;
        if (!mat) mat = k === 'kit' ? M.kit : k === 'kit2' ? M.kit2 : k === 'fac' ? H.materials.facade : k === 'facLit' ? H.materials.facadeLit : k === 'water' ? M.water : k === 'clock' ? M.clock : M.kit;
        const facAttr = mat === M.kit || mat === M.kit2 || mat === H.materials.facade || mat === H.materials.facadeLit;
        if (!facAttr) { g.deleteAttribute('facade'); if (!mat.vertexColors) g.deleteAttribute('color'); }
        if (mat === M.kit || mat === M.kit2) g.deleteAttribute('uv');
        const mesh = new THREE.Mesh(g, mat);
        mesh.name = k;
        if (k === 'proxy') { mesh.userData.noShadow = true; mesh.castShadow = false; } else mesh.raycast = NOOP;
        if (/^sign|clock|water|film/.test(k) || mat.transparent) mesh.userData.noShadow = true;
        target(p.tag).add(mesh);
      }
      for (const key of ['gS', 'gM', 'gL']) {
        const a = this.glows[key]; if (!a.length) continue;
        const byTag = new Map();
        for (let i = 0; i < a.length; i += 4) {
          const s = a[i + 3], bar = s.indexOf('|'), tag = s.slice(0, bar), hex = s.slice(bar + 1);
          let L = byTag.get(tag); if (!L) { L = { p: [], c: [] }; byTag.set(tag, L); }
          const c = H.color(hex);
          L.p.push(a[i], a[i + 1], a[i + 2]); L.c.push(c.r, c.g, c.b);
        }
        for (const [tag, L] of byTag) {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(L.p, 3));
          g.setAttribute('color', new THREE.Float32BufferAttribute(L.c, 3));
          g.computeBoundingSphere();
          const pts = new THREE.Points(g, M[key]); pts.name = 'glow'; pts.renderOrder = 3; pts.raycast = NOOP;
          target(tag || null).add(pts);
        }
      }
      root.userData.lm3d = { lights: this.lights, ticks: this.ticks, subs };
      return root;
    }
  }

  /* ================================================================ registry */
  const DEFS = new Map();           // draw id or '#id' -> {fn, cls, lod, anim}
  const CLS = { shop: [760, 470], cart: [430, 300], tiny: [520, 340], statue: [1100, 700], mid: [1400, 900] };
  /** def('drawA drawB', fn(md, lm, D), {cls: 'shop'|'cart'|'tiny'|'statue' (batched), lod: 'mid', anim: true}) */
  function def(ids, fn, o) { for (const id of ids.split(/\s+/)) if (id) DEFS.set(id, Object.assign({ fn }, o || {})); }
  function defFor(lm) { return DEFS.get('#' + lm.id) || DEFS.get(lm.draw) || null; }
  function rotFor(lm) { if (isFinite(lm.faceAngle)) return PI / 2 - lm.faceAngle; return FR[lm.face] || 0; }
  /** local dimensions: L along the front, D depth, Ht 3D height */
  function dims(lm) { const ns = !lm.face || lm.face === 'n' || lm.face === 's' || isFinite(lm.faceAngle); return { L: ns ? lm.w : lm.d, D: ns ? lm.d : lm.w, Ht: (lm.h || 20) * VS }; }
  const isLow = () => H && H.quality && H.quality.tier === 'low';
  function wrapLod(obj, dist) {
    const lod = new THREE.LOD();
    lod.addLevel(obj, 0);
    lod.addLevel(new THREE.Object3D(), dist);
    lod.userData.lm3d = obj.userData.lm3d;
    lod.name = obj.name;
    return lod;
  }
  /* built objects are kept (LRU) so coming back to an area re-uses their CPU-side geometry: on
   * dispose only the GPU buffers are freed (geometry.dispose()); three.js re-uploads on reuse */
  const OBJ_CACHE = new Map();
  const OBJ_CACHE_MAX = 48;
  function cacheKeep(key, obj) {
    obj.traverse((m) => { if (m.geometry) m.geometry.userData.shared = true; });
    OBJ_CACHE.delete(key); OBJ_CACHE.set(key, obj);
    while (OBJ_CACHE.size > OBJ_CACHE_MAX) {
      const k0 = OBJ_CACHE.keys().next().value, o = OBJ_CACHE.get(k0);
      OBJ_CACHE.delete(k0);
      // in the scene: let the core free it normally later; else free its GPU buffers now
      o.traverse((m) => { if (m.geometry) { m.geometry.userData.shared = false; if (!o.parent) m.geometry.dispose(); } });
    }
  }
  function cacheGet(key) {
    const o = OBJ_CACHE.get(key);
    if (!o || o.parent) return null;
    OBJ_CACHE.delete(key); OBJ_CACHE.set(key, o);
    return o;
  }
  function freeGpu(obj) { if (obj) obj.traverse((m) => { if (m.geometry && m.geometry.userData.shared) m.geometry.dispose(); }); }
  function cacheClear() { for (const o of OBJ_CACHE.values()) o.traverse((m) => { if (m.geometry) { m.geometry.userData.shared = false; if (!o.parent) m.geometry.dispose(); } }); OBJ_CACHE.clear(); }
  function buildOne(T, lm, h) {
    init(T, h);
    const d = defFor(lm);
    if (!d) return null;
    const hit = cacheGet('lm:' + lm.id);
    if (hit) { hit.position.set(0, 0, 0); return hit; }
    const md = new Model(lm.x, lm.y);
    md.at(0, 0, rotFor(lm));
    d.fn(md, lm, dims(lm));
    let obj = md.finish();
    obj.name = 'lm3d:' + lm.id;
    if (d.lod) obj = wrapLod(obj, CLS[d.lod][isLow() ? 1 : 0]);
    obj.name = 'lm3d:' + lm.id;
    cacheKeep('lm:' + lm.id, obj);
    return obj;
  }
  // batched small landmarks: cells per class
  const CELL = 384;
  let cells = null;
  function cellKey(cls, lm) { return cls + ':' + Math.floor(lm.x / CELL) + ',' + Math.floor(lm.y / CELL); }
  function indexCells() {
    cells = new Map();
    for (const lm of (N.world && N.world.data && N.world.data.landmarks) || []) {
      const d = defFor(lm); if (!d || !d.cls) continue;
      const k = cellKey(d.cls, lm);
      let c = cells.get(k); if (!c) { c = { key: k, cls: d.cls, members: [], owner: null }; cells.set(k, c); }
      c.members.push(lm);
    }
  }
  function buildSmall(T, lm, h) {
    init(T, h);
    if (!cells) indexCells();
    const d = defFor(lm);
    const c = cells.get(cellKey(d.cls, lm));
    if (!c) return buildOne(T, lm, h);
    if (c.owner) return false;
    const hit = cacheGet('cell:' + c.key);
    if (hit) { c.owner = lm.id; return hit; }
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const m of c.members) { x0 = Math.min(x0, m.x); z0 = Math.min(z0, m.y); x1 = Math.max(x1, m.x); z1 = Math.max(z1, m.y); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const md = new Model(cx, cz);
    for (const m of c.members) {
      const dm = defFor(m);
      md.at(m.x - cx, m.y - cz, rotFor(m));
      try { dm.fn(md, m, dims(m)); } catch (e) { N.err('lm3d.build:' + m.draw, e); }
    }
    const g = md.finish();
    g.name = 'lm3d-cell:' + c.key;
    const lod = wrapLod(g, CLS[c.cls][isLow() ? 1 : 0]);
    lod.position.set(cx, 0, cz);
    lod.userData.worldSpace = true;
    lod.userData.cell = c;
    c.owner = lm.id;
    cacheKeep('cell:' + c.key, lod);
    return lod;
  }
  function disposeSmall(obj, lm) {
    const c = obj && obj.userData && obj.userData.cell;
    if (c && c.owner === lm.id) c.owner = null;
    freeGpu(obj);
  }
  function disposeOne(obj) { freeGpu(obj); }
  function lmUpdate(obj, lm, dt, h) {
    const u = obj.userData.lm3d; if (!u) return;
    for (const t of u.ticks) t(dt, h, obj, u);
    if (u.lights.length && h.night > 0.05 && u.lightsOn !== false) {
      const f = V3.focus ? V3.focus() : null;
      if (f) for (const L of u.lights) if (Math.abs(L.x - f.x) < 340 && Math.abs(L.y - f.y) < 340) h.light(L);
    }
  }
  function registerAll() {
    for (const [id, d] of DEFS) {
      if (d.cls) V3.registerLandmark(id, buildSmall, { dispose: disposeSmall });
      else V3.registerLandmark(id, buildOne, d.anim ? { update: lmUpdate, dispose: disposeOne } : { dispose: disposeOne });
    }
  }

  /* ================================================================ shared bits */
  // floodlight strengths
  const FL_MON = 150, FL_CIV = 90;
  /** low railing of posts + rails along local polyline points (y 0..h) */
  function railing(k, pts, h, step, col) {
    k.c(col || IRON).fx(0, 0, 0);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ua, va] = pts[i], [ub, vb] = pts[i + 1], L = Math.hypot(ub - ua, vb - va), n = Math.max(1, Math.round(L / (step || 4)));
      for (let j = 0; j <= n; j++) { const t = j / n, u = ua + (ub - ua) * t, v = va + (vb - va) * t; k.box(u - 0.2, 0, v - 0.2, u + 0.2, h, v + 0.2, { top: false }); }
      k.bar(ua, h, va, ub, h, vb, 0.35); k.bar(ua, h * 0.45, va, ub, h * 0.45, vb, 0.25);
    }
  }
  /** heritage lamp post with a lantern (or 3 globes); glow + light */
  function lampPost(md, u, v, h, o) {
    o = o || {};
    const k = md.k;
    k.c(o.col || '#26282c').fx(0, 0, 0);
    k.cyl(u, 0, v, 1.1, 0.8, 2.4, 8).cyl(u, 2.4, v, 0.45, 0.32, h - 2.4, 8);
    const globes = o.globes || 1;
    if (globes > 1) {
      for (let i = 0; i < globes; i++) {
        const a = (i / globes) * TAU, gu = u + Math.cos(a) * 2.2, gv = v + Math.sin(a) * 2.2;
        k.c(o.col || '#26282c').bar(u, h - 1.2, v, gu, h - 0.2, gv, 0.3);
        k.c('#fff4d8').fx(1, 230, 0).sphere(gu, h + 0.8, gv, 0.95, 1.1, 0.95, 8, 6).fx(0, 0, 0);
        md.glow(gu, h + 0.8, gv, '#ffd9a0', 'gM');
      }
      k.c('#fff4d8').fx(1, 230, 0).sphere(u, h + 2.2, v, 0.95, 1.1, 0.95, 8, 6).fx(0, 0, 0);
      md.glow(u, h + 2.2, v, '#ffd9a0', 'gM');
    } else {
      k.c(o.col || '#26282c').cyl(u, h, v, 0.9, 1.2, 0.6, 6);
      k.c('#ffe6b0').fx(1, 230, 0).cyl(u, h + 0.6, v, 1.0, 1.15, 2.2, 6).fx(0, 0, 0);
      k.c(o.col || '#26282c').cyl(u, h + 2.8, v, 1.3, 0.2, 1.4, 6);
      md.glow(u, h + 1.7, v, '#ffd090', 'gM');
    }
    if (o.light) md.light(u, h, v, '#ffcf8a', 0.9, 70);
  }
  /** Sintex-style black water tank on a roof */
  function sintex(k, u, y, v, r) { k.c('#232527').fx(0, 0, 0).cyl(u, y, v, r, r, r * 1.5, 10).c('#2e3134').cyl(u, y + r * 1.5, v, r * 0.98, r * 0.3, r * 0.35, 10); }
  /** TV antenna (aluminium yagi) */
  function antenna(k, u, y, v, h, a) {
    k.c('#9aa0a6').bar(u, y, v, u, y + h, v, 0.25);
    const c = Math.cos(a || 0), s = Math.sin(a || 0);
    for (let i = 0; i < 4; i++) { const yy = y + h - i * 0.9, w = 3.2 - i * 0.4; k.bar(u - c * w, yy, v - s * w, u + c * w, yy, v + s * w, 0.15); }
  }
  /** parapet rim around a rectangle at height y */
  function parapet(k, u0, v0, u1, v1, y, h, t, col) {
    k.c(col);
    k.box(u0, y, v0, u1, y + h, v0 + t); k.box(u0, y, v1 - t, u1, y + h, v1);
    k.box(u0, y, v0 + t, u0 + t, y + h, v1 - t); k.box(u1 - t, y, v0 + t, u1, y + h, v1 - t);
  }
  /** a chhatri (domed kiosk on four pillars) */
  function chhatri(k, u, y, v, r, h, col, domeCol) {
    k.c(col).box(u - r, y, v - r, u + r, y + 0.6, v + r);
    const p = r * 0.78, t = r * 0.16;
    for (const [a, b] of [[-p, -p], [p, -p], [-p, p], [p, p]]) k.box(u + a - t, y + 0.6, v + b - t, u + a + t, y + h * 0.55, v + b + t, { top: false });
    k.box(u - r * 1.08, y + h * 0.55, v - r * 1.08, u + r * 1.08, y + h * 0.62, v + r * 1.08);
    k.c(domeCol || col).lathe(u, y + h * 0.62, v, scaleProf(ONION, r * 0.85, h * 0.38), 12, null, 'onion:' + r + ':' + h);
    k.c(GOLD).cyl(u, y + h, v, 0.18, 0.05, Math.max(0.8, h * 0.12), 4);
  }
  /** square-ish dome on a drum */
  function drumDome(k, u, y, v, r, drumH, domeH, col, domeCol, prof) {
    k.c(col).cyl(u, y, v, r, r, drumH, 16, { top: false });
    k.c(domeCol || col).lathe(u, y + drumH, v, scaleProf(prof || DOMEP, r, domeH), 16, null, 'dome:' + (prof === ONION ? 'o' : 'd') + r + ':' + domeH);
    k.c(GOLD).cyl(u, y + drumH + domeH, v, 0.3, 0.06, Math.max(1.2, r * 0.3), 6);
  }

  /* ================================================================ CHARMINAR */
  // Tiers (3D units): plinth 0-3.9 | great-arch storey 3.9-66 (arch spring 30, apex 48; recessed
  // panel to 60.5; clock at 55.2) | corbels 60.5-63.5 + balcony slab 63.5-66 | arcaded upper storey
  // 66-82 | pierced crest with merlons 82-88 | minarets: two ring balconies (97, 113), arched
  // kiosk, lotus petals, onion dome, finial to 140 (= 93.4 data units x VS like the 2D art).
  const CM = { b0: 3.9, top: 68, spring: 28, apex: 50, hw: 14.5, panel: 62.5, clockY: 57.4, clockR: 4.1, up0: 68, up1: 83, crest: 89 };
  function cmFace(md) {
    const k = md.k, b0 = CM.b0, P = 17.5;
    k.c(LIME).fx(0, 0, FL_MON);
    // core wall (7 thick) with the great arch
    k.slab(-26, 26, 26, 26, 7, cached('cm:core', () => ext(wallShape(52, b0, CM.top, [{ x0: 26 - CM.hw, x1: 26 + CM.hw, ys: CM.spring, ya: CM.apex }], 10), 7, 10)));
    // proud skin with the recessed panel (alfiz) framing arch + clock; a band of small niches above it
    k.c(LIME_HI).slab(-26, 27.3, 26, 27.3, 1.3, cached('cm:skin', () => {
      const s = wallShape(52, b0, CM.top, [{ x0: 26 - P, x1: 26 + P, ys: CM.panel, ya: CM.panel }], 6);
      for (const sx of [6.0, 44.0]) { s.holes.push(archHole(sx, sx + 2.0, 12, 19, 22, 4)); s.holes.push(archHole(sx, sx + 2.0, 30, 37, 40, 4)); s.holes.push(archHole(sx, sx + 2.0, 48, 54, 57, 4)); }
      return ext(s, 1.3, 6);
    }));
    // the archivolt moulding round the great arch + an inner reveal band
    k.c(LIME_HI).slab(-26, 26.9, 26, 26.9, 0.9, cached('cm:band', () => ext(archBand(26, CM.hw + 1.7, CM.hw, b0, CM.spring, CM.apex + 2.6, CM.apex, 10), 0.9, 10)));
    k.c(LIME_SH).slab(-26, 26.15, 26, 26.15, 0.15, cached('cm:band2', () => ext(archBand(26, P - 0.4, CM.hw + 2.3, b0, CM.spring, CM.apex + 6.5, CM.apex + 3.2, 10), 0.15, 10)));
    // spandrel rosettes + clock (1889)
    k.c(LIME_HI);
    for (const s of [-1, 1]) k.vdisc(s * 11.8, 53.4, 26, 1.6, 0.7, 10);
    k.c('#cdb88f').vdisc(0, CM.clockY, 26, CM.clockR + 1.2, 0.9, 20);
    md.part('clock').c('#ffffff').front(-CM.clockR, CM.clockR, CM.clockY - CM.clockR, CM.clockY + CM.clockR, 26.95, [0, 0, 1, 1]);
    // corbels under the balcony + the slab + its pierced balustrade
    k.c('#c4a878').fx(0, 0, FL_MON);
    for (let u = -21.5; u <= 21.6; u += 2.7) { k.box(u - 0.5, 63.2, 27.0, u + 0.5, 65.5, 29.0); k.box(u - 0.45, 62.0, 27.0, u + 0.45, 63.2, 28.0); }
    k.c('#f2e2bc').box(-28.8, 65.5, 23, 28.8, 68, 28.8, { back: false });
    k.c(LIME_HI).slab(-28.6, 28.6, 28.6, 28.6, 0.8, cached('cm:bal', () => {
      const s = wallShape(57.2, 68, 71, null);
      for (let x = 1.2; x < 56; x += 2.2) s.holes.push(archHole(x, x + 1.2, 68.6, 69.6, 70.3, 2));
      return ext(s, 0.8, 3);
    }));
    // upper storey: arcade of seven arches onto a shaded gallery, a row of small niches above
    k.c('#ecd7aa').slab(-24, 24, 24, 24, 1.6, cached('cm:up', () => {
      const s = wallShape(48, CM.up0, CM.up1, null);
      for (let i = 0; i < 7; i++) { const c = 24 + (i - 3) * 6.1; s.holes.push(archHole(c - 1.9, c + 1.9, 69.4, 75.2, 79.4, 5)); }
      for (let i = 0; i < 8; i++) { const c = 24 + (i - 3.5) * 6.1; s.holes.push(archHole(c - 0.6, c + 0.6, 77.8, 79.6, 80.8, 2)); }
      return ext(s, 1.6, 5);
    }));
    k.c('#8a7357').fx(0, 0, 60).wall(-22, 19.5, 22, 19.5, CM.up0, CM.up1);
    k.c('#cbb791').hq(-22, 19.5, 22, 22.4, CM.up0 + 0.05);
    k.c('#a8936d').hq(-22, 19.5, 22, 22.4, CM.up1 - 0.4, true);
    // pierced crest with pointed merlons
    k.c('#f2e0b8').fx(0, 0, FL_MON).slab(-24.6, 24.6, 24.6, 24.6, 1.1, cached('cm:crest', () => {
      const holes = []; for (let x = 1.6; x < 47.6; x += 3.0) holes.push(archHole(x, x + 1.4, 83.5, 84.4, 85.2, 2));
      return ext(crestShape(49.2, 82.8, 85.8, 3.4, 2.1, 0.75, holes), 1.1, 3);
    }));
    // night: bulb strings on the crest and the balcony edge (festive set in green)
    for (const tag of ['bulbs', 'bulbsF']) {
      md.sub = tag;
      const col = tag === 'bulbs' ? '#fff1b8' : '#8dffa8';
      for (let u = -23; u <= 23.1; u += 2.3) md.glow(u, 89.6, 25.4, col);
      for (let u = -27.6; u <= 27.7; u += 2.3) md.glow(u, 71.4, 29.0, col);
      md.sub = null;
    }
  }
  function cmMinaret(md, u, v) {
    const k = md.k, FL = FL_MON;
    k.fx(0, 0, FL);
    // fluted lower shaft, ring bands
    k.c(LIME_SH).lathe(u, 2.1, v, [[6.0, 0], [6.0, 81]], 48, (a) => 1 + 0.045 * Math.cos(a * 12), 'cm:shaft1');
    k.c(LIME_HI).cyl(u, 27.4, v, 6.35, 6.35, 1.2, 24, { top: false }).cyl(u, 64.6, v, 6.45, 6.45, 1.6, 24, { top: false });
    k.c(LIME_HI).cyl(u, 83, v, 6.7, 6.7, 3, 24);
    // second shaft + first ring balcony on corbels
    k.c(LIME_SH).lathe(u, 86, v, [[4.8, 0], [4.8, 12]], 32, (a) => 1 + 0.05 * Math.cos(a * 8), 'cm:shaft2');
    k.c('#c4a878').cyl(u, 94.4, v, 4.8, 6.6, 3.2, 20, { top: false });
    k.c('#f2e4c4').cyl(u, 97.6, v, 6.75, 6.75, 1.0, 20);
    md.part('kit2').c(LIME_HI).fx(0, 0, FL).cyl(u, 98.6, v, 6.5, 6.5, 2.0, 20, { top: false });
    k.c('#fffaf0').cyl(u, 100.6, v, 6.65, 6.65, 0.45, 20);
    // third shaft + second balcony
    k.c(LIME_SH).lathe(u, 98.6, v, [[4.3, 0], [4.3, 13.4]], 32, (a) => 1 + 0.05 * Math.cos(a * 8), 'cm:shaft3');
    k.c('#c4a878').cyl(u, 109.2, v, 4.3, 6.0, 2.8, 20, { top: false });
    k.c('#f2e4c4').cyl(u, 112, v, 6.15, 6.15, 1.0, 20);
    md.part('kit2').c(LIME_HI).fx(0, 0, FL).cyl(u, 113, v, 5.9, 5.9, 1.8, 20, { top: false });
    k.c('#fffaf0').cyl(u, 114.8, v, 6.05, 6.05, 0.4, 20);
    // arched kiosk: dark core, six slender columns, lintel
    k.c('#5a4434').cyl(u, 113, v, 2.8, 2.8, 7.2, 12);
    k.c('#ecd7aa');
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.26, cu = u + Math.cos(a) * 3.6, cv = v + Math.sin(a) * 3.6; k.box(cu - 0.5, 113, cv - 0.5, cu + 0.5, 120.2, cv + 0.5, { top: false }); }
    k.c(LIME_HI).cyl(u, 120, v, 4.3, 4.0, 1.3, 16);
    // lotus petals + onion dome + finial
    k.c('#f7ead0').lathe(u, 120.8, v, [[3.2, 0], [5.0, 1.2], [5.9, 2.4], [5.2, 3.2]], 40, (a, j) => (j >= 2 ? 0.8 + 0.2 * Math.abs(Math.cos(a * 5)) : 1), 'cm:petals');
    k.c('#f8ecd4').lathe(u, 122, v, scaleProf(ONION, 5.1, 13.4), 20, null, 'cm:onion');
    k.c(GOLD).fx(0, 0, 0).cyl(u, 135.2, v, 0.55, 0.3, 1.2, 8).sphere(u, 137, v, 0.9, 0.9, 0.9, 8, 6).cyl(u, 137.6, v, 0.24, 0.04, 2.6, 6);
    // night bulbs on the balconies
    for (const tag of ['bulbs', 'bulbsF']) {
      md.sub = tag;
      const col = tag === 'bulbs' ? '#fff1b8' : '#8dffa8';
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; md.glow(u + Math.cos(a) * 6.9, 101.2, v + Math.sin(a) * 6.9, col); md.glow(u + Math.cos(a) * 6.3, 115.4, v + Math.sin(a) * 6.3, col); }
      md.glow(u, 131, v, '#fff0c0', 'gM');
      md.sub = null;
    }
    k.fx(0, 0, 0);
  }
  function charminar(md, lm) {
    const k = md.k, rot = md.F.rot;
    // granite plinth (two steps) + the inner floor and fountain
    k.c(GRANITE).fx(0, 0, 60).box(-33, 0, -33, 33, 2.1, 33);
    k.c('#a59a8c').box(-31, 2.1, -31, 31, 3.9, 31);
    k.c('#cdb88f').fx(0, 0, 0).cyl(0, 3.9, 0, 4.2, 4.2, 1.1, 8).c('#5f8f92').cyl(0, 4.4, 0, 3.4, 3.4, 0.7, 8);
    for (let i = 0; i < 4; i++) { md.at(0, 0, rot + i * PI / 2); cmFace(md); }
    md.at(0, 0, rot);
    // inner vault: soffit and the ribbed ceiling over the crossing
    k.c('#c9b68e').fx(0, 0, 80).hq(-19.5, -19.5, 19.5, 19.5, 52, true);
    k.c('#bba57c');
    for (let i = 0; i < 4; i++) { const a = i * PI / 2; k.obox(Math.cos(a) * 10, Math.sin(a) * 10, i % 2 ? 1.2 : 20, i % 2 ? 20 : 1.2, 50.6, 52, 0); }
    // roof terrace, the open well over the crossing, the little mosque on the west end
    k.c(LIME_RF).fx(0, 0, 40).hq(-24, -24, 24, 24, 82.9);
    k.c('#6a5440').hq(-5.5, -5.5, 5.5, 5.5, 83.0);
    k.c('#f0dcb4').fx(0, 0, FL_MON).box(-21, 83, -13, -11, 90.5, 13);
    k.c('#f6e6c4').lathe(-16, 90.5, -6, scaleProf(ONION, 2.8, 4.4), 14, null, 'cm:md').lathe(-16, 90.5, 6, scaleProf(ONION, 2.8, 4.4), 14, null, 'cm:md');
    for (const s of [-1, 1]) { k.c('#f6e6c4').cyl(-11.6, 83, s * 12.4, 0.95, 0.8, 11, 8).lathe(-11.6, 94, s * 12.4, scaleProf(ONION, 1.05, 2.2), 10, null, 'cm:mm'); }
    for (const [cu, cv] of [[-26, -26], [26, -26], [-26, 26], [26, 26]]) cmMinaret(md, cu, cv);
    // the plaza: low iron railing with gaps at the four arches + heritage lamps at the corners
    md.at(0, 0, 0);
    for (let i = 0; i < 4; i++) {
      md.at(0, 0, i * PI / 2);
      railing(md.k, [[-50, 50], [-15, 50]], 3.2, 3.5); railing(md.k, [[15, 50], [50, 50]], 3.2, 3.5);
    }
    md.at(0, 0, 0);
    for (const [cu, cv] of [[-54, -54], [54, -54], [-54, 54], [54, 54]]) lampPost(md, cu, cv, 16, { globes: 3, light: true });
    // floodlights: warm pools on the plaza and the monument
    for (const [cu, cv] of [[0, 44], [0, -44], [44, 0], [-44, 0]]) md.light(cu, 4, cv, '#ffcf7a', 1.3, 120);
    md.px(-33, 0, -33, -14.5, 140, -14.5).px(14.5, 0, -33, 33, 140, -14.5).px(-33, 0, 14.5, -14.5, 140, 33).px(14.5, 0, 14.5, 33, 140, 33);
    md.px(-29, 50, -29, 29, 89, 29);
    md.ticks.push(festiveTick);
  }
  function festiveNow() {
    const fx = N.landmarks && N.landmarks.fx;
    if (fx && fx.festive != null) return !!fx.festive;
    const F = N.flags || {};
    return !!(F.chand_raat || F.eid || F.finale || F.ramzan);
  }
  function festiveTick(dt, h, obj, u) {
    const f = festiveNow();
    if (u.fest === f) return;
    u.fest = f;
    if (u.subs.bulbs) u.subs.bulbs.visible = !f;
    if (u.subs.bulbsF) u.subs.bulbsF.visible = f;
  }
  def('charminar', charminar, { anim: true });

  /* ---------------------------------------------------------------- Char Kaman */
  function kaman(md, lm) {
    const ns = lm.w >= lm.d;
    md.at(0, 0, ns ? 0 : PI / 2);
    const k = md.k, L = 72, T = 12, hw = 18, spring = 33, apex = 54, top = 75;
    k.c('#e9dcbc').fx(0, 0, FL_MON);
    k.slab(-36, 6, 36, 6, 12, cached('km:core', () => ext(wallShape(L, 0, top, [{ x0: 36 - hw, x1: 36 + hw, ys: spring, ya: apex }], 10), T, 10)));
    for (const side of [0, 1]) {
      md.at(0, 0, (ns ? 0 : PI / 2) + side * PI);
      // proud skin: panel round the arch, two rows of niches on the piers, a gallery of small arches above
      k.c('#f1e7cc').slab(-36, 6.9, 36, 6.9, 0.9, cached('km:skin', () => {
        const s = wallShape(L, 0, top, [{ x0: 13, x1: 59, ys: 60, ya: 60 }], 6);
        for (const x of [3.5, 63.5]) { s.holes.push(archHole(x, x + 5, 8, 18, 22.5, 4)); s.holes.push(archHole(x, x + 5, 30, 40, 44.5, 4)); s.holes.push(archHole(x, x + 5, 52, 60, 64, 4)); }
        for (let i = 0; i < 9; i++) { const x = 13.6 + i * 5.1; s.holes.push(archHole(x, x + 3.4, 63, 68, 70.6, 3)); }
        return ext(s, 0.9, 5);
      }));
      k.c('#4a3a2e').fx(0, 0, 40);
      for (const x of [3.5, 63.5]) for (const y of [8, 30, 52]) k.front(x - 36, x - 31, y, y + 13, 6.02);
      for (let i = 0; i < 9; i++) { const x = 13.6 + i * 5.1 - 36; k.front(x, x + 3.4, 63, 70, 6.02); }
      k.c('#f5ecd4').fx(0, 0, FL_MON).slab(-36, 6.5, 36, 6.5, 0.6, cached('km:band', () => ext(archBand(36, hw + 1.8, hw, 0, spring, apex + 2.8, apex, 10), 0.6, 10)));
      for (const s of [-1, 1]) k.vdisc(s * 19.5, 56, 6.4, 1.6, 0.6, 10);
    }
    md.at(0, 0, ns ? 0 : PI / 2);
    md.px(-36, 0, -6, -18, top, 6).px(18, 0, -6, 36, top, 6).px(-18, apex - 2, -6, 18, top, 6);
    k.c('#efe3c4').hq(-36, -6, 36, 6, top);
    // merlon crest on both long sides + corner turrets with little domes
    for (const side of [0, 1]) {
      md.at(0, 0, (ns ? 0 : PI / 2) + side * PI);
      k.c('#f1e7cc').slab(-36, 6, 36, 6, 1.0, cached('km:crest', () => ext(crestShape(72, top - 0.4, top + 1.6, 3.6, 2.4, 0.9, null), 1.0, 3)));
    }
    md.at(0, 0, ns ? 0 : PI / 2);
    for (const [cu, cv] of [[-35, -5], [35, -5], [-35, 5], [35, 5]]) {
      k.c('#efe3c4').cyl(cu, 0, cv, 2.2, 1.9, top + 6, 10);
      k.c(LIME_HI).cyl(cu, top + 6, cv, 2.5, 2.5, 0.8, 10).lathe(cu, top + 6.8, cv, scaleProf(ONION, 2.1, 4.6), 12, null, 'km:t');
      k.c(GOLD).fx(0, 0, 0).cyl(cu, top + 11.4, cv, 0.25, 0.05, 1.8, 5).fx(0, 0, FL_MON);
    }
    k.fx(0, 0, 0);
  }
  def('kaman', kaman, {});

  /* ---------------------------------------------------------------- Gulzar Houz */
  function gulzarHouz(md) {
    const k = md.k;
    k.c('#b8ad9c').fx(0, 0, 40).cyl(0, 0, 0, 11.6, 11.6, 0.8, 8);
    k.c('#cfc4b0').cyl(0, 0.8, 0, 11, 11, 2.8, 8, { top: false });
    md.part('kit2').c('#cfc4b0').cyl(0, 0.8, 0, 10.2, 10.2, 2.8, 8, { top: false });
    k.c('#e8dfcc').cyl(0, 3.6, 0, 11.2, 11.2, 0.5, 8, { top: false });
    md.part('water').c('#ffffff').cyl(0, 0.8, 0, 10.2, 10.2, 2.2, 16);
    k.c(LIME).cyl(0, 0, 0, 3.6, 3.2, 4.4, 8).c(LIME_HI).cyl(0, 4.4, 0, 2.2, 1.8, 4, 8);
    k.c('#e8dcc0').cyl(0, 8.4, 0, 1.6, 3.6, 1.6, 12).c(LIME_HI).cyl(0, 10, 0, 0.9, 0.6, 3.2, 8).sphere(0, 13.6, 0, 0.9, 1.1, 0.9, 8, 6);
    md.part('water').c('#ffffff').cyl(0, 9.6, 0, 3.3, 3.3, 0.5, 12);
    k.fx(0, 0, 0);
    md.glow(0, 12, 0, '#ffe0a0', 'gM');
  }
  def('gulzar_houz', gulzarHouz, {});

  /* ---------------------------------------------------------------- Mecca Masjid */
  function meccaMasjid(md, lm, D) {
    const k = md.k, L = D.L, hl = L / 2, hd = D.D / 2, hallH = 46, FLm = 120;
    const G = '#9a948c', GT = '#b6afa5', GD = '#3a3430';
    // hall body behind the portico
    k.c(G).fx(0, 0, FLm).box(-hl + 2, 0, -hd, hl - 2, hallH, hd - 16, { front: false });
    k.c(GD).fx(0, 0, 30).wall(-hl + 8, hd - 16, hl - 8, hd - 16, 0, 40);
    k.c('#6a6058').hq(-hl + 8, hd - 16, hl - 8, hd - 6, 40.5, true);
    k.c('#b0a898').hq(-hl + 8, hd - 16, hl - 8, hd - 6, 0.3);
    // the front: five great arches in a granite screen
    k.c(G).fx(0, 0, FLm).slab(-hl + 2, hd, hl - 2, hd, 6, cached('mm:front:' + L, () => {
      const W = L - 4, ops = [];
      for (let i = 0; i < 5; i++) { const c = W / 2 + (i - 2) * (W / 5.4); const hw = i === 2 ? 8.4 : 7.6; ops.push({ x0: c - hw, x1: c + hw, ys: 22, ya: 35 }); }
      const s = wallShape(W, 0, hallH, ops, 8);
      for (let i = 0; i < 6; i++) { const c = W / 2 + (i - 2.5) * (W / 5.4); s.holes.push(archHole(c - 1.4, c + 1.4, 26, 32, 34.5, 3)); }
      return ext(s, 6, 8);
    }));
    k.c(GD).fx(0, 0, 0);
    { const W = L - 4; for (let i = 0; i < 6; i++) { const c = -W / 2 + W / 2 + (i - 2.5) * (W / 5.4); k.front(c - 1.4, c + 1.4, 26, 34.5, hd - 5.9); } }
    // arched gallery parapet along the top of the front + merlons
    k.c(GT).fx(0, 0, FLm).slab(-hl + 2, hd, hl - 2, hd, 1.2, cached('mm:crest:' + L, () => {
      const W = L - 4, holes = [];
      for (let x = 2; x < W - 3; x += 4.2) holes.push(archHole(x, x + 2.4, hallH + 0.8, hallH + 3.6, hallH + 5, 3));
      return ext(crestShape(W, hallH, hallH + 6, 3.4, 2.4, 1.0, holes), 1.2, 3);
    }));
    // side and back walls: blind arcades + crest
    for (const [rot, len] of [[PI / 2, D.D], [-PI / 2, D.D], [PI, L]]) {
      md.at(0, 0, md.F.rot + rot);
      const half = rot === PI ? hl - 2 : hd, off = rot === PI ? hd : hl - 2;
      k.c(GT).slab(-half, off + 0.8, half, off + 0.8, 0.8, cached('mm:side:' + len, () => {
        const W = half * 2, s = wallShape(W, 2, hallH - 4, null);
        const n = Math.max(3, Math.round(W / 11));
        for (let i = 0; i < n; i++) { const c = (i + 0.5) * (W / n); s.holes.push(archHole(c - 3, c + 3, 8, 24, 31, 5)); }
        return ext(s, 0.8, 5);
      }));
      k.c(GT).slab(-half, off, half, off, 1.0, cached('mm:sc:' + len, () => ext(crestShape(half * 2, hallH, hallH + 3, 3.2, 2.4, 1.0, null), 1.0, 3)));
      md.at(0, 0, md.F.rot - rot);
    }
    k.c('#a7a097').hq(-hl + 2, -hd, hl - 2, hd - 6, hallH - 0.05);
    // the two great octagonal minaret-columns at the front corners
    for (const s of [-1, 1]) {
      const u = s * (hl - 4), v = hd - 4;
      k.c(G).fx(0, 0, FLm).cyl(u, 0, v, 7.2, 6.6, 64, 8);
      k.c(GT).cyl(u, 22, v, 7.6, 7.6, 1.4, 8).cyl(u, hallH, v, 7.5, 7.5, 1.6, 8).cyl(u, 60, v, 8.4, 7.2, 4, 8);
      k.c(GD).cyl(u, 64, v, 4.6, 4.6, 6, 8);
      k.c(GT);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + PI / 8, cu = u + Math.cos(a) * 6.2, cv = v + Math.sin(a) * 6.2; k.box(cu - 0.6, 64, cv - 0.6, cu + 0.6, 70, cv + 0.6, { top: false }); }
      k.cyl(u, 70, v, 7.4, 7.0, 1.4, 8);
      k.c('#a9a29a').lathe(u, 71.4, v, scaleProf(DOMEP, 6.2, 6.4), 16, null, 'mm:dome');
      k.c(GOLD).fx(0, 0, 0).cyl(u, 77.8, v, 0.4, 0.06, 3.4, 6);
    }
    md.light(0, 6, hd + 30, '#ffd9a0', 0.9, 110);
    k.fx(0, 0, 0);
  }
  def('mecca_masjid', meccaMasjid, { anim: true });

  /* ---------------------------------------------------------------- clock towers */
  function clockFace(md, u, y, v, r) {
    md.k.c('#cdbb96').vdisc(u, y, v, r + 0.9, 0.6, 16);
    md.part('clock').c('#ffffff').front(u - r, u + r, y - r, y + r, v + 0.65, [0, 0, 1, 1]);
  }
  function clockTower(md, lm) {
    const k = md.k, mc = lm.variant === 'mahboob_chowk', s = Math.min(lm.w, lm.d) / 2, Ht = lm.h * VS;
    const wall = mc ? '#efe6d2' : '#cbb895', trim = mc ? '#fbf6ea' : '#ddcfb0', dark = '#4a3a2e';
    const b = s * 0.78, sh1 = Ht * 0.62, sh2 = Ht * 0.8;
    k.c(sh(wall, 0.9)).fx(0, 0, FL_CIV).box(-s, 0, -s, s, 2.5, s);
    k.c(wall).box(-b, 2.5, -b, b, sh1, b);
    for (let i = 0; i < 4; i++) {
      md.at(0, 0, i * PI / 2);
      // arched entrance below, slim windows up the shaft, cornices
      k.c(dark).fx(0, 0, 20).front(-b * 0.42, b * 0.42, 2.5, sh1 * 0.22, b + 0.02);
      k.c(trim).fx(0, 0, FL_CIV).slab(-b * 0.62, b + 0.6, b * 0.62, b + 0.6, 0.6, cached('ct:arch:' + b, () => ext(archBand(b * 0.62, b * 0.62, b * 0.42, 2.5, sh1 * 0.16, sh1 * 0.26, sh1 * 0.22, 6), 0.6, 6)));
      for (const f of [0.38, 0.55]) k.c(dark).fx(0, 0, 20).front(-b * 0.14, b * 0.14, sh1 * f, sh1 * f + b * 0.9, b + 0.02);
      k.c(trim).fx(0, 0, FL_CIV).box(-b - 0.8, sh1 * 0.3, b - 0.2, b + 0.8, sh1 * 0.3 + 1.0, b + 0.8).box(-b - 1.2, sh1 - 1.2, b - 0.2, b + 1.2, sh1, b + 1.2);
    }
    md.at(0, 0, 0);
    // clock stage
    const cb = b * 1.05;
    k.c(trim).box(-cb, sh1, -cb, cb, sh2, cb);
    for (let i = 0; i < 4; i++) { md.at(0, 0, i * PI / 2); clockFace(md, 0, (sh1 + sh2) / 2, cb, Math.min(cb * 0.72, (sh2 - sh1) * 0.38)); }
    md.at(0, 0, 0);
    k.c(wall).box(-cb - 1, sh2, -cb - 1, cb + 1, sh2 + 1.4, cb + 1);
    if (mc) {
      // Turkish-style kiosk, onion dome and four corner minarets
      chhatri(k, 0, sh2 + 1.4, 0, b * 0.8, Ht - sh2 - 1.4, trim, '#f4ead2');
      for (const [cu, cv] of [[-cb, -cb], [cb, -cb], [-cb, cb], [cb, cb]]) { k.c(trim).cyl(cu, sh2, cv, 0.9, 0.7, 7, 8).lathe(cu, sh2 + 7, cv, scaleProf(ONION, 1.1, 2.6), 8, null, 'ct:m'); }
    } else {
      // pavilion with arched openings and a pyramidal spire + finial
      k.c(dark).box(-b * 0.6, sh2 + 1.4, -b * 0.6, b * 0.6, sh2 + (Ht - sh2) * 0.45, b * 0.6);
      k.c(wall);
      for (const [cu, cv] of [[-b * 0.7, -b * 0.7], [b * 0.7, -b * 0.7], [-b * 0.7, b * 0.7], [b * 0.7, b * 0.7]]) k.box(cu - 0.9, sh2 + 1.4, cv - 0.9, cu + 0.9, sh2 + (Ht - sh2) * 0.45, cv + 0.9, { top: false });
      const y2 = sh2 + (Ht - sh2) * 0.45;
      k.c(trim).box(-b * 0.85, y2, -b * 0.85, b * 0.85, y2 + 1.2, b * 0.85);
      k.c('#a89678').cyl(0, y2 + 1.2, 0, b * 1.15, 0.3, Ht - y2 - 1.2, 4);
      k.c(GOLD).fx(0, 0, 0).cyl(0, Ht - 0.4, 0, 0.3, 0.05, 4, 5);
    }
    k.fx(0, 0, 0);
    md.light(0, 8, s + 18, '#ffd9a0', 0.8, 70);
  }
  def('clock_tower', clockTower, { anim: true });

  /* ================================================================ SHOPS (batched) */
  const SHOPK = {
    kirana: { wall: '#e9dcb8', trim: '#c94f2a', aw: ['#2a5cb8', '#f4efe2'], sign: ['#c94f2a', '#fff4d8'], goods: ['#e8b830', '#d8402a', '#2a6ab8', '#f4efe2', '#3a8a3a', '#e07a2e'], glow: 1, jars: true, name: 'KIRANA & GENERAL STORES' },
    stationery: { wall: '#f0ead8', trim: '#2a5cb8', aw: ['#2a8c82', '#f4efe2'], sign: ['#2a5cb8', '#ffffff'], goods: ['#8a6a3a', '#2a5cb8', '#f4f0e0', '#e8b830', '#c94f2a'], glow: 2, name: 'STATIONERY & XEROX' },
    pindi_girni: { wall: '#ece6da', trim: '#7a6a5a', aw: ['#8a8a82', '#a8a8a0'], sign: ['#f2c230', '#1a1a1a'], goods: ['#f4f2ec', '#e8e2d4', '#d8cfbe'], glow: 1, name: 'FLOUR MILL' },
    barber: { wall: '#e8eef0', trim: '#2a5cb8', aw: ['#d8402a', '#f4efe2'], sign: ['#1a3a8a', '#ffffff'], goods: ['#7ab0d0', '#e8eef0', '#c8d8e0'], glow: 2, pole: true, name: 'HAIR CUTTING SALOON' },
    cycle_rent: { wall: '#ddd2b8', trim: '#3a8a3a', aw: ['#3a8a3a', '#f2c230'], sign: ['#f2c230', '#1a1a1a'], goods: ['#1a1a1e', '#2a5cb8', '#8a2a2a'], glow: 1, cycles: true, name: 'CYCLE TAXI' },
    video_parlour: { wall: '#d8d0e0', trim: '#7a2ac8', aw: ['#7a2ac8', '#e84a8a'], sign: ['#1a1a2a', '#40e0ff'], goods: ['#2a2a3a', '#40e0ff', '#e84a8a'], glow: 2, name: 'VIDEO GAMES' },
    bakery: { wall: '#f4ece0', trim: '#c86a8a', aw: ['#c86a8a', '#f4ece0'], sign: ['#7a3a2a', '#f8e8c8'], goods: ['#d8a050', '#c88038', '#f0d8a0', '#e8c070'], glow: 1, jars: true, name: 'BAKERY' },
    iyengar_bakery: { wall: '#f4e8b0', trim: '#d88a20', aw: ['#e8a020', '#f4efe2'], sign: ['#f2c230', '#8a2a1a'], goods: ['#d8a050', '#c88038', '#f0d8a0', '#e8c070'], glow: 1, jars: true, name: 'IYENGAR BAKERY' },
    meat_shop: { wall: '#e8e4dc', trim: '#b22b2b', aw: ['#b22b2b', '#f4efe2'], sign: ['#b22b2b', '#ffffff'], goods: ['#f4efe2', '#d8d2c8'], glow: 2, name: 'FRESH CHICKEN & MUTTON' },
    medical_shop: { wall: '#f2f4f2', trim: '#2a8a4a', aw: ['#2a8a4a', '#f4f4f0'], sign: ['#2a8a4a', '#ffffff'], goods: ['#f4f4f0', '#e8c040', '#d84a4a', '#4a8ad8'], glow: 2, cross: true, name: 'MEDICAL & GENERAL STORES' },
    photo_studio: { wall: '#ece6ea', trim: '#7a2a5a', aw: ['#7a2a5a', '#f4efe2'], sign: ['#1a1a1a', '#f2c230'], goods: ['#1a1a1a', '#f4f4f0', '#c83a3a'], glow: 2, name: 'COLOUR LAB & STUDIO' },
    internet_cafe: { wall: '#dfe6ee', trim: '#2a5cb8', aw: ['#2a5cb8', '#e8eef4'], sign: ['#1a3a8a', '#f2f8ff'], goods: ['#d8d4c8', '#2a2a30', '#4a6a8a'], glow: 2, name: 'INTERNET BROWSING CENTRE' },
    sweet_shop: { wall: '#f4e4c8', trim: '#d8402a', aw: ['#e8a020', '#d8402a'], sign: ['#d8402a', '#fff4d8'], goods: ['#f2c230', '#f08a24', '#f4f0e0', '#e86a8a'], glow: 1, jars: true, name: 'SWEET HOUSE' },
    tiffin_centre: { wall: '#f0e8d8', trim: '#2a8c82', aw: ['#2a8c82', '#f4efe2'], sign: ['#2a8c82', '#ffffff'], goods: ['#c8c4bc', '#e8e2d8'], glow: 2, name: 'TIFFIN CENTRE' },
    bangle_shop: { wall: '#ead5b2', trim: '#8a1a3a', aw: ['#c8202a', '#f2c230'], sign: ['#7a1a3a', '#ffe23a'], goods: ['#d8202a', '#2a9a3a', '#e8b020', '#2a5cd8', '#c030a0', '#f4f0e0'], glow: 1, bangles: true, name: 'BANGLES' },
    recording: { wall: '#e2d6c2', trim: '#2a2a3a', aw: ['#2a2a3a', '#e84a2a'], sign: ['#1a1a1a', '#ffd23a'], goods: ['#e8e2d4', '#2a2a30', '#d8402a'], glow: 1, name: 'RECORDING' },
    tv_radio: { wall: '#e8e2d4', trim: '#2a5cb8', aw: ['#2a5cb8', '#f2c230'], sign: ['#2a5cb8', '#ffffff'], goods: ['#3a3a40', '#8a8a90', '#2a2a30'], glow: 2, tvs: true, name: 'TV & RADIO' },
    clothes_store: { wall: '#f0e6dc', trim: '#7a2a5a', aw: ['#7a2a5a', '#f2c230'], sign: ['#7a1a3a', '#ffffff'], goods: ['#e8302a', '#2a5cd8', '#f2c230', '#f4f2ea', '#e85a9a'], glow: 2, name: 'CLOTH EMPORIUM' },
  };
  function signText(lm, cfg) { return lm.sign || (lm.name && !/shop$|store$|stall$|cart$|bandi$/i.test(lm.name) ? lm.name : cfg.name); }
  function shop(md, lm, D, cfg) {
    const k = md.k, L = D.L, Dd = D.D, Ht = Math.min(D.Ht, 40), hl = L / 2, hv = Dd / 2, rng = U.rng(lm.id);
    const gf = 12.5, op0 = -hl + 1.4, op1 = hl - 1.4, depth = Math.min(8, Dd * 0.45);
    const wall = cfg.wall, trim = cfg.trim;
    // shell: side + back walls full height, upper front wall, piers + lintel
    k.c(wall).fx(0, 0, 0);
    k.wall(hl, -hv, -hl, -hv, 0, Ht).wall(-hl, -hv, -hl, hv, 0, Ht).wall(hl, hv, hl, -hv, 0, Ht);
    k.wall(-hl, hv, hl, hv, gf, Ht);
    k.c(sh(wall, 0.92)).box(-hl, 0, hv - 0.6, op0, gf, hv, { top: false }).box(op1, 0, hv - 0.6, hl, gf, hv, { top: false });
    k.c(trim).box(-hl - 0.2, gf - 1.4, hv - 0.4, hl + 0.2, gf, hv + 0.25);
    // the lit interior: back wall with shelves of goods, floor, ceiling, counter
    const iv = hv - depth;
    k.c(sh(wall, 0.82)).fx(cfg.glow, 70, 0).wall(op0, iv, op1, iv, 0, gf - 1.4).wall(op0, hv, op0, iv, 0, gf - 1.4).wall(op1, iv, op1, hv, 0, gf - 1.4);
    k.c('#cfc6b4').fx(0, 0, 0).hq(op0, iv, op1, hv, 0.05);
    k.c('#f4f2ea').fx(cfg.glow, 255, 0).hq(op0, iv, op1, hv, gf - 1.45, true);
    k.c('#6a5440').fx(0, 0, 0);
    const goods = cfg.goods;
    for (let s = 0; s < 3; s++) {
      const y = 2.4 + s * 2.9;
      k.c('#7a5a3a').box(op0 + 0.4, y, iv, op1 - 0.4, y + 0.3, iv + 1.6);
      for (let u = op0 + 0.8; u < op1 - 1.2; u += 1.3) {
        if (cfg.bangles) { k.c(pick(rng, goods)).fx(0, 120, 0).cyl(u + 0.5, y + 0.3, iv + 0.7, 0.42, 0.42, 2.2, 6).fx(0, 0, 0); continue; }
        k.c(pick(rng, goods)).box(u, y + 0.3, iv + 0.2, u + 1.0, y + 0.9 + rng.next() * 1.4, iv + 1.3);
      }
    }
    if (cfg.tvs) for (let i = 0; i < 3; i++) { const u = op0 + 2 + i * 4; k.c('#2a2a30').box(u, 3.2, iv + 0.2, u + 3.2, 6, iv + 2.4); k.c('#6ac0ff').fx(2, 200, 0).front(u + 0.4, u + 2.8, 3.6, 5.6, iv + 2.42).fx(0, 0, 0); }
    k.c(sh(trim, 0.9)).box(op0 + 1.2, 0, hv - 3.2, op1 - 1.2, 4.2, hv - 1.6);
    k.c('#dcd6c8').box(op0 + 1, 4.2, hv - 3.4, op1 - 1, 4.5, hv - 1.4);
    if (cfg.jars) for (let u = op0 + 2; u < op1 - 2; u += 1.9) k.c(pick(rng, ['#e8b830', '#d8402a', '#3a8a3a', '#f08a24', '#c86a8a'])).cyl(u, 4.5, hv - 2.4, 0.55, 0.5, 1.5, 8).c('#d8dde0').cyl(u, 6.0, hv - 2.4, 0.42, 0.42, 0.35, 8);
    // rolled-up shutter, cloth awning in stripes, signboard
    k.c('#8a8e94').box(op0, gf - 3.1, hv - 0.5, op1, gf - 1.4, hv + 0.3);
    const aw = md.part('kit2');
    const n = Math.max(2, Math.round(L / 2.4));
    for (let i = 0; i < n; i++) {
      const u0 = -hl + 0.2 + (i * (L - 0.4)) / n, u1 = -hl + 0.2 + ((i + 1) * (L - 0.4)) / n;
      aw.c(cfg.aw[i % 2]).q(u0, gf + 0.6, hv + 0.2, u1, gf + 0.6, hv + 0.2, u1, gf - 1.4, hv + 3.6, u0, gf - 1.4, hv + 3.6);
      aw.q(u0, gf - 1.4, hv + 3.6, u1, gf - 1.4, hv + 3.6, u1, gf - 2.3, hv + 3.7, u0, gf - 2.3, hv + 3.7);
    }
    md.sign(signText(lm, cfg), -hl + 1, hl - 1, gf + 1.4, gf + 6.2, hv + 0.35, cfg.sign[0], cfg.sign[1]);
    // upper floor: windows with grills and a chajja; parapet; roof tank + antenna
    k.c(wall);
    const nw = Math.max(1, Math.floor(L / 9));
    for (let i = 0; i < nw; i++) {
      const c = -hl + (i + 0.5) * (L / nw);
      k.c('#2c3a44').fx(1, rng.next() < 0.55 ? 150 : 0, 0).front(c - 2.2, c + 2.2, gf + 8, gf + 14.5, hv + 0.05).fx(0, 0, 0);
      k.c(sh(trim, 1.1)).box(c - 2.8, gf + 14.5, hv, c + 2.8, gf + 15.1, hv + 1.8).box(c - 2.5, gf + 7.4, hv, c + 2.5, gf + 8, hv + 0.8);
      k.c('#3a3a40');
      for (let g = -1.6; g <= 1.7; g += 0.8) k.box(c + g - 0.08, gf + 8, hv + 0.1, c + g + 0.08, gf + 14.5, hv + 0.3, { top: false });
    }
    k.c(sh(wall, 0.95)).hq(-hl, -hv, hl, hv, Ht);
    parapet(k, -hl, -hv, hl, hv, Ht, 2.4, 0.6, sh(wall, 1.04));
    if (rng.next() < 0.7) sintex(k, -hl + 3.4, Ht, -hv + 3.4, 2.1);
    if (rng.next() < 0.5) antenna(k, hl - 3, Ht, -hv + 3, 7, rng.next() * PI);
    // kind extras
    if (cfg.pole) { k.c('#f4f4f0').cyl(hl - 2.2, 4, hv + 1.2, 0.5, 0.5, 6, 8); k.c('#d8202a').fx(0, 90, 0).cyl(hl - 2.2, 5, hv + 1.2, 0.56, 0.56, 1.2, 8).c('#2a5cd8').cyl(hl - 2.2, 7.2, hv + 1.2, 0.56, 0.56, 1.2, 8).fx(0, 0, 0); }
    if (cfg.cross) { k.c('#2a9a4a').fx(0, 200, 0).box(hl - 3.2, gf + 7, hv + 0.2, hl - 1.8, gf + 11.6, hv + 0.8).box(hl - 4.8, gf + 8.6, hv + 0.2, hl - 0.2, gf + 10, hv + 0.8).fx(0, 0, 0); }
    if (cfg.cycles) for (let i = 0; i < 3; i++) cycleProp(k, -hl + 3 + i * 3, hv + 7, PI / 2 + 0.1, ['#1a1a1e', '#2a5cb8', '#8a2a2a'][i]);
    if (cfg.bangles) {
      // glittering bulb strings along the front
      for (let u = -hl + 0.6; u <= hl - 0.5; u += 1.2) md.glow(u, gf + 0.7, hv + 0.5, rng.next() < 0.5 ? '#ffe070' : '#ff9a40');
    }
    md.glow(0, gf - 2, hv - 1, cfg.glow === 2 ? '#d8f0ff' : '#ffd090', 'gM');
  }
  function cycleProp(k, u, v, a, col) {
    const c = Math.cos(a), s = Math.sin(a);
    const P = (t, y) => [u + c * t, y, v + s * t];
    k.c('#1a1a1e');
    for (const t of [-2.6, 2.6]) { const [pu, , pv] = P(t, 0); k.put(wheelGeo(1.6, 0.25), pu, 1.6, pv, -a); }
    k.c(col);
    const A = P(-2.6, 1.6), B = P(0.3, 3.3), Cc = P(2.6, 1.6), Dd = P(-0.6, 3.6);
    k.bar(A[0], A[1], A[2], B[0], B[1], B[2], 0.25).bar(B[0], B[1], B[2], Cc[0], Cc[1], Cc[2], 0.25).bar(A[0], A[1], A[2], Dd[0], Dd[1], Dd[2], 0.25);
    const E2 = P(2.0, 4.2); k.bar(Cc[0], Cc[1], Cc[2], E2[0], E2[1], E2[2], 0.22);
    k.c('#1a1a1e').bar(E2[0] - s * 1.2, E2[1], E2[2] + c * 1.2, E2[0] + s * 1.2, E2[1], E2[2] - c * 1.2, 0.2);
  }
  for (const id of Object.keys(SHOPK)) def(id, (md, lm, D) => shop(md, lm, D, SHOPK[lm.variant] && (lm.variant === 'recording' || lm.variant === 'tv_radio') ? SHOPK[lm.variant] : SHOPK[id]), { cls: 'shop' });
  def('video_parlour', (md, lm, D) => shop(md, lm, D, SHOPK[lm.variant] || SHOPK.video_parlour), { cls: 'shop' });

  /* ---------------------------------------------------------------- Irani cafe */
  function iraniCafe(md, lm, D) {
    const k = md.k, L = D.L, Dd = D.D, Ht = Math.min(D.Ht, 39), hl = L / 2, hv = Dd / 2, rng = U.rng(lm.id);
    const wall = '#ece4d0', teal = TEAL, gf = 13.5;
    const nA = Math.max(2, Math.round(L / 9)), pitch = L / nA;
    k.c(wall).fx(0, 0, 0);
    k.wall(hl, -hv, -hl, -hv, 0, Ht).wall(-hl, -hv, -hl, hv, 0, Ht).wall(hl, hv, hl, -hv, 0, Ht);
    // arcaded teal ground floor (arched openings) onto the lit cafe
    k.c(teal).slab(-hl, hv, hl, hv, 1.2, cached('irani:' + L.toFixed(1), () => {
      const ops = [];
      for (let i = 0; i < nA; i++) { const c = (i + 0.5) * pitch; ops.push({ x0: c - pitch * 0.36, x1: c + pitch * 0.36, ys: 8.6, ya: 11.6 }); }
      return ext(wallShape(L, 0, gf, ops, 5), 1.2, 5);
    }));
    const iv = hv - Math.min(12, Dd * 0.6);
    k.c('#d8cdb2').fx(2, 90, 0).wall(-hl + 0.6, iv, hl - 0.6, iv, 0, gf).wall(-hl + 0.6, hv, -hl + 0.6, iv, 0, gf).wall(hl - 0.6, iv, hl - 0.6, hv, 0, gf);
    k.c('#efe9dc').fx(2, 255, 0).hq(-hl + 0.6, iv, hl - 0.6, hv - 1.2, gf - 0.2, true);
    k.c('#c8bfae').fx(0, 0, 0).hq(-hl + 0.6, iv, hl - 0.6, hv - 1.2, 0.05);
    // marble-top tables + bentwood chairs, the glass counter with biscuit jars
    for (let i = 0; i < nA; i++) {
      const c = -hl + (i + 0.5) * pitch, tv = hv - 5;
      k.c('#3a2a20').cyl(c, 0, tv, 0.3, 0.3, 3.6, 6).c('#f4f2ee').cyl(c, 3.6, tv, 1.6, 1.6, 0.3, 12);
      k.c('#5a3a24'); for (const s of [-1, 1]) k.box(c + s * 2.6 - 0.6, 0, tv - 0.6, c + s * 2.6 + 0.6, 2.4, tv + 0.6).box(c + s * 3.1 - 0.15, 2.4, tv - 0.6, c + s * 3.1 + 0.15, 5, tv + 0.6);
    }
    k.c('#7a5a3a').box(-hl + 2, 0, iv + 0.4, -hl + 2 + L * 0.4, 4.4, iv + 3);
    k.c('#bfe0e8').fx(2, 120, 0).box(-hl + 2, 4.4, iv + 0.6, -hl + 2 + L * 0.4, 6.2, iv + 2.8).fx(0, 0, 0);
    // upper floor: arched windows + teal shutters, cornice, the big signboard across the front
    k.c(wall).wall(-hl, hv, hl, hv, gf, Ht);
    md.sign(lm.sign || (lm.name || 'IRANI CAFE').toUpperCase(), -hl + 1.2, hl - 1.2, gf + 0.6, gf + 6.4, hv + 0.4, '#1f6a62', '#fff4d8');
    for (let i = 0; i < nA; i++) {
      const c = -hl + (i + 0.5) * pitch;
      k.c('#2c3a44').fx(1, rng.next() < 0.5 ? 140 : 0, 0).front(c - 1.8, c + 1.8, gf + 9, gf + 15.5, hv + 0.05).fx(0, 0, 0);
      k.c(teal).box(c - 3.4, gf + 9, hv, c - 1.8, gf + 15.5, hv + 0.5).box(c + 1.8, gf + 9, hv, c + 3.4, gf + 15.5, hv + 0.5);
      k.c('#f6f0e2').box(c - 2.4, gf + 15.5, hv, c + 2.4, gf + 16.4, hv + 1.2);
    }
    k.c('#f6f0e2').box(-hl - 0.3, Ht - 1.8, hv - 0.4, hl + 0.3, Ht, hv + 0.8);
    k.c(sh(wall, 0.95)).hq(-hl, -hv, hl, hv, Ht);
    parapet(k, -hl, -hv, hl, hv, Ht, 2.2, 0.6, '#f6f0e2');
    sintex(k, hl - 4, Ht, -hv + 4, 2.2);
    md.glow(0, gf - 1.2, hv - 4, '#d8f0ff', 'gM');
  }
  def('irani_cafe', iraniCafe, { cls: 'shop' });

  /* ---------------------------------------------------------------- restaurants (Paradise etc.) */
  function restaurant(md, lm, D) {
    const k = md.k, L = D.L, Dd = D.D, Ht = Math.min(D.Ht, 42), hl = L / 2, hv = Dd / 2, rng = U.rng(lm.id);
    const paradise = lm.id === 'paradise';
    const wall = paradise ? '#f2ede2' : pick(rng, ['#efe6d4', '#e8e0d8', '#f0dcc8', '#e4e8e0']);
    const acc = paradise ? '#1f7a3a' : pick(rng, ['#b22b2b', '#2a8c82', '#1f5aa8', '#a0522d']);
    k.c(wall).fx(0, 0, 0).box(-hl, 0, -hv, hl, Ht, hv, { front: false });
    k.c(wall).wall(-hl, hv, hl, hv, 14, Ht);
    // glazed lit ground floor with a deep canopy
    k.c('#c8b89a').fx(1, 200, 0).wall(-hl + 1, hv - 4, hl - 1, hv - 4, 0, 12.6).fx(0, 0, 0);
    k.c('#3a4650').fx(1, 160, 0).front(-hl + 1, hl - 1, 0.5, 12.5, hv - 0.2).fx(0, 0, 0);
    k.c(sh(wall, 0.9));
    for (let u = -hl; u <= hl + 0.1; u += L / Math.max(2, Math.round(L / 8))) k.box(u - 0.6, 0, hv - 0.8, u + 0.6, 14, hv + 0.2, { top: false });
    k.c(acc).box(-hl - 0.5, 12.6, hv - 0.5, hl + 0.5, 14.2, hv + 6);
    md.sign(lm.sign || (lm.name || 'HOTEL').toUpperCase(), -hl + 1.5, hl - 1.5, 15.2, 21.6, hv + 0.35, acc, '#fff8e8');
    const fl = Math.max(1, Math.round((Ht - 14) / 13));
    for (let f = 0; f < fl; f++) {
      const y = 23 + f * 13; if (y + 7 > Ht) break;
      for (let u = -hl + 4; u < hl - 3; u += 7) k.c('#2c3a44').fx(1, rng.next() < 0.5 ? 150 : 0, 0).front(u, u + 4, y, y + 6.5, hv + 0.05).fx(0, 0, 0);
    }
    parapet(k, -hl, -hv, hl, hv, Ht, 2.4, 0.6, sh(wall, 1.04));
    if (paradise) {
      // the green-and-white Paradise corner with its big rooftop name board
      k.c('#1f7a3a').box(-hl, Ht - 3, hv - 0.4, hl, Ht, hv + 0.6);
      md.sign('PARADISE', -hl * 0.8, hl * 0.8, Ht + 3, Ht + 11, -hv * 0.2 + 0.4, '#1f7a3a', '#ffffff');
      k.c('#4a4a50').box(-hl * 0.6, Ht, -hv * 0.2 - 0.6, -hl * 0.6 + 0.6, Ht + 3, -hv * 0.2).box(hl * 0.6 - 0.6, Ht, -hv * 0.2 - 0.6, hl * 0.6, Ht + 3, -hv * 0.2);
    }
    md.glow(0, 12, hv + 3, '#ffd9a0', 'gM');
  }
  def('restaurant gokul_chat', restaurant, { cls: 'shop' });

  /* ================================================================ CARTS + STALLS (batched) */
  function pushcart(md, lm, D, kind) {
    const k = md.k, L = Math.max(D.L, D.D), W = Math.min(D.L, D.D), rng = U.rng(lm.id);
    md.at(md.F.ox, md.F.oz, md.F.rot + (D.L < D.D ? PI / 2 : 0));
    const hl = Math.min(L, 15) / 2, hw = Math.min(W, 8) / 2, bed = 4.2;
    // the wooden bed on bicycle wheels with a handle
    k.c(WOOD).fx(0, 0, 0).box(-hl, bed, -hw, hl, bed + 0.7, hw);
    k.c(sh(WOOD, 0.8)).box(-hl, bed - 1.2, -hw + 0.3, hl, bed, -hw + 0.6).box(-hl, bed - 1.2, hw - 0.6, hl, bed, hw - 0.3);
    for (const s of [-1, 1]) { const m = TMP.m2.makeRotationX(PI / 2).setPosition(-hl * 0.25, 2.6, s * (hw + 0.2)); k.c('#2a2a2a').geo(cylGeo(2.6, 2.6, 0.35, 14), m); }
    k.c('#3a3a3a').box(hl - 1.6, 0, -0.4, hl - 0.8, bed, 0.4, { top: false });
    k.c(WOOD).bar(-hl, bed + 0.4, -hw + 0.5, -hl - 3.2, bed + 1.6, -hw + 0.5, 0.35).bar(-hl, bed + 0.4, hw - 0.5, -hl - 3.2, bed + 1.6, hw - 0.5, 0.35).bar(-hl - 3.2, bed + 1.6, -hw + 0.5, -hl - 3.2, bed + 1.6, hw - 0.5, 0.35);
    const top = bed + 0.7;
    if (kind === 'banana_cart') {
      for (let i = 0; i < 14; i++) { const u = -hl + 1.5 + (i % 7) * ((hl * 2 - 3) / 6), v = -hw + 1.6 + Math.floor(i / 7) * (hw * 2 - 3.2); k.c(pick(rng, ['#f2c230', '#e8c020', '#d8b830', '#a8b830'])).sphere(u, top + 0.9, v, 1.4, 0.8, 0.7, 6, 4); }
      for (let i = 0; i < 6; i++) k.c('#f2c230').sphere(-hl + 2 + i * ((hl * 2 - 4) / 5), top + 2.0, 0, 1.2, 0.7, 0.6, 6, 4);
    } else if (kind === 'flower_cart') {
      for (let i = 0; i < 10; i++) { const u = -hl + 1.4 + (i % 5) * ((hl * 2 - 2.8) / 4), v = (Math.floor(i / 5) - 0.5) * hw; k.c(pick(rng, ['#f08a24', '#f4f2ea', '#e83a5a', '#f2c230', '#c040c0'])).sphere(u, top + 0.6, v, 1.5, 0.9, 1.5, 7, 4); }
      k.c('#3a8a3a').box(-hl + 0.5, top, -hw + 0.5, hl - 0.5, top + 0.3, hw - 0.5);
    } else if (kind === 'coconut_cart') {
      for (let i = 0; i < 18; i++) { const u = -hl + 1.4 + (i % 6) * ((hl * 2 - 2.8) / 5), v = -hw + 1.4 + Math.floor(i / 6) * ((hw * 2 - 2.8) / 2); k.c(pick(rng, ['#4a8a2a', '#5a9a32', '#3f7a26'])).sphere(u, top + 1.1 + (i % 2) * 0.4, v, 1.2, 1.1, 1.2, 6, 4); }
      k.c('#9aa0a6').box(hl - 3, top, -0.2, hl - 0.6, top + 0.3, 0.2);
    } else if (kind === 'samosa_bandi' || kind === 'dosa_bandi') {
      k.c('#cfd8dc').fx(1, 80, 0).box(-hl + 1, top, -hw + 0.8, hl * 0.2, top + 3.2, hw - 0.8).fx(0, 0, 0);
      k.c('#d8a050'); for (let i = 0; i < 6; i++) k.sphere(-hl + 2 + (i % 3) * 2.2, top + 1, -1 + Math.floor(i / 3) * 2, 0.8, 0.5, 0.8, 5, 3);
      if (kind === 'dosa_bandi') k.c('#1a1a1a').cyl(hl * 0.55, top, 0, 2.6, 2.6, 0.4, 14);
      else k.c('#3a3a3a').cyl(hl * 0.55, top, 0, 2.2, 1.6, 1.4, 12).c('#d8a050').cyl(hl * 0.55, top + 1.2, 0, 1.9, 1.9, 0.1, 12);
      k.c('#c82a2a').cyl(hl - 1.2, 0, hw - 1.2, 1.1, 1.1, 3.2, 10);
      md.glow(0, top + 4, 0, '#ffd090', 'gM');
    } else if (kind === 'chai_bandi') {
      k.c('#cfd8dc').box(-hl + 0.6, top, -hw + 0.6, hl - 0.6, top + 0.3, hw - 0.6);
      k.c('#3a3a3a').cyl(hl * 0.4, top + 0.3, 0, 1.4, 1.4, 1.2, 10).c('#b8bec4').cyl(hl * 0.4, top + 1.5, 0, 1.3, 1.0, 2.2, 10);
      for (let i = 0; i < 6; i++) k.c('#e8e4dc').cyl(-hl + 1.6 + i * 1.1, top + 0.3, -1.2, 0.35, 0.42, 1.2, 6);
      k.c('#7a5a3a').box(-hl - 2, 0, hw + 2, hl - 4, 2.6, hw + 4);
      md.glow(hl * 0.4, top + 5, 0, '#ffb060', 'gM');
    }
    // a faded beach umbrella / tarp on a pole for most carts
    if (kind !== 'coconut_cart' && rng.next() < 0.8) {
      const col = pick(rng, [['#d8402a', '#f4e8d0'], ['#2a5cb8', '#f2c230'], ['#2a8c82', '#f4e8d0'], ['#e8b020', '#d8402a']]);
      k.c('#8a8e94').bar(0, top, 0, 0, top + 7, 0, 0.3);
      const k2 = md.part('kit2'), r = Math.max(hl, 6.5), n = 8;
      for (let i = 0; i < n; i++) { const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU; k2.c(col[i % 2]).q(0, top + 8.6, 0, Math.cos(a1) * r, top + 6.4, Math.sin(a1) * r, Math.cos(a0) * r, top + 6.4, Math.sin(a0) * r, 0, top + 8.6, 0); }
    }
    md.glow(hl - 2, top + 2.5, hw - 1, '#ffc070');
    md.at(md.F.ox, md.F.oz, md.F.rot - (D.L < D.D ? PI / 2 : 0));
  }
  def('banana_cart flower_cart samosa_bandi dosa_bandi coconut_cart chai_bandi', (md, lm, D) => pushcart(md, lm, D, lm.draw), { cls: 'cart' });

  function kiteStall(md, lm, D) {
    const k = md.k, rng = U.rng(lm.id), hl = D.L / 2, hv = D.D / 2;
    k.c('#a8844a').fx(0, 0, 0);
    for (const [u, v] of [[-hl + 0.6, -hv + 0.6], [hl - 0.6, -hv + 0.6], [-hl + 0.6, hv - 0.6], [hl - 0.6, hv - 0.6]]) k.box(u - 0.3, 0, v - 0.3, u + 0.3, 14, v + 0.3, { top: false });
    k.bar(-hl, 13.6, -hv + 0.6, hl, 13.6, -hv + 0.6, 0.3).bar(-hl, 13.6, hv - 0.6, hl, 13.6, hv - 0.6, 0.3).bar(-hl, 8.6, hv - 0.6, hl, 8.6, hv - 0.6, 0.25);
    k.c('#7a5a3a').box(-hl + 0.6, 3.6, -hv + 0.6, hl - 0.6, 4.2, hv - 0.6);
    const k2 = md.part('kit2');
    const cols = ['#e8302a', '#f2c230', '#2a5cd8', '#3ac05a', '#f06aa0', '#f4f2ea', '#7a2ac8', '#f08a24'];
    for (let row = 0; row < 2; row++) for (let u = -hl + 1.6; u < hl - 1; u += 2.4) {
      const y = row ? 6.4 : 11.4, v = hv - 0.4, s = 1.2;
      k2.c(pick(rng, cols)).q(u, y - s * 1.2, v, u + s, y, v, u, y + s * 1.2, v, u - s, y, v);
    }
    for (let i = 0; i < 8; i++) { const u = -hl + 2 + (i % 4) * ((hl * 2 - 4) / 3), v = -hv + 2 + Math.floor(i / 4) * 2.4; k.c(pick(rng, cols)).box(u - 1, 4.2, v - 0.6, u + 1, 4.2 + 1 + rng.next(), v + 0.6); }
    md.glow(0, 12, hv, '#ffd090', 'gM');
  }
  def('kite_stall', kiteStall, { cls: 'cart' });
  function bookStall(md, lm, D) {
    const k = md.k, rng = U.rng(lm.id), hl = D.L / 2, hv = D.D / 2;
    k.c(WOOD).fx(0, 0, 0).box(-hl, 3.2, -hv, hl, 3.8, hv);
    for (const [u, v] of [[-hl + 0.5, -hv + 0.5], [hl - 0.5, -hv + 0.5], [-hl + 0.5, hv - 0.5], [hl - 0.5, hv - 0.5]]) k.box(u - 0.3, 0, v - 0.3, u + 0.3, 3.2, v + 0.3, { top: false });
    for (let u = -hl + 1; u < hl - 1; u += 1.6) for (let v = -hv + 1; v < hv - 1; v += 2.4) k.c(pick(rng, ['#2a5cb8', '#c82a2a', '#e8b830', '#3a8a3a', '#f4f0e0', '#7a3a8a'])).box(u, 3.8, v, u + 1.4, 4.2 + rng.next() * 1.6, v + 2);
    k.c('#2a5cb8').bar(-hl, 3.8, -hv, -hl, 9, -hv, 0.3).bar(hl, 3.8, -hv, hl, 9, -hv, 0.3);
    md.part('kit2').c('#2a5cb8').q(-hl - 1, 9, -hv - 0.5, hl + 1, 9, -hv - 0.5, hl + 1, 8, hv + 1.5, -hl - 1, 8, hv + 1.5);
  }
  def('book_stall', bookStall, { cls: 'cart' });

  /* ---------------------------------------------------------------- STD booth, bus stop, playground, statues */
  function stdBooth(md, lm) {
    const k = md.k, s = 5.4, h = 10.5;
    k.c('#f2c230').fx(0, 0, 0).box(-s, 0, -s, s, 1.4, s).box(-s, h - 1.6, -s, s, h, s);
    k.c('#d8a820'); for (const [u, v] of [[-s, -s], [s, -s], [-s, s], [s, s]]) k.box(u - 0.5, 1.4, v - 0.5, u + 0.5, h - 1.6, v + 0.5, { top: false });
    k.c('#5a7a8a').fx(2, 160, 0).box(-s + 0.4, 1.4, -s + 0.4, s - 0.4, h - 1.6, s - 0.4, { top: false }).fx(0, 0, 0);
    k.c('#3a3a40').box(-1, 4.6, -s + 0.6, 1, 7.4, -s + 1.6);
    k.c('#d82a2a').box(-s - 0.2, h, -s - 0.2, s + 0.2, h + 0.6, s + 0.2);
    for (let i = 0; i < 4; i++) { md.at(md.F.ox, md.F.oz, md.F.rot + i * PI / 2); md.sign('STD ISD PCO', -s + 0.4, s - 0.4, h - 1.5, h - 0.1, s + 0.05, '#f2c230', '#c81a1a'); }
    md.glow(0, h - 2.5, 0, '#e0f4ff', 'gM');
  }
  def('std_booth', stdBooth, { cls: 'tiny' });
  function busStop(md, lm, D) {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, h = 11;
    k.c('#bfb6a6').fx(0, 0, 0).box(-hl, 0, -hv, hl, 0.6, hv);
    k.c('#e8e0d0').box(-hl + 0.5, 0.6, -hv, hl - 0.5, h - 1, -hv + 0.8);
    k.c('#b22b2b');
    for (const u of [-hl + 1, 0, hl - 1]) k.box(u - 0.5, 0.6, hv - 1.4, u + 0.5, h, hv - 0.4, { top: false });
    k.c('#d8d4cc').box(-hl - 0.6, h, -hv - 0.4, hl + 0.6, h + 0.8, hv + 1.6);
    k.c('#b22b2b').box(-hl - 0.6, h + 0.8, hv + 0.8, hl + 0.6, h + 2.2, hv + 1.6);
    k.c('#8a7a6a').box(-hl + 2, 3, -hv + 1, hl - 2, 3.6, -hv + 3.4);
    md.sign(lm.sign || 'BUS STOP', -hl + 1, hl - 1, h + 0.8, h + 3.6, hv + 1.65, '#b22b2b', '#ffffff');
    md.glow(0, h - 0.4, 0, '#e0f4ff', 'gM');
  }
  def('bus_stop', busStop, { cls: 'shop' });
  function playground(md, lm, D) {
    const k = md.k, hl = D.L / 2;
    k.c('#c82a2a').fx(0, 0, 0);
    // swing frame
    k.bar(-hl, 0, -2.5, -hl + 1.5, 11, 0, 0.45).bar(-hl, 0, 2.5, -hl + 1.5, 11, 0, 0.45).bar(-1.5, 0, -2.5, -1.5 + 0.1, 11, 0, 0.45).bar(-1.5, 0, 2.5, -1.4, 11, 0, 0.45);
    k.c('#2a5cb8').bar(-hl + 1.5, 11, 0, -1.4, 11, 0, 0.4);
    for (const u of [-hl + 3.4, -hl + 6]) { k.c('#8a8e94').bar(u - 0.5, 11, 0, u - 0.5, 3, 0, 0.12).bar(u + 0.5, 11, 0, u + 0.5, 3, 0, 0.12); k.c('#f2c230').box(u - 0.9, 2.8, -0.6, u + 0.9, 3.2, 0.6); }
    // slide
    k.c('#2a5cb8').bar(2, 0, -1.2, 2, 8, -1.2, 0.35).bar(2, 0, 1.2, 2, 8, 1.2, 0.35);
    k.c('#f2c230').box(1.6, 7.6, -1.4, 4, 8, 1.4);
    md.part('kit2').c('#e8b020').q(4, 8, -1.2, 4, 8, 1.2, hl, 0.6, 1.2, hl, 0.6, -1.2);
  }
  def('playground_kit', playground, { cls: 'tiny' });

  /* ================================================================ CIVIC BUILDINGS (facade atlas walls + kit details) */
  /** four facade-atlas walls around a rectangle (window bays every `bay` u, one row per storey) */
  function facWalls(fp, u0, v0, u1, v1, y0, y1, bay, sides) {
    const fl = (y1 - y0) / (10 * VS);
    const W = [[u0, v1, u1, v1, 'f'], [u1, v1, u1, v0, 'r'], [u1, v0, u0, v0, 'b'], [u0, v0, u0, v1, 'l']];
    for (const [ua, va, ub, vb, s] of W) {
      if (sides && sides.indexOf(s) < 0) continue;
      const len = Math.hypot(ub - ua, vb - va), n = Math.max(1, Math.round(len / (bay || 8)));
      fp.wall(ua, va, ub, vb, y0, y1, 0, n, 0, fl);
    }
  }
  /** merlon crest on the four edges of a rectangle (cached by edge length) */
  function crestRect(k, u0, v0, u1, v1, y, band, mh, mw) {
    const edges = [[u0, v1, u1, v1], [u1, v1, u1, v0], [u1, v0, u0, v0], [u0, v0, u0, v1]];
    for (const [ua, va, ub, vb] of edges) {
      const len = Math.hypot(ub - ua, vb - va);
      if (len < 3) continue;
      const key = 'crest:' + len.toFixed(1) + ':' + band + ':' + mh + ':' + (mw || 2.2);
      k.slab(ua, va, ub, vb, 0.8, cached(key, () => ext(crestShape(len, y, y + band, mh, mw || 2.2, 0.7, null), 0.8, 3)));
    }
  }
  /** balustrade (posts + rail) on the four edges */
  function balustrade(k, u0, v0, u1, v1, y, h, col) {
    k.c(col);
    for (const [ua, va, ub, vb] of [[u0, v1, u1, v1], [u1, v1, u1, v0], [u1, v0, u0, v0], [u0, v0, u0, v1]]) {
      const len = Math.hypot(ub - ua, vb - va), n = Math.max(2, Math.round(len / 1.6));
      for (let i = 0; i <= n; i++) { const t = i / n, u = ua + (ub - ua) * t, v = va + (vb - va) * t; k.box(u - 0.25, y, v - 0.25, u + 0.25, y + h - 0.5, v + 0.25, { top: false }); }
    }
    k.box(u0 - 0.4, y + h - 0.5, v0 - 0.4, u1 + 0.4, y + h, v0 + 0.4).box(u0 - 0.4, y + h - 0.5, v1 - 0.4, u1 + 0.4, y + h, v1 + 0.4);
    k.box(u0 - 0.4, y + h - 0.5, v0, u0 + 0.4, y + h, v1).box(u1 - 0.4, y + h - 0.5, v0, u1 + 0.4, y + h, v1);
  }
  /** a portico at the front: columns + roof (+ pediment) or an arched porch */
  function porch(md, u, v, w, d, h, o) {
    const k = md.k, col = o.col || '#f2ece0', kind = o.kind || 'col';
    const u0 = u - w / 2, u1 = u + w / 2, v0 = v, v1 = v + d;
    k.c(sh(col, 0.85)).box(u0 - 1, 0, v0, u1 + 1, 1.6, v1 + 1);
    if (kind === 'arch') {
      k.c(col).slab(u0, v1, u1, v1, 1.6, cached('porchA:' + w + ':' + h, () => {
        const n = Math.max(1, Math.round(w / 9)), ops = [], pw = w / n;
        for (let i = 0; i < n; i++) { const c = (i + 0.5) * pw; ops.push({ x0: c - pw * 0.33, x1: c + pw * 0.33, ys: h * 0.5, ya: h * 0.75 }); }
        return ext(wallShape(w, 1.6, h, ops, 6), 1.6, 6);
      }));
      k.wall(u0, v0, u0, v1, 1.6, h).wall(u1, v1, u1, v0, 1.6, h);
      k.c(sh(col, 0.75)).hq(u0, v0, u1, v1 - 1.6, h - 0.5, true);
      k.c(sh(col, 1.05)).hq(u0, v0, u1, v1, h);
      if (o.crest) crestRect(k.c(col), u0, v0, u1, v1, h - 0.3, 1.2, 2.2, 1.8);
      else k.c(sh(col, 1.05)).box(u0 - 0.6, h - 0.3, v1 - 1.2, u1 + 0.6, h + 1.2, v1 + 0.6);
      return;
    }
    const n = Math.max(2, Math.round(w / 6.5));
    k.c(col);
    for (let i = 0; i <= n; i++) { const cu = u0 + 1.2 + (i * (w - 2.4)) / n; k.cyl(cu, 1.6, v1 - 1.2, 1.0, 0.85, h - 3.2, 10); k.box(cu - 1.2, h - 1.6, v1 - 2.4, cu + 1.2, h - 1.0, v1); }
    k.c(sh(col, 1.04)).box(u0 - 0.6, h - 1.0, v0, u1 + 0.6, h + 1.0, v1 + 0.6);
    k.c(sh(col, 0.78)).hq(u0, v0, u1, v1, h - 1.02, true);
    if (kind === 'pediment') {
      const ph = Math.min(8, w * 0.18);
      k.c(sh(col, 1.06)).q(u0 - 0.6, h + 1.0, v1 + 0.6, u1 + 0.6, h + 1.0, v1 + 0.6, u, h + 1.0 + ph, v1 + 0.6, u, h + 1.0 + ph, v1 + 0.6);
      k.c(o.roof || '#b8b0a4').q(u1 + 0.6, h + 1.0, v1 + 0.6, u1 + 0.6, h + 1.0, v0, u, h + 1.0 + ph, v0, u, h + 1.0 + ph, v1 + 0.6);
      k.q(u0 - 0.6, h + 1.0, v0, u0 - 0.6, h + 1.0, v1 + 0.6, u, h + 1.0 + ph, v1 + 0.6, u, h + 1.0 + ph, v0);
    }
  }
  /** a gated compound wall along the footprint edge with a gate gap at the front */
  function compound(md, hl, hv, h, col, gateW, gateCol) {
    const k = md.k, t = 1.4;
    k.c(col).fx(0, 0, 0);
    k.box(-hl, 0, -hv, hl, h, -hv + t).box(-hl, 0, -hv + t, -hl + t, h, hv).box(hl - t, 0, -hv + t, hl, h, hv);
    k.box(-hl, 0, hv - t, -gateW / 2, h, hv).box(gateW / 2, 0, hv - t, hl, h, hv);
    k.c(sh(col, 1.1));
    for (const s of [-1, 1]) k.box(s * gateW / 2 - 2.2 * (s > 0 ? 0 : 1), 0, hv - 2.6, s * gateW / 2 + 2.2 * (s > 0 ? 1 : 0), h + 4, hv + 0.4).cyl(s * (gateW / 2 + (s > 0 ? 1.1 : -1.1)), h + 4, hv - 1.1, 1.3, 0.2, 2, 8);
    // closed iron gate
    k.c(gateCol || IRON);
    for (let u = -gateW / 2 + 1; u < gateW / 2; u += 1.1) k.box(u - 0.15, 0.4, hv - 1.0, u + 0.15, h + 0.6, hv - 0.6, { top: false });
    k.box(-gateW / 2, h - 0.6, hv - 1.05, gateW / 2, h, hv - 0.55).box(-gateW / 2, 2.0, hv - 1.05, gateW / 2, 2.6, hv - 0.55);
  }
  /**
   * civic(md, lm, D, o): o = {wall, trim, roof, win, gf, lit, bay, flood, h, inset, blocks(hl, hv, Ht) -> [[u0,v0,u1,v1,h,col?]],
   *   crest: 'merlon'|'low'|'balustrade'|false, porch: {w, d, h, kind, col}, domes: [[u, v, r, h, kind, drum]], corners: 'chhatri'|'turret'|'minaret',
   *   tower: {u, v, w, h, top: 'dome'|'pyramid'|'onion', clock}, sign: [text, bg, fg] | text, compound: {h, col, gate}, flag: col, bands: true}
   */
  function civic(md, lm, D, o) {
    const k = md.k, L = D.L, Dd = D.D, hl = L / 2, hv = Dd / 2, Ht = o.h || Math.min(D.Ht, 66), rng = U.rng(lm.id);
    const ST = H.STYLE, wall = o.wall || '#e6d4b4', trim = o.trim || sh(wall, 1.1), roofC = o.roof || sh(wall, 0.86);
    const lit = Math.round((o.lit == null ? 0.35 : o.lit) * 255), seed = (rng.next() * 255) | 0;
    const fp = md.part(o.flood ? 'facLit' : 'fac');
    const FL = o.flood ? FL_CIV : 0;
    const ins = o.inset || 0, pd = o.porch ? o.porch.d : 0;
    if (o.compound) compound(md, hl, hv, o.compound.h || 9, o.compound.col || sh(wall, 0.95), o.compound.gate || 18, o.compound.gateCol);
    const bl = o.blocks ? o.blocks(hl - ins, hv - ins, Ht) : [[-hl + ins, -hv + ins, hl - ins, hv - ins - pd, Ht]];
    let first = null;
    for (const b of bl) {
      const [u0, v0, u1, v1, h] = b;
      if (!first) first = b;
      fp.c(b[5] || wall).fac(ST[o.win || 'rect'], ST[o.gf || o.win || 'rect'], lit, seed + (b[1] | 0), Math.max(1, Math.round(h / 15)));
      facWalls(fp, u0, v0, u1, v1, 0, h, o.bay || 8);
      k.c(roofC).fx(0, 0, FL * 0.4).hq(u0, v0, u1, v1, h);
      k.c(sh(b[5] || wall, 0.8)).fx(0, 0, FL).box(u0 - 0.6, 0, v0 - 0.6, u1 + 0.6, 1.8, v1 + 0.6, { top: false });
      k.c(trim).box(u0 - 0.9, h - 1.4, v0 - 0.9, u1 + 0.9, h, v1 + 0.9);
      if (o.bands) for (let y = 15; y < h - 4; y += 15) k.c(o.bandCol || trim).box(u0 - 0.3, y - 0.8, v0 - 0.3, u1 + 0.3, y, v1 + 0.3, { top: false });
      if (o.crest === 'merlon') crestRect(k.c(trim), u0, v0, u1, v1, h - 0.4, 1.6, 2.4);
      else if (o.crest === 'balustrade') balustrade(k, u0, v0, u1, v1, h, 2.6, trim);
      else if (o.crest !== false) parapet(k, u0, v0, u1, v1, h, o.crest === 'low' ? 1.4 : 2.4, 0.7, trim);
      k.fx(0, 0, 0);
    }
    k.fx(0, 0, FL);
    if (o.porch) porch(md, o.porch.u || 0, hv - ins - pd, o.porch.w, pd, o.porch.h || 16, Object.assign({ col: trim, crest: o.crest === 'merlon' }, o.porch));
    if (o.corners && first) {
      const [u0, v0, u1, v1, h] = first;
      for (const [cu, cv] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) {
        if (o.corners === 'chhatri') chhatri(k, cu, h, cv, 3.2, 9, trim, o.domeCol || trim);
        else if (o.corners === 'minaret') { k.c(trim).cyl(cu, 0, cv, 2.2, 1.7, h + 12, 10).cyl(cu, h + 4, cv, 2.6, 2.6, 0.8, 10); chhatri(k, cu, h + 12, cv, 1.8, 6, trim, o.domeCol || trim); }
        else { k.c(trim).box(cu - 2.6, 0, cv - 2.6, cu + 2.6, h + 5, cv + 2.6); crestRect(k, cu - 2.6, cv - 2.6, cu + 2.6, cv + 2.6, h + 4.6, 0.8, 1.8, 1.4); }
      }
    }
    for (const d of o.domes || []) {
      const [u, v, r, dh, kind, drum] = d, base = (first ? first[4] : Ht);
      const y0 = d[6] != null ? d[6] : base;
      if (kind === 'chhatri') { chhatri(k, u, y0, v, r, dh, trim, o.domeCol || trim); continue; }
      k.c(trim).cyl(u, y0, v, r * 1.12, r * 1.12, 1.2, 16);
      drumDome(k, u, y0 + 1.2, v, r, drum == null ? r * 0.5 : drum, dh, o.drumCol || wall, o.domeCol || trim, kind === 'onion' ? ONION : DOMEP);
    }
    if (o.tower) {
      const t = o.tower, tw = t.w / 2, th = t.h, base = first ? first[4] : Ht;
      fp.c(t.col || wall).fac(ST[o.win || 'rect'], ST[o.win || 'rect'], lit, seed, Math.max(1, Math.round(th / 15)));
      facWalls(fp, t.u - tw, t.v - tw, t.u + tw, t.v + tw, 0, th, 6);
      k.c(trim).box(t.u - tw - 0.8, th - 1.4, t.v - tw - 0.8, t.u + tw + 0.8, th, t.v + tw + 0.8);
      if (t.clock) for (let i = 0; i < 4; i++) {
        const F = md.F, r0 = F.rot, ox = F.ox, oz = F.oz;
        const cx = F.X(t.u, t.v), cz = F.Z(t.u, t.v);
        md.at(cx, cz, r0 + i * PI / 2); clockFace(md, 0, th - tw * 0.9 - 2, tw, Math.min(tw * 0.7, 5));
        md.at(ox, oz, r0);
      }
      if (t.top === 'pyramid') k.c(o.roof || '#9a8a78').cyl(t.u, th, t.v, tw * 1.35, 0.3, tw * 1.6, 4);
      else if (t.top === 'chhatri') chhatri(k, t.u, th, t.v, tw * 0.8, tw * 2, trim, o.domeCol || trim);
      else drumDome(k, t.u, th, t.v, tw * 0.85, 1.5, tw * 1.3, wall, o.domeCol || trim, t.top === 'onion' ? ONION : DOMEP);
      void base;
    }
    if (o.sign) {
      const s = Array.isArray(o.sign) ? o.sign : [o.sign];
      const sw = Math.min(L * 0.6, Math.max(26, s[0].length * 2.6));
      const sy = o.porch ? (o.porch.h || 16) + 1.4 : Math.min(Ht - 4, 17);
      md.sign(s[0], -sw / 2, sw / 2, sy, sy + Math.min(6, sw / 6), hv - ins + 0.5 + (o.porch ? 0 : 0), s[1] || '#1d4e8a', s[2] || '#ffffff');
    }
    if (o.flag) { const fu = (first ? first[0] : -hl) + 4, fv = (first ? first[1] : -hv) + 4, fh = (first ? first[4] : Ht); k.c('#d8d8d8').cyl(fu, fh, fv, 0.25, 0.2, 14, 6); md.part('kit2').c(o.flag).q(fu, fh + 13.8, fv, fu + 6, fh + 13.8, fv, fu + 6, fh + 10, fv, fu, fh + 10, fv); }
    if (o.lightFront !== false) md.light(0, 8, hv + 14, '#ffd9a0', 0.7, 70);
    k.fx(0, 0, 0);
  }
  // per draw / id configurations of the civic builder
  const CIV = {
    auditorium: { wall: '#e8dcc8', win: 'rect', gf: 'glass', crest: 'low', porch: { w: 40, d: 10, h: 14, kind: 'canopy' }, sign: ['RAVINDRA BHARATHI', '#7a1a1a', '#fff4d8'] },
    bal_bhavan: { wall: '#f2d68a', trim: '#e8502a', win: 'rect', gf: 'door', sign: ['JAWAHAR BAL BHAVAN', '#e8502a', '#ffffff'], crest: 'low' },
    ashram: { wall: '#e8b888', trim: '#f4ead8', win: 'arch', gf: 'arcade', crest: 'balustrade', domes: [[0, -4, 6, 7, 'dome']], sign: ['RAMAKRISHNA MATH', '#8a3a1a', '#fff4d8'] },
    british_residency: { wall: '#f0e6c8', trim: '#fffaf0', win: 'colonial', gf: 'colonial', flood: true, crest: 'balustrade', porch: { w: 36, d: 14, h: 34, kind: 'pediment' }, bay: 9 },
    college: { wall: '#d8b898', trim: '#f2e8d8', win: 'arch', gf: 'arcade', crest: 'merlon', corners: 'turret', bands: true },
    club_house: { wall: '#f2ede2', trim: '#ffffff', win: 'colonial', gf: 'colonial', crest: 'balustrade', porch: { w: 24, d: 10, h: 14, kind: 'col' }, compound: { h: 8, col: '#e8e0d0', gate: 16 }, inset: 10, h: 24 },
    coaching_centre: { wall: '#dfe6ee', trim: '#2a5cb8', win: 'glass', gf: 'shop', crest: 'low', sign: ['C  C++  JAVA  ORACLE', '#f2c230', '#c81a1a'] },
    department_store: { wall: '#e8e2d8', trim: '#c81a5a', win: 'glass', gf: 'glass', crest: 'low', sign: ['TRENDZ DEPARTMENT STORE', '#c81a5a', '#ffffff'], lit: 0.8 },
    exhibition_hall: { wall: '#e2e6ea', trim: '#2a5cb8', win: 'glass', gf: 'glass', crest: 'low', sign: ['HITEX', '#2a5cb8', '#ffffff'], h: 30 },
    film_studio: { wall: '#e8e0d0', trim: '#7a1a1a', win: 'rect', gf: 'door', crest: 'low', compound: { h: 9, col: '#e0d8c8', gate: 20 }, inset: 12 },
    gpo: { wall: '#c8603a', trim: '#f2e8d8', win: 'colonial', gf: 'arcade', flood: true, crest: 'balustrade', domes: [[0, 0, 7, 7, 'dome']], sign: ['GENERAL POST OFFICE', '#b22b2b', '#ffffff'], bands: true },
    hospital: { wall: '#eef0ee', trim: '#2a8a6a', win: 'rect', gf: 'door', crest: 'low', porch: { w: 24, d: 10, h: 12, kind: 'canopy' }, lit: 0.6 },
    jubilee_hall: { wall: '#f2ece0', trim: '#ffffff', win: 'arch', gf: 'arcade', flood: true, crest: 'merlon', domes: [[0, 0, 8, 9, 'onion']], corners: 'chhatri' },
    library: { wall: '#e8d0a8', trim: '#f6eedc', win: 'arch', gf: 'arcade', crest: 'balustrade', sign: ['CITY CENTRAL LIBRARY', '#1d4e8a', '#ffffff'] },
    museum: { wall: '#efe4cc', trim: '#fffaf0', win: 'arch', gf: 'arcade', flood: true, crest: 'merlon', domes: [[0, 0, 7, 8, 'onion']], corners: 'chhatri', sign: ['STATE MUSEUM', '#7a1a1a', '#fff4d8'] },
    nizam_college: { wall: '#d8c09a', trim: '#f2e8d8', win: 'arch', gf: 'arcade', flood: true, crest: 'merlon', corners: 'turret', domes: [[0, 0, 7, 8, 'onion']], bands: true },
    radio_station: { wall: '#e8e4dc', trim: '#b22b2b', win: 'rect', gf: 'door', crest: 'low', sign: ['ALL INDIA RADIO', '#b22b2b', '#ffffff'] },
    raj_bhavan: { wall: '#f4f0e6', trim: '#ffffff', win: 'colonial', gf: 'colonial', crest: 'balustrade', compound: { h: 10, col: '#ece4d4', gate: 18 }, inset: 12, porch: { w: 22, d: 8, h: 18, kind: 'col' }, flag: '#f08a24' },
    secretariat: { wall: '#e8dcc0', trim: '#f6eedc', win: 'arch', gf: 'arcade', crest: 'merlon', domes: [[0, 0, 9, 10, 'onion']], corners: 'chhatri', flood: true },
    school: { wall: '#f2dc9a', trim: '#2a5cb8', win: 'rect', gf: 'arcade', crest: 'low', lit: 0.1 },
    stadium: { wall: '#e8e8e4', trim: '#2a5cb8', win: 'open', gf: 'door', crest: 'low', h: 36 },
    market_hall: { wall: '#c8bca8', trim: '#e8dcc8', win: 'arch', gf: 'arcade', crest: 'merlon' },
    palace: { wall: '#efe0c0', trim: '#fffaf0', win: 'colonial', gf: 'arcade', crest: 'balustrade', compound: { h: 10, col: '#e6d8bc', gate: 18 }, inset: 10 },
    tv_tower: null,
    home_house: null,
  };

  /* ---------------------------------------------------------------- specific civic landmarks */
  def('auditorium bal_bhavan ashram british_residency club_house coaching_centre department_store exhibition_hall film_studio gpo hospital jubilee_hall library museum nizam_college raj_bhavan secretariat market_hall', (md, lm, D) => {
    const o = Object.assign({}, CIV[lm.draw]);
    if (lm.draw === 'hospital' || lm.draw === 'film_studio' || lm.draw === 'market_hall') o.sign = [(lm.name || '').toUpperCase().replace(/\s*\(.*\)/, ''), o.trim, '#ffffff'];
    if (lm.variant === 'fruit') o.win = 'open';
    civic(md, lm, D, o);
  }, { anim: true });
  def('palace', (md, lm, D) => {
    const o = Object.assign({}, CIV.palace);
    if (lm.id === 'hill_fort_palace') Object.assign(o, { wall: '#c8a888', trim: '#e8d8c0', win: 'arch', crest: 'merlon', corners: 'turret' });
    if (lm.id === 'king_kothi') Object.assign(o, { wall: '#e8c8a0', domes: [[0, -4, 6, 6, 'dome']] });
    if (lm.id === 'errum_manzil') Object.assign(o, { wall: '#d87a6a', trim: '#f4ece0', porch: { w: 20, d: 8, h: 16, kind: 'col' } });
    if (lm.id === 'rashtrapati_nilayam') Object.assign(o, { wall: '#f4f2ec', porch: { w: 30, d: 10, h: 16, kind: 'col' }, flag: '#f08a24' });
    if (lm.id === 'chiran_palace') Object.assign(o, { wall: '#efe0c0', crest: 'merlon', corners: 'chhatri' });
    civic(md, lm, D, o);
  }, { anim: true });
  def('school', (md, lm, D) => {
    if (lm.variant === 'hps') { civic(md, lm, D, { wall: '#d8b48a', trim: '#f2e6d0', win: 'arch', gf: 'arcade', crest: 'merlon', domes: [[0, 0, 8, 9, 'onion']], corners: 'chhatri', sign: [lm.sign || 'THE HYDERABAD PUBLIC SCHOOL', '#7a1a1a', '#fff4d8'] }); return; }
    const rng = U.rng(lm.id);
    const o = Object.assign({}, CIV.school, { wall: pick(rng, ['#f2dc9a', '#f0e2c0', '#e8d0a0', '#f4e4b8']), trim: pick(rng, ['#2a5cb8', '#7a1a3a', '#1f7a3a', '#b22b2b']) });
    o.sign = [(lm.sign || lm.name || 'HIGH SCHOOL').toUpperCase().replace(/\s*\(.*\)/, ''), o.trim, '#ffffff'];
    civic(md, lm, D, o);
  }, { lod: 'mid' });
  def('college', (md, lm, D) => civic(md, lm, D, Object.assign({}, CIV.college, { sign: [(lm.name || '').toUpperCase(), '#7a1a1a', '#fff4d8'] })), {});
  def('club_house department_store coaching_centre', (md, lm, D) => civic(md, lm, D, Object.assign({}, CIV[lm.draw])), { lod: 'mid' });

  // Assembly: white Indo-Saracenic hall with a central dome, chhatris and an arched porch
  def('assembly', (md, lm, D) => civic(md, lm, D, {
    wall: '#f4f0e6', trim: '#fffdf6', roof: '#e8e2d6', win: 'arch', gf: 'arcade', flood: true, crest: 'merlon', lit: 0.5,
    porch: { w: 30, d: 10, h: 22, kind: 'arch', col: '#fffdf6' }, domes: [[0, -6, 13, 16, 'onion', 7]], corners: 'chhatri',
    blocks: (hl, hv, Ht) => [[-hl, -hv, hl, hv - 10, Ht * 0.72], [-hl * 0.45, -hv * 0.6, hl * 0.45, hv * 0.3, Ht * 0.82]],
    flag: '#f08a24',
  }), { anim: true });
  // Salar Jung Museum: long cream front with a domed entrance
  def('salar_jung_museum', (md, lm, D) => civic(md, lm, D, {
    wall: '#efe2c4', trim: '#fff8e8', win: 'arch', gf: 'arcade', flood: true, crest: 'balustrade', lit: 0.3,
    porch: { w: 34, d: 10, h: 22, kind: 'arch' }, domes: [[0, -4, 10, 11, 'dome', 5]], sign: ['SALAR JUNG MUSEUM', '#7a1a1a', '#fff4d8'],
  }), { anim: true });
  // State Central Library: grand arched portal rising above the roof
  def('state_central_library', (md, lm, D) => {
    civic(md, lm, D, { wall: '#e8c88a', trim: '#f8ecd0', win: 'arch', gf: 'arcade', flood: true, crest: 'merlon', corners: 'chhatri', lit: 0.3, sign: ['STATE CENTRAL LIBRARY', '#7a1a1a', '#fff4d8'] });
    const k = md.k, hv = D.D / 2, Ht = Math.min(D.Ht, 66);
    k.c('#f2dca8').fx(0, 0, FL_CIV).slab(-14, hv + 1.5, 14, hv + 1.5, 3, cached('scl:portal', () => ext(wallShape(28, 0, Ht + 10, [{ x0: 6, x1: 22, ys: Ht * 0.5, ya: Ht * 0.78 }], 8, merlonTop(28, Ht + 10, 3, 2.4, 0.8)), 3, 8)));
    for (const s of [-1, 1]) chhatri(k, s * 14, Ht + 10, hv, 2.4, 8, '#f8ecd0', '#f8ecd0');
    k.fx(0, 0, 0);
  }, { anim: true });
  // Osmania General Hospital: huge Indo-Saracenic granite block, central domed tower, chhatris
  def('osmania_hospital', (md, lm, D) => civic(md, lm, D, {
    wall: '#b0a49a', trim: '#d8cec2', roof: '#9a9088', win: 'arch', gf: 'arcade', flood: true, crest: 'merlon', corners: 'chhatri', bands: true, lit: 0.55,
    porch: { w: 30, d: 10, h: 24, kind: 'arch', col: '#c8beb2' }, domes: [[-50, -8, 6, 7, 'onion'], [50, -8, 6, 7, 'onion']],
    tower: { u: 0, v: -6, w: 24, h: 82, top: 'onion' }, sign: ['OSMANIA GENERAL HOSPITAL', '#1f6a4a', '#ffffff'],
  }), { anim: true });
  // High Court: red-and-white banded stone, a big central dome, two smaller domes and minarets
  def('high_court', (md, lm, D) => {
    civic(md, lm, D, {
      wall: '#c8745a', trim: '#f4ece0', roof: '#d8b8a8', win: 'arch', gf: 'arcade', flood: true, crest: 'merlon', bands: true, bandCol: '#f4ece0', lit: 0.3,
      porch: { w: 34, d: 10, h: 26, kind: 'arch', col: '#f0e4d8' }, domes: [[0, -8, 14, 18, 'onion', 8], [-48, -6, 8, 10, 'onion', 4], [48, -6, 8, 10, 'onion', 4]],
      drumCol: '#c8745a', domeCol: '#f4ece0', corners: 'minaret',
    });
    const k = md.k, hv = D.D / 2;
    for (const u of [-22, 22, -70, 70]) { k.c('#f4ece0').fx(0, 0, FL_CIV).cyl(u, 0, hv - 12, 2.2, 1.8, 66, 10); chhatri(k, u, 66, hv - 12, 2.2, 8, '#f4ece0', '#f4ece0'); }
    k.fx(0, 0, 0);
  }, { anim: true });
  // OU Arts College: long pinkish-grey granite front, tall arched central portal, Ajanta-style pillars
  def('ou_arts_college', (md, lm, D) => {
    const Ht = 48;
    civic(md, lm, D, { wall: '#b8a092', trim: '#cbb6a8', roof: '#a8928a', win: 'arch', gf: 'arcade', flood: true, crest: 'merlon', lit: 0.2, h: Ht, bay: 9,
      blocks: (hl, hv, h) => [[-hl, -hv, hl, hv - 12, h], [-hl + 10, hv - 12, -24, hv, h * 0.62], [24, hv - 12, hl - 10, hv, h * 0.62]] });
    const k = md.k, hv = D.D / 2;
    k.c('#c4ae9e').fx(0, 0, FL_CIV).slab(-24, hv, 24, hv, 12, cached('ou:portal', () => ext(wallShape(48, 0, Ht + 16, [{ x0: 12, x1: 36, ys: Ht * 0.55, ya: Ht * 0.95 }], 10, merlonTop(48, Ht + 16, 3.4, 2.6, 0.8)), 12, 10)));
    k.c('#d8c6b8');
    for (let u = -hv + 30; u < 0; u += 8) void u;
    for (const u of [-64, -52, -40, 40, 52, 64]) { k.cyl(u, 0, hv - 11, 1.6, 1.3, Ht * 0.62 - 1, 8); k.box(u - 2.2, Ht * 0.62 - 3, hv - 13, u + 2.2, Ht * 0.62 - 1, hv - 9); }
    for (const s of [-1, 1]) chhatri(k, s * 24, Ht + 16, hv - 6, 3, 9, '#d8c6b8', '#d8c6b8');
    md.sign('OSMANIA UNIVERSITY', -16, 16, Ht + 3, Ht + 8.5, hv + 0.4, '#7a1a1a', '#fff4d8');
    k.fx(0, 0, 0);
  }, { anim: true });
  // Purani Haveli: long U-shaped palace, two storeys of arches
  def('purani_haveli', (md, lm, D) => {
    civic(md, lm, D, {
      wall: '#e8c890', trim: '#fff4dc', win: 'colonial', gf: 'arcade', crest: 'balustrade', flood: true,
      blocks: (hl, hv, h) => [[-hl, -hv, hl, -hv + 20, h], [-hl, -hv + 20, -hl + 22, hv, h], [hl - 22, -hv + 20, hl, hv, h]],
    });
    // the front gateway between the two wings carrying the museum board
    const k = md.k, hv = D.D / 2, gw = D.L - 44;
    k.c('#efd29c').fx(0, 0, FL_CIV).slab(-gw / 2, hv, gw / 2, hv, 2.4, cached('ph:gate:' + gw, () => ext(wallShape(gw, 0, 16, [{ x0: gw / 2 - 7, x1: gw / 2 + 7, ys: 8, ya: 12.5 }], 6, merlonTop(gw, 16, 1.8, 1.6, 0.6)), 2.4, 6)));
    md.sign("NIZAM'S MUSEUM", -14, 14, 13, 15.6, hv + 0.1, '#7a1a1a', '#fff4d8');
    k.fx(0, 0, 0);
  }, { anim: true });
  // Madina Building: big Nizam-era block of shopfronts with arcades
  def('madina_building pathergatti_arcade', (md, lm, D) => {
    const pg = lm.draw === 'pathergatti_arcade';
    civic(md, lm, D, { wall: pg ? '#b8a59a' : '#d8b890', trim: pg ? '#cbb8ac' : '#f2e2c4', win: 'arch', gf: pg ? 'arcade' : 'shop', crest: 'merlon', lit: 0.5, bay: 7, flood: pg,
      sign: pg ? null : ['MADINA BUILDING', '#1f6a4a', '#ffffff'] });
    // a row of hand-painted shop boards along the arcade
    const hl = D.L / 2, hv = D.D / 2, rng = U.rng(lm.id);
    const names = ['SAREE KENDRA', 'NOOR CLOTH', 'ITTAR HOUSE', 'MADINA TAILORS', 'DECCAN SILKS', 'AL HAMD', 'ZARI WORKS'];
    for (let u = -hl + 2; u < hl - 12; u += 13) md.sign(pick(rng, names), u, u + 11, 10.6, 13, hv + 0.5, pick(rng, ['#1f6a4a', '#7a1a3a', '#1d4e8a', '#b22b2b']), '#fff4d8');
  }, { anim: true });

  /* ---------------------------------------------------------------- Chowmahalla (gated) + Falaknuma (on its hill) */
  def('chowmahalla', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, fp = md.part('facLit'), ST = H.STYLE;
    compound(md, hl, hv, 14, '#e8d4a8', 22, '#3a2a1a');
    // the palace blocks seen over the wall
    const W = '#f0d8a0', T = '#fffaf0';
    for (const [u0, v0, u1, v1, h] of [[-hl + 14, -hv + 14, hl - 14, -hv + 40, 30], [-hl + 14, -14, -14, 30, 24], [14, -14, hl - 14, 30, 24], [-30, -hv + 52, 30, -30, 36]]) {
      fp.c(W).fac(ST.colonial, ST.arcade, 60, 7, Math.round(h / 15));
      facWalls(fp, u0, v0, u1, v1, 0, h, 8);
      k.c('#e2d2b0').fx(0, 0, FL_CIV).hq(u0, v0, u1, v1, h);
      balustrade(k, u0, v0, u1, v1, h, 2.4, T);
    }
    // the north gate with the clock tower over it
    const gw = 26, gh = 26;
    k.c('#efdcb0').fx(0, 0, FL_CIV).slab(-gw / 2, hv, gw / 2, hv, 8, cached('chow:gate', () => ext(wallShape(gw, 0, gh, [{ x0: gw / 2 - 5, x1: gw / 2 + 5, ys: 12, ya: 18 }], 8, merlonTop(gw, gh, 2.4, 2, 0.6)), 8, 8)));
    k.c('#f4e4c0').box(-5, gh, hv - 9, 5, gh + 16, hv - 1);
    md.at(md.F.ox, md.F.oz, md.F.rot); clockFace(md, 0, gh + 10, hv - 1, 3.4);
    drumDome(k, 0, gh + 16, hv - 5, 4.2, 1.2, 5.5, '#f4e4c0', T, ONION);
    k.fx(0, 0, 0);
    md.light(0, 10, hv + 16, '#ffd9a0', 0.8, 70);
  }, { anim: true });
  function rockMound(k, cx, cv, rx, h, rz, col, seed) {
    const rng = U.rng(seed || 'mound');
    k.c(col || '#8f8579').fx(0, 0, 0);
    k.put(H.geo.rock, cx, -h * 0.25, cv, rng.next() * TAU, rx, h * 1.45, rz);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + rng.next() * 0.5, r = 0.75 + rng.next() * 0.2;
      const s = (0.28 + rng.next() * 0.2) * Math.min(rx, rz);
      k.c(sh(col || '#8f8579', 0.85 + rng.next() * 0.3)).put(H.geo.rock, cx + Math.cos(a) * rx * r, s * 0.25, cv + Math.sin(a) * rz * r, rng.next() * TAU, s, s * 0.9, s * 1.1);
    }
  }
  def('falaknuma', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, fp = md.part('facLit'), ST = H.STYLE, base = 14;
    rockMound(k, 0, 0, hl * 0.95, base + 4, hv * 0.95, '#9a8f84', 'falaknuma');
    k.c('#d8d0c4').box(-hl * 0.8, base - 2, -hv * 0.75, hl * 0.8, base, hv * 0.75);
    const W = '#f4f2ec';
    // central block + the two angled "pincer" wings (scorpion plan)
    fp.c(W).fac(ST.colonial, ST.colonial, 70, 11, 3);
    facWalls(fp, -22, -24, 22, 18, base, base + 42, 8);
    k.c('#e8e4dc').fx(0, 0, FL_CIV).hq(-22, -24, 22, 18, base + 42);
    balustrade(k, -22, -24, 22, 18, base + 42, 2.6, '#ffffff');
    porch(md, 0, 18, 30, 12, base + 34, { kind: 'pediment', col: '#ffffff' });
    for (const s of [-1, 1]) {
      const F = md.F, r0 = F.rot;
      md.at(F.X(s * 40, 6), F.Z(s * 40, 6), r0 - s * 0.5);
      fp.c(W).fac(ST.colonial, ST.arcade, 60, 12, 2);
      facWalls(fp, -22, -9, 22, 9, base, base + 28, 8);
      k.c('#e8e4dc').hq(-22, -9, 22, 9, base + 28);
      balustrade(k, -22, -9, 22, 9, base + 28, 2.2, '#ffffff');
      md.at(0, 0, r0);
    }
    drumDome(k, 0, base + 42, -4, 7, 2, 7, W, '#ffffff', DOMEP);
    // the closed gate at the foot of the hill (the palace is shut in 2003)
    k.c('#e8e2d6').fx(0, 0, 40);
    for (const s2 of [-1, 1]) { k.box(s2 * 9 - 2, 0, hv - 4, s2 * 9 + 2, 16, hv); k.c('#f4f0e8').cyl(s2 * 9, 16, hv - 2, 2.4, 1.6, 1.2, 8).lathe(s2 * 9, 17.2, hv - 2, scaleProf(DOMEP, 1.6, 2), 8, null, 'fk:gate').c('#e8e2d6'); }
    k.c(IRON).fx(0, 0, 0);
    for (let u = -7; u <= 7; u += 1.1) k.box(u - 0.15, 0.4, hv - 2.3, u + 0.15, 12, hv - 1.7, { top: false });
    k.box(-7, 11.4, hv - 2.35, 7, 12, hv - 1.65).box(-7, 2, hv - 2.35, 7, 2.6, hv - 1.65);
    k.c('#e8e2d6').box(-hl * 0.8, 0, hv - 3, -11, 5, hv - 1).box(11, 0, hv - 3, hl * 0.8, 5, hv - 1);
    k.fx(0, 0, 0);
    md.light(0, base + 10, hv, '#ffe0b0', 0.9, 90);
  }, { anim: true });

  /* ---------------------------------------------------------------- Birla Mandir, Planetarium */
  /** curvilinear (rekha) temple tower with a square ribbed plan, amalaka and kalash */
  function shikhara(k, u, y, v, r, h, col, flag) {
    const sq = (a) => 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const mod = (a) => sq(a + PI / 4) * 0.82 * (1 + 0.035 * Math.cos(a * 20));
    k.c(col).lathe(u, y, v, scaleProf([[1, 0], [0.99, 0.25], [0.93, 0.5], [0.8, 0.72], [0.62, 0.88], [0.44, 0.97], [0.36, 1]], r, h), 40, mod, 'shik:' + r + ':' + h);
    for (let i = 1; i < 6; i++) { const t = i / 6, rr = r * (1 - 0.6 * t * t) * 1.04; k.c(sh(col, 0.94)).cyl(u, y + h * t - 0.4, v, rr, rr, 0.6, 4, { top: false }); }
    k.c(sh(col, 0.97)).lathe(u, y + h, v, [[r * 0.3, 0], [r * 0.48, r * 0.1], [r * 0.5, r * 0.2], [r * 0.44, r * 0.3], [r * 0.24, r * 0.36]], 32, (a) => 1 + 0.08 * Math.cos(a * 24), 'amal:' + r);
    k.c(GOLD).lathe(u, y + h + r * 0.36, v, [[0.6, 0], [1.3, 0.7], [1.1, 1.6], [0.4, 2.1], [0.25, 3.2], [0, 3.8]], 12, null, 'kalash');
    if (flag) { k.c('#d8d8d8').cyl(u + 1.2, y + h, v, 0.12, 0.1, r * 0.9 + 6, 5); }
    return y + h + r * 0.36 + 3.8;
  }
  /** South Indian gopuram: tiered tapering tower with a barrel-vault crown and kalashas */
  function gopuram(md, u, y, v, w, d, h, tiers, cols, door) {
    const k = md.k, bh = h * 0.28;
    k.c(cols[0]).box(u - w / 2, y, v - d / 2, u + w / 2, y + bh, v + d / 2);
    if (door) k.c('#3a2a20').fx(0, 0, 0).front(u - w * 0.14, u + w * 0.14, y, y + bh * 0.8, v + d / 2 + 0.05);
    let ww = w * 0.94, dd = d * 0.92, yy = y + bh;
    const th = (h - bh) * 0.86 / tiers;
    for (let t = 0; t < tiers; t++) {
      const c = cols[(t + 1) % cols.length];
      k.c(c).box(u - ww / 2, yy, v - dd / 2, u + ww / 2, yy + th, v + dd / 2);
      k.c(sh(c, 1.08)).box(u - ww / 2 - 0.4, yy + th - 0.6, v - dd / 2 - 0.4, u + ww / 2 + 0.4, yy + th, v + dd / 2 + 0.4);
      const n = Math.max(2, Math.round(ww / 3.4));
      for (let i = 0; i < n; i++) { const cu = u - ww / 2 + (i + 0.5) * (ww / n); k.c(sh(c, i % 2 ? 0.9 : 1.1)).box(cu - 0.6, yy + 0.6, v + dd / 2, cu + 0.6, yy + th - 1, v + dd / 2 + 0.7); }
      yy += th; ww *= 0.84; dd *= 0.8;
    }
    // shala (barrel vault) crown + kalashas
    const top = (h - bh) * 0.14;
    const m = TMP.m2.makeRotationZ(PI / 2).setPosition(u, yy, v);
    k.c(cols[1]).geo(cached('gopv', () => { const g = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, 0, PI); return g; }), m.scale(TMP.sv.set(top, ww, dd / 2)));
    const n = Math.max(3, Math.round(ww / 3));
    for (let i = 0; i < n; i++) k.c(GOLD).cyl(u - ww / 2 + (i + 0.5) * (ww / n), yy + top * 0.9, v, 0.5, 0.15, 2, 6);
    k.fx(0, 0, 0);
  }
  def('birla_mandir', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, base = 20;
    rockMound(k, 0, -2, hl * 0.98, base + 2, hv * 0.98, '#8a8076', 'naubat');
    // marble terrace with a balustrade, steps down the front
    k.c(MARBLE_SH).fx(0, 0, FL_MON).box(-hl + 4, base - 3, -hv + 4, hl - 4, base, hv - 6);
    balustrade(k, -hl + 4, -hv + 4, hl - 4, hv - 6, base, 2.2, MARBLE);
    k.c(MARBLE_SH);
    for (let i = 0; i < 10; i++) { const t = i / 10; k.box(-5, 0, hv - 6 + t * 6, 5, base * (1 - t), hv - 6 + (t + 0.1) * 6, { back: false }); }
    // sanctum + the great curvilinear tower, two side shrines, the pillared mandapa, the white gopuram
    k.c(MARBLE).fx(0, 0, FL_MON).box(-9, base, -20, 9, base + 16, -4);
    shikhara(k, 0, base + 16, -12, 9.5, 40, MARBLE, true);
    for (const s of [-1, 1]) { k.c(MARBLE).box(s * 18 - 5, base, -18, s * 18 + 5, base + 10, -8); shikhara(k, s * 18, base + 10, -13, 5.2, 19, MARBLE); }
    k.c(MARBLE).box(-11, base, -4, 11, base + 1.2, 10);
    for (const cu of [-10, -5, 0, 5, 10]) for (const cv of [-2, 4, 9]) k.c(MARBLE).cyl(cu, base + 1.2, cv, 0.9, 0.8, 11, 8);
    k.c(MARBLE_SH).box(-12, base + 12.2, -5, 12, base + 13.4, 11);
    k.c(MARBLE).cyl(0, base + 13.4, 3, 9, 1.4, 8, 4).cyl(0, base + 21.4, 3, 1.6, 0.2, 3, 8);
    gopuram(md, 0, base, 15, 16, 7, 34, 5, [MARBLE, '#f7f5f0', MARBLE_SH], true);
    k.fx(0, 0, 0);
    md.light(0, base + 8, hv + 10, '#fff2d8', 1.0, 110);
  }, { anim: true });
  def('birla_planetarium', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2;
    // the white hemispherical dome on its drum at the front, the science museum block behind
    k.c('#e8e6e0').fx(0, 0, FL_CIV).cyl(0, 0, 4, 21, 21, 11, 32);
    k.c('#f8f8f4').cyl(0, 11, 4, 22, 22, 1.2, 32).lathe(0, 12.2, 4, scaleProf(DOMEP, 20.5, 19), 32, null, 'planet');
    k.c(GOLD).cyl(0, 31.2, 4, 0.7, 0.2, 2.6, 8);
    k.c('#f2f0ea').box(-hl + 2, 0, -hv + 2, hl - 2, 18, -12);
    k.c('#3a4650').fx(2, 140, 0).wall(-hl + 4, -12, hl - 4, -12, 3, 15).fx(0, 0, FL_CIV);
    parapet(k, -hl + 2, -hv + 2, hl - 2, -12, 18, 1.6, 0.6, '#ffffff');
    // entrance porch on the drum with the name board
    k.c('#ffffff').box(-9, 0, 22, 9, 9, 28);
    k.c('#3a4650').fx(2, 160, 0).front(-6, 6, 0.5, 7, 28.05).fx(0, 0, FL_CIV);
    md.sign('BIRLA PLANETARIUM', -12, 12, 9.4, 13.2, 28.1, '#1d4e8a', '#ffffff');
    k.fx(0, 0, 0);
  }, { anim: true });

  /* ---------------------------------------------------------------- Buddha in Hussain Sagar, Tank Bund statues + lamps */
  def('buddha_statue', (md, lm) => {
    const k = md.k, W = '#ecebe5', S = '#d8d6ce';
    rockMound(k, 0, 0, 17, 5, 17, '#8a8278', 'buddha:rock');
    k.c('#9a948a').fx(0, 0, 60).cyl(0, 0, 0, 14, 14, 3, 8).c('#aaa49a').cyl(0, 3, 0, 11, 11, 4, 8).c('#b8b2a8').cyl(0, 7, 0, 8.6, 8.6, 3, 8);
    k.c(S).fx(0, 0, FL_MON).lathe(0, 10, 0, [[5.6, 0], [7.6, 2.2], [8.6, 4.4], [7.4, 6]], 36, (a, j) => (j >= 2 ? 0.86 + 0.14 * Math.abs(Math.cos(a * 6)) : 1), 'buddha:lotus');
    // the robed standing figure (slightly flattened front-to-back)
    const robe = [[4.4, 0], [4.9, 4], [4.6, 14], [4.3, 26], [4.6, 38], [5.6, 48], [6.6, 54], [6.8, 56.5], [5.6, 58.6], [2.6, 60]];
    k.c(W).geo(latheGeo(robe, 28, (a) => 1 + 0.03 * Math.cos(a * 11), 'buddha:robe'), TMP.m2.makeScale(1, 1, 0.74).setPosition(0, 16, 0));
    k.c(S).geo(latheGeo([[4.0, 0], [4.6, 0.6], [4.6, 1.4], [4.0, 2]], 24, null, 'buddha:hem'), TMP.m2.makeScale(1, 1, 0.74).setPosition(0, 16, 0));
    k.c(W).cyl(0, 75.5, 0, 1.8, 1.6, 2.6, 12).sphere(0, 81, 0, 3.4, 4.0, 3.5, 14, 10).sphere(0, 85, -0.3, 2.3, 1.6, 2.3, 12, 6).sphere(0, 86.6, -0.4, 1.2, 1.0, 1.2, 8, 6);
    for (const s of [-1, 1]) k.box(s * 3.4 - 0.4, 78, -0.6, s * 3.4 + 0.4, 82.5, 0.6);
    // right hand raised in blessing (abhaya), left hand holding the robe
    k.c(W).bar(-6.2, 72, 0, -7.6, 62, 2.2, 2.0).bar(-7.6, 62.4, 2.2, -7.2, 70.4, 5.0, 1.7);
    k.box(-8.4, 70, 4.4, -6.2, 74.6, 5.6);
    k.bar(6.2, 72, 0, 6.6, 58, 1.5, 2.0).bar(6.6, 58, 1.5, 5.2, 50, 3.2, 1.7);
    k.fx(0, 0, 0);
    md.light(0, 20, 30, '#fff4e0', 1.0, 110);
  }, { anim: true });
  // Tank Bund: bronze figures of Telugu greats on tall stone plinths, flanked by heritage lamps
  function tbStatue(md, lm) {
    const k = md.k, rng = U.rng(lm.id), BZ = pick(rng, ['#6f5536', '#5f6a50', '#6a5a42']);
    k.c('#a8a094').fx(0, 0, 0).box(-4.2, 0, -4.2, 4.2, 2.4, 4.2);
    k.c('#c2baa8').fx(0, 0, 70).box(-3.2, 2.4, -3.2, 3.2, 24, 3.2);
    k.c('#d8d0c0').box(-3.7, 22.4, -3.7, 3.7, 24.6, 3.7).box(-3.7, 2.4, -3.7, 3.7, 4, 3.7);
    k.c('#b8902a').fx(0, 60, 0).front(-1.8, 1.8, 11, 14, 3.25).fx(0, 0, 60);
    // the figure (pose varies)
    const pose = lm.idx % 3;
    k.c(BZ).fx(0, 0, 90).lathe(0, 24.6, 0, [[1.9, 0], [2.1, 3], [1.8, 7], [1.6, 9.6], [2.2, 11.2], [1.0, 12.4]], 14, null, 'tb:body');
    k.sphere(0, 38.2, 0, 1.25, 1.45, 1.3, 10, 8);
    if (pose === 0) { k.bar(-2, 35.6, 0, -2.6, 41, 1.2, 0.8).bar(2, 35.6, 0, 2.4, 30.4, 0.8, 0.8); }
    else if (pose === 1) { k.bar(-2, 35.6, 0, -2.4, 30.6, 1.0, 0.8).bar(2, 35.6, 0, 1.6, 32.6, 2.2, 0.8).box(0.4, 32, 1.8, 3, 34.4, 2.6); }
    else { k.bar(-2, 35.6, 0, -2.8, 30.6, 0.6, 0.8).bar(2, 35.6, 0, 2.8, 30.6, 0.6, 0.8); k.sphere(0, 39.4, 0, 1.4, 0.6, 1.4, 8, 4); }
    k.fx(0, 0, 0);
    for (const s of [-1, 1]) lampPost(md, s * 12, 2, 17, { globes: 3, light: s > 0 });
  }
  def('tank_bund_statue', tbStatue, { cls: 'statue' });
  // Kakatiya Kala Thoranam replica: two carved pillars, an ornate lintel with a pointed crest
  def('kakatiya_arch', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, Ht = D.Ht, S = '#b8a48a';
    k.c(S).fx(0, 0, FL_CIV);
    for (const s of [-1, 1]) {
      const u = s * (hl - 3);
      k.box(u - 2.6, 0, -2.6, u + 2.6, 3, 2.6);
      for (let y = 3; y < Ht * 0.68; y += 6) { k.c(sh(S, y % 12 ? 1.06 : 0.94)).box(u - 2, y, -2, u + 2, y + 5.4, 2); k.c(sh(S, 1.12)).box(u - 2.4, y + 5.4, -2.4, u + 2.4, y + 6, 2.4); }
    }
    k.c(sh(S, 1.05)).box(-hl, Ht * 0.68, -2.4, hl, Ht * 0.68 + 3, 2.4);
    md.px(-hl, Ht * 0.68, -2.4, hl, Ht * 0.68 + 12, 2.4).px(-hl, 0, -2.6, -hl + 6, Ht * 0.68, 2.6).px(hl - 6, 0, -2.6, hl, Ht * 0.68, 2.6);
    k.c(S).slab(-hl + 1, 1.6, hl - 1, 1.6, 3.2, cached('kak:' + D.L, () => {
      const L = D.L - 2, s = new THREE.Shape(), y0 = Ht * 0.68 + 3;
      s.moveTo(0, y0); s.lineTo(L, y0); s.lineTo(L, y0 + 3);
      s.quadraticCurveTo(L * 0.8, y0 + 4, L * 0.62, y0 + 7); s.lineTo(L / 2, y0 + 12); s.lineTo(L * 0.38, y0 + 7); s.quadraticCurveTo(L * 0.2, y0 + 4, 0, y0 + 3); s.lineTo(0, y0);
      s.holes.push(circHole(L / 2, y0 + 5.2, 1.6, 10));
      return ext(s, 3.2, 8);
    }));
    for (const s of [-1, 1]) k.c('#c8b498').sphere(s * (hl * 0.62), Ht * 0.68 + 4.6, 0, 1.6, 1.2, 1.0, 8, 6);
    k.fx(0, 0, 0);
  }, { anim: true });
  def('statue', (md, lm) => {
    const k = md.k, BZ = '#5a5a4a';
    k.c('#c8c0b0').fx(0, 0, 70).box(-4, 0, -4, 4, 6, 4).c('#d8d0c0').box(-4.6, 6, -4.6, 4.6, 7, 4.6);
    // seated figure with a staff (Gandhi)
    k.c(BZ).box(-2.6, 7, -2.2, 2.6, 9.6, 2.2).lathe(0, 9.6, 0, [[2.2, 0], [2.0, 3.4], [1.4, 4.6], [0.6, 5]], 12, null, 'gandhi').sphere(0, 15.6, 0, 1.0, 1.15, 1.05, 10, 8);
    k.box(-2.4, 7, 2, 2.4, 8.4, 3.4).bar(2.6, 7, 3, 2.6, 16, 3, 0.35);
    k.fx(0, 0, 0);
  }, { anim: true });
  def('gun_park', (md, lm) => {
    const k = md.k, Ht = 39;
    k.c('#c8beb0').fx(0, 0, FL_CIV).box(-7, 0, -7, 7, 2, 7).box(-5, 2, -5, 5, 4, 5);
    k.c('#e8e2d6').lathe(0, 4, 0, [[3.2, 0], [2.6, 6], [2.2, 20], [1.6, Ht - 8], [0.4, Ht - 4]], 8, null, 'gunpark');
    k.c('#d8a020').fx(0, 160, 0).sphere(0, Ht - 2, 0, 1.4, 2.2, 1.4, 10, 8).fx(0, 0, 0);
    md.glow(0, Ht - 2, 0, '#ffb050', 'gM');
  }, { anim: true });

  /* ---------------------------------------------------------------- Mozamjahi Market */
  def('mozamjahi_market', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, G = '#a59e95', GT = '#bdb6ac', h = 18;
    // single-storey granite arcade ring round a courtyard
    for (let i = 0; i < 4; i++) {
      md.at(0, 0, md.F.rot + (i ? PI / 2 : 0));
      k.c(G).fx(0, 0, FL_CIV).slab(-hl, hl, hl, hl, 2.4, cached('mz:arc:' + D.L, () => {
        const n = 7, ops = []; for (let j = 0; j < n; j++) { const c = (j + 0.5) * (D.L / n); ops.push({ x0: c - 3.2, x1: c + 3.2, ys: 9, ya: 13 }); }
        return ext(wallShape(D.L, 0, h, ops, 6, merlonTop(D.L, h, 2.4, 2, 0.7)), 2.4, 6);
      }));
      k.c('#4a3e34').fx(1, 90, 0).wall(-hl + 2.4, hl - 9, hl - 2.4, hl - 9, 0, h - 2).fx(0, 0, 0);
      k.c(GT).hq(-hl + 2.4, hl - 9, hl - 2.4, hl - 2.4, h - 2, true);
    }
    md.at(0, 0, rotFor(lm));
    k.c('#b8b0a4').hq(-hl, -hv, hl, hv, h - 0.1);
    // the octagonal two-storey clock tower over the front entrance
    const tv = hv - 6, tr = 9;
    k.c(GT).fx(0, 0, FL_CIV).cyl(0, 0, tv, tr, tr, 22, 8).c(G).cyl(0, 22, tv, tr * 0.86, tr * 0.86, 14, 8);
    k.c(GT).cyl(0, 21.5, tv, tr + 0.8, tr + 0.8, 1.4, 8).cyl(0, 36, tv, tr * 0.95, tr * 0.95, 1.4, 8);
    for (let i = 0; i < 4; i++) { const F = md.F, r0 = F.rot; md.at(F.X(0, tv), F.Z(0, tv), r0 + i * PI / 2); clockFace(md, 0, 29, tr * 0.86 * 0.93, 3.4); md.at(0, 0, r0); }
    drumDome(k, 0, 37.4, tv, tr * 0.7, 1.4, 7, G, GT, DOMEP);
    k.c('#3a3028').fx(0, 0, 0).front(-3, 3, 0, 12, tv + tr * 0.93);
    md.sign('MOZAMJAHI MARKET', -14, 14, 13, 16.5, hv + 0.4, '#1f6a4a', '#ffffff');
    k.fx(0, 0, 0);
    md.light(0, 8, hv + 12, '#ffd9a0', 0.9, 80);
  }, { anim: true });

  /* ---------------------------------------------------------------- railway stations */
  function stationSign(md, text, u, y, v, w) { md.sign(text, u - w / 2, u + w / 2, y, y + Math.min(6, w / 5), v, '#f2c230', '#1a1a1a'); }
  def('railway_station', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, fp = md.part('facLit'), ST = H.STYLE, v = lm.variant;
    if (v === 'kachiguda') {
      // Gothic (1916): long arcaded block, central gabled porch, twin towers with domes and pinnacles
      const W = '#ead2a4', T = '#f8ecd2', h = 30;
      fp.c(W).fac(ST.arch, ST.arcade, 120, 21, 2); facWalls(fp, -hl + 4, -hv + 10, hl - 4, hv - 10, 0, h, 8);
      k.c('#e2cc9e').fx(0, 0, FL_CIV).hq(-hl + 4, -hv + 10, hl - 4, hv - 10, h);
      crestRect(k.c(T), -hl + 4, -hv + 10, hl - 4, hv - 10, h - 0.4, 1.4, 2.6, 1.6);
      for (const s of [-1, 1]) {
        const u = s * (hl - 9);
        fp.c(W).fac(ST.arch, ST.arch, 90, 22, 3); facWalls(fp, u - 7, hv - 18, u + 7, hv - 4, 0, 51, 5);
        k.c(T).box(u - 7.8, 50, hv - 18.8, u + 7.8, 52, hv - 3.2);
        crestRect(k, u - 7, hv - 18, u + 7, hv - 4, 51.6, 1.2, 2, 1.4);
        drumDome(k, u, 52, hv - 11, 5.4, 3, 8, W, T, ONION);
        for (const [cu, cv] of [[u - 7, hv - 18], [u + 7, hv - 18], [u - 7, hv - 4], [u + 7, hv - 4]]) { k.c(T).cyl(cu, 0, cv, 1.2, 0.9, 56, 8); k.cyl(cu, 56, cv, 1.0, 0.1, 4, 8); }
      }
      // central entrance with a pointed gable
      k.c(T).slab(-12, hv - 6, 12, hv - 6, 4, cached('kg:porch', () => ext(wallShape(24, 0, 34, [{ x0: 6, x1: 18, ys: 14, ya: 23 }], 8, [[0, 34], [12, 44], [24, 34]]), 4, 8)));
      for (const s of [-1, 1]) { k.cyl(s * 12, 0, hv - 8, 1.4, 1.0, 46, 8); }
      stationSign(md, 'KACHEGUDA', 0, 26, hv - 5.6, 18);
    } else if (v === 'secunderabad') {
      const W = '#e8d8b8', T = '#f8f0dc', h = 30;
      fp.c(W).fac(ST.arch, ST.arcade, 120, 23, 2); facWalls(fp, -hl + 2, -hv + 8, hl - 2, hv - 8, 0, h, 8);
      k.c('#ddd0b4').fx(0, 0, FL_CIV).hq(-hl + 2, -hv + 8, hl - 2, hv - 8, h);
      crestRect(k.c(T), -hl + 2, -hv + 8, hl - 2, hv - 8, h - 0.4, 1.4, 2.4, 1.8);
      fp.c(W).fac(ST.arch, ST.arch, 120, 24, 3); facWalls(fp, -14, -hv + 8, 14, hv - 2, 0, 46, 7);
      crestRect(k.c(T), -14, -hv + 8, 14, hv - 2, 45.6, 1.4, 2.4, 1.8);
      for (const [cu, cv] of [[-14, hv - 2], [14, hv - 2], [-14, -hv + 8], [14, -hv + 8]]) chhatri(k, cu, 46, cv, 2.6, 8, T, T);
      drumDome(k, 0, 46, 6, 7, 2, 8, W, T, ONION);
      for (const s of [-1, 1]) for (const u of [s * 40, s * 70]) chhatri(k, u, h, hv - 9, 2.2, 7, T, T);
      porch(md, 0, hv - 8, 26, 8, 14, { kind: 'arch', col: T });
      stationSign(md, 'SECUNDERABAD', 0, 34, hv - 1.6, 24);
    } else {
      // Nampally (Hyderabad Deccan): domed central hall, arched wings
      const W = '#e8c8a0', T = '#f8ecd8', h = 27;
      fp.c(W).fac(ST.arch, ST.arcade, 120, 25, 2); facWalls(fp, -hl + 2, -hv + 8, hl - 2, hv - 8, 0, h, 8);
      k.c('#ddc8a8').fx(0, 0, FL_CIV).hq(-hl + 2, -hv + 8, hl - 2, hv - 8, h);
      balustrade(k, -hl + 2, -hv + 8, hl - 2, hv - 8, h, 2.4, T);
      fp.c(W).fac(ST.arch, ST.arch, 120, 26, 3); facWalls(fp, -16, -hv + 8, 16, hv - 3, 0, 40, 7);
      k.c(T).box(-17, 39, -hv + 7, 17, 41, hv - 2);
      drumDome(k, 0, 41, 2, 10, 4, 11, W, '#f4e8d0', DOMEP);
      for (const [cu, cv] of [[-16, hv - 3], [16, hv - 3]]) chhatri(k, cu, 41, cv, 2.6, 8, T, T);
      porch(md, 0, hv - 8, 24, 8, 15, { kind: 'arch', col: T });
      stationSign(md, 'HYDERABAD', 0, 30, hv - 2.6, 20);
    }
    k.fx(0, 0, 0);
    // platform canopy behind the building
    const pc = md.k;
    pc.c('#7a5a48');
    for (let u = -hl + 6; u <= hl - 6; u += 14) pc.box(u - 0.5, 0, -hv - 0.5, u + 0.5, 12, -hv + 0.5, { top: false });
    pc.c('#a8644a').box(-hl + 2, 12, -hv - 4, hl - 2, 13, -hv + 6);
    md.light(0, 8, hv + 16, '#ffe0b0', 0.9, 90);
  }, { anim: true });
  def('halt_station', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2;
    k.c('#e8d8b8').box(-hl * 0.4, 0, -hv + 2, hl * 0.4, 14, hv - 2);
    k.c('#3a3a40').front(-2, 2, 0, 8, hv - 1.95);
    k.c('#a8644a').box(-hl * 0.45, 14, -hv + 1, hl * 0.45, 15, hv - 1);
    k.c('#7a5a48'); for (let u = -hl + 3; u <= hl - 3; u += 10) k.box(u - 0.4, 0, -hv + 1, u + 0.4, 11, -hv + 1.8, { top: false });
    k.c('#a8644a').box(-hl, 11, -hv - 2, hl, 11.8, -hv + 5);
    stationSign(md, (lm.name || '').replace(/\s*\(.*\)/, '').toUpperCase(), 0, 15.5, hv - 0.9, Math.min(D.L * 0.8, 30));
  }, { lod: 'mid' });

  /* ---------------------------------------------------------------- LB Stadium (cricket match venue) */
  const LB_SEAT = ['#2a6ab8', '#d8402a', '#e8b830'];
  const CROWD = ['#e8402a', '#f2c230', '#2a5cb8', '#f4efe2', '#2a8c82', '#e07a2e', '#d24d57', '#7a3db8', '#f4f2ee', '#3a8a3a'];
  /** a raked stand in its own frame: front (field side, low) at v = +hd, back (high) at v = -hd */
  function stand(md, hl, hd, top, roof, crowdOn) {
    const k = md.k, rows = 9, rng = U.rng('lb:' + hl + ':' + hd + ':' + md.F.ox);
    const yOf = (i) => 2.4 + (top - 2.4) * (i / rows);
    const vOf = (i) => hd - (2 * hd) * (i / rows);
    k.c('#b9b3a8').fx(0, 0, 0);
    // risers + treads (seats in tier colours)
    for (let i = 0; i < rows; i++) {
      const y0 = i ? yOf(i) : 0, y1 = yOf(i + 1), va = vOf(i), vb = vOf(i + 1);
      k.c('#c9c3b8').wall(-hl, va, hl, va, y0, y1);
      const tier = Math.min(2, Math.floor((i / rows) * 3));
      k.c(LB_SEAT[tier]).hq(-hl, vb, hl, va, y1);
      k.c(sh(LB_SEAT[tier], 0.75)).box(-hl, y1, va - 0.5, hl, y1 + 0.8, va - 0.1, { top: false });
    }
    // back wall (street side) with vents + entrance tunnels, side walls following the rake
    k.c('#e2dccf').wall(hl, -hd, -hl, -hd, 0, top + 2.4);
    for (let u = -hl + 6; u < hl - 4; u += 12) {
      k.c('#4a4640').q(u + 3.2, 0, -hd - 0.05, u + 0.8, 0, -hd - 0.05, u + 0.8, 7, -hd - 0.05, u + 3.2, 7, -hd - 0.05);
      k.c('#cfc8ba').box(u - 1.2, 0, -hd - 1.0, u - 0.2, top + 2.4, -hd);
      k.c('#3a4a5a').fx(1, 120, 0).q(u + 4.6, 13, -hd - 0.05, u + 1.8, 13, -hd - 0.05, u + 1.8, 18, -hd - 0.05, u + 4.6, 18, -hd - 0.05).fx(0, 0, 0);
    }
    k.c('#2a5cb8').box(-hl, top - 1.2, -hd - 0.4, hl, top + 0.4, -hd);
    k.c('#c9c3b8').box(-hl, top, -hd, hl, top + 2.4, -hd + 1.2);
    for (const s of [-1, 1]) {
      const u = s * hl;
      if (s > 0) k.q(u, 0, hd, u, 0, -hd, u, top + 2.4, -hd, u, 2.4, hd); else k.q(u, 0, -hd, u, 0, hd, u, 2.4, hd, u, top + 2.4, -hd);
    }
    if (roof) {
      k.c('#9aa0a6');
      for (let u = -hl + 4; u <= hl - 3; u += 14) k.box(u - 0.7, top + 2.4, -hd + 0.2, u + 0.7, top + 16, -hd + 1.6, { top: false });
      md.part('kit2').c('#b8bec4').q(-hl, top + 16, -hd, hl, top + 16, -hd, hl, top + 12.5, hd * 0.6, -hl, top + 12.5, hd * 0.6);
    }
    // match-day crowd on the treads
    md.sub = 'match';
    const kc = md.part('kit');
    for (let i = 1; i < rows; i++) {
      const y = yOf(i + 1), v = (vOf(i) + vOf(i + 1)) / 2;
      for (let u = -hl + 1.2; u < hl - 1; u += 2.1) {
        if (rng.next() > 0.78) continue;
        kc.c(pick(rng, CROWD)).box(u - 0.6, y, v - 0.5, u + 0.6, y + 2.6, v + 0.5, { back: false });
        kc.c(pick(rng, ['#3a2418', '#4a2e1c', '#2a1a12'])).box(u - 0.4, y + 2.6, v - 0.35, u + 0.4, y + 3.4, v + 0.35, { back: false });
      }
    }
    md.sub = null;
    void crowdOn;
  }
  function floodTower(md, u, v, fu, fv, h) {
    const k = md.k, s0 = 2.6, s1 = 1.3;
    k.c('#8a8e94').fx(0, 0, 0);
    const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) { const [a, b] = P[i]; k.bar(u + a * s0, 0, v + b * s0, u + a * s1, h, v + b * s1, 0.55); }
    for (let y = 0; y < h - 4; y += 7) {
      const t0 = y / h, t1 = (y + 7) / h, r0 = s0 + (s1 - s0) * t0, r1 = s0 + (s1 - s0) * t1;
      for (let i = 0; i < 4; i++) { const [a, b] = P[i], [c, d] = P[(i + 1) % 4]; k.bar(u + a * r0, y, v + b * r0, u + c * r1, y + 7, v + d * r1, 0.25); }
    }
    // lamp bank facing the field
    const ang = Math.atan2(fv - v, fu - u), ca = Math.cos(ang), sa = Math.sin(ang);
    const px = -sa, pz = ca, bw = 8, bh = 6;
    const cx = u + ca * 1.6, cz = v + sa * 1.6;
    md.k2.c('#5a5e64').q(cx - px * bw, h, cz - pz * bw, cx + px * bw, h, cz + pz * bw, cx + px * bw + ca * 0.4, h + bh, cz + pz * bw + sa * 0.4, cx - px * bw + ca * 0.4, h + bh, cz - pz * bw + sa * 0.4);
    md.k2.q(cx + px * bw - ca * 0.8, h, cz + pz * bw - sa * 0.8, cx - px * bw - ca * 0.8, h, cz - pz * bw - sa * 0.8, cx - px * bw - ca * 0.4, h + bh, cz - pz * bw - sa * 0.4, cx + px * bw - ca * 0.4, h + bh, cz + pz * bw - sa * 0.4);
    const lamps = [];
    for (let i = -3; i <= 3; i++) for (let j = 0; j < 3; j++) lamps.push([cx + px * i * 2.2 + ca * 0.5, h + 1 + j * 2, cz + pz * i * 2.2 + sa * 0.5]);
    k.c('#f4f8ff').fx(2, 120, 0);
    for (const [x, y, z] of lamps) k.box(x - 0.8, y - 0.7, z - 0.8, x + 0.8, y + 0.7, z + 0.8);
    k.fx(0, 0, 0);
    md.sub = 'match';
    for (const [x, y, z] of lamps) md.glow(x + ca * 0.6, y, z + sa * 0.6, '#f4f8ff', 'gM');
    md.glow(cx + ca * 3, h + 3, cz + sa * 3, '#e8f2ff', 'gL');
    md.sub = null;
    md.light(cx + ca * 30, h - 30, cz + sa * 30, '#f4f8ff', 1.4, 160);
  }
  def('lb_stadium', (md, lm) => {
    md.at(0, 0, 0);
    const cx = lm.x, cy = lm.y, top = 27;
    const fp0 = (N.WORLD_DATA.parks || []).find((p) => p.id === 'lb_stadium_field');
    const fr = fp0 ? polyBox(fp0.poly) : [lm.x - lm.w * 0.34, lm.y - lm.d * 0.355, lm.w * 0.68, lm.d * 0.71];
    for (const s of lm.solids || []) {
      const [x, y, w, d] = s, u = x + w / 2 - cx, v = y + d / 2 - cy;
      const fieldDir = (y + d <= fr[1] + 1) ? 's' : (y >= fr[1] + fr[3] - 1) ? 'n' : (x + w <= fr[0] + 1) ? 'e' : 'w';
      const rot = { s: 0, n: PI, e: PI / 2, w: -PI / 2 }[fieldDir];
      const along = fieldDir === 's' || fieldDir === 'n' ? w : d, deep = fieldDir === 's' || fieldDir === 'n' ? d : w;
      md.at(u, v, rot);
      stand(md, along / 2, deep / 2, top, fieldDir === 'w', true);
    }
    md.at(0, 0, 0);
    const k = md.k, x0 = -lm.w / 2, y0 = -lm.d / 2;
    // the west gate with the stadium name, the scoreboard over the north stand
    const gx = -lm.w / 2 - 5;
    k.c('#d8d2c6').box(gx, 0, -26, gx + 6, 30, -22).box(gx, 0, 22, gx + 6, 30, 26).box(gx, 24, -26, gx + 6, 30, 26);
    md.at(gx, 0, -PI / 2); md.sign('LAL BAHADUR STADIUM', -22, 22, 25, 29.4, 0.1, '#1d4e8a', '#ffffff');
    md.sub = 'match'; md.sign('U-12 FINAL TODAY', -16, 16, 16, 20.5, 0.15, '#f2c230', '#b22b2b'); md.sub = null;
    md.at(0, 0, 0);
    const sb = -lm.d / 2;
    k.c('#2a2a2e').box(-24, 29, sb - 2, 24, 46, sb + 2).c('#4a4a50').box(-2, 0, sb - 2, 2, 29, sb);
    md.at(0, sb + 2, 0); md.sign('LB STADIUM', -20, 20, 38, 44, 0.05, '#1a1a1a', '#f2c230'); md.sign('FATEH MAIDAN', -20, 20, 31, 36.5, 0.05, '#1a1a1a', '#ffffff');
    md.at(0, 0, 0);
    // the pitch: stumps + creases are painted; sight screens at both ends
    const pc = 0;
    k.c('#f4f2ee');
    for (const s of [-1, 1]) {
      for (const du of [-0.6, 0, 0.6]) k.box(pc + du - 0.15, 0, s * 10.4 - 0.15, pc + du + 0.15, 2.6, s * 10.4 + 0.15, { top: false });
      k.box(-14, 0, s * 74 - 0.6, 14, 14, s * 74 + 0.6);
    }
    for (const [tu, tv] of [[x0 + 8, y0 + 8], [-x0 - 8, y0 + 8], [x0 + 8, -y0 - 8], [-x0 - 8, -y0 - 8]]) floodTower(md, tu, tv, 0, 0, 92);
    md.ticks.push((dt, h, obj, u) => {
      const on = !!(N.flags && (N.flags.lb_match || N.flags.lb_match_day));
      if (u.match !== on) { u.match = on; if (u.subs.match) u.subs.match.visible = on; }
      u.lightsOn = on && h.night > 0.05;
    });
  }, { anim: true });
  def('stadium', (md, lm, D) => {
    // Gachibowli (2002): elliptical bowl with a white cantilever roof over the main stand and four masts
    const k = md.k, rx = D.L / 2 - 4, rz = D.D / 2 - 4, n = 28, top = 34;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      const P = (a, s) => [Math.cos(a) * rx * s, Math.sin(a) * rz * s];
      const [o0u, o0v] = P(a0, 1), [o1u, o1v] = P(a1, 1), [i0u, i0v] = P(a0, 0.62), [i1u, i1v] = P(a1, 0.62);
      md.k2.c('#e2e2de').q(o1u, 0, o1v, o0u, 0, o0v, o0u, top, o0v, o1u, top, o1v);
      md.k2.c(i % 2 ? '#2a5cb8' : '#d8402a').q(i0u, 3, i0v, i1u, 3, i1v, o1u, top, o1v, o0u, top, o0v);
      if (Math.sin((a0 + a1) / 2) < -0.35) md.part('kit2').c('#f4f4f2').q(o0u * 1.02, top + 12, o0v * 1.02, o1u * 1.02, top + 12, o1v * 1.02, o1u * 0.7, top + 8, o1v * 0.7, o0u * 0.7, top + 8, o0v * 0.7);
    }
    for (const [u, v] of [[-rx * 0.8, -rz * 0.8], [rx * 0.8, -rz * 0.8], [-rx * 0.8, rz * 0.8], [rx * 0.8, rz * 0.8]]) floodTower(md, u, v, 0, 0, 80);
    md.sign('GMC BALAYOGI STADIUM', -30, 30, 8, 13, rz + 4.2, '#2a5cb8', '#ffffff');
  }, { anim: true });

  /* ---------------------------------------------------------------- Golconda: walls, gates, Bala Hissar, tombs, baradari */
  const FORT = '#9a8a72', FORT_DK = '#857660', FORT_LT = '#b0a088';
  def('fort_wall', (md, lm) => {
    const k = md.k, horiz = lm.w >= lm.d, L = horiz ? lm.w : lm.d, h = (lm.h || 28) * VS;
    const walls = N.WORLD_DATA.landmarks.filter((l) => l.draw === 'fort_wall');
    const fcx = walls.reduce((a, l) => a + l.x, 0) / walls.length, fcy = walls.reduce((a, l) => a + l.y, 0) / walls.length;
    const out = horiz ? Math.sign(lm.y - fcy) || 1 : Math.sign(lm.x - fcx) || 1;
    // frame: u along the wall, +v = outside
    md.at(0, 0, horiz ? (out > 0 ? 0 : PI) : (out > 0 ? PI / 2 : -PI / 2));
    const hl = L / 2, t = 5;
    k.c(FORT).fx(0, 0, FL_CIV * 0.6).box(-hl, 0, -t, hl, h, t);
    for (let y = 6; y < h - 3; y += 6) k.c(y % 12 ? FORT_DK : FORT_LT).box(-hl, y - 0.5, t, hl, y, t + 0.3, { top: false });
    k.c(FORT_LT).slab(-hl, t, hl, t, 1.2, cached('fw:crest:' + L, () => ext(crestShape(L, h, h + 1.2, 3.6, 2.6, 1.0, null), 1.2, 3)));
    // semicircular bastions every ~70 u on the outside
    const nb = Math.max(1, Math.round(L / 70));
    for (let i = 0; i < nb; i++) {
      const u = -hl + (i + 0.5) * (L / nb);
      k.c(FORT).cyl(u, 0, t, 9, 8.2, h + 4, 16);
      k.c(FORT_LT);
      for (let j = 0; j < 12; j++) { const a = (j / 12) * PI, cu = u + Math.cos(a) * 7.8, cv = t + Math.sin(a) * 7.8; k.box(cu - 1, h + 4, cv - 1, cu + 1, h + 7.2, cv + 1); }
    }
    k.fx(0, 0, 0);
  }, { anim: true });
  def('fort_gate', (md, lm, D) => {
    const k = md.k, L = Math.max(lm.w, lm.d), T = Math.min(lm.w, lm.d), h = (lm.h || 44) * VS, hl = L / 2;
    md.at(0, 0, lm.w >= lm.d ? 0 : PI / 2);
    k.c(FORT).fx(0, 0, FL_CIV).slab(-hl, T / 2, hl, T / 2, T, cached('fg:' + L + ':' + h, () => ext(wallShape(L, 0, h, [{ x0: hl - 9, x1: hl + 9, ys: h * 0.42, ya: h * 0.66 }], 10, merlonTop(L, h, 4, 3, 1.2)), T, 10)));
    md.px(-hl - T * 0.6, 0, -T / 2, -9, h + 3, T / 2).px(9, 0, -T / 2, hl + T * 0.6, h + 3, T / 2).px(-9, h * 0.6, -T / 2, 9, h, T / 2);
    for (const s of [-1, 1]) { k.c(FORT_DK).cyl(s * hl, 0, 0, T * 0.62, T * 0.55, h + 3, 16); k.c(FORT_LT); for (let j = 0; j < 10; j++) { const a = (j / 10) * TAU; k.box(s * hl + Math.cos(a) * T * 0.5 - 1, h + 3, Math.sin(a) * T * 0.5 - 1, s * hl + Math.cos(a) * T * 0.5 + 1, h + 6.4, Math.sin(a) * T * 0.5 + 1); } }
    // the great wooden doors standing open, studded with iron spikes against elephants
    for (const s of [-1, 1]) {
      const u0 = s * 9, F = md.F;
      k.c('#5a3a22').box(Math.min(u0, u0 - s * 1.2), 0, -T / 2 + 1, Math.max(u0, u0 - s * 1.2), h * 0.5, T / 2 - 1);
      k.c('#3a3a3e');
      for (let y = 4; y < h * 0.48; y += 4) for (let vv = -T / 2 + 3; vv < T / 2 - 2; vv += 4) k.geo(cylGeo(0.5, 0, 1.6, 5), TMP.m2.makeRotationZ(s > 0 ? PI / 2 : -PI / 2).setPosition(u0 - s * 2.0, y, vv));
      void F;
    }
    k.fx(0, 0, 0);
    md.light(0, 10, T, '#ffd9a0', 0.8, 70);
  }, { anim: true });
  def('golconda_bala_hissar', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, base = 26;
    rockMound(k, 0, 0, hl * 0.98, base + 4, hv * 0.98, '#8f8679', 'balahissar');
    k.c(FORT_DK).box(-28, base - 4, -18, 28, base, 18);
    // the three-storey arched baradari pavilion
    for (let i = 0; i < 4; i++) {
      md.at(0, 0, i * PI / 2);
      const half = i % 2 ? 18 : 26, off = i % 2 ? 26 : 18;
      k.c(FORT_LT).fx(0, 0, FL_MON).slab(-half, off, half, off, 2.6, cached('bh:' + half, () => {
        const ops = [], n = Math.round(half / 6); for (let j = 0; j < n; j++) { const c = (j + 0.5) * (half * 2 / n); ops.push({ x0: c - 2.6, x1: c + 2.6, ys: 6, ya: 9.4 }); }
        const s = wallShape(half * 2, 0, 26, ops, 5, merlonTop(half * 2, 26, 2.6, 2, 0.8));
        for (let j = 0; j < n; j++) { const c = (j + 0.5) * (half * 2 / n); s.holes.push(archHole(c - 2, c + 2, 13, 18, 21, 4)); }
        return ext(s, 2.6, 5);
      }), base);
      md.at(0, 0, 0);
    }
    k.c('#4a3e32').fx(0, 0, 40).box(-22, base, -14, 22, base + 24, 14);
    k.c(FORT).hq(-26, -18, 26, 18, base + 25.8);
    k.c('#d8d8d8').cyl(10, base + 26, 0, 0.3, 0.25, 18, 6);
    md.part('kit2').c('#f08a24').q(10, base + 43.6, 0, 17, base + 43.6, 0, 17, base + 39, 0, 10, base + 39, 0);
    k.fx(0, 0, 0);
    md.light(0, base + 10, hv + 10, '#ffd9a0', 0.8, 90);
  }, { anim: true });
  def('taramati_baradari', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2;
    k.c(FORT_DK).fx(0, 0, FL_CIV).box(-hl, 0, -hv, hl, 4, hv);
    for (let i = 0; i < 4; i++) {
      md.at(0, 0, i * PI / 2);
      const half = i % 2 ? hv - 4 : hl - 4, off = i % 2 ? hl - 4 : hv - 4;
      k.c(FORT_LT).slab(-half, off, half, off, 2.4, cached('tb:' + half.toFixed(1), () => {
        const ops = [], n = 3; for (let j = 0; j < n; j++) { const c = (j + 0.5) * (half * 2 / n); ops.push({ x0: c - 3.6, x1: c + 3.6, ys: 14, ya: 22 }); }
        return ext(wallShape(half * 2, 4, 36, ops, 6, merlonTop(half * 2, 36, 2.6, 2, 0.8)), 2.4, 6);
      }));
      md.at(0, 0, 0);
    }
    k.c('#5a4c3e').box(-hl + 8, 4, -hv + 8, hl - 8, 34, hv - 8);
    k.c(FORT).hq(-hl + 4, -hv + 4, hl - 4, hv - 4, 35.8);
    k.fx(0, 0, 0);
  }, { anim: true });
  def('qutb_tomb', (md, lm, D) => {
    const k = md.k, s = Math.min(lm.w, lm.d) / 2, Ht = D.Ht, rng = U.rng(lm.id);
    const G = pick(rng, ['#a8a08f', '#9f9886', '#aca594']), GL = sh(G, 1.12), DM = sh(G, 0.78);
    // raised terrace with steps, two-storey arcaded base, crest + corner minarets, drum, bulbous dome
    k.c(sh(G, 0.85)).fx(0, 0, FL_MON * 0.7).box(-s, 0, -s, s, 5, s);
    const b = s * 0.74, bh = Ht * 0.42;
    for (let i = 0; i < 4; i++) {
      md.at(0, 0, i * PI / 2);
      k.c(G).slab(-b, b, b, b, 3, cached('qt:' + b.toFixed(1) + ':' + bh.toFixed(0), () => {
        const n = Math.max(3, Math.round(b / 7)) | 1, ops = [], pw = (2 * b) / n;
        for (let j = 0; j < n; j++) { const c = (j + 0.5) * pw; ops.push({ x0: c - pw * 0.32, x1: c + pw * 0.32, ys: 5 + bh * 0.24, ya: 5 + bh * 0.4 }); }
        const sh2 = wallShape(2 * b, 5, bh, ops, 6, merlonTop(2 * b, bh, 2.6, 2, 0.8));
        for (let j = 0; j < n; j++) { const c = (j + 0.5) * pw; sh2.holes.push(archHole(c - pw * 0.28, c + pw * 0.28, 5 + bh * 0.52, 5 + bh * 0.72, 5 + bh * 0.84, 5)); }
        return ext(sh2, 3, 6);
      }));
      md.at(0, 0, 0);
    }
    k.c('#4a4238').fx(0, 0, 30).box(-b + 3, 5, -b + 3, b - 3, bh - 1, b - 3);
    k.c(sh(G, 0.92)).fx(0, 0, FL_MON * 0.7).hq(-b, -b, b, b, bh - 0.5);
    for (const [cu, cv] of [[-b, -b], [b, -b], [-b, b], [b, b]]) { k.c(GL).cyl(cu, 5, cv, 1.8, 1.4, bh + 6 - 5, 10); k.lathe(cu, bh + 6, cv, scaleProf(ONION, 1.7, 3.4), 10, null, 'qt:m'); }
    const r = b * 0.72;
    k.c(G).cyl(0, bh - 0.5, 0, r * 1.02, r, Ht * 0.12, 20, { top: false });
    k.c('#3a8a8a').cyl(0, bh - 0.5 + Ht * 0.1, 0, r * 1.03, r * 1.03, 1.2, 20, { top: false });
    k.c(GL).lathe(0, bh - 0.5 + Ht * 0.12, 0, [[r * 0.9, 0], [r * 1.18, r * 0.12], [r * 1.0, r * 0.24]], 32, (a, j) => (j === 2 ? 0.88 + 0.12 * Math.abs(Math.cos(a * 8)) : 1), 'qt:pet:' + r.toFixed(1));
    k.c(DM).lathe(0, bh - 0.5 + Ht * 0.12 + r * 0.1, 0, scaleProf(ONION, r * 1.08, Ht - (bh + Ht * 0.12 + r * 0.1)), 24, null, 'qt:dome:' + r.toFixed(1) + ':' + Ht.toFixed(0));
    k.c(GOLD).fx(0, 0, 0).cyl(0, Ht - 0.6, 0, 0.5, 0.1, 4, 6);
  }, { anim: true });
  def('paigah_tombs', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, W = '#f4f2ec';
    for (let i = 0; i < 4; i++) {
      md.at(0, 0, md.F.rot + i * PI / 2);
      const half = i % 2 ? hv : hl, off = i % 2 ? hl : hv;
      k.c(W).fx(0, 0, FL_CIV).slab(-half, off, half, off, 1.6, cached('pg:' + half, () => {
        const s = wallShape(half * 2, 0, 14, null, 4, merlonTop(half * 2, 14, 2, 1.6, 0.6));
        for (let x = 2; x < half * 2 - 3; x += 3) s.holes.push(archHole(x, x + 1.8, 3, 9, 11, 3));
        return ext(s, 1.6, 4);
      }));
      md.at(0, 0, md.F.rot - i * PI / 2);
    }
    for (const [u, v] of [[-hl * 0.5, 0], [hl * 0.5, 0], [0, -hv * 0.4]]) { k.c(W).box(u - 7, 0, v - 7, u + 7, 12, v + 7); chhatri(k, u, 12, v, 5.2, 12, W, W); }
    for (const [u, v] of [[-hl, -hv], [hl, -hv], [-hl, hv], [hl, hv]]) chhatri(k, u, 14, v, 2.2, 7, W, W);
    k.fx(0, 0, 0);
  }, { anim: true });

  /* ---------------------------------------------------------------- Cyber Towers (curved ringed glass), HITEX */
  def('cyber_towers', (md, lm, D) => {
    const k = md.k, fp = md.part('fac'), ST = H.STYLE, Ht = D.Ht, rO = 46, rI = 17, gap = 0.12, segs = 7;
    const floors = Math.round(Ht / 15);
    fp.c('#5a8a98').fac(ST.glass, ST.glass, 150, 31, floors);
    for (let q = 0; q < 4; q++) {
      const a0 = q * PI / 2 + gap, a1 = (q + 1) * PI / 2 - gap;
      for (let i = 0; i < segs; i++) {
        const b0 = a0 + (a1 - a0) * (i / segs), b1 = a0 + (a1 - a0) * ((i + 1) / segs);
        // outer glass (A->B clockwise seen from above so the normal points outwards)
        fp.wall(Math.cos(b1) * rO, Math.sin(b1) * rO, Math.cos(b0) * rO, Math.sin(b0) * rO, 6, Ht, 0, 2, 0, (Ht - 6) / 15);
        fp.wall(Math.cos(b0) * rI, Math.sin(b0) * rI, Math.cos(b1) * rI, Math.sin(b1) * rI, 6, Ht, 0, 1, 0, (Ht - 6) / 15);
        md.k2.c('#d8dde0').q(Math.cos(b0) * rI, Ht, Math.sin(b0) * rI, Math.cos(b1) * rI, Ht, Math.sin(b1) * rI, Math.cos(b1) * rO, Ht, Math.sin(b1) * rO, Math.cos(b0) * rO, Ht, Math.sin(b0) * rO);
      }
      for (const a of [a0, a1]) { const c = Math.cos(a), s = Math.sin(a); md.k2.c('#c8cdd2').q(c * rI, 6, s * rI, c * rO, 6, s * rO, c * rO, Ht, s * rO, c * rI, Ht, s * rI); }
    }
    // the white rings wrapping the drum + podium + crown
    k.c('#f2f4f4');
    for (let y = 6 + 15 * 2; y < Ht - 4; y += 30) k.cyl(0, y - 1.2, 0, rO + 1.6, rO + 1.6, 2.2, 40);
    k.c('#e8eaec').cyl(0, 0, 0, rO + 4, rO + 4, 6, 40);
    k.c('#f2f4f4').cyl(0, Ht, 0, rO + 3, rO + 3, 2.4, 40, { top: false }).cyl(0, Ht + 2.4, 0, rO + 3, rO, 0.5, 40);
    k.c('#9aa4ac').cyl(0, Ht, 0, 8, 6, 10, 12);
    k.c('#c8ccd0').cyl(0, Ht + 10, 0, 0.6, 0.2, 18, 6);
    k.c('#ff3a2a').fx(0, 255, 0).sphere(0, Ht + 28, 0, 0.8, 0.8, 0.8, 6, 4).fx(0, 0, 0);
    md.glow(0, Ht + 28, 0, '#ff4030', 'gM');
    md.sign('CYBER TOWERS', -16, 16, 6.6, 11.6, rO + 4.3, '#1d4e8a', '#ffffff');
    md.light(0, 10, rO + 20, '#e0f0ff', 0.9, 90);
  }, { anim: true });
  def('exhibition_hall', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2;
    civic(md, lm, D, Object.assign({}, CIV.exhibition_hall, { h: 24 }));
    // the curved space-frame roof
    const n = 10, rr = 14;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, y0 = 24 + Math.sin(PI * t0) * rr, y1 = 24 + Math.sin(PI * t1) * rr;
      md.part('kit2').c(i % 2 ? '#d8dce0' : '#c8ccd2').q(-hl + 4, y0, -hv + 4 + t0 * (2 * hv - 8), hl - 4, y0, -hv + 4 + t0 * (2 * hv - 8), hl - 4, y1, -hv + 4 + t1 * (2 * hv - 8), -hl + 4, y1, -hv + 4 + t1 * (2 * hv - 8));
    }
    void k;
  }, { anim: true });

  /* ---------------------------------------------------------------- Begumpet airport */
  def('airport_terminal', (md, lm, D) => {
    civic(md, lm, D, { wall: '#e6e6e2', trim: '#ffffff', win: 'glass', gf: 'glass', crest: 'low', lit: 0.7, h: 22,
      blocks: (hl, hv, h) => [[-hl, -hv, hl, hv - 8, h * 0.8], [-22, -hv, 22, hv - 8, h * 1.25]], sign: ['HYDERABAD AIRPORT', '#1d4e8a', '#ffffff'] });
    const k = md.k, hl = D.L / 2, hv = D.D / 2;
    k.c('#c9ccd0');
    for (let u = -hl + 8; u <= hl - 8; u += 12) k.cyl(u, 0, hv - 1.5, 0.6, 0.6, 11, 8);
    k.c('#e2e4e8').box(-hl + 6, 11, hv - 9, hl - 6, 12.4, hv);
  }, { anim: true });
  def('control_tower', (md, lm) => {
    const k = md.k, Ht = 78;
    k.c('#e8e6e0').fx(0, 0, 0).box(-9, 0, -9, 9, 10, 9).cyl(0, 10, 0, 4.6, 4, Ht - 24, 12);
    k.c('#e8e6e0').cyl(0, Ht - 14, 0, 4, 8.6, 3, 8);
    k.c('#2a4a5a').fx(2, 180, 0).cyl(0, Ht - 11, 0, 8.6, 9.6, 7, 8, { top: false }).fx(0, 0, 0);
    k.c('#d8dad8').cyl(0, Ht - 4, 0, 10, 10, 1.2, 8).cyl(0, Ht - 2.8, 0, 7, 5, 2, 8);
    k.c('#c8c8c8').cyl(0, Ht - 0.8, 0, 0.3, 0.2, 12, 5);
    k.c('#ff3a2a').fx(0, 255, 0).sphere(0, Ht + 11.4, 0, 0.7, 0.7, 0.7, 6, 4).fx(0, 0, 0);
    md.glow(0, Ht + 11.4, 0, '#ff4030', 'gM');
  }, { anim: true });
  def('aeroplane', (md, lm) => {
    const k = md.k, W = '#f4f4f2', S = '#c8302a', O = '#f08a24';
    md.at(0, 0, 0);
    // fuselage along x (nose east), wings, tailplane, fin, two engines: an Indian Airlines 737 in white/red/orange
    k.c(W).fx(0, 0, 0).geo(cached('plane:fus', () => new THREE.CylinderGeometry(3.2, 3.2, 38, 14).rotateZ(PI / 2)), TMP.m2.makeTranslation(0, 6, 0));
    k.geo(cached('plane:nose', () => new THREE.SphereGeometry(3.2, 12, 8, 0, TAU, 0, PI / 2).rotateZ(-PI / 2).scale(1.9, 1, 1)), TMP.m2.makeTranslation(19, 6, 0));
    k.geo(cached('plane:tail', () => new THREE.ConeGeometry(3.2, 9, 14).rotateZ(PI / 2)), TMP.m2.makeTranslation(-23.5, 6.6, 0));
    k.c(S).geo(cached('plane:str', () => new THREE.CylinderGeometry(3.25, 3.25, 38, 14, 1, true, PI * 0.42, PI * 0.16).rotateZ(PI / 2)), TMP.m2.makeTranslation(0, 6, 0));
    k.c('#2a3a4a').box(19.6, 6.8, -1.6, 21, 7.8, 1.6);
    k.c('#d8dad8').prism([[4, -3], [-6, -22], [-10, -22], [-4, -3]], 4.6, 5.4).prism([[4, 3], [-4, 3], [-10, 22], [-6, 22]], 4.6, 5.4);
    k.prism([[-22, -1], [-27, -9], [-29, -9], [-27, -1]], 7.4, 7.9).prism([[-22, 1], [-27, 1], [-29, 9], [-27, 9]], 7.4, 7.9);
    k.c(O).q(-21, 9, 0, -27, 9, 0, -30, 19, 0, -27.5, 19, 0).q(-27, 9, 0, -21, 9, 0, -27.5, 19, 0, -30, 19, 0);
    k.c('#9aa0a6');
    for (const s of [-1, 1]) k.geo(cylGeo(1.6, 1.6, 6, 10), TMP.m2.makeRotationZ(PI / 2).setPosition(1, 3.2, s * 9));
    k.c('#2a2a2a'); for (const [u, v] of [[14, 0], [-2, -3], [-2, 3]]) k.cyl(u, 0, v, 0.9, 0.9, 3, 8);
    k.c('#3a4a5a').fx(1, 120, 0); for (let u = -16; u < 16; u += 2.4) for (const s of [-1, 1]) k.box(u, 6.6, s * 3.15 - 0.05, u + 1.1, 7.8, s * 3.15 + 0.05);
    k.fx(0, 0, 0);
    md.glow(-8, 5, -22, '#ff3020'); md.glow(-8, 5, 22, '#30ff60'); md.glow(-30, 19.4, 0, '#ffffff');
  }, { anim: true });

  /* ---------------------------------------------------------------- cinemas + painted film hoardings */
  const CINE = { sandhya: { name: 'SANDHYA 70MM', wall: '#e4e6ea', acc: '#2a5cb8' }, sudarshan: { name: 'SUDARSHAN 35MM', wall: '#efe2c8', acc: '#8a1a2a' }, odeon: { name: 'ODEON', wall: '#f0e6d0', acc: '#1f6a4a' }, devi: { name: 'DEVI 70MM', wall: '#f2dcd0', acc: '#b22b2b' } };
  const FILMS = ['TOOFAN TAMMUDU', 'MASS MAHARAJU', 'GULLY SIMHAM', 'PREMA PANDAGA', 'RANGULA PATANG', 'JAI HYDERABAD', 'CHARMINAR CHINNODU', 'MEGHA GARJANA'];
  /** a painted film board (textured, floodlit at night) on the plane facing +v */
  function filmBoard(md, title, u0, u1, y0, y1, v) {
    const k = md.k;
    k.c('#3a3a40').fx(0, 0, 0).box(u0 - 0.5, y0 - 0.5, v - 0.6, u1 + 0.5, y1 + 0.5, v - 0.05);
    md.part('film:' + title, filmMat(title)).c('#ffffff').front(u0, u1, y0, y1, v, [0, 0, 1, 1]);
    for (const u of [u0 + 1, (u0 + u1) / 2, u1 - 1]) { k.c('#2a2a2e').box(u - 0.3, y1 + 0.5, v - 0.3, u + 0.3, y1 + 2.2, v + 1.6); md.glow(u, y1 + 1.6, v + 1.6, '#fff6d8', 'gM'); }
  }
  def('cinema', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, rng = U.rng(lm.id), V = CINE[lm.variant] || {};
    const wall = V.wall || pick(rng, ['#efe6d4', '#e8e0d8', '#f0dcc8', '#e0e4e8']), acc = V.acc || pick(rng, ['#b22b2b', '#2a5cb8', '#1f6a4a', '#7a1a5a']);
    const Ht = Math.min(D.Ht, 48), pd = Math.min(16, D.D * 0.28);
    // the hall (blank sides with exhaust louvres) + projection room on the roof
    k.c(wall).fx(0, 0, 0).box(-hl, 0, -hv, hl, Ht, hv - pd, { front: false });
    k.c(sh(wall, 0.9)).wall(-hl, hv - pd, hl, hv - pd, 0, Ht);
    for (let v = -hv + 6; v < hv - pd - 4; v += 8) for (const s of [-1, 1]) md.k2.c('#7a7a80').q(s * hl + s * 0.05, Ht * 0.55, v + (s > 0 ? 3 : 0), s * hl + s * 0.05, Ht * 0.55, v + (s > 0 ? 0 : 3), s * hl + s * 0.05, Ht * 0.7, v + (s > 0 ? 0 : 3), s * hl + s * 0.05, Ht * 0.7, v + (s > 0 ? 3 : 0));
    k.c(wall).box(-6, Ht, -hv + 4, 6, Ht + 7, -hv + 14);
    // entrance block under the hoardings, a deep canopy, the queue cage and cycle stand
    const cw = Math.min(D.L * 0.6, 44);
    k.c(wall).box(-cw / 2, 0, hv - pd, cw / 2, 18, hv - 1);
    k.c('#3a4650').fx(1, 200, 0).front(-cw / 2 + 2, cw / 2 - 2, 0.5, 9, hv - 0.95).fx(0, 0, 0);
    k.c(acc).box(-cw / 2 - 1, 9, hv - 2, cw / 2 + 1, 10.4, hv + 4.5);
    md.sign(lm.sign || V.name || (lm.name || 'TALKIES').toUpperCase(), -cw / 2, cw / 2, Ht - 8, Ht - 1.5, hv - pd + 0.4, acc, '#fff4d8');
    const films = (lm.films && lm.films.length ? lm.films : [pick(rng, FILMS)]).slice(0, 2);
    const bw = (cw - 2 - (films.length - 1) * 1.5) / films.length;
    for (let i = 0; i < films.length; i++) { const u0 = -cw / 2 + 1 + i * (bw + 1.5); filmBoard(md, films[i], u0, u0 + bw, 19, 19 + Math.min(16, bw * 0.62), hv - 0.2); }
    k.c('#8a9098');
    for (let i = 0; i <= 3; i++) k.bar(hl - 18, 3, hv - 1 + i * 1.6 - 6, hl - 2, 3, hv - 1 + i * 1.6 - 6, 0.2);
    // chasing marquee bulbs on the canopy edge
    for (let u = -cw / 2; u <= cw / 2; u += 1.6) md.glow(u, 10.6, hv + 4.6, rng.next() < 0.5 ? '#ffe070' : '#ff7040');
    md.light(0, 8, hv + 10, '#ffe0a0', 1.0, 80);
  }, { anim: true });
  def('film_hoarding', (md, lm) => {
    const k = md.k, long = lm.w >= lm.d, t = lm.film || (lm.films && lm.films[0]) || 'JAI HYDERABAD';
    md.at(0, 0, long ? 0 : PI / 2);
    const bw = Math.max(Math.max(lm.w, lm.d), 30), bh = 20, h = 30;
    for (const s of [-1, 1]) {
      const u = s * bw * 0.36;
      k.c('#8a8680').box(u - 1.4, 0, -1.4, u + 1.4, 2, 1.4);
      k.c('#5a5a62').box(u - 0.9, 2, -0.5, u - 0.5, h, -0.1).box(u + 0.5, 2, -0.5, u + 0.9, h, -0.1);
      for (let y = 5; y < h - 1; y += 6) k.bar(u - 0.7, y, -0.3, u + 0.7, y + 5, -0.3, 0.3);
    }
    k.c('#6a6a72').box(-bw / 2, h - 0.6, -0.4, bw / 2, h, 2.2);
    filmBoard(md, t, -bw / 2, bw / 2, h, h + bh, 0.6);
    md.at(0, 0, (long ? 0 : PI / 2) + PI);
    filmBoard(md, pick(U.rng(lm.id), FILMS), -bw / 2, bw / 2, h, h + bh, 0.05);
  }, { anim: true });

  /* ---------------------------------------------------------------- bus termini, MGBS, the Gowliguda hangar (+ parked APSRTC buses) */
  const BUS_SLOTS = {
    koti_bus_stand: [[4404, 3252, 0, 'city', '8A'], [4440, 3287, 180, 'city', '127K']],
    rathifile_bus_station: [[5330, 1027, 0, 'city', '5K']],
    mehdipatnam_bus_terminus: [[2205, 2748, 0, 'city', '49M'], [2269, 2748, 0, 'city', '219']],
    imlibun_bus_station: [[4220, 3503, -90, 'express', 'KURNOOL'], [4248, 3503, -90, 'deluxe', 'WARANGAL'], [4352, 3503, -90, 'luxury', 'TIRUPATI'], [4380, 3503, -90, 'express', 'VIJAYAWADA']],
    cbs_hangar: [[4232, 3328, 0, 'city', '9X'], [4268, 3364, 180, 'city', '65G']],
  };
  const LIVERY = { city: ['#b22b2b', '#d6d0c2'], express: ['#b22b2b', '#e8d070'], deluxe: ['#7a1a2a', '#efe6cf'], luxury: ['#e8ecf0', '#2a5cb8'] };
  function parkedBus(md, lm, b) {
    if (Math.abs(b[0] - lm.x) > lm.w / 2 + 40 || Math.abs(b[1] - lm.y) > lm.d / 2 + 40) return; // the map moved: skip stale slots
    const L = LIVERY[b[3]] || LIVERY.city, a = (b[2] * PI) / 180, F = md.F, r0 = F.rot, ox = F.ox, oz = F.oz;
    md.at(b[0] - lm.x + ox, b[1] - lm.y + oz, PI / 2 - (a + PI / 2));
    const k = md.k;
    // local: u along the bus (front at +u), v across
    k.c(L[0]).fx(0, 0, 0).box(-31, 2.2, -8.6, 31, 9, 8.6).box(-31, 15.6, -8.6, 31, 18.4, 8.6);
    k.c(L[1]).box(-30.6, 18.4, -8.2, 30.6, 19.4, 8.2).box(-31, 9, -8.62, 31, 10.2, 8.62, { top: false });
    k.c('#2a3640').fx(1, 70, 0).box(-30, 10.2, -8.5, 30, 15.6, 8.5, { top: false }).fx(0, 0, 0);
    k.c(L[0]); for (let u = -28; u < 30; u += 7) k.box(u - 0.5, 10.2, -8.66, u + 0.5, 15.6, 8.66, { top: false });
    k.c('#1a1a1a'); for (const u of [-20, 20]) for (const s of [-1, 1]) k.geo(wheelGeo(3, 1.4), TMP.m2.makeTranslation(u, 3, s * 8.2));
    k.c('#f4f0e4').box(30.9, 15.8, -5, 31.2, 18, 5);
    md.sign(b[4], -9, 9, 15.9, 18.1, 8.66, '#1a1a1a', '#ffd23a');
    md.at(ox, oz, r0);
  }
  def('bus_terminus', (md, lm, D) => {
    md.at(0, 0, 0);
    const k = md.k, s = (lm.solids && lm.solids[0]) || [lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, 8];
    const horiz = s[2] >= s[3];
    const into = horiz ? Math.sign(lm.y - (s[1] + s[3] / 2)) || 1 : Math.sign(lm.x - (s[0] + s[2] / 2)) || 1;
    // frame: u along the shelter, +v = into the bays
    const cx = s[0] + s[2] / 2 - lm.x, cz = s[1] + s[3] / 2 - lm.y, len = horiz ? s[2] : s[3];
    md.at(cx, cz, horiz ? (into > 0 ? 0 : PI) : (into > 0 ? PI / 2 : -PI / 2));
    const hl = len / 2;
    k.c('#d8d0c0').box(-hl, 0, -3, hl, 13, 1);
    k.c('#c0b8a8').box(-hl, 0, 1, hl, 0.6, 16);
    k.c('#b22b2b');
    for (let u = -hl + 4; u <= hl - 3; u += 12) k.box(u - 0.6, 0, 13.4, u + 0.6, 13, 14.6, { top: false });
    k.c('#9aa0a6').box(-hl - 1, 13, -3.4, hl + 1, 14, 17);
    md.px(-hl - 1, 12.6, -3.4, hl + 1, 16.2, 17);
    k.c('#b22b2b').box(-hl - 1, 14, 15.6, hl + 1, 16.2, 17);
    k.c('#8a7a6a').box(-hl + 3, 3, 0.6, hl - 3, 3.6, 3);
    const boards = ['SECUNDERABAD', 'CHARMINAR', 'MEHDIPATNAM', 'KOTI', 'AFZALGUNJ', 'TARNAKA', 'BHEL', 'DILSUKHNAGAR'];
    const nb = Math.max(2, Math.min(6, Math.floor(len / 24)));
    for (let i = 0; i < nb; i++) { const u = -hl + (i + 0.5) * (len / nb); md.sign(boards[(i + (s[0] | 0)) % boards.length], u - 8, u + 8, 10, 12.6, 1.05, '#1a3a8a', '#ffffff'); }
    md.sign((lm.name || 'BUS STAND').toUpperCase(), -18, 18, 14, 16.2, 17.05, '#b22b2b', '#ffffff');
    for (let u = -hl + 6; u < hl; u += 12) md.glow(u, 12.6, 8, '#e0f4ff', 'gM');
    md.at(0, 0, 0);
    for (const b of BUS_SLOTS[lm.id] || []) parkedBus(md, lm, b);
  }, { anim: true });
  def('mgbs', (md, lm, D) => {
    md.at(0, 0, 0);
    const k = md.k, hl = lm.w / 2, hv = lm.d / 2, fp = md.part('fac'), ST = H.STYLE;
    // terminal block (north strip) + curved canopies over the bays
    fp.c('#e8e0d0').fac(ST.rect, ST.glass, 140, 41, 2);
    facWalls(fp, -hl, -hv, hl, -hv + 34, 0, 30, 8);
    k.c('#d8d0c0').hq(-hl, -hv, hl, -hv + 34, 30);
    parapet(k, -hl, -hv, hl, -hv + 34, 30, 2.4, 0.7, '#b22b2b');
    md.at(0, -hv + 34, 0); md.sign('MAHATMA GANDHI BUS STATION', -40, 40, 22, 28, 0.4, '#b22b2b', '#ffffff'); md.at(0, 0, 0);
    const k2 = md.part('kit2');
    for (let c = 0; c < 4; c++) {
      const u0 = -hl + 8 + c * ((lm.w - 16) / 4), u1 = u0 + (lm.w - 16) / 4 - 6, um = (u0 + u1) / 2;
      for (let i = 0; i < 8; i++) {
        const t0 = i / 8, t1 = (i + 1) / 8;
        const a0 = u0 + (u1 - u0) * t0, a1 = u0 + (u1 - u0) * t1, y0 = 16 + Math.sin(PI * t0) * 6, y1 = 16 + Math.sin(PI * t1) * 6;
        k2.c(i % 2 ? '#d8dce0' : '#c8ced4').q(a0, y0, hv - 4, a1, y1, hv - 4, a1, y1, -hv + 36, a0, y0, -hv + 36);
      }
      md.px(u0, 15.6, -hv + 36, u1, 22.4, hv - 4);
      k.c('#8a9098');
      for (let v = -hv + 40; v < hv - 4; v += 14) k.cyl(um, 0, v, 0.8, 0.8, 22, 8);
      md.glow(um, 15, 0, '#e0f4ff', 'gM');
    }
    for (const b of BUS_SLOTS[lm.id] || []) parkedBus(md, lm, b);
  }, { anim: true });
  def('cbs_hangar', (md, lm) => {
    md.at(0, 0, 0);
    const k = md.k, hl = lm.w / 2, hv = lm.d / 2, n = 12;
    // the giant curved steel shed (barrel vault along x), open ends, low side walls
    k.c('#8a8a88').box(-hl, 0, -hv, hl, 10, -hv + 6).box(-hl, 0, hv - 6, hl, 10, hv);
    const k2 = md.part('kit2');
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, v0 = -hv + t0 * lm.d, v1 = -hv + t1 * lm.d;
      const y0 = 10 + Math.sin(PI * t0) * 30, y1 = 10 + Math.sin(PI * t1) * 30;
      k2.c(i % 2 ? '#a8aeb4' : '#9aa0a6').q(-hl, y0, v0, hl, y0, v0, hl, y1, v1, -hl, y1, v1);
    }
    md.px(-hl, 10, -hv, hl, 41, hv);
    k.c('#6a6e74');
    for (let u = -hl; u <= hl + 0.1; u += lm.w / 6) for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; k.bar(u, 10 + Math.sin(PI * t0) * 30, -hv + t0 * lm.d, u, 10 + Math.sin(PI * t1) * 30, -hv + t1 * lm.d, 0.6); }
    for (const b of BUS_SLOTS[lm.id] || []) parkedBus(md, lm, b);
    for (let u = -hl + 10; u < hl; u += 20) md.glow(u, 28, 0, '#e0f4ff', 'gM');
  }, { anim: true });
  def('rythu_bazaar', (md, lm, D) => {
    md.at(0, 0, 0);
    const k = md.k, hl = lm.w / 2, hv = lm.d / 2, rng = U.rng(lm.id);
    for (const [sx0, sz0] of [[-hl + 6, -hv + 6], [-hl + 6, 6]]) {
      const w = lm.w - 12, d = hv - 12;
      k.c('#8a8e94');
      for (let u = sx0; u <= sx0 + w + 0.1; u += w / 6) for (const v of [sz0, sz0 + d]) k.cyl(u, 0, v, 0.6, 0.6, 12, 6);
      md.part('kit2').c('#9aa8b0').q(sx0, 13, sz0 + d, sx0 + w, 13, sz0 + d, sx0 + w, 15, sz0 + d / 2, sx0, 15, sz0 + d / 2).q(sx0, 15, sz0 + d / 2, sx0 + w, 15, sz0 + d / 2, sx0 + w, 13, sz0, sx0, 13, sz0);
      for (let u = sx0 + 4; u < sx0 + w - 4; u += 7) {
        k.c('#7a5a3a').box(u - 2.6, 0, sz0 + d / 2 - 2, u + 2.6, 2.8, sz0 + d / 2 + 2);
        for (let j = 0; j < 3; j++) k.c(pick(rng, ['#e83a2a', '#3a9a3a', '#f2c230', '#8a3a8a', '#f08a24', '#a8c040'])).sphere(u - 1.6 + j * 1.6, 3.4, sz0 + d / 2, 1.0, 0.7, 1.4, 6, 4);
      }
    }
    md.sign('RYTHU BAZAAR', -20, 20, 15.4, 19.4, hv - 5.9, '#1f7a3a', '#ffffff');
  }, { anim: true });

  /* ---------------------------------------------------------------- places of worship (modelled plainly, with respect) */
  function templeCompound(md, hl, hv, stripes) {
    const k = md.k, h = 6, t = 1.2;
    const seg = (ua, va, ub, vb) => {
      const len = Math.hypot(ub - ua, vb - va), n = Math.max(2, Math.round(len / 1.6));
      for (let i = 0; i < n; i++) {
        const a = i / n, b = (i + 1) / n;
        k.c(stripes && i % 2 ? '#c8402a' : '#f4ede0').wall(ua + (ub - ua) * a, va + (vb - va) * a, ua + (ub - ua) * b, va + (vb - va) * b, 0, h);
      }
    };
    seg(-hl, hv, -5, hv); seg(5, hv, hl, hv); seg(hl, hv, hl, -hv); seg(hl, -hv, -hl, -hv); seg(-hl, -hv, -hl, hv);
    k.c('#f4ede0').hq(-hl, hv - t, -5, hv, h).hq(5, hv - t, hl, hv, h).hq(hl - t, -hv, hl, hv, h).hq(-hl, -hv, hl, -hv + t, h).hq(-hl, -hv, -hl + t, hv, h);
    k.c('#f4ede0').wall(-5, hv - t, -hl, hv - t, 0, h).wall(hl, hv - t, 5, hv - t, 0, h).wall(hl - t, -hv, hl - t, hv, 0, h).wall(-hl + t, hv, -hl + t, -hv, 0, h).wall(-hl, -hv + t, hl, -hv + t, 0, h);
  }
  /** Dravidian vimana: stepped pyramidal tower over a sanctum, octagonal cap + kalash */
  function vimana(k, u, v, w, y, h, cols) {
    let ww = w, yy = y;
    const tiers = 4, th = h * 0.7 / tiers;
    for (let t = 0; t < tiers; t++) { k.c(cols[t % cols.length]).box(u - ww / 2, yy, v - ww / 2, u + ww / 2, yy + th, v + ww / 2); k.c(sh(cols[t % cols.length], 1.1)).box(u - ww / 2 - 0.3, yy + th - 0.5, v - ww / 2 - 0.3, u + ww / 2 + 0.3, yy + th, v + ww / 2 + 0.3); yy += th; ww *= 0.78; }
    k.c(cols[0]).lathe(u, yy, v, scaleProf(DOMEP, ww * 0.62, h * 0.22), 8, null, 'vim:' + ww.toFixed(1) + ':' + h.toFixed(0));
    k.c(GOLD).cyl(u, yy + h * 0.22, v, 0.5, 0.12, 2.4, 6);
  }
  def('temple mahankali_temple', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, rng = U.rng(lm.id), mk = lm.draw === 'mahankali_temple';
    const named = { ashtalakshmi_temple: 1, karmanghat_hanuman_temple: 1, iskcon_abids: 1, secunderabad_ganesh_temple: 1 };
    templeCompound(md, hl, hv, true);
    k.c('#d8d0c0').box(-hl + 2, 0, -hv + 2, hl - 2, 0.4, hv - 2);
    // painted gopuram at the gate, sanctum + vimana, a mandapa with pillars
    const gcols = mk ? ['#f2d16b', '#e98a7a', '#f4b0c8', '#f2a03a'] : ['#f2d16b', '#e98a7a', '#8cc2e2', '#9ccf7a', '#f4b0c8', '#f2a03a'];
    gopuram(md, 0, 0, hv - 3, Math.min(14, D.L * 0.42), 5, Math.min(30, D.Ht * 0.9), 3, gcols, true);
    const sw = Math.min(12, D.L * 0.34);
    k.c('#f4ede0').fx(0, 0, FL_CIV * 0.6).box(-sw / 2, 0, -hv + 4, sw / 2, 9, -hv + 4 + sw);
    vimana(k, 0, -hv + 4 + sw / 2, sw, 9, Math.min(26, D.Ht * 0.75), mk ? ['#f2c230', '#e8502a'] : ['#f4ede0', '#f2d16b']);
    k.c('#f4ede0');
    for (const cu of [-5, 0, 5]) for (const cv of [-2, 4]) k.cyl(cu, 0, cv, 0.6, 0.6, 7, 6);
    k.c('#c8402a').box(-7, 7, -4, 7, 8, 6).c('#f2d16b').box(-6.6, 8, -3.6, 6.6, 8.6, 5.6);
    // a tall flag post (dhwaja stambha) and bells of marigold garlands at the gate
    k.c(GOLD).cyl(0, 0, hv - 10, 0.5, 0.35, 16, 8);
    for (let i = 0; i < 9; i++) md.glow(-6 + i * 1.5, 6.5, hv + 0.3, '#ffb040');
    if (named[lm.id] || mk) md.light(0, 8, hv + 8, '#ffd9a0', 0.8, 60);
    k.fx(0, 0, 0);
    void rng;
  }, { lod: 'mid' });
  def('sai_temple', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, W = '#f6f4ef', OR = '#f08a24';
    k.c('#d8d2c6').box(-hl, 0, -hv, hl, 1.2, hv);
    k.c(W).fx(0, 0, FL_CIV).box(-hl + 6, 1.2, -hv + 4, hl - 6, 22, 4);
    for (let u = -hl + 6; u < hl - 6; u += 4) k.c(Math.round((u + hl) / 4) % 2 ? OR : W).box(u, 20, 3.9, u + 2, 22, 4.4, { top: false });
    k.c('#3a3028').front(-5, 5, 1.2, 14, 4.05);
    shikhara(k, 0, 22, -8, 8, 22, W, true);
    k.c(GOLD).cyl(0, 22 + 22 + 2.9 + 3.8, -8, 0.3, 0.05, 2, 5);
    // the big forecourt canopy for the Thursday queues
    md.part('kit2').c('#f2a03a').q(-hl + 4, 14, hv - 2, hl - 4, 14, hv - 2, hl - 4, 16, 4, -hl + 4, 16, 4);
    k.c('#8a8e94'); for (let u = -hl + 6; u <= hl - 6; u += 10) k.cyl(u, 1.2, hv - 2.5, 0.5, 0.5, 13, 6);
    md.sign('SHRI SAI BABA MANDIR', -18, 18, 16.4, 20.6, 4.5, OR, '#ffffff');
    k.fx(0, 0, 0);
    for (let u = -hl + 6; u <= hl - 6; u += 3) md.glow(u, 14, hv - 2, '#ffd080');
    md.light(0, 10, hv, '#ffd9a0', 0.9, 70);
  }, { anim: true });
  def('mosque dargah ashurkhana', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, rng = U.rng(lm.id), Ht = D.Ht;
    const dargah = lm.draw === 'dargah', ashur = lm.draw === 'ashurkhana';
    const W = dargah ? '#f4f2ea' : ashur ? '#e8d8b8' : pick(rng, ['#f4f2ea', '#efe9da', '#e8e8e2']);
    const DM = dargah ? '#f4f2ea' : ashur ? '#2a8c82' : pick(rng, ['#3a9a5a', '#f4f2ea', '#2a8a6a']);
    const hallH = dargah ? Ht * 0.42 : Ht * 0.5;
    const ins = 3;
    k.c(sh(W, 0.85)).fx(0, 0, FL_CIV).box(-hl, 0, -hv, hl, 1.6, hv);
    const bw = dargah ? Math.min(hl, hv) * 0.62 : hl - ins, bd = dargah ? bw : hv - ins;
    const v0 = dargah ? -bd : -hv + ins, v1 = dargah ? bd : hv - ins - 5;
    k.c(W).box(-bw, 1.6, v0, bw, hallH, v1, { front: false });
    // arched front
    k.c(W).slab(-bw, v1, bw, v1, 1.6, cached('mq:front:' + bw.toFixed(1) + ':' + hallH.toFixed(0), () => {
      const n = dargah ? 1 : 3, ops = [], pw = (2 * bw) / n;
      for (let j = 0; j < n; j++) { const c = (j + 0.5) * pw, hw = Math.min(pw * 0.32, 5.5); ops.push({ x0: c - hw, x1: c + hw, ys: 1.6 + hallH * 0.42, ya: 1.6 + hallH * 0.7 }); }
      return ext(wallShape(2 * bw, 1.6, hallH, ops, 6, merlonTop(2 * bw, hallH, 2.2, 1.8, 0.7)), 1.6, 6);
    }));
    k.c(ashur ? '#2a6a8a' : '#4a3e34').fx(dargah ? 1 : 0, dargah ? 140 : 0, 0).wall(-bw + 1, v1 - 5, bw - 1, v1 - 5, 1.6, hallH - 1).fx(0, 0, FL_CIV);
    if (ashur) for (let u = -bw + 2; u < bw - 2; u += 1.6) k.c(pick(rng, ['#2a8c82', '#f2c230', '#2a5cb8', '#e8e0c8'])).fx(0, 90, 0).box(u, hallH * 0.6, v1 - 4.9, u + 1.2, hallH * 0.8, v1 - 4.6).fx(0, 0, FL_CIV);
    k.c(sh(W, 0.92)).hq(-bw, v0, bw, v1, hallH);
    // dome on a drum (+ petals), slim minarets with balconies flanking the front
    const r = dargah ? bw * 0.8 : Math.min(bw, (v1 - v0) / 2) * 0.62;
    k.c(W).cyl(0, hallH, (v0 + v1) / 2, r * 1.05, r, r * 0.35, 16, { top: false });
    k.c(DM).lathe(0, hallH + r * 0.35, (v0 + v1) / 2, scaleProf(ONION, r * 1.08, r * 1.5), 18, null, 'mq:d:' + r.toFixed(1));
    k.c(GOLD).fx(0, 0, 0).cyl(0, hallH + r * 1.85, (v0 + v1) / 2, 0.35, 0.05, 3, 6).fx(0, 0, FL_CIV);
    if (!dargah) {
      for (const s of [-1, 1]) {
        const u = s * (bw - 1.4), v = v1 - 1.4, mh = Ht * 0.95;
        k.c(W).cyl(u, 1.6, v, 1.5, 1.2, mh - 6, 10).c(sh(W, 0.9)).cyl(u, mh * 0.6, v, 2.2, 2.2, 0.7, 10).cyl(u, mh - 6, v, 1.9, 1.9, 0.6, 10);
        k.c(DM).lathe(u, mh - 5.4, v, scaleProf(ONION, 1.5, 4.4), 10, null, 'mq:m');
        md.glow(u, mh * 0.6 + 1, v, '#b8ffcf');
      }
    } else {
      for (const [cu, cv] of [[-bw, v0], [bw, v0], [-bw, v1], [bw, v1]]) chhatri(k, cu, hallH, cv, 1.6, 5, W, W);
      md.part('kit2').c('#2a8a3a').q(bw - 1, hallH + 9, v0 + 1, bw + 4, hallH + 9, v0 + 1, bw + 4, hallH + 6.4, v0 + 1, bw - 1, hallH + 6.4, v0 + 1);
      k.c('#d8d8d8').cyl(bw - 1, hallH, v0 + 1, 0.15, 0.12, 9.6, 5);
    }
    k.fx(0, 0, 0);
    md.light(0, 6, hv + 8, '#e8ffe8', 0.6, 50);
  }, { lod: 'mid' });
  def('spanish_mosque', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, W = '#f0ede6', G = '#a8a8a4';
    k.c(W).fx(0, 0, FL_CIV).box(-hl + 4, 0, -hl + 4, hl - 4, 24, hl - 4);
    crestRect(k.c(W), -hl + 4, -hl + 4, hl - 4, hl - 4, 23.6, 1.2, 2.2, 1.6);
    for (let i = 0; i < 4; i++) { md.at(0, 0, i * PI / 2); k.c('#4a4a4e').front(-4, 4, 2, 14, hl - 3.95); k.c(W).slab(-6, hl - 3.2, 6, hl - 3.2, 0.8, cached('spm:band', () => ext(archBand(6, 6, 4, 0, 10, 17, 14, 6), 0.8, 6))); }
    md.at(0, 0, 0);
    // Moorish pointed spires instead of domes
    k.c(W).box(-8, 24, -8, 8, 36, 8);
    k.c(G).lathe(0, 36, 0, [[8, 0], [6.4, 6], [3, 18], [0, 30]], 8, null, 'spm:sp');
    for (const [cu, cv] of [[-hl + 4, -hl + 4], [hl - 4, -hl + 4], [-hl + 4, hl - 4], [hl - 4, hl - 4]]) { k.c(W).cyl(cu, 0, cv, 3, 3, 34, 8); k.c(G).lathe(cu, 34, cv, [[3.4, 0], [2.4, 4], [0, 16]], 8, null, 'spm:t'); }
    k.fx(0, 0, 0);
  }, { anim: true });
  def('gurudwara', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, W = '#f8f6f0';
    k.c('#e8e4dc').box(-hl, 0, -hv, hl, 2, hv);
    k.c(W).fx(0, 0, FL_CIV).box(-hl + 6, 2, -hv + 6, hl - 6, 26, hv - 8);
    for (let i = 0; i < 4; i++) { md.at(0, 0, i * PI / 2); const half = hl - 6; for (let u = -half + 4; u < half - 3; u += 7) k.c('#3a4650').fx(1, 160, 0).front(u, u + 3, 8, 18, half + 0.05).fx(0, 0, FL_CIV); }
    md.at(0, 0, 0);
    balustrade(k, -hl + 6, -hv + 6, hl - 6, hv - 8, 26, 2.2, W);
    drumDome(k, 0, 26, -1, 10, 4, 12, W, '#f2d070', ONION);
    for (const [cu, cv] of [[-hl + 6, -hv + 6], [hl - 6, -hv + 6], [-hl + 6, hv - 8], [hl - 6, hv - 8]]) chhatri(k, cu, 26, cv, 2.6, 8, W, '#f2d070');
    // Nishan Sahib: tall saffron flag
    k.c('#d8d8d8').cyl(hl - 3, 0, hv - 3, 0.5, 0.3, 46, 8);
    md.part('kit2').c('#f08a24').q(hl - 3, 45, hv - 3, hl + 6, 41, hv - 3, hl + 6, 41, hv - 3, hl - 3, 37, hv - 3);
    k.fx(0, 0, 0);
    md.light(0, 8, hv + 6, '#ffe8c0', 0.7, 60);
  }, { anim: true });
  def('church', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, Ht = D.Ht, rng = U.rng(lm.id);
    const twin = lm.id === 'church_st_josephs';
    const W = twin ? '#f2e6d8' : pick(rng, ['#f4f0e6', '#efe4d0', '#e8dccb', '#d8b8a0']), R = pick(rng, ['#a84a3a', '#8a6a5a', '#7a8088']);
    // nave with a gable roof, pointed windows, the front tower(s) with spire(s) and a cross
    const nw = Math.min(hl - 4, 14), nh = Ht * 0.42;
    k.c(W).fx(0, 0, FL_CIV * 0.7).box(-nw, 0, -hv + 2, nw, nh, hv - 14);
    const k2 = md.k2;
    k2.c(R).fx(0, 0, FL_CIV * 0.5).q(-nw - 1, nh, hv - 14, -nw - 1, nh, -hv + 1, 0, nh + nw * 0.8, -hv + 1, 0, nh + nw * 0.8, hv - 14).q(nw + 1, nh, -hv + 1, nw + 1, nh, hv - 14, 0, nh + nw * 0.8, hv - 14, 0, nh + nw * 0.8, -hv + 1);
    k2.c(W).q(-nw, nh, -hv + 2, nw, nh, -hv + 2, 0, nh + nw * 0.8, -hv + 2, 0, nh + nw * 0.8, -hv + 2).q(-nw, nh, hv - 14, nw, nh, hv - 14, 0, nh + nw * 0.8, hv - 14, 0, nh + nw * 0.8, hv - 14);
    for (let v = -hv + 8; v < hv - 18; v += 8) for (const s of [-1, 1]) k2.c('#4a5a7a').fx(1, 150, 0).q(s * nw + s * 0.05, nh * 0.25, v + (s > 0 ? 2.4 : 0), s * nw + s * 0.05, nh * 0.25, v + (s > 0 ? 0 : 2.4), s * nw + s * 0.05, nh * 0.78, v + (s > 0 ? 0 : 2.4), s * nw + s * 0.05, nh * 0.78, v + (s > 0 ? 2.4 : 0)).fx(0, 0, FL_CIV * 0.7);
    const towers = twin ? [-nw + 4, nw - 4] : [0];
    for (const tu of towers) {
      const tw = twin ? 4.5 : 6.5, th = Ht * (twin ? 0.78 : 0.7);
      k.c(W).box(tu - tw, 0, hv - 14, tu + tw, th, hv - 14 + 2 * tw);
      k.c('#3a3a40').front(tu - tw * 0.4, tu + tw * 0.4, th * 0.7, th * 0.86, hv - 14 + 2 * tw + 0.05);
      k.c(sh(W, 1.06)).box(tu - tw - 0.6, th - 1, hv - 14.6, tu + tw + 0.6, th, hv - 13.4 + 2 * tw);
      k.c(R).cyl(tu, th, hv - 14 + tw, tw * 1.25, 0.2, Ht - th, 4);
      k.c('#e8e0c8').box(tu - 0.25, Ht, hv - 14 + tw - 0.25, tu + 0.25, Ht + 4, hv - 14 + tw + 0.25).box(tu - 1.4, Ht + 2.2, hv - 14 + tw - 0.25, tu + 1.4, Ht + 2.8, hv - 14 + tw + 0.25);
    }
    if (!twin) k.c('#3a3028').front(-2.4, 2.4, 0, 7, hv - 14 + 13 + 0.05);
    k.c('#4a5a7a').fx(1, 180, 0).vdisc(0, nh * 0.85, hv - 14 + (twin ? 0.05 : 13.05), 2.6, 0.3, 12).fx(0, 0, 0);
    md.light(0, 8, hv + 6, '#ffe8c0', 0.6, 50);
  }, { lod: 'mid' });
  def('memorial', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, W = '#f4f2ec';
    k.c('#d8d2c6').box(-hl, 0, -hv, hl, 1.2, hv).c(W).fx(0, 0, FL_CIV).box(-hl + 6, 1.2, -hv + 6, hl - 6, 3, hv - 6);
    k.c(W).box(-8, 3, -8, 8, 16, 8).c('#2a2a2a').front(-3, 3, 3, 11, 8.05);
    k.c(W).cyl(0, 16, 0, 9, 9, 1.4, 16).lathe(0, 17.4, 0, scaleProf(DOMEP, 8, 7), 16, null, 'bapu');
    k.c('#c8c0b0').cyl(-hl + 10, 3, hv - 10, 1.4, 1.0, 24, 8);
    k.fx(0, 0, 0);
  }, { anim: true });
  def('ntr_memorial', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, W = '#f4f2ec';
    k.c('#e8e4dc').fx(0, 0, FL_CIV).box(-hl, 0, -hv, hl, 2, hv).box(-hl + 4, 2, -hv + 4, hl - 4, 4, hv - 4);
    k.c(W).box(-6, 4, -6, 6, 10, 6);
    k.c('#e8dcc0').cyl(0, 10, 0, 7, 0.4, 12, 4);
    k.c(GOLD).cyl(0, 22, 0, 0.6, 0.1, 3, 6);
    md.part('water').c('#ffffff').box(-hl + 3, 1.8, hv - 7, hl - 3, 2.2, hv - 3);
    k.fx(0, 0, 0);
    // NTR Gardens around it: the Machan tree, the mini train on its loop, flower beds, two Nandis
    const D2 = N.WORLD_DATA, park = (D2.parks || []).find((p) => p.id === 'ntr_gardens');
    const hide = (D2.places || []).find((p) => p.id === 'hide_ntr_lawn');
    const pl = N.places && N.places.ntr_gardens;
    const loop = { u: 0, v: 5, rx: hl + 32, ry: hv + 16 };
    if (park) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [px, py] of park.poly) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
      const tree = hide ? [hide.x - 2, hide.y - 12] : [x0 + 50, (y0 + y1) / 2];
      md.sub = 'ntr';
      const kn = md.part('kit');
      const tu = tree[0] - lm.x, tv = tree[1] - lm.y;
      kn.c('#8a6448').cyl(tu, 0, tv, 5.2, 4.4, 50, 10);
      for (let i = 0; i < 12; i++) { const a = i * 0.9, h = 3 + i * 3.6; kn.c('#c8b090').box(tu + Math.cos(a) * 6.2 - 1, h - 0.4, tv + Math.sin(a) * 6.2 - 1, tu + Math.cos(a) * 6.2 + 1, h, tv + Math.sin(a) * 6.2 + 1); }
      for (const [h, r, ou, ov, c] of [[20, 13, -7, 5, '#3f8a34'], [32, 14, 8, -4, '#4a9a3a'], [44, 16, -2, 2, '#56a844']]) {
        kn.c('#7a5a3a').bar(tu, h - 9, tv, tu + ou, h - 1, tv + ov, 2.2);
        kn.c('#d8c8a8').cyl(tu + ou, h - 1.6, tv + ov, 7, 7, 1.2, 12);
        kn.c(c).put(H.geo.blob, tu + ou, h + 5, tv + ov, i2a(h), r, r * 0.55, r);
        md.glow(tu + ou, h + 0.6, tv + ov, '#ffd090', 'gM');
      }
      const rng = U.rng('ntr3d');
      for (let i = 0; i < 16; i++) { const px = x0 + rng.next() * (x1 - x0), py = y0 + rng.next() * (y1 - y0); const dl = Math.hypot((px - lm.x - loop.u) / loop.rx, (py - lm.y - loop.v) / loop.ry); if (dl > 0.7 && dl < 1.35) continue; if (Math.hypot(px - tree[0], py - tree[1]) < 22) continue; if (Math.abs(px - lm.x) < hl + 6 && Math.abs(py - lm.y) < hv + 6) continue; kn.c(pick(rng, ['#e83a5a', '#f2c230', '#f08a24', '#c040c0', '#f4f2ea'])).put(H.geo.blob, px - lm.x, 0.6, py - lm.y, rng.next() * 3, 5 + rng.next() * 4, 1.2, 4 + rng.next() * 3); }
      if (pl) for (const s of [-1, 1]) { const nu = pl.x + s * 12 - lm.x, nv = pl.y + 8 - lm.y; kn.c('#c8c0b0').box(nu - 2.4, 0, nv - 1.6, nu + 2.4, 1.6, nv + 1.6).c('#9a9488').sphere(nu, 3.2, nv, 2.4, 1.6, 1.3, 8, 6).sphere(nu + 2.2, 4.6, nv, 0.9, 1.0, 0.8, 6, 4); }
      // the mini train (animated round the loop by the tick)
      md.sub = 'train';
      const tk = md.part('kit');
      tk.c('#d8202a').box(-1.8, 0.4, -1.1, 1.8, 5.2, 1.1).c('#1a1a1a').box(-3.2, 5.2, -1.15, -0.4, 6.4, 1.15).cyl(2.2, 5.2, 0, 0.8, 0.8, 2, 8);
      for (let i = 1; i <= 3; i++) { const c = ['#f2c230', '#30a060', '#2a6ae8'][i - 1]; tk.c(c).box(-1.6 - i * 4.2, 0.4, -1.05, 1.6 - i * 4.2, 3.8, 1.05).c('#d8302a').box(-1.65 - i * 4.2, 5.6, -1.1, 1.65 - i * 4.2, 6, 1.1).c('#4a4a4a').box(-1.5 - i * 4.2, 3.8, -0.15, -1.3 - i * 4.2, 5.6, 0.15).box(1.3 - i * 4.2, 3.8, -0.15, 1.5 - i * 4.2, 5.6, 0.15); }
      md.sub = null;
      md.ticks.push((dt, h, obj, u) => {
        const ntrOk = !(N.placesArt && N.placesArt.variant && N.placesArt.variant('ntr_gardens') === 'construction');
        if (u.subs.ntr) u.subs.ntr.visible = ntrOk;
        const tr = u.subs.train; if (!tr) return;
        tr.visible = ntrOk;
        if (!ntrOk) return;
        const t = (N.time && N.time.real || 0) * 0.22;
        const x = loop.u + Math.cos(t) * loop.rx, z = loop.v + Math.sin(t) * loop.ry;
        const tx = -Math.sin(t) * loop.rx, tz = Math.cos(t) * loop.ry;
        tr.position.set(x, 0, z); tr.rotation.y = -Math.atan2(tz, tx);
        tr.updateMatrix();
      });
    }
    md.sub = null;
  }, { anim: true });
  function i2a(h) { return (h * 0.37) % TAU; }

  /* ---------------------------------------------------------------- Prasads IMAX (fence / open) */
  def('prasads_imax', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2;
    // OPEN: a round glass-fronted multiplex with the giant-screen drum
    md.sub = 'open';
    const ko = md.part('kit'), fp = md.part('fac'), ST = H.STYLE;
    ko.c('#e8e8ec').fx(0, 0, 0).cyl(0, 0, -6, 30, 30, 40, 32);
    ko.c('#f4f4f6').cyl(0, 40, -6, 31, 31, 2.4, 32);
    fp.c('#4a6a88').fac(ST.glass, ST.glass, 210, 51, 3);
    for (let i = 0; i < 10; i++) { const a0 = PI * 0.15 + (i / 10) * PI * 0.7, a1 = PI * 0.15 + ((i + 1) / 10) * PI * 0.7; fp.wall(Math.cos(a1) * 31.5, -6 + Math.sin(a1) * 31.5, Math.cos(a0) * 31.5, -6 + Math.sin(a0) * 31.5, 2, 38, 0, 2, 0, 36 / 15); }
    ko.c('#d8dadc').box(-hl + 4, 0, hv - 10, hl - 4, 12, hv - 2);
    md.sign('PRASADS', -16, 16, 30, 38, 25.8, '#c81a1a', '#ffffff');
    md.sign('IMAX', -6, 6, 12.5, 16.5, hv - 1.9, '#1a1a1a', '#40c0ff');
    for (let u = -hl + 6; u < hl - 4; u += 3) md.glow(u, 12.4, hv - 2, '#d8f0ff');
    md.sub = 'fence';
    // FENCE: tin sheets round a bare concrete frame + a tower crane + the COMING SOON hoarding
    const kf = md.part('kit');
    for (const [ua, va, ub, vb] of [[-hl, hv, hl, hv], [hl, hv, hl, -hv], [hl, -hv, -hl, -hv], [-hl, -hv, -hl, hv]]) {
      const len = Math.hypot(ub - ua, vb - va), n = Math.round(len / 4);
      for (let i = 0; i < n; i++) { const a = i / n, b = (i + 1) / n; md.part('kit2').c(i % 2 ? '#2a6a8a' : '#2a7a5a').wall(ua + (ub - ua) * a, va + (vb - va) * a, ua + (ub - ua) * b, va + (vb - va) * b, 0, 9); }
    }
    kf.c('#b8b4ac');
    for (let u = -hl + 10; u <= hl - 10; u += 14) for (let v = -hv + 10; v <= hv - 14; v += 14) kf.box(u - 1, 0, v - 1, u + 1, 34, v + 1, { top: false });
    for (const y of [12, 23, 34]) kf.box(-hl + 9, y - 1, -hv + 9, hl - 9, y, hv - 13);
    kf.c('#e0a820'); for (let y = 0; y < 70; y += 6) { kf.bar(hl - 8, y, -hv + 8, hl - 8, y + 6, -hv + 8, 0.6).bar(hl - 5, y, -hv + 8, hl - 5, y + 6, -hv + 8, 0.6).bar(hl - 8, y, -hv + 8, hl - 5, y + 6, -hv + 8, 0.3); }
    kf.box(hl - 50, 70, -hv + 7, hl + 6, 72, -hv + 10).c('#d8d4cc').box(hl - 9, 66, -hv + 6, hl - 4, 70, -hv + 11);
    md.sign('PRASADS - COMING SOON', -hl + 4, hl - 4, 10, 16, hv + 0.2, '#1a1a2a', '#f2c230');
    md.sign('THE GIANT SCREEN', -hl * 0.5, hl * 0.5, 16.4, 20.4, hv + 0.2, '#c81a1a', '#ffffff');
    md.sub = null;
    md.ticks.push((dt, h, obj, u) => {
      let v = N.placesArt && N.placesArt.variant ? N.placesArt.variant('prasads_imax') : null;
      if (!v) v = N.flags && N.flags.prasads_open ? 'open' : 'fence';
      const open = v === 'open' || v === 'opening';
      if (u.open === open) return;
      u.open = open;
      if (u.subs.open) u.subs.open.visible = open;
      if (u.subs.fence) u.subs.fence.visible = !open;
    });
  }, { anim: true });

  /* ---------------------------------------------------------------- towers, masts, tanks */
  def('tv_tower', (md, lm, D) => {
    const k = md.k, Ht = 120 * VS;
    k.c('#d8d4cc').fx(0, 0, 0).box(-14, 0, -14, 14, 8, 14);
    k.c('#e8e4dc').cyl(0, 8, 0, 6, 3.4, Ht * 0.62, 12);
    k.c('#cfcac2').cyl(0, Ht * 0.45, 0, 9, 9, 3, 12).cyl(0, Ht * 0.62, 0, 8, 8, 4, 12);
    for (let i = 0; i < 8; i++) { const y = Ht * 0.66 + i * (Ht * 0.04); k.c(i % 2 ? '#e83a2a' : '#f4f2ee').cyl(0, y, 0, 1.6 - i * 0.12, 1.5 - i * 0.12, Ht * 0.04, 8); }
    k.c('#9aa0a6').cyl(0, Ht * 0.98, 0, 0.4, 0.1, 10, 5);
    k.c('#ff3020').fx(0, 255, 0).sphere(0, Ht * 0.62 + 4.5, 0, 0.9, 0.9, 0.9, 6, 4).sphere(0, Ht + 8, 0, 0.7, 0.7, 0.7, 6, 4).fx(0, 0, 0);
    md.glow(0, Ht * 0.62 + 4.5, 0, '#ff3020', 'gM'); md.glow(0, Ht + 8, 0, '#ff3020', 'gM');
    md.sign('DOORDARSHAN', -10, 10, 4, 7.6, 14.05, '#1d4e8a', '#ffffff');
  }, { anim: true });
  // All India Radio mast (lattice, red and white) beside the radio station block
  def('radio_station', (md, lm, D) => {
    civic(md, lm, D, Object.assign({}, CIV.radio_station));
    const k = md.k, hl = D.L / 2, u = hl + 14, Ht = 95;
    for (let y = 0; y < Ht; y += 10) {
      const c = Math.floor(y / 10) % 2 ? '#e83a2a' : '#f4f2ee', r0 = 2.6 - (y / Ht) * 1.8, r1 = 2.6 - ((y + 10) / Ht) * 1.8;
      k.c(c);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.bar(u + a * r0, y, b * r0, u + a * r1, y + 10, b * r1, 0.35);
      k.bar(u - r0, y, -r0, u + r1, y + 10, r1, 0.2).bar(u + r0, y, -r0, u - r1, y + 10, r1, 0.2);
    }
    k.c('#ff3020').fx(0, 255, 0).sphere(u, Ht + 1, 0, 0.8, 0.8, 0.8, 6, 4).fx(0, 0, 0);
    md.glow(u, Ht + 1, 0, '#ff3020', 'gM');
  }, { anim: true });
  def('water_tank', (md, lm, D) => {
    const k = md.k, Ht = 60 * VS * 0.8, r = 11;
    k.c('#cfc8b8').fx(0, 0, 0);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; k.cyl(Math.cos(a) * 7, 0, Math.sin(a) * 7, 0.9, 0.8, Ht - 14, 6); }
    for (const y of [Ht * 0.3, Ht * 0.6]) k.c('#c8c0b0').cyl(0, y, 0, 7.8, 7.8, 0.8, 8, { top: false });
    k.c('#d8d0c0').cyl(0, Ht - 14, 0, 4, r, 6, 16, { top: false });
    k.c('#e8e2d4').cyl(0, Ht - 8, 0, r, r, 9, 16, { top: false });
    k.c('#2a5cb8').cyl(0, Ht - 4.5, 0, r + 0.1, r + 0.1, 1.4, 16, { top: false });
    k.c('#d8d0c0').lathe(0, Ht + 1, 0, scaleProf(DOMEP, r, 3.4), 16, null, 'wt:dome');
    k.c('#8a8a8a'); k.bar(7, 0, 0, 10, Ht - 8, 0, 0.3);
  }, { lod: 'mid' });
  def('giant_wheel', (md, lm) => {
    const k = md.k, R = 44, cy = 52;
    k.c('#c8c0b0').box(-14, 0, -5, 14, 1.4, 5);
    k.c('#b8c0c8');
    for (const s of [-1, 1]) { k.bar(-12, 0, s * 4, 0, cy, s * 2.4, 1.0).bar(12, 0, s * 4, 0, cy, s * 2.4, 1.0); }
    k.c('#7a8088').bar(0, cy, -3, 0, cy, 3, 1.4);
    md.sub = 'wheel';
    const kw = md.part('kit'), n = 16;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      for (const s of [-1, 1]) { kw.c(i % 2 ? '#e8402a' : '#f2c230').bar(Math.cos(a0) * R, Math.sin(a0) * R, s * 2.2, Math.cos(a1) * R, Math.sin(a1) * R, s * 2.2, 0.7); kw.c('#d8dce0').bar(0, 0, s * 2.2, Math.cos(a0) * R, Math.sin(a0) * R, s * 2.2, 0.3); }
      kw.c(pick(U.rng('gw' + i), ['#2a5cb8', '#e8402a', '#f2c230', '#2a8c82', '#e84a8a'])).box(Math.cos(a0) * R - 2, Math.sin(a0) * R - 5.6, -2, Math.cos(a0) * R + 2, Math.sin(a0) * R - 1.6, 2);
      md.glow(Math.cos(a0) * R, Math.sin(a0) * R, 2.6, i % 2 ? '#ffe070' : '#ff70c0');
      md.glow(Math.cos((a0 + a1) / 2) * R, Math.sin((a0 + a1) / 2) * R, 2.6, '#80e0ff');
    }
    md.sub = null;
    md.ticks.push((dt, h, obj, u) => {
      const w = u.subs.wheel; if (!w) return;
      if (!u.init) { u.init = true; w.position.set(0, cy, 0); }
      const open = !N.placesArt || !N.placesArt.variant || N.placesArt.variant('giant_wheel') === 'open';
      if (open) w.rotation.z += dt * 0.12;
      w.updateMatrix();
    });
  }, { anim: true });
  def('maut_ka_kuan', (md, lm, D) => {
    const k = md.k, r = Math.min(D.L, D.D) / 2 - 1, h = 30;
    const n = 28;
    for (let i = 0; i < n; i++) { const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU; k.c(i % 2 ? '#a07a4a' : '#8a6a3a').wall(Math.cos(a1) * r, Math.sin(a1) * r, Math.cos(a0) * r, Math.sin(a0) * r, 0, h); }
    k.c('#7a5a3a').cyl(0, h, 0, r + 2.4, r + 2.4, 1, 28, { top: false }).cyl(0, h + 1, 0, r + 2.4, r, 0.2, 28);
    md.part('kit2').c('#e8402a').q(-10, h + 9, r + 2.5, 10, h + 9, r + 2.5, 10, h + 3, r + 2.5, -10, h + 3, r + 2.5);
    md.sign('MAUT KA KUAN', -9, 9, h + 3.6, h + 8.4, r + 2.6, '#1a1a1a', '#f2c230');
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; md.glow(Math.cos(a) * (r + 2), h + 1.6, Math.sin(a) * (r + 2), i % 2 ? '#ffe070' : '#ff7040'); }
  }, { anim: true });
  def('numaish_gate', (md, lm, D) => {
    const k = md.k, L = Math.max(lm.w, lm.d), h = 44;
    md.at(0, 0, lm.w >= lm.d ? 0 : PI / 2);
    k.c('#f2c230').fx(0, 0, 0).slab(-L / 2, 3, L / 2, 3, 6, cached('nm:gate:' + L, () => ext(wallShape(L, 0, h, [{ x0: L / 2 - 16, x1: L / 2 + 16, ys: 22, ya: 34 }], 8, [[0, h], [L * 0.25, h + 6], [L / 2, h + 12], [L * 0.75, h + 6], [L, h]]), 6, 8)));
    k.c('#e8402a').box(-L / 2 - 1, 0, -3.6, -L / 2 + 6, h + 4, 3.6).box(L / 2 - 6, 0, -3.6, L / 2 + 1, h + 4, 3.6);
    md.px(-L / 2 - 1, 0, -3.6, -16, h + 4, 3.6).px(16, 0, -3.6, L / 2 + 1, h + 4, 3.6).px(-16, 30, -3.6, 16, h + 12, 3.6);
    md.sign('ALL INDIA INDUSTRIAL EXHIBITION', -L / 2 + 6, L / 2 - 6, 36, 41, 3.1, '#b22b2b', '#fff4d8');
    for (let i = 0; i <= 40; i++) { const t = i / 40, u = -L / 2 + t * L; md.glow(u, h + Math.sin(PI * t) * 12 + 0.6, 3.2, i % 3 ? '#ffe070' : '#ff70c0'); }
  }, { anim: true });
  def('numaish_stalls', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, rng = U.rng(lm.id);
    for (let u = -hl + 1; u < hl - 8; u += 11) {
      const c = pick(rng, ['#e8402a', '#2a5cb8', '#f2c230', '#2a8c82', '#e84a8a', '#7a3db8']);
      k.c('#e8e0d0').box(u, 0, -hv + 1, u + 10, 10, hv - 3, { front: false });
      k.c('#4a3a30').fx(1, 200, 0).wall(u + 0.5, hv - 6, u + 9.5, hv - 6, 0, 9).fx(0, 0, 0);
      md.part('kit2').c(c).q(u - 0.2, 13, hv - 3, u + 10.2, 13, hv - 3, u + 10.2, 9, hv + 1, u - 0.2, 9, hv + 1);
      md.sign(pick(rng, ['KASHMIRI SHAWLS', 'LUCKNOW CHIKAN', 'PAPAD & PICKLES', 'TOYS & GAMES', 'BANARAS SAREES', 'PRESSURE COOKERS', 'AGRA PETHA']), u + 0.5, u + 9.5, 9.6, 12.4, hv - 2.9, c, '#ffffff');
      for (let i = 0; i < 6; i++) md.glow(u + 1 + i * 1.6, 9, hv + 1, '#ffe070');
    }
  }, { anim: true });
  def('khairatabad_ganesh', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2;
    // the pandal frame (bamboo + cloth)
    k.c('#a8844a').fx(0, 0, 0);
    for (const u of [-hl + 1, hl - 1]) for (const v of [-hv + 1, hv - 1]) k.bar(u, 0, v, u, 64, v, 0.8);
    for (const y of [30, 64]) { k.bar(-hl + 1, y, hv - 1, hl - 1, y, hv - 1, 0.6).bar(-hl + 1, y, -hv + 1, hl - 1, y, -hv + 1, 0.6); }
    md.part('kit2').c('#e8402a').q(-hl, 66, hv, hl, 66, hv, hl, 66, -hv, -hl, 66, -hv);
    // the giant idol (only in the Ganesh season)
    md.sub = 'idol';
    const ki = md.part('kit'), S = '#e8a070', G2 = '#f2c230', R = '#c81a2a';
    ki.c('#f4b0c8').fx(0, 0, FL_MON).cyl(0, 0, -2, 14, 12, 6, 16);
    ki.c(R).sphere(0, 12, -2, 11, 7, 9, 12, 8);
    ki.c(S).sphere(0, 24, -2, 10, 12, 9, 14, 10);
    ki.c(G2).cyl(0, 31, -2, 9.5, 9, 3, 16);
    ki.c(S).sphere(0, 42, -2, 7, 8, 7, 12, 10);
    for (const s of [-1, 1]) { ki.c(S).sphere(s * 7.6, 43, -2.4, 4.6, 6, 1.2, 10, 8); ki.bar(s * 9, 34, -2, s * 14, 26, 3, 3).bar(s * 9, 33, -2, s * 15, 40, 1, 2.6); }
    ki.bar(0, 40, 4.8, 1.2, 33, 6.6, 2.4).bar(1.2, 33, 6.6, 3.6, 28, 5.2, 2.0);
    ki.c(G2).lathe(0, 49, -2, [[6.4, 0], [5.6, 4], [3.6, 9], [0.6, 14], [0, 16]], 14, null, 'ganesh:crown');
    ki.c('#2a2a2a').sphere(-2.6, 44.6, 4.6, 0.8, 0.8, 0.6, 6, 4).sphere(2.6, 44.6, 4.6, 0.8, 0.8, 0.6, 6, 4);
    ki.fx(0, 0, 0);
    md.sub = null;
    for (let i = 0; i < 20; i++) md.glow(-hl + (i / 19) * D.L, 65, hv, i % 2 ? '#ffe070' : '#ff7040');
    md.ticks.push((dt, h, obj, u) => {
      const fx = N.landmarks && N.landmarks.fx, F = N.flags || {};
      const on = fx && fx.ganesh != null ? !!fx.ganesh : !!(F.ganesh || F.ganesh_chaturthi || F.ganesh_immersion === false);
      if (u.idol !== on) { u.idol = on; if (u.subs.idol) u.subs.idol.visible = on; }
    });
  }, { anim: true });
  def('musical_fountain', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2;
    k.c('#d8d2c6').box(-hl, 0, -hv, hl, 1.6, hv);
    md.part('water').c('#ffffff').box(-hl + 1, 1.2, -hv + 1, hl - 1, 1.5, hv - 1);
    for (let i = 0; i < 7; i++) { const u = -hl + 3 + i * ((D.L - 6) / 6); k.c('#e8f4f8').fx(2, 160, 0).cyl(u, 1.4, 0, 0.6, 0.15, 6 + (i % 3) * 3, 6).fx(0, 0, 0); md.glow(u, 6 + (i % 3) * 3, 0, ['#40c0ff', '#ff70c0', '#ffe070'][i % 3], 'gM'); }
  }, { anim: true });
  def('dhobi_ghat', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, rng = U.rng(lm.id);
    k.c('#a8a094').box(-hl, 0, -hv, hl, 1.2, hv);
    for (let i = 0; i < 6; i++) k.c('#8a8478').box(-hl + 4 + i * 12, 1.2, -hv + 2, -hl + 8 + i * 12, 3, -hv + 6);
    k.c('#7a5a3a'); for (let u = -hl + 2; u <= hl - 2; u += 20) k.bar(u, 0, 0, u, 9, 0, 0.4);
    const k2 = md.part('kit2');
    for (let u = -hl + 3; u < hl - 3; u += 2.2) k2.c(pick(rng, ['#f4f2ee', '#e8402a', '#2a5cb8', '#f2c230', '#f4f2ee', '#3a8a3a'])).q(u, 8.8, 0.05, u + 1.8, 8.8, 0.05, u + 1.8, 4.6 + rng.next(), 0.05, u, 4.6 + rng.next(), 0.05);
  }, { anim: true });
  def('boat_jetty', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2;
    k.c('#8a6a4a').box(-hl, 1, -hv, hl, 2, hv);
    k.c('#5a4a3a'); for (const u of [-hl + 1, hl - 1]) for (let v = -hv + 1; v <= hv - 1; v += 6) k.cyl(u, -2, v, 0.5, 0.5, 6, 6);
    k.c('#e8e0d0').bar(-hl, 5, -hv, -hl, 5, hv, 0.25).bar(hl, 5, -hv, hl, 5, hv, 0.25);
  }, { anim: true });
  def('puranapul_arches', (md, lm, D) => {
    const k = md.k, L = Math.max(lm.w, lm.d);
    md.at(0, 0, lm.w >= lm.d ? 0 : PI / 2);
    for (const s of [-1, 1]) {
      md.at(0, 0, (lm.w >= lm.d ? 0 : PI / 2) + (s > 0 ? 0 : PI));
      k.c('#a89c8c').fx(0, 0, FL_CIV * 0.5).slab(-L / 2, Math.min(lm.w, lm.d) / 2, L / 2, Math.min(lm.w, lm.d) / 2, 2.4, cached('ppa:' + L, () => {
        const n = 22, ops = [], pw = L / n; for (let i = 0; i < n; i++) { const c = (i + 0.5) * pw; ops.push({ x0: c - pw * 0.34, x1: c + pw * 0.34, ys: 2.4, ya: 5.4 }); }
        return ext(wallShape(L, -2, 9, ops, 4), 2.4, 4);
      }));
    }
    k.fx(0, 0, 0);
  }, { anim: true });
  // walk-through gate arches (posts solid)
  def('campus_gate zoo_gate shilparamam_gate', (md, lm, D) => {
    const k = md.k, L = Math.max(lm.w, lm.d), h = Math.min(D.Ht, 36);
    const zoo = lm.draw === 'zoo_gate', shil = lm.draw === 'shilparamam_gate';
    md.at(0, 0, lm.w >= lm.d ? 0 : PI / 2);
    const W = zoo ? '#c8a878' : shil ? '#d8a868' : '#e8e0d0';
    k.c(W).fx(0, 0, FL_CIV * 0.5).slab(-L / 2, 2.5, L / 2, 2.5, 5, cached('gate:' + L + ':' + h + ':' + shil, () => ext(wallShape(L, 0, h, [{ x0: L / 2 - L * 0.28, x1: L / 2 + L * 0.28, ys: h * 0.5, ya: shil ? h * 0.78 : h * 0.62 }], 8, shil ? [[0, h], [L / 2, h + 8], [L, h]] : null), 5, 8)));
    md.px(-L / 2, 0, -2.5, -L * 0.28, h, 2.5).px(L * 0.28, 0, -2.5, L / 2, h, 2.5).px(-L * 0.28, h * 0.6, -2.5, L * 0.28, h, 2.5);
    md.sign(zoo ? 'NEHRU ZOOLOGICAL PARK' : shil ? 'SHILPARAMAM' : (lm.name || '').toUpperCase(), -L * 0.38, L * 0.38, h * 0.66, h * 0.66 + 4.5, 2.6, zoo ? '#1f6a3a' : '#7a1a1a', '#fff4d8');
    if (zoo) for (const s of [-1, 1]) k.c('#c89850').sphere(s * (L / 2 - 2), h + 2.6, 0, 2.4, 2.6, 3.4, 8, 6);
    k.fx(0, 0, 0);
  }, { anim: true });
  def('idol_workshop', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, rng = U.rng(lm.id);
    k.c('#8a8e94'); for (const u of [-hl + 1, hl - 1]) for (const v of [-hv + 1, hv - 1]) k.cyl(u, 0, v, 0.5, 0.5, 18, 6);
    md.part('kit2').c('#4a6a8a').q(-hl, 18, hv, hl, 18, hv, hl, 20, -hv, -hl, 20, -hv);
    for (let i = 0; i < 3; i++) { const v = -hv + 6 + i * ((D.D - 12) / 2); k.c('#c8b8a0').cyl(0, 0, v, 3, 3, 1, 10).c(pick(rng, ['#e8a070', '#d8c8b0', '#f2c0a0'])).sphere(0, 4.4, v, 3.4, 3.4, 3, 10, 8).sphere(0, 9.2, v, 2.2, 2.4, 2, 8, 6).c(GOLD).cyl(0, 11, v, 1.6, 0.3, 3, 8); }
  }, { lod: 'mid' });
  def('home_house', (md, lm, D) => {
    const k = md.k, hl = D.L / 2, hv = D.D / 2, Ht = D.Ht, friend = lm.variant === 'friend';
    const W = friend ? '#e8d8f0' : '#f2e2b8', T = friend ? '#7a5a9a' : '#2a8c82';
    const fp = md.part('fac'), ST = H.STYLE;
    fp.c(W).fac(ST.grill, ST.door, 120, friend ? 61 : 60, 2);
    facWalls(fp, -hl, -hv, hl, hv, 0, Ht, 8);
    k.c('#d8d0c0').hq(-hl, -hv, hl, hv, Ht);
    parapet(k, -hl, -hv, hl, hv, Ht, 3, 0.6, sh(W, 1.05));
    k.c(T).box(-hl, Ht * 0.48, hv, hl, Ht * 0.48 + 0.6, hv + 2.4);
    if (!friend) {
      // the terrace: black tank, clothesline, a TV antenna, kites in Sankranti
      sintex(k, -hl + 6, Ht, -hv + 6, 2.4);
      k.c('#5a5a5a').bar(-hl + 4, Ht + 5, 0, hl - 4, Ht + 5, 0, 0.12);
      const k2 = md.part('kit2'), rng = U.rng('home');
      for (let u = -hl + 6; u < hl - 6; u += 2.6) k2.c(pick(rng, ['#e8402a', '#2a5cb8', '#f4f2ee', '#f2c230', '#e84a8a'])).q(u, Ht + 4.9, 0.05, u + 2, Ht + 4.9, 0.05, u + 2, Ht + 2.6, 0.05, u, Ht + 2.6, 0.05);
      antenna(k, hl - 6, Ht, -hv + 6, 9, 0.4);
      md.sign('LAKSHMI NIVAS', -8, 8, Ht * 0.48 + 1, Ht * 0.48 + 3.6, hv + 0.1, '#f4efe2', T);
    }
  }, { anim: true });

  /* ================================================================ DECOR LAYER: street-market stalls + colony playgrounds
   * places_art.js draws these in 2D from N.WORLD_DATA.places (no landmark records), so the 3D parity
   * lives in a layer: the same deterministic placement (same seeds, same surface tests) is replayed
   * here, and each item is built when the focus comes within ~650 u and freed beyond ~900 u. */
  const MARKET_TYPE = { patang_bazaar: 'kites', laad_bazaar: 'bangles', pathergatti: 'clothes', sultan_bazaar: 'clothes', begum_bazaar: 'sacks', abids_book_market: 'books', general_bazaar: 'toys', chappal_bazar: 'chappals', dhoolpet: 'kites' };
  const GOODS = {
    chappals: ['#e8302a', '#2a5cd8', '#f2c230', '#1a1a1a', '#e85a9a', '#3a8a3a'], clothes: ['#e8302a', '#2a5cd8', '#f2c230', '#f4f2ea', '#e85a9a', '#3a8a3a', '#7a3a8a'],
    sacks: ['#e8c040', '#c8302a', '#f4f0e4', '#7aa040', '#a0522d', '#f08a24'], toys: ['#e8302a', '#2a5cd8', '#f2c230', '#3ac05a', '#f06aa0', '#f4f2ea'],
    bangles: ['#d8202a', '#2a9a3a', '#e8b020', '#2a5cd8', '#c030a0'], kites: ['#e8302a', '#f2c230', '#2a5cd8', '#3ac05a', '#f06aa0', '#f4f2ea'], books: ['#2a5cb8', '#c82a2a', '#e8b830', '#3a8a3a', '#f4f0e0'],
  };
  function polyBox(poly) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, y] of poly) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c - a, d - b]; }
  function marketStalls(pl) {
    const W = N.world, SUR = N.SURF, L = N.WORLD_DATA.landmarks;
    const rng = U.rng('mk:' + pl.id);
    const near = L.filter((l) => Math.abs(l.x - pl.x) < 80 + l.w && Math.abs(l.y - pl.y) < 80 + l.d);
    const nearLm = (x, y, pad) => near.some((l) => Math.abs(x - l.x) < l.w / 2 + pad && Math.abs(y - l.y) < l.d / 2 + pad);
    const okAt = (x, y) => { const q = W.surfaceAt(x, y); return q === SUR.FOOTPATH || q === SUR.PLAZA || q === SUR.GROUND || q === SUR.SAND; };
    const stalls = [];
    for (let t = 0; t < 80 && stalls.length < 5; t++) {
      const a = rng.next() * TAU, r = 10 + rng.next() * 30;
      const x = pl.x + Math.cos(a) * r, y = pl.y + Math.sin(a) * r;
      if (!okAt(x, y)) continue;
      if (Math.hypot(pl.x - x, pl.y - y) < 8) continue;
      if (stalls.some((q) => Math.hypot(q.x - x, q.y - y) < 13)) continue;
      if (nearLm(x, y, 8)) continue;
      const rp = W.nearestRoadPoint ? W.nearestRoadPoint(x, y) : null;
      const ang = rp ? rp.angle || 0 : 0, ca = Math.cos(ang), sa = Math.sin(ang);
      let ok = true;
      for (const [u, v] of [[-5.5, -3.5], [5.5, -3.5], [5.5, 3.5], [-5.5, 3.5], [0, 6], [0, -6]]) { if (!okAt(x + ca * u - sa * v, y + sa * u + ca * v) || !W.isWalkable(x + ca * u - sa * v, y + sa * u + ca * v)) { ok = false; break; } }
      if (!ok) continue;
      let wx = -sa, wy = ca;
      if (rp && (wx * (x - rp.x) + wy * (y - rp.y)) < 0) { wx = -wx; wy = -wy; }
      stalls.push({ x, y, a: ang, wx, wy, seed: (rng.next() * 1e5) | 0, tarp: pick(rng, [['#2a5cb8', '#2a5cb8'], ['#d8402a', '#f4e8d0'], ['#f2c230', '#e8302a'], ['#2a8c82', '#f4e8d0']]) });
    }
    if (!stalls.length) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of stalls) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
    return { kind: 'market', type: MARKET_TYPE[pl.id] || 'toys', id: pl.id, x: (x0 + x1) / 2, y: (y0 + y1) / 2, stalls };
  }
  function buildMarket(md, it) {
    const k = md.k, k2 = md.k2;
    for (const s of it.stalls) {
      const rng = U.rng('st' + s.seed);
      // frame: u along the road, +v towards the vendor's (wall) side
      md.at(s.x - it.x, s.y - it.y, 0);
      const rot = Math.atan2(s.wy, s.wx);
      md.at(s.x - it.x, s.y - it.y, PI / 2 - rot);
      if (it.type === 'kites' || it.type === 'books') { (it.type === 'kites' ? kiteStall : bookStall)(md, { id: 'mk' + s.seed }, { L: 16, D: 9 }); continue; }
      k.c(WOOD).fx(0, 0, 0).box(-4.6, 0, -2.4, 4.6, 3, 2.4);
      const G = GOODS[it.type] || GOODS.toys;
      for (let u = -4.2; u < 4.1; u += 1.4) for (let v = -2; v < 2; v += 1.3) {
        if (it.type === 'bangles') k.c(pick(rng, G)).fx(0, 90, 0).cyl(u + 0.6, 3, v + 0.6, 0.45, 0.45, 1.6, 6).fx(0, 0, 0);
        else if (it.type === 'sacks') k.c('#c8b48a').cyl(u + 0.6, 3, v + 0.6, 0.62, 0.55, 1.6, 6).c(pick(rng, G)).sphere(u + 0.6, 4.6, v + 0.6, 0.55, 0.3, 0.55, 6, 3);
        else k.c(pick(rng, G)).box(u, 3, v, u + 1.1, 3.3 + rng.next() * 0.6, v + 1.0);
      }
      if (it.type === 'clothes') { k.c('#5a5a5a').bar(-5, 8, 2.4, 5, 8, 2.4, 0.3); for (let i = 0; i < 5; i++) { const u = -4 + i * 2; k2.c(pick(rng, G)).q(u - 0.7, 8, 2.45, u + 0.7, 8, 2.45, u + 0.7, 4.6, 2.45, u - 0.7, 4.6, 2.45); } }
      k.c('#8a6a3a'); for (const u of [-4.8, 4.8]) k.bar(u, 0, 2.6, u, 9.2, 2.6, 0.35);
      for (let i = 0; i < 4; i++) { const u0 = -5.6 + i * 2.8, u1 = u0 + 2.8; k2.c(s.tarp[i % 2]).q(u0, 9.4, 5.6, u1, 9.4, 5.6, u1, 8.4, 1.6, u0, 8.4, 1.6); }
      md.glow(0, 9, 2, it.type === 'bangles' ? '#ffe070' : '#ffd090', 'gM');
    }
    // bulb strings between neighbouring stalls (Laad Bazaar glitter)
    md.at(0, 0, 0);
    const S = it.stalls;
    for (let i = 1; i < S.length; i++) for (let t = 0; t <= 1.001; t += 0.125) md.glow(S[i - 1].x - it.x + (S[i].x - S[i - 1].x) * t, 9.3 - Math.sin(PI * t) * 1.2, S[i - 1].y - it.y + (S[i].y - S[i - 1].y) * t, t * 8 % 2 ? '#ffe070' : '#ff9a40');
  }
  function playgroundItem(pl, park) {
    const [x, y, w, d] = polyBox(park.poly);
    const long = w >= d, cx0 = x + w / 2, cy0 = y + d / 2, L = long ? w : d, Wd = long ? d : w;
    const kitNear = N.WORLD_DATA.landmarks.some((l) => l.draw === 'playground_kit' && Math.abs(l.x - cx0) < w / 2 + 10 && Math.abs(l.y - cy0) < d / 2 + 10);
    return { kind: 'playground', id: pl.id, x: cx0, y: cy0, long, L, Wd, kitNear };
  }
  function buildPlayground(md, it) {
    const k = md.k, L = it.L, Wd = it.Wd, pu = Math.min(11, L * 0.2);
    md.at(0, 0, it.long ? 0 : PI / 2);
    // stumps at both ends of the gully pitch, a brick wicket at the bowler's end
    k.c('#e8e0c8').fx(0, 0, 0);
    for (const du of [-0.5, 0, 0.5]) k.box(-pu - 0.12 + 0, 0, du - 0.12, -pu + 0.12, 2.4, du + 0.12, { top: false });
    k.c('#a8502a').box(pu - 0.8, 0, -0.6, pu + 0.8, 1.2, 0.6);
    const P = (u, v) => [u, v];
    const cor = [P(-L / 2 + 10, -Wd / 2 + 8), P(L / 2 - 10, -Wd / 2 + 8), P(L / 2 - 10, Wd / 2 - 8), P(-L / 2 + 10, Wd / 2 - 8)];
    if (!it.kitNear) {
      const [su, sv] = cor[0];
      k.c('#c82a2a').bar(su - 5, 0, sv - 2.5, su - 4, 10, sv, 0.4).bar(su - 5, 0, sv + 2.5, su - 4, 10, sv, 0.4).bar(su + 5, 0, sv - 2.5, su + 4, 10, sv, 0.4).bar(su + 5, 0, sv + 2.5, su + 4, 10, sv, 0.4);
      k.c('#2a5cb8').bar(su - 4, 10, sv, su + 4, 10, sv, 0.35);
      for (const du of [-2, 2]) { k.c('#8a8e94').bar(su + du - 0.5, 10, sv, su + du - 0.5, 2.6, sv, 0.1).bar(su + du + 0.5, 10, sv, su + du + 0.5, 2.6, sv, 0.1); k.c('#f2c230').box(su + du - 0.9, 2.4, sv - 0.5, su + du + 0.9, 2.8, sv + 0.5); }
    }
    { const [su, sv] = cor[1]; k.c('#2a5cb8').bar(su - 3, 0, sv - 1.1, su - 3, 7, sv - 1.1, 0.3).bar(su - 3, 0, sv + 1.1, su - 3, 7, sv + 1.1, 0.3); k.c('#f2c230').box(su - 3.6, 6.7, sv - 1.3, su - 1.8, 7.1, sv + 1.3); md.k2.c('#e8b020').q(su - 1.8, 7, sv - 1.1, su - 1.8, 7, sv + 1.1, su + 5, 0.5, sv + 1.1, su + 5, 0.5, sv - 1.1); }
    { const [su, sv] = cor[2]; k.c('#7a5a3a').box(su - 0.6, 0, sv - 0.6, su + 0.6, 2, sv + 0.6).c('#e8402a').bar(su - 5, 1.2, sv, su + 5, 2.8, sv, 0.6); }
    if (cor[3] && L > 70 && Wd > 50) { const [su, sv] = cor[3]; k.c('#8a8e94').cyl(su, 0, sv, 0.4, 0.4, 4, 6).c('#e8402a').cyl(su, 1, sv, 4, 4, 0.5, 12); }
  }
  const DEC = { items: null, built: new Map(), t: 0 };
  function decorItems() {
    const D = N.WORLD_DATA;
    if (!D || !N.world || !N.world.built) return null;
    const parks = {}; for (const p of D.parks || []) parks[p.id] = p;
    const lmIds = new Set(D.landmarks.map((l) => l.id));
    const out = [];
    for (const pl of D.places || []) {
      try {
        if (pl.alias && parks[pl.alias] && pl.kind === 'playground') continue;
        if (pl.kind === 'playground' && parks[pl.id]) out.push(playgroundItem(pl, parks[pl.id]));
        else if (pl.kind === 'market' && !lmIds.has(pl.id) && MARKET_TYPE[pl.id]) { const m = marketStalls(pl); if (m) out.push(m); }
      } catch (e) { N.err('lm3d.decor:' + pl.id, e); }
    }
    return out;
  }
  function decorUpdate(dt, h) {
    if (!V3.active) return;
    DEC.t -= dt;
    if (DEC.t > 0) return;
    DEC.t = 0.4;
    if (!DEC.items) { DEC.items = decorItems(); if (!DEC.items) return; }
    const f = V3.focus ? V3.focus() : null; if (!f) return;
    const near = isLow() ? 420 : 650;
    let builds = 0;
    for (const it of DEC.items) {
      const d = Math.hypot(it.x - f.x, it.y - f.y), rec = DEC.built.get(it);
      if (rec && d > near + 260) { h.layer.remove(rec); H.dispose(rec); DEC.built.delete(it); continue; }
      if (!rec && d < near && builds < 2) {
        builds++;
        const md = new Model(it.x, it.y);
        try { if (it.kind === 'market') buildMarket(md, it); else buildPlayground(md, it); } catch (e) { N.err('lm3d.decorBuild:' + it.id, e); continue; }
        const obj = md.finish();
        obj.name = 'lm3d-decor:' + it.id;
        obj.position.set(it.x, 0, it.y);
        const shadows = !!(h.quality && h.quality.shadows);
        obj.traverse((m) => { if (m.isMesh) { m.castShadow = shadows && m.userData.noShadow !== true; m.receiveShadow = shadows; } });
        obj.updateMatrixWorld(true);
        h.layer.add(obj);
        DEC.built.set(it, obj);
      }
    }
  }
  function decorClear(h) { for (const obj of DEC.built.values()) { (h || H).layer.remove(obj); H.dispose(obj); } DEC.built.clear(); }
  N.on('world:built', () => { if (H) decorClear(H); DEC.items = null; });

  /* ================================================================ layer: night + clocks */
  V3.registerLayer('landmarks3d', {
    order: 5,
    init(T, h) { init(T, h); },
    update(dt, h) {
      if (!M.kit) return;
      const n = h.night;
      M.gS.opacity = clamp(n * 1.5, 0, 1); M.gM.opacity = clamp(n * 1.3, 0, 1); M.gL.opacity = clamp(n * 1.1, 0, 0.85);
      M.gS.visible = M.gM.visible = M.gL.visible = n > 0.02; // no draw calls for the glow points by day
      M.clock.emissiveIntensity = 0.08 + n * 0.85;
      for (const m of M.filmMats.values()) m.emissiveIntensity = 0.04 + n * 0.6;
      const mm = Math.floor((N.clock && N.clock.minutes) || 0);
      if (mm !== clockMin) { clockMin = mm; paintClock(TX.clock.image, mm); TX.clock.needsUpdate = true; }
      try { decorUpdate(dt, h); } catch (e) { N.err('lm3d.decor', e); }
    },
    dispose(h) { decorClear(h); },
  });

  N.on('world:built', () => { cells = null; cacheClear(); });
  registerAll();
  /** debug / tests: build one landmark's model off-scene and report its cost */
  function measure(id) {
    if (!V3.ready) return null;
    init(V3.THREE, V3.H);
    const lm = ((N.world && N.world.data && N.world.data.landmarks) || []).find((l) => l.id === id);
    const d = lm && defFor(lm); if (!d) return null;
    const t0 = performance.now();
    const md = new Model(lm.x, lm.y);
    md.at(0, 0, rotFor(lm));
    d.fn(md, lm, dims(lm));
    const obj = md.finish();
    const ms = performance.now() - t0;
    let tris = 0, meshes = 0, points = 0;
    obj.traverse((m) => { if (m.isMesh && m.material && m.material.visible !== false) { meshes++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } if (m.isPoints) points++; });
    H.dispose(obj);
    return { id, draw: lm.draw, ms: +ms.toFixed(2), tris: Math.round(tris), meshes, points, batched: !!d.cls };
  }
  N.view3dLandmarks = { DEFS, cells: () => cells, measure, version: 1 };
})();
