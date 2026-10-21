/* NOSTALGIA — models3d.js (pipeline technical artist) — ARCHITECTURE §21 "Blender asset pipeline"
 *
 * Runtime for the Blender-authored models (tools/blender/*.py -> assets3d/*.glb -> src/assets3d_pack.js).
 * Nothing here runs in the top-down view: the first time 3D starts (N.view3d.ready), it loads
 * vendor/three/GLTFLoader.classic.js and the pack (N.ASSETS3D) lazily — from the inline text/plain
 * script blocks with ids gltfloader-src / assets3d-pack in dist/nostalgia.html, else from the files
 * next to the page — parses the GLBs it needs and registers overrides with
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
 * Lazy models (website build, ARCHITECTURE §21 "Shipping"): src/assets3d_index.js (N.ASSETS3D_INDEX, always loaded)
 * lists every shipped model; ids marked lazy are not in the pack but one GLB each in lazy3d/<id>.glb next to the
 * page. When 3D starts, their landmark overrides are registered from the index manifest straight away; the
 * builder shows view3d_landmarks' procedural model (N.view3dLandmarks.procedural) and asks for the GLB, which is
 * fetched (LAZY_MAX at a time, same relative-path fallbacks as the pack), parsed and swapped in by re-registering
 * the key. A failed fetch (file://, offline, 404) stays procedural silently. Parsed lazy models no landmark is
 * showing are kept in an LRU of LAZY_KEEP and freed beyond it. parse(id) fetches lazy ids too, so on-demand
 * consumers (props, people, vehicles) work unchanged; lazy vehicle types are requested when one comes near.
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
  const OPT = { enabled: true, player: true, vehicles: true, riders: true, landmarks: true, kidPeds: false, env: true, nightGlow: true };
  const LOADER_URLS = ['vendor/three/GLTFLoader.classic.js', '../vendor/three/GLTFLoader.classic.js', 'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/loaders/GLTFLoader.js'];
  const PACK_URLS = ['src/assets3d_pack.js', '../src/assets3d_pack.js'];
  // lazy GLB folders, relative to the page (dist/web.html + the site: lazy3d/ next to it; the dev page: dist/lazy3d/)
  const LAZY_DIRS = ['lazy3d/', 'dist/lazy3d/', '../dist/lazy3d/'];
  const LAZY_MAX = 2;        // concurrent lazy GLB fetches
  const LAZY_KEEP = 12;      // parsed lazy models kept while no landmark shows them (LRU)
  const S = {
    state: 'idle', error: null, started: false, loadT: 0, loadMs: 0, parseMs: 0,
    loaderFrom: null, packFrom: null, models: new Map(), pending: new Map(), failed: new Map(),
    registered: new Set(), landmarkKeys: new Map(), prevLandmark: new Map(), instances: 0,
    routedPlayer: false, routedVehicles: 0, mats: new Set(), env: null, frame: 0,
  };
  // lazy per-GLB models: fetch queue, base folder that worked, refs (live landmark instances), LRU of parsed ids
  const LZ = { queue: [], active: 0, base: null, bad: new Set(), fetched: [], bytes: 0, refs: new Map(), lru: new Map(), evicted: 0, swaps: 0, keys: new Set() };
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
  /** run an inline text/plain script block by id (dist/nostalgia.html) */
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
  /** pages built into dist/ find the repo files one level up: try those first (no 404 noise) */
  const order = (urls) => (/\/dist\//.test(location.pathname) ? urls.slice().sort((a, b) => (b.indexOf('../') === 0) - (a.indexOf('../') === 0)) : urls);
  const hasPack = () => !!(N.ASSETS3D && N.ASSETS3D.glb && N.ASSETS3D.manifest);
  /** website build (dist/web.html): relative URLs carry the file's content hash (N.BUILD, tools/build.mjs) so a
   *  redeploy never pairs the new page with a stale cached pack / loader (http(s) only: file:// ignores queries) */
  const ver = (u, k) => { const B = N.BUILD; return B && B[k] && !/^https?:/.test(u) && /^https?:$/.test(location.protocol) ? u + '?v=' + B[k] : u; };
  async function loadLoader() {
    if (hasLoader()) { S.loaderFrom = S.loaderFrom || 'present'; return true; }
    if (runInline('gltfloader-src', hasLoader)) { S.loaderFrom = 'inline'; return true; }
    for (const u of order(LOADER_URLS)) {
      if (/^https?:/.test(u) && location.protocol === 'file:' && N.models3d.noCdn) continue;
      if (await loadScript(ver(u, 'loader'), hasLoader, /^https?:/.test(u) ? 12000 : 60000)) { S.loaderFrom = u; return true; }
    }
    return false;
  }
  async function loadPack() {
    if (hasPack()) { S.packFrom = S.packFrom || 'present'; return true; }
    if (runInline('assets3d-pack', hasPack)) { S.packFrom = 'inline'; return true; }
    for (const u of order(N.models3d.packUrls || PACK_URLS)) {
      // (the pack is ~3 MB gzipped: 17+ s on Slow 4G, a minute on 3G. A 20 s timeout gave up mid-download, tried the
      // next URL (a 404 on the site) and left the session without Blender models; a missing file still fails at once)
      if (await loadScript(ver(u, 'pack'), hasPack, 180000)) { S.packFrom = u; return true; }
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
        registerLazy();
        N.emit('models3d:ready', { ids: Array.from(S.models.keys()), lazy: Array.from(LZ.keys) });
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
  const IDX = () => (N.ASSETS3D_INDEX && N.ASSETS3D_INDEX.manifest) || null;
  const inPack = (id) => !!(hasPack() && N.ASSETS3D.glb[id]);
  /** a lazy model: listed lazy in the index, not inside the loaded pack */
  const isLazy = (id) => { const I = IDX(); return !!(I && I[id] && I[id].lazy && !inPack(id)); };
  const manifest = (id) => (hasPack() && N.ASSETS3D.manifest[id]) || (isLazy(id) ? IDX()[id] : null);
  const isLmFamily = (m) => !!m && (m.family === 'landmark' || m.family === 'hero_landmark');
  function wanted(id) {
    const m = manifest(id); if (!m) return false;
    const meta = m.meta || {};
    if (m.family === 'character') return !(meta.role === 'clips' || meta.lazy) && (OPT.player || OPT.kidPeds || OPT.riders); // libraries / lazy people: on demand
    if (m.family === 'vehicle') return OPT.vehicles;
    if (m.family === 'landmark' || m.family === 'hero_landmark') return OPT.landmarks && (!meta.proto || useProto);
    if (m.family === 'prop') return false;   // props are parsed on demand (models3d_props.js / parse(id))
    return true;
  }
  async function parseActive() {
    const ids = Object.keys(N.ASSETS3D.glb).filter(wanted);
    for (const id of ids) await parse(id);
  }
  function parse(id) {
    if (S.models.has(id)) { if (LZ.lru.has(id)) touch(id); return Promise.resolve(S.models.get(id)); }
    if (S.failed.has(id)) return Promise.resolve(null);
    if (S.pending.has(id)) return S.pending.get(id);
    if (!THREE || !THREE.GLTFLoader) return Promise.resolve(null);
    let p;
    const src = inPack(id) && N.ASSETS3D.glb[id];
    if (src) {
      let buf;
      try { buf = b64ToBuffer(src); } catch (e) { S.failed.set(id, 'base64: ' + e.message); return Promise.resolve(null); }
      p = parseBuffer(id, buf);
    } else if (isLazy(id)) {
      p = fetchLazy(id).then((buf) => {
        if (!buf) return null;
        return parseBuffer(id, buf).then((md) => { if (md) { LZ.lru.set(id, now()); evictLazy(); } return md; });
      });
    } else return Promise.resolve(null);
    p = p.then((m) => { S.pending.delete(id); return m; }, (e) => { S.pending.delete(id); S.failed.set(id, String((e && e.message) || e)); return null; });
    S.pending.set(id, p);
    return p;
  }
  function parseBuffer(id, buf) {
    const t0 = now();
    return new Promise((resolve) => {
      try {
        new THREE.GLTFLoader().parse(buf, '', (g) => {
          let md = null;
          try { md = prepare(id, g); } catch (e) { S.failed.set(id, String(e.message || e)); N.err('models3d.prepare:' + id, e); }
          S.parseMs += now() - t0;
          const done = (m) => { if (m) S.models.set(id, m); resolve(m); };
          // characters carry no clips of their own when meta.clips names a clip library (one per rig)
          const lib = md && md.man.family === 'character' && typeof md.meta.clips === 'string' ? md.meta.clips : null;
          if (!lib) { done(md); return; }
          parse(lib).then((L) => {
            if (L && L.clips.size) { linkClips(md, L); done(md); return; }
            S.failed.set(id, 'clip library ' + lib + ' unavailable');
            console.warn('[models3d] ' + id + ': clip library ' + lib + ' unavailable');
            done(null);
          });
        }, (err) => {
          S.failed.set(id, String((err && err.message) || err));
          // a broken model is not a game error: the procedural renderer stays in charge
          console.warn('[models3d] ' + id + ' failed to parse: ' + S.failed.get(id));
          resolve(null);
        });
      } catch (e) { S.failed.set(id, String(e.message || e)); resolve(null); }
    });
  }

  /* ================================================================ lazy per-GLB models */
  /** candidate folders for lazy GLBs, best first: the one that worked, next to the index script when it ran from
   *  a file (dev page: src/assets3d_index.js -> dist/lazy3d/), then the relative fallbacks (like PACK_URLS) */
  function lazyDirs() {
    const I = N.ASSETS3D_INDEX || {}, dir = I.lazyDir || 'lazy3d/';
    const out = [];
    const add = (u) => { if (u && out.indexOf(u) < 0 && !LZ.bad.has(u)) out.push(u); };
    if (api.lazyBase) add(api.lazyBase);
    add(LZ.base);
    if (I.from && /\/src\/[^/]*$/.test(I.from)) { try { add(new URL('../dist/' + dir, I.from).href); } catch (e) { /* ignore */ } }
    for (const u of order(LAZY_DIRS.map((d) => d.replace('lazy3d/', dir)))) add(u);
    return out;
  }
  /** can this page fetch lazy GLBs at all? (file:// pages cannot fetch; offline pages need not try) */
  function lazyPossible() {
    if (typeof fetch !== 'function' || location.protocol === 'file:') return false;
    if (navigator && navigator.onLine === false) return false;
    return true;
  }
  /** fetch one lazy GLB (queued, LAZY_MAX at a time) -> ArrayBuffer | null; failures are silent (stay procedural) */
  function fetchLazy(id) {
    return new Promise((resolve) => {
      if (!lazyPossible()) { S.failed.set(id, 'lazy: not fetchable from this page'); resolve(null); return; }
      LZ.queue.push({ id, resolve });
      pumpLazy();
    });
  }
  function pumpLazy() {
    while (LZ.active < LAZY_MAX && LZ.queue.length) {
      const job = LZ.queue.shift();
      LZ.active++;
      fetchFrom(job.id, lazyDirs()).then((buf) => { LZ.active--; job.resolve(buf); pumpLazy(); });
    }
  }
  async function fetchFrom(id, dirs) {
    const m = IDX()[id] || {}, q = m.h ? '?v=' + m.h : '';
    for (const dir of dirs) {
      let r = null;
      try { r = await fetch(dir + id + '.glb' + q, { credentials: 'same-origin' }); } catch (e) { r = null; }
      if (r && r.ok) {
        try {
          const buf = await r.arrayBuffer();
          if (buf.byteLength < 20 || new DataView(buf).getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
          LZ.base = dir; LZ.fetched.push(id); LZ.bytes += buf.byteLength;
          return buf;
        } catch (e) { S.failed.set(id, 'lazy: ' + (e.message || e)); return null; }
      }
      // a folder that answered 404 (or nothing) is skipped from now on, unless it already served a model
      if (dir !== LZ.base) LZ.bad.add(dir);
      if (!r) break;   // network error: the next folder will not do better
    }
    if (!S.failed.has(id)) S.failed.set(id, 'lazy: fetch failed');
    return null;
  }
  /** a lazy model is needed (its landmark / entity came within build range): fetch + parse, then swap it in */
  function want(id) {
    if (S.models.has(id) || S.pending.has(id) || S.failed.has(id) || !isLazy(id) || !THREE) return;
    parse(id).then((md) => { if (md) lazyReady(id, md); });
  }
  function lazyReady(id, md) {
    const fam = md.man.family;
    if (isLmFamily(md.man)) {
      // re-register the key: the core disposes the procedural objects it built for it and builds the model
      const key = landmarkKey(md);
      if (key && S.landmarkKeys.get(key) === id) { S.landmarkKeys.delete(key); registerLandmark(id); LZ.swaps++; }
    } else if (fam === 'vehicle' || fam === 'character') registerAll();
    N.emit('models3d:lazy', { id, family: fam });
  }
  function touch(id) { LZ.lru.delete(id); LZ.lru.set(id, now()); }
  function ref(id, d) { const n = (LZ.refs.get(id) || 0) + d; if (n > 0) LZ.refs.set(id, n); else LZ.refs.delete(id); if (d > 0) touch(id); }
  /** free the least recently used parsed lazy models that nothing shows, beyond LAZY_KEEP */
  function evictLazy() {
    let n = LZ.lru.size;
    if (n <= LAZY_KEEP) return;
    for (const id of Array.from(LZ.lru.keys())) {
      if (n <= LAZY_KEEP) break;
      if (LZ.refs.get(id) || !S.models.has(id)) continue;
      const md = S.models.get(id);
      if (!isLmFamily(md.man)) continue;   // actors may hold instances we do not count
      S.models.delete(id); LZ.lru.delete(id); LZ.evicted++; n--;
      freeModel(md);
    }
  }
  function freeModel(md) {
    const texs = new Set();
    md.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (m === COL_MAT) continue;
        for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap']) if (m[k] && m[k] !== S.env) texs.add(m[k]);
        S.mats.delete(m); m.dispose();
      }
    });
    for (const t of texs) t.dispose();
  }
  /** register the landmark overrides of every lazy model in the index (nothing is fetched yet) */
  function registerLazy() {
    const I = IDX();
    if (!I || !lazyPossible()) return;   // single-file / offline: the procedural models stay, untouched
    for (const id of Object.keys(I)) if (isLazy(id) && isLmFamily(I[id])) registerLandmark(id);
    for (const id of Object.keys(I)) {
      if (!isLazy(id) || I[id].family !== 'vehicle') continue;
      for (const t of ((I[id].meta || {}).vehicleTypes || [id])) if (!VEH_TYPES.has(t)) LAZY_VEH.set(t, id);
    }
  }

  const NOOP_RAY = () => {};
  let COL_MAT = null;
  function prepare(id, g) {
    const man = manifest(id) || {};
    const scene = g.scene || (g.scenes && g.scenes[0]);
    if (!scene) throw new Error('no scene');
    const md = { id, man, meta: man.meta || {}, scene, clips: new Map(), night: [], metal: [], floodlit: [], skinned: false };
    for (const c of g.animations || []) md.clips.set(c.name, c);
    const track = md.meta.clipTrack && md.clips.get(md.meta.clipTrack);
    if (track) {
      // a clip library stores all its clips one after the other in one animation: cut them out by
      // their frame ranges (manifest clips[name].range, at meta.clipFps)
      const out = new Map(), fps = md.meta.clipFps || 30;
      for (const [name, c] of Object.entries(man.clips || {})) {
        if (!c || !c.range) continue;
        const sc = THREE.AnimationUtils.subclip(track, name, c.range[0] - 0.5, c.range[1] + 0.5, fps);
        if (sc.tracks.length) out.set(name, sc);
      }
      md.clips = out;
    }
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
  /** a character bound to its rig's clip library: the library's clips (bound by bone name) and
   *  their manifest entries become the character's own (manifest(id).clips lists them) */
  function linkClips(md, L) {
    md.clips = L.clips; md.lib = L.id;
    const own = md.man.clips && Object.keys(md.man.clips).length ? md.man.clips : null;
    md.man.clips = Object.assign({}, L.man.clips || {}, own || {});
  }
  /** a small gradient sky as a PMREM environment for metallic materials (chrome reads as chrome) */
  function envMap() {
    if (S.env) return S.env;
    const H = N.view3d && N.view3d.H;
    const r = H && H.renderer;
    if (!r) return null;
    // (never while the WebGL context is lost: the PMREM pass would compile programs on a dead context -> TypeError;
    // the metal gets its map when the context is back, see 'view3d:contextrestored' below)
    try { if (r.getContext().isContextLost()) return null; } catch (e) { return null; }
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
  // a restored WebGL context lost the PMREM render target's pixels: render it again for every metallic material
  N.on('view3d:contextrestored', () => {
    try {
      if (S.env) { S.env.dispose(); S.env = null; }
      if (!OPT.env) return;
      for (const md of S.models.values()) if (md && md.metal) for (const m of md.metal) { m.envMap = envMap(); m.needsUpdate = true; }
    } catch (e) { N.err('models3d.envRestore', e); }
  });

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
  const LOOK_FIELDS = { skin: ['skin'], hair: ['hair'], shirt: ['shirt', 'kameez', 'saree'], stripes: ['stripes', 'shoulders'], pants: ['pants', 'lungi'], shoes: ['shoes', 'chappal'], accent: ['accent'] };
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
      out.push(new THREE.Vector3(clamp(want[0] / Math.max(b[0], 0.004), 0, 24), clamp(want[1] / Math.max(b[1], 0.004), 0, 24), clamp(want[2] / Math.max(b[2], 0.004), 0, 24)));
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
    constructor(md, look, opts) {
      opts = opts || {};
      this.md = md; this.id = md.id;
      this.object = new THREE.Group(); this.object.name = 'm3d-char:' + md.id;
      // GLB front +Z -> +X for the core's rotation.y = -angle; riders are attached inside a vehicle's
      // GLB frame (opts.attach) where both models share the same axes
      this.pivot = instance(md.id); this.pivot.rotation.y = opts.attach ? 0 : Math.PI / 2;
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
      if (api.hooks.tint && api.hooks.tint(this, look)) return this;   // models3d_people.js: regions + accessory slots
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
    /** hold one clip exclusively at a phase in [0, 1) (riding: the phase follows the crank) */
    pose(name, phase) {
      const a = this.actions[name];
      if (!a) return false;
      for (const k in this.actions) if (this.actions[k] !== a) this.actions[k].setEffectiveWeight(0);
      a.paused = true; a.setEffectiveWeight(1);
      const d = a.getClip().duration;
      a.time = (((phase % 1) + 1) % 1) * d;
      this.clip = name; this.oneShot = null; this.locoW = 0;
      this.mixer.update(0);
      return true;
    }
    has(name) { return !!this.actions[name]; }
    weights() { const o = {}; for (const k in this.actions) o[k] = +this.actions[k].getEffectiveWeight().toFixed(3); return o; }
    dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.pivot); if (this.tintMat) this.tintMat.dispose(); disposeInstance(this.object); }
  }
  function character(id, look, opts) {
    const md = S.models.get(id);
    if (!md || !md.clips.size) return null;
    try { return new Character(md, look, opts); } catch (e) { N.err('models3d.character:' + id, e); return null; }
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
    const st0 = meta.saddleTube || [0, 0.371, 0.928];
    let saddle = null;
    if (bones.saddle) {
      const b = bones.saddle, pq = new THREE.Quaternion();
      if (b.parent) { b.parent.getWorldQuaternion(pq); pq.premultiply(rootQinv); }
      saddle = { node: b, rest: b.position.clone(), dir: new THREE.Vector3(st0[0], st0[2], -st0[1]).normalize().applyQuaternion(pq.invert()) };
    }
    const P = {
      object, pivot, md, bones, anchors,
      wheels: ['wheel_rear', 'wheel_front'].map((n) => part(n, lateral)).filter(Boolean),
      steer: part('steer', steerAxis), crank: part('crank', lateral),
      pedals: ['pedal_L', 'pedal_R'].map((n) => part(n, lateral)).filter(Boolean),
      R: meta.wheelR || 3, gear: meta.gear || 2.4, night: [], saddlePart: saddle, drop: 0, rider: null,
      state: { dist: 0, steer: 0, crank: 0 },
    };
    /** let the saddle down by d u along the seat tube (Chinnu's cycle) */
    P.saddle = (d) => { if (saddle && d !== P.drop) { P.drop = d; saddle.node.position.copy(saddle.rest).addScaledVector(saddle.dir, -d); } return P; };
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
    P.dispose = () => { if (P.rider) { P.rider.dispose(); P.rider = null; } for (const m of P.night) m.dispose(); disposeInstance(object); };
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
  const MALE = { man: 1, uncle: 1, lungi: 1 };
  /** the rider model id for occupant d of vehicle v (or null: the procedural renderer draws it) */
  function riderModel(v, d) {
    if (!d) return null;
    if (api.hooks.riderModel) { const r = api.hooks.riderModel(v, d); if (r !== undefined) return r; }
    const vid = VEH_TYPES.get(v.type), vmd = vid && S.models.get(vid);
    if (!vmd) return null;
    const drop = ((vmd.meta.saddleDrop || {})[v.type]) || 0;
    const p = N.player;
    const look = d === p ? p.look : (d.look || v._look || null);
    for (const [id, md] of S.models) {
      if (md.man.family !== 'character') continue;
      const rc = (md.man.clips || {}).ride_cycle;
      if (!rc || Math.abs((rc.saddleDrop || 0) - drop) > 1e-3 || !md.clips.has('ride_cycle')) continue;
      if (d === p) { if (md.meta.role === 'player') return id; continue; }
      if (md.meta.role === 'player') continue;
      if (look && MALE[look.kind] && (md.meta.people || []).indexOf('man') >= 0) return id;
    }
    return null;
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
        P.saddle(((P.md.meta.saddleDrop || {})[e.type]) || 0);
        // the rider, seated in the cycle's own frame; the clip phase follows the crank (feet on the pedals)
        const d = e.driver && !e.fallen ? e.driver : null;
        const rid = d ? riderModel(e, d) : null;
        const look = d ? (d === N.player ? N.player.look : (d.look || e._look)) : null;
        if (P.rider && (P.rider.id !== rid || P.riderOf !== d)) { P.rider.dispose(); P.rider = null; }
        if (rid && !P.rider) {
          P.rider = character(rid, look, { attach: true }); P.riderOf = d;
          if (P.rider) {
            const sh = !!(H.quality && H.quality.shadows);
            P.rider.object.traverse((m) => { if (m.isMesh) m.castShadow = sh; });   // added after the core's create() pass
            P.pivot.add(P.rider.object);
          }
        }
        if (P.rider) {
          if (look !== P.rider.lookRef) P.rider.tint(look);
          P.rider.pose('ride_cycle', P.state.crank / TAU);
          P.rider.object.visible = !(d === N.player && H.mode === 'fps');
        }
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
  const LAZY_VEH = new Map();  // vehicle type -> lazy model id (fetched when one comes near)
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
        for (const t of md.meta.vehicleTypes || [id]) { VEH_TYPES.set(t, id); LAZY_VEH.delete(t); }
      } else if ((fam === 'landmark' || fam === 'hero_landmark') && !S.landmarkKeys.has(landmarkKey(md))) {
        registerLandmark(id);
      }
    }
  }

  /* ---------------------------------------------------------------- landmarks */
  const FR = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
  function rotFor(lm) { if (isFinite(lm.faceAngle)) return Math.PI / 2 - lm.faceAngle; return FR[lm.face] || 0; }
  function landmarkKey(md) { const meta = md.meta || {}; return meta.landmark ? '#' + meta.landmark : meta.draw; }
  /** view3d_landmarks' procedural model for one landmark (lazy models show it until their GLB is ready) */
  function proceduralLandmark(T, lm, H) {
    const P = N.view3dLandmarks && N.view3dLandmarks.procedural;
    if (!P || !P.has(lm)) return null;   // null: the core's generic footprint model
    try { return P.build(T, lm, H); } catch (e) { N.err('models3d.procedural:' + lm.id, e); return null; }
  }
  function buildLandmark(id) {
    return (T, lm, H) => {
      const md = S.models.get(id), lazy = isLazy(id), meta = (md || manifest(id) || {}).meta || {};
      if (!OPT.landmarks || (meta.proto && !useProto) || !OPT.enabled) return lazy ? proceduralLandmark(T, lm, H) : fallbackLandmark(md, lm);
      if (!md) {
        if (!lazy) return fallbackLandmark(md, lm);
        want(id);   // within build range: fetch the GLB; the procedural model stands in meanwhile
        return proceduralLandmark(T, lm, H);
      }
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
        // meta.fitHeight: one model for landmarks of different data heights (Qutb Shahi tombs)
        if (md.meta.fitHeight && md.meta.dataH && lm.h) inst.scale.y = lm.h / md.meta.dataH;
        if (md.meta.variants) { g.userData.vars = variantNodes(inst); showVariant(g, md, lm); }
        g.add(inst);
        g.userData.m3d = id;
        if (lazy) { g.userData.m3dRef = id; ref(id, 1); }
        return g;
      } catch (e) { N.err('models3d.landmark:' + id, e); return lazy ? proceduralLandmark(T, lm, H) : fallbackLandmark(md, lm); }
    };
  }
  /* landmark variants (meta.variants = {rule, names}): top-level GLB nodes named var_<name>, one of
   * them shown. Rules: 'idx' (lm.idx), 'hash' (lm.id), 'prasads' (site until it opens, like
   * view3d_landmarks), 'lb_match' (match-day crowds + floodlight banks). Dynamic rules re-check
   * a few times a second through the landmark update hook. */
  const VARIANT_RULES = {
    idx: (lm, names) => names[(((lm.idx | 0) % names.length) + names.length) % names.length],
    hash: (lm, names) => { let h = 7; for (const ch of String(lm.id)) h = (h * 31 + ch.charCodeAt(0)) | 0; return names[Math.abs(h) % names.length]; },
    prasads: () => {
      let v = N.placesArt && N.placesArt.variant ? N.placesArt.variant('prasads_imax') : null;
      if (!v) v = N.flags && N.flags.prasads_open ? 'open' : 'fence';
      return v === 'open' || v === 'opening' ? 'open' : 'site';
    },
    lb_match: () => (N.flags && (N.flags.lb_match || N.flags.lb_match_day) ? 'match' : 'quiet'),
  };
  const DYNAMIC_RULES = { prasads: true, lb_match: true };
  function variantNodes(inst) {
    const out = [];
    inst.traverse((o) => { if (/^var_/.test(o.name) && !(o.parent && /^var_/.test(o.parent.name))) out.push(o); });
    return out;
  }
  function showVariant(g, md, lm) {
    const V = md.meta.variants, rule = VARIANT_RULES[V.rule];
    const want = 'var_' + (rule ? rule(lm, V.names || []) : (V.names || [])[0]);
    if (g.userData.variant === want) return;
    g.userData.variant = want;
    for (const o of g.userData.vars || []) o.visible = o.name === want;
  }
  function updateLandmark(id) {
    return (obj, lm, dt, H) => {
      if (obj && obj.userData.lm3dProc) { const P = N.view3dLandmarks && N.view3dLandmarks.procedural; if (P && P.anim(lm)) P.update(obj, lm, dt, H); return; }
      const md = S.models.get(id);
      if (!md || !obj || !obj.userData.vars) return;
      if ((obj.userData.vt = (obj.userData.vt || 0) + 1) % 15) return;
      showVariant(obj, md, lm);
    };
  }
  /** the procedural model again (core API when present; else the object it had built before) */
  function fallbackLandmark(md, lm) {
    const prev = S.prevLandmark.get(lm.id);
    if (prev) { prev.position.set(0, 0, 0); return prev; }
    return null;
  }
  /** lazy keys: free what the core disposes (procedural objects through view3d_landmarks, instance refs) */
  function disposeLazy(id) {
    return (obj, lm, H) => {
      if (!obj) return;
      if (obj.userData.m3dRef) { ref(id, -1); obj.userData.m3dRef = null; }
      else if (obj.userData.lm3dProc) { const P = N.view3dLandmarks && N.view3dLandmarks.procedural; if (P) try { P.dispose(obj, lm, H); } catch (e) { N.err('models3d.procDispose', e); } }
    };
  }
  /** (re-)register landmark model `id` under its key (parsed, or lazy: from the index manifest) or turn it off */
  function registerLandmark(id) {
    const V3 = N.view3d;
    const md = S.models.get(id), man = (md && md.man) || manifest(id);
    if (!man) return;
    const meta = man.meta || {}, lazy = isLazy(id);
    const key = landmarkKey(man);
    if (!key) return;
    const on = OPT.landmarks && OPT.enabled && (!meta.proto || useProto);
    const have = S.landmarkKeys.get(key);
    if (on && !have) {
      // remember the procedural object currently built for that landmark (best-effort fallback)
      const lmId = meta.landmark;
      if (lmId && !lazy && !(V3.unregisterLandmark)) {
        const E = V3.engine;
        const grp = E && E.lmGroup;
        if (grp) for (const ch of grp.children) if (ch.name === 'lm3d:' + lmId || ch.name === 'lm:' + lmId) { S.prevLandmark.set(lmId, ch); break; }
      }
      const vr = meta.variants;
      const dyn = !!(vr && DYNAMIC_RULES[vr.rule]);
      const opts = { castShadow: true };
      // lazy: the procedural stand-in may be animated (update) and owns view3d_landmarks' cache (dispose)
      if (dyn || lazy) opts.update = updateLandmark(id);
      if (lazy) opts.dispose = disposeLazy(id);
      V3.registerLandmark(key, buildLandmark(id), opts);
      S.landmarkKeys.set(key, id);
      if (lazy) LZ.keys.add(key);
    } else if (!on && have) {
      if (typeof V3.unregisterLandmark === 'function') V3.unregisterLandmark(key);
      else if (lazy) V3.registerLandmark(key, (T, lm, H) => proceduralLandmark(T, lm, H), { dispose: disposeLazy(id), update: updateLandmark(id) });
      else V3.registerLandmark(key, (T, lm) => fallbackLandmark(md, lm), {});
      S.landmarkKeys.delete(key);
    }
  }

  /* ---------------------------------------------------------------- routing (e.view3d) */
  function canShowPlayer(p) {
    return !!(p && !p.vehicle && !p.hidden && !p.sitting && !(p.downT > 0) && !p.fallen && !p.riding && p.alive !== false);
  }
  /** an entity the procedural renderer's debug recorder is tracking (tests/view3d_actors.cjs) stays
   *  procedural, so its pose recorder keeps working */
  function tracked(e) {
    const A = N.view3dActors, D = A && A.debug && A.debug.DBG;
    return !!(D && D.track && D.track === e);
  }
  function route() {
    const V3 = N.view3d;
    if (!V3 || !V3.active || S.state !== 'ready') return;
    const p = N.player;
    const PH = api.hooks.people && api.hooks.people.ready ? api.hooks.people : null;
    // the player (models3d_people.js routes the player and the people itself when it is loaded)
    const pid = OPT.player && OPT.enabled ? PLAYER_ID() : null;
    if (p && !PH) {
      const want = pid && canShowPlayer(p) && !tracked(p) ? 'm3d:char:' + pid : null;
      if (want && p.view3d !== want) p.view3d = want;
      else if (!want && p.view3d && String(p.view3d).indexOf('m3d:char:') === 0) delete p.view3d;
      S.routedPlayer = !!want;
    }
    // vehicles: parked (no rider) ones of a modelled type; ridden ones stay procedural (riders)
    let n = 0;
    const f = V3.focus ? V3.focus() : p;
    let list = [];
    try { list = N.entities.query(f.x, f.y, (V3.quality && V3.quality.actorDist) || 620); } catch (e) { list = []; }
    if (PH) { try { PH.route(list, p, tracked); S.routedPlayer = !!(p && p.view3d && String(p.view3d).indexOf('m3d:') === 0); } catch (e) { N.err('models3d.people.route', e); } }
    for (const e of list) {
      if (!e || e.kind !== 'vehicle') { if (!PH && e && OPT.kidPeds && e !== p && e.kind === 'ped' && pid) routePed(e, pid); continue; }
      const mid = OPT.vehicles && OPT.enabled ? VEH_TYPES.get(e.type) : null;
      if (!mid && OPT.vehicles && OPT.enabled && LAZY_VEH.has(e.type)) want(LAZY_VEH.get(e.type));   // in range: fetch it
      const ridersOk = !e.pillion && !e.passenger && (!e.driver || (OPT.riders && !!riderModel(e, e.driver)));
      const key = mid && ridersOk && e.alive !== false && !tracked(e) ? 'm3d:veh:' + mid : null;
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
    /** lazy GLB folder to try first (tests / hosting), e.g. 'https://cdn.example/lazy3d/' */
    lazyBase: null,
    /** extension points (models3d_people.js): tint(character, look) -> true when handled;
     *  people {ready, route(list, player, tracked)} routes the player + people; riderModel(v, d) ->
     *  model id | null (undefined: the built-in choice) */
    hooks: { tint: null, people: null, riderModel: null },
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
        if (useProto) parse(id).then((md) => { if (md) registerLandmark(id); });
        else if (S.models.has(id)) registerLandmark(id);
      }
    },
    has(id) { return !!(manifest(id) && !S.failed.has(id)); },
    loaded(id) { return S.models.has(id); },
    /** a lazy model (index-listed, fetched on demand) / ask for it now -> Promise<model | null> */
    isLazy: (id) => isLazy(id),
    want(id) { return isLazy(id) ? parse(id).then((md) => { if (md) lazyReady(id, md); return md; }) : parse(id); },
    load, parse, instance, character, vehicleParts,
    manifest: (id) => manifest(id),
    /** turn the Blender models off / on at runtime (procedural renderers take over) */
    setEnabled(v) {
      OPT.enabled = !!v;
      if (!v) unrouteAll();
      if (S.state === 'ready') {
        for (const [id, md] of S.models) if (isLmFamily(md.man)) registerLandmark(id);
        for (const id of Object.keys(IDX() || {})) if (isLazy(id) && !S.models.has(id) && isLmFamily(IDX()[id]) && lazyPossible()) registerLandmark(id);
      }
      return OPT.enabled;
    },
    stats() {
      return {
        state: S.state, error: S.error, loaderFrom: S.loaderFrom, packFrom: S.packFrom,
        pack: hasPack() ? Object.keys(N.ASSETS3D.glb) : [], parsed: Array.from(S.models.keys()), failed: Object.fromEntries(S.failed),
        loadMs: +S.loadMs.toFixed(1), parseMs: +S.parseMs.toFixed(1), instances: S.instances,
        registered: Array.from(S.registered).concat(Array.from(S.landmarkKeys.keys())), routedPlayer: S.routedPlayer, routedVehicles: S.routedVehicles, useProto,
        lazy: {
          index: Object.keys(IDX() || {}).filter(isLazy).length, keys: Array.from(LZ.keys), base: LZ.base, fetched: LZ.fetched.slice(),
          kb: +(LZ.bytes / 1024).toFixed(1), active: LZ.active, queued: LZ.queue.length, parsed: Array.from(LZ.lru.keys()),
          refs: Object.fromEntries(LZ.refs), evicted: LZ.evicted, swaps: LZ.swaps, possible: lazyPossible(),
        },
      };
    },
    debug: { S, LZ, route, unrouteAll, Character, tintRatios, cloneScene, riderModel, findBones, findAnchors, disposeInstance, evictLazy, LAZY_KEEP },
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
