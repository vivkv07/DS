/* NOSTALGIA — audio_score.js  (owner: composer) — the whole original score, registered through N.audio.ext.
 * Every track keeps the core track format (audio.js "score notation + compiler"); this file only adds a small
 * compositional helper layer (bar joining, degree shifting, ornament/density doubling, drum-kit fallbacks).
 *
 * LEITMOTIF ("the question"): the title hook, Mohanam S R G P, up to D, falling P G to R and HANGING on R:
 *     1 - 2 - 3 - 5 - | 6 - - - 5 - 3 - | 2 - - - - - - -        (over I | IV vi | ii7, then V sus4: never resolved)
 *   It returns everywhere: half-remembered in `flashback` (R and D missing), as the bell figure's head in `day`
 *   (and its hitec / cantonment voicings), on santoor inside Yaman in `night`, at the end of `victory`, as the
 *   dance hook of the radio song `r_pager`, and in full in the Charminar `ending`, whose coda finally lands it on Sa.
 *
 * Track ids (story + director contract): title flashback day hitec cantonment night oldcity chase chase5 tension victory
 *   ending (sections alaap theme rise lift coda) festival ganesh ramzan kites numaish numaish_close
 *   r_chandni r_barish r_baraat r_neon r_pager, idents id_vani id_band id_pop.
 * Instruments: new names (musicbox, sarangi, tuba, choir, calliope, nadaswaram; kits dappu, tasha, marfa, machine)
 *   are chosen at load time only if src/audio_instruments.js registered them; otherwise a core instrument stands in.
 */
(() => {
  'use strict';
  const N = window.N;
  const X = N.audio && N.audio.ext;
  if (!X) return;
  const IN = N.audio._internal || {};
  const INST = IN.INST || {}, KITS = IN.KITS || {};

  /* ============================================================ helper layer */
  const inst = (...n) => n.find((k) => INST[k]) || n[n.length - 1];          // first registered instrument
  const kitHas = (k, st) => !!KITS[k] && st.every((s) => KITS[k][s]);
  const J = (...b) => b.join(' | ');                                          // join bars
  const rep = (s, n) => Array(n).fill(s).join(' | ');
  const R8 = '. . . . . . . .', R6 = '. . . . . .', R4 = '. . . .', R16 = '. . . . . . . . . . . . . . . .', R12 = '. . . . . . . . . . . .';
  const rests = (r, n) => rep(r, n);
  const cyc = (n, pats, fill) => { const o = []; for (let i = 0; i < n; i++) o.push(fill && i % 4 === 3 ? fill : pats[i % pats.length]); return o.join(' | '); };
  const lastFill = (n, pats, fill) => { const o = []; for (let i = 0; i < n; i++) o.push(i === n - 1 ? fill : pats[i % pats.length]); return o.join(' | '); };
  const NOTE = /^(~?)([\^_]*)([1-7])([b#]?)([!?]?)$/;
  // shift a melody by k scale degrees (octave-aware): shift('3 4 6', 1) -> '4 5 7'
  function shift(pat, k) {
    return pat.split(/\s+/).map((t) => {
      const m = NOTE.exec(t);
      if (!m) return t;
      let o = 0; for (const c of m[2]) o += c === '^' ? 1 : -1;
      const n = o * 7 + (+m[3] - 1) + k, no = Math.floor(n / 7), d = ((n % 7) + 7) % 7 + 1;
      return m[1] + (no > 0 ? '^'.repeat(no) : '_'.repeat(-no)) + d + m[4] + m[5];
    }).join(' ');
  }
  const bare = (t) => t.replace(/[!?]$/, '');
  // 8th-note tokens -> 16th tokens (same rhythm, twice the resolution; for mixing in 16th ornaments)
  const d2 = (pat) => pat.split(/\s+/).map((t) => (t === '|' ? t : t === '.' ? '. .' : t + ' -')).join(' ');
  // "double the density": every struck 8th not followed by a hold becomes a 16th turn (note + upper neighbour, ghosted)
  function orn(pat) {
    const tk = pat.split(/\s+/), o = [];
    tk.forEach((t, i) => {
      if (t === '|') { o.push(t); return; }
      if (t === '.' || t === '-') { o.push(t + ' ' + t); return; }
      let nx = tk[i + 1]; if (nx === '|') nx = tk[i + 2];
      o.push(nx === '-' ? t + ' -' : t + ' ' + shift(bare(t), 1).replace(/^~/, '') + '?');
    });
    return o.join(' ');
  }
  // drum kits with fallbacks: {kit, m(pattern)} maps strokes onto a core kit when the new kit is not registered
  function drum(pref, strokes, fb, map) {
    if (kitHas(pref, strokes)) return { kit: pref, m: (p) => p };
    return { kit: fb, m: (p) => p.replace(/[A-Za-z]+/g, (s) => (map[s] != null ? map[s] : s)) };
  }
  const DAPPU = drum('dappu', ['D', 'T', 't', 'R'], 'dhol', { T: 't', k: 't' });
  const TASHA = drum('tasha', ['T', 't', 'R'], 'band', { t: 'p', D: 'M' });
  const MARFA = drum('marfa', ['B', 'k'], 'band', { B: 'M', b: 'M', k: 'p', t: 'p' });
  const MACH = drum('machine', ['k', 's', 'h', 'o'], 'kit', { b: 'r', l: 't' });
  const MBOX = inst('musicbox', 'celesta', 'glock');
  const SARANGI = inst('sarangi', 'violin');
  const TUBA = inst('tuba', 'bass');
  const CHOIR = inst('choir', 'pad');
  const CALLIOPE = inst('calliope', 'harmonium1');

  // tabla thekas (8ths unless noted) with humanised variants (ghost '?', accent '!') and fills
  const KEH = 'dha ge na ti na ka dhi na', KEH2 = 'dha ge? na ti na? ka dhi na', KEH3 = 'dha ge na ti! na ka? dhi ge?';
  const KEHF = 'dha ti ra ki ta ka dha .', KEHF2 = 'dha . ti ra ki ta dha dha';
  const keh = (n, fill) => cyc(n, [KEH, KEH2, KEH, KEH3], fill || KEHF);
  // 16th keherwa (rise of the ending): sparse, filled, dense
  const K16A = 'dha . ge . na . ti . na . ka . dhi . na .', K16B = 'dha . ge ge? na . ti ra? ki ta ka . dhi . na ge?';
  const K16C = 'dha ge? na ge ti ra ki ta na ka? dhi ge na ge? dhi na', K16F = 'dha . ti ra ki ta dha . ti ra ki ta dha . dha .';
  const DADRA = 'dha dhi na dha tu na', DADRA2 = 'dha dhi? na dha tu? na!';

  const reg = (id, def) => { try { X.registerTrack(id, def); } catch (e) { N.err('audio.score.' + id, e); } };

  /* ============================================================ the leitmotif */
  const HOOK = '1 - 2 - 3 - 5 - | 6 - - - 5 - 3 - | 2 - - - - - - -';           // 3 bars, ends on R (the question)
  const HOOK_CH = '1 - 4 6:m 2:m7 - 5:s4 5';                                     // 4 bars, cdiv 8
  const HOOK2 = '1 - 2 - 3 - 5 - | 6 - ^1 - ^2 - ^1 6 | 6 - 5 3 2 - 3 5 | 5 - - - - - . .'; // answer phrase, ends on P
  const HOOK2_CH = '1 3:m 4 - 6:m 2:m7 5:s4 -';

  /* ============================================================ title: Yaadon Ki Gully */
  // E-flat, Mohanam melody over filmi diatonic harmony; music-box intro, bansuri hook, violin B section, slow keherwa.
  const T_A = J(HOOK, '. . _6 1 2 - - -', HOOK2);
  const T_B = '6 - - - ^1 - 6 - | 5 - - - 3 - 5 - | 6 - ^1 - ^2 - ^3 - | ^3 - - - ^2 ^1 6 - | ^1 - - - 6 - 5 - | 6 - 5 - 3 - 2 - | 3 - 5 - 6 - ^1 - | ^2 - - - - - . .';
  const T_B_CH = '6:m - 3:m - 4 - 1 - 6:m - 2:m7 - 4 5 5:s4 -';
  const T_CELLO = '3 - - - | 4 - 3 - | 4 - - - | 4 - - - | 3 - 5 - | 6 - - - | 3 - 4 - | 4 - 2 -';
  reg('title', {
    name: 'Yaadon Ki Gully', bpm: 84, root: 63, scale: 'major', meter: 16, loopTo: 1, gain: 0.85, tape: 0.16,
    parts: {
      drone: { inst: 'tanpura', div: 4, oct: -1, vol: 0.5, rev: 0.3, pan: -0.1 },
      mbox: { inst: MBOX, div: 2, oct: 1, vol: 0.55, rev: 0.5, pan: 0.2 },
      pad: { type: 'chord', inst: 'harmonium', div: 4, oct: -1, vol: 0.5, rev: 0.25, pan: 0.1 },
      str: { type: 'chord', inst: 'strings', div: 4, oct: 0, vol: 0.6, rev: 0.45 },
      flute: { inst: 'bansuri', div: 2, oct: 0, vol: 0.85, rev: 0.4, pan: 0.1 },
      vln: { inst: 'violin', div: 2, oct: 0, vol: 0.6, rev: 0.45, pan: -0.15 },
      cello: { inst: 'violin', div: 4, oct: -1, vol: 0.45, rev: 0.4, pan: -0.25 },
      santoor: { inst: 'santoor', div: 2, oct: 1, vol: 0.35, rev: 0.35, pan: 0.35 },
      sitar: { inst: 'sitar', div: 2, oct: 0, vol: 0.5, rev: 0.3, pan: -0.3 },
      bass: { inst: 'bass', div: 4, oct: -2, vol: 0.5 },
      tabla: { kit: 'tabla', div: 2, vol: 0.6, rev: 0.12, pan: 0.15 },
    },
    sections: {
      intro: { bars: 4, cdiv: 16, chords: '1 4 2:m7 5:s4', drone: '5 ^1 ^1 1', pad: 'x - - -', mbox: J(HOOK, R8), vol: { pad: 0.7 } },
      A: { bars: 8, cdiv: 8, chords: HOOK_CH + ' ' + HOOK2_CH, drone: '5 ^1 ^1 1', pad: 'x - x -', bass: 'r - r f', flute: T_A,
        santoor: 'r . f . o . f .', tabla: J(rests(R8, 2), KEH, KEHF2, keh(4)), vol: { tabla: 0.7, santoor: 0.8 } },
      B: { bars: 8, cdiv: 8, chords: T_B_CH, drone: '5 ^1 ^1 1', pad: 'x - x -', str: 'x - x -', bass: 'r - r f', vln: T_B,
        santoor: 'r t f o f t f t', tabla: keh(8), vol: { santoor: 0.6 },
        sitar: J(R8, '. . . . 5 - ~6 -', R8, '. . . . ^1 - 6 5', R8, '. . . . 3 - ~5 -', R8, R8) },
      A2: { bars: 8, cdiv: 8, chords: HOOK_CH + ' ' + HOOK2_CH, drone: '5 ^1 ^1 1', pad: 'x - x -', str: 'x - - -', bass: 'r - r f', flute: T_A, cello: T_CELLO,
        santoor: 'r f o ^t o f o f', tabla: keh(8), mbox: J(rests(R8, 7), '. . . . 5 - 3 -') },
      tag: { bars: 4, cdiv: 16, chords: '1 4 2:m7 5:s4', drone: '5 ^1 ^1 1', pad: 'x - - -', mbox: J(HOOK, R8), flute: J(rests(R8, 3), '. . _6 1 2 - - -'),
        tabla: J('dha . . . . . . .', R8, R8, R8), vol: { pad: 0.6, flute: 0.6 } },
    },
    order: ['intro', 'A', 'B', 'A2', 'tag'],
  });

  /* ============================================================ flashback: the hook half-remembered */
  // 70% tempo, heavy tape; the hook on sitar with two notes missing (R and D), music-box echoes out of time.
  reg('flashback', {
    name: 'Purani Cassette', bpm: 59, root: 63, scale: 'major', meter: 16, loopTo: 0, gain: 1.5, tape: 0.6,
    parts: {
      drone: { inst: 'tanpura', div: 4, oct: -1, vol: 0.8, rev: 0.45 },
      pad: { type: 'chord', inst: 'harmonium', div: 16, oct: -1, vol: 0.6, rev: 0.4 },
      sitar: { inst: 'sitar', div: 2, oct: 0, vol: 1.0, rev: 0.5, pan: -0.15 },
      mbox: { inst: MBOX, div: 2, oct: 1, vol: 0.6, rev: 0.7, pan: 0.3 },
    },
    sections: {
      A: { bars: 8, cdiv: 16, chords: '1 4 2:m7 5:s4 1 4 6:m 5:s4', drone: '5 ^1 ^1 1', pad: 'x',
        sitar: J('1 - . . 3 - 5 -', '. . . . 5 - 3 -', '2 - - - - - - -', R8, '1 - . . 3 - 5 -', '. . . . ~5 - 3 -', R8, R8),
        mbox: J(R8, R8, R8, '. . . . 5 - 3 -', R8, R8, '. . 2 - . . . .', R8) },
      B: { bars: 4, cdiv: 16, chords: '6:m 4 2:m7 5:s4', drone: '5 ^1 ^1 1', pad: 'x',
        sitar: '~3 - - - ~2 - - - | 1 - - - . . . . | ~6 - - - 5 - - - | ~3 - - - 2 - - -', mbox: J(R8, '. . . . . . 6 -', R8, R8) },
    },
    order: ['A', 'B'],
  });

  /* ============================================================ day / hitec / cantonment: Cycle Pe Sawaari */
  // D major with the bright natural Ma (Bilawal), 104 bpm keherwa. The bell figure P-D-P-G answers the hook's head.
  const D_A = '1 2 3 5 6 - 5 3 | 4 - 3 2 3 - - - | 5 6 5 3 5 6 ^1 - | 6 - 5 - 3 - 2 - | ^1 - 6 - ^1 ^2 ^1 6 | 5 - - 3 5 - 6 - | 4 - 3 2 _7 - 2 - | 1 - - - . . 5 6';
  const D_A_CH = '1 - 4 5 1 - 6:m 5 4 - 1 6:m 2:m 5 1 -';
  const D_CALL = J('^1 - 6 ^1 - 6 5 6', '4 - - - . . . .', R8, R8, '6 - 5 6 - 5 4 5', '2 - - - . . . .', R8, R8);
  const D_RESP = J(R8, '. . . . 3 4 5 6', '5 - 3 5 - 3 2 3', '1 - - - . . . .', R8, '. . . . 2 3 4 5', '4 - 3 2 - 3 4 -', '5 - - - - - . .');
  const D_B_CH = '4 - 4 - 1 - 1 - 2:m - 5 - 4 5 5:s4 5';
  const D_BELL = '5 6 5 3 . . 5 6 | 5 3 . . . . . . | 5 6 5 3 . . 5 6 | ^1 6 5 3 2 3 5 6';
  const D_BRK_CH = '1 - 1 - 4 - 5 -';
  // dholak keherwa in 16ths (D bass, g slide, t slap, k tip, c ring)
  const DH1 = 'D . g . t . k . t . k . D . t .', DH2 = 'D . g k? t . k . t k? k . D . t t?', DHF = 'D . t t D . t t D t t D t t D! .';
  function dayTrack(v) {
    const day = v === 'day', hi = v === 'hitec', ca = v === 'cantonment';
    const lead = hi ? { inst: 'synlead', div: 2, oct: 1, vol: 0.6, rev: 0.3, pan: 0.1 } : ca ? { inst: 'clarinet', div: 2, oct: 1, vol: 0.8, rev: 0.25, pan: 0.1 }
      : { inst: 'bansuri', div: 2, oct: 1, vol: 0.8, rev: 0.3, pan: 0.15 };
    const call = hi ? { inst: 'epiano', type: 'note', div: 2, oct: 1, vol: 0.7, rev: 0.25, pan: -0.3 } : ca ? { inst: 'trumpet', div: 2, oct: 1, vol: 0.6, rev: 0.25, pan: -0.25 }
      : { inst: 'mandolin', div: 2, oct: 1, vol: 0.55, rev: 0.2, pan: -0.35, trem: 4 };
    const parts = {
      lead, call,
      arp: hi ? { inst: 'synlead', div: 1, oct: 1, vol: 0.28, rev: 0.25, pan: -0.25, gate: 0.45 } : ca ? { inst: 'guitar', div: 2, oct: 0, vol: 0.4, pan: -0.3 }
        : { inst: 'santoor', div: 1, oct: 1, vol: 0.3, rev: 0.3, pan: 0.35 },
      bell: { inst: hi ? 'epiano' : 'glock', div: 2, oct: 1, vol: hi ? 0.45 : 0.4, rev: 0.3, pan: 0.25 },
      pad: { type: 'chord', inst: hi ? 'pad' : ca ? 'brass' : 'harmonium', div: 4, oct: 0, vol: hi ? 0.45 : ca ? 0.3 : 0.35, rev: 0.2, pan: -0.1 },
      bass: { inst: hi ? 'synbass' : ca ? TUBA : 'bass', div: 2, oct: hi ? -1 : -2, vol: hi ? 0.6 : 0.6 },
    };
    if (day) Object.assign(parts, { dholak: { kit: 'dholak', div: 1, vol: 0.6, rev: 0.08, pan: 0.15 }, tabla: { kit: 'tabla', div: 2, vol: 0.55, rev: 0.1, pan: -0.15 } });
    if (hi) Object.assign(parts, { dm: { kit: MACH.kit, div: 1, vol: 0.55 } });
    if (ca) Object.assign(parts, { snare: { kit: 'band', div: 1, vol: 0.5, pan: 0.1, rev: 0.12 } });
    // per-variant drum patterns
    const P = day ? { A: { dholak: cyc(8, [DH1, DH2], DHF) }, B: { tabla: keh(8) }, brk: { dholak: J(DH2, DHF, DH1, DHF) }, A2: { dholak: cyc(8, [DH2, DH1], DHF), tabla: J(rests(R8, 4), keh(4)) }, intro: { dholak: J('D . . . t . . . D . t . t . k k', DHF) }, out: { dholak: J(DH1, 'D! . . . . . . . . . . . . . . .') } }
      : hi ? { A: { dm: cyc(8, ['k . h . s . h k? . k h . s . h .', 'k . h . s . h . k . h k? s . o .'], 'k . h . s . h k s . s s? s s s! s') },
        B: { dm: cyc(8, ['k . h h? s . h . k k h . s . h h?', 'k . h . s . h . k . h . s . o .'], 'k . k . s s? s . k . t t t t t t') },
        brk: { dm: J('k . . . s . . . k . k . s . . .', 'k . . . s . . . k k . k s s s s', 'k . h . s . h . k . h . s . h .', 'k . t . t . t t t t s s s! s s s') },
        A2: { dm: cyc(8, ['k . h h? s . h k? . k h . s . h .', 'k . h . s . h . k . h k? s . o .'], 'k . h . s . h k s . s s? s s s! s') },
        intro: { dm: J('k . h . k . h . k . h . k . h h?', 'k . h . s . h . k . s s s s s! s') }, out: { dm: J('k . h . s . h . k . h . s . h .', 'k+x . . . . . . . . . . . . . . .') } }
        : { A: { snare: cyc(8, ['B . S? S B . S . B . S? S B S S .', 'B . S? . B . S S? B . S? S B . R .'], 'B . S S B . S S R R R R R R S! .') },
          B: { snare: cyc(8, ['B . . . S . . S? B . . . S . . .', 'B . . S? S . . . B . . . S . S? S?'], 'B . S . S . S S R R R R S . S! .') },
          brk: { snare: J('R . R . R . R . R R R R R R S! .', 'B . S . B . S . B B S S R R S! .', 'R . R . R . R . R R R R R R S! .', 'B+C . . . . . . . R R R R R R R R') },
          A2: { snare: cyc(8, ['B . S? S B . S . B . S? S B S S .', 'B . S? . B . S S? B . S? S B . R .'], 'B . S S B . S S R R R R R R S! .') },
          intro: { snare: J('R . R . R . R . R . R . R R R R', 'B . S . B . S . R R R R R R S! .') }, out: { snare: J('B . S . B . S . B . S . B . S .', 'B+C . . . . . . . . . . . . . . .') } };
    const ARP = hi ? 'r f o f t f o f r f o f t f o f' : ca ? 'r f o f t f o f' : 'r . f . o . f . t . f . o . f .';
    const sec = (o, k) => Object.assign(o, P[k]);
    return {
      name: day ? 'Cycle Pe Sawaari' : hi ? 'Cycle Pe Sawaari (Cyber Towers Mix)' : 'Cycle Pe Sawaari (Cantonment Band)',
      bpm: day ? 104 : hi ? 108 : 100, root: 62, scale: 'major', meter: 16, loopTo: 1, gain: hi ? 0.95 : ca ? 0.85 : 0.75, roam: true,
      parts,
      sections: {
        intro: sec({ bars: 2, cdiv: 8, chords: '1 - 5 -', call: '5 6 5 3 . . 5 6 | 5 3 . . 5 6 5 3', bass: 'r . . r . . f .', vol: { call: 1.1 } }, 'intro'),
        A: sec({ bars: 8, cdiv: 8, chords: D_A_CH, lead: D_A, bass: 'r . . r . . f .', pad: 'x - x -', arp: ARP, bell: J(R8, R8, '5 6 5 3 . . . .', R8, R8, R8, R8, R8), vol: { arp: 0.8 } }, 'A'),
        B: sec({ bars: 8, cdiv: 8, chords: D_B_CH, call: D_CALL, lead: D_RESP, bass: 'r . . r . r f .', pad: 'x - - -', arp: ARP, vol: { lead: 0.9 } }, 'B'),
        brk: sec({ bars: 4, cdiv: 8, chords: D_BRK_CH, call: D_BELL, bass: 'r . t . f . t .', bell: J(R8, '. . . . 5 6 5 3', R8, R8) }, 'brk'),
        A2: sec({ bars: 8, cdiv: 8, chords: D_A_CH, lead: D_A, bass: 'r . . r . . f .', pad: 'x - x -', arp: ARP, call: hi ? ARP.split(' ').slice(0, 8).join(' ') : 't - - - - - - -',
          bell: J(R8, R8, '5 6 5 3 . . . .', R8, R8, R8, '. . . . . . 5 6', '5 3 . . . . . .'), vol: { call: hi ? 0.5 : 0.7, arp: 1 } }, 'A2'),
        out: sec({ bars: 2, cdiv: 8, chords: '1 - 1 -', call: '5 6 5 3 2 - 1 - | 1 - - - . . . .', bell: '. . . . . . . . | ^1 - - - . . . .', bass: 'r . . r . . f . | r - - - . . . .' }, 'out'),
      },
      order: ['intro', 'A', 'B', 'brk', 'A2', 'out'],
    };
  }
  reg('day', dayTrack('day'));
  reg('hitec', dayTrack('hitec'));
  reg('cantonment', dayTrack('cantonment'));

  /* ============================================================ night: Chandni Chhat (Yaman) */
  // Bansuri phrases leaning on tivra Ma (scale degree 4 in 'yaman') and Ga (vadi) / Ni (samvadi), resolving home.
  // Rubato: every two-bar phrase is its own section with a ritardando; the next phrase picks the tempo up again.
  const NPH = [
    ['_7 - - 2 3 - - - | 3 - - - ~2 - 1 -', '1 5'],
    ['3 - 4 - 5 - - - | ~4 - - 3 ~2 - 3 -', '1 2'],
    ['5 - - - 4 5 6 - | 5 - - - ~4 - 3 -', '5 1'],
    ['2 - 3 - 4 - 3 - | ~2 - - - 1 - - -', '2 1'],
    ['3 - 5 - 7 - - - | ^1 - - - 7 - - -', '1 6:m'],
    ['7 - ^2 - ^3 - - - | ^2 - ^1 - 7 - - -', '3:m 5'],
    ['6 - 5 - 4 - 5 - | 3 - - - 4 - 2 -', '2 1'],
    ['3 - - - ~2 - - - | 1 - - - - - - -', '2 1'],
  ];
  const nightSec = (i, o) => {
    const [mel, ch] = NPH[i] || ['', '1 1'];
    return Object.assign({ bars: 2, bpm: i % 2 ? [70, 61] : [72, 68], cdiv: 16, chords: ch, drone: '5 ^1 ^1 1', pad: 'x', bass: 'r', flute: mel,
      santoor: i % 2 ? '. . . . . . . . | . . . . r f o .' : R8 + ' | ' + R8 }, o || {});
  };
  const NSOFT = 'dha . . ge? na . ti na?', NSOFT2 = 'dha . ge? . na ti? na ka?';
  reg('night', {
    name: 'Chandni Chhat', bpm: 72, root: 57, scale: 'yaman', meter: 16, loopTo: 0, gain: 0.62, roam: true,
    parts: {
      drone: { inst: 'tanpura', div: 4, oct: -1, vol: 0.5, rev: 0.4 },
      pad: { type: 'chord', inst: 'harmonium', div: 16, oct: -1, vol: 0.3, rev: 0.35 },
      str: { type: 'chord', inst: 'strings', div: 16, oct: 0, vol: 0.35, rev: 0.55 },
      flute: { inst: 'bansuri', div: 2, oct: 1, vol: 0.85, rev: 0.55, pan: 0.1 },
      santoor: { inst: 'santoor', div: 2, oct: 1, vol: 0.3, rev: 0.55, pan: -0.3 },
      mbox: { inst: MBOX, div: 2, oct: 1, vol: 0.45, rev: 0.6, pan: 0.3 },
      tabla: { kit: 'tabla', div: 2, vol: 0.4, rev: 0.2, pan: 0.2 },
      bass: { inst: 'bass', div: 16, oct: -2, vol: 0.35 },
    },
    sections: {
      p1: nightSec(0), p2: nightSec(1), p3: nightSec(2), p4: nightSec(3),
      p5: nightSec(4, { str: 'x', tabla: J(NSOFT, NSOFT2) }), p6: nightSec(5, { str: 'x', tabla: J(NSOFT, NSOFT2) }),
      p7: nightSec(6, { str: 'x', tabla: J(NSOFT, NSOFT2) }), p8: nightSec(7, { str: 'x', tabla: J(NSOFT, 'dha . . . . . . .') }),
      // the title hook, transplanted into Yaman on the music box; the bansuri answers leaning on tivra Ma
      h1: { bars: 2, bpm: [72, 68], cdiv: 16, chords: '1 2', drone: '5 ^1 ^1 1', pad: 'x', bass: 'r', mbox: '1 - 2 - 3 - 5 - | 6 - - - 5 - 3 -' },
      h2: { bars: 2, bpm: [70, 58], cdiv: 16, chords: '5 1', drone: '5 ^1 ^1 1', pad: 'x', bass: 'r', mbox: '2 - - - - - - - | . . . . . . . .', flute: '. . . . . . . . | 3 - 4 - 3 ~2 1 -' },
      r2: nightSec(1, { santoor: 'r . f . o . f . | r . f . o . . .' }), r4: nightSec(3, { bpm: [70, 54] }),
    },
    order: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'h1', 'h2', 'r2', 'r4'],
  });

  /* ============================================================ oldcity: Gulzar Houz Ki Shaam (Bhairav) */
  // 6/8 dadra with qawwali hand-claps on beats 1 and 4; harmonium calls, shehnai answers climbing a step each time,
  // a sarangi bridge, then harmonium + shehnai together. Accelerando across the pass (qawwali style). No vocals.
  const OC_CALL = '3 4 6 - 6 5 | 4 3 ~2 - 1 -';                        // G m d d P | m G r S  (vadi d, samvadi r)
  const ocResp = (d) => { const a = shift('1', d - 1), b = shift('1', d), c = shift('1', d - 2); return `${a} - ${b} ${a} - ${c} | ${a} - - - . .`; };
  const OC_CH = '1:M 6:M 4:m 1:M 1:M 2:M 1:M 1:M';                      // cdiv 6 (half bars): I bVI iv I | I bII I I
  const OCD1 = 'D . t k? t . D . k . t .', OCD2 = 'D . t . t k? D . k t? t .', OCDF = 'D t t D t t D t D t t t!';
  const OC_CLAP = 'x . . x . .', OC_CLAP2 = 'X . . x . .';
  const ocAB = (k) => ({ hl: J(shift(OC_CALL, k), R6, R6, shift(OC_CALL, k + 1), R6, R6), sh: J(R6, R6, ocResp(3 + k), R6, R6, ocResp(4 + k)),
    sar: J(R6, R6, '1 - - - - - | 1 - - - - -', R6, R6, '1 - - - - - | 1 - - - - -') });
  reg('oldcity', {
    name: 'Gulzar Houz Ki Shaam', bpm: 96, root: 62, scale: 'bhairav', meter: 12, loopTo: 0, gain: 1.0, roam: true,
    parts: {
      claps: { kit: 'clap', div: 2, vol: 0.7, rev: 0.25, pan: -0.15 },
      dholak: { kit: 'dholak', div: 1, vol: 0.6, rev: 0.1, pan: 0.15 },
      drone: { inst: 'tanpura', div: 3, oct: -1, vol: 0.35, rev: 0.3 },
      bass: { inst: 'bass', div: 6, oct: -2, vol: 0.5 },
      hc: { type: 'chord', inst: 'harmonium', div: 6, oct: -1, vol: 0.28, rev: 0.15, pan: -0.25 },
      hl: { inst: 'harmonium1', div: 2, oct: 0, vol: 0.85, rev: 0.25, pan: 0.05 },
      sh: { inst: inst('shehnai'), div: 2, oct: 1, vol: 0.55, rev: 0.3, pan: 0.3 },
      sar: { inst: SARANGI, div: 2, oct: 0, vol: 0.5, rev: 0.35, pan: -0.25 },
    },
    sections: {
      intro: { bars: 2, cdiv: 6, chords: '1:M 6:M 1:M 1:M', drone: '5 ^1 ^1 1', claps: OC_CLAP, hc: 'x -', hl: '5 - ~6 - 5 4 | 3 - ~2 - 1 -', dholak: J(R12, OCDF) },
      A: Object.assign({ bars: 8, cdiv: 6, chords: OC_CH, drone: '5 ^1 ^1 1', claps: OC_CLAP, hc: 'x -', bass: 'r f', dholak: cyc(8, [OCD1, OCD2], OCDF) }, ocAB(0)),
      B: Object.assign({ bars: 8, bpm: 100, cdiv: 6, chords: OC_CH, drone: '5 ^1 ^1 1', claps: J(OC_CLAP2, OC_CLAP), hc: 'x x', bass: 'r f', dholak: cyc(8, [OCD2, OCD1], OCDF), vol: { claps: 1.1, sh: 1.1 } }, ocAB(2)),
      C: { bars: 8, bpm: 96, cdiv: 12, chords: '6:M 4:m 1:M 5:M 2:M 6:M 4:m 1:M', drone: '5 ^1 ^1 1', claps: OC_CLAP, hc: 'x -', bass: 'r .', dholak: cyc(8, ['D . . k? t . D . . . t .', 'D . . . t . D . k? . t .'], 'D . t . t . D t D t t .'),
        sar: '~6 - - - 5 - | 4 - 3 - ~2 - | 3 - 4 - 6 - | 7 - - - ^1 - | ~^2 - - - ^1 - | 7 - 6 - 5 - | 4 - 3 - ~2 - | 1 - - - - -', vol: { sar: 1.3, claps: 0.8 } },
      D: { bars: 8, bpm: [100, 108], cdiv: 6, chords: '1:M 6:M 4:m 1:M 4:m 5:M 1:M 2:M 6:M 5:M 4:m 6:M 2:M 2:M 1:M 1:M', drone: '5 ^1 ^1 1', claps: J(OC_CLAP2, OC_CLAP2, OC_CLAP2, 'X . . x . x'), hc: 'x x', bass: 'r f',
        dholak: cyc(8, [OCD2, 'D . t k t . D k t . t k?'], OCDF),
        hl: '3 4 6 - 6 5 | 4 3 ~2 - 1 - | 4 6 7 - 7 6 | 7 ^1 ~^2 - ^1 - | ^1 7 6 - 6 5 | 4 3 4 6 5 4 | 3 - ~2 - - - | 1 - - - . .',
        sh: '3 4 6 - 6 5 | 4 3 ~2 - 1 - | 4 6 7 - 7 6 | 7 ^1 ~^2 - ^1 - | ^1 7 6 - 6 5 | 4 3 4 6 5 4 | 3 - ~2 - - - | 1 - - - . .', vol: { sh: 0.85, claps: 1.15 } },
    },
    order: ['intro', 'A', 'B', 'C', 'D'],
  });

  /* ============================================================ chase / chase5: Chappal Meter Full! */
  // D Mixolydian filmi brass band, 2/4 march at 148: trumpets + clarinet in unison, oom-pah tuba/bass, tom fills.
  const CH_A = '1 2 3 4 5 - 5 - | 6 5 4 3 4 - 4 - | 5 4 3 2 3 - 3 - | 2 3 2 1 _7 - 1 - | 1 2 3 4 5 6 7 ^1 | ^2 ^1 7 6 7 - 5 - | 6 5 4 3 2 3 4 2 | 1 - 5 - 1 - . .';
  const CH_A_CH = '1 - 4 - 1 - 7 1 1 - 7 - 4 2:m 1 -';
  const CH_T = '5 - ^1 - 7 6 5 - | . . . . . . . . | 6 - ^2 - ^1 7 6 - | . . . . . . . . | 5 - ^1 - 7 6 5 - | . . . . . . . . | 4 5 6 7 ^1 7 6 5 | 4 - 2 - 1 - . .';
  const CH_C = '. . . . . . . . | 5 4 3 4 5 - . . | . . . . . . . . | 6 5 4 5 6 - . . | . . . . . . . . | 5 4 3 4 5 - 3 - | 4 5 6 7 ^1 7 6 5 | 4 - 2 - 1 - . .';
  const CH_B_CH = '1 - 1 - 4 - 4 - 1 - 1 - 4 5:M 1 -';
  const MARCH = 'B . S? . B . S . B . S? . B S S? .', MARCH2 = 'B . S? S? B . S . B . S? . B . R .', MFILL = 'B . S S B . S S R R R R R R S! .';
  const TOMS = 't t t t l l l l f f f f t! . . .';
  const chaseDef = (five, tb = (p) => (five ? p : undefined)) => ({
    name: five ? 'Chappal Meter Full! (Srikanth Special)' : 'Chappal Meter Full!', bpm: 148, root: 62, scale: 'khamaj', meter: 16, loopTo: 0, gain: five ? 0.78 : 0.82,
    parts: {
      band: { kit: 'band', div: 1, vol: 0.62, rev: 0.12 },
      dhol: { kit: 'dhol', div: 1, vol: 0.5, pan: 0.2 },
      toms: { kit: 'kit', div: 1, vol: 0.6, pan: -0.15 },
      bass: { inst: TUBA, div: 2, oct: -2, vol: 0.65 },
      brass: { type: 'chord', inst: 'brass', div: 2, oct: 0, vol: 0.5, rev: 0.15, pan: -0.2 },
      tpt: { inst: 'trumpet', div: 2, oct: 1, vol: 0.75, rev: 0.2, pan: -0.1 },
      cl: { inst: 'clarinet', div: 2, oct: 1, vol: 0.7, rev: 0.2, pan: 0.2 },
      tuba: { inst: TUBA, div: 2, oct: -1, vol: 0.95, rev: 0.1 },
    },
    sections: {
      A: { bars: 8, cdiv: 8, chords: CH_A_CH, band: cyc(8, [MARCH, MARCH2], MFILL), dhol: 'D . t . . t D . D . t . . t t t', bass: 'r . f . r . f .', brass: '. x . x . x . x',
        tpt: CH_A, cl: CH_A, toms: J(rests(R16, 7), KITS.kit && KITS.kit.l ? TOMS : 't t t t t t t t t t t t t! . . .'),
        tuba: tb(J(rests(R8, 3), '5! . 5 . 1! - - .', rests(R8, 3), '5! . 5 . 1! - - .')) },
      B: { bars: 8, cdiv: 8, chords: CH_B_CH, band: cyc(8, [MARCH2, MARCH], MFILL), dhol: J(rep('D . t . . t D . D . t . . t t t', 7), 'D . t . D . t . R . R . R . R .'), bass: 'r . f . r . f .', brass: '. x . x . . x x',
        tpt: CH_T, cl: CH_C, tuba: tb(J(rests(R8, 3), '5! . 5 . 1! - - .', rests(R8, 4))) },
      A2: { bars: 8, cdiv: 8, chords: CH_A_CH, band: cyc(8, [MARCH, MARCH2], MFILL), dhol: 'D . t t . t D . D t t . D t t t', bass: 'r . f . r . f .', brass: 'x x . x . x . x',
        tpt: CH_A, cl: shift(CH_A, 2), toms: J(rests(R16, 3), 't . t . t t t t . . . . . . . .', rests(R16, 3), 't t t t t t t t t t t t t! . . .'),
        tuba: tb(J(rests(R8, 7), '5! . 5 . 1! - - .')) },
    },
    order: ['A', 'B', 'A2'],
  });
  reg('chase', chaseDef(false));
  reg('chase5', chaseDef(true));

  /* ============================================================ tension: Ek Clue, Do Raaste */
  X.registerScale('wholetone', [0, 2, 4, 6, 8, 10, 12]);
  reg('tension', {
    name: 'Ek Clue, Do Raaste', bpm: 60, root: 59, scale: 'wholetone', meter: 16, loopTo: 0, gain: 1.0,
    parts: {
      drone: { inst: 'tanpura', div: 8, oct: -1, vol: 0.55, rev: 0.35 },
      low: { inst: 'synbass', div: 16, oct: -2, vol: 0.35 },
      heart: { kit: 'tabla', div: 1, vol: 0.8, rev: 0.15, pan: -0.1 },
      tick: { kit: 'kit', div: 2, vol: 0.25, pan: 0.35 },
      pizz: { inst: 'harp', div: 2, oct: 0, vol: 0.75, rev: 0.3, pan: 0.2, gate: 0.25 },
      str: { type: 'chord', inst: 'strings', div: 16, oct: -1, vol: 0.4, rev: 0.45 },
      sitar: { inst: 'sitar', div: 2, oct: 0, vol: 0.6, rev: 0.45, pan: -0.25 },
    },
    sections: {
      A: { bars: 8, cdiv: 16, chords: '1:a 1:a 2:a 1:a 1:a 1:a 2:a 2:a', drone: '1 ^1', low: 'r', str: 'x',
        heart: 'dha . ge? . . . . . dha . ge? . . . . .', tick: 'r . r? . r . r? .',
        pizz: '1 . 3 . 2 . 4 . | 3 . 5 . 4 . 6 . | 5 . . . 4 . . . | 3 . 2 . 1 . . . | _5 . 1 . _6 . 2 . | 1 . 3 . 2 . 4 . | 5 . 6 . ^1 . . . | . . . . . . . .' },
      B: { bars: 8, cdiv: 16, chords: '2:a 1:a 2:a 1:a 3:a 2:a 1:a 1:a', drone: '1 ^1', low: 'r', str: 'x',
        heart: 'dha . ge? . dha . ge? . dha . ge? . dha! . ge . ', tick: 'r r? r r? r r? r r?',
        sitar: '1 - - - ~2 - - - | ~3 - - - 2 - - - | 4 - - - ~5 - - - | 4 - - - - - - - | 3 - - ~4 - - 3 - | 2 - - - 1 - - - | _6 - - - ~1 - - - | 1 - - - - - . .',
        pizz: J(R8, '. . . . 5 . 4 .', R8, '. . . . 6 . 5 .', R8, '. . . . 2 . 1 .', R8, '_6 . _5 . _4 . . .'), vol: { pizz: 0.8 } },
    },
    order: ['A', 'B'],
  });

  /* ============================================================ victory: Shabaash! */
  // ~6 s fanfare (rising arpeggio), then a light santoor tune that ends on the title hook's first notes (S R G P, open).
  reg('victory', {
    name: 'Shabaash!', bpm: 126, root: 58, scale: 'major', meter: 16, loop: false, gain: 0.95,
    parts: {
      band: { kit: 'band', div: 1, vol: 0.62, rev: 0.15 },
      dhol: { kit: 'dhol', div: 1, vol: 0.5, pan: 0.2 },
      brass: { type: 'chord', inst: 'brass', div: 2, oct: 0, vol: 0.55, rev: 0.2, pan: -0.2 },
      tpt: { inst: 'trumpet', div: 2, oct: 1, vol: 0.8, rev: 0.25, pan: 0.1 },
      santoor: { inst: 'santoor', div: 2, oct: 1, vol: 0.6, rev: 0.3, pan: -0.1 },
      pad: { type: 'chord', inst: 'harmonium', div: 4, oct: 0, vol: 0.3, pan: 0.2 },
      bass: { inst: 'bass', div: 2, oct: -1, vol: 0.6 },
    },
    sections: {
      fanfare: { bars: 3, cdiv: 8, chords: '1 4 5 5:7 1 -', tpt: '1 3 5 ^1 - - 5 ^1 | ^3 - - - ^2 ^1 ^2 - | ^1 - - - - - . .',
        brass: 'x . x . x - - - | x . x . x - x x | x - - - - - . .', bass: 'r . . . r . . . | r . . . r . r r | r - - - . . . .',
        band: 'B+C . . . S . S . B . S . B B S S | B . S . B . S . R R R R R R R R | B+C . . . . . . . . . . . . . . .' },
      light: { bars: 8, cdiv: 8, chords: '1 - 5 1 4 - 5 - 1 - 5 4 1 - 5:s4 -',
        santoor: '5 3 5 6 5 - 3 - | 2 3 5 3 2 - 1 - | 6 5 6 ^1 6 - 5 - | 3 5 6 5 3 - 2 - | 5 3 5 6 5 - 3 - | 2 3 5 6 ^1 - 6 - | 1 - 2 - 3 - 5 - | 5 - - - - - . .',
        pad: 'x - x -', bass: 'r . f . r . f .', dhol: J(rep('D . . t . . t . D . t . . t . .', 7), 'D . . . . . . . . . . . . . . .'), vol: { dhol: 0.7 } },
    },
    order: ['fanfare', 'light'],
  });

  /* ============================================================ ending: Charminar Ki Chaon */
  // alaap (Kafi, free time, sitar over tanpura) -> theme (the hook in full: bansuri, strings, tabla) -> rise (violin,
  // theka densifies to 16ths, strings swell, a tabla tihai lands on the lift's sam) -> lift (+2 semitones: full
  // ensemble, wordless choir, the melody climbs past D for the first time) -> coda (thins to the music box; the hook
  // is finally answered: P G R ... S on the last note).
  const EN_THEME = J(HOOK, '. . _6 1 2 - - -', HOOK2, '^1 - - 6 5 - 3 - | 5 - 6 - ^1 - - - | 6 - 5 - 3 - 2 - | 2 - - - - - . .');
  const EN_THEME_CH = HOOK_CH + ' ' + HOOK2_CH + ' 4 - 1 - 4 6:m 2:m7 5:s4';
  const EN_RISE = J(T_B, '1 2 3 5 6 - - - | 2 3 5 6 ^1 - - - | 3 5 6 ^1 ^2 - - - | 5 6 ^1 ^2 ^3 - - - | ^2 - - - - - - - | ^2 - - - - - . .');
  const EN_RISE_CH = T_B_CH + ' 1 - 2:m7 - 6:m - 4 - 5:s4 - 5:s4 5:7';
  const EN_LIFT = '1 - 2 - 3 - 5 - | 6 - - - ^1 - ^2 - | ^3 - - - ^2 - ^1 - | 6 - ^1 - ^2 - - - | ^3 - ^2 - ^1 - 6 - | ^1 - - 6 5 - 3 - | 5 - - - 6 - 5 3 | 2 - - - - - - - | 1 - 2 - 3 - 5 - | 6 - - - 5 - 3 - | 2 - - - 1 - _6 - | 2 - - - - - . .';
  const EN_LIFT_CH = '1 - 4 6:m 1 - 4 5 6:m - 4 - 2:m7 - 5:s4 - 1 - 4 6:m 2:m7 - 5:s4 -';
  const TIHAI = 'ti ra ki ta dha . dha . dha . . . ti ra ki ta dha . dha . dha . . . ti ra ki ta dha . dha .';
  reg('ending', {
    name: 'Charminar Ki Chaon', bpm: 76, root: 63, scale: 'major', meter: 16, loop: false, gain: 0.66,
    parts: {
      drone: { inst: 'tanpura', div: 4, oct: -1, vol: 0.5, rev: 0.35, pan: -0.1 },
      sitar: { inst: 'sitar', div: 2, oct: 0, vol: 0.75, rev: 0.45, pan: -0.25 },
      flute: { inst: 'bansuri', div: 2, oct: 0, vol: 0.85, rev: 0.45, pan: 0.1 },
      vln: { inst: 'violin', div: 2, oct: 0, vol: 0.65, rev: 0.5, pan: -0.1 },
      cello: { inst: 'violin', div: 4, oct: -1, vol: 0.45, rev: 0.45, pan: -0.3 },
      str: { type: 'chord', inst: 'strings', div: 4, oct: 0, vol: 0.7, rev: 0.55 },
      choir: { type: 'chord', inst: CHOIR, div: 8, oct: 0, vol: 0.55, rev: 0.6 },
      pad: { type: 'chord', inst: 'harmonium', div: 4, oct: -1, vol: 0.35, rev: 0.3, pan: 0.15 },
      santoor: { inst: 'santoor', div: 2, oct: 1, vol: 0.35, rev: 0.5, pan: 0.35 },
      tabla: { kit: 'tabla', div: 2, vol: 0.55, rev: 0.2, pan: 0.2 },
      bass: { inst: 'bass', div: 4, oct: -2, vol: 0.5 },
      mbox: { inst: MBOX, div: 2, oct: 1, vol: 0.6, rev: 0.55, pan: 0.1 },
    },
    sections: {
      alaap: { bars: 7, bpm: [46, 40], cdiv: 16, chords: '1:m 1:m 1:m 1:m 4 4 1:m', drone: '5 ^1 ^1 1',
        sitar: '1 - - - - - ~2 - | 1 - - - _7b - _6 - | _7b - 1 - 2 - ~3b - | 2 - - - 1 - - - | 2 - 3b - 4 - ~5 - | 5 - - - ~6 - 5 4 | 3b - - 2 - - 1 -',
        str: J(R4, R4, R4, R4, 'x - - -', 'x - - -', 'x - - -'), vol: { str: 0.95, sitar: 1.85, drone: 1.85 } },
      theme: { bars: 12, cdiv: 8, chords: EN_THEME_CH, drone: '5 ^1 ^1 1', flute: EN_THEME, str: 'x - x -', pad: 'x - x -', bass: 'r - r -',
        santoor: J(rests(R8, 4), rep('r . f . o . f .', 8)), cello: J(rests(R4, 4), T_CELLO),
        tabla: J(rests(R8, 4), 'dha . . . dha . . .', KEH2, KEH, KEHF2, keh(4)), vol: { str: 0.75, tabla: 0.75 } },
      rise: { bars: 14, bpm: [76, 82], cdiv: 8, chords: EN_RISE_CH, drone: '5 ^1 ^1 1', vln: EN_RISE, pad: 'x - x -', bass: J(rep('r - r f', 8), rep('r r r r', 4), 'r - - - | r - r r'),
        str: J(rep('x - x -', 8), rep('x x x x', 4), 'x - - - | x - x x'), flute: J(rests(R8, 8), shift('1 2 3 5 6 - - - | 2 3 5 6 ^1 - - - | 3 5 6 ^1 ^2 - - - | 5 6 ^1 ^2 ^3 - - -', -2), '7 - - - - - - - | 7 - - - - - . .'),
        cello: J(T_CELLO, '1 - - - | 2 - - - | 3 - - - | 4 - - - | 5 - - - | 5 - - -'), santoor: J(rests(R8, 8), rep('r f o ^t o f o f', 6)),
        tabla: J(K16A, K16B, K16A, K16F, K16B, K16A, K16B, K16F, K16C, K16C, K16C, K16F, TIHAI), div: { tabla: 1 }, vol: { vln: 1.1, str: 0.9 } },
      lift: { bars: 12, bpm: 80, tp: 2, cdiv: 8, chords: EN_LIFT_CH, drone: '5 ^1 ^1 1', flute: shift(EN_LIFT, 7), vln: EN_LIFT, sitar: 'r . f . o . f .', choir: 'x x', str: 'x - x -', pad: 'x - x -',
        bass: 'r - f -', santoor: 'r f o f ^t f o f', cello: 'r - - - | t - - -', tabla: J('dha! ge na ti na ka dhi na', KEH2, KEH, KEHF, keh(8)),
        vol: { flute: 0.75, vln: 1.15, str: 1.15, sitar: 0.5, santoor: 0.8, tabla: 0.85 } },
      coda: { bars: 8, bpm: [70, 46], tp: 2, cdiv: 8, chords: '4 - 5:s4 - 1 - 4 - 2:m7 - 5:s4 - 5:s4 5 1 -', drone: J(rep('5 ^1 ^1 1', 7), '1 - - -'),
        flute: J('6 - - - 5 - 3 -', '2 - - - - - - -', rests(R8, 6)), str: J('x - - -', 'x - - -', 'x - - -', 'x - - -', 'x - - -', 'x - - -', 'x - x -', 'x - - -'),
        mbox: J(R8, R8, HOOK, R8, '5 - 3 - 2 - - -', '1 - - - - - - -'), bass: J('r - - -', 'r - - -', R4, R4, R4, R4, 'r - r -', 'r - - -'),
        tabla: J('dha . . . . . . .', rests(R8, 7)), choir: J('x x', 'x -', R4.slice(0, 3), R4.slice(0, 3), R4.slice(0, 3), R4.slice(0, 3), R4.slice(0, 3), R4.slice(0, 3)),
        vol: { str: 0.75, choir: 0.65, flute: 1.1, drone: 1.5, mbox: 1.65, bass: 1.3 } },
    },
    order: ['alaap', 'theme', 'rise', 'lift', 'coda'],
  });

  /* ============================================================ festival: Teenmaar Toofan (Bonalu) */
  // 6/8 teenmaar at 140, C Mixolydian riff on shehnai; each of the three levels doubles the density
  // (dotted-quarter pulse -> 8th gallop -> 16th rolls; the riff itself turns into 16th turns at level 3).
  const FR = '5 5 . 5 6 5 | 3 - 2 1 - . | 5 5 . 5 6 ^1 | 7 - 6 5 - .';
  const FR2 = '5 5 . 5 6 5 | 3 - 2 1 - . | 5 5 . 5 6 ^1 | ^2 - ^1 7 6 5';
  reg('festival', {
    name: 'Teenmaar Toofan', bpm: 140, root: 60, scale: 'khamaj', meter: 12, loopTo: 0, gain: 0.95,
    parts: {
      dappu: { kit: DAPPU.kit, div: 1, vol: 0.7, rev: 0.12, pan: -0.1 },
      tasha: { kit: TASHA.kit, div: 1, vol: 0.5, rev: 0.12, pan: 0.25 },
      marfa: { kit: MARFA.kit, div: 1, vol: 0.65, rev: 0.1 },
      sh: { inst: inst('shehnai'), div: 2, oct: 1, vol: 0.7, rev: 0.25, pan: 0.1 },
      cl: { inst: 'clarinet', div: 2, oct: 1, vol: 0.55, rev: 0.25, pan: -0.2 },
    },
    sections: {
      L1: { bars: 8, sh: J(FR, FR2), dappu: DAPPU.m(J(rep('D . . . . . T . . . . .', 3), 'D . . T . . R . . . . .')), marfa: MARFA.m('B . . . . . . . . . . .'), vol: { sh: 0.9 } },
      L2: { bars: 8, sh: J(FR, FR2), cl: J(shift(FR, -2), shift(FR2, -2)),
        dappu: DAPPU.m(J(rep('D . t . t? . D . t . T .', 3), 'D . t . T . R . R . R .')), tasha: TASHA.m('t . t? . t . t . t? . t .'), marfa: MARFA.m('B . . . . . B . . . . .') },
      L3: { bars: 8, sh: orn(J(FR, FR2)), cl: J(FR, FR2), div: { sh: 1 },
        dappu: DAPPU.m(J(rep('D t t D t t D t t T t t', 3), 'R . R . R . R t t T! . .')), tasha: TASHA.m(J(rep('R . t t R . t t T t t t', 3), 'R R R R R R R R R T! . .')),
        marfa: MARFA.m('B . k B . k B . k B . k'), vol: { cl: 0.85 } },
    },
    order: ['L1', 'L2', 'L3'],
  });

  /* ============================================================ ganesh: Tank Bund Ka Jaloos (immersion procession) */
  // Celebratory band baaja: trumpet + clarinet, oom-pah tuba, dhol + tasha, band bass drum and cymbals;
  // the last chorus jumps up a semitone like every procession band does at the crossroads.
  const GA_A = '1 - 3 5 6 - 5 3 | 5 - - - 3 2 1 2 | 4 - 6 ^1 ^2 - ^1 6 | 5 - - - - - 3 5 | 6 - 5 3 5 - ^1 - | ^2 - ^1 6 5 - 3 - | 2 - 3 5 7 - 6 5 | 1 - - - . . . .';
  const GA_A_CH = '1 - 1 - 4 - 1 - 1 - 4 5 5 - 1 -';
  const GA_T = '^1 - ^1 - 6 ^1 - . | . . . . . . . . | ^2 - ^2 - ^1 ^2 - . | . . . . . . . . | ^3 - ^2 ^1 6 - 5 - | ^1 - 6 5 3 - 2 - | 3 - 5 - 6 - 7 - | ^1 - - - - - . .';
  const GA_C = '. . . . . . . . | 6 5 6 ^1 5 - . . | . . . . . . . . | 6 5 6 ^2 ^1 - . . | ^3 - ^2 ^1 6 - 5 - | ^1 - 6 5 3 - 2 - | 3 - 5 - 6 - 7 - | ^1 - - - - - . .';
  const GDH = 'D . t . D t . t D . t . D t t t', GDH2 = 'D . t t? D . t . D . t t? D t . t';
  reg('ganesh', {
    name: 'Tank Bund Ka Jaloos', bpm: 132, root: 58, scale: 'major', meter: 16, loopTo: 1, gain: 0.82,
    parts: {
      band: { kit: 'band', div: 1, vol: 0.55, rev: 0.12 },
      dhol: { kit: 'dhol', div: 1, vol: 0.62, pan: 0.2 },
      tasha: { kit: TASHA.kit, div: 1, vol: 0.45, pan: -0.25, rev: 0.1 },
      bass: { inst: TUBA, div: 2, oct: -2, vol: 0.65 },
      brass: { type: 'chord', inst: 'brass', div: 2, oct: 0, vol: 0.45, rev: 0.15, pan: -0.2 },
      tpt: { inst: 'trumpet', div: 2, oct: 1, vol: 0.75, rev: 0.2, pan: -0.1 },
      cl: { inst: 'clarinet', div: 2, oct: 1, vol: 0.7, rev: 0.2, pan: 0.2 },
    },
    sections: {
      intro: { bars: 2, cdiv: 16, chords: '1 5', tasha: TASHA.m('R . . . R . . . R . R . R R R R | T . t t T . t t R R R R R R T! .'), dhol: 'D . . . D . . . D . D . D D D D | D . t . D . t . R . R . D! . . .',
        tpt: '5 - 5 - 5 6 5 3 | 5 - - - 7 - ^2 -', brass: '. . . . . . . . | x - - - x - x -', band: J(R16, 'B+C . . . . . . . . . . . . . . .') },
      A: { bars: 8, cdiv: 8, chords: GA_A_CH, tpt: GA_A, cl: GA_A, bass: 'r . f . r . f .', brass: '. x . x . x . x', dhol: cyc(8, [GDH, GDH2], 'D t D t D t D t R . R . D! . . .'),
        band: cyc(8, ['B . . . S . . . B . . . S . . .', 'B . . . S . . S? B . . . S . . .'], 'B . S . B . S . R R R R B+C . . .'), tasha: TASHA.m(cyc(8, ['T . t . . t T . t . T . . t t .'], 'R . R . R . R . R R R R T! . . .')) },
      B: { bars: 8, cdiv: 8, chords: '1 - 4 - 5 - 1 - 6:m - 4 - 5 - 1 -', tpt: GA_T, cl: GA_C, bass: 'r . f . r . f .', brass: '. x . x . . x x', dhol: cyc(8, [GDH2, GDH], 'D t D t D t D t R . R . D! . . .'),
        band: cyc(8, ['B . . S? S . . . B . . . S . S? .'], 'B . S . B . S . R R R R B+C . . .'), tasha: TASHA.m(cyc(8, ['T t t . T t t . T t T t T t t .'], 'R R R R R R R R R R R R T! . . .')) },
      A2: { bars: 8, tp: 1, cdiv: 8, chords: GA_A_CH, tpt: GA_A, cl: shift(GA_A, 2), bass: 'r . f . r . f .', brass: 'x x . x . x . x', dhol: cyc(8, [GDH, GDH2], 'D t D t D t D t R . R . D! . . .'),
        band: cyc(8, ['B . . . S . . . B . B . S . . .', 'B+C . . . S . . S? B . . . S . . .'], 'B . S . B . S . R R R R B+C . . .'), tasha: TASHA.m(cyc(8, ['T . t t T . t t T t t t T . t t'], 'R R R R R R R R R R R R T! . . .')) },
    },
    order: ['intro', 'A', 'B', 'A2'],
  });

  /* ============================================================ ramzan: Bazaar Ki Roshni (Ramzan nights, Old City) */
  // A warm night-market lilt (6/8, Khamaj): harmonium tune, sarangi counter-line then its own verse, santoor
  // shimmer like the bulb strings, a soft frame-drum dholak. Secular and festive: no chant, no devotional melody.
  const RZ_A = '1 - 3 5 - 3 | 6 - 5 4 3 - | 4 - 6 ^1 - 6 | 5 - - - - . | 7 - 6 5 - 4 | 6 - 5 4 - 2 | 3 - 2 1 - _7 | 1 - - - - .';
  const RZ_A_CH = '1 1 4 1 7 4 5:m 1';
  const RZ_CTR = '3 - - - - - | 3 - - 2 - - | 1 - - - - - | 3 - - - - - | 3 - - - - - | 2 - - - - - | 1 - - _7 - - | _7 - - 1 - -';
  const RZ_B = '5 - - 6 5 4 | 3 - - - - - | 4 - 5 6 - ^1 | 7 - 6 5 - - | 6 - ^1 ^2 - ^1 | 7 - 6 5 - 4 | 3 - 4 2 - - | 1 - - - - -';
  const RZ_B_CH = '1 1 4 4 6:m 7 2:m 1';
  const DAF = 'D . k . g . t . k . k?', DAF2 = 'D . k k? g . t . k . . .', DAFF = 'D . k . g k t . t k D .';
  reg('ramzan', {
    name: 'Bazaar Ki Roshni', bpm: 84, root: 62, scale: 'khamaj', meter: 12, loopTo: 1, gain: 1.0,
    parts: {
      dholak: { kit: 'dholak', div: 1, vol: 0.45, rev: 0.15, pan: 0.15 },
      bass: { inst: 'bass', div: 6, oct: -2, vol: 0.45 },
      hc: { type: 'chord', inst: 'harmonium', div: 6, oct: -1, vol: 0.28, rev: 0.2, pan: -0.2 },
      hl: { inst: 'harmonium1', div: 2, oct: 0, vol: 0.8, rev: 0.25, pan: 0.05 },
      sar: { inst: SARANGI, div: 2, oct: 0, vol: 0.55, rev: 0.4, pan: -0.25 },
      santoor: { inst: 'santoor', div: 1, oct: 1, vol: 0.28, rev: 0.45, pan: 0.35 },
      flute: { inst: 'bansuri', div: 2, oct: 1, vol: 0.5, rev: 0.45, pan: 0.25 },
    },
    sections: {
      intro: { bars: 2, cdiv: 12, chords: '1 7', santoor: 'r . f . o . ^t . o . f . | r . f . o . ^t . o . . .', hc: 'x -', sar: '5 - - - - - | ~4 - - 3 - -' },
      A: { bars: 8, cdiv: 12, chords: RZ_A_CH, hl: RZ_A, sar: shift(RZ_CTR, -7), hc: 'x x', bass: 'r f', dholak: cyc(8, [DAF + ' .', DAF2], DAFF), santoor: J(rests(R12, 3), 'r . f . o . ^t . . . . .', rests(R12, 3), 'o . f . r . f . o . . .') },
      B: { bars: 8, cdiv: 12, chords: RZ_B_CH, sar: RZ_B, hl: J(R6, '. . . 3 4 5', R6, '. . . 6 5 4', R6, '. . . ^1 7 6', R6, R6), hc: 'x x', bass: 'r f', dholak: cyc(8, [DAF2, DAF + ' .'], DAFF),
        santoor: 'r . . . f . . . o . . .', vol: { sar: 1.15 } },
      A2: { bars: 8, cdiv: 12, chords: RZ_A_CH, hl: RZ_A, flute: J(rests(R6, 3), '. . . 5 6 ^1', rests(R6, 3), '. . . ^2 ^1 7'), sar: shift(RZ_CTR, -7), hc: 'x x', bass: 'r f',
        dholak: cyc(8, [DAF + ' .', DAF2], DAFF), santoor: 'r . f . o . ^t . o . f .', vol: { santoor: 0.8 } },
    },
    order: ['intro', 'A', 'B', 'A2'],
  });

  /* ============================================================ kites: Patang Ki Pech (Sankranti) */
  // G major pentatonic, brisk 120: a zig-zag figure like a kite in the wind, bansuri trills, mandolin, string stabs
  // on the "khench!" (pull) beats.
  const KZ = '1 3 2 5 3 6 5 ^1', KZD = '^1 5 6 3 5 2 3 1';
  const KT_A = J(d2(KZ), d2('^2 - ^1 6 5 - - -'), d2(KZD), '2 3 2 3 2 3 2 - 1 - _6 - _5 - - -', d2(KZ), d2('^3 - ^2 ^1 6 - ^1 -'), d2('^2 - 6 - 5 - 3 -'), '5 6 5 6 5 6 5 - 3 - 2 - 1 - - -');
  const KT_B_M = '6 - 5 6 ^1 - 6 5 | 3 - 5 6 5 - - - | 1 - 2 3 5 - 3 2 | 2 - 3 5 2 - - - | 6 - 5 6 ^1 - ^2 ^1 | 6 - 5 3 5 - - - | 2 - 3 5 6 - 5 3 | 1 - - - - - - -';
  const KT_B_F = J(R16, '. . . . . . . . . . . . ^1 ^2 ^1 ^2', R16, '. . . . . . . . . . . . 5 6 5 6', R16, '. . . . . . . . . . . . ^3 ^5 ^3 ^5', R16, R16);
  const KDH = 'D . k . t . k k? D . t . t k? t .', KDH2 = 'D . k t? t . k . D k? t . t . t t?';
  reg('kites', {
    name: 'Patang Ki Pech', bpm: 120, root: 55, scale: 'major', meter: 16, loopTo: 0, gain: 0.7,
    parts: {
      dholak: { kit: 'dholak', div: 1, vol: 0.6, pan: 0.15 },
      claps: { kit: 'clap', div: 2, vol: 0.45, pan: -0.2, rev: 0.2 },
      flute: { inst: 'bansuri', div: 1, oct: 1, vol: 0.8, rev: 0.3, pan: 0.1 },
      mando: { inst: 'mandolin', div: 2, oct: 1, vol: 0.55, pan: -0.3, trem: 4 },
      stab: { type: 'chord', inst: 'strings', div: 2, oct: 0, vol: 0.55, rev: 0.25, gate: 0.35 },
      bass: { inst: 'bass', div: 2, oct: -2, vol: 0.6 },
    },
    sections: {
      A: { bars: 8, cdiv: 8, chords: '1 - 4 - 1 - 5 - 1 - 4 - 6:m 5 1 -', flute: KT_A, mando: 'r f o f r f o f', stab: '. . . X . . . X', bass: 'r . . f . . r .', dholak: cyc(8, [KDH, KDH2], 'D . t t D . t t D t t t D! . . .') },
      B: { bars: 8, cdiv: 8, chords: '6:m - 4 - 1 - 5 - 6:m - 4 - 2:m 5 1 -', mando: KT_B_M, flute: KT_B_F, stab: '. . . X . . . . | . . . X . . . X', bass: 'r . . f . . r .', claps: '. . x . . . x .',
        dholak: cyc(8, [KDH2, KDH], 'D . t t D . t t D t t t D! . . .') },
      A2: { bars: 8, cdiv: 8, chords: '1 - 4 - 1 - 5 - 1 - 4 - 6:m 5 1 -', flute: KT_A, mando: 'r t f o f t f o', stab: '. . . X . . . X', bass: 'r . . f . . r .', claps: '. . x . . . x .',
        dholak: cyc(8, [KDH, KDH2], 'D . t t D . t t D t t t D! . . .') },
    },
    order: ['A', 'B', 'A2'],
  });

  /* ============================================================ numaish: Numaish Ka Jhoola (fairground waltz) */
  const NU_A = '5 - - 4# 5 - | ^3 - - ^2 ^1 - | 7 - - 6# 7 - | ^4 - - ^2 7 - | 6 - - 5# 6 - | ^2 - - ^1 7 - | 5 - 4# 5 6 7 | ^1 - - - - - | 6 - - 5# 6 - | ^4 - - ^3 ^1 - | 5 - - 4# 5 - | ^3 - - ^2 ^1 - | 4# - 5 6 ^1 - | 7 - ^1 ^2 ^4 - | ^3 - - ^2 ^1 - | ^1 - - . . .';
  const NU_A_CH = '1 1 5:7 5:7 5:7 5:7 1 1 4 4 1 1 2:7 5:7 1 1';
  const NU_B = '3 - - 2 1 - | 5 - - - - - | 4 - - 3 2 - | 6 - - - - - | 5 - 6 5 4# 5 | ^1 - 7 6 5 - | 4 - 3 2 _7 2 | 1 - - - - -';
  const numaishDef = (close) => ({
    name: close ? 'Numaish Ka Jhoola (Closing Time)' : 'Numaish Ka Jhoola', bpm: close ? 92 : 128, root: 60, scale: 'major', meter: 12, loopTo: 0, gain: close ? 1.2 : 0.9,
    parts: {
      lead: { inst: close ? MBOX : CALLIOPE, div: 2, oct: 1, vol: close ? 0.65 : 0.6, rev: 0.3, pan: 0.05 },
      org: { type: 'chord', inst: 'harmonium', div: 4, oct: 0, vol: close ? 0.3 : 0.45, rev: 0.2, pan: -0.2 },
      bass: { inst: close ? 'bass' : TUBA, div: 4, oct: -2, vol: 0.6 },
      glock: { inst: 'glock', div: 4, oct: 2, vol: close ? 0 : 0.35, rev: 0.35, pan: 0.3 },
      cl: { inst: close ? 'bansuri' : 'clarinet', div: 2, oct: close ? 1 : 0, vol: 0.6, rev: 0.25, pan: -0.1 },
      kit: { kit: 'kit', div: 4, vol: close ? 0 : 0.3, pan: 0.2 },
    },
    sections: {
      A: { bars: 16, cdiv: 12, chords: NU_A_CH, lead: NU_A, org: '. x x', bass: 'r . .', kit: close ? null : '. h h', glock: close ? null : J(rests(R4.slice(0, 5), 7), '^1 . .', rests(R4.slice(0, 5), 7), '5 . .') },
      B: { bars: 8, cdiv: 12, tp: 5, chords: '1 1 5:7 5:7 1 4 5:7 1', cl: NU_B, lead: J(R6, '. . 3 - 2 -', R6, '. . 5 - 4 -', R6, R6, R6, '. . 5 - 3 -'), org: '. x x', bass: 'r . f', kit: close ? null : '. h h', glock: close ? null : '^1 . . | . . . | 5 . . | . . .' },
    },
    order: ['A', 'B', 'A'],
  });
  reg('numaish', numaishDef(false));
  reg('numaish_close', numaishDef(true));

  /* ============================================================ radio songs (fictional films and artists) */
  // r_chandni: a late-80s filmi romantic ballad: mandolin tremolo intro, solo violin "mukhda", bansuri interlude,
  // synth strings, slow keherwa. F major, 88 bpm.
  reg('r_chandni', {
    name: 'Chandni Raat Ka Cycle', bpm: 88, root: 65, scale: 'major', meter: 16, loop: false, gain: 0.95,
    parts: {
      mando: { inst: 'mandolin', div: 2, oct: 0, vol: 0.6, rev: 0.25, pan: -0.2, trem: 4 },
      vln: { inst: 'violin', div: 2, oct: 0, vol: 0.75, rev: 0.4, pan: 0.05 },
      flute: { inst: 'bansuri', div: 2, oct: 1, vol: 0.7, rev: 0.35, pan: 0.2 },
      santoor: { inst: 'santoor', div: 2, oct: 1, vol: 0.3, pan: 0.35, rev: 0.3 },
      pad: { type: 'chord', inst: 'pad', div: 16, oct: 0, vol: 0.45, rev: 0.4 },
      str: { type: 'chord', inst: 'strings', div: 4, oct: 0, vol: 0.45, rev: 0.4 },
      bass: { inst: 'bass', div: 4, oct: -2, vol: 0.6 },
      tabla: { kit: 'tabla', div: 2, vol: 0.55, pan: 0.2, rev: 0.1 },
    },
    sections: {
      intro: { bars: 4, cdiv: 16, chords: '1 5 4 5', mando: '3 - - - 2 - 1 - | 5 - - - 4 - 3 - | 6 - 5 - 4 - 3 - | 2 - - - - - . .', pad: 'x', santoor: 'r . f . o . f .' },
      A: { bars: 8, cdiv: 16, chords: '1 2:m 4 1 6:m 2:m 5 1', vln: '5 - - 6 5 - 3 - | 2 - 3 - 5 - - - | 6 - - ^1 6 - 5 - | 3 - - - - - . . | 5 - - 6 5 - 3 - | 2 - 3 - 1 - _6 - | 2 - - 3 2 - 1 - | 1 - - - - - . .',
        pad: 'x', bass: 'r - f -', tabla: keh(8), mando: 'r . . . . . . . | . . . . f . . .', vol: { mando: 0.6 } },
      inter: { bars: 4, cdiv: 16, chords: '1 4 2:m 5', flute: '^1 - 6 ^1 ^2 - ^1 6 | 5 - - - 3 5 6 5 | 4 - 6 - 5 - 3 - | 2 - - - - - . .', santoor: 'r f o f t f o f', str: 'x - - -', bass: 'r - f -', tabla: keh(4) },
      B: { bars: 8, cdiv: 16, chords: '4 4 2:m 6:m 4 1 2:m 5', vln: '^1 - - ^2 ^1 - 6 - | 5 - 6 - ^1 - - - | ^2 - - ^3 ^2 - ^1 - | 6 - - - - - . . | ^1 - - ^2 ^1 - 6 - | 5 - 4 - 3 - 2 - | 3 - 5 - 6 - 7 - | ^1 - - - 5 - - -',
        str: 'x - - -', pad: 'x', bass: 'r - f -', tabla: keh(8), flute: J(rests(R8, 3), '. . . . 5 6 ^1 ^2', rests(R8, 3), R8), vol: { vln: 1.1 } },
      out: { bars: 2, cdiv: 16, chords: '4 1', mando: '6 - 5 - 3 - 2 - | 1 - - - - - . .', pad: 'x', bass: 'r - - - | r - - -', tabla: 'dha ge na ti na ka dhi na | dha . . . . . . .' },
    },
    order: ['intro', 'A', 'inter', 'B', 'A', 'out'],
  });
  // r_barish: a rainy Irani-café ghazal-pop: harmonium lead, guitar arpeggios, santoor raindrops. A minor, 76 bpm.
  reg('r_barish', {
    name: 'Baarish Mein Irani Chai', bpm: 76, root: 57, scale: 'minor', meter: 16, loop: false, gain: 1.0,
    parts: {
      hl: { inst: 'harmonium1', div: 2, oct: 0, vol: 0.8, rev: 0.3, pan: 0.05 },
      gtr: { inst: 'guitar', div: 2, oct: -1, vol: 0.5, rev: 0.3, pan: -0.3 },
      gl: { inst: 'guitar', div: 2, oct: 0, vol: 0.55, rev: 0.3, pan: -0.15 },
      rain: { inst: 'santoor', div: 1, oct: 2, vol: 0.18, rev: 0.6, pan: 0.4 },
      pad: { type: 'chord', inst: 'harmonium', div: 4, oct: -1, vol: 0.3, pan: 0.2 },
      str: { type: 'chord', inst: 'strings', div: 4, oct: 0, vol: 0.4, rev: 0.45 },
      bass: { inst: 'bass', div: 4, oct: -1, vol: 0.55 },
      tabla: { kit: 'tabla', div: 2, vol: 0.5, pan: 0.25, rev: 0.15 },
    },
    sections: {
      intro: { bars: 4, cdiv: 16, chords: '1 6 4:m 5:M', gtr: 'r f o t f o f t', rain: '. . . . . . 5 . . . . . . . . . | . . ^1 . . . . . . . . . 3 . . .', str: 'x - - -' },
      A: { bars: 8, cdiv: 16, chords: '1 5:7 1 4:m 6 3 5:M 1', hl: '5 - - 4 3 - 1 - | 2 - - _7# 2 - 4 - | 1 - 2 - 3 - 5 - | 4 - - - - - . . | 6 - - 5 4 - 3 - | 5 - - 4 3 - 2 - | 3 - 2 - 1 - _7# - | 1 - - - - - . .',
        gtr: 'r f o t f o f t', gl: J(R8, R8, R8, '. . . . 5 4 3 2', R8, R8, R8, '. . . . 3 2 1 _7#'), pad: 'x - - -', bass: 'r - - f', tabla: keh(8), rain: '. . . . . . . . . . . . . 5 . . | . . . . . . . . . . ^1 . . . . .' },
      B: { bars: 8, cdiv: 16, chords: '6 4:m 4:m 5:M 1 7 5:7 1', hl: '^1 - - 7 6 - 5 - | 6 - - 5 4 - 3 - | 4 - 5 - 6 - ^1 - | 7# - - - - - . . | ^1 - ^2 - ^3 - ^1 - | 7 - 6 - 5 - 4 - | 3 - 4 - 7# - ^2 - | ^1 - - - - - . .',
        gtr: 'r f o f t f o f', str: 'x - - -', pad: 'x - - -', bass: 'r - f -', tabla: keh(8), gl: J(R8, R8, R8, '. . . . 2 3 4 7#', R8, R8, R8, R8) },
      out: { bars: 2, cdiv: 16, chords: '4:m 1', gtr: 'r f o t f o f t | r - - - - - . .', hl: '4 - 3 - 2 - _7# - | 1 - - - - - . .', str: 'x - - -', bass: 'r - - - | r - - -' },
    },
    order: ['intro', 'A', 'B', 'A', 'out'],
  });
  // r_baraat: the Saidabad brass band at a wedding: clarinet verse, trumpet chorus, band drums with rolls.
  const BA_A = '1 - 3 - 5 6 5 3 | 2 - 4 - 6 - 5 - | 3 - 5 - ^1 ^2 ^1 6 | 5 - - - - - . . | 6 - 6 5 6 - ^1 - | 5 - 5 4 5 - 6 - | 4 - 3 - 2 - _7 - | 1 - - - - - . .';
  const BA_B = '5 - - 5 6 - 5 - | ^1 - - - 6 - - - | 4 - - 4 5 - 4 - | 2 - - - - - . . | 3 - 3 4 5 - 6 - | ^1 - 7 - 6 - 5 - | 4 - 6 - 5 - 2 - | 1 - - - - - . .';
  const BBD = 'B . S? . B B S . B . S . B B S R?', BBD2 = 'B . S . B . S S? B . S . B B S .', BBF = 'B . S S R R R R R R R R B+C . . .';
  reg('r_baraat', {
    name: 'Baraat Express', bpm: 132, root: 58, scale: 'major', meter: 16, loop: false, gain: 0.82,
    parts: {
      band: { kit: 'band', div: 1, vol: 0.6, rev: 0.12 },
      dhol: { kit: 'dhol', div: 1, vol: 0.45, pan: 0.25 },
      cl: { inst: 'clarinet', div: 2, oct: 1, vol: 0.8, rev: 0.2, pan: 0.15 },
      tpt: { inst: 'trumpet', div: 2, oct: 1, vol: 0.8, rev: 0.2, pan: -0.1 },
      brass: { type: 'chord', inst: 'brass', div: 2, oct: 0, vol: 0.45, pan: -0.3 },
      bass: { inst: TUBA, div: 2, oct: -2, vol: 0.65 },
    },
    sections: {
      intro: { bars: 2, cdiv: 16, chords: '1 5:7', band: 'R . R . R . R . R R R R R R R R | B+C . . . . . . . R R R R R R S! .', brass: 'x - - - . . . . | x - . x . x . .' },
      A: { bars: 8, cdiv: 16, chords: '1 5 1 1 4 1 5 1', cl: BA_A, band: cyc(8, [BBD, BBD2], BBF), dhol: 'D . . t . . D . D . t . . t . .', brass: '. x . x . x . x', bass: 'r . f . r . f .' },
      B: { bars: 8, cdiv: 16, chords: '1 4 5 5 1 4 5 1', tpt: BA_B, cl: J(rests(R8, 3), '. . . . 5 6 7 ^2', rests(R8, 3), R8), band: cyc(8, [BBD2, BBD], BBF), dhol: 'D . t t . t D . D . t . D t t .', brass: 'x . . x . . x .', bass: 'r . f . r . f .' },
      A2: { bars: 8, tp: 1, cdiv: 16, chords: '1 5 1 1 4 1 5 1', cl: BA_A, tpt: shift(BA_A, -2), band: cyc(8, [BBD, BBD2], BBF), dhol: 'D . t t . t D . D t t . D t t t', brass: '. x . x . x . x', bass: 'r . f . r . f .' },
    },
    order: ['intro', 'A', 'B', 'A', 'B', 'A2'],
  });
  // r_neon: late-90s Indipop: FM e-piano, string-machine pad, synth lead, dholak joins the last chorus. E minor, 116.
  const NE_V = '. . 5 5 5 - 4 3 | 3 - - - . . 1 3 | 5 - 5 - 6 5 4 3 | 2 - - - . . . . | . . 5 5 5 - 4 3 | 3 - - 4 5 - 6 - | 7 - 6 5 4 - 2 - | 1 - - - . . . .';
  const NE_C = '3 - 3 - 5 - 3 - | 4 - 4 - 6 - 4 - | 5 - - - 3 - 1 - | 1 - - - . . . . | 3 - 3 - 5 - 3 - | 4 - 4 - 6 - ^1 - | 7 - - - 5 - - - | 7 - - - . . . .';
  const NKV = 'k . h . s . h k? . k h . s . h .', NKV2 = 'k . h . s . h . k . h k? s . o .', NKF = 'k . h . s . h k s . s s? t t t! t';
  reg('r_neon', {
    name: 'Neon Monsoon', bpm: 116, root: 52, scale: 'minor', meter: 16, loop: false, gain: 0.95,
    parts: {
      kit: { kit: MACH.kit, div: 1, vol: 0.6 },
      dholak: { kit: 'dholak', div: 1, vol: 0.5, pan: 0.3 },
      bass: { inst: 'synbass', div: 2, oct: -1, vol: 0.6 },
      ep: { type: 'chord', inst: 'epiano', div: 2, oct: 1, vol: 0.55, rev: 0.3, pan: -0.2 },
      pad: { type: 'chord', inst: 'pad', div: 16, oct: 1, vol: 0.5, rev: 0.4 },
      gtr: { inst: 'guitar', div: 2, oct: 0, vol: 0.4, rev: 0.25, pan: 0.35 },
      lead: { inst: 'synlead', div: 2, oct: 1, vol: 0.7, rev: 0.3, pan: 0.05 },
    },
    sections: {
      intro: { bars: 4, cdiv: 16, chords: '1 6 3 7', ep: 'x . . x . . x .', gtr: 'r f o f r f o f', kit: MACH.m(J('h . h . h . h . h . h . h . h h?', 'h . h . h . h . h . h . h . h h?', 'k . h . h . h . k . h . h . h .', 'k . h . s . h . k . s s s s s! s')) },
      verse: { bars: 8, cdiv: 16, chords: '1 6 3 7', ep: 'x . . x . . x .', gtr: 'r f o f r f o f', kit: MACH.m(cyc(8, [NKV, NKV2], NKF)), bass: 'r . . r . r . .', lead: NE_V },
      chorus: { bars: 8, cdiv: 16, chords: '6 7 1 1 6 7 3 7', ep: 'x . x . x . x .', pad: 'x', kit: MACH.m(cyc(8, [NKV2, NKV], NKF)), bass: 'r . r . r . r r', lead: NE_C },
      chorus2: { bars: 8, cdiv: 16, chords: '6 7 1 1 6 7 3 7', ep: 'x . x . x . x .', pad: 'x', gtr: 'r f o f r f o f', kit: MACH.m(cyc(8, [NKV2, NKV], NKF)), bass: 'r . r . r . r r', lead: NE_C,
        dholak: cyc(8, ['D . g . t . k . t . k . D . t .', 'D . g k? t . k . t k? k . D . t t?'], 'D . t t D . t t D t t D t t D! .') },
      out: { bars: 2, cdiv: 16, chords: '6 1', ep: 'x - - - | x - - -', pad: 'x', lead: '3 - - - 2 - - - | 1 - - - . . . .', kit: MACH.m('k . h . s . h . k . h . s . h . | k+x . . . . . . . . . . . . . . .') },
    },
    order: ['intro', 'verse', 'chorus', 'verse', 'chorus2', 'out'],
  });
  // r_pager: Telugu-pop dance number on Pop Patang; its hook is the game's Mohanam leitmotif turned into a dance riff.
  const PG_A = '1 2 3 5 6 - 5 3 | 2 - 1 2 3 - - - | 5 6 5 3 2 - 1 - | 2 - - - . . 5 6 | 1 2 3 5 6 - 5 3 | 2 - 1 2 3 - 5 - | 6 - ^1 - 6 5 3 2 | 1 - - - . . . .';
  const PG_B = '^1 - 6 - 5 - 3 - | 5 - 6 - ^1 - - - | ^2 - ^1 - 6 - 5 - | 3 - - - . . . . | ^1 - 6 - 5 - 3 - | 5 - 6 - ^1 - ^2 - | ^3 - ^2 - ^1 - 6 - | 5 - - - . . . .';
  const PDH = 'D . t . . t D . D . t . D t t .', PDH2 = 'D . t t? . t D . D . t . D t . t';
  reg('r_pager', {
    name: 'Pager Pe Message', bpm: 124, root: 57, scale: 'major', meter: 16, loop: false, gain: 0.8,
    parts: {
      kit: { kit: MACH.kit, div: 1, vol: 0.55 },
      dhol: { kit: 'dhol', div: 1, vol: 0.6, pan: 0.2 },
      claps: { kit: 'clap', div: 2, vol: 0.4, pan: -0.25 },
      bass: { inst: 'synbass', div: 2, oct: -1, vol: 0.6 },
      stab: { type: 'chord', inst: 'stab', div: 2, oct: 1, vol: 0.5, rev: 0.2, pan: -0.2 },
      flute: { inst: 'bansuri', div: 2, oct: 1, vol: 0.85, rev: 0.3, pan: 0.1 },
      lead: { inst: 'synlead', div: 2, oct: 1, vol: 0.55, rev: 0.3 },
    },
    sections: {
      intro: { bars: 4, cdiv: 16, chords: '1 6:m 4 5', dhol: J(PDH, PDH2, PDH, 'D . R . R . R . D t D t R R R R'), bass: 'r . r r . r . r', kit: MACH.m(J(R16, R16, 'h . h . h . h . h . h . h . h h', 'k . . . k . . . k . k . s s s s')) },
      A: { bars: 8, cdiv: 16, chords: '1 6:m 4 5 1 6:m 4 1', flute: PG_A, kit: MACH.m(cyc(8, ['k . h . k . h . k . h . k . h h?', 'k . h . k . h k? k . h . k . o .'], 'k . h . k . h . s . s . s s s! s')), dhol: cyc(8, [PDH, PDH2], 'D . t . D . t . R . R . R . D! .'), bass: 'r . r r . r . r', stab: '. . x . . x . .' },
      B: { bars: 8, cdiv: 16, chords: '6:m 4 5 1 6:m 4 5 5', lead: PG_B, kit: MACH.m(cyc(8, ['k . h . s . h . k . h . s . h h?'], 'k . s . s . s s s s s s s! s s s')), dhol: cyc(8, [PDH2, PDH], 'D t D t R . R . R . R . D! . . .'), bass: 'r . r r . r . r', stab: 'x . . x . . x .', claps: '. . x . . . x .' },
      A2: { bars: 8, cdiv: 16, chords: '1 6:m 4 5 1 6:m 4 1', flute: PG_A, lead: shift(PG_A, -2), kit: MACH.m(cyc(8, ['k . h . s . h . k . h . s . h h?', 'k . h . s . h k? k . h . s . o .'], 'k . h . s . h . s . s . s s s! s')), dhol: cyc(8, [PDH, PDH2], 'D . t . D . t . R . R . R . D! .'),
        bass: 'r . r r . r . r', stab: '. . x . . x . .', claps: '. . x . . . x .', vol: { lead: 0.6 } },
      out: { bars: 2, cdiv: 16, chords: '4 1', flute: '6 - 5 3 2 - 1 - | 1 - - - . . . .', kit: MACH.m('k . h . s . h . k . h . s . h . | k+x . . . . . . . . . . . . . . .'), dhol: 'D . t . D . t . R . R . R . R . | D! . . . . . . . . . . . . . . .', bass: 'r . r r . r . r | r - - - . . . .' },
    },
    order: ['intro', 'A', 'B', 'A2', 'out'],
  });

  /* ============================================================ station idents (2 bars) */
  reg('id_vani', { name: 'Deccan Vani ident', bpm: 90, root: 62, scale: 'major', meter: 16, loop: false, gain: 0.9,
    parts: { drone: { inst: 'tanpura', div: 4, oct: -1, vol: 0.5 }, pad: { type: 'chord', inst: 'harmonium', div: 4, oct: -1, vol: 0.5 }, santoor: { inst: 'santoor', div: 1, oct: 1, vol: 0.4, rev: 0.3 }, flute: { inst: 'bansuri', div: 2, vol: 0.85, rev: 0.4 } },
    sections: { A: { bars: 2, chords: '1 - - - | 4 - 1 -', drone: '5 ^1 ^1 1', pad: 'x - - - | x - x -', santoor: 'r f o ^t . . . . . . . . . . . . | ' + R16, flute: '. . . . 5 - ^1 - | ^3 - ^2 ^1 ^1 - - -' } }, order: ['A'] });
  reg('id_band', { name: 'Band Baaja ident', bpm: 120, root: 58, scale: 'major', meter: 16, loop: false, gain: 0.9,
    parts: { band: { kit: 'band', div: 1, vol: 0.62 }, tasha: { kit: TASHA.kit, div: 1, vol: 0.5, pan: 0.2 }, tpt: { inst: 'trumpet', div: 2, oct: 1, vol: 0.85, rev: 0.2 }, brass: { type: 'chord', inst: 'brass', div: 4, vol: 0.55 } },
    sections: { A: { bars: 2, chords: '1 - - - | 1 - - -', tasha: TASHA.m('R . R . R . R . R R R R R R R R | ' + R16), band: J(R16, 'B+C . . . . . . . . . . . . . . .'), tpt: '1 3 5 ^1 - - 5 - | ^1 - - - - - . .', brass: '. . . . | x - - .' } }, order: ['A'] });
  reg('id_pop', { name: 'Pop Patang ident', bpm: 118, root: 52, scale: 'minor', meter: 16, loop: false, gain: 0.9,
    parts: { kit: { kit: MACH.kit, div: 1, vol: 0.6 }, ep: { type: 'chord', inst: 'epiano', div: 4, oct: 1, vol: 0.55, rev: 0.3 }, lead: { inst: 'synlead', div: 2, oct: 1, vol: 0.8, rev: 0.3 } },
    sections: { A: { bars: 2, chords: '6 - - - | 1 - - -', kit: MACH.m('k . h . s . h . k . h . s . h h | k+x . . . . . . . . . . . . . . .'), ep: 'x - - - | x - - -', lead: '^1 - 7 - 5 - 3 - | 5 - - - - - . .' } }, order: ['A'] });

  /* ============================================================ walkman / radio catalogue */
  try {
    X.registerSong('ganesh', { title: 'Tank Bund Ka Jaloos', artist: 'Lucky Star Brass Band, Saidabad', station: 1 });
    X.registerSong('ramzan', { title: 'Bazaar Ki Roshni', artist: 'Nostalgia OST' });
    X.registerSong('flashback', { title: 'Purani Cassette', artist: 'Nostalgia OST' });
    const ST = IN.STATIONS;
    if (ST && ST[1] && Array.isArray(ST[1].songs) && ST[1].songs.indexOf('ganesh') < 0) X.registerStation(1, Object.assign({}, ST[1], { songs: ST[1].songs.concat('ganesh') }));
  } catch (e) { N.err('audio.score.catalogue', e); }
})();
