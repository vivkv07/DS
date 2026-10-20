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
    fest_ganesh: { view: 'cam', at: 'tank_bund', time: [16, 40], veh: null, spd: 0, procession: true, seasons: { ganesh_immersion: true, ganesh: true } },
    fest_ramzan: { view: 'tps', at: 'charminar_plaza', time: [21, 30], veh: null, spd: 30, pitch: -0.02, dir: -2.2, seasons: { ramzan: true } },
    fest_bonalu: { view: 'tps', at: 'lal_darwaza_temple', time: [10, 40], veh: null, spd: 30, pitch: 0.02, dir: 0.5, seasons: { bonalu: true } },
    fest_numaish: { view: 'tps', at: 'nampally_exhibition', time: [20, 30], veh: null, spd: 34, pitch: -0.04, dir: 0.3, seasons: { numaish: true } },
    fest_christmas: { view: 'top', at: 'secunderabad_clock_tower', time: [21, 0], veh: null, spd: 45, dir: 1.0, seasons: { christmas: true } },
    // in-world playground games (N.playgroundGames): a real match with Chinnu and the AI kids, scripted inside the window
    lingocha: { view: 'tps', at: 'playground_home', time: [14, 45], veh: null, spd: 0, pg: { game: 'lingocha', place: 'playground_home', seed: 3, cam: { side: -28, h1: 14, crane: 45 }, params: { seekFirst: true, team: 4, difficulty: 0.5 } } },
    marampitti: { view: 'tps', at: 'playground_2', time: [16, 50], veh: null, spd: 0, pg: { game: 'marampitti', place: 'playground_2', seed: 2, params: { kids: 8, difficulty: 0.5 } } },
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
  window.CLIP_PREP = async function (id, nf) {
    const o = CLIPS[id]; if (!o) throw new Error('no clip ' + id);
    // reset previous clip state
    pgReset();
    if (N.player.vehicle && N.vehicles.exit) { try { N.vehicles.exit(N.player, true); } catch (e) { /* ok */ } }
    if (N.wanted && N.wanted.set) N.wanted.set(0);
    // seasons: festival clips switch their festival on (and the default Sankranti kites off); others clear overrides
    for (const k of ['ganesh_immersion', 'ganesh', 'ramzan', 'bonalu', 'numaish', 'christmas', 'sankranti']) N.seasons.set(k, null);
    if (o.seasons) { N.seasons.set('sankranti', false); for (const k in o.seasons) N.seasons.set(k, o.seasons[k]); }
    STAGE.cam(null); STAGE.hero(null);
    N.render.camOverride = null;
    N.player.hidden = false;
    STAGE.crowd(null); STAGE.gulal(null);
    N.debug.setTime(o.time[0], o.time[1]);
    N.weather.force(o.rain ? { rain: o.rain, storm: o.storm || 0.3 } : { rain: 0, storm: 0, mist: 0 });
    N.weather.wet = o.rain ? 1 : 0;
    N.wind.force({ strength: o.rain ? 0.8 : 0.4 });
    let x, y;
    if (o.pg) { C = { id, o, path: null, v: null, d: 0, f: 0, x: 0, y: 0 }; return pgPrep(o, nf); }
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
    STAGE.crowd(null); STAGE.gulal(null);
    if (o.procession) { await Promise.all(MODELS.concat(['kid_chinnu']).map((m) => N.models3d.parse(m).catch(() => null))); C.loaded = MODELS.filter((m) => N.models3d.loaded(m)); setupProcession(x, y); }
    if (o.wanted) N.wanted.set(o.wanted);
    // warm-up: drive the route for 2 s (camera settles, traffic + birds populate, chunks stream)
    for (let k = 0; k < 3; k++) N.view3d && N.view3d.active && N.view3d.settle(30000);
    // (the warm-up's frames are not looked at: skip their GL draws, render only the last few)
    const nw = window.WARM || 60;
    noDraw(true); try { for (let k = 0; k < nw - 8; k++) advance(true); } finally { noDraw(false); }
    for (let k = 0; k < 8; k++) advance(true);
    if (N.view3d && N.view3d.active) N.view3d.settle(30000);
    C.f = 0;
    return { loaded: C.loaded, at: [Math.round(start.x), Math.round(start.y)], len: path ? Math.round(path.len) : 0, veh: v ? v.type : null, view: N.view.mode };
  };


  /* ------------------------------------------------------------ in-world playground games (lingocha / maram pitti) */
  // GL draws off (simulation-only steps: pre-rolls and warm-ups nobody sees)
  let drawFn = null;
  function noDraw(on) {
    const r = N.view3d && N.view3d.H && N.view3d.H.renderer;
    if (!r) return;
    if (on && !drawFn) { drawFn = r.render; r.render = function () {}; }
    else if (!on && drawFn) { r.render = drawFn; drawFn = null; }
  }
  function fast(n, until) {
    noDraw(true);
    try { for (let k = 0; k < n; k++) { window.__step(1 / FPS); if (until && until()) return k + 1; } } finally { noDraw(false); }
    return n;
  }
  function pgReset() {
    const PG = N.playgroundGames;
    if (!PG) return;
    if (PG.isOpen()) PG.abort('trailer');
    const A = PG.debug.assist; A.aim = false; A.power = null; A.weakAI = false; A.noTimer = false; A.noDodge = false; A.freezeAI = false;
    if (N.input.setMove) N.input.setMove(null);
  }
  const hyp = Math.hypot, lerp = (a, b, t) => a + (b - a) * t, sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  async function pgPrep(o, nf) {
    const G = o.pg, PG = N.playgroundGames, D = PG.debug;
    PG.ambient.off = true;
    const F = PG.fieldFor(G.place);
    const ux = F.line.dx, uy = F.line.dy;
    if (G.game === 'lingocha') N.debug.teleport(F.line.x - ux * 6, F.line.y - uy * 6);
    else N.debug.teleport(F.centre.x + 6, F.centre.y + 18);
    N.view.set('tps');
    for (let k = 0; k < 3; k++) N.view3d.settle(30000);
    fast(20);
    PG.play(G.game, Object.assign({ place: G.place, seed: G.seed, noQuit: true }, G.params));
    const S = D.session();
    C.pg = { G, F, S, D, ux, uy, vx: -uy, vy: ux, cam: null, tap: -99, ev: [] };
    let pre = 0;
    if (G.game === 'lingocha') {
      // the keeper waits off to the side (his spot behind the stack is where the camera stands)
      const kp = S.parts.find((q) => q.role === 'keeper');
      if (kp) kp.spot = { x: S.L.base.x + ux * 7 - uy * -11, y: S.L.base.y + uy * 7 + ux * -11 };
      pre += fast(400, () => S.phase === 'aim');
      pre += fast(G.settle || 14);
    } else {
      pre += fast(400, () => S.phase === 'play');
      pre += fast(G.settle || 20);
      maramSetup();
    }
    N.view3d.settle(30000);
    for (let k = 0; k < 6; k++) advance(true);
    C.f = 0;
    return { pg: G.game, place: G.place, phase: S.phase, pre, at: [Math.round(N.player.x), Math.round(N.player.y)] };
  }
  const press = (a, sec) => { if (C.f - C.pg.tap < 5) return; C.pg.tap = C.f; N.input.press(a, sec); };
  // Chinnu as a seeker: run to the nearest loose stone, pick it up, carry it to the base, stack it
  function seekerBot() {
    const { S } = C.pg, L = S.L, me = S.me, p = N.player;
    if (me.out || me.act || S.auto) return;
    if (me.carry) {
      const d = hyp(L.base.x - p.x, L.base.y - p.y);
      if (d < 7) press('action');
      else S.auto = { x: L.base.x + (p.x - L.base.x) / d * 4, y: L.base.y + (p.y - L.base.y) / d * 4, t: 0 };
      return;
    }
    let st = null, sd = 1e9;
    for (const s of L.stones) { if (s.state === 'stack' || s.state === 'carried' || (s.claim && s.claim !== me)) continue; const d = hyp(s.x - p.x, s.y - p.y) + (s.state === 'fly' ? 6 : 0); if (d < sd) { sd = d; st = s; } }
    if (!st) return;
    if (st.state === 'loose' && sd < 5.5) press('action');
    else S.auto = { x: st.x, y: st.y, t: 0 };
  }
  function maramSetup() {
    const { S, D } = C.pg, me = S.me, p = N.player, c = C.pg.F.centre;
    const kids = S.parts.filter((q) => !q.isPlayer && !q.out);
    // the thrower: the kid nearest the spot 26 u across the ground from Chinnu (towards the centre)
    let a = Math.atan2(c.y - p.y, c.x - p.x);
    const kx = p.x + Math.cos(a) * 26, ky = p.y + Math.sin(a) * 26;
    kids.sort((A, B) => hyp(A.e.x - kx, A.e.y - ky) - hyp(B.e.x - kx, B.e.y - ky));
    const K = kids[0];
    K.e.x = kx; K.e.y = ky; K.e.vx = K.e.vy = 0;
    D.give(K.name);
    C.pg.K = K;
  }
  function maramFrame() {
    const P = C.pg, { S, G } = P, me = S.me, K = P.K, f = C.f;
    if (f === (G.wind || 0) && K && K.hold && !K.out) {
      K.windT = K.windT0 = G.windT || 0.9; K.tgt = me; K.aimLock = null; S.tele = { from: K, to: me };
    }
    if (G.dodge != null && f === G.dodge) press('run', 0.1);
  }
  function lingoFrame() {
    const P = C.pg, { S, G } = P, L = S.L, f = C.f;
    if (f === (G.press == null ? 4 : G.press)) { P.D.assist.aim = true; P.D.assist.power = G.power || 0.78; N.input.press('action', G.hold || 0.42); }
    if (L.knocked && P.knockF == null) P.knockF = f;
    if (L.knocked && (S.phase === 'scatter' || S.phase === 'live')) seekerBot();
  }
  function pgFrame(warm) {
    const P = C.pg; if (!P || !P.S) return;
    const { S } = P, p = N.player, f = C.f;
    if (!warm) { if (P.G.game === 'lingocha') lingoFrame(); else maramFrame(); }
    // camera: low, behind Chinnu's shoulder, the action ahead of him centred
    let want;
    if (P.G.game === 'lingocha') {
      // reverse angle: low beside the stack, Chinnu at the chalk line beyond it; the ball comes at us, the stack
      // bursts in the foreground, then the camera cranes up and back over the ground as the kids pile in
      const L = S.L, B = L.base, ux = P.ux, uy = P.uy, vx = P.vx, vy = P.vy, cg = P.G.cam || {};
      const k = P.knockF == null ? 0 : sm((f - P.knockF - (cg.wait || 5)) / (cg.crane || 60));
      const lx = L.line.x, ly = L.line.y;
      // before: low behind the stack looking back at Chinnu on the line (the ball comes at us)
      const pre = P.knockF == null ? Math.min(1, (warm ? 0 : f) / 40) : 1;
      const A0 = { x: B.x + ux * (13.5 - 1.5 * pre) + vx * 2.5, y: B.y + uy * (13.5 - 1.5 * pre) + vy * 2.5, h: 8, tx: lerp(B.x, lx, 0.85), ty: lerp(B.y, ly, 0.85), th: 2 };
      // after: the stones fly our way, so swing round to the side of the ground: the base, the scattered stones,
      // Chinnu and the hitters all across the frame (tracking the middle of the action)
      const mx = lerp(B.x + ux * 8, p.x, 0.4), my = lerp(B.y + uy * 8, p.y, 0.4);
      P.mx = P.mx == null ? mx : P.mx + (mx - P.mx) * 0.06; P.my = P.my == null ? my : P.my + (my - P.my) * 0.06;
      const sd = cg.side || 30;
      const A1 = { x: P.mx + vx * sd - ux * 4, y: P.my + vy * sd - uy * 4, h: cg.h1 || 10, tx: P.mx, ty: P.my, th: 1.5 };
      want = { x: lerp(A0.x, A1.x, k), y: lerp(A0.y, A1.y, k), h: lerp(A0.h, A1.h, k), tx: lerp(A0.tx, A1.tx, k), ty: lerp(A0.ty, A1.ty, k), th: lerp(A0.th, A1.th, k), fov: cg.fov || 54 };
    } else {
      const K = P.K, ax = K ? K.e.x : P.F.centre.x, ay = K ? K.e.y : P.F.centre.y;
      const a = Math.atan2(ay - p.y, ax - p.x), sx = -Math.sin(a), sy = Math.cos(a);
      const tx = lerp(p.x, ax, 0.5), ty = lerp(p.y, ay, 0.5);
      want = { x: p.x - Math.cos(a) * 13 + sx * 6, y: p.y - Math.sin(a) * 13 + sy * 6, h: 6, tx, ty, th: 2.4, fov: 55 };
    }
    if (!P.cam || warm) P.cam = Object.assign({}, want);
    else { const c = P.cam, r = P.G.camLag || 0.12; for (const key of ['x', 'y', 'h', 'tx', 'ty', 'th', 'fov']) c[key] += (want[key] - c[key]) * r; }
    STAGE.cam(P.cam);
  }

  /* ------------------------------------------------------------ the immersion procession (teenmaar + gulal) */
  const LOOKS = [
    { skin: '#a0683f', hair: '#1a1412', shirt: '#e83a8a', pants: '#2a3a6a' }, { skin: '#8a5a32', hair: '#1a1412', shirt: '#f08a24', pants: '#efe9dc' },
    { skin: '#b07850', hair: '#201810', shirt: '#f2c230', pants: '#3a3a44' }, { skin: '#7a4a2a', hair: '#141010', shirt: '#ff5a2a', pants: '#e8e2d0' },
    { skin: '#9a6440', hair: '#1a1412', shirt: '#d83a3a', pants: '#2a2a3a' }, { skin: '#a87048', hair: '#181210', shirt: '#ffffff', pants: '#e8742a' },
    { skin: '#8c5a36', hair: '#120e0c', shirt: '#2a9a5a', pants: '#efe9dc' }, { skin: '#b07a52', hair: '#1a1412', shirt: '#8a3ae8', pants: '#2a2a3a' },
  ];
  // only shipped (packed) character models: adult_man and kid_chinnu, tinted per dancer
  const MODELS = ['adult_man', 'adult_man', 'kid_chinnu', 'adult_man', 'adult_man', 'kid_chinnu', 'adult_man'];
  function findRig(x, y) {
    const sc = N.seasons.scene(x, y, 900);
    let best = null, bd = 1e18;
    // the giant idol wins when it is within reach (the Khairatabad-style one), else the nearest rig
    for (const pr of sc.props) if (pr.idol) { const d = (pr.x - x) ** 2 + (pr.y - y) ** 2 - (pr.kind === 'giant' ? 300 * 300 : 0); if (d < bd) { bd = d; best = pr; } }
    return best;
  }
  function setupProcession(x, y) {
    const rig = findRig(x, y);
    if (!rig) { C.proc = null; return; }
    const a = rig.a || 0, dx = Math.cos(a), dy = Math.sin(a), sx = -dy, sy = dx;
    const cx = rig.x - dx * 34, cy = rig.y - dy * 34;
    const list = [];
    let k = 0;
    for (let row = 0; row < 3; row++) for (let col = -3; col <= 3; col++) {
      if (row === 0 && col === 0) continue;
      const jx = Math.sin(k * 12.9) * 1.6, jy = Math.cos(k * 7.3) * 1.6;
      list.push({ ox: -dx * (row * 4.5) + sx * col * 3.6 + jx, oy: -dy * (row * 4.5) + sy * col * 3.6 + jy, a: a + Math.PI, model: MODELS[k % MODELS.length], look: LOOKS[k % LOOKS.length], clip: k % 3 === 0 ? 'walk' : 'run', ph: k * 1.37, dance: 0.8 + (k % 3) * 0.15 });
      k++;
    }
    list.push({ ox: -dx * 7.5, oy: -dy * 7.5, a: a + Math.PI, model: 'kid_chinnu', look: N.player.look, clip: 'run', ph: 0.3, dance: 1.1 }); // Chinnu, front and centre
    for (const c of list) { c.x = cx + c.ox; c.y = cy + c.oy; }
    STAGE.crowd(list);
    STAGE.gulal({ x: cx - dx * 4, y: cy - dy * 4, h: 0, r: 13 });
    N.player.hidden = true;
    C.proc = { rig, list, a, cx, cy };
  }
  function procFrame() {
    const P = C.proc; if (!P) return;
    const rig = findRig(P.rig.x, P.rig.y) || P.rig; // track the same rig (nearest to where it was)
    P.rig = rig;
    const a = P.a, dx = Math.cos(a), dy = Math.sin(a);
    const cx = rig.x - dx * 34, cy = rig.y - dy * 34;
    for (const c of P.list) { c.x = cx + c.ox; c.y = cy + c.oy; }
    STAGE.gulal({ x: cx - dx * 4, y: cy - dy * 4, h: 0, r: 13 });
    // low dolly behind the dancers (they face us), the idol on its rig rising behind them
    const t = C.f / FPS, sw = -0.45 + t * 0.3;
    const ca = a + Math.PI + sw, r = 26;
    const big = rig.kind === 'giant';
    STAGE.cam({ x: cx + Math.cos(ca) * r, y: cy + Math.sin(ca) * r, h: 3.6, tx: rig.x - dx * 14, ty: rig.y - dy * 14, th: big ? 15 : 9, fov: big ? 64 : 56 });
  }

  function advance(warm) {
    const { o, path, v } = C;
    if (o.pg) pgFrame(warm);
    else if (o.procession) procFrame();
    else if (o.view === 'cam') {
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
    if (o.pitch != null && N.view3d.setCamera) N.view3d.setCamera({ pitch: o.pitch });
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
  // (debug: the playground game's state at this frame)
  window.CLIP_DBG = () => { if (!C || !C.pg) return null; const s = C.pg.D.state(); return s && { f: C.f, ph: s.phase, ball: s.ball.state + (s.ball.holder ? ':' + s.ball.holder : ''), tele: s.tele, me: [Math.round(N.player.x), Math.round(N.player.y)], stack: s.lingocha ? s.lingocha.stack : null, log: s.log.slice(-3).map((e) => e.type + (e.name ? ':' + e.name : '')).join(' ') }; };
})();
