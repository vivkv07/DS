/* NOSTALGIA trailer — in-page staging for the 3D drone shots (used by shots3d.cjs; needs stage.js).
 * STAGE_PREP(seg, sh) stages a segment (time, weather, hero, warm-up) -> info
 * STAGE_FRAME(f, nf, capture) poses camera + hero for frame f, steps 1/30 s, returns a JPEG data URL
 */
(() => {
  'use strict';
  const N = window.N, U = N.util;
  const FPS = 30, B = 0.4;
  const ease = { lin: (t) => t, io: (t) => t * t * (3 - 2 * t), out: (t) => 1 - Math.pow(1 - t, 3), in: (t) => t * t * t, ioq: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) };
  let CUR = null, CUR_CLEAR = null;

  function lmById(id) { return N.world.data.landmarks.find((l) => l.id === id) || null; }
  function settle() { for (let k = 0; k < 3; k++) { N.view3d.settle(30000); window.__step(1 / FPS); } }
  function streamAt(x, y) { N.render.camOverride = { x, y, zoom: 1, snap: true }; N.render.cam.x = x; N.render.cam.y = y; }

  function tallestRoof(lm, ring) {
    let best = null;
    const r1 = ring[1], R = N.respect;
    N.world.queryStructures(lm.x - r1, lm.y - r1, lm.x + r1, lm.y + r1, (s) => {
      if (s.t !== 'bldg' || s.roofType === 'hip' || s.roofType === 'gable' || s.roofType === 'frame') return;
      const cx = s.x + s.w / 2, cy = s.y + s.d / 2, d = Math.hypot(cx - lm.x, cy - lm.y);
      if (d < ring[0] || d > r1 || s.w < 9 || s.d < 9) return;
      if (R && R.at && R.at(cx, cy)) return;
      const score = s.h - d * 0.04;
      if (!best || score > best.score) best = { x: cx, y: cy, h: s.h, score, d };
    });
    return best;
  }

  window.STAGE_PREP = function (seg, sh) {
    const [hh, mm] = seg.time || [12, 0];
    N.debug.setTime(hh, mm);
    if (seg.shot === 'rain') { N.weather.force({ rain: 0.95, storm: 0.55 }); N.weather.wet = 1; }
    else { N.weather.force({ rain: 0, storm: 0, mist: 0 }); N.weather.wet = 0; }
    N.wind.force(seg.shot === 'rain' ? { strength: 0.85 } : { strength: 0.4 });
    let lm = lmById(sh.lm), hero = null, base = sh.base != null ? sh.base : 0, lookLm = null;
    if (sh.lm === 'tank_bund') { const p = N.places.tank_bund || N.places.giver_hussain_sagar; lm = { x: p.x, y: p.y, w: 10, d: 10, h: 10, id: 'tank_bund' }; }
    if (!lm) throw new Error('no landmark ' + sh.lm);
    if (sh.hero === 'top') {
      streamAt(lm.x, lm.y); settle();
      hero = { x: lm.x, y: lm.y, h: STAGE.summit(lm.x, lm.y, 0) };
    } else if (sh.hero === 'roof') {
      const r = tallestRoof(lm, sh.ring || [70, 240]);
      if (!r) throw new Error('no roof near ' + lm.id);
      streamAt(r.x, r.y); settle();
      hero = { x: r.x, y: r.y, h: STAGE.summit(r.x, r.y, 0) };
      base = Math.atan2(r.y - lm.y, r.x - lm.x); lookLm = lm;
    } else if (sh.hero === 'shore' || sh.hero === 'bund') {
      const q = N.world.nearestRoadPoint(lm.x, lm.y, (rd) => rd.kind === 'bund') || N.world.nearestRoadPoint(lm.x, lm.y);
      // stand on the parapet on the lake side of the bund
      const nx = -Math.sin(q.angle), ny = Math.cos(q.angle);
      let side = 1; if (!N.world.isWater(q.x + nx * 40, q.y + ny * 40)) side = -1;
      const hw = ((q.road && q.road.w) || 40) / 2;
      // slide along the bund so no lamp post lines up between the camera and the statue
      const ux = Math.cos(q.angle), uy = Math.sin(q.angle), slide = sh.slide || 0;
      const hx = q.x + nx * side * (hw + 3) + ux * slide, hy = q.y + ny * side * (hw + 3) + uy * slide;
      streamAt(hx, hy); settle();
      hero = { x: hx, y: hy, h: Math.max(0, STAGE.summit(hx, hy, 0)) };
      if (sh.hero === 'shore') { base = Math.atan2(hy - lm.y, hx - lm.x); lookLm = lm; }
      else { base = Math.atan2(-ny * side, -nx * side) + 0.5; lookLm = { x: hx + nx * side * 200, y: hy + ny * side * 200 }; }
    }
    // the hidden player stands below, so birds / traffic / rain live around the shot
    N.debug.teleport(hero.x + 30, hero.y + 30);
    // no parked / passing vehicles blocking the drone (traffic further away stays)
    const clearV = () => N.entities.clear((e) => e.kind === 'vehicle' && Math.hypot(e.x - hero.x, e.y - hero.y) < 90);
    clearV(); CUR_CLEAR = clearV;
    streamAt(hero.x, hero.y);
    const face = sh.face != null ? sh.face : base + 0.55;
    CUR = { seg, sh, lm, hero, base, lookLm, face, strikes: (seg.lightning || []).map((b) => Math.round((b - seg.b) * B * FPS)) };
    STAGE.hero({ x: hero.x, y: hero.y, h: hero.h, angle: face, clip: sh.clip || 'idle' });
    pose(0, seg.n * B * FPS);
    settle();
    for (let k = 0; k < (window.WARM || 45); k++) { pose(0, seg.n * B * FPS); window.__step(1 / FPS); }
    settle();
    return { lm: lm.id, hero: { x: Math.round(hero.x), y: Math.round(hero.y), h: +hero.h.toFixed(1) }, base: +base.toFixed(2) };
  };

  function pose(f, nf) {
    const { seg, sh, hero, base, lookLm } = CUR;
    const u = f / Math.max(1, nf - 1), hy = hero.h;
    let lx = hero.x, ly = hero.y;
    if (lookLm) { lx += (lookLm.x - hero.x) * 0.12; ly += (lookLm.y - hero.y) * 0.12; }
    if (seg.shot === 'reveal') {
      // from the plaza, low and looking up at the minarets, crane up to Chinnu on the roof
      const e = ease.ioq(u), a = 0.59 + 0.35 * e;
      const r = 125 - 92 * e, h = 3 + (hy + 7 - 3) * e, th = 55 + (hy + 4 - 55) * e;
      STAGE.cam({ x: hero.x + Math.cos(a) * r, y: hero.y + Math.sin(a) * r, h, tx: hero.x, ty: hero.y, th, fov: 50 - 8 * e });
    } else if (seg.shot === 'whip') {
      const e = ease.in(u), a = 0.94 + e * 5.2;
      STAGE.cam({ x: hero.x + Math.cos(a) * 24, y: hero.y + Math.sin(a) * 24, h: hy + 8, tx: hero.x, ty: hero.y, th: hy + 4, fov: 50 + 10 * e });
    } else if (seg.shot === 'rain') {
      const e = ease.io(u), a = 1.0 + 0.5 * e;
      const r = 70 - 54 * e, h = hy + 28 - 21 * e;
      STAGE.cam({ x: hero.x + Math.cos(a) * r, y: hero.y + Math.sin(a) * r, h, tx: hero.x, ty: hero.y, th: hy + 4, fov: 46 });
    } else {
      const dir = seg.dir || 1, e = ease.io(u);
      const a = base + dir * (e - 0.5) * (sh.arc || 1.4);
      const r = sh.r[0] + (sh.r[1] - sh.r[0]) * e, h = hy + sh.h[0] + (sh.h[1] - sh.h[0]) * e;
      const fov = sh.fov[0] + (sh.fov[1] - sh.fov[0]) * e;
      STAGE.cam({ x: hero.x + Math.cos(a) * r, y: hero.y + Math.sin(a) * r, h, tx: lx, ty: ly, th: hy + 4.5, fov });
    }
  }

  window.STAGE_FRAME = function (f, nf, capture) {
    pose(f, nf);
    if (CUR_CLEAR && f % 15 === 0) CUR_CLEAR();
    if (CUR.strikes.includes(f)) { const h = CUR.hero; N.weather.strike(h.x + 260, h.y - 380, 1); }
    window.__step(1 / FPS);
    if (!capture) return null;
    return N.view3d.H.renderer.domElement.toDataURL('image/jpeg', 0.93);
  };
})();
