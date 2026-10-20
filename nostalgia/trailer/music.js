/* NOSTALGIA trailer v2 — original score + sound design, synthesised offline (WebAudio OfflineAudioContext).
 * Modern hip-hop / trap groove, 100 BPM, F minor. Everything is generated here: no samples. (v1: music_v1.js)
 *   window.renderTrailerAudio(timeline, opts) -> Promise<{wav: base64, stats}>
 *   opts.raw: no master processing (fixed gain, for stem measurement); opts.solo: 'drums'|'bass'|'synth'|'fx'|'sfx';
 *   opts.statsOnly: skip the WAV.
 * Sections (bars of 4 beats = 2.4 s, bar n starts at beat 4(n-1)), following timeline.json v2.1 (160 + 3 beats = 97.8 s):
 *   1-3 cold open on the prologue (tape world: deck clunk, warped hook, REWIND 2026->2003) | 4-5 drone reveal (b12)
 *   | 6-10 EXPLORE (b20, groove enters, hook) | 11-12 STORY (b40: filtered lo-fi walkman hook, REC at b44, build)
 *   | 13-24 PLAY (b48, full beat, an activity SFX on every cut) | 25-29 CELEBRATE (b96, euphoric, toms)
 *   | 30-32 SURVIVE (b116, half-time, rain, siren, thunder b124) | 33-35 finale (b128, half-time, hook in full)
 *   | 36-38 title (pops b140-147, SLAM b148) | 39-40 end card (b152) + 3-beat tail.
 * The v2 arrangement blocks are reused through a bar offset (BOFF) so each block lands on its v2.1 bars.
 * Harmony: explore/play loop Fm Db Bbm C; celebrate Db Ab Eb Fm; finale/title Db Eb -> Fm.
 * Hook: a 3-3-2 (tresillo) bell-pluck motif, the same rhythm in every phrase.
 * Master: gentle glue comp in the graph, then (in JS) a look-ahead peak limiter + BS.1770 loudness match to
 * -14 LUFS / -1.5 dBFS sample peak, so assemble.cjs's loudnorm is ~a no-op.
 */
(() => {
  'use strict';
  const SR = 48000;
  const BPM = 100, B = 60 / BPM, BAR = 4 * B, S16 = B / 4;
  let BOFF = 0;                                // bar offset while arranging a block (v2 blocks re-placed for v2.1)
  const bar = (n) => (n - 1 + BOFF) * BAR;     // start time of bar n (1-based)
  const tb = (b) => (b + 4 * BOFF) * B;        // time of beat b (0-based)
  const tbA = (b) => b * B;                    // absolute beat time (timeline cues), ignores BOFF
  const st = (n, s) => bar(n) + s * S16;       // bar n, 16th step s
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let ac, rnd;
  const LUFS_TARGET = -14, CEIL_DB = -1.5; // dBTP (4x-oversampled detector)

  function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ------------------------------------------------------------ shared buffers + buses */
  let NOISE, BUS = {}, DUCKS = [], BDUCKS = [];
  function noiseBuf(sec) {
    const b = ac.createBuffer(2, Math.floor(SR * sec), SR);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
    return b;
  }
  function irBuf(sec, decay, pre) {
    const b = ac.createBuffer(2, Math.floor(SR * sec), SR);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] = (rnd() * 2 - 1) * Math.pow(1 - t / sec, decay) * (t < (pre || 0.01) ? t / (pre || 0.01) : 1); }
    }
    return b;
  }
  function shaper(k) {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    const ws = ac.createWaveShaper(); ws.curve = c; ws.oversample = '2x'; return ws;
  }
  function gain(v, dest) { const g = ac.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  function panner(v, dest) { const p = ac.createStereoPanner(); p.pan.value = v || 0; if (dest) p.connect(dest); return p; }
  function filt(type, f, q, dest) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (dest) b.connect(dest); return b; }

  const MIX = { master: 0.55, drums: 0.26, bass: 0.125, synth: 1.12, fx: 0.34, sfx: 0.5, lofi: 0.35, verb: 0.5, big: 0.42, delay: 0.42 };
  function makeBuses(raw) {
    const master = gain(raw ? 1 : MIX.master);
    // gentle glue only (the peak limiter runs in JS after the render)
    const glue = ac.createDynamicsCompressor();
    glue.threshold.value = -16; glue.ratio.value = 1.8; glue.attack.value = 0.025; glue.release.value = 0.2; glue.knee.value = 10;
    if (raw) master.connect(ac.destination);
    else { master.connect(glue); glue.connect(ac.destination); }
    BUS.master = master;
    // sends
    const verb = ac.createConvolver(); verb.buffer = irBuf(2.6, 2.8);
    const verbLP = filt('lowpass', 6000); const verbHP = filt('highpass', 220);
    BUS.verb = gain(1); BUS.verb.connect(verb); verb.connect(verbHP); verbHP.connect(verbLP); verbLP.connect(gain(MIX.verb, master));
    const big = ac.createConvolver(); big.buffer = irBuf(5, 2.0, 0.03);
    const bigHP = filt('highpass', 160);
    BUS.big = gain(1); BUS.big.connect(big); big.connect(bigHP); bigHP.connect(gain(MIX.big, master));
    const dl = ac.createDelay(2); dl.delayTime.value = B * 0.75; // dotted 8th
    const fb = gain(0.36); const dlF = filt('bandpass', 2000, 0.5);
    BUS.delay = gain(1); BUS.delay.connect(dl); dl.connect(dlF); dlF.connect(fb); fb.connect(dl); dlF.connect(gain(MIX.delay, master));
    // groups
    BUS.drums = gain(MIX.drums); const dsat = shaper(1.6); BUS.drums.connect(dsat);
    BUS.drumLP = filt('lowpass', 20000, 0.7); dsat.connect(BUS.drumLP); BUS.drumLP.connect(master); // closes for the story beat
    // tape / walkman voice: band-limited, a little saturated
    BUS.lofi = gain(MIX.lofi); const lhp = filt('highpass', 260, 0.7), llp = filt('lowpass', 3400, 0.7), lsat = shaper(1.8);
    BUS.lofi.connect(lhp); lhp.connect(llp); llp.connect(lsat); lsat.connect(master);
    BUS.bassDuck = gain(1, master); BUS.bass = gain(MIX.bass, BUS.bassDuck); // 808 tucks under each kick
    BUS.duck = gain(1, master);            // sidechained synths
    BUS.synthLP = filt('lowpass', 20000, 0.8); BUS.synthLP.connect(BUS.duck);
    BUS.synth = gain(MIX.synth, BUS.synthLP);
    BUS.fx = gain(MIX.fx, master);
    BUS.sfx = gain(MIX.sfx, master);
  }
  // sidechain pump: collected, merged and scheduled in time order at the end
  function duck(t, depth) { DUCKS.push([t, depth]); }
  function flushDucks() {
    for (const [list, param, hold, relFast, relSlow] of [[DUCKS, BUS.duck.gain, 0.03, 0.07, 0.12], [BDUCKS, BUS.bassDuck.gain, 0.025, 0.035, 0.035]]) {
      list.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const d of list) { const l = merged[merged.length - 1]; if (l && d[0] - l[0] < 0.03) l[1] = Math.max(l[1], d[1]); else merged.push([d[0], d[1]]); }
      for (const [t, depth] of merged) {
        param.setValueAtTime(1, Math.max(0, t - 0.004));
        param.linearRampToValueAtTime(1 - depth, t + 0.006);
        param.setTargetAtTime(1, t + hold, depth > 0.8 ? relSlow : relFast);
      }
    }
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
    s.connect(dest); s.start(Math.max(0, t), rnd() * 8, dur); return s;
  }

  // ---- drums
  function kick(t, v, long, duckDepth) {
    v = v == null ? 1 : v;
    const g = gain(0, BUS.drums);
    const o = osc('sine', 170, t, t + 0.8, g);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(43, t + 0.45);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.1 * v, t + 0.002);
    g.gain.setTargetAtTime(0.75 * v, t + 0.01, 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + (long ? 0.6 : 0.38));
    const cg = gain(0, BUS.drums); const hp = filt('highpass', 2800, null, cg);
    noise(t, 0.02, hp); cg.gain.setValueAtTime(0.45 * v, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
  }
  function clap(t, v, pan, verbAmt, tone) {
    v = v == null ? 1 : v;
    const cbp = filt('bandpass', tone || 1300, 1.1);
    const cg = gain(0); cbp.connect(cg); const p = panner(pan || 0, BUS.drums); cg.connect(p); p.connect(gain(verbAmt == null ? 0.35 : verbAmt, BUS.verb));
    noise(t - 0.014, 0.35, cbp);
    for (const d of [0, 0.010, 0.021]) { cg.gain.setValueAtTime(0.75 * v, t - 0.014 + d); cg.gain.exponentialRampToValueAtTime(0.06, t - 0.014 + d + 0.008); }
    cg.gain.setValueAtTime(0.65 * v, t + 0.01); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  }
  function snare(t, v, verbAmt, noClap) {
    v = v == null ? 1 : v;
    const bp = filt('bandpass', 2100, 0.7);
    const g = gain(0, BUS.drums); bp.connect(g); g.connect(gain(verbAmt == null ? 0.3 : verbAmt, BUS.verb));
    noise(t, 0.3, bp);
    g.gain.setValueAtTime(0.85 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    const tg = gain(0, BUS.drums); const o = osc('triangle', 210, t, t + 0.2, tg); o.frequency.exponentialRampToValueAtTime(170, t + 0.09);
    tg.gain.setValueAtTime(0.6 * v, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    if (!noClap) clap(t, v * 0.85, 0, (verbAmt == null ? 0.3 : verbAmt) + 0.05);
  }
  function rim(t, v, pan) {
    const g = gain(0); const p = panner(pan || 0, BUS.drums); g.connect(p);
    const bp = filt('bandpass', 1800, 4, g); osc('triangle', 1750, t, t + 0.05, bp); noise(t, 0.02, bp);
    g.gain.setValueAtTime(0.35 * (v || 1), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
  }
  function hat(t, v, open, pan, tone) {
    const hp = filt('highpass', tone || (open ? 6500 : 8200));
    const g = gain(0); const p = panner(pan || 0, BUS.drums); hp.connect(g); g.connect(p);
    noise(t, open ? 0.45 : 0.07, hp, 1.3);
    g.gain.setValueAtTime(0.3 * (v == null ? 1 : v), t); g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.32 : 0.04));
  }
  // trap hat roll: n hits evenly over [t0, t0+dur), velocity v0 -> v1, pitch rising
  function roll(t0, dur, n, v0, v1, pan) { for (let k = 0; k < n; k++) hat(t0 + (k * dur) / n, v0 + (v1 - v0) * (k / Math.max(1, n - 1)), false, pan == null ? -0.2 : pan, 7600 + k * 160); }
  function shaker(t, v, pan) {
    const bp = filt('bandpass', 6500, 1.2); const g = gain(0); const p = panner(pan || 0, BUS.drums); bp.connect(g); g.connect(p);
    noise(t, 0.08, bp); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * (v || 1), t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  }
  function crash(t, v, pan) {
    const hp = filt('highpass', 4200); const g = gain(0); const p = panner(pan || 0, BUS.fx); hp.connect(g); g.connect(p); g.connect(gain(0.25, BUS.verb));
    noise(t, 2.2, hp, 0.9);
    g.gain.setValueAtTime(0.5 * (v || 1), t); g.gain.setTargetAtTime(0.12 * (v || 1), t + 0.02, 0.15); g.gain.exponentialRampToValueAtTime(0.0008, t + 2.0);
    const bg = gain(0, BUS.fx); const bp = filt('bandpass', 9000, 3, bg); noise(t, 1.5, bp); bg.gain.setValueAtTime(0.25 * (v || 1), t); bg.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
  }
  // modern pitched tom (saturated through the drum bus, roomy): a hint of tasha/dhol, no pastiche
  function tom(t, m, v, pan) {
    const g = gain(0); const p = panner(pan || 0, BUS.drums); g.connect(p); g.connect(gain(0.3, BUS.verb));
    const f = mtof(m), o = osc('sine', f * 1.7, t, t + 0.6, g); o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    osc('triangle', f * 2.02, t, t + 0.2, gain(0.25, g));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.6 * (v || 1), t + 0.002); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    const ng = gain(0); const bp = filt('bandpass', 1400, 1.5, ng); ng.connect(p); noise(t, 0.05, bp); ng.gain.setValueAtTime(0.4 * (v || 1), t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  }

  // ---- bass: 808 with glides (portamento from glideFrom)
  function bass808(t, m, dur, glideFrom, glideT, v) {
    v = v == null ? 1 : v;
    const g = gain(0); const sat = shaper(2.4); g.connect(sat); const lp = filt('lowpass', 950); sat.connect(lp); lp.connect(BUS.bass);
    const f = mtof(m), end = t + dur, gt = glideT || 0.09;
    const o = osc('sine', glideFrom ? mtof(glideFrom) : f, t, end + 0.3, g);
    const o2 = osc('triangle', (glideFrom ? mtof(glideFrom) : f) * 2, t, end + 0.3, gain(0.1, g));
    if (glideFrom) { o.frequency.setValueAtTime(mtof(glideFrom), t + 0.02); o.frequency.exponentialRampToValueAtTime(f, t + gt); o2.frequency.setValueAtTime(mtof(glideFrom) * 2, t + 0.02); o2.frequency.exponentialRampToValueAtTime(f * 2, t + gt); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9 * v, t + 0.006); g.gain.setTargetAtTime(0.34 * v, t + 0.06, 0.75);
    g.gain.setTargetAtTime(0, end, 0.04);
  }
  function drone(t, dur, m, v) { // dark sub drone (intro)
    const g = gain(0); g.connect(BUS.bass);
    osc('sine', mtof(m), t, t + dur + 0.5, g);
    const lp = filt('lowpass', 260, 0.7, g); osc('sawtooth', mtof(m + 12), t, t + dur + 0.5, gain(0.25, lp), -6); osc('sawtooth', mtof(m + 19), t, t + dur + 0.5, gain(0.12, lp), 7);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * (v || 1), t + 1.2); g.gain.setValueAtTime(0.5 * (v || 1), t + dur - 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
  }

  // ---- synths
  function supersaw(t, notes, dur, o) {
    o = o || {};
    const lp = filt('lowpass', 1000, 0.6);
    const c0 = o.cut0 || 900, c1 = o.cut1 || 5000;
    lp.frequency.setValueAtTime(c0, t); lp.frequency.exponentialRampToValueAtTime(c1, t + (o.open || 0.05)); lp.frequency.setTargetAtTime(o.cutS || 2600, t + Math.max(0.1, o.open || 0.05), 0.4);
    const g = gain(0); lp.connect(g); g.connect(o.dest || BUS.synth); if (o.verb) g.connect(gain(o.verb, BUS.big));
    env(g, t, o.a || 0.01, o.v || 0.12, 0.25, (o.v || 0.12) * (o.sus == null ? 0.75 : o.sus), o.rel || 0.12, t + dur);
    const dets = [-22, -11, -4, 0, 5, 12, 23];
    for (const m of notes) for (let i = 0; i < dets.length; i++) {
      const p = panner((i / (dets.length - 1)) * 1.6 - 0.8, lp);
      osc('sawtooth', mtof(m), t, t + dur + Math.max(0.8, (o.rel || 0.12) * 6), gain(0.3, p), dets[i] + (rnd() - 0.5) * 4);
    }
  }
  function pad(t, notes, dur, v, cut, att) {
    const lp = filt('lowpass', cut || 1100, 0.4);
    const g = gain(0); lp.connect(g); g.connect(BUS.synth); g.connect(gain(0.55, BUS.big));
    const a = att || Math.min(1.2, dur * 0.4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v || 0.08, t + a); g.gain.setValueAtTime(v || 0.08, t + dur - 0.3); g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    for (const m of notes) for (const d of [-9, 8]) { const p = panner(d > 0 ? 0.55 : -0.55, lp); osc('sawtooth', mtof(m), t, t + dur + 0.7, gain(0.2, p), d); osc('triangle', mtof(m + 12), t, t + dur + 0.7, gain(0.12, p), -d); }
  }
  function pluck(t, m, v, pan, cutMax) {
    const lp = filt('lowpass', 4000, 3);
    lp.frequency.setValueAtTime(cutMax || 4500, t); lp.frequency.exponentialRampToValueAtTime(450, t + 0.2);
    const g = gain(0); const p = panner(pan || 0); lp.connect(g); g.connect(p); p.connect(BUS.synth); p.connect(gain(0.3, BUS.delay));
    osc('sawtooth', mtof(m), t, t + 0.5, gain(0.5, lp), 5); osc('square', mtof(m), t, t + 0.5, gain(0.3, lp), -5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2 * (v == null ? 1 : v), t + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  }
  // the hook voice: FM bell-pluck (ratio 2: mallet-like) + a filtered saw body + a glassy octave
  function hookNote(t, m, v, pan, o) {
    v = v == null ? 1 : v; o = o || {};
    const f = mtof(m), dec = o.dec || 1.3;
    const out = gain(1); const p = panner(pan || 0); out.connect(p); p.connect(BUS.synth); p.connect(gain(o.delay == null ? 0.28 : o.delay, BUS.delay)); p.connect(gain(o.verb == null ? 0.18 : o.verb, BUS.verb));
    const g1 = gain(0, out); const car = osc('sine', f, t, t + dec + 0.3, g1);
    const mod = ac.createOscillator(); mod.frequency.value = f * 2; const mg = gain(0); mod.connect(mg); mg.connect(car.frequency); mod.start(t); mod.stop(t + dec + 0.3);
    mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.5);
    g1.gain.setValueAtTime(0, t); g1.gain.linearRampToValueAtTime(0.16 * v, t + 0.003); g1.gain.exponentialRampToValueAtTime(0.001, t + dec);
    const lp = filt('lowpass', 3000, 2); lp.frequency.setValueAtTime(3800, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.22);
    const g2 = gain(0, out); lp.connect(g2); osc('sawtooth', f, t, t + 0.5, gain(0.5, lp), 6); osc('sawtooth', f, t, t + 0.5, gain(0.5, lp), -6);
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.09 * v, t + 0.003); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    const g3 = gain(0, out); osc('sine', f * 4, t, t + 0.5, g3); g3.gain.setValueAtTime(0.025 * v, t); g3.gain.exponentialRampToValueAtTime(0.0005, t + 0.3);
  }
  // supersaw lead (the hook in full glory)
  function leadSaw(t, m, dur, v, fromM) {
    const lp = filt('lowpass', 3600, 1.2);
    const g = gain(0); lp.connect(g); g.connect(BUS.synth); g.connect(gain(0.22, BUS.delay)); g.connect(gain(0.3, BUS.verb));
    const f = mtof(m), f0 = fromM ? mtof(fromM) : f;
    const vib = ac.createOscillator(); vib.frequency.value = 5.4; const vg = gain(0); vib.connect(vg); vib.start(t); vib.stop(t + dur + 0.4);
    vg.gain.setValueAtTime(0, t); vg.gain.setValueAtTime(0, t + Math.min(dur * 0.5, 0.25)); vg.gain.linearRampToValueAtTime(f * 0.01, t + Math.min(dur, 0.6));
    for (const [type, det, lv, pan] of [['sawtooth', -14, 0.22, -0.4], ['sawtooth', -6, 0.22, -0.15], ['sawtooth', 0, 0.22, 0], ['sawtooth', 7, 0.22, 0.15], ['sawtooth', 15, 0.22, 0.4], ['square', 1200, 0.05, 0]]) {
      const o = osc(type, f0, t, t + dur + 0.4, gain(lv, panner(pan, lp)), det); vg.connect(o.frequency);
      if (fromM) o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    }
    env(g, t, 0.008, 0.16 * (v || 1), 0.25, 0.12 * (v || 1), 0.1, t + dur);
  }
  function bell(t, m, v, pan) {
    const g = gain(0); const p = panner(pan || 0); g.connect(p); p.connect(BUS.synth); p.connect(gain(0.45, BUS.big)); p.connect(gain(0.3, BUS.delay));
    const f = mtof(m);
    const mod = ac.createOscillator(); mod.frequency.value = f * 3.5; const mg = gain(0); mod.connect(mg); mod.start(t); mod.stop(t + 2.5);
    mg.gain.setValueAtTime(f * 2.0, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.6);
    const c = osc('sine', f, t, t + 2.5, g); mg.connect(c.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.13 * (v || 1), t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
  }

  // ---- trailer fx
  function braam(t, roots, dur, v) {
    const lp = filt('lowpass', 160, 2.5);
    lp.frequency.setValueAtTime(160, t); lp.frequency.exponentialRampToValueAtTime(2600, t + 0.35); lp.frequency.exponentialRampToValueAtTime(450, t + dur);
    const sat = shaper(3); const g = gain(0); lp.connect(sat); sat.connect(g); g.connect(BUS.fx); g.connect(gain(0.5, BUS.big));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3 * (v || 1), t + 0.04); g.gain.setTargetAtTime(0.17 * (v || 1), t + 0.1, 0.5); g.gain.setTargetAtTime(0, t + dur, 0.4);
    for (const m of roots) for (const d of [-18, -6, 6, 18]) osc('sawtooth', mtof(m), t, t + dur + 2, gain(0.22, lp), d);
    for (const m of roots) osc('square', mtof(m - 12), t, t + dur + 2, gain(0.25, lp));
  }
  function riser(t0, t1, v) {
    const bp = filt('bandpass', 350, 1.4);
    bp.frequency.setValueAtTime(350, t0); bp.frequency.exponentialRampToValueAtTime(9000, t1);
    const g = gain(0); bp.connect(g); g.connect(BUS.fx); g.connect(gain(0.5, BUS.verb));
    noise(t0, t1 - t0 + 0.05, bp);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.4 * (v || 1), t1 - 0.01); g.gain.linearRampToValueAtTime(0, t1 + 0.02);
    const lp = filt('lowpass', 3000, null, BUS.fx); const sg = gain(0, lp); const o = osc('sawtooth', 110, t0, t1 + 0.05, sg); o.frequency.exponentialRampToValueAtTime(1300, t1);
    sg.gain.setValueAtTime(0.0001, t0); sg.gain.exponentialRampToValueAtTime(0.07 * (v || 1), t1 - 0.01); sg.gain.linearRampToValueAtTime(0, t1 + 0.02);
  }
  function revCymbal(tEnd, dur, v) {
    const hp = filt('highpass', 4500); const g = gain(0); hp.connect(g); g.connect(BUS.fx);
    noise(tEnd - dur, dur, hp);
    g.gain.setValueAtTime(0.0001, tEnd - dur); g.gain.exponentialRampToValueAtTime(0.38 * (v || 1), tEnd - 0.005); g.gain.linearRampToValueAtTime(0, tEnd);
  }
  function impact(t, v, dk) {
    v = v || 1;
    const g = gain(0); g.connect(BUS.fx); g.connect(gain(0.6, BUS.big));
    const o = osc('sine', 72, t, t + 3, g); o.frequency.exponentialRampToValueAtTime(27, t + 1.6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.8 * v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
    const lp = filt('lowpass', 6000); lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.8);
    const ng = gain(0); lp.connect(ng); ng.connect(BUS.fx); ng.connect(gain(0.7, BUS.big));
    noise(t, 1.2, lp); ng.gain.setValueAtTime(0.6 * v, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    const tg = gain(0, BUS.fx); const to = osc('sine', 125, t, t + 0.6, tg); to.frequency.exponentialRampToValueAtTime(46, t + 0.4);
    tg.gain.setValueAtTime(0.75 * v, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  }
  function hitText(t, v) { // title-card hit: thud (impact, added by the wrapper) + metallic shing
    const bp = filt('bandpass', 5200, 6); const g = gain(0); bp.connect(g); g.connect(BUS.fx); g.connect(gain(0.6, BUS.verb));
    noise(t, 0.9, bp); g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    for (const f of [1397, 2093, 3136, 4186]) { const bg = gain(0); bg.connect(BUS.fx); bg.connect(gain(0.45, BUS.big)); osc('sine', f * (1 + (rnd() - 0.5) * 0.004), t, t + 2.2, bg); bg.gain.setValueAtTime(0.04, t); bg.gain.exponentialRampToValueAtTime(0.0005, t + 2.0); }
  }
  function whoosh(tMid, dur, v, panDir, dest) {
    const t0 = tMid - dur * 0.6;
    const bp = filt('bandpass', 300, 1.2);
    bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(3000, tMid); bp.frequency.exponentialRampToValueAtTime(400, t0 + dur);
    const g = gain(0); const p = panner(0); bp.connect(g); g.connect(p); p.connect(dest || BUS.fx);
    p.pan.setValueAtTime(-0.8 * (panDir || 1), t0); p.pan.linearRampToValueAtTime(0.8 * (panDir || 1), t0 + dur);
    noise(t0, dur + 0.05, bp);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5 * (v || 1), tMid); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function downlifter(t, dur, v) {
    const lp = filt('lowpass', 9000); lp.frequency.setValueAtTime(9000, t); lp.frequency.exponentialRampToValueAtTime(200, t + dur);
    const g = gain(0); lp.connect(g); g.connect(BUS.fx); g.connect(gain(0.4, BUS.verb));
    noise(t, dur, lp); g.gain.setValueAtTime(0.22 * (v || 1), t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  }
  function air(t0, t1, v) { // dawn wind / city air
    const lp = filt('bandpass', 700, 0.5); const g = gain(0); lp.connect(g); g.connect(BUS.fx);
    noise(t0, t1 - t0 + 0.1, lp, 0.5);
    lp.frequency.setValueAtTime(500, t0); lp.frequency.linearRampToValueAtTime(1400, (t0 + t1) / 2); lp.frequency.linearRampToValueAtTime(700, t1);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.12 * (v || 1), t0 + 1.5); g.gain.setValueAtTime(0.12 * (v || 1), t1 - 1); g.gain.linearRampToValueAtTime(0, t1);
  }
  function thunder(t, v) {
    const hp = filt('highpass', 1500); const cg = gain(0); hp.connect(cg); cg.connect(BUS.sfx); cg.connect(gain(0.5, BUS.big)); noise(t, 0.4, hp);
    cg.gain.setValueAtTime(0.75 * (v || 1), t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    const lp = filt('lowpass', 900); lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(110, t + 4);
    const g = gain(0); lp.connect(g); g.connect(BUS.sfx); g.connect(gain(0.5, BUS.big)); noise(t + 0.04, 5, lp, 0.5);
    g.gain.setValueAtTime(0, t + 0.04); g.gain.linearRampToValueAtTime(1.0 * (v || 1), t + 0.28);
    for (let k = 0; k < 5; k++) { const tt = t + 0.6 + k * (0.45 + rnd() * 0.4); g.gain.setTargetAtTime((0.45 + rnd() * 0.45) * (v || 1), tt, 0.15); }
    g.gain.setTargetAtTime(0, t + 3.0, 0.7);
  }
  function rain(t0, t1, v, v2, tSwell) { // rain texture (bright hiss + roof rumble), swelling to v2 at tSwell
    const bp = filt('bandpass', 3800, 0.35); const g = gain(0); bp.connect(g); g.connect(BUS.sfx);
    noise(t0, t1 - t0 + 0.5, bp, 0.9);
    const lp = filt('lowpass', 700); const g2 = gain(0.35, g); lp.connect(g2); noise(t0, t1 - t0 + 0.5, lp, 0.6);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.16 * v, t0 + 0.8);
    if (tSwell) { g.gain.setValueAtTime(0.16 * v, tSwell - 0.6); g.gain.linearRampToValueAtTime(0.16 * v2, tSwell + 0.3); }
    g.gain.setValueAtTime(0.16 * (v2 || v), t1 - 0.6); g.gain.linearRampToValueAtTime(0, t1);
    // droplets
    for (let tt = t0 + 0.3; tt < t1 - 0.3; tt += 0.05 + rnd() * 0.12) {
      const dg = gain(0); const p = panner(rnd() * 1.6 - 0.8, BUS.sfx); dg.connect(p);
      const f = 2200 + rnd() * 2600; const o = osc('sine', f, tt, tt + 0.05, dg); o.frequency.exponentialRampToValueAtTime(f * 1.4, tt + 0.03);
      dg.gain.setValueAtTime(0.02 * (tSwell && tt > tSwell ? v2 : v), tt); dg.gain.exponentialRampToValueAtTime(0.0005, tt + 0.035);
    }
  }
  function siren(t0, t1, v) { // a wailing, filtered synth siren over the chase (F4 <-> C5)
    const bp = filt('bandpass', 1100, 1.4); const g = gain(0); const p = panner(0); bp.connect(g); g.connect(p); p.connect(BUS.fx); p.connect(gain(0.3, BUS.delay));
    const o = osc('sawtooth', mtof(65), t0, t1 + 0.2, bp); const o2 = osc('triangle', mtof(77), t0, t1 + 0.2, gain(0.6, bp));
    for (let t = t0, k = 0; t < t1; t += B, k++) {
      const hi = k % 2 === 0;
      o.frequency.setValueAtTime(mtof(hi ? 65 : 72), t); o.frequency.exponentialRampToValueAtTime(mtof(hi ? 72 : 65), t + B * 0.9);
      o2.frequency.setValueAtTime(mtof(hi ? 77 : 84), t); o2.frequency.exponentialRampToValueAtTime(mtof(hi ? 84 : 77), t + B * 0.9);
    }
    p.pan.setValueAtTime(-0.6, t0); p.pan.linearRampToValueAtTime(0.6, t1);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.14 * (v || 1), t0 + 0.3); g.gain.setValueAtTime(0.14 * (v || 1), t1 - 0.6); g.gain.linearRampToValueAtTime(0, t1);
  }

  // ---- activity SFX (all on the sfx bus, quantised to the grid)
  const SFX = {
    kite(t) { // manja string zing + paper flutter, sweeping L -> R
      whoosh(t + 0.2, 1.0, 0.7, 1, BUS.sfx);
      const bp = filt('bandpass', 1400, 6); const g = gain(0); const p = panner(-0.7); bp.connect(g); g.connect(p); p.connect(BUS.sfx); p.connect(gain(0.35, BUS.delay));
      p.pan.setValueAtTime(-0.7, t); p.pan.linearRampToValueAtTime(0.7, t + 1.0);
      const o = osc('sawtooth', mtof(77), t, t + 1.2, bp); o.frequency.exponentialRampToValueAtTime(mtof(84), t + 0.5); o.frequency.exponentialRampToValueAtTime(mtof(89), t + 1.0);
      bp.frequency.setValueAtTime(1400, t); bp.frequency.exponentialRampToValueAtTime(4200, t + 1.0);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.25); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      const fl = gain(0); const fbp = filt('bandpass', 900, 0.8, fl); fl.connect(BUS.sfx); noise(t, 0.9, fbp);
      for (let k = 0; k < 16; k++) { const tt = t + k * 0.05; fl.gain.setValueAtTime(0.18 * (1 - k / 16), tt); fl.gain.setTargetAtTime(0.01, tt + 0.012, 0.01); }
    },
    lingocha(t) { // ball thwack into a stack of stones, the stones clatter on 32nds
      const tg = gain(0, BUS.sfx); const o = osc('sine', 190, t, t + 0.2, tg); o.frequency.exponentialRampToValueAtTime(85, t + 0.1);
      tg.gain.setValueAtTime(0.9, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      const ng = gain(0, BUS.sfx); const bp = filt('bandpass', 1500, 1, ng); noise(t, 0.08, bp); ng.gain.setValueAtTime(0.8, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      for (let k = 0; k < 7; k++) {
        const tt = t + 0.02 + k * (S16 / 2) + (rnd() - 0.5) * 0.012;
        const sg = gain(0); const p = panner(rnd() * 1.4 - 0.7, BUS.sfx); sg.connect(p); p.connect(gain(0.3, BUS.verb));
        const sb = filt('bandpass', 1900 + rnd() * 2400, 9, sg); noise(tt, 0.06, sb);
        sg.gain.setValueAtTime(1.6 * (1 - k / 9), tt); sg.gain.exponentialRampToValueAtTime(0.001, tt + 0.05);
      }
    },
    cricket(t) { // bat "tock" + crowd cheer swell
      const g = gain(0, BUS.sfx); g.connect(gain(0.4, BUS.verb));
      osc('sine', 1040, t, t + 0.12, g); osc('triangle', 640, t, t + 0.15, gain(0.7, g));
      g.gain.setValueAtTime(0.38, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      const cg = gain(0, BUS.sfx); const bp = filt('bandpass', 3000, 2, cg); noise(t, 0.02, bp); cg.gain.setValueAtTime(0.7, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
      crowd(t + 0.1, B * 3.2, 1);
    },
    marbles(t) { // glass marbles clacking (on 16ths), a little roll at the end
      const hits = [[0, 1], [S16, 0.6], [S16 * 3, 0.8], [S16 * 3.5, 0.4], [S16 * 4, 0.25]];
      for (const [d, v] of hits) {
        const tt = t + d, g = gain(0); const p = panner(rnd() * 1.2 - 0.6, BUS.sfx); g.connect(p); p.connect(gain(0.25, BUS.verb));
        for (const [f, a] of [[3150, 1], [4630, 0.6], [6870, 0.35]]) osc('sine', f * (1 + (rnd() - 0.5) * 0.03), tt, tt + 0.12, gain(a, g));
        g.gain.setValueAtTime(0.13 * v, tt); g.gain.exponentialRampToValueAtTime(0.0005, tt + 0.07);
        const cg = gain(0, p); const hp = filt('highpass', 5000, null, cg); noise(tt, 0.01, hp); cg.gain.setValueAtTime(0.18 * v, tt); cg.gain.exponentialRampToValueAtTime(0.001, tt + 0.008);
      }
    },
    marampitti(t) { // a fast dodge whoosh + low vwoom
      whoosh(t + 0.12, 0.5, 0.9, -1, BUS.sfx);
      const g = gain(0, BUS.sfx); const o = osc('sine', 140, t - 0.1, t + 0.5, g); o.frequency.exponentialRampToValueAtTime(55, t + 0.4);
      g.gain.setValueAtTime(0.0001, t - 0.1); g.gain.exponentialRampToValueAtTime(0.35, t + 0.1); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    },
    panipuri(t) { // crunch (two bites on 8ths)
      for (const [d, v] of [[0, 1], [B / 2, 0.7]]) {
        const tt = t + d; const g = gain(0, BUS.sfx); const bp = filt('bandpass', 2600, 0.7, g); noise(tt, 0.22, bp, 0.8);
        g.gain.setValueAtTime(0, tt);
        let x = tt; while (x < tt + 0.18) { g.gain.setValueAtTime((0.4 + rnd() * 0.9) * v * (1 - (x - tt) / 0.2), x); x += 0.004 + rnd() * 0.012; g.gain.setValueAtTime(0.02, x); x += 0.002 + rnd() * 0.006; }
        g.gain.setValueAtTime(0, x);
        const lg = gain(0, BUS.sfx); const lp = filt('lowpass', 500, null, lg); noise(tt, 0.08, lp); lg.gain.setValueAtTime(0.5 * v, tt); lg.gain.exponentialRampToValueAtTime(0.001, tt + 0.07);
      }
    },
    bargain(t) { // auto-rickshaw horn, tuned to Ab4/C5, beep-beep on 16ths
      for (const d of [0, S16 * 1.5]) {
        const tt = t + d, g = gain(0); const lp = filt('lowpass', 2400, null, g); g.connect(BUS.sfx); g.connect(gain(0.2, BUS.verb));
        osc('square', mtof(68), tt, tt + 0.15, lp); osc('square', mtof(72), tt, tt + 0.15, lp); osc('sawtooth', mtof(68) * 1.003, tt, tt + 0.15, gain(0.4, lp));
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.09, tt + 0.008); g.gain.setValueAtTime(0.09, tt + 0.1); g.gain.linearRampToValueAtTime(0, tt + 0.13);
      }
    },
    brickgame(t) { // 8-bit blips: an up-run on 32nds, then a two-note 'line clear'
      const notes = [[0, 77], [1, 80], [2, 84], [3, 89], [8, 84], [9, 89], [12, 96]];
      for (const [k, m] of notes) {
        const tt = t + k * S16 / 2, g = gain(0); const lp = filt('lowpass', 7000, null, g); g.connect(BUS.sfx); g.connect(gain(0.3, BUS.delay));
        osc('square', mtof(m), tt, tt + 0.07, lp);
        g.gain.setValueAtTime(0.055, tt); g.gain.setValueAtTime(0.055, tt + 0.05); g.gain.linearRampToValueAtTime(0, tt + 0.062);
      }
    },
    antenna(t) { // TV static burst that snaps off on the grid, plus a tuning squeal
      const g = gain(0); const hp = filt('highpass', 1200, null); const p = panner(0, BUS.sfx); hp.connect(g); g.connect(p);
      noise(t, B * 0.75 + 0.05, hp, 1.0);
      let x = t; while (x < t + B * 0.75) { g.gain.setValueAtTime((0.12 + rnd() * 0.14) * (1 - 0.4 * (x - t) / (B * 0.75)), x); x += 0.012 + rnd() * 0.02; }
      g.gain.setValueAtTime(0, t + B * 0.75);
      const sg = gain(0, BUS.sfx); const o = osc('sine', 2400, t, t + 0.4, sg); o.frequency.exponentialRampToValueAtTime(mtof(84), t + 0.35);
      sg.gain.setValueAtTime(0.02, t); sg.gain.linearRampToValueAtTime(0.03, t + 0.2); sg.gain.linearRampToValueAtTime(0, t + 0.38);
    },
    clap(t) { // one big clap under the Golconda dome, echoing back on 8ths
      for (let k = 0; k < 7; k++) {
        const tt = t + k * B / 2, v = Math.pow(0.58, k);
        const bp = filt('bandpass', 1200 - k * 90, 1.0); const g = gain(0); bp.connect(g); const p = panner(k === 0 ? 0 : (k % 2 ? -0.5 : 0.5), BUS.sfx); g.connect(p); p.connect(gain(0.5 + k * 0.1, BUS.big));
        noise(tt - 0.012, 0.3, bp);
        for (const d of [0, 0.01, 0.021]) { g.gain.setValueAtTime(1.1 * v, tt - 0.012 + d); g.gain.exponentialRampToValueAtTime(0.08 * v, tt - 0.012 + d + 0.008); }
        g.gain.setValueAtTime(0.9 * v, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.22);
      }
    },
  };
  function crowd(t, dur, v) {
    const out = gain(0); out.connect(BUS.sfx); out.connect(gain(0.35, BUS.verb));
    for (const [f, q, a] of [[520, 1.6, 1], [1100, 1.8, 0.8], [2500, 2.2, 0.4]]) { const bp = filt('bandpass', f, q); noise(t, dur + 0.3, bp, 1); bp.connect(gain(a, out)); }
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.45 * v, t + dur * 0.35);
    for (let x = t + dur * 0.35; x < t + dur * 0.7; x += 0.06 + rnd() * 0.06) out.gain.setTargetAtTime((0.34 + rnd() * 0.16) * v, x, 0.03);
    out.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.12);
  }
  function cutAccent(t, v) { // subtle: a short reverse swell into the cut + a soft crash on it
    revCymbal(t, 0.3, 0.35 * (v || 1)); crash(t, 0.35 * (v || 1), (rnd() - 0.5) * 0.6);
  }
  function pop(t, m, i) { // title pop: bright bell-pluck + click + a little sub thump, rising
    hookNote(t, m, 0.9 + i * 0.03, (i % 2 ? 0.25 : -0.25), { dec: 0.9, delay: 0.2 });
    const cg = gain(0, BUS.fx); const hp = filt('highpass', 4000, null, cg); noise(t, 0.02, hp); cg.gain.setValueAtTime(0.25, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    const g = gain(0, BUS.fx); const o = osc('sine', mtof(m - 24), t, t + 0.3, g); o.frequency.exponentialRampToValueAtTime(mtof(m - 36), t + 0.2);
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  }

  // ---- tape world (prologue + story): wow/flutter LFO shared by all tape notes, so the whole 'tape' drifts together
  let WOW = null;
  function makeWow(t0, t1) {
    const w = gain(1);
    for (const [f, cents] of [[0.55, 22], [6.8, 5]]) { const o = ac.createOscillator(); o.frequency.value = f; o.connect(gain(cents, w)); o.start(t0); o.stop(t1); }
    return w;
  }
  function tapeNote(t, m, v, o) { // a warm electric-piano tine on a worn cassette -> lofi bus
    o = o || {}; v = v == null ? 1 : v;
    const f = mtof(m), dec = o.dec || 1.8;
    const out = gain(0); const p = panner(o.pan || 0); out.connect(p); p.connect(BUS.lofi); p.connect(gain(0.22, BUS.verb)); p.connect(gain(o.delay == null ? 0.18 : o.delay, BUS.delay));
    const c = osc('sine', f, t, t + dec + 0.2, out);
    const mg = gain(0); const mod = osc('sine', f, t, t + dec + 0.2, mg); mg.connect(c.frequency);
    mg.gain.setValueAtTime(f * 1.3, t); mg.gain.exponentialRampToValueAtTime(f * 0.06, t + 0.45);
    const c2 = osc('triangle', f * 2, t, t + dec + 0.2, gain(0.1, out));
    if (WOW) for (const x of [c, mod, c2]) WOW.connect(x.detune);
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.2 * v, t + 0.005); out.gain.exponentialRampToValueAtTime(0.001, t + dec);
  }
  function deckClunk(t, v) { // cassette deck key: click, transport thunk, latch, a little motor spin-up
    v = v || 1;
    const cg = gain(0, BUS.sfx); const cb = filt('bandpass', 3400, 1, cg); noise(t, 0.015, cb); cg.gain.setValueAtTime(0.45 * v, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    const tg = gain(0, BUS.sfx); const o = osc('sine', 120, t + 0.012, t + 0.2, tg); o.frequency.exponentialRampToValueAtTime(55, t + 0.08);
    tg.gain.setValueAtTime(0.7 * v, t + 0.012); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    const ng = gain(0, BUS.sfx); const nb = filt('bandpass', 700, 1.5, ng); noise(t + 0.012, 0.07, nb); ng.gain.setValueAtTime(0.6 * v, t + 0.012); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    const lg = gain(0, BUS.sfx); const lb = filt('bandpass', 2300, 3, lg); noise(t + 0.075, 0.03, lb); lg.gain.setValueAtTime(0.35 * v, t + 0.075); lg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    const mg = gain(0, BUS.sfx); const mb = filt('bandpass', 380, 4, mg); noise(t + 0.08, 0.4, mb);
    mg.gain.setValueAtTime(0.0001, t + 0.08); mg.gain.exponentialRampToValueAtTime(0.09 * v, t + 0.25); mg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  }
  function tapeHiss(t0, t1, v) {
    const hp = filt('highpass', 2400, 0.5), lp = filt('lowpass', 9000, 0.5, null); hp.connect(lp);
    const g = gain(0); lp.connect(g); g.connect(BUS.fx);
    noise(t0, t1 - t0 + 0.1, hp, 0.95);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.11 * (v || 1), t0 + 0.12); g.gain.setValueAtTime(0.11 * (v || 1), t1 - 0.5); g.gain.linearRampToValueAtTime(0, t1);
  }
  function rewind(t0, t1, v) { // REWIND: tape whir sweeping up, a fluttering squeal, garbled backwards hook blips
    v = v || 1;
    const bp = filt('bandpass', 500, 2); const g = gain(0); bp.connect(g); g.connect(BUS.sfx); g.connect(gain(0.2, BUS.verb));
    noise(t0, t1 - t0 + 0.05, bp, 1.6);
    bp.frequency.setValueAtTime(500, t0); bp.frequency.exponentialRampToValueAtTime(3800, t1);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12 * v, t0 + 0.25); g.gain.exponentialRampToValueAtTime(0.3 * v, t1 - 0.05); g.gain.linearRampToValueAtTime(0, t1);
    const sb = filt('bandpass', 800, 5); const sg = gain(0); sb.connect(sg); sg.connect(BUS.sfx);
    const so = osc('sawtooth', 220, t0, t1 + 0.05, sb); so.frequency.exponentialRampToValueAtTime(1760, t1);
    sb.frequency.setValueAtTime(440, t0); sb.frequency.exponentialRampToValueAtTime(3520, t1);
    const fl = ac.createOscillator(); fl.frequency.value = 11; const fg = gain(45); fl.connect(fg); fg.connect(so.detune); fl.start(t0); fl.stop(t1 + 0.05);
    sg.gain.setValueAtTime(0.0001, t0); sg.gain.exponentialRampToValueAtTime(0.08 * v, t1 - 0.05); sg.gain.linearRampToValueAtTime(0, t1);
    const rev = HK.A2.concat(HK.A1).map((x) => x[1]).reverse();
    let tt = t0 + 0.15, k = 0;
    while (tt < t1 - 0.1) {
      const u = (tt - t0) / (t1 - t0), m = rev[k % rev.length] + 12 + Math.round(u * 12);
      const bg = gain(0); const p = panner(k % 2 ? 0.3 : -0.3, BUS.sfx); bg.connect(p);
      osc('square', mtof(m), tt, tt + 0.05, filt('lowpass', 3000, null, bg));
      bg.gain.setValueAtTime(0.022 * v * (0.5 + u), tt); bg.gain.exponentialRampToValueAtTime(0.0005, tt + 0.045);
      tt += 0.13 - 0.085 * u; k++;
    }
  }
  function yearTicks(t0, t1, n) { // the year counter spinning 2026 -> 2003: n clicks, fast then settling
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1), t = t0 + (t1 - t0) * (1 - (1 - u) * (1 - u)), last = k === n - 1;
      const g = gain(0); const p = panner(k % 2 ? 0.25 : -0.25, BUS.sfx); g.connect(p);
      const b = filt('bandpass', last ? 3200 : 4600, 5, g); noise(t, 0.012, b); osc('sine', last ? 2093 : 2637, t, t + 0.03, gain(0.15, g));
      g.gain.setValueAtTime((last ? 0.5 : 0.28), t); g.gain.exponentialRampToValueAtTime(0.001, t + (last ? 0.05 : 0.02));
    }
  }
  function recBlip(t) { // REC: a two-tone beep (C6 -> F6) + tape-counter ticks on 16ths
    for (const [d, m, len] of [[0, 84, 0.07], [0.09, 89, 0.13]]) {
      const g = gain(0); g.connect(BUS.sfx); g.connect(gain(0.3, BUS.delay));
      osc('sine', mtof(m), t + d, t + d + len + 0.02, g); osc('square', mtof(m), t + d, t + d + len + 0.02, gain(0.08, g));
      g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.1, t + d + 0.004); g.gain.setValueAtTime(0.1, t + d + len - 0.01); g.gain.linearRampToValueAtTime(0, t + d + len);
    }
    for (let k = 0; k < 8; k++) {
      const tt = t + B + k * S16, g = gain(0); const p = panner(k % 2 ? 0.35 : -0.35, BUS.sfx); g.connect(p);
      const b = filt('bandpass', 3000, 5, g); noise(tt, 0.008, b); g.gain.setValueAtTime(0.2, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.012);
    }
  }

  /* ------------------------------------------------------------ just-in-time scheduling
   * Every voice's nodes are created shortly before it plays (OfflineAudioContext.suspend), so the render graph only
   * holds what is sounding: ~10x faster than building all ~20k nodes up front. Ducking stays eager. */
  let QUEUE = [], DEFER = false;
  function later(t0, fn) { if (DEFER) QUEUE.push([t0, QUEUE.length, fn]); else fn(); }
  function defer(fn, startOf) { return function () { const a = arguments; later(startOf ? startOf.apply(null, a) : a[0], () => fn.apply(null, a)); }; }
  {
    const kickD = defer(kick), impactD = defer(impact), hitD = defer(hitText), thunderD = defer(thunder);
    kick = (t, v, long, dk) => { duck(t, dk == null ? 0.5 : dk); BDUCKS.push([t, 0.55 * Math.min(1, v == null ? 1 : v)]); kickD(t, v, long); };
    impact = (t, v, dk) => { duck(t, dk == null ? 0.9 : dk); impactD(t, v); };
    hitText = (t, v) => { impact(t, 0.6 * (v || 1)); hitD(t, v); };
    thunder = (t, v) => { impact(t, 0.45); thunderD(t, v); };
    clap = defer(clap, (t) => t - 0.014); snare = defer(snare, (t) => t - 0.014);
    rim = defer(rim); hat = defer(hat); shaker = defer(shaker); crash = defer(crash); tom = defer(tom);
    bass808 = defer(bass808); drone = defer(drone); supersaw = defer(supersaw); pad = defer(pad); pluck = defer(pluck);
    hookNote = defer(hookNote); leadSaw = defer(leadSaw); bell = defer(bell); braam = defer(braam); riser = defer(riser);
    revCymbal = defer(revCymbal, (te, d) => te - d); whoosh = defer(whoosh, (tm, d) => tm - d * 0.6);
    tapeNote = defer(tapeNote); deckClunk = defer(deckClunk); tapeHiss = defer(tapeHiss); rewind = defer(rewind); yearTicks = defer(yearTicks); recBlip = defer(recBlip);
    downlifter = defer(downlifter); air = defer(air); rain = defer(rain); siren = defer(siren); crowd = defer(crowd); pop = defer(pop);
    // per-cue trims (measured against the mix in each cue's window: aim ~6-10 dB under it, transient-led)
    const TRIM = { kite: 3.2, lingocha: 0.7, cricket: 1.6, marbles: 2.2, marampitti: 1.8, panipuri: 1, bargain: 1, brickgame: 2.2, antenna: 1, clap: 2.6 };
    for (const k in SFX) {
      const f = SFX[k];
      SFX[k] = defer((t) => { const bus = BUS.sfx; BUS.sfx = gain(TRIM[k] || 1, bus); try { f(t); } finally { BUS.sfx = bus; } }, (t) => t - 0.2);
    }
  }

  /* ------------------------------------------------------------ harmony + patterns */
  const CH = {
    Fm: { v: [53, 56, 60, 65], r: 29 }, Db: { v: [53, 56, 61, 65], r: 37 }, Bbm: { v: [53, 58, 61, 65], r: 34 },
    C: { v: [52, 55, 60, 64], r: 36 }, Ab: { v: [51, 56, 60, 63], r: 32 }, Eb: { v: [51, 55, 58, 63], r: 39 },
  };
  // hook phrases, one bar each: [16th step, midi, length in 16ths]; the 3-3-2 rhythm is the motif
  const HK = {
    A1: [[0, 72, 3], [3, 72, 3], [6, 75, 2], [8, 77, 3], [11, 75, 3], [14, 72, 2]],   // Fm
    A2: [[0, 77, 3], [3, 75, 3], [6, 73, 2], [8, 72, 4], [12, 68, 4]],                // Db
    A3: [[0, 73, 3], [3, 73, 3], [6, 77, 2], [8, 80, 3], [11, 77, 3], [14, 73, 2]],   // Bbm
    A4: [[0, 79, 3], [3, 76, 3], [6, 72, 2], [8, 76, 8]],                             // C
    B1: [[0, 77, 3], [3, 77, 3], [6, 80, 2], [8, 77, 3], [11, 75, 3], [14, 72, 2]],   // Db
    B2: [[0, 75, 3], [3, 75, 3], [6, 77, 2], [8, 75, 4], [12, 72, 4]],                // Ab
    B3: [[0, 79, 3], [3, 79, 3], [6, 82, 2], [8, 79, 3], [11, 77, 3], [14, 75, 2]],   // Eb
    B4: [[0, 80, 3], [3, 79, 3], [6, 77, 2], [8, 72, 8]],                             // Fm
  };
  const LOOP_A = [['Fm', 'A1'], ['Db', 'A2'], ['Bbm', 'A3'], ['C', 'A4']];
  const LOOP_B = [['Db', 'B1'], ['Ab', 'B2'], ['Eb', 'B3'], ['Fm', 'B4']];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 3, 1, 3, 2, 1, 2];
  function arpBar(n, chord, v, cut, octave, from, to) {
    const c = CH[chord].v;
    for (let s = from || 0; s < (to || 16); s++) pluck(st(n, s), c[ARP[s]] + 12 * (octave || 0), v * (s % 4 === 0 ? 1 : 0.65), ((s % 4) - 1.5) * 0.25, cut);
  }
  function hookBar(n, ph, o) {
    o = o || {};
    for (const [s, m, l] of HK[ph]) {
      const t = st(n, s);
      if (o.hook !== 0) hookNote(t, m + (o.oct || 0), o.hook == null ? 1 : o.hook, (s % 6 - 2.5) * 0.08);
      if (o.lead) leadSaw(t, m + 12, l * S16 * 0.95, o.lead);
      if (o.bell) bell(t, m + 24, o.bell, (s % 2 ? 0.3 : -0.3));
    }
  }
  // 808 line for a bar from a kick list: root on each kick, an octave pop with a glide on the flagged ones
  function bassLine(n, chord, kicks, o) {
    o = o || {}; const r = CH[chord].r;
    for (let i = 0; i < kicks.length; i++) {
      const s = kicks[i], e = i + 1 < kicks.length ? kicks[i + 1] : (o.endStep || 16);
      const up = o.up && o.up.includes(s);
      bass808(st(n, s), up ? r + 12 : r, (e - s) * S16 * 0.94, up ? r : (i === 0 && o.glideFrom ? o.glideFrom : null), up ? 0.08 : 0.12, o.v);
    }
  }
  const SW = 0.022; // laid-back swing on the 16th off-steps (explore)
  function grooveBar(n, o) {
    o = o || {};
    const sw = (s) => (o.swing && s % 2 === 1 ? SW : 0);
    const T = (s) => st(n, s) + sw(s), V = o.v || 1, H = o.hv || V;
    for (const s of o.kicks || [0, 7, 10]) kick(T(s), (s === 0 ? 1 : 0.92) * V, false, o.duck);
    for (const s of o.snares || [4, 12]) snare(T(s) + (o.lazy ? 0.008 : 0), V, o.snVerb);
    for (const s of o.ghosts || []) snare(T(s), 0.22 * V, 0.05, true);
    if (o.hats === 8) { for (let s = 0; s < 16; s += 2) hat(T(s), (s % 4 === 0 ? 0.85 : 0.6) * H, false, 0.2); }
    else if (o.hats === 16) { for (let s = 0; s < 16; s++) hat(T(s), (s % 4 === 0 ? 0.85 : s % 2 === 0 ? 0.6 : 0.38) * H, false, 0.2); }
    for (const s of o.hatExtra || []) hat(T(s), 0.45 * H, false, 0.25);
    for (const s of o.open || []) hat(T(s), 0.5 * H, true, -0.25);
    for (const s of o.rims || []) rim(T(s), 0.8 * V, 0.35);
    for (const s of o.shakers || []) shaker(T(s), 0.8 * H, -0.35);
    if (o.roll === 'trip') roll(st(n, 12), B, 6, 0.4 * H, 0.8 * H);
    else if (o.roll === '32') roll(st(n, 14), B / 2, 4, 0.4 * H, 0.85 * H);
    else if (o.roll === 'long') { roll(st(n, 8), B, 4, 0.5 * H, 0.6 * H); roll(st(n, 12), B, 8, 0.4 * H, 0.9 * H); }
  }

  /* ------------------------------------------------------------ the arrangement */
  function arrange(TL) {
    const seg = (id) => TL.segments.find((s) => s.id === id) || {};
    const LP = BUS.synthLP.frequency, DLP = BUS.drumLP.frequency;
    BOFF = 0;
    // synth-group filter automation (absolute v2.1 beats), strictly chronological
    LP.setValueAtTime(2400, 0);
    LP.setValueAtTime(2400, tb(11.9)); LP.linearRampToValueAtTime(450, tb(12)); LP.exponentialRampToValueAtTime(4500, tb(19.75)); LP.linearRampToValueAtTime(20000, tb(20));
    LP.setValueAtTime(20000, tb(38)); LP.exponentialRampToValueAtTime(1500, tb(40));
    LP.setValueAtTime(1500, tb(44)); LP.exponentialRampToValueAtTime(9000, tb(47.9)); LP.linearRampToValueAtTime(20000, tb(48));
    LP.setValueAtTime(20000, tb(114)); LP.exponentialRampToValueAtTime(800, tb(116));
    LP.setValueAtTime(800, tb(120)); LP.exponentialRampToValueAtTime(1500, tb(124));
    LP.setValueAtTime(1500, tb(125)); LP.exponentialRampToValueAtTime(7000, tb(127.9)); LP.linearRampToValueAtTime(20000, tb(128));
    LP.setValueAtTime(20000, tb(139.9)); LP.linearRampToValueAtTime(2200, tb(140)); LP.exponentialRampToValueAtTime(12000, tb(147.9)); LP.linearRampToValueAtTime(20000, tb(148));
    LP.setValueAtTime(20000, tb(152)); LP.exponentialRampToValueAtTime(2200, tb(162));
    // drum-bus low-pass: the story beat's drums are muffled, opening into the PLAY drop
    DLP.setValueAtTime(20000, 0); DLP.setValueAtTime(20000, tb(38.5)); DLP.exponentialRampToValueAtTime(1300, tb(40));
    DLP.setValueAtTime(1300, tb(45)); DLP.exponentialRampToValueAtTime(16000, tb(47.9)); DLP.linearRampToValueAtTime(20000, tb(48));
    WOW = makeWow(0, tb(48));

    /* ---- bars 1-3 (b0-11): cold open on the game's prologue (VHS PLAY 2026, the cassette from Immu, "Gurthunda?",
     * REWIND 2026 -> 2003). Intimate tape world: hiss, a deck PLAY clunk, the hook on a warped cassette, then the
     * REWIND whir + year counter rising into a riser that resolves on the sunrise reveal at b12 */
    deckClunk(tb(0), 1);
    tapeHiss(tb(0) + 0.05, tb(12) + 0.3, 1);
    pad(tb(0.5), [53, 56, 60], tb(4) - tb(0.5), 0.04, 1000, 1.4);
    pad(tb(4), [49, 53, 56, 60], tb(3.5), 0.042, 1000, 0.8);
    drone(tb(4), tb(4), 29, 0.35);
    for (const [s, m] of HK.A1) tapeNote(tb(1) + s * S16, m, 0.9, { pan: (s % 6 - 2.5) * 0.06 });
    tapeNote(tb(1), 60, 0.45, { dec: 2.4 }); tapeNote(tb(1), 53, 0.4, { dec: 2.4 });
    // "Gurthunda?" (remember?): the answer phrase, left hanging
    for (const [s, m] of HK.A2.slice(0, 4)) tapeNote(tb(5) + s * S16, m, 0.85, { pan: (s % 6 - 2.5) * 0.06 });
    tapeNote(tb(5), 61, 0.4, { dec: 2.6 }); tapeNote(tb(5), 49, 0.4, { dec: 2.6 });
    tapeNote(tb(7) + 0.02, 72, 0.5, { dec: 2.4, delay: 0.35 });
    // REWIND (b8-11)
    deckClunk(tb(8), 0.85);
    rewind(tb(8) + 0.1, tb(12) - 0.03, 3.2);
    yearTicks(tb(8.4), tb(11.5), 24);
    riser(tb(9), tb(12) - 0.02, 1.0);
    revCymbal(tb(12), 1.0, 0.7);

    /* ---- bars 4-5 (b12-19): drone reveal over Charminar at sunrise: pad + hook tease, filter opening, riser
     * (the v2 bars 2-3 block, offset by 2 bars) */
    BOFF = 2;
    whoosh(tb(4) + 0.15, 1.3, 0.75, 1);
    impact(tb(4), 0.5); crash(tb(4), 0.35);
    pad(bar(2), CH.Fm.v.concat([72]), BAR, 0.08, 1600, 0.4); pad(bar(3), CH.Db.v.concat([72]), BAR - 0.1, 0.08, 2200, 0.3);
    for (const [s, m] of [[0, 72], [3, 72], [6, 75], [8, 77]]) hookNote(st(2, s), m, 0.6, 0, { dec: 1.6, verb: 0.4 });
    for (const [s, m] of [[0, 77], [3, 75], [6, 73], [8, 72]]) hookNote(st(3, s), m, 0.75, 0, { dec: 1.6, verb: 0.4 });
    kick(tb(4), 0.5, true, 0.3); kick(tb(8), 0.6, true, 0.3);
    bass808(tb(4), 29, BAR * 0.95, null, null, 0.55); bass808(tb(8), 37, BAR * 0.9, 29, 0.3, 0.6);
    for (let s = 8; s < 16; s += 2) hat(st(3, s), 0.25 + s * 0.02, false, 0.2);
    for (let k = 0; k < 8; k++) snare(tb(10) + k * S16, 0.12 + k * 0.035, 0.15, true);
    riser(tb(7), tb(12) - 0.02, 0.8);
    revCymbal(tb(12), 1.0, 0.7);

    /* ---- bars 6-10 (b20-39): EXPLORE. The groove enters laid-back; the hook is introduced (v2 bars 4-7, +2 bars) */
    impact(tb(12), 0.55); crash(tb(12), 0.6);
    for (let n = 4; n <= 7; n++) {
      const [chord, ph] = LOOP_A[(n - 4) % 4];
      grooveBar(n, { v: 0.8, hv: 0.75, kicks: n % 2 ? [0, 7, 10] : [0, 10, 11], swing: true, lazy: true, hats: 8, hatExtra: [7, 15], open: n === 7 ? [14] : [], rims: [], ghosts: [15], roll: n % 2 ? '32' : null, duck: 0.4 });
      bassLine(n, chord, n % 2 ? [0, 7, 10] : [0, 10, 11], { up: [11], v: 0.78 });
      pad(bar(n), CH[chord].v, BAR - 0.05, 0.055, 1500, 0.15);
      hookBar(n, ph, { hook: 0.85 });
    }
    BOFF = 0;
    // bar 10 (b36-39): Fm, the groove thins out and the filters close into the story beat
    grooveBar(10, { v: 0.8, hv: 0.75, kicks: [0, 7], snares: [4], swing: true, lazy: true, hatExtra: [0, 2, 4, 6, 7], duck: 0.4 });
    bassLine(10, 'Fm', [0, 7], { endStep: 11, v: 0.75 });
    pad(bar(10), CH.Fm.v, BAR - 0.05, 0.055, 1500, 0.15);
    hookBar(10, 'A1', { hook: 0.8 });
    downlifter(tb(38), B * 2, 0.55);

    /* ---- bars 11-12 (b40-47): STORY. Immu's spy-tape clue on the walkman, the REC moment at b44, then a build */
    deckClunk(tb(40), 0.6);
    tapeHiss(tb(40) + 0.05, tb(47.5), 0.75);
    pad(bar(11), CH.Db.v, BAR - 0.05, 0.05, 1300, 0.3);
    bass808(tb(40), 37, BAR * 0.92, 29, 0.25, 0.6);
    for (const [s, v] of [[0, 0.6], [7, 0.4], [10, 0.5]]) kick(st(11, s), v, false, 0.3);
    for (const s of [4, 12]) rim(st(11, s) + 0.01, 0.9, 0.2);
    for (const s of [2, 6, 10, 14]) shaker(st(11, s), 0.6, -0.3);
    for (const [s, m] of HK.B1) tapeNote(st(11, s), m, 0.85, { pan: (s % 6 - 2.5) * 0.06, delay: 0.3 });
    // b44: REC (two-tone beep, a heavier deck clunk, the tape counter ticking)
    deckClunk(tb(44) - 0.05, 0.7);
    recBlip(tb(44));
    for (const [s, m] of HK.A3.slice(0, 4)) tapeNote(st(12, s), m, 0.7, { delay: 0.3 });
    // build into the PLAY drop at b48: Bbm | C
    pad(bar(12), CH.Bbm.v, BAR / 2, 0.055, 1500, 0.1); pad(st(12, 8), CH.C.v, BAR / 2 - 0.05, 0.065, 2400, 0.1);
    bass808(tb(44), 34, B * 1.9, 37, 0.25, 0.7); bass808(tb(46), 36, B * 1.8, 34, 0.2, 0.85);
    kick(tb(44), 0.6, false, 0.35); kick(st(12, 7), 0.5, false, 0.35);
    for (let s = 0; s < 8; s += 2) hat(st(12, s), 0.35, false, 0.2);
    for (let s = 8; s < 16; s++) hat(st(12, s), 0.3 + (s - 8) * 0.05, false, 0.2);
    arpBar(12, 'Bbm', 0.35, 2600, 1, 0, 8); arpBar(12, 'C', 0.55, 4500, 1, 8, 16);
    for (let k = 0; k < 8; k++) snare(st(12, 8) + k * S16, 0.18 + k * 0.05, 0.15, k < 4);
    for (let k = 0; k < 6; k++) snare(st(12, 14) + k * S16 / 3, 0.4 + k * 0.05, 0.15, true);
    riser(tb(44), tb(48) - 0.02, 0.75);
    revCymbal(tb(48), 0.9, 0.7);

    /* ---- everything from PLAY on is the v2 arrangement shifted by +4 bars (+16 beats) */
    BOFF = 4;
    /* ---- v2.1 bars 13-24 (b48-95): PLAY. Full beat, three 4-bar loops building */
    impact(tb(32), 0.75); crash(tb(32), 0.8);
    for (let n = 9; n <= 20; n++) {
      const loop = Math.floor((n - 9) / 4), [chord, ph] = LOOP_A[(n - 9) % 4];
      const odd = n % 2 === 1;
      if (n === 20) continue; // the clap bar is its own thing (below)
      const kicks = odd ? [0, 3, 8, 10] : [0, 6, 9, 14];
      grooveBar(n, {
        kicks, hats: 16, ghosts: odd ? [7] : [15], open: [odd ? 6 : 10], rims: loop >= 1 ? [11] : [],
        shakers: loop === 2 ? [2, 6, 10, 14] : [], roll: odd ? (loop === 2 ? 'trip' : null) : (n % 4 === 0 ? 'long' : 'trip'), duck: 0.5, v: loop === 0 ? 0.86 : 0.9, hv: 0.8,
      });
      bassLine(n, chord, kicks, { up: odd ? [10] : [14] });
      pad(bar(n), CH[chord].v, BAR - 0.05, 0.05, loop === 0 ? 1500 : 2200, 0.1);
      if (loop === 0) hookBar(n, ph, { hook: 1 });
      if (loop === 1) { hookBar(n, ph, { hook: 0.9, lead: 0.55 }); arpBar(n, chord, 0.32, 3000, 1); }
      if (loop === 2) { hookBar(n, ph, { hook: 0.9, lead: 0.7, bell: 0.2 }); arpBar(n, chord, 0.4, 4200, 1); supersaw(bar(n), CH[chord].v, BAR - 0.03, { v: 0.05, cut0: 1200, cut1: 3500, cutS: 2000 }); }
    }
    // bar 24 (b92-95): the beat drops away for the Golconda clap echo, then a festive tom fill into CELEBRATE
    kick(tb(76), 1, true, 0.5); bass808(tb(76), 36, B * 1.9, null, null, 0.9);
    pad(bar(20), CH.C.v.concat([67]), BAR - 0.05, 0.07, 2600, 0.1);
    hookNote(tb(76), 79, 0.6, 0, { dec: 1.6 }); hookNote(tb(77) + S16 * 2, 76, 0.5, 0, { dec: 1.4 });
    for (const [s, m, v, pan] of [[8, 57, 0.8, 0.4], [10, 57, 0.7, 0.4], [11, 53, 0.75, 0.15], [12, 53, 0.8, 0.15], [13, 50, 0.8, -0.15], [14, 45, 0.9, -0.35], [14.5, 45, 0.85, -0.35], [15, 41, 0.95, -0.5], [15.5, 41, 1, -0.5]]) tom(st(20, s), m, v, pan);
    for (let k = 0; k < 8; k++) snare(st(20, 8) + k * S16, 0.15 + k * 0.06, 0.15, true);
    for (let s = 8; s < 16; s++) hat(st(20, s), 0.3 + s * 0.02, false, 0.2);
    bass808(st(20, 8), 36, B * 1.8, 41, 0.3, 0.8);
    riser(tb(76.5), tb(80) - 0.02, 0.6);
    revCymbal(tb(80), 0.8, 0.8);

    /* ---- v2.1 bars 25-29 (b96-115): CELEBRATE. Euphoric: Db Ab Eb Fm, stacked claps, toms in the Ganesh bars */
    impact(tb(80), 0.85); crash(tb(80), 1); crash(tb(88), 0.6); crash(tb(92), 0.55); crash(tb(96), 0.6);
    for (let n = 21; n <= 24; n++) {
      const [chord, ph] = LOOP_B[(n - 21) % 4];
      const kicks = n % 2 ? [0, 3, 8, 10] : [0, 6, 8, 11, 14];
      grooveBar(n, { kicks, hats: 16, ghosts: [7, 15], open: [2, 6, 10, 14], rims: [], shakers: [], roll: n % 2 ? 'trip' : 'long', duck: 0.55 });
      for (const s of [4, 12]) { clap(st(n, s) + 0.012, 0.6, -0.5, 0.4, 1100); clap(st(n, s) + 0.02, 0.6, 0.5, 0.4, 1500); }
      if (n % 2 === 0) clap(st(n, 15), 0.45, 0.3, 0.3);
      bassLine(n, chord, kicks, { up: n % 2 ? [10] : [14] });
      pad(bar(n), CH[chord].v.concat([CH[chord].v[1] + 12]), BAR - 0.05, 0.07, 3200, 0.08);
      supersaw(bar(n), CH[chord].v.concat([CH[chord].v[2] + 12]), BAR - 0.03, { v: 0.085, cut0: 1500, cut1: 6500, cutS: 3600, verb: 0.15 });
      hookBar(n, ph, { hook: 0.95, lead: 0.9, bell: 0.25 });
      arpBar(n, chord, 0.38, 4800, 1);
      if (n <= 22) { // Ganesh: modern tasha-ish toms in 3-3-2, a 16th flourish at the end of the phrase
        for (const [s, m, v, pan] of [[0, 45, 0.9, -0.3], [3, 50, 0.6, 0.3], [6, 45, 0.75, -0.3], [8, 50, 0.7, 0.3], [11, 45, 0.6, -0.3], [14, 53, 0.55, 0.4]]) tom(st(n, s), m, v * 0.85, pan);
        if (n === 22) for (let s = 12; s < 16; s++) tom(st(n, s), 53 - (s - 12) * 2, 0.6 + (s - 12) * 0.08, 0.2);
      }
    }
    // bar 29 (b112-115, Numaish): Db | C, then the floor drops into SURVIVE
    grooveBar(25, { kicks: [0, 3], hats: 16, ghosts: [7], open: [2, 6], duck: 0.55 });
    for (const s of [4]) { clap(st(25, s) + 0.012, 0.6, -0.5, 0.4, 1100); clap(st(25, s) + 0.02, 0.6, 0.5, 0.4, 1500); }
    bassLine(25, 'Db', [0, 3], { endStep: 8 });
    pad(bar(25), CH.Db.v.concat([68]), B * 2, 0.07, 3200, 0.08); pad(st(25, 8), CH.C.v, B * 2, 0.07, 2500, 0.05);
    supersaw(bar(25), CH.Db.v, B * 2 - 0.03, { v: 0.075, cut0: 1500, cut1: 6000, cutS: 3200 });
    hookBar(25, 'B1', { hook: 0.85, lead: 0.7 });
    for (let k = 0; k < 8; k++) snare(st(25, 8) + k * S16, 0.45 - k * 0.04, 0.3, true);
    bass808(st(25, 8), 36, B * 2 - 0.05, 37, 0.5, 0.8);
    downlifter(tb(98), B * 2, 0.8);

    /* ---- v2.1 bars 30-32 (b116-127): SURVIVE. Half-time, filtered, rain; siren on the chase; thunder at b124 */
    impact(tb(100), 0.8); crash(tb(100), 0.5);
    siren(tb(100), tb(104), 1);
    rain(tb(100), tb(112) + 0.5, 0.55, 1.1, tb(104));
    for (const [n, chord] of [[26, 'Fm'], [27, 'Db']]) {
      grooveBar(n, { kicks: n === 26 ? [0, 10] : [0, 7, 10], snares: [8], snVerb: 0.55, hats: 8, hatExtra: [], open: [14], roll: n === 26 ? 'trip' : 'long', duck: 0.6 });
      bass808(bar(n), CH[chord].r, B * 2.4, n === 27 ? 29 : null, 0.25); bass808(st(n, 10), CH[chord].r + (n === 27 ? 0 : 3), B * 1.4, CH[chord].r, 0.2);
      pad(bar(n), CH[chord].v.map((m) => m - 12).concat([CH[chord].v[2]]), BAR - 0.05, 0.08, 1400, 0.3);
      for (let s = 0; s < 16; s += 2) pluck(st(n, s), (s % 6 === 0 ? 72 : 67), 0.5 + (s % 4 === 0 ? 0.2 : 0), s % 4 ? 0.3 : -0.3, 2500); // ticking ostinato
    }
    whoosh(tb(104), 0.5, 0.35, -1);
    // bar 32 (b124-127): the lightning strike; drums out; C pedal; build into the finale
    thunder(tb(108) + 0.1, 1.4);
    bass808(tb(108) + 0.1, 36, BAR * 0.55, null, null, 0.9);
    pad(bar(28), CH.C.v.concat([67, 72]), BAR - 0.1, 0.085, 2400, 0.4);
    for (let s = 8; s < 16; s += 2) pluck(st(28, s), (s % 4 === 0 ? 72 : 67), 0.4 + s * 0.03, s % 4 ? 0.3 : -0.3, 3000);
    for (let k = 0; k < 12; k++) snare(tb(110) + k * (B * 2) / 12, 0.15 + k * 0.045, 0.2, k < 8);
    for (let s = 8; s < 16; s++) hat(st(28, s), 0.25 + (s - 8) * 0.05, false, -0.2);
    riser(tb(108.5), tb(112) - 0.02, 0.85);
    revCymbal(tb(112), 1.1, 0.85);

    /* ---- v2.1 bars 33-35 (b128-139): finale. Half-time, wide pads, the hook in full glory, building */
    impact(tb(112), 0.9); crash(tb(112), 1); crash(tb(116), 0.6); crash(tb(120), 0.7);
    pad(tb(112), [41, 53, 56, 60, 65], BAR * 3 - 0.2, 0.06, 2600, 0.6);
    for (const [n, chord, ph] of [[29, 'Db', 'B1'], [30, 'Eb', 'B3'], [31, 'Fm', 'B4']]) {
      const c = CH[chord].v, k = n - 29;
      grooveBar(n, { kicks: n === 31 ? [0, 7, 10] : [0, 10], snares: [8], snVerb: 0.7, hats: k === 2 ? 16 : 8, open: [6, 14], roll: k === 0 ? null : k === 1 ? 'trip' : 'long', duck: 0.6 });
      for (const s of [8]) { clap(st(n, s) + 0.012, 0.55, -0.5, 0.6, 1100); clap(st(n, s) + 0.02, 0.55, 0.5, 0.6, 1500); }
      bass808(bar(n), CH[chord].r, B * 2.4, n > 29 ? CH[['Db', 'Eb', 'Fm'][k - 1] || 'Db'].r : null, 0.2); bass808(st(n, 10), CH[chord].r, B * 1.4, null, null, 0.9);
      supersaw(bar(n), c.concat([c[1] + 12, c[2] + 12]), BAR - 0.03, { v: 0.085, a: 0.05, cut0: 1500, cut1: 6500, open: 0.3, cutS: 4200, sus: 0.9, verb: 0.3, rel: 0.25 });
      supersaw(bar(n), [c[0] - 12], BAR - 0.03, { v: 0.045, cut0: 600, cut1: 1600, cutS: 900, sus: 0.9 });
      hookBar(n, ph, { hook: 0.95, lead: 0.9 + k * 0.1, bell: 0.28 });
      arpBar(n, chord, 0.25 + k * 0.08, 3500 + k * 900, 1);
    }
    for (let k = 0; k < 16; k++) snare(tb(122) + k * (B * 2) / 16, 0.14 + k * 0.035, 0.15, k < 10);
    riser(tb(118), tb(124) - 0.02, 0.6);
    revCymbal(tb(124), 0.6, 0.5);

    /* ---- v2.1 bars 36-38 (b140-151): title. A rising pop on every beat b140..b147, then the SLAM at b148 */
    const title = TL.segments.find((s) => s.kind === 'title') || { pops: [140, 141, 142, 143, 144, 145, 146, 147], slam: 148 };
    const POPN = [65, 68, 72, 73, 75, 77, 80, 84];
    title.pops.forEach((b, i) => { pop(tbA(b), POPN[i % POPN.length], i); kick(tbA(b), 0.42 + i * 0.08, false, 0.45); if (i % 2 === 1) clap(tbA(b), 0.25 + i * 0.07, 0, 0.3); });
    crash(tb(124), 0.5);
    pad(bar(32), CH.Db.v, BAR - 0.05, 0.07, 2500, 0.2); pad(bar(33), CH.Eb.v, BAR - 0.3, 0.075, 3500, 0.1);
    bass808(bar(32), 37, BAR * 0.95, 29, 0.2, 0.8); bass808(bar(33), 39, BAR * 0.85, 37, 0.2, 0.85);
    for (let s = 0; s < 16; s += 2) hat(st(32, s), 0.35 + s * 0.015, false, 0.2);
    for (let s = 0; s < 12; s++) hat(st(33, s), 0.45 + s * 0.04, false, 0.2);
    for (let k = 0; k < 8; k++) snare(tb(128) + k * S16, 0.12 + k * 0.03, 0.15, true);
    for (let k = 0; k < 12; k++) snare(tb(130) + k * (B * 1.25) / 12, 0.4 + k * 0.055, 0.15, true);
    supersaw(bar(33), CH.Eb.v.concat([70, 75]), BAR - 0.35, { v: 0.06, a: 2.0, cut0: 700, cut1: 6000, open: 2.1, cutS: 6000, sus: 1, rel: 0.05 });
    const slam = tbA(title.slam);
    riser(tb(124), slam - 0.02, 1.25);
    revCymbal(slam, B * 1.2, 1);
    // THE SLAM (v2.1: b148 = 88.8 s): impact + braam + drop-out, ring out
    impact(slam, 1.35, 0.95); braam(slam, [41, 48], BAR * 1.1, 1.1); kick(slam, 1.2, true, 0.95); snare(slam, 1, 0.8); crash(slam, 1.1);
    supersaw(slam, [53, 56, 60, 65, 68, 72], BAR * 1.15, { v: 0.11, cut0: 4000, cut1: 8000, cutS: 2600, verb: 0.6, sus: 0.45, rel: 0.6 });
    bass808(slam, 29, B * 3.4, null, null, 1);
    hitText(slam + 0.005, 0.5);

    /* ---- v2.1 bars 39-40 (b152-159) + tail: end card. The hook outro, decaying; a clean ending by 97.8 s */
    impact(tb(136), 0.22);
    pad(bar(35), CH.Db.v.concat([72]), BAR, 0.05, 2200, 0.6); pad(bar(36), CH.Fm.v.concat([72]), BAR + B * 2, 0.045, 1800, 0.3);
    bass808(bar(35), 37, BAR * 0.9, null, null, 0.45); bass808(bar(36), 29, BAR * 1.2, 37, 0.3, 0.4);
    for (const [s, m, l] of HK.B1) hookNote(st(35, s), m, 0.62, (s % 6 - 2.5) * 0.08, { dec: 1.6, delay: 0.4, verb: 0.35 });
    for (const [s, m, l] of HK.B4.slice(0, 3)) hookNote(st(36, s), m, 0.6, 0, { dec: 1.6, delay: 0.4, verb: 0.35 });
    hookNote(st(36, 8), 72, 0.55, 0, { dec: 2.4, delay: 0.45, verb: 0.4 }); bell(st(36, 8), 77, 0.35); bell(st(36, 8), 65, 0.25);

    /* ---- per-cut accents + activity SFX (absolute times from the timeline) */
    BOFF = 0;
    let prevKind = null;
    const playStart = (TL.segments.find((s) => s.act === 'PLAY') || { b: -1 }).b;
    for (const sg of TL.segments) {
      const t = tbA(sg.b), key = sg.game || sg.clip;
      if (sg.act === 'PLAY' && sg.b !== playStart) cutAccent(t, 1);
      // the SFX lands on the clip's key moment: optional per-segment offset sfxF (frames) or sfxB (beats)
      if (sg.act === 'PLAY' && SFX[key]) SFX[key](t + (sg.sfxF != null ? sg.sfxF / TL.fps : (sg.sfxB || 0) * B));
      if (sg.kind === 'game' && prevKind === 'game' && sg.act === 'EXPLORE') whoosh(t, 0.4, 0.35, 1);
      prevKind = sg.kind;
    }
    for (const e of TL.sfx || []) { // optional extra cues from timeline.json
      const t = tbA(e.b);
      if (e.name === 'hit') hitText(t); else if (e.name === 'thunder') thunder(t, e.v || 1); else if (e.name === 'whoosh') whoosh(t, 0.5, e.v || 0.6, 1);
      else if (e.name === 'crash') crash(t, e.v || 0.6); else if (SFX[e.name]) SFX[e.name](t);
    }
    flushDucks();
  }

  /* ------------------------------------------------------------ loudness + limiter (post-render, in JS) */
  function biquadRun(x, b0, b1, b2, a1, a2) { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = x[i], o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o; } return y; }
  function kw(x) { // BS.1770 K-weighting @ 48 kHz
    return biquadRun(biquadRun(x, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585), 1, -2, 1, -1.99004745483398, 0.99007225036621);
  }
  function loudness(L, R, a, b, gated) { // integrated (gated) or plain K-weighted loudness of [a,b) seconds
    const i0 = Math.floor((a || 0) * SR), i1 = Math.min(L.length, Math.floor((b == null ? L.length / SR : b) * SR));
    const kl = kw(L.subarray(i0, i1)), kr = kw(R.subarray(i0, i1));
    const blk = Math.floor(0.4 * SR), hop = Math.floor(0.1 * SR), z = [];
    for (let s = 0; s + blk <= kl.length; s += hop) { let e = 0; for (let i = s; i < s + blk; i++) e += kl[i] * kl[i] + kr[i] * kr[i]; z.push(e / blk); }
    const lk = (m) => -0.691 + 10 * Math.log10(Math.max(1e-12, m));
    let zz = z.filter((m) => lk(m) > -70);
    if (gated !== false) { const rel = lk(zz.reduce((p, c) => p + c, 0) / Math.max(1, zz.length)) - 10; zz = zz.filter((m) => lk(m) > rel); }
    return lk(zz.reduce((p, c) => p + c, 0) / Math.max(1, zz.length));
  }
  function truePeakEnv(L, R) { // per-sample peak of the 4x-oversampled signal (windowed-sinc interpolation, BS.1770-style)
    const n = L.length, K = 16, C = [];
    for (let ph = 1; ph < 4; ph++) {
      const c = []; let sum = 0;
      for (let k = -K + 1; k <= K; k++) { const d = ph / 4 - k, w = Math.pow(0.5 * (1 + Math.cos(Math.PI * d / (K + 0.5))), 1.5), v = (Math.sin(Math.PI * d) / (Math.PI * d)) * w; c.push(v); sum += v; }
      C.push(c.map((v) => v / sum));
    }
    const env = new Float32Array(n);
    for (const x of [L, R]) for (let i = 0; i < n; i++) {
      let p = Math.abs(x[i]);
      if (i >= K && i < n - K) for (let ph = 0; ph < 3; ph++) { const c = C[ph]; let a = 0; for (let k = 0; k < 2 * K; k++) a += x[i - K + 1 + k] * c[k]; a = Math.abs(a); if (a > p) p = a; }
      if (p > env[i]) env[i] = p;
    }
    return env;
  }
  function limit(L, R, g, ceil, tpe) { // look-ahead true-peak limiter, returns new arrays + stats
    const n = L.length, LA = Math.floor(0.004 * SR), rel = 1 - Math.exp(-1 / (0.09 * SR));
    const req = new Float32Array(n);
    for (let i = 0; i < n; i++) { const p = tpe[i] * g; req[i] = p > ceil ? ceil / p : 1; }
    // forward-looking min over [i, i+LA] (monotonic deque)
    const m = new Float32Array(n), dq = new Int32Array(n); let h = 0, tl = 0, j = 0;
    for (let i = 0; i < n; i++) {
      while (j < n && j <= i + LA) { while (tl > h && req[dq[tl - 1]] >= req[j]) tl--; dq[tl++] = j; j++; }
      while (dq[h] < i) h++;
      m[i] = req[dq[h]];
    }
    // moving average over [i-LA, i] keeps every peak under the ceiling and smooths the attack
    const s = new Float32Array(n); let acc = 0;
    for (let i = 0; i < n; i++) { acc += m[i]; if (i > LA) acc -= m[i - LA - 1]; s[i] = acc / Math.min(i + 1, LA + 1); }
    const oL = new Float32Array(n), oR = new Float32Array(n);
    let r = 1, maxGR = 0, over1 = 0; const beatGR = [];
    for (let i = 0; i < n; i++) {
      r = s[i] < r ? s[i] : r + (s[i] - r) * rel;
      oL[i] = L[i] * g * r; oR[i] = R[i] * g * r;
      const gr = -20 * Math.log10(r); if (gr > maxGR) maxGR = gr; if (gr > 1) over1++;
      const bi = Math.floor(i / (B * SR)); if (!(beatGR[bi] >= gr)) beatGR[bi] = gr;
    }
    const worst = beatGR.map((v, b) => [b, v]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([b, v]) => 'b' + b + ':' + v.toFixed(1));
    return { L: oL, R: oR, maxGR, pctOver1dB: (100 * over1) / n, worst };
  }

  /* ------------------------------------------------------------ render + WAV */
  function wav16(L, R) {
    const n = L.length, ch = 2, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, SR, true);
    out.setUint32(28, SR * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const d = [L, R], dr = mulberry(77);
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, d[c][i] + (dr() - dr()) / 32768)); out.setInt16(o, Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), true); o += 2; }
    let s = ''; const u8 = new Uint8Array(out.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  window.renderTrailerAudio = async function (TL, opts) {
    opts = opts || {};
    const stats0 = {};
    const dur = (TL.totalBeats + (TL.tailBeats == null ? 3 : TL.tailBeats)) * B;
    ac = new OfflineAudioContext(2, Math.round(SR * dur), SR);
    rnd = mulberry(20032);
    NOISE = noiseBuf(10);
    BUS = {}; DUCKS = []; BDUCKS = []; BOFF = 0; WOW = null;
    makeBuses(!!opts.raw);
    if (opts.solo) { for (const k of ['drums', 'bass', 'synth', 'fx', 'sfx', 'lofi']) if (k !== opts.solo) BUS[k].gain.value = 0; BUS.verb.gain.value = 0; BUS.big.gain.value = 0; BUS.delay.gain.value = 0; }
    QUEUE = []; DEFER = true;
    arrange(TL);
    DEFER = false;
    QUEUE.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let qi = 0;
    const run = (until) => { while (qi < QUEUE.length && QUEUE[qi][0] < until) QUEUE[qi++][2](); };
    const WIN = (128 * 300) / SR, MARGIN = 0.5; // 0.8 s windows (whole render quanta)
    run(WIN + MARGIN);
    for (let k = 1; k * WIN < dur - 0.01; k++) { const ts = k * WIN; ac.suspend(ts).then(() => { run(ts + WIN + MARGIN); ac.resume(); }); }
    const buf = await ac.startRendering();
    stats0.voices = QUEUE.length;
    let L = buf.getChannelData(0), R = buf.getChannelData(1);
    const n = L.length;
    // edge fades: 3 ms in; the last 1.6 s eased to silence (reverb tails end cleanly at the frame)
    const fin = Math.floor(0.003 * SR), fo0 = Math.floor((dur - 1.6) * SR);
    for (let i = 0; i < fin; i++) { L[i] *= i / fin; R[i] *= i / fin; }
    for (let i = fo0; i < n; i++) { const x = (i - fo0) / (n - 1 - fo0), w = 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, x)); L[i] *= w; R[i] *= w; }
    const stats = Object.assign({ dur: +dur.toFixed(3) }, stats0);
    const ceil = Math.pow(10, CEIL_DB / 20);
    let samplePeak = 0; for (let i = 0; i < n; i++) samplePeak = Math.max(samplePeak, Math.abs(L[i]), Math.abs(R[i]));
    stats.prePeakDb = +(20 * Math.log10(samplePeak)).toFixed(2);
    stats.preLUFS = +loudness(L, R).toFixed(2);
    if (!opts.raw) { // gain to target loudness, look-ahead limit to the ceiling; iterate (limiting costs a little loudness)
      let g = Math.pow(10, (LUFS_TARGET - stats.preLUFS) / 20), res;
      const tpe = truePeakEnv(L, R);
      for (let it = 0; it < 4; it++) {
        res = limit(L, R, g, ceil, tpe);
        const l = loudness(res.L, res.R);
        if (Math.abs(l - LUFS_TARGET) < 0.05) break;
        g *= Math.pow(10, (LUFS_TARGET - l) / 20);
      }
      L = res.L; R = res.R;
      stats.gainDb = +(20 * Math.log10(g)).toFixed(2); stats.limiterMaxGRdB = +res.maxGR.toFixed(2); stats.limiterPctOver1dB = +res.pctOver1dB.toFixed(2); stats.limiterWorstBeats = res.worst.join(' ');
    }
    stats.LUFS = +loudness(L, R).toFixed(2);
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); stats.peakDb = +(20 * Math.log10(pk)).toFixed(2);
    { const e = truePeakEnv(L, R); let tp = 0; for (let i = 0; i < n; i++) if (e[i] > tp) tp = e[i]; stats.truePeakDb = +(20 * Math.log10(tp)).toFixed(2); }
    const secs = { prologue: [0, 12], reveal: [12, 20], explore: [20, 40], story: [40, 48], play: [48, 96], celebrate: [96, 116], survive: [116, 128], finale: [128, 140], title: [140, 148], slam: [148, 152], end: [152, 163] };
    stats.sections = {};
    for (const k in secs) {
      const [a, b] = secs[k], i0 = Math.floor(tb(a) * SR), i1 = Math.min(n, Math.floor(tb(b) * SR));
      let p = 0; for (let i = i0; i < i1; i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i]));
      stats.sections[k] = { lufs: +loudness(L, R, tb(a), tb(b), false).toFixed(1), peakDb: +(20 * Math.log10(Math.max(p, 1e-9))).toFixed(1) };
    }
    return { wav: opts.statsOnly ? null : wav16(L, R), stats };
  };
})();
