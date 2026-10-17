/* NOSTALGIA — models3d_vehicles.js (vehicles artist) — ARCHITECTURE §21 "Vehicles (runtime)"
 *
 * The Blender vehicles (tools/blender/vehicles.py -> assets3d/<id>.glb -> src/assets3d_pack.js) in
 * the 3D view, on top of models3d.js (pipeline) and models3d_people.js (characters). When models3d
 * is ready this file re-registers every vehicle model's actor key 'm3d:veh:<id>' with a full
 * renderer and routes vehicles to it (a system after models3d's own routing):
 *  - Parts: every wheel bone spins with the distance rolled (meta.wheels: radius per bone); front
 *    forks / handlebars / car front wheels / steering wheels turn with v.steerVis about their own
 *    axes (meta.steerBones, else the 'steer' bone about meta.steerAxis; right turn = clockwise seen
 *    from above / from the driver); cranks and pedals follow the road (pedal cycles, the rickshaw);
 *    propellers / paddle wheels spin (meta.props); the saddle lets down (meta.saddleDrop).
 *  - Looks: the paint regions take the vehicle's colours (meta.tintSrc: paint <- v.color, paint2 <-
 *    v.color or v.color2; a taxi (v.taxi) wears meta.taxi); option bones show by meta.options rules
 *    ({bone, types, notTypes, flag (v[flag] truthy), route (v.route), seed: [n, i]}: taxi carrier,
 *    government beacon, slogans, route boards, gears, tarpaulin, marigolds ...); hidden ones scale to 0.
 *  - Lamps: one shader for the baked emissive mask, per lamp group (_REGION 4 head, 5 tail / brake,
 *    6 indicators, 7 beacon): heads and tails at night while driven, brake lights on braking (day
 *    too), beacons flash; real point lights for the player's and the nearest headlamps at night.
 *  - Motion: two-wheelers lean with v.lean, stand on their stand when parked (meta.stand 'side' leans
 *    them), lie down when fallen; pothole jolts; boats bob, roll and pitch on the water; the body is
 *    scaled to TYPES[t].w / meta.length.
 *  - Riders: every occupant (driver, pillion, passenger, and a few ambient passengers in autos,
 *    rickshaws and boats, like view3d_actors) is a Blender character chosen by the people runtime
 *    (N.models3d.people.choose: the same model a person has on foot), dressed through
 *    N.models3d.hooks.tint, and posed by two-bone IK on the shared skeleton onto the vehicle's
 *    anchors: hips on the seat_* anchor, hands on grip_L / grip_R (they turn with the bars or the
 *    steering wheel), feet on foot_* (floorboard, footpegs, car pedals) or on the turning pedals
 *    (ankling, hips dip when a short leg cannot reach); passengers rest their hands on their knees,
 *    women ride pillion side-saddle. On a Hero roadster the authored library clips (ride_cycle at the
 *    clip's saddle drop, a kid's ride_kainchi) stay phase-locked to the crank, as models3d did. In
 *    first person the player's own body is hidden (the bars / dash stay). A vehicle is routed only
 *    when every occupant who must be seen has a model ready (lazy ones parse on demand); otherwise
 *    view3d_actors' procedural renderer (still registered underneath) draws it.
 *
 * Public: N.models3dVehicles = {options, ready, stats(), modelFor(type), debug {...}}.
 * Hooks into modules this file does not own (documented extension points only): the actor keys
 * 'm3d:veh:<id>' that models3d.js registered (re-registered with this renderer: N.view3d replaces a
 * key's spec), N.models3d.hooks.riderModel (so models3d's own routing agrees), e.view3d (§20 key
 * resolution). Conventions (§21): GLB front = +Z, the rider's left = +X, Y up; the vehicle sits in an
 * inner pivot (rotation.y = PI/2) so the outer object takes the core's rotation.y = -angle.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const nowMs = () => performance.now();

  /* ================================================================ options + state */
  const OPT = { enabled: true, riders: true, ambient: true, lamps: true, lights: true, farIK: 230 };
  const ST = { installed: false, models: [], types: new Map(), routed: 0, riders: 0, frame: 0, ikMs: 0, ikAvg: 0, vehicles: 0, made: 0, lights: 0 };
  let THREE = null;
  const M3 = () => N.models3d;
  const S3 = () => (N.models3d && N.models3d.debug && N.models3d.debug.S) || null;
  const mdOf = (id) => { const s = S3(); return s ? s.models.get(id) || null : null; };
  const manOf = (id) => (N.ASSETS3D && N.ASSETS3D.manifest && N.ASSETS3D.manifest[id]) || null;
  const REGION = { none: 0, paint: 1, paint2: 2, paint3: 3, head: 4, tail: 5, indicator: 6, beacon: 7 };

  // scratch
  let V1, V2, V3a, V4, Q1, Q2, M4, MI;
  function scratch() { V1 = new THREE.Vector3(); V2 = new THREE.Vector3(); V3a = new THREE.Vector3(); V4 = new THREE.Vector3(); Q1 = new THREE.Quaternion(); Q2 = new THREE.Quaternion(); M4 = new THREE.Matrix4(); MI = new THREE.Matrix4(); }
  /** Blender (x, y, z) -> glTF (x, z, -y) */
  const b2g = (a) => new THREE.Vector3(a[0], a[2], -a[1]);

  function hexLin(h) {
    if (typeof h !== 'string') return null;
    let s = h.trim(); if (s[0] === '#') s = s.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const v = parseInt(s.slice(0, 6), 16); if (!isFinite(v)) return null;
    const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return [f((v >> 16) & 255), f((v >> 8) & 255), f(v & 255)];
  }
  function findBones(root) { const o = {}; root.traverse((n) => { if (n.isBone) o[n.name] = n; }); return o; }
  function findAnchors(root) { const o = {}; root.traverse((n) => { if (n.name && n.name.indexOf('anchor_') === 0) o[n.name.slice(7)] = n; }); return o; }

  /* ================================================================ vehicle material: region tint + lamp groups */
  function vehMaterial(src) {
    const m = src.clone();
    m.userData = Object.assign({}, src.userData, { shared: false, m3dv: true });
    const U = { uTint: { value: [] }, uLamp: { value: new Float32Array(8) } };
    for (let i = 0; i < 8; i++) U.uTint.value.push(new THREE.Vector3(1, 1, 1));
    m.userData.vU = U;
    m.emissiveIntensity = 1;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTint = U.uTint; sh.uniforms.uLamp = U.uLamp;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aRegion;\nuniform vec3 uTint[8];\nuniform float uLamp[8];\nvarying vec3 vTint;\nvarying float vLamp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tint vRi = int(clamp(aRegion + 0.5, 0.0, 7.0));\n\tvTint = uTint[vRi];\n\tvLamp = uLamp[vRi];');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTint;\nvarying float vLamp;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n\tdiffuseColor.rgb *= vTint;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vLamp;');
    };
    m.customProgramCacheKey = () => 'm3dv-veh';
    m.needsUpdate = true;
    return m;
  }

  /* ================================================================ vehicle parts */
  function localAxis(bone, rootQinv, axis) {
    const q = new THREE.Quaternion();
    bone.getWorldQuaternion(q);
    q.premultiply(rootQinv);
    return axis.clone().applyQuaternion(q.invert()).normalize();
  }
  function evalOption(rule, v, opts) {
    const t = v.type;
    if (rule.types && rule.types.indexOf(t) < 0) return false;
    if (rule.notTypes && rule.notTypes.indexOf(t) >= 0) return false;
    if (rule.flag && !v[rule.flag]) return false;
    if (rule.route != null) {
      const routes = opts.filter((o) => o.route != null && (!o.types || o.types.indexOf(t) >= 0) && (!o.notTypes || o.notTypes.indexOf(t) < 0));
      const hit = v.route != null && routes.some((o) => o.route === v.route);
      if (hit) return rule.route === v.route;
    }
    if (rule.seed) { const n = rule.seed[0] | 0, i = rule.seed[1] | 0; if (n > 0 && (((v.seed | 0) % n) + n) % n !== i) return false; }
    return true;
  }
  class VParts {
    constructor(id) {
      const md = mdOf(id);
      this.id = id; this.md = md; this.meta = md.meta || {};
      const meta = this.meta;
      this.object = new THREE.Group(); this.object.name = 'm3d-veh:' + id;
      this.object.rotation.order = 'YXZ';
      this.pivot = M3().instance(id); this.pivot.rotation.y = Math.PI / 2;
      this.object.add(this.pivot);
      this.pivot.updateMatrixWorld(true);
      const rootQinv = new THREE.Quaternion(); this.pivot.getWorldQuaternion(rootQinv); rootQinv.invert();
      this.bones = findBones(this.pivot); this.anchors = findAnchors(this.pivot);
      // the baked body (the mesh whose material carries the atlas); glass is its own primitive
      this.mesh = null;
      this.pivot.traverse((o) => { if (o.isMesh && !this.mesh && o.material && !Array.isArray(o.material) && o.material.map) this.mesh = o; });
      // per-instance material (tint + lamps)
      this.mat = null;
      if (this.mesh) { this.mat = vehMaterial(this.mesh.material); this.mesh.material = this.mat; }
      const lateral = new THREE.Vector3(1, 0, 0);
      const part = (name, axis) => { const b = this.bones[name]; return b ? { name, node: b, rest: b.quaternion.clone(), axis: localAxis(b, rootQinv, axis) } : null; };
      // wheels
      const wR = meta.wheels || { wheel_rear: meta.wheelR || 3, wheel_front: meta.wheelR || 3 };
      this.wheels = [];
      for (const [n, r] of Object.entries(wR)) { const p = part(n, lateral); if (p) { p.R = r || meta.wheelR || 3; this.wheels.push(p); } }
      this.R = meta.wheelR || (this.wheels[0] && this.wheels[0].R) || 3;
      this.gear = meta.gear || 2.4;
      // steering: every steer bone about its axis, normalised to point down / forwards (right turn = positive)
      this.steers = [];
      const sb = meta.steerBones || (this.bones.steer ? { steer: { axis: meta.steerAxis || [0, -0.381, -0.925], k: 1 } } : {});
      for (const [n, s] of Object.entries(sb)) {
        const ax = b2g(s.axis || [0, 0, 1]).normalize();
        if (ax.y > 0) ax.negate();
        const p = part(n, ax); if (!p) continue;
        p.k = Math.abs(s.k == null ? 1 : s.k) * (n === 'steer_wheel' ? 1 : 0.8);
        this.steers.push(p);
      }
      this.steer = this.steers.find((p) => p.name === 'steer') || this.steers[0] || null;
      this.crank = part('crank', lateral);
      this.pedals = ['pedal_L', 'pedal_R'].map((n) => part(n, lateral)).filter(Boolean);
      this.props = [];
      for (const [n, s] of Object.entries(meta.props || {})) { const p = part(n, b2g(s.axis || [1, 0, 0]).normalize()); if (p) { p.k = s.k || 1; p.ph = 0; this.props.push(p); } }
      // saddle (let down along the seat tube)
      this.saddleP = null; this.drop = 0;
      if (this.bones.saddle) {
        const b = this.bones.saddle, pq = new THREE.Quaternion();
        if (b.parent) { b.parent.getWorldQuaternion(pq); pq.premultiply(rootQinv); }
        const s0 = meta.saddleTube || [0, 0.371, 0.928];
        this.saddleP = { node: b, rest: b.position.clone(), dir: b2g(s0).normalize().applyQuaternion(pq.invert()) };
      }
      // options
      this.opts = (meta.options || []).filter((o) => this.bones[o.bone]);
      this.optKey = null;
      // tint
      const T = md.man.tint || {};
      this.names = T.names || ['none', 'paint', 'paint2', 'paint3', 'head', 'tail', 'indicator', 'beacon'];
      this.base = T.regions || {};
      this.tintKey = null;
      this.state = { dist: 0, steer: 0, crank: 0 };
      this.riders = []; this.rider = null; this.drop = 0;
      this.lampsOn = -1;
      this.set({ dist: 0, steer: 0 });
      ST.made++;
    }
    /** dist: distance rolled (u); steer: v.steerVis (+ = right); crank: radians (default dist / R / gear) */
    set(o) {
      const st = this.state;
      if (o.dist != null) st.dist = o.dist;
      if (o.steer != null) st.steer = o.steer;
      st.crank = o.crank != null ? o.crank : st.dist / this.R / this.gear;
      const q = Q1;
      for (const w of this.wheels) w.node.quaternion.copy(w.rest).multiply(q.setFromAxisAngle(w.axis, st.dist / w.R));
      for (const s of this.steers) s.node.quaternion.copy(s.rest).multiply(q.setFromAxisAngle(s.axis, st.steer * s.k));
      if (this.crank) this.crank.node.quaternion.copy(this.crank.rest).multiply(q.setFromAxisAngle(this.crank.axis, st.crank));
      for (const p of this.pedals) p.node.quaternion.copy(p.rest).multiply(q.setFromAxisAngle(p.axis, -st.crank));
      return this;
    }
    spinProps(dt, speed) {
      for (const p of this.props) { p.ph = (p.ph + dt * (0.6 + Math.abs(speed) * 0.08) * p.k) % TAU; p.node.quaternion.copy(p.rest).multiply(Q1.setFromAxisAngle(p.axis, p.ph)); }
    }
    saddle(d) { if (this.saddleP && d !== this.drop) { this.drop = d; this.saddleP.node.position.copy(this.saddleP.rest).addScaledVector(this.saddleP.dir, -d); } return this; }
    /** option bones for vehicle v (hidden ones scale to zero) */
    options(v) {
      const key = v.type + '|' + (v.taxi ? 1 : 0) + (v.beacon ? 1 : 0) + '|' + (v.route || '') + '|' + (v.seed | 0);
      if (key === this.optKey) return;
      this.optKey = key;
      for (const o of this.opts) { const on = evalOption(o, v, this.opts); this.bones[o.bone].scale.setScalar(on ? 1 : 0); }
    }
    /** paint colours for vehicle v */
    tint(v) {
      if (!this.mat) return;
      const src = this.meta.tintSrc || { paint: 'color' };
      const taxi = v.taxi && this.meta.taxi ? this.meta.taxi : null;
      const want = {};
      for (const r of ['paint', 'paint2', 'paint3']) {
        if (taxi && taxi[r]) want[r] = taxi[r];
        else if (src[r]) want[r] = v[src[r]] || v.color;
      }
      const key = (want.paint || '') + (want.paint2 || '') + (want.paint3 || '');
      if (key === this.tintKey) return;
      this.tintKey = key;
      const U = this.mat.userData.vU.uTint.value;
      for (let i = 0; i < 8; i++) {
        const r = this.names[i], b = r && hexLin(this.base[r]), w = r && hexLin(want[r]);
        if (!b || !w) { U[i].set(1, 1, 1); continue; }
        U[i].set(clamp(w[0] / Math.max(b[0], 0.004), 0, 24), clamp(w[1] / Math.max(b[1], 0.004), 0, 24), clamp(w[2] / Math.max(b[2], 0.004), 0, 24));
      }
    }
    lamps(head, tail, ind, beacon) {
      if (!this.mat) return;
      const L = this.mat.userData.vU.uLamp.value;
      L[4] = head; L[5] = tail; L[6] = ind; L[7] = beacon;
    }
    /** an anchor's position in the vehicle's GLB frame (after pivot.updateMatrixWorld) */
    anchorPos(name, out) {
      const a = this.anchors[name];
      if (!a) return null;
      out.setFromMatrixPosition(a.matrixWorld).applyMatrix4(this.inv);
      return out;
    }
    dispose() {
      for (const r of this.riders) r.dispose();
      this.riders = []; this.rider = null;
      if (this.mat) this.mat.dispose();
      if (this.object.parent) this.object.parent.remove(this.object);
    }
  }

  /* ================================================================ riders: Blender characters posed by IK */
  const REST = new Map();
  const BN = ['root', 'hips', 'spine', 'chest', 'neck', 'head'];
  for (const s of ['L', 'R']) BN.push('shoulder_' + s, 'upperarm_' + s, 'forearm_' + s, 'hand_' + s, 'thigh_' + s, 'shin_' + s, 'foot_' + s, 'toe_' + s);
  /** rest data of a character model (from a fresh clone: bones at their rest TRS) */
  function restOf(cid) {
    let R = REST.get(cid);
    if (R) return R;
    const o = M3().instance(cid);
    if (!o) return null;
    o.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
    R = { lp: {}, lq: {}, wp: {}, wq: {}, parent: {}, ok: true };
    o.traverse((b) => {
      if (!b.isBone) return;
      R.lp[b.name] = b.position.clone(); R.lq[b.name] = b.quaternion.clone();
      const m = new THREE.Matrix4().multiplyMatrices(inv, b.matrixWorld), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      m.decompose(p, q, s);
      R.wp[b.name] = p; R.wq[b.name] = q;
      R.parent[b.name] = b.parent && b.parent.isBone ? b.parent.name : null;
    });
    for (const n of BN) if (!R.wp[n]) R.ok = false;
    if (R.ok) {
      const md = mdOf(cid);
      R.h = (md && md.meta && md.meta.height) || 9;
      R.k = R.h / 9;
      R.hipMid = R.wp.thigh_L.clone().add(R.wp.thigh_R).multiplyScalar(0.5);
      R.hipOff = R.hipMid.clone().sub(R.wp.hips).applyQuaternion(R.wq.hips.clone().invert());   // in the hips' rest frame
      R.ball2ankle = { L: R.wp.foot_L.clone().sub(R.wp.toe_L), R: R.wp.foot_R.clone().sub(R.wp.toe_R) };
      R.ballH = Math.max(0.05, (R.wp.toe_L.y + R.wp.toe_R.y) / 2);
      const fq = (a, b, pole) => basisQ(R.wp[b].clone().sub(R.wp[a]), pole, new THREE.Quaternion());
      const FWD = new THREE.Vector3(0, 0, 1), BACK = new THREE.Vector3(0, 0, -1);
      R.fr = {};
      for (const s of ['L', 'R']) {
        R.fr['thigh_' + s] = fq('thigh_' + s, 'shin_' + s, FWD); R.fr['shin_' + s] = fq('shin_' + s, 'foot_' + s, FWD);
        R.fr['upperarm_' + s] = fq('upperarm_' + s, 'forearm_' + s, BACK); R.fr['forearm_' + s] = fq('forearm_' + s, 'hand_' + s, BACK);
        R['len_leg_' + s] = [R.wp['shin_' + s].distanceTo(R.wp['thigh_' + s]), R.wp['foot_' + s].distanceTo(R.wp['shin_' + s])];
        R['len_arm_' + s] = [R.wp['forearm_' + s].distanceTo(R.wp['upperarm_' + s]), R.wp['hand_' + s].distanceTo(R.wp['forearm_' + s])];
      }
    }
    o.traverse((m) => { if (m.isMesh && m.geometry) { /* shared geometry: nothing to free */ } });
    REST.set(cid, R);
    return R;
  }
  const _bx = { x: null, y: null, z: null, m: null };
  /** quaternion of the frame (x = pole made perpendicular to dir, y = dir, z = x cross y) */
  function basisQ(dir, pole, out) {
    if (!_bx.x) { _bx.x = new THREE.Vector3(); _bx.y = new THREE.Vector3(); _bx.z = new THREE.Vector3(); _bx.m = new THREE.Matrix4(); }
    const y = _bx.y.copy(dir).normalize(), x = _bx.x.copy(pole).addScaledVector(y, -pole.dot(y));
    if (x.lengthSq() < 1e-8) { x.set(1, 0, 0).addScaledVector(y, -y.x); if (x.lengthSq() < 1e-8) x.set(0, 0, 1).addScaledVector(y, -y.z); }
    x.normalize();
    _bx.z.crossVectors(x, y);
    _bx.m.makeBasis(x, y, _bx.z);
    return out.setFromRotationMatrix(_bx.m);
  }
  const POSES = {
    cycle: { lean: 0.42, up: 0.26, back: 0.18 }, scooter: { lean: 0.08, up: 0.5 }, moped: { lean: 0.14, up: 0.5 }, moto: { lean: 0.3, up: 0.5 },
    auto: { lean: 0.1, up: 0.5 }, car: { lean: -0.14, up: 0.5 }, bench: { lean: 0.02, up: 0.5 }, sit: { lean: 0.02, up: 0.5 },
    pillion: { lean: 0.06, up: 0.5 }, side: { lean: 0.0, up: 0.5, yaw: Math.PI / 2 }, boatman: { lean: 0.1, up: 0.45 },
  };
  const SIDE_KINDS = { aunty: 1, saree: 1, woman: 1, burqa: 1 };
  class Rider {
    constructor(cid, look, ctx) {
      this.id = cid; this.md = mdOf(cid); this.R = restOf(cid);
      this.object = M3().instance(cid);
      this.object.name = 'm3dv-rider:' + cid;
      this.bones = findBones(this.object);
      this.mesh = null; this.object.traverse((o) => { if (o.isSkinnedMesh && !this.mesh) this.mesh = o; });
      this.lookRef = null; this.clip = 'ik'; this.mixer = null; this.action = null;
      this.W = { p: {}, q: {} };
      for (const n of BN) { this.W.p[n] = new THREE.Vector3(); this.W.q[n] = new THREE.Quaternion(); }
      this.tint(look, ctx);
      this.reset();
      ST.riders++;
    }
    tint(look, ctx) {
      this.lookRef = look;
      const A = M3();
      if (!this.mesh || !look) return;
      // the people runtime dresses it (regions + accessory slots) through the documented hook
      const c = this._c || (this._c = { mesh: this.mesh, md: this.md, dispose: () => {}, id: this.id });
      try { if (A.hooks && A.hooks.tint && A.hooks.tint(c, look)) return; } catch (e) { N.err('models3d_vehicles.tint', e); }
    }
    reset() { const R = this.R; for (const n in this.bones) { const b = this.bones[n]; if (R.lp[n]) { b.position.copy(R.lp[n]); b.quaternion.copy(R.lq[n]); } } }
    /** an authored clip held at a phase (Hero roadsters: ride_cycle / ride_kainchi phase-locked to the crank) */
    clipPose(name, phase) {
      const clip = this.md && this.md.clips && this.md.clips.get(name);
      if (!clip) return false;
      if (!this.mixer || this.clip !== name) {
        if (!this.mixer) this.mixer = new THREE.AnimationMixer(this.object);
        if (this.action) this.action.stop();
        this.action = this.mixer.clipAction(clip); this.action.play(); this.action.paused = true; this.action.setEffectiveWeight(1);
        this.clip = name;
      }
      this.action.time = (((phase % 1) + 1) % 1) * clip.duration;
      this.mixer.update(0);
      return true;
    }
    /** set a bone's world (rider-frame) rotation; its position follows its parent */
    setW(n, q) {
      const R = this.R, W = this.W, par = R.parent[n];
      W.q[n].copy(q);
      if (par && W.q[par]) {
        W.p[n].copy(R.lp[n]).applyQuaternion(W.q[par]).add(W.p[par]);
        this.bones[n].quaternion.copy(W.q[par]).invert().multiply(q);
      }
    }
    /** follow the parent with the rest local rotation */
    follow(n) { const R = this.R, par = R.parent[n]; Q2.copy(this.W.q[par]).multiply(R.lq[n]); this.setW(n, Q2); }
    /** two-bone IK: chain a -> b -> end towards target (world), knee / elbow bending towards pole */
    ik2(a, b, end, target, pole, lens) {
      const W = this.W, R = this.R;
      // the chain root's position (its rotation is set below)
      const par = R.parent[a];
      W.p[a].copy(R.lp[a]).applyQuaternion(W.q[par]).add(W.p[par]);
      const pU = W.p[a];
      const la = lens[0], lb = lens[1];
      const d = V1.copy(target).sub(pU);
      let dist = d.length();
      const maxR = (la + lb) * 0.999, minR = Math.abs(la - lb) + 1e-3;
      dist = clamp(dist, minR, maxR);
      d.normalize();
      const cosA = clamp((la * la + dist * dist - lb * lb) / (2 * la * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
      const pp = V2.copy(pole).addScaledVector(d, -pole.dot(d));
      if (pp.lengthSq() < 1e-8) pp.set(0, 1, 0).addScaledVector(d, -d.y);
      pp.normalize();
      const K = V3a.copy(pU).addScaledVector(d, la * cosA).addScaledVector(pp, la * sinA);
      const E = V4.copy(pU).addScaledVector(d, dist);
      // upper bone: rest frame (dir, rest pole) -> (K - pU, pole)
      basisQ(Q1Dir(K, pU), pp, Q1); Q1.multiply(Q2.copy(R.fr[a]).invert()).multiply(R.wq[a]);
      this.setW(a, Q1);
      basisQ(Q1Dir(E, K), pp, Q1); Q1.multiply(Q2.copy(R.fr[b]).invert()).multiply(R.wq[b]);
      this.setW(b, Q1);
      return K;
    }
    /**
     * pose on a seat. o: {pose, seat (V3), grips: [L, R] | null, feet: [L, R] | null (ball of the foot on
     * the floor / pegs), pedals: [L, R] | null (+ crank angle), hands: 'knees' | 'tiller', tiller, side (bool)}
     */
    pose(o) {
      const R = this.R, W = this.W;
      if (!R || !R.ok) return false;
      if (this.clip !== 'ik' && this.action) { this.action.stop(); this.action = null; this.reset(); }
      this.clip = 'ik';
      const P = POSES[o.pose] || POSES.sit, k = R.k;
      const yaw = o.side ? Math.PI / 2 : (P.yaw || 0);
      // root: rest
      W.p.root.copy(R.wp.root); W.q.root.copy(R.wq.root);
      const lean = P.lean;
      const Rl = new THREE.Quaternion().setFromAxisAngle(XA, lean * 0.45);
      const Ry = new THREE.Quaternion().setFromAxisAngle(YA, yaw);
      const Hq = Ry.clone().multiply(Rl).multiply(R.wq.hips);
      // hip joints above the seat (cycles: a little behind the saddle top too)
      const mid = new THREE.Vector3().copy(o.seat).add(new THREE.Vector3(0, (P.up || 0.5) * k, -(P.back || 0) * k));
      let dip = 0;
      for (let pass = 0; pass < 2; pass++) {
        const hipHead = mid.clone().add(new THREE.Vector3(0, -dip, 0)).sub(R.hipOff.clone().applyQuaternion(Hq));
        W.p.hips.copy(hipHead); W.q.hips.copy(Hq);
        this.bones.hips.position.copy(hipHead).sub(W.p.root).applyQuaternion(Q2.copy(W.q.root).invert());
        this.bones.hips.quaternion.copy(W.q.root).invert().multiply(Hq);
        if (pass === 0 && o.pedals) {
          let ex = 0;
          for (const s of ['L', 'R']) {
            const L = R['len_leg_' + s];
            W.p['thigh_' + s].copy(R.lp['thigh_' + s]).applyQuaternion(Hq).add(hipHead);
            const t = this.ankleTarget(s, o.pedals[s === 'L' ? 0 : 1], o.crank || 0, true, Ry);
            ex = Math.max(ex, W.p['thigh_' + s].distanceTo(t) - (L[0] + L[1]) * 0.985);
          }
          dip = clamp(ex, 0, 0.45 * k);
          if (dip <= 0) break;
        } else break;
      }
      // spine: lean distributed, head back to level
      const sp = Ry.clone().multiply(new THREE.Quaternion().setFromAxisAngle(XA, lean * 0.75));
      this.setW('spine', Q1.copy(sp).multiply(R.wq.spine));
      const ch = Ry.clone().multiply(new THREE.Quaternion().setFromAxisAngle(XA, lean));
      this.setW('chest', Q1.copy(ch).multiply(R.wq.chest));
      this.setW('neck', Q1.copy(Ry).multiply(Q2.setFromAxisAngle(XA, lean * 0.4)).multiply(R.wq.neck));
      this.setW('head', Q1.copy(Ry).multiply(Q2.setFromAxisAngle(XA, -0.05 + (o.look || 0))).multiply(R.wq.head));
      // legs
      const knees = {};
      for (const s of ['L', 'R']) {
        const sx = s === 'L' ? 1 : -1;
        let tgt, footQ = null;
        if (o.pedals) { tgt = this.ankleTarget(s, o.pedals[s === 'L' ? 0 : 1], o.crank || 0, true, Ry); footQ = this._footQ; }
        else if (o.feet) { tgt = this.ankleTarget(s, o.feet[s === 'L' ? 0 : 1], 0, false, Ry); footQ = this._footQ; }
        else {   // dangling (carrier pillion): feet hang down and a little forward
          tgt = W.p.hips.clone().add(new THREE.Vector3(sx * 0.5 * k, -3.0 * k, 0.9 * k).applyQuaternion(Ry));
          footQ = Q1.copy(Ry).multiply(Q2.setFromAxisAngle(XA, 0.5)).clone();
        }
        const pole = new THREE.Vector3(sx * 0.18, 0.55, 1).applyQuaternion(Ry);
        knees[s] = this.ik2('thigh_' + s, 'shin_' + s, 'foot_' + s, tgt, pole, R['len_leg_' + s]).clone();
        this.setW('foot_' + s, Q1.copy(footQ || Ry).multiply(R.wq['foot_' + s]));
        this.follow('toe_' + s);
      }
      // arms
      for (const s of ['L', 'R']) {
        const sx = s === 'L' ? 1 : -1;
        this.follow('shoulder_' + s);
        let tgt;
        if (o.grips && o.grips[s === 'L' ? 0 : 1]) tgt = o.grips[s === 'L' ? 0 : 1].clone().add(new THREE.Vector3(0, 0.08 * k, -0.22 * k));
        else if (o.hands === 'tiller' && s === 'L' && o.tiller) tgt = o.tiller.clone();
        else tgt = knees[s].clone().add(new THREE.Vector3(sx * 0.1 * k, 0.45 * k, -0.55 * k).applyQuaternion(Ry));
        const pole = new THREE.Vector3(sx * 0.7, -0.45, -0.7).applyQuaternion(Ry);
        this.ik2('upperarm_' + s, 'forearm_' + s, 'hand_' + s, tgt, pole, R['len_arm_' + s]);
        this.follow('hand_' + s);
      }
      return true;
    }
    /** ankle target from the ball-of-foot contact point c (anchor): flat on floors, ankling on pedals */
    ankleTarget(s, c, crank, pedal, Ry) {
      const R = this.R;
      const ball = new THREE.Vector3().copy(c).add(new THREE.Vector3(0, R.ballH, 0));
      const sign = s === 'L' ? 1 : -1;
      const pitch = pedal ? -0.18 - 0.16 * Math.sin(crank * sign + 0.6) : 0;
      this._footQ = new THREE.Quaternion().setFromAxisAngle(XA, pitch);
      if (Ry) this._footQ.premultiply(Ry);
      return ball.add(R.ball2ankle[s].clone().applyQuaternion(this._footQ));
    }
    dispose() {
      if (this.mixer) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.object); }
      if (this._c && this._c.dispose) try { this._c.dispose(); } catch (e) { /* ignore */ }
      if (this.object.parent) this.object.parent.remove(this.object);
      ST.riders--;
    }
  }
  let XA = null, YA = null;
  const _dir = { v: null };
  function Q1Dir(a, b) { if (!_dir.v) _dir.v = new THREE.Vector3(); return _dir.v.copy(a).sub(b); }

  /* ================================================================ who can ride (models) */
  const MALE = { man: 1, uncle: 1, lungi: 1 };
  function lookOfDriver(v) {
    if (v._look) return v._look;
    try { v._look = N.people.randomLook(N.util.rng(v.seed), 'man'); } catch (e) { v._look = { kind: 'man' }; }
    return v._look;
  }
  const PROXY = new WeakMap();
  /** a stable person-like object for an occupant (the people runtime caches its choice per object) */
  function personOf(v, d, slot) {
    if (d === N.player) return d;
    if (d && d.look && (d.kind || d.npcId || d.x != null)) return d;   // a real entity
    let m = PROXY.get(v); if (!m) { m = {}; PROXY.set(v, m); }
    const look = d && d.look ? d.look : (slot === 'driver' ? lookOfDriver(v) : null);
    if (!look) return null;
    let p = m[slot];
    if (!p || p.look !== look) p = m[slot] = { look, seed: (v.seed | 0) + slot.length * 31, role: d && d.role };
    return p;
  }
  /** model id for a person, or null (lazy models start parsing and count as not ready) */
  function modelFor(person) {
    if (!person || !person.look) return null;
    const A = M3(), PP = A && A.people;
    let id = null;
    if (PP && PP.ready) { const ch = PP.choose(person); id = ch ? ch.id : null; }
    else {
      // no people runtime: the old male rider / the player's model
      const S = S3();
      if (S) for (const [cid, md] of S.models) {
        if (md.man.family !== 'character') continue;
        if (person === N.player) { if (md.meta.role === 'player') { id = cid; break; } continue; }
        if (md.meta.role === 'player') continue;
        if (MALE[person.look.kind] && ((md.meta.people || []).indexOf('man') >= 0 || (md.meta.kinds || []).indexOf('man') >= 0)) { id = cid; break; }
      }
    }
    if (!id) return null;
    if (!A.loaded(id)) { if (A.has(id)) A.parse(id); return null; }
    const R = restOf(id);
    return R && R.ok ? id : null;
  }
  const ROLE_SEATS = (meta) => {
    const r = meta.riders || {};
    return { driver: !!r.driver, pillion: !!r.pillion || (meta.pedal && !!(meta.riders && meta.riders.driver)), passengers: (r.passengers || []).length };
  };
  /** the occupants to draw: [{slot, person, d}] or null when someone visible cannot be drawn */
  function occupants(v, meta) {
    const out = [];
    if (v.fallen) return out;
    const seats = ROLE_SEATS(meta);
    const d = v.driver;
    if (d) { if (!seats.driver) return null; const p = personOf(v, d, 'driver'); if (!p) return null; out.push({ slot: 'driver', person: p, d }); }
    const pil = v.pillion;
    if (pil) { if (!seats.pillion && !seats.passengers) return meta.closed ? out : null; const p = personOf(v, pil, 'pillion'); if (!p) return null; out.push({ slot: seats.pillion ? 'pillion' : 'passenger0', person: p, d: pil }); }
    const pas = v.passenger;
    if (pas && pas !== pil) {
      if (!seats.passengers && !seats.pillion) { if (!meta.closed) return null; }
      else { const p = personOf(v, pas, 'passenger'); if (!p) return null; out.push({ slot: seats.passengers ? 'passenger' + (pil ? 1 : 0) : 'pillion', person: p, d: pas }); }
    }
    return out;
  }
  /** ambient passengers (3D life, the same rule as view3d_actors): autos / rickshaws / boats */
  function ambient(v, meta, taken) {
    if (!OPT.ambient || !v.driver || v.passenger || v === (N.player && N.player.vehicle)) return [];
    const seats = (meta.riders && meta.riders.passengers) || [];
    if (!seats.length) return [];
    const t = v.type;
    const isAuto = t === 'auto' || t === 'yadagiri_auto' || t === 'rickshaw';
    const isBoat = !!meta.boat;
    if (!isAuto && !isBoat) return [];
    if (isAuto && (v.seed | 0) % 3 !== 0) return [];
    const n = isBoat ? 1 + ((v.seed | 0) % 3) : 1 + ((v.seed | 0) % 2);
    const out = [];
    let m = PROXY.get(v); if (!m) { m = {}; PROXY.set(v, m); }
    if (!m.amb) {
      m.amb = [];
      for (let k = 0; k < n; k++) {
        const r = N.util.rng((v.seed | 0) + 17 * (k + 1));
        let look = null;
        try { look = N.people.randomLook(r, r.next() < 0.35 ? 'aunty' : r.next() < 0.5 ? 'kid' : r.next() < 0.5 ? 'man' : 'woman'); } catch (e) { look = null; }
        if (look) m.amb.push({ look, seed: (v.seed | 0) + 11 * k });
      }
    }
    for (let k = 0; k < m.amb.length && taken + k < seats.length; k++) out.push({ slot: 'passenger' + (taken + k), person: m.amb[k], d: null, ambient: true });
    return out;
  }

  /* ================================================================ the renderer */
  function seatSpec(meta, slot) {
    const r = meta.riders || {};
    if (slot === 'driver') return r.driver || null;
    if (slot === 'pillion') return r.pillion || (meta.pedal ? { pose: 'pillion', seat: 'seat_pillion', feet: null } : null);
    const i = +slot.slice(9) || 0;
    return (r.passengers || [])[i] || null;
  }
  function vehSpec(id) {
    return {
      shadow: true, fps: true, m3d: id,
      create(e, H) {
        if (!mdOf(id)) return null;
        let P;
        try { P = new VParts(id); } catch (er) { N.err('models3d_vehicles.create:' + id, er); return null; }
        P.object.userData.m3dParts = P;
        P.inv = new THREE.Matrix4();
        if (H && H.quality && !H.quality.shadows && !P.meta.boat) { const T = e.T || {}; P.object.add(H.blobShadow((T.w || 16) * 1.02, (T.d || 5) * 1.25)); }
        return P.object;
      },
      update(obj, e, dt, H) {
        const P = obj.userData.m3dParts;
        if (!P) return;
        ST.vehicles++;
        const T = e.T || {}, meta = P.meta;
        const sc = T.w && meta.length ? clamp(T.w / meta.length, 0.8, 1.25) : 1;
        P.pivot.scale.setScalar(sc);
        const bike = T.cls === 'bike';
        let roll = 0, pitch = 0, y = 0;
        if (meta.boat) {
          const ph = (H.time || 0) + ((e.seed | 0) % 100);
          y = 0.15 + Math.sin(ph * 1.3) * 0.22; roll = Math.sin(ph * 0.9) * 0.035; pitch = Math.sin(ph * 1.1 + 1) * 0.02 + clamp((e.speed || 0) / 600, -0.02, 0.06);
        } else if (bike) {
          if (e.fallen) { roll = -1.3; y = 0.5; } else if (!e.driver) roll = meta.stand === 'side' ? -0.13 : 0; else roll = clamp(e.lean || 0, -0.6, 0.6);
        }
        const j = e.jolt || 0;
        if (j > 0) { const ph = (1 - j) * Math.PI * 3.2, big = bike ? 1 : 0.7; y += -Math.sin(ph) * j * 0.8 * big; pitch += Math.sin(ph * 1.3) * j * 0.05 * big; roll += Math.sin(ph * 1.7) * j * 0.04 * (e.joltSide || 1); }
        obj.position.set(e.x, H.elev(e) + y, e.y);
        obj.rotation.set(roll, -(e.angle || 0), pitch);
        const steer = (e.steerVis || 0) + (bike ? (e.wobble || 0) * 0.45 : 0);
        P.set({ dist: (e.wheelPhase || 0) * 2, steer });
        if (P.props.length) P.spinProps(dt || 0, e.speed || 0);
        P.saddle(((meta.saddleDrop || {})[e.type]) || 0);
        P.options(e);
        P.tint(e);
        // lamps
        const night = H.night || 0, sp = Math.abs(e.speed || 0);
        const on = !!(e.driver || e.controller || e.lightsOn);
        const ctl = e.ctl || {};
        const brake = on && (ctl.throttle < -0.1 || ctl.brake || ctl.handbrake) ? 1 : 0;
        const nl = OPT.lamps ? night : 0;
        const beacon = (e.beacon || (e.type === 'pochaiah_luna' && e.driver)) ? (Math.sin((H.time || 0) * 9) > 0 ? 2.2 : 0.15) : 0;
        P.lamps(on ? nl * 1.6 : 0, on ? Math.max(nl * 0.9, brake * 1.4) * (brake ? 1.6 : 1) : 0, 0, beacon);
        const mine = N.player && N.player.vehicle === e;
        if (OPT.lights && on && night > 0.2 && (P.anchors.headlight || P.anchors.headlight_L) && sp > 1) {
          const dd = N.player ? Math.hypot(e.x - N.player.x, e.y - N.player.y) : 1e9;
          if (mine || dd < 120) {
            const a = e.angle || 0, L = (T.w || 16) * 0.5;
            H.light({ x: e.x + Math.cos(a) * (L + 14), y: e.y + Math.sin(a) * (L + 14), h: 5, color: '#ffe6b0', intensity: (mine ? 1.2 : 0.7) * night, r: bike ? 55 : 75 });
            ST.lights++;
          }
        }
        // riders
        updateRiders(P, e, H);
      },
      dispose(obj) { const P = obj && obj.userData.m3dParts; if (P) P.dispose(); },
    };
  }
  function updateRiders(P, e, H) {
    const meta = P.meta;
    let occ = OPT.riders ? occupants(e, meta) : [];
    if (!occ) occ = [];
    const amb = OPT.riders ? ambient(e, meta, occ.filter((o) => o.slot.indexOf('passenger') === 0).length) : [];
    const want = occ.concat(amb);
    // (re)create riders whose person / model changed
    const keep = [];
    for (const w of want) {
      const id = modelFor(w.person);
      if (!id) continue;
      let r = P.riders.find((x) => x.slot === w.slot && x.person === w.person && x.id === id);
      if (!r) {
        try {
          r = new Rider(id, w.person.look, null);
          r.slot = w.slot; r.person = w.person; r.d = w.d;
          const sh = !!(H.quality && H.quality.shadows);
          r.object.traverse((m) => { if (m.isMesh) { m.castShadow = sh; m.userData.noRay = true; m.raycast = () => {}; } });
          P.pivot.add(r.object);
        } catch (er) { N.err('models3d_vehicles.rider:' + id, er); continue; }
      }
      if (w.person.look !== r.lookRef) r.tint(w.person.look, null);
      keep.push(r);
    }
    for (const r of P.riders) if (keep.indexOf(r) < 0) r.dispose();
    P.riders = keep;
    P.rider = keep.find((r) => r.slot === 'driver') || null;
    P.riderOf = P.rider ? P.rider.d : null;
    if (!keep.length) return;
    // pose: anchors in the vehicle frame after this frame's bone changes
    const camD = H.camera ? Math.hypot(H.camera.position.x - e.x, H.camera.position.z - e.y) : 0;
    const far = camD > OPT.farIK;
    if (far && (ST.frame + (e.seed | 0)) % 4 !== 0 && P._posed) return;
    P._posed = true;
    const t0 = nowMs();
    P.pivot.updateMatrixWorld(true);
    P.inv.copy(P.pivot.matrixWorld).invert();
    const fps = H.mode === 'fps';
    for (const r of keep) {
      const ss = seatSpec(meta, r.slot) || {};
      const isP = r.person === N.player;
      r.object.visible = !(isP && fps);
      // Hero roadsters: the authored library clip at the matching saddle drop (feet on the pedals)
      if (r.slot === 'driver' && meta.pedal && P.id === 'hero_cycle') {
        const man = manOf(r.id) || {}, lib = typeof (man.meta || {}).clips === 'string' ? manOf(man.meta.clips) : man;
        const clips = (lib && lib.clips) || {};
        const rc = clips.ride_cycle, rk = clips.ride_kainchi;
        const drop = P.drop || 0;
        let name = null;
        if (rc && rc.vehicle === 'hero_cycle' && Math.abs((rc.saddleDrop || 0) - drop) < 1e-3) name = 'ride_cycle';
        else if (rk && rk.vehicle === 'hero_cycle' && Math.abs((rk.saddleDrop || 0) - drop) < 1e-3 && (meta.kainchi || []).indexOf(e.type) >= 0) name = 'ride_kainchi';
        if (name && r.clipPose(name, P.state.crank / TAU)) continue;
      }
      const seat = P.anchorPos(ss.seat || (r.slot === 'driver' ? 'seat_driver' : 'seat_pillion'), new THREE.Vector3());
      if (!seat) continue;
      const o = { pose: ss.pose || (r.slot === 'driver' ? 'scooter' : 'sit'), seat };
      if (r.slot === 'driver' && ss.grips) o.grips = ss.grips.map((n) => P.anchorPos(n, new THREE.Vector3()));
      if (ss.grips && ss.grips[0] === 'tiller') { o.hands = 'tiller'; o.tiller = P.anchorPos('tiller', new THREE.Vector3()); o.grips = null; }
      if (ss.feet === 'pedals') { o.pedals = ['pedal_L', 'pedal_R'].map((n) => P.anchorPos(n, new THREE.Vector3())); o.crank = P.state.crank; if (!o.pedals[0] || !o.pedals[1]) o.pedals = null; }
      else if (Array.isArray(ss.feet) && ss.feet.length) {
        const f = ss.feet.map((n) => P.anchorPos(n, new THREE.Vector3()));
        if (f[0] && (f[1] || f.length === 1)) {
          // one foot anchor (a passenger's floor spot): feet a hip-width apart around it
          if (f.length === 1 || !f[1]) { const c = f[0]; o.feet = [c.clone().add(new THREE.Vector3(0.45 * (r.R.k || 1), 0, 0)), c.clone().add(new THREE.Vector3(-0.45 * (r.R.k || 1), 0, 0))]; }
          else if (ss.feet[0] === 'pedal_L') { o.pedals = f; o.crank = P.state.crank; }
          else o.feet = f;
        }
      }
      if (r.slot !== 'driver' && !o.feet && !o.pedals && r.slot === 'pillion') {
        const fl = P.anchorPos('foot_pillion_L', new THREE.Vector3()), fr = P.anchorPos('foot_pillion_R', new THREE.Vector3());
        if (fl && fr) o.feet = [fl, fr];
      }
      if (r.slot === 'pillion') {
        o.pose = 'pillion';
        const look = r.person.look || {};
        if (SIDE_KINDS[look.kind]) {
          o.side = true;
          // side-saddle: both feet together on the left side, below the seat
          const k = r.R.k || 1;
          o.feet = [seat.clone().add(new THREE.Vector3(2.0 * k, -3.2 * k, 0.4 * k)), seat.clone().add(new THREE.Vector3(2.0 * k, -3.2 * k, -0.4 * k))];
          if (o.feet[0].y < 0.1) { o.feet[0].y = 0.1; o.feet[1].y = 0.1; }
        }
      }
      if (r.slot.indexOf('passenger') === 0) o.pose = o.pose === 'scooter' ? 'sit' : o.pose;
      try { r.pose(o); } catch (er) { N.err('models3d_vehicles.pose', er); }
    }
    const ms = nowMs() - t0;
    ST.ikMs += ms;
  }

  /* ================================================================ routing */
  function tracked(e) { const A = N.view3dActors, D = A && A.debug && A.debug.DBG; return !!(D && D.track && D.track === e); }
  function routeOne(e) {
    const mid = ST.types.get(e.type);
    if (!mid || e.alive === false || tracked(e)) return null;
    const md = mdOf(mid);
    if (!md) return null;
    if (!OPT.riders) return e.driver || e.pillion || e.passenger ? null : 'm3d:veh:' + mid;
    const occ = occupants(e, md.meta);
    if (!occ) return null;
    for (const o of occ) if (!modelFor(o.person)) return null;
    return 'm3d:veh:' + mid;
  }
  function route() {
    const V3 = N.view3d, A = M3();
    if (!V3 || !V3.active || !A || !A.ready || !ST.installed) return;
    const on = OPT.enabled && A.options.enabled && A.options.vehicles;
    let list = [];
    const f = V3.focus ? V3.focus() : N.player;
    try { list = N.entities.query(f.x, f.y, (V3.quality && V3.quality.actorDist) || 620); } catch (er) { list = []; }
    const p = N.player;
    if (p && p.vehicle && list.indexOf(p.vehicle) < 0) list.push(p.vehicle);
    let n = 0;
    for (const e of list) {
      if (!e || e.kind !== 'vehicle') continue;
      const key = on ? routeOne(e) : null;
      if (key) { if (e.view3d !== key) e.view3d = key; n++; }
      else if (e.view3d && String(e.view3d).indexOf('m3d:veh:') === 0) delete e.view3d;
    }
    ST.routed = n;
  }

  /* ================================================================ install */
  function install() {
    const A = M3(), V3 = N.view3d, S = S3();
    if (!A || !A.ready || !V3 || !S || !window.THREE) return false;
    THREE = window.THREE;
    scratch();
    XA = new THREE.Vector3(1, 0, 0); YA = new THREE.Vector3(0, 1, 0);
    ST.types.clear(); ST.models = [];
    for (const [id, md] of S.models) {
      if (!md.man || md.man.family !== 'vehicle') continue;
      ST.models.push(id);
      V3.registerActorRenderer('m3d:veh:' + id, vehSpec(id));
      for (const t of md.meta.vehicleTypes || [id]) ST.types.set(t, id);
    }
    // models3d's own routing asks this file who can ride (pillions / passengers are added below)
    if (A.hooks && !A.hooks.riderModel) {
      A.hooks.riderModel = (v, d) => {
        if (!ST.installed || !ST.types.has(v.type)) return undefined;
        const md = mdOf(ST.types.get(v.type));
        const slot = d === v.driver ? 'driver' : d === v.pillion ? 'pillion' : 'passenger';
        return md ? modelFor(personOf(v, d, slot)) : null;
      };
    }
    ST.installed = true;
    N.emit('models3d:vehicles', { models: ST.models.slice() });
    return true;
  }
  N.on('models3d:ready', () => { try { install(); } catch (er) { N.err('models3d_vehicles.install', er); } });
  N.on('view:change', (d) => {
    if (d && d.mode === 'top') { try { for (const e of N.entities.all || []) if (e && e.view3d && String(e.view3d).indexOf('m3d:veh:') === 0) delete e.view3d; } catch (er) { /* ignore */ } }
  });
  N.addSystem({
    id: 'models3d_vehicles', order: 63, runIn: ['*'],
    update() {
      const A = M3();
      if (!A) return;
      if (!ST.installed && A.ready) { try { install(); } catch (er) { N.err('models3d_vehicles.install', er); return; } }
      if (ST.installed) { try { route(); } catch (er) { N.err('models3d_vehicles.route', er); } }
    },
  });
  if (N.view3d && N.view3d.registerLayer) {
    N.view3d.registerLayer('models3d_vehicles', {
      order: 41,
      update() { ST.frame++; ST.ikAvg += (ST.ikMs - ST.ikAvg) * 0.05; ST.lastIk = ST.ikMs; ST.ikMs = 0; ST.lastVehicles = ST.vehicles; ST.vehicles = 0; ST.lastLights = ST.lights; ST.lights = 0; },
    });
  }

  N.models3dVehicles = {
    options: OPT, OPT,
    get ready() { return ST.installed; },
    modelFor: (type) => ST.types.get(type) || null,
    stats() {
      return { installed: ST.installed, models: ST.models.slice(), routed: ST.routed, riders: ST.riders, vehicles: ST.lastVehicles || 0,
        ikMs: +(ST.lastIk || 0).toFixed(3), ikAvg: +ST.ikAvg.toFixed(3), lights: ST.lastLights || 0, made: ST.made };
    },
    debug: { ST, REST, VParts, Rider, route, routeOne, occupants, modelFor, personOf, restOf, evalOption },
  };
})();
