/* NOSTALGIA — models3d_props.js (props artist) — ARCHITECTURE §21 "Blender asset pipeline", props part
 *
 * Runtime for the Blender props family (tools/blender/props_*.py -> assets3d/<id>.glb, family 'prop').
 * It sits on top of N.models3d (models3d.js parses GLBs; props are parsed on demand from here) and,
 * like models3d, never edits another module: it uses the documented N.view3d hooks only.
 *
 *  - Trees: registerStructure('tree') replaces the core's procedural trees by kind (coconut, palm, neem,
 *    banyan, gulmohar (flowering in summer, else the green variant), ashoka, mango, tamarind; peepal ->
 *    tamarind). One batch per chunk: an InstancedMesh per model and LOD (LOD0 / LOD1 / LOD2 / camera-
 *    facing IMPOSTOR) holding the chunk's trees; every few frames each tree is assigned the LOD for
 *    its camera distance. Wind: a shared vertex shader reads the baked `_WIND` attribute (three:
 *    `_wind`, renamed aWind; 0..255: R bend 0 at the trunk base -> 1 at tips, G flutter phase, B
 *    flutter mask) and the uniforms below. If no tree model is available the builder falls back to the
 *    core's procedural trunk / canopy instances (same look as before).
 *  - Rocks: registerStructure('rock') -> Deccan boulder models (rock_deccan_1/3), instanced per chunk.
 *  - Podiums: registerStructure('podium') -> podium_umbrella.
 *  - Landmarks by draw id: pushcarts (banana_cart flower_cart samosa_bandi dosa_bandi coconut_cart
 *    chai_bandi), std_booth, bus_stop, playground_kit (swing + slide + see-saw).
 *  - Animals: traffic.js animals (cow / dog / goat) are routed with e.view3d to 'm3d:animal:<id>'
 *    (skinned model + clips: cow stand / walk / lie, dog walk / run / sit / lie, goat stand / walk /
 *    graze; locomotion clips play at speed / nominal so the stride matches the ground speed).
 *
 * Public API — N.models3d.props:
 *   ready, ensure(ids) -> Promise<bool[]>   parse prop models on demand (birds, poles, street props)
 *   instance(id)        clone (shared geometry / materials) or null if not parsed
 *   animated(id)        {object, clips, play(name, {fade, loop, timeScale}), update(dt), dispose()}
 *   wires(id)           {wire_L1: THREE.Vector3, ...} pole wire attachment points in the GLB frame
 *                       (Y up, front = +Z; rotate / scale with the pole object)
 *   windMaterial(src, {height, impostor}) -> a wind-animated clone of a model material
 *   wind                {dir (radians, world x/y), strength (0..1, 0.3 = breeze), gust (gustiness 0..1)}:
 *                       used only without the atmosphere layer (then it follows N.wind {dir, strength,
 *                       gustiness}); with it, the tree shader shares N.wind.uniforms(THREE)
 *   windUniforms        {uWind: vec4(dirX, dirZ, strength, gustiness), uWindWave: vec4(1 / wavelength,
 *                        gust front (u), time (s), 0), shared: true when they are the atmosphere's}
 *   options             {trees, rocks, podiums, landmarks, animals, lodScale}
 *   stats(), debug
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const M3 = () => N.models3d;

  const OPT = { trees: true, rocks: true, podiums: true, landmarks: true, animals: true, lodScale: 1 };
  const TREE_IDS = {
    coconut: 'tree_coconut', palm: 'tree_palm', neem: 'tree_neem', banyan: 'tree_banyan', gulmohar: 'tree_gulmohar',
    ashoka: 'tree_ashoka', mango: 'tree_mango', tamarind: 'tree_tamarind', peepal: 'tree_tamarind',
  };
  const ANIMAL_IDS = { cow: 'cow', dog: 'dog', goat: 'goat' };
  const LM_IDS = {
    banana_cart: 'cart_banana', flower_cart: 'cart_flower', samosa_bandi: 'cart_samosa', dosa_bandi: 'cart_dosa',
    coconut_cart: 'cart_coconut', chai_bandi: 'cart_chai', std_booth: 'booth_std', bus_stop: 'bus_shelter',
  };
  const PLAYGROUND = ['play_swing', 'play_slide', 'play_seesaw'];
  const ROCK_IDS = ['rock_deccan_1', 'rock_deccan_3'];
  const S = {
    state: 'idle', THREE: null, trees: new Map(), batches: new Set(), frame: 0, regs: [], routed: 0,
    lmKeys: [], structs: [], camX: 1e9, camZ: 1e9, lodT: 0, treeCount: 0, mats: new Map(),
  };
  let THREE = null;

  /* ================================================================ wind */
  // Wind state. With the atmosphere layer (N.wind.uniforms(THREE), src/atmosphere.js) the tree shader
  // shares its uniforms (uWind = dx, dz, strength 0..1, gustiness; uWindWave = 1 / wavelength, gust
  // front, time) so Blender trees sway with the same gust fronts as everything else; otherwise this
  // file drives its own copy from WIND (or a plain N.wind {dir, strength, gustiness}).
  const WIND = { dir: 0.6, strength: 0.3, gust: 0.5 };
  const WU = { uWind: { value: null }, uWindWave: { value: null }, shared: false };
  let front = 0;
  function bindWind() {
    const W = N.wind;
    if (W && typeof W.uniforms === 'function') {
      try {
        const u = W.uniforms(THREE);
        if (u && u.uWind && u.uWindWave) { WU.uWind = u.uWind; WU.uWindWave = u.uWindWave; WU.shared = true; return; }
      } catch (e) { /* fall back to our own uniforms */ }
    }
    WU.uWind = { value: new THREE.Vector4(1, 0, WIND.strength, WIND.gust) };
    WU.uWindWave = { value: new THREE.Vector4(1 / 520, 0, 0, 0) };
  }
  function updateWind(dt, H) {
    if (WU.shared) return;   // the atmosphere layer updates the shared uniforms
    const w = N.wind;
    if (w && typeof w === 'object') {
      if (isFinite(w.dir)) WIND.dir = w.dir;
      if (isFinite(w.strength)) WIND.strength = w.strength;
      if (isFinite(w.gustiness)) WIND.gust = w.gustiness;
    }
    front = (front + (dt || 0) * 60) % (520 * 64);
    WU.uWind.value.set(Math.cos(WIND.dir), Math.sin(WIND.dir), WIND.strength, WIND.gust);
    const t = isFinite(H.time) ? H.time : (N.view3d && N.view3d.time) || performance.now() / 1000;
    WU.uWindWave.value.set(1 / 520, front, t % 10000, 0);
  }
  // Shared GLSL: world wind direction -> instance-local displacement (uniform-scaled instances).
  const WIND_VERT_COMMON = [
    'attribute vec4 aWind;',
    'uniform vec4 uWind;',
    'uniform vec4 uWindWave;',
    'uniform float uTreeH;',
    'varying float vWindFl;',
  ].join('\n');
  const WIND_VERT = [
    '#include <begin_vertex>',
    '{',
    '  vec4 wd = aWind / 255.0;',
    '  float bend = wd.x, fph = wd.y * 6.2832, fl = wd.z;',
    '  mat3 im = mat3(1.0); vec3 ip = vec3(0.0);',
    '#ifdef USE_INSTANCING',
    '  im = mat3(instanceMatrix); ip = instanceMatrix[3].xyz;',
    '#endif',
    '  float isc = max(length(im[1]), 1e-3);',
    '  vec3 wp = (modelMatrix * vec4(ip, 1.0)).xyz;',
    '  vec3 dW = vec3(uWind.x, 0.0, uWind.y);',
    '  vec3 dl = vec3(dot(im[0], dW), dot(im[1], dW), dot(im[2], dW)) / isc;',
    '  vec3 sl = vec3(-dl.z, 0.0, dl.x);',
    '  float iph = wp.x * 0.071 + wp.z * 0.053;',
    '  float uTime = uWindWave.z;',
    '  float gph = (dot(wp.xz, uWind.xy) - uWindWave.y) * uWindWave.x;',
    '  float gw = max(0.0, sin(gph * 6.2831853) + 0.35 * sin(gph * 18.849556 + 1.3)); gw = min(1.0, gw * gw * 0.8);',
    '  float str = uWind.z * (0.72 + 0.62 * uWind.w * gw) * 1.6;',
    '  float b2 = bend * bend;',
    '  float sway = b2 * str * (0.55 + 0.45 * sin(uTime * 0.95 + iph) + 0.18 * sin(uTime * 2.1 + iph * 1.7));',
    '  vec3 off = dl * sway * uTreeH * 0.045;',
    '  off += sl * b2 * str * sin(uTime * 1.45 + iph * 1.3 + fph * 0.35) * uTreeH * 0.012;',
    '  float fq = fl * bend * (0.35 + str) * sin(uTime * (6.5 + 2.0 * wd.y) + fph + iph * 3.0);',
    '  off += (objectNormal * 0.55 + vec3(0.0, 0.45, 0.0)) * fq * uTreeH * 0.006;',
    '  transformed += off;',
    '  transformed.y -= dot(off.xz, off.xz) / max(uTreeH, 1.0) * 0.6;',
    '  vWindFl = fl;',
    '}',
  ].join('\n');
  // camera-facing (cylindrical) impostor quad: rotate about local Y towards the camera
  const IMP_NORMAL = [
    '#include <beginnormal_vertex>',
    'mat3 bim = mat3(1.0); vec3 bip = vec3(0.0);',
    '#ifdef USE_INSTANCING',
    'bim = mat3(instanceMatrix); bip = instanceMatrix[3].xyz;',
    '#endif',
    'vec3 bwo = (modelMatrix * vec4(bip, 1.0)).xyz;',
    'vec3 bcw = cameraPosition - bwo; bcw.y = 0.0; bcw = normalize(bcw + vec3(1e-4, 0.0, 0.0));',
    'vec3 bcl = vec3(dot(bim[0], bcw), dot(bim[1], bcw), dot(bim[2], bcw));',
    'float bang = atan(bcl.x, bcl.z);',
    'float bca = cos(bang), bsa = sin(bang);',
    'objectNormal = normalize(vec3(bsa, 0.7, bca));',
  ].join('\n');
  const IMP_VERT = [
    '#include <begin_vertex>',
    'transformed = vec3(position.x * bca + position.z * bsa, position.y, -position.x * bsa + position.z * bca);',
  ].join('\n');
  // near-camera fade for a whole tree at once: measured from the trunk base (instance origin) to the camera,
  // not per pixel, so a tall trunk beside the chase camera vanishes cleanly instead of dissolving into dots
  const NEAR_VERT = [
    '#include <project_vertex>',
    '#ifdef USE_INSTANCING',
    'vec4 nfo = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
    '#else',
    'vec4 nfo = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
    '#endif',
    'vNearObj = length(nfo.xz - cameraPosition.xz);',
  ].join('\n');
  const NEAR_FRAG = [
    '#include <clipping_planes_fragment>',
    '{ float nfd = vNearObj / 9.0; if (nfd < 1.0) { vec2 c = mod(floor(gl_FragCoord.xy * 0.5), 4.0), l = mod(c, 2.0), h = floor(c * 0.5);',
    '  float b = (4.0 * (2.0 * abs(l.x - l.y) + l.y) + 2.0 * abs(h.x - h.y) + h.y + 0.5) / 16.0;',
    '  if (b > smoothstep(0.55, 1.0, nfd)) discard; } }',
  ].join('\n');

  /** a wind-animated clone of a GLB material (trees, clotheslines, kites...). opts.height = model
   *  height in model units (amplitudes scale with it), opts.impostor = billboard quad. */
  function windMaterial(src, opts) {
    const o = opts || {};
    const m = src.clone();
    m.side = THREE.DoubleSide;
    m.vertexColors = false;
    if (o.impostor) { m.alphaTest = 0.5; m.transparent = false; }
    const U = { uTreeH: { value: o.height || 30 } };
    m.userData = Object.assign({}, src.userData, { shared: true, wind: true });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = WU.uWind; sh.uniforms.uWindWave = WU.uWindWave; sh.uniforms.uTreeH = U.uTreeH;
      let v = sh.vertexShader.replace('#include <common>', '#include <common>\n' + WIND_VERT_COMMON);
      if (o.impostor) v = v.replace('#include <beginnormal_vertex>', IMP_NORMAL).replace('#include <begin_vertex>', IMP_VERT + '\n' + WIND_VERT.replace('#include <begin_vertex>', ''));
      else v = v.replace('#include <begin_vertex>', WIND_VERT);
      v = v.replace('#include <common>', '#include <common>\nvarying float vNearObj;').replace('#include <project_vertex>', NEAR_VERT);
      sh.vertexShader = v;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vWindFl;\nvarying float vNearObj;')
        .replace('#include <clipping_planes_fragment>', NEAR_FRAG);
    };
    m.customProgramCacheKey = () => (o.impostor ? 'm3dp-wind-imp' : 'm3dp-wind');
    m.needsUpdate = true;
    return m;
  }

  /* ================================================================ model access */
  const mdOf = (id) => { const A = M3(); return (A && A.debug && A.debug.S.models.get(id)) || null; };
  function nodeMesh(md, name) {
    let out = null;
    md.scene.traverse((o) => { if (!out && o.isMesh && (o.name === name || (o.parent && o.parent.name === name))) out = o; });
    return out;
  }
  function prepGeo(geo) {
    if (geo.attributes._wind && !geo.attributes.aWind) { geo.setAttribute('aWind', geo.attributes._wind); geo.deleteAttribute('_wind'); }
    geo.userData.shared = true;
    return geo;
  }
  /** parse prop ids on demand (Promise<bool[]>) */
  function ensure(ids) {
    const A = M3();
    if (!A || !A.ready) return Promise.resolve(ids.map(() => false));
    return Promise.all(ids.map((id) => (A.has(id) ? A.parse(id).then((md) => !!md) : Promise.resolve(false))));
  }
  function instance(id) {
    const A = M3();
    const o = A && A.loaded(id) ? A.instance(id) : null;
    if (o) o.traverse((m) => { if (m.isMesh && m.geometry) prepGeo(m.geometry); });
    return o;
  }

  /* ================================================================ trees */
  function treeRec(id) {
    if (S.trees.has(id)) return S.trees.get(id);
    const md = mdOf(id);
    if (!md) { S.trees.set(id, null); return null; }
    const meta = md.meta || {};
    // the GLB spreads its LOD nodes along +X for the preview line-up: put them back on the origin and
    // show only LOD0, so a plain N.models3d.instance(tree id) is one sensible tree
    const lodNodes = new Set((meta.lods || []).map((l) => l.node).concat(meta.impostor ? [meta.impostor.node] : []));
    md.scene.traverse((o) => { if (lodNodes.has(o.name)) { o.position.set(0, 0, 0); o.visible = /_LOD0$/.test(o.name); } });
    md.scene.updateMatrixWorld(true);
    const lods = [];
    for (const L of meta.lods || []) {
      const mesh = nodeMesh(md, L.node);
      if (!mesh) continue;
      const key = id + ':' + L.node;
      let mat = S.mats.get(key);
      if (!mat) { mat = windMaterial(mesh.material, { height: meta.height || 30 }); S.mats.set(key, mat); }
      lods.push({ geo: prepGeo(mesh.geometry), mat, from: L.from || 0, lod: L.lod });
    }
    let imp = null;
    if (meta.impostor) {
      const mesh = nodeMesh(md, meta.impostor.node);
      if (mesh) {
        const key = id + ':imp';
        let mat = S.mats.get(key);
        if (!mat) { mat = windMaterial(mesh.material, { height: meta.height || 30, impostor: true }); S.mats.set(key, mat); }
        imp = { geo: prepGeo(mesh.geometry), mat, from: meta.impostor.from || 800, imp: true };
      }
    }
    if (!lods.length) { S.trees.set(id, null); return null; }
    lods.sort((a, b) => a.from - b.from);
    const rec = { id, meta, levels: imp ? lods.concat([imp]) : lods, height: meta.height || 30, crown: (meta.crown && meta.crown[0]) || 20 };
    S.trees.set(id, rec);
    return rec;
  }
  function summer() {
    const se = N.seasons;
    try { if (se && se.is && (se.is('summer'))) return true; } catch (e) { /* ignore */ }
    try { const d = se && se.date && se.date(); if (d) { const mo = d.getMonth(); return mo >= 2 && mo <= 5; } } catch (e) { /* ignore */ }
    return false;
  }
  function treeModelFor(s, seed) {
    if (!OPT.trees || !M3() || !M3().options.enabled) return null;
    let id = TREE_IDS[s.kind] || 'tree_neem';
    if (s.kind === 'gulmohar') {
      const bloom = summer() ? (seed % 10) < 8 : (seed % 10) < 1;
      if (!bloom && treeRec('tree_gulmohar_green')) id = 'tree_gulmohar_green';
    }
    return treeRec(id) || treeRec('tree_neem');
  }
  const hash = (x, y) => (((Math.round(x) * 73856093) ^ (Math.round(y) * 19349663)) >>> 0);
  /** per chunk: called by the core for the first tree of the chunk job; builds the whole chunk's trees */
  function buildTrees(T, s, H, gb, J) {
    if (J._m3dTrees) return;
    J._m3dTrees = true;
    const list = (J.list || []).filter((q) => q && q.t === 'tree');
    const VS = H.VS || 1.5;
    const byModel = new Map();
    const fallback = [];
    for (const q of list) {
      const seed = hash(q.x, q.y);
      const rec = treeModelFor(q, seed);
      if (!rec) { fallback.push(q); continue; }
      const h3 = (q.h || 22) * VS * 0.95;
      const sc = h3 / rec.height;
      const r = q.r || 9;
      const sx = sc * clamp((2 * r * 1.08) / (rec.crown * sc), 0.82, 1.22);
      const yaw = ((seed >>> 8) % 6283) / 1000;
      const tint = 0.9 + ((seed >>> 4) % 100) / 500;
      let arr = byModel.get(rec);
      if (!arr) byModel.set(rec, (arr = []));
      arr.push({ x: q.x - J.ox, z: q.y - J.oz, wx: q.x, wz: q.y, sx, sy: sc, yaw, tint, size: h3, lod: -1 });
    }
    for (const q of fallback) proceduralTree(J, q, H);
    if (!byModel.size) return;
    const g = new THREE.Group();
    g.name = 'm3d-trees';
    g.position.set(J.ox, 0, J.oz);   // the core shifts returned objects by -J.ox / -J.oz (chunk-local)
    const batch = { group: g, models: [], added: false, dirty: true };
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), p = new THREE.Vector3(), sc3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    const shadows = !!(H.quality && H.quality.shadows);
    for (const [rec, arr] of byModel) {
      const ims = rec.levels.map((L) => {
        const im = new THREE.InstancedMesh(L.geo, L.mat, arr.length);
        im.count = 0;
        im.frustumCulled = false;
        im.castShadow = shadows && !L.imp && L.lod !== 2;
        im.receiveShadow = false;
        im.name = 'm3d-tree:' + rec.id + ':' + (L.imp ? 'imp' : 'lod' + L.lod);
        im.userData.noRay = true;
        im.raycast = () => {};
        g.add(im);
        return im;
      });
      const mats = arr.map((t) => {
        q4.setFromAxisAngle(up, t.yaw);
        p.set(t.x, 0, t.z); sc3.set(t.sx, t.sy, t.sx);
        m4.compose(p, q4, sc3);
        return m4.toArray(new Float32Array(16));
      });
      for (const im of ims) im.setColorAt(0, c.setRGB(1, 1, 1));   // allocates instanceColor (tints set in assignLods)
      batch.models.push({ rec, arr, mats, ims });
    }
    S.batches.add(batch);
    S.treeCount += list.length - fallback.length;
    assignLods(batch, true);
    return g;
  }
  // port of the core's procedural tree (view3d.js addTree) for kinds without a model / models off
  const TREEK = {
    neem: ['#2c5226', '#3a6a2e', '#4a7c36', '#5f9142'], banyan: ['#203f1e', '#2d5427', '#3b6830', '#4c7a3a'],
    gulmohar: ['#2f5a28', '#3f7032', '#4f8238', '#628f40'], ashoka: ['#1f4a24', '#2b5d2e', '#3a7038', '#4a8040'],
    palm: ['#3e6a2a', '#4f7f34', '#6a9440', '#2e5222'], coconut: ['#456f2c', '#588a36', '#74a046', '#33582a'],
    mango: ['#1c3f1c', '#28522a', '#376636', '#4a7a40'], tamarind: ['#2a4f24', '#386230', '#4a763a', '#5f8a46'],
    peepal: ['#25502a', '#326434', '#43783e', '#58904a'],
  };
  const FLOWERS = ['#e0482a', '#f07a2a', '#d83a24'];
  function proceduralTree(J, s, H) {
    const U = N.util, VS = H.VS || 1.5;
    const K = TREEK[s.kind] || TREEK.neem;
    const palm = s.kind === 'palm' || s.kind === 'coconut';
    const x = s.x - J.ox, z = s.y - J.oz, h = (s.h || 22) * VS * 0.95, r = s.r || 9;
    const seed = ((s.x * 73.1) ^ (s.y * 19.7)) >>> 0, rng = U.rng(seed);
    if (palm) {
      const th = h * 0.92, lean = (rng.next() - 0.5) * 0.12;
      J.trunks.push([x, 0, z, 0.55, th, 0.55, lean, rng.next() * TAU, '#7a6448']);
      J.crowns.push([x - Math.sin(lean) * th, th, z, r * 0.95, r * 0.75, r * 0.95, rng.next() * TAU, K[(seed >> 3) % 4]]);
      return;
    }
    const banyan = s.kind === 'banyan';
    const th = h * (banyan ? 0.42 : 0.48), tw = banyan ? 1.9 : 0.75 + r * 0.05;
    J.trunks.push([x, 0, z, tw, th + r * 0.3, tw, 0, rng.next() * TAU, banyan ? '#6a5a48' : '#5b4632']);
    const R = r * 1.05, cy = th + R * 0.55;
    const blobs = (s.blobs && s.blobs.length ? s.blobs : [[0, 0, r * 0.6]]).slice().sort((p, q) => q[2] - p[2]).slice(0, banyan ? 6 : 4);
    for (let k = 0; k < blobs.length; k++) {
      const bl = blobs[k], br = Math.max(2.4, bl[2] * 1.35);
      let col = K[(k + (seed & 3)) % 4];
      if (s.kind === 'gulmohar' && k % 2 === 0) col = FLOWERS[(seed + k) % 3];
      J.blobs.push([x + bl[0] * 1.05, cy + (rng.next() - 0.35) * R * 0.35 + (k === 0 ? R * 0.15 : 0), z + bl[1] * 1.05, br, br * (0.78 + rng.next() * 0.2), br, rng.next() * TAU, col]);
    }
  }
  function lodDist(L, size) { return L.from * OPT.lodScale * clamp(size / 35, 0.7, 1.6); }
  /** (re)assign every tree of a batch to the LOD for its camera distance */
  function assignLods(batch, force) {
    const cam = N.view3d && N.view3d.H && N.view3d.H.camera;
    const cx = cam ? cam.position.x : 0, cz = cam ? cam.position.z : 0;
    const low = N.view3d && N.view3d.H && N.view3d.H.quality && N.view3d.H.quality.tier === 'low';
    let changed = false;
    for (const M of batch.models) {
      const lv = M.rec.levels;
      for (const t of M.arr) {
        const d = Math.hypot(t.wx - cx, t.wz - cz) * (low ? 1.6 : 1);
        let k = 0;
        for (let i = lv.length - 1; i > 0; i--) if (d >= lodDist(lv[i], t.size)) { k = i; break; }
        if (k !== t.lod) { t.lod = k; changed = true; }
      }
      if (!changed && !force) continue;
      const counts = new Array(lv.length).fill(0);
      const col = new THREE.Color();
      for (let i = 0; i < M.arr.length; i++) {
        const t = M.arr[i], im = M.ims[t.lod], n = counts[t.lod]++;
        im.instanceMatrix.array.set(M.mats[i], n * 16);
        if (im.instanceColor) { col.setRGB(t.tint, t.tint, t.tint * 0.98); im.setColorAt(n, col); }
      }
      for (let k = 0; k < lv.length; k++) {
        const im = M.ims[k];
        im.count = counts[k];
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.visible = counts[k] > 0;
      }
    }
    return changed;
  }
  function updateLods() {
    const cam = N.view3d.H.camera;
    const moved = Math.hypot(cam.position.x - S.camX, cam.position.z - S.camZ);
    if (moved < 6 && S.frame - S.lodT < 30) return;
    S.camX = cam.position.x; S.camZ = cam.position.z; S.lodT = S.frame;
    for (const b of S.batches) {
      if (b.group.parent) b.added = true;
      else if (b.added) { S.batches.delete(b); continue; }
      else if (S.frame - (b.born || (b.born = S.frame)) > 600) { S.batches.delete(b); continue; }
      assignLods(b, false);
    }
  }

  /* ================================================================ rocks (instanced per chunk) */
  function buildRocks(T, s, H, gb, J) {
    if (J._m3dRocks) return;
    J._m3dRocks = true;
    const recs = ROCK_IDS.map((id) => mdOf(id)).filter(Boolean);
    const list = (J.list || []).filter((q) => q && q.t === 'rock');
    if (!recs.length || !OPT.rocks) { for (const q of list) proceduralRock(J, q); return; }
    const per = recs.map(() => []);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const s2 of list) {
      const x = s2.x - J.ox, z = s2.y - J.oz;
      const parts = s2.parts || [[0, 0, s2.r, 0, s2.h]];
      let k = 0;
      for (const pt of parts) {
        const seed = hash(s2.x + pt[0] * 7, s2.y + pt[1] * 5) + k++;
        const r = pt[2], h0 = pt[3] || 0, h1 = pt[4] || s2.h || r, hh = Math.max(1, (h1 - h0) * 1.15);
        const wide = r * 2 > hh * 1.6 && recs.length > 1 ? 1 : 0;
        const md = recs[wide];
        const sz = md.man.size || [10, 10, 10];
        q4.setFromAxisAngle(up, (seed % 628) / 100);
        p.set(x + pt[0], h0 > 0 ? h0 * 1.15 : -hh * 0.12, z + pt[1]);
        sc.set((2 * r) / Math.max(sz[0], 0.1), hh / Math.max(sz[2], 0.1), (2 * r) / Math.max(sz[1], 0.1));
        m4.compose(p, q4, sc);
        per[wide].push(m4.clone());
      }
    }
    const g = new THREE.Group();
    g.name = 'm3d-rocks';
    g.position.set(J.ox, 0, J.oz);
    const shadows = !!(H.quality && H.quality.shadows);
    per.forEach((arr, i) => {
      if (!arr.length) return;
      const md = recs[i];
      md.scene.traverse((o) => {
        if (!o.isMesh || /^COL_/.test(o.name)) return;
        const im = new THREE.InstancedMesh(prepGeo(o.geometry), o.material, arr.length);
        arr.forEach((mm, k) => im.setMatrixAt(k, mm));
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = false; im.castShadow = shadows; im.receiveShadow = shadows;
        im.name = 'm3d-rocks:' + md.id;
        g.add(im);
      });
    });
    return g;
  }
  function proceduralRock(J, s) {
    const U = N.util, x = s.x - J.ox, z = s.y - J.oz, rng = U.rng(((s.x * 31) ^ (s.y * 17)) >>> 0);
    for (const p of s.parts || [[0, 0, s.r, 0, s.h]]) {
      const r = p[2], h0 = p[3] || 0, h1 = p[4] || s.h, hh = (h1 - h0) * 1.15;
      const base = h0 > 0 ? h0 * 1.15 : -hh * 0.25;
      J.rocks.push([x + p[0], base + hh * 0.5, z + p[1], r * 1.02, hh * 0.56, r * (0.85 + rng.next() * 0.15), rng.next() * TAU, s.col || '#8f8a86']);
    }
  }

  /* ================================================================ podiums */
  function buildPodium(T, s, H) {
    const o = instance('podium_umbrella');
    if (!o) return;
    o.position.set(s.x, 0, s.y);   // world; the core makes it chunk-local
    o.rotation.y = ((hash(s.x, s.y) % 628) / 100);
    return o;
  }

  /* ================================================================ landmarks (carts, booth, shelter, playground) */
  const FR = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
  function rotFor(lm) { if (isFinite(lm.faceAngle)) return Math.PI / 2 - lm.faceAngle; return FR[lm.face] || 0; }
  function fitScale(id, lm) {
    const md = mdOf(id), sz = (md && md.man.size) || [10, 10, 10];
    const ns = !lm.face || lm.face === 'n' || lm.face === 's' || isFinite(lm.faceAngle);
    const W = ns ? lm.w : lm.d, D = ns ? lm.d : lm.w;
    if (!W || !D) return 1;
    return clamp(Math.min(W / sz[0], D / sz[1]) * 0.98, 0.65, 1.1);
  }
  function lmBuilder(id) {
    return (T, lm) => {
      const o = instance(id);
      if (!o) return null;
      const g = new THREE.Group();
      g.name = 'm3dp-lm:' + id + ':' + lm.id;
      o.rotation.y = rotFor(lm);
      const k = fitScale(id, lm);
      o.scale.setScalar(k);
      g.add(o);
      return g;
    };
  }
  function playgroundBuilder(T, lm) {
    const g = new THREE.Group();
    g.name = 'm3dp-lm:playground:' + lm.id;
    const rot = rotFor(lm);
    const ns = !lm.face || lm.face === 'n' || lm.face === 's' || isFinite(lm.faceAngle);
    const W = (ns ? lm.w : lm.d) || 40, D = (ns ? lm.d : lm.w) || 30;
    const inner = new THREE.Group();
    inner.rotation.y = rot;
    const xs = [-W * 0.3, 0.02 * W, W * 0.32];
    let n = 0;
    PLAYGROUND.forEach((id, i) => {
      const o = instance(id);
      if (!o) return;
      const md = mdOf(id), sz = (md && md.man.size) || [10, 10, 10];
      const k = clamp(Math.min((W / 3) / sz[0], D / sz[1]) * 0.95, 0.5, 1.2);
      o.scale.setScalar(k);
      o.position.set(xs[i], 0, (i === 1 ? -0.1 : 0.12) * D);
      inner.add(o); n++;
    });
    if (!n) return null;
    g.add(inner);
    return g;
  }
  function registerLandmarks() {
    const V3 = N.view3d;
    for (const [draw, id] of Object.entries(LM_IDS)) {
      if (!mdOf(id)) continue;
      V3.registerLandmark(draw, lmBuilder(id), { castShadow: true });
      S.lmKeys.push(draw);
    }
    if (PLAYGROUND.some((id) => mdOf(id))) { V3.registerLandmark('playground_kit', playgroundBuilder, { castShadow: true }); S.lmKeys.push('playground_kit'); }
  }

  /* ================================================================ animated instances (animals, birds) */
  function animated(id) {
    const md = mdOf(id);
    const o = instance(id);
    if (!md || !o) return null;
    const mixer = new THREE.AnimationMixer(o);
    const acts = new Map();
    for (const [name, c] of md.clips) acts.set(name, mixer.clipAction(c));
    const A = {
      object: o, mixer, clips: md.man.clips || {}, cur: null, curName: null,
      has: (n) => acts.has(n),
      play(name, opts) {
        const op = opts || {};
        const a = acts.get(name);
        if (!a) return false;
        if (op.timeScale != null) a.timeScale = op.timeScale;
        if (A.curName === name) return true;
        a.reset();
        a.setLoop(op.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        a.clampWhenFinished = op.loop === false;
        a.play();
        if (A.cur && (op.fade == null || op.fade > 0)) A.cur.crossFadeTo(a, op.fade == null ? 0.3 : op.fade, false);
        else if (A.cur) A.cur.stop();
        A.cur = a; A.curName = name;
        return true;
      },
      timeScale(v) { if (A.cur) A.cur.timeScale = v; },
      update(dt) { mixer.update(dt); },
      dispose() { mixer.stopAllAction(); mixer.uncacheRoot(o); if (o.parent) o.parent.remove(o); },
    };
    return A;
  }

  /* ---------------------------------------------------------------- animals */
  function animalClip(e, A) {
    const v = Math.hypot(e.vx || 0, e.vy || 0);
    const pick = (...n) => n.find((x) => A.has(x));
    const loco = (name) => {
      const c = A.clips[name] || {};
      const nom = c.nominal || (e.species === 'cow' ? 25 : e.species === 'goat' ? 12 : 22);
      return [name, clamp(v / nom, 0.35, 2.5)];
    };
    if (e.species === 'cow') {
      if (e.state === 'lie' && e.getUpT == null) return [pick('lie', 'stand'), 1];
      if (e.state === 'lie') return [pick('getup', 'stand'), 1];
      if (e.moving && v > 2) return loco(pick('walk', 'stand'));
      return [pick('stand', 'idle'), 1];
    }
    if (e.species === 'dog') {
      if (e.state === 'nap') return [pick('lie', 'sit'), 1];
      if (v > 42) return loco(pick('run', 'walk'));
      if (v > 3) return loco(pick('walk', 'run'));
      return [pick('sit', 'stand', 'lie'), 1];
    }
    if (v > 2) return loco(pick('walk', 'stand'));
    return [pick('graze', 'stand'), 1];
  }
  function animalSpec(id) {
    return {
      create(e, H) {
        const A = animated(id);
        if (!A) return new THREE.Group();
        const outer = new THREE.Group();
        outer.name = 'm3dp-animal:' + id;
        const pivot = new THREE.Group();
        pivot.rotation.y = Math.PI / 2;
        pivot.add(A.object);
        outer.add(pivot);
        if (!(H.quality && H.quality.shadows) && H.blobShadow) {
          const sz = (mdOf(id) && mdOf(id).man.size) || [4, 8, 4];
          const b = H.blobShadow(sz[1] * 0.9, sz[0] * 1.3);
          if (b) outer.add(b);
        }
        A.object.traverse((m) => { if (m.isMesh) { m.castShadow = !!(H.quality && H.quality.shadows); m.raycast = () => {}; } });
        outer.userData.m3dAnim = A;
        A.phase = (hash(e.x || 0, e.y || 0) % 1000) / 1000;
        return outer;
      },
      update(obj, e, dt, H) {
        obj.position.set(e.x, H.elev ? H.elev(e) : 0, e.y);
        obj.rotation.y = -(e.angle || 0);
        const A = obj.userData.m3dAnim;
        if (!A) return;
        const [name, ts] = animalClip(e, A);
        if (name) { A.play(name, { fade: 0.35 }); A.timeScale(ts); }
        A.update(Math.min(dt, 0.1));
      },
      dispose(obj) { const A = obj && obj.userData.m3dAnim; if (A) A.dispose(); },
    };
  }
  function tracked(e) {
    const A = N.view3dActors, D = A && A.debug && A.debug.DBG;
    return !!(D && D.track && D.track === e);
  }
  function routeAnimals() {
    const V3 = N.view3d;
    const f = V3.focus ? V3.focus() : N.player;
    if (!f) return;
    let list = [];
    try { list = N.entities.query(f.x, f.y, (V3.quality && V3.quality.actorDist) || 620); } catch (e) { list = []; }
    let n = 0;
    const on = OPT.animals && M3().options.enabled;
    for (const e of list) {
      if (!e || e.kind !== 'animal') continue;
      const id = ANIMAL_IDS[e.species];
      const key = on && id && mdOf(id) && e.alive !== false && !tracked(e) ? 'm3d:animal:' + id : null;
      if (key) { if (e.view3d !== key) e.view3d = key; n++; } else if (e.view3d && String(e.view3d).indexOf('m3d:animal:') === 0) delete e.view3d;
    }
    S.routed = n;
  }
  function unrouteAnimals() {
    try { for (const e of N.entities.all || []) if (e && e.view3d && String(e.view3d).indexOf('m3d:animal:') === 0) delete e.view3d; } catch (e) { /* ignore */ }
  }

  /* ================================================================ start-up */
  const WANT = () => Object.values(TREE_IDS).concat(['tree_gulmohar_green'], Object.values(ANIMAL_IDS), Object.values(LM_IDS), PLAYGROUND, ROCK_IDS, ['podium_umbrella']);
  async function start() {
    if (S.state !== 'idle') return;
    S.state = 'loading';
    THREE = S.THREE = window.THREE;
    bindWind();
    try {
      const ids = Array.from(new Set(WANT())).filter((id) => M3().has(id));
      await ensure(ids);
      const V3 = N.view3d;
      if (Object.values(TREE_IDS).some((id) => treeRec(id))) { V3.registerStructure('tree', buildTrees); S.structs.push('tree'); }
      if (ROCK_IDS.some((id) => mdOf(id))) { V3.registerStructure('rock', buildRocks); S.structs.push('rock'); }
      if (OPT.podiums && mdOf('podium_umbrella')) { V3.registerStructure('podium', buildPodium); S.structs.push('podium'); }
      if (OPT.landmarks) registerLandmarks();
      for (const id of Object.values(ANIMAL_IDS)) if (mdOf(id)) { V3.registerActorRenderer('m3d:animal:' + id, animalSpec(id)); S.regs.push('m3d:animal:' + id); }
      S.state = 'ready';
      N.emit('models3d:props', { trees: Array.from(S.trees.keys()).filter((k) => S.trees.get(k)), structs: S.structs.slice(), landmarks: S.lmKeys.slice(), animals: S.regs.slice() });
    } catch (e) {
      S.state = 'failed';
      N.err('models3d_props.start', e);
    }
  }

  const api = {
    OPT, options: OPT, wind: WIND, windUniforms: WU,
    get ready() { return S.state === 'ready'; },
    get state() { return S.state; },
    ensure, instance, animated, windMaterial: (src, o) => windMaterial(src, o),
    wires(id) {
      const A = M3(), m = A && A.manifest(id);
      if (!m || !THREE) return null;
      const out = {};
      for (const [k, v] of Object.entries(m.anchors || {})) if (k.indexOf('wire_') === 0) out[k] = new THREE.Vector3(v[0], v[2], -v[1]);
      return out;
    },
    treeFor: (kind) => TREE_IDS[kind] || null,
    stats() {
      let inst = 0;
      const lod = [0, 0, 0, 0];
      for (const b of S.batches) for (const M of b.models) for (const t of M.arr) { inst++; if (t.lod >= 0) lod[Math.min(3, M.rec.levels[t.lod].imp ? 3 : M.rec.levels[t.lod].lod)]++; }
      return { state: S.state, trees: Array.from(S.trees.entries()).filter(([, r]) => r).map(([k]) => k), batches: S.batches.size, treeInstances: inst, lodCounts: lod, structs: S.structs.slice(), landmarks: S.lmKeys.slice(), animals: S.regs.slice(), routedAnimals: S.routed, wind: Object.assign({}, WIND) };
    },
    debug: { S, assignLods, treeRec, animalClip },
  };

  N.addSystem({
    id: 'models3d_props', order: 63, runIn: ['*'],
    update() {
      const A = M3(), V3 = N.view3d;
      if (!A || !V3) return;
      if (S.state === 'idle' && A.ready && window.THREE && V3.ready) start();
      if (S.state === 'ready' && V3.active) { try { routeAnimals(); } catch (e) { N.err('models3d_props.route', e); } }
    },
  });
  if (N.view3d && N.view3d.registerLayer) {
    N.view3d.registerLayer('models3d_props', {
      order: 41,
      update(dt, H) {
        S.frame++;
        if (!WU.uWind.value) return;
        updateWind(dt, H);
        if (S.batches.size) { try { updateLods(); } catch (e) { N.err('models3d_props.lod', e); } }
      },
    });
  }
  N.on('view:change', (d) => { if (d && d.mode === 'top') unrouteAnimals(); });
  if (N.models3d) N.models3d.props = api;
  else N.on('models3d:ready', () => { if (N.models3d) N.models3d.props = api; });
})();
