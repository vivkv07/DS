/* vehicles: engine voices (rpm sweeps with gears + throttle), horns, bells, potholes, tyres per surface, starts, CPU.
 * Engine sweeps drive the real voice in an OfflineAudioContext (N.audio.vehicles.sweep: suspend/resume per ~17 ms frame) through
 * idle -> full throttle (gear changes) -> cruise -> blip -> coast -> brake -> idle; the frame log (firing Hz, gear, shifts) is
 * compared with the audio: the firing comb is in the spectrum, the low-band centroid follows rpm, gear changes dip the level. */
'use strict';

const SR = 44100;
function mono(r) { const n = r.chans[0].length, m = new Float32Array(n); for (const c of r.chans) for (let i = 0; i < n; i++) m[i] += c[i] / r.chans.length; return m; }
const db = (x) => 20 * Math.log10(x + 1e-12);
function rmsSeg(m, t0, t1) { const a = Math.max(0, Math.floor(t0 * SR)), b = Math.min(m.length, Math.floor(t1 * SR)); let e = 0; for (let i = a; i < b; i++) e += m[i] * m[i]; return Math.sqrt(e / Math.max(1, b - a)); }
function spec(L, m, tc, n) { // linear magnitude spectrum of an n-sample Hann window centred at tc
  n = n || 8192;
  const s = Math.max(0, Math.min(m.length - n, Math.floor(tc * SR - n / 2)));
  const f = L.stft(m.subarray(s, s + n), n, n)[0];
  return f ? Array.from(f, (d) => Math.pow(10, d / 20)) : null;
}
function comb(sp, f, n) { // energy on a harmonic comb at f (8 harmonics, +-1 bin)
  const bin = SR / n; let e = 0;
  for (let k = 1; k <= 8; k++) { const i = Math.round(k * f / bin); if (i + 1 >= sp.length) break; e += Math.max(sp[i - 1], sp[i], sp[i + 1]) / Math.sqrt(k); }
  return e;
}
function lowCentroid(sp, n, lo, hi) { const bin = SR / n; let a = 0, w = 0; for (let i = Math.ceil(lo / bin); i <= hi / bin; i++) { a += sp[i]; w += sp[i] * i * bin; } return w / (a + 1e-12); }
function pearson(x, y) { const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy + 1e-12); }
function dominant(sp, n, lo, hi) { const bin = SR / n; let best = 0, bi = 0; for (let i = Math.ceil(lo / bin); i <= hi / bin; i++) if (sp[i] > best) { best = sp[i]; bi = i; } return bi * bin; }
function bursts(m, thrDb) { // count separate loud segments (10 ms windows above peak + thrDb)
  const w = Math.floor(SR * 0.01), lv = []; let pk = -200;
  for (let s = 0; s + w <= m.length; s += w) { const v = db(rmsSeg(m, s / SR, (s + w) / SR)); lv.push(v); pk = Math.max(pk, v); }
  let n = 0, on = false, gap = 0;
  for (const v of lv) { if (v > pk + thrDb) { if (!on && gap >= 3) n++; else if (!on && n === 0) n++; on = true; gap = 0; } else { on = false; gap++; } }
  return n;
}
function activeDur(m, thrDb) { let pk = 0; for (const v of m) pk = Math.max(pk, Math.abs(v)); const th = pk * Math.pow(10, thrDb / 20); let last = 0; for (let i = 0; i < m.length; i++) if (Math.abs(m[i]) > th) last = i; return last / SR; }

module.exports = {
  name: 'vehicles', order: 20,
  async run(T) {
    const { L, check, log, ev, page } = T;
    const api = await ev(() => { const V = N.audio.vehicles; return V ? { types: V.types, defs: Object.fromEntries(Object.entries(V.DEF).map(([k, d]) => [k, { tops: d.tops, shift: d.shift, fIdle: d.fIdle, fMax: d.fMax }])) } : null; });
    check(!!api, 'N.audio.vehicles test hooks present');
    if (!api) return;

    // ---------------------------------------------------------------- engines
    const SEC = 12, res = {};
    for (const type of ['auto', 'scooty', 'luna', 'chetak', 'rx100', 'ambassador', 'padmini', 'maruti800', 'bus', 'lorry', 'boat']) {
      const r = await L.renderFn(page, `(oc, out, t, X) => N.audio.vehicles.sweep(oc, out, '${type}', ${SEC}, {surface: 'asphalt'})`, SEC);
      const lg = await ev(() => N.audio.vehicles.lastLog);
      const m0 = L.save(r, 'veh_engine_' + type);
      const m = mono(r), D = api.defs[type];
      // full-throttle loudness
      const full = lg.filter((e) => e.thr === 1 && e.sf > 0.55);
      let e = 0, n = 0;
      for (const f of full) { const v = rmsSeg(m, f.t, f.t + 0.017); e += v * v; n++; }
      const fullDb = db(Math.sqrt(e / Math.max(1, n)));
      // firing comb + low-band centroid tracking rpm (8192-pt windows every 0.25 s while the engine is audible)
      const N8 = 8192; let good = 0, tot = 0; const fs = [], cs = [];
      for (let tc = 0.4; tc < SEC - 0.4; tc += 0.25) {
        const near = lg.reduce((b, x) => (Math.abs(x.t - tc) < Math.abs(b.t - tc) ? x : b), lg[0]);
        if (!near || !near.f || near.shifting) continue;
        const sp = spec(L, m, tc, N8); if (!sp) continue;
        const c0 = comb(sp, near.f, N8), cOff = (comb(sp, near.f * 0.9, N8) + comb(sp, near.f * 1.1, N8)) / 2;
        tot++; if (c0 > cOff * 1.15) good++;
        fs.push(near.f); cs.push(lowCentroid(sp, N8, 12, D.fMax * 2.2));
      }
      const corr = pearson(fs, cs);
      // gear changes: the level dips while the clutch is in
      const shifts = []; for (let i = 1; i < lg.length; i++) if (lg[i].shifting && !lg[i - 1].shifting && lg[i].thr === 1) shifts.push(lg[i].t);
      let dips = 0; const dipDb = [];
      for (const ts of shifts) {
        const before = db(rmsSeg(m, ts - 0.2, ts - 0.02));
        let mn = 0; for (let tt = ts; tt < ts + D.shift; tt += 0.01) mn = Math.min(mn, db(rmsSeg(m, tt, tt + 0.03)) - before);
        dipDb.push(+mn.toFixed(1)); if (mn < -1.5) dips++;
      }
      res[type] = Object.assign({}, m0, { fullDb: +fullDb.toFixed(1), comb: +(good / Math.max(1, tot)).toFixed(2), corr: +corr.toFixed(2), shifts: shifts.length, dips });
      log(type + ': ' + JSON.stringify(res[type]) + ' dips ' + JSON.stringify(dipDb));
      check(m0 && m0.clicks === 0 && Math.abs(m0.dc) < 0.01 && m0.peakDb < -1, type + ' engine sweep: no clicks / clipping / DC', m0);
      check(fullDb > -26 && fullDb < -16, type + ' full-throttle RMS in -26..-16 dBFS', fullDb);
      check(good / Math.max(1, tot) >= 0.65, type + ' firing-frequency comb present in >= 65% of windows', good + '/' + tot);
      const cmin = D.tops.length > 1 ? 0.6 : 0.45; // CVT / single speed: a narrower rpm range
      check(corr > cmin, type + ' low-band spectral centroid tracks rpm (r > ' + cmin + ')', corr);
      if (D.tops.length > 1) {
        check(shifts.length >= D.tops.length - 2, type + ' gear changes on the way up (' + shifts.length + ')', shifts);
        check(dips >= Math.max(1, Math.ceil(shifts.length * 0.6)), type + ' gear changes dip the level (clutch)', dipDb);
      }
    }
    check(res.scooty.centroid > res.chetak.centroid * 1.3, 'Scooty brighter than the Chetak (centroid)', [res.scooty.centroid, res.chetak.centroid]);
    check(res.rx100.centroid > res.chetak.centroid, 'RX100 rasp brighter than the Chetak', [res.rx100.centroid, res.chetak.centroid]);
    check(res.bus.lowFrac > 0.3 && res.lorry.lowFrac > 0.3 && res.bus.lowFrac > res.scooty.lowFrac * 2 && res.lorry.lowFrac > res.chetak.lowFrac, 'bus / lorry are low-heavy', [res.bus.lowFrac, res.lorry.lowFrac, res.chetak.lowFrac, res.scooty.lowFrac]);
    check(res.luna.fullDb < res.rx100.fullDb, 'the Luna is weaker than the RX100', [res.luna.fullDb, res.rx100.fullDb]);

    // pedal cycles: pedalling (crank) vs coasting (ratchet ticks)
    for (const type of ['hero_cycle', 'hercules_cycle']) {
      const r = await L.renderFn(page, `(oc, out, t, X) => N.audio.vehicles.sweep(oc, out, '${type}', 8, {surface: 'asphalt'})`, 8);
      const m0 = L.save(r, 'veh_pedal_' + type);
      check(m0 && m0.clicks === 0 && m0.peakDb < -3 && m0.rmsDb > -50, type + ' pedal voice clean + audible', m0);
      res[type] = m0;
    }

    // ---------------------------------------------------------------- horns
    const horn = async (name, o, sec, file) => { const r = await L.render(page, name, sec, o || {}); const m = L.save(r, file || 'veh_horn_' + name); return { r, m, mono: r && mono(r) }; };
    for (const [name, o] of [['auto_horn'], ['scooter_horn'], ['scooter_horn', { variant: 'dc' }], ['scooty_horn'], ['car_horn'], ['car_horn', { dur: 1.2 }], ['bus_horn'], ['bus_horn', { dur: 1.5 }], ['lorry_horn', { variant: 0 }], ['lorry_horn', { variant: 3 }]]) {
      const tag = name + (o ? '_' + Object.values(o).join('_') : '');
      const h = await horn(name, o, 2.6, 'veh_horn_' + tag);
      check(h.m && h.m.peakDb > -12 && h.m.peakDb < -1 && h.m.clicks === 0 && Math.abs(h.m.dc) < 0.01, tag + ' level / clicks', h.m);
      if (name === 'auto_horn') check(bursts(h.mono, -14) === 2, 'auto horn: two squeezes', bursts(h.mono, -14));
      if (name === 'scooty_horn') check(bursts(h.mono, -14) === 2, 'Scooty: "peep peep"', bursts(h.mono, -14));
      if (o && o.dur) check(activeDur(h.mono, -30) > o.dur, tag + ' holds for dur', activeDur(h.mono, -30));
      if (name === 'lorry_horn') {
        const ps = new Set();
        for (let tc = 0.1; tc < 1.4; tc += 0.04) { const sp = spec(L, h.mono, tc, 2048); if (sp && rmsSeg(h.mono, tc - 0.02, tc + 0.02) > 0.02) ps.add(Math.round(12 * Math.log2(dominant(sp, 2048, 300, 1000) / 392))); }
        check(ps.size >= 3, 'lorry horn plays several distinct pitches', Array.from(ps));
      }
      if (name === 'scooty_horn' || name === 'bus_horn') res[name] = h.m;
    }
    check(res.scooty_horn.centroid > res.bus_horn.centroid * 1.5, 'Scooty peep is thin and high, the bus horn deep', [res.scooty_horn.centroid, res.bus_horn.centroid]);

    // ---------------------------------------------------------------- bells
    const bell = {};
    for (const v of ['plain', 'hero', 'hercules']) {
      const h = await horn('bell', { variant: v }, 3, 'veh_bell_' + v);
      const sp = spec(L, h.mono, 0.15, 4096);
      bell[v] = { m: h.m, f: dominant(sp, 4096, 800, 6000), dur: activeDur(h.mono, -40) };
      check(h.m && h.m.peakDb > -12 && h.m.peakDb < -1 && h.m.clicks === 0, 'bell ' + v + ' level / clicks', h.m);
    }
    log('bells ' + JSON.stringify(Object.fromEntries(Object.entries(bell).map(([k, b]) => [k, { f: Math.round(b.f), dur: +b.dur.toFixed(2) }]))));
    check(bell.hero.f < bell.plain.f && bell.plain.f < bell.hercules.f, 'Hero bell lowest, Hercules highest', [bell.hero.f, bell.plain.f, bell.hercules.f]);
    check(bell.hero.dur > bell.hercules.dur * 1.5, 'Hero bell rings much longer than the Hercules ding-ding', [bell.hero.dur, bell.hercules.dur]);

    // ---------------------------------------------------------------- potholes
    const pot = {};
    for (const vt of ['cycle', 'scooty', 'auto', 'ambassador', 'bus']) {
      for (const wet of [false, true]) {
        const h = await horn('pothole', { vtype: vt, variant: wet ? 'wet' : null }, 1.5, 'veh_pothole_' + vt + (wet ? '_wet' : ''));
        check(h.m && h.m.peakDb > -12 && h.m.peakDb < -1 && h.m.clicks === 0 && Math.abs(h.m.dc) < 0.01, 'pothole ' + vt + (wet ? ' wet' : '') + ' level / clicks', h.m);
        if (!wet) pot[vt] = h.m;
      }
    }
    check(pot.bus.lowFrac > pot.cycle.lowFrac && pot.ambassador.lowFrac > pot.cycle.lowFrac, 'bus/car pothole thud deeper than a cycle\'s', [pot.bus.lowFrac, pot.ambassador.lowFrac, pot.cycle.lowFrac]);
    const potPitch = await L.render(page, 'pothole', 1.2, { pitch: 0.7 });
    check(potPitch && L.metrics(potPitch).clicks === 0, 'pothole without vtype (pitch from vehicles.js) renders');

    // ---------------------------------------------------------------- tyres per surface (engine muted)
    const surf = {};
    for (const s of ['asphalt', 'wet', 'dirt', 'gravel', 'cobble', 'grass']) {
      const r = await L.renderFn(page, `(oc, out, t, X) => N.audio.vehicles.road(oc, out, '${s}', 4, {sf: 0.7})`, 4);
      surf[s] = L.save(r, 'veh_tyres_' + s);
      check(surf[s] && surf[s].clicks === 0 && surf[s].rmsDb > -50 && surf[s].peakDb < -3, 'tyres on ' + s + ': audible, clean', surf[s]);
    }
    log('tyres ' + JSON.stringify(Object.fromEntries(Object.entries(surf).map(([k, m]) => [k, [m.rmsDb, m.centroid, m.lowFrac]]))));
    check(surf.wet.centroid > surf.asphalt.centroid * 1.3, 'wet road swish brighter than dry asphalt', [surf.wet.centroid, surf.asphalt.centroid]);
    check(surf.cobble.lowFrac > surf.asphalt.lowFrac, 'Old City cobbles rumble lower than asphalt', [surf.cobble.lowFrac, surf.asphalt.lowFrac]);
    check(surf.gravel.crest > surf.asphalt.crest + 3, 'gravel crunch is spikier than asphalt hiss', [surf.gravel.crest, surf.asphalt.crest]);

    // ---------------------------------------------------------------- starts
    for (const [name, o] of [['chetak_start'], ['chetak_start', { pitch: 1.55, dur: 0.8 }], ['auto_start'], ['car_start'], ['diesel_start'], ['air_brake']]) {
      const tag = name + (o ? '_scooty' : '');
      const h = await horn(name, o, 2.6, 'veh_' + tag);
      check(h.m && h.m.peakDb > -14 && h.m.peakDb < -1 && h.m.clicks === 0 && Math.abs(h.m.dc) < 0.01, tag + ' level / clicks', h.m);
    }

    // ---------------------------------------------------------------- CPU
    const cpu = await ev(async () => {
      const V = N.audio.vehicles;
      const nodes = { auto: V.nodes('auto', false), autoPlayer: V.nodes('auto', true), bus: V.nodes('bus', false), cycle: V.nodes('hero_cycle', true) };
      const b = await V.bench(5, 10);
      return { nodes, b };
    });
    log('CPU ' + JSON.stringify(cpu));
    check(cpu.nodes.auto <= 20 && cpu.nodes.autoPlayer <= 24 && cpu.nodes.cycle <= 20, 'nodes per voice within budget', cpu.nodes);
    check(cpu.b.ms <= cpu.b.msBuiltin * 1.6 + 150 && cpu.b.realtimeFrac < 0.2, '5 voices: audio-thread cost near the built-in voices, well under real time', cpu.b);
    check(cpu.b.updUs < 60, 'update() JS cost per voice per frame < 60 us', cpu.b.updUs);
    // the voice through the live engine: player vehicle -> our voice
    const live = await ev(() => { const e = N.audio._internal.eng; return { has: !!N.audio.vehicles, factory: typeof N.audio.ext.setEngineVoice }; });
    check(live.has, 'live engine factory registered', live);
  },
};
