/* NOSTALGIA — vehicles.js
 * Vehicle types (cycle, ladies cycle, Luna, Chetak, RX100, auto, Ambassador, Maruti 800,
 * Padmini, city bus, lorry, boat), arcade physics (throttle / brake / reverse, speed-
 * dependent steering, lateral grip + handbrake drift, surface slow-down, wall bounce and
 * scrape, vehicle-vehicle and vehicle-ped pushes), procedural pseudo-3D drawing (rotated
 * extruded prisms that lean like GTA2 buildings), skid marks, exhaust/dust/spark/foam
 * particles, headlights at night, enter / exit / borrow, horn and radio events.
 * Contract: ARCHITECTURE.md §8 (extended there: "vehicles.js implementation notes").
 *
 * Conventions: a type's `w` is its LENGTH along the heading and `d` its WIDTH. Local vehicle
 * coordinates: +x forward, +y to the right. Vehicles are entities with `selfUpdate` and
 * `noCollide` (entities.js leaves them alone); the 'vehicles' system (order 30) moves them
 * and resolves every collision that involves a vehicle.
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;
  const TAU = Math.PI * 2;

  const approach = (a, b, d) => (a < b ? Math.min(b, a + d) : Math.max(b, a - d));

  // Tunables (systems §2.6, §3.1, §5.6): kid at the wheel, flats, falls, potholes, rain grip.
  const TUNE = {
    kidTop: 0.9, kidAccel: 0.85, flatTop: 0.55, punctureRate: 0.003, potholeEvery: 2.5, potholeFall: 0.1,
    potholeSpeed: 100, pickupAfter: 1.5, rightAfter: 8, rainGrip: 0.8, rainGripBike: 0.7, witnessR: 120,
    ownerShout: 0.25, heatParked: 40, heatWitnessed: 100, heatCycle: 30, heatChetakNanna: 100, heatChetak: 40,
  };
  // bike surface factors (cls 'bike'); everything else uses world.js SPEED.drive
  const BIKE_SURF = { [N.SURF.FOOTPATH]: 1, [N.SURF.PLAZA]: 1, [N.SURF.GROUND]: 0.85, [N.SURF.GRASS]: 0.75, [N.SURF.SAND]: 0.55 };
  function raining() { const f = N.flags || {}; return !!(f.raining || f.rain || (N.seasons && N.seasons.is && (() => { try { return N.seasons.is('rain'); } catch (e) { return false; } })())); }

  /* ================================================================ types */
  const DEFAULTS = {
    name: 'Vehicle', short: 'vehicle', verb: 'Drive', cls: 'car', mode: 'drive',
    w: 28, d: 13, h: 11,
    maxSpeed: 160, accel: 90, brake: 230, reverse: 0.35, drag: 34,
    turn: 2.3, turnLow: 0, turnHigh: 0.55, steerResp: 11,
    grip: 9, drift: 1.5, bounce: 0.28, mass: 8,
    seats: 4, colors: ['#e8e4d8'], colors2: null, radio: false, lights: true, camZoom: 1,
    smoke: null, rider: false, door: true,
    playerNoEnter: false, noEnter: false, nakko: null, bikeLook: null,
  };
  const TYPES = {};

  /** Define (or redefine) a vehicle type. spec.base inherits from another type (story vehicles). */
  function define(id, spec) {
    const base = spec.base && TYPES[spec.base] ? TYPES[spec.base] : DEFAULTS;
    const t = Object.assign({}, base, spec, { id });
    // collision circles along the length (radius = half width)
    const r = t.d / 2, span = Math.max(0, t.w - t.d);
    const n = span <= 0 ? 1 : Math.ceil(span / (t.d * 0.9)) + 1;
    t.cr = r;
    t.co = [];
    for (let i = 0; i < n; i++) t.co.push(n === 1 ? 0 : -span / 2 + (span * i) / (n - 1));
    t.inertia = (t.w * t.w) / 1.6;
    TYPES[id] = t;
    return t;
  }

  define('cycle', {
    name: 'Hero cycle', short: 'cycle', verb: 'Ride', cls: 'bike', w: 15, d: 5, h: 6,
    maxSpeed: 115, accel: 62, brake: 170, reverse: 0.12, drag: 24, turn: 3.4, turnLow: 0.5, turnHigh: 0.62,
    grip: 13, drift: 3.2, mass: 1.2, seats: 1, lights: false, rider: true, pedal: true, door: false, bikeLook: 'cycle',
    colors: ['#1d1d22', '#2f6a3a', '#24479a', '#9a2424', '#1d1d22'], draw: (ctx, v) => drawBike(ctx, v),
  });
  define('ladiescycle', {
    base: 'cycle', name: 'Ladies cycle', maxSpeed: 108, accel: 58, basket: true,
    colors: ['#8a2a4a', '#c05a8a', '#3a7ab0', '#6a3a8a', '#2a8a7a'],
  });
  define('luna', {
    name: 'TVS Luna', short: 'Luna', verb: 'Ride', cls: 'bike', w: 15, d: 5.5, h: 7,
    maxSpeed: 120, accel: 70, brake: 190, reverse: 0.1, drag: 26, turn: 3.2, turnLow: 0.45, turnHigh: 0.6,
    grip: 12, drift: 3, mass: 2, seats: 1, lights: true, rider: true, door: false, smoke: 'light', bikeLook: 'luna',
    colors: ['#b82a2a', '#2a4a9a', '#2a2a30', '#3a7a4a'], draw: (ctx, v) => drawBike(ctx, v),
  });
  define('chetak', {
    name: 'Bajaj Chetak', short: 'Chetak', verb: 'Ride', cls: 'bike', w: 17, d: 7, h: 8,
    maxSpeed: 150, accel: 95, brake: 210, reverse: 0.1, drag: 28, turn: 3.0, turnLow: 0.42, turnHigh: 0.58,
    grip: 11, drift: 2.6, mass: 3, seats: 2, lights: true, rider: true, door: false, smoke: '2t', bikeLook: 'chetak',
    colors: ['#86b9c9', '#ddd2b2', '#b9483b', '#6f8d68', '#e9e4d8', '#4f6fa8'], draw: (ctx, v) => drawBike(ctx, v),
  });
  define('rx100', {
    name: 'Yamaha RX100', short: 'RX100', verb: 'Ride', cls: 'bike', w: 18, d: 6, h: 8,
    maxSpeed: 180, accel: 150, brake: 230, reverse: 0.1, drag: 28, turn: 3.1, turnLow: 0.4, turnHigh: 0.52,
    grip: 11, drift: 2.4, mass: 3, seats: 2, lights: true, rider: true, door: false, smoke: '2t', bikeLook: 'rx100',
    colors: ['#1c1c22', '#a01e2a', '#1e3c8a', '#5a1a3a'], draw: (ctx, v) => drawBike(ctx, v),
  });
  define('auto', {
    name: 'Auto-rickshaw', short: 'auto', verb: 'Drive', cls: 'auto', w: 22, d: 13, h: 14.5,
    maxSpeed: 135, accel: 80, brake: 210, reverse: 0.3, drag: 32, turn: 2.7, turnLow: 0.12, turnHigh: 0.6,
    grip: 7.5, drift: 1.6, mass: 5, seats: 3, radio: true, smoke: '2t', door: false,
    colors: ['#f2c230'], colors2: ['#1c1a1c', '#1c1a1c', '#2a4a2a'], draw: (ctx, v) => drawAuto(ctx, v),
  });
  define('ambassador', {
    name: 'Ambassador', short: 'Ambassador', w: 30, d: 14, h: 12.5,
    maxSpeed: 165, accel: 88, turn: 2.2, grip: 8.5, mass: 10, radio: true,
    colors: ['#efeae0', '#efeae0', '#1e1e24', '#e0d3ae', '#6a1e26', '#7d8b93'],
    car: { body: [2, 7.4], rf: 5, rr: 5, cab: [-9.5, 5.5], cabInset: 1.2, cabH: 12.5, cabR: 3, slopeF: 3.4, slopeR: 2.6, slopeS: 1.3, bumper: '#c9c9c4', curvy: true },
    draw: (ctx, v) => drawCar(ctx, v),
  });
  define('maruti800', {
    name: 'Maruti 800', short: 'Maruti 800', w: 24, d: 12, h: 11.5,
    maxSpeed: 165, accel: 110, turn: 2.6, grip: 8.5, mass: 6, radio: true,
    colors: ['#f2f0ea', '#c8322a', '#2a4c8a', '#b8bcc0', '#8ab8d8', '#f2f0ea'],
    car: { body: [2, 7], rf: 3.6, rr: 2.6, cab: [-10.6, 4.4], cabInset: 1, cabH: 11.5, cabR: 2, slopeF: 3.6, slopeR: 1.4, slopeS: 1.1, bumper: '#3a3a3e' },
    draw: (ctx, v) => drawCar(ctx, v),
  });
  define('padmini', {
    name: 'Premier Padmini', short: 'Padmini', w: 26, d: 12, h: 11,
    maxSpeed: 158, accel: 92, turn: 2.4, grip: 8.5, mass: 7, radio: true,
    colors: ['#8fb0c8', '#7a9a6a', '#ece6d8', '#c8b48a', '#1e1e24', '#a8443a'],
    car: { body: [2, 7], rf: 3, rr: 3, cab: [-8, 5], cabInset: 1.1, cabH: 11, cabR: 1.6, slopeF: 3, slopeR: 2, slopeS: 1.1, bumper: '#c9c9c4' },
    draw: (ctx, v) => drawCar(ctx, v),
  });
  define('bus', {
    name: 'City bus', short: 'bus', verb: 'Drive', cls: 'heavy', w: 62, d: 18, h: 19.5,
    maxSpeed: 115, accel: 42, brake: 150, reverse: 0.25, drag: 30, turn: 1.25, turnLow: 0, turnHigh: 0.7,
    grip: 10, drift: 3, bounce: 0.18, mass: 40, seats: 50, radio: true, camZoom: 0.86, smoke: 'diesel', playerNoEnter: true,
    colors: ['#b22b2b'], routes: ['127K', '8A', '9X', '49M', '5K', '1Z', '65G', '219'], draw: (ctx, v) => drawBus(ctx, v),
  });
  define('lorry', {
    name: 'Lorry', short: 'lorry', verb: 'Drive', cls: 'heavy', w: 46, d: 16, h: 16,
    maxSpeed: 110, accel: 40, brake: 150, reverse: 0.25, drag: 30, turn: 1.2, turnLow: 0, turnHigh: 0.7,
    grip: 10, drift: 3, bounce: 0.18, mass: 45, seats: 2, radio: true, camZoom: 0.88, smoke: 'diesel', playerNoEnter: true,
    colors: ['#e0782a', '#2a6ab8', '#3a8a5a', '#c03030', '#d8a020'], colors2: ['#e8c060', '#3aa0a0', '#e86a3a', '#8ac04a'],
    draw: (ctx, v) => drawLorry(ctx, v),
  });
  define('boat', {
    name: 'Boat', short: 'boat', verb: 'Steer', cls: 'boat', mode: 'boat', w: 28, d: 11, h: 6,
    maxSpeed: 60, accel: 28, brake: 40, reverse: 0.4, drag: 14, turn: 1.1, turnLow: 0.35, turnHigh: 0.8,
    grip: 2.2, drift: 1.2, bounce: 0.15, mass: 12, seats: 6, door: false,
    colors: ['#f2efe6', '#e8e2d0'], colors2: ['#c0392b', '#2a8c82', '#2a5cb8', '#e0a020'], draw: (ctx, v) => drawBoat(ctx, v),
  });

  /* ------------------------------------------- story and special types (systems §3.2) */
  // nakko: the player can't take it; ACTION near it shows "Nakko" and says this line instead.
  // allow(): when present, the nakko applies only until it returns true (unlocks).
  define('family_chetak', { base: 'chetak', name: "Nanna's Chetak", short: 'Chetak', colors: ['#7d9ab0'] });
  define('chinnu_cycle', { base: 'cycle', name: "Chinnu's cycle", short: 'cycle', maxSpeed: 122, accel: 66, carrier: 0.75, colors: ['#1d1d22'] });
  define('old_cycle', { base: 'cycle', name: "Nanna's roadster", short: 'roadster', maxSpeed: 105, turn: 3.0, colors: ['#141416'] });
  define('kid_cycle', { base: 'cycle', name: "Kid's hire cycle", short: 'cycle', maxSpeed: 110, turn: 3.6, w: 13.5, colors: ['#9a2424', '#2f6a3a', '#24479a'] });
  define('bunty_rx100', {
    base: 'rx100', name: "Bunty-anna's RX100", short: 'RX100', colors: ['#1c1c22'], seats: 2,
    nakko: "Bunty-anna's RX100? Only on Sundays, only with a helmet, only if Mummy doesn't know. Not today.",
    allow: () => unlocked('rx100', 60) || !!(N.flags && (N.flags.bunty_rx100 || N.flags.rx100_lent)),
  });
  define('yadagiri_auto', { base: 'auto', name: "Yadagiri-anna's auto", short: 'auto', label: 'YADAGIRI', nakko: "Yadagiri-anna's auto. *Nakko, beta.* Call AUTO! with the horn.", draw: (ctx, v) => { drawAuto(ctx, v); readableText(ctx, -3.5, 0, 14.6, 'YADAGIRI', '#1a1214', true); } });
  define('pochaiah_luna', { base: 'luna', name: "Pochaiah's Luna", short: 'Luna', colors: ['#b82a2a'], nakko: "The Havaldar's Luna? Are you MAD?", draw: (ctx, v) => { drawBike(ctx, v); drawLightBar(ctx, v); } });
  define('pasha_lambretta', { base: 'chetak', name: "Professor Pasha's Lambretta", short: 'Lambretta', maxSpeed: 140, colors: ['#e8c020'], nakko: "Professor Pasha's scooter? He'll put you on TV. *Nakko.*", draw: (ctx, v) => { drawBike(ctx, v); drawSidecar(ctx, v); } });
  define('peacock_lorry', { base: 'lorry', name: 'Peacock lorry', colors: ['#2a6ab8'], colors2: ['#e8c060'], draw: (ctx, v) => { drawLorry(ctx, v); drawPeacock(ctx, v); } });
  define('govt_ambassador', { base: 'ambassador', name: 'Government Ambassador', colors: ['#f4f2ec'], beacon: true, nakko: 'VIP car, *beta*. *Nakko.*' });
  define('taxi_ambassador', { base: 'ambassador', name: 'Taxi', short: 'taxi', colors: ['#1c1c22'], taxi: true, draw: (ctx, v) => { drawCar(ctx, v); drawTrunks(ctx, v); } });
  define('safari_bus', { base: 'bus', name: 'Zoo safari bus', colors: ['#3a6a3a'], routes: ['SAFARI'], draw: (ctx, v) => { drawBus(ctx, v); drawCage(ctx, v); } });

  /** Total collectibles found (0 while collectibles.js is a stub). */
  function finds() {
    const C = N.collectibles;
    try { if (C && typeof C.total === 'function') { const n = +C.total(); if (isFinite(n)) return n; } } catch (e) { /* stub */ }
    try { if (C && C.found && typeof C.found.size === 'number') return C.found.size; } catch (e) { /* stub */ }
    return 0;
  }
  /** A home unlock from the finds ladder (systems §7.5): N.flags.unlock_<name> or `n` total finds. */
  function unlocked(name, n) { return !!(N.flags && N.flags['unlock_' + name]) || finds() >= n; }
  /** The line a "nakko" vehicle says to the player, or null when he may take it. */
  function nakkoFor(v) {
    const T = v.T;
    if (!T.nakko) return null;
    if (typeof T.allow === 'function') { try { if (T.allow(v)) return null; } catch (e) { /* ignore */ } }
    if (v.allowPlayer) return null;
    return T.nakko;
  }

  /* ============================================================ vehicle */
  const list = [];
  let seq = 0;

  class Vehicle extends N.Actor {
    constructor(type, x, y, angle, opts) {
      super();
      const T = TYPES[type] || TYPES.cycle;
      opts = opts || {};
      this.kind = 'vehicle';
      this.type = T.id; this.T = T;
      this.x = x; this.y = y; this.angle = angle || 0;
      this.vx = 0; this.vy = 0; this.av = 0; this.speed = 0; this.slip = 0; this.throttle = 0;
      this.r = T.w / 2; this.mass = T.mass;
      this.solid = true; this.noCollide = true; this.selfUpdate = true;
      this.seed = opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0;
      const rng = U.rng(this.seed);
      this.color = opts.color || rng.pick(T.colors);
      this.color2 = opts.color2 || (T.colors2 ? rng.pick(T.colors2) : U.shade(this.color, 0.7));
      this.route = opts.route || (T.routes ? rng.pick(T.routes) : null);
      this.beacon = opts.beacon != null ? !!opts.beacon : !!T.beacon;
      this.label = opts.label || T.label || null;
      if (opts.taxi != null ? opts.taxi : T.taxi) this.taxi = true;
      // shops / traffic tags: hire (place id of the stall that rents it), parked (borrowing a parked
      // vehicle raises the meter, systems §3.3), owned (the family's own: never any heat)
      this.hire = opts.hire || null; this.hired = !!opts.hired;
      this.parked = !!opts.parked; this.owned = !!opts.owned;
      this.flat = false; this.fallen = null; this.pillion = null; this.potT = 1;
      this.ctl = { throttle: 0, steer: 0, handbrake: false, brake: false };
      this.driver = null; this.controller = opts.controller || null;
      this.locked = !!opts.locked; this.special = opts.special || null; this.seeded = !!opts.seeded;
      this.asleep = false; this.sleepT = 0; this.age = 0;
      this.steerVis = 0; this.lean = 0; this.wheelPhase = rng.next() * TAU; this.doorT = 0; this.bumpT = 0; this.hornT = 0;
      this.z = 0; this.skL = null; this.skR = null; this.smokeT = rng.next();
      this.revMode = false;
      if (opts.driver) {
        this.driver = opts.driver === true ? { look: N.people.randomLook(rng, rng.pick(['man', 'man', 'uncle', 'man'])), npc: true } : opts.driver;
      }
      this._drawFn = (ctx) => { try { T.draw(ctx, this); } catch (e) { N.err('vehicle.draw:' + T.id, e); } };
      this._shadowFn = () => this.drawShadow();
    }
    get awake() { return !this.asleep; }
    wake() { this.asleep = false; this.sleepT = 0; }
    draw() {
      const R = N.render;
      R.queue('shadow', 0, this._shadowFn);
      R.queue('actors', this.y + (this.T.cls === 'heavy' ? 6 : 2), this._drawFn);
      lightsFor(this);
    }
    drawShadow() {
      const T = this.T;
      if (T.cls === 'boat') return;
      N.draw.shadow(this.x, this.y, T.w + 1, T.d + 0.5, this.angle, T.h * (T.cls === 'bike' ? 0.5 : 0.62));
    }
  }

  /* ------------------------------------------------------------ physics */
  function simulate(v, dt) {
    const T = v.T, W = N.world, S = N.SURF;
    if (!finiteState(v)) recover(v);
    let c = Math.cos(v.angle), s = Math.sin(v.angle);
    let vf = v.vx * c + v.vy * s;      // forward speed
    let vl = -v.vx * s + v.vy * c;     // lateral speed (right +)
    const surf = W.surfaceAt(v.x, v.y);
    let sMul = 1;
    if (T.mode !== 'boat') {
      // bikes keep their speed on footpaths and plazas and lose less on dirt (systems §3.1)
      const bs = T.cls === 'bike' ? BIKE_SURF[surf] : undefined;
      sMul = bs != null ? bs : W.surfaceSpeed(surf, 'drive');
    }
    let top = T.maxSpeed * sMul * (v.boost || 1);
    let accel = T.accel;
    if (v.flat) top *= TUNE.flatTop;
    const pl = N.player;
    if (pl && v.driver === pl) {
      // kid at the wheel: perched on the seat edge to reach the pedals
      if (T.cls === 'car' || T.cls === 'auto') { top *= TUNE.kidTop; accel *= TUNE.kidAccel; }
      if (T.pedal && pl.legsGone) top *= (pl.TUNE && pl.TUNE.legsGoneMul) || 0.65;
    }
    const ctl = v.ctl;
    // controllers (traffic AI, story scripts) may hand us junk: NaN reads as 0
    const thr = U.clamp(+ctl.throttle || 0, -1, 1);
    const hb = !!ctl.handbrake;
    // longitudinal
    if (ctl.brake) vf = approach(vf, 0, T.brake * dt);
    else if (thr > 0.02) {
      if (vf < -3) vf = Math.min(0, vf + T.brake * thr * dt);
      else {
        const f = 1 - Math.pow(U.clamp(vf / Math.max(1, top), 0, 1), 2.2);
        vf += accel * thr * (0.35 + 0.65 * f) * dt * (vf < top ? 1 : 0);
      }
    } else if (thr < -0.02) {
      if (vf > 3) vf = Math.max(0, vf + T.brake * thr * dt);
      else {
        const rtop = top * T.reverse;
        if (vf > -rtop) vf = Math.max(-rtop, vf + accel * 0.75 * thr * dt);
      }
    } else {
      vf = approach(vf, 0, (T.drag + (v.driver ? 0 : 90)) * dt);
    }
    if (vf > top + 1) vf = approach(vf, top, (accel + (vf - top) * 2.5) * dt);
    if (hb) vf = approach(vf, 0, T.brake * 0.4 * dt);
    // steering: rate depends on speed (bikes can turn slowly when nearly stopped)
    const sp = Math.abs(vf), sn = sp / T.maxSpeed;
    const steerF = sn < 0.2 ? U.lerp(T.turnLow, 1, U.smooth(sn / 0.2)) : U.lerp(1, T.turnHigh, U.clamp((sn - 0.2) / 0.8, 0, 1));
    const dir = vf < -0.5 ? -1 : 1;
    const steer = U.clamp(+ctl.steer || 0, -1, 1);
    let tav = steer * T.turn * steerF * dir;
    if (hb && sp > 25) tav *= 1.45;
    v.av += (tav - v.av) * (1 - Math.exp(-dt * T.steerResp));
    v.steerVis += (steer * 0.5 - v.steerVis) * Math.min(1, dt * 12);
    // lateral grip (handbrake = drift)
    let grip = hb ? T.drift : T.grip;
    if (T.mode !== 'boat' && (surf === S.SAND || surf === S.GRASS || surf === S.GROUND)) grip *= 0.8;
    if (T.mode !== 'boat' && raining()) grip *= T.cls === 'bike' ? TUNE.rainGripBike : TUNE.rainGrip; // monsoon showers (systems §3.1)
    const vlBefore = vl;
    vl *= Math.exp(-grip * dt);
    // part of the scrubbed sideways speed carries on forward (keeps corners lively)
    if (!hb) vf += Math.sign(vf) * Math.abs(vlBefore - vl) * 0.35;
    v.vx = c * vf - s * vl; v.vy = s * vf + c * vl;
    v.speed = vf; v.slip = vl; v.throttle = thr;
    // integrate (swept: never tunnels through thin walls, whatever the speed)
    integrate(v, dt);
    // visual: wheel spin, two-wheeler lean
    v.wheelPhase += vf * dt * 0.5;
    const leanT = T.cls === 'bike' ? U.clamp(v.av * sn * 0.9, -0.6, 0.6) : 0;
    v.lean += (leanT - v.lean) * Math.min(1, dt * 8);
    // skid marks + dust + exhaust
    c = Math.cos(v.angle); s = Math.sin(v.angle);
    const skidding = T.mode !== 'boat' && (Math.abs(vl) > 30 || (hb && sp > 30) || (ctl.brake && sp > 60) || (thr < -0.5 && vf > 70));
    v.skidding = skidding;
    if (skidding) skidMarks(v, c, s); else { v.skL = v.skR = null; }
    effects(v, dt, surf, sp, c, s, skidding);
  }

  /* Swept movement: the step is split so no collision circle moves more than ~70% of its
   * radius (or of a grid cell) per piece, translation and rotation together, and every piece
   * is pushed out of the walls. Then settle() checks no circle centre ended inside a solid
   * (deep penetration from an outside shove): if one did, the last good pose is restored. */
  function pieces(T, dist) {
    const stepMax = Math.max(1.2, Math.min(T.cr, N.CELL) * 0.7);
    return Math.min(16, Math.max(1, Math.ceil(dist / stepMax)));
  }
  function integrate(v, dt) {
    const T = v.T;
    const n = pieces(T, Math.hypot(v.vx, v.vy) * dt + Math.abs(v.av * dt) * T.w * 0.5);
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      v.angle = U.wrapAngle(v.angle + v.av * h);
      v.x += v.vx * h; v.y += v.vy * h;
      collideWorld(v, h);
    }
    settle(v);
  }
  /** Move a vehicle by (dx, dy) as a push (another vehicle, a person against a wall). */
  function shove(v, dx, dy) {
    const L = Math.hypot(dx, dy);
    if (!(L > 1e-6)) return;
    const n = pieces(v.T, L);
    for (let i = 0; i < n; i++) { v.x += dx / n; v.y += dy / n; collideWorld(v, 0); }
    settle(v);
  }
  function circlesClear(v) {
    const T = v.T, blk = N.world.BLOCK[T.mode] || N.world.BLOCK.drive;
    const c = Math.cos(v.angle), s = Math.sin(v.angle);
    for (let i = 0; i < T.co.length; i++) if (blk[N.world.surfaceAt(v.x + c * T.co[i], v.y + s * T.co[i])]) return false;
    return true;
  }
  function settle(v) {
    if (circlesClear(v)) { v.okX = v.x; v.okY = v.y; v.okA = v.angle; return; }
    if (v.okX == null) return; // spawned inside a wall: W.collide's escape search handles it
    v.x = v.okX; v.y = v.okY; v.angle = v.okA;
    v.vx *= -0.15; v.vy *= -0.15; v.av = 0;
  }
  function finiteState(v) { return isFinite(v.x) && isFinite(v.y) && isFinite(v.angle) && isFinite(v.vx) && isFinite(v.vy) && isFinite(v.av); }
  function recover(v) {
    N.err('vehicle.nan', new Error(v.type + ' state was not finite; restored'));
    if (isFinite(v.okX) && isFinite(v.okY)) { v.x = v.okX; v.y = v.okY; v.angle = isFinite(v.okA) ? v.okA : 0; }
    else {
      const f = N.world.findFree(isFinite(v.x) ? v.x : N.player.x, isFinite(v.y) ? v.y : N.player.y, v.T.mode === 'boat' ? 'boat' : 'drive', 40);
      if (f) { v.x = f.x; v.y = f.y; } else { v.alive = false; }
      if (!isFinite(v.angle)) v.angle = 0;
    }
    v.vx = v.vy = v.av = 0; v.speed = 0; v.slip = 0;
  }

  function collideWorld(v, dt) {
    const T = v.T, W = N.world, R = N.render;
    const c = Math.cos(v.angle), s = Math.sin(v.angle);
    let hitMax = 0, hx = 0, hy = 0, scrape = 0;
    for (let i = 0; i < T.co.length; i++) {
      const off = T.co[i];
      const px = v.x + c * off, py = v.y + s * off;
      const res = W.collide(px, py, T.cr, T.mode);
      if (!res.hit) continue;
      v.x += res.x - px; v.y += res.y - py;
      let nx = res.nx, ny = res.ny;
      const nl = Math.hypot(nx, ny);
      if (nl < 1e-6) continue;
      nx /= nl; ny /= nl;
      const vn = v.vx * nx + v.vy * ny;
      if (vn < 0) {
        const imp = -vn * (1 + T.bounce);
        v.vx += nx * imp; v.vy += ny * imp;
        // torque from an off-centre hit (spins the car a little)
        const rx = c * off, ry = s * off;
        v.av += ((rx * ny - ry * nx) * imp) / T.inertia * 0.9;
        if (-vn > hitMax) { hitMax = -vn; hx = res.x - nx * T.cr; hy = res.y - ny * T.cr; }
      }
      // scrape: tangential friction against the wall
      const tx = -ny, ty = nx, vt = v.vx * tx + v.vy * ty;
      const keep = Math.exp(-dt * 2.2);
      v.vx -= tx * vt * (1 - keep); v.vy -= ty * vt * (1 - keep);
      scrape = Math.max(scrape, Math.abs(vt));
      if (Math.abs(vt) > 45 && T.mode !== 'boat' && Math.random() < 0.6) spark(res.x - nx * T.cr, res.y - ny * T.cr, tx * Math.sign(vt), ty * Math.sign(vt));
    }
    if (hitMax > 0) {
      v.wake();
      if (hitMax > 30 && v.bumpT <= 0) {
        v.bumpT = 0.18;
        N.emit('bump', { a: v, b: null, speed: hitMax, x: hx, y: hy, wall: true, vehicle: v });
        if (T.mode !== 'boat') for (let k = 0; k < Math.min(6, hitMax / 18); k++) spark(hx, hy, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
        else foam(hx, hy, 4);
        if (N.player && N.player.vehicle === v && hitMax > 55) R.shake(Math.min(5, hitMax / 45), 0.25);
      }
    }
    v.scraping = scrape > 25;
  }

  // vehicle-vehicle: circle sets, push apart by mass, impulse exchange
  function collideVehicles() {
    const E = N.entities;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive || a.asleep) continue;
      const Ta = a.T;
      const near = E.query(a.x, a.y, Ta.w / 2 + 34, isVehicle);
      for (const b of near) {
        if (b === a || !b.alive) continue;
        if (!b.asleep && b.id < a.id) continue;
        if (b.T.mode !== Ta.mode) continue;
        pairCollide(a, b);
      }
    }
  }
  function isVehicle(e) { return e.kind === 'vehicle'; }

  function pairCollide(a, b) {
    const Ta = a.T, Tb = b.T;
    const ca = Math.cos(a.angle), sa = Math.sin(a.angle), cb = Math.cos(b.angle), sb = Math.sin(b.angle);
    const rr = Ta.cr + Tb.cr;
    let best = 0, bnx = 0, bny = 0, bpx = 0, bpy = 0, boa = 0, bob = 0;
    for (let i = 0; i < Ta.co.length; i++) {
      const ax = a.x + ca * Ta.co[i], ay = a.y + sa * Ta.co[i];
      for (let j = 0; j < Tb.co.length; j++) {
        const bx = b.x + cb * Tb.co[j], by = b.y + sb * Tb.co[j];
        const dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.01, pen = rr - d;
        if (pen > best) { best = pen; bnx = d2 > 0 ? dx / d : 1; bny = d2 > 0 ? dy / d : 0; bpx = (ax + bx) / 2; bpy = (ay + by) / 2; boa = Ta.co[i]; bob = Tb.co[j]; }
      }
    }
    if (best <= 0) return;
    const ma = a.mass, mb = b.mass, im = 1 / ma + 1 / mb;
    shove(a, -bnx * best * (1 / ma) / im, -bny * best * (1 / ma) / im);
    shove(b, bnx * best * (1 / mb) / im, bny * best * (1 / mb) / im);
    const vrel = (b.vx - a.vx) * bnx + (b.vy - a.vy) * bny;
    a.wake(); b.wake();
    if (vrel < 0) {
      const e = 0.3, j = (-(1 + e) * vrel) / im;
      a.vx -= (j / ma) * bnx; a.vy -= (j / ma) * bny;
      b.vx += (j / mb) * bnx; b.vy += (j / mb) * bny;
      a.av += ((ca * boa * -bny + sa * boa * bnx) * (j / ma)) / Ta.inertia * 0.6;
      b.av += ((cb * bob * bny - sb * bob * bnx) * (j / mb)) / Tb.inertia * 0.6;
      if (-vrel > 22 && a.bumpT <= 0 && b.bumpT <= 0) {
        a.bumpT = b.bumpT = 0.2;
        N.emit('bump', { a, b, speed: -vrel, x: bpx, y: bpy, nx: bnx, ny: bny, vehicle: a });
        if (Ta.mode !== 'boat') for (let k = 0; k < Math.min(5, -vrel / 25); k++) spark(bpx, bpy, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
        const pv = N.player && N.player.vehicle;
        if ((pv === a || pv === b) && -vrel > 50) N.render.shake(Math.min(4, -vrel / 50), 0.22);
      }
    }
  }

  // vehicles vs people/animals: oriented-box test, vehicles are (much) heavier
  function collidePeople() {
    const E = N.entities, all = E.all, p = N.player;
    for (let i = 0; i < all.length; i++) {
      const q = all[i];
      if (!q.alive || q.kind === 'vehicle' || q.kind === 'prop' || q.kind === 'pickup' || !q.solid || q.noCollide || q.hidden || q.vehicle) continue;
      const near = E.query(q.x, q.y, (q.r || 4) + 34, isVehicle);
      for (const v of near) {
        if (v.driver === q) continue;
        const T = v.T, c = Math.cos(v.angle), s = Math.sin(v.angle);
        const dx = q.x - v.x, dy = q.y - v.y;
        const lx = dx * c + dy * s, ly = -dx * s + dy * c;
        const hx = T.w / 2, hy = T.d / 2 * (T.cls === 'bike' ? 0.7 : 1), qr = q.r || 4;
        if (Math.abs(lx) > hx + qr || Math.abs(ly) > hy + qr) continue;
        let nlx, nly, pen;
        const cx = U.clamp(lx, -hx, hx), cy = U.clamp(ly, -hy, hy);
        if (cx === lx && cy === ly) { // centre inside the box: push out along the shallow axis
          const px = hx - Math.abs(lx), py = hy - Math.abs(ly);
          if (px < py) { nlx = Math.sign(lx) || 1; nly = 0; pen = px + qr; } else { nlx = 0; nly = Math.sign(ly) || 1; pen = py + qr; }
        } else {
          const ex = lx - cx, ey = ly - cy, d = Math.hypot(ex, ey);
          if (d >= qr) continue;
          nlx = ex / (d || 1); nly = ey / (d || 1); pen = qr - d;
        }
        const nx = nlx * c - nly * s, ny = nlx * s + nly * c;
        const ratio = T.cls === 'bike' && !v.driver ? 0.6 : 1; // people can shove parked cycles
        const want = pen * ratio, qx0 = q.x, qy0 = q.y;
        E.pushTo(q, q.x + nx * want, q.y + ny * want);
        const deficit = want - ((q.x - qx0) * nx + (q.y - qy0) * ny);
        if (deficit > 0.05) { // pinned against a wall: the vehicle stops instead of squashing through
          shove(v, -nx * deficit, -ny * deficit);
          const vin = v.vx * nx + v.vy * ny;
          if (vin > 0) { v.vx -= nx * vin; v.vy -= ny * vin; }
        }
        if (ratio < 1) { shove(v, -nx * pen * (1 - ratio), -ny * pen * (1 - ratio)); v.wake(); }
        // vehicle velocity at the contact (incl. spin) pushing into the person
        const vpx = v.vx - v.av * (dy), vpy = v.vy + v.av * (dx);
        const vn = vpx * nx + vpy * ny;
        if (vn > 18) {
          const kick = Math.min(160, vn * 1.25);
          q.vx = (q.vx || 0) + nx * kick; q.vy = (q.vy || 0) + ny * kick;
          q.knockT = Math.max(q.knockT || 0, 0.6);
          v.vx -= nx * vn * 0.12; v.vy -= ny * vn * 0.12;
          if (!q.bumpT || q.bumpT <= 0) {
            q.bumpT = 0.4;
            N.emit('bump', { a: v, b: q, speed: vn, x: q.x, y: q.y, nx, ny, ped: true, vehicle: v });
          }
        }
        if (q === p && vn > 18) p.knockT = 0.4;
      }
    }
  }

  /* ----------------------------------------------------------- control */
  function playerControl(v) {
    const I = N.input, ctl = v.ctl;
    ctl.brake = false;
    ctl.handbrake = I.down('run');
    if (I.analog) {
      // point-to-steer: turn towards the stick, throttle = stick magnitude
      const mx = I.move.x, my = I.move.y, mag = Math.min(1, Math.hypot(mx, my));
      if (mag < 0.15) { ctl.throttle = 0; ctl.steer = 0; v.revMode = false; return; }
      const target = Math.atan2(my, mx);
      const diff = U.angleDiff(v.angle, target), ad = Math.abs(diff);
      if (v.revMode && ad < 1.7) v.revMode = false;
      if (!v.revMode && ad > 2.5 && v.speed < 28) v.revMode = true;
      if (v.revMode) {
        const rdiff = U.angleDiff(v.angle + Math.PI, target);
        ctl.throttle = -mag;
        ctl.steer = U.clamp(-rdiff * 2.2, -1, 1);
      } else {
        ctl.throttle = ad > 2.5 ? -mag : mag * (ad > 1.4 ? 0.5 : 1);
        ctl.steer = U.clamp(diff * 2.4, -1, 1);
      }
    } else {
      v.revMode = false;
      ctl.throttle = (I.down('up') ? 1 : 0) - (I.down('down') ? 1 : 0);
      ctl.steer = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0);
    }
  }
  function idleControl(v) {
    const ctl = v.ctl;
    ctl.throttle = 0; ctl.steer = 0; ctl.handbrake = false; ctl.brake = true;
  }

  /* -------------------------------------------------- enter / exit */
  const SHOUTS = ['ARRE! MERI GAADI!', 'OYE! RUKO!', 'CHOR! CHOR!', 'KYA RE?!', 'AMMA! MY VEHICLE!', 'PAKDO USKO!'];

  /** Put an actor (usually the player) into a vehicle. Occupied vehicles are "borrowed". */
  function enter(actor, v, opts) {
    opts = opts || {};
    if (!actor || !v || !v.alive || actor.vehicle) return false;
    if (v.driver && v.driver !== actor) borrow(v, actor);
    else if (actor === N.player && !opts.quiet) { try { takeParked(v); } catch (e) { N.err('vehicles.take', e); } }
    if (v.fallen) v.fallen = null;
    const T = v.T;
    actor.vehicle = v; v.driver = actor; v.controller = null;
    actor.mode = 'drive';
    actor.x = v.x; actor.y = v.y; actor.vx = v.vx; actor.vy = v.vy; actor.angle = v.angle;
    actor._noCollideWas = actor.noCollide; actor.noCollide = true;
    v.wake(); v.doorT = T.door ? 0.45 : 0; v.revMode = false;
    if (actor === N.player) {
      N.input.setLabel('run', T.cls === 'bike' || T.cls === 'boat' ? 'BRAKE' : 'H-BRAKE');
      N.emit('player:enterVehicle', { vehicle: v });
      if (T.radio) N.emit('radio:enter', { vehicle: v });
    }
    N.emit('vehicle:enter', { vehicle: v, actor });
    return true;
  }

  function borrow(v, actor) {
    const d = v.driver;
    v.driver = null;
    const spot = exitSpot(v, 'walk') || { x: v.x, y: v.y };
    let ped = null;
    if (d && typeof d === 'object' && d instanceof N.Actor) {
      d.vehicle = null; d.x = spot.x; d.y = spot.y;
      if (N.entities.all.indexOf(d) < 0) N.entities.add(d);
      ped = d;
      if (typeof d.onEvicted === 'function') { try { d.onEvicted(v, actor); } catch (e) { N.err('onEvicted', e); } }
    } else {
      ped = N.entities.add(new AngryDriver(spot.x, spot.y, v, d && d.look));
    }
    N.emit('vehicle:borrowed', { vehicle: v, driver: ped, by: actor, x: spot.x, y: spot.y });
    if (actor === N.player && N.wanted && N.wanted.add) N.wanted.add(1);
  }

  /**
   * Taking a vehicle nobody is sitting on (systems §3.3). Only vehicles tagged `parked` (traffic.js
   * parks them with opts.parked) and the family Chetak raise the Chappal Meter; seeded, hired,
   * owned, mission and debug vehicles never do. Heat goes through N.wanted.addHeat (wanted.js);
   * with the stub meter (no heat model) nothing happens.
   */
  function takeParked(v) {
    const p = N.player, W = N.wanted, T = v.T;
    if (v.borrowedBy === p || v.hire || v.hired || v.owned || v.npcOwned) return;
    const heat = (h, why) => { if (W && typeof W.addHeat === 'function' && h > 0) W.addHeat(h, why); };
    if (T.id === 'family_chetak' || v.special === 'family') {
      v.borrowedBy = p;
      if (unlocked('chetak', 30) || (N.missions && N.missions.active)) return;
      const m = N.clock.minutes, dow = N.calendar && N.calendar.weekday ? N.calendar.weekday() : 1;
      const nannaHome = m >= 18 * 60 + 30 || m < 8 * 60 + 30 || dow === 0 || !!(N.flags && N.flags.festival);
      heat(nannaHome ? TUNE.heatChetakNanna : TUNE.heatChetak, 'chetak');
      if (N.hud) N.hud.toast(nannaHome ? 'Chitti: "Sreenivas-garu ka Chetak kidhar gaya?" She saw.' : '"Sreenivas-garu ka Chetak kidhar gaya?"', 2600);
      return;
    }
    if (!v.parked) return;
    v.borrowedBy = p;
    if (N.missions && N.missions.active) return;
    if (T.pedal) {
      if (Math.random() < TUNE.ownerShout) {
        const spot = exitSpot(v, 'walk') || { x: v.x + 10, y: v.y };
        const owner = N.entities.add(new AngryDriver(spot.x, spot.y, v, null));
        owner.shout = 'OYE! MERI CYCLE!'; owner.chase = 6;
        if (witnessed(v)) heat(TUNE.heatCycle, 'borrow');
      }
      return;
    }
    heat(T.cls === 'auto' || witnessed(v) ? TUNE.heatWitnessed : TUNE.heatParked, 'borrow');
  }
  /** Is any pedestrian within TUNE.witnessR of the vehicle with a clear line of sight? */
  function witnessed(v) {
    const W = N.world;
    for (const q of N.entities.query(v.x, v.y, TUNE.witnessR, (e) => (e.kind === 'ped' || e.kind === 'npc') && e !== N.player && e.alive !== false)) {
      try { if (!W.raycast(q.x, q.y, v.x, v.y, 'walk').hit) return true; } catch (e) { return true; }
    }
    return false;
  }

  /** Nearest free spot next to a vehicle: left door first, then right, rear, front. */
  function exitSpot(v, mode) {
    const T = v.T, W = N.world;
    const c = Math.cos(v.angle), s = Math.sin(v.angle);
    const lx = s, ly = -c; // left of heading
    const side = T.d / 2 + 6;
    const tries = [
      [lx * side + c * 2, ly * side + s * 2], [-lx * side + c * 2, -ly * side + s * 2],
      [-c * (T.w / 2 + 6), -s * (T.w / 2 + 6)], [c * (T.w / 2 + 6), s * (T.w / 2 + 6)],
      [lx * (side + 8), ly * (side + 8)], [-lx * (side + 8), -ly * (side + 8)],
    ];
    const reach = (x, y) => T.mode === 'boat' || !W.raycast(v.x, v.y, x, y, 'walk').hit;
    for (const t of tries) {
      const x = v.x + t[0], y = v.y + t[1];
      if (W.isWalkable(x, y) && !W.collide(x, y, 3.4, 'walk').hit && reach(x, y)) return { x, y };
    }
    if (T.mode === 'boat') { // look further for a shore
      for (let rad = 14; rad <= 46; rad += 4) {
        for (let a = 0; a < TAU; a += TAU / 16) {
          const x = v.x + Math.cos(a) * (T.w / 2 + rad * 0.5), y = v.y + Math.sin(a) * (T.d / 2 + rad);
          if (W.isWalkable(x, y) && !W.collide(x, y, 3.4, 'walk').hit) return { x, y };
        }
      }
      return null;
    }
    // squeezed in: any free spot on a ring around the body reachable without crossing a wall
    for (let m = 6; m <= 30; m += 4) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU, ex = Math.cos(a) * (T.w / 2 + m), ey = Math.sin(a) * (T.d / 2 + m);
        const x = v.x + c * ex - s * ey, y = v.y + s * ex + c * ey;
        if (W.isWalkable(x, y) && !W.collide(x, y, 3.4, 'walk').hit && reach(x, y)) return { x, y };
      }
    }
    return W.findFree(v.x + lx * side, v.y + ly * side, mode || 'walk', 20);
  }

  /** Get an actor out of its vehicle (instant = no checks, used by teleports). */
  function exit(actor, instant) {
    const v = actor && actor.vehicle;
    if (!v) return false;
    let spot = exitSpot(v, 'walk');
    if (!spot) {
      if (!instant) { if (actor === N.player && N.hud) N.hud.toast(v.T.mode === 'boat' ? 'Too deep to jump out! Steer to the shore.' : 'No room to get out here!', 2200); return false; }
      // forced (teleport / despawn): nearest dry land, however far (mid-lake boats)
      spot = N.world.findFree(v.x, v.y, 'walk', 260) || { x: v.x, y: v.y };
    }
    actor.vehicle = null; v.driver = null;
    actor.mode = 'foot';
    actor.noCollide = !!actor._noCollideWas;
    actor.x = spot.x; actor.y = spot.y;
    actor.vx = v.vx * 0.25; actor.vy = v.vy * 0.25;
    v.doorT = v.T.door && !instant ? 0.45 : 0; v.ctl.throttle = 0; v.ctl.steer = 0; v.ctl.handbrake = false;
    if (actor === N.player) {
      N.input.setLabel('run', null);
      N.emit('player:exitVehicle', { vehicle: v });
      if (v.T.radio) N.emit('radio:exit', { vehicle: v });
      if (zoomOwned) { N.render.baseZoom = 1; zoomOwned = false; }
    }
    N.emit('vehicle:exit', { vehicle: v, actor });
    return true;
  }

  /** Distance from a point to a vehicle's footprint (0 inside). */
  function distTo(v, x, y) {
    const c = Math.cos(v.angle), s = Math.sin(v.angle), dx = x - v.x, dy = y - v.y;
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    const ex = Math.max(0, Math.abs(lx) - v.T.w / 2), ey = Math.max(0, Math.abs(ly) - v.T.d / 2);
    return Math.hypot(ex, ey);
  }

  function nearestEnterable(p) {
    const near = N.entities.query(p.x, p.y, 18 + 34, isVehicle);
    let best = null, bd = 18;
    for (const v of near) {
      if (!v.alive || v.noEnter || v.driver === p || v.fallen) continue;
      // buses and lorries: the player rides buses as a passenger (shops / traffic), never drives them
      if (v.T.playerNoEnter && !V.allowHeavy) continue;
      if (v.driver && !(v.driver.npc || v.driver instanceof N.Actor)) continue;
      const d = distTo(v, p.x, p.y);
      if (d < bd) { bd = d; best = v; }
    }
    return best ? { v: best, d: bd } : null;
  }

  /* --------------------------------------------------- angry driver */
  class AngryDriver extends N.Actor {
    constructor(x, y, v, look) {
      super({ kind: 'ped', x, y, r: 3.4, mass: 1, solid: true });
      this.look = look || N.people.randomLook(null, 'man');
      this.anim = { phase: 0, speed: 0, run: false };
      this.t = 0; this.v = v;
      this.shout = SHOUTS[(Math.random() * SHOUTS.length) | 0];
      this.angle = Math.atan2(v.y - y, v.x - x);
    }
    update(dt) {
      this.t += dt;
      if (this.knockT > 0) this.knockT -= dt;
      if (this.bumpT > 0) this.bumpT -= dt;
      const sp = Math.hypot(this.vx, this.vy);
      const pl = N.player;
      if (this.chase > 0 && this.t > 0.6 && this.t < 0.6 + this.chase && pl) { // "Oye! Meri cycle!": chase on foot for a bit
        const a = Math.atan2(pl.y - this.y, pl.x - this.x);
        this.angle = a;
        this.vx += (Math.cos(a) * 60 - this.vx) * Math.min(1, dt * 6); this.vy += (Math.sin(a) * 60 - this.vy) * Math.min(1, dt * 6);
        this.anim.speed = 1; this.anim.run = true; this.anim.phase += sp * dt * 0.2;
        if (this.t > 0.5 + this.chase) { this.chase = 0; this.t = 2.6; this.anim.run = false; }
      } else if (this.t < 2.6) { // shake a fist at the vehicle
        this.vx *= 0.85; this.vy *= 0.85;
        if (this.v && this.v.alive) this.angle = Math.atan2(this.v.y - this.y, this.v.x - this.x);
        this.anim.speed = 0.3; this.anim.phase += dt * 14;
      } else { // stomp off
        const a = this.walkA == null ? (this.walkA = this.angle + Math.PI + (Math.random() - 0.5)) : this.walkA;
        this.angle = a;
        this.vx += (Math.cos(a) * 40 - this.vx) * Math.min(1, dt * 6); this.vy += (Math.sin(a) * 40 - this.vy) * Math.min(1, dt * 6);
        this.anim.speed = Math.min(1, sp / 45); this.anim.phase += sp * dt * 0.26;
      }
      const c = N.world.collide(this.x + this.vx * dt, this.y + this.vy * dt, this.r, 'walk');
      if (c.hit && this.t > 2.6) this.walkA = (this.walkA || 0) + 1.3;
      this.x = c.x; this.y = c.y;
      if (this.t > 14 && !N.render.inView(this.x, this.y, 40)) this.alive = false;
    }
    draw() {
      const R = N.render, D = N.draw, self = this;
      R.queue('shadow', 0, () => D.shadow(self.x, self.y, 7, 9, self.angle, 1.5));
      R.queue('actors', this.y, () => D.sprite(self.x, self.y, self.angle, 8, (ctx) => N.people.draw(ctx, self.look, self.anim)));
      if (this.t < 3.2) R.queue('sky', 0, (ctx) => speechBubble(ctx, self.x, self.y, self.shout, Math.min(1, (3.2 - self.t) * 3)));
    }
  }

  function speechBubble(ctx, x, y, text, alpha) {
    const R = N.render, k = R.k(16);
    const X = Math.round(R.sx(x, k)), Y = Math.round(R.sy(y, k)) - 16;
    const c = N.draw.pixelTextCanvas(text, '#1a1214');
    const w = c.width + 6, h = c.height + 5;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#1a1214';
    ctx.fillRect(X - w / 2 - 1, Y - h / 2 - 1, w + 2, h + 2);
    ctx.fillStyle = '#fff8e6';
    ctx.fillRect(X - w / 2, Y - h / 2, w, h);
    ctx.fillStyle = '#1a1214';
    ctx.beginPath(); ctx.moveTo(X - 3, Y + h / 2); ctx.lineTo(X + 2, Y + h / 2); ctx.lineTo(X - 2, Y + h / 2 + 4); ctx.closePath(); ctx.fill();
    ctx.drawImage(c, Math.round(X - c.width / 2), Math.round(Y - c.height / 2));
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ spawn */
  function spawn(type, x, y, angle, opts) {
    if (!TYPES[type]) { N.err('vehicles.spawn', new Error('unknown vehicle type ' + type)); return null; }
    if (!isFinite(x) || !isFinite(y)) { N.err('vehicles.spawn', new Error('bad position for ' + type + ': ' + x + ',' + y)); return null; }
    if (!isFinite(angle)) angle = 0;
    const v = new Vehicle(type, x, y, angle || 0, opts);
    v.sid = ++seq;
    N.entities.add(v);
    list.push(v);
    N.emit('vehicle:spawn', v);
    return v;
  }
  function remove(v) {
    if (!v) return;
    if (v.driver && v.driver === N.player) exit(N.player, true);
    N.entities.remove(v);
    const i = list.indexOf(v); if (i >= 0) list.splice(i, 1);
  }

  /* ===================================================== decals + fx */
  const SKID_MAX = 900;
  const skid = new Float32Array(SKID_MAX * 6); // x0 y0 x1 y1 width birth
  let skidN = 0, skidHead = 0;
  function addSkid(x0, y0, x1, y1, w) {
    const o = skidHead * 6;
    skid[o] = x0; skid[o + 1] = y0; skid[o + 2] = x1; skid[o + 3] = y1; skid[o + 4] = w; skid[o + 5] = N.time.real;
    skidHead = (skidHead + 1) % SKID_MAX; if (skidN < SKID_MAX) skidN++;
  }
  function skidMarks(v, c, s) {
    const T = v.T;
    const rx = -T.w * 0.32;
    if (T.cls === 'bike') {
      const x = v.x + c * rx, y = v.y + s * rx;
      if (v.skL) addSkid(v.skL[0], v.skL[1], x, y, 1.2);
      v.skL = [x, y]; v.skR = null;
      return;
    }
    const hw = T.d / 2 - 1.6;
    const lxp = v.x + c * rx + s * hw, lyp = v.y + s * rx - c * hw;
    const rxp = v.x + c * rx - s * hw, ryp = v.y + s * rx + c * hw;
    const w = T.cls === 'heavy' ? 2.6 : 2;
    if (v.skL) addSkid(v.skL[0], v.skL[1], lxp, lyp, w);
    if (v.skR) addSkid(v.skR[0], v.skR[1], rxp, ryp, w);
    v.skL = [lxp, lyp]; v.skR = [rxp, ryp];
    if (v.driver === N.player && Math.random() < 0.08) N.emit('sfx', { name: 'skid', x: v.x, y: v.y });
  }
  function drawSkids(ctx) {
    if (!skidN) return;
    const R = N.render, v = R.view, now = N.time.real, Z = R.Z;
    const life = 40;
    ctx.lineCap = 'round';
    for (let b = 0; b < 3; b++) {
      const a0 = (b * life) / 3, a1 = ((b + 1) * life) / 3;
      ctx.beginPath();
      let any = false, wsum = 0, wn = 0;
      for (let i = 0; i < skidN; i++) {
        const o = i * 6, age = now - skid[o + 5];
        if (age < a0 || age >= a1) continue;
        const x0 = skid[o], y0 = skid[o + 1], x1 = skid[o + 2], y1 = skid[o + 3];
        if (Math.max(x0, x1) < v.x0 - 4 || Math.min(x0, x1) > v.x1 + 4 || Math.max(y0, y1) < v.y0 - 4 || Math.min(y0, y1) > v.y1 + 4) continue;
        ctx.moveTo(R.sx(x0, Z), R.sy(y0, Z)); ctx.lineTo(R.sx(x1, Z), R.sy(y1, Z));
        wsum += skid[o + 4]; wn++; any = true;
      }
      if (!any) continue;
      ctx.lineWidth = Math.max(1, (wsum / wn) * Z);
      ctx.strokeStyle = 'rgba(22,16,20,' + (0.42 * (1 - b / 3)).toFixed(3) + ')';
      ctx.stroke();
    }
  }

  // particles: smoke, dust, sparks, foam
  const PMAX = 240;
  const parts = [];
  function particle(kind, x, y, vx, vy, life, r, col, z) {
    let p;
    if (parts.length < PMAX) { p = {}; parts.push(p); } else { p = parts[(particle.i = ((particle.i || 0) + 1) % PMAX)]; }
    p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.t = 0; p.life = life; p.r = r; p.col = col; p.z = z || 1;
    return p;
  }
  function spark(x, y, dx, dy) {
    const sp = 40 + Math.random() * 70;
    particle('spark', x, y, dx * sp + (Math.random() - 0.5) * 30, dy * sp + (Math.random() - 0.5) * 30, 0.18 + Math.random() * 0.2, 1, Math.random() < 0.5 ? '#ffe9a0' : '#ffb040', 3);
  }
  function foam(x, y, n) {
    for (let i = 0; i < n; i++) particle('foam', x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 1.4 + Math.random() * 0.8, 1.6 + Math.random() * 1.5, '#e8f6f4', 0.5);
  }
  function effects(v, dt, surf, sp, c, s, skidding) {
    const T = v.T, S = N.SURF;
    const rearX = v.x - c * T.w * 0.5, rearY = v.y - s * T.w * 0.5;
    if (T.mode === 'boat') {
      if (sp > 8 && Math.random() < dt * (6 + sp * 0.25)) {
        const side = Math.random() < 0.5 ? -1 : 1;
        particle('foam', rearX + s * side * 2, rearY - c * side * 2, -c * 8 + s * side * 10, -s * 8 - c * side * 10, 1.6 + Math.random(), 1.4 + Math.random() * 1.6, '#e8f6f4', 0.4);
      }
      return;
    }
    // exhaust: two-stroke blue smoke puffs (autos!), diesel soot
    if (T.smoke && v.driver) {
      v.smokeT -= dt * (0.6 + Math.abs(v.throttle) * 2.2 + sp / 90);
      if (v.smokeT <= 0) {
        v.smokeT = T.smoke === 'diesel' ? 0.32 : T.smoke === 'light' ? 0.6 : 0.4;
        const col = T.smoke === 'diesel' ? '#4a4648' : T.smoke === '2t' ? '#b8c4d4' : '#d0d4dc';
        const ex = v.x - c * (T.w * 0.5 + 1) + s * (T.d * 0.22), ey = v.y - s * (T.w * 0.5 + 1) - c * (T.d * 0.22);
        particle('smoke', ex, ey, -c * 10 + (Math.random() - 0.5) * 6, -s * 10 + (Math.random() - 0.5) * 6, 0.9 + Math.random() * 0.6, T.cls === 'heavy' ? 2.4 : 1.25, col, 2);
      }
    }
    // dust from dirt / sand / grass at speed, and tyre smoke when skidding on tarmac
    const dirt = surf === S.GROUND || surf === S.SAND || surf === S.GRASS;
    if ((dirt && sp > 35) || skidding) {
      if (Math.random() < dt * (dirt ? 4 + sp * 0.12 : 18)) {
        const col = surf === S.SAND ? '#d8c49a' : surf === S.GRASS ? '#a8b88a' : dirt ? '#c4a07a' : '#d6d2d0';
        particle('dust', rearX + (Math.random() - 0.5) * T.d, rearY + (Math.random() - 0.5) * T.d, -v.vx * 0.15 + (Math.random() - 0.5) * 10, -v.vy * 0.15 + (Math.random() - 0.5) * 10, 0.9 + Math.random() * 0.6, 2.2, col, 1);
      }
    }
  }
  function updateParticles(dt) {
    for (const p of parts) {
      if (p.t >= p.life) continue;
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const drag = p.kind === 'spark' ? 2 : 2.5;
      p.vx *= Math.exp(-dt * drag); p.vy *= Math.exp(-dt * drag);
      if (p.kind === 'smoke' || p.kind === 'dust') p.z += dt * 6;
    }
  }
  function drawParticles(ctx) {
    const R = N.render;
    for (const p of parts) {
      if (p.t >= p.life) continue;
      if (!R.inView(p.x, p.y, 10)) continue;
      const f = p.t / p.life, k = R.k(p.z);
      const X = R.sx(p.x, k), Y = R.sy(p.y, k);
      if (p.kind === 'spark') {
        ctx.globalAlpha = 1 - f;
        ctx.fillStyle = p.col;
        ctx.fillRect(Math.round(X), Math.round(Y), Math.max(1, k), Math.max(1, k));
        continue;
      }
      const grow = p.kind === 'foam' ? 1 + f * 1.5 : 1 + f * 2.2;
      ctx.globalAlpha = (p.kind === 'foam' ? 0.75 : p.kind === 'dust' ? 0.42 : 0.3) * (1 - f);
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(X, Y, Math.max(0.6, p.r * grow * k), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ========================================================== lights */
  const glows = []; // per frame: [x, y, h, r, kind] flattened -> drawn after the darkness
  let glowRed = null, glowWhite = null, glowAmber = null;
  function glowSprite(col) {
    const c = N.render.makeCanvas(24, 24), g = c.getContext('2d');
    const [r, gg, b] = U.hexToRgb(col);
    const gr = g.createRadialGradient(12, 12, 0, 12, 12, 12);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(' + r + ',' + gg + ',' + b + ',0.95)');
    gr.addColorStop(0.5, 'rgba(' + r + ',' + gg + ',' + b + ',0.3)');
    gr.addColorStop(1, 'rgba(' + r + ',' + gg + ',' + b + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 24, 24);
    return c;
  }
  function lightsFor(v) {
    const R = N.render, night = R.night || 0;
    const T = v.T;
    if (night < 0.05 || !(T.lights || (T.id === 'chinnu_cycle' && v.driver && unlocked('dynamo', 20)))) return;
    const on = !!v.driver || v.controller || v.lightsOn;
    const c = Math.cos(v.angle), s = Math.sin(v.angle);
    const fx = v.x + c * T.w / 2, fy = v.y + s * T.w / 2;
    if (on) {
      const reach = T.cls === 'bike' ? 0.75 : T.cls === 'heavy' ? 1.25 : 1;
      R.lights.push({ x: fx + c * 16 * reach, y: fy + s * 16 * reach, r: 26 * reach, color: '#fff2c8', intensity: 0.85, glow: false });
      R.lights.push({ x: fx + c * 40 * reach, y: fy + s * 40 * reach, r: 38 * reach, color: '#fff2c8', intensity: 0.75 });
      // lamp bulbs
      const hw = T.cls === 'bike' || T.cls === 'auto' ? 0 : T.d / 2 - 2.6;
      const h = T.cls === 'bike' ? 7 : T.cls === 'heavy' ? 5 : 5;
      if (hw) { glows.push(fx - s * hw, fy + c * hw, h, 5, 0, fx + s * hw, fy - c * hw, h, 5, 0); }
      else glows.push(fx, fy, T.cls === 'auto' ? 4 : h, 4.5, 0);
    }
    // tail lamps (also when parked-but-occupied)
    if (on && T.cls !== 'boat') {
      const bx = v.x - c * T.w / 2, by = v.y - s * T.w / 2;
      const hw = T.cls === 'bike' ? 0 : T.d / 2 - 2;
      const braking = v.ctl.throttle < -0.1 || v.ctl.brake || v.ctl.handbrake;
      const r = braking ? 5 : 3.2;
      if (hw) glows.push(bx - s * hw, by + c * hw, 4, r, 1, bx + s * hw, by - c * hw, 4, r, 1);
      else glows.push(bx, by, 5, r, 1);
    }
    if (T.cls === 'boat' && on) glows.push(v.x, v.y, 12, 4, 2);
    if (v.beacon && Math.sin(N.time.real * 9) > 0) glows.push(v.x, v.y, T.h + 2, 6, 1);
  }
  function drawGlows(ctx) {
    const R = N.render, night = R.night || 0;
    if (!glows.length) return;
    if (night < 0.05) { glows.length = 0; return; }
    if (!glowWhite) { glowWhite = glowSprite('#fff0b0'); glowRed = glowSprite('#ff2a1a'); glowAmber = glowSprite('#ffb040'); }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, night * 1.2);
    for (let i = 0; i < glows.length; i += 5) {
      const k = R.k(glows[i + 2]), X = R.sx(glows[i], k), Y = R.sy(glows[i + 1], k), r = glows[i + 3] * k * 1.6;
      const spr = glows[i + 4] === 1 ? glowRed : glows[i + 4] === 2 ? glowAmber : glowWhite;
      ctx.drawImage(spr, X - r, Y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    glows.length = 0;
  }

  /* ============================================== drawing primitives */
  // Current vehicle frame (set by begin()) — keeps the hot helpers allocation free.
  let fc = 1, fs = 0, fx0 = 0, fy0 = 0, fz = 0;
  let PX = 0, PY = 0;
  function begin(v) { fc = Math.cos(v.angle); fs = Math.sin(v.angle); fx0 = v.x; fy0 = v.y; fz = v.z || 0; }
  const wxOf = (lx, ly) => fx0 + fc * lx - fs * ly;
  const wyOf = (lx, ly) => fy0 + fs * lx + fc * ly;
  function proj(lx, ly, h) {
    const R = N.render, k = R.k(h + fz);
    PX = R.sx(fx0 + fc * lx - fs * ly, k); PY = R.sy(fy0 + fs * lx + fc * ly, k);
  }
  /** Local-coordinate drawing on a horizontal plane at height h (fn draws facing +x). */
  function topRaw(ctx, h, fn) { top(ctx, h, fn); }
  function top(ctx, h, fn) {
    const R = N.render, k = R.k(h + fz);
    ctx.setTransform(fc * k, fs * k, -fs * k, fc * k, R.sx(fx0, k), R.sy(fy0, k));
    fn(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Rounded-rectangle footprint (flat [x,y,...], clockwise on screen): length L, width W,
  // front corner radius rf, rear rr, optional front/back width taper.
  const shapeCache = new Map();
  function rrect(L, W, rf, rr, taperF, taperR) {
    const key = L + '|' + W + '|' + rf + '|' + rr + '|' + (taperF || 0) + '|' + (taperR || 0);
    let p = shapeCache.get(key);
    if (p) return p;
    p = [];
    const hx = L / 2, hy = W / 2, tf = taperF || 0, tr = taperR || 0;
    const corner = (cx, cy, r, a0) => {
      const n = r > 3.5 ? 2 : 1;
      for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * (Math.PI / 2); p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    };
    corner(hx - rf, hy - tf - rf, rf, 0);          // front-right
    corner(-hx + rr, hy - tr - rr, rr, Math.PI / 2); // rear-right
    corner(-hx + rr, -hy + tr + rr, rr, Math.PI);   // rear-left
    corner(hx - rf, -hy + tf + rf, rf, Math.PI * 1.5); // front-left
    shapeCache.set(key, p);
    return p;
  }

  /**
   * Extruded convex local polygon (flat array) from h0 to h1. wall: colour or fn(i)->colour
   * (sun-shaded per face); roof: colour|false. face(ctx, i, ax, ay, bx, by) decorates a visible
   * wall (world coords of its base edge); topFn(ctx) draws on the roof in local coords.
   */
  function prism(ctx, pts, h0, h1, wall, roof, face, topFn) {
    const R = N.render, n = pts.length >> 1;
    const camX = R.camX, camY = R.camY;
    if (h1 - h0 > 0.05 && wall) {
      let area = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) area += pts[j * 2] * pts[i * 2 + 1] - pts[i * 2] * pts[j * 2 + 1];
      const sgn = area > 0 ? 1 : -1;
      const k0 = R.k(h0 + fz), k1 = R.k(h1 + fz);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = wxOf(pts[i * 2], pts[i * 2 + 1]), ay = wyOf(pts[i * 2], pts[i * 2 + 1]);
        const bx = wxOf(pts[j * 2], pts[j * 2 + 1]), by = wyOf(pts[j * 2], pts[j * 2 + 1]);
        const ex = bx - ax, ey = by - ay;
        const nx = ey * sgn, ny = -ex * sgn;
        if (nx * (camX - ax) + ny * (camY - ay) <= 0) continue;
        const nl = Math.hypot(nx, ny) || 1;
        const col = typeof wall === 'function' ? wall(i) : wall;
        if (!col) continue;
        ctx.beginPath();
        ctx.moveTo(R.sx(ax, k0), R.sy(ay, k0)); ctx.lineTo(R.sx(bx, k0), R.sy(by, k0));
        ctx.lineTo(R.sx(bx, k1), R.sy(by, k1)); ctx.lineTo(R.sx(ax, k1), R.sy(ay, k1));
        ctx.closePath();
        ctx.fillStyle = R.shaded(col, R.shadeNormal(nx / nl, ny / nl));
        ctx.fill();
        if (face) face(ctx, i, ax, ay, bx, by, nx / nl, ny / nl);
      }
    }
    if (roof) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) { proj(pts[i * 2], pts[i * 2 + 1], h1); if (i) ctx.lineTo(PX, PY); else ctx.moveTo(PX, PY); }
      ctx.closePath();
      ctx.fillStyle = roof; ctx.fill();
    }
    if (topFn) top(ctx, h1, topFn);
  }
  /** A band on a wall: along the base edge a->b from t0..t1, heights hA..hB. */
  function band(ctx, ax, ay, bx, by, t0, t1, hA, hB, col, nx, ny) {
    const R = N.render, kA = R.k(hA + fz), kB = R.k(hB + fz);
    const x0 = ax + (bx - ax) * t0, y0 = ay + (by - ay) * t0, x1 = ax + (bx - ax) * t1, y1 = ay + (by - ay) * t1;
    ctx.beginPath();
    ctx.moveTo(R.sx(x0, kA), R.sy(y0, kA)); ctx.lineTo(R.sx(x1, kA), R.sy(y1, kA));
    ctx.lineTo(R.sx(x1, kB), R.sy(y1, kB)); ctx.lineTo(R.sx(x0, kB), R.sy(y0, kB));
    ctx.closePath();
    ctx.fillStyle = nx != null ? R.shaded(col, R.shadeNormal(nx, ny)) : col;
    ctx.fill();
  }
  /**
   * Map a pixel-text canvas onto a wall band (bus / lorry lettering). The text is kept
   * upright and left-to-right on screen; faces whose base edge runs mostly vertically on
   * screen (text would be sideways) or that are too thin to read are skipped.
   */
  function wallText(ctx, ax, ay, bx, by, t0, t1, hA, hB, canvas) {
    const R = N.render, kA = R.k(hA + fz), kB = R.k(hB + fz);
    const x0 = ax + (bx - ax) * t0, y0 = ay + (by - ay) * t0, x1 = ax + (bx - ax) * t1, y1 = ay + (by - ay) * t1;
    // base (hA) and top (hB) corners on screen
    const B0x = R.sx(x0, kA), B0y = R.sy(y0, kA), B1x = R.sx(x1, kA), B1y = R.sy(y1, kA);
    const T0x = R.sx(x0, kB), T0y = R.sy(y0, kB), T1x = R.sx(x1, kB), T1y = R.sy(y1, kB);
    const ex = B1x - B0x, ey = B1y - B0y, el = Math.hypot(ex, ey);
    const dx = B0x - T0x, dy = B0y - T0y, dl = Math.hypot(dx, dy);
    if (dl < 3.5 || el < canvas.width * 0.6 || Math.abs(ex) < el * 0.6) return;
    const startT0 = ex > 0;              // text runs from t0 -> t1 when that is rightwards
    const topIsTop = dy > 0;             // wall top above the base on screen: normal upright text
    let ox, oy, ux, uy, wx, wy;
    if (startT0) { ox = topIsTop ? T0x : B0x; oy = topIsTop ? T0y : B0y; ux = (topIsTop ? T1x : B1x) - ox; uy = (topIsTop ? T1y : B1y) - oy; wx = (topIsTop ? B0x : T0x) - ox; wy = (topIsTop ? B0y : T0y) - oy; }
    else { ox = topIsTop ? T1x : B1x; oy = topIsTop ? T1y : B1y; ux = (topIsTop ? T0x : B0x) - ox; uy = (topIsTop ? T0y : B0y) - oy; wx = (topIsTop ? B1x : T1x) - ox; wy = (topIsTop ? B1y : T1y) - oy; }
    ctx.setTransform(ux / canvas.width, uy / canvas.width, wx / canvas.height, wy / canvas.height, ox, oy);
    ctx.drawImage(canvas, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  /** Pixel text drawn on a local plane, flipped so it always reads left-to-right. */
  function readableText(ctx, lx, ly, h, str, col, along) {
    const c = N.draw.pixelTextCanvas(str, col);
    const R = N.render, k = R.k(h + fz);
    // text axis in world: along = true -> vehicle's +x, else -> vehicle's +y
    let ux = along ? fc : -fs, uy = along ? fs : fc;
    if (ux < -0.2 || (Math.abs(ux) <= 0.2 && uy > 0)) { ux = -ux; uy = -uy; }
    const vx = -uy, vy = ux;
    const X = R.sx(wxOf(lx, ly), k), Y = R.sy(wyOf(lx, ly), k);
    ctx.setTransform(ux * k, uy * k, vx * k, vy * k, X, Y);
    ctx.drawImage(c, -c.width / 2, -c.height / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  /**
   * Tapered prism: bottom polygon `bot` at h0, top polygon `tp` (same vertex count, local
   * flat arrays) at h1. Sloped faces (windscreens, tumblehome) are visible from straight
   * above, which is what makes small cars read in a top-down view. Faces are culled in
   * screen space. wall: colour | fn(i) -> colour; face(ctx, i) decorates the current face
   * with fq(ctx, s0, s1, u0, u1, colour) (s along the edge, u from bottom 0 to top 1).
   */
  const SB = new Float32Array(64), ST = new Float32Array(64);
  let FB0x = 0, FB0y = 0, FB1x = 0, FB1y = 0, FT0x = 0, FT0y = 0, FT1x = 0, FT1y = 0, FH0 = 0, FH1 = 0, FSH = 1;
  function frustum(ctx, bot, tp, h0, h1, wall, roof, face, topFn) {
    const R = N.render, n = bot.length >> 1;
    const k0 = R.k(h0 + fz), k1 = R.k(h1 + fz);
    let area = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) area += bot[j * 2] * bot[i * 2 + 1] - bot[i * 2] * bot[j * 2 + 1];
    const sgn = area > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      SB[i * 2] = R.sx(wxOf(bot[i * 2], bot[i * 2 + 1]), k0); SB[i * 2 + 1] = R.sy(wyOf(bot[i * 2], bot[i * 2 + 1]), k0);
      ST[i * 2] = R.sx(wxOf(tp[i * 2], tp[i * 2 + 1]), k1); ST[i * 2 + 1] = R.sy(wyOf(tp[i * 2], tp[i * 2 + 1]), k1);
    }
    if (wall && h1 - h0 > 0.05) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = SB[i * 2], ay = SB[i * 2 + 1], bx = SB[j * 2], by = SB[j * 2 + 1];
        const cx = ST[j * 2], cy = ST[j * 2 + 1], dx = ST[i * 2], dy = ST[i * 2 + 1];
        const qa = (ax * by - bx * ay) + (bx * cy - cx * by) + (cx * dy - dx * cy) + (dx * ay - ax * dy);
        if (qa * sgn <= 0.05) continue;
        const col = typeof wall === 'function' ? wall(i) : wall;
        if (!col) continue;
        // world normal of the base edge, tilted up by the taper (sloped faces catch more light)
        const ex = wxOf(bot[j * 2], bot[j * 2 + 1]) - wxOf(bot[i * 2], bot[i * 2 + 1]);
        const ey = wyOf(bot[j * 2], bot[j * 2 + 1]) - wyOf(bot[i * 2], bot[i * 2 + 1]);
        const el = Math.hypot(ex, ey) || 1;
        const tilt = Math.min(1, Math.hypot(tp[i * 2] - bot[i * 2], tp[i * 2 + 1] - bot[i * 2 + 1]) / Math.max(0.5, h1 - h0));
        FSH = U.lerp(R.shadeNormal((ey * sgn) / el, (-ex * sgn) / el), 1.02, tilt * 0.45);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath();
        ctx.fillStyle = R.shaded(col, FSH); ctx.fill();
        if (face) {
          FB0x = wxOf(bot[i * 2], bot[i * 2 + 1]); FB0y = wyOf(bot[i * 2], bot[i * 2 + 1]);
          FB1x = wxOf(bot[j * 2], bot[j * 2 + 1]); FB1y = wyOf(bot[j * 2], bot[j * 2 + 1]);
          FT0x = wxOf(tp[i * 2], tp[i * 2 + 1]); FT0y = wyOf(tp[i * 2], tp[i * 2 + 1]);
          FT1x = wxOf(tp[j * 2], tp[j * 2 + 1]); FT1y = wyOf(tp[j * 2], tp[j * 2 + 1]);
          FH0 = h0; FH1 = h1;
          face(ctx, i);
        }
      }
    }
    if (roof) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) { if (i) ctx.lineTo(ST[i * 2], ST[i * 2 + 1]); else ctx.moveTo(ST[i * 2], ST[i * 2 + 1]); }
      ctx.closePath();
      ctx.fillStyle = roof; ctx.fill();
    }
    if (topFn) top(ctx, h1, topFn);
  }
  /** Quad on the current frustum face: s along the base edge, u up the face (0..1). */
  function fq(ctx, s0, s1, u0, u1, col, shade) {
    const R = N.render;
    ctx.beginPath();
    for (let c = 0; c < 4; c++) {
      const s = c === 0 || c === 3 ? s0 : s1, u = c < 2 ? u0 : u1;
      const bx = FB0x + (FB1x - FB0x) * s, by = FB0y + (FB1y - FB0y) * s;
      const tx = FT0x + (FT1x - FT0x) * s, ty = FT0y + (FT1y - FT0y) * s;
      const k = R.k(FH0 + (FH1 - FH0) * u + fz);
      const X = R.sx(bx + (tx - bx) * u, k), Y = R.sy(by + (ty - by) * u, k);
      if (c) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
    }
    ctx.closePath();
    ctx.fillStyle = shade === false ? col : R.shaded(col, FSH); ctx.fill();
  }
  /** Inset a local polygon towards its centroid-ish: dx front/back (+x side uses fx), dy sides. */
  function insetShape(pts, front, rear, side, key) {
    let p = shapeCache.get(key);
    if (p) return p;
    p = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], y = pts[i + 1];
      p.push(x > 0 ? x - front * Math.min(1, x / 4) : x + rear * Math.min(1, -x / 4), y - Math.sign(y) * side * Math.min(1, Math.abs(y) / 3));
    }
    shapeCache.set(key, p);
    return p;
  }

  function wheel(ctx, lx, ly, len, wid, h, steer) {
    // a tyre seen from above: short dark box (rotates with steering at the front axle)
    const c = Math.cos(steer || 0), s = Math.sin(steer || 0);
    const hx = len / 2, hy = wid / 2;
    const pts = WHEEL_PTS;
    pts[0] = lx + c * hx - s * -hy; pts[1] = ly + s * hx + c * -hy;
    pts[2] = lx + c * hx - s * hy; pts[3] = ly + s * hx + c * hy;
    pts[4] = lx - c * hx - s * hy; pts[5] = ly - s * hx + c * hy;
    pts[6] = lx - c * hx - s * -hy; pts[7] = ly - s * hx + c * -hy;
    prism(ctx, pts, 0, h, '#1d1a1c', '#2a2628');
  }
  const WHEEL_PTS = [0, 0, 0, 0, 0, 0, 0, 0];
  /** Flat running gear at axle height: wheels [[x, y, steer?], ...] of len x wid, plus
   *  bumpers (front/rear bars) — one transform, a handful of fills. */
  function chassis(ctx, wheels, len, wid, steer, bumper, L, W) {
    top(ctx, 1.4, (g) => {
      g.fillStyle = '#1b181a';
      for (let i = 0; i < wheels.length; i++) {
        const w = wheels[i];
        if (w[2] && steer) { g.save(); g.translate(w[0], w[1]); g.rotate(steer); g.fillRect(-len / 2, -wid / 2, len, wid); g.restore(); }
        else g.fillRect(w[0] - len / 2, w[1] - wid / 2, len, wid);
      }
      if (bumper) { g.fillStyle = bumper; g.fillRect(L / 2 - 0.6, -W / 2 + 1.3, 1.4, W - 2.6); g.fillRect(-L / 2 - 0.8, -W / 2 + 1.3, 1.4, W - 2.6); }
    });
  }

  /* ================================================ vehicle painters */
  const GLASS = '#22303c', GLASS_HI = '#5f7f92', CHROME = '#d8d8d4';

  function doorFlap(ctx, v, lx, h0, h1, len) {
    // a door hinged at lx on the LEFT side swinging out (enter/exit animation)
    const T = v.T;
    if (!(v.doorT > 0)) return;
    const a = Math.sin(Math.min(1, v.doorT / 0.45) * Math.PI) * 1.0;
    const hy = -T.d / 2;
    const ex = lx - Math.cos(a) * len, ey = hy - Math.sin(a) * len;
    const R = N.render;
    const k0 = R.k(h0 + fz), k1 = R.k(h1 + fz);
    const ax = wxOf(lx, hy), ay = wyOf(lx, hy), bx = wxOf(ex, ey), by = wyOf(ex, ey);
    ctx.beginPath();
    ctx.moveTo(R.sx(ax, k0), R.sy(ay, k0)); ctx.lineTo(R.sx(bx, k0), R.sy(by, k0));
    ctx.lineTo(R.sx(bx, k1), R.sy(by, k1)); ctx.lineTo(R.sx(ax, k1), R.sy(ay, k1)); ctx.closePath();
    ctx.fillStyle = U.shade(v.color, 0.8); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.6; ctx.stroke();
  }

  // ---------------------------------------------------------------- cars
  // Per-type wheel layout cache: [[x, y, steers], ...]
  function wheelsOf(T) {
    if (T._wheels) return T._wheels;
    const L = T.w, W = T.d, wx = L / 2 - 6, wy = W / 2 - 1.4;
    T._wheels = [[wx, -wy, 1], [wx, wy, 1], [-wx + 0.5, -wy, 0], [-wx + 0.5, wy, 0]];
    return T._wheels;
  }
  // Faces of the chamfered 8-gon from rrect(): 0 front-right corner, 1 right side, 2 rear-right,
  // 3 rear, 4 rear-left, 5 left side, 6 front-left, 7 front (n = 1 corner segment).
  function drawCar(ctx, v) {
    const T = v.T, C = T.car, L = T.w, W = T.d;
    begin(v);
    const col = v.color, dark = U.shade(col, 0.5), hi = U.shade(col, 1.14);
    chassis(ctx, wheelsOf(T), 5.4, 2.8, v.steerVis, C.bumper, L, W);
    const h0 = C.body[0], h1 = C.body[1];
    const body = rrect(L, W, C.rf, C.rr);
    const bodyTop = insetShape(body, C.curvy ? 1.6 : 0.9, C.curvy ? 1.4 : 0.7, C.curvy ? 1.1 : 0.8, 'bt' + T.id);
    const nB = body.length >> 1;
    frustum(ctx, body, bodyTop, h0, h1, col, col, (c2, i) => {
      if (nB === 8 && (i & 1) === 0) return; // chamfer faces: plain
      fq(c2, 0.04, 0.96, 0.1, 0.24, dark);       // rubbing strip
      fq(c2, 0.04, 0.96, 0.8, 0.92, hi);         // shoulder highlight
    }, (g) => {
      const fx = L / 2 - 0.9;
      g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 0.45;
      g.beginPath(); g.moveTo(C.cab[1] + 1.2, -1.6); g.lineTo(fx - 1.5, -1.6); g.moveTo(C.cab[1] + 1.2, 1.6); g.lineTo(fx - 1.5, 1.6);
      g.moveTo(C.cab[0] - 1.2, -W / 2 + 2.4); g.lineTo(C.cab[0] - 1.2, W / 2 - 2.4); g.stroke();
      g.fillStyle = C.curvy ? CHROME : '#2a2a2e';
      g.fillRect(fx - 1.1, -W / 2 + 3.8, 1, W - 7.6);
      g.fillStyle = '#fff6d6';
      if (C.curvy) { g.beginPath(); g.arc(fx - 1.4, -W / 2 + 2.4, 1.2, 0, TAU); g.arc(fx - 1.4, W / 2 - 2.4, 1.2, 0, TAU); g.fill(); }
      else { g.fillRect(fx - 1.2, -W / 2 + 1.4, 1.1, 2.4); g.fillRect(fx - 1.2, W / 2 - 3.8, 1.1, 2.4); }
      g.fillStyle = '#d0281e';
      g.fillRect(-L / 2 + 0.9, -W / 2 + 1.4, 1, 2.2); g.fillRect(-L / 2 + 0.9, W / 2 - 3.6, 1, 2.2);
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(C.cab[1] + 1.4, -W / 2 + 2, fx - C.cab[1] - 3.2, 1.3);
    });
    // greenhouse: 4 sloped glass faces (0 right, 1 rear, 2 left, 3 front) up to the roof
    const g4 = greenhouse(T, C);
    frustum(ctx, g4.base, g4.roof, h1, C.cabH, GLASS, false, (c2, i) => {
      if (i === 3) { // windscreen: A-pillars + reflection
        fq(c2, 0, 0.1, 0, 1, col); fq(c2, 0.9, 1, 0, 1, col);
        fq(c2, 0.18, 0.5, 0.55, 0.72, GLASS_HI, false);
      } else if (i === 1) { // rear glass
        fq(c2, 0, 0.12, 0, 1, col); fq(c2, 0.88, 1, 0, 1, col);
      } else { // side windows: A / B / C pillars
        fq(c2, 0, 0.07, 0, 1, col); fq(c2, 0.93, 1, 0, 1, col); fq(c2, C.bp || 0.5, (C.bp || 0.5) + 0.07, 0, 1, col);
        fq(c2, 0.1, 0.9, 0.78, 0.9, GLASS_HI, false);
      }
    });
    frustum(ctx, g4.roof, g4.roof, C.cabH, C.cabH, null, U.shade(col, 1.05), null, (g) => {
      const r = g4.r;
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(r[0] + 0.5, r[2] + 0.5, r[1] - r[0] - 1, 1.1);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(r[0] + 0.5, r[3] - 1.4, r[1] - r[0] - 1, 1);
      if (v.taxi) { const m = (r[0] + r[1]) / 2; g.fillStyle = '#1a1a1a'; g.fillRect(m - 1.6, -2.4, 3.2, 4.8); g.fillStyle = '#f2c230'; g.fillRect(m - 1.1, -1.9, 2.2, 3.8); }
    });
    const cx = (C.cab[0] + C.cab[1]) / 2, cl = C.cab[1] - C.cab[0];
    if (v.beacon) { // red-beacon VIP Ambassador
      const on = Math.sin(N.time.real * 9) > 0;
      proj(cx, 0, C.cabH + 1.4);
      ctx.fillStyle = on ? '#ff3a2a' : '#8a1a14';
      ctx.beginPath(); ctx.arc(PX, PY, 1.5 * N.render.Z, 0, TAU); ctx.fill();
    }
    doorFlap(ctx, v, cx + cl * 0.15, h0 + 0.5, C.cabH - 1, cl * 0.45);
    kidPlate(ctx, v, h1 + 0.1);
  }
  function greenhouse(T, C) {
    if (T._gh) return T._gh;
    const x0 = C.cab[0], x1 = C.cab[1], hw = T.d / 2 - C.cabInset;
    const rx0 = x0 + C.slopeR, rx1 = x1 - C.slopeF, rw = hw - C.slopeS;
    // ordering as rrect(): front-right, rear-right, rear-left, front-left
    T._gh = { base: [x1, hw, x0, hw, x0, -hw, x1, -hw], roof: [rx1, rw, rx0, rw, rx0, -rw, rx1, -rw], r: [rx0, rx1, -rw, rw] };
    return T._gh;
  }

  function cabShape(len, wid, r, cx) {
    const key = 'cab' + len + '|' + wid + '|' + r + '|' + cx;
    let p = shapeCache.get(key);
    if (p) return p;
    const base = rrect(len, wid, r, r);
    p = [];
    for (let i = 0; i < base.length; i += 2) p.push(base[i] + cx, base[i + 1]);
    shapeCache.set(key, p);
    return p;
  }

  // ---------------------------------------------------------- auto-rickshaw
  const AUTO_BODY = [11, -2.4, 11, 2.4, 6.5, 5.6, -10.4, 6.3, -11, 4.6, -11, -4.6, -10.4, -6.3, 6.5, -5.6];
  const AUTO_CANOPY = [7.2, -6.3, 7.2, 6.3, -10, 6.6, -11.3, 5.2, -11.3, -5.2, -10, -6.6];
  const AUTO_WHEELS = [[8.6, 0, 1], [-6.4, -5.8, 0], [-6.4, 5.8, 0]];
  const AUTO_SEAT = [-3, -5.6, -3, 5.6, -9.6, 5.8, -9.6, -5.8];
  function drawAuto(ctx, v) {
    begin(v);
    const yel = v.color, blk = v.color2;
    chassis(ctx, AUTO_WHEELS, 4.6, 2.2, v.steerVis, null, 22, 13);
    // tub
    prism(ctx, AUTO_BODY, 1.6, 5.4, blk, blk, (c2, i, ax, ay, bx, by, nx, ny) => {
      band(c2, ax, ay, bx, by, 0, 1, 4.1, 5.4, yel, nx, ny); // yellow lip
    }, (g) => {
      // nose: headlamp + handlebar
      g.fillStyle = '#e8e2cc'; g.beginPath(); g.arc(10, 0, 1.3, 0, TAU); g.fill();
      g.fillStyle = '#2a2a2e'; g.fillRect(5.6, -3.6, 0.9, 7.2);
      g.fillStyle = '#0e0c0e'; g.fillRect(-10.6, -3.6, 0.8, 7.2); // rear bumper bar
    });
    // seat bench (seen under the canopy)
    prism(ctx, AUTO_SEAT, 5.4, 7.2, '#6a1e1e', '#7a2626');
    // meter on the left of the driver (the old flag-down taxi meter)
    prism(ctx, [5.4, -5.6, 5.4, -4.2, 4.2, -4.2, 4.2, -5.6], 5.4, 8.6, '#141214', '#2a2628');
    // pillars
    for (const p of [[6.8, -5.9], [6.8, 5.9], [-10.6, -5.6], [-10.6, 5.6]]) prism(ctx, [p[0] + 0.5, p[1] - 0.5, p[0] + 0.5, p[1] + 0.5, p[0] - 0.5, p[1] + 0.5, p[0] - 0.5, p[1] - 0.5], 5.4, 9.8, '#1a1a1a', false);
    // canopy (rexine): yellow skirt + black piping, glass windscreen in front
    prism(ctx, AUTO_CANOPY, 9.6, 14.5, (i) => (i === 0 ? GLASS : yel), U.shade(yel, 1.04), (c2, i, ax, ay, bx, by, nx, ny) => {
      if (i === 0) { band(c2, ax, ay, bx, by, 0.08, 0.92, 13.2, 13.7, GLASS_HI); return; }
      band(c2, ax, ay, bx, by, 0, 1, 13.7, 14.5, blk, nx, ny);
      band(c2, ax, ay, bx, by, 0, 1, 9.6, 10.3, blk, nx, ny);
      if (i === 3) band(c2, ax, ay, bx, by, 0.2, 0.8, 11, 13, GLASS); // small rear window
    }, (g) => {
      // seams + a black stripe along the roof, and "dust" sheen
      g.strokeStyle = 'rgba(60,40,0,0.35)'; g.lineWidth = 0.5;
      g.beginPath();
      for (let x = -8; x <= 5; x += 3.2) { g.moveTo(x, -6); g.lineTo(x, 6); }
      g.stroke();
      g.fillStyle = blk; g.fillRect(-11, -0.8, 18, 1.6);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-9, -5.6, 15, 1.1);
    });
    kidPlate(ctx, v, 14.6);
  }

  // ---------------------------------------------------------------- bus
  const busText = {};
  function drawBus(ctx, v) {
    const T = v.T, L = T.w, W = T.d;
    begin(v);
    const red = v.color, cream = '#efe6cf', roofC = '#d6d0c2';
    if (!T._wheels) { const wx = L / 2 - 9, wy = W / 2 - 1.6; T._wheels = [[wx, -wy, 1], [wx, wy, 1], [-wx + 4, -wy, 0], [-wx + 4, wy, 0]]; }
    chassis(ctx, T._wheels, 7, 3.2, v.steerVis, '#2a2628', L, W);
    const body = rrect(L, W, 2.4, 1.8);
    if (!busText.city) busText.city = N.draw.pixelTextCanvas('CITY BUS', '#fff4dc');
    const H = T.h;
    prism(ctx, body, 1.8, H, red, roofC, (c2, i, ax, ay, bx, by, nx, ny) => {
      const len = Math.hypot(bx - ax, by - ay);
      const fx = wxOf(1, 0) - fx0, fy = wyOf(1, 0) - fy0; // forward
      const dot = ((bx - ax) * fx + (by - ay) * fy) / (len || 1); // +1 edge runs forward
      const frontFace = Math.abs(dot) < 0.3 && nx * fx + ny * fy > 0.5;
      const rearFace = Math.abs(dot) < 0.3 && nx * fx + ny * fy < -0.5;
      if (len < 4) return;
      band(c2, ax, ay, bx, by, 0, 1, 8.2, 10.4, cream, nx, ny);
      if (frontFace) {
        band(c2, ax, ay, bx, by, 0.06, 0.94, 10.4, 17.4, GLASS);
        band(c2, ax, ay, bx, by, 0.12, 0.88, 17.6, 19.2, '#141214');
        band(c2, ax, ay, bx, by, 0.12, 0.3, 3, 4.4, '#fff4d0'); band(c2, ax, ay, bx, by, 0.7, 0.88, 3, 4.4, '#fff4d0');
      } else if (rearFace) {
        band(c2, ax, ay, bx, by, 0.1, 0.9, 11.6, 17, GLASS);
        band(c2, ax, ay, bx, by, 0.1, 0.24, 3.2, 4.6, '#c0281e'); band(c2, ax, ay, bx, by, 0.76, 0.9, 3.2, 4.6, '#c0281e');
      } else if (len > 20) {
        // window bay with pillars
        const n = 8, t0 = 0.05, t1 = 0.95, step = (t1 - t0) / n;
        for (let k = 0; k < n; k++) band(c2, ax, ay, bx, by, t0 + k * step + 0.012, t0 + (k + 1) * step - 0.012, 11.2, 17.2, k % 2 ? GLASS : '#283846');
        band(c2, ax, ay, bx, by, 0, 1, 17.2, 17.6, cream, nx, ny);
        // doors on the left (kerb) side: forward door and the rear door
        const left = nx * fy - ny * fx > 0.5; // left of the heading = the kerb side
        if (left) {
          const fwd = dot > 0;
          const d1 = fwd ? 0.82 : 0.08, d2 = fwd ? 0.25 : 0.65;
          band(c2, ax, ay, bx, by, d1, d1 + 0.1, 2, 17.2, '#1c1a1e');
          band(c2, ax, ay, bx, by, d2, d2 + 0.1, 2, 17.2, '#1c1a1e');
        }
        wallText(c2, ax, ay, bx, by, 0.3, 0.7, 3, 7.6, busText.city);
      }
    }, (g) => {
      // roof: raised spine, two hatches, AC-less vents; route number at the front
      g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(-L / 2 + 3, -W / 2 + 2.4, L - 7, W - 4.8);
      g.fillStyle = '#bdb6a6'; g.fillRect(-L / 2 + 10, -2.8, 7, 5.6); g.fillRect(4, -2.8, 7, 5.6);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-L / 2 + 2, -W / 2 + 0.8, L - 4, 1.2);
      g.fillStyle = red; g.fillRect(L / 2 - 2.6, -W / 2 + 0.6, 1.8, W - 1.2); g.fillRect(-L / 2 + 0.8, -W / 2 + 0.6, 1.6, W - 1.2);
    });
    // lettering on the roof (always readable) + route board
    readableText(ctx, -6, 0, H, 'CITY BUS', '#b22b2b', true);
    if (v.route) readableText(ctx, L / 2 - 8, 0, H, v.route, '#1a1214', true);
  }

  // -------------------------------------------------------------- lorry
  const LORRY_TXT = {};
  function drawLorry(ctx, v) {
    const T = v.T, L = T.w, W = T.d;
    begin(v);
    const cabC = v.color, boxC = v.color2;
    if (!T._wheels) { const wy = W / 2 - 1.6; T._wheels = [[L / 2 - 6, -wy, 1], [L / 2 - 6, wy, 1], [-L / 2 + 8, -wy, 0], [-L / 2 + 8, wy, 0], [-L / 2 + 15, -wy, 0], [-L / 2 + 15, wy, 0]]; }
    chassis(ctx, T._wheels, 6.4, 3.2, v.steerVis, '#2a2628', L, W);
    // cargo box: painted wooden sides
    const bx0 = -L / 2, bx1 = L / 2 - 12.5;
    const box = [bx1, -W / 2, bx1, W / 2, bx0, W / 2, bx0, -W / 2];
    if (!LORRY_TXT.a) { LORRY_TXT.a = N.draw.pixelTextCanvas('HORN', '#b22b2b'); LORRY_TXT.b = N.draw.pixelTextCanvas('OK', '#1a3a8a'); LORRY_TXT.c = N.draw.pixelTextCanvas('PLEASE', '#b22b2b'); LORRY_TXT.full = N.draw.pixelTextCanvas('HORN OK PLEASE', '#b22b2b'); }
    prism(ctx, box, 3.4, 15.6, boxC, false, (c2, i, ax, ay, bx, by, nx, ny) => {
      band(c2, ax, ay, bx, by, 0, 1, 3.4, 4.6, '#7a3a1a', nx, ny);
      band(c2, ax, ay, bx, by, 0, 1, 8.4, 9.4, '#c0392b', nx, ny);
      band(c2, ax, ay, bx, by, 0, 1, 9.4, 10.4, '#2a8a4a', nx, ny);
      band(c2, ax, ay, bx, by, 0, 1, 14.4, 15.6, '#7a3a1a', nx, ny);
      if (i === 2) { // tailgate: painted plate + lettering when the face shows
        band(c2, ax, ay, bx, by, 0.08, 0.92, 4.8, 8.2, '#f4e8c8');
        wallText(c2, ax, ay, bx, by, 0.12, 0.88, 5, 8, LORRY_TXT.full);
        band(c2, ax, ay, bx, by, 0.05, 0.22, 3.4, 4.6, '#c0281e'); band(c2, ax, ay, bx, by, 0.78, 0.95, 3.4, 4.6, '#c0281e');
      }
    });
    // tarpaulin top with ropes, painted board at the back
    prism(ctx, [bx1 - 0.4, -W / 2 + 0.6, bx1 - 0.4, W / 2 - 0.6, bx0 + 0.4, W / 2 - 0.6, bx0 + 0.4, -W / 2 + 0.6], 15.6, 16.6, '#4f5a40', '#5d6a4a', null, (g) => {
      g.strokeStyle = 'rgba(230,220,180,0.55)'; g.lineWidth = 0.45;
      g.beginPath();
      for (let x = bx0 + 3; x < bx1 - 1; x += 5.5) { g.moveTo(x, -W / 2 + 0.6); g.lineTo(x + 3.5, W / 2 - 0.6); g.moveTo(x + 3.5, -W / 2 + 0.6); g.lineTo(x, W / 2 - 0.6); }
      g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(bx0 + 1, W / 2 - 3, bx1 - bx0 - 2, 2);
      // painted board
      g.fillStyle = '#1a1214'; g.fillRect(bx0 + 1.2, -W / 2 + 1.6, 9.4, W - 3.2);
      g.fillStyle = '#f2c230'; g.fillRect(bx0 + 1.7, -W / 2 + 2.1, 8.4, W - 4.2);
    });
    readableText(ctx, bx0 + 5.9, -3.4, 16.6, 'HORN', '#b22b2b', false);
    readableText(ctx, bx0 + 5.9, 0, 16.6, 'OK', '#1a3a8a', false);
    readableText(ctx, bx0 + 5.9, 3.6, 16.6, 'PLEASE', '#b22b2b', false);
    // cab
    const cabP = cabShape(10.5, W - 0.6, 2.2, L / 2 - 5.4);
    prism(ctx, cabP, 2.6, 14.6, cabC, U.shade(cabC, 1.05), (c2, i, ax, ay, bx, by, nx, ny) => {
      const fwdX = fc, fwdY = fs;
      const front = nx * fwdX + ny * fwdY > 0.6, rear = nx * fwdX + ny * fwdY < -0.6;
      if (front) {
        band(c2, ax, ay, bx, by, 0.08, 0.92, 8.4, 13.4, GLASS);
        band(c2, ax, ay, bx, by, 0.05, 0.95, 2.6, 4, '#2a2a2e');
        band(c2, ax, ay, bx, by, 0.1, 0.24, 4.4, 6, '#fff4d0'); band(c2, ax, ay, bx, by, 0.76, 0.9, 4.4, 6, '#fff4d0');
      } else if (!rear) {
        band(c2, ax, ay, bx, by, 0.3, 0.8, 9, 13.2, GLASS);
        band(c2, ax, ay, bx, by, 0, 1, 6, 6.8, '#f4e8c8', nx, ny);
      }
    }, (g) => {
      // painted visor + roof decoration
      const fx = L / 2;
      g.fillStyle = '#f4e8c8'; g.fillRect(fx - 2.8, -W / 2 + 1, 2, W - 2);
      g.fillStyle = '#c0392b';
      for (let y = -W / 2 + 1.4; y < W / 2 - 1.6; y += 2.4) { g.beginPath(); g.moveTo(fx - 2.8, y); g.lineTo(fx - 0.8, y + 1.2); g.lineTo(fx - 2.8, y + 2.4); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(fx - 10, -W / 2 + 1, 6, 1.2);
    });
    doorFlap(ctx, v, L / 2 - 3, 4, 13, 5);
  }

  // ------------------------------------------------------- two-wheelers
  function drawBike(ctx, v) {
    const T = v.T, L = T.w, id = T.bikeLook || T.id;
    begin(v);
    const lie = !!v.fallen;               // DHADAAM: lying on its side until picked up
    const riding = !!v.driver && !lie;
    const lean = v.lean || 0;
    const col = v.color;
    // parked bikes lean on the side stand; a fallen one lies flat with its parts spilled sideways
    const tilt = riding ? lean : lie ? 1.25 : 0.22;
    const ox = -Math.sin(tilt) * (lie ? 4.6 : 2.2); // lateral offset of upper parts (in local y)
    const top = lie ? (c2, h, fn) => topRaw(c2, Math.min(h, 1.6) * 0.6 + 0.2, fn) : topRaw;
    const rw = L / 2 - 3, fw = L / 2 - 3;
    const steer = v.steerVis * 0.9;
    // wheels (thin dark slabs), the front one turns with the handlebar
    top(ctx, 0.6, (g) => {
      g.fillStyle = '#1c1a1c';
      g.fillRect(-rw - 3, -0.85, 6, 1.7);
      g.save(); g.translate(fw, 0); g.rotate(steer); g.fillRect(-3, -0.85, 6, 1.7); g.restore();
      if (id === 'chetak') { g.fillStyle = '#2a2628'; g.fillRect(-L / 2 - 0.4, -2.2, 1.4, 4.4); } // spare wheel
    });
    if (id === 'cycle' || id === 'ladiescycle') {
      top(ctx, 3 + 0, (g) => {
        g.translate(0, ox * 0.6);
        g.strokeStyle = col; g.lineWidth = 1.1; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-rw, 0); g.lineTo(-1.5, 0); // chain stay to the seat tube
        if (T.basket) { g.moveTo(-1.5, 0); g.quadraticCurveTo(1, 0.8, fw - 1.6, 0); } else { g.moveTo(-1.5, 0); g.lineTo(fw - 1.4, 0); }
        g.stroke();
        // carrier
        g.fillStyle = '#9a9a96'; g.fillRect(-rw - 2.2, -1.3, 3.4, 2.6);
        g.fillStyle = '#6a6a66'; g.fillRect(-rw - 1.6, -0.3, 2.4, 0.6);
      });
      top(ctx, 6.5, (g) => {
        g.translate(0, ox);
        // handlebar (turns) + grips
        g.save(); g.translate(fw - 1.2, 0); g.rotate(steer);
        g.strokeStyle = '#b8b8b4'; g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(-0.6, -3.2); g.quadraticCurveTo(0.8, 0, -0.6, 3.2); g.stroke();
        g.fillStyle = '#2a2426'; g.fillRect(-1.3, -3.6, 1.4, 1); g.fillRect(-1.3, 2.6, 1.4, 1);
        if (T.basket) { g.fillStyle = '#a07838'; g.fillRect(0.6, -2, 3, 4); g.strokeStyle = '#6a4a20'; g.lineWidth = 0.4; g.strokeRect(0.6, -2, 3, 4); g.beginPath(); g.moveTo(2.1, -2); g.lineTo(2.1, 2); g.stroke(); }
        g.restore();
        // saddle
        g.fillStyle = '#3a2a22'; g.beginPath(); g.ellipse(-2, 0, 1.9, 1.15, 0, 0, TAU); g.fill();
      });
    } else if (id === 'luna') {
      top(ctx, 3.2, (g) => {
        g.translate(0, ox * 0.6);
        g.fillStyle = '#2a2a2e'; g.fillRect(-rw, -0.7, L - 6, 1.4);           // frame spine
        g.fillStyle = col; g.beginPath(); g.ellipse(-0.8, 0, 3.6, 1.9, 0, 0, TAU); g.fill(); // tank/panel under the seat
        g.fillStyle = '#9a9a96'; g.fillRect(-rw - 2.4, -1.5, 3.6, 3);           // carrier
      });
      top(ctx, 6.6, (g) => {
        g.translate(0, ox);
        g.save(); g.translate(fw - 1, 0); g.rotate(steer);
        g.strokeStyle = '#c8c8c4'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(0, -3.2); g.lineTo(0, 3.2); g.stroke();
        g.fillStyle = '#efe8d0'; g.beginPath(); g.arc(1.2, 0, 1.1, 0, TAU); g.fill(); // headlamp
        g.restore();
        g.fillStyle = '#2a1e1a'; g.beginPath(); g.ellipse(-2.6, 0, 2.2, 1.3, 0, 0, TAU); g.fill();
      });
    } else if (id === 'chetak') {
      top(ctx, 2.6, (g) => {
        g.translate(0, ox * 0.4);
        g.fillStyle = '#2a2628'; g.fillRect(-1, -2, 6, 4);                      // floorboard mat
        g.fillStyle = 'rgba(255,255,255,0.12)'; for (let x = -0.6; x < 5; x += 1.2) g.fillRect(x, -1.8, 0.4, 3.6);
      });
      top(ctx, 5, (g) => {
        g.translate(0, ox * 0.7);
        // bulbous rear body (side cowls) and the front leg shield
        g.fillStyle = col;
        g.beginPath(); g.ellipse(-4.4, 0, 4.4, 3.5, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.ellipse(-4.4, 1.2, 4, 2.2, 0, 0, Math.PI); g.fill();
        g.fillStyle = col;
        g.beginPath(); g.moveTo(5.2, -3.3); g.quadraticCurveTo(7.4, 0, 5.2, 3.3); g.lineTo(4.4, 3.1); g.quadraticCurveTo(6.2, 0, 4.4, -3.1); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.ellipse(-4.8, -1.6, 2.6, 0.9, 0, 0, TAU); g.fill();
      });
      top(ctx, 7.2, (g) => {
        g.translate(0, ox);
        g.fillStyle = '#26201e'; g.beginPath(); g.ellipse(-3.8, 0, 3.2, 1.7, 0, 0, TAU); g.fill(); // seat
        g.save(); g.translate(6.4, 0); g.rotate(steer);
        g.fillStyle = col; g.fillRect(-0.9, -3.4, 1.8, 6.8);                      // handlebar casing
        g.fillStyle = '#e8e2cc'; g.beginPath(); g.arc(0.2, 0, 1.15, 0, TAU); g.fill(); // headlamp
        g.fillStyle = '#1e1a1a'; g.fillRect(-0.8, -4.2, 1.4, 1); g.fillRect(-0.8, 3.2, 1.4, 1);
        g.restore();
      });
    } else { // rx100
      top(ctx, 3.4, (g) => {
        g.translate(0, ox * 0.5);
        g.fillStyle = '#9a9894'; g.fillRect(-2.6, -2.2, 5, 4.4);                 // engine block
        g.fillStyle = '#d8d8d4'; g.fillRect(-rw - 2.8, 1.6, L * 0.62, 1.1);       // chrome exhaust on the right
        g.fillStyle = '#2a2a2e'; g.fillRect(-rw - 2.8, 1.6, 2, 1.1);
      });
      top(ctx, 6.8, (g) => {
        g.translate(0, ox);
        g.fillStyle = '#1c1818'; g.beginPath(); g.ellipse(-3.4, 0, 4.4, 1.5, 0, 0, TAU); g.fill(); // long seat
        g.fillStyle = col; g.beginPath(); g.ellipse(2.4, 0, 3.4, 2.3, 0, 0, TAU); g.fill();       // tank
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(2.8, -0.9, 1.8, 0.6, 0, 0, TAU); g.fill();
        g.fillStyle = '#d8d8d4'; g.fillRect(1.8, -0.15, 1.6, 0.3);
        g.save(); g.translate(fw - 0.6, 0); g.rotate(steer);
        g.strokeStyle = '#c8c8c4'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-1, -3.6); g.lineTo(0.2, 0); g.lineTo(-1, 3.6); g.stroke();
        g.fillStyle = '#efe8d0'; g.beginPath(); g.arc(1.6, 0, 1.25, 0, TAU); g.fill();
        g.fillStyle = '#1e1a1a'; g.fillRect(-1.6, -4, 1.2, 1); g.fillRect(-1.6, 3, 1.2, 1);
        g.restore();
      });
    }
    if (riding) drawRider(ctx, v, ox, id === 'cycle' || id === 'ladiescycle' ? -1.4 : id === 'chetak' ? -2.6 : -2.2, T.pedal);
    if (riding && v.pillion) drawPillion(ctx, v, ox, id === 'cycle' ? -5.6 : -6.4);
    if (T.id === 'chinnu_cycle' && (unlocked('streamers', 75))) topRaw(ctx, 7, (g) => { g.translate(L / 2 - 4.2, ox); g.strokeStyle = '#ffd84a'; g.lineWidth = 0.5; g.beginPath(); for (const y of [-3.2, 3.2]) { g.moveTo(0, y); g.lineTo(-2.4, y * 1.25); g.moveTo(0, y); g.lineTo(-2.8, y * 0.9); } g.stroke(); });
  }

  function riderLook(v) {
    const d = v.driver;
    if (d && d.look) return d.look;
    if (!v._look) v._look = N.people.randomLook(U.rng(v.seed), 'man');
    return v._look;
  }
  const riderAnim = { phase: 0, speed: 0, run: false };
  function drawRider(ctx, v, ox, at, pedal) {
    const look = riderLook(v);
    riderAnim.phase = pedal ? v.wheelPhase * 0.6 : 0;
    riderAnim.speed = pedal ? Math.min(0.7, Math.abs(v.speed) / 60) : 0;
    riderAnim.run = false;
    top(ctx, 8.5, (g) => {
      g.translate(at, ox * 1.25);
      N.people.draw(g, look, riderAnim);
    });
  }

  // a second rider behind the driver (Mummy pillion on Nanna's Chetak; Chinnu behind Nanna)
  const pillionAnim = { phase: 0, speed: 0, run: false };
  function drawPillion(ctx, v, ox, at) {
    const P = v.pillion, look = P && (P.look || P);
    if (!look || typeof look !== 'object') return;
    top(ctx, 8.2, (g) => { g.translate(at, ox * 1.25); N.people.draw(g, look, pillionAnim); });
  }

  // ---------------------------------------------------- story-vehicle extras (systems §3.2)
  function drawLightBar(ctx, v) { // Pochaiah's Luna: a red-and-blue light-bar decal on the carrier
    top(ctx, 4.6, (g) => {
      g.fillStyle = '#efe9dc'; g.fillRect(-8.6, -1.7, 3.4, 3.4);
      g.fillStyle = '#c8231d'; g.fillRect(-8.4, -1.5, 1.5, 1.4);
      g.fillStyle = '#2a4ab8'; g.fillRect(-6.9, 0.1, 1.5, 1.4);
    });
  }
  function drawSidecar(ctx, v) { // Pasha's yellow scooter with a sidecar of camera gear (drawn only)
    const W = v.T.d;
    const car = [5, W / 2 + 0.8, 5, W / 2 + 7.2, -5.5, W / 2 + 7.2, -6.5, W / 2 + 4, -5.5, W / 2 + 0.8];
    prism(ctx, car, 1, 4.6, v.color, U.shade(v.color, 1.08), null, (g) => {
      g.fillStyle = '#2a2628'; g.fillRect(-4.2, W / 2 + 2, 4, 3.6);          // camera case
      g.fillStyle = '#6a6a70'; g.fillRect(0.8, W / 2 + 2.4, 2.6, 2.4);       // tripod bundle
      g.strokeStyle = '#d8d8d4'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(0.4, W / 2 + 3.6); g.lineTo(4.6, W / 2 + 3.6); g.stroke();
    });
  }
  function drawPeacock(ctx, v) { // M10: a painted peacock and marigold strings on the idol bed
    const T = v.T, L = T.w, W = T.d, bx0 = -L / 2, bx1 = L / 2 - 12.5;
    top(ctx, 16.8, (g) => {
      g.fillStyle = '#e8a020';
      for (let x = bx0 + 1.5; x < bx1 - 1; x += 2.2) { g.beginPath(); g.arc(x, -W / 2 + 1, 0.8, 0, TAU); g.arc(x + 1.1, W / 2 - 1, 0.8, 0, TAU); g.fill(); }
      const cx = (bx0 + bx1) / 2 + 3;
      for (let i = -3; i <= 3; i++) { // tail fan
        const a = Math.PI + i * 0.32, ex = cx + Math.cos(a) * 9, ey = Math.sin(a) * 9 * 0.8;
        g.strokeStyle = '#2a8a5a'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(cx, 0); g.lineTo(ex, ey); g.stroke();
        g.fillStyle = '#1e5aa8'; g.beginPath(); g.arc(ex, ey, 1.3, 0, TAU); g.fill();
        g.fillStyle = '#f2c230'; g.beginPath(); g.arc(ex, ey, 0.5, 0, TAU); g.fill();
      }
      g.fillStyle = '#1e5aa8'; g.beginPath(); g.ellipse(cx + 1.6, 0, 2.6, 1.4, 0, 0, TAU); g.fill();
      g.fillStyle = '#2a8c82'; g.beginPath(); g.arc(cx + 4.2, 0, 1, 0, TAU); g.fill();
    });
  }
  function drawTrunks(ctx, v) { // the ending card's taxi: a roof carrier of tin trunks
    const C = v.T.car;
    top(ctx, C.cabH + 0.4, (g) => {
      g.fillStyle = '#f2c230'; g.fillRect(-10, -0.6, 14, 1.2);
      g.strokeStyle = '#8a8a86'; g.lineWidth = 0.5; g.strokeRect(-9.5, -4.8, 12.5, 9.6);
      g.fillStyle = '#5a6a7a'; g.fillRect(-9, -4.3, 5.6, 4); g.fillStyle = '#7a3a2a'; g.fillRect(-3, -4.3, 5.4, 3.6); g.fillStyle = '#3a5a3a'; g.fillRect(-8.6, 0.5, 10.6, 3.8);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-9, -4.3, 5.6, 0.8); g.fillRect(-8.6, 0.5, 10.6, 0.8);
    });
  }
  function drawCage(ctx, v) { // zoo safari bus: wire mesh over the windows (seen on the roof edge)
    const T = v.T, L = T.w, W = T.d;
    top(ctx, T.h + 0.1, (g) => {
      g.strokeStyle = 'rgba(30,30,30,0.55)'; g.lineWidth = 0.35; g.beginPath();
      for (let x = -L / 2 + 3; x < L / 2 - 3; x += 2.2) { g.moveTo(x, -W / 2); g.lineTo(x, -W / 2 + 2); g.moveTo(x, W / 2); g.lineTo(x, W / 2 - 2); }
      g.stroke();
    });
  }
  /** The joke "L" board when the kid drives a car or an auto (systems §3.1). */
  function kidPlate(ctx, v, h) {
    if (!v.driver || v.driver !== N.player) return;
    const T = v.T;
    if (T.cls !== 'car' && T.cls !== 'auto') return;
    top(ctx, h, (g) => { g.fillStyle = '#f4f2ec'; g.fillRect(-T.w / 2 + 0.6, -1.8, 2.8, 3.6); g.fillStyle = '#c8231d'; g.fillRect(-T.w / 2 + 1.2, -1.2, 0.6, 2.4); g.fillRect(-T.w / 2 + 1.2, 0.7, 1.6, 0.6); });
  }

  // ---------------------------------------------------------------- boat
  const HULL = [14, 0, 10.5, -4.6, 2, -5.5, -11, -5.4, -13.6, -3.8, -13.6, 3.8, -11, 5.4, 2, 5.5, 10.5, 4.6];
  const DECK = [11, 0, 8.6, -3.6, -10.6, -4.2, -12.4, -3, -12.4, 3, -10.6, 4.2, 8.6, 3.6];
  const CANOPY = [6.5, -4.6, 6.5, 4.6, -8.5, 4.8, -8.5, -4.8];
  function drawBoat(ctx, v) {
    const t = N.time.real;
    v.z = 0.4 + Math.sin(t * 2.1 + v.seed * 0.001) * 0.35;
    begin(v);
    const hull = v.color, stripe = v.color2;
    // wake ring on the water
    top(ctx, 0, (g) => {
      g.strokeStyle = 'rgba(232,246,244,0.35)'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(0, 0, 15.5, 7.4, 0, 0, TAU); g.stroke();
      if (Math.abs(v.speed) > 8) {
        g.strokeStyle = 'rgba(232,246,244,0.45)';
        g.beginPath(); g.moveTo(-12, -5); g.lineTo(-30, -11); g.moveTo(-12, 5); g.lineTo(-30, 11); g.stroke();
      }
    });
    fz -= 0.6;
    prism(ctx, HULL, 0, 3.6, hull, false, (c2, i, ax, ay, bx, by, nx, ny) => band(c2, ax, ay, bx, by, 0, 1, 1.6, 2.5, stripe, nx, ny));
    prism(ctx, DECK, 2.6, 3.2, U.shade(hull, 0.85), '#a8784a', null, (g) => {
      g.strokeStyle = 'rgba(80,50,20,0.4)'; g.lineWidth = 0.4; g.beginPath();
      for (let y = -3; y <= 3; y += 1.5) { g.moveTo(-12, y); g.lineTo(9, y * 0.8); }
      g.stroke();
      g.fillStyle = '#3a6a8a'; g.fillRect(-7, -4, 2.2, 8); g.fillRect(-1, -4, 2.2, 8); g.fillRect(4.6, -3.4, 2, 6.8); // benches
      g.fillStyle = '#2a2a2e'; g.fillRect(-14.6, -1.3, 2.2, 2.6);                         // outboard motor
    });
    // pilot at the stern
    if (v.driver) top(ctx, 6.5, (g) => { g.translate(-11, 0); N.people.draw(g, riderLook(v), riderAnim); });
    // striped canopy on poles
    for (const p of [[6, -4.2], [6, 4.2], [-8, -4.4], [-8, 4.4]]) prism(ctx, [p[0] + 0.35, p[1] - 0.35, p[0] + 0.35, p[1] + 0.35, p[0] - 0.35, p[1] + 0.35, p[0] - 0.35, p[1] - 0.35], 3.2, 10, '#d8d4c8', false);
    prism(ctx, CANOPY, 10, 10.8, stripe, '#f2efe6', null, (g) => {
      g.fillStyle = stripe;
      for (let x = -8.5; x < 6.5; x += 3) g.fillRect(x, -4.8, 1.5, 9.6);
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(-8.5, -4.8, 15, 1.2);
    });
  }

  /* ========================================================== system */
  let zoomOwned = false;
  let hornHold = 0;
  // priority 0: shops / NPC talk (priority >= 1) win over a parked vehicle; ties go by distance
  const offerSpec = { label: '', priority: 0, dist: 0, use: null };
  const exitSpec = { label: 'Get off', priority: 0, dist: 0, use: null };

  function update(dt) {
    const p = N.player, mode = N.state.mode;
    for (let i = list.length - 1; i >= 0; i--) if (!list[i].alive) { if (list[i] === p.vehicle) exit(p, true); list.splice(i, 1); }
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.bumpT > 0) v.bumpT -= dt;
      if (v.doorT > 0) v.doorT -= dt;
      v.age += dt;
      if (v.fallen) { v.fallen.t += dt; if (v.fallen.t > TUNE.rightAfter && !v.driver) { v.fallen = null; v.wake(); } }
      if (v.driver === p && v.autopilot && v.controller) {
        // the boatman rows / a scripted drive with the player aboard (N.vehicles.driveTo + v.autopilot)
        try { v.controller(v, dt); } catch (e) { N.err('vehicle.controller', e); v.controller = null; v.autopilot = false; }
      } else if (v.driver === p) {
        if (mode === 'play' && !p.controlsLocked) playerControl(v); else idleControl(v);
        if (mode === 'play' && v.T.cls === 'bike') bikeHazards(v, dt);
      } else if (v.fallen) {
        idleControl(v);
      } else if (v.controller) {
        try { v.controller(v, dt); } catch (e) { N.err('vehicle.controller', e); v.controller = null; }
      } else idleControl(v);
      // sleep parked vehicles so hundreds of them cost nothing
      if (!v.driver && !v.controller && Math.abs(v.vx) + Math.abs(v.vy) < 0.6 && Math.abs(v.av) < 0.03) {
        v.sleepT += dt;
        if (v.sleepT > 0.4 && !v.asleep) { v.asleep = true; v.vx = v.vy = v.av = 0; v.speed = 0; v.skL = v.skR = null; }
      } else { v.sleepT = 0; v.asleep = false; }
      if (!v.asleep) simulate(v, dt);
    }
    collideVehicles();
    collidePeople();
    updateParticles(dt);
    const pv = p.vehicle;
    if (pv) {
      p.x = pv.x; p.y = pv.y; p.vx = pv.vx; p.vy = pv.vy; p.angle = pv.angle; p.mode = 'drive';
      if (!N.render.camOverride && Math.abs(N.render.baseZoom - pv.T.camZoom) > 1e-3) { N.render.baseZoom = pv.T.camZoom; zoomOwned = true; }
    } else if (zoomOwned) { N.render.baseZoom = 1; zoomOwned = false; }
    if (p.knockT > 0) p.knockT -= dt;
    if (mode !== 'play') return;
    // ACTION offers: get in / get out
    if (!pv && p.mode !== 'busy' && !p.controlsLocked) {
      const n = nearestEnterable(p);
      if (n) {
        const v = n.v, T = v.T;
        const nk = nakkoFor(v);
        if (nk) { offerSpec.label = 'Nakko'; offerSpec.use = useNakko; }
        else if (v.hire && !v.hired) { offerSpec.label = T.mode === 'boat' ? 'Hire boat' : 'Hire cycle'; offerSpec.use = useHire; }
        else { offerSpec.label = (v.driver ? 'Borrow ' : T.verb + ' ') + (v.label && !T.label ? v.label : T.short); offerSpec.use = useEnter; }
        offerSpec.dist = n.d; offerSpec.target = v;
        N.interact.offer(offerSpec);
      }
      // a bike lying on its side after a fall: pick it up (systems §2.6)
      const fb = nearestFallen(p);
      if (fb) { pickSpec.label = 'Pick up ' + fb.v.T.short; pickSpec.dist = fb.d; pickSpec.target = fb.v; N.interact.offer(pickSpec); }
    } else if (pv && !pv.locked && !p.controlsLocked) {
      exitSpec.label = pv.T.cls === 'bike' ? 'Get off' : pv.T.cls === 'boat' ? 'Get out' : 'Get out';
      exitSpec.use = useExit;
      N.interact.offer(exitSpec);
    }
    // horn (whistle on foot); held car horns repeat
    const I = N.input;
    if (I.pressed('horn')) { emitHorn(pv); hornHold = 0; }
    else if (I.down('horn') && pv && pv.T.cls !== 'bike') { hornHold += dt; if (hornHold > 0.42) { hornHold = 0; emitHorn(pv); } }
  }
  function useEnter() { if (offerSpec.target) enter(N.player, offerSpec.target); }
  function useExit() { exit(N.player, false); }
  function useNakko() {
    const v = offerSpec.target; if (!v) return;
    const line = nakkoFor(v);
    if (line && N.hud) N.hud.toast(line, 2600);
    if (N.audio && N.audio.horn && v.T.cls !== 'bike') { try { N.audio.horn(v, { x: v.x, y: v.y }); } catch (e) { /* ignore */ } }
  }
  /** A rental cycle / jetty boat: the stall's menu decides (N.shops); without shops it is just ridden. */
  function useHire() {
    const v = offerSpec.target; if (!v) return;
    if (N.shops && typeof N.shops.open === 'function' && N.shops.open(v.hire, { vehicle: v })) return;
    v.hired = true; enter(N.player, v);
  }
  const pickSpec = { label: 'Pick up cycle', priority: 1, dist: 0, target: null, use: () => { const v = pickSpec.target; if (v && v.fallen) { v.fallen = null; N.emit('vehicle:pickup', { vehicle: v }); enter(N.player, v, { quiet: true }); } } };
  function nearestFallen(p) {
    let best = null, bd = 18;
    for (const v of list) {
      if (!v.fallen || v.fallen.t < TUNE.pickupAfter || !v.alive) continue;
      const d = distTo(v, p.x, p.y);
      if (d < bd) { bd = d; best = v; }
    }
    return best ? { v: best, d: bd } : null;
  }
  // the player went DHADAAM (entities.js player.fall): the bike stays down until picked up
  N.on('player:fall', (d) => {
    const v = d && d.vehicle;
    if (!v || !v.T || v.T.cls !== 'bike' || !v.alive) return;
    v.fallen = { t: 0, angle: v.angle };
    v.vx *= 0.3; v.vy *= 0.3; v.av = 0;
    N.emit('vehicle:fallen', { vehicle: v });
  });
  /** Punctures and potholes for the bike the player rides (systems §2.6, §5.6). */
  function bikeHazards(v, dt) {
    const T = v.T, S = N.SURF;
    const surf = N.world.surfaceAt(v.x, v.y), sp = Math.abs(v.speed);
    const dirt = surf === S.GROUND || surf === S.SAND;
    if (T.pedal && !v.flat && dirt && sp > 25 && Math.random() < dt * TUNE.punctureRate) V.puncture(v);
    if (surf === S.GROUND && sp >= TUNE.potholeSpeed) {
      v.potT -= dt;
      if (v.potT <= 0) {
        v.potT = TUNE.potholeEvery * (0.5 + Math.random());
        if (N.audio && N.audio.sfx) N.audio.sfx('pothole', { x: v.x, y: v.y });
        N.emit('vehicle:pothole', { vehicle: v, speed: sp });
        if (Math.random() < TUNE.potholeFall && N.player.fall) N.player.fall(v, { speed: sp, pothole: true });
      }
    } else v.potT = Math.max(v.potT, 0.6);
  }
  function emitHorn(v) {
    const p = N.player;
    if (v) N.emit('horn', { x: v.x, y: v.y, type: v.type, vehicle: v, who: p, dur: 0.42 });
    else N.emit('horn', { x: p.x, y: p.y, type: 'foot', vehicle: null, who: p });
  }

  /* ----------------------------------------------------- parked seeds */
  // A few parked vehicles at sensible places so the city is rideable before traffic.js
  // exists: cycles at cycle-rental stalls, the family Chetak at home, boats at jetties.
  // Set N.vehicles.autoSeed = false to disable (traffic.js may do its own).
  function seedParked() {
    if (V.autoSeed === false || !N.world.built) return;
    const P = N.places;
    const put = (type, x, y, a, opts) => {
      const T = TYPES[type];
      const f = T.mode === 'boat' ? waterSpot(x, y) : N.world.findFree(x, y, 'drive', 12);
      if (!f) return null;
      if (T.mode !== 'boat' && N.world.collide(f.x, f.y, T.cr + 0.5, 'drive').hit) return null;
      return spawn(type, f.x, f.y, a, Object.assign({ seeded: true }, opts || {}));
    };
    for (const id in P) {
      const pl = P[id];
      // rental cycles and jetty boats belong to their stall: ACTION opens the stall's menu (shops.js)
      if (pl.kind === 'cycle_rent') {
        put('kid_cycle', pl.x + 4, pl.y + 6, Math.PI / 2 + 0.15, { seed: U.strHash(id) + 2, hire: id });
        put('cycle', pl.x + 12, pl.y + 6, Math.PI / 2 + 0.2, { seed: U.strHash(id), hire: id });
        put('ladiescycle', pl.x + 20, pl.y + 6, Math.PI / 2 + 0.25, { seed: U.strHash(id) + 1, hire: id });
      } else if (pl.kind === 'jetty' && !/_boat$/.test(id)) {
        put('boat', pl.x, pl.y, -Math.PI / 2, { seed: U.strHash(id), hire: id });
        put('boat', pl.x + 24, pl.y + 10, -Math.PI / 2 + 0.3, { seed: U.strHash(id) + 7, hire: id });
      }
    }
    const home = (N.WORLD_DATA && N.WORLD_DATA.spawns && N.WORLD_DATA.spawns.home) || null;
    // the family Chetak, parked on the footpath a few doors down (clear of the front door)
    if (home) put('family_chetak', home[0] - 58, home[1] + 2, Math.PI / 2, { seed: 1999, color: '#7d9ab0', special: 'family' });
    // Chinnu's own cycle (12 finds) and Nanna's roadster (after M6) wait at home each morning
    if (home && unlocked('own_cycle', 12)) put('chinnu_cycle', home[0] - 40, home[1] + 4, Math.PI / 2, { seed: 2003, owned: true, label: 'my cycle' });
    if (home && (N.flags.old_cycle || (N.missions && N.missions.isDone && N.missions.isDone('ammammas_thursday')))) put('old_cycle', home[0] - 76, home[1] + 2, Math.PI / 2, { seed: 1983, owned: true });
  }
  function waterSpot(x, y) {
    for (let r = 0; r < 140; r += 6) {
      for (let a = 0; a < TAU; a += TAU / Math.max(6, r / 3)) {
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (N.world.isWater(px, py) && !N.world.collide(px, py, 7, 'boat').hit) return { x: px, y: py };
      }
    }
    return null;
  }

  /* ================================================== NPC drivers (road routes) */
  // A* over the road graph (every incident edge: scripted drivers may ignore one-way rules).
  function astar(a, b) {
    const R = N.world.roads, nodes = R.nodes, edges = R.edges;
    if (!a || !b) return null;
    if (a === b) return [a];
    const g = new Map(), from = new Map(), open = [[0, a.id]], closed = new Set();
    g.set(a.id, 0);
    let guard = 0;
    while (open.length && guard++ < 8000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const id = open[bi][1];
      open[bi] = open[open.length - 1]; open.pop();
      if (closed.has(id)) continue;
      if (id === b.id) {
        const path = [nodes[id]];
        let c = id;
        while (from.has(c)) { c = from.get(c); path.push(nodes[c]); }
        return path.reverse();
      }
      closed.add(id);
      const n = nodes[id], gn = g.get(id);
      for (const eid of n.inc) {
        const e = edges[eid], to = e.a === id ? e.b : e.a;
        if (closed.has(to) || e.kind === 'path') continue;
        const ng = gn + (e.len || 1);
        if (ng < (g.has(to) ? g.get(to) : Infinity)) { g.set(to, ng); from.set(to, id); open.push([ng + Math.hypot(nodes[to].x - b.x, nodes[to].y - b.y), to]); }
      }
    }
    return null;
  }
  /**
   * Road route from (x0, y0) to (x1, y1) as a polyline [[x, y], ...] in the left-hand lane
   * (traffic drives on the left). Falls back to a straight line without a road graph.
   */
  function roadPath(x0, y0, x1, y1) {
    const R = N.world && N.world.roads;
    if (!R || !R.nodes || !R.nodes.length) return [[x0, y0], [x1, y1]];
    const a = R.nearestNode(x0, y0), b = R.nearestNode(x1, y1);
    const nodes = astar(a, b);
    const pts = [[x0, y0]];
    if (nodes && nodes.length > 1) {
      for (let i = 0; i < nodes.length - 1; i++) {
        const A = nodes[i], B = nodes[i + 1], len = Math.hypot(B.x - A.x, B.y - A.y);
        if (len < 24) { pts.push([(A.x + B.x) / 2, (A.y + B.y) / 2]); continue; }
        const p0 = R.lanePoint(A, B, Math.min(0.45, 10 / len), 0), p1 = R.lanePoint(A, B, Math.max(0.55, 1 - 10 / len), 0);
        pts.push([p0.x, p0.y], [p1.x, p1.y]);
      }
    } else if (nodes && nodes.length === 1) pts.push([nodes[0].x, nodes[0].y]);
    pts.push([x1, y1]);
    return pts;
  }
  function pathLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
  /** Road distance between two points (u), for fares and bus times. */
  function roadDistance(x0, y0, x1, y1) { return pathLength(roadPath(x0, y0, x1, y1)); }

  /**
   * Drive a vehicle along a road route (or a given polyline) to a target with its own controller.
   * target: {x, y} | place id | entity | [[x, y], ...] (a path). opts: {speed (cruise u/s, default
   * 0.6 x top, max 95), r (arrive radius, 16), road (true: route on the road graph), timeout (s),
   * warp (true: when stuck or late and off-screen, hop along the path), stop (true: brake at the end),
   * onArrive(v)}. Resolves true on arrival, false on timeout / stop / the vehicle being removed.
   */
  function driveTo(v, target, opts) {
    opts = opts || {};
    if (!v || !v.alive) return Promise.resolve(false);
    stopDriving(v);
    let pts = null;
    if (Array.isArray(target) && Array.isArray(target[0])) pts = target.map((p) => [p[0], p[1]]);
    else {
      const t = typeof target === 'string' ? N.places[target] : target;
      if (!t || !isFinite(t.x) || !isFinite(t.y)) return Promise.resolve(false);
      pts = opts.road === false ? [[v.x, v.y], [t.x, t.y]] : roadPath(v.x, v.y, t.x, t.y);
    }
    const T = v.T;
    const cruise = opts.speed || Math.min(95, T.maxSpeed * 0.6);
    const st = { pts, i: 1, t: 0, chk: 1, x0: v.x, y0: v.y, stuck: 0, rev: 0, done: false };
    return new Promise((resolve) => {
      const finish = (ok) => {
        if (st.done) return; st.done = true;
        if (v.drive === st) v.drive = null;
        if (v.controller === ctlFn) v.controller = opts.stop === false ? null : brakeCtl;
        if (ok && opts.onArrive) { try { opts.onArrive(v); } catch (e) { N.err('vehicles.onArrive', e); } }
        resolve(ok);
      };
      st.finish = finish;
      const ctlFn = (veh, dt) => {
        if (!veh.alive) { finish(false); return; }
        st.t += dt;
        const ctl = veh.ctl, P = st.pts, end = P[P.length - 1];
        const dEnd = Math.hypot(end[0] - veh.x, end[1] - veh.y);
        if (st.i >= P.length - 1 && dEnd < (opts.r || 16)) { ctl.throttle = 0; ctl.brake = true; if (Math.abs(veh.speed) < 10) finish(true); return; }
        if (opts.timeout && st.t > opts.timeout) {
          if (opts.warp !== false && !N.render.inView(end[0], end[1], 30)) { warpTo(veh, end, P); finish(true); } else finish(false);
          return;
        }
        // advance the target point (pure pursuit with a speed-dependent look-ahead)
        const look = Math.max(14, Math.abs(veh.speed) * 0.4);
        while (st.i < P.length - 1 && Math.hypot(P[st.i][0] - veh.x, P[st.i][1] - veh.y) < look) st.i++;
        const tx = P[st.i][0], ty = P[st.i][1];
        const diff = U.angleDiff(veh.angle, Math.atan2(ty - veh.y, tx - veh.x));
        let want = cruise;
        if (Math.abs(diff) > 1.2) want = Math.min(want, 26); else if (Math.abs(diff) > 0.5) want = Math.min(want, 55);
        want = Math.min(want, Math.sqrt(2 * T.brake * 0.45 * Math.max(0, dEnd - 6)) + 6);
        if (st.rev > 0) { st.rev -= dt; ctl.brake = false; ctl.handbrake = false; ctl.throttle = -0.7; ctl.steer = U.clamp(-diff * 2, -1, 1); return; }
        ctl.steer = U.clamp(diff * 2.5, -1, 1); ctl.handbrake = false;
        const sp = veh.speed || 0;
        if (sp < want - 4) { ctl.throttle = U.clamp((want - sp) / 30, 0.3, 1); ctl.brake = false; }
        else if (sp > want + 10) { ctl.throttle = 0; ctl.brake = true; }
        else { ctl.throttle = 0.15; ctl.brake = false; }
        st.chk -= dt;
        if (st.chk <= 0) {
          st.chk = 1;
          const moved = Math.hypot(veh.x - st.x0, veh.y - st.y0); st.x0 = veh.x; st.y0 = veh.y;
          if (moved < 4 && want > 10) {
            st.stuck++; st.rev = 0.7;
            if (st.stuck >= 3 && opts.warp !== false && !N.render.inView(veh.x, veh.y, 30)) { const q = P[Math.min(P.length - 1, st.i + 1)]; warpTo(veh, q, P, st.i + 1); st.stuck = 0; st.i = Math.min(P.length - 1, st.i + 1); }
          } else st.stuck = 0;
        }
      };
      v.drive = st;
      v.controller = ctlFn;
      v.wake();
    });
  }
  function warpTo(v, p, P, i) {
    const f = N.world.findFree(p[0], p[1], 'drive', 20);
    if (!f || N.world.collide(f.x, f.y, v.T.cr + 0.5, 'drive').hit) return false;
    const nx = P && i != null && P[i + 1] ? P[i + 1] : null;
    v.x = f.x; v.y = f.y; v.okX = null; v.vx = v.vy = v.av = 0; v.speed = 0;
    if (nx) v.angle = Math.atan2(nx[1] - f.y, nx[0] - f.x);
    return true;
  }
  function brakeCtl(v) { v.ctl.throttle = 0; v.ctl.steer = 0; v.ctl.brake = true; v.ctl.handbrake = false; }
  function stopDriving(v) { const st = v && v.drive; if (st && st.finish) st.finish(false); if (v) v.drive = null; }

  const V = (N.vehicles = {
    TYPES, list, Vehicle, define, spawn, remove, enter, exit, exitSpot, distTo, TUNE,
    autoSeed: true, seedParked,
    /** debug: let the player drive buses and lorries through the normal ACTION offer */
    allowHeavy: false,
    finds, unlocked,
    roadPath, roadDistance, pathLength, driveTo, stopDriving,
    /** An NPC (Actor) gets on as the driver: no borrow, no meter (N.npcs uses enter too). */
    board(actor, v) { if (!actor || !v || (v.driver && v.driver !== actor)) return false; return enter(actor, v, { quiet: true }); },
    alight(actor, instant) { return exit(actor, instant); },
    /** A second rider drawn behind the driver on a bike: setPillion(v, actor | look | null). */
    setPillion(v, who) { if (v) v.pillion = who || null; return v; },
    /** Kid at the wheel (systems §3.1): is the player driving a car / auto right now? */
    kidAtWheel(v) { v = v || (N.player && N.player.vehicle); return !!(v && v.driver === N.player && (v.T.cls === 'car' || v.T.cls === 'auto')); },
    nakko: nakkoFor,
    /** Flat tyre (systems §5.6): top speed x0.55 until fixed at a cycle shop (N.shops: ₹2). */
    puncture(v) {
      if (!v || v.flat) return false;
      v.flat = true;
      if (N.audio && N.audio.sfx) N.audio.sfx('puncture', { x: v.x, y: v.y });
      if (v.driver === N.player && N.hud) { N.hud.toast('Puncture! *Psssss...* Any cycle shop fixes it for ₹2.', 2800); N.emit('caption', { text: 'tyre hisses', kind: 'self', ms: 1600 }); }
      N.emit('vehicle:puncture', { vehicle: v });
      return true;
    },
    fixPuncture(v) { if (!v || !v.flat) return false; v.flat = false; N.emit('vehicle:fixed', { vehicle: v }); return true; },
    /** The player's own / last ridden pedal cycle within r of (x, y) (for the puncture fix). */
    nearestCycle(x, y, r, pred) {
      let best = null, bd = r == null ? 40 : r;
      for (const v of list) { if (!v.alive || !v.T.pedal || (pred && !pred(v))) continue; const d = distTo(v, x, y); if (d < bd) { bd = d; best = v; } }
      return best;
    },
    /** Nearest vehicle within r of (x, y) by footprint distance (pred optional). */
    nearest(x, y, r, pred) {
      let best = null, bd = r == null ? 30 : r;
      for (const v of N.entities.query(x, y, bd + 34, isVehicle)) {
        if (pred && !pred(v)) continue;
        const d = distTo(v, x, y);
        if (d < bd) { bd = d; best = v; }
      }
      return best;
    },
    clearDecals() { skidN = 0; skidHead = 0; parts.length = 0; },
    skidCount: () => skidN,
    particleCount: () => parts.filter((p) => p.t < p.life).length,
  });

  N.on('game:new', () => { try { seedParked(); } catch (e) { N.err('vehicles.seed', e); } });
  N.on('game:continue', () => { try { if (!list.some((v) => v.alive && v.seeded)) seedParked(); } catch (e) { N.err('vehicles.seed', e); } });

  N.addSystem({
    id: 'vehicles', order: 30, runIn: ['play', 'dialogue', 'cutscene'],
    update,
    draw() {
      const R = N.render;
      if (skidN) R.queue('ground', 1, drawSkids);
      R.queue('actors', R.view.y1 + 400, drawParticles);
      if (glows.length) R.queue('light', 5, drawGlows);
    },
    reset() {
      for (const v of list.slice()) { N.entities.remove(v); }
      list.length = 0;
      V.clearDecals();
      if (zoomOwned) { N.render.baseZoom = 1; zoomOwned = false; }
      if (N.player) N.player.noCollide = false;
      N.input.setLabel('run', null);
    },
  });
})();
