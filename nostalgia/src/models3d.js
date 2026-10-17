/* NOSTALGIA — models3d.js (pipeline technical artist) — ARCHITECTURE §21 "Blender asset pipeline"
 *
 * Runtime for the Blender-authored models (tools/blender/*.py -> assets3d/*.glb -> src/assets3d_pack.js).
 * Nothing here runs in the top-down view: the first time 3D starts (N.view3d.ready), it loads
 * vendor/three/GLTFLoader.classic.js and the pack (N.ASSETS3D) lazily — from inline
 * <script type="text/plain" id="gltfloader-src"> / id="assets3d-pack"> blocks in dist/nostalgia.html,
 * else from the files next to the page — parses the GLBs it needs and registers overrides with
 * N.view3d. The procedural renderers (view3d_actors.js / view3d_landmarks.js) stay registered and
 * are the per-entity / per-landmark fallback whenever a model is missing, failed, disabled or
 * cannot show a state (riding, sitting, falling...).
 *
 * Public API — N.models3d:
 *   ready            true once the pack is loaded and the active models are parsed
 *   state            'idle' | 'loading' | 'ready' | 'missing' (no pack / loader) | 'failed'
 *   has(id)          the pack has a usable model `id`
 *   load()           start loading now (Promise<boolean>); 3D does this by itself
 *   instance(id)     Object3D clone (shared geometry + materials, skinned meshes rebound), GLB frame
 *                    (front = +Z); null when not parsed
 *   character(id, look) -> {object, play(clip, {speed, fade, loop}), setSpeed(u/s), update(dt, dist),
 *                    tint(look), anchors, clip, phase, weights(), dispose()}: object faces +X (rotate
 *                    with rotation.y = -angle); locomotion clips are phase-driven from the distance
 *                    actually travelled (phase += dist / blended stride), so feet never slide.
 *   vehicleParts(id) -> {object, bones, wheels, steer, crank, pedals, anchors, set({dist, steer, crank}),
 *                    pose(v), dispose()}: spin / steer / pedal from the vehicle simulation.
 *   useProto         (get/set) landmark blockouts flagged proto (charminar_proto) replace the
 *                    procedural model only while this is true
 *   options          {enabled, player, vehicles, landmarks, kidPeds, env, nightGlow}
 *   stats(), debug   internals for tests
 * Conventions (binding, see ARCHITECTURE §21): GLB front = +Z (Blender -Y); actors get an inner
 * pivot rotation.y = PI/2 so the outer object uses the core's rotation.y = -angle; landmarks are
 * rotated by the landmark face like view3d_landmarks (FR = {s: 0, n: PI, e: PI/2, w: -PI/2}).
 * Meshes named COL_* are invisible camera-ray proxies; detailed meshes skip ray casts. Materials
 * named *@night glow with N.view3d.H.night; metallic materials get a small sky environment map.
 *
 * Hooks into modules this file does not own: it sets / clears the documented per-entity key
 * `e.view3d` (ARCHITECTURE §20 key resolution) on the player and on vehicles it renders, so the
 * procedural specs stay registered underneath; it never edits another file.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const now = () => performance.now();
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };

  /* ================================================================ options + state */
  const OPT = { enabled: true, player: true, vehicles: true, landmarks: true, kidPeds: false, env: true, nightGlow: true };
  const LOADER_URLS = ['vendor/three/GLTFLoader.classic.js', '../vendor/three/GLTFLoader.classic.js', 'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/loaders/GLTFLoader.js'];
  const PACK_URLS = ['src/assets3d_pack.js', '../src/assets3d_pack.js'];
  const S = {
    state: 'idle', error: null, started: false, loadT: 0, loadMs: 0, parseMs: 0,
    loaderFrom: null, packFrom: null, models: new Map(), pending: new Map(), failed: new Map(),
    registered: new Set(), landmarkKeys: new Map(), prevLandmark: new Map(), instances: 0,
    routedPlayer: false, routedVehicles: 0, mats: new Set(), env: null, frame: 0,
  };
  let THREE = null;
  let useProto = lsGet('nostalgia.models3d.proto') === '1';

  /* ================================================================ lazy script loading */
  function loadScript(url, ok, timeout) {
    return new Promise((resolve) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; resolve(v); } };
      const s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = () => fin(ok());
      s.onerror = () => { s.remove(); fin(false); };
      setTimeout(() => fin(ok()), timeout || 15000);
      document.head.appendChild(s);
    });
  }
  /** run an inline <script type="text/plain" id=...> block (dist/nostalgia.html) */
  function runInline(id, ok) {
    const el = document.getElementById(id);
    if (!el || !el.textContent) return false;
    try {
      const s = document.createElement('script');
      s.textContent = el.textContent;
      document.head.appendChild(s);
      s.remove();
    } catch (e) { N.err('models3d.inline:' + id, e); return false; }
    return ok();
  }
  const hasLoader = () => !!(window.THREE && window.THREE.GLTFLoader);
  const hasPack = () => !!(N.ASSETS3D && N.ASSETS3D.glb && N.ASSETS3D.manifest);
  async function loadLoader() {
    if (hasLoader()) { S.loaderFrom = S.loaderFrom || 'present'; return true; }
    if (runInline('gltfloader-src', hasLoader)) { S.loaderFrom = 'inline'; return true; }
    for (const u of LOADER_URLS) {
      if (/^https?:/.test(u) && location.protocol === 'file:' && N.models3d.noCdn) continue;
      if (await loadScript(u, hasLoader, /^https?:/.test(u) ? 12000 : 8000)) { S.loaderFrom = u; return true; }
    }
    return false;
  }
  async function loadPack() {
    if (hasPack()) { S.packFrom = S.packFrom || 'present'; return true; }
    if (runInline('assets3d-pack', hasPack)) { S.packFrom = 'inline'; return true; }
    for (const u of N.models3d.packUrls || PACK_URLS) {
      if (await loadScript(u, hasPack, 20000)) { S.packFrom = u; return true; }
    }
    return false;
  }
  let loadPromise = null;
  function load() {
    if (loadPromise) return loadPromise;
    if (!OPT.enabled) return Promise.resolve(false);
    S.started = true; S.state = 'loading'; S.loadT = now();
    loadPromise = (async () => {
      try {
        THREE = window.THREE;
        if (!THREE) throw new Error('three.js is not loaded');
        const okL = await loadLoader();
        if (!okL) { S.state = 'missing'; S.error = 'GLTFLoader unavailable'; return false; }
        const okP = await loadPack();
        if (!okP) { S.state = 'missing'; S.error = 'assets3d pack unavailable'; return false; }
        S.loadMs = now() - S.loadT;
        await parseActive();
        S.state = 'ready';
        registerAll();
        N.emit('models3d:ready', { ids: Array.from(S.models.keys()) });
        return true;
      } catch (e) {
        S.state = 'failed'; S.error = String((e && e.message) || e);
        N.err('models3d.load', e);
        return false;
      }
    })();
    return loadPromise;
  }

  /* ================================================================ parsing */
  function b64ToBuffer(s) {
    const bin = atob(s), n = bin.length, u = new Uint8Array(n);
    for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  const manifest = (id) => (hasPack() && N.ASSETS3D.manifest[id]) || null;
  function wanted(id) {
    const m = manifest(id); if (!m) return false;
    const meta = m.meta || {};
    if (m.family === 'character') return OPT.player || OPT.kidPeds;
    if (m.family === 'vehicle') return OPT.vehicles;
    if (m.family === 'landmark' || m.family === 'hero_landmark') return OPT.landmarks && (!meta.proto || useProto);
    return true;
  }
  async function parseActive() {
    const ids = Object.keys(N.ASSETS3D.glb).filter(wanted);
    for (const id of ids) await parse(id);
  }
  function parse(id) {
    if (S.models.has(id)) return Promise.resolve(S.models.get(id));
    if (S.failed.has(id)) return Promise.resolve(null);
    if (S.pending.has(id)) return S.pending.get(id);
    const src = hasPack() && N.ASSETS3D.glb[id];
    if (!src || !THREE || !THREE.GLTFLoader) return Promise.resolve(null);
    const t0 = now();
    const p = new Promise((resolve) => {
      let buf;
      try { buf = b64ToBuffer(src); } catch (e) { S.failed.set(id, 'base64: ' + e.message); resolve(null); return; }
      try {
        new THREE.GLTFLoader().parse(buf, '', (g) => {
          let md = null;
          try { md = prepare(id, g); } catch (e) { S.failed.set(id, String(e.message || e)); N.err('models3d.prepare:' + id, e); }
          S.parseMs += now() - t0;
          S.pending.delete(id);
          if (md) S.models.set(id, md);
          resolve(md);
        }, (err) => {
          S.failed.set(id, String((err && err.message) || err));
          S.pending.delete(id);
          // a broken model is not a game error: the procedural renderer stays in charge
          console.warn('[models3d] ' + id + ' failed to parse: ' + S.failed.get(id));
          resolve(null);
        });
      } catch (e) { S.failed.set(id, String(e.message || e)); S.pending.delete(id); resolve(null); }
    });
    S.pending.set(id, p);
    return p;
  }
  const NOOP_RAY = () => {};
  let COL_MAT = null;
  function prepare(id, g) {
    const man = manifest(id) || {};
    const scene = g.scene || (g.scenes && g.scenes[0]);
    if (!scene) throw new Error('no scene');
    const md = { id, man, meta: man.meta || {}, scene, clips: new Map(), night: [], metal: [], floodlit: [], skinned: false };
    for (const c of g.animations || []) md.clips.set(c.name, c);
    if (!COL_MAT) { COL_MAT = new THREE.MeshBasicMaterial({ visible: false }); COL_MAT.userData.shared = true; }
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (/^COL_/.test(o.name) || (o.parent && /^COL_/.test(o.parent.name))) {
        o.material = COL_MAT; o.userData.noShadow = true; o.castShadow = false; o.receiveShadow = false; o.userData.collision = true;
        return;
      }
      o.userData.noRay = true;              // the camera ray uses the COL_ proxies (no BVH in three)
      if (o.isSkinnedMesh) { md.skinned = true; o.frustumCulled = false; }
      const geo = o.geometry;
      if (geo) geo.userData.shared = true;  // shared by every clone: the core's disposeObj must keep it
      if (geo && geo.attributes._region) { geo.setAttribute('aRegion', geo.attributes._region); geo.deleteAttribute('_region'); }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || S.mats.has(m)) continue;
        S.mats.add(m);
        m.userData.shared = true;           // H.dispose / core disposeObj must not free shared model materials
        m.userData.m3d = id;
        for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap']) if (m[k]) m[k].userData.shared = true;
        if (/@night$/.test(m.name)) { m.userData.nightBase = m.emissive ? m.emissive.clone() : null; md.night.push(m); m.emissiveIntensity = 0; }
        if ((m.metalness || 0) > 0.05 || m.metalnessMap) md.metal.push(m);
        if (md.meta.floodlit && m.map && !/@night$/.test(m.name)) { md.floodlit.push(m); m.emissiveMap = m.map; m.emissive = new THREE.Color(0xffc98a); m.emissiveIntensity = 0; }
        m.needsUpdate = true;
      }
    });
    if (md.metal.length && OPT.env) for (const m of md.metal) { m.envMap = envMap(); m.envMapIntensity = 0.6; }
    scene.updateMatrixWorld(true);
    return md;
  }
  /** a small gradient sky as a PMREM environment for metallic materials (chrome reads as chrome) */
  function envMap() {
    if (S.env) return S.env;
    const H = N.view3d && N.view3d.H;
    const r = H && H.renderer;
    if (!r) return null;
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, '#7fa9dc'); gr.addColorStop(0.45, '#dfe8ef'); gr.addColorStop(0.5, '#cfc4b0'); gr.addColorStop(0.56, '#8c7c66'); gr.addColorStop(1, '#3e352d');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 64);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.encoding = THREE.sRGBEncoding;
    const pm = new THREE.PMREMGenerator(r);
    S.env = pm.fromEquirectangular(t).texture;
    S.env.userData.shared = true;
    pm.dispose(); t.dispose();
    return S.env;
  }

  /* ================================================================ cloning (SkeletonUtils.clone logic, r149) */
  function parallel(a, b, cb) { cb(a, b); for (let i = 0; i < a.children.length; i++) parallel(a.children[i], b.children[i], cb); }
  function cloneScene(src) {
    const clone = src.clone(true);
    const srcOf = new Map(), cloneOf = new Map();
    parallel(src, clone, (a, b) => { srcOf.set(b, a); cloneOf.set(a, b); });
    clone.traverse((node) => {
      if (!node.isSkinnedMesh) return;
      const sm = srcOf.get(node);
      node.skeleton = sm.skeleton.clone();
      node.bindMatrix.copy(sm.bindMatrix);
      node.skeleton.bones = sm.skeleton.bones.map((b) => cloneOf.get(b));
      node.bind(node.skeleton, node.bindMatrix);
    });
    return clone;
  }
  function instance(id) {
    const md = S.models.get(id);
    if (!md) return null;
    const o = cloneScene(md.scene);
    o.name = 'm3d:' + id;
    o.userData.m3d = id;
    o.traverse((m) => { if (m.isMesh && m.userData.noRay) m.raycast = NOOP_RAY; });
    S.instances++;
    return o;
  }
  function findAnchors(root) {
    const out = {};
    root.traverse((o) => { if (o.name && o.name.indexOf('anchor_') === 0) out[o.name.slice(7)] = o; });
    return out;
  }
  function findBones(root) {
    const out = {};
    root.traverse((o) => { if (o.isBone) out[o.name] = o; });
    return out;
  }
  /** dispose an instance: only per-instance (non-shared) materials; geometry / textures are shared */
  function disposeInstance(o) {
    if (!o) return;
    o.traverse((m) => {
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const x of mats) if (x && !x.userData.shared) x.dispose();
    });
    if (o.parent) o.parent.remove(o);
  }

  /* ================================================================ tint (N.people looks -> regions) */
  const LOOK_FIELDS = { skin: ['skin'], hair: ['hair'], shirt: ['shirt', 'kameez', 'saree'], stripes: ['stripes'], pants: ['pants', 'lungi'], shoes: ['shoes', 'chappal'], accent: ['accent'] };
  function hexLin(h) {
    if (typeof h !== 'string') return null;
    let s = h.trim(); if (s[0] === '#') s = s.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const v = parseInt(s.slice(0, 6), 16); if (!isFinite(v)) return null;
    const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return [f((v >> 16) & 255), f((v >> 8) & 255), f(v & 255)];
  }
  function tintRatios(md, look) {
    const T = md.man.tint || {}, names = T.names || ['none'], base = T.regions || {};
    const out = [];
    for (let i = 0; i < 8; i++) {
      const r = names[i], b = r && hexLin(base[r]);
      let want = null;
      if (look && r && LOOK_FIELDS[r]) for (const f of LOOK_FIELDS[r]) if (look[f]) { want = hexLin(look[f]); break; }
      if (!b || !want) { out.push(new THREE.Vector3(1, 1, 1)); continue; }
      out.push(new THREE.Vector3(clamp(want[0] / Math.max(b[0], 0.004), 0, 8), clamp(want[1] / Math.max(b[1], 0.004), 0, 8), clamp(want[2] / Math.max(b[2], 0.004), 0, 8)));
    }
    return out;
  }
  function tintMaterial(src) {
    const m = src.clone();
    m.userData = Object.assign({}, src.userData, { shared: false, tinted: true });
    const U = { uTint: { value: [] } };
    for (let i = 0; i < 8; i++) U.uTint.value.push(new THREE.Vector3(1, 1, 1));
    m.userData.tintU = U;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTint = U.uTint;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aRegion;\nuniform vec3 uTint[8];\nvarying vec3 vTint;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvTint = uTint[int(clamp(aRegion + 0.5, 0.0, 7.0))];');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n\tdiffuseColor.rgb *= vTint;');
    };
    m.customProgramCacheKey = () => 'm3d-tint';
    m.needsUpdate = true;
    return m;
  }

  /* ================================================================ characters */
  const V_IDLE = 3;          // u/s below which a character stands
  const FADE = 0.18;         // s, idle <-> locomotion cross-fade
  class Character {
    constructor(md, look) {
      this.md = md; this.id = md.id;
      this.object = new THREE.Group(); this.object.name = 'm3d-char:' + md.id;
      this.pivot = instance(md.id); this.pivot.rotation.y = Math.PI / 2; // GLB front +Z -> +X
      this.object.add(this.pivot);
      this.mesh = null; this.pivot.traverse((o) => { if (o.isSkinnedMesh && !this.mesh) this.mesh = o; });
      this.anchors = findAnchors(this.pivot);
      this.bones = findBones(this.pivot);
      this.mixer = new THREE.AnimationMixer(this.pivot);
      this.actions = {}; this.loco = [];
      const clips = md.man.clips || {};
      for (const [name, clip] of md.clips) {
        const a = this.mixer.clipAction(clip);
        a.enabled = true; a.setEffectiveWeight(0); a.play();
        this.actions[name] = a;
        const c = clips[name] || {};
        if (c.loco && c.stride > 0) { a.paused = true; this.loco.push({ name, a, stride: c.stride, nominal: c.nominal || c.speed || 40, dur: clip.duration, gait: c.gait, w: 0 }); }
        else if (c.loop === false) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      }
      this.loco.sort((p, q) => p.nominal - q.nominal);
      this.idle = this.actions.idle || null;
      this.phase = 0; this.v = 0; this.locoW = 0; this.clip = 'idle';
      this.oneShot = null; this.oneW = 0; this.lookRef = null;
      if (this.idle) this.idle.setEffectiveWeight(1);
      if (look) this.tint(look);
      this.mixer.update(0);
    }
    /** dress from an N.people look (skin, hair, shirt, stripes, pants...) */
    tint(look) {
      this.lookRef = look;
      if (!this.mesh || !this.md.man.tint) return this;
      if (!this.tintMat) { this.tintMat = tintMaterial(this.mesh.material); this.mesh.material = this.tintMat; }
      const R = tintRatios(this.md, look), U = this.tintMat.userData.tintU.uTint.value;
      for (let i = 0; i < 8; i++) U[i].copy(R[i]);
      return this;
    }
    setSpeed(v) { this.v = Math.max(0, v || 0); return this; }
    /** one-shot or looping clip on top of locomotion: {fade, loop (default: the manifest's), speed} */
    play(name, o) {
      o = o || {};
      const a = this.actions[name];
      if (!a) return false;
      if (this.loco.some((l) => l.name === name) || name === 'idle') { this.oneShot = null; return true; }
      if (this.oneShot && this.oneShot.a !== a) this.oneShot.a.setEffectiveWeight(0);
      a.reset(); a.timeScale = o.speed || 1;
      if (o.loop === true) a.setLoop(THREE.LoopRepeat, Infinity);
      else if (o.loop === false) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      a.play();
      this.oneShot = { a, name, fade: o.fade != null ? o.fade : 0.2, t: 0 };
      return true;
    }
    stop(name) { if (this.oneShot && (!name || this.oneShot.name === name)) this.oneShot.stopping = true; }
    /** blend weights of the locomotion clips for speed v (piecewise linear between nominal speeds) */
    blend(v) {
      const L = this.loco; let S = 0;
      for (const l of L) l.w = 0;
      if (!L.length) return 1;
      if (v <= L[0].nominal) L[0].w = 1;
      else if (v >= L[L.length - 1].nominal) L[L.length - 1].w = 1;
      else for (let i = 0; i < L.length - 1; i++) if (v < L[i + 1].nominal) { const t = (v - L[i].nominal) / (L[i + 1].nominal - L[i].nominal); L[i].w = 1 - t; L[i + 1].w = t; break; }
      for (const l of L) S += l.w * l.stride;
      return S;
    }
    /** advance by sim dt; dist = distance travelled this frame (defaults to speed * dt) */
    update(dt, dist) {
      dt = Math.max(0, dt || 0);
      const v = this.v;
      const L = this.loco;
      const want = v > V_IDLE && L.length ? 1 : 0;
      this.locoW += clamp(want - this.locoW, -dt / FADE, dt / FADE);
      const stride = this.blend(Math.max(v, V_IDLE));
      if (dist == null) dist = v * dt;
      if (stride > 0 && want) this.phase = (this.phase + dist / stride) % 1;
      // one-shot overlay
      let oneW = 0;
      if (this.oneShot) {
        const os = this.oneShot; os.t += dt;
        const done = os.stopping || (os.a.loop === THREE.LoopOnce && !os.a.isRunning() && os.t > 0.05);
        this.oneW = clamp(this.oneW + (done ? -1 : 1) * dt / Math.max(0.01, os.fade), 0, 1);
        oneW = this.oneW;
        os.a.setEffectiveWeight(oneW);
        if (done && oneW <= 0) { os.a.setEffectiveWeight(0); this.oneShot = null; }
      }
      const base = 1 - oneW;
      let top = null, topW = -1;
      for (const l of L) {
        l.a.time = this.phase * l.dur;
        const w = base * this.locoW * l.w;
        l.a.setEffectiveWeight(w);
        if (w > topW) { topW = w; top = l.name; }
      }
      const idleW = base * (1 - this.locoW);
      if (this.idle) this.idle.setEffectiveWeight(L.length ? idleW : base);
      this.clip = this.oneShot ? this.oneShot.name : (idleW >= topW ? 'idle' : top);
      this.mixer.update(dt);
      return this;
    }
    weights() { const o = {}; for (const k in this.actions) o[k] = +this.actions[k].getEffectiveWeight().toFixed(3); return o; }
    dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.pivot); if (this.tintMat) this.tintMat.dispose(); disposeInstance(this.object); }
  }
  function character(id, look) {
    const md = S.models.get(id);
    if (!md || !md.clips.size) return null;
    try { return new Character(md, look); } catch (e) { N.err('models3d.character:' + id, e); return null; }
  }

  /* ================================================================ vehicles */
  const AX = { x: null, tmpQ: null, tmpQ2: null };
  /** axis (GLB model frame) expressed in a bone's local frame at bind time */
  function localAxis(bone, rootQinv, axis) {
    const q = new THREE.Quaternion();
    bone.getWorldQuaternion(q);
    q.premultiply(rootQinv);
    return axis.clone().applyQuaternion(q.invert()).normalize();
  }
  function vehicleParts(id) {
    const md = S.models.get(id);
    if (!md) return null;
    const meta = md.meta || {};
    const object = new THREE.Group(); object.name = 'm3d-veh:' + id;
    object.rotation.order = 'YXZ';
    const pivot = instance(id); pivot.rotation.y = Math.PI / 2;
    object.add(pivot);
    pivot.updateMatrixWorld(true);
    const rootQinv = new THREE.Quaternion(); pivot.getWorldQuaternion(rootQinv); rootQinv.invert();
    const bones = findBones(pivot), anchors = findAnchors(pivot);
    const lateral = new THREE.Vector3(1, 0, 0);
    const sa = meta.steerAxis || [0, -0.381, -0.925];
    const steerAxis = new THREE.Vector3(sa[0], sa[2], -sa[1]).normalize(); // Blender -> glTF
    const part = (name, axis) => { const b = bones[name]; return b ? { node: b, rest: b.quaternion.clone(), axis: localAxis(b, rootQinv, axis) } : null; };
    const P = {
      object, pivot, md, bones, anchors,
      wheels: ['wheel_rear', 'wheel_front'].map((n) => part(n, lateral)).filter(Boolean),
      steer: part('steer', steerAxis), crank: part('crank', lateral),
      pedals: ['pedal_L', 'pedal_R'].map((n) => part(n, lateral)).filter(Boolean),
      R: meta.wheelR || 3, gear: meta.gear || 2.4, night: [],
      state: { dist: 0, steer: 0, crank: 0 },
    };
    // per-instance copies of the @night materials (a parked cycle's lamp is off, a ridden one on)
    pivot.traverse((o) => {
      if (!o.isMesh) return;
      if (Array.isArray(o.material)) return;
      if (o.material && /@night$/.test(o.material.name)) { o.material = o.material.clone(); o.material.userData = { shared: false, m3d: id }; P.night.push(o.material); }
    });
    const q = new THREE.Quaternion();
    const turn = (p, a) => { if (p) p.node.quaternion.copy(p.rest).multiply(q.setFromAxisAngle(p.axis, a)); };
    /** dist: distance rolled (u); steer: radians about the steering axis; crank: radians (default dist / R / gear) */
    P.set = (o) => {
      const st = P.state;
      if (o.dist != null) st.dist = o.dist;
      if (o.steer != null) st.steer = o.steer;
      const wa = st.dist / P.R;
      st.crank = o.crank != null ? o.crank : wa / P.gear;
      for (const w of P.wheels) turn(w, wa);
      turn(P.steer, st.steer);
      turn(P.crank, st.crank);
      for (const p of P.pedals) turn(p, -st.crank);   // pedals stay level
      return P;
    };
    P.lamp = (k) => { for (const m of P.night) m.emissiveIntensity = k; };
    P.dispose = () => { for (const m of P.night) m.dispose(); disposeInstance(object); };
    P.set({ dist: 0, steer: 0 });
    return P;
  }

  /* ================================================================ actor specs + routing */
  const simDt = (st) => { const t = (N.time && N.time.now) || 0; const d = clamp(t - (st.t == null ? t : st.t), 0, 0.1); st.t = t; return d; };
  const PLAYER_ID = () => { for (const [id, md] of S.models) if (md.man.family === 'character' && (md.meta.role === 'player')) return id; return null; };
  function charSpec(id) {
    return {
      shadow: true, fps: false, m3d: id,
      create(e, H) {
        const c = character(id, e.look);
        if (!c) return null;
        c.object.userData.m3dChar = c;
        if (H && H.quality && !H.quality.shadows) c.object.add(H.blobShadow(4.6));
        const st = { t: null, x: e.x, y: e.y };
        c.object.userData.m3dState = st;
        return c.object;
      },
      update(obj, e, dt, H) {
        const c = obj.userData.m3dChar, st = obj.userData.m3dState;
        const d = simDt(st);
        let dist = Math.hypot(e.x - st.x, e.y - st.y);
        if (dist > 40) dist = 0;   // teleported
        st.x = e.x; st.y = e.y;
        let v = Math.hypot(e.vx || 0, e.vy || 0);
        if (!(v > 0) && d > 1e-5) v = dist / d;
        if (e.look !== c.lookRef) c.tint(e.look);
        c.setSpeed(v).update(d, dist);
        obj.position.set(e.x, H.elev(e), e.y);
        obj.rotation.y = -(isFinite(e.facing) ? e.facing : (e.angle || 0));
      },
      dispose(obj) { const c = obj && obj.userData.m3dChar; if (c) c.dispose(); },
    };
  }
  function vehicleSpec(id) {
    return {
      shadow: true, fps: true, m3d: id,
      create(e, H) {
        const P = vehicleParts(id);
        if (!P) return null;
        P.object.userData.m3dParts = P;
        if (H && H.quality && !H.quality.shadows) { const T = e.T || {}; P.object.add(H.blobShadow((T.w || 16) * 1.05, (T.d || 5) * 1.4)); }
        return P.object;
      },
      update(obj, e, dt, H) {
        const P = obj.userData.m3dParts;
        const T = e.T || {};
        const sx = T.w && P.md.meta.length ? T.w / P.md.meta.length : 1;
        P.pivot.scale.setScalar(clamp(sx, 0.7, 1.4));
        let roll = 0, pitch = 0, y = 0;
        if (e.fallen) { roll = -1.3; y = 0.5; } else if (!e.driver) roll = -0.12; else roll = clamp(e.lean || 0, -0.6, 0.6);
        const j = e.jolt || 0;
        if (j > 0) { const ph = (1 - j) * Math.PI * 3.2; y += -Math.sin(ph) * j * 0.8; pitch += Math.sin(ph * 1.3) * j * 0.05; roll += Math.sin(ph * 1.7) * j * 0.04 * (e.joltSide || 1); }
        obj.position.set(e.x, H.elev(e) + y, e.y);
        obj.rotation.set(roll, -(e.angle || 0), pitch);
        P.set({ dist: (e.wheelPhase || 0) * 2, steer: -(e.steerVis || 0) * 0.8 });
        const moving = !!e.driver && Math.abs(e.speed || 0) > 10;
        P.lamp(OPT.nightGlow && moving ? H.night * 1.5 : 0);
        if (moving && H.night > 0.2 && P.anchors.headlight) {
          const a = e.angle || 0;
          H.light({ x: e.x + Math.cos(a) * 7, y: e.y + Math.sin(a) * 7, h: 4.5, color: '#ffe6b0', intensity: 0.6 * H.night, r: 40 });
        }
      },
      dispose(obj) { const P = obj && obj.userData.m3dParts; if (P) P.dispose(); },
    };
  }
  const VEH_TYPES = new Map(); // vehicle type -> model id
  function registerAll() {
    const V3 = N.view3d;
    if (!V3) return;
    for (const [id, md] of S.models) {
      const fam = md.man.family;
      if (fam === 'character' && !S.registered.has('m3d:char:' + id)) {
        V3.registerActorRenderer('m3d:char:' + id, charSpec(id));
        S.registered.add('m3d:char:' + id);
      } else if (fam === 'vehicle' && !S.registered.has('m3d:veh:' + id)) {
        V3.registerActorRenderer('m3d:veh:' + id, vehicleSpec(id));
        S.registered.add('m3d:veh:' + id);
        for (const t of md.meta.vehicleTypes || [id]) VEH_TYPES.set(t, id);
      } else if ((fam === 'landmark' || fam === 'hero_landmark')) {
        registerLandmark(id, md);
      }
    }
  }

  /* ---------------------------------------------------------------- landmarks */
  const FR = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
  function rotFor(lm) { if (isFinite(lm.faceAngle)) return Math.PI / 2 - lm.faceAngle; return FR[lm.face] || 0; }
  function landmarkKey(md) { return md.meta.landmark ? '#' + md.meta.landmark : md.meta.draw; }
  function buildLandmark(id) {
    return (T, lm) => {
      const md = S.models.get(id);
      if (!md || !OPT.landmarks || (md.meta.proto && !useProto) || !OPT.enabled) return fallbackLandmark(md, lm);
      try {
        const g = new THREE.Group(); g.name = 'm3d-lm:' + id + ':' + lm.id;
        const inst = instance(id);
        inst.rotation.y = rotFor(lm);
        const fp = md.meta.footprint;
        if (md.meta.fit === 'footprint' && fp && lm.w && lm.d) {
          // the model's width runs along its front: world x for faces n / s, world y for e / w
          const ns = !lm.face || lm.face === 'n' || lm.face === 's' || isFinite(lm.faceAngle);
          inst.scale.set((ns ? lm.w : lm.d) / fp[0], 1, (ns ? lm.d : lm.w) / fp[1]);
        }
        g.add(inst);
        g.userData.m3d = id;
        return g;
      } catch (e) { N.err('models3d.landmark:' + id, e); return fallbackLandmark(md, lm); }
    };
  }
  /** the procedural model again (core API when present; else the object it had built before) */
  function fallbackLandmark(md, lm) {
    const prev = S.prevLandmark.get(lm.id);
    if (prev) { prev.position.set(0, 0, 0); return prev; }
    return null;
  }
  function registerLandmark(id, md) {
    const V3 = N.view3d;
    const key = landmarkKey(md);
    if (!key) return;
    const on = OPT.landmarks && OPT.enabled && (!md.meta.proto || useProto);
    const have = S.landmarkKeys.get(key);
    if (on && !have) {
      // remember the procedural object currently built for that landmark (best-effort fallback)
      const lmId = md.meta.landmark;
      if (lmId && !(V3.unregisterLandmark)) {
        const E = V3.engine;
        const grp = E && E.lmGroup;
        if (grp) for (const ch of grp.children) if (ch.name === 'lm3d:' + lmId || ch.name === 'lm:' + lmId) { S.prevLandmark.set(lmId, ch); break; }
      }
      V3.registerLandmark(key, buildLandmark(id), { castShadow: true });
      S.landmarkKeys.set(key, id);
    } else if (!on && have) {
      if (typeof V3.unregisterLandmark === 'function') V3.unregisterLandmark(key);
      else V3.registerLandmark(key, (T, lm) => fallbackLandmark(md, lm), {});
      S.landmarkKeys.delete(key);
    }
  }

  /* ---------------------------------------------------------------- routing (e.view3d) */
  function canShowPlayer(p) {
    return !!(p && !p.vehicle && !p.hidden && !p.sitting && !(p.downT > 0) && !p.fallen && !p.riding && p.alive !== false);
  }
  function route() {
    const V3 = N.view3d;
    if (!V3 || !V3.active || S.state !== 'ready') return;
    const p = N.player;
    // the player
    const pid = OPT.player && OPT.enabled ? PLAYER_ID() : null;
    const want = pid && canShowPlayer(p) ? 'm3d:char:' + pid : null;
    if (p) {
      if (want && p.view3d !== want) p.view3d = want;
      else if (!want && p.view3d && String(p.view3d).indexOf('m3d:') === 0) delete p.view3d;
      S.routedPlayer = !!want;
    }
    // vehicles: parked (no rider) ones of a modelled type; ridden ones stay procedural (riders)
    let n = 0;
    const f = V3.focus ? V3.focus() : p;
    let list = [];
    try { list = N.entities.query(f.x, f.y, (V3.quality && V3.quality.actorDist) || 620); } catch (e) { list = []; }
    for (const e of list) {
      if (!e || e.kind !== 'vehicle') { if (e && OPT.kidPeds && e !== p && e.kind === 'ped' && pid) routePed(e, pid); continue; }
      const mid = OPT.vehicles && OPT.enabled ? VEH_TYPES.get(e.type) : null;
      const riders = e.driver || e.pillion || e.passenger;
      const key = mid && !riders && e.alive !== false ? 'm3d:veh:' + mid : null;
      if (key) { if (e.view3d !== key) e.view3d = key; n++; } else if (e.view3d && String(e.view3d).indexOf('m3d:') === 0) delete e.view3d;
    }
    S.routedVehicles = n;
  }
  function routePed(e, pid) {
    const l = e.look;
    const ok = l && l.kind === 'kid' && !l.girl && !e.npcId && !e.vehicle && !e.sitting && !(e.downT > 0) && !e.hidden;
    const key = ok ? 'm3d:char:' + pid : null;
    if (key) { if (e.view3d !== key) e.view3d = key; } else if (e.view3d && String(e.view3d).indexOf('m3d:') === 0) delete e.view3d;
  }
  function unrouteAll() {
    try {
      for (const e of N.entities.all || []) if (e && e.view3d && String(e.view3d).indexOf('m3d:') === 0) delete e.view3d;
      if (N.player && N.player.view3d && String(N.player.view3d).indexOf('m3d:') === 0) delete N.player.view3d;
    } catch (e) { /* ignore */ }
  }

  /* ================================================================ per-frame material state (layer) */
  function frameMaterials(H) {
    const night = OPT.nightGlow ? (H.night || 0) : 0, day = H.day != null ? H.day : 1 - night;
    for (const md of S.models.values()) {
      for (const m of md.night) m.emissiveIntensity = night * 1.4;
      for (const m of md.floodlit) m.emissiveIntensity = night * 0.32;
      for (const m of md.metal) m.envMapIntensity = 0.12 + 0.55 * clamp(day, 0, 1);
    }
  }

  /* ================================================================ API */
  const api = (N.models3d = {
    OPT, options: OPT, packUrls: null, noCdn: false,
    get ready() { return S.state === 'ready'; },
    get state() { return S.state; },
    get error() { return S.error; },
    get useProto() { return useProto; },
    set useProto(v) {
      useProto = !!v;
      if (S.state !== 'ready') return;
      for (const [id] of Object.entries(N.ASSETS3D.manifest)) {
        const m = manifest(id);
        if (!m || !(m.family === 'landmark' || m.family === 'hero_landmark') || !(m.meta && m.meta.proto)) continue;
        if (useProto) parse(id).then((md) => { if (md) registerLandmark(id, md); });
        else { const md = S.models.get(id); if (md) registerLandmark(id, md); }
      }
    },
    has(id) { return !!(manifest(id) && !S.failed.has(id)); },
    loaded(id) { return S.models.has(id); },
    load, parse, instance, character, vehicleParts,
    manifest: (id) => manifest(id),
    /** turn the Blender models off / on at runtime (procedural renderers take over) */
    setEnabled(v) {
      OPT.enabled = !!v;
      if (!v) unrouteAll();
      if (S.state === 'ready') for (const [id, md] of S.models) if (md.man.family === 'landmark' || md.man.family === 'hero_landmark') registerLandmark(id, md);
      return OPT.enabled;
    },
    stats() {
      return {
        state: S.state, error: S.error, loaderFrom: S.loaderFrom, packFrom: S.packFrom,
        pack: hasPack() ? Object.keys(N.ASSETS3D.glb) : [], parsed: Array.from(S.models.keys()), failed: Object.fromEntries(S.failed),
        loadMs: +S.loadMs.toFixed(1), parseMs: +S.parseMs.toFixed(1), instances: S.instances,
        registered: Array.from(S.registered).concat(Array.from(S.landmarkKeys.keys())), routedPlayer: S.routedPlayer, routedVehicles: S.routedVehicles, useProto,
      };
    },
    debug: { S, route, unrouteAll, Character, tintRatios, cloneScene },
  });

  N.addSystem({
    id: 'models3d', order: 62, runIn: ['*'],
    update() {
      if (!OPT.enabled) return;
      const V3 = N.view3d;
      if (!S.started && V3 && V3.ready && window.THREE) load();
      if (S.state === 'ready') { try { route(); } catch (e) { N.err('models3d.route', e); } }
    },
  });
  if (N.view3d && N.view3d.registerLayer) {
    N.view3d.registerLayer('models3d', {
      order: 40,
      update(dt, H) { S.frame++; if (S.models.size) frameMaterials(H); },
    });
  }
  N.on('view:change', (d) => { if (d && d.mode === 'top') unrouteAll(); });
})();
