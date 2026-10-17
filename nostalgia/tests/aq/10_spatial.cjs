/* spatial: listening pose, panners (HRTF / equal-power), L/R + front/back, Doppler, occlusion, emitter lifecycle.
 * Offline renders put a PannerNode + the AudioListener pose into an OfflineAudioContext (same helpers the live engine
 * uses: N.audio._internal.applyListener / mkPanner / setPos); live checks drive the real engine with a pose override. */
'use strict';
const PINK = `X.P.noiseVoice(oc, pn, t, 0.9, 'pink', 'highpass', 60, 0.5).g.gain.setValueAtTime(0.5, t)`;
// a render: listener pose P (yaw for 3D), a pink-noise source at (x, y, h), panning model
const scene = (P, src, hrtf) => `(oc, out, t, X) => {
  const I = N.audio._internal, P = ${JSON.stringify(P)};
  if (P.is3D) { P.fx = Math.cos(P.yaw); P.fy = Math.sin(P.yaw); } else { P.fx = 0; P.fy = -1; }
  I.applyListener(oc, P);
  const pn = I.mkPanner(oc, ${!!hrtf}); I.setPos(pn, ${src.x}, ${src.h || 0}, ${src.y}); pn.connect(out);
  ${PINK};
  return t + 1;
}`;
function lr(r) { // energy (dB) of L and R
  const e = r.chans.map((c) => { let s = 0; for (let i = 0; i < c.length; i++) s += c[i] * c[i]; return 10 * Math.log10(s + 1e-12); });
  return { L: +e[0].toFixed(1), R: +e[1].toFixed(1), d: +(e[1] - e[0]).toFixed(1) };
}
module.exports = {
  name: 'spatial', order: 10,
  async run(T) {
    const { L, page, check, log, ev, sleep } = T;
    const X0 = 1000, Y0 = 1000;
    // ---- top-down: north-up, east = right; gentle width
    const top = { x: X0, y: Y0, h: 170, is3D: false };
    const rE = await L.renderFn(page, scene(top, { x: X0 + 200, y: Y0 }), 1.2), rW = await L.renderFn(page, scene(top, { x: X0 - 200, y: Y0 }), 1.2);
    const rC = await L.renderFn(page, scene(top, { x: X0, y: Y0 - 200 }), 1.2), rN = await L.renderFn(page, scene(top, { x: X0 + 40, y: Y0 }), 1.2);
    L.save(rE, 'spatial_top_east'); L.save(rW, 'spatial_top_west');
    const e = lr(rE), w = lr(rW), c = lr(rC), n = lr(rN);
    log('top-down R-L (dB): east200 ' + e.d + ', west200 ' + w.d + ', north200 ' + c.d + ', east40 ' + n.d);
    check(e.d > 6 && w.d < -6, 'top-down: a source 200u east is right, west is left', { e, w });
    check(Math.abs(c.d) < 1, 'top-down: a source due north is centred', c);
    check(n.d > 1 && n.d < e.d - 3, 'top-down: gentle width (40u east is only slightly right)', n);
    // ---- 3D: the camera yaw rotates the image (HRTF)
    const cam = (yaw) => ({ x: X0, y: Y0, h: 12, is3D: true, yaw });
    const north = { x: X0, y: Y0 - 150, h: 3 };
    const fE = lr(await L.renderFn(page, scene(cam(0), north, true), 1.2));        // facing east: north is on the LEFT
    const fW = lr(await L.renderFn(page, scene(cam(Math.PI), north, true), 1.2));  // facing west: north is on the RIGHT
    log('3D HRTF: north source R-L facing east ' + fE.d + ' dB, facing west ' + fW.d + ' dB');
    check(fE.d < -4 && fW.d > 4, '3D: camera yaw flips the stereo image (north = left facing east, right facing west)', { fE, fW });
    const front = await L.renderFn(page, scene(cam(0), { x: X0 + 150, y: Y0, h: 3 }, true), 1.2);
    const back = await L.renderFn(page, scene(cam(0), { x: X0 - 150, y: Y0, h: 3 }, true), 1.2);
    const mF = L.save(front, 'spatial_3d_front_hrtf'), mB = L.save(back, 'spatial_3d_back_hrtf');
    log('3D HRTF front vs back: centroid ' + mF.centroid + ' / ' + mB.centroid + ' Hz, highFrac ' + mF.highFrac + ' / ' + mB.highFrac);
    check(mF.centroid > mB.centroid * 1.05 && mF.highFrac > mB.highFrac, 'HRTF: a source behind the camera is duller than in front (pinna shadow)', { mF: mF.centroid, mB: mB.centroid });
    check(mF.clicks === 0 && mB.clicks === 0 && mF.peakDb < -1, 'HRTF renders clean', [mF.clicks, mB.clicks, mF.peakDb]);

    // ---- live: panning-model selection, Doppler, occlusion, cleanup
    await ev(() => N.audio.unlock());
    await sleep(400);
    const sel = await ev(async () => {
      const A = N.audio, I = A._internal, X = A.ext, w = (ms) => new Promise((r) => setTimeout(r, ms));
      const p = { x: N.player.x, y: N.player.y };
      const out = {};
      A.spatial.hrtf = 'auto';
      I.setPose({ x: p.x, y: p.y, is3D: true, yaw: 0, hq: true }); await w(120);
      const a = X.emitter({ cls: 'engine' }); a.set(p.x + 60, p.y, 3);
      out.hq3d = a.pn.panningModel;
      I.setPose({ x: p.x, y: p.y, is3D: true, yaw: 0, hq: false }); await w(150);
      out.lowTier = a.pn.panningModel;
      I.setPose({ x: p.x, y: p.y, is3D: false }); await w(150);
      out.top = a.pn.panningModel;
      const b = X.emitter({ cls: 'engine' }); out.topNew = b.pn.panningModel;
      out.statsHrtf = A.stats().hrtf;
      out.before = A.stats().spatialEmitters;
      a.dispose(0.05); b.dispose(0.05); await w(100);
      out.after = A.stats().spatialEmitters;
      // one-shots: positional strips get a PannerNode (HRTF in 3D hq), UI sounds the stereo panner
      I.setPose({ x: p.x, y: p.y, is3D: true, yaw: 0, hq: true }); await w(80);
      A.sfx('auto_horn', { x: p.x + 50, y: p.y, force: true });
      out.stripHrtf = A.stats().hrtf;
      I.setPose(null);
      return out;
    });
    log('panning models: ' + JSON.stringify(sel));
    check(sel.hq3d === 'HRTF' && sel.lowTier === 'equalpower' && sel.top === 'equalpower' && sel.topNew === 'equalpower', 'HRTF in 3D on a high tier; equal-power on low tier and in top-down', sel);
    check(sel.stripHrtf >= 1, 'a nearby positional one-shot in 3D uses an HRTF strip', sel.stripHrtf);
    check(sel.after === sel.before - 2, 'emitter dispose() removes it from the core update set', sel);

    const dop = await ev(async () => {
      const A = N.audio, I = A._internal, X = A.ext, w = (ms) => new Promise((r) => setTimeout(r, ms));
      const p = { x: N.player.x, y: N.player.y };
      I.setPose({ x: p.x, y: p.y, is3D: false });
      const em = X.emitter({ cls: 'engine' });
      const res = {};
      let x = p.x + 250;
      const run = async (vx, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { x += vx * 0.03; em.set(x, p.y, 3, vx, 0); await w(30); } return em.dop; };
      res.approach = await run(-110, 700);          // a bus coming at the ear
      res.still = await run(0, 900);
      x = p.x - 20; res.recede = await run(-110, 700); // and going away (now west of the ear, still moving west)
      // a listener driving toward a parked source
      I.setPose({ x: p.x, y: p.y, is3D: false, vx: 150, vy: 0 }); em.set(p.x + 300, p.y, 3, 0, 0); await w(700); res.listenerToward = em.dop;
      em.dispose(0.05); I.setPose(null);
      return res;
    });
    log('Doppler ratios: ' + JSON.stringify(dop));
    check(dop.approach > 1.03 && dop.approach < 1.07, 'Doppler: an approaching bus (110 u/s) is ~+4.5 % sharp', dop.approach);
    check(dop.recede < 0.97 && dop.recede > 0.93, 'Doppler: a receding bus is ~-4.5 % flat', dop.recede);
    check(Math.abs(dop.still - 1) < 0.005 && dop.listenerToward > 1.03, 'Doppler: 1 when still; > 1 when the ear drives toward the source', dop);

    const occ = await ev(async () => {
      const A = N.audio, I = A._internal, X = A.ext, W = N.world, S = N.SURF, w = (ms) => new Promise((r) => setTimeout(r, ms));
      // find a free spot with a building between it and a free spot ~100-160u away
      let found = null;
      const p0 = { x: N.player.x, y: N.player.y };
      for (let k = 0; k < 4000 && !found; k++) {
        const x = p0.x + (Math.random() - 0.5) * 3000, y = p0.y + (Math.random() - 0.5) * 3000;
        if (!W.isWalkable(x, y)) continue;
        const a = Math.random() * Math.PI * 2, d = 100 + Math.random() * 60, x1 = x + Math.cos(a) * d, y1 = y + Math.sin(a) * d;
        if (!W.isWalkable(x1, y1)) continue;
        let solid = 0; for (let i = 3; i < d / 4 - 4; i++) if (W.surfaceAt(x + Math.cos(a) * i * 4, y + Math.sin(a) * i * 4) === S.SOLID) solid++;
        if (solid * 4 >= 40) found = { x, y, x1, y1, solid: solid * 4 };
      }
      if (!found) return null;
      // a clear line for comparison
      let clear = null;
      for (let k = 0; k < 400 && !clear; k++) { const a = Math.random() * Math.PI * 2, x1 = found.x + Math.cos(a) * 120, y1 = found.y + Math.sin(a) * 120; if (I.occlusion(found.x, found.y, x1, y1) === 0) clear = { x1, y1 }; }
      I.setPose({ x: found.x, y: found.y, is3D: false });
      const o1 = X.emitter({ cls: 'engine' }); o1.set(found.x1, found.y1, 3);
      const o2 = X.emitter({ cls: 'engine' }); if (clear) o2.set(clear.x1, clear.y1, 3);
      const osc = A.ctx.createOscillator(); osc.connect(o1.input); osc.connect(o2.input); osc.start();
      await w(1300);
      const res = { found, occS: +o1.occS.toFixed(2), lpOcc: Math.round(o1.lp.frequency.value), gOcc: +o1.g.gain.value.toFixed(3), occClear: +o2.occS.toFixed(2), lpClear: Math.round(o2.lp.frequency.value), gClear: +o2.g.gain.value.toFixed(3), statsOcc: A.stats().occluded };
      osc.stop(); o1.dispose(0.05); o2.dispose(0.05); I.setPose(null);
      return res;
    });
    if (!occ) log('(no occluder found near the player; occlusion check skipped)');
    else {
      log('occlusion: ' + JSON.stringify(occ));
      check(occ.occS > 0.7 && occ.lpOcc < 1500, 'occlusion: an emitter behind a building is low-passed (<1.5 kHz)', occ);
      check(occ.occClear < 0.05 && occ.lpClear > 4000, 'occlusion: a clear line of sight stays open', occ);
      check(occ.statsOcc >= 1, 'stats().occluded counts it', occ.statsOcc);
    }
  },
};
