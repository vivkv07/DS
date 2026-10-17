/* NOSTALGIA — audio_vehicles.js  (owner: vehicles sound designer) — extends N.audio through N.audio.ext (see audio.js "extension API").
 *
 * Physically-inspired, CPU-cheap vehicle audio, synthesis only:
 *  - ENGINE VOICES (X.setEngineVoice): one pre-rendered loop of firing pulses per type and load state, rendered once in JS
 *    (per sample rate, in idle time) into an AudioBuffer: each firing = a sharp exhaust pressure pulse (alpha-function blip with
 *    a DC-cancelling rarefaction), short pipe/muffler ringing, a band-limited noise "rasp", and per-type mechanics (diesel
 *    injector knock, auto chassis/chain rattle, 2-stroke missed fires "4-stroking" at idle, off-throttle pops, 4-cyl/3-cyl
 *    cylinder-to-cylinder imbalance for the burble/offbeat thrum). Two loops per type, "coast/idle" and "load", play at
 *    playbackRate = firing Hz / loop Hz (x Doppler) and crossfade with the throttle; a lowpass opens with load and rpm, a
 *    peaking filter is the exhaust (the RX100's expansion chamber moves with rpm and "comes on the pipe" up high).
 *    Gearboxes (Chetak 4 hand-shift, RX100 5, auto 4, cars 4, bus/lorry 5) with upshift/downshift hysteresis: a shift drops the
 *    rpm to the next gear's, closes the throttle and dips the level (clutch), then pulls again. CVT for the Scooty/Luna/boat.
 *    Throttle: vehicle.throttle (sign: braking) when present, else the core's thr, else inferred from acceleration.
 *    Rolling noise by surface (asphalt hiss, wet swish when it rains, dirt/gravel crunch, Old City cobble rumble, grass, water),
 *    a continuous skid layer for the player, CVT/gearbox whine, air-brake "pssht" when a bus/lorry stops.
 *    Pedal cycles: a looped freewheel-ratchet buffer (Hero: fewer, heavier pawls; Hercules: fine fast ticks) while coasting,
 *    a crank loop (chain clack + bottom-bracket creak per revolution) while pedalling, thin-tyre hiss.
 *    Nodes per voice: engine ~12 (player ~18 with grit + skid), pedal ~10. No per-frame allocation; k-rate automation only.
 *  - SFX (same names, registered over the core's): bell (plain / hero / hercules, modal JS render, cached), auto_horn,
 *    scooter_horn (variant 'dc'), scooty_horn (new), car_horn, bus_horn, lorry_horn (multi-trumpet melodic phrases, variant =
 *    tune), chetak_start / auto_start / car_start / diesel_start (built on the engine loops), pothole (by o.vtype or the
 *    pitch the vehicles module passes: cycle / bike / auto / car / heavy; variant 'wet').
 *  - Test hooks: N.audio.vehicles {types, sweep(oc, out, type, sec, o), road(oc, out, surface, sec, o), nodes(type, player),
 *    bench(n, sec), lastLog}.
 */
(() => {
  'use strict';
  const N = window.N;
  const X = N.audio && N.audio.ext;
  if (!X) return;
  const P = X.P;
  const { osc0, gain, filt, shaper, tone, burst, strike, noiseBuf, rr, clamp, pick, METAL, BELL } = P;
  const TAU = Math.PI * 2;
  const PO = (o) => (o && o.pitch) || 1;
  const err = (where, e) => { try { N.err('audio.vehicles.' + where, e); } catch (e2) { /* ignore */ } };
  const VT = (type) => (N.vehicles && N.vehicles.TYPES && N.vehicles.TYPES[type]) || null;

  /* ============================================================ deterministic JS rendering into cached buffers */
  function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const DATA = new Map();          // key@sr -> Float32Array
  const BUFS = new WeakMap();      // ac -> Map(key@sr -> AudioBuffer)
  // Renderers are generators that yield every ~0.3-1 ms of work: live, they run in idle-time slices of <= 3.5 ms (pump);
  // offline (tests, OfflineAudioContext) they are drained synchronously.
  const JOBS = new Map();          // key@sr -> {gen} in progress
  const QUEUE = [];                // [{k, sr, make}] wanted live, front = most urgent
  const drain = (g) => { let r; do r = g.next(); while (!r.done); return r.value; };
  function data(key, sr, make) {
    const k = key + '@' + sr;
    let d = DATA.get(k);
    if (!d) { const j = JOBS.get(k); d = drain(j ? j.gen : make(sr)); JOBS.delete(k); DATA.set(k, d); }
    return d;
  }
  let pumping = false;
  const ric = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 400 }) : setTimeout(() => fn(null), 40));
  function want(key, sr, make, front) {
    const k = key + '@' + sr;
    if (DATA.has(k)) return;
    let q = QUEUE.find((x) => x.k === k);
    if (q) { if (front) { QUEUE.splice(QUEUE.indexOf(q), 1); QUEUE.unshift(q); } } else { q = { k, sr, make }; if (front) QUEUE.unshift(q); else QUEUE.push(q); }
    if (!pumping) { pumping = true; ric(pump); }
  }
  function pump() {
    const t0 = performance.now();
    try {
      while (QUEUE.length && performance.now() - t0 < 2.5) {
        const q = QUEUE[0];
        if (DATA.has(q.k)) { QUEUE.shift(); continue; }
        let j = JOBS.get(q.k);
        if (!j) { j = { gen: q.make(q.sr) }; JOBS.set(q.k, j); }
        const r = j.gen.next();
        if (r.done) { DATA.set(q.k, r.value); JOBS.delete(q.k); QUEUE.shift(); }
      }
    } catch (e) { err('warm', e); QUEUE.length = 0; }
    pumping = false;
    if (QUEUE.length) { pumping = true; ric(pump); }
  }
  const isLive = (ac) => !!ac && ac === X.ctx;
  // lazy: on the live context return null (and queue the render up front) instead of rendering inside a frame
  function buf(ac, key, make, lazy) {
    const sr = ac.sampleRate, k = key + '@' + sr;
    let m = BUFS.get(ac);
    if (!m) { m = new Map(); BUFS.set(ac, m); }
    let b = m.get(k);
    if (b) return b;
    if (lazy && isLive(ac) && !DATA.has(k)) { want(key, sr, make, true); return null; }
    const d = data(key, sr, make);
    b = ac.createBuffer(1, d.length, sr);
    b.getChannelData(0).set(d);
    m.set(k, b);
    return b;
  }
  // RBJ bandpass (0 dB peak) run twice round a loop so the seam is continuous
  function* bandLoop(x, sr, f, q) {
    const w = TAU * Math.min(f, sr * 0.45) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const n = x.length, y = new Float32Array(n);
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { const v = x[i], o = b0 * v + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; if (pass) y[i] = o; if ((i & 16383) === 16383) yield; }
    return y;
  }
  function* hpLoop(x, sr, f) { // one-pole highpass, looped (removes DC and sub-rumble)
    const a = 1 / (1 + TAU * f / sr);
    let px = 0, py = 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < x.length; i++) { const v = x[i], o = a * (py + v - px); px = v; py = o; if (pass) x[i] = o; if ((i & 16383) === 16383) yield; }
    return x;
  }
  function lpLoop(x, sr, f) {
    const a = 1 - Math.exp(-TAU * f / sr);
    let y = 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < x.length; i++) { y += (x[i] - y) * a; if (pass) x[i] = y; }
    return x;
  }
  function normPeak(x, pk) { let m = 1e-9; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); const k = pk / m; for (let i = 0; i < x.length; i++) x[i] *= k; return x; }

  /* ============================================================ engine loop designs
   * Loop spec: f0 (firing Hz the loop is rendered at), K (firings in the loop), tau (exhaust pulse rise, s), ring [[Hz, decay s, amp]]
   * (pipe / muffler / body resonances), nz {a, tau, f, q} (per-firing noise rasp), click {a, lo, hi, dec, n, at} (diesel knock),
   * rattle {a, lo, hi, dec, n, span} (loose tin), cyl [] / cylT [] (per-cylinder amp / timing, fraction of a period),
   * jit (timing jitter), ampJit, miss (probability of a weak/missed fire) + missAmp, pop {p, a} (off-throttle pops). */
  // damped sinusoid added into a loop (recursive envelope + rotating phasor: no exp/sin per sample); att = attack samples
  function dsin(arr, len, s0, n, amp, dec, w, ph, att) {
    const r = Math.exp(-1 / dec), cw = Math.cos(w), sw = Math.sin(w);
    let c = Math.cos(ph), si = Math.sin(ph), e = amp;
    for (let j = 0; j < n; j++) { arr[(s0 + j) % len] += e * si * (j < att ? j / att : 1); e *= r; const c2 = c * cw - si * sw; si = si * cw + c * sw; c = c2; }
  }
  function dnoise(arr, len, s0, n, amp, dec, rnd, att) {
    const r = Math.exp(-1 / dec); let e = amp;
    for (let j = 0; j < n; j++) { arr[(s0 + j) % len] += e * (rnd() * 2 - 1) * (j < att ? j / att : 1); e *= r; }
  }
  function* renderLoop(sr, d, seed) {
    const rnd = prng(seed);
    const T = sr / d.f0, K = d.K, len = Math.round(T * K);
    const out = new Float32Array(len), nz = new Float32Array(len);
    const cyl = d.cyl || [1], cylT = d.cylT || [0];
    const ring = d.ring || [];
    const t1 = d.tau * sr, t2 = t1 * (d.neg || 3.5), n1 = Math.ceil(t1 * 12), n2 = Math.ceil(t2 * 9);
    // the exhaust pressure pulse shape, computed once: fast alpha blip minus a slower equal-area rarefaction (no DC)
    const pulse = new Float32Array(n2);
    for (let j = 0; j < n2; j++) pulse[j] = (j < n1 ? (j / t1) * Math.exp(1 - j / t1) : 0) - (j / t2) * Math.exp(1 - j / t2) * (t1 / t2);
    for (let k = 0; k < K; k++) {
      yield;
      let a = cyl[k % cyl.length] * (1 + (rnd() - 0.5) * 2 * (d.ampJit || 0));
      if (d.miss && rnd() < d.miss) a *= (d.missAmp || 0.15) * (0.5 + rnd());
      const st = Math.round((k + (cylT[k % cylT.length] || 0) + (rnd() - 0.5) * 2 * (d.jit || 0)) * T + len) % len;
      for (let j = 0; j < n2; j++) out[(st + j) % len] += a * pulse[j];
      for (const r of ring) {
        const f = r[0] * (1 + (rnd() - 0.5) * 0.04), dec = r[1] * sr;
        dsin(out, len, st, Math.ceil(dec * 6), a * r[2], dec, TAU * f / sr, rnd() * 0.6, 6);
      }
      if (d.nz) { const dec = d.nz.tau * sr; dnoise(nz, len, st, Math.ceil(dec * 6), Math.pow(Math.max(0, a), 1.3) * d.nz.a, dec, rnd, 8); }
      if (d.click) for (let c = 0; c < d.click.n; c++) {
        const f = d.click.lo + rnd() * (d.click.hi - d.click.lo), dec = d.click.dec * sr * (0.7 + rnd() * 0.6);
        const s0 = st + Math.round((d.click.at + c * 0.04 + rnd() * 0.01) * T);
        dsin(out, len, s0, Math.ceil(dec * 6), d.click.a * (0.6 + 0.4 * Math.abs(a)) * (c ? 0.5 : 1), dec, TAU * f / sr, 0, 3);
      }
      if (d.rattle) for (let c = 0; c < d.rattle.n; c++) {
        const f = d.rattle.lo + rnd() * (d.rattle.hi - d.rattle.lo), dec = d.rattle.dec * sr * (0.6 + rnd() * 0.8);
        const s0 = st + Math.round(rnd() * d.rattle.span * T);
        dsin(out, len, s0, Math.ceil(dec * 6), d.rattle.a * (0.3 + 0.7 * rnd()) * (0.5 + 0.5 * Math.abs(a)), dec, TAU * f / sr, 0, 3);
      }
      if (d.pop && rnd() < d.pop.p) { // off-throttle pop: a sharp crack in the pipe + a little thump
        const s0 = st + Math.round((0.3 + rnd() * 0.4) * T), dec = 0.0025 * sr, aa = d.pop.a * (0.6 + 0.4 * rnd());
        dnoise(nz, len, s0, Math.ceil(dec * 6), aa * 3, dec, rnd, 4);
        const td = 0.012 * sr;
        dsin(out, len, s0, Math.ceil(td * 5), aa, td, TAU * (d.ring && d.ring[0] ? d.ring[0][0] * 0.6 : 200) / sr, 0, 8);
      }
    }
    yield;
    const nzf = d.nz ? yield* bandLoop(nz, sr, d.nz.f, d.nz.q) : nz;
    yield;
    for (let i = 0; i < len; i++) out[i] += nzf[i] * 2.2;
    yield* hpLoop(out, sr, d.hp || 18);
    yield;
    return normPeak(out, 0.85);
  }

  // Per-type design: c = coast/idle loop, l = load loop; live: fIdle/fMax (firing Hz), tops (speed fraction where each gear
  // reaches max rpm; one entry = CVT / single speed), shift (s), lp [closed, open] Hz, pk {f, q, g} (or f/g as [lo, hi] + pipeAt),
  // whine {f0, f1, a, cvt}, vol, size (tyre noise scale), heavy (air brake).
  const DEF = {
    auto: {
      c: { f0: 22, K: 20, tau: 0.0016, ring: [[620, 0.012, 0.5], [1750, 0.006, 0.35]], nz: { a: 0.5, tau: 0.012, f: 1500, q: 0.8 },
        rattle: { a: 0.32, lo: 2200, hi: 5200, dec: 0.0025, n: 3, span: 0.85 }, jit: 0.05, ampJit: 0.2, miss: 0.3, missAmp: 0.12, pop: { p: 0.08, a: 0.5 } },
      l: { f0: 46, K: 32, tau: 0.0012, ring: [[700, 0.01, 0.5], [1900, 0.006, 0.4]], nz: { a: 0.85, tau: 0.01, f: 1800, q: 0.7 },
        rattle: { a: 0.26, lo: 2500, hi: 6000, dec: 0.002, n: 2, span: 0.85 }, jit: 0.02, ampJit: 0.18, miss: 0.03 },
      fIdle: 22, fMax: 72, tops: [0.28, 0.55, 0.8, 1.2], shift: 0.3, lp: [900, 4200], pk: { f: 650, q: 1.2, g: 6 }, vol: 0.5, size: 1, seed: 11,
    },
    scooty: {
      c: { f0: 36, K: 24, tau: 0.0009, ring: [[1350, 0.006, 0.45], [2900, 0.004, 0.3]], nz: { a: 0.45, tau: 0.006, f: 2400, q: 1 },
        jit: 0.03, ampJit: 0.15, miss: 0.12, missAmp: 0.2, pop: { p: 0.05, a: 0.35 } },
      l: { f0: 80, K: 40, tau: 0.0007, ring: [[1500, 0.005, 0.5], [3200, 0.003, 0.35]], nz: { a: 0.7, tau: 0.005, f: 3000, q: 0.9 }, jit: 0.01, ampJit: 0.12 },
      fIdle: 36, fMax: 118, tops: [1], cvt: true, lp: [1700, 7000], pk: { f: 1700, q: 1.5, g: 5 }, whine: { f0: 260, f1: 1500, a: 0.035, cvt: true }, vol: 0.34, size: 0.7, hp: 160, seed: 21,
    },
    luna: {
      c: { f0: 30, K: 20, tau: 0.001, ring: [[1800, 0.004, 0.4], [3600, 0.003, 0.2]], nz: { a: 0.4, tau: 0.005, f: 2600, q: 1.4 }, jit: 0.04, ampJit: 0.2, miss: 0.18, missAmp: 0.25 },
      l: { f0: 62, K: 32, tau: 0.0008, ring: [[1900, 0.004, 0.45]], nz: { a: 0.6, tau: 0.004, f: 3000, q: 1.2 }, jit: 0.02, ampJit: 0.15, miss: 0.04 },
      fIdle: 30, fMax: 86, tops: [1], cvt: true, lp: [1400, 5200], pk: { f: 1900, q: 2.5, g: 6 }, whine: { f0: 380, f1: 1100, a: 0.02, cvt: true }, vol: 0.45, size: 0.7, hp: 220, seed: 31,
    },
    chetak: {
      c: { f0: 20, K: 16, tau: 0.003, ring: [[340, 0.028, 0.6], [880, 0.012, 0.3]], nz: { a: 0.35, tau: 0.02, f: 700, q: 0.7 }, jit: 0.07, ampJit: 0.22, miss: 0.16, missAmp: 0.2, pop: { p: 0.06, a: 0.45 } },
      l: { f0: 48, K: 32, tau: 0.0022, ring: [[380, 0.02, 0.55], [1000, 0.01, 0.35]], nz: { a: 0.6, tau: 0.012, f: 1100, q: 0.6 }, jit: 0.025, ampJit: 0.15, miss: 0.03 },
      fIdle: 20, fMax: 78, tops: [0.3, 0.55, 0.8, 1.2], shift: 0.32, lp: [520, 2800], pk: { f: 420, q: 1, g: 4 }, vol: 0.55, size: 0.8, seed: 41,
    },
    rx100: {
      c: { f0: 27, K: 20, tau: 0.0007, ring: [[2300, 0.012, 0.35], [3500, 0.009, 0.25], [900, 0.01, 0.3]], nz: { a: 0.5, tau: 0.008, f: 3000, q: 1 }, jit: 0.04, ampJit: 0.2, miss: 0.15, missAmp: 0.2, pop: { p: 0.12, a: 0.7 } },
      l: { f0: 75, K: 40, tau: 0.0005, ring: [[2400, 0.01, 0.4], [3700, 0.007, 0.3], [1000, 0.008, 0.3]], nz: { a: 0.8, tau: 0.006, f: 3600, q: 0.8 }, jit: 0.012, ampJit: 0.12 },
      fIdle: 27, fMax: 132, tops: [0.2, 0.38, 0.57, 0.78, 1.2], shift: 0.13, lp: [1500, 8000], pk: { f: [500, 1900], q: 3, g: [3, 12], pipeAt: 0.66 }, vol: 0.42, size: 0.8, seed: 51,
    },
    ambassador: {
      c: { f0: 22, K: 32, tau: 0.004, ring: [[160, 0.015, 0.25], [480, 0.015, 0.25]], nz: { a: 0.15, tau: 0.02, f: 500, q: 0.6 }, cyl: [1, 0.82, 0.95, 0.78], jit: 0.01, ampJit: 0.06 },
      l: { f0: 55, K: 40, tau: 0.003, ring: [[170, 0.012, 0.25], [520, 0.012, 0.3]], nz: { a: 0.3, tau: 0.015, f: 700, q: 0.6 }, cyl: [1, 0.85, 0.95, 0.82], jit: 0.008, ampJit: 0.08 },
      fIdle: 22, fMax: 105, tops: [0.25, 0.5, 0.76, 1.2], shift: 0.45, lp: [360, 1700], pk: { f: 180, q: 1, g: 5 }, whine: { f0: 250, f1: 900, a: 0.012 }, vol: 0.3, size: 1, seed: 61,
    },
    padmini: {
      c: { f0: 25, K: 32, tau: 0.0034, ring: [[200, 0.014, 0.25], [600, 0.014, 0.3]], nz: { a: 0.2, tau: 0.018, f: 650, q: 0.6 }, cyl: [1, 0.86, 0.93, 0.8], jit: 0.01, ampJit: 0.07 },
      l: { f0: 58, K: 40, tau: 0.0026, ring: [[210, 0.012, 0.25], [640, 0.012, 0.32]], nz: { a: 0.36, tau: 0.014, f: 850, q: 0.6 }, cyl: [1, 0.87, 0.94, 0.83], jit: 0.008, ampJit: 0.08 },
      fIdle: 25, fMax: 112, tops: [0.25, 0.5, 0.76, 1.2], shift: 0.42, lp: [420, 2000], pk: { f: 210, q: 1, g: 4 }, whine: { f0: 280, f1: 1000, a: 0.012 }, vol: 0.45, size: 1, seed: 71,
    },
    maruti800: {
      c: { f0: 23, K: 30, tau: 0.003, ring: [[230, 0.012, 0.25], [720, 0.012, 0.3]], nz: { a: 0.2, tau: 0.015, f: 650, q: 0.6 }, cyl: [1, 0.62, 0.84], cylT: [0, 0.07, -0.05], jit: 0.01, ampJit: 0.06 },
      l: { f0: 60, K: 42, tau: 0.0024, ring: [[250, 0.01, 0.25], [780, 0.01, 0.3]], nz: { a: 0.35, tau: 0.012, f: 900, q: 0.6 }, cyl: [1, 0.7, 0.86], cylT: [0, 0.05, -0.03], jit: 0.008, ampJit: 0.08 },
      fIdle: 23, fMax: 125, tops: [0.22, 0.45, 0.7, 1.2], shift: 0.35, lp: [450, 2400], pk: { f: 240, q: 1.1, g: 4 }, vol: 0.4, size: 0.9, seed: 81,
    },
    bus: {
      c: { f0: 28, K: 36, tau: 0.0035, ring: [[115, 0.05, 0.6], [330, 0.02, 0.15]], nz: { a: 0.2, tau: 0.02, f: 400, q: 0.6 },
        click: { a: 0.3, lo: 1800, hi: 4200, dec: 0.0016, n: 2, at: 0.02 }, rattle: { a: 0.1, lo: 3000, hi: 7000, dec: 0.0012, n: 1, span: 1 }, cyl: [1, 0.9, 0.95, 0.88, 0.97, 0.9], jit: 0.01, ampJit: 0.08 },
      l: { f0: 60, K: 48, tau: 0.003, ring: [[120, 0.04, 0.6], [350, 0.016, 0.3]], nz: { a: 0.4, tau: 0.015, f: 600, q: 0.6 },
        click: { a: 0.24, lo: 1500, hi: 3800, dec: 0.0014, n: 2, at: 0.02 }, cyl: [1, 0.92, 0.96, 0.9, 0.97, 0.92], jit: 0.008, ampJit: 0.08 },
      fIdle: 28, fMax: 95, tops: [0.18, 0.36, 0.55, 0.78, 1.2], shift: 0.75, lp: [1500, 2800], pk: { f: 120, q: 1, g: 6 }, whine: { f0: 150, f1: 700, a: 0.018 }, vol: 0.26, size: 1.4, heavy: true, seed: 91,
    },
    lorry: {
      c: { f0: 25, K: 36, tau: 0.004, ring: [[95, 0.055, 0.6], [290, 0.02, 0.25]], nz: { a: 0.22, tau: 0.02, f: 380, q: 0.6 },
        click: { a: 0.4, lo: 1600, hi: 3800, dec: 0.0018, n: 2, at: 0.02 }, rattle: { a: 0.14, lo: 2500, hi: 6000, dec: 0.0015, n: 2, span: 1 }, cyl: [1, 0.88, 0.95, 0.86, 0.97, 0.9], jit: 0.012, ampJit: 0.1 },
      l: { f0: 55, K: 48, tau: 0.0034, ring: [[100, 0.045, 0.6], [310, 0.016, 0.3]], nz: { a: 0.42, tau: 0.015, f: 560, q: 0.6 },
        click: { a: 0.32, lo: 1400, hi: 3500, dec: 0.0015, n: 2, at: 0.02 }, rattle: { a: 0.1, lo: 2500, hi: 6000, dec: 0.0012, n: 1, span: 1 }, cyl: [1, 0.9, 0.96, 0.88, 0.97, 0.91], jit: 0.01, ampJit: 0.08 },
      fIdle: 25, fMax: 85, tops: [0.18, 0.36, 0.55, 0.78, 1.2], shift: 0.8, lp: [1300, 2500], pk: { f: 100, q: 1, g: 6 }, whine: { f0: 130, f1: 600, a: 0.02 }, vol: 0.32, size: 1.4, heavy: true, seed: 101,
    },
    boat: {
      c: { f0: 17, K: 16, tau: 0.0025, ring: [[300, 0.03, 0.5], [800, 0.01, 0.3]], nz: { a: 0.4, tau: 0.02, f: 600, q: 0.6 }, jit: 0.03, ampJit: 0.15, miss: 0.05, missAmp: 0.3 },
      l: { f0: 40, K: 24, tau: 0.002, ring: [[320, 0.025, 0.5], [850, 0.01, 0.3]], nz: { a: 0.6, tau: 0.014, f: 900, q: 0.6 }, jit: 0.02, ampJit: 0.15 },
      fIdle: 17, fMax: 54, tops: [1], cvt: true, lp: [500, 2000], pk: { f: 300, q: 1, g: 4 }, vol: 0.5, size: 1, water: true, seed: 111,
    },
  };
  const TYPES = Object.keys(DEF);
  const loopKey = (key, which) => 'eng:' + key + ':' + which;
  function engBuf(ac, key, which, lazy) {
    const D = DEF[key];
    return buf(ac, loopKey(key, which), (sr) => renderLoop(sr, Object.assign({ hp: D.hp }, D[which]), D.seed + (which === 'l' ? 7 : 0)), lazy);
  }

  /* ---- small loops: freewheel ratchet, crank (pedal), road grit */
  function* renderRatchet(sr) { // 24 pawl clicks in one second (played at rate = ticks per s / 24)
    const rnd = prng(7), len = sr, out = new Float32Array(len);
    for (let k = 0; k < 24; k++) {
      if (k % 6 === 5) yield;
      const st = Math.round((k + (rnd() - 0.5) * 0.12) / 24 * sr + len) % len, a = 0.7 + 0.3 * rnd();
      for (const [f, dec, g] of [[3100, 0.0018, 0.6], [4700, 0.0012, 0.45], [6900, 0.0008, 0.18], [1400, 0.003, 0.3]]) {
        const w = TAU * f * (1 + (rnd() - 0.5) * 0.05) / sr, dd = dec * sr;
        dsin(out, len, st, Math.ceil(dd * 6), a * g, dd, w, 0, 5);
      }
    }
    return normPeak(yield* hpLoop(out, sr, 400), 0.8);
  }
  function* renderCrank(sr) { // 2 crank revolutions at 1 rev/s: chain clack per down-stroke, a creak once per revolution, chain whirr
    const rnd = prng(9), len = 2 * sr, out = new Float32Array(len), nz = new Float32Array(len);
    for (let s = 0; s < 4; s++) {
      const st = Math.round((s * 0.5 + 0.02) * sr);
      yield;
      for (const [f, dec, g] of [[140, 0.025, 0.35], [950, 0.004, 0.2], [2300, 0.002, 0.08]]) { const dd = dec * sr; dsin(out, len, st, Math.ceil(dd * 6), g, dd, TAU * f / sr, 0, 10); }
    }
    for (let r = 0; r < 2; r++) { // bottom-bracket creak: a stick-slip squeak, 0.13 s, pitch wobbling 650..900
      yield;
      const st = Math.round((r + 0.27) * sr), n = Math.round(0.13 * sr);
      let ph = 0;
      for (let j = 0; j < n; j++) {
        const u = j / n, f = 650 + 250 * Math.sin(u * 3.1) + 40 * Math.sin(j / sr * 2 * Math.PI * 23);
        ph += TAU * f / sr;
        const stick = 0.5 + 0.5 * Math.sin(TAU * 55 * j / sr);
        out[(st + j) % len] += 0.09 * Math.sin(u * Math.PI) * stick * (Math.sin(ph) + 0.4 * Math.sin(2 * ph));
      }
    }
    yield;
    for (let i = 0; i < len; i++) { nz[i] = (rnd() * 2 - 1) * (0.6 + 0.4 * Math.abs(Math.sin(i / sr * TAU))); if ((i & 16383) === 16383) yield; }
    yield;
    const w = yield* bandLoop(nz, sr, 3200, 1.2);
    yield;
    for (let i = 0; i < len; i++) out[i] += w[i] * 0.05;
    return normPeak(yield* hpLoop(out, sr, 60), 0.6);
  }
  function* renderGrit(sr) { // 2 s of sparse gravel/stone impacts (crunch); played faster with speed, filtered per surface
    const rnd = prng(13), len = 2 * sr, out = new Float32Array(len);
    const hit = (st, a, dec, bright) => { const dd = dec * sr, r = Math.exp(-1 / dd); let lp = 0, e = a; for (let j = 0, n = Math.ceil(dd * 6); j < n; j++) { const x = rnd() * 2 - 1; lp += (x - lp) * bright; out[(st + j) % len] += e * lp * (j < 4 ? j / 4 : 1); e *= r; } };
    for (let k = 0; k < 260; k++) if (k % 20 === 19) yield; else hit(Math.floor(rnd() * len), Math.pow(rnd(), 2) * 0.8, 0.0008 + rnd() * 0.003, 0.3 + rnd() * 0.6);
    for (let k = 0; k < 16; k++) { // a few bigger stones: a low knock
      const st = Math.floor(rnd() * len), dd = 0.012 * sr, w = TAU * (90 + rnd() * 80) / sr;
      dsin(out, len, st, Math.ceil(dd * 5), 0.35, dd, w, 0, 20);
      hit(st, 0.5, 0.004, 0.5);
    }
    yield;
    return normPeak(yield* hpLoop(out, sr, 50), 0.8);
  }

  /* ============================================================ the voice */
  const S = N.SURF || {};
  // rolling noise per surface: [bandpass Hz, Q, hiss level, grit level, grit rate, grit lowpass Hz]
  const ROAD = {
    asphalt: [650, 0.6, 0.05, 0.012, 1.2, 3000], wet: [2400, 0.45, 0.11, 0.02, 1.4, 6000], dirt: [420, 0.8, 0.045, 0.2, 1, 2600],
    gravel: [900, 0.6, 0.045, 0.28, 1.3, 4500], cobble: [230, 0.9, 0.06, 0.24, 0.45, 900], stone: [520, 0.7, 0.05, 0.08, 0.8, 1800],
    grass: [340, 0.7, 0.03, 0.05, 0.7, 1400], water: [480, 0.7, 0.12, 0.12, 0.3, 800],
  };
  const env = { bed: null, wet: false, t: 0 };
  function isWet() { const f = N.flags || {}; return !!(f.raining || f.rain || f.wet_roads || f.puddles || f.monsoon_wet || (N.weather && (N.weather.raining || N.weather.rain))); }
  function roadKind(veh, isBoat) {
    if (isBoat) return 'water';
    if (veh && veh.surf) return veh.surf; // tests / scripted overrides
    let s = S.ROAD;
    try { if (veh && N.world && N.world.surfaceAt) s = N.world.surfaceAt(veh.x, veh.y); } catch (e) { s = S.ROAD; }
    const oldcity = env.bed === 'oldcity';
    if (s === S.WATER) return 'water';
    if (s === S.GROUND || s === S.SAND) return env.wet ? 'dirt' : 'dirt';
    if (s === S.ROCK) return 'gravel';
    if (s === S.GRASS) return 'grass';
    if (s === S.PLAZA || s === S.FOOTPATH) return oldcity ? 'cobble' : 'stone';
    if (oldcity) return 'cobble';
    return env.wet ? 'wet' : 'asphalt';
  }
  const keyCache = new Map();
  function keyFor(type, prof) {
    if (keyCache.has(type)) return keyCache.get(type);
    let k = null;
    if (DEF[type]) k = type;
    else if (prof && prof.kind === 'pedal') k = 'pedal';
    else {
      const T = VT(type);
      if (T && T.sound && DEF[T.sound]) k = T.sound;
      else if (T && T.pedal) k = 'pedal';
      else for (const n of TYPES) if (X.engProfile(n) === prof) { k = n; break; }
    }
    keyCache.set(type, k);
    return k;
  }
  const cos = Math.cos, sin = Math.sin;

  class Voice {
    constructor(ac, dest, type, key, veh, isPlayer) {
      this.ac = ac; this.type = type; this.key = key; this.player = !!isPlayer; this.veh = veh || null;
      this.alive = true; this.srcs = []; this.nodes = 0; this.lv = Object.create(null);
      const t = ac.currentTime;
      const D = (this.D = key === 'pedal' ? null : DEF[key]);
      const mk = (n) => { this.nodes++; return n; };
      this.mix = mk(gain(ac, 0));
      this.pn = ac.createStereoPanner ? mk(ac.createStereoPanner()) : null;
      if (this.pn) { this.mix.connect(this.pn); this.pn.connect(dest); } else this.mix.connect(dest);
      const src = (b, rate) => { const s = mk(ac.createBufferSource()); s.buffer = b; s.loop = true; s.playbackRate.value = rate; s.start(t, Math.random() * b.duration); this.srcs.push(s); return s; };
      if (!D) { // pedal cycle
        const T = VT(type) || {};
        this.bellK = T.bell === 'hero' ? 0.72 : T.bell === 'hercules' ? 1.3 : 1;
        this.rG = mk(gain(ac, 0, this.mix)); this.rat = src(buf(ac, 'ratchet', renderRatchet), 0.5); this.rat.connect(this.rG);
        this.cG = mk(gain(ac, 0, this.mix)); this.crank = src(buf(ac, 'crank', renderCrank), 1); this.crank.connect(this.cG);
        this.size = 0.55;
      } else {
        this.vol = mk(gain(ac, 0, this.mix));
        this.pk = mk(filt(ac, 'peaking', Array.isArray(D.pk.f) ? D.pk.f[0] : D.pk.f, D.pk.q, this.vol));
        this.pk.gain.value = Array.isArray(D.pk.g) ? D.pk.g[0] : D.pk.g;
        this.lp = mk(filt(ac, 'lowpass', D.lp[0], 0.7, this.pk));
        this.gC = mk(gain(ac, 1, this.lp)); this.gL = mk(gain(ac, 0, this.lp));
        this.sC = src(engBuf(ac, key, 'c'), D.fIdle / D.c.f0); this.sC.connect(this.gC);
        this.sL = src(engBuf(ac, key, 'l'), D.fIdle / D.l.f0); this.sL.connect(this.gL);
        if (D.whine) { this.wG = mk(gain(ac, 0, this.vol)); this.wO = mk(osc0(ac, 'triangle')); this.wO.frequency.value = D.whine.f0; this.wO.connect(this.wG); this.wO.start(t); this.srcs.push(this.wO); }
        this.size = D.size || 1;
      }
      // rolling noise (every voice) + grit and skid (player)
      this.roadG = mk(gain(ac, 0, this.mix));
      this.roadF = mk(filt(ac, 'bandpass', 650, 0.6, this.roadG));
      src(noiseBuf(ac, 'pink'), 1).connect(this.roadF);
      if (this.player) {
        this.gritG = mk(gain(ac, 0, this.mix));
        this.gritF = mk(filt(ac, 'lowpass', 3000, 0.7, this.gritG));
        const gb = buf(ac, 'grit', renderGrit, true);
        if (gb) { this.grit = src(gb, 1); this.grit.connect(this.gritF); }
        this.skidG = mk(gain(ac, 0, this.mix));
        this.skidF = mk(filt(ac, 'bandpass', 1500, 6, this.skidG));
        src(noiseBuf(ac, 'white'), 1).connect(this.skidF);
      }
      // state
      this.g = 0; this.sf = 0; this.acc = 0; this.load = 0; this.gear = 0; this.shiftT = 0; this.shiftD = 0.3; this.lastT = t;
      this.road = 'asphalt'; this.roadT = 0; this.moving = false; this.abT = 0; this.shifts = 0; this.st = { f: 0, r: 0, gear: 0, shifting: false, load: 0 };
    }
    // set a param towards v (skips tiny changes; k-rate automation only)
    set(p, id, v, tc, eps, rel) {
      const o = this.lv[id];
      if (o !== undefined && (rel ? Math.abs(v - o) <= eps * Math.max(1e-6, Math.abs(o)) : Math.abs(v - o) <= eps)) return;
      this.lv[id] = v;
      p.setTargetAtTime(v, this.ac.currentTime, tc);
    }
    update(sf, thr, g, pan, info) {
      if (!this.alive) return;
      try { this.upd(sf, thr, g, pan, info || {}); } catch (e) { if (!this.errd) { this.errd = true; err('update', e); } }
    }
    upd(sf, thr, g, pan, info) {
      const ac = this.ac, t = ac.currentTime, D = this.D;
      let dt = info.dt;
      if (!(dt > 0)) dt = t - this.lastT;
      this.lastT = t;
      dt = clamp(dt || 0.016, 0.001, 0.1);
      const veh = info.veh || this.veh;
      const dop = info.dop > 0 ? clamp(info.dop, 0.5, 2) : 1;
      sf = clamp(+sf || 0, 0, 1.2); g = clamp(+g || 0, 0, 2);
      // acceleration estimate (speed fraction per second, smoothed)
      const a0 = (sf - this.sf) / dt;
      this.acc += (a0 - this.acc) * (1 - Math.exp(-dt / 0.25));
      const prevSf = this.sf;
      this.sf = sf;
      // throttle / load: the vehicle's own signed throttle when there is one, else thr, else inferred
      let ld = thr > 0.02 ? clamp(thr, 0, 1) : 0, brake = false;
      if (veh && typeof veh.throttle === 'number' && isFinite(veh.throttle)) {
        ld = clamp(veh.throttle, 0, 1);
        brake = (veh.throttle < -0.05 && sf > 0.03) || !!(veh.ctl && veh.ctl.brake && sf > 0.03);
      }
      if (ld <= 0.02 && !brake && !(veh && typeof veh.throttle === 'number')) {
        if (this.acc > 0.015) ld = clamp(0.35 + this.acc * 4, 0, 1);
        else if (sf > 0.08 && this.acc > -0.03) ld = 0.3;
      }
      // master on/off (engine start delay / culling)
      if (Math.abs(g - this.g) > 0.002 || this.lv.mix === undefined) { this.lv.mix = g; this.mix.gain.setTargetAtTime(g, t, g > this.g ? 0.12 : 0.05); this.g = g; }
      if (this.pn && info.spatialized !== true) this.set(this.pn.pan, 'pan', clamp(+pan || 0, -1, 1), 0.05, 0.02);
      // surface (4x a second)
      this.roadT -= dt;
      if (this.roadT <= 0) { this.roadT = 0.25; this.road = roadKind(veh, D && D.water); }
      const R = ROAD[this.road] || ROAD.asphalt;
      if (!D) this.pedal(sf, ld, dt, R, dop);
      else this.engine(sf, ld, brake, dt, R, dop, veh, prevSf);
      // rolling noise
      const roll = Math.pow(Math.min(1.1, sf), 1.2) * this.size;
      this.set(this.roadF.frequency, 'rf', R[0] * (0.75 + 0.6 * sf) * dop, 0.15, 0.03, true);
      this.set(this.roadF.Q, 'rq', R[1], 0.2, 0.05, true);
      this.set(this.roadG.gain, 'rg', R[2] * roll * 3.5, 0.12, 0.002);
      if (this.player) {
        if (this.grit) this.set(this.grit.playbackRate, 'gr', R[4] * (0.2 + 1.1 * sf) * dop, 0.15, 0.02, true);
        this.set(this.gritF.frequency, 'gf', R[5], 0.2, 0.05, true);
        this.set(this.gritG.gain, 'gg', R[3] * roll * 1.6, 0.12, 0.002);
        // skid: a squeal on tarmac, a scrub on dirt (vehicles.js sets v.skidding / v.slip)
        let sk = 0;
        if (veh && (veh.skidding || (brake && sf > 0.45 && veh.ctl && veh.ctl.brake))) sk = clamp(Math.abs(veh.slip || 0) / 70 + (brake ? 0.4 : 0.2), 0.25, 1) * Math.min(1, sf * 2.5);
        const soft = this.road !== 'asphalt' && this.road !== 'wet' && this.road !== 'stone';
        this.set(this.skidF.frequency, 'kf', (soft ? 520 : !D ? 2300 : 1450 + 250 * Math.min(1, Math.abs((veh && veh.slip) || 0) / 80)) * dop, 0.05, 0.03, true);
        this.set(this.skidF.Q, 'kq', soft ? 0.8 : 7, 0.05, 0.05, true);
        this.set(this.skidG.gain, 'kg', sk * (soft ? 0.25 : 0.32), 0.04, 0.003);
      }
    }
    pedal(sf, ld, dt, R, dop) {
      this.load += ((ld > 0.05 ? 1 : 0) - this.load) * (1 - Math.exp(-dt / 0.1));
      const pedalling = this.load, k = this.bellK;
      this.set(this.crank.playbackRate, 'cr', (0.55 + 1.1 * Math.min(1, sf)) * (k < 1 ? 0.9 : 1) * dop, 0.1, 0.01, true);
      this.set(this.cG.gain, 'cg', 0.32 * pedalling * Math.min(1, 0.3 + sf * 6), 0.06, 0.003);
      const coast = sf > 0.03 && pedalling < 0.2 ? 1 : 0;
      this.set(this.rat.playbackRate, 'rr', (4 + 52 * Math.min(1.1, sf)) / 24 * k * dop, 0.05, 0.01, true);
      this.set(this.rG.gain, 'rgn', coast * 0.3 * Math.min(1, sf * 8) * (k < 1 ? 1.1 : 0.9), 0.025, 0.003);
      this.st = { f: 0, r: sf, gear: 0, shifting: false, load: pedalling };
    }
    engine(sf, ld, brake, dt, R, dop, veh, prevSf) {
      const D = this.D, tops = D.tops, single = tops.length < 2;
      let r;
      if (single) { // CVT / centrifugal clutch: revs flare to the clutch-in point, then track speed
        r = clamp(Math.min(1, sf) * 0.8 + ld * (0.36 - 0.2 * Math.min(1, sf)), 0, 1);
      } else {
        if (this.shiftT > 0) this.shiftT -= dt;
        else {
          const g = this.gear, rg = sf / tops[g];
          if (sf < tops[0] * 0.3) this.gear = 0;
          else if (g < tops.length - 1 && rg > Math.max(0.8, 0.62 + 0.33 * this.load) && !brake) { this.gear++; this.shiftT = this.shiftD = D.shift; this.shifts++; }
          else if (g > 0 && rg < 0.3) { this.gear--; this.shiftT = this.shiftD = D.shift * 0.6; }
        }
        r = sf / tops[this.gear];
        if (this.gear === 0) r = Math.max(r, ld * 0.42 * (1 - Math.min(1, sf / tops[0]))); // clutch slip pulling away
        r = clamp(r, 0, 1.1);
      }
      const shifting = this.shiftT > 0;
      const u = shifting ? 1 - this.shiftT / this.shiftD : 0;
      const ldT = shifting ? Math.min(ld, 0.45) : brake ? 0 : ld;
      this.load += (ldT - this.load) * (1 - Math.exp(-dt / (shifting ? 0.03 : 0.08)));
      const L = this.load;
      const f = D.fIdle + (D.fMax - D.fIdle) * r;
      const tcF = shifting ? 0.045 : 0.08;
      this.set(this.sC.playbackRate, 'rc', f / D.c.f0 * dop, tcF, 0.003, true);
      this.set(this.sL.playbackRate, 'rl', f / D.l.f0 * dop, tcF, 0.003, true);
      this.set(this.gC.gain, 'gc', cos(L * Math.PI / 2), 0.04, 0.01);
      this.set(this.gL.gain, 'gl', sin(L * Math.PI / 2), 0.04, 0.01);
      const b = clamp(0.25 * r + 0.55 * L + 0.2 * r * L, 0, 1);
      this.set(this.lp.frequency, 'lp', D.lp[0] * Math.pow(D.lp[1] / D.lp[0], b) * dop, 0.06, 0.02, true);
      if (Array.isArray(D.pk.f)) { // expansion chamber: the resonance tracks rpm and swells "on the pipe"
        const on = clamp((r - D.pk.pipeAt) / 0.2, 0, 1) * L;
        this.set(this.pk.frequency, 'pf', (D.pk.f[0] + (D.pk.f[1] - D.pk.f[0]) * Math.min(1, r)) * dop, 0.06, 0.02, true);
        this.set(this.pk.gain, 'pg', D.pk.g[0] + (D.pk.g[1] - D.pk.g[0]) * on * on * (3 - 2 * on), 0.06, 0.2);
      } else this.set(this.pk.frequency, 'pf', D.pk.f * dop, 0.1, 0.02, true);
      const dip = shifting ? 1 - 0.2 * Math.sin(Math.PI * u) : 1;
      this.set(this.vol.gain, 'v', D.vol * (0.42 + 0.33 * Math.min(1, r) + 0.3 * L) * dip * (brake ? 0.85 : 1), shifting ? 0.03 : 0.06, 0.003);
      if (this.wO) {
        const w = D.whine, x = w.cvt ? Math.min(1.1, sf) : Math.min(1.1, r);
        this.set(this.wO.frequency, 'wf', (w.f0 + (w.f1 - w.f0) * x) * dop, 0.08, 0.005, true);
        this.set(this.wG.gain, 'wg', w.a * Math.min(1, sf * 5) * (0.4 + 0.6 * L), 0.1, 0.001);
      }
      // a bus/lorry stopping: the air brake lets go "pssht" (live context only)
      if (D.heavy) {
        if (sf > 0.06) this.moving = true;
        if (this.moving && sf < 0.01 && prevSf >= 0.01) {
          this.moving = false;
          if (this.ac === X.ctx && this.g > 0.02 && veh && veh.x != null && this.ac.currentTime > this.abT) { this.abT = this.ac.currentTime + 6; X.play('air_brake', { x: veh.x, y: veh.y, vol: 0.8 }); }
        }
      }
      this.st = { f, r, gear: this.gear, shifting, load: L };
    }
    stop() {
      if (!this.alive) return;
      this.alive = false;
      const t = this.ac.currentTime, gp = this.mix.gain;
      try { if (gp.cancelAndHoldAtTime) gp.cancelAndHoldAtTime(t); else gp.cancelScheduledValues(t); gp.setTargetAtTime(0, t, 0.04); } catch (e) { /* ignore */ }
      for (const s of this.srcs) { try { s.stop(t + 0.3); } catch (e) { /* ignore */ } }
      const pn = this.pn || this.mix;
      setTimeout(() => { try { pn.disconnect(); } catch (e) { /* ignore */ } }, 700);
    }
  }
  function factory(ac, dest, type, prof, veh, isPlayer) {
    const key = keyFor(type, prof);
    if (!key) return null;
    if (isLive(ac)) { // never render inside a frame: missing loops are queued first and the built-in voice covers this ride
      const miss = key === 'pedal' ? [buf(ac, 'ratchet', renderRatchet, true), buf(ac, 'crank', renderCrank, true)] : [engBuf(ac, key, 'c', true), engBuf(ac, key, 'l', true)];
      if (miss.some((b) => !b)) return null;
    }
    return new Voice(ac, dest, type, key, veh, isPlayer);
  }
  X.setEngineVoice(factory);

  /* ============================================================ horns */
  const PWAVE = new WeakMap();
  function pulseWave(ac, duty) { // band-limited pulse of the given duty cycle (diaphragm / reed snap)
    let m = PWAVE.get(ac);
    if (!m) { m = {}; PWAVE.set(ac, m); }
    const k = duty.toFixed(3);
    if (m[k]) return m[k];
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (let h = 1; h < n; h++) re[h] = (2 / (h * Math.PI)) * Math.sin(h * Math.PI * duty) * Math.pow(0.985, h);
    return (m[k] = ac.createPeriodicWave(re, im));
  }
  // one diaphragm / reed horn note. o: {f, d hold, duty, drive, res [[Hz, Q, dB]], hp, lp, v, a, r, scoop, scoopT, droop, vib [rate, depth ratio]}
  function hornNote(ac, out, t, o) {
    const os = osc0(ac); os.setPeriodicWave(pulseWave(ac, o.duty || 0.25));
    const f = o.f, d = o.d, a = o.a || 0.012, r = o.r || 0.04;
    os.frequency.setValueAtTime(f * (o.scoop || 0.95), t);
    os.frequency.setTargetAtTime(f, t, (o.scoopT || 0.025) / 3);
    if (o.droop) os.frequency.setTargetAtTime(f * o.droop, t + a + d, r / 2);
    const end = t + a + d + r * 1.3 + 0.03;
    let lfo = null;
    if (o.vib) { lfo = osc0(ac); lfo.frequency.value = o.vib[0]; lfo.connect(gain(ac, f * o.vib[1], os.frequency)); lfo.start(t); lfo.stop(end); }
    const env = gain(ac, 0, out);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(o.v, t + a); env.gain.setValueAtTime(o.v, t + a + d); env.gain.setTargetAtTime(0, t + a + d, r / 4);
    let node = filt(ac, 'lowpass', o.lp || 5000, 0.7, env);
    if (o.hp) node = filt(ac, 'highpass', o.hp, 0.7, node);
    for (const p of o.res || []) { const pk = filt(ac, 'peaking', p[0], p[1], node); pk.gain.value = p[2]; node = pk; }
    const pre = gain(ac, o.pre || 0.8, shaper(ac, o.drive || 2, node));
    os.connect(pre); os.start(t); os.stop(end);
    return end;
  }
  X.registerSfx('auto_horn', (ac, out, t, o) => { // rubber squeeze-bulb reed horn: two squeezes "paa-pom", bulb air hiss
    const p = PO(o) * rr(0.98, 1.02), f = 318 * p;
    const sq = o.dur ? [[0, o.dur, 1]] : [[0, 0.15, 1], [0.29, 0.19, 0.95]];
    let end = t;
    for (const [dt0, d, k] of sq) {
      const tt = t + dt0;
      end = hornNote(ac, out, tt, { f: f * k, d, duty: 0.12, drive: 2.6, pre: 0.9, res: [[880, 2.5, 9], [2300, 3, 6]], lp: 3800, hp: 180, v: 0.34, a: 0.03, r: 0.07, scoop: 0.84, scoopT: 0.05, droop: 0.86, vib: [7, 0.006] });
      burst(ac, out, tt, { f: 1900, q: 0.8, a: 0.025, h: d * 0.7, r: 0.06, v: 0.035 });      // air through the reed slot
      burst(ac, out, tt + d + 0.02, { ft: 'highpass', f: 2500, a: 0.01, r: 0.08, v: 0.02 }); // the bulb refilling
    }
    return end;
  }, { cooldown: 0.45 });
  X.registerSfx('scooter_horn', (ac, out, t, o) => { // Chetak's AC horn off the magneto: buzzy, warbling "meep meep"; variant 'dc' = cleaner 12 V horn
    const dc = o.variant === 'dc', p = PO(o) * rr(0.98, 1.02), f = (dc ? 410 : 355) * p;
    const n = o.dur ? 1 : 2, d = o.dur || 0.13;
    let end = t;
    for (let i = 0; i < n; i++) end = hornNote(ac, out, t + i * 0.21, { f, d, duty: dc ? 0.3 : 0.45, drive: dc ? 2 : 4, pre: 0.8, res: [[1250, 2, 8], [2900, 3, 4]], lp: 4800, hp: 220, v: 0.13, a: 0.01, r: 0.035, scoop: 0.93, droop: 0.95, vib: dc ? null : [27, 0.018] });
    return end;
  }, { cooldown: 0.35 });
  X.registerSfx('scooty_horn', (ac, out, t, o) => { // the Scooty's thin, high electric "peep peep"
    const p = PO(o) * rr(0.98, 1.02), f = 620 * p, n = o.dur ? 1 : 2, d = o.dur || 0.085;
    let end = t;
    for (let i = 0; i < n; i++) end = hornNote(ac, out, t + i * 0.16, { f, d, duty: 0.3, drive: 2, pre: 0.8, res: [[2700, 3, 9]], lp: 6500, hp: 500, v: 0.3, a: 0.006, r: 0.03, scoop: 0.96, droop: 0.96 });
    return end;
  }, { cooldown: 0.35 });
  X.registerSfx('car_horn', (ac, out, t, o) => { // Ambassador: two disc horns a major third apart, each a snapping diaphragm on a resonator
    const d = o.dur || 0.42, p = PO(o) * rr(0.99, 1.01);
    hornNote(ac, out, t, { f: 405 * p, d, duty: 0.22, drive: 3, pre: 0.8, res: [[1900, 1.6, 6], [3300, 2.5, 3]], lp: 5500, hp: 200, v: 0.1, a: 0.012, r: 0.04, scoop: 0.93, droop: 0.95 });
    return hornNote(ac, out, t + 0.004, { f: 507 * p, d, duty: 0.2, drive: 3, pre: 0.8, res: [[2100, 1.6, 6], [3500, 2.5, 3]], lp: 5500, hp: 200, v: 0.09, a: 0.012, r: 0.04, scoop: 0.93, droop: 0.95 });
  }, { cooldown: 0.3 });
  X.registerSfx('bus_horn', (ac, out, t, o) => { // APSRTC air horn: two big trumpets + a third, air pressure builds into a blat, hiss on release
    const d = o.dur || 0.8, p = PO(o);
    let end = t;
    for (const [f, v, dl] of [[146.8, 0.045, 0], [185, 0.038, 0.012], [220, 0.022, 0.02]]) {
      end = Math.max(end, hornNote(ac, out, t + dl, { f: f * p * rr(0.995, 1.005), d, duty: 0.33, drive: 3, pre: 0.9, res: [[650, 1.2, 7], [1500, 2, 5]], lp: 4200, hp: 90, v, a: 0.06, r: 0.14, scoop: 0.8, scoopT: 0.09, droop: 0.9, vib: [5.5, 0.004] }));
    }
    burst(ac, out, t, { ft: 'highpass', f: 2200, a: 0.02, h: 0.05, r: 0.12, v: 0.04 });
    burst(ac, out, t + d + 0.04, { ft: 'highpass', f: 2600, a: 0.01, h: 0.05, r: 0.25, v: 0.07 });
    return end + 0.1;
  }, { cooldown: 0.5 });
  // Musical multi-tone lorry horn: a rotary valve sends air to a row of fixed-pitch trumpets in turn. Original phrases on a
  // major-pentatonic row (trumpet indices, step durations); variant picks the tune.
  const TRUMPETS = [0, 2, 4, 7, 9, 12];
  const LORRY = [
    [[0, 0.12], [1, 0.12], [2, 0.12], [3, 0.12], [2, 0.12], [1, 0.12], [0, 0.36]],
    [[3, 0.14], [3, 0.14], [4, 0.14], [5, 0.26], [4, 0.14], [3, 0.14], [1, 0.4]],
    [[5, 0.1], [4, 0.1], [3, 0.1], [2, 0.1], [1, 0.1], [0, 0.1], [2, 0.16], [0, 0.4]],
    [[0, 0.17], [3, 0.17], [1, 0.17], [4, 0.17], [2, 0.17], [5, 0.45]],
    [[2, 0.13], [4, 0.13], [2, 0.13], [4, 0.13], [3, 0.13], [1, 0.13], [0, 0.42]],
  ];
  X.registerSfx('lorry_horn', (ac, out, t, o) => {
    const tune = o.variant != null && LORRY[o.variant % LORRY.length] ? LORRY[o.variant % LORRY.length] : pick(LORRY);
    const base = 392 * PO(o);
    const total = tune.reduce((s, n) => s + n[1], 0);
    const os = osc0(ac); os.setPeriodicWave(pulseWave(ac, 0.26));
    const lfo = osc0(ac); lfo.frequency.value = 6.2;
    const env = gain(ac, 0, out);
    let node = filt(ac, 'lowpass', 3800, 0.7, env);
    node = filt(ac, 'highpass', 200, 0.7, node);
    const pk1 = filt(ac, 'peaking', 1150, 1.5, node); pk1.gain.value = 6;
    const pk2 = filt(ac, 'peaking', 2400, 2, pk1); pk2.gain.value = 4;
    const pre = gain(ac, 0.85, shaper(ac, 2.6, pk2));
    os.connect(pre);
    const v = 0.3;
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(v, t + 0.02);
    let tt = t;
    tune.forEach(([i, d], k) => {
      const f = base * Math.pow(2, TRUMPETS[i] / 12);
      if (k === 0) { os.frequency.setValueAtTime(f * 0.94, tt); os.frequency.setTargetAtTime(f, tt, 0.01); }
      else {
        os.frequency.setTargetAtTime(f, tt, 0.005);                         // the valve switches trumpets
        env.gain.setTargetAtTime(v * 0.5, tt - 0.012, 0.005); env.gain.setTargetAtTime(v, tt + 0.006, 0.008);
      }
      tt += d;
    });
    env.gain.setTargetAtTime(0, t + total, 0.03);
    const lg = gain(ac, base * 0.004, os.frequency); lfo.connect(lg);
    const end = t + total + 0.2;
    os.start(t); os.stop(end); lfo.start(t); lfo.stop(end);
    burst(ac, out, t, { ft: 'bandpass', f: 2600, q: 0.6, a: 0.02, h: total * 0.9, r: 0.08, v: 0.025 }); // air
    return end;
  }, { cooldown: 1.2 });

  X.setHornFor((type, prof) => {
    const t = String(type || '');
    if (!t || t === 'foot') return null;
    const key = keyFor(t, prof);
    if (key === 'pedal') { const T = VT(t); return { name: 'bell', variant: (T && T.bell) || 'plain' }; }
    switch (key) {
      case 'scooty': return 'scooty_horn';
      case 'luna': return { name: 'scooter_horn', variant: 'dc', pitch: 1.12 };
      case 'rx100': return { name: 'scooter_horn', variant: 'dc' };
      case 'chetak': return 'scooter_horn';
      case 'auto': return 'auto_horn';
      case 'bus': return 'bus_horn';
      case 'lorry': return 'lorry_horn';
      case 'boat': return { name: 'bus_horn', pitch: 0.75 };
      case 'maruti800': return { name: 'car_horn', pitch: 1.12 };
      case 'padmini': return { name: 'car_horn', pitch: 1.05 };
      case 'ambassador': return 'car_horn';
      default: return null;
    }
  });

  /* ============================================================ cycle bells (modal, rendered in JS, cached) */
  // modes [ratio, amp, T60 s]; strikes per ring n at interval iv (rotary clapper trill), ring gap, tail
  const BELLS = {
    plain: { f: 2350, modes: [[1, 1, 0.9], [1.006, 0.5, 0.9], [2.32, 0.45, 0.6], [3.9, 0.25, 0.4], [5.6, 0.12, 0.28]], n: 8, iv: 0.031, gap: 0.38, tail: 0.95, amp: (k) => (k ? 0.55 : 1) * (1 - k * 0.05) },
    // Hero: the big chrome double-dome — lower, two domes beating, a slower lever clapper, a long shimmer
    hero: { f: 1700, modes: [[1, 1, 1.6], [1.013, 0.85, 1.5], [2.05, 0.45, 0.9], [2.072, 0.35, 0.85], [2.9, 0.32, 0.6], [4.2, 0.18, 0.4], [5.6, 0.1, 0.3], [0.51, 0.08, 1.2]], n: 12, iv: 0.036, gap: 0.47, tail: 1.5, amp: (k) => (k ? 0.65 : 1) * (1 - k * 0.04) },
    // Hercules: the small thumb-flick bell — two bright clean "ding"s (strike + a little rebound)
    hercules: { f: 3150, modes: [[1, 1, 0.55], [2.76, 0.4, 0.35], [5.4, 0.18, 0.22], [8.9, 0.07, 0.15]], n: 2, iv: 0.022, gap: 0.17, tail: 0.6, amp: (k) => (k ? 0.28 : 1) },
  };
  function* renderBell(sr, variant, rings) {
    const B = BELLS[variant] || BELLS.plain, rnd = prng(17 + rings * 3 + variant.length);
    const dur = (rings - 1) * B.gap + B.n * B.iv + B.tail, len = Math.ceil(dur * sr);
    const exc = new Float32Array(len), out = new Float32Array(len);
    for (let r = 0; r < rings; r++) for (let k = 0; k < B.n; k++) {
      const st = Math.round((r * B.gap + k * B.iv * (1 + (rnd() - 0.5) * 0.1)) * sr), a = B.amp(k) * (0.85 + 0.3 * rnd());
      for (let j = 0; j < 12 && st + j < len; j++) exc[st + j] += a * (rnd() * 2 - 1) * (1 - j / 12); // a short hammer contact
    }
    for (const [ratio, amp, t60] of B.modes) {
      yield;
      const w = TAU * B.f * ratio / sr, rad = Math.exp(-6.9 / (t60 * sr)), c1 = 2 * rad * Math.cos(w), c2 = -rad * rad, gn = amp * Math.sin(w);
      let y1 = 0, y2 = 0;
      for (let i = 0; i < len; i++) { const y = c1 * y1 + c2 * y2 + exc[i] * gn; y2 = y1; y1 = y; out[i] += y; if ((i & 16383) === 16383) yield; }
    }
    const fade = Math.round(0.08 * sr);
    for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
    return normPeak(out, 0.5);
  }
  function bellBuf(ac, variant, rings, lazy) { return buf(ac, 'bell:' + variant + ':' + rings, (sr) => renderBell(sr, variant, rings), lazy); }
  X.registerSfx('bell', (ac, out, t, o) => {
    const T = o.vtype && VT(o.vtype);
    const variant = BELLS[o.variant] ? o.variant : T && BELLS[T.bell] ? T.bell : 'plain', rings = clamp(Math.round(o.rings || 2), 1, 4);
    const b = bellBuf(ac, variant, rings, true);
    if (!b) { // not rendered yet (first ring right after unlock): a quick struck fallback, the real one is queued
      const B = BELLS[variant]; let e = t;
      for (let r = 0; r < rings; r++) for (let k = 0; k < Math.min(4, B.n); k++) e = strike(ac, out, t + r * B.gap + k * B.iv * 1.5, B.f * PO(o), BELL, 0.3 * B.amp(k), B.tail * 0.5);
      return e;
    }
    const s = ac.createBufferSource(); s.buffer = b;
    const rate = PO(o) * rr(0.985, 1.015);
    s.playbackRate.value = rate;
    s.connect(gain(ac, 1, out)); s.start(t);
    return t + s.buffer.duration / rate + 0.02;
  }, { cooldown: 0.3 });

  /* ============================================================ starts (built on the engine loops) */
  // An engine loop through a static muffler, revving along a rate curve [[t, firing Hz]] with a gain curve [[t, g]].
  function loopRev(ac, out, key, which, curve, gcurve, lpHz) {
    const D = DEF[key], b = engBuf(ac, key, which, true);
    if (!b) { // loop not rendered yet: a train of exhaust puffs along the same rev curve
      const end = gcurve[gcurve.length - 1][0];
      let tt = gcurve[0][0], i = 0;
      while (tt < end - 0.05) {
        while (i < curve.length - 1 && curve[i + 1][0] <= tt) i++;
        const f = curve[i][1];
        burst(ac, out, tt, { kind: 'pink', f: Math.min(1800, (lpHz || 900) * 0.6), q: 0.8, a: 0.002, r: Math.min(0.06, 1.2 / f), v: 0.35 * rr(0.6, 1) });
        tt += 1 / Math.max(10, f);
      }
      return end;
    }
    const s = ac.createBufferSource(); s.buffer = b; s.loop = true;
    const f0 = D[which].f0;
    s.playbackRate.setValueAtTime(curve[0][1] / f0, curve[0][0]);
    for (let i = 1; i < curve.length; i++) s.playbackRate.setTargetAtTime(curve[i][1] / f0, curve[i - 1][0], Math.max(0.02, (curve[i][0] - curve[i - 1][0]) / 3));
    const g = gain(ac, 0, out);
    g.gain.setValueAtTime(0, gcurve[0][0]);
    for (let i = 1; i < gcurve.length; i++) g.gain.linearRampToValueAtTime(gcurve[i][1], gcurve[i][0]);
    const lp = filt(ac, 'lowpass', lpHz || D.lp[0] * 1.6, 0.7, g);
    const pk = filt(ac, 'peaking', Array.isArray(D.pk.f) ? D.pk.f[0] : D.pk.f, D.pk.q, lp); pk.gain.value = Array.isArray(D.pk.g) ? D.pk.g[0] : D.pk.g;
    s.connect(pk);
    const end = gcurve[gcurve.length - 1][0];
    s.start(gcurve[0][0], Math.random() * 0.2); s.stop(end + 0.05);
    return end;
  }
  // compression strokes without a catch: soft "pff" puffs through the exhaust
  function puffs(ac, out, t, n, gap, f, v) { let e = t; for (let k = 0; k < n; k++) e = burst(ac, out, t + k * gap * (1 + k * 0.15), { kind: 'pink', f: f * rr(0.9, 1.1), q: 0.9, a: 0.006, r: 0.07, v: v * (1 - k * 0.12) }); return e; }
  function kick(ac, out, t, v) { // kick lever: the ratchet engages "chk", the foot shoves it down
    burst(ac, out, t, { ft: 'highpass', f: 1800, q: 1, a: 0.001, r: 0.03, v: 0.4 * v });
    strike(ac, out, t + 0.004, rr(900, 1100), METAL, 0.08 * v, 0.08);
    tone(ac, out, t + 0.02, { f: 150, f2: 80, a: 0.003, r: 0.1, v: 0.35 * v });
    for (let k = 0; k < 4; k++) burst(ac, out, t + 0.05 + k * 0.03, { f: 2800, q: 3, a: 0.001, r: 0.012, v: 0.1 * v });
  }
  function pitchKey(o) { // onVehicleEnter passes a pitch per 2-stroke: map it back to the type
    const kv = o.vtype && keyFor(o.vtype, X.engProfile(o.vtype));
    if (kv && DEF[kv]) return kv;
    const p = PO(o);
    return p > 1.45 ? 'scooty' : p > 1.3 ? 'luna' : p > 1.1 ? 'rx100' : p < 0.9 ? 'boat' : 'chetak';
  }
  X.registerSfx('chetak_start', (ac, out, t, o) => { // tilt, kick... no; kick — it catches, a blip of throttle, settles to putt-putt
    const key = pitchKey(o), D = DEF[key], fi = D.fIdle, one = key === 'scooty' || key === 'luna';
    let tc = t;
    if (!one) { kick(ac, out, t, 1); puffs(ac, out, t + 0.12, 3, 0.09, 420, 0.25); tc = t + 0.55; }
    kick(ac, out, tc, 1);
    const c = tc + 0.12, dur = o.dur || (one ? 0.95 : 1.05);
    loopRev(ac, out, key, 'c', [[c, fi * 0.7], [c + 0.08, fi * 1.25], [c + 0.3, fi * 2.1], [c + 0.6, fi * 1.05], [c + dur, fi]],
      [[c, 0], [c + 0.02, 0.5], [c + 0.3, 0.6], [c + 0.6, 0.42], [c + dur - 0.2, 0.4], [c + dur + 0.15, 0]], D.lp[0] * 1.8);
    return c + dur + 0.2;
  }, { cooldown: 0.8 });
  X.registerSfx('auto_start', (ac, out, t, o) => { // the driver yanks the starter lever (ratchet), once more, it catches with a rattle
    const D = DEF.auto, fi = D.fIdle;
    for (let pull = 0; pull < 2; pull++) {
      const tp = t + pull * 0.42;
      for (let k = 0; k < 7; k++) burst(ac, out, tp + k * 0.028, { f: 1800 + k * 120, q: 2, a: 0.001, r: 0.014, v: 0.14 });
      tone(ac, out, tp + 0.2, { f: 120, f2: 70, a: 0.003, r: 0.08, v: 0.25 });
      if (!pull) puffs(ac, out, tp + 0.08, 3, 0.07, 500, 0.22);
    }
    const c = t + 0.62, dur = o.dur || 0.95;
    loopRev(ac, out, 'auto', 'c', [[c, fi * 0.8], [c + 0.1, fi * 1.4], [c + 0.32, fi * 2], [c + 0.6, fi * 1.05], [c + dur, fi]],
      [[c, 0], [c + 0.02, 0.55], [c + 0.35, 0.6], [c + dur - 0.2, 0.45], [c + dur + 0.15, 0]], 1500);
    return c + dur + 0.2;
  }, { cooldown: 0.8 });
  X.registerSfx('car_start', (ac, out, t, o) => { // key click, starter "rrr-rrr-rrr" against compression, catch, flare, settle
    const kv = o.vtype && keyFor(o.vtype, X.engProfile(o.vtype)), key = kv && DEF[kv] && !DEF[kv].heavy ? kv : 'ambassador', D = DEF[key], fi = D.fIdle;
    burst(ac, out, t, { ft: 'highpass', f: 3000, a: 0.001, r: 0.015, v: 0.25 });
    const crank = 0.55, st = t + 0.08;
    const m = osc0(ac); m.type = 'sawtooth'; m.frequency.setValueAtTime(95, st); m.frequency.linearRampToValueAtTime(120, st + crank);
    const lp = filt(ac, 'lowpass', 900, 1, out);
    const g = gain(ac, 0, lp); m.connect(g);
    const hits = []; for (let k = 0; k * 0.135 < crank; k++) hits.push([st + k * 0.135, 1 - k * 0.04]); // compression strokes load the starter
    for (const [tt, a] of hits) { g.gain.setTargetAtTime(0.32 * a, tt, 0.012); g.gain.setTargetAtTime(0.14 * a, tt + 0.05, 0.03); }
    g.gain.setTargetAtTime(0, st + crank, 0.02);
    m.start(st); m.stop(st + crank + 0.2);
    burst(ac, out, st, { kind: 'pink', f: 2600, q: 1, a: 0.02, h: crank, r: 0.05, v: 0.035 }); // starter brushes
    const c = st + crank - 0.04, dur = o.dur || 0.95;
    loopRev(ac, out, key, 'c', [[c, fi * 0.6], [c + 0.12, fi * 1.6], [c + 0.3, fi * 2.3], [c + 0.65, fi * 1.1], [c + dur, fi]],
      [[c, 0], [c + 0.04, 0.6], [c + 0.3, 0.7], [c + dur - 0.2, 0.45], [c + dur + 0.15, 0]], 900);
    return c + dur + 0.2;
  }, { cooldown: 0.8 });
  X.registerSfx('diesel_start', (ac, out, t, o) => { // slow heavy starter grind, the diesel knocks into life, black-smoke rev, air release
    const key = o.vtype && keyFor(o.vtype, X.engProfile(o.vtype)) === 'lorry' ? 'lorry' : 'bus', D = DEF[key], fi = D.fIdle;
    const crank = 0.7;
    const m = osc0(ac); m.type = 'sawtooth'; m.frequency.setValueAtTime(70, t); m.frequency.linearRampToValueAtTime(85, t + crank);
    const lp = filt(ac, 'lowpass', 600, 1, out), g = gain(ac, 0, lp); m.connect(g);
    for (let k = 0; k * 0.19 < crank; k++) { g.gain.setTargetAtTime(0.38, t + k * 0.19, 0.015); g.gain.setTargetAtTime(0.16, t + k * 0.19 + 0.07, 0.04); }
    g.gain.setTargetAtTime(0, t + crank, 0.03);
    m.start(t); m.stop(t + crank + 0.2);
    const c = t + crank - 0.05, dur = o.dur || 0.95;
    loopRev(ac, out, key, 'c', [[c, fi * 0.55], [c + 0.15, fi * 1.5], [c + 0.4, fi * 2], [c + 0.7, fi * 1.05], [c + dur, fi]],
      [[c, 0], [c + 0.05, 0.7], [c + 0.4, 0.75], [c + dur - 0.2, 0.55], [c + dur + 0.15, 0]], 1500);
    burst(ac, out, c + dur - 0.1, { ft: 'highpass', f: 2500, q: 0.5, a: 0.01, h: 0.08, r: 0.3, v: 0.13 });
    return c + dur + 0.4;
  }, { cooldown: 1 });

  /* ============================================================ potholes: DHADAK by vehicle class */
  const POT = { // thud [f1, f2, r, v], dak [delay, f1, f2, r, v], rattle {n, lo, hi, v, span}, extras
    cycle: { thud: [150, 75, 0.09, 0.45], dak: [0.06, 125, 65, 0.08, 0.3], body: [800, 0.06, 0.3], rattle: { n: 4, lo: 2500, hi: 4200, v: 0.05, span: 0.12 }, bell: true },
    bike: { thud: [105, 52, 0.15, 0.6], dak: [0.08, 88, 48, 0.12, 0.42], body: [550, 0.08, 0.4], rattle: { n: 5, lo: 1500, hi: 3200, v: 0.05, span: 0.18 }, spring: [210, 160, 0.22, 0.07] },
    auto: { thud: [92, 50, 0.17, 0.55], dak: [0.09, 78, 45, 0.14, 0.4], body: [500, 0.08, 0.4], rattle: { n: 9, lo: 1800, hi: 4000, v: 0.055, span: 0.35 }, clank: [420, 0.12, 0.3], spring: [520, 470, 0.12, 0.025] },
    car: { thud: [76, 40, 0.22, 0.55], dak: [0.11, 66, 38, 0.16, 0.45], body: [420, 0.1, 0.45], rattle: { n: 3, lo: 1400, hi: 2600, v: 0.035, span: 0.15 }, clunk: [165, 110, 0.06, 0.25] },
    heavy: { thud: [56, 30, 0.35, 0.5], dak: [0.16, 50, 28, 0.25, 0.4], body: [320, 0.14, 0.5], rattle: { n: 12, lo: 1200, hi: 3500, v: 0.05, span: 0.6 }, clank: [260, 0.1, 0.4] },
  };
  function potClass(o) {
    const T = o.vtype && VT(o.vtype);
    if (T) return T.pedal ? 'cycle' : T.cls === 'bike' ? 'bike' : T.cls === 'auto' ? 'auto' : T.cls === 'heavy' ? 'heavy' : 'car';
    if (o.vtype && POT[o.vtype]) return o.vtype;
    const p = PO(o);
    return p <= 0.75 ? 'heavy' : p >= 1.1 ? 'bike' : 'car';
  }
  X.registerSfx('pothole', (ac, out, t, o) => {
    const C = POT[potClass(o)], v = 1; // the strip applies o.vol (speed)
    const th = C.thud, dk = C.dak;
    tone(ac, out, t, { f: th[0] * rr(0.95, 1.05), f2: th[1], glide: th[2] * 0.6, a: 0.0015, r: th[2], v: th[3] * v });
    burst(ac, out, t, { kind: 'brown', ft: 'lowpass', f: C.body[0], a: 0.001, r: C.body[1], v: C.body[2] * v });
    tone(ac, out, t + dk[0], { f: dk[1] * rr(0.95, 1.05), f2: dk[2], glide: dk[3] * 0.6, a: 0.0015, r: dk[3], v: dk[4] * v }); // "-dak": the wheel climbs out
    burst(ac, out, t + dk[0], { kind: 'brown', ft: 'lowpass', f: C.body[0] * 0.8, a: 0.001, r: C.body[1] * 0.7, v: C.body[2] * 0.6 * v });
    let e = t + dk[0] + dk[3] * 1.2;
    const R = C.rattle;
    for (let k = 0; k < R.n; k++) e = Math.max(e, strike(ac, out, t + 0.03 + R.span * (k / R.n) * rr(0.7, 1.1), rr(R.lo, R.hi), METAL, R.v * (1 - k / (R.n + 2)), 0.05));
    if (C.clunk) tone(ac, out, t + 0.02, { f: C.clunk[0], f2: C.clunk[1], a: 0.001, r: C.clunk[2], v: C.clunk[3] * v }); // bump stop
    if (C.clank) e = Math.max(e, strike(ac, out, t + 0.015, C.clank[0] * rr(0.95, 1.05), METAL, C.clank[1] * v, C.clank[2]));
    if (C.spring) e = Math.max(e, tone(ac, out, t + 0.03, { type: 'triangle', f: C.spring[0], f2: C.spring[1], glide: C.spring[2], a: 0.004, r: C.spring[2], v: C.spring[3] * v, vib: [11, 6] }));
    if (C.bell) for (let k = 0; k < 3; k++) strike(ac, out, t + 0.02 + k * 0.035, 2350 * rr(0.99, 1.01), BELL, 0.03 * (1 - k * 0.25), 0.25); // the bell jingles
    if (o.variant === 'wet') { // rain-filled: a muddy splash and droplets
      burst(ac, out, t + 0.01, { ft: 'lowpass', f: 3800, f2: 600, sweep: 0.35, q: 0.7, a: 0.003, r: 0.45, v: 0.4 * v });
      tone(ac, out, t + 0.03, { f: 210, f2: 120, glide: 0.12, a: 0.004, r: 0.12, v: 0.16 * v });
      for (let k = 0; k < 4; k++) { const f = rr(700, 1600); tone(ac, out, t + rr(0.08, 0.45), { f, f2: f * 1.7, glide: 0.04, a: 0.002, r: 0.04, v: 0.05 }); }
      e = Math.max(e, t + 0.6);
    }
    return e + 0.05;
  }, { cooldown: 0.06 });

  /* ============================================================ idle-time prewarm + environment tracking */
  let warming = false;
  function warmAll(ac) { // most common first; each item renders in idle slices (pump)
    const sr = ac.sampleRate;
    const order = ['auto', 'chetak', 'scooty', 'ambassador', 'bus'].concat(TYPES.filter((k) => !/^(auto|chetak|scooty|ambassador|bus)$/.test(k)));
    order.slice(0, 5).forEach((k) => { for (const w of ['c', 'l']) want(loopKey(k, w), sr, (r) => renderLoop(r, Object.assign({ hp: DEF[k].hp }, DEF[k][w]), DEF[k].seed + (w === 'l' ? 7 : 0))); });
    want('ratchet', sr, renderRatchet); want('crank', sr, renderCrank); want('grit', sr, renderGrit);
    for (const v of ['plain', 'hero', 'hercules']) { want('bell:' + v + ':2', sr, (r) => renderBell(r, v, 2)); want('bell:' + v + ':1', sr, (r) => renderBell(r, v, 1)); }
    order.slice(5).forEach((k) => { for (const w of ['c', 'l']) want(loopKey(k, w), sr, (r) => renderLoop(r, Object.assign({ hp: DEF[k].hp }, DEF[k][w]), DEF[k].seed + (w === 'l' ? 7 : 0))); });
  }
  X.onUpdate('vehicles', (dt, mode, info) => {
    env.bed = info.bed; env.t -= dt;
    if (env.t <= 0) { env.t = 0.5; env.wet = isWet(); }
    if (!warming && X.ctx) { warming = true; try { warmAll(X.ctx); } catch (e) { err('warmAll', e); } }
  }, 5);

  /* ============================================================ test hooks */
  // Drive a voice through a scripted ride inside an OfflineAudioContext (suspend/resume = real currentTime per frame).
  // o: {player (default true), surface, script [[from, to, thr]] (fractions of sec; thr -1 = brake), dop, frame (s)}
  const SCRIPT = [[0, 0.1, 0], [0.1, 0.55, 1], [0.55, 0.65, 'cruise'], [0.65, 0.72, 1], [0.72, 0.84, 0], [0.84, 0.92, -1], [0.92, 1, 0]];
  function drive(oc, out, type, sec, o, fixed) {
    o = o || {};
    const T = VT(type) || {};
    const veh = { type, x: 0, y: 0, speed: 0, throttle: 0, ctl: { brake: false }, slip: 0, surf: o.surface || 'asphalt' };
    const v = factory(oc, out, type, X.engProfile(type), veh, o.player !== false);
    if (!v) return null;
    const max = T.maxSpeed || 120, acc = (T.accel || 80) / max * (o.accelMul || 0.4), drag = ((T.drag || 28) + 4) / max, brk = (T.brake || 180) / max;
    const log = [];
    const step = (o.frame || 0.0174);
    const q = Math.round(step * oc.sampleRate / 128) * 128 / oc.sampleRate;
    let sf = fixed ? fixed.sf : 0, tPrev = 0;
    const script = o.script || SCRIPT;
    for (let tt = q; tt < sec - 0.05; tt += q) {
      oc.suspend(tt).then(() => {
        const dt = tt - tPrev; tPrev = tt;
        let thr = 0, ph = null;
        if (fixed) thr = fixed.thr;
        else {
          const u = tt / sec;
          ph = script.find((s) => u >= s[0] && u < s[1]) || script[script.length - 1];
          thr = ph[2] === 'cruise' ? 0.35 : ph[2];
          if (ph[2] === 'cruise') { /* hold speed */ } else if (thr > 0) sf += acc * thr * (0.35 + 0.65 * (1 - Math.pow(Math.min(1, sf), 2.2))) * dt;
          else if (thr < 0) sf = Math.max(0, sf - brk * dt);
          else sf = Math.max(0, sf - drag * dt);
          sf = Math.min(sf, 1);
        }
        veh.speed = sf * max; veh.throttle = thr; veh.ctl.brake = thr < 0;
        v.update(sf, Math.max(0, thr), 1, 0, { veh, player: o.player !== false, dt, dop: o.dop || 1, dist: 0, spatialized: true });
        const s = v.st;
        log.push({ t: +tt.toFixed(4), sf: +sf.toFixed(4), thr, f: +(s.f || 0).toFixed(2), gear: s.gear, shifting: s.shifting, load: +s.load.toFixed(3) });
        oc.resume();
      });
    }
    A.lastLog = log; A.lastVoice = { type, key: v.key, nodes: v.nodes };
    return v;
  }
  const A = {
    types: TYPES.concat(['cycle', 'hero_cycle', 'hercules_cycle']),
    DEF, BELLS, factory, lastLog: null, lastVoice: null,
    sweep(oc, out, type, sec, o) { drive(oc, out, type, sec, o); return sec; },
    // constant-speed roll on a surface with the engine silent (tyres only)
    road(oc, out, surface, sec, o) {
      o = Object.assign({ surface }, o || {});
      const v = drive(oc, out, o.type || 'ambassador', sec, o, { sf: o.sf || 0.6, thr: 0.4 });
      if (v && v.vol) v.vol.disconnect();
      if (v && v.wG) v.wG.disconnect();
      return sec;
    },
    nodes(type, player) {
      const ac = new OfflineAudioContext(1, 128, 44100);
      const v = factory(ac, ac.destination, type, X.engProfile(type), null, player);
      if (!v) return 0;
      const n = v.nodes; v.stop(); return n;
    },
    // the longest single idle-time render step (ms) over every buffer, fresh, at sr
    sliceMax(sr) {
      sr = sr || 48000;
      const gens = [];
      for (const k of TYPES) for (const w of ['c', 'l']) gens.push([k + ':' + w, renderLoop(sr, Object.assign({ hp: DEF[k].hp }, DEF[k][w]), 1)]);
      gens.push(['ratchet', renderRatchet(sr)], ['crank', renderCrank(sr)], ['grit', renderGrit(sr)], ['bell:hero', renderBell(sr, 'hero', 2)], ['bell:plain', renderBell(sr, 'plain', 2)]);
      let mx = 0, tot = 0, at = ''; const per = {}, all = [];
      for (const [name, g] of gens) { let r, i = 0; do { const t0 = performance.now(); r = g.next(); const d = performance.now() - t0; if (d > mx) { mx = d; at = name + '#' + i; } tot += d; all.push(d); per[name] = +((per[name] || 0) + d).toFixed(1); i++; } while (!r.done); }
      all.sort((x, y) => x - y);
      return { maxMs: +mx.toFixed(2), at, p99Ms: +all[Math.floor(all.length * 0.99)].toFixed(2), steps: all.length, totalMs: Math.round(tot), per };
    },
    // render cost of n voices for sec seconds offline (audio thread; OfflineAudioContext suspend() is itself slow in Chrome,
    // so no per-frame suspends here) vs the same count of built-in voices, + the JS cost of one update() call (main thread)
    async bench(n, sec) {
      const kinds = ['auto', 'chetak', 'ambassador', 'bus', 'rx100', 'scooty', 'lorry', 'maruti800'];
      const run = async (mine) => {
        const oc = new OfflineAudioContext(2, Math.ceil(44100 * sec), 44100), out = oc.destination, voices = [];
        for (let i = 0; mine !== null && i < n; i++) {
          const ty = kinds[i % kinds.length];
          const v = mine ? factory(oc, out, ty, X.engProfile(ty), null, i === 0) : new N.audio._internal.EngineVoice(oc, out, ty);
          v.update(0.6, 0.6, 0.5, 0, { dt: 0.016, dop: 1, spatialized: true }); voices.push(v);
        }
        const t0 = performance.now(); await oc.startRendering(); return performance.now() - t0;
      };
      const base = await run(null), mine = await run(true), builtin = await run(false);
      const oc = new OfflineAudioContext(1, 4410, 44100), v = factory(oc, oc.destination, 'rx100', X.engProfile('rx100'), null, true);
      const t0 = performance.now();
      for (let i = 0; i < 2000; i++) v.update(0.5 + 0.45 * Math.sin(i * 0.01), i % 300 < 200 ? 1 : 0, 1, 0, { dt: 0.016, dop: 1, spatialized: true });
      const updUs = (performance.now() - t0) / 2000 * 1000;
      return { n, sec, msEmpty: Math.round(base), ms: Math.round(mine), msBuiltin: Math.round(builtin), realtimeFrac: +(Math.max(0, mine - base) / (sec * 1000)).toFixed(4), updUs: +updUs.toFixed(1) };
    },
  };
  N.audio.vehicles = A;
})();
