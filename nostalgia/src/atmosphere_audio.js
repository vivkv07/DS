/* NOSTALGIA — atmosphere_audio.js (atmosphere layer) — design/atmosphere.md "Sound" lines, ARCHITECTURE §17 / §22
 *
 * The soundscape of wind, rain and birds, synthesised on top of N.audio's AudioContext (never creates its
 * own live context; nothing is built before N.audio.ctx exists, so it never throws headless / muted / blocked).
 *
 *   ctx.destination <- softclip <- limiter <- master (v2(master) | 0 when muted) <- world (mode duck)
 *                      <- muffle LP (menus) <- amb bus (v2(ambient)) : rain beds, wind, thunder, petrichor
 *                                           <- sfx bus (v2(sfx))     : birds, paper-boat splash
 *   rain beds go through a "cover" low-pass first (inside a car / an auto with its side covers down)
 *
 * BEDS (continuous, each a looping pre-rendered buffer -> filter(s) -> gain; started on demand and torn down
 * after 5 s of silence, so a dry day costs nothing):
 *   hiss     distant broadband rain wash (pink, brightness rises with intensity)
 *   light    sparse close drops (drizzle)           dense   heavy close patter (downpour, more over water)
 *   tin      rain on tin roofs: rattling metallic patter + granular pings (Old City / market / colony)
 *   sheet    rain on asbestos sheets: duller pats + thuds          leaves  soft high patter on trees
 *   gutter   gurgling gutters and spouts near buildings (keeps running while the ground is wet)
 *   roof     inside a car / bus / auto: drumming on the roof (outside beds muffled by the cover LP)
 *   tyreP / tyreT   tyres hissing on wet roads (the player's vehicle, the strongest nearby traffic) when wet > 0.3
 *   wind     low wind bed following N.wind.strength + the travelling gust at the listener
 *   whistle  whistle through wires and lanes (strong wind, near buildings)
 *   rustle   leaf rustle swells (wind near trees)    howl   storm howl (N.weather.storm)
 * GRAINS (one-shot buffers, granular, voice capped): tin pings, drips (drip-drip after the rain while wet,
 *   also from leaves / eaves in light rain), dust drops (petrichor).
 * EVENTS: 'weather:lightning' {x, y, dist, power, delay} -> thunder scheduled at +delay (near < 600 u: crack +
 *   tearing + boom + long roll; far: low distant rolls; level / brightness by distance; limiter, never clips),
 *   'weather:petrichor' -> first fat drops on dry dust, 'paperboat' {x, y} -> a tiny splash,
 *   'audio:settings' / 'audio:unlocked' -> volumes / build.
 *
 * PUBLIC API — N.atmosAudio
 *   sfx(name, {x, y, vol, n, pitch, delay, force}) -> bool   positional bird sounds (distance attenuation, air
 *        absorption, pan relative to N.atmos.focus(), culled beyond 700 u, per-name cooldowns, 8-voice cap):
 *        flap (n = flock size), parakeet, myna, egret, bat, kite_whistle, crow (-> N.audio 'crow_caw'),
 *        coo, pigeons (-> N.audio). Never throws; false when not played.
 *   SFX_NAMES, BED_NAMES, DEMOS
 *   stats() -> {ready, enabled, voices, beds: {name: level}, on: [running beds], env, grains, thunder, cpu}
 *   enabled, setEnabled(bool)
 *   renderOffline(name, sec, opts) -> Promise<{peak, rms, buffer}> | Promise<null> without OfflineAudioContext
 *        name: a bird sfx, or a demo: rain, rain_light, rain_heavy, tin, sheet, leaves, gutter, drips, tyres, roof,
 *        wind, whistle, rustle, storm, thunder_near, thunder_far, petrichor, paperboat
 *   meter() -> live RMS of this layer's output (tests)
 * CPU: env scan every 0.5 s (one queryStructures over a 340 u box), vehicles every 0.15 s, AudioParam targets at
 *   10 Hz only when they change, grain lookahead 0.15 s; buffers rendered in idle slices after unlock; nothing
 *   runs while the tab is hidden, on the title screen the beds fade out and stop.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext || null;
  const TAU = Math.PI * 2;
  const rnd = Math.random;
  const rr = (a, b) => a + rnd() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const v2 = (v) => v * v;
  const err = (w, e) => { try { N.err('atmosAudio.' + w, e); } catch (e2) { /* ignore */ } };

  /* ================================================================ node helpers (context-agnostic) */
  function kr(p) { try { if (p && 'automationRate' in p) p.automationRate = 'k-rate'; } catch (e) { /* keep a-rate */ } return p; }
  function gain(ac, v, dest) { const g = ac.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  function filt(ac, type, f, q, dest) {
    const b = ac.createBiquadFilter(); b.type = type; kr(b.frequency); kr(b.Q); b.frequency.value = f;
    if (q != null) b.Q.value = q;
    if (dest) b.connect(dest);
    return b;
  }
  function panner(ac, dest) {
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); if (dest) p.connect(dest); return p; }
    const g = gain(ac, 1, dest); g.pan = { value: 0, setValueAtTime() {}, setTargetAtTime() {} }; return g;
  }
  function osc(ac, type) { const o = ac.createOscillator(); if (type) o.type = type; kr(o.frequency); return o; }
  function setT(param, v, t, tc) { try { param.cancelScheduledValues(t); param.setTargetAtTime(v, t, tc); } catch (e) { param.value = v; } }
  // envelope on a gain param: 0 -> v (a) -> hold (h) -> exp release (r)
  function env(param, t, a, h, r, v) {
    param.setValueAtTime(0, t); param.linearRampToValueAtTime(v, t + a);
    if (h) param.setValueAtTime(v, t + a + h);
    param.setTargetAtTime(0, t + a + h, r / 4);
    return t + a + h + r * 1.3;
  }
  // tone: {type, f, f2, glide, a, h, r, v, vib: [rate, depth], am: [rate, depth]}
  function tone(ac, dest, t, o) {
    const os = osc(ac, o.type || 'sine');
    os.frequency.setValueAtTime(o.f, t);
    if (o.f2) os.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.glide || 0.1));
    const g = gain(ac, 0, dest);
    const end = env(g.gain, t, o.a || 0.004, o.h || 0, o.r || 0.06, o.v == null ? 0.2 : o.v);
    os.connect(g); os.start(t); os.stop(end + 0.02);
    if (o.vib) { const l = osc(ac, 'sine'); l.frequency.value = o.vib[0]; l.connect(gain(ac, o.vib[1], os.frequency)); l.start(t); l.stop(end + 0.02); }
    return end;
  }
  function noiseSrc(ac, kind, t, dur) {
    const s = ac.createBufferSource(); s.buffer = getBuf(ac, kind, true); s.loop = true;
    s.start(t, rnd() * 1.5); s.stop(t + dur + 0.05);
    return s;
  }
  // filtered noise burst: {kind, ft, f, f2, q, a, h, r, v}
  function burst(ac, dest, t, o) {
    const fl = filt(ac, o.ft || 'bandpass', o.f || 1500, o.q == null ? 1 : o.q);
    fl.frequency.setValueAtTime(o.f || 1500, t);
    if (o.f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.sweep || (o.a || 0.002) + (o.h || 0) + (o.r || 0.05)));
    const g = gain(ac, 0, dest); fl.connect(g);
    const end = env(g.gain, t, o.a || 0.002, o.h || 0, o.r || 0.05, o.v == null ? 0.3 : o.v);
    const s = noiseSrc(ac, o.kind || 'white', t, end - t + 0.05); s.connect(fl);
    return end;
  }
  // percussive pulses on one param (sorted list of [time, amp])
  function pulses(param, list, peak, tc) {
    list.sort((a, b) => a[0] - b[0]);
    param.setValueAtTime(0, Math.max(0, list.length ? list[0][0] - 0.01 : 0));
    for (const p of list) { param.setValueAtTime(peak * p[1], p[0]); param.setTargetAtTime(0, p[0] + 0.0015, tc); }
  }
  let SOFT = null;
  function softCurve() {
    if (SOFT) return SOFT;
    SOFT = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) { const x = (i / 2047) * 2 - 1, a = Math.abs(x); SOFT[i] = a < 0.7 ? x : Math.sign(x) * (0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28)); }
    return SOFT;
  }

  /* ================================================================ pre-rendered buffers */
  // cached per sample rate; generated in idle slices after unlock (or synchronously for offline renders)
  const STORE = new Map(); // sr -> {name: AudioBuffer}
  const store = (sr) => { let s = STORE.get(sr); if (!s) { s = {}; STORE.set(sr, s); } return s; };
  const onePole = (fc, sr) => 1 - Math.exp(-TAU * fc / sr);
  function normalise(chs, rmsT, peakMax) {
    let pk = 0, sum = 0, n = 0;
    for (const d of chs) for (let i = 0; i < d.length; i++) { const v = d[i], a = v < 0 ? -v : v; if (a > pk) pk = a; sum += v * v; n++; }
    const rms = Math.sqrt(sum / Math.max(1, n));
    if (!rms || !pk) return;
    const k = Math.min(rmsT / rms, peakMax / pk);
    for (const d of chs) for (let i = 0; i < d.length; i++) d[i] *= k;
  }
  function dcBlock(d, sr, fc) { const a = onePole(fc, sr); let lp = 0; for (let i = 0; i < d.length; i++) { lp += (d[i] - lp) * a; d[i] -= lp; } }
  function seam(d) { const L = d.length, f = Math.min(2048, L >> 4); for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[L - f + i] * (1 - k); } }
  function pinkFill(d, amp) {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = rnd() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] += (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11 * amp; b6 = w * 0.115926;
    }
  }
  // one drop written circularly (seamless loops): a noise tick + an optional pitched blip / sweep
  function drop(d, sr, i0, amp, o) {
    const L = d.length;
    const nLen = Math.floor((o.nTau || 0.0008) * sr * 5), fLen = o.f ? Math.floor((o.fTau || 0.004) * sr * 5) : 0;
    const len = Math.max(nLen, fLen), nk = 1 / ((o.nTau || 0.0008) * sr), fk = o.f ? 1 / ((o.fTau || 0.004) * sr) : 0;
    const nA = o.nA == null ? 1 : o.nA, fA = o.fA == null ? 0.6 : o.fA;
    let ph = 0, f = o.f || 0;
    const df = o.f2 ? (o.f2 - o.f) / Math.max(1, fLen) : 0;
    let lp = 0; const la = o.nLP ? onePole(o.nLP, sr) : 1;
    for (let k = 0; k < len; k++) {
      let v = 0;
      if (k < nLen) { lp += (rnd() * 2 - 1 - lp) * la; v += lp * Math.exp(-k * nk) * nA; }
      if (fLen && k < fLen) { ph += TAU * f / sr; f += df; v += Math.sin(ph) * Math.exp(-k * fk) * fA * (k < 24 ? k / 24 : 1); }
      d[(i0 + k) % L] += v * amp;
    }
  }
  // inharmonic modal ring (metal): partial ratios / amps, decay tau (s)
  function ring(d, sr, i0, amp, f0, ratios, amps, tau) {
    const L = d.length, len = Math.min(L - 1, Math.floor(tau * sr * 4.5)), dk = Math.exp(-1 / (tau * sr));
    for (let p = 0; p < ratios.length; p++) {
      const f = f0 * ratios[p]; if (f > sr * 0.45) continue;
      const w = TAU * f / sr, c = 2 * Math.cos(w);
      let s2 = 0, s1 = Math.sin(w), e = amp * amps[p]; // s[0] = 0, s[1] = sin(w), s[k] = c s[k-1] - s[k-2]
      const dkp = Math.pow(dk, 1 + p * 0.6); // higher partials die first
      for (let k = 1; k < len; k++) { d[(i0 + k) % L] += s1 * e; const s = c * s1 - s2; s2 = s1; s1 = s; e *= dkp; }
    }
    // the strike itself
    for (let k = 0; k < Math.floor(sr * 0.0015); k++) d[(i0 + k) % L] += (rnd() * 2 - 1) * amp * 0.5 * (1 - k / (sr * 0.0015));
  }
  const powAmp = (p) => 0.12 + 0.88 * Math.pow(rnd(), p);
  const GEN = {
    pink: { sec: 4, ch: 2, fn(chs) { for (const d of chs) { pinkFill(d, 1); seam(d); } return [0.2, 0.95]; } },
    brown: { sec: 4, ch: 2, fn(chs) { for (const d of chs) { let b = 0; for (let i = 0; i < d.length; i++) { b = (b + 0.02 * (rnd() * 2 - 1)) / 1.02; d[i] = b; } seam(d); } return [0.2, 0.95]; } },
    white: { sec: 2, ch: 1, fn(chs) { for (const d of chs) for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; return [0.3, 0.95]; } },
    dropsLight: { sec: 4, ch: 2, fn(chs, sr) {
      for (const d of chs) {
        pinkFill(d, 0.012);
        const n = Math.floor(d.length / sr * 42);
        for (let k = 0; k < n; k++) drop(d, sr, (rnd() * d.length) | 0, powAmp(3), { nTau: rr(0.0004, 0.0012), nA: 0.8, f: rr(1700, 5200), fTau: rr(0.0015, 0.005), fA: 0.55, f2: 0, nLP: rr(3000, 9000) });
        dcBlock(d, sr, 300);
      }
      return [0.12, 0.9];
    } },
    dropsDense: { sec: 3, ch: 2, fn(chs, sr) {
      for (const d of chs) {
        pinkFill(d, 0.05);
        const n = Math.floor(d.length / sr * 850);
        for (let k = 0; k < n; k++) drop(d, sr, (rnd() * d.length) | 0, powAmp(2.2) * 0.5, { nTau: rr(0.0003, 0.0009), nA: 1, f: rnd() < 0.5 ? rr(2500, 7000) : 0, fTau: rr(0.001, 0.003), fA: 0.4, nLP: rr(4000, 12000) });
        dcBlock(d, sr, 250);
      }
      return [0.18, 0.9];
    } },
    tin: { sec: 3, ch: 2, fn(chs, sr) {
      for (const d of chs) {
        const n = Math.floor(d.length / sr * 48);
        for (let k = 0; k < n; k++) {
          const i0 = (rnd() * d.length) | 0, a = powAmp(2.5) * 0.35, f0 = rr(650, 2300);
          ring(d, sr, i0, a, f0, [1, 2.32, 3.87, 5.12], [1, 0.6, 0.38, 0.22], rr(0.012, 0.045));
          if (rnd() < 0.18) ring(d, sr, i0 + Math.floor(sr * rr(0.006, 0.016)), a * 0.45, f0 * rr(0.97, 1.03), [1, 2.32, 3.87], [1, 0.5, 0.3], 0.015); // rattle
        }
        const m = Math.floor(d.length / sr * 260); // the fine patter on corrugations
        for (let k = 0; k < m; k++) drop(d, sr, (rnd() * d.length) | 0, powAmp(2) * 0.18, { nTau: rr(0.0003, 0.0008), nA: 1, f: rr(3000, 6500), fTau: 0.0015, fA: 0.5, nLP: 8000 });
        dcBlock(d, sr, 400);
      }
      return [0.14, 0.9];
    } },
    sheet: { sec: 3, ch: 2, fn(chs, sr) {
      for (const d of chs) {
        const n = Math.floor(d.length / sr * 150);
        for (let k = 0; k < n; k++) drop(d, sr, (rnd() * d.length) | 0, powAmp(2), { nTau: rr(0.002, 0.006), nA: 0.9, nLP: rr(900, 2600), f: rr(170, 330), fTau: rr(0.005, 0.012), fA: 0.7 });
        const m = Math.floor(d.length / sr * 5); // the odd heavy drip off the sheet's edge
        for (let k = 0; k < m; k++) drop(d, sr, (rnd() * d.length) | 0, rr(0.8, 1.4), { nTau: 0.006, nA: 0.8, nLP: 1500, f: rr(120, 200), fTau: 0.02, fA: 0.9 });
        dcBlock(d, sr, 90);
      }
      return [0.16, 0.9];
    } },
    leaves: { sec: 4, ch: 2, fn(chs, sr) {
      for (const d of chs) {
        const n = Math.floor(d.length / sr * 230);
        for (let k = 0; k < n; k++) drop(d, sr, (rnd() * d.length) | 0, rr(0.15, 0.55), { nTau: rr(0.0004, 0.0011), nA: 1, nLP: rr(5000, 12000) });
        const m = Math.floor(d.length / sr * 7);
        for (let k = 0; k < m; k++) drop(d, sr, (rnd() * d.length) | 0, rr(0.5, 1), { nTau: rr(0.002, 0.004), nA: 0.8, nLP: 3500, f: rr(900, 1600), fTau: 0.004, fA: 0.3 });
        // clusters of leaves catching more rain: slow swells
        const p1 = rnd() * TAU, p2 = rnd() * TAU, L = d.length;
        for (let i = 0; i < L; i++) d[i] *= 0.75 + 0.18 * Math.sin(TAU * 1 * i / L + p1) + 0.07 * Math.sin(TAU * 3 * i / L + p2);
        dcBlock(d, sr, 1200);
      }
      return [0.12, 0.9];
    } },
    gutter: { sec: 4, ch: 2, fn(chs, sr) {
      for (const d of chs) {
        const L = d.length, a1 = onePole(1700, sr), a2 = onePole(380, sr);
        let l1 = 0, l2 = 0, am = 0.5, amT = 0.5, nextAm = 0;
        for (let i = 0; i < L; i++) {
          const w = rnd() * 2 - 1; l1 += (w - l1) * a1; l2 += (w - l2) * a2;
          if (i >= nextAm) { amT = rr(0.2, 1); nextAm = i + Math.floor(sr * rr(0.04, 0.18)); }
          am += (amT - am) * 0.0015;
          d[i] = (l1 - l2) * am * 0.7;
        }
        // bubbles: short rising sine chirps (the gurgle)
        const n = Math.floor(L / sr * 16);
        for (let k = 0; k < n; k++) {
          const i0 = (rnd() * L) | 0, f1 = rr(260, 760), f2 = f1 * rr(1.3, 2.3), len = Math.floor(sr * rr(0.018, 0.05)), amp = rr(0.15, 0.6);
          let ph = 0;
          for (let j = 0; j < len; j++) { const f = f1 + (f2 - f1) * (j / len); ph += TAU * f / sr; const e = Math.sin(Math.PI * j / len); d[(i0 + j) % L] += Math.sin(ph) * e * e * amp; }
        }
        seam(d); dcBlock(d, sr, 120);
      }
      return [0.15, 0.9];
    } },
  };
  // grain sets (mono, short): tin pings, drips, dust drops
  const GRAINS = {
    ping: { n: 6, sec: 0.35, fn(d, sr) { ring(d, sr, 0, 0.6, rr(1500, 4200), [1, 2.76, 5.4, 8.93], [1, 0.5, 0.3, 0.12], rr(0.04, 0.09)); } },
    drip: { n: 6, sec: 0.25, fn(d, sr) {
      const f1 = rr(650, 1500), len = Math.floor(sr * rr(0.03, 0.06)); let ph = 0;
      for (let j = 0; j < len; j++) { const f = f1 * (1 + 0.8 * j / len); ph += TAU * f / sr; d[j] += Math.sin(ph) * Math.exp(-j / (sr * 0.012)) * (j < 30 ? j / 30 : 1) * 0.7; }
      drop(d, sr, 0, 0.35, { nTau: 0.0006, nA: 1, nLP: 6000 });
      if (rnd() < 0.5) drop(d, sr, Math.floor(sr * rr(0.07, 0.12)), 0.12, { nTau: 0.0005, f: f1 * 1.9, fTau: 0.004, fA: 0.6 }); // a little rebound droplet
    } },
    dust: { n: 4, sec: 0.35, fn(d, sr) {
      drop(d, sr, 0, 1, { nTau: rr(0.004, 0.007), nA: 1, nLP: rr(700, 1200), f: rr(110, 190), fTau: rr(0.012, 0.02), fA: 0.8 });
      const m = 6 + ((rnd() * 6) | 0); // grit settling
      for (let k = 0; k < m; k++) drop(d, sr, Math.floor(sr * rr(0.01, 0.12)), rr(0.04, 0.12), { nTau: 0.0004, nA: 1, nLP: 5000 });
    } },
  };
  function buildBuf(ac, name) {
    const sr = ac.sampleRate, st = store(sr);
    if (st[name]) return st[name];
    if (GEN[name]) {
      const G = GEN[name], len = Math.floor(sr * G.sec), b = ac.createBuffer(G.ch, len, sr);
      const chs = []; for (let c = 0; c < G.ch; c++) chs.push(b.getChannelData(c));
      const nm = G.fn(chs, sr); normalise(chs, nm[0], nm[1]);
      return (st[name] = b);
    }
    const m = /^(ping|drip|dust)(\d)$/.exec(name);
    if (m && GRAINS[m[1]]) {
      const G = GRAINS[m[1]], b = ac.createBuffer(1, Math.floor(sr * G.sec), sr), d = b.getChannelData(0);
      G.fn(d, sr); normalise([d], 0.12, 0.85);
      return (st[name] = b);
    }
    return null;
  }
  function getBuf(ac, name, sync) {
    const st = store(ac.sampleRate);
    if (st[name]) return st[name];
    if (!sync) return null;
    return buildBuf(ac, name);
  }
  const GRAIN_NAMES = [];
  for (const k in GRAINS) for (let i = 0; i < GRAINS[k].n; i++) GRAIN_NAMES.push(k + i);
  const BUILD_ORDER = ['white', 'pink', 'dropsLight', 'dropsDense', 'brown', 'tin', 'sheet', 'leaves', 'gutter'].concat(GRAIN_NAMES);

  /* ================================================================ bed definitions + mix */
  // chain: series filters [type, f, q]; par: parallel filters (summed); lvl = gain at full intensity
  const BEDDEF = {
    hiss: { buf: 'pink', bus: 'rain', chain: [['highpass', 160, 0.5], ['lowpass', 1600, 0.5]], lvl: 0.32 },
    light: { buf: 'dropsLight', bus: 'rain', chain: [['highpass', 700, 0.6]], lvl: 0.34 },
    dense: { buf: 'dropsDense', bus: 'rain', chain: [['lowpass', 7500, 0.5]], lvl: 0.34 },
    tin: { buf: 'tin', bus: 'rain', chain: [['highpass', 500, 0.6]], lvl: 0.27 },
    sheet: { buf: 'sheet', bus: 'rain', chain: [['lowpass', 2600, 0.6]], lvl: 0.24 },
    leaves: { buf: 'leaves', bus: 'rain', chain: [['highpass', 1500, 0.5]], lvl: 0.24 },
    gutter: { buf: 'gutter', bus: 'rain', chain: [['lowpass', 2600, 0.6]], lvl: 0.18 },
    roof: { buf: 'sheet', bus: 'amb', chain: [['lowpass', 1500, 0.7]], lvl: 0.32 },
    tyreP: { buf: 'white', bus: 'amb', chain: [['bandpass', 3200, 0.6], ['highpass', 900, 0.5]], pan: true, lvl: 0.2 },
    tyreT: { buf: 'white', bus: 'amb', chain: [['bandpass', 2600, 0.7], ['highpass', 800, 0.5]], pan: true, lvl: 0.16 },
    wind: { buf: 'brown', bus: 'amb', chain: [['lowpass', 420, 0.7]], lvl: 0.3 },
    whistle: { buf: 'pink', bus: 'amb', chain: [['bandpass', 950, 10], ['bandpass', 950, 3]], lvl: 0.4 },
    rustle: { buf: 'pink', bus: 'amb', chain: [['highpass', 1900, 0.5], ['lowpass', 7500, 0.5]], lvl: 0.22 },
    howl: { buf: 'brown', bus: 'amb', par: [['bandpass', 300, 5], ['bandpass', 480, 7], ['lowpass', 160, 0.7]], lvl: 0.45 },
  };
  const BED_NAMES = Object.keys(BEDDEF);
  const RAIN_TRIM = 0.7; // the outside rain beds' bus: cosy, under the music and the district ambience
  const STYLE_MAT = { // [tin, asbestos sheet, gutters]
    oldcity: [1, 0.55, 1], market: [0.9, 0.85, 1], colony: [0.7, 0.75, 0.9], colonial: [0.4, 0.35, 0.8], cantonment: [0.35, 0.55, 0.7],
    posh: [0.12, 0.1, 0.6], hitec: [0.1, 0.35, 0.5], rocky: [0.45, 0.3, 0.3], lake: [0.1, 0.1, 0.3],
  };
  const DEFAULT_MAT = [0.35, 0.35, 0.6];
  function newEnv() { return { style: null, bld: 0.4, trees: 0.3, water: 0, tin: 0.3, sheet: 0.25, gutter: 0.35, leaves: 0.3, open: 0.6 }; }
  // pure mix: weather + environment state -> bed levels (0..lvl) and grain rates (/s)
  function mixFor(s, out) {
    const r = s.rain, e = s.env, w = s.wind, g = s.gust;
    out.hiss = Math.pow(r, 0.9) * (0.75 + 0.25 * e.open);
    out.light = smooth(0, 0.12, r) * (1 - 0.65 * smooth(0.35, 0.9, r));
    out.dense = smooth(0.22, 0.85, r) * Math.min(1, 0.85 + 0.4 * e.water);
    out.tin = e.tin * Math.pow(r, 0.7) * (1 - 0.6 * e.water);
    out.sheet = e.sheet * Math.pow(r, 0.8) * (1 - 0.6 * e.water);
    out.leaves = e.leaves * Math.pow(r, 0.6);
    const run = clamp(s.wet * 1.3 - 0.25, 0, 1) * (0.35 + 0.65 * smooth(0, 0.5, r));
    out.gutter = e.gutter * run;
    out.roof = s.cover * Math.pow(r, 0.7);
    out.tyreP = s.tyreP || 0; out.tyreT = s.tyreT || 0;
    out.wind = smooth(0.18, 1, w) * (0.6 + 0.55 * g);
    out.whistle = smooth(0.45, 1.05, w) * (0.3 + 0.7 * e.bld) * (0.25 + 0.95 * g);
    out.rustle = e.leaves * smooth(0.15, 0.9, w) * (0.4 + 0.8 * g);
    out.howl = s.storm * (0.5 + 0.6 * g);
    for (const k of BED_NAMES) out[k] = clamp(out[k], 0, 1.2) * BEDDEF[k].lvl;
    out.pingRate = r > 0.03 ? e.tin * (0.6 + 7 * r) : 0;
    const wetDrip = s.wet > 0.25 ? (s.wet - 0.25) * (1 - smooth(0.04, 0.45, r)) * (0.5 + e.gutter + e.leaves * 0.8) * 4.5 : 0;
    out.dripRate = wetDrip + (r > 0.03 && r < 0.5 ? (e.gutter + e.leaves) * 1.2 * (1 - r * 2) : 0);
    return out;
  }

  /* ================================================================ the scape (live, or inside an OfflineAudioContext) */
  class Bed {
    constructor(sc, key) { this.sc = sc; this.key = key; this.def = BEDDEF[key]; this.on = false; this.level = 0; this.zeroAt = 0; this.src = null; this.f = []; this.g = null; this.pn = null; }
    start(t) {
      const ac = this.sc.ac, def = this.def;
      const buf = getBuf(ac, def.buf, !this.sc.live);
      if (!buf) return false;
      const s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
      if (def.buf !== 'pink' && def.buf !== 'brown' && def.buf !== 'white') s.playbackRate.value = rr(0.95, 1.05);
      const dest = def.bus === 'rain' ? this.sc.rainBus : this.sc.amb;
      this.g = gain(ac, 0);
      if (def.pan) { this.pn = panner(ac, dest); this.g.connect(this.pn); } else this.g.connect(dest);
      this.f = [];
      if (def.par) { for (const p of def.par) { const fl = filt(ac, p[0], p[1], p[2], this.g); s.connect(fl); this.f.push(fl); } }
      else { let prev = s; for (const p of def.chain) { const fl = filt(ac, p[0], p[1], p[2]); prev.connect(fl); prev = fl; this.f.push(fl); } prev.connect(this.g); }
      s.start(t, rnd() * buf.duration * 0.9);
      this.src = s; this.on = true; this.level = 0; this.zeroAt = 0;
      return true;
    }
    stop() {
      if (!this.on) return;
      try { this.src.stop(); } catch (e) { /* already */ }
      try { this.src.disconnect(); for (const f of this.f) f.disconnect(); this.g.disconnect(); if (this.pn) this.pn.disconnect(); } catch (e) { /* ignore */ }
      this.on = false; this.src = null; this.f = []; this.g = null; this.pn = null; this.level = 0;
    }
    set(v, t, tc) {
      if (v > 0.0004) {
        this.zeroAt = 0;
        if (!this.on && !this.start(t)) return;
        if (Math.abs(v - this.level) > Math.max(0.0004, this.level * 0.025)) { setT(this.g.gain, v, t, tc); this.level = v; }
      } else if (this.on) {
        if (this.level > 0) { setT(this.g.gain, 0, t, tc); this.level = 0; }
        if (!this.zeroAt) this.zeroAt = t;
        else if (t - this.zeroAt > 5) this.stop();
      }
    }
  }

  class Scape {
    constructor(ac, dest, live) {
      this.ac = ac; this.live = live;
      const t = ac.currentTime;
      this.clip = ac.createWaveShaper(); this.clip.curve = softCurve(); this.clip.connect(dest);
      this.lim = ac.createDynamicsCompressor();
      this.lim.threshold.value = -12; this.lim.knee.value = 6; this.lim.ratio.value = 16; this.lim.attack.value = 0.002; this.lim.release.value = 0.3;
      this.lim.connect(this.clip);
      this.master = gain(ac, live ? 0 : 1, this.lim);
      this.world = gain(ac, 1, this.master);
      this.muffle = filt(ac, 'lowpass', 20000, 0.5, this.world);
      this.amb = gain(ac, 1, this.muffle);
      this.sfx = gain(ac, 1, this.muffle);
      this.coverLP = filt(ac, 'lowpass', 18000, 0.5, this.amb);
      this.rainBus = gain(ac, RAIN_TRIM, this.coverLP);
      this.thunderBus = gain(ac, 1, this.amb);
      this.beds = {};
      for (const k of BED_NAMES) this.beds[k] = new Bed(this, k);
      this.grainEnds = []; this.thunders = [];
      this.strips = [];
      this.t0 = t;
    }
    bed(k, v, t, tc) { this.beds[k].set(v, t, tc == null ? 0.35 : tc); }
    active(now) { this.grainEnds = this.grainEnds.filter((e) => e > now); this.thunders = this.thunders.filter((e) => e.end > now); }
    // one-shot buffer grain -> gain -> pan -> dest
    grain(name, t, vol, pan, rate, dest) {
      const ac = this.ac, buf = getBuf(ac, name, !this.live);
      if (!buf) return false;
      if (this.live) { this.active(ac.currentTime); if (this.grainEnds.length >= 20) return false; }
      const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate || 1;
      const g = gain(ac, vol); const pn = panner(ac, dest || this.rainBus); pn.pan.value = clamp(pan || 0, -1, 1);
      s.connect(g); g.connect(pn); s.start(t);
      const end = t + buf.duration / (rate || 1);
      s.onended = () => { try { pn.disconnect(); } catch (e) { /* ignore */ } };
      this.grainEnds.push(end);
      return true;
    }
    thunder(t, dist, power, pan) {
      const ac = this.ac;
      if (this.live) { this.active(ac.currentTime); if (this.thunders.length >= 3) return null; }
      power = power == null ? 0.7 : power;
      const near = dist < 600;
      const kd = clamp(1.08 - dist / 3000, 0.16, 1);
      const lvl = (0.45 + 0.55 * power) * kd;
      const bright = Math.exp(-dist / 900);
      const pn = panner(ac, this.thunderBus); pn.pan.value = clamp(pan || 0, -1, 1) * (near ? 0.45 : 0.75);
      const out = gain(ac, 1, pn);
      let end = t;
      if (near) {
        const kc = smooth(600, 60, dist);
        end = Math.max(end, burst(ac, out, t, { ft: 'highpass', f: 700 + 1500 * bright, q: 0.5, a: 0.003, h: 0.02, r: 0.35, v: (0.18 + 0.32 * kc) * lvl }));
        // the tearing crackle
        const fl = filt(ac, 'bandpass', 1900, 0.6), gg = gain(ac, 0, out); fl.connect(gg);
        const hits = []; let tt = t + 0.005;
        const nh = 8 + ((rnd() * 8) | 0);
        for (let k = 0; k < nh; k++) { hits.push([tt, rr(0.3, 1) * (1 - k / (nh + 2))]); tt += rr(0.012, 0.05); }
        pulses(gg.gain, hits, (0.12 + 0.2 * kc) * lvl, 0.02);
        noiseSrc(ac, 'white', t, tt - t + 0.2).connect(fl);
        // body boom
        end = Math.max(end, burst(ac, out, t + 0.02, { kind: 'brown', ft: 'lowpass', f: 380, f2: 120, sweep: 1, q: 0.7, a: 0.02, h: 0.15, r: 1.6, v: 0.55 * lvl }));
      }
      // rolling rumble: two layers with random roll envelopes
      const dur = near ? rr(5.5, 8) : rr(6, 10);
      const t1 = t + (near ? 0.12 : rr(0, 0.3));
      const layers = [['lowpass', near ? 260 : 90 + 260 * bright, near ? 85 : 55, 1], ['bandpass', near ? 520 : 160 + 300 * bright, near ? 180 : 110, near ? 0.55 : 0.35]];
      for (const L of layers) {
        const fl = filt(ac, L[0], L[1], L[0] === 'bandpass' ? 0.8 : 0.6);
        fl.frequency.setValueAtTime(L[1], t1); fl.frequency.exponentialRampToValueAtTime(L[2], t1 + dur);
        const g = gain(ac, 0, out); fl.connect(g);
        const NPT = 96, c = new Float32Array(NPT);
        const rolls = []; const nr = 3 + ((rnd() * 4) | 0);
        for (let k = 0; k < nr; k++) rolls.push([Math.pow(rnd(), 1.4) * 0.8, rr(0.35, 1), rr(0.04, 0.12)]);
        let jit = 1;
        const att = near ? 0.02 : 0.1;
        for (let i = 0; i < NPT; i++) {
          const x = i / (NPT - 1);
          let v = (x < att ? x / att : 1) * Math.exp(-x * (near ? 2.6 : 2)) * 0.55;
          for (const R of rolls) { const dx = (x - R[0]) / R[2]; v += R[1] * Math.exp(-dx * dx) * (1 - x * 0.6); }
          jit += (rr(0.6, 1.25) - jit) * 0.35;
          c[i] = Math.max(0, v * jit * (i === NPT - 1 ? 0 : 1));
        }
        let mx = 0; for (let i = 0; i < NPT; i++) mx = Math.max(mx, c[i]);
        const pk = (near ? 0.5 : 0.42) * lvl * L[3];
        for (let i = 0; i < NPT; i++) c[i] = (c[i] / (mx || 1)) * pk;
        g.gain.setValueAtTime(0, t1 - 0.01);
        try { g.gain.setValueCurveAtTime(c, t1, dur); } catch (e) { g.gain.setValueAtTime(pk * 0.5, t1); g.gain.setTargetAtTime(0, t1 + 0.5, dur / 4); }
        noiseSrc(ac, 'brown', t1, dur + 0.1).connect(fl);
      }
      end = Math.max(end, t1 + dur);
      const rec = { at: t, end, dist, near };
      this.thunders.push(rec);
      return rec;
    }
    petrichor(t) {
      // first fat drops on dry dust, sparse then quickening, under a faint earthy wash
      let tt = t, gap = 0.75;
      for (let k = 0; k < 24; k++) {
        this.grain('dust' + ((rnd() * GRAINS.dust.n) | 0), tt, rr(0.35, 1) * 0.55, rr(-0.8, 0.8), rr(0.85, 1.15), this.amb);
        tt += gap * rr(0.6, 1.4); gap = Math.max(0.12, gap * 0.9);
      }
      const ac = this.ac, fl = filt(ac, 'lowpass', 600, 0.6), g = gain(ac, 0, this.amb); fl.connect(g);
      fl.frequency.setValueAtTime(500, t); fl.frequency.linearRampToValueAtTime(1300, t + 6);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 3.5); g.gain.setTargetAtTime(0, t + 5, 1.6);
      noiseSrc(ac, 'pink', t, 11).connect(fl);
      return t + 11;
    }
    splash(t, vol, pan, dest) { // a paper boat set down in a puddle: a tiny plop + droplets + swish
      dest = dest || this.sfx;
      const ac = this.ac, pn = panner(ac, dest); pn.pan.value = pan || 0;
      const g = gain(ac, vol, pn);
      this.grain('drip' + ((rnd() * 6) | 0), t, 0.9, 0, 0.6, g);
      for (let k = 0; k < 3; k++) this.grain('drip' + ((rnd() * 6) | 0), t + rr(0.06, 0.3), rr(0.2, 0.4), rr(-0.3, 0.3), rr(1.4, 2), g);
      burst(ac, g, t, { ft: 'bandpass', f: 1800, f2: 700, q: 0.8, a: 0.01, h: 0.03, r: 0.15, v: 0.25 });
      return t + 0.6;
    }
  }

  /* ================================================================ birds (synthesised one-shots) */
  const P = (o) => (o && o.pitch) || 1;
  const BIRD = {
    flap(ac, out, t, o) { // wing flaps on take-off: n = flock size -> a fluttering burst
      const n = clamp(Math.round((o && o.n) || 1), 1, 80), birds = Math.min(n, 16);
      const nv = n > 6 ? 3 : n > 2 ? 2 : 1, spread = Math.min(0.45, 0.04 * n);
      const lists = []; for (let v = 0; v < nv; v++) lists.push([]);
      let last = t;
      for (let b = 0; b < birds; b++) {
        let tt = t + rnd() * spread; const rate = rr(8, 13) * P(o), claps = 4 + ((rnd() * 6) | 0), base = rr(0.6, 1);
        for (let k = 0; k < claps; k++) { lists[b % nv].push([tt, base * Math.pow(0.86, k)]); tt += (1 / rate) * rr(0.85, 1.15) * (1 + k * 0.05); }
        last = Math.max(last, tt);
      }
      const pk = 0.5 / Math.sqrt(nv);
      for (let v = 0; v < nv; v++) {
        const fl = filt(ac, 'bandpass', rr(1400, 2600) * P(o), 0.9), g = gain(ac, 0, out); fl.connect(g);
        pulses(g.gain, lists[v], pk, 0.011);
        noiseSrc(ac, 'white', t, last - t + 0.2).connect(fl);
      }
      if (n >= 4) { // the soft whump of many wings
        burst(ac, out, t, { kind: 'pink', ft: 'lowpass', f: 600, q: 0.6, a: 0.04, h: Math.min(0.5, (last - t) * 0.4), r: 0.3, v: Math.min(0.35, 0.05 * Math.sqrt(n)) });
      }
      return last + 0.25;
    },
    parakeet(ac, out, t, o) { // rose-ringed parakeet: harsh "kreek-kreek" screeches, a flock overlaps
      const n = (o && o.n) || 1, calls = n > 1 ? Math.min(2 + Math.ceil(n / 3), 8) : 2 + ((rnd() * 3) | 0);
      const bp = filt(ac, 'bandpass', 3300 * P(o), 2.2, out);
      let e = t, tt = t;
      for (let k = 0; k < calls; k++) {
        const f = rr(2800, 3600) * P(o), d = rr(0.07, 0.12);
        const os = osc(ac, 'sawtooth');
        os.frequency.setValueAtTime(f * 0.82, tt); os.frequency.linearRampToValueAtTime(f * 1.12, tt + d * 0.35); os.frequency.linearRampToValueAtTime(f * 0.9, tt + d);
        const l = osc(ac, 'sine'); l.frequency.value = rr(40, 70); l.connect(gain(ac, rr(300, 600), os.frequency));
        const g = gain(ac, 0, bp); os.connect(g);
        const end = env(g.gain, tt, 0.006, d * 0.6, 0.05, 0.3);
        os.start(tt); os.stop(end + 0.02); l.start(tt); l.stop(end + 0.02);
        e = Math.max(e, end);
        tt += n > 1 ? rr(0.05, 0.2) : rr(0.14, 0.22);
      }
      return e;
    },
    myna(ac, out, t, o) { // common myna: chatter, clicks, gurgles and liquid whistles
      const n = 5 + ((rnd() * 5) | 0);
      let tt = t, e = t;
      for (let k = 0; k < n; k++) {
        const r = rnd();
        if (r < 0.35) { const f = rr(1400, 2300) * P(o); e = tone(ac, out, tt, { f, f2: f * rr(0.7, 1.5), glide: rr(0.08, 0.15), a: 0.01, h: rr(0.05, 0.1), r: 0.05, v: 0.16 }); }
        else if (r < 0.6) {
          const bp = filt(ac, 'bandpass', 1400 * P(o), 1.5, out), os = osc(ac, 'square'); os.frequency.value = rr(480, 850) * P(o);
          const g = gain(ac, 0, bp), amG = gain(ac, 0.5, g); os.connect(amG);
          const l = osc(ac, 'sine'); l.frequency.value = rr(26, 40); l.connect(gain(ac, 0.5, amG.gain));
          const d = rr(0.1, 0.18); const end = env(g.gain, tt, 0.01, d, 0.04, 0.12);
          os.start(tt); os.stop(end + 0.02); l.start(tt); l.stop(end + 0.02); e = end;
        } else if (r < 0.8) { for (let j = 0; j < 2 + ((rnd() * 2) | 0); j++) e = burst(ac, out, tt + j * 0.035, { ft: 'highpass', f: 2600, q: 0.7, r: 0.012, v: 0.2 }); }
        else { const bp = filt(ac, 'bandpass', 1600 * P(o), 1.2, out); e = tone(ac, bp, tt, { type: 'sawtooth', f: 1100 * P(o), f2: 750 * P(o), glide: 0.06, a: 0.004, h: 0.03, r: 0.03, v: 0.2 }); }
        tt = e + rr(0.04, 0.14);
      }
      return e;
    },
    egret(ac, out, t, o) { // egret / heron: a low harsh "graak"
      const n = clamp((o && o.n) || 1, 1, 3); let e = t;
      for (let k = 0; k < n; k++) {
        const tt = t + k * rr(0.45, 0.6), d = rr(0.2, 0.32);
        const bp = filt(ac, 'bandpass', 850 * P(o), 1.1, out);
        const sh = ac.createWaveShaper(); sh.curve = softCurve(); sh.connect(bp);
        const g = gain(ac, 0, sh), amG = gain(ac, 0.5, g);
        const os = osc(ac, 'sawtooth'); os.frequency.setValueAtTime(250 * P(o), tt); os.frequency.linearRampToValueAtTime(185 * P(o), tt + d);
        const l = osc(ac, 'square'); l.frequency.value = rr(26, 34); l.connect(gain(ac, 0.5, amG.gain));
        os.connect(amG);
        const end = env(g.gain, tt, 0.02, d, 0.08, 0.55);
        os.start(tt); os.stop(end + 0.02); l.start(tt); l.stop(end + 0.02);
        e = end;
      }
      return e;
    },
    bat(ac, out, t, o) { // faint high squeaks at dusk
      const n = 3 + ((rnd() * 4) | 0) + Math.min(6, ((o && o.n) || 1) - 1);
      let tt = t, e = t;
      for (let k = 0; k < n; k++) { const f = rr(9000, 11500) * P(o); e = tone(ac, out, tt, { f, f2: f * 0.68, glide: 0.018, a: 0.002, h: 0.006, r: 0.012, v: 0.07 }); tt += rr(0.05, 0.13); }
      return e;
    },
    kite_whistle(ac, out, t, o) { // the cheel: a long high descending whistle, then a shivering trill
      const f = 3100 * P(o);
      tone(ac, out, t, { f, f2: f * 0.8, glide: 0.55, a: 0.05, h: 0.42, r: 0.12, v: 0.13, vib: [6, 25] });
      tone(ac, out, t, { type: 'triangle', f: f * 2, f2: f * 1.6, glide: 0.55, a: 0.05, h: 0.42, r: 0.12, v: 0.015 });
      let e = t;
      for (let k = 0; k < 5; k++) { const ft = 2650 * Math.pow(0.955, k) * P(o); e = tone(ac, out, t + 0.72 + k * 0.11, { f: ft, f2: ft * 0.9, glide: 0.08, a: 0.01, h: 0.045, r: 0.04, v: 0.1 * (1 - k * 0.12), vib: [22, 110] }); }
      return e;
    },
  };
  const DELEGATE = { crow: 'crow_caw', coo: 'coo', pigeons: 'pigeons' };
  const BIRD_GAIN = { flap: 0.9, parakeet: 0.5, myna: 0.6, egret: 0.6, bat: 0.45, kite_whistle: 0.55 };
  const COOLDOWN = { flap: 0.12, parakeet: 0.5, myna: 0.6, egret: 1.4, bat: 0.25, kite_whistle: 2.5, crow: 0.7, coo: 1, pigeons: 0.6 };
  const SFX_NAMES = Object.keys(BIRD).concat(Object.keys(DELEGATE));
  const MAX_STRIPS = 8, MAX_D = 700, REF_D = 70;

  /* ================================================================ live state */
  let sc = null, ctxRef = null, enabled = true, jobsStarted = false;
  const env0 = newEnv(), envT = newEnv();
  const levels = {}; const mix = {};
  for (const k of BED_NAMES) levels[k] = 0;
  const st = { scanT: 0, vehT: 0, paramT: 0, volT: 0, whistleT: 0, tyreP: 0, tyreT: 0, tyrePan: 0, tyreF: 3000, cover: 0, coverKind: null, mode: null,
    pingNext: 0, dripNext: 0, cpuTot: 0, cpuN: 0, cpuMax: 0, scanMax: 0, lastThunder: null, played: 0, foc: { x: 0, y: 0 } };
  const last = Object.create(null);
  const focus = () => { try { if (N.atmos && N.atmos.focus) return N.atmos.focus(st.foc); } catch (e) { /* fall through */ } const p = N.player; st.foc.x = p ? p.x : 0; st.foc.y = p ? p.y : 0; return st.foc; };
  const audioCtx = () => { try { return (N.audio && N.audio.ctx) || null; } catch (e) { return null; } };
  const vol = (bus) => { try { const v = N.audio.getVolume(bus); return typeof v === 'number' ? v : 0.8; } catch (e) { return 0.8; } };

  function ensure() {
    const ac = audioCtx();
    if (!ac) return null;
    if (sc && ctxRef === ac) return sc;
    try {
      ctxRef = ac; sc = new Scape(ac, ac.destination, true);
      applyVolumes();
      if (!jobsStarted) { jobsStarted = true; startJobs(ac); }
    } catch (e) { err('build', e); sc = null; }
    return sc;
  }
  function startJobs(ac) {
    const jobs = BUILD_ORDER.slice();
    const ric = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 40));
    const slice = (dl) => {
      const t0 = performance.now();
      do {
        const name = jobs.shift();
        try { buildBuf(ac, name); } catch (e) { err('buf', e); }
      } while (jobs.length && performance.now() - t0 < Math.min(6, Math.max(1, dl.timeRemaining())));
      if (jobs.length) ric(slice, { timeout: 150 });
    };
    ric(slice, { timeout: 150 });
  }
  function applyVolumes() {
    if (!sc) return;
    const t = sc.ac.currentTime;
    let muted = false; try { muted = !!N.audio.muted; } catch (e) { muted = false; }
    setT(sc.master.gain, !enabled || muted ? 0 : v2(vol('master')), t, 0.05);
    setT(sc.amb.gain, v2(vol('ambient')), t, 0.05);
    setT(sc.sfx.gain, v2(vol('sfx')), t, 0.05);
  }
  function modeGain(mode) {
    if (mode === 'play' || mode === 'cutscene' || mode === 'minigame' || mode === 'gameover') return [1, 20000];
    if (mode === 'dialogue') return [0.8, 20000];
    if (mode === 'paused' || mode === 'map' || mode === 'journal') return [0.5, 650];
    return [0, 20000]; // title / boot
  }
  const playable = (mode) => modeGain(mode)[0] > 0;

  // ---------- environment around the listener
  function scanEnv(x, y) {
    const W = N.world;
    let style = null;
    try { const d = W && W.districtAt ? W.districtAt(x, y) : null; style = d && (d.style || null); } catch (e) { style = null; }
    let nb = 0, nt = 0;
    if (W && W.queryStructures) {
      try {
        W.queryStructures(x - 170, y - 170, x + 170, y + 170, (s) => {
          const cx = s.cx != null ? s.cx : (s.x0 + s.x1) / 2, cy = s.cy != null ? s.cy : (s.y0 + s.y1) / 2;
          const w = 1 - Math.hypot(cx - x, cy - y) / 240;
          if (w <= 0) return;
          if (s.t === 'bldg') nb += w; else if (s.t === 'tree') nt += w * ((s.r || 9) > 13 ? 1.6 : 1); else if (s.t === 'landmark') nb += 2 * w;
        });
      } catch (e) { err('scan', e); }
    }
    let wc = 0;
    if (W && W.isWater) { try { for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; if (W.isWater(x + Math.cos(a) * 140, y + Math.sin(a) * 140)) wc++; } if (W.isWater(x, y)) wc += 3; } catch (e) { wc = 0; } }
    const mat = STYLE_MAT[style] || DEFAULT_MAT;
    const bld = clamp(nb / 9, 0, 1), trees = clamp(nt / 7, 0, 1);
    envT.style = style; envT.bld = bld; envT.trees = trees; envT.water = clamp(wc / 8, 0, 1);
    envT.tin = bld * mat[0]; envT.sheet = bld * mat[1]; envT.gutter = bld * mat[2]; envT.leaves = trees; envT.open = 1 - bld;
  }
  function stepEnv(dt) {
    const k = 1 - Math.exp(-dt / 1.5);
    for (const key of ['bld', 'trees', 'water', 'tin', 'sheet', 'gutter', 'leaves', 'open']) env0[key] += (envT[key] - env0[key]) * k;
    env0.style = envT.style;
  }
  // ---------- tyres on wet roads + the cover of the player's vehicle
  function scanVehicles(fx, fy, wet) {
    const pv = N.player && N.player.vehicle;
    const wk = smooth(0.3, 0.7, wet);
    st.tyreP = 0; st.tyreT = 0;
    let cover = 0, ck = null;
    if (pv) {
      const T = pv.T || {}, cls = T.cls;
      if (cls === 'car' || cls === 'heavy') { cover = 1; ck = 'car'; } else if (cls === 'auto') { cover = 0.55; ck = 'auto'; }
      if (cls !== 'boat' && wk > 0) {
        const sp = clamp(Math.abs(pv.speed || 0) / Math.max(50, (T.maxSpeed || 150) * 0.8), 0, 1);
        st.tyreP = wk * sp * (T.pedal || cls === 'bike' ? 0.55 : 1) * (cover ? 0.6 : 1);
        st.tyreF = 1800 + 3200 * sp;
      }
    }
    st.cover = cover; st.coverKind = ck;
    if (wk > 0 && N.entities && N.entities.query) {
      let sum = 0, pan = 0;
      try {
        const list = N.entities.query(fx, fy, 320, (e) => e.kind === 'vehicle' && e !== pv && Math.abs(e.speed || 0) > 12);
        for (const v of list) {
          const T = v.T || {}, d = Math.hypot(v.x - fx, v.y - fy);
          if (T.cls === 'boat') continue;
          const c = clamp(Math.abs(v.speed) / 130, 0, 1) * (40 / (40 + d)) * (T.cls === 'heavy' ? 1.3 : T.cls === 'bike' ? 0.45 : T.cls === 'auto' ? 0.8 : 1);
          sum += c; pan += c * clamp((v.x - fx) / 200, -1, 1);
        }
        st.tyreT = wk * clamp(sum * 1.4, 0, 1); st.tyrePan = sum ? pan / sum : 0;
      } catch (e) { err('vehicles', e); }
    }
  }

  // ---------- per-frame update
  function update(dt) {
    if (!enabled || document.hidden) return;
    const ac = audioCtx();
    if (!ac || ac.state !== 'running') return;
    const t0 = performance.now();
    try {
      if (!ensure()) return;
      dt = Math.min(0.1, dt || 0);
      const now = ac.currentTime, mode = (N.state && N.state.mode) || 'play';
      if (mode !== st.mode) { st.mode = mode; const mg = modeGain(mode); setT(sc.world.gain, mg[0], now, 0.25); setT(sc.muffle.frequency, mg[1], now, 0.12); }
      st.volT -= dt; if (st.volT <= 0) { st.volT = 0.5; applyVolumes(); }
      const on = playable(mode);
      const f = focus(), Wt = N.weather || {}, Wi = N.wind || {};
      st.scanT -= dt; if (st.scanT <= 0 && on) { st.scanT = 0.5; const q0 = performance.now(); scanEnv(f.x, f.y); const q = performance.now() - q0; if (q > st.scanMax) st.scanMax = q; }
      stepEnv(dt);
      st.vehT -= dt; if (st.vehT <= 0 && on) { st.vehT = 0.15; scanVehicles(f.x, f.y, Wt.wet || 0); }
      st.paramT -= dt;
      if (st.paramT <= 0) {
        st.paramT = 0.1;
        let gust = 0; try { gust = Wi.gust ? Wi.gust(f.x, f.y) * (Wi.gustiness == null ? 0.5 : Wi.gustiness) * 1.6 : 0; } catch (e) { gust = 0; }
        mixFor({ rain: Wt.rain || 0, storm: Wt.storm || 0, wet: Wt.wet || 0, wind: Wi.strength || 0, gust: clamp(gust, 0, 1), env: env0, cover: st.cover, tyreP: st.tyreP, tyreT: st.tyreT }, mix);
        for (const k of BED_NAMES) { const v = on ? mix[k] : 0; levels[k] = v; sc.bed(k, v, now, k === 'tyreP' || k === 'tyreT' ? 0.12 : 0.35); }
        // cover: inside a car the outside rain is muffled, an auto's canvas lets more through
        const cov = st.cover;
        setT(sc.coverLP.frequency, cov >= 1 ? 1100 : cov > 0 ? 2800 : 18000, now, 0.15);
        setT(sc.rainBus.gain, RAIN_TRIM * (1 - 0.5 * cov), now, 0.15);
        const B = sc.beds;
        if (B.roof.on) setT(B.roof.f[0].frequency, st.coverKind === 'auto' ? 1100 : 1700, now, 0.2);
        if (B.tyreP.on) setT(B.tyreP.f[0].frequency, st.tyreF, now, 0.15);
        if (B.tyreT.on && B.tyreT.pn) setT(B.tyreT.pn.pan, st.tyrePan * 0.8, now, 0.2);
        if (B.hiss.on) setT(B.hiss.f[1].frequency, 900 + 2600 * (Wt.rain || 0), now, 0.5);
        if (B.wind.on) setT(B.wind.f[0].frequency, 280 + 520 * clamp((Wi.strength || 0) * 0.6 + gust * 0.5, 0, 1), now, 0.4);
        if (B.howl.on) { const w = Math.sin(now * 0.37) * 0.5 + Math.sin(now * 0.83 + 1) * 0.3; setT(B.howl.f[0].frequency, 300 * (1 + 0.18 * w + 0.15 * gust), now, 0.3); setT(B.howl.f[1].frequency, 480 * (1 + 0.12 * w + 0.2 * gust), now, 0.3); }
        st.whistleT -= 0.1;
        if (B.whistle.on && st.whistleT <= 0) { st.whistleT = rr(0.8, 2.6); const wf = rr(650, 1500) * (1 + 0.25 * gust); setT(B.whistle.f[0].frequency, wf, now, 0.6); setT(B.whistle.f[1].frequency, wf, now, 0.6); }
      }
      // grains: tin pings and drips, 0.15 s lookahead
      if (on) {
        const horizon = now + 0.15;
        st.pingNext = schedStream(st.pingNext, mix.pingRate || 0, now, horizon, (tt) => sc.grain('ping' + ((rnd() * 6) | 0), tt, rr(0.1, 0.45) * Math.min(1, (Wt.rain || 0) * 2 + 0.3), rr(-0.85, 0.85), rr(0.85, 1.2)));
        st.dripNext = schedStream(st.dripNext, mix.dripRate || 0, now, horizon, (tt) => {
          const metal = rnd() < env0.tin * 0.35;
          sc.grain((metal ? 'ping' : 'drip') + ((rnd() * 6) | 0), tt, metal ? rr(0.08, 0.2) : rr(0.15, 0.5), rr(-0.9, 0.9), metal ? rr(1.1, 1.5) : rr(0.8, 1.3));
        });
      }
    } catch (e) { err('update', e); }
    const d = performance.now() - t0; st.cpuTot += d; st.cpuN++; if (d > st.cpuMax) st.cpuMax = d;
  }
  function schedStream(next, rate, now, horizon, fn) {
    if (!(rate > 0.01)) return 0;
    if (!next || next < now - 0.05 || next > now + 30) next = now + -Math.log(1 - rnd()) / rate;
    let guard = 0;
    while (next < horizon && guard++ < 12) { fn(Math.max(now + 0.005, next)); next += -Math.log(1 - rnd()) / rate; }
    return next;
  }

  // ---------- events
  function onLightning(d) {
    try {
      if (!enabled || !d || document.hidden) return;
      const ac = audioCtx(); if (!ac || ac.state !== 'running' || !ensure()) return;
      const mode = (N.state && N.state.mode) || 'play'; if (!playable(mode)) return;
      const f = focus(), dist = d.dist != null ? d.dist : Math.hypot((d.x || 0) - f.x, (d.y || 0) - f.y);
      const pan = dist > 1 && d.x != null ? clamp((d.x - f.x) / Math.max(200, dist), -1, 1) : 0;
      const delay = clamp(d.delay != null ? d.delay : dist / 214, 0, 12);
      const now = ac.currentTime, rec = sc.thunder(now + delay, dist, d.power, pan);
      if (rec) st.lastThunder = { at: now, startAt: now + delay, delay, dist, near: rec.near, end: rec.end };
    } catch (e) { err('thunder', e); }
  }
  N.on('weather:lightning', onLightning);
  N.on('weather:petrichor', () => {
    try {
      if (!enabled || document.hidden) return;
      const ac = audioCtx(); if (!ac || ac.state !== 'running' || !ensure()) return;
      if (!playable((N.state && N.state.mode) || 'play')) return;
      for (let i = 0; i < GRAINS.dust.n; i++) getBuf(ac, 'dust' + i, true);
      getBuf(ac, 'pink', true);
      sc.petrichor(ac.currentTime + 0.05);
      st.petrichorAt = ac.currentTime;
    } catch (e) { err('petrichor', e); }
  });
  N.on('paperboat', (d) => {
    try {
      if (!enabled) return;
      const ac = audioCtx(); if (!ac || ac.state !== 'running' || !ensure()) return;
      let g = 0.7, pan = 0;
      if (d && typeof d.x === 'number') { const sp = spatial(d.x, d.y, 40, 260); if (!sp) return; g *= sp.g; pan = sp.pan; }
      for (let i = 0; i < 6; i++) getBuf(ac, 'drip' + i, true);
      sc.splash(ac.currentTime + 0.01, g * (d && d.vol != null ? d.vol : 1), pan);
    } catch (e) { err('paperboat', e); }
  });
  N.on('audio:settings', () => { try { applyVolumes(); } catch (e) { err('settings', e); } });
  N.on('audio:unlocked', () => { try { ensure(); } catch (e) { err('unlock', e); } });

  // ---------- positional bird sfx
  function spatial(x, y, ref, max) {
    const f = focus(), dx = x - f.x, dy = y - f.y, d = Math.hypot(dx, dy);
    if (!(d < max)) return null;
    let g = d <= ref ? 1 : ref / (ref + (d - ref) * 1.1);
    g *= 1 - smooth(max * 0.65, max, d);
    return { g, pan: clamp(dx / 280, -1, 1) * 0.85, d };
  }
  function getStrip(now) {
    for (const s of sc.strips) if (s.busy <= now) return s;
    if (sc.strips.length >= MAX_STRIPS) return null;
    const ac = sc.ac, s = { in: gain(ac, 1), lp: filt(ac, 'lowpass', 18000, 0.5), pn: panner(ac, sc.sfx), busy: 0 };
    s.in.connect(s.lp); s.lp.connect(s.pn);
    sc.strips.push(s);
    return s;
  }
  function sfx(name, o) {
    try {
      o = o || {};
      if (!enabled || document.hidden) return false;
      if (!BIRD[name] && !DELEGATE[name]) return false;
      const A = N.audio; if (!A || !A.ready) return false;
      const ac = audioCtx(); if (!ac || !ensure()) return false;
      const now = ac.currentTime;
      if (!o.force && last[name] && now - last[name] < (COOLDOWN[name] || 0.2)) return false;
      if (DELEGATE[name]) {
        const okk = !!A.sfx(DELEGATE[name], { x: o.x, y: o.y, vol: o.vol, n: o.n, pitch: o.pitch, force: o.force });
        if (okk) last[name] = now;
        return okk;
      }
      let g = 1, pan = 0, lpf = 18000;
      if (typeof o.x === 'number' && typeof o.y === 'number') {
        const sp = spatial(o.x, o.y, REF_D, MAX_D);
        if (!sp) return false;
        g = sp.g; pan = sp.pan; lpf = clamp(18000 * Math.exp(-sp.d / 380), 2600, 18000);
      }
      g *= (o.vol == null ? 1 : clamp(+o.vol || 0, 0, 2)) * (BIRD_GAIN[name] || 0.6);
      if (g < 0.004) return false;
      const strip = getStrip(now);
      if (!strip) return false;
      strip.in.gain.setValueAtTime(g, now); strip.lp.frequency.setValueAtTime(lpf, now); strip.pn.pan.setValueAtTime(pan, now);
      getBuf(ac, 'white', true); getBuf(ac, 'pink', true);
      const end = BIRD[name](ac, strip.in, now + 0.01 + clamp(o.delay || 0, 0, 2), o);
      strip.busy = end + 0.1;
      last[name] = now; st.played++;
      return true;
    } catch (e) { err('sfx', e); return false; }
  }

  // ---------- offline renders (tests / tools)
  const DEMOS = ['rain', 'rain_light', 'rain_heavy', 'tin', 'sheet', 'leaves', 'gutter', 'drips', 'tyres', 'roof', 'wind', 'whistle', 'rustle', 'storm', 'thunder_near', 'thunder_far', 'petrichor', 'paperboat'];
  function demo(oc, name, sec, opts) {
    const s = new Scape(oc, oc.destination, false), t = 0.02;
    const oldcity = Object.assign(newEnv(), { style: 'oldcity', bld: 0.9, trees: 0.25, tin: 0.9, sheet: 0.5, gutter: 0.9, leaves: 0.25, open: 0.1 });
    const state = { rain: 0, storm: 0, wet: 0, wind: 0, gust: 0.4, env: oldcity, cover: 0, tyreP: 0, tyreT: 0 };
    const only = (k) => { s.bed(k, BEDDEF[k].lvl, t, 0.01); };
    let m = null;
    switch (name) {
      case 'rain': Object.assign(state, { rain: 0.6, wet: 0.9 }); m = mixFor(state, {}); break;
      case 'rain_light': Object.assign(state, { rain: 0.15, wet: 0.5 }); m = mixFor(state, {}); break;
      case 'rain_heavy': Object.assign(state, { rain: 1, wet: 1, storm: 0.5, wind: 0.8 }); m = mixFor(state, {}); break;
      case 'drips': Object.assign(state, { rain: 0, wet: 0.9 }); m = mixFor(state, {}); for (const k of BED_NAMES) m[k] = 0; break;
      case 'tyres': only('tyreP'); only('tyreT'); break;
      case 'storm': Object.assign(state, { storm: 1, wind: 1, gust: 0.7 }); m = mixFor(state, {}); for (const k of ['hiss', 'light', 'dense', 'tin', 'sheet', 'leaves', 'gutter']) m[k] = 0; break;
      case 'thunder_near': s.thunder(t, (opts && opts.dist) || 250, 1, 0.3); break;
      case 'thunder_far': s.thunder(t, (opts && opts.dist) || 2200, 0.6, -0.5); break;
      case 'petrichor': s.petrichor(t); break;
      case 'paperboat': s.splash(t, 1, 0); break;
      default:
        if (BEDDEF[name]) only(name); else throw new Error('atmosAudio.renderOffline: unknown ' + name);
    }
    if (m) {
      for (const k of BED_NAMES) if (m[k] > 0) s.bed(k, m[k], t, 0.01);
      let tt = t; const pr = m.pingRate || 0, dr = m.dripRate || 0;
      if (pr > 0.01) { tt = t; while ((tt += -Math.log(1 - rnd()) / pr) < sec) s.grain('ping' + ((rnd() * 6) | 0), tt, rr(0.1, 0.45), rr(-0.8, 0.8), rr(0.85, 1.2)); }
      if (dr > 0.01) { tt = t; while ((tt += -Math.log(1 - rnd()) / dr) < sec) s.grain('drip' + ((rnd() * 6) | 0), tt, rr(0.15, 0.5), rr(-0.9, 0.9), rr(0.8, 1.3)); }
    }
    return s;
  }
  function analyse(buf) {
    let pk = 0, sum = 0, n = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) { const v = d[i], a = v < 0 ? -v : v; if (a > pk) pk = a; sum += v * v; n++; } }
    return { peak: pk, rms: Math.sqrt(sum / Math.max(1, n)), buffer: buf, duration: buf.duration };
  }
  function renderOffline(name, sec, opts) {
    if (!OAC) return Promise.resolve(null);
    sec = sec || 2; opts = opts || {};
    if (DELEGATE[name]) return N.audio && N.audio.renderOffline ? N.audio.renderOffline(DELEGATE[name], sec, opts) : Promise.resolve(null);
    let oc;
    try {
      oc = new OAC(2, Math.ceil(44100 * sec), 44100);
      if (BIRD[name]) { const out = gain(oc, (opts.gain || 1) * (BIRD_GAIN[name] || 0.6), oc.destination); getBuf(oc, 'white', true); getBuf(oc, 'pink', true); BIRD[name](oc, out, 0.02, opts); }
      else demo(oc, name, sec, opts);
    } catch (e) { return Promise.reject(e); }
    return oc.startRendering().then(analyse);
  }

  // ---------- live meter (tests)
  let analyser = null, abuf = null;
  function meter() {
    if (!sc) return 0;
    if (!analyser) { analyser = sc.ac.createAnalyser(); analyser.fftSize = 2048; sc.clip.connect(analyser); abuf = new Float32Array(analyser.fftSize); }
    analyser.getFloatTimeDomainData(abuf);
    let s0 = 0; for (let i = 0; i < abuf.length; i++) s0 += abuf[i] * abuf[i];
    return Math.sqrt(s0 / abuf.length);
  }

  function stats() {
    const now = sc ? sc.ac.currentTime : 0;
    if (sc) sc.active(now);
    const on = sc ? BED_NAMES.filter((k) => sc.beds[k].on) : [];
    const strips = sc ? sc.strips.filter((s) => s.busy > now).length : 0;
    const beds = {}; for (const k of BED_NAMES) beds[k] = +levels[k].toFixed(4);
    const built = ctxRef ? Object.keys(store(ctxRef.sampleRate)).length : 0;
    return {
      ready: !!sc, enabled, voices: on.length + strips + (sc ? sc.grainEnds.length + sc.thunders.length : 0),
      beds, on, strips, grains: sc ? sc.grainEnds.length : 0, thunder: sc ? sc.thunders.length : 0, lastThunder: st.lastThunder,
      env: { style: env0.style, bld: +env0.bld.toFixed(2), trees: +env0.trees.toFixed(2), water: +env0.water.toFixed(2), tin: +env0.tin.toFixed(2), sheet: +env0.sheet.toFixed(2), gutter: +env0.gutter.toFixed(2) },
      rates: { ping: +(mix.pingRate || 0).toFixed(2), drip: +(mix.dripRate || 0).toFixed(2) }, cover: st.coverKind, tyres: { player: +st.tyreP.toFixed(2), traffic: +st.tyreT.toFixed(2) },
      buffers: built, played: st.played, cpu: { avg: st.cpuN ? +(st.cpuTot / st.cpuN).toFixed(4) : 0, max: +st.cpuMax.toFixed(3), n: st.cpuN, scanMax: +st.scanMax.toFixed(3) },
    };
  }

  N.atmosAudio = {
    sfx, SFX_NAMES, BED_NAMES, DEMOS, stats, renderOffline, meter,
    get enabled() { return enabled; },
    setEnabled(b) {
      enabled = !!b;
      try {
        applyVolumes();
        if (!enabled && sc) { const t = sc.ac.currentTime; for (const k of BED_NAMES) { sc.bed(k, 0, t, 0.1); levels[k] = 0; } }
      } catch (e) { err('enable', e); }
      return enabled;
    },
    resetCpu() { st.cpuTot = 0; st.cpuN = 0; st.cpuMax = 0; st.scanMax = 0; },
    _internal: { mixFor, BEDDEF, scape: () => sc, env: env0, st },
  };

  N.addSystem({ id: 'atmosAudio', order: 71, runIn: ['*'], update });
})();
