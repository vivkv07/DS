/* NOSTALGIA trailer — original score + sound design, synthesised offline (WebAudio OfflineAudioContext).
 * Modern hybrid trap / EDM, 150 BPM, F minor (Fm - Db - Ab - Eb). Everything is generated here: no samples.
 * window.renderTrailerAudio(timeline, opts) -> Promise<{wav: base64, stats}>
 * Sections (bars, 1-based): intro 1-6, drop1 7-22, breakdown 23-26, drop2 27-34, finale 35-38, title 39-42, end 43-44.
 */
(() => {
  'use strict';
  const SR = 48000;
  const BPM = 150, B = 60 / BPM, BAR = 4 * B, S16 = B / 4;
  const bar = (n) => (n - 1) * BAR;          // start time of bar n (1-based)
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const TAU = Math.PI * 2;
  let ac, rnd;

  // seeded PRNG (deterministic renders)
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ------------------------------------------------------------ shared buffers + buses */
  let NOISE, BUS = {};
  function noiseBuf(sec) {
    const b = ac.createBuffer(2, Math.floor(SR * sec), SR);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
    return b;
  }
  function irBuf(sec, decay) {
    const b = ac.createBuffer(2, Math.floor(SR * sec), SR);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] = (rnd() * 2 - 1) * Math.pow(1 - t / sec, decay) * (t < 0.01 ? t / 0.01 : 1); }
    }
    return b;
  }
  function shaper(k) {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    const ws = ac.createWaveShaper(); ws.curve = c; ws.oversample = '2x'; return ws;
  }
  function gain(v, dest) { const g = ac.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }

  function makeBuses(raw) {
    const master = gain(raw ? 1 : 0.62);
    // master chain: glue comp -> soft clip -> limiter
    const glue = ac.createDynamicsCompressor();
    glue.threshold.value = -20; glue.ratio.value = 2.5; glue.attack.value = 0.01; glue.release.value = 0.15; glue.knee.value = 6;
    const clip = shaper(1.0);
    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -3; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08; lim.knee.value = 0;
    const out = gain(0.92);
    if (raw) master.connect(ac.destination);
    else { master.connect(glue); glue.connect(clip); clip.connect(lim); lim.connect(out); out.connect(ac.destination); }
    BUS.master = master;
    // reverb + delay sends
    const verb = ac.createConvolver(); verb.buffer = irBuf(3.2, 2.6);
    const verbLP = ac.createBiquadFilter(); verbLP.type = 'lowpass'; verbLP.frequency.value = 6500;
    BUS.verb = gain(1); BUS.verb.connect(verb); verb.connect(verbLP); verbLP.connect(gain(0.55, master));
    const big = ac.createConvolver(); big.buffer = irBuf(6, 1.8);
    BUS.big = gain(1); BUS.big.connect(big); big.connect(gain(0.5, master));
    const dl = ac.createDelay(2); dl.delayTime.value = B * 0.75;
    const fb = gain(0.38); const dlF = ac.createBiquadFilter(); dlF.type = 'bandpass'; dlF.frequency.value = 2200; dlF.Q.value = 0.5;
    BUS.delay = gain(1); BUS.delay.connect(dl); dl.connect(dlF); dlF.connect(fb); fb.connect(dl); dlF.connect(gain(0.5, master));
    // groups
    BUS.drums = gain(0.24); const dsat = shaper(1.8); BUS.drums.connect(dsat); dsat.connect(master);
    BUS.bass = gain(0.11, master);
    BUS.duck = gain(1, master);            // sidechained synths
    BUS.synth = gain(1.36, BUS.duck);
    BUS.fx = gain(0.36, master);
    // filter sweep on the synth group (breakdowns / builds)
    BUS.synthLP = ac.createBiquadFilter(); BUS.synthLP.type = 'lowpass'; BUS.synthLP.frequency.value = 20000; BUS.synthLP.Q.value = 0.9;
    BUS.synth.disconnect(); BUS.synth.connect(BUS.synthLP); BUS.synthLP.connect(BUS.duck);
  }
  // sidechain pump on every kick
  function duck(t, depth) {
    const g = BUS.duck.gain;
    g.setValueAtTime(1, Math.max(0, t - 0.004));
    g.linearRampToValueAtTime(1 - depth, t + 0.008);
    g.setTargetAtTime(1, t + 0.03, 0.07);
  }

  /* ------------------------------------------------------------ instruments */
  function env(g, t, a, peak, d, sus, rel, end) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(sus, t + a, d);
    if (end != null) { g.gain.setValueAtTime(sus, end); g.gain.setTargetAtTime(0, end, rel); }
  }
  function osc(type, f, t, stop, dest, detune) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (detune) o.detune.value = detune;
    o.connect(dest); o.start(t); o.stop(stop); return o;
  }
  function noise(t, dur, dest, rate) {
    const s = ac.createBufferSource(); s.buffer = NOISE; s.playbackRate.value = rate || 1;
    s.connect(dest); s.start(t, rnd() * 8, dur); return s;
  }

  function kick(t, v, sub) {
    v = v == null ? 1 : v;
    const g = gain(0, BUS.drums);
    const o = osc('sine', 165, t, t + 0.6, g);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.075);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.15 * v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.001, t + (sub ? 0.55 : 0.36));
    const cg = gain(0, BUS.drums); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; hp.connect(cg);
    noise(t, 0.02, hp); cg.gain.setValueAtTime(0.5 * v, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
    duck(t, 0.75);
  }
  function snare(t, v, verbAmt) {
    v = v == null ? 1 : v;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
    const g = gain(0, BUS.drums); bp.connect(g); g.connect(gain(verbAmt == null ? 0.35 : verbAmt, BUS.verb));
    noise(t, 0.3, bp);
    g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    const tg = gain(0, BUS.drums); const o = osc('triangle', 200, t, t + 0.15, tg); o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    tg.gain.setValueAtTime(0.55 * v, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    // clap layer
    const cbp = ac.createBiquadFilter(); cbp.type = 'bandpass'; cbp.frequency.value = 1250; cbp.Q.value = 1.1;
    const cg = gain(0, BUS.drums); cbp.connect(cg); cg.connect(gain(0.4, BUS.verb));
    noise(t - 0.012, 0.3, cbp);
    for (const d of [0, 0.011, 0.022]) { cg.gain.setValueAtTime(0.75 * v, t - 0.012 + d); cg.gain.exponentialRampToValueAtTime(0.06, t - 0.012 + d + 0.009); }
    cg.gain.setValueAtTime(0.6 * v, t + 0.012); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  }
  function hat(t, v, open, pan) {
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = open ? 6500 : 8000;
    const g = gain(0); const p = ac.createStereoPanner(); p.pan.value = pan || 0; hp.connect(g); g.connect(p); p.connect(BUS.drums);
    noise(t, open ? 0.4 : 0.08, hp, 1.3);
    g.gain.setValueAtTime(0.32 * (v == null ? 1 : v), t); g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.28 : 0.045));
  }
  function bass808(t, m, dur, glideFrom) {
    const g = gain(0); const sat = shaper(2.6); g.connect(sat); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; sat.connect(lp); lp.connect(BUS.bass);
    const f = mtof(m), end = t + dur;
    const o = osc('sine', glideFrom ? mtof(glideFrom) : f, t, end + 0.3, g);
    if (glideFrom) o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    const o2 = osc('triangle', f * 2, t, end + 0.3, gain(0.12, g));
    if (glideFrom) o2.frequency.setValueAtTime(mtof(glideFrom) * 2, t), o2.frequency.exponentialRampToValueAtTime(f * 2, t + 0.09);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.85, t + 0.006); g.gain.setTargetAtTime(0.55, t + 0.05, 0.4);
    g.gain.setValueAtTime(0.55, end); g.gain.setTargetAtTime(0, end, 0.05);
  }
  function supersaw(t, notes, dur, o) {
    o = o || {};
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
    const c0 = o.cut0 || 900, c1 = o.cut1 || 5200;
    lp.frequency.setValueAtTime(c0, t); lp.frequency.exponentialRampToValueAtTime(c1, t + (o.open || 0.05)); lp.frequency.setTargetAtTime(o.cutS || 2600, t + 0.1, 0.4);
    const g = gain(0); lp.connect(g); g.connect(o.dest || BUS.synth); if (o.verb) g.connect(gain(o.verb, BUS.verb));
    env(g, t, o.a || 0.01, o.v || 0.16, 0.25, (o.v || 0.16) * (o.sus == null ? 0.75 : o.sus), o.rel || 0.12, t + dur);
    const dets = [-24, -12, -5, 0, 6, 13, 25];
    for (const m of notes) {
      for (let i = 0; i < dets.length; i++) {
        const p = ac.createStereoPanner(); p.pan.value = (i / (dets.length - 1)) * 1.6 - 0.8; p.connect(lp);
        const so = osc('sawtooth', mtof(m), t, t + dur + 0.8, gain(0.33, p), dets[i] + (rnd() - 0.5) * 4);
        if (o.glideDown) so.frequency.exponentialRampToValueAtTime(mtof(m) * 0.25, t + dur);
      }
    }
  }
  function pad(t, notes, dur, v, cut) {
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut || 1100; lp.Q.value = 0.4;
    const g = gain(0); lp.connect(g); g.connect(BUS.synth); g.connect(gain(0.6, BUS.big));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v || 0.09, t + Math.min(1.2, dur * 0.4)); g.gain.setValueAtTime(v || 0.09, t + dur - 0.3); g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    for (const m of notes) for (const d of [-9, 8]) { const p = ac.createStereoPanner(); p.pan.value = d > 0 ? 0.5 : -0.5; p.connect(lp); osc('sawtooth', mtof(m), t, t + dur + 0.7, gain(0.2, p), d); osc('triangle', mtof(m + 12), t, t + dur + 0.7, gain(0.12, p), -d); }
  }
  function pluck(t, m, v, pan, cutMax) {
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(cutMax || 5000, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.18);
    const g = gain(0); const p = ac.createStereoPanner(); p.pan.value = pan || 0; lp.connect(g); g.connect(p); p.connect(BUS.synth); p.connect(gain(0.35, BUS.delay));
    osc('sawtooth', mtof(m), t, t + 0.5, gain(0.5, lp), 5); osc('square', mtof(m), t, t + 0.5, gain(0.3, lp), -5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22 * (v == null ? 1 : v), t + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
  }
  function lead(t, m, dur, v, fromM) {
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 1.5;
    const g = gain(0); lp.connect(g); g.connect(BUS.synth); g.connect(gain(0.3, BUS.delay)); g.connect(gain(0.25, BUS.verb));
    const f = mtof(m), f0 = fromM ? mtof(fromM) : f;
    const vib = ac.createOscillator(); vib.frequency.value = 5.6; const vg = gain(0); vib.connect(vg); vib.start(t); vib.stop(t + dur + 0.3);
    vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 0.35));
    for (const [type, det, lv] of [['square', -7, 0.32], ['sawtooth', 7, 0.32], ['square', 1200, 0.08]]) {
      const o = osc(type, f0, t, t + dur + 0.3, gain(lv, lp), det); vg.connect(o.frequency);
      if (fromM) o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    }
    env(g, t, 0.006, 0.2 * (v || 1), 0.2, 0.15 * (v || 1), 0.07, t + dur);
  }
  function bell(t, m, v) {
    const g = gain(0); g.connect(BUS.synth); g.connect(gain(0.5, BUS.big)); g.connect(gain(0.3, BUS.delay));
    const f = mtof(m);
    const mod = ac.createOscillator(); mod.frequency.value = f * 3.5; const mg = gain(0); mod.connect(mg); mod.start(t); mod.stop(t + 2.5);
    mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.6);
    const c = osc('sine', f, t, t + 2.5, g); mg.connect(c.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * (v || 1), t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
  }
  function braam(t, roots, dur, v) {
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.5;
    lp.frequency.setValueAtTime(160, t); lp.frequency.exponentialRampToValueAtTime(2800, t + 0.35); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    const sat = shaper(3); const g = gain(0); lp.connect(sat); sat.connect(g); g.connect(BUS.fx); g.connect(gain(0.5, BUS.big));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32 * (v || 1), t + 0.04); g.gain.setTargetAtTime(0.18 * (v || 1), t + 0.1, 0.5); g.gain.setTargetAtTime(0, t + dur, 0.35);
    for (const m of roots) for (const d of [-18, -6, 6, 18]) osc('sawtooth', mtof(m), t, t + dur + 1.5, gain(0.22, lp), d);
    for (const m of roots) osc('square', mtof(m - 12), t, t + dur + 1.5, gain(0.25, lp));
  }
  function riser(t0, t1, v) {
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(350, t0); bp.frequency.exponentialRampToValueAtTime(9000, t1);
    const g = gain(0); bp.connect(g); g.connect(BUS.fx); g.connect(gain(0.6, BUS.verb));
    noise(t0, t1 - t0 + 0.05, bp);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.42 * (v || 1), t1 - 0.01); g.gain.linearRampToValueAtTime(0, t1 + 0.02);
    const sg = gain(0); const o = osc('sawtooth', 110, t0, t1 + 0.05, sg); o.frequency.exponentialRampToValueAtTime(1400, t1);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; sg.disconnect(); sg.connect(lp); lp.connect(BUS.fx);
    sg.gain.setValueAtTime(0.0001, t0); sg.gain.exponentialRampToValueAtTime(0.09 * (v || 1), t1 - 0.01); sg.gain.linearRampToValueAtTime(0, t1 + 0.02);
  }
  function revCymbal(tEnd, dur, v) {
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4500;
    const g = gain(0); hp.connect(g); g.connect(BUS.fx);
    noise(tEnd - dur, dur, hp);
    g.gain.setValueAtTime(0.0001, tEnd - dur); g.gain.exponentialRampToValueAtTime(0.4 * (v || 1), tEnd - 0.005); g.gain.linearRampToValueAtTime(0, tEnd);
  }
  function impact(t, v) {
    v = v || 1;
    const g = gain(0); g.connect(BUS.fx); g.connect(gain(0.7, BUS.big));
    const o = osc('sine', 75, t, t + 3, g); o.frequency.exponentialRampToValueAtTime(26, t + 1.6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.0 * v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.8);
    const ng = gain(0); lp.connect(ng); ng.connect(BUS.fx); ng.connect(gain(0.8, BUS.big));
    noise(t, 1.2, lp); ng.gain.setValueAtTime(0.75 * v, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    const tg = gain(0, BUS.fx); const to = osc('sine', 120, t, t + 0.6, tg); to.frequency.exponentialRampToValueAtTime(45, t + 0.4);
    tg.gain.setValueAtTime(0.8 * v, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    duck(t, 0.95);
  }
  function hitText(t) { // trailer card hit: thud + metallic shing
    impact(t, 0.55);
    const hp = ac.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 5200; hp.Q.value = 6;
    const g = gain(0); hp.connect(g); g.connect(BUS.fx); g.connect(gain(0.6, BUS.verb));
    noise(t, 0.9, hp); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    for (const f of [1870, 2930, 4410]) { const bg = gain(0); bg.connect(BUS.fx); bg.connect(gain(0.4, BUS.verb)); osc('sine', f, t, t + 1.4, bg); bg.gain.setValueAtTime(0.05, t); bg.gain.exponentialRampToValueAtTime(0.0005, t + 1.3); }
  }
  function whoosh(tMid, dur, v, panDir) {
    const t0 = tMid - dur * 0.6;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(3200, tMid); bp.frequency.exponentialRampToValueAtTime(400, t0 + dur);
    const g = gain(0); const p = ac.createStereoPanner(); bp.connect(g); g.connect(p); p.connect(BUS.fx);
    p.pan.setValueAtTime(-0.8 * (panDir || 1), t0); p.pan.linearRampToValueAtTime(0.8 * (panDir || 1), t0 + dur);
    noise(t0, dur + 0.05, bp);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.55 * (v || 1), tMid); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function downlifter(t, dur) {
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(9000, t); lp.frequency.exponentialRampToValueAtTime(200, t + dur);
    const g = gain(0); lp.connect(g); g.connect(BUS.fx); g.connect(gain(0.5, BUS.verb));
    noise(t, dur, lp); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  }
  function tick(t, v) { const g = gain(0, BUS.fx); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000; const o = osc('square', 2600, t, t + 0.03, hp); hp.connect(g); g.gain.setValueAtTime(0.06 * (v || 1), t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.025); void o; }
  function heartbeat(t, v) { for (const [d, a] of [[0, 1], [0.2, 0.7]]) { const g = gain(0, BUS.fx); const o = osc('sine', 62, t + d, t + d + 0.4, g); o.frequency.exponentialRampToValueAtTime(40, t + d + 0.25); g.gain.setValueAtTime(0.9 * a * (v || 1), t + d); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.35); } }
  function pop(t, i) { // title pop-up: a bright bloop that climbs with each pop
    const base = [65, 68, 72, 70, 75, 72, 77, 75, 80, 77, 82, 84][i % 12];
    const g = gain(0); g.connect(BUS.fx); g.connect(gain(0.3, BUS.delay));
    const o = osc('sine', mtof(base - 12), t, t + 0.3, g); o.frequency.exponentialRampToValueAtTime(mtof(base), t + 0.05);
    osc('triangle', mtof(base + 12), t, t + 0.2, gain(0.25, g));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.33, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    const cg = gain(0, BUS.fx); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000; hp.connect(cg); noise(t, 0.02, hp); cg.gain.setValueAtTime(0.3, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
  }
  function tapeStop(t, dur, notes) { // the rewind / tape-stop gap before a drop
    supersaw(t, notes, dur, { v: 0.12, glideDown: true, cut0: 4000, cut1: 4000, cutS: 900, sus: 0.8 });
    const g = gain(0, BUS.fx); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(2500, t); bp.frequency.exponentialRampToValueAtTime(200, t + dur); bp.connect(g);
    noise(t, dur, bp, 0.7); g.gain.setValueAtTime(0.2, t); g.gain.linearRampToValueAtTime(0, t + dur);
  }
  function thunder(t, v) {
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    const cg = gain(0); hp.connect(cg); cg.connect(BUS.fx); cg.connect(gain(0.5, BUS.big)); noise(t, 0.4, hp);
    cg.gain.setValueAtTime(0.7 * (v || 1), t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(120, t + 4);
    const g = gain(0); lp.connect(g); g.connect(BUS.fx); g.connect(gain(0.6, BUS.big)); noise(t + 0.05, 5, lp, 0.5);
    g.gain.setValueAtTime(0, t + 0.05); g.gain.linearRampToValueAtTime(1.0 * (v || 1), t + 0.3);
    for (let k = 0; k < 5; k++) { const tt = t + 0.6 + k * (0.45 + rnd() * 0.4); g.gain.setTargetAtTime(0.5 + rnd() * 0.5, tt, 0.15); }
    g.gain.setTargetAtTime(0, t + 3.2, 0.7);
    impact(t, 0.4);
  }
  function rain(t0, t1, v) {
    const hp = ac.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3500; hp.Q.value = 0.3;
    const g = gain(0); hp.connect(g); g.connect(BUS.fx);
    noise(t0, t1 - t0 + 0.5, hp, 0.9);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.13 * (v || 1), t0 + 0.8); g.gain.setValueAtTime(0.13 * (v || 1), t1 - 0.4); g.gain.linearRampToValueAtTime(0, t1);
  }
  function pigeons(t) {
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 0.8;
    const g = gain(0); bp.connect(g); g.connect(BUS.fx); g.connect(gain(0.3, BUS.verb));
    noise(t, 1.4, bp);
    g.gain.setValueAtTime(0, t);
    let tt = t;
    for (let k = 0; k < 26; k++) { tt += 0.025 + rnd() * 0.04; g.gain.setValueAtTime(0.5 * (1 - k / 30), tt); g.gain.setTargetAtTime(0.02, tt + 0.006, 0.012); }
    g.gain.setTargetAtTime(0, tt + 0.05, 0.05);
  }
  function cycleBell(t) {
    for (const d of [0, 0.16]) for (const [f, a] of [[2150, 0.12], [3360, 0.07], [5400, 0.03]]) { const g = gain(0); g.connect(BUS.fx); g.connect(gain(0.4, BUS.verb)); osc('sine', f, t + d, t + d + 0.9, g); g.gain.setValueAtTime(a, t + d); g.gain.exponentialRampToValueAtTime(0.0005, t + d + 0.8); }
  }
  function autoHorn(t) {
    for (const d of [0, 0.22]) { const g = gain(0); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500; lp.connect(g); g.connect(BUS.fx); osc('square', 410, t + d, t + d + 0.16, lp); osc('square', 520, t + d, t + d + 0.16, lp); g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.06, t + d + 0.01); g.gain.setValueAtTime(0.06, t + d + 0.13); g.gain.linearRampToValueAtTime(0, t + d + 0.16); }
  }
  function stutter(t, notes, n) { for (let k = 0; k < n; k++) { const tt = t + k * S16 / 2; supersaw(tt, notes, S16 / 2 * 0.8, { v: 0.1 + 0.08 * (k / n), cut0: 2500, cut1: 6000, cutS: 5000, a: 0.002, rel: 0.01 }); } }

  /* ------------------------------------------------------------ harmony + patterns */
  // chord per bar (4-bar loop): Fm Db Ab Eb (voicings around C4) and 808 roots
  const CHORDS = [[53, 56, 60, 65], [49, 53, 56, 61], [56, 60, 63, 68], [51, 55, 58, 63]];
  const ROOTS = [29, 25, 32, 27];
  const chordOf = (n) => CHORDS[(n - 1) % 4];
  const rootOf = (n) => ROOTS[(n - 1) % 4];
  // hook: 2-bar phrase per chord pair, 16th steps [step, midi, len16]
  const HOOK = [
    [[0, 72, 3], [3, 75, 3], [6, 77, 2], [8, 80, 4], [12, 77, 2], [14, 75, 2]],
    [[0, 77, 3], [3, 73, 3], [6, 72, 2], [8, 68, 6], [14, 72, 2]],
    [[0, 75, 3], [3, 72, 3], [6, 75, 2], [8, 79, 4], [12, 80, 2], [14, 79, 2]],
    [[0, 75, 6], [6, 70, 2], [8, 72, 8]],
  ];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 3, 1, 3, 2, 1, 2];

  function arpBar(n, v, cut, octave) {
    const c = chordOf(n), t0 = bar(n);
    for (let s = 0; s < 16; s++) pluck(t0 + s * S16, c[ARP[s]] + 12 * (octave || 0), v * (s % 4 === 0 ? 1 : 0.7), ((s % 4) - 1.5) * 0.25, cut);
  }
  function trapBar(n, o) { // halftime trap drums (snare on beat 3)
    const t0 = bar(n), st = (s) => t0 + s * S16;
    o = o || {};
    for (const s of o.kicks || [0, 7, 10]) kick(st(s), 1, true);
    snare(st(8), 1);
    if (o.ghost) snare(st(15), 0.25, 0.1);
    for (let s = 0; s < 16; s += 2) hat(st(s), s % 4 === 0 ? 0.9 : 0.6, false, 0.25);
    if (o.roll) { for (let k = 0; k < 6; k++) hat(st(12) + k * (S16 * 4 / 6), 0.45 + k * 0.08, false, -0.25); }
    if (o.open) hat(st(6), 0.5, true, -0.2);
    // 808: on the kicks, glide on the 3rd
    const r = rootOf(n);
    const ks = o.kicks || [0, 7, 10];
    for (let i = 0; i < ks.length; i++) { const s = ks[i], e = i + 1 < ks.length ? ks[i + 1] : 16; bass808(st(s), i === 2 ? r + 12 : r, (e - s) * S16 * 0.95, i === 2 ? r : null); }
  }
  function edmBar(n, o) { // driving four-on-the-floor + clap 2/4 + offbeat open hats
    const t0 = bar(n), st = (s) => t0 + s * S16;
    o = o || {};
    for (const s of [0, 4, 8, 12]) kick(st(s), 1);
    for (const s of [4, 12]) snare(st(s), 0.95);
    for (const s of [2, 6, 10, 14]) hat(st(s), 0.65, true, 0.15);
    for (let s = 1; s < 16; s += 2) hat(st(s), 0.3, false, -0.2);
    const r = rootOf(n) + 12;
    for (const s of [2, 6, 10, 14]) bass808(st(s), r, S16 * 1.7);
    if (o.fill) { for (let k = 0; k < 8; k++) snare(st(12) + k * S16 / 2, 0.35 + k * 0.08, 0.15); }
  }

  /* ------------------------------------------------------------ the arrangement */
  function arrange(TL) {
    const tb = (b) => b * B;
    // INTRO bars 1-2: heartbeat + clock ticks over a dark filtered pad
    BUS.synthLP.frequency.setValueAtTime(700, 0);
    pad(bar(1), [41, 48, 53, 56], BAR * 6 - 0.2, 0.07, 800);
    for (let k = 0; k < 2; k++) heartbeat(bar(1 + k) + 0.02, 0.9);
    for (let s = 0; s < 8; s++) tick(bar(1) + s * B, s % 4 === 0 ? 1.3 : 0.8);
    hitText(bar(1)); hitText(bar(2));
    // bars 3-5: the reveal — arp fades in, low kick per bar, filter opens
    BUS.synthLP.frequency.setValueAtTime(700, bar(3));
    BUS.synthLP.frequency.exponentialRampToValueAtTime(7000, bar(6));
    for (let n = 3; n <= 5; n++) { arpBar(n, 0.6 + (n - 3) * 0.2, 2200 + (n - 3) * 1200); kick(bar(n), 0.8, true); bass808(bar(n), rootOf(n), BAR * 0.9); heartbeat(bar(n) + B * 2, 0.4); }
    bell(bar(3), 72, 0.9); bell(bar(4) + B * 2, 75, 0.7); bell(bar(5), 77, 0.8);
    // bar 6: the whip — snare roll accelerating, riser, reverse cymbal, one beat of silence
    arpBar(6, 1, 6000);
    riser(bar(5), bar(6) + B * 3, 1);
    const rollT = bar(6);
    for (let k = 0; k < 12; k++) snare(rollT + (k * B * 3) / 12, 0.3 + k * 0.05, 0.15);
    revCymbal(bar(7), B * 1.5, 1);
    BUS.synthLP.frequency.setValueAtTime(7000, bar(6) + B * 3); BUS.synthLP.frequency.linearRampToValueAtTime(20000, bar(7));
    // DROP 1 bars 7-22
    for (let n = 7; n <= 22; n++) {
      const t0 = bar(n), c = chordOf(n);
      trapBar(n, { roll: n % 2 === 0, open: n % 4 === 3, ghost: n % 2 === 1, kicks: n % 4 === 0 ? [0, 3, 7, 10] : [0, 7, 10] });
      supersaw(t0, c, BAR - 0.02, { v: 0.13, cut0: 1200, cut1: 5000, cutS: 2600 });
      supersaw(t0, [c[0] - 12], BAR - 0.02, { v: 0.06, cut0: 600, cut1: 1800, cutS: 900 });
      arpBar(n, 0.55, 4200, 1);
      if (n >= 15) { const ph = HOOK[(n - 15) % 4]; for (const [s, m, l] of ph) lead(t0 + s * S16, m, l * S16 * 0.95, 0.85); }
    }
    impact(bar(7), 1.1); braam(bar(7), [41, 48], BAR * 1.5, 1);
    braam(bar(15), [41, 48], BAR, 0.8); impact(bar(15), 0.8);
    downlifter(bar(7) + 0.1, BAR * 1.5);
    // BREAKDOWN bars 23-26: drums out; rain, bells, filtered chords; build back
    BUS.synthLP.frequency.setValueAtTime(20000, bar(23)); BUS.synthLP.frequency.exponentialRampToValueAtTime(900, bar(23) + 0.8);
    rain(bar(23) - 0.4, bar(26) + B * 3.6, 0.55);
    pad(bar(23), [41, 53, 56, 60], BAR * 4 - B, 0.075, 1400);
    const bmel = [[23, 0, 80], [23, 6, 77], [23, 10, 75], [24, 0, 73], [24, 8, 72], [25, 0, 80], [25, 6, 82], [25, 10, 84], [26, 0, 80]];
    for (const [n, s, m] of bmel) bell(bar(n) + s * S16, m, 0.85);
    for (let n = 25; n <= 26; n++) { arpBar(n, 0.5 + (n - 25) * 0.3, 3000); }
    BUS.synthLP.frequency.setValueAtTime(900, bar(25)); BUS.synthLP.frequency.exponentialRampToValueAtTime(12000, bar(26) + B * 3);
    for (let n = 25; n <= 26; n++) for (let s = 0; s < 4; s++) kick(bar(n) + s * B, 0.5 + (n - 25) * 0.3);
    for (let k = 0; k < 16; k++) snare(bar(26) + (k * B * 3) / 16, 0.25 + k * 0.045, 0.12);
    riser(bar(25), bar(26) + B * 3, 1.1);
    tapeStop(bar(26) + B * 3, B * 0.95, chordOf(26));
    // DROP 2 bars 27-34: four-on-the-floor, hook up an octave, stutters at the phrase ends
    BUS.synthLP.frequency.setValueAtTime(20000, bar(27));
    for (let n = 27; n <= 34; n++) {
      const t0 = bar(n), c = chordOf(n);
      edmBar(n, { fill: n === 34 });
      for (const s of [0, 3, 6, 8, 11, 14]) supersaw(t0 + s * S16, c, S16 * 1.6, { v: 0.12, cut0: 2500, cut1: 7000, cutS: 4500, a: 0.003, sus: 0.6 });
      const ph = HOOK[(n - 27) % 4]; for (const [s, m, l] of ph) { lead(t0 + s * S16, m + 12, l * S16 * 0.95, 0.75); lead(t0 + s * S16, m, l * S16 * 0.95, 0.5); }
      arpBar(n, 0.4, 5000, 1);
      if (n % 2 === 0 && n !== 34) stutter(t0 + 12 * S16, c, 8);
    }
    impact(bar(27), 1.2); braam(bar(27), [41, 48], BAR, 1); revCymbal(bar(27), B * 1.2, 0.9);
    impact(bar(31), 0.7);
    revCymbal(bar(35), B, 0.8);
    // FINALE bars 35-38 (the time-lapse drone orbit, golden hour -> festival night): the emotional lift.
    // Big wide supersaw chords + pad, half-time kick, the hook up high (lead + bell double), building with a
    // riser, snare roll and reverse cymbal into the title section.
    BUS.synthLP.frequency.setValueAtTime(20000, bar(35) - 0.01); BUS.synthLP.frequency.setValueAtTime(3200, bar(35));
    BUS.synthLP.frequency.exponentialRampToValueAtTime(14000, bar(37)); BUS.synthLP.frequency.linearRampToValueAtTime(20000, bar(39));
    impact(bar(35), 0.9); downlifter(bar(35) + 0.05, BAR);
    pad(bar(35), [41, 53, 56, 60, 65], BAR * 4 - 0.4, 0.075, 2400);
    for (let n = 35; n <= 38; n++) {
      const t0 = bar(n), c = chordOf(n), st = (s) => t0 + s * S16;
      // wide sustained chords: the voicing plus its octave on top, a slow swell, lots of air
      supersaw(t0, c.concat([c[1] + 12, c[2] + 12]), BAR - 0.03, { v: 0.085, a: 0.06, cut0: 1500, cut1: 6500, open: 0.3, cutS: 4200, sus: 0.9, verb: 0.35, rel: 0.25 });
      supersaw(t0, [c[0] - 12], BAR - 0.03, { v: 0.06, cut0: 600, cut1: 1600, cutS: 900, sus: 0.9 });
      // half-time groove: kick on 1 (and the and-of-3), a big roomy snare on 3, soft 8th hats
      kick(st(0), 1, true); kick(st(10), 0.8, true);
      snare(st(8), 0.9, 0.7);
      for (let s = 2; s < 16; s += 4) hat(st(s), 0.4, n >= 37, 0.2);
      bass808(st(0), rootOf(n), BAR * 0.6); bass808(st(10), rootOf(n), S16 * 5.5);
      // the hook, soaring: lead an octave up + a bell two octaves up on the phrase notes
      const ph = HOOK[(n - 35) % 4];
      for (const [s, m, l] of ph) { lead(st(s), m + 12, l * S16 * 0.97, 0.7); bell(st(s), m + 24, 0.26); }
      arpBar(n, 0.3 + (n - 35) * 0.1, 3500 + (n - 35) * 800, 1);
    }
    // build into the title: 16th hats + a snare roll in bar 38, riser across 37-38, reverse cymbal
    for (let s = 0; s < 16; s++) hat(bar(38) + s * S16, 0.3 + s * 0.025, false, -0.2);
    for (let k = 0; k < 16; k++) snare(bar(38) + B * 2 + (k * B * 2) / 16, 0.22 + k * 0.04, 0.15);
    riser(bar(37), bar(39) - 0.02, 1);
    revCymbal(bar(39), B * 1.5, 0.9);
    // TITLE bars 39-42: bouncy pops on every beat over a lighter groove, riser into the slam
    for (let n = 39; n <= 41; n++) {
      const t0 = bar(n), c = chordOf(n);
      for (const s of [0, 4, 8, 12]) kick(t0 + s * S16, 0.85);
      for (const s of [4, 12]) snare(t0 + s * S16, 0.6, 0.3);
      for (let s = 2; s < 16; s += 4) hat(t0 + s * S16, 0.5, true, 0.1);
      for (const s of [2, 6, 10, 14]) bass808(t0 + s * S16, rootOf(n) + 12, S16 * 1.5);
      supersaw(t0, c, BAR - 0.05, { v: 0.08, cut0: 900, cut1: 2500, cutS: 1600 });
    }
    const title = TL.segments.find((s) => s.kind === 'title');
    (title ? title.pops : []).forEach((b, i) => pop(tb(b), i));
    riser(bar(41), bar(42) - 0.02, 0.9);
    revCymbal(bar(42), B * 2, 1);
    // bar 42: THE SLAM
    const slam = tb(title ? title.slam : 164);
    impact(slam, 1.4); braam(slam, [41, 48, 53], BAR * 2.2, 1.2); kick(slam, 1.2, true); snare(slam, 1, 0.8);
    supersaw(slam, [53, 56, 60, 65, 68], BAR * 3, { v: 0.15, cut0: 4000, cut1: 8000, cutS: 3000, verb: 0.6, sus: 0.6, rel: 1.4 });
    bass808(slam, 29, BAR * 2.5);
    // END bars 43-44: the motif echoes out, final low hit
    for (const [k, m] of [[0, 72], [2, 75], [4, 77], [6, 80]]) bell(bar(43) + k * B * 0.5, m, 0.6);
    pad(bar(43), [41, 53, 56, 60], BAR * 2 + 1.5, 0.08, 1800);
    impact(bar(44) + B * 2, 0.7);

    // timeline sound design: whooshes into every 3D shot cut, hits on cards, scene sfx
    let prevKind = null;
    for (const sg of TL.segments) {
      const t = tb(sg.b);
      if ((sg.kind === '3d' && sg.shot === 'orbit') || sg.id === 'reveal') whoosh(t, 0.7, 0.8, sg.dir || 1);
      if (sg.kind === 'game' && prevKind === 'game' && sg.n >= 2) whoosh(t, 0.35, 0.35, 1);
      prevKind = sg.kind;
    }
    for (const e of TL.sfx || []) {
      const t = tb(e.b);
      if (e.name === 'hit') hitText(t);
      else if (e.name === 'pigeons') pigeons(t);
      else if (e.name === 'thunder_near') thunder(t, 1);
      else if (e.name === 'bell') cycleBell(t);
      else if (e.name === 'auto_horn') autoHorn(t);
      else if (e.name === 'dhol') { // a festival drum flourish on the cut
        for (const [d, v] of [[0, 0.6], [S16, 0.35], [S16 * 2, 0.5], [S16 * 3, 0.35], [S16 * 3.5, 0.45], [S16 * 4, 0.7]]) { const tk = t + d, g = gain(0, BUS.fx), o2 = osc('sine', 110, tk, tk + 0.3, g); o2.frequency.exponentialRampToValueAtTime(62, tk + 0.12); g.gain.setValueAtTime(v, tk); g.gain.exponentialRampToValueAtTime(0.001, tk + 0.26); snare(tk, v * 0.25, 0.1); }
      }
    }
  }

  /* ------------------------------------------------------------ render + WAV */
  function wav16(buf) {
    const n = buf.length, ch = buf.numberOfChannels, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, SR, true);
    out.setUint32(28, SR * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const d = [buf.getChannelData(0), buf.getChannelData(1)];
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, d[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
    let s = ''; const u8 = new Uint8Array(out.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  window.renderTrailerAudio = async function (TL, opts) {
    opts = opts || {};
    const dur = (TL.totalBeats + (TL.tailBeats || 4)) * B;
    ac = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
    rnd = mulberry(20031);
    NOISE = noiseBuf(10);
    BUS = {};
    makeBuses(!!opts.raw);
    if (opts.solo) for (const k of ['drums', 'bass', 'synth', 'fx']) if (k !== opts.solo) BUS[k].gain.value = 0;
    if (opts.solo) { BUS.verb.gain.value = 0; BUS.big.gain.value = 0; BUS.delay.gain.value = 0; }
    if (opts.raw) { /* bypass the master chain to read true levels */ }
    arrange(TL);
    const buf = await ac.startRendering();
    // stats per section (RMS / peak) for the mix check
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const sec = (a, b) => { let s = 0, p = 0; const i0 = Math.floor(a * SR), i1 = Math.min(L.length, Math.floor(b * SR)); for (let i = i0; i < i1; i++) { const v = (Math.abs(L[i]) + Math.abs(R[i])) / 2; s += v * v; if (v > p) p = v; } return { rms: +Math.sqrt(s / Math.max(1, i1 - i0)).toFixed(4), peak: +p.toFixed(3) }; };
    const stats = { dur, intro: sec(0, bar(7)), drop1: sec(bar(7), bar(23)), breakdown: sec(bar(23), bar(27)), drop2: sec(bar(27), bar(35)), finale: sec(bar(35), bar(39)), title: sec(bar(39), bar(43)), end: sec(bar(43), dur) };
    return { wav: wav16(buf), stats };
  };
})();
