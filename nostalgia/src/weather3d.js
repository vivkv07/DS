/* NOSTALGIA — weather3d.js (atmosphere layer) — design/atmosphere.md "Rainy nights", ARCHITECTURE §20 / §22
 *
 * The weather of N.weather (src/atmosphere.js) in the 3D view (N.view3d, third and first person).
 * One view3d layer ('weather3d', order 40: after the core's sky / lights and the ground layer) that
 * post-modifies what the core sets every frame and adds a handful of cheap draw calls:
 *
 *   rain streaks      one indexed mesh of camera-facing quads in a camera-centred box, animated in the
 *                     vertex shader (fall + wind slant + the camera's own motion, wrapped around the
 *                     camera, streak length by speed), lit by the nearest lamps / vehicle lamps;
 *                     drop count follows N.weather.rain (draw range)
 *   splashes          an instanced ring of tiny crowns near the camera at ground / footpath / roof height
 *                     (N.view3d.groundHeightAt, H.heightAt), none on water
 *   wet ground        uWet / uRain of src/view3d_ground.js follow N.weather.wet / N.weather.rain (instead of
 *                     the on / off seasons flag); N.view3d.ground.setWet(v) still forces it (tests)
 *   reflections       the ground's road + terrain materials are wrapped (onBeforeCompile + cache key):
 *                     an anisotropic streak term reflects the nearest WX_N lights (sodium / tube street
 *                     lamps, vehicle head and tail lamps) as long vertical streaks on wet asphalt, sharp
 *                     mirror images in puddles / potholes, shimmering columns on Hussain Sagar; rain rings
 *                     on open water. Dry ground (uWet 0, no water) skips the term: it looks as before.
 *   sky + light       overcast: darker, desaturated zenith / horizon, sun dimmed (and its disc hidden),
 *                     greyer hemisphere light, fog closer in heavy rain; winter mist: thick soft fog;
 *                     a low cloud deck (one transparent plane) drifting with N.wind, lit orange from below
 *                     by the city at night
 *   halos             the core's lamp glow points grow in rain / mist, plus a soft wide halo sprite on the
 *                     nearest lamps (one Points call)
 *   lightning         'weather:lightning': the city lights up for a moment (hemisphere boost, sky / fog /
 *                     clouds flash, exposure), and a bolt billboard stands at the strike (clamped inside
 *                     the draw distance)
 *   rain life         autos with their black rexine side covers down (one InstancedMesh over every auto
 *                     near the camera). Umbrellas are drawn by view3d_actors.js from ped.umb.
 *
 * Budget: storm on desktop ≤ +6 draw calls (rain, splashes, clouds, halos, auto covers, bolt while it
 * shows) and ≤ +0.7 ms JS; phones (tier 'low' / N.atmos.low): fewer drops / splashes, 4 lights.
 *
 * API: N.weather3d = {stats(), lights() (debug: the lights chosen this frame), enabled, setEnabled(on)}
 * Edits to files this layer does not own: none (everything hooks through N.view3d / H / engine internals).
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.view3d) return;
  const V = N.view3d;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const TAU = Math.PI * 2;

  let THREE = null, H = null, E = null;
  let enabled = true;
  const low = () => !!(H && H.quality && H.quality.tier === 'low');
  let WXN = 8;

  /* ------------------------------------------------------------ wetness: follow N.weather */
  let userWet = null;      // a test / cutscene forced the wetness through N.view3d.ground.setWet
  let GUwet = null, GUrain = null; // the ground's shared uniforms (captured when its shaders compile)
  if (V.ground && V.ground.setWet) {
    const oSet = V.ground.setWet;
    V.ground.setWet = function (v) { userWet = v == null ? null : clamp(+v || 0, 0, 1); return oSet.apply(this, arguments); };
  }

  /* ------------------------------------------------------------ lights other modules ask for this frame */
  // N.view3d.light (= H.light) requests: landmark lamps (Tank Bund globes, floodlights), lanterns. The
  // actors' headlight pools (a point on the road ahead of a vehicle) are skipped: vehicle lamps are
  // computed from the vehicles themselves below.
  const REQ = [];
  if (typeof V.light === 'function') {
    const oLight = V.light;
    V.light = function (L) {
      if (L && isFinite(L.x) && isFinite(L.y) && REQ.length < 64 && !(L.h === 5 && L.color === '#fff0d0')) REQ.push(L);
      return oLight.apply(this, arguments);
    };
  }
  const hexCol = new Map();
  function colArr(hex) {
    let c = hexCol.get(hex);
    if (!c) { const k = new THREE.Color(hex || '#ffb050'); c = [k.r, k.g, k.b]; hexCol.set(hex, c); }
    return c;
  }

  /* ------------------------------------------------------------ shared light uniforms */
  const WX = { uWxL: null, uWxC: null, uWxK: null };
  const GLSL_STREAK = (n) => `
#define WX_N ${n}
uniform vec4 uWxL[WX_N];   // xyz: light position relative to the camera, w: reflection reach (u)
uniform vec3 uWxC[WX_N];   // colour * intensity (0 = unused)
uniform vec4 uWxK;         // x: lamps on, y: rain, z: wetness, w: flash
vec3 wxStreaks(vec3 P, float rough, float jit) {
  vec3 rp = P - uCamPos;
  vec3 Vd = normalize(-rp);
  vec2 F = normalize(rp.xz + vec2(1e-4, 0.0));
  vec2 S = vec2(-F.y, F.x);
  float sx = mix(0.006, 0.03, rough), sy = mix(0.03, 0.3, rough);
  float ix = 1.0 / (sx * sx), iy = 1.0 / (sy * sy);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < WX_N; i++) {
    vec4 L = uWxL[i];
    vec3 d = L.xyz - rp;
    vec3 Ld = d / (length(d) + 1e-3);
    float ex = dot(Ld.xz, S) + jit;
    float ey = Ld.y - Vd.y;
    float g = exp(-(ex * ex * ix + ey * ey * iy)) * smoothstep(0.0, 0.2, dot(Ld.xz, F));
    acc += uWxC[i] * (g / (1.0 + dot(d.xz, d.xz) / (L.w * L.w)));
  }
  float fres = 0.25 + 0.75 * pow(1.0 - clamp(Vd.y, 0.0, 1.0), 3.0);
  return acc * fres * (0.35 + 0.65 * smoothstep(3.0, 30.0, length(rp.xz)));
}
float wxRing(vec2 p, float sc, float t, float fw) {
  vec2 q = p * sc; vec2 c = floor(q); vec2 f = fract(q) - 0.5;
  float h = fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
  vec2 o = vec2(fract(h * 17.3), fract(h * 31.7)) - 0.5;
  float ph = fract(t * 1.1 + h);
  float d = length(f - o * 0.5);
  float r = (1.0 - smoothstep(0.0, 0.07, abs(d - ph * 0.45))) * (1.0 - ph);
  return r * (1.0 - smoothstep(0.25, 0.6, fw * sc));
}
`;
  const ROAD_ADD = `
{
  float wxR = clamp(ngShine * 1.3 + ngWm * 1.5, 0.0, 1.5);
  if (wxR > 0.01 && uWxK.x > 0.001) {
    float rough = mix(1.0, 0.12, clamp(ngWm * 1.4, 0.0, 1.0));
    float jit = 0.0;
    if (uWxK.y > 0.01 && ngWm > 0.01) jit = (fract(sin(dot(floor(vWP.xz * 2.0 + uTime * 3.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.012 * uWxK.y;
    outgoingLight += wxStreaks(vWP, rough, jit) * wxR;
  }
}
`;
  const TERRAIN_ADD = `
{
  float wxW = clamp(ngWm, 0.0, 1.0);
  float wxR = clamp(ngShine * 1.2 + wxW * 1.1, 0.0, 1.3);
  float wxFw = max(fwidth(vWP.x), fwidth(vWP.z));
  float jit = 0.0;
  if (wxW > 0.01 && uWxK.y > 0.01) {
    // rain on open water: rings at two scales + a broken-up surface
    float rr = wxRing(vWP.xz, 0.9, uTime, wxFw) + 0.7 * wxRing(vWP.xz + 7.3, 0.37, uTime * 0.83, wxFw);
    vec3 Vd = normalize(uCamPos - vWP);
    vec3 skyR = mix(uHor, uZen, 0.35) * (0.5 + 0.5 * (1.0 - clamp(Vd.y, 0.0, 1.0)));
    outgoingLight += skyR * rr * 0.22 * uWxK.y * wxW;
    jit = (rr - 0.3) * 0.02 * uWxK.y;
  }
  if (wxR > 0.01 && uWxK.x > 0.001) {
    // water: soft, wind-rippled columns (jitter across the streak); wet paving: long streaks
    float rip = sin(vWP.z * 0.9 + uTime * 1.7) * sin(vWP.x * 0.7 - uTime * 1.3);
    jit += rip * 0.006 * wxW;
    outgoingLight += wxStreaks(vWP, mix(1.0, 0.4, wxW), jit) * wxR;
  }
}
`;
  function wxCompile(shader, kind) {
    if (!shader.uniforms.uCamPos) return; // not the ground shader we expect
    if (shader.uniforms.uWet) GUwet = shader.uniforms.uWet;
    if (shader.uniforms.uRain) GUrain = shader.uniforms.uRain;
    shader.uniforms.uWxL = WX.uWxL; shader.uniforms.uWxC = WX.uWxC; shader.uniforms.uWxK = WX.uWxK;
    const fs = shader.fragmentShader;
    if (fs.indexOf('#include <output_fragment>') < 0) return;
    shader.fragmentShader = fs
      .replace(/void\s+main\s*\(\s*\)\s*\{/, (mm) => GLSL_STREAK(WXN) + '\n' + mm)
      .replace('#include <output_fragment>', (kind === 'road' ? ROAD_ADD : TERRAIN_ADD) + '#include <output_fragment>');
  }
  function patchMaterial(m) {
    m.userData.wx = true;
    let key = '';
    try { key = m.customProgramCacheKey ? String(m.customProgramCacheKey()) : ''; } catch (e) { key = ''; }
    const kind = key.indexOf('ng-road') === 0 ? 'road' : key.indexOf('ng-terrain') === 0 ? 'terrain' : null;
    if (!kind || typeof m.onBeforeCompile !== 'function') return;
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = function (shader, r) { prev.call(this, shader, r); try { wxCompile(shader, kind); } catch (e) { N.err('weather3d.compile', e); } };
    m.customProgramCacheKey = function () { return prevKey.call(this) + '|wx' + WXN; };
    m.needsUpdate = true;
    ST.patched++;
  }
  // new chunk ground meshes appear during the frame's streaming (before the layers run, always before
  // the render): wrap their materials before they first compile
  function scanChunks() {
    const city = E && E.city; if (!city) return;
    const kids = city.children;
    for (let i = 0; i < kids.length; i++) {
      const g = kids[i], cc = g.children, n = cc.length;
      if (g.userData.wxN === n && g.userData.wxV === cc[n - 1]) continue;
      g.userData.wxN = n; g.userData.wxV = cc[n - 1];
      for (let k = 0; k < n; k++) { const o = cc[k]; if (o.isMesh && o.material && !o.material.userData.wx && !Array.isArray(o.material)) patchMaterial(o.material); }
    }
  }

  /* ------------------------------------------------------------ lights near the camera */
  const LAMPS = { list: [], shops: [], x: 1e9, y: 1e9, t: -99 };
  function refreshLamps(cx, cy, t) {
    LAMPS.x = cx; LAMPS.y = cy; LAMPS.t = t;
    const L = LAMPS.list; L.length = 0;
    const W = N.world; if (!W || !W.queryStructures) return;
    const R = 340, VS = V.VS || 1.5;
    const SH = LAMPS.shops; SH.length = 0;
    W.queryStructures(cx - R, cy - R, cx + R, cy + R, (s) => {
      if (s.t === 'bldg') {
        // a lit shop front with a signboard: its glow (sign colour + warm interior) streaks the wet road
        if (!s.front || !s.sign || !isFinite(s.w)) return;
        const f = s.front, mx = f === 'E' ? s.x + s.w + 3 : f === 'W' ? s.x - 3 : s.x + s.w / 2, my = f === 'S' ? s.y + s.d + 3 : f === 'N' ? s.y - 3 : s.y + s.d / 2;
        const c = new THREE.Color(s.sign.bg || '#d8402a');
        SH.push({ x: mx, y: my, h: 8, c: [0.45 + c.r * 0.9, 0.32 + c.g * 0.8, 0.16 + c.b * 0.8] });
        return;
      }
      if (s.t !== 'lamp') return;
      const h = (s.h || 24) * VS * 0.85;
      const arms = s.arms && s.arms.length ? s.arms : null;
      if (!arms) { L.push({ x: s.x, y: s.y, h: h - 1, tube: !!s.tube }); return; }
      for (const a of arms) {
        const len = Math.hypot(a[0], a[1]) * 1.3 || 1, ang = Math.atan2(a[1], a[0]);
        L.push({ x: s.x + Math.cos(ang) * len, y: s.y + Math.sin(ang) * len, h: h - 1, tube: !!s.tube });
      }
    });
    // heritage globe lamps beside the Tank Bund statues (view3d_landmarks.js lampPost(md, +-12, 2, 17))
    const LMS = (N.WORLD_DATA && N.WORLD_DATA.landmarks) || [];
    if (!LAMPS.tb) LAMPS.tb = LMS.filter((lm) => lm.draw === 'tank_bund_statue');
    for (const lm of LAMPS.tb) {
      if (Math.abs(lm.x - cx) > R || Math.abs(lm.y - cy) > R) continue;
      const rot = isFinite(lm.faceAngle) ? Math.PI / 2 - lm.faceAngle : ({ s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[lm.face] || 0);
      const c = Math.cos(rot), sn = Math.sin(rot);
      for (const u of [-12, 12]) L.push({ x: lm.x + u * c + 2 * sn, y: lm.y - u * sn + 2 * c, h: 18.5, globe: true });
    }
    // sodium / tube lamps on the electric poles (src/wires.js)
    const WR = N.wires;
    if (WR && WR.poles && WR.enabled !== false) {
      try { WR.poles(cx - R, cy - R, cx + R, cy + R, (p) => { if (p.lamp) L.push({ x: p.lamp.x, y: p.lamp.y, h: (p.lamp.h || 20) * VS - 0.6, tube: !!p.lamp.tube }); }); } catch (e) { /* wires optional */ }
    }
  }
  const PICK = []; // [{d, x, h, y, r, g, b, reach}]
  const POOL = [];
  let pickN = 0;
  function cand() { const c = POOL[pickN] || (POOL[pickN] = {}); pickN++; return c; }
  const COL = { globe: [1.0, 0.7, 0.4], sodium: [1.0, 0.42, 0.07], tube: [0.62, 0.86, 1.0], head: [1.0, 0.88, 0.62], tail: [1.0, 0.05, 0.02] };
  function gatherLights(cam, fwd, lampOn) {
    pickN = 0;
    if (lampOn <= 0.001) return 0;
    const cx = cam.x, cy = cam.z, fx = fwd.x, fz = fwd.z;
    const fl = Math.hypot(fx, fz) || 1, ux = fx / fl, uz = fz / fl;
    const consider = (x, y, h, c, k, reach, w) => {
      const dx = x - cx, dz = y - cy, fd = dx * ux + dz * uz;
      if (fd < -6) return;
      const lat = Math.abs(dx * -uz + dz * ux);
      if (lat > fd * 1.25 + 30) return;
      const d2 = dx * dx + dz * dz;
      if (d2 > 300 * 300) return;
      const o = cand(); o.d = d2 * w; o.x = x; o.h = h; o.y = y; o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; o.reach = reach;
    };
    for (const l of LAMPS.list) consider(l.x, l.y, l.h, l.globe ? COL.globe : l.tube ? COL.tube : COL.sodium, l.tube ? 0.7 : l.globe ? 1.3 : 1.15, l.globe ? 160 : 95, 1);
    for (const l of LAMPS.shops) consider(l.x, l.y, l.h, l.c, 0.75, 70, 1.6);
    for (const L of REQ) consider(L.x, L.y, L.h || 8, colArr(L.color), 1.1 * (L.intensity == null ? 1 : L.intensity), clamp((L.r || 60) * 1.2, 50, 140), 0.9);
    // vehicle head / tail lamps (the lamps the actors light: T.lights and someone at the controls)
    let vs = null;
    try { vs = N.entities.query(cx, cy, 260, (e) => e.kind === 'vehicle'); } catch (e) { vs = null; }
    if (vs) for (const v of vs) {
      const T = v.T || (N.vehicles && N.vehicles.TYPES && N.vehicles.TYPES[v.type]);
      if (!T || !T.lights || !(v.driver || v.controller || v.lightsOn) || v.fallen) continue;
      const c = Math.cos(v.angle || 0), s = Math.sin(v.angle || 0), hl = (T.w || 20) * 0.5;
      const tcx = cx - v.x, tcy = cy - v.y, tl = Math.hypot(tcx, tcy) || 1;
      const face = (c * tcx + s * tcy) / tl; // +1: the front faces the camera
      const bike = T.cls === 'bike';
      consider(v.x + c * hl, v.y + s * hl, bike ? 5 : 3.9, COL.head, 1.5 * (0.3 + 0.7 * clamp(face, 0, 1)), 110, 0.8);
      const ctl = v.ctl || {}, brake = (ctl.throttle < -0.1 || ctl.brake || ctl.handbrake) ? 1.8 : 1;
      if (!bike || T.id !== 'cycle') consider(v.x - c * hl, v.y - s * hl, 3.6, COL.tail, 0.9 * brake * (0.3 + 0.7 * clamp(-face, 0, 1)), 90, 0.75);
    }
    // nearest first
    const n = pickN;
    for (let i = 1; i < n; i++) { const a = POOL[i]; let j = i - 1; while (j >= 0 && POOL[j].d > a.d) { POOL[j + 1] = POOL[j]; j--; } POOL[j + 1] = a; }
    return n;
  }
  function uploadLights(cam, lampOn, n) {
    const L = WX.uWxL.value, C = WX.uWxC.value;
    PICK.length = 0;
    for (let i = 0; i < WXN; i++) {
      const o = i < n ? POOL[i] : null;
      if (!o) { L[i].set(0, -1000, 0, 1); C[i].set(0, 0, 0); continue; }
      L[i].set(o.x - cam.x, o.h - cam.y, o.y - cam.z, o.reach);
      C[i].set(o.r * lampOn, o.g * lampOn, o.b * lampOn);
      PICK.push(o);
    }
  }

  /* ------------------------------------------------------------ rain streaks */
  const RAIN_VS = (n) => `
#define WX_N ${n}
uniform vec3 uCam; uniform vec3 uCtr; uniform vec3 uBox; uniform vec3 uOff; uniform vec3 uDir;
uniform float uLen; uniform vec3 uAmb; uniform float uAlpha;
uniform vec4 uWxL[WX_N]; uniform vec3 uWxC[WX_N];
attribute vec4 aD; attribute vec2 aC;
varying vec3 vCol; varying float vA; varying vec2 vC;
void main() {
  vec3 q = mod(aD.xyz * uBox + uOff - uCam - uCtr, uBox) - 0.5 * uBox;
  vec3 pr = uCtr + q;
  float dist = length(pr);
  vec3 e = abs(q) / (0.5 * uBox);
  float edge = 1.0 - smoothstep(0.72, 1.0, max(max(e.x, e.y), e.z));
  float len = uLen * (0.7 + 0.6 * aD.w);
  vec3 pp = pr - uDir * (len * aC.y);
  vec3 side = cross(uDir, pp);
  side = side / (length(side) + 1e-4);
  pp += side * aC.x * (0.018 + dist * 0.0012);
  gl_Position = projectionMatrix * viewMatrix * vec4(uCam + pp, 1.0);
  vec3 col = uAmb;
  for (int i = 0; i < WX_N; i++) { vec3 d = uWxL[i].xyz - pr; col += uWxC[i] * (0.4 / (1.0 + dot(d, d) * (1.0 / 380.0))); }
  vCol = col;
  vA = uAlpha * edge * smoothstep(0.9, 3.5, dist) * (0.5 + 0.5 * aD.w);
  vC = aC;
}`;
  const RAIN_FS = `
varying vec3 vCol; varying float vA; varying vec2 vC;
void main() {
  float a = vA * (1.0 - vC.x * vC.x) * smoothstep(0.0, 0.3, vC.y) * (1.0 - smoothstep(0.65, 1.0, vC.y));
  gl_FragColor = vec4(vCol, a);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}`;
  const RAIN = { mesh: null, mat: null, n: 0, off: null, box: null, camPrev: null, camVel: null };
  function buildRain() {
    const n = low() ? 1800 : 5200;
    RAIN.n = n;
    const g = new THREE.BufferGeometry();
    const D = new Float32Array(n * 4 * 4), C = new Float32Array(n * 4 * 2);
    const idx = new Uint32Array(n * 6);
    const r = N.util.rng('weather3d:rain');
    for (let i = 0; i < n; i++) {
      const a = r.next(), b = r.next(), c = r.next(), w = r.next();
      for (let k = 0; k < 4; k++) {
        const o = (i * 4 + k) * 4; D[o] = a; D[o + 1] = b; D[o + 2] = c; D[o + 3] = w;
        const q = (i * 4 + k) * 2; C[q] = k & 1 ? 1 : -1; C[q + 1] = k < 2 ? 0 : 1;
      }
      const v = i * 4, o6 = i * 6;
      idx[o6] = v; idx[o6 + 1] = v + 1; idx[o6 + 2] = v + 2; idx[o6 + 3] = v + 1; idx[o6 + 4] = v + 3; idx[o6 + 5] = v + 2;
    }
    g.setAttribute('aD', new THREE.BufferAttribute(D, 4));
    g.setAttribute('aC', new THREE.BufferAttribute(C, 2));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3)); // unused (three wants one)
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    RAIN.box = new THREE.Vector3(76, 52, 76);
    RAIN.off = new THREE.Vector3();
    const m = new THREE.ShaderMaterial({
      vertexShader: RAIN_VS(WXN), fragmentShader: RAIN_FS, transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uCam: { value: new THREE.Vector3() }, uCtr: { value: new THREE.Vector3() }, uBox: { value: RAIN.box }, uOff: { value: RAIN.off },
        uDir: { value: new THREE.Vector3(0, -1, 0) }, uLen: { value: 3 }, uAmb: { value: new THREE.Color() }, uAlpha: { value: 0.3 },
        uWxL: WX.uWxL, uWxC: WX.uWxC,
      },
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.name = 'rain'; mesh.visible = false;
    mesh.userData.noShadow = true;
    RAIN.mesh = mesh; RAIN.mat = m;
    RAIN.camPrev = new THREE.Vector3(); RAIN.camVel = new THREE.Vector3(); RAIN.vel = new THREE.Vector3(); RAIN.first = true;
    H.layer.add(mesh);
  }
  function updateRain(dt, cam, fwd, rain, amb) {
    const M = RAIN.mesh; if (!M) return;
    if (rain < 0.02) { M.visible = false; RAIN.first = true; return; }
    M.visible = true;
    const u = RAIN.mat.uniforms;
    // camera velocity (smoothed; a teleport / snap is not a velocity)
    if (dt > 0) {
      const vx = (cam.x - RAIN.camPrev.x) / dt, vy = (cam.y - RAIN.camPrev.y) / dt, vz = (cam.z - RAIN.camPrev.z) / dt;
      const sp = Math.hypot(vx, vy, vz);
      if (RAIN.first || sp > 400) RAIN.camVel.set(0, 0, 0);
      else { const k = 1 - Math.exp(-dt * 6); RAIN.camVel.x += (vx - RAIN.camVel.x) * k; RAIN.camVel.y += (vy - RAIN.camVel.y) * k; RAIN.camVel.z += (vz - RAIN.camVel.z) * k; }
    }
    RAIN.first = false;
    RAIN.camPrev.copy(cam);
    const wi = N.wind || { dx: 1, dy: 0, strength: 0.3 };
    const ws = (wi.strength || 0) * (8 + 34 * clamp(N.weather.storm, 0, 1)) + 3;
    const fall = 52 + 10 * rain;
    const vel = RAIN.vel.set(wi.dx * ws, -fall, wi.dy * ws);
    // drops fall in world space: accumulate (wrapped to the box, so it stays exact forever)
    const B = RAIN.box, o = RAIN.off;
    o.x = (o.x + vel.x * dt) % B.x; o.y = (o.y + vel.y * dt) % B.y; o.z = (o.z + vel.z * dt) % B.z;
    // seen from the moving camera the streaks slant with its motion
    const rx = vel.x - RAIN.camVel.x, ry = vel.y - RAIN.camVel.y, rz = vel.z - RAIN.camVel.z;
    const rs = Math.hypot(rx, ry, rz) || 1;
    u.uDir.value.set(rx / rs, ry / rs, rz / rs);
    u.uLen.value = clamp(rs * 0.045, 1.6, 7);
    u.uCam.value.copy(cam);
    u.uCtr.value.set(fwd.x * 20, fwd.y * 20 - 2, fwd.z * 20);
    u.uAmb.value.copy(amb);
    u.uAlpha.value = (low() ? 0.34 : 0.24) * (0.55 + 0.45 * rain);
    const cnt = Math.ceil(RAIN.n * clamp(rain * 1.15, 0.05, 1));
    M.geometry.setDrawRange(0, cnt * 6);
    ST.drops = cnt;
  }

  /* ------------------------------------------------------------ splashes */
  const SPL_VS = (n) => `
#define WX_N ${n}
uniform vec3 uCam; uniform float uTime; uniform vec3 uAmb; uniform float uAlpha; uniform float uLife;
uniform vec4 uWxL[WX_N]; uniform vec3 uWxC[WX_N];
attribute vec2 aC; attribute vec4 aS; attribute float aR;
varying vec3 vCol; varying float vA; varying vec2 vC; varying float vAge;
void main() {
  float age = (uTime - aS.w) / uLife;
  if (age < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
  vec3 base = aS.xyz;
  vec3 tc = uCam - base; tc.y = 0.0;
  vec3 side = normalize(vec3(-tc.z, 0.0, tc.x) + vec3(1e-4, 0.0, 0.0));
  float s = (0.55 + 0.6 * aR) * (0.6 + 0.8 * age);
  vec3 wp = base + side * aC.x * s + vec3(0.0, aC.y * s * 0.9, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vec3 pr = wp - uCam; vec3 col = uAmb * 1.3;
  for (int i = 0; i < WX_N; i++) { vec3 d = uWxL[i].xyz - pr; col += uWxC[i] * (0.7 / (1.0 + dot(d, d) * (1.0 / 500.0))); }
  vCol = col; vC = aC; vAge = age;
  vA = uAlpha * (1.0 - age) * smoothstep(1.5, 4.0, length(pr));
}`;
  const SPL_FS = `
varying vec3 vCol; varying float vA; varying vec2 vC; varying float vAge;
void main() {
  if (vA <= 0.001) discard;
  vec2 p = vec2(vC.x, vC.y * 1.7);
  float d = length(p);
  float r = 0.35 + 0.55 * vAge;
  float crown = (1.0 - smoothstep(0.0, 0.16, abs(d - r))) * smoothstep(0.0, 0.08, vC.y);
  float spikes = 0.5 + 0.5 * sin(atan(p.y, p.x) * 9.0);
  float a = crown * (0.45 + 0.55 * spikes) * (1.0 - smoothstep(0.75, 1.0, vC.y));
  gl_FragColor = vec4(vCol, a * vA);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}`;
  const SPL = { mesh: null, n: 0, S: null, R: null, rng: null, life: 0.34 };
  function buildSplashes() {
    const n = low() ? 70 : 200;
    SPL.n = n;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('aC', new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), 2));
    g.setIndex([0, 1, 2, 1, 3, 2]);
    SPL.S = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); SPL.S.setUsage(THREE.DynamicDrawUsage);
    SPL.R = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    const r = (SPL.rng = N.util.rng('weather3d:splash'));
    for (let i = 0; i < n; i++) { SPL.R.array[i] = r.next(); SPL.S.array[i * 4 + 3] = -100; }
    g.setAttribute('aS', SPL.S); g.setAttribute('aR', SPL.R);
    g.instanceCount = n;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const m = new THREE.ShaderMaterial({
      vertexShader: SPL_VS(WXN), fragmentShader: SPL_FS, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uAmb: { value: new THREE.Color() }, uAlpha: { value: 0.5 }, uLife: { value: SPL.life }, uWxL: WX.uWxL, uWxC: WX.uWxC },
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'splashes'; mesh.visible = false;
    SPL.mesh = mesh; SPL.mat = m;
    H.layer.add(mesh);
  }
  function updateSplashes(cam, fwd, rain, amb, t) {
    const M = SPL.mesh; if (!M) return;
    if (rain < 0.04) { M.visible = false; return; }
    M.visible = true;
    const u = SPL.mat.uniforms;
    u.uCam.value.copy(cam); u.uTime.value = t; u.uAmb.value.copy(amb); u.uAlpha.value = 0.55 + 0.35 * rain;
    const A = SPL.S.array, n = SPL.n, act = Math.ceil(n * clamp(rain, 0, 1)), r = SPL.rng;
    const fl = Math.hypot(fwd.x, fwd.z) || 1, ux = fwd.x / fl, uz = fwd.z / fl;
    // the camera's ground point ahead (TPS looks down at the player; FPS looks along the street)
    const ahead = clamp(cam.y * 1.4, 8, 30);
    const ox = cam.x + ux * ahead, oz = cam.z + uz * ahead;
    const W = N.world, gh = V.groundHeightAt, hh = H.heightAt;
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (t - A[o + 3] < SPL.life) continue;
      if (i >= act || spawned > 24) { if (A[o + 3] > t) A[o + 3] = -100; continue; }
      const a = r.next() * TAU, d = Math.sqrt(r.next()) * 38;
      const x = ox + Math.cos(a) * d, z = oz + Math.sin(a) * d;
      spawned++;
      if (W && W.isWater && W.isWater(x, z)) { A[o + 1] = -1000; A[o + 3] = t - SPL.life * 0.5; continue; }
      let h = 0;
      try { h = Math.max(gh ? gh(x, z) : 0, hh ? hh(x, z) : 0); } catch (e) { h = 0; }
      A[o] = x; A[o + 1] = h + 0.05; A[o + 2] = z; A[o + 3] = t - r.next() * 0.08;
    }
    SPL.S.needsUpdate = true;
  }

  /* ------------------------------------------------------------ low cloud deck */
  const CLOUD_VS = `
varying vec3 vWP;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
  const CLOUD_FS = `
uniform vec3 uCam; uniform vec2 uOff; uniform float uCov; uniform float uAlpha; uniform float uR;
uniform vec3 uCol; uniform vec3 uGlow; uniform vec3 uHorC; uniform vec3 uFlash;
varying vec3 vWP;
float h12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 p = vWP.xz * 0.0021 + uOff;
  float n = vn(p) * 0.5 + vn(p * 2.1 + 5.2) * 0.27 + vn(p * 4.3 + 1.7) * 0.15 + vn(p * 9.1 + 3.1) * 0.08;
  float lo = mix(0.62, 0.05, uCov), hi = mix(0.9, 0.55, uCov);
  float c = smoothstep(lo, hi, n);
  float rd = length(vWP.xz - uCam.xz) / uR;
  float a = c * uAlpha * (1.0 - smoothstep(0.55, 1.0, rd));
  vec3 col = uCol * mix(1.15, 0.55, smoothstep(0.45, 1.0, n));
  col += uGlow * (0.6 + 0.6 * n);
  col += uFlash * (0.5 + n);
  col = mix(col, uHorC, smoothstep(0.25, 0.85, rd) * 0.8);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}`;
  const CLOUD = { mesh: null, off: null, Y: 420 };
  function buildClouds() {
    const g = new THREE.PlaneGeometry(2, 2); g.rotateX(Math.PI / 2); // faces down (seen from below)
    const m = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: {
        uCam: { value: new THREE.Vector3() }, uOff: { value: new THREE.Vector2() }, uCov: { value: 0.5 }, uAlpha: { value: 0 }, uR: { value: 2000 },
        uCol: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uHorC: { value: new THREE.Color() }, uFlash: { value: new THREE.Color() },
      },
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false; mesh.renderOrder = 1e6 + 1; mesh.name = 'cloud-deck'; mesh.visible = false;
    CLOUD.mesh = mesh; CLOUD.mat = m; CLOUD.off = m.uniforms.uOff.value;
    H.layer.add(mesh);
  }

  /* ------------------------------------------------------------ halos + bolt */
  const HALO = { pts: null, pos: null, n: 0, max: 40 };
  function softTex(w, h, paint) { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; }
  function buildHalos() {
    const tex = softTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.65, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
    const g = new THREE.BufferGeometry();
    HALO.pos = new Float32Array(HALO.max * 3); HALO.col = new Float32Array(HALO.max * 3);
    g.setAttribute('position', new THREE.BufferAttribute(HALO.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(HALO.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    g.setDrawRange(0, 0);
    const m = new THREE.PointsMaterial({ size: 60, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0, fog: false });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false; pts.renderOrder = 3; pts.name = 'lamp-halos'; pts.visible = false;
    HALO.pts = pts; HALO.mat = m; HALO.tex = tex;
    H.layer.add(pts);
  }
  function fillHalos() {
    const L = LAMPS.list, P = HALO.pos, C = HALO.col;
    let n = 0;
    for (let i = 0; i < L.length && n < HALO.max; i++) {
      const l = L[i], c = l.globe ? COL.globe : l.tube ? COL.tube : COL.sodium;
      P[n * 3] = l.x; P[n * 3 + 1] = l.h - 0.4; P[n * 3 + 2] = l.y;
      C[n * 3] = c[0]; C[n * 3 + 1] = c[1] * 1.1; C[n * 3 + 2] = c[2] * 1.4 + 0.02;
      n++;
    }
    HALO.n = n;
    const g = HALO.pts.geometry; g.setDrawRange(0, n); g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
  const BOLT = { spr: null, texs: [], t0: -99, strike: null, dur: 0.42 };
  function boltTex(seed) {
    return softTex(128, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      let r = null;
      const path = (x, y, len, ang, wid, depth) => {
        let px = x, py = y;
        g.beginPath(); g.moveTo(px, py);
        const steps = Math.max(3, Math.floor(len / 14));
        for (let i = 0; i < steps; i++) {
          ang += (r.next() - 0.5) * 0.9; ang = clamp(ang, Math.PI / 2 - 0.7, Math.PI / 2 + 0.7);
          const sl = len / steps * (0.6 + r.next() * 0.8);
          px += Math.cos(ang) * sl; py += Math.sin(ang) * sl;
          g.lineTo(px, py);
          if (depth < 2 && r.next() < 0.18) { g.lineWidth = wid; g.stroke(); path(px, py, len * 0.35, ang + (r.next() < 0.5 ? -0.7 : 0.7), wid * 0.5, depth + 1); g.beginPath(); g.moveTo(px, py); }
        }
        g.lineWidth = wid; g.stroke();
      };
      g.lineCap = 'round'; g.lineJoin = 'round';
      // glow, then the bright core along the same channel (same seed)
      r = N.util.rng('weather3d:bolt' + seed);
      g.shadowColor = 'rgba(150,170,255,1)'; g.shadowBlur = 16; g.strokeStyle = 'rgba(170,190,255,0.75)';
      path(w * 0.5, 0, h * 0.98, Math.PI / 2, 6, 0);
      r = N.util.rng('weather3d:bolt' + seed);
      g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,1)';
      path(w * 0.5, 0, h * 0.98, Math.PI / 2, 2, 0);
    });
  }
  function buildBolt() {
    for (let k = 0; k < 3; k++) BOLT.texs.push(boltTex(k));
    const m = new THREE.SpriteMaterial({ map: BOLT.texs[0], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, color: new THREE.Color(1.6, 1.7, 2.2) });
    const s = new THREE.Sprite(m);
    s.frustumCulled = false; s.renderOrder = 1e6 + 2; s.name = 'bolt'; s.visible = false;
    BOLT.spr = s; BOLT.mat = m;
    H.layer.add(s);
  }
  N.on('weather:lightning', (s) => {
    if (!BOLT.spr || !s) return;
    BOLT.t0 = H ? H.time : 0; BOLT.strike = s;
    BOLT.mat.map = BOLT.texs[(Math.random() * BOLT.texs.length) | 0];
    BOLT.placed = false;
  });

  /* ------------------------------------------------------------ autos: side covers down */
  const COVER = { mesh: null, max: 32, m4: null, q: null, s: null, p: null, e: null };
  function coverGeo() {
    // two rexine curtains hanging from the canopy edge over the passenger openings (model space: +x
    // forward, z across; the auto model's passenger bay runs x -10.5 .. -2.8, canopy edge y 9.3)
    const pos = [], nrm = [], idx = [];
    const NX = 6, NY = 3;
    for (const sd of [-1, 1]) {
      const b = pos.length / 3;
      for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
        const u = i / NX, v = j / NY;
        const x = -10.5 + u * 7.8, y = 9.35 - v * 4.75;
        const sag = Math.sin(u * Math.PI) * v * 0.35 + Math.sin(u * Math.PI * 6) * 0.06 * v;
        pos.push(x, y, sd * (6.48 + sag)); nrm.push(0, 0, sd);
      }
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const a = b + j * (NX + 1) + i, c = a + NX + 1;
        if (sd > 0) idx.push(a, c, a + 1, a + 1, c, c + 1); else idx.push(a, a + 1, c, a + 1, c + 1, c);
      }
      // the rolled top edge
      const t = pos.length / 3;
      pos.push(-10.6, 9.5, sd * 6.62, -2.7, 9.5, sd * 6.62, -10.6, 9.0, sd * 6.7, -2.7, 9.0, sd * 6.7); nrm.push(0, 0.3, sd, 0, 0.3, sd, 0, 0.3, sd, 0, 0.3, sd);
      if (sd > 0) idx.push(t, t + 2, t + 1, t + 1, t + 2, t + 3); else idx.push(t, t + 1, t + 2, t + 1, t + 3, t + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx);
    g.translate(0, -9.5, 0); // origin on the canopy edge: the instance's y scale rolls the curtain down
    return g;
  }
  function buildCovers() {
    const m = new THREE.MeshLambertMaterial({ color: '#141317', side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(coverGeo(), m, COVER.max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.count = 0; mesh.name = 'auto-covers'; mesh.visible = false;
    mesh.castShadow = false; mesh.userData.noShadow = true; // no shadow-pass draw call for a curtain
    COVER.mesh = mesh; COVER.mat = m;
    COVER.m4 = new THREE.Matrix4(); COVER.q = new THREE.Quaternion(); COVER.s = new THREE.Vector3(); COVER.p = new THREE.Vector3(); COVER.e = new THREE.Euler(); COVER.up = new THREE.Vector3(0, 1, 0);
    H.layer.add(mesh);
  }
  const isAuto = (v) => { const T = v.T || (N.vehicles && N.vehicles.TYPES && N.vehicles.TYPES[v.type]); return !!T && (T.id === 'auto' || T.base === 'auto' || v.type === 'auto' || v.type === 'yadagiri_auto' || T.cls === 'auto') && !(T.cls && T.cls !== 'auto'); };
  function updateCovers(cam) {
    const M = COVER.mesh; if (!M) return;
    const W = N.weather;
    // same rule as the 2D view (weather.js): covers roll down while it rains (> 0.06), up after
    const tgt = W.rain > 0.06 ? 1 : 0, now = (N.time && N.time.real) || 0;
    if (!tgt && !COVER.any) { M.visible = false; M.count = 0; return; }
    let vs = null;
    try { vs = N.entities.query(cam.x, cam.z, 380, (e) => e.kind === 'vehicle'); } catch (e) { vs = null; }
    let n = 0, any = false;
    const pl = N.player, fps = H.mode === 'fps';
    if (vs) for (const v of vs) {
      if (n >= COVER.max) break;
      if (!isAuto(v) || v.fallen) continue;
      if (fps && pl && pl.vehicle === v) continue;
      if (v._wx3Cov == null) v._wx3Cov = tgt;
      const cdt = clamp(now - (v._wx3CovT || now), 0, 0.1); v._wx3CovT = now;
      v._wx3Cov += clamp(tgt - v._wx3Cov, -cdt * 0.7, cdt * 0.7);
      if (v._wx3Cov > 0.03) any = true; else continue;
      const T = v.T || N.vehicles.TYPES[v.type];
      const sx = T && T.w ? T.w / 22 : 1, sz = T && T.d ? clamp(T.d / 13, 0.7, 1.4) : 1;
      let el = 0; try { el = H.elev(v); } catch (e) { el = 0; }
      COVER.p.set(v.x, el + 9.5, v.y);
      COVER.q.setFromAxisAngle(COVER.up, -(v.angle || 0));
      COVER.s.set(sx, Math.max(0.05, v._wx3Cov), sz);
      COVER.m4.compose(COVER.p, COVER.q, COVER.s);
      M.setMatrixAt(n++, COVER.m4);
    }
    COVER.any = any || !!tgt;
    M.count = n; M.visible = n > 0;
    if (n) M.instanceMatrix.needsUpdate = true;
    ST.covers = n;
  }

  /* ------------------------------------------------------------ sky / light post-modify */
  const C3 = {};
  function tmpCol(k) { return C3[k] || (C3[k] = new THREE.Color()); }
  const GLOW = { base: 0 };
  function skyAndLight(t, night) {
    const Wt = N.weather, UNI = H.uniforms;
    const rain = Wt.rain, storm = Wt.storm, mist = Wt.mist, cloud = Wt.cloud;
    const ov = clamp(Math.max(cloud * 0.9, rain), 0, 1);
    const flash = Wt.flash > 0 ? Wt.flash * (0.55 + 0.45 * (Math.sin(t * 71) > -0.2 ? 1 : 0)) : 0;
    const zen = UNI.uZen.value, hor = UNI.uHor.value;
    const fog = H.scene.fog;
    const sun = E.sun, hemi = E.hemi;
    // overcast: grey, low-contrast sky; heavy rain / storm darker; at night the clouds glow sodium-brown
    if (ov > 0.001) {
      const dz = tmpCol('dz').setRGB(0.12, 0.135, 0.155), dh = tmpCol('dh').setRGB(0.27, 0.285, 0.3);
      const sz = tmpCol('sz').setRGB(0.05, 0.058, 0.07), sh = tmpCol('sh').setRGB(0.15, 0.16, 0.175);
      const nz = tmpCol('nz').setRGB(0.008, 0.008, 0.011), nh = tmpCol('nh').setRGB(0.05, 0.035, 0.024);
      const gz = tmpCol('gz').copy(dz).lerp(sz, clamp(storm * 0.8 + rain * 0.3, 0, 1)).lerp(nz, night);
      const gh = tmpCol('gh').copy(dh).lerp(sh, clamp(storm * 0.8 + rain * 0.3, 0, 1)).lerp(nh, night);
      // keep a little of the time-of-day tint (dusk through the clouds)
      const k = ov * 0.95;
      zen.lerp(gz, k); hor.lerp(gh, k * 0.92);
    }
    if (mist > 0.001) {
      // winter mist: the horizon goes milky (warm at dawn), the zenith flattens towards it
      const mc = tmpCol('mc').setRGB(0.62, 0.62, 0.6).lerp(tmpCol('mw').setRGB(0.75, 0.62, 0.5), smooth(330, 400, N.clock.minutes) * (1 - smooth(420, 520, N.clock.minutes)) * 0.6);
      mc.multiplyScalar(clamp(N.clock.light ? N.clock.light() * 1.1 + 0.08 : 1, 0.08, 1));
      hor.lerp(mc, mist * 0.75); zen.lerp(hor, mist * 0.55);
    }
    if (flash > 0.001) {
      const fc = tmpCol('fc').setRGB(0.3, 0.33, 0.52);
      zen.lerp(fc, flash * 0.25); hor.lerp(fc, flash * 0.35);
    }
    // fog: the (modified) horizon; closer in rain, thick in mist
    if (ov > 0.001 || mist > 0.001 || flash > 0.001) {
      fog.color.copy(hor).lerp(zen, 0.12 * (1 - mist));
      const far0 = fog.far;
      const far = Math.max(230, far0 * (1 - 0.42 * rain - 0.2 * storm) * (1 - 0.74 * mist));
      fog.far = far;
      fog.near = Math.min(fog.near, far * (0.3 - 0.22 * Math.max(mist, rain * 0.6)));
    }
    // light: the sun dims (and its disc hides) under the clouds; the sky light greys
    if (ov > 0.001 || mist > 0.001) {
      const dim = clamp(1 - 0.82 * ov - 0.55 * mist, 0.1, 1);
      sun.intensity *= dim;
      UNI.uSunCol.value.multiplyScalar(dim);
      UNI.uSunVis.value *= clamp(1 - ov * 1.1 - mist * 0.8, 0, 1);
      const sk = E.skyMat && E.skyMat.uniforms.uSunCol; if (sk) sk.value.multiplyScalar(clamp(1 - ov, 0.15, 1));
      const grey = tmpCol('hg').copy(hor).lerp(zen, 0.4);
      const l = (grey.r + grey.g + grey.b) / 3 || 1;
      grey.multiplyScalar(0.62 / l);
      hemi.color.lerp(grey, ov * 0.55 + mist * 0.3);
      hemi.groundColor.multiplyScalar(1 - 0.35 * ov);
      hemi.intensity *= 1 + (0.22 * ov + 0.15 * mist) * (1 - night);
    }
    if (flash > 0.001) {
      hemi.color.lerp(tmpCol('fh').setRGB(0.2, 0.24, 0.4), clamp(flash, 0, 1) * 0.85);
      hemi.intensity += flash * (0.25 + 0.45 * night);
      E.renderer.toneMappingExposure += flash * 0.12;
    }
    // lamp glows: bigger, softer halos in rain and mist
    const G = H.materials.glow;
    if (G) { if (!GLOW.base) GLOW.base = G.size || 26; G.size = GLOW.base * (1 + 0.55 * rain + 1.2 * mist); }
    return { ov, flash, rain, storm, mist, cloud };
  }

  /* ------------------------------------------------------------ sky dome: stars + moon hide behind the overcast */
  const SKYU = { uWxOv: null };
  function patchSky() {
    const m = E.skyMat; if (!m || m.userData.wx) return;
    m.userData.wx = true;
    let fs = m.fragmentShader;
    const star = 'uNight * smoothstep(0.02, 0.3, h); }', moon = '* 0.35) * uNight;';
    if (fs.indexOf(star) < 0 || fs.indexOf(moon) < 0) return;
    fs = fs.replace(star, 'uNight * smoothstep(0.02, 0.3, h) * (1.0 - uWxOv); }').replace(moon, '* 0.35) * uNight * (1.0 - uWxOv);');
    m.fragmentShader = 'uniform float uWxOv;\n' + fs;
    SKYU.uWxOv = m.uniforms.uWxOv = { value: 0 };
    m.needsUpdate = true;
  }

  /* ------------------------------------------------------------ the layer */
  const ST = { patched: 0, drops: 0, covers: 0, lights: 0, ms: 0, msAvg: 0 };
  const TMP = {};
  const DBG = { pinFlash: false };
  function init(T, h) {
    THREE = T; H = h; E = V.engine;
    WXN = low() ? 4 : 8;
    WX.uWxL = { value: [] }; WX.uWxC = { value: [] }; WX.uWxK = { value: new THREE.Vector4() };
    for (let i = 0; i < WXN; i++) { WX.uWxL.value.push(new THREE.Vector4(0, -1000, 0, 1)); WX.uWxC.value.push(new THREE.Vector3()); }
    TMP.cam = new THREE.Vector3(); TMP.fwd = new THREE.Vector3(); TMP.amb = new THREE.Color();
    try { patchSky(); } catch (e) { N.err('weather3d.sky', e); }
    buildRain(); buildSplashes(); buildClouds(); buildHalos(); buildBolt(); buildCovers();
  }
  function hideAll() {
    for (const o of [RAIN.mesh, SPL.mesh, CLOUD.mesh, HALO.pts, BOLT.spr, COVER.mesh]) if (o) o.visible = false;
  }
  function update(dt, h) {
    if (!E || !E.ready) return;
    const t0 = performance.now();
    const Wt = N.weather;
    if (!Wt) return;
    scanChunks();
    const cam = TMP.cam.copy(h.camera.position), fwd = h.camera.getWorldDirection(TMP.fwd);
    const t = h.time, night = h.night;
    // wetness (after the ground layer set its own)
    if (GUwet) GUwet.value = userWet != null ? userWet : clamp(Wt.wet, 0, 1);
    if (GUrain) GUrain.value += (clamp(Wt.rain * 1.2, 0, 1) - GUrain.value) * Math.min(1, dt * 2 + (Wt.forced ? 1 : 0));
    if (DBG.pinFlash) { Wt.flash = Math.max(Wt.flash, 0.95); if (t - BOLT.t0 > 0.05 || t < BOLT.t0) BOLT.t0 = t - 0.03; }
    if (!enabled) { hideAll(); WX.uWxK.value.set(0, 0, 0, 0); REQ.length = 0; return; }
    const S = skyAndLight(t, night);
    if (SKYU.uWxOv) SKYU.uWxOv.value = clamp(Math.max(S.ov * 1.15, S.mist), 0, 1);
    // lights near the camera (street lamps refreshed when the camera has moved; vehicles every frame)
    if (Math.hypot(cam.x - LAMPS.x, cam.z - LAMPS.y) > 45 || t - LAMPS.t > 3 || t < LAMPS.t) { refreshLamps(cam.x, cam.z, t); if (HALO.pts) fillHalos(); }
    const lampOn = smooth(0.08, 0.5, night + S.ov * 0.15);
    const n = gatherLights(cam, fwd, lampOn);
    uploadLights(cam, lampOn, n);
    ST.lights = Math.min(n, WXN);
    const wet = userWet != null ? userWet : Wt.wet;
    WX.uWxK.value.set(lampOn, clamp(Wt.rain, 0, 1), wet, S.flash);
    // ambient brightness for drops / splashes: the overcast sky light
    const amb = TMP.amb.copy(E.hemi.color).multiplyScalar(E.hemi.intensity * 0.22).lerp(H.scene.fog.color, 0.3);
    amb.r += S.flash * 0.18; amb.g += S.flash * 0.2; amb.b += S.flash * 0.26;
    updateRain(dt, cam, fwd, S.rain, amb);
    updateSplashes(cam, fwd, S.rain, amb, t);
    // cloud deck
    const CM = CLOUD.mesh;
    const cov = clamp(Math.max(S.cloud, S.rain * 1.1), 0, 1);
    if (CM) {
      if (cov < 0.05) CM.visible = false;
      else {
        CM.visible = true;
        const u = CLOUD.mat.uniforms, R = (H.quality.drawDist || 1500) * 1.3;
        CM.position.set(cam.x, CLOUD.Y, cam.z); CM.scale.set(R, 1, R); CM.updateMatrixWorld();
        u.uCam.value.copy(cam); u.uR.value = R;
        const wi = N.wind || { dx: 1, dy: 0, strength: 0.3 };
        const sp = (4 + 18 * (wi.strength || 0)) * 0.0021 * dt;
        CLOUD.off.x = (CLOUD.off.x - wi.dx * sp) % 1000; CLOUD.off.y = (CLOUD.off.y - wi.dy * sp) % 1000;
        u.uCov.value = cov;
        u.uAlpha.value = smooth(0.05, 0.4, cov) * (0.55 + 0.4 * cov) * (1 - S.mist * 0.5);
        u.uCol.value.copy(H.uniforms.uZen.value).lerp(H.uniforms.uHor.value, 0.55).multiplyScalar(0.85 + 0.3 * (1 - night));
        u.uGlow.value.setRGB(0.07, 0.04, 0.02).multiplyScalar(night * (0.4 + 0.8 * cov));
        u.uHorC.value.copy(H.scene.fog.color);
        u.uFlash.value.setRGB(0.45, 0.5, 0.75).multiplyScalar(S.flash);
      }
    }
    // halos
    if (HALO.pts) {
      const k = lampOn * (0.3 * S.rain + 0.55 * S.mist + 0.1 * S.ov);
      HALO.pts.visible = k > 0.01 && HALO.n > 0;
      HALO.mat.opacity = clamp(k, 0, 0.7);
      HALO.mat.size = 34 + 26 * S.mist + 12 * S.rain;
    }
    // bolt
    if (BOLT.spr) {
      const age = t - BOLT.t0, s = BOLT.strike;
      if (s && age >= 0 && age < BOLT.dur && N.atmos && N.atmos.is3D()) {
        if (!BOLT.placed) {
          const dx = s.x - cam.x, dz = s.y - cam.z, d = Math.hypot(dx, dz) || 1;
          const dd = clamp(d, 220, (H.quality.drawDist || 1500) * 0.88);
          const bx = cam.x + dx / d * dd, bz = cam.z + dz / d * dd;
          const bh = clamp(dd * 0.55, 260, 760);
          BOLT.spr.position.set(bx, bh * 0.5 - 4, bz);
          BOLT.spr.scale.set(bh * 0.32, bh, 1);
          BOLT.placed = true;
        }
        const pulse = age < 0.08 ? 1 : age < 0.14 ? 0.25 : age < 0.24 ? 0.9 : 1 - (age - 0.24) / (BOLT.dur - 0.24);
        BOLT.mat.opacity = clamp(pulse, 0, 1) * clamp(s.power * 1.2, 0.4, 1);
        BOLT.spr.visible = true;
      } else BOLT.spr.visible = false;
    }
    updateCovers(cam);
    ST.req = REQ.length; REQ.length = 0;
    const ms = performance.now() - t0;
    ST.ms = ms; ST.msAvg += (ms - ST.msAvg) * 0.05;
  }
  V.registerLayer('weather3d', { order: 40, init, update, dispose() { hideAll(); } });

  N.weather3d = {
    get enabled() { return enabled; },
    setEnabled(on) { enabled = !!on; if (!enabled) hideAll(); return enabled; },
    stats() {
      return {
        patched: ST.patched, req: ST.req, lamps: LAMPS.list.length, drops: ST.drops, covers: ST.covers, lights: ST.lights, ms: +ST.ms.toFixed(3), msAvg: +ST.msAvg.toFixed(3), wxN: WXN,
        rain: !!(RAIN.mesh && RAIN.mesh.visible), splashes: !!(SPL.mesh && SPL.mesh.visible), clouds: !!(CLOUD.mesh && CLOUD.mesh.visible),
        halos: !!(HALO.pts && HALO.pts.visible), bolt: !!(BOLT.spr && BOLT.spr.visible), wet: GUwet ? +GUwet.value.toFixed(2) : null,
        calls: [RAIN.mesh, SPL.mesh, CLOUD.mesh, HALO.pts, BOLT.spr, COVER.mesh].filter((o) => o && o.visible).length,
        fogFar: H && H.scene && H.scene.fog ? Math.round(H.scene.fog.far) : null,
      };
    },
    /** tests: hold a lightning flash + bolt on screen (true) / let it go (false) */
    pinFlash(on) { DBG.pinFlash = !!on; return DBG.pinFlash; },
    lights() { return PICK.map((o) => ({ x: Math.round(o.x), y: Math.round(o.y), h: +o.h.toFixed(1), c: [+o.r.toFixed(2), +o.g.toFixed(2), +o.b.toFixed(2)] })); },
  };
})();
