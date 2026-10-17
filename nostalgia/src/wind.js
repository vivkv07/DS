/* NOSTALGIA — wind.js (atmosphere layer) — design/atmosphere.md "Wind", ARCHITECTURE §22
 *
 * Visible wind everywhere, in both views, driven by the core N.wind (src/atmosphere.js).
 *
 * ------------------------------------------------------------------ N.windfx (API)
 *   patchMaterial(material, opts) -> material     3D: add the shared wind sway to any three.js material
 *       (vertex shader: a world-space offset applied AFTER instancing, at #include <project_vertex>;
 *       per-instance phase from the instance translation, the gust wave of N.wind.GLSL at the instance).
 *       opts: weight  'height' (default)  weight = amp * ((worldY - base) / height) ^ flex   (trees)
 *                     'attr'              weight = amp * windW * instanceScaleY            (Blender models:
 *                                         the vertex attribute `windW`, see windWeights())
 *                     'hang'              weight = amp * (-localY) ^ flex  (geometry hangs from y = 0 down
 *                                         to y = -1: clothes on a line)
 *                     'flag'              cloth flies from the instance origin downwind (local x 0..1 =
 *                                         hoist..fly, local y = across; instance scale x = length, y = width);
 *                                         hangs limp in calm air, a travelling ripple that grows to the fly
 *             amp (u), height (u), base (u), flex, flutter (u: fast leaf / cloth flutter at full wind),
 *             tip (u: steady streaming of tips downwind ~ s^2), tipAttr (true: flutter / tip scaled by
 *             the `windW` attribute, e.g. radial distance of palm fronds), wrap (keep the material's own
 *             onBeforeCompile and run it first), strip (RegExp removed from the vertex shader after the
 *             wrapped compile — the core canopy's old constant sway), key (program cache key)
 *       The uniforms (shared N.wind.uniforms + per material uWindFx / uWindFx2) are in material.userData.windfx.
 *   depthMaterial(material) -> MeshDepthMaterial  the same sway for the shadow pass (customDepthMaterial)
 *   windWeights(geometry, modelHeight) -> 'attr' | 'color_1' | 'height'   fills `windW` on a model geometry:
 *       the glTF custom attribute _WIND (three: `_wind`, float 0 base .. 1 tips) if present, else COLOR_1.r
 *       (`color_1`), else a computed (y / model height) ^ 1.5.   -> what was used
 *   flags                 the flag props [{x, y, h, kind: 'temple' | 'dargah', color, zone}] (2D + 3D)
 *   stats()               counters (2D trees drawn / live palms / clothes / flags; 3D clothes, tails...)
 *   amp2d                 2D amplitude multiplier (1); enabled (true: off = everything still)
 *   sample2d(t)           tests: the 2D canopy offset {x, y} (u) a tree structure gets this frame
 *
 * What sways:
 *   3D  core procedural trees: the shared canopy material (blobs + palm crowns: height weight + leaf / frond
 *       flutter by a `windW` attribute added to H.geo.blob / H.geo.crown) and the instanced trunk material
 *       (created here before the first chunk, so the core's lazy `if (!MAT.trunkI)` keeps ours); their
 *       shadows sway too (customDepthMaterial). Blender tree models tree_<kind> (coconut neem banyan
 *       gulmohar ashoka mango tamarind palm) when N.models3d has them: registerStructure('tree') builds one
 *       InstancedMesh per model part per chunk (random yaw, scale from the tree's h / r, per-instance
 *       phase); kinds without a model fall back to the core's procedural instancing (same data as
 *       view3d.js addTree). Temple (saffron) and dargah (green) flags: 1 instanced call for the poles + 1
 *       for the cloth. Clothes on rooftop clotheslines near the camera: 1 instanced call (+ the wire).
 *       Sankranti kites' tails: 1 dynamic ribbon mesh while the festival is on.
 *   2D  tree canopies offset by N.wind.sway (amplitude by tree height), trunks bend, leafy canopies breathe
 *       and flash pale leaf undersides; palm fronds near the camera are re-stroked one by one (bending,
 *       streaming, fluttering), the cached sprite elsewhere; clothes flutter on rooftop lines; flags fly;
 *       Sankranti kites fly downwind of N.wind with streaming tails.
 *
 * EDITS TO FILES THIS LAYER DOES NOT OWN (each marked "[atmosphere hook]"):
 *   - src/world.js: one line after the DRAW table: `W._fx = { DRAW, treeImage, TREE_KINDS, isPalm, DETAIL }`
 *     (wind.js replaces DRAW.tree and wraps DRAW.bldg)
 * Everything else hooks by wrapping documented / exposed APIs: the Bldg `items` getter (clothes data moved
 * from `cl` to `_cl` so neither the 2D roof sprite nor the 3D building mesh bakes still clothes — wind.js
 * draws them live), roof zones' `line.cl`, N.world.roofs.onDeck (chained), N.seasons._debug.sank
 * (wx / wy follow N.wind), H.materials.canopy / trunkI, H.geo.blob / crown (+ windW attribute).
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.wind) return;
  const U = N.util, WI = N.wind;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const now = () => performance.now();

  const ST = { trees: 0, palmsLive: 0, clothes2d: 0, flags2d: 0, tails2d: 0, clothes3d: 0, tails3d: 0, flags3d: 0, modelTrees: 0, procTrees: 0, layerMs: 0, ms2d: 0 };
  const FX = (N.windfx = {
    enabled: true,
    amp2d: 1,
    flags: [],
    patchMaterial, depthMaterial, windWeights,
    stats() { return Object.assign({}, ST); },
    sample2d(t) { return treeOffset(t, {}); },
    edits: ['src/world.js: W._fx = { DRAW, treeImage, TREE_KINDS, isPalm, DETAIL } after the DRAW table'],
    _internal: null,
  });

  /* ================================================================ 3D: the sway shader */
  // GLSL helpers after N.wind.GLSL (uWind, uWindWave, windGust, windOffset)
  const WFX_GLSL = [
    'uniform vec4 uWindFx;   // x amp (u), y height (u), z flex, w flutter (u)',
    'uniform vec4 uWindFx2;  // x tip stream (u), y base height (u)',
    '#if defined(WFX_ATTR)',
    'attribute float windW;',
    '#endif',
    'float wfxHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
  ].join('\n');
  // replaces #include <project_vertex>: instanced local -> world, wind offset in world space, then view
  const WFX_PROJECT = [
    'vec4 wfxP = vec4(transformed, 1.0);',
    '#ifdef USE_INSTANCING',
    '  wfxP = instanceMatrix * wfxP;',
    '  vec3 wfxOrg = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;',
    '  float wfxSy = length(instanceMatrix[1].xyz);',
    '  float wfxSx = length(instanceMatrix[0].xyz);',
    '#else',
    '  vec3 wfxOrg = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;',
    '  float wfxSy = 1.0; float wfxSx = 1.0;',
    '#endif',
    'wfxP = modelMatrix * wfxP;',
    'float wfxPh = wfxHash(floor(wfxOrg.xz * 0.37) + 0.5) * 6.2831853;',
    'float wfxS = uWind.z * (0.72 + 0.62 * uWind.w * windGust(wfxOrg.xz));',
    'float wfxT = uWindWave.z;',
    '#if WFX_MODE == 3',
    // ---- a flag: the cloth flies from the hoist (instance origin) downwind
    '  {',
    '    float fu = clamp(position.x, 0.0, 1.0);',
    '    float ext = clamp(0.18 + wfxS * 1.7, 0.18, 1.0);',
    '    float wa = sin(wfxT * 0.8 + wfxPh) * 0.35 * (1.15 - ext) + sin(wfxT * (2.1 + 2.0 * wfxS) + wfxPh * 1.7) * 0.07;',
    '    vec2 d = vec2(uWind.x * cos(wa) - uWind.y * sin(wa), uWind.x * sin(wa) + uWind.y * cos(wa));',
    '    vec3 pr = vec3(-d.y, 0.0, d.x);',
    '    vec3 al = normalize(vec3(d.x * ext, -(1.0 - ext) * 1.25, d.y * ext));',
    '    vec3 wd = normalize(cross(pr, al));',
    '    float L = wfxSx;',
    '    float rip = sin(fu * 7.5 - wfxT * (3.5 + 9.0 * wfxS) + wfxPh) * (0.05 + 0.2 * wfxS) * fu * L;',
    '    float flap = sin(fu * 5.0 - wfxT * (2.8 + 7.0 * wfxS) + wfxPh * 1.3) * 0.07 * fu * L * (0.3 + wfxS);',
    '    float taper = length(instanceMatrix[2].xyz) - 1.0;   // instance scale z = 1 + taper (temple pennants)',
    '    wfxP.xyz = wfxOrg + al * (fu * L) + wd * (position.y * wfxSy * (1.0 - fu * taper)) + pr * rip + vec3(0.0, flap, 0.0);',
    '  }',
    '#else',
    '  #if WFX_MODE == 1',
    '    float wfxW = windW * uWindFx.x * wfxSy;',
    '  #elif WFX_MODE == 2',
    '    float wfxW = pow(clamp(-position.y, 0.0, 1.0), uWindFx.z) * uWindFx.x;',
    '  #else',
    '    float wfxW = pow(max(wfxP.y - uWindFx2.y, 0.0) / uWindFx.y, uWindFx.z) * uWindFx.x;',
    '  #endif',
    '  vec3 wfxOff = windOffset(wfxOrg, wfxW, wfxPh);',
    '  #if defined(WFX_TIPATTR) || WFX_MODE == 1',
    '    float wfxTip = windW;',
    '  #elif WFX_MODE == 2',
    '    float wfxTip = clamp(-position.y, 0.0, 1.0);',
    '  #else',
    '    float wfxTip = 1.0;',
    '  #endif',
    '  vec3 wfxL = wfxP.xyz - wfxOrg;',
    '  float wfxF = wfxT * (3.4 + 6.5 * wfxS);',
    '  vec3 wfxFl = vec3(sin(wfxF + wfxPh + wfxL.x * 0.61 + wfxL.y * 0.83),',
    '                    sin(wfxF * 1.13 + wfxPh * 1.3 + wfxL.z * 0.71) * 0.6,',
    '                    sin(wfxF * 0.91 + wfxPh * 0.7 + wfxL.z * 0.67 - wfxL.y * 0.53));',
    '  wfxOff += wfxFl * (uWindFx.w * wfxS * wfxTip);',
    '  wfxOff += vec3(uWind.x, -0.35, uWind.y) * (uWindFx2.x * wfxS * wfxS * wfxTip);',
    '  wfxP.xyz += wfxOff;',
    '#endif',
    'vec4 mvPosition = viewMatrix * wfxP;',
    'gl_Position = projectionMatrix * mvPosition;',
  ].join('\n');
  const MODES = { height: 0, attr: 1, hang: 2, flag: 3 };

  function windfxCompile(shader, ud) {
    const U2 = WI.uniforms(window.THREE);
    shader.uniforms.uWind = U2.uWind; shader.uniforms.uWindWave = U2.uWindWave;
    shader.uniforms.uWindFx = ud.uWindFx; shader.uniforms.uWindFx2 = ud.uWindFx2;
    let vs = shader.vertexShader;
    if (ud.strip) vs = vs.replace(ud.strip, '');
    const defs = '#define WFX_MODE ' + ud.mode + '\n' + (ud.attr ? '#define WFX_ATTR\n' : '') + (ud.tipAttr ? '#define WFX_TIPATTR\n' : '');
    vs = vs.replace('#include <common>', '#include <common>\n' + defs + WI.GLSL + '\n' + WFX_GLSL);
    vs = vs.replace('#include <project_vertex>', WFX_PROJECT);
    shader.vertexShader = vs;
  }
  function makeUD(opts) {
    const THREE = window.THREE;
    const mode = MODES[opts.weight || 'height'] || 0;
    return {
      mode, key: opts.key || ('m' + mode),
      attr: mode === 1 || !!opts.tipAttr, tipAttr: !!opts.tipAttr, strip: opts.strip || null,
      uWindFx: { value: new THREE.Vector4(opts.amp == null ? 2 : opts.amp, opts.height || 30, opts.flex == null ? 1.5 : opts.flex, opts.flutter || 0) },
      uWindFx2: { value: new THREE.Vector4(opts.tip || 0, opts.base || 0, 0, 0) },
    };
  }
  /** patchMaterial(material, opts) — see the header */
  function patchMaterial(material, opts) {
    opts = opts || {};
    const ud = makeUD(opts);
    const prev = opts.wrap !== false ? material.onBeforeCompile : null;
    const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
    material.onBeforeCompile = function (shader, renderer) {
      if (prev && prev !== Object.getPrototypeOf(material).onBeforeCompile) prev.call(this, shader, renderer);
      windfxCompile(shader, ud);
    };
    material.customProgramCacheKey = () => 'windfx-' + ud.key + '|' + prevKey;
    material.userData.windfx = ud;
    ud.base = material;
    material.needsUpdate = true;
    return material;
  }
  const depthCache = new Map();
  /** a MeshDepthMaterial (RGBA packing, as three's directional shadow pass) with the same sway */
  function depthMaterial(material) {
    const ud = material.userData.windfx;
    if (!ud) return null;
    let d = depthCache.get(ud);
    if (d) return d;
    const THREE = window.THREE;
    d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    const dud = Object.assign({}, ud, { strip: null });
    d.onBeforeCompile = (shader) => windfxCompile(shader, dud);
    d.customProgramCacheKey = () => 'windfx-depth-' + ud.key;
    d.userData.shared = true;
    depthCache.set(ud, d);
    return d;
  }
  /** fill `windW` on a (model) geometry: _wind attribute, else color_1.r, else (y / height)^1.5 */
  function windWeights(g, modelH) {
    const THREE = window.THREE;
    if (g.getAttribute('windW')) return g.userData.windSrc || 'attr';
    const pos = g.getAttribute('position'), n = pos.count, w = new Float32Array(n);
    let src = 'height';
    const a = g.getAttribute('_wind') || g.getAttribute('_WIND');
    const c1 = g.getAttribute('color_1');
    if (a) { for (let i = 0; i < n; i++) { let v = a.getX(i); if (v > 1.001) v /= 255; w[i] = clamp(v, 0, 1); } src = 'attr'; }
    else if (c1) { for (let i = 0; i < n; i++) { let v = c1.getX(i); if (v > 1.001) v /= 255; w[i] = clamp(v, 0, 1); } src = 'color_1'; }
    else {
      if (!modelH) { g.computeBoundingBox(); modelH = Math.max(1e-3, g.boundingBox.max.y); }
      for (let i = 0; i < n; i++) w[i] = Math.pow(clamp(pos.getY(i) / modelH, 0, 1), 1.5);
    }
    g.setAttribute('windW', new THREE.BufferAttribute(w, 1));
    g.userData.windSrc = src;
    return src;
  }

  /* ---------------------------------------------------------------- tuning */
  // core procedural trees (heights in 3D units: palms ~40 u, neems ~25 u)
  const TREE3D = { amp: 2.6, height: 34, flex: 1.6 };
  const CANOPY = Object.assign({}, TREE3D, { flutter: 0.55, tip: 1.3 });
  // a blob's leaves flutter evenly (windW ~ distance from the blob centre); palm fronds by their reach
  function addWindAttr(THREE, g, kind) {
    if (!g || g.getAttribute('windW')) return;
    const p = g.getAttribute('position'), n = p.count, w = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (kind === 'crown') { const r = Math.hypot(x, z); w[i] = Math.pow(clamp(r / 1.15, 0, 1), 1.4) * 1.6; }
      else w[i] = 0.25 + 0.5 * clamp(Math.hypot(x, y, z), 0, 1.2);
    }
    g.setAttribute('windW', new THREE.BufferAttribute(w, 1));
  }
  // the core's canopy compile adds a tiny constant sway right after begin_vertex: strip it
  const CORE_SWAY = /#ifdef USE_INSTANCING\s*float ph = instanceMatrix\[3\]\.x \* 0\.071[\s\S]*?#endif/;
  let corePatched = false, coreWind = null;
  function patchCore(THREE, H) {
    if (corePatched) return;
    const M = H.materials, G = H.geo;
    if (!M || !M.canopy || !G) return;
    corePatched = true;
    addWindAttr(THREE, G.blob, 'blob');
    addWindAttr(THREE, G.crown, 'crown');
    coreWind = M.canopy.onBeforeCompile; // nearFade dithering + the old sway (stripped)
    patchMaterial(M.canopy, Object.assign({ weight: 'height', tipAttr: true, key: 'canopy', strip: CORE_SWAY }, CANOPY));
    if (!M.trunkI) {
      // the core creates this lazily in finishGeom (`if (!MAT.trunkI)`): ours comes first, with the
      // canopy's compile for the near-camera dithering (its sway block is stripped)
      M.trunkI = new THREE.MeshLambertMaterial();
      M.trunkI.userData.shared = true;
      M.trunkI.onBeforeCompile = coreWind;
    }
    patchMaterial(M.trunkI, Object.assign({ weight: 'height', key: 'trunk', strip: CORE_SWAY }, TREE3D));
  }
  // shadows sway with the trees: give swaying meshes in the city chunks a matching depth material
  let lastShadowScan = 0;
  function scanShadows(H) {
    const E = N.view3d.engine; if (!E || !E.city || !H.quality.shadows) return;
    const M = H.materials;
    for (const ch of E.city.children) {
      for (const o of ch.children) {
        if (!o.isMesh || o.customDepthMaterial) continue;
        const m = o.material;
        if (m && !Array.isArray(m) && m.userData && m.userData.windfx && (m === M.canopy || m === M.trunkI || m.userData.windfxModel)) o.customDepthMaterial = depthMaterial(m);
        else if (o.isGroup || (o.children && o.children.length)) for (const c of o.children) if (c.isMesh && !c.customDepthMaterial && c.material && c.material.userData && c.material.userData.windfx) c.customDepthMaterial = depthMaterial(c.material);
      }
    }
  }

  /* ================================================================ 3D: Blender tree models */
  const TREE_IDS = ['coconut', 'neem', 'banyan', 'gulmohar', 'ashoka', 'mango', 'tamarind', 'palm'];
  const modelCache = new Map(); // kind -> {parts: [{geo, mat}], h, w} | null
  function modelFor(THREE, kind) {
    if (modelCache.has(kind)) return modelCache.get(kind);
    const M3 = N.models3d, id = 'tree_' + kind;
    let rec = null;
    if (M3 && M3.has && M3.has(id) && (!M3.loaded || M3.loaded(id))) {
      try {
        const root = M3.instance(id);
        if (root) {
          root.updateMatrixWorld(true);
          const parts = [];
          const box = new THREE.Box3().setFromObject(root);
          const mh = Math.max(1, box.max.y), mw = Math.max(1, Math.max(box.max.x - box.min.x, box.max.z - box.min.z));
          root.traverse((o) => {
            if (!o.isMesh || (o.name && o.name.indexOf('COL_') === 0)) return;
            let g = o.geometry;
            if (!o.matrixWorld.equals(new THREE.Matrix4())) { g = g.clone(); g.applyMatrix4(o.matrixWorld); }
            windWeights(g, mh);
            g.userData.shared = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            const pm = mats.map((m0) => {
              const m = m0.clone();
              patchMaterial(m, { weight: 'attr', amp: TREE3D.amp * Math.pow(mh / TREE3D.height, TREE3D.flex), flutter: 0.45, tip: 0.6, key: 'model', wrap: false });
              m.userData.shared = true; m.userData.windfxModel = true;
              return m;
            });
            parts.push({ geo: g, mat: pm.length === 1 ? pm[0] : pm });
          });
          if (parts.length) rec = { parts, h: mh, w: mw, id };
        }
      } catch (e) { N.err('windfx.model:' + id, e); rec = null; }
    }
    modelCache.set(kind, rec);
    return rec;
  }
  const M4 = { m: null, q: null, p: null, s: null, e: null };
  function treeStructure(THREE, s, H, gb, J) {
    const kind = s.kind === 'peepal' ? 'banyan' : s.kind;
    const md = TREE_IDS.indexOf(kind) >= 0 ? modelFor(THREE, kind) : null;
    if (!md) { procTree(H, J, s); ST.procTrees++; return; }
    ST.modelTrees++;
    const T = J._wfxTrees || (J._wfxTrees = {});
    let e = T[kind], ret = null;
    if (!e) {
      let cap = 0;
      for (const q of J.list) if (q.t === 'tree' && (q.kind === 'peepal' ? 'banyan' : q.kind) === kind) cap++;
      const g = new THREE.Group(); g.name = 'windfx-trees-' + kind;
      g.position.set(J.ox, 0, J.oz);
      const meshes = md.parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geo, p.mat, Math.max(1, cap));
        im.count = 0; im.frustumCulled = false; im.castShadow = !!H.quality.shadows; im.receiveShadow = false;
        if (H.quality.shadows && !Array.isArray(p.mat)) im.customDepthMaterial = depthMaterial(p.mat);
        im.matrixAutoUpdate = false; im.name = 'windfx-tree';
        g.add(im);
        return im;
      });
      e = T[kind] = { group: g, meshes, n: 0 };
      ret = g;
    }
    if (!M4.m) { M4.m = new THREE.Matrix4(); M4.q = new THREE.Quaternion(); M4.p = new THREE.Vector3(); M4.s = new THREE.Vector3(); M4.e = new THREE.Euler(); }
    const rng = U.rng(((s.x * 73.1) ^ (s.y * 19.7)) >>> 0);
    const h = (s.h || 22) * H.VS * 0.95, sc = h / md.h;
    const sxz = sc * clamp(((s.r || 9) * 2.1 / md.w) / sc, 0.75, 1.35);
    M4.p.set(s.x - J.ox, 0, s.y - J.oz); M4.e.set(0, rng.next() * TAU, 0); M4.q.setFromEuler(M4.e); M4.s.set(sxz, sc, sxz);
    M4.m.compose(M4.p, M4.q, M4.s);
    for (const im of e.meshes) { if (e.n < im.instanceMatrix.count) { im.setMatrixAt(e.n, M4.m); im.count = e.n + 1; im.instanceMatrix.needsUpdate = true; } }
    e.n++;
    return ret;
  }
  // the core's procedural tree (view3d.js addTree), for kinds without a model
  const TREEK = {
    neem: ['#2c5226', '#3a6a2e', '#4a7c36', '#5f9142'], banyan: ['#203f1e', '#2d5427', '#3b6830', '#4c7a3a'],
    gulmohar: ['#2f5a28', '#3f7032', '#4f8238', '#628f40'], ashoka: ['#1f4a24', '#2b5d2e', '#3a7038', '#4a8040'],
    palm: ['#3e6a2a', '#4f7f34', '#6a9440', '#2e5222'], coconut: ['#456f2c', '#588a36', '#74a046', '#33582a'],
    mango: ['#1c3f1c', '#28522a', '#376636', '#4a7a40'], tamarind: ['#2a4f24', '#386230', '#4a763a', '#5f8a46'],
    peepal: ['#25502a', '#326434', '#43783e', '#58904a'],
  };
  const FLOWERS = ['#e0482a', '#f07a2a', '#d83a24'];
  function procTree(H, J, s) {
    const K = TREEK[s.kind] || TREEK.neem;
    const palm = s.kind === 'palm' || s.kind === 'coconut';
    const x = s.x - J.ox, z = s.y - J.oz, h = (s.h || 22) * H.VS * 0.95, r = s.r || 9;
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
  let treeReg = false;
  function maybeRegisterTrees() {
    if (treeReg || !N.view3d || !N.models3d) return;
    const M3 = N.models3d;
    const any = TREE_IDS.some((k) => M3.has && M3.has('tree_' + k) && (!M3.loaded || M3.loaded('tree_' + k)));
    if (!any) return;
    treeReg = true;
    modelCache.clear();
    N.view3d.registerStructure('tree', treeStructure); // marks every chunk dirty -> rebuilt with the models
  }
  N.on('models3d:ready', () => { try { maybeRegisterTrees(); } catch (e) { N.err('windfx.trees', e); } });

  /* ================================================================ flags (data, both views) */
  const FLAG_KINDS = {
    temple: { color: '#f2861e', color2: '#e0601a', h: 34, len: 9, wid: 5.5, tri: true },
    dargah: { color: '#2f8a3a', color2: '#1f6a2a', h: 28, len: 8, wid: 5, tri: false },
  };
  function buildFlags() {
    FX.flags.length = 0;
    const D = N.WORLD_DATA || {};
    for (const z of D.respect || []) {
      const K = FLAG_KINDS[z.kind]; if (!K) continue;
      const r = z.rects && z.rects[0]; if (!r) continue;
      const g = z.gate || { x: r[0] + r[2] / 2, y: r[1] + r[3] };
      // just inside the gate, to one side of the path
      const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
      let ix = cx - g.x, iy = cy - g.y; const L = Math.hypot(ix, iy) || 1; ix /= L; iy /= L;
      const side = (U.strHash(z.id) & 1) ? 1 : -1;
      const inset = Math.min(9, L * 0.4), off = Math.min(r[2], r[3]) * 0.3;
      FX.flags.push({ x: g.x + ix * inset - iy * off * side, y: g.y + iy * inset + ix * off * side, h: K.h, kind: z.kind, color: K.color, color2: K.color2, len: K.len, wid: K.wid, tri: K.tri, zone: z.id, ph: (U.strHash(z.id + 'f') >>> 0) / 4294967296 * TAU });
    }
  }

  /* ================================================================ clothes data */
  // Clothes on rooftop lines are drawn live by this file in both views: the data moves from `cl` (read by
  // the 2D roof sprite painter and the 3D building mesh) to `_cl`.
  const NOCL = Object.freeze([]);
  function stripItems(a) {
    if (!a || a._wfx) return a;
    try { Object.defineProperty(a, '_wfx', { value: true }); } catch (e) { /* frozen */ }
    for (const it of a) if (it && it.t === 'line' && it.cl && it.cl !== NOCL) { it._cl = it.cl; it.cl = NOCL; }
    return a;
  }
  let itemsPatched = false;
  function patchBldgItems() {
    if (itemsPatched || !N.world || !N.world.structures) return;
    const b = N.world.structures.find((s) => s && s.t === 'bldg');
    if (!b) return;
    const proto = Object.getPrototypeOf(b);
    const d = Object.getOwnPropertyDescriptor(proto, 'items');
    if (!d || !d.get) return;
    itemsPatched = true;
    Object.defineProperty(proto, 'items', {
      configurable: true, enumerable: d.enumerable,
      get() { const a = d.get.call(this); return a && a._wfx ? a : stripItems(a); },
      set(v) { d.set.call(this, v); },
    });
  }
  // hand-placed buildings may carry `items` as an own property (not the Bldg getter): strip those now
  function stripOwnItems() {
    for (const s of N.world.structures || []) if (s && s.t === 'bldg' && Object.prototype.hasOwnProperty.call(s, 'items') && Array.isArray(s.items)) stripItems(s.items);
  }
  function stripRoofZones() {
    const RF = N.world && N.world.roofs; if (!RF) return;
    for (const r of RF.list || []) if (r.line && r.line.cl && r.line.cl !== NOCL) { r.line._cl = r.line.cl; r.line.cl = NOCL; }
  }
  /** the clothesline of a generic building (null = none), cached */
  function bldgLine(b) {
    if (b._wfxL !== undefined) return b._wfxL;
    let L = null;
    if (b.roofType === 'flat') { const a = b.items; for (const it of a) if (it.t === 'line' && it._cl && it._cl.length) { L = it; break; } }
    b._wfxL = L;
    return L;
  }

  /* ================================================================ 2D */
  const SW = { x: 0, y: 0 };
  const phaseOf = (t) => (t._wph != null ? t._wph : (t._wph = (((t.seed >>> 0) % 9973) / 9973) * TAU));
  function treeOffset(t, out) {
    if (!FX.enabled) { out.x = 0; out.y = 0; return out; }
    WI.sway(t.x, t.y, phaseOf(t), out);
    const palm = t.kind === 'palm' || t.kind === 'coconut';
    const amp = (palm ? 4.4 : 2.8) * (1 + 0.9 * WI.strength) * (t.h / 22) * FX.amp2d; // gusts in a storm bend harder than linear
    out.x *= amp; out.y *= amp;
    return out;
  }
  let WX = null; // world.js internals (DRAW, treeImage, TREE_KINDS, isPalm, DETAIL)
  const PALM_NEAR = 190;
  function drawTree2D(ctx, t) {
    const R = N.render;
    const p = N.player;
    let alpha = 1;
    if (p && !p.vehicle) { const dx = p.x - t.x, dy = p.y - t.y; if (dx * dx + dy * dy < (t.r + 5) * (t.r + 5)) alpha = 0.45; }
    ST.trees++;
    const o = treeOffset(t, SW), ox = o.x, oy = o.y;
    const kt = R.k(t.h), k0 = R.k(0), km = R.k(t.h * 0.85);
    const palm = WX.isPalm(t.kind);
    // trunk: base planted, the top follows the crown, bending on the way
    ctx.strokeStyle = palm ? '#8a6a4a' : '#5a4030';
    ctx.lineWidth = Math.max(1, (palm ? 1.6 : t.kind === 'banyan' ? 3 : 2) * k0);
    const bx = R.sx(t.x, k0), by = R.sy(t.y, k0);
    const tf = palm ? 0.8 : 0.55, kmid = R.k(t.h * 0.45);
    ctx.beginPath(); ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(R.sx(t.x + ox * tf * 0.18, kmid), R.sy(t.y + oy * tf * 0.18, kmid), R.sx(t.x + ox * tf, km), R.sy(t.y + oy * tf, km));
    ctx.stroke();
    const oct = ((Math.round((Math.atan2(R.sun.dy, R.sun.dx) / TAU) * 8) % 8) + 8) % 8;
    const cx = R.sx(t.x + ox, kt), cy = R.sy(t.y + oy, kt);
    if (alpha < 1) ctx.globalAlpha = alpha;
    const s = WI.strength;
    const ddx = t.x - R.cam.x, ddy = t.y - R.cam.y;
    const near = ddx * ddx + ddy * ddy < PALM_NEAR * PALM_NEAR;
    if (palm && near && FX.enabled) { drawPalmLive(ctx, t, cx, cy, kt, oct, s); ST.palmsLive++; }
    else {
      const img = WX.treeImage(t, oct);
      let half = (t.r + 3) * kt, hx = half, hy = half;
      if (!palm && FX.enabled && s > 0.02) {
        // the canopy breathes: stretched a touch along the wind, squeezed across it, out of phase per tree
        const br = Math.sin((WI.time || 0) * (2.2 + 3.5 * s) + phaseOf(t) * 1.7) * 0.035 * Math.min(1, s * 1.6);
        hx = half * (1 + br * Math.abs(WI.dx) - br * 0.5 * Math.abs(WI.dy));
        hy = half * (1 + br * Math.abs(WI.dy) - br * 0.5 * Math.abs(WI.dx));
      }
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, cx - hx, cy - hy, hx * 2, hy * 2);
      ctx.imageSmoothingEnabled = false;
      if (!palm && near && FX.enabled && s > 0.08) leafFlash(ctx, t, cx, cy, kt, s);
    }
    ctx.globalAlpha = 1;
  }
  // pale leaf undersides flashing on the upwind side of the canopy (neem / mango leaves turning over)
  function leafFlash(ctx, t, cx, cy, kt, s) {
    const T = WI.time || 0, ph = phaseOf(t), bl = t.blobs, n = Math.min(6, bl.length);
    const thr = 0.86 - 0.5 * Math.min(1, s);
    ctx.fillStyle = t.kind === 'ashoka' || t.kind === 'mango' ? '#7fa060' : '#9cba72';
    const sz = Math.max(1, 1.1 * kt);
    for (let i = 0; i < n; i++) {
      const v = Math.sin(T * (4.5 + 7 * s) + ph + i * 2.39) * Math.sin(T * 1.7 + i * 1.3 + ph * 0.5);
      if (v < thr) continue;
      const b = bl[i], X = cx + (b[0] - WI.dx * b[2] * 0.55 + Math.sin(i * 7.1 + ph) * b[2] * 0.25) * kt, Y = cy + (b[1] - WI.dy * b[2] * 0.55 + Math.cos(i * 5.3 + ph) * b[2] * 0.25) * kt;
      ctx.fillRect(Math.round(X), Math.round(Y), sz, sz);
    }
  }
  // a palm crown re-stroked frond by frond: each frond bends downwind, upwind fronds fold over, tips flutter
  function drawPalmLive(ctx, t, cx, cy, kt, oct, s) {
    const K = WX.TREE_KINDS[t.kind] || WX.TREE_KINDS.palm;
    const sa = (oct / 8) * TAU, sdx = Math.cos(sa), sdy = Math.sin(sa);
    const T = WI.time || 0, ph = phaseOf(t), fr = t.fronds;
    const g = WI.gust(t.x, t.y), sl = s * (0.72 + 0.62 * WI.gustiness * g);
    ctx.setTransform(kt, 0, 0, kt, cx, cy);
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 3; pass++) {
      ctx.strokeStyle = pass === 0 ? K.cols[3] : pass === 1 ? K.cols[1] : K.cols[2];
      ctx.lineWidth = pass === 0 ? 2.8 : pass === 1 ? 1.8 : 0.7;
      ctx.beginPath();
      for (let i = 0; i < fr.length; i++) {
        const a = fr[i][0], L = fr[i][1];
        const ca = Math.cos(a), sn = Math.sin(a);
        const up = -(ca * WI.dx + sn * WI.dy);           // 1 = frond points into the wind
        const fl = Math.sin(T * (3.2 + 7 * sl) + ph + i * 1.9) * (0.25 + 1.5 * sl) + Math.sin(T * (7 + 6 * sl) + i * 2.7) * 0.35 * sl;
        const bend = L * sl * (0.42 + 0.38 * Math.max(0, up));
        const ex = ca * L * (1 - 0.3 * sl * Math.max(0, up)) + WI.dx * bend - sn * fl, ey = sn * L * (1 - 0.3 * sl * Math.max(0, up)) + WI.dy * bend + ca * fl;
        const lift = pass === 2 ? -0.5 : 0;
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(ca * L * 0.6 - sn * L * 0.12 + WI.dx * bend * 0.3 + sdx * lift, sn * L * 0.6 + ca * L * 0.12 + WI.dy * bend * 0.3 + sdy * lift, ex, ey);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#6a5030'; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, TAU); ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---- clothes (2D): quads hanging from the line, blown out downwind, fluttering
  const CP = [0, 0, 0, 0, 0, 0, 0, 0];
  function drawClothes2D(ctx, l, cl, h, depth) {
    const R = N.render;
    const k = R.k(h), T = WI.time || 0;
    const dx = l.x1 - l.x0, dy = l.y1 - l.y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    // the hanging direction in top-down: across the line; the wind blows it out to one side
    const px = -uy, py = ux;
    const cxm = (l.x0 + l.x1) / 2, cym = (l.y0 + l.y1) / 2;
    WI.at(cxm, cym, SW);
    const s = FX.enabled ? SW.s : 0, wp = (WI.dx * px + WI.dy * py) * s;
    for (let i = 0; i < cl.length; i++) {
      const c = cl[i], t = c[0], w = c[2];
      const ph = t * 17.3 + i * 1.7 + l.x0 * 0.01;
      const fl = FX.enabled ? Math.sin(T * (4 + 9 * s) + ph) * (0.15 + 0.6 * s) : 0;
      const out = wp * 2.4 + fl * 0.6;                  // how far the hem is blown (u, signed)
      const side = depth + Math.abs(out) * 0.4;         // visible hang
      const sgn = out >= 0 ? 1 : -1;
      const ax = l.x0 + dx * t, ay = l.y0 + dy * t, bx = ax + ux * w, by = ay + uy * w;
      const skew = fl * 0.35 * w;
      const hx = px * (side * sgn + out * 0.6), hy = py * (side * sgn + out * 0.6);
      CP[0] = R.sx(ax, k); CP[1] = R.sy(ay, k); CP[2] = R.sx(bx, k); CP[3] = R.sy(by, k);
      CP[4] = R.sx(bx + hx + ux * skew, k); CP[5] = R.sy(by + hy + uy * skew, k); CP[6] = R.sx(ax + hx + ux * skew, k); CP[7] = R.sy(ay + hy + uy * skew, k);
      ctx.fillStyle = c[1];
      ctx.beginPath(); ctx.moveTo(CP[0], CP[1]); ctx.lineTo(CP[2], CP[3]); ctx.lineTo(CP[4], CP[5]); ctx.lineTo(CP[6], CP[7]); ctx.closePath(); ctx.fill();
      ST.clothes2d++;
    }
  }
  function wrapBldg() {
    const D = WX.DRAW, orig = D.bldg;
    if (!orig || orig._wfx) return;
    const f = function (ctx, b) {
      orig(ctx, b);
      if (b.roofType !== 'flat' || !WX.DETAIL.roofs) return;
      const L = bldgLine(b);
      if (L) drawClothes2D(ctx, L, L._cl, b.h + 0.6, 1.2);
    };
    f._wfx = true;
    D.bldg = f;
  }
  function chainDeck() {
    const RF = N.world && N.world.roofs; if (!RF || RF._wfxDeck) return;
    RF._wfxDeck = true;
    const prev = RF.onDeck;
    RF.onDeck = function (ctx, r) {
      if (prev) prev(ctx, r);
      if (r.line && r.line._cl && r.line._cl.length) drawClothes2D(ctx, r.line, r.line._cl, r.h + 5.3, 1.6);
    };
  }

  // ---- flags (2D custom structures)
  // Same model as the shader. Seen from above a flying flag is edge-on, so the 2D cloth gets a little
  // oblique width (its lower edge drawn towards the screen bottom), the way the game draws its walls.
  const FP = new Float32Array(6 * 8);
  function flagGeom(f, n, out) {
    // out[i*6..]: top x, y, h, bottom x, y, h for n + 1 points from the hoist to the fly
    const T = WI.time || 0, ph = f.ph;
    WI.at(f.x, f.y, SW);
    const s = FX.enabled ? SW.s : 0;
    const ext = clamp(0.18 + s * 1.7, 0.18, 1);
    const wa = Math.sin(T * 0.8 + ph) * 0.35 * (1.15 - ext) + Math.sin(T * (2.1 + 2 * s) + ph * 1.7) * 0.07;
    const ca = Math.cos(wa), sa = Math.sin(wa);
    const dX = WI.dx * ca - WI.dy * sa, dY = WI.dx * sa + WI.dy * ca;
    let ax = dX * ext, ay = dY * ext, ah = -(1 - ext) * 1.25; const al = Math.hypot(ax, ay, ah) || 1; ax /= al; ay /= al; ah /= al;
    for (let i = 0; i <= n; i++) {
      const u = i / n, L = f.len;
      const rip = FX.enabled ? Math.sin(u * 7.5 - T * (3.5 + 9 * s) + ph) * (0.05 + 0.2 * s) * u * L : 0;
      const x = f.x + ax * u * L - dY * rip, y = f.y + ay * u * L + dX * rip, hh = f.h + ah * u * L;
      const wdt = f.wid * (f.tri ? 1 - u * 0.92 : 1);
      // flying: the width hangs below the top edge; limp (calm): it lies along the pole's downwind side
      const shade = 0.55 + 0.45 * Math.cos(u * 7.5 - T * (3.5 + 9 * s) + ph) * Math.min(1, s * 2);
      out[i * 6] = x; out[i * 6 + 1] = y; out[i * 6 + 2] = hh;
      out[i * 6 + 3] = x + dX * wdt * (1 - ext) * 0.6; out[i * 6 + 4] = y + wdt * 0.42 * shade + dY * wdt * (1 - ext) * 0.6; out[i * 6 + 5] = hh - wdt * ext;
    }
  }
  function drawFlag2D(ctx, s) {
    const f = s.flag, R = N.render;
    ST.flags2d++;
    const k0 = R.k(0), kt = R.k(f.h + 1.2);
    ctx.strokeStyle = '#6e604c'; ctx.lineWidth = Math.max(1, 0.9 * k0);
    ctx.beginPath(); ctx.moveTo(R.sx(f.x, k0), R.sy(f.y, k0)); ctx.lineTo(R.sx(f.x, kt), R.sy(f.y, kt)); ctx.stroke();
    const n = 6;
    flagGeom(f, n, FP);
    ctx.fillStyle = f.color;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const k = R.k(FP[i * 6 + 2]); const X = R.sx(FP[i * 6], k), Y = R.sy(FP[i * 6 + 1], k); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
    for (let i = n; i >= 0; i--) { const k = R.k(FP[i * 6 + 5]); ctx.lineTo(R.sx(FP[i * 6 + 3], k), R.sy(FP[i * 6 + 4], k)); }
    ctx.closePath(); ctx.fill();
    // the darker hem / fold line along the lower edge
    ctx.strokeStyle = f.color2; ctx.lineWidth = Math.max(0.8, 0.6 * kt);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const k = R.k(FP[i * 6 + 5]); const X = R.sx(FP[i * 6 + 3], k), Y = R.sy(FP[i * 6 + 4], k); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
    ctx.stroke();
    ctx.fillStyle = '#e0c060'; ctx.fillRect(Math.round(R.sx(f.x, kt) - 1), Math.round(R.sy(f.y, kt) - 1), 2, 2); // the finial
  }
  function addFlagStructures() {
    const W = N.world; if (!W || !W.addStructure) return;
    for (const f of FX.flags) {
      const m = f.len + 3;
      W.addStructure({ t: 'custom', x0: f.x - m, y0: f.y - m, x1: f.x + m, y1: f.y + m, cx: f.x, cy: f.y, x: f.x, y: f.y, flag: f, windfx: true, draw: drawFlag2D });
    }
  }

  // ---- Sankranti kites: they fly downwind of N.wind, with streaming tails
  const KCOL = ['#e83a5a', '#2a5cb8', '#f2c230', '#3a9a3a', '#f08a24', '#7a3a8a', '#efe9dc', '#d8202a', '#20a0b0', '#ff7ab0'];
  let sankPatched = false;
  function patchSank() {
    if (sankPatched) return;
    const S = N.seasons, sank = S && S._debug && S._debug.sank;
    if (!sank) return;
    sankPatched = true;
    // seasons.js sets sank.wx / wy from its own fixed lake wind every frame: follow N.wind instead
    let fwx = sank.wx || Math.cos(-2.3), fwy = sank.wy || Math.sin(-2.3);
    Object.defineProperty(sank, 'wx', { configurable: true, get() { return FX.enabled ? WI.dx : fwx; }, set(v) { fwx = v; } });
    Object.defineProperty(sank, 'wy', { configurable: true, get() { return FX.enabled ? WI.dy : fwy; }, set(v) { fwy = v; } });
  }
  const hsh = (a, b) => U.hash2(a * 0.731 + 0.17, b * 1.137 + 0.41); // = seasons.js
  const KP = { ax: 0, ay: 0, x: 0, y: 0, h: 0, ci: 0 };
  function kitePos(s, out) { // = seasons.js kitePos (with the N.wind direction)
    const TIME = (N.time && N.time.real) || 0;
    const hv = hsh(s.y, s.x), L = 26 + hv * 44, ph = hv * 40;
    out.ax = s.x + s.w * (0.3 + 0.4 * hv); out.ay = s.y + s.d * (0.35 + 0.3 * hsh(s.x, 3));
    out.x = out.ax + WI.dx * L + Math.sin(TIME * (0.6 + hv * 0.5) + ph) * (5 + hv * 6);
    out.y = out.ay + WI.dy * L + Math.cos(TIME * (0.45 + hv * 0.4) + ph) * 4;
    out.h = Math.min(78, s.h + 22 + hv * 30) + Math.sin(TIME * 0.8 + ph) * 2;
    out.ci = (hv * 997) | 0;
    return out;
  }
  // a tail: n points streaming downwind from the kite's tail end, waving
  function tailPoints(x, y, h, ph, n, seg, out) {
    const T = WI.time || 0, s = Math.max(0.12, WI.strength);
    let px = x, py = y, ph2 = h;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const wv = Math.sin(T * (4 + 6 * s) - i * 0.95 + ph) * (0.6 + 1.6 * u) * (0.6 + s);
      out[i * 3] = px - WI.dy * wv; out[i * 3 + 1] = py + WI.dx * wv; out[i * 3 + 2] = ph2;
      px += WI.dx * seg * (0.35 + 0.65 * Math.min(1, s * 2)); py += WI.dy * seg * (0.35 + 0.65 * Math.min(1, s * 2));
      ph2 -= seg * (1 - Math.min(0.8, s * 1.6)) * 0.9;
    }
    return out;
  }
  const TP = new Float32Array(3 * 12);
  function drawKiteTails2D(ctx) {
    const S = N.seasons, sank = S && S._debug && S._debug.sank;
    if (!sank || !sank.anchors || !sank.anchors.length) return;
    const R = N.render, n = 6;
    ctx.lineCap = 'round';
    for (const s of sank.anchors) {
      kitePos(s, KP);
      tailPoints(KP.x, KP.y + 6.5, KP.h, KP.ci * 0.37, n, 2.4, TP);
      ctx.strokeStyle = KCOL[(KP.ci + 3) % KCOL.length];
      ctx.lineWidth = Math.max(1, 0.9 * R.k(KP.h));
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const k = R.k(TP[i * 3 + 2]); const X = R.sx(TP[i * 3], k), Y = R.sy(TP[i * 3 + 1], k); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
      ctx.stroke();
      ST.tails2d++;
    }
    ctx.lineCap = 'butt';
  }

  /* ================================================================ 3D layer: flags, clothes, kite tails */
  const L3 = { flagPoles: null, flagCloth: null, clothes: null, wire: null, tails: null, clothT: 0, clothKey: '', shadowT: 0, tailT: 0, kites: [], scT: 0 };
  function flagGeometry(THREE) {
    // pennant: x 0..1 (hoist .. fly), y -0.5..0.5 across, subdivided along its length
    const nx = 10, ny = 2, pos = [], idx = [];
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) pos.push(i / nx, j / ny - 0.5, 0);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const a = i * (ny + 1) + j, b = a + ny + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    return g;
  }
  function buildFlags3D(THREE, H) {
    if (!FX.flags.length) buildFlags();
    disposeFlags3D(H);
    const fl = FX.flags; if (!fl.length) return;
    const VS = H.VS;
    const poleGeo = new THREE.CylinderGeometry(0.22, 0.32, 1, 6, 1, true); poleGeo.translate(0, 0.5, 0);
    const poles = new THREE.InstancedMesh(poleGeo, H.mat('#8a7a62'), fl.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    fl.forEach((f, i) => { m.makeScale(1, f.h * VS + 1.5, 1); m.setPosition(f.x, 0, f.y); poles.setMatrixAt(i, m); });
    poles.instanceMatrix.needsUpdate = true; poles.frustumCulled = false; poles.castShadow = !!H.quality.shadows; poles.name = 'windfx-flagpoles';
    H.layer.add(poles); L3.flagPoles = poles;
    // one cloth mesh for every flag: the taper (temple pennants are triangles) rides in the instance scale z
    const geo = flagGeometry(THREE);
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, flatShading: true });
    patchMaterial(mat, { weight: 'flag', key: 'flag' });
    const cloth = new THREE.InstancedMesh(geo, mat, fl.length);
    fl.forEach((f, i) => {
      const w = f.wid * VS * 0.55, len = f.len * VS * 0.75;
      m.makeScale(len, w, 1 + (f.tri ? 0.92 : 0)); m.setPosition(f.x, f.h * VS + 1.2 - w * 0.5, f.y);
      cloth.setMatrixAt(i, m); c.set(f.color); cloth.setColorAt(i, c);
    });
    cloth.instanceMatrix.needsUpdate = true; if (cloth.instanceColor) cloth.instanceColor.needsUpdate = true;
    cloth.frustumCulled = false; cloth.castShadow = !!H.quality.shadows; cloth.name = 'windfx-flags';
    if (H.quality.shadows) cloth.customDepthMaterial = depthMaterial(mat);
    H.layer.add(cloth); L3.flagCloth = cloth;
    ST.flags3d = fl.length;
  }
  function disposeFlags3D(H) {
    for (const k of ['flagPoles', 'flagCloth']) { const o = L3[k]; if (o) { H.layer.remove(o); o.geometry.dispose(); if (k === 'flagCloth') o.material.dispose(); L3[k] = null; } }
  }
  // clothes near the camera: one instanced mesh of hanging quads (+ the wires as instances of the same mesh)
  const CLOTH_MAX = 480, CLOTH_R = 380;
  function initClothes(THREE, H) {
    const nx = 2, ny = 3, pos = [], idx = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) pos.push(i / nx - 0.5, -j / ny, 0);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, flatShading: true });
    patchMaterial(mat, { weight: 'hang', amp: 2.2, flex: 1.3, flutter: 0.45, key: 'clothes' });
    const im = new THREE.InstancedMesh(g, mat, CLOTH_MAX);
    im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; im.name = 'windfx-clothes';
    im.setColorAt(0, new THREE.Color('#ffffff'));
    H.layer.add(im); L3.clothes = im;
  }
  const CM = { m: null, q: null, p: null, s: null, e: null, c: null };
  function refreshClothes(THREE, H, fx, fy) {
    const im = L3.clothes; if (!im) return;
    if (!CM.m) { CM.m = new THREE.Matrix4(); CM.q = new THREE.Quaternion(); CM.p = new THREE.Vector3(); CM.s = new THREE.Vector3(); CM.e = new THREE.Euler(); CM.c = new THREE.Color(); }
    const VS = H.VS;
    let n = 0;
    const lines = [];
    N.world.queryStructures(fx - CLOTH_R, fy - CLOTH_R, fx + CLOTH_R, fy + CLOTH_R, (s) => {
      if (s.t === 'bldg') { if (s.roofType !== 'flat') return; const L = bldgLine(s); if (L) lines.push([L, s.h * VS, (s.cx - fx) ** 2 + (s.cy - fy) ** 2]); }
      else if (s.t === 'roofzone' && s.roof && !s.roof.lm && s.roof.line && s.roof.line._cl) lines.push([s.roof.line, s.roof.h * VS, (s.cx - fx) ** 2 + (s.cy - fy) ** 2]);
    });
    lines.sort((a, b) => a[2] - b[2]);
    const put = (x, y, z, yaw, sx, sy, hex) => {
      CM.p.set(x, y, z); CM.e.set(0, yaw, 0); CM.q.setFromEuler(CM.e); CM.s.set(sx, sy, 1);
      CM.m.compose(CM.p, CM.q, CM.s); im.setMatrixAt(n, CM.m); CM.c.set(hex); im.setColorAt(n, CM.c); n++;
    };
    for (const [l, Ht] of lines) {
      const cl = l._cl;
      if (n + cl.length + 1 > CLOTH_MAX) break;
      const ax = l.x0, az = l.y0, bx = l.x1, bz = l.y1, L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L;
      const y = Ht + 4.2, yaw = -Math.atan2(uz, ux);
      put((ax + bx) / 2, y + 0.06, (az + bz) / 2, yaw, L, 0.12, '#3a3836'); // the wire (barely moves: top row)
      for (const c of cl) {
        const t = c[0] * L, w = c[2] * 1.1;
        put(ax + ux * (t + w / 2), y, az + uz * (t + w / 2), yaw, w, 2.4, c[1]);
      }
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    ST.clothes3d = n;
  }
  // kite tails: one ribbon mesh rebuilt each frame from the seasons' kite data
  const TAIL_MAX = 64, TAIL_N = 7;
  function initTails(THREE, H) {
    const g = new THREE.BufferGeometry();
    const nv = TAIL_MAX * (TAIL_N + 1) * 2;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let k = 0; k < TAIL_MAX; k++) for (let i = 0; i < TAIL_N; i++) { const a = (k * (TAIL_N + 1) + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx); g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.name = 'windfx-kitetails'; mesh.visible = false;
    H.layer.add(mesh); L3.tails = mesh;
  }
  const TP3 = new Float32Array(3 * (TAIL_N + 1));
  function updateTails(THREE, H, dt, fx, fy) {
    const mesh = L3.tails; if (!mesh) return;
    const S = N.seasons, on = !!(S && S.is && S.is('sankranti') && S.scene);
    if (!on) { if (mesh.visible) { mesh.visible = false; mesh.geometry.setDrawRange(0, 0); } L3.kites = []; ST.tails3d = 0; return; }
    L3.scT -= dt;
    if (L3.scT <= 0) { L3.scT = 0.1; try { L3.kites = (S.scene(fx, fy, 420).kites || []).slice(0, TAIL_MAX); } catch (e) { L3.kites = []; } }
    const ks = L3.kites, VS = H.VS, g = mesh.geometry, P = g.attributes.position.array, C = g.attributes.color.array;
    let v = 0;
    const col = new THREE.Color();
    for (let k = 0; k < ks.length; k++) {
      const q = ks[k];
      const kh = q.h * VS - 5.4;
      tailPoints(q.x, q.y, kh, k * 1.37, TAIL_N, 2.6, TP3);
      col.set(KCOL[(k + 3) % KCOL.length]); // = view3d_actors' second kite colour
      for (let i = 0; i <= TAIL_N; i++) {
        const x = TP3[i * 3], z = TP3[i * 3 + 1], y = TP3[i * 3 + 2], w = 0.45 * (1 - i / TAIL_N * 0.5);
        const o = v * 3;
        // the ribbon's width runs across the wind, horizontally
        P[o] = x - WI.dy * w; P[o + 1] = y; P[o + 2] = z + WI.dx * w;
        P[o + 3] = x + WI.dy * w; P[o + 4] = y; P[o + 5] = z - WI.dx * w;
        C[o] = C[o + 3] = col.r; C[o + 1] = C[o + 4] = col.g; C[o + 2] = C[o + 5] = col.b;
        v += 2;
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, ks.length * TAIL_N * 6);
    mesh.visible = ks.length > 0;
    ST.tails3d = ks.length;
  }

  if (N.view3d && N.view3d.registerLayer) {
    N.view3d.registerLayer('windfx', {
      order: 5,
      init(THREE, H) {
        patchCore(THREE, H);
        buildFlags3D(THREE, H);
        initClothes(THREE, H);
        initTails(THREE, H);
        maybeRegisterTrees();
        L3.clothKey = ''; L3.clothT = 0;
      },
      update(dt, H) {
        const t0 = now();
        const THREE = H.THREE;
        if (!corePatched) patchCore(THREE, H);
        const f = N.view3d.focus ? N.view3d.focus() : N.atmos.focus();
        L3.clothT -= dt;
        const key = Math.round(f.x / 60) + ',' + Math.round(f.y / 60);
        if (L3.clothT <= 0 && key !== L3.clothKey) { L3.clothKey = key; L3.clothT = 0.4; refreshClothes(THREE, H, f.x, f.y); }
        if (!FX.enabled && L3.clothes) L3.clothes.visible = true;
        L3.shadowT -= dt;
        if (L3.shadowT <= 0) { L3.shadowT = 0.3; scanShadows(H); }
        updateTails(THREE, H, dt, f.x, f.y);
        ST.layerMs = now() - t0;
      },
      dispose(H) { disposeFlags3D(H); for (const k of ['clothes', 'tails']) { const o = L3[k]; if (o) { H.layer.remove(o); o.geometry.dispose(); o.material.dispose(); L3[k] = null; } } },
    });
  }
  // N.windfx.enabled = false freezes the 3D sway too (the shared uniforms' strength)
  let savedStrength = null;

  /* ================================================================ system: setup + 2D enqueue */
  function setupWorld() {
    WX = N.world && N.world._fx;
    patchBldgItems();
    stripOwnItems();
    stripRoofZones();
    buildFlags();
    addFlagStructures();
    if (WX && WX.DRAW) {
      if (!ORIG.tree) { ORIG.tree = WX.DRAW.tree; ORIG.bldg = WX.DRAW.bldg; }
      WX.DRAW.tree = drawTree2D; wrapBldg();
    }
    chainDeck();
    patchSank();
    modelCache.clear();
    FX._internal = { WX, L3, modelCache, TREE3D, CANOPY };
  }
  N.on('world:built', () => { try { setupWorld(); } catch (e) { N.err('windfx.setup', e); } });
  // tests / profiling: bypass2d(true) puts world.js's own tree + building drawing back (still clothes are
  // not restored: their data lives in `_cl`), bypass2d(false) re-installs the wind versions
  const ORIG = { tree: null, bldg: null };
  FX.bypass2d = function (on) {
    if (!WX || !ORIG.tree) return false;
    if (on) { WX.DRAW.tree = ORIG.tree; WX.DRAW.bldg = ORIG.bldg; } else { WX.DRAW.tree = drawTree2D; WX.DRAW.bldg = ORIG.bldg; wrapBldg(); }
    return true;
  };

  N.addSystem({
    id: 'windfx', order: 58, runIn: ['*'],
    init() { if (N.world && N.world.built && !WX) { try { setupWorld(); } catch (e) { N.err('windfx.setup', e); } } },
    update() {
      // N.windfx.enabled = false: the 3D shader sees no wind (the 2D code checks the flag itself)
      const u = WI._u;
      if (u) {
        if (!FX.enabled) { if (savedStrength === null) savedStrength = true; u.uWind.value.z = 0; }
        else savedStrength = null;
      }
    },
    draw() {
      if (!N.world || !N.world.built || (N.view3d && N.view3d.active)) return;
      const t0 = now();
      const R = N.render;
      // flag poles cast a thin dynamic shadow
      if (N.draw && N.draw.castPole) for (const f of FX.flags) if (R.inView(f.x, f.y, 60)) N.draw.castPole(f.x, f.y, f.h, 0.9);
      if (FX.enabled && N.seasons && N.seasons.is && N.seasons.is('sankranti')) R.queue('sky', 1.9, drawKiteTails2D);
      ST.ms2d = now() - t0;
    },
  });
})();
