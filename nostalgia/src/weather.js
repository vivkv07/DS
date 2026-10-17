/* NOSTALGIA — weather.js (atmosphere layer) — design/atmosphere.md "Rainy nights", ARCHITECTURE §6 / §22
 *
 * The weather in the TOP-DOWN 2D view, life in the rain and the weather's gameplay effects. The live
 * weather state (N.weather {rain, storm, mist, cloud, wet, flash}) and the wind (N.wind) come from
 * src/atmosphere.js; the 3D visuals are src/weather3d.js. Everything that is behaviour (umbrellas,
 * shelters, slippery brakes, pursuers, chai, paper boats) lives here and so applies in both views.
 *
 * 2D look (all procedural, pooled, nothing allocated per frame in the hot loops):
 *   ground layer   wet tint (multiply, N.weather.wet) · hidden potholes (heavy rain: their water
 *                  reads like the road sheen) · long streaky reflections of every glowing light
 *                  (sodium lamps, tube lights, shop / landmark lights) and of vehicle head + red tail
 *                  lamps on wet ROAD, toward the bottom of the screen, shimmering; each one lifts the
 *                  night mask a little so it survives the darkness · splash rings stuck to the world
 *                  (more on roads, few on grass, ripples on water and in wet potholes)
 *   sky layer      splashes on roofs · dripping eaves near the player · one 1/4-res overlay: the low
 *                  overcast grade (N.weather.cloud; blue-black and moody on rainy nights, lights punched
 *                  out so they bloom) + soft drifting fog banks (N.weather.mist; denser over water /
 *                  parks at dawn)
 *   light layer    misty halos round lights in rain and mist
 *   fx layer       lightning (blue-white flicker, the sky lit, a 3D bolt for strikes in view) · rain
 *                  streaks: 3 depth layers with parallax, slanted by N.wind, one stroke per layer
 *
 * Rain life (simulation, wraps traffic.js / vehicles.js from here, no edits there):
 *   pedestrians open umbrellas when the rain starts (mostly black), close them after; when it pours the
 *   ones without run for cover under shop awnings / bus shelters and wait it out; cyclists and scooter
 *   riders pull on plastic raincoats; autos roll their side covers down (TYPES.auto.draw wrapped);
 *   traffic slows (cruise via tr.persona; more in heavy rain and storms).
 * Gameplay:
 *   slippery brakes: T.brake scaled by road wetness (cycles / Scooty x0.62 = 1.6x the braking distance,
 *   other two-wheelers x0.74, autos / cars / heavies ~x0.85); vehicles.js' rain grip stays as is ·
 *   potholes hidden under water in heavy rain (2D) · the Chappal Meter's pursuers lose you sooner in heavy
 *   rain (N.settings.diff('unseenDrop' / 'sight') and N.wanted.TUNE.searchSecs scaled) · chai in the rain
 *   (shop:buy chai at an Irani cafe / chai bandi: bonus energy + a toast) · paper boats: on a quiet lane
 *   next to a wet pothole ACTION "Float a paper boat" launches one that drifts with the wind across the
 *   puddle and down the gutter; a little joy (+energy, toast, N.emit('paperboat'), N.flags.paper_boats).
 *
 * API  N.weather2d = {
 *   TUNE, stats {ms (last frame, all 2D draw), drops, splashes, refl, halos, banks, sheltered, umbrellas,
 *   coats, boats}, enabled (false: no 2D drawing), slick (0..1 road slipperiness now),
 *   brakeMul(type | T) -> factor applied to T.brake now, trafficMul (cruise factor now),
 *   wantedMul {unseen, sight, search}, boat (the paper boat afloat | null), boatSpot() -> pothole | null
 *   (where ACTION would offer the boat), launchBoat(pothole?) -> boat | null, hiddenPotholes (0..1) }
 * Events: 'paperboat' {x, y, secs, dist, done}, 'rain:shelter' {ped, shelter}, 'rain:chai' {place, bonus}.
 * Hooks into other files: none (wraps N.vehicles.TYPES.*.draw for autos, N.settings.diff, listens to
 *   shop:buy, reads N.traffic.peds / vehicles and N.world structures / potholes / lamps).
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.weather) return;
  const U = N.util;
  const WX = N.weather;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const rnd = Math.random;
  const rr = (a, b) => a + rnd() * (b - a);
  WX.draws2d = true; // seasons.js skips its simple 2D rain

  const TUNE = {
    // rain streak layers: density per 1000 px² at rain 1, streak length px, fall speed px/s, camera parallax, alpha
    drops: [
      { dens: 0.85, len: 5, speed: 340, par: 1.05, a: 0.36 },
      { dens: 0.48, len: 8, speed: 480, par: 1.16, a: 0.52 },
      { dens: 0.16, len: 14, speed: 680, par: 1.38, a: 0.72 },
    ],
    maxDrops: 1600, lowMul: 0.62,
    splash: { alive: 230, life: 0.3, ripple: 0.95, roof: 0.28, maxSpawn: 48, potRate: 1.6 },
    wetTint: 0.5,            // multiply strength at full wetness
    refl: { lamp: 84, w: 5.2, alpha: 1.1, glare: 0.6, head: 30, tail: 20, maxV: 40 },
    halo: { alpha: 0.3, grow: 0.5, rain: 0.55, max: 140 },
    cloud: { day: 0.3, night: 0.5, storm: 0.1 },
    mist: { cell: 260, alpha: 0.8, haze: 0.07, drift: 7 },
    // braking-force multipliers at full slipperiness (1 - k): pedal cycles / Scooty, other bikes, autos, cars, heavies
    brake: { pedal: 0.38, scooty: 0.38, bike: 0.26, auto: 0.16, car: 0.14, heavy: 0.12 },
    traffic: { light: 0.1, heavy: 0.12, storm: 0.05, wet: 0.04 },
    wanted: { unseen: 0.42, sight: 0.25, search: 0.45 },
    chai: { irani: 12, bandi: 7, minRain: 0.08 },
    boat: { r: 16, secs: 9, speed: 9, wind: 16, cd: 6, energy: 6 },
    shelter: { pour: 0.55, release: 0.32, r: 120, umbrella: 0.7, kidUmbrella: 0.25 },
  };
  const API = (N.weather2d = {
    TUNE, enabled: true, slick: 0, trafficMul: 1, hiddenPotholes: 0, boat: null,
    wantedMul: { unseen: 1, sight: 1, search: 1 },
    stats: { ms: 0, drops: 0, splashes: 0, refl: 0, halos: 0, banks: 0, sheltered: 0, umbrellas: 0, coats: 0, boats: 0 },
    brakeMul(t) { const T = typeof t === 'string' ? N.vehicles && N.vehicles.TYPES[t] : t; return T ? brakeFactor(T) : 1; },
    boatSpot() { return boatSpot(); },
    launchBoat(p) { return launchBoat(p || boatSpot()); },
  });

  /* ================================================================ frame state */
  let R = null, S = null;
  let rain = 0, wet = 0, cloud = 0, mist = 0, storm = 0, night = 0, fd = 0, low = false;
  let lastT = 0, fdt = 0.016, lastCamX = NaN, lastCamY = NaN, camDX = 0, camDY = 0, drawMs = 0;
  const isRoadish = (s) => s === S.ROAD || s === S.BRIDGE || s === S.PLAZA;

  function flashDisplay(f) {
    // a lightning flash flickers: bright, dip, bright again, then fades (W.flash decays 4.5/s)
    if (f <= 0.01) return 0;
    if (f > 0.82) return 1;
    if (f > 0.66) return 0.32;
    if (f > 0.5) return 0.9;
    return clamp(f * 1.5, 0, 0.75);
  }

  /* ================================================================ sprites (built once) */
  function canvas(w, h) { return N.render.makeCanvas(w, h); }
  function rgbOf(c) {
    try { if (typeof c === 'string' && c[0] === '#' && (c.length === 7 || c.length === 4)) return U.hexToRgb(c); } catch (e) { /* fall through */ }
    return [255, 216, 144];
  }
  // per light colour: 3 shimmering streak variants + a halo + nothing else; index by colour string
  const colIdx = new Map(), colSpr = [];
  function colorIndex(c) {
    let i = colIdx.get(c);
    if (i !== undefined) return i;
    if (colSpr.length >= 48) return 0; // a pathological number of colours: reuse the first
    i = colSpr.length;
    colIdx.set(c, i);
    colSpr.push(makeColorSprites(rgbOf(c)));
    return i;
  }
  function makeColorSprites(rgb) {
    const [r, g, b] = rgb;
    // brighten towards white a touch (the hot core of a reflection)
    const cr = Math.min(255, r + 30), cg = Math.min(255, g + 30), cb = Math.min(255, b + 30);
    const streaks = [];
    for (let v = 0; v < 3; v++) {
      const W = 12, H = 72, c = canvas(W, H), x = c.getContext('2d');
      const rng = U.rng('wxstreak' + v + ':' + r + g + b);
      // broken horizontal dashes (rain-rippled asphalt), brightest at the top, fading down
      for (let y = 0; y < H; y += 1) {
        const t = y / H;
        const fade = Math.pow(1 - t, 1.35) * (0.55 + 0.45 * Math.sin(t * 9 + v * 2.1) * Math.sin(t * 23 + v));
        if (rng.next() < 0.22 + t * 0.35) continue; // gaps between ripples
        const half = (W / 2) * (0.35 + 0.65 * (1 - t * 0.5)) * (0.55 + 0.45 * rng.next());
        const off = (rng.next() - 0.5) * 2.2 * t;
        const gr = x.createLinearGradient(W / 2 - half + off, 0, W / 2 + half + off, 0);
        const a = clamp(Math.abs(fade), 0, 1);
        gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0)');
        gr.addColorStop(0.5, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a.toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
        x.fillStyle = gr;
        x.fillRect(W / 2 - half + off, y, half * 2, 1);
      }
      streaks.push(c);
    }
    const halo = canvas(64, 64), hx = halo.getContext('2d');
    const gr = hx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',0.5)');
    gr.addColorStop(0.25, 'rgba(' + r + ',' + g + ',' + b + ',0.28)');
    gr.addColorStop(0.6, 'rgba(' + r + ',' + g + ',' + b + ',0.08)');
    gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    hx.fillStyle = gr; hx.fillRect(0, 0, 64, 64);
    return { streaks, halo };
  }
  let maskSpr = null, fogSpr = null, fogNight = null;
  function buildSprites() {
    if (maskSpr) return;
    maskSpr = canvas(64, 64);
    const m = maskSpr.getContext('2d'), mg = m.createRadialGradient(32, 32, 0, 32, 32, 32);
    mg.addColorStop(0, 'rgba(255,255,255,1)'); mg.addColorStop(0.5, 'rgba(255,255,255,0.7)'); mg.addColorStop(1, 'rgba(255,255,255,0)');
    m.fillStyle = mg; m.fillRect(0, 0, 64, 64);
    fogSpr = fogBlob('238,242,246', 'wxfog');
    fogNight = fogBlob('92,104,128', 'wxfog');
  }
  function fogBlob(rgb, seed) {
    const c = canvas(128, 128), g = c.getContext('2d'), rng = U.rng(seed);
    for (let i = 0; i < 14; i++) {
      const a = rng.next() * TAU, d = rng.next() * 30, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d * 0.7, r = 22 + rng.next() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(' + rgb + ',0.32)'); gr.addColorStop(0.6, 'rgba(' + rgb + ',0.12)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    return c;
  }

  /* ================================================================ rain streaks (fx layer) */
  const NL = TUNE.drops.length;
  const DX = [], DY = [], DS = [];
  for (let l = 0; l < NL; l++) {
    DX.push(new Float32Array(TUNE.maxDrops)); DY.push(new Float32Array(TUNE.maxDrops)); DS.push(new Float32Array(TUNE.maxDrops));
    for (let i = 0; i < TUNE.maxDrops; i++) { DX[l][i] = rnd(); DY[l][i] = rnd(); DS[l][i] = 0.75 + rnd() * 0.5; }
  }
  function drawRain(ctx) {
    if (rain < 0.01) { API.stats.drops = 0; return; }
    const W = R.W, H = R.H, area = (W * H) / 1000;
    const wi = N.wind || { dx: 1, dy: 0, strength: 0.3 }, ws = clamp(wi.strength || 0, 0, 1.1);
    // slant: a little to the right by default, leaning with the wind, harder in a storm
    let ux = 0.16 + wi.dx * ws * 0.95, uy = 1 + wi.dy * ws * 0.35;
    if (uy < 0.55) uy = 0.55;
    const ul = Math.hypot(ux, uy); ux /= ul; uy /= ul;
    const dens = rain * (low ? TUNE.lowMul : 1) * (0.25 + 0.75 * rain);
    const dt = fdt, nightK = 1 - 0.2 * night;
    let total = 0;
    ctx.lineWidth = 1;
    for (let l = 0; l < NL; l++) {
      const L = TUNE.drops[l];
      const n = Math.min(TUNE.maxDrops, Math.round(L.dens * area * dens));
      if (n <= 0) continue;
      total += n;
      const len = L.len * (0.7 + 0.3 * rain + 0.35 * storm), sp = L.speed * (0.8 + 0.3 * rain);
      const mx = -camDX * L.par, my = -camDY * L.par;
      const lx = ux * len, ly = uy * len, vx = ux * sp * dt, vy = uy * sp * dt;
      const X = DX[l], Y = DY[l], Sp = DS[l];
      const iw = 1 / W, ih = 1 / H;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const s = Sp[i];
        let x = X[i] + (vx * s + mx) * iw, y = Y[i] + (vy * s + my) * ih;
        if (y > 1) { y -= 1; x = rnd(); } else if (y < 0) y += 1;
        if (x > 1) x -= 1; else if (x < 0) x += 1;
        X[i] = x; Y[i] = y;
        const px = x * W, py = y * H;
        ctx.moveTo(px, py); ctx.lineTo(px + lx * s, py + ly * s);
      }
      const a = L.a * (0.55 + 0.45 * rain) * nightK + fd * 0.3;
      ctx.strokeStyle = night > 0.5 ? 'rgba(160,182,228,' + a.toFixed(3) + ')' : 'rgba(226,236,252,' + a.toFixed(3) + ')';
      ctx.stroke();
    }
    API.stats.drops = total;
  }

  /* ================================================================ splashes (world space) */
  const MAXS = 420;
  const SX = new Float32Array(MAXS), SY = new Float32Array(MAXS), SH = new Float32Array(MAXS), ST = new Float32Array(MAXS), SL = new Float32Array(MAXS), SR = new Float32Array(MAXS);
  const SK = new Uint8Array(MAXS); // 0 ground, 1 water / puddle ripple, 2 roof
  let nS = 0, spawnAcc = 0, potAcc = 0;
  function addSplash(x, y, h, kind, life, rmax) {
    if (nS >= MAXS) return;
    SX[nS] = x; SY[nS] = y; SH[nS] = h; SK[nS] = kind; ST[nS] = 0; SL[nS] = life; SR[nS] = rmax; nS++;
  }
  let qx = 0, qy = 0, qh = -1;
  function roofProbe(s) {
    if (qh >= 0 || s.t !== 'bldg') return;
    if (qx >= s.x0 && qx <= s.x1 && qy >= s.y0 && qy <= s.y1) qh = s.h;
  }
  // wet potholes in view (refreshed a few times a second)
  const potBuf = [], wetPots = [];
  let potT = 0;
  function refreshPots() {
    wetPots.length = 0;
    const PH = N.world && N.world.potholes;
    if (!PH || !PH.ready || !PH.query) return;
    const v = R.view;
    potBuf.length = 0;
    try { PH.query(v.x0 - 10, v.y0 - 10, v.x1 + 10, v.y1 + 10, potBuf); } catch (e) { return; }
    for (let i = 0; i < potBuf.length; i++) if (potBuf[i].wet) wetPots.push(potBuf[i]);
  }
  function stepSplashes(dt) {
    // age + remove
    for (let i = nS - 1; i >= 0; i--) {
      ST[i] += dt;
      if (ST[i] >= SL[i]) {
        nS--;
        if (i !== nS) { SX[i] = SX[nS]; SY[i] = SY[nS]; SH[i] = SH[nS]; SK[i] = SK[nS]; ST[i] = ST[nS]; SL[i] = SL[nS]; SR[i] = SR[nS]; }
      }
    }
    if (rain < 0.03) return;
    const W = N.world, v = R.view, T = TUNE.splash;
    const area = ((v.x1 - v.x0) * (v.y1 - v.y0)) / 520000; // ~1 for the desktop view at zoom 1
    const alive = T.alive * rain * clamp(area, 0.4, 2.2) * (low ? 0.65 : 1);
    spawnAcc += (alive / T.life) * dt;
    let n = Math.min(T.maxSpawn, spawnAcc | 0);
    spawnAcc -= n;
    if (spawnAcc > 4) spawnAcc = 4;
    const w = v.x1 - v.x0, h = v.y1 - v.y0;
    for (let k = 0; k < n * 2 && n > 0; k++) { // rejection sampling: two tries per wanted splash
      const x = v.x0 + rnd() * w, y = v.y0 + rnd() * h;
      const s = W.surfaceAt(x, y);
      if (s === S.ROAD || s === S.BRIDGE || s === S.PLAZA || s === S.FOOTPATH) { addSplash(x, y, 0, 0, T.life * rr(0.8, 1.2), 0); n--; }
      else if (s === S.WATER) { if (rnd() < 0.5) { addSplash(x, y, 0, 1, T.ripple * rr(0.8, 1.2), rr(3, 5.5)); n--; } }
      else if (s === S.SOLID) {
        if (rnd() < 0.8) { qx = x; qy = y; qh = -1; W.queryStructures(x, y, x + 0.01, y + 0.01, roofProbe); if (qh > 0) { addSplash(x, y, qh + 0.4, 2, T.roof * rr(0.8, 1.2), 0); n--; } }
      } else if (s === S.GRASS || s === S.GROUND || s === S.SAND) { if (rnd() < 0.22) { addSplash(x, y, 0, 0, T.life * 0.8, 0); n--; } }
    }
    // ripples in the wet potholes / puddles in view
    if (wetPots.length) {
      potAcc += wetPots.length * T.potRate * rain * dt;
      let m = Math.min(24, potAcc | 0); potAcc -= m; if (potAcc > 3) potAcc = 3;
      while (m-- > 0) {
        const p = wetPots[(rnd() * wetPots.length) | 0];
        const rm = Math.max(1.2, Math.min(p.rx, p.ry) * 0.8);
        addSplash(p.x + (rnd() - 0.5) * p.rx * 0.8, p.y + (rnd() - 0.5) * p.ry * 0.8, 0, 1, T.ripple * rr(0.6, 0.9), rm);
      }
    }
  }
  function drawGroundSplashes(ctx) {
    if (!nS) return;
    const Z = R.Z, k = Z;
    const night5 = night > 0.5;
    // young rings, old rings, ripples, centre dots — four batched paths
    for (let pass = 0; pass < 3; pass++) {
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < nS; i++) {
        const kind = SK[i];
        if (kind === 2) continue;
        const a = ST[i] / SL[i];
        if (pass === 0 && (kind !== 0 || a >= 0.5)) continue;
        if (pass === 1 && (kind !== 0 || a < 0.5)) continue;
        if (pass === 2 && kind !== 1) continue;
        const X = R.sx(SX[i], k), Y = R.sy(SY[i], k);
        const r = kind === 1 ? (0.5 + SR[i] * a) * Z : (0.6 + 2.2 * a) * Z;
        if (r < 0.75) { ctx.rect(X - 0.5, Y - 0.5, 1, 1); any = true; continue; }
        ctx.moveTo(X + r, Y); ctx.arc(X, Y, r, 0, TAU);
        if (kind === 1 && a < 0.45 && r > 2) { const r2 = r * 0.5; ctx.moveTo(X + r2, Y); ctx.arc(X, Y, r2, 0, TAU); }
        any = true;
      }
      if (!any) continue;
      ctx.lineWidth = pass === 2 ? 0.7 : 0.8;
      ctx.strokeStyle = pass === 0 ? (night5 ? 'rgba(200,216,246,0.85)' : 'rgba(240,246,255,0.85)')
        : pass === 1 ? (night5 ? 'rgba(180,200,234,0.42)' : 'rgba(226,236,250,0.42)')
          : (night5 ? 'rgba(180,200,234,0.55)' : 'rgba(232,240,252,0.6)');
      ctx.stroke();
    }
    API.stats.splashes = nS;
  }
  function drawRoofSplashes(ctx) {
    let any = false;
    ctx.beginPath();
    for (let i = 0; i < nS; i++) {
      if (SK[i] !== 2) continue;
      const a = ST[i] / SL[i], k = R.k(SH[i]);
      const X = R.sx(SX[i], k), Y = R.sy(SY[i], k), r = (0.45 + 1.6 * a) * k;
      if (r < 0.75) ctx.rect(X - 0.5, Y - 0.5, 1, 1); else { ctx.moveTo(X + r, Y); ctx.arc(X, Y, r, 0, TAU); }
      any = true;
    }
    if (!any) return;
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = night > 0.5 ? 'rgba(180,198,230,0.45)' : 'rgba(236,242,252,0.5)';
    ctx.stroke();
  }

  /* ================================================================ wet ground, hidden potholes */
  const tintCache = { key: -1, color: '#000' };
  function drawWetTint(ctx) {
    if (wet < 0.02) return;
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = TUNE.wetTint * wet;
    ctx.fillStyle = night > 0.5 ? '#7a86a6' : '#8c96aa';
    ctx.fillRect(0, 0, R.W, R.H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  const ROADCOL = { arterial: '#47464c', street: '#55535a', bund: '#4c4b52', bridge: '#5d5a5c', lane: '#8a7c6a' };
  const tinted = {};
  function tintedRoad(kind) {
    const key = Math.round(wet * 20) * 2 + (night > 0.5 ? 1 : 0);
    let t = tinted[kind];
    if (!t) t = tinted[kind] = { key: -1, c: '#000' };
    if (t.key !== key) {
      t.key = key;
      const c = rgbOf(ROADCOL[kind] || ROADCOL.street), m = rgbOf(night > 0.5 ? '#7a86a6' : '#8c96aa'), a = TUNE.wetTint * wet;
      const ch = (i) => Math.round(c[i] * (1 - a) + (c[i] * m[i] / 255) * a);
      t.c = U.rgbToHex ? U.rgbToHex(ch(0), ch(1), ch(2)) : 'rgb(' + ch(0) + ',' + ch(1) + ',' + ch(2) + ')';
    }
    return t.c;
  }
  const HIDE_KINDS = ['arterial', 'street', 'bund', 'lane'];
  function drawHiddenPotholes(ctx) {
    const hide = API.hiddenPotholes;
    if (hide < 0.02 || !wetPots.length) return;
    const Z = R.Z;
    ctx.setTransform(Z, 0, 0, Z, R.sx(0, Z), R.sy(0, Z));
    for (let kk = 0; kk < HIDE_KINDS.length; kk++) {
      const kind = HIDE_KINDS[kk];
      let any = false;
      ctx.beginPath();
      for (let i = 0; i < wetPots.length; i++) {
        const p = wetPots[i];
        if ((p.kind === 'lane' ? 'lane' : p.kind === 'arterial' || p.kind === 'bund' ? p.kind : 'street') !== kind) continue;
        ctx.moveTo(p.x + p.rx * 1.05, p.y);
        ctx.ellipse(p.x, p.y, p.rx * 1.05, p.ry * 1.05, p.a || 0, 0, TAU);
        any = true;
      }
      if (!any) continue;
      ctx.globalAlpha = hide;
      ctx.fillStyle = tintedRoad(kind);
      ctx.fill();
    }
    // the rain-dimpled sheen on top, same as the road's
    ctx.globalAlpha = hide * 0.5;
    ctx.fillStyle = night > 0.5 ? 'rgba(120,140,180,0.35)' : 'rgba(200,214,232,0.3)';
    for (let i = 0; i < wetPots.length; i++) { const p = wetPots[i]; ctx.fillRect(p.x - p.rx * 0.5, p.y - 0.2, p.rx, 0.4); }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ================================================================ lights: snapshot, reflections, halos */
  const MAXL = 320;
  const LX = new Float32Array(MAXL), LY = new Float32Array(MAXL), LH = new Float32Array(MAXL), LR = new Float32Array(MAXL), LI = new Float32Array(MAXL);
  const LC = new Uint8Array(MAXL), LG = new Uint8Array(MAXL);
  let nLights = 0;
  // reflections drawn this frame (screen space), redrawn as glare on the light layer (after the night mask)
  const MAXR = 200;
  const RX = new Float32Array(MAXR), RY = new Float32Array(MAXR), RW = new Float32Array(MAXR), RL = new Float32Array(MAXR), RA = new Float32Array(MAXR);
  const RC = new Uint8Array(MAXR), RV = new Uint8Array(MAXR);
  let nR = 0;
  function refl(ctx, ci, vi, X, Y, w, len, a) {
    if (a < 0.01) return;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(colSpr[ci].streaks[vi], X, Y, w, len);
    if (nR < MAXR) { RX[nR] = X; RY[nR] = Y; RW[nR] = w; RL[nR] = len; RA[nR] = a; RC[nR] = ci; RV[nR] = vi; nR++; }
  }
  function drawGlare(ctx) {
    if (!nR) return;
    const g = TUNE.refl.glare * clamp(night * 1.2, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < nR; i++) {
      ctx.globalAlpha = clamp(RA[i] * g, 0, 1);
      ctx.drawImage(colSpr[RC[i]].streaks[RV[i]], RX[i], RY[i], RW[i], RL[i]);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  function snapshotLights() {
    const L = R.lights;
    nLights = 0;
    for (let i = 0; i < L.length && nLights < MAXL; i++) {
      const l = L[i];
      if (!l || !(isFinite(l.x) && isFinite(l.y))) continue;
      LX[nLights] = l.x; LY[nLights] = l.y; LH[nLights] = l.h || 0; LR[nLights] = l.r || 40;
      LI[nLights] = clamp(l.intensity == null ? 1 : l.intensity, 0, 1);
      LC[nLights] = colorIndex(l.color || '#ffb050'); LG[nLights] = l.glow === false ? 0 : 1;
      nLights++;
    }
  }
  function drawReflections(ctx) {
    nR = 0;
    snapshotLights();
    API.stats.refl = 0;
    const rf = TUNE.refl;
    const k0 = wet * smooth(0.04, 0.4, night) * (0.7 + 0.3 * rain);
    if (k0 < 0.03) return;
    const Z = R.Z, W = N.world, t = (N.time && N.time.real) || 0, v = R.view;
    const n0 = nLights;
    let count = 0;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n0; i++) {
      if (!LG[i]) continue; // headlight pools (glow:false) are ground light already
      const x = LX[i], y = LY[i];
      if (x < v.x0 - 30 || x > v.x1 + 30 || y < v.y0 - 90 || y > v.y1 + 10) continue;
      const s0 = W.surfaceAt(x, y + 4);
      if (!isRoadish(s0) && s0 !== S.FOOTPATH) continue;
      let lenW = rf.lamp * (0.6 + LR[i] * 0.006) * (0.75 + 0.25 * wet);
      const s1 = W.surfaceAt(x, y + lenW * 0.6);
      if (!isRoadish(s1)) { if (!isRoadish(s0)) continue; lenW *= 0.5; }
      const wW = (rf.w + LR[i] * 0.02) * Z, len = lenW * Z;
      const X = R.sx(x, Z), Y = R.sy(y, Z);
      const vi = ((t * 7 + x * 0.13 + y * 0.07) | 0) % 3;
      refl(ctx, LC[i], vi, X - wW / 2, Y - 2 * Z, wW, len, k0 * LI[i] * rf.alpha * (isRoadish(s0) ? 1 : 0.6));
      count++;
    }
    // vehicle head + tail lamps (the bulbs, not the pools)
    const list = N.vehicles && N.vehicles.list;
    if (list) {
      const head = colorIndex('#fff2c8'), tail = colorIndex('#ff3020');
      let nv = 0;
      for (let j = 0; j < list.length && nv < rf.maxV; j++) {
        const veh = list[j];
        if (!veh || !veh.alive) continue;
        const T = veh.T;
        if (!T || !T.lights || T.cls === 'boat') continue;
        if (veh.x < v.x0 - 40 || veh.x > v.x1 + 40 || veh.y < v.y0 - 40 || veh.y > v.y1 + 20) continue;
        if (!(veh.driver || veh.controller || veh.lightsOn)) continue;
        nv++;
        const c = Math.cos(veh.angle), s = Math.sin(veh.angle);
        const hw = T.cls === 'bike' || T.cls === 'auto' ? 0 : T.d / 2 - 2.4;
        const fx = veh.x + c * T.w / 2, fy = veh.y + s * T.w / 2, bx = veh.x - c * T.w / 2, by = veh.y - s * T.w / 2;
        const vi = ((t * 8 + j) | 0) % 3;
        const braking = veh.ctl && (veh.ctl.throttle < -0.1 || veh.ctl.brake || veh.ctl.handbrake);
        for (let side = hw ? -1 : 0; side <= (hw ? 1 : 0); side += 2) {
          // headlamp
          const hx = fx - s * hw * side, hy = fy + c * hw * side;
          refl(ctx, head, vi, R.sx(hx, Z) - 1.6 * Z, R.sy(hy, Z), 3.2 * Z, rf.head * Z, k0 * 0.85);
          if (T.pedal) continue;
          const tx = bx - s * hw * side, ty = by + c * hw * side;
          refl(ctx, tail, (vi + 1) % 3, R.sx(tx, Z) - 1.3 * Z, R.sy(ty, Z), 2.6 * Z, rf.tail * Z * (braking ? 1.3 : 1), k0 * (braking ? 1 : 0.75));
        }
        count++;
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    API.stats.refl = count;
  }
  function drawHalos(ctx) {
    API.stats.halos = 0;
    const m = Math.max(rain * TUNE.halo.rain, mist);
    if (m < 0.03 || night < 0.05 || !nLights) return;
    const W = R.W, H = R.H, hT = TUNE.halo;
    ctx.globalCompositeOperation = 'lighter';
    let n = 0;
    for (let i = 0; i < nLights && n < hT.max; i++) {
      if (!LG[i]) continue;
      const k = R.k(LH[i]);
      const X = R.sx(LX[i], k), Y = R.sy(LY[i], k), r = LR[i] * k * (0.9 + hT.grow * m);
      if (X + r < 0 || Y + r < 0 || X - r > W || Y - r > H) continue;
      ctx.globalAlpha = clamp(night * hT.alpha * m * LI[i], 0, 1);
      ctx.drawImage(colSpr[LC[i]].halo, X - r, Y - r, r * 2, r * 2);
      n++;
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    API.stats.halos = n;
  }

  /* ================================================================ overcast + mist overlay (sky layer, 1/4 res) */
  const DIV = 4;
  let ov = null, ovx = null;
  let driftX = 0, driftY = 0;
  const cloudCol = { key: -1, c: '' };
  function drawOverlay(ctx) {
    API.stats.banks = 0;
    const cT = TUNE.cloud;
    let A = cloud * (cT.day * (1 - night) + cT.night * night) + storm * cT.storm * cloud;
    A *= 1 - 0.9 * fd;
    const mistA = mist * (1 - 0.6 * fd);
    if (A < 0.01 && mistA < 0.02) return;
    const W = R.W, H = R.H, LW = Math.ceil(W / DIV), LHh = Math.ceil(H / DIV);
    if (!ov) { ov = canvas(LW, LHh); ovx = ov.getContext('2d'); }
    if (ov.width !== LW || ov.height !== LHh) { ov.width = LW; ov.height = LHh; }
    const g = ovx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, LW, LHh);
    if (A >= 0.01) {
      const key = Math.round(night * 16);
      if (cloudCol.key !== key) { cloudCol.key = key; cloudCol.c = U.mix('#2e3a4c', '#040914', night); }
      g.globalAlpha = clamp(A, 0, 0.85);
      g.fillStyle = cloudCol.c;
      g.fillRect(0, 0, LW, LHh);
      if (night > 0.05 && nLights) { // the lights stay lit (they bloom out of the gloom)
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < nLights; i++) {
          const k = R.k(LH[i]);
          const X = R.sx(LX[i], k) / DIV, Y = R.sy(LY[i], k) / DIV, r = (LR[i] * k * 0.9) / DIV;
          if (X + r < 0 || Y + r < 0 || X - r > LW || Y - r > LHh) continue;
          g.globalAlpha = LI[i] * 0.9;
          g.drawImage(maskSpr, X - r, Y - r, r * 2, r * 2);
        }
        g.globalCompositeOperation = 'source-over';
      }
    }
    if (mistA >= 0.02) drawMist(g, mistA, LW, LHh);
    g.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(ov, 0, 0, LW * DIV, LHh * DIV);
    ctx.imageSmoothingEnabled = false;
  }
  function drawMist(g, m, LW, LHh) {
    const mT = TUNE.mist, v = R.view, Z = R.Z, W = N.world;
    const minutes = (N.clock && N.clock.minutes) || 720;
    const dawn = 0.75 + 0.5 * smooth(270, 330, minutes) * (1 - smooth(420, 520, minutes));
    // a thin overall haze, then the banks
    g.globalAlpha = clamp(m * mT.haze * (1 + night * 0.2), 0, 0.5);
    g.fillStyle = night > 0.5 ? '#5a6478' : '#e6ebf0';
    g.fillRect(0, 0, LW, LHh);
    const spr = night > 0.5 ? fogNight : fogSpr;
    const C = mT.cell, M = C * 1.4;
    // banks live on a grid in a frame drifting with the wind
    const x0 = v.x0 - M - driftX, x1 = v.x1 + M - driftX, y0 = v.y0 - M - driftY, y1 = v.y1 + M - driftY;
    const i0 = Math.floor(x0 / C), i1 = Math.floor(x1 / C), j0 = Math.floor(y0 / C), j1 = Math.floor(y1 / C);
    let n = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const h = U.hash2(i * 1.37 + 11.1, j * 2.11 - 3.7);
      if (h > 0.78) continue;
      const h2 = U.hash2(i * 3.1 - 1.3, j * 0.73 + 9.2), h3 = U.hash2(i * 0.53 + 4.4, j * 4.9 - 0.2);
      const wx = i * C + h2 * C + driftX, wy = j * C + h3 * C + driftY;
      const s = W.surfaceAt(wx, wy);
      const dens = s === S.WATER ? 1.55 : s === S.GRASS || s === S.SAND ? 1.25 : s === S.SOLID ? 0.7 : 0.85;
      const size = C * (1.5 + h * 1.4) * Z;
      const X = R.sx(wx, Z) / DIV, Y = R.sy(wy, Z) / DIV, r = size / DIV;
      if (X + r < 0 || Y + r * 0.7 < 0 || X - r > LW || Y - r * 0.7 > LHh) continue;
      g.globalAlpha = clamp(m * mT.alpha * dens * dawn * (0.6 + 0.5 * h3), 0, 0.95);
      g.drawImage(spr, X - r, Y - r * 0.7, r * 2, r * 1.4);
      n++;
    }
    API.stats.banks = n;
  }

  /* ================================================================ lightning (fx layer) */
  const BOLT = new Float32Array(3 * 18), BR = new Float32Array(3 * 8);
  let boltN = 0, branchN = 0, boltAge = 9, boltX = 0, boltY = 0;
  N.on('weather:lightning', (s) => {
    try {
      if (!s || !R || !R.view) return;
      const v = R.view;
      boltAge = 0;
      boltX = s.x; boltY = s.y;
      if (s.x < v.x0 - 200 || s.x > v.x1 + 200 || s.y < v.y0 - 200 || s.y > v.y1 + 200) { boltN = 0; return; }
      // a jagged bolt from high above down to the strike point (projected with height: it leans in 3D)
      boltN = 18;
      let x = s.x + rr(-60, 60), y = s.y + rr(-60, 60);
      for (let i = 0; i < boltN; i++) {
        const f = i / (boltN - 1), h = 320 * (1 - f);
        x += (s.x - x) * (f * 0.5) + rr(-9, 9); y += (s.y - y) * (f * 0.5) + rr(-9, 9);
        if (i === boltN - 1) { x = s.x; y = s.y; }
        BOLT[i * 3] = x; BOLT[i * 3 + 1] = y; BOLT[i * 3 + 2] = h;
      }
      const b0 = 5 + ((rnd() * 5) | 0);
      branchN = 8;
      let bx = BOLT[b0 * 3], by = BOLT[b0 * 3 + 1], bh = BOLT[b0 * 3 + 2];
      const ba = rnd() * TAU;
      for (let i = 0; i < branchN; i++) { BR[i * 3] = bx; BR[i * 3 + 1] = by; BR[i * 3 + 2] = bh; bx += Math.cos(ba) * 7 + rr(-5, 5); by += Math.sin(ba) * 7 + rr(-5, 5); bh = Math.max(0, bh - rr(14, 26)); }
    } catch (e) { N.err('weather2d.bolt', e); }
  });
  function drawLightning(ctx) {
    const W = R.W, H = R.H;
    if (fd > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(fd * (0.55 + 0.45 * night), 0, 1);
      ctx.fillStyle = '#4a5a7e';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = clamp(fd * 0.32, 0, 1);
      ctx.fillStyle = '#e4ecff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    const age = boltAge;
    if (boltN && age >= 0 && age < 0.3) {
      const a = age < 0.06 ? 1 : age < 0.12 ? 0.35 : age < 0.2 ? 0.9 : 0.4;
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let i = 0; i < boltN; i++) {
          const k = R.k(BOLT[i * 3 + 2]), X = R.sx(BOLT[i * 3], k), Y = R.sy(BOLT[i * 3 + 1], k);
          if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        }
        for (let i = 0; i < branchN; i++) {
          const k = R.k(BR[i * 3 + 2]), X = R.sx(BR[i * 3], k), Y = R.sy(BR[i * 3 + 1], k);
          if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        }
        ctx.globalAlpha = a * (pass ? 1 : 0.35);
        ctx.lineWidth = pass ? 1.2 : 4;
        ctx.strokeStyle = pass ? '#ffffff' : '#9ab8ff';
        ctx.stroke();
      }
      // the strike lights the ground
      const k = R.Z, X = R.sx(boltX, k), Y = R.sy(boltY, k);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.8;
      ctx.drawImage(colSpr[colorIndex('#c8d8ff')].halo, X - 90 * k, Y - 90 * k, 180 * k, 180 * k);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ================================================================ dripping eaves near the player */
  const MAXD = 48;
  const EX = new Float32Array(MAXD), EY = new Float32Array(MAXD), EH = new Float32Array(MAXD), EP = new Float32Array(MAXD), ER = new Float32Array(MAXD);
  let nE = 0, eaveT = 0, eavePX = 0, eavePY = 0;
  function eaveProbe(s) {
    if (nE >= MAXD || s.t !== 'bldg' || !s.front) return;
    const aw = !!s.awning, h = aw ? 7.2 : s.h, dep = aw ? 5 : 0.6;
    const f = s.front;
    let ax, ay, bx, by;
    if (f === 'N') { ax = s.x + 1; bx = s.x + s.w - 1; ay = by = s.y - dep; }
    else if (f === 'S') { ax = s.x + 1; bx = s.x + s.w - 1; ay = by = s.y + s.d + dep; }
    else if (f === 'W') { ay = s.y + 1; by = s.y + s.d - 1; ax = bx = s.x - dep; }
    else { ay = s.y + 1; by = s.y + s.d - 1; ax = bx = s.x + s.w + dep; }
    const L = Math.hypot(bx - ax, by - ay), m = Math.min(6, Math.floor(L / 4));
    for (let i = 0; i < m && nE < MAXD; i++) {
      const t = (i + 0.5 + (U.hash2(s.x + i, s.y) - 0.5) * 0.6) / m;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (Math.hypot(x - eavePX, y - eavePY) > 75) continue;
      EX[nE] = x; EY[nE] = y; EH[nE] = h; EP[nE] = U.hash2(x * 0.7, y * 1.3); ER[nE] = 0.7 + U.hash2(y, x) * 0.9; nE++;
    }
  }
  function refreshEaves() {
    nE = 0;
    if (wet < 0.3 || !N.player) return;
    eavePX = N.player.x; eavePY = N.player.y;
    N.world.queryStructures(eavePX - 80, eavePY - 80, eavePX + 80, eavePY + 80, eaveProbe);
  }
  function drawEaves(ctx) {
    if (!nE) return;
    const t = (N.time && N.time.real) || 0, drip = 0.3 + 0.7 * Math.max(rain, (wet - 0.3) * 0.5);
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < nE; i++) {
      const per = 1.1 / (ER[i] * drip);
      const ph = (t / per + EP[i]) % 1;
      const fall = 0.32; // the last 32% of the period the drop falls
      if (ph < 1 - fall) { // hanging bead at the lip
        if (ph > 0.5) { const k = R.k(EH[i]); ctx.rect(R.sx(EX[i], k) - 0.5, R.sy(EY[i], k), 1, 1); any = true; }
        continue;
      }
      const f = (ph - (1 - fall)) / fall, h = EH[i] * (1 - f * f);
      const k0 = R.k(h), k1 = R.k(Math.min(EH[i], h + 1.6));
      const X0 = R.sx(EX[i], k0), Y0 = R.sy(EY[i], k0), X1 = R.sx(EX[i], k1), Y1 = R.sy(EY[i], k1);
      ctx.moveTo(X1, Y1); ctx.lineTo(X0, Y0 + 0.01);
      any = true;
      if (f > 0.9 && rnd() < 0.35 && nS < MAXS) addSplash(EX[i], EY[i], 0, 0, TUNE.splash.life, 0);
    }
    if (!any) return;
    ctx.lineWidth = 1;
    ctx.strokeStyle = night > 0.5 ? 'rgba(170,190,226,0.75)' : 'rgba(226,236,252,0.8)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.stroke();
    ctx.fill();
  }

  /* ================================================================ autos: side covers down */
  const coverTarget = () => (WX.rain > 0.06 ? 1 : 0);
  function drawAutoCovers(ctx, v) {
    const tgt = coverTarget();
    if (v._wxCov == null) v._wxCov = tgt;
    const now = (N.time && N.time.real) || 0;
    const dt = clamp(now - (v._wxCovT || now), 0, 0.1); v._wxCovT = now;
    v._wxCov += clamp(tgt - v._wxCov, -dt * 0.7, dt * 0.7);
    const cov = v._wxCov;
    if (cov < 0.03) return;
    const R2 = N.render, c = Math.cos(v.angle), s = Math.sin(v.angle);
    const z = v.z || 0, top = 9.6 + z, bot = top - 4.1 * cov;
    const xa = -10.3, xb = 4.4;
    for (let side = -1; side <= 1; side += 2) {
      const ly = 6.0 * side;
      // world endpoints of the flap's top edge
      const ax = v.x + c * xa - s * ly, ay = v.y + s * xa + c * ly, bx = v.x + c * xb - s * ly, by = v.y + s * xb + c * ly;
      // back-face cull: draw only the side facing the camera
      const nx = -s * side, ny = c * side, mx = (ax + bx) / 2, my = (ay + by) / 2;
      if (nx * (R2.camX - mx) + ny * (R2.camY - my) <= 0) continue;
      ctx.beginPath();
      N.draw.quadPath(ctx, ax, ay, bx, by, bot, top);
      ctx.fillStyle = '#17171b'; ctx.fill();
      // a clear plastic window and a sheen of rain on the rexine
      const wa = 0.3, wb = 0.62, wx0 = ax + (bx - ax) * wa, wy0 = ay + (by - ay) * wa, wx1 = ax + (bx - ax) * wb, wy1 = ay + (by - ay) * wb;
      if (cov > 0.6) {
        ctx.beginPath();
        N.draw.quadPath(ctx, wx0, wy0, wx1, wy1, top - 3.1 * cov, top - 0.8);
        ctx.fillStyle = 'rgba(130,150,170,0.55)'; ctx.fill();
      }
      ctx.beginPath();
      N.draw.quadPath(ctx, ax, ay, bx, by, bot, bot + 0.5);
      ctx.fillStyle = '#2c2c32'; ctx.fill();
    }
  }
  function wrapAutos() {
    const V = N.vehicles;
    if (!V || !V.TYPES) return;
    for (const id in V.TYPES) {
      const T = V.TYPES[id];
      if (!T || T.cls !== 'auto' || typeof T.draw !== 'function' || T.draw._wx) continue;
      const orig = T.draw;
      const wrapped = function (ctx, v) {
        orig.call(this, ctx, v);
        try { drawAutoCovers(ctx, v); } catch (e) { N.err('weather2d.autoCovers', e); }
      };
      wrapped._wx = true; wrapped._wxOrig = orig;
      T.draw = wrapped;
    }
  }

  /* ================================================================ paper boats */
  const boatOffer = { label: 'Float a paper boat', priority: 1, dist: 0, use: () => { launchBoat(boatSpot()); } };
  let boatCD = 0, spotT = 0, spotCache = null;
  const spotBuf = [];
  function boatSpot() {
    const p = N.player, PH = N.world && N.world.potholes;
    if (!p || p.vehicle || p.mode !== 'foot' || API.boat || !PH || !PH.ready || p.level) return null;
    if (wet < 0.25 && rain < 0.05) return null;
    const r = TUNE.boat.r;
    spotBuf.length = 0;
    try { PH.query(p.x - r, p.y - r, p.x + r, p.y + r, spotBuf); } catch (e) { return null; }
    let best = null, bd = r;
    for (const q of spotBuf) {
      if (!q.wet) continue;
      const quiet = q.kind === 'lane' || (q.kind === 'street' && (q.style === 'colony' || q.style === 'oldcity'));
      if (!quiet) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y) - q.r;
      if (d < bd) { bd = d; best = q; }
    }
    if (best) boatOffer.dist = Math.max(0, bd);
    return best;
  }
  function launchBoat(ph) {
    if (!ph || API.boat) return null;
    const p = N.player;
    const W = N.world, nr = W.nearestRoadPoint ? W.nearestRoadPoint(ph.x, ph.y) : null;
    const b = {
      x: ph.x - ph.rx * 0.5, y: ph.y, a: rnd() * TAU, t: 0, phase: 0, ph, dist: 0, gutter: null, nextQ: 0, done: false,
      sx: ph.x, sy: ph.y, dir: 1, sink: 0, roadW: nr && nr.road ? nr.road.w || 20 : 20, side: 1,
    };
    if (nr) {
      const ux = Math.cos(nr.angle), uy = Math.sin(nr.angle);
      const wi = N.wind || { dx: 1, dy: 0 };
      b.dir = ux * wi.dx + uy * wi.dy >= 0 ? 1 : -1;
      b.side = (ph.x - nr.x) * -uy + (ph.y - nr.y) * ux >= 0 ? 1 : -1;
      b.gutter = { x: nr.x, y: nr.y, ux, uy };
    }
    API.boat = b;
    API.stats.boats++;
    if (p) p.facing = Math.atan2(ph.y - p.y, ph.x - p.x);
    toast('You fold a notebook page into a *kaagaz ki naav* and set it on the puddle...', 2400, 'paperboat');
    try { if (N.audio && N.audio.sfx) N.audio.sfx('splash', { x: ph.x, y: ph.y, vol: 0.25 }); } catch (e) { /* optional */ }
    N.emit('paperboat', { x: ph.x, y: ph.y, launched: true, done: false, secs: 0, dist: 0 });
    return b;
  }
  function stepBoat(dt) {
    const b = API.boat;
    if (!b) return;
    const bt = TUNE.boat, W = N.world, wi = N.wind || { dx: 1, dy: 0, strength: 0.3 };
    b.t += dt; b.phase += dt;
    const sp = bt.speed + bt.wind * clamp(wi.strength || 0, 0, 1);
    if (b.t < 2.2 || !b.gutter) {
      // across the puddle with the wind, a slow spin
      const ph = b.ph, tx = ph.x + wi.dx * ph.rx * 0.9, ty = ph.y + wi.dy * ph.ry * 0.9;
      b.x += (tx - b.x) * Math.min(1, dt * 0.9); b.y += (ty - b.y) * Math.min(1, dt * 0.9);
      b.a += dt * 0.6;
    } else {
      // down the gutter: along the road, near its edge, re-reading the road every 0.3 s
      b.nextQ -= dt;
      if (b.nextQ <= 0 && W.nearestRoadPoint) {
        b.nextQ = 0.3;
        const nr = W.nearestRoadPoint(b.x, b.y);
        if (nr && nr.dist < 40) {
          let ux = Math.cos(nr.angle), uy = Math.sin(nr.angle);
          if (ux * b.gutter.ux + uy * b.gutter.uy < 0) { ux = -ux; uy = -uy; }
          b.gutter.x = nr.x; b.gutter.y = nr.y; b.gutter.ux = ux; b.gutter.uy = uy; b.roadW = (nr.road && nr.road.w) || b.roadW;
        }
      }
      const g = b.gutter, off = Math.max(2, b.roadW / 2 - 2.2) * b.side;
      const nx = -g.uy, ny = g.ux;
      const along = (b.x - g.x) * g.ux + (b.y - g.y) * g.uy;
      const tx = g.x + g.ux * (along + b.dir * sp * dt * 6) + nx * off, ty = g.y + g.uy * (along + b.dir * sp * dt * 6) + ny * off;
      const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1;
      const mv = Math.min(d, sp * dt);
      const ox = b.x, oy = b.y;
      b.x += (dx / d) * mv; b.y += (dy / d) * mv;
      b.dist += Math.hypot(b.x - ox, b.y - oy);
      const want = Math.atan2(dy, dx);
      b.a += U.angleDiff(b.a, want) * Math.min(1, dt * 3) + Math.sin(b.t * 3.1) * dt * 0.8;
      const s = W.surfaceAt(b.x, b.y);
      if (s !== S.ROAD && s !== S.BRIDGE && s !== S.FOOTPATH) b.sink += dt * 1.2;
    }
    if (rain > 0.6) b.sink += dt * 0.04; // a downpour soaks it
    const p = N.player, far = p ? Math.hypot(p.x - b.x, p.y - b.y) : 0;
    if (b.t > bt.secs || b.sink > 1 || far > 260) finishBoat(b, far > 260);
  }
  function finishBoat(b, lost) {
    API.boat = null;
    boatCD = TUNE.boat.cd;
    const p = N.player;
    if (!lost) {
      const good = b.sink <= 1;
      const e = good ? TUNE.boat.energy : Math.round(TUNE.boat.energy / 2);
      try { if (p && p.feed) p.feed(0, { energy: e, tummy: 0, quiet: true }); } catch (err) { /* player optional */ }
      if (N.flags) N.flags.paper_boats = (N.flags.paper_boats | 0) + 1;
      toast(good ? 'Your paper boat sailed ' + Math.round(b.dist * 1.6) + ' m down the gutter! *Waah!* Energy +' + e : 'The paper boat got soggy and sank. Still worth it. Energy +' + e, 2800, 'paperboat');
    }
    N.emit('paperboat', { x: b.x, y: b.y, secs: b.t, dist: b.dist, done: !lost, lost: !!lost });
  }
  function drawBoat(ctx) {
    const b = API.boat;
    if (!b) return;
    const bob = Math.sin(b.phase * 5) * 0.25, sink = clamp(b.sink, 0, 1);
    N.draw.sprite(b.x, b.y, b.a + Math.sin(b.phase * 2.3) * 0.15, 0.2 + bob * 0.2, (g) => {
      g.globalAlpha = 1 - sink * 0.6;
      // its shadow on the water, the folded hull (lit half, shaded half), the sail ridge, a line of notebook ink
      g.fillStyle = 'rgba(16,20,36,0.35)'; g.beginPath(); g.ellipse(0.5, 0.8, 4.6, 2.4, 0, 0, TAU); g.fill();
      g.fillStyle = '#f7f5ee';
      g.beginPath(); g.moveTo(4.2, 0); g.lineTo(2.3, -1.8); g.lineTo(-2.3, -1.8); g.lineTo(-4.2, 0); g.lineTo(-2.3, 1.8); g.lineTo(2.3, 1.8); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(70,70,84,0.55)'; g.lineWidth = 0.35; g.stroke();
      g.fillStyle = '#c9c6ba';
      g.beginPath(); g.moveTo(4.2, 0); g.lineTo(2.3, 1.8); g.lineTo(-2.3, 1.8); g.lineTo(-4.2, 0); g.closePath(); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(-2.6, 0); g.lineTo(0, -1.0); g.lineTo(2.6, 0); g.closePath(); g.fill();
      g.strokeStyle = '#8a8880'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(-2.6, 0); g.lineTo(2.6, 0); g.stroke();
      g.fillStyle = 'rgba(40,60,150,0.7)'; g.fillRect(-1.8, 0.9, 3.2, 0.3);
      g.globalAlpha = 1;
    });
  }

  /* ================================================================ rain life: umbrellas, shelters, raincoats, traffic */
  const UMB = ['#141418', '#141418', '#141418', '#1a1a22', '#2a2a6a', '#6a1a2a', '#2a5a3a'];
  const COATS = ['#2a4a8a', '#c8a020', '#3a6a3a', '#8a2a3a', '#1c1c22', '#5a3a7a', '#3a7a9a'];
  const coatCache = new WeakMap();
  function coatLook(look) {
    let c = coatCache.get(look);
    if (c) return c;
    const coat = COATS[(U.strHash(String(look.shirt || '') + (look.skin || '')) >>> 0) % COATS.length];
    c = Object.assign({}, look, { shirt: coat, stripes: null, tie: null, bag: null, dupatta: null, hair: U.shade(coat, 0.8), cap: null });
    if (c.kind === 'uncle' || c.kind === 'lungi' || c.kind === 'police') c.kind = 'man';
    c._wxCoat = true;
    coatCache.set(look, c);
    return c;
  }
  let busStops = null;
  function bus() {
    if (busStops) return busStops;
    busStops = [];
    try {
      const L = (N.world && N.world.data && N.world.data.landmarks) || (N.WORLD_DATA && N.WORLD_DATA.landmarks) || [];
      for (const lm of L) {
        if (lm.draw !== 'bus_stop') continue;
        const along = (lm.w || 32) >= (lm.d || 10);
        const f = lm.face || 's';
        const ox = f === 'e' ? 1 : f === 'w' ? -1 : 0, oy = f === 's' ? 1 : f === 'n' ? -1 : 0;
        const slots = [];
        for (let i = 0; i < 6; i++) {
          const u = (i - 2.5) * 4.6;
          let x = lm.x + (along ? u : 0) + ox * ((along ? lm.d : lm.w) * 0.1), y = lm.y + (along ? 0 : u) + oy * ((along ? lm.d : lm.w) * 0.1);
          if (!N.world.isWalkable(x, y)) { x = lm.x + (along ? u : 0) + ox * ((along ? lm.d : lm.w) / 2 + 3); y = lm.y + (along ? 0 : u) + oy * ((along ? lm.d : lm.w) / 2 + 3); }
          if (N.world.isWalkable(x, y)) slots.push({ x, y, face: Math.atan2(oy, ox) });
        }
        if (slots.length) busStops.push({ id: lm.id, x: lm.x, y: lm.y, slots, used: 0 });
      }
    } catch (e) { N.err('weather2d.busStops', e); }
    return busStops;
  }
  N.on('world:built', () => { busStops = null; });
  const shelterUse = new Map(); // shelter key (bldg object / bus stop) -> occupied slot bits
  let shQX = 0, shQY = 0, shBest = null, shBD = 0, shSlot = 0, shFace = 0, shPX = 0, shPY = 0;
  function awningProbe(s) {
    if (s.t !== 'bldg' || !s.awning || !s.front) return;
    const f = s.front, L = f === 'N' || f === 'S' ? s.w : s.d;
    const n = Math.max(1, Math.floor((L - 2) / 5));
    const used = shelterUse.get(s) || 0;
    for (let i = 0; i < n && i < 30; i++) {
      if (used & (1 << i)) continue;
      const u = 1 + (i + 0.5) * ((L - 2) / n);
      let x, y, face;
      if (f === 'N') { x = s.x + u; y = s.y - 2.6; face = -Math.PI / 2; }
      else if (f === 'S') { x = s.x + u; y = s.y + s.d + 2.6; face = Math.PI / 2; }
      else if (f === 'W') { x = s.x - 2.6; y = s.y + u; face = Math.PI; }
      else { x = s.x + s.w + 2.6; y = s.y + u; face = 0; }
      const d = Math.hypot(x - shQX, y - shQY);
      if (d >= shBD) continue;
      if (!N.world.isWalkable(x, y)) continue;
      shBD = d; shBest = s; shSlot = i; shFace = face; shPX = x; shPY = y;
    }
  }
  function findShelter(p) {
    shQX = p.x; shQY = p.y; shBest = null; shBD = TUNE.shelter.r;
    N.world.queryStructures(p.x - shBD, p.y - shBD, p.x + shBD, p.y + shBD, awningProbe);
    for (const b of bus()) {
      if (Math.abs(b.x - p.x) > shBD + 20 || Math.abs(b.y - p.y) > shBD + 20) continue;
      const used = shelterUse.get(b) || 0;
      for (let i = 0; i < b.slots.length; i++) {
        if (used & (1 << i)) continue;
        const q = b.slots[i], d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < shBD) { shBD = d; shBest = b; shSlot = i; shFace = q.face; shPX = q.x; shPY = q.y; }
      }
    }
    if (!shBest) return false;
    shelterUse.set(shBest, (shelterUse.get(shBest) || 0) | (1 << shSlot));
    p._wxSh = { s: shBest, slot: shSlot, x: shPX, y: shPY, face: shFace, t: 0, spd: p.spd, arrived: false };
    p.mode = 'goto'; p.tgt = { x: shPX, y: shPY }; p.spd = (p.spd || 40) * 1.9; p.idleT = 0;
    N.emit('rain:shelter', { ped: p, shelter: shBest });
    return true;
  }
  function releaseShelter(p, walk) {
    const sh = p._wxSh;
    if (!sh) return;
    const u = shelterUse.get(sh.s) || 0, nu = u & ~(1 << sh.slot);
    if (nu) shelterUse.set(sh.s, nu); else shelterUse.delete(sh.s);
    p._wxSh = null;
    if (p.alive === false) return;
    p.spd = sh.spd || p.spd;
    if (walk) { if (p.mode === 'stand' || p.mode === 'goto') { p.mode = p.zone ? 'wander' : 'walk'; p.w = null; p.tgt = null; p.faceA = null; } }
  }
  function pedEligible(p) {
    return p && p.alive !== false && !p.down && !p.hold && !p.spotter && !p.cart && !p.balloons && p.mode !== 'board' && !(p.zone && p.zone.still) && p.role !== 'vendor';
  }
  let rainHeldT = 0, dryHeldT = 0, lifeT = 0;
  function rainLife(dt) {
    lifeT += dt;
    if (lifeT < 0.25) return;
    const step = lifeT; lifeT = 0;
    const r = WX.rain, Tr = N.traffic;
    if (r > 0.08) { rainHeldT += step; dryHeldT = 0; } else { dryHeldT += step; rainHeldT = 0; }
    const now = (N.time && N.time.real) || 0;
    const ST = TUNE.shelter;
    let sheltered = 0, umbs = 0, coats = 0;
    if (Tr && Tr.peds) {
      const peds = Tr.peds;
      for (let i = 0; i < peds.length; i++) {
        const p = peds[i];
        if (!p) continue;
        if (p.alive === false) { if (p._wxSh) releaseShelter(p, false); continue; }
        // umbrellas: decide once per shower, open after a moment, close a while after it stops
        if (r > 0.08) {
          if (p._wxU === undefined) {
            const kid = p.look && (p.look.kind === 'kid' || p.look.kind === 'student');
            const want = !p.umb && rnd() < (kid ? ST.kidUmbrella : ST.umbrella) && pedEligible(p);
            p._wxU = want ? now + rr(0.4, 4.5) : 0;
          } else if (p._wxU > 0 && now >= p._wxU) { p.umb = UMB[(rnd() * UMB.length) | 0]; p._wxU = -1; }
        } else if (dryHeldT > 2 && p._wxU !== undefined) {
          if (p._wxSpd) { p.spd = p._wxSpd; p._wxSpd = null; }
          if (p._wxClose == null) p._wxClose = now + rr(3, 14);
          else if (now >= p._wxClose) { p.umb = null; p._wxU = undefined; p._wxClose = null; }
        } else if (dryHeldT > 2 && p.umb) { p._wxU = -1; } // spawned with one: close it later too
        if (p.umb) umbs++;
        // shelter: in a downpour the ones without an umbrella run for cover and wait it out
        const sh = p._wxSh;
        if (sh) {
          sh.t += step;
          if (!pedEligible(p)) { releaseShelter(p, false); continue; }
          const d = Math.hypot(p.x - sh.x, p.y - sh.y);
          if (d < 7) { if (p.mode !== 'stand') { p.mode = 'stand'; p.faceA = sh.face; p.tgt = null; p.spd = sh.spd; p.ttl = Math.max(p.ttl || 0, p.life + 60); } sh.arrived = true; }
          else if (!sh.arrived && p.mode !== 'goto') { p.mode = 'goto'; p.tgt = { x: sh.x, y: sh.y }; }
          if ((!sh.arrived && sh.t > 14) || (r < ST.release && rainHeldT === 0 && dryHeldT > 0) || (r < ST.release && sh.t > 25)) releaseShelter(p, true);
          else sheltered++;
          continue;
        }
        if (r > ST.pour && !p.umb && p._wxU === 0 && pedEligible(p) && (p.mode === 'walk' || p.mode === 'wander')) {
          // nowhere to shelter: hurry on, head down
          if (!findShelter(p)) { p._wxU = -2; p._wxSpd = p.spd; p.spd = (p.spd || 40) * 1.45; }
        }
      }
    }
    // cyclists / scooter riders in plastic raincoats; traffic slows in the rain
    const f = API.trafficMul;
    if (Tr && Tr.vehicles) {
      const vs = Tr.vehicles;
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        if (!v || !v.alive) continue;
        const d = v.driver;
        if (d && d.npc && d.look && v.T && v.T.cls === 'bike' && d !== N.player) {
          if (r > 0.1 && !d.look._wxCoat) { if (v._wxCoatAt == null) v._wxCoatAt = now + rr(0.5, 6); else if (now >= v._wxCoatAt) { d._wxDry = d.look; d.look = coatLook(d.look); v._wxCoatAt = null; } }
          else if (r < 0.03 && d.look._wxCoat && dryHeldT > 20) { d.look = d._wxDry || d.look; d._wxDry = null; }
          if (d.look._wxCoat) coats++;
        }
        const tr = v.tr;
        if (tr && !tr.pursuit && isFinite(tr.persona)) {
          if (tr._wxBase == null) { tr._wxBase = tr.persona; tr._wxF = 1; }
          if (Math.abs((tr._wxF || 1) - f) > 0.005) {
            const old = tr._wxF || 1;
            tr.persona = tr._wxBase * f;
            if (isFinite(tr.cruise) && tr.cruise > 0) tr.cruise *= f / old;
            tr._wxF = f;
          }
        }
      }
    }
    API.stats.sheltered = sheltered; API.stats.umbrellas = umbs; API.stats.coats = coats;
  }

  /* ================================================================ gameplay: brakes, pursuers */
  function brakeFactor(T) {
    if (!T || T.mode === 'boat' || T.cls === 'boat') return 1;
    const B = TUNE.brake, sl = API.slick;
    let k;
    if (T.pedal) k = B.pedal;
    else if (T.cls === 'bike') k = /scooty/.test(T.id || '') || T.bikeLook === 'scooty' ? B.scooty : B.bike;
    else if (T.cls === 'auto') k = B.auto;
    else if (T.cls === 'heavy') k = B.heavy;
    else k = B.car;
    return 1 - k * sl;
  }
  let slickApplied = -1;
  const brakeBase = new WeakMap(), brakeSet = new WeakMap();
  function applyBrakes() {
    const V = N.vehicles;
    if (!V || !V.TYPES) return;
    const sl = API.slick;
    const changed = Math.abs(sl - slickApplied) > 0.01;
    for (const id in V.TYPES) {
      const T = V.TYPES[id];
      if (!T || !isFinite(T.brake)) continue;
      // a new type (define() copies its base), or someone retuned it: its current brake is the dry value
      if (brakeSet.get(T) !== T.brake) brakeBase.set(T, T.brake);
      else if (!changed) continue;
      const b = brakeBase.get(T) * brakeFactor(T);
      T.brake = b; brakeSet.set(T, b);
    }
    if (changed) slickApplied = sl;
  }
  API.dryBrake = (id) => { const T = N.vehicles && N.vehicles.TYPES[id]; return T ? (brakeSet.get(T) === T.brake ? brakeBase.get(T) : T.brake) : null; };
  let diffWrapped = false, searchBase = null, chaseToast = false;
  function wrapWanted() {
    const st = N.settings;
    if (!diffWrapped && st && typeof st.diff === 'function') {
      const orig = st.diff;
      st.diff = function (key) {
        const v = orig.apply(this, arguments);
        if (key === 'unseenDrop' && typeof v === 'number') return v * API.wantedMul.unseen;
        if (key === 'sight' && typeof v === 'number') return v * API.wantedMul.sight;
        return v;
      };
      st.diff._wxOrig = orig;
      diffWrapped = true;
    }
  }
  function updateWanted() {
    const heavy = smooth(0.42, 0.9, WX.rain), wm = API.wantedMul, T = TUNE.wanted;
    wm.unseen = 1 - T.unseen * heavy; wm.sight = 1 - T.sight * heavy; wm.search = 1 - T.search * heavy;
    const Wd = N.wanted;
    if (!Wd || !Wd.TUNE) return;
    if (searchBase == null) searchBase = Wd.TUNE.searchSecs;
    if (isFinite(searchBase)) Wd.TUNE.searchSecs = searchBase * wm.search;
    if (!diffWrapped) { // no settings module: scale the fallback TUNE value instead
      if (Wd.TUNE._wxUnseen == null) Wd.TUNE._wxUnseen = Wd.TUNE.unseenDrop;
      Wd.TUNE.unseenDrop = Wd.TUNE._wxUnseen * wm.unseen;
    }
    if (Wd.level > 0 && heavy > 0.5 && !Wd.seen) {
      if (!chaseToast) { chaseToast = true; toast('The rain is coming down in sheets. They can hardly see you!', 2400, 'rainchase'); }
    } else if (Wd.level === 0) chaseToast = false;
  }

  /* ================================================================ chai in the rain */
  N.on('shop:buy', (d) => {
    try {
      if (!d || !(WX.rain > TUNE.chai.minRain || (WX.wet > 0.6 && WX.cloud > 0.5))) return;
      const item = String(d.item || '');
      if (!/chai|combo|paani_kam|^sit$/.test(item)) return;
      const irani = d.kind === 'irani_cafe' || /irani/.test(String(d.place || ''));
      const bonus = (irani ? TUNE.chai.irani : TUNE.chai.bandi) * Math.max(1, Math.min(3, d.qty || 1));
      const p = N.player;
      if (p && p.feed) p.feed(0, { energy: bonus, tummy: Math.round(bonus / 3), quiet: true, status: 'warm' });
      toast(irani ? 'Steaming Irani chai while the rain drums on the tin roof... *ahh*. Energy +' + bonus : 'Hot chai in the rain, hands round the glass. Energy +' + bonus, 2800, 'rainchai');
      N.emit('rain:chai', { place: d.place, bonus });
    } catch (e) { N.err('weather2d.chai', e); }
  });

  function toast(text, ms, key) { try { if (N.hud && N.hud.toast) N.hud.toast(text, ms, key ? { key } : undefined); } catch (e) { /* hud optional */ } }

  /* ================================================================ queued draw closures (made once) */
  const T0 = { t: 0 };
  const prof = (API.prof = {});
  const timed = (name, fn) => (ctx) => { const t = performance.now(); try { fn(ctx); } finally { const d = performance.now() - t; drawMs += d; prof[name] = d; } };
  const qTint = timed('tint', drawWetTint);
  const qHide = timed('hide', drawHiddenPotholes);
  const qRefl = timed('refl', drawReflections);
  const qSplash = timed('splash', drawGroundSplashes);
  const qBoat = timed('boat', drawBoat);
  const qRoof = timed('roof', drawRoofSplashes);
  const qEaves = timed('eaves', drawEaves);
  const qOverlay = timed('overlay', drawOverlay);
  const qHalos = timed('halos', drawHalos);
  const qGlare = timed('glare', drawGlare);
  const qLightning = timed('lightning', drawLightning);
  const qRain = timed('rain', drawRain);
  const qStat = () => { API.stats.ms = drawMs; };
  void T0;

  function frameState() {
    R = N.render; S = N.SURF;
    rain = WX.rain || 0; wet = WX.wet || 0; cloud = WX.cloud || 0; mist = WX.mist || 0; storm = WX.storm || 0;
    night = R.night || 0;
    fd = flashDisplay(WX.flash || 0);
    low = !!(N.atmos && N.atmos.low);
    const now = performance.now();
    fdt = lastT ? clamp((now - lastT) / 1000, 0, 0.05) : 0.016;
    lastT = now;
    const Z = R.Z || 1;
    if (isFinite(lastCamX) && isFinite(R.camX)) {
      camDX = (R.camX - lastCamX) * Z; camDY = (R.camY - lastCamY) * Z;
      if (Math.abs(camDX) > 200 || Math.abs(camDY) > 200) camDX = camDY = 0; // teleport
    } else camDX = camDY = 0;
    lastCamX = R.camX; lastCamY = R.camY;
  }

  function draw() {
    drawMs = 0;
    for (const k in prof) prof[k] = 0;
    if (!API.enabled || !N.render || !N.render.ctx || !N.world || !N.world.built) return;
    const mode = N.state && N.state.mode;
    if (mode === 'boot' || mode === 'minigame') return;
    if (N.atmos && N.atmos.is3D()) return;
    const t0 = performance.now();
    frameState();
    buildSprites();
    const paused = mode === 'paused' || mode === 'map' || mode === 'journal';
    const sdt = paused ? 0 : fdt;
    potT -= sdt;
    if (potT <= 0 && (wet > 0.05 || rain > 0.02)) { potT = 0.3; refreshPots(); }
    else if (wet <= 0.05 && rain <= 0.02) wetPots.length = 0;
    stepSplashes(sdt);
    boltAge += sdt * (N.time && N.time.scale != null ? N.time.scale : 1);
    API.hiddenPotholes = 0.82 * smooth(0.5, 0.92, rain);
    eaveT -= sdt;
    if (eaveT <= 0) { eaveT = 0.5; refreshEaves(); }
    if (rain < 0.02 && wet < 0.3) nE = 0;
    // mist drift with the wind
    const wi = N.wind;
    if (wi && sdt) { const sp = TUNE.mist.drift * (0.5 + (wi.strength || 0)); driftX += wi.dx * sp * sdt; driftY += wi.dy * sp * sdt; }
    const q = R.queue;
    if (wet > 0.02) q('ground', -5, qTint);
    if (API.hiddenPotholes > 0.02 && wetPots.length) q('ground', 3, qHide);
    q('ground', 5, qRefl); // also snapshots the lights for the halos / overlay (always)
    if (nS) q('ground', 6, qSplash);
    if (API.boat) q('ground', 8, qBoat);
    if (nS) q('sky', -100, qRoof);
    if (nE) q('sky', -90, qEaves);
    if (cloud > 0.01 || mist > 0.02) q('sky', 1e9, qOverlay);
    if (night > 0.05 && (rain > 0.03 || mist > 0.03)) q('light', 8, qHalos);
    if (night > 0.05 && wet > 0.05) q('light', 9, qGlare);
    if (fd > 0.01 || (boltN && boltAge < 0.3)) q('fx', -2, qLightning);
    q('fx', -1, qRain);
    q('fx', 1e9, qStat);
    prof.enqueue = performance.now() - t0;
    drawMs += prof.enqueue;
  }

  /* ================================================================ system */
  N.addSystem({
    id: 'weather2d', order: 29, runIn: ['play', 'dialogue', 'cutscene'],
    init() { wrapAutos(); wrapWanted(); },
    reset() {
      if (API.boat) API.boat = null;
      boatCD = 0; nS = 0; nE = 0; chaseToast = false;
      shelterUse.clear();
    },
    update(dt) {
      // road slipperiness: wet roads stay slick a while after the shower
      const target = clamp(WX.wet * (0.6 + 0.4 * Math.min(1, WX.rain * 1.5)), 0, 1);
      API.slick += (target - API.slick) * Math.min(1, dt * 0.8);
      if (WX.forced) API.slick = target;
      applyBrakes();
      const r = WX.rain, Tt = TUNE.traffic;
      API.trafficMul = 1 - Tt.light * smooth(0.05, 0.4, r) - Tt.heavy * smooth(0.5, 0.95, r) - Tt.storm * WX.storm - Tt.wet * WX.wet * (r < 0.05 ? 1 : 0);
      try { rainLife(dt); } catch (e) { N.err('weather2d.life', e); }
      updateWanted();
      if (boatCD > 0) boatCD -= dt;
      if (API.boat) stepBoat(dt);
      else if (boatCD <= 0 && N.state && N.state.mode === 'play') {
        spotT -= dt;
        if (spotT <= 0) { spotT = 0.2; spotCache = boatSpot(); }
        if (spotCache) N.interact.offer(boatOffer);
      }
    },
    draw,
  });
  // the title screen also shows the city in the rain: draw() runs in every mode (systems.draw ignores runIn)
  N.on('boot', () => { try { wrapAutos(); wrapWanted(); } catch (e) { N.err('weather2d.boot', e); } });
  N.on('game:new', () => { slickApplied = -1; });
})();
