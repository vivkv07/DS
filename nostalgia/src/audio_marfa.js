/* NOSTALGIA — audio_marfa.js  (N.audio.ext) — the Hyderabadi marfa band as a second background music.
 *
 * Marfa: the drum band of the Siddi families of Barkas and the Old City, at every Hyderabadi wedding and procession:
 * the big marfa drum beaten with sticks (deep BOOM, the stick slap), the dhol, the tight tasha kettle drums rolling,
 * the jhanjh (thick hand cymbals) and the dancers' shouts, in a rolling triplet groove; a clarinet or a shehnai,
 * sometimes a brass band, playing over it. All of it synthesised and original (no recordings, no film tunes).
 *
 * Every piece is in 12 steps a bar = four beats of three (the triplet gallop), in Hijaz (S r G m P d n: the
 * augmented step r -> G that the Deccan's wedding bands love):
 *   marfa_day      Barkas Ki Marfa        92 -> 100 bpm, D: marfa + dhol + jhanjh + claps, clarinet call and answer,
 *                                         the shehnai joins, a drum break, faster to the end (~74 s, one pass)
 *   marfa_night    Raat Ki Marfa          66 bpm, A: the band resting after the wedding: soft marfa and taps,
 *                                         harmonium and tanpura, sarangi and shehnai (~71 s, one pass)
 *   marfa_oldcity  Charminar Ki Baraat    96 -> 106 bpm, B-flat: the baraat: trumpet + clarinet tune, brass stabs,
 *                                         tuba, three levels of drums and shouts (~66 s, one pass)
 *   marfa_chase    Marfa Ki Daud          120 bpm: pounding marfa, tasha rolls, a shehnai riff (loops)
 * New kits: jhanjh (J open clash, j closed chik, Z big clash), hoi (H "HOI!", h "hey!", O "ho-o-oi!": the dancers).
 * Style 'marfa' (N.audio.music.setStyle / the B key): day, HITEC and cantonment -> marfa_day, night -> marfa_night,
 * the Old City -> marfa_oldcity, the Chappal Meter chase -> marfa_chase.
 */
(() => {
  'use strict';
  const N = window.N;
  const X = N.audio && N.audio.ext;
  if (!X || !X.registerStyle) return;
  const P = X.P;
  const KITS = (N.audio._internal && N.audio._internal.KITS) || {};

  /* ============================================================ kits: jhanjh, the dancers' shouts */
  X.registerKit('jhanjh', {
    // two thick plates clashed and left to ring; held together (chik); the big accent
    J: (ac, o, t, v) => { P.burst(ac, o, t, { ft: 'highpass', f: 5200, a: 0.001, r: 0.34, v: 0.2 * v }); P.burst(ac, o, t, { f: 3300, q: 1.4, a: 0.001, r: 0.1, v: 0.12 * v }); P.strike(ac, o, t, 1850, P.METAL, 0.032 * v, 0.42); return P.strike(ac, o, t + 0.003, 2015, P.METAL, 0.026 * v, 0.38); },
    j: (ac, o, t, v) => { P.burst(ac, o, t, { ft: 'highpass', f: 6200, a: 0.001, r: 0.05, v: 0.2 * v }); return P.strike(ac, o, t, 1900, P.METAL, 0.012 * v, 0.05); },
    Z: (ac, o, t, v) => { P.burst(ac, o, t, { ft: 'highpass', f: 4600, a: 0.001, r: 0.9, v: 0.24 * v }); P.strike(ac, o, t, 1700, P.METAL, 0.04 * v, 0.9); return P.strike(ac, o, t + 0.004, 1890, P.METAL, 0.034 * v, 0.8); },
  });
  const shout = (sy, n, f0, v) => (ac, o, t, vel) => {
    P.burst(ac, o, t, { kind: 'pink', f: 1500, q: 0.8, a: 0.004, r: 0.05, v: 0.1 * vel }); // the breath of the 'h'
    return P.crowd(ac, o, t, { n, f0: f0 * P.rr(0.97, 1.03), spread: 4, jitter: 0.04, v: v * vel, sy });
  };
  X.registerKit('hoi', {
    H: shout([[0, 0.13, 'ho', 0, 1, 1], [0.12, 0.17, 'i', 2, 0.85, -4]], 6, 185, 0.55),
    h: shout([[0, 0.17, 'ay', 1, 1, -3]], 4, 200, 0.45),
    O: shout([[0, 0.42, 'o', 0, 0.9, 3], [0.4, 0.22, 'i', 5, 0.85, -5]], 6, 180, 0.5),
  });

  /* ============================================================ helpers (as audio_score.js) */
  const J = (...b) => b.join(' | ');
  const rep = (s, n) => Array(n).fill(s).join(' | ');
  const cyc = (n, pats, fill) => { const o = []; for (let i = 0; i < n; i++) o.push(fill && i % 4 === 3 ? fill : pats[i % pats.length]); return o.join(' | '); };
  const R12 = '. . . . . . . . . . . .', R4 = '. . . .';
  const reg = (id, def) => { try { X.registerTrack(id, def); } catch (e) { N.err('audio.marfa.' + id, e); } };
  X.registerScale('hijaz', [0, 1, 4, 5, 7, 8, 10]);
  // the marfa kit comes from audio_instruments.js; without it the band kit's bass drum and pops stand in
  const MK = KITS.marfa && KITS.marfa.B ? { kit: 'marfa', m: (p) => p } : { kit: 'band', m: (p) => p.replace(/[A-Za-z]+/g, (s) => ({ B: 'B', b: 'M', k: 'p', t: 'p' })[s] || s) };
  const TK = KITS.tasha && KITS.tasha.R ? { kit: 'tasha', m: (p) => p } : { kit: 'band', m: (p) => p.replace(/[A-Za-z]+/g, (s) => ({ T: 'T', t: 'p', R: 'R', D: 'P' })[s] || s) };

  /* ============================================================ the grooves (12 steps: beats on 0 3 6 9) */
  // marfa: B boom, b soft boom, k stick slap, t tap
  const MA1 = 'B . k B . k B k k B . k', MA2 = 'B . k B . k B . k B k k', MA3 = 'B . t B . k B . t B k t';
  const MAF = 'B k k B k k B k k B! . .', MAS = 'B . . k . k B . . k . k';
  const MAD = 'B k k B k k B k k B k k', MAD2 = 'B! k k B k k B! k k B k B!';
  // dhol: D boom, t crack, R roll, d soft
  const DH1 = 'D . t . t . D . t . t t', DH2 = 'D . t D . t . t D t . t', DHF = 'D t t D t t R . . D! . .', DHD = 'D t t D t t D t t D t t';
  // tasha: T crack, t light, R roll
  const TA1 = 'T t t T t t T t t T t t', TA2 = 'R . t T . t R . t T t t', TAF = 'R . . R . . R . . R R R', TAD = 'R t t R t t R t t R t T!';
  // jhanjh, claps, the shout at the end of a phrase
  const JH1 = '. . j . . j . . j . . j', JH2 = 'J . j . . j J . j . . j', JHD = 'J . j J . j J . j J . j';
  const CL1 = 'x . . . . . x . . . . .', CL2 = 'x . . x . . x . . x . .', CL3 = 'X . . x . x X . . x . x';
  const HO = '. . . . . . . . . H . .';

  // the band's drums (dk scales them: the tune on top has to come through) + a piece's own parts
  const BAND = (o, dk) => {
    const k = dk || 1;
    return Object.assign({
      marfa: { kit: MK.kit, div: 1, vol: 0.78 * k, rev: 0.12 },
      dhol: { kit: 'dhol', div: 1, vol: 0.42 * k, pan: -0.22, rev: 0.08 },
      tasha: { kit: TK.kit, div: 1, vol: 0.36 * k, pan: 0.28, rev: 0.1 },
      jh: { kit: 'jhanjh', div: 1, vol: 0.42 * k, pan: 0.12, rev: 0.15 },
      claps: { kit: 'clap', div: 1, vol: 0.4 * k, pan: -0.1, rev: 0.22 },
      hoi: { kit: 'hoi', div: 1, vol: 0.5 * k, rev: 0.28, pan: 0.05 },
    }, o);
  };

  /* ============================================================ marfa_day: Barkas Ki Marfa */
  // the clarinet's call (down to the hijaz cadence G-flat... F# Eb D) and the answer; the shehnai's own tune
  const CALL = J('5 - - 6 5 4 3 - - 2 - -', '3 - 4 5 - 4 3 2 - 1 - -', '1 - 2 3 - 4 5 - 6 ^1 - -', '7 6 5 6 - 5 4 3 2 1 - -');
  const RESP = J('^1 - - 7 6 - 5 - 6 7 - ^1', '6 - - 5 4 - 3 - 2 3 - -', '5 - 4 3 - 2 1 - 2 3 4 5', '3 - 2 1 - - . . . . . .');
  const SHB = J('5 - 6 5 - 4 5 - - . . .', '6 - 7 6 - 5 6 - - . . .', '7 - ^1 7 6 5 6 5 4 3 - -', '2 3 4 3 - 2 1 - - . . .',
    '5 - 6 5 - 4 5 - - 3 4 5', '6 - 7 6 - 5 6 - - 5 6 7', '^1 - 7 6 - 5 4 - 3 2 - 3', '1 - - - - - . . . . . .');
  reg('marfa_day', {
    name: 'Barkas Ki Marfa', bpm: 92, root: 62, scale: 'hijaz', meter: 12, loopTo: 1, gain: 0.9, roam: true,
    parts: BAND({
      cl: { inst: 'clarinet', div: 1, oct: 0, vol: 0.85, rev: 0.25, pan: -0.18 },
      sh: { inst: 'shehnai', div: 1, oct: 1, vol: 0.8, rev: 0.28, pan: 0.2, ev: { kan: true } },
    }, 0.75),
    sections: {
      intro: { bars: 2, marfa: MK.m(J('B! . . . . . B! . . . . .', 'B . . B . . B k k B! . .')), jh: J(R12, '. . . . . . . . . Z . .'), hoi: J(R12, HO) },
      A: { bars: 8, marfa: MK.m(cyc(8, [MA1, MA2], MAF)), dhol: cyc(8, [DH1, DH2], DHF), jh: JH1, claps: CL1, hoi: cyc(8, [R12], HO), cl: J(CALL, RESP) },
      B: { bars: 8, marfa: MK.m(cyc(8, [MA2, MA1], MAF)), dhol: cyc(8, [DH2, DH1], DHF), tasha: TK.m(cyc(8, [TA1, TA2], TAF)), jh: JH2, claps: CL2, hoi: cyc(8, [R12], HO),
        sh: SHB, cl: SHB, vol: { cl: 0.55 } },
      brk: { bars: 4, marfa: MK.m(J(MAS, MAS, MAS, MAF)), dhol: J('d . . . . . d . . . . .', 'd . . . . . d . . . . .', DH1, DHF),
        tasha: TK.m(J(R12, R12, 'R . . R . . R . . R . .', TAF)), claps: J(CL2, CL2, CL3, CL3), jh: J(R12, R12, JH1, '. . . . . . . . . Z . .'),
        hoi: J(R12, '. . . . . . . . . h . .', R12, '. . . . . . H . . H . .') },
      A2: { bars: 8, marfa: MK.m(cyc(8, [MA1, MA2], MAF)), dhol: cyc(8, [DH1, DH2], DHF), tasha: TK.m(TA1), jh: JH2, claps: CL2, hoi: cyc(8, [R12], HO),
        cl: J(CALL, RESP), sh: J(rep(R12, 4), RESP), vol: { tasha: 0.8 } },
      C: { bars: 8, bpm: [92, 100], marfa: MK.m(cyc(8, [MAD, MAD2], MAF)), dhol: cyc(8, [DHD, DH2], DHF), tasha: TK.m(cyc(8, [TAD, TA1], TAF)), jh: JHD, claps: CL3,
        hoi: cyc(8, [R12], HO), sh: SHB, cl: SHB, vol: { marfa: 1.05, cl: 0.6 } },
      end: { bars: 1, bpm: 100, marfa: MK.m('B! . . B! . . B! . . . . .'), dhol: 'D! . . D! . . D! . . . . .', tasha: TK.m('R . . R . . T! . . . . .'), jh: '. . . . . . Z . . . . .', hoi: '. . . . . . O . . . . .', sh: '1 - - 1 - - 1 - - - - -' },
    },
    order: ['intro', 'A', 'B', 'brk', 'A2', 'C', 'end'],
  });

  /* ============================================================ marfa_night: Raat Ki Marfa */
  const NM1 = 'b . . t . t b . . t . .', NM2 = 'b . . t . . b . t t . .', NMF = 'b . t b . t b . t B . .';
  const SAR = J('~5 - - 6', '5 - 4 3', '~2 - - 3', '1 - - -', '3 - 4 5', '~6 - 5 4', '3 - ~2 -', '1 - - -');
  const SHN = J('^1 - - 7', '6 - 5 -', '6 - 7 ^1', '~^2 - ^1 -', '7 - 6 5', '4 - 3 -', '~2 - - 3', '1 - - -');
  reg('marfa_night', {
    name: 'Raat Ki Marfa', bpm: 66, root: 57, scale: 'hijaz', meter: 12, loopTo: 1, gain: 1.0, roam: true,
    parts: {
      marfa: { kit: MK.kit, div: 1, vol: 0.7, rev: 0.3 },
      dhol: { kit: 'dhol', div: 1, vol: 0.3, pan: -0.2, rev: 0.2 },
      jh: { kit: 'jhanjh', div: 1, vol: 0.3, pan: 0.2, rev: 0.35 },
      drone: { inst: 'tanpura', div: 3, oct: -1, vol: 0.45, rev: 0.35 },
      hm: { type: 'chord', inst: 'harmonium', div: 12, oct: -1, vol: 0.3, rev: 0.3, pan: -0.15 },
      sar: { inst: 'sarangi', div: 3, oct: 0, vol: 0.75, rev: 0.4, pan: -0.1, ev: { gamak: 0.3 } },
      sh: { inst: 'shehnai', div: 3, oct: 0, vol: 0.55, rev: 0.45, pan: 0.2 },
    },
    sections: {
      intro: { bars: 2, cdiv: 12, chords: '1 1', drone: '5 ^1 ^1 1', hm: 'x', marfa: MK.m(J(R12, 'b . . . . . b . . . . .')), sar: J('. . . ~5', '- - 4 3') },
      A: { bars: 8, cdiv: 12, chords: '1 1 7 1 2 1 7 1', drone: '5 ^1 ^1 1', hm: 'x', marfa: MK.m(cyc(8, [NM1, NM2], NMF)), dhol: 'd . . . . . . . . . . .',
        jh: '. . . . . . j . . . . .', sar: SAR },
      B: { bars: 8, cdiv: 12, chords: '4 1 2 1 4 1 2 1', drone: '5 ^1 ^1 1', hm: 'x', marfa: MK.m(cyc(8, [NM2, NM1], NMF)), dhol: 'd . . . . . d . . . . .',
        jh: '. . . . . . j . . . . j', sh: SHN, sar: J(rep(R4, 6), '5 - - -', '1 - - -'), vol: { sar: 0.6 } },
      C: { bars: 8, cdiv: 12, chords: '1 1 7 1 2 1 7 1', drone: '5 ^1 ^1 1', hm: 'x', marfa: MK.m(cyc(8, [NM1, 'b . . . . . b . . t . .'], NMF)), dhol: 'd . . . . . . . . . . .',
        jh: '. . . . . . j . . . . .', sar: SAR, sh: J(rep(R4, 4), '3 - 4 5', '~6 - 5 4', '3 - ~2 -', '1 - - -'), vol: { sh: 0.75 } },
    },
    order: ['intro', 'A', 'B', 'C'],
  });

  /* ============================================================ marfa_oldcity: Charminar Ki Baraat */
  const BA1 = J('1 - 3 - 4 - 5 - - 4 5 6', '5 - - 4 3 - 2 - 3 - - -', '4 - 5 - 6 - 5 - 4 3 - 2', '3 - - 2 1 - - - . . . .');
  const BA2 = J('5 - 6 - 7 - ^1 - - 7 ^1 ^2', '^1 - - 7 6 - 5 - 6 - - -', '5 - 6 5 4 - 3 4 5 - 4 3', '2 - - 1 _7 - 1 - - . . .');
  const BA_CH = '1 1 4 1 1 2 4 1';
  reg('marfa_oldcity', {
    name: 'Charminar Ki Baraat', bpm: 96, root: 58, scale: 'hijaz', meter: 12, loopTo: 1, gain: 0.85, roam: true,
    parts: BAND({
      tpt: { inst: 'trumpet', div: 1, oct: 1, vol: 1.0, rev: 0.22, pan: -0.12 },
      cl: { inst: 'clarinet', div: 1, oct: 1, vol: 0.62, rev: 0.22, pan: 0.18 },
      brass: { type: 'chord', inst: 'brass', div: 3, oct: 0, vol: 0.3, rev: 0.18, pan: -0.25 },
      tuba: { inst: 'tuba', div: 3, oct: -2, vol: 0.62, rev: 0.08 },
    }, 0.66),
    sections: {
      intro: { bars: 2, marfa: MK.m(J('B! . . B! . . B! . . B! . .', MAF)), tasha: TK.m(J(TAF, 'R R R R R R R R R T! . .')), jh: J(R12, '. . . . . . . . . Z . .'), hoi: J(R12, HO) },
      L1: { bars: 8, cdiv: 12, chords: BA_CH, marfa: MK.m(cyc(8, [MA1, MA3], MAF)), dhol: cyc(8, [DH1, DH2], DHF), jh: JH1, claps: CL1, hoi: cyc(8, [R12], HO),
        tpt: J(BA1, BA2), tuba: 'r . f .' },
      L2: { bars: 8, cdiv: 12, chords: BA_CH, marfa: MK.m(cyc(8, [MA2, MA1], MAF)), dhol: cyc(8, [DH2, DH1], DHF), tasha: TK.m(cyc(8, [TA1, TA2], TAF)), jh: JH2, claps: CL2,
        hoi: cyc(8, [R12], HO), tpt: J(BA1, BA2), cl: J(BA1, BA2), brass: 'x . x .', tuba: 'r . f .', vol: { tpt: 1.15, cl: 1.1 } },
      brk: { bars: 4, marfa: MK.m(J(MAS, MAS, MAD, MAF)), dhol: J(DH1, DH1, DHD, DHF), tasha: TK.m(J(R12, TA2, TAF, TAF)), claps: J(CL2, CL2, CL3, CL3),
        hoi: J('H . . . . . . . . . . .', R12, 'H . . . . . H . . . . .', HO), jh: J(R12, JH1, JHD, '. . . . . . . . . Z . .') },
      L3: { bars: 12, bpm: [100, 106], cdiv: 12, chords: BA_CH + ' 1 1 4 1', marfa: MK.m(cyc(12, [MAD, MAD2], MAF)), dhol: DHD, tasha: TK.m(cyc(12, [TAD, TA1], TAF)), jh: JHD, claps: CL3,
        hoi: cyc(12, [R12], HO), tpt: J(BA1, BA2, BA1), cl: J(BA1, BA2, BA1), brass: 'x . x x', tuba: 'r . f .', vol: { tpt: 1.22, cl: 1.15 } },
      tag: { bars: 2, bpm: 106, cdiv: 12, chords: '1 1', marfa: MK.m(J('B! . . B! . . B! . . B! . .', 'B! . . . . . . . . . . .')), dhol: J('D! . . D! . . D! . . D! . .', 'D! . . . . . . . . . . .'),
        tasha: TK.m(J('R R R R R R R R R R R R', 'T! . . . . . . . . . . .')), jh: J(R12, 'Z . . . . . . . . . . .'), hoi: J(R12, 'O . . . . . . . . . . .'),
        tpt: J('5 - 4 3 - 2 1 - - 1 - -', '1 - - - - - . . . . . .'), cl: J('5 - 4 3 - 2 1 - - 1 - -', '1 - - - - - . . . . . .'), brass: 'x . . . | x . . .', tuba: 'r . . . | r . . .' },
    },
    order: ['intro', 'L1', 'L2', 'brk', 'L3', 'tag'],
  });

  /* ============================================================ marfa_chase: Marfa Ki Daud */
  const CR = J('5 5 . 5 6 5 4 - 3 2 - 3', '4 4 . 4 5 4 3 - 2 1 - -');
  const CR2 = J('^1 ^1 . ^1 7 6 7 - 6 5 - 6', '7 6 5 4 3 2 3 - 2 1 - -');
  reg('marfa_chase', {
    name: 'Marfa Ki Daud', bpm: 120, root: 62, scale: 'hijaz', meter: 12, loopTo: 0, gain: 0.82,
    parts: BAND({ sh: { inst: 'shehnai', div: 1, oct: 1, vol: 1.1, rev: 0.2, pan: 0.15, ev: { kan: true } }, cl: { inst: 'clarinet', div: 1, oct: 0, vol: 0.7, rev: 0.2, pan: -0.2 } }, 0.6),
    sections: {
      A: { bars: 8, marfa: MK.m(cyc(8, [MAD, MA2], MAF)), dhol: cyc(8, [DHD, DH2], DHF), tasha: TK.m(cyc(8, [TAD, TA1], TAF)), jh: JHD, hoi: cyc(8, [R12], HO), sh: J(CR, CR, CR2, CR), cl: J(CR, CR, CR2, CR) },
      B: { bars: 8, marfa: MK.m(cyc(8, [MAD2, MAD], MAF)), dhol: DHD, tasha: TK.m(cyc(8, [TA1, TAD], TAF)), jh: JHD, claps: CL2, hoi: cyc(8, [R12], HO), sh: J(CR2, CR, CR2, CR), cl: J(CR2, CR, CR2, CR) },
    },
    order: ['A', 'B'],
  });

  /* ============================================================ the style */
  X.registerStyle('marfa', {
    name: 'Marfa band (Hyderabad)', short: 'MARFA',
    map: { day: 'marfa_day', hitec: 'marfa_day', cantonment: 'marfa_day', night: 'marfa_night', oldcity: 'marfa_oldcity', chase: 'marfa_chase', chase5: 'marfa_chase' },
  });
})();
