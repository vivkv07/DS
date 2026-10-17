/* NOSTALGIA — audio_instruments.js  (owner: instrument builder) — extends N.audio through N.audio.ext (see audio.js "extension API").
 * Physical-modelling / synthesis upgrade of every score instrument and drum kit. Names + call signatures are the
 * contract with src/audio_score.js:
 *   INST[name](ac, out, t, notes[midi], durSec, vel 0..1.3, ev, st)        KITS[kit][stroke](ac, out, t, vel, tuneHz)
 *
 * ---- INSTRUMENT NAMES (part cfg `inst:`) -------------------------------------------------------------------------
 *  Plucked / struck (pre-rendered JS physical models, 1 buffer source + 1 gain per note; meend = true pitch pull of the
 *  still-ringing string when ev.glide and the previous note is still sounding):
 *    sitar      jawari buzz (curved-bridge contact), gourd body, sympathetic taraf strings tuned to the raga's notes
 *               (the pitch classes the part has played) ring on after each note. ev.glide meend, ev.gamak, ev.krintan
 *    veena      deeper, rounder, big resonator; auto kampita gamaka on long notes (ev.gamak:false to disable)
 *    sarod      steel strings on a metal fingerboard + skin belly: nasal, metallic; slides (ev.glide)
 *    santoor    hammered, triple-strung (chorus beating), dispersive steel strings, trapezoid box
 *    tanpura    long buzzing jawari drone, shimmering moving overtone band, 2 polarisations; play Pa/Sa/Sa/Sa_low
 *    mandolin   double course, bright pick; ev.trem (or part cfg trem) = alternate-picked tremolo
 *    guitar     steel-string acoustic with body (air + top modes)
 *    harp       soft finger pluck, long sustain
 *    bass       plucked upright/electric (KS); short notes damp at the note end
 *    musicbox   comb-tine music box (cantilever tine modes + pin tick + box), for the title / ending coda
 *    glock, celesta, bell   modal bars / chimes (bell is a soft tubular chime, never a temple bell)
 *  Monophonic leads (one persistent voice per part: true legato, ~8-9 nodes for the whole phrase, not per note):
 *    bansuri    breathy bamboo flute: pitched breath noise, chiff, overblown brightness at high vel, breath vibrato
 *    shehnai    double reed, nasal formants, scoops, auto kan grace notes + fast gamak on long notes
 *    nadaswaram bigger, louder, brighter double reed (lower register)
 *    sarangi    bowed, vocal formants, bow noise, sympathetic shimmer (taraf), slow slides
 *    violin     filmi solo violin (body formants, wide vibrato)
 *    clarinet, trumpet, trombone (slow slide glides), tuba (puffy oompah, comic "SRI-KAN-TH!" motif),
 *    whistle, synlead, harmonium1 (mono harmonium with beating reeds)
 *  Polyphonic (chords):
 *    harmonium  bellows pumping wobble, beating double reeds, ev.stop 'bass'|'male'|'female'|'full' (default male+female)
 *    strings    filmi violin section: ensemble detune drift, bow attack, vibrato, body formants baked per note
 *    brass      Hyderabadi baraat band: trumpets + clarinets in unison, a bit out of tune, blatty attack
 *    choir      wordless ensemble "aah" (formants baked per note); choir_oo = soft "ooh"; ev.vowel 'a'|'o'|'u'|'e'
 *    calliope   fairground steam-organ (Numaish): pipe chiff, tremulant, slightly out-of-tune ranks
 *    pad, epiano, synbass, stab
 *
 * ---- EV OPTIONS (all optional; the compiler sets glide/trem, others may be set by the score/compiler) ------------
 *    glide:true  meend / slur from the previous note        trem:true  tremolo picking (plucked)
 *    gamak:true|false|depthSemis  oscillating ornament        kan:true|false  grace note from the upper neighbour
 *    krintan:true  pull-off flick (sitar/sarod)              bend:semis  start bent by this many semis and resolve
 *    vowel:'a'|'o'|'u'|'e' (choir)    stop:'bass'|'male'|'female'|'full' (harmonium)    vib:mul  vibrato depth multiplier
 *
 * ---- KITS + STROKES (part cfg `kit:`) ------------------------------------------------------------------------------
 *    tabla   dayan: na ta tin tun tu ti te ra re ri tit tet (+ 'tak')   bayan: ge ghe ga (gumki slight rise), geu (strong
 *            upward gumki), ged (downward), ka ke ki kat (dry)   combined: dha dhin dhi dhit dhet dhun   tuneHz = dayan Sa
 *    dholak  D (bass open), g (bass with gumki slide), t (treble slap), k (treble tip), c / chi (ring on shell),
 *            na tin (treble open), ge (=g), dha (D+t)
 *    dhol    D (dagga boom), t (tilli crack), R (roll), d (soft boom), dt (both)
 *    band    B bass drum, S snare, R snare roll, C cymbal crash, M mid drum, P tasha pop, p soft pop, T high crack
 *    dappu   D open boom, T slap, t light, R roll, k rim
 *    tasha   T crack, t light, R roll, D low pop
 *    marfa   B boom, b soft boom, k slap, t tap
 *    clap    x (ensemble clap, ~10 hands), X (big ensemble clap, ~18 hands), s (single clap)
 *    kit     k kick, s snare, h closed hat, o open hat, c clap, t tom, r rim, x crash, l low tom, f floor tom
 *    machine (90s 808/909) k s h o c t r x b(cowbell) l
 *    ghatam / matka   D (gumki bass, mouth), T open, t tap, k click, R roll
 */
(() => {
  'use strict';
  const N = window.N;
  const X = N.audio && N.audio.ext;
  if (!X) return;
  const P = X.P;
  const { osc0, gain, filt, mtof, rr, rnd, clamp, TAU } = P;
  const KSR = P.KS_RATE || 24000;
  const report = (w, e) => { try { N.err('audio.inst.' + w, e); } catch (e2) { /* ignore */ } };
  const db = (x) => Math.pow(10, x / 20);

  /* ============================================================ JS DSP toolkit (offline, sample loops) */
  // RBJ biquad -> [b0, b1, b2, a1, a2]; types lp hp bp (0 dB peak) pk (peaking, dB) ls hs (shelves)
  function bq(type, f, q, sr, gdb) {
    const w = (TAU * Math.min(f, sr * 0.45)) / sr, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * (q || 0.707)), A = Math.pow(10, (gdb || 0) / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === 'pk') { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
    else { // shelves (S = 1)
      const sq = 2 * Math.sqrt(A) * al, s = type === 'hs' ? -1 : 1;
      b0 = A * ((A + 1) - s * (A - 1) * cw + sq); b1 = s * 2 * A * ((A - 1) - s * (A + 1) * cw); b2 = A * ((A + 1) - s * (A - 1) * cw - sq);
      a0 = (A + 1) + s * (A - 1) * cw + sq; a1 = -s * 2 * ((A - 1) + s * (A + 1) * cw); a2 = (A + 1) + s * (A - 1) * cw - sq;
    }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  function runBq(d, c, from, to) { // transposed direct form II, in place
    const b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[3], a2 = c[4];
    let z1 = 0, z2 = 0;
    for (let i = from || 0, n = to || d.length; i < n; i++) { const x = d[i], y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; d[i] = y; }
    return d;
  }
  // filter list [[type, f, q, dB], ...] in series
  function chain(d, sr, list) { if (list) for (const f of list) runBq(d, bq(f[0], f[1], f[2], sr, f[3]), 0); return d; }
  function dcBlock(d, sr, hz) { const R = 1 - (TAU * (hz || 12)) / sr; let x1 = 0, y1 = 0; for (let i = 0; i < d.length; i++) { const y = d[i] - x1 + R * y1; x1 = d[i]; y1 = y; d[i] = y; } return d; }
  function peakOf(d) { let p = 1e-9; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; } return p; }
  // normalise to `pk`, ramp the first `fi` samples in, fade the last `fo` fraction out
  function finish(d, pk, fi, fo) {
    const g = pk / peakOf(d), n = d.length, ni = fi || 16, nf = Math.max(32, Math.floor(n * (fo || 0)));
    for (let i = 0; i < n; i++) { let v = d[i] * g; if (i < ni) v *= i / ni; if (i > n - nf) v *= (n - i) / nf; d[i] = v; }
    return d;
  }
  // trim trailing near-silence (keeps buffers small), with a short fade
  function trim(d, th) {
    let e = d.length - 1; th = th || 1e-4;
    while (e > 256 && Math.abs(d[e]) < th) e--;
    const n = Math.min(d.length, e + 128), o = d.subarray(0, n);
    for (let i = Math.max(0, n - 128); i < n; i++) o[i] *= (n - i) / 128;
    return o;
  }
  // exponentially decaying sine "mode" (rotating phasor: 4 mults/sample); fr(tSec) -> frequency multiplier (then sin per sample)
  function mode(d, sr, t0, f, amp, t60, att, fr) {
    if (f * (fr ? fr(0) : 1) >= sr * 0.46 || amp === 0) return;
    const n0 = Math.max(0, Math.floor(t0 * sr)), len = Math.min(d.length - n0, Math.ceil(Math.min(t60 * 1.05, 12) * sr));
    const r = Math.exp(-6.9078 / (t60 * sr)), na = Math.max(1, Math.floor((att || 0.0004) * sr));
    let e = amp;
    if (!fr) {
      const w = (TAU * f) / sr, c = Math.cos(w), s = Math.sin(w);
      let x = 1, y = 0;
      for (let i = 0; i < len; i++) { const nx = x * c - y * s; y = x * s + y * c; x = nx; d[n0 + i] += e * y * (i < na ? i / na : 1); e *= r; }
      return;
    }
    let ph = 0, ff = f * fr(0);
    for (let i = 0; i < len; i++) {
      if ((i & 15) === 0) ff = f * fr(i / sr);
      ph += (TAU * ff) / sr;
      d[n0 + i] += e * Math.sin(ph) * (i < na ? i / na : 1); e *= r;
    }
  }
  // noise burst: attack att, hold, exponential decay (time constant tc); color white|pink|brown; filters [[type,f,q,dB]]
  function noise(d, sr, t0, amp, tc, o) {
    o = o || {};
    const n0 = Math.max(0, Math.floor(t0 * sr)), hold = o.hold || 0, att = o.att || 0.0005;
    const len = Math.min(d.length - n0, Math.ceil((att + hold + tc * 7) * sr));
    if (len <= 0) return;
    const tmp = new Float32Array(len);
    let b = 0, p0 = 0, p1 = 0, p2 = 0;
    const na = Math.max(1, att * sr), nh = na + hold * sr, r = Math.exp(-1 / (tc * sr));
    let e = 1;
    for (let i = 0; i < len; i++) {
      let w = rnd() * 2 - 1;
      if (o.color === 'brown') { b = (b + 0.04 * w) / 1.04; w = b * 5; }
      else if (o.color === 'pink') { p0 = 0.997 * p0 + 0.029 * w; p1 = 0.985 * p1 + 0.032 * w; p2 = 0.95 * p2 + 0.048 * w; w = (p0 + p1 + p2 + 0.05 * w) * 2.2; }
      let env;
      if (i < na) env = i / na; else if (i < nh) env = 1; else { env = e; e *= r; }
      tmp[i] = w * env;
    }
    chain(tmp, sr, o.f);
    for (let i = 0; i < len; i++) d[n0 + i] += amp * tmp[i];
  }
  // 808-style metal: six detuned square waves -> filters, decaying (hats, cymbals, cowbell)
  function metal(d, sr, t0, amp, tc, freqs, filters, att) {
    const n0 = Math.floor(t0 * sr), len = Math.min(d.length - n0, Math.ceil(tc * 8 * sr));
    const tmp = new Float32Array(len), ph = freqs.map(() => rnd()), inc = freqs.map((f) => f / sr);
    const r = Math.exp(-1 / (tc * sr)), na = Math.max(1, (att || 0.0005) * sr);
    let e = 1;
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (let k = 0; k < ph.length; k++) { ph[k] += inc[k]; if (ph[k] >= 1) ph[k] -= 1; s += ph[k] < 0.5 ? 1 : -1; }
      tmp[i] = (s / ph.length) * e * (i < na ? i / na : 1); e *= r;
    }
    chain(tmp, sr, filters);
    for (let i = 0; i < len; i++) d[n0 + i] += amp * tmp[i];
  }
  // small room (Schroeder: 4 combs + 2 allpasses), mixed in place
  function room(d, sr, wet, rt) {
    const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((s) => Math.floor(s * sr)), aps = [0.005, 0.0017].map((s) => Math.floor(s * sr));
    const n = d.length, w = new Float32Array(n);
    for (const L of combs) {
      const fb = Math.pow(10, (-3 * L) / (rt * sr)), buf = new Float32Array(L);
      let k = 0, lp = 0;
      for (let i = 0; i < n; i++) { const y = buf[k]; lp = y * 0.6 + lp * 0.4; buf[k] = d[i] + lp * fb; w[i] += y * 0.25; if (++k >= L) k = 0; }
    }
    for (const L of aps) {
      const buf = new Float32Array(L);
      let k = 0;
      for (let i = 0; i < n; i++) { const b = buf[k], x = w[i] + b * 0.6; w[i] = b - x * 0.6; buf[k] = x; if (++k >= L) k = 0; }
    }
    for (let i = 0; i < n; i++) d[i] += w[i] * wet;
    return d;
  }

  /* ============================================================ string physical model (extended Karplus-Strong waveguide) */
  // One string: delay line + loss filter (one-pole, frequency-dependent decay) + dispersion allpasses (stiffness: upper
  // partials sharp, metallic) + Thiran tuning allpass + in-loop DC blocker + one-sided bridge contact ("jawari": a curved
  // bridge the string wraps onto while it is loud -> the sitar/tanpura buzz that keeps regenerating high partials).
  // The excitation is injected (pick / finger / hammer / sympathetic swell), shaped by the pluck position comb.
  function excitation(sr, f, o, vel) {
    const Pn = Math.max(2, Math.round(sr / f)), kind = o.exc || 'pick';
    let e;
    if (kind === 'hammer') { // felt/wood hammer: raised-cosine force pulse, contact time shorter when hit harder
      const w = Math.max(3, Math.round(sr * (o.hw || 0.0012) * (1.25 - 0.4 * vel)));
      e = new Float32Array(w + 4);
      for (let i = 0; i < w; i++) e[i] = 0.5 - 0.5 * Math.cos((TAU * i) / w) + (rnd() - 0.5) * 0.15;
    } else if (kind === 'swell') { // sympathetic: the string is driven softly by the bridge for ~0.1 s
      const n = Math.floor(sr * (o.swell || 0.12));
      e = new Float32Array(n);
      let s = 0;
      for (let i = 0; i < n; i++) { s += (rnd() * 2 - 1 - s) * 0.5; e[i] = s * Math.sin((Math.PI * i) / n) * 0.25; }
    } else { // pick (plectrum/mizrab) or soft (finger): one period of shaped noise + displacement bump
      e = new Float32Array(Pn);
      const k = (kind === 'soft' ? 0.18 : 0.45) + 0.45 * (o.bright == null ? 0.5 : o.bright) * (0.6 + 0.4 * vel);
      let s = 0;
      for (let i = 0; i < Pn; i++) { s += (rnd() * 2 - 1 - s) * Math.min(1, k); e[i] = s + (kind === 'soft' ? 1.4 : 0.7) * Math.sin((Math.PI * i) / Pn); }
      if (kind === 'soft') { s = 0; for (let i = 0; i < Pn; i++) { s += (e[i] - s) * 0.5; e[i] = s; } }
    }
    if (o.pos) { // pluck/strike position: comb notch at harmonics of 1/pos
      const D = Math.max(1, Math.round(Pn * o.pos)), c = new Float32Array(e.length + D);
      for (let i = 0; i < c.length; i++) c[i] = (i < e.length ? e[i] : 0) - (i >= D && i - D < e.length ? e[i - D] : 0);
      e = c;
    }
    let m = 0;
    for (let i = 0; i < e.length; i++) m += e[i];
    m /= e.length;
    for (let i = 0; i < e.length; i++) e[i] -= m * Math.sin((Math.PI * i) / e.length) * 1.57;
    const pk = peakOf(e);
    for (let i = 0; i < e.length; i++) e[i] /= pk;
    return e;
  }
  const apPhaseDelay = (a, w) => { // first-order allpass (a + z^-1)/(1 + a z^-1)
    const ph = Math.atan2(-Math.sin(w), a + Math.cos(w)) - Math.atan2(-a * Math.sin(w), 1 + a * Math.cos(w));
    let d = -ph / w; if (d < 0) d += TAU / w; return d;
  };
  function stringInto(out, sr, f, o, vel, amp) {
    const len = out.length, L = sr / f, w0 = (TAU * f) / sr;
    const p = clamp(o.lp == null ? 0.2 : o.lp, 0, 0.95);
    const lossD = Math.atan2(p * Math.sin(w0), 1 - p * Math.cos(w0)) / w0;
    const lossMag = (1 - p) / Math.hypot(1 - p * Math.cos(w0), p * Math.sin(w0));
    const t60 = (o.t60 || 2) * Math.pow(220 / f, o.t60k == null ? 0.3 : o.t60k);
    const g = Math.min(0.99995, Math.pow(10, -3 / (t60 * f)) / lossMag);
    const nd = o.disp ? o.nd || 2 : 0, ad = o.disp || 0, dispD = nd ? apPhaseDelay(ad, w0) : 0;
    const rem = L - lossD - nd * dispD;
    const Ni = Math.max(2, Math.floor(rem - 0.5)), dd = rem - Ni, C = (1 - dd) / (1 + dd);
    const dl = new Float32Array(Ni), ex = excitation(sr, f, o, vel);
    const ax = new Float32Array(nd), ay = new Float32Array(nd);
    const jaw = o.jaw, th = o.th || 0.2, jr = o.jawRise || 0, jm = o.jm || 0;
    let cprev = 0;
    let idx = 0, lp = 0, tx = 0, ty = 0, dx = 0, dy = 0, thr = th;
    const R = 1 - (TAU * 4) / sr;
    for (let i = 0; i < len; i++) {
      const x = dl[idx];
      lp = g * (1 - p) * x + p * lp;
      let v = lp;
      for (let s = 0; s < nd; s++) { const y = ad * v + ax[s] - ad * ay[s]; ax[s] = v; ay[s] = y; v = y; }
      let Cc = C;
      if (jm && cprev > 0) { const dc = Math.max(0.45, dd - jm * cprev); Cc = (1 - dc) / (1 + dc); } // contact shortens the string
      const y = Cc * v + tx - Cc * ty; tx = v; ty = y; v = y;
      const hp = v - dx + R * dy; dx = v; dy = hp; v = hp;
      if (jaw) { // one-sided contact with the curved bridge: the part beyond the bridge profile is folded back
        const c = v - thr;
        cprev = c > 0 ? c : 0;
        if (c > 0) v = thr + c * jaw;
        if (jr) thr += jr / sr;
      }
      if (i < ex.length) v += ex[i];
      dl[idx] = v;
      out[i] += v * amp;
      if (++idx >= Ni) idx = 0;
    }
  }
  // Instruments made of strings. strings: [[cents, amp], ...] (courses / polarisations), body: filter list (gourd, box, skin)
  const KSD = {
    sitar: { dur: 3.0, t60: 4.5, t60k: 0.35, lp: 0.1, disp: -0.18, nd: 2, exc: 'pick', pos: 0.11, bright: 0.55, jaw: 0.4, th: 0.1, jm: 1,
      body: [['hp', 85, 0.7], ['pk', 185, 1.3, 5], ['pk', 560, 1.6, 2], ['pk', 1250, 2, 4], ['pk', 2900, 1.5, 6], ['pk', 5200, 1.2, 3]], vol: 0.62, mono: true, taraf: 0.24, ring: 1.0 },
    veena: { dur: 3.0, t60: 3.2, t60k: 0.3, lp: 0.34, disp: -0.1, nd: 1, exc: 'pick', pos: 0.16, bright: 0.45, jaw: 0.6, th: 0.2, jm: 0.6,
      body: [['hp', 50, 0.7], ['pk', 105, 1.1, 6], ['pk', 240, 1.3, 4], ['pk', 650, 1.6, 2], ['lp', 5200, 0.6]], vol: 0.66, mono: true, gamak: 1, taraf: 0.1, ring: 1.2 },
    sarod: { dur: 2.0, t60: 1.5, t60k: 0.4, lp: 0.07, disp: -0.32, nd: 3, exc: 'pick', pos: 0.08, bright: 0.9,
      body: [['hp', 140, 0.7], ['pk', 820, 1.3, 7], ['pk', 2100, 2, 6], ['pk', 4200, 2, 3], ['pk', 300, 1, -3]], vol: 0.6, mono: true, taraf: 0.14, ring: 0.8 },
    santoor: { dur: 2.3, t60: 2.4, t60k: 0.45, lp: 0.12, disp: -0.42, nd: 3, exc: 'hammer', hw: 0.0009, pos: 0.115, strings: [[0, 1], [3.2, 0.85], [-2.4, 0.7]],
      body: [['hp', 120, 0.7], ['pk', 300, 1.4, 3], ['pk', 760, 1.5, 3], ['pk', 2300, 1.6, 2], ['hs', 6000, 0.7, -5]], vol: 0.52, ring: 1.1 },
    tanpura: { dur: 5.2, t60: 7, t60k: 0.25, lp: 0.1, disp: -0.06, nd: 1, exc: 'soft', pos: 0.21, bright: 0.6, jaw: 0.6, th: 0.03, jm: 1, jawRise: 0.004, strings: [[0, 1], [1.4, 0.75]],
      body: [['hp', 60, 0.7], ['pk', 150, 1, 5], ['pk', 420, 1.4, 3], ['pk', 1050, 1.3, 3], ['pk', 2600, 1, 4]], vol: 0.5, ring: 3.2 },
    mandolin: { dur: 1.5, t60: 1.1, t60k: 0.3, lp: 0.12, disp: -0.22, nd: 2, exc: 'pick', pos: 0.1, bright: 0.85, strings: [[0, 1], [4, 0.9]],
      body: [['hp', 160, 0.7], ['pk', 360, 1.5, 4], ['pk', 1150, 2, 3], ['pk', 3100, 2, 3]], vol: 0.55, ring: 0.3 },
    guitar: { dur: 2.3, t60: 2.4, t60k: 0.4, lp: 0.26, disp: -0.12, nd: 1, exc: 'pick', pos: 0.17, bright: 0.5,
      body: [['hp', 70, 0.7], ['pk', 102, 1.6, 6], ['pk', 215, 1.6, 4], ['pk', 430, 2, 2], ['pk', 2500, 1.4, 2]], vol: 0.6, ring: 0.6 },
    harp: { dur: 2.8, t60: 3.0, t60k: 0.35, lp: 0.33, exc: 'soft', pos: 0.4, bright: 0.4,
      body: [['hp', 60, 0.7], ['pk', 240, 1, 3], ['lp', 5500, 0.6]], vol: 0.55, ring: 1.4 },
    bass: { dur: 1.9, t60: 2.2, t60k: 0.2, lp: 0.55, exc: 'soft', pos: 0.22, bright: 0.3,
      body: [['hp', 35, 0.7], ['pk', 95, 1, 3], ['lp', 2400, 0.7]], vol: 0.72, mono: true, ring: 0.06 },
    // sympathetic (taraf) strings: excited by the bridge, not plucked -> slow swell, long ring, light buzz
    taraf: { dur: 3.0, t60: 3.6, t60k: 0.2, lp: 0.12, disp: -0.15, nd: 1, exc: 'swell', swell: 0.09, jaw: 0.6, th: 0.03, jm: 1,
      body: [['hp', 200, 0.7], ['pk', 1250, 2, 3], ['pk', 2900, 1.5, 5], ['pk', 5200, 1.2, 3]] },
    taraf2: { dur: 2.6, t60: 3.0, t60k: 0.2, lp: 0.2, exc: 'swell', swell: 0.14, body: [['hp', 200, 0.7], ['pk', 1800, 1.5, 3], ['lp', 6000, 0.7]] },
  };
  function renderStringInst(def, f) {
    const sr = KSR, out = new Float32Array(Math.floor(def.dur * sr));
    for (const s of def.strings || [[0, 1]]) stringInto(out, sr, f * Math.pow(2, s[0] / 1200), def, 1, s[1]);
    dcBlock(out, sr, 20);
    chain(out, sr, def.body);
    return finish(out, 0.8, 12, 0.2);
  }

  /* ============================================================ modal (struck bars / tines) */
  const MODAL = {
    // comb-tine music box: clamped-free cantilever modes 1 : 6.27 : 17.55, pin tick, small box
    musicbox: { dur: 2.6, modes: [[1, 1, 2.6], [6.267, 0.22, 0.45], [17.55, 0.05, 0.12], [2.0, 0.02, 1.2]], tick: [0.12, 5200], body: [['pk', 520, 1.2, 3], ['pk', 1400, 1.5, 2], ['hp', 180, 0.7]], vol: 0.5, beat: 1.6 },
    glock: { dur: 2.4, modes: [[1, 1, 2.1], [2.756, 0.2, 0.55], [5.404, 0.07, 0.22], [8.933, 0.03, 0.1]], tick: [0.18, 6000], body: [['hp', 200, 0.7]], vol: 0.5 },
    celesta: { dur: 2.2, modes: [[1, 1, 1.9], [2.0, 0.05, 0.6], [2.756, 0.12, 0.3], [5.404, 0.03, 0.12]], tick: [0.05, 3000], att: 0.002, body: [['pk', 600, 1, 3], ['hp', 150, 0.7], ['lp', 7000, 0.7]], vol: 0.52 },
    // soft tubular chime (not a temple bell): free-free bar partials, strike tone around the 4th-6th partials
    bell: { dur: 3.4, modes: [[1, 0.55, 3.2], [2.756, 0.45, 2.2], [5.404, 0.3, 1.3], [8.933, 0.16, 0.7], [13.34, 0.06, 0.35]], tick: [0.08, 3500], att: 0.0015, body: [['hp', 150, 0.7], ['lp', 8000, 0.7]], vol: 0.42 },
  };
  function renderModal(def, f) {
    const sr = KSR, out = new Float32Array(Math.floor(def.dur * sr));
    const tk = Math.pow(220 / f, 0.25);
    for (const m of def.modes) {
      const amp = m[1] * rr(0.9, 1.1);
      mode(out, sr, 0, f * m[0], amp, m[2] * tk, def.att);
      if (def.beat && m[0] === 1) mode(out, sr, 0, f * Math.pow(2, def.beat / 1200), amp * 0.35, m[2] * tk * 0.8, def.att);
    }
    if (def.tick) noise(out, sr, 0, def.tick[0], 0.0015, { f: [['bp', def.tick[1], 1.2]] });
    chain(out, sr, def.body);
    return finish(out, 0.8, 8, 0.25);
  }

  /* ============================================================ pre-rendered note buffers (cache + idle warm-up) */
  // One AudioBuffer (KS_RATE, mono) per instrument per 2 semitones; playbackRate covers the odd semitone, meend and
  // ornaments. AudioBuffers are context-independent, so live and offline contexts share them. LRU-capped.
  const NB = new Map();
  const NB_MAX = 110;
  const stats = { renders: 0, renderMs: 0, maxMs: 0 };
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  function noteBuf(ac, inst, anchor) {
    const key = inst + ':' + anchor;
    let b = NB.get(key);
    if (b) { NB.delete(key); NB.set(key, b); return b; }
    const t0 = now();
    const data = MODAL[inst] ? renderModal(MODAL[inst], mtof(anchor)) : renderStringInst(KSD[inst], mtof(anchor));
    b = ac.createBuffer(1, data.length, KSR);
    if (b.copyToChannel) b.copyToChannel(data, 0); else b.getChannelData(0).set(data);
    const ms = now() - t0;
    stats.renders++; stats.renderMs += ms; stats.maxMs = Math.max(stats.maxMs, ms);
    NB.set(key, b);
    if (NB.size > NB_MAX) NB.delete(NB.keys().next().value);
    return b;
  }
  const anchorOf = (m) => m - (((m % 2) + 2) % 2);
  // Warm-up: when a sequence starts (music, radio, walkman), queue the plucked/struck notes it uses and render a few
  // per frame (<= ~4 ms per frame) so the first bars never stall the scheduler.
  const warmQ = [], warmSeen = new Set(), warmKeys = new Set();
  function warmTrack(c) {
    if (!c || warmSeen.has(c.id)) return;
    warmSeen.add(c.id);
    const evs = c.events || [];
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (!e) continue;
      for (const ev of e) {
        const cfg = c.parts && c.parts[ev.part], inst = cfg && cfg.inst;
        if (!inst || !ev.notes) continue;
        const kind = PLUCK[inst] ? PLUCK[inst].buf : MODAL[inst] ? inst : null;
        if (!kind) continue;
        for (const m of ev.notes) { const k = kind + ':' + anchorOf(m); if (!warmKeys.has(k)) { warmKeys.add(k); warmQ.push([kind, anchorOf(m)]); } }
      }
    }
  }
  X.onUpdate('instruments.warm', () => {
    const ac = X.ctx;
    if (!ac) return;
    try {
      const I = N.audio._internal;
      if (I && I.liveSeqs) for (const s of I.liveSeqs) warmTrack(s.c);
      if (!warmSeen.size && I && I.compile && I.TRACKS && I.TRACKS.title) warmTrack(I.compile('title'));
    } catch (e) { /* tracks not ready */ }
    const t0 = now();
    while (warmQ.length && now() - t0 < 4) { const j = warmQ.shift(); try { noteBuf(ac, j[0], j[1]); } catch (e) { report('warm', e); break; } }
  }, 50);

  /* ============================================================ plucked / struck player */
  // PLUCK[name] = { buf: model name, vol, mono (one string: a new note damps the last; meend pulls the ringing string),
  //   taraf (sympathetic level), gamak (auto kampita depth on long notes), ring (s of ring after the note) }
  const PLUCK = {};
  for (const k in KSD) if (!/^taraf/.test(k)) PLUCK[k] = { buf: k, vol: KSD[k].vol, mono: KSD[k].mono, taraf: KSD[k].taraf, gamak: KSD[k].gamak, ring: KSD[k].ring };
  for (const k in MODAL) PLUCK[k] = { buf: k, vol: MODAL[k].vol, ring: 2.5 };

  function startBuf(ac, out, t, kind, midi, vel, o) {
    const anchor = anchorOf(midi), buf = noteBuf(ac, kind, anchor);
    const rate = Math.pow(2, (midi - anchor) / 12 + (o.cents || 0) / 1200);
    const src = ac.createBufferSource(); src.buffer = buf;
    const g = gain(ac, 0, out);
    g.gain.setValueAtTime(vel, t);
    src.connect(g); src.start(t);
    return { src, g, t0: t, rate, anchor, buf, maxRate: rate, vel };
  }
  // schedule the end of a ringing string: ring out until `until` (bounded by the buffer), then damp
  function ringTo(v, until, damp) {
    const used = (v.tUsed || 0), left = v.buf.duration - used;
    const end = Math.min(until, v.tRef + left / Math.max(0.25, v.maxRate) - 0.03);
    v.decayAt = Math.max(v.tRef + 0.02, end);
    v.g.gain.setTargetAtTime(0, v.decayAt, damp || 0.05);
    v.stopAt = v.decayAt + (damp || 0.05) * 7;
    v.src.stop(v.stopAt);
  }
  function damp(v, t, tc) {
    if (!v || t >= v.stopAt) return;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setTargetAtTime(0, t, tc || 0.025);
    v.stopAt = t + (tc || 0.025) * 8;
    v.src.stop(v.stopAt);
  }
  function ornaments(pr, t, dur, rate, ev, d) {
    if (ev.krintan) { pr.setValueAtTime(rate * Math.pow(2, 2 / 12), t); pr.setValueAtTime(rate, t + 0.05); }
    if (ev.bend) { pr.setValueAtTime(rate * Math.pow(2, ev.bend / 12), t); pr.setTargetAtTime(rate, t + 0.02, 0.07); }
    const gm = ev.gamak === false ? 0 : ev.gamak === true ? 1 : typeof ev.gamak === 'number' ? ev.gamak : d.gamak && dur >= 0.85 ? d.gamak : 0;
    if (gm && dur > 0.3) { // kampita: oscillate up to the upper note and back (~5.5 /s)
      const per = 0.18, ts = t + Math.min(0.35, dur * 0.3), te = t + dur * 0.92, up = rate * Math.pow(2, gm / 12);
      let k = 0;
      for (let tt = ts; tt < te - per / 2; tt += per / 2, k++) pr.setTargetAtTime(k % 2 ? rate : up, tt, per / 7);
      pr.setTargetAtTime(rate, te, 0.03);
    }
  }
  // sympathetic strings: tuned to the raga = the pitch classes this part has played; a played note (and its fifth, the
  // 3rd harmonic) excites the matching taraf string, which keeps ringing after the note is damped.
  function taraf(ac, out, t, midi, vel, st, lvl, kind) {
    const pc = ((midi % 12) + 12) % 12;
    const raga = st.raga || (st.raga = new Array(12).fill(0));
    raga[pc]++;
    const tr = st.tar || (st.tar = {});
    for (const [c, a] of [[pc, 1], [(pc + 7) % 12, 0.45]]) {
      if (!raga[c]) continue;
      const old = tr[c];
      if (old && t - old.t0 < 0.35) continue;
      const tm = 62 + ((c - 2 + 12) % 12);
      const v = startBuf(ac, out, t + 0.005, kind || 'taraf', tm, vel * lvl * a, {});
      v.tRef = t; ringTo(v, t + 2.6, 0.3);
      if (old) damp(old, t + 0.05, 0.12);
      tr[c] = v;
    }
  }
  function plucker(name) {
    const d = PLUCK[name];
    return (ac, out, t, notes, dur, vel, ev, st) => {
      ev = ev || {}; st = st || {};
      const ring = d.ring == null ? 0.8 : d.ring, vv = vel * d.vol;
      if (ev.trem) { // alternate picking; each stroke interrupts the last
        for (const m of notes) {
          let prev = null, k = 0;
          for (let tt = 0; tt < dur - 0.03; tt += 0.064, k++) {
            if (prev) damp(prev, t + tt, 0.012);
            prev = startBuf(ac, out, t + tt + rr(0, 0.004), d.buf, m, vv * (k % 2 ? 0.62 : 0.86) * rr(0.92, 1.05) / Math.sqrt(notes.length), { cents: rr(-3, 3) });
            prev.tRef = t + tt;
          }
          if (prev) ringTo(prev, t + dur + ring, 0.06);
        }
        st.lastMidi = notes[notes.length - 1];
        return;
      }
      if (d.mono) {
        const midi = notes[notes.length - 1], pv = st.pv;
        const live = pv && pv.ac === ac && pv.decayAt > t + 0.01 && pv.decayAt > ac.currentTime + 0.01;
        if (ev.glide && live && Math.abs(midi - st.lastMidi) <= 7) { // meend: pull the ringing string to the new note
          const nr = Math.pow(2, (midi - pv.anchor) / 12), pr = pv.src.playbackRate, gl = clamp(dur * 0.4, 0.08, 0.32);
          pr.cancelScheduledValues(t); pr.setValueAtTime(pv.rate, t); pr.exponentialRampToValueAtTime(nr, t + gl);
          pv.tUsed = (pv.tUsed || 0) + (t - pv.tRef) * pv.maxRate; pv.tRef = t;
          pv.rate = nr; pv.maxRate = Math.max(pv.rate, nr);
          ornaments(pr, t + gl, Math.max(0, dur - gl), nr, Object.assign({}, ev, { krintan: false, bend: 0 }), d);
          pv.g.gain.cancelScheduledValues(t);
          ringTo(pv, t + dur + ring, 0.05);
          if (d.taraf) taraf(ac, out, t + gl, midi, vel * 0.6, st, d.taraf, d.buf === 'sitar' ? 'taraf' : 'taraf2');
          st.lastMidi = midi;
          return;
        }
        if (live) damp(pv, t, 0.02);
        const v = startBuf(ac, out, t, d.buf, midi, vv * rr(0.95, 1.03), { cents: rr(-2, 2) });
        v.ac = ac; v.tRef = t;
        const pr = v.src.playbackRate;
        if (ev.glide && st.lastMidi != null && st.lastMidi !== midi) { // slide into the note from the last one (re-plucked)
          pr.setValueAtTime(v.rate * Math.pow(2, (st.lastMidi - midi) / 12), t);
          pr.exponentialRampToValueAtTime(v.rate, t + clamp(dur * 0.3, 0.05, 0.2));
          v.maxRate = Math.max(v.rate, v.rate * Math.pow(2, (st.lastMidi - midi) / 12));
        } else pr.setValueAtTime(v.rate, t);
        ornaments(pr, t, dur, v.rate, ev, d);
        if (ev.krintan || ev.bend > 0) v.maxRate *= 1.13;
        ringTo(v, t + dur + ring, 0.05);
        st.pv = v;
        if (d.taraf && dur >= 0.1) taraf(ac, out, t, midi, vel, st, d.taraf, d.buf === 'sitar' ? 'taraf' : 'taraf2');
        st.lastMidi = midi;
        return;
      }
      // polyphonic strings / bars (chords strum slightly)
      notes.forEach((m, i) => {
        const tt = t + (notes.length > 1 ? i * rr(0.008, 0.016) : 0);
        const v = startBuf(ac, out, tt, d.buf, m, vv * rr(0.94, 1.03) / Math.sqrt(Math.max(1, notes.length * 0.7)), { cents: rr(-2, 2) });
        v.tRef = tt;
        const pr = v.src.playbackRate;
        if (ev.glide && st.lastMidi != null && notes.length === 1 && st.lastMidi !== m) {
          pr.setValueAtTime(v.rate * Math.pow(2, (st.lastMidi - m) / 12), tt); pr.exponentialRampToValueAtTime(v.rate, tt + 0.08);
          v.maxRate = Math.max(v.rate, v.rate * Math.pow(2, (st.lastMidi - m) / 12));
        } else pr.setValueAtTime(v.rate, tt);
        ringTo(v, tt + dur + ring, 0.06);
      });
      st.lastMidi = notes[notes.length - 1];
    };
  }

  /* ============================================================ monophonic leads (one persistent voice per part) */
  // Voice = osc (instrument harmonic table) [+ beating twin] -> fixed body/formant filters -> amp; looping noise ->
  // filter -> breath gain (+ optional pitch-jitter send for bow/reed roughness); one vibrato LFO -> pitch (+ amplitude).
  // ~8-11 nodes for a whole phrase: notes are pitch/gain automation on the same voice (true legato, no re-attack).
  const HW = (n, fn) => Array.from({ length: n }, (_, i) => fn(i + 1));
  const WV = {
    i_bansuri: [1, 0.42, 0.15, 0.075, 0.04, 0.022, 0.012, 0.006],
    i_shehnai: HW(26, (n) => Math.pow(n, -0.32) * (n % 2 ? 1 : 0.78) * (n === 2 ? 0.7 : 1)),
    i_nadaswaram: HW(26, (n) => Math.pow(n, -0.26) * (n % 2 ? 1 : 0.85)),
    i_clarinet: [1, 0.05, 0.72, 0.04, 0.46, 0.05, 0.3, 0.04, 0.21, 0.04, 0.13, 0.03, 0.08, 0.03, 0.05, 0.02],
    i_brass: HW(18, (n) => Math.pow(n, -0.45) * Math.exp(-n / 14)),
    i_tuba: [1, 0.72, 0.46, 0.28, 0.17, 0.1, 0.06, 0.035, 0.02],
    i_bow: HW(32, (n) => Math.pow(n, -0.95) * (1 + 0.25 * Math.sin(n * 2.3))),
    i_sarangi: HW(30, (n) => Math.pow(n, -0.8) * (1 + 0.3 * Math.sin(n * 1.7))),
    i_whistle: [1, 0.025, 0.01],
    i_pipe: [1, 0.32, 0.12, 0.05, 0.025],
  };
  for (const k in WV) P.WAVES[k] = WV[k];
  const LEAD = {
    bansuri: { wave: 'i_bansuri', a: 0.06, sus: 0.86, r: 0.16, v: 0.3, vib: [4.9, 0.0055], vibA: 0.1, vibDelay: 0.28, glide: 0.1, leg: 0.022, scoop: 0.3, legato: true,
      dyn: (v, t, f, vel) => v.fs[0].frequency.setTargetAtTime(Math.min(9000, f * (2.2 + 4 * vel)), t, 0.03), filters: [['lowpass', 2000, 0.5]],
      noise: { kind: 'pink', type: 'bandpass', q: 0.9, f: (f) => f * 2.2, lvl: 0.055, chiff: 5 } },
    shehnai: { wave: 'i_shehnai', a: 0.03, sus: 0.92, r: 0.09, v: 0.21, vib: [6.2, 0.009], vibDelay: 0.22, glide: 0.11, leg: 0.03, scoop: 0.8, legato: true, kan: true, gamak: 1,
      filters: [['peaking', 1250, 1.4, 7], ['peaking', 3100, 1.8, 6], ['lowpass', 6500, 0.7]], jit: 0.004,
      noise: { kind: 'white', type: 'bandpass', q: 0.8, f: (f) => Math.min(8000, f * 5), lvl: 0.012, chiff: 3 } },
    nadaswaram: { wave: 'i_nadaswaram', a: 0.04, sus: 0.94, r: 0.11, v: 0.21, vib: [5.6, 0.008], vibDelay: 0.25, glide: 0.13, leg: 0.035, scoop: 1.1, legato: true, kan: true, gamak: 1,
      filters: [['peaking', 950, 1.2, 7], ['peaking', 2400, 1.5, 6], ['lowpass', 7000, 0.7]], jit: 0.004,
      noise: { kind: 'white', type: 'bandpass', q: 0.8, f: (f) => Math.min(8000, f * 4), lvl: 0.014, chiff: 3 } },
    clarinet: { wave: 'i_clarinet', a: 0.035, sus: 0.86, r: 0.1, v: 0.24, vib: [5.2, 0.0035], vibDelay: 0.35, glide: 0.07, leg: 0.02, scoop: 0.25, legato: true,
      filters: [['lowpass', 2900, 0.7]], dyn: (v, t, f, vel) => v.fs[0].frequency.setTargetAtTime(Math.min(8000, 1500 + f * 2 + 2200 * vel), t, 0.03),
      noise: { kind: 'pink', type: 'bandpass', q: 0.7, f: (f) => f * 3, lvl: 0.012, chiff: 2 } },
    trumpet: { wave: 'i_brass', a: 0.025, sus: 0.82, r: 0.08, v: 0.22, vib: [5.6, 0.0045], vibDelay: 0.3, glide: 0.06, leg: 0.02, scoop: 1.0, filters: [['lowpass', 2500, 0.9], ['peaking', 1300, 1.2, 4]],
      dyn: (v, t, f, vel, dur, slur) => { const fr = v.fs[0].frequency, top = Math.min(9000, 1400 + 3200 * vel); if (!slur) { fr.setTargetAtTime(top * 1.5, t, 0.01); fr.setTargetAtTime(top, t + 0.04, 0.06); } else fr.setTargetAtTime(top, t, 0.04); fr.setTargetAtTime(top * 0.75, t + dur * 0.6, 0.3); },
      noise: { kind: 'pink', type: 'bandpass', q: 0.8, f: (f) => f * 4, lvl: 0.008, chiff: 4 } },
    trombone: { wave: 'i_brass', a: 0.04, sus: 0.85, r: 0.12, v: 0.24, vib: [5.0, 0.004], vibDelay: 0.4, glide: 0.16, leg: 0.06, scoop: 1.2, legato: true, slide: true,
      filters: [['lowpass', 1500, 0.9], ['peaking', 650, 1.2, 3]],
      dyn: (v, t, f, vel, dur, slur) => { const fr = v.fs[0].frequency, top = Math.min(6000, 600 + 1900 * vel); if (!slur) { fr.setTargetAtTime(top * 1.6, t, 0.012); fr.setTargetAtTime(top, t + 0.05, 0.07); } else fr.setTargetAtTime(top, t, 0.05); },
      noise: { kind: 'pink', type: 'bandpass', q: 0.8, f: (f) => f * 3, lvl: 0.008, chiff: 4 } },
    tuba: { wave: 'i_tuba', a: 0.03, sus: 0.7, r: 0.09, v: 0.34, vib: [4.6, 0.003], vibDelay: 0.5, glide: 0.09, leg: 0.04, scoop: 0.9, scoopT: 0.025, filters: [['lowpass', 700, 0.9], ['peaking', 240, 1.2, 3]], dip: 0.05,
      dyn: (v, t, f, vel, dur, slur) => { const fr = v.fs[0].frequency, top = Math.min(3000, 380 + f * 2.5 + 700 * vel); if (!slur) { fr.setTargetAtTime(top * 1.8, t, 0.01); fr.setTargetAtTime(top, t + 0.03, 0.05); } else fr.setTargetAtTime(top, t, 0.04); },
      noise: { kind: 'brown', type: 'lowpass', q: 0.7, f: () => 500, lvl: 0.03, chiff: 4 } },
    violin: { wave: 'i_bow', a: 0.09, sus: 0.9, r: 0.2, v: 0.2, vib: [5.8, 0.0085], vibDelay: 0.18, glide: 0.12, leg: 0.025, scoop: 0.25, legato: true, jit: 0.003, dip: 0.6,
      filters: [['peaking', 285, 1.5, 4], ['peaking', 2900, 1.1, 7], ['lowpass', 7000, 0.7]],
      noise: { kind: 'white', type: 'highpass', q: 0.7, f: () => 2600, lvl: 0.02, chiff: 2.5 } },
    sarangi: { wave: 'i_sarangi', a: 0.1, sus: 0.92, r: 0.22, v: 0.21, vib: [5.0, 0.011], vibDelay: 0.25, glide: 0.18, leg: 0.05, scoop: 0.6, legato: true, jit: 0.0035, dip: 0.6, kan: true,
      filters: [['peaking', 640, 1.3, 7], ['peaking', 2350, 1.5, 6], ['lowpass', 6000, 0.7]], taraf: 0.22,
      noise: { kind: 'white', type: 'bandpass', q: 0.6, f: () => 3200, lvl: 0.018, chiff: 2 } },
    whistle: { wave: 'i_whistle', a: 0.03, sus: 0.9, r: 0.08, v: 0.3, vib: [5.6, 0.008], vibDelay: 0.15, glide: 0.06, leg: 0.02, scoop: 0.5,
      noise: { kind: 'white', type: 'bandpass', q: 1.5, f: (f) => f * 1.05, lvl: 0.03, chiff: 2 } },
    synlead: { type: 'square', a: 0.008, sus: 0.8, r: 0.12, v: 0.15, vib: [5.8, 0.006], vibDelay: 0.25, glide: 0.07, leg: 0.03, legato: true,
      filters: [['lowpass', 2400, 3]], dyn: (v, t, f, vel, dur, slur) => { const fr = v.fs[0].frequency; if (!slur) fr.setValueAtTime(Math.min(9000, f * 9 * (0.6 + 0.6 * vel)), t); fr.setTargetAtTime(Math.min(6000, f * 3.5), t + 0.01, 0.12); } },
    harmonium1: { wave: 'harmonium', beat: 7, a: 0.03, sus: 0.95, r: 0.08, v: 0.2, vib: [0.9, 0.0], glide: 0.04, leg: 0.012, legato: true, filters: [['lowpass', 2600, 0.6]], dip: 0.5,
      noise: { kind: 'pink', type: 'bandpass', q: 0.5, f: () => 1500, lvl: 0.006, chiff: 3 } },
  };
  function leadVoice(ac, out, c, t) {
    const v = { ac, out, fs: [], oscs: [], srcs: [] };
    const mk = () => { const o = osc0(ac); if (c.type) o.type = c.type; else o.setPeriodicWave(P.wave(ac, c.wave)); v.oscs.push(o); v.srcs.push(o); return o; };
    const os = mk();
    let node = os;
    for (const fd of c.filters || []) { const fl = filt(ac, fd[0], fd[1], fd[2]); if (fd[3] != null) fl.gain.value = fd[3]; node.connect(fl); node = fl; v.fs.push(fl); }
    const amp = gain(ac, 0, out);
    node.connect(amp);
    v.amp = amp;
    if (c.beat) { const o2 = mk(); o2.detune.value = c.beat; const g2 = gain(ac, 0.8, v.fs[0] || amp); o2.connect(g2); }
    const lfo = osc0(ac); lfo.frequency.value = c.vib[0] * rr(0.94, 1.06);
    v.lg = gain(ac, 0); lfo.connect(v.lg);
    for (const o of v.oscs) v.lg.connect(o.frequency);
    v.srcs.push(lfo);
    if (c.vibA) { v.la = gain(ac, 0, amp.gain); lfo.connect(v.la); }
    if (c.noise || c.jit) {
      const ns = ac.createBufferSource(); ns.buffer = P.noiseBuf(ac, (c.noise && c.noise.kind) || 'white'); ns.loop = true;
      v.srcs.push(ns);
      if (c.noise) { v.nf = filt(ac, c.noise.type, 2000, c.noise.q); v.ng = gain(ac, 0, out); ns.connect(v.nf); v.nf.connect(v.ng); }
      if (c.jit) { v.jg = gain(ac, 0); ns.connect(v.jg); for (const o of v.oscs) v.jg.connect(o.frequency); }
    }
    for (const s of v.srcs) s.start(t, s === v.srcs[v.srcs.length - 1] && s.loop ? rnd() * 2 : 0);
    return v;
  }
  const semi = (f, s) => f * Math.pow(2, s / 12);
  function monoLead(name) {
    const c = LEAD[name];
    return (ac, out, t, notes, dur, vel, ev, st) => {
      ev = ev || {}; st = st || {};
      const midi = notes[notes.length - 1], f = mtof(midi);
      let v = st.v;
      const reuse = v && v.ac === ac && v.out === out && t < v.stopAt - 0.03 && v.stopAt > ac.currentTime + 0.03;
      if (!reuse) v = st.v = leadVoice(ac, out, c, t);
      const near = st.lastEnd != null && t - st.lastEnd > -0.06 && t - st.lastEnd < 0.06 + 0.08 * (st.lastDur || 0);
      const slur = reuse && st.lastF && (ev.glide || (c.legato && near));
      const pk = vel * c.v * Math.pow(f / 440, -0.12);
      // ---- pitch
      const kan = ev.kan === true || (ev.kan !== false && c.kan && !ev.glide && !slur && dur >= 0.3 && ((st.n = (st.n || 0) + 1) % 3 === 0));
      const gl = ev.glide ? (c.glide || 0.1) * (1.2 + Math.min(1, dur)) : c.slide ? c.glide : c.leg || 0.025;
      for (const o of v.oscs) {
        const fp = o.frequency;
        fp.cancelScheduledValues(t);
        let t1 = t;
        if (slur) { fp.setValueAtTime(st.lastF, t); fp.exponentialRampToValueAtTime(f, t + gl); t1 = t + gl; }
        else if (ev.bend) { fp.setValueAtTime(semi(f, ev.bend), t); fp.setTargetAtTime(f, t + 0.03, 0.06); t1 = t + 0.1; }
        else if (c.scoop) { fp.setValueAtTime(semi(f, -c.scoop * rr(0.7, 1.2)), t); fp.setTargetAtTime(f, t, c.scoopT || 0.03); t1 = t + 0.06; }
        else fp.setValueAtTime(f, t);
        // kan: a grace touch of the upper neighbour (or the note we came from) on articulated notes
        if (kan && !slur) {
          const fk = st.lastF && st.lastF > f && st.lastF < f * 1.26 ? st.lastF : semi(f, 2);
          fp.cancelScheduledValues(t); fp.setValueAtTime(fk, t); fp.setValueAtTime(fk, t + 0.045); fp.exponentialRampToValueAtTime(f, t + 0.075); t1 = t + 0.08;
        }
        const gm = ev.gamak === false ? 0 : typeof ev.gamak === 'number' ? ev.gamak : ev.gamak ? 1 : c.gamak && dur >= 0.9 && !ev.glide ? c.gamak : 0;
        if (gm) { // fast oscillating gamak towards the upper note (~7 /s), in the middle of the note
          const per = 0.14, ts = Math.max(t1, t + dur * 0.35), te = t + dur * 0.85;
          let k = 0;
          for (let tt = ts; tt < te - per / 2; tt += per / 2, k++) fp.setTargetAtTime(k % 2 ? f : semi(f, gm), tt, per / 6);
          fp.setTargetAtTime(f, te, 0.03);
        }
      }
      // ---- vibrato (delayed, deepening) and pitch jitter
      const lg = v.lg.gain, vd = c.vib[1] * (ev.vib == null ? 1 : ev.vib);
      lg.cancelScheduledValues(t); lg.setTargetAtTime(0, t, 0.03);
      if (dur > 0.22 && vd) lg.setTargetAtTime(f * vd, t + Math.min(c.vibDelay || 0.25, dur * 0.4), 0.22);
      if (v.jg) { v.jg.gain.cancelScheduledValues(t); v.jg.gain.setTargetAtTime(f * c.jit, t, 0.05); }
      // ---- amplitude
      const g = v.amp.gain;
      if (!reuse) { g.setValueAtTime(0, t); g.setTargetAtTime(pk, t, c.a / 3); }
      else if (slur) {
        if (st.lastEnd > ac.currentTime + 0.01 && st.lastEnd <= t + 0.06) g.cancelScheduledValues(Math.min(t, st.lastEnd)); else g.cancelScheduledValues(t);
        g.setTargetAtTime(pk, Math.min(t, st.lastEnd || t), 0.03);
      } else {
        g.cancelScheduledValues(t);
        g.setTargetAtTime(pk * (c.dip == null ? 0.2 : c.dip), t, 0.006);
        g.setTargetAtTime(pk, t + 0.022, c.a / 3);
      }
      if (dur > c.a * 2) g.setTargetAtTime(pk * c.sus, t + c.a * 1.5, 0.25);
      g.setTargetAtTime(0, t + dur, c.r / 4);
      if (v.la) { v.la.gain.cancelScheduledValues(t); v.la.gain.setTargetAtTime(dur > 0.3 ? pk * c.vibA : 0, t + 0.2, 0.2); }
      if (c.dyn) c.dyn(v, t, f, vel, dur, slur);
      // ---- breath / bow noise (chiff on articulated notes)
      if (v.ng) {
        const n = c.noise, nl = vel * n.lvl, ng = v.ng.gain;
        v.nf.frequency.setTargetAtTime(n.f(f), t, 0.02);
        ng.cancelScheduledValues(t);
        if (!slur) { ng.setTargetAtTime(nl * n.chiff, t, 0.004); ng.setTargetAtTime(nl, t + 0.03, 0.03); } else ng.setTargetAtTime(nl, t, 0.03);
        ng.setTargetAtTime(0, t + dur, c.r / 4);
      }
      if (c.taraf && (!slur || ev.glide)) taraf(ac, out, t + 0.05, midi, vel * 0.5, st, c.taraf, 'taraf2');
      v.stopAt = t + dur + c.r * 2.2 + 0.06;
      for (const s of v.srcs) s.stop(v.stopAt);
      st.lastF = f; st.lastEnd = t + dur; st.lastDur = dur; st.lastMidi = midi;
    };
  }

  /* ============================================================ polyphonic instruments */
  // Formant-baked PeriodicWaves: the harmonic amplitudes of each note are the source spectrum times a fixed body /
  // vowel response evaluated at h*f0, so fixed resonances (violin body, vowel formants, bell of a trumpet) cost no
  // filter nodes. Cached per context + instrument + note.
  const BW = new WeakMap();
  function baked(ac, key, f, src, resp) {
    let c = BW.get(ac);
    if (!c) { c = new Map(); BW.set(ac, c); }
    const k = key + ':' + Math.round(f);
    let w = c.get(k);
    if (w) return w;
    const n = Math.max(1, Math.min(64, Math.floor(11000 / f)));
    const real = new Float32Array(n + 1), imag = new Float32Array(n + 1);
    for (let h = 1; h <= n; h++) imag[h] = src(h) * resp(h * f);
    w = ac.createPeriodicWave(real, imag);
    c.set(k, w);
    return w;
  }
  // resonance sum: [[Hz, bandwidth Hz, dB], ...] (+ floor)
  const reson = (list, floor) => (hz) => { let s = floor || 0; for (const r of list) s += db(r[2]) / Math.sqrt(1 + Math.pow((hz - r[0]) / (r[1] / 2), 2)); return s; };
  const lowpass = (fc, k) => (hz) => 1 / Math.sqrt(1 + Math.pow(hz / fc, 2 * (k || 2)));
  const VIOLIN_BODY = reson([[285, 90, 0], [470, 160, -2], [1100, 500, -6], [2900, 1400, 0], [5000, 2500, -10]], 0.1);
  const VOWELS = { // ensemble formants (F, bandwidth, dB) - wordless open vowels
    a: [[790, 110, 0], [1180, 130, -4], [2850, 220, -20], [3700, 300, -26]],
    o: [[480, 90, 0], [840, 110, -6], [2800, 220, -26], [3600, 300, -32]],
    u: [[340, 70, 0], [700, 100, -12], [2700, 220, -30], [3500, 300, -36]],
    e: [[480, 90, 0], [1750, 160, -10], [2600, 220, -18], [3500, 300, -26]],
  };
  const VR = {};
  for (const k in VOWELS) VR[k] = reson(VOWELS[k], 0.01);
  function envGain(ac, out, t, dur, pk, a, r, sus, decT) {
    const g = gain(ac, 0, out);
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(pk, t, a / 3);
    if (sus != null && sus !== 1) g.gain.setTargetAtTime(pk * sus, t + a * 1.5, decT || 0.3);
    g.gain.setTargetAtTime(0, t + Math.max(a * 0.8, dur), r / 4);
    return g;
  }
  const endOf = (t, dur, r) => t + dur + r * 2.2 + 0.05;
  const POLY = {};
  // harmonium: hand-pumped bellows (slow irregular swell), two beating reeds per key, optional bass/female stops
  POLY.harmonium = (ac, out, t, notes, dur, vel, ev) => {
    const stop = ev.stop || 'male', n = notes.length, end = endOf(t, dur, 0.12);
    const env = envGain(ac, out, t, dur, (vel * 0.17) / Math.sqrt(n), 0.045, 0.12, 0.88);
    const wob = gain(ac, 1, env);
    const lfo = osc0(ac); lfo.frequency.value = rr(0.7, 1.1);
    const lg = gain(ac, 0.07, wob.gain); lfo.connect(lg); lfo.start(t); lfo.stop(end);
    const lp = filt(ac, 'lowpass', 1400, 0.6, wob);
    lp.frequency.setValueAtTime(1100, t); lp.frequency.setTargetAtTime(1800 + 1200 * vel, t, 0.05);
    const reeds = stop === 'bass' ? [[0, 1], [-1200, 0.6]] : stop === 'female' ? [[0, 1], [1200, 0.45]] : stop === 'full' ? [[0, 0.8], [6, 0.7], [-1200, 0.5]] : [[0, 1], [6, 0.85]];
    for (const m of notes) for (const r of reeds) {
      const os = osc0(ac); os.setPeriodicWave(P.wave(ac, 'harmonium'));
      os.frequency.value = mtof(m); os.detune.value = r[0] + rr(-1.5, 1.5);
      const g = r[1] === 1 ? lp : gain(ac, r[1], lp);
      os.connect(g); os.start(t + rr(0, 0.012)); os.stop(end);
    }
  };
  // filmi violin section: two players per note (detune drifting), bow attack, shared vibrato, body formants baked in
  POLY.strings = (ac, out, t, notes, dur, vel) => {
    const n = notes.length, a = clamp(dur * 0.3, 0.06, 0.3), end = endOf(t, dur, 0.5);
    const env = envGain(ac, out, t, dur, (vel * 0.16) / Math.sqrt(n), a, 0.5, 0.9);
    const lp = filt(ac, 'lowpass', 1800, 0.5, env);
    lp.frequency.setValueAtTime(1200, t); lp.frequency.setTargetAtTime(3200 + 2500 * vel, t, a * 0.6); lp.frequency.setTargetAtTime(2600 + 1500 * vel, t + a, 0.4);
    const vib = osc0(ac); vib.frequency.value = rr(5.2, 5.9);
    const vg = gain(ac, 0); vib.connect(vg); vib.start(t); vib.stop(end);
    vg.gain.setValueAtTime(0, t); vg.gain.setTargetAtTime(11, t + 0.2, 0.3);
    for (const m of notes) {
      const f = mtof(m), w = baked(ac, 'str', f, (h) => 1 / h, VIOLIN_BODY);
      for (const d0 of [-7, 6]) {
        const os = osc0(ac); os.setPeriodicWave(w); os.frequency.value = f;
        os.detune.setValueAtTime(d0 + rr(-3, 3), t); os.detune.linearRampToValueAtTime(d0 * 0.4 + rr(-5, 5), t + dur);
        vg.connect(os.detune); os.connect(lp); os.start(t + rr(0, 0.025)); os.stop(end);
      }
    }
  };
  // baraat band brass: trumpet + clarinet in unison per note, each a little out of tune, lip scoop + blatty filter
  const TRUMPET_BELL = (hz) => reson([[1250, 900, 0], [2600, 1500, -6]], 0.35)(hz) * lowpass(4200, 2)(hz);
  const CLAR_BODY = (hz) => lowpass(3000, 2)(hz);
  POLY.brass = (ac, out, t, notes, dur, vel) => {
    const n = notes.length, end = endOf(t, dur, 0.1);
    const env = envGain(ac, out, t, dur, (vel * 0.18) / Math.sqrt(n), 0.025, 0.1, 0.8);
    const lp = filt(ac, 'lowpass', 600, 1.1, env);
    const top = 1800 + 3000 * Math.min(1.2, vel);
    lp.frequency.setValueAtTime(500, t); lp.frequency.setTargetAtTime(top * 1.4, t, 0.012); lp.frequency.setTargetAtTime(top, t + 0.05, 0.1);
    for (const m of notes) {
      const f = mtof(m);
      const voices = [[baked(ac, 'tpt', f, (h) => Math.pow(h, -0.4), TRUMPET_BELL), rr(-18, 14), 1], [baked(ac, 'clr', f, (h) => (h % 2 ? 1 : 0.12) / h, CLAR_BODY), rr(-12, 20), 0.7]];
      for (const vo of voices) {
        const os = osc0(ac); os.setPeriodicWave(vo[0]); os.frequency.value = f;
        os.detune.setValueAtTime(vo[1] - rr(40, 90), t); os.detune.setTargetAtTime(vo[1], t + 0.01, 0.035);
        const g = vo[2] === 1 ? lp : gain(ac, vo[2], lp);
        os.connect(g); os.start(t + rr(0, 0.018)); os.stop(end);
      }
    }
  };
  // wordless choir ("aah" / "ooh"): two singers per note, vowel formants baked per note, two vibrato rates
  const choir = (vowel) => (ac, out, t, notes, dur, vel, ev) => {
    const n = notes.length, a = clamp(dur * 0.35, 0.12, 0.45), end = endOf(t, dur, 0.7);
    const vr = VR[ev.vowel] || VR[vowel], vk = ev.vowel || vowel;
    const env = envGain(ac, out, t, dur, (vel * 0.2) / Math.sqrt(n), a, 0.7, 0.92, 0.6);
    const lp = filt(ac, 'lowpass', 4500, 0.5, env);
    const lfos = [rr(4.6, 5.0), rr(5.4, 5.9)].map((r) => { const l = osc0(ac); l.frequency.value = r; const lg = gain(ac, 0); l.connect(lg); l.start(t); l.stop(end); lg.gain.setValueAtTime(0, t); lg.gain.setTargetAtTime(14, t + 0.25, 0.4); return lg; });
    for (const m of notes) {
      const f = mtof(m), w = baked(ac, 'ch' + vk, f, (h) => Math.pow(h, -1.1), vr);
      [-8, 7].forEach((d0, i) => {
        const os = osc0(ac); os.setPeriodicWave(w); os.frequency.value = f;
        os.detune.setValueAtTime(d0 - 20, t); os.detune.setTargetAtTime(d0, t, 0.08);
        lfos[i].connect(os.detune); os.connect(lp); os.start(t + rr(0, 0.04)); os.stop(end);
      });
    }
  };
  POLY.choir = choir('a');
  POLY.choir_oo = choir('u');
  // fairground calliope (Numaish): steam-whistle pipes, 8' + slightly sharp 4' rank, tremulant, puffy pipe speech
  POLY.calliope = (ac, out, t, notes, dur, vel) => {
    const n = notes.length, end = endOf(t, dur, 0.06);
    const env = envGain(ac, out, t, dur, (vel * 0.2) / Math.sqrt(n), 0.018, 0.06, 0.9);
    const wob = gain(ac, 1, env);
    const lfo = osc0(ac); lfo.frequency.value = rr(6.2, 6.8);
    const lg = gain(ac, 0.16, wob.gain); lfo.connect(lg); lfo.start(t); lfo.stop(end);
    const ns = ac.createBufferSource(); ns.buffer = P.noiseBuf(ac, 'pink'); ns.loop = true;
    const ngn = gain(ac, 0, wob); ns.connect(ngn); ns.start(t, rnd() * 2); ns.stop(end);
    ngn.gain.setValueAtTime(0, t); ngn.gain.setTargetAtTime(0.35 * vel, t, 0.004); ngn.gain.setTargetAtTime(0.04 * vel, t + 0.03, 0.03); ngn.gain.setTargetAtTime(0, t + dur, 0.02);
    for (const m of notes) for (const r of [[0, 1, rr(-8, 8)], [1200, 0.35, rr(6, 16)]]) {
      const os = osc0(ac); os.setPeriodicWave(P.wave(ac, 'i_pipe'));
      os.frequency.value = mtof(m); os.detune.setValueAtTime(r[2] - 30, t); os.detune.setTargetAtTime(r[2], t, 0.02);
      const g = gain(ac, r[1], wob);
      os.connect(g); os.start(t); os.stop(end);
    }
  };
  // 90s string-machine pad: two drifting saws per note, slow filter bloom
  POLY.pad = (ac, out, t, notes, dur, vel) => {
    const n = notes.length, end = endOf(t, dur, 0.8);
    const env = envGain(ac, out, t, dur, (vel * 0.085) / Math.sqrt(n), 0.4, 0.8);
    const lp = filt(ac, 'lowpass', 700, 0.9, env);
    lp.frequency.setValueAtTime(700, t); lp.frequency.setTargetAtTime(1900, t, 0.5); lp.frequency.setTargetAtTime(1300, t + dur * 0.6, 0.8);
    for (const m of notes) for (const d0 of [-11, 10]) {
      const os = osc0(ac); os.type = 'sawtooth'; os.frequency.value = mtof(m);
      os.detune.setValueAtTime(d0, t); os.detune.linearRampToValueAtTime(-d0 * 0.6, t + dur + 0.5);
      os.connect(lp); os.start(t); os.stop(end);
    }
  };

  /* ============================================================ drums (JS modal synthesis -> cached buffers) */
  // Each stroke renders (per sample rate, per tabla tuning) up to 3 micro-varied takes into AudioBuffers; a hit is one
  // buffer source + gain. The core additionally pre-renders strokes into its own cache (drumHit), which just copies ours.
  const DB = new Map();
  const memb = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501]; // circular membrane mode ratios
  const jit = (x, a) => x * (1 + (rnd() - 0.5) * 2 * (a || 0.006));
  const strike = (k) => (t) => 1 + k * Math.exp(-t / 0.025); // tension modulation: loud strokes start sharp
  function modes(d, sr, t0, f, list, amp, fr, att) { for (const m of list) mode(d, sr, t0, jit(f * m[0], 0.004), amp * m[1] * rr(0.88, 1.1), m[2] * rr(0.92, 1.08), att, fr); }
  // tabla dayan: syahi loading makes modes 1..5 near-harmonic (Raman); strokes differ in which modes ring
  const DAYAN = {
    na: [[1, 0.32, 0.3], [2.0, 0.8, 0.55], [3.01, 0.62, 0.42], [4.02, 0.4, 0.3], [5.03, 0.24, 0.22], [2.42, 0.14, 0.05], [3.58, 0.1, 0.04]],
    tin: [[1, 1, 0.75], [2.0, 0.5, 0.55], [3.0, 0.24, 0.4], [4.01, 0.12, 0.28], [5.02, 0.06, 0.2]],
    tun: [[1, 1, 1.1], [2.0, 0.2, 0.5], [3.0, 0.06, 0.3]],
    ti: [[1, 0.5, 0.045], [2.0, 0.35, 0.035], [2.9, 0.25, 0.03], [4.1, 0.15, 0.02]],
    te: [[1, 0.6, 0.06], [1.5, 0.3, 0.04], [2.2, 0.2, 0.03]],
    ra: [[1, 0.45, 0.04], [2.0, 0.3, 0.03], [3.1, 0.15, 0.02]],
    tak: [[2.0, 0.6, 0.05], [3.0, 0.4, 0.04], [2.4, 0.3, 0.03]],
  };
  function dayan(d, sr, f, k, a) {
    const m = DAYAN[k], open = k === 'na' || k === 'tin' || k === 'tun';
    modes(d, sr, 0, f, m, a, open ? strike(0.012) : null);
    if (k === 'na' || k === 'tak') noise(d, sr, 0, a * 0.5, 0.0035, { f: [['hp', 2800, 0.7]] }); // rim snap (kinar)
    if (open) noise(d, sr, 0, a * 0.18, 0.008, { f: [['bp', f * 4, 1]] });
    else noise(d, sr, 0, a * 0.55, 0.01, { f: [['bp', k === 'te' ? 1500 : 2400, 1.1]] }); // closed: finger slap on the syahi
    noise(d, sr, 0, a * 0.12, 0.012, { color: 'brown', f: [['bp', 700, 1.5]] }); // wooden shell
  }
  const bayanF = (tune) => clamp((tune || 294) / 3.3, 74, 104);
  const BAYAN = [[1, 1, 0.9], [1.98, 0.22, 0.45], [2.93, 0.1, 0.28], [3.9, 0.05, 0.18]];
  // ge with gumki: the wrist presses the head after the stroke, raising the pitch (rise = fraction)
  function bayan(d, sr, tune, kind, a) {
    const f = bayanF(tune);
    if (kind === 'ka') { // flat-palm slap on the bayan: dry
      noise(d, sr, 0, a * 0.9, 0.022, { color: 'brown', f: [['lp', 750, 0.7]] });
      noise(d, sr, 0, a * 0.25, 0.004, { f: [['bp', 1100, 1]] });
      mode(d, sr, 0, f * 1.6, a * 0.4, 0.07);
      return;
    }
    const fr = kind === 'geu' ? (t) => 1 + 0.5 * (1 - Math.exp(-t / 0.16)) + 0.03 * Math.exp(-t / 0.02)
      : kind === 'ged' ? (t) => 1 + 0.32 * Math.exp(-t / 0.13)
        : (t) => 1 + 0.2 * (1 - Math.exp(-t / 0.13)) + 0.03 * Math.exp(-t / 0.02);
    modes(d, sr, 0, f, BAYAN, a, fr, 0.002);
    noise(d, sr, 0, a * 0.45, 0.02, { color: 'brown', f: [['lp', 450, 0.7]] });
    noise(d, sr, 0, a * 0.12, 0.004, { f: [['bp', 950, 1]] });
  }
  // generic membrane hit: f0, ratios subset, decay, glide, plus stick/hand transient
  function drum(d, sr, t0, f, a, o) {
    const list = (o.ratios || memb).map((r, i) => [r, (o.amps && o.amps[i] != null ? o.amps[i] : Math.pow(0.62, i)), (o.t60 || 0.4) * Math.pow(o.hiDecay || 0.75, i)]);
    modes(d, sr, t0, f, list, a, o.fr || strike(o.tm == null ? 0.08 : o.tm), o.att);
    if (o.slap) noise(d, sr, t0, a * o.slap[0], o.slap[2] || 0.006, { f: [['bp', o.slap[1], o.slap[3] || 1]] });
    if (o.thump) noise(d, sr, t0, a * o.thump[0], o.thump[2] || 0.03, { color: 'brown', f: [['lp', o.thump[1], 0.7]] });
    if (o.crack) noise(d, sr, t0, a * o.crack[0], o.crack[2] || 0.003, { f: [['hp', o.crack[1], 0.7]] });
    if (o.wires) noise(d, sr, t0 + 0.002, a * o.wires[0], o.wires[1], { f: [['bp', o.wires[2] || 4500, 0.6], ['hp', 1800, 0.7]], hold: o.wires[3] || 0 });
  }
  const roll = (fn, n, gap, a0) => (d, sr, tune) => { for (let k = 0; k < n; k++) fn(d, sr, tune, k * gap * rr(0.94, 1.06), (a0 || 0.45) + ((1 - (a0 || 0.45)) * k) / (n - 1)); };
  // stroke table: kit -> stroke -> [seconds, peak, render(d, sr, tune, t0 = 0, amp = 1), tuned]
  const S = {};
  const OPEN = { na: 1, tin: 1, tun: 1 };
  const tab = (k) => [k === 'tun' ? 1.3 : OPEN[k] ? 0.9 : 0.3, k === 'na' ? 0.6 : OPEN[k] ? 0.55 : 0.42, (d, sr, tune) => dayan(d, sr, tune, k, 1), true];
  S.tabla = { na: tab('na'), tin: tab('tin'), tun: tab('tun'), ti: tab('ti'), te: tab('te'), ra: tab('ra'), tak: tab('tak'),
    ge: [1.2, 0.55, (d, sr, tu) => bayan(d, sr, tu, 'ge', 1), true], geu: [1.2, 0.58, (d, sr, tu) => bayan(d, sr, tu, 'geu', 1), true],
    ged: [1.0, 0.55, (d, sr, tu) => bayan(d, sr, tu, 'ged', 1), true], ka: [0.25, 0.45, (d, sr, tu) => bayan(d, sr, tu, 'ka', 1), true],
    ki: [0.2, 0.4, (d, sr, tu) => { bayan(d, sr, tu, 'ka', 0.8); noise(d, sr, 0, 0.3, 0.004, { f: [['bp', 1800, 1]] }); }, true],
    dha: [1.2, 0.82, (d, sr, tu) => { bayan(d, sr, tu, 'ge', 0.9); dayan(d, sr, tu, 'na', 0.75); }, true],
    dhin: [1.2, 0.8, (d, sr, tu) => { bayan(d, sr, tu, 'ge', 0.9); dayan(d, sr, tu, 'tin', 0.75); }, true],
    dhit: [1.0, 0.72, (d, sr, tu) => { bayan(d, sr, tu, 'ge', 0.75); dayan(d, sr, tu, 'ti', 0.7); }, true],
    dhet: [1.0, 0.72, (d, sr, tu) => { bayan(d, sr, tu, 'ge', 0.75); dayan(d, sr, tu, 'te', 0.7); }, true],
    dhun: [1.3, 0.8, (d, sr, tu) => { bayan(d, sr, tu, 'ge', 0.85); dayan(d, sr, tu, 'tun', 0.75); }, true],
  };
  Object.assign(S.tabla, { ta: S.tabla.na, tu: S.tabla.tun, tit: S.tabla.ti, tet: S.tabla.te, re: S.tabla.ra, ri: S.tabla.ra,
    ghe: S.tabla.ge, ga: S.tabla.ge, ke: S.tabla.ka, kat: S.tabla.ka, dhi: S.tabla.dhin });
  // dholak: barrel drum, bass head with masala (gumki slides), tight treble head, metal ring tapped on the shell
  const dhD = (d, sr, tu, t0, a) => drum(d, sr, t0 || 0, 104, a || 1, { t60: 0.45, tm: 0.3, amps: [1, 0.4, 0.25, 0.12, 0.08], ratios: memb.slice(0, 5), thump: [0.45, 380, 0.02], slap: [0.15, 1500] });
  const dhT = (d, sr, tu, t0, a) => drum(d, sr, t0 || 0, 430, a || 1, { t60: 0.09, hiDecay: 0.85, tm: 0.04, amps: [0.6, 0.45, 0.4, 0.3, 0.2], ratios: memb.slice(0, 5), slap: [0.7, 1900, 0.012, 1.2] });
  S.dholak = {
    D: [0.9, 0.65, dhD],
    g: [0.9, 0.6, (d, sr) => drum(d, sr, 0, 84, 1, { t60: 0.55, ratios: [1, 1.6], amps: [1, 0.2], fr: (t) => 1 + 0.48 * (1 - Math.exp(-t / 0.1)), thump: [0.3, 300, 0.02] })],
    t: [0.3, 0.55, dhT],
    na: [0.6, 0.5, (d, sr) => drum(d, sr, 0, 470, 1, { t60: 0.35, hiDecay: 0.7, amps: [0.8, 0.3, 0.25, 0.12, 0.1], ratios: [1, 1.59, 2.14, 2.92, 3.5], crack: [0.3, 3000] })],
    k: [0.15, 0.35, (d, sr) => { noise(d, sr, 0, 0.5, 0.004, { f: [['hp', 3500, 0.7]] }); mode(d, sr, 0, 950, 0.3, 0.03); }],
    c: [0.35, 0.3, (d, sr) => { modes(d, sr, 0, 2650, [[1, 1, 0.12], [1.46, 0.7, 0.1], [2.0, 0.5, 0.08], [2.7, 0.3, 0.06]], 1); noise(d, sr, 0, 0.5, 0.0015, { f: [['hp', 6000, 0.7]] }); }],
    dha: [0.9, 0.75, (d, sr, tu) => { dhD(d, sr, tu, 0, 0.9); dhT(d, sr, tu, 0.004, 0.7); }],
  };
  Object.assign(S.dholak, { ge: S.dholak.g, ta: S.dholak.t, tin: S.dholak.na, chi: S.dholak.c, ka: S.dholak.k });
  // dhol: dagga (heavy curved stick) boom + tilli (cane) crack
  const dholD = (d, sr, tu, t0, a) => drum(d, sr, t0 || 0, 74, a || 1, { t60: 0.6, tm: 0.35, slap: [0.5, 700, 0.012, 0.8], thump: [0.5, 300, 0.04] });
  const dholT = (d, sr, tu, t0, a) => drum(d, sr, t0 || 0, 380, a || 1, { t60: 0.11, hiDecay: 0.85, tm: 0.05, amps: [0.4, 0.3, 0.35, 0.3, 0.25, 0.15], crack: [0.7, 2000, 0.01], slap: [0.4, 2300, 0.015, 2] });
  S.dhol = { D: [1.0, 0.8, dholD], t: [0.35, 0.6, dholT], R: [0.5, 0.6, roll(dholT, 4, 0.03)], d: [1.0, 0.5, (d, sr, tu) => dholD(d, sr, tu, 0, 0.6)],
    dt: [1.0, 0.85, (d, sr, tu) => { dholD(d, sr, tu); dholT(d, sr, tu, 0.003, 0.7); }] };
  // band-baaja: marching bass drum, snare, cymbals, tenor, tasha pops
  const snare = (f, wires, ring) => (d, sr, tu, t0, a) => drum(d, sr, t0 || 0, f, a || 1, { t60: ring || 0.14, hiDecay: 0.8, tm: 0.05, amps: [0.6, 0.45, 0.35, 0.3], ratios: [1, 1.59, 2.14, 2.65], crack: [0.4, 3000, 0.004], wires: [0.65, wires || 0.07, 4500] });
  function crash(d, sr, t0, a, len, base) {
    for (let k = 0; k < 26; k++) { const f = (base || 330) * Math.pow(2, rnd() * 5.2); mode(d, sr, t0, f, a * 0.11 * Math.pow(400 / f, 0.25) * rr(0.5, 1), len * rr(0.4, 1) * Math.pow(800 / f, 0.25), 0.001); }
    noise(d, sr, t0, a * 0.5, len * 0.18, { f: [['hp', 4500, 0.7], ['pk', 8000, 1, 4]], att: 0.002 });
  }
  const bassDrum = (d, sr, tu, t0, a) => drum(d, sr, t0 || 0, 58, a || 1, { t60: 0.55, tm: 0.4, amps: [1, 0.3, 0.15, 0.08], ratios: [1, 1.5, 2.1, 2.7], thump: [0.55, 900, 0.015], slap: [0.12, 1800, 0.004] });
  const tashaT = (f) => (d, sr, tu, t0, a) => drum(d, sr, t0 || 0, f, a || 1, { t60: 0.09, hiDecay: 0.88, tm: 0.06, amps: [0.5, 0.45, 0.45, 0.35, 0.25, 0.2], crack: [0.9, 2800, 0.004], slap: [0.6, 3000, 0.012, 0.8] });
  S.band = {
    B: [1.0, 0.85, bassDrum], S: [0.45, 0.6, snare(205, 0.08)], R: [0.5, 0.6, roll(snare(205, 0.05), 5, 0.032)],
    C: [1.9, 0.5, (d, sr) => crash(d, sr, 0, 1, 1.6, 340)], M: [0.6, 0.65, (d, sr) => drum(d, sr, 0, 140, 1, { t60: 0.3, tm: 0.2, slap: [0.4, 800, 0.01], thump: [0.2, 500, 0.02] })],
    P: [0.3, 0.62, tashaT(600)], p: [0.25, 0.32, tashaT(640)], T: [0.25, 0.55, (d, sr) => { noise(d, sr, 0, 0.9, 0.012, { f: [['bp', 2500, 2]] }); mode(d, sr, 0, 610, 0.4, 0.08); }],
  };
  // dappu (Bonalu teenmaar): big single-headed frame drum, heated skin: open boom, sharp stick slap, light taps
  const dappuT = (d, sr, tu, t0, a) => { drum(d, sr, t0 || 0, 96, (a || 1) * 0.5, { t60: 0.12, ratios: memb.slice(2), amps: [0.6, 0.5, 0.5, 0.4, 0.3, 0.25], hiDecay: 0.9, tm: 0.1 }); noise(d, sr, t0 || 0, (a || 1) * 0.9, 0.007, { f: [['hp', 1500, 0.7], ['pk', 2300, 1.5, 6]] }); };
  S.dappu = {
    D: [0.9, 0.75, (d, sr) => drum(d, sr, 0, 96, 1, { t60: 0.5, tm: 0.25, hiDecay: 0.7, slap: [0.35, 1200, 0.008], thump: [0.35, 350, 0.03] })],
    T: [0.35, 0.68, dappuT], t: [0.3, 0.4, (d, sr, tu) => dappuT(d, sr, tu, 0, 0.55)], R: [0.4, 0.5, roll(dappuT, 4, 0.028, 0.4)],
    k: [0.15, 0.4, (d, sr) => { modes(d, sr, 0, 1800, [[1, 1, 0.04], [1.62, 0.6, 0.03], [2.4, 0.3, 0.02]], 1); noise(d, sr, 0, 0.4, 0.003, { f: [['hp', 3000, 0.7]] }); }],
  };
  // tasha: small kettle drum, very tight head, two sticks -> cracking high rolls
  S.tasha = { T: [0.3, 0.62, tashaT(560)], t: [0.25, 0.36, (d, sr, tu) => tashaT(580)(d, sr, tu, 0, 0.6)], R: [0.4, 0.55, roll(tashaT(560), 6, 0.024, 0.35)], D: [0.4, 0.55, tashaT(320)] };
  // marfa: the deep Hyderabadi frame drum of Old City celebrations, played with sticks
  const marfaB = (d, sr, tu, t0, a) => drum(d, sr, t0 || 0, 62, a || 1, { t60: 0.85, tm: 0.3, hiDecay: 0.7, slap: [0.4, 500, 0.02, 0.8], thump: [0.5, 260, 0.06] });
  S.marfa = { B: [1.3, 0.85, marfaB], b: [1.2, 0.5, (d, sr, tu) => marfaB(d, sr, tu, 0, 0.6)],
    k: [0.4, 0.62, (d, sr) => { drum(d, sr, 0, 62, 0.6, { t60: 0.2, ratios: memb.slice(3), hiDecay: 0.9, tm: 0.1 }); noise(d, sr, 0, 0.8, 0.01, { f: [['bp', 1100, 0.9]] }); }],
    t: [0.3, 0.38, (d, sr) => { noise(d, sr, 0, 0.6, 0.006, { f: [['bp', 1400, 1]] }); mode(d, sr, 0, 62 * 2.65, 0.3, 0.12); }] };
  // qawwali claps: many hands (cupped and flat), human spread, a small room
  function claps(d, sr, n, spread, a) {
    for (let k = 0; k < n; k++) {
      let g = 0; for (let j = 0; j < 4; j++) g += rnd(); g = (g - 2) * spread; // ~gaussian timing
      const t0 = 0.03 + g, cup = rnd() < 0.4;
      noise(d, sr, Math.max(0, t0), a * rr(0.5, 1), rr(0.005, 0.012), { f: [['bp', cup ? rr(700, 1100) : rr(1200, 2400), cup ? 2.5 : 1.3], ['pk', 3500, 1, 3]], att: 0.0006 });
    }
    room(d, sr, 0.35, 0.45);
  }
  S.clap = { x: [0.7, 0.55, (d, sr) => claps(d, sr, 10, 0.011, 1)], X: [0.8, 0.68, (d, sr) => claps(d, sr, 18, 0.013, 1)], s: [0.5, 0.4, (d, sr) => claps(d, sr, 1, 0, 1)] };
  // 90s kit (live) and drum machine (808/909)
  const HATF = [205.3, 304.4, 369.6, 522.7, 540, 800];
  const kick = (f0, drop, t60, click) => (d, sr) => { mode(d, sr, 0, f0, 1, t60, 0.001, (t) => 1 + drop * Math.exp(-t / 0.014)); mode(d, sr, 0, f0 * 1.6, 0.15, t60 * 0.3, 0.001); noise(d, sr, 0, click, 0.003, { f: [['hp', 2500, 0.7]] }); noise(d, sr, 0, 0.3, 0.012, { color: 'brown', f: [['lp', 300, 0.7]] }); };
  const tom = (f) => (d, sr) => drum(d, sr, 0, f, 1, { t60: 0.4, tm: 0.25, ratios: [1, 1.5, 1.98], amps: [1, 0.3, 0.15], slap: [0.2, 900, 0.006] });
  S.kit = {
    k: [0.6, 0.78, kick(56, 1.2, 0.38, 0.3)], s: [0.5, 0.62, (d, sr) => { snare(190, 0.1, 0.12)(d, sr); room(d, sr, 0.18, 0.3); }],
    h: [0.15, 0.3, (d, sr) => metal(d, sr, 0, 1, 0.012, HATF.map((f) => f * 1.9), [['hp', 7000, 0.7], ['pk', 10000, 1, 3]])],
    o: [0.7, 0.3, (d, sr) => metal(d, sr, 0, 1, 0.12, HATF.map((f) => f * 1.9), [['hp', 6500, 0.7], ['pk', 9500, 1, 3]])],
    c: [0.5, 0.55, (d, sr) => claps(d, sr, 4, 0.006, 1)], t: [0.6, 0.65, tom(150)], l: [0.7, 0.68, tom(112)], f: [0.8, 0.7, tom(84)],
    r: [0.2, 0.45, (d, sr) => { mode(d, sr, 0, 450, 0.5, 0.05); mode(d, sr, 0, 1700, 0.4, 0.03); noise(d, sr, 0, 0.6, 0.003, { f: [['bp', 3000, 1]] }); }],
    x: [1.9, 0.5, (d, sr) => crash(d, sr, 0, 1, 1.5, 380)],
  };
  S.machine = {
    k: [0.8, 0.78, (d, sr) => { mode(d, sr, 0, 50, 1, 0.7, 0.001, (t) => 1 + 2 * Math.exp(-t / 0.01)); noise(d, sr, 0, 0.15, 0.002, { f: [['hp', 3000, 0.7]] }); for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 1.6); }],
    s: [0.4, 0.62, (d, sr) => { mode(d, sr, 0, 185, 0.6, 0.12, 0.001, (t) => 1 + 0.3 * Math.exp(-t / 0.01)); mode(d, sr, 0, 330, 0.35, 0.07); noise(d, sr, 0, 0.6, 0.05, { f: [['hp', 1500, 0.7], ['pk', 5000, 1, 4]] }); }],
    h: [0.15, 0.3, (d, sr) => metal(d, sr, 0, 1, 0.01, HATF, [['bp', 10000, 1.2], ['hp', 7000, 0.7]])],
    o: [0.7, 0.3, (d, sr) => metal(d, sr, 0, 1, 0.1, HATF, [['bp', 10000, 1.2], ['hp', 7000, 0.7]])],
    c: [0.4, 0.55, (d, sr) => { for (let k = 0; k < 3; k++) noise(d, sr, k * 0.011, 0.9, 0.004, { f: [['bp', 1100, 1.5]] }); noise(d, sr, 0.033, 0.7, 0.04, { f: [['bp', 1100, 1.5]] }); }],
    t: [0.5, 0.7, (d, sr) => mode(d, sr, 0, 150, 1, 0.45, 0.001, (t) => 1 + 0.25 * Math.exp(-t / 0.03))],
    l: [0.6, 0.72, (d, sr) => mode(d, sr, 0, 105, 1, 0.5, 0.001, (t) => 1 + 0.25 * Math.exp(-t / 0.03))],
    r: [0.15, 0.45, (d, sr) => { mode(d, sr, 0, 500, 0.6, 0.03); mode(d, sr, 0, 1700, 0.5, 0.025); }],
    x: [1.9, 0.48, (d, sr) => { metal(d, sr, 0, 0.6, 0.35, HATF.map((f) => f * 1.3), [['hp', 5000, 0.7]]); crash(d, sr, 0, 0.6, 1.4, 500); }],
    b: [0.5, 0.45, (d, sr) => metal(d, sr, 0, 1, 0.09, [540, 800], [['bp', 2600, 0.8]], 0.001)],
  };
  // ghatam / matka: clay pot; the mouth pressed against the belly makes the low 'gumki' fall
  const ghT = (d, sr, tu, t0, a) => { modes(d, sr, t0 || 0, 690, [[1, 1, 0.12], [1.95, 0.6, 0.08], [3.1, 0.35, 0.06], [4.5, 0.2, 0.04]], a || 1); noise(d, sr, t0 || 0, (a || 1) * 0.5, 0.004, { f: [['bp', 2500, 1]] }); };
  S.ghatam = {
    D: [0.7, 0.7, (d, sr) => { mode(d, sr, 0, 132, 1, 0.35, 0.002, (t) => 1 - 0.24 * (1 - Math.exp(-t / 0.08))); ghT(d, sr, 0, 0, 0.3); }],
    T: [0.35, 0.6, ghT], t: [0.25, 0.38, (d, sr, tu) => ghT(d, sr, tu, 0, 0.6)],
    k: [0.15, 0.35, (d, sr) => { noise(d, sr, 0, 0.7, 0.003, { f: [['hp', 4000, 0.7]] }); mode(d, sr, 0, 2600, 0.3, 0.03); }],
    R: [0.35, 0.5, roll(ghT, 4, 0.03, 0.4)],
  };
  S.matka = S.ghatam;

  function stroke(kit, name, def) {
    const [sec, pk, fn, tuned] = def;
    return (ac, out, t, vel, tune) => {
      const sr = ac.sampleRate, key = kit + '.' + name + '@' + (tuned ? Math.round(tune || 294) : 0) + ':' + sr;
      let arr = DB.get(key);
      if (!arr) { DB.set(key, arr = []); if (DB.size > 600) DB.delete(DB.keys().next().value); }
      let b;
      if (arr.length < 3) {
        const d = new Float32Array(Math.ceil(sec * sr));
        fn(d, sr, tune || 294);
        dcBlock(d, sr, 15);
        const o = trim(finish(d, pk, Math.max(4, Math.round(sr * 0.0002)), 0.08));
        b = ac.createBuffer(1, o.length, sr);
        if (b.copyToChannel) b.copyToChannel(o, 0); else b.getChannelData(0).set(o);
        arr.push(b);
      } else b = arr[(rnd() * arr.length) | 0];
      const s = ac.createBufferSource(); s.buffer = b;
      const g = gain(ac, vel, out);
      s.connect(g); s.start(t);
      return t + b.duration;
    };
  }

  /* ============================================================ registration */
  const safe = (name, fn) => (ac, out, t, notes, dur, vel, ev, st) => {
    try { return fn(ac, out, t, notes && notes.length ? notes : [60], dur > 0 ? dur : 0.25, vel == null ? 1 : vel, ev || {}, st || {}); } catch (e) { report(name, e); }
    return undefined;
  };
  for (const k in PLUCK) X.registerInst(k, safe(k, plucker(k)));
  for (const k in LEAD) X.registerInst(k, safe(k, monoLead(k)));
  for (const k in POLY) X.registerInst(k, safe(k, POLY[k]));
  for (const kit in S) {
    const o = {};
    for (const st in S[kit]) { const fn = stroke(kit, st, S[kit][st]); o[st] = (ac, out, t, vel, tune) => { try { return fn(ac, out, t, vel == null ? 1 : vel, tune); } catch (e) { report('kit.' + kit, e); } return t; }; }
    X.registerKit(kit, o);
  }
  // tests / tools
  X.instruments = { names: Object.keys(PLUCK).concat(Object.keys(LEAD), Object.keys(POLY)), kits: Object.keys(S).reduce((o, k) => { o[k] = Object.keys(S[k]); return o; }, {}),
    stats, noteBuf, renderString: (inst, midi) => renderStringInst(KSD[inst], mtof(midi)), KSD, MODAL, LEAD, warmQ };
})();
