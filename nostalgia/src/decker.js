/* NOSTALGIA — decker.js  (N.decker: the double-decker's top deck, walked on while the bus drives)
 *
 * Climbing to the top deck of an APSRTC double-decker was the ride in 2003: up the stairs from the rear platform,
 * down the swaying aisle, into the front seat if it was free, the whole road below. Boarding a double-decker
 * (vehicles.js boardBus, TYPES[t].topDeck) makes the player a 'deck' passenger: he comes up the stairs at the back
 * and moves about the top deck in the bus's own frame, carried along as it drives and swaying when it brakes or
 * swings round a corner (standing; seated he stays put). ACTION next to a free seat sits him down (any seat the
 * other passengers have left: about half), ACTION again stands him up; at the top of the stairs ACTION takes him
 * down (the bus stops first if it is moving) and off.
 *
 * Frame: the bus's local x forward, z to its right (-z is the left / kerb side), the units of the 3D model
 * (view3d_actors.js mkDecker), which the 2D cutaway (vehicles.js deckFromAbove) shares.
 * Layout: seat rows at x = 25.6 - 5.4 k (k 0..8), four seats a row, two each side of a 4 u aisle; seat index
 * k * 4 + (right side ? 2 : 0) + (window ? 1 : 0); the front-left window seat (1) is always kept free. The stairwell
 * at the back on the left; standing room at the front window and at the back on the right.
 *
 * Systems: 'decker' (order 31, after vehicles, which puts a passenger at the bus's centre: here he goes to his
 * spot on the deck; then traffic, interact and the cameras see him there).
 * The deck has its own comings and goings on his bus: at each stop one or two passengers get up and go down the
 * stairs and others come up and find a seat (they walk the aisle like him, and wait if he is in the way).
 * Events: 'decker:board' {vehicle}, 'decker:sit' {seat, front, window}, 'decker:stand' {}, 'decker:sway' {force},
 * 'decker:walker' {kind: 'leave' | 'arrive', seat}.
 *
 * API N.decker = {LAYOUT, SEATS, FRONT, TUNE, state (live: {v, x, z, a, vx, vz, sit} or null), onDeck(p?),
 *   looks(v) -> a look or null per seat, free(v, i), sit(i), stand(), seatNear() -> seat | null,
 *   walkers(v) -> the passengers walking the deck [{look, x, z, a, sp, ent}], stop() (tests: a bus stop's comings
 *   and goings now), toWorld(v, x, z) -> {x, y}, eye() -> {x, y, h} (first person), speed() -> his speed on the deck}
 */
(() => {
  'use strict';
  const U = N.util;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const LAYOUT = {
    floor: 15.4, seatY: 17.8, top: 25.4, hw: 9, wall: 8.4, aisle: 2.0, seatZ: [3.79, 6.03], seatBox: [-2.4, 1.6],
    front: 28.2, back: -29.4, stairs: { x0: -28.4, x1: -20.0, z0: -8.6, z1: -0.8 }, rows: [],
  };
  for (let x = 31 - 5.4; x > -31 + 13; x -= 5.4) LAYOUT.rows.push(+x.toFixed(2));
  const SEATS = [];
  LAYOUT.rows.forEach((x, row) => {
    for (const side of [-1, 1]) for (const win of [0, 1]) SEATS.push({ i: SEATS.length, row, x, y: LAYOUT.seatY, z: side * LAYOUT.seatZ[win], side, win: !!win, pose: 'bench', foot: [x + 2.8, LAYOUT.floor] });
  });
  const FRONT = 1;
  const R = 1.3; // his footprint on the deck (the street's 3.3 would not fit the aisle)
  const TUNE = {
    walk: 24, run: 34,                 // u/s on the deck
    sway: 0.3, swayMax: 34,            // standing: the bus's braking / cornering pushes him (x its acceleration, capped)
    staggerAt: 90,                     // a harder jolt than this (u/s²) staggers him (and the conductor shouts)
    board: [-21.6, 0.6],               // where the stairs bring him up (on the aisle's line)
    aisleAssist: 7,                    // walking along the bus between the seat rows: drawn to the aisle's middle
    sitR: 3.2,                         // a seat's row within this (x) of him, him in the aisle
    stairsR: 2.6,                      // ACTION "Go down" within this of the stairwell's top
    tuckAfter: 0.35, tuckZ: 3.1,       // a passenger he blocks in the aisle steps into a row's leg room after this (s), to this z
    walker: 15, leave: [1, 2], arrive: [1, 2], arriveAfter: 1.8, // the deck's own comings and goings at a stop
  };
  let D = null;
  const toast = (t, ms) => { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2400); };

  function looks(v) {
    if (!v._ddLooks) {
      const r = U.rng(((v.seed | 0) || 1) * 17 + 5);
      v._ddLooks = SEATS.map(() => (r.next() < 0.5 ? N.people.randomLook(r, r.next() < 0.3 ? 'aunty' : r.next() < 0.4 ? 'student' : 'man') : null));
      v._ddLooks[FRONT] = null; // the best seat in the city, kept for him
    }
    return v._ddLooks;
  }
  const free = (v, i) => !!SEATS[i] && !looks(v)[i] && !(D && D.v === v && D.sit === i) && !(v._ddRes && v._ddRes.has(i));
  function onDeck(p) { p = p || N.player; return !!(D && p && p.vehicle === D.v && p.passenger === 'deck'); }
  function toWorld(v, x, z) { const c = Math.cos(v.angle || 0), s = Math.sin(v.angle || 0); return { x: v.x + c * x - s * z, y: v.y + s * x + c * z }; }

  /* ---------------------------------------------------------------- moving about */
  function pushBox(st, x0, x1, z0, z1) {
    const qx = clamp(st.x, x0, x1), qz = clamp(st.z, z0, z1), dx = st.x - qx, dz = st.z - qz, d = Math.hypot(dx, dz);
    if (d >= R) return false;
    if (d < 1e-6) { // inside: out through the nearest face
      const l = st.x - x0, r = x1 - st.x, b = st.z - z0, f = z1 - st.z, m = Math.min(l, r, b, f);
      if (m === l) st.x = x0 - R; else if (m === r) st.x = x1 + R; else if (m === b) st.z = z0 - R; else st.z = z1 + R;
    } else { st.x = qx + dx / d * R; st.z = qz + dz / d * R; }
    return true;
  }
  /** keep (st.x, st.z) on the deck: the walls, the seat rows (both sides of the aisle), the stairwell */
  function collide(st) {
    const L = LAYOUT, sb = L.seatBox, S = L.stairs;
    let hit = false;
    for (let it = 0; it < 3; it++) {
      const x0 = st.x, z0 = st.z;
      st.x = clamp(st.x, L.back, L.front); st.z = clamp(st.z, -L.wall + R, L.wall - R);
      for (const x of L.rows) {
        if (st.x < x + sb[0] - R || st.x > x + sb[1] + R) continue;
        pushBox(st, x + sb[0], x + sb[1], L.aisle, L.hw); pushBox(st, x + sb[0], x + sb[1], -L.hw, -L.aisle);
      }
      pushBox(st, S.x0, S.x1, S.z0, S.z1);
      if (st.walk) for (const w of st.walk) { const dx = st.x - w.x, dz = st.z - w.z, d = Math.hypot(dx, dz), m = R + 1.1; if (d < m && d > 1e-6) { st.x = w.x + dx / d * m; st.z = w.z + dz / d * m; } }
      if (st.x === x0 && st.z === z0) break;
      hit = true;
    }
    return hit;
  }
  function update(dt) {
    if (!D) return;
    const p = N.player, v = D.v;
    if (!v || !v.alive || p.vehicle !== v || p.passenger !== 'deck') { D = null; return; }
    const play = N.state.mode === 'play' && !p.controlsLocked && p.mode !== 'busy';
    // the bus's acceleration in its own frame: braking throws him forward, a corner to the outside
    const sp = v.speed || 0, along = dt > 1e-4 ? (sp - D.lastSp) / dt : 0, turn = dt > 1e-4 ? U.angleDiff(D.lastA, v.angle || 0) / dt : 0;
    D.lastSp = sp; D.lastA = v.angle || 0;
    D.jx += (clamp(-along, -400, 400) - D.jx) * Math.min(1, dt * 10); // smoothed: one rough frame is not a jolt
    D.jz += (clamp(-sp * turn, -400, 400) - D.jz) * Math.min(1, dt * 10);
    if (D.sit < 0) {
      let mx = 0, my = 0;
      if (play && D.stagT <= 0) { mx = N.input.move.x; my = N.input.move.y; }
      const mag = Math.min(1, Math.hypot(mx, my));
      const c = Math.cos(v.angle || 0), s = Math.sin(v.angle || 0);
      let lx = mx * c + my * s, lz = -mx * s + my * c; // the stick (world, camera-turned by input.js) in the bus's frame
      const ll = Math.hypot(lx, lz); if (ll > 0) { lx /= ll; lz /= ll; }
      const top = (play && N.input.down('run') ? TUNE.run : TUNE.walk) * mag;
      const px = clamp(D.jx * TUNE.sway, -TUNE.swayMax, TUNE.swayMax), pz = clamp(D.jz * TUNE.sway, -TUNE.swayMax, TUNE.swayMax);
      // walking along the bus between the seat rows: kept to the middle of the aisle (no snagging on the seat corners)
      let az = 0;
      if (mag > 0.05 && Math.abs(lx) > 0.6 && D.x > LAYOUT.stairs.x1 - 1 && D.x < LAYOUT.rows[0] + 2 && Math.abs(D.z) < LAYOUT.aisle + 1.4) az = -D.z * TUNE.aisleAssist;
      const a = 1 - Math.exp(-dt * (mag > 0.05 ? 10 : 7));
      D.vx += (lx * top + px - D.vx) * a; D.vz += (lz * top + pz + az - D.vz) * a;
      const bx = D.x, bz = D.z;
      D.x += D.vx * dt; D.z += D.vz * dt;
      D.walk = v._ddWalk || null;
      if (collide(D) && dt > 1e-4) { D.vx = (D.x - bx) / dt; D.vz = (D.z - bz) / dt; }
      // a hard jolt standing up: a stagger (and the conductor's shout, once a ride)
      const jolt = Math.hypot(D.jx, D.jz);
      if (D.stagT > 0) D.stagT -= dt;
      else if (jolt > TUNE.staggerAt) {
        D.stagT = 0.5; N.emit('decker:sway', { force: jolt });
        if (!D.shouted) { D.shouted = true; toast('*Arre!* "Hold the rail, *beta*!" the conductor shouts up the stairs.', 2600); }
      }
      if (N.view && N.view.mode === 'fps') D.a = U.wrapAngle(N.view.yaw - (v.angle || 0)); // he faces where he looks
      else if (mag > 0.1) D.a += U.angleDiff(D.a, Math.atan2(lz, lx)) * Math.min(1, dt * 14);
    } else { D.vx = D.vz = 0; D.stagT = 0; }
    place(p, v, dt);
    deckLife(v, dt);
    if (play) offers(v);
  }

  /* ---------------------------------------------------------------- the deck's comings and goings */
  const AISLE_Z = 0;
  function walkers(v) { return v._ddWalk || (v._ddWalk = []); }
  function deckLife(v, dt) {
    const W = walkers(v), stopped = !!(v.tr && v.tr.stopT != null);
    if (stopped && !v._ddStopped) busStop(v);
    v._ddStopped = stopped;
    if (v._ddArriveT > 0) { v._ddArriveT -= dt; if (v._ddArriveT <= 0) arrivals(v); }
    for (let k = W.length - 1; k >= 0; k--) if (stepWalker(v, W[k], dt)) W.splice(k, 1);
  }
  /** at a stop: one or two get up and go down; a moment later others come up the stairs */
  function busStop(v) {
    const L = looks(v), r = U.rng(((v.seed | 0) + (N.time.now * 10 | 0)) * 7 + 3);
    const taken = SEATS.filter((s) => L[s.i] && !(v._ddRes && v._ddRes.has(s.i)));
    const n = Math.min(taken.length, TUNE.leave[0] + Math.floor(r.next() * (TUNE.leave[1] - TUNE.leave[0] + 1)));
    for (let k = 0; k < n; k++) {
      const s = taken.splice(Math.floor(r.next() * taken.length), 1)[0];
      const look = L[s.i]; L[s.i] = null;
      walkers(v).push({ kind: 'leave', look, seat: s.i, x: s.x + 0.4, z: s.z, a: -s.side * Math.PI / 2, sp: 0, path: [[s.x + 0.4, AISLE_Z], [LAYOUT.stairs.x1 + 1.2, AISLE_Z], [LAYOUT.stairs.x1 - 1.6, LAYOUT.stairs.z1 - 2.2]], pi: 0, wait: 0.3 + k * 0.9, ent: null });
      N.emit('decker:walker', { kind: 'leave', seat: s.i });
    }
    v._ddArriveT = TUNE.arriveAfter;
    v._ddArriveN = TUNE.arrive[0] + Math.floor(r.next() * (TUNE.arrive[1] - TUNE.arrive[0] + 1));
  }
  function arrivals(v) {
    const r = U.rng(((v.seed | 0) + (N.time.now * 10 | 0)) * 13 + 1);
    const res = v._ddRes || (v._ddRes = new Set());
    for (let k = 0; k < (v._ddArriveN || 0); k++) {
      const open = SEATS.filter((s) => free(v, s.i) && s.i !== FRONT);
      if (!open.length) break;
      const s = open[Math.floor(r.next() * open.length)];
      res.add(s.i);
      const look = N.people.randomLook(r, r.next() < 0.3 ? 'aunty' : r.next() < 0.4 ? 'student' : 'man');
      const [bx, bz] = TUNE.board;
      walkers(v).push({ kind: 'arrive', look, seat: s.i, x: LAYOUT.stairs.x1 - 1.6, z: LAYOUT.stairs.z1 - 2.2, a: 0, sp: 0, path: [[bx, AISLE_Z], [s.x + 0.4, AISLE_Z], [s.x, s.z]], pi: 0, wait: k * 1.4, ent: null });
      N.emit('decker:walker', { kind: 'arrive', seat: s.i });
    }
    v._ddArriveN = 0;
  }
  /** one passenger along the aisle; true when done (down the stairs, or in the seat) */
  function stepWalker(v, w, dt) {
    if (w.wait > 0) { w.wait -= dt; w.sp = 0; return false; }
    const q = w.path[w.pi];
    if (!q) {
      if (w.kind === 'arrive') { looks(v)[w.seat] = w.look; if (v._ddRes) v._ddRes.delete(w.seat); }
      return true;
    }
    let dx = q[0] - w.x, dz = q[1] - w.z, d = Math.hypot(dx, dz);
    if (d < 0.4 && !w.tuck) { w.pi++; return false; }
    // he is in the way: wait for him (a step back from him); kept waiting in the aisle, tuck into a row's leg room
    // and let him by (the aisle is too narrow for two), then carry on
    let sp = TUNE.walker;
    const him = D && D.v === v && D.sit < 0, px = him ? D.x - w.x : 0, pz = him ? D.z - w.z : 0, pd = Math.hypot(px, pz);
    if (w.tuck) {
      if (!him || pd > 4.6 || (px * dx + pz * dz) <= 0) { w.tuck = null; w.tuckT = 0; return false; } // he is past: back to the aisle
      w.tuckT = (w.tuckT || 0) + dt;
      if (w.tuckT > 3 && !w.asked) { w.asked = true; toast('"*Thoda side, beta!*" Somebody wants to get past.', 2200); }
      dx = w.tuck[0] - w.x; dz = w.tuck[1] - w.z; d = Math.hypot(dx, dz);
      if (d < 0.3) { w.sp = 0; return false; }
    } else if (him && pd < 3.4 && (px * dx + pz * dz) > 0) {
      sp = 0;
      w.blockT = (w.blockT || 0) + dt;
      if (w.blockT > TUNE.tuckAfter && Math.abs(w.z - AISLE_Z) < 1) { w.tuck = tuckSpot(v, w, D); w.blockT = 0; }
      if (w.blockT > 1.6 && !w.asked) { w.asked = true; toast('"*Thoda side, beta!*" Somebody wants to get past.', 2200); }
    } else w.blockT = 0;
    const st = Math.min(d, sp * dt);
    w.x += dx / d * st; w.z += dz / d * st;
    w.sp = sp > 0 ? sp : 0; w.ph = (w.ph || 0) + st * 0.26;
    w.a += U.angleDiff(w.a, Math.atan2(dz, dx)) * Math.min(1, dt * 10);
    return false;
  }
  /** the leg room in front of a seat row (between it and the row ahead), the nearest one not on his side of her,
   *  on the side with its aisle seat free if either is */
  function tuckSpot(v, w, P) {
    const L = LAYOUT, dir = Math.sign(w.x - P.x) || 1;
    let best = null, bd = 1e9;
    L.rows.forEach((x, row) => {
      const gx = x + (L.seatBox[1] + 5.4 + L.seatBox[0]) / 2;
      if ((gx - w.x) * dir < -1.2) return;
      const dd = Math.abs(gx - w.x); if (dd < bd) { bd = dd; best = { gx, row }; }
    });
    if (!best) return [w.x, AISLE_Z + (P.z > AISLE_Z ? -1 : 1) * TUNE.tuckZ];
    const lk = looks(v), freeL = !lk[best.row * 4], freeR = !lk[best.row * 4 + 2];
    const side = freeL !== freeR ? (freeL ? -1 : 1) : (P.z > AISLE_Z ? -1 : 1);
    return [best.gx, AISLE_Z + side * TUNE.tuckZ];
  }
  /** tests: a stop's comings and goings now (the bus need not be at a stop) */
  function stopNow() { if (D) { busStop(D.v); } }
  function place(p, v, dt) {
    const w = toWorld(v, D.x, D.z);
    p.x = w.x; p.y = w.y;
    p.angle = p.facing = (v.angle || 0) + D.a;
    p.vx = v.vx || 0; p.vy = v.vy || 0;
    const sp = Math.hypot(D.vx, D.vz);
    p.anim.speed = Math.min(1, sp / TUNE.walk); p.anim.run = sp > TUNE.walk * 1.2;
    p.anim.phase += sp * (dt || 0) * 0.26;
    if (sp < 4) p.anim.phase *= 0.8;
    p.sitting = D.sit >= 0;
  }

  /* ---------------------------------------------------------------- seats, the stairs */
  /** the free seat he would sit in from where he stands: a row beside him, him in the aisle (or at the front / back) */
  function seatNear() {
    if (!D || D.sit >= 0) return null;
    if (Math.abs(D.z) > LAYOUT.aisle + 1.0) return null;
    let best = null, bd = Infinity;
    const fz = Math.sin(D.a); // facing a side: that side first
    for (const s of SEATS) {
      const dx = Math.abs(D.x - s.x);
      if (dx > TUNE.sitR || !free(D.v, s.i)) continue;
      const d = dx + Math.abs(D.z - s.z) * 0.3 + (fz * s.side < -0.3 ? 1.5 : 0) + (s.win ? -0.2 : 0) + (s.i === FRONT ? -1.5 : 0); // the front seat if it is in reach
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  function sit(i) {
    if (!D || D.sit >= 0 || !free(D.v, i)) return false;
    const s = SEATS[i];
    D.sit = i; D.x = s.x; D.z = s.z; D.vx = D.vz = 0; D.a = 0;
    if (i === FRONT && !D.frontToast) { D.frontToast = true; toast('The front seat! The whole road below you.', 2400); }
    N.emit('decker:sit', { seat: i, front: i === FRONT, window: s.win });
    return true;
  }
  function stand() {
    if (!D || D.sit < 0) return false;
    const s = SEATS[D.sit];
    D.sit = -1; D.x = s.x + 0.6; D.z = s.side * 0.3; D.a = s.side < 0 ? 0.6 : -0.6;
    collide(D);
    N.emit('decker:stand', {});
    return true;
  }
  const atStairs = () => D && D.sit < 0 && D.x < LAYOUT.stairs.x1 + TUNE.stairsR && D.z < LAYOUT.stairs.z1 + 2.2;
  const sitSpec = { label: 'Sit', priority: 2, dist: 0, use: () => { if (sitSpec.seat) sit(sitSpec.seat.i); } };
  const standSpec = { label: 'Stand up', priority: 2, dist: 0, use: () => stand() };
  const downSpec = { label: 'Go down', priority: 3, dist: 0, use: () => { try { N.vehicles.exit(N.player, false); } catch (e) { N.err('decker.down', e); } } };
  function offers(v) {
    if (D.sit >= 0) { N.interact.offer(standSpec); return; }
    if (atStairs() && !v.lockPassenger) {
      downSpec.label = Math.abs(v.speed || 0) > 20 && !v.stopReq ? 'Go down (ask to stop)' : 'Go down, get off';
      N.interact.offer(downSpec);
    }
    const s = seatNear();
    if (s) { sitSpec.seat = s; sitSpec.label = s.i === FRONT ? 'Sit (the front seat!)' : s.win ? 'Sit (window)' : 'Sit'; sitSpec.dist = Math.abs(D.x - s.x); N.interact.offer(sitSpec); }
  }

  /* ---------------------------------------------------------------- first person */
  function eye() {
    if (!D) return null;
    const p = N.player, lk = (p && p.look) || {}, size = (lk.size || 1) * (lk.kind === 'kid' || lk.kind === 'student' ? 0.78 : 1);
    const sat = D.sit >= 0;
    const h = sat ? LAYOUT.seatY + 3.7 * size : LAYOUT.floor + 8.2 * size;
    const fwd = sat ? 0.5 : 0.35;
    const w = toWorld(D.v, D.x + Math.cos(D.a) * fwd, D.z + Math.sin(D.a) * fwd);
    return { x: w.x, y: w.y, h };
  }

  /* ---------------------------------------------------------------- getting on / off */
  N.on('vehicle:enter', (d) => {
    if (!d || d.actor !== N.player || d.passenger !== 'deck' || !d.vehicle) return;
    const v = d.vehicle;
    D = { v, x: TUNE.board[0], z: TUNE.board[1], a: 0, vx: 0, vz: 0, sit: -1, lastSp: v.speed || 0, lastA: v.angle || 0, jx: 0, jz: 0, stagT: 0, shouted: false, frontToast: false };
    collide(D);
    looks(v);
    N.emit('decker:board', { vehicle: v });
  });
  N.on('vehicle:exit', (d) => { if (d && d.actor === N.player && D) { D = null; if (N.player) N.player.sitting = false; } });

  N.addSystem({ id: 'decker', order: 31, runIn: ['play', 'dialogue', 'cutscene'], update(dt) { try { update(dt); } catch (e) { N.err('decker.update', e); D = null; } } });

  N.decker = {
    LAYOUT, SEATS, FRONT, TUNE,
    get state() { return D; },
    onDeck, looks, free, sit, stand, seatNear, toWorld, eye, walkers, stop: stopNow,
    speed: () => (D ? Math.hypot(D.vx, D.vz) : 0),
  };
})();
