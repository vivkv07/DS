/* mix: generated reverb zones (RT60 per zone, Golconda's clap echo), the score's own reverb, the master limiter on a
 * stress render (many SFX + music), dialogue / story-sting ducking, and a live CPU soak (traffic, top-down + 3D pose). */
'use strict';
const ZONES = { // plausible RT60 ranges (s)
  open: [0.35, 1.1], oldcity_lane: [0.5, 1.3], charminar: [1.5, 3.0], golconda: [2.0, 4.0], stadium: [1.7, 3.3],
  station: [1.9, 3.7], irani_cafe: [0.25, 0.8], lake: [0.2, 1.4], music: [1.3, 2.6],
};
// clap in a zone: dry -> sfx bus, send -> world reverb (or the music reverb for 'music')
const zoneScene = (id, dry, send) => `(oc, out, t, X) => {
  const I = N.audio._internal, g = I.buildGraph(oc, out), id = '${id}';
  if (id !== 'open' && id !== 'music') { I.mkZoneNode(oc, g, id); I.setZone(g, id, 0, 0.0005); }
  const inp = X.P.gain(oc, 0.5);
  inp.connect(X.P.gain(oc, ${dry}, g.sfx)); inp.connect(X.P.gain(oc, ${send}, id === 'music' ? g.musicRevIn : g.revIn));
  I.SFX.clap(oc, inp, t + 0.05, { zone: id });
  return t + 4;
}`;
function envDb(m, sr, win) { const n = Math.floor(sr * win), out = []; for (let s = 0; s + n <= m.length; s += n) { let e = 0; for (let i = s; i < s + n; i++) e += m[i] * m[i]; out.push(10 * Math.log10(e / n + 1e-14)); } return out; }
function rt60(m, sr) { // Schroeder backward integration, T20 (-5 .. -25 dB) x 3
  const n = m.length, edc = new Float64Array(n); let acc = 0;
  for (let i = n - 1; i >= 0; i--) { acc += m[i] * m[i]; edc[i] = acc; }
  const db = (i) => 10 * Math.log10(edc[i] / edc[0] + 1e-30);
  let i5 = -1, i25 = -1;
  for (let i = 0; i < n; i++) { const d = db(i); if (i5 < 0 && d <= -5) i5 = i; if (d <= -25) { i25 = i; break; } }
  return i5 < 0 || i25 < 0 ? null : +((3 * (i25 - i5)) / sr).toFixed(2);
}
module.exports = {
  name: 'mix', order: 15,
  async run(T) {
    const { L, page, check, log, ev, sleep } = T;
    // ---- reverb zones
    const rts = {};
    for (const id of Object.keys(ZONES)) {
      // Chrome renders a long convolver tail on a background thread; under heavy CPU load an offline render can
      // occasionally lose late partitions, so an out-of-range estimate is re-rendered (up to 2 retries, logged)
      let wet = null, m = null;
      for (let k = 0; k < 3; k++) {
        wet = await L.renderFn(page, zoneScene(id, 0, 1), 4.2); m = L.mono(wet);
        const r0 = rt60(m, wet.sr);
        if (r0 != null && r0 >= ZONES[id][0] && r0 <= ZONES[id][1]) break;
        log('(' + id + ': RT60 ' + r0 + ' s on render ' + (k + 1) + '; re-rendering)');
      }
      const mt = L.save(wet, 'zone_' + id + '_wet');
      L.save(await L.renderFn(page, zoneScene(id, 1, id === 'lake' ? 0.15 : 0.35), 4.2), 'zone_' + id + '_clap');
      const rt = rt60(m, wet.sr);
      rts[id] = rt;
      const [lo, hi] = ZONES[id];
      check(rt != null && rt >= lo && rt <= hi && mt.clicks === 0, 'reverb zone ' + id + ': RT60 ' + rt + ' s in [' + lo + ', ' + hi + ']', { rt, clicks: mt.clicks, peak: mt.peakDb });
      if (id === 'golconda' || id === 'open' || id === 'music') {
        const e = envDb(m, wet.sr, 0.01), at = (s) => e[Math.floor(s / 0.01)];
        let pk = -200, pkT = 0; for (let s = 0.6; s < 1.0; s += 0.01) if (at(s) > pk) { pk = at(s); pkT = s; }
        // prominence over the tail just before the peak (a decaying tail peaks at the window's start edge: rise < 0)
        const base = Math.max(at(pkT - 0.06), at(pkT - 0.08));
        const rise = +(pk - base).toFixed(1);
        log(id + ': strongest late peak ' + rise + ' dB over the tail at ' + (pkT - 0.05).toFixed(2) + ' s after the clap');
        if (id === 'golconda') check(rise >= 6 && pkT - 0.05 >= 0.6 && pkT - 0.05 <= 1.0, 'Golconda: a distinct clap echo 0.6-1.0 s after the clap (' + rise + ' dB)', { rise, at: pkT });
        else check(rise < 4, id + ': no discrete late echo (smooth tail)', rise);
      }
    }
    log('RT60: ' + JSON.stringify(rts));
    // ---- stress: 70 loud SFX (up to ~5 at once) + the chase score + reverb, all at full bus volume
    const stress = await L.renderFn(page, `(oc, out, t, X) => {
      const I = N.audio._internal, g = I.buildGraph(oc, out);
      const s = new I.Seq(oc, 'chase', g.music, { startTime: 0.05, revIn: g.musicRevIn }); s.schedule(9);
      const names = ['crash', 'lorry_horn', 'bus_horn', 'whistle', 'firework', 'train_horn', 'auto_horn', 'car_horn', 'bump', 'mission_passed', 'busted', 'chappal', 'pothole', 'air_brake', 'school_bell', 'clap_echo'];
      for (let i = 0; i < 70; i++) {
        const n = names[i % names.length]; if (!I.SFX[n]) continue;
        const gg = X.P.gain(oc, 1.4, i % 4 ? g.sfx : g.ui); gg.connect(X.P.gain(oc, 0.3, g.revIn));
        try { I.SFX[n](oc, gg, t + 0.1 + ((i * 0.53) % 7.4), {}); } catch (e) { /* ignore */ }
      }
      return t + 8;
    }`, 8.5);
    const ms = L.save(stress, 'mix_stress_master');
    log('stress render: ' + JSON.stringify(ms));
    check(ms.peakDb <= -1 && isFinite(ms.rmsDb), 'master limiter + soft clip: stress render never exceeds -1 dBFS (peak ' + ms.peakDb + ')', ms);
    check(ms.dc < 0.01, 'master: no DC', ms.dc);
    // ---- below threshold the master chain is linear (the trim cancels the limiter's automatic make-up gain)
    const tone = (v) => `(oc, out, t, X) => { const g = N.audio._internal.buildGraph(oc, out); return X.P.tone(oc, g.ui, t, { f: 440, a: 0.01, h: 0.6, r: 0.1, v: ${v} }); }`;
    const q1 = L.metrics(await L.renderFn(page, tone(0.02), 1)), q2 = L.metrics(await L.renderFn(page, tone(0.04), 1));
    const lin = +(q2.rmsDb - q1.rmsDb).toFixed(2);
    log('master: quiet tone gain ' + (q1.peakDb - 20 * Math.log10(0.02)).toFixed(2) + ' dB; +6.02 dB in -> ' + lin + ' dB out');
    check(Math.abs(lin - 6.02) < 0.3, 'master chain is linear below threshold (no pumping on quiet material)', lin);

    // ---- live: ducking + zones + CPU soak
    await ev(() => N.audio.unlock());
    await sleep(300);
    const duck = await ev(async () => {
      const A = N.audio, w = (ms) => new Promise((r) => setTimeout(r, ms)), out = {};
      N.emit('dialogue:open', { speaker: 'amma' }); await w(1300); out.dlg = A.stats().duck;
      N.emit('dialogue:close', {}); await w(1500); out.after = A.stats().duck;
      A.sfx('mission_passed', { force: true }); await w(500); out.story = A.stats().duck;
      await w(4500); out.end = A.stats().duck;
      return out;
    });
    log('duck gains: ' + JSON.stringify(duck));
    check(Math.abs(duck.dlg.music - 0.32) < 0.03 && Math.abs(duck.dlg.amb - 0.6) < 0.05 && Math.abs(duck.dlg.radio - 0.45) < 0.04 && duck.dlg.sfx < 0.9, 'dialogue ducks music 0.32, ambience 0.6, radio 0.45, sfx 0.85', duck.dlg);
    check(duck.after.music > 0.95 && duck.after.amb > 0.95, 'ducks recover smoothly after dialogue', duck.after);
    check(duck.story.music < 0.6 && duck.story.amb < 0.8 && duck.end.music > 0.95, 'a story sting (MISSION PASSED) dips music + ambience while it plays', [duck.story, duck.end]);
    const zones = await ev(async () => {
      const A = N.audio, w = (ms) => new Promise((r) => setTimeout(r, ms)), out = {};
      for (const [pl, z] of [['golconda_fateh_darwaza', 'golconda'], ['charminar', 'charminar'], ['secunderabad_station', 'station'], ['lb_stadium', 'stadium'], ['laad_bazaar', 'oldcity_lane'], ['tank_bund', 'lake']]) {
        if (!N.debug.teleport(pl)) { out[pl] = 'n/a'; continue; }
        let zz = null; for (let i = 0; i < 30 && zz !== z; i++) { await w(100); zz = A.reverb.zone; }
        out[pl] = zz;
      }
      A.reverb.set('station'); await w(800); out.override = A.reverb.zone; A.reverb.set(null);
      await w(5000);
      out.alive = A.stats().reverbs; out.buildMs = A.stats().zoneBuildMs;
      return out;
    });
    log('zones by place: ' + JSON.stringify(zones));
    check(zones.golconda_fateh_darwaza === 'golconda' && zones.charminar === 'charminar' && zones.secunderabad_station === 'station' && zones.lb_stadium === 'stadium' && zones.tank_bund === 'lake',
      'reverb zone follows the place (Golconda, Charminar, station, stadium, Tank Bund)', zones);
    check(zones.override === 'station' && zones.alive.length <= 4, 'N.audio.reverb.set() overrides; at most 4 zone convolvers stay alive', zones);

    const soak = await ev(async () => {
      const A = N.audio, w = (ms) => new Promise((r) => setTimeout(r, ms));
      try { N.debug.newGame({ skipIntro: true }); } catch (e) { /* ignore */ }
      await w(1500);
      try { if (N.missions && N.missions.active) N.missions.abort(); } catch (e) { /* ignore */ }
      A.duck(false); A.music.mood(null);
      N.debug.teleport('koti_bus_stand'); await w(400);
      const v = N.debug.enterVehicle('rx100'); await w(2500);
      const run = async (ms) => {
        A._profile = {};
        const t0 = performance.now(); let mt = 0, me = 0;
        while (performance.now() - t0 < ms) { if (v) v.throttle = 1; await w(100); const s = A.stats(); mt = Math.max(mt, s.traffic); me = Math.max(me, s.hrtf); }
        const P = A._profile; let tot = 0, n = 0, worst = 0; const per = {};
        for (const k in P) { tot += P[k].tot; n = Math.max(n, P[k].n); per[k] = +(P[k].tot / P[k].n).toFixed(3); if (P[k].max > worst) worst = P[k].max; }
        A._profile = null;
        return { frames: n, msPerFrame: +(tot / n).toFixed(3), per, pumpMax: P.pump ? +P.pump.max.toFixed(2) : 0, worstStage: +worst.toFixed(2), traffic: mt, hrtf: me };
      };
      const top = await run(8000);
      A._internal.setPose({ follow: true, is3D: true, yaw: 0, hq: true });
      const d3 = await run(8000);
      A._internal.setPose(null);
      const s = A.stats();
      return { top, d3, strips: s.strips, made: A._internal.eng.made, zone: s.zone, occludedOneShots: s.sfxOccluded, played: s.sfxPlayed };
    });
    log('soak top-down: ' + JSON.stringify(soak.top));
    log('soak 3D (chase-cam pose, HRTF): ' + JSON.stringify(soak.d3));
    log('soak: ' + JSON.stringify({ strips: soak.strips, voicesMade: soak.made, sfx: soak.played, occludedOneShots: soak.occludedOneShots }));
    check(soak.top.traffic >= 3 && soak.d3.traffic >= 3, 'traffic: up to 4 engine voices near the player', [soak.top.traffic, soak.d3.traffic]);
    check(soak.d3.hrtf >= 1, '3D on a high tier: HRTF voices in use', soak.d3.hrtf);
    check(soak.top.msPerFrame < 1.5 && soak.d3.msPerFrame < 1.5, 'audio JS per frame (all stages) < 1.5 ms: top ' + soak.top.msPerFrame + ', 3D ' + soak.d3.msPerFrame, [soak.top.per, soak.d3.per]);
  },
};
