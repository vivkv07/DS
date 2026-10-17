/* music: the original score (src/audio_score.js). Structure checks on the compiled tracks (every id compiles, pattern
 * lengths fit their sections, tempi match systems §12.4/§12.5, the ending's five sections + key lift + final Sa, the
 * oldcity qawwali claps on 1 and 4), then offline renders of every track through the music bus (loudness, clipping,
 * gaps) with WAV + spectrogram PNGs in tests/out/aq/music_<id>.png.
 *   AQ=music node nostalgia/tests/audio_quality.cjs        MUSIC_SEC=12 for quicker renders, MUSIC_ONLY=title,ending
 */
'use strict';
const SPEC_BPM = { title: 84, flashback: 59, day: 104, hitec: 108, cantonment: 100, night: 72, oldcity: 96, kites: 120, numaish: 128, festival: 140,
  chase: 148, chase5: 148, tension: 60, victory: 126, ending: 76, ganesh: 132, ramzan: 84, r_chandni: 88, r_barish: 76, r_baraat: 132, r_neon: 116, r_pager: 124 };
const SPEC_METER = { oldcity: 12, festival: 12, numaish: 12, ramzan: 12 };

module.exports = {
  name: 'music', order: 50,
  async run(T) {
    const { ev, check, log, L, page } = T;
    // ---- structure (compiled events)
    const S = await ev(() => {
      const I = N.audio._internal, out = { ids: Object.keys(I.TRACKS), bad: [], lint: [], info: {} };
      const toks = (s) => String(s || '').replace(/\|/g, ' ').trim().split(/\s+/).filter(Boolean);
      for (const id of out.ids) {
        let c;
        try { c = I.compile(id); } catch (e) { out.bad.push(id + ': ' + e.message); continue; }
        if (!c || !c.total || !(c.duration > 0)) { out.bad.push(id + ': empty'); continue; }
        const tr = c.tr, notes = c.events.reduce((n, e) => n + (e ? e.length : 0), 0);
        out.info[id] = { bpm: tr.bpm, meter: c.meter, dur: +c.duration.toFixed(1), loopDur: +c.loopDur.toFixed(1), events: notes, loop: tr.loop !== false, roam: !!tr.roam };
        // every pattern's length (tokens * div) must divide its section (no accidental phase drift)
        for (const sn of tr.order) {
          const sec = tr.sections[sn], len = sec.bars * c.meter;
          for (const pn in tr.parts) {
            if (!sec[pn]) continue;
            const cfg = tr.parts[pn], type = cfg.type || (cfg.kit ? 'drums' : 'note');
            const div = (sec.div && sec.div[pn]) || cfg.div || (type === 'drums' ? 1 : type === 'chord' ? 4 : 2), n = toks(sec[pn]).length * div;
            if (n > len || len % n) out.lint.push(id + '.' + sn + '.' + pn + ' ' + n + '/' + len);
          }
          if (sec.chords) { const n = toks(sec.chords).length * (sec.cdiv || 4); if (n > len || len % n) out.lint.push(id + '.' + sn + '.chords ' + n + '/' + len); }
        }
      }
      // the ending
      const c = I.compile('ending'), tr = c.tr, root = tr.root;
      out.secs = N.audio.music.sections('ending');
      const li = tr.order.indexOf('lift'), s0 = c.secStart[li];
      out.liftChord = c.chords[s0] && c.chords[s0].pc; out.themeChord = c.chords[c.secStart[tr.order.indexOf('theme')]].pc;
      const first = (part, from) => { for (let s = from; s < c.total; s++) for (const e of c.events[s] || []) if (e.part === part && e.k === 'n') return e.notes[0]; return null; };
      out.liftFirst = first('vln', s0); out.themeFirst = first('flute', c.secStart[tr.order.indexOf('theme')]);
      const last = (part) => { for (let s = c.total - 1; s >= 0; s--) for (const e of c.events[s] || []) if (e.part === part && e.k === 'n') return { m: e.notes[e.notes.length - 1], s }; return null; };
      out.endMbox = last('mbox'); out.endDrone = last('drone'); out.endBass = last('bass');
      let lastStep = -1; for (let s = c.total - 1; s >= 0 && lastStep < 0; s--) if (c.events[s] && c.events[s].some((e) => e.k === 'n')) lastStep = s;
      out.lastStepPcs = (c.events[lastStep] || []).filter((e) => e.k === 'n' && e.part !== 'str' && e.part !== 'choir').map((e) => e.notes.map((m) => m % 12)).flat();
      out.tonicEnd = (root + 2) % 12; out.root = root;
      // the coda's music box plays the whole hook then lands on Sa: S R G P D P G R ... P G R S (semitones from Sa)
      const mb = []; for (let s = c.secStart[tr.order.indexOf('coda')]; s < c.total; s++) for (const e of c.events[s] || []) if (e.part === 'mbox') mb.push(((e.notes[0] - root - 2) % 12 + 12) % 12);
      out.codaMbox = mb;
      // oldcity claps on beats 1 and 4 (steps 0 and 6 of each 12-step bar) in every bar
      const oc = I.compile('oldcity'); let bars = 0, ok = 0;
      for (let b = 0; b * oc.meter < oc.total; b++) {
        bars++;
        const at = (st) => (oc.events[b * oc.meter + st] || []).some((e) => e.part === 'claps');
        if (at(0) && at(6)) ok++;
      }
      out.ocClaps = { bars, ok, meter: oc.meter };
      const raga = [0, 1, 4, 5, 7, 8, 11].map((x) => (x + oc.tr.root) % 12), outside = new Set();
      for (const evs of oc.events) for (const e of evs || []) if (e.k === 'n') for (const m of e.notes) if (raga.indexOf(m % 12) < 0) outside.add(e.part + ':' + (m % 12));
      out.ocOutside = Array.from(outside);
      out.instruments = { musicbox: !!I.INST.musicbox, choir: !!I.INST.choir, sarangi: !!I.INST.sarangi, tuba: !!I.INST.tuba, calliope: !!I.INST.calliope, dappu: !!I.KITS.dappu, tasha: !!I.KITS.tasha, marfa: !!I.KITS.marfa, machine: !!I.KITS.machine };
      out.list = N.audio.music.TRACKS;
      out.idDur = {}; for (const k of ['id_vani', 'id_band', 'id_pop']) out.idDur[k] = I.compile(k).duration;
      return out;
    });
    log('instruments present: ' + JSON.stringify(S.instruments));
    check(S.bad.length === 0, 'every track compiles (' + S.ids.length + ' ids)', S.bad);
    check(S.lint.length === 0, 'every pattern fits its section (no phase drift)', S.lint.slice(0, 12));
    for (const id of ['title', 'flashback', 'day', 'hitec', 'cantonment', 'night', 'oldcity', 'chase', 'chase5', 'tension', 'victory', 'ending', 'kites', 'festival', 'ganesh', 'ramzan', 'numaish', 'r_chandni', 'r_barish', 'r_baraat', 'r_neon', 'r_pager'])
      check(S.list.includes(id), 'music.TRACKS has ' + id);
    check(S.list.length >= 17, S.list.length + ' music tracks (>= 17)');
    const bpmBad = Object.keys(SPEC_BPM).filter((id) => !S.info[id] || Math.abs(S.info[id].bpm - SPEC_BPM[id]) > SPEC_BPM[id] * 0.04);
    check(bpmBad.length === 0, 'tempi match the spec (±4%)', bpmBad.map((id) => id + ':' + (S.info[id] && S.info[id].bpm) + '≠' + SPEC_BPM[id]));
    const mBad = Object.keys(SPEC_METER).filter((id) => !S.info[id] || S.info[id].meter !== SPEC_METER[id]);
    check(mBad.length === 0, 'oldcity / festival / ramzan in 6/8 and numaish in 3/4 (12 steps per bar)', mBad);
    const roamBad = ['day', 'hitec', 'cantonment', 'night', 'oldcity'].filter((id) => { const i = S.info[id]; const pass = i && i.dur; return !i || !i.roam || pass < 55 || pass > 125; });
    check(roamBad.length === 0, 'free-roam passes are 55-125 s: ' + ['day', 'hitec', 'cantonment', 'night', 'oldcity'].map((id) => id + ' ' + (S.info[id] && S.info[id].dur) + 's').join(', '), roamBad);
    const names = S.secs.map((x) => x.name).join(',');
    check(names === 'alaap,theme,rise,lift,coda', 'ending sections = alaap, theme, rise, lift, coda: ' + S.secs.map((x) => x.name + '@' + x.start.toFixed(1)).join(' '));
    const st = S.secs.map((x) => x.start), dur = S.info.ending.dur;
    check(st[0] === 0 && st[1] > 25 && st[1] < 55 && st[2] - st[1] > 25 && st[3] - st[2] > 25 && st[4] - st[3] > 25 && dur - st[4] > 20 && dur > 170 && dur < 250 && !S.info.ending.loop,
      'ending timings plausible (alaap ~40 s, each section >= 25 s, total ' + dur + ' s, non-looping)');
    check(S.liftChord === (S.root + 2) % 12 && S.themeChord === S.root % 12 && S.liftFirst - S.themeFirst === 2, 'the lift is transposed +2 semitones (chord ' + S.themeChord + ' -> ' + S.liftChord + ', first melody note ' + S.themeFirst + ' -> ' + S.liftFirst + ')');
    check(S.endMbox && S.endMbox.m % 12 === S.tonicEnd && S.endDrone.m % 12 === S.tonicEnd && S.endBass.m % 12 === S.tonicEnd && S.lastStepPcs.every((p) => p === S.tonicEnd),
      'the ending resolves: last music-box, drone and bass notes are Sa (pc ' + S.tonicEnd + ')', { mbox: S.endMbox, drone: S.endDrone, bass: S.endBass, last: S.lastStepPcs });
    const hook = [0, 2, 4, 7, 9, 7, 4, 2], cm = S.codaMbox.join(',');
    check(cm.indexOf(hook.join(',')) >= 0 && S.codaMbox[S.codaMbox.length - 1] === 0 && S.codaMbox[S.codaMbox.length - 2] === 2, 'the coda plays the hook (S R G P D P G R) and only then lands R -> S', S.codaMbox);
    check(S.ocOutside.length === 0, 'oldcity: every note (melody, harmonium chords, bass) stays inside Bhairav', S.ocOutside);
    check(S.ocClaps.meter === 12 && S.ocClaps.ok === S.ocClaps.bars, 'oldcity: qawwali claps on beats 1 and 4 of every 6/8 bar (' + S.ocClaps.ok + '/' + S.ocClaps.bars + ')');

    // ---- renders
    const SEC = +(process.env.MUSIC_SEC || 26);
    const only = process.env.MUSIC_ONLY ? process.env.MUSIC_ONLY.split(',') : null;
    const jobs = [];
    for (const id of S.list) if (id !== 'ending') jobs.push({ id, name: 'music_' + id, sec: S.info[id].loop ? SEC : Math.min(SEC, S.info[id].dur + 0.5), opts: {} });
    const ec = await ev(() => { const c = N.audio._internal.compile('ending'); return c.secStart; });
    ['alaap', 'theme', 'rise', 'lift', 'coda'].forEach((n, i) => jobs.push({ id: 'ending', name: 'music_ending_' + n, sec: n === 'coda' ? 40 : 30, opts: { offsetStep: ec[i] } }));
    for (const id of ['id_vani', 'id_band', 'id_pop']) jobs.push({ id, name: 'music_' + id, sec: Math.min(6, S.idDur[id] + 0.4), opts: {} });
    const loud = [], quiet = [], clip = [], gaps = [], secRms = {}, riseHalves = [];
    for (const j of jobs) {
      if (only && !only.includes(j.id)) continue;
      const t0 = Date.now();
      const r = await L.renderTrack(page, j.id, j.sec, j.opts);
      const m = L.save(r, j.name);
      if (!m) { check(false, j.name + ' rendered'); continue; }
      const idt = /^id_/.test(j.id);
      if (j.id === 'ending') secRms[j.name.replace('music_ending_', '')] = m.rmsDb;
      if (j.name === 'music_ending_rise') { const mo = L.mono(r), h = Math.floor(mo.length / 3), db = (a, b) => { let e = 0; for (let i = a; i < b; i++) e += mo[i] * mo[i]; return +(10 * Math.log10(e / (b - a) + 1e-12)).toFixed(1); }; riseHalves.push(db(0, h), db(2 * h, mo.length)); }
      log(j.name.padEnd(22) + ' rms ' + m.rmsDb + ' peak ' + m.peakDb + ' loud95 ' + m.loud95 + ' silent ' + m.silentFrac + ' centroid ' + m.centroid + ' low ' + m.lowFrac + ' clicks ' + m.clicks + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
      if (m.peakDb > -0.5) clip.push(j.name + ' ' + m.peakDb);
      if (!idt && m.rmsDb > -14) loud.push(j.name + ' ' + m.rmsDb);
      // the alaap and the coda are meant to be soft (solo sitar over tanpura; the music box at the end)
      const lo = /alaap|coda/.test(j.name) ? -30 : idt ? -28 : -22;
      if (m.rmsDb < lo) quiet.push(j.name + ' ' + m.rmsDb);
      const gapMax = /coda/.test(j.name) ? 0.3 : idt ? 0.3 : 0.06;
      if (m.silentFrac > gapMax) gaps.push(j.name + ' ' + m.silentFrac);
    }
    check(clip.length === 0, 'no music render peaks above -0.5 dBFS', clip);
    check(loud.length === 0, 'no track louder than -14 dBFS RMS', loud);
    check(quiet.length === 0, 'no track quieter than -22 dBFS RMS (alaap/coda -30)', quiet);
    check(gaps.length === 0, 'no unintended silent gaps', gaps);
    if (secRms.theme != null && secRms.lift != null) {
      check(secRms.lift - secRms.theme >= 2 && secRms.lift >= secRms.rise && secRms.coda < secRms.lift - 3 && secRms.alaap < secRms.theme - 4,
        'the ending builds: alaap ' + secRms.alaap + ' < theme ' + secRms.theme + ' < lift ' + secRms.lift + ' (peak), coda ' + secRms.coda + ' falls away', secRms);
      check(riseHalves.length === 2 && riseHalves[1] - riseHalves[0] >= 1.5, 'the rise rises (first third ' + riseHalves[0] + ' dB -> last third ' + riseHalves[1] + ' dB)');
    }
    // melody balance: the lead alone vs the accompaniment alone (temporary muted re-voicings; removed afterwards)
    const BAL = [['title', 'B', ['vln']], ['title', 'A', ['flute']], ['ending', 'theme', ['flute']], ['ending', 'lift', ['vln', 'flute']], ['oldcity', 'A', ['hl', 'sh']], ['oldcity', 'D', ['hl', 'sh']]];
    const bal = [];
    for (const [id, sec, lead] of BAL) {
      if (only && !only.includes(id)) continue;
      const lv = [];
      for (const keepLead of [true, false]) {
        const off = await ev(([id, sec, lead, keepLead]) => {
          const I = N.audio._internal, tr = I.TRACKS[id], mute = Object.keys(tr.parts).filter((p) => lead.includes(p) !== keepLead);
          N.audio.ext.registerTrack('__bal', { base: id, mute });
          const c = I.compile('__bal'); return c.secStart[c.tr.order.indexOf(sec)];
        }, [id, sec, lead, keepLead]);
        const r = await L.renderTrack(page, '__bal', 14, { offsetStep: off });
        lv.push(L.metrics(r).rmsDb);
      }
      bal.push(id + '.' + sec + ' ' + lead.join('+') + ' ' + (lv[0] - lv[1] >= 0 ? '+' : '') + (lv[0] - lv[1]).toFixed(1) + ' dB');
      if (!(lv[0] - lv[1] >= 2)) bal.push('  ^ too low');
    }
    await ev(() => { delete N.audio._internal.TRACKS.__bal; N.audio.music.TRACKS = N.audio.music.TRACKS.filter((k) => k !== '__bal'); });
    log('melody over accompaniment: ' + bal.join(', '));
    check(!bal.some((x) => /too low/.test(x)), 'every lead sits >= 2 dB over its accompaniment', bal);
  },
};
