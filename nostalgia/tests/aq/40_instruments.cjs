/* instruments: every score instrument (a short phrase with a meend, plus a chord where it makes sense) and every drum
 * kit stroke, rendered offline -> levels, clicks, DC, instrument-specific spectral character, CPU.
 * (src/audio_instruments.js; renders + spectrograms in tests/out/aq/inst_*.png, kit_*.png)
 *   AQ=instruments node nostalgia/tests/audio_quality.cjs      INST=sitar,tabla  to limit (AQ_VERBOSE=1 prints metrics)
 */
'use strict';

// [name, base midi, kind]  kind: mono (melody + meend), pluck (melody + meend + chord), poly (chords), drone
const INSTS = [
  ['sitar', 62, 'pluck'], ['veena', 55, 'pluck'], ['sarod', 57, 'pluck'], ['santoor', 67, 'pluck'], ['tanpura', 50, 'drone'],
  ['mandolin', 67, 'trem'], ['guitar', 52, 'pluck'], ['harp', 60, 'pluck'], ['bass', 38, 'mono'], ['musicbox', 79, 'pluck'],
  ['glock', 79, 'pluck'], ['celesta', 72, 'pluck'], ['bell', 67, 'pluck'],
  ['bansuri', 74, 'mono'], ['shehnai', 69, 'mono'], ['nadaswaram', 62, 'mono'], ['sarangi', 64, 'mono'], ['violin', 69, 'mono'],
  ['clarinet', 62, 'mono'], ['trumpet', 64, 'mono'], ['trombone', 50, 'mono'], ['tuba', 38, 'mono'], ['whistle', 79, 'mono'],
  ['synlead', 69, 'mono'], ['harmonium1', 62, 'mono'],
  ['harmonium', 60, 'poly'], ['strings', 62, 'poly'], ['brass', 62, 'poly'], ['choir', 57, 'poly'], ['choir_oo', 57, 'poly'],
  ['calliope', 67, 'poly'], ['pad', 60, 'poly'], ['epiano', 60, 'poly'], ['synbass', 38, 'mono'], ['stab', 60, 'poly'],
];
const PHRASE = `(oc, out, t, X) => {
  const I = N.audio._internal.INST, name = '__N', b = __B, kind = '__K', st = {};
  const play = (m, d, ev, s) => I[name](oc, out, t, Array.isArray(m) ? m : [m], d * 0.95, 1, ev || {}, s || st);
  if (kind === 'poly') { [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7, 12]].forEach((c, i) => { play(c.map((x) => b + x), 1.1); t += 1.2; }); play([b + 4], 0.5); return; }
  if (kind === 'drone') { for (const m of [b + 7, b + 12, b + 12, b]) { play(m, 1.2, {}, {}); t += 1.25; } return; }
  const mel = [[0, 0.3], [2, 0.3], [4, 0.6], [7, 0.9, { glide: true }], [5, 0.3], [4, 0.3], [2, 0.3, { glide: true }], [0, 1.2]];
  for (const [d, len, ev] of mel) { play(b + d, len, ev); t += len; }
  if (kind === 'trem') { play(b + 7, 1.2, { trem: true }); t += 1.3; }
  if (kind === 'pluck' || kind === 'trem') { play([b, b + 4, b + 7], 1.4, {}, {}); }
}`;
const KITS = {
  tabla: ['na', 'ta', 'tin', 'tun', 'ti', 'te', 'ra', 'tit', 'tak', 'ge', 'ghe', 'geu', 'ged', 'ka', 'ke', 'ki', 'dha', 'dhin', 'dhit', 'dhet', 'dhun', 'dhi'],
  dholak: ['D', 'g', 't', 'k', 'c', 'chi', 'na', 'dha'], dhol: ['D', 't', 'R', 'd', 'dt'], band: ['B', 'S', 'R', 'C', 'M', 'P', 'p', 'T'],
  dappu: ['D', 'T', 't', 'R', 'k'], tasha: ['T', 't', 'R', 'D'], marfa: ['B', 'b', 'k', 't'], clap: ['x', 'X', 's'],
  kit: ['k', 's', 'h', 'o', 'c', 't', 'r', 'x', 'l', 'f'], machine: ['k', 's', 'h', 'o', 'c', 't', 'r', 'x', 'b', 'l'], ghatam: ['D', 'T', 't', 'k', 'R'], matka: ['D', 'T'],
};

// spectrum helpers (node side)
function spectrum(L, r, from, to, N) {
  const m = L.mono(r), sr = r.sr; N = N || 8192;
  const s0 = Math.floor(from * sr), s1 = Math.min(m.length, Math.floor(to * sr));
  const acc = new Float64Array(N / 2);
  for (let s = s0; s + N <= s1 || s === s0; s += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N && s + i < m.length; i++) re[i] = m[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    fftLocal(re, im);
    for (let k = 0; k < N / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
    if (s + N > s1) break;
  }
  return { p: acc, hz: (k) => (k * sr) / N, bin: (hz) => Math.round((hz * N) / sr) };
}
function fftLocal(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2, br = re[b] * cr - im[b] * ci, bi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - br; im[b] = im[a] - bi; re[a] += br; im[a] += bi;
        const tt = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = tt;
      }
    }
  }
}
const band = (S, lo, hi) => { let e = 0; for (let k = S.bin(lo); k <= S.bin(hi); k++) e += S.p[k] || 0; return e; };
function peakHz(S, lo, hi) { let bk = S.bin(lo), bv = 0; for (let k = S.bin(lo); k <= S.bin(hi); k++) if (S.p[k] > bv) { bv = S.p[k]; bk = k; } const a = S.p[bk - 1], b = S.p[bk], c = S.p[bk + 1]; const d = (a - c) / (2 * (a - 2 * b + c) || 1); return S.hz(bk + (Number.isFinite(d) ? d : 0)); }

module.exports = {
  name: 'instruments', order: 40,
  async run(T) {
    const { L, page, check, log } = T;
    const only = process.env.INST ? process.env.INST.split(',') : null;
    const want = (n) => !only || only.includes(n);
    const M = {}, R = {};
    const api = await T.ev(() => { const I = N.audio.ext.instruments; return I ? { names: I.names, kits: I.kits } : null; });
    check(api && api.names.length >= 30, 'audio_instruments.js registered (N.audio.ext.instruments)', api && api.names.length);
    const have = await T.ev(() => ({ inst: Object.keys(N.audio._internal.INST), kits: Object.keys(N.audio._internal.KITS).reduce((o, k) => { o[k] = Object.keys(N.audio._internal.KITS[k]); return o; }, {}) }));
    const missI = INSTS.map((x) => x[0]).filter((n) => !have.inst.includes(n));
    check(!missI.length, 'every contract instrument name exists', missI);
    const missK = []; for (const k in KITS) for (const s of KITS[k]) if (!have.kits[k] || !have.kits[k].includes(s)) missK.push(k + '.' + s);
    check(!missK.length, 'every contract kit stroke exists', missK);

    // ---- instruments
    for (const [name, b, kind] of INSTS) {
      if (!want(name)) continue;
      const sec = kind === 'poly' ? 6.4 : kind === 'drone' ? 7 : kind === 'trem' ? 9 : 7.5;
      const r = await L.renderFn(page, PHRASE.replace('__N', name).replace('__B', b).replace('__K', kind), sec);
      const m = L.save(r, 'inst_' + name);
      M[name] = m; R[name] = r;
      check(m && m.peakDb >= -14 && m.peakDb <= -1 && m.clicks === 0 && Math.abs(m.dc) < 0.01, `inst ${name}: peak -14..-1 dBFS, no clicks, no DC`, m);
      if (process.env.AQ_VERBOSE) log(name + ' ' + JSON.stringify(m));
    }
    // ---- instrument character
    if (M.sitar && M.santoor) check(M.sitar.highFrac > M.santoor.highFrac * 1.3 && M.sitar.highFrac > 0.02, 'sitar jawari: more >5 kHz buzz energy than santoor', [M.sitar.highFrac, M.santoor.highFrac]);
    if (M.tanpura && M.santoor) {
      const S = spectrum(L, R.tanpura, 1.5, 5), hi = band(S, 1500, 6000) / band(S, 60, 6000);
      check(hi > 0.05, 'tanpura: buzzing jawari overtone band (1.5-6 kHz share of energy)', +hi.toFixed(3));
    }
    if (want('sitar')) { // taraf: one short note; the main string is damped ~1.3 s, the sympathetic strings ring on
      const lv = [];
      for (const m of [62, 57, 66]) {
        const r = await L.renderFn(page, `(oc, out, t) => N.audio._internal.INST.sitar(oc, out, t, [${m}], 0.3, 1, {}, {})`, 3);
        if (m === 62) L.save(r, 'inst_sitar_taraf');
        const a = band(spectrum(L, r, 0, 0.3, 4096), 100, 8000), b = band(spectrum(L, r, 1.6, 2.4, 4096), 100, 8000);
        lv.push(+(10 * Math.log10(b / a)).toFixed(1));
      }
      check(lv.every((x) => x > -44 && x < -20), 'sitar: sympathetic taraf strings ring on after the played note is damped (-44..-20 dB)', lv);
    }
    if (M.shehnai && M.bansuri) check(M.shehnai.centroid > M.bansuri.centroid * 1.5, 'shehnai brighter (nasal reed) than bansuri', [M.shehnai.centroid, M.bansuri.centroid]);
    if (M.bansuri) { const S = spectrum(L, R.bansuri, 0, 3.5); check(band(S, 3000, 10000) / band(S, 200, 10000) > 0.002, 'bansuri: breath noise present above 3 kHz', +(band(S, 3000, 10000) / band(S, 200, 10000)).toFixed(4)); }
    for (const ch of ['choir', 'choir_oo']) {
      if (!M[ch]) continue;
      // envelope of the spectrum in 1/3-octave bands: 'aah' F1 ~800 Hz / F2 ~1150 Hz; 'ooh' F1 ~340 Hz
      const S = spectrum(L, R[ch], 0.3, 4.5);
      const b3 = (hz) => band(S, hz / 1.12, hz * 1.12) / Math.max(1, S.bin(hz * 1.12) - S.bin(hz / 1.12));
      if (ch === 'choir') check(b3(800) > b3(1800) * 4 && b3(1150) > b3(2200) * 3, 'choir "aah": formant peaks F1/F2 (~800/1150 Hz) above 1.8-2.2 kHz', [b3(800), b3(1150), b3(1800), b3(2200)].map((x) => +x.toExponential(1)));
      else check(b3(1500) < b3(400) / 20, 'choir "ooh": energy concentrated low (F1 ~340 Hz)', [b3(400), b3(1500)].map((x) => +x.toExponential(1)));
    }
    if (M.tuba && M.trumpet) check(M.tuba.centroid < M.trumpet.centroid, 'tuba darker than trumpet', [M.tuba.centroid, M.trumpet.centroid]);

    // ---- kits
    const KM = {};
    for (const kit in KITS) {
      if (!want(kit)) continue;
      const bad = [];
      for (const s of KITS[kit]) {
        const r = await L.render(page, kit, 1.6, { stroke: s, tune: 294 });
        const m = L.save(r, 'kit_' + kit + '_' + s);
        KM[kit + '.' + s] = { m, r };
        if (!(m && m.peakDb >= -16 && m.peakDb <= -1 && m.clicks === 0 && Math.abs(m.dc) < 0.01)) bad.push(s + ' ' + JSON.stringify(m));
      }
      check(!bad.length, `kit ${kit}: every stroke peak -16..-1 dBFS, no clicks, no DC (${KITS[kit].length})`, bad);
    }
    if (KM['tabla.tin']) {
      const S = spectrum(L, KM['tabla.tin'].r, 0.05, 0.6), f = peakHz(S, 200, 400);
      check(Math.abs(f / 294 - 1) < 0.03, 'tabla tin: clear pitched peak at the tuning (294 Hz)', +f.toFixed(1));
      const h = [1, 2, 3].map((k) => band(S, 294 * k * 0.97, 294 * k * 1.03) / band(S, 294 * (k + 0.4), 294 * (k + 0.6)));
      check(h.every((x) => x > 8), 'tabla tin: harmonic syahi modes 1-3 stand out', h.map((x) => +x.toFixed(1)));
    }
    for (const [s, minRise] of [['ge', 1.08], ['geu', 1.15]]) {
      if (!KM['tabla.' + s]) continue;
      const fs = [0.03, 0.12, 0.21, 0.3].map((t0) => peakHz(spectrum(L, KM['tabla.' + s].r, t0, t0 + 0.1, 4096 * 2), 50, 200));
      check(fs[3] / fs[0] > minRise && fs[1] > fs[0], `tabla ${s}: bayan gumki pitch rises over 300 ms (x${minRise})`, fs.map((x) => +x.toFixed(1)));
    }
    if (KM['tabla.ged']) { const fs = [0.03, 0.3].map((t0) => peakHz(spectrum(L, KM['tabla.ged'].r, t0, t0 + 0.1, 8192), 50, 200)); check(fs[1] < fs[0] * 0.93, 'tabla ged: bayan pitch falls', fs.map((x) => +x.toFixed(1))); }
    if (KM['tabla.na'] && KM['tabla.ti']) check(KM['tabla.na'].m.loud95 > KM['tabla.ti'].m.loud95 && KM['tabla.ti'].m.dur > 0, 'tabla: open na rings longer than closed ti', [KM['tabla.na'].m.loud95, KM['tabla.ti'].m.loud95]);
    if (KM['clap.X']) { const m = KM['clap.X'].m; check(m.centroid > 900 && m.centroid < 4000, 'clap X: hand-clap band (centroid 0.9-4 kHz)', m.centroid); }

    // ---- CPU: 20 s of a busy arrangement (sitar melody, bansuri lead, strings, choir, bass, tabla, claps) rendered offline
    if (!only) {
      const res = await T.ev(async () => {
        const I = N.audio._internal.INST, K = N.audio._internal.KITS, X = N.audio.ext;
        const t0 = performance.now();
        const r = await N.audio.renderOffline((oc, out, t) => {
          const st = { s: {}, b: {}, sb: {} };
          const scale = [0, 2, 4, 5, 7, 9, 11, 12];
          for (let i = 0; i < 160; i++) {
            const tt = t + i * 0.125;
            if (i % 2 === 0) I.sitar(oc, out, tt, [62 + scale[(i * 3) % 8]], 0.24, 0.7, { glide: i % 10 === 4 }, st.s);
            if (i % 4 === 0) I.bansuri(oc, out, tt, [74 + scale[(i * 5) % 8]], 0.48, 0.7, {}, st.b);
            if (i % 16 === 0) { I.strings(oc, out, tt, [60, 64, 67], 1.9, 0.5, {}, {}); I.choir(oc, out, tt, [57, 64, 69], 1.9, 0.4, {}, {}); }
            if (i % 4 === 0) I.bass(oc, out, tt, [38 + scale[i % 5]], 0.4, 0.7, {}, st.sb);
            X.P.drumHit(oc, out, tt, 'tabla', ['dha', 'ge', 'na', 'ti', 'na', 'ka', 'dhin', 'na'][i % 8], 0.6, 294);
            if (i % 8 === 4) X.P.drumHit(oc, out, tt, 'clap', 'X', 0.5, 0);
          }
        }, 20.5, { gain: 0.5 });
        const ms = performance.now() - t0;
        return { ms, peak: r.peak, ks: X.instruments.stats };
      });
      log('busy 20 s offline render: ' + Math.round(res.ms) + ' ms; note buffers: ' + res.ks.renders + ' renders, avg ' + (res.ks.renderMs / Math.max(1, res.ks.renders)).toFixed(1) + ' ms, max ' + res.ks.maxMs.toFixed(1) + ' ms');
      check(res.ms < 9000, 'busy 20 s arrangement renders offline in < 9 s', Math.round(res.ms));
      check(res.ks.renderMs / Math.max(1, res.ks.renders) < 25 && res.ks.maxMs < 80, 'note-buffer render (KS / modal) avg < 25 ms, max < 80 ms', [res.ks.renderMs / res.ks.renders, res.ks.maxMs]);
      // pre-rendered string costs per model (one buffer each)
      const per = await T.ev(() => { const I = N.audio.ext.instruments, o = {}; for (const k of ['sitar', 'santoor', 'tanpura', 'veena', 'musicbox']) { const t0 = performance.now(); if (I.MODAL[k]) I.noteBuf(new OfflineAudioContext(1, 128, 44100), k, 61); else I.renderString(k, 50); o[k] = +(performance.now() - t0).toFixed(1); } return o; });
      log('per-buffer render ms ' + JSON.stringify(per));
    }
  },
};
