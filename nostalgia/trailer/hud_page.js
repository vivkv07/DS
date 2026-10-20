/* NOSTALGIA trailer — in-page helper for the two HUD shots (used by hud_shots.cjs; self-contained, no stage.js).
 * The real game with its real HUD (#ui): clock, money, energy, the Chappal Meter, minimap, barks. Chinnu follows a
 * smoothed route along the road graph, driven kinematically (repeatable); the wanted system (heat, levels, pursuers
 * and their AI, the homing chappal), traffic, the cameras and the view switch are the game's own. CSS animations /
 * transitions (the meter's shake, the OSD blink) are slaved to the virtual clock, so they play frame by frame
 * instead of finishing between two (slow) captures.
 *   HUDSHOT.setup({money})             show the HUD (debug / touch / toasts / testing stay hidden), believable money
 *   HUDSHOT.prep(id, nf) -> info       place the scene, warm up (frames < 0)
 *   HUDSHOT.frame() -> status          one 1/30 s step (+ the shot's per-frame script)
 */
(() => {
  'use strict';
  const N = window.N, U = N.util;
  const FPS = 30;
  const P = (id) => N.places[id] || null;
  const LM = (id) => N.world.data.landmarks.find((l) => l.id === id) || null;

  // view: 'top' | 'tps'.  at: place / landmark id | [x, y].  veh: vehicle type | null (on foot, run: true = running).
  // spd: u/s (Chinnu runs at 80, the player's own run speed).  dir: preferred heading | toward: landmark id.
  // Frame numbers are shot frames (0 = first captured frame); the warm-up runs frames -warm..-1.
  const SHOTS = {
    // "MIND THE CHAPPAL METER": Chinnu legs it from Koti towards Abids with Havaldar Pochaiah's red Luna on his tail.
    // The Chappal Meter ratchets 3 -> 4 -> 5 in the first beat (the next slipper fills from the sole up, then lights
    // and the meter shakes); at 5 the game calls the police off and sends MUMMY in Yadagiri's auto. She cuts him off
    // from ahead, winds up ("One more step and this chappal flies!", the red target ring under him) and her homing
    // chappal hits: THUP! and the PAKDA GAYA! banner (the game's own busted sequence) on the last beat.
    chase: {
      view: 'top', at: 'koti', time: [12, 30], veh: null, run: true, spd: 80, dir: Math.PI, zoom: 2.2, warm: 90,
      // heat keyframes [frame, heat] (level = floor(heat / 100))
      heat: [[-90, 340], [0, 345], [5, 400], [10, 500], [71, 520]],
      // new pursuers are put on his route: back = u behind him; ahead: 'edge' = just outside the frame ahead of him,
      // facing him, lat u to his right (her own lane); brakeAt: her driver pulls up once that close (she throws
      // from the stopped auto instead of running him over)
      stage: { roles: { pochaiah: { back: 60 }, mummy: { ahead: 'edge', lat: 12, brakeAt: 160 } }, side: 5, at: -40 },
      quiet: true, // pursuers' random shouts off: the lines below + the game's own (dismissal, chappal wind-up)
      barks: [[2, 'pochaiah', '*Ruko!*']], // (his own line from wanted.js)
      barkSecs: { pochaiah: 0.9 }, // his "called off" line clears before Mummy's wind-up line (the game: ~3 s)
      // Mummy's first homing chappal: the game waits 3 s after she arrives, then checks the range (150 u) every
      // 0.5 s; here she winds up the moment she is in range (from this frame on)
      chappalFrom: 10,
      // called off at level 5, Pochaiah would U-turn his Luna into the road: he pulls over to the kerb instead
      // ("Luna, you have betrayed me.")
      pullOver: { role: 'pochaiah', ahead: 30, kerb: 6 },
      // (and he stays on the Luna: the game has him hop off to run when Chinnu is within 70 u on foot and the Luna
      // slows below 40 u/s, e.g. at a bend)
      tune: { lunaDismount: 0 },
      difficulty: 'hard', // the game's "Full Meter" difficulty: Mummy is faster (pursuerSpeed 1.1) and sees further
      clear: 9, // traffic parked / stopped on his line is cleared before the shot (he is driven, not physical)
    },
    // "PLAY IN 3D OR TOP-DOWN": 3D third person on the cycle down Pathergatti towards Charminar, then the game's
    // real view switch (N.view.set('top'), instant: the game has no transition) on the beat, same moment, same place
    charminar: { view: 'tps', at: 'pathergatti', off: [0, -170], toward: 'charminar', time: [11, 0], veh: 'cycle', spd: 92, zoom: 1.3, warm: 60, switchAt: 36 },
  };
  const OVR = window.HUD_SHOTS_OVERRIDE || {};
  for (const k in OVR) SHOTS[k] = Object.assign({}, SHOTS[k], OVR[k]);

  /* ------------------------------------------------------------ HUD on, debug off */
  const H = (window.HUDSHOT = { SHOTS });
  H.setup = function (o) {
    o = o || {};
    // openGame hides '#ui,#touch,#debug,#overlay,.toast,.bark': drop that, re-hide only what is not the HUD:
    // debug overlay, touch controls, menus/dialogue layer, key prompt, toasts (incl. "Testing build: unlimited
    // pocket money"), the district card (a real-time setTimeout: it would flicker in/out between slow captures)
    for (const st of Array.from(document.querySelectorAll('style'))) if (/#ui,#touch,#debug,#overlay,\.toast,\.bark/.test(st.textContent)) st.remove();
    const st = document.createElement('style');
    st.id = 'hudshot-style';
    st.textContent = '#debug,#touch,#overlay,#prompt,.hud-toasts,.hud-toast,.toast,.hud-district{display:none!important}' + (o.css || '');
    document.head.appendChild(st);
    document.body.classList.remove('touch-on');
    // testing build: the unlimited-money refill off (directly: its setter toasts + writes localStorage), real pocket money
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

  // repeatable shots: a seeded Math.random from prep on (pursuer barks / spawn spots, traffic)
  function seed(s) {
    let a = s >>> 0;
    Math.random = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* ------------------------------------------------------------ routes (as gameplay_page.js) */
  function buildPath(x, y, o, len) {
    const R = N.world.roads;
    const n = R.nearestNode(x, y);
    if (o.toward) {
      const L = LM(o.toward) || P(o.toward);
      const r = R.route(n, R.nearestNode(L.x, L.y), { walk: !o.veh });
      if (r && r.length > 1) return polyFromNodes(r);
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
    return polyFromNodes(nodes);
  }
  function polyFromNodes(nodes) {
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
    seed(o.seed || 20031);
    if (N.settings && N.settings.set) N.settings.set('difficulty', o.difficulty || 'normal');
    if (o.tune) Object.assign(N.wanted.TUNE, o.tune);
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
    const path = buildPath(x, y, o, (nf + warm + 90) / FPS * o.spd);
    // toward a landmark: start far enough up the route that the shot ends near it
    const need = (nf + warm) / FPS * o.spd;
    const d0 = o.toward ? Math.max(0, path.len - need - (o.endGap || 20)) : 0;
    const start = at(path, d0, { x: 0, y: 0 });
    N.debug.teleport(start.x, start.y);
    let v = null;
    if (o.veh) { v = N.vehicles.spawn(o.veh, start.x, start.y, 0, {}); if (v) N.vehicles.enter(N.player, v); }
    N.view.set(o.view);
    N.render.baseZoom = o.zoom || 1;
    C = { id, o, path, v, d: d0, f: -warm, nf, log: [] };
    // the view switch: the top-down ground around the switch point is painted now (3D is drawing meanwhile)
    if (o.switchAt != null && N.render.warmChunks) { at(path, d0 + (warm + o.switchAt) * o.spd / FPS, tmp); N.render.warmChunks(tmp.x, tmp.y, 520); }
    if (o.heat) N.wanted.set(Math.floor(heatAt(o.heat, -warm) / 100), 'set');
    for (let k = 0; k < 3; k++) if (N.view3d && N.view3d.active) N.view3d.settle(30000);
    noDraw(true);
    try { while (C.f < -6) advance(); } finally { noDraw(false); }
    while (C.f < 0) advance();
    if (N.view3d && N.view3d.active) N.view3d.settle(30000);
    syncAnims();
    return { at: [Math.round(start.x), Math.round(start.y)], len: Math.round(path.len), d0: Math.round(d0), veh: v ? v.type : null, view: N.view.mode, level: N.wanted.level, heat: Math.round(N.wanted.heat), money: N.player.money, pursuers: pursuerInfo(), log: C.log.splice(0) };
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
    return N.wanted.pursuers.map((a) => a.role + (a.mount ? '@' + a.mount.type + ' v' + Math.round(a.mount.speed || 0) : '') + ' ' + Math.round(Math.hypot(a.x - p.x, a.y - p.y)) + 'u ' + a.state + (a.seeing ? ' sees' : ''));
  }
  const subst = (t) => { try { if (N.menus && N.menus.subst) return N.menus.subst(t); } catch (e) { /* stub */ } return String(t).replace(/\{FULL\}/g, 'K. SRIKANTH'); };
  const mountedOn = (a) => !!(a.mount && (a.vehicle === a.mount || a.passengerOf === a.mount));

  // pursuers the wanted system spawns off-screen (300-450 u away) are moved onto Chinnu's route: behind him, or
  // ahead of him just outside the frame, facing him
  const staged = new WeakSet();
  function stageNew() {
    const S = C.o.stage; if (!S) return;
    const p = N.player;
    for (const a of N.wanted.pursuers) {
      if (staged.has(a) || a.state === 'leave' || a.guard || !(a.role in S.roles)) continue;
      if (C.f < (S.at == null ? -40 : S.at)) continue;
      staged.add(a);
      const R = S.roles[a.role], d = Math.hypot(a.x - p.x, a.y - p.y), m = a.mount, rides = !!(m && mountedOn(a));
      let off = R.ahead != null ? R.ahead : -(R.back || 120); // signed route distance from Chinnu
      if (R.ahead === 'edge') { off = 40; for (; off < 420; off += 4) { at(C.path, C.d + off, tmp); if (!N.render.inView(tmp.x, tmp.y, 14)) break; } off += 6; }
      at(C.path, C.d + off, tmp); at(C.path, C.d + off + 6, tmp2);
      const fwd = Math.atan2(tmp2.y - tmp.y, tmp2.x - tmp.x), ang = off > 0 ? fwd + Math.PI : fwd;
      // lateral: + = to Chinnu's right (riders: R.lat, else 0; people on foot: S.side)
      const lat = R.lat != null ? R.lat : rides ? 0 : (S.side || 0);
      const nx = tmp.x - Math.sin(fwd) * lat, ny = tmp.y + Math.cos(fwd) * lat;
      if (rides) {
        const sp = (m.pu && m.pu.speed) || C.o.spd;
        m.x = nx; m.y = ny; m.angle = ang; m.vx = Math.cos(ang) * sp; m.vy = Math.sin(ang) * sp; m.speed = sp; m.okX = null;
        if (m.pu) { m.pu.path = null; m.pu.planT = 0; m.pu.minT = 0; m.pu.cx = nx; m.pu.cy = ny; m.pu.stuck = 0; }
        a.x = nx; a.y = ny; a.angle = ang;
        if (R.brakeAt) brakeNear(a, m, R.brakeAt);
      } else { a.x = nx; a.y = ny; a.angle = ang; a.vx = Math.cos(ang) * a.runSpd; a.vy = Math.sin(ang) * a.runSpd; a.path = null; }
      a.target = { x: p.x, y: p.y };
      C.log.push(C.f + ' staged ' + a.role + ' ' + Math.round(Math.abs(off)) + 'u ' + (off > 0 ? 'ahead' : 'behind') + ' (spawned ' + Math.round(d) + 'u away)');
    }
  }
  // the driver pulls up once within r u of Chinnu (the game's pursuit controller until then)
  function brakeNear(a, v, r) {
    const ctl0 = v.controller;
    v.controller = function (v, dt) {
      const p = N.player;
      if (!v.pulledUp && Math.hypot(p.x - v.x, p.y - v.y) < r) { v.pulledUp = true; C.log.push(C.f + ' ' + a.role + "'s driver pulls up"); }
      if (!v.pulledUp) return ctl0.call(this, v, dt);
      const c = v.ctl; c.throttle = 0; c.brake = true; c.steer = 0; c.handbrake = false;
    };
  }

  // vehicles on his line (a kid running down the road: anything parked or crawling there would be run through)
  function clearLine(r, len, back) {
    const pts = [];
    for (let d = C.d - (back || 20); d < C.d + len; d += 4) pts.push(at(C.path, d, { x: 0, y: 0 }));
    let n = 0;
    for (const e of N.entities.all.slice()) {
      if (e.kind !== 'vehicle' || e === N.player.vehicle || e.npcOwned || e.pursuitVehicle || e.roadblock) continue;
      const rr = r + ((e.T && e.T.d) || 6) / 2; // (T.d: the vehicle's width)
      if (pts.some((q) => Math.abs(q.x - e.x) < rr && Math.abs(q.y - e.y) < rr && Math.hypot(q.x - e.x, q.y - e.y) < rr)) { try { N.vehicles.remove(e); n++; } catch (er) { /* ignore */ } }
    }
    return n;
  }

  // a called-off rider pulls over to the left kerb and stops (his own vehicle controller, replaced)
  const pulled = new WeakSet();
  function pullOver(spec) {
    for (const a of (N.wanted._W.leaving || [])) {
      if (a.role !== spec.role || pulled.has(a)) continue;
      pulled.add(a);
      if (!a.mount || !mountedOn(a)) { // on foot: steps off the road to the left instead of walking back down it
        const g = Math.atan2(N.player.y - a.y, N.player.x - a.x);
        a.leaveTo = { x: a.x + Math.cos(g) * 10 + Math.sin(g) * 45, y: a.y + Math.sin(g) * 10 - Math.cos(g) * 45 };
        C.log.push(C.f + ' ' + a.role + ' steps aside');
        continue;
      }
      // onto the footpath on the left (off the road: the game's traffic sense ignores vehicles parked there)
      const v = a.mount, ang = v.angle, q = N.world.nearestRoadPoint(v.x, v.y);
      const hw = q && q.road && q.road.w ? q.road.w / 2 : 10, bx = q ? q.x : v.x, by = q ? q.y : v.y;
      const tx = bx + Math.cos(ang) * spec.ahead + Math.sin(ang) * (hw + spec.kerb), ty = by + Math.sin(ang) * spec.ahead - Math.cos(ang) * (hw + spec.kerb);
      v.controller = function (v) {
        const c = v.ctl, d = Math.hypot(tx - v.x, ty - v.y), sp = v.speed || 0;
        c.handbrake = false;
        if (d < 5 || (d < 14 && sp < 8)) { c.throttle = 0; c.brake = true; c.steer = 0; return; }
        c.steer = Math.max(-1, Math.min(1, U.angleDiff(v.angle, Math.atan2(ty - v.y, tx - v.x)) * 2.5));
        const want = Math.min(70, d * 2.2);
        if (sp > want + 4) { c.brake = true; c.throttle = 0; } else { c.brake = false; c.throttle = sp < want - 4 ? 0.5 : 0.05; }
      };
      C.log.push(C.f + ' ' + a.role + ' pulls over to ' + Math.round(tx) + ',' + Math.round(ty) + ' (road half-width ' + Math.round(hw) + ')');
    }
  }

  // shorter bubbles for some speakers (by the pursuer's role; wraps the game's bark for this page only)
  const bark0 = N.dialogue.bark;
  N.dialogue.bark = function (target, text, opts) {
    const bs = C && C.o.barkSecs;
    const role = !target ? null : target.pursuer ? target.role : target.pu && target.pu.actor ? target.pu.actor.role : null;
    if (bs && role && bs[role] != null) {
      if (!bs[role]) return { closed: true, close() {}, done: Promise.resolve() }; // (no bubble)
      opts = Object.assign({}, opts, { secs: bs[role] });
    }
    return bark0.call(this, target, text, opts);
  };

  function script() {
    const o = C.o, W = N.wanted;
    if (o.clear && (C.f === -(o.warm || 75) || C.f === -12)) C.log.push(C.f + ' cleared ' + clearLine(o.clear, (C.nf + 10 - C.f) / FPS * o.spd, C.f === -12 ? 240 : 20) + ' vehicles off his line');
    if (o.heat) {
      const L0 = W.level;
      heatTo(heatAt(o.heat, C.f));
      if (W.level !== L0) {
        C.log.push(C.f + ' level ' + L0 + '->' + W.level + ' heat ' + Math.round(W.heat));
        if (W.level === 5 && o.chappalT != null) W._W.chappalT = o.chappalT;
      }
    }
    if (o.chappalFrom != null && W.level === 5 && !W._W.chappal) W._W.chappalT = C.f < o.chappalFrom ? 99 : 0;
    if (o.pullOver) pullOver(o.pullOver);
    if (o.quiet) for (const a of W.pursuers) a.barkT = 99;
    if (o.barks && C.f >= 0) for (const b of o.barks) {
      if (b[0] !== C.f) continue;
      const a = W.pursuers.find((q) => q.role === b[1] && q.state !== 'leave');
      if (!a) { C.log.push(C.f + ' no ' + b[1] + ' to bark'); continue; }
      // (a rider's bubble on himself, as the game's own lines for him; a passenger's on the vehicle she rides in)
      N.dialogue.bark(a.passengerOf ? a.passengerOf : a, subst(b[2]), { speaker: a.speaker || undefined, secs: b[3] });
      C.log.push(C.f + ' bark ' + b[1] + ' ' + b[2]);
    }
    if (o.switchAt === C.f) { N.view.set('top'); C.log.push(C.f + ' view ' + N.view.mode); }
  }

  function advance() {
    const { o, path, v } = C;
    script();
    if (N.wanted.busy) { window.__step(1 / FPS); C.f++; syncAnims(); return; } // PAKDA GAYA!: the game holds everything (mode 'gameover'), so does the route
    C.d += o.spd / FPS;
    at(path, C.d, tmp); at(path, C.d + 10, tmp2);
    const ang = Math.atan2(tmp2.y - tmp.y, tmp2.x - tmp.x);
    const vx = Math.cos(ang) * o.spd, vy = Math.sin(ang) * o.spd;
    if (v) {
      // pose the vehicle a step behind: the physics step moves it forward this frame
      v.x = tmp.x - vx / FPS; v.y = tmp.y - vy / FPS; v.angle = ang; v.speed = o.spd; v.vx = vx; v.vy = vy;
      if (v.ctl) { v.ctl.throttle = 1; v.ctl.steer = 0; v.ctl.brake = 0; }
    } else {
      const p = N.player;
      p.x = tmp.x - vx / FPS; p.y = tmp.y - vy / FPS; p.vx = vx; p.vy = vy; p.angle = ang; p.facing = ang; p.running = !!o.run;
    }
    if (o.view === 'tps' && C.f === -(o.warm || 75) && N.view3d.snapCamera) N.view3d.snapCamera();
    window.__step(1 / FPS);
    stageNew();
    C.f++;
    syncAnims();
  }

  H.frame = function () {
    const f = C.f;
    advance();
    const W = N.wanted, p = N.player, ch = W._W.chappal;
    let dbg;
    if (window.HUDDBG) {
      const m = W.chaser && W.chaser.mount;
      if (m) {
        let ob = null; try { ob = N.traffic.sense(m, Math.cos(m.angle), Math.sin(m.angle)); } catch (e) { ob = String(e); }
        const pu = m.pu;
        dbg = { ctl: m.ctl && [m.ctl.throttle, m.ctl.brake, +m.ctl.steer.toFixed(2)], ob: ob && ob.e ? [ob.e.kind + ':' + (ob.e.type || ob.e.role || ''), Math.round(ob.gap), Math.round(ob.sp)] : ob, pi: pu && pu.path ? pu.pi + '/' + pu.path.length : null, ang: +m.angle.toFixed(2), max: m.T && (m.T.max || m.T.top || m.T.speed) };
      }
    }
    return { dbg, f, level: W.level, heat: Math.round(W.heat), view: N.view.mode, money: p.money, mode: N.state.mode, pos: [Math.round(p.x), Math.round(p.y)], pursuers: pursuerInfo(), chappal: ch ? ch.ph + ' ' + Math.round(Math.hypot(ch.x - p.x, ch.y - p.y)) + 'u' : null, busy: W.busy, log: C.log.splice(0) };
  };
})();
