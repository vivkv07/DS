/* city ambience (src/audio_ambience.js): animal + city one-shots (levels, clicks, spectral character), node counts,
 * district beds by time of day (offline renders), night loops, the shop radio, and live scheduling checks:
 * temple bells near a temple but never at Birla Mandir, the 08:45 school bell on a weekday, the Sunday church peal. */
'use strict';
const ONE = [ // [sfx, opts, seconds, file]
  ['crow_caw', { n: 3 }, 2.2, 'amb_crow'], ['koel', { n: 7 }, 5.5, 'amb_koel'], ['koel', { variant: 'female' }, 3, 'amb_koel_female'],
  ['coo', { n: 2 }, 3, 'amb_coo'], ['pigeons', { n: 5 }, 3.5, 'amb_pigeons'], ['bird', { variant: 'sparrow' }, 2, 'amb_sparrow'],
  ['bird', { variant: 'myna' }, 3, 'amb_myna'], ['bird', { variant: 'bulbul' }, 1.5, 'amb_bulbul'], ['cheel', {}, 2, 'amb_cheel'],
  ['dog_bark', { n: 3 }, 1.6, 'amb_dog'], ['cow_moo', {}, 2, 'amb_cow'], ['cow_moo', { variant: 'buffalo' }, 2.5, 'amb_buffalo'], ['goat_bleat', {}, 1.2, 'amb_goat'],
  ['cooker', { n: 2 }, 7, 'amb_cooker'], ['temple_bell', { n: 3 }, 8, 'amb_temple_bell'], ['temple_bell', { variant: 'aarti' }, 5, 'amb_temple_aarti'],
  ['church_bell', { variant: 'peal', n: 2 }, 14, 'amb_church_peal'], ['church_bell', { variant: 'toll', n: 2 }, 12, 'amb_church_toll'],
  ['school_bell', { n: 8 }, 4.5, 'amb_school_bell'], ['gossip', { n: 4 }, 5, 'amb_gossip'], ['construction', {}, 4, 'amb_construction'],
  ['boat_putt', { dur: 3 }, 3.5, 'amb_boat'], ['train_pass', { dur: 8 }, 8.5, 'amb_train_pass'], ['dhobi_slap', { n: 3 }, 3.5, 'amb_dhobi'],
];
const CALLS = ['veg', 'banana', 'flower', 'chai', 'paper', 'kulfi', 'bhutta', 'purani'];

// ---- spectral helpers (node side)
function avgSpec(L, r) { const fr = L.stft(L.mono(r), 4096, 2048); const acc = new Float64Array(2048); for (const f of fr) for (let k = 0; k < 2048; k++) acc[k] += Math.pow(10, f[k] / 10); return acc; }
const hz = (k, sr) => (k * sr) / 4096;
function peaks(acc, sr, lo, hi, n) { // strongest local maxima (dB) in [lo, hi]
  const out = [];
  for (let k = 2; k < acc.length - 2; k++) { const f = hz(k, sr); if (f < lo || f > hi) continue; if (acc[k] > acc[k - 1] && acc[k] >= acc[k + 1] && acc[k] > acc[k - 2] && acc[k] >= acc[k + 2]) out.push([f, 10 * Math.log10(acc[k] + 1e-20)]); }
  out.sort((a, b) => b[1] - a[1]);
  const sel = []; for (const p of out) { if (sel.every((q) => Math.abs(q[0] - p[0]) > 25)) sel.push(p); if (sel.length >= n) break; }
  return sel;
}
function level(L, r, win) { const m = L.mono(r), w = Math.floor(r.sr * (win || 0.05)), lv = []; for (let s = 0; s + w <= m.length; s += w) { let e = 0; for (let i = s; i < s + w; i++) e += m[i] * m[i]; lv.push(10 * Math.log10(e / w + 1e-12)); } return lv; }
function ringTime(L, r) { const lv = level(L, r); let mx = -200, im = 0; lv.forEach((v, i) => { if (v > mx) { mx = v; im = i; } }); let last = im; lv.forEach((v, i) => { if (v > mx - 40) last = i; }); return (last - im) * 0.05; }
function onsets(L, r) { const lv = level(L, r, 0.02); let n = 0, armed = true; const mx = Math.max(...lv); for (let i = 1; i < lv.length; i++) { if (armed && lv[i] - lv[i - 1] > 4 && lv[i] > mx - 20) { n++; armed = false; } else if (lv[i] < lv[i - 1]) armed = true; } return n; }
function domTrack(L, r) { // dominant frequency per loud frame
  const fr = L.stft(L.mono(r), 4096, 1024), out = [];
  let mx = -200; for (const f of fr) for (const v of f) if (v > mx) mx = v;
  fr.forEach((f, i) => { let bk = 0, bv = -300; for (let k = 10; k < 1200; k++) if (f[k] > bv) { bv = f[k]; bk = k; } if (bv > mx - 20) out.push([i * 1024 / r.sr, hz(bk, r.sr)]); });
  return out;
}
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

module.exports = {
  name: 'ambience', order: 30,
  async run(T) {
    const { L, ev, check, log } = T;
    const api = await ev(() => { const A = N.audio.ambience; return A ? { calls: A.CALLS, sfx: N.audio.SFX_NAMES.filter((n) => ['goat_bleat', 'gossip', 'construction', 'boat_putt', 'train_pass', 'dhobi_slap', 'radio_cricket'].includes(n)).length } : null; });
    check(api && api.calls.length === 8 && api.sfx === 7, 'audio_ambience loaded: 8 hawker calls, new SFX registered', api);

    // ---------------------------------------------------------------- one-shots
    const M = {};
    for (const [name, o, sec, file] of ONE) {
      const r = await L.render(T.page, name, sec, o);
      const m = (M[file] = L.save(r, file)); M[file].r = r;
      check(m && m.peakDb >= -18 && m.peakDb <= -1 && m.clicks === 0 && Math.abs(m.dc) < 0.01, file + ': peak ' + (m && m.peakDb) + ' dBFS, clicks ' + (m && m.clicks), m);
    }
    for (const v of CALLS) {
      const r = await L.render(T.page, 'vendor_call', 3, { variant: v });
      const m = L.save(r, 'amb_vendor_' + v);
      const tr = domTrack(L, r).map((p) => p[1]).filter((f) => f < 700);
      check(m && m.peakDb >= -18 && m.peakDb <= -1 && m.clicks === 0, 'vendor_call ' + v + ': peak ' + m.peakDb + ' centroid ' + m.centroid + ' f0~' + Math.round(median(tr)), m);
      M['call_' + v] = m;
    }
    const cents = CALLS.map((v) => M['call_' + v].centroid);
    check(new Set(cents.map((c) => Math.round(c / 60))).size >= 6, 'hawker calls have distinct timbres (centroids ' + cents.join(' ') + ')');
    // koel: fundamental ~600-1200 Hz, the series climbs
    { const tr = domTrack(L, M.amb_koel.r).filter((p) => p[1] > 400 && p[1] < 2000); const q = Math.floor(tr.length / 4);
      const a = median(tr.slice(0, q).map((p) => p[1])), b = median(tr.slice(-q).map((p) => p[1]));
      check(a > 550 && b < 1500 && b > a * 1.2, 'koel: fundamental ' + Math.round(a) + ' -> ' + Math.round(b) + ' Hz, a rising series', { a, b }); }
    { const m = M.amb_crow, pk = peaks(avgSpec(L, m.r), m.r.sr, 400, 6000, 12).filter((p, i, all) => p[1] > all[0][1] - 30);
      check(m.centroid > 1000 && m.centroid < 3000 && pk.length >= 5, 'crow: centroid ' + m.centroid + ' Hz, ' + pk.length + ' strong partials (harsh)', pk.slice(0, 6).map((p) => Math.round(p[0]))); }
    { const m = M.amb_cooker, acc = avgSpec(L, m.r), pk = peaks(acc, m.r.sr, 500, 10000, 1)[0];
      const band = []; for (let k = 0; k < acc.length; k++) { const f = hz(k, m.r.sr); if (f > 1000 && f < 8000) band.push(10 * Math.log10(acc[k] + 1e-20)); }
      check(pk && pk[0] > 2000 && pk[1] - median(band) > 20, 'cooker: tonal whistle peak at ' + Math.round(pk[0]) + ' Hz, ' + Math.round(pk[1] - median(band)) + ' dB over the band median'); }
    { const m = M.amb_temple_bell, pk = peaks(avgSpec(L, m.r), m.r.sr, 200, 8000, 4);
      const f0 = pk[0][0], ratios = pk.slice(1).map((p) => p[0] / f0), inh = ratios.filter((x) => Math.abs(x - Math.round(x)) > 0.08 && x > 1.05).length;
      const rt = ringTime(L, m.r);
      check(inh >= 1 && rt > 1.5, 'temple bell: inharmonic partials ' + ratios.map((x) => x.toFixed(2)).join(' ') + ' x ' + Math.round(f0) + ' Hz; ring ' + rt.toFixed(1) + ' s', pk);
      const c = M.amb_church_toll, rc = ringTime(L, c.r);
      check(c.centroid < m.centroid && rc > rt, 'church bell lower (centroid ' + c.centroid + ' < ' + m.centroid + ') and longer (' + rc.toFixed(1) + ' s > ' + rt.toFixed(1) + ' s) than the temple ghanta'); }
    { const n = onsets(L, M.amb_school_bell.r); check(n >= 5, 'school bell: ' + n + ' repeated strikes (tan-tan-tan)'); }
    { const n = onsets(L, M.amb_dog.r); check(n >= 2, 'dog: ' + n + ' barks'); }

    // ---------------------------------------------------------------- node counts + synthesis cost (live path = these graphs)
    const cost = await ev(async (names) => {
      const out = {};
      for (const [name, o] of names) {
        const oc = new OfflineAudioContext(1, 44100 * 10, 44100); let n = 0;
        for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) if (/^create/.test(k) && typeof oc[k] === 'function') { const f = oc[k].bind(oc); oc[k] = (...a) => { n++; return f(...a); }; }
        const t0 = performance.now();
        N.audio._internal.SFX[name](oc, oc.destination, 0.02, Object.assign({ live: true }, o));
        await oc.startRendering();
        out[name + (o.variant ? ':' + o.variant : '')] = { nodes: n, ms: Math.round(performance.now() - t0) };
      }
      return out;
    }, [['crow_caw', { n: 2 }], ['koel', { n: 7 }], ['coo', {}], ['pigeons', { n: 5 }], ['bird', { variant: 'myna' }], ['cheel', {}], ['dog_bark', { n: 2 }], ['cow_moo', {}], ['goat_bleat', {}],
      ['cooker', { n: 1 }], ['temple_bell', { n: 3 }], ['church_bell', { variant: 'peal' }], ['school_bell', { n: 10 }], ['vendor_call', { variant: 'purani' }], ['gossip', {}]]);
    log('nodes/ms per one-shot (10 s offline render): ' + Object.entries(cost).map(([k, v]) => k + '=' + v.nodes + '/' + v.ms).join('  '));
    check(['crow_caw', 'cheel', 'dog_bark', 'cow_moo', 'goat_bleat', 'coo', 'vendor_call:purani'].every((k) => cost[k] && cost[k].nodes <= 60), 'live-synthesised calls stay small (<= 60 nodes)');

    // ---------------------------------------------------------------- loops + radio
    { const r = await L.renderFn(T.page, `(oc, out, t) => N.audio.ambience.synth.insects(oc, out, 14, 2)`, 16); const m = L.save(r, 'amb_loop_insects');
      check(m.peakDb < -3 && m.peakDb > -30 && m.centroid > 2500 && m.clicks === 0, 'night insects loop: peak ' + m.peakDb + ', centroid ' + m.centroid, m); }
    { const r = await L.renderFn(T.page, `(oc, out, t) => N.audio.ambience.synth.frogs(oc, out, 12, 2)`, 14); const m = L.save(r, 'amb_loop_frogs');
      check(m.peakDb < -3 && m.peakDb > -30 && m.centroid < 2500 && m.clicks === 0, 'frogs loop: peak ' + m.peakDb + ', centroid ' + m.centroid, m); }
    { const r = await L.renderFn(T.page, `(oc, out, t) => N.audio.ambience.synth.radioClip(oc, out, t, { dur: 12, roar: true })`, 12.2); const m = L.save(r, 'amb_radio_cricket');
      const acc = avgSpec(L, r); let lo = 0, mid = 0, hi = 0; for (let k = 1; k < acc.length; k++) { const f = hz(k, r.sr); if (f < 300) lo += acc[k]; else if (f > 5000) hi += acc[k]; else mid += acc[k]; }
      const tot = lo + mid + hi;
      check(m.peakDb < -1 && m.peakDb > -18 && lo / tot < 0.05 && hi / tot < 0.08 && m.clicks === 0, 'radio cricket: band-limited speaker (<300 Hz ' + (100 * lo / tot).toFixed(1) + '%, >5 kHz ' + (100 * hi / tot).toFixed(1) + '%), peak ' + m.peakDb, m); }

    // ---------------------------------------------------------------- district beds by time of day
    const BEDS = [['oldcity', 10.5], ['market', 11], ['colonial', 18.5], ['colony', 12.5], ['posh', 9], ['rocky', 15], ['cantonment', 9.5], ['hitec', 11], ['lake', 17],
      ['colony', 6.5], ['colony', 13.5], ['colony', 23], ['oldcity', 22.5], ['lake', 22]];
    for (const [bed, hr] of BEDS) {
      const r = await L.renderFn(T.page, `(oc, out, t) => N.audio.ambience.renderBed(oc, out, '${bed}', ${hr}, 30)`, 30);
      const name = 'amb_bed_' + bed + '_' + String(hr).replace('.', 'h');
      const m = L.save(r, name, { width: 1200 });
      check(m && m.rmsDb > -52 && m.rmsDb < -18 && m.peakDb < -1 && m.clicks <= 1 && m.silentFrac < 0.3, 'bed ' + bed + ' @' + hr + 'h: rms ' + m.rmsDb + ' peak ' + m.peakDb + ' centroid ' + m.centroid + ' clicks ' + m.clicks, m);
    }

    // ---------------------------------------------------------------- live: places + schedules
    if (await ev(() => N.state.mode === 'title')) { await T.page.click('#title-start'); await T.page.waitForFunction(() => N.state.mode === 'play' || N.state.mode === 'cutscene', null, { timeout: 10000 }); await T.sleep(800); }
    await ev(() => N.debug.newGame({ skipIntro: true }));
    await T.sleep(1200);
    await ev(() => { try { if (N.missions && N.missions.active) N.missions.abort(); } catch (e) { /* ignore */ } N.audio.music.mood(null); N.audio.duck(false); });
    await T.sleep(800);
    const ids = await ev(() => {
      const A = N.audio.ambience, ix = A.places(), pr = N.audio._internal.placeRule, tag = (t) => Object.keys(N.places).filter((id) => { const r = pr(id); return r && r.tag === t; });
      const bm = N.places.birla_mandir, temples = tag('temple');
      return { school: ix.school.map((x) => x[0]), church: ix.church.map((x) => x[0]), mosque: ix.mosque.map((x) => x[0]), water: ix.water.map((x) => x[0]), temples,
        templeNearBirla: bm ? temples.filter((id) => Math.hypot(N.places[id].x - bm.x, N.places[id].y - bm.y) < 600) : [], radio: A.radioShops(), birla: pr('birla_mandir') && pr('birla_mandir').tag };
    });
    log('matched places: schools ' + ids.school.length + ' [' + ids.school.join(' ') + ']');
    log('  churches [' + ids.church.join(' ') + ']');
    log('  temples (bells) [' + ids.temples.join(' ') + ']');
    log('  mosques/dargahs (pigeons, dusk hush) [' + ids.mosque.join(' ') + ']');
    log('  water (frogs) [' + ids.water.join(' ') + ']');
    log('  radio shops ' + ids.radio.length + ' [' + ids.radio.slice(0, 12).join(' ') + ' ...]   temples within 600 u of Birla: [' + ids.templeNearBirla.join(' ') + ']');
    check(ids.school.length >= 10 && ids.church.length >= 3 && ids.temples.length >= 8 && ids.radio.length >= 5 && !ids.birla, 'place ids matched (schools, churches, temples, radio shops; Birla Mandir untagged)');

    const runAt = (place, h, m, sec, day) => ev(async ([place, h, m, sec, day]) => {
      if (day != null) N.clock.day = day;
      N.debug.teleport(place); N.debug.setTime(h, m);
      const st = N.audio.ambience.stats, before = Object.assign({}, st.played), sup = st.suppressed.temple_bell || 0, logN = st.log.length;
      const t0 = Date.now();
      while (Date.now() - t0 < sec * 1000) { await new Promise((r) => setTimeout(r, 200)); if (!N.clock.held) continue; N.clock.minutes += 0.2; } // keep game time moving even under a hold
      const d = {}; for (const k in st.played) d[k] = st.played[k] - (before[k] || 0);
      const p = N.places[place];
      return { d, sup: (st.suppressed.temple_bell || 0) - sup, log: st.log.slice(Math.max(0, logN - 80)).filter((e) => e.x != null).map((e) => [e.name, Math.round(Math.hypot(e.x - p.x, e.y - p.y))]), bed: N.audio.ambience && N.audio.ambient.bed, wd: N.audio.ambience.weekday(), layers: N.audio.ambience.layers(), min: Math.round(N.clock.minutes) };
    }, [place, h, m, sec, day]);
    const templeId = ids.temples.find((id) => /^temple_\d/.test(id)) || ids.temples[0];
    const tr = await runAt(templeId, 10, 0, 20);
    check((tr.d.temple_bell || 0) >= 1, 'at ' + templeId + ' (10:00): temple bells ring (' + (tr.d.temple_bell || 0) + ' in 20 s)', tr.d);
    const br = await runAt('birla_mandir', 10, 0, 20);
    const nearBirla = br.log.filter((e) => e[0] === 'temple_bell' && e[1] < 600);
    check(!br.d.temple_bell && !nearBirla.length, 'at birla_mandir: NO temple bell in 20 s (suppressed attempts ' + br.sup + ')', br.d);
    const sb = await runAt(ids.school[0], 8, 44.4, 3, 0);
    check(sb.wd >= 1 && sb.wd <= 6 && (sb.d.school_bell || 0) === 1 && sb.log.some((e) => e[0] === 'school_bell' && e[1] < 30), 'school bell at 08:45 on a weekday (wd ' + sb.wd + ') at ' + ids.school[0], sb);
    const sun = await runAt(ids.school[0], 8, 44.4, 3, 5);
    check(sun.wd === 0 && !sun.d.school_bell, 'no school bell on Sunday', sun.d);
    const churchId = ids.church.includes('church_st_marys') ? 'church_st_marys' : ids.church[0];
    const cb = await runAt(churchId, 8, 44.4, 3, 5);
    check(cb.wd === 0 && (cb.d.church_bell || 0) >= 1, 'Sunday 08:45 at ' + churchId + ' (' + cb.bed + '): the church peal rings', cb);
    const cw = await runAt(churchId, 8, 44.4, 3, 1);
    check(!cw.d.church_bell, 'no church peal on a weekday morning', cw.d);
    const nt = await runAt('home', 23, 0, 6, 0);
    check(nt.layers.insectsReady && nt.layers.insects > 0, 'night: the insect chorus loop plays (' + JSON.stringify(nt.layers) + ')');
    const lk = await runAt('durgam_cheruvu', 22, 30, 5, 120);
    check(lk.layers.frogs > 0, 'night by Durgam Cheruvu: frogs (' + lk.layers.frogs + ')');
    await ev(() => { N.flags = N.flags || {}; N.flags.cricket = true; });
    const rd = await runAt(ids.radio[0], 14, 0, 8, 0);
    check(rd.layers.radio === ids.radio[0] && (rd.d.radio_cricket || 0) >= 1, 'cricket on the shop radio at ' + ids.radio[0] + ' (' + rd.layers.radioClips + ' clips, emitter api ' + rd.layers.emitterApi + ')', rd.layers);
    await ev(() => { delete N.flags.cricket; });
    const dawn = await runAt('home', 6, 0, 15, 90);
    const birds = ['bird', 'koel', 'crow_caw'].reduce((s, k) => s + (dawn.d[k] || 0), 0);
    check(birds >= 3, 'dawn chorus at home 06:00 (' + JSON.stringify(dawn.d) + ')');
    const noon = await runAt('home', 13, 0, 15, 90);
    log('colony midday: ' + JSON.stringify(noon.d) + '   prerendered ' + noon.layers.prerendered + ' buffers in ' + noon.layers.prerenderMs + ' ms (' + noon.layers.cached + ' keys)');
    const st = await ev(() => N.audio.stats());
    check(st.busyStrips <= 22, 'voice pool respected (' + st.busyStrips + ' busy strips)');
    await ev(() => N.debug.setTime(16, 40));
  },
};
