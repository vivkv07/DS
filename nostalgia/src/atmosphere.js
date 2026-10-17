/* NOSTALGIA — atmosphere.js (atmosphere worker) — design/atmosphere.md, ARCHITECTURE §22
 *
 * Core of the atmosphere layer: the wind (N.wind), the weather schedule + live weather state
 * (N.weather) and a few shared helpers (N.atmos). The rest of the layer builds on these:
 *   src/weather.js          rain / storm / mist in the top-down view, rain life, gameplay hooks
 *   src/weather3d.js        the same in the 3D view (rain volume, wet roads, lightning, halos)
 *   src/wind.js             wind sway for trees, palms, flags, clotheslines, banners (2D + 3D shader)
 *   src/wires.js            electric poles + overhead wires (2D + 3D), perches for birds
 *   src/birds.js            boids flocks (2D + 3D), roosting, perching
 *   src/atmosphere_audio.js rain / thunder / wind / bird sounds on top of N.audio's context
 *
 * ------------------------------------------------------------------ N.wind
 *   dir                 world angle the wind blows TOWARDS (0 = east, +PI/2 = south)
 *   dx, dy              unit vector of dir
 *   strength            0 calm .. 0.3 breeze .. 0.6 windy .. 1 monsoon storm (smoothed, this frame)
 *   gustiness           0..1 how much the travelling gust waves add on top
 *   at(x, y, out?)  -> {x, y, s}  local wind: unit direction * s, s = strength incl. the gust wave here
 *   gust(x, y)      -> 0..1      the travelling gust wave at a point (visible waves across the city)
 *   sway(x, y, phase, out?) -> {x, y}  a ready-made 2D sway offset factor (multiply by your own
 *                       amplitude in u): steady lean downwind + oscillation + a little cross-wind flutter
 *   day                 the deterministic per-day profile {dir, base, gusty, calmNight}
 *   GLSL                shader chunk (declares uWind, uWindWave; windGust(vec2), windOffset(vec3 wp,
 *                       float weight, float phase)) — see wind.js for the material patcher
 *   uniforms(THREE)     shared three.js uniforms {uWind: Vector4(dx, dz, strength, gustiness),
 *                       uWindWave: Vector4(1 / wavelength, speed, time, 0)}; updated every frame
 *   force(spec|null)    tests: {strength, dir, gustiness} pins the wind
 *
 * ------------------------------------------------------------------ N.weather
 *   decide(date {y, m, d}, minutes) -> {rain 0..1, storm 0..1, mist 0..1, cloud 0..1, kind}
 *                       the deterministic schedule: monsoon (12 Jun - 30 Sep) evening / night showers on
 *                       most days + storms, pre-monsoon thunderstorms in May / early June, retreating
 *                       monsoon showers in October, winter morning mist (Nov - Feb), dry summer
 *   rain, storm, mist, cloud   live smoothed values 0..1 (rain = intensity)
 *   wet                 ground wetness 0..1 (wets in ~20 s of rain, dries over ~2-3 min)
 *   raining             rain > 0.05 (seasons.js mirrors it to N.seasons.is('rain') / N.flags.raining)
 *   flash               lightning flash 0..1 (decays fast); lastStrike {x, y, dist, power, t}
 *   setting             'auto' | 'clear' | 'rain' | 'storm'  (settings row "Weather"; persisted)
 *   force(spec|null)    tests / debug: {rain, storm, mist, cloud} pins the live values (instant)
 *   strike(x?, y?)      trigger a lightning strike now (tests)
 *   Story flags: N.flags.rain = true / false forces rain on / off (seasons.js contract),
 *                N.flags.storm = true forces a storm.
 *   Events: 'weather:change' {raining, storm, mist, prev}, 'weather:lightning' {x, y, dist, power,
 *           delay (s until the thunder arrives)}, 'weather:petrichor' (the first rain after a dry spell;
 *           the "matti ki khushboo" toast is shown here).
 *
 * ------------------------------------------------------------------ N.atmos
 *   low                 phone / low tier (coarse pointer or small screen): fewer particles
 *   focus(out?)         {x, y} the player (or the camera) — what everything spawns around
 *   is3D()              the 3D view is rendering
 *   rng(key)            N.util.rng seeded per key (deterministic placement)
 *   edits               list of the small edits made to files this layer does not own (below)
 *
 * EDITS TO FILES THIS LAYER DOES NOT OWN (each marked "[atmosphere hook]" in the file):
 *   - index.html: <script> tags for the atmosphere files (after seasons.js / after models3d.js)
 *   - src/seasons.js weatherTick(): asks N.weather.decide() for rain / mist when present (the
 *     schedule lives here); drawWeather(): skipped when N.weather.draws2d (weather.js draws rain)
 * Everything else hooks in by wrapping documented APIs from these files.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) { /* storage off */ } };
  const h01 = (s) => (U.strHash(s) >>> 0) / 4294967296;

  /* ================================================================ N.atmos */
  let low = false;
  try { low = window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600; } catch (e) { low = false; }
  const A = (N.atmos = {
    get low() { return low; },
    set low(v) { low = !!v; },
    focus(out) {
      out = out || {};
      const p = N.player, R = N.render;
      if (p && isFinite(p.x) && N.state && N.state.mode !== 'title') { out.x = p.x; out.y = p.y; }
      else if (R && R.cam && isFinite(R.cam.x)) { out.x = R.cam.x; out.y = R.cam.y; }
      else { out.x = 0; out.y = 0; }
      return out;
    },
    is3D() { return !!(N.view3d && N.view3d.active); },
    rng(key) { return U.rng(String(key)); },
    edits: [
      'index.html: <script> tags for src/atmosphere.js, wind.js, weather.js, wires.js, birds.js, atmosphere_audio.js (after seasons.js) and weather3d.js, atmosphere3d.js (after models3d.js)',
      'src/seasons.js weatherTick(): N.weather.decide() supplies rain / mist when present',
      'src/seasons.js draw(): its simple 2D rain is skipped while N.weather.draws2d',
    ],
    date() {
      try { if (N.calendar && N.calendar.date) { const d = N.calendar.date; return { y: d.y, m: d.m, d: d.d }; } } catch (e) { /* fall through */ }
      try { if (N.seasons && N.seasons.date) { const d = N.seasons.date(); if (d && d.m) return { y: d.y, m: d.m, d: d.d }; } } catch (e) { /* fall through */ }
      const dt = new Date(2003, 0, 14 + ((N.clock && N.clock.day) || 0));
      return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
    },
  });

  /* ================================================================ weather schedule */
  const md = (d) => d.m * 100 + d.d;
  // one shower: {start (min), dur (min), peak 0..1, storm 0..1}; intensity envelope with internal surges
  function showerAt(sh, m, key) {
    const e = m - sh.start;
    if (e < -70 || e > sh.dur + 15) return null;
    const up = smooth(-4, 8, e), down = 1 - smooth(sh.dur - 12, sh.dur, e);
    const surge = 0.75 + 0.25 * Math.sin(e * 0.21 + sh.ph) * Math.sin(e * 0.077 + sh.ph * 2.3);
    return { rain: clamp(up * down * sh.peak * surge, 0, 1), storm: sh.storm * smooth(-6, 4, e) * (1 - smooth(sh.dur * 0.75, sh.dur, e)), cloud: smooth(-70, -5, e) * (1 - smooth(sh.dur, sh.dur + 15, e)) };
  }
  const dayCache = new Map();
  function dayPlan(d) {
    const key = d.y + '-' + d.m + '-' + d.d;
    let p = dayCache.get(key);
    if (p) return p;
    const r = U.rng('wx:' + key), v = md(d);
    p = { key, showers: [], mist: 0, mistFrom: 330, mistTo: 500, kind: 'dry' };
    const monsoon = v >= 612 && v <= 930;
    if (monsoon) {
      const roll = r.next();
      if (roll < 0.17) { // a storm evening
        p.kind = 'storm';
        p.showers.push({ start: 18 * 60 + 30 + Math.floor(r.next() * 210), dur: 60 + Math.floor(r.next() * 70), peak: 0.9 + r.next() * 0.1, storm: 1, ph: r.next() * 9 });
      } else if (roll < 0.8) { // the usual evening / night shower
        p.kind = 'showers';
        p.showers.push({ start: 17 * 60 + Math.floor(r.next() * 360), dur: 40 + Math.floor(r.next() * 110), peak: 0.45 + r.next() * 0.45, storm: r.next() < 0.18 ? 0.5 : 0, ph: r.next() * 9 });
        if (r.next() < 0.35) p.showers.push({ start: 13 * 60 + 30 + Math.floor(r.next() * 170), dur: 25 + Math.floor(r.next() * 40), peak: 0.3 + r.next() * 0.3, storm: 0, ph: r.next() * 9 });
        if (r.next() < 0.2) p.showers.push({ start: 4 * 60 + Math.floor(r.next() * 150), dur: 30 + Math.floor(r.next() * 50), peak: 0.2 + r.next() * 0.25, storm: 0, ph: r.next() * 9 });
      } else if (roll < 0.9) { // a grey drizzly day
        p.kind = 'drizzle';
        for (let k = 0; k < 4; k++) p.showers.push({ start: 9 * 60 + k * 150 + Math.floor(r.next() * 60), dur: 30 + Math.floor(r.next() * 60), peak: 0.18 + r.next() * 0.2, storm: 0, ph: r.next() * 9 });
      } else r.next(); // a dry break in the monsoon
    } else if (v >= 501 && v < 612) { // pre-monsoon thunderstorms (late afternoon)
      if (r.next() < (v >= 525 ? 0.28 : 0.12)) { p.kind = 'storm'; p.showers.push({ start: 16 * 60 + Math.floor(r.next() * 180), dur: 35 + Math.floor(r.next() * 45), peak: 0.75 + r.next() * 0.25, storm: 0.9, ph: r.next() * 9 }); }
    } else if (v >= 1001 && v <= 1031) { // retreating monsoon
      if (r.next() < 0.25) { p.kind = 'showers'; p.showers.push({ start: 17 * 60 + 30 + Math.floor(r.next() * 240), dur: 30 + Math.floor(r.next() * 60), peak: 0.35 + r.next() * 0.35, storm: r.next() < 0.2 ? 0.6 : 0, ph: r.next() * 9 }); }
    }
    const mm = d.m;
    const mistP = mm === 12 || mm === 1 ? 0.6 : mm === 11 || mm === 2 ? 0.25 : 0;
    if (mistP && r.next() < mistP) { p.mist = 0.35 + r.next() * 0.55; p.mistFrom = 300 + Math.floor(r.next() * 40); p.mistTo = 470 + Math.floor(r.next() * 60); }
    if (monsoon && p.kind === 'showers' && r.next() < 0.15) { p.mist = 0.3; p.mistFrom = 300; p.mistTo = 420; } // a damp misty monsoon dawn
    if (dayCache.size > 64) dayCache.clear();
    dayCache.set(key, p);
    return p;
  }
  function decide(d, m) {
    d = d || A.date(); if (m == null) m = N.clock ? N.clock.minutes : 720;
    const out = { rain: 0, storm: 0, mist: 0, cloud: 0, kind: 'dry' };
    const plans = [[dayPlan(d), 0]];
    // a shower that started late yesterday can run past midnight
    if (m < 180) { const y = new Date(d.y, d.m - 1, d.d - 1); plans.push([dayPlan({ y: y.getFullYear(), m: y.getMonth() + 1, d: y.getDate() }), 1440]); }
    for (const [p, off] of plans) {
      if (!off) out.kind = p.kind;
      for (const sh of p.showers) {
        const s = showerAt(sh, m + off, p.key);
        if (!s) continue;
        out.rain = Math.max(out.rain, s.rain); out.storm = Math.max(out.storm, s.storm); out.cloud = Math.max(out.cloud, s.cloud);
      }
      if (!off && p.mist) out.mist = p.mist * smooth(p.mistFrom - 25, p.mistFrom + 30, m) * (1 - smooth(p.mistTo - 50, p.mistTo, m));
    }
    if (out.kind === 'drizzle') out.cloud = Math.max(out.cloud, 0.75 * smooth(360, 480, m) * (1 - smooth(1140, 1260, m)));
    if (out.kind === 'storm' || out.kind === 'showers') out.cloud = Math.max(out.cloud, 0.25);
    return out;
  }

  /* ================================================================ live weather */
  const SET_KEY = 'nostalgia.weather.v1';
  const SETTINGS = ['auto', 'clear', 'rain', 'storm'];
  let setting = lsGet(SET_KEY); if (SETTINGS.indexOf(setting) < 0) setting = 'auto';
  let forced = null, windForced = null;
  const W = (N.weather = {
    decide, dayPlan,
    rain: 0, storm: 0, mist: 0, cloud: 0, wet: 0, flash: 0, raining: false, lastStrike: null,
    target: { rain: 0, storm: 0, mist: 0, cloud: 0, kind: 'dry' },
    draws2d: false,      // weather.js sets this true (seasons.js then skips its simple 2D rain)
    dryFor: 99,          // game minutes since it last rained (petrichor toast after a dry spell)
    get setting() { return setting; },
    set setting(v) { if (SETTINGS.indexOf(v) < 0) return; setting = v; lsSet(SET_KEY, v); N.emit('weather:setting', { setting: v }); },
    SETTINGS,
    force(spec) {
      forced = spec ? Object.assign({ rain: 0, storm: 0, mist: 0, cloud: 0 }, spec) : null;
      if (forced) {
        if (spec.cloud == null) forced.cloud = Math.max(forced.rain, forced.storm) > 0 ? 0.9 : 0;
        W.rain = forced.rain; W.storm = forced.storm; W.mist = forced.mist; W.cloud = forced.cloud;
        if (spec.wet != null) W.wet = spec.wet; else if (forced.rain > 0.05) W.wet = Math.max(W.wet, 0.9);
      }
      tick(0);
      return forced;
    },
    get forced() { return forced; },
    strike(x, y, power) { return strike(x, y, power); },
    /** what the target values are right now (schedule + setting + flags + force) */
    want() { return wantNow(); },
  });

  function wantNow() {
    const t = W.target;
    const s = decide(A.date(), N.clock ? N.clock.minutes : 720);
    t.rain = s.rain; t.storm = s.storm; t.mist = s.mist; t.cloud = s.cloud; t.kind = s.kind;
    if (setting === 'clear') { t.rain = 0; t.storm = 0; t.cloud = Math.min(t.cloud, 0.2); }
    else if (setting === 'rain') { t.rain = Math.max(t.rain, 0.7); t.storm = Math.min(t.storm, 0.3); t.cloud = Math.max(t.cloud, 0.85); }
    else if (setting === 'storm') { t.rain = 1; t.storm = 1; t.cloud = 1; }
    const f = N.flags || {};
    if (f.rain === true) { t.rain = Math.max(t.rain, 0.7); t.cloud = Math.max(t.cloud, 0.85); }
    if (f.rain === false) { t.rain = 0; t.storm = 0; }
    if (f.storm === true) { t.rain = 1; t.storm = 1; t.cloud = 1; }
    if (forced) { t.rain = forced.rain; t.storm = forced.storm; t.mist = forced.mist; t.cloud = forced.cloud; }
    return t;
  }

  const foc = { x: 0, y: 0 };
  let nextStrike = 4, prevRaining = false, prevStorm = false, prevMist = false, lastDay = -1;
  function strike(x, y, power) {
    A.focus(foc);
    if (x == null) { const a = Math.random() * TAU, dd = 160 + Math.pow(Math.random(), 1.5) * 2600; x = foc.x + Math.cos(a) * dd; y = foc.y + Math.sin(a) * dd; }
    const dist = Math.hypot(x - foc.x, y - foc.y);
    power = power == null ? clamp(1.25 - dist / 2600, 0.25, 1) : power;
    W.flash = Math.max(W.flash, power);
    // 1 u = 1.6 m, sound ~343 m/s -> ~214 u/s (capped so a far roll still arrives)
    const delay = Math.min(9, dist / 214);
    W.lastStrike = { x, y, dist, power, t: (N.time && N.time.real) || 0, delay };
    N.emit('weather:lightning', W.lastStrike);
    return W.lastStrike;
  }

  function tick(dt) {
    const t = wantNow();
    if (forced) { W.rain = t.rain; W.storm = t.storm; W.mist = t.mist; W.cloud = t.cloud; }
    else {
      const k = (rate) => 1 - Math.exp(-dt * rate);
      W.rain += (t.rain - W.rain) * k(t.rain > W.rain ? 0.35 : 0.22);
      W.storm += (t.storm - W.storm) * k(0.3);
      W.mist += (t.mist - W.mist) * k(0.2);
      W.cloud += (t.cloud - W.cloud) * k(0.12);
      if (W.rain < 0.004 && t.rain === 0) W.rain = 0;
    }
    // ground wetness: wets quickly in rain, dries over a few minutes
    if (W.rain > 0.05) W.wet = Math.min(1, W.wet + dt * (0.03 + 0.09 * W.rain));
    else W.wet = Math.max(0, W.wet - dt * 0.0065);
    W.flash = Math.max(0, W.flash - dt * 4.5);
    const raining = W.rain > 0.05;
    // minutes since rain (game minutes); petrichor on the first drops after a dry spell
    const gm = dt * ((N.clock && N.clock.speed) || 1);
    if (raining) {
      if (!prevRaining && W.dryFor > 600 && N.state && N.state.mode === 'play') {
        N.emit('weather:petrichor', {});
        try { if (N.hud && N.hud.toast) N.hud.toast('Matti ki khushboo… the first rain on dry earth.', 4200, { key: 'petrichor' }); } catch (e) { /* hud optional */ }
      }
      W.dryFor = 0;
    } else W.dryFor += gm;
    // lightning in storms
    if (W.storm > 0.25 && W.rain > 0.3 && dt > 0) {
      nextStrike -= dt * W.storm;
      if (nextStrike <= 0) { strike(); nextStrike = 5 + Math.random() * 11; }
    }
    W.raining = raining;
    const storm = W.storm > 0.3, mist = W.mist > 0.05;
    if (raining !== prevRaining || storm !== prevStorm || mist !== prevMist) {
      N.emit('weather:change', { raining, storm, mist, prev: { raining: prevRaining, storm: prevStorm, mist: prevMist } });
      prevRaining = raining; prevStorm = storm; prevMist = mist;
      // tell seasons.js now (it polls too); vehicles / traffic / potholes read N.flags.raining through it
      try { if (N.seasons && N.seasons.refresh && N.seasons._weatherTick) N.seasons._weatherTick(); } catch (e) { /* optional */ }
    }
  }

  /* ================================================================ wind */
  const WI = (N.wind = {
    dir: 0, dx: 1, dy: 0, strength: 0.3, gustiness: 0.5, day: null,
    WAVELENGTH: 520,
    speed: 60,          // u/s the gust fronts travel across the city (40 calm .. 150 storm)
    time: 0,            // wraps every 10 000 s (shader precision)
    front: 0,           // how far the gust fronts have travelled (u, wraps every 64 wavelengths)
    at(x, y, out) {
      out = out || {};
      const s = WI.strength * (0.72 + 0.62 * WI.gustiness * WI.gust(x, y));
      out.x = WI.dx; out.y = WI.dy; out.s = s;
      return out;
    },
    gust(x, y) {
      const ph = ((x * WI.dx + y * WI.dy) - WI.front) / WI.WAVELENGTH;
      const g = Math.max(0, Math.sin(ph * TAU) + 0.35 * Math.sin(ph * 3 * TAU + 1.3));
      return Math.min(1, g * g * 0.8);
    },
    sway(x, y, phase, out) {
      out = out || {};
      const t = WI.time, s = WI.strength * (0.72 + 0.62 * WI.gustiness * WI.gust(x, y));
      const osc = Math.sin(t * (1.1 + 2.2 * s) + phase) * 0.55 + Math.sin(t * (2.3 + 3.1 * s) + phase * 1.7) * 0.2;
      const along = s * 0.65 + osc * s * 0.5, cross = Math.sin(t * 1.7 + phase * 2.3) * s * 0.18;
      out.x = WI.dx * along - WI.dy * cross; out.y = WI.dy * along + WI.dx * cross;
      return out;
    },
    force(spec) { windForced = spec ? Object.assign({}, spec) : null; windTick(0); return windForced; },
    get forced() { return windForced; },
    GLSL: [
      'uniform vec4 uWind;      // xy: direction (world x, z), z: strength 0..1, w: gustiness',
      'uniform vec4 uWindWave;  // x: 1 / wavelength, y: gust front position (u), z: time (s), w: 0',
      'float windGust(vec2 p) {',
      '  float ph = (dot(p, uWind.xy) - uWindWave.y) * uWindWave.x;',
      '  float g = max(0.0, sin(ph * 6.2831853) + 0.35 * sin(ph * 18.849556 + 1.3));',
      '  return min(1.0, g * g * 0.8);',
      '}',
      'vec3 windOffset(vec3 wp, float weight, float phase) {',
      '  float s = uWind.z * (0.72 + 0.62 * uWind.w * windGust(wp.xz));',
      '  float t = uWindWave.z;',
      '  float osc = sin(t * (1.1 + 2.2 * s) + phase) * 0.55 + sin(t * (2.3 + 3.1 * s) + phase * 1.7) * 0.2;',
      '  float along = s * 0.65 + osc * s * 0.5;',
      '  float cross = sin(t * 1.7 + phase * 2.3) * s * 0.18;',
      '  vec2 off = uWind.xy * along + vec2(-uWind.y, uWind.x) * cross;',
      '  return vec3(off.x, -abs(along) * 0.12, off.y) * weight;',
      '}',
    ].join('\n'),
    _u: null,
    uniforms(THREE) {
      if (!WI._u && THREE) WI._u = { uWind: { value: new THREE.Vector4(1, 0, 0.3, 0.5) }, uWindWave: { value: new THREE.Vector4(1 / WI.WAVELENGTH, 0, 0, 0) } };
      return WI._u;
    },
  });
  function windDay(d) {
    const key = d.y + '-' + d.m + '-' + d.d;
    if (WI.day && WI.day.key === key) return WI.day;
    const r = U.rng('wind:' + key), v = md(d);
    // prevailing: SW monsoon (blowing towards ENE), NE winter wind (towards SW), hot NW summer wind (towards SE)
    let dir, base, gusty;
    if (v >= 601 && v <= 930) { dir = -0.35; base = 0.38; gusty = 0.75; }
    else if (v >= 1101 || v <= 215) { dir = 2.45; base = 0.22; gusty = 0.35; }
    else if (v >= 301 && v <= 531) { dir = 0.75; base = 0.3; gusty = 0.6; }
    else { dir = 0.3; base = 0.26; gusty = 0.5; }
    WI.day = { key, dir: dir + (r.next() - 0.5) * 1.1, base: base * (0.7 + r.next() * 0.6), gusty: clamp(gusty + (r.next() - 0.5) * 0.4, 0.1, 1), calmNight: v >= 1101 || v <= 228, ph: r.next() * 100 };
    return WI.day;
  }
  function windTick(dt) {
    WI.time = (WI.time + dt) % 10000;
    const D = windDay(A.date()), m = N.clock ? N.clock.minutes : 720, T = (N.time && N.time.real) || 0;
    // diurnal: still at dawn, strongest mid-afternoon, calm on winter nights
    const diurnal = 0.55 + 0.55 * smooth(540, 840, m) * (1 - smooth(1020, 1260, m)) - (D.calmNight ? 0.35 * (1 - smooth(420, 600, m)) * 1 : 0) - (D.calmNight ? 0.35 * smooth(1200, 1380, m) : 0);
    let s = D.base * Math.max(0.15, diurnal);
    // weather: gusty before and during rain, a monsoon storm blows hard
    const wt = W.target;
    s += 0.32 * Math.max(W.cloud * (1 - W.rain) * (wt.rain > 0 || wt.cloud > 0.4 ? 1 : 0.4), 0) + 0.18 * W.rain + 0.5 * W.storm;
    // slow natural breathing so the wind is never constant
    s *= 0.85 + 0.15 * Math.sin(T * 0.11 + D.ph) + 0.08 * Math.sin(T * 0.37 + D.ph * 2);
    let dir = D.dir + 0.25 * Math.sin(T * 0.013 + D.ph) + 0.12 * Math.sin(T * 0.051 + D.ph * 3) + W.storm * 0.2 * Math.sin(T * 0.21);
    let g = clamp(D.gusty + 0.3 * W.storm + 0.15 * W.cloud, 0, 1);
    if (windForced) { if (windForced.strength != null) s = windForced.strength; if (windForced.dir != null) dir = windForced.dir; if (windForced.gustiness != null) g = windForced.gustiness; }
    s = clamp(s, 0, 1.1);
    const k = dt ? 1 - Math.exp(-dt * 0.6) : 1;
    WI.strength += (s - WI.strength) * k;
    WI.gustiness += (g - WI.gustiness) * k;
    // turn smoothly through the short way round
    let dd = dir - WI.dir; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); WI.dir += dd * k;
    WI.dx = Math.cos(WI.dir); WI.dy = Math.sin(WI.dir);
    WI.speed = 40 + 110 * WI.strength;
    WI.front = (WI.front + dt * WI.speed) % (WI.WAVELENGTH * 64);
    if (WI._u) {
      WI._u.uWind.value.set(WI.dx, WI.dy, WI.strength, WI.gustiness);
      WI._u.uWindWave.value.set(1 / WI.WAVELENGTH, WI.front, WI.time, 0);
    }
  }

  /* ================================================================ system + settings */
  N.addSystem({
    id: 'atmosphere', order: 7, runIn: ['*'],
    init() {
      try {
        if (N.menus && N.menus.addSettingsRow) {
          N.menus.addSettingsRow({
            id: 'weather', label: 'Weather', type: 'seg', section: 'game',
            opts: [['auto', 'Seasonal'], ['clear', 'Clear'], ['rain', 'Rain'], ['storm', 'Storm']],
            get: () => setting, set: (v) => { W.setting = v; },
          });
        }
      } catch (e) { N.err('atmosphere.settings', e); }
    },
    reset() { W.dryFor = 99; nextStrike = 4; },
    update(dt) {
      const mode = N.state && N.state.mode;
      if (mode === 'boot') return;
      if (mode === 'paused' || mode === 'map' || mode === 'journal') dt = 0;
      tick(dt);
      windTick(dt);
      const day = N.clock ? N.clock.day : 0;
      if (day !== lastDay) { lastDay = day; }
    },
  });
  // keep N.wind / N.weather sane before the first update
  windTick(0);
})();
