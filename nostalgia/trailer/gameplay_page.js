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
    cycle_oldcity: { view: 'tps', at: 'laad_bazaar', time: [10, 30], veh: 'cycle', spd: 105, dir: 0, chase: { back: 17, h: 11.5, lead: 6, th: 3, fov: 56, lag: 0.2 } },
    top_charminar: { view: 'top', at: 'charminar_plaza', time: [11, 0], veh: 'cycle', spd: 115, dir: -1.6 },
    auto_tankbund: { view: 'tps', at: 'tank_bund', time: [17, 25], veh: 'auto', spd: 130, dir: -1.2, prefer: 'bund' },
    top_chase: { view: 'top', at: 'abids', time: [12, 30], veh: null, spd: 82, dir: 0, run: true, wanted: 3 },
    scooty_rain: { view: 'fps', at: 'abids', time: [21, 15], veh: 'scooty', spd: 120, dir: 1.5, rain: 0.9 },
    top_rain: { view: 'top', at: 'koti', time: [20, 30], veh: 'cycle', spd: 100, dir: -1.5, rain: 0.9 },
    pigeons: { view: 'tps', at: 'charminar_plaza', time: [8, 10], veh: null, spd: 80, dir: 2.6, run: true, scare: 8 },
    top_kites: { view: 'top', at: 'giver_himayatnagar', time: [15, 30], veh: null, spd: 45, dir: 0.5 },
    boat: { view: 'tps', at: 'buddha_statue', time: [9, 40], veh: 'boat', spd: 55, line: { a: 0.3, r0: 330, r1: 70 } },
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
    fest_ganesh: { view: 'cam', at: 'tank_bund', time: [16, 40], veh: null, spd: 0, procession: true, front: true, gap: 20, lookAt: 8, camH: 4.2, thAdd: 3, sw0: -0.4, swRate: 0.17, seasons: { ganesh_immersion: true, ganesh: true } },
    fest_ramzan: { view: 'tps', at: 'charminar', off: [0, -240], time: [21, 30], veh: null, spd: 32, toward: 'charminar', chase: { back: 18, h: 6.5, lead: 40, th: 16, fov: 60, lag: 0.2 }, seasons: { ramzan: true } },
    ramzan_e: { view: 'tps', at: 'charminar', off: [230, 0], time: [21, 30], veh: null, spd: 32, toward: 'charminar', chase: { back: 18, h: 6.5, lead: 40, th: 16, fov: 60, lag: 0.2 }, seasons: { ramzan: true } },
    ramzan_s: { view: 'tps', at: 'charminar', off: [0, 230], time: [21, 30], veh: null, spd: 32, toward: 'charminar', chase: { back: 18, h: 6.5, lead: 40, th: 16, fov: 60, lag: 0.2 }, seasons: { ramzan: true } },
    ramzan_w: { view: 'tps', at: 'charminar', off: [-230, 0], time: [21, 30], veh: null, spd: 32, toward: 'charminar', chase: { back: 18, h: 6.5, lead: 40, th: 16, fov: 60, lag: 0.2 }, seasons: { ramzan: true } },
    fest_bonalu: { view: 'tps', at: 'lal_darwaza_temple', time: [10, 40], veh: null, spd: 0, seasons: { bonalu: true }, bonalu: { temple: 'lal_darwaza_temple', ahead: 17, side: 13, h: 5, lat: 4.5, look: -1.5 } },
    fest_numaish: { view: 'tps', at: [8312, 5864], time: [20, 30], veh: null, spd: 48, run: true, line: { a: 0, r0: 210, r1: -120 }, chase: { back: 16, h: 6.5, lead: 30, th: 12, fov: 60, lag: 0.2 }, seasons: { numaish: true } },
    fest_christmas: { view: 'top', at: 'secunderabad_clock_tower', time: [21, 0], veh: null, spd: 45, dir: 1.0, seasons: { christmas: true } },
    // in-world playground games (N.playgroundGames): a real match with Chinnu and the AI kids, scripted inside the window
    lingocha: { view: 'tps', at: 'playground_home', time: [12, 40], veh: null, spd: 0, pg: { game: 'lingocha', place: 'playground_home', seed: 3, cam: { side: -28, h1: 14, crane: 45, f0: 21, s0: 8, h0: 10.5, lk0: 0.75 }, params: { seekFirst: true, team: 4, difficulty: 0.5 } } },
    marampitti: { view: 'tps', at: 'playground_2', time: [16, 50], veh: null, spd: 0, pg: { game: 'marampitti', place: 'playground_2', seed: 2, winds: [[0, 0.9, 0]], dodges: [21], victim: { back: 6.5, lat: 1.2 }, camLag: 0.2, me: [14, -8], kAng: 3.14, fixCam: 0.5, cam: { back: 14, side: 5, h: 15, fov: 52, look: 0.35 }, params: { kids: 8, difficulty: 0.5 } } },
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
    if (o.bonalu) { C = { id, o, path: null, v: null, d: 0, f: 0, x: 0, y: 0 }; return bonPrep(o, nf); }
    const pl = o.at instanceof RegExp ? placeLike(o.at) : (P(o.at) || LM(o.at));
    if (Array.isArray(o.at)) { x = o.at[0]; y = o.at[1]; } else { x = pl.x; y = pl.y; }
    if (o.off) { x += o.off[0]; y += o.off[1]; }
    const total = (nf + 60) / FPS * Math.max(1, o.spd);
    let path;
    if (o.line) { // a straight row in from the open water towards a landmark (boats)
      const ln = o.line, a = ln.a, n = 80, pts = [];
      for (let k = 0; k <= n; k++) { const r = ln.r0 + (ln.r1 - ln.r0) * (k / n); pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
      const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      path = { pts, cum, len: cum[cum.length - 1] };
    } else if (o.circle) { // a loop round a point on the water (boats)
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
    // top-down: a closer follow zoom (the game's own baseZoom multiplier) so Chinnu reads at trailer size
    N.render.baseZoom = o.view === 'top' ? (window.TOPZOOM || o.zoom || 1) : 1;
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
    PIN.J = null;
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
    // (G.me: Chinnu's spot relative to the centre, G.kAng: bearing to the thrower; keeps the hop clear of the
    // ground's benches / swings)
    if (C.pg.G.me) { p.x = c.x + C.pg.G.me[0]; p.y = c.y + C.pg.G.me[1]; p.vx = p.vy = 0; }
    // the thrower: the kid nearest the spot 26 u across the ground from Chinnu (towards the centre)
    let a = C.pg.G.kAng != null ? C.pg.G.kAng : Math.atan2(c.y - p.y, c.x - p.x);
    const kx = p.x + Math.cos(a) * 26, ky = p.y + Math.sin(a) * 26;
    kids.sort((A, B) => hyp(A.e.x - kx, A.e.y - ky) - hyp(B.e.x - kx, B.e.y - ky));
    const K = kids[0];
    K.e.x = kx; K.e.y = ky; K.e.vx = K.e.vy = 0;
    D.give(K.name);
    C.pg.K = K;
  }
  // the pinned kid is held in place after the game's own AI step (order 26), so he stands still, not walks on the spot
  const PIN = { J: null, x: 0, y: 0, a: 0 };
  N.addSystem({ id: 'trailer.pin', order: 26.5, runIn: ['play'], update() {
    const J = PIN.J; if (!J || !J.e || J.out) return;
    J.e.x = PIN.x; J.e.y = PIN.y; J.e.vx = J.e.vy = 0; J.dvx = J.dvy = 0; J.e.angle = J.e.facing = PIN.a;
  } });
  function maramFrame() {
    const P = C.pg, { S, G } = P, me = S.me, f = C.f, p = N.player;
    // scripted wind-ups at Chinnu ([frame, fuse s, fuse already burnt s]) by whoever holds the ball, and his hops
    for (const w of G.winds || []) {
      if (f !== w[0]) continue;
      const K = S.ball.holder;
      if (!K || K.isPlayer || K.out) continue;
      K.windT0 = w[1]; K.windT = w[1] - (w[2] || 0); K.tgt = me; K.aimLock = null; S.tele = { from: K, to: me };
    }
    if ((G.dodges || []).includes(f)) press('run', 0.1);
    // a kid standing behind Chinnu on the ball's line (held there until the ball is in the air): the throw Chinnu
    // hops out of hits him instead
    const V = G.victim, K0 = P.K;
    if (V && K0 && !P.vDone) {
      if (!P.vic) {
        const ks = S.parts.filter((q) => !q.isPlayer && !q.out && q !== K0 && !q.hold);
        const a = Math.atan2(p.y - K0.e.y, p.x - K0.e.x);
        P.vx0 = p.x + Math.cos(a) * V.back - Math.sin(a) * V.lat; P.vy0 = p.y + Math.sin(a) * V.back + Math.cos(a) * V.lat; P.va = a + Math.PI;
        ks.sort((A, B) => hyp(A.e.x - P.vx0, A.e.y - P.vy0) - hyp(B.e.x - P.vx0, B.e.y - P.vy0));
        P.vic = ks[0];
      }
      const J = P.vic;
      PIN.J = J; PIN.x = P.vx0; PIN.y = P.vy0; PIN.a = P.va;
      if (J) { J.e.x = P.vx0; J.e.y = P.vy0; J.e.vx = J.e.vy = 0; J.face = P.va; J.e.angle = J.e.facing = P.va; }
      const b = S.ball;
      if (P.vDone) PIN.J = null;
      if (J && (J.out || (b.thrower === K0 && b.state !== 'held' && (b.bounced > 0 || !b.live || hyp(b.x - K0.e.x, b.y - K0.e.y) > hyp(J.e.x - K0.e.x, J.e.y - K0.e.y) + 5)))) P.vDone = true;
    }
    // between hops Chinnu squares up to the kid with the ball
    const T = S.ball.holder && !S.ball.holder.isPlayer ? S.ball.holder : P.K;
    if (T && hyp(p.vx, p.vy) < 5 && !S.auto) p.angle = p.facing = Math.atan2(T.e.y - p.y, T.e.x - p.x);
  }
  function lingoFrame() {
    const P = C.pg, { S, G } = P, L = S.L, f = C.f;
    if (f === (G.press == null ? 4 : G.press)) { P.D.assist.aim = true; P.D.assist.power = G.power || 0.78; N.input.press('action', G.hold || 0.42); }
    if (L.knocked && P.knockF == null) P.knockF = f;
    if (L.knocked && (S.phase === 'scatter' || S.phase === 'live')) seekerBot();
  }
  // traffic turning round at the roads the game closes can swing a lorry onto the ground: keep the pitch clear
  function clearPitch(m) {
    const F = C.pg.F;
    for (const e of N.entities.all.slice()) {
      if (e.kind !== 'vehicle' || e === N.player.vehicle) continue;
      if (e.x > F.x0 - m && e.x < F.x1 + m && e.y > F.y0 - m && e.y < F.y1 + m) { try { N.vehicles.remove(e); } catch (er) { /* ignore */ } }
    }
  }
  function pgFrame(warm) {
    const P = C.pg; if (!P || !P.S) return;
    clearPitch(warm ? 25 : 4);
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
      const F0 = cg.f0 || 13.5, S0 = cg.s0 == null ? 2.5 : cg.s0, H0 = cg.h0 || 8, fw0 = F0 - 1.5 * pre;
      const A0 = { x: B.x + ux * fw0 + vx * S0, y: B.y + uy * fw0 + vy * S0, h: H0, tx: lerp(B.x, lx, cg.lk0 || 0.85), ty: lerp(B.y, ly, cg.lk0 || 0.85), th: 2 };
      // after: the stones fly our way, so swing round to the side of the ground: the base, the scattered stones,
      // Chinnu and the hitters all across the frame (tracking the middle of the action)
      const mx = lerp(B.x + ux * 8, p.x, 0.4), my = lerp(B.y + uy * 8, p.y, 0.4);
      P.mx = P.mx == null ? mx : P.mx + (mx - P.mx) * 0.06; P.my = P.my == null ? my : P.my + (my - P.my) * 0.06;
      // swing on an arc (radius and height growing) from in front of the stack round to the side, so the camera
      // rises over the kids running in rather than cutting through them
      const sd = cg.side || 30, r0 = Math.hypot(fw0, S0), t0 = Math.atan2(S0, fw0), t1 = Math.atan2(sd, -4), r1 = Math.hypot(sd, 4);
      let dt = t1 - t0; while (dt > Math.PI) dt -= 2 * Math.PI; while (dt < -Math.PI) dt += 2 * Math.PI;
      const th = t0 + dt * k, rr = lerp(r0, r1, k), cxx = lerp(B.x, P.mx, k), cyy = lerp(B.y, P.my, k);
      const ou = Math.cos(th) * rr, ov = Math.sin(th) * rr;
      want = { x: cxx + ux * ou + vx * ov, y: cyy + uy * ou + vy * ov, h: lerp(H0, cg.h1 || 12, sm(k * 1.5)), tx: lerp(A0.tx, P.mx, k), ty: lerp(A0.ty, P.my, k), th: lerp(A0.th, 1.5, k), fov: cg.fov || 54 };
    } else {
      // frame Chinnu against the current threat: the kid winding up at him, else whoever holds the ball
      if (!warm && P.G.follow) { const T = S.tele && S.tele.from && S.tele.from.windT > 0 ? S.tele.from : (S.ball.holder && !S.ball.holder.isPlayer ? S.ball.holder : null); if (T && T !== P.K && hyp(T.e.x - p.x, T.e.y - p.y) > 14) P.K = T; }
      const K = P.K; let ax = K ? K.e.x : P.F.centre.x, ay = K ? K.e.y : P.F.centre.y;
      // the camera's bearing is fixed at the start of the shot (no swing when Chinnu hops); it re-centres on him
      if (P.a0 == null || warm) { P.a0 = Math.atan2(ay - p.y, ax - p.x); P.ax0 = ax; P.ay0 = ay; }
      const a = P.a0, sx = -Math.sin(a), sy = Math.cos(a);
      if (!P.G.follow) { ax = P.ax0; ay = P.ay0; }
      const cg0 = P.G.cam || {}, tx = lerp(p.x, ax, cg0.look == null ? 0.5 : cg0.look), ty = lerp(p.y, ay, cg0.look == null ? 0.5 : cg0.look);
      const cg = P.G.cam || {};
      want = { x: p.x - Math.cos(a) * (cg.back || 11) + sx * (cg.side || 3), y: p.y - Math.sin(a) * (cg.back || 11) + sy * (cg.side || 3), h: cg.h || 7.5, tx, ty, th: cg.th || 2.2, fov: cg.fov || 55 };
    }
    // fixCam: the camera stays where the shot started (only the look follows Chinnu's hop)
    if (P.G.fixCam != null && !warm) {
      if (!P.cam0) P.cam0 = { x: P.cam.x, y: P.cam.y, h: P.cam.h };
      const k = P.G.fixCam; want.x = lerp(want.x, P.cam0.x, k); want.y = lerp(want.y, P.cam0.y, k); want.h = lerp(want.h, P.cam0.h, k);
    }
    if (!P.cam || warm) P.cam = Object.assign({}, want);
    else { const c = P.cam, r = P.G.camLag || 0.12; for (const key of ['x', 'y', 'h', 'tx', 'ty', 'th', 'fov']) c[key] += (want[key] - c[key]) * r; }
    STAGE.cam(P.cam);
  }

  /* ------------------------------------------------------------ Bonalu: Chinnu walks in the procession to the temple */
  // (N.seasons' own procession: drummers, Pothurajus, women with bonam pots two abreast at 6 u/s; the camera
  // walks backwards ahead of it, three-quarter on, Chinnu between the Pothurajus and the first pots)
  async function bonPrep(o, nf) {
    const B = o.bonalu, T = N.places[B.temple];
    N.debug.teleport(T.x, T.y + 40);
    N.view.set('tps');
    fast(4);
    const pr = (N.seasons._debug.bon.procs || []).find((q) => q.id === B.temple);
    if (!pr) return { error: 'no procession' };
    // the head of the procession well short of the temple, so nobody wraps round inside the shot
    const mx = Math.max(...pr.members.map((m) => m.d)), sh = (pr.L - (B.headGap || 110)) - mx;
    for (const m of pr.members) m.d += sh;
    const cum = [0]; for (let i = 1; i < pr.path.length; i++) cum.push(cum[i - 1] + Math.hypot(pr.path[i][0] - pr.path[i - 1][0], pr.path[i][1] - pr.path[i - 1][1]));
    C.path = { pts: pr.path, cum, len: cum[cum.length - 1] };
    const poth = pr.members.filter((m) => m.kind === 'poth'), bon = pr.members.filter((m) => m.kind === 'bonam');
    C.pr = pr; C.ref = bon.length ? bon[0] : pr.members[pr.members.length - 1];
    C.off = (B.chinnu == null ? 5.5 : B.chinnu);
    void poth;
    for (let k = 0; k < 3; k++) N.view3d.settle(30000);
    noDraw(true); try { for (let k = 0; k < 40; k++) advance(true); } finally { noDraw(false); }
    N.view3d.settle(30000);
    for (let k = 0; k < 6; k++) advance(true);
    C.f = 0;
    return { bonalu: pr.id, L: Math.round(pr.L), head: Math.round(mx + sh), at: [Math.round(N.player.x), Math.round(N.player.y)] };
  }
  function bonFrame(warm) {
    const B = C.o.bonalu, pth = C.path, d = C.ref.d + C.off, p = N.player;
    at(pth, d, tmp); at(pth, d + 2, tmp2);
    const a = Math.atan2(tmp2.y - tmp.y, tmp2.x - tmp.x), sp = 6, lat = B.lat || 0;
    tmp.x -= Math.sin(a) * lat; tmp.y += Math.cos(a) * lat; // (on the camera's side of the column: nobody in front of him)
    p.x = tmp.x - Math.cos(a) * sp / FPS; p.y = tmp.y - Math.sin(a) * sp / FPS; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.angle = p.facing = a; p.running = false;
    const ah = B.ahead || 16, sd = B.side == null ? 9 : B.side;
    at(pth, d + ah, tmp2);
    const a2 = a, cx = tmp2.x - Math.sin(a2) * sd, cy = tmp2.y + Math.cos(a2) * sd;
    const want = { x: cx, y: cy, h: B.h || 5, tx: tmp.x + Math.cos(a) * (B.look || 4), ty: tmp.y + Math.sin(a) * (B.look || 4), th: B.th || 3.4, fov: B.fov || 56 };
    if (!C.cc || warm) C.cc = want; else for (const k of ['x', 'y', 'h', 'tx', 'ty', 'th']) C.cc[k] += (want[k] - C.cc[k]) * 0.15;
    STAGE.cam(C.cc);
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
    // front: the dancers lead the lorry and the camera faces the idol (else they follow it, seen from behind)
    const a = (rig.a || 0) + (C.o.front ? Math.PI : 0), dx = Math.cos(a), dy = Math.sin(a), sx = -dy, sy = dx;
    const gap = C.o.gap || 34, cx = rig.x - dx * gap, cy = rig.y - dy * gap;
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
    const gap = C.o.gap || 34, cx = rig.x - dx * gap, cy = rig.y - dy * gap;
    for (const c of P.list) { c.x = cx + c.ox; c.y = cy + c.oy; }
    STAGE.gulal({ x: cx - dx * 4, y: cy - dy * 4, h: 0, r: 13 });
    // low dolly behind the dancers (they face us), the idol on its rig rising behind them
    const t = C.f / FPS, sw = (C.o.sw0 == null ? -0.45 : C.o.sw0) + t * (C.o.swRate == null ? 0.3 : C.o.swRate);
    const ca = a + Math.PI + sw, r = 26;
    const big = rig.kind === 'giant';
    const tl = C.o.lookAt == null ? 14 : C.o.lookAt;
    STAGE.cam({ x: cx + Math.cos(ca) * r, y: cy + Math.sin(ca) * r, h: C.o.camH || 3.6, tx: rig.x - dx * tl, ty: rig.y - dy * tl, th: (big ? 15 : 9) + (C.o.thAdd || 0), fov: big ? 64 : 56 });
  }

  function advance(warm) {
    const { o, path, v } = C;
    if (o.pg) pgFrame(warm);
    else if (o.bonalu) bonFrame(warm);
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
    if (o.chase && path) {
      const c = o.chase;
      at(path, Math.max(0, C.d - c.back), tmp); at(path, C.d + (c.lead || 0), tmp2);
      const hx = tmp2.x, hy = tmp2.y;
      const want = { x: tmp.x, y: tmp.y, h: c.h, tx: hx, ty: hy, th: c.th, fov: c.fov || 58 };
      if (!C.cc || warm) C.cc = want; else for (const k of ['x', 'y', 'h', 'tx', 'ty', 'th']) C.cc[k] += (want[k] - C.cc[k]) * (c.lag || 0.25);
      C.cc.fov = want.fov;
      STAGE.cam(C.cc);
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
  window.CLIP_DBG = () => { if (!C || !C.pg) return null; const s = C.pg.D.state(); return s && { f: C.f, ph: s.phase, ball: s.ball.state + (s.ball.holder ? ':' + s.ball.holder : ''), tele: s.tele, me: [Math.round(N.player.x), Math.round(N.player.y)], stack: s.lingocha ? s.lingocha.stack : null, log: s.log.slice(-3).map((e) => e.type + (e.name ? ':' + e.name : '')).join(' '), K: C.pg.K && C.pg.K.name, J: C.pg.vic && C.pg.vic.name, pos: s.parts.map((q) => q.name.slice(0, 3) + ' ' + Math.round(q.x) + ',' + Math.round(q.y)).join(' | '), bxy: [Math.round(s.ball.x), Math.round(s.ball.y), s.ball.z], cam: C.pg.cam && [Math.round(C.pg.cam.x), Math.round(C.pg.cam.y)] }; };
})();
