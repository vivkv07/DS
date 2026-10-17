/* NOSTALGIA — models3d_people.js (characters artist) — ARCHITECTURE §21 "Characters (people runtime)"
 *
 * The people of Hyderabad, 2003, drawn with the Blender character set (tools/blender/characters.py ->
 * assets3d/<id>.glb -> src/assets3d_pack.js) in the 3D view: the player (kid_chinnu; an adult model in
 * the 2026 epilogue), the named cast (meta.npcs) and the street crowd (by look kind / role / match
 * rule). Characters share one skeleton per rig and carry no clips of their own: their rig's clip
 * library (clips_kid / clips_adult) is bound by bone name (models3d.js links it at parse time).
 *
 *  - Archetypes + variants: each model has the 8 base tint regions (skin hair shirt stripes pants shoes
 *    accent) plus accessory SLOTS (regions 8..23: caps, specs, beards, bellies, bags, frocks, plaits...)
 *    whose visibility follows rules on the person's look (manifest tint.show; rule language: {f} truthy,
 *    {f, in: [...]}, {f, re}, {f, lt | gt}, {any}, {all}, {not}); every region names the look fields
 *    that colour it (tint.fields: 'shirt', '@saree:0.7' = a shade of a field, '#hex' fixed). One shader
 *    (onBeforeCompile on the baked material): colour x look / baked grey, hidden slots collapse in the
 *    vertex shader (also in the shadow depth pass). The runtime adds `_r` (a stable random in [0, 1)
 *    per person), `_role` (traffic ped role) and `_cart` to the look the rules see.
 *  - Clips: locomotion (stroll / walk / run / sprint; women use the *_f variants when the library has
 *    them; cart pushers push_cart) blended by speed between their nominal speeds, the common phase
 *    driven by the distance actually travelled (phase += dist / sum(w * stride)): planted feet at any
 *    speed. Standing: idle with idle_look now and then. States on top (cross-faded): fall (held) /
 *    getup, sit (bench) / sit_step (stool, kerb), talk, direct (traffic constables), and any clip a
 *    script asks for (e.clip3d = 'clap' | {name, loop} or people.play(e, name)). Head turns towards
 *    what the person looks at (and the camera for the player); an archetype's posture (old men stoop)
 *    is added after the mixer.
 *  - Routing: models3d.js calls hooks.people.route() every frame; the player (on foot), cast NPCs and
 *    peds get e.view3d = 'm3d:ppl:<id>' when their look has a model and every visible part of their
 *    state is supported (no umbrella / balloons / head loads / unmodelled props / riding), nearest first
 *    up to options.max (hysteresis keeps them), at most options.maxNew new ones per frame (creation
 *    cost). Everything else keeps view3d_actors' procedural renderer (it stays registered underneath).
 *    Lazy models parse on first use. Riders on Hero cycles (models3d vehicleSpec) get the same tint /
 *    slot shader through hooks.tint.
 *
 * Public: N.models3d.people = {options, ready, models(), choose(e) -> {id, ctx}|null, play(e, clip, o),
 *   stop(e), person(e) -> Person|null, stats(), debug}. Entity hints read: look, npcId, role, vx/vy,
 *   facing/angle, idle ('sit'), bench, sitting, down / downT / knockT / getupT, talking, constable +
 *   pod, lookAt / lookT / lookTarget, emoteSt / spotter, roofH, umb, balloons, cart, clip3d.
 * Hooks into modules this file does not own: N.models3d.hooks (people, tint) — documented extension
 * points of models3d.js; e.view3d (ARCHITECTURE §20 key resolution); emotes are drawn by pushing into
 * N.view3dActors.debug.EMOTES like view3d_actors' own people do.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const nowMs = () => performance.now();
  let THREE = null;

  /* ================================================================ options + state */
  const OPT = { enabled: true, player: true, npcs: true, peds: true, max: 26, maxNew: 2, dist: 230, hyst: 40, shadows: true, posture: true, headLook: true };
  const S = {
    ready: false, idx: null, specs: new Set(), persons: new Set(), choice: new WeakMap(), parsing: new Set(),
    routed: 0, created: 0, disposed: 0, frameNew: 0, lastRoute: 0, ms: 0, msAvg: 0, mats: 0,
  };
  const KEY = (id) => 'm3d:ppl:' + id;
  const isOurs = (k) => typeof k === 'string' && k.indexOf('m3d:ppl:') === 0;
  const M3 = () => N.models3d;
  const hash01 = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100003) / 100003; };

  /* ================================================================ rules (mirror of _characters_kit.rule_eval) */
  function rule(r, L) {
    if (r === true || r == null) return true;
    if (r === false) return false;
    if (r.any) { for (const x of r.any) if (rule(x, L)) return true; return false; }
    if (r.all) { for (const x of r.all) if (!rule(x, L)) return false; return true; }
    if (r.not) return !rule(r.not, L);
    const v = L[r.f];
    if (r.in) return r.in.indexOf(v) >= 0;
    if (r.re) { try { return typeof v === 'string' && new RegExp(r.re).test(v); } catch (e) { return false; } }
    if (r.lt != null) return typeof v === 'number' && v < r.lt;
    if (r.gt != null) return typeof v === 'number' && v > r.gt;
    return !!v;
  }

  /* ================================================================ colours (mirror of resolve_look) */
  const DEFAULT_FIELDS = { skin: ['skin'], hair: ['hair'], shirt: ['shirt', 'kameez', 'saree'], stripes: ['stripes', 'shoulders'], pants: ['pants', 'lungi'], shoes: ['shoes', 'chappal'], accent: ['accent'] };
  const isCol = (v) => typeof v === 'string' && v[0] === '#' && (v.length === 4 || v.length === 7);
  function rgb255(h) {
    let s = h.slice(1); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const v = parseInt(s, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function shadeHex(h, f) {
    const c = rgb255(h).map((x) => Math.floor(Math.min(1, (x / 255) * f) * 255));
    return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  const LIN = new Map();
  function lin(h) {
    let o = LIN.get(h); if (o) return o;
    const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    o = rgb255(h).map(f); LIN.set(h, o); return o;
  }
  function pick(specs, L) {
    if (!specs || !L) return null;
    for (const s of specs) {
      if (s[0] === '#') return s;
      if (s[0] === '@') { const i = s.indexOf(':'), f = s.slice(1, i < 0 ? undefined : i), k = i < 0 ? 1 : parseFloat(s.slice(i + 1)); if (isCol(L[f])) return shadeHex(L[f], k); continue; }
      if (isCol(L[s])) return L[s];
    }
    return null;
  }
  /** -> {cols: [vec4 per region: ratio rgb, hide], hidden: [names]} for the manifest tint spec */
  function resolve(tint, look, defLook, ctx) {
    const names = tint.names || ['none'], fields = tint.fields || {}, show = tint.show || {}, base = tint.regions || {};
    const L = Object.assign({}, look || {}, ctx || {});
    const out = [], hidden = [];
    for (let i = 0; i < 24; i++) {
      const n = names[i];
      if (!n || i === 0) { out.push([1, 1, 1, 0]); continue; }
      const fl = fields[n] || DEFAULT_FIELDS[n];
      const want = pick(fl, look || {}) || pick(fl, defLook || {});
      let r = [1, 1, 1];
      if (want && isCol(base[n])) { const w = lin(want), b = lin(base[n]); r = [clamp(w[0] / Math.max(b[0], 0.004), 0, 24), clamp(w[1] / Math.max(b[1], 0.004), 0, 24), clamp(w[2] / Math.max(b[2], 0.004), 0, 24)]; }
      const hide = show[n] !== undefined && !rule(show[n], L);
      if (hide) hidden.push(n);
      out.push([r[0], r[1], r[2], hide ? 1 : 0]);
    }
    return { cols: out, hidden };
  }

  /* ================================================================ the region shader (24 regions + hide) */
  function regionUniform() { const a = []; for (let i = 0; i < 24; i++) a.push(new THREE.Vector4(1, 1, 1, 0)); return { value: a }; }
  const VS_HEAD = '#include <common>\nattribute float aRegion;\nuniform vec4 uReg[24];\n';
  function peopleMaterial(src) {
    const m = src.clone();
    m.userData = { shared: false, m3dPeople: true };
    const U = { uReg: regionUniform() };
    m.userData.reg = U.uReg;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uReg = U.uReg;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', VS_HEAD + 'varying vec3 vTint;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvec4 regT = uReg[int(clamp(aRegion + 0.5, 0.0, 23.0))];\n\tvTint = regT.rgb;')
        .replace('#include <project_vertex>', '\tif (regT.a > 0.5) transformed = vec3(0.0);\n#include <project_vertex>');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n\tdiffuseColor.rgb *= vTint;');
    };
    m.customProgramCacheKey = () => 'm3d-ppl24';
    m.needsUpdate = true;
    // the shadow pass: hidden slots must not cast shadows either
    const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    d.userData = { shared: false };
    d.onBeforeCompile = (sh) => {
      sh.uniforms.uReg = U.uReg;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', VS_HEAD)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvec4 regT = uReg[int(clamp(aRegion + 0.5, 0.0, 23.0))];')
        .replace('#include <project_vertex>', '\tif (regT.a > 0.5) transformed = vec3(0.0);\n#include <project_vertex>');
    };
    d.customProgramCacheKey = () => 'm3d-ppl24-depth';
    m.userData.depth = d;
    S.mats++;
    return m;
  }
  function dressMaterial(m, md, look, ctx) {
    const T = md.man.tint;
    if (!T) return null;
    const R = resolve(T, look, md.meta.look, ctx);
    const U = m.userData.reg.value;
    for (let i = 0; i < 24; i++) { const c = R.cols[i]; U[i].set(c[0], c[1], c[2], c[3]); }
    return R;
  }

  /* ================================================================ archetype index (from the manifests) */
  const ROLE_MODEL = { vendor: 'vendor', old: 'old_man_dhoti', elder: 'man_kurta_skullcap', police: 'police_khaki', youth: 'student', college: 'student' };
  function buildIndex() {
    const P = N.ASSETS3D && N.ASSETS3D.manifest;
    if (!P) return null;
    const I = { all: [], byNpc: new Map(), byKind: new Map(), player: null, props: new Map(), clipsOf: new Map() };
    for (const id in P) {
      const m = P[id];
      if (!m || m.family !== 'character') continue;
      const meta = m.meta || {};
      if (meta.role === 'clips') { I.clipsOf.set(meta.rig || id, m); continue; }
      I.all.push(id);
      if (meta.role === 'player') I.player = id;
      for (const [npc, ctx] of Object.entries(meta.npcs || {})) if (!I.byNpc.has(npc)) I.byNpc.set(npc, { id, ctx: ctx || {} });
      for (const k of meta.role === 'player' ? [] : meta.kinds || []) {   // the player's model is never a crowd extra
        if (!I.byKind.has(k)) I.byKind.set(k, []);
        I.byKind.get(k).push({ id, pri: meta.priority || 0, match: meta.match || null });
      }
      // props this model can show: values of 'prop' in its slot rules
      const props = new Set();
      const scan = (r) => { if (!r || typeof r !== 'object') return; if (r.f === 'prop' && r.in) r.in.forEach((x) => props.add(x)); for (const k of ['any', 'all']) if (r[k]) r[k].forEach(scan); if (r.not) scan(r.not); };
      for (const r of Object.values((m.tint && m.tint.show) || {})) scan(r);
      I.props.set(id, props);
    }
    for (const L of I.byKind.values()) L.sort((a, b) => b.pri - a.pri);
    return I;
  }
  const hasModel = (id) => !!(id && M3() && M3().has(id));
  /** the model for a person: {id, ctx} or null (cached per entity while the look object is the same) */
  function choose(e) {
    const I = S.idx;
    if (!I || !e) return null;
    const p = N.player, isP = e === p;
    const look = e.look;
    if (!look) return null;
    const c0 = S.choice.get(e);
    if (c0 && c0.look === look && c0.cart === !!e.cart) return c0.r;
    let r = null;
    const ctx = { _r: hash01((e.npcId || '') + ':' + (e.seed != null ? e.seed : (e.id != null ? e.id : '')) + ':' + (look.shirt || '') + (look.skin || '')), _role: e.role || null, _cart: !!e.cart };
    if (isP && look.kind === 'kid' && I.player) r = { id: I.player, ctx };
    if (!r && e.npcId && I.byNpc.has(e.npcId)) { const n = I.byNpc.get(e.npcId); r = { id: n.id, ctx: Object.assign({}, ctx, n.ctx) }; }
    if (!r) {
      const kind = look.kind || 'man';
      const L = Object.assign({}, look, ctx);
      const prefer = ROLE_MODEL[e.role];
      const list = I.byKind.get(kind) || [];
      if (prefer && hasModel(prefer) && list.some((c) => c.id === prefer)) r = { id: prefer, ctx };
      else for (const c of list) if (!c.match || rule(c.match, L)) { r = { id: c.id, ctx }; break; }
    }
    if (r && !hasModel(r.id)) r = null;
    S.choice.set(e, { look, cart: !!e.cart, r });
    return r;
  }
  const HEAD_LOADS = { trunk: 1, pot: 1, bonam: 1, dappu: 1, neem: 1 };
  /** can the Blender model show this person's current state completely? */
  function supported(e, ch) {
    if (e.hidden || e.vehicle || e.riding || e.alive === false) return false;
    if (e.umb || e.balloons || e.cart) return false;           // procedural extras (umbrella, balloons, carts)
    if (e.spotter && e.spotter.stick) return false;
    const L = e.look || {};
    // head loads change the whole pose (procedural); a small hand prop the model lacks is left out
    if (L.prop && HEAD_LOADS[L.prop]) return false;
    if (e.constable && !clipOf(ch.id, 'direct')) return false;
    return true;
  }
  function clipOf(id, name) {
    const m = N.ASSETS3D && N.ASSETS3D.manifest[id];
    if (!m) return null;
    const lib = typeof (m.meta || {}).clips === 'string' ? N.ASSETS3D.manifest[m.meta.clips] : m;
    return (lib && lib.clips && lib.clips[name]) || null;
  }
  /** parse a lazy model on first use; true when it is ready */
  function ensure(id) {
    const A = M3();
    if (A.loaded(id)) return true;
    if (!S.parsing.has(id) && A.has(id)) {
      S.parsing.add(id);
      A.parse(id).then(() => S.parsing.delete(id), () => S.parsing.delete(id));
    }
    return false;
  }

  /* ================================================================ seats (benches / stools under seated people) */
  let SEAT = null;
  function seatMeshes() {
    if (SEAT) return SEAT;
    const mk = (hex, rough) => { const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: rough, metalness: 0 }); m.userData.shared = true; return m; };
    const cement = mk('#a7a196', 0.95), wood = mk('#7a5a3a', 0.85);
    const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); g.userData.shared = true; return g; };
    // GLB frame of the sitter: +X his left, +Y up, +Z his front; the seat sits a little behind the hips
    SEAT = {
      bench: [[box(7.4, 0.36, 2.3, 0, 2.04, -0.35), cement], [box(0.5, 1.86, 1.7, 3.0, 0.93, -0.35), cement], [box(0.5, 1.86, 1.7, -3.0, 0.93, -0.35), cement]],
      stool: [[box(2.5, 0.3, 2.5, 0, 1.69, -0.3), wood], [box(0.3, 1.54, 0.3, 1.0, 0.77, 0.7), wood], [box(0.3, 1.54, 0.3, -1.0, 0.77, 0.7), wood], [box(0.3, 1.54, 0.3, 1.0, 0.77, -1.3), wood], [box(0.3, 1.54, 0.3, -1.0, 0.77, -1.3), wood]],
    };
    return SEAT;
  }
  function makeSeat(kind) {
    const g = new THREE.Group(); g.name = 'm3d-seat:' + kind;
    for (const [geo, mat] of seatMeshes()[kind]) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.raycast = () => {}; g.add(m); }
    g.visible = false;
    return g;
  }

  /* ================================================================ a person */
  const V_IDLE = 3, FADE = 0.2;
  const tmpQ = () => new THREE.Quaternion();
  class Person {
    constructor(md, look, ctx, o) {
      o = o || {};
      const A = M3();
      this.md = md; this.id = md.id; this.meta = md.meta || {};
      this.object = new THREE.Group(); this.object.name = 'm3d-ppl:' + md.id;
      this.pivot = A.instance(md.id);
      this.pivot.rotation.y = o.attach ? 0 : Math.PI / 2;
      this.object.add(this.pivot);
      this.mesh = null; this.pivot.traverse((x) => { if (x.isSkinnedMesh && !this.mesh) this.mesh = x; });
      this.bones = A.debug.findBones(this.pivot);
      this.anchors = A.debug.findAnchors(this.pivot);
      this.mixer = new THREE.AnimationMixer(this.pivot);
      this.acts = new Map();
      const CM = md.man.clips || {};
      this.cm = CM;
      const female = !!this.meta.female;
      // locomotion sets: the plain gaits, women's '_f' variants replace their base, carts push
      const base = [], fem = new Map();
      for (const [name, c] of Object.entries(CM)) {
        if (!c || !c.loco || !(c.stride > 0) || !md.clips.has(name)) continue;
        if (c.set) continue;
        if (c.style === 'f') { if (c.base) fem.set(c.base, name); continue; }
        base.push(name);
      }
      const L = (names) => names.map((n) => ({ name: n, stride: CM[n].stride, nominal: CM[n].nominal || 40, w: 0, a: null })).sort((p, q) => p.nominal - q.nominal);
      this.sets = { walk: L(base.map((n) => (female && fem.has(n) ? fem.get(n) : n))) };
      if (md.clips.has('push_cart')) this.sets.cart = L(['push_cart']);
      this.set = 'walk'; this.phase = Math.random(); this.locoW = 0; this.v = 0;
      this.idleName = 'idle'; this.idleT = 6 + Math.random() * 8; this.idleW = { idle: 1, idle_look: 0 };
      this.over = null; this.fading = [];
      this.clip = 'idle';
      // tint / slots
      this.mat = null;
      if (this.mesh && md.man.tint) { this.mat = peopleMaterial(this.mesh.material); this.mesh.material = this.mat; this.mesh.customDepthMaterial = this.mat.userData.depth; }
      this.lookRef = null; this.ctx = ctx || {};
      if (look) this.dress(look, ctx);
      // post-mixer offsets (head look, posture): the mixer's output is restored before each update
      this.post = [];
      for (const n of ['spine', 'chest', 'neck', 'head']) if (this.bones[n]) this.post.push({ n, b: this.bones[n], saved: new THREE.Quaternion(), has: false });
      this.headYaw = 0;
      this.seat = null;
      this.act('idle');
      this.mixer.update(0);
    }
    act(name) {
      let a = this.acts.get(name);
      if (a) return a;
      const clip = this.md.clips.get(name);
      if (!clip) return null;
      a = this.mixer.clipAction(clip);
      a.enabled = true; a.setEffectiveWeight(0); a.play();
      const c = this.cm[name] || {};
      if (c.loco) a.paused = true;
      this.acts.set(name, a);
      return a;
    }
    has(name) { return this.md.clips.has(name); }
    dress(look, ctx) {
      this.lookRef = look; if (ctx) this.ctx = ctx;
      if (this.mat) this.hidden = (dressMaterial(this.mat, this.md, look, this.ctx) || {}).hidden || [];
      const sz = (look && look.size) || 1;
      this.object.scale.setScalar(clamp(sz, 0.6, 1.4));
      return this;
    }
    /** a state clip on top of the walking / standing base: mode 'loop' | 'once' (then back) | 'hold' */
    state(name, mode, fade) {
      if (!name) { this.done = null; if (this.over) { this.fading.push(this.over); this.over = null; } return true; }
      if (this.over && this.over.name === name) return true;
      if (this.done === name) return true;          // a one-shot that already played (until the state changes)
      this.done = null;
      const a = this.act(name);
      if (!a) return false;
      if (this.over) this.fading.push(this.over);
      this.fading = this.fading.filter((f) => f.a !== a);
      a.reset(); a.enabled = true; a.paused = false; a.timeScale = 1;
      if (mode === 'loop') a.setLoop(THREE.LoopRepeat, Infinity);
      else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      a.setEffectiveWeight(0); a.play();
      this.over = { name, a, mode: mode || 'loop', w: 0, fade: fade != null ? fade : FADE, t: 0 };
      return true;
    }
    blend(set, v) {
      let S_ = 0;
      for (const l of set) l.w = 0;
      if (!set.length) return 0;
      if (v <= set[0].nominal) set[0].w = 1;
      else if (v >= set[set.length - 1].nominal) set[set.length - 1].w = 1;
      else for (let i = 0; i < set.length - 1; i++) if (v < set[i + 1].nominal) {
        // blend only through the middle of the gap: two gaits with different stance timing mixed at
        // one phase let the feet drift, a single gait (its cadence from the distance) never does
        let t = (v - set[i].nominal) / (set[i + 1].nominal - set[i].nominal);
        t = t <= 0.3 ? 0 : t >= 0.7 ? 1 : ((x) => x * x * (3 - 2 * x))((t - 0.3) / 0.4);
        set[i].w = 1 - t; set[i + 1].w = t; break;
      }
      for (const l of set) S_ += l.w * l.stride;
      return S_;
    }
    /** dt: sim seconds; dist: distance travelled this frame; v: speed (u/s) */
    update(dt, dist, v, o) {
      o = o || {};
      dt = Math.max(0, dt || 0);
      this.v = v;
      for (const P of this.post) if (P.has) P.b.quaternion.copy(P.saved);
      // base: locomotion set by speed, idle / idle_look when standing
      const setName = o.set && this.sets[o.set] ? o.set : 'walk';
      if (setName !== this.set) { for (const l of this.sets[this.set]) if (l.a) l.a.setEffectiveWeight(0); this.set = setName; }
      const set = this.sets[this.set];
      const moving = v > V_IDLE && set.length > 0;
      this.locoW += clamp((moving ? 1 : 0) - this.locoW, -dt / FADE, dt / FADE);
      const stride = this.blend(set, Math.max(v, V_IDLE));
      if (dist == null) dist = v * dt;
      if (moving && stride > 0) this.phase = (this.phase + dist / stride) % 1;
      // the state overlay
      let ov = 0;
      if (this.over) {
        const O = this.over; O.t += dt;
        O.w = Math.min(1, O.w + dt / Math.max(0.01, O.fade));
        if (O.mode === 'once' && O.t > 0.05 && !O.a.isRunning()) { this.fading.push(O); this.over = null; this.done = O.name; }
      }
      for (const F of this.fading) { F.w = Math.max(0, F.w - dt / Math.max(0.01, F.fade)); }
      this.fading = this.fading.filter((F) => { if (F.w > 0) return true; F.a.setEffectiveWeight(0); F.a.stop(); return false; });
      if (this.over) { this.over.a.setEffectiveWeight(this.over.w); ov = this.over.w; }
      for (const F of this.fading) { F.a.setEffectiveWeight(F.w); ov += F.w; }
      ov = Math.min(1, ov);
      const base = 1 - ov;
      let top = null, topW = -1;
      for (const l of set) {
        const w = base * this.locoW * l.w;
        if (w > 0 && !l.a) l.a = this.act(l.name);
        if (l.a) { l.a.time = this.phase * l.a.getClip().duration; l.a.setEffectiveWeight(w); }
        if (w > topW) { topW = w; top = l.name; }
      }
      // idle: mostly idle, now and then a look around (cross-faded)
      if (!moving) { this.idleT -= dt; if (this.idleT <= 0) { const look = this.idleName === 'idle' && this.has('idle_look'); this.idleName = look ? 'idle_look' : 'idle'; this.idleT = look ? 6 : 8 + Math.random() * 10; if (look) { const a = this.act('idle_look'); if (a) a.reset(); } } }
      const iw = base * (1 - this.locoW);
      for (const n of ['idle', 'idle_look']) {
        this.idleW[n] += clamp((this.idleName === n ? 1 : 0) - this.idleW[n], -dt / 0.6, dt / 0.6);
        const a = this.acts.get(n) || (this.idleW[n] > 0 && this.act(n));
        if (a) a.setEffectiveWeight(iw * this.idleW[n]);
      }
      this.clip = this.over ? this.over.name : (iw >= topW ? this.idleName : top);
      this.mixer.update(dt);
      // post: posture + head look (about the person's own up / left axes, whatever the bone axes are)
      const post = (o.posture || o.headYaw) && this.post.length;
      if (post) {
        this.pivot.updateWorldMatrix(true, true);
        const qObj = tmpQ(); this.pivot.getWorldQuaternion(qObj);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(qObj), left = new THREE.Vector3(1, 0, 0).applyQuaternion(qObj);
        const qb = tmpQ(), q = tmpQ(), ax = new THREE.Vector3();
        for (const P of this.post) {
          P.saved.copy(P.b.quaternion); P.has = true;
          const pitch = (o.posture && o.posture[P.n]) || 0;
          const yaw = o.headYaw ? (P.n === 'head' ? 0.6 : P.n === 'neck' ? 0.4 : 0) * o.headYaw : 0;
          if (!pitch && !yaw) continue;
          P.b.getWorldQuaternion(qb); qb.invert();
          if (pitch) { ax.copy(left).applyQuaternion(qb).normalize(); P.b.quaternion.multiply(q.setFromAxisAngle(ax, pitch)); }
          if (yaw) { ax.copy(up).applyQuaternion(qb).normalize(); P.b.quaternion.multiply(q.setFromAxisAngle(ax, yaw)); }
          P.b.updateMatrixWorld(true);
        }
      }
      return this;
    }
    /** hold one clip exclusively at a phase (riding: the phase follows the crank) */
    pose(name, phase) {
      const a = this.act(name);
      if (!a) return false;
      for (const [k, x] of this.acts) if (x !== a) x.setEffectiveWeight(0);
      a.paused = true; a.setEffectiveWeight(1);
      a.time = (((phase % 1) + 1) % 1) * a.getClip().duration;
      this.clip = name; this.over = null; this.fading = []; this.locoW = 0;
      this.mixer.update(0);
      return true;
    }
    showSeat(kind) {
      if (!kind) { if (this.seat) this.seat.visible = false; return; }
      if (!this.seat || this.seat.name !== 'm3d-seat:' + kind) {
        if (this.seat) this.pivot.remove(this.seat);
        this.seat = makeSeat(kind); this.pivot.add(this.seat);
      }
      this.seat.visible = true;
    }
    weights() { const o = {}; for (const [k, a] of this.acts) { const w = a.getEffectiveWeight(); if (w > 0.001) o[k] = +w.toFixed(3); } return o; }
    /** world positions of the sole anchors (tests: planted feet) */
    soles() {
      const out = {}, v = new THREE.Vector3();
      this.object.updateWorldMatrix(true, true);
      for (const n of ['sole_heel_L', 'sole_heel_R', 'sole_toe_L', 'sole_toe_R']) { const a = this.anchors[n]; if (a) { a.getWorldPosition(v); out[n] = { x: v.x, h: v.y, y: v.z }; } }
      return out;
    }
    dispose() {
      this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.pivot);
      if (this.mat) { if (this.mat.userData.depth) this.mat.userData.depth.dispose(); this.mat.dispose(); S.mats--; }
      M3().debug.disposeInstance(this.object);
    }
  }

  /* ================================================================ actor spec + per-entity state */
  const simDt = (st) => { const t = (N.time && N.time.now) || 0; const d = clamp(t - (st.t == null ? t : st.t), 0, 0.1); st.t = t; return d; };
  function personState(e, isP, v) {
    const o = e.clip3d;
    if (o) { const n = typeof o === 'string' ? o : o.name; return { clip: n, mode: (o && o.loop === false) ? 'once' : (o && o.hold) ? 'hold' : 'loop' }; }
    const down = e.down || (isP && e.downT > 0) || (!isP && e.knockT > 0 && e.kind !== 'ped');
    if (down) {
      const up = e.getupT > 0 || (isP && e.downT > 0 && e.downT < 0.45);
      return up ? { clip: 'getup', mode: 'once', fade: 0.12 } : { clip: 'fall', mode: 'hold', fade: 0.08 };
    }
    if ((e.idle === 'sit' && !e.walk && !e.followSt && v < 4) || (isP && e.sitting)) return { clip: e.bench ? 'sit' : 'sit_step', mode: 'loop', seat: e.bench ? 'bench' : 'stool', fade: 0.3 };
    if (e.constable) return { clip: 'direct', mode: 'loop' };
    if (e.talking && v < 4) return { clip: 'talk', mode: 'loop', fade: 0.35 };
    return null;
  }
  function spec(id) {
    return {
      shadow: true, fps: false, m3d: id, people: true,
      create(e, H) {
        const md = M3().debug.S.models.get(id);
        if (!md || !md.clips.size) return null;
        const ch = choose(e);
        let P;
        try { P = new Person(md, e === N.player ? N.player.look : e.look, ch && ch.id === id ? ch.ctx : {}); } catch (er) { N.err('models3d_people.create:' + id, er); return null; }
        P.object.userData.m3dPerson = P;
        P.object.userData.m3dChar = P;   // the Character-shaped fields tests/models3d.cjs reads (id, anchors, clip, v, phase)
        if (H && H.quality && !H.quality.shadows) P.object.add(H.blobShadow(e.look && e.look.kind === 'kid' ? 3.8 : 4.6));
        P.st = { t: null, x: e.x, y: e.y, yaw: isFinite(e.facing) && e === N.player ? e.facing : (e.angle || 0), v: 0, hy: 0, ent: e };
        P.object.userData.m3dState = P.st;
        S.persons.add(P); S.created++;
        return P.object;
      },
      update(obj, e, dt, H) {
        const P = obj.userData.m3dPerson, st = P.st;
        const isP = e === N.player;
        const d = simDt(st);
        let dist = Math.hypot(e.x - st.x, e.y - st.y);
        if (dist > 40) dist = 0;   // teleported
        st.x = e.x; st.y = e.y;
        let v = Math.hypot(e.vx || 0, e.vy || 0);
        if (!(v > 0) && d > 1e-5) v = Math.min(200, dist / d);
        st.v += (v - st.v) * Math.min(1, d * 12);
        const look = isP ? N.player.look : e.look;
        if (look !== P.lookRef) { const ch = choose(e); P.dress(look, ch && ch.id === id ? ch.ctx : P.ctx); }
        // facing: smooth turns like the procedural people
        const face = isFinite(e.facing) && isP ? e.facing : (e.angle || 0);
        st.yaw += wrapA(face - st.yaw) * Math.min(1, d * 14);
        const S1 = personState(e, isP, st.v);
        let yaw = st.yaw;
        if (S1 && S1.clip === 'direct' && e.pod) { const pod = e.pod; yaw = (pod.axisA || 0) + (pod.green ? Math.PI / 2 : 0) + Math.sin(((N.time && N.time.now) || 0) * 2) * 0.3; st.yaw = yaw; }
        if (S1) { if (!P.state(S1.clip, S1.mode, S1.fade)) P.state(null); } else P.state(null);
        P.showSeat(S1 && S1.seat);
        // the head turns towards what the person looks at; the player looks where the camera looks
        let rel = 0;
        if (OPT.headLook && !(S1 && (S1.clip === 'fall' || S1.clip === 'getup'))) {
          let tg = null;
          if (e.lookT > 0 && e.lookAt && isFinite(e.lookAt.x)) tg = e.lookAt;
          else if (e.lookTarget && isFinite(e.lookTarget.x)) tg = e.lookTarget;
          if (tg) rel = wrapA(Math.atan2(tg.y - e.y, tg.x - e.x) - st.yaw);
          else if (isP && N.view && N.view.mode === 'tps' && isFinite(N.view.yaw)) rel = wrapA(N.view.yaw - st.yaw) * 0.6;
        }
        st.hy += (clamp(rel, -1.1, 1.1) - st.hy) * Math.min(1, d * 5);
        P.update(d, (S1 ? 0 : dist), S1 ? 0 : st.v, { set: 'walk', headYaw: Math.abs(st.hy) > 0.01 ? -st.hy : 0, posture: OPT.posture ? P.meta.posture : null });
        let el = H.elev(e);
        if (!el && e.roofH) el = e.roofH * ((N.view3d && N.view3d.VS) || 1.5);
        obj.position.set(e.x, el, e.y);
        obj.rotation.y = -yaw;
        // emotes / the spotter's "!" over the head (view3d_actors draws them)
        const EM = N.view3dActors && N.view3dActors.debug && N.view3dActors.debug.EMOTES;
        if (EM) {
          const head = el + (P.meta.height || 9) * ((look && look.size) || 1) + 0.6;
          if (e.spotter) EM.push({ x: e.x, y: e.y, h: head + 3, kind: '!', a: 1 });
          else if (e.emoteSt) { const em = e.emoteSt; EM.push({ x: e.x, y: e.y, h: head + 3, kind: em.kind, a: clamp(Math.min(em.t * 6, (em.secs - em.t) * 4), 0, 1) }); }
        }
      },
      dispose(obj) { const P = obj && obj.userData.m3dPerson; if (P) { S.persons.delete(P); S.disposed++; P.dispose(); } },
    };
  }

  /* ================================================================ routing (called by models3d.js every frame) */
  function unroute(e) { if (e && isOurs(e.view3d)) delete e.view3d; }
  function route(list, p, tracked) {
    const t0 = nowMs();
    const V3 = N.view3d;
    if (!S.ready || !V3 || !V3.active) return;
    const A = M3();
    if (!OPT.enabled || !A.options.enabled) { for (const e of list) unroute(e); if (p) unroute(p); return; }
    const f = V3.focus ? V3.focus() : p;
    const fx = f ? f.x : 0, fy = f ? f.y : 0;
    const cands = [];
    const consider = (e) => {
      if (!e || e.alive === false) return;
      const isP = e === p;
      if (!isP && e.kind !== 'ped' && e.kind !== 'npc') return;
      if (isP ? !(OPT.player && A.options.player) : e.kind === 'npc' ? !OPT.npcs : !OPT.peds) { unroute(e); return; }
      const ch = choose(e);
      if (!ch || (tracked && tracked(e)) || !supported(e, ch)) { unroute(e); return; }
      if (!ensure(ch.id)) { unroute(e); return; }
      const d2 = (e.x - fx) * (e.x - fx) + (e.y - fy) * (e.y - fy);
      cands.push({ e, key: KEY(ch.id), d2, isP });
    };
    if (p) consider(p);
    for (const e of list) if (e !== p) consider(e);
    cands.sort((a, b) => (b.isP - a.isP) || (a.d2 - b.d2));
    let n = 0, fresh = 0;
    const R = OPT.dist, RH = OPT.dist + OPT.hyst;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i], on = c.e.view3d === c.key;
      const ok = c.isP || (on ? (i < OPT.max + 6 && c.d2 < RH * RH) : (i < OPT.max && c.d2 < R * R && fresh < OPT.maxNew));
      if (ok) { if (!on) { c.e.view3d = c.key; fresh++; } n++; } else unroute(c.e);
    }
    S.routed = n; S.frameNew = fresh;
    S.ms = nowMs() - t0; S.msAvg += (S.ms - S.msAvg) * 0.05;
  }

  /* ================================================================ riders (models3d Character): the same shader */
  function tintHook(c, look) {
    if (!c || !c.mesh || !c.md || !c.md.man.tint || !(c.md.man.tint.names || []).length) return false;
    if (!c._ppl) {
      const m = peopleMaterial(c.mesh.material);
      c._ppl = m; c.mesh.material = m; c.mesh.customDepthMaterial = m.userData.depth; c.tintMat = m;
      const d0 = c.dispose.bind(c);
      c.dispose = () => { if (m.userData.depth) m.userData.depth.dispose(); S.mats--; d0(); };
    }
    const ctx = { _r: hash01((look && (look.shirt || '') + (look.skin || '')) || 'rider') };
    dressMaterial(c._ppl, c.md, look, ctx);
    return true;
  }

  /* ================================================================ setup */
  function setup() {
    const A = M3(), V3 = N.view3d;
    if (!A || !V3 || S.ready) return;
    THREE = window.THREE;
    if (!THREE || !THREE.AnimationMixer) return;
    S.idx = buildIndex();
    if (!S.idx || !S.idx.all.length) return;
    for (const id of S.idx.all) {
      const k = KEY(id);
      if (S.specs.has(k)) continue;
      V3.registerActorRenderer(k, spec(id));
      S.specs.add(k);
    }
    A.hooks.tint = tintHook;
    A.hooks.people = { ready: true, route };
    S.ready = true;
    N.emit('models3d:people', { models: S.idx.all.slice() });
  }
  N.on('models3d:ready', () => { try { setup(); } catch (e) { N.err('models3d_people.setup', e); } });

  /* ================================================================ API */
  const api = {
    options: OPT, OPT,
    get ready() { return S.ready; },
    models: () => (S.idx ? S.idx.all.slice() : []),
    choose: (e) => choose(e),
    /** play a clip on a person drawn by a Blender model (or as soon as it is): loop by default */
    play(e, name, o) { if (!e) return false; e.clip3d = o && o.loop === false ? { name, loop: false } : (o && o.hold ? { name, hold: true } : name); return true; },
    stop(e) { if (e) delete e.clip3d; },
    person(e) {
      const V3 = N.view3d, E = V3 && V3.engine;
      if (!E || !E.actorGroup || !e) return null;
      let out = null;
      for (const P of S.persons) if (P.st && P.st.ent === e) { out = P; break; }
      return out;
    },
    stats() {
      return { ready: S.ready, models: S.idx ? S.idx.all.length : 0, routed: S.routed, persons: S.persons.size, created: S.created, disposed: S.disposed, parsing: Array.from(S.parsing), mats: S.mats, routeMs: +S.msAvg.toFixed(3) };
    },
    debug: { S, Person, resolve, rule, choose, supported, route, buildIndex, peopleMaterial, dressMaterial },
  };
  const attach = () => { if (N.models3d) N.models3d.people = api; };
  attach();
  if (!N.models3d) N.on('models3d:ready', attach);
})();
