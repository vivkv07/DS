/* NOSTALGIA trailer — in-page gameplay clips (used by gameplay.cjs; needs stage.js).
 * Real gameplay rendered by the game's own cameras (3D chase / first person / the top-down view): the player
 * (on foot or on a vehicle) follows a smoothed route along the road graph, driven kinematically so every clip is
 * repeatable. CLIP_PREP(id) -> info; CLIP_FRAME(f) -> JPEG data URL (3D canvas or the 2D game canvas).
 */
(() => {
  'use strict';
  const N = window.N, U = N.util;
  const FPS = 30;
  const P = (id) => N.places[id] || null;
  const LM = (id) => N.world.data.landmarks.find((l) => l.id === id) || null;
  const placeLike = (re) => Object.values(N.places).find((p) => re.test(p.id)) || null;

  // view: 'tps' | 'fps' | 'top'.  at: place id | [x, y].  veh: vehicle type | null (foot).  spd: u/s.  dir: preferred heading
  const CLIPS = {
    cycle_oldcity: { view: 'tps', at: 'laad_bazaar', time: [10, 30], veh: 'cycle', spd: 105, dir: 0 },
    top_charminar: { view: 'top', at: 'charminar_plaza', time: [11, 0], veh: 'cycle', spd: 115, dir: -1.6 },
    auto_tankbund: { view: 'tps', at: 'tank_bund', time: [17, 25], veh: 'auto', spd: 130, dir: -1.2, prefer: 'bund' },
    top_chase: { view: 'top', at: 'abids', time: [12, 30], veh: null, spd: 82, dir: 0, run: true, wanted: 3 },
    scooty_rain: { view: 'fps', at: 'abids', time: [21, 15], veh: 'scooty', spd: 120, dir: 1.5, rain: 0.9 },
    top_rain: { view: 'top', at: 'koti', time: [20, 30], veh: 'cycle', spd: 100, dir: -1.5, rain: 0.9 },
    pigeons: { view: 'tps', at: 'charminar_plaza', time: [8, 10], veh: null, spd: 80, dir: 2.6, run: true, scare: 8 },
    top_kites: { view: 'top', at: 'giver_himayatnagar', time: [15, 30], veh: null, spd: 45, dir: 0.5 },
    boat: { view: 'tps', at: 'buddha_statue', time: [9, 40], veh: 'boat', spd: 55, circle: 95 },
    bus: { view: 'tps', at: 'koti', time: [9, 30], veh: 'bus', spd: 110, dir: 1.5 },
    cycle_fps: { view: 'fps', at: 'mozamjahi_market', time: [11, 30], veh: 'cycle', spd: 100, dir: 0 },
    top_night: { view: 'top', at: 'secunderabad_clock_tower', time: [21, 30], veh: 'chetak', spd: 140, dir: 1.5 },
    golconda_walk: { view: 'tps', at: /golconda_fort_gate|golconda_fateh/, time: [13, 0], veh: null, spd: 45, dir: 0 },
    top_pothole: { view: 'top', at: 'giver_himayatnagar', time: [16, 0], veh: 'cycle', spd: 100, dir: 1.5, rain: 0.7 },
    ambassador_hitec: { view: 'tps', at: 'cyber_towers', time: [12, 0], veh: 'ambassador', spd: 150, dir: 1.5 },
    market_walk: { view: 'tps', at: 'laad_bazaar', time: [18, 35], veh: null, spd: 45, dir: 3.1 },
    lightning: { view: 'tps', at: 'abids', time: [21, 40], veh: null, spd: 40, dir: 0, rain: 1, storm: 1, strike: 3 },
    top_traffic: { view: 'top', at: 'abids', time: [18, 10], veh: null, spd: 40, dir: 0.8 },
    kites_sky: { view: 'cam', at: 'giver_himayatnagar', time: [16, 20], veh: null, spd: 0 },
    // festivals (N.seasons overlays; the 3D renderer draws their props from N.seasons.scene)
    fest_ganesh: { view: 'tps', at: 'tank_bund', time: [20, 40], veh: null, spd: 38, dir: -1.2, prefer: 'bund', seasons: { ganesh_immersion: true, ganesh: true } },
    fest_ramzan: { view: 'tps', at: 'charminar_plaza', time: [21, 30], veh: null, spd: 38, dir: -2.2, seasons: { ramzan: true } },
    fest_bonalu: { view: 'tps', at: 'lal_darwaza_temple', time: [10, 40], veh: null, spd: 36, dir: 0.5, seasons: { bonalu: true } },
    fest_numaish: { view: 'tps', at: 'nampally_exhibition', time: [20, 30], veh: null, spd: 42, dir: 0.3, seasons: { numaish: true } },
    fest_christmas: { view: 'top', at: 'secunderabad_clock_tower', time: [21, 0], veh: null, spd: 45, dir: 1.0, seasons: { christmas: true } },
    charminar_night_fps: { view: 'fps', at: 'pathergatti', time: [21, 0], veh: 'cycle', spd: 105, toward: 'charminar' },
  };

  /* ------------------------------------------------------------ routes */
  function buildPath(x, y, o, len) {
    const R = N.world.roads;
    let n = R.nearestNode(x, y);
    if (o.toward) {
      const L = LM(o.toward) || P(o.toward);
      const r = R.route(n, R.nearestNode(L.x, L.y), { walk: true });
      if (r && r.length > 1) return polyFromNodes(r, len);
    }
    const nodes = [n];
    let head = o.dir || 0, prev = -1, dist = 0, guard = 0;
    while (dist < len + 120 && guard++ < 400) {
      const cur = nodes[nodes.length - 1];
      let best = null, bs = 1e9;
      for (const l of cur.links.length ? cur.links : []) {
        if (l.to === prev) continue;
        const e = R.edges[l.edge], nb = R.nodes[l.to];
        if (o.veh && e.kind === 'path') continue;
        const a = Math.atan2(nb.y - cur.y, nb.x - cur.x);
        let sc = Math.abs(U.angleDiff(a, head));
        if (o.prefer && e.kind !== o.prefer) sc += 1.5;
        if (sc < bs) { bs = sc; best = nb; }
      }
      if (!best) break;
      dist += Math.hypot(best.x - cur.x, best.y - cur.y);
      head = Math.atan2(best.y - cur.y, best.x - cur.x);
      prev = cur.id; nodes.push(best);
    }
    return polyFromNodes(nodes, len);
  }
  function polyFromNodes(nodes, len) {
    const pts = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const A = nodes[i], Bn = nodes[i + 1], L = Math.hypot(Bn.x - A.x, Bn.y - A.y), steps = Math.max(1, Math.ceil(L / 4));
      for (let k = 0; k < steps; k++) { const p = N.world.roads.lanePoint(A, Bn, k / steps, 0); pts.push([p.x, p.y]); }
    }
    const last = nodes[nodes.length - 1]; pts.push([last.x, last.y]);
    // cumulative distances + a light smoothing (no kinks at nodes)
    const sm = pts.map((p, i) => { let sx = 0, sy = 0, n = 0; for (let k = -3; k <= 3; k++) { const q = pts[Math.max(0, Math.min(pts.length - 1, i + k))]; sx += q[0]; sy += q[1]; n++; } return [sx / n, sy / n]; });
    const cum = [0]; for (let i = 1; i < sm.length; i++) cum.push(cum[i - 1] + Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]));
    return { pts: sm, cum, len: cum[cum.length - 1] };
  }
  function at(path, d, out) {
    const c = path.cum; d = Math.max(0, Math.min(path.len - 0.01, d));
    let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= d) lo = m; else hi = m; }
    const t = (d - c[lo]) / Math.max(1e-6, c[hi] - c[lo]), A = path.pts[lo], B = path.pts[hi];
    out.x = A[0] + (B[0] - A[0]) * t; out.y = A[1] + (B[1] - A[1]) * t;
    return out;
  }

  let C = null;
  const tmp = { x: 0, y: 0 }, tmp2 = { x: 0, y: 0 };
  window.CLIP_PREP = function (id, nf) {
    const o = CLIPS[id]; if (!o) throw new Error('no clip ' + id);
    // reset previous clip state
    if (N.player.vehicle && N.vehicles.exit) { try { N.vehicles.exit(N.player, true); } catch (e) { /* ok */ } }
    if (N.wanted && N.wanted.set) N.wanted.set(0);
    // seasons: festival clips switch their festival on (and the default Sankranti kites off); others clear overrides
    for (const k of ['ganesh_immersion', 'ganesh', 'ramzan', 'bonalu', 'numaish', 'christmas', 'sankranti']) N.seasons.set(k, null);
    if (o.seasons) { N.seasons.set('sankranti', false); for (const k in o.seasons) N.seasons.set(k, o.seasons[k]); }
    STAGE.cam(null); STAGE.hero(null);
    N.render.camOverride = null;
    N.player.hidden = false;
    N.debug.setTime(o.time[0], o.time[1]);
    N.weather.force(o.rain ? { rain: o.rain, storm: o.storm || 0.3 } : { rain: 0, storm: 0, mist: 0 });
    N.weather.wet = o.rain ? 1 : 0;
    N.wind.force({ strength: o.rain ? 0.8 : 0.4 });
    let x, y;
    const pl = o.at instanceof RegExp ? placeLike(o.at) : (P(o.at) || LM(o.at));
    if (Array.isArray(o.at)) { x = o.at[0]; y = o.at[1]; } else { x = pl.x; y = pl.y; }
    const total = (nf + 60) / FPS * Math.max(1, o.spd);
    let path;
    if (o.circle) { // a loop round a point on the water (boats)
      const pts = []; for (let k = 0; k <= 72; k++) { const a = -0.5 + (k / 72) * Math.PI * 2; pts.push([x + Math.cos(a) * o.circle, y + Math.sin(a) * o.circle]); }
      const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      path = { pts, cum, len: cum[cum.length - 1] };
    } else if (o.spd > 0) path = buildPath(x, y, o, total);
    const start = path ? at(path, 0, { x: 0, y: 0 }) : { x, y };
    N.debug.teleport(start.x, start.y);
    let v = null;
    if (o.veh) {
      v = N.vehicles.spawn(o.veh, start.x, start.y, 0, {});
      if (v) N.vehicles.enter(N.player, v);
    }
    N.view.set(o.view === 'cam' ? 'tps' : o.view);
    C = { id, o, path, v, d: 0, f: 0, x, y };
    if (o.wanted) N.wanted.set(o.wanted);
    // warm-up: drive the route for 2 s (camera settles, traffic + birds populate, chunks stream)
    for (let k = 0; k < 3; k++) N.view3d && N.view3d.active && N.view3d.settle(30000);
    for (let k = 0; k < 60; k++) advance(true);
    if (N.view3d && N.view3d.active) N.view3d.settle(30000);
    C.f = 0;
    return { at: [Math.round(start.x), Math.round(start.y)], len: path ? Math.round(path.len) : 0, veh: v ? v.type : null, view: N.view.mode };
  };

  function advance(warm) {
    const { o, path, v } = C;
    if (o.view === 'cam') {
      const t = C.f / FPS, a = 0.6 + t * 0.25;
      STAGE.cam({ x: C.x, y: C.y, h: 8, tx: C.x + Math.cos(a) * 60, ty: C.y + Math.sin(a) * 60, th: 70 + t * 6, fov: 60 });
    } else if (path) {
      C.d += o.spd / FPS;
      at(path, C.d, tmp); at(path, C.d + 10, tmp2);
      const ang = Math.atan2(tmp2.y - tmp.y, tmp2.x - tmp.x);
      const vx = Math.cos(ang) * o.spd, vy = Math.sin(ang) * o.spd;
      if (v) {
        // pose the vehicle a step behind: the physics step moves it forward this frame
        v.x = tmp.x - vx / FPS; v.y = tmp.y - vy / FPS; v.angle = ang; v.speed = o.spd; v.vx = vx; v.vy = vy;
        if (v.ctl) { v.ctl.throttle = 1; v.ctl.steer = 0; v.ctl.brake = 0; }
        v.lightsOn = N.render.night > 0.3;
      } else {
        const p = N.player;
        p.x = tmp.x - vx / FPS; p.y = tmp.y - vy / FPS; p.vx = vx; p.vy = vy; p.angle = ang; p.facing = ang; p.running = !!o.run;
        if (N.input && N.input.setMove) { /* the walk animation reads the velocity */ }
      }
    }
    if (!warm && o.scare && C.f === o.scare && N.birds) N.birds.scare(N.player.x, N.player.y, 120);
    if (!warm && o.strike && C.f === o.strike) N.weather.strike(N.player.x + 180, N.player.y - 260, 1);
    if (o.view === 'tps' && C.f === 0 && N.view3d.snapCamera) N.view3d.snapCamera();
    C.f++;
    window.__step(1 / FPS);
  }

  window.CLIP_FRAME = function (capture) {
    advance(false);
    if (!capture) return null;
    if (N.view3d && N.view3d.active) return N.view3d.H.renderer.domElement.toDataURL('image/jpeg', 0.93);
    return document.getElementById('game').toDataURL('image/png');
  };
  window.CLIPS = CLIPS;
})();
