/* NOSTALGIA — view3d_post.js  (N.graphics: the Graphics setting — Auto / Low / High / Ultra — and the Ultra tier's
 * post-processing of the 3D views)
 *
 * Tiers: Low and High are the core's (src/view3d.js applyTier). Ultra is High plus, for strong desktop GPUs:
 *   - the scene rendered off screen exactly as High shows it (+ depth), then, on that frame:
 *   - ambient occlusion: soft contact shadow under vehicles, round feet, poles and kerbs, in corners and under eaves
 *     (half resolution, 12 samples from the depth buffer, depth-aware blur), faded out with distance;
 *   - aerial perspective: a haze over distance, thinner with height, warmed towards the sun;
 *   - bloom: lit windows, lamps, floodlit hoardings, headlights, the low sun (a 5-level mip chain);
 *   - sun shafts through gaps when the sun is up and in view;
 *   - a film grade: more colour, an S-curve that keeps black and white, cool shade, warm light, a soft vignette;
 *     FXAA, light sharpening and a fine film grain on the way to the screen;
 *   - a richer sky: the core sky with two shaded cloud layers (sunlit edges, darker undersides, high streaks);
 *   - sharper, wider sun shadows (4096 map over 240 u), 8 night point lights, render scale up to 2x
 *     (the core's adaptive pixel ratio still steps it down on a slow GPU).
 * Auto picks Ultra on a desktop with a discrete / Apple-silicon GPU and WebGL2, Low where the core would (phones),
 * else High. An auto-picked Ultra that still runs under 30 fps at the lowest render scale steps down to High
 * (remembered); a chosen Ultra stays. High <-> Ultra switches live; to or from Low applies after a reload.
 *
 * Hooks (src/view3d.js): N.emit('view3d:init', {Q}) right before the engine is created (engine-creation quality:
 * shadow map size, point lights, anisotropy), and E.post: when set, render() calls E.post.render(renderer, scene,
 * camera) instead of renderer.render(scene, camera). Settings row 'graphics' (section Screen) via
 * N.menus.addSettingsRow. Stored in localStorage 'nostalgia.graphics'.
 *
 * API  N.graphics = {setting, tier, set(v: 'auto'|'low'|'high'|'ultra'), autoTier(), gpu(), classify(rendererString)
 *   -> 'strong'|'weak'|'unknown', stats() -> {setting, tier, pending, autoUltra, post, ao, bloom, half, sky,
 *   size: [w, h], fps, calls, gpu}, TUNE (live: the look's numbers)}
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.view3d) return;
  const V = N.view3d, U = N.util;
  const KEY = 'nostalgia.graphics', KEY_DOWN = 'nostalgia.graphics.autoDown';
  const VALID = ['auto', 'low', 'high', 'ultra'];
  const LABEL = { auto: 'Auto', low: 'Low', high: 'High', ultra: 'Ultra' };
  const ls = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch (e) { /* storage off */ } },
  };
  const toast = (t, ms) => { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 3200, { key: 'graphics' }); } catch (e) { /* ignore */ } };
  const reducedMotion = () => document.body.classList.contains('reduced-motion');

  // the look: AO in 3D units (a floor is 22.5 u, a person ~13 u), bloom thresholds on linear HDR scene colour
  const TUNE = {
    aoRadius: 12, aoIntensity: 3.2, aoPower: 1.4, aoFade: [280, 560], aoDay: 0.8, aoNight: 0.4,
    // on display values ([day, night]); the up-chain adds each smaller level with less weight (glow without a veil)
    bloomThr: [0.95, 0.62], bloomKnee: [0.05, 0.15], bloom: [0.08, 0.42], bloomRadius: 1, bloomW: [1, 0.9, 0.75, 0.6, 0.45],
    // aerial perspective: haze over distance, thinner with height, warmed towards the sun; sun shafts through gaps
    haze: [0.3, 0.16], hazeDist: 1100, hazeHeight: 260, sunGlow: 0.6, shafts: 0.3,
    // the grade (display space): an S-curve that keeps black and white, cool shade, warm light, vignette, grain, sharpen
    sat: 1.16, curve: 0.18, shadowTint: [-0.006, 0, 0.016], highTint: [0.016, 0.005, -0.008], vignette: 0.3, grain: 0.028, sharpen: 0.35,
    slowFps: 30,
  };
  const startTier = V.quality.tier; // the core's own pick for this device ('low' on phones)
  let setting = ls.get(KEY);
  if (VALID.indexOf(setting) < 0) setting = 'auto';
  let pending = null;   // a tier waiting for a reload (to / from Low after the engine started)
  let autoUltra = false; // Ultra came from Auto (may step down)

  /* ================================================================ the device */
  let GPU = null;
  function gpu() {
    if (GPU) return GPU;
    GPU = { renderer: '', webgl2: false };
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (gl) {
        GPU.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        GPU.renderer = String((ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '');
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
    } catch (e) { /* no WebGL */ }
    return GPU;
  }
  // discrete NVIDIA / AMD / Intel Arc, Apple silicon; never software, mobile or integrated (High is the safe pick)
  const WEAK = /swiftshader|llvmpipe|softpipe|software|basic render|mali|adreno|powervr|videocore|tegra|apple a\d/i;
  const STRONG = /nvidia|geforce|rtx|gtx|quadro|radeon\s*(rx|pro|vii|r9)|\brx\s?[4-9]\d{2,3}|apple m\d|apple gpu|arc\(tm\)\s*a\d|intel.*\barc\b/i;
  const classify = (s) => (WEAK.test(s) ? 'weak' : STRONG.test(s) ? 'strong' : 'unknown');
  function autoTier() {
    if (startTier === 'low') return 'low';
    if (ls.get(KEY_DOWN) === '1') return 'high';
    let coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) { /* ignore */ }
    const g = gpu(), cores = navigator.hardwareConcurrency || 4;
    if (coarse || !g.webgl2 || cores < 6 || Math.min(window.innerWidth, window.innerHeight) < 600) return 'high';
    if (classify(g.renderer) !== 'strong') return 'high';
    return 'ultra';
  }

  /* ================================================================ tier values */
  const dpr = () => window.devicePixelRatio || 1;
  function ultraQ() {
    const max = Math.min(2, Math.max(dpr(), 1.5));
    return { maxPixelRatio: max, pixelRatio: Math.min(max, 1.5), minPixelRatio: 1, shadows: true, shadowSize: 4096, shadowRange: 240, pointLights: 8, aniso: 16, drawDist: 1700, lmDist: 1850, budgetMs: 4 };
  }
  function highQ() {
    const max = Math.min(dpr(), 1.5);
    return { maxPixelRatio: max, pixelRatio: max, minPixelRatio: 0.75, shadowSize: 2048, shadowRange: 190, pointLights: 4, drawDist: 1500, lmDist: 1650, budgetMs: 3.5 };
  }
  /** before the engine exists: the core's tier values, Ultra's on top */
  function preTier(t) {
    const Q = V.quality;
    Q.tier = '?'; V.setQuality({ tier: t === 'low' ? 'low' : 'high' });
    if (t === 'ultra') Object.assign(Q, ultraQ());
    Q.tier = t;
  }
  /** High <-> Ultra on a running engine: shadow map, point lights, render scale, the post pipeline */
  function liveTier(t) {
    const Q = V.quality, E = V.engine, T = V.THREE;
    Object.assign(Q, t === 'ultra' ? ultraQ() : highQ());
    Q.tier = t;
    const sun = E.sun;
    if (sun && sun.castShadow) {
      sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      const c = sun.shadow.camera, r = Q.shadowRange;
      c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.updateProjectionMatrix();
    }
    const P = E.points;
    if (P && T) {
      while (P.length < Q.pointLights) { const p = new T.PointLight('#ffab40', 0, 70, 1.6); p.userData.cand = null; E.scene.add(p); P.push(p); }
      while (P.length > Q.pointLights) { const p = P.pop(); E.scene.remove(p); if (p.dispose) p.dispose(); }
    }
    V.setQuality({}); // camera far, resize, re-plan the streaming
    if (t === 'ultra') enablePost(); else disablePost();
  }
  function set(v) {
    if (VALID.indexOf(v) < 0) return setting;
    setting = v; ls.set(KEY, v);
    if (v === 'ultra') ls.set(KEY_DOWN, null);
    const want = v === 'auto' ? autoTier() : v;
    autoUltra = v === 'auto' && want === 'ultra';
    const E = V.engine;
    if (!E || !E.ready) { preTier(want); pending = null; return setting; }
    const cur = V.quality.tier;
    if (want === cur) { pending = null; return setting; }
    if ((want === 'low') !== (cur === 'low')) {
      pending = want;
      toast('Graphics: ' + LABEL[want] + ' from the next time the game starts.');
      return setting;
    }
    pending = null;
    liveTier(want);
    toast('Graphics: ' + LABEL[want] + (want === 'ultra' ? ' — soft shadows, glowing lights, film colour' : ''), 2400);
    return setting;
  }

  // a chosen tier applies now, before anything is built; Auto decides when 3D starts (the GPU probe costs a context)
  if (setting !== 'auto') preTier(setting);
  N.on('view3d:init', () => {
    if (setting !== 'auto') return;
    const t = autoTier();
    autoUltra = t === 'ultra';
    if (t === 'ultra') preTier('ultra');
  });
  N.on('view3d:ready', () => { if (V.quality.tier === 'ultra') enablePost(); });
  N.on('view3d:contextrestored', () => { freeTargets(); });

  /* ================================================================ the post pipeline */
  const VS = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const FS_AO = [
    'uniform sampler2D tDepth; uniform mat4 uProj; uniform mat4 uInvProj; uniform vec2 uTexel;',
    'uniform float uRadius; uniform float uIntensity; uniform float uPow; uniform vec2 uFade;',
    'varying vec2 vUv;',
    'vec3 vpos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 c = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return c.xyz / c.w; }',
    'float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }',
    'void main(){',
    '  float d = texture2D(tDepth, vUv).x;',
    '  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }',
    '  vec3 p = vpos(vUv);',
    '  vec2 o = uTexel * 2.0;',
    // the normal from the flatter neighbour on each axis (no halo across depth edges)
    '  vec3 pr = vpos(vUv + vec2(o.x, 0.0)), pl = vpos(vUv - vec2(o.x, 0.0)), pu = vpos(vUv + vec2(0.0, o.y)), pd = vpos(vUv - vec2(0.0, o.y));',
    '  vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;',
    '  vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;',
    '  vec3 n = normalize(cross(dx, dy));',
    '  if (dot(n, p) > 0.0) n = -n;',
    '  float z = -p.z;',
    '  vec2 rs = vec2(uProj[0][0], uProj[1][1]) * 0.5 * uRadius / z;',
    '  float m = max(rs.x, rs.y); if (m > 0.12) rs *= 0.12 / m;',
    '  float a0 = ign(gl_FragCoord.xy) * 6.2831853, R2 = uRadius * uRadius, occ = 0.0;',
    '  for (int i = 0; i < 12; i++) {',
    '    float t = (float(i) + 0.5) / 12.0;',
    '    float a = a0 + float(i) * 2.3999632;',
    '    vec3 v = vpos(vUv + vec2(cos(a), sin(a)) * t * rs) - p;',
    '    float vv = dot(v, v);',
    '    occ += max(dot(v, n) * inversesqrt(vv + 1e-4) - 0.12, 0.0) * clamp(1.0 - vv / R2, 0.0, 1.0);',
    '  }',
    '  float ao = pow(clamp(1.0 - occ / 12.0 * uIntensity, 0.0, 1.0), uPow);',
    '  gl_FragColor = vec4(mix(ao, 1.0, smoothstep(uFade.x, uFade.y, z)), 0.0, 0.0, 1.0);',
    '}',
  ].join('\n');
  const FS_BLUR = [
    'uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 uDir; uniform vec2 uNF;',
    'varying vec2 vUv;',
    'float lz(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNF.x * uNF.y / (uNF.y + uNF.x - z * (uNF.y - uNF.x)); }',
    'void main(){',
    '  float zc = lz(texture2D(tDepth, vUv).x), s = 0.0, w = 0.0;',
    '  for (int i = -3; i <= 3; i++) {',
    '    vec2 uv = vUv + uDir * float(i);',
    '    float z = lz(texture2D(tDepth, uv).x);',
    '    float k = exp(-float(i * i) / 8.0) * max(0.0, 1.0 - abs(z - zc) / (zc * 0.04 + 0.5));',
    '    s += texture2D(tAO, uv).r * k; w += k;',
    '  }',
    '  gl_FragColor = vec4(s / max(w, 1e-4), 0.0, 0.0, 1.0);',
    '}',
  ].join('\n');
  const LUM = 'float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }\n';
  const FS_PRE = [
    'uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr; uniform float uKnee;',
    'varying vec2 vUv;', LUM,
    'vec3 tap(vec2 uv, out float w){ vec3 c = min(texture2D(tSrc, uv).rgb, vec3(48.0)); w = 1.0 / (1.0 + lum(c)); return c * w; }',
    'void main(){',
    // a Karis-weighted 4-tap average (no fireflies from single bright pixels), then a soft-knee threshold
    '  float wa, wb, wc, wd;',
    '  vec3 c = tap(vUv + uTexel * vec2(-1.0, -1.0), wa) + tap(vUv + uTexel * vec2(1.0, -1.0), wb) + tap(vUv + uTexel * vec2(-1.0, 1.0), wc) + tap(vUv + uTexel * vec2(1.0, 1.0), wd);',
    '  c /= (wa + wb + wc + wd);',
    '  float br = max(c.r, max(c.g, c.b));',
    '  float soft = clamp(br - uThr + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4);',
    '  gl_FragColor = vec4(c * max(soft, br - uThr) / max(br, 1e-4), 1.0);',
    '}',
  ].join('\n');
  const FS_DOWN = [ // 13 taps (the Call of Duty: Advanced Warfare downsample)
    'uniform sampler2D tSrc; uniform vec2 uTexel;',
    'varying vec2 vUv;',
    'vec3 t(float x, float y){ return texture2D(tSrc, vUv + uTexel * vec2(x, y)).rgb; }',
    'void main(){',
    '  vec3 c = t(0.0, 0.0) * 0.125;',
    '  c += (t(-2.0, 2.0) + t(2.0, 2.0) + t(-2.0, -2.0) + t(2.0, -2.0)) * 0.03125;',
    '  c += (t(0.0, 2.0) + t(-2.0, 0.0) + t(2.0, 0.0) + t(0.0, -2.0)) * 0.0625;',
    '  c += (t(-1.0, 1.0) + t(1.0, 1.0) + t(-1.0, -1.0) + t(1.0, -1.0)) * 0.125;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}',
  ].join('\n');
  const FS_UP = [ // 3x3 tent, added onto the next level up
    'uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uR; uniform float uW;',
    'varying vec2 vUv;',
    'vec3 t(float x, float y){ return texture2D(tSrc, vUv + uTexel * uR * vec2(x, y)).rgb; }',
    'void main(){',
    '  vec3 c = t(0.0, 0.0) * 4.0 + (t(-1.0, 0.0) + t(1.0, 0.0) + t(0.0, -1.0) + t(0.0, 1.0)) * 2.0 + t(-1.0, -1.0) + t(1.0, -1.0) + t(-1.0, 1.0) + t(1.0, 1.0);',
    '  gl_FragColor = vec4(c / 16.0 * uW, 1.0);',
    '}',
  ].join('\n');
  const FS_SMASK = [ // the sky round the sun (depth = far plane), the source of the shafts
    'uniform sampler2D tScene; uniform sampler2D tDepth; uniform vec2 uSun; uniform float uAspect;',
    'varying vec2 vUv;',
    'void main(){',
    '  float sky = step(0.99999, texture2D(tDepth, vUv).x);',
    '  float m = sky * smoothstep(0.35, 0.0, length((vUv - uSun) * vec2(uAspect, 1.0)));',
    '  gl_FragColor = vec4(min(texture2D(tScene, vUv).rgb, vec3(6.0)) * m, 1.0);',
    '}',
  ].join('\n');
  const FS_RAD = [ // radial blur towards the sun (two passes: long, then short)
    'uniform sampler2D tSrc; uniform vec2 uSun; uniform float uLen;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec2 d = (uSun - vUv) * uLen / 24.0, uv = vUv; vec3 s = vec3(0.0); float w = 1.0, tw = 0.0;',
    '  for (int i = 0; i < 24; i++) { s += texture2D(tSrc, uv).rgb * w; tw += w; w *= 0.95; uv += d; }',
    '  gl_FragColor = vec4(s / tw, 1.0);',
    '}',
  ].join('\n');
  const FS_COMP = [ // works on the display frame (what High shows): AO, haze, bloom, shafts, then the grade
    'uniform sampler2D tScene; uniform sampler2D tAO; uniform sampler2D tBloom; uniform sampler2D tDepth; uniform sampler2D tShafts;',
    'uniform float uAO; uniform float uBloom; uniform float uShafts; uniform float uSat; uniform float uCurve; uniform float uVig;',
    'uniform vec3 uShadowTint; uniform vec3 uHighTint;',
    'uniform mat4 uInvProj; uniform mat3 uCamRot; uniform float uCamY; uniform float uHasDepth;',
    'uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uFogCol; uniform float uHaze; uniform float uHazeDist; uniform float uHazeH; uniform float uSunGlow;',
    'varying vec2 vUv;', LUM,
    'void main(){',
    '  vec3 c = texture2D(tScene, vUv).rgb;',
    '  c *= mix(1.0, texture2D(tAO, vUv).r, uAO);',
    '  if (uHasDepth > 0.5) {',
    '    float d = texture2D(tDepth, vUv).x;',
    '    if (d < 0.99999) {',
    '      vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vec3 p = vp.xyz / vp.w;',
    '      float dist = length(p); vec3 dir = uCamRot * (p / dist);',
    '      float amt = uHaze * (1.0 - exp(-dist / uHazeDist)) * exp(-max(uCamY + dir.y * dist, 0.0) / uHazeH);',
    '      vec3 hc = mix(uFogCol, uSunCol, pow(max(dot(dir, uSunDir), 0.0), 6.0) * uSunGlow);',
    '      c = mix(c, hc, clamp(amt, 0.0, 1.0));',
    '    }',
    '  }',
    '  c += texture2D(tBloom, vUv).rgb * uBloom + texture2D(tShafts, vUv).rgb * uShafts;',
    // a soft shoulder over 0.9 (additive glows and bloom go past white)
    '  c = mix(c, 0.9 + 0.1 * (1.0 - exp(-(c - 0.9) * 10.0)), step(0.9, c));',
    '  c = max(mix(vec3(lum(c)), c, uSat), 0.0);',
    '  c = clamp(c + uCurve * (c - 0.5) * 4.0 * c * (1.0 - c), 0.0, 1.0);',
    '  float l = lum(c);',
    '  c += uShadowTint * (1.0 - l) * (1.0 - l) + uHighTint * l * l;',
    '  vec2 q = vUv - 0.5; c *= 1.0 - uVig * smoothstep(0.1, 0.55, dot(q, q));',
    '  c = clamp(c, 0.0, 1.0);',
    '  gl_FragColor = vec4(c, dot(c, vec3(0.299, 0.587, 0.114)));',
    '}',
  ].join('\n');
  const FS_FINAL = [ // FXAA (the classic PC console variant, luma from the composite's alpha) + film grain
    'uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uGrain; uniform float uTime; uniform float uSharp;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec4 M = texture2D(tSrc, vUv);',
    '  float nw = texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).a, ne = texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).a;',
    '  float sw = texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).a, se = texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).a, m = M.a;',
    '  float lo = min(m, min(min(nw, ne), min(sw, se))), hi = max(m, max(max(nw, ne), max(sw, se)));',
    '  vec3 c = M.rgb;',
    '  if (hi - lo > max(0.0312, hi * 0.125)) {',
    '    vec2 dir = vec2(-((nw + ne) - (sw + se)), (nw + sw) - (ne + se));',
    '    float red = max((nw + ne + sw + se) * 0.03125, 1.0 / 128.0);',
    '    dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), vec2(-8.0), vec2(8.0)) * uTexel;',
    '    vec3 a = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);',
    '    vec3 b = a * 0.5 + 0.25 * (texture2D(tSrc, vUv - dir * 0.5).rgb + texture2D(tSrc, vUv + dir * 0.5).rgb);',
    '    float lb = dot(b, vec3(0.299, 0.587, 0.114));',
    '    c = (lb < lo || lb > hi) ? a : b;',
    '  } else c += (m - (nw + ne + sw + se) * 0.25) * uSharp;', // texture detail: a light unsharp mask
    '  float g = fract(sin(dot(gl_FragCoord.xy + uTime * 61.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;',
    '  c += g * uGrain * (1.0 - 0.6 * dot(c, vec3(0.299, 0.587, 0.114)));',
    '  gl_FragColor = vec4(c, 1.0);',
    '}',
  ].join('\n');

  /* ---------------------------------------------------- the Ultra sky */
  // The core sky (src/view3d.js SKY_FS) with its cloud block swapped for two shaded layers: puffy clouds lit on the side
  // towards the sun and darker beneath, a silver lining round the sun, thin high streaks. Patched by text between the
  // core's cloud block and its gl_FragColor: if that block changes shape, the core sky simply stays.
  const SKY_FN = 'float fbm6(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += vn(p) * a; p = p * 2.03 + 17.3; a *= 0.5; } return s; }\n';
  const SKY_CLOUDS = [
    '  if (h > 0.01) {',
    '    vec2 cp = d.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.006, uTime * 0.0025);',
    '    float base = fbm6(cp * 1.4);',
    '    float c = smoothstep(0.5, 0.8, base) * smoothstep(0.01, 0.2, h);',
    '    vec2 toS = normalize(uSunDir.xz + vec2(1e-4)) * 0.07;',
    '    float lit = clamp(0.55 + (base - fbm6((cp + toS) * 1.4)) * 5.0, 0.0, 1.0);',
    '    vec3 cL = mix(uHor * 1.12, vec3(1.0), 0.3) + uSunCol * 0.22 * uSunVis;',
    '    vec3 cD = mix(uHor * 0.72, uZen, 0.25);',
    '    vec3 cc = mix(cD, cL, lit) + uSunCol * pow(sd, 6.0) * 0.5 * uSunVis * (1.0 - smoothstep(0.6, 0.95, base));',
    '    cc = mix(cc, vec3(0.05, 0.06, 0.1), uNight * 0.85);',
    '    col = mix(col, cc, c * 0.85);',
    '    vec2 hp = d.xz / (h + 0.05) * 0.3 + vec2(uTime * 0.004, 0.0);',
    '    float ci = smoothstep(0.55, 0.85, fbm(vec2(hp.x * 0.5, hp.y * 3.0) * 2.0)) * smoothstep(0.06, 0.5, h) * (1.0 - uNight);',
    '    col = mix(col, cL, ci * 0.22);',
    '  }',
  ].join('\n');
  const SKY = { orig: null, ultra: null };
  function skyUltra(on) {
    const E = V.engine, m = E && E.skyMat;
    if (!m) return;
    if (SKY.orig == null) {
      const o = (SKY.orig = m.fragmentShader);
      const a = o.indexOf('  if (h > 0.015) {'), b = o.indexOf('  gl_FragColor = vec4(col, 1.0);'), f = o.indexOf('void main(){');
      SKY.ultra = f > 0 && a > f && b > a ? o.slice(0, f) + SKY_FN + o.slice(f, a) + SKY_CLOUDS + '\n' + o.slice(b) : null;
    }
    const want = on && SKY.ultra ? SKY.ultra : SKY.orig;
    if (m.fragmentShader !== want) { m.fragmentShader = want; m.needsUpdate = true; }
  }

  const PP = { on: false, built: false, rt: null, w: 0, h: 0, half: false, ao: false, M: null, quad: null, qs: null, qc: null,
    lastT: 0, acc: 0, n: 0, fps: 0, slow: 0, calls: 0, sz: null };
  function buildPost(T, r) {
    if (PP.built) return;
    const mat = (fs, uniforms, extra) => {
      const m = new T.ShaderMaterial(Object.assign({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false }, extra || {}));
      return m;
    };
    const v2 = () => ({ value: new T.Vector2() });
    PP.M = {
      ao: mat(FS_AO, { tDepth: { value: null }, uProj: { value: new T.Matrix4() }, uInvProj: { value: new T.Matrix4() }, uTexel: v2(), uRadius: { value: TUNE.aoRadius }, uIntensity: { value: TUNE.aoIntensity }, uPow: { value: TUNE.aoPower }, uFade: { value: new T.Vector2(TUNE.aoFade[0], TUNE.aoFade[1]) } }),
      blur: mat(FS_BLUR, { tAO: { value: null }, tDepth: { value: null }, uDir: v2(), uNF: v2() }),
      pre: mat(FS_PRE, { tSrc: { value: null }, uTexel: v2(), uThr: { value: 1 }, uKnee: { value: 0.5 } }),
      down: mat(FS_DOWN, { tSrc: { value: null }, uTexel: v2() }),
      up: mat(FS_UP, { tSrc: { value: null }, uTexel: v2(), uR: { value: TUNE.bloomRadius }, uW: { value: 1 } }, { transparent: true, blending: T.AdditiveBlending }),
      smask: mat(FS_SMASK, { tScene: { value: null }, tDepth: { value: null }, uSun: v2(), uAspect: { value: 1 } }),
      rad: mat(FS_RAD, { tSrc: { value: null }, uSun: v2(), uLen: { value: 1 } }),
      comp: mat(FS_COMP, { tScene: { value: null }, tAO: { value: null }, tBloom: { value: null }, tDepth: { value: null }, tShafts: { value: null },
        uAO: { value: 0.8 }, uBloom: { value: 0.1 }, uShafts: { value: 0 }, uSat: { value: TUNE.sat }, uCurve: { value: TUNE.curve }, uVig: { value: TUNE.vignette },
        uShadowTint: { value: new T.Vector3().fromArray(TUNE.shadowTint) }, uHighTint: { value: new T.Vector3().fromArray(TUNE.highTint) },
        uInvProj: { value: new T.Matrix4() }, uCamRot: { value: new T.Matrix3() }, uCamY: { value: 0 }, uHasDepth: { value: 0 },
        uSunDir: { value: new T.Vector3(0, 1, 0) }, uSunCol: { value: new T.Color() }, uFogCol: { value: new T.Color() }, uHaze: { value: 0 }, uHazeDist: { value: TUNE.hazeDist }, uHazeH: { value: TUNE.hazeHeight }, uSunGlow: { value: TUNE.sunGlow } }),
      final: mat(FS_FINAL, { tSrc: { value: null }, uTexel: v2(), uGrain: { value: TUNE.grain }, uTime: { value: 0 }, uSharp: { value: TUNE.sharpen } }),
    };
    PP.quad = new T.Mesh(new T.PlaneGeometry(2, 2), PP.M.final);
    PP.quad.frustumCulled = false;
    PP.qs = new T.Scene(); PP.qs.add(PP.quad);
    PP.qc = new T.Camera();
    PP.v3 = new T.Vector3();
    PP.sz = new T.Vector2();
    const caps = r.capabilities, ex = r.extensions;
    PP.half = caps.isWebGL2 ? !!ex.get('EXT_color_buffer_float') : !!(ex.has('OES_texture_half_float') && ex.has('EXT_color_buffer_half_float'));
    PP.ao = caps.isWebGL2 || ex.has('WEBGL_depth_texture');
    PP.built = true;
  }
  function freeTargets() {
    const R = PP.rt; PP.rt = null; PP.w = PP.h = 0;
    if (!R) return;
    for (const k of ['scene', 'ao', 'ao2', 'ldr', 'sh1', 'sh2']) if (R[k]) { if (R[k].depthTexture) R[k].depthTexture.dispose(); R[k].dispose(); }
    for (const t of R.mips) t.dispose();
  }
  function allocTargets(T, w, h) {
    freeTargets();
    const hdr = PP.half ? T.HalfFloatType : T.UnsignedByteType;
    const mk = (W, H, o) => {
      const t = new T.WebGLRenderTarget(Math.max(1, W | 0), Math.max(1, H | 0), Object.assign({ minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type: hdr, depthBuffer: false, stencilBuffer: false }, o || {}));
      t.texture.generateMipmaps = false;
      return t;
    };
    const R = { mips: [] };
    if (PP.ao) { const dt = new T.DepthTexture(w, h); dt.type = T.UnsignedIntType; R.scene = mk(w, h, { depthBuffer: true, depthTexture: dt }); } else R.scene = mk(w, h, { depthBuffer: true });
    // three r149 renders into a target in linear colour, except an XR one, which gets its texture's encoding: flagged
    // so, the materials write exactly what they write on the screen (tone-mapped, sRGB, fog and all) and the post
    // starts from the High frame. (The flag only picks that output encoding here; the storage stays plain RGBA16F/8.)
    R.scene.isXRRenderTarget = true;
    R.scene.texture.encoding = T.sRGBEncoding;
    R.scene.texture.internalFormat = PP.half ? 'RGBA16F' : 'RGBA8';
    R.ldr = mk(w, h, { type: T.UnsignedByteType });
    if (PP.ao) {
      R.ao = mk(w / 2, h / 2, { type: T.UnsignedByteType }); R.ao2 = mk(w / 2, h / 2, { type: T.UnsignedByteType });
      R.sh1 = mk(w / 4, h / 4); R.sh2 = mk(w / 4, h / 4);
    }
    let mw = w / 2, mh = h / 2;
    for (let i = 0; i < 5; i++) { R.mips.push(mk(mw, mh)); mw = Math.max(1, mw / 2); mh = Math.max(1, mh / 2); }
    PP.rt = R; PP.w = w; PP.h = h;
  }
  function pass(r, m, target) { PP.quad.material = m; r.setRenderTarget(target); r.render(PP.qs, PP.qc); }
  function postRender(r, scene, cam) {
    const T = V.THREE, M = PP.M;
    r.getDrawingBufferSize(PP.sz);
    const w = PP.sz.x | 0, h = PP.sz.y | 0;
    if (!PP.rt || w !== PP.w || h !== PP.h) allocTargets(T, w, h);
    const R = PP.rt, info = r.info, autoReset = info.autoReset, autoClear = r.autoClear;
    info.autoReset = false; info.reset();
    try {
      // 1. the scene, as the screen would get it (the display frame of High) + depth
      r.setRenderTarget(R.scene);
      r.render(scene, cam);
      r.autoClear = false;
      const night = (V.H && V.H.night) || 0;
      // 2. ambient occlusion, half resolution, blurred across and down
      if (PP.ao) {
        const A = M.ao.uniforms;
        A.tDepth.value = R.scene.depthTexture; A.uProj.value.copy(cam.projectionMatrix); A.uInvProj.value.copy(cam.projectionMatrixInverse); A.uTexel.value.set(1 / w, 1 / h);
        pass(r, M.ao, R.ao);
        const B = M.blur.uniforms;
        B.tDepth.value = R.scene.depthTexture; B.uNF.value.set(cam.near, cam.far);
        B.tAO.value = R.ao.texture; B.uDir.value.set(1 / R.ao.width, 0); pass(r, M.blur, R.ao2);
        B.tAO.value = R.ao2.texture; B.uDir.value.set(0, 1 / R.ao.height); pass(r, M.blur, R.ao);
      }
      // 3. bloom: threshold into half size, down the chain, back up adding each level
      const P = M.pre.uniforms;
      P.tSrc.value = R.scene.texture; P.uTexel.value.set(1 / w, 1 / h);
      P.uThr.value = U.lerp(TUNE.bloomThr[0], TUNE.bloomThr[1], night); P.uKnee.value = U.lerp(TUNE.bloomKnee[0], TUNE.bloomKnee[1], night);
      pass(r, M.pre, R.mips[0]);
      for (let i = 1; i < R.mips.length; i++) { const s = R.mips[i - 1]; M.down.uniforms.tSrc.value = s.texture; M.down.uniforms.uTexel.value.set(1 / s.width, 1 / s.height); pass(r, M.down, R.mips[i]); }
      for (let i = R.mips.length - 1; i > 0; i--) { const s = R.mips[i], u = M.up.uniforms; u.tSrc.value = s.texture; u.uTexel.value.set(1 / s.width, 1 / s.height); u.uW.value = TUNE.bloomW[i]; pass(r, M.up, R.mips[i - 1]); }
      // 4. sun shafts: the sky round the sun (when it is up and on screen), blurred towards it
      const E = V.engine, SK = E.skyMat && E.skyMat.uniforms, C = M.comp.uniforms;
      let shafts = 0;
      if (PP.ao && SK) {
        const sv = SK.uSunVis.value * (1 - night);
        const sp = PP.v3.copy(SK.uSunDir.value).multiplyScalar(1000).add(cam.position).project(cam);
        const sx = sp.x * 0.5 + 0.5, sy = sp.y * 0.5 + 0.5;
        const on = sp.z < 1 ? U.clamp(1 - Math.max(Math.abs(sx - 0.5), Math.abs(sy - 0.5)) * 1.25 + 0.15, 0, 1) : 0; // fades out past the edges
        shafts = TUNE.shafts * sv * on;
        if (shafts > 0.01) {
          const S = M.smask.uniforms, Rd = M.rad.uniforms;
          S.tScene.value = R.scene.texture; S.tDepth.value = R.scene.depthTexture; S.uSun.value.set(sx, sy); S.uAspect.value = w / h;
          pass(r, M.smask, R.sh1);
          Rd.uSun.value.set(sx, sy);
          Rd.tSrc.value = R.sh1.texture; Rd.uLen.value = 1; pass(r, M.rad, R.sh2);
          Rd.tSrc.value = R.sh2.texture; Rd.uLen.value = 0.3; pass(r, M.rad, R.sh1);
        } else shafts = 0;
      }
      // 5. composite: AO, haze, bloom, shafts, tone mapping, the grade
      C.tScene.value = R.scene.texture; C.tAO.value = PP.ao ? R.ao.texture : null; C.tBloom.value = R.mips[0].texture;
      C.tDepth.value = PP.ao ? R.scene.depthTexture : null; C.tShafts.value = shafts > 0 ? R.sh1.texture : null; C.uShafts.value = shafts;
      C.uAO.value = PP.ao ? U.lerp(TUNE.aoDay, TUNE.aoNight, night) : 0; C.uBloom.value = U.lerp(TUNE.bloom[0], TUNE.bloom[1], night);
      C.uHasDepth.value = PP.ao ? 1 : 0; C.uInvProj.value.copy(cam.projectionMatrixInverse); C.uCamRot.value.setFromMatrix4(cam.matrixWorld); C.uCamY.value = cam.position.y;
      C.uHaze.value = U.lerp(TUNE.haze[0], TUNE.haze[1], night);
      C.uSat.value = TUNE.sat; C.uCurve.value = TUNE.curve; C.uVig.value = TUNE.vignette; C.uSunGlow.value = TUNE.sunGlow;
      C.uShadowTint.value.fromArray(TUNE.shadowTint); C.uHighTint.value.fromArray(TUNE.highTint);
      M.ao.uniforms.uRadius.value = TUNE.aoRadius; M.ao.uniforms.uIntensity.value = TUNE.aoIntensity; M.ao.uniforms.uPow.value = TUNE.aoPower;
      if (E.scene.fog) C.uFogCol.value.copy(E.scene.fog.color);
      if (SK) { C.uSunDir.value.copy(SK.uSunDir.value); C.uSunCol.value.copy(SK.uSunCol.value).multiplyScalar(0.8 * SK.uSunVis.value).convertLinearToSRGB(); }
      pass(r, M.comp, R.ldr);
      // 6. FXAA, sharpening and grain to the screen
      const F = M.final.uniforms;
      F.tSrc.value = R.ldr.texture; F.uTexel.value.set(1 / w, 1 / h); F.uGrain.value = TUNE.grain; F.uSharp.value = TUNE.sharpen; F.uTime.value = reducedMotion() ? 0 : ((N.time && N.time.real) || 0) % 100;
      pass(r, M.final, null);
      PP.calls = info.render.calls;
    } finally {
      r.setRenderTarget(null);
      r.autoClear = autoClear; info.autoReset = autoReset;
    }
    watchFps();
  }
  // an Ultra that Auto picked steps down to High on a GPU that cannot hold 30 fps at the lowest render scale
  function watchFps() {
    const t = performance.now();
    if (PP.lastT) { const d = t - PP.lastT; if (d < 400) { PP.acc += d; PP.n++; } }
    PP.lastT = t;
    if (PP.acc < 3000) return;
    PP.fps = PP.n * 1000 / PP.acc; PP.acc = 0; PP.n = 0;
    const Q = V.quality;
    if (autoUltra && PP.fps < TUNE.slowFps && Q.pixelRatio <= Q.minPixelRatio + 0.01) {
      if (++PP.slow >= 3) { ls.set(KEY_DOWN, '1'); autoUltra = false; liveTier('high'); toast('Graphics: High, for smoother play on this device (Settings → Graphics).'); }
    } else PP.slow = 0;
  }
  const POST = {
    render(r, scene, cam) {
      try { postRender(r, scene, cam); } catch (e) {
        N.err('view3d_post.render', e);
        disablePost();
        r.setRenderTarget(null); r.render(scene, cam);
      }
    },
  };
  function enablePost() {
    const E = V.engine;
    if (!E || !E.ready || !V.THREE) return;
    try { buildPost(V.THREE, E.renderer); E.post = POST; PP.on = true; skyUltra(true); } catch (e) { N.err('view3d_post.enable', e); disablePost(); }
  }
  function disablePost() {
    const E = V.engine;
    if (E && E.post === POST) E.post = null;
    PP.on = false; PP.lastT = 0; PP.acc = PP.n = PP.slow = 0;
    freeTargets();
    skyUltra(false);
  }

  /* ================================================================ API + the settings row */
  function stats() {
    return { setting, tier: V.quality.tier, pending, autoUltra, post: PP.on, ao: PP.on && PP.ao, bloom: PP.on, half: PP.half, sky: !!(PP.on && SKY.ultra && V.engine.skyMat && V.engine.skyMat.fragmentShader === SKY.ultra), size: [PP.w, PP.h], fps: +PP.fps.toFixed(1), calls: PP.calls, gpu: GPU ? GPU.renderer : null };
  }
  const G = (N.graphics = {
    get setting() { return setting; },
    get tier() { return V.quality.tier; },
    set, autoTier, gpu, classify, stats, TUNE,
    _pp: () => PP, // (tests: the pipeline's targets)
  });
  N.addSystem({
    id: 'graphics', order: 8, runIn: ['*'],
    init() {
      try {
        if (N.menus && N.menus.addSettingsRow) {
          N.menus.addSettingsRow({
            id: 'graphics', label: 'Graphics (3D)', type: 'seg', section: 'Screen',
            opts: [['auto', 'Auto'], ['low', 'Low'], ['high', 'High'], ['ultra', 'Ultra']],
            help: 'Ultra: soft shadows in corners, glowing lights at night and film-like colour, for strong PCs. Auto picks for this device. To or from Low applies the next time the game starts.',
            get: () => setting, set: (v) => { G.set(v); },
          });
        }
      } catch (e) { N.err('graphics.settings', e); }
    },
  });
})();
