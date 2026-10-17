/* NOSTALGIA — audio_ambience.js  (owner: city-ambience sound designer) — extends N.audio through N.audio.ext (see audio.js "extension API").
 * Hyderabad 2003, living and respectful (systems §12.1, §12.3):
 *  - animals & birds, syrinx-like synthesis (pitch contours + FM + formant banks): crow_caw (house crow "kaa"), koel (male
 *    "ku-OO" series that climbs; variant 'female' bubbling call), coo (rock dove "croo-oo"), pigeons (wing-clap take-off),
 *    bird (variants sparrow / myna / bulbul), cheel (black kite "ewe-wirrr"), dog_bark, cow_moo (variant 'buffalo'), goat_bleat
 *  - city: cooker (hiss -> shrill whistle + rattling weight), temple_bell (brass ghanta, beating inharmonic partials; variant
 *    'aarti' hand bell; NEVER at Birla Mandir — hard guard), church_bell (bronze tower bell: 'peal' rounds / 'toll'),
 *    school_bell (hand-struck brass plate "tan-tan-tan"), vendor_call (wordless formant hawkers: veg banana flower chai paper
 *    kulfi bhutta purani), gossip, construction, boat_putt, train_pass, dhobi_slap
 *  - continuous sources (<= 3): the night insect chorus (field crickets, tree crickets, katydids, distant chorus), frogs near
 *    water, and a shop transistor radio with wordless cricket commentary (ext.emitter if the core has it, else own chain)
 *  - a time-of-day scheduler (dawn chorus, midday lull, meal-time cookers, hawker hours, evening rush horns, recess, night
 *    dogs/trains, dusk hush near mosques — no azaan, no chant), school bells at 08:45/12:30/15:45 Mon-Sat, church peals on
 *    Sunday mornings, temple bells while near a temple; district beds re-tuned (X.registerBed) and modulated by the hour.
 * Expensive one-shots (koel series, cooker, bells, pigeons, train) are pre-rendered lazily to AudioBuffers on the live
 * context (a few variants each) and played as a single BufferSource; offline renders (tests) synthesise live.
 * Test/tool surface: N.audio.ambience {stats, synth, renderBed, weekday, month, SCHED, layers()}.
 */
(() => {
  'use strict';
  const N = window.N;
  const X = N.audio && N.audio.ext;
  if (!X) return;
  const P0 = X.P;
  const { osc0, gain, filt, shaper, panner, tone, burst, pulses, noiseVoice, noiseBuf, wave, rr, pick, rnd, clamp, VOW, WAVES, TAU } = P0;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const err = (where, e) => { try { N.err('audio.amb.' + where, e); } catch (e2) { /* ignore */ } };

  // own harmonic tables (WAVES is the shared mutable table; prefixed names avoid clashes)
  WAVES.amb_koel = [1, 0.09, 0.025];
  WAVES.amb_coo = [1, 0.28, 0.07, 0.02];
  WAVES.amb_whistle = [1, 0.14, 0.04];
  WAVES.amb_glottal = Array.from({ length: 28 }, (_, i) => 1 / Math.pow(i + 1, 1.1));
  WAVES.amb_bird = [1, 0.3, 0.12, 0.05];

  /* ============================================================ helpers */
  const ar = (p) => { try { if (p && 'automationRate' in p) p.automationRate = 'a-rate'; } catch (e) { /* ignore */ } return p; };
  // piecewise automation from t: list [[dt, v], ...]; exp ramps where both ends > 0
  function pts(param, t, list, exp) {
    param.setValueAtTime(list[0][1], t + list[0][0]);
    for (let i = 1; i < list.length; i++) {
      const v = list[i][1], tt = t + list[i][0];
      if (exp && v > 0 && list[i - 1][1] > 0) param.exponentialRampToValueAtTime(v, tt); else param.linearRampToValueAtTime(v, tt);
    }
  }
  const scaleF = (list, k) => list.map((p) => [p[0], p[1] * k]);
  const lastT = (list) => list[list.length - 1][0];
  const P = (o) => (o && o.pitch) || 1;

  // One syrinx/larynx-like voice: harmonic oscillator with a pitch contour, optional audio-rate FM, optional roughness
  // (AM at a ratio of f0 -> subharmonics), optional drive, breath noise, and a parallel formant (beak / tract) bank.
  // o: {f, a (pts), wave, fm:{r, d (pts, Hz deviation)}, am:{r|hz, d}, drive, noise, nf, form:[[f|pts, q, g]], lp}
  function syr(ac, out, t, o) {
    const end = t + lastT(o.a) + 0.03;
    const c = ac.createOscillator();
    if (o.wave && WAVES[o.wave]) c.setPeriodicWave(wave(ac, o.wave)); else c.type = o.wave || 'sine';
    pts(c.frequency, t, o.f, true);
    const nodes = [c];
    if (o.fm) {
      ar(c.frequency);
      const m = osc0(ac); pts(m.frequency, t, scaleF(o.f, o.fm.r), true);
      const mg = gain(ac, 0, c.frequency); pts(mg.gain, t, o.fm.d);
      m.connect(mg); nodes.push(m);
    }
    const g = gain(ac, 0); pts(g.gain, t, o.a);
    c.connect(g);
    let head = g;
    if (o.am) {
      const ag = gain(ac, 1 - o.am.d); head.connect(ag); head = ag;
      const m = osc0(ac);
      if (o.am.hz) m.frequency.value = o.am.hz; else pts(m.frequency, t, scaleF(o.f, o.am.r), true);
      m.connect(gain(ac, o.am.d, ag.gain)); nodes.push(m);
    }
    if (o.drive) { const sh = shaper(ac, o.drive); head.connect(sh); head = sh; }
    let dest = out;
    if (o.lp) dest = filt(ac, 'lowpass', o.lp, 0.7, out);
    if (o.form) {
      const bank = gain(ac, 1);
      for (const fm of o.form) {
        const bp = filt(ac, 'bandpass', typeof fm[0] === 'number' ? fm[0] : fm[0][0][1], fm[1]);
        if (typeof fm[0] !== 'number') pts(bp.frequency, t, fm[0], true);
        bank.connect(bp); bp.connect(gain(ac, fm[2], dest));
      }
      head.connect(bank); head = bank;
      if (o.noise) {
        const ns = ac.createBufferSource(); ns.buffer = noiseBuf(ac, 'white'); ns.loop = true;
        const nf = filt(ac, 'bandpass', o.nf || 2000, 0.8); const ng = gain(ac, 0, bank);
        pts(ng.gain, t, scaleF(o.a, o.noise));
        ns.connect(nf); nf.connect(ng); ns.start(t, rnd() * 1.5); ns.stop(end);
      }
    } else head.connect(dest);
    for (const n of nodes) { n.start(t); n.stop(end); }
    return end;
  }

  // Wordless formant voice (hawkers, gossip, the radio commentator). sy: [[t, dur, vowel, semis, vol, bendSemis, cons]]
  // cons: 'k' / 'p' (plosive tick), 's' (sibilant), 'b' (soft thump). No words: vowel colours + melody only.
  function voice(ac, out, t, o) {
    t += 0.08; // room for a consonant before the first vowel
    const sy = o.sy, last = sy[sy.length - 1], end = t + last[0] + last[1] + 0.3;
    const f0 = o.f0 || 160;
    const src = osc0(ac); src.setPeriodicWave(wave(ac, 'amb_glottal'));
    const vib = osc0(ac); vib.frequency.value = rr(4.8, 6.2);
    vib.connect(gain(ac, f0 * (o.vib == null ? 0.014 : o.vib), src.frequency));
    const g = gain(ac, 0);
    const tilt = filt(ac, 'lowpass', 2600 * (o.bright || 1), 0.6);
    src.connect(tilt); tilt.connect(g);
    const fq = [6, 10, 12], fgv = [1, 0.62 * (o.bright || 1), 0.3 * (o.bright || 1)];
    const v0 = VOW[sy[0][2]] || VOW.a;
    const F = [0, 1, 2].map((k) => { const b = filt(ac, 'bandpass', v0[k] * (o.fs || 1), fq[k]); g.connect(b); b.connect(gain(ac, fgv[k] * 2.4, out)); return b; });
    if (o.nasal) { const nb = filt(ac, 'bandpass', 260, 2.5); g.connect(nb); nb.connect(gain(ac, o.nasal * 1.6, out)); }
    let ng = null;
    if (o.breath) {
      const ns = ac.createBufferSource(); ns.buffer = noiseBuf(ac, 'white'); ns.loop = true;
      ng = gain(ac, 0); ns.connect(ng); F.forEach((b) => ng.connect(b));
      ns.start(t, rnd() * 1.5); ns.stop(end);
    }
    src.frequency.setValueAtTime(f0 * Math.pow(2, sy[0][3] / 12), t);
    for (const s of sy) {
      const st = t + s[0], f = f0 * Math.pow(2, (s[3] + rr(-0.15, 0.15)) / 12), vw = VOW[s[2]] || VOW.a, vol = (o.v || 0.5) * (s[4] == null ? 1 : s[4]);
      src.frequency.setTargetAtTime(f, st, 0.025);
      if (s[5]) src.frequency.setTargetAtTime(f * Math.pow(2, s[5] / 12), st + s[1] * 0.35, s[1] * 0.35);
      F.forEach((b, k) => b.frequency.setTargetAtTime(vw[k] * (o.fs || 1), st, 0.03));
      g.gain.setTargetAtTime(vol, st, 0.022);
      g.gain.setTargetAtTime(0, st + s[1], 0.035);
      if (ng) { ng.gain.setTargetAtTime(vol * o.breath, st, 0.03); ng.gain.setTargetAtTime(0, st + s[1], 0.04); }
      const c = s[6];
      if (c === 'k' || c === 'p') burst(ac, out, st - 0.012, { f: c === 'k' ? 2400 : 900, q: 1, a: 0.002, r: 0.025, v: vol * 0.35 });
      else if (c === 's') burst(ac, out, st - 0.07, { ft: 'highpass', f: 3200, a: 0.02, h: 0.03, r: 0.03, v: vol * 0.22 });
      else if (c === 'b') tone(ac, out, st - 0.02, { f: 120, a: 0.004, r: 0.05, v: vol * 0.4 });
    }
    src.start(t); src.stop(end); vib.start(t); vib.stop(end);
    return end;
  }

  // Inharmonic struck partials with beating pairs. list: [[ratio, amp, decayMul, beatHz]]
  function ring(ac, out, t, f, list, v, dec) {
    let end = t;
    for (const p of list) {
      const fr = f * p[0], dd = dec * p[2], beat = p[3] || 0;
      if (fr > 18000) continue;
      const pair = beat ? [-beat / 2, beat / 2] : [0];
      for (const b of pair) end = Math.max(end, tone(ac, out, t, { f: fr + b, a: 0.0015, r: dd, v: (v * p[1]) / pair.length }));
    }
    return end;
  }
  // stereo layer helpers for loops
  const epUp = (() => { const c = new Float32Array(64); for (let i = 0; i < 64; i++) c[i] = Math.sin((i / 63) * Math.PI / 2); return c; })();
  const epDn = (() => { const c = new Float32Array(64); for (let i = 0; i < 64; i++) c[i] = Math.cos((i / 63) * Math.PI / 2); return c; })();
  function loopFade(g, v, L, F) { // equal-power: fade in over [0,F), out over [L, L+F) -> seamless once folded
    const up = epUp.map((x) => x * v), dn = epDn.map((x) => x * v);
    g.gain.setValueAtTime(0, 0); g.gain.setValueCurveAtTime(up, 0.0001, F); g.gain.setValueAtTime(v, F + 0.001);
    g.gain.setValueCurveAtTime(dn, L, F);
  }

  /* ============================================================ pre-rendering (lazy, queued, a few variants each) */
  const PR = { cache: new Map(), queue: [], busy: false, rendered: 0, ms: 0 };
  function prKey(name, o) { return name + '|' + (o.variant || '') + '|' + (o.n || ''); }
  function prRender(spec) {
    const ac = X.ctx;
    if (!OAC || !ac) return Promise.resolve(null);
    const sr = ac.sampleRate, ch = spec.ch || 1;
    const oc = new OAC(ch, Math.ceil(sr * spec.sec), sr);
    const out = gain(oc, 1, oc.destination);
    const t0 = performance.now();
    let end = spec.sec;
    try { end = spec.synth(oc, out, 0.01, spec.o) || spec.sec; } catch (e) { err('prerender.' + spec.key, e); return Promise.resolve(null); }
    return oc.startRendering().then((b) => {
      PR.ms += performance.now() - t0; PR.rendered++;
      const n = Math.min(b.length, Math.ceil(sr * (Math.min(spec.sec, end) + 0.05)));
      let outB = b;
      if (spec.loop) outB = fold(b, Math.round(spec.loop[0] * sr), Math.round(spec.loop[1] * sr));
      else if (n < b.length) { outB = new AudioBuffer({ numberOfChannels: ch, length: n, sampleRate: sr }); for (let c = 0; c < ch; c++) outB.copyToChannel(b.getChannelData(c).subarray(0, n), c); }
      return outB;
    }).catch((e) => { err('prerender.' + spec.key, e); return null; });
  }
  function fold(b, n, f) { // loop: add the tail [n, n+f) onto the head -> seamless loop of length n
    f = Math.min(f, b.length - n);
    const o = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: n, sampleRate: b.sampleRate });
    for (let c = 0; c < b.numberOfChannels; c++) {
      const d = b.getChannelData(c), a = new Float32Array(n); a.set(d.subarray(0, n));
      for (let i = 0; i < f; i++) a[i] += d[n + i];
      o.copyToChannel(a, c);
    }
    return o;
  }
  function prPump() {
    if (PR.busy || !PR.queue.length) return;
    const spec = PR.queue.shift();
    PR.busy = true;
    prRender(spec).then((b) => {
      PR.busy = false;
      const e = PR.cache.get(spec.key);
      if (e) { e.pending = false; if (b) e.bufs.push(b); }
      if (spec.done) try { spec.done(b); } catch (e2) { err('prerender.done', e2); }
      setTimeout(prPump, 120);
    });
  }
  function prRequest(key, synth, sec, o, nVar, extra) {
    let e = PR.cache.get(key);
    if (!e) { e = { bufs: [], pending: false, nVar: nVar || 3 }; PR.cache.set(key, e); }
    if (!e.pending && e.bufs.length < e.nVar) {
      e.pending = true;
      PR.queue.push(Object.assign({ key, synth, sec, o: Object.assign({}, o, { pitch: 1, vol: 1 }) }, extra || {}));
      prPump();
    }
    return e;
  }
  function playBuf(ac, out, t, b, o) {
    const s = ac.createBufferSource(); s.buffer = b;
    const rate = P(o) * rr(0.985, 1.015);
    s.playbackRate.value = rate;
    s.connect(out); s.start(t);
    return t + b.duration / rate;
  }
  // SFX fn that plays a cached pre-render on the live context (synthesises live meanwhile / offline)
  function cached(name, synth, sec, nVar) {
    return (ac, out, t, o) => {
      if (OAC && ac === X.ctx && !o.live) {
        const e = prRequest(prKey(name, o), synth, sec, o, nVar);
        if (e.bufs.length) return playBuf(ac, out, t, pick(e.bufs), o);
      }
      return synth(ac, out, t, o);
    };
  }

  /* ============================================================ stats (tests spy here) */
  const stats = { played: Object.create(null), suppressed: Object.create(null), log: [], sched: 0 };
  function note(name, o) {
    stats.played[name] = (stats.played[name] || 0) + 1;
    stats.log.push({ name, x: o.x, y: o.y, v: o.variant || null, m: N.clock ? Math.round(N.clock.minutes) : null });
    if (stats.log.length > 80) stats.log.shift();
  }
  const reg = (name, fn, opt) => X.registerSfx(name, (ac, out, t, o) => { if (ac === X.ctx) note(name, o); return fn(ac, out, t, o); }, opt);

  /* ============================================================ birds */
  // House crow: harsh nasal "kaa" — a rough sawtooth (subharmonic AM), driven, through beak/tract formants.
  function crowOne(ac, out, t, o, k) {
    const p = P(o) * rr(0.93, 1.07) * (1 - k * 0.025), d = rr(0.24, 0.38), f0 = rr(520, 600) * p;
    return syr(ac, out, t, {
      wave: 'sawtooth', f: [[0, f0 * 0.8], [d * 0.2, f0 * 1.08], [d * 0.6, f0], [d, f0 * 0.78]],
      a: [[0, 0], [0.016, 0.5], [d * 0.45, 0.46], [d * 0.85, 0.3], [d, 0]],
      am: { r: 0.5, d: 0.5 }, drive: 2.2, noise: 0.5, nf: 1800,
      form: [[[[0, 1150 * p], [d * 0.3, 1450 * p], [d, 1200 * p]], 3, 1], [2350 * p, 4, 0.65], [3400 * p, 5, 0.3], [650, 2, 0.15]],
    });
  }
  function crow(ac, out, t, o) {
    const n = o.n || pick([1, 2, 2, 3, 3]);
    let e = t, tt = t;
    for (let k = 0; k < n; k++) { e = crowOne(ac, out, tt, o, k); tt = e + rr(0.12, 0.3); }
    return e;
  }
  // Asian koel, male: "ku-OO" repeated, each phrase higher and quicker — the summer series that climbs and breaks off.
  function koelMale(ac, out, t, o) {
    const n = o.n || 5 + ((rnd() * 4) | 0);
    let f = rr(600, 660) * P(o), tt = t, gap = 0.66, e = t;
    for (let k = 0; k < n; k++) {
      const u = 0.75 + 0.25 * (k / Math.max(1, n - 1));
      syr(ac, out, tt, { wave: 'amb_koel', f: [[0, f * 0.93], [0.05, f], [0.12, f * 0.98]], a: [[0, 0], [0.025, 0.42 * u], [0.09, 0.4 * u], [0.12, 0]] });
      const d2 = 0.3, s2 = tt + 0.17;
      e = syr(ac, out, s2, { wave: 'amb_koel', f: [[0, f * 1.1], [0.12, f * 1.24], [0.24, f * 1.3], [d2, f * 1.26]],
        a: [[0, 0], [0.04, 0.55 * u], [0.22, 0.6 * u], [d2, 0]] });
      tt += gap; gap = Math.max(0.42, gap - 0.04); f *= 1.055;
    }
    return e;
  }
  // koel female: a bubbling, harsher "kik-kik-kik-kwik" burst
  function koelFemale(ac, out, t, o) {
    const n = o.n || 12 + ((rnd() * 8) | 0), p = P(o);
    let tt = t, e = t;
    for (let k = 0; k < n; k++) {
      const f = rr(1450, 1650) * p * (1 - k * 0.006), d = rr(0.05, 0.07);
      e = syr(ac, out, tt, { wave: 'sawtooth', f: [[0, f * 1.12], [d, f * 0.82]], a: [[0, 0], [0.008, 0.35], [d * 0.6, 0.3], [d, 0]], form: [[f * 1.15, 2.5, 1], [f * 2.3, 4, 0.4]] });
      tt += d + (k < n * 0.6 ? rr(0.03, 0.05) : rr(0.05, 0.09));
    }
    return e;
  }
  const koel = (ac, out, t, o) => (o.variant === 'female' ? koelFemale(ac, out, t, o) : koelMale(ac, out, t, o));
  // Rock dove: "croo-oo" — a throaty rolled onset, then a smooth falling "oo"; nearly pure, low-passed (closed beak)
  function cooOne(ac, out, t, p) {
    syr(ac, out, t, { wave: 'amb_coo', f: [[0, 300 * p], [0.12, 365 * p], [0.32, 385 * p], [0.4, 355 * p]], a: [[0, 0], [0.05, 0.55], [0.3, 0.6], [0.4, 0]], am: { hz: rr(28, 36), d: 0.65 }, lp: 1100 });
    return syr(ac, out, t + 0.47, { wave: 'amb_coo', f: [[0, 380 * p], [0.15, 405 * p], [0.62, 330 * p]], a: [[0, 0], [0.07, 0.7], [0.45, 0.55], [0.62, 0]], am: { hz: 8, d: 0.12 }, lp: 1000 });
  }
  function coo(ac, out, t, o) {
    const n = o.n || pick([1, 2, 2, 3]), p = P(o) * rr(0.92, 1.08);
    let e = t;
    for (let k = 0; k < n; k++) e = cooOne(ac, out, t + k * rr(1.15, 1.35), p);
    return e;
  }
  // Pigeons taking off: each bird a few sharp wing claps, then a whirring flutter fading as it climbs away
  function pigeonsSynth(ac, out, t, o) {
    const nb = o.n || 3 + ((rnd() * 4) | 0);
    let e = t;
    for (let i = 0; i < nb; i++) {
      const s = t + i * rr(0.05, 0.16) + rr(0, 0.12), d = rr(1.0, 1.6);
      for (let k = 0; k < 3; k++) {
        burst(ac, out, s + k * rr(0.055, 0.075), { f: rr(1600, 2400), q: 0.9, a: 0.0015, r: 0.016, v: rr(0.32, 0.45) });
        burst(ac, out, s + k * 0.065, { kind: 'pink', ft: 'lowpass', f: 500, a: 0.002, r: 0.03, v: 0.22 });
      }
      const nv = noiseVoice(ac, out, s + 0.2, d + 0.2, 'pink', 'bandpass', 1300, 1.1);
      nv.f.frequency.setValueAtTime(1500, s + 0.2); nv.f.frequency.exponentialRampToValueAtTime(650, s + 0.2 + d);
      const hits = []; const rate = rr(8.5, 10.5);
      for (let tt = s + 0.2; tt < s + 0.2 + d; tt += 1 / rate) hits.push([tt, Math.pow(1 - (tt - s - 0.2) / d, 1.5) * rr(0.7, 1)]);
      pulses(nv.g.gain, hits, 0.75, 0.018);
      nv.g.gain.setValueAtTime(0, s + 0.2 + d + 0.05);
      e = Math.max(e, s + d + 0.45);
    }
    if (o.coo !== false && rnd() < 0.4) e = Math.max(e, cooOne(ac, out, t + 1.2, rr(0.92, 1.08)));
    return e;
  }
  // Small birds. sparrow: "chirrup" cheeps 3-5 kHz; myna: a varied jumble (whistles, croaks, churrs, clicks);
  // bulbul: liquid three-four note phrase. Default: a weighted pick.
  function sparrow(ac, out, t, o) {
    const n = 3 + ((rnd() * 7) | 0), p = P(o);
    let tt = t, e = t;
    for (let k = 0; k < n; k++) {
      const f = rr(3300, 4300) * p, d = rr(0.05, 0.1), up = rnd() < 0.5;
      e = syr(ac, out, tt, { wave: 'amb_bird', f: up ? [[0, f * 0.8], [d * 0.4, f * 1.15], [d, f * 0.9]] : [[0, f * 1.15], [d * 0.5, f * 0.85], [d, f * 1.05]],
        a: [[0, 0], [0.006, 0.32], [d * 0.7, 0.26], [d, 0]], fm: { r: 0.012, d: [[0, f * 0.05], [d, f * 0.02]] } });
      tt += d + (rnd() < 0.25 ? rr(0.25, 0.5) : rr(0.03, 0.09));
    }
    return e;
  }
  function myna(ac, out, t, o) {
    const n = 4 + ((rnd() * 6) | 0), p = P(o);
    let tt = t, e = t;
    for (let k = 0; k < n; k++) {
      const kind = pick(['whistle', 'whistle', 'croak', 'churr', 'click', 'keek']);
      if (kind === 'whistle') { const f = rr(1500, 2900) * p, d = rr(0.12, 0.25); e = syr(ac, out, tt, { wave: 'amb_bird', f: rnd() < 0.5 ? [[0, f * 0.8], [d, f * 1.25]] : [[0, f * 1.2], [d * 0.6, f * 0.85], [d, f]], a: [[0, 0], [0.02, 0.32], [d * 0.8, 0.28], [d, 0]] }); }
      else if (kind === 'croak') { const f = rr(500, 750) * p, d = rr(0.08, 0.14); e = syr(ac, out, tt, { wave: 'sawtooth', f: [[0, f], [d, f * 0.85]], a: [[0, 0], [0.01, 0.35], [d * 0.7, 0.3], [d, 0]], am: { r: 0.5, d: 0.4 }, form: [[1600 * p, 3, 1], [2700 * p, 4, 0.5]] }); }
      else if (kind === 'churr') { const f = rr(1800, 2400) * p, d = rr(0.15, 0.3); e = syr(ac, out, tt, { wave: 'amb_bird', f: [[0, f], [d, f * 0.92]], a: [[0, 0], [0.015, 0.28], [d * 0.8, 0.22], [d, 0]], am: { hz: rr(38, 55), d: 0.85 }, fm: { r: 0.03, d: [[0, f * 0.12], [d, f * 0.12]] } }); }
      else if (kind === 'click') { e = burst(ac, out, tt, { f: rr(2500, 3800), q: 4, a: 0.001, r: 0.015, v: 0.35 }); e = burst(ac, out, tt + 0.05, { f: rr(2500, 3800), q: 4, a: 0.001, r: 0.015, v: 0.3 }); }
      else { const f = rr(2600, 3400) * p, d = 0.07; for (let j = 0; j < 2; j++) e = syr(ac, out, tt + j * 0.11, { wave: 'amb_bird', f: [[0, f * 1.1], [d, f * 0.9]], a: [[0, 0], [0.006, 0.3], [d, 0]] }); }
      tt = e + rr(0.04, 0.22);
    }
    return e;
  }
  function bulbul(ac, out, t, o) {
    const p = P(o), notes = 3 + ((rnd() * 2) | 0);
    let tt = t, e = t;
    for (let k = 0; k < notes; k++) {
      const f = rr(1500, 2600) * p, d = rr(0.12, 0.2);
      e = syr(ac, out, tt, { wave: 'amb_bird', f: [[0, f * 0.85], [d * 0.3, f * 1.12], [d, f * (rnd() < 0.5 ? 0.9 : 1.2)]], a: [[0, 0], [0.02, 0.38], [d * 0.75, 0.32], [d, 0]] });
      tt = e + rr(0.02, 0.06);
    }
    return e;
  }
  const BIRDS = { sparrow, myna, bulbul };
  const bird = (ac, out, t, o) => (BIRDS[o.variant] || pick([sparrow, sparrow, myna, myna, bulbul]))(ac, out, t, o);
  // Black kite: "ewe" — a thin whistle rising then dropping — then the whinnying "wirrr" trill sliding down.
  function cheel(ac, out, t, o) {
    const p = P(o) * rr(0.95, 1.05);
    syr(ac, out, t, { wave: 'amb_whistle', f: [[0, 2350 * p], [0.18, 2900 * p], [0.34, 2550 * p]], a: [[0, 0], [0.04, 0.42], [0.28, 0.4], [0.36, 0]] });
    const s = t + 0.42, d = rr(0.8, 1.1);
    return syr(ac, out, s, { wave: 'amb_whistle', f: [[0, 2700 * p], [d * 0.25, 2500 * p], [d, 1750 * p]], a: [[0, 0], [0.05, 0.42], [d * 0.7, 0.36], [d, 0]],
      fm: { r: 0.0062, d: [[0, 60], [d * 0.3, 210], [d, 260]] }, am: { r: 0.0062, d: 0.45 } });
  }

  /* ============================================================ animals */
  function dogBark(ac, out, t, o) {
    const n = o.n || pick([1, 2, 2, 3, 4]), p = P(o) * (o.variant === 'small' ? 1.35 : o.variant === 'big' ? 0.78 : rr(0.9, 1.1));
    let e = t, tt = t;
    for (let k = 0; k < n; k++) {
      const d = rr(0.13, 0.2), f0 = rr(430, 520) * p;
      e = syr(ac, out, tt, { wave: 'sawtooth', f: [[0, f0 * 0.85], [d * 0.18, f0], [d, f0 * 0.6]], a: [[0, 0], [0.006, 0.6], [d * 0.35, 0.55], [d, 0]],
        drive: 1.6, noise: 0.6, nf: 1300, am: { r: 0.5, d: 0.25 },
        form: [[[[0, 650 * p], [d * 0.25, 1000 * p], [d, 700 * p]], 2.5, 1], [1650 * p, 4, 0.55], [2900 * p, 5, 0.25]] });
      tone(ac, out, tt, { f: 140 * p, f2: 95 * p, glide: 0.08, a: 0.004, r: 0.08, v: 0.25 }); // chest thump
      tt += rr(0.22, 0.36) + (k === 1 && rnd() < 0.3 ? 0.4 : 0);
    }
    return e;
  }
  // Cow / buffalo: a glottal pulse train through a tract that opens from a nasal "mm" to "aa" and closes to "oo"
  function cowMoo(ac, out, t, o) {
    const buf = o.variant === 'buffalo', p = P(o) * (buf ? 0.74 : 1) * rr(0.94, 1.06), d = (buf ? 1.9 : 1.45) * rr(0.9, 1.1), f0 = 112 * p;
    return syr(ac, out, t, { wave: 'amb_glottal', f: [[0, f0 * 0.9], [d * 0.35, f0 * 1.12], [d * 0.8, f0 * 0.95], [d, f0 * 0.82]],
      a: [[0, 0], [0.15, 0.5], [d * 0.7, 0.55], [d, 0]], am: buf ? { hz: 27, d: 0.3 } : { hz: 6, d: 0.08 }, noise: 0.08, nf: 900,
      form: [[[[0, 280], [d * 0.3, 650], [d * 0.7, 600], [d, 380]], 3, 1.6], [[[0, 700], [d * 0.3, 1150], [d * 0.7, 1000], [d, 800]], 5, 0.8], [2400, 6, 0.2]] });
  }
  // Goat: "meh-eh-eh" — reedy with a strong 7-8 Hz bleat tremolo (pitch + amplitude), nasal onset
  function goat(ac, out, t, o) {
    const kid = o.variant === 'kid' || rnd() < 0.3, p = P(o) * (kid ? 1.45 : 1) * rr(0.92, 1.08), d = rr(0.6, 0.9), f0 = 330 * p, tr = rr(7, 8.5);
    return syr(ac, out, t, { wave: 'amb_glottal', f: [[0, f0 * 0.92], [0.1, f0 * 1.05], [d, f0 * 0.95]], a: [[0, 0], [0.05, 0.42], [d * 0.8, 0.4], [d, 0]],
      fm: { r: tr / f0, d: [[0, f0 * 0.015], [0.15, f0 * 0.05], [d, f0 * 0.06]] }, am: { hz: tr, d: 0.55 }, noise: 0.1,
      form: [[[[0, 320], [0.08, 560 * p], [d, 520 * p]], 4, 1.4], [[[0, 900], [0.08, 1750 * p], [d, 1650 * p]], 7, 0.75], [2600 * p, 8, 0.3]] });
  }

  /* ============================================================ city */
  // Pressure-cooker: the weight lifts and rattles, steam hisses up, then the shrill whistle (a strong tonal peak ~2.7-3.2 kHz
  // with turbulence around it), cut when the weight drops; 1-3 whistles.
  function cookerOne(ac, out, t, o) {
    const fw = rr(2650, 3150) * P(o), d = rr(1.0, 1.6);
    const jig = noiseVoice(ac, out, t, 0.75 + d, 'white', 'bandpass', 3900, 2.2);
    const hits = []; for (let x = t; x < t + 0.5 + d; x += rr(0.022, 0.042)) hits.push([x, x < t + 0.45 ? rr(0.5, 1) : rr(0.12, 0.35)]);
    pulses(jig.g.gain, hits, 0.42, 0.006);
    jig.g.gain.setValueAtTime(0, t + 0.55 + d);
    const hs = noiseVoice(ac, out, t, 1.1 + d, 'white', 'bandpass', 1800, 1.1);
    hs.f.frequency.setValueAtTime(1800, t); hs.f.frequency.exponentialRampToValueAtTime(fw * 1.15, t + 0.45);
    pts(hs.g.gain, t, [[0, 0], [0.4, 0.32], [0.5, 0.18], [0.45 + d, 0.18], [0.6 + d, 0.06], [1.0 + d, 0]]);
    const ws = t + 0.32;
    const os = osc0(ac); os.setPeriodicWave(wave(ac, 'amb_whistle'));
    pts(os.frequency, ws, [[0, fw * 0.8], [0.18, fw], [d, fw * 1.015], [d + 0.13, fw * 0.88]], true);
    const vib = osc0(ac); vib.frequency.value = rr(18, 27); vib.connect(gain(ac, fw * 0.005, os.frequency));
    const og = gain(ac, 0, out); pts(og.gain, ws, [[0, 0], [0.12, 0.26], [0.25, 0.34], [d, 0.32], [d + 0.13, 0]]);
    os.connect(og); os.start(ws); os.stop(ws + d + 0.2); vib.start(ws); vib.stop(ws + d + 0.2);
    const tb = noiseVoice(ac, out, ws, d + 0.3, 'white', 'bandpass', fw, 24);
    pts(tb.g.gain, ws, [[0, 0], [0.15, 1.3], [d, 1.2], [d + 0.15, 0]]);
    return t + 1.15 + d;
  }
  function cookerSynth(ac, out, t, o) {
    const n = o.n || pick([1, 1, 2, 2, 3]);
    let e = t, tt = t;
    for (let k = 0; k < n; k++) { e = cookerOne(ac, out, tt, o); tt = e + rr(0.5, 1.3); }
    return e;
  }
  // Temple ghanta (heavy brass): partials with beating pairs; a devotee pulls the clapper 2-4 times.
  // Variant 'aarti': the small hand bell shaken quickly through a short aarti.
  const GHANTA = [[0.53, 0.18, 1.3, 0.45], [1, 1, 1, 1.15], [2.42, 0.55, 0.62, 2.1], [2.77, 0.22, 0.5, 1.3], [4.13, 0.38, 0.42, 2.7], [5.89, 0.2, 0.3, 3.5], [7.76, 0.1, 0.22, 4.4]];
  const HANDBELL = [[1, 1, 1, 2.2], [2.31, 0.5, 0.6, 3.1], [3.94, 0.3, 0.42, 4.4], [5.6, 0.16, 0.3, 0]];
  function templeSynth(ac, out, t, o) {
    if (o.variant === 'aarti') {
      const f = rr(1250, 1450) * P(o), d = rr(2.2, 3.2), rate = rr(5.5, 7);
      let e = t;
      for (let tt = t; tt < t + d; tt += 1 / rate * rr(0.85, 1.15)) {
        e = ring(ac, out, tt, f * rr(0.998, 1.002), HANDBELL, 0.11 * rr(0.6, 1), 0.9);
        burst(ac, out, tt, { ft: 'highpass', f: 5000, a: 0.001, r: 0.012, v: 0.05 });
      }
      return e;
    }
    const n = o.n || pick([2, 3, 3, 4]), f = rr(520, 600) * P(o);
    let e = t, tt = t;
    for (let k = 0; k < n; k++) {
      const v = (k % 2 ? 0.17 : 0.2) * rr(0.85, 1);
      e = ring(ac, out, tt, f, GHANTA, v, 4.2);
      burst(ac, out, tt, { f: f * 5.2, q: 1.4, a: 0.001, r: 0.035, v: v * 0.9 });
      tone(ac, out, tt, { f: f * 0.5, a: 0.001, r: 0.06, v: v * 0.4 });
      tt += rr(0.8, 1.15);
    }
    return e;
  }
  // Church tower bell (bronze, tuned): hum, prime, minor-third tierce, quint, nominal ... — low and long.
  // 'peal': four bells rung in rounds (Sunday morning); 'toll': one deep bell, slowly.
  const CHBELL = [[0.5, 0.5, 2.1, 0.35], [1, 0.42, 1.5, 0.5], [1.2, 0.38, 1.1, 0], [1.5, 0.18, 0.8, 0], [2, 0.55, 0.7, 0.9], [2.5, 0.16, 0.45, 0], [2.67, 0.12, 0.4, 0], [3.01, 0.15, 0.35, 0], [4.03, 0.07, 0.25, 0]];
  function churchStrike(ac, out, t, f, v) {
    ring(ac, out, t, f, CHBELL, v, 4.2);
    burst(ac, out, t, { f: f * 4, q: 1.2, a: 0.001, r: 0.04, v: v * 0.6 });
    return t + 4.2 * 2.1 * 1.15;
  }
  function churchSynth(ac, out, t, o) {
    let e = t;
    if (o.variant === 'toll') {
      const f = rr(225, 245) * P(o), n = o.n || 3;
      for (let k = 0; k < n; k++) e = churchStrike(ac, out, t + k * rr(2.4, 2.8), f, 0.22);
      return e;
    }
    const base = rr(300, 330) * P(o), bells = [1, 8 / 9, 4 / 5, 3 / 4], rounds = o.n || 3;
    let tt = t;
    for (let r = 0; r < rounds; r++) {
      for (let b = 0; b < 4; b++) { e = Math.max(e, churchStrike(ac, out, tt + rr(-0.02, 0.02), base * bells[b], 0.16 * rr(0.85, 1))); tt += 0.42; }
      if (r % 2) tt += 0.42; // handstroke gap
    }
    return e;
  }
  // School bell: a hand-struck brass plate / iron rail, "tan-tan-tan" — 8-12 overlapping strikes
  const PLATE = [[1, 1, 1, 0.8], [1.59, 0.55, 0.7, 1.4], [2.14, 0.6, 0.6, 0], [2.91, 0.35, 0.5, 2.2], [3.62, 0.25, 0.4, 0], [4.95, 0.15, 0.25, 0]];
  function schoolSynth(ac, out, t, o) {
    const n = o.n || 10, f = rr(790, 850) * P(o);
    let e = t, tt = t;
    for (let k = 0; k < n; k++) {
      const v = 0.14 * rr(0.8, 1);
      e = ring(ac, out, tt, f * rr(0.997, 1.003), PLATE, v, 0.85);
      burst(ac, out, tt, { ft: 'highpass', f: 3000, a: 0.001, r: 0.012, v: v * 1.4 });
      tt += rr(0.25, 0.31);
    }
    return e;
  }

  // Hawkers: wordless formant calls, each its own melody + timbre (f0, nasal, breath, brightness, formant scale)
  const CALLS = {
    veg: { f0: 150, nasal: 0.35, breath: 0.08, sy: [[0, 0.6, 'aa', 2, 1, 1], [0.62, 0.18, 'o', 4, 0.8], [0.82, 0.18, 'a', 2, 0.85], [1.02, 0.2, 'e', 0, 0.8], [1.24, 0.55, 'aa', -3, 0.9, -2]] },
    banana: { f0: 165, breath: 0.06, sy: [[0, 0.18, 'e', 0, 0.9, 0, 'k'], [0.2, 0.45, 'aa', 4, 1, -1], [0.85, 0.18, 'e', 0, 0.85, 0, 'k'], [1.05, 0.6, 'aa', 4, 0.95, -4]] },
    flower: { f0: 232, fs: 1.15, bright: 1.15, breath: 0.12, vib: 0.02, sy: [[0, 0.55, 'u', 5, 0.9, 2], [0.58, 0.3, 'e', 7, 1], [0.9, 0.25, 'i', 5, 0.85], [1.17, 0.6, 'o', 0, 0.9, -2]] },
    chai: { f0: 265, fs: 1.12, bright: 1.1, sy: [[0, 0.16, 'ay', 3, 1, 0, 's'], [0.2, 0.32, 'aa', 0, 1, -2], [0.62, 0.16, 'ay', 3, 0.95, 0, 's'], [0.82, 0.4, 'aa', 0, 1, -3]] },
    paper: { f0: 245, fs: 1.08, sy: [[0, 0.18, 'aa', 0, 1, 0, 'p'], [0.2, 0.18, 'e', 2, 0.9], [0.4, 0.6, 'aa', 5, 1, -1]] },
    kulfi: { f0: 172, vib: 0.022, sy: [[0, 0.35, 'u', 0, 0.9, 0, 'k'], [0.38, 0.7, 'i', 7, 1, 2], [1.12, 0.4, 'i', 4, 0.8, -3]] },
    bhutta: { f0: 145, breath: 0.15, nasal: 0.15, sy: [[0, 0.25, 'o', 0, 0.9, 0, 'b'], [0.28, 0.2, 'u', 2, 0.8], [0.5, 0.75, 'aa', 5, 1, -5]] },
    purani: { f0: 136, nasal: 0.55, breath: 0.1, vib: 0.018, sy: [[0, 0.3, 'aa', 0, 0.8, 0, 'p'], [0.32, 0.9, 'aa', 7, 1, -1], [1.25, 0.25, 'ay', 5, 0.8], [1.52, 0.25, 'i', 3, 0.8], [1.8, 0.9, 'aa', 0, 0.95, -3]] },
  };
  function vendorCall(ac, out, t, o) {
    const k = o.variant && CALLS[o.variant] ? o.variant : pick(Object.keys(CALLS));
    const c = CALLS[k];
    return voice(ac, out, t, Object.assign({}, c, { f0: c.f0 * P(o) * rr(0.94, 1.06), v: 0.5 }));
  }
  // Gossip on a doorstep: two or three wordless voices trading short phrases, a laugh now and then
  const VWL = ['a', 'aa', 'e', 'i', 'o', 'u', 'ay', 'ho'];
  function phrase(n, rate, semi, exc) {
    const sy = []; let x = 0;
    for (let i = 0; i < n; i++) { const d = rr(0.07, 0.15) / rate; sy.push([x, d, pick(VWL), semi + rr(-2, 3) - i * 0.3 + (exc || 0), rr(0.6, 1), rnd() < 0.2 ? rr(-2, 2) : 0, rnd() < 0.3 ? pick(['k', 'p', 's']) : null]); x += d + rr(0.01, 0.05) / rate; }
    return { sy, len: x };
  }
  function gossip(ac, out, t, o) {
    const who = [rr(205, 245), rr(120, 140), rr(190, 225)].slice(0, 2 + ((rnd() * 2) | 0));
    let tt = t, e = t;
    const turns = o.n || 3 + ((rnd() * 3) | 0);
    for (let k = 0; k < turns; k++) {
      const f0 = who[k % who.length] * P(o);
      if (rnd() < 0.2 && k) { // a laugh: breathy "ha-ha-ha" falling
        const sy = []; for (let j = 0; j < 4; j++) sy.push([j * 0.14, 0.08, 'a', 4 - j * 1.2, 0.8 - j * 0.12]);
        e = voice(ac, out, tt, { f0, sy, breath: 0.5, v: 0.32 });
      } else { const ph = phrase(4 + ((rnd() * 6) | 0), 1, 0); e = voice(ac, out, tt, { f0, sy: ph.sy, v: 0.3, breath: 0.12 }); }
      tt = e - rr(0.1, 0.25);
    }
    return e;
  }
  // Madhapur 2003: distant construction — a hammer on rebar, a shovel scrape
  function construction(ac, out, t, o) {
    let e = t, tt = t;
    const n = 3 + ((rnd() * 4) | 0), f = rr(2100, 3200);
    for (let k = 0; k < n; k++) { e = ring(ac, out, tt, f * rr(0.99, 1.01), [[1, 1, 1, 0], [2.76, 0.5, 0.5, 0], [5.4, 0.25, 0.3, 0]], 0.18, 0.35); burst(ac, out, tt, { f: 4000, q: 1, a: 0.001, r: 0.01, v: 0.15 }); tt += rr(0.45, 0.7); }
    if (rnd() < 0.5) e = Math.max(e, burst(ac, out, tt + 0.3, { kind: 'pink', f: 2200, q: 0.8, a: 0.05, h: 0.25, r: 0.15, v: 0.25 }));
    return e;
  }
  // A distant motor boat on the lake: 2-stroke putter fading in and out
  function boatPutt(ac, out, t, o) {
    const d = o.dur || rr(3, 4.5);
    const nv = noiseVoice(ac, out, t, d + 0.2, 'brown', 'lowpass', 520, 1.2);
    const hits = []; for (let x = t; x < t + d; x += 1 / rr(10, 12)) hits.push([x, Math.sin(Math.PI * (x - t) / d)]);
    pulses(nv.g.gain, hits, 1.3, 0.025);
    nv.g.gain.setValueAtTime(0, t + d + 0.1);
    return t + d + 0.15;
  }
  // A distant train passing: rumble swell and the "da-dum ... da-dum" of bogies on rail joints
  function trainPass(ac, out, t, o) {
    const d = o.dur || 9;
    const nv = noiseVoice(ac, out, t, d + 0.3, 'brown', 'lowpass', 220, 0.9);
    pts(nv.g.gain, t, [[0, 0], [d * 0.35, 1.3], [d * 0.7, 1.2], [d, 0]]);
    const sp = rr(0.9, 1.1);
    for (let x = t + 0.6; x < t + d - 0.5; x += 1.15 * sp) {
      const k = Math.sin(Math.PI * (x - t) / d);
      for (const off of [0, 0.13]) { burst(ac, out, x + off, { kind: 'pink', ft: 'lowpass', f: 900, a: 0.002, r: 0.05, v: 0.3 * k }); tone(ac, out, x + off, { f: 85, a: 0.002, r: 0.06, v: 0.25 * k }); }
    }
    return t + d + 0.3;
  }
  // Dhobis at the Musi: wet cloth slapped on stone + spray
  function dhobi(ac, out, t, o) {
    const n = o.n || 2 + ((rnd() * 3) | 0);
    let e = t;
    for (let k = 0; k < n; k++) {
      const tt = t + k * rr(1.0, 1.4);
      burst(ac, out, tt, { kind: 'pink', ft: 'lowpass', f: 2400, a: 0.002, r: 0.08, v: 0.6 });
      tone(ac, out, tt, { f: 110, f2: 70, a: 0.002, r: 0.1, v: 0.45 });
      e = burst(ac, out, tt + 0.02, { ft: 'highpass', f: 2500, a: 0.01, r: 0.2, v: 0.12 });
    }
    return e;
  }

  // Transistor-radio cricket commentary (wordless): a commentator's formant murmur in phrases, a crowd bed with swells and
  // (variant 'roar') a boundary roar — all through a tiny speaker: band-limited, slightly distorted, with AM hiss.
  function radioClip(ac, out, t, o) {
    const D = o.dur || 12, roar = !!o.roar, tr = t + D * rr(0.35, 0.5);
    const bus = gain(ac, 1);
    let tt = t + 0.15;
    while (tt < t + D - 0.9) {
      const exc = roar && tt > tr - 1.5 && tt < tr + 2.5 ? 5 : 0;
      const ph = phrase(6 + ((rnd() * 10) | 0), exc ? 1.25 : 1.05, 0, exc);
      const e = voice(ac, bus, tt, { f0: rr(118, 132), sy: ph.sy, v: 0.42, vib: 0.008, breath: 0.06 });
      tt = Math.min(e, tt + 4) + rr(0.25, 0.8);
    }
    const cr = noiseVoice(ac, bus, t, D + 0.1, 'pink', 'bandpass', 1000, 0.6);
    const lv = [[0, 0.07]]; for (let x = 1.5; x < D; x += rr(1.5, 3)) lv.push([x, rr(0.05, 0.12)]);
    lv.push([D, 0.07]);
    pts(cr.g.gain, t, lv);
    if (roar) {
      const rg = noiseVoice(ac, bus, tr, 4.5, 'pink', 'bandpass', 1200, 0.5);
      pts(rg.g.gain, tr, [[0, 0], [0.5, 0.5], [2.2, 0.42], [4.2, 0]]);
      P0.crowd(ac, bus, tr + 0.15, { n: 5, f0: 220, spread: 7, jitter: 0.2, v: 0.35, sy: [[0, 2.2, 'ay', 0, 1, 3]] });
    }
    const hp = filt(ac, 'highpass', 420, 0.7), lp = filt(ac, 'lowpass', 3400, 0.9), pk = filt(ac, 'peaking', 1500, 1.2);
    pk.gain.value = 6;
    const sh = shaper(ac, 2.4), g = gain(ac, 0, out);
    bus.connect(hp); hp.connect(pk); pk.connect(sh); sh.connect(lp); lp.connect(g);
    const hs = noiseVoice(ac, lp, t, D + 0.1, 'white', 'bandpass', 3000, 0.7);
    hs.g.gain.setValueAtTime(0.03, t);
    const am = osc0(ac); am.frequency.value = rr(0.3, 0.7); am.connect(gain(ac, 0.02, hs.g.gain)); am.start(t); am.stop(t + D + 0.1);
    pts(g.gain, t, [[0, 0], [0.3, 0.9], [D - 0.3, 0.9], [D, 0]]);
    return t + D;
  }

  /* ============================================================ night loops (stereo, seamless) */
  // Insects: field crickets (3-4 pulse chirps ~4.3-5.2 kHz), tree crickets (soft pulsed trill ~2.8-3.1 kHz), katydid
  // buzzes (7-10 kHz noise pulse trains) and a distant chorus wash. Event layers are folded; continuous layers crossfade.
  function insects(ac, out, L, F) {
    const v = 1;
    for (let i = 0; i < 4; i++) { // field crickets
      const f = rr(4300, 5200), pn = panner(ac, out); pn.pan.value = rr(-0.8, 0.8);
      const os = osc0(ac); os.frequency.value = f; const g = gain(ac, 0); os.connect(g); g.connect(pn);
      const per = rr(0.38, 0.6), pr = rr(28, 34), np = 3 + (rnd() < 0.5 ? 1 : 0), amp = rr(0.05, 0.11) * v;
      let x = rr(0, 0.6), singUntil = x + rr(3, 9);
      while (x < L) {
        if (x > singUntil) { x += rr(0.6, 3); singUntil = x + rr(3, 10); continue; }
        for (let j = 0; j < np; j++) { const tp = x + j / pr; g.gain.setValueAtTime(0, tp); g.gain.linearRampToValueAtTime(amp, tp + 0.004); g.gain.linearRampToValueAtTime(amp * 0.7, tp + 0.013); g.gain.linearRampToValueAtTime(0, tp + 0.019); }
        x += per * rr(0.95, 1.05);
      }
      os.start(0); os.stop(L + F);
    }
    for (let i = 0; i < 2; i++) { // tree crickets: continuous pulsed trill
      const pn = panner(ac, out); pn.pan.value = i ? 0.5 : -0.45;
      const os = osc0(ac); os.frequency.value = i ? 3050 : 2820;
      const a1 = gain(ac, 0.5), lfo = osc0(ac); lfo.frequency.value = i ? 52 : 44; lfo.connect(gain(ac, 0.5, a1.gain));
      const g = gain(ac, 0); os.connect(a1); a1.connect(g); g.connect(pn);
      loopFade(g, 0.035 * v, L, F);
      os.start(0); lfo.start(0); os.stop(L + F); lfo.stop(L + F);
    }
    { // katydids: "tzzt-tzzt" groups
      let x = rr(0.5, 2);
      while (x < L) {
        const pn = panner(ac, out); pn.pan.value = rr(-0.7, 0.7);
        const nsy = 2 + ((rnd() * 3) | 0), fc = rr(7500, 9500);
        for (let s = 0; s < nsy; s++) {
          const nv = noiseVoice(ac, pn, x, 0.2, 'white', 'bandpass', fc, 3);
          const hits = []; for (let y = x; y < x + 0.13; y += 1 / 60) hits.push([y, 1]);
          pulses(nv.g.gain, hits, 0.16 * v, 0.004);
          nv.g.gain.setValueAtTime(0, x + 0.16);
          x += rr(0.22, 0.32);
        }
        x += rr(3, 6);
      }
    }
    { // distant chorus wash
      const ns = ac.createBufferSource(); ns.buffer = noiseBuf(ac, 'pink'); ns.loop = true;
      const b1 = filt(ac, 'bandpass', 4700, 7), b2 = filt(ac, 'bandpass', 3000, 6), g = gain(ac, 0, out);
      ns.connect(b1); ns.connect(b2); b1.connect(g); b2.connect(gain(ac, 0.6, g));
      loopFade(g, 0.22 * v, L, F);
      ns.start(0); ns.stop(L + F);
    }
    return L + F;
  }
  // Frogs near water: bullfrog-like "grrok" croaks (pulsed glottal through two resonances), small frogs' "tik" series
  function frogs(ac, out, L, F) {
    for (let i = 0; i < 3; i++) {
      const pn = panner(ac, out); pn.pan.value = [-0.6, 0.15, 0.7][i];
      const f0 = [150, 205, 255][i] * rr(0.92, 1.08);
      const os = ac.createOscillator(); os.type = 'sawtooth'; os.frequency.value = f0;
      const g = gain(ac, 0), b1 = filt(ac, 'bandpass', 650 + i * 120, 3), b2 = filt(ac, 'bandpass', 1450 + i * 150, 4);
      os.connect(g); g.connect(b1); g.connect(b2); b1.connect(gain(ac, 1.2, pn)); b2.connect(gain(ac, 0.5, pn));
      let x = rr(0.2, 3);
      while (x < L) {
        const nc = 2 + ((rnd() * 4) | 0);
        for (let c = 0; c < nc && x < L; c++) {
          const d = rr(0.22, 0.4), hits = [];
          os.frequency.setValueAtTime(f0 * 1.08, x); os.frequency.linearRampToValueAtTime(f0 * 0.9, x + d);
          for (let y = x; y < x + d; y += 1 / rr(20, 26)) hits.push([y, Math.sin(Math.PI * (y - x) / d) * rr(0.7, 1)]);
          pulses(g.gain, hits, 0.32, 0.012);
          g.gain.setValueAtTime(0, x + d + 0.04);
          x += d + rr(0.35, 0.7);
        }
        x += rr(1.5, 5);
      }
      os.start(0); os.stop(L + F);
    }
    { // small frogs: "tik-tik-tik"
      const pn = panner(ac, out); pn.pan.value = rr(-0.3, 0.3);
      const os = osc0(ac); os.frequency.value = rr(2300, 2900);
      const g = gain(ac, 0); os.connect(g); g.connect(pn);
      let x = rr(1, 3);
      while (x < L) {
        const n = 3 + ((rnd() * 6) | 0);
        for (let k = 0; k < n; k++) { const tp = x + k * rr(0.17, 0.22); g.gain.setValueAtTime(0, tp); g.gain.linearRampToValueAtTime(0.13, tp + 0.003); g.gain.linearRampToValueAtTime(0, tp + 0.03); }
        x += n * 0.2 + rr(2, 5);
      }
      os.start(0); os.stop(L + F);
    }
    return L + F;
  }

  /* ============================================================ register SFX */
  const birlaGuard = (o) => { // Birla Mandir has no bells (bible; systems §12.1/§12.3): nothing within its respect zone
    const bm = N.places && N.places.birla_mandir;
    if (!bm) return false;
    const L = X.listener();
    const near = (x, y) => x != null && y != null && Math.hypot(x - bm.x, y - bm.y) < 330;
    return near(o.x, o.y) || (L && near(L.x, L.y));
  };
  const templeCached = cached('temple_bell', templeSynth, 9, 3);
  reg('temple_bell', (ac, out, t, o) => {
    if (ac === X.ctx && birlaGuard(o)) { stats.suppressed.temple_bell = (stats.suppressed.temple_bell || 0) + 1; return t; }
    return templeCached(ac, out, t, o);
  }, { cooldown: 2.5 });
  reg('crow_caw', crow, { cooldown: 0.6 });
  reg('koel', cached('koel', koel, 7, 3), { cooldown: 4 });
  reg('coo', coo, { cooldown: 1 });
  reg('pigeons', cached('pigeons', pigeonsSynth, 4, 3), { cooldown: 1.2 });
  reg('bird', bird, { cooldown: 0.15 });
  reg('cheel', cheel, { cooldown: 3 });
  reg('dog_bark', dogBark, { cooldown: 0.8 });
  reg('cow_moo', cowMoo, { cooldown: 2 });
  reg('goat_bleat', goat, { cooldown: 1 });
  reg('cooker', cached('cooker', cookerSynth, 12, 3), { cooldown: 3 });
  reg('church_bell', cached('church_bell', churchSynth, 20, 2), { cooldown: 6 });
  reg('school_bell', cached('school_bell', schoolSynth, 6, 2), { cooldown: 4 });
  reg('vendor_call', vendorCall, { cooldown: 1.5 });
  reg('gossip', gossip, { cooldown: 2 });
  reg('construction', construction, { cooldown: 1.5 });
  reg('boat_putt', boatPutt, { cooldown: 3 });
  reg('train_pass', cached('train_pass', trainPass, 10, 2), { cooldown: 12 });
  reg('dhobi_slap', dhobi, { cooldown: 1.5 });
  reg('radio_cricket', radioClip, { cooldown: 0.5 });
  for (const k of ['pigeons', 'coo', 'crow_caw', 'goat_bleat', 'construction', 'dhobi_slap', 'boat_putt']) X.DAY_ONLY.add(k);

  /* ============================================================ calendar */
  const BASE = () => (N.clock && N.clock.baseDate) || [2003, 0, 14];
  const dateOf = (day) => { const b = BASE(); return new Date(Date.UTC(b[0], b[1], b[2] + ((day == null ? (N.clock && N.clock.day) || 0 : day) | 0))); };
  const weekday = (day) => dateOf(day).getUTCDay(); // 0 = Sunday (Day 0 = Tue 14 Jan 2003)
  const month = (day) => dateOf(day).getUTCMonth(); // 0 = Jan
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };

  /* ============================================================ time-of-day curves (hour 0..24, month 0..11) */
  const band = (h, list, dflt) => { for (const b of list) if (h >= b[0] && h < b[1]) return b[2]; return dflt; };
  const CURVE = {
    any: () => 1,
    day: (h) => band(h, [[6, 19.5, 1]], 0),
    birds: (h) => band(h, [[5.3, 7.5, 3], [7.5, 10, 1.3], [10, 12, 0.7], [12, 15.5, 0.3], [15.5, 17, 0.8], [17, 18.7, 1.6]], 0),
    crows: (h) => band(h, [[5.5, 7.5, 2], [7.5, 12, 1], [12, 15.5, 0.55], [15.5, 17, 1], [17, 18.8, 2.2]], 0),
    koel: (h, m) => (m >= 2 && m <= 5 ? 1 : 0.12) * band(h, [[5, 10, 2], [10, 17, 0.6], [17, 19, 0.9], [22, 24, 0.15], [0, 4, 0.15]], 0),
    pigeons: (h) => band(h, [[6, 8, 1.5], [8, 18.5, 1]], 0),
    soar: (h) => band(h, [[9, 17, 1]], 0),
    meal: (h) => band(h, [[6.5, 9, 2], [9, 11.3, 0.4], [11.3, 13.5, 3.5], [13.5, 19, 0.3], [19, 21.3, 3]], 0),
    hawker: (h) => band(h, [[6.5, 11, 1.5], [11, 16, 0.6], [16, 19.5, 1]], 0),
    morning: (h) => band(h, [[5.5, 9, 1.5], [9, 12, 0.3]], 0),
    purani: (h) => band(h, [[10, 16.5, 1]], 0),
    kulfi: (h, m) => (m >= 2 && m <= 5 ? 1.5 : 1) * band(h, [[12, 20, 1]], 0),
    bhutta: (h, m) => (m >= 6 && m <= 8 ? 2 : 1) * band(h, [[16.5, 21.5, 1]], 0),
    chai: (h) => band(h, [[6, 22, 0.8]], 0),
    kids: (h) => band(h, [[7.5, 9, 0.6], [9, 13, 0.2], [13, 14, 0.8], [14, 16, 0.25], [16, 19, 1.5], [19, 20.5, 0.4]], 0),
    gossip: (h) => band(h, [[10, 13, 0.5], [13, 16, 0.25], [16, 21, 1.2], [21, 22.5, 0.4]], 0),
    rush: (h) => band(h, [[6, 8.5, 0.6], [8.5, 10.5, 1.6], [10.5, 17.5, 1], [17.5, 20, 2.2], [20, 22, 0.7]], 0.15),
    work: (h) => band(h, [[8, 13, 1], [14, 18, 1]], 0),
    night: (h) => band(h, [[21.5, 24, 1], [0, 4.5, 1]], 0),
    dusk: (h) => band(h, [[18.5, 23, 1]], 0.15),
  };
  // per-bed one-shots: [name, rate/min, curve, opts]
  const SCHED = {
    oldcity: [['pigeons', 2.5, 'pigeons'], ['coo', 1.2, 'pigeons'], ['crow_caw', 1.5, 'crows'], ['bird', 1.5, 'birds', { variant: 'sparrow' }], ['koel', 0.25, 'koel'],
      ['vendor_call', 0.8, 'hawker', { variant: 'banana' }], ['vendor_call', 0.5, 'hawker', { variant: 'veg' }], ['vendor_call', 0.6, 'chai', { variant: 'chai' }],
      ['vendor_call', 0.3, 'purani', { variant: 'purani' }], ['vendor_call', 0.6, 'bhutta', { variant: 'bhutta' }], ['gossip', 1, 'gossip'], ['auto_horn', 2, 'rush', { far: 1 }],
      ['kids', 0.5, 'kids'], ['goat_bleat', 0.5, 'day'], ['dog_bark', 0.6, 'night'], ['cooker', 0.4, 'meal']],
    market: [['crow_caw', 1, 'crows'], ['pigeons', 1, 'pigeons'], ['bird', 0.8, 'birds', { variant: 'sparrow' }], ['vendor_call', 2, 'hawker', { variant: 'veg' }],
      ['vendor_call', 1.5, 'hawker', { variant: 'banana' }], ['vendor_call', 0.8, 'hawker', { variant: 'flower' }], ['vendor_call', 1, 'chai', { variant: 'chai' }],
      ['vendor_call', 0.6, 'morning', { variant: 'paper' }], ['vendor_call', 0.3, 'purani', { variant: 'purani' }], ['gossip', 0.8, 'gossip'],
      ['auto_horn', 2.5, 'rush', { far: 1 }], ['cow_moo', 0.3, 'day']],
    colonial: [['crow_caw', 1.2, 'crows'], ['pigeons', 0.8, 'pigeons'], ['bird', 1, 'birds'], ['koel', 0.2, 'koel'], ['bus_horn', 1.2, 'rush', { far: 1 }],
      ['car_horn', 1.5, 'rush', { far: 1 }], ['auto_horn', 1.5, 'rush', { far: 1 }], ['vendor_call', 0.8, 'morning', { variant: 'paper' }], ['vendor_call', 0.4, 'chai', { variant: 'chai' }]],
    colony: [['bird', 5, 'birds'], ['crow_caw', 2, 'crows'], ['koel', 0.8, 'koel'], ['cooker', 1.2, 'meal'], ['vendor_call', 1, 'hawker', { variant: 'veg' }],
      ['vendor_call', 0.7, 'hawker', { variant: 'banana' }], ['vendor_call', 0.6, 'morning', { variant: 'flower' }], ['vendor_call', 0.6, 'kulfi', { variant: 'kulfi' }],
      ['kulfi_bell', 0.6, 'kulfi'], ['vendor_call', 0.5, 'purani', { variant: 'purani' }], ['vendor_call', 0.6, 'morning', { variant: 'paper' }],
      ['vendor_call', 0.4, 'bhutta', { variant: 'bhutta' }], ['kids', 0.8, 'kids'], ['gossip', 0.6, 'gossip'], ['cow_moo', 0.2, 'day'], ['goat_bleat', 0.15, 'day'],
      ['pigeons', 0.4, 'pigeons'], ['scooter_horn', 0.6, 'rush', { far: 1 }]],
    posh: [['bird', 5, 'birds'], ['koel', 0.6, 'koel'], ['crow_caw', 1, 'crows'], ['cheel', 0.3, 'soar'], ['car_horn', 0.6, 'rush', { far: 1 }], ['cooker', 0.3, 'meal'],
      ['vendor_call', 0.3, 'kulfi', { variant: 'kulfi' }], ['kulfi_bell', 0.3, 'kulfi'], ['dog_bark', 0.3, 'night', { variant: 'big' }]],
    rocky: [['cheel', 1.5, 'soar'], ['bird', 2.5, 'birds', { variant: 'myna' }], ['crow_caw', 0.6, 'crows'], ['goat_bleat', 0.6, 'day'], ['cow_moo', 0.2, 'day'], ['koel', 0.2, 'koel']],
    cantonment: [['crow_caw', 1.2, 'crows'], ['bird', 2, 'birds'], ['koel', 0.5, 'koel'], ['train_horn', 0.5, 'any', { far: 1, vol: 0.55 }], ['train_pass', 0.25, 'any', { far: 1, vol: 0.6 }],
      ['bus_horn', 1, 'rush', { far: 1 }], ['car_horn', 1.2, 'rush', { far: 1 }], ['auto_horn', 1, 'rush', { far: 1 }], ['pigeons', 0.6, 'pigeons']],
    hitec: [['construction', 2.5, 'work', { far: 1 }], ['bird', 1.5, 'birds', { variant: 'myna' }], ['cheel', 0.5, 'soar'], ['car_horn', 0.4, 'rush', { far: 1 }], ['crow_caw', 0.4, 'crows'], ['goat_bleat', 0.2, 'day']],
    lake: [['bird', 2, 'birds'], ['crow_caw', 0.8, 'crows'], ['cheel', 0.5, 'soar'], ['water_lap', 2, 'any'], ['boat_putt', 0.6, 'day', { far: 1 }], ['vendor_call', 0.5, 'kulfi', { variant: 'kulfi' }],
      ['vendor_call', 0.6, 'bhutta', { variant: 'bhutta' }], ['kids', 0.5, 'kids'], ['pigeons', 0.4, 'pigeons']],
  };
  // district beds: layer levels (0..1 of the core LEVEL) + the steady core one-shots (night-scaled by the core);
  // the time-shaped one-shots above run in this file's scheduler
  const BEDDEF = {
    oldcity: { murmur: 0.6, chatter: 0.45, wind: 0.05, traffic: 0.22, ev: { bell: 4, scooter_horn: 2, bangles: 1.2, kulfi_bell: 0.5 } },
    market: { murmur: 0.65, chatter: 0.5, traffic: 0.28, ev: { bell: 3, coin: 1.5, scooter_horn: 2, kulfi_bell: 0.8 } },
    colonial: { murmur: 0.38, chatter: 0.15, wind: 0.06, traffic: 0.6, ev: { bell: 2, scooter_horn: 2, whistle: 0.4 } },
    colony: { murmur: 0.12, chatter: 0.05, wind: 0.2, traffic: 0.1, ev: { bell: 1.5 } },
    posh: { murmur: 0.05, wind: 0.28, traffic: 0.2, ev: { bell: 0.4 } },
    rocky: { wind: 0.55, traffic: 0.03, ev: {} },
    cantonment: { murmur: 0.3, chatter: 0.1, traffic: 0.45, ev: { bell: 1.5 } },
    hitec: { wind: 0.42, traffic: 0.12, ev: {} },
    lake: { wind: 0.35, water: 0.6, murmur: 0.06, ev: { bell: 0.5 } },
  };
  const BEDBASE = {};
  for (const id in BEDDEF) { BEDBASE[id] = Object.assign({}, BEDDEF[id]); X.registerBed(id, BEDDEF[id]); }
  const TRAF = (h) => band(h, [[8.5, 10.5, 1.25], [13, 16, 0.85], [17.5, 20, 1.4], [20, 22, 0.8]], 1);
  const MURM = (h) => band(h, [[13, 15.5, 0.8], [17, 21, 1.2]], 1);

  /* ============================================================ place rules (first: they shadow the core's) */
  const TEMPLES = ['dilsukhnagar_sai_temple', 'ujjaini_mahankali_temple', 'lal_darwaza_temple', 'peddamma_temple', 'chilkur_balaji'];
  const placeRules = [
    { m: 'dilsukhnagar_sai_temple', r: 280, tag: 'temple', ev: [['vendor_call', 1.2, { variant: 'flower' }]], bed: { murmur: 0.25 } },
    { m: 'ujjaini_mahankali_temple', r: 280, tag: 'temple', ev: [['vendor_call', 0.6, { variant: 'flower' }]] },
    { m: 'lal_darwaza_temple', r: 260, tag: 'temple', ev: [['vendor_call', 0.6, { variant: 'flower' }]] },
    { m: 'peddamma_temple', r: 260, tag: 'temple', ev: [['vendor_call', 0.6, { variant: 'flower' }]] },
    { m: 'chilkur_balaji', r: 260, tag: 'temple' },
    { m: 'temple_', r: 220, tag: 'temple', ev: [['vendor_call', 0.4, { variant: 'flower' }]] },
    { m: '_temple', suf: true, r: 240, tag: 'temple' },
    { m: 'school_', r: 240, day: true, tag: 'school', ev: [['kids', 0.5]] },
    { m: 'church_', r: 260, tag: 'church', ev: [['bird', 1.5]] },
    { m: 'st_johns_church_secunderabad', r: 260, tag: 'church', ev: [['bird', 1]] },
    { m: 'holy_trinity_church_bolarum', r: 260, tag: 'church', ev: [['bird', 1.5]] },
    { m: 'st_georges_church_abids', r: 240, tag: 'church' },
    { m: '_cathedral', suf: true, r: 260, tag: 'church' },
    { m: 'musi_riverbed', r: 320, ev: [['dhobi_slap', 3]], bed: { water: 0.15 } },
    { m: 'lumbini_jetty', r: 220, ev: [['water_lap', 4], ['bell', 0.5], ['boat_putt', 1]], bed: { water: 0.3 } },
    { m: 'irani_cafe_', r: 170, ev: [['cup_clink', 6], ['plates', 1.5], ['coin', 1], ['gossip', 0.5], ['vendor_call', 0.5, { variant: 'chai' }]], bed: { chatter: 0.25 } },
    { m: 'meat_shop_', r: 120, ev: [['chop', 1.5], ['goat_bleat', 0.6]] },
    { m: 'gaddiannaram_fruit_market', r: 300, ev: [['vendor_call', 4, { variant: 'banana' }], ['vendor_call', 2, { variant: 'veg' }], ['coin', 2]], bed: { chatter: 0.35 } },
    { m: 'kirana_', r: 120, tag: 'shop', ev: [['coin', 1.5], ['cash', 0.5]] },
    { m: 'chai_bandi_', r: 130, tag: 'shop', ev: [['cup_clink', 3], ['vendor_call', 1, { variant: 'chai' }]] },
    { m: 'barber_', r: 110, tag: 'shop', ev: [['scissors', 2]] },
  ];
  for (let i = placeRules.length - 1; i >= 0; i--) X.registerPlace(placeRules[i], { first: true });
  const RADIO_SHOP = /^(kirana_|chai_bandi_|barber_|pan_)/;
  const MOSQUE = /^(mosque_|mecca_masjid|jama_masjid|spanish_mosque|khairatabad_mosque|moula_ali_dargah|dargah_|hussain_shah_wali_dargah)/;
  const WATERS = ['hussain_sagar', 'durgam_cheruvu', 'saroornagar_lake', 'mir_alam_tank', 'himayat_sagar', 'gandipet', 'lumbini_park', 'necklace_road', 'sanjeevaiah_park',
    'tank_bund', 'lower_tank_bund', 'ntr_gardens', 'indira_park', 'kbr_park', 'musi_riverbed', 'hide_zoo_pond'];
  let placeIdx = null;
  function places() { // lazily indexed lists (ids are checked to exist)
    if (placeIdx) return placeIdx;
    const P1 = N.places || {}, out = { school: [], church: [], mosque: [], water: [] };
    for (const id in P1) {
      const p = P1[id];
      if (!p || typeof p.x !== 'number') continue;
      if (/^school_\d+$/.test(id)) out.school.push([id, p]);
      if (/church|cathedral/.test(id)) out.church.push([id, p]);
      if (MOSQUE.test(id)) out.mosque.push([id, p]);
    }
    for (const id of WATERS) if (P1[id] && typeof P1[id].x === 'number') out.water.push([id, P1[id]]);
    if (Object.keys(P1).length) placeIdx = out;
    return out;
  }
  function nearest(list, L, maxD) {
    let best = null, bd = maxD;
    for (const [id, p] of list) { const d = Math.hypot(p.x - L.x, p.y - L.y); if (d < bd) { bd = d; best = { id, p, d }; } }
    return best;
  }

  /* ============================================================ continuous sources */
  // An emitter: ext.emitter (core, HRTF/reverb) when present, else gain -> air lowpass -> panner -> amb bus driven by ext.spatial
  function mkEmitter(ac, ref, max) {
    let em = null;
    if (typeof X.emitter === 'function') { try { em = X.emitter({ bus: 'amb', ref, max }); } catch (e) { em = null; } }
    const level = gain(ac, 0);
    if (em && em.input) {
      level.connect(em.input);
      return { input: level, level, set(x, y, g) { try { em.set(x, y, 0); } catch (e) { /* ignore */ } P0.sp(level.gain, g, ac.currentTime, 0.25); }, dispose() { try { level.disconnect(); em.dispose(); } catch (e) { /* ignore */ } } };
    }
    const lp = filt(ac, 'lowpass', 9000, 0.6), pn = panner(ac, X.bus('amb')), dist = gain(ac, 0);
    level.connect(lp); lp.connect(dist); dist.connect(pn);
    return {
      input: level, level,
      set(x, y, g) {
        const s = X.spatial(x, y, ref, max), t = ac.currentTime;
        P0.sp(dist.gain, s ? s.g : 0, t, 0.15);
        if (s) { if (pn.pan) P0.sp(pn.pan, s.pan, t, 0.15); P0.sp(lp.frequency, clamp(9000 * Math.exp(-s.d / 260), 1200, 9000), t, 0.2); }
        P0.sp(level.gain, g, t, 0.25);
      },
      dispose() { try { level.disconnect(); dist.disconnect(); pn.disconnect(); } catch (e) { /* ignore */ } },
    };
  }
  // Looping stereo bed (insects, frogs): BufferSource(loop) -> gain -> amb bus
  function mkLoopLayer(name, synth, L, F) {
    return { name, synth, L, F, buf: null, src: null, g: null, cur: 0, off: 0, requested: false };
  }
  const loops = { insects: mkLoopLayer('insects', insects, 16, 2), frogs: mkLoopLayer('frogs', frogs, 14, 2) };
  function loopUpdate(ly, target, t, dt) {
    const ac = X.ctx;
    if (target > 0.001 && !ly.buf && !ly.requested) {
      ly.requested = true;
      PR.queue.push({ key: 'loop:' + ly.name, sec: ly.L + ly.F, ch: 2, loop: [ly.L, ly.F], o: {}, synth: (oc, out) => ly.synth(oc, out, ly.L, ly.F), done: (b) => { ly.buf = b; } });
      prPump();
    }
    if (ly.buf && target > 0.001 && !ly.src) {
      ly.g = gain(ac, 0, X.bus('amb'));
      ly.src = ac.createBufferSource(); ly.src.buffer = ly.buf; ly.src.loop = true; ly.src.connect(ly.g); ly.src.start(t, rnd() * ly.L);
      ly.cur = 0;
    }
    if (!ly.src) return;
    if (Math.abs(target - ly.cur) > 0.0005) { P0.sp(ly.g.gain, target, t, 2.5); ly.cur = target; }
    if (target <= 0.001) { ly.off += dt; if (ly.off > 12) { try { ly.src.stop(); ly.src.disconnect(); ly.g.disconnect(); } catch (e) { /* ignore */ } ly.src = null; ly.g = null; ly.off = 0; } } else ly.off = 0;
  }
  // The shop radio: chained pre-rendered clips (12 s, 4 variants, one with a boundary roar) with baked 0.3 s fades
  const radio = { em: null, shop: null, next: 0, clips: [], requested: 0, cur: 0 };
  function radioWanted(info) {
    const f = N.flags || {}, h = info.hour;
    if (h < 9.5 || h > 19.5) return false;
    if (f.cricket) return true;
    return hash('cricket:' + ((N.clock && N.clock.day) || 0)) < 0.5 && h >= 11 && h <= 18.5;
  }
  function radioUpdate(info, t) {
    const ac = X.ctx, L = info.L;
    let best = null;
    if (L && radioWanted(info)) for (const a of info.active) {
      if (!a.p || !RADIO_SHOP.test(a.id) || hash('radio:' + a.id) > 0.55) continue;
      const d = Math.hypot(a.p.x - L.x, a.p.y - L.y);
      if (d < 170 && (!best || d < best.d)) best = { id: a.id, p: a.p, d };
    }
    if (best && radio.clips.length < 4 && radio.requested < 4 && PR.queue.length < 3) {
      const k = radio.requested++;
      PR.queue.push({ key: 'radio:' + k, sec: 12, o: { dur: 12, roar: k === 1 }, synth: radioClip, done: (b) => { if (b) radio.clips.push(b); } });
      prPump();
    }
    if (radio.em && (!best || best.id !== radio.shop)) { // fade out, dispose later
      const em = radio.em; em.set(radio.p.x, radio.p.y, 0);
      setTimeout(() => em.dispose(), 1500);
      radio.em = null; radio.shop = null;
    }
    if (best && !radio.em && radio.clips.length) { radio.em = mkEmitter(ac, 25, 240); radio.shop = best.id; radio.p = best.p; radio.next = t + 0.05; }
    if (!radio.em) return;
    radio.em.set(radio.p.x, radio.p.y, 0.55);
    if (t >= radio.next - 0.25) {
      const b = radio.clips.length > 1 && rnd() < 0.25 ? radio.clips[1] : pick(radio.clips);
      const s = ac.createBufferSource(); s.buffer = b; s.connect(radio.em.input);
      const st = Math.max(t, radio.next); s.start(st);
      radio.next = st + b.duration - 0.3; radio.cur++;
      stats.played.radio_cricket = (stats.played.radio_cricket || 0) + 1;
    }
  }

  /* ============================================================ the scheduler */
  const S = { prevMin: null, temple: Object.create(null), recessUntil: -1, warm: false, layT: 0, hush: 1 };
  function fire(name, rate, o, info, dt, at) {
    if (rate <= 0 || rnd() >= (rate * dt) / 60) return false;
    const L = info.L;
    let x, y;
    if (at) { x = at.x + rr(-20, 20); y = at.y + rr(-20, 20); } else { const a = rnd() * TAU, r = o && o.far ? rr(260, 560) : rr(110, 420); x = L.x + Math.cos(a) * r; y = L.y + Math.sin(a) * r; }
    stats.sched++;
    return X.play(name, Object.assign({ x, y, bus: 'amb', vol: 0.75, ref: 70, max: o && o.far ? 900 : 650 }, o || {}));
  }
  function warmup() { // pre-render the common heavy one-shots in idle time, one at a time
    S.warm = true;
    const list = [['koel', koel, 7, {}], ['cooker', cookerSynth, 12, {}], ['pigeons', pigeonsSynth, 4, {}], ['temple_bell', templeSynth, 9, {}], ['school_bell', schoolSynth, 6, {}]];
    for (const [name, fn, sec, o] of list) prRequest(prKey(name, o), fn, sec, o, 1);
  }
  function update(dt, mode, info) {
    const ac = X.ctx;
    if (!ac || ac.state !== 'running') return;
    const t = info.t, h = info.hour, L = info.L;
    if (!S.warm && t > 3) warmup();
    const on = info.playing && L;
    const day = (N.clock && N.clock.day) || 0, wd = weekday(day), mo = month(day), min = N.clock ? N.clock.minutes : 720;
    const bed = info.bed;
    // 1) beds follow the hour (rush traffic, midday lull, evening murmur; the dusk hush near mosques)
    S.layT -= dt;
    if (S.layT <= 0) {
      S.layT = 1;
      const ix = places();
      const mq = on ? nearest(ix.mosque, L, 380) : null;
      S.hush = mq && ((h >= 18.15 && h < 18.75) || (h >= 4.9 && h < 5.4)) ? 0.35 : 1;
      for (const id in BEDDEF) {
        const B = BEDDEF[id], B0 = BEDBASE[id];
        if (B0.traffic != null) B.traffic = clamp(B0.traffic * TRAF(h) * (S.hush < 1 ? 0.7 : 1), 0, 1);
        if (B0.murmur != null) B.murmur = clamp(B0.murmur * MURM(h) * S.hush, 0, 1);
        if (B0.chatter != null) B.chatter = clamp(B0.chatter * MURM(h) * S.hush, 0, 1);
      }
      // night loops: insects (all beds, fewer in dense lanes; winter softer), frogs near water (monsoon louder)
      const nightK = h >= 19 ? clamp((h - 19) / 1.5, 0, 1) : h < 6 ? clamp((6 - h) / 0.8, 0, 1) : 0;
      const dense = bed === 'oldcity' || bed === 'market' ? 0.35 : bed === 'colonial' ? 0.6 : 1;
      const season = mo === 11 || mo <= 1 ? 0.7 : mo >= 5 && mo <= 8 ? 1.25 : 1;
      let water = 0;
      if (on) {
        try { water = (N.audio._internal && N.audio._internal.amb.waterFrac) || 0; } catch (e) { water = 0; }
        const wn = nearest(ix.water, L, 700);
        if (wn) water = Math.max(water, 1 - wn.d / 700);
        if (bed === 'lake') water = Math.max(water, 0.8);
      }
      const frogK = (h >= 18.5 || h < 5.5 ? 1 : 0) * (mo >= 5 && mo <= 9 ? 1.4 : mo === 11 || mo <= 1 ? 0.5 : 1);
      S.insT = on ? 0.32 * nightK * dense * season : 0;
      S.frogT = on ? 0.45 * clamp(water * 1.3, 0, 1) * frogK : 0;
    }
    loopUpdate(loops.insects, S.insT || 0, t, dt);
    loopUpdate(loops.frogs, S.frogT || 0, t, dt);
    try { radioUpdate(info, t); } catch (e) { err('radio', e); }
    // 2) clock-scheduled bells (crossings of the minute marks; jumps > 5 game minutes do not ring)
    const prev = S.prevMin;
    S.prevMin = min;
    if (!on) return;
    const crossed = (mk) => prev != null && min - prev >= 0 && min - prev <= 5 && prev < mk && min >= mk;
    const ix = places();
    if (wd >= 1 && wd <= 6) for (const mk of [525, 750, 945]) if (crossed(mk)) {
      const sc = nearest(ix.school, L, 520);
      if (sc) { X.play('school_bell', { x: sc.p.x, y: sc.p.y, bus: 'amb', vol: 0.9, ref: 90, max: 950, force: true }); if (mk === 750) S.recessUntil = min + 25; }
    }
    if (wd === 0 && h >= 7 && h < 10.5) for (const mk of [450, 525, 585]) if (crossed(mk)) {
      const ch = nearest(ix.church, L, 1100);
      if (ch) X.play('church_bell', { x: ch.p.x, y: ch.p.y, bus: 'amb', vol: 0.95, ref: 160, max: 1400, force: true, variant: mk === 585 ? 'toll' : 'peal' });
      else if (bed === 'cantonment') { const a = hash('ch' + day) * TAU; X.play('church_bell', { x: L.x + Math.cos(a) * 650, y: L.y + Math.sin(a) * 650, bus: 'amb', vol: 0.9, ref: 160, max: 1400, force: true, variant: 'peal' }); }
    }
    // 3) places: temple bells while near a temple (never Birla Mandir: it has no 'temple' tag + the hard guard),
    //    recess kids at schools, pigeons at mosques at dawn/dusk
    const seen = Object.create(null);
    const night = h >= 22 || h < 5;
    for (const a of info.active) {
      const R0 = a.rule;
      if (!R0 || !a.p) continue;
      if (R0.tag === 'temple' && a.id !== 'birla_mandir') {
        seen[a.id] = 1;
        const aarti = (h >= 5.5 && h < 7.5) || (h >= 18 && h < 19.5);
        if (S.temple[a.id] == null) S.temple[a.id] = t + rr(1.2, 3.5);
        else if (t >= S.temple[a.id]) {
          S.temple[a.id] = t + rr(9, 26) * (aarti ? 0.6 : 1);
          if (!night) X.play('temple_bell', { x: a.p.x + rr(-10, 10), y: a.p.y + rr(-10, 10), bus: 'amb', vol: 0.8, ref: 70, max: R0.r * 1.6, variant: aarti && rnd() < 0.35 ? 'aarti' : undefined });
        }
      } else if (R0.tag === 'school' && min < S.recessUntil && wd >= 1 && wd <= 6) fire('kids', 6, { vol: 0.7 }, info, dt, a.p);
      else if (MOSQUE.test(a.id) && ((h >= 5.5 && h < 7) || (h >= 17.5 && h < 18.8))) fire('coo', 2, {}, info, dt, a.p);
    }
    for (const id in S.temple) if (!seen[id]) delete S.temple[id];
    // 4) the district's time-shaped one-shots
    const list = SCHED[bed];
    if (list) for (const e of list) {
      const c = CURVE[e[2]] ? CURVE[e[2]](h, mo) : 1;
      const city = /vendor|horn|gossip|construction|kids|cooker/.test(e[0]) ? S.hush : 1;
      fire(e[0], e[1] * c * city, e[3], info, dt);
    }
    // the city everywhere: distant trains at night, a koel at night in summer
    fire('train_horn', bed === 'cantonment' ? 0.25 : 0.1, { far: 1, vol: 0.5 }, info, dt * CURVE.dusk(h));
  }
  X.onUpdate('ambience', update, 5);

  /* ============================================================ offline bed render (tests / tools) */
  // Renders a district bed at an hour into an (Offline)AudioContext: the core's noise layers at this bed's levels and
  // a simulated ~60 s of scheduled one-shots at random distances (gain + air lowpass), night loops when dark.
  const LEVEL = { murmur: 0.24, chatter: 0.05, wind: 0.22, water: 0.32, traffic: 0.26 };
  const SFXT = () => N.audio._internal.SFX;
  function renderBed(ac, out, bedId, hour, sec, o) {
    o = o || {};
    const B = BEDBASE[bedId] || {}, mo = o.month == null ? 3 : o.month;
    const night = hour >= 18.75 || hour < 6.1, dawn = hour > 5 && hour < 7.5;
    const lay = { murmur: ['pink', 'bandpass', 480, 0.6], chatter: ['pink', 'bandpass', 1350, 1.4], wind: ['brown', 'lowpass', 420, 0.8], water: ['brown', 'lowpass', 750, 0.7], traffic: ['brown', 'lowpass', 200, 0.9] };
    const amb = gain(ac, 0.65, out);
    for (const k in lay) {
      let v = B[k] || 0;
      if (k === 'traffic') v *= TRAF(hour); if (k === 'murmur' || k === 'chatter') v *= MURM(hour);
      if (night) { if (k === 'murmur') v *= 0.35; if (k === 'chatter') v *= 0.2; if (k === 'traffic') v *= 0.45; } else if (dawn) { if (k === 'traffic') v *= 0.5; if (k === 'murmur') v *= 0.6; }
      if (v <= 0) continue;
      const s = ac.createBufferSource(); s.buffer = noiseBuf(ac, lay[k][0]); s.loop = true;
      const f = filt(ac, lay[k][1], lay[k][2], lay[k][3]); const g = gain(ac, 0, amb);
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(v * LEVEL[k], 1.5);
      s.connect(f); f.connect(g); s.start(0); s.stop(sec);
    }
    const SF = SFXT(), evs = [];
    const add = (name, rate, opts) => { if (rate <= 0) return; for (let x = rr(0, 60 / rate); x < sec - 1; x += -Math.log(1 - rnd() * 0.999) * 60 / rate) evs.push([x, name, opts || {}]); };
    for (const e of SCHED[bedId] || []) add(e[0], e[1] * (CURVE[e[2]] ? CURVE[e[2]](hour, mo) : 1), e[3]);
    for (const name in B.ev || {}) { let r = B.ev[name]; if (night) { if (X.DAY_ONLY.has(name)) r = 0; else if (/horn|bell/.test(name)) r *= 0.35; } add(name, r); }
    if (night && (bedId === 'colony' || bedId === 'posh')) { add('dog_bark', 0.8); add('gurkha', 0.35); }
    let nOne = 0;
    for (const [x, name, op] of evs) {
      if (!SF[name] || nOne > 60) continue;
      const d = op.far ? rr(260, 560) : rr(110, 420), ref = 70;
      const g = gain(ac, (op.vol || 0.75) * (ref / (ref + (d - ref) * 1.1)));
      const lp = filt(ac, 'lowpass', clamp(17000 * Math.exp(-d / 320), 900, 18000), 0.5);
      const pn = panner(ac, amb); if (pn.pan) pn.pan.value = rr(-0.8, 0.8);
      g.connect(lp); lp.connect(pn);
      try { SF[name](ac, g, x + 0.05, Object.assign({ live: true }, op)); nOne++; } catch (e) { err('renderBed.' + name, e); }
    }
    if (night) {
      const L0 = Math.min(sec, 16), ig = gain(ac, 0.32 * (bedId === 'oldcity' || bedId === 'market' ? 0.35 : 1), amb);
      insects(ac, ig, L0, 2);
      if (bedId === 'lake') frogs(ac, gain(ac, 0.45, amb), Math.min(sec, 14), 2);
    }
    return { end: sec, events: nOne };
  }

  N.audio.ambience = {
    stats, SCHED, CURVE, BEDS: BEDDEF, CALLS: Object.keys(CALLS), weekday, month, places, renderBed,
    radioShops: () => Object.keys(N.places || {}).filter((id) => RADIO_SHOP.test(id) && hash('radio:' + id) <= 0.55),
    synth: { insects, frogs, radioClip, voice, syr },
    layers: () => ({ insects: loops.insects.cur, frogs: loops.frogs.cur, insectsReady: !!loops.insects.buf, frogsReady: !!loops.frogs.buf,
      radio: radio.shop, radioClips: radio.clips.length, emitterApi: typeof X.emitter === 'function', prerendered: PR.rendered, prerenderMs: Math.round(PR.ms), cached: PR.cache.size }),
  };
})();
