/* NOSTALGIA trailer — in-page helper for the two HUD shots (used by hud_shots.cjs; self-contained, no stage.js).
 * The real game with its real HUD (#ui): clock, money, energy, the Chappal Meter, minimap, barks. Chinnu follows a
 * smoothed route along the road graph, driven kinematically (repeatable); the wanted system, pursuers, traffic and
 * cameras are the game's own. CSS animations / transitions (the meter's shake, slipper tilt, money tin) are slaved
 * to the virtual clock, so they play frame by frame instead of finishing between two (slow) captures.
 *   HUDSHOT.setup({money})             show the HUD (debug / touch / toasts / testing stay hidden), believable money
 *   HUDSHOT.prep(id, nf) -> info       place the scene, warm up
 *   HUDSHOT.frame() -> status          one 1/30 s step (+ the shot's per-frame script)
 */
(() => {
  'use strict';
  const N = window.N, U = N.util;
  const FPS = 30;
  const P = (id) => N.places[id] || null;
  const LM = (id) => N.world.data.landmarks.find((l) => l.id === id) || null;

  // view: 'top' | 'tps'.  at: place / landmark id | [x, y].  veh: vehicle type | null (on foot).  spd: u/s.  dir: heading
  const SHOTS = {
    // the Chappal Meter climbs on the beat while Chinnu legs it through Abids; the pursuers are the wanted system's own
    // (staged: each new one is moved to just outside the frame behind him so he/she rides into shot)
    chase: {
      view: 'top', at: 'koti', time: [12, 30], veh: 'cycle', spd: 105, dir: Math.PI, zoom: 1.6,
      // heat keyframes [frame, heat] (level = heat / 100): the next slipper fills from the sole up and lights on the
      // beat (f18: 3 -> 4, f36: 4 -> 5)
      heat: [[0, 340], [18, 400], [36, 500], [71, 560]],
      // where each new pursuer is put (u behind Chinnu on his route, u to the side)
      stage: { back: { pochaiah: 105, havaldar: 70, mummy: 120 }, side: 9 },
      chappalT: 0.15, // Mummy's first homing chappal: wind-up soon after she arrives (the game waits 3 s)
    },
    // 3D third person on the cycle by Charminar, then the real view switch (N.view.set('top')) on the beat
    charminar: { view: 'tps', at: 'charminar_plaza', time: [11, 0], veh: 'cycle', spd: 100, dir: -1.6, zoom: 1.3, switchAt: 36 },
  };
  const OVR = window.HUD_SHOTS_OVERRIDE || {};
  for (const k in OVR) SHOTS[k] = Object.assign({}, SHOTS[k], OVR[k]);

  /* ------------------------------------------------------------ HUD on, debug off */
  const H = (window.HUDSHOT = { SHOTS });
  H.setup = function (o) {
    o = o || {};
    // openGame hides '#ui,#touch,#debug,#overlay,.toast,.bark': drop that, re-hide only the non-HUD bits
    for (const st of Array.from(document.querySelectorAll('style'))) if (/#ui,#touch,#debug,#overlay,\.toast,\.bark/.test(st.textContent)) st.remove();
    const st = document.createElement('style');
    st.id = 'hudshot-style';
    st.textContent = '#debug,#touch,#overlay,#prompt,.hud-toasts,.hud-toast,.toast,.hud-district{display:none!important}' + (o.css || '');
    document.head.appendChild(st);
    document.body.classList.remove('touch-on');
    // testing build: the unlimited-money refill off (directly: the setter toasts + writes localStorage), real pocket money
    if (N.testing) N.testing.unlimitedMoney = false;
    N.player.money = o.money == null ? 1250 : o.money;
    if (N.hud && N.hud.objective) N.hud.objective(null);
    return { money: N.player.money };
  };

  /* ------------------------------------------------------------ CSS animations on the virtual clock */
  const animT0 = new WeakMap();
  function syncAnims() {
    const vt = window.__vt();
    for (const a of document.getAnimations()) {
      let t0 = animT0.get(a);
      if (t0 == null) { t0 = vt; animT0.set(a, t0); try { a.pause(); } catch (e) { /* ignore */ } }
      try { a.currentTime = Math.max(0, vt - t0); } catch (e) { /* ignore */ }
    }
  }
  H.syncAnims = syncAnims;

  /* ------------------------------------------------------------ routes (as gameplay_page.js) */
  function buildPath(x, y, o, len) {
    const R = N.world.roads;
    const n = R.nearestNode(x, y);
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
      for (const l of cur.links) {
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
    void len;
    const pts = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const A = nodes[i], Bn = nodes[i + 1], L = Math.hypot(Bn.x - A.x, Bn.y - A.y), steps = Math.max(1, Math.ceil(L / 4));
      for (let k = 0; k < steps; k++) { const p = N.world.roads.lanePoint(A, Bn, k / steps, 0); pts.push([p.x, p.y]); }
    }
    const last = nodes[nodes.length - 1]; pts.push([last.x, last.y]);
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
  H.at = at;

  /* ------------------------------------------------------------ GL draws off (warm-up frames nobody sees) */
  let drawFn = null;
  function noDraw(on) {
    const r = N.view3d && N.view3d.H && N.view3d.H.renderer;
    if (!r) return;
    if (on && !drawFn) { drawFn = r.render; r.render = function () {}; }
    else if (!on && drawFn) { r.render = drawFn; drawFn = null; }
  }

  let C = null;
  const tmp = { x: 0, y: 0 }, tmp2 = { x: 0, y: 0 };
  H.prep = function (id, nf, opt) {
    const o = Object.assign({}, SHOTS[id], opt || {});
    if (!o.view) throw new Error('no shot ' + id);
    if (N.player.vehicle && N.vehicles.exit) { try { N.vehicles.exit(N.player, true); } catch (e) { /* ok */ } }
    if (N.wanted) { N.wanted.lock(null); N.wanted.set(0, 'clear'); }
    N.render.camOverride = null;
    N.player.hidden = false;
    N.debug.setTime(o.time[0], o.time[1]);
    N.weather.force({ rain: 0, storm: 0, mist: 0 });
    N.weather.wet = 0;
    N.wind.force({ strength: 0.4 });
    const pl = Array.isArray(o.at) ? null : (P(o.at) || LM(o.at));
    let x = pl ? pl.x : o.at[0], y = pl ? pl.y : o.at[1];
    if (o.off) { x += o.off[0]; y += o.off[1]; }
    const warm = o.warm || 75;
    const total = (nf + warm + 90) / FPS * o.spd;
    const path = buildPath(x, y, o, total);
    const start = at(path, 0, { x: 0, y: 0 });
    N.debug.teleport(start.x, start.y);
    let v = null;
    if (o.veh) { v = N.vehicles.spawn(o.veh, start.x, start.y, 0, {}); if (v) N.vehicles.enter(N.player, v); }
    N.view.set(o.view);
    N.render.baseZoom = o.zoom || 1;
    C = { id, o, path, v, d: 0, f: 0, warm: true, log: [] };
    if (o.heat) N.wanted.set(Math.floor(o.heat[0][1] / 100), 'set');
    for (let k = 0; k < 3; k++) if (N.view3d && N.view3d.active) N.view3d.settle(30000);
    noDraw(true);
    try {
      for (let k = 0; k < warm - 6; k++) {
        // (the shot's opening: the pursuers already in pursuit just behind him, a second to settle)
        if (o.heat && k === warm - 36) stageNew(true);
        advance();
      }
    } finally { noDraw(false); }
    for (let k = 0; k < 6; k++) advance();
    if (N.view3d && N.view3d.active) N.view3d.settle(30000);
    if (o.heat) heatTo(o.heat[0][1]);
    C.f = 0; C.warm = false;
    syncAnims();
    return { at: [Math.round(start.x), Math.round(start.y)], len: Math.round(path.len), veh: v ? v.type : null, view: N.view.mode, level: N.wanted.level, money: N.player.money, pursuers: pursuerInfo() };
  };

  function heatAt(K, f) {
    if (f <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) if (f <= K[i][0]) { const a = K[i - 1], b = K[i]; return a[1] + (b[1] - a[1]) * (f - a[0]) / (b[0] - a[0]); }
    return K[K.length - 1][1];
  }
  // the wanted system's own heat (major: past the minor cap), so the HUD fill + the level-ups are the game's
  function heatTo(h) {
    const W = N.wanted, d = h - W.heat;
    if (d > 0.01) W.addHeat(d, 'report', { major: true, force: true });
  }
  function pursuerInfo() {
    const p = N.player;
    return N.wanted.pursuers.map((a) => a.role + (a.mount ? '@' + a.mount.type : '') + ' ' + Math.round(Math.hypot(a.x - p.x, a.y - p.y)) + 'u ' + a.state);
  }
  // move pursuers that are far off (fresh spawns) to just outside the frame, behind Chinnu on his own route
  const staged = new WeakSet();
  function stageNew(all) {
    const S = C.o.stage; if (!S) return;
    const p = N.player;
    let k = 0;
    for (const a of N.wanted.pursuers) {
      if (staged.has(a) || a.state === 'leave' || a.guard) continue;
      staged.add(a);
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      const b0 = typeof S.back === 'number' ? S.back : (S.back[a.role] || 110);
      if (!all && d < b0 * 0.9) continue;
      const back = b0 + k * 6, lat = (k % 2 ? -1 : 1) * (S.side || 0);
      at(C.path, C.d - back, tmp); at(C.path, C.d - back + 6, tmp2);
      const ang = Math.atan2(tmp2.y - tmp.y, tmp2.x - tmp.x);
      const nx = tmp.x - Math.sin(ang) * lat, ny = tmp.y + Math.cos(ang) * lat;
      const m = a.mount;
      if (m && (a.vehicle === m || a.passengerOf === m)) {
        m.x = nx; m.y = ny; m.angle = ang; m.vx = Math.cos(ang) * C.o.spd; m.vy = Math.sin(ang) * C.o.spd; m.speed = C.o.spd;
        if (m.pu) { m.pu.path = null; m.pu.planT = 0; m.pu.cx = nx; m.pu.cy = ny; m.pu.stuck = 0; }
        a.x = nx; a.y = ny; a.angle = ang;
      } else { a.x = nx; a.y = ny; a.angle = ang; a.vx = Math.cos(ang) * 60; a.vy = Math.sin(ang) * 60; }
      a.target = { x: p.x, y: p.y };
      C.log.push((C.warm ? 'w' : C.f) + ' staged ' + a.role + ' from ' + Math.round(d));
      k++;
    }
  }

  function advance() {
    const { o, path, v } = C;
    // per-frame script (only in the shot itself)
    if (!C.warm) {
      if (o.heat) {
        const L0 = N.wanted.level;
        heatTo(heatAt(o.heat, C.f));
        if (N.wanted.level !== L0) {
          C.log.push(C.f + ' level ' + L0 + '->' + N.wanted.level + ' heat ' + Math.round(N.wanted.heat));
          if (N.wanted.level === 5 && o.chappalT != null) N.wanted._W.chappalT = o.chappalT;
        }
      }
      if (o.switchAt === C.f) { N.view.set('top'); C.log.push(C.f + ' view ' + N.view.mode); }
    }
    C.d += o.spd / FPS;
    at(path, C.d, tmp); at(path, C.d + 10, tmp2);
    const ang = Math.atan2(tmp2.y - tmp.y, tmp2.x - tmp.x);
    const vx = Math.cos(ang) * o.spd, vy = Math.sin(ang) * o.spd;
    if (v) {
      v.x = tmp.x - vx / FPS; v.y = tmp.y - vy / FPS; v.angle = ang; v.speed = o.spd; v.vx = vx; v.vy = vy;
      if (v.ctl) { v.ctl.throttle = 1; v.ctl.steer = 0; v.ctl.brake = 0; }
    } else {
      const p = N.player;
      p.x = tmp.x - vx / FPS; p.y = tmp.y - vy / FPS; p.vx = vx; p.vy = vy; p.angle = ang; p.facing = ang; p.running = !!o.run;
    }
    if (o.view === 'tps' && C.f === 0 && C.warm && N.view3d.snapCamera) N.view3d.snapCamera();
    window.__step(1 / FPS);
    if (!C.warm && o.stage) stageNew(false);
    C.f++;
    syncAnims();
  }

  H.frame = function () {
    advance();
    const W = N.wanted, p = N.player;
    return { f: C.f, level: W.level, view: N.view.mode, money: p.money, pos: [Math.round(p.x), Math.round(p.y)], pursuers: pursuerInfo(), chappal: W._W.chappal ? W._W.chappal.ph : null, log: C.log.splice(0) };
  };
})();
