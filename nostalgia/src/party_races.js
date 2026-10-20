/* NOSTALGIA — party_races.js: races and hunts for friends (ARCHITECTURE §24, on top of N.party in src/party.js).
 *
 * Activities (each one works in an online room AND solo against Immu, Ayesha, Pappu and Bunty-anna):
 *   CYCLE RACES, point A to point B, on the real roads (N.world.roads.route A*), everyone on an age-appropriate cycle
 *     (N.party.cycleFor: BSA SLR / Hercules for boys, ladies cycle for girls, kid cycle for the small ones, the Hero
 *     roadster for grown-ups; the AI friends ride their own: Immu's red Hero Ranger-style 'cycle', Ayesha's ladies
 *     cycle, Pappu's kid cycle, Bunty-anna on Nanna's old roadster):
 *       race_tank_bund     Tank Bund sprint (Ambedkar statue -> Sailing Club)          ~1.6k u
 *       race_koti_charminar Koti -> Charminar                                          ~3.5k u
 *       race_necklace      Necklace Road loop (Necklace Road, back along Tank Bund)    ~6.0k u
 *       race_rtc_narayanguda RTC X Roads -> Narayanguda                                ~1.3k u
 *       race_golconda_tombs Golconda gate -> Qutb Shahi tombs                          ~5.3k u
 *       race_custom        Pin race: the challenger drops a START and a FINISH pin on the map (right-click /
 *                          long-press, the map's own waypoint), the route is N.world.roads.route between them.
 *     A 3-2-1 start on a grid, checkpoint rings on the road (2D ground layer + 3D layer 'party', the next one pink with
 *     a minimap route; required in order, shortcuts between them are fine), rivals live (ghosts in a room, AI riders
 *     solo: a pure-pursuit controller with corner braking, wobbles, stuck recovery and a gentle rubber band), traffic
 *     stays on, potholes slow you and can throw you off (vehicles.js), a fall means walking back to the cycle (a kind
 *     uncle lends you another if it is far), the Chappal Meter works as always. Finish order and times; DNF for anyone
 *     still riding when the window after the winner closes (max(30 s, 60% of the winning time)).
 *   FOOT RACES
 *       race_birla_steps   up Naubat Pahad to the Birla Mandir gate: run the lanes, but on the temple steps everybody
 *                          walks (N.respect: Mandir rules), on foot only.
 *       chai_run           from the Lakshmi Nagar colony gate to Café Gulistan, "Ek cutting!", and back to the gate
 *                          without spilling: the chai-carry meter (running spills 15%/s, jogging 3%/s, bumps / pothole
 *                          stumbles / falls spill more, a vehicle spills it all); arrive with at least 30% or go back for
 *                          another; ranked by time + 0.08 s for every 1% spilled.
 *   CHITTI CHASE (chitti_chase): the host's game picks 4-6 landmarks near the start (opts.stops); a clue chit with a
 *     riddle waits at each ("Where the four minarets watch the bangles" -> Charminar). Visit them in order; the chit
 *     shows up when you are close (a search circle after 45 s, the exact spot after 90 s). First to all of them wins.
 * Leaderboards: personal best + route top 10 through the race_put / race_top database functions
 *   (supabase/migrations/20261020000000_party.sql, via N.online.partyRpc; keyed by sha256(player code), sizes and
 *   rates checked there); offline the best is kept in localStorage 'nostalgia.races.v1' and sent when online again.
 *   Journal page "Races" lists them.
 * API N.partyRaces = {ROUTES, RIDDLES, route(id) -> {pts, total, cps}, best(routeId), top(routeId), fetchTop(routeId),
 *   pinRace() -> Promise<{a, b, from, to} | null>, pathFor(points, opts), _debug}
 * Test: node tests/party.cjs
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.party) return;
  const U = N.util;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hyp = Math.hypot;
  const LS = 'nostalgia.races.v1';
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  function sfx(name, o) { try { if (N.audio && N.audio.sfx) N.audio.sfx(name, Object.assign({ ui: true }, o || {})); } catch (e) { /* ignore */ } }
  const fmt = (ms) => N.party.fmtMs(ms);
  const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const COLORS = ['#5fd0ff', '#ff5fb0', '#f2c230', '#6fff6a', '#ff8a3a', '#b58aff', '#ff5a4a', '#3ae0c0', '#e8e4d8', '#9ad04a'];

  /* ================================================================ routes */
  const ROUTES = [
    { id: 'tank_bund', name: 'Tank Bund sprint', from: 'Ambedkar statue', to: 'Sailing Club', where: 'tank_bund', pts: [[8917, 4126], [9892, 2837]], every: 420, min: 8000 },
    { id: 'koti_charminar', name: 'Koti to Charminar', from: 'Koti', to: 'Charminar', where: 'koti', pts: [[9825, 6145], [9020, 8340]], every: 450, min: 16000 },
    { id: 'necklace_loop', name: 'Necklace Road loop', from: 'Necklace Road', to: 'back round the lake', where: 'necklace_road', pts: [[8082, 3676], [9884, 2754], [8917, 4126], [8082, 3676]], every: 520, min: 30000 },
    { id: 'rtc_narayanguda', name: 'RTC X Roads to Narayanguda', from: 'RTC X Roads', to: 'Narayanguda', where: 'rtc_x_roads', pts: [[10860, 4438], [10380, 5363]], every: 380, min: 7000 },
    { id: 'golconda_tombs', name: 'Golconda gate to the Qutb Shahi tombs', from: 'Golconda Fateh Darwaza', to: 'Qutb Shahi tombs', where: 'golconda_fateh_darwaza', pts: [[4096, 6544], [3456, 5440]], every: 480, min: 9000 },
  ];
  const ROUTE = new Map(ROUTES.map((r) => [r.id, r]));
  // the foot races' fixed spots (map v2 coordinates; checked by tests/party.cjs)
  // the gate is reached round the temple's east corner (the straight line from the top step cuts its footprint)
  const BIRLA = { start: [8700, 4262], foot: [8522, 4384], steps: [[8522, 4383], [8423, 4376], [8376, 4367], [8330, 4356], [8334, 4388]], gate: [8290, 4396] };
  const COLONY_GATE = { x: 9978, y: 4949, name: 'Lakshmi Nagar colony gate' };
  const CHAI_CAFE = 'irani_cafe_7';
  const CHAI_MIN = 30, CHAI_PENALTY = 80; // arrive with at least 30%; each 1% spilled costs 80 ms in the ranking

  /* ================================================================ paths */
  function mkPath(list) {
    const P = [];
    for (const p of list) { const x = +(p.x != null ? p.x : p[0]), y = +(p.y != null ? p.y : p[1]); if (!isFinite(x) || !isFinite(y)) continue; const l = P[P.length - 1]; if (l && hyp(l.x - x, l.y - y) < 0.5) continue; P.push({ x, y }); }
    // densify (max 28 u a segment): smoother projection and AI pursuit
    const D = [];
    for (let i = 0; i < P.length; i++) {
      if (i) { const a = P[i - 1], b = P[i], L = hyp(b.x - a.x, b.y - a.y), n = Math.ceil(L / 28); for (let k = 1; k < n; k++) D.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }); }
      D.push(P[i]);
    }
    const cum = [0];
    for (let i = 1; i < D.length; i++) cum.push(cum[i - 1] + hyp(D[i].x - D[i - 1].x, D[i].y - D[i - 1].y));
    const total = cum[cum.length - 1] || 0;
    const idx = (s) => { let lo = 0, hi = D.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1; } return Math.max(0, lo); };
    function at(s) {
      if (D.length < 2) return { x: D[0] ? D[0].x : 0, y: D[0] ? D[0].y : 0, a: 0 };
      s = clamp(s, 0, total);
      const i = idx(s), a = D[i], b = D[i + 1], L = cum[i + 1] - cum[i] || 1, t = (s - cum[i]) / L;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x), i };
    }
    function project(x, y, hint) {
      if (D.length < 2) return { s: 0, d: 0 };
      let i0 = 0, i1 = D.length - 2;
      if (hint != null && isFinite(hint)) { i0 = idx(Math.max(0, hint - 160)); i1 = Math.min(D.length - 2, idx(hint + 320) + 1); }
      let best = null;
      for (let i = i0; i <= i1; i++) {
        const q = U.closestOnSeg(x, y, D[i].x, D[i].y, D[i + 1].x, D[i + 1].y);
        if (!best || q.d2 < best.d2) best = { d2: q.d2, s: cum[i] + (cum[i + 1] - cum[i]) * q.t };
      }
      if (hint != null && best.d2 > 110 * 110) return project(x, y, null);
      return { s: best.s, d: Math.sqrt(best.d2) };
    }
    return { pts: D, cum, total, at, project, from: (s) => { const i = idx(s); return [at(s)].concat(D.slice(i + 1)); } };
  }
  /** a road path through the points (each pair by A* over the road graph) -> [{x, y}] | null */
  function pathFor(points, o) {
    o = o || {};
    const RD = N.world && N.world.roads;
    if (!RD || !RD.route) return null;
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i], q = points[i + 1];
      const a = RD.nearestNode(+(p.x != null ? p.x : p[0]), +(p.y != null ? p.y : p[1])), b = RD.nearestNode(+(q.x != null ? q.x : q[0]), +(q.y != null ? q.y : q[1]));
      if (!a || !b) return null;
      const r = RD.route(a, b, { walk: !!o.walk, paths: !!o.paths });
      if (!r) return null;
      for (const n of r) { const l = out[out.length - 1]; if (l && l.id === n.id) continue; out.push({ x: n.x, y: n.y, id: n.id }); }
    }
    return out.length >= 2 ? out : null;
  }
  /** checkpoints every ~`every` u after the start line s0; the last one is the finish */
  function checkpoints(P, s0, every, r) {
    const span = P.total - s0;
    const n = Math.max(1, Math.round(span / every));
    const out = [];
    for (let k = 1; k <= n; k++) { const s = s0 + (span * k) / n; const q = P.at(s - (k === n ? 0 : 0)); out.push({ i: k - 1, x: q.x, y: q.y, s, a: q.a, r: k === n ? r + 6 : r, finish: k === n }); }
    return out;
  }
  const RC = new Map(); // route cache
  function routeData(id) {
    if (RC.has(id)) return RC.get(id);
    const R = ROUTE.get(id);
    if (!R || !N.world || !N.world.built) return null;
    const raw = pathFor(R.pts);
    if (!raw) { RC.set(id, null); return null; }
    const P = mkPath(raw);
    const s0 = Math.min(90, P.total * 0.08);
    const d = { id, P, s0, cps: checkpoints(P, s0, R.every, 40), km: (P.total - s0) * 1.6 / 1000 };
    RC.set(id, d);
    return d;
  }
  N.on('world:built', () => RC.clear());

  /* ================================================================ leaderboards */
  const LB = (() => {
    let o = null;
    try { o = JSON.parse(lsGet(LS) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') o = {};
    return { best: o.best && typeof o.best === 'object' ? o.best : {}, pending: Array.isArray(o.pending) ? o.pending.slice(-20) : [], top: {}, fetchT: {} };
  })();
  function saveLB() { lsSet(LS, JSON.stringify({ best: LB.best, pending: LB.pending })); }
  const online = () => !!(N.online && N.online.code && N.online.available === 'ok' && N.online.partyRpc);
  const SERVER_ROUTES = new Set(ROUTES.map((r) => r.id).concat(['birla_steps', 'chai_run']));
  async function submit(route, ms, vehicle) {
    ms = Math.round(ms);
    const prev = LB.best[route];
    const pb = !prev || ms < prev.ms;
    if (pb) { LB.best[route] = { ms, t: Date.now(), v: vehicle || null }; saveLB(); }
    const out = { pb, best: LB.best[route].ms, local: true, rank: null };
    if (!SERVER_ROUTES.has(route)) return out;
    if (!online()) { LB.pending.push({ route, ms, vehicle: vehicle || null }); LB.pending = LB.pending.slice(-20); saveLB(); return out; }
    const r = await N.online.partyRpc('race_put', { route, ms, vehicle: vehicle || null });
    if (r && r.ok) {
      LB.top[route] = { top: Array.isArray(r.top) ? r.top : [], best: r.best, rank: r.rank, t: Date.now() };
      if (isFinite(r.best) && (!LB.best[route] || r.best < LB.best[route].ms)) { LB.best[route] = { ms: r.best, t: Date.now() }; saveLB(); }
      flushPending();
      return Object.assign(out, { local: false, rank: r.rank, best: r.best, improved: r.improved });
    }
    if (r && r.reason !== 'too_fast' && r.reason !== 'bad_time') { LB.pending.push({ route, ms, vehicle: vehicle || null }); LB.pending = LB.pending.slice(-20); saveLB(); }
    return Object.assign(out, { why: r && r.reason });
  }
  let flushing = false;
  async function flushPending() {
    if (flushing || !online() || !LB.pending.length) return;
    flushing = true;
    try {
      const list = LB.pending.splice(0);
      saveLB();
      // only each route's best matters
      const best = new Map();
      for (const p of list) if (SERVER_ROUTES.has(p.route) && (!best.has(p.route) || p.ms < best.get(p.route).ms)) best.set(p.route, p);
      for (const p of best.values()) { const r = await N.online.partyRpc('race_put', { route: p.route, ms: p.ms, vehicle: p.vehicle }); if (!r || !r.ok) { if (r && r.reason !== 'too_fast' && r.reason !== 'bad_time' && r.reason !== 'bad_route') LB.pending.push(p); } else LB.top[p.route] = { top: r.top || [], best: r.best, rank: r.rank, t: Date.now() }; }
      saveLB();
    } finally { flushing = false; }
  }
  async function fetchTop(route) {
    if (!online() || !SERVER_ROUTES.has(route)) return LB.top[route] || null;
    if (LB.fetchT[route] && Date.now() - LB.fetchT[route] < 45000) return LB.top[route] || null;
    LB.fetchT[route] = Date.now();
    const r = await N.online.partyRpc('race_top', { route });
    if (r && r.ok) LB.top[route] = { top: Array.isArray(r.top) ? r.top : [], best: r.best, rank: r.rank, t: Date.now() };
    return LB.top[route] || null;
  }
  function bestLine(route) {
    const b = LB.best[route], t = LB.top[route];
    const rec = t && t.top && t.top[0];
    return (b ? 'Your best ' + fmt(b.ms) : 'No time yet') + (rec ? ' · Record: ' + rec.nick + ' ' + fmt(rec.ms) : '');
  }
  N.on('online:status', (d) => { if (d && (d.status === 'ready' || d.status === 'room')) setTimeout(() => flushPending().catch(() => {}), 1500); });

  /* ================================================================ shared race runner (cycle + foot) */
  // C: {lb (leaderboard route id | null), P (path), s0, cps, foot, vehicleOf(player), aiSpeed(uid), aiWalk (waypoints for
  //   foot AIs), name}
  function raceRun(ctx, C) {
    const P = C.P, cps = C.cps, n = cps.length, me = ctx.me;
    const st = { next: 0, done: false, myS: C.s0, prog: new Map(), boardT: 0, footT: 0, warnT: 0, objT: 0, bike: null, lent: 0, offs: [], dnf: false, finWin: null, aiBlips: [], passT: {}, lastPlace: null };
    const color = (i) => COLORS[i % COLORS.length];
    // the grid along the path behind the start line, two abreast
    const slotOf = (i) => {
      const row = Math.floor(i / 2), side = i % 2 ? 1 : -1;
      const q = P.at(Math.max(0, C.s0 - 5 - row * (C.foot ? 9 : 14)));
      const nx = -Math.sin(q.a), ny = Math.cos(q.a), off = C.foot ? 4.5 : 6.5;
      let x = q.x + nx * off * side, y = q.y + ny * off * side;
      try { const f = N.world.findFree(x, y, C.foot ? 'walk' : 'drive', 8); if (f) { x = f.x; y = f.y; } } catch (e) { /* ignore */ }
      return { x, y, a: q.a };
    };
    const vtype = C.foot ? null : N.party.cycleFor(me.look, ctx.seed + ctx.slot);
    const my = slotOf(ctx.slot);
    st.bike = ctx.place(my.x, my.y, my.a, { vehicle: vtype });
    st.vtype = vtype;
    // markers: every checkpoint; the next one pink with the minimap route
    const paint = () => cps.forEach((c, i) => ctx.marker('cp' + i, { x: c.x, y: c.y, r: c.r, angle: c.a, kind: c.finish ? 'finish' : 'ring', color: c.finish ? '#f2c230' : '#ff5fb0', num: c.finish ? null : i + 1, state: i < st.next ? 'done' : i === st.next ? 'next' : 'later', route: true, label: c.finish ? 'Finish' : 'Checkpoint ' + (i + 1) }));
    paint();
    // the AI friends (solo)
    const AIs = ctx.players.filter((p) => p.isAI);
    for (const p of AIs) {
      const i = ctx.players.indexOf(p), q = slotOf(i);
      const a = ctx.ai.spawn(p.uid, q.x, q.y, { angle: q.a, vehicle: C.foot ? null : true });
      if (!a) { ctx.ai.report(p.uid, { dnf: true, note: 'stayed home' }); continue; }
      st.prog.set(p.uid, { s: C.s0, cp: 0 });
      try { N.hud.blip('pt:ai:' + p.uid, a, { color: color(i), icon: 'dot', label: p.nick, size: 3 }); st.aiBlips.push('pt:ai:' + p.uid); } catch (e) { /* ignore */ }
      const f = ctx.ai.friend(p.uid);
      setTimeout(() => { if (f && ctx.phase !== 'done') ctx.ai.bark(p.uid, f.hi[Math.floor(ctx.ai.rng.next() * f.hi.length)], 2.4); }, 600 + i * 450);
      const onDone = () => { if (!ctx.results().find((r) => r.uid === p.uid && r.timeMs != null)) { ctx.ai.report(p.uid, { timeMs: ctx.elapsed(), progress: 1 }); const won = !ctx.results().some((r) => r.uid !== p.uid && r.timeMs != null && r.timeMs < ctx.elapsed()); if (f) ctx.ai.bark(p.uid, won ? f.win[0] : f.lose[Math.floor(ctx.ai.rng.next() * f.lose.length)], 2.6); } };
      if (C.foot) {
        const wps = (C.aiWalk ? C.aiWalk(p.uid, q) : [{ x: P.pts[P.pts.length - 1].x, y: P.pts[P.pts.length - 1].y }]);
        ctx.ai.walk(p.uid, wps, { run: true, speed: C.aiSpeed(p.uid), onDone });
      } else {
        const path = [{ x: q.x, y: q.y }].concat(P.from(C.s0 + 4));
        ctx.ai.ride(p.uid, path, { r: cps[n - 1].r * 0.6, onDone, mul: () => rubber(p.uid), lane: (i % 2 ? 1 : -1) * (4 + 2.5 * ((i - 1) >> 1)) });
      }
    }
    function rubber(uid) {
      if (st.done) return 1;
      const pr = st.prog.get(uid);
      const d = (pr ? pr.s : 0) - st.myS;
      return d > 260 ? 0.88 : d > 140 ? 0.95 : d < -260 ? 1.07 : d < -140 ? 1.03 : 1;
    }
    // rivals' checkpoints (party)
    st.offs.push(ctx.on('cp', (d, from) => { if (!d || !isFinite(d.i)) return; const pr = st.prog.get(from.uid) || { s: 0, cp: 0 }; pr.cp = Math.max(pr.cp, clamp(d.i | 0, 0, n)); pr.s = Math.max(pr.s, pr.cp > 0 ? cps[pr.cp - 1].s : 0); st.prog.set(from.uid, pr); }));
    const onFall = () => { if (!st.done && !C.foot) ctx.toast('*DHADAAM!* Get back on your cycle!', 2200); };
    const onBump = (d) => { if (st.done || !d || d.speed < 50) return; const v = N.player && N.player.vehicle; if (v && (d.a === v || d.b === v)) { /* bumps are their own penalty: speed */ } };
    N.on('player:fall', onFall); N.on('bump', onBump);
    st.offs.push(() => N.off('player:fall', onFall), () => N.off('bump', onBump));
    function progressOf(p) {
      if (p.isMe) return st.myS;
      const pr = st.prog.get(p.uid) || { s: C.s0, cp: 0 };
      let x = null, y = null;
      if (p.isAI) { const a = ctx.ai.actor(p.uid); if (a) { const e = a.vehicle || a; x = e.x; y = e.y; } }
      else { const q = (N.online && N.online.players ? N.online.players() : []).find((o) => o.key === p.uid); if (q && isFinite(q.x)) { x = q.x; y = q.y; } }
      if (x != null) { const pj = P.project(x, y, pr.s); const cap = pr.cp < n ? cps[pr.cp].s : P.total; if (p.isAI) { while (pr.cp < n && hyp(cps[pr.cp].x - x, cps[pr.cp].y - y) < cps[pr.cp].r + 4) pr.cp++; } pr.s = Math.max(pr.cp > 0 ? cps[pr.cp - 1].s : 0, Math.min(pj.s, p.isAI ? P.total : cap)); }
      st.prog.set(p.uid, pr);
      return pr.s;
    }
    function board() {
      const res = ctx.results();
      const rows = ctx.players.map((p, i) => { const r = res.find((q) => q.uid === p.uid) || {}; return { p, i, s: progressOf(p), t: r.timeMs, dnf: !!r.dnf, left: ctx.left(p.uid) }; });
      rows.sort((a, b) => ((a.left || a.dnf) - (b.left || b.dnf)) || ((a.t == null) - (b.t == null)) || (a.t != null && b.t != null ? a.t - b.t : b.s - a.s));
      const cpOf = (s) => Math.min(n - 1, cps.filter((c) => c.s <= s + 1).length);
      ctx.board(rows.map((r) => ({ name: r.p.isMe ? 'You' : r.p.nick, me: r.p.isMe, color: color(r.i), out: r.left || r.dnf, sub: r.left ? 'left' : r.dnf ? 'DNF' : r.t != null ? fmt(r.t) : (n > 1 ? 'CP ' + cpOf(r.s) + '/' + (n - 1) : '…') })));
      const myRow = rows.findIndex((r) => r.p.isMe);
      // AI banter when they overtake me (now and then)
      if (ctx.mode === 'solo' && st.lastPlace != null && myRow > st.lastPlace) {
        const by = rows[myRow - 1];
        if (by && by.p.isAI && !(st.passT[by.p.uid] > ctx.now() - 9000)) { st.passT[by.p.uid] = ctx.now(); const f = ctx.ai.friend(by.p.uid); if (f) ctx.ai.bark(by.p.uid, f.pass[Math.floor(ctx.ai.rng.next() * f.pass.length)], 2); }
      }
      st.lastPlace = myRow;
      return rows;
    }
    function finish(ms) {
      st.done = true;
      const res = ctx.results().filter((r) => r.timeMs != null && !r.dnf);
      const place = res.filter((r) => r.timeMs < ms).length + 1;
      // the feedback first: when I am the last one in, report() ends the session at once (and clears the HUD)
      sfx('crowd_cheer');
      try { N.hud.banner('FINISHED!', ord(place) + ' · ' + fmt(ms), 2600, { kind: 'pass' }); } catch (e) { /* ignore */ }
      ctx.objective('Finished ' + ord(place) + '! Waiting for the others…');
      ctx.send('cp', { i: n, t: ms });
      ctx.report({ timeMs: ms, progress: 1 });
      if (C.lb) submit(C.lb, ms, st.vtype).then((r) => { if (r && r.pb) ctx.toast('New personal best: ' + fmt(r.best) + (r.rank ? ' · city rank #' + r.rank : '') + '!', 3200); }).catch(() => {});
    }
    const h = {
      update(dt) {
        const t = ctx.elapsed();
        const p = N.player, e = (p && (p.vehicle || p)) || null;
        if (t < 0) { ctx.status('Get ready…'); if ((st.boardT -= dt) <= 0) { st.boardT = 0.5; board(); } return; }
        if (!st.done) ctx.timer(t);
        if (!st.goSeen) { st.goSeen = true; ctx.status(''); }
        // my checkpoints
        if (!st.done && e) {
          const onWrong = C.foot && p.vehicle;
          if (onWrong) { if ((st.warnT -= dt) <= 0) { st.warnT = 3; ctx.toast('On foot only! Get off and run.', 1800); } }
          const pj = P.project(e.x, e.y, st.myS);
          st.myS = Math.max(st.next > 0 ? cps[st.next - 1].s : 0, Math.min(pj.s, cps[st.next].s));
          const c = cps[st.next];
          if (!onWrong && hyp(e.x - c.x, e.y - c.y) <= c.r) {
            st.next++;
            if (st.next >= n) finish(t);
            else { sfx('objective'); ctx.send('cp', { i: st.next, t }); ctx.toast('Checkpoint ' + st.next + '/' + (n - 1), 1100); }
            paint();
          }
          if (!st.done && (st.objT -= dt) <= 0) { st.objT = 0.5; ctx.objective(C.name + ': ' + (st.next >= n - 1 ? 'to the FINISH!' : 'checkpoint ' + (st.next + 1) + ' of ' + (n - 1))); }
          // fell off / lost the cycle: walk back to it, or a kind uncle lends one
          if (!C.foot && !p.vehicle && !st.done) {
            st.footT += dt;
            const bike = st.bike && st.bike.alive && !st.bike.driver ? st.bike : null;
            const dB = bike ? hyp(bike.x - p.x, bike.y - p.y) : Infinity;
            if (st.footT > 1.5 && (st.warnT -= dt) <= 0) { st.warnT = 4; if (dB < 140) ctx.toast('Your cycle is right there: ride it (E)!', 1800); }
            if (st.footT > 9 && dB > 140 && st.vtype) {
              const f = N.world.findFree(p.x + 10, p.y, 'drive', 10);
              const v = f && N.vehicles.spawn(st.vtype, f.x, f.y, p.angle || 0, {});
              if (v) { v.partyOwned = true; st.bike = v; st.lent++; st.footT = 0; ctx.toast('A kind uncle lends you his cycle. Go go go!', 2400); }
            }
          } else st.footT = 0;
        }
        // AI checkpoint progress + finishing window
        if ((st.boardT -= dt) <= 0) { st.boardT = 0.3; board(); }
        const res = ctx.results();
        const first = res.filter((r) => r.timeMs != null && !r.dnf).reduce((m, r) => Math.min(m, r.timeMs), Infinity);
        if (isFinite(first)) {
          const win = Math.max(30000, first * 0.6);
          if (!st.finWin) { st.finWin = first + win; if (!st.done) ctx.status('Hurry! ' + Math.round(win / 1000) + ' s after the winner'); }
          const left = st.finWin - t;
          if (!st.done && left < 15000 && left > 0) ctx.status('Hurry! ' + Math.ceil(left / 1000) + ' s left');
          if (t > st.finWin) {
            if (!st.done && ctx.mode === 'party') { st.done = true; st.dnf = true; ctx.objective(null); ctx.report({ dnf: true, progress: st.myS / P.total, note: 'CP ' + st.next + '/' + (n - 1) }); }
            // AI still riding: estimate their time from their pace
            if (ctx.mode === 'solo' && st.done) for (const pl of ctx.players) {
              if (!pl.isAI || res.some((r) => r.uid === pl.uid)) continue;
              const s = progressOf(pl), pace = Math.max(0.3, s - C.s0) / Math.max(1, t);
              ctx.ai.report(pl.uid, { timeMs: Math.round(t + (P.total - s) / pace), progress: s / P.total, note: 'estimated' });
            }
          }
        }
      },
      end() {
        for (const f of st.offs) { try { f(); } catch (e) { /* ignore */ } }
        for (const b of st.aiBlips) { try { N.hud.unblip(b); } catch (e) { /* ignore */ } }
        ctx.objective(null); ctx.timer(null);
      },
      st, // tests
    };
    return h;
  }

  /* ================================================================ activity: cycle races */
  function cycleRace(R) {
    return {
      name: R.name, icon: '🚲', where: R.where, spots: [{ x: R.pts[0][0], y: R.pts[0][1], r: 60, name: R.from }], kind: 'race', players: { min: 2, max: 10 }, solo: true, ai: 3, timeLimit: 600,
      token: { id: 'party_cycle_race', name: 'Cycle race pennant', desc: 'First cycle race won' },
      label: 'Start ' + R.name,
      describe() { const d = routeData(R.id); return R.from + ' → ' + R.to + (d ? ' · ' + d.km.toFixed(1) + ' km · ' + (d.cps.length - 1) + ' checkpoints' : '') + ' · ' + bestLine(R.id); },
      start(ctx) {
        const d = routeData(R.id);
        if (!d) { ctx.toast('No road for this race on this map.'); ctx.end({ line: 'No road!' }); return {}; }
        return raceRun(ctx, { lb: R.id, P: d.P, s0: d.s0, cps: d.cps, foot: false, name: R.name });
      },
    };
  }
  for (const R of ROUTES) N.party.register('race_' + R.id.replace(/_loop$/, ''), cycleRace(R));

  /* ---------------------------------------------------------------- pin race (custom route) */
  // a pin's name: the nearest notable place (junction, landmark, market, park, cinema, café...) within 320 u, else the
  // nearest place at all within 400 u
  const NOTABLE = /^(junction|landmark|market|park|plaza|cinema|irani_cafe|temple|mosque|church|playground|transport|museum|bridge|food|district)$/;
  function placeName(x, y) {
    let best = null, bd = Infinity, nb = null, nd = Infinity;
    for (const id in N.places) {
      const p = N.places[id];
      if (!p || p.virtual || /^(hide_|giver_|bus_stop_|std_|kirana_|stationery_|medical_)/.test(id) || p.level) continue;
      const d = hyp(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
      if (NOTABLE.test(p.kind || '') && d < nd) { nd = d; nb = p; }
    }
    const pick = nb && nd < 320 ? nb : best && bd < 400 ? best : null;
    return pick ? String(pick.name).replace(/\s*\(.*\)$/, '') : 'a spot on the map';
  }
  function customData(o) {
    if (!o || !o.a || !o.b || !isFinite(o.a.x) || !isFinite(o.b.x)) return null;
    const key = 'pin:' + Math.round(o.a.x / 40) + ',' + Math.round(o.a.y / 40) + '-' + Math.round(o.b.x / 40) + ',' + Math.round(o.b.y / 40);
    if (RC.has(key)) return RC.get(key);
    const raw = pathFor([o.a, o.b]);
    if (!raw) return null;
    const P = mkPath(raw);
    if (P.total < 300) return null;
    const s0 = Math.min(80, P.total * 0.08);
    const d = { id: key, P, s0, cps: checkpoints(P, s0, 400, 40), km: (P.total - s0) * 1.6 / 1000 };
    RC.set(key, d);
    return d;
  }
  /** drop a START and a FINISH pin on the map (right-click / long-press = the map's waypoint) -> {a, b, from, to} | null */
  const PIN = { view: null };
  function pinRace(o) {
    o = o || {};
    return new Promise((resolve) => {
      const M = N.menus;
      if (!M || !M.openMap || !M.waypoint) { resolve(null); return; }
      const pins = {};
      let which = o.startHere ? 'b' : 'a', timer = null, prevWp = null, opened = false;
      if (o.startHere && N.player) { const e = N.player.vehicle || N.player; pins.a = { x: Math.round(e.x), y: Math.round(e.y) }; }
      // the instruction bar sits on the map overlay itself (HUD toasts are under the full-screen map)
      let bar = null;
      const say = (t) => {
        try {
          if (!bar) { bar = document.createElement('div'); bar.className = 'pt-pinbar'; bar.setAttribute('role', 'status'); (document.getElementById('overlay') || document.body).appendChild(bar); }
          bar.textContent = t;
        } catch (e) { /* ignore */ }
      };
      const touch = N.input && N.input.device === 'touch';
      const how = touch ? 'long-press' : 'right-click';
      const done = (v) => { clearInterval(timer); timer = null; if (bar) { bar.remove(); bar = null; } try { if (M.removeMapLayer) M.removeMapLayer('pinrace'); } catch (e) { /* ignore */ } resolve(v); };
      try {
        if (M.addMapLayer) M.addMapLayer({ id: 'pinrace', title: 'Pin race', order: 5, color: '#ff5fb0', draw: (g, view) => { PIN.view = view; }, points: () => ['a', 'b'].filter((k) => pins[k]).map((k) => ({ x: pins[k].x, y: pins[k].y, icon: k === 'a' ? 'ring' : 'star', color: k === 'a' ? '#6fff6a' : '#f2c230', label: k === 'a' ? 'START' : 'FINISH', id: 'pin_' + k })) });
      } catch (e) { /* ignore */ }
      const e0 = N.player.vehicle || N.player;
      try { prevWp = M.waypointPos; M.openMap({ x: e0.x, y: e0.y, zoom: 0.4 }); opened = true; } catch (e) { done(null); return; }
      say('📍 Pin race: ' + how + ' the map to drop the ' + (which === 'a' ? 'START' : 'FINISH') + ' pin');
      let wasMap = false;
      timer = setInterval(() => {
        const wp = M.waypointPos;
        const mapOpen = N.state.mode === 'map' || N.state.has && N.state.has('map');
        if (mapOpen) wasMap = true;
        if (wp && (!prevWp || hyp(wp.x - prevWp.x, wp.y - prevWp.y) > 1)) {
          pins[which] = { x: Math.round(wp.x), y: Math.round(wp.y) };
          prevWp = null;
          try { M.waypoint(null); } catch (e) { /* ignore */ }
          sfx('ui_select');
          if (which === 'a') { which = 'b'; say('📍 START pin dropped. Now ' + how + ' for the FINISH pin'); }
          else {
            try { M.closeMap(); } catch (e) { /* ignore */ }
            const d = customData({ a: pins.a, b: pins.b });
            if (!d) { N.hud.toast('No good road between those pins (too short or no road). Try again!', 3200); done(null); return; }
            if (d.P.total > 9000) { N.hud.toast('That is too far for a cycle race. Pick closer pins!', 3200); done(null); return; }
            done({ a: pins.a, b: pins.b, from: placeName(pins.a.x, pins.a.y), to: placeName(pins.b.x, pins.b.y) });
          }
          return;
        }
        if (opened && wasMap && !mapOpen) { N.hud.toast('Pin race cancelled.', 1800); done(null); }
      }, 120);
    });
  }
  N.party.register('race_custom', {
    name: 'Pin race', icon: '📍', where: null, also: ['cycle_rent_1', 'cycle_rent_2', 'cycle_rent_3', 'cycle_rent_5'], kind: 'race', players: { min: 2, max: 10 }, solo: true, ai: 3, timeLimit: 600,
    token: { id: 'party_cycle_race', name: 'Cycle race pennant', desc: 'First cycle race won' },
    label: 'Pin race (your own route)',
    describe(o) { if (o && o.a && o.b) { const d = customData(o); return (o.from || 'Start') + ' → ' + (o.to || 'Finish') + (d ? ' · ' + d.km.toFixed(1) + ' km' : ''); } return 'Drop a START and a FINISH pin on the map; the race follows the roads.'; },
    setup(o) { if (o && o.a && o.b) return Promise.resolve(o); return pinRace(); },
    start(ctx) {
      const d = customData(ctx.opts);
      if (!d) { ctx.toast('That pin race has no road route.'); ctx.end({ line: 'No road route between the pins.' }); return {}; }
      return raceRun(ctx, { lb: null, localKey: d.id, P: d.P, s0: d.s0, cps: d.cps, foot: false, name: 'Pin race' });
    },
  });

  /* ================================================================ foot race: Birla Mandir steps */
  let birlaCache = null;
  function birlaData() {
    if (birlaCache) return birlaCache;
    if (!N.world || !N.world.built) return null;
    const lead = pathFor([BIRLA.start, BIRLA.foot], { walk: true }) || [{ x: BIRLA.start[0], y: BIRLA.start[1] }];
    const pts = lead.concat(BIRLA.steps.map((p) => ({ x: p[0], y: p[1] })), [{ x: BIRLA.gate[0], y: BIRLA.gate[1] }]);
    const P = mkPath(pts);
    const sFoot = P.project(BIRLA.foot[0], BIRLA.foot[1]).s, sMid = P.project(8423, 4376).s;
    const s0 = Math.min(40, P.total * 0.08);
    const mk = (s, r, fin) => { const q = P.at(s); return { x: q.x, y: q.y, s, a: q.a, r, finish: !!fin }; };
    const cps = [mk((s0 + sFoot) / 2, 20), mk(sFoot, 16), mk(sMid, 14), mk(P.total, 16, true)].map((c, i) => Object.assign(c, { i }));
    birlaCache = { P, s0, cps, sFoot };
    return birlaCache;
  }
  N.on('world:built', () => { birlaCache = null; });
  N.party.register('race_birla_steps', {
    name: 'Birla Mandir steps race', icon: '🏃', where: 'birla_mandir', spots: [{ x: BIRLA.start[0], y: BIRLA.start[1], r: 46, name: 'Hill Fort Road corner' }], kind: 'race', players: { min: 2, max: 8 }, solo: true, ai: 3, timeLimit: 240,
    token: { id: 'party_foot_race', name: 'Running shoe lace', desc: 'First foot race won' },
    describe() { return 'Up Naubat Pahad to the Birla Mandir gate. Run the lanes, but WALK on the temple steps (Mandir rules). On foot only. · ' + bestLine('birla_steps'); },
    start(ctx) {
      const d = birlaData();
      if (!d) { ctx.end({ line: 'No path.' }); return {}; }
      const P = d.P;
      return raceRun(ctx, {
        lb: 'birla_steps', P, s0: d.s0, cps: d.cps, foot: true, name: 'Steps race',
        aiSpeed: (uid) => 64 + 16 * ctx.ai.skill(uid),
        aiWalk: (uid) => {
          const out = [];
          for (let s = d.s0 + 30; s < P.total; s += 40) { const q = P.at(s); out.push({ x: q.x, y: q.y, speed: s > d.sFoot - 8 ? 43 + 2 * ctx.ai.skill(uid) : null, r: 5 }); }
          out.push({ x: P.pts[P.pts.length - 1].x, y: P.pts[P.pts.length - 1].y, speed: 44, r: 4 });
          return out;
        },
      });
    },
  });

  /* ================================================================ foot race: the chai run */
  function chaiData() {
    const cafe = N.places && N.places[CHAI_CAFE];
    if (!cafe || !N.world || !N.world.built) return null;
    let cx = cafe.x, cy = cafe.y;
    try { const f = N.world.findFree(cx, cy, 'walk', 6); if (f) { cx = f.x; cy = f.y; } } catch (e) { /* ignore */ }
    const to = pathFor([[COLONY_GATE.x, COLONY_GATE.y], [cx, cy]], { walk: true });
    const pts = [{ x: COLONY_GATE.x, y: COLONY_GATE.y }].concat(to || [], [{ x: cx, y: cy }]);
    const P = mkPath(pts);
    return { P, cafe: { x: cx, y: cy, name: cafe.name }, gate: COLONY_GATE };
  }
  N.party.register('chai_run', {
    name: 'The chai run', icon: '☕', where: CHAI_CAFE, spots: [{ x: COLONY_GATE.x, y: COLONY_GATE.y, r: 40, name: COLONY_GATE.name }], kind: 'race', players: { min: 2, max: 6 }, solo: true, ai: 3, timeLimit: 300,
    token: { id: 'party_chai_run', name: 'Cutting chai glass', desc: 'First chai run won, not a drop spilled' },
    describe() { return 'Colony gate → Café Gulistan: "Ek cutting!" → back to the gate without spilling. Running spills, and every 10% spilled costs 0.8 s. · ' + bestLine('chai_run'); },
    // the fastest wins, but spilled chai costs time: +0.08 s for every 1% spilled
    rank(rows) {
      const adj = (r) => (r.dnf || r.left || !r.reported || r.timeMs == null ? Infinity : r.timeMs + (100 - (r.score == null ? 100 : r.score)) * CHAI_PENALTY);
      return rows.slice().sort((a, b) => adj(a) - adj(b) || (b.score || 0) - (a.score || 0));
    },
    start(ctx) { return chaiRun(ctx); },
  });
  function chaiRun(ctx) {
    const D = chaiData();
    if (!D) { ctx.end({ line: 'No café on this map.' }); return {}; }
    const P = D.P, me = ctx.me;
    const st = { phase: 'to', chai: 0, pourT: 0, done: false, offs: [], spillT: 0, warnT: 0, boardT: 0, glasses: 0, prog: new Map(), aiBlips: [] };
    const color = (i) => COLORS[i % COLORS.length];
    const slotOf = (i) => { const q = P.at(0); const row = Math.floor(i / 2), side = i % 2 ? 1 : -1; let x = q.x - Math.cos(q.a) * (4 + row * 9) - Math.sin(q.a) * 5 * side, y = q.y - Math.sin(q.a) * (4 + row * 9) + Math.cos(q.a) * 5 * side; const f = N.world.findFree(x, y, 'walk', 6); if (f) { x = f.x; y = f.y; } return { x, y, a: q.a }; };
    const my = slotOf(ctx.slot);
    ctx.place(my.x, my.y, my.a, { vehicle: null });
    const mark = () => {
      ctx.marker('cafe', { x: D.cafe.x, y: D.cafe.y, r: 20, color: '#2a8c82', kind: 'goal', label: 'Café', state: st.phase === 'to' || st.phase === 'pour' ? 'next' : 'later', route: true });
      ctx.marker('gate', { x: D.gate.x, y: D.gate.y, r: 24, color: '#f2c230', kind: 'finish', angle: P.at(0).a, label: 'Gate', state: st.phase === 'carry' ? 'next' : st.phase === 'done' ? 'done' : 'later', route: true });
    };
    mark();
    // the AI friends: run to the café, wait for the pour, carry it back at their own pace
    for (const p of ctx.players.filter((q) => q.isAI)) {
      const i = ctx.players.indexOf(p), q = slotOf(i);
      const a = ctx.ai.spawn(p.uid, q.x, q.y, { angle: q.a });
      if (!a) { ctx.ai.report(p.uid, { dnf: true }); continue; }
      try { N.hud.blip('pt:ai:' + p.uid, a, { color: color(i), icon: 'dot', label: p.nick, size: 3 }); st.aiBlips.push('pt:ai:' + p.uid); } catch (e) { /* ignore */ }
      const sk = ctx.ai.skill(p.uid), rng = ctx.ai.rng, f = ctx.ai.friend(p.uid);
      // careful ones walk it back (no spill), a hurried one jogs (the same 3% a second the player loses jogging)
      const hurry = rng.next() < 0.35 + 0.2 * (1 - sk);
      const runV = 62 + 16 * sk, carryV = hurry ? 49 + 2 * rng.next() : 43 + 2 * sk;
      const there = [], back = [];
      for (let s = 40; s < P.total - 10; s += 45) { const r = P.at(s); there.push({ x: r.x, y: r.y, speed: runV, r: 6 }); }
      const pour = 1200 + rng.next() * 1300;
      there.push({ x: D.cafe.x, y: D.cafe.y, speed: runV * 0.8, r: 5, wait: pour, onArrive: () => { st.prog.set(p.uid, { phase: 'carry', t: ctx.elapsed() }); if (f) ctx.ai.bark(p.uid, 'Ek cutting, anna!', 2); } });
      for (let s = P.total - 45; s > 4; s -= 45) { const r = P.at(s); back.push({ x: r.x, y: r.y, speed: carryV, r: 6 }); }
      back.push({ x: D.gate.x, y: D.gate.y, speed: carryV, r: 6 });
      st.prog.set(p.uid, { phase: 'to' });
      ctx.ai.walk(p.uid, there.concat(back), { run: true, onDone: () => {
        const pr = st.prog.get(p.uid) || {};
        const tc = (ctx.elapsed() - (pr.t || 0)) / 1000;
        let chai = 100 - (carryV > 47 ? 3 * tc : 0) - (rng.next() < 0.2 ? 16 : 0);
        chai = Math.round(clamp(chai, CHAI_MIN + 10, 100));
        st.prog.set(p.uid, { phase: 'done' });
        ctx.ai.report(p.uid, { timeMs: ctx.elapsed(), score: chai, note: chai + '% chai' + (chai < 100 ? ' (+' + ((100 - chai) * CHAI_PENALTY / 1000).toFixed(1) + ' s)' : '') });
        if (f) ctx.ai.bark(p.uid, chai > 90 ? 'Not one drop!' : 'Arre, some spilled. Still chai!', 2.4);
      } });
    }
    st.offs.push(ctx.on('cp', (d, from) => { if (d && typeof d.ph === 'string') st.prog.set(from.uid, { phase: d.ph === 'carry' ? 'carry' : d.ph === 'done' ? 'done' : 'to' }); }));
    const spill = (n, why) => {
      if (st.phase !== 'carry' || n <= 0) return;
      const was = st.chai;
      st.chai = Math.max(0, st.chai - n);
      if (was > 0 && st.chai <= 0) { st.phase = 'to'; mark(); sfx('splash'); ctx.toast('Spilled! Back to the café for another cutting.', 2600); ctx.send('cp', { ph: 'to' }); }
      else if (n >= 8) { sfx('cup_clink'); ctx.toast(why, 1200); }
    };
    const onBump = (d) => { if (d && (d.a === N.player || d.b === N.player || d.ped === N.player) && d.speed > 30) spill(10, 'Careful! Bumped — chai sloshes.'); };
    const onStumble = () => spill(16, 'Pothole! Chai sloshes.');
    const onFall = () => spill(100, 'Fell!');
    const onEnter = () => { if (st.phase === 'carry') spill(100, 'No cycles in the chai run!'); else ctx.toast('On foot only, beta!', 1600); };
    N.on('bump', onBump); N.on('player:stumble', onStumble); N.on('player:fall', onFall); N.on('player:enterVehicle', onEnter);
    st.offs.push(() => N.off('bump', onBump), () => N.off('player:stumble', onStumble), () => N.off('player:fall', onFall), () => N.off('player:enterVehicle', onEnter));
    const meter = () => { const n = Math.round(st.chai / 10); return '☕ ' + '▮'.repeat(n) + '▯'.repeat(10 - n) + ' ' + Math.round(st.chai) + '%'; };
    function pourNow() {
      if (st.phase !== 'to') return;
      st.phase = 'pour'; st.pourT = 1.2;
      N.player.controlsLocked = true;
      sfx('cup_clink');
      ctx.toast('"Ek cutting, anna!" The waiter pours…', 1400);
    }
    function board() {
      const res = ctx.results();
      const ph = (p) => { if (p.isMe) return st.phase === 'done' ? 3 : st.phase === 'carry' ? 2 : 1; const r = res.find((q) => q.uid === p.uid); if (r && r.timeMs != null) return 3; const pr = st.prog.get(p.uid); return pr && pr.phase === 'carry' ? 2 : 1; };
      const rows = ctx.players.map((p, i) => ({ p, i, ph: ph(p), r: res.find((q) => q.uid === p.uid) }));
      rows.sort((a, b) => b.ph - a.ph || ((a.r && a.r.timeMs) || 9e9) - ((b.r && b.r.timeMs) || 9e9));
      ctx.board(rows.map((r) => ({ name: r.p.isMe ? 'You' : r.p.nick, me: r.p.isMe, color: color(r.i), out: ctx.left(r.p.uid), sub: r.r && r.r.timeMs != null ? fmt(r.r.timeMs) : r.ph === 2 ? '☕ back' : 'to café' })));
    }
    return {
      update(dt) {
        const t = ctx.elapsed(), p = N.player;
        if ((st.boardT -= dt) <= 0) { st.boardT = 0.3; board(); }
        if (t < 0 || !p) { ctx.status('Get ready… (no running with chai!)'); return; }
        if (!st.done) ctx.timer(t);
        const e = p.vehicle || p;
        if (st.phase === 'to') {
          ctx.status('Run to ' + D.cafe.name + '!');
          ctx.objective('Chai run: get a cutting chai at ' + D.cafe.name);
          if (!p.vehicle && hyp(e.x - D.cafe.x, e.y - D.cafe.y) < 24) N.interact.offer({ label: 'Ek cutting chai! ☕', priority: 9, dist: 0, use: pourNow });
        } else if (st.phase === 'pour') {
          st.pourT -= dt;
          ctx.status('The waiter pours…');
          if (st.pourT <= 0) { st.phase = 'carry'; st.chai = 100; st.glasses++; N.player.controlsLocked = false; mark(); ctx.send('cp', { ph: 'carry' }); ctx.toast('Got it! Now WALK it back to the gate. Running spills!', 2400); }
        } else if (st.phase === 'carry') {
          const sp = Math.hypot(p.vx || 0, p.vy || 0);
          if (p.vehicle) spill(100, 'No cycles!');
          else if (p.running && sp > 52) { spill(15 * dt, ''); if ((st.spillT -= dt) <= 0) { st.spillT = 1.6; ctx.toast('Running! The chai is spilling!', 1200); } }
          else if (sp > 47) spill(3 * dt, '');
          ctx.status(meter());
          ctx.objective('Chai run: carry it to the colony gate (' + Math.round(st.chai) + '% left)');
          if (st.phase === 'carry' && hyp(e.x - D.gate.x, e.y - D.gate.y) < 24) {
            if (st.chai >= CHAI_MIN) {
              st.phase = 'done'; st.done = true; mark();
              const score = Math.round(st.chai);
              sfx('crowd_cheer');
              try { N.hud.banner('CHAI DELIVERED!', fmt(t) + ' · ' + score + '% left', 2600, { kind: 'pass' }); } catch (er) { /* ignore */ }
              ctx.objective('Delivered! Waiting for the others…');
              ctx.send('cp', { ph: 'done' });
              ctx.report({ timeMs: t, score, note: score + '% chai' + (score < 100 ? ' (+' + ((100 - score) * CHAI_PENALTY / 1000).toFixed(1) + ' s)' : '') + (st.glasses > 1 ? ' · ' + st.glasses + ' glasses' : '') });
              if (score >= 50) submit('chai_run', t, null).then((r) => { if (r && r.pb) ctx.toast('New personal best: ' + fmt(r.best) + '!', 3000); }).catch(() => {});
            } else if ((st.warnT -= dt) <= 0) { st.warnT = 3; ctx.toast('Less than ' + CHAI_MIN + '% left! Back to the café for another.', 2400); }
          }
        }
        // the window after the winner
        const res = ctx.results(), first = res.filter((r) => r.timeMs != null).reduce((m, r) => Math.min(m, r.timeMs), Infinity);
        if (isFinite(first) && !st.done && ctx.mode === 'party' && t > first + Math.max(30000, first * 0.6)) {
          st.done = true;
          if (st.phase === 'pour' && N.player) N.player.controlsLocked = false;
          ctx.objective(null);
          ctx.report({ dnf: true, score: Math.round(st.chai), note: st.phase === 'carry' ? 'still carrying' : 'no chai yet' });
        }
      },
      end() {
        for (const f of st.offs) { try { f(); } catch (e) { /* ignore */ } }
        for (const b of st.aiBlips) { try { N.hud.unblip(b); } catch (e) { /* ignore */ } }
        if (st.phase === 'pour' && N.player) N.player.controlsLocked = false;
        ctx.objective(null); ctx.timer(null);
      },
      st,
    };
  }

  /* ================================================================ Chitti Chase (treasure hunt) */
  const RIDDLES = {
    charminar: 'Where the four minarets watch the bangles.',
    laad_bazaar: 'A lane that jingles: glass bangles on every wall.',
    mecca_masjid: 'Bricks of holy soil, and a thousand pigeons on the square.',
    gulzar_houz: 'A fountain sits in the middle of the old bazaar crossing.',
    chowmahalla_palace: 'Four palaces for one Nizam. Find the gate.',
    patang_bazaar: 'Manja by the reel, kites by the hundred.',
    nizams_museum: 'Purani Haveli keeps the longest wardrobe in the world.',
    pathergatti: 'Stone arches where the wedding shopping never stops.',
    naya_pul: 'A "new bridge" that is older than your Nanna.',
    salar_jung_museum: 'One man\'s collection: a clock where a little man rings the hour.',
    state_central_library: 'A domed palace full of books by the Musi.',
    high_court: 'Red and white domes where the judges sit, by the river.',
    koti_womens_college: 'The British Resident\'s palace is a college now.',
    gokul_chat: 'Koti\'s longest line is for pani puri.',
    sultan_bazaar: 'Koti\'s bazaar named for a Sultan: bargain here.',
    king_koti: 'The palace where the last Nizam lived.',
    gpo: 'Every letter in the city passes this post office at Abids.',
    irani_cafe_2: 'Grand Hotel at Abids: chai and Osmania since forever.',
    mozamjahi_market: 'A stone market with a clock, famous for fruit and ice cream.',
    nampally_exhibition: 'Every January the whole city comes here for the Numaish.',
    gandhi_statue_assembly: 'Where the laws are made, with Gandhi-ji on the lawn.',
    public_gardens: 'Bagh-e-Aam: the oldest public garden in the city.',
    lb_stadium: 'Floodlights, sixes and the roar of Fateh Maidan.',
    birla_mandir: 'White marble on a hill, and not one bell.',
    birla_planetarium: 'Stars on the ceiling, even at noon.',
    liberty: 'A cinema junction named for freedom.',
    lumbini_park: 'Boats leave for the big Buddha from this park.',
    tank_bund_statues: 'Stone heroes stand in a line along the bund.',
    indira_park: 'Rocks, trees and a garden right behind the bund.',
    secunderabad_clock_tower: 'A clock tower on the other side of the lake.',
    paradise: 'Biryani named after heaven.',
    sandhya_theatre: '70mm and 35mm under one roof at the crossroads.',
    rtc_x_roads: 'Four roads, many cinemas, one big jam.',
    narayanguda_ymca: 'Narayanguda\'s YMCA corner: buffaloes parade here at Sadar.',
    playground_home: 'Where the colony\'s gully cricket never stops.',
    golconda_fateh_darwaza: 'Clap at this gate and the top of the fort hears you.',
    qutb_shahi_tombs: 'Seven kings sleep under round domes.',
    taramati_baradari: 'A singer\'s pavilion on the hill west of Golconda.',
    nehru_zoo: 'Lions, tigers and a toy train.',
    falaknuma_palace: 'A palace shaped like a scorpion, high on a hill.',
    osmania_university: 'Stone arches of the Arts College on the big campus.',
    bapu_ghat: 'Where the river meets Gandhi-ji\'s memorial.',
    abids: 'The circle named after an Armenian shopkeeper.',
    afzalgunj_bridge: 'The bridge between the big library and the hospital.',
  };
  function chitSpot(id) {
    const p = N.places && N.places[id];
    if (!p) return null;
    let x = p.x, y = p.y;
    try { const f = N.world.findFree(x, y, 'walk', 30); if (f) { x = f.x; y = f.y; } } catch (e) { /* ignore */ }
    return { id, x, y, name: String(p.name).replace(/\s*\(.*\)$/, ''), r: 22 };
  }
  /** the host picks 4-6 landmarks near (x, y), chained nearest-first */
  function pickStops(x, y, n, seed) {
    n = clamp(n | 0 || 5, 4, 6);
    const r = U.rng(seed || ((Date.now() / 1000) | 0));
    let pool = Object.keys(RIDDLES).filter((id) => N.places && N.places[id]).map((id) => ({ id, d: hyp(N.places[id].x - x, N.places[id].y - y) }));
    pool.sort((a, b) => a.d - b.d);
    let near = pool.filter((q) => q.d < 2600 && q.d > 60);
    if (near.length < n + 2) near = pool.slice(0, n + 4);
    near = near.slice(0, Math.max(n + 3, 9));
    const pick = [];
    while (pick.length < n && near.length) pick.push(near.splice(Math.floor(r.next() * near.length), 1)[0].id);
    // nearest-neighbour chain from the start
    const out = [];
    let cx = x, cy = y;
    while (pick.length) { let bi = 0, bd = Infinity; pick.forEach((id, i) => { const p = N.places[id], d = hyp(p.x - cx, p.y - cy); if (d < bd) { bd = d; bi = i; } }); const id = pick.splice(bi, 1)[0]; out.push(id); cx = N.places[id].x; cy = N.places[id].y; }
    return out;
  }
  N.party.register('chitti_chase', {
    name: 'Chitti Chase', icon: '📜', where: null, also: ['playground_home', 'charminar_plaza', 'lumbini_park', 'abids'], kind: 'race', players: { min: 2, max: 10 }, solo: true, ai: 3, timeLimit: 900,
    token: { id: 'party_chitti', name: 'Riddle chit', desc: 'First Chitti Chase won' },
    label: 'Start a Chitti Chase',
    options(x, y) { const e = N.player && (N.player.vehicle || N.player); x = isFinite(x) ? x : e ? e.x : 0; y = isFinite(y) ? y : e ? e.y : 0; return { n: 5, start: { x: Math.round(x), y: Math.round(y) }, stops: pickStops(x, y, 5) }; },
    describe(o) { const n = o && o.stops ? o.stops.length : 5; return 'A treasure hunt: ' + n + ' riddle chits hidden at landmarks nearby. Solve, ride, grab the chit, next! First to find them all wins.'; },
    start(ctx) { return chittiRun(ctx); },
  });
  function chittiRun(ctx) {
    const o = ctx.opts || {};
    const stops = (Array.isArray(o.stops) ? o.stops : []).map(chitSpot).filter(Boolean).slice(0, 6);
    if (stops.length < 2 || !o.start) { ctx.toast('No chits to hide here.'); ctx.end({ line: 'No landmarks nearby.' }); return {}; }
    const n = stops.length, me = ctx.me;
    const st = { k: 0, kT: 0, done: false, offs: [], prog: new Map(), boardT: 0, objT: 0, hintLvl: 0, aiBlips: [], warnT: 0 };
    const color = (i) => COLORS[i % COLORS.length];
    const s0 = { x: o.start.x, y: o.start.y };
    try { const f = N.world.findFree(s0.x, s0.y, 'drive', 20); if (f) { s0.x = f.x; s0.y = f.y; } } catch (e) { /* ignore */ }
    const a0 = Math.atan2(stops[0].y - s0.y, stops[0].x - s0.x);
    const my = ctx.grid(s0.x, s0.y, a0, ctx.slot);
    st.bike = ctx.place(my.x, my.y, a0, { vehicle: N.party.cycleFor(me.look, ctx.seed + ctx.slot) });
    const riddle = (k) => '"' + (RIDDLES[stops[k].id] || 'Find ' + stops[k].name) + '"';
    ctx.toast('Chit 1: ' + riddle(0), 5200);
    function paint() {
      const p = N.player, e = p && (p.vehicle || p);
      stops.forEach((s, i) => {
        if (i !== st.k || st.done) { ctx.unmarker('chit' + i); return; }
        const near = e && hyp(e.x - s.x, e.y - s.y) < 170;
        if (near || st.hintLvl >= 2) ctx.marker('chit' + i, { x: s.x, y: s.y, r: 18, color: '#f2c230', kind: 'chit', label: 'Chit ' + (i + 1), state: 'next', route: st.hintLvl >= 2, blip: st.hintLvl >= 2 || near });
        else ctx.unmarker('chit' + i);
      });
      try { if (st.hintLvl === 1 && !st.done) N.hud.searchCircle('pt:hint', { x: stops[st.k].x + 70, y: stops[st.k].y - 50, r: 260, color: '#f2c230' }); else N.hud.searchCircle('pt:hint', null); } catch (e) { /* ignore */ }
    }
    // the AI friends: think about the riddle, then ride there
    const ai = new Map();
    for (const p of ctx.players.filter((q) => q.isAI)) {
      const i = ctx.players.indexOf(p), q = ctx.grid(s0.x, s0.y, a0, i);
      const a = ctx.ai.spawn(p.uid, q.x, q.y, { angle: a0, vehicle: true });
      if (!a) { ctx.ai.report(p.uid, { dnf: true }); continue; }
      try { N.hud.blip('pt:ai:' + p.uid, a, { color: color(i), icon: 'dot', label: p.nick, size: 3 }); st.aiBlips.push('pt:ai:' + p.uid); } catch (e) { /* ignore */ }
      const sk = ctx.ai.skill(p.uid), rng = ctx.ai.rng;
      ai.set(p.uid, { k: 0, think: (ctx.startAt - ctx.now()) / 1000 + 3 + (1 - sk) * 10 + rng.next() * 4, riding: false, sk, rng, f: ctx.ai.friend(p.uid) });
    }
    function aiStep(uid, A, dt) {
      if (A.k >= n || A.riding) return;
      A.think -= dt;
      if (A.think > 0) return;
      const v = ctx.ai.vehicle(uid), act = ctx.ai.actor(uid);
      const e = v || act;
      if (!e) return;
      const tgt = stops[A.k];
      const raw = pathFor([{ x: e.x, y: e.y }, tgt]);
      const path = [{ x: e.x, y: e.y }].concat(raw || [], [{ x: tgt.x, y: tgt.y }]);
      A.riding = true;
      if (A.f && ctx.ai.rng.next() < 0.6) ctx.ai.bark(uid, ['Got it! ' + tgt.name + '!', 'Easy one!', 'Hmm… ' + tgt.name + '? Yes!'][Math.floor(ctx.ai.rng.next() * 3)], 2.2);
      const R = ctx.ai.ride(uid, path, { r: 34, onDone: () => {
        A.riding = false; A.k++;
        st.prog.set(uid, A.k);
        sfx('paper', { x: tgt.x, y: tgt.y, vol: 0.5 });
        if (A.k >= n) { ctx.ai.report(uid, { timeMs: ctx.elapsed(), score: n }); if (A.f) ctx.ai.bark(uid, 'Last chit! Done!', 2.4); }
        else A.think = 3 + (1 - A.sk) * 11 + A.rng.next() * 5;
      } });
      if (!R) { A.riding = false; A.think = 3; }
    }
    st.offs.push(ctx.on('chit', (d, from) => { if (d && isFinite(d.k)) st.prog.set(from.uid, clamp(d.k | 0, 0, n)); }));
    function pick() {
      if (st.done) return;
      const s = stops[st.k];
      sfx('paper');
      st.k++; st.kT = 0; st.hintLvl = 0;
      ctx.send('chit', { k: st.k });
      if (st.k >= n) {
        st.done = true;
        const t = ctx.elapsed();
        try { N.hud.banner('ALL CHITS FOUND!', fmt(t), 2600, { kind: 'pass' }); } catch (e) { /* ignore */ }
        ctx.objective('All chits! Waiting for the others…');
        paint();
        ctx.report({ timeMs: t, score: n });
        return;
      }
      ctx.toast('Chit ' + st.k + ' at ' + s.name + '! Next: ' + riddle(st.k), 5200);
      paint();
    }
    function board() {
      const res = ctx.results();
      const rows = ctx.players.map((p, i) => { const r = res.find((q) => q.uid === p.uid); return { p, i, k: p.isMe ? st.k : st.prog.get(p.uid) || 0, t: r && r.timeMs, dnf: r && r.dnf }; });
      rows.sort((a, b) => (a.dnf - b.dnf) || ((a.t == null) - (b.t == null)) || (a.t != null ? a.t - b.t : b.k - a.k));
      ctx.board(rows.map((r) => ({ name: r.p.isMe ? 'You' : r.p.nick, me: r.p.isMe, color: color(r.i), out: ctx.left(r.p.uid) || r.dnf, sub: r.t != null ? fmt(r.t) : r.k + '/' + n + ' 📜' })));
    }
    return {
      update(dt) {
        const t = ctx.elapsed(), p = N.player, e = p && (p.vehicle || p);
        if ((st.boardT -= dt) <= 0) { st.boardT = 0.35; board(); }
        if (t < 0) { ctx.status('Read the riddle!'); ctx.objective('Chit 1/' + n + ': ' + riddle(0)); return; }
        for (const [uid, A] of ai) aiStep(uid, A, dt);
        if (!st.done && e) {
          ctx.timer(t);
          st.kT += dt;
          if (st.hintLvl < 1 && st.kT > 45) { st.hintLvl = 1; ctx.toast('Psst… it is somewhere in the yellow circle.', 2600); }
          if (st.hintLvl < 2 && st.kT > 90) { st.hintLvl = 2; ctx.toast('Bunty-anna points the way: follow the pink line!', 2600); }
          if ((st.objT -= dt) <= 0) { st.objT = 0.4; paint(); ctx.objective('Chit ' + (st.k + 1) + '/' + n + ': ' + riddle(st.k)); ctx.status('📜 ' + st.k + '/' + n + ' chits' + (st.hintLvl ? ' · hint on the map' : '')); }
          const s = stops[st.k];
          if (hyp(e.x - s.x, e.y - s.y) < s.r + 6) {
            if (p.vehicle) N.interact.offer({ label: 'Grab the chit 📜', priority: 9, dist: 0, use: pick });
            else N.interact.offer({ label: 'Pick up the chit 📜', priority: 9, dist: 0, use: pick });
          }
        }
        const res = ctx.results(), first = res.filter((r) => r.timeMs != null && !r.dnf).reduce((m, r) => Math.min(m, r.timeMs), Infinity);
        if (isFinite(first) && t > first + Math.max(45000, first * 0.4)) {
          if (!st.done && ctx.mode === 'party') { st.done = true; ctx.objective(null); paint(); ctx.report({ dnf: true, score: st.k, note: st.k + '/' + n + ' chits' }); }
          if (ctx.mode === 'solo' && st.done) for (const pl of ctx.players) if (pl.isAI && !res.some((r) => r.uid === pl.uid)) { const A = ai.get(pl.uid); ctx.ai.report(pl.uid, { dnf: true, score: A ? A.k : 0, note: (A ? A.k : 0) + '/' + n + ' chits' }); }
        }
      },
      end() {
        for (const f of st.offs) { try { f(); } catch (e) { /* ignore */ } }
        for (const b of st.aiBlips) { try { N.hud.unblip(b); } catch (e) { /* ignore */ } }
        try { N.hud.searchCircle('pt:hint', null); } catch (e) { /* ignore */ }
        ctx.objective(null); ctx.timer(null);
      },
      st, stops,
    };
  }

  /* ================================================================ Journal: Races page */
  function addJournal() {
    if (!N.menus || !N.menus.addJournalTab) return;
    N.menus.addJournalTab({
      id: 'races', title: 'Races', order: 62,
      render(el) {
        const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const list = ROUTES.map((r) => ({ id: r.id, name: r.name, line: r.from + ' → ' + r.to })).concat([{ id: 'birla_steps', name: 'Birla Mandir steps race', line: 'on foot' }, { id: 'chai_run', name: 'The chai run', line: 'without spilling' }]);
        let h = '<div class="jy"><h3 class="nb-title">Races <small>with friends or the gang</small></h3>';
        for (const r of list) {
          const b = LB.best[r.id], t = LB.top[r.id];
          h += '<h4>' + esc(r.name) + '</h4><p class="jl-foot">' + esc(r.line) + ' · ' + (b ? 'your best <b>' + esc(fmt(b.ms)) + '</b>' : 'no time yet') + (t && t.rank ? ' · city rank #' + t.rank : '') + '</p>';
          if (t && t.top && t.top.length) h += '<ol class="jy-list">' + t.top.slice(0, 5).map((q) => '<li>' + esc(q.nick) + ' ' + esc(fmt(q.ms)) + (q.me ? ' (you)' : '') + '</li>').join('') + '</ol>';
          fetchTop(r.id).catch(() => {});
        }
        const w = N.party.stats.wins || {};
        const wins = Object.keys(w).reduce((s, k) => s + (w[k] | 0), 0);
        h += '<p class="jl-foot">Party wins: ' + wins + (online() ? ' · times go to the city leaderboard with your player code.' : ' · go Online (pause menu) to put your times on the city leaderboard.') + '</p></div>';
        el.innerHTML = h;
      },
    });
  }
  N.on('boot', addJournal);
  if (N.menus && N.menus.addJournalTab && N.world && N.world.built) addJournal();

  // the start places: fetch the leaderboard when the player comes near a race start (for the start card)
  let nearT = 0;
  N.addSystem({
    id: 'partyRaces', order: 56, runIn: ['play'],
    update(dt) {
      if ((nearT -= dt) > 0 || !online()) return;
      nearT = 2;
      const e = N.player && (N.player.vehicle || N.player);
      if (!e) return;
      for (const R of ROUTES) if (hyp(R.pts[0][0] - e.x, R.pts[0][1] - e.y) < 300) fetchTop(R.id).catch(() => {});
      if (hyp(BIRLA.start[0] - e.x, BIRLA.start[1] - e.y) < 300) fetchTop('birla_steps').catch(() => {});
      if (hyp(COLONY_GATE.x - e.x, COLONY_GATE.y - e.y) < 300) fetchTop('chai_run').catch(() => {});
    },
  });

  /* ================================================================ API */
  N.partyRaces = {
    ROUTES, RIDDLES, BIRLA, COLONY_GATE,
    route(id) { const d = routeData(id); return d ? { pts: d.P.pts.map((p) => ({ x: p.x, y: p.y })), total: d.P.total, s0: d.s0, cps: d.cps.map((c) => Object.assign({}, c)) } : null; },
    custom(o) { const d = customData(o); return d ? { pts: d.P.pts.map((p) => ({ x: p.x, y: p.y })), total: d.P.total, s0: d.s0, cps: d.cps.map((c) => Object.assign({}, c)) } : null; },
    birla() { const d = birlaData(); return d ? { pts: d.P.pts.map((p) => ({ x: p.x, y: p.y })), total: d.P.total, cps: d.cps.map((c) => Object.assign({}, c)) } : null; },
    chai() { const d = chaiData(); return d ? { pts: d.P.pts.map((p) => ({ x: p.x, y: p.y })), total: d.P.total, cafe: d.cafe, gate: d.gate } : null; },
    pickStops, chitSpot, pathFor, pinRace,
    best: (route) => (LB.best[route] ? LB.best[route].ms : null),
    top: (route) => LB.top[route] || null,
    fetchTop, submit, flushPending,
    get pending() { return LB.pending.slice(); },
    _debug: { LB, routeCache: RC, mapView: () => PIN.view, clearCache() { RC.clear(); birlaCache = null; } },
  };
})();
